"""`verify` job glue — ledger writes on success, release on failure, and the
one case that must write NOTHING: a lease that has moved on.

No network and no Postgres: downloads are monkeypatched and the database seam is
a recorder. This covers the invariants that matter operationally — a task never
stays claimed after a genuine failure, and a STALE invocation never touches a
task another worker now holds.
"""

from __future__ import annotations

import json

import pytest

from scan_modal.core.verify import VerifyConfig
from scan_modal.io.db import LeaseRejected
from scan_modal.jobs import verify_job

import _synthetic as syn

LEASE = "dispatch-scan-modal:lease-1"


class RecordingDb:
    """The shared fake ledger. `verify` uses the four lease-gated RPCs; `splat`
    and `renders` also use the two 00489 media-registry RPCs, which take no
    lease token — so those are recorded here too and the whole suite has one
    fake to reason about."""

    def __init__(self):
        self.events: list[tuple] = []
        self.room_files: list[tuple] = []
        self.completed: list[tuple] = []
        self.failed: list[tuple] = []
        self.leases: list[str] = []
        self.registered: list[dict] = []
        self.marked: list[tuple] = []

    def append_event(
        self, task_id, lease_token, scan_id, room_file_id, stage, event, status,
        duration_ms, detail=None,
    ):
        self.leases.append(lease_token)
        self.events.append((stage, event, status))

    def update_room_file(self, task_id, lease_token, room_file_id, verify, artifacts):
        self.leases.append(lease_token)
        self.room_files.append((room_file_id, verify, artifacts))

    def complete_task(self, task_id, lease_token, result):
        self.leases.append(lease_token)
        self.completed.append((task_id, result))

    def fail_task(self, task_id, lease_token, error):
        self.leases.append(lease_token)
        self.failed.append((task_id, error))

    # ── the 00489 media registry (no lease token by design) ─────────────────

    def register_media_object(self, **kwargs):
        self.registered.append(kwargs)
        return f"object-{len(self.registered)}"

    def mark_media_object_state(self, object_id, state, **kwargs):
        self.marked.append((object_id, state, kwargs))

    def close(self):
        pass


def payload(**overrides):
    p = {
        "taskId": "task-1",
        "leaseToken": LEASE,
        "scanId": "scan-1",
        "roomFileId": "rf-1",
        "roomFileVersion": 4,
        "traceId": "trace-1",
        "inputs": {
            "meshUrl": "https://example/mesh.ply",
            "capturedRoomJsonUrl": "https://example/captured_room.json",
        },
    }
    p.update(overrides)
    return p


@pytest.fixture
def fetches(monkeypatch):
    mesh = syn.write_ply(syn.mesh_points(), fmt="binary_little_endian")
    captured = json.dumps(syn.captured_room_json()).encode()

    def fake_fetch(url: str) -> bytes:
        return mesh if url.endswith(".ply") else captured

    monkeypatch.setattr(verify_job, "_fetch", fake_fetch)


def test_success_writes_room_file_event_and_completion(fetches):
    db = RecordingDb()
    doc = verify_job.run_verify(payload(), db=db)

    assert doc["summary"]["walls_checked"] == 4
    # 'started', not 'running' — scan_pipeline_events' CHECK rejects 'running'.
    assert db.events[0] == ("verify", "started", "started")
    assert db.events[-1] == ("verify", "completed", "succeeded")
    assert db.room_files == [("rf-1", doc, None)]
    assert db.completed[0][0] == "task-1"
    assert db.completed[0][1]["roomFileVersion"] == 4
    assert db.failed == []


def test_every_ledger_call_carries_the_lease_token(fetches):
    db = RecordingDb()
    verify_job.run_verify(payload(), db=db)

    assert db.leases, "expected ledger calls"
    assert set(db.leases) == {LEASE}


def test_missing_lease_token_is_rejected_before_any_ledger_write():
    db = RecordingDb()
    with pytest.raises(verify_job.InputError):
        verify_job.run_verify(payload(leaseToken=None), db=db)
    assert db.events == []
    assert db.failed == []


def test_missing_inputs_fails_the_task_rather_than_leaving_it_claimed(fetches):
    db = RecordingDb()
    with pytest.raises(verify_job.InputError):
        verify_job.run_verify(payload(inputs={}), db=db)

    assert db.completed == []
    assert len(db.failed) == 1
    assert db.failed[0][0] == "task-1"
    assert "InputError" in db.failed[0][1]
    assert db.events[-1] == ("verify", "failed", "failed")


def test_download_failure_fails_the_task(monkeypatch):
    def boom(url: str) -> bytes:
        raise RuntimeError("origin unreachable")

    monkeypatch.setattr(verify_job, "_fetch", boom)
    db = RecordingDb()
    with pytest.raises(RuntimeError):
        verify_job.run_verify(payload(), db=db)

    assert db.failed[0][1] == "RuntimeError: origin unreachable"
    assert db.completed == []


def test_config_overrides_reach_the_core(fetches):
    db = RecordingDb()
    doc = verify_job.run_verify(payload(inputs={
        "meshUrl": "https://example/mesh.ply",
        "capturedRoomJsonUrl": "https://example/captured_room.json",
        "config": {"curved_rms_mm": -1.0, "not_a_field": 1},
    }), db=db)

    # A negative curvature threshold flags every wall — proof the override
    # reached the core, and that the unknown key was dropped rather than thrown.
    assert len(doc["summary"]["curved_walls"]) == 4


def test_build_config_filters_unknown_keys():
    assert verify_job.build_config(None) == VerifyConfig()
    assert verify_job.build_config({"seed": 9, "nonsense": True}) == VerifyConfig(seed=9)


def test_missing_task_id_is_rejected_before_any_ledger_write():
    db = RecordingDb()
    with pytest.raises(verify_job.InputError):
        verify_job.run_verify(payload(taskId=None), db=db)
    assert db.events == []
    assert db.failed == []


# ── the stale-invocation path ───────────────────────────────────────────────


class LeaseRejectingDb(RecordingDb):
    """Raises LeaseRejected at the point the real RPC would: the write that
    finds `locked_by` no longer matching."""

    def __init__(self, reject_on: str):
        super().__init__()
        self.reject_on = reject_on

    def append_event(self, task_id, lease_token, *args, **kwargs):
        if self.reject_on == "append_event":
            raise LeaseRejected("scan_worker_append_event refused: lease no longer held")
        return super().append_event(task_id, lease_token, *args, **kwargs)

    def update_room_file(self, task_id, lease_token, *args, **kwargs):
        if self.reject_on == "update_room_file":
            raise LeaseRejected("scan_worker_update_room_file refused: lease no longer held")
        return super().update_room_file(task_id, lease_token, *args, **kwargs)

    def complete_task(self, task_id, lease_token, result):
        if self.reject_on == "complete_task":
            raise LeaseRejected("scan_worker_complete_task refused: lease no longer held")
        return super().complete_task(task_id, lease_token, result)


@pytest.mark.parametrize("reject_on", ["append_event", "update_room_file", "complete_task"])
def test_lease_rejection_exits_clean_and_never_fails_the_task(fetches, capsys, reject_on):
    """THE amplification guard. A stale invocation that called fail_task would
    requeue a task another worker is actively running, and the next dispatcher
    tick would spawn a second GPU job for it. It must write nothing at all."""
    db = LeaseRejectingDb(reject_on)

    result = verify_job.run_verify(payload(), db=db)

    assert result == {"skipped": "lease_rejected"}
    assert db.failed == [], "a stale invocation must never fail a live task"
    assert db.completed == []
    # It says so once, on stdout, and the line names no URL.
    line = json.loads(capsys.readouterr().out.strip().splitlines()[-1])
    assert line["event"] == "lease_rejected"
    assert line["taskId"] == "task-1"


def test_lease_rejection_at_completion_keeps_the_earlier_writes(fetches):
    """Rejection at the last call is the interesting one: the stage ran, the
    earlier writes were accepted under a lease that was still live, and only the
    completion is refused. Still no fail_task."""
    db = LeaseRejectingDb("complete_task")
    verify_job.run_verify(payload(), db=db)

    assert db.events[0] == ("verify", "started", "started")
    assert db.room_files, "the pre-rejection writes stand"
    assert db.failed == []


# ── redaction ───────────────────────────────────────────────────────────────


def test_error_text_redacts_a_signed_url_from_an_httpx_error(monkeypatch):
    """`agent_tasks.last_error` is far more readable than the signed URL an
    httpx error message embeds. Redact before persisting."""
    import httpx

    signed = (
        "https://proj.supabase.co/storage/v1/object/sign/room-scans/"
        "mesh/u1/r1/mesh.ply?token=eyJhbGciOiJIUzI1NiJ9.SUPERSECRETSIGNATURE"
    )

    def boom(url: str) -> bytes:
        request = httpx.Request("GET", signed)
        response = httpx.Response(403, request=request)
        raise httpx.HTTPStatusError(
            f"Client error '403 Forbidden' for url '{signed}'", request=request, response=response
        )

    monkeypatch.setattr(verify_job, "_fetch", boom)
    db = RecordingDb()
    with pytest.raises(httpx.HTTPStatusError):
        verify_job.run_verify(payload(), db=db)

    persisted = db.failed[0][1]
    assert signed not in persisted
    assert "SUPERSECRETSIGNATURE" not in persisted
    assert "token=" not in persisted
    assert "https://" not in persisted
    assert "[url]" in persisted
    # The useful part survives.
    assert "403" in persisted


def test_redact_strips_a_bare_key_query_but_leaves_prose():
    redacted = verify_job._redact(
        "failed on mesh/u1/r1/mesh.ply?token=SECRET — what now?"
    )
    assert "SECRET" not in redacted
    assert "mesh/u1/r1/mesh.ply" in redacted
    # A question mark that is not a query string is left alone.
    assert redacted.endswith("what now?")
