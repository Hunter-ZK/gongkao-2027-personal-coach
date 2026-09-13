from __future__ import annotations
from datetime import date, datetime, timedelta
from fastapi import APIRouter
from db import query,query_one,jload
from services.issues import top_issues
from services.scheduler import generate_daily
from routers.plan import criteria
r=APIRouter(prefix='/api')

def _days(s):
    try:return (date.fromisoformat(s)-date.today()).days
    except:return None

def module_rows(exam):
    mods=query('SELECT * FROM paper_module WHERE exam_code=? ORDER BY seq',(exam,));out=[]
    for m in mods:
        q=query_one('SELECT COUNT(*) n,SUM(is_correct) ok,AVG(CASE WHEN duration_sec IS NOT NULL AND duration_is_estimated=0 THEN duration_sec END) avg_s FROM question WHERE verified=1 AND module=?',(m['name'],)) or {'n':0,'ok':0,'avg_s':None}
        n=q['n'] or 0;acc=(q['ok']/n) if n else None
        trs=query('SELECT t.id,t.trained_on,s.correct_q,s.total_q FROM training_module_stat s JOIN training t ON t.id=s.training_id WHERE s.module=? ORDER BY t.trained_on DESC,t.id DESC LIMIT 5',(m['name'],))
        trend=list(reversed([x['correct_q']/x['total_q'] if x['total_q'] else 0 for x in trs]))
        ms=query("SELECT n.state,COUNT(*) c FROM node_mastery n JOIN knowledge_node k ON k.slug=n.node_slug WHERE k.module_names LIKE ? GROUP BY n.state",(f'%{m["name"]}%',));summary={x['state']:x['c'] for x in ms}
        gap='样本不足，暂不估算' if n<15 else (f"已达目标 {m['target_accuracy']:.0%}" if acc>=m['target_accuracy'] else f"需≥{m['target_accuracy']:.0%}，当前{acc:.1%}")
        out.append({'name':m['name'],'accuracy':acc,'sample_n':n,'sample_sufficient':n>=15,'avg_seconds':q['avg_s'],'avg_seconds_estimated':False,'target_seconds':round(m['target_minutes']*60/max(1,m['question_count'])),'trend':trend,'mastery_summary':summary,'meets_full_paper_standard':bool(n>=15 and acc is not None and acc>=m['target_accuracy']),'gap_text':gap,'risk':None,'question_count':m['question_count'],'count_confidence':m['count_confidence'],'score_confidence':m.get('score_confidence','estimated')})
    return out
@r.get('/dashboard/issues')
def issues():return top_issues()
@r.get('/dashboard')
def dashboard():
    ex=query('SELECT * FROM exam ORDER BY priority')
    exams=[{'code':x['code'],'name':x['name'],'date':x['exam_date'],'days_left':_days(x['exam_date']),'is_official':bool(x['is_official']),'date_source':x['date_source']} for x in ex]
    weeks=query('SELECT * FROM week_plan ORDER BY week_no');today=date.today();cur=1
    timeline=[]
    for w in weeks:
        s=date.fromisoformat(w['start_date']);e=date.fromisoformat(w['end_date']);status='past' if e<today else 'current' if s<=today<=e else 'future'
        if status=='current':cur=w['week_no']
        timeline.append({'no':w['week_no'],'start':w['start_date'],'end':w['end_date'],'theme':w['theme'],'status':status})
    cw=query_one('SELECT * FROM week_plan WHERE week_no=?',(cur,)) or weeks[0]
    start=cw['start_date'];end=cw['end_date']
    sessions=query('SELECT study_date,duration_sec,category FROM study_session WHERE date(study_date) BETWEEN date(?) AND date(?)',(start,end));by={}
    for s in sessions:
        d=by.setdefault(s['study_date'],{'date':s['study_date'],'seconds':0,'deep_seconds':0});d['seconds']+=s['duration_sec'];d['deep_seconds']+=s['duration_sec'] if s['category']=='deep' else 0
    actual=sum(x['duration_sec'] for x in sessions);deep=sum(x['duration_sec'] for x in sessions if x['category']=='deep')
    q=query_one('SELECT COUNT(*) n,SUM(is_correct) ok FROM question q JOIN training t ON t.id=q.training_id WHERE q.verified=1 AND date(t.trained_on) BETWEEN date(?) AND date(?)',(start,end)) or {'n':0,'ok':0}
    due=query_one("SELECT COUNT(*) n FROM mistake WHERE status!='已修复' AND (next_review_at IS NULL OR date(next_review_at)<=date('now'))")['n']
    tasks=generate_daily(today.isoformat())
    ph=query_one("SELECT * FROM phase WHERE status='active' ORDER BY seq LIMIT 1") or query_one("SELECT * FROM phase ORDER BY seq LIMIT 1")
    cs=criteria(ph['code']) if ph else []
    return {'exams':exams,'timeline':{'weeks':timeline,'current_week':cur},'week':{'target_hours':cw['target_hours'],'actual_seconds':actual,'by_day':list(by.values()),'deep_ratio':deep/actual if actual else 0,'questions':q['n'] or 0,'accuracy':(q['ok']/q['n']) if q['n'] else None,'accuracy_note':'含随机练习，不等于整卷','reviews_due':due,'reviews_done':0,'vs_last_week':{}},'phase':{**(ph or {}),'criteria':cs,'can_advance':all(x['passed'] for x in cs) if cs else False,'blocking_count':sum(not x['passed'] for x in cs)},'tasks':tasks,'modules':{'guangdong':module_rows('guangdong'),'national':module_rows('national')},'issues':top_issues()}
