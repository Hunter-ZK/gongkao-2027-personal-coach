from __future__ import annotations

import json
import time
import urllib.error
import urllib.request
from collections.abc import Iterator
from typing import Literal

from fastapi import APIRouter, BackgroundTasks, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from services.gongkao_skill import (
    CURRENT_MODEL,
    build_system_prompt,
    load_secret_config,
    load_sources,
    normalize_model,
    public_config,
    save_secret_config,
)
from services.mistake_ai import (
    analyze_many_mistakes,
    analyze_mistake,
    configured as mistake_ai_configured,
    mistake_ids_for_training,
)
from services.question_ai import analyze_pending_required

r = APIRouter(prefix='/api/coach', tags=['coach'])
# DeepSeek's current first-party integrations use the explicit /v1 Chat Completions URL.
# The non-/v1 path is retained as a compatibility fallback because both forms exist in official docs.
DEEPSEEK_URLS = (
    'https://api.deepseek.com/v1/chat/completions',
    'https://api.deepseek.com/chat/completions',
)
DEEPSEEK_URL = DEEPSEEK_URLS[0]

STRUCTURED_RESPONSE_GUIDE = '''

【全局 AI 工作台简明输出协议】
默认不要写成长篇课程或连续大段 Markdown。总长度优先控制在 300–650 个中文字；确需完整教学时才展开。
必须使用下面四段，每段以短句/项目符号为主：

## 结论
- 直接回答当前问题，1–3 点。
## 怎么判断
- 识别信号、适用条件或关键证据，最多 4 点。
## 怎么做
- 给 2–6 步可执行动作；解题时写“识别 → 主方法 → 最短路径/计算 → 停止条件”。
## 注意
- 只保留最重要的边界、易错点、止损或下一步，最多 4 点。

额外规则：
1. 禁止用长段背景、重复题意和空泛鼓励凑字数。
2. 必须实际使用“本轮实际检索”到的 Skill / 正式方法材料；若无直接证据就明确说明。
3. 检索到“考点讲法”时必须吸收其中的考场入口/取舍/速解重点，而不是只在末尾挂来源。
4. 最后一行固定写“依据：材料A；材料B”，只列本轮真正使用的 1–3 个材料标题。
'''


class ConfigIn(BaseModel):
    api_key: str | None = None
    model: str = CURRENT_MODEL
    thinking: bool = False
    clear_key: bool = False


class ConfigTestIn(BaseModel):
    api_key: str | None = None
    model: str | None = None
    thinking: bool | None = None


class ChatMessage(BaseModel):
    role: Literal['user', 'assistant']
    content: str = Field(min_length=1, max_length=12000)


class ChatIn(BaseModel):
    messages: list[ChatMessage] = Field(min_length=1, max_length=40)
    model: str | None = None
    thinking: bool | None = None
    context: str | None = Field(default=None, max_length=12000)
    response_mode: Literal['default', 'structured'] = 'default'


@r.get('/config')
def get_config():
    return {**public_config(), 'skill_name': 'gongkao-method-coach', 'sources': load_sources()}


@r.put('/config')
def put_config(body: ConfigIn, background_tasks: BackgroundTasks):
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


@r.post('/config/test')
def test_config(body: ConfigTestIn):
    stored = load_secret_config()
    api_key = (body.api_key or '').strip() or str(stored.get('api_key') or '')
    if not api_key:
        raise HTTPException(409, '请先填写或保存 DeepSeek API Key。')
    model = normalize_model(body.model or str(stored.get('model') or CURRENT_MODEL))
    thinking = bool(stored.get('thinking')) if body.thinking is None else bool(body.thinking)
    payload = {
        'model': model,
        'messages': [
            {'role': 'system', 'content': '这是连接测试。不要解释，只回复：OK'},
            {'role': 'user', 'content': 'ping'},
        ],
        'thinking': {'type': 'enabled' if thinking else 'disabled'},
        'stream': False,
        'max_tokens': 32,
    }
    started = time.monotonic()
    try:
        text = _request_text(payload, api_key)
        if not text:
            raise RuntimeError('DeepSeek 返回空内容')
        return {
            'ok': True,
            'model': model,
            'thinking': thinking,
            'message': '连接正常',
            'latency_ms': round((time.monotonic() - started) * 1000),
        }
    except RuntimeError as exc:
        raise HTTPException(502, str(exc)) from exc


@r.post('/analyze-training/{training_id}')
def analyze_training(training_id: int, background_tasks: BackgroundTasks):
    mistake_ids = mistake_ids_for_training(training_id)
    if not mistake_ids:
        return {'configured': mistake_ai_configured(), 'scheduled': 0, 'mistake_ids': []}
    if not mistake_ai_configured():
        return {
            'configured': False,
            'scheduled': 0,
            'mistake_ids': mistake_ids,
            'message': '错题 AI 解析任务已持久化；DeepSeek 尚未配置，配置后会继续处理。',
        }
    background_tasks.add_task(analyze_many_mistakes, mistake_ids)
    return {
        'configured': True,
        'scheduled': len(mistake_ids),
        'mistake_ids': mistake_ids,
        'message': f'已提交 {len(mistake_ids)} 道错题给 DeepSeek 后台解析。',
    }


@r.post('/analyze-mistake/{mistake_id}')
def analyze_single_mistake(mistake_id: int):
    if not mistake_ai_configured():
        raise HTTPException(409, '尚未配置 DeepSeek API Key；任务会保留，不会丢失。')
    try:
        return analyze_mistake(mistake_id, overwrite=True)
    except RuntimeError as exc:
        raise HTTPException(502, str(exc)) from exc


def _sse(payload: dict) -> bytes:
    return ('data: ' + json.dumps(payload, ensure_ascii=False) + '\n\n').encode('utf-8')


def _retrieval_query(body: ChatIn) -> str:
    recent = body.messages[-10:]
    parts = [f'{m.role}: {m.content.strip()}' for m in recent if m.content.strip()]
    if body.context:
        parts.append('page_context: ' + body.context.strip()[:2500])
    return '\n'.join(parts)[-18000:]


def _error_message(exc: urllib.error.HTTPError) -> tuple[str, str]:
    detail = exc.read().decode('utf-8', errors='replace')[:1000]
    if exc.code == 401:
        return 'DeepSeek API Key 无效或已失效。', detail
    if exc.code == 402:
        return 'DeepSeek 账户余额不足或计费状态异常。', detail
    if exc.code == 405:
        return 'DeepSeek 接口返回 405 Method Not Allowed；已自动尝试兼容地址。', detail
    if exc.code == 429:
        return 'DeepSeek 当前请求过多，请稍后重试。', detail
    if exc.code == 400:
        return 'DeepSeek 拒绝了当前请求参数；已尝试兼容降级仍失败。', detail
    return f'DeepSeek API 返回 {exc.code}。', detail


def _request_text(payload: dict, api_key: str) -> str:
    route_errors: list[str] = []
    for index, url in enumerate(DEEPSEEK_URLS):
        request = urllib.request.Request(
            url,
            data=json.dumps(payload, ensure_ascii=False).encode('utf-8'),
            headers={
                'Content-Type': 'application/json',
                'Authorization': f'Bearer {api_key}',
                'User-Agent': 'Liano-Civil/1.0',
            },
            method='POST',
        )
        try:
            with urllib.request.urlopen(request, timeout=90) as response:
                body = json.loads(response.read().decode('utf-8', errors='replace'))
            break
        except urllib.error.HTTPError as exc:
            message, detail = _error_message(exc)
            route_errors.append(f'{url}: {message} {detail[:180]}'.strip())
            if exc.code in {404, 405} and index < len(DEEPSEEK_URLS) - 1:
                continue
            raise RuntimeError(f'{message} {detail[:400]}'.strip()) from exc
        except urllib.error.URLError as exc:
            raise RuntimeError(f'无法连接 DeepSeek API：{exc.reason}') from exc
    else:
        raise RuntimeError('DeepSeek 接口地址均不可用。' + '；'.join(route_errors)[:600])

    choices = body.get('choices') or []
    if not choices:
        raise RuntimeError('DeepSeek 未返回有效 choices。')
    content = (choices[0].get('message') or {}).get('content')
    if isinstance(content, (dict, list)):
        return json.dumps(content, ensure_ascii=False)
    text = str(content or '').strip()
    if not text:
        raise RuntimeError('DeepSeek final content 为空。')
    return text


def _fallback_chat_text(model: str, messages: list[dict[str, str]], api_key: str) -> str:
    errors: list[str] = []
    variants = [
        {
            'model': model,
            'messages': messages,
            'thinking': {'type': 'disabled'},
            'stream': False,
            'max_tokens': 2200,
        },
        {
            'model': model,
            'messages': messages + [{'role': 'user', 'content': '上一请求没有返回最终正文。请直接给出最终回答，不要输出空内容。'}],
            'thinking': {'type': 'disabled'},
            'stream': False,
            'max_tokens': 2200,
        },
    ]
    for payload in variants:
        try:
            return _request_text(payload, api_key)
        except RuntimeError as exc:
            errors.append(str(exc))
    raise RuntimeError('DeepSeek 连续未返回最终正文。' + '；'.join(dict.fromkeys(errors))[:600])


def _deepseek_stream(body: ChatIn) -> Iterator[bytes]:
    cfg = load_secret_config()
    api_key = str(cfg.get('api_key') or '')
    if not api_key:
        yield _sse({'type': 'error', 'message': '尚未配置 DeepSeek API Key。请在 AI 助手「设置」中保存。', 'code': 'not_configured'})
        return

    model = normalize_model(body.model or str(cfg.get('model') or CURRENT_MODEL))
    if model not in {CURRENT_MODEL, 'deepseek-v4-pro'}:
        yield _sse({'type': 'error', 'message': '不支持的 DeepSeek 模型。', 'code': 'unsupported_model'})
        return
    thinking = bool(cfg.get('thinking')) if body.thinking is None else bool(body.thinking)
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

    source_meta = [
        {'title': item['title'], 'source': item['source'], 'kind': item['kind']}
        for item in refs
    ]
    yield _sse({
        'type': 'meta',
        'model': model,
        'thinking': thinking,
        'response_mode': body.response_mode,
        'skill_name': 'gongkao-method-coach',
        'skill_applied': bool(refs),
        'sources': source_meta,
    })

    messages = [{'role': 'system', 'content': system_prompt}]
    messages.extend({'role': message.role, 'content': message.content} for message in body.messages[-20:])
    payload: dict = {
        'model': model,
        'messages': messages,
        'thinking': {'type': 'enabled' if thinking else 'disabled'},
        'stream': True,
        'max_tokens': 1800 if body.response_mode == 'structured' else 2600,
    }
    if thinking:
        payload['reasoning_effort'] = 'high'

    request = urllib.request.Request(
        DEEPSEEK_URL,
        data=json.dumps(payload, ensure_ascii=False).encode('utf-8'),
        headers={
            'Content-Type': 'application/json',
            'Authorization': f'Bearer {api_key}',
            'Accept': 'text/event-stream',
            'User-Agent': 'Liano-Civil/1.0',
        },
        method='POST',
    )

    emitted = False
    try:
        with urllib.request.urlopen(request, timeout=90) as response:
            for raw in response:
                line = raw.decode('utf-8', errors='replace').strip()
                if not line.startswith('data:'):
                    continue
                data = line[5:].strip()
                if data == '[DONE]':
                    break
                try:
                    chunk = json.loads(data)
                except json.JSONDecodeError:
                    continue
                choices = chunk.get('choices') or []
                if not choices:
                    continue
                delta = choices[0].get('delta') or {}
                text = delta.get('content')
                if text:
                    emitted = True
                    yield _sse({'type': 'delta', 'text': text})
        if not emitted:
            fallback = _fallback_chat_text(model, messages, api_key)
            yield _sse({'type': 'delta', 'text': fallback, 'fallback': True})
        yield _sse({'type': 'done'})
    except urllib.error.HTTPError as exc:
        if exc.code in {400, 404, 405} and not emitted:
            try:
                fallback = _fallback_chat_text(model, messages, api_key)
                yield _sse({'type': 'delta', 'text': fallback, 'fallback': True})
                yield _sse({'type': 'done'})
                return
            except RuntimeError:
                pass
        message, detail = _error_message(exc)
        yield _sse({'type': 'error', 'message': message, 'detail': detail, 'code': f'http_{exc.code}'})
    except urllib.error.URLError as exc:
        yield _sse({'type': 'error', 'message': f'无法连接 DeepSeek API：{exc.reason}', 'code': 'network'})
    except TimeoutError:
        yield _sse({'type': 'error', 'message': 'DeepSeek 请求超时，请重试。', 'code': 'timeout'})
    except RuntimeError as exc:
        yield _sse({'type': 'error', 'message': str(exc), 'code': 'empty_or_invalid'})


@r.post('/chat')
def chat(body: ChatIn):
    if not any(message.role == 'user' for message in body.messages):
        raise HTTPException(400, '至少需要一条用户消息')
    return StreamingResponse(
        _deepseek_stream(body),
        media_type='text/event-stream',
        headers={'Cache-Control': 'no-cache', 'X-Accel-Buffering': 'no'},
    )
