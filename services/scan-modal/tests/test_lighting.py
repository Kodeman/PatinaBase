"""The lighting plan — bbox and shot in, lamps out. No bpy.

`plan_lighting` is the pure half of the seam `BpyScene.render` applies. It is
tested here rather than through a render because the thing that was wrong with
the old rig was a NUMBER, not a bpy call: a key light one metre off 3.3 m walls,
at 220 W per square metre, burnt the top-down plate to white (W2-EVIDENCE §10).
"""

from __future__ import annotations

import json
import math
from pathlib import Path

import pytest

from scan_modal.core.blender_ops import (
    CEILING_DROP_M,
    INTERIOR_WATTS_PER_SQM,
    INTERIOR_WORLD_AMBIENT,
    MIN_LIGHT_CLEARANCE_M,
    MIN_LIGHT_SIZE_M,
    QUADRANT_LIGHT_FRACTION,
    TOP_DOWN_LIGHT_HEIGHT_M,
    TOP_DOWN_LIGHT_SPREAD,
    TOP_DOWN_WATTS_PER_SQM,
    TOP_DOWN_WORLD_AMBIENT,
    plan_lighting,
)
from scan_modal.core.cameras import Bbox, plan_cameras
from scan_modal.core.parametric_scene import build_scene_spec, room_frame

# 4 m × 3 m × 2.5 m, floor at z = 0 — 12 m² of floor, wall tops at 2.5.
ROOM = Bbox.from_points((-2.0, -1.5, 0.0), (2.0, 1.5, 2.5))

SHOTS = {shot.name: shot for shot in plan_cameras(ROOM)}
CORNER = SHOTS["corner_ne"]
TOP_DOWN = SHOTS["top_down"]
PAN = SHOTS["turntable_000"]


# ── the interior rig ────────────────────────────────────────────────────────


def test_the_interior_rig_is_four_ceiling_quadrants():
    plan = plan_lighting(ROOM, CORNER)
    assert [light.name for light in plan.lights] == [
        "ceiling_ne", "ceiling_nw", "ceiling_sw", "ceiling_se",
    ]


def test_interior_lights_hang_just_below_the_wall_tops_over_each_quadrant():
    """Hand-computed: quadrant centres at (±sx/4, ±sy/4) = (±1.0, ±0.75), hung
    2.5 − 0.15 = 2.35 m up."""
    lights = {light.name: light for light in plan_lighting(ROOM, CORNER).lights}
    assert lights["ceiling_ne"].location == pytest.approx((1.0, 0.75, 2.35))
    assert lights["ceiling_nw"].location == pytest.approx((-1.0, 0.75, 2.35))
    assert lights["ceiling_sw"].location == pytest.approx((-1.0, -0.75, 2.35))
    assert lights["ceiling_se"].location == pytest.approx((1.0, -0.75, 2.35))
    assert CEILING_DROP_M == 0.15


def test_interior_lights_are_BELOW_the_wall_tops_not_above_them():
    """The defect in one assertion. The old key sat at `bbox top + 1.0`."""
    for bbox in (ROOM, Bbox.from_points((-4.1, -3.7, -1.3), (4.1, 3.7, 2.05))):
        for light in plan_lighting(bbox, CORNER).lights:
            assert light.location[2] < bbox.max[2]
            assert light.location[2] > bbox.floor_z


def test_interior_power_splits_the_room_budget_four_ways():
    """12 m² × 5 W/m² = 60 W total, 15 W each."""
    lights = plan_lighting(ROOM, CORNER).lights
    assert [light.watts for light in lights] == pytest.approx([15.0] * 4)
    assert sum(light.watts for light in lights) == pytest.approx(INTERIOR_WATTS_PER_SQM * 12.0)


def test_each_quadrant_light_is_a_rectangle_sized_to_its_quadrant():
    """4/2 × 0.8 = 1.6 across, 3/2 × 0.8 = 1.2 deep — a square emitter over an
    oblong room pools its light down the short axis."""
    light = plan_lighting(ROOM, CORNER).lights[0]
    assert light.size_x == pytest.approx(1.6)
    assert light.size_y == pytest.approx(1.2)
    assert QUADRANT_LIGHT_FRACTION == 0.8


def test_the_interior_world_is_a_weak_background():
    assert plan_lighting(ROOM, CORNER).world_ambient == INTERIOR_WORLD_AMBIENT
    assert 0.0 < INTERIOR_WORLD_AMBIENT < 0.2


def test_the_pan_gets_the_same_rig_as_the_corners():
    assert plan_lighting(ROOM, PAN) == plan_lighting(ROOM, CORNER)


# ── the top-down rig ────────────────────────────────────────────────────────


def test_the_plan_plate_gets_one_high_broad_key_and_a_bright_dome():
    plan = plan_lighting(ROOM, TOP_DOWN)
    assert [light.name for light in plan.lights] == ["plan_key"]
    key = plan.lights[0]
    # 2.5 + 6.0 above the floor, 4 × 1.5 by 3 × 1.5 across, 12 m² × 8 W/m².
    assert key.location == pytest.approx((0.0, 0.0, 8.5))
    assert (key.size_x, key.size_y) == pytest.approx((6.0, 4.5))
    assert key.watts == pytest.approx(96.0)
    assert plan.world_ambient == TOP_DOWN_WORLD_AMBIENT


def test_the_plan_key_clears_the_wall_tops_by_metres_not_by_one():
    """The exact defect: a key at `top + 1.0` is a metre off the wall caps the
    plan plate looks straight at, and burns them white. Six metres of falloff
    is what makes the illumination across the plan nearly flat."""
    key = plan_lighting(ROOM, TOP_DOWN).lights[0]
    assert key.location[2] - ROOM.max[2] == pytest.approx(TOP_DOWN_LIGHT_HEIGHT_M)
    assert TOP_DOWN_LIGHT_HEIGHT_M >= 4.0


def test_the_plan_relies_on_the_dome_more_than_the_interior_frames_do():
    """Even illumination and soft contact shading is what makes a plan
    readable; the two rigs are sized independently against the same room and
    their wattages are not comparable — the plan key is four times further away
    than the ceiling lights and there is one of it, not four."""
    assert TOP_DOWN_WORLD_AMBIENT > INTERIOR_WORLD_AMBIENT
    assert TOP_DOWN_LIGHT_SPREAD > 1.0
    assert INTERIOR_WATTS_PER_SQM > 0.0 and TOP_DOWN_WATTS_PER_SQM > 0.0


# ── the rule that chooses between them ──────────────────────────────────────


def test_the_rig_is_chosen_by_shot_KIND_not_by_shot_name():
    """A future ortho shot under any name must still get the plan rig, and a
    perspective shot named `top_down` must not."""
    from dataclasses import replace

    renamed_ortho = replace(TOP_DOWN, name="site_plan")
    assert plan_lighting(ROOM, renamed_ortho) == plan_lighting(ROOM, TOP_DOWN)

    mislabelled = replace(CORNER, name="top_down")
    assert plan_lighting(ROOM, mislabelled) == plan_lighting(ROOM, CORNER)


def test_the_plan_is_deterministic_for_the_same_bbox_and_shot():
    for shot in (CORNER, TOP_DOWN, PAN):
        assert plan_lighting(ROOM, shot) == plan_lighting(ROOM, shot)


def test_a_degenerate_bbox_still_yields_lit_lamps_of_real_size():
    """A flat model floors both horizontal extents at 0.5 m, so nothing asks
    Blender for a zero-watt light or a zero-sized emitter."""
    flat = Bbox.from_points((0.0, 0.0, 0.0), (0.0, 0.0, 0.0))
    for shot in (CORNER, TOP_DOWN):
        for light in plan_lighting(flat, shot).lights:
            assert light.watts > 0.0
            assert light.size_x > 0.0 and light.size_y > 0.0


def test_power_scales_with_floor_area_so_a_big_room_is_not_underlit():
    big = Bbox.from_points((-10.0, -10.0, 0.0), (10.0, 10.0, 3.0))
    small_total = sum(light.watts for light in plan_lighting(ROOM, CORNER).lights)
    big_total = sum(light.watts for light in plan_lighting(big, CORNER).lights)
    assert big_total == pytest.approx(small_total * 400.0 / 12.0)


# ── the rig follows the cameras into the room ───────────────────────────────

FIXTURE = Path(__file__).parent / "fixtures" / "captured_room_prod_copy.json"


@pytest.fixture(scope="module")
def prod_frame():
    spec = build_scene_spec(json.loads(FIXTURE.read_text()))
    return spec, room_frame(spec)


def test_every_interior_lamp_of_the_REAL_room_hangs_INSIDE_its_walls(prod_frame):
    """The defect this test exists for: the cameras were moved into the room's
    own frame and the lighting was not. Planned off the world box, `ceiling_ne`
    and `ceiling_sw` hung 0.8 m and 1.5 m the far side of a side wall — half the
    rig's power emitted into the void, and every frame in a yawed room lit
    differently from the same room square to the axes."""
    spec, frame = prod_frame
    cos_y, sin_y = math.cos(frame.yaw), math.sin(frame.yaw)
    hu, hv = frame.half_xy

    for light in plan_lighting(frame, CORNER).lights:
        dx = light.location[0] - frame.center_xy[0]
        dy = light.location[1] - frame.center_xy[1]
        assert abs(dx * cos_y + dy * sin_y) < hu, light.name
        assert abs(-dx * sin_y + dy * cos_y) < hv, light.name
        assert spec.bbox.floor_z < light.location[2] < spec.bbox.max[2]


def test_the_world_aligned_rig_is_what_hung_lamps_behind_a_wall(prod_frame):
    """Stated as the failure, so the fix cannot quietly revert."""
    spec, frame = prod_frame
    cos_y, sin_y = math.cos(frame.yaw), math.sin(frame.yaw)
    outside = 0
    for light in plan_lighting(spec.bbox, CORNER).lights:
        dx = light.location[0] - frame.center_xy[0]
        dy = light.location[1] - frame.center_xy[1]
        if abs(-dx * sin_y + dy * cos_y) > frame.half_xy[1]:
            outside += 1
    assert outside == 2


def test_interior_power_is_scaled_by_the_ROOMs_area_not_its_bounding_box(prod_frame):
    """7.774 × 3.636 = 28.27 m² of room inside a 71.94 m² box. Sized off the
    box, this room would draw 2.5× the nominal wattage — so a room's exposure
    would depend on how it happens to sit relative to the world axes."""
    spec, frame = prod_frame
    room_area = 4.0 * frame.half_xy[0] * frame.half_xy[1]
    box_area = spec.bbox.size[0] * spec.bbox.size[1]
    assert room_area == pytest.approx(28.27, abs=0.05)
    assert box_area == pytest.approx(71.94, abs=0.05)

    total = sum(light.watts for light in plan_lighting(frame, CORNER).lights)
    assert total == pytest.approx(INTERIOR_WATTS_PER_SQM * room_area)
    assert total < INTERIOR_WATTS_PER_SQM * box_area / 2.0


def test_the_quadrant_lamps_are_yawed_to_the_room(prod_frame):
    _, frame = prod_frame
    for light in plan_lighting(frame, CORNER).lights:
        assert light.rotation_z == pytest.approx(frame.yaw)
    # ...and the plan key is not: it lights a world-aligned shot.
    assert plan_lighting(frame, TOP_DOWN).lights[0].rotation_z == 0.0


def test_the_plan_key_still_frames_and_lights_the_WORLD_box(prod_frame):
    """The one shot that is genuinely world-aligned: an ortho camera looking
    straight down has world X across its frame, and its key has to cover the
    field that frame shows, not the rotated room inside it."""
    spec, frame = prod_frame
    key = plan_lighting(frame, TOP_DOWN).lights[0]
    assert key.size_x == pytest.approx(spec.bbox.size[0] * TOP_DOWN_LIGHT_SPREAD)
    assert key.size_y == pytest.approx(spec.bbox.size[1] * TOP_DOWN_LIGHT_SPREAD)
    assert key.location[:2] == pytest.approx(spec.bbox.centroid[:2])


def test_a_shallow_scene_does_not_hang_its_lamps_UNDER_the_floor():
    """A capture with a floor element and no walls is not empty, so `renders`
    accepts it — and its bbox is centimetres tall. Dropping 0.15 m below the top
    would put the whole rig beneath the slab, which occludes it: 28 frames lit
    by the world term alone, uploaded, registered and marked succeeded."""
    shallow = Bbox.from_points((-3.0, -2.0, -0.05), (3.0, 2.0, 0.0))
    for light in plan_lighting(shallow, CORNER).lights:
        assert light.location[2] > shallow.max[2] - CEILING_DROP_M
        assert light.location[2] > shallow.floor_z
    assert plan_lighting(shallow, CORNER).lights[0].location[2] == pytest.approx(
        shallow.floor_z + MIN_LIGHT_CLEARANCE_M
    )


def test_the_planned_emitter_size_is_the_size_blender_receives():
    """The floor used to live at the bpy seam, below the planner, so every
    assertion in this file was a claim about a number Blender never saw."""
    tiny = Bbox.from_points((-0.3, -0.2, 0.0), (0.3, 0.2, 2.4))
    for light in plan_lighting(tiny, CORNER).lights:
        assert light.size_x == pytest.approx(MIN_LIGHT_SIZE_M)
        assert light.size_y == pytest.approx(MIN_LIGHT_SIZE_M)
