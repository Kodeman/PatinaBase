"""Layered DXF via ezdxf (R108.6). Layers: walls / openings / dimensions / text.
Drawn in INCHES (real-world 1:1); the plan + four elevations are laid out down
modelspace with gaps. Pure except the ezdxf dependency.

Escalate-class calls (catalogued for M3):
  * Dimensions are LINE + TEXT on the `dimensions` layer (not associative
    DIMENSION entities): the value is verbatim from the measurement row, opens
    clean in every CAD tool, and is trivially machine-verifiable (the AC's
    "DXF dims == measurements"). Associative dimensions are an M3 polish upgrade.
  * Units = inches ($INSUNITS = 1). Layer ACI colours: walls 7, openings 5,
    dimensions 8, text 7.
  * UNVERIFIED prints on the `text` layer (R108.5) when the room is unverified.
"""

from __future__ import annotations

from typing import Any

from .model import Dim, Label, Line, Rect, Sheet, SheetSet

IN_PER_FT = 12.0
_LAYERS = {
    "walls": 7,
    "openings": 5,
    "dimensions": 8,
    "text": 7,
}


def _bbox(sheet: Sheet) -> tuple[float, float, float, float]:
    xs: list[float] = []
    ys: list[float] = []
    for p in sheet.prims:
        if isinstance(p, (Line, Dim)):
            xs += [p.x1, p.x2]; ys += [p.y1, p.y2]
        elif isinstance(p, Rect):
            xs += [p.x, p.x + p.w]; ys += [p.y, p.y + p.h]
        elif isinstance(p, Label):
            xs.append(p.x); ys.append(p.y)
    if not xs:
        return (0.0, 0.0, 1.0, 1.0)
    return (min(xs), min(ys), max(xs), max(ys))


def build_dxf(sheet_set: SheetSet) -> Any:
    """Return an ezdxf Drawing with every sheet laid out in modelspace."""
    import ezdxf

    doc = ezdxf.new("R2010", setup=True)
    doc.units = ezdxf.units.IN
    for name, aci in _LAYERS.items():
        doc.layers.add(name, color=aci)
    msp = doc.modelspace()

    cursor_y = 0.0
    gap_in = 48.0  # 4 ft between sheets
    mnx = mny = 1e18
    mxx = mxy = -1e18
    for sheet in sheet_set.sheets:
        minx, miny, maxx, maxy = _bbox(sheet)
        h_in = (maxy - miny) * IN_PER_FT
        # place this sheet's local (minx,maxy) top-left at (0, cursor_y)
        ox = -minx * IN_PER_FT
        oy = cursor_y - (maxy) * IN_PER_FT
        mnx = min(mnx, 0.0)
        mxx = max(mxx, (maxx - minx) * IN_PER_FT)
        mny = min(mny, cursor_y - (maxy - miny) * IN_PER_FT)
        mxy = max(mxy, cursor_y)

        def X(fx: float) -> float:
            return round(ox + fx * IN_PER_FT, 4)

        def Y(fy: float) -> float:
            return round(oy + fy * IN_PER_FT, 4)

        # sheet title on the text layer
        msp.add_text(
            sheet.title, height=6.0, dxfattribs={"layer": "text"}
        ).set_placement((X(minx), Y(maxy) + 12))

        for p in sheet.prims:
            if isinstance(p, Line):
                msp.add_line((X(p.x1), Y(p.y1)), (X(p.x2), Y(p.y2)),
                             dxfattribs={"layer": p.layer})
            elif isinstance(p, Rect):
                pts = [
                    (X(p.x), Y(p.y)), (X(p.x + p.w), Y(p.y)),
                    (X(p.x + p.w), Y(p.y + p.h)), (X(p.x), Y(p.y + p.h)),
                ]
                msp.add_lwpolyline(pts, close=True, dxfattribs={"layer": p.layer})
            elif isinstance(p, Dim):
                _dim(msp, p, X, Y)
            elif isinstance(p, Label):
                msp.add_text(p.text, height=max(p.size * IN_PER_FT, 3.0),
                             dxfattribs={"layer": p.layer}).set_placement((X(p.x), Y(p.y)))

        cursor_y = oy - gap_in

    _title_and_stamp(msp, sheet_set, cursor_y)
    mny = min(mny, cursor_y - 48.0)   # include the modelspace title band
    # A plottable paperspace sheet: a viewport onto the (approved) model + a
    # branded title block drawn in paperspace (item-1 M3 revision).
    _paperspace(doc, sheet_set, (mnx, mny, mxx, mxy))
    return doc


def _brand_dxf(layout, x: float, y: float, box: float) -> None:
    """Strata mark (box-mm square, bottom-left at (x,y)) + PATINA wordmark."""
    from .brand import STRATA_LINES, WORDMARK
    for (x1, y1, x2, y2) in STRATA_LINES:
        layout.add_line((x + x1 * box, y + y1 * box), (x + x2 * box, y + y2 * box),
                        dxfattribs={"layer": "text"})
    layout.add_text(WORDMARK, height=box * 0.42,
                    dxfattribs={"layer": "text"}).set_placement((x + box + 6, y + box * 0.28))


def _paperspace(doc, sset: SheetSet, model_bbox: tuple[float, float, float, float]) -> None:
    m = sset.meta
    mnx, mny, mxx, mxy = model_bbox
    psp = doc.paperspace("Layout1")
    pw, ph = 420.0, 297.0          # A3 landscape (mm)
    try:
        psp.page_setup(size=(int(pw), int(ph)), margins=(10, 10, 10, 10), units="mm")
    except Exception:
        pass
    title_h = 46.0
    # viewport onto the whole model (model units = inches)
    vp = psp.add_viewport(
        center=(pw / 2, title_h + (ph - title_h) / 2),
        size=(pw - 28, ph - title_h - 22),
        view_center_point=((mnx + mxx) / 2, (mny + mxy) / 2),
        view_height=max((mxy - mny) * 1.06, 1.0),
    )
    vp.dxf.status = 1
    # branded title block band
    psp.add_line((14, title_h), (pw - 14, title_h), dxfattribs={"layer": "text"})
    _brand_dxf(psp, 18, 12, 22)
    psp.add_line((92, 8), (92, title_h - 6), dxfattribs={"layer": "text"})
    psp.add_text(f"PROJECT   {m.project}", height=5.0,
                 dxfattribs={"layer": "text"}).set_placement((100, title_h - 14))
    psp.add_text(f"ROOM   {m.room}      DATE   {m.date}", height=4.0,
                 dxfattribs={"layer": "text"}).set_placement((100, title_h - 26))
    psp.add_text(
        f"TOLERANCE {m.tolerance_class.upper()}   ANCHORS {m.anchor_count}   "
        f"FLOOR {m.floor_area_sqft:.0f} sq ft   —   room-file drawing set (SVG/PDF/DXF)",
        height=3.2, dxfattribs={"layer": "text"},
    ).set_placement((100, title_h - 37))
    if m.unverified:
        psp.add_text("UNVERIFIED — FIELD-CHECK REQUIRED", height=8.0,
                     dxfattribs={"layer": "text", "color": 1}).set_placement((pw - 210, 18))


def _dim(msp, p: Dim, X, Y) -> None:
    # dim line + end ticks + verbatim value TEXT (all on the dimensions layer)
    msp.add_line((X(p.x1), Y(p.y1)), (X(p.x2), Y(p.y2)), dxfattribs={"layer": "dimensions"})
    dx, dy = (p.x2 - p.x1), (p.y2 - p.y1)
    L = (dx * dx + dy * dy) ** 0.5 or 1.0
    tx, ty = -dy / L * 0.25, dx / L * 0.25  # 3-inch ticks (0.25 ft)
    for px, py in ((p.x1, p.y1), (p.x2, p.y2)):
        msp.add_line((X(px - tx), Y(py - ty)), (X(px + tx), Y(py + ty)),
                     dxfattribs={"layer": "dimensions"})
    mx, my = (p.x1 + p.x2) / 2, (p.y1 + p.y2) / 2
    msp.add_text(p.text, height=4.0, dxfattribs={"layer": "dimensions"}).set_placement(
        (X(mx), Y(my) + 3), align=None
    )


def _title_and_stamp(msp, sset: SheetSet, cursor_y: float) -> None:
    m = sset.meta
    lines = [
        f"PROJECT: {m.project}",
        f"ROOM: {m.room}    DATE: {m.date}",
        f"TOLERANCE: {m.tolerance_class.upper()}    ANCHORS: {m.anchor_count}    "
        f"FLOOR: {m.floor_area_sqft:.0f} sq ft",
    ]
    y = cursor_y
    for ln in lines:
        msp.add_text(ln, height=5.0, dxfattribs={"layer": "text"}).set_placement((0, y))
        y -= 10
    if m.unverified:
        msp.add_text(
            "UNVERIFIED — FIELD-CHECK REQUIRED",
            height=10.0, dxfattribs={"layer": "text", "color": 1},
        ).set_placement((0, y - 8))


def dimension_texts(doc: Any) -> list[str]:
    """Every TEXT value on the `dimensions` layer — for the value-equality AC."""
    msp = doc.modelspace()
    return [e.dxf.text for e in msp.query('TEXT[layer=="dimensions"]')]


def paperspace_entity_count(doc: Any) -> int:
    """Number of entities in the paperspace Layout tab — proves the sheet is not
    empty (item-1 AC: viewport + title block plot from the Layout)."""
    return len(list(doc.paperspace("Layout1")))
