"""The `renders` camera plan — bbox in, expected positions out.

The plan is an artifact list: 29 registered `media_objects` rows whose keys are
derived from the shot names. So the tests below pin the SET and the ORDER as
hard as they pin the geometry — a renamed or reordered shot silently repoints
every render key for every future scan.
"""

from __future__ import annotations

import math

import pytest

from scan_modal.core.cameras import (
    Bbox,
    BboxError,
    CORNER_STANDOFF,
    EYE_HEIGHT_M,
    TOP_DOWN_PADDING,
    TURNTABLE_FRAMES,
    TURNTABLE_STANDOFF,
    plan_cameras,
)

# A 4 m × 3 m × 2.5 m room, floor at z = 0, centred on the origin in XY —
# the same room `tests/_synthetic.py` builds, expressed Z-up as Blender's glTF
# importer would leave it.
ROOM = Bbox.from_points((-2.0, -1.5, 0.0), (2.0, 1.5, 2.5))


def by_name(bbox=ROOM):
    return {shot.name: shot for shot in plan_cameras(bbox)}


# ── the shot set ────────────────────────────────────────────────────────────


def test_the_plan_is_four_corners_one_top_down_and_a_full_turntable():
    shots = plan_cameras(ROOM)
    assert len(shots) == 4 + 1 + TURNTABLE_FRAMES == 29
    assert [s.name for s in shots[:5]] == [
        "corner_ne", "corner_nw", "corner_sw", "corner_se", "top_down",
    ]
    assert shots[5].name == "turntable_000"
    assert shots[-1].name == f"turntable_{TURNTABLE_FRAMES - 1:03d}"


def test_shot_names_are_unique_because_they_become_object_keys():
    names = [s.name for s in plan_cameras(ROOM)]
    assert len(set(names)) == len(names)


def test_only_the_top_down_is_orthographic():
    ortho = [s.name for s in plan_cameras(ROOM) if s.kind == "orthographic"]
    assert ortho == ["top_down"]


def test_the_plan_is_deterministic_for_the_same_bbox():
    first = [(s.name, s.location, s.look_at, s.ortho_scale) for s in plan_cameras(ROOM)]
    second = [(s.name, s.location, s.look_at, s.ortho_scale) for s in plan_cameras(ROOM)]
    assert first == second


# ── the corner shots ────────────────────────────────────────────────────────


def test_corner_positions_are_the_bbox_corners_pushed_out_by_the_standoff():
    # Half-extents 2.0 × 1.5, standoff 1.35 → (±2.7, ±2.025), at eye height.
    expected_x = 2.0 * CORNER_STANDOFF
    expected_y = 1.5 * CORNER_STANDOFF
    corners = by_name()
    assert corners["corner_ne"].location == pytest.approx((expected_x, expected_y, EYE_HEIGHT_M))
    assert corners["corner_nw"].location == pytest.approx((-expected_x, expected_y, EYE_HEIGHT_M))
    assert corners["corner_sw"].location == pytest.approx((-expected_x, -expected_y, EYE_HEIGHT_M))
    assert corners["corner_se"].location == pytest.approx((expected_x, -expected_y, EYE_HEIGHT_M))


def test_corner_cameras_stand_at_eye_height_above_the_FLOOR_not_the_origin():
    """A room whose floor is not at z = 0 — a second storey, or a model the
    importer left offset — must still put the lens 1.5 m above ITS floor."""
    raised = Bbox.from_points((-2.0, -1.5, 7.0), (2.0, 1.5, 9.5))
    for name, shot in by_name(raised).items():
        if name.startswith("corner_") or name.startswith("turntable_"):
            assert shot.location[2] == pytest.approx(7.0 + EYE_HEIGHT_M)


def test_every_corner_looks_at_the_centroid():
    for name, shot in by_name().items():
        if name.startswith("corner_"):
            assert shot.look_at == pytest.approx((0.0, 0.0, 1.25))


def test_corner_cameras_stand_outside_the_room():
    for name, shot in by_name().items():
        if not name.startswith("corner_"):
            continue
        assert abs(shot.location[0]) > 2.0
        assert abs(shot.location[1]) > 1.5


def test_corner_shots_carry_the_lens_the_top_down_does_not():
    shots = by_name()
    assert shots["corner_ne"].focal_mm == 24.0
    assert shots["corner_ne"].sensor_mm == 36.0
    assert shots["corner_ne"].ortho_scale is None
    assert shots["top_down"].focal_mm is None


# ── the top-down plate ──────────────────────────────────────────────────────


def test_top_down_sits_above_the_centroid_and_looks_straight_down():
    top = by_name()["top_down"]
    assert top.location[0] == pytest.approx(0.0)
    assert top.location[1] == pytest.approx(0.0)
    assert top.location[2] > 2.5  # clears the ceiling
    assert top.look_at[0] == pytest.approx(top.location[0])
    assert top.look_at[1] == pytest.approx(top.location[1])
    assert top.look_at[2] < top.location[2]


def test_top_down_ortho_scale_frames_the_LONGER_horizontal_axis():
    """Framing on the shorter axis would crop the room out of a 4:3 plate."""
    assert by_name()["top_down"].ortho_scale == pytest.approx(4.0 * TOP_DOWN_PADDING)
    tall = Bbox.from_points((-1.0, -5.0, 0.0), (1.0, 5.0, 2.5))
    assert by_name(tall)["top_down"].ortho_scale == pytest.approx(10.0 * TOP_DOWN_PADDING)


# ── the turntable ───────────────────────────────────────────────────────────


def test_the_turntable_is_a_closed_ring_at_a_constant_radius():
    radius = math.hypot(2.0, 1.5) * TURNTABLE_STANDOFF
    ring = [s for s in plan_cameras(ROOM) if s.name.startswith("turntable_")]
    assert len(ring) == TURNTABLE_FRAMES
    for shot in ring:
        assert math.hypot(shot.location[0], shot.location[1]) == pytest.approx(radius)
        assert shot.location[2] == pytest.approx(EYE_HEIGHT_M)
        assert shot.look_at == pytest.approx((0.0, 0.0, 1.25))


def test_the_turntable_starts_on_plus_x_and_steps_by_a_full_turn_over_the_set():
    ring = [s for s in plan_cameras(ROOM) if s.name.startswith("turntable_")]
    radius = math.hypot(2.0, 1.5) * TURNTABLE_STANDOFF
    assert ring[0].location == pytest.approx((radius, 0.0, EYE_HEIGHT_M))
    # 24 frames, 15° apart — frame 6 is a quarter turn.
    assert ring[6].location == pytest.approx((0.0, radius, EYE_HEIGHT_M), abs=1e-9)
    assert ring[12].location == pytest.approx((-radius, 0.0, EYE_HEIGHT_M), abs=1e-9)


def test_the_turntable_ring_clears_the_room_it_orbits():
    radius = math.hypot(2.0, 1.5) * TURNTABLE_STANDOFF
    assert radius > math.hypot(2.0, 1.5)


# ── degenerate input ────────────────────────────────────────────────────────


def test_a_flat_bbox_still_produces_cameras_outside_itself():
    """A single-plane import would otherwise give a zero radius and put every
    camera inside the geometry."""
    flat = Bbox.from_points((0.0, 0.0, 0.0), (0.0, 0.0, 0.0))
    shots = plan_cameras(flat)
    assert len(shots) == 29
    for shot in shots:
        assert shot.location != shot.look_at


def test_an_inverted_bbox_is_refused():
    with pytest.raises(BboxError):
        Bbox.from_points((1.0, 1.0, 1.0), (0.0, 2.0, 2.0))


def test_a_non_finite_bbox_is_refused():
    with pytest.raises(BboxError):
        Bbox.from_points((0.0, 0.0, 0.0), (float("nan"), 1.0, 1.0))


def test_a_wrong_length_bbox_is_refused():
    with pytest.raises(BboxError):
        Bbox.from_points((0.0, 0.0), (1.0, 1.0, 1.0))


def test_bbox_derived_quantities():
    assert ROOM.centroid == pytest.approx((0.0, 0.0, 1.25))
    assert ROOM.size == pytest.approx((4.0, 3.0, 2.5))
    assert ROOM.floor_z == 0.0
