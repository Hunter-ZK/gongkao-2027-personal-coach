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


def test_reference_layout_keeps_all_existing_workflows_visible():
    template = read('templates/index.html')
    for label in (
        '工作台概览', '今日任务推进', '专注学习计时', '备考规划',
        '训练记录与题库', '错题本与诊断', '错题复训', '智能练习导入',
        '行测考点知识库', '申论体系', '79 项方法库与结论', '能力趋势',
        'AI 方法教练', '设置',
    ):
        assert label in template
    assert '日常流程' in template
    assert '训练与复盘' in template
    assert '知识与方法库' in template
    assert 'exam-countdown-strip' in template


def test_ai_training_assistant_is_global_and_context_aware():
    template = read('templates/index.html')
    app = read('static/js/app.js')
    global_coach = read('static/js/global_coach.js')
    coach = read('routers/coach.py')
    assert 'id="global-coach-toggle"' in template
    assert 'id="global-coach-root"' in template
    assert 'Alt</kbd><kbd>A' in template
    assert "import { initGlobalCoach } from './global_coach.js';" in app
    assert 'initGlobalCoach();' in app
    assert "'/mistakes':" in global_coach
    assert "'/knowledge':" in global_coach
    assert "'/review':" in global_coach
    assert 'context: useContext ? pageContext() : null' in global_coach
    assert 'context: str | None' in coach
    assert '# 当前工作台界面上下文' in coach


def test_global_coach_uses_same_persistent_conversation_as_full_coach_page():
    global_coach = read('static/js/global_coach.js')
    coach_page = read('static/js/pages/coach.js')
    assert "const STORE = 'gongkao.coach.chat.v1';" in global_coach
    assert "const STORE = 'gongkao.coach.chat.v1';" in coach_page
    assert "window.openGlobalCoach" in global_coach
