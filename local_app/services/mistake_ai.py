from __future__ import annotations

import json
import re
import urllib.error
import urllib.request
from typing import Any

from db import jdump, jload, now_iso, query, query_one, transaction
from services.gongkao_skill import ALLOWED_MODELS, build_system_prompt, load_secret_config

CAUSES = [
    '审题错误', '主体错误', '时间错误', '单位错误', '题型识别错误', '方法选择错误',
    '公式调用错误', '推理链遗漏', '计算错误', '速度问题', '取舍问题', '知识缺口',
    '方法生疏', '偶发失误',
]
DEEPSEEK_URL = 'https://api.deepseek.com/chat/completions'
AI_MARKER = 'AI 初步分析（错因需人工确认）'


def configured() -> bool:
    return bool(load_secret_config().get('api_key'))


def mistake_ids_for_training(training_id: int) -> list[int]:
    rows = query(
        'SELECT m.id FROM mistake m JOIN question q ON q.id=m.question_id WHERE q.training_id=? ORDER BY m.id',
        (training_id,),
    )
    return [int(row['id']) for row in rows]


def _question_payload(mistake_id: int) -> dict[str, Any] | None:
    row = query_one(
        """SELECT m.*,q.module,q.subtype,q.stem_md,q.options_json,q.user_answer,q.correct_answer,q.node_slug
        FROM mistake m JOIN question q ON q.id=m.question_id WHERE m.id=?""",
        (mistake_id,),
    )
    if not row:
        return None
    row['options'] = jload(row.get('options_json'), {})
    return row


def _strip_json_fence(text: str) -> str:
    value = text.strip()
    value = re.sub(r'^```(?:json)?\s*', '', value, flags=re.I)
    value = re.sub(r'\s*```$', '', value)
    first = value.find('{')
    last = value.rfind('}')
    return value[first:last + 1] if first >= 0 and last > first else value


def _call_deepseek(system_prompt: str, user_prompt: str) -> dict[str, Any]:
    cfg = load_secret_config()
    if not cfg.get('api_key'):
        raise RuntimeError('DeepSeek API Key 未配置')
    model = cfg.get('model') if cfg.get('model') in ALLOWED_MODELS else 'deepseek-v4-flash'
    payload = {
        'model': model,
        'messages': [
            {'role': 'system', 'content': system_prompt},
            {'role': 'user', 'content': user_prompt},
        ],
        'thinking': {'type': 'enabled' if cfg.get('thinking') else 'disabled'},
        'stream': False,
        'max_tokens': 2200,
        'response_format': {'type': 'json_object'},
    }
    request = urllib.request.Request(
        DEEPSEEK_URL,
        data=json.dumps(payload, ensure_ascii=False).encode('utf-8'),
        headers={
            'Content-Type': 'application/json',
            'Authorization': f"Bearer {cfg['api_key']}",
            'User-Agent': 'Liano-Civil/1.0',
        },
        method='POST',
    )
    try:
        with urllib.request.urlopen(request, timeout=90) as response:
            body = json.loads(response.read().decode('utf-8', errors='replace'))
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode('utf-8', errors='replace')[:500]
        raise RuntimeError(f'DeepSeek API 返回 {exc.code}: {detail}') from exc
    except urllib.error.URLError as exc:
        raise RuntimeError(f'无法连接 DeepSeek API: {exc.reason}') from exc
    choices = body.get('choices') or []
    if not choices:
        raise RuntimeError('DeepSeek 未返回有效内容')
    content = str((choices[0].get('message') or {}).get('content') or '')
    if not content:
        raise RuntimeError('DeepSeek 返回内容为空')
    try:
        result = json.loads(_strip_json_fence(content))
    except json.JSONDecodeError as exc:
        raise RuntimeError('DeepSeek 错题解析不是有效 JSON') from exc
    return result if isinstance(result, dict) else {}


def _valid_node_slugs(values: Any) -> list[str]:
    if not isinstance(values, list):
        return []
    out: list[str] = []
    for value in values[:5]:
        slug = str(value or '').strip()
        if slug and query_one('SELECT slug FROM knowledge_node WHERE slug=?', (slug,)):
            out.append(slug)
    return out


def analyze_mistake(mistake_id: int, *, overwrite: bool = False) -> dict[str, Any]:
    item = _question_payload(mistake_id)
    if not item:
        return {'mistake_id': mistake_id, 'status': 'missing'}
    if not configured():
        return {'mistake_id': mistake_id, 'status': 'skipped', 'reason': 'deepseek_not_configured'}

    options = item.get('options') or {}
    option_text = '\n'.join(f'{key}. {options.get(key, "")}' for key in ('A', 'B', 'C', 'D') if key in options)
    query_text = f"{item.get('module') or ''} {item.get('subtype') or ''} {item.get('stem_md') or ''} {option_text}"
    system_prompt, refs = build_system_prompt(query_text)
    source_titles = [ref.get('title') for ref in refs[:4] if ref.get('title')]
    prompt = f"""请解析下面这道用户真实错题。你的分析必须优先服从系统提示里检索到的本地 Skill / V2 方法材料。

题目模块：{item.get('module') or '未分类'}
题型：{item.get('subtype') or '未分类'}
题干：{item.get('stem_md') or '题干文本缺失，请谨慎'}
选项：
{option_text or '选项文本缺失'}
用户答案：{item.get('user_answer') or '未知'}
正确答案：{item.get('correct_answer') or '未知'}
当前知识节点：{item.get('node_slug') or '未绑定'}

只返回 JSON，不要 Markdown 代码块。字段必须为：
{{
  "standard_solution_md": "稳定、可复现的主方法解法",
  "fastest_solution_md": "考场更快路径；没有可靠快解则为 null",
  "fastest_conditions": "快解适用前提；fastest_solution_md 为 null 时也为 null",
  "trap": "命题人如何设置干扰，以及本题最容易被带偏的位置",
  "suggested_cause_primary": "仅从{CAUSES}中选择一个最可能项；证据不足则为 null",
  "cause_note": "解释为什么这个错因只能是建议而非确定诊断，并给下一次可执行检查规则",
  "related_node_slugs": ["只填本平台真实存在且与本题直接相关的知识节点slug"]
}}

要求：
1. 不得因为答案错了就断言用户知识不会；错因只做建议。
2. 标准解法必须写清识别信号、主方法和关键步骤。
3. 快解必须写明适用边界，否则返回 null。
4. 若本地材料不足以支撑老师归属，不写成老师本人明确观点。
5. 不虚构题目没有提供的信息。
"""
    result = _call_deepseek(system_prompt, prompt)
    suggested = result.get('suggested_cause_primary')
    if suggested not in CAUSES:
        suggested = None
    cause_body = str(result.get('cause_note') or '').strip()
    source_note = '；'.join(source_titles) if source_titles else '本地 Skill 检索材料'
    cause_note = f'{AI_MARKER}：{cause_body or "仅根据题面、你的答案与正确答案生成，正式错因仍需你确认。"}'
    if suggested:
        cause_note += f'\n建议错因：{suggested}（未写入正式错因）'
    cause_note += f'\n方法依据：{source_note}'

    values: dict[str, Any] = {
        'cause_note': cause_note,
        'updated_at': now_iso(),
    }
    for field in ('standard_solution_md', 'trap'):
        value = str(result.get(field) or '').strip()
        if value and (overwrite or not item.get(field)):
            values[field] = value
    fastest = str(result.get('fastest_solution_md') or '').strip()
    conditions = str(result.get('fastest_conditions') or '').strip()
    if fastest and conditions and (overwrite or not item.get('fastest_solution_md')):
        values['fastest_solution_md'] = fastest
        values['fastest_conditions'] = conditions
    slugs = _valid_node_slugs(result.get('related_node_slugs'))
    if item.get('node_slug') and item['node_slug'] not in slugs:
        slugs.insert(0, item['node_slug'])
    if slugs and (overwrite or not item.get('related_node_slugs')):
        values['related_node_slugs'] = jdump(slugs[:5])

    with transaction() as conn:
        conn.execute(
            'UPDATE mistake SET ' + ','.join(f'{key}=?' for key in values) + ' WHERE id=?',
            [*values.values(), mistake_id],
        )
    return {
        'mistake_id': mistake_id,
        'status': 'analyzed',
        'suggested_cause_primary': suggested,
        'related_node_slugs': slugs[:5],
        'sources': source_titles,
    }


def analyze_many_mistakes(mistake_ids: list[int]) -> None:
    for mistake_id in mistake_ids:
        try:
            analyze_mistake(mistake_id)
        except Exception as exc:
            item = _question_payload(mistake_id)
            if not item:
                continue
            note = f'{AI_MARKER}失败：{str(exc)[:240]}。错题已正常入库，可稍后重试。'
            with transaction() as conn:
                conn.execute('UPDATE mistake SET cause_note=?,updated_at=? WHERE id=?', (note, now_iso(), mistake_id))
