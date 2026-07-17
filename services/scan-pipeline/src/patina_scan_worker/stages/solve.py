"""scan_pipeline.solve — anchor least-squares scale fit + tolerance classes +
accuracy certificate + UNVERIFIED propagation (design §2.1).

NOT IMPLEMENTED in item 9. Registered as an explicit stub so the chain wiring is
provable now: ingest enqueues scan_pipeline.solve on success; if a worker whose
STAGES include ``solve`` claims it, this stub parks it FATALLY with a clear
message (no silent retry loop). Item 10 replaces this body with the real
least-squares fit (adds the numpy/scipy extra) — nothing else in the worker
changes.
"""

from __future__ import annotations

from typing import Any

from ..errors import StageNotImplemented
from .base import BaseStage, Context, StageOutcome


class SolveStage(BaseStage):
    stage = "solve"

    def run(self, ctx: Context, task: dict[str, Any]) -> StageOutcome:
        payload = task.get("payload") or {}
        ctx.telemetry.emit(
            payload.get("scan_id", "unknown"),
            "solve",
            "solve.failed",
            "failed",
            room_file_id=payload.get("room_file_id"),
            detail={
                "failure_token": "STAGE_NOT_IMPLEMENTED",
                "stage": "solve",
                "note": "item 10 lands the least-squares anchor solve",
            },
        )
        raise StageNotImplemented(
            "scan_pipeline.solve is not implemented yet (item 10). The task is "
            "parked failed; it will be picked up once solve ships. Chain wiring "
            "verified: ingest correctly enqueued this successor."
        )
