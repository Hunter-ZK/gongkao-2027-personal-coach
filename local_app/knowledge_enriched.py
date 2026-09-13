from knowledge_rich import get_catalog as _get_catalog, get_pages as _get_pages, build_page as _build_page
from knowledge_curated_extra import EXTRA_CURATED


def get_catalog():
    return _get_catalog()


def get_pages(module):
    return _get_pages(module)


def build_page(module, page_id):
    page = _build_page(module, page_id)
    extra = EXTRA_CURATED.get((module, page['title']))
    if extra:
        page.update(extra)
        page['curated_status'] = '已完成专题级精编'
    else:
        page['curated_status'] = '已接入原笔记；专题综合持续补强'
    return page
