import json

import pytest
from fastapi.testclient import TestClient

from db import query_one, transaction
from main import app

client = TestClient(app, raise_server_exceptions=False)


def _clear_v2_state():
    with transaction() as conn:
        conn.execute("DELETE FROM setting WHERE key IN ('active_practice_session_v2','active_review_session_v2','note_view_history_v1','method_validation_v1')")


def test_v2_uses_existing_setting_storage_and_no_new_schema_tables():
    with transaction() as conn:
        tables = {row[0] for row in conn.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()}
    assert 'practice_session_v2' not in tables
    assert 'note_expansion' not in tables
    assert 'diagnosis_feedback' not in tables
    assert 'setting' in tables


def test_recommendation_and_resume_endpoints_are_safe():
    _clear_v2_state()
    for path in ('/api/v2/knowledge/recommendations', '/api/v2/practice/recommendations'):
        response = client.get(path)
        assert response.status_code == 200, response.text
        assert isinstance(response.json(), list)
    state = client.get('/api/v2/practice/state')
    assert state.status_code == 200
    assert isinstance(state.json(), dict)


def test_real_question_practice_persists_at_question_level():
    _clear_v2_state()
    bank = query_one("SELECT id,correct_answer FROM question_bank WHERE correct_answer IS NOT NULL AND trim(correct_answer)!='' ORDER BY id LIMIT 1")
    if not bank:
        pytest.skip('seed database has no answerable question_bank row')
    bank_id = int(bank['id'])
    start = client.post('/api/v2/practice/start', json={
        'title': 'CI 真题验证', 'bank_ids': [bank_id], 'estimated_minutes': 3, 'force': True,
    })
    assert start.status_code == 200, start.text
    session = start.json()
    assert session['session_id']
    assert session['questions'] and session['questions'][0]['id'] == bank_id
    assert 'correct_answer' not in session['questions'][0]

    saved = client.post('/api/v2/practice/save', json={
        'session_id': session['session_id'], 'current_index': 0, 'selected_answer': bank['correct_answer'],
        'elapsed_sec': 17, 'remaining_sec': 163,
    })
    assert saved.status_code == 200, saved.text
    restored = client.get('/api/v2/practice/state').json()
    assert restored['selected_answer'] == bank['correct_answer']
    assert restored['elapsed_sec'] == 17
    assert restored['remaining_sec'] == 163

    answered = client.post('/api/v2/practice/answer', json={
        'session_id': session['session_id'], 'bank_id': bank_id, 'answer': bank['correct_answer'], 'duration_sec': 21,
    })
    assert answered.status_code == 200, answered.text
    assert answered.json()['is_correct'] is True
    attempt = query_one("SELECT * FROM question_attempt WHERE bank_id=? AND source='practice_v2' ORDER BY id DESC LIMIT 1", (bank_id,))
    assert attempt and attempt['duration_sec'] == 21

    finish = client.post('/api/v2/practice/finish', json={'session_id': session['session_id']})
    assert finish.status_code == 200, finish.text
    assert finish.json()['total'] == 1
    assert finish.json()['correct'] == 1
    assert client.get('/api/v2/practice/state').json().get('active') is False


def test_review_resume_state_round_trip():
    _clear_v2_state()
    payload = {'queue_ids': [1, 2, 3], 'current_index': 1, 'selected_answer': 'C', 'elapsed_sec': 33, 'remaining_sec': 120, 'correct_count': 1, 'submitted': False}
    response = client.post('/api/v2/review/save', json=payload)
    assert response.status_code == 200, response.text
    restored = client.get('/api/v2/review/state').json()
    assert restored['queue_ids'] == [1, 2, 3]
    assert restored['current_index'] == 1
    assert restored['selected_answer'] == 'C'
    assert restored['remaining_sec'] == 120
    assert client.post('/api/v2/review/clear').status_code == 200


def test_note_experience_virtual_ids_and_source_diff_zero():
    recs = client.get('/api/v2/knowledge/recommendations').json()
    if not recs:
        pytest.skip('seed database has no formal knowledge nodes')
    slug = recs[0]['slug']
    response = client.get(f'/api/v2/knowledge/{slug}/experience')
    assert response.status_code == 200, response.text
    payload = response.json()
    assert payload['units']
    assert all(row['id'].startswith(slug + '::') for row in payload['units'])
    integrity = client.get('/api/v2/knowledge/integrity').json()
    assert integrity['passed'] is True
    assert integrity['difference_chars'] == 0


def test_expansion_type_is_fixed_enum_without_ai_dependency():
    recs = client.get('/api/v2/knowledge/recommendations').json()
    if not recs:
        pytest.skip('no knowledge nodes')
    slug = recs[0]['slug']
    experience = client.get(f'/api/v2/knowledge/{slug}/experience').json()
    unit = experience['units'][0]
    bad = client.post(f'/api/v2/knowledge/{slug}/expansion', json={'unit_id': unit['id'], 'anchor': unit['trigger'], 'type': '自由发挥', 'text': 'x'})
    assert bad.status_code == 422
    own = client.post(f'/api/v2/knowledge/{slug}/expansion', json={'unit_id': unit['id'], 'anchor': unit['trigger'], 'type': '我的批注', 'text': 'CI 用户批注'})
    assert own.status_code == 200, own.text
    assert own.json()['source'] == '我自己写的'
