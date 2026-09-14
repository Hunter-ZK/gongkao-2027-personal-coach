from __future__ import annotations
from datetime import datetime, timezone
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from db import query_one, query, transaction, now_iso, jload
from services.capacity import evaluate

r = APIRouter(prefix='/api')
ACTIVITY = {'知识恢复','刷题训练','限时专项','整卷','错题复训','申论写作','申论批改复盘','背诵记忆','复盘整理'}


class StartIn(BaseModel):
    module: str | None = None
    activity_type: str
    task_id: int | None = None
    task_name: str | None = None


class BeatIn(BaseModel):
    elapsed_sec: int = 0
    paused_sec: int = 0


def _ts(value: str | None):
    if not value:
        return None
    dt = datetime.fromisoformat(value)
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc).astimezone()
    return dt


def _now():
    return datetime.now(timezone.utc).astimezone()


def _effective_pause(st: dict, now: datetime | None = None) -> int:
    total = int(st.get('paused_sec') or 0)
    if st.get('status') == 'paused' and st.get('paused_at'):
        now = now or _now()
        paused_at = _ts(st['paused_at'])
        if paused_at:
            total += max(0, int((now - paused_at).total_seconds()))
    return total


@r.get('/timer/state')
def state():
    st = query_one('SELECT * FROM timer_state WHERE id=1') or {'id': 1, 'status': 'idle'}
    if st.get('status') == 'paused':
        st['paused_sec_live'] = _effective_pause(st)
    else:
        st['paused_sec_live'] = int(st.get('paused_sec') or 0)
    return st


@r.post('/timer/start')
def start(x: StartIn):
    if x.activity_type not in ACTIVITY:
        raise HTTPException(400, '未知学习类型')
    st = state()
    if st.get('status') != 'idle':
        raise HTTPException(409, '已有计时正在进行')
    now = now_iso()
    with transaction() as c:
        c.execute(
            "UPDATE timer_state SET status='running',module=?,activity_type=?,task_id=?,task_name=?,started_at=?,paused_at=NULL,last_beat_at=?,elapsed_sec=0,paused_sec=0 WHERE id=1",
            (x.module, x.activity_type, x.task_id, x.task_name, now, now),
        )
    return state()


@r.post('/timer/pause')
def pause():
    st = state()
    if st.get('status') != 'running':
        raise HTTPException(409, '计时器不在运行状态')
    now = now_iso()
    with transaction() as c:
        c.execute("UPDATE timer_state SET status='paused',paused_at=?,last_beat_at=? WHERE id=1", (now, now))
    return state()


@r.post('/timer/resume')
def resume():
    st = state()
    if st.get('status') != 'paused':
        raise HTTPException(409, '计时器未暂停')
    now_dt = _now()
    paused = _effective_pause(st, now_dt)
    with transaction() as c:
        c.execute(
            "UPDATE timer_state SET status='running',paused_at=NULL,paused_sec=?,last_beat_at=? WHERE id=1",
            (paused, now_dt.isoformat(timespec='seconds')),
        )
    return state()


@r.post('/timer/heartbeat')
def heartbeat(x: BeatIn):
    st = state()
    if st.get('status') == 'idle':
        raise HTTPException(409, '没有进行中的计时')
    paused = _effective_pause(st) if st.get('status') == 'paused' else max(int(st.get('paused_sec') or 0), x.paused_sec)
    with transaction() as c:
        c.execute(
            'UPDATE timer_state SET elapsed_sec=?,paused_sec=?,last_beat_at=? WHERE id=1',
            (max(int(st.get('elapsed_sec') or 0), x.elapsed_sec), paused, now_iso()),
        )
    return state()


@r.post('/timer/discard')
def discard():
    with transaction() as c:
        c.execute("UPDATE timer_state SET status='idle',module=NULL,activity_type=NULL,task_id=NULL,task_name=NULL,started_at=NULL,paused_at=NULL,last_beat_at=NULL,elapsed_sec=0,paused_sec=0 WHERE id=1")
    return {'ok': True}


@r.post('/timer/stop')
def stop():
    st = state()
    if st.get('status') == 'idle':
        raise HTTPException(409, '没有进行中的计时')
    now = _now()
    started = _ts(st.get('started_at')) or now
    paused = _effective_pause(st, now)
    elapsed_from_clock = max(0, int((now - started).total_seconds()) - paused)
    elapsed = max(int(st.get('elapsed_sec') or 0), elapsed_from_clock)
    setting = query_one("SELECT value_json FROM setting WHERE key='deep_threshold_min'")
    deep = int(jload(setting['value_json'], 30) if setting else 30) * 60
    setting = query_one("SELECT value_json FROM setting WHERE key='focus_threshold_min'")
    focus = int(jload(setting['value_json'], 15) if setting else 15) * 60
    category = 'deep' if elapsed >= deep else 'focus' if elapsed >= focus else 'fragment'
    hour = started.hour
    slot = 'morning' if hour < 10 else 'noon' if hour < 14 else 'work_gap' if hour < 18 else 'evening'
    if started.weekday() >= 5:
        slot = 'weekend'
    subject = 'shenlun' if (st.get('module') or '').startswith('申论') or (st.get('activity_type') or '').startswith('申论') else 'xingce'
    with transaction() as c:
        sid = c.execute(
            "INSERT INTO study_session(study_date,start_at,end_at,duration_sec,paused_sec,subject,module,activity_type,task_id,task_name,category,time_slot,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)",
            (started.date().isoformat(), st['started_at'], now.isoformat(timespec='seconds'), elapsed, paused, subject, st.get('module'), st.get('activity_type'), st.get('task_id'), st.get('task_name'), category, slot, now_iso()),
        ).lastrowid
        if st.get('task_id'):
            c.execute("UPDATE task SET actual_minutes=actual_minutes+? WHERE id=?", (round(elapsed / 60), st['task_id']))
        c.execute("UPDATE timer_state SET status='idle',module=NULL,activity_type=NULL,task_id=NULL,task_name=NULL,started_at=NULL,paused_at=NULL,last_beat_at=NULL,elapsed_sec=0,paused_sec=0 WHERE id=1")
    return query_one('SELECT * FROM study_session WHERE id=?', (sid,))


@r.get('/study/daily')
def daily(days: int = 14):
    rows = query(
        "SELECT study_date,category,module,duration_sec FROM study_session WHERE date(study_date)>=date('now',?) ORDER BY study_date",
        (f'-{max(1, days)-1} day',),
    )
    out = {}
    for x in rows:
        d = out.setdefault(x['study_date'], {'date': x['study_date'], 'seconds': 0, 'deep_seconds': 0, 'focus_seconds': 0, 'fragment_seconds': 0, 'count': 0, 'modules': {}})
        d['seconds'] += x['duration_sec']
        d[x['category'] + '_seconds'] += x['duration_sec']
        d['count'] += 1
        key = x.get('module') or '未分类'
        d['modules'][key] = d['modules'].get(key, 0) + x['duration_sec']
    return list(out.values())


@r.get('/study/sessions')
def sessions(limit: int = 100):
    safe_limit = max(1, min(int(limit), 300))
    return query(
        "SELECT id,study_date,start_at,end_at,duration_sec,paused_sec,subject,module,activity_type,task_id,task_name,category,time_slot,created_at FROM study_session ORDER BY datetime(start_at) DESC, id DESC LIMIT ?",
        (safe_limit,),
    )


@r.get('/study/capacity')
def capacity():
    return evaluate()
