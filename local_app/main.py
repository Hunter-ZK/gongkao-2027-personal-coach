from __future__ import annotations

from datetime import date
from pathlib import Path

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates

from db import migrate, query
from routers import (
    ai_workspace,
    analytics,
    coach,
    dashboard,
    experience_v2,
    knowledge,
    method_catalog,
    misc,
    mistakes,
    plan,
    question_ai,
    resilience,
    review_session_v2,
    sync,
    timer,
    training,
    ui_bridge,
    ui_question_ai,
)

BASE = Path(__file__).resolve().parent
DIST = BASE / 'frontend_dist'
migrate()

app = FastAPI(title='2027 公考个人备考工作台', version='2.3.1')
app.mount('/static', StaticFiles(directory=BASE / 'static'), name='static')
app.mount('/data-images', StaticFiles(directory=BASE / 'data' / 'images'), name='data-images')
if (DIST / 'assets').exists():
    app.mount('/assets', StaticFiles(directory=DIST / 'assets'), name='react-assets')

templates = Jinja2Templates(directory=BASE / 'templates')
for router in [
    dashboard.r,
    timer.r,
    training.r,
    mistakes.r,
    knowledge.r,
    method_catalog.r,
    plan.r,
    misc.r,
    coach.r,
    resilience.r,
    ai_workspace.r,
    ai_workspace.history_r,
    sync.r,
    analytics.r,
    question_ai.r,
    experience_v2.r,
    review_session_v2.r,
    ui_bridge.r,
    ui_question_ai.r,
]:
    app.include_router(router)


@app.get('/health')
def health():
    return {
        'ok': True,
        'service': 'gongkao-workbench',
        'version': '2.3.1',
        'frontend': 'civil-gemini-react' if (DIST / 'index.html').exists() else 'legacy-fallback',
    }


@app.exception_handler(Exception)
async def err(req: Request, exc: Exception):
    if isinstance(exc, HTTPException):
        return JSONResponse({'error': {'code': str(exc.status_code), 'message': str(exc.detail)}}, status_code=exc.status_code)
    return JSONResponse({'error': {'code': 'internal_error', 'message': str(exc)}}, status_code=500)


PAGES = {
    '/': '总览', '/today': '今日任务', '/trainings': '训练记录', '/questions': '题库',
    '/mistakes': '错题本', '/review': '错题复训', '/import': '导入', '/knowledge': '行测体系', '/shenlun': '申论体系',
    '/coach': 'AI方法教练', '/plan': '周度攻坚日程', '/progress': '作答表现看板', '/timer': '学习投入看板', '/methods': '方法与结论', '/settings': '设置',
}


@app.get('/{path:path}', response_class=HTMLResponse)
def shell(request: Request, path: str = ''):
    if path.startswith('api/'):
        raise HTTPException(404, 'API endpoint not found')
    if (DIST / 'index.html').exists():
        candidate = (DIST / path).resolve() if path else None
        if candidate and candidate.is_file() and DIST.resolve() in candidate.parents:
            return FileResponse(candidate)
        return FileResponse(DIST / 'index.html')

    p = '/' + path if path else '/'
    if p not in PAGES and not p.startswith('/knowledge/'):
        p = '/'
    exams = query('SELECT code,name,exam_date,is_official,date_source FROM exam ORDER BY priority')
    for item in exams:
        try:
            item['days_left'] = (date.fromisoformat(item['exam_date']) - date.today()).days
        except Exception:
            item['days_left'] = None
    return templates.TemplateResponse(request, 'index.html', {'page_path': p, 'page_title': PAGES.get(p, '知识节点'), 'exams': exams})


if __name__ == '__main__':
    import uvicorn
    uvicorn.run('main:app', host='127.0.0.1', port=8765, reload=False)
