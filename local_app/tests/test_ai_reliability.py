import pytest

from services.mistake_ai import _parse_deepseek_json


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
