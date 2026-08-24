"""COLMAP text-model arithmetic — pure, no COLMAP, no GPU.

The load-bearing claim is the FRAME: a nerfstudio camera written into a COLMAP
seed and read back must be the same camera, and a COLMAP-world point is already a
nerfstudio-world point. Both are proven here by round trip, because a frame that
is subtly wrong does not error — it trains to a worse splat and looks like the
init it replaced.
"""

from __future__ import annotations

import numpy as np
import pytest

from scan_modal.core import colmap_model as cm
from scan_modal.io.ply import read_ply_vertices


def _rot(ax: float, ay: float, az: float) -> np.ndarray:
    """A rotation from intrinsic X→Y→Z Euler angles (radians)."""
    cx, sx = np.cos(ax), np.sin(ax)
    cy, sy = np.cos(ay), np.sin(ay)
    cz, sz = np.cos(az), np.sin(az)
    rx = np.array([[1, 0, 0], [0, cx, -sx], [0, sx, cx]])
    ry = np.array([[cy, 0, sy], [0, 1, 0], [-sy, 0, cy]])
    rz = np.array([[cz, -sz, 0], [sz, cz, 0], [0, 0, 1]])
    return rx @ ry @ rz


def _c2w(rot: np.ndarray, centre: tuple[float, float, float]) -> list[list[float]]:
    m = np.eye(4)
    m[:3, :3] = rot
    m[:3, 3] = centre
    return [[float(v) for v in row] for row in m]


ROTATIONS = [
    _rot(0.0, 0.0, 0.0),
    _rot(0.3, -0.7, 1.1),
    _rot(-1.2, 0.4, -0.9),
    _rot(np.pi / 2, 0.0, 0.0),
    _rot(0.0, np.pi, 0.0),
]
CENTRES = [(0.0, 0.0, 0.0), (1.0, -2.0, 3.5), (-4.2, 0.1, 2.0)]


# ── quaternion ↔ rotation ────────────────────────────────────────────────────


@pytest.mark.parametrize("rot", ROTATIONS)
def test_quaternion_round_trips_to_the_same_rotation(rot):
    q = cm.rotmat_to_qvec(rot)
    back = cm.qvec_to_rotmat(q)
    assert np.allclose(back, rot, atol=1e-9)


@pytest.mark.parametrize("rot", ROTATIONS)
def test_qvec_is_unit_and_scalar_first_nonnegative(rot):
    q = np.array(cm.rotmat_to_qvec(rot))
    assert np.isclose(np.linalg.norm(q), 1.0)
    assert q[0] >= 0.0


def test_qvec_to_rotmat_is_orthonormal():
    r = cm.qvec_to_rotmat((0.5, 0.5, -0.5, 0.5))
    assert np.allclose(r @ r.T, np.eye(3), atol=1e-12)
    assert np.isclose(np.linalg.det(r), 1.0)


# ── the frame round trip ─────────────────────────────────────────────────────


@pytest.mark.parametrize("rot", ROTATIONS)
@pytest.mark.parametrize("centre", CENTRES)
def test_frame_to_colmap_and_back_is_identity(rot, centre):
    c2w = _c2w(rot, centre)
    qvec, tvec = cm.frame_to_colmap(c2w)
    back = np.array(cm.colmap_pose_to_frame(qvec, tvec))
    assert np.allclose(back, np.array(c2w), atol=1e-9)


def test_colmap_translation_is_world_to_camera_not_the_centre():
    """tvec is −R·C, not the camera centre. A camera one metre down +X in world
    with identity-ish orientation must not report tvec == its centre."""
    c2w = _c2w(_rot(0.2, 0.1, -0.3), (1.0, 0.0, 0.0))
    _, tvec = cm.frame_to_colmap(c2w)
    assert not np.allclose(tvec, (1.0, 0.0, 0.0))
    # But the recovered centre must be the original.
    back = np.array(cm.colmap_pose_to_frame(*cm.frame_to_colmap(c2w)))
    assert np.allclose(back[:3, 3], (1.0, 0.0, 0.0), atol=1e-9)


# ── the seed model ───────────────────────────────────────────────────────────


def _frames() -> list[cm.FrameLike]:
    out = []
    for i, (rot, centre) in enumerate(zip(ROTATIONS[:3], CENTRES)):
        out.append(
            cm.FrameLike(
                image_id=i + 1, camera_id=i + 1, name=f"frame_{i}.jpg",
                transform_matrix=_c2w(rot, centre),
                width=1440, height=1920,
                fx=1500.0 + i, fy=1490.0 + i, cx=720.0, cy=960.0,
            )
        )
    return out


def test_build_seed_model_writes_pinhole_cameras_with_device_intrinsics():
    seed = cm.build_seed_model(_frames())
    cams = cm.parse_cameras_txt(seed.cameras_txt)
    assert set(cams) == {1, 2, 3}
    assert cams[1].width == 1440 and cams[1].height == 1920
    assert cams[1].params == (1500.0, 1490.0, 720.0, 960.0)
    assert seed.points3D_txt == ""


def test_seed_images_alternate_pose_and_empty_points_lines():
    seed = cm.build_seed_model(_frames())
    data = [ln for ln in seed.images_txt.splitlines() if not ln.startswith("#")]
    # 3 images → 6 data lines: pose, blank, pose, blank, pose, blank.
    assert len(data) == 6
    assert data[0].split()[0] == "1" and data[0].split()[-1] == "frame_0.jpg"
    assert data[1].strip() == ""


def test_seed_model_round_trips_poses_back_to_nerfstudio_frames():
    """The end-to-end frame guard: build the seed, parse the images, and the
    recovered per-frame transform must equal the original transform_matrix."""
    frames = _frames()
    seed = cm.build_seed_model(frames)
    images = cm.parse_images_txt(seed.images_txt)
    recovered = cm.colmap_frames_from_images(images)
    for f in frames:
        assert np.allclose(
            np.array(recovered[f.name]), np.array(f.transform_matrix), atol=1e-9
        ), f.name


def test_seed_image_ids_and_camera_ids_are_preserved():
    images = cm.parse_images_txt(cm.build_seed_model(_frames()).images_txt)
    assert [(i.image_id, i.camera_id, i.name) for i in images] == [
        (1, 1, "frame_0.jpg"), (2, 2, "frame_1.jpg"), (3, 3, "frame_2.jpg")
    ]


# ── parsing a triangulated model ─────────────────────────────────────────────


POINTS3D_TXT = """\
# 3D point list with one line of data per point:
#   POINT3D_ID, X, Y, Z, R, G, B, ERROR, TRACK[] as (IMAGE_ID, POINT2D_IDX)
1 1.5 -2.0 3.25 200 100 50 0.8 1 0 2 4 3 7
2 -0.5 0.0 1.0 10 20 30 1.2 4 1 5 2
3 4.0 4.0 4.0 255 255 255 0.4 1 9
"""


def test_parse_points3D_reads_xyz_rgb_error_and_track_length():
    pts = cm.parse_points3D_txt(POINTS3D_TXT)
    assert len(pts) == 3
    assert pts[0].xyz == (1.5, -2.0, 3.25)
    assert pts[0].rgb == (200, 100, 50)
    assert pytest.approx(pts[0].error) == 0.8
    assert pts[0].track_length == 3  # three (image, idx) pairs
    assert pts[1].track_length == 2
    assert pts[2].track_length == 1


def test_points_to_ply_is_nerfstudio_world_and_reads_back():
    """No change of basis: a COLMAP-world point IS a nerfstudio-world point, so
    the PLY xyz must equal the parsed xyz exactly, and be readable by the same
    reader nerfstudio uses (io/ply)."""
    pts = cm.parse_points3D_txt(POINTS3D_TXT)
    ply = cm.points_to_ply(pts)
    xyz = read_ply_vertices(ply)
    assert xyz.shape == (3, 3)
    assert np.allclose(xyz[0], (1.5, -2.0, 3.25))
    assert np.allclose(xyz[1], (-0.5, 0.0, 1.0))
    assert np.allclose(xyz[2], (4.0, 4.0, 4.0))


def test_parse_images_skips_nonempty_points_lines():
    """A real triangulated images.txt carries 2-D observations on the even
    lines; the parser must read poses off the odd lines regardless."""
    text = """\
# comment
1 1 0 0 0 0 0 0 1 a.jpg
100.0 200.0 5 150.0 250.0 -1
2 0 1 0 0 1 2 3 2 b.jpg

"""
    images = cm.parse_images_txt(text)
    assert [i.name for i in images] == ["a.jpg", "b.jpg"]
    assert images[1].tvec == (1.0, 2.0, 3.0)
