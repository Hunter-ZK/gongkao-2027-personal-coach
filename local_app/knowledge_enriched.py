from pathlib import Path
import re
from markdown import markdown

from knowledge_rich import get_catalog as _get_catalog, get_pages as _get_pages, build_page as _build_page
from knowledge_fullpack import get_topic_pack
from knowledge_curated_extra import EXTRA_CURATED
from knowledge_source_core import SOURCE_MD
from knowledge_examples import EXAMPLES

BASE = Path(__file__).resolve().parent
REPO_LEGACY = BASE.parent / 'references' / 'legacy_notes'

PARENT_FILES = {
    '资料分析': ['资料分析笔记.md'],
    '判断推理': ['类比推理.md'],
    '数量关系': ['数量关系笔记.md'],
}


def _clean(text):
    text = re.sub(r'<script[\s\S]*?</script>', '', text, flags=re.I)
    text = re.sub(r'<img[^>]*>', '> 原笔记此处含配图；当前页面先保留文字规则。', text, flags=re.I)
    text = re.sub(r'<a id=.*?</a>', '', text)
    text = text.replace('&emsp;', ' ')
    return text.strip()


def _parent_excerpt(module, title):
    """Fallback search in legacy notes already tracked at repository root."""
    words = [title] + [x for x in re.split(r'[-—·/（）() ]+', title) if len(x) >= 2]
    best = []
    for fn in PARENT_FILES.get(module, []):
        p = REPO_LEGACY / fn
        if not p.exists():
            continue
        text = _clean(p.read_text('utf-8', errors='ignore'))
        sections = re.split(r'(?=^#{1,4}\s+)', text, flags=re.M)
        for sec in sections:
            if not sec.strip():
                continue
            score = sum(8 for w in words if w and w in sec[:180]) + sum(1 for w in words if w and w in sec)
            if score:
                best.append((score, fn, sec))
    best.sort(key=lambda x: x[0], reverse=True)
    if not best:
        return ''
    chunks = []
    for _, fn, sec in best[:2]:
        if len(sec) > 3600:
            sec = sec[:3600] + '\n\n> （该节较长，本页截取最相关部分。）'
        chunks.append(f'### 来自你的旧笔记｜{fn}\n\n{sec}')
    return '\n\n---\n\n'.join(chunks)


def get_catalog():
    return _get_catalog()


def get_pages(module):
    return _get_pages(module)


def build_page(module, page_id):
    page = _build_page(module, page_id)
    title = page['title']

    # Layer 1: every one of the 300 nodes gets topic-specific content.
    pack = get_topic_pack(module, title)
    if pack:
        page['definition'] = pack['essence']
        page['main_method'] = pack['method']
        page['boundary'] = pack['pitfall']
        page['formula'] = pack.get('formula', '')
        page['memory'] = pack.get('memory', '')
        # If the base page only has generic fast-path language, replace it with a useful exam-oriented rule.
        if pack.get('memory'):
            page['fast_method'] = [pack['memory'], '先用选项和题干结构做排除；只有无法区分时再进入完整计算/推理。']
        page['curated_status'] = '已完成逐页专题内容'

    # Layer 2: selected high-frequency pages get a deeper manual synthesis.
    extra = EXTRA_CURATED.get((module, title))
    if extra:
        page.update(extra)
        page['curated_status'] = '已完成高频专题深度精编'

    # Layer 3: classic models / worked micro-example.
    example = EXAMPLES.get((module, title))
    if example:
        page.update(example)

    # Source notes come before the AI synthesis in the reader.
    source = SOURCE_MD.get((module, title), '')
    if not source:
        source = page.get('source_markdown') or _parent_excerpt(module, title)

    if source:
        page['source_markdown'] = source
        page['source_html'] = markdown(source, extensions=['tables','fenced_code','sane_lists'])
        page['source_status'] = '已接入你的原笔记精华'
    else:
        page['source_markdown'] = ''
        page['source_html'] = ''
        page['source_status'] = '当前节点无直接个人旧笔记；展示逐页综合内容'

    return page
