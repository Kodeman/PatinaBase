"""`verify` job glue — the only part of the stage that touches the world.

Inputs arrive as presigned Supabase Storage URLs (the `convert-room-scan-glb`
pattern), so this wave runs before any R2 cutover. Outputs go to `room_files`,
`scan_pipeline_events`, and the task ledger, over the `scan_worker` role only.

The lease/idempotency posture is documented in `scan_modal.io.db`.
"""

from __future__ import annotations

import time
from typing import Any

from ..core.captured_room import parse_captured_room_meters
from ..core.verify import VerifyConfig, verify_room
from ..io.db import ScanWorkerDb
from ..io.ply import read_ply_vertices

__all__ = ["STAGE", "InputError", "run_verify", "build_config"]

STAGE = "verify"

# Presigned URLs are already time-bounded; this bounds a hung origin.
_DOWNLOAD_TIMEOUT_S = 300.0


class InputError(ValueError):
    """The dispatch payload is missing an input this stage cannot proceed without."""


def build_config(overrides: dict[str, Any] | None) -> VerifyConfig:
    """Per-task threshold overrides, filtered to real VerifyConfig fields."""
    if not overrides:
        return VerifyConfig()
    fields = VerifyConfig.__dataclass_fields__
    return VerifyConfig(**{k: v for k, v in overrides.items() if k in fields})


def _fetch(url: str) -> bytes:
    import httpx

    with httpx.Client(timeout=_DOWNLOAD_TIMEOUT_S, follow_redirects=True) as client:
        response = client.get(url)
        response.raise_for_status()
        return response.content


def run_verify(payload: dict[str, Any], db: ScanWorkerDb | None = None) -> dict[str, Any]:
    """Run `verify` for one dispatched task and write its outcome to the ledger.

    Returns the result dict written to `room_files.verify`.
    """
    task_id = payload.get("taskId")
    if not task_id:
        raise InputError("taskId is required")
    scan_id = payload.get("scanId")
    room_file_id = payload.get("roomFileId")
    room_file_version = payload.get("roomFileVersion")
    trace_id = payload.get("traceId")
    inputs = payload.get("inputs") or {}

    started = time.monotonic()
    owns_db = db is None
    completed = False
    db = db or ScanWorkerDb.from_env()
    try:
        # First statement of the job — the observable claim. See io/db.py.
        db.append_event(
            scan_id, room_file_id, STAGE, "started", "running", 0,
            {"traceId": trace_id, "roomFileVersion": room_file_version, "taskId": task_id},
        )

        mesh_url = inputs.get("meshPlyUrl")
        captured_url = inputs.get("capturedRoomUrl")
        if not mesh_url or not captured_url:
            raise InputError("inputs.meshPlyUrl and inputs.capturedRoomUrl are required")

        import json as _json

        parametric = parse_captured_room_meters(_json.loads(_fetch(captured_url)))
        points = read_ply_vertices(_fetch(mesh_url))
        result = verify_room(points, parametric, build_config(inputs.get("config")))
        verify_doc = result.to_dict()

        db.update_room_file(room_file_id, verify=verify_doc, artifacts=None)
        duration_ms = int((time.monotonic() - started) * 1000)
        db.append_event(
            scan_id, room_file_id, STAGE, "completed", "succeeded", duration_ms,
            {
                "traceId": trace_id,
                "roomFileVersion": room_file_version,
                "summary": verify_doc["summary"],
            },
        )
        db.complete_task(
            task_id,
            {
                "stage": STAGE,
                "roomFileId": room_file_id,
                "roomFileVersion": room_file_version,
                "verify": verify_doc,
            },
        )
        completed = True
        return verify_doc
    finally:
        # Any exit that is not a recorded completion — exception, cancellation,
        # timeout — releases the task. Nothing may stay claimed forever.
        if not completed:
            try:
                db.append_event(
                    scan_id, room_file_id, STAGE, "failed", "failed",
                    int((time.monotonic() - started) * 1000),
                    {"traceId": trace_id, "roomFileVersion": room_file_version},
                )
            except Exception:
                pass
            try:
                db.fail_task(task_id, _error_text())
            except Exception:
                pass
        if owns_db:
            db.close()


def _error_text() -> str:
    import sys
    import traceback

    exc = sys.exc_info()[1]
    if exc is None:
        return f"{STAGE} exited without completing"
    return "".join(traceback.format_exception_only(type(exc), exc)).strip()
