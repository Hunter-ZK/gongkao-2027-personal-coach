from __future__ import annotations

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field, field_validator

from db import jdump, jload, now_iso, query, query_one, transaction

r = APIRouter(prefix='/api/ai-formulas', tags=['ai-formulas'])
history_r = APIRouter(prefix='/api/ai-conversations', tags=['ai-conversations'])

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


class ConversationIn(BaseModel):
    title: str | None = Field(default=None, max_length=120)
    page_key: str | None = Field(default=None, max_length=40)
    page_title: str | None = Field(default=None, max_length=80)


class MessageIn(BaseModel):
    role: str
    content: str = Field(min_length=1, max_length=30000)
    page_key: str | None = Field(default=None, max_length=40)
    page_title: str | None = Field(default=None, max_length=80)
    context_snapshot: str | None = Field(default=None, max_length=12000)
    sources: list[dict] = Field(default_factory=list, max_length=12)

    @field_validator('role')
    @classmethod
    def validate_role(cls, value: str) -> str:
        if value not in {'user', 'assistant'}:
            raise ValueError('role 仅支持 user / assistant')
        return value


def _out(row: dict) -> dict:
    item = dict(row)
    item['tags'] = jload(item.pop('tags_json', '[]'), []) or []
    return item


def _conversation_out(row: dict) -> dict:
    item = dict(row)
    item['message_count'] = int(item.get('message_count') or 0)
    return item


def _message_out(row: dict) -> dict:
    item = dict(row)
    item['sources'] = jload(item.pop('sources_json', '[]'), []) or []
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


@history_r.get('')
def list_conversations(limit: int = 80):
    limit = max(1, min(limit, 200))
    rows = query(
        '''SELECT c.*,
                  COUNT(m.id) message_count,
                  (SELECT content FROM ai_message x WHERE x.conversation_id=c.id ORDER BY x.id DESC LIMIT 1) preview
           FROM ai_conversation c
           LEFT JOIN ai_message m ON m.conversation_id=c.id
           GROUP BY c.id
           ORDER BY c.updated_at DESC,c.id DESC LIMIT ?''',
        (limit,),
    )
    return [_conversation_out(row) for row in rows]


@history_r.post('')
def create_conversation(body: ConversationIn):
    stamp = now_iso()
    title = (body.title or body.page_title or '新对话').strip()[:120] or '新对话'
    with transaction() as c:
        cur = c.execute(
            'INSERT INTO ai_conversation(title,page_key,page_title,created_at,updated_at) VALUES(?,?,?,?,?)',
            (title, body.page_key, body.page_title, stamp, stamp),
        )
        conversation_id = int(cur.lastrowid)
    return _conversation_out({**query_one('SELECT * FROM ai_conversation WHERE id=?', (conversation_id,)), 'message_count': 0})


@history_r.get('/{conversation_id}/messages')
def list_messages(conversation_id: int):
    if not query_one('SELECT id FROM ai_conversation WHERE id=?', (conversation_id,)):
        raise HTTPException(404, '对话不存在')
    return [_message_out(row) for row in query(
        'SELECT * FROM ai_message WHERE conversation_id=? ORDER BY id', (conversation_id,)
    )]


@history_r.post('/{conversation_id}/messages')
def append_message(conversation_id: int, body: MessageIn):
    conversation = query_one('SELECT * FROM ai_conversation WHERE id=?', (conversation_id,))
    if not conversation:
        raise HTTPException(404, '对话不存在')
    count_before = int((query_one('SELECT COUNT(*) n FROM ai_message WHERE conversation_id=?', (conversation_id,)) or {'n': 0})['n'])
    stamp = now_iso()
    with transaction() as c:
        cur = c.execute(
            '''INSERT INTO ai_message(
                conversation_id,role,content,page_key,page_title,context_snapshot,sources_json,created_at
            ) VALUES(?,?,?,?,?,?,?,?)''',
            (
                conversation_id, body.role, body.content.strip(), body.page_key, body.page_title,
                body.context_snapshot, jdump(body.sources), stamp,
            ),
        )
        if body.role == 'user' and count_before == 0:
            title = body.content.strip().replace('\n', ' ')[:48] or conversation['title']
            c.execute('UPDATE ai_conversation SET title=?,updated_at=? WHERE id=?', (title, stamp, conversation_id))
        else:
            c.execute('UPDATE ai_conversation SET updated_at=? WHERE id=?', (stamp, conversation_id))
        message_id = int(cur.lastrowid)
    return _message_out(query_one('SELECT * FROM ai_message WHERE id=?', (message_id,)))


@history_r.delete('/{conversation_id}')
def delete_conversation(conversation_id: int):
    if not query_one('SELECT id FROM ai_conversation WHERE id=?', (conversation_id,)):
        raise HTTPException(404, '对话不存在')
    with transaction() as c:
        c.execute('DELETE FROM ai_conversation WHERE id=?', (conversation_id,))
    return {'ok': True, 'id': conversation_id}
