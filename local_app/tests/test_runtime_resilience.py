from fastapi.testclient import TestClient

import routers.resilience as resilience
from db import query_one
from main import app

client = TestClient(app, raise_server_exceptions=False)


def test_safe_knowledge_recommendations_fall_back_when_enrichment_fails(monkeypatch):
    monkeypatch.setattr(resilience, 'knowledge_recommendations', lambda limit: (_ for _ in ()).throw(RuntimeError('dirty local db')))
    response = client.get('/api/v2/knowledge-safe/recommendations')
    assert response.status_code == 200, response.text
    body = response.json()
    assert body['degraded'] is True
    assert isinstance(body['items'], list)
    assert 'dirty local db' in body['warning']


def test_safe_knowledge_experience_keeps_note_when_optional_stats_fail(monkeypatch):
    row = query_one("SELECT slug FROM knowledge_node WHERE content_path IS NOT NULL AND trim(content_path)!='' ORDER BY seq,slug LIMIT 1")
    assert row, 'seed database should contain at least one knowledge node'
    monkeypatch.setattr(resilience, 'note_data_band', lambda slug: (_ for _ in ()).throw(RuntimeError('old stats schema')))
    monkeypatch.setattr(resilience, 'get_adoptions', lambda slug: (_ for _ in ()).throw(RuntimeError('old setting data')))
    response = client.get(f"/api/v2/knowledge-safe/{row['slug']}/experience")
    assert response.status_code == 200, response.text
    body = response.json()
    assert body['slug'] == row['slug']
    assert body['units']
    assert body['degraded'] is True
    assert body['data_band']['attempts'] == 0
    assert body['adoptions'] == {}
    assert body['warnings']


def test_chat_once_uses_nonstream_fallback_and_returns_sources(monkeypatch):
    monkeypatch.setattr(resilience, 'load_secret_config', lambda: {'api_key': 'sk-test', 'model': 'deepseek-flash', 'thinking': False})
    seen = {}

    def fake_chat(model, messages, api_key):
        seen['model'] = model
        seen['messages'] = messages
        seen['key'] = api_key
        return '稳定模式回答'

    monkeypatch.setattr(resilience, '_fallback_chat_text', fake_chat)
    response = client.post('/api/coach/chat-once', json={
        'messages': [{'role': 'user', 'content': '资料分析两期比重怎么判断？'}],
        'response_mode': 'structured',
        'context': '当前页面：知识库',
        'model': 'deepseek-v4-flash',
        'thinking': False,
    })
    assert response.status_code == 200, response.text
    body = response.json()
    assert body['text'] == '稳定模式回答'
    assert body['model'] == 'deepseek-flash'
    assert isinstance(body['sources'], list)
    assert seen['model'] == 'deepseek-flash'
    assert seen['key'] == 'sk-test'
    assert seen['messages'][0]['role'] == 'system'


def test_chat_once_does_not_require_history_database(monkeypatch):
    monkeypatch.setattr(resilience, 'load_secret_config', lambda: {'api_key': 'sk-test', 'model': 'deepseek-flash', 'thinking': False})
    monkeypatch.setattr(resilience, '_fallback_chat_text', lambda model, messages, key: '不依赖历史表也能回答')
    response = client.post('/api/coach/chat-once', json={
        'messages': [{'role': 'user', 'content': '给我一个复盘规则'}],
    })
    assert response.status_code == 200, response.text
    assert response.json()['text'] == '不依赖历史表也能回答'
