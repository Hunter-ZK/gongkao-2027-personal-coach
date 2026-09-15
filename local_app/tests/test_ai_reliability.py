import io
import urllib.error

import pytest

import services.mistake_ai as ai
from services.mistake_ai import DeepSeekEmptyContent, _call_deepseek, _parse_deepseek_json


def test_deepseek_json_parser_accepts_fenced_and_prefixed_json():
    parsed = _parse_deepseek_json('说明如下：\n```json\n{"standard_solution_md":"先判方向","key_points":["看问法"],}\n```')
    assert parsed['standard_solution_md'] == '先判方向'
    assert parsed['key_points'] == ['看问法']


def test_deepseek_json_parser_repairs_smart_quotes_and_python_literals():
    parsed = _parse_deepseek_json('JSON：{“standard_solution_md”: “先看选项”, “fastest_solution_md”: None, “key_points”: []}')
    assert parsed['standard_solution_md'] == '先看选项'
    assert parsed['fastest_solution_md'] is None


def test_deepseek_json_parser_unwraps_nested_result_and_string_json():
    parsed = _parse_deepseek_json('{"result":"{\\"standard_solution_md\\":\\"截位直除\\",\\"key_points\\":[\\"候选差距\\"]}"}')
    assert parsed['standard_solution_md'] == '截位直除'
    assert parsed['key_points'] == ['候选差距']


def test_deepseek_json_parser_rejects_non_json_content():
    with pytest.raises(RuntimeError, match='无法解析为 JSON'):
        _parse_deepseek_json('这是一段完全没有结构化对象的回答。')


def test_wrong_question_transport_uses_post_and_falls_back_from_405(monkeypatch):
    seen = []

    class FakeResponse:
        def __enter__(self):
            return self
        def __exit__(self, *args):
            return False
        def read(self):
            return b'{"choices":[{"message":{"content":"{\\"standard_solution_md\\":\\"ok\\"}"}}]}'

    def fake_urlopen(request, timeout=90):
        seen.append((request.full_url, request.get_method()))
        if len(seen) == 1:
            raise urllib.error.HTTPError(request.full_url, 405, 'Method Not Allowed', {}, io.BytesIO(b'method not allowed'))
        return FakeResponse()

    monkeypatch.setattr(ai.urllib.request, 'urlopen', fake_urlopen)
    text = ai._request_json({'model': 'deepseek-flash', 'messages': [{'role': 'user', 'content': 'ping'}]}, 'sk-test')
    assert 'standard_solution_md' in text
    assert seen == [
        ('https://api.deepseek.com/v1/chat/completions', 'POST'),
        ('https://api.deepseek.com/chat/completions', 'POST'),
    ]


def test_empty_json_output_automatically_retries_without_thinking(monkeypatch):
    monkeypatch.setattr(ai, 'load_secret_config', lambda: {'api_key': 'sk-test', 'model': 'deepseek-v4-flash', 'thinking': True})
    calls = []

    def fake_request(payload, api_key):
        calls.append(payload)
        if len(calls) == 1:
            raise DeepSeekEmptyContent('empty')
        return '{"standard_solution_md":"第二次返回正常","fastest_solution_md":null,"key_points":[]}'

    monkeypatch.setattr(ai, '_request_json', fake_request)
    result = _call_deepseek('system', '请返回 json')
    assert result['standard_solution_md'] == '第二次返回正常'
    assert len(calls) == 2
    assert calls[0]['model'] == 'deepseek-flash'
    assert calls[0]['thinking']['type'] == 'enabled'
    assert calls[1]['thinking']['type'] == 'disabled'


def test_json_output_can_fall_back_to_plain_completion(monkeypatch):
    monkeypatch.setattr(ai, 'load_secret_config', lambda: {'api_key': 'sk-test', 'model': 'deepseek-v4-flash', 'thinking': False})
    calls = []

    def fake_request(payload, api_key):
        calls.append(payload)
        if len(calls) <= 2:
            raise DeepSeekEmptyContent('empty')
        assert 'response_format' not in payload
        return '{"standard_solution_md":"普通模式恢复","key_points":["选项"]}'

    monkeypatch.setattr(ai, '_request_json', fake_request)
    result = _call_deepseek('system', 'json please')
    assert result['standard_solution_md'] == '普通模式恢复'
    assert len(calls) == 3
    assert all(call['model'] == 'deepseek-flash' for call in calls)
