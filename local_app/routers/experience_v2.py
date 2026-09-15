from __future__ import annotations

import hashlib
import re
from pathlib import Path
from typing import Any

from fastapi import APIRouter, BackgroundTasks, File, HTTPException, UploadFile
from pydantic import BaseModel, Field

from db import jdump, now_iso, query, query_one, transaction
from parsers.registry import choose
from routers.training import BASE, IM, UP, _image_list, _image_map, _trusted_fenbi_question
from services.experience_v2 import (
    BACKGROUND_IMPORT_KEY,
    EXPANSION_TYPES,
    V2_CAUSES,
    active_practice,
    answer_practice,
    background_status,
    bank_ids_for_node,
    diagnosis_feedback,
    feedback_context,
    finish_practice,
    get_adoptions,
    get_expansions,
    get_setting,
    knowledge_recommendations,
    mark_note_viewed,
    mutate_expansion,
    note_data_band,
    note_units,
    practice_recommendations,
    save_expansion,
    save_practice,
    set_adoption,
    set_setting,
    source_integrity,
    start_practice,
)
from services.gongkao_skill import build_system_prompt, load_secret_config
from services.mistake_ai import _call_deepseek
from services.question_ai import analyze_many_bank_questions, ensure_record, get_analysis

r = APIRouter(prefix='/api/v2', tags=['experience-v2'])


class PracticeStart(BaseModel):
    set_id: str | None = None
    title: str | None = None
    bank_ids: list[int] = Field(default_factory=list)
    node_slug: str | None = None
    limit: int = Field(default=5, ge=1, le=20)
    estimated_minutes: int = Field(default=10, ge=1, le=120)
    force: bool = False
    adopted_method: str | None = None


class PracticeSave(BaseModel):
    session_id: str
    current_index: int | None = None
    selected_answer: str | None = None
    elapsed_sec: int | None = None
    remaining_sec: int | None = None


class PracticeAnswer(BaseModel):
    session_id: str
    bank_id: int
    answer: str
    duration_sec: int = Field(default=0, ge=0, le=3600)


class PracticeFinish(BaseModel):
    session_id: str


class AdoptionIn(BaseModel):
    unit_id: str
    method_label: str
    status: str = 'adopted'


class ExpansionIn(BaseModel):
    unit_id: str
    anchor: str
    type: str
    text: str | None = None


class ExpansionAction(BaseModel):
    unit_id: str
    expansion_id: str
    action: str


class DiagnosisFeedback(BaseModel):
    action: str
    cause: str | None = None


@r.get('/knowledge/recommendations')
def knowledge_recs(limit: int = 8):
    return knowledge_recommendations(limit)


@r.post('/knowledge/{slug}/view')
def knowledge_view(slug: str):
    try:
        return mark_note_viewed(slug)
    except Exception as exc:
        raise HTTPException(422, str(exc)) from exc


@r.get('/knowledge/{slug}/experience')
def knowledge_experience(slug: str):
    try:
        units = note_units(slug)
    except KeyError as exc:
        raise HTTPException(404, '知识节点不存在') from exc
    return {
        **units,
        'data_band': note_data_band(slug),
        'adoptions': get_adoptions(slug),
        'expansions': {u['id']: get_expansions(u['id']) for u in units.get('units') or []},
    }


@r.post('/knowledge/{slug}/adoption')
def adoption(slug: str, x: AdoptionIn):
    if not x.unit_id.startswith(f'{slug}::'):
        raise HTTPException(422, '情形 ID 与知识节点不匹配')
    return set_adoption(slug, x.unit_id, x.method_label, x.status)


def _source_supplement(slug: str, anchor: str) -> str | None:
    candidates = sorted(set(re.findall(r'[\u4e00-\u9fff]{2,8}', anchor or '')), key=len, reverse=True)
    if not candidates:
        return None
    for item in query('SELECT file_name FROM legacy_excerpt WHERE node_slug=?', (slug,)):
        path = BASE / 'content' / 'legacy_notes' / str(item['file_name'])
        if not path.exists():
            continue
        text = path.read_text(encoding='utf-8', errors='ignore')
        pos = next((text.find(word) for word in candidates if text.find(word) >= 0), -1)
        if pos < 0:
            continue
        left = max(0, text.rfind('\n\n', 0, pos))
        right = text.find('\n\n', pos)
        if right < 0:
            right = min(len(text), pos + 320)
        snippet = text[left:right].strip()
        if snippet:
            return snippet[:420]
    return None


def _real_question_demo(slug: str) -> dict[str, Any] | None:
    return query_one(
        """SELECT qb.id,qb.stem_md,qb.options_json,qb.correct_answer,q.explanation_md
        FROM question_bank qb JOIN question q ON q.bank_id=qb.id
        WHERE q.node_slug=? AND qb.correct_answer IS NOT NULL ORDER BY q.id DESC LIMIT 1""",
        (slug,),
    )


def _generate_expansion(slug: str, x: ExpansionIn) -> dict[str, Any]:
    if x.type not in EXPANSION_TYPES:
        raise HTTPException(422, '扩写类型必须是固定六类之一')
    if not x.unit_id.startswith(f'{slug}::'):
        raise HTTPException(422, '情形 ID 与知识节点不匹配')
    if x.type == '我的批注':
        if not (x.text or '').strip():
            raise HTTPException(422, '我的批注不能为空')
        return save_expansion(x.unit_id, x.anchor, x.type, x.text or '', '我自己写的', status='adopted')

    supplement = _source_supplement(slug, x.anchor)
    if supplement and x.type in {'为什么', '边界', '易混', '陷阱'}:
        limits = {'为什么': 150, '边界': 120, '陷阱': 120}
        text = supplement if x.type == '易混' else supplement[: limits.get(x.type, 420)]
        return save_expansion(x.unit_id, x.anchor, x.type, text, '名师原文补充', status='source')

    cfg = load_secret_config()
    if not cfg.get('api_key'):
        raise HTTPException(409, '原始讲义中未找到可直接引用的补充，且 DeepSeek API Key 未配置；本条保持留空。')

    demo = None
    if x.type == '演示':
        demo = _real_question_demo(slug)
        if not demo:
            raise HTTPException(404, '题库里没有与该笔记直接关联的真题，因此不生成“演示”。')
    context = f'知识节点={slug}\n原文锚点={x.anchor}'
    if demo:
        context += f"\n真实题库题目ID={demo['id']}\n题干={demo.get('stem_md') or ''}\n正确答案={demo.get('correct_answer') or ''}\n已有正式解析={demo.get('explanation_md') or ''}"
    system_prompt, _refs = build_system_prompt(f'{slug} {x.anchor}')
    prompt = f"""你在给用户的既有公考名师笔记添加一个独立扩写层。绝对不能改写原文，不能冒充老师原话。
类型：{x.type}
{context}

只返回 JSON：{{"text":"扩写正文"}}。
规则：
1. 第一行直接给信息，不写“综上所述/值得注意/我们可以发现”。
2. 不复述定义；只补原理、失效边界、易混对照、命题陷阱或真题演示。
3. 不确定就返回空字符串；数值阈值无可靠依据时必须标“该阈值未验证”。
4. 演示只能使用上面给出的真实题库题，不得自编题。
5. 不得与原文冲突；若发现存疑，只在边界中说明“存疑，需复核”。
6. 为什么≤150字，边界≤120字，陷阱≤120字；易混用最多4行对比；演示分步骤。
"""
    result = _call_deepseek(system_prompt, prompt)
    text = str(result.get('text') or '').strip()
    if not text:
        raise HTTPException(422, '没有足够可靠的信息生成该扩写，本条保持留空。')
    limits = {'为什么': 150, '边界': 120, '陷阱': 120}
    if x.type in limits and len(text) > limits[x.type]:
        text = text[: limits[x.type]]
    return save_expansion(x.unit_id, x.anchor, x.type, text, 'AI 生成 · 未验证', status='unverified')


@r.post('/knowledge/{slug}/expansion')
def expansion(slug: str, x: ExpansionIn):
    return _generate_expansion(slug, x)


@r.post('/knowledge/expansion/action')
def expansion_action(x: ExpansionAction):
    try:
        return mutate_expansion(x.unit_id, x.expansion_id, x.action)
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc


@r.get('/knowledge/integrity')
def integrity():
    return source_integrity()


@r.get('/practice/recommendations')
def practice_recs():
    return practice_recommendations()


@r.get('/practice/state')
def practice_state():
    return active_practice() or {'active': False}


@r.post('/practice/start')
def practice_start(x: PracticeStart):
    ids = list(x.bank_ids)
    title = x.title or '专项真题训练'
    estimate = x.estimated_minutes
    if x.set_id:
        found = next((item for item in practice_recommendations() if item['id'] == x.set_id), None)
        if not found:
            raise HTTPException(404, '推荐题组已失效，请刷新后重试')
        ids = list(found['bank_ids']); title = found['title']; estimate = int(found['estimated_minutes'])
    if x.node_slug:
        ids = bank_ids_for_node(x.node_slug, x.limit)
        title = x.title or '按这个方法练 5 题'
        estimate = max(5, round(len(ids) * 1.5)) if ids else estimate
    try:
        return start_practice(title=title, bank_ids=ids[: x.limit if x.node_slug else len(ids)], estimated_minutes=estimate, origin_note_slug=x.node_slug, adopted_method=x.adopted_method, force=x.force)
    except ValueError as exc:
        raise HTTPException(409, str(exc)) from exc


@r.post('/practice/save')
def practice_save(x: PracticeSave):
    try:
        return save_practice(x.model_dump(exclude_none=True))
    except ValueError as exc:
        raise HTTPException(409, str(exc)) from exc


def _failure_expansions(slug: str) -> None:
    try:
        pack = note_units(slug)
        unit = (pack.get('units') or [None])[0]
        if not unit:
            return
        for kind in ('为什么', '陷阱'):
            if any(x.get('type') == kind for x in get_expansions(unit['id'])):
                continue
            _generate_expansion(slug, ExpansionIn(unit_id=unit['id'], anchor=unit['trigger'], type=kind))
    except Exception:
        return


@r.post('/practice/answer')
def practice_answer(x: PracticeAnswer, background_tasks: BackgroundTasks):
    try:
        result = answer_practice(x.session_id, x.bank_id, x.answer, x.duration_sec)
    except ValueError as exc:
        raise HTTPException(409, str(exc)) from exc
    ensure_record(x.bank_id, required=not result['is_correct'], question_id=result.get('question_id'))
    background_tasks.add_task(analyze_many_bank_questions, [x.bank_id], required=not result['is_correct'])
    if not result['is_correct'] and result.get('node_slug'):
        background_tasks.add_task(_failure_expansions, result['node_slug'])
    return result


@r.post('/practice/finish')
def practice_finish(x: PracticeFinish):
    try:
        return finish_practice(x.session_id)
    except ValueError as exc:
        raise HTTPException(409, str(exc)) from exc


@r.get('/diagnosis/{bank_id}')
def diagnosis(bank_id: int):
    analysis = get_analysis(bank_id)
    raw = analysis.get('standard_solution_md')
    structured = None
    if isinstance(raw, str) and raw.strip().startswith('{'):
        try:
            import json
            structured = json.loads(raw)
        except Exception:
            structured = None
    if not structured:
        payload = query_one(
            """SELECT m.cause_primary,m.cause_note,m.fastest_solution_md,m.fastest_conditions,m.related_node_slugs,q.stem_md
            FROM question q LEFT JOIN mistake m ON m.question_id=q.id WHERE q.bank_id=? ORDER BY q.id DESC LIMIT 1""",
            (bank_id,),
        ) or {}
        from services.experience_v2 import LEGACY_TO_V2_CAUSE
        structured = {
            '一句话结论': analysis.get('trap') or ('已有历史解析，等待按新结构重新生成。' if analysis.get('status') == 'done' else '深度诊断生成中。'),
            '错因': LEGACY_TO_V2_CAUSE.get(str(payload.get('cause_primary') or ''), '未验证'),
            '识别信号': '',
            '考场动作': payload.get('fastest_solution_md') or '',
            '止损线': payload.get('fastest_conditions') or '',
            '关联笔记': [],
            '验证任务': '同类题 3 道 / 原题 7 天后复做',
            '置信度': '未验证',
        }
    return {'status': analysis.get('status'), 'configured': analysis.get('configured'), 'diagnosis': structured, 'feedback': feedback_context(bank_id), 'message': analysis.get('error_message') or analysis.get('message')}


@r.post('/diagnosis/{bank_id}/feedback')
def diagnosis_feedback_endpoint(bank_id: int, x: DiagnosisFeedback):
    if x.action not in {'认同', '错因不对', '一次性失误'}:
        raise HTTPException(422, '未知反馈动作')
    if x.action == '错因不对' and x.cause not in V2_CAUSES:
        raise HTTPException(422, '请从固定错因枚举中选择')
    return diagnosis_feedback(bank_id, x.action, x.cause)


def _update_import_task(task_id: str, **patch: Any) -> None:
    state = get_setting(BACKGROUND_IMPORT_KEY, {}) or {}
    row = state.setdefault(task_id, {'id': task_id, 'created_at': now_iso()})
    row.update(patch); row['updated_at'] = now_iso()
    state[task_id] = row
    set_setting(BACKGROUND_IMPORT_KEY, state)


def _background_parse(task_id: str, stored_path: str, safe_name: str) -> None:
    stored = Path(stored_path)
    _update_import_task(task_id, status='running', message='正在解析 PDF')
    try:
        raw = stored.read_bytes()
        sha = hashlib.sha256(raw).hexdigest()
        old = query_one('SELECT * FROM pdf_import WHERE sha256=?', (sha,))
        if old:
            _update_import_task(task_id, status='done', import_id=old['id'], duplicate=True, needs_review=old.get('needs_review_count') or 0, message='这份文件已经导入过')
            return
        imgdir = IM / sha[:12]
        parser = choose(stored)
        result = parser.parse(stored, imgdir)
        trusted_flags = [_trusted_fenbi_question(question, result) for question in result.questions]
        needs = sum(1 for trusted in trusted_flags if not trusted)
        with transaction() as conn:
            iid = conn.execute(
                """INSERT INTO pdf_import(filename,stored_path,sha256,page_count,parser_name,parser_version,status,total_parsed,needs_review_count,created_at)
                VALUES(?,?,?,?,?,?,'parsed',?,?,?)""",
                (safe_name, str(stored.relative_to(BASE)), sha, result.meta.get('page_count'), result.parser_name, result.parser_version, len(result.questions), needs, now_iso()),
            ).lastrowid
            material_db = {}
            for material in result.materials:
                mid = conn.execute('INSERT INTO material(pdf_import_id,seq,text_md,images_json,created_at) VALUES(?,?,?,?,?)', (iid, material.id, material.text, jdump(_image_list(material.images)), now_iso())).lastrowid
                material_db[material.id] = mid
            for question, trusted in zip(result.questions, trusted_flags):
                signals = dict(question.signals or {}); signals['auto_verified'] = bool(trusted)
                is_correct = int(question.user_answer == question.correct_answer) if question.user_answer and question.correct_answer else None
                conn.execute(
                    """INSERT INTO question(pdf_import_id,material_id,seq,module,subtype,stem_md,images_json,options_json,option_images_json,is_multi_select,user_answer,correct_answer,is_correct,source_type,parse_confidence,parse_signals_json,raw_block,verified,created_at)
                    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
                    (iid, material_db.get(question.material_id), question.seq, question.module_guess, question.subtype_guess, question.stem,
                     jdump(_image_list(question.stem_images)), jdump(question.options), jdump(_image_map(question.option_images)), int(question.is_multi_select),
                     question.user_answer, question.correct_answer, is_correct, 'fenbi', question.confidence, jdump(signals), question.raw_text, int(trusted), now_iso()),
                )
        _update_import_task(task_id, status='done', import_id=iid, duplicate=False, total=len(result.questions), verified_count=len(result.questions)-needs, needs_review=needs, message=f'解析完成：{len(result.questions)} 题，{needs} 题待校对')
    except Exception as exc:
        _update_import_task(task_id, status='failed', message=str(exc)[:500])


@r.post('/import/pdf')
async def background_import(background_tasks: BackgroundTasks, file: UploadFile = File(...)):
    safe = Path(file.filename or 'upload.pdf').name
    if not safe.lower().endswith('.pdf'):
        raise HTTPException(422, '这里只接受 PDF 文件')
    raw = await file.read()
    task_id = hashlib.sha1((safe + now_iso()).encode('utf-8')).hexdigest()[:14]
    stored = UP / f'queued-{task_id}-{safe}'
    stored.write_bytes(raw)
    _update_import_task(task_id, status='queued', filename=safe, message='已进入后台解析队列')
    background_tasks.add_task(_background_parse, task_id, str(stored), safe)
    return {'task_id': task_id, 'status': 'queued', 'message': '文件已接收；后台解析不会阻断学习。'}


@r.get('/background/status')
def background_status_endpoint():
    return background_status()
