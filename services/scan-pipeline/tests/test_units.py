"""ft-in formatting, badge mapping, architectural scale selection."""

from __future__ import annotations

import pytest

from patina_scan_worker.drawing.units import (
    ARCH_SCALES,
    badge_text,
    format_ftin,
    select_scale,
)

# ═══════════════════════════════════════════════════════════════════════════
# SHARED IDENTITY FIXTURE — keep in lockstep with the portal port:
#   apps/designer-portal/src/lib/room-file/__tests__/format.test.ts
# Both suites assert the SAME literal (mm → ft-in) rows against their own
# formatter (this units.py vs the TS formatFtIn). A drift in either trips a
# fixture row here or in Jest — not a dimension on a customer's drawing. Any
# change to a row MUST be mirrored in both files in the same commit.
# ═══════════════════════════════════════════════════════════════════════════
SHARED_FTIN_FIXTURE = [
    (0, "0'-0\""),          # zero
    (114, "0'-4 1/2\""),    # sub-inch, 1/2
    (305, "1'-0\""),        # 12.008 in → foot boundary, fraction rounds away
    (360, "1'-2 1/8\""),    # 1/8
    (2440, "8'-0 1/8\""),   # walk value
    (2982, "9'-9 3/8\""),   # 3/8
    (3000, "9'-10 1/8\""),  # walk value
    (3048, "10'-0\""),      # exact foot (120.0 in)
    (3660, "12'-0 1/8\""),  # 12'-0 carry region
    (3720, "12'-2 1/2\""),  # walk value, 1/2
    (5200, "17'-0 3/4\""),  # walk value, 3/4
]

# SHARED EXACT-HALF (ties-to-even) FIXTURE — the synthetic exact-half-eighth
# case integer-mm inputs can never reach (a 1..40000 mm sweep finds zero IEEE
# half-ties). Pins the rounding PRIMITIVE both formatters share on an exact .5:
# Python's built-in round() here, JS roundHalfEven in format.test.ts — same
# literals, both must round the tie to the even neighbour.
SHARED_HALF_EVEN_FIXTURE = [
    (0.5, 0),
    (1.5, 2),
    (2.5, 2),
    (3.5, 4),
    (4.5, 4),
    (5.5, 6),
]


@pytest.mark.parametrize("mm,expected", SHARED_FTIN_FIXTURE)
def test_format_ftin_shared_identity_fixture(mm, expected):
    assert format_ftin(mm) == expected


@pytest.mark.parametrize("value,expected", SHARED_HALF_EVEN_FIXTURE)
def test_round_half_to_even_matches_portal(value, expected):
    # format_ftin's fractional-eighth rounding is Python round() (ties-to-even);
    # the portal's roundHalfEven mirrors it on exactly these literals.
    assert round(value) == expected


def test_format_ftin():
    assert format_ftin(304.8) == "1'-0\""          # exactly 1 ft
    assert format_ftin(4394) == "14'-5\""          # 14 ft 5 in
    assert format_ftin(2743) == "9'-0\""           # ~9 ft
    assert format_ftin(4991) == "16'-4 1/2\""      # fractional inch, reduced


def test_badge_text_triad():
    assert badge_text(4394, 0, "verified") == "✓ 14'-5\""
    assert badge_text(4394, 10, "measured") == "14'-5\" ±10"
    assert badge_text(4394, 50, "estimated") == "~ 14'-5\" ±50"
    # RoomPlan-invented (null tolerance) estimated → no ±
    assert badge_text(102, None, "estimated") == "~ 0'-4\""


def test_select_scale_picks_largest_that_fits():
    # a small room fits the largest scale
    inch, label, ppf = select_scale(6, 4, 720, 468)
    assert inch == ARCH_SCALES[0][0]
    # a large room forces a smaller scale
    inch2, _, _ = select_scale(60, 40, 720, 468)
    assert inch2 < inch
