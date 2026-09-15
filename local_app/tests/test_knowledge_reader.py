from services.knowledge_reader import lens_documents, load_lenses, parse_sections, reading_pack


def test_curated_skill_lenses_cover_xingce_nodes_with_real_emphasis():
    payload = load_lenses()
    nodes = payload['nodes']
    assert len(nodes) >= 30
    for slug in ('data-abrx-base', 'data-two-period-proportion', 'logic-strengthen-premise', 'verbal-logical-fill', 'quant-value-judgment'):
        assert slug in nodes
        row = nodes[slug]
        assert row['positioning']
        assert len(row['priority']) >= 2
        assert len(row['exam_route']) >= 3
        assert row['lenses']
    data = nodes['data-two-period-proportion']
    assert any('小P' in x['label'] for x in data['lenses'])
    quant = nodes['quant-value-judgment']
    assert any('红领巾' in x['label'] for x in quant['lenses'])


def test_skill_lenses_state_secondary_evidence_boundary():
    payload = load_lenses()
    assert '二级' in payload['evidence_policy']
    politics = payload['nodes']['politics-core-expressions']
    science = payload['nodes']['science-force-circuit']
    assert any('二级' in x['label'] or '通用' in x['label'] for x in politics['lenses'])
    assert any('覆盖较弱' in x['focus'] for x in science['lenses'])


def test_markdown_is_reorganized_into_reader_sections():
    md = '''# 标题\n\n## 题型识别\n看到增长率。\n\n## 核心方法\n先判方向。\n\n### 例题 1\n一题。\n\n## 易错点\n不要混百分点。'''
    sections = parse_sections(md)
    assert [x['kind'] for x in sections] == ['recognition', 'method', 'example', 'boundary']
    pack = reading_pack('data-two-period-proportion', '资料分析', md)
    assert pack['profile']['positioning']
    assert pack['lesson_sections'][0]['kind'] == 'recognition'
    assert pack['toc']


def test_lens_documents_are_ai_retrievable_documents():
    docs = lens_documents()
    assert len(docs) >= 30
    assert all(x['kind'] == 'skill_lens' for x in docs)
    target = next(x for x in docs if x['source'].endswith('#data-truncated-division'))
    assert '候选' in target['text']
    assert '小P' in target['text'] and '花生' in target['text']
