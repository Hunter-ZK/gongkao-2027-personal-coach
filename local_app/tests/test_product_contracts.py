from pathlib import Path


BASE = Path(__file__).resolve().parents[1]


def read(rel: str) -> str:
    return (BASE / rel).read_text(encoding='utf-8')


def test_zen_mode_remains_a_first_class_visible_control():
    template = read('templates/index.html')
    app = read('static/js/app.js')
    privacy = read('static/js/privacy.js')
    assert 'id="zen-toggle"' in template
    assert 'Alt</kbd><kbd>Z' in template
    assert 'toggleZenMode' in app
    assert "const ZEN_KEY = 'liano.zen'" in privacy
    assert "['资料分析', '数据分析']" in privacy
    assert "['阿里木江', '来源C']" in privacy


def test_deepseek_coach_is_not_hidden_behind_an_experimental_flag():
    template = read('templates/index.html')
    app = read('static/js/app.js')
    settings = read('static/js/pages/settings.js')
    assert 'href="/coach"' in template
    assert "case '/coach': return renderCoachPage();" in app
    assert 'liano.aiCoachEnabled' not in app
    assert 'liano.aiCoachEnabled' not in settings
    assert '错题自动解析' in settings


def test_pdf_import_requests_deepseek_analysis_after_mistakes_are_committed():
    import_js = read('static/js/pages/import.js')
    coach = read('routers/coach.py')
    assert '/api/coach/analyze-training/' in import_js
    assert '@r.post("/analyze-training/{training_id}")' in coach
    assert 'background_tasks.add_task(analyze_many_mistakes, mistake_ids)' in coach


def test_knowledge_page_uses_authoritative_method_mapping_not_fuzzy_guessing():
    knowledge = read('static/js/pages/knowledge.js')
    assert 'method.node_slug === slug' in knowledge
    assert 'methodScore(' not in knowledge
    assert 'V2 · GitHub Skill 融合方法正文' in knowledge
    assert "textBlock('易错点 / 失效边界'" in knowledge
    assert "textBlock('完整例题'" in knowledge
