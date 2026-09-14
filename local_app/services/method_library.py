from __future__ import annotations

import gzip
import json
import re
from functools import lru_cache
from pathlib import Path
from typing import Any

BASE = Path(__file__).resolve().parents[1]
METHOD_DIR = BASE / "content" / "methods"
PACK_PATH = METHOD_DIR / "all_methods.json.gz"
MODULE_ORDER = {"资料分析": 0, "判断推理": 1, "言语理解": 2, "数量关系": 3, "常识判断": 4}


def _method_sort_key(method_id: str) -> tuple[str, int]:
    m = re.match(r"([A-Z]+)(\d+)$", method_id)
    return (m.group(1), int(m.group(2))) if m else (method_id, 999)


@lru_cache(maxsize=1)
def load_catalog() -> list[dict[str, Any]]:
    if not PACK_PATH.exists():
        return []
    try:
        payload = json.loads(gzip.decompress(PACK_PATH.read_bytes()).decode("utf-8"))
    except (OSError, gzip.BadGzipFile, UnicodeDecodeError, json.JSONDecodeError):
        return []
    rows = [dict(item) for item in payload.get("methods", []) if isinstance(item, dict)]
    rows.sort(key=lambda x: (MODULE_ORDER.get(str(x.get("module")), 99), _method_sort_key(str(x.get("id") or ""))))
    return rows


def summary() -> dict[str, Any]:
    rows = load_catalog()
    counts = {module: 0 for module in MODULE_ORDER}
    for row in rows:
        module = str(row.get("module") or "其他")
        counts[module] = counts.get(module, 0) + 1
    return {
        "total": len(rows),
        "counts": counts,
        "source": "行测全题型方法与技巧大全_GitHub技能融合深化版V2",
        "version": "2026-09-v2",
        "quality_rule": "每个方法必须同时包含识别信号、底层原理、标准操作、完整例题和失效边界。",
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
