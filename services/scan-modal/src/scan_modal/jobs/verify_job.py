"""`verify` job glue — the only part of the stage that touches the world.

Inputs arrive as presigned Supabase Storage URLs (the `convert-room-scan-glb`
pattern), so this wave runs before any R2 cutover. Outputs go to `room_files`,
`scan_pipeline_events`, and the task ledger, over the `scan_worker` role only.

The lease/idempotency posture is documented in `scan_modal.io.db`. The rule this
file enforces: a `LeaseRejected` from ANY call means this invocation is stale —
another worker holds the task now — so it logs one line and exits WITHOUT
touching the ledger. Failing the task here would requeue work that is actively
running, and the next dispatcher tick would spawn a second GPU job for it.
"""

from __future__ import annotations

import json as _json
import re
import time
from typing import Any

from ..core.captured_room import parse_captured_room_meters
from ..core.verify import VerifyConfig, verify_room
from ..io.db import LeaseRejected, ScanWorkerDb
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

    Returns the result dict written to `room_files.verify`, or a
    `{"skipped": "lease_rejected"}` marker if this invocation's lease is gone.
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
    lease_lost = False
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
        lease_lost = True
        print(_json.dumps({
            "fn": "scan-modal-verify",
            "event": "lease_rejected",
            "taskId": task_id,
            "traceId": trace_id,
            "roomFileVersion": room_file_version,
        }))
        return {"skipped": "lease_rejected"}
    finally:
        # Any exit that is neither a recorded completion nor a lost lease —
        # exception, cancellation, timeout — releases the task. Nothing may stay
        # claimed forever, and nothing stale may un-claim live work.
        if not completed and not lease_lost:
            _release(db, task_id, lease_token, scan_id, room_file_id, trace_id,
                     room_file_version, started)
        if owns_db and db is not None:
            db.close()


def _release(
    db: ScanWorkerDb | None,
    task_id: Any,
    lease_token: Any,
    scan_id: Any,
    room_file_id: Any,
    trace_id: Any,
    room_file_version: Any,
    started: float,
) -> None:
    """Best-effort failure record. Every call here is individually guarded: this
    runs from a `finally` during an exception unwind, so a second exception
    raised out of it would MASK the real one."""
    error_text = _error_text()
    own_db = False
    if db is None:
        # The connection itself is what failed. One fresh attempt, so a
        # transient connect error still gets recorded rather than leaving the
        # task to time out silently.
        try:
            db = ScanWorkerDb.from_env()
            own_db = True
        except Exception:
            return
    try:
        try:
            db.append_event(
                task_id, lease_token, scan_id, room_file_id, STAGE, "failed", "failed",
                int((time.monotonic() - started) * 1000),
                {"traceId": trace_id, "roomFileVersion": room_file_version},
            )
        except Exception:
            pass
        try:
            db.fail_task(task_id, lease_token, error_text)
        except Exception:
            pass
    finally:
        if own_db:
            db.close()


# A signed URL's whole point is that its query string is a credential. Anything
# derived from an exception can carry one — httpx puts the full request URL in
# HTTPStatusError's message — and this text is persisted to
# `agent_tasks.last_error`, which is far more readable than the URL it would
# leak. Redact before persisting, not at some display layer.
_URL_RE = re.compile(r"https?://[^\s'\"<>]+")
# A bare storage key with a signature appended (no scheme). Anchored on a `/`
# so ordinary prose containing a question mark is left alone.
_BARE_QUERY_RE = re.compile(r"(/[^\s'\"<>?]*)\?[^\s'\"<>]*")


def _redact(text: str) -> str:
    return _BARE_QUERY_RE.sub(r"\1", _URL_RE.sub("[url]", text))


def _error_text() -> str:
    import sys
    import traceback

    exc = sys.exc_info()[1]
    if exc is None:
        return f"{STAGE} exited without completing"
    return _redact("".join(traceback.format_exception_only(type(exc), exc)).strip())
