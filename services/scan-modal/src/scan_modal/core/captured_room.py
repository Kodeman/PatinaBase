"""CapturedRoom (RoomPlan JSONEncoder output) → parametric RoomModel in MODEL
SPACE (metres, ARKit Y-up world frame). Pure, no IO.

DUPLICATION, DELIBERATE. This is an import-copy of the parsing conventions in
`services/scan-pipeline/src/patina_scan_worker/stages/captured_room.py` — the
same transform reading (column-major 4×4: translation = t[12..14], wall local +x
basis = t[0..2], length running ±dimensions[0]/2 along that basis) and the same
degrade-don't-throw posture. Only the fields `verify` consumes are carried
across: walls (endpoints, height, base) and the floor-derived extents. Modal and
the systemd CPU box are separately deployed runtimes with separate images, so a
package dependency between them would couple two deploy targets to buy ~120
lines. If the source file's conventions change, this file changes with it.

Fields deliberately NOT copied: θ alignment, openings, thickness, per-wall local
polygon outlines, feet conversion — `verify` measures wall spans and planarity
against extracted planes and needs none of them.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field
from typing import Any


@dataclass
class WallDim:
    apple_id: str | None
    length_m: float
    height_m: float
    a_xz: tuple[float, float]  # world endpoint A (x,z) metres
    b_xz: tuple[float, float]  # world endpoint B (x,z) metres
    base_y_m: float            # wall bottom in world y (metres)


@dataclass
class RoomModel:
    walls: list[WallDim] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)


def _num(v: Any) -> float:
    return float(v) if isinstance(v, (int, float)) and math.isfinite(v) else math.nan


def _as_list(v: Any) -> list:
    return v if isinstance(v, list) else []


def _dims(v: dict) -> list[float]:
    return [_num(x) for x in _as_list(v.get("dimensions"))]


def _transform(v: dict) -> list[float]:
    return [_num(x) for x in _as_list(v.get("transform"))]


def _identifier(v: dict) -> str | None:
    i = v.get("identifier")
    return i if isinstance(i, str) else None


def parse_captured_room_meters(json: Any) -> RoomModel:
    """Parse a CapturedRoom document into the wall set `verify` compares against.

    Nothing throws on malformed input — bad rows degrade out with a warning.
    """
    rm = RoomModel()
    if not isinstance(json, dict):
        rm.warnings.append("captured_room is not an object")
        return rm

    raw_walls = [w for w in _as_list(json.get("walls")) if isinstance(w, dict)]
    if not raw_walls:
        rm.warnings.append("no walls present; model is degenerate")
        return rm

    for w in raw_walls:
        d = _dims(w)
        t = _transform(w)
        if len(d) < 1 or len(t) < 15:
            rm.warnings.append(f"wall {_identifier(w)} unusable dims/transform; skipped")
            continue
        dx = d[0]
        tx, ty, tz = t[12], t[13], t[14]
        hx, hz = t[0], t[2]  # wall local +x basis, XZ components
        # `ty` is deliberately NOT in this guard — it matches the reference
        # parser, which keeps a wall with a non-finite vertical translation and
        # degrades `base_y_m` to NaN. `verify` drops such a wall at
        # `_wall_frame` anyway (it needs a finite base to band points against),
        # but it drops it as an UNMATCHED WALL with a warning, which is a
        # reported gap. Skipping it here instead made the wall vanish from the
        # model entirely, so the room silently verified as having fewer walls
        # than it has.
        if not all(math.isfinite(v) for v in (dx, tx, tz, hx, hz)):
            rm.warnings.append(f"wall {_identifier(w)} non-finite; skipped")
            continue
        half = dx / 2.0
        height = d[1] if len(d) > 1 and math.isfinite(d[1]) else math.nan
        base_y = (ty - height / 2.0) if (math.isfinite(ty) and math.isfinite(height)) else math.nan
        rm.walls.append(
            WallDim(
                apple_id=_identifier(w),
                length_m=abs(dx),
                height_m=height,
                a_xz=(tx + half * hx, tz + half * hz),
                b_xz=(tx - half * hx, tz - half * hz),
                base_y_m=base_y,
            )
        )

    if not rm.walls:
        rm.warnings.append("no usable wall transforms")
    return rm
