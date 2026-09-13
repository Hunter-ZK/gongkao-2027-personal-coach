from __future__ import annotations
import csv,json,zipfile
from io import StringIO
from pathlib import Path
from fastapi import APIRouter,HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel
from db import query,query_one,transaction,now_iso,jdump,jload,DB_PATH
r=APIRouter(prefix='/api')
BASE=Path(__file__).resolve().parents[1]
class MethodIn(BaseModel):
    name:str;applies_to:str|None=None;source:str|None=None;adoption:str='limited';basis:str|None=None;when_to_use:str|None=None;why_works:str|None=None;when_fails:str|None=None;error_direction:str|None=None;note:str|None=None
class WritingIn(BaseModel):
    written_on:str;prompt_source:str|None=None;question_type:str|None=None;duration_min:int|None=None;word_count:int|None=None;self_score:float|None=None;feedback_md:str|None=None;revision_md:str|None=None;deduction_points:list[str]=[]
class SettingIn(BaseModel): values:dict

def check_method(v):
    if v.get('adoption')=='limited':
        miss=[k for k in ['when_to_use','why_works','when_fails','error_direction'] if not v.get(k)]
        if miss:raise HTTPException(422,'限制采用的方法必须补全：何时用、为何有效、何时失效、误差方向')
@r.get('/methods')
def methods():return query('SELECT * FROM method ORDER BY adoption,name')
@r.post('/methods')
def add_method(x:MethodIn):
    v=x.model_dump();check_method(v)
    with transaction() as c:mid=c.execute('INSERT INTO method(name,applies_to,source,adoption,basis,when_to_use,why_works,when_fails,error_direction,note,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)',(*[v[k] for k in ['name','applies_to','source','adoption','basis','when_to_use','why_works','when_fails','error_direction','note']],now_iso(),now_iso())).lastrowid
    return query_one('SELECT * FROM method WHERE id=?',(mid,))
@r.patch('/methods/{mid}')
def patch_method(mid:int,x:MethodIn):
    old=query_one('SELECT * FROM method WHERE id=?',(mid,));
    if not old:raise HTTPException(404,'方法不存在')
    v={**old,**x.model_dump()};check_method(v)
    vals=x.model_dump();vals['updated_at']=now_iso()
    with transaction() as c:c.execute('UPDATE method SET '+','.join(f'{k}=?' for k in vals)+' WHERE id=?',[*vals.values(),mid])
    return query_one('SELECT * FROM method WHERE id=?',(mid,))
@r.get('/shenlun/writings')
def writings():return query('SELECT * FROM shenlun_writing ORDER BY written_on DESC,id DESC')
@r.post('/shenlun/writings')
def add_writing(x:WritingIn):
    v=x.model_dump();v['deduction_points_json']=jdump(v.pop('deduction_points'))
    with transaction() as c:wid=c.execute('INSERT INTO shenlun_writing(written_on,prompt_source,question_type,duration_min,word_count,self_score,feedback_md,revision_md,deduction_points_json,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)',(*[v[k] for k in ['written_on','prompt_source','question_type','duration_min','word_count','self_score','feedback_md','revision_md','deduction_points_json']],now_iso())).lastrowid
    return query_one('SELECT * FROM shenlun_writing WHERE id=?',(wid,))
@r.get('/settings')
def settings(): return {x['key']:jload(x['value_json']) for x in query('SELECT * FROM setting ORDER BY key')}
@r.put('/settings')
def put_settings(x:SettingIn):
    with transaction() as c:
        for k,v in x.values.items():c.execute('INSERT OR REPLACE INTO setting(key,value_json,updated_at) VALUES(?,?,?)',(k,jdump(v),now_iso()))
    return settings()
@r.get('/progress/charts')
def progress():
    return {'study':query("SELECT study_date,SUM(duration_sec) seconds FROM study_session GROUP BY study_date ORDER BY study_date"),'accuracy':query("SELECT trained_on,total_q,correct_q,source FROM training ORDER BY trained_on,id"),'mastery':query("SELECT state,COUNT(*) count FROM node_mastery GROUP BY state"),'reviews':query("SELECT date(created_at) day,COUNT(*) count,SUM(is_correct) correct FROM review_attempt GROUP BY date(created_at) ORDER BY day")}
@r.post('/export')
def export_data():
    out=BASE/'data'/'exports';out.mkdir(parents=True,exist_ok=True);stamp=now_iso().replace(':','-');z=out/f'backup-{stamp}.zip'
    with zipfile.ZipFile(z,'w',zipfile.ZIP_DEFLATED) as zipf:
        if DB_PATH.exists():zipf.write(DB_PATH,'study.db')
        for table in ['exam','paper_module','knowledge_node','node_mastery','training','question','mistake','review_attempt','study_session','task','method','shenlun_writing']:
            rows=query(f'SELECT * FROM {table}');zipf.writestr(f'json/{table}.json',json.dumps(rows,ensure_ascii=False,indent=2))
        snap={'generated_at':now_iso(),'source':'local_app','note':'用于GitHub版本化备份；SQLite仍是本地运行数据库'};zipf.writestr('snapshot.json',json.dumps(snap,ensure_ascii=False,indent=2))
    return {'export_id':z.name,'filename':z.name}
@r.get('/export/{name}/download')
def download(name:str):
    p=(BASE/'data'/'exports'/Path(name).name)
    if not p.exists():raise HTTPException(404,'导出文件不存在')
    return FileResponse(p,filename=p.name)
