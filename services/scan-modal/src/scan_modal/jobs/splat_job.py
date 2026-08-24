"""`splat` job glue — ARKit posed photos → splatfacto → `.ply` → compressed → R2.

Ledger discipline is `verify_job`'s, verbatim in shape: lease-gated `started`
event first, `LeaseRejected`/`StaleVersion` exit clean and write nothing, and a
`finally` releases the task on any other non-completion. The shared parts live
in `jobs/_common.py`.

WHAT MAKES THIS STAGE DIFFERENT FROM verify
───────────────────────────────────────────
1. It runs 10–25 minutes on a PREEMPTIBLE L4, so it must survive being killed
   mid-run. The workspace lives on a `modal.Volume` under a JOB KEY —
   `{scanId}/v{roomFileVersion}` — and a restart that finds a nerfstudio
   checkpoint there resumes from it instead of starting over. The job key
   carries the room-file version deliberately: a NEWER version is a different
   room and must not inherit the older one's half-trained checkpoint.
2. It PRODUCES an artifact, so it also writes the 00489 registry: register the
   key (`pending`) → PUT the bytes → `mark_media_object_state('stored')` with
   the sha256 that was actually uploaded. Registering after the PUT would leave
   an orphan object with no row if the process died between the two.
3. Photos are matched to manifest poses by FILE NAME, never by list position.
   The dispatcher caps the URL list (see contract.json), and a positional match
   would silently pair frame 40's pixels with frame 0's pose the moment one
   photo was missing from `room_scan_images`.
4. It SEEDS its own initialisation. splatfacto asks its dataparser for an
   initial point cloud (`load_3D_points=True` in nerfstudio's own splatfacto
   config) and, finding none, starts from a cube of random points — which is
   what W2's real run did. This stage already downloads `captured_room.json`,
   so `core/seed_points` surface-samples the parametric room into a PLY beside
   `transforms.json` and names it there as `ply_file_path`, the key nerfstudio's
   Nerfstudio dataparser reads. See `_ensure_seed_points`.
5. Poses arrive by one of TWO carriers. `inputs.photosManifestUrl` is the
   uploaded `photos/photos_metadata.ndjson` sidecar; `inputs.photoRecords` is
   the dispatcher's inline fallback, read from `room_scan_images`' own
   `camera_transform`/`camera_intrinsics` columns for the many scans whose
   sidecar was never uploaded. Same geometry, same conventions — see
   `core.transforms.parse_photo_rows`. Which one fired is recorded on the
   artifact as `photosSource`.
"""

from __future__ import annotations

import json as _json
import time
from contextlib import contextmanager
from pathlib import Path
from typing import Any, Callable, Sequence

from .. import SPLAT_CACHE_MOUNT
from ..core import spz as _spz
from ..core.captured_room import parse_captured_room_meters
from ..core.checkpoints import (
    CHECKPOINT_GLOB,
    EVAL_LPIPS_TAGS,
    EVAL_PSNR_TAGS,
    CheckpointChoice,
    checkpoint_steps,
    select_checkpoint,
    with_load_step,
)
from ..core.parametric_scene import build_scene_spec
from ..core.seed_points import SEED_PLY_NAME, build_seed_ply
from ..core.transforms import (
    build_transforms,
    frame_file_name,
    parse_photo_rows,
    parse_photos_manifest,
)
from ..core import colmap_model as _colmap_model
from ..io import r2 as _r2
from ..io.db import LeaseRejected, ScanWorkerDb, StaleVersion
from . import _common
from . import colmap_refine as _colmap_refine

__all__ = ["STAGE", "ARTIFACT_KIND", "InputError", "run_splat", "splat_object_key",
           "train_argv", "export_argv", "workspace_paths", "checkpoint_marker",
           "CheckpointCommitter", "ensure_seed_points", "default_max_iterations",
           "read_eval_metrics", "choose_export_config", "colmap_frames_from_transforms",
           "apply_pose_refine", "COLMAP_TIMEOUT_S"]

STAGE = "splat"
ARTIFACT_KIND = "splat"
ACCESS_CLASS = "authenticated_project"

#: Where a preemptible run keeps its state. This is the mount point `app.py`
#: attaches the `modal.Volume` at — shared from the package root so the mount
#: and the workspace cannot drift apart and orphan every checkpoint.
CACHE_ROOT = Path(SPLAT_CACHE_MOUNT)
#: nerfstudio derives its output path from experiment name + method + timestamp.
#: Pinning the timestamp is what makes the checkpoint directory PREDICTABLE
#: across restarts — with the default (`{now}`), a resumed run writes to a new
#: directory and the previous checkpoint is never found.
RUN_TIMESTAMP = "patina"
METHOD = "splatfacto"
#: What `--experiment-name` is passed as. Its own level in nerfstudio's output
#: tree, above the method — see `workspace_paths`.
EXPERIMENT_NAME = METHOD
#: splatfacto's own default, and the right budget only for a densely-covered
#: room. See `default_max_iterations` for why it is no longer the default here.
DEFAULT_MAX_ITERATIONS = 30000
#: The budget for a sparsely-covered room. MEASURED, not chosen: on this
#: fixture's 42 views the seeded run's held-out PSNR peaked at 16.36 dB by step
#: 4 000, held a plateau to ~18 000, then fell to 13.54 by 29 000 — the stored
#: artifact was worse than one from a third of the compute (W2-EVIDENCE.md
#: §13.6). 12 000 sits past the plateau's start with room for a room that
#: converges later, and stops well before the decline.
SPARSE_VIEW_MAX_ITERATIONS = 12000
#: Above this many training frames the sparse-view budget stops applying. 42
#: views is what was measured; 60 is the nearest round number above it that
#: still reads as "sparse for splatting", and no run above it has been measured
#: — a scan with 80 (the dispatcher's cap) keeps splatfacto's own 30 000 until
#: someone measures otherwise.
SPARSE_VIEW_FRAME_THRESHOLD = 60
#: Save often enough that a preemption costs minutes, not the whole run.
STEPS_PER_SAVE = 2000
#: Wall-clock ceilings, well inside the function's own SPLAT_TIMEOUT_SECONDS.
#:
#: 3000 s (50 min) was under the measured cost of the iteration budget it is
#: paired with: 30,000 iterations of splatfacto on 42 frames at 1440×1920 is
#: ~55 minutes on an L4, because per-iteration cost more than doubles across
#: densification (48.8 ms/iter at step 4,550; 119.2 ms/iter at step 7,470 —
#: W2-EVIDENCE.md §4 C). A run that trained correctly would still have been
#: killed at 50 minutes, every time. 4800 s is the measured ~55 min plus slack
#: and remains a real bound on a wedged run.
TRAIN_TIMEOUT_S = 4800.0
EXPORT_TIMEOUT_S = 600.0
#: Ceiling for the whole COLMAP pose-prior pre-step (feature extraction +
#: matching + triangulation, CPU SIFT). ~42 frames is minutes; 1800 s is a hard
#: bound on a wedged phase. Well inside SPLAT_TIMEOUT_SECONDS with the training
#: budget it precedes. Only consumed when `config.poseRefine == "colmap"`.
COLMAP_TIMEOUT_S = 1800.0
#: How often the checkpoint watcher looks for a new checkpoint to commit.
CHECKPOINT_POLL_S = 60.0

# Module-level seam — tests monkeypatch this by name, and the job calls it
# through the module global so the substitution takes.
_fetch = _common.fetch


class InputError(ValueError):
    """The dispatch payload is missing an input this stage cannot proceed without."""


# ── pure helpers ────────────────────────────────────────────────────────────


def splat_object_key(scan_id: str, room_file_version: Any, file_name: str = "room.spz") -> str:
    """The artifact key. `file_name` carries the compression mode's own suffix —
    `room.spz` normally, `room.ply.gz` under `SPZ_MODE=gzip-ply` — because a
    `.spz` key holding gzipped PLY bytes would be a lie told to every reader."""
    return f"scan_artifacts/{scan_id}/v{room_file_version}/{file_name}"


def workspace_paths(scan_id: str, room_file_version: Any, root: Path | None = None) -> dict[str, Path]:
    """The job-keyed workspace. Every path a restart needs to find again.

    `root` defaults to the module global at CALL time, not at def time, so the
    mount point stays overridable (tests point it at a tmp dir).
    """
    base = (root or CACHE_ROOT) / str(scan_id) / f"v{room_file_version}"
    # nerfstudio's run directory is FOUR segments, not three:
    #
    #     <output-dir> / <experiment-name> / <method-name> / <timestamp>
    #
    # `--experiment-name` and the method are separate levels even when they hold
    # the same word, and this stage passes `splatfacto` for both. Modelling it as
    # three collapsed them into one and pointed `config`/`checkpoints` at a
    # directory nerfstudio never writes — so `ns-export --load-config` would fail
    # on a path that does not exist, and `resume` could never find a checkpoint,
    # silently defeating the preemption Volume it is all built around.
    #
    # Verified against a live staging run (2026-08-18), which logged:
    #     logging events to: <base>/output/splatfacto/splatfacto/patina
    run = base / "output" / EXPERIMENT_NAME / METHOD / RUN_TIMESTAMP
    return {
        "base": base,
        "images": base / "images",
        "transforms": base / "transforms.json",
        "output": base / "output",
        "run": run,
        "checkpoints": run / "nerfstudio_models",
        "config": run / "config.yml",
        "exports": base / "exports",
        "ply": base / "exports" / "splat.ply",
        "spz": base / "room.spz",
        # Beside transforms.json, because nerfstudio resolves `ply_file_path`
        # relative to the dataset directory — which is `--data`, i.e. `base`.
        "seed_ply": base / SEED_PLY_NAME,
    }


def train_argv(paths: dict[str, Path], max_iterations: int, resume: bool) -> list[str]:
    """`ns-train splatfacto` over a COLMAP-free `transforms.json`.

    The three dataparser flags are what keep the reconstruction in ARKit metres
    with gravity already applied — `core/transforms.py` did the orientation
    exactly, so letting nerfstudio re-estimate it from the mean camera up-vector
    would replace a measurement with a guess.
    """
    argv = [
        "ns-train", METHOD,
        "--data", str(paths["base"]),
        "--output-dir", str(paths["base"] / "output"),
        "--experiment-name", EXPERIMENT_NAME,
        "--timestamp", RUN_TIMESTAMP,
        "--max-num-iterations", str(int(max_iterations)),
        "--steps-per-save", str(STEPS_PER_SAVE),
        # `TrainerConfig.save_only_latest_checkpoint` defaults to True, and
        # `Trainer.save_checkpoint` unlinks every other `.ckpt` the moment it
        # writes a new one. That makes "export from the best checkpoint"
        # impossible by construction: by the time training ends, the best one
        # has already been deleted. Keeping them costs Volume space (six or
        # seven files at STEPS_PER_SAVE) and buys the whole of §13.6's finding.
        "--save-only-latest-checkpoint", "False",
        "--viewer.quit-on-train-completion", "True",
        "--vis", "tensorboard",
    ]
    if resume:
        argv += ["--load-dir", str(paths["checkpoints"])]
    argv += [
        "nerfstudio-data",
        "--orientation-method", "none",
        "--center-method", "none",
        "--auto-scale-poses", "False",
        # splatfacto's own method config already sets this True, so it is an
        # assertion rather than a change: the seed cloud is now the point, and
        # the value that decides whether it is read must be ours and visible in
        # the argv, not a default in someone else's config that could move.
        # The spelling is nerfstudio's, capital `3D` and an explicit `True` —
        # its CLI is built with tyro's `FlagConversionOff`, so booleans take a
        # value and there is no `--no-` form.
        "--load-3D-points", "True",
    ]
    return argv


def default_max_iterations(frame_count: int) -> int:
    """The iteration budget for a room with this many training views.

    §13.6 measured 42 views of an 8.8 × 8.2 m room peaking at step 4 000 and
    declining past ~18 000, so splatfacto's own 30 000 is roughly twice too many
    for a sparse capture — it costs 45 extra minutes of L4 to arrive at a worse
    artifact. A denser capture has not been measured and keeps the stock budget.
    """
    if frame_count <= SPARSE_VIEW_FRAME_THRESHOLD:
        return SPARSE_VIEW_MAX_ITERATIONS
    return DEFAULT_MAX_ITERATIONS


def export_argv(paths: dict[str, Path], config_path: Path | None = None) -> list[str]:
    """`ns-export gaussian-splat`, optionally pointed at a pinned config copy.

    The exporter has no checkpoint flag of its own — `eval_setup` reads whatever
    `--load-config` names and only honours a non-null `load_step` from inside
    it. See `core/checkpoints.py`.
    """
    return [
        "ns-export", "gaussian-splat",
        "--load-config", str(config_path or paths["config"]),
        "--output-dir", str(paths["exports"]),
    ]


def read_eval_metrics(run_dir: Path) -> tuple[list[tuple[int, float]], list[tuple[int, float]]]:
    """Held-out LPIPS and PSNR per step, from the run's tensorboard event file.

    Returns `([], [])` — never raises — when there is nothing readable. Every
    failure here (no event file, an unreadable one, tensorboard absent) has the
    same correct consequence: export the final checkpoint, which is what this
    stage did before either metric existed. Losing a quality improvement must
    not lose the artifact.

    Both scalars are read from one `EventAccumulator.Reload()` — they come off
    the same `writer.put_dict` call in nerfstudio (see `core/checkpoints.py`),
    so there is no reason to reload the event file twice.
    """
    try:
        from tensorboard.backend.event_processing.event_accumulator import EventAccumulator
    except ImportError:  # pragma: no cover - image-only dependency
        _common.log_skip(STAGE, "eval_metrics_unavailable", reason="tensorboard_missing")
        return [], []

    try:
        if not any(run_dir.glob("events.out.tfevents.*")):
            _common.log_skip(STAGE, "eval_metrics_unavailable", reason="no_event_file")
            return [], []
        # 0 = keep every scalar. The default (1 000) subsamples by reservoir,
        # which would silently drop the peak this whole mechanism looks for.
        accumulator = EventAccumulator(str(run_dir), size_guidance={"scalars": 0})
        accumulator.Reload()
        tags = set(accumulator.Tags().get("scalars", []))

        def _series(candidates: tuple[str, ...]) -> list[tuple[int, float]]:
            for tag in candidates:
                if tag in tags:
                    return [(int(e.step), float(e.value)) for e in accumulator.Scalars(tag)]
            return []

        lpips_pairs = _series(EVAL_LPIPS_TAGS)
        psnr_pairs = _series(EVAL_PSNR_TAGS)
        if not lpips_pairs and not psnr_pairs:
            _common.log_skip(STAGE, "eval_metrics_unavailable", reason="no_metric_tags")
        return lpips_pairs, psnr_pairs
    except Exception as exc:  # noqa: BLE001 - see docstring
        _common.log_skip(STAGE, "eval_metrics_unavailable", error=type(exc).__name__)
        return [], []


def choose_export_config(paths: dict[str, Path]) -> tuple[Path, CheckpointChoice | None]:
    """Decide which checkpoint to export from, and return the config to use.

    Writes a SIBLING config (`config-best.yml`) rather than editing the one
    nerfstudio wrote: the original is what a resumed run and any later manual
    `ns-export` read, and a stage that mutates another program's state file
    leaves a workspace that behaves differently the second time it is used.
    """
    checkpoints = paths["checkpoints"]
    steps = checkpoint_steps(p.name for p in checkpoints.glob(CHECKPOINT_GLOB)) \
        if checkpoints.is_dir() else []
    lpips_pairs, psnr_pairs = read_eval_metrics(paths["run"])
    choice = select_checkpoint(lpips_pairs, psnr_pairs, steps)
    if choice is None or not steps or choice.step == steps[-1]:
        # Nothing to pin: either there are no checkpoints to choose between, or
        # the best one is already the one `eval_setup`'s max-step glob will find.
        return paths["config"], choice

    try:
        pinned_text = with_load_step(paths["config"].read_text(), choice.step)
    except (OSError, ValueError) as exc:
        _common.log_skip(STAGE, "checkpoint_pin_failed", error=type(exc).__name__)
        return paths["config"], CheckpointChoice(
            step=steps[-1], lpips=None, psnr=None, reason="latest_config_unpinnable",
            considered=choice.considered,
        )

    pinned = paths["run"] / "config-best.yml"
    pinned.write_text(pinned_text)
    return pinned, choice


def checkpoint_marker(checkpoint_dir: Path) -> tuple[str, int, int] | None:
    """Identify the newest checkpoint on disk, or None if there is none yet.

    Identity is (name, mtime_ns, size) rather than name alone: nerfstudio
    rewrites `step-000030000.ckpt` in place on the final save, so a name-only
    marker would miss the last write of the run — the one that matters most.
    """
    if not checkpoint_dir.is_dir():
        return None
    newest: tuple[str, int, int] | None = None
    newest_mtime = -1
    for path in checkpoint_dir.glob("*.ckpt"):
        try:
            stat = path.stat()
        except OSError:  # a checkpoint being written and renamed under us
            continue
        if stat.st_mtime_ns > newest_mtime:
            newest_mtime = stat.st_mtime_ns
            newest = (path.name, stat.st_mtime_ns, stat.st_size)
    return newest


class CheckpointCommitter:
    """Commits the Modal Volume each time a new checkpoint lands.

    An uncommitted Volume write does not survive the container, so committing
    only after `ns-train` returns 0 means a preempted, timed-out or operator-
    stopped run loses everything — precisely the case the Volume exists for.
    Observed in W2: run 2 found no workspace from run 1 and re-downloaded and
    re-transcoded all 42 photos, and `modal.Retries` therefore retried from
    zero rather than from a checkpoint (W2-EVIDENCE.md §4 D).

    Polling for a new checkpoint file, rather than committing on a timer, is
    what makes this crash-safe AND cheap: a commit of an unchanged Volume is
    wasted IO, and a commit DURING a checkpoint write would persist a truncated
    file. nerfstudio writes each checkpoint to its final name in one go and
    only every `STEPS_PER_SAVE` steps, so a marker that has stopped changing
    between two polls a minute apart is a checkpoint that has landed.

    `poll()` is the whole decision and is synchronous, so the behaviour is
    testable without a thread. `run_until(stop)` is the thin thread body.
    """

    def __init__(
        self,
        checkpoint_dir: Path,
        commit: Callable[[], None],
        poll_interval: float = CHECKPOINT_POLL_S,
    ):
        self._dir = checkpoint_dir
        self._commit = commit
        self._interval = poll_interval
        self._seen: tuple[str, int, int] | None = None
        self.commits = 0

    def poll(self) -> bool:
        """Commit iff a new checkpoint has appeared since the last commit.

        A failing commit is logged and swallowed. This runs alongside a training
        process that is minutes from a usable result; a transient Volume error
        must never be the thing that kills it, and the next poll retries anyway.
        """
        marker = checkpoint_marker(self._dir)
        if marker is None or marker == self._seen:
            return False
        try:
            self._commit()
        except Exception as exc:  # noqa: BLE001 - see docstring
            _common.log_skip(STAGE, "checkpoint_commit_failed", error=type(exc).__name__)
            return False
        self._seen = marker
        self.commits += 1
        return True

    def run_until(self, stop: Any) -> None:
        """Poll until `stop` (a threading.Event) is set, then poll once more."""
        while not stop.wait(self._interval):
            self.poll()
        # The last checkpoint can land in the final seconds of training, after
        # the last interval poll and before the stop. Without this, the most
        # valuable checkpoint of the run is the one that is never committed.
        self.poll()


def _url_basename(url: str) -> str:
    """The file name a presigned URL points at, signature stripped."""
    path = url.split("?", 1)[0]
    return path.rsplit("/", 1)[-1]


def index_photo_urls(photo_urls: Sequence[str]) -> dict[str, str]:
    return {_url_basename(u): u for u in photo_urls if isinstance(u, str) and u}


# ── world-touching seams ────────────────────────────────────────────────────


def _write_frame(data: bytes, dest: Path) -> None:
    """Transcode one captured photo to the JPEG nerfstudio will read.

    The bundle is HEIC (`PosedPhotoService` writes `image/heic`, with a JPEG
    fallback that KEEPS the .heic name), and PIL reads neither without
    `pillow-heif` registered. Registering the opener unconditionally means the
    mislabelled-JPEG case decodes through the same path.
    """
    from io import BytesIO

    from PIL import Image

    try:
        import pillow_heif

        pillow_heif.register_heif_opener()
    except ImportError:  # pragma: no cover - image-only dependency
        pass

    with Image.open(BytesIO(data)) as image:
        image.convert("RGB").save(dest, format="JPEG", quality=92)


def _run(argv: Sequence[str], timeout: float) -> int:
    """Run a bounded subprocess, streaming its stdout to the Modal log.

    Streamed rather than captured: a 25-minute training run that only printed
    on exit would look hung for 25 minutes, and a preemption would lose the log
    entirely. Nothing here echoes a URL — argv is workspace paths only.

    The DRAIN RUNS ON A THREAD, and that is the whole point of the shape. An
    earlier version read `for line in proc.stdout:` on this thread and then
    called `proc.wait(timeout=...)`: the loop only ends when the pipe closes at
    process exit, so `wait` was always called on an already-dead process and the
    timeout was dead code. A wedged `ns-train` would have held an L4 open with
    no bound of its own until Modal's function timeout — an hour of GPU for a
    job that stopped making progress in the first minute.

    Now the timeout is real: the reader thread is a daemon, `wait` does the
    bounding, and expiry kills the process and raises.
    """
    import subprocess
    import threading

    proc = subprocess.Popen(
        list(argv), stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, bufsize=1
    )

    def drain() -> None:
        assert proc.stdout is not None
        for line in proc.stdout:
            print(line.rstrip())

    reader = threading.Thread(target=drain, daemon=True)
    reader.start()
    try:
        code = proc.wait(timeout=timeout)
    except subprocess.TimeoutExpired:
        proc.kill()
        proc.wait()
        # `from None`: TimeoutExpired stringifies the whole argv, and this text
        # is persisted to agent_tasks.last_error.
        raise TimeoutError(
            f"{argv[0]} exceeded its {timeout:.0f}s budget and was killed"
        ) from None
    finally:
        # Bounded: the drain is a daemon, so a reader wedged on a pipe a killed
        # child left open must never hold the job.
        reader.join(timeout=5.0)
        if proc.stdout is not None:
            proc.stdout.close()
    return code


@contextmanager
def _checkpoint_watch(
    checkpoint_dir: Path,
    commit: Callable[[], None] | None,
    poll_interval: float = CHECKPOINT_POLL_S,
):
    """Run a `CheckpointCommitter` on a daemon thread for the duration of a block.

    Yields the committer either way — with no `commit` seam (tests, and any
    non-Modal runtime) it simply never fires, so the caller has no branch.
    """
    committer = CheckpointCommitter(checkpoint_dir, commit or (lambda: None), poll_interval)
    if commit is None:
        yield committer
        return

    import threading

    stop = threading.Event()
    thread = threading.Thread(target=committer.run_until, args=(stop,), daemon=True)
    thread.start()
    try:
        yield committer
    finally:
        stop.set()
        # Bounded: the final poll is one Volume commit. A watcher that outlived
        # its join is a daemon and cannot hold the container open.
        thread.join(timeout=120.0)


def _prepare_workspace(
    paths: dict[str, Path],
    manifest_url: str | None,
    photo_records: Any,
    photo_urls: Sequence[str],
) -> dict[str, Any]:
    """Download + transcode the frames and write `transforms.json`.

    Skipped wholesale when a previous (preempted) attempt already wrote the
    workspace — that is the cheap half of the resumable pattern, and it is safe
    because the workspace is job-keyed on the room-file version.

    Poses come from the uploaded sidecar when there is one and from the
    dispatcher's inlined `photoRecords` when there is not; see
    `core.transforms.parse_photo_rows` for why both exist and why they are the
    same geometry.
    """
    if paths["transforms"].is_file():
        document = _json.loads(paths["transforms"].read_text())
        return {"frames": len(document.get("frames", [])), "reused": True, "missing": 0}

    poses = (
        parse_photos_manifest(_fetch(manifest_url).decode("utf-8"))
        if manifest_url
        else parse_photo_rows(photo_records)
    )
    by_name = index_photo_urls(photo_urls)
    paths["images"].mkdir(parents=True, exist_ok=True)

    kept, missing = [], 0
    for pose in poses:
        url = by_name.get(pose.relative_path.rsplit("/", 1)[-1])
        if url is None:
            # Either the dispatcher's cap dropped it or the photo never reached
            # `room_scan_images`. A pose without pixels is not trainable; a
            # positional fallback would be worse than dropping it.
            missing += 1
            continue
        _write_frame(_fetch(url), paths["images"] / frame_file_name(pose.relative_path))
        kept.append(pose)

    if not kept:
        raise InputError("no captured photo matched a manifest pose")
    paths["transforms"].write_text(_json.dumps(build_transforms(kept), sort_keys=True))
    return {"frames": len(kept), "reused": False, "missing": missing}


def ensure_seed_points(paths: dict[str, Path], captured_room_json: Any) -> dict[str, Any]:
    """Write the seed point cloud and name it in `transforms.json`.

    SEPARATE from `_prepare_workspace`, and run after it, for the resume path.
    A workspace written by an earlier attempt — including one written before
    this stage seeded at all — short-circuits `_prepare_workspace` wholesale, so
    a seeding step folded into it would silently never run for exactly the runs
    that already cost the most. Doing it here means both a fresh workspace and a
    resumed one end up with the same two files.

    Never fatal, and that is enforced rather than asserted: everything here is
    inside a `try`. A room whose parametric geometry is unreadable, an
    unwritable workspace, or a `transforms.json` this cannot patch all leave the
    run unseeded — which is what every run did before this, and is strictly
    better than failing a scan whose photos are perfectly trainable.
    """
    try:
        spec = build_scene_spec(captured_room_json)
        ply, count = build_seed_ply(spec)
        document = _json.loads(paths["transforms"].read_text())
        if not isinstance(document, dict):
            raise InputError("transforms.json is not an object")

        if count == 0:
            # Clear a key an earlier attempt may have written. A named seed file
            # and a reported count of zero must not disagree — and nerfstudio
            # logs nothing when a named PLY yields no points.
            if document.pop("ply_file_path", None) is not None:
                paths["transforms"].write_text(_json.dumps(document, sort_keys=True))
            return {"seedPoints": 0, "seedReused": False}

        # Written EVERY time, not only when absent. The bytes are deterministic
        # and 1.5 MB, and `write_bytes` is not atomic: a truncated file left by
        # a preempted attempt would otherwise be reused and named in
        # transforms.json, open3d would read zero points, and the run would
        # train from random init — silently, with a positive seed count on the
        # ledger. That is precisely the failure this function exists to remove.
        reused = paths["seed_ply"].is_file()
        paths["seed_ply"].write_bytes(ply)

        if document.get("ply_file_path") != SEED_PLY_NAME:
            document["ply_file_path"] = SEED_PLY_NAME
            paths["transforms"].write_text(_json.dumps(document, sort_keys=True))
        return {"seedPoints": count, "seedReused": reused}
    except Exception as exc:  # noqa: BLE001 - see docstring
        _common.log_skip(STAGE, "seed_points_failed", error=type(exc).__name__)
        return {"seedPoints": 0, "seedReused": False}


# ── COLMAP pose-prior refinement (config-gated pre-step) ─────────────────────


def colmap_frames_from_transforms(paths: dict[str, Path]) -> list[_colmap_model.FrameLike]:
    """Read `transforms.json` into the `FrameLike` rows COLMAP's seed needs.

    The image NAME is the transcoded file's basename — the same name COLMAP's
    `feature_extractor` sees under `images/`, which is how the seed model's
    images are matched to the database's features. `image_id`/`camera_id` are
    placeholders; `run_colmap_refine` overwrites them with the database's own.
    """
    document = _json.loads(paths["transforms"].read_text())
    frames: list[_colmap_model.FrameLike] = []
    for fr in document.get("frames", []):
        name = str(fr["file_path"]).rsplit("/", 1)[-1]
        frames.append(
            _colmap_model.FrameLike(
                image_id=0, camera_id=0, name=name,
                transform_matrix=fr["transform_matrix"],
                width=int(fr["w"]), height=int(fr["h"]),
                fx=float(fr["fl_x"]), fy=float(fr["fl_y"]),
                cx=float(fr["cx"]), cy=float(fr["cy"]),
            )
        )
    return frames


def _ensure_ply_named(paths: dict[str, Path]) -> None:
    """Make sure `transforms.json` names the seed PLY. Parametric seeding leaves
    the key unset for a room that yields zero points, and a successful COLMAP
    seed must still be read."""
    document = _json.loads(paths["transforms"].read_text())
    if isinstance(document, dict) and document.get("ply_file_path") != SEED_PLY_NAME:
        document["ply_file_path"] = SEED_PLY_NAME
        paths["transforms"].write_text(_json.dumps(document, sort_keys=True))


def _apply_refined_poses(paths: dict[str, Path], refined: dict[str, list[list[float]]]) -> None:
    """Rewrite each frame's `transform_matrix` with the bundle-adjusted pose,
    matched by the image's basename. Only reached when BA actually moved them."""
    document = _json.loads(paths["transforms"].read_text())
    for fr in document.get("frames", []):
        name = str(fr["file_path"]).rsplit("/", 1)[-1]
        if name in refined:
            fr["transform_matrix"] = refined[name]
    paths["transforms"].write_text(_json.dumps(document, sort_keys=True))


def apply_pose_refine(paths: dict[str, Path], config: dict[str, Any]) -> dict[str, Any]:
    """Run the COLMAP pose-prior pre-step when the queue asks for it.

    `config.poseRefine` selects the seed: `"colmap"` triangulates a cloud off the
    photographs (ARKit poses as priors), anything else (default) leaves the
    parametric seed `ensure_seed_points` already wrote. On success the COLMAP
    cloud REPLACES the parametric one under the same file name transforms.json
    points at, so nothing else in the pipeline changes; `config.poseRefineBundle`
    additionally lets bundle adjustment refine the poses (off by default, because
    the ARKit poses are metric and gravity-aligned and BA can drift them).

    Never fatal, and never worse than the parametric path: any COLMAP failure or
    an under-registered solve leaves the parametric seed in place. The returned
    dict is provenance folded onto the artifact.
    """
    pose_refine = str(config.get("poseRefine") or "none").lower()
    if pose_refine != "colmap":
        return {"poseRefine": pose_refine, "seedSource": "parametric"}

    # Resume: COLMAP already ran for this workspace. Its seed and marker persist
    # on the Volume, so a preempted run does not pay for SfM twice.
    marker = paths["base"] / "colmap_refine.json"
    if marker.is_file():
        try:
            return _json.loads(marker.read_text())
        except (OSError, ValueError):
            pass

    bundle = bool(config.get("poseRefineBundle", False))
    frames = colmap_frames_from_transforms(paths)
    outcome = _colmap_refine.run_colmap_refine(
        paths["base"], frames, run=_run,
        timeout_s=COLMAP_TIMEOUT_S, bundle_adjust=bundle,
    )
    prov = outcome.provenance()
    if outcome.ok and outcome.ply_bytes:
        paths["seed_ply"].write_bytes(outcome.ply_bytes)
        _ensure_ply_named(paths)
        if outcome.refined_frames:
            _apply_refined_poses(paths, outcome.refined_frames)
        prov["seedSource"] = "colmap"
        prov["seedPoints"] = outcome.point_count
    else:
        # The parametric seed ensure_seed_points wrote stays in place.
        prov["seedSource"] = "parametric"
    try:
        marker.write_text(_json.dumps(prov, sort_keys=True))
    except OSError:
        pass
    return prov


# ── the job ─────────────────────────────────────────────────────────────────


def run_splat(
    payload: dict[str, Any],
    db: ScanWorkerDb | None = None,
    checkpoint_commit: Callable[[], None] | None = None,
) -> dict[str, Any]:
    """Run `splat` for one dispatched task and write its outcome to the ledger.

    `checkpoint_commit` persists the Modal Volume (the real `volume.commit`;
    `None` in tests and anywhere without one). It is called DURING training,
    each time a new checkpoint lands — see `CheckpointCommitter`.
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
    detail = {"traceId": trace_id, "roomFileVersion": room_file_version}

    started = time.monotonic()
    owns_db = db is None
    completed = False
    abandoned = False
    try:
        if db is None:
            db = ScanWorkerDb.from_env()
        db.append_event(task_id, lease_token, scan_id, room_file_id, STAGE, "started",
                        "started", 0, {**detail, "taskId": task_id})

        manifest_url = inputs.get("photosManifestUrl")
        photo_records = inputs.get("photoRecords")
        photo_urls = inputs.get("photoUrls") or []
        captured_url = inputs.get("capturedRoomJsonUrl")
        # The sidecar is often absent (ingest strips it as device-local), so
        # EITHER pose carrier is acceptable — but not neither.
        if not manifest_url and not photo_records:
            raise InputError(
                "inputs.photosManifestUrl or inputs.photoRecords is required"
            )
        if not captured_url or not photo_urls:
            raise InputError(
                "inputs.photoUrls and inputs.capturedRoomJsonUrl are required"
            )
        if not scan_id:
            raise InputError("scanId is required")
        # Derived from which carrier actually arrived, not from the dispatcher's
        # own label — this is the job saying what it did.
        photos_source = "manifest" if manifest_url else "rows"

        # Parsed for its own sake: an unreadable parametric room means the
        # capture is broken, and finding that out now costs a download rather
        # than 25 minutes of L4. The DOCUMENT is kept, not just the parse: it is
        # also what the seed point cloud is sampled from.
        captured_doc = _json.loads(_fetch(captured_url))
        parametric = parse_captured_room_meters(captured_doc)

        paths = workspace_paths(scan_id, room_file_version)
        paths["base"].mkdir(parents=True, exist_ok=True)
        prep = _prepare_workspace(paths, manifest_url, photo_records, photo_urls)
        seed = ensure_seed_points(paths, captured_doc)
        # `inputs.config` is the queue's knob. It reaches here because the
        # dispatcher passes `agent_tasks.payload.config` through verbatim
        # (contract.json's `splat_config` variant); before that it was
        # unreachable and this branch was dead code (W2-EVIDENCE.md §4 E).
        config = inputs.get("config") or {}
        # COLMAP pose-prior seed, if the queue asked for it. Runs after the
        # parametric seed and replaces it on success; a failure or an
        # under-registered solve leaves the parametric seed untouched. Default
        # `none` — existing behaviour is byte-for-byte unchanged.
        refine = apply_pose_refine(paths, config)
        seed_points_final = int(refine.get("seedPoints", seed["seedPoints"]))
        seed_source = refine.get("seedSource", "parametric")

        resume = paths["checkpoints"].is_dir() and any(paths["checkpoints"].iterdir())
        requested = config.get("maxIterations")
        max_iterations = int(requested or default_max_iterations(prep["frames"]))
        iterations_source = "config" if requested else "default"
        # The watcher commits the Volume as each checkpoint lands, and its
        # shutdown is in a `finally`, so a preemption, a training timeout or an
        # operator stop all leave the last checkpoint durable — the resume path
        # is only real if something committed before the container died.
        with _checkpoint_watch(paths["checkpoints"], checkpoint_commit) as committer:
            code = _run(train_argv(paths, max_iterations, resume), TRAIN_TIMEOUT_S)
        if code != 0:
            raise RuntimeError(f"ns-train {METHOD} exited {code}")

        paths["exports"].mkdir(parents=True, exist_ok=True)
        export_config, choice = choose_export_config(paths)
        code = _run(export_argv(paths, export_config), EXPORT_TIMEOUT_S)
        if code != 0:
            raise RuntimeError(f"ns-export gaussian-splat exited {code}")
        ply = _resolve_ply(paths)
        ply_bytes = ply.stat().st_size
        compressed = _spz.compress_splat(ply, paths["base"])

        bucket = _r2.artifacts_bucket()
        key = splat_object_key(scan_id, room_file_version, compressed.file_name)
        provenance = {
            "stage": STAGE,
            "method": METHOD,
            "frames": prep["frames"],
            "photosMissing": prep["missing"],
            # Which pose carrier fired. Worth persisting: a splat trained off
            # room_scan_images rows and one trained off the uploaded sidecar are
            # not distinguishable after the fact from anything else on the row.
            "photosSource": photos_source,
            "maxIterations": max_iterations,
            # Whether the budget came from the queue or from the view-count
            # policy. A 12 000-iteration artifact is not self-describing —
            # `default_max_iterations` can move, and a stored splat should say
            # whether an operator chose its budget or the pipeline did.
            "maxIterationsSource": iterations_source,
            "resumed": resume,
            # Which checkpoint these bytes came from, and on what evidence.
            # Before this, the export was always the last checkpoint and there
            # was nothing on the artifact to say so (W2-EVIDENCE.md §13.6).
            # LPIPS is the primary selector and PSNR the tiebreak/fallback
            # (W2-EVIDENCE.md §14.6 item 1) — `exportCheckpointReason` is the
            # basis ("best_lpips" | "psnr-fallback" | "latest_no_eval_metrics" |
            # "latest_config_unpinnable"), and both metrics are kept regardless
            # of which one decided the choice.
            "exportCheckpointStep": choice.step if choice else None,
            "exportCheckpointLpips": choice.lpips if choice else None,
            "exportCheckpointPsnr": choice.psnr if choice else None,
            "exportCheckpointReason": choice.reason if choice else "no_checkpoints",
            "evalPointsConsidered": choice.considered if choice else 0,
            "walls": len(parametric.walls),
            # How the optimiser started. A splat seeded off the parametric room,
            # one seeded off COLMAP-triangulated geometry, and one that began
            # from random noise are the same artifact kind and are not otherwise
            # distinguishable after the fact. `seedSource` names which, and the
            # `colmap*` keys (present only under `poseRefine: colmap`) carry the
            # SfM's registration outcome — the evidence for whether the
            # pose-prior seed helped or fell back.
            "seedPoints": seed_points_final,
            "seedSource": seed_source,
            **{k: v for k, v in refine.items() if k not in ("seedPoints", "seedSource")},
            # Which compressor produced these bytes, and what it started from.
            # `spz` and `gzip-ply` are different containers behind the same
            # artifact kind, and the ratio is the whole reason the stage
            # compresses at all.
            "compression": compressed.mode,
            "plyBytes": ply_bytes,
            "checkpointCommits": committer.commits,
        }
        object_id = db.register_media_object(
            bucket=bucket, object_key=key, access_class=ACCESS_CLASS,
            mime=compressed.mime, scan_id=scan_id, provenance=provenance,
        )
        stored = _r2.put_file(bucket, key, compressed.path, compressed.content_type,
                              content_encoding=compressed.content_encoding)
        db.mark_media_object_state(object_id, "stored", sha256=stored["sha256"],
                                   etag=stored["etag"], size_bytes=stored["size_bytes"])

        # `version` here is the ROOM FILE version this artifact was produced
        # for. `media_objects.version` is not readable by scan_worker (00489
        # grants it no SELECT) and 00490's `scan_media_read` resolves the ref by
        # `object_id` alone, so this leg is provenance rather than a join key.
        artifacts = {ARTIFACT_KIND: {"object_id": str(object_id), "version": room_file_version}}
        db.update_room_file(task_id, lease_token, room_file_id, verify=None, artifacts=artifacts)

        duration_ms = int((time.monotonic() - started) * 1000)
        db.append_event(task_id, lease_token, scan_id, room_file_id, STAGE, "completed",
                        "succeeded", duration_ms, {**detail, **provenance,
                                                   "sizeBytes": stored["size_bytes"]})
        result = {"stage": STAGE, "roomFileId": room_file_id,
                  "roomFileVersion": room_file_version, "artifacts": artifacts,
                  "provenance": provenance}
        db.complete_task(task_id, lease_token, result)
        completed = True
        return result
    except LeaseRejected:
        abandoned = True
        _common.log_skip(STAGE, "lease_rejected", taskId=task_id, traceId=trace_id,
                         roomFileVersion=room_file_version)
        return {"skipped": "lease_rejected"}
    except StaleVersion:
        abandoned = True
        _common.log_skip(STAGE, "stale_version", taskId=task_id, traceId=trace_id,
                         roomFileVersion=room_file_version)
        return {"skipped": "stale_version"}
    finally:
        if not completed and not abandoned:
            _common.release(db, STAGE, task_id, lease_token, scan_id, room_file_id,
                            detail, started)
        if owns_db and db is not None:
            db.close()


def _resolve_ply(paths: dict[str, Path]) -> Path:
    """Find what `ns-export gaussian-splat` actually wrote.

    The exporter's file name has moved between nerfstudio releases (`splat.ply`
    is the current one), so the expected name is tried first and the export
    directory is then searched rather than failing on a rename we can recover
    from. An empty directory is still an error.
    """
    if paths["ply"].is_file():
        return paths["ply"]
    candidates = sorted(paths["exports"].glob("*.ply"))
    if not candidates:
        raise RuntimeError("ns-export gaussian-splat produced no .ply")
    return candidates[0]
