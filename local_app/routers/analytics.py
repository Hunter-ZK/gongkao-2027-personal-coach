from __future__ import annotations

from collections import defaultdict
from datetime import date, timedelta

from fastapi import APIRouter

from db import query, query_one

r = APIRouter(prefix='/api/analytics', tags=['analytics'])


def _ratio(rows, key='duration_sec'):
    total = sum(float(row.get(key) or 0) for row in rows)
    out = []
    for row in rows:
        value = float(row.get(key) or 0)
        out.append({**row, 'share': value / total if total else 0})
    return out


@r.get('/study')
def study(days: int = 90):
    safe_days = max(7, min(int(days), 365))
    start = (date.today() - timedelta(days=safe_days - 1)).isoformat()
    sessions = query(
        """SELECT id,study_date,start_at,end_at,duration_sec,paused_sec,subject,module,activity_type,
        task_id,task_name,category,time_slot,created_at
        FROM study_session WHERE study_date>=? ORDER BY datetime(start_at) DESC,id DESC""",
        (start,),
    )
    daily_rows = query(
        """SELECT study_date,COUNT(*) sessions,SUM(duration_sec) duration_sec,
        SUM(CASE WHEN category='deep' THEN duration_sec ELSE 0 END) deep_sec,
        SUM(CASE WHEN category='focus' THEN duration_sec ELSE 0 END) focus_sec,
        SUM(CASE WHEN category='fragment' THEN duration_sec ELSE 0 END) fragment_sec
        FROM study_session WHERE study_date>=? GROUP BY study_date ORDER BY study_date""",
        (start,),
    )
    module = _ratio(query(
        "SELECT COALESCE(module,'未分类') label,COUNT(*) sessions,SUM(duration_sec) duration_sec FROM study_session WHERE study_date>=? GROUP BY COALESCE(module,'未分类') ORDER BY duration_sec DESC",
        (start,),
    ))
    activity = _ratio(query(
        "SELECT activity_type label,COUNT(*) sessions,SUM(duration_sec) duration_sec FROM study_session WHERE study_date>=? GROUP BY activity_type ORDER BY duration_sec DESC",
        (start,),
    ))
    category = _ratio(query(
        "SELECT category label,COUNT(*) sessions,SUM(duration_sec) duration_sec FROM study_session WHERE study_date>=? GROUP BY category ORDER BY duration_sec DESC",
        (start,),
    ))
    time_slot = _ratio(query(
        "SELECT COALESCE(time_slot,'未分类') label,COUNT(*) sessions,SUM(duration_sec) duration_sec FROM study_session WHERE study_date>=? GROUP BY COALESCE(time_slot,'未分类') ORDER BY duration_sec DESC",
        (start,),
    ))
    subject = _ratio(query(
        "SELECT subject label,COUNT(*) sessions,SUM(duration_sec) duration_sec FROM study_session WHERE study_date>=? GROUP BY subject ORDER BY duration_sec DESC",
        (start,),
    ))
    total_sec = sum(int(row.get('duration_sec') or 0) for row in sessions)
    deep_sec = sum(int(row.get('duration_sec') or 0) for row in sessions if row.get('category') == 'deep')
    active_days = len({row['study_date'] for row in sessions})
    avg = round(total_sec / len(sessions)) if sessions else 0
    longest = max((int(row.get('duration_sec') or 0) for row in sessions), default=0)
    today_sec = sum(int(row.get('duration_sec') or 0) for row in sessions if row['study_date'] == date.today().isoformat())
    week_start = (date.today() - timedelta(days=date.today().weekday())).isoformat()
    week_sec = sum(int(row.get('duration_sec') or 0) for row in sessions if row['study_date'] >= week_start)
    heatmap = []
    by_day = {row['study_date']: int(row.get('duration_sec') or 0) for row in daily_rows}
    for offset in range(safe_days):
        d = date.fromisoformat(start) + timedelta(days=offset)
        heatmap.append({'date': d.isoformat(), 'seconds': by_day.get(d.isoformat(), 0), 'weekday': d.weekday()})
    return {
        'range_days': safe_days,
        'summary': {
            'total_sec': total_sec,
            'week_sec': week_sec,
            'today_sec': today_sec,
            'deep_sec': deep_sec,
            'deep_ratio': deep_sec / total_sec if total_sec else 0,
            'session_count': len(sessions),
            'active_days': active_days,
            'avg_session_sec': avg,
            'longest_session_sec': longest,
        },
        'daily': daily_rows,
        'module': module,
        'activity': activity,
        'category': category,
        'time_slot': time_slot,
        'subject': subject,
        'heatmap': heatmap,
        'sessions': sessions[:250],
    }


@r.get('/questions')
def questions(days: int = 365):
    safe_days = max(30, min(int(days), 1825))
    start = (date.today() - timedelta(days=safe_days - 1)).isoformat()
    base_where = "qa.is_correct IS NOT NULL AND qa.attempted_on>=?"
    summary = query_one(
        f"""SELECT COUNT(*) attempts,COUNT(DISTINCT qa.bank_id) unique_questions,
        SUM(CASE WHEN qa.is_correct=1 THEN 1 ELSE 0 END) correct,
        SUM(CASE WHEN qa.is_correct=0 THEN 1 ELSE 0 END) wrong,
        SUM(CASE WHEN qa.duration_sec IS NOT NULL AND qa.duration_is_estimated=0 THEN 1 ELSE 0 END) reliable_timed,
        AVG(CASE WHEN qa.duration_sec IS NOT NULL AND qa.duration_is_estimated=0 THEN qa.duration_sec END) avg_seconds
        FROM question_attempt qa WHERE {base_where}""",
        (start,),
    ) or {}
    attempts = int(summary.get('attempts') or 0)
    summary['accuracy'] = (int(summary.get('correct') or 0) / attempts) if attempts else None

    module_rows = query(
        f"""SELECT COALESCE(qb.module,'未分类') label,COUNT(*) attempts,COUNT(DISTINCT qa.bank_id) unique_questions,
        SUM(CASE WHEN qa.is_correct=1 THEN 1 ELSE 0 END) correct,
        SUM(CASE WHEN qa.is_correct=0 THEN 1 ELSE 0 END) wrong,
        AVG(CASE WHEN qa.duration_sec IS NOT NULL AND qa.duration_is_estimated=0 THEN qa.duration_sec END) avg_seconds,
        SUM(CASE WHEN qa.duration_sec IS NOT NULL AND qa.duration_is_estimated=0 THEN 1 ELSE 0 END) reliable_timed
        FROM question_attempt qa JOIN question_bank qb ON qb.id=qa.bank_id
        WHERE {base_where} GROUP BY COALESCE(qb.module,'未分类') ORDER BY attempts DESC""",
        (start,),
    )
    subtype_rows = query(
        f"""SELECT COALESCE(qb.module,'未分类') module,COALESCE(qb.subtype,'未细分') label,
        COUNT(*) attempts,COUNT(DISTINCT qa.bank_id) unique_questions,
        SUM(CASE WHEN qa.is_correct=1 THEN 1 ELSE 0 END) correct,
        SUM(CASE WHEN qa.is_correct=0 THEN 1 ELSE 0 END) wrong,
        AVG(CASE WHEN qa.duration_sec IS NOT NULL AND qa.duration_is_estimated=0 THEN qa.duration_sec END) avg_seconds,
        SUM(CASE WHEN qa.duration_sec IS NOT NULL AND qa.duration_is_estimated=0 THEN 1 ELSE 0 END) reliable_timed
        FROM question_attempt qa JOIN question_bank qb ON qb.id=qa.bank_id
        WHERE {base_where} GROUP BY COALESCE(qb.module,'未分类'),COALESCE(qb.subtype,'未细分')
        ORDER BY attempts DESC""",
        (start,),
    )
    for rows in (module_rows, subtype_rows):
        for row in rows:
            n = int(row.get('attempts') or 0)
            row['accuracy'] = int(row.get('correct') or 0) / n if n else None
            row['sample_level'] = 'stable' if n >= 20 else 'usable' if n >= 8 else 'thin'

    daily = query(
        f"""SELECT attempted_on day,COUNT(*) attempts,SUM(CASE WHEN is_correct=1 THEN 1 ELSE 0 END) correct
        FROM question_attempt qa WHERE {base_where} GROUP BY attempted_on ORDER BY attempted_on""",
        (start,),
    )
    for row in daily:
        row['accuracy'] = int(row.get('correct') or 0) / int(row.get('attempts') or 1)

    ai = query_one(
        """SELECT COUNT(*) requested,
        SUM(CASE WHEN status='done' THEN 1 ELSE 0 END) done,
        SUM(CASE WHEN required=1 THEN 1 ELSE 0 END) required,
        SUM(CASE WHEN required=1 AND status!='done' THEN 1 ELSE 0 END) required_pending
        FROM question_ai_analysis"""
    ) or {'requested': 0, 'done': 0, 'required': 0, 'required_pending': 0}
    mistake = query_one("SELECT COUNT(*) total,SUM(CASE WHEN status IN ('已修复','稳定') THEN 1 ELSE 0 END) repaired FROM mistake") or {}

    # Prioritize useful weakness signals instead of ranking tiny samples as real ability.
    weak = [row for row in subtype_rows if int(row.get('attempts') or 0) >= 5]
    weak.sort(key=lambda row: (row.get('accuracy') if row.get('accuracy') is not None else 1, -int(row.get('attempts') or 0)))
    weak = weak[:10]
    strong = [row for row in subtype_rows if int(row.get('attempts') or 0) >= 8]
    strong.sort(key=lambda row: (-(row.get('accuracy') or 0), -int(row.get('attempts') or 0)))
    strong = strong[:8]

    return {
        'range_days': safe_days,
        'summary': summary,
        'modules': module_rows,
        'subtypes': subtype_rows,
        'daily': daily,
        'weak': weak,
        'strong': strong,
        'ai': ai,
        'mistakes': mistake,
        'method_note': '正确率始终同时展示样本量；少于 8 次只作薄样本提示。速度仅采用非均摊的可靠计时样本。',
    }
