from pathlib import Path
import re
from markdown import markdown

from knowledge_rich import get_catalog as _get_catalog, get_pages as _get_pages, build_page as _build_page
from knowledge_curated_extra import EXTRA_CURATED
from knowledge_source_core import SOURCE_MD

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

    # Page-specific integrated method comes after the user's source notes, not instead of them.
    extra = EXTRA_CURATED.get((module, title))
    if extra:
        page.update(extra)
        page['curated_status'] = '已完成专题级精编'
    else:
        page['curated_status'] = '已接入来源内容；专题级精编持续补强'

    # Prefer verified excerpts from the user's original full notes captured during rebuild.
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
        page['source_status'] = '当前节点无直接个人旧笔记；使用综合方法并等待真题补强'

    return page
