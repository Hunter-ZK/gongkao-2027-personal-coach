from fastapi.testclient import TestClient

import routers.coach as coach
from main import app
from routers.coach import ChatIn, ChatMessage, STRUCTURED_RESPONSE_GUIDE, _retrieval_query

client = TestClient(app)


def test_structured_chat_contract_is_concise_and_explicit():
    body = ChatIn(messages=[ChatMessage(role='user', content='帮我分析当前页面')], response_mode='structured')
    assert body.response_mode == 'structured'
    for heading in ('结论', '怎么判断', '怎么做', '注意'):
        assert heading in STRUCTURED_RESPONSE_GUIDE
    assert '300–650' in STRUCTURED_RESPONSE_GUIDE
    assert '本轮实际检索' in STRUCTURED_RESPONSE_GUIDE
    assert '禁止用长段背景' in STRUCTURED_RESPONSE_GUIDE


def test_skill_retrieval_query_uses_multi_turn_history_and_page_context():
    body = ChatIn(
        messages=[
            ChatMessage(role='user', content='两期比重怎么判断？'),
            ChatMessage(role='assistant', content='先比较部分增速与总体增速。'),
            ChatMessage(role='user', content='那这一题为什么不能直接算？'),
        ],
        context='当前页面：资料分析知识库',
    )
    query = _retrieval_query(body)
    assert '两期比重怎么判断' in query
    assert '为什么不能直接算' in query
    assert '资料分析知识库' in query


def test_ai_config_test_uses_draft_key_without_exposing_it(monkeypatch):
    seen = {}

    def fake_request(payload, api_key):
        seen['payload'] = payload
        seen['key'] = api_key
        return 'OK'

    monkeypatch.setattr(coach, '_request_text', fake_request)
    response = client.post('/api/coach/config/test', json={
        'api_key': 'sk-draft-not-persisted',
        'model': 'deepseek-flash',
        'thinking': True,
    })
    assert response.status_code == 200, response.text
    body = response.json()
    assert body['ok'] is True
    assert body['model'] == 'deepseek-flash'
    assert body['thinking'] is True
    assert 'sk-draft-not-persisted' not in response.text
    assert seen['key'] == 'sk-draft-not-persisted'
    assert seen['payload']['model'] == 'deepseek-flash'
    assert seen['payload']['thinking']['type'] == 'enabled'


def test_ai_config_test_migrates_old_v4_flash_alias(monkeypatch):
    seen = {}

    def fake_request(payload, api_key):
        seen['payload'] = payload
        return 'OK'

    monkeypatch.setattr(coach, '_request_text', fake_request)
    response = client.post('/api/coach/config/test', json={
        'api_key': 'sk-draft-not-persisted',
        'model': 'deepseek-v4-flash',
        'thinking': False,
    })
    assert response.status_code == 200, response.text
    assert response.json()['model'] == 'deepseek-flash'
    assert seen['payload']['model'] == 'deepseek-flash'


def test_ai_formula_crud_persists_structured_answer():
    payload = {
        'title': '资料分析 · 两期比重判断定式',
        'category': '解题方法',
        'page_key': 'knowledge',
        'page_title': '行测考点知识库',
        'user_query': '这页内容怎么形成考场定式？',
        'response_md': '## 结论\n- 先判方向。\n## 怎么做\n- 看增速。\n- 判比重。',
        'context_snapshot': '当前页面可见内容',
        'tags': ['资料分析', '两期比重'],
    }
    created = client.post('/api/ai-formulas', json=payload)
    assert created.status_code == 200, created.text
    row = created.json()
    assert row['title'] == payload['title']
    assert row['tags'] == payload['tags']

    listed = client.get('/api/ai-formulas')
    assert listed.status_code == 200
    assert any(item['id'] == row['id'] for item in listed.json())

    patched = client.patch(f"/api/ai-formulas/{row['id']}", json={'category': '综合定式'})
    assert patched.status_code == 200
    assert patched.json()['category'] == '综合定式'

    deleted = client.delete(f"/api/ai-formulas/{row['id']}")
    assert deleted.status_code == 200
    assert deleted.json()['ok'] is True


def test_ai_conversation_history_persists_messages_and_sources():
    created = client.post('/api/ai-conversations', json={'page_key': 'knowledge', 'page_title': '行测考点知识库'})
    assert created.status_code == 200, created.text
    conversation = created.json()
    cid = conversation['id']

    user = client.post(f'/api/ai-conversations/{cid}/messages', json={
        'role': 'user', 'content': '这道资料题应该怎么做？', 'page_key': 'knowledge', 'page_title': '行测考点知识库',
        'context_snapshot': '页面快照', 'sources': [],
    })
    assert user.status_code == 200, user.text
    assistant = client.post(f'/api/ai-conversations/{cid}/messages', json={
        'role': 'assistant', 'content': '## 结论\n- 先看选项差距。', 'page_key': 'knowledge', 'page_title': '行测考点知识库',
        'sources': [{'title': '截位直除与选项差距定精度', 'kind': 'method', 'source': 'content/methods/test.json'}],
    })
    assert assistant.status_code == 200, assistant.text

    messages = client.get(f'/api/ai-conversations/{cid}/messages')
    assert messages.status_code == 200
    rows = messages.json()
    assert [x['role'] for x in rows] == ['user', 'assistant']
    assert rows[1]['sources'][0]['kind'] == 'method'

    history = client.get('/api/ai-conversations')
    assert history.status_code == 200
    found = next(x for x in history.json() if x['id'] == cid)
    assert found['message_count'] == 2
    assert '资料题' in found['title']

    deleted = client.delete(f'/api/ai-conversations/{cid}')
    assert deleted.status_code == 200
