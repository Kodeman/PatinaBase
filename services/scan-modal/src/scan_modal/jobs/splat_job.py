"""`splat` job glue — ARKit posed photos → splatfacto → `.ply` → `.spz` → R2.

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
4. Poses arrive by one of TWO carriers. `inputs.photosManifestUrl` is the
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
from pathlib import Path
from typing import Any, Callable, Sequence

from .. import SPLAT_CACHE_MOUNT
from ..core import spz as _spz
from ..core.captured_room import parse_captured_room_meters
from ..core.transforms import (
    build_transforms,
    frame_file_name,
    parse_photo_rows,
    parse_photos_manifest,
)
from ..io import r2 as _r2
from ..io.db import LeaseRejected, ScanWorkerDb, StaleVersion
from . import _common

__all__ = ["STAGE", "ARTIFACT_KIND", "InputError", "run_splat", "splat_object_key",
           "train_argv", "export_argv", "workspace_paths"]

STAGE = "splat"
ARTIFACT_KIND = "splat"
ACCESS_CLASS = "authenticated_project"
SPZ_MIME = "application/octet-stream"

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
DEFAULT_MAX_ITERATIONS = 30000
#: Save often enough that a preemption costs minutes, not the whole run.
STEPS_PER_SAVE = 2000
#: Wall-clock ceilings, well inside the function's own 3600 s timeout.
TRAIN_TIMEOUT_S = 3000.0
EXPORT_TIMEOUT_S = 600.0

# Module-level seam — tests monkeypatch this by name, and the job calls it
# through the module global so the substitution takes.
_fetch = _common.fetch


class InputError(ValueError):
    """The dispatch payload is missing an input this stage cannot proceed without."""


# ── pure helpers ────────────────────────────────────────────────────────────


def splat_object_key(scan_id: str, room_file_version: Any) -> str:
    return f"scan_artifacts/{scan_id}/v{room_file_version}/room.spz"


def workspace_paths(scan_id: str, room_file_version: Any, root: Path | None = None) -> dict[str, Path]:
    """The job-keyed workspace. Every path a restart needs to find again.

    `root` defaults to the module global at CALL time, not at def time, so the
    mount point stays overridable (tests point it at a tmp dir).
    """
    base = (root or CACHE_ROOT) / str(scan_id) / f"v{room_file_version}"
    return {
        "base": base,
        "images": base / "images",
        "transforms": base / "transforms.json",
        "output": base / "output",
        "run": base / "output" / METHOD / RUN_TIMESTAMP,
        "checkpoints": base / "output" / METHOD / RUN_TIMESTAMP / "nerfstudio_models",
        "config": base / "output" / METHOD / RUN_TIMESTAMP / "config.yml",
        "exports": base / "exports",
        "ply": base / "exports" / "splat.ply",
        "spz": base / "room.spz",
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
        "--experiment-name", METHOD,
        "--timestamp", RUN_TIMESTAMP,
        "--max-num-iterations", str(int(max_iterations)),
        "--steps-per-save", str(STEPS_PER_SAVE),
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
    ]
    return argv


def export_argv(paths: dict[str, Path]) -> list[str]:
    return [
        "ns-export", "gaussian-splat",
        "--load-config", str(paths["config"]),
        "--output-dir", str(paths["exports"]),
    ]


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


# ── the job ─────────────────────────────────────────────────────────────────


def run_splat(
    payload: dict[str, Any],
    db: ScanWorkerDb | None = None,
    checkpoint_commit: Callable[[], None] | None = None,
) -> dict[str, Any]:
    """Run `splat` for one dispatched task and write its outcome to the ledger.

    `checkpoint_commit` persists the Modal Volume (the real `volume.commit`, a
    no-op in tests). Called after training so a preemption during EXPORT does
    not throw away the trained checkpoint.
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
        # than 25 minutes of L4.
        parametric = parse_captured_room_meters(_json.loads(_fetch(captured_url)))

        paths = workspace_paths(scan_id, room_file_version)
        paths["base"].mkdir(parents=True, exist_ok=True)
        prep = _prepare_workspace(paths, manifest_url, photo_records, photo_urls)

        resume = paths["checkpoints"].is_dir() and any(paths["checkpoints"].iterdir())
        config = inputs.get("config") or {}
        max_iterations = int(config.get("maxIterations") or DEFAULT_MAX_ITERATIONS)
        code = _run(train_argv(paths, max_iterations, resume), TRAIN_TIMEOUT_S)
        if code != 0:
            raise RuntimeError(f"ns-train {METHOD} exited {code}")
        if checkpoint_commit is not None:
            checkpoint_commit()

        paths["exports"].mkdir(parents=True, exist_ok=True)
        code = _run(export_argv(paths), EXPORT_TIMEOUT_S)
        if code != 0:
            raise RuntimeError(f"ns-export gaussian-splat exited {code}")
        ply = _resolve_ply(paths)
        _spz.compress_ply_to_spz(ply, paths["spz"])

        bucket = _r2.artifacts_bucket()
        key = splat_object_key(scan_id, room_file_version)
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
            "resumed": resume,
            "walls": len(parametric.walls),
        }
        object_id = db.register_media_object(
            bucket=bucket, object_key=key, access_class=ACCESS_CLASS,
            mime=SPZ_MIME, scan_id=scan_id, provenance=provenance,
        )
        stored = _r2.put_file(bucket, key, paths["spz"], SPZ_MIME)
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
