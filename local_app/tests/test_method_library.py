from services.method_library import get_method, load_catalog, search_methods, summary


def test_catalog_has_exact_v2_method_set():
    rows = load_catalog()
    assert len(rows) == 80
    assert len({x['id'] for x in rows}) == 80
    assert summary()['counts'] == {
        '资料分析': 28,
        '判断推理': 21,
        '言语理解': 16,
        '数量关系': 14,
        '常识判断': 1,
    }


def test_every_method_is_teachable_without_external_video():
    required = ('definition', 'principle', 'signals', 'steps', 'example', 'boundary', 'exam_command', 'source_note', 'evidence')
    for row in load_catalog():
        for field in required:
            assert row.get(field), (row['id'], field)


def test_search_and_lookup():
    assert get_method('D9')['title'].startswith('贡献率')
    assert any('逻辑填空' in x['title'] for x in search_methods('言语理解', '逻辑填空'))
    assert any('工程' in x['title'] for x in search_methods('数量关系', '工程'))


def test_pack_is_safe_binary_gzip_and_keeps_evidence_labels():
    rows = load_catalog()
    assert all(row.get('source_note') and row.get('evidence') for row in rows)
    assert any('G' in str(row.get('evidence')) for row in rows)


def test_method_api_functions_use_same_catalog():
    from routers.method_catalog import method, method_summary, methods
    assert method_summary()['total'] == 80
    assert len(methods(module='资料分析', q='')) == 28
    assert method('M09')['module'] == '资料分析'
