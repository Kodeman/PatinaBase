"""Exact comparable-evidence construction for disabled P2 Refine.

The existing :class:`refine_adapter.RefinementEvidence` remains the only
result schema.  This module consumes complete immutable model/database
snapshots, derives one frozen raw-ARKit observation set, evaluates that exact
set in the refined model, reconstructs the deterministic candidate graph, and
computes the existing aggregate fields.

It is deliberately queue-, Storage-, and engine-free.  A future supervised
native backend must create these snapshots from the exact pinned packet and
COLMAP database/models.  Importing this module does not register or enable a
stage.
"""

from __future__ import annotations

import hashlib
import json
import math
import re
from collections.abc import Iterable
from dataclasses import dataclass
from pathlib import PurePosixPath
from typing import TypeAlias

from .refine_adapter import (
    MAX_SPATIAL_NEIGHBORS,
    MIN_CONNECTED_FRACTION,
    MIN_VERIFIED_INLIERS,
    SPATIAL_MIN_BASELINE_M,
    SPATIAL_RADIUS_M,
    TEMPORAL_WINDOW,
    AdapterError,
    ColmapPose,
    Matrix3,
    PinholeIntrinsics,
    RefineDeadline,
    RefinementEvidence,
    Vector3,
)

EVIDENCE_INVALID_CODE = "REFINE_EVIDENCE_INVALID"
PRODUCTION_ENABLEMENT = "disabled-uncomposed"
SNAPSHOT_ARTIFACT_HANDOFF_QUALIFIED = False
PRIMARY_ENGINE = "colmap-4-known-pose-triangulate-ba"
FALLBACK_ENGINE = "colmap-4-position-prior-mapper"
RAW_BASELINE_KIND = "raw-full-arkit-post-triangulation-pre-ba"
REFINED_MODEL_KIND = "post-bundle-adjustment"

_ENGINE_IMAGE_RE = re.compile(r"^frame_[0-9]{6}\.ppm$")
_SHA256_RE = re.compile(r"^[0-9a-f]{64}$")
_SAFE_ARTIFACT_NAME_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$")
_ROTATION_TOLERANCE = 1e-6
_QUATERNION_TOLERANCE = 1e-6
_UNIT_VECTOR_TOLERANCE = 1e-6
_GEOMETRY_TOLERANCE = 1e-7
_DEADLINE_CHECK_INTERVAL = 256
MAX_EVIDENCE_FRAMES = 400
_REQUIRED_SNAPSHOT_ARTIFACTS = {
    "database-v1.db": (
        "engine/database-v1.db",
        "application/vnd.sqlite3",
    ),
    "raw-triangulated-model-snapshot-v1.tar": (
        "evidence/raw-triangulated-model-snapshot-v1.tar",
        "application/x-tar",
    ),
    "refined-model-snapshot-v1.tar": (
        "evidence/refined-model-snapshot-v1.tar",
        "application/x-tar",
    ),
}

Point2: TypeAlias = tuple[float, float]
Point2DKey: TypeAlias = tuple[str, int]
TrackMembership: TypeAlias = tuple[Point2DKey, ...]
InlierCorrespondence: TypeAlias = tuple[int, int]


def _invalid(message: str) -> AdapterError:
    return AdapterError(message, EVIDENCE_INVALID_CODE)


def _low_overlap(reason: str) -> AdapterError:
    return AdapterError(reason, "REFINE_LOW_OVERLAP")


@dataclass(frozen=True, slots=True)
class EvidenceFrameSnapshot:
    """Exact source/raster identity, intrinsics, and both trajectory poses."""

    ordinal: int
    frame_timestamp_s: float
    engine_image_name: str
    engine_relative_path: str
    engine_sha256: str
    engine_size_bytes: int
    source_archive_key: str
    source_member: str
    source_image_name: str
    source_sha256: str
    source_size_bytes: int
    materializer_id: str
    intrinsics: PinholeIntrinsics
    database_image_id: int
    database_camera_id: int
    database_keypoints: tuple[Point2, ...]
    raw_cam_from_world: ColmapPose
    refined_cam_from_world: ColmapPose


@dataclass(frozen=True, slots=True)
class EvidenceEngineArtifactIdentity:
    """One immutable artifact from which the geometric snapshots were read."""

    name: str
    relative_path: str
    sha256: str
    size_bytes: int
    semantic_media_type: str


@dataclass(frozen=True, slots=True)
class EvidencePathProvenance:
    """Exact engine path and baseline semantics used by the measurements."""

    selected_engine: str
    fallback_trigger: str | None
    raw_baseline_kind: str
    refined_model_kind: str
    rotation_prior_represented: bool


@dataclass(frozen=True, slots=True)
class ModelTrackObservation:
    """One database point2D membership and its immutable measured pixel."""

    engine_image_name: str
    point2d_index: int


@dataclass(frozen=True, slots=True)
class ModelTrackSnapshot:
    """One complete model track identified only by stable point2D membership."""

    point3d: Vector3
    observations: tuple[ModelTrackObservation, ...]


@dataclass(frozen=True, slots=True)
class CandidateTwoViewGeometry:
    """One row for every pair in the deterministic candidate graph."""

    first_engine_image_name: str
    second_engine_image_name: str
    inlier_correspondences: tuple[InlierCorrespondence, ...]
    verified_relative_rotation: Matrix3 | None
    verified_translation_direction: Vector3 | None


@dataclass(frozen=True, slots=True)
class RefinementEvidenceBuildRequest:
    """Closed immutable input to :func:`build_refinement_evidence`.

    ``raw_tracks`` is the complete post-triangulation/pre-BA baseline track
    universe.  Every baseline membership must also exist in ``refined_tracks``;
    the builder never forms a favorable intersection.  ``two_view_geometries``
    must contain exactly one row for every pair reconstructed from the raw
    camera centres.
    """

    frames: tuple[EvidenceFrameSnapshot, ...]
    engine_artifacts: tuple[EvidenceEngineArtifactIdentity, ...]
    provenance: EvidencePathProvenance
    raw_tracks: tuple[ModelTrackSnapshot, ...]
    refined_tracks: tuple[ModelTrackSnapshot, ...]
    two_view_geometries: tuple[CandidateTwoViewGeometry, ...]
    external_error_m_before: float | None = None
    external_error_m_after: float | None = None
    external_evidence_kind: str | None = None
    external_evidence_ref: str | None = None


@dataclass(frozen=True, slots=True)
class _ValidatedFrame:
    value: EvidenceFrameSnapshot
    raw_center: Vector3


@dataclass(frozen=True, slots=True)
class _ValidatedTrack:
    membership: TrackMembership
    point3d: Vector3
    observations: tuple[tuple[Point2DKey, Point2], ...]


def _checkpoint(deadline: RefineDeadline, index: int = 0) -> None:
    if index % _DEADLINE_CHECK_INTERVAL == 0:
        deadline.remaining_seconds()


def _exact_tuple(value: object, label: str) -> tuple[object, ...]:
    if type(value) is not tuple:
        raise _invalid(f"{label} must be an exact immutable tuple")
    return value


def _finite_number(value: object, label: str) -> float:
    if type(value) not in (int, float):
        raise _invalid(f"{label} must be a finite number, never a boolean")
    copied = float(value)
    if not math.isfinite(copied):
        raise _invalid(f"{label} must be finite")
    return copied


def _finite_fsum(values: Iterable[float], label: str) -> float:
    try:
        result = math.fsum(values)
    except (OverflowError, TypeError, ValueError) as exc:
        raise _invalid(f"{label} overflowed") from exc
    if not math.isfinite(result):
        raise _invalid(f"{label} overflowed")
    return result


def _point2(value: object, label: str) -> Point2:
    row = _exact_tuple(value, label)
    if len(row) != 2:
        raise _invalid(f"{label} must have exactly two coordinates")
    return (
        _finite_number(row[0], f"{label}[0]"),
        _finite_number(row[1], f"{label}[1]"),
    )


def _vector3(value: object, label: str, *, require_unit: bool = False) -> Vector3:
    row = _exact_tuple(value, label)
    if len(row) != 3:
        raise _invalid(f"{label} must have exactly three coordinates")
    vector = (
        _finite_number(row[0], f"{label}[0]"),
        _finite_number(row[1], f"{label}[1]"),
        _finite_number(row[2], f"{label}[2]"),
    )
    norm = math.hypot(*vector)
    if not math.isfinite(norm) or norm <= 1e-12:
        raise _invalid(f"{label} must be finite and non-zero")
    if require_unit and abs(norm - 1.0) > _UNIT_VECTOR_TOLERANCE:
        raise _invalid(f"{label} must be a canonical unit vector")
    return vector


def _determinant(matrix: Matrix3) -> float:
    return (
        matrix[0][0] * (matrix[1][1] * matrix[2][2] - matrix[1][2] * matrix[2][1])
        - matrix[0][1] * (matrix[1][0] * matrix[2][2] - matrix[1][2] * matrix[2][0])
        + matrix[0][2] * (matrix[1][0] * matrix[2][1] - matrix[1][1] * matrix[2][0])
    )


def _rotation(value: object, label: str) -> Matrix3:
    rows = _exact_tuple(value, label)
    if len(rows) != 3:
        raise _invalid(f"{label} must be a 3x3 rotation")
    matrix_rows: list[Vector3] = []
    for row_index, row in enumerate(rows):
        values = _exact_tuple(row, f"{label}[{row_index}]")
        if len(values) != 3:
            raise _invalid(f"{label} must be a 3x3 rotation")
        matrix_rows.append(
            (
                _finite_number(values[0], f"{label}[{row_index}][0]"),
                _finite_number(values[1], f"{label}[{row_index}][1]"),
                _finite_number(values[2], f"{label}[{row_index}][2]"),
            )
        )
    matrix: Matrix3 = (matrix_rows[0], matrix_rows[1], matrix_rows[2])
    for left_index in range(3):
        for right_index in range(3):
            dot = _finite_fsum(
                (
                    matrix[left_index][axis] * matrix[right_index][axis]
                    for axis in range(3)
                ),
                f"{label} orthonormality",
            )
            expected = 1.0 if left_index == right_index else 0.0
            if not math.isfinite(dot) or abs(dot - expected) > _ROTATION_TOLERANCE:
                raise _invalid(f"{label} must be orthonormal")
    determinant = _determinant(matrix)
    if not math.isfinite(determinant) or abs(determinant - 1.0) > _ROTATION_TOLERANCE:
        raise _invalid(f"{label} must be a proper rotation")
    return matrix


def _quaternion_rotation(value: object, label: str) -> Matrix3:
    row = _exact_tuple(value, label)
    if len(row) != 4:
        raise _invalid(f"{label} must be a Hamilton quaternion")
    q = tuple(_finite_number(component, label) for component in row)
    norm = math.hypot(*q)
    if abs(norm - 1.0) > _QUATERNION_TOLERANCE:
        raise _invalid(f"{label} must be a unit quaternion")
    first_nonzero = next((component for component in q if abs(component) > 1e-12), 1.0)
    if first_nonzero < 0:
        raise _invalid(f"{label} must use canonical quaternion sign")
    w, x, y, z = q
    return (
        (
            1.0 - 2.0 * (y * y + z * z),
            2.0 * (x * y - z * w),
            2.0 * (x * z + y * w),
        ),
        (
            2.0 * (x * y + z * w),
            1.0 - 2.0 * (x * x + z * z),
            2.0 * (y * z - x * w),
        ),
        (
            2.0 * (x * z - y * w),
            2.0 * (y * z + x * w),
            1.0 - 2.0 * (x * x + y * y),
        ),
    )


def _pose(value: object, label: str) -> ColmapPose:
    if type(value) is not ColmapPose:
        raise _invalid(f"{label} has the wrong rigid-pose contract type")
    rotation = _rotation(value.rotation, f"{label}.rotation")
    translation = _vector3_allow_zero(value.translation, f"{label}.translation")
    quaternion_rotation = _quaternion_rotation(value.qvec, f"{label}.qvec")
    if any(
        abs(rotation[row][column] - quaternion_rotation[row][column])
        > _QUATERNION_TOLERANCE
        for row in range(3)
        for column in range(3)
    ):
        raise _invalid(f"{label} quaternion disagrees with its rotation matrix")
    return ColmapPose(rotation, translation, tuple(float(v) for v in value.qvec))


def _vector3_allow_zero(value: object, label: str) -> Vector3:
    row = _exact_tuple(value, label)
    if len(row) != 3:
        raise _invalid(f"{label} must have exactly three coordinates")
    return (
        _finite_number(row[0], f"{label}[0]"),
        _finite_number(row[1], f"{label}[1]"),
        _finite_number(row[2], f"{label}[2]"),
    )


def _intrinsics(value: object) -> PinholeIntrinsics:
    if type(value) is not PinholeIntrinsics:
        raise _invalid("frame intrinsics have the wrong contract type")
    fx = _finite_number(value.fx, "intrinsics.fx")
    fy = _finite_number(value.fy, "intrinsics.fy")
    cx = _finite_number(value.cx, "intrinsics.cx")
    cy = _finite_number(value.cy, "intrinsics.cy")
    width = value.image_width
    height = value.image_height
    if (
        fx <= 0
        or fy <= 0
        or type(width) is not int
        or type(height) is not int
        or width <= 0
        or height <= 0
        or not 0 <= cx <= width
        or not 0 <= cy <= height
    ):
        raise _invalid("frame intrinsics are outside the exact PINHOLE domain")
    return PinholeIntrinsics(fx, fy, cx, cy, width, height)


def _transpose(matrix: Matrix3) -> Matrix3:
    return tuple(tuple(matrix[column][row] for column in range(3)) for row in range(3))  # type: ignore[return-value]


def _matmul(left: Matrix3, right: Matrix3) -> Matrix3:
    return tuple(
        tuple(
            _finite_fsum(
                (left[row][axis] * right[axis][column] for axis in range(3)),
                "matrix multiplication",
            )
            for column in range(3)
        )
        for row in range(3)
    )  # type: ignore[return-value]


def _matvec(matrix: Matrix3, vector: Vector3) -> Vector3:
    return tuple(
        _finite_fsum(
            (matrix[row][axis] * vector[axis] for axis in range(3)),
            "matrix-vector multiplication",
        )
        for row in range(3)
    )  # type: ignore[return-value]


def _camera_center(pose: ColmapPose) -> Vector3:
    rotated = _matvec(_transpose(pose.rotation), pose.translation)
    return (-rotated[0], -rotated[1], -rotated[2])


def _canonical_path(value: object, label: str) -> str:
    if type(value) is not str or not value or "\\" in value:
        raise _invalid(f"{label} must be a canonical relative POSIX path")
    path = PurePosixPath(value)
    if (
        path.is_absolute()
        or path.as_posix() != value
        or any(part in ("", ".", "..") for part in path.parts)
    ):
        raise _invalid(f"{label} must be a canonical relative POSIX path")
    return value


def _sha256(value: object, label: str) -> str:
    if type(value) is not str or _SHA256_RE.fullmatch(value) is None:
        raise _invalid(f"{label} must be a lowercase SHA-256")
    return value


def _positive_size(value: object, label: str) -> int:
    if type(value) is not int or value <= 0:
        raise _invalid(f"{label} must be a positive integer")
    return value


def _validate_frames(
    value: object,
    *,
    deadline: RefineDeadline,
) -> tuple[_ValidatedFrame, ...]:
    rows = _exact_tuple(value, "evidence frames")
    if not 3 <= len(rows) <= MAX_EVIDENCE_FRAMES:
        raise _invalid(f"evidence requires between 3 and {MAX_EVIDENCE_FRAMES} frames")
    validated: list[_ValidatedFrame] = []
    seen_source_members: set[tuple[str, str]] = set()
    seen_source_names: set[str] = set()
    seen_database_image_ids: set[int] = set()
    seen_database_camera_ids: set[int] = set()
    previous_order_key: tuple[float, str] | None = None
    for ordinal, frame in enumerate(rows):
        _checkpoint(deadline, ordinal)
        if type(frame) is not EvidenceFrameSnapshot:
            raise _invalid("evidence frame has the wrong immutable contract type")
        expected_name = f"frame_{ordinal:06d}.ppm"
        if type(frame.ordinal) is not int or frame.ordinal != ordinal:
            raise _invalid("evidence frame ordinals must be dense and ordered")
        timestamp = _finite_number(frame.frame_timestamp_s, "frame timestamp")
        if timestamp < 0:
            raise _invalid("frame timestamp must be non-negative")
        source_image_name = frame.source_image_name
        if (
            type(source_image_name) is not str
            or PurePosixPath(source_image_name).name != source_image_name
            or not source_image_name.lower().endswith(".heic")
            or any(character.isspace() for character in source_image_name)
            or source_image_name in seen_source_names
        ):
            raise _invalid("source image names must be unique safe HEIC basenames")
        order_key = (timestamp, source_image_name)
        if previous_order_key is not None and order_key <= previous_order_key:
            raise _invalid(
                "evidence frames must retain canonical timestamp/source-image order"
            )
        previous_order_key = order_key
        seen_source_names.add(source_image_name)
        if (
            type(frame.engine_image_name) is not str
            or _ENGINE_IMAGE_RE.fullmatch(frame.engine_image_name) is None
            or frame.engine_image_name != expected_name
        ):
            raise _invalid("evidence frames must use canonical engine PPM identities")
        engine_path = _canonical_path(
            frame.engine_relative_path,
            "engine relative path",
        )
        if engine_path != f"images/{expected_name}":
            raise _invalid("engine relative path does not match its canonical image")
        source_key = _canonical_path(frame.source_archive_key, "source archive key")
        source_member = _canonical_path(frame.source_member, "source archive member")
        if PurePosixPath(source_member).name != source_image_name:
            raise _invalid("source member does not match its original image identity")
        source_identity = (source_key, source_member)
        if source_identity in seen_source_members:
            raise _invalid("source archive identities must be unique")
        seen_source_members.add(source_identity)
        _sha256(frame.engine_sha256, "engine raster sha256")
        _sha256(frame.source_sha256, "source sha256")
        _positive_size(frame.engine_size_bytes, "engine raster size")
        _positive_size(frame.source_size_bytes, "source size")
        if (
            type(frame.materializer_id) is not str
            or not frame.materializer_id
            or frame.materializer_id.strip() != frame.materializer_id
        ):
            raise _invalid("materializer identity must be canonical and non-empty")
        intrinsics = _intrinsics(frame.intrinsics)
        database_image_id = frame.database_image_id
        database_camera_id = frame.database_camera_id
        if (
            type(database_image_id) is not int
            or database_image_id <= 0
            or database_image_id in seen_database_image_ids
            or type(database_camera_id) is not int
            or database_camera_id <= 0
            or database_camera_id in seen_database_camera_ids
        ):
            raise _invalid(
                "database image/camera IDs must be positive and unique per engine image"
            )
        seen_database_image_ids.add(database_image_id)
        seen_database_camera_ids.add(database_camera_id)
        keypoint_values = _exact_tuple(
            frame.database_keypoints,
            "database keypoint table",
        )
        if not keypoint_values:
            raise _invalid("database keypoint table must be complete and non-empty")
        keypoints: list[Point2] = []
        for keypoint_index, keypoint in enumerate(keypoint_values):
            _checkpoint(deadline, keypoint_index)
            keypoints.append(_point2(keypoint, "database keypoint"))
        raw_pose = _pose(frame.raw_cam_from_world, "raw frame pose")
        refined_pose = _pose(frame.refined_cam_from_world, "refined frame pose")
        copied = EvidenceFrameSnapshot(
            ordinal=ordinal,
            frame_timestamp_s=timestamp,
            engine_image_name=expected_name,
            engine_relative_path=engine_path,
            engine_sha256=frame.engine_sha256,
            engine_size_bytes=frame.engine_size_bytes,
            source_archive_key=source_key,
            source_member=source_member,
            source_image_name=source_image_name,
            source_sha256=frame.source_sha256,
            source_size_bytes=frame.source_size_bytes,
            materializer_id=frame.materializer_id,
            intrinsics=intrinsics,
            database_image_id=database_image_id,
            database_camera_id=database_camera_id,
            database_keypoints=tuple(keypoints),
            raw_cam_from_world=raw_pose,
            refined_cam_from_world=refined_pose,
        )
        validated.append(_ValidatedFrame(copied, _camera_center(raw_pose)))
    return tuple(validated)


def _validate_artifacts(
    value: object,
    *,
    deadline: RefineDeadline,
) -> tuple[EvidenceEngineArtifactIdentity, ...]:
    rows = _exact_tuple(value, "engine artifacts")
    if not rows:
        raise _invalid("evidence requires immutable engine artifact identities")
    seen_names: set[str] = set()
    seen_paths: set[str] = set()
    validated: list[EvidenceEngineArtifactIdentity] = []
    for index, artifact in enumerate(rows):
        _checkpoint(deadline, index)
        if type(artifact) is not EvidenceEngineArtifactIdentity:
            raise _invalid("engine artifact has the wrong immutable contract type")
        if (
            type(artifact.name) is not str
            or _SAFE_ARTIFACT_NAME_RE.fullmatch(artifact.name) is None
            or artifact.name in seen_names
        ):
            raise _invalid("engine artifact names must be unique and canonical")
        path = _canonical_path(artifact.relative_path, "engine artifact path")
        if path in seen_paths:
            raise _invalid("engine artifact paths must be unique")
        sha256 = _sha256(artifact.sha256, "engine artifact sha256")
        size = _positive_size(artifact.size_bytes, "engine artifact size")
        media_type = artifact.semantic_media_type
        if (
            type(media_type) is not str
            or not media_type
            or media_type.strip() != media_type
            or any(character.isspace() for character in media_type)
        ):
            raise _invalid("engine artifact semantic media type must be canonical")
        validated.append(
            EvidenceEngineArtifactIdentity(
                artifact.name,
                path,
                sha256,
                size,
                media_type,
            )
        )
        seen_names.add(artifact.name)
        seen_paths.add(path)
    by_name = {row.name: row for row in validated}
    if set(by_name) != set(_REQUIRED_SNAPSHOT_ARTIFACTS):
        raise _invalid(
            "evidence requires the exact database/raw-baseline/refined-model "
            "scratch snapshot identity set"
        )
    for name, (
        expected_path,
        expected_media_type,
    ) in _REQUIRED_SNAPSHOT_ARTIFACTS.items():
        artifact = by_name[name]
        if (
            artifact.relative_path != expected_path
            or artifact.semantic_media_type != expected_media_type
        ):
            raise _invalid(f"evidence snapshot artifact {name} has the wrong role")
    return tuple(sorted(validated, key=lambda row: (row.name, row.relative_path)))


def _validate_provenance(value: object) -> EvidencePathProvenance:
    if type(value) is not EvidencePathProvenance:
        raise _invalid("evidence provenance has the wrong immutable contract type")
    if value.raw_baseline_kind != RAW_BASELINE_KIND:
        raise _invalid(
            "evidence baseline must be raw full-ARKit poses after fixed-track "
            "triangulation and before BA"
        )
    if value.refined_model_kind != REFINED_MODEL_KIND:
        raise _invalid("refined evidence must come from the post-BA model")
    if value.selected_engine == FALLBACK_ENGINE:
        raise _invalid(
            "position-prior fallback evidence remains unqualified and disabled"
        )
    if value.selected_engine != PRIMARY_ENGINE:
        raise _invalid("evidence provenance selected an unsupported engine")
    if value.fallback_trigger is not None:
        raise _invalid("primary evidence must not carry a fallback trigger")
    if value.rotation_prior_represented is not True:
        raise _invalid("known-pose evidence must represent the full rotation prior")
    return value


def _validate_external_evidence(request: RefinementEvidenceBuildRequest) -> None:
    values = (
        request.external_error_m_before,
        request.external_error_m_after,
        request.external_evidence_kind,
        request.external_evidence_ref,
    )
    if any(value is not None for value in values):
        raise _invalid(
            "external accuracy evidence remains unqualified and cannot affect Refine"
        )


def _validate_tracks(
    value: object,
    *,
    label: str,
    frame_by_name: dict[str, EvidenceFrameSnapshot],
    deadline: RefineDeadline,
) -> dict[TrackMembership, _ValidatedTrack]:
    rows = _exact_tuple(value, f"{label} tracks")
    if not rows:
        raise _invalid(f"{label} model must contain triangulated tracks")
    tracks: dict[TrackMembership, _ValidatedTrack] = {}
    claimed_point2d: set[Point2DKey] = set()
    for track_index, track in enumerate(rows):
        _checkpoint(deadline, track_index)
        if type(track) is not ModelTrackSnapshot:
            raise _invalid(f"{label} track has the wrong immutable contract type")
        point3d = _vector3_allow_zero(track.point3d, f"{label} point3D")
        observations = _exact_tuple(track.observations, f"{label} observations")
        if len(observations) < 2:
            raise _invalid(f"{label} tracks must contain at least two observations")
        observed_images: set[str] = set()
        track_rows: list[tuple[Point2DKey, Point2]] = []
        for observation_index, observation in enumerate(observations):
            _checkpoint(deadline, observation_index)
            if type(observation) is not ModelTrackObservation:
                raise _invalid(
                    f"{label} observation has the wrong immutable contract type"
                )
            name = observation.engine_image_name
            point2d_index = observation.point2d_index
            if type(name) is not str or name not in frame_by_name:
                raise _invalid(f"{label} observations must use engine PPM identities")
            if type(point2d_index) is not int or point2d_index < 0:
                raise _invalid(f"{label} point2D indices must be non-negative integers")
            keypoints = frame_by_name[name].database_keypoints
            if point2d_index >= len(keypoints):
                raise _invalid(f"{label} point2D index is outside the database table")
            key = (name, point2d_index)
            if name in observed_images:
                raise _invalid(f"{label} track repeats an image")
            if key in claimed_point2d:
                raise _invalid(f"{label} point2D belongs to more than one track")
            observed_images.add(name)
            claimed_point2d.add(key)
            track_rows.append((key, keypoints[point2d_index]))
        track_rows.sort(key=lambda row: row[0])
        membership = tuple(row[0] for row in track_rows)
        if membership in tracks:
            raise _invalid(f"{label} track membership is duplicated")
        tracks[membership] = _ValidatedTrack(
            membership,
            point3d,
            tuple(track_rows),
        )
    return tracks


def _project(
    point3d: Vector3,
    frame: EvidenceFrameSnapshot,
    pose: ColmapPose,
    *,
    label: str,
) -> Point2:
    camera_point = _matvec(pose.rotation, point3d)
    camera_point = (
        camera_point[0] + pose.translation[0],
        camera_point[1] + pose.translation[1],
        camera_point[2] + pose.translation[2],
    )
    if not all(math.isfinite(value) for value in camera_point) or camera_point[2] <= 0:
        raise _invalid(
            f"{label} observation projects outside the positive-depth camera"
        )
    intrinsics = frame.intrinsics
    projected = (
        intrinsics.fx * camera_point[0] / camera_point[2] + intrinsics.cx,
        intrinsics.fy * camera_point[1] / camera_point[2] + intrinsics.cy,
    )
    if not all(math.isfinite(value) for value in projected):
        raise _invalid(f"{label} projection overflowed")
    return projected


def _frame_document(frame: EvidenceFrameSnapshot) -> dict[str, object]:
    intrinsics = frame.intrinsics
    return {
        "engineImage": {
            "name": frame.engine_image_name,
            "relativePath": frame.engine_relative_path,
            "sha256": frame.engine_sha256,
            "sizeBytes": frame.engine_size_bytes,
        },
        "frameTimestampSeconds": frame.frame_timestamp_s,
        "database": {
            "cameraId": frame.database_camera_id,
            "imageId": frame.database_image_id,
            "keypointCount": len(frame.database_keypoints),
            "keypointTableSha256": _canonical_json_sha256(
                {
                    "keypoints": [
                        [_canonical_float(point[0]), _canonical_float(point[1])]
                        for point in frame.database_keypoints
                    ],
                    "schemaVersion": 1,
                }
            ),
        },
        "intrinsics": {
            "cx": intrinsics.cx,
            "cy": intrinsics.cy,
            "fx": intrinsics.fx,
            "fy": intrinsics.fy,
            "height": intrinsics.image_height,
            "width": intrinsics.image_width,
        },
        "materializerId": frame.materializer_id,
        "ordinal": frame.ordinal,
        "source": {
            "archiveKey": frame.source_archive_key,
            "imageName": frame.source_image_name,
            "member": frame.source_member,
            "sha256": frame.source_sha256,
            "sizeBytes": frame.source_size_bytes,
        },
    }


def _artifact_document(
    artifact: EvidenceEngineArtifactIdentity,
) -> dict[str, object]:
    return {
        "name": artifact.name,
        "relativePath": artifact.relative_path,
        "semanticMediaType": artifact.semantic_media_type,
        "sha256": artifact.sha256,
        "sizeBytes": artifact.size_bytes,
    }


def _canonical_float(value: float) -> float:
    return 0.0 if value == 0.0 else value


def _canonical_json_sha256(value: object) -> str:
    try:
        payload = (
            json.dumps(
                value,
                sort_keys=True,
                separators=(",", ":"),
                ensure_ascii=True,
                allow_nan=False,
            )
            + "\n"
        ).encode("utf-8")
    except (TypeError, ValueError) as exc:  # pragma: no cover - validated first
        raise _invalid("evidence commitment is not canonical JSON") from exc
    return hashlib.sha256(payload).hexdigest()


def _build_observation_evidence(
    *,
    frames: tuple[_ValidatedFrame, ...],
    artifacts: tuple[EvidenceEngineArtifactIdentity, ...],
    raw_tracks: dict[TrackMembership, _ValidatedTrack],
    refined_tracks: dict[TrackMembership, _ValidatedTrack],
    deadline: RefineDeadline,
) -> tuple[int, str, float, float]:
    if set(raw_tracks) != set(refined_tracks):
        raise _invalid(
            "refined model changed the fixed raw-ARKit baseline track universe"
        )
    frame_by_name = {row.value.engine_image_name: row.value for row in frames}
    raw_squared: list[float] = []
    refined_squared: list[float] = []
    track_documents: list[dict[str, object]] = []
    observation_count = 0
    for track_index, membership in enumerate(sorted(raw_tracks)):
        _checkpoint(deadline, track_index)
        raw_track = raw_tracks[membership]
        refined_track = refined_tracks[membership]
        refined_observations = dict(refined_track.observations)
        observation_documents: list[dict[str, object]] = []
        for observation_index, (key, observed) in enumerate(raw_track.observations):
            _checkpoint(deadline, observation_index)
            if refined_observations.get(key) != observed:
                raise _invalid(
                    "refined model changed a fixed observation pixel or membership"
                )
            frame = frame_by_name[key[0]]
            raw_projected = _project(
                raw_track.point3d,
                frame,
                frame.raw_cam_from_world,
                label="raw baseline",
            )
            refined_projected = _project(
                refined_track.point3d,
                frame,
                frame.refined_cam_from_world,
                label="refined model",
            )
            raw_residual = math.hypot(
                observed[0] - raw_projected[0],
                observed[1] - raw_projected[1],
            )
            refined_residual = math.hypot(
                observed[0] - refined_projected[0],
                observed[1] - refined_projected[1],
            )
            raw_square = raw_residual * raw_residual
            refined_square = refined_residual * refined_residual
            if not math.isfinite(raw_square) or not math.isfinite(refined_square):
                raise _invalid("reprojection residual overflowed")
            raw_squared.append(raw_square)
            refined_squared.append(refined_square)
            observation_documents.append(
                {
                    "engineImageName": key[0],
                    "observedXy": [
                        _canonical_float(observed[0]),
                        _canonical_float(observed[1]),
                    ],
                    "point2dIndex": key[1],
                }
            )
            observation_count += 1
        track_documents.append({"observations": observation_documents})
    if observation_count == 0:
        raise _invalid("raw baseline has no fixed observations")
    digest = _canonical_json_sha256(
        {
            "artifacts": [_artifact_document(row) for row in artifacts],
            "frames": [_frame_document(row.value) for row in frames],
            "schemaVersion": 1,
            "tracks": track_documents,
        }
    )
    raw_mean = (
        _finite_fsum(sorted(raw_squared), "raw reprojection aggregation")
        / observation_count
    )
    refined_mean = (
        _finite_fsum(
            sorted(refined_squared),
            "refined reprojection aggregation",
        )
        / observation_count
    )
    if not math.isfinite(raw_mean) or not math.isfinite(refined_mean):
        raise _invalid("reprojection RMSE overflowed")
    return observation_count, digest, math.sqrt(raw_mean), math.sqrt(refined_mean)


def _pair_graph(
    frames: tuple[_ValidatedFrame, ...],
    *,
    deadline: RefineDeadline,
) -> tuple[tuple[str, str], ...]:
    pairs: set[tuple[str, str]] = set()
    for left_index, left in enumerate(frames):
        _checkpoint(deadline, left_index)
        for right_index in range(
            left_index + 1,
            min(len(frames), left_index + TEMPORAL_WINDOW + 1),
        ):
            pairs.add(
                (
                    left.value.engine_image_name,
                    frames[right_index].value.engine_image_name,
                )
            )
        spatial: list[tuple[float, str, int]] = []
        for right_index, right in enumerate(frames):
            _checkpoint(deadline, left_index * len(frames) + right_index)
            if (
                right_index == left_index
                or abs(right_index - left_index) <= TEMPORAL_WINDOW
            ):
                continue
            distance = math.dist(left.raw_center, right.raw_center)
            if not math.isfinite(distance):
                raise _invalid("raw camera-centre distance overflowed")
            if SPATIAL_MIN_BASELINE_M <= distance <= SPATIAL_RADIUS_M:
                spatial.append((distance, right.value.engine_image_name, right_index))
        for _distance, _name, right_index in sorted(spatial)[:MAX_SPATIAL_NEIGHBORS]:
            first, second = sorted(
                (
                    left.value.engine_image_name,
                    frames[right_index].value.engine_image_name,
                )
            )
            pairs.add((first, second))
    return tuple(sorted(pairs))


def _validate_inliers(
    value: object,
    *,
    deadline: RefineDeadline,
) -> tuple[InlierCorrespondence, ...]:
    rows = _exact_tuple(value, "two-view inlier correspondences")
    inliers: set[InlierCorrespondence] = set()
    for index, row in enumerate(rows):
        _checkpoint(deadline, index)
        values = _exact_tuple(row, "two-view inlier")
        if (
            len(values) != 2
            or type(values[0]) is not int
            or type(values[1]) is not int
            or values[0] < 0
            or values[1] < 0
        ):
            raise _invalid("two-view inliers must be non-negative point2D index pairs")
        pair = (values[0], values[1])
        if pair in inliers:
            raise _invalid("two-view inlier correspondences must be unique")
        inliers.add(pair)
    return tuple(sorted(inliers))


def _relative_pose(first: ColmapPose, second: ColmapPose) -> tuple[Matrix3, Vector3]:
    rotation = _matmul(second.rotation, _transpose(first.rotation))
    rotated_first_translation = _matvec(rotation, first.translation)
    translation = (
        second.translation[0] - rotated_first_translation[0],
        second.translation[1] - rotated_first_translation[1],
        second.translation[2] - rotated_first_translation[2],
    )
    norm = math.hypot(*translation)
    if not math.isfinite(norm) or norm <= 1e-12:
        raise _invalid("loop trajectory relative translation is zero or invalid")
    return rotation, (
        translation[0] / norm,
        translation[1] / norm,
        translation[2] / norm,
    )


def _rotation_disagreement_degrees(left: Matrix3, right: Matrix3) -> float:
    delta = _matmul(left, _transpose(right))
    cosine = (math.fsum(delta[index][index] for index in range(3)) - 1.0) / 2.0
    if abs(cosine - 1.0) <= 1e-12:
        cosine = 1.0
    elif abs(cosine + 1.0) <= 1e-12:
        cosine = -1.0
    cosine = max(-1.0, min(1.0, cosine))
    return math.degrees(math.acos(cosine))


def _direction_disagreement_degrees(left: Vector3, right: Vector3) -> float:
    cosine = math.fsum(left[index] * right[index] for index in range(3))
    if abs(cosine - 1.0) <= 1e-12:
        cosine = 1.0
    elif abs(cosine + 1.0) <= 1e-12:
        cosine = -1.0
    cosine = max(-1.0, min(1.0, cosine))
    return math.degrees(math.acos(cosine))


def _matrix_document(matrix: Matrix3) -> list[list[float]]:
    return [[_canonical_float(value) for value in row] for row in matrix]


def _vector_document(vector: Vector3) -> list[float]:
    return [_canonical_float(value) for value in vector]


def _build_loop_evidence(
    *,
    frames: tuple[_ValidatedFrame, ...],
    artifacts: tuple[EvidenceEngineArtifactIdentity, ...],
    geometries_value: object,
    deadline: RefineDeadline,
) -> tuple[int, str, float, float, float, float]:
    expected_pairs = _pair_graph(frames, deadline=deadline)
    expected_set = set(expected_pairs)
    rows = _exact_tuple(geometries_value, "candidate two-view geometries")
    if len(rows) != len(expected_pairs):
        raise _invalid(
            "two-view snapshot must cover the complete deterministic candidate graph"
        )
    ordinals = {row.value.engine_image_name: row.value.ordinal for row in frames}
    frame_by_name = {row.value.engine_image_name: row.value for row in frames}
    geometries: dict[tuple[str, str], CandidateTwoViewGeometry] = {}
    for index, geometry in enumerate(rows):
        _checkpoint(deadline, index)
        if type(geometry) is not CandidateTwoViewGeometry:
            raise _invalid("two-view geometry has the wrong immutable contract type")
        first = geometry.first_engine_image_name
        second = geometry.second_engine_image_name
        pair = (first, second)
        if pair not in expected_set or pair in geometries:
            raise _invalid(
                "two-view snapshot has an unknown, reversed, or duplicate candidate pair"
            )
        inliers = _validate_inliers(
            geometry.inlier_correspondences,
            deadline=deadline,
        )
        first_keypoint_count = len(frame_by_name[first].database_keypoints)
        second_keypoint_count = len(frame_by_name[second].database_keypoints)
        if any(
            left_index >= first_keypoint_count or right_index >= second_keypoint_count
            for left_index, right_index in inliers
        ):
            raise _invalid(
                "two-view inlier index is outside an endpoint database keypoint table"
            )
        rotation_value = geometry.verified_relative_rotation
        translation_value = geometry.verified_translation_direction
        if (rotation_value is None) != (translation_value is None):
            raise _invalid("verified two-view geometry must be complete or absent")
        rotation: Matrix3 | None = None
        translation: Vector3 | None = None
        if rotation_value is not None:
            rotation = _rotation(rotation_value, "verified relative rotation")
            translation = _vector3(
                translation_value,
                "verified translation direction",
                require_unit=True,
            )
        if len(inliers) >= MIN_VERIFIED_INLIERS and rotation is None:
            raise _invalid("verified inlier floor requires relative-pose geometry")
        geometries[pair] = CandidateTwoViewGeometry(
            first,
            second,
            inliers,
            rotation,
            translation,
        )
    if set(geometries) != expected_set:
        raise _invalid("two-view snapshot omitted a deterministic candidate pair")

    parent = {name: name for name in frame_by_name}

    def find(name: str) -> str:
        while parent[name] != name:
            parent[name] = parent[parent[name]]
            name = parent[name]
        return name

    def union(first: str, second: str) -> None:
        first_root = find(first)
        second_root = find(second)
        if first_root != second_root:
            parent[second_root] = first_root

    verified_loop_count = 0
    for pair in expected_pairs:
        geometry = geometries[pair]
        if len(geometry.inlier_correspondences) < MIN_VERIFIED_INLIERS:
            continue
        union(*pair)
        if ordinals[pair[1]] - ordinals[pair[0]] > TEMPORAL_WINDOW:
            verified_loop_count += 1
    component_sizes: dict[str, int] = {}
    for name in frame_by_name:
        root = find(name)
        component_sizes[root] = component_sizes.get(root, 0) + 1
    connected_fraction = max(component_sizes.values(), default=0) / len(frames)
    if connected_fraction < MIN_CONNECTED_FRACTION:
        raise _low_overlap("insufficient_verified_connected_coverage")
    if verified_loop_count == 0:
        raise _low_overlap("no_verified_non_temporal_loop")

    loop_documents: list[dict[str, object]] = []
    raw_rotation_squared: list[float] = []
    refined_rotation_squared: list[float] = []
    raw_translation_squared: list[float] = []
    refined_translation_squared: list[float] = []
    for index, pair in enumerate(expected_pairs):
        _checkpoint(deadline, index)
        geometry = geometries[pair]
        if (
            ordinals[pair[1]] - ordinals[pair[0]] <= TEMPORAL_WINDOW
            or len(geometry.inlier_correspondences) < MIN_VERIFIED_INLIERS
            or geometry.verified_relative_rotation is None
            or geometry.verified_translation_direction is None
        ):
            continue
        first_frame = frame_by_name[pair[0]]
        second_frame = frame_by_name[pair[1]]
        raw_rotation, raw_translation = _relative_pose(
            first_frame.raw_cam_from_world,
            second_frame.raw_cam_from_world,
        )
        refined_rotation, refined_translation = _relative_pose(
            first_frame.refined_cam_from_world,
            second_frame.refined_cam_from_world,
        )
        raw_rotation_error = _rotation_disagreement_degrees(
            geometry.verified_relative_rotation,
            raw_rotation,
        )
        refined_rotation_error = _rotation_disagreement_degrees(
            geometry.verified_relative_rotation,
            refined_rotation,
        )
        raw_translation_error = _direction_disagreement_degrees(
            geometry.verified_translation_direction,
            raw_translation,
        )
        refined_translation_error = _direction_disagreement_degrees(
            geometry.verified_translation_direction,
            refined_translation,
        )
        raw_rotation_squared.append(raw_rotation_error * raw_rotation_error)
        refined_rotation_squared.append(refined_rotation_error * refined_rotation_error)
        raw_translation_squared.append(raw_translation_error * raw_translation_error)
        refined_translation_squared.append(
            refined_translation_error * refined_translation_error
        )
        loop_documents.append(
            {
                "first": pair[0],
                "inlierCorrespondences": [
                    [left, right] for left, right in geometry.inlier_correspondences
                ],
                "second": pair[1],
                "verifiedRelativeRotation": _matrix_document(
                    geometry.verified_relative_rotation
                ),
                "verifiedTranslationDirection": _vector_document(
                    geometry.verified_translation_direction
                ),
            }
        )
    count = len(loop_documents)
    digest = _canonical_json_sha256(
        {
            "artifacts": [_artifact_document(row) for row in artifacts],
            "frames": [_frame_document(row.value) for row in frames],
            "schemaVersion": 1,
            "verifiedLoops": loop_documents,
        }
    )
    if count == 0:
        return 0, digest, 0.0, 0.0, 0.0, 0.0
    values = (
        raw_rotation_squared,
        refined_rotation_squared,
        raw_translation_squared,
        refined_translation_squared,
    )
    means = tuple(
        _finite_fsum(sorted(value), "loop evidence RMSE aggregation") / count
        for value in values
    )
    return count, digest, *(math.sqrt(value) for value in means)


def build_refinement_evidence(
    request: RefinementEvidenceBuildRequest,
    *,
    deadline: RefineDeadline,
) -> RefinementEvidence:
    """Construct canonical evidence from complete immutable snapshots."""

    if type(request) is not RefinementEvidenceBuildRequest:
        raise _invalid("evidence request has the wrong immutable contract type")
    if not isinstance(deadline, RefineDeadline):
        raise _invalid("evidence builder requires a carried RefineDeadline")
    _checkpoint(deadline)
    frames = _validate_frames(request.frames, deadline=deadline)
    artifacts = _validate_artifacts(request.engine_artifacts, deadline=deadline)
    _validate_provenance(request.provenance)
    _validate_external_evidence(request)
    frame_by_name = {row.value.engine_image_name: row.value for row in frames}
    raw_tracks = _validate_tracks(
        request.raw_tracks,
        label="raw baseline",
        frame_by_name=frame_by_name,
        deadline=deadline,
    )
    refined_tracks = _validate_tracks(
        request.refined_tracks,
        label="refined model",
        frame_by_name=frame_by_name,
        deadline=deadline,
    )
    (
        observation_count,
        observation_digest,
        raw_reprojection,
        refined_reprojection,
    ) = _build_observation_evidence(
        frames=frames,
        artifacts=artifacts,
        raw_tracks=raw_tracks,
        refined_tracks=refined_tracks,
        deadline=deadline,
    )
    (
        loop_count,
        loop_digest,
        raw_rotation,
        refined_rotation,
        raw_translation,
        refined_translation,
    ) = _build_loop_evidence(
        frames=frames,
        artifacts=artifacts,
        geometries_value=request.two_view_geometries,
        deadline=deadline,
    )
    _checkpoint(deadline)
    return RefinementEvidence(
        input_images=len(frames),
        registered_images_before=len(frames),
        registered_images_after=len(frames),
        common_observations=observation_count,
        common_observation_set_sha256=observation_digest,
        reprojection_rmse_px_before=raw_reprojection,
        reprojection_rmse_px_after=refined_reprojection,
        verified_loop_edges=loop_count,
        verified_loop_set_sha256=loop_digest,
        loop_rotation_rmse_deg_before=raw_rotation,
        loop_rotation_rmse_deg_after=refined_rotation,
        loop_translation_direction_rmse_deg_before=raw_translation,
        loop_translation_direction_rmse_deg_after=refined_translation,
        external_error_m_before=None,
        external_error_m_after=None,
        external_evidence_kind=None,
        external_evidence_ref=None,
    )
