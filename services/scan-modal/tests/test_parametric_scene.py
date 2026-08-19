"""`core/parametric_scene` — the CapturedRoom → schematic box scene builder.

Pure module, so these tests are pure: no bpy, no network, no Modal. Two rooms
carry the suite. The SYNTHETIC room from `_synthetic.py` is axis-aligned and
hand-computable, so its boxes are asserted exactly. The REAL room is the reduced
prod-copy capture in `fixtures/` — 4 walls at three different heights, a floor
whose local +z is world up, 2 windows, a door, an opening and 7 objects, none of
it axis-aligned — which is what proves the transform reading rather than the
arithmetic.
"""

from __future__ import annotations

import json
import math
from pathlib import Path

import pytest

from scan_modal.core.cameras import Bbox, RoomFrame, plan_cameras
from scan_modal.core.parametric_scene import (
    FLOOR_THICKNESS_M,
    OPENING_DEPTH_M,
    OPENING_INSET_M,
    WALL_THICKNESS_M,
    build_scene_spec,
    room_frame,
)

from _synthetic import DEPTH_M, HEIGHT_M, WIDTH_M, captured_room_json

FIXTURE = Path(__file__).parent / "fixtures" / "captured_room_prod_copy.json"


@pytest.fixture(scope="module")
def prod_room() -> dict:
    return json.loads(FIXTURE.read_text())


def by_name(spec, name):
    return next(b for b in spec.boxes if b.name == name)


def wall(identifier: str, dimensions, transform) -> dict:
    return {"identifier": identifier, "dimensions": dimensions, "transform": transform}


#: An ARKit wall standing at a deliberately asymmetric spot, its local +x along
#: world +x, so every coordinate distinguishes the three axes from each other.
def wall_at(x: float, y: float, z: float) -> dict:
    return wall(
        "probe",
        [2.0, 2.4, 0.0],
        [1.0, 0.0, 0.0, 0.0,
         0.0, 1.0, 0.0, 0.0,
         0.0, 0.0, 1.0, 0.0,
         x, y, z, 1.0],
    )


# ── the synthetic room, exactly ─────────────────────────────────────────────


def test_the_synthetic_room_yields_four_walls_and_a_floor():
    spec = build_scene_spec(captured_room_json())
    assert spec.summary == {"wall": 4, "floor": 1}
    assert not spec.is_empty


def test_every_synthetic_wall_lands_on_its_hand_computed_box():
    spec = build_scene_spec(captured_room_json())
    hw, hd, half_h = WIDTH_M / 2.0, DEPTH_M / 2.0, HEIGHT_M / 2.0

    # ARKit centre → Blender centre by (x, y, z) → (x, -z, y). North sits at
    # arkit z = -1.5, so it lands at blender y = +1.5.
    expected = [
        ("wall_00", (0.0, hd, half_h), (WIDTH_M, WALL_THICKNESS_M, HEIGHT_M), 0.0),
        ("wall_01", (0.0, -hd, half_h), (WIDTH_M, WALL_THICKNESS_M, HEIGHT_M), 0.0),
        ("wall_02", (-hw, 0.0, half_h), (DEPTH_M, WALL_THICKNESS_M, HEIGHT_M), -math.pi / 2),
        ("wall_03", (hw, 0.0, half_h), (DEPTH_M, WALL_THICKNESS_M, HEIGHT_M), -math.pi / 2),
    ]
    for name, center, size, yaw in expected:
        box = by_name(spec, name)
        assert box.center == pytest.approx(center)
        assert box.size == pytest.approx(size)
        assert box.rotation_z == pytest.approx(yaw)
        assert box.material == "wall"
        # The floor sits at arkit y = 0, so every wall base must too.
        assert box.center[2] - box.size[2] / 2.0 == pytest.approx(0.0)


def test_an_absent_floors_array_synthesizes_a_slab_under_the_walls():
    spec = build_scene_spec(captured_room_json())
    floor = by_name(spec, "floor_synth")

    # The wall footprint is the room plus half a wall thickness on each side.
    assert floor.size == pytest.approx(
        (WIDTH_M + WALL_THICKNESS_M, DEPTH_M + WALL_THICKNESS_M, FLOOR_THICKNESS_M)
    )
    assert floor.center == pytest.approx((0.0, 0.0, -FLOOR_THICKNESS_M / 2.0))
    assert floor.center[2] + floor.size[2] / 2.0 == pytest.approx(0.0), "slab is topped at the wall base"
    assert any("synthesized" in w for w in spec.warnings)


def test_the_synthetic_bbox_is_the_union_of_walls_and_slab():
    spec = build_scene_spec(captured_room_json())
    assert spec.bbox.min == pytest.approx((-2.05, -1.55, -FLOOR_THICKNESS_M))
    assert spec.bbox.max == pytest.approx((2.05, 1.55, HEIGHT_M))


# ── the Y-up → Z-up conversion, explicitly ──────────────────────────────────


def test_arkit_y_up_becomes_blender_z_up_on_a_known_point():
    """(x, y, z)_arkit → (x, -z, y)_blender — the change of basis Blender's own
    glTF importer applies, so a merged GLB lands in the same frame."""
    spec = build_scene_spec({"walls": [wall_at(1.0, 2.0, 3.0)]})
    assert by_name(spec, "wall_00").center == pytest.approx((1.0, -3.0, 2.0))


def test_the_vertical_axis_is_z_not_y():
    """The synthetic room is 4 m × 3 m × 2.5 m high. If the conversion were
    skipped the 2.5 would show up on the Y axis and the 3 on Z."""
    spec = build_scene_spec(captured_room_json())
    sx, sy, sz = spec.bbox.size
    assert sx == pytest.approx(WIDTH_M + WALL_THICKNESS_M)
    assert sy == pytest.approx(DEPTH_M + WALL_THICKNESS_M)
    assert sz == pytest.approx(HEIGHT_M + FLOOR_THICKNESS_M)

    floor = by_name(spec, "floor_synth")
    assert floor.center[2] < 0.0, "floor hangs below the room"
    ceiling = max(b.center[2] + b.size[2] / 2.0 for b in spec.boxes if b.kind == "wall")
    assert ceiling == pytest.approx(HEIGHT_M)
    assert ceiling > floor.center[2] + 2.0


# ── the real capture ────────────────────────────────────────────────────────


def test_the_real_capture_yields_every_element_it_has(prod_room):
    spec = build_scene_spec(prod_room)
    assert spec.summary == {
        "wall": 4,
        "floor": 1,
        "window": 2,
        "door": 1,
        "opening": 1,
        "object": 7,
    }
    assert len(spec.boxes) == 16
    assert not spec.is_empty
    assert spec.warnings == [], "nothing in a real capture should be unusable"


def test_the_real_room_is_plausibly_sized(prod_room):
    spec = build_scene_spec(prod_room)
    sx, sy, sz = spec.bbox.size
    # A kitchen/dining pair, roughly 8.8 m × 8.2 m over the wall centrelines and
    # the furniture that overhangs them.
    assert 7.5 < sx < 10.0
    assert 7.5 < sy < 10.0
    # Wall heights in this capture run 2.20–3.30 m, plus the floor slab.
    assert 3.0 < sz < 3.6

    heights = sorted(b.size[2] for b in spec.boxes if b.kind == "wall")
    assert heights[0] == pytest.approx(2.1977, abs=1e-3)
    assert heights[-1] == pytest.approx(3.3, abs=1e-3)
    # RoomPlan reports zero thickness for every surface, so every wall gets the
    # default body and none of them is a zero-scale cube.
    assert {round(b.size[1], 6) for b in spec.boxes if b.kind == "wall"} == {WALL_THICKNESS_M}


def test_every_real_wall_stands_on_one_floor_plane(prod_room):
    spec = build_scene_spec(prod_room)
    bases = [b.center[2] - b.size[2] / 2.0 for b in spec.boxes if b.kind == "wall"]
    assert bases == pytest.approx([bases[0]] * 4, abs=1e-3)

    floor = by_name(spec, "floor_00")
    assert floor.size[2] == pytest.approx(FLOOR_THICKNESS_M)
    assert floor.center[2] + floor.size[2] / 2.0 == pytest.approx(bases[0], abs=1e-3)
    # The floor's local +z is world up, so its 4.27 × 7.82 dimensions are both
    # HORIZONTAL. Read as [width, height] the slab would be 7.8 m tall.
    assert floor.size[0] == pytest.approx(4.2745, abs=1e-3)
    assert floor.size[1] == pytest.approx(7.8191, abs=1e-3)


def test_openings_are_inset_panels_proud_of_the_wall(prod_room):
    spec = build_scene_spec(prod_room)
    window = by_name(spec, "window_00")
    assert window.material == "window"
    # Reported 0.7194 × 1.4731, drawn in by the inset on both face axes.
    assert window.size[0] == pytest.approx(0.7194 - 2 * OPENING_INSET_M, abs=1e-3)
    assert window.size[2] == pytest.approx(1.4731 - 2 * OPENING_INSET_M, abs=1e-3)
    assert window.size[1] == pytest.approx(OPENING_DEPTH_M)

    for kind in ("window", "door", "opening"):
        panels = [b for b in spec.boxes if b.kind == kind]
        assert panels
        for panel in panels:
            assert panel.material == kind
            assert panel.size[1] > WALL_THICKNESS_M, "panel must stand proud of the wall"


def test_objects_carry_their_category_and_a_shared_material(prod_room):
    spec = build_scene_spec(prod_room)
    objects = [b for b in spec.boxes if b.kind == "object"]
    assert [b.name for b in objects] == [
        "object_00_sink",
        "object_01_storage",
        "object_02_table",
        "object_03_refrigerator",
        "object_04_oven",
        "object_05_chair",
        "object_06_stove",
    ]
    assert {b.material for b in objects} == {"object"}
    assert len({b.name for b in spec.boxes}) == len(spec.boxes)


def test_the_emitted_order_is_walls_floor_openings_objects(prod_room):
    spec = build_scene_spec(prod_room)
    assert [b.kind for b in spec.boxes] == (
        ["wall"] * 4 + ["floor"] + ["window"] * 2 + ["door"] + ["opening"] + ["object"] * 7
    )


def test_two_builds_of_one_document_are_identical(prod_room):
    first = build_scene_spec(prod_room)
    second = build_scene_spec(prod_room)
    assert first.boxes == second.boxes
    assert first.bbox == second.bbox
    assert first.warnings == second.warnings


# ── the camera plan consumes the bbox ───────────────────────────────────────


def test_the_real_bbox_plans_the_whole_shot_set(prod_room):
    spec = build_scene_spec(prod_room)
    assert isinstance(spec.bbox, Bbox)
    shots = plan_cameras(spec.bbox)
    assert len(shots) == 29
    assert shots[0].name == "corner_ne"
    assert all(math.isfinite(v) for shot in shots for v in shot.location)


# ── degradation: never throw ────────────────────────────────────────────────


def test_a_non_dict_document_returns_an_empty_spec():
    spec = build_scene_spec("not a room")
    assert spec.is_empty
    assert spec.warnings == ["captured_room is not an object"]
    assert spec.bbox == Bbox.from_points((0.0, 0.0, 0.0), (0.0, 0.0, 0.0))


def test_an_empty_document_returns_an_empty_spec_with_warnings():
    spec = build_scene_spec({})
    assert spec.is_empty
    assert spec.boxes == []
    assert any("no usable walls" in w for w in spec.warnings)
    assert "no floor" in spec.warnings


def test_a_document_with_no_walls_still_yields_its_objects():
    spec = build_scene_spec(
        {
            "objects": [
                {
                    "category": {"chair": {}},
                    "dimensions": [0.5, 0.9, 0.5],
                    "transform": [1.0, 0.0, 0.0, 0.0,
                                  0.0, 1.0, 0.0, 0.0,
                                  0.0, 0.0, 1.0, 0.0,
                                  0.4, 0.45, -1.2, 1.0],
                }
            ]
        }
    )
    assert not spec.is_empty
    assert spec.summary == {"object": 1}
    assert any("no usable walls" in w for w in spec.warnings)
    assert spec.bbox.size == pytest.approx((0.5, 0.5, 0.9))


@pytest.mark.parametrize(
    "transform",
    [
        [1.0, 0.0, 0.0],                                    # short
        [float("nan")] * 16,                                # non-finite
        [float("inf")] * 16,
        "not a list",
        [0.0] * 16,                                         # zero bases
    ],
    ids=["short", "nan", "inf", "not-a-list", "zero-bases"],
)
def test_an_unusable_wall_transform_is_skipped_not_raised(transform):
    doc = captured_room_json()
    doc["walls"].append(wall("broken", [4.0, 2.5, 0.1], transform))
    spec = build_scene_spec(doc)

    assert spec.count("wall") == 4, "the four good walls survive"
    assert any("wall 4" in w for w in spec.warnings)


def test_a_wall_with_only_one_real_dimension_is_skipped():
    """All-default sizing would put a 10 cm cube where a wall belongs — worse
    than the hole it fills, so the element drops out instead."""
    doc = {"walls": [wall("flat", [4.0, 0.0, 0.0], wall_at(0.0, 0.0, 0.0)["transform"])]}
    spec = build_scene_spec(doc)
    assert spec.is_empty
    assert any("wall 0" in w for w in spec.warnings)


def test_junk_elements_do_not_stop_the_good_ones(prod_room):
    doc = dict(prod_room)
    doc["walls"] = [*prod_room["walls"], "a string", {"dimensions": [1.0, 2.0]}]
    doc["objects"] = [{}, *prod_room["objects"]]
    spec = build_scene_spec(doc)

    assert spec.count("wall") == 4
    assert spec.count("object") == 7
    assert any("wall 4" in w for w in spec.warnings)
    assert any("object 0" in w for w in spec.warnings)


# ── the room's own frame ────────────────────────────────────────────────────


def test_the_room_frame_is_the_ROOM_not_its_axis_aligned_shadow(prod_room):
    """The real capture is a 7.77 × 3.64 m galley yawed 142°, whose world box is
    8.80 × 8.18 — nearly square, and a shape the room does not have. Cameras
    inset from that box stood outside the end walls (W2-EVIDENCE.md §13)."""
    spec = build_scene_spec(prod_room)
    frame = room_frame(spec)

    assert spec.bbox.size[0] == pytest.approx(8.795, abs=1e-3)
    assert spec.bbox.size[1] == pytest.approx(8.177, abs=1e-3)
    assert frame.half_xy == pytest.approx((3.887, 1.818), abs=1e-3)
    assert math.degrees(frame.yaw) == pytest.approx(142.083, abs=1e-3)


def test_the_frame_takes_its_yaw_from_the_LONGEST_wall(prod_room):
    """A stub, a closet return or a fragment of a bay would give the room an
    orientation it does not have. The two 7.673 m walls are the long ones."""
    spec = build_scene_spec(prod_room)
    walls = [b for b in spec.boxes if b.kind == "wall"]
    longest = max(walls, key=lambda b: b.size[0])
    assert longest.size[0] == pytest.approx(7.673, abs=1e-3)
    assert room_frame(spec).yaw == pytest.approx(longest.rotation_z % math.pi)


def test_facing_walls_report_opposite_directions_of_ONE_axis(prod_room):
    """`wall_00` runs at −37.92° and `wall_03` at 142.08° — the same line. The
    modulo is what stops the frame flipping on which of the two is longest."""
    spec = build_scene_spec(prod_room)
    yaws = sorted(round(b.rotation_z % math.pi, 6) for b in spec.boxes if b.kind == "wall")
    assert len(set(yaws)) == 2, "a rectangular room has two wall axes, not four"
    assert yaws[1] - yaws[0] < 1e-5 and yaws[3] - yaws[2] < 1e-5
    assert yaws[2] - yaws[0] == pytest.approx(math.pi / 2, abs=1e-3)


def test_every_interior_camera_of_the_REAL_room_stands_inside_its_walls(prod_room):
    """The end-to-end claim, on the capture that broke it."""
    spec = build_scene_spec(prod_room)
    frame = room_frame(spec)
    cos_y, sin_y = math.cos(frame.yaw), math.sin(frame.yaw)
    hu, hv = frame.half_xy
    inside = 0
    for shot in plan_cameras(frame):
        if shot.kind == "orthographic":
            continue
        dx = shot.location[0] - frame.center_xy[0]
        dy = shot.location[1] - frame.center_xy[1]
        assert abs(dx * cos_y + dy * sin_y) < hu, shot.name
        assert abs(-dx * sin_y + dy * cos_y) < hv, shot.name
        assert spec.bbox.floor_z < shot.location[2] < spec.bbox.max[2]
        inside += 1
    assert inside == 28


def test_the_world_aligned_reading_is_what_put_a_camera_through_a_wall(prod_room):
    """The regression this frame exists to prevent, stated as the failure it was.

    Insetting from the 8.80 × 8.17 world box puts all FOUR corner stations
    outside a 7.77 × 3.64 room — two past an end wall at u ≈ ±4.8, two clean
    through a side wall at v ≈ ±4.4 to ±5.1, standing 2.6 m out in the void and
    photographing a wall's OUTER face from close range. That is what the first
    staging cycle rendered."""
    spec = build_scene_spec(prod_room)
    frame = room_frame(spec)
    cos_y, sin_y = math.cos(frame.yaw), math.sin(frame.yaw)
    hu, hv = frame.half_xy
    outside = 0
    for shot in plan_cameras(spec.bbox):
        if not shot.name.startswith("corner_"):
            continue
        dx = shot.location[0] - frame.center_xy[0]
        dy = shot.location[1] - frame.center_xy[1]
        u, v = dx * cos_y + dy * sin_y, -dx * sin_y + dy * cos_y
        if abs(u) > hu or abs(v) > hv:
            outside += 1
    assert outside == 4


def test_a_room_with_no_usable_walls_falls_back_to_the_world_frame():
    """Not a failure: a capture with objects but no shell still renders, from
    the reading this stage used everywhere before it had an oriented one."""
    spec = build_scene_spec({"walls": [], "objects": [
        {"dimensions": [1.0, 1.0, 1.0],
         "transform": [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0.5, 0, 1]},
    ]})
    frame = room_frame(spec)
    assert frame.yaw == 0.0
    assert frame == RoomFrame.from_bbox(spec.bbox)
