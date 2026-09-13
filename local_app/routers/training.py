from __future__ import annotations
import hashlib, json, shutil
from datetime import date, timedelta
from pathlib import Path
from fastapi import APIRouter, HTTPException, UploadFile, File, Form
from pydantic import BaseModel, Field, field_validator
from db import query, query_one, transaction, now_iso, jdump, jload
from parsers.registry import choose
from services.mastery import recompute, degrade_on_error
r=APIRouter(prefix='/api')
BASE=Path(__file__).resolve().parents[1]; UP=BASE/'data'/'uploads'; IM=BASE/'data'/'images'; UP.mkdir(parents=True,exist_ok=True); IM.mkdir(parents=True,exist_ok=True)
class ManualTraining(BaseModel):
    trained_on:str; source:str='other'; exam_type:str='na'; total_q:int; correct_q:int; duration_sec:int=0; note:str|None=None
class QPatch(BaseModel):
    module:str|None=None; subtype:str|None=None; node_slug:str|None=None; stem_md:str|None=None; options:dict|None=None; user_answer:str|None=None; correct_answer:str|None=None; verified:bool|None=None
class ConfirmIn(BaseModel): seq_list:list[int]
class CommitIn(BaseModel):
    trained_on:str
    duration_sec:int=Field(gt=0)
    source:str='fenbi_random'
    exam_type:str='na'
    note:str|None=None
    @field_validator('trained_on')
    @classmethod
    def valid_date(cls,v):
        date.fromisoformat(v); return v
    @field_validator('source')
    @classmethod
    def valid_source(cls,v):
        allowed={'fenbi_random','special','gd_real','national_real','mock','full_paper_gd','full_paper_national','other'}
        if v not in allowed: raise ValueError('未知训练来源')
        return v
class ImageAssign(BaseModel): seq:int; image_id:str; option:str|None=None

@r.get('/trainings')
def trainings(source:str|None=None,exam_type:str|None=None,grouped:bool=True):
    wh=[];args=[]
    if source:wh.append('source=?');args.append(source)
    if exam_type:wh.append('exam_type=?');args.append(exam_type)
    rows=query('SELECT * FROM training'+(' WHERE '+' AND '.join(wh) if wh else '')+' ORDER BY trained_on DESC,id DESC',args)
    if not grouped:return rows
    out={}
    for x in rows:out.setdefault(x['source'],[]).append(x)
    return out
@r.get('/trainings/{tid}')
def training(tid:int):
    x=query_one('SELECT * FROM training WHERE id=?',(tid,))
    if not x:raise HTTPException(404,'训练不存在')
    x['modules']=query('SELECT * FROM training_module_stat WHERE training_id=? ORDER BY module',(tid,));return x
@r.get('/trainings/{tid}/questions')
def training_q(tid:int): return query('SELECT * FROM question WHERE training_id=? ORDER BY seq',(tid,))
@r.post('/trainings')
def create_training(x:ManualTraining):
    with transaction() as c:
        tid=c.execute("INSERT INTO training(trained_on,source,exam_type,total_q,correct_q,duration_sec,data_confidence,note,created_at) VALUES(?,?,?,?,?,?, 'verified',?,?)",(x.trained_on,x.source,x.exam_type,x.total_q,x.correct_q,x.duration_sec,x.note,now_iso())).lastrowid
    return training(tid)

@r.post('/import/pdf')
async def import_pdf(file:UploadFile=File(...)):
    raw=await file.read(); sha=hashlib.sha256(raw).hexdigest()
    old=query_one('SELECT * FROM pdf_import WHERE sha256=?',(sha,))
    if old:return {'duplicate':True,'import_id':old['id'],'status':old['status'],'message':'这份文件已经导入过'}
    safe=Path(file.filename or 'upload.pdf').name; stored=UP/f'{sha[:12]}-{safe}'; stored.write_bytes(raw)
    imgdir=IM/sha[:12]
    try:
        parser=choose(stored); res=parser.parse(stored,imgdir)
    except Exception as e:
        with transaction() as c:
            iid=c.execute("INSERT INTO pdf_import(filename,stored_path,sha256,status,error_message,created_at) VALUES(?,?,?,'failed',?,?)",(safe,str(stored.relative_to(BASE)),sha,str(e),now_iso())).lastrowid
        raise HTTPException(422,f'解析失败：{e}')
    high=sum(1 for q in res.questions if q.confidence>=.85)
    medium=sum(1 for q in res.questions if .70<=q.confidence<.85)
    low=sum(1 for q in res.questions if q.confidence<.70)
    needs=len(res.questions)
    with transaction() as c:
        iid=c.execute("INSERT INTO pdf_import(filename,stored_path,sha256,page_count,parser_name,parser_version,status,total_parsed,needs_review_count,created_at) VALUES(?,?,?,?,?,?,'parsed',?,?,?)",(safe,str(stored.relative_to(BASE)),sha,res.meta.get('page_count'),res.parser_name,res.parser_version,len(res.questions),needs,now_iso())).lastrowid
        mat_db={}
        for m in res.materials:
            mid=c.execute("INSERT INTO material(pdf_import_id,seq,text_md,images_json,created_at) VALUES(?,?,?,?,?)",(iid,m.id,m.text,jdump(m.images),now_iso())).lastrowid;mat_db[m.id]=mid
        for q in res.questions:
            c.execute("""INSERT INTO question(pdf_import_id,material_id,seq,module,subtype,stem_md,images_json,options_json,option_images_json,is_multi_select,user_answer,correct_answer,is_correct,source_type,parse_confidence,parse_signals_json,raw_block,verified,created_at)
            VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,0,?)""",(iid,mat_db.get(q.material_id),q.seq,q.module_guess,q.subtype_guess,q.stem,jdump(q.stem_images),jdump(q.options),jdump(q.option_images),int(q.is_multi_select),q.user_answer,q.correct_answer,(int(q.user_answer==q.correct_answer) if q.user_answer and q.correct_answer else None),'fenbi',q.confidence,jdump(q.signals),q.raw_text,now_iso()))
    return {'duplicate':False,'import_id':iid,'parser':res.parser_name,'total':len(res.questions),'high_confidence':high,'medium_confidence':medium,'low_confidence':low,'needs_review':needs,'warnings':res.warnings,'message':f'共 {len(res.questions)} 题，高置信 {high}，全部 {needs} 题需人工确认'}
@r.get('/import/{iid}/proof')
def proof(iid:int):
    imp=query_one('SELECT * FROM pdf_import WHERE id=?',(iid,))
    if not imp:raise HTTPException(404,'导入记录不存在')
    qs=query('SELECT * FROM question WHERE pdf_import_id=? ORDER BY seq',(iid,))
    for q in qs:
        q['options']=jload(q['options_json'],{});q['option_images']=jload(q['option_images_json'],{});q['images']=jload(q['images_json'],[]);q['signals']=jload(q['parse_signals_json'],{})
    mats=query('SELECT * FROM material WHERE pdf_import_id=? ORDER BY seq',(iid,))
    for m in mats:m['images']=jload(m['images_json'],[])
    return {'import':imp,'questions':qs,'materials':mats,'required_fields':['trained_on','duration_sec','source'],'all_verified':all(q['verified'] for q in qs) if qs else False}
@r.patch('/import/{iid}/question/{seq}')
def patch_q(iid:int,seq:int,x:QPatch):
    q=query_one('SELECT * FROM question WHERE pdf_import_id=? AND seq=?',(iid,seq));
    if not q:raise HTTPException(404,'题目不存在')
    vals=x.model_dump(exclude_unset=True)
    if 'options' in vals:vals['options_json']=jdump(vals.pop('options'))
    if 'verified' in vals:vals['verified']=int(vals['verified'])
    if 'user_answer' in vals or 'correct_answer' in vals:
        ua=vals.get('user_answer',q['user_answer']);ca=vals.get('correct_answer',q['correct_answer']);vals['is_correct']=int(ua==ca) if ua and ca else None
    if vals:
        cols=','.join(f'{k}=?' for k in vals);args=list(vals.values())+[q['id']]
        with transaction() as c:c.execute(f'UPDATE question SET {cols} WHERE id=?',args)
    return proof(iid)
@r.post('/import/{iid}/confirm')
def confirm(iid:int,x:ConfirmIn):
    if not x.seq_list:return {'confirmed':0}
    marks=','.join('?'*len(x.seq_list))
    with transaction() as c:c.execute(f'UPDATE question SET verified=1 WHERE pdf_import_id=? AND seq IN ({marks})',[iid,*x.seq_list])
    return {'confirmed':len(x.seq_list)}
@r.post('/import/{iid}/commit')
def commit(iid:int,x:CommitIn):
    imp=query_one('SELECT * FROM pdf_import WHERE id=?',(iid,));
    if not imp:raise HTTPException(404,'导入记录不存在')
    if imp['status']=='verified':
        t=query_one('SELECT * FROM training WHERE pdf_import_id=?',(iid,));return {'already_committed':True,'training':t}
    qs=query('SELECT * FROM question WHERE pdf_import_id=? ORDER BY seq',(iid,))
    if not qs:raise HTTPException(409,'没有可入库题目')
    un=[q['seq'] for q in qs if not q['verified']]
    if un:raise HTTPException(409,f'还有 {len(un)} 题未确认：{un[:10]}')
    total=len(qs);correct=sum(int(q['is_correct'] or 0) for q in qs)
    with transaction() as c:
        exam_type=x.exam_type; is_full=int(x.source in {'full_paper_gd','full_paper_national'})
        if x.source=='full_paper_gd': exam_type='guangdong'
        elif x.source=='full_paper_national': exam_type='national'
        tid=c.execute("INSERT INTO training(trained_on,source,exam_type,is_timed,is_full_paper,total_q,correct_q,duration_sec,data_confidence,pdf_import_id,note,created_at) VALUES(?,?,?,?,?,?,?,?,'verified',?,?,?)",(x.trained_on,x.source,exam_type,1,is_full,total,correct,x.duration_sec,iid,x.note,now_iso())).lastrowid
        c.execute('UPDATE question SET training_id=? WHERE pdf_import_id=?',(tid,iid))
        mods={}
        for q in qs:
            m=q['module'] or '未分类';v=mods.setdefault(m,[0,0]);v[0]+=1;v[1]+=int(q['is_correct'] or 0)
            if q['is_correct']==0:
                c.execute("INSERT OR IGNORE INTO mistake(question_id,first_wrong_at,cause_primary,next_review_at,status,updated_at) VALUES(?,?,NULL,?,'待复训',?)",(q['id'],x.trained_on,(date.fromisoformat(x.trained_on)+timedelta(days=1)).isoformat(),now_iso()))
        for m,(n,ok) in mods.items():c.execute('INSERT INTO training_module_stat(training_id,module,total_q,correct_q,duration_sec) VALUES(?,?,?,?,?)',(tid,m,n,ok,round(x.duration_sec*n/total) if x.duration_sec else None))
        c.execute("UPDATE pdf_import SET status='verified' WHERE id=?",(iid,))
    nodes={q.get('node_slug') for q in qs if q.get('node_slug')}; wrong_nodes={q.get('node_slug') for q in qs if q.get('node_slug') and q.get('is_correct')==0}
    for slug in nodes: recompute(slug)
    for slug in wrong_nodes: degrade_on_error(slug,'新确认训练中出现同类错误')
    return {'training':training(tid),'mistakes_created':total-correct}
@r.post('/import/{iid}/image/assign')
def image_assign(iid:int,x:ImageAssign): return {'ok':True,'note':'图片归属在校对台保存时写入 option_images_json；当前端点保留契约'}
