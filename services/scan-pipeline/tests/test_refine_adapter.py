"""Executable contract tests for the P2 COLMAP refine adapter spike."""

from __future__ import annotations

import hashlib
import io
import json
import math
import os
import stat
import subprocess
import sys
import threading
import time
from pathlib import Path

import pytest

import patina_scan_worker.refine_adapter as adapter
from patina_scan_worker.queue import claimed_task_lease_expires_monotonic_s
from patina_scan_worker.refine_adapter import (
    ADAPTER_SCHEMA_VERSION,
    COLMAP_LOG_TAIL_BYTES,
    COLMAP_TARGET_VERSION,
    LEASE_COMPLETION_RESERVE_S,
    REFINE_STAGE_ENGINE_BUDGET_S,
    AdapterError,
    PinholeIntrinsics,
    RefineDeadline,
    RefinementEvidence,
    align_colmap_pose,
    Sim3,
    arkit_c2w_to_colmap_w2c,
    build_adapter_artifacts,
    build_pair_graph,
    build_present_enqueue_contract,
    canonical_present_manifest_keys,
    classify_overlap,
    colmap_w2c_to_arkit_c2w,
    estimate_sim3,
    evaluate_refinement_evidence,
    normalize_keyframe_entry,
    publish_immutable,
    qualify_colmap_versions,
    right_rotated_intrinsics,
    trajectory_shape_change_metrics,
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
        # Proposed seam from source inspection; the real Core Image raster and
        # box materializer remain an explicit qualification fixture.
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


def _returning_loop_centers():
    # A physically plausible 0.5 m-ish walk around a 2 m square. The final
    # keyframe returns 0.4 m from the start without teleporting from frame 15.
    return [
        (0.0, 0.0, 0.0),
        (0.5, 0.0, 0.0),
        (1.0, 0.0, 0.0),
        (1.5, 0.0, 0.0),
        (2.0, 0.0, 0.0),
        (2.0, 0.0, 0.5),
        (2.0, 0.0, 1.0),
        (2.0, 0.0, 1.5),
        (2.0, 0.0, 2.0),
        (1.5, 0.0, 2.0),
        (1.0, 0.0, 2.0),
        (0.5, 0.0, 2.0),
        (0.0, 0.0, 2.0),
        (0.0, 0.0, 1.5),
        (0.0, 0.0, 1.0),
        (0.0, 0.0, 0.5),
        (0.4, 0.0, 0.0),
    ]


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
    metrics = trajectory_shape_change_metrics(source, target, fitted)

    assert fitted.scale == pytest.approx(expected.scale, abs=1e-10)
    assert _flatten(fitted.rotation) == pytest.approx(_flatten(expected.rotation), abs=1e-10)
    assert fitted.translation == pytest.approx(expected.translation, abs=1e-10)
    assert metrics.shape_change_rmse_m < 1e-10
    assert metrics.trajectory_shape_change_pct < 1e-8
    assert metrics.mean_keyframe_displacement_pct < 1e-8
    assert metrics.certification_role == "diagnostic-only"


def test_shape_change_metric_explicitly_uses_a_keyframe_weighted_denominator():
    source = [(-1.0, 0.0, 0.0), (1.0, 0.0, 0.0), (0.0, -1.0, 0.0), (0.0, 1.0, 0.0)]
    target = [(x, y, 0.1) for x, y, _ in source]
    identity = Sim3.identity()

    metrics = trajectory_shape_change_metrics(source, target, identity)

    # Each displacement is exactly 0.1 m and the raw keyframe-weighted RMS
    # radius is 1 m. This is a shape diagnostic, not an accuracy metric.
    assert metrics.shape_change_rmse_m == pytest.approx(0.1)
    assert metrics.raw_keyframe_rms_radius_m == pytest.approx(1.0)
    assert metrics.trajectory_shape_change_pct == pytest.approx(10.0)
    assert metrics.mean_keyframe_displacement_pct == pytest.approx(10.0)


def test_noop_alignment_is_not_refinement_evidence():
    points = [(-1.0, 0.0, 0.0), (1.0, 0.0, 0.0), (0.0, 1.0, 0.0)]
    shape = trajectory_shape_change_metrics(points, points, Sim3.identity())
    assert shape.shape_change_rmse_m == pytest.approx(0.0)
    evidence = RefinementEvidence(
        input_images=3,
        registered_images_before=3,
        registered_images_after=3,
        common_observations=120,
        common_observation_set_sha256="a" * 64,
        reprojection_rmse_px_before=0.8,
        reprojection_rmse_px_after=0.8,
        verified_loop_edges=1,
        verified_loop_set_sha256="b" * 64,
        loop_rotation_rmse_deg_before=0.4,
        loop_rotation_rmse_deg_after=0.4,
        loop_translation_direction_rmse_deg_before=1.2,
        loop_translation_direction_rmse_deg_after=1.2,
    )

    verdict = evaluate_refinement_evidence(evidence)

    assert not verdict.refinement_evidenced
    assert not verdict.absolute_accuracy_certified
    assert verdict.code == "REFINE_NO_MEASURABLE_IMPROVEMENT"


def test_improved_reprojection_and_verified_loop_consistency_support_refinement():
    evidence = RefinementEvidence(
        input_images=100,
        registered_images_before=92,
        registered_images_after=97,
        common_observations=18_000,
        common_observation_set_sha256="c" * 64,
        reprojection_rmse_px_before=1.6,
        reprojection_rmse_px_after=0.7,
        verified_loop_edges=4,
        verified_loop_set_sha256="d" * 64,
        loop_rotation_rmse_deg_before=1.8,
        loop_rotation_rmse_deg_after=0.6,
        loop_translation_direction_rmse_deg_before=4.2,
        loop_translation_direction_rmse_deg_after=1.9,
    )

    verdict = evaluate_refinement_evidence(evidence)

    assert verdict.refinement_evidenced
    # Internal geometric improvement still does not certify absolute accuracy.
    assert not verdict.absolute_accuracy_certified
    assert verdict.code is None


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
    centers = _returning_loop_centers()
    frames = [normalize_keyframe_entry(_entry(i, center), i) for i, center in enumerate(centers)]

    pairs = build_pair_graph(
        list(reversed(frames)),
        temporal_window=2,
        spatial_radius_m=0.6,
        spatial_min_baseline_m=0.25,
        max_spatial_neighbors=3,
    )

    loop = (frames[0].image_name, frames[-1].image_name)
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
    centers = _returning_loop_centers()
    frames = [normalize_keyframe_entry(_entry(i, center), i) for i, center in enumerate(centers)]
    verified = {(frames[i].image_name, frames[i + 1].image_name): 50 for i in range(len(frames) - 1)}
    verified[(frames[0].image_name, frames[-1].image_name)] = 35

    verdict = classify_overlap(
        frames,
        verified,
        temporal_window=2,
        spatial_radius_m=0.6,
        spatial_min_baseline_m=0.25,
        max_spatial_neighbors=3,
    )

    assert verdict.ok
    assert not verdict.fatal
    assert verdict.code is None
    assert verdict.largest_component_fraction == pytest.approx(1.0)
    assert verdict.verified_loop_edges == 1


def test_overlap_ignores_a_verified_edge_that_was_not_in_the_candidate_graph():
    frames = [normalize_keyframe_entry(_entry(i, (float(i), 0.0, 0.0)), i) for i in range(14)]
    verified = {(frames[i].image_name, frames[i + 1].image_name): 50 for i in range(13)}
    # This implausible 13 m edge was never generated by the temporal/spatial graph.
    verified[(frames[0].image_name, frames[-1].image_name)] = 10_000

    verdict = classify_overlap(frames, verified, temporal_window=2)

    assert not verdict.ok
    assert verdict.reason == "no_verified_non_temporal_loop"
    assert verdict.verified_loop_edges == 0


def test_normalization_exposes_full_pose_prior_but_fallback_discards_rotation():
    frame = normalize_keyframe_entry(_entry(4, (1.0, 2.0, 3.0)), 4)

    assert frame.camera_center_m == pytest.approx((1.0, 2.0, 3.0))
    assert frame.pose_prior.position_m == pytest.approx((1.0, 2.0, 3.0))
    assert _flatten(frame.pose_prior.covariance_m2) == pytest.approx(
        _flatten(((0.01, 0.0, 0.0), (0.0, 0.01, 0.0), (0.0, 0.0, 0.01)))
    )
    assert adapter.PRIMARY_PIPELINE[-3:] == ("point_triangulator", "bundle_adjuster", "sim3_world_alignment")
    assert "global_mapper" not in adapter.PRIMARY_PIPELINE
    assert "pose_prior_mapper" in adapter.FALLBACK_PIPELINE


def test_present_enqueue_is_identical_and_contains_only_stable_ids():
    arguments = {
        "scan_id": "scan-1",
        "room_file_id": "room-file-1",
        "room_file_version": 7,
        "user_id": "user-1",
        "refine_task_id": "refine-task-1",
    }

    from_mesh_solve = build_present_enqueue_contract(**arguments)
    from_splat = build_present_enqueue_contract(**arguments)

    assert from_mesh_solve == from_splat
    assert from_mesh_solve.idempotency_key == "scan-1:present:7"
    assert from_mesh_solve.parent_task_id == "refine-task-1"
    assert from_mesh_solve.payload == {
        "scan_id": "scan-1",
        "room_file_id": "room-file-1",
        "room_file_version": 7,
        "user_id": "user-1",
        "refine_task_id": "refine-task-1",
    }
    assert "manifest" not in json.dumps(from_mesh_solve.payload).lower()

    manifests = canonical_present_manifest_keys("user-1", "scan-1", 7)
    assert manifests["meshSolve"].endswith("/solve-upgrade/mesh-solve-manifest-v1.json")
    assert set(manifests) == {"refine", "fuse", "meshSolve", "splat"}


def test_colmap_cli_and_binding_must_both_match_the_unvalidated_target():
    qualified = qualify_colmap_versions("COLMAP 4.0.2 -- Structure-from-Motion", "4.0.2")
    assert qualified.target_version == COLMAP_TARGET_VERSION == "4.0.2"
    assert qualified.cli_version == "4.0.2"
    assert qualified.binding_version == "4.0.2"

    with pytest.raises(AdapterError) as exc:
        qualify_colmap_versions("COLMAP 4.0.2", "4.0.1")
    assert exc.value.code == "REFINE_ENGINE_VERSION_MISMATCH"

    # The currently newer release is not silently accepted against the pilot
    # target; moving the target requires a new qualification and pin.
    with pytest.raises(AdapterError) as exc:
        qualify_colmap_versions("COLMAP 4.1.1", "4.0.2")
    assert exc.value.code == "REFINE_ENGINE_VERSION_MISMATCH"


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

    assert [path.name for path in first] == ["adapter-v2.json", "pairs-v2.txt", "adapter-manifest-v2.json"]
    assert publish_order[2] == "adapter-manifest-v2.json"
    assert publish_order[-1] == "adapter-manifest-v2.json"
    assert {path.name: path.read_bytes() for path in second} == first_bytes

    manifest = json.loads((output / "adapter-manifest-v2.json").read_text())
    normalized = json.loads((output / "adapter-v2.json").read_text())
    assert manifest["schemaVersion"] == ADAPTER_SCHEMA_VERSION
    assert manifest["roomFileVersion"] == 7
    assert {row["name"] for row in manifest["artifacts"]} == {"adapter-v2.json", "pairs-v2.txt"}
    assert normalized["frames"][0]["sourceSha256"] == hashlib.sha256(source_payloads[0]).hexdigest()
    assert normalized["frames"][0]["intrinsics"]["width"] == 3024
    assert normalized["frames"][0]["intrinsics"]["height"] == 4032
    assert normalized["targetColmapVersion"] == "4.0.2"
    assert normalized["qualificationStatus"] == "unvalidated-pending-field-and-box-fixture"
    assert "colmapValidatedVersion" not in normalized
    for i, payload in enumerate(source_payloads):
        assert (index.parent / f"keyframe_{i:06d}.heic").read_bytes() == payload


def test_immutable_publication_is_safe_for_identical_multiprocess_writers(tmp_path):
    destination = tmp_path / "v3" / "refine" / "adapter-manifest-v2.json"
    payload = b'{"schemaVersion":2}\n'

    child = (
        "import sys; "
        "from patina_scan_worker.refine_adapter import publish_immutable; "
        "created=publish_immutable(sys.argv[1], bytes.fromhex(sys.argv[2])); "
        "raise SystemExit(0 if created else 2)"
    )
    environment = dict(os.environ)
    environment["PYTHONPATH"] = str(Path(__file__).resolve().parent.parent / "src")
    processes = [
        subprocess.Popen(
            [sys.executable, "-c", child, str(destination), payload.hex()],
            env=environment,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        for _ in range(12)
    ]
    returncodes = [process.wait(timeout=10) for process in processes]

    assert destination.read_bytes() == payload
    assert set(returncodes) <= {0, 2}
    assert returncodes.count(0) == 1
    assert list(destination.parent.glob(f".{destination.name}.*")) == []
    with pytest.raises(AdapterError) as exc:
        publish_immutable(destination, b"conflict\n")
    assert exc.value.code == "REFINE_ARTIFACT_CONFLICT"


def test_immutable_publication_fsyncs_missing_ancestry_and_destination(tmp_path, monkeypatch):
    destination = tmp_path / "v2" / "refine" / "adapter-v2.json"
    fsynced_directories = []
    real_fsync_directory = adapter._fsync_directory

    def recording_fsync_directory(path):
        fsynced_directories.append(Path(path))
        return real_fsync_directory(path)

    monkeypatch.setattr(adapter, "_fsync_directory", recording_fsync_directory)
    assert publish_immutable(destination, b"{}\n") is True

    # Each missing component is fsynced itself, and its entry is made durable by
    # fsyncing its parent. The final destination directory is fsynced after link.
    assert tmp_path in fsynced_directories
    assert tmp_path / "v2" in fsynced_directories
    assert tmp_path / "v2" / "refine" in fsynced_directories


def test_replay_repairs_an_ancestor_interrupted_before_parent_fsync(tmp_path, monkeypatch):
    destination = tmp_path / "v2" / "refine" / "adapter-v2.json"
    payload = b"{}\n"
    real_fsync_directory = adapter._fsync_directory
    interrupted = False

    def interrupt_after_first_mkdir(path):
        nonlocal interrupted
        path = Path(path)
        if path == tmp_path and (tmp_path / "v2").is_dir() and not interrupted:
            interrupted = True
            raise OSError("synthetic crash before ancestor parent fsync")
        return real_fsync_directory(path)

    monkeypatch.setattr(adapter, "_fsync_directory", interrupt_after_first_mkdir)
    with pytest.raises(AdapterError) as exc:
        publish_immutable(destination, payload)
    assert exc.value.code == "REFINE_ARTIFACT_IO"
    assert (tmp_path / "v2").is_dir()
    assert not (tmp_path / "v2" / "refine").exists()

    repaired = []

    def recording_fsync_directory(path):
        repaired.append(Path(path))
        return real_fsync_directory(path)

    monkeypatch.setattr(adapter, "_fsync_directory", recording_fsync_directory)
    assert publish_immutable(destination, payload) is True
    assert tmp_path in repaired  # repairs the existing v2 boundary's parent
    assert destination.read_bytes() == payload


def test_identical_immutable_replay_fsyncs_existing_leaf_and_parent(tmp_path, monkeypatch):
    destination = tmp_path / "v2" / "refine" / "adapter-v2.json"
    payload = b"{}\n"
    assert publish_immutable(destination, payload) is True
    destination_inode = destination.stat().st_ino
    fsynced = []
    real_fsync = adapter.os.fsync

    def recording_fsync(file_descriptor):
        metadata = os.fstat(file_descriptor)
        fsynced.append((stat.S_ISDIR(metadata.st_mode), metadata.st_ino))
        return real_fsync(file_descriptor)

    monkeypatch.setattr(adapter.os, "fsync", recording_fsync)
    assert publish_immutable(destination, payload) is False

    assert (False, destination_inode) in fsynced
    assert any(is_directory for is_directory, _inode in fsynced)


def test_identical_replay_reports_durability_io_separately_from_conflict(tmp_path, monkeypatch):
    destination = tmp_path / "v2" / "refine" / "adapter-v2.json"
    payload = b"{}\n"
    assert publish_immutable(destination, payload) is True
    destination_inode = destination.stat().st_ino
    real_fsync = adapter.os.fsync

    def fail_leaf_fsync(file_descriptor):
        if os.fstat(file_descriptor).st_ino == destination_inode:
            raise OSError("synthetic leaf fsync failure")
        return real_fsync(file_descriptor)

    monkeypatch.setattr(adapter.os, "fsync", fail_leaf_fsync)
    with pytest.raises(AdapterError) as exc:
        publish_immutable(destination, payload)

    assert exc.value.code == "REFINE_ARTIFACT_IO"
    assert "synthetic leaf fsync failure" in str(exc.value)


def test_identical_replay_repairs_a_winner_interrupted_after_link(tmp_path, monkeypatch):
    destination = tmp_path / "v2" / "refine" / "adapter-v2.json"
    destination.parent.mkdir(parents=True)
    payload = b"{}\n"
    real_fsync_directory = adapter._fsync_directory

    def interrupt_after_link(path):
        if Path(path) == destination.parent and destination.exists():
            raise OSError("synthetic crash before directory fsync")
        return real_fsync_directory(path)

    monkeypatch.setattr(adapter, "_fsync_directory", interrupt_after_link)
    with pytest.raises(AdapterError) as exc:
        publish_immutable(destination, payload)
    assert exc.value.code == "REFINE_ARTIFACT_IO"
    assert "synthetic crash" in str(exc.value)
    assert destination.read_bytes() == payload

    monkeypatch.setattr(adapter, "_fsync_directory", real_fsync_directory)
    assert publish_immutable(destination, payload) is False
    assert destination.read_bytes() == payload


def test_adapter_rejects_an_unversioned_output_path(tmp_path):
    index, _ = _write_bundle(tmp_path)
    with pytest.raises(AdapterError, match="v<room-file-version>/refine"):
        build_adapter_artifacts(index, tmp_path / "refine", room_file_version=2)


class _CompletedPopen:
    def __init__(self, output: bytes = b"", returncode: int = 0):
        self.stdout = io.BytesIO(output)
        self.returncode = None
        self._completed_returncode = returncode
        self.killed = False
        self.wait_timeouts = []

    def wait(self, timeout=None):
        self.wait_timeouts.append(timeout)
        self.returncode = -9 if self.killed else self._completed_returncode
        return self.returncode

    def poll(self):
        return self.returncode

    def kill(self):
        self.killed = True


def _install_completed_popen(monkeypatch, *, output=b"", returncode=0):
    observed = {}

    def fake_popen(command, **kwargs):
        observed["command"] = command
        observed.update(kwargs)
        process = _CompletedPopen(output, returncode)
        observed["process"] = process
        return process

    monkeypatch.setattr(adapter.subprocess, "Popen", fake_popen)
    return observed


def test_subprocess_uses_ratified_budget_and_pipe_drain(tmp_path, monkeypatch):
    observed = _install_completed_popen(monkeypatch, output=b"COLMAP 4.0.2\n")
    deadline = RefineDeadline.start(
        now_monotonic_s=100.0,
        lease_expires_at_monotonic_s=1000.0,
    )
    monkeypatch.setattr(adapter.time, "monotonic", lambda: 175.0)
    result = adapter.run_colmap_subprocess(
        ["colmap", "-h"],
        deadline=deadline,
        log_path=tmp_path / "colmap.log",
    )

    assert result.output_tail.endswith("COLMAP 4.0.2\n")
    assert len(result.output_tail.encode()) <= COLMAP_LOG_TAIL_BYTES
    assert REFINE_STAGE_ENGINE_BUDGET_S == 240
    assert LEASE_COMPLETION_RESERVE_S == 60
    # The stage deadline is start+240; 75 seconds have already elapsed.
    assert observed["process"].returncode == 0
    assert observed["process"].wait_timeouts == pytest.approx([165.0])
    assert observed["command"] == ["colmap", "-h"]
    assert observed["stdout"] is adapter.subprocess.PIPE
    assert observed["stderr"] is adapter.subprocess.STDOUT
    assert observed["bufsize"] == 0
    assert observed["start_new_session"] is True
    assert "shell" not in observed


def test_subprocess_high_volume_log_is_hard_capped_and_reused_path_is_fresh(tmp_path):
    log_path = tmp_path / "colmap.log"
    log_path.write_bytes(b"prior-run-must-not-survive\n")
    deadline = RefineDeadline.start(
        now_monotonic_s=time.monotonic(),
        lease_expires_at_monotonic_s=time.monotonic() + 600.0,
    )
    command = [
        sys.executable,
        "-c",
        (
            "import os,time; "
            "[(os.write(1, b'x' * 4096), time.sleep(0.002)) for _ in range(80)]; "
            "os.write(2, b'FIRST-RUN-END\\n')"
        ),
    ]
    results = []
    errors = []

    def invoke():
        try:
            results.append(
                adapter.run_colmap_subprocess(command, deadline=deadline, log_path=log_path)
            )
        except BaseException as exc:  # pragma: no cover - asserted below
            errors.append(exc)

    runner = threading.Thread(target=invoke)
    runner.start()
    maximum_observed_size = 0
    while runner.is_alive():
        if log_path.exists():
            maximum_observed_size = max(maximum_observed_size, log_path.stat().st_size)
        time.sleep(0.001)
    runner.join(timeout=2)

    assert errors == []
    assert len(results) == 1
    assert maximum_observed_size <= COLMAP_LOG_TAIL_BYTES
    assert log_path.stat().st_size <= COLMAP_LOG_TAIL_BYTES
    assert results[0].output_tail.endswith("FIRST-RUN-END\n")
    assert "prior-run-must-not-survive" not in results[0].output_tail

    second = adapter.run_colmap_subprocess(
        [sys.executable, "-c", "import os; os.write(1, b'SECOND-RUN-ONLY\\n')"],
        deadline=deadline,
        log_path=log_path,
    )
    assert log_path.read_bytes() == b"SECOND-RUN-ONLY\n"
    assert second.output_tail == "SECOND-RUN-ONLY\n"


def test_subprocess_timeout_kills_process_group_reaps_and_blocks_late_writes(tmp_path):
    log_path = tmp_path / "timeout.log"
    leader_pid_path = tmp_path / "leader.pid"
    descendant_pid_path = tmp_path / "descendant.pid"
    late_artifact = tmp_path / "late-artifact"
    now = time.monotonic()
    deadline = RefineDeadline.start(
        now_monotonic_s=now,
        lease_expires_at_monotonic_s=now + LEASE_COMPLETION_RESERVE_S + 0.30,
    )
    descendant_program = (
        "import os,pathlib,signal,sys,time; "
        "signal.signal(signal.SIGTERM, signal.SIG_IGN); "
        "pathlib.Path(sys.argv[1]).write_text(str(os.getpid()), encoding='utf-8'); "
        "time.sleep(0.75); "
        "pathlib.Path(sys.argv[2]).write_text('late\\n', encoding='utf-8')"
    )
    leader_program = "\n".join(
        (
            "import os",
            "import pathlib",
            "import subprocess",
            "import sys",
            "import time",
            f"pathlib.Path({str(leader_pid_path)!r}).write_text(str(os.getpid()))",
            (
                f"subprocess.Popen([sys.executable, '-c', {descendant_program!r}, "
                f"{str(descendant_pid_path)!r}, {str(late_artifact)!r}])"
            ),
            f"pid_path = pathlib.Path({str(descendant_pid_path)!r})",
            "stop = time.monotonic() + 5.0",
            "while not pid_path.exists() and time.monotonic() < stop:",
            "    time.sleep(0.005)",
            "print('before-timeout', flush=True)",
            "time.sleep(30)",
        )
    )
    command = [
        sys.executable,
        "-c",
        leader_program,
    ]

    with pytest.raises(AdapterError) as exc:
        adapter.run_colmap_subprocess(command, deadline=deadline, log_path=log_path)

    assert exc.value.code == "REFINE_ENGINE_TIMEOUT"
    leader_pid = int(leader_pid_path.read_text())
    descendant_pid = int(descendant_pid_path.read_text())
    stop = time.monotonic() + 2.0
    leader_gone = False
    descendant_gone = False
    while time.monotonic() < stop:
        try:
            os.kill(leader_pid, 0)
            leader_gone = False
        except ProcessLookupError:
            leader_gone = True
        try:
            os.kill(descendant_pid, 0)
            descendant_gone = False
        except ProcessLookupError:
            descendant_gone = True
        if leader_gone and descendant_gone:
            break
        time.sleep(0.01)
    assert leader_gone
    assert descendant_gone
    assert log_path.read_text().endswith("before-timeout\n")
    assert log_path.stat().st_size <= COLMAP_LOG_TAIL_BYTES
    time.sleep(0.80)
    assert not late_artifact.exists()


def test_subprocess_deadline_consumes_slow_process_startup(tmp_path, monkeypatch):
    process = _CompletedPopen()
    cleanup_calls = []

    def delayed_popen(_command, **kwargs):
        del kwargs
        time.sleep(0.25)
        return process

    def reap_after_expired_startup(cleanup_process):
        cleanup_calls.append(cleanup_process)
        cleanup_process.returncode = -9
        return ()

    monkeypatch.setattr(adapter.subprocess, "Popen", delayed_popen)
    monkeypatch.setattr(adapter, "_kill_and_reap", reap_after_expired_startup)
    now = time.monotonic()
    deadline = RefineDeadline.start(
        now_monotonic_s=now,
        lease_expires_at_monotonic_s=now + LEASE_COMPLETION_RESERVE_S + 0.15,
    )

    with pytest.raises(AdapterError) as raised:
        adapter.run_colmap_subprocess(
            ["colmap", "feature_extractor"],
            deadline=deadline,
            log_path=tmp_path / "slow-startup.log",
        )

    assert raised.value.code == "REFINE_ENGINE_TIMEOUT"
    assert process.wait_timeouts == []
    assert cleanup_calls == [process]


def test_subprocess_deadline_consumes_slow_log_drain(tmp_path, monkeypatch):
    real_drain = adapter._drain_colmap_output

    def delayed_drain(stream, sink, errors):
        real_drain(stream, sink, errors)
        time.sleep(0.25)

    monkeypatch.setattr(adapter, "_drain_colmap_output", delayed_drain)
    now = time.monotonic()
    deadline = RefineDeadline.start(
        now_monotonic_s=now,
        lease_expires_at_monotonic_s=now + LEASE_COMPLETION_RESERVE_S + 0.15,
    )

    with pytest.raises(AdapterError) as raised:
        adapter.run_colmap_subprocess(
            [sys.executable, "-c", "print('completed-before-slow-drain')"],
            deadline=deadline,
            log_path=tmp_path / "slow-drain.log",
        )

    assert raised.value.code == "REFINE_ENGINE_TIMEOUT"


def test_subprocess_timeout_cleanup_uncertainty_is_never_retryable(
    tmp_path, monkeypatch
):
    process = _CompletedPopen()

    def timed_out_wait(timeout=None):
        process.wait_timeouts.append(timeout)
        raise subprocess.TimeoutExpired("colmap", timeout)

    process.wait = timed_out_wait
    monkeypatch.setattr(adapter.subprocess, "Popen", lambda *_args, **_kwargs: process)

    def failed_cleanup(cleanup_process):
        cleanup_process.returncode = -9
        return ("synthetic process-group cleanup failure",)

    monkeypatch.setattr(adapter, "_kill_and_reap", failed_cleanup)
    deadline = RefineDeadline.start(
        now_monotonic_s=100.0,
        lease_expires_at_monotonic_s=1000.0,
    )
    monkeypatch.setattr(adapter.time, "monotonic", lambda: 175.0)

    with pytest.raises(AdapterError) as raised:
        adapter.run_colmap_subprocess(
            ["colmap", "feature_extractor"],
            deadline=deadline,
            log_path=tmp_path / "cleanup-failed.log",
        )

    assert raised.value.code == "REFINE_ENGINE_CLEANUP_FAILED"
    assert "synthetic process-group cleanup failure" in str(raised.value)


def test_subprocess_propagates_log_drain_errors(tmp_path, monkeypatch):
    _install_completed_popen(monkeypatch, output=b"output that must be drained")

    def fail_write(_self, _chunk):
        raise OSError("synthetic bounded-log failure")

    monkeypatch.setattr(adapter._CappedTailLog, "write", fail_write)
    deadline = RefineDeadline.start(
        now_monotonic_s=100.0,
        lease_expires_at_monotonic_s=1000.0,
    )
    monkeypatch.setattr(adapter.time, "monotonic", lambda: 175.0)

    with pytest.raises(AdapterError) as exc:
        adapter.run_colmap_subprocess(
            ["colmap", "feature_extractor"],
            deadline=deadline,
            log_path=tmp_path / "drain-error.log",
        )

    assert exc.value.code == "REFINE_ENGINE_LOG_IO"
    assert "synthetic bounded-log failure" in str(exc.value)


def test_subprocess_failure_keeps_only_the_bounded_error_tail(tmp_path, monkeypatch):
    _install_completed_popen(
        monkeypatch,
        output=b"discarded-prefix" * 8192 + b"COLMAP terminal error\n",
        returncode=7,
    )
    deadline = RefineDeadline.start(
        now_monotonic_s=100.0,
        lease_expires_at_monotonic_s=1000.0,
    )
    monkeypatch.setattr(adapter.time, "monotonic", lambda: 175.0)
    log_path = tmp_path / "failed.log"

    with pytest.raises(AdapterError) as exc:
        adapter.run_colmap_subprocess(
            ["colmap", "bundle_adjuster"],
            deadline=deadline,
            log_path=log_path,
        )

    assert exc.value.code == "REFINE_ENGINE_FAILED"
    assert "COLMAP terminal error" in str(exc.value)
    assert log_path.stat().st_size == COLMAP_LOG_TAIL_BYTES
    assert log_path.read_bytes().endswith(b"COLMAP terminal error\n")


def test_short_actual_lease_reduces_the_stage_deadline(monkeypatch, tmp_path):
    observed = _install_completed_popen(monkeypatch)
    # Only 90 seconds remain on the claimed lease. Reserving 60 gives the
    # engine 30 seconds total, even though the ratified stage budget is 240.
    deadline = RefineDeadline.start(
        now_monotonic_s=100.0,
        lease_expires_at_monotonic_s=190.0,
    )
    monkeypatch.setattr(adapter.time, "monotonic", lambda: 120.0)

    adapter.run_colmap_subprocess(
        ["colmap", "feature_extractor"],
        deadline=deadline,
        log_path=tmp_path / "short-lease.log",
    )

    assert deadline.expires_at_monotonic_s == pytest.approx(130.0)
    assert observed["process"].returncode == 0
    assert observed["process"].wait_timeouts == pytest.approx([10.0])


def test_claimed_task_expiry_feeds_refine_deadline_and_reserve_fails_closed():
    task = {"_lease_expires_monotonic_s": 190.0}
    lease_expiry = claimed_task_lease_expires_monotonic_s(
        task,
        now_monotonic_s=100.0,
    )
    deadline = RefineDeadline.start(
        now_monotonic_s=100.0,
        lease_expires_at_monotonic_s=lease_expiry,
    )
    assert deadline.expires_at_monotonic_s == pytest.approx(130.0)

    short_task = {"_lease_expires_monotonic_s": 159.0}
    short_expiry = claimed_task_lease_expires_monotonic_s(
        short_task,
        now_monotonic_s=100.0,
    )
    with pytest.raises(AdapterError) as exc:
        RefineDeadline.start(
            now_monotonic_s=100.0,
            lease_expires_at_monotonic_s=short_expiry,
        )
    assert exc.value.code == "REFINE_ENGINE_TIMEOUT"


def test_subprocess_deadline_is_shared_across_commands(monkeypatch, tmp_path):
    timeouts = []
    clock = [1100.0]
    launch_times = iter((1100.0, 1180.0))

    def fake_popen(_command, **_kwargs):
        clock[0] = next(launch_times)
        process = _CompletedPopen()
        real_wait = process.wait

        def recording_wait(timeout=None):
            timeouts.append(timeout)
            return real_wait(timeout)

        process.wait = recording_wait
        return process

    monkeypatch.setattr(adapter.subprocess, "Popen", fake_popen)
    deadline = RefineDeadline.start(
        now_monotonic_s=1000.0,
        lease_expires_at_monotonic_s=2000.0,
    )
    monkeypatch.setattr(adapter.time, "monotonic", lambda: clock[0])

    adapter.run_colmap_subprocess(
        ["colmap", "feature_extractor"], deadline=deadline, log_path=tmp_path / "features.log"
    )
    adapter.run_colmap_subprocess(
        ["colmap", "bundle_adjuster"], deadline=deadline, log_path=tmp_path / "ba.log"
    )

    assert timeouts == pytest.approx([140.0, 60.0])
