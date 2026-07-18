"""Hand-built deterministic SVG renderer — one file per sheet. Pure.

Escalate-class visual language (catalogued for M3, on the brand grain:
typography-first, quiet, no shadows):
  * Letter landscape (792×612 pt), 36 pt margins, a 72 pt title strip.
  * Ink is near-black (#1a1a1a) on white; walls 1.4 pt, openings 0.8 pt, dim
    lines 0.5 pt in #555. No fills, no shadows, no color except the loud
    UNVERIFIED stamp (#b00020).
  * Dimensions: a thin line with short perpendicular end ticks and the value
    centered above it. verified reads with a leading ✓ (from units.badge_text);
    estimated dims are DASHED + italic; measured are solid.
  * One architectural scale for the whole set (largest that fits every sheet),
    printed in every title block.
  * The whole set is deterministic: identical input → byte-identical SVG.
"""

from __future__ import annotations

from xml.sax.saxutils import escape

from .brand import STRATA_LINES, WORDMARK
from .model import Dim, Label, Line, Rect, Sheet, SheetSet
from .units import select_scale

PAGE_W, PAGE_H = 792.0, 612.0
MARGIN = 36.0
TITLE_H = 72.0
AVAIL_W = PAGE_W - 2 * MARGIN
AVAIL_H = PAGE_H - 2 * MARGIN - TITLE_H


def _sheet_bbox(sheet: Sheet) -> tuple[float, float, float, float]:
    xs: list[float] = []
    ys: list[float] = []
    for p in sheet.prims:
        if isinstance(p, Line):
            xs += [p.x1, p.x2]; ys += [p.y1, p.y2]
        elif isinstance(p, Rect):
            xs += [p.x, p.x + p.w]; ys += [p.y, p.y + p.h]
        elif isinstance(p, Dim):
            xs += [p.x1, p.x2]; ys += [p.y1, p.y2]
        elif isinstance(p, Label):
            xs.append(p.x); ys.append(p.y)
    if not xs:
        return (0.0, 0.0, 1.0, 1.0)
    return (min(xs), min(ys), max(xs), max(ys))


def render_set(sheet_set: SheetSet) -> dict[str, str]:
    """Return {sheet_id: svg_string}. Picks one scale for the whole set."""
    max_w = max((_sheet_bbox(s)[2] - _sheet_bbox(s)[0]) for s in sheet_set.sheets)
    max_h = max((_sheet_bbox(s)[3] - _sheet_bbox(s)[1]) for s in sheet_set.sheets)
    _, scale_label, ppf = select_scale(max_w or 1, max_h or 1, AVAIL_W, AVAIL_H)
    n = len(sheet_set.sheets)
    return {
        s.id: _render_sheet(s, sheet_set, scale_label, ppf, i + 1, n)
        for i, s in enumerate(sheet_set.sheets)
    }


def _render_sheet(sheet, sset, scale_label, ppf, sheet_no, sheet_total) -> str:
    minx, miny, maxx, maxy = _sheet_bbox(sheet)
    draw_w = (maxx - minx) * ppf
    draw_h = (maxy - miny) * ppf
    ox = MARGIN + (AVAIL_W - draw_w) / 2
    oy = MARGIN + (AVAIL_H - draw_h) / 2

    def sx(fx: float) -> float:
        return round(ox + (fx - minx) * ppf, 2)

    def sy(fy: float) -> float:
        return round(oy + (maxy - fy) * ppf, 2)

    out: list[str] = []
    out.append(
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{int(PAGE_W)}pt" '
        f'height="{int(PAGE_H)}pt" viewBox="0 0 {int(PAGE_W)} {int(PAGE_H)}">'
    )
    out.append('<rect x="0" y="0" width="792" height="612" fill="#ffffff"/>')
    # sheet border
    out.append(f'<rect x="{MARGIN}" y="{MARGIN}" width="{PAGE_W-2*MARGIN}" '
               f'height="{PAGE_H-2*MARGIN}" fill="none" stroke="#1a1a1a" stroke-width="1"/>')

    for p in sheet.prims:
        if isinstance(p, Line):
            out.append(
                f'<line x1="{sx(p.x1)}" y1="{sy(p.y1)}" x2="{sx(p.x2)}" y2="{sy(p.y2)}" '
                f'stroke="#1a1a1a" stroke-width="1.4"/>'
            )
        elif isinstance(p, Rect):
            out.append(
                f'<rect x="{sx(p.x)}" y="{sy(p.y + p.h)}" width="{round(p.w*ppf,2)}" '
                f'height="{round(p.h*ppf,2)}" fill="none" stroke="#1a1a1a" stroke-width="0.8"/>'
            )
        elif isinstance(p, Dim):
            out.append(_dim_svg(p, sx, sy))
        elif isinstance(p, Label):
            out.append(_label_svg(p, sx, sy, ppf))

    out.append(_title_block(sheet, sset, scale_label, sheet_no, sheet_total))
    if sset.meta.unverified:
        out.append(_unverified_stamp())
    out.append("</svg>")
    return "\n".join(out)


def _dim_svg(p: Dim, sx, sy) -> str:
    x1, y1, x2, y2 = sx(p.x1), sy(p.y1), sx(p.x2), sy(p.y2)
    dashed = ' stroke-dasharray="3 2"' if p.tclass == "estimated" else ""
    italic = ' font-style="italic"' if p.tclass == "estimated" else ""
    mx, my = (x1 + x2) / 2, (y1 + y2) / 2
    # short end ticks (perpendicular)
    dx, dy = x2 - x1, y2 - y1
    L = (dx * dx + dy * dy) ** 0.5 or 1.0
    tx, ty = -dy / L * 3, dx / L * 3
    ticks = (
        f'<line x1="{round(x1-tx,2)}" y1="{round(y1-ty,2)}" x2="{round(x1+tx,2)}" '
        f'y2="{round(y1+ty,2)}" stroke="#555" stroke-width="0.5"/>'
        f'<line x1="{round(x2-tx,2)}" y1="{round(y2-ty,2)}" x2="{round(x2+tx,2)}" '
        f'y2="{round(y2+ty,2)}" stroke="#555" stroke-width="0.5"/>'
    )
    return (
        f'<line x1="{x1}" y1="{y1}" x2="{x2}" y2="{y2}" stroke="#555" '
        f'stroke-width="0.5"{dashed}/>{ticks}'
        f'<text x="{round(mx,2)}" y="{round(my-3,2)}" font-family="Helvetica,Arial,sans-serif" '
        f'font-size="7" fill="#1a1a1a" text-anchor="middle"{italic}>{escape(p.text)}</text>'
    )


def _label_svg(p: Label, sx, sy, ppf) -> str:
    anchor = {"start": "start", "middle": "middle", "end": "end"}[p.anchor]
    return (
        f'<text x="{sx(p.x)}" y="{sy(p.y)}" font-family="Helvetica,Arial,sans-serif" '
        f'font-size="{round(max(p.size*ppf,6),1)}" fill="#1a1a1a" '
        f'text-anchor="{anchor}">{escape(p.text)}</text>'
    )


def _brand_svg(x: float, y: float, box: float) -> str:
    """Strata mark (in a `box`-pt square at top-left (x,y), y-down) + PATINA wordmark."""
    parts = []
    for (x1, y1, x2, y2) in STRATA_LINES:
        parts.append(
            f'<line x1="{round(x + x1 * box, 2)}" y1="{round(y + (1 - y1) * box, 2)}" '
            f'x2="{round(x + x2 * box, 2)}" y2="{round(y + (1 - y2) * box, 2)}" '
            f'stroke="#1a1a1a" stroke-width="0.9"/>'
        )
    parts.append(
        f'<text x="{round(x + box + 7, 2)}" y="{round(y + box * 0.72, 2)}" '
        f'font-family="Helvetica,Arial,sans-serif" font-size="13" font-weight="600" '
        f'letter-spacing="3" fill="#1a1a1a">{WORDMARK}</text>'
    )
    return "".join(parts)


def _title_block(sheet, sset, scale_label, sheet_no, sheet_total) -> str:
    m = sset.meta
    ty = PAGE_H - MARGIN - TITLE_H
    x0 = MARGIN
    w = PAGE_W - 2 * MARGIN
    # Patina brand block at the far left; project text starts after it.
    tx = x0 + 132
    rows = [
        (f"PROJECT  {m.project}", 12),
        (f"ROOM  {m.room}", 26),
        (f"{sheet.title}", 44),
    ]
    right = [
        (f"SCALE  {scale_label}", 12),
        (f"DATE  {m.date}", 26),
        (f"SHEET  {sheet.id}  ({sheet_no}/{sheet_total})", 44),
    ]
    badge = (f"TOLERANCE  {m.tolerance_class.upper()}   ANCHORS {m.anchor_count}   "
             f"FLOOR {m.floor_area_sqft:.0f} sq ft   —   ✓ verified   measured ±mm   ~ estimated")
    parts = [f'<line x1="{x0}" y1="{ty}" x2="{x0+w}" y2="{ty}" stroke="#1a1a1a" stroke-width="1"/>']
    # Patina brand block + a hairline separator before the project text.
    parts.append(_brand_svg(x0 + 8, ty + 10, 22))
    parts.append(f'<line x1="{tx-12}" y1="{ty+6}" x2="{tx-12}" y2="{ty+48}" stroke="#1a1a1a" stroke-width="0.5"/>')
    for text, dy in rows:
        parts.append(
            f'<text x="{tx}" y="{ty+dy}" font-family="Helvetica,Arial,sans-serif" '
            f'font-size="9" fill="#1a1a1a">{escape(text)}</text>'
        )
    for text, dy in right:
        parts.append(
            f'<text x="{x0+w-8}" y="{ty+dy}" font-family="Helvetica,Arial,sans-serif" '
            f'font-size="9" fill="#1a1a1a" text-anchor="end">{escape(text)}</text>'
        )
    parts.append(
        f'<text x="{x0+8}" y="{ty+62}" font-family="Helvetica,Arial,sans-serif" '
        f'font-size="7" fill="#555">{escape(badge)}</text>'
    )
    return "".join(parts)


def _unverified_stamp() -> str:
    # loud, top-centre banner (R108.5 / SC-11): the file states what it is.
    return (
        f'<g>'
        f'<rect x="{PAGE_W/2-150}" y="{MARGIN+8}" width="300" height="34" fill="none" '
        f'stroke="#b00020" stroke-width="2"/>'
        f'<text x="{PAGE_W/2}" y="{MARGIN+31}" font-family="Helvetica,Arial,sans-serif" '
        f'font-size="18" font-weight="bold" fill="#b00020" text-anchor="middle" '
        f'letter-spacing="2">UNVERIFIED — FIELD-CHECK REQUIRED</text>'
        f'</g>'
    )
