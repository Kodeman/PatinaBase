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
    for sheet in sheet_set.sheets:
        minx, miny, maxx, maxy = _bbox(sheet)
        h_in = (maxy - miny) * IN_PER_FT
        # place this sheet's local (minx,maxy) top-left at (0, cursor_y)
        ox = -minx * IN_PER_FT
        oy = cursor_y - (maxy) * IN_PER_FT

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
    return doc


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
