from __future__ import annotations

from fastapi import APIRouter, BackgroundTasks

from routers import coach

r = APIRouter(prefix='/api/coach', tags=['coach-compat'])


@r.post('/config', include_in_schema=False)
def post_config(body: coach.ConfigIn, background_tasks: BackgroundTasks):
    """POST alias for clients that save AI config with the stable browser transport."""
    return coach.put_config(body, background_tasks)


@r.put('/config/test', include_in_schema=False)
def put_config_test(body: coach.ConfigTestIn):
    """PUT alias retained for older/local frontends during version transitions."""
    return coach.test_config(body)
