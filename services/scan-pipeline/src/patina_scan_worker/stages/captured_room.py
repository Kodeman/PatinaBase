"""CapturedRoom (RoomPlan JSONEncoder output) → dimension set in MODEL SPACE
(metres, ARKit world frame). Pure, no IO.

Item 10 solves in the SOURCE frame (metres) — NOT the parsed feet-space
room_scan_geometry rows (00337). This mirrors parse-room-scan's endpoint /
θ-alignment / floor-bbox math but stays in metres and extracts only the
dimension set the tolerance model publishes (wall lengths + heights + thickness,
opening widths + heights + sill/head, room width/depth, floor area).

Transform is a column-major 4×4 (16 floats): translation = (t[12],t[13],t[14]);
wall x-basis (local +x) = (t[0],t[1],t[2]); a wall's length runs ±dims[0]/2 along
that basis. Nothing throws on malformed input — bad rows degrade out.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field
from typing import Any

M_TO_FT = 3.28084


@dataclass
class WallDim:
    apple_id: str | None
    length_m: float
    height_m: float
    thickness_m: float | None
    a_xz: tuple[float, float]  # world endpoint A (x,z) metres
    b_xz: tuple[float, float]  # world endpoint B (x,z) metres
    base_y_m: float            # wall bottom in world y (metres)
    # RoomPlan polygonCorners in the wall's LOCAL frame (metres): [(along_x, up_y), …]
    # (iOS 17+). Empty when RoomPlan didn't emit them. A NON-flat top edge here
    # encodes a real sloped-ceiling wall; a flat/empty one falls back to the
    # corner-height synthesize (item-2 M3 revision).
    outline_local: list[tuple[float, float]] = field(default_factory=list)


@dataclass
class OpeningDim:
    apple_id: str | None
    parent_id: str | None
    kind: str                  # 'door' | 'window' | 'opening'
    width_m: float
    height_m: float
    center_y_m: float
    center_x_m: float = 0.0    # world XZ (metres) — for plan placement
    center_z_m: float = 0.0


@dataclass
class RoomModel:
    walls: list[WallDim] = field(default_factory=list)
    openings: list[OpeningDim] = field(default_factory=list)
    width_m: float = 0.0
    depth_m: float = 0.0
    floor_area_m2: float = 0.0
    theta_rad: float = 0.0
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


def _rotate_neg(x: float, z: float, theta: float) -> tuple[float, float]:
    c, s = math.cos(theta), math.sin(theta)
    return (x * c + z * s, -x * s + z * c)


def parse_captured_room_meters(json: Any) -> RoomModel:
    rm = RoomModel()
    if not isinstance(json, dict):
        rm.warnings.append("captured_room is not an object")
        return rm

    raw_walls = [w for w in _as_list(json.get("walls")) if isinstance(w, dict)]
    if not raw_walls:
        rm.warnings.append("no walls present; model is degenerate")
        return rm

    # ── walls: world XZ endpoints + length/height/thickness (metres) ──────────
    headings: list[tuple[float, float]] = []  # (length, heading)
    for w in raw_walls:
        d = _dims(w)
        t = _transform(w)
        if len(d) < 1 or len(t) < 15:
            rm.warnings.append(f"wall {_identifier(w)} unusable dims/transform; skipped")
            continue
        dx = d[0]
        tx, ty, tz = t[12], t[13], t[14]
        hx, hz = t[0], t[2]  # x-basis XZ
        if not all(math.isfinite(v) for v in (dx, tx, tz, hx, hz)):
            rm.warnings.append(f"wall {_identifier(w)} non-finite; skipped")
            continue
        half = dx / 2.0
        height = d[1] if len(d) > 1 and math.isfinite(d[1]) else math.nan
        thickness = d[2] if len(d) > 2 and math.isfinite(d[2]) else None
        base_y = (ty - height / 2.0) if math.isfinite(ty) and math.isfinite(height) else math.nan
        # local-frame polygon outline (drop z; keep along-x + up-y)
        outline: list[tuple[float, float]] = []
        pc = w.get("polygonCorners")
        if isinstance(pc, list):
            for c in pc:
                cc = [_num(v) for v in _as_list(c)]
                if len(cc) >= 2 and math.isfinite(cc[0]) and math.isfinite(cc[1]):
                    outline.append((cc[0], cc[1]))
        rm.walls.append(WallDim(
            apple_id=_identifier(w),
            length_m=abs(dx),
            height_m=height,
            thickness_m=thickness,
            a_xz=(tx + half * hx, tz + half * hz),
            b_xz=(tx - half * hx, tz - half * hz),
            base_y_m=base_y,
            outline_local=outline,
        ))
        headings.append((abs(dx), math.atan2(hz, hx)))

    if not rm.walls:
        rm.warnings.append("no usable wall transforms")
        return rm

    # ── θ = length-weighted circular mean of headings mod 90° ─────────────────
    sum_sin = sum(L * math.sin(4 * h) for L, h in headings)
    sum_cos = sum(L * math.cos(4 * h) for L, h in headings)
    theta = math.atan2(sum_sin, sum_cos) / 4.0
    rm.theta_rad = theta

    # ── openings (doors / windows / openings) ─────────────────────────────────
    for key, kind in (("doors", "door"), ("windows", "window"), ("openings", "opening")):
        for o in _as_list(json.get(key)):
            if not isinstance(o, dict):
                continue
            d = _dims(o)
            t = _transform(o)
            if len(d) < 2:
                continue
            width, height = d[0], d[1]
            cy = t[13] if len(t) > 13 else math.nan
            cx = t[12] if len(t) > 12 else 0.0
            cz = t[14] if len(t) > 14 else 0.0
            if not (math.isfinite(width) and math.isfinite(height)):
                continue
            parent = o.get("parentIdentifier")
            rm.openings.append(OpeningDim(
                apple_id=_identifier(o),
                parent_id=parent if isinstance(parent, str) else None,
                kind=kind,
                width_m=abs(width),
                height_m=abs(height),
                center_y_m=cy,
                center_x_m=cx if math.isfinite(cx) else 0.0,
                center_z_m=cz if math.isfinite(cz) else 0.0,
            ))

    # ── floor polygon (rotated metres) → bbox width/depth + shoelace area ──────
    floor_rot: list[tuple[float, float]] = []
    floors = [f for f in _as_list(json.get("floors")) if isinstance(f, dict)]
    if floors and isinstance(floors[0].get("polygonCorners"), list):
        T = _transform(floors[0])
        if len(T) >= 15:
            for c in floors[0]["polygonCorners"]:
                cc = [_num(x) for x in _as_list(c)]
                if len(cc) < 3:
                    continue
                lx, ly, lz = cc[0], cc[1], cc[2]
                if not (math.isfinite(lx) and math.isfinite(lz)):
                    continue
                wx = T[0] * lx + T[4] * ly + T[8] * lz + T[12]
                wz = T[2] * lx + T[6] * ly + T[10] * lz + T[14]
                if math.isfinite(wx) and math.isfinite(wz):
                    floor_rot.append(_rotate_neg(wx, wz, theta))

    if len(floor_rot) < 3:
        # derive from the wall-endpoint hull (rotated)
        pts: list[tuple[float, float]] = []
        for wall in rm.walls:
            pts.append(_rotate_neg(wall.a_xz[0], wall.a_xz[1], theta))
            pts.append(_rotate_neg(wall.b_xz[0], wall.b_xz[1], theta))
        floor_rot = _convex_hull(pts)

    if floor_rot:
        xs = [p[0] for p in floor_rot]
        zs = [p[1] for p in floor_rot]
        rm.width_m = max(xs) - min(xs)
        rm.depth_m = max(zs) - min(zs)
        rm.floor_area_m2 = _shoelace(floor_rot)
    return rm


def _shoelace(poly: list[tuple[float, float]]) -> float:
    a = 0.0
    n = len(poly)
    for i in range(n):
        x1, z1 = poly[i]
        x2, z2 = poly[(i + 1) % n]
        a += x1 * z2 - x2 * z1
    return abs(a) / 2.0


def _convex_hull(pts: list[tuple[float, float]]) -> list[tuple[float, float]]:
    uniq = sorted(set(pts))
    if len(uniq) <= 2:
        return uniq

    def cross(o, a, b):
        return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])

    lower: list[tuple[float, float]] = []
    for p in uniq:
        while len(lower) >= 2 and cross(lower[-2], lower[-1], p) <= 0:
            lower.pop()
        lower.append(p)
    upper: list[tuple[float, float]] = []
    for p in reversed(uniq):
        while len(upper) >= 2 and cross(upper[-2], upper[-1], p) <= 0:
            upper.pop()
        upper.append(p)
    return lower[:-1] + upper[:-1]
