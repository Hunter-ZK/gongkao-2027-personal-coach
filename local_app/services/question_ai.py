from __future__ import annotations

import json
import re
from typing import Any

from db import jdump, jload, now_iso, query, query_one, transaction
from services.experience_v2 import LEGACY_TO_V2_CAUSE, V2_CAUSES, get_setting
from services.gongkao_skill import build_system_prompt, load_secret_config
from services.mistake_ai import _call_deepseek


def _payload(bank_id: int) -> dict[str, Any] | None:
    bank = query_one('SELECT * FROM question_bank WHERE id=?', (bank_id,))
    if not bank:
        return None
    attempt = query_one('SELECT * FROM question_attempt WHERE bank_id=? ORDER BY attempted_on DESC,id DESC LIMIT 1', (bank_id,)) or {}
    question = None
    if attempt.get('question_id'):
        question = query_one('SELECT * FROM question WHERE id=?', (attempt['question_id'],))
    question = question or query_one('SELECT * FROM question WHERE bank_id=? ORDER BY id DESC LIMIT 1', (bank_id,)) or {}
    mistake = query_one('SELECT * FROM mistake WHERE question_id=?', (question.get('id'),)) if question.get('id') else None
    return {'bank': bank, 'attempt': attempt, 'question': question, 'mistake': mistake}


def ensure_record(bank_id: int, *, required: bool = False, question_id: int | None = None) -> dict[str, Any]:
    now = now_iso()
    with transaction() as conn:
        conn.execute(
            """INSERT INTO question_ai_analysis(bank_id,latest_question_id,required,status,requested_at,updated_at)
            VALUES(?,?,?,'pending',?,?)
            ON CONFLICT(bank_id) DO UPDATE SET
              latest_question_id=COALESCE(excluded.latest_question_id,question_ai_analysis.latest_question_id),
              required=MAX(question_ai_analysis.required,excluded.required),status=CASE WHEN question_ai_analysis.status='done' THEN question_ai_analysis.status ELSE 'pending' END,
              updated_at=excluded.updated_at""",
            (bank_id, question_id, int(required), now, now),
        )
    return get_analysis(bank_id)


def get_analysis(bank_id: int) -> dict[str, Any]:
    row = query_one('SELECT * FROM question_ai_analysis WHERE bank_id=?', (bank_id,))
    if not row:
        return {'bank_id': bank_id, 'required': False, 'status': 'not_requested', 'configured': bool(load_secret_config().get('api_key'))}
    for field in ('key_points_json', 'related_node_slugs', 'source_refs_json'):
        row[field.removesuffix('_json') if field.endswith('_json') else field] = jload(row.get(field), [])
    row['configured'] = bool(load_secret_config().get('api_key'))
    if row['status'] in {'pending', 'blocked'} and not row['configured']:
        row['status'] = 'blocked'
        row['error_message'] = row.get('error_message') or 'DeepSeek API Key 未配置；诊断任务已保留，不影响继续做题。'
    return row


def _exact_signal(stem: str, candidate: str) -> str:
    value = str(candidate or '').strip().strip('“”"')
    if value and value in stem:
        return value
    clauses = [x.strip() for x in re.split(r'[。！？；，,]', stem or '') if x.strip()]
    if not clauses:
        return (stem or '')[:30]
    for clause in clauses:
        if any(token in clause for token in re.findall(r'[\u4e00-\u9fff]{2,6}', value)):
            return clause[:40]
    return clauses[0][:40]


def _validated_slugs(values: Any) -> list[str]:
    out: list[str] = []
    for value in values or []:
        slug = str(value or '').strip()
        if slug and query_one('SELECT slug FROM knowledge_node WHERE slug=?', (slug,)) and slug not in out:
            out.append(slug)
    return out[:5]


def _normalize_diagnosis(result: dict[str, Any], payload: dict[str, Any]) -> dict[str, Any]:
    bank = payload['bank']; question = payload['question']; attempt = payload['attempt']; mistake = payload.get('mistake') or {}
    stem = str(bank.get('stem_md') or question.get('stem_md') or '')
    conclusion = str(result.get('一句话结论') or '').strip()[:30]
    cause = str(result.get('错因') or '').strip()
    if cause not in V2_CAUSES:
        cause = LEGACY_TO_V2_CAUSE.get(str(mistake.get('cause_primary') or ''), '一次性失误')
    signal = _exact_signal(stem, str(result.get('识别信号') or ''))
    action = str(result.get('考场动作') or '').strip()[:60]
    stop = str(result.get('止损线') or '').strip()
    confidence = str(result.get('置信度') or '').strip()
    if confidence not in {'已验证', '推测', '未验证'}:
        confidence = '未验证'
    task = str(result.get('验证任务') or '').strip() or '同类题 3 道 / 原题 7 天后复做'
    slugs = _validated_slugs(result.get('关联笔记') or [])
    if not slugs and question.get('node_slug') and query_one('SELECT slug FROM knowledge_node WHERE slug=?', (question['node_slug'],)):
        slugs = [str(question['node_slug'])]
    if not conclusion:
        wrong = attempt.get('is_correct') == 0 or question.get('is_correct') == 0
        conclusion = '答错的关键在识别或方法选择，需用同类题复验。'[:30] if wrong else '本题做对，继续验证速度和稳定性。'
    if not action:
        action = '看到同类信号 → 先调用库内主方法 → 超过止损线就切换或跳过'
    return {
        '一句话结论': conclusion,
        '错因': cause,
        '识别信号': signal,
        '考场动作': action,
        '止损线': stop or '未验证：需结合该题型目标秒数设定',
        '关联笔记': slugs,
        '验证任务': task,
        '置信度': confidence,
    }


def _sync_mistake(payload: dict[str, Any], diagnosis: dict[str, Any], source_titles: list[str]) -> None:
    mistake = payload.get('mistake') or {}
    if not mistake.get('id'):
        return
    source_note = '；'.join(source_titles[:4]) if source_titles else '本地正式笔记 / 方法库'
    note = f"{diagnosis['一句话结论']}\nAI建议错因：{diagnosis['错因']}（需用户确认）\n依据：{source_note}"
    with transaction() as conn:
        conn.execute(
            """UPDATE mistake SET cause_note=?,fastest_solution_md=?,fastest_conditions=?,trap=?,related_node_slugs=?,updated_at=? WHERE id=?""",
            (note, diagnosis['考场动作'], diagnosis['止损线'], diagnosis['一句话结论'], jdump(diagnosis['关联笔记']), now_iso(), mistake['id']),
        )


def analyze_bank_question(bank_id: int, *, required: bool | None = None, overwrite: bool = False) -> dict[str, Any]:
    payload = _payload(bank_id)
    if not payload:
        return {'bank_id': bank_id, 'status': 'missing'}
    question = payload['question']
    existing = ensure_record(bank_id, required=bool(required if required is not None else payload.get('mistake')), question_id=question.get('id'))
    if existing.get('status') == 'done' and not overwrite:
        return existing

    cfg = load_secret_config()
    if not cfg.get('api_key'):
        with transaction() as conn:
            conn.execute("UPDATE question_ai_analysis SET status='blocked',error_message=?,updated_at=? WHERE bank_id=?", ('DeepSeek API Key 未配置；诊断任务已保留，做题流程不受影响。', now_iso(), bank_id))
        return get_analysis(bank_id)

    bank = payload['bank']; attempt = payload['attempt']; mistake = payload.get('mistake') or {}
    options = jload(bank.get('options_json'), {}) or {}
    option_text = '\n'.join(f'{key}. {options.get(key, "")}' for key in ('A', 'B', 'C', 'D') if key in options)
    query_text = f"{bank.get('module') or ''} {bank.get('subtype') or ''} {bank.get('stem_md') or ''} {option_text}"
    system_prompt, refs = build_system_prompt(query_text)
    source_titles = [str(item.get('title')) for item in refs if item.get('title')]
    correct = attempt.get('correct_answer') or bank.get('correct_answer') or question.get('correct_answer')
    user = attempt.get('user_answer') or question.get('user_answer')
    wrong = attempt.get('is_correct') == 0 or question.get('is_correct') == 0
    feedback_all = get_setting('diagnosis_feedback_v1', {}) or {}
    recent_feedback = list(feedback_all.values())[-10:]
    known_slugs = [str(x['slug']) for x in query('SELECT slug FROM knowledge_node ORDER BY seq')]
    prompt = f"""你是用户的公考错题诊断器。不要写教材讲解，只输出下一次在考场可执行的决策规则。诊断前优先使用系统提示中的本地正式知识笔记和正式方法；库内已有方法能覆盖时不得另造一套说法。

模块：{bank.get('module') or '未分类'}
题型：{bank.get('subtype') or '未分类'}
题干原文：{bank.get('stem_md') or '题干文本缺失'}
选项：\n{option_text or '选项文本缺失'}
用户作答：{user or '未知'}
正确答案：{correct or '未知'}
本次错答：{'是' if wrong else '否'}
已有人工错因：{mistake.get('cause_primary') or '未确认'}
用户最近纠正过的诊断：{json.dumps(recent_feedback, ensure_ascii=False)}
可引用知识节点 slug：{json.dumps(known_slugs, ensure_ascii=False)}

只返回以下 JSON，字段不能增删：
{{
  "一句话结论": "≤30字，直接说清这题栽在哪",
  "错因": "审题漏条件|方法选错|计算失误|知识点缺失|速度不够|二选一不稳|一次性失误",
  "识别信号": "必须逐字引用本题题干中的一段原文",
  "考场动作": "看到 X → 先做 Y → 若出现 Z 则切换/放弃",
  "止损线": "具体秒数，例如45秒；必须说明依据不足时为推测",
  "关联笔记": ["只能填上面真实存在且直接相关的slug"],
  "验证任务": "同类题3道或原题7天后复做等可执行任务",
  "置信度": "已验证|推测|未验证"
}}

硬约束：
1. 禁止复述知识点定义、禁止长篇标准解法、禁止“适当控制时间”等空话。
2. 识别信号必须能在题干原文中逐字找到；找不到就选更短的真实原句。
3. 考场动作第一句就给动作；结论+考场动作尽量控制在60字内。
4. 止损线必须给秒数。若只能依据题型一般节奏推断，置信度写“推测”，不得冒充已验证。
5. 没把握就写“未验证”，不得编造老师观点、阈值、题目事实。
6. 用户人工修正过的错因优先级高于 AI；相似情形优先沿用用户判断。
7. 关联笔记先检索本地已有笔记；只有库内确实没有时才不填，不得虚构slug。
"""

    with transaction() as conn:
        conn.execute("UPDATE question_ai_analysis SET status='running',error_message=NULL,model=?,requested_at=?,updated_at=? WHERE bank_id=?", (cfg.get('model'), now_iso(), now_iso(), bank_id))
    try:
        result = _call_deepseek(system_prompt, prompt)
        diagnosis = _normalize_diagnosis(result, payload)
        source_refs = [{'title': item.get('title'), 'source': item.get('source'), 'kind': item.get('kind')} for item in refs[:6]]
        with transaction() as conn:
            conn.execute(
                """UPDATE question_ai_analysis SET status='done',standard_solution_md=?,fastest_solution_md=?,fastest_conditions=?,trap=?,key_points_json=?,related_node_slugs=?,source_refs_json=?,model=?,origin='diagnosis_v2',error_message=NULL,completed_at=?,updated_at=? WHERE bank_id=?""",
                (json.dumps(diagnosis, ensure_ascii=False), diagnosis['考场动作'], diagnosis['止损线'], diagnosis['一句话结论'], jdump([diagnosis['识别信号'], diagnosis['验证任务']]), jdump(diagnosis['关联笔记']), jdump(source_refs), cfg.get('model'), now_iso(), now_iso(), bank_id),
            )
        _sync_mistake(payload, diagnosis, source_titles)
        return get_analysis(bank_id)
    except Exception as exc:
        with transaction() as conn:
            conn.execute("UPDATE question_ai_analysis SET status='failed',error_message=?,updated_at=? WHERE bank_id=?", (str(exc)[:600], now_iso(), bank_id))
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
