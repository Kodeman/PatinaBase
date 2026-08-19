"""CapturedRoom → a schematic box scene in BLENDER WORLD (Z-up). Pure, no bpy, no IO.

WHY THIS EXISTS. `renders` built its scene from `scan.glb` alone. On real
captures that GLB is floor-only — one `Floor0` mesh, ~1 KB — so all 29 Cycles
frames came back a bare white slab on grey. The room itself (four walls, two
windows, a door, an opening, twenty objects) only ever existed in
`captured_room.json`, which the stage never opened. This module turns that
document into geometry, which demotes the GLB to something merged ON TOP of a
room rather than the room's only source.

FRAME. captured_room is ARKit: metres, Y up. Blender world is Z up, and
`core/cameras.py` plans against Blender world. The mapping used here is the one
Blender's own glTF importer applies:

    (x, y, z)_arkit  ->  (x, -z, y)_blender

Matching it is load-bearing, not cosmetic: `blender_ops.merge_glb` drops an
imported GLB into this same scene, and if the two conventions disagreed the
parametric room and the scanned floor would land at right angles to each other.

TRANSFORMS. The same reading as `core/captured_room.py`, which is authoritative:
column-major flat-16, translation at t[12..14], local +x at t[0..2], +y at
t[4..6], +z at t[8..10]; `dimensions` is [x, y, z] in that LOCAL frame. What is
NOT constant across element kinds is which local axis points up. A wall's local
+y is world up, so its dimensions read [length, height, thickness]; a floor's
local +z is world up, so its dimensions[1] is a horizontal depth and reading it
as a height would stand the floor on end, eight metres tall. The vertical axis is
therefore resolved per element from the transform, and the other two become the
footprint. For a wall that reduces exactly to [length, height, thickness].

RoomPlan reports zero for the third dimension of every surface — walls, windows,
doors, openings and floors all arrive with `dimensions[2] == 0` — so the
thickness constants below are what gives them a body at all, not a rare fallback.

SHAPE. Every element becomes a box yawed about world +Z. RoomPlan gives walls and
openings a plumb vertical, so yaw is the only rotation a schematic needs, and a
yaw-only box is something the bpy seam can build from a scaled cube with no
matrix work of its own.

DEGRADE, DON'T THROW. The posture of `core/captured_room.py`: a malformed element
drops out with a warning, a document with no walls still yields whatever else it
has, and a garbage document yields an empty spec. Nothing here raises — the
caller reads `SceneSpec.is_empty` and decides.

ORDER IS FIXED: walls, floor, windows, doors, openings, objects, each in document
order. The render set is an artifact registered in `media_objects`, so the same
document has to produce the same scene.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field, replace
from typing import Any, Iterable, Iterator

from .cameras import Bbox

__all__ = [
    "Box",
    "SceneSpec",
    "build_scene_spec",
    "MATERIALS",
    "WALL_THICKNESS_M",
    "FLOOR_THICKNESS_M",
    "OPENING_DEPTH_M",
    "OPENING_INSET_M",
]

#: Wall body, used whenever the capture reports no third dimension (it always
#: does). Interior stud wall, near enough for a schematic.
WALL_THICKNESS_M = 0.10
#: Floor slab. Thin, because it hangs BELOW the floor plane and every camera
#: eye height is measured from the bbox floor.
FLOOR_THICKNESS_M = 0.05
#: Window/door/opening body. Deliberately thicker than a wall so the panel
#: stands ~2 cm proud of each wall face instead of z-fighting with it.
OPENING_DEPTH_M = 0.14
#: How far the panel is drawn in from the reported opening on its two face axes,
#: leaving a band of wall around it that reads as a reveal.
OPENING_INSET_M = 0.05
#: Materials are names only — the palette lives in `blender_ops`.
MATERIALS = ("wall", "floor", "window", "door", "opening", "object")

#: Nothing may be born zero-sized; a zero scale collapses a Blender cube.
_MIN_EXTENT_M = 0.01
_EPS = 1e-9

#: (document key, box kind, material) for the three surface kinds that share the
#: wall-panel treatment. Emitted in this order.
_OPENING_KINDS = (
    ("windows", "window", "window"),
    ("doors", "door", "door"),
    ("openings", "opening", "opening"),
)


@dataclass(frozen=True)
class Box:
    """One oriented box, in Blender world metres. `rotation_z` is yaw in radians
    about world +Z, the only rotation a plumb schematic needs."""

    name: str
    kind: str
    center: tuple[float, float, float]
    size: tuple[float, float, float]
    rotation_z: float
    material: str


@dataclass
class SceneSpec:
    """The whole schematic room. `bbox` is the axis-aligned extent of every box,
    ready for `plan_cameras`; on an empty spec it degenerates to a point, which
    is why `is_empty` and not the bbox is the emptiness test."""

    boxes: list[Box] = field(default_factory=list)
    bbox: Bbox = field(default_factory=lambda: Bbox.from_points((0.0, 0.0, 0.0), (0.0, 0.0, 0.0)))
    warnings: list[str] = field(default_factory=list)

    @property
    def is_empty(self) -> bool:
        return not self.boxes

    def count(self, kind: str) -> int:
        return sum(1 for b in self.boxes if b.kind == kind)

    @property
    def summary(self) -> dict[str, int]:
        out: dict[str, int] = {}
        for box in self.boxes:
            out[box.kind] = out.get(box.kind, 0) + 1
        return out


# ── document reading (mirrors core/captured_room.py) ─────────────────────────


def _num(v: Any) -> float:
    return float(v) if isinstance(v, (int, float)) and math.isfinite(v) else math.nan


def _as_list(v: Any) -> list:
    return v if isinstance(v, list) else []


def _elements(doc: dict, key: str) -> list[dict]:
    return [e for e in _as_list(doc.get(key)) if isinstance(e, dict)]


def _transform(el: dict) -> list[float]:
    return [_num(x) for x in _as_list(el.get("transform"))]


def _dimensions(el: dict) -> list[float]:
    dims = [_num(x) for x in _as_list(el.get("dimensions"))]
    dims += [0.0] * 3
    return [d if math.isfinite(d) and d > 0.0 else 0.0 for d in dims[:3]]


def _category(el: dict) -> str | None:
    """RoomPlan encodes the category enum as a single-key object: {"sink": {}}."""
    c = el.get("category")
    if isinstance(c, str):
        return c
    if isinstance(c, dict):
        return next((k for k in c if isinstance(k, str)), None)
    return None


def _label(el: dict, kind: str, index: int) -> str:
    category = _category(el)
    stem = f"{kind}_{index:02d}"
    return f"{stem}_{category}" if category and category != kind else stem


# ── geometry ────────────────────────────────────────────────────────────────


def _to_blender(v: tuple[float, float, float]) -> tuple[float, float, float]:
    x, y, z = v
    return (x, -z, y)


def _extent(value: float, fill: float) -> float:
    return max(value if value > 0.0 else fill, _MIN_EXTENT_M)


def _element_box(
    el: dict,
    *,
    name: str,
    kind: str,
    material: str,
    fill_m: float,
    inset_m: float = 0.0,
) -> Box | None:
    t = _transform(el)
    if len(t) < 15:
        return None
    used = t[0:3] + t[4:7] + t[8:11] + t[12:15]
    if not all(math.isfinite(v) for v in used):
        return None

    bases = [_to_blender((t[i], t[i + 1], t[i + 2])) for i in (0, 4, 8)]
    if any(math.hypot(*b) < _EPS for b in bases):
        return None

    dims = _dimensions(el)
    # Two real extents is the floor of usability: a wall needs a length and a
    # height, a floor two horizontal spans. One or none means the element would
    # be built entirely out of default thickness — a 10 cm cube standing in for
    # a wall, which is worse than the gap it fills.
    if sum(1 for d in dims if d > 0.0) < 2:
        return None

    up = max(range(3), key=lambda i: abs(bases[i][2]))
    run, cross = (i for i in range(3) if i != up)
    u = bases[run]
    yaw = math.atan2(u[1], u[0]) if math.hypot(u[0], u[1]) > _EPS else 0.0
    size = [
        _extent(dims[run], fill_m),
        _extent(dims[cross], fill_m),
        _extent(dims[up], fill_m),
    ]

    if inset_m > 0.0:
        # Draw in the two FACE axes and leave the depth alone — which of the
        # three is the depth follows from the geometry, not from the element
        # kind, so it is the thinnest one.
        thin = min(range(3), key=lambda i: size[i])
        size = [
            s if i == thin else max(s - 2.0 * inset_m, _MIN_EXTENT_M)
            for i, s in enumerate(size)
        ]

    return Box(
        name=name,
        kind=kind,
        center=_to_blender((t[12], t[13], t[14])),
        size=(size[0], size[1], size[2]),
        rotation_z=yaw,
        material=material,
    )


def _corners(box: Box) -> Iterator[tuple[float, float, float]]:
    ca, sa = math.cos(box.rotation_z), math.sin(box.rotation_z)
    hx, hy, hz = (s / 2.0 for s in box.size)
    for sx in (-1.0, 1.0):
        for sy in (-1.0, 1.0):
            x, y = sx * hx, sy * hy
            wx = box.center[0] + ca * x - sa * y
            wy = box.center[1] + sa * x + ca * y
            for sz in (-1.0, 1.0):
                yield (wx, wy, box.center[2] + sz * hz)


def _aabb(boxes: Iterable[Box]) -> tuple[list[float], list[float]] | None:
    lo = [math.inf] * 3
    hi = [-math.inf] * 3
    seen = False
    for box in boxes:
        for corner in _corners(box):
            seen = True
            for axis in range(3):
                lo[axis] = min(lo[axis], corner[axis])
                hi[axis] = max(hi[axis], corner[axis])
    return (lo, hi) if seen else None


def _synthetic_floor(walls: list[Box]) -> Box | None:
    """A slab spanning the walls, its TOP on the wall base plane."""
    extent = _aabb(walls)
    if extent is None:
        return None
    lo, hi = extent
    top = min(b.center[2] - b.size[2] / 2.0 for b in walls)
    return Box(
        name="floor_synth",
        kind="floor",
        center=((lo[0] + hi[0]) / 2.0, (lo[1] + hi[1]) / 2.0, top - FLOOR_THICKNESS_M / 2.0),
        size=(
            max(hi[0] - lo[0], _MIN_EXTENT_M),
            max(hi[1] - lo[1], _MIN_EXTENT_M),
            FLOOR_THICKNESS_M,
        ),
        rotation_z=0.0,
        material="floor",
    )


# ── entry point ─────────────────────────────────────────────────────────────


def build_scene_spec(captured_room_json: Any) -> SceneSpec:
    """Build the schematic scene for one CapturedRoom document."""
    spec = SceneSpec()
    if not isinstance(captured_room_json, dict):
        spec.warnings.append("captured_room is not an object")
        return spec
    doc = captured_room_json

    walls: list[Box] = []
    for i, el in enumerate(_elements(doc, "walls")):
        box = _element_box(
            el, name=f"wall_{i:02d}", kind="wall", material="wall", fill_m=WALL_THICKNESS_M
        )
        if box is None:
            spec.warnings.append(f"wall {i} has an unusable transform/dimensions; skipped")
            continue
        walls.append(box)
    if not walls:
        spec.warnings.append("no usable walls; the room has no shell")
    spec.boxes.extend(walls)

    floor: Box | None = None
    for i, el in enumerate(_elements(doc, "floors")):
        box = _element_box(
            el, name=f"floor_{i:02d}", kind="floor", material="floor", fill_m=FLOOR_THICKNESS_M
        )
        if box is None:
            spec.warnings.append(f"floor {i} has an unusable transform/dimensions; skipped")
            continue
        # The floor element's translation IS the floor plane, so the slab hangs
        # below it rather than straddling it.
        floor = replace(box, center=(box.center[0], box.center[1], box.center[2] - box.size[2] / 2.0))
        break
    if floor is None:
        floor = _synthetic_floor(walls)
        if floor is not None:
            spec.warnings.append("no usable floor element; synthesized one from the wall extent")
    if floor is not None:
        spec.boxes.append(floor)
    else:
        spec.warnings.append("no floor")

    for key, kind, material in _OPENING_KINDS:
        for i, el in enumerate(_elements(doc, key)):
            box = _element_box(
                el,
                name=f"{kind}_{i:02d}",
                kind=kind,
                material=material,
                fill_m=OPENING_DEPTH_M,
                inset_m=OPENING_INSET_M,
            )
            if box is None:
                spec.warnings.append(f"{kind} {i} has an unusable transform/dimensions; skipped")
                continue
            spec.boxes.append(box)

    for i, el in enumerate(_elements(doc, "objects")):
        box = _element_box(
            el,
            name=_label(el, "object", i),
            kind="object",
            material="object",
            fill_m=_MIN_EXTENT_M,
        )
        if box is None:
            spec.warnings.append(f"object {i} has an unusable transform/dimensions; skipped")
            continue
        spec.boxes.append(box)

    extent = _aabb(spec.boxes)
    if extent is not None:
        spec.bbox = Bbox.from_points(*extent)
    return spec
