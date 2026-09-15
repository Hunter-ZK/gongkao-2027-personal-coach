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
    method_rows = methods.json()
    assert isinstance(method_rows, list)
    if method_rows:
        assert method_rows[0].get('category')

    for endpoint in ('/api/analytics/study?days=90', '/api/analytics/questions?days=365', '/api/coach/config'):
        response = client.get(endpoint)
        assert response.status_code == 200, f'{endpoint}: {response.text}'
        assert isinstance(response.json(), dict)

    nodes = payload.get('knowledgeNodes') or []
    if nodes:
        reading = client.get(f"/api/knowledge/node/{nodes[0]['slug']}/reading")
        assert reading.status_code == 200, reading.text
        pack = reading.json()
        assert isinstance(pack.get('sections'), list)
        assert isinstance(pack.get('lesson_sections'), list)
        profile = pack.get('profile') or {}
        for key in ('priority', 'exam_route', 'avoid', 'training', 'lenses'):
            assert isinstance(profile.get(key), list), key


def test_runtime_regressions_are_guarded_in_react_source():
    context = text('frontend/src/context/AppContext.tsx')
    app = text('frontend/src/App.tsx')
    sidebar = text('frontend/src/components/layout/Sidebar.tsx')
    today = text('frontend/src/components/views/TodayTasksView.tsx')
    review = text('frontend/src/components/views/ReviewView.tsx')

    assert "study:'/timer'" in context
    assert "progress:'/progress'" in context
    assert "'/questions':'trainings'" in context
    assert "'/settings':'coach'" in context
    assert 'elapsedRef.current' in context
    assert '[timerState.status,timerState.elapsedSec]' not in context
    assert "setActiveTab('timer')" not in today
    assert "setActiveTab('study')" in today
    assert 'StudyAnalyticsView' in app and 'ProgressView' in app
    assert "id:'study'" in sidebar and "id:'progress'" in sidebar
    assert 'answerReviewQuestion' in review and 'refresh' in review
