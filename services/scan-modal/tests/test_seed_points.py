"""The splat's seed point cloud — a `SceneSpec` in, PLY bytes out.

What these tests are protecting is a claim that cannot be checked after the
fact: that the cloud handed to splatfacto sits ON the room's surfaces, in the
same frame as the camera poses. A seed cloud in the wrong frame does not fail —
it trains, slowly, to a worse result, and looks exactly like the random init it
replaced.
"""

from __future__ import annotations

import math

import numpy as np
import pytest

from _synthetic import captured_room_json
from scan_modal.core.parametric_scene import build_scene_spec
from scan_modal.core.seed_points import (
    KIND_COLOUR,
    SEED_PLY_NAME,
    SEED_TARGET_POINTS,
    build_seed_ply,
    encode_ply,
    sample_scene_points,
)
from scan_modal.core.transforms import ARKIT_TO_NERFSTUDIO
from scan_modal.io.ply import read_ply_vertices

import json
from pathlib import Path

# The 4 m × 3 m × 2.5 m synthetic room: four 0.1 m walls and a synthesized floor
# slab. Inner wall faces at |x| = 1.95 and |y| = 1.45; outer at 2.05 / 1.55.
SPEC = build_scene_spec(captured_room_json())

# The real reduced prod-copy capture — 4 walls at three heights, a floor whose
# local +z is world up, 2 windows, a door, an opening and 7 objects, none of it
# axis-aligned. What the golden digest below is taken over.
PROD_SPEC = build_scene_spec(
    json.loads((Path(__file__).parent / "fixtures" / "captured_room_prod_copy.json").read_text())
)


def with_object() -> object:
    """The same room plus one free-standing object — a 1 × 0.6 × 0.8 m box in
    the middle of the floor. RoomPlan encodes objects with the same column-major
    transform as everything else."""
    doc = captured_room_json()
    doc["objects"] = [
        {
            "category": {"table": {}},
            "dimensions": [1.0, 0.8, 0.6],
            "transform": [
                1.0, 0.0, 0.0, 0.0,
                0.0, 1.0, 0.0, 0.0,
                0.0, 0.0, 1.0, 0.0,
                0.0, 0.4, 0.0, 1.0,
            ],
        }
    ]
    return build_scene_spec(doc)


# ── counts ──────────────────────────────────────────────────────────────────


def test_the_sampler_hits_its_target_exactly():
    """Largest-remainder allocation, so the counts sum to the target rather than
    to the target minus a rounding error per face."""
    for target in (100, 1_001, 50_000, SEED_TARGET_POINTS):
        assert len(sample_scene_points(SPEC, target)) == target


def test_a_target_smaller_than_the_face_count_still_sums_exactly():
    cloud = sample_scene_points(SPEC, 3)
    assert len(cloud) == 3


def test_an_empty_spec_yields_an_empty_cloud_rather_than_raising():
    """A scan whose parametric room is unreadable must still train, unseeded —
    which is what every run did before seeding existed."""
    empty = build_scene_spec({})
    cloud = sample_scene_points(empty)
    assert len(cloud) == 0
    assert cloud.xyz.shape == (0, 3) and cloud.rgb.shape == (0, 3)
    ply, count = build_seed_ply(empty)
    assert count == 0
    assert ply.endswith(b"end_header\n") and b"element vertex 0" in ply


def test_a_zero_target_yields_nothing():
    assert len(sample_scene_points(SPEC, 0)) == 0


# ── determinism ─────────────────────────────────────────────────────────────


def test_the_same_room_samples_to_the_same_points_every_time():
    first, second = sample_scene_points(SPEC), sample_scene_points(SPEC)
    assert np.array_equal(first.xyz, second.xyz)
    assert np.array_equal(first.rgb, second.rgb)


def test_the_same_room_encodes_to_the_same_BYTES_every_time():
    """Two calls in one process only prove the function is pure. The claim that
    matters is stability across processes and releases, so it is pinned as a
    GOLDEN DIGEST of the real capture's cloud — which fails if the Halton
    indexing, the face selection, the density weights, the allocation, the
    colours or the PLY layout move at all.

    Regenerating this number is a decision, not a fix: the seed cloud is an
    input to a 60-minute L4 run, and two rooms that produce different clouds
    from the same document cannot be compared."""
    import hashlib

    ply, count = build_seed_ply(PROD_SPEC)
    assert count == SEED_TARGET_POINTS
    assert len(ply) == 1_500_222
    assert hashlib.sha256(ply).hexdigest() == (
        "7452680b3b6f068b78806c7d21b4165c30c3d8feeaec160af43bd1762d7dc433"
    )


def test_no_two_points_are_the_same_point():
    """A Halton sequence indexed by a running counter, not restarted per face —
    restarting it would give every face of every box the identical pattern."""
    cloud = sample_scene_points(SPEC, 20_000)
    unique = np.unique(np.round(cloud.xyz, 9), axis=0)
    assert unique.shape[0] == 20_000


# ── the points are on the surfaces ──────────────────────────────────────────


def _on_some_box_surface(spec, points: np.ndarray, eps: float = 1e-9) -> np.ndarray:
    """True per point iff it lies on the boundary of at least one box."""
    hit = np.zeros(points.shape[0], dtype=bool)
    for box in spec.boxes:
        cos_r, sin_r = math.cos(box.rotation_z), math.sin(box.rotation_z)
        d = points - np.array(box.center)
        local = np.empty_like(d)
        local[:, 0] = cos_r * d[:, 0] + sin_r * d[:, 1]
        local[:, 1] = -sin_r * d[:, 0] + cos_r * d[:, 1]
        local[:, 2] = d[:, 2]
        half = np.array(box.size) / 2.0
        inside = np.all(np.abs(local) <= half + eps, axis=1)
        on_face = np.any(np.abs(np.abs(local) - half) <= eps, axis=1)
        hit |= inside & on_face
    return hit


def test_every_sampled_point_lies_on_a_surface_of_the_room():
    cloud = sample_scene_points(SPEC, 5_000)
    assert _on_some_box_surface(SPEC, cloud.xyz).all()


def test_every_sampled_point_lies_inside_the_scene_bbox():
    cloud = sample_scene_points(SPEC)
    lo, hi = np.array(SPEC.bbox.min), np.array(SPEC.bbox.max)
    assert (cloud.xyz >= lo - 1e-9).all()
    assert (cloud.xyz <= hi + 1e-9).all()


def test_the_shell_is_sampled_on_its_INSIDE_only():
    """Above the floor slab the only geometry is the four walls. Their INNER
    planes are at |x| = 1.95 and |y| = 1.45; their outer planes and their end
    caps are at 2.05 and 1.55. A point out there is a Gaussian seeded behind a
    wall, where no camera stands and no photo constrains it — a floater by
    construction, and unrecoverable once training starts.

    The north and south walls are 4 m long, so their inner faces legitimately
    reach x = ±2.0; the assertion is that nothing reaches ±2.05."""
    cloud = sample_scene_points(SPEC)
    above = cloud.xyz[cloud.xyz[:, 2] > 0.1]
    assert above.shape[0] > 0
    assert np.abs(above[:, 0]).max() <= 2.00 + 1e-9
    assert np.abs(above[:, 1]).max() <= 1.50 + 1e-9
    # ...and that the inner faces are the ones that WERE sampled.
    assert np.isclose(np.abs(above[:, 0]), 1.95).any()
    assert np.isclose(np.abs(above[:, 1]), 1.45).any()


def test_a_wall_s_top_and_bottom_caps_are_not_sampled():
    """The bottom cap is coincident with the floor slab it stands on, and the
    top cap is a 10 cm ledge nothing photographs. Both were kept by the earlier
    sign-of-a-dot-product test."""
    cloud = sample_scene_points(SPEC)
    walls = [b for b in SPEC.boxes if b.kind == "wall"]
    top = max(b.center[2] + b.size[2] / 2.0 for b in walls)
    caps = cloud.xyz[np.isclose(cloud.xyz[:, 2], top, atol=1e-9)]
    assert caps.shape[0] == 0


def test_the_floor_slab_is_sampled_on_top_and_not_underneath():
    cloud = sample_scene_points(SPEC)
    assert cloud.xyz[:, 2].min() == pytest.approx(0.0)
    assert SPEC.bbox.min[2] == pytest.approx(-0.05)  # the slab's underside


def test_a_free_standing_object_is_sampled_on_ALL_SIX_faces():
    """An object is photographed from every side, so the shell's inward-only
    rule must not apply to it."""
    spec = with_object()
    box = next(b for b in spec.boxes if b.kind == "object")
    cloud = sample_scene_points(spec)
    d = cloud.xyz - np.array(box.center)
    half = np.array(box.size) / 2.0
    on_box = np.all(np.abs(d) <= half + 1e-9, axis=1)
    faces = {
        (axis, sign)
        for axis in range(3)
        for sign in (1, -1)
        if np.any(on_box & (np.abs(d[:, axis] - sign * half[axis]) <= 1e-9))
    }
    assert len(faces) == 6


# ── densities and colours ───────────────────────────────────────────────────


def test_objects_are_sampled_denser_per_square_metre_than_walls():
    """Area alone would spend nearly everything on the floor and the walls, and
    the small detail is what 42 sparse views most need help with."""
    spec = with_object()
    box = next(b for b in spec.boxes if b.kind == "object")
    cloud = sample_scene_points(spec)
    object_points = int(np.sum(np.all(np.abs(cloud.xyz - np.array(box.center))
                                      <= np.array(box.size) / 2.0 + 1e-9, axis=1)))
    object_area = 2.0 * sum(
        box.size[a] * box.size[b] for a, b in ((0, 1), (0, 2), (1, 2))
    )
    wall_boxes = [b for b in spec.boxes if b.kind == "wall"]
    wall_points = len(cloud) - object_points
    wall_area = sum(b.size[0] * b.size[2] for b in wall_boxes)  # inner faces
    assert object_points / object_area > wall_points / wall_area


def test_points_carry_their_element_kind_colour():
    spec = with_object()
    cloud = sample_scene_points(spec)
    present = {tuple(int(v) for v in row) for row in np.unique(cloud.rgb, axis=0)}
    assert KIND_COLOUR["wall"] in present
    assert KIND_COLOUR["floor"] in present
    assert KIND_COLOUR["object"] in present


# ── the PLY ─────────────────────────────────────────────────────────────────


def test_the_ply_declares_the_property_names_open3d_looks_for():
    """nerfstudio reads this with `open3d.io.read_point_cloud`, which finds
    coordinates by `x`/`y`/`z` and colours by `red`/`green`/`blue`. Any other
    spelling loads as a cloud with no colours, silently."""
    ply, _ = build_seed_ply(SPEC, 32)
    header = ply.split(b"end_header")[0].decode("ascii")
    assert "format binary_little_endian 1.0" in header
    assert "element vertex 32" in header
    for line in (
        "property float x", "property float y", "property float z",
        "property uchar red", "property uchar green", "property uchar blue",
    ):
        assert line in header


def test_the_ply_body_reads_back_as_the_points_that_went_in():
    """Round-tripped through this repo's own reader, which proves the declared
    header and the written body agree — a 15-byte record, not a padded one."""
    cloud = sample_scene_points(SPEC, 500)
    read = read_ply_vertices(encode_ply(cloud))
    assert read.shape == (500, 3)
    # float32 on the way out, so compare at float32 precision.
    assert np.allclose(read, cloud.xyz, atol=1e-5)


def test_the_ply_name_is_the_one_transforms_json_will_point_at():
    assert SEED_PLY_NAME == "sparse_pc.ply"


# ── the frame ───────────────────────────────────────────────────────────────


def test_the_seed_frame_is_the_frame_the_camera_poses_are_written_in():
    """The load-bearing claim. `core/transforms` puts camera poses into
    nerfstudio world with ARKIT_TO_NERFSTUDIO; `core/parametric_scene` puts
    boxes into Blender world with (x, y, z) -> (x, -z, y). If those two ever
    stop being the same map, the seed cloud lands rotated inside the room and
    every Gaussian starts in the wrong place — with no error anywhere."""
    from scan_modal.core.parametric_scene import _to_blender

    for arkit in ((1.0, 0.0, 0.0), (0.0, 1.0, 0.0), (0.0, 0.0, 1.0), (0.3, -2.7, 4.1)):
        via_transforms = ARKIT_TO_NERFSTUDIO @ np.array([*arkit, 1.0])
        assert tuple(via_transforms[:3]) == pytest.approx(_to_blender(arkit))


def test_the_room_lands_at_the_room_s_own_metres():
    """No scaling anywhere: a 4 m wall is 4 m of points."""
    cloud = sample_scene_points(SPEC)
    span_x = cloud.xyz[:, 0].max() - cloud.xyz[:, 0].min()
    assert span_x == pytest.approx(4.1, abs=0.01)  # the floor slab's own span


# ── the shell element the room's centre sits inside ─────────────────────────


def partition_spec():
    """A room with a partition running through its middle — the shape the
    inward-facing rule cannot answer, because the room's centre is not outside
    either of the partition's two broad faces."""
    doc = captured_room_json()
    doc["walls"].append({
        "identifier": "partition",
        "dimensions": [3.0, 2.5, 0.0],
        "transform": [
            0.0, 0.0, 1.0, 0.0,
            0.0, 1.0, 0.0, 0.0,
            -1.0, 0.0, 0.0, 0.0,
            0.0, 1.25, 0.0, 1.0,
        ],
    })
    return build_scene_spec(doc)


def test_a_partition_through_the_room_keeps_BOTH_of_its_broad_faces():
    """Dropping both would leave a whole wall missing from the seed cloud, with
    no warning: the run trains, and the Gaussians in that plane start from
    whatever the neighbouring surfaces happened to seed."""
    spec = partition_spec()
    partition = next(b for b in spec.boxes if b.name == "wall_04")
    cloud = sample_scene_points(spec)

    d = cloud.xyz - np.array(partition.center)
    cos_r, sin_r = math.cos(partition.rotation_z), math.sin(partition.rotation_z)
    local = np.stack([
        cos_r * d[:, 0] + sin_r * d[:, 1],
        -sin_r * d[:, 0] + cos_r * d[:, 1],
        d[:, 2],
    ], axis=1)
    half = np.array(partition.size) / 2.0
    on_box = np.all(np.abs(local) <= half + 1e-9, axis=1)
    faces = {
        (axis, sign)
        for axis in range(3)
        for sign in (1, -1)
        if np.any(on_box & (np.abs(local[:, axis] - sign * half[axis]) <= 1e-9))
    }
    thin = int(np.argmin(partition.size))
    # Both broad faces — the whole point; before the fallback this wall
    # contributed ZERO points and vanished from the seed cloud entirely.
    assert (thin, 1) in faces
    assert (thin, -1) in faces
    # ...and neither end cap. (The partition's underside coincides with the
    # floor slab's top, so face (2, −1) shows up here from the FLOOR's points,
    # which is why this asserts the length axis rather than an exact set.)
    length = int(np.argmax(partition.size))
    assert (length, 1) not in faces and (length, -1) not in faces


def test_a_partition_contributes_a_share_of_the_cloud_proportional_to_its_area():
    """The failure it replaces was silent: a wall simply absent, with the run
    training happily and the Gaussians in that plane starting from whatever the
    neighbouring surfaces happened to seed."""
    spec = partition_spec()
    partition = next(b for b in spec.boxes if b.name == "wall_04")
    cloud = sample_scene_points(spec)

    d = cloud.xyz - np.array(partition.center)
    cos_r, sin_r = math.cos(partition.rotation_z), math.sin(partition.rotation_z)
    local_y = -sin_r * d[:, 0] + cos_r * d[:, 1]
    half = np.array(partition.size) / 2.0
    thin = int(np.argmin(partition.size))
    on_broad = (
        np.all(np.abs(np.stack([
            cos_r * d[:, 0] + sin_r * d[:, 1], local_y, d[:, 2]
        ], axis=1)) <= half + 1e-9, axis=1)
        & (np.abs(np.abs(local_y) - half[thin]) <= 1e-9)
    )
    assert int(on_broad.sum()) > 5_000
