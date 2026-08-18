"""The `renders` camera plan. Pure: bbox in, camera list out. No bpy.

Frame of reference: BLENDER WORLD, which is Z-UP. glTF is Y-up, and Blender's
glTF importer converts on import (`bpy.ops.import_scene.gltf` applies the
Y-up→Z-up change of basis by default), so the bounding box `blender_ops`
measures — and therefore everything here — is already Z-up. "Eye height" is
along +Z, and the horizontal plane is XY.

Determinism is a requirement, not a nicety: the render set is an artifact
registered in `media_objects`, and a room re-rendered from the same GLB must
produce the same shots in the same order, or the "same bytes" question stops
having an answer. So every number below is derived from the bbox alone — no
randomness, no scene sampling, no time.

Shot set (DELIVERY-PLAN W2: "four corner perspectives, one top-down, a short
turntable strip"):

  corner_ne / corner_nw / corner_sw / corner_se   perspective, eye height, → centroid
  top_down                                        orthographic, straight down
  turntable_000 … turntable_023                   perspective ring, 15° apart
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Sequence

__all__ = [
    "BboxError",
    "Bbox",
    "CameraShot",
    "EYE_HEIGHT_M",
    "TURNTABLE_FRAMES",
    "RENDER_WIDTH",
    "RENDER_HEIGHT",
    "plan_cameras",
]

#: Standing eye height, metres above the model's floor plane (its bbox min Z).
EYE_HEIGHT_M = 1.5
#: A 24-frame ring is 15° per step — a whole turn that loops seamlessly.
TURNTABLE_FRAMES = 24
#: How far outside each bbox corner the camera stands, as a multiple of the
#: corner's own offset from the centroid. 1.0 would put the lens exactly on the
#: wall it is meant to be looking past.
CORNER_STANDOFF = 1.35
#: Ring radius as a multiple of the room's horizontal half-diagonal.
TURNTABLE_STANDOFF = 1.6
#: Ortho frame padding for the top-down plate.
TOP_DOWN_PADDING = 1.1
#: Metres above the model's top the top-down camera sits. Orthographic, so this
#: changes nothing about framing — it only has to clear the geometry.
TOP_DOWN_CLEARANCE_M = 2.0

#: A wide-ish interior lens on a 36 mm sensor. Wider than this and the corner
#: shots start reading as a fisheye estate-agent photo.
FOCAL_MM = 24.0
SENSOR_MM = 36.0

RENDER_WIDTH = 1280
RENDER_HEIGHT = 960

#: Degenerate-axis floor. A perfectly flat model (a single plane) would give a
#: zero radius and put every camera inside the geometry.
_MIN_EXTENT_M = 0.5


class BboxError(ValueError):
    """The GLB's bounding box cannot carry a camera plan."""


@dataclass(frozen=True)
class Bbox:
    """An axis-aligned bounding box in Blender world coordinates (Z up)."""

    min: tuple[float, float, float]
    max: tuple[float, float, float]

    @classmethod
    def from_points(cls, lo: Sequence[float], hi: Sequence[float]) -> "Bbox":
        if len(lo) != 3 or len(hi) != 3:
            raise BboxError("bbox needs two 3-vectors")
        lo_t = tuple(float(v) for v in lo)
        hi_t = tuple(float(v) for v in hi)
        if any(not math.isfinite(v) for v in lo_t + hi_t):
            raise BboxError("bbox is not finite")
        if any(h < l for l, h in zip(lo_t, hi_t)):
            raise BboxError("bbox max is below bbox min")
        return cls(lo_t, hi_t)  # type: ignore[arg-type]

    @property
    def centroid(self) -> tuple[float, float, float]:
        return tuple((a + b) / 2.0 for a, b in zip(self.min, self.max))  # type: ignore[return-value]

    @property
    def size(self) -> tuple[float, float, float]:
        return tuple(max(b - a, 0.0) for a, b in zip(self.min, self.max))  # type: ignore[return-value]

    @property
    def floor_z(self) -> float:
        return self.min[2]


@dataclass(frozen=True)
class CameraShot:
    """One deterministic shot. `look_at` is a point, not a rotation — the bpy
    seam turns it into a rotation with `to_track_quat`, so no orientation maths
    lives outside Blender's own conventions."""

    name: str
    kind: str  # "perspective" | "orthographic"
    location: tuple[float, float, float]
    look_at: tuple[float, float, float]
    focal_mm: float | None = None
    sensor_mm: float | None = None
    ortho_scale: float | None = None


def _extent(bbox: Bbox) -> tuple[float, float]:
    sx, sy, _ = bbox.size
    return max(sx, _MIN_EXTENT_M), max(sy, _MIN_EXTENT_M)


def _eye_z(bbox: Bbox) -> float:
    return bbox.floor_z + EYE_HEIGHT_M


def _corner_shots(bbox: Bbox) -> list[CameraShot]:
    cx, cy, _ = bbox.centroid
    sx, sy = _extent(bbox)
    hx, hy = sx / 2.0, sy / 2.0
    eye_z = _eye_z(bbox)
    target = (cx, cy, bbox.centroid[2])
    # +X reads as east, +Y as north. Fixed order — the plan is an artifact list.
    corners = (
        ("corner_ne", 1.0, 1.0),
        ("corner_nw", -1.0, 1.0),
        ("corner_sw", -1.0, -1.0),
        ("corner_se", 1.0, -1.0),
    )
    return [
        CameraShot(
            name=name,
            kind="perspective",
            location=(cx + sign_x * hx * CORNER_STANDOFF, cy + sign_y * hy * CORNER_STANDOFF, eye_z),
            look_at=target,
            focal_mm=FOCAL_MM,
            sensor_mm=SENSOR_MM,
        )
        for name, sign_x, sign_y in corners
    ]


def _top_down_shot(bbox: Bbox) -> CameraShot:
    cx, cy, _ = bbox.centroid
    sx, sy = _extent(bbox)
    z = bbox.max[2] + TOP_DOWN_CLEARANCE_M
    return CameraShot(
        name="top_down",
        kind="orthographic",
        location=(cx, cy, z),
        # Straight down. The look_at sits on the floor plane so the seam's
        # track-to has a non-degenerate direction to work with.
        look_at=(cx, cy, bbox.floor_z),
        # Ortho scale covers the LONGER horizontal axis; the render is 4:3, so
        # framing on the shorter one would crop the room.
        ortho_scale=max(sx, sy) * TOP_DOWN_PADDING,
    )


def _turntable_shots(bbox: Bbox) -> list[CameraShot]:
    cx, cy, _ = bbox.centroid
    sx, sy = _extent(bbox)
    radius = math.hypot(sx / 2.0, sy / 2.0) * TURNTABLE_STANDOFF
    eye_z = _eye_z(bbox)
    target = (cx, cy, bbox.centroid[2])
    shots: list[CameraShot] = []
    for i in range(TURNTABLE_FRAMES):
        theta = 2.0 * math.pi * i / TURNTABLE_FRAMES
        shots.append(
            CameraShot(
                name=f"turntable_{i:03d}",
                kind="perspective",
                location=(cx + radius * math.cos(theta), cy + radius * math.sin(theta), eye_z),
                look_at=target,
                focal_mm=FOCAL_MM,
                sensor_mm=SENSOR_MM,
            )
        )
    return shots


def plan_cameras(bbox: Bbox) -> list[CameraShot]:
    """The full deterministic shot list: 4 corners, 1 top-down, 24 turntable."""
    return [*_corner_shots(bbox), _top_down_shot(bbox), *_turntable_shots(bbox)]
