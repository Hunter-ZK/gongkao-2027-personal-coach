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


def test_trusted_pdf_import_auto_ingests_and_backend_schedules_skill_ai():
    import_js = read('static/js/pages/import.js')
    training = read('routers/training.py')
    mistake_ai = read('services/mistake_ai.py')
    assert 'res.needs_review === 0' in import_js
    assert 'autoCommit(res.import_id, res)' in import_js
    assert '固定版式核验通过' in import_js
    assert 'BackgroundTasks' in training
    assert '_schedule_mistake_ai' in training
    assert 'background_tasks.add_task(analyze_many_mistakes, mistake_ids)' in training
    assert 'build_system_prompt(query_text)' in mistake_ai
    assert '优先服从系统提示里检索到的本地 Skill / V2 方法材料' in mistake_ai


def test_knowledge_page_is_progressive_card_learning_not_default_longform():
    knowledge = read('static/js/pages/knowledge.js')
    css = read('static/css/gemini_v2.css')
    assert 'method.node_slug === slug' in knowledge
    assert 'methodScore(' not in knowledge
    assert '30 秒快速恢复' in knowledge
    assert '识别信号词库' in knowledge
    assert '快速恢复' in knowledge and '标准学习' in knowledge and '深度理解' in knowledge
    assert 'knowledge-longform-gate' in knowledge
    assert '保留全部内容，不再默认铺满页面' in knowledge
    assert 'knowledge-signal-chip' in css
    assert 'knowledge-recovery-grid' in css
    assert 'knowledge-method-card' in css


def test_two_device_git_checkpoint_sync_is_global_private_and_secret_safe():
    template = read('templates/index.html')
    app = read('static/js/app.js')
    settings = read('static/js/pages/settings.js')
    sync_js = read('static/js/sync_widget.js')
    sync_router = read('routers/sync.py')
    sync_service = read('services/device_sync.py')
    gitignore = read('.gitignore')
    assert 'id="global-sync-root"' in template
    assert 'gemini_v2.css' in template
    assert 'initSyncWidget' in app
    assert '公司 / 家里双设备同步' in settings
    assert '/api/sync/push' in sync_js
    assert '/api/sync/pull' in sync_js
    assert '@r.post("/push")' in sync_router
    assert '@r.post("/pull")' in sync_router
    assert 'Hunter-ZK/Civil_gemini2.git' in sync_service
    assert 'gongkao-personal-data' in sync_service
    assert 'private GitHub backing branch' in sync_service
    assert 'API Key' in sync_service or 'API keys' in sync_service
    assert 'data/secrets.json' in gitignore
    assert 'data/sync-state.json' in gitignore
    assert 'data/sync-repo/' in gitignore
    assert 'study-before-sync-' in sync_service


def test_civil_gemini2_visual_baseline_and_views_are_loaded():
    app_css = read('static/css/app.css')
    visual = read('static/css/civil_gemini_exact.css')
    views = read('static/css/civil_gemini_views.css')
    methods_css = read('static/css/civil_gemini_methods.css')
    training_css = read('static/css/civil_gemini_training.css')
    methods_js = read('static/js/pages/methods.js')
    training_js = read('static/js/pages/training.js')
    template = read('templates/index.html')
    assert "@import url('./civil_gemini_exact.css');" in app_css
    assert "@import url('./civil_gemini_views.css');" in app_css
    assert "@import url('./civil_gemini_methods.css');" in app_css
    assert "@import url('./civil_gemini_training.css');" in app_css
    assert "@import url('./civil_gemini_mistakes.css');" in app_css
    assert "@import url('./civil_gemini_review.css');" in app_css
    assert '--sidebar-w:256px' in visual
    assert 'global-coach-drawer' in visual
    assert 'focus-popover' in visual
    assert 'linear-gradient(90deg,#1c1917' in visual
    assert 'today-stat-grid' in views
    assert 'coach-layout' in views
    assert 'method-accordion-card' in methods_css
    assert 'method-accordion-card' in methods_js
    assert 'cg-training-batch-card' in training_css
    assert 'cg-training-batch-card' in training_js
    assert 'cg-question-bank-toolbar' in training_css
    assert 'cg-question-bank-row' in training_js
    assert 'cg-question-modal-card' in training_css
    assert 'cg-question-modal-card' in training_js
    assert '历史正确率' in training_js
    assert '/static/css/gemini_v2.css' in template
