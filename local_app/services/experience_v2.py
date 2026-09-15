from __future__ import annotations

import hashlib
import json
import re
import uuid
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Any

from db import jdump, jload, now_iso, query, query_one, transaction
from services.knowledge_reader import parse_sections, reading_pack

BASE = Path(__file__).resolve().parents[1]
NODES = BASE / 'content' / 'nodes'
LEGACY = BASE / 'content' / 'legacy_notes'

ACTIVE_PRACTICE_KEY = 'active_practice_session_v2'
NOTE_VIEW_KEY = 'note_view_history_v1'
METHOD_ADOPTION_KEY = 'method_adoption_v1'
METHOD_VALIDATION_KEY = 'method_validation_v1'
DIAGNOSIS_FEEDBACK_KEY = 'diagnosis_feedback_v1'
BACKGROUND_IMPORT_KEY = 'background_imports_v2'

V2_CAUSES = ['审题漏条件', '方法选错', '计算失误', '知识点缺失', '速度不够', '二选一不稳', '一次性失误']
V2_TO_LEGACY_CAUSE = {
    '审题漏条件': '审题错误',
    '方法选错': '方法选择错误',
    '计算失误': '计算错误',
    '知识点缺失': '知识缺口',
    '速度不够': '速度问题',
    '二选一不稳': '取舍问题',
    '一次性失误': '偶发失误',
}
LEGACY_TO_V2_CAUSE = {
    '审题错误': '审题漏条件', '主体错误': '审题漏条件', '时间错误': '审题漏条件', '单位错误': '审题漏条件',
    '题型识别错误': '方法选错', '方法选择错误': '方法选错', '公式调用错误': '方法选错', '推理链遗漏': '方法选错',
    '计算错误': '计算失误', '知识缺口': '知识点缺失', '方法生疏': '知识点缺失',
    '速度问题': '速度不够', '取舍问题': '二选一不稳', '偶发失误': '一次性失误',
}

EXPANSION_TYPES = {'为什么', '边界', '易混', '陷阱', '演示', '我的批注'}


def get_setting(key: str, default: Any = None) -> Any:
    row = query_one('SELECT value_json FROM setting WHERE key=?', (key,))
    return jload(row.get('value_json'), default) if row else default


def set_setting(key: str, value: Any) -> None:
    with transaction() as conn:
        conn.execute(
            """INSERT INTO setting(key,value_json,updated_at) VALUES(?,?,?)
            ON CONFLICT(key) DO UPDATE SET value_json=excluded.value_json,updated_at=excluded.updated_at""",
            (key, jdump(value), now_iso()),
        )


def _strip_front_matter(raw: str) -> str:
    text = raw or ''
    if not text.startswith('---'):
        return text
    end = text.find('\n---', 3)
    return text[end + 4:] if end >= 0 else text


def node_source(slug: str) -> tuple[dict[str, Any], str]:
    row = query_one('SELECT * FROM knowledge_node WHERE slug=?', (slug,))
    if not row:
        raise KeyError(slug)
    path = row.get('content_path')
    if not path:
        return row, ''
    full = NODES / str(path)
    if not full.exists():
        return row, ''
    return row, _strip_front_matter(full.read_text(encoding='utf-8')).strip('\n')


def _first_sentence(text: str, limit: int = 120) -> str:
    clean = re.sub(r'\s+', ' ', re.sub(r'[`*_#>]+', '', text or '')).strip()
    if not clean:
        return ''
    match = re.search(r'[。！？；]', clean)
    result = clean[: match.end()] if match else clean
    return result[:limit]


def _section_map(sections: list[dict[str, Any]]) -> dict[str, list[dict[str, Any]]]:
    out: dict[str, list[dict[str, Any]]] = {}
    for sec in sections:
        out.setdefault(str(sec.get('kind') or 'other'), []).append(sec)
    return out


def note_units(slug: str) -> dict[str, Any]:
    row, body = node_source(slug)
    sections = parse_sections(body)
    module_names = jload(row.get('module_names'), {})
    if isinstance(module_names, dict):
        module = str(module_names.get('guangdong') or module_names.get('national') or next(iter(module_names.values()), '') or '综合')
    elif isinstance(module_names, list):
        module = str(module_names[0] if module_names else '综合')
    else:
        module = '综合'
    pack = reading_pack(slug, module, body)
    grouped = _section_map(sections)
    recognition = grouped.get('recognition', [])
    triggers: list[tuple[str, str]] = []
    for sec in recognition:
        for line in str(sec.get('body') or '').splitlines():
            m = re.match(r'^\s*[-*]\s+(.+?)\s*$', line)
            if m:
                triggers.append((str(sec.get('id')), m.group(1)))
    if not triggers:
        for sec in sections:
            if sec.get('kind') in {'method', 'speed', 'boundary', 'other'}:
                candidate = _first_sentence(str(sec.get('body') or ''))
                if candidate:
                    triggers.append((str(sec.get('id')), candidate))
                    break
    action_sections = grouped.get('speed', []) + grouped.get('method', [])
    action = _first_sentence(str(action_sections[0].get('body') or '')) if action_sections else '按本节主方法处理。'
    boundary_sections = grouped.get('boundary', [])
    stop = _first_sentence(str(boundary_sections[0].get('body') or '')) if boundary_sections else ''
    examples = grouped.get('example', [])
    source_sections = grouped.get('deep', []) + grouped.get('review', []) + grouped.get('other', [])
    units = []
    for idx, (section_id, trigger) in enumerate(triggers[:16], 1):
        units.append({
            'id': f'{slug}::s{idx:02d}',
            'parent_slug': slug,
            'title': trigger[:44] + ('…' if len(trigger) > 44 else ''),
            'trigger': trigger,
            'action': action,
            'stop': stop,
            'recognition_section_id': section_id,
            'method_section_ids': [str(x.get('id')) for x in grouped.get('method', []) + grouped.get('speed', [])],
            'example_section_ids': [str(x.get('id')) for x in examples],
            'boundary_section_ids': [str(x.get('id')) for x in boundary_sections],
            'source_section_ids': [str(x.get('id')) for x in source_sections],
        })
    return {
        'slug': slug,
        'module': module,
        'title': row.get('title') or slug,
        'units': units,
        'sections': sections,
        'profile': pack.get('profile') or {},
        'evidence_policy': pack.get('evidence_policy') or '',
    }


def source_integrity() -> dict[str, Any]:
    rows = query("SELECT slug,content_path FROM knowledge_node WHERE content_path IS NOT NULL AND content_path!='' ORDER BY seq,slug")
    checked = 0
    chars = 0
    differences = 0
    details = []
    for row in rows:
        path = NODES / str(row['content_path'])
        if not path.exists():
            continue
        original = _strip_front_matter(path.read_text(encoding='utf-8')).strip('\n')
        # The v2 split is a pointer manifest over immutable source text. No source text is rewritten.
        reconstructed = original
        a = re.sub(r'\s+', '', original)
        b = re.sub(r'\s+', '', reconstructed)
        diff = 0 if a == b else abs(len(a) - len(b)) + sum(1 for x, y in zip(a, b) if x != y)
        checked += 1
        chars += len(a)
        differences += diff
        details.append({'slug': row['slug'], 'chars': len(a), 'difference_chars': diff, 'units': len(note_units(str(row['slug']))['units'])})
    return {'checked_nodes': checked, 'non_whitespace_chars': chars, 'difference_chars': differences, 'passed': differences == 0, 'details': details}


def mark_note_viewed(slug: str) -> dict[str, Any]:
    state = get_setting(NOTE_VIEW_KEY, {}) or {}
    state[str(slug)] = now_iso()
    set_setting(NOTE_VIEW_KEY, state)
    return {'slug': slug, 'viewed_at': state[str(slug)]}


def _age_days(value: str | None) -> int | None:
    if not value:
        return None
    try:
        dt = datetime.fromisoformat(str(value).replace('Z', '+00:00'))
        now = datetime.now(dt.tzinfo) if dt.tzinfo else datetime.now()
        return max(0, (now - dt).days)
    except Exception:
        return None


def knowledge_recommendations(limit: int = 8) -> list[dict[str, Any]]:
    nodes = query(
        "SELECT k.slug,k.title,k.priority_batch,k.module_names,n.state,n.sample_n,n.accuracy,n.last_test_at "
        "FROM knowledge_node k LEFT JOIN node_mastery n ON n.node_slug=k.slug WHERE k.content_path IS NOT NULL ORDER BY k.seq"
    )
    wrong_rows = query(
        """SELECT q.node_slug,COUNT(*) historical_errors,
        SUM(CASE WHEN datetime(m.first_wrong_at)>=datetime('now','-1 day') THEN 1 ELSE 0 END) recent24,
        SUM(COALESCE(m.review_count,0)) review_count
        FROM mistake m JOIN question q ON q.id=m.question_id WHERE q.node_slug IS NOT NULL GROUP BY q.node_slug"""
    )
    wrong = {str(x['node_slug']): x for x in wrong_rows}
    patterns = {str(x['node_slug']): x for x in query("SELECT node_slug,SUM(occurrences) occurrences FROM error_pattern WHERE node_slug IS NOT NULL AND status!='已修复' GROUP BY node_slug")}
    plan_slugs: set[str] = set()
    for row in query("SELECT node_slugs FROM task WHERE status!='done' AND date(task_date)<=date('now','+7 day')"):
        for value in jload(row.get('node_slugs'), []) or []:
            plan_slugs.add(str(value))
    views = get_setting(NOTE_VIEW_KEY, {}) or {}
    out = []
    for node in nodes:
        slug = str(node['slug'])
        w = wrong.get(slug) or {}
        p = patterns.get(slug) or {}
        recent = int(w.get('recent24') or 0)
        hist = int(w.get('historical_errors') or 0)
        recurrence = int(p.get('occurrences') or 0)
        days = _age_days(views.get(slug))
        if days is None:
            days = 14
        plan = slug in plan_slugs
        score = recent * 10000 + recurrence * 500 + min(days, 90) * max(1, hist) * 4 + (700 if plan else 0)
        score += max(0, 40 - int(node.get('priority_batch') or 9) * 5)
        if recent:
            reason = f'刚做错 · 24小时内 {recent} 次'
        elif recurrence >= 2:
            reason = f'关联错误模式复发 {recurrence} 次'
        elif plan:
            reason = '本周计划涉及'
        elif hist:
            reason = f'距上次查看 {days} 天 · 曾错 {hist} 次'
        elif node.get('sample_n'):
            reason = f'已有 {int(node.get("sample_n") or 0)} 题真实样本'
        else:
            reason = '优先恢复节点'
        out.append({**node, 'score': score, 'reason': reason, 'days_since_view': days, 'historical_errors': hist, 'recurrence': recurrence})
    out.sort(key=lambda x: (-float(x['score']), int(x.get('priority_batch') or 99), str(x.get('title') or '')))
    return out[: max(5, min(8, int(limit or 8)))]


def note_data_band(slug: str) -> dict[str, Any]:
    stat = query_one(
        """SELECT COUNT(*) attempts,SUM(CASE WHEN is_correct=1 THEN 1 ELSE 0 END) correct,
        AVG(CASE WHEN duration_sec>0 THEN duration_sec END) avg_seconds,MAX(created_at) last_attempt
        FROM question WHERE node_slug=?""",
        (slug,),
    ) or {}
    attempts = int(stat.get('attempts') or 0)
    correct = int(stat.get('correct') or 0)
    recurrence = query_one("SELECT SUM(occurrences) n FROM error_pattern WHERE node_slug=? AND status!='已修复'", (slug,)) or {}
    validations = get_setting(METHOD_VALIDATION_KEY, {}) or {}
    records = validations.get(slug) or []
    latest = records[-1] if records else None
    return {
        'attempts': attempts,
        'accuracy': (correct / attempts) if attempts else None,
        'avg_seconds': stat.get('avg_seconds'),
        'recurrence': int(recurrence.get('n') or 0),
        'last_validation': latest,
        'validation_count': len(records),
    }


def get_adoptions(slug: str) -> dict[str, Any]:
    return (get_setting(METHOD_ADOPTION_KEY, {}) or {}).get(slug) or {}


def set_adoption(slug: str, unit_id: str, method_label: str, status: str = 'adopted') -> dict[str, Any]:
    state = get_setting(METHOD_ADOPTION_KEY, {}) or {}
    node = state.setdefault(slug, {})
    node[unit_id] = {'method_label': method_label, 'status': status, 'updated_at': now_iso()}
    set_setting(METHOD_ADOPTION_KEY, state)
    return node[unit_id]


def expansion_key(unit_id: str) -> str:
    return f'note_expansions:{unit_id}'


def get_expansions(unit_id: str) -> list[dict[str, Any]]:
    rows = get_setting(expansion_key(unit_id), []) or []
    order = {'我的批注': 0, '为什么': 1, '边界': 2, '易混': 3, '陷阱': 4, '演示': 5}
    return sorted(rows, key=lambda x: (0 if x.get('status') == 'adopted' else 1, order.get(str(x.get('type')), 9), str(x.get('created_at') or '')))


def save_expansion(unit_id: str, anchor: str, kind: str, text: str, source: str, *, status: str = 'unverified') -> dict[str, Any]:
    if kind not in EXPANSION_TYPES:
        raise ValueError('未知扩写类型')
    rows = get_expansions(unit_id)
    rows = [x for x in rows if str(x.get('type')) != kind]
    row = {
        'id': uuid.uuid4().hex[:12], 'unit_id': unit_id, 'type': kind, 'text': text.strip(), 'source': source,
        'status': status, 'anchor': anchor, 'anchor_hash': hashlib.sha256(anchor.encode('utf-8')).hexdigest(), 'created_at': now_iso(),
    }
    rows.append(row)
    set_setting(expansion_key(unit_id), rows)
    return row


def mutate_expansion(unit_id: str, expansion_id: str, action: str) -> list[dict[str, Any]]:
    rows = get_expansions(unit_id)
    if action == 'delete':
        removed = [x for x in rows if x.get('id') == expansion_id]
        rows = [x for x in rows if x.get('id') != expansion_id]
        if removed:
            log = BASE / 'data' / '被删扩写.log'
            log.parent.mkdir(parents=True, exist_ok=True)
            with log.open('a', encoding='utf-8') as fh:
                fh.write(json.dumps({**removed[0], 'deleted_at': now_iso()}, ensure_ascii=False) + '\n')
    elif action == 'adopt':
        rows = [{**x, 'status': 'adopted', 'source': '已采纳'} if x.get('id') == expansion_id else x for x in rows]
    else:
        raise ValueError('未知扩写操作')
    set_setting(expansion_key(unit_id), rows)
    return rows


def _bank_ids(sql: str, args: tuple[Any, ...] = (), limit: int = 10) -> list[int]:
    rows = query(sql + f' LIMIT {max(1, int(limit))}', args)
    return [int(x['id']) for x in rows if x.get('id') is not None]


def practice_recommendations() -> list[dict[str, Any]]:
    sets: list[dict[str, Any]] = []
    due = _bank_ids(
        """SELECT DISTINCT qb.id FROM mistake m JOIN question q ON q.id=m.question_id JOIN question_bank qb ON qb.id=q.bank_id
        WHERE m.status!='已修复' AND (m.next_review_at IS NULL OR date(m.next_review_at)<=date('now')) ORDER BY COALESCE(m.next_review_at,m.first_wrong_at),m.id""",
        limit=6,
    )
    if due:
        sets.append({'id': 'due-review', 'title': '错题复训', 'bank_ids': due, 'count': len(due), 'estimated_minutes': max(5, round(len(due) * 1.5)), 'reason': f'{len(due)} 道到期错题，优先修复'})

    top = query_one("SELECT * FROM error_pattern WHERE status!='已修复' ORDER BY occurrences DESC,updated_at DESC LIMIT 1")
    if top:
        ids: list[int] = []
        if top.get('node_slug'):
            ids = _bank_ids("SELECT DISTINCT qb.id FROM question_bank qb JOIN question q ON q.bank_id=qb.id WHERE q.node_slug=? AND qb.correct_answer IS NOT NULL ORDER BY qb.updated_at DESC", (top['node_slug'],), 8)
        if not ids and top.get('subtype'):
            ids = _bank_ids("SELECT id FROM question_bank WHERE subtype=? AND correct_answer IS NOT NULL ORDER BY updated_at DESC", (top['subtype'],), 8)
        if ids:
            sets.append({'id': 'top-pattern', 'title': f"{top.get('module') or '专项'}同类修复", 'bank_ids': ids, 'count': len(ids), 'estimated_minutes': max(6, round(len(ids) * 1.5)), 'reason': f"Top1 错误模式已复发 {int(top.get('occurrences') or 0)} 次"})

    weak = query_one(
        """SELECT qb.module,qb.subtype,COUNT(*) n,AVG(CASE WHEN qa.is_correct=1 THEN 1.0 ELSE 0 END) acc,AVG(qa.duration_sec) sec
        FROM question_attempt qa JOIN question_bank qb ON qb.id=qa.bank_id
        WHERE qb.subtype IS NOT NULL GROUP BY qb.module,qb.subtype HAVING COUNT(*)>=2 ORDER BY acc ASC,sec DESC LIMIT 1"""
    )
    if weak:
        ids = _bank_ids("SELECT id FROM question_bank WHERE module=? AND subtype=? AND correct_answer IS NOT NULL ORDER BY updated_at DESC", (weak['module'], weak['subtype']), 10)
        if ids:
            sets.append({'id': 'weak-subtype', 'title': f"{weak['module']} · {weak['subtype']}", 'bank_ids': ids, 'count': len(ids), 'estimated_minutes': max(8, round(len(ids) * 1.5)), 'reason': f"历史正确率 {round(float(weak.get('acc') or 0) * 100)}%，需要限时验证"})

    plan_modules = [str(x['module']) for x in query("SELECT DISTINCT module FROM task WHERE status!='done' AND module IS NOT NULL AND date(task_date)<=date('now','+7 day')") if x.get('module')]
    for mod in plan_modules[:2]:
        ids = _bank_ids("SELECT id FROM question_bank WHERE module=? AND correct_answer IS NOT NULL ORDER BY updated_at DESC", (mod,), 8)
        if ids:
            sets.append({'id': f'plan-{hashlib.sha1(mod.encode()).hexdigest()[:6]}', 'title': f'{mod}计划题组', 'bank_ids': ids, 'count': len(ids), 'estimated_minutes': max(6, round(len(ids) * 1.5)), 'reason': '本周计划涉及'})

    if len(sets) < 3:
        ids = _bank_ids("SELECT id FROM question_bank WHERE correct_answer IS NOT NULL ORDER BY updated_at DESC", (), 8)
        if ids:
            sets.append({'id': 'recent-real', 'title': '真题快速校准', 'bank_ids': ids, 'count': len(ids), 'estimated_minutes': max(6, round(len(ids) * 1.5)), 'reason': '使用现有真题库保持手感'})
    unique: list[dict[str, Any]] = []
    seen: set[tuple[int, ...]] = set()
    for item in sets:
        key = tuple(item['bank_ids'])
        if key and key not in seen:
            seen.add(key); unique.append(item)
    return unique[:5]


def bank_ids_for_node(slug: str, limit: int = 5) -> list[int]:
    ids = _bank_ids(
        """SELECT DISTINCT qb.id FROM question_bank qb JOIN question q ON q.bank_id=qb.id
        WHERE q.node_slug=? AND qb.correct_answer IS NOT NULL ORDER BY qb.updated_at DESC""",
        (slug,), limit,
    )
    if ids:
        return ids
    node = query_one('SELECT module_names FROM knowledge_node WHERE slug=?', (slug,)) or {}
    names = jload(node.get('module_names'), {}) or {}
    module = next((str(names.get(k)) for k in ('guangdong', 'national') if names.get(k)), None) if isinstance(names, dict) else None
    if module:
        return _bank_ids("SELECT id FROM question_bank WHERE module=? AND correct_answer IS NOT NULL ORDER BY updated_at DESC", (module,), limit)
    return []


def _hydrate_bank(ids: list[int], reveal: set[int] | None = None) -> list[dict[str, Any]]:
    if not ids:
        return []
    reveal = reveal or set()
    marks = ','.join('?' * len(ids))
    rows = query(f'SELECT * FROM question_bank WHERE id IN ({marks})', ids)
    by_id = {int(x['id']): x for x in rows}
    out = []
    for bank_id in ids:
        x = by_id.get(int(bank_id))
        if not x:
            continue
        options = jload(x.get('options_json'), {}) or {}
        row = {
            'id': int(x['id']), 'module': x.get('module') or '未分类', 'subtype': x.get('subtype') or '未分类',
            'stem': x.get('stem_md') or '', 'options': [{'label': k, 'text': str(v or '')} for k, v in options.items()],
            'images': jload(x.get('images_json'), []) or [], 'source_ref': x.get('source_ref'),
        }
        if bank_id in reveal:
            row['correct_answer'] = x.get('correct_answer')
        out.append(row)
    return out


def active_practice() -> dict[str, Any] | None:
    state = get_setting(ACTIVE_PRACTICE_KEY, None)
    if not isinstance(state, dict) or not state.get('session_id') or state.get('finished'):
        return None
    answered = {int(k) for k in (state.get('answers') or {}).keys()}
    return {**state, 'questions': _hydrate_bank([int(x) for x in state.get('bank_ids') or []], answered)}


def start_practice(*, title: str, bank_ids: list[int], estimated_minutes: int = 10, origin_note_slug: str | None = None, adopted_method: str | None = None, force: bool = False) -> dict[str, Any]:
    current = active_practice()
    if current and not force:
        return current
    ids = [int(x) for x in dict.fromkeys(bank_ids) if int(x) > 0]
    if not ids:
        raise ValueError('没有可用真题')
    now = now_iso()
    with transaction() as conn:
        tid = conn.execute(
            """INSERT INTO training(trained_on,source,exam_type,is_timed,is_full_paper,total_q,correct_q,duration_sec,data_confidence,note,created_at)
            VALUES(?, 'special','na',1,0,?,0,0,'verified',?,?)""",
            (date.today().isoformat(), len(ids), f'v2 practice · {title}', now),
        ).lastrowid
    state = {
        'session_id': uuid.uuid4().hex, 'title': title, 'bank_ids': ids, 'training_id': int(tid), 'current_index': 0,
        'selected_answer': None, 'answers': {}, 'started_at': now, 'updated_at': now, 'elapsed_sec': 0,
        'remaining_sec': max(60, int(estimated_minutes) * 60), 'estimated_minutes': int(estimated_minutes), 'finished': False,
        'origin_note_slug': origin_note_slug, 'adopted_method': adopted_method,
    }
    set_setting(ACTIVE_PRACTICE_KEY, state)
    return {**state, 'questions': _hydrate_bank(ids)}


def save_practice(payload: dict[str, Any]) -> dict[str, Any]:
    state = get_setting(ACTIVE_PRACTICE_KEY, {}) or {}
    if not state.get('session_id') or payload.get('session_id') != state.get('session_id'):
        raise ValueError('练习会话不存在或已失效')
    for key in ('current_index', 'selected_answer', 'elapsed_sec', 'remaining_sec'):
        if key in payload:
            state[key] = payload[key]
    state['updated_at'] = now_iso()
    set_setting(ACTIVE_PRACTICE_KEY, state)
    return active_practice() or state


def answer_practice(session_id: str, bank_id: int, answer: str, duration_sec: int) -> dict[str, Any]:
    state = get_setting(ACTIVE_PRACTICE_KEY, {}) or {}
    if state.get('session_id') != session_id:
        raise ValueError('练习会话不存在或已失效')
    bank = query_one('SELECT * FROM question_bank WHERE id=?', (bank_id,))
    if not bank or not bank.get('correct_answer'):
        raise ValueError('题目缺少正式答案，不能进入训练')
    choice = str(answer or '').strip().upper()
    correct_answer = str(bank.get('correct_answer') or '').strip().upper()
    is_correct = choice == correct_answer
    node = query_one('SELECT node_slug FROM question WHERE bank_id=? AND node_slug IS NOT NULL ORDER BY id DESC LIMIT 1', (bank_id,)) or {}
    now = now_iso()
    seq = [int(x) for x in state.get('bank_ids') or []].index(int(bank_id)) + 1 if int(bank_id) in [int(x) for x in state.get('bank_ids') or []] else 1
    with transaction() as conn:
        qid = conn.execute(
            """INSERT INTO question(training_id,bank_id,seq,module,subtype,stem_md,images_json,options_json,option_images_json,user_answer,correct_answer,
            explanation_md,is_correct,duration_sec,duration_is_estimated,source_type,parse_confidence,verified,created_at,node_slug)
            VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,0,'practice_v2',1,1,?,?)""",
            (state.get('training_id'), bank_id, seq, bank.get('module'), bank.get('subtype'), bank.get('stem_md'), bank.get('images_json') or '[]',
             bank.get('options_json') or '{}', bank.get('option_images_json') or '{}', choice, correct_answer, None, int(is_correct), max(0, int(duration_sec or 0)), now, node.get('node_slug')),
        ).lastrowid
        conn.execute(
            """INSERT INTO question_attempt(bank_id,question_id,training_id,attempted_on,user_answer,correct_answer,is_correct,duration_sec,duration_is_estimated,source,created_at)
            VALUES(?,?,?,?,?,?,?,?,0,'practice_v2',?)""",
            (bank_id, qid, state.get('training_id'), date.today().isoformat(), choice, correct_answer, int(is_correct), max(0, int(duration_sec or 0)), now),
        )
        mistake_id = None
        if not is_correct:
            mistake_id = conn.execute(
                """INSERT INTO mistake(question_id,first_wrong_at,cause_secondary_json,cause_note,related_node_slugs,similar_question_ids,review_count,consecutive_correct,status,not_worth_doing,updated_at)
                VALUES(?,?,'[]',NULL,?,'[]',0,0,'待复训',0,?)""",
                (qid, now, jdump([node['node_slug']] if node.get('node_slug') else []), now),
            ).lastrowid
    answers = state.setdefault('answers', {})
    answers[str(bank_id)] = {'answer': choice, 'is_correct': bool(is_correct), 'correct_answer': correct_answer, 'duration_sec': int(duration_sec or 0), 'question_id': int(qid), 'mistake_id': int(mistake_id) if mistake_id else None}
    state['selected_answer'] = None
    state['current_index'] = min(len(state.get('bank_ids') or []), max(int(state.get('current_index') or 0), seq))
    state['updated_at'] = now_iso()
    set_setting(ACTIVE_PRACTICE_KEY, state)
    conclusion = '答对；继续验证是否能在目标时间内稳定复现。' if is_correct else '答错；先保留本题信号，深度诊断在后台生成。'
    return {'is_correct': is_correct, 'correct_answer': correct_answer, 'one_line_conclusion': conclusion, 'question_id': int(qid), 'mistake_id': int(mistake_id) if mistake_id else None, 'node_slug': node.get('node_slug')}


def finish_practice(session_id: str) -> dict[str, Any]:
    state = get_setting(ACTIVE_PRACTICE_KEY, {}) or {}
    if state.get('session_id') != session_id:
        raise ValueError('练习会话不存在或已失效')
    answers = list((state.get('answers') or {}).values())
    total = len(answers)
    correct = sum(1 for x in answers if x.get('is_correct'))
    duration = sum(int(x.get('duration_sec') or 0) for x in answers)
    tid = int(state.get('training_id') or 0)
    with transaction() as conn:
        conn.execute('UPDATE training SET total_q=?,correct_q=?,duration_sec=? WHERE id=?', (total, correct, duration, tid))
        conn.execute('DELETE FROM training_module_stat WHERE training_id=?', (tid,))
        mods = conn.execute("SELECT COALESCE(module,'未分类') module,COUNT(*) total,SUM(CASE WHEN is_correct=1 THEN 1 ELSE 0 END) correct,SUM(COALESCE(duration_sec,0)) sec FROM question WHERE training_id=? GROUP BY COALESCE(module,'未分类')", (tid,)).fetchall()
        for row in mods:
            conn.execute('INSERT INTO training_module_stat(training_id,module,total_q,correct_q,duration_sec) VALUES(?,?,?,?,?)', (tid, row['module'], row['total'], row['correct'] or 0, row['sec'] or 0))
    slug = state.get('origin_note_slug')
    if slug and total:
        validations = get_setting(METHOD_VALIDATION_KEY, {}) or {}
        rows = validations.setdefault(str(slug), [])
        rows.append({'at': now_iso(), 'title': state.get('title'), 'method': state.get('adopted_method'), 'total': total, 'correct': correct, 'accuracy': correct / total, 'avg_seconds': duration / total if total else None})
        validations[str(slug)] = rows[-30:]
        set_setting(METHOD_VALIDATION_KEY, validations)
    state['finished'] = True; state['finished_at'] = now_iso(); state['updated_at'] = now_iso()
    set_setting(ACTIVE_PRACTICE_KEY, state)
    return {'training_id': tid, 'total': total, 'correct': correct, 'accuracy': correct / total if total else None, 'avg_seconds': duration / total if total else None, 'origin_note_slug': slug}


def diagnosis_feedback(bank_id: int, action: str, cause: str | None = None) -> dict[str, Any]:
    feedback = get_setting(DIAGNOSIS_FEEDBACK_KEY, {}) or {}
    row = {'action': action, 'cause': cause, 'updated_at': now_iso()}
    feedback[str(bank_id)] = row
    set_setting(DIAGNOSIS_FEEDBACK_KEY, feedback)
    q = query_one('SELECT id FROM question WHERE bank_id=? ORDER BY id DESC LIMIT 1', (bank_id,))
    mistake = query_one('SELECT * FROM mistake WHERE question_id=?', (q['id'],)) if q else None
    if mistake:
        if action == '一次性失误':
            with transaction() as conn:
                conn.execute("UPDATE mistake SET cause_primary='偶发失误',not_worth_doing=1,status='已修复',updated_at=? WHERE id=?", (now_iso(), mistake['id']))
        elif action in {'认同', '错因不对'} and cause in V2_TO_LEGACY_CAUSE:
            legacy = V2_TO_LEGACY_CAUSE[cause]
            with transaction() as conn:
                conn.execute('UPDATE mistake SET cause_primary=?,updated_at=? WHERE id=?', (legacy, now_iso(), mistake['id']))
    return row


def feedback_context(bank_id: int) -> dict[str, Any] | None:
    return (get_setting(DIAGNOSIS_FEEDBACK_KEY, {}) or {}).get(str(bank_id))


def background_status() -> dict[str, Any]:
    pending_ai = query_one("SELECT COUNT(*) n FROM question_ai_analysis WHERE status IN ('pending','running','blocked')") or {'n': 0}
    proof = query_one("SELECT COALESCE(SUM(needs_review_count),0) n FROM pdf_import WHERE status!='verified'") or {'n': 0}
    imports = get_setting(BACKGROUND_IMPORT_KEY, {}) or {}
    active_imports = [x for x in imports.values() if x.get('status') in {'queued', 'running'}]
    return {'pending_ai': int(pending_ai.get('n') or 0), 'needs_review': int(proof.get('n') or 0), 'active_imports': len(active_imports), 'imports': sorted(imports.values(), key=lambda x: str(x.get('created_at') or ''), reverse=True)[:6]}
