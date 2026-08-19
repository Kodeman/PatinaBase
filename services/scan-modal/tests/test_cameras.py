"""The `renders` camera plan — bbox in, expected positions out.

The plan is an artifact list: 29 registered `media_objects` rows whose keys are
derived from the shot names. So the tests below pin the SET and the ORDER as
hard as they pin the geometry — a renamed or reordered shot silently repoints
every render key for every future scan.

Every expected coordinate here is HAND-COMPUTED from the fixture's dimensions
and written out as arithmetic, not as a call back into the module. A test that
recomputed the answer with the code's own expression would pass for any value
of the constants, which is exactly the failure that let the exterior camera plan
survive a full green suite while photographing the outside of the room.
"""

from __future__ import annotations

import math

import pytest

from scan_modal.core.cameras import (
    Bbox,
    BboxError,
    RoomFrame,
    CORNER_INSET_M,
    CORNER_MAX_REACH,
    CORNER_MIN_REACH,
    EYE_HEIGHT_M,
    PAN_ORBIT_FRACTION,
    PAN_ORBIT_MAX_M,
    PAN_TARGET_HEIGHT_M,
    RENDER_HEIGHT,
    RENDER_WIDTH,
    TOP_DOWN_PADDING,
    TURNTABLE_FRAMES,
    corner_reach,
    pan_radius,
    plan_cameras,
    wall_distance,
)

# A 4 m × 3 m × 2.5 m room, floor at z = 0, centred on the origin in XY —
# the same room `tests/_synthetic.py` builds, expressed Z-up as Blender's glTF
# importer would leave it. Half-extents 2.0 × 1.5.
ROOM = Bbox.from_points((-2.0, -1.5, 0.0), (2.0, 1.5, 2.5))

# A corridor: 1.2 m wide, 9 m long, 2.6 m tall. Half-extents 0.6 × 4.5 — the
# shape where "stand 0.5 m in from the wall" and "orbit near the centre" both
# have to give way, and the case the old exterior plan never had to think about.
NARROW = Bbox.from_points((-0.6, -4.5, 0.0), (0.6, 4.5, 2.6))

# The real staging scan (W2-EVIDENCE §10): 8.227 × 7.505 m, floor below z = 0.
DEEP = Bbox.from_points((-6.059, -2.035, -1.303), (2.168, 5.470, 2.047))


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


# ── the corner shots: INSIDE the room ───────────────────────────────────────


def test_corner_reach_is_the_inset_between_its_two_clamps():
    # Ordinary room: 2.0 − 0.5 = 1.5, inside [0.5, 1.6], so the inset wins.
    assert corner_reach(2.0) == pytest.approx(1.5)
    # Big room: 6.0 − 0.5 = 5.5 would be 92% of the way out, past the 80% cap
    # that keeps a yawed room's cameras off its walls. 6.0 × 0.8 = 4.8.
    assert corner_reach(6.0) == pytest.approx(4.8)
    # Small room: 0.4 − 0.5 is NEGATIVE — an unclamped inset sends the camera
    # through the centre and out the far side. The 25% floor is 0.1.
    assert corner_reach(0.4) == pytest.approx(0.1)
    assert CORNER_INSET_M == 0.5 and CORNER_MAX_REACH == 0.8 and CORNER_MIN_REACH == 0.25


def test_corner_positions_are_inset_from_the_bbox_corners_at_eye_height():
    # Half-extents 2.0 × 1.5, inset 0.5 → (±1.5, ±1.0), 1.5 m above the floor.
    corners = by_name()
    assert corners["corner_ne"].location == pytest.approx((1.5, 1.0, 1.5))
    assert corners["corner_nw"].location == pytest.approx((-1.5, 1.0, 1.5))
    assert corners["corner_sw"].location == pytest.approx((-1.5, -1.0, 1.5))
    assert corners["corner_se"].location == pytest.approx((1.5, -1.0, 1.5))


def test_every_corner_camera_stands_INSIDE_the_room():
    """The whole point of this wave. The old plan pushed every corner camera to
    1.35× the corner offset, so all four photographed the outside of the shell."""
    for bbox in (ROOM, NARROW, DEEP):
        lo, hi = bbox.min, bbox.max
        for name, shot in by_name(bbox).items():
            if not name.startswith("corner_"):
                continue
            x, y, z = shot.location
            assert lo[0] < x < hi[0], f"{name} of {bbox} is outside in X"
            assert lo[1] < y < hi[1], f"{name} of {bbox} is outside in Y"
            assert lo[2] < z < hi[2], f"{name} of {bbox} is outside in Z"


def test_each_corner_looks_diagonally_across_at_the_opposite_corner():
    # Mirror of the camera station, at the room's mid-height (0 + 2.5) / 2.
    corners = by_name()
    assert corners["corner_ne"].look_at == pytest.approx((-1.5, -1.0, 1.25))
    assert corners["corner_nw"].look_at == pytest.approx((1.5, -1.0, 1.25))
    assert corners["corner_sw"].look_at == pytest.approx((1.5, 1.0, 1.25))
    assert corners["corner_se"].look_at == pytest.approx((-1.5, 1.0, 1.25))


def test_corner_cameras_stand_at_eye_height_above_the_FLOOR_not_the_origin():
    """A room whose floor is not at z = 0 — a second storey, or a model the
    importer left offset — must still put the lens 1.5 m above ITS floor."""
    raised = Bbox.from_points((-2.0, -1.5, 7.0), (2.0, 1.5, 9.5))
    for name, shot in by_name(raised).items():
        if name.startswith("corner_") or name.startswith("turntable_"):
            assert shot.location[2] == pytest.approx(7.0 + EYE_HEIGHT_M)


def test_a_narrow_room_keeps_its_corner_cameras_off_the_long_walls():
    """Half-extents 0.6 × 4.5. Across the corridor the inset would leave only
    0.1 m — below the 25% floor — so the reach is 0.6 × 0.25 = 0.15. Along it,
    4.5 − 0.5 = 4.0 exceeds the 80% cap, so the reach is 4.5 × 0.8 = 3.6."""
    corners = by_name(NARROW)
    assert corners["corner_ne"].location == pytest.approx((0.15, 3.6, 1.5))
    assert corners["corner_sw"].location == pytest.approx((-0.15, -3.6, 1.5))
    assert corners["corner_ne"].look_at == pytest.approx((-0.15, -3.6, 1.3))


def test_a_large_room_corner_is_held_back_by_the_reach_cap():
    """The staging scan: half-extents 4.1135 × 3.7525, both over the 0.5 m inset
    but the X axis is large enough that the 80% cap binds first."""
    cx, cy = (-6.059 + 2.168) / 2.0, (-2.035 + 5.470) / 2.0
    rx = min(max(4.1135 - 0.5, 4.1135 * 0.25), 4.1135 * 0.8)   # 3.2908
    ry = min(max(3.7525 - 0.5, 3.7525 * 0.25), 3.7525 * 0.8)   # 3.0020
    assert rx == pytest.approx(3.2908)
    assert ry == pytest.approx(3.0020)
    assert by_name(DEEP)["corner_ne"].location == pytest.approx(
        (cx + rx, cy + ry, -1.303 + EYE_HEIGHT_M)
    )


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


def test_top_down_ortho_scale_fits_BOTH_axes_in_the_frame():
    """`ortho_scale` spans the render's WIDTH, so depth must be converted into
    width units before the two axes are compared. ROOM is 4 m × 3 m — exactly
    the render's 4:3 — so it is the one shape where framing on the longer axis
    alone is also correct, which is why the bug hid here."""
    aspect = RENDER_WIDTH / RENDER_HEIGHT
    assert by_name()["top_down"].ortho_scale == pytest.approx(4.0 * TOP_DOWN_PADDING)

    # Deeper than 3/4 of its width: framing on max(sx, sy) would crop it.
    tall = Bbox.from_points((-1.0, -5.0, 0.0), (1.0, 5.0, 2.5))
    assert by_name(tall)["top_down"].ortho_scale == pytest.approx(
        10.0 * aspect * TOP_DOWN_PADDING
    )

    # A wide room is still framed on its width.
    wide = Bbox.from_points((-6.0, -1.0, 0.0), (6.0, 1.0, 2.5))
    assert by_name(wide)["top_down"].ortho_scale == pytest.approx(12.0 * TOP_DOWN_PADDING)

    # The corridor is 7.5× deeper than wide: 9.0 × 4/3 × 1.1.
    assert by_name(NARROW)["top_down"].ortho_scale == pytest.approx(
        9.0 * aspect * TOP_DOWN_PADDING
    )


def test_top_down_frame_actually_contains_the_room_for_any_aspect():
    """The property the number is for: both extents fit, with padding to spare."""
    aspect = RENDER_WIDTH / RENDER_HEIGHT
    for bbox in (ROOM, NARROW, DEEP, Bbox.from_points((-1.0, -5.0, 0.0), (1.0, 5.0, 2.5))):
        scale = by_name(bbox)["top_down"].ortho_scale
        sx, sy, _ = bbox.size
        assert scale >= sx * TOP_DOWN_PADDING - 1e-9
        assert scale / aspect >= sy * TOP_DOWN_PADDING - 1e-9


# ── the turntable: an interior pan ──────────────────────────────────────────


def test_pan_radius_is_a_quarter_of_the_half_extent_capped_in_metres():
    assert pan_radius(2.0) == pytest.approx(0.5)
    assert pan_radius(0.6) == pytest.approx(0.15)
    # 10 m half-extent would want 2.5 m; the cap holds it to 1.0.
    assert pan_radius(10.0) == pytest.approx(PAN_ORBIT_MAX_M)
    assert PAN_ORBIT_FRACTION == 0.25 and PAN_ORBIT_MAX_M == 1.0


def test_the_pan_orbits_near_the_centre_and_looks_outward():
    """ROOM: half-extents 2.0 × 1.5 → orbit radii 0.5 × 0.375, and the target
    lands on whichever WALL the heading points at, 0.9 m above the floor."""
    ring = [s for s in plan_cameras(ROOM) if s.name.startswith("turntable_")]
    assert len(ring) == TURNTABLE_FRAMES
    # Frame 0 is heading +X: the camera steps back along −X and looks along +X,
    # at the wall 2.0 m out.
    assert ring[0].location == pytest.approx((-0.5, 0.0, 1.5))
    assert ring[0].look_at == pytest.approx((2.0, 0.0, PAN_TARGET_HEIGHT_M))
    # Frame 6 is a quarter turn — 24 frames, 15° apart — at the 1.5 m wall.
    assert ring[6].location == pytest.approx((0.0, -0.375, 1.5), abs=1e-9)
    assert ring[6].look_at == pytest.approx((0.0, 1.5, PAN_TARGET_HEIGHT_M), abs=1e-9)
    assert ring[12].location == pytest.approx((0.5, 0.0, 1.5), abs=1e-9)
    assert ring[12].look_at == pytest.approx((-2.0, 0.0, PAN_TARGET_HEIGHT_M), abs=1e-9)


def test_the_pan_target_lands_on_the_wall_the_heading_points_at():
    """A single half-diagonal radius for every heading aims PAST the near wall
    when the pan looks across a galley: the frame then centres 1.25 m up a wall
    1.8 m away and the floor falls off the bottom edge (W2-EVIDENCE §13)."""
    # 45° into the corner of a 4 × 3 room: |cos| = |sin|, so the 1.5 m wall
    # binds first at 1.5/sin45 = 2.121.
    assert wall_distance(2.0, 1.5, math.cos(math.pi / 4), math.sin(math.pi / 4)) == \
        pytest.approx(2.1213, abs=1e-4)
    assert wall_distance(2.0, 1.5, 1.0, 0.0) == pytest.approx(2.0)
    assert wall_distance(2.0, 1.5, 0.0, 1.0) == pytest.approx(1.5)

    # And the property: every target sits ON the rectangle, never outside it.
    hu, hv = 3.887, 1.818
    for i in range(TURNTABLE_FRAMES):
        theta = 2.0 * math.pi * i / TURNTABLE_FRAMES
        cos_t, sin_t = math.cos(theta), math.sin(theta)
        d = wall_distance(hu, hv, cos_t, sin_t)
        assert abs(d * cos_t) <= hu + 1e-9
        assert abs(d * sin_t) <= hv + 1e-9
        assert abs(d * cos_t) == pytest.approx(hu) or abs(d * sin_t) == pytest.approx(hv)


def test_the_pan_tilts_STEEPER_when_the_wall_is_closer():
    """The point of measuring the wall: the same 0.6 m drop over a shorter run."""
    narrow = [s for s in plan_cameras(NARROW) if s.name.startswith("turntable_")]
    across = narrow[6]     # heading +Y — the corridor is 9 m long that way
    along = narrow[0]      # heading +X — the wall is 0.6 m away
    def pitch(shot):
        run = math.hypot(shot.look_at[0] - shot.location[0], shot.look_at[1] - shot.location[1])
        return (shot.location[2] - shot.look_at[2]) / run
    assert pitch(along) > pitch(across)


def test_every_pan_camera_stands_INSIDE_the_room():
    for bbox in (ROOM, NARROW, DEEP):
        lo, hi = bbox.min, bbox.max
        for shot in plan_cameras(bbox):
            if not shot.name.startswith("turntable_"):
                continue
            x, y, z = shot.location
            assert lo[0] < x < hi[0]
            assert lo[1] < y < hi[1]
            assert lo[2] < z < hi[2]


def test_the_pan_ellipse_lies_ALONG_a_corridor_not_across_it():
    """The narrow-room fallback: a fixed centre would spend half the strip on a
    wall 0.6 m away. NARROW's radii are 0.15 across and 1.0 (capped) along, so
    the orbit runs down the corridor."""
    ring = [s for s in plan_cameras(NARROW) if s.name.startswith("turntable_")]
    xs = [s.location[0] for s in ring]
    ys = [s.location[1] for s in ring]
    assert max(xs) - min(xs) == pytest.approx(0.30)
    assert max(ys) - min(ys) == pytest.approx(2.00)


def test_the_pan_tilts_DOWN_so_the_frame_carries_floor_not_only_wall():
    for shot in plan_cameras(DEEP):
        if shot.name.startswith("turntable_"):
            assert shot.look_at[2] < shot.location[2]
            assert shot.look_at[2] == pytest.approx(-1.303 + PAN_TARGET_HEIGHT_M)


def test_the_pan_is_a_closed_sweep_of_distinct_headings():
    ring = [s for s in plan_cameras(ROOM) if s.name.startswith("turntable_")]
    headings = {
        (round(s.look_at[0], 9), round(s.look_at[1], 9)) for s in ring
    }
    assert len(headings) == TURNTABLE_FRAMES
    for shot in ring:
        assert shot.location[2] == pytest.approx(EYE_HEIGHT_M)


# ── the room's own frame ────────────────────────────────────────────────────

# A 9 × 4 m room turned 30° off the world axes — the shape of the real staging
# capture, and the one that put two corner cameras against a wall. Its
# axis-aligned box is 9cos30 + 4sin30 = 9.794 by 9sin30 + 4cos30 = 7.964, a
# shape the room does not have.
YAW = math.radians(30.0)


def yawed_frame(length=9.0, width=4.0, height=3.0):
    cos_y, sin_y = math.cos(YAW), math.sin(YAW)
    corners = [
        (u * cos_y - v * sin_y, u * sin_y + v * cos_y)
        for u in (-length / 2.0, length / 2.0)
        for v in (-width / 2.0, width / 2.0)
    ]
    xs = [x for x, _ in corners]
    ys = [y for _, y in corners]
    bbox = Bbox.from_points((min(xs), min(ys), 0.0), (max(xs), max(ys), height))
    return RoomFrame.oriented(bbox, YAW, corners), bbox


def test_the_oriented_frame_measures_the_room_not_its_shadow():
    frame, bbox = yawed_frame()
    assert frame.half_xy == pytest.approx((4.5, 2.0))
    assert frame.center_xy == pytest.approx((0.0, 0.0))
    assert bbox.size[0] == pytest.approx(9.794, abs=1e-3)
    assert bbox.size[1] == pytest.approx(7.964, abs=1e-3)


def test_the_corner_cameras_of_a_YAWED_room_stand_inside_its_WALLS():
    """The cycle-1 defect. Insetting from the axis-aligned box put corner_ne and
    corner_sw flat against a wall, because that box is metres wider than the
    room in the room's own short direction."""
    frame, _ = yawed_frame()
    cos_y, sin_y = math.cos(YAW), math.sin(YAW)
    for shot in plan_cameras(frame):
        if not (shot.name.startswith("corner_") or shot.name.startswith("turntable_")):
            continue
        x, y, _ = shot.location
        # Back into the room's own axes.
        u = x * cos_y + y * sin_y
        v = -x * sin_y + y * cos_y
        assert abs(u) < 4.5, f"{shot.name} is past the end wall"
        assert abs(v) < 2.0, f"{shot.name} is through a side wall"

    # And the world-aligned reading is what would have failed. Its reaches are
    # (3.918, 3.186) off a box measuring 9.794 × 7.964, which lands the camera
    # at u = 4.99 along the room's long axis — 0.49 m PAST the end wall, i.e.
    # outside the shell, photographing a wall's outer face from close range.
    for shot in plan_cameras(frame.bbox):
        if shot.name == "corner_ne":
            x, y, _ = shot.location
            assert x * cos_y + y * sin_y > 4.5


def test_a_yawed_corner_camera_still_looks_at_the_opposite_corner():
    frame, _ = yawed_frame()
    corners = {s.name: s for s in plan_cameras(frame)}
    ne, sw = corners["corner_ne"], corners["corner_sw"]
    # The stations are mirror images through the room centre, and each looks at
    # the other — which is what "across the diagonal" means once the diagonal is
    # the room's and not the bounding box's.
    assert ne.location[0] == pytest.approx(-sw.location[0])
    assert ne.location[1] == pytest.approx(-sw.location[1])
    assert ne.look_at[:2] == pytest.approx(sw.location[:2])


def test_the_plan_plate_stays_WORLD_aligned_even_for_a_yawed_room():
    """An orthographic camera looking straight down has world X across its
    frame. Framing it on the room's rotated extent would crop the corners off."""
    frame, bbox = yawed_frame()
    aspect = RENDER_WIDTH / RENDER_HEIGHT
    top = {s.name: s for s in plan_cameras(frame)}["top_down"]
    sx, sy, _ = bbox.size
    assert top.ortho_scale >= sx * TOP_DOWN_PADDING - 1e-9
    assert top.ortho_scale / aspect >= sy * TOP_DOWN_PADDING - 1e-9


def test_a_bare_bbox_is_read_as_the_world_aligned_frame():
    """The honest reading when nothing knows the orientation, and what keeps the
    degenerate and no-wall cases from needing a caller-side branch."""
    assert plan_cameras(ROOM) == plan_cameras(RoomFrame.from_bbox(ROOM))


def test_an_empty_footprint_falls_back_rather_than_inventing_extents():
    assert RoomFrame.oriented(ROOM, 1.0, []) == RoomFrame.from_bbox(ROOM)
    assert RoomFrame.oriented(ROOM, float("nan"), [(0.0, 0.0)]) == RoomFrame.from_bbox(ROOM)


# ── degenerate input ────────────────────────────────────────────────────────


def test_a_flat_bbox_still_produces_cameras_that_look_somewhere():
    """A single-plane import would otherwise give a zero reach and leave every
    camera sitting on its own look-at point — a zero-length direction, which
    `to_track_quat` cannot turn into a rotation."""
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
    assert math.isclose(NARROW.size[1], 9.0)
