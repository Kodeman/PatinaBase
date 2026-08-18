"""`renders` job glue, with Blender behind a fake `BlenderScene`.

`core/blender_ops.BlenderScene` is the entire Blender surface — four verbs — so
these tests never import bpy and never allocate an L40S. What is under test is
the ledger discipline, the per-frame register/PUT/mark order, and the artifact
manifest shape.
"""

from __future__ import annotations

import json

import pytest

from scan_modal.core.cameras import Bbox, TURNTABLE_FRAMES
from scan_modal.io.db import LeaseRejected, StaleVersion
from scan_modal.jobs import renders_job

from test_verify_job import LEASE, LeaseRejectingDb, RecordingDb  # noqa: F401

GLB_URL = "https://example/sign/room-scans/usdz/u/r/room.glb?token=t"
ROOM = Bbox.from_points((-2.0, -1.5, 0.0), (2.0, 1.5, 2.5))


def payload(**overrides):
    p = {
        "taskId": "task-1",
        "leaseToken": LEASE,
        "scanId": "scan-1",
        "roomFileId": "rf-1",
        "roomFileVersion": 4,
        "traceId": "trace-1",
        "inputs": {"glbUrl": GLB_URL},
    }
    p.update(overrides)
    return p


class FakeScene:
    """Implements exactly `BlenderScene`'s three verbs and nothing else."""

    def __init__(self, bbox=ROOM, fail_on=None):
        self.bbox = bbox
        self.fail_on = fail_on
        self.imported: list[str] = []
        self.setup_with: list[Bbox] = []
        self.rendered: list[str] = []

    def import_glb(self, path):
        self.imported.append(path.name)
        if self.fail_on == "import":
            raise RuntimeError("imported GLB contains no mesh geometry")
        return self.bbox

    def setup(self, bbox):
        self.setup_with.append(bbox)

    def render(self, shot, output_path):
        if self.fail_on == shot.name:
            raise RuntimeError(f"Cycles failed rendering {shot.name}")
        self.rendered.append(shot.name)
        output_path.write_bytes(b"jpeg-bytes")
        return output_path


@pytest.fixture
def world(monkeypatch, tmp_path):
    class World:
        def __init__(self):
            self.fetched: list[str] = []
            self.uploads: list[tuple] = []
            self.upload_error: Exception | None = None
            self.work_root = tmp_path / "work"

    w = World()

    def fake_fetch(url, timeout=None):
        w.fetched.append(url)
        return b"glb-bytes"

    def fake_put_file(bucket, key, path, content_type, client=None):
        if w.upload_error is not None:
            raise w.upload_error
        w.uploads.append((bucket, key, content_type))
        return {"sha256": f"sha-{len(w.uploads)}", "size_bytes": 10, "etag": f"etag-{len(w.uploads)}"}

    monkeypatch.setattr(renders_job, "_fetch", fake_fetch)
    monkeypatch.setattr(renders_job._r2, "put_file", fake_put_file)
    monkeypatch.setattr(renders_job._r2, "artifacts_bucket", lambda: "patina-staging-media-artifacts-us")
    return w


def run(world, db, scene=None, **overrides):
    return renders_job.run_renders(
        payload(**overrides), db=db, scene=scene or FakeScene(), work_root=world.work_root
    )


# ── the happy path ──────────────────────────────────────────────────────────


def test_success_renders_the_whole_plan_and_merges_one_manifest(world):
    db = RecordingDb()
    scene = FakeScene()
    result = run(world, db, scene)

    assert db.events[0] == ("renders", "started", "started")
    assert db.events[-1] == ("renders", "completed", "succeeded")
    assert scene.imported == ["room.glb"]
    assert scene.setup_with == [ROOM]
    assert len(scene.rendered) == 4 + 1 + TURNTABLE_FRAMES == 29
    assert len(world.uploads) == 29
    assert len(db.registered) == 29
    assert len(db.marked) == 29

    room_file_id, verify, artifacts = db.room_files[0]
    assert room_file_id == "rf-1"
    assert verify is None, "renders must never touch the verify column"
    ref = artifacts["renders"]
    assert ref["count"] == 29
    assert ref["version"] == 4
    assert set(ref["shots"]) == set(scene.rendered)
    assert db.completed[0][1]["artifacts"] == artifacts
    assert result["artifacts"] == artifacts
    assert db.failed == []


def test_the_manifest_hoists_the_cover_object_id_so_the_00490_view_resolves_it(world):
    """`scan_media_read` resolves an artifacts ref by its TOP-LEVEL object_id.
    Without the hoist the view would silently drop the renders row (NULL::uuid
    joins nothing) rather than error — the worse failure."""
    db = RecordingDb()
    run(world, db)
    ref = db.room_files[0][2]["renders"]
    assert ref["cover"] == renders_job.COVER_SHOT == "top_down"
    assert ref["object_id"] == ref["shots"]["top_down"]["object_id"]
    assert ref["object_id"].startswith("object-")


def test_every_frame_is_registered_before_it_is_uploaded_and_marked_after(world):
    db = RecordingDb()
    run(world, db)
    for index, entry in enumerate(db.registered):
        assert entry["access_class"] == "authenticated_project"
        assert entry["mime"] == "image/jpeg"
        assert entry["scan_id"] == "scan-1"
        assert entry["object_key"] == world.uploads[index][1]
    for index, (object_id, state, extra) in enumerate(db.marked):
        assert state == "stored"
        assert object_id == f"object-{index + 1}"
        assert extra["sha256"] == f"sha-{index + 1}"


def test_object_keys_are_scan_and_version_scoped_under_renders(world):
    db = RecordingDb()
    run(world, db)
    keys = [u[1] for u in world.uploads]
    assert keys[0] == "scan_artifacts/scan-1/v4/renders/corner_ne.jpg"
    assert "scan_artifacts/scan-1/v4/renders/top_down.jpg" in keys
    assert "scan_artifacts/scan-1/v4/renders/turntable_023.jpg" in keys
    assert len(set(keys)) == len(keys)


def test_render_object_key_shape():
    assert renders_job.render_object_key("s1", 7, "top_down") == (
        "scan_artifacts/s1/v7/renders/top_down.jpg"
    )


def test_every_lease_gated_call_carries_the_lease_token(world):
    db = RecordingDb()
    run(world, db)
    assert set(db.leases) == {LEASE}


def test_a_different_bbox_moves_the_cameras_but_not_the_shot_set(world):
    db = RecordingDb()
    scene = FakeScene(bbox=Bbox.from_points((0.0, 0.0, 3.0), (10.0, 8.0, 6.0)))
    run(world, db, scene)
    assert len(scene.rendered) == 29
    assert db.room_files[0][2]["renders"]["count"] == 29


# ── failure paths ───────────────────────────────────────────────────────────


def test_missing_glb_url_fails_the_task(world):
    db = RecordingDb()
    with pytest.raises(renders_job.InputError):
        run(world, db, inputs={})
    assert db.completed == []
    assert "InputError" in db.failed[0][1]
    assert db.events[-1] == ("renders", "failed", "failed")


def test_missing_task_id_is_rejected_before_any_ledger_write(world):
    db = RecordingDb()
    with pytest.raises(renders_job.InputError):
        run(world, db, taskId=None)
    assert db.events == [] and db.failed == []


def test_missing_lease_token_is_rejected_before_any_ledger_write(world):
    db = RecordingDb()
    with pytest.raises(renders_job.InputError):
        run(world, db, leaseToken=None)
    assert db.events == [] and db.failed == []


def test_a_glb_with_no_geometry_fails_the_task(world):
    db = RecordingDb()
    with pytest.raises(RuntimeError):
        run(world, db, FakeScene(fail_on="import"))
    assert db.completed == []
    assert db.room_files == []
    assert "no mesh geometry" in db.failed[0][1]


def test_a_failed_frame_fails_the_whole_task_and_merges_nothing(world):
    """A partial gallery must not be published: the manifest is written once, at
    the end, so an interrupted set leaves the room file untouched."""
    db = RecordingDb()
    with pytest.raises(RuntimeError):
        run(world, db, FakeScene(fail_on="turntable_005"))
    assert db.room_files == []
    assert db.completed == []
    assert db.failed


def test_an_r2_upload_failure_fails_the_task_with_a_clean_error(world):
    world.upload_error = RuntimeError(
        "PUT https://acct.r2.cloudflarestorage.com/bucket/scan_artifacts/scan-1/v4/"
        "renders/corner_ne.jpg?X-Amz-Signature=DEADBEEFSECRET failed"
    )
    db = RecordingDb()
    with pytest.raises(RuntimeError):
        run(world, db)

    assert db.registered, "the row is registered before the PUT"
    assert db.marked == []
    assert db.room_files == []
    persisted = db.failed[0][1]
    assert "DEADBEEFSECRET" not in persisted
    assert "https://" not in persisted
    assert "[url]" in persisted


def test_a_download_failure_redacts_the_signed_url(world, monkeypatch):
    import httpx

    signed = ("https://proj.supabase.co/storage/v1/object/sign/room-scans/"
              "usdz/u1/r1/room.glb?token=eyJhbGciOiJIUzI1NiJ9.SUPERSECRET")

    def boom(url, timeout=None):
        request = httpx.Request("GET", signed)
        raise httpx.HTTPStatusError(
            f"Client error '403 Forbidden' for url '{signed}'",
            request=request, response=httpx.Response(403, request=request),
        )

    monkeypatch.setattr(renders_job, "_fetch", boom)
    db = RecordingDb()
    with pytest.raises(httpx.HTTPStatusError):
        run(world, db)

    persisted = db.failed[0][1]
    assert "SUPERSECRET" not in persisted
    assert "https://" not in persisted
    assert "403" in persisted


# ── the golden lease / version cases ────────────────────────────────────────


@pytest.mark.parametrize("reject_on", ["append_event", "update_room_file", "complete_task"])
def test_lease_rejection_exits_clean_and_never_fails_the_task(world, capsys, reject_on):
    db = LeaseRejectingDb(reject_on)
    result = run(world, db)

    assert result == {"skipped": "lease_rejected"}
    assert db.failed == []
    assert db.completed == []
    line = json.loads(capsys.readouterr().out.strip().splitlines()[-1])
    assert line["event"] == "lease_rejected"
    assert line["fn"] == "scan-modal-renders"


def test_a_superseded_room_file_exits_clean_without_failing_the_task(world, capsys):
    class StaleDb(RecordingDb):
        def update_room_file(self, *a, **k):
            raise StaleVersion("scan_worker_update_room_file refused: superseded")

    db = StaleDb()
    result = run(world, db)

    assert result == {"skipped": "stale_version"}
    assert db.failed == []
    assert db.completed == []
    assert db.room_files == []
    line = json.loads(capsys.readouterr().out.strip().splitlines()[-1])
    assert line["event"] == "stale_version"


def test_duplicate_delivery_is_refused_at_the_first_ledger_write(world, capsys):
    class StatefulDb(RecordingDb):
        def __init__(self):
            super().__init__()
            self._terminal = False

        def _check(self):
            if self._terminal:
                raise LeaseRejected("task refused: already terminal")

        def append_event(self, *a, **k):
            self._check()
            return super().append_event(*a, **k)

        def update_room_file(self, *a, **k):
            self._check()
            return super().update_room_file(*a, **k)

        def complete_task(self, task_id, lease_token, result):
            self._check()
            out = super().complete_task(task_id, lease_token, result)
            self._terminal = True
            return out

    db = StatefulDb()
    run(world, db)
    second = run(world, db)

    assert second == {"skipped": "lease_rejected"}
    assert len(db.completed) == 1
    assert len(db.room_files) == 1
    assert db.failed == []
