"""Adversarial tests for the disabled exact Refine evidence builder."""

from __future__ import annotations

import itertools
import math
import time
from dataclasses import replace

import pytest
from patina_scan_worker.refine_adapter import (
    LOOP_MAX_VIEW_AXIS_ANGLE_DEG,
    AdapterError,
    ColmapPose,
    PinholeIntrinsics,
    RefineDeadline,
    evaluate_refinement_evidence,
)
from patina_scan_worker.refine_evidence_builder import (
    EVIDENCE_INVALID_CODE,
    FALLBACK_ENGINE,
    PRIMARY_ENGINE,
    RAW_BASELINE_KIND,
    REFINED_MODEL_KIND,
    CandidateTwoViewGeometry,
    EvidenceEngineArtifactIdentity,
    EvidenceFrameSnapshot,
    EvidencePathProvenance,
    ModelTrackObservation,
    ModelTrackSnapshot,
    RefinementEvidenceBuildRequest,
    build_refinement_evidence,
)

IDENTITY = (
    (1.0, 0.0, 0.0),
    (0.0, 1.0, 0.0),
    (0.0, 0.0, 1.0),
)
INTRINSICS = PinholeIntrinsics(100.0, 100.0, 50.0, 50.0, 100, 100)


def _rotation_z(degrees: float):
    angle = math.radians(degrees)
    return (
        (math.cos(angle), -math.sin(angle), 0.0),
        (math.sin(angle), math.cos(angle), 0.0),
        (0.0, 0.0, 1.0),
    )


def _matvec(matrix, vector):
    return tuple(
        math.fsum(matrix[row][axis] * vector[axis] for axis in range(3))
        for row in range(3)
    )


def _transpose(matrix):
    return tuple(tuple(matrix[column][row] for column in range(3)) for row in range(3))


def _matmul(left, right):
    return tuple(
        tuple(
            math.fsum(left[row][axis] * right[axis][column] for axis in range(3))
            for column in range(3)
        )
        for row in range(3)
    )


def _pose(center, *, rotation_degrees: float = 0.0) -> ColmapPose:
    rotation = _rotation_z(rotation_degrees)
    rotated = _matvec(rotation, center)
    translation = tuple(-value for value in rotated)
    half = math.radians(rotation_degrees) / 2.0
    return ColmapPose(
        rotation=rotation,
        translation=translation,
        qvec=(math.cos(half), 0.0, 0.0, math.sin(half)),
    )


def _project(point, pose):
    camera = _matvec(pose.rotation, point)
    camera = tuple(camera[index] + pose.translation[index] for index in range(3))
    return (
        INTRINSICS.fx * camera[0] / camera[2] + INTRINSICS.cx,
        INTRINSICS.fy * camera[1] / camera[2] + INTRINSICS.cy,
    )


def _deadline(seconds: float = 60.0) -> RefineDeadline:
    return RefineDeadline(time.monotonic() + seconds)


def _centers():
    return tuple(
        (value, 0.0, 0.0)
        for value in (0.0, 0.5, 1.0, 1.5, 2.0, 2.5, 3.0, 2.5, 2.0, 1.5, 1.0, 0.5)
    )


def _database_keypoints(pose):
    measured = (
        _project((0.0, 0.0, 5.0), pose),
        _project((0.0, 0.5, 5.0), pose),
    )
    return (
        *measured,
        *((10.0 + index, 20.0 + index) for index in range(2, 30)),
    )


def _frames() -> tuple[EvidenceFrameSnapshot, ...]:
    rows = []
    for ordinal, center in enumerate(_centers()):
        rotation = 10.0 if ordinal == 11 else 0.0
        pose = _pose(center, rotation_degrees=rotation)
        name = f"frame_{ordinal:06d}.ppm"
        source_name = f"keyframe_{ordinal:06d}.heic"
        rows.append(
            EvidenceFrameSnapshot(
                ordinal=ordinal,
                frame_timestamp_s=float(ordinal),
                engine_image_name=name,
                engine_relative_path=f"images/{name}",
                engine_sha256=f"{ordinal + 1:064x}",
                engine_size_bytes=691_200,
                source_archive_key="room_file/user/scan/v1/keyframes.tar",
                source_member=f"keyframes/{source_name}",
                source_image_name=source_name,
                source_sha256=f"{ordinal + 100:064x}",
                source_size_bytes=2048 + ordinal,
                materializer_id="field-libheif-exact-profile-v1",
                intrinsics=INTRINSICS,
                database_image_id=ordinal + 1,
                database_camera_id=ordinal + 1,
                database_keypoints=_database_keypoints(pose),
                raw_cam_from_world=pose,
                refined_cam_from_world=pose,
            )
        )
    return tuple(rows)


def _tracks(frames, *, raw: bool):
    rows = []
    for track_index, true_point in enumerate(((0.0, 0.0, 5.0), (0.0, 0.5, 5.0))):
        point = (
            true_point[0] + (0.2 if raw else 0.0),
            true_point[1],
            true_point[2],
        )
        observations = tuple(
            ModelTrackObservation(
                engine_image_name=frame.engine_image_name,
                point2d_index=track_index,
            )
            for frame in frames
        )
        rows.append(ModelTrackSnapshot(point3d=point, observations=observations))
    return tuple(rows)


def _relative_geometry(first_pose, second_pose):
    rotation = _matmul(second_pose.rotation, _transpose(first_pose.rotation))
    rotated_first_translation = _matvec(rotation, first_pose.translation)
    translation = tuple(
        second_pose.translation[index] - rotated_first_translation[index]
        for index in range(3)
    )
    norm = math.hypot(*translation)
    return rotation, tuple(value / norm for value in translation)


def _geometries(frames, *, connected: bool = True):
    rows = []
    for left, right in itertools.combinations(range(len(frames)), 2):
        first = frames[left].engine_image_name
        second = frames[right].engine_image_name
        verified = (left, right) == (0, 11) or (connected and right == left + 1)
        if verified:
            rotation, translation = _relative_geometry(
                frames[left].raw_cam_from_world,
                frames[right].raw_cam_from_world,
            )
            rows.append(
                CandidateTwoViewGeometry(
                    first,
                    second,
                    tuple((index, index) for index in range(30)),
                    rotation,
                    translation,
                )
            )
        else:
            rows.append(CandidateTwoViewGeometry(first, second, (), None, None))
    return tuple(rows)


def _request() -> RefinementEvidenceBuildRequest:
    frames = _frames()
    return RefinementEvidenceBuildRequest(
        frames=frames,
        engine_artifacts=(
            EvidenceEngineArtifactIdentity(
                "database-v1.db",
                "engine/database-v1.db",
                "d" * 64,
                4096,
                "application/vnd.sqlite3",
            ),
            EvidenceEngineArtifactIdentity(
                "raw-triangulated-model-snapshot-v1.tar",
                "evidence/raw-triangulated-model-snapshot-v1.tar",
                "e" * 64,
                8192,
                "application/x-tar",
            ),
            EvidenceEngineArtifactIdentity(
                "refined-model-snapshot-v1.tar",
                "evidence/refined-model-snapshot-v1.tar",
                "f" * 64,
                8192,
                "application/x-tar",
            ),
        ),
        provenance=EvidencePathProvenance(
            selected_engine=PRIMARY_ENGINE,
            fallback_trigger=None,
            raw_baseline_kind=RAW_BASELINE_KIND,
            refined_model_kind=REFINED_MODEL_KIND,
            rotation_prior_represented=True,
        ),
        raw_tracks=_tracks(frames, raw=True),
        refined_tracks=_tracks(frames, raw=False),
        two_view_geometries=_geometries(frames),
    )


def test_builder_computes_geometry_and_returns_the_existing_evidence_contract():
    evidence = build_refinement_evidence(_request(), deadline=_deadline())

    assert evidence.input_images == 12
    assert evidence.registered_images_before == 12
    assert evidence.registered_images_after == 12
    assert evidence.common_observations == 24
    assert evidence.reprojection_rmse_px_before == pytest.approx(4.0)
    assert evidence.reprojection_rmse_px_after == pytest.approx(0.0)
    assert evidence.verified_loop_edges == 1
    assert evidence.loop_rotation_rmse_deg_before == pytest.approx(0.0)
    assert evidence.loop_rotation_rmse_deg_after == pytest.approx(0.0)
    assert evidence.loop_translation_direction_rmse_deg_before == pytest.approx(0.0)
    assert evidence.loop_translation_direction_rmse_deg_after == pytest.approx(0.0)
    assert evaluate_refinement_evidence(evidence).refinement_evidenced is True


def test_complete_snapshot_reordering_is_byte_deterministic():
    request = _request()
    first = build_refinement_evidence(request, deadline=_deadline())
    reordered = replace(
        request,
        engine_artifacts=tuple(reversed(request.engine_artifacts)),
        raw_tracks=tuple(
            replace(track, observations=tuple(reversed(track.observations)))
            for track in reversed(request.raw_tracks)
        ),
        refined_tracks=tuple(
            replace(track, observations=tuple(reversed(track.observations)))
            for track in reversed(request.refined_tracks)
        ),
        two_view_geometries=tuple(
            replace(
                row,
                inlier_correspondences=tuple(reversed(row.inlier_correspondences)),
            )
            for row in reversed(request.two_view_geometries)
        ),
    )

    assert build_refinement_evidence(reordered, deadline=_deadline()) == first


def test_source_raster_and_artifact_hashes_are_bound_into_set_digests():
    request = _request()
    first = build_refinement_evidence(request, deadline=_deadline())
    changed_frame = replace(request.frames[0], source_sha256="a" * 64)
    changed = build_refinement_evidence(
        replace(request, frames=(changed_frame, *request.frames[1:])),
        deadline=_deadline(),
    )

    assert changed.common_observation_set_sha256 != first.common_observation_set_sha256
    assert changed.verified_loop_set_sha256 != first.verified_loop_set_sha256


def test_refined_model_cannot_change_the_fixed_baseline_track_universe():
    request = _request()
    with pytest.raises(AdapterError, match="changed the fixed.*track universe"):
        build_refinement_evidence(
            replace(request, refined_tracks=request.refined_tracks[:1]),
            deadline=_deadline(),
        )


@pytest.mark.parametrize("drop", [True, False])
def test_two_view_snapshot_must_equal_the_complete_candidate_graph(drop):
    request = _request()
    rows = (
        request.two_view_geometries[:-1]
        if drop
        else (
            *request.two_view_geometries,
            request.two_view_geometries[0],
        )
    )
    with pytest.raises(AdapterError, match="complete deterministic candidate graph"):
        build_refinement_evidence(
            replace(request, two_view_geometries=rows),
            deadline=_deadline(),
        )


def test_point2d_membership_cannot_be_reused_or_repeat_an_image():
    request = _request()
    first_track = request.raw_tracks[0]
    second_track = request.raw_tracks[1]
    duplicate = replace(
        second_track.observations[0],
        point2d_index=first_track.observations[0].point2d_index,
    )
    with pytest.raises(AdapterError, match="more than one track"):
        build_refinement_evidence(
            replace(
                request,
                raw_tracks=(
                    first_track,
                    replace(
                        second_track,
                        observations=(duplicate, *second_track.observations[1:]),
                    ),
                ),
            ),
            deadline=_deadline(),
        )
    repeated_image = replace(
        first_track.observations[1],
        engine_image_name=first_track.observations[0].engine_image_name,
        point2d_index=2,
    )
    with pytest.raises(AdapterError, match="repeats an image"):
        build_refinement_evidence(
            replace(
                request,
                raw_tracks=(
                    replace(
                        first_track,
                        observations=(
                            first_track.observations[0],
                            repeated_image,
                            *first_track.observations[2:],
                        ),
                    ),
                    second_track,
                ),
            ),
            deadline=_deadline(),
        )


@pytest.mark.parametrize(
    "mutation,match",
    [
        (
            lambda request: replace(
                request,
                frames=(
                    replace(
                        request.frames[0],
                        engine_image_name="keyframe_000000.heic",
                    ),
                    *request.frames[1:],
                ),
            ),
            "engine PPM",
        ),
        (
            lambda request: replace(
                request,
                provenance=replace(
                    request.provenance,
                    raw_baseline_kind="known-pose-seed-with-zero-points",
                ),
            ),
            "triangulation.*before",
        ),
        (
            lambda request: replace(
                request,
                provenance=replace(
                    request.provenance,
                    selected_engine=FALLBACK_ENGINE,
                    fallback_trigger="primary-construction-failed",
                    rotation_prior_represented=False,
                ),
            ),
            "fallback.*unqualified",
        ),
    ],
)
def test_builder_rejects_source_identity_and_unqualified_paths(mutation, match):
    with pytest.raises(AdapterError, match=match) as raised:
        build_refinement_evidence(mutation(_request()), deadline=_deadline())
    assert raised.value.code == EVIDENCE_INVALID_CODE


def test_builder_rejects_external_scalars_until_provenance_is_qualified():
    with pytest.raises(AdapterError, match="external accuracy.*unqualified"):
        build_refinement_evidence(
            replace(
                _request(),
                external_error_m_before=10.0,
                external_error_m_after=1.0,
                external_evidence_kind="arbitrary",
                external_evidence_ref="arbitrary",
            ),
            deadline=_deadline(),
        )


@pytest.mark.parametrize(
    "mutation,match",
    [
        (
            lambda request: replace(
                request,
                raw_tracks=(
                    replace(request.raw_tracks[0], point3d=(0.0, 0.0, -1.0)),
                    request.raw_tracks[1],
                ),
            ),
            "positive-depth",
        ),
        (
            lambda request: replace(
                request,
                frames=(
                    replace(
                        request.frames[0],
                        database_keypoints=(
                            (float("nan"), 1.0),
                            *request.frames[0].database_keypoints[1:],
                        ),
                    ),
                    *request.frames[1:],
                ),
            ),
            "finite",
        ),
        (
            lambda request: replace(
                request,
                frames=(
                    replace(
                        request.frames[0],
                        raw_cam_from_world=replace(
                            request.frames[0].raw_cam_from_world,
                            rotation=(
                                (1.0, 0.0, 0.0),
                                (0.0, 1.0, 0.0),
                                (0.0, 0.0, -1.0),
                            ),
                        ),
                    ),
                    *request.frames[1:],
                ),
            ),
            "proper rotation",
        ),
    ],
)
def test_builder_rejects_invalid_model_geometry(mutation, match):
    with pytest.raises(AdapterError, match=match):
        build_refinement_evidence(mutation(_request()), deadline=_deadline())


def test_geometry_overflow_is_normalized_to_the_adapter_error_contract():
    request = _request()
    rotated_pose = _pose(_centers()[0], rotation_degrees=45.0)
    with pytest.raises(AdapterError, match="matrix-vector multiplication overflowed"):
        build_refinement_evidence(
            replace(
                request,
                frames=(
                    replace(
                        request.frames[0],
                        raw_cam_from_world=rotated_pose,
                        refined_cam_from_world=rotated_pose,
                    ),
                    *request.frames[1:],
                ),
                raw_tracks=(
                    replace(
                        request.raw_tracks[0],
                        point3d=(1.4e308, 1.4e308, 1.4e308),
                    ),
                    request.raw_tracks[1],
                ),
                refined_tracks=(
                    replace(
                        request.refined_tracks[0],
                        point3d=(1.4e308, 1.4e308, 1.4e308),
                    ),
                    request.refined_tracks[1],
                ),
            ),
            deadline=_deadline(),
        )


def test_verified_geometry_needs_canonical_unit_translation_and_inlier_floor():
    request = _request()
    loop_index = next(
        index
        for index, row in enumerate(request.two_view_geometries)
        if row.first_engine_image_name == request.frames[0].engine_image_name
        and row.second_engine_image_name == request.frames[-1].engine_image_name
    )
    loop = request.two_view_geometries[loop_index]
    bad = replace(loop, verified_translation_direction=(2.0, 0.0, 0.0))
    rows = list(request.two_view_geometries)
    rows[loop_index] = bad
    with pytest.raises(AdapterError, match="unit vector"):
        build_refinement_evidence(
            replace(request, two_view_geometries=tuple(rows)),
            deadline=_deadline(),
        )
    bad = replace(loop, inlier_correspondences=loop.inlier_correspondences[:29])
    rows[loop_index] = bad
    with pytest.raises(AdapterError, match="no_verified_non_temporal_loop") as raised:
        build_refinement_evidence(
            replace(request, two_view_geometries=tuple(rows)),
            deadline=_deadline(),
        )
    assert raised.value.code == "REFINE_LOW_OVERLAP"


def test_verified_pair_graph_requires_eighty_percent_connected_coverage():
    request = _request()
    with pytest.raises(
        AdapterError,
        match="insufficient_verified_connected_coverage",
    ) as raised:
        build_refinement_evidence(
            replace(
                request,
                two_view_geometries=_geometries(
                    request.frames,
                    connected=False,
                ),
            ),
            deadline=_deadline(),
        )
    assert raised.value.code == "REFINE_LOW_OVERLAP"


def test_track_and_inlier_indices_must_exist_in_database_keypoint_tables():
    request = _request()
    track = request.raw_tracks[0]
    out_of_range_observation = replace(
        track.observations[0],
        point2d_index=len(request.frames[0].database_keypoints),
    )
    with pytest.raises(AdapterError, match="outside the database table"):
        build_refinement_evidence(
            replace(
                request,
                raw_tracks=(
                    replace(
                        track,
                        observations=(
                            out_of_range_observation,
                            *track.observations[1:],
                        ),
                    ),
                    request.raw_tracks[1],
                ),
            ),
            deadline=_deadline(),
        )

    geometry_index = next(
        index
        for index, row in enumerate(request.two_view_geometries)
        if row.inlier_correspondences
    )
    geometry = request.two_view_geometries[geometry_index]
    bad_geometry = replace(
        geometry,
        inlier_correspondences=(
            (
                len(request.frames[0].database_keypoints),
                0,
            ),
            *geometry.inlier_correspondences[1:],
        ),
    )
    rows = list(request.two_view_geometries)
    rows[geometry_index] = bad_geometry
    with pytest.raises(AdapterError, match="outside an endpoint database"):
        build_refinement_evidence(
            replace(request, two_view_geometries=tuple(rows)),
            deadline=_deadline(),
        )


def test_frame_order_is_timestamp_then_original_source_image_name():
    request = _request()
    first = replace(
        request.frames[0],
        source_member="keyframes/keyframe_000001.heic",
        source_image_name="keyframe_000001.heic",
    )
    second = replace(
        request.frames[1],
        frame_timestamp_s=0.0,
        source_member="keyframes/keyframe_000000.heic",
        source_image_name="keyframe_000000.heic",
    )
    with pytest.raises(AdapterError, match="timestamp/source-image order"):
        build_refinement_evidence(
            replace(request, frames=(first, second, *request.frames[2:])),
            deadline=_deadline(),
        )


def test_unchanged_complete_models_remain_non_certifying():
    request = _request()
    evidence = build_refinement_evidence(
        replace(request, refined_tracks=request.raw_tracks),
        deadline=_deadline(),
    )

    verdict = evaluate_refinement_evidence(evidence)
    assert verdict.refinement_evidenced is False
    assert verdict.code == "REFINE_NO_MEASURABLE_IMPROVEMENT"


def test_builder_obeys_the_carried_absolute_deadline():
    with pytest.raises(AdapterError, match="deadline is exhausted") as raised:
        build_refinement_evidence(_request(), deadline=_deadline(-1.0))
    assert raised.value.code == "REFINE_ENGINE_TIMEOUT"


def _rotation_y(degrees: float):
    angle = math.radians(degrees)
    return (
        (math.cos(angle), 0.0, math.sin(angle)),
        (0.0, 1.0, 0.0),
        (-math.sin(angle), 0.0, math.cos(angle)),
    )


def test_the_builders_own_candidate_graph_obeys_the_view_axis_bound():
    """The THIRD derivation of the graph, reached directly.

    ``_pair_graph`` sits behind a GPU, a pinned COLMAP and a real capture in
    production, so nothing that runs here would notice if it stopped filtering
    by direction -- it would simply rebuild the pre-R122 graph, disagree with
    the matcher's, and surface as "two-view snapshot omitted a deterministic
    candidate pair" from somewhere else entirely.  Building its ``_ValidatedFrame``
    rows by hand is the same move this package already made for the engine's
    candidate-graph guard: named, it is directly falsifiable.

    The existing fixture rotates about Z, which leaves the optical axis exactly
    where it was -- a camera rolling about its own line of sight still looks the
    same way.  These turn about Y, which is what actually moves it.
    """

    from patina_scan_worker.refine_evidence_builder import _pair_graph, _ValidatedFrame

    frames = _frames()
    centres = [(0.4 * index, 0.0, 0.0) for index in range(len(frames))]
    centres[-1] = (0.5, 0.0, 0.0)
    loop = (frames[0].engine_image_name, frames[-1].engine_image_name)

    def graph(turn_last_by: float):
        rows = tuple(
            _ValidatedFrame(
                frame,
                centres[index],
                _rotation_y(turn_last_by if index == len(frames) - 1 else 0.0),
            )
            for index, frame in enumerate(frames)
        )
        return _pair_graph(rows, deadline=_deadline())

    assert loop in graph(0.0)
    assert loop in graph(LOOP_MAX_VIEW_AXIS_ANGLE_DEG)
    assert loop not in graph(LOOP_MAX_VIEW_AXIS_ANGLE_DEG * 1.0001)
    assert loop not in graph(120.0)


def test_the_builders_graph_is_derived_from_the_raw_pose_not_the_refined_one():
    """The graph must not depend on the answer.

    The candidate set is a property of the capture the device submitted.  If it
    were rebuilt from the REFINED rotations, the set of pairs the evidence is
    measured over would move with the result being measured -- and a refinement
    that turned a camera could quietly delete the loop edge that was about to
    judge it.  The centre has always been read from the raw pose; this pins the
    rotation to the same model.
    """

    from patina_scan_worker.refine_evidence_builder import _validate_frames

    frames = list(_frames())
    half = math.radians(90.0) / 2.0
    turned = replace(
        frames[-1].refined_cam_from_world,
        rotation=_rotation_y(90.0),
        qvec=(math.cos(half), 0.0, math.sin(half), 0.0),
    )
    frames[-1] = replace(frames[-1], refined_cam_from_world=turned)

    validated = _validate_frames(tuple(frames), deadline=_deadline())

    assert validated[-1].raw_rotation == frames[-1].raw_cam_from_world.rotation
    assert validated[-1].raw_rotation != frames[-1].refined_cam_from_world.rotation
