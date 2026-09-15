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


def test_global_ai_has_history_skill_sources_and_real_settings():
    header = text('frontend/src/components/layout/Header.tsx')
    sidebar = text('frontend/src/components/layout/Sidebar.tsx')
    app = text('frontend/src/App.tsx')
    global_ai = text('frontend/src/components/common/GlobalAiDrawer.tsx')
    css = text('frontend/src/index.css')
    assert 'bg-stone-900' in header and 'bg-stone-900' in sidebar
    assert 'GlobalAiDrawer' in app
    assert '/api/coach/chat' in global_ai
    assert '/api/ai-conversations' in global_ai
    assert '新对话' in global_ai and '历史' in global_ai
    assert 'Skill 依据 · 本轮实际检索' in global_ai
    assert 'DeepSeek 配置' in global_ai
    assert '/api/coach/config/test' in global_ai
    assert 'API Key' in global_ai and '深度思考' in global_ai
    assert 'type="password"' in global_ai
    assert 'reasoning_content' in global_ai
    assert 'html[data-zen]' in css and '#workbench-shell' in css


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


def test_react_knowledge_uses_recommendations_and_three_shape_reading():
    knowledge = text('frontend/src/components/views/KnowledgeView.tsx')
    assert '现在最值得看的笔记' in knowledge
    assert '/api/v2/knowledge/recommendations' in knowledge
    assert '浏览全部笔记' in knowledge
    assert '唤醒层 · 30 秒' in knowledge
    assert '方法层' in knowledge
    assert '展开出处层' in knowledge
    assert '按这个方法练 5 题' in knowledge
    assert '+扩写' in knowledge
    assert 'CARD ' not in knowledge
    assert '内容地图' not in knowledge


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
