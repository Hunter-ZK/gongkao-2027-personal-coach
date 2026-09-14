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
    assert '<div id="global-focus-root"></div>' in template


def test_deepseek_coach_is_global_and_not_hidden_behind_an_experimental_flag():
    template = read('templates/index.html')
    app = read('static/js/app.js')
    settings = read('static/js/pages/settings.js')
    global_coach = read('static/js/global_coach.js')
    coach_router = read('routers/coach.py')
    assert 'id="global-coach-toggle"' in template
    assert 'id="global-coach-root"' in template
    assert 'initGlobalCoach' in app
    assert 'liano.aiCoachEnabled' not in app
    assert 'liano.aiCoachEnabled' not in settings
    assert '错题自动解析' in settings
    assert 'global-coach-drawer' in global_coach
    assert 'global-coach-avatar' in global_coach
    assert 'context: useContext ? pageContext() : null' in global_coach
    assert 'context: str | None' in coach_router
    assert '当前工作台界面上下文' in coach_router


def test_global_focus_widget_replaces_page_bound_timer_controls():
    template = read('templates/index.html')
    app = read('static/js/app.js')
    focus = read('static/js/focus_widget.js')
    timer_router = read('routers/timer.py')
    assert 'id="global-focus-root"' in template
    assert 'initFocusWidget' in app
    assert "case '/timer': return renderFocusHistoryPage();" in app
    assert '开始' in focus
    assert '暂停' in focus
    assert '终止' in focus
    assert '记录' in focus
    assert "/api/timer/discard" in focus
    assert 'window.startGlobalFocus' in focus
    assert "@r.get('/study/sessions')" in timer_router


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


def test_civil_gemini2_visual_baseline_and_views_are_loaded():
    app_css = read('static/css/app.css')
    visual = read('static/css/civil_gemini_exact.css')
    views = read('static/css/civil_gemini_views.css')
    methods_css = read('static/css/civil_gemini_methods.css')
    training_css = read('static/css/civil_gemini_training.css')
    methods_js = read('static/js/pages/methods.js')
    training_js = read('static/js/pages/training.js')
    assert "@import url('./civil_gemini_exact.css');" in app_css
    assert "@import url('./civil_gemini_views.css');" in app_css
    assert "@import url('./civil_gemini_methods.css');" in app_css
    assert app_css.strip().endswith("@import url('./civil_gemini_training.css');")
    assert '--sidebar-w:256px' in visual
    assert 'global-coach-drawer' in visual
    assert 'focus-popover' in visual
    assert 'linear-gradient(90deg,#1c1917' in visual
    assert 'today-stat-grid' in views
    assert 'coach-layout' in views
    assert 'method-accordion-card' in methods_css
    assert 'method-accordion-card' in methods_js
    assert 'training-batch-card' in training_css
    assert 'training-batch-card' in training_js
