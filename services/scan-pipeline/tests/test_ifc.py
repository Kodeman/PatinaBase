"""IFC4 export (drawing/ifc.py) — the W2 IFC lane, alongside the SVG/PDF/DXF
sheet set. Skip-guarded: ifcopenshell is an OPTIONAL extra (`drawings`), and a
box without it must not fail collection — see the module docstring in
drawing/ifc.py for what it builds and why."""

from __future__ import annotations

import pytest

ifcopenshell = pytest.importorskip("ifcopenshell")

from patina_scan_worker.drawing.ifc import build_ifc
from patina_scan_worker.stages.captured_room import (
    OpeningDim,
    RoomModel,
    parse_captured_room_meters,
)
from _synthetic import rectangular_room


def _room(**kw):
    return parse_captured_room_meters(rectangular_room(0, 4, 0, 5, 2.7, with_door=True, **kw))


def _meta(**kw):
    base = {
        "scan_id": "scan-ifc-1", "project": "Proj", "room": "Test Room",
        "generated_at": "2026-07-17", "scale": 1.0,
    }
    base.update(kw)
    return base


def _open(data: bytes):
    return ifcopenshell.file.from_string(data.decode("utf-8"))


def test_ifc_opens_with_ifcopenshell():
    f = _open(build_ifc(_room(), _meta()))
    assert f.schema == "IFC4"
    assert f.by_type("IfcProject")


def test_ifc_element_counts_match_model():
    room = _room()
    f = _open(build_ifc(room, _meta()))
    assert len(f.by_type("IfcWall")) == len(room.walls)
    doors = sum(1 for o in room.openings if o.kind == "door")
    windows = sum(1 for o in room.openings if o.kind == "window")
    assert len(f.by_type("IfcDoor")) == doors
    assert len(f.by_type("IfcWindow")) == windows
    assert len(f.by_type("IfcOpeningElement")) == len(room.openings)
    # the one door in the fixture voids its wall and is filled.
    assert len(f.by_type("IfcRelVoidsElement")) == len(room.openings)
    assert len(f.by_type("IfcRelFillsElement")) == doors + windows


def test_ifc_hierarchy_present():
    f = _open(build_ifc(_room(), _meta()))
    assert len(f.by_type("IfcProject")) == 1
    assert len(f.by_type("IfcSite")) == 1
    assert len(f.by_type("IfcBuilding")) == 1
    assert len(f.by_type("IfcBuildingStorey")) == 1
    assert len(f.by_type("IfcSlab")) == 1  # floor, derived from the wall hull


def test_ifc_wall_extrusion_depth_equals_parametric_length():
    room = _room()
    f = _open(build_ifc(room, _meta(scale=1.0)))
    wall = f.by_type("IfcWall")[0]
    solid = wall.Representation.Representations[0].Items[0]
    assert solid.is_a("IfcExtrudedAreaSolid")
    assert solid.Depth == pytest.approx(room.walls[0].length_m, abs=1e-6)


def test_ifc_wall_extrusion_depth_scales_with_certificate_scale():
    room = _room()
    scale = 1.05
    f = _open(build_ifc(room, _meta(scale=scale)))
    wall = f.by_type("IfcWall")[0]
    solid = wall.Representation.Representations[0].Items[0]
    assert solid.Depth == pytest.approx(room.walls[0].length_m * scale, abs=1e-6)


def test_ifc_deterministic_byte_identical():
    room = _room()
    meta = _meta()
    a = build_ifc(room, meta)
    b = build_ifc(room, meta)
    assert a == b


def test_ifc_guids_deterministic_and_unique_across_runs():
    room = _room()
    meta = _meta()
    fa = _open(build_ifc(room, meta))
    fb = _open(build_ifc(room, meta))
    guids_a = sorted(e.GlobalId for e in fa.by_type("IfcRoot"))
    guids_b = sorted(e.GlobalId for e in fb.by_type("IfcRoot"))
    assert guids_a == guids_b
    assert len(guids_a) == len(set(guids_a))


def test_ifc_header_has_no_wall_clock_timestamp_or_build_hash():
    data = build_ifc(_room(), _meta(generated_at="2026-01-02"))
    header = data[:400].decode("utf-8")
    assert "2026-01-02T00:00:00" in header
    assert "IfcOpenShell" not in header  # ifcopenshell's default header identity


def test_ifc_empty_room_does_not_crash():
    f = _open(build_ifc(RoomModel(), _meta()))
    assert len(f.by_type("IfcWall")) == 0
    assert len(f.by_type("IfcSlab")) == 0  # no walls -> no floor hull


def test_ifc_orphaned_opening_still_counted_but_not_voided():
    room = RoomModel()
    room.openings.append(OpeningDim(
        apple_id="o1", parent_id="no-such-wall", kind="window",
        width_m=1.0, height_m=1.2, center_y_m=1.5, center_x_m=0.0, center_z_m=0.0,
    ))
    f = _open(build_ifc(room, _meta()))
    assert len(f.by_type("IfcWindow")) == 1
    assert len(f.by_type("IfcOpeningElement")) == 1
    assert len(f.by_type("IfcRelVoidsElement")) == 0  # nothing to void


def test_ifc_unit_assignment_is_metres():
    f = _open(build_ifc(_room(), _meta()))
    units = {u.UnitType: u for u in f.by_type("IfcSIUnit")}
    assert units["LENGTHUNIT"].Name == "METRE"
