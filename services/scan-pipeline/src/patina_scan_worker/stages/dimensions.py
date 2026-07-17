"""Corrected dimension set → per-dimension tolerance classes (R108.5 / SC-11/13).
Pure, no IO.

Builds the room_file_measurements SPEC list from the model-space geometry, the
anchors, and the scale fit. Applies the tolerance model and the class rules:

  * anchored span (a dimension whose endpoints match a typed anchor within
    tolerance) → 'verified', tolerance_mm 0, value = the typed value (snap it).
  * everything else → 'measured' with tolerance_mm from the model.
  * wall thickness / anything RoomPlan invents → 'estimated'.
  * < 3 anchors → room UNVERIFIED: every dimension → 'estimated', no 'verified'.

The room-level tolerance_class rollup is the broadest class across the CORE
published dimensions (thickness is published but does not drag the badge).
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field
from typing import Any

from .captured_room import M_TO_FT, RoomModel
from .solve_math import (
    Anchor,
    ScaleFit,
    match_height_anchor,
    match_span_anchor,
    tolerance_mm,
)

_CLASS_RANK = {"verified": 0, "measured": 1, "estimated": 2}
_RANK_CLASS = {0: "verified", 1: "measured", 2: "estimated"}


@dataclass
class MeasurementSpec:
    label: str
    element_ref: dict[str, Any]
    value_mm: int
    source: str            # 'anchor' | 'parametric'
    tolerance_mm: int
    tolerance_class: str    # 'verified' | 'measured' | 'estimated'
    anchor_client_id: str | None  # resolved to scan_anchors.id by the stage
    rollup: bool            # affects the room-level tolerance_class badge


@dataclass
class BuildResult:
    specs: list[MeasurementSpec] = field(default_factory=list)
    used_anchor_ids: set[str] = field(default_factory=set)
    dimension_counts: dict[str, int] = field(default_factory=lambda: {"verified": 0, "measured": 0, "estimated": 0})
    rollup_class: str = "estimated"
    floor_area_sqft: float = 0.0


def _measured_or_estimated(
    model_mm: float, scale: float, unverified: bool, pct: float
) -> tuple[int, int, str]:
    value = int(round(scale * model_mm))
    cls = "estimated" if unverified else "measured"
    return value, tolerance_mm(value, pct), cls


def build_measurements(
    room: RoomModel,
    anchors: list[Anchor],
    fit: ScaleFit,
    unverified: bool,
) -> BuildResult:
    res = BuildResult()
    s = fit.scale
    pct = fit.rms_residual_pct

    # ── snapping: 1:1 anchor → dimension (skipped entirely when UNVERIFIED) ────
    snapped: dict[tuple[int, str], Anchor] = {}
    if not unverified:
        wall_eps = [(w.a_xz, w.b_xz) for w in room.walls]
        wall_heights = [w.height_m for w in room.walls]
        for a in anchors:
            if a.span_kind == "height":
                idx = match_height_anchor(a, wall_heights)
                key = (idx, "height") if idx is not None else None
            else:
                idx = match_span_anchor(a, wall_eps)
                key = (idx, "length") if idx is not None else None
            if key is not None and key not in snapped:
                snapped[key] = a
                res.used_anchor_ids.add(a.client_anchor_id)

    def emit(label, element_ref, model_mm, rollup, snap: Anchor | None = None, invented=False):
        if snap is not None:
            spec = MeasurementSpec(
                label=label, element_ref=element_ref,
                value_mm=snap.measured_value_mm, source="anchor",
                tolerance_mm=0, tolerance_class="verified",
                anchor_client_id=snap.client_anchor_id, rollup=rollup,
            )
        elif invented:
            spec = MeasurementSpec(
                label=label, element_ref=element_ref,
                value_mm=int(round(s * model_mm)), source="parametric",
                tolerance_mm=tolerance_mm(int(round(s * model_mm)), pct),
                tolerance_class="estimated", anchor_client_id=None, rollup=rollup,
            )
        else:
            value, tol, cls = _measured_or_estimated(model_mm, s, unverified, pct)
            spec = MeasurementSpec(
                label=label, element_ref=element_ref, value_mm=value,
                source="parametric", tolerance_mm=tol, tolerance_class=cls,
                anchor_client_id=None, rollup=rollup,
            )
        res.specs.append(spec)
        res.dimension_counts[spec.tolerance_class] += 1

    # ── walls: length + height (+ thickness, always estimated) ─────────────────
    for i, w in enumerate(room.walls):
        ref = {"kind": "wall", "apple_id": w.apple_id}
        if math.isfinite(w.length_m) and w.length_m > 0:
            emit("wall length", {**ref, "dim": "length"}, w.length_m * 1000, True,
                 snap=snapped.get((i, "length")))
        if math.isfinite(w.height_m) and w.height_m > 0:
            emit("wall height", {**ref, "dim": "height"}, w.height_m * 1000, True,
                 snap=snapped.get((i, "height")))
        if w.thickness_m is not None and math.isfinite(w.thickness_m) and w.thickness_m > 0:
            emit("wall thickness", {**ref, "dim": "thickness"}, w.thickness_m * 1000,
                 False, invented=True)

    # ── openings: width + height (+ sill/head when the y-frame is usable) ──────
    floor_y = min((w.base_y_m for w in room.walls if math.isfinite(w.base_y_m)), default=math.nan)
    for o in room.openings:
        ref = {"kind": o.kind, "apple_id": o.apple_id, "parent_id": o.parent_id}
        emit(f"{o.kind} width", {**ref, "dim": "width"}, o.width_m * 1000, True)
        emit(f"{o.kind} height", {**ref, "dim": "height"}, o.height_m * 1000, True)
        if math.isfinite(o.center_y_m) and math.isfinite(floor_y):
            sill = (o.center_y_m - o.height_m / 2 - floor_y) * 1000
            head = (o.center_y_m + o.height_m / 2 - floor_y) * 1000
            if math.isfinite(sill):
                emit(f"{o.kind} sill", {**ref, "dim": "sill"}, sill, True)
            if math.isfinite(head):
                emit(f"{o.kind} head", {**ref, "dim": "head"}, head, True)

    # ── room bounding dimensions ───────────────────────────────────────────────
    if room.width_m > 0:
        emit("room width", {"kind": "room", "dim": "width"}, room.width_m * 1000, True)
    if room.depth_m > 0:
        emit("room depth", {"kind": "room", "dim": "depth"}, room.depth_m * 1000, True)

    # ── floor area → certificate scalar (scales as s², rendered ft²) ───────────
    res.floor_area_sqft = room.floor_area_m2 * (s ** 2) * (M_TO_FT ** 2)

    # ── room-level rollup: broadest class among the CORE (rollup=True) dims ────
    core = [sp.tolerance_class for sp in res.specs if sp.rollup]
    if core:
        res.rollup_class = _RANK_CLASS[max(_CLASS_RANK[c] for c in core)]
    else:
        res.rollup_class = "estimated" if unverified else "measured"
    return res
