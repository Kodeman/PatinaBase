"""ARKit posed photos → a nerfstudio `transforms.json`. Pure: no IO, no images.

Input is `photos/photos_metadata.ndjson` — one JSON object per line, each one an
encoded `ScanManifest.PhotoEntry` from
`apps/mobile/Patina/Patina/Features/Walk/Models/ScanManifest.swift` (written by
`ScanBundleWriter.appendPhotoNDJSON` / `registerPhotosManifest`). The fields this
module reads, with their producer:

    relativePath      "photos/auto_001.50.heic" — bundle-relative
    width, height     the ENCODED image extent (see the rotation note below)
    cameraTransform   flat 16 doubles, ROW-major, translation at 3/7/11
    cameraIntrinsics  {fx, fy, cx, cy, width, height} in the NATIVE sensor frame
    orderIndex        optional; ordering falls back to timestampSeconds

══════════════════════════════════════════════════════════════════════════════
THE CONVENTION CONVERSION — three separate changes of basis, derived here
══════════════════════════════════════════════════════════════════════════════

(1) CAMERA AXES — no flip needed, and that is the whole point of saying so.

ARKit's camera-local frame is +X right, +Y up, −Z forward:
  `apps/mobile/Patina/Patina/Features/Walk/Instrument/CameraPose.swift`
  "ARKit's camera looks down its local -Z, so the forward vector is
   `-columns.2`; dropping the negation points the coverage cone backwards".
nerfstudio's `transform_matrix` uses the OpenGL/Blender camera frame — +X right,
+Y up, +Z BACKWARD, i.e. the camera looks down −Z. These are the same frame.
So, unlike a COLMAP/OpenCV import (which must flip Y and Z), ARKit poses need
NO camera-basis flip. `cameraTransform` is already camera-to-world.

(2) IMAGE ROTATION — the trap this file exists to get right.

`PosedPhotoService.encodeAndWrite` writes the photo as
`CIImage(...).oriented(.right)` — a 90° CLOCKWISE rotation to portrait — but
records `cameraIntrinsics` straight off `ARCamera.intrinsics` and
`ARCamera.imageResolution`, i.e. in the UNROTATED, native LANDSCAPE frame. Pose
and intrinsics agree with each other; neither agrees with the pixels on disk.
Detected by the dimension swap `(width, height) == (intr.height, intr.width)`.

Rotating an image of size (W, H) by 90° CW sends a point (u, v) to
(u', v') = (H − v, u), giving a new size (H, W). Therefore:

    fx' = fy      fy' = fx      cx' = H − cy      cy' = cx        (H = intr.height)

and the camera's own axes move with the pixels. New image right (+u') runs along
old −v, which is old camera +Y; new image down (+v') runs along old +u, which is
old camera +X, so new camera up (+Y') is old −X. Forward is untouched. Writing
the new basis vectors in old-camera coordinates as the columns of C:

    X' = ( 0, 1, 0)          [ 0 −1  0 ]
    Y' = (−1, 0, 0)     C =  [ 1  0  0 ]     det C = +1
    Z' = ( 0, 0, 1)          [ 0  0  1 ]

C maps new-camera coordinates to old-camera coordinates, so it RIGHT-multiplies:
`c2w' = c2w @ C`. Applied only when the swap is detected; a manifest whose image
extent already matches its intrinsics frame is passed through untouched.

(3) WORLD UP — ARKit is Y-up, nerfstudio is Z-up.

ARKit world space is right-handed, gravity-aligned, Y-up, metres. nerfstudio's
world convention is +Z up, and its dataparser will otherwise ESTIMATE up from
the mean camera up-vector (`--orientation-method up`, the default). We have real
gravity, so we apply the exact rotation here and train with
`--orientation-method none --center-method none --auto-scale-poses False`
(see jobs/splat_job.py), which keeps the reconstruction in ARKit metres —
the same units the parametric room file is measured in.

Sending +X→+X and +Y→+Z forces +Z→−Y to keep det = +1:

    W = [ 1  0  0 ]     v_nerfstudio = W · v_arkit
        [ 0  0 −1 ]
        [ 0  1  0 ]

W changes the WORLD frame, so it LEFT-multiplies: `c2w'' = W4 @ c2w'`.
It is also emitted as `applied_transform` (nerfstudio's own key for "what was
done to the source poses"), so an exported artifact can be mapped back into
ARKit world coordinates and lined up against the parametric model.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Any, Iterable, Sequence

import numpy as np

__all__ = [
    "ManifestError",
    "PhotoPose",
    "ARKIT_TO_NERFSTUDIO",
    "RIGHT_ROTATION_CAMERA",
    "parse_photos_manifest",
    "frame_file_name",
    "nerfstudio_pose",
    "build_transforms",
]

# ── the two fixed changes of basis, derived in the module docstring ──────────

#: World: ARKit Y-up → nerfstudio Z-up. Left-multiplies a camera-to-world.
ARKIT_TO_NERFSTUDIO = np.array(
    [
        [1.0, 0.0, 0.0, 0.0],
        [0.0, 0.0, -1.0, 0.0],
        [0.0, 1.0, 0.0, 0.0],
        [0.0, 0.0, 0.0, 1.0],
    ]
)

#: Camera: the 90°-CW image rotation `.oriented(.right)` applies. Right-multiplies.
RIGHT_ROTATION_CAMERA = np.array(
    [
        [0.0, -1.0, 0.0, 0.0],
        [1.0, 0.0, 0.0, 0.0],
        [0.0, 0.0, 1.0, 0.0],
        [0.0, 0.0, 0.0, 1.0],
    ]
)

# nerfstudio reads pinhole intrinsics per frame; ARKit hands us an undistorted
# rectilinear model, so no k1/k2/p1/p2 are emitted rather than emitting zeros
# and implying we measured them.
CAMERA_MODEL = "PINHOLE"


class ManifestError(ValueError):
    """The photos manifest is missing something a pose cannot be built without."""


@dataclass(frozen=True)
class PhotoPose:
    """One manifest line, reduced to the fields a nerfstudio frame needs."""

    relative_path: str
    width: int
    height: int
    fx: float
    fy: float
    cx: float
    cy: float
    intr_width: int
    intr_height: int
    c2w: tuple[float, ...]  # flat 16, row-major, ARKit camera-to-world
    order_index: int | None = None
    timestamp_seconds: float | None = None

    @property
    def needs_right_rotation(self) -> bool:
        """True when the stored pixels are the 90°-CW portrait rotation of the
        frame the intrinsics were measured in (docstring §2)."""
        return (self.width, self.height) == (self.intr_height, self.intr_width)


# ── parsing ─────────────────────────────────────────────────────────────────


def _require(entry: dict[str, Any], key: str) -> Any:
    value = entry.get(key)
    if value is None:
        raise ManifestError(f"photo entry is missing {key}")
    return value


def _photo_pose(entry: Any) -> PhotoPose:
    if not isinstance(entry, dict):
        raise ManifestError("photo entry is not a JSON object")
    transform = _require(entry, "cameraTransform")
    if not isinstance(transform, Sequence) or isinstance(transform, str) or len(transform) != 16:
        raise ManifestError("cameraTransform must be a flat row-major 4x4 (16 numbers)")
    intr = _require(entry, "cameraIntrinsics")
    if not isinstance(intr, dict):
        raise ManifestError("cameraIntrinsics must be an object")
    order = entry.get("orderIndex")
    ts = entry.get("timestampSeconds")
    return PhotoPose(
        relative_path=str(_require(entry, "relativePath")),
        width=int(_require(entry, "width")),
        height=int(_require(entry, "height")),
        fx=float(_require(intr, "fx")),
        fy=float(_require(intr, "fy")),
        cx=float(_require(intr, "cx")),
        cy=float(_require(intr, "cy")),
        intr_width=int(_require(intr, "width")),
        intr_height=int(_require(intr, "height")),
        c2w=tuple(float(v) for v in transform),
        order_index=int(order) if order is not None else None,
        timestamp_seconds=float(ts) if ts is not None else None,
    )


def parse_photos_manifest(text: str) -> list[PhotoPose]:
    """Parse `photos/photos_metadata.ndjson` into ordered poses.

    NDJSON: one object per line, blank lines skipped. The live-append path in
    `ScanBundleWriter` writes lines as they happen, so the file's own order is
    capture order — but a truncated tail is possible either way. Order is
    therefore RE-DERIVED (orderIndex, then timestampSeconds, then path) rather
    than trusted, so the same bundle always produces the same frame list.
    """
    poses: list[PhotoPose] = []
    for lineno, raw in enumerate(text.splitlines(), start=1):
        line = raw.strip()
        if not line:
            continue
        try:
            entry = json.loads(line)
        except json.JSONDecodeError as exc:
            raise ManifestError(f"photos manifest line {lineno} is not JSON: {exc.msg}") from exc
        poses.append(_photo_pose(entry))
    if not poses:
        raise ManifestError("photos manifest contains no entries")
    return sorted(
        poses,
        key=lambda p: (
            p.order_index if p.order_index is not None else 1 << 30,
            p.timestamp_seconds if p.timestamp_seconds is not None else 0.0,
            p.relative_path,
        ),
    )


# ── frame naming ────────────────────────────────────────────────────────────


def frame_file_name(relative_path: str, suffix: str = ".jpg") -> str:
    """`"photos/auto_001.50.heic"` → `"auto_001.50.jpg"`.

    nerfstudio loads frames through PIL, which does not read HEIC without an
    extra plugin, so `splat_job` transcodes every photo and the frame's
    `file_path` must name the TRANSCODED file. Only the FINAL extension is
    replaced: `auto_001.50` carries a decimal point, so a naive `split('.')`
    would truncate the timestamp and collide two frames onto one name.
    """
    name = relative_path.rsplit("/", 1)[-1]
    if not name:
        raise ManifestError(f"photo relativePath has no file name: {relative_path!r}")
    dot = name.rfind(".")
    stem = name[:dot] if dot > 0 else name
    return f"{stem}{suffix}"


# ── pose + intrinsics conversion ────────────────────────────────────────────


def nerfstudio_pose(pose: PhotoPose) -> tuple[list[list[float]], dict[str, float]]:
    """One ARKit pose → (nerfstudio transform_matrix, intrinsics dict).

    The three changes of basis are the module docstring's (1), (2), (3).
    """
    c2w = np.array(pose.c2w, dtype=float).reshape(4, 4)  # row-major, as written
    fx, fy, cx, cy = pose.fx, pose.fy, pose.cx, pose.cy

    if pose.needs_right_rotation:
        # (2) — the pixels are the 90°-CW rotation of the intrinsics frame.
        fx, fy = pose.fy, pose.fx
        cx, cy = float(pose.intr_height) - pose.cy, pose.cx
        c2w = c2w @ RIGHT_ROTATION_CAMERA

    # (3) — world Y-up → Z-up. (1) is the no-op: no camera flip is applied.
    c2w = ARKIT_TO_NERFSTUDIO @ c2w

    return (
        [[float(v) for v in row] for row in c2w],
        {"fl_x": float(fx), "fl_y": float(fy), "cx": float(cx), "cy": float(cy)},
    )


def build_transforms(
    poses: Iterable[PhotoPose],
    image_dir: str = "images",
    suffix: str = ".jpg",
) -> dict[str, Any]:
    """Build the nerfstudio `transforms.json` document.

    Intrinsics are emitted PER FRAME rather than hoisted to the top level: a
    walk can mix full-resolution user shutters with downscaled auto frames
    (`isFullResolution`), so one shared `fl_x` would be wrong for half the set.
    nerfstudio reads per-frame intrinsics when present.
    """
    frames: list[dict[str, Any]] = []
    for pose in poses:
        matrix, intrinsics = nerfstudio_pose(pose)
        frames.append(
            {
                "file_path": f"{image_dir}/{frame_file_name(pose.relative_path, suffix)}",
                "w": int(pose.width),
                "h": int(pose.height),
                **intrinsics,
                "transform_matrix": matrix,
            }
        )
    if not frames:
        raise ManifestError("no frames to write")
    return {
        "camera_model": CAMERA_MODEL,
        # nerfstudio's own record of "what was done to the source poses". Kept
        # so an exported artifact can be rotated back into ARKit world space and
        # lined up against the parametric room.
        "applied_transform": [[float(v) for v in row] for row in ARKIT_TO_NERFSTUDIO[:3]],
        "frames": frames,
    }
