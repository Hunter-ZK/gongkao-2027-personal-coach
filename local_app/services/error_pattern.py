from __future__ import annotations
from datetime import datetime
from db import transaction, query_one, query, now_iso, jdump

def _pattern_rows(module, subtype, cause):
    return query("""SELECT m.id,m.first_wrong_at,m.last_review_at,q.id AS question_id,q.training_id,q.node_slug
                    FROM mistake m JOIN question q ON q.id=m.question_id
                    WHERE COALESCE(q.module,'未分类')=?
                      AND COALESCE(q.subtype,'')=COALESCE(?, '')
                      AND m.cause_primary=? AND COALESCE(m.not_worth_doing,0)=0""",(module or '未分类',subtype,cause))

def refresh_for_mistake(mistake_id:int):
    m=query_one("""SELECT m.*,q.module,q.subtype,q.node_slug,q.training_id
                   FROM mistake m JOIN question q ON q.id=m.question_id WHERE m.id=?""",(mistake_id,))
    if not m or not m.get('cause_primary'): return None
    if m.get('cause_primary')=='偶发失误' or int(m.get('not_worth_doing') or 0):
        return None
    module=m.get('module') or '未分类'; subtype=m.get('subtype'); cause=m['cause_primary']; key=f"{module}|{subtype or ''}|{cause}"
    same=_pattern_rows(module,subtype,cause); mids=[x['id'] for x in same]; ids=sorted({x['question_id'] for x in same}); distinct=len({x['training_id'] for x in same if x['training_id']})
    attempts=[]
    if mids:
        marks=','.join('?'*len(mids)); attempts=query(f"SELECT mistake_id,is_correct,created_at FROM review_attempt WHERE mistake_id IN ({marks}) ORDER BY created_at,id",mids)
    wrong_reviews=[x for x in attempts if not x['is_correct']]; occurrences=len(same)+len(wrong_reviews)
    error_times=[x['first_wrong_at'] for x in same if x.get('first_wrong_at')]+[x['created_at'] for x in wrong_reviews if x.get('created_at')]
    first_seen=min(error_times) if error_times else now_iso(); last_error=max(error_times) if error_times else now_iso()
    consecutive_correct=0
    for a in reversed(attempts):
        if a['is_correct']: consecutive_correct+=1
        else: break
    stable_trigger=(occurrences>=3 or distinct>=2); status='候选' if occurrences<=1 and distinct<2 else '观察中'
    if stable_trigger:
        status='稳定错误模式'
        if consecutive_correct>=3: status='修复中'
    node_slug=m.get('node_slug'); timed_runs_without=0
    if status=='修复中' and node_slug:
        candidates=query("""SELECT DISTINCT t.id,t.trained_on FROM training t JOIN question q ON q.training_id=t.id WHERE t.is_timed=1 AND q.verified=1 AND q.node_slug=? AND COALESCE(q.subtype,'')=COALESCE(?, '') AND datetime(t.created_at)>datetime(?)""",(node_slug,subtype,last_error))
        timed_runs_without=len(candidates)
        if timed_runs_without>=2: status='已修复'
    old=query_one("SELECT * FROM error_pattern WHERE pattern_key=?",(key,))
    if old and old.get('status') in ('修复中','已修复'):
        old_last=old.get('last_seen_at') or ''
        if last_error>old_last: status='稳定错误模式';consecutive_correct=0;timed_runs_without=0
    with transaction() as c:
        c.execute("""INSERT INTO error_pattern(pattern_key,module,subtype,cause_primary,node_slug,occurrences,distinct_trainings,consecutive_correct,timed_runs_without,status,first_seen_at,last_seen_at,evidence_question_ids,updated_at)
        VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)
        ON CONFLICT(pattern_key) DO UPDATE SET node_slug=excluded.node_slug,occurrences=excluded.occurrences,distinct_trainings=excluded.distinct_trainings,consecutive_correct=excluded.consecutive_correct,timed_runs_without=excluded.timed_runs_without,status=excluded.status,first_seen_at=excluded.first_seen_at,last_seen_at=excluded.last_seen_at,evidence_question_ids=excluded.evidence_question_ids,updated_at=excluded.updated_at""",(key,module,subtype,cause,node_slug,occurrences,distinct,consecutive_correct,timed_runs_without,status,first_seen,last_error,jdump(ids),now_iso()))
        if status=='稳定错误模式':
            exists=c.execute("SELECT id FROM task WHERE source_rule=? AND status IN ('todo','doing')",(f"error_pattern:{key}",)).fetchone()
            if not exists:
                cur=c.execute("INSERT INTO task(task_date,priority,title,module,reason_md,est_minutes,steps_json,done_criteria_md,node_slugs,status,generated_by,source_rule,created_at) VALUES(date('now'),'P0',?,?,?,?,?,?,?,?,?,?,?)",(f"修复：{module}·{cause}",module,f"同类错误已出现 {occurrences} 次，覆盖 {distinct} 次训练。",45,jdump(["复盘代表错题","回看对应知识节点","做一组同类真题验证"]),"同类题连续3题正确，并在至少2次限时训练中不再复现",jdump([node_slug] if node_slug else []),'todo','auto',f"error_pattern:{key}",now_iso()))
                c.execute("UPDATE error_pattern SET fix_task_id=? WHERE pattern_key=?",(cur.lastrowid,key))
    return query_one("SELECT * FROM error_pattern WHERE pattern_key=?",(key,))
