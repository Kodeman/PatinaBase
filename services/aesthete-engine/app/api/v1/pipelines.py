"""
Internal endpoints for triggering The Daily Room batch pipelines.

Protected by the `X-Internal-Token` header (matching settings.internal_token).
Intended to be called by a nightly cron container or Supabase pg_cron.
"""
from __future__ import annotations

import logging

from fastapi import APIRouter, Header, HTTPException, status

from app.config import get_settings
from app.pipelines.nightly_rerank import run_nightly_pipeline
from app.pipelines.spatial_context import regenerate_spatial_context_for_user

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/internal/pipelines", tags=["pipelines"])
settings = get_settings()


def _require_internal(token: str | None) -> None:
    expected = getattr(settings, "internal_token", None)
    if not expected or token != expected:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="forbidden")


@router.post("/nightly")
async def trigger_nightly(x_internal_token: str | None = Header(default=None)):
    _require_internal(x_internal_token)
    result = await run_nightly_pipeline()
    return {
        "status": "ok",
        "users_processed": result.users_processed,
        "products_scored": result.products_scored,
        "feed_caches_written": result.feed_caches_written,
        "duration_seconds": result.duration_seconds,
    }


@router.post("/spatial-context/{user_id}")
async def trigger_spatial_context(
    user_id: str, x_internal_token: str | None = Header(default=None)
):
    _require_internal(x_internal_token)
    rows = await regenerate_spatial_context_for_user(user_id)
    return {"status": "ok", "rows_written": rows}
