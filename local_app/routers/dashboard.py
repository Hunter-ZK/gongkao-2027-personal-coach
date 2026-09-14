from __future__ import annotations

from datetime import date

from fastapi import APIRouter

from db import jload, query, query_one
from routers.plan import criteria
from services.issues import top_issues
from services.scheduler import generate_daily

r = APIRouter(prefix='/api')


def _days(value: str | None) -> int | None:
    if not value:
        return None
    try:
        return (date.fromisoformat(value) - date.today()).days
    except ValueError:
        return None


def module_rows(exam: str) -> list[dict]:
    modules = query('SELECT * FROM paper_module WHERE exam_code=? ORDER BY seq', (exam,))
    out: list[dict] = []
    for module in modules:
        stats = query_one(
            """SELECT COUNT(*) n,
                      SUM(is_correct) ok,
                      AVG(CASE WHEN duration_sec IS NOT NULL AND duration_is_estimated=0
                               THEN duration_sec END) avg_s
               FROM question
               WHERE verified=1 AND module=?""",
            (module['name'],),
        ) or {'n': 0, 'ok': 0, 'avg_s': None}
        sample_n = stats['n'] or 0
        accuracy = (stats['ok'] / sample_n) if sample_n else None
        trainings = query(
            """SELECT t.id,t.trained_on,s.correct_q,s.total_q
               FROM training_module_stat s
               JOIN training t ON t.id=s.training_id
               WHERE s.module=?
               ORDER BY t.trained_on DESC,t.id DESC
               LIMIT 5""",
            (module['name'],),
        )
        trend = list(
            reversed(
                [row['correct_q'] / row['total_q'] if row['total_q'] else 0 for row in trainings]
            )
        )
        mastery_rows = query(
            """SELECT n.state,COUNT(*) c
               FROM node_mastery n
               JOIN knowledge_node k ON k.slug=n.node_slug
               WHERE k.module_names LIKE ?
               GROUP BY n.state""",
            (f'%{module["name"]}%',),
        )
        mastery_summary = {row['state']: row['c'] for row in mastery_rows}
        if sample_n < 15:
            gap = '样本不足，暂不估算'
        elif accuracy is not None and accuracy >= module['target_accuracy']:
            gap = f"已达目标 {module['target_accuracy']:.0%}"
        else:
            gap = f"需≥{module['target_accuracy']:.0%}，当前{accuracy:.1%}"
        out.append(
            {
                'name': module['name'],
                'accuracy': accuracy,
                'sample_n': sample_n,
                'sample_sufficient': sample_n >= 15,
                'avg_seconds': stats['avg_s'],
                'avg_seconds_estimated': False,
                'target_seconds': round(
                    module['target_minutes'] * 60 / max(1, module['question_count'])
                ),
                'target_accuracy': module['target_accuracy'],
                'trend': trend,
                'mastery_summary': mastery_summary,
                'meets_full_paper_standard': bool(
                    sample_n >= 15
                    and accuracy is not None
                    and accuracy >= module['target_accuracy']
                ),
                'gap_text': gap,
                'risk': None,
                'question_count': module['question_count'],
                'count_confidence': module['count_confidence'],
                'score_confidence': module.get('score_confidence', 'estimated'),
            }
        )
    return out


@r.get('/dashboard/issues')
def issues():
    return top_issues()


def _empty_dashboard(exams: list[dict]) -> dict:
    return {
        'initialized': False,
        'initialization_message': '尚未初始化学习数据，请先运行 seed。',
        'exams': exams,
        'timeline': {'weeks': [], 'current_week': None},
        'week': {
            'target_hours': 0,
            'actual_seconds': 0,
            'by_day': [],
            'deep_ratio': 0,
            'questions': 0,
            'accuracy': None,
            'accuracy_note': '尚无训练数据',
            'reviews_due': 0,
            'reviews_done': 0,
            'vs_last_week': {},
        },
        'phase': {'criteria': [], 'can_advance': False, 'blocking_count': 0},
        'tasks': [],
        'modules': {
            'guangdong': module_rows('guangdong'),
            'national': module_rows('national'),
        },
        'issues': [],
    }


@r.get('/dashboard')
def dashboard():
    exam_rows = query('SELECT * FROM exam ORDER BY priority')
    exams = [
        {
            'code': row['code'],
            'name': row['name'],
            'date': row['exam_date'],
            'days_left': _days(row['exam_date']),
            'is_official': bool(row['is_official']),
            'date_source': row['date_source'],
        }
        for row in exam_rows
    ]

    weeks = query('SELECT * FROM week_plan ORDER BY week_no')
    if not weeks:
        return _empty_dashboard(exams)

    today = date.today()
    current_week = weeks[0]['week_no']
    timeline = []
    for week in weeks:
        start_date = date.fromisoformat(week['start_date'])
        end_date = date.fromisoformat(week['end_date'])
        if end_date < today:
            status = 'past'
        elif start_date <= today <= end_date:
            status = 'current'
            current_week = week['week_no']
        else:
            status = 'future'
        timeline.append(
            {
                'no': week['week_no'],
                'start': week['start_date'],
                'end': week['end_date'],
                'theme': week['theme'],
                'status': status,
            }
        )

    current = query_one('SELECT * FROM week_plan WHERE week_no=?', (current_week,)) or weeks[0]
    start = current['start_date']
    end = current['end_date']
    sessions = query(
        """SELECT study_date,duration_sec,category
           FROM study_session
           WHERE date(study_date) BETWEEN date(?) AND date(?)""",
        (start, end),
    )
    by_day: dict[str, dict] = {}
    for session in sessions:
        day = by_day.setdefault(
            session['study_date'],
            {'date': session['study_date'], 'seconds': 0, 'deep_seconds': 0},
        )
        day['seconds'] += session['duration_sec']
        if session['category'] == 'deep':
            day['deep_seconds'] += session['duration_sec']

    actual = sum(row['duration_sec'] for row in sessions)
    deep = sum(row['duration_sec'] for row in sessions if row['category'] == 'deep')
    q_stats = query_one(
        """SELECT COUNT(*) n,SUM(is_correct) ok
           FROM question q
           JOIN training t ON t.id=q.training_id
           WHERE q.verified=1
             AND date(t.trained_on) BETWEEN date(?) AND date(?)""",
        (start, end),
    ) or {'n': 0, 'ok': 0}
    due_row = query_one(
        """SELECT COUNT(*) n
           FROM mistake
           WHERE status!='已修复'
             AND (next_review_at IS NULL OR date(next_review_at)<=date('now'))"""
    ) or {'n': 0}
    tasks = generate_daily(today.isoformat())
    phase = query_one("SELECT * FROM phase WHERE status='active' ORDER BY seq LIMIT 1")
    if not phase:
        phase = query_one('SELECT * FROM phase ORDER BY seq LIMIT 1')
    phase_criteria = criteria(phase['code']) if phase else []

    return {
        'initialized': True,
        'exams': exams,
        'timeline': {'weeks': timeline, 'current_week': current_week},
        'week': {
            'target_hours': current['target_hours'],
            'actual_seconds': actual,
            'by_day': list(by_day.values()),
            'deep_ratio': deep / actual if actual else 0,
            'questions': q_stats['n'] or 0,
            'accuracy': (q_stats['ok'] / q_stats['n']) if q_stats['n'] else None,
            'accuracy_note': '含随机练习，不等于整卷',
            'reviews_due': due_row['n'] or 0,
            'reviews_done': 0,
            'vs_last_week': {},
        },
        'phase': {
            **(phase or {}),
            'criteria': phase_criteria,
            'can_advance': all(item['passed'] for item in phase_criteria) if phase_criteria else False,
            'blocking_count': sum(not item['passed'] for item in phase_criteria),
        },
        'tasks': tasks,
        'modules': {
            'guangdong': module_rows('guangdong'),
            'national': module_rows('national'),
        },
        'issues': top_issues(),
    }
