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


def test_focus_is_small_global_widget_and_timer_page_is_analytics_only():
    template = read('templates/index.html')
    app = read('static/js/app.js')
    focus = read('static/js/focus_widget.js')
    analytics_page = read('static/js/pages/study_analytics.js')
    analytics_router = read('routers/analytics.py')
    assert 'id="global-focus-root"' in template
    assert 'initFocusWidget' in app
    assert "case '/timer': result = await renderStudyAnalytics();" in app
    assert 'window.startGlobalFocus' in focus
    assert '打开小计时器' in template
    assert '学习投入看板' in analytics_page
    assert '/api/analytics/study?days=90' in analytics_page
    assert "@r.get('/study')" in analytics_router
    assert '学习活动热力图' in analytics_page
    assert '每次学习记录' in analytics_page


def test_trusted_pdf_import_auto_ingests_and_backend_schedules_skill_ai():
    import_js = read('static/js/pages/import.js')
    app = read('static/js/app.js')
    drop = read('static/js/pdf_drop.js')
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
    assert 'initPdfDropZone' in app
    assert "zone.addEventListener('drop'" in drop
    assert 'DataTransfer' in drop


def test_question_ai_is_canonical_persistent_and_wrong_questions_are_required():
    migration = read('migrations/003_question_ai_analysis.sql')
    router = read('routers/question_ai.py')
    service = read('services/question_ai.py')
    training_js = read('static/js/pages/training.js')
    coach_router = read('routers/coach.py')
    assert 'CREATE TABLE IF NOT EXISTS question_ai_analysis' in migration
    assert 'bank_id INTEGER NOT NULL UNIQUE' in migration
    assert 'trg_mistake_requires_question_ai' in migration
    assert 'Upgrade existing user data' in migration
    assert "r = APIRouter(prefix='/api/question-ai'" in router
    assert 'analyze_bank_question' in service
    assert 'required_bank_ids' in service
    assert '错题解析任务不会丢失' in training_js
    assert 'AI 解析这道题' in training_js
    assert '/api/question-ai/' in training_js
    assert 'analyze_pending_required' in coach_router


def test_question_performance_dashboard_uses_sample_and_timing_confidence():
    progress = read('static/js/pages/progress.js')
    analytics = read('routers/analytics.py')
    template = read('templates/index.html')
    assert '作答表现看板' in progress
    assert '细分题型矩阵' in progress
    assert '优先补强题型' in progress
    assert '可靠计时样本' in progress
    assert "sample_level'] = 'stable' if n >= 20 else 'usable' if n >= 8 else 'thin'" in analytics
    assert 'duration_is_estimated=0' in analytics
    assert '作答表现看板' in template


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


def test_missing_formal_nodes_are_rebuilt_before_seed_and_ci_lint():
    generator = read('tools/generate_missing_nodes.py')
    workflow = read('../.github/workflows/workbench-ci.yml')
    start_bat = read('start.bat')
    start_sh = read('start.sh')
    assert 'GUIDES = {' in generator
    assert "'quant-number-sequence'" in generator
    assert "'science-force-circuit'" in generator
    assert "'sl-essay'" in generator
    assert 'build_missing_nodes' in generator
    assert 'python tools/generate_missing_nodes.py' in workflow
    assert 'tools\\generate_missing_nodes.py' in start_bat
    assert 'tools/generate_missing_nodes.py' in start_sh


def test_reviewed_github_skills_are_real_retrieval_documents_not_just_catalog_entries():
    service = read('services/gongkao_skill.py')
    sources = read('skills/gongkao-method-coach/sources.json')
    extract = read('content/skill_extracts/github_skill_fusion.md')
    assert 'load_skill_documents' in service
    assert 'skill_secondary' in service
    assert 'load_method_documents() + load_node_documents() + load_skill_documents()' in service
    for repo in (
        'KeWang0622/kaogong-skill',
        'tyf152119-web/wangyou-honglingjin-perspective',
        'WangJunqing-coder/huasheng13-skill',
        'Suny0u17g/xiaop-data-analysis-skill',
    ):
        assert repo in sources
    assert '候选差距决定够用精度' in extract
    assert '资料分析六步法' in extract
    assert 'heihei999 / huasheng-mcp' in extract


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


def test_civil_gemini2_visual_baseline_and_v3_dashboards_are_loaded():
    app_css = read('static/css/app.css')
    visual = read('static/css/civil_gemini_exact.css')
    v3 = read('static/css/workbench_v3.css')
    dashboard = read('static/js/pages/dashboard.js')
    plan = read('static/js/pages/plan.js')
    training = read('static/js/pages/training.js')
    template = read('templates/index.html')
    assert "@import url('./civil_gemini_exact.css');" in app_css
    assert "@import url('./workbench_v3.css');" in app_css
    assert '--sidebar-w:256px' in visual
    assert '.v3-milestone-hero' in v3
    assert '.global-coach-drawer' in v3
    assert '.question-ai-panel' in v3
    assert '本周学习时长分布' in dashboard
    assert '今日推进队列' in dashboard
    assert '13 周备考路线' in dashboard
    assert '7 日攻坚日程' in plan
    assert 'AI 必做错题解析' in training
    assert '学习投入看板' in template
