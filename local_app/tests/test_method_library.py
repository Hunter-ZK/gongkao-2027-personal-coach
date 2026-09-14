from services.method_library import get_method, load_catalog, search_methods, summary


def test_catalog_matches_v2_source_method_set():
    rows = load_catalog()
    assert len(rows) == 79
    assert len({x['id'] for x in rows}) == 79
    assert summary()['counts'] == {
        '资料分析': 28,
        '判断推理': 21,
        '言语理解': 15,
        '数量关系': 14,
        '常识判断': 1,
    }


def test_every_method_is_teachable_without_external_video():
    required = ('definition', 'principle', 'signals', 'steps', 'example', 'boundary', 'source_note', 'evidence')
    for row in load_catalog():
        for field in required:
            assert row.get(field), (row['id'], field)
        assert row.get('exam_command'), (row['id'], 'exam_command')


def test_search_and_lookup():
    assert get_method('D09')['title'].startswith('415份数法')
    assert any('逻辑填空' in x['title'] for x in search_methods('言语理解', '逻辑填空'))
    assert any('工程' in x['title'] for x in search_methods('数量关系', '工程'))
    assert any('六面体' in x['title'] for x in search_methods('判断推理', '六面体'))


def test_source_grounding_metadata_is_preserved():
    rows = load_catalog()
    assert all(row.get('source_method_label') for row in rows)
    assert all(row.get('source_note') and row.get('evidence') for row in rows)
    assert any('G' in str(row.get('evidence')) for row in rows)
    s = summary()
    assert s['total'] == 79
    assert s['composition'] == {
        'numbered_methods': 46,
        'deepening_methods': 33,
        'principles': 6,
        'review_protocols': 4,
    }


def test_method_to_node_mapping_is_authoritative_and_complete():
    rows = load_catalog()
    assert summary()['mapped'] == 79
    assert all(row.get('node_slug') for row in rows)
    assert get_method('D09')['node_slug'] == 'data-abrx-base'
    assert get_method('J14')['node_slug'] == 'figure-solid-reconstruction'
    assert get_method('V04')['node_slug'] == 'verbal-logical-fill'
    assert get_method('Q06')['node_slug'] == 'quant-engineering-travel'


def test_method_api_functions_use_same_catalog():
    from routers.method_catalog import method, method_summary, methods
    assert method_summary()['total'] == 79
    assert method_summary()['mapped'] == 79
    assert len(methods(module='资料分析', q='')) == 28
    assert method('D09')['module'] == '资料分析'
