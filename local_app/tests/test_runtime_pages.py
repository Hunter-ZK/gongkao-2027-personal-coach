from pathlib import Path

from fastapi.testclient import TestClient

from main import app

BASE = Path(__file__).resolve().parents[1]
client = TestClient(app, raise_server_exceptions=False)


def text(path: str) -> str:
    return (BASE / path).read_text(encoding='utf-8')


def test_react_spa_routes_do_not_fall_into_missing_views():
    for path in (
        '/', '/today', '/trainings', '/questions', '/mistakes', '/review', '/import',
        '/knowledge', '/shenlun', '/methods', '/coach', '/plan', '/timer', '/progress', '/settings',
    ):
        response = client.get(path)
        assert response.status_code == 200, path
        assert 'text/html' in response.headers.get('content-type', ''), path


def test_primary_read_apis_are_runtime_safe():
    bootstrap = client.get('/api/ui/bootstrap')
    assert bootstrap.status_code == 200, bootstrap.text
    payload = bootstrap.json()
    for key in ('exams', 'modules', 'phases', 'weekPlans', 'knowledgeNodes', 'methods', 'questions', 'trainings', 'mistakes', 'tasks', 'sessions'):
        assert isinstance(payload.get(key), list), key
    assert isinstance(payload.get('settings'), dict)

    methods = client.get('/api/knowledge/methods')
    assert methods.status_code == 200, methods.text
    assert isinstance(methods.json(), list)

    for endpoint in ('/api/analytics/study?days=90', '/api/analytics/questions?days=365', '/api/coach/config', '/api/v2/background/status'):
        response = client.get(endpoint)
        assert response.status_code == 200, f'{endpoint}: {response.text}'
        assert isinstance(response.json(), dict)

    practice = client.get('/api/v2/practice/recommendations')
    assert practice.status_code == 200, practice.text
    assert isinstance(practice.json(), list)

    safe_recs = client.get('/api/v2/knowledge-safe/recommendations')
    assert safe_recs.status_code == 200, safe_recs.text
    safe_payload = safe_recs.json()
    assert isinstance(safe_payload, dict)
    assert isinstance(safe_payload.get('items'), list)
    assert isinstance(safe_payload.get('degraded'), bool)

    nodes = payload.get('knowledgeNodes') or []
    if nodes:
        slug = nodes[0]['slug']
        reading = client.get(f'/api/knowledge/node/{slug}/reading')
        assert reading.status_code == 200, reading.text
        pack = reading.json()
        assert isinstance(pack.get('sections'), list)
        assert isinstance(pack.get('lesson_sections'), list)
        experience = client.get(f'/api/v2/knowledge-safe/{slug}/experience')
        assert experience.status_code == 200, experience.text
        xp = experience.json()
        assert isinstance(xp.get('units'), list)
        assert xp['units'], slug
        assert isinstance(xp.get('data_band'), dict)
        assert isinstance(xp.get('warnings'), list)

    integrity = client.get('/api/v2/knowledge/integrity')
    assert integrity.status_code == 200, integrity.text
    assert integrity.json().get('difference_chars') == 0


def test_runtime_regressions_are_guarded_in_react_source():
    context = text('frontend/src/context/AppContext.tsx')
    app = text('frontend/src/App.tsx')
    sidebar = text('frontend/src/components/layout/Sidebar.tsx')
    today = text('frontend/src/components/views/TodayTasksView.tsx')
    review = text('frontend/src/components/views/ReviewView.tsx')
    trainings = text('frontend/src/components/views/TrainingsView.tsx')
    knowledge = text('frontend/src/components/views/KnowledgeView.tsx')
    methods = text('frontend/src/components/views/MethodsView.tsx')
    knowledge_block = text('frontend/src/components/knowledge/KnowledgeSectionBlock.tsx')
    global_ai = text('frontend/src/components/common/GlobalAiDrawer.tsx')
    runner = text('frontend/src/components/common/PracticeRunner.tsx')
    css = text('frontend/src/index.css')

    assert "study:'/timer'" in context
    assert "progress:'/progress'" in context
    assert "'/questions':'trainings'" in context
    assert "'/settings':'coach'" in context
    assert 'elapsedRef.current' in context
    assert '[timerState.status,timerState.elapsedSec]' not in context
    assert "setActiveTab('timer')" not in today
    assert "setActiveTab('study')" in today
    assert 'StudyAnalyticsView' in app and 'ProgressView' in app
    assert 'PracticeRunner' in app and 'BackgroundStatusBadge' in app
    assert "id:'study'" in sidebar and "id:'progress'" in sidebar

    assert '/api/v2/review/save' in review and '15000' in review and '暂停并退出' in review
    assert '/api/v2/practice/recommendations' in trainings and '推荐训练' in trainings and '自选题目' in trainings
    assert '/api/v2/knowledge-safe/recommendations' in knowledge
    assert '/api/knowledge/node/' in knowledge and '/reading' in knowledge
    assert 'w-full px-[clamp(14px,1.6vw,28px)]' in knowledge
    assert 'grid-cols-[176px_minmax(0,1fr)]' in knowledge and '知识索引' in knowledge
    assert 'md:left-[17rem]' in knowledge and 'w-[min(760px,calc(100vw-32px))]' in knowledge
    assert 'navOpen' in knowledge and 'toolsOpen' in knowledge
    assert '学习提示与讲法' in knowledge and '情形与扩写' in knowledge
    assert '按这个方法练 5 题' in knowledge and '复制整节' in knowledge
    assert '30 秒考场唤醒' in knowledge and 'KnowledgeSectionBlock' in knowledge
    assert 'study-markdown' in knowledge_block and '例题演示' in knowledge_block and '边界易错' in knowledge_block
    assert 'splitKnowledgeMarkdown' in knowledge_block and '复制本节' in knowledge_block

    assert 'w-full px-[clamp(14px,1.6vw,28px)]' in methods
    assert 'grid-cols-[170px_190px_minmax(0,1fr)]' in methods
    assert '方法索引' in methods and 'directoryOpen' in methods and 'md:left-[17rem]' in methods
    assert "lg:grid-cols-[245px_300px_minmax(0,1fr)]" not in methods

    assert '/api/coach/chat-once' in global_ai
    assert "draftModel,setDraftModel]=useState('deepseek-flash')" in global_ai
    assert "jsonRequest('/api/coach/config',{method:'POST'" in global_ai
    assert '稳定 POST 通道' in global_ai
    assert 'AI 回答不受影响' in global_ai
    assert '/api/v2/practice/save' in runner and '15000' in runner and '暂停并退出' in runner
    assert '复制题目' in runner
    assert "document.title=zenMode?'Work Notes'" in context
    assert 'Plus Jakarta Sans' in css and 'JetBrains Mono' in css
    assert '[class*="bg-amber-"]' not in css
