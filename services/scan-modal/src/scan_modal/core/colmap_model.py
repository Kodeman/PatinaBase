"""COLMAP text-model I/O and the frame conversions around it. Pure: numpy in,
strings/arrays out. No subprocess, no COLMAP, no filesystem.

WHY THIS MODULE EXISTS
──────────────────────
`jobs/colmap_refine` drives COLMAP as a POSE-PRIOR refiner: the ARKit poses are
seeded into COLMAP unchanged, `point_triangulator` adds real 3-D geometry
without moving a pose, and (optionally) bundle adjustment nudges the poses. That
is exactly the shape the parked scan-pipeline engine composed
(`refine_colmap_backend._run_primary_plan`) — a known-pose seed, one CLI
triangulation phase, points that come from the photographs rather than from the
parametric room. The value over the parametric seed is that these points sit on
the surfaces the cameras actually saw, so splatfacto initialises from observed
structure instead of a guess.

Everything COLMAP-format lives here so the arithmetic is unit-testable without a
GPU or the binary: build the seed model from nerfstudio frames, parse the
triangulated model back, and prove the round trip is the identity.

THE FRAME — DERIVED, NOT ASSERTED
─────────────────────────────────
We make **COLMAP's world frame == nerfstudio's world frame**. Then triangulated
`points3D` come out already in the frame `transforms.json`'s cameras live in and
in which `core/seed_points` writes the parametric cloud, so the seed PLY needs no
further change of basis — identical to the parametric-seed path.

Two conventions separate a nerfstudio frame from a COLMAP image:

1. **Handedness of the camera axes.** nerfstudio/OpenGL camera is +X right,
   +Y up, +Z BACKWARD (looks down −Z). COLMAP/OpenCV camera is +X right,
   +Y DOWN, +Z FORWARD (looks down +Z). The map between them flips Y and Z:

       M = diag(1, -1, -1)          (its own inverse)

   A point in OpenCV-camera coords is `x_cv = M · x_gl`, so a camera-to-world
   whose columns are the OpenGL basis becomes the OpenCV one by right-multiplying
   by M: `R_cv = R_gl · M`. Translation (the camera centre in world) is unmoved.

2. **Direction of the stored transform.** nerfstudio stores camera-to-world;
   COLMAP stores WORLD-TO-camera as `(qvec, tvec)` with `X_cam = R(qvec)·X_world
   + tvec`. So `R_w2c = R_cv^T` and `tvec = −R_cv^T · c_world`.

`frame_to_colmap` applies (1) then (2); `colmap_pose_to_frame` inverts both, and
the round trip is a test. COLMAP quaternions are Hamilton, scalar-first
(`qw qx qy qz`); `q` and `−q` are the same rotation, so a sign flip across the
round trip is not an error and the tests compare rotation matrices, not raw
quaternions.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Iterable, Sequence

import numpy as np

from .seed_points import SeedCloud, encode_ply

__all__ = [
    "OPENGL_TO_OPENCV_CAMERA",
    "ColmapCamera",
    "ColmapImage",
    "ColmapPoint",
    "FrameLike",
    "SeedModel",
    "rotmat_to_qvec",
    "qvec_to_rotmat",
    "frame_to_colmap",
    "colmap_pose_to_frame",
    "build_seed_model",
    "parse_cameras_txt",
    "parse_images_txt",
    "parse_points3D_txt",
    "points_to_ply",
    "colmap_frames_from_images",
]

#: The camera-basis flip between nerfstudio/OpenGL (+Y up, −Z forward) and
#: COLMAP/OpenCV (+Y down, +Z forward). Right-multiplies a camera-to-world
#: rotation; it is its own inverse.
OPENGL_TO_OPENCV_CAMERA = np.diag([1.0, -1.0, -1.0])


@dataclass(frozen=True)
class ColmapCamera:
    """One PINHOLE camera. `params` is (fx, fy, cx, cy)."""

    camera_id: int
    width: int
    height: int
    fx: float
    fy: float
    cx: float
    cy: float

    @property
    def params(self) -> tuple[float, float, float, float]:
        return (self.fx, self.fy, self.cx, self.cy)


@dataclass(frozen=True)
class ColmapImage:
    """One posed image. `qvec`/`tvec` are COLMAP world-to-camera (OpenCV)."""

    image_id: int
    camera_id: int
    name: str
    qvec: tuple[float, float, float, float]  # qw, qx, qy, qz (Hamilton)
    tvec: tuple[float, float, float]


@dataclass(frozen=True)
class ColmapPoint:
    """One triangulated point, in COLMAP world coordinates (== nerfstudio world)."""

    xyz: tuple[float, float, float]
    rgb: tuple[int, int, int]
    error: float
    track_length: int


# The structural contract `build_seed_model` reads. Kept minimal on purpose so a
# test can pass a plain object and the job can pass its own row type.
@dataclass(frozen=True)
class FrameLike:
    image_id: int
    camera_id: int
    name: str
    transform_matrix: Sequence[Sequence[float]]
    width: int
    height: int
    fx: float
    fy: float
    cx: float
    cy: float


@dataclass(frozen=True)
class SeedModel:
    cameras_txt: str
    images_txt: str
    points3D_txt: str


# ── rotation ↔ quaternion (COLMAP Hamilton, scalar-first) ────────────────────


def qvec_to_rotmat(qvec: Sequence[float]) -> np.ndarray:
    """(qw, qx, qy, qz) → 3×3 rotation. COLMAP's own convention."""
    w, x, y, z = (float(v) for v in qvec)
    n = np.sqrt(w * w + x * x + y * y + z * z)
    if n == 0.0:
        return np.eye(3)
    w, x, y, z = w / n, x / n, y / n, z / n
    return np.array(
        [
            [1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
            [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
            [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)],
        ]
    )


def rotmat_to_qvec(rot: np.ndarray) -> tuple[float, float, float, float]:
    """3×3 rotation → (qw, qx, qy, qz), normalised, scalar-first.

    Shepperd's method — pick the largest diagonal branch so the divisor is never
    near zero. The sign is canonicalised to `qw >= 0`; the tests still compare
    rotation matrices, because `q` and `−q` are the same rotation.
    """
    r = np.asarray(rot, dtype=float)
    trace = r[0, 0] + r[1, 1] + r[2, 2]
    if trace > 0.0:
        s = np.sqrt(trace + 1.0) * 2.0
        w = 0.25 * s
        x = (r[2, 1] - r[1, 2]) / s
        y = (r[0, 2] - r[2, 0]) / s
        z = (r[1, 0] - r[0, 1]) / s
    elif r[0, 0] > r[1, 1] and r[0, 0] > r[2, 2]:
        s = np.sqrt(1.0 + r[0, 0] - r[1, 1] - r[2, 2]) * 2.0
        w = (r[2, 1] - r[1, 2]) / s
        x = 0.25 * s
        y = (r[0, 1] + r[1, 0]) / s
        z = (r[0, 2] + r[2, 0]) / s
    elif r[1, 1] > r[2, 2]:
        s = np.sqrt(1.0 + r[1, 1] - r[0, 0] - r[2, 2]) * 2.0
        w = (r[0, 2] - r[2, 0]) / s
        x = (r[0, 1] + r[1, 0]) / s
        y = 0.25 * s
        z = (r[1, 2] + r[2, 1]) / s
    else:
        s = np.sqrt(1.0 + r[2, 2] - r[0, 0] - r[1, 1]) * 2.0
        w = (r[1, 0] - r[0, 1]) / s
        x = (r[0, 2] + r[2, 0]) / s
        y = (r[1, 2] + r[2, 1]) / s
        z = 0.25 * s
    q = np.array([w, x, y, z], dtype=float)
    q /= np.linalg.norm(q)
    if q[0] < 0.0:
        q = -q
    return (float(q[0]), float(q[1]), float(q[2]), float(q[3]))


# ── the frame conversion ─────────────────────────────────────────────────────


def frame_to_colmap(transform_matrix: Sequence[Sequence[float]]) -> tuple[
    tuple[float, float, float, float], tuple[float, float, float]
]:
    """nerfstudio `transform_matrix` (camera-to-world, OpenGL) → COLMAP
    world-to-camera `(qvec, tvec)` in the OpenCV camera convention.

    See the module docstring: right-multiply by the Y/Z flip, then invert the
    rigid transform.
    """
    c2w = np.asarray(transform_matrix, dtype=float).reshape(4, 4)
    r_gl = c2w[:3, :3]
    c_world = c2w[:3, 3]
    r_cv = r_gl @ OPENGL_TO_OPENCV_CAMERA  # camera-to-world, OpenCV basis
    r_w2c = r_cv.T
    tvec = -r_w2c @ c_world
    qvec = rotmat_to_qvec(r_w2c)
    return qvec, (float(tvec[0]), float(tvec[1]), float(tvec[2]))


def colmap_pose_to_frame(
    qvec: Sequence[float], tvec: Sequence[float]
) -> list[list[float]]:
    """COLMAP world-to-camera `(qvec, tvec)` → nerfstudio `transform_matrix`
    (camera-to-world, OpenGL, 4×4). Exact inverse of `frame_to_colmap`."""
    r_w2c = qvec_to_rotmat(qvec)
    t = np.asarray(tvec, dtype=float)
    r_cv = r_w2c.T
    c_world = -r_cv @ t
    r_gl = r_cv @ OPENGL_TO_OPENCV_CAMERA  # undo the flip (M is its own inverse)
    out = np.eye(4)
    out[:3, :3] = r_gl
    out[:3, 3] = c_world
    return [[float(v) for v in row] for row in out]


# ── the seed model (cameras.txt + images.txt) ────────────────────────────────


def _seed_cameras_txt(cameras: Sequence[ColmapCamera]) -> str:
    lines = [
        "# Camera list with one line of data per camera:",
        "#   CAMERA_ID, MODEL, WIDTH, HEIGHT, PARAMS[]",
        f"# Number of cameras: {len(cameras)}",
    ]
    for cam in cameras:
        lines.append(
            f"{cam.camera_id} PINHOLE {int(cam.width)} {int(cam.height)} "
            f"{cam.fx!r} {cam.fy!r} {cam.cx!r} {cam.cy!r}"
        )
    return "\n".join(lines) + "\n"


def _seed_images_txt(images: Sequence[ColmapImage]) -> str:
    lines = [
        "# Image list with two lines of data per image:",
        "#   IMAGE_ID, QW, QX, QY, QZ, TX, TY, TZ, CAMERA_ID, NAME",
        "#   POINTS2D[] as (X, Y, POINT3D_ID)",
        f"# Number of images: {len(images)}, mean observations per image: 0",
    ]
    for img in images:
        qw, qx, qy, qz = img.qvec
        tx, ty, tz = img.tvec
        lines.append(
            f"{img.image_id} {qw!r} {qx!r} {qy!r} {qz!r} "
            f"{tx!r} {ty!r} {tz!r} {img.camera_id} {img.name}"
        )
        # The mandatory (empty) second line — a seed carries no 2-D observations;
        # point_triangulator fills them in from the database's matches.
        lines.append("")
    return "\n".join(lines) + "\n"


def build_seed_model(frames: Sequence[FrameLike]) -> SeedModel:
    """A COLMAP text model that carries the nerfstudio poses unchanged.

    `frames` carry ids from the COLMAP database (so the model and the database
    agree) and the device's own per-frame intrinsics (not COLMAP's guess).
    `points3D.txt` is empty: the triangulator writes the points.
    """
    cameras: list[ColmapCamera] = []
    images: list[ColmapImage] = []
    for f in frames:
        qvec, tvec = frame_to_colmap(f.transform_matrix)
        cameras.append(
            ColmapCamera(f.camera_id, f.width, f.height, f.fx, f.fy, f.cx, f.cy)
        )
        images.append(ColmapImage(f.image_id, f.camera_id, f.name, qvec, tvec))
    return SeedModel(
        cameras_txt=_seed_cameras_txt(cameras),
        images_txt=_seed_images_txt(images),
        points3D_txt="",
    )


# ── parsing COLMAP text output ───────────────────────────────────────────────


def _data_lines(text: str) -> Iterable[list[str]]:
    for raw in text.splitlines():
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        yield line.split()


def parse_cameras_txt(text: str) -> dict[int, ColmapCamera]:
    """cameras.txt → {camera_id: ColmapCamera}. PINHOLE and SIMPLE_PINHOLE are
    read exactly; any distortion model keeps focal/principal and drops the rest,
    because this path consumes the poses and the intrinsics are provenance."""
    out: dict[int, ColmapCamera] = {}
    for parts in _data_lines(text):
        camera_id = int(parts[0])
        model = parts[1]
        width, height = int(parts[2]), int(parts[3])
        p = [float(v) for v in parts[4:]]
        if model == "PINHOLE" and len(p) >= 4:
            fx, fy, cx, cy = p[0], p[1], p[2], p[3]
        elif model in ("SIMPLE_PINHOLE", "SIMPLE_RADIAL") and len(p) >= 3:
            fx, fy, cx, cy = p[0], p[0], p[1], p[2]
        else:
            fx = p[0]
            fy = p[1] if len(p) >= 4 else p[0]
            cx = p[2] if len(p) >= 4 else p[1]
            cy = p[3] if len(p) >= 4 else p[2]
        out[camera_id] = ColmapCamera(camera_id, width, height, fx, fy, cx, cy)
    return out


def parse_images_txt(text: str) -> list[ColmapImage]:
    """images.txt → ordered ColmapImage list.

    COLMAP writes two data lines per image: a pose line, then a (possibly empty)
    2-D-points line. Comments are stripped first, then every OTHER remaining line
    is a pose line. A blank points line survives as an empty entry, so the
    stride stays correct even when no points were observed.
    """
    data_lines = [raw for raw in text.splitlines() if not raw.strip().startswith("#")]
    # Drop a leading run of blank lines that are not part of the alternation.
    while data_lines and not data_lines[0].strip():
        data_lines.pop(0)
    images: list[ColmapImage] = []
    for i in range(0, len(data_lines), 2):
        parts = data_lines[i].split()
        if len(parts) < 10:
            continue
        image_id = int(parts[0])
        qvec = (float(parts[1]), float(parts[2]), float(parts[3]), float(parts[4]))
        tvec = (float(parts[5]), float(parts[6]), float(parts[7]))
        camera_id = int(parts[8])
        name = parts[9]
        images.append(ColmapImage(image_id, camera_id, name, qvec, tvec))
    return images


def parse_points3D_txt(text: str) -> list[ColmapPoint]:
    """points3D.txt → ColmapPoint list, in COLMAP world coords (== nerfstudio
    world under this module's frame choice)."""
    out: list[ColmapPoint] = []
    for parts in _data_lines(text):
        if len(parts) < 7:
            continue
        xyz = (float(parts[1]), float(parts[2]), float(parts[3]))
        rgb = (int(parts[4]), int(parts[5]), int(parts[6]))
        error = float(parts[7]) if len(parts) > 7 else 0.0
        # TRACK[] is (IMAGE_ID, POINT2D_IDX) pairs from column 8 on.
        track_length = max(0, (len(parts) - 8) // 2)
        out.append(ColmapPoint(xyz, rgb, error, track_length))
    return out


# ── outputs the job consumes ─────────────────────────────────────────────────


def points_to_ply(points: Sequence[ColmapPoint]) -> bytes:
    """Triangulated points → the same binary-little-endian PLY splatfacto reads
    for the parametric seed (`core/seed_points.encode_ply`). No change of basis:
    COLMAP's world is nerfstudio's world here."""
    n = len(points)
    xyz = np.empty((n, 3), dtype=np.float64)
    rgb = np.empty((n, 3), dtype=np.uint8)
    for i, p in enumerate(points):
        xyz[i] = p.xyz
        rgb[i] = np.clip(p.rgb, 0, 255)
    return encode_ply(SeedCloud(xyz, rgb))


def colmap_frames_from_images(
    images: Sequence[ColmapImage],
) -> dict[str, list[list[float]]]:
    """{image name: nerfstudio transform_matrix} for the (BA-)refined poses, so
    the job can rewrite `transforms.json` when bundle adjustment moved them."""
    return {img.name: colmap_pose_to_frame(img.qvec, img.tvec) for img in images}
