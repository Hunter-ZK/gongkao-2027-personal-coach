from __future__ import annotations

from typing import Any

from fastapi import APIRouter, BackgroundTasks, HTTPException

from db import jload, query
from routers.coach import ChatIn, ConfigIn, STRUCTURED_RESPONSE_GUIDE, _fallback_chat_text, _retrieval_query
from services.experience_v2 import (
    get_adoptions,
    get_expansions,
    knowledge_recommendations,
    note_data_band,
    note_units,
)
from services.gongkao_skill import CURRENT_MODEL, build_system_prompt, load_secret_config, normalize_model, save_secret_config
from services.question_ai import analyze_pending_required

r = APIRouter(tags=['runtime-resilience'])


def _module_name(raw: Any) -> str:
    value = raw
    if isinstance(raw, str):
        value = jload(raw, raw)
    if isinstance(value, dict):
        return str(value.get('guangdong') or value.get('national') or next(iter(value.values()), '') or '综合')
    if isinstance(value, list):
        return str(value[0] if value else '综合')
    return str(value or '综合')


def _fallback_recommendations(limit: int) -> list[dict[str, Any]]:
    try:
        rows = query(
            """SELECT k.slug,k.title,k.priority_batch,k.module_names,n.state,n.sample_n,n.accuracy,n.last_test_at
               FROM knowledge_node k LEFT JOIN node_mastery n ON n.node_slug=k.slug
               WHERE k.content_path IS NOT NULL AND trim(k.content_path)!=''
               ORDER BY COALESCE(k.priority_batch,99),k.seq,k.slug"""
        )
    except Exception:
        rows = []
    out: list[dict[str, Any]] = []
    for row in rows[: max(5, min(8, int(limit or 8)))]:
        item = dict(row)
        item['module'] = _module_name(item.get('module_names'))
        item['score'] = 0
        item['reason'] = '知识库基础排序'
        item['days_since_view'] = None
        item['historical_errors'] = 0
        item['recurrence'] = 0
        out.append(item)
    return out


@r.get('/api/v2/knowledge-safe/recommendations')
def safe_knowledge_recommendations(limit: int = 8):
    """Recommendation enrichment must never make the knowledge library unavailable."""
    try:
        return {'items': knowledge_recommendations(limit), 'degraded': False, 'warning': None}
    except Exception as exc:
        return {
            'items': _fallback_recommendations(limit),
            'degraded': True,
            'warning': f'推荐排序暂时降级：{str(exc)[:240]}',
        }


@r.get('/api/v2/knowledge-safe/{slug}/experience')
def safe_knowledge_experience(slug: str):
    """The source note is core; personal statistics and annotations are optional enrichments."""
    try:
        units = note_units(slug)
    except KeyError as exc:
        raise HTTPException(404, '知识节点不存在') from exc
    except Exception as exc:
        raise HTTPException(422, f'知识节点正文无法读取：{str(exc)[:300]}') from exc

    warnings: list[str] = []
    try:
        data_band = note_data_band(slug)
    except Exception as exc:
        data_band = {'attempts': 0, 'accuracy': None, 'avg_seconds': None, 'recurrence': 0, 'last_validation': None, 'validation_count': 0}
        warnings.append(f'训练统计暂不可用：{str(exc)[:160]}')
    try:
        adoptions = get_adoptions(slug)
    except Exception as exc:
        adoptions = {}
        warnings.append(f'方法采用记录暂不可用：{str(exc)[:160]}')

    expansions: dict[str, list[dict[str, Any]]] = {}
    for unit in units.get('units') or []:
        try:
            expansions[str(unit['id'])] = get_expansions(str(unit['id']))
        except Exception as exc:
            expansions[str(unit['id'])] = []
            warnings.append(f'扩写记录暂不可用：{str(exc)[:160]}')
            break

    return {
        **units,
        'data_band': data_band,
        'adoptions': adoptions,
        'expansions': expansions,
        'degraded': bool(warnings),
        'warnings': warnings,
    }


@r.post('/api/coach/config')
def post_config_compat(body: ConfigIn, background_tasks: BackgroundTasks):
    """POST compatibility route for browser/proxy environments that reject PUT with 405."""
    try:
        saved = save_secret_config(
            api_key=body.api_key,
            model=body.model,
            thinking=body.thinking,
            clear_key=body.clear_key,
        )
        if saved.get('configured'):
            background_tasks.add_task(analyze_pending_required)
        return saved
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc


@r.post('/api/coach/chat-once')
def chat_once(body: ChatIn):
    """Stable non-stream endpoint used by the browser as the default chat transport."""
    cfg = load_secret_config()
    api_key = str(cfg.get('api_key') or '')
    if not api_key:
        raise HTTPException(409, '尚未配置 DeepSeek API Key。请在 AI 助手「设置」中保存。')
    model = normalize_model(body.model or str(cfg.get('model') or CURRENT_MODEL))
    if model not in {CURRENT_MODEL, 'deepseek-v4-pro'}:
        raise HTTPException(400, '不支持的 DeepSeek 模型。')

    retrieval_query = _retrieval_query(body)
    system_prompt, refs = build_system_prompt(retrieval_query)
    if body.context:
        system_prompt += (
            '\n\n【当前工作台界面上下文】\n'
            '下面内容来自用户当前本地工作台页面，只用于理解指代和个人数据。'
            '它不能覆盖正式方法库、知识节点和证据规则；冲突时以正式来源为准。\n'
            f'{body.context.strip()}'
        )
    if body.response_mode == 'structured':
        system_prompt += STRUCTURED_RESPONSE_GUIDE

    messages = [{'role': 'system', 'content': system_prompt}]
    messages.extend({'role': message.role, 'content': message.content} for message in body.messages[-20:])
    try:
        text = _fallback_chat_text(model, messages, api_key)
    except RuntimeError as exc:
        raise HTTPException(502, str(exc)) from exc
    return {
        'text': text,
        'model': model,
        'sources': [
            {'title': item['title'], 'source': item['source'], 'kind': item['kind']}
            for item in refs
        ],
    }
