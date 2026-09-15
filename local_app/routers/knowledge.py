from __future__ import annotations

import html
from pathlib import Path

from fastapi import APIRouter, HTTPException, Response
from markdown_it import MarkdownIt

from db import jload, now_iso, query, query_one, transaction
from services.knowledge_reader import reading_pack
from services.mastery import recompute

r = APIRouter(prefix='/api')
BASE = Path(__file__).resolve().parents[1]
NODES = BASE / 'content' / 'nodes'
LEGACY = BASE / 'content' / 'legacy_notes'
md = MarkdownIt('commonmark', {'html': False}).enable('table')


def _node_body(row: dict) -> str:
    path = row.get('content_path')
    if not path:
        return ''
    full = NODES / path
    if not full.exists():
        return ''
    body = full.read_text(encoding='utf-8')
    if body.startswith('---'):
        pos = body.find('\n---', 3)
        body = body[pos + 4:] if pos >= 0 else body
    return body.strip()


def _module_from_names(raw) -> str:
    values = jload(raw, {}) if isinstance(raw, str) else (raw or {})
    if isinstance(values, dict):
        for exam in ('guangdong', 'national'):
            value = str(values.get(exam) or '').strip()
            if value:
                return value
        for value in values.values():
            if str(value or '').strip():
                return str(value).strip()
    if isinstance(values, list) and values:
        return str(values[0])
    return '综合'


@r.get('/knowledge/tree')
def tree(exam: str = 'guangdong'):
    rows = query(
        "SELECT k.*,n.state,n.sample_n,n.accuracy FROM knowledge_node k "
        "LEFT JOIN node_mastery n ON n.node_slug=k.slug ORDER BY k.subject,k.seq"
    )
    for row in rows:
        row['module_names'] = jload(row.get('module_names'), {})
        row['module'] = _module_from_names(row['module_names'])
    return rows


@r.get('/knowledge/node/{slug}')
def node(slug: str):
    meta = query_one(
        "SELECT k.*,n.state,n.sample_n,n.accuracy,n.avg_seconds FROM knowledge_node k "
        "LEFT JOIN node_mastery n ON n.node_slug=k.slug WHERE k.slug=?",
        (slug,),
    )
    if not meta:
        raise HTTPException(404, '知识节点不存在')
    meta['module_names'] = jload(meta.get('module_names'), {})
    meta['module'] = _module_from_names(meta['module_names'])
    body = _node_body(meta)
    excerpts = query('SELECT * FROM legacy_excerpt WHERE node_slug=?', (slug,))
    for excerpt in excerpts:
        src = LEGACY / excerpt['file_name']
        excerpt['text'] = src.read_text(encoding='utf-8') if src.exists() else None
    mistakes = query(
        "SELECT m.id,m.status,m.cause_primary,q.stem_md FROM mistake m "
        "JOIN question q ON q.id=m.question_id WHERE q.node_slug=? ORDER BY m.id DESC",
        (slug,),
    )
    history = query('SELECT * FROM mastery_history WHERE node_slug=? ORDER BY created_at DESC,id DESC LIMIT 20', (slug,))
    return {
        'meta': meta,
        'markdown': body,
        'html': md.render(body) if body else '',
        'legacy_excerpts': excerpts,
        'mastery': {k: meta.get(k) for k in ['state', 'sample_n', 'accuracy', 'avg_seconds']},
        'mastery_history': history,
        'mistakes': mistakes,
        'related': [],
    }


@r.get('/knowledge/node/{slug}/reading')
def reading(slug: str):
    data = node(slug)
    meta = data['meta']
    pack = reading_pack(slug, meta.get('module') or '综合', data.get('markdown') or '')
    return {
        'meta': meta,
        **pack,
        'mastery': data['mastery'],
        'mistakes': data['mistakes'],
    }


@r.get('/knowledge/search')
def search(q: str = ''):
    return query(
        'SELECT slug,title,build_status,priority_batch FROM knowledge_node '
        'WHERE title LIKE ? OR slug LIKE ? ORDER BY seq LIMIT 40',
        (f'%{q}%', f'%{q}%'),
    )


@r.post('/knowledge/node/{slug}/closed-book')
def closed_book(slug: str):
    with transaction() as conn:
        conn.execute('UPDATE node_mastery SET closed_book_passed=1,updated_at=? WHERE node_slug=?', (now_iso(), slug))
    return {'ok': True, 'mastery': recompute(slug)}


@r.get('/knowledge/node/{slug}/export.pdf')
def export_node(slug: str):
    data = node(slug)
    body = (
        "<html><head><meta charset='utf-8'><title>" + html.escape(data['meta']['title']) + "</title>"
        "<style>body{font-family:sans-serif;max-width:760px;margin:40px auto;line-height:1.8}"
        "@media print{button{display:none}}</style></head><body>"
        "<button onclick='print()'>打印/另存为 PDF</button><h1>" + html.escape(data['meta']['title']) + '</h1>' + data['html'] + '</body></html>'
    )
    return Response(body, media_type='text/html; charset=utf-8')


@r.get('/knowledge/module/{name}/export.pdf')
def export_module(name: str):
    nodes = query(
        'SELECT slug,title FROM knowledge_node WHERE module_names LIKE ? AND content_path IS NOT NULL ORDER BY seq',
        (f'%{name}%',),
    )
    parts = []
    for item in nodes:
        data = node(item['slug'])
        parts.append(f"<section><h1>{html.escape(item['title'])}</h1>{data['html']}</section>")
    body = (
        "<html><head><meta charset='utf-8'><style>body{font-family:sans-serif;max-width:760px;margin:40px auto;line-height:1.8}"
        "section{break-after:page}</style></head><body><button onclick='print()'>打印/另存为 PDF</button>"
        + ''.join(parts) + '</body></html>'
    )
    return Response(body, media_type='text/html; charset=utf-8')
