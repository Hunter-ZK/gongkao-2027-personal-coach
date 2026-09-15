from pathlib import Path

BASE = Path(__file__).resolve().parents[1]


def text(path: str) -> str:
    return (BASE / path).read_text(encoding='utf-8')


def test_civil_gemini_react_is_primary_frontend_source():
    pkg = text('frontend/package.json')
    app = text('frontend/src/App.tsx')
    main = text('main.py')
    assert 'react' in pkg.lower()
    assert 'DashboardView' in app and 'Sidebar' in app and 'Header' in app
    assert "DIST = BASE / 'frontend_dist'" in main
    assert 'ui_bridge.r' in main


def test_react_data_layer_uses_real_api_not_reference_mock_store():
    context = text('frontend/src/context/AppContext.tsx')
    import_view = text('frontend/src/components/views/ImportView.tsx')
    assert '/api/ui/bootstrap' in context
    assert 'mockData' not in context
    assert '/api/v2/import/pdf' in import_view
    assert '/api/v2/background/status' in import_view
    assert 'sampleFenbiText' not in import_view


def test_global_ai_uses_stable_post_transport_nonblocking_history_and_real_settings():
    header = text('frontend/src/components/layout/Header.tsx')
    sidebar = text('frontend/src/components/layout/Sidebar.tsx')
    app = text('frontend/src/App.tsx')
    global_ai = text('frontend/src/components/common/GlobalAiDrawer.tsx')
    coach = text('routers/coach.py')
    resilience = text('routers/resilience.py')
    assert 'bg-stone-900' in header and 'bg-stone-900' in sidebar
    assert 'GlobalAiDrawer' in app
    assert '/api/coach/chat-once' in global_ai
    assert "jsonRequest('/api/coach/config',{method:'POST'" in global_ai
    assert '/api/ai-conversations' in global_ai
    assert '历史记录暂不可写入' in global_ai and 'AI 回答不受影响' in global_ai
    assert 'deepseek-flash' in global_ai
    assert 'Skill / 方法依据' in global_ai
    assert 'DeepSeek 配置' in global_ai
    assert '/api/coach/config/test' in global_ai
    assert 'API Key' in global_ai and '深度思考' in global_ai
    assert 'type="password"' in global_ai
    assert "'https://api.deepseek.com/v1/chat/completions'" in coach
    assert "method='POST'" in coach
    assert "@r.post('/api/coach/config')" in resilience
    assert "@r.post('/api/coach/chat-once')" in resilience


def test_react_timer_is_compact_global_control_not_a_page():
    header = text('frontend/src/components/layout/Header.tsx')
    sidebar = text('frontend/src/components/layout/Sidebar.tsx')
    app = text('frontend/src/App.tsx')
    context = text('frontend/src/context/AppContext.tsx')
    assert 'btn-compact-timer' in header
    assert 'compact-timer-popover' in header
    assert '今日累计' in header and '本周累计' in header
    assert "id:'timer'" not in sidebar
    assert 'TimerView' not in app
    assert "timer:'/timer'" not in context


def test_react_knowledge_restores_gemini_reader_and_keeps_v2_features():
    knowledge = text('frontend/src/components/views/KnowledgeView.tsx')
    block = text('frontend/src/components/knowledge/KnowledgeSectionBlock.tsx')
    assert "xl:grid-cols-[270px_minmax(0,1fr)_250px]" in knowledge
    assert '行测知识目录' in knowledge
    assert '/api/knowledge/node/' in knowledge and '/reading' in knowledge
    assert '/api/v2/knowledge-safe/recommendations' in knowledge
    assert '/api/v2/knowledge-safe/' in knowledge and '/experience' in knowledge
    assert '精讲模式' in knowledge and '完整讲义' in knowledge
    assert '本节定位' in knowledge and '考场调用链' in knowledge
    assert 'Skill 讲法 · 本节侧重' in knowledge
    assert '按这个方法练 5 题' in knowledge
    assert '补充层' in knowledge and '我的批注' in knowledge
    assert '/adoption' in knowledge and '/expansion' in knowledge
    assert '正文阅读仍可继续' in knowledge
    assert '30 秒考场唤醒' in knowledge
    assert 'KnowledgeSectionBlock' in knowledge
    for label in ('识别信号', '主方法', '考场提速', '例题演示', '边界易错', '训练复盘', '原理解释'):
        assert label in block


def test_global_css_is_close_to_civil_gemini_baseline_not_full_page_retheme():
    css = text('frontend/src/index.css')
    assert 'Plus Jakarta Sans' in css and 'JetBrains Mono' in css
    assert '::-webkit-scrollbar' in css
    assert '.knowledge-reader' in css
    assert '.study-markdown' in css
    assert 'html[data-zen]' in css
    assert '[class*="bg-amber-"]' not in css
    assert '.h-1\\.5' not in css


def test_react_method_library_has_directory_hierarchy_and_detail_pane():
    methods = text('frontend/src/components/views/MethodsView.tsx')
    assert '方法目录' in methods
    assert '按模块 → 题型/场景 → 方法进入' in methods
    assert '/api/knowledge/methods' in methods
    assert '有考场口令' in methods and '有边界说明' in methods and '有实战例证' in methods
    assert '考场执行顺序' in methods
    assert '来源说明' in methods


def test_knowledge_module_normalization_still_guards_legacy_bootstrap():
    context = text('frontend/src/context/AppContext.tsx')
    assert 'normalizeKnowledgeModule' in context
    assert "raw!=='guangdong'" in context and "raw!=='national'" in context
    assert "slug.startsWith('data-')" in context and "slug.startsWith('logic-')" in context


def test_question_ai_reparse_and_skill_sources_are_visible():
    modal = text('frontend/src/components/common/QuestionModal.tsx')
    assert "'?refresh=true'" in modal
    assert 'source_refs' in modal
    assert 'Skill / 方法依据' in modal
