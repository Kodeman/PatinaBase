"""SolveStage.run — the successor-enqueue wiring (Rendered Room v2 W1).

Covers the wrapper around `_solve`: drawings enqueues unconditionally exactly
as it did before verify existed, verify enqueues as a SECOND, non-gating
successor, and a verify-enqueue failure never fails solve or affects the
drawings enqueue in either direction. The solve math itself (scale fit,
tolerance classing, certificate) is covered by test_solve_math.py; `_solve` is
monkeypatched here to a canned summary so these tests isolate the enqueue
wiring rather than re-deriving geometry fixtures.
"""

from __future__ import annotations

import pytest

from patina_scan_worker.stages.base import Context
from patina_scan_worker.stages.solve import SolveStage

SCAN_ID = "11111111-1111-1111-1111-111111111111"
ROOM_FILE_ID = "22222222-2222-2222-2222-222222222222"
VERSION = 3
TASK_ID = "33333333-3333-3333-3333-333333333333"
LEASE_OWNER = "worker-1:lease-abc"

SUMMARY = {
    "scale": 1.0,
    "rms_residual_mm": 2.5,
    "dimension_counts": {"verified": 3},
    "unverified": False,
    "measurement_rows": 3,
    "warnings": [],
}


class FakeSettings:
    def __init__(self, work_dir: str):
        self.work_dir = work_dir


class RecordingQueue:
    """Records every accepted enqueue_successor call; raises for any task_type
    in `fail_on` — but still records the ATTEMPT (in `attempted_types`) before
    raising, so a test can tell "never called" apart from "called and failed"."""

    def __init__(self, fail_on: set[str] | None = None):
        self.calls: list[dict] = []
        self.attempted_types: list[str] = []
        self._fail_on = fail_on or set()

    def enqueue_successor(
        self, task_type, payload, entity_id, idempotency_key, *,
        owner_task_id, parent_task_id, lease_owner,
    ):
        self.attempted_types.append(task_type)
        if task_type in self._fail_on:
            raise RuntimeError(f"rpc enqueue_agent_successor_if_owned -> 500: boom ({task_type})")
        self.calls.append({
            "task_type": task_type,
            "payload": payload,
            "entity_id": entity_id,
            "idempotency_key": idempotency_key,
            "owner_task_id": owner_task_id,
            "parent_task_id": parent_task_id,
            "lease_owner": lease_owner,
        })
        return {"id": "new-successor-task-id"}


class RecordingTelemetry:
    def __init__(self):
        self.events: list[tuple] = []

    def emit(self, scan_id, stage, event, status="info", room_file_id=None,
              duration_ms=None, detail=None):
        self.events.append((stage, event, status, detail))


def make_task():
    return {
        "id": TASK_ID,
        "_lease_owner": LEASE_OWNER,
        "payload": {
            "scan_id": SCAN_ID,
            "room_file_id": ROOM_FILE_ID,
            "room_file_version": VERSION,
        },
    }


def make_ctx(tmp_path, queue, telemetry=None):
    return Context(
        settings=FakeSettings(str(tmp_path)),
        queue=queue,
        storage=object(),
        db=object(),
        telemetry=telemetry or RecordingTelemetry(),
    )


@pytest.fixture(autouse=True)
def fake_solve(monkeypatch):
    """Bypass the real geometry solve — these tests only exercise the
    enqueue wrapper around it."""
    monkeypatch.setattr(
        SolveStage, "_solve",
        lambda self, ctx, task, scan_id, room_file_id, version, work: dict(SUMMARY),
    )


def test_both_successors_enqueued_on_success(tmp_path):
    queue = RecordingQueue()
    ctx = make_ctx(tmp_path, queue)
    outcome = SolveStage().run(ctx, make_task())

    task_types = [c["task_type"] for c in queue.calls]
    assert task_types == ["scan_pipeline.drawings", "scan_pipeline.verify"]
    assert outcome.artifacts["successor_enqueued"] == "scan_pipeline.drawings"
    assert outcome.artifacts["verify_enqueued"] is True

    drawings_call = queue.calls[0]
    assert drawings_call["payload"] == {
        "scan_id": SCAN_ID,
        "room_file_id": ROOM_FILE_ID,
        "room_file_version": VERSION,
    }
    assert drawings_call["idempotency_key"] == f"{SCAN_ID}:drawings:{VERSION}"

    verify_call = queue.calls[1]
    assert verify_call["idempotency_key"] == f"{SCAN_ID}:verify:{VERSION}"
    assert verify_call["owner_task_id"] == TASK_ID
    assert verify_call["parent_task_id"] == TASK_ID
    assert verify_call["lease_owner"] == LEASE_OWNER
    assert verify_call["entity_id"] == SCAN_ID

    # The verify payload must satisfy BOTH readers of the same agent_tasks
    # payload column: dispatch-scan-modal's extractTaskInputIds (snake_case
    # scan_id/room_file_version) and 00490's scan_worker_update_room_file
    # task-binding check (camelCase roomFileId/scanId).
    payload = verify_call["payload"]
    assert payload["scan_id"] == SCAN_ID
    assert payload["room_file_id"] == ROOM_FILE_ID
    assert payload["room_file_version"] == VERSION
    assert payload["scanId"] == SCAN_ID
    assert payload["roomFileId"] == ROOM_FILE_ID
    assert payload["roomFileVersion"] == VERSION


def test_drawings_still_enqueued_when_verify_enqueue_raises(tmp_path):
    """The core rule: verify must never gate drawings. A verify-enqueue
    failure is caught, logged, and swallowed — solve still succeeds."""
    queue = RecordingQueue(fail_on={"scan_pipeline.verify"})
    telemetry = RecordingTelemetry()
    ctx = make_ctx(tmp_path, queue, telemetry)

    outcome = SolveStage().run(ctx, make_task())

    # drawings was attempted AND accepted; verify was attempted but rejected.
    assert queue.attempted_types == ["scan_pipeline.drawings", "scan_pipeline.verify"]
    assert [c["task_type"] for c in queue.calls] == ["scan_pipeline.drawings"]
    assert outcome.artifacts["successor_enqueued"] == "scan_pipeline.drawings"
    assert outcome.artifacts["verify_enqueued"] is False

    # solve still reports success, and the failure is visible in telemetry.
    stages = [e[1] for e in telemetry.events]
    assert "solve.verify_enqueue_failed" in stages
    assert "solve.succeeded" in stages
    assert "solve.failed" not in stages


def test_verify_enqueue_never_attempted_if_drawings_enqueue_raises(tmp_path):
    """The other direction: if the unguarded drawings enqueue itself raises,
    that is pre-existing, untouched behavior — solve fails, and verify (which
    runs strictly after drawings) is never attempted at all."""
    queue = RecordingQueue(fail_on={"scan_pipeline.drawings"})
    ctx = make_ctx(tmp_path, queue)

    with pytest.raises(RuntimeError):
        SolveStage().run(ctx, make_task())

    assert queue.attempted_types == ["scan_pipeline.drawings"]
    assert queue.calls == []


def test_verify_payload_matches_00490_binding_and_dispatcher_contract(tmp_path):
    """Regression guard for the two independent readers of the SAME payload
    column: dispatch-scan-modal/lib.ts's extractTaskInputIds (scan_id,
    room_file_version) and 00490's scan_worker_update_room_file, whose
    task-binding check reads payload->>'roomFileId' / payload->>'scanId'."""
    queue = RecordingQueue()
    ctx = make_ctx(tmp_path, queue)
    SolveStage().run(ctx, make_task())

    verify_payload = queue.calls[1]["payload"]
    # dispatcher (extractTaskInputIds) contract
    assert isinstance(verify_payload["scan_id"], str) and verify_payload["scan_id"]
    assert isinstance(verify_payload["room_file_version"], int)
    # 00490 scan_worker_update_room_file binding-check contract
    assert verify_payload["roomFileId"] == ROOM_FILE_ID
    assert verify_payload["scanId"] == SCAN_ID
