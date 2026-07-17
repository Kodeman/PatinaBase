"""ft-in formatting, badge mapping, architectural scale selection."""

from __future__ import annotations

from patina_scan_worker.drawing.units import (
    ARCH_SCALES,
    badge_text,
    format_ftin,
    select_scale,
)


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
