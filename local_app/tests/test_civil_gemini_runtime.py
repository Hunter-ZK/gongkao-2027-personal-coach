from fastapi.testclient import TestClient

from main import app


client = TestClient(app)


def test_civil_gemini_bootstrap_uses_real_backend_without_500():
    response = client.get('/api/ui/bootstrap')
    assert response.status_code == 200, response.text
    payload = response.json()
    expected = {
        'exams', 'modules', 'phases', 'weekPlans', 'knowledgeNodes', 'methods',
        'questions', 'trainings', 'mistakes', 'tasks', 'sessions', 'settings',
    }
    assert expected <= set(payload)
    assert isinstance(payload['exams'], list)
    assert isinstance(payload['knowledgeNodes'], list)
    assert isinstance(payload['methods'], list)
    assert isinstance(payload['tasks'], list)


def test_primary_shell_is_react_when_build_artifact_exists():
    response = client.get('/')
    assert response.status_code == 200
    body = response.text
    # CI builds frontend_dist before pytest; release checkouts also commit the build.
    assert '<div id="root"></div>' in body or 'app-root' in body


def test_deep_link_serves_same_react_shell():
    response = client.get('/mistakes')
    assert response.status_code == 200
    assert '<div id="root"></div>' in response.text or 'app-root' in response.text
