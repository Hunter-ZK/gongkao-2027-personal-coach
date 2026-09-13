from __future__ import annotations
from datetime import date, timedelta
from fastapi import APIRouter, HTTPException, UploadFile, File
from pydantic import BaseModel
from db import query, query_one, transaction, now_iso, jload, jdump
from services.scheduler import next_review_date
from services.error_pattern import refresh_for_mistake
from services.mastery import recompute, degrade_on_error
r=APIRouter(prefix='/api')
CAUSES=['审题错误','主体错误','时间错误','单位错误','题型识别错误','方法选择错误','公式调用错误','推理链遗漏','计算错误','速度问题','取舍问题','知识缺口','方法生疏','偶发失误']
class MPatch(BaseModel):
    cause_primary:str|None=None; cause_secondary:list[str]|None=None; cause_note:str|None=None; standard_solution_md:str|None=None; fastest_solution_md:str|None=None; fastest_conditions:str|None=None; trap:str|None=None; related_node_slugs:list[str]|None=None; status:str|None=None; not_worth_doing:bool|None=None
class ReviewIn(BaseModel): answer:str; duration_sec:int=0; cause_this_time:str|None=None
@r.get('/mistakes')
def mistakes(status:str|None=None,module:str|None=None,due:bool=False):
    wh=[];args=[]
    if status:wh.append('m.status=?');args.append(status)
    if module:wh.append('q.module=?');args.append(module)
    if due:wh.append("(m.next_review_at IS NULL OR date(m.next_review_at)<=date('now'))")
    sql="""SELECT m.*,q.seq,q.module,q.subtype,q.stem_md,q.options_json,q.option_images_json,q.correct_answer,q.user_answer,q.node_slug FROM mistake m JOIN question q ON q.id=m.question_id"""
    rows=query(sql+(' WHERE '+' AND '.join(wh) if wh else '')+' ORDER BY COALESCE(m.next_review_at,m.first_wrong_at),m.id',args)
    for x in rows:x['options']=jload(x['options_json'],{});x['option_images']=jload(x['option_images_json'],{})
    return rows
@r.get('/mistakes/{mid}')
def mistake(mid:int):
    rows=mistakes();x=next((a for a in rows if a['id']==mid),None)
    if not x:raise HTTPException(404,'错题不存在')
    x['reviews']=query('SELECT * FROM review_attempt WHERE mistake_id=? ORDER BY attempt_no',(mid,));return x
@r.patch('/mistakes/{mid}')
def patch_m(mid:int,x:MPatch):
    old=query_one('SELECT * FROM mistake WHERE id=?',(mid,));
    if not old:raise HTTPException(404,'错题不存在')
    vals=x.model_dump(exclude_unset=True)
    if vals.get('cause_primary') is not None and vals['cause_primary'] not in CAUSES:raise HTTPException(422,'错因不在14类枚举中')
    if vals.get('fastest_solution_md') and not vals.get('fastest_conditions',old.get('fastest_conditions')):raise HTTPException(422,'填写最快解法时必须填写适用条件')
    if 'cause_secondary' in vals:vals['cause_secondary_json']=jdump(vals.pop('cause_secondary'))
    if 'related_node_slugs' in vals:vals['related_node_slugs']=jdump(vals.pop('related_node_slugs'))
    if 'not_worth_doing' in vals:vals['not_worth_doing']=int(vals['not_worth_doing'])
    vals['updated_at']=now_iso()
    with transaction() as c:c.execute('UPDATE mistake SET '+','.join(f'{k}=?' for k in vals)+' WHERE id=?',[*vals.values(),mid])
    if vals.get('cause_primary'):refresh_for_mistake(mid)
    return mistake(mid)
@r.get('/error-patterns')
def patterns():return query('SELECT * FROM error_pattern ORDER BY CASE status WHEN \'稳定错误模式\' THEN 0 WHEN \'观察中\' THEN 1 ELSE 2 END,occurrences DESC')
@r.get('/review/queue')
def queue(scope:str='due',module:str|None=None): return mistakes(module=module,due=(scope=='due'))
@r.get('/review/question/{mid}')
def review_question(mid:int):return mistake(mid)
@r.post('/review/{mid}/submit')
def review_submit(mid:int,x:ReviewIn):
    m=mistake(mid);correct=x.answer.strip().upper()==(m.get('correct_answer') or '').strip().upper();attempt=len(m['reviews'])+1
    nextd=next_review_date(int(m.get('review_count') or 0),correct)
    consec=(int(m.get('consecutive_correct') or 0)+1) if correct else 0
    status='已修复' if consec>=2 else '修复中' if correct else '反复错'; reached=int(consec>=2)
    same_cause=None
    if x.cause_this_time and m.get('cause_primary'): same_cause=int(x.cause_this_time==m.get('cause_primary'))
    with transaction() as c:
        c.execute('INSERT INTO review_attempt(mistake_id,attempt_no,answer,is_correct,duration_sec,same_cause_as_before,cause_this_time,reached_fix_standard,created_at) VALUES(?,?,?,?,?,?,?,?,?)',(mid,attempt,x.answer,int(correct),x.duration_sec,same_cause,x.cause_this_time,reached,now_iso()))
        c.execute('UPDATE mistake SET review_count=review_count+1,consecutive_correct=?,last_review_at=?,next_review_at=?,status=?,updated_at=? WHERE id=?',(consec,now_iso(),nextd,status,now_iso(),mid))
    mastery_change=recompute(m['node_slug']) if m.get('node_slug') else None
    if not correct and m.get('node_slug'): mastery_change=degrade_on_error(m['node_slug'],'错题复训再次答错')
    if m.get('cause_primary'):refresh_for_mistake(mid)
    return {'is_correct':correct,'correct_answer':m.get('correct_answer'),'standard_solution_md':m.get('standard_solution_md') or '这道题还没有解法记录','fastest_solution_md':m.get('fastest_solution_md') or '这道题还没有最快解法记录','fastest_conditions':m.get('fastest_conditions'),'cause':m.get('cause_primary'),'same_cause_as_before':same_cause,'node_slugs':[m['node_slug']] if m.get('node_slug') else [],'next_review_at':nextd,'mastery_change':mastery_change}
@r.post('/review/{mid}/paste-image')
async def paste_image(mid:int,file:UploadFile=File(...)):
    from pathlib import Path
    base=Path(__file__).resolve().parents[1]/'data'/'images'/'pasted';base.mkdir(parents=True,exist_ok=True)
    out=base/f'mistake-{mid}-{Path(file.filename or "image.png").name}';out.write_bytes(await file.read())
    q=query_one('SELECT question_id FROM mistake WHERE id=?',(mid,));
    if not q:raise HTTPException(404,'错题不存在')
    old=query_one('SELECT images_json FROM question WHERE id=?',(q['question_id'],));imgs=jload(old['images_json'],[]);imgs.append(str(out.relative_to(Path(__file__).resolve().parents[1])))
    with transaction() as c:c.execute('UPDATE question SET images_json=? WHERE id=?',(jdump(imgs),q['question_id']))
    return {'ok':True,'path':imgs[-1]}
