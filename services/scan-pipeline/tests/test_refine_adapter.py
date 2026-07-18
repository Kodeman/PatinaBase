"""Executable contract tests for the P2 COLMAP refine adapter spike."""

from __future__ import annotations

import hashlib
import json
import math
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import pytest

import patina_scan_worker.refine_adapter as adapter
from patina_scan_worker.refine_adapter import (
    ADAPTER_SCHEMA_VERSION,
    LEASE_VISIBILITY_TIMEOUT_S,
    LEASE_COMPLETION_RESERVE_S,
    REFINE_STAGE_ENGINE_BUDGET_S,
    AdapterError,
    PinholeIntrinsics,
    RefineDeadline,
    align_colmap_pose,
    Sim3,
    alignment_metrics,
    arkit_c2w_to_colmap_w2c,
    build_adapter_artifacts,
    build_pair_graph,
    classify_overlap,
    colmap_w2c_to_arkit_c2w,
    estimate_sim3,
    normalize_keyframe_entry,
    publish_immutable,
    right_rotated_intrinsics,
)


def _transform(
    center: tuple[float, float, float] = (0.0, 0.0, 0.0),
    rotation: tuple[tuple[float, float, float], ...] = (
        (1.0, 0.0, 0.0),
        (0.0, 1.0, 0.0),
        (0.0, 0.0, 1.0),
    ),
) -> list[float]:
    return [
        rotation[0][0], rotation[0][1], rotation[0][2], center[0],
        rotation[1][0], rotation[1][1], rotation[1][2], center[1],
        rotation[2][0], rotation[2][1], rotation[2][2], center[2],
        0.0, 0.0, 0.0, 1.0,
    ]


def _entry(
    index: int,
    center: tuple[float, float, float] = (0.0, 0.0, 0.0),
    *,
    native_width: int = 4032,
    native_height: int = 3024,
) -> dict[str, object]:
    return {
        "heicPath": f"keyframes/keyframe_{index:06d}.heic",
        "depthPath": None,
        "timestampSeconds": float(index),
        "frameTimestamp": float(index),
        "cameraTransform": _transform(center),
        "intrinsics": {
            "fx": 3200.0,
            "fy": 3180.0,
            "cx": 2016.0,
            "cy": 1512.0,
            "imageWidth": native_width,
            "imageHeight": native_height,
        },
        # FieldKeyframeRecorder physically writes `.oriented(.right)` pixels.
        "width": native_height,
        "height": native_width,
        "sharpness": 0.9,
        "hasDepth": False,
        "smoothedDepth": False,
    }


def _mat_vec(matrix, vector):
    return tuple(sum(matrix[row][col] * vector[col] for col in range(3)) for row in range(3))


def _transpose(matrix):
    return tuple(tuple(matrix[col][row] for col in range(3)) for row in range(3))


def _mat_mul(left, right):
    return tuple(
        tuple(sum(left[row][index] * right[index][col] for index in range(3)) for col in range(3))
        for row in range(3)
    )


def _flatten(matrix):
    return tuple(value for row in matrix for value in row)


def _project(intrinsics: PinholeIntrinsics, point):
    x, y, z = point
    return (
        intrinsics.fx * x / z + intrinsics.cx,
        intrinsics.fy * y / z + intrinsics.cy,
    )


def test_right_rotated_intrinsics_rotate_the_camera_basis_not_just_dimensions():
    # Deliberately off-centre: this distinguishes H-cy from H-1-cy.
    native = PinholeIntrinsics(3200.0, 3180.0, 1987.25, 1460.75, 4032, 3024)
    rotated = right_rotated_intrinsics(native, encoded_width=3024, encoded_height=4032)

    assert rotated == PinholeIntrinsics(3180.0, 3200.0, 1563.25, 1987.25, 3024, 4032)

    # ARKit sees forward along -Z. First map into the native CV camera
    # (x right, y down, z forward), then physically rotate that projection CW.
    arkit_camera_point = (0.30, 0.20, -2.0)
    native_cv_point = (0.30, -0.20, 2.0)
    native_pixel = _project(native, native_cv_point)
    expected_right_pixel = (native.image_height - native_pixel[1], native_pixel[0])

    # The adapter's combined camera-basis rotation B must produce the same ray.
    rotated_cv_point = _mat_vec(adapter.ARKIT_TO_RIGHT_ROTATED_COLMAP, arkit_camera_point)
    assert _project(rotated, rotated_cv_point) == pytest.approx(expected_right_pixel)


def test_right_rotated_intrinsics_reject_mismatched_encoded_dimensions():
    native = PinholeIntrinsics(1000.0, 1001.0, 500.0, 400.0, 1000, 800)
    with pytest.raises(AdapterError, match="physically right-rotated"):
        right_rotated_intrinsics(native, encoded_width=1000, encoded_height=800)


def test_arkit_colmap_pose_conversion_round_trips_an_arbitrary_rigid_pose():
    angle = math.radians(31.0)
    rotation = (
        (math.cos(angle), 0.0, math.sin(angle)),
        (0.0, 1.0, 0.0),
        (-math.sin(angle), 0.0, math.cos(angle)),
    )
    transform = _transform((1.25, -0.4, 2.75), rotation)

    pose = arkit_c2w_to_colmap_w2c(transform)
    recovered = colmap_w2c_to_arkit_c2w(pose)

    assert recovered == pytest.approx(transform, abs=1e-10)
    assert sum(value * value for value in pose.qvec) == pytest.approx(1.0)


def test_identity_arkit_pose_has_the_expected_right_rotated_colmap_axes():
    pose = arkit_c2w_to_colmap_w2c(_transform())
    assert _flatten(pose.rotation) == pytest.approx(_flatten(adapter.ARKIT_TO_RIGHT_ROTATED_COLMAP))
    assert pose.translation == pytest.approx((0.0, 0.0, 0.0))
    assert pose.qvec == pytest.approx((0.0, math.sqrt(0.5), math.sqrt(0.5), 0.0))


def test_sim3_recovers_metric_scale_rotation_translation_and_zero_residual():
    source = [
        (-1.0, -0.5, 0.2),
        (0.0, 1.0, 0.3),
        (1.5, -0.2, -0.4),
        (0.4, 0.2, 1.3),
        (-0.7, 0.8, -0.9),
    ]
    angle = math.radians(37.0)
    rotation = (
        (math.cos(angle), -math.sin(angle), 0.0),
        (math.sin(angle), math.cos(angle), 0.0),
        (0.0, 0.0, 1.0),
    )
    expected = Sim3(scale=2.5, rotation=rotation, translation=(3.0, -4.0, 1.25))
    target = [expected.apply(point) for point in source]

    fitted = estimate_sim3(source, target)
    metrics = alignment_metrics(source, target, fitted)

    assert fitted.scale == pytest.approx(expected.scale, abs=1e-10)
    assert _flatten(fitted.rotation) == pytest.approx(_flatten(expected.rotation), abs=1e-10)
    assert fitted.translation == pytest.approx(expected.translation, abs=1e-10)
    assert metrics.rmse_m < 1e-10
    assert metrics.sfm_residual_pct < 1e-8
    assert metrics.mean_translation_drift_pct < 1e-8


def test_alignment_metrics_have_an_exact_cadence_independent_denominator():
    source = [(-1.0, 0.0, 0.0), (1.0, 0.0, 0.0), (0.0, -1.0, 0.0), (0.0, 1.0, 0.0)]
    target = [(x, y, 0.1) for x, y, _ in source]
    identity = Sim3.identity()

    metrics = alignment_metrics(source, target, identity)

    # Each residual is exactly 0.1 m and the target trajectory RMS radius is 1 m.
    assert metrics.rmse_m == pytest.approx(0.1)
    assert metrics.trajectory_rms_radius_m == pytest.approx(1.0)
    assert metrics.sfm_residual_pct == pytest.approx(10.0)
    assert metrics.mean_translation_drift_pct == pytest.approx(10.0)


def test_sim3_rebases_camera_orientation_and_preserves_projection_rays():
    source_pose = arkit_c2w_to_colmap_w2c(_transform((0.5, -0.2, 1.0)))
    angle = math.radians(23.0)
    world_rotation = (
        (math.cos(angle), -math.sin(angle), 0.0),
        (math.sin(angle), math.cos(angle), 0.0),
        (0.0, 0.0, 1.0),
    )
    world_sim3 = Sim3(1.7, world_rotation, (2.0, -1.0, 0.4))
    metric_pose = align_colmap_pose(source_pose, world_sim3)
    source_point = (1.2, 0.3, -2.0)
    metric_point = world_sim3.apply(source_point)

    source_camera = tuple(
        value + source_pose.translation[index]
        for index, value in enumerate(_mat_vec(source_pose.rotation, source_point))
    )
    metric_camera = tuple(
        value + metric_pose.translation[index]
        for index, value in enumerate(_mat_vec(metric_pose.rotation, metric_point))
    )

    # A world Sim(3) scales camera coordinates uniformly, so projection rays
    # stay identical while camera orientation is correctly rebased.
    assert metric_camera == pytest.approx(tuple(world_sim3.scale * value for value in source_camera))
    expected_rotation = _mat_mul(source_pose.rotation, _transpose(world_rotation))
    assert _flatten(metric_pose.rotation) == pytest.approx(_flatten(expected_rotation))


def test_sim3_rejects_collinear_correspondences():
    source = [(0.0, 0.0, 0.0), (1.0, 0.0, 0.0), (2.0, 0.0, 0.0)]
    with pytest.raises(AdapterError, match="non-collinear"):
        estimate_sim3(source, source)


def test_pair_graph_is_deterministic_and_retains_a_spatial_loop_closure():
    frames = []
    for i in range(14):
        # Frame 13 returns near frame 0, but remains outside the minimum baseline.
        center = (0.4, 0.0, 0.0) if i == 13 else (float(i), 0.0, 0.0)
        frames.append(normalize_keyframe_entry(_entry(i, center), i))

    pairs = build_pair_graph(
        list(reversed(frames)),
        temporal_window=2,
        spatial_radius_m=0.6,
        spatial_min_baseline_m=0.25,
        max_spatial_neighbors=3,
    )

    loop = (frames[0].image_name, frames[13].image_name)
    assert loop in pairs
    assert pairs == tuple(sorted(set(pairs)))
    assert (frames[0].image_name, frames[2].image_name) in pairs


def test_overlap_classification_is_stable_fatal_without_a_verified_loop():
    frames = [normalize_keyframe_entry(_entry(i, (float(i), 0.0, 0.0)), i) for i in range(14)]
    chain = {(frames[i].image_name, frames[i + 1].image_name): 50 for i in range(13)}

    verdict = classify_overlap(frames, chain, temporal_window=2)

    assert not verdict.ok
    assert verdict.fatal
    assert verdict.code == "REFINE_LOW_OVERLAP"
    assert verdict.reason == "no_verified_non_temporal_loop"


def test_overlap_classification_passes_connected_coverage_with_a_verified_loop():
    frames = [normalize_keyframe_entry(_entry(i, (float(i), 0.0, 0.0)), i) for i in range(14)]
    verified = {(frames[i].image_name, frames[i + 1].image_name): 50 for i in range(13)}
    verified[(frames[0].image_name, frames[-1].image_name)] = 35

    verdict = classify_overlap(frames, verified, temporal_window=2)

    assert verdict.ok
    assert not verdict.fatal
    assert verdict.code is None
    assert verdict.largest_component_fraction == pytest.approx(1.0)
    assert verdict.verified_loop_edges == 1


def test_normalization_exposes_full_pose_prior_but_fallback_discards_rotation():
    frame = normalize_keyframe_entry(_entry(4, (1.0, 2.0, 3.0)), 4)

    assert frame.camera_center_m == pytest.approx((1.0, 2.0, 3.0))
    assert frame.pose_prior.position_m == pytest.approx((1.0, 2.0, 3.0))
    assert _flatten(frame.pose_prior.covariance_m2) == pytest.approx(
        _flatten(((0.01, 0.0, 0.0), (0.0, 0.01, 0.0), (0.0, 0.0, 0.01)))
    )
    assert adapter.PRIMARY_PIPELINE[-3:] == ("point_triangulator", "bundle_adjuster", "sim3_metric_alignment")
    assert "global_mapper" not in adapter.PRIMARY_PIPELINE
    assert "pose_prior_mapper" in adapter.FALLBACK_PIPELINE


def _write_bundle(tmp_path: Path, count: int = 4) -> tuple[Path, list[bytes]]:
    bundle = tmp_path / "bundle"
    keyframes = bundle / "keyframes"
    keyframes.mkdir(parents=True)
    payloads: list[bytes] = []
    lines = []
    centers = [(0.0, 0.0, 0.0), (1.0, 0.0, 0.0), (1.0, 0.0, 1.0), (0.4, 0.0, 0.0)]
    for i in range(count):
        payload = b"physical-right-heic-" + bytes([i])
        payloads.append(payload)
        (keyframes / f"keyframe_{i:06d}.heic").write_bytes(payload)
        lines.append(json.dumps(_entry(i, centers[i]), sort_keys=True))
    index = keyframes / "keyframe_index.ndjson"
    index.write_text("\n".join(lines) + "\n", encoding="utf-8")
    return index, payloads


def test_adapter_artifacts_are_versioned_checksummed_idempotent_and_manifest_last(tmp_path, monkeypatch):
    index, source_payloads = _write_bundle(tmp_path)
    output = tmp_path / "room_file" / "user-1" / "scan-1" / "v7" / "refine"
    publish_order: list[str] = []
    real_publish = adapter.publish_immutable

    def recording_publish(path, payload):
        publish_order.append(Path(path).name)
        return real_publish(path, payload)

    monkeypatch.setattr(adapter, "publish_immutable", recording_publish)
    first = build_adapter_artifacts(index, output, room_file_version=7)
    first_bytes = {path.name: path.read_bytes() for path in first}
    second = build_adapter_artifacts(index, output, room_file_version=7)

    assert [path.name for path in first] == ["adapter-v1.json", "pairs-v1.txt", "adapter-manifest-v1.json"]
    assert publish_order[2] == "adapter-manifest-v1.json"
    assert publish_order[-1] == "adapter-manifest-v1.json"
    assert {path.name: path.read_bytes() for path in second} == first_bytes

    manifest = json.loads((output / "adapter-manifest-v1.json").read_text())
    normalized = json.loads((output / "adapter-v1.json").read_text())
    assert manifest["schemaVersion"] == ADAPTER_SCHEMA_VERSION
    assert manifest["roomFileVersion"] == 7
    assert {row["name"] for row in manifest["artifacts"]} == {"adapter-v1.json", "pairs-v1.txt"}
    assert normalized["frames"][0]["sourceSha256"] == hashlib.sha256(source_payloads[0]).hexdigest()
    assert normalized["frames"][0]["intrinsics"]["width"] == 3024
    assert normalized["frames"][0]["intrinsics"]["height"] == 4032
    for i, payload in enumerate(source_payloads):
        assert (index.parent / f"keyframe_{i:06d}.heic").read_bytes() == payload


def test_immutable_publication_is_safe_for_identical_concurrent_writers(tmp_path):
    destination = tmp_path / "v3" / "refine" / "adapter-manifest-v1.json"
    payload = b'{"schemaVersion":1}\n'

    with ThreadPoolExecutor(max_workers=8) as executor:
        results = list(executor.map(lambda _: publish_immutable(destination, payload), range(24)))

    assert destination.read_bytes() == payload
    assert set(results) <= {True, False}
    assert results.count(True) == 1
    with pytest.raises(AdapterError) as exc:
        publish_immutable(destination, b"conflict\n")
    assert exc.value.code == "REFINE_ARTIFACT_CONFLICT"


def test_adapter_rejects_an_unversioned_output_path(tmp_path):
    index, _ = _write_bundle(tmp_path)
    with pytest.raises(AdapterError, match="v<room-file-version>/refine"):
        build_adapter_artifacts(index, tmp_path / "refine", room_file_version=2)


def test_subprocess_contract_reserves_time_inside_the_queue_lease(monkeypatch):
    observed = {}

    class Result:
        returncode = 0
        stdout = "COLMAP 4.0.2"
        stderr = ""

    def fake_run(command, **kwargs):
        observed["command"] = command
        observed.update(kwargs)
        return Result()

    monkeypatch.setattr(adapter.subprocess, "run", fake_run)
    deadline = RefineDeadline.start(now_monotonic_s=100.0)
    monkeypatch.setattr(adapter.time, "monotonic", lambda: 475.0)
    result = adapter.run_colmap_subprocess(["colmap", "-h"], deadline=deadline)

    assert result.stdout == "COLMAP 4.0.2"
    assert REFINE_STAGE_ENGINE_BUDGET_S == 3000
    assert LEASE_COMPLETION_RESERVE_S == 600
    assert REFINE_STAGE_ENGINE_BUDGET_S + LEASE_COMPLETION_RESERVE_S == LEASE_VISIBILITY_TIMEOUT_S
    # 375 seconds were already consumed by earlier engine work.
    assert observed["timeout"] == pytest.approx(2625.0)
    assert observed["check"] is False
    assert observed["capture_output"] is True
    assert observed["text"] is True


def test_subprocess_deadline_is_shared_across_commands(monkeypatch):
    timeouts = []

    class Result:
        returncode = 0
        stdout = ""
        stderr = ""

    monkeypatch.setattr(
        adapter.subprocess,
        "run",
        lambda _command, **kwargs: timeouts.append(kwargs["timeout"]) or Result(),
    )
    deadline = RefineDeadline.start(now_monotonic_s=1000.0)
    times = iter((1100.0, 1800.0))
    monkeypatch.setattr(adapter.time, "monotonic", lambda: next(times))

    adapter.run_colmap_subprocess(["colmap", "feature_extractor"], deadline=deadline)
    adapter.run_colmap_subprocess(["colmap", "bundle_adjuster"], deadline=deadline)

    assert timeouts == pytest.approx([2900.0, 2200.0])
