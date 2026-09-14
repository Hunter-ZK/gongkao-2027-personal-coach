from __future__ import annotations

import json
import re
from functools import lru_cache
from pathlib import Path
from typing import Any

BASE = Path(__file__).resolve().parents[1]
METHOD_DIR = BASE / "content" / "methods"
SOURCE_DIR = METHOD_DIR / "source"
MANIFEST_PATH = METHOD_DIR / "source_manifest.json"
MODULE_ORDER = {"资料分析": 0, "判断推理": 1, "言语理解": 2, "数量关系": 3, "常识判断": 4}
CORE_FIELDS = ("definition", "principle", "signals", "steps", "example", "boundary")


def _method_sort_key(method_id: str) -> tuple[str, int]:
    m = re.match(r"([A-Z]+)(\d+)$", method_id)
    return (m.group(1), int(m.group(2))) if m else (method_id, 999)


def _read_json(path: Path, default: Any) -> Any:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, UnicodeDecodeError, json.JSONDecodeError):
        return default


def _normalize(item: dict[str, Any]) -> dict[str, Any]:
    row = dict(item)
    comparison = str(row.get("comparison") or "")
    marker = "考场调用指令"
    if not row.get("exam_command") and marker in comparison:
        before, _, after = comparison.partition(marker)
        row["comparison"] = before.strip()
        row["exam_command"] = after.strip(" ：:\n")
    if not row.get("source_note"):
        row["source_note"] = str(row.get("evidence") or row.get("source_method_label") or "来源见V2正文")
    return row


def _load_source_catalog() -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    if not SOURCE_DIR.exists():
        return rows
    for path in sorted(SOURCE_DIR.glob("*.json")):
        payload = _read_json(path, {})
        if not isinstance(payload, dict):
            continue
        for item in payload.get("items", []):
            if isinstance(item, dict):
                rows.append(_normalize(item))
    return rows


@lru_cache(maxsize=1)
def load_catalog() -> list[dict[str, Any]]:
    rows = _load_source_catalog()
    seen: set[str] = set()
    clean: list[dict[str, Any]] = []
    for row in rows:
        method_id = str(row.get("id") or "").upper()
        if not method_id or method_id in seen:
            continue
        if not row.get("title") or not row.get("module"):
            continue
        if any(not row.get(field) for field in CORE_FIELDS):
            continue
        row["id"] = method_id
        seen.add(method_id)
        clean.append(row)
    clean.sort(key=lambda x: (MODULE_ORDER.get(str(x.get("module")), 99), _method_sort_key(str(x.get("id") or ""))))
    return clean


def summary() -> dict[str, Any]:
    rows = load_catalog()
    counts = {module: 0 for module in MODULE_ORDER}
    for row in rows:
        module = str(row.get("module") or "其他")
        counts[module] = counts.get(module, 0) + 1
    manifest = _read_json(MANIFEST_PATH, {})
    return {
        "total": len(rows),
        "counts": counts,
        "source": manifest.get("source") or "行测全题型方法与技巧大全_GitHub技能融合深化版V2.docx",
        "version": manifest.get("version") or "2026-09-v2-source-grounded",
        "composition": manifest.get("composition") or {},
        "quality_rule": "正式方法必须同时包含识别信号、底层原理、标准操作、完整例题和失效边界；总方法论与复盘协议不虚增进正式方法数。",
    }


def search_methods(module: str = "", q: str = "") -> list[dict[str, Any]]:
    qn = re.sub(r"\s+", "", q).lower()
    out: list[dict[str, Any]] = []
    for row in load_catalog():
        if module and row.get("module") != module:
            continue
        if qn:
            values: list[str] = []
            for key in ("id", "title", "module", "definition", "principle", "evidence", "source_note", "exam_command", "comparison", "variants"):
                value = row.get(key)
                if value:
                    values.append(str(value))
            for key in ("signals", "steps"):
                values.extend(str(x) for x in (row.get(key) or []))
            hay = re.sub(r"\s+", "", "\n".join(values)).lower()
            if qn not in hay:
                continue
        out.append(row)
    return out


def get_method(method_id: str) -> dict[str, Any] | None:
    target = method_id.strip().upper()
    for row in load_catalog():
        if str(row.get("id") or "").upper() == target:
            return row
    return None
