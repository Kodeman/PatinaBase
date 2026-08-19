"""The lighting plan — bbox and shot in, lamps out. No bpy.

`plan_lighting` is the pure half of the seam `BpyScene.render` applies. It is
tested here rather than through a render because the thing that was wrong with
the old rig was a NUMBER, not a bpy call: a key light one metre off 3.3 m walls,
at 220 W per square metre, burnt the top-down plate to white (W2-EVIDENCE §10).
"""

from __future__ import annotations

import pytest

from scan_modal.core.blender_ops import (
    CEILING_DROP_M,
    INTERIOR_WATTS_PER_SQM,
    INTERIOR_WORLD_AMBIENT,
    QUADRANT_LIGHT_FRACTION,
    TOP_DOWN_LIGHT_HEIGHT_M,
    TOP_DOWN_LIGHT_SPREAD,
    TOP_DOWN_WATTS_PER_SQM,
    TOP_DOWN_WORLD_AMBIENT,
    plan_lighting,
)
from scan_modal.core.cameras import Bbox, plan_cameras

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
