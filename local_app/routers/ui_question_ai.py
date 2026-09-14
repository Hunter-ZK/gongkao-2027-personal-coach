from __future__ import annotations

from fastapi import APIRouter, HTTPException

from db import query_one
from services.question_ai import analyze_bank_question, get_analysis

r = APIRouter(prefix='/api/ui/question-ai', tags=['civil-gemini-ui'])


def _bank_id(question_id: int) -> int:
    row = query_one('SELECT bank_id FROM question WHERE id=?', (question_id,))
    if not row:
        raise HTTPException(404, '题目不存在')
    if not row.get('bank_id'):
        raise HTTPException(409, '该题尚未进入 canonical 题库')
    return int(row['bank_id'])


@r.get('/{question_id}')
def status(question_id: int):
    return get_analysis(_bank_id(question_id))


@r.post('/{question_id}')
def analyze(question_id: int, refresh: bool = False):
    bank_id = _bank_id(question_id)
    try:
        return analyze_bank_question(bank_id, overwrite=refresh)
    except RuntimeError as exc:
        raise HTTPException(502, str(exc)) from exc
