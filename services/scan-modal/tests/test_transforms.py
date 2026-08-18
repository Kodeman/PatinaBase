"""The ARKit → nerfstudio convention conversion, against hand-computed poses.

The derivation lives in `scan_modal.core.transforms`' module docstring. These
tests are the check on it: two fixtures whose expected output was worked out by
hand from that derivation (not captured from a run), plus the properties that
must hold for any pose — orthonormality, det = +1, and the specific claim that
the CAMERA basis is NOT flipped even though the WORLD is rotated.

A convention bug here does not crash anything. It produces a splat that is
subtly, expensively wrong — trained for 25 minutes on an L4 before anyone can
look at it — which is why the expected matrices below are written out in full
rather than asserted against the code's own output.
"""

from __future__ import annotations

import json
import math

import numpy as np
import pytest

from scan_modal.core.transforms import (
    ARKIT_TO_NERFSTUDIO,
    ManifestError,
    PhotoPose,
    RIGHT_ROTATION_CAMERA,
    build_transforms,
    frame_file_name,
    nerfstudio_pose,
    parse_photos_manifest,
)

# ── fixtures ────────────────────────────────────────────────────────────────

IDENTITY_16 = [
    1.0, 0.0, 0.0, 0.0,
    0.0, 1.0, 0.0, 0.0,
    0.0, 0.0, 1.0, 0.0,
    0.0, 0.0, 0.0, 1.0,
]


def entry(**overrides):
    """One `photos_metadata.ndjson` line, in the shape ScanManifest.PhotoEntry
    encodes: cameraTransform flat-16 ROW-major, intrinsics in the NATIVE sensor
    frame."""
    base = {
        "relativePath": "photos/auto_001.50.heic",
        "kind": "auto",
        "timestampSeconds": 1.5,
        "orderIndex": 0,
        "mimeType": "image/heic",
        # matches the intrinsics frame → no rotation
        "width": 1920,
        "height": 1440,
        "cameraTransform": list(IDENTITY_16),
        "cameraIntrinsics": {
            "fx": 1500.0, "fy": 1500.0, "cx": 960.0, "cy": 720.0,
            "width": 1920, "height": 1440,
        },
    }
    base.update(overrides)
    return base


def pose(**overrides) -> PhotoPose:
    return parse_photos_manifest(json.dumps(entry(**overrides)))[0]


# ── parsing ─────────────────────────────────────────────────────────────────


def test_ndjson_parses_one_line_per_photo_and_skips_blanks():
    text = "\n".join([
        json.dumps(entry(relativePath="photos/hero.heic", orderIndex=0)),
        "",
        json.dumps(entry(relativePath="photos/auto_002.00.heic", orderIndex=1)),
        "   ",
    ])
    poses = parse_photos_manifest(text)
    assert [p.relative_path for p in poses] == ["photos/hero.heic", "photos/auto_002.00.heic"]


def test_order_is_re_derived_from_orderIndex_not_file_order():
    """A truncated or out-of-order append must still produce a stable frame
    list — the same bundle always yields the same transforms.json."""
    text = "\n".join([
        json.dumps(entry(relativePath="photos/c.heic", orderIndex=2, timestampSeconds=3.0)),
        json.dumps(entry(relativePath="photos/a.heic", orderIndex=0, timestampSeconds=1.0)),
        json.dumps(entry(relativePath="photos/b.heic", orderIndex=1, timestampSeconds=2.0)),
    ])
    assert [p.relative_path for p in parse_photos_manifest(text)] == [
        "photos/a.heic", "photos/b.heic", "photos/c.heic",
    ]


def test_missing_orderIndex_falls_back_to_timestamp():
    a = entry(relativePath="photos/late.heic", timestampSeconds=9.0)
    b = entry(relativePath="photos/early.heic", timestampSeconds=1.0)
    a.pop("orderIndex")
    b.pop("orderIndex")
    text = json.dumps(a) + "\n" + json.dumps(b)
    assert [p.relative_path for p in parse_photos_manifest(text)] == [
        "photos/early.heic", "photos/late.heic",
    ]


@pytest.mark.parametrize("missing", ["relativePath", "width", "height", "cameraTransform",
                                     "cameraIntrinsics"])
def test_a_missing_required_field_is_a_manifest_error(missing):
    bad = entry()
    bad.pop(missing)
    with pytest.raises(ManifestError):
        parse_photos_manifest(json.dumps(bad))


def test_a_short_camera_transform_is_refused():
    with pytest.raises(ManifestError):
        parse_photos_manifest(json.dumps(entry(cameraTransform=[1.0, 0.0, 0.0])))


def test_an_empty_manifest_is_a_manifest_error():
    with pytest.raises(ManifestError):
        parse_photos_manifest("\n \n")


def test_a_non_json_line_names_its_line_number():
    text = json.dumps(entry()) + "\nnot json at all\n"
    with pytest.raises(ManifestError) as excinfo:
        parse_photos_manifest(text)
    assert "line 2" in str(excinfo.value)


# ── frame naming (the HEIC transcode) ───────────────────────────────────────


def test_frame_file_name_replaces_only_the_final_extension():
    # The timestamp carries a decimal point — a split('.') would truncate it
    # and collide auto_001.50 with auto_001.75 onto one file.
    assert frame_file_name("photos/auto_001.50.heic") == "auto_001.50.jpg"
    assert frame_file_name("photos/hero.heic") == "hero.jpg"
    assert frame_file_name("photos/user_012.25.heic") == "user_012.25.jpg"


def test_frame_file_name_handles_a_name_without_an_extension():
    assert frame_file_name("photos/hero") == "hero.jpg"


def test_frame_file_name_rejects_a_path_with_no_file_name():
    with pytest.raises(ManifestError):
        frame_file_name("photos/")


# ── the hand-computed poses ─────────────────────────────────────────────────


def test_known_pose_no_rotation_matches_the_hand_computed_matrix():
    """Camera at ARKit (1, 1.5, 2) with identity orientation, image extent equal
    to the intrinsics frame so NO image rotation applies.

    By hand, from the module docstring: only W (world Y-up → Z-up) is applied,
    on the LEFT. W maps (x, y, z) → (x, −z, y), so the translation (1, 1.5, 2)
    becomes (1, −2, 1.5), and the identity rotation becomes W itself.
    """
    c2w = list(IDENTITY_16)
    c2w[3], c2w[7], c2w[11] = 1.0, 1.5, 2.0  # translation in a ROW-major flat 16
    matrix, intrinsics = nerfstudio_pose(pose(cameraTransform=c2w))

    assert matrix == [
        [1.0, 0.0, 0.0, 1.0],
        [0.0, 0.0, -1.0, -2.0],
        [0.0, 1.0, 0.0, 1.5],
        [0.0, 0.0, 0.0, 1.0],
    ]
    # Untouched: the image extent already matches the intrinsics frame.
    assert intrinsics == {"fl_x": 1500.0, "fl_y": 1500.0, "cx": 960.0, "cy": 720.0}


def test_known_pose_with_the_portrait_rotation_matches_the_hand_computed_matrix():
    """Identity ARKit pose, but the stored pixels are the 90°-CW portrait
    rotation of the 1920×1440 intrinsics frame.

    By hand: c2w' = I @ C = C, then W @ C. With
        C = [[0,−1,0],[1,0,0],[0,0,1]]  and  W = [[1,0,0],[0,0,−1],[0,1,0]],
    W@C takes C's rows as (row0, −row2, row1).
    Intrinsics swap and the principal point maps (cx, cy) → (H − cy, cx) with
    H = 1440: (960, 720) → (720, 960), which is the centre of a 1440×1920
    portrait frame — the arithmetic check that the mapping is the right way up.
    """
    p = pose(width=1440, height=1920)
    assert p.needs_right_rotation

    matrix, intrinsics = nerfstudio_pose(p)

    assert matrix == [
        [0.0, -1.0, 0.0, 0.0],
        [0.0, 0.0, -1.0, 0.0],
        [1.0, 0.0, 0.0, 0.0],
        [0.0, 0.0, 0.0, 1.0],
    ]
    assert intrinsics == {"fl_x": 1500.0, "fl_y": 1500.0, "cx": 720.0, "cy": 960.0}


def test_the_rotated_principal_point_is_the_centre_of_the_rotated_frame():
    """Same claim, stated as a property rather than a literal: a centred
    principal point stays centred through the rotation."""
    _, intrinsics = nerfstudio_pose(pose(width=1440, height=1920))
    assert intrinsics["cx"] == pytest.approx(1440 / 2)
    assert intrinsics["cy"] == pytest.approx(1920 / 2)


def test_matching_extents_do_not_trigger_the_rotation():
    assert not pose(width=1920, height=1440).needs_right_rotation
    # A square frame is ambiguous by dimension alone; it is treated as rotated,
    # which is a no-op for the intrinsics of a centred square anyway.
    _, intrinsics = nerfstudio_pose(pose(
        width=1000, height=1000,
        cameraIntrinsics={"fx": 900.0, "fy": 900.0, "cx": 500.0, "cy": 500.0,
                          "width": 1000, "height": 1000},
    ))
    assert intrinsics == {"fl_x": 900.0, "fl_y": 900.0, "cx": 500.0, "cy": 500.0}


def test_a_non_square_scale_mismatch_is_left_alone_rather_than_guessed():
    """A downscaled frame (not a rotation) is NOT rescaled here. Recording the
    non-behaviour deliberately: nothing in the capture path downscales the
    encoded photo relative to its own intrinsics, and inventing a scale factor
    for a case that does not occur would silently corrupt the one that does."""
    p = pose(width=960, height=720)
    assert not p.needs_right_rotation
    _, intrinsics = nerfstudio_pose(p)
    assert intrinsics["fl_x"] == 1500.0


# ── properties that must hold for any pose ──────────────────────────────────


def _rotation_from(matrix):
    return np.array(matrix)[:3, :3]


def _arbitrary_c2w():
    """A generic, non-axis-aligned ARKit camera-to-world: yaw 40° about world Y,
    pitch 15° about world X, translated. Row-major flat 16."""
    yaw, pitch = math.radians(40.0), math.radians(15.0)
    ry = np.array([[math.cos(yaw), 0, math.sin(yaw)],
                   [0, 1, 0],
                   [-math.sin(yaw), 0, math.cos(yaw)]])
    rx = np.array([[1, 0, 0],
                   [0, math.cos(pitch), -math.sin(pitch)],
                   [0, math.sin(pitch), math.cos(pitch)]])
    rot = ry @ rx
    m = np.eye(4)
    m[:3, :3] = rot
    m[:3, 3] = [0.4, 1.6, -2.2]
    return [float(v) for v in m.reshape(-1)]


@pytest.mark.parametrize("extent", [(1920, 1440), (1440, 1920)])
def test_the_result_is_still_a_rigid_transform(extent):
    """Both changes of basis are rotations, so nothing may scale, shear or
    mirror the pose — a det of −1 would flip the reconstruction inside out."""
    w, h = extent
    matrix, _ = nerfstudio_pose(pose(width=w, height=h, cameraTransform=_arbitrary_c2w()))
    rot = _rotation_from(matrix)
    np.testing.assert_allclose(rot @ rot.T, np.eye(3), atol=1e-12)
    assert np.linalg.det(rot) == pytest.approx(1.0)
    assert matrix[3] == [0.0, 0.0, 0.0, 1.0]


def test_the_world_rotation_is_invertible_back_to_arkit():
    """`applied_transform` is only meaningful if undoing it recovers the source
    pose — that is what lets an exported splat be lined up with the parametric
    room, which is measured in ARKit world coordinates."""
    source = _arbitrary_c2w()
    matrix, _ = nerfstudio_pose(pose(cameraTransform=source))
    recovered = np.linalg.inv(ARKIT_TO_NERFSTUDIO) @ np.array(matrix)
    np.testing.assert_allclose(recovered, np.array(source).reshape(4, 4), atol=1e-12)


def test_the_camera_basis_is_not_flipped_only_the_world_is_rotated():
    """THE claim of docstring §1. ARKit's camera frame already matches
    nerfstudio's (+X right, +Y up, −Z forward), so an unrotated frame must come
    out as exactly W @ c2w — no COLMAP-style Y/Z flip anywhere."""
    source = _arbitrary_c2w()
    matrix, _ = nerfstudio_pose(pose(cameraTransform=source))
    np.testing.assert_allclose(
        np.array(matrix), ARKIT_TO_NERFSTUDIO @ np.array(source).reshape(4, 4), atol=1e-12
    )


def test_arkit_up_becomes_nerfstudio_plus_z():
    """Gravity is the reason we set --orientation-method none: ARKit's +Y up has
    to land on nerfstudio's +Z up, exactly, without an estimate."""
    np.testing.assert_allclose(
        ARKIT_TO_NERFSTUDIO[:3, :3] @ np.array([0.0, 1.0, 0.0]), np.array([0.0, 0.0, 1.0])
    )


def test_the_camera_rotation_matrix_is_a_proper_rotation():
    rot = RIGHT_ROTATION_CAMERA[:3, :3]
    np.testing.assert_allclose(rot @ rot.T, np.eye(3), atol=1e-12)
    assert np.linalg.det(rot) == pytest.approx(1.0)


def test_the_portrait_rotation_moves_camera_up_to_minus_old_x():
    """Docstring §2's basis derivation, asserted directly: after a 90°-CW image
    rotation the new camera up (+Y') is the old camera −X."""
    np.testing.assert_allclose(
        RIGHT_ROTATION_CAMERA[:3, :3] @ np.array([0.0, 1.0, 0.0]),
        np.array([-1.0, 0.0, 0.0]),
    )
    # Forward is untouched: a rotation about the optical axis cannot change it.
    np.testing.assert_allclose(
        RIGHT_ROTATION_CAMERA[:3, :3] @ np.array([0.0, 0.0, -1.0]),
        np.array([0.0, 0.0, -1.0]),
    )


# ── the document ────────────────────────────────────────────────────────────


def test_build_transforms_writes_the_nerfstudio_document():
    poses = parse_photos_manifest("\n".join([
        json.dumps(entry(relativePath="photos/hero.heic", orderIndex=0)),
        json.dumps(entry(relativePath="photos/auto_001.50.heic", orderIndex=1)),
    ]))
    doc = build_transforms(poses)

    assert doc["camera_model"] == "PINHOLE"
    assert doc["applied_transform"] == [
        [1.0, 0.0, 0.0, 0.0],
        [0.0, 0.0, -1.0, 0.0],
        [0.0, 1.0, 0.0, 0.0],
    ]
    assert [f["file_path"] for f in doc["frames"]] == [
        "images/hero.jpg", "images/auto_001.50.jpg",
    ]
    for frame in doc["frames"]:
        # Per-frame intrinsics, not hoisted: a walk mixes full-res shutters with
        # downscaled auto frames, so one shared fl_x would be wrong for half.
        assert set(frame) == {"file_path", "w", "h", "fl_x", "fl_y", "cx", "cy",
                              "transform_matrix"}
        assert (frame["w"], frame["h"]) == (1920, 1440)
        assert len(frame["transform_matrix"]) == 4


def test_build_transforms_is_deterministic():
    poses = parse_photos_manifest("\n".join([
        json.dumps(entry(relativePath="photos/a.heic", orderIndex=0)),
        json.dumps(entry(relativePath="photos/b.heic", orderIndex=1)),
    ]))
    assert json.dumps(build_transforms(poses), sort_keys=True) == json.dumps(
        build_transforms(poses), sort_keys=True
    )


def test_build_transforms_refuses_an_empty_frame_list():
    with pytest.raises(ManifestError):
        build_transforms([])
