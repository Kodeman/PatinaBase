"""`renders` job glue, with Blender behind a fake `BlenderScene`.

`core/blender_ops.BlenderScene` is the entire Blender surface, so these tests
never import bpy and never allocate an L40S. What is under test is the ledger
discipline, the per-frame register/PUT/mark order, and the artifact manifest
shape.

The subject is the PARAMETRIC room, not the GLB — see the job's own docstring.
So `capturedRoomJsonUrl` is the required input here and the GLB is an optional
overlay, and the fake scene answers `build_parametric` / `merge_glb`.
"""

from __future__ import annotations

import json

import pytest

from scan_modal.core.cameras import Bbox, RoomFrame, TURNTABLE_FRAMES, plan_cameras
from scan_modal.io.db import LeaseRejected, StaleVersion
from scan_modal.jobs import renders_job

from test_verify_job import LEASE, LeaseRejectingDb, RecordingDb  # noqa: F401

GLB_URL = "https://example/sign/room-scans/usdz/u/r/room.glb?token=t"
CAPTURED_URL = "https://example/sign/room-scans/captured_room/u/r/captured_room.json?token=t"
ROOM = Bbox.from_points((-2.0, -1.5, 0.0), (2.0, 1.5, 2.5))
#: What CAPTURED_ROOM below actually builds: ROOM grown by half a wall
#: thickness on each horizontal side, and down by the synthesized floor slab.
PARAMETRIC = Bbox.from_points((-2.05, -1.55, -0.05), (2.05, 1.55, 2.5))

#: A four-wall room whose parametric extent is ROOM. Read by `build_scene_spec`
#: for real — the scene spec is not faked, only Blender is.
CAPTURED_ROOM = {
    "walls": [
        {"identifier": "n", "dimensions": [4.0, 2.5, 0.0],
         "transform": [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0.0, 1.25, -1.5, 1]},
        {"identifier": "s", "dimensions": [4.0, 2.5, 0.0],
         "transform": [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0.0, 1.25, 1.5, 1]},
        {"identifier": "e", "dimensions": [3.0, 2.5, 0.0],
         "transform": [0, 0, 1, 0, 0, 1, 0, 0, -1, 0, 0, 0, 2.0, 1.25, 0.0, 1]},
        {"identifier": "w", "dimensions": [3.0, 2.5, 0.0],
         "transform": [0, 0, 1, 0, 0, 1, 0, 0, -1, 0, 0, 0, -2.0, 1.25, 0.0, 1]},
    ],
}


def payload(**overrides):
    p = {
        "taskId": "task-1",
        "leaseToken": LEASE,
        "scanId": "scan-1",
        "roomFileId": "rf-1",
        "roomFileVersion": 4,
        "traceId": "trace-1",
        "inputs": {"capturedRoomJsonUrl": CAPTURED_URL, "glbUrl": GLB_URL},
    }
    p.update(overrides)
    return p


class FakeScene:
    """Implements exactly `BlenderScene`'s verbs and nothing else."""

    def __init__(self, bbox=ROOM, fail_on=None, merged=None):
        self.bbox = bbox
        self.fail_on = fail_on
        self.merged = merged
        self.imported: list[str] = []
        self.built: list = []
        self.setup_with: list[Bbox] = []
        self.rendered: list[str] = []

    def import_glb(self, path):
        self.imported.append(path.name)
        if self.fail_on == "import":
            raise RuntimeError("imported GLB contains no mesh geometry")
        return self.bbox

    def build_parametric(self, spec):
        self.built.append(spec)

    def merge_glb(self, path):
        self.imported.append(path.name)
        if self.fail_on == "import":
            raise RuntimeError("imported GLB contains no mesh geometry")
        return self.merged

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
        return json.dumps(CAPTURED_ROOM).encode() if url == CAPTURED_URL else b"glb-bytes"

    def fake_put_file(bucket, key, path, content_type, client=None, content_encoding=None):
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
    # The cameras frame the PARAMETRIC room. `merged` is None here — the fake
    # GLB carried no geometry — and that is no longer a failure.
    assert [f.bbox for f in scene.setup_with] == [PARAMETRIC]
    assert [b.kind for b in scene.built[0].boxes] == ["wall"] * 4 + ["floor"]
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


# ── the parametric subject ──────────────────────────────────────────────────


def test_a_scan_with_no_glb_still_renders_its_room(world):
    """The GLB is an overlay now. A scan whose model_url_gltf was never stamped
    used to fail input resolution at the dispatcher and render nothing."""
    db = RecordingDb()
    scene = FakeScene()
    result = run(world, db, scene,
                 inputs={"capturedRoomJsonUrl": CAPTURED_URL})

    assert scene.imported == [], "no GLB was fetched or merged"
    assert world.fetched == [CAPTURED_URL]
    assert len(scene.rendered) == 29
    assert result["artifacts"]["renders"]["count"] == 29


def test_a_missing_captured_room_fails_the_task(world):
    """Reversed from W2: the parametric room is the required input."""
    db = RecordingDb()
    with pytest.raises(renders_job.InputError):
        run(world, db, FakeScene(), inputs={"glbUrl": GLB_URL})
    assert db.completed == []
    assert db.failed


def test_a_captured_room_with_no_geometry_fails_before_a_single_frame(world, monkeypatch):
    """29 pictures of an empty world is the exact failure this stage spent a
    wave discovering. It must cost an InputError, not an L40S."""
    db = RecordingDb()
    scene = FakeScene()
    empty = json.dumps({"walls": []}).encode()
    monkeypatch.setattr(renders_job, "_fetch", lambda url, timeout=None: empty)

    with pytest.raises(renders_job.InputError):
        run(world, db, scene, inputs={"capturedRoomJsonUrl": CAPTURED_URL})

    assert scene.rendered == []
    assert db.completed == []


def test_the_glbs_extent_widens_the_frame_but_never_narrows_it(world):
    """A mesh that overhangs the parametric room must not be framed out of shot,
    and a floor-only GLB must not shrink the frame back onto its own slab."""
    db = RecordingDb()
    overhang = Bbox.from_points((-3.0, -1.55, -0.05), (2.05, 1.55, 4.0))
    scene = FakeScene(merged=overhang)
    run(world, db, scene)

    framed = scene.setup_with[0].bbox
    assert framed.min == (-3.0, -1.55, -0.05)
    assert framed.max == (2.05, 1.55, 4.0)


def test_the_scene_is_set_up_and_shot_in_the_ROOMs_frame_not_the_worlds(world):
    """`renders_job` could regress to handing the bare bbox to `plan_cameras`
    and `setup`, and every camera and lighting test would stay green — they
    build their own frames. This is the one place the wiring is asserted.

    CAPTURED_ROOM is axis-aligned, so the frame's yaw is 0 and only its EXTENTS
    distinguish it: the room measures 4.1 × 3.1 over the wall bodies, while its
    bbox is that plus nothing — equal here — so the test pins the type and the
    measured half-extents rather than a rotation."""
    db = RecordingDb()
    scene = FakeScene()
    run(world, db, scene)

    frame = scene.setup_with[0]
    assert isinstance(frame, RoomFrame)
    assert frame.half_xy == pytest.approx((2.05, 1.55))
    assert frame.center_xy == pytest.approx((0.0, 0.0))
    # And the shots really came off that frame, not off the box.
    assert scene.rendered == [s.name for s in plan_cameras(frame)]


def test_the_completion_event_records_what_the_picture_is_of(world):
    class DetailedDb(RecordingDb):
        """RecordingDb keeps only (stage, event, status); this one keeps the
        detail too, which is where "what was rendered" is written."""

        def __init__(self):
            super().__init__()
            self.details: list[dict] = []

        def append_event(self, *args, **kwargs):
            self.details.append(args[8] if len(args) > 8 else kwargs.get("detail") or {})
            return super().append_event(*args, **kwargs)

    db = DetailedDb()
    run(world, db, FakeScene())
    detail = db.details[-1]
    assert detail["source"] == "parametric"
    assert detail["geometry"] == {"wall": 4, "floor": 1}
    assert detail["glbMerged"] is False
    assert detail["frames"] == 29


def test_every_registered_object_names_the_parametric_source(world):
    db = RecordingDb()
    run(world, db, FakeScene())
    assert {r["provenance"]["source"] for r in db.registered} == {"parametric"}
