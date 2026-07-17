"""Units + dimension text for the drawing set (spec §5: drawings render feet-
inches). mm→ft-in happens ONLY here. Pure, deterministic.

M3-review note (escalate-class visual decisions catalogued for Kody):
  * ft-in fractional to the nearest 1/8" (architectural default; carpenter-legible).
  * Badge triad (deck SC-11): verified → a leading tick ✓ and NO ±; measured →
    the value + ± tolerance in mm (the stored tolerance_mm is exact in mm, and a
    mixed ft-in ± reads worse than "±10"); estimated → a leading ~ (approximate),
    ± shown when a tolerance exists, omitted for RoomPlan-invented (null) values.
  * Architectural scales offered, largest-that-fits chosen for the whole set.
"""

from __future__ import annotations

MM_PER_FT = 304.8
MM_PER_IN = 25.4
PT_PER_IN = 72.0  # PDF/points

# (inches-of-paper per foot-of-room, label). Largest first.
ARCH_SCALES: list[tuple[float, str]] = [
    (0.5, '1/2" = 1\'-0"'),
    (0.375, '3/8" = 1\'-0"'),
    (0.25, '1/4" = 1\'-0"'),
    (0.1875, '3/16" = 1\'-0"'),
    (0.125, '1/8" = 1\'-0"'),
    (0.09375, '3/32" = 1\'-0"'),
    (0.0625, '1/16" = 1\'-0"'),
]


def mm_to_ft(mm: float) -> float:
    return mm / MM_PER_FT


def format_ftin(mm: float, denom: int = 8) -> str:
    """Integer mm → `F'-I"` or `F'-I n/d"` (nearest 1/denom inch)."""
    total_in = mm / MM_PER_IN
    feet = int(total_in // 12)
    rem_in = total_in - feet * 12
    whole = int(rem_in)
    frac_eighths = round((rem_in - whole) * denom)
    if frac_eighths == denom:
        whole += 1
        frac_eighths = 0
    if whole == 12:
        feet += 1
        whole = 0
    # reduce the fraction
    if frac_eighths:
        g = _gcd(frac_eighths, denom)
        num, den = frac_eighths // g, denom // g
        inch = f'{whole} {num}/{den}"'
    else:
        inch = f'{whole}"'
    return f"{feet}'-{inch}"


def _gcd(a: int, b: int) -> int:
    while b:
        a, b = b, a % b
    return a


def badge_text(value_mm: int, tolerance_mm: int | None, tolerance_class: str) -> str:
    """The full dimension string with its tolerance-class badge."""
    base = format_ftin(value_mm)
    if tolerance_class == "verified":
        return f"✓ {base}"                       # ✓ anchor-exact, no ±
    if tolerance_class == "estimated":
        if tolerance_mm is None:
            return f"~ {base}"                        # invented — no ±
        return f"~ {base} ±{tolerance_mm}"       # ~ approx ± band
    # measured
    tol = f" ±{tolerance_mm}" if tolerance_mm is not None else ""
    return f"{base}{tol}"


def select_scale(
    bbox_w_ft: float, bbox_h_ft: float, avail_w_pt: float, avail_h_pt: float
) -> tuple[float, str, float]:
    """Largest architectural scale whose drawing fits the printable area.
    Returns (inch_per_ft, label, pt_per_ft)."""
    for inch_per_ft, label in ARCH_SCALES:
        pt_per_ft = inch_per_ft * PT_PER_IN
        if bbox_w_ft * pt_per_ft <= avail_w_pt and bbox_h_ft * pt_per_ft <= avail_h_pt:
            return inch_per_ft, label, pt_per_ft
    # nothing fits — use the smallest scale (drawing may clip; M3 will resize)
    inch_per_ft, label = ARCH_SCALES[-1]
    return inch_per_ft, label, inch_per_ft * PT_PER_IN
