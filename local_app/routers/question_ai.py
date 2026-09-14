from __future__ import annotations

from fastapi import APIRouter, BackgroundTasks, HTTPException

from services.question_ai import (
    analyze_bank_question,
    analyze_many_bank_questions,
    get_analysis,
)

r = APIRouter(prefix='/api/question-ai', tags=['question-ai'])


@r.get('/{bank_id}')
def status(bank_id: int):
    return get_analysis(bank_id)


@r.post('/{bank_id}')
def analyze(bank_id: int, background_tasks: BackgroundTasks, refresh: bool = False):
    current = get_analysis(bank_id)
    if current.get('status') == 'done' and not refresh:
        return current
    if not current.get('configured'):
        # Create/keep a durable request even when the API key is missing.
        try:
            return analyze_bank_question(bank_id, required=bool(current.get('required')), overwrite=False)
        except Exception as exc:
            raise HTTPException(409, str(exc)) from exc
    background_tasks.add_task(
        analyze_many_bank_questions,
        [bank_id],
        required=bool(current.get('required')),
    )
    return {
        **current,
        'bank_id': bank_id,
        'status': 'pending',
        'message': 'AI 解析任务已提交；结果会永久绑定到这道题。',
    }


@r.post('/{bank_id}/sync')
def analyze_sync(bank_id: int, refresh: bool = False):
    try:
        return analyze_bank_question(bank_id, overwrite=refresh)
    except RuntimeError as exc:
        raise HTTPException(502, str(exc)) from exc
