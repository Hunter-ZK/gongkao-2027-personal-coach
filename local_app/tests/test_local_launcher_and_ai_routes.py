from pathlib import Path

from fastapi.testclient import TestClient

import routers.coach as coach
import tools.run_local as run_local
from main import app

BASE = Path(__file__).resolve().parents[1]
client = TestClient(app, raise_server_exceptions=False)


def text(path: str) -> str:
    return (BASE / path).read_text(encoding='utf-8')


def route_methods(path: str) -> set[str]:
    out: set[str] = set()
    for route in app.routes:
        if getattr(route, 'path', None) == path:
            out.update(getattr(route, 'methods', set()) or set())
    return out


def test_ai_config_routes_accept_both_transition_methods(monkeypatch):
    assert {'POST', 'PUT'} <= route_methods('/api/coach/config')
    assert {'POST', 'PUT'} <= route_methods('/api/coach/config/test')

    monkeypatch.setattr(
        coach,
        'save_secret_config',
        lambda **kwargs: {
            'configured': True,
            'model': kwargs.get('model') or 'deepseek-flash',
            'thinking': bool(kwargs.get('thinking')),
            'key_source': 'local',
            'models': [],
        },
    )
    saved = client.post('/api/coach/config', json={'api_key': 'sk-test', 'model': 'deepseek-flash', 'thinking': False})
    assert saved.status_code == 200, saved.text
    assert saved.json()['configured'] is True


def test_ai_connection_test_works_with_post_and_put(monkeypatch):
    monkeypatch.setattr(coach, 'load_secret_config', lambda: {'api_key': 'sk-test', 'model': 'deepseek-flash', 'thinking': False})
    monkeypatch.setattr(coach, '_request_text', lambda payload, api_key: 'OK')

    body = {'model': 'deepseek-flash', 'thinking': False}
    for method in ('post', 'put'):
        response = getattr(client, method)('/api/coach/config/test', json=body)
        assert response.status_code == 200, (method, response.text)
        assert response.json()['ok'] is True
        assert response.json()['model'] == 'deepseek-flash'


def test_launcher_moves_off_busy_old_backend_port(monkeypatch):
    monkeypatch.setattr(run_local, '_port_is_available', lambda host, port: port == 8001)
    assert run_local.choose_port(8000, attempts=3) == 8001


def test_all_local_entrypoints_use_same_default_port_and_safe_launcher():
    bat = text('start.bat')
    sh = text('start.sh')
    main = text('main.py')
    vite = text('frontend/vite.config.ts')

    assert 'tools\\run_local.py' in bat
    assert 'tools/run_local.py' in sh
    assert 'port=8000' in main
    assert "http://127.0.0.1:8000" in vite
    assert '8765' not in main
    assert '8765' not in vite


def test_health_exposes_current_backend_version():
    response = client.get('/health')
    assert response.status_code == 200
    payload = response.json()
    assert payload['service'] == 'gongkao-workbench'
    assert payload['version'] == '2.3.2'
