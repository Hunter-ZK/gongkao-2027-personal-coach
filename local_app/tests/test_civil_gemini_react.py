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
    assert 'bg-stone-900' in header and 'bg-stone-900' in sidebar
    assert 'AI 永久解析' in modal
    assert 'GlobalAiDrawer' in app
    assert '/api/coach/chat' in global_ai
    assert '附带当前页面内容' in global_ai
    assert '/api/ai-formulas' in global_ai
    assert "response_mode:'structured'" in global_ai
