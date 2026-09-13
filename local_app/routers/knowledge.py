from __future__ import annotations
import html, json
from pathlib import Path
from fastapi import APIRouter, HTTPException, Response
from markdown_it import MarkdownIt
from db import query, query_one, transaction, now_iso, jload
from services.mastery import recompute
r=APIRouter(prefix='/api')
BASE=Path(__file__).resolve().parents[1]; NODES=BASE/'content'/'nodes'; LEGACY=BASE/'content'/'legacy_notes'
md=MarkdownIt('commonmark',{'html':False}).enable('table')
@r.get('/knowledge/tree')
def tree(exam:str='guangdong'):
    rows=query("SELECT k.*,n.state,n.sample_n,n.accuracy FROM knowledge_node k LEFT JOIN node_mastery n ON n.node_slug=k.slug ORDER BY k.subject,k.seq")
    for x in rows: x['module_names']=jload(x['module_names'],{})
    return rows
@r.get('/knowledge/node/{slug}')
def node(slug:str):
    m=query_one("SELECT k.*,n.state,n.sample_n,n.accuracy,n.avg_seconds FROM knowledge_node k LEFT JOIN node_mastery n ON n.node_slug=k.slug WHERE k.slug=?",(slug,))
    if not m: raise HTTPException(404,'知识节点不存在')
    body=''; m['module_names']=jload(m['module_names'],{})
    if m.get('content_path') and (NODES/m['content_path']).exists(): body=(NODES/m['content_path']).read_text('utf-8')
    if body.startswith('---'):
        pos=body.find('\n---',3); body=body[pos+4:] if pos>=0 else body
    rendered=md.render(body) if body else ''
    excerpts=query("SELECT * FROM legacy_excerpt WHERE node_slug=?",(slug,))
    for ex in excerpts:
        src=LEGACY/ex['file_name']
        ex['text']=src.read_text(encoding='utf-8') if src.exists() else None
    mistakes=query("SELECT m.id,m.status,m.cause_primary,q.stem_md FROM mistake m JOIN question q ON q.id=m.question_id WHERE q.node_slug=? ORDER BY m.id DESC",(slug,))
    history=query("SELECT * FROM mastery_history WHERE node_slug=? ORDER BY created_at DESC,id DESC LIMIT 20",(slug,))
    return {'meta':m,'html':rendered,'legacy_excerpts':excerpts,'mastery':{k:m.get(k) for k in ['state','sample_n','accuracy','avg_seconds']},'mastery_history':history,'mistakes':mistakes,'related':[]}
@r.get('/knowledge/search')
def search(q:str=''):
    return query("SELECT slug,title,build_status,priority_batch FROM knowledge_node WHERE title LIKE ? OR slug LIKE ? ORDER BY seq LIMIT 40",(f'%{q}%',f'%{q}%'))
@r.post('/knowledge/node/{slug}/closed-book')
def closed_book(slug:str):
    with transaction() as c:c.execute("UPDATE node_mastery SET closed_book_passed=1,updated_at=? WHERE node_slug=?",(now_iso(),slug))
    return {'ok':True,'mastery':recompute(slug)}
@r.get('/knowledge/node/{slug}/export.pdf')
def export_node(slug:str):
    data=node(slug); body=f"<html><head><meta charset='utf-8'><title>{html.escape(data['meta']['title'])}</title><style>body{{font-family:sans-serif;max-width:760px;margin:40px auto;line-height:1.8}}@media print{{button{{display:none}}}}</style></head><body><button onclick='print()'>打印/另存为 PDF</button><h1>{html.escape(data['meta']['title'])}</h1>{data['html']}</body></html>"
    return Response(body,media_type='text/html; charset=utf-8')
@r.get('/knowledge/module/{name}/export.pdf')
def export_module(name:str):
    nodes=query("SELECT slug,title FROM knowledge_node WHERE module_names LIKE ? AND content_path IS NOT NULL ORDER BY seq",(f'%{name}%',))
    parts=[]
    for n in nodes:
        d=node(n['slug']); parts.append(f"<section><h1>{html.escape(n['title'])}</h1>{d['html']}</section>")
    return Response("<html><head><meta charset='utf-8'><style>body{font-family:sans-serif;max-width:760px;margin:40px auto;line-height:1.8}section{break-after:page}</style></head><body><button onclick='print()'>打印/另存为 PDF</button>"+''.join(parts)+"</body></html>",media_type='text/html; charset=utf-8')
