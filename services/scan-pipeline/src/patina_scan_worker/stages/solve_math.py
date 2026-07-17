"""Anchor solve + tolerance model (R108.5 / SC-08 / SC-13). Pure, no IO.

P1 solve is a SCALAR scale fit — closed-form weighted least squares over the
(model-space span, typed value) anchor pairs — plus a per-dimension tolerance
class. No numpy for a scalar fit (blessed; the [solve] extra stays unused until
P2 needs real optimization).

Blessed constants:
  * SCALE_BOUNDS (0.8, 1.25) — a fat-thumbed anchor must not silently rescale a
    room; outside this band the solve is fatal (SOLVE_IMPLAUSIBLE).
  * SENSOR_FLOOR_MM 10 — the ±1 cm sensor floor (SC-13 budget).
  * RESIDUAL_FLAG_MM 25 — a per-anchor residual above this is flagged in the
    certificate (a 2.5 cm miss on a tape span is suspect).
  * MATCH_TOL_M 0.20 — a designer taps near the true wall ends; an anchor whose
    endpoints fall within 20 cm of a wall's endpoints snaps that wall's length.
  * MIN_VERIFIED_ANCHORS 3 — below this the room is UNVERIFIED (R108.5): every
    dimension wears the widest class ('estimated'), no 'verified' rows.

Tolerance model (blessed, SC-13): a 'measured' dimension's ± tolerance is
    tolerance_mm = max(SENSOR_FLOOR_MM, round(rms_residual_pct * dimension_mm))
where rms_residual_pct is the RMS of |residual|/typed across the anchors (a
dimensionless relative-error term). A good fit (residuals a few mm on multi-metre
spans) floors at ±1 cm; a noisy fit widens proportionally.
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Any

SOLVER_VERSION = 1
SCALE_BOUNDS = (0.8, 1.25)
SENSOR_FLOOR_MM = 10           # 'measured' floor (±1 cm, anchor-corrected)
RESIDUAL_FLAG_MM = 25
MATCH_TOL_M = 0.20
MIN_VERIFIED_ANCHORS = 3
# 'estimated' band (F2): a REAL RoomPlan dimension with no anchor correction is
# honest about RoomPlan's native accuracy — ~±2% / ±5 cm floor (deck SC-01/SC-13),
# NOT the ±1 cm sensor floor. RoomPlan-INVENTED values (wall thickness) get a NULL
# tolerance — the value is a convention, not a measurement.
ESTIMATED_FLOOR_MM = 50
ESTIMATED_PCT = 0.02

MEASURED_FORMULA = "max(sensor_floor_mm, round(rms_residual_pct * dimension_mm))"
ESTIMATED_FORMULA = "max(floor_mm, round(pct * dimension_mm))"


@dataclass
class Anchor:
    client_anchor_id: str
    index: int | None
    label: str | None
    span_kind: str  # 'span' | 'height'
    endpoint_a: tuple[float, float, float]
    endpoint_b: tuple[float, float, float]
    model_span_m: float
    measured_value_mm: int


@dataclass
class ScaleFit:
    scale: float
    rms_residual_mm: float
    rms_residual_pct: float
    per_anchor: list[dict[str, Any]]  # {client_anchor_id, typed_mm, model_mm, residual_mm}


def _num(v: Any) -> float:
    return float(v) if isinstance(v, (int, float)) and not isinstance(v, bool) and math.isfinite(v) else math.nan


def _pt(v: Any) -> tuple[float, float, float]:
    if isinstance(v, dict):
        return (_num(v.get("x")), _num(v.get("y")), _num(v.get("z")))
    return (math.nan, math.nan, math.nan)


def _dist3(a: tuple[float, float, float], b: tuple[float, float, float]) -> float:
    return math.sqrt(sum((a[i] - b[i]) ** 2 for i in range(3)))


def parse_anchors(raw: Any) -> list[Anchor]:
    out: list[Anchor] = []
    if not isinstance(raw, list):
        return out
    for i, a in enumerate(raw):
        if not isinstance(a, dict):
            continue
        cid = a.get("id")
        mv = a.get("measuredValueMm")
        if not isinstance(cid, str) or not (isinstance(mv, int) and not isinstance(mv, bool) and mv > 0):
            continue
        out.append(Anchor(
            client_anchor_id=cid,
            index=a.get("index") if isinstance(a.get("index"), int) else i,
            label=a.get("label") if isinstance(a.get("label"), str) else None,
            span_kind=a.get("spanKind") if a.get("spanKind") in ("span", "height") else "span",
            endpoint_a=_pt(a.get("endpointA")),
            endpoint_b=_pt(a.get("endpointB")),
            model_span_m=_num(a.get("modelSpanMeters")),
            measured_value_mm=mv,
        ))
    return out


def anchor_model_mm(a: Anchor) -> float:
    """The anchor's model-space span in mm — prefer the denormalised
    modelSpanMeters, else the 3D endpoint distance."""
    d = a.model_span_m
    if not (math.isfinite(d) and d > 0):
        d = _dist3(a.endpoint_a, a.endpoint_b)
    return d * 1000.0


def fit_scale(anchors: list[Anchor]) -> ScaleFit:
    """Closed-form weighted least squares scalar scale: s = Σ(v·d)/Σ(d²), with
    d = model-space span (mm), v = typed value (mm). Residual = v − s·d."""
    num = 0.0
    den = 0.0
    pairs: list[tuple[Anchor, float]] = []
    for a in anchors:
        d = anchor_model_mm(a)
        if math.isfinite(d) and d > 0:
            pairs.append((a, d))
            num += a.measured_value_mm * d
            den += d * d
    scale = (num / den) if den > 0 else 1.0

    per: list[dict[str, Any]] = []
    sq_rel = 0.0
    sq_res = 0.0
    for a, d in pairs:
        residual = a.measured_value_mm - scale * d
        per.append({
            "client_anchor_id": a.client_anchor_id,
            "typed_mm": a.measured_value_mm,
            "model_mm": round(d, 3),
            "residual_mm": round(residual, 3),
        })
        sq_res += residual ** 2
        sq_rel += (residual / a.measured_value_mm) ** 2
    n = len(pairs)
    rms_residual_mm = math.sqrt(sq_res / n) if n else 0.0
    rms_residual_pct = math.sqrt(sq_rel / n) if n else 0.0
    return ScaleFit(
        scale=scale,
        rms_residual_mm=round(rms_residual_mm, 3),
        rms_residual_pct=round(rms_residual_pct, 6),
        per_anchor=per,
    )


def refit_at_scale(anchors: list[Anchor], scale: float) -> ScaleFit:
    """A ScaleFit at a FIXED scale (F4: an ignored implausible fit falls back to
    s=1). Residuals are recomputed against the forced scale."""
    per: list[dict[str, Any]] = []
    sq_res = 0.0
    sq_rel = 0.0
    n = 0
    for a in anchors:
        d = anchor_model_mm(a)
        if not (math.isfinite(d) and d > 0):
            continue
        residual = a.measured_value_mm - scale * d
        per.append({
            "client_anchor_id": a.client_anchor_id,
            "typed_mm": a.measured_value_mm,
            "model_mm": round(d, 3),
            "residual_mm": round(residual, 3),
        })
        sq_res += residual ** 2
        sq_rel += (residual / a.measured_value_mm) ** 2
        n += 1
    return ScaleFit(
        scale=scale,
        rms_residual_mm=round(math.sqrt(sq_res / n), 3) if n else 0.0,
        rms_residual_pct=round(math.sqrt(sq_rel / n), 6) if n else 0.0,
        per_anchor=per,
    )


def scale_is_plausible(scale: float) -> bool:
    lo, hi = SCALE_BOUNDS
    return math.isfinite(scale) and lo <= scale <= hi


def measured_tolerance_mm(dimension_mm: float, rms_residual_pct: float) -> int:
    """'measured' ± — anchor-corrected, floored at the ±1 cm sensor floor."""
    rel = rms_residual_pct * dimension_mm if math.isfinite(rms_residual_pct) else 0.0
    return int(max(SENSOR_FLOOR_MM, round(rel)))


def estimated_tolerance_mm(dimension_mm: float) -> int:
    """'estimated' ± for a REAL (non-invented) dimension — RoomPlan's native
    band (F2), floored at ±5 cm, never the ±1 cm sensor floor."""
    return int(max(ESTIMATED_FLOOR_MM, round(ESTIMATED_PCT * dimension_mm)))


def _close(a: tuple[float, float], b: tuple[float, float], tol: float = MATCH_TOL_M) -> bool:
    return math.hypot(a[0] - b[0], a[1] - b[1]) <= tol


def match_span_anchor(anchor: Anchor, wall_endpoints: list[tuple[tuple[float, float], tuple[float, float]]]) -> int | None:
    """Return the index of the wall whose XZ endpoints match this span anchor's
    endpoints (either orientation), or None. wall_endpoints is [(a_xz, b_xz), …]."""
    a = (anchor.endpoint_a[0], anchor.endpoint_a[2])
    b = (anchor.endpoint_b[0], anchor.endpoint_b[2])
    for i, (wa, wb) in enumerate(wall_endpoints):
        if (_close(a, wa) and _close(b, wb)) or (_close(a, wb) and _close(b, wa)):
            return i
    return None


def match_height_anchor(anchor: Anchor, wall_heights_m: list[float]) -> int | None:
    """Return the index of the wall whose height matches this height anchor's
    vertical span, or None."""
    span = abs(anchor.endpoint_a[1] - anchor.endpoint_b[1])
    if not (math.isfinite(span) and span > 0):
        span = anchor.model_span_m
    if not (math.isfinite(span) and span > 0):
        return None
    for i, h in enumerate(wall_heights_m):
        if math.isfinite(h) and abs(h - span) <= MATCH_TOL_M:
            return i
    return None


def build_certificate(
    fit: ScaleFit,
    used_anchor_ids: set[str],
    unverified: bool,
    dimension_counts: dict[str, int],
    floor_area_sqft: float,
    anchor_count: int,
    scale_ignored: bool = False,
) -> dict[str, Any]:
    anchors = []
    for pa in fit.per_anchor:
        used = pa["client_anchor_id"] in used_anchor_ids
        anchors.append({
            **pa,
            "used": used,
            "flagged": abs(pa["residual_mm"]) > RESIDUAL_FLAG_MM,
        })
    return {
        "solver_version": SOLVER_VERSION,
        "scale": round(fit.scale, 6),
        "scale_ignored": scale_ignored,
        "rms_residual_mm": fit.rms_residual_mm,
        "rms_residual_pct": fit.rms_residual_pct,
        "anchors": anchors,
        "anchor_count": anchor_count,
        # Both tolerance bases recorded (F2): 'measured' is anchor-corrected
        # (±1 cm floor); 'estimated' is RoomPlan's native band (±5 cm / 2% floor);
        # 'invented' values (thickness) carry no tolerance.
        "tolerance_model": {
            "measured": {
                "sensor_floor_mm": SENSOR_FLOOR_MM,
                "rms_residual_pct": fit.rms_residual_pct,
                "formula": MEASURED_FORMULA,
            },
            "estimated": {
                "floor_mm": ESTIMATED_FLOOR_MM,
                "pct": ESTIMATED_PCT,
                "formula": ESTIMATED_FORMULA,
            },
            "invented": {
                "tolerance_mm": None,
                "note": "RoomPlan-invented values (e.g. wall thickness) are a convention, not a measurement",
            },
        },
        "scale_bounds": list(SCALE_BOUNDS),
        "unverified": unverified,
        "dimension_counts": dimension_counts,
        "floor_area_sqft": round(floor_area_sqft, 2),
    }


_CERT_KEYS = {
    "solver_version", "scale", "scale_ignored", "rms_residual_mm",
    "rms_residual_pct", "anchors", "anchor_count", "tolerance_model",
    "scale_bounds", "unverified", "dimension_counts", "floor_area_sqft",
}


def validate_certificate(cert: Any) -> list[str]:
    """Schema + internal-consistency check run before persisting (AC: the
    certificate JSON validates). Returns a list of error strings (empty = valid)."""
    errs: list[str] = []
    if not isinstance(cert, dict):
        return ["certificate is not an object"]

    missing = _CERT_KEYS - set(cert.keys())
    if missing:
        errs.append(f"missing keys: {sorted(missing)}")
        return errs

    if cert["solver_version"] != SOLVER_VERSION:
        errs.append(f"solver_version {cert['solver_version']} != {SOLVER_VERSION}")

    scale = cert["scale"]
    if not (isinstance(scale, (int, float)) and scale_is_plausible(scale)):
        errs.append(f"scale {scale} out of plausible bounds {SCALE_BOUNDS}")

    # F4: an ignored implausible fit falls back to s=1 and only ever happens on
    # an UNVERIFIED (< 3 anchor) room.
    if cert.get("scale_ignored"):
        if not cert.get("unverified"):
            errs.append("scale_ignored is only valid on an unverified room")
        if scale != 1.0:
            errs.append(f"scale_ignored requires scale == 1.0, got {scale}")

    counts = cert["dimension_counts"]
    if not isinstance(counts, dict) or set(counts) < {"verified", "measured", "estimated"}:
        errs.append("dimension_counts must carry verified/measured/estimated")
        counts = {"verified": -1}

    anchors = cert["anchors"]
    if not isinstance(anchors, list):
        errs.append("anchors is not a list")
        anchors = []
    used = sum(1 for a in anchors if isinstance(a, dict) and a.get("used"))

    unverified = cert["unverified"]
    verified_count = counts.get("verified", -1)
    if unverified:
        # UNVERIFIED: no verified rows, no anchors marked used
        if verified_count != 0:
            errs.append(f"unverified room must have 0 verified dims, got {verified_count}")
        if used != 0:
            errs.append(f"unverified room must mark 0 anchors used, got {used}")
    else:
        # verified count must equal the number of anchors that snapped a dimension
        if verified_count != used:
            errs.append(
                f"verified dim count {verified_count} != anchors used {used}"
            )
        if cert["anchor_count"] < MIN_VERIFIED_ANCHORS:
            errs.append(
                f"non-unverified room must have >= {MIN_VERIFIED_ANCHORS} anchors, "
                f"got {cert['anchor_count']}"
            )
    return errs
