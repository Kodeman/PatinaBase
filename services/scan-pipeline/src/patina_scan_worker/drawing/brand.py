"""Patina brand mark for the title block — monochrome LINE ART that plots
cleanly (thin strokes, no fills, no shadows). Pure geometry so SVG, PDF, and the
DXF paperspace all draw the same mark.

Escalate-class (catalogued for M3): the strata-mark motif is a stack of offset
horizontal rules — geological strata / the patina of settled layers — set beside
the PATINA wordmark. On the brand grain (deck patina-field-capture-architecture):
Fraunces/serif display is unavailable to the renderers, so the wordmark is a
wide-letter-spaced sans in the ink colour; the mark carries the identity. Source
reference: apps/mobile/Capture/Capture/Resources/AppIcon.icon/Assets/08-patina-mark.svg
(a filled 'P' glyph — reduced here to plottable strata line art, not the filled path).
"""

from __future__ import annotations

WORDMARK = "PATINA"

# Strata rules in a unit box (x 0..1, y 0..1, y-up). Offset lengths evoke
# settled sediment layers. Drawn thin; the renderer scales the box.
STRATA_LINES: list[tuple[float, float, float, float]] = [
    (0.00, 0.86, 0.90, 0.86),
    (0.12, 0.66, 1.00, 0.66),
    (0.00, 0.46, 0.76, 0.46),
    (0.20, 0.26, 1.00, 0.26),
    (0.00, 0.08, 0.60, 0.08),
]
