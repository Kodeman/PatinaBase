"""
Spatial context generator.

Produces the "why it fits" copy shown on every Daily Room product card by
combining a room's scan data (dimensions, orientation, detected objects)
with a product's physical properties. Writes to the `spatial_context`
table; the iOS client reads it via GET /api/feed/:roomId.

Runs nightly after nightly_rerank, or on-demand after a new room scan.
"""
from __future__ import annotations

import logging
from typing import Any

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.database import AsyncSessionLocal

logger = logging.getLogger(__name__)


async def regenerate_spatial_context_for_user(user_id: str) -> int:
    """Regenerate every spatial_context row for one user's rooms × their
    top-ranked products. Returns rows written."""
    async with AsyncSessionLocal() as session:
        rooms = await session.execute(
            text(
                "SELECT id, type, dimensions, window_count, orientation "
                "FROM rooms WHERE user_id = :uid"
            ),
            {"uid": user_id},
        )
        written = 0
        for room in rooms:
            product_rows = await session.execute(
                text(
                    """
                    SELECT p.id, p.name, p.dimensions
                      FROM product_user_dwell pud
                      JOIN products p ON p.id = pud.product_id
                     WHERE pud.user_id = :uid
                     ORDER BY pud.computed_interest_score DESC
                     LIMIT 40
                    """
                ),
                {"uid": user_id},
            )
            for product in product_rows:
                written += await _write_contexts(session, room, product)
        await session.commit()
    return written


async def _write_contexts(session: AsyncSession, room: Any, product: Any) -> int:
    """Emit dimension_fit, lighting, and orientation context rows."""
    room_id = room[0]
    room_dims = room[2] or {}
    window_count = room[3] or 0
    orientation = room[4] or ""
    product_id = product[0]
    product_dims = product[2] or {}

    rows = 0
    dim_text = _dimension_fit_text(room_dims, product_dims)
    if dim_text:
        await _upsert_context(session, product_id, room_id, "dimension_fit", dim_text)
        rows += 1

    light_text = _lighting_text(orientation, window_count)
    if light_text:
        await _upsert_context(session, product_id, room_id, "lighting", light_text)
        rows += 1

    return rows


def _dimension_fit_text(room_dims: dict, product_dims: dict) -> str | None:
    try:
        room_w = float(room_dims.get("width", 0))
        product_w = float(product_dims.get("width", 0))
    except (TypeError, ValueError):
        return None
    if room_w <= 0 or product_w <= 0:
        return None
    clearance = room_w - product_w
    if clearance < 0:
        return None
    return f'{int(product_w)}" wide, leaves {int(clearance)}" of clearance on this wall'


def _lighting_text(orientation: str, window_count: int) -> str | None:
    if not orientation:
        return None
    descriptor = {
        "north": "cool, even northern light",
        "south": "warm southern light",
        "east":  "bright morning light",
        "west":  "golden afternoon light",
    }.get(orientation.lower())
    if not descriptor:
        return None
    suffix = f" through {window_count} windows" if window_count else ""
    return f"Bathed in {descriptor}{suffix}"


async def _upsert_context(
    session: AsyncSession,
    product_id: str,
    room_id: str,
    context_type: str,
    context_text: str,
) -> None:
    await session.execute(
        text(
            """
            INSERT INTO spatial_context (product_id, room_id, context_type, context_text)
            VALUES (:pid, :rid, :ctype, :text)
            ON CONFLICT (product_id, room_id, context_type) DO UPDATE SET
                context_text = EXCLUDED.context_text,
                generated_at = NOW();
            """
        ),
        {"pid": product_id, "rid": room_id, "ctype": context_type, "text": context_text},
    )
