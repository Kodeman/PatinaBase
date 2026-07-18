"""Drawing intermediate representation + sheet builder. Pure, deterministic.

Turns the solved room (model-space geometry + the measurement rows + the
certificate) into a SheetSet: a dimensioned floor plan + four elevations, each a
list of primitives in a REAL-WORLD FEET, y-up sheet frame. The three renderers
(svg / pdf / dxf) map feet → their own frame, so all three agree by construction.

Escalate-class visual decisions (catalogued for Kody's M3 review) live in the
renderers + units.py; this module owns only geometry + which measurement labels
which edge.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field
from typing import Any

from ..stages.captured_room import M_TO_FT, RoomModel

LAYER_WALLS = "walls"
LAYER_OPENINGS = "openings"
LAYER_DIMS = "dimensions"
LAYER_TEXT = "text"


@dataclass(frozen=True)
class Line:
    x1: float; y1: float; x2: float; y2: float; layer: str = LAYER_WALLS


@dataclass(frozen=True)
class Rect:
    x: float; y: float; w: float; h: float; layer: str = LAYER_OPENINGS


@dataclass(frozen=True)
class Dim:
    # dimension line endpoints (already placed/offset), text + tolerance class.
    x1: float; y1: float; x2: float; y2: float
    text: str; tclass: str; layer: str = LAYER_DIMS


@dataclass(frozen=True)
class Label:
    x: float; y: float; text: str
    size: float = 0.35            # feet (renderer converts)
    anchor: str = "start"          # start | middle | end
    layer: str = LAYER_TEXT


@dataclass
class Sheet:
    id: str
    title: str
    prims: list[Any] = field(default_factory=list)
    w_ft: float = 0.0            # content bbox (feet)
    h_ft: float = 0.0


@dataclass
class SheetMeta:
    project: str
    room: str
    date: str
    unverified: bool
    tolerance_class: str
    anchor_count: int
    floor_area_sqft: float


@dataclass
class SheetSet:
    sheets: list[Sheet]
    meta: SheetMeta


def _rotate_neg(x: float, z: float, theta: float) -> tuple[float, float]:
    c, s = math.cos(theta), math.sin(theta)
    return (x * c + z * s, -x * s + z * c)


def _meas_index(measurements: list[dict[str, Any]]) -> dict[tuple, dict]:
    idx: dict[tuple, dict] = {}
    for m in measurements:
        er = m.get("element_ref") or {}
        idx[(er.get("kind"), er.get("apple_id"), er.get("idx"), er.get("dim"))] = m
    return idx


def _fmt(m: dict | None) -> tuple[str, str]:
    """(badge text, tolerance class) for a measurement, or a placeholder."""
    from .units import badge_text
    if not m:
        return ("—", "estimated")
    return (
        badge_text(m["value_mm"], m.get("tolerance_mm"), m["tolerance_class"]),
        m["tolerance_class"],
    )


def build_sheet_set(
    room: RoomModel,
    measurements: list[dict[str, Any]],
    certificate: dict[str, Any],
    project: str,
    room_name: str,
    date_str: str,
    tolerance_class: str | None = None,
) -> SheetSet:
    scale = float(certificate.get("scale", 1.0))
    mindex = _meas_index(measurements)
    meta = SheetMeta(
        project=project, room=room_name, date=date_str,
        unverified=bool(certificate.get("unverified")),
        # the room-level badge is room_files.tolerance_class (excludes invented
        # thickness); fall back to a count-based rollup only if not supplied.
        tolerance_class=tolerance_class or _rollup(certificate),
        anchor_count=int(certificate.get("anchor_count", 0)),
        floor_area_sqft=float(certificate.get("floor_area_sqft", 0.0)),
    )

    sheets = [_plan_sheet(room, mindex, scale)]
    sheets += _elevation_sheets(room, mindex, scale)
    return SheetSet(sheets=sheets, meta=meta)


def _rollup(certificate: dict) -> str:
    c = certificate.get("dimension_counts", {})
    if c.get("estimated"):
        return "estimated"
    if c.get("measured"):
        return "measured"
    return "verified"


# ── plan ─────────────────────────────────────────────────────────────────────

def _plan_projection(room: RoomModel, scale: float):
    theta = room.theta_rad
    pts = []
    for w in room.walls:
        pts.append(_rotate_neg(*w.a_xz, theta))
        pts.append(_rotate_neg(*w.b_xz, theta))
    if not pts:
        return None
    minx = min(p[0] for p in pts)
    maxz = max(p[1] for p in pts)
    minz = min(p[1] for p in pts)
    k = M_TO_FT * scale

    def to_ft(x: float, z: float) -> tuple[float, float]:
        rx, rz = _rotate_neg(x, z, theta)
        return ((rx - minx) * k, (maxz - rz) * k)   # y-up, north up

    w_ft = (max(p[0] for p in pts) - minx) * k
    h_ft = (maxz - minz) * k
    return to_ft, w_ft, h_ft


def _plan_sheet(room: RoomModel, mindex: dict, scale: float) -> Sheet:
    sheet = Sheet(id="plan", title="FLOOR PLAN")
    proj = _plan_projection(room, scale)
    if proj is None:
        sheet.prims.append(Label(0, 0, "no geometry", layer=LAYER_TEXT))
        return sheet
    to_ft, w_ft, h_ft = proj
    sheet.w_ft, sheet.h_ft = w_ft, h_ft

    # walls + per-wall length dimension
    for i, wl in enumerate(room.walls):
        a = to_ft(*wl.a_xz)
        b = to_ft(*wl.b_xz)
        sheet.prims.append(Line(a[0], a[1], b[0], b[1], LAYER_WALLS))
        m = mindex.get(("wall", wl.apple_id, i, "length"))
        text, tclass = _fmt(m)
        dx, dy = b[0] - a[0], b[1] - a[1]
        L = math.hypot(dx, dy) or 1.0
        nx, ny = -dy / L, dx / L          # outward normal (offset the dim line)
        off = 1.2
        sheet.prims.append(Dim(
            a[0] + nx * off, a[1] + ny * off, b[0] + nx * off, b[1] + ny * off,
            text, tclass,
        ))

    # openings — a plan tick + width label at the opening's plan position
    theta = room.theta_rad
    for o in room.openings:
        px, py = to_ft(o.center_x_m, o.center_z_m)
        sheet.prims.append(Rect(px - 0.4, py - 0.2, 0.8, 0.4, LAYER_OPENINGS))
        m = mindex.get((o.kind, o.apple_id, _opening_idx(room, o), "width"))
        text, tclass = _fmt(m)
        sheet.prims.append(Label(px, py + 0.5, f"{o.kind} {text}", 0.3, "middle", LAYER_TEXT))

    # overall room width / depth
    rw = mindex.get(("room", None, None, "width"))
    rd = mindex.get(("room", None, None, "depth"))
    if rw:
        t, c = _fmt(rw)
        sheet.prims.append(Dim(0, -1.6, w_ft, -1.6, t, c))
    if rd:
        t, c = _fmt(rd)
        sheet.prims.append(Dim(-1.6, 0, -1.6, h_ft, t, c))
    return sheet


def _opening_idx(room: RoomModel, target) -> int:
    for i, o in enumerate(room.openings):
        if o is target:
            return i
    return 0


# ── elevations (N / E / S / W) ─────────────────────────────────────────────────

def _elevation_sheets(room: RoomModel, mindex: dict, scale: float) -> list[Sheet]:
    theta = room.theta_rad
    cx = sum((_rotate_neg(*w.a_xz, theta)[0] + _rotate_neg(*w.b_xz, theta)[0]) / 2
             for w in room.walls) / max(len(room.walls), 1)
    cz = sum((_rotate_neg(*w.a_xz, theta)[1] + _rotate_neg(*w.b_xz, theta)[1]) / 2
             for w in room.walls) / max(len(room.walls), 1)

    # classify each wall by outward cardinal
    facing: dict[str, list[tuple[int, Any]]] = {"north": [], "east": [], "south": [], "west": []}
    for i, w in enumerate(room.walls):
        ra = _rotate_neg(*w.a_xz, theta)
        rb = _rotate_neg(*w.b_xz, theta)
        mx, mz = (ra[0] + rb[0]) / 2, (ra[1] + rb[1]) / 2
        horizontal = abs(rb[0] - ra[0]) >= abs(rb[1] - ra[1])   # runs along x
        if horizontal:
            facing["north" if mz <= cz else "south"].append((i, w))
        else:
            facing["west" if mx <= cx else "east"].append((i, w))

    sheets: list[Sheet] = []
    for card in ("north", "east", "south", "west"):
        walls = facing[card]
        # representative wall = the longest facing this cardinal
        rep = max(walls, key=lambda iw: iw[1].length_m, default=None)
        sheets.append(_elevation_sheet(card, rep, room, mindex, scale))
    return sheets


def _pt_close(a: tuple[float, float], b: tuple[float, float], tol: float = 0.35) -> bool:
    return math.hypot(a[0] - b[0], a[1] - b[1]) <= tol


def _corner_height_m(room: RoomModel, endpoint: tuple[float, float]) -> float:
    """Ceiling height (metres) at a wall corner = the MIN height of the walls
    meeting there — the ceiling follows the lower wall at that corner, so a wall
    running from a tall side down to a short wall gets a sloped top. Item-2
    synthesize path (when RoomPlan's polygonCorners don't encode the slope)."""
    hs = [w.height_m for w in room.walls
          if math.isfinite(w.height_m)
          and (_pt_close(w.a_xz, endpoint) or _pt_close(w.b_xz, endpoint))]
    return min(hs) if hs else math.nan


def _sloped_polygon(outline: list[tuple[float, float]]) -> list[tuple[float, float]] | None:
    """If a wall's local polygon has a NON-flat top edge (top corners differ in
    height by > 3 cm), return it normalised to a 0-based (along, up) outline; else
    None (fall back to the corner-height synthesize)."""
    if len(outline) < 4:
        return None
    ys = [p[1] for p in outline]
    top_span = max(ys) - min(ys)
    # top corners = those in the upper half; if their y's differ, it's sloped
    mid = (max(ys) + min(ys)) / 2
    top_ys = [y for _, y in outline if y >= mid]
    if len(top_ys) < 2 or (max(top_ys) - min(top_ys)) <= 0.03 or top_span <= 0.03:
        return None
    minx = min(p[0] for p in outline)
    miny = min(p[1] for p in outline)
    return [(p[0] - minx, p[1] - miny) for p in outline]


def _elevation_sheet(card: str, rep, room: RoomModel, mindex: dict, scale: float) -> Sheet:
    sheet = Sheet(id=f"elev-{card}", title=f"ELEVATION — {card.upper()}")
    if rep is None:
        sheet.prims.append(Label(0, 0, "no wall faces this elevation", layer=LAYER_TEXT))
        sheet.w_ft, sheet.h_ft = 4.0, 3.0
        return sheet
    i, w = rep
    k = M_TO_FT * scale
    length_ft = w.length_m * k
    height_ft = (w.height_m if math.isfinite(w.height_m) else 2.7) * k

    # ── wall outline: real sloped polygon > synthesized corner-height slope ────
    poly = _sloped_polygon(w.outline_local)
    sloped = False
    if poly is not None:
        # RoomPlan gave a genuinely sloped polygon — draw it verbatim.
        pts = [(px * k, py * k) for px, py in poly]
        for j in range(len(pts)):
            a, b = pts[j], pts[(j + 1) % len(pts)]
            sheet.prims.append(Line(a[0], a[1], b[0], b[1], LAYER_WALLS))
        top_ft = max(py for _, py in pts)
        sloped = True
    else:
        # synthesize: top chord connects the corner heights (item 2) — a slope
        # when the wall runs between neighbours of different heights.
        lh = _corner_height_m(room, w.a_xz)
        rh = _corner_height_m(room, w.b_xz)
        left_ft = (lh if math.isfinite(lh) else w.height_m) * k
        right_ft = (rh if math.isfinite(rh) else w.height_m) * k
        sheet.prims.append(Line(0, 0, length_ft, 0, LAYER_WALLS))            # floor
        sheet.prims.append(Line(0, 0, 0, left_ft, LAYER_WALLS))              # left jamb
        sheet.prims.append(Line(length_ft, 0, length_ft, right_ft, LAYER_WALLS))  # right jamb
        sheet.prims.append(Line(0, left_ft, length_ft, right_ft, LAYER_WALLS))    # top chord (SLOPE)
        top_ft = max(left_ft, right_ft, height_ft)
        sloped = abs(left_ft - right_ft) > 0.02
    sheet.w_ft, sheet.h_ft = length_ft, top_ft

    # length dim (bottom) + height dim (left)
    lm = mindex.get(("wall", w.apple_id, i, "length"))
    hm = mindex.get(("wall", w.apple_id, i, "height"))
    lt, lc = _fmt(lm)
    ht, hc = _fmt(hm)
    sheet.prims.append(Dim(0, -1.4, length_ft, -1.4, lt, lc))
    sheet.prims.append(Dim(-1.4, 0, -1.4, height_ft, ht, hc))

    # openings on this wall (positioned along the wall by their offset from a-end)
    theta = room.theta_rad
    ra = _rotate_neg(*w.a_xz, theta)
    rb = _rotate_neg(*w.b_xz, theta)
    wlen = math.hypot(rb[0] - ra[0], rb[1] - ra[1]) or 1.0
    ux, uy = (rb[0] - ra[0]) / wlen, (rb[1] - ra[1]) / wlen
    for oi, o in enumerate(room.openings):
        if o.parent_id != w.apple_id:
            continue
        ro = _rotate_neg(o.center_x_m, o.center_z_m, theta)
        along = ((ro[0] - ra[0]) * ux + (ro[1] - ra[1]) * uy) * M_TO_FT * scale
        wm = mindex.get((o.kind, o.apple_id, oi, "width"))
        sm = mindex.get((o.kind, o.apple_id, oi, "sill"))
        hm2 = mindex.get((o.kind, o.apple_id, oi, "head"))
        ow = (o.width_m * M_TO_FT * scale)
        sill = (sm["value_mm"] / 304.8) if sm else 0.0
        head = (hm2["value_mm"] / 304.8) if hm2 else (o.height_m * M_TO_FT * scale)
        x0 = max(0.0, along - ow / 2)
        sheet.prims.append(Rect(x0, sill, ow, max(head - sill, 0.1), LAYER_OPENINGS))
        wt, wc = _fmt(wm)
        sheet.prims.append(Label(x0 + ow / 2, head + 0.3, f"{o.kind} {wt}", 0.28, "middle"))

    # P1 ceiling honesty note (wall-height only; true ceiling planes are P2).
    note = ("CEILING: ESTIMATED · SLOPED (P1 — no true ceiling planes)" if sloped
            else "CEILING: ESTIMATED (wall-height only — P1)")
    sheet.prims.append(Label(length_ft / 2, top_ft + 0.8, note, 0.3, "middle", LAYER_TEXT))
    return sheet
