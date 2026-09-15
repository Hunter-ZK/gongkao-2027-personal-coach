from __future__ import annotations

from fastapi import APIRouter
from pydantic import BaseModel, Field

from services.experience_v2 import get_setting, set_setting
from db import now_iso, query_one

r = APIRouter(prefix='/api/v2/review', tags=['review-v2'])
KEY = 'active_review_session_v2'


class ReviewStateIn(BaseModel):
    queue_ids: list[int] = Field(default_factory=list)
    current_index: int = 0
    selected_answer: str | None = None
    elapsed_sec: int = 0
    remaining_sec: int = 0
    correct_count: int = 0
    submitted: bool = False


@r.get('/state')
def state():
    return get_setting(KEY, {}) or {'active': False}


@r.post('/save')
def save(x: ReviewStateIn):
    row = {**x.model_dump(), 'active': bool(x.queue_ids), 'updated_at': now_iso()}
    set_setting(KEY, row)
    return row


@r.post('/clear')
def clear():
    set_setting(KEY, {'active': False, 'updated_at': now_iso()})
    return {'ok': True}


@r.get('/new-diagnoses')
def new_diagnoses():
    row = query_one("SELECT COUNT(*) n FROM question_ai_analysis WHERE status='done' AND datetime(completed_at)>=datetime('now','-1 day')") or {'n': 0}
    return {'count': int(row.get('n') or 0)}
