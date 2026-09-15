from fastapi.testclient import TestClient

from main import app
from routers.coach import ChatIn, ChatMessage, STRUCTURED_RESPONSE_GUIDE


client = TestClient(app)


def test_structured_chat_contract_is_explicit():
    body = ChatIn(messages=[ChatMessage(role='user', content='帮我分析当前页面')], response_mode='structured')
    assert body.response_mode == 'structured'
    for heading in ('核心结论', '识别信号与适用条件', '操作定式', '边界与易错点', '当前页面行动', '关联依据'):
        assert heading in STRUCTURED_RESPONSE_GUIDE


def test_ai_formula_crud_persists_structured_answer():
    payload = {
        'title': '资料分析 · 两期比重判断定式',
        'category': '解题方法',
        'page_key': 'knowledge',
        'page_title': '行测考点知识库',
        'user_query': '这页内容怎么形成考场定式？',
        'response_md': '## 核心结论\n先判方向。\n## 操作定式\n1. 看增速。\n2. 判比重。',
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
