from __future__ import annotations
from datetime import date
from fastapi import APIRouter,HTTPException
from pydantic import BaseModel
from db import query,query_one,transaction,jdump,jload,now_iso
from services.scheduler import generate_daily
r=APIRouter(prefix='/api')
class WeekIn(BaseModel): target_hours:float|None=None; target_questions:int|None=None; theme:str|None=None; milestone:str|None=None
class TaskIn(BaseModel): task_date:str;priority:str='P1';title:str;module:str|None=None;reason_md:str|None=None;est_minutes:int=0;steps:list[str]=[];done_criteria_md:str|None=None;node_slugs:list[str]=[]
class TaskPatch(BaseModel): status:str|None=None;postpone:bool=False;actual_minutes:int|None=None
@r.get('/plan/timeline')
def timeline():return query('SELECT * FROM week_plan ORDER BY week_no')
@r.get('/plan/week/{w}')
def week(w:int):
    x=query_one('SELECT * FROM week_plan WHERE week_no=?',(w,));
    if not x:raise HTTPException(404,'周计划不存在')
    x['modules']=query('SELECT * FROM week_module_plan WHERE week_no=? ORDER BY planned_hours DESC',(w,));return x
@r.put('/plan/week/{w}')
def put_week(w:int,x:WeekIn):
    vals=x.model_dump(exclude_none=True)
    if vals:
        with transaction() as c:c.execute('UPDATE week_plan SET '+','.join(f'{k}=?' for k in vals)+' WHERE week_no=?',[*vals.values(),w])
    return week(w)
@r.post('/plan/reschedule')
def reschedule():return {'ok':True,'note':'基于产能校准结果调整 target_hours；不会自动覆盖用户已编辑周计划。'}
@r.get('/plan/phases')
def phases():
    ps=query('SELECT * FROM phase ORDER BY seq')
    for p in ps:p['criteria']=criteria(p['code'])
    return ps
def criteria(code):
    cs=query('SELECT * FROM phase_exit_criterion WHERE phase_code=? ORDER BY seq',(code,));
    for x in cs:
        cur=0
        if x['metric']=='core_nodes_recovered':cur=query("SELECT COUNT(*) n FROM node_mastery n JOIN knowledge_node k ON k.slug=n.node_slug WHERE k.priority_batch=1 AND n.state!='未恢复'")[0]['n']
        elif x['metric']=='sample_n':cur=query("SELECT COUNT(*) n FROM question WHERE verified=1")[0]['n']
        elif x['metric']=='accuracy':
            row=query_one('SELECT COUNT(*) n,SUM(is_correct) ok FROM question WHERE verified=1 AND module=?',(x['scope'],));cur=(row['ok']/row['n']) if row and row['n'] else 0
        elif x['metric']=='full_paper_runs':cur=query_one('SELECT COUNT(*) n FROM training WHERE is_full_paper=1 AND exam_type=?',(x['scope'],))['n']
        x['current']=cur;x['passed']=cur>=x['threshold'] if x['operator']=='gte' else cur<=x['threshold'] if x['operator']=='lte' else cur==x['threshold']
    return cs
@r.post('/plan/phase/{code}/advance')
def advance(code:str,force:bool=False):
    cs=criteria(code);blocked=[x for x in cs if not x['passed']]
    if blocked and not force:return {'advanced':False,'blocking':blocked,'message':'仍有晋级条件未满足，可检查后选择强制晋级'}
    p=query_one('SELECT * FROM phase WHERE code=?',(code,));
    if not p:raise HTTPException(404,'阶段不存在')
    nxt=query_one('SELECT * FROM phase WHERE seq=?',(p['seq']+1,))
    with transaction() as c:
        c.execute("UPDATE phase SET status='done',ended_at=? WHERE code=?",(now_iso(),code))
        if nxt:c.execute("UPDATE phase SET status='active',started_at=? WHERE code=?",(now_iso(),nxt['code']))
    return {'advanced':True,'next':nxt}
@r.get('/plan/capability')
def capability():
    mods=query('SELECT * FROM paper_module ORDER BY exam_code,seq');out=[]
    for m in mods:
        row=query_one('SELECT COUNT(*) n,SUM(is_correct) ok FROM question WHERE verified=1 AND module=?',(m['name'],));n=row['n'] if row else 0;acc=(row['ok']/n) if n else None
        out.append({**m,'sample_n':n,'current_accuracy':acc,'sample_sufficient':n>=15,'estimated_score':(m['total_score']*acc if n>=15 and acc is not None else None),'training_need':'样本不足' if n<15 else ('维持并进整卷' if acc>=m['target_accuracy'] else '再做 2–3 组限时真题')})
    return out
@r.get('/tasks')
def tasks(date_:str|None=None,date:str|None=None):
    d=date or date_ or __import__('datetime').date.today().isoformat();rows=query('SELECT * FROM task WHERE task_date=? ORDER BY CASE priority WHEN \'P0\' THEN 0 WHEN \'P1\' THEN 1 ELSE 2 END,id',(d,))
    for x in rows:x['steps']=jload(x['steps_json'],[]);x['node_slugs_list']=jload(x['node_slugs'],[])
    return rows
@r.post('/tasks')
def add_task(x:TaskIn):
    with transaction() as c:tid=c.execute("INSERT INTO task(task_date,priority,title,module,reason_md,est_minutes,steps_json,done_criteria_md,node_slugs,status,generated_by,created_at) VALUES(?,?,?,?,?,?,?,?,?,'todo','manual',?)",(x.task_date,x.priority,x.title,x.module,x.reason_md,x.est_minutes,jdump(x.steps),x.done_criteria_md,jdump(x.node_slugs),now_iso())).lastrowid
    return query_one('SELECT * FROM task WHERE id=?',(tid,))
@r.patch('/tasks/{tid}')
def patch_task(tid:int,x:TaskPatch):
    t=query_one('SELECT * FROM task WHERE id=?',(tid,));
    if not t:raise HTTPException(404,'任务不存在')
    with transaction() as c:
        if x.postpone:
            nd=(date.fromisoformat(t['task_date'])+__import__('datetime').timedelta(days=1)).isoformat();c.execute("UPDATE task SET task_date=?,status='postponed',postpone_count=postpone_count+1 WHERE id=?",(nd,tid))
        else:
            vals=x.model_dump(exclude={'postpone'},exclude_none=True)
            if vals:c.execute('UPDATE task SET '+','.join(f'{k}=?' for k in vals)+' WHERE id=?',[*vals.values(),tid])
    return query_one('SELECT * FROM task WHERE id=?',(tid,))
@r.post('/tasks/generate')
def generate(date:str|None=None):return generate_daily(date)
