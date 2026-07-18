"""Drawing set: plan + four elevations, deterministic SVG, DXF layers +
value-equality + audit + UNVERIFIED stamp."""

from __future__ import annotations

from patina_scan_worker.drawing import dxf as dxf_mod
from patina_scan_worker.drawing.model import build_sheet_set
from patina_scan_worker.drawing.svg import render_set
from patina_scan_worker.drawing.units import badge_text
from patina_scan_worker.stages.captured_room import parse_captured_room_meters
from patina_scan_worker.stages.dimensions import build_measurements
from patina_scan_worker.stages.solve_math import (
    build_certificate,
    fit_scale,
    parse_anchors,
)
from _synthetic import matching_anchors, rectangular_room


def _solved(scale=1.0, unverified=False):
    room = parse_captured_room_meters(rectangular_room(0, 4, 0, 5, 2.7, with_door=True))
    if unverified:
        anchors = parse_anchors([])
        fit = fit_scale(anchors)
    else:
        anchors = parse_anchors(matching_anchors(0, 4, 0, 5, 2.7, scale=scale))
        fit = fit_scale(anchors)
    built = build_measurements(room, anchors, fit, unverified)
    measurements = [{
        "label": sp.label, "element_ref": sp.element_ref, "value_mm": sp.value_mm,
        "tolerance_mm": sp.tolerance_mm, "tolerance_class": sp.tolerance_class,
        "source": sp.source,
    } for sp in built.specs]
    cert = build_certificate(
        fit, built.used_anchor_ids, unverified, built.dimension_counts,
        built.floor_area_sqft, len(anchors),
        scale_ignored=False,
    )
    return room, measurements, cert


def _sheet_set(**kw):
    room, meas, cert = _solved(**kw)
    return build_sheet_set(room, meas, cert, "Proj", "Test Room", "2026-07-17"), meas


def test_sheet_set_plan_plus_four_elevations():
    ss, _ = _sheet_set()
    ids = [s.id for s in ss.sheets]
    assert ids == ["plan", "elev-north", "elev-east", "elev-south", "elev-west"]


def test_svg_deterministic_and_letter():
    ss, _ = _sheet_set()
    a = render_set(ss)
    b = render_set(ss)
    assert a == b                                     # byte-identical
    assert a["plan"].startswith("<svg")
    assert 'width="792pt"' in a["plan"] and 'height="612pt"' in a["plan"]


def test_dxf_has_the_four_layers():
    ss, _ = _sheet_set()
    doc = dxf_mod.build_dxf(ss)
    names = {ly.dxf.name for ly in doc.layers}
    assert {"walls", "openings", "dimensions", "text"} <= names


def test_dxf_dimension_values_are_verbatim_from_measurements():
    ss, meas = _sheet_set()
    doc = dxf_mod.build_dxf(ss)
    dim_texts = set(dxf_mod.dimension_texts(doc))
    universe = {badge_text(m["value_mm"], m["tolerance_mm"], m["tolerance_class"]) for m in meas}
    # every DXF dimension text is the verbatim badge of a real measurement row
    assert dim_texts and dim_texts <= universe
    # the three anchored (verified) spans appear as ✓ dimensions
    verified = {badge_text(m["value_mm"], m["tolerance_mm"], m["tolerance_class"])
                for m in meas if m["tolerance_class"] == "verified"}
    assert verified <= dim_texts


def test_dxf_audit_clean_and_recoverable(tmp_path):
    import ezdxf
    from ezdxf import recover

    ss, _ = _sheet_set()
    doc = dxf_mod.build_dxf(ss)
    auditor = doc.audit()
    assert len(auditor.errors) == 0
    path = tmp_path / "room.dxf"
    doc.saveas(str(path))
    # second, independent read (recover mode) — a different parse path
    doc2, auditor2 = recover.readfile(str(path))
    assert len(auditor2.errors) == 0
    assert len(list(doc2.modelspace().query('TEXT[layer=="dimensions"]'))) > 0


def test_paperspace_layout_has_entities():
    # item 1: the Layout tab must be a plottable sheet (viewport + title block),
    # not empty. keep model space as-is (dimension_texts still populated).
    ss, _ = _sheet_set()
    doc = dxf_mod.build_dxf(ss)
    assert dxf_mod.paperspace_entity_count(doc) > 0
    # a VIEWPORT entity exists in paperspace
    vps = list(doc.paperspace("Layout1").query("VIEWPORT"))
    assert len(vps) >= 1
    # model space is unchanged — dimensions still present
    assert len(dxf_mod.dimension_texts(doc)) > 0


def test_patina_brand_on_title_block():
    # item 3: the PATINA mark brands every SVG sheet's title block…
    ss, _ = _sheet_set()
    svgs = render_set(ss)
    assert "PATINA" in svgs["plan"] and "PATINA" in svgs["elev-north"]
    # …and the DXF paperspace title block
    doc = dxf_mod.build_dxf(ss)
    ptxt = " ".join(e.dxf.text for e in doc.paperspace("Layout1").query("TEXT"))
    assert "PATINA" in ptxt


def test_sloped_ceiling_elevation_synthesizes_top_chord():
    # item 2: a room with a short north wall (sloped ceiling) → an elevation's
    # wall top is a SLOPED chord (y1 != y2), and its ceiling note says SLOPED.
    from patina_scan_worker.drawing.model import LAYER_WALLS, Line
    room = parse_captured_room_meters(rectangular_room(0, 4, 0, 5, 2.7, north_height=2.2))
    cert = {"scale": 1.0, "unverified": False, "anchor_count": 3, "floor_area_sqft": 200.0,
            "dimension_counts": {"verified": 0, "measured": 0, "estimated": 0}}
    ss = build_sheet_set(room, [], cert, "P", "R", "D", tolerance_class="measured")
    sloped_sheets = []
    for s in ss.sheets:
        if not s.id.startswith("elev-"):
            continue
        diag = [p for p in s.prims if isinstance(p, Line) and p.layer == LAYER_WALLS
                and abs(p.y1 - p.y2) > 0.02 and abs(p.x1 - p.x2) > 0.02]
        if diag:
            sloped_sheets.append(s)
    assert sloped_sheets, "no elevation drew a sloped top chord for a sloped-ceiling room"
    notes = " ".join(p.text for s in sloped_sheets for p in s.prims if hasattr(p, "text"))
    assert "SLOPED" in notes


def test_unverified_stamp_presence_and_absence():
    ss_v, _ = _sheet_set(unverified=False)
    ss_u, _ = _sheet_set(unverified=True)
    assert "UNVERIFIED" not in render_set(ss_v)["plan"]
    assert "UNVERIFIED" in render_set(ss_u)["plan"]
    # unverified DXF also stamps UNVERIFIED on the text layer
    doc = dxf_mod.build_dxf(ss_u)
    txt = " ".join(e.dxf.text for e in doc.modelspace().query('TEXT[layer=="text"]'))
    assert "UNVERIFIED" in txt
