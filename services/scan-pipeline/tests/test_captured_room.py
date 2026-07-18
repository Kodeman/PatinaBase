"""CapturedRoom → model-space (metres) geometry parsing."""

from __future__ import annotations

import math

from patina_scan_worker.stages.captured_room import parse_captured_room_meters
from _synthetic import rectangular_room


def test_rectangular_room_dimensions():
    room = parse_captured_room_meters(rectangular_room(0, 4, 0, 5, 2.7, th=0.1))
    assert len(room.walls) == 4
    lengths = sorted(round(w.length_m, 3) for w in room.walls)
    assert lengths == [4.0, 4.0, 5.0, 5.0]
    assert all(abs(w.height_m - 2.7) < 1e-9 for w in room.walls)
    assert all(abs(w.thickness_m - 0.1) < 1e-9 for w in room.walls)
    assert abs(room.width_m - 4.0) < 1e-6
    assert abs(room.depth_m - 5.0) < 1e-6
    assert abs(room.floor_area_m2 - 20.0) < 1e-6
    assert abs(room.theta_rad) < 1e-9


def test_wall_endpoints_match_corners():
    room = parse_captured_room_meters(rectangular_room(0, 4, 0, 5, 2.7))
    north = next(w for w in room.walls if w.apple_id == "wall-north")
    pts = sorted([tuple(round(v, 3) for v in north.a_xz), tuple(round(v, 3) for v in north.b_xz)])
    assert pts == [(0.0, 0.0), (4.0, 0.0)]
    east = next(w for w in room.walls if w.apple_id == "wall-east")
    epts = sorted([tuple(round(v, 3) for v in east.a_xz), tuple(round(v, 3) for v in east.b_xz)])
    assert epts == [(4.0, 0.0), (4.0, 5.0)]


def test_door_opening_parsed():
    room = parse_captured_room_meters(rectangular_room(0, 4, 0, 5, 2.7, with_door=True))
    assert len(room.openings) == 1
    d = room.openings[0]
    assert d.kind == "door" and d.parent_id == "wall-north"
    assert abs(d.width_m - 0.9) < 1e-9 and abs(d.height_m - 2.05) < 1e-9


def test_degenerate_empty_room():
    room = parse_captured_room_meters({"walls": [], "openings": [], "objects": []})
    assert room.walls == []
    assert any("degenerate" in w for w in room.warnings)


def test_non_object_input():
    room = parse_captured_room_meters("not-an-object")
    assert room.walls == []


def test_polygon_corners_parsed_into_outline():
    # iOS 17+ walls carry polygonCorners ([x,y,z] local); we keep (along-x, up-y).
    room = {
        "walls": [{
            "identifier": "w0",
            "dimensions": [4.0, 2.7, 0.1],
            "transform": [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 2, 1.35, 0, 1],
            "polygonCorners": [[-2, -1.35, 0], [2, -1.35, 0], [2, 1.1, 0], [-2, 1.35, 0]],
        }],
        "floors": [], "doors": [], "windows": [], "openings": [], "objects": [],
    }
    rm = parse_captured_room_meters(room)
    assert len(rm.walls) == 1
    ol = rm.walls[0].outline_local
    assert ol == [(-2.0, -1.35), (2.0, -1.35), (2.0, 1.1), (-2.0, 1.35)]  # z dropped
