from pathlib import Path

BASE = Path(__file__).resolve().parents[1]


def read(rel: str) -> str:
    return (BASE / rel).read_text(encoding='utf-8')


def test_knowledge_reader_uses_paged_desktop_split_and_mobile_drawers():
    src = read('frontend/src/components/views/KnowledgeView.tsx')
    block = read('frontend/src/components/knowledge/KnowledgeSectionBlock.tsx')
    assert 'navOpen' in src and 'toolsOpen' in src
    assert 'knowledge-paged-reader' in src
    assert 'h-[calc(100vh-65px)] overflow-hidden' in src
    assert 'lg:grid-cols-[260px_minmax(0,1fr)]' in src
    assert 'xl:grid-cols-[260px_minmax(0,1fr)_250px]' in src
    assert 'fixed bottom-0 left-0 top-0' in src
    assert 'fixed bottom-0 right-0 top-0' in src
    assert 'max-w-[920px]' in src
    assert '知识索引' in src
    assert '本节导航' in src
    assert 'sectionIndex' in src and 'activeSection' in src and 'chooseSection' in src
    assert '上一节' in src and '下一节' in src
    assert '学习提示与讲法' in src
    assert '<details' in src
    assert 'border-t border-[#d8dee4] py-6' in block
    assert '阅读原则' not in src


def test_knowledge_markdown_is_split_into_smaller_learning_blocks_without_rewriting_source():
    src = read('frontend/src/components/knowledge/KnowledgeSectionBlock.tsx')
    assert 'splitKnowledgeMarkdown' in src
    assert 'packParagraphs' in src
    assert 'chunks.map' in src
    assert "line.match(/^#{2,4}" in src
    assert 'section.body' in src
    assert '<CopyButton' in src


def test_formatted_copy_is_available_across_knowledge_and_question_surfaces():
    helper = read('frontend/src/utils/copy.ts')
    button = read('frontend/src/components/common/CopyButton.tsx')
    assert 'plainFromMarkdown' in helper
    assert 'formatKnowledgeText' in helper
    assert 'formatQuestionText' in helper
    assert 'formatMethodText' in helper
    assert "document.execCommand('copy')" in helper
    assert 'navigator.clipboard' in helper
    assert '已复制' in button

    expected = {
        'frontend/src/components/views/KnowledgeView.tsx': ['复制整节', 'KnowledgeSectionBlock'],
        'frontend/src/components/common/QuestionModal.tsx': ['复制题目', 'formatQuestionText'],
        'frontend/src/components/common/PracticeRunner.tsx': ['复制题目', 'formatQuestionText'],
        'frontend/src/components/views/ReviewView.tsx': ['复制题目', 'formatQuestionText'],
        'frontend/src/components/views/TrainingsView.tsx': ['formatQuestionText', 'CopyButton'],
        'frontend/src/components/views/MistakesView.tsx': ['formatQuestionText', 'CopyButton'],
        'frontend/src/components/views/ImportView.tsx': ['复制题目', 'formatQuestionText'],
        'frontend/src/components/views/MethodsView.tsx': ['复制方法', 'formatMethodText'],
        'frontend/src/components/views/ShenlunView.tsx': ['复制方法', 'formatGuideText'],
    }
    for path, tokens in expected.items():
        src = read(path)
        for token in tokens:
            assert token in src, (path, token)


def test_active_practice_copy_does_not_reveal_answer_before_submission():
    practice = read('frontend/src/components/common/PracticeRunner.tsx')
    review = read('frontend/src/components/views/ReviewView.tsx')
    assert 'correctAnswer:result?.correct_answer' in practice
    assert '!!result' in practice
    assert 'correctAnswer:submitted?q.correctAnswer:null' in review
    assert 'submitted);' in review