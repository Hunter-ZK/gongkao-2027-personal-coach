from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query

from services.method_library import get_method, search_methods, summary

r = APIRouter(prefix="/api/knowledge", tags=["knowledge-methods"])


@r.get("/method-summary")
def method_summary():
    return summary()


@r.get("/methods")
def methods(module: str = "", q: str = Query(default="", max_length=80)):
    return search_methods(module=module.strip(), q=q.strip())


@r.get("/method/{method_id}")
def method(method_id: str):
    row = get_method(method_id)
    if not row:
        raise HTTPException(404, "方法不存在")
    return row
