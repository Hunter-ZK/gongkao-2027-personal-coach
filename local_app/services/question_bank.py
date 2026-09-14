from __future__ import annotations

import hashlib
import json
from typing import Any

from db import jdump, jload, now_iso


def _norm_text(value: str | None) -> str:
    return " ".join((value or "").split())


def fingerprint_question(question: dict[str, Any], material: dict[str, Any] | None = None) -> str:
    payload = {
        "stem": _norm_text(question.get("stem_md")),
        "options": jload(question.get("options_json"), {}) or {},
        "correct": _norm_text(question.get("correct_answer")),
        "material": _norm_text((material or {}).get("text_md")),
    }
    raw = json.dumps(payload, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def upsert_question_bank(conn, question: dict[str, Any], material: dict[str, Any] | None, source_ref: str | None) -> int:
    fingerprint = fingerprint_question(question, material)
    old = conn.execute("SELECT id FROM question_bank WHERE fingerprint=?", (fingerprint,)).fetchone()
    now = now_iso()
    values = (
        question.get("module"),
        question.get("subtype"),
        question.get("stem_md") or "",
        question.get("images_json") or "[]",
        question.get("options_json") or "{}",
        question.get("option_images_json") or "{}",
        question.get("correct_answer"),
        (material or {}).get("text_md"),
        (material or {}).get("images_json") or "[]",
        question.get("source_type") or "fenbi",
        source_ref,
    )
    if old:
        bank_id = int(old[0])
        conn.execute(
            """UPDATE question_bank SET module=?,subtype=?,stem_md=?,images_json=?,options_json=?,option_images_json=?,
            correct_answer=?,material_text_md=?,material_images_json=?,source_type=?,source_ref=?,updated_at=? WHERE id=?""",
            (*values, now, bank_id),
        )
        return bank_id
    return int(
        conn.execute(
            """INSERT INTO question_bank(fingerprint,module,subtype,stem_md,images_json,options_json,option_images_json,
            correct_answer,material_text_md,material_images_json,source_type,source_ref,first_seen_at,updated_at)
            VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
            (fingerprint, *values, now, now),
        ).lastrowid
    )


def add_attempt(conn, *, bank_id: int, question: dict[str, Any], training_id: int, attempted_on: str, source: str, duration_sec: int | None = None, duration_is_estimated: bool = False) -> int:
    return int(
        conn.execute(
            """INSERT INTO question_attempt(bank_id,question_id,training_id,attempted_on,user_answer,correct_answer,is_correct,
            duration_sec,duration_is_estimated,source,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)""",
            (
                bank_id,
                question.get("id"),
                training_id,
                attempted_on,
                question.get("user_answer"),
                question.get("correct_answer"),
                question.get("is_correct"),
                duration_sec,
                int(duration_is_estimated),
                source,
                now_iso(),
            ),
        ).lastrowid
    )
