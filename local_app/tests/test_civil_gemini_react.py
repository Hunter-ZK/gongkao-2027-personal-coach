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
    assert "ui_bridge.r" in main


def test_react_data_layer_uses_real_api_not_reference_mock_store():
    context = text('frontend/src/context/AppContext.tsx')
    import_view = text('frontend/src/components/views/ImportView.tsx')
    assert '/api/ui/bootstrap' in context
    assert 'mockData' not in context
    assert '/api/import/pdf' in import_view
    assert 'sampleFenbiText' not in import_view


def test_reference_visual_shell_and_global_ai_actions_are_present():
    header = text('frontend/src/components/layout/Header.tsx')
    sidebar = text('frontend/src/components/layout/Sidebar.tsx')
    modal = text('frontend/src/components/common/QuestionModal.tsx')
    app = text('frontend/src/App.tsx')
    global_ai = text('frontend/src/components/common/GlobalAiDrawer.tsx')
    css = text('frontend/src/index.css')
    assert 'bg-stone-900' in header and 'bg-stone-900' in sidebar
    assert 'AI 永久解析' in modal
    assert 'GlobalAiDrawer' in app
    assert '/api/coach/chat' in global_ai
    assert '附带当前页面内容' in global_ai
    assert '/api/ai-formulas' in global_ai
    assert '/api/ai-conversations' in global_ai
    assert '新对话' in global_ai and '历史' in global_ai
    assert "response_mode:'structured'" in global_ai
    assert 'Skill 依据 · 本轮实际检索' in global_ai
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


def test_react_knowledge_is_card_based_and_methods_have_filters():
    knowledge = text('frontend/src/components/views/KnowledgeView.tsx')
    methods = text('frontend/src/components/views/MethodsView.tsx')
    context = text('frontend/src/context/AppContext.tsx')
    assert '内容地图' in knowledge
    assert 'CARD ' in knowledge
    assert 'parseSections' in knowledge
    assert 'Markdown>{current.content' not in knowledge
    assert '快速筛选' in methods
    assert '有考场口令' in methods and '有边界说明' in methods and '有实战例证' in methods
    assert 'normalizeKnowledgeModule' in context
    assert "raw==='guangdong'" in context and "slug.startsWith('data-')" in context


def test_question_ai_reparse_and_skill_sources_are_visible():
    modal = text('frontend/src/components/common/QuestionModal.tsx')
    assert "'?refresh=true'" in modal
    assert 'source_refs' in modal
    assert 'Skill / 方法依据' in modal
