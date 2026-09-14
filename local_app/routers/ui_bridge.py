from __future__ import annotations

from datetime import date, datetime
from pathlib import Path
from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from db import jdump, jload, now_iso, query, query_one, transaction
from routers.plan import criteria
from services.method_library import search_methods
from services.scheduler import generate_daily

r = APIRouter(prefix='/api/ui', tags=['civil-gemini-ui'])
BASE = Path(__file__).resolve().parents[1]
NODES = BASE / 'content' / 'nodes'


MASTER_DB_TO_UI = {
    '未恢复': 'unlearned',
    '已恢复': 'learning',
    '可独立做题': 'recovered',
    '稳定': 'stable',
    '考场稳定': 'mastered',
}
MASTER_UI_TO_DB = {v: k for k, v in MASTER_DB_TO_UI.items()}


def _days_left(value: str | None) -> int:
    if not value:
        return 0
    try:
        return (date.fromisoformat(value) - date.today()).days
    except ValueError:
        return 0


def _setting(key: str, default: Any) -> Any:
    row = query_one("SELECT value_json FROM setting WHERE key=?", (key,))
    return jload(row['value_json'], default) if row else default


def _strip_frontmatter(text: str) -> str:
    if text.startswith('---'):
        end = text.find('\n---', 3)
        if end >= 0:
            return text[end + 4 :].lstrip()
    return text


def _node_content(row: dict) -> str:
    path = row.get('content_path')
    if not path:
        return ''
    full = NODES / path
    if not full.exists():
        return ''
    try:
        return _strip_frontmatter(full.read_text(encoding='utf-8'))
    except OSError:
        return ''


def _module_name(raw: str | None) -> str:
    values = jload(raw, [])
    if isinstance(values, list) and values:
        return str(values[0])
    if isinstance(values, dict) and values:
        return str(next(iter(values.keys())))
    return '综合'


def _option_list(raw: str | None, option_images: str | None = None) -> list[dict]:
    values = jload(raw, {}) or {}
    images = jload(option_images, {}) or {}
    out = []
    for label in 'ABCD':
        if label in values or label in images:
            text = str(values.get(label) or '').strip()
            if not text and images.get(label):
                text = '（图片选项）'
            out.append({'label': label, 'text': text})
    if not out and isinstance(values, dict):
        out = [{'label': str(k), 'text': str(v or '')} for k, v in values.items()]
    return out


def _mistake_ui_status(value: str | None) -> str:
    if value == '已修复':
        return 'fixed'
    if value in {'修复中', '反复错'}:
        return 'reviewing'
    return 'pending'


def _activity_to_ui(value: str | None) -> str:
    mapping = {
        '刷题训练': '真题训练',
        '限时专项': '真题训练',
        '整卷': '模考测试',
        '复盘整理': '总结复盘',
    }
    return mapping.get(value or '', value or '真题训练')


def _current_week_rows() -> tuple[list[dict], dict | None]:
    weeks = query('SELECT * FROM week_plan ORDER BY week_no')
    if not weeks:
        return [], None
    today = date.today()
    current = None
    for row in weeks:
        try:
            if date.fromisoformat(row['start_date']) <= today <= date.fromisoformat(row['end_date']):
                current = row
                break
        except (TypeError, ValueError):
            continue
    current = current or weeks[0]
    ordered = [current] + [x for x in weeks if x['week_no'] != current['week_no']]
    return ordered, current


def _week_plan(row: dict) -> dict:
    sessions = query(
        "SELECT duration_sec,module FROM study_session WHERE date(study_date) BETWEEN date(?) AND date(?)",
        (row['start_date'], row['end_date']),
    )
    actual_hours = round(sum(int(x.get('duration_sec') or 0) for x in sessions) / 3600, 2)
    module_hours: dict[str, float] = {}
    for item in sessions:
        key = item.get('module') or '未分类'
        module_hours[key] = round(module_hours.get(key, 0.0) + int(item.get('duration_sec') or 0) / 3600, 2)
    qrow = query_one(
        """SELECT COUNT(*) n FROM question q JOIN training t ON t.id=q.training_id
           WHERE q.verified=1 AND date(t.trained_on) BETWEEN date(?) AND date(?)""",
        (row['start_date'], row['end_date']),
    ) or {'n': 0}
    recovered = query_one("SELECT COUNT(*) n FROM node_mastery WHERE state!='未恢复'") or {'n': 0}
    target_nodes = query_one("SELECT COUNT(*) n FROM knowledge_node WHERE priority_batch=1") or {'n': 0}
    return {
        'weekNo': row['week_no'],
        'week': f"W{row['week_no']}",
        'startDate': row['start_date'],
        'endDate': row['end_date'],
        'theme': row.get('theme') or '',
        'phase': row.get('phase_code') or '',
        'targetHours': float(row.get('target_hours') or 0),
        'actualHours': actual_hours,
        'targetQuestions': int(row.get('target_questions') or 0),
        'actualQuestions': int(qrow.get('n') or 0),
        'moduleHours': module_hours,
        'milestone': row.get('milestone') or '完成本周计划并以真实训练结果复盘。',
        'completedNodes': int(recovered.get('n') or 0),
        'targetNodes': int(target_nodes.get('n') or 0),
    }


def _exams() -> list[dict]:
    rows = query('SELECT * FROM exam ORDER BY priority')
    return [
        {
            'code': row['code'],
            'name': row['name'],
            'examDate': row.get('exam_date') or '',
            'isOfficial': bool(row.get('is_official')),
            'dateSource': row.get('date_source'),
            'daysLeft': _days_left(row.get('exam_date')),
            'paperMinutes': int(row.get('paper_minutes') or 0),
            'totalQuestions': int(row.get('total_questions') or 0),
            'totalScore': float(row.get('total_score') or 100),
            'targetScore': float(row.get('target_score') or 0),
            'baselineScore': None,
        }
        for row in rows
    ]


def _modules() -> list[dict]:
    rows = query('SELECT * FROM paper_module ORDER BY exam_code,seq')
    out = []
    for row in rows:
        stats = query_one(
            """SELECT COUNT(*) n,SUM(is_correct) ok,
                      AVG(CASE WHEN duration_sec IS NOT NULL AND duration_is_estimated=0 THEN duration_sec END) avg_s
               FROM question WHERE verified=1 AND module=?""",
            (row['name'],),
        ) or {'n': 0, 'ok': 0, 'avg_s': None}
        n = int(stats.get('n') or 0)
        acc = (int(stats.get('ok') or 0) / n) if n else None
        history = query(
            """SELECT s.correct_q,s.total_q FROM training_module_stat s
               JOIN training t ON t.id=s.training_id WHERE s.module=?
               ORDER BY t.trained_on DESC,t.id DESC LIMIT 5""",
            (row['name'],),
        )
        trend = [round(x['correct_q'] / x['total_q'], 4) if x['total_q'] else 0 for x in reversed(history)]
        target_acc = float(row.get('target_accuracy') or 0)
        qualified = bool(n >= 15 and acc is not None and acc >= target_acc)
        gap = '样本不足' if n < 15 else ('已达目标' if qualified else f"距目标还差 {max(0, target_acc - (acc or 0)):.0%}")
        out.append({
            'id': str(row['id']),
            'examCode': row['exam_code'],
            'name': row['name'],
            'seq': int(row['seq']),
            'questionCount': int(row.get('question_count') or 0),
            'scorePerQ': float(row.get('score_per_q') or 0),
            'totalScore': float(row.get('total_score') or 0),
            'targetMinutes': int(row.get('target_minutes') or 0),
            'targetAccuracy': target_acc,
            'currentAccuracy': acc,
            'sampleCount': n,
            'avgSeconds': stats.get('avg_s'),
            'trend': trend,
            'gapText': gap,
            'isQualified': qualified,
        })
    return out


def _phases() -> list[dict]:
    rows = query('SELECT * FROM phase ORDER BY seq')
    out = []
    for row in rows:
        cs = criteria(row['code'])
        out.append({
            'code': row['code'],
            'name': row['name'],
            'seq': int(row['seq']),
            'startWeek': int(row['start_week']),
            'endWeek': int(row['end_week']),
            'goalMd': row.get('goal_md') or '',
            'status': 'completed' if row.get('status') == 'done' else row.get('status') or 'pending',
            'criteria': [
                {
                    'id': str(item['id']),
                    'phaseCode': item['phase_code'],
                    'label': item['label'],
                    'metric': item['metric'],
                    'scope': item.get('scope') or '',
                    'operator': item['operator'],
                    'threshold': float(item['threshold']),
                    'currentVal': float(item.get('current') or 0),
                    'passed': bool(item.get('passed')),
                }
                for item in cs
            ],
        })
    return out


def _knowledge() -> list[dict]:
    rows = query(
        """SELECT k.*,n.state,n.sample_n,n.accuracy,n.avg_seconds
           FROM knowledge_node k LEFT JOIN node_mastery n ON n.node_slug=k.slug
           WHERE k.subject='xingce' ORDER BY k.seq,k.slug"""
    )
    out = []
    for row in rows:
        out.append({
            'slug': row['slug'],
            'title': row['title'],
            'subject': row.get('subject') or 'xingce',
            'module': _module_name(row.get('module_names')),
            'priorityBatch': row.get('priority_batch'),
            'buildStatus': row.get('build_status'),
            'content': _node_content(row),
            'charCount': int(row.get('char_count') or 0),
            'targetSeconds': row.get('target_seconds'),
            'mastery': MASTER_DB_TO_UI.get(row.get('state') or '未恢复', 'unlearned'),
            'sampleN': int(row.get('sample_n') or 0),
            'accuracy': row.get('accuracy'),
        })
    return out


def _methods() -> list[dict]:
    out = []
    for row in search_methods():
        out.append({
            'id': str(row.get('id') or ''),
            'label': str(row.get('id') or ''),
            'title': str(row.get('title') or ''),
            'module': str(row.get('module') or '通用策略'),
            'definition': str(row.get('definition') or ''),
            'principle': str(row.get('principle') or ''),
            'signals': list(row.get('signals') or []),
            'steps': list(row.get('steps') or []),
            'example': str(row.get('example') or ''),
            'boundary': str(row.get('boundary') or ''),
            'callCommand': str(row.get('exam_command') or ''),
        })
    return out


def _training_questions() -> tuple[list[dict], dict[int, dict]]:
    rows = query(
        """SELECT q.*,m.id mistake_id,m.cause_primary,m.cause_note,m.standard_solution_md,m.fastest_solution_md,
                  m.fastest_conditions,m.trap,m.status mistake_status
           FROM question q LEFT JOIN mistake m ON m.question_id=q.id
           WHERE q.training_id IS NOT NULL AND q.verified=1
           ORDER BY q.created_at DESC,q.id DESC"""
    )
    out = []
    by_id = {}
    for row in rows:
        mistake_code = f"EP-{int(row['mistake_id']):03d}" if row.get('mistake_id') else None
        explanation = row.get('explanation_md') or row.get('standard_solution_md') or row.get('fastest_solution_md') or '暂无解析。'
        item = {
            'id': int(row['id']),
            'trainingId': str(row.get('training_id') or ''),
            'seq': int(row.get('seq') or 0),
            'module': row.get('module') or '未分类',
            'subType': row.get('subtype') or '未分类',
            'stem': row.get('stem_md') or '（题干为空）',
            'options': _option_list(row.get('options_json'), row.get('option_images_json')),
            'correctAnswer': row.get('correct_answer') or '',
            'userChoice': row.get('user_answer') or '',
            'isCorrect': None if row.get('is_correct') is None else bool(row.get('is_correct')),
            'durationSec': row.get('duration_sec'),
            'explanation': explanation,
            'errorPattern': mistake_code,
            'nodeSlug': row.get('node_slug'),
        }
        out.append(item)
        by_id[item['id']] = item
    return out, by_id


def _trainings() -> list[dict]:
    rows = query('SELECT * FROM training ORDER BY trained_on DESC,id DESC')
    out = []
    for row in rows:
        mods = query('SELECT * FROM training_module_stat WHERE training_id=? ORDER BY module', (row['id'],))
        qids = [int(x['id']) for x in query('SELECT id FROM question WHERE training_id=? AND verified=1 ORDER BY seq', (row['id'],))]
        total = int(row.get('total_q') or 0)
        correct = int(row.get('correct_q') or 0)
        duration_sec = int(row.get('duration_sec') or 0)
        out.append({
            'id': str(row['id']),
            'date': row['trained_on'],
            'source': row.get('note') or row.get('source') or '训练记录',
            'totalQ': total,
            'correctQ': correct,
            'accuracy': (correct / total) if total else 0,
            'durationMin': round(duration_sec / 60, 1),
            'avgSecPerQ': round(duration_sec / total) if duration_sec and total else 0,
            'note': row.get('note') or '真实训练记录',
            'modules': [
                {
                    'name': m['module'],
                    'total': int(m.get('total_q') or 0),
                    'correct': int(m.get('correct_q') or 0),
                    'accuracy': (int(m.get('correct_q') or 0) / int(m.get('total_q') or 1)) if int(m.get('total_q') or 0) else 0,
                }
                for m in mods
            ],
            'questionIds': qids,
        })
    return out


def _mistakes(question_map: dict[int, dict]) -> list[dict]:
    rows = query(
        """SELECT m.*,q.module,q.stem_md,q.correct_answer,q.user_answer,q.node_slug
           FROM mistake m JOIN question q ON q.id=m.question_id
           ORDER BY COALESCE(m.next_review_at,m.first_wrong_at),m.id"""
    )
    out = []
    for row in rows:
        status = _mistake_ui_status(row.get('status'))
        review_count = int(row.get('review_count') or 0)
        consecutive = int(row.get('consecutive_correct') or 0)
        mastery = 4 if status == 'fixed' else min(3, consecutive + (1 if review_count else 0))
        code = f"EP-{int(row['id']):03d}"
        cause = row.get('cause_primary') or '待确认错因'
        prescription = row.get('fastest_solution_md') or row.get('standard_solution_md') or '等待 AI 解析或人工补充提分处方。'
        out.append({
            'id': int(row['id']),
            'questionId': int(row['question_id']),
            'module': row.get('module') or '未分类',
            'stem': row.get('stem_md') or '（题干为空）',
            'correctAnswer': row.get('correct_answer') or '',
            'userChoice': row.get('user_answer') or '',
            'errorPattern': code,
            'errorPatternName': cause,
            'masteryLevel': mastery,
            'reviewCount': review_count,
            'nextReviewDate': (row.get('next_review_at') or row.get('first_wrong_at') or date.today().isoformat())[:10],
            'lastReviewedAt': (row.get('last_review_at') or '')[:10] or None,
            'reason': row.get('cause_note') or cause,
            'aiPrescription': prescription,
            'status': status,
            'question': question_map.get(int(row['question_id'])),
        })
    return out


def _tasks() -> list[dict]:
    today = date.today().isoformat()
    rows = generate_daily(today)
    out = []
    for row in rows:
        steps = row.get('steps') if isinstance(row.get('steps'), list) else jload(row.get('steps_json'), [])
        nodes = row.get('node_slugs_list') if isinstance(row.get('node_slugs_list'), list) else jload(row.get('node_slugs'), [])
        module = row.get('module') or '综合'
        out.append({
            'id': str(row['id']),
            'date': row['task_date'],
            'priority': row.get('priority') or 'P1',
            'title': row.get('title') or '未命名任务',
            'module': module,
            'reason': row.get('reason_md') or '',
            'estMinutes': int(row.get('est_minutes') or 0),
            'steps': steps,
            'doneCriteria': row.get('done_criteria_md') or '完成并复盘',
            'nodeSlugs': nodes,
            'status': 'done' if row.get('status') == 'done' else 'todo',
            'actionUrl': '/review' if '错题' in module or row.get('priority') == 'P0' else '/knowledge',
        })
    return out


def _sessions() -> list[dict]:
    rows = query(
        """SELECT * FROM study_session ORDER BY datetime(start_at) DESC,id DESC LIMIT 120"""
    )
    out = []
    for row in rows:
        start = row.get('start_at') or ''
        try:
            start_time = datetime.fromisoformat(start).strftime('%H:%M')
        except (TypeError, ValueError):
            start_time = str(start)[11:16] if len(str(start)) >= 16 else ''
        category = row.get('category') or 'fragment'
        out.append({
            'id': str(row['id']),
            'date': row.get('study_date') or str(start)[:10],
            'startTime': start_time,
            'durationSec': int(row.get('duration_sec') or 0),
            'module': row.get('module') or '综合',
            'activityType': _activity_to_ui(row.get('activity_type')),
            'deepStatus': 'deep' if category == 'deep' else 'focus' if category == 'focus' else 'normal',
            'note': row.get('note') or row.get('task_name') or '',
        })
    return out


def _settings(current_week: dict | None) -> dict:
    deep = int(_setting('deep_threshold_min', 30))
    focus = int(_setting('focus_threshold_min', 15))
    return {
        'deepThresholdMin': deep,
        'focusThresholdMin': focus,
        'weeklyTargetHours': float(current_week.get('target_hours') or 22) if current_week else 22,
        'targetScores': {
            'guangdong': {'xingce': 90, 'shenlun': 80},
            'national': {'xingce': 70, 'shenlun': 70},
        },
        'reviewIntervalsDays': [1, 3, 7, 15, 30],
        'zenMode': False,
    }


@r.get('/bootstrap')
def bootstrap():
    week_rows, current_week = _current_week_rows()
    questions, question_map = _training_questions()
    return {
        'exams': _exams(),
        'modules': _modules(),
        'phases': _phases(),
        'weekPlans': [_week_plan(x) for x in week_rows],
        'knowledgeNodes': _knowledge(),
        'methods': _methods(),
        'questions': questions,
        'trainings': _trainings(),
        'mistakes': _mistakes(question_map),
        'tasks': _tasks(),
        'sessions': _sessions(),
        'settings': _settings(current_week),
    }


class MasteryPatch(BaseModel):
    mastery: str


@r.patch('/mastery/{slug}')
def patch_mastery(slug: str, payload: MasteryPatch):
    target = MASTER_UI_TO_DB.get(payload.mastery)
    if not target:
        raise HTTPException(422, '未知掌握状态')
    if not query_one('SELECT slug FROM knowledge_node WHERE slug=?', (slug,)):
        raise HTTPException(404, '知识节点不存在')
    existing = query_one('SELECT state FROM node_mastery WHERE node_slug=?', (slug,))
    old = existing.get('state') if existing else '未恢复'
    closed_book = 0 if target == '未恢复' else 1
    with transaction() as conn:
        conn.execute(
            """INSERT INTO node_mastery(node_slug,state,closed_book_passed,updated_at)
               VALUES(?,?,?,?) ON CONFLICT(node_slug) DO UPDATE SET
               state=excluded.state,closed_book_passed=excluded.closed_book_passed,updated_at=excluded.updated_at""",
            (slug, target, closed_book, now_iso()),
        )
        if old != target:
            conn.execute(
                'INSERT INTO mastery_history(node_slug,from_state,to_state,reason,evidence_json,created_at) VALUES(?,?,?,?,?,?)',
                (slug, old, target, '用户在 Civil Gemini 知识页手动更新掌握状态', jdump({'source': 'ui_manual'}), now_iso()),
            )
    return {'ok': True, 'mastery': payload.mastery, 'db_state': target}


class SessionNotePatch(BaseModel):
    note: str = ''


@r.patch('/session/{sid}/note')
def patch_session_note(sid: int, payload: SessionNotePatch):
    if not query_one('SELECT id FROM study_session WHERE id=?', (sid,)):
        raise HTTPException(404, '学习记录不存在')
    with transaction() as conn:
        conn.execute('UPDATE study_session SET note=? WHERE id=?', (payload.note.strip() or None, sid))
    return {'ok': True}
