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

  corner_ne / corner_nw / corner_sw / corner_se   perspective, INSIDE, → far corner
  top_down                                        orthographic, straight down
  turntable_000 … turntable_023                   perspective interior PAN, 15° apart

WHY EVERY PERSPECTIVE CAMERA MOVED INSIDE
─────────────────────────────────────────
This plan used to stand every camera OUTSIDE the bounding box — corners at
1.35× the corner offset, the turntable on a ring at 1.6× the half-diagonal.
That was invisible for as long as the model was `scan.glb`, which on real
captures is a single floor mesh: there was no shell to be outside of. W2 gave
the stage a real room (`core/parametric_scene` builds walls, openings and
objects from `captured_room.json`) and the 28 perspective frames immediately
became photographs of the OUTSIDE of a room — a massing model, not a room
(W2-EVIDENCE.md §10, open item 1).

So the standoffs are gone. Corner cameras stand INSIDE, near each interior
corner, at eye height, looking diagonally across at the opposite corner; the
turntable is an interior PAN, near the room's centre, sweeping outward through
24 headings. The top-down plate is unchanged and still orthographic: a plan
view is the one shot that wants to be outside.

THE ROOM HAS ITS OWN AXES, AND THEY ARE NOT THE WORLD'S
──────────────────────────────────────────────────────
A first cut placed the interior cameras by insetting from the WORLD-aligned
bounding box, and it put two of the four corner cameras flat against a wall on
the real staging capture. That room is a 9.5 × 4.5 m galley yawed about 30° off
the world axes, so its axis-aligned box is 8.2 × 7.5 m — a shape the room does
not have, whose corners are metres outside it. "Inset 0.5 m from the corner of
the box" is only "stand near the corner of the room" when the two agree.

So the interior cameras are planned in `RoomFrame`: the room's own horizontal
orientation, taken from its longest wall, with the extents measured along that.
The plan plate keeps using the world box, because an orthographic camera looking
straight down IS world-aligned — its frame edges run along world X and Y, and
framing that on a rotated extent would crop the room.
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Sequence

__all__ = [
    "BboxError",
    "Bbox",
    "RoomFrame",
    "CameraShot",
    "EYE_HEIGHT_M",
    "TURNTABLE_FRAMES",
    "RENDER_WIDTH",
    "RENDER_HEIGHT",
    "corner_reach",
    "pan_radius",
    "wall_distance",
    "plan_cameras",
]

#: Standing eye height, metres above the model's floor plane (its bbox min Z).
EYE_HEIGHT_M = 1.5
#: A 24-frame ring is 15° per step — a whole turn that loops seamlessly.
TURNTABLE_FRAMES = 24

#: How far in from each bbox face a corner camera stands. Half a metre is about
#: where a person stops before a wall, and it leaves the two walls behind the
#: lens far enough back that a 24 mm frame is not half near-wall.
CORNER_INSET_M = 0.5
#: Floor and ceiling on how far out toward its bbox corner a camera may reach,
#: as a fraction of that axis' half-extent. Both clamps exist for a real room:
#:
#: MAX — the bbox is axis-aligned but the ROOM need not be. A room yawed off the
#: world axes has bbox corners that lie outside its walls, so "inset 0.5 m from
#: the corner of the box" can still be inside a wall. Holding the camera back to
#: 80% of the half-extent keeps it in the room for any yaw a rectangular room
#: can have while still reading as a corner view.
#: MIN — `CORNER_INSET_M` exceeds the half-extent of anything smaller than a
#: 1 m room (and of the degenerate flat bbox), and an unclamped inset would then
#: send the camera through the centre and out the far side.
CORNER_MAX_REACH = 0.8
CORNER_MIN_REACH = 0.25

#: The interior pan's orbit radius, per axis, as a fraction of that axis'
#: half-extent — capped in metres so a large room does not get a large orbit.
#: The pan is nominally "stand in the middle and turn", and a *small* orbit is
#: what keeps that from being 24 renders of the same point: it gives the strip
#: parallax, and in a corridor (where a fixed centre would spend half the frames
#: on a wall an arm's length away) the ellipse automatically lies along the long
#: axis, which is the narrow-room fallback expressed as one continuous rule
#: rather than a branch.
PAN_ORBIT_FRACTION = 0.25
PAN_ORBIT_MAX_M = 1.0
#: Height above the floor plane of the point the pan looks at. Below eye height,
#: so each frame tilts down far enough to carry floor and objects rather than
#: levelling off at the wall/void seam — and because the drop is fixed while the
#: distance to the target is the room's own half-diagonal, a big room tilts down
#: less than a small one, which is what a person does.
PAN_TARGET_HEIGHT_M = 0.9

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

#: Degenerate-axis floor. A perfectly flat model (a single plane) has a zero
#: half-extent on some axis, which would collapse every reach and radius below
#: to zero and leave a camera sitting on its own look-at point — a direction of
#: length zero, which `to_track_quat` cannot turn into a rotation.
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
class RoomFrame:
    """The room as the interior cameras need it: its world bounding box, plus
    its OWN horizontal orientation and the extents measured along that.

    `yaw` is the direction of the room's long axis in world XY. `center_xy` and
    `half_xy` describe the footprint in the frame rotated by that yaw, so
    `half_xy[0]` is half the room's length along its own walls — not along
    world X. Vertical stays with the bbox: rooms are plumb.
    """

    bbox: Bbox
    yaw: float
    center_xy: tuple[float, float]
    half_xy: tuple[float, float]

    @classmethod
    def from_bbox(cls, bbox: Bbox) -> "RoomFrame":
        """The world-aligned reading — correct when the orientation is unknown,
        and exactly what this module did before it had one."""
        cx, cy, _ = bbox.centroid
        sx, sy, _ = bbox.size
        return cls(bbox=bbox, yaw=0.0, center_xy=(cx, cy), half_xy=(sx / 2.0, sy / 2.0))

    @classmethod
    def oriented(
        cls, bbox: Bbox, yaw: float, footprint: Sequence[tuple[float, float]]
    ) -> "RoomFrame":
        """Measure `footprint` — the room's plan corners in world XY — in the
        frame rotated by `yaw`. Falls back to the world reading for an empty
        footprint rather than inventing extents from nothing."""
        if not footprint or not math.isfinite(yaw):
            return cls.from_bbox(bbox)
        cos_y, sin_y = math.cos(yaw), math.sin(yaw)
        us = [x * cos_y + y * sin_y for x, y in footprint]
        vs = [-x * sin_y + y * cos_y for x, y in footprint]
        cu, cv = (min(us) + max(us)) / 2.0, (min(vs) + max(vs)) / 2.0
        return cls(
            bbox=bbox,
            yaw=yaw,
            # Back into world XY, so callers never have to un-rotate a centre.
            center_xy=(cu * cos_y - cv * sin_y, cu * sin_y + cv * cos_y),
            half_xy=((max(us) - min(us)) / 2.0, (max(vs) - min(vs)) / 2.0),
        )

    @property
    def axes(self) -> tuple[tuple[float, float], tuple[float, float]]:
        """The room's own horizontal basis, in world XY."""
        cos_y, sin_y = math.cos(self.yaw), math.sin(self.yaw)
        return (cos_y, sin_y), (-sin_y, cos_y)

    def point(self, u: float, v: float, z: float) -> tuple[float, float, float]:
        """A world point from room-frame offsets off the footprint centre."""
        (ux, uy), (vx, vy) = self.axes
        return (
            self.center_xy[0] + u * ux + v * vx,
            self.center_xy[1] + u * uy + v * vy,
            z,
        )


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


def _half(frame: RoomFrame) -> tuple[float, float]:
    """The room's own half-extents, floored — see `_MIN_EXTENT_M`."""
    hu, hv = frame.half_xy
    return max(hu, _MIN_EXTENT_M / 2.0), max(hv, _MIN_EXTENT_M / 2.0)


def _eye_z(bbox: Bbox) -> float:
    return bbox.floor_z + EYE_HEIGHT_M


def corner_reach(half_extent: float) -> float:
    """How far from the room centre, along one axis, a corner camera stands.

    One expression, both clamps: inset `CORNER_INSET_M` from the bbox face, held
    inside `[CORNER_MIN_REACH, CORNER_MAX_REACH]` of the half-extent. See those
    constants for why each bound is a real room and not defensive padding.
    """
    return min(
        max(half_extent - CORNER_INSET_M, half_extent * CORNER_MIN_REACH),
        half_extent * CORNER_MAX_REACH,
    )


#: The four corner stations, as signs on the room's own axes. Fixed order — the
#: plan is an artifact list, and these names become object keys. In a yawed room
#: they label the ROOM's quadrants, not the world's compass.
_CORNERS = (
    ("corner_ne", 1.0, 1.0),
    ("corner_nw", -1.0, 1.0),
    ("corner_sw", -1.0, -1.0),
    ("corner_se", 1.0, -1.0),
)


def _corner_shots(frame: RoomFrame) -> list[CameraShot]:
    hu, hv = _half(frame)
    ru, rv = corner_reach(hu), corner_reach(hv)
    eye_z = _eye_z(frame.bbox)
    # Mid-height of the room, at the DIAGONALLY OPPOSITE camera station. Aiming
    # at the centroid instead would waste half of every frame on the near floor;
    # aiming across the full diagonal is what makes the shot read as the length
    # of the room.
    mid_z = frame.bbox.centroid[2]
    return [
        CameraShot(
            name=name,
            kind="perspective",
            location=frame.point(sign_u * ru, sign_v * rv, eye_z),
            look_at=frame.point(-sign_u * ru, -sign_v * rv, mid_z),
            focal_mm=FOCAL_MM,
            sensor_mm=SENSOR_MM,
        )
        for name, sign_u, sign_v in _CORNERS
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
        # Blender maps `ortho_scale` onto the LARGER render dimension — here the
        # 1280 px width — so the visible HEIGHT is only `ortho_scale * H / W`.
        # `max(sx, sy)` therefore crops every room deeper than three quarters of
        # its width: the first real staging render (8.23 m × 7.51 m) framed at
        # 9.05 m and lost ~10% of the floor off the top and bottom of the cover
        # plate. The depth has to be converted into width units before the two
        # axes can be compared at all.
        #
        # The camera looks straight down under `to_track_quat("-Z", "Y")`, which
        # puts world +X along the image width and world +Y along its height, so
        # sx is the width axis and sy the height axis — not interchangeable.
        #
        # This survived a golden case because the fixture room is 4 m × 3 m:
        # its 0.75 aspect is exactly the render's, the one shape for which the
        # old expression is right.
        ortho_scale=max(sx, sy * (RENDER_WIDTH / RENDER_HEIGHT)) * TOP_DOWN_PADDING,
    )


def pan_radius(half_extent: float) -> float:
    """The interior pan's orbit radius along one axis."""
    return min(half_extent * PAN_ORBIT_FRACTION, PAN_ORBIT_MAX_M)


def wall_distance(half_u: float, half_v: float, cos_t: float, sin_t: float) -> float:
    """Distance from the room centre to the wall along one heading — the ray/
    rectangle intersection in the room's own frame.

    This is what fixes the pan's tilt. A single radius for every heading (the
    half-diagonal) puts the aim point past the near wall when the pan looks
    ACROSS a galley: the frame then centres a metre and a quarter up a wall
    1.8 m away and the floor falls off the bottom edge. Landing the target on
    whichever wall is actually there makes the tilt steepen as the wall comes
    closer, which is what a person does, and keeps floor in every frame.
    """
    du = half_u / abs(cos_t) if abs(cos_t) > 1e-12 else math.inf
    dv = half_v / abs(sin_t) if abs(sin_t) > 1e-12 else math.inf
    return min(du, dv)


def _turntable_shots(frame: RoomFrame) -> list[CameraShot]:
    hu, hv = _half(frame)
    orbit_u, orbit_v = pan_radius(hu), pan_radius(hv)
    eye_z = _eye_z(frame.bbox)
    target_z = frame.bbox.floor_z + PAN_TARGET_HEIGHT_M
    shots: list[CameraShot] = []
    for i in range(TURNTABLE_FRAMES):
        theta = 2.0 * math.pi * i / TURNTABLE_FRAMES
        cos_t, sin_t = math.cos(theta), math.sin(theta)
        reach = wall_distance(hu, hv, cos_t, sin_t)
        shots.append(
            CameraShot(
                name=f"turntable_{i:03d}",
                kind="perspective",
                # The camera steps AWAY from the heading it is shooting: standing
                # back from the wall in frame is the whole value of the orbit,
                # and displacing toward it would instead crop the frame down.
                location=frame.point(-orbit_u * cos_t, -orbit_v * sin_t, eye_z),
                look_at=frame.point(reach * cos_t, reach * sin_t, target_z),
                focal_mm=FOCAL_MM,
                sensor_mm=SENSOR_MM,
            )
        )
    return shots


def plan_cameras(frame: RoomFrame | Bbox) -> list[CameraShot]:
    """The full deterministic shot list: 4 interior corners, 1 top-down plate,
    24 interior pan frames.

    A bare `Bbox` is accepted and read as the world-aligned frame — that is the
    honest reading when nothing knows the room's orientation, and it keeps the
    degenerate and no-wall cases from needing a caller-side branch.
    """
    if isinstance(frame, Bbox):
        frame = RoomFrame.from_bbox(frame)
    return [
        *_corner_shots(frame),
        _top_down_shot(frame.bbox),
        *_turntable_shots(frame),
    ]
