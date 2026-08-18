"""`verify` job glue — ledger writes on success, and release on failure.

No network and no Postgres: downloads are monkeypatched and the database seam is
a recorder. This covers the invariant that matters operationally — a task never
stays claimed after the job exits.
"""

from __future__ import annotations

import json

import pytest

from scan_modal.core.verify import VerifyConfig
from scan_modal.jobs import verify_job

import _synthetic as syn


class RecordingDb:
    def __init__(self):
        self.events: list[tuple] = []
        self.room_files: list[tuple] = []
        self.completed: list[tuple] = []
        self.failed: list[tuple] = []

    def append_event(self, scan_id, room_file_id, stage, event, status, duration_ms, detail=None):
        self.events.append((stage, event, status))

    def update_room_file(self, room_file_id, verify, artifacts):
        self.room_files.append((room_file_id, verify, artifacts))

    def complete_task(self, task_id, result):
        self.completed.append((task_id, result))

    def fail_task(self, task_id, error):
        self.failed.append((task_id, error))

    def close(self):
        pass


def payload(**overrides):
    p = {
        "taskId": "task-1",
        "scanId": "scan-1",
        "roomFileId": "rf-1",
        "roomFileVersion": 4,
        "traceId": "trace-1",
        "inputs": {
            "meshPlyUrl": "https://example/mesh.ply",
            "capturedRoomUrl": "https://example/captured_room.json",
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
    assert db.events[0] == ("verify", "started", "running")
    assert db.events[-1] == ("verify", "completed", "succeeded")
    assert db.room_files == [("rf-1", doc, None)]
    assert db.completed[0][0] == "task-1"
    assert db.completed[0][1]["roomFileVersion"] == 4
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
        "meshPlyUrl": "https://example/mesh.ply",
        "capturedRoomUrl": "https://example/captured_room.json",
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
