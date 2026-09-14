from __future__ import annotations

import json
from typing import Any

from db import jdump, jload, now_iso, query, query_one, transaction
from services.gongkao_skill import ALLOWED_MODELS, build_system_prompt, load_secret_config
from services.mistake_ai import _call_deepseek


def _payload(bank_id: int) -> dict[str, Any] | None:
    bank = query_one('SELECT * FROM question_bank WHERE id=?', (bank_id,))
    if not bank:
        return None
    attempt = query_one(
        'SELECT * FROM question_attempt WHERE bank_id=? ORDER BY attempted_on DESC,id DESC LIMIT 1',
        (bank_id,),
    ) or {}
    question = None
    if attempt.get('question_id'):
        question = query_one('SELECT * FROM question WHERE id=?', (attempt['question_id'],))
    question = question or query_one(
        'SELECT * FROM question WHERE bank_id=? ORDER BY id DESC LIMIT 1', (bank_id,)
    ) or {}
    mistake = None
    if question.get('id'):
        mistake = query_one('SELECT * FROM mistake WHERE question_id=?', (question['id'],))
    return {
        'bank': bank,
        'attempt': attempt,
        'question': question,
        'mistake': mistake,
    }


def ensure_record(bank_id: int, *, required: bool = False, question_id: int | None = None) -> dict[str, Any]:
    now = now_iso()
    with transaction() as conn:
        conn.execute(
            """INSERT INTO question_ai_analysis(bank_id,latest_question_id,required,status,requested_at,updated_at)
            VALUES(?,?,?,'pending',?,?)
            ON CONFLICT(bank_id) DO UPDATE SET
              latest_question_id=COALESCE(excluded.latest_question_id,question_ai_analysis.latest_question_id),
              required=MAX(question_ai_analysis.required,excluded.required),
              updated_at=excluded.updated_at""",
            (bank_id, question_id, int(required), now, now),
        )
    return get_analysis(bank_id)


def get_analysis(bank_id: int) -> dict[str, Any]:
    row = query_one('SELECT * FROM question_ai_analysis WHERE bank_id=?', (bank_id,))
    if not row:
        return {
            'bank_id': bank_id,
            'required': False,
            'status': 'not_requested',
            'configured': bool(load_secret_config().get('api_key')),
        }
    for field in ('key_points_json', 'related_node_slugs', 'source_refs_json'):
        row[field.removesuffix('_json') if field.endswith('_json') else field] = jload(row.get(field), [])
    row['configured'] = bool(load_secret_config().get('api_key'))
    if row['status'] in {'pending', 'blocked'} and not row['configured']:
        row['status'] = 'blocked'
        row['error_message'] = row.get('error_message') or 'DeepSeek API Key 未配置；解析任务已保留，配置后可继续。'
    return row


def _sync_mistake(payload: dict[str, Any], result: dict[str, Any], source_titles: list[str]) -> None:
    mistake = payload.get('mistake') or {}
    if not mistake.get('id'):
        return
    fields = {
        'standard_solution_md': str(result.get('standard_solution_md') or '').strip() or None,
        'fastest_solution_md': str(result.get('fastest_solution_md') or '').strip() or None,
        'fastest_conditions': str(result.get('fastest_conditions') or '').strip() or None,
        'trap': str(result.get('trap') or '').strip() or None,
        'related_node_slugs': jdump(result.get('related_node_slugs') or []),
        'updated_at': now_iso(),
    }
    cause = str(result.get('suggested_cause_primary') or '').strip()
    note = str(result.get('cause_note') or '').strip()
    source_note = '；'.join(source_titles[:4]) if source_titles else '本地 Skill / 方法库'
    fields['cause_note'] = f"AI 初步分析（错因需人工确认）：{note or '仅根据题面与作答轨迹生成。'}"
    if cause:
        fields['cause_note'] += f'\n建议错因：{cause}（未自动写入正式错因）'
    fields['cause_note'] += f'\n方法依据：{source_note}'
    with transaction() as conn:
        conn.execute(
            'UPDATE mistake SET ' + ','.join(f'{key}=?' for key in fields) + ' WHERE id=?',
            [*fields.values(), mistake['id']],
        )


def analyze_bank_question(bank_id: int, *, required: bool | None = None, overwrite: bool = False) -> dict[str, Any]:
    payload = _payload(bank_id)
    if not payload:
        return {'bank_id': bank_id, 'status': 'missing'}
    question = payload['question']
    existing = ensure_record(
        bank_id,
        required=bool(required if required is not None else payload.get('mistake')),
        question_id=question.get('id'),
    )
    if existing.get('status') == 'done' and not overwrite:
        return existing

    cfg = load_secret_config()
    if not cfg.get('api_key'):
        with transaction() as conn:
            conn.execute(
                "UPDATE question_ai_analysis SET status='blocked',error_message=?,updated_at=? WHERE bank_id=?",
                ('DeepSeek API Key 未配置；必做错题解析任务已保留。', now_iso(), bank_id),
            )
        return get_analysis(bank_id)

    bank = payload['bank']
    attempt = payload['attempt']
    options = jload(bank.get('options_json'), {}) or {}
    option_text = '\n'.join(f'{key}. {options.get(key, "")}' for key in ('A', 'B', 'C', 'D') if key in options)
    query_text = f"{bank.get('module') or ''} {bank.get('subtype') or ''} {bank.get('stem_md') or ''} {option_text}"
    system_prompt, refs = build_system_prompt(query_text)
    source_titles = [str(item.get('title')) for item in refs if item.get('title')]
    correct = attempt.get('correct_answer') or bank.get('correct_answer') or question.get('correct_answer')
    user = attempt.get('user_answer') or question.get('user_answer')
    wrong = attempt.get('is_correct') == 0 or question.get('is_correct') == 0
    prompt = f"""请对下面这道用户真实公考题做可长期保存的教学解析。优先使用系统提示中的本地正式知识节点、结构化方法库和已纳入的 GitHub Skill 二级证据；不得把二次整理冒充老师本人原话。

模块：{bank.get('module') or '未分类'}
题型：{bank.get('subtype') or '未分类'}
题干：{bank.get('stem_md') or '题干文本缺失'}
选项：\n{option_text or '选项文本缺失'}
用户最近作答：{user or '未知'}
正确答案：{correct or '未知'}
本次是否错答：{'是' if wrong else '否/未知'}

只返回 JSON：
{{
  "standard_solution_md": "稳定可复现的标准解法：识别信号→主方法→关键步骤→答案",
  "fastest_solution_md": "考场最短安全路线；不存在可靠快解则为 null",
  "fastest_conditions": "快解适用边界；没有快解则为 null",
  "trap": "干扰项与命题陷阱",
  "key_points": ["本题最值得记住的1-4个调用点"],
  "suggested_cause_primary": "若为错题才给建议错因；正确题填 null",
  "cause_note": "错因只是建议的理由；正确题写如何确认是稳定正确而非蒙对/超时",
  "related_node_slugs": ["仅填系统真实存在且直接相关的知识节点slug"]
}}

要求：
1. 正确题也要解释为什么对、有没有更短路径以及方法边界，不把“做对”自动等同于“掌握”。
2. 错题必须给下一次可执行的识别/切换规则，但不能无证据断言知识不会。
3. 资料分析优先检查问法、选项差距、定性、最低成本算法和误差护栏；能停就停。
4. 卡题时明确降级路径和止损条件。
5. 不虚构题面没有提供的信息。
"""

    with transaction() as conn:
        conn.execute(
            "UPDATE question_ai_analysis SET status='running',error_message=NULL,model=?,requested_at=?,updated_at=? WHERE bank_id=?",
            (cfg.get('model'), now_iso(), now_iso(), bank_id),
        )
    try:
        result = _call_deepseek(system_prompt, prompt)
        standard = str(result.get('standard_solution_md') or '').strip()
        if not standard:
            raise RuntimeError('AI 未返回标准解法')
        fastest = str(result.get('fastest_solution_md') or '').strip() or None
        conditions = str(result.get('fastest_conditions') or '').strip() or None
        if not (fastest and conditions):
            fastest = None
            conditions = None
        key_points = [str(x).strip() for x in (result.get('key_points') or []) if str(x).strip()][:6]
        slugs = []
        for value in result.get('related_node_slugs') or []:
            slug = str(value or '').strip()
            if slug and query_one('SELECT slug FROM knowledge_node WHERE slug=?', (slug,)):
                slugs.append(slug)
        source_refs = [
            {'title': item.get('title'), 'source': item.get('source'), 'kind': item.get('kind')}
            for item in refs[:6]
        ]
        with transaction() as conn:
            conn.execute(
                """UPDATE question_ai_analysis SET status='done',standard_solution_md=?,fastest_solution_md=?,fastest_conditions=?,trap=?,
                key_points_json=?,related_node_slugs=?,source_refs_json=?,model=?,origin='question_ai',error_message=NULL,completed_at=?,updated_at=?
                WHERE bank_id=?""",
                (
                    standard, fastest, conditions, str(result.get('trap') or '').strip() or None,
                    jdump(key_points), jdump(slugs[:5]), jdump(source_refs), cfg.get('model'), now_iso(), now_iso(), bank_id,
                ),
            )
        _sync_mistake(payload, {**result, 'related_node_slugs': slugs[:5]}, source_titles)
        return get_analysis(bank_id)
    except Exception as exc:
        with transaction() as conn:
            conn.execute(
                "UPDATE question_ai_analysis SET status='failed',error_message=?,updated_at=? WHERE bank_id=?",
                (str(exc)[:600], now_iso(), bank_id),
            )
        raise


def required_bank_ids() -> list[int]:
    rows = query("SELECT bank_id FROM question_ai_analysis WHERE required=1 AND status!='done' ORDER BY id")
    return [int(row['bank_id']) for row in rows]


def analyze_many_bank_questions(bank_ids: list[int], *, required: bool = False) -> None:
    for bank_id in dict.fromkeys(int(x) for x in bank_ids):
        try:
            analyze_bank_question(bank_id, required=required, overwrite=True)
        except Exception:
            continue


def analyze_pending_required() -> None:
    if not load_secret_config().get('api_key'):
        return
    analyze_many_bank_questions(required_bank_ids(), required=True)
