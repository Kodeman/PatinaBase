"""`splat` job glue, with every world-touching seam faked.

No GPU, no network, no Postgres, no nerfstudio, no PIL: the downloads, the
image transcode, the two subprocess runs, the SPZ conversion and the R2 PUT are
all module-level names monkeypatched here. What is under test is the ORDER and
the LEDGER DISCIPLINE — which is the part that costs money to get wrong.

It carries the same golden cases as `verify` (test_golden_cases.py) plus the
two this stage adds: an R2 upload failure must fail the task with a clean,
redacted error, and a preempted run must resume from its checkpoint rather than
retrain from zero.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from scan_modal.core.spz import CompressedSplat
from scan_modal.io.db import LeaseRejected, StaleVersion
from scan_modal.jobs import splat_job

from test_verify_job import LEASE, LeaseRejectingDb, RecordingDb  # noqa: F401

#: The genuine `_run`, captured at import — before any fixture replaces the
#: module global with a fake. The subprocess-bound tests below need the real one.
REAL_RUN = splat_job._run

MANIFEST_URL = "https://example/sign/room-scans/manifests/u/r/photos_metadata.ndjson?token=t"
PHOTO_URLS = [
    "https://example/sign/room-scans/photos/u/r/hero.heic?token=t",
    "https://example/sign/room-scans/photos/u/r/auto_001.50.heic?token=t",
]
CAPTURED_URL = "https://example/sign/room-scans/captured_room/u/r/captured_room.json?token=t"


def manifest_line(name: str, order: int) -> str:
    return json.dumps({
        "relativePath": f"photos/{name}",
        "kind": "auto",
        "orderIndex": order,
        "timestampSeconds": float(order),
        "width": 1440,
        "height": 1920,
        "cameraTransform": [
            1.0, 0.0, 0.0, float(order),
            0.0, 1.0, 0.0, 1.5,
            0.0, 0.0, 1.0, 0.0,
            0.0, 0.0, 0.0, 1.0,
        ],
        "cameraIntrinsics": {"fx": 1500.0, "fy": 1500.0, "cx": 960.0, "cy": 720.0,
                             "width": 1920, "height": 1440},
    })


MANIFEST = "\n".join([manifest_line("hero.heic", 0), manifest_line("auto_001.50.heic", 1)])

CAPTURED_ROOM = {
    "walls": [
        {"identifier": "w1", "dimensions": [4.0, 2.5, 0.1],
         "transform": [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 1.25, -1.5, 1]},
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
        "inputs": {
            "photosManifestUrl": MANIFEST_URL,
            "photoUrls": list(PHOTO_URLS),
            "capturedRoomJsonUrl": CAPTURED_URL,
        },
    }
    p.update(overrides)
    return p


@pytest.fixture
def world(monkeypatch, tmp_path):
    """Every seam `splat_job` reaches the world through, faked and recorded."""

    class World:
        def __init__(self):
            self.fetched: list[str] = []
            self.frames: list[str] = []
            self.runs: list[list[str]] = []
            self.uploads: list[tuple] = []
            self.train_exit = 0
            self.export_exit = 0
            self.upload_error: Exception | None = None

    w = World()
    monkeypatch.setattr(splat_job, "CACHE_ROOT", tmp_path / "cache")

    def fake_fetch(url, timeout=None):
        w.fetched.append(url)
        if url == MANIFEST_URL:
            return MANIFEST.encode()
        if url == CAPTURED_URL:
            return json.dumps(CAPTURED_ROOM).encode()
        return b"heic-bytes"

    def fake_write_frame(data, dest):
        w.frames.append(dest.name)
        dest.write_bytes(b"jpeg")

    def fake_run(argv, timeout):
        w.runs.append(list(argv))
        if argv[0] == "ns-train":
            # nerfstudio's own output: a checkpoint dir and a config.
            paths = splat_job.workspace_paths("scan-1", 4, tmp_path / "cache")
            paths["checkpoints"].mkdir(parents=True, exist_ok=True)
            (paths["checkpoints"] / "step-000030000.ckpt").write_bytes(b"ckpt")
            paths["config"].write_text("method: splatfacto")
            return w.train_exit
        paths = splat_job.workspace_paths("scan-1", 4, tmp_path / "cache")
        paths["exports"].mkdir(parents=True, exist_ok=True)
        paths["ply"].write_bytes(b"ply")
        return w.export_exit

    def fake_compress(input_path, work_dir, *a, **k):
        target = Path(work_dir) / f"{k.get('stem', 'room')}.spz"
        target.write_bytes(b"spz")
        return CompressedSplat(path=target, mode="spz", file_name=target.name,
                               content_type="application/octet-stream",
                               mime="application/octet-stream", content_encoding=None)

    def fake_put_file(bucket, key, path, content_type, client=None, content_encoding=None):
        if w.upload_error is not None:
            raise w.upload_error
        w.uploads.append((bucket, key, str(path), content_type, content_encoding))
        return {"sha256": "abc123", "size_bytes": 3, "etag": "etag-1"}

    monkeypatch.setattr(splat_job, "_fetch", fake_fetch)
    monkeypatch.setattr(splat_job, "_write_frame", fake_write_frame)
    monkeypatch.setattr(splat_job, "_run", fake_run)
    monkeypatch.setattr(splat_job._spz, "compress_splat", fake_compress)
    monkeypatch.setattr(splat_job._r2, "put_file", fake_put_file)
    monkeypatch.setattr(splat_job._r2, "artifacts_bucket", lambda: "patina-staging-media-artifacts-us")
    return w


# ── the happy path ──────────────────────────────────────────────────────────


def test_success_registers_uploads_and_merges_the_artifact(world):
    db = RecordingDb()
    result = splat_job.run_splat(payload(), db=db)

    assert db.events[0] == ("splat", "started", "started")
    assert db.events[-1] == ("splat", "completed", "succeeded")

    # Register BEFORE the PUT: a crash between the two leaves a pending row,
    # not an unregistered object nobody will collect.
    assert len(db.registered) == 1
    assert db.registered[0]["object_key"] == "scan_artifacts/scan-1/v4/room.spz"
    assert db.registered[0]["access_class"] == "authenticated_project"
    assert db.registered[0]["scan_id"] == "scan-1"
    assert world.uploads[0][1] == "scan_artifacts/scan-1/v4/room.spz"
    assert db.marked == [("object-1", "stored",
                          {"sha256": "abc123", "etag": "etag-1", "size_bytes": 3})]

    room_file_id, verify, artifacts = db.room_files[0]
    assert room_file_id == "rf-1"
    assert verify is None, "splat must never touch the verify column"
    assert artifacts == {"splat": {"object_id": "object-1", "version": 4}}
    assert db.completed[0][0] == "task-1"
    assert result["artifacts"] == artifacts
    assert db.failed == []


def test_every_lease_gated_call_carries_the_lease_token(world):
    db = RecordingDb()
    splat_job.run_splat(payload(), db=db)
    assert set(db.leases) == {LEASE}


def test_the_workspace_is_written_from_the_manifest_and_the_photos(world, tmp_path):
    db = RecordingDb()
    splat_job.run_splat(payload(), db=db)

    paths = splat_job.workspace_paths("scan-1", 4, tmp_path / "cache")
    document = json.loads(paths["transforms"].read_text())
    assert [f["file_path"] for f in document["frames"]] == [
        "images/hero.jpg", "images/auto_001.50.jpg",
    ]
    # The HEIC names become the transcoded JPEG names, in manifest order.
    assert world.frames == ["hero.jpg", "auto_001.50.jpg"]


# ── the seed point cloud ────────────────────────────────────────────────────


def test_the_workspace_carries_a_seed_cloud_that_transforms_json_names(world, tmp_path):
    """W2's real run trained from random init because `transforms.json` carried
    no `ply_file_path` — the only key nerfstudio's Nerfstudio dataparser reads
    for a seed cloud, resolved relative to the dataset directory."""
    splat_job.run_splat(payload(), db=RecordingDb())

    paths = splat_job.workspace_paths("scan-1", 4, tmp_path / "cache")
    assert paths["seed_ply"].name == "sparse_pc.ply"
    assert paths["seed_ply"].parent == paths["transforms"].parent
    assert paths["seed_ply"].is_file()

    document = json.loads(paths["transforms"].read_text())
    assert document["ply_file_path"] == "sparse_pc.ply"
    header = paths["seed_ply"].read_bytes().split(b"end_header")[0]
    assert b"property float x" in header and b"property uchar red" in header


def test_the_training_run_asks_for_the_seed_cloud_explicitly(world):
    """splatfacto's own config already defaults this True, so the flag is an
    assertion — the value that decides whether the seed is read should be ours
    and visible, not a default in someone else's config that could move."""
    splat_job.run_splat(payload(), db=RecordingDb())
    train = world.runs[0]
    assert train[train.index("--load-3D-points") + 1] == "True"
    # After the dataparser subcommand, or tyro binds it to the trainer.
    assert train.index("--load-3D-points") > train.index("nerfstudio-data")


def test_how_the_optimiser_started_reaches_the_ledger(world):
    """A splat seeded off the parametric room and one that began from noise are
    the same artifact kind and are otherwise indistinguishable afterwards."""
    db = RecordingDb()
    result = splat_job.run_splat(payload(), db=db)
    assert result["provenance"]["seedPoints"] > 0
    assert db.registered[0]["provenance"]["seedPoints"] == result["provenance"]["seedPoints"]


def test_a_workspace_written_BEFORE_seeding_is_repaired_on_resume(world, tmp_path):
    """The resume path short-circuits the whole workspace build, so a seeding
    step folded into it would never run for exactly the runs that already cost
    the most — a preempted 60-minute L4 would resume unseeded forever."""
    paths = splat_job.workspace_paths("scan-1", 4, tmp_path / "cache")
    paths["images"].mkdir(parents=True, exist_ok=True)
    paths["transforms"].write_text(json.dumps({"camera_model": "PINHOLE", "frames": []}))
    assert not paths["seed_ply"].exists()

    splat_job.run_splat(payload(), db=RecordingDb())

    assert paths["seed_ply"].is_file()
    assert json.loads(paths["transforms"].read_text())["ply_file_path"] == "sparse_pc.ply"


def test_a_room_with_no_parametric_geometry_still_trains_unseeded(world, monkeypatch):
    """Unseeded is what every run did before this, and is strictly better than
    failing a scan whose photos are perfectly trainable."""
    def fetch_empty_room(url, timeout=None):
        if url == CAPTURED_URL:
            return json.dumps({"walls": []}).encode()
        if url == MANIFEST_URL:
            return MANIFEST.encode()
        return b"heic-bytes"

    monkeypatch.setattr(splat_job, "_fetch", fetch_empty_room)
    db = RecordingDb()
    result = splat_job.run_splat(payload(), db=db)

    assert db.completed
    assert result["provenance"]["seedPoints"] == 0
    paths = splat_job.workspace_paths("scan-1", 4)
    assert not paths["seed_ply"].exists()
    assert "ply_file_path" not in json.loads(paths["transforms"].read_text())


def test_photos_are_matched_to_poses_by_NAME_not_by_position(world):
    """A positional match would pair the wrong pixels with the wrong pose the
    moment one photo was missing from room_scan_images."""
    db = RecordingDb()
    reversed_urls = list(reversed(PHOTO_URLS))
    splat_job.run_splat(payload(inputs={
        "photosManifestUrl": MANIFEST_URL,
        "photoUrls": reversed_urls,
        "capturedRoomJsonUrl": CAPTURED_URL,
    }), db=db)
    # Frame order still follows the MANIFEST, not the URL list.
    assert world.frames == ["hero.jpg", "auto_001.50.jpg"]


def test_a_pose_with_no_matching_photo_is_dropped_and_counted(world):
    db = RecordingDb()
    splat_job.run_splat(payload(inputs={
        "photosManifestUrl": MANIFEST_URL,
        "photoUrls": [PHOTO_URLS[0]],
        "capturedRoomJsonUrl": CAPTURED_URL,
    }), db=db)
    assert world.frames == ["hero.jpg"]
    assert db.completed[0][1]["provenance"]["frames"] == 1
    assert db.completed[0][1]["provenance"]["photosMissing"] == 1


def test_no_photo_matches_any_pose_fails_the_task(world):
    db = RecordingDb()
    with pytest.raises(splat_job.InputError):
        splat_job.run_splat(payload(inputs={
            "photosManifestUrl": MANIFEST_URL,
            "photoUrls": ["https://example/sign/room-scans/photos/u/r/stranger.heic?token=t"],
            "capturedRoomJsonUrl": CAPTURED_URL,
        }), db=db)
    assert db.failed and db.completed == []


# ── the training command ────────────────────────────────────────────────────


def test_training_pins_the_timestamp_and_disables_pose_re_orientation(world):
    db = RecordingDb()
    splat_job.run_splat(payload(), db=db)
    train = world.runs[0]

    assert train[:2] == ["ns-train", "splatfacto"]
    # A `{now}` timestamp would put a resumed run in a NEW directory and the
    # checkpoint would never be found.
    assert "--timestamp" in train and train[train.index("--timestamp") + 1] == "patina"
    # core/transforms.py already applied gravity exactly; re-estimating it from
    # the mean camera up-vector would replace a measurement with a guess.
    assert train[train.index("--orientation-method") + 1] == "none"
    assert train[train.index("--center-method") + 1] == "none"
    assert train[train.index("--auto-scale-poses") + 1] == "False"
    assert "nerfstudio-data" in train


def test_a_fresh_run_does_not_pass_load_dir(world):
    db = RecordingDb()
    splat_job.run_splat(payload(), db=db)
    assert "--load-dir" not in world.runs[0]


def test_max_iterations_is_overridable_per_task(world):
    db = RecordingDb()
    splat_job.run_splat(payload(inputs={
        "photosManifestUrl": MANIFEST_URL,
        "photoUrls": list(PHOTO_URLS),
        "capturedRoomJsonUrl": CAPTURED_URL,
        "config": {"maxIterations": 7000},
    }), db=db)
    train = world.runs[0]
    assert train[train.index("--max-num-iterations") + 1] == "7000"


def test_the_export_reads_the_pinned_config(world):
    db = RecordingDb()
    splat_job.run_splat(payload(), db=db)
    export = world.runs[1]
    assert export[:2] == ["ns-export", "gaussian-splat"]
    assert export[export.index("--load-config") + 1].endswith("/config.yml")


# ── the room_scan_images pose-carrier fallback ──────────────────────────────


def photo_record(name: str, **overrides):
    base = {
        "fileName": name,
        "width": 1440,
        "height": 1920,
        "cameraTransform": [
            1.0, 0.0, 0.0, 0.0,
            0.0, 1.0, 0.0, 1.5,
            0.0, 0.0, 1.0, 0.0,
            0.0, 0.0, 0.0, 1.0,
        ],
        "cameraIntrinsics": {"fx": 1500.0, "fy": 1500.0, "cx": 960.0, "cy": 720.0,
                             "width": 1920, "height": 1440},
    }
    base.update(overrides)
    return base


ROWS_INPUTS = {
    "photosSource": "rows",
    "photoRecords": [photo_record("hero.heic"), photo_record("auto_001.50.heic")],
    "photoUrls": list(PHOTO_URLS),
    "capturedRoomJsonUrl": CAPTURED_URL,
}


def test_the_rows_carrier_trains_without_a_sidecar(world, tmp_path):
    """The sidecar is stripped as device-local for most real scans, so this is
    the path that decides whether splat runs at all for them."""
    db = RecordingDb()
    result = splat_job.run_splat(payload(inputs=dict(ROWS_INPUTS)), db=db)

    assert MANIFEST_URL not in world.fetched, "the rows path must not fetch a sidecar"
    assert world.frames == ["hero.jpg", "auto_001.50.jpg"]
    assert result["provenance"]["photosSource"] == "rows"
    assert result["artifacts"] == {"splat": {"object_id": "object-1", "version": 4}}
    assert db.failed == []

    document = json.loads(
        splat_job.workspace_paths("scan-1", 4, tmp_path / "cache")["transforms"].read_text()
    )
    assert [f["file_path"] for f in document["frames"]] == [
        "images/hero.jpg", "images/auto_001.50.jpg",
    ]


def test_the_manifest_carrier_is_recorded_as_such(world):
    db = RecordingDb()
    result = splat_job.run_splat(payload(), db=db)
    assert result["provenance"]["photosSource"] == "manifest"


def test_photos_source_reaches_the_completion_event(world):
    db = RecordingDb()
    splat_job.run_splat(payload(inputs=dict(ROWS_INPUTS)), db=db)
    # A splat trained off rows and one trained off the sidecar are otherwise
    # indistinguishable after the fact.
    assert db.completed[0][1]["provenance"]["photosSource"] == "rows"


def test_the_manifest_wins_when_both_carriers_arrive(world):
    """Defence in depth: the dispatcher sends exactly one, but if both showed up
    the uploaded sidecar is the authoritative record of the walk."""
    db = RecordingDb()
    both = dict(ROWS_INPUTS)
    both["photosManifestUrl"] = MANIFEST_URL
    result = splat_job.run_splat(payload(inputs=both), db=db)
    assert MANIFEST_URL in world.fetched
    assert result["provenance"]["photosSource"] == "manifest"


def test_neither_carrier_fails_the_task(world):
    db = RecordingDb()
    with pytest.raises(splat_job.InputError) as excinfo:
        splat_job.run_splat(payload(inputs={
            "photoUrls": list(PHOTO_URLS),
            "capturedRoomJsonUrl": CAPTURED_URL,
        }), db=db)
    assert "photoRecords" in str(excinfo.value)
    assert db.failed and db.completed == []


def test_a_malformed_photo_record_fails_the_task_rather_than_training_on_it(world):
    db = RecordingDb()
    bad = dict(ROWS_INPUTS)
    bad["photoRecords"] = [photo_record("hero.heic", cameraTransform=[1.0, 2.0])]
    with pytest.raises(Exception):
        splat_job.run_splat(payload(inputs=bad), db=db)
    assert db.completed == []
    assert db.failed


# ── preemption / resume ─────────────────────────────────────────────────────


def test_a_second_attempt_resumes_from_the_checkpoint_and_reuses_the_workspace(world):
    """The resumable pattern: the same job key, run twice. The second run must
    NOT re-download the photos and MUST hand nerfstudio --load-dir."""
    first = RecordingDb()
    splat_job.run_splat(payload(), db=first)
    downloads_after_first = len(world.fetched)
    frames_after_first = len(world.frames)

    second = RecordingDb()
    splat_job.run_splat(payload(), db=second)

    resumed = world.runs[2]
    assert "--load-dir" in resumed
    assert resumed[resumed.index("--load-dir") + 1].endswith("nerfstudio_models")
    # Photos were not fetched or transcoded again — only the captured room was
    # re-read (it is parsed for its own sake before the workspace check).
    assert len(world.frames) == frames_after_first
    assert len(world.fetched) == downloads_after_first + 1
    assert second.completed


def test_the_checkpoint_is_committed_before_the_export(world, monkeypatch):
    """An uncommitted Volume write is lost on preemption, so the last checkpoint
    has to be committed before the export — the next thing that can be
    interrupted."""
    order: list[str] = []
    faked_run = splat_job._run  # the fixture's fake, already installed

    def tracking_run(argv, timeout):
        order.append(argv[0])
        return faked_run(argv, timeout)

    monkeypatch.setattr(splat_job, "_run", tracking_run)
    db = RecordingDb()
    splat_job.run_splat(payload(), db=db, checkpoint_commit=lambda: order.append("commit"))

    assert order == ["ns-train", "commit", "ns-export"]


def test_a_training_failure_still_commits_the_checkpoint_it_reached(world):
    """The case the Volume exists for. A run killed mid-training — preemption,
    the training timeout, an operator stop — must leave its last checkpoint
    durable, or `retries` retries from zero and the resume path is decoration.
    """
    commits: list[int] = []
    world.train_exit = 1
    db = RecordingDb()

    with pytest.raises(RuntimeError):
        splat_job.run_splat(payload(), db=db, checkpoint_commit=lambda: commits.append(1))

    assert db.failed, "the failure is still reported"
    assert commits, "the checkpoint written before the failure was committed"


def test_the_job_runs_without_a_checkpoint_commit(world):
    """`checkpoint_commit` is the Modal Volume seam; a local/CLI run has none."""
    db = RecordingDb()
    assert splat_job.run_splat(payload(), db=db, checkpoint_commit=None)["stage"] == "splat"


def test_the_completion_records_how_many_times_the_volume_was_committed(world):
    db = RecordingDb()
    splat_job.run_splat(payload(), db=db, checkpoint_commit=lambda: None)
    assert db.registered[0]["provenance"]["checkpointCommits"] == 1


# ── the checkpoint watcher itself ───────────────────────────────────────────


def test_the_watcher_commits_once_per_new_checkpoint(tmp_path):
    commits: list[int] = []
    checkpoints = tmp_path / "nerfstudio_models"
    checkpoints.mkdir()
    committer = splat_job.CheckpointCommitter(checkpoints, lambda: commits.append(1))

    assert committer.poll() is False, "no checkpoint yet"

    (checkpoints / "step-000002000.ckpt").write_bytes(b"a")
    assert committer.poll() is True
    assert committer.poll() is False, "the same checkpoint must not commit twice"

    (checkpoints / "step-000004000.ckpt").write_bytes(b"bb")
    assert committer.poll() is True
    assert len(commits) == 2
    assert committer.commits == 2


def test_the_watcher_sees_a_checkpoint_rewritten_in_place(tmp_path):
    """nerfstudio rewrites the final checkpoint under the same name, and that is
    the most valuable write of the run — a name-only marker would miss it."""
    checkpoints = tmp_path / "nerfstudio_models"
    checkpoints.mkdir()
    ckpt = checkpoints / "step-000030000.ckpt"
    ckpt.write_bytes(b"a")
    commits: list[int] = []
    committer = splat_job.CheckpointCommitter(checkpoints, lambda: commits.append(1))
    assert committer.poll() is True

    ckpt.write_bytes(b"much longer contents")
    assert committer.poll() is True
    assert len(commits) == 2


def test_a_failing_commit_never_propagates_out_of_the_watcher(tmp_path):
    """This runs alongside a training process minutes from a usable result. A
    transient Volume error must not be what kills it — and the marker must NOT
    advance, so the next poll retries."""
    checkpoints = tmp_path / "nerfstudio_models"
    checkpoints.mkdir()
    (checkpoints / "step-000002000.ckpt").write_bytes(b"a")
    attempts: list[int] = []

    def flaky():
        attempts.append(1)
        if len(attempts) == 1:
            raise RuntimeError("volume unavailable")

    committer = splat_job.CheckpointCommitter(checkpoints, flaky)
    assert committer.poll() is False
    assert committer.poll() is True
    assert committer.commits == 1


def test_the_marker_is_none_when_the_directory_does_not_exist(tmp_path):
    assert splat_job.checkpoint_marker(tmp_path / "missing") is None


def test_the_marker_ignores_non_checkpoint_files(tmp_path):
    checkpoints = tmp_path / "nerfstudio_models"
    checkpoints.mkdir()
    (checkpoints / "events.out.tfevents").write_bytes(b"x")
    assert splat_job.checkpoint_marker(checkpoints) is None


def test_the_workspace_is_keyed_on_the_room_file_version():
    """A newer room file is a different room; it must not inherit the older
    version's half-trained checkpoint."""
    v4 = splat_job.workspace_paths("scan-1", 4)
    v5 = splat_job.workspace_paths("scan-1", 5)
    assert v4["base"] != v5["base"]
    assert str(v4["base"]).endswith("scan-1/v4")


def test_the_run_directory_matches_nerfstudios_own_four_level_layout():
    """nerfstudio writes to `<output-dir>/<experiment>/<method>/<timestamp>`.

    Asserted as LITERAL segments derived from the argv, not from
    `workspace_paths` itself — a self-consistent expectation is what let the
    collapsed three-level path ship: every other test builds its fixture
    directories from the same helper it is checking, so both sides moved
    together and `ns-export --load-config` pointed at a directory nerfstudio
    never creates. A live staging run logged
    `<base>/output/splatfacto/splatfacto/patina`.
    """
    paths = splat_job.workspace_paths("scan-1", 4)
    argv = splat_job.train_argv(paths, 30000, resume=False)
    output_dir = argv[argv.index("--output-dir") + 1]
    experiment = argv[argv.index("--experiment-name") + 1]
    timestamp = argv[argv.index("--timestamp") + 1]
    method = argv[1]

    expected = f"{output_dir}/{experiment}/{method}/{timestamp}"
    assert str(paths["run"]) == expected
    assert str(paths["config"]) == f"{expected}/config.yml"
    assert str(paths["checkpoints"]) == f"{expected}/nerfstudio_models"
    # Four levels below the output dir, not three.
    assert paths["run"].relative_to(paths["output"]).parts == (experiment, method, timestamp)


def test_the_object_key_carries_scan_and_room_file_version():
    assert splat_job.splat_object_key("s1", 7) == "scan_artifacts/s1/v7/room.spz"


# ── failure paths ───────────────────────────────────────────────────────────


def test_a_failed_training_run_fails_the_task(world):
    world.train_exit = 1
    db = RecordingDb()
    with pytest.raises(RuntimeError):
        splat_job.run_splat(payload(), db=db)
    assert db.completed == []
    assert db.room_files == []
    assert "ns-train" in db.failed[0][1]
    assert db.events[-1] == ("splat", "failed", "failed")


def test_a_failed_export_fails_the_task(world):
    world.export_exit = 2
    db = RecordingDb()
    with pytest.raises(RuntimeError):
        splat_job.run_splat(payload(), db=db)
    assert db.completed == []
    assert "ns-export" in db.failed[0][1]


def test_an_r2_upload_failure_fails_the_task_with_a_clean_error(world):
    """The golden case this stage adds. The registry row is already `pending`;
    the task must fail, the artifact must NOT be merged, and the persisted error
    must carry no signed URL."""
    world.upload_error = RuntimeError(
        "PUT https://acct.r2.cloudflarestorage.com/bucket/scan_artifacts/scan-1/"
        "v4/room.spz?X-Amz-Signature=DEADBEEFSECRET failed"
    )
    db = RecordingDb()
    with pytest.raises(RuntimeError):
        splat_job.run_splat(payload(), db=db)

    assert db.registered, "the row is registered before the PUT, so it exists"
    assert db.marked == [], "nothing may be marked stored when nothing was stored"
    assert db.room_files == [], "no artifact ref may point at bytes that are not there"
    assert db.completed == []

    persisted = db.failed[0][1]
    assert "DEADBEEFSECRET" not in persisted
    assert "https://" not in persisted
    assert "X-Amz-Signature" not in persisted
    assert "[url]" in persisted


def test_missing_inputs_fail_the_task_rather_than_leaving_it_claimed(world):
    db = RecordingDb()
    with pytest.raises(splat_job.InputError):
        splat_job.run_splat(payload(inputs={}), db=db)
    assert db.completed == []
    assert db.failed[0][0] == "task-1"
    assert "InputError" in db.failed[0][1]


def test_missing_task_id_is_rejected_before_any_ledger_write(world):
    db = RecordingDb()
    with pytest.raises(splat_job.InputError):
        splat_job.run_splat(payload(taskId=None), db=db)
    assert db.events == [] and db.failed == []


def test_missing_lease_token_is_rejected_before_any_ledger_write(world):
    db = RecordingDb()
    with pytest.raises(splat_job.InputError):
        splat_job.run_splat(payload(leaseToken=None), db=db)
    assert db.events == [] and db.failed == []


def test_a_download_failure_redacts_the_signed_url(world, monkeypatch):
    import httpx

    signed = ("https://proj.supabase.co/storage/v1/object/sign/room-scans/"
              "photos/u1/r1/hero.heic?token=eyJhbGciOiJIUzI1NiJ9.SUPERSECRET")

    def boom(url, timeout=None):
        request = httpx.Request("GET", signed)
        raise httpx.HTTPStatusError(
            f"Client error '403 Forbidden' for url '{signed}'",
            request=request, response=httpx.Response(403, request=request),
        )

    monkeypatch.setattr(splat_job, "_fetch", boom)
    db = RecordingDb()
    with pytest.raises(httpx.HTTPStatusError):
        splat_job.run_splat(payload(), db=db)

    persisted = db.failed[0][1]
    assert "SUPERSECRET" not in persisted
    assert "https://" not in persisted
    assert "403" in persisted


# ── the REAL subprocess bound ───────────────────────────────────────────────
#
# `_run` is the one seam these tests must NOT fake, because the bug it carried
# was in the seam itself: an earlier version drained stdout with
# `for line in proc.stdout:` on the calling thread and only then called
# `proc.wait(timeout=...)`. The loop ends when the pipe closes at process exit,
# so `wait` always saw a dead process and the timeout was dead code. A wedged
# `ns-train` would have held an L4 with no bound of its own until Modal's
# function timeout — an hour of GPU for a job that stopped progressing in the
# first minute. Only a real, genuinely long-running child proves the fix.


def test_a_hung_subprocess_is_killed_at_its_deadline_and_raises():
    import subprocess
    import sys
    import time

    started = time.monotonic()
    with pytest.raises(TimeoutError) as excinfo:
        splat_job._run([sys.executable, "-c", "import time; time.sleep(60)"], timeout=1.5)
    elapsed = time.monotonic() - started

    # It returned at the deadline, not at the child's own 60 s.
    assert elapsed < 20.0, f"_run did not bound the child (took {elapsed:.1f}s)"
    assert "budget" in str(excinfo.value)
    # The message names the binary and the budget, never the full argv — the
    # text is persisted to agent_tasks.last_error.
    assert "time.sleep" not in str(excinfo.value)
    # And nothing is left running: a survivor would keep the GPU busy.
    assert subprocess.run(
        [sys.executable, "-c", "pass"], capture_output=True
    ).returncode == 0


def test_a_normal_subprocess_still_streams_its_output_and_returns_its_code(capfd):
    import sys

    code = splat_job._run(
        [sys.executable, "-c", "print('hello from ns-train'); raise SystemExit(0)"],
        timeout=30.0,
    )
    assert code == 0
    assert "hello from ns-train" in capfd.readouterr().out


def test_a_failing_subprocess_returns_its_non_zero_code(capfd):
    import sys

    assert splat_job._run([sys.executable, "-c", "raise SystemExit(3)"], timeout=30.0) == 3


def test_a_hung_training_run_fails_the_task_with_a_clean_error(world, monkeypatch):
    """The timeout, seen from the job: a killed child is an ordinary failure —
    the task is failed and released, not left claimed. `ns-train` runs for real
    here (as a sleeping child); everything else stays faked."""
    import sys

    faked_run = splat_job._run  # the `world` fixture's fake, already installed

    def run_or_hang(argv, timeout):
        if argv[0] == "ns-train":
            # REAL_RUN, not splat_job._run — the fixture has already replaced
            # that name, so reading it here would just call the fake again.
            return REAL_RUN([sys.executable, "-c", "import time; time.sleep(60)"], timeout=1.0)
        return faked_run(argv, timeout)

    monkeypatch.setattr(splat_job, "_run", run_or_hang)

    db = RecordingDb()
    with pytest.raises(TimeoutError):
        splat_job.run_splat(payload(), db=db)

    assert db.completed == []
    assert db.room_files == []
    assert "TimeoutError" in db.failed[0][1]
    assert db.events[-1] == ("splat", "failed", "failed")


# ── the golden lease / version cases ────────────────────────────────────────


@pytest.mark.parametrize("reject_on", ["append_event", "update_room_file", "complete_task"])
def test_lease_rejection_exits_clean_and_never_fails_the_task(world, capsys, reject_on):
    db = LeaseRejectingDb(reject_on)
    result = splat_job.run_splat(payload(), db=db)

    assert result == {"skipped": "lease_rejected"}
    assert db.failed == [], "a stale invocation must never fail a live task"
    assert db.completed == []
    line = json.loads(capsys.readouterr().out.strip().splitlines()[-1])
    assert line["event"] == "lease_rejected"
    assert line["fn"] == "scan-modal-splat"


def test_a_superseded_room_file_exits_clean_without_failing_the_task(world, capsys):
    """00492's P0404: a newer room file landed while this ran. Obsolete, not
    broken — requeueing would buy another 25 minutes of L4 for the same
    obsolete answer."""

    class StaleDb(RecordingDb):
        def update_room_file(self, *a, **k):
            raise StaleVersion("scan_worker_update_room_file refused: superseded")

    db = StaleDb()
    result = splat_job.run_splat(payload(), db=db)

    assert result == {"skipped": "stale_version"}
    assert db.failed == []
    assert db.completed == []
    assert db.room_files == []
    line = json.loads(capsys.readouterr().out.strip().splitlines()[-1])
    assert line["event"] == "stale_version"


def test_duplicate_delivery_is_refused_at_the_first_ledger_write(world, capsys):
    """Modal's own retry semantics, or a duplicate dispatch. Once the task is
    terminal every RPC is refused, so the second invocation writes nothing."""

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
    splat_job.run_splat(payload(), db=db)
    second = splat_job.run_splat(payload(), db=db)

    assert second == {"skipped": "lease_rejected"}
    assert len(db.completed) == 1
    assert len(db.room_files) == 1
    assert db.failed == []
