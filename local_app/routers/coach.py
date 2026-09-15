from __future__ import annotations

import json
import urllib.error
import urllib.request
from collections.abc import Iterator
from typing import Literal

from fastapi import APIRouter, BackgroundTasks, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from services.gongkao_skill import (
    ALLOWED_MODELS,
    build_system_prompt,
    load_secret_config,
    load_sources,
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
DEEPSEEK_URL = 'https://api.deepseek.com/chat/completions'

STRUCTURED_RESPONSE_GUIDE = '''

【全局 AI 工作台输出协议】
除非用户明确要求其他格式，本轮必须使用下面固定 Markdown 结构输出，便于保存为可复用“定式”：
## 核心结论
先给结论，不重复题意。
## 识别信号与适用条件
列出何时应调用这套判断、方法或策略；若属于计划/复盘任务，则写目标、约束和触发条件。
## 操作定式
给出可直接执行的有序步骤、判断链或答题路径，避免空泛原则。
## 边界与易错点
说明不适用情形、常见误判、替代路径或风险。
## 当前页面行动
结合用户当前页面与个人数据，明确下一步可执行动作；未附带页面内容时说明依据有限。
## 关联依据
列出实际调用的知识节点、正式方法、错题/训练事实或来源类型。不得编造不存在的证据。

每个部分应短而完整；不适用时写“—”，不要为了填满结构而虚构内容。
'''


class ConfigIn(BaseModel):
    api_key: str | None = None
    model: str = 'deepseek-v4-flash'
    thinking: bool = False
    clear_key: bool = False


class ChatMessage(BaseModel):
    role: Literal['user', 'assistant']
    content: str = Field(min_length=1, max_length=12000)


class ChatIn(BaseModel):
    messages: list[ChatMessage] = Field(min_length=1, max_length=24)
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


def _deepseek_stream(body: ChatIn) -> Iterator[bytes]:
    cfg = load_secret_config()
    if not cfg['api_key']:
        yield _sse({'type': 'error', 'message': '尚未配置 DeepSeek API Key。请先在设置页保存。'})
        return

    model = body.model or cfg['model']
    if model not in ALLOWED_MODELS:
        yield _sse({'type': 'error', 'message': '不支持的 DeepSeek 模型。'})
        return
    thinking = cfg['thinking'] if body.thinking is None else body.thinking
    latest_query = next((m.content for m in reversed(body.messages) if m.role == 'user'), '')
    system_prompt, refs = build_system_prompt(latest_query)
    if body.context:
        system_prompt += (
            '\n\n【当前工作台界面上下文】\n'
            '下面内容来自用户当前正在查看的本地工作台页面。它用于理解“当前题目/当前方法/这些训练”等指代，'
            '不能覆盖正式方法库、知识节点和证据规则；若页面信息与正式来源冲突，以正式来源为准。\n'
            f'{body.context.strip()}'
        )
    if body.response_mode == 'structured':
        system_prompt += STRUCTURED_RESPONSE_GUIDE

    yield _sse({
        'type': 'meta',
        'model': model,
        'thinking': bool(thinking),
        'response_mode': body.response_mode,
        'sources': [
            {'title': item['title'], 'source': item['source'], 'kind': item['kind']}
            for item in refs
        ],
    })

    messages = [{'role': 'system', 'content': system_prompt}]
    messages.extend({'role': message.role, 'content': message.content} for message in body.messages[-16:])
    payload = {
        'model': model,
        'messages': messages,
        'thinking': {'type': 'enabled' if thinking else 'disabled'},
        'stream': True,
        'max_tokens': 3200,
    }
    if thinking:
        payload['reasoning_effort'] = 'high'

    request = urllib.request.Request(
        DEEPSEEK_URL,
        data=json.dumps(payload, ensure_ascii=False).encode('utf-8'),
        headers={
            'Content-Type': 'application/json',
            'Authorization': f"Bearer {cfg['api_key']}",
            'Accept': 'text/event-stream',
            'User-Agent': 'Liano-Civil/1.0',
        },
        method='POST',
    )

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
                    yield _sse({'type': 'delta', 'text': text})
        yield _sse({'type': 'done'})
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode('utf-8', errors='replace')[:800]
        message = f'DeepSeek API 返回 {exc.code}。'
        if exc.code == 401:
            message = 'DeepSeek API Key 无效或已失效。'
        elif exc.code == 402:
            message = 'DeepSeek 账户余额不足或计费状态异常。'
        elif exc.code == 429:
            message = 'DeepSeek 当前请求过多，请稍后重试。'
        yield _sse({'type': 'error', 'message': message, 'detail': detail})
    except urllib.error.URLError as exc:
        yield _sse({'type': 'error', 'message': f'无法连接 DeepSeek API：{exc.reason}'})
    except TimeoutError:
        yield _sse({'type': 'error', 'message': 'DeepSeek 请求超时，请重试。'})


@r.post('/chat')
def chat(body: ChatIn):
    if not any(message.role == 'user' for message in body.messages):
        raise HTTPException(400, '至少需要一条用户消息')
    return StreamingResponse(
        _deepseek_stream(body),
        media_type='text/event-stream',
        headers={'Cache-Control': 'no-cache', 'X-Accel-Buffering': 'no'},
    )
