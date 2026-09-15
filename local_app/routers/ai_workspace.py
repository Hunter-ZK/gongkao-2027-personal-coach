from __future__ import annotations

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field, field_validator

from db import jdump, jload, now_iso, query, query_one, transaction

r = APIRouter(prefix='/api/ai-formulas', tags=['ai-formulas'])

CATEGORIES = {
    '解题方法', '错题复盘', '训练分析', '训练策略', '申论表达', '页面分析', '综合定式'
}


class FormulaIn(BaseModel):
    title: str = Field(min_length=1, max_length=120)
    category: str = '综合定式'
    page_key: str | None = Field(default=None, max_length=40)
    page_title: str | None = Field(default=None, max_length=80)
    user_query: str = Field(min_length=1, max_length=12000)
    response_md: str = Field(min_length=1, max_length=30000)
    context_snapshot: str | None = Field(default=None, max_length=12000)
    tags: list[str] = Field(default_factory=list, max_length=12)

    @field_validator('category')
    @classmethod
    def validate_category(cls, value: str) -> str:
        if value not in CATEGORIES:
            raise ValueError('未知定式分类')
        return value


class FormulaPatch(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=120)
    category: str | None = None
    tags: list[str] | None = Field(default=None, max_length=12)

    @field_validator('category')
    @classmethod
    def validate_category(cls, value: str | None) -> str | None:
        if value is not None and value not in CATEGORIES:
            raise ValueError('未知定式分类')
        return value


def _out(row: dict) -> dict:
    item = dict(row)
    item['tags'] = jload(item.pop('tags_json', '[]'), []) or []
    return item


@r.get('')
def list_formulas(limit: int = 100):
    limit = max(1, min(limit, 300))
    return [_out(row) for row in query(
        'SELECT * FROM ai_formula ORDER BY created_at DESC, id DESC LIMIT ?', (limit,)
    )]


@r.post('')
def create_formula(body: FormulaIn):
    stamp = now_iso()
    with transaction() as c:
        cur = c.execute(
            '''INSERT INTO ai_formula(
                title,category,page_key,page_title,user_query,response_md,context_snapshot,tags_json,created_at,updated_at
            ) VALUES(?,?,?,?,?,?,?,?,?,?)''',
            (
                body.title.strip(), body.category, body.page_key, body.page_title,
                body.user_query.strip(), body.response_md.strip(), body.context_snapshot,
                jdump([tag.strip() for tag in body.tags if tag.strip()]), stamp, stamp,
            ),
        )
        formula_id = cur.lastrowid
    return _out(query_one('SELECT * FROM ai_formula WHERE id=?', (formula_id,)))


@r.patch('/{formula_id}')
def patch_formula(formula_id: int, body: FormulaPatch):
    current = query_one('SELECT * FROM ai_formula WHERE id=?', (formula_id,))
    if not current:
        raise HTTPException(404, '定式不存在')
    title = body.title.strip() if body.title is not None else current['title']
    category = body.category if body.category is not None else current['category']
    tags_json = jdump([tag.strip() for tag in body.tags if tag.strip()]) if body.tags is not None else current['tags_json']
    with transaction() as c:
        c.execute(
            'UPDATE ai_formula SET title=?,category=?,tags_json=?,updated_at=? WHERE id=?',
            (title, category, tags_json, now_iso(), formula_id),
        )
    return _out(query_one('SELECT * FROM ai_formula WHERE id=?', (formula_id,)))


@r.delete('/{formula_id}')
def delete_formula(formula_id: int):
    if not query_one('SELECT id FROM ai_formula WHERE id=?', (formula_id,)):
        raise HTTPException(404, '定式不存在')
    with transaction() as c:
        c.execute('DELETE FROM ai_formula WHERE id=?', (formula_id,))
    return {'ok': True, 'id': formula_id}
