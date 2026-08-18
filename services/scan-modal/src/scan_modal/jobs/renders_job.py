"""`renders` job glue — GLB → Cycles stills + turntable → R2.

Ledger discipline is `verify_job`'s, verbatim in shape, with the shared parts in
`jobs/_common.py`: lease-gated `started` event first, `LeaseRejected` and
`StaleVersion` exit clean and write nothing, and a `finally` releases the task
on any other non-completion.

Blender never appears in this file. Everything it does is the four verbs of
`core.blender_ops.BlenderScene`, so the whole job is testable with a fake scene
and no 300 MB bpy wheel in the test environment.
"""

from __future__ import annotations

import time
from pathlib import Path
from typing import Any

from ..core.blender_ops import BlenderScene, BpyScene
from ..core.cameras import CameraShot, plan_cameras
from ..io import r2 as _r2
from ..io.db import LeaseRejected, ScanWorkerDb, StaleVersion
from . import _common

__all__ = ["STAGE", "ARTIFACT_KIND", "InputError", "run_renders", "render_object_key",
           "COVER_SHOT"]

STAGE = "renders"
ARTIFACT_KIND = "renders"
ACCESS_CLASS = "authenticated_project"
JPEG_MIME = "image/jpeg"

#: The shot whose object id is hoisted onto the `renders` ref — see the manifest
#: comment in `run_renders`. The top-down plate reads as a room at thumbnail
#: size, which is what a cover has to do.
COVER_SHOT = "top_down"

WORK_ROOT = Path("/tmp/renders")

# Module-level seam — tests monkeypatch this by name.
_fetch = _common.fetch


class InputError(ValueError):
    """The dispatch payload is missing an input this stage cannot proceed without."""


def render_object_key(scan_id: str, room_file_version: Any, name: str) -> str:
    return f"scan_artifacts/{scan_id}/v{room_file_version}/renders/{name}.jpg"


def _publish(
    db: ScanWorkerDb,
    bucket: str,
    scan_id: str,
    room_file_version: Any,
    shot: CameraShot,
    path: Path,
    provenance: dict[str, Any],
) -> dict[str, Any]:
    """Register → PUT → mark stored, for one frame. Same order as `splat`:
    the row exists before the bytes do, so a crash between the two leaves a
    `pending` row rather than an unregistered object nobody will ever collect."""
    key = render_object_key(scan_id, room_file_version, shot.name)
    object_id = db.register_media_object(
        bucket=bucket, object_key=key, access_class=ACCESS_CLASS, mime=JPEG_MIME,
        scan_id=scan_id, provenance={**provenance, "shot": shot.name, "kind": shot.kind},
    )
    stored = _r2.put_file(bucket, key, path, JPEG_MIME)
    db.mark_media_object_state(object_id, "stored", sha256=stored["sha256"],
                               etag=stored["etag"], size_bytes=stored["size_bytes"])
    return {"object_id": str(object_id), "object_key": key, "sha256": stored["sha256"]}


def run_renders(
    payload: dict[str, Any],
    db: ScanWorkerDb | None = None,
    scene: BlenderScene | None = None,
    work_root: Path = WORK_ROOT,
) -> dict[str, Any]:
    """Render one room-file version's still set and write its outcome to the ledger."""
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

        glb_url = inputs.get("glbUrl")
        if not glb_url:
            raise InputError("inputs.glbUrl is required")
        if not scan_id:
            raise InputError("scanId is required")

        work = work_root / str(scan_id) / f"v{room_file_version}"
        work.mkdir(parents=True, exist_ok=True)
        glb_path = work / "room.glb"
        glb_path.write_bytes(_fetch(glb_url))

        scene = scene if scene is not None else BpyScene()
        bbox = scene.import_glb(glb_path)
        scene.setup(bbox)
        shots = plan_cameras(bbox)

        bucket = _r2.artifacts_bucket()
        provenance = {"stage": STAGE, "roomFileVersion": room_file_version}
        published: dict[str, Any] = {}
        for shot in shots:
            frame = scene.render(shot, work / f"{shot.name}.jpg")
            published[shot.name] = _publish(db, bucket, scan_id, room_file_version,
                                            shot, Path(frame), provenance)

        # The `renders` ref is a MANIFEST — a render set has no single object —
        # but 00490's `scan_media_read` resolves a ref by its top-level
        # `object_id`. So the cover plate's id is hoisted to the top level: the
        # view resolves `renders` to a usable representative image, and the W2
        # read routes read `shots` for the full set. Without the hoist the view
        # would silently drop the row (NULL::uuid joins nothing) rather than
        # error, which is the worse failure.
        cover = published.get(COVER_SHOT) or next(iter(published.values()))
        artifacts = {
            ARTIFACT_KIND: {
                "object_id": cover["object_id"],
                "version": room_file_version,
                "cover": COVER_SHOT,
                "count": len(published),
                "shots": published,
            }
        }
        db.update_room_file(task_id, lease_token, room_file_id, verify=None, artifacts=artifacts)

        duration_ms = int((time.monotonic() - started) * 1000)
        db.append_event(task_id, lease_token, scan_id, room_file_id, STAGE, "completed",
                        "succeeded", duration_ms, {**detail, "frames": len(published)})
        result = {"stage": STAGE, "roomFileId": room_file_id,
                  "roomFileVersion": room_file_version, "artifacts": artifacts}
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
