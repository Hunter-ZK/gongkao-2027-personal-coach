from __future__ import annotations

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from services.device_sync import SyncConflict, SyncError, pull_checkpoint, push_checkpoint, status

r = APIRouter(prefix="/api/sync", tags=["sync"])


class PullIn(BaseModel):
    force: bool = False


@r.get("/status")
def sync_status(refresh: bool = False):
    return status(refresh_remote=refresh)


@r.post("/push")
def sync_push():
    try:
        return push_checkpoint()
    except SyncConflict as exc:
        raise HTTPException(409, str(exc)) from exc
    except SyncError as exc:
        raise HTTPException(422, str(exc)) from exc


@r.post("/pull")
def sync_pull(body: PullIn):
    try:
        return pull_checkpoint(force=body.force)
    except SyncConflict as exc:
        raise HTTPException(409, str(exc)) from exc
    except SyncError as exc:
        raise HTTPException(422, str(exc)) from exc
