"""`verify` job glue — the only part of the stage that touches the world.

Inputs arrive as presigned Supabase Storage URLs (the `convert-room-scan-glb`
pattern), so this wave runs before any R2 cutover. Outputs go to `room_files`,
`scan_pipeline_events`, and the task ledger, over the `scan_worker` role only.

The lease/idempotency posture is documented in `scan_modal.io.db`. The rule this
file enforces: a `LeaseRejected` from ANY call means this invocation is stale —
another worker holds the task now — so it logs one line and exits WITHOUT
touching the ledger. Failing the task here would requeue work that is actively
running, and the next dispatcher tick would spawn a second GPU job for it.

`StaleVersion` (00492, SQLSTATE P0404) is handled the same way for a different
reason: the room file this task was dispatched for is no longer the newest for
its scan, so the answer is obsolete rather than wrong. Requeueing would just
recompute the same obsolete answer.

The download / redaction / release helpers live in `jobs/_common.py`, shared
with `splat` and `renders` — those three behaviours must be identical across
stages, and three copies would be three chances to drift.
"""

from __future__ import annotations

import json as _json
import time
from typing import Any

from ..core.captured_room import parse_captured_room_meters
from ..core.verify import VerifyConfig, verify_room
from ..io.db import LeaseRejected, ScanWorkerDb, StaleVersion
from ..io.ply import read_ply_vertices
from . import _common

__all__ = ["STAGE", "InputError", "run_verify", "build_config"]

STAGE = "verify"

# Module-level aliases: tests monkeypatch `verify_job._fetch`, and the job calls
# it through this global, so the seam survives the move into _common.
_fetch = _common.fetch
_redact = _common.redact


class InputError(ValueError):
    """The dispatch payload is missing an input this stage cannot proceed without."""


def build_config(overrides: dict[str, Any] | None) -> VerifyConfig:
    """Per-task threshold overrides, filtered to real VerifyConfig fields."""
    if not overrides:
        return VerifyConfig()
    fields = VerifyConfig.__dataclass_fields__
    return VerifyConfig(**{k: v for k, v in overrides.items() if k in fields})


def run_verify(payload: dict[str, Any], db: ScanWorkerDb | None = None) -> dict[str, Any]:
    """Run `verify` for one dispatched task and write its outcome to the ledger.

    Returns the result dict written to `room_files.verify`, or a
    `{"skipped": ...}` marker if this invocation's lease is gone or its room
    file has been superseded.
    """
    task_id = payload.get("taskId")
    if not task_id:
        raise InputError("taskId is required")
    lease_token = payload.get("leaseToken")
    if not lease_token:
        raise InputError("leaseToken is required")
    scan_id = payload.get("scanId")
    room_file_id = payload.get("roomFileId")
    room_file_version = payload.get("roomFileVersion")
    trace_id = payload.get("traceId")
    inputs = payload.get("inputs") or {}

    started = time.monotonic()
    owns_db = db is None
    completed = False
    abandoned = False
    try:
        # Inside the try: a connect failure is a genuine failure like any other,
        # and the release path below gets its chance to record it.
        if db is None:
            db = ScanWorkerDb.from_env()

        # First statement of the job, and now lease-gated — a stale invocation
        # is refused here rather than after the whole stage has run. 'started'
        # (not 'running') is the vocabulary scan_pipeline_events' CHECK allows.
        db.append_event(
            task_id, lease_token, scan_id, room_file_id, STAGE, "started", "started", 0,
            {"traceId": trace_id, "roomFileVersion": room_file_version, "taskId": task_id},
        )

        mesh_url = inputs.get("meshUrl")
        captured_url = inputs.get("capturedRoomJsonUrl")
        if not mesh_url or not captured_url:
            raise InputError("inputs.meshUrl and inputs.capturedRoomJsonUrl are required")

        parametric = parse_captured_room_meters(_json.loads(_fetch(captured_url)))
        points = read_ply_vertices(_fetch(mesh_url))
        result = verify_room(points, parametric, build_config(inputs.get("config")))
        verify_doc = result.to_dict()

        db.update_room_file(task_id, lease_token, room_file_id, verify=verify_doc, artifacts=None)
        duration_ms = int((time.monotonic() - started) * 1000)
        db.append_event(
            task_id, lease_token, scan_id, room_file_id, STAGE, "completed", "succeeded", duration_ms,
            {
                "traceId": trace_id,
                "roomFileVersion": room_file_version,
                "summary": verify_doc["summary"],
            },
        )
        db.complete_task(
            task_id,
            lease_token,
            {
                "stage": STAGE,
                "roomFileId": room_file_id,
                "roomFileVersion": room_file_version,
                "verify": verify_doc,
            },
        )
        completed = True
        return verify_doc
    except LeaseRejected:
        # Someone else owns this task now. Say so once, write nothing, and go.
        abandoned = True
        _common.log_skip(STAGE, "lease_rejected", taskId=task_id, traceId=trace_id,
                         roomFileVersion=room_file_version)
        return {"skipped": "lease_rejected"}
    except StaleVersion:
        # A newer room file exists for this scan. Same clean exit, different
        # cause — never a fail_task, which would requeue obsolete work.
        abandoned = True
        _common.log_skip(STAGE, "stale_version", taskId=task_id, traceId=trace_id,
                         roomFileVersion=room_file_version)
        return {"skipped": "stale_version"}
    finally:
        # Any exit that is neither a recorded completion nor an abandoned one —
        # exception, cancellation, timeout — releases the task. Nothing may stay
        # claimed forever, and nothing stale may un-claim live work.
        if not completed and not abandoned:
            _common.release(db, STAGE, task_id, lease_token, scan_id, room_file_id,
                            {"traceId": trace_id, "roomFileVersion": room_file_version}, started)
        if owns_db and db is not None:
            db.close()
