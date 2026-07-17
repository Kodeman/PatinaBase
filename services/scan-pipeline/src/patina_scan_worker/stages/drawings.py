"""scan_pipeline.drawings — dimensioned floor plan + four elevations → SVG
(native), PDF, layered DXF (ezdxf) per R108.6; uploads to Storage; marks the
room_files row 'generated' (design §2.1).

NOT IMPLEMENTED in item 9. Registered as an explicit stub so the terminal stage
of the chain is visible. If a worker whose STAGES include ``drawings`` claims
one, this stub parks it FATALLY with a clear message. Item 11 replaces this body
with the real renderer (adds the ezdxf/cairosvg extra) — nothing else in the
worker changes.
"""

from __future__ import annotations

from typing import Any

from ..errors import StageNotImplemented
from .base import BaseStage, Context, StageOutcome


class DrawingsStage(BaseStage):
    stage = "drawing"

    def run(self, ctx: Context, task: dict[str, Any]) -> StageOutcome:
        payload = task.get("payload") or {}
        ctx.telemetry.emit(
            payload.get("scan_id", "unknown"),
            "drawing",
            "drawings.failed",
            "failed",
            room_file_id=payload.get("room_file_id"),
            detail={
                "failure_token": "STAGE_NOT_IMPLEMENTED",
                "stage": "drawings",
                "note": "item 11 lands the SVG/PDF/DXF renderer",
            },
        )
        raise StageNotImplemented(
            "scan_pipeline.drawings is not implemented yet (item 11). The task is "
            "parked failed; it will be picked up once drawings ships."
        )
