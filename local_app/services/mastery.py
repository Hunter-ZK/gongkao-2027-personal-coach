from __future__ import annotations
from datetime import date, timedelta
from db import transaction, query_one, query, now_iso, jdump, jload
ORDER=["未恢复","已恢复","可独立做题","稳定","考场稳定"]
def _settings():
    row=query_one("SELECT value_json FROM setting WHERE key='mastery'"); return jload(row['value_json'],{}) if row else {}
def _state_index(state:str)->int:
    try:return ORDER.index(state)
    except ValueError:return 0

def recompute(node_slug:str):
    node=query_one("SELECT target_seconds FROM knowledge_node WHERE slug=?",(node_slug,))
    if not node:return None
    prev=query_one("SELECT * FROM node_mastery WHERE node_slug=?",(node_slug,)) or {'state':'未恢复','closed_book_passed':0,'next_test_at':None}
    rows=query("""SELECT q.id,q.is_correct,q.duration_sec,q.duration_is_estimated,q.training_id,t.is_full_paper,t.is_timed,t.trained_on,q.created_at FROM question q LEFT JOIN training t ON t.id=q.training_id WHERE q.node_slug=? AND q.verified=1 AND q.is_correct IS NOT NULL ORDER BY COALESCE(t.trained_on,''),q.id""",(node_slug,))
    n=len(rows); correct=sum(int(r['is_correct']) for r in rows); acc=correct/n if n else None; distinct=len({r['training_id'] for r in rows if r['training_id']})
    exact=[r['duration_sec'] for r in rows if r['duration_sec'] is not None and not r['duration_is_estimated']]; avg=sum(exact)/len(exact) if exact else None
    timed=[r for r in rows if r.get('is_timed') or r.get('is_full_paper')]; timed_sample_n=len(timed); full_ids={r['training_id'] for r in rows if r.get('is_full_paper') and r['training_id']}; full=len(full_ids)
    recent_rows=list(reversed(rows[-10:])) if rows else []; recent_acc=(sum(int(r['is_correct']) for r in recent_rows)/len(recent_rows)) if recent_rows else None
    tr_ids=[]
    for r in reversed(rows):
        tid=r.get('training_id')
        if tid and tid not in tr_ids: tr_ids.append(tid)
        if len(tr_ids)>=2:break
    recent_two_clean=False
    if len(tr_ids)>=2:
        marks=','.join('?'*len(tr_ids)); wrong=query_one(f"SELECT COUNT(*) n FROM question WHERE verified=1 AND node_slug=? AND training_id IN ({marks}) AND is_correct=0",(node_slug,*tr_ids)); recent_two_clean=(wrong['n']==0)
    full_n=full_ok=full_overtime=0
    if full_ids:
        marks=','.join('?'*len(full_ids)); fr=query(f"SELECT is_correct,duration_sec,duration_is_estimated FROM question WHERE verified=1 AND node_slug=? AND training_id IN ({marks})",(node_slug,*full_ids)); full_n=len(fr); full_ok=sum(int(x['is_correct']) for x in fr); target=node.get('target_seconds') or 0
        if target: full_overtime=sum(1 for x in fr if x['duration_sec'] is not None and not x['duration_is_estimated'] and x['duration_sec']>target)
    full_acc=(full_ok/full_n) if full_n else None
    cfg=_settings(); independent_n=int(cfg.get('recovered_min_sample',8)); independent_acc=float(cfg.get('recovered_min_accuracy',.75)); stable_n=int(cfg.get('stable_min_sample',15)); stable_acc=float(cfg.get('stable_min_accuracy',.85)); exam_full=int(cfg.get('exam_stable_min_full_papers',2)); target=node.get('target_seconds'); speed_ok=bool(target and avg is not None and avg<=target)
    state='未恢复'
    if int(prev.get('closed_book_passed') or 0)==1: state='已恢复'
    if state!='未恢复' and n>=independent_n and acc is not None and acc>=independent_acc and distinct>=2: state='可独立做题'
    if state=='可独立做题' and n>=stable_n and acc is not None and acc>=stable_acc and speed_ok and recent_two_clean: state='稳定'
    if state=='稳定' and full>=exam_full and full_acc is not None and full_acc>=stable_acc and full_overtime==0: state='考场稳定'
    evidence={'verified_samples':n,'correct':correct,'accuracy':acc,'recent_accuracy':recent_acc,'distinct_trainings':distinct,'exact_timed_samples':len(exact),'avg_seconds':avg,'target_seconds':target,'speed_ok':speed_ok,'recent_two_trainings_clean':recent_two_clean,'timed_sample_n':timed_sample_n,'full_papers':full,'full_paper_accuracy':full_acc,'full_paper_overtime_count':full_overtime,'closed_book_passed':int(prev.get('closed_book_passed') or 0)}
    with transaction() as c:
        c.execute("""INSERT INTO node_mastery(node_slug,state,sample_n,correct_n,accuracy,recent_accuracy,avg_seconds,timed_sample_n,full_paper_runs,closed_book_passed,distinct_trainings,last_test_at,next_test_at,evidence_json,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(node_slug) DO UPDATE SET state=excluded.state,sample_n=excluded.sample_n,correct_n=excluded.correct_n,accuracy=excluded.accuracy,recent_accuracy=excluded.recent_accuracy,avg_seconds=excluded.avg_seconds,timed_sample_n=excluded.timed_sample_n,full_paper_runs=excluded.full_paper_runs,distinct_trainings=excluded.distinct_trainings,last_test_at=excluded.last_test_at,evidence_json=excluded.evidence_json,updated_at=excluded.updated_at""",(node_slug,state,n,correct,acc,recent_acc,avg,timed_sample_n,full,int(prev.get('closed_book_passed') or 0),distinct,now_iso(),prev.get('next_test_at'),jdump(evidence),now_iso()))
        if prev.get('state')!=state:
            reason=f"闭卷={bool(prev.get('closed_book_passed'))}；已确认样本 {n} 题，正确率 {acc:.1%}" if acc is not None else f"闭卷={bool(prev.get('closed_book_passed'))}；暂无有效样本"
            c.execute("INSERT INTO mastery_history(node_slug,from_state,to_state,reason,evidence_json,created_at) VALUES(?,?,?,?,?,?)",(node_slug,prev.get('state'),state,reason,jdump(evidence),now_iso()))
    return query_one("SELECT * FROM node_mastery WHERE node_slug=?",(node_slug,))

def degrade_on_error(node_slug:str, reason:str='出现同类错误'):
    cur=query_one("SELECT * FROM node_mastery WHERE node_slug=?",(node_slug,))
    if not cur:return None
    old=cur.get('state') or '未恢复'; new=ORDER[max(0,_state_index(old)-1)]; next_day=(date.today()+timedelta(days=1)).isoformat(); ev=jload(cur.get('evidence_json'),{}) or {}; ev['rollback_reason']=reason;ev['rollback_at']=now_iso()
    with transaction() as c:
        c.execute("UPDATE node_mastery SET state=?,next_test_at=?,evidence_json=?,updated_at=? WHERE node_slug=?",(new,next_day,jdump(ev),now_iso(),node_slug))
        if new!=old:c.execute("INSERT INTO mastery_history(node_slug,from_state,to_state,reason,evidence_json,created_at) VALUES(?,?,?,?,?,?)",(node_slug,old,new,reason,jdump(ev),now_iso()))
    return query_one("SELECT * FROM node_mastery WHERE node_slug=?",(node_slug,))
