from __future__ import annotations
import sys, threading, webbrowser
from datetime import date
from pathlib import Path
from fastapi import FastAPI, Request
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from db import migrate, query, query_one
from routers import dashboard,timer,training,mistakes,knowledge,plan,misc,coach
BASE=Path(__file__).resolve().parent
migrate()
app=FastAPI(title='2027 公考个人备考工作台',version='1.1.0')
app.mount('/static',StaticFiles(directory=BASE/'static'),name='static')
app.mount('/data-images',StaticFiles(directory=BASE/'data'/'images'),name='data-images')
templates=Jinja2Templates(directory=BASE/'templates')
for router in [dashboard.r,timer.r,training.r,mistakes.r,knowledge.r,plan.r,misc.r,coach.r]:app.include_router(router)
@app.get('/health')
def health():return {'ok':True,'service':'gongkao-workbench','version':'1.1.0'}
@app.exception_handler(Exception)
async def err(req:Request,exc:Exception):
    from fastapi import HTTPException
    if isinstance(exc,HTTPException):return JSONResponse({'error':{'code':str(exc.status_code),'message':str(exc.detail)}},status_code=exc.status_code)
    return JSONResponse({'error':{'code':'internal_error','message':str(exc)}},status_code=500)
PAGES={'/':'总览','/today':'今日任务','/timer':'学习计时','/trainings':'训练记录','/mistakes':'错题本','/review':'错题复训','/import':'导入','/knowledge':'行测体系','/shenlun':'申论体系','/coach':'AI方法教练','/plan':'备考规划','/progress':'能力趋势','/methods':'方法与结论','/settings':'设置'}
@app.get('/{path:path}',response_class=HTMLResponse)
def shell(request:Request,path:str=''):
    p='/' + path if path else '/'
    if p not in PAGES and not p.startswith('/knowledge/'):p='/'
    ex=query('SELECT code,name,exam_date,is_official,date_source FROM exam ORDER BY priority')
    for x in ex:
        try:x['days_left']=(date.fromisoformat(x['exam_date'])-date.today()).days
        except:x['days_left']=None
    return templates.TemplateResponse(request,'index.html',{'page_path':p,'page_title':PAGES.get(p,'知识节点'),'exams':ex})
if __name__=='__main__':
    import uvicorn
    uvicorn.run('main:app',host='127.0.0.1',port=8765,reload=False)
