from pathlib import Path

BASE = Path(__file__).resolve().parents[1]


def text(rel: str) -> str:
    return (BASE / rel).read_text(encoding='utf-8')


def test_shared_workspace_layout_is_used_across_primary_views():
    shared = text('frontend/src/components/common/WorkspaceUi.tsx')
    for token in ('WorkspacePage', 'HeroPanel', 'Surface', 'MetricRail', 'Segmented', 'workspace-surface'):
        assert token in shared

    views = [
        'DashboardView.tsx',
        'TodayTasksView.tsx',
        'TrainingsView.tsx',
        'MistakesView.tsx',
        'ImportView.tsx',
        'KnowledgeView.tsx',
        'ShenlunView.tsx',
        'MethodsView.tsx',
        'CoachView.tsx',
        'WeekPlanView.tsx',
        'StudyAnalyticsView.tsx',
        'ProgressView.tsx',
    ]
    for name in views:
        src = text(f'frontend/src/components/views/{name}')
        assert 'WorkspacePage' in src, name
        assert 'mx-auto space-y-' not in src, name


def test_each_view_has_a_layout_specific_information_hierarchy():
    dashboard = text('frontend/src/components/views/DashboardView.tsx')
    today = text('frontend/src/components/views/TodayTasksView.tsx')
    trainings = text('frontend/src/components/views/TrainingsView.tsx')
    mistakes = text('frontend/src/components/views/MistakesView.tsx')
    week = text('frontend/src/components/views/WeekPlanView.tsx')
    study = text('frontend/src/components/views/StudyAnalyticsView.tsx')
    progress = text('frontend/src/components/views/ProgressView.tsx')
    shenlun = text('frontend/src/components/views/ShenlunView.tsx')

    assert '本周投入节奏' in dashboard and '今天先做什么' in dashboard
    assert '执行队列' in today and '<details' in today
    assert '现在最值得做的题组' in trainings and 'workspace-data-table' in trainings
    assert '错误模式队列' in mistakes and '我的判断优先' in mistakes
    assert '7 日攻坚时间轴' in week and 'xl:grid-cols-7' in week
    assert '近 30 日学习节奏' in study and '近 70 日活跃热力' in study
    assert '模块能力地图' in progress and '细分题型矩阵' in progress
    assert '作答草稿演练' in shenlun and 'xl:sticky' in shenlun


def test_knowledge_and_methods_remove_page_long_scroll():
    knowledge = text('frontend/src/components/views/KnowledgeView.tsx')
    block = text('frontend/src/components/knowledge/KnowledgeSectionBlock.tsx')
    methods = text('frontend/src/components/views/MethodsView.tsx')

    assert '30 秒考场唤醒' in knowledge
    assert '学习提示与讲法' in knowledge
    assert '本节导航' in knowledge
    assert 'knowledge-paged-reader' in knowledge
    assert 'h-[calc(100vh-65px)] overflow-hidden' in knowledge
    assert 'lg:grid-cols-[260px_minmax(0,1fr)]' in knowledge
    assert 'xl:grid-cols-[260px_minmax(0,1fr)_250px]' in knowledge
    assert 'sectionIndex' in knowledge and 'activeSection' in knowledge
    assert '上一节' in knowledge and '下一节' in knowledge
    assert '{activeSection?<KnowledgeSectionBlock' in knowledge
    assert '{sections.map(section=><KnowledgeSectionBlock' not in knowledge
    assert "label:'考场速记'" in knowledge and "label:'完整讲义'" in knowledge
    assert 'border-t border-[#d8dee4] py-6' in block

    assert '考场调用口令' in methods
    assert '考场执行顺序' in methods
    assert '什么时候该想到它' in methods
    assert 'methods-one-screen' in methods
    assert 'h-[calc(100vh-65px)] overflow-hidden' in methods
    assert 'xl:grid-cols-[290px_minmax(0,1fr)]' in methods
    assert 'lg:grid-cols-[minmax(0,.92fr)_minmax(0,1.08fr)]' in methods
    assert '详情区独立滚动，页面本身不再向下拖。' in methods
    assert "type DetailTab='principle'|'example'|'boundary'|'source'" in methods


def test_review_keeps_immersive_question_flow_with_new_visual_hierarchy():
    review = text('frontend/src/components/views/ReviewView.tsx')
    assert 'fixed inset-0 z-[80]' in review
    assert 'max-w-[940px]' in review
    assert 'EXAM ACTION' in review
    assert '我的判断优先' in review
    assert '暂停并退出' in review
    assert '/api/v2/review/save' in review and '15000' in review


def test_workspace_table_visual_system_exists():
    css = text('frontend/src/index.css')
    shared = text('frontend/src/components/common/WorkspaceUi.tsx')
    assert '.workspace-data-table thead th' in css
    assert '.workspace-data-table tbody td' in css
    assert '.workspace-surface' in css
    assert 'JetBrains Mono' in css
    assert '#a8b3bf' in css and '#0969da' in shared
    assert '#0d1117' in css and 'color-scheme: dark' in css