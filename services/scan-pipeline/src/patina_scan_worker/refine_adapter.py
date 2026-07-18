"""P2 refine adapter/geometry proof, deliberately independent of the queue.

This module exercises the proposed format-sensitive pieces of the future refine
stage. Field/Core Image raster semantics and the box materializer remain
unqualified until the explicit fixture described in the item-4 design record:

* Source inspection says Field physically rotates HEIC pixels right. The
  proposed intrinsics/camera-basis transform is executable; source bytes are
  never rotated by this adapter.
* ARKit camera-to-world poses are converted to COLMAP world-to-camera poses.
* Refined camera centres and orientations can be aligned back to ARKit metres
  with a Sim(3). Shape change is explicitly diagnostic, not quality evidence.
* The temporal/spatial match graph and low-overlap verdict are deterministic.
* Adapter artifacts are immutable, checksummed, versioned, and manifest-last.

It does not register a stage, touch the task queue, invoke storage, or write any
business table. The future handler can import these pure functions.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import os
import re
import subprocess
import tempfile
import time
from dataclasses import dataclass
from pathlib import Path, PurePosixPath
from typing import Any, Iterable, Mapping, Sequence

Vector3 = tuple[float, float, float]
Matrix3 = tuple[Vector3, Vector3, Vector3]

ADAPTER_SCHEMA_VERSION = 2
COLMAP_TARGET_VERSION = "4.0.2"
ENGINE_QUALIFICATION_STATUS = "unvalidated-pending-field-and-box-fixture"
REFINE_STAGE_ENGINE_BUDGET_S = 4 * 60
LEASE_COMPLETION_RESERVE_S = 60
COLMAP_LOG_TAIL_BYTES = 64 * 1024

TEMPORAL_WINDOW = 10
SPATIAL_RADIUS_M = 1.5
SPATIAL_MIN_BASELINE_M = 0.25
MAX_SPATIAL_NEIGHBORS = 8
MIN_VERIFIED_INLIERS = 30
MIN_CONNECTED_FRACTION = 0.80
MIN_REFINEMENT_RELATIVE_IMPROVEMENT = 0.01
POSE_PRIOR_STD_M = 0.10

# ARKit camera: +X right, +Y up, camera looks down -Z. Native CV/COLMAP:
# +X right, +Y down, camera looks down +Z. Field then physically rotates the
# native raster 90 degrees clockwise. C * diag(1, -1, -1) gives this proper
# (determinant +1) camera-basis rotation.
ARKIT_TO_RIGHT_ROTATED_COLMAP: Matrix3 = (
    (0.0, 1.0, 0.0),
    (1.0, 0.0, 0.0),
    (0.0, 0.0, -1.0),
)

# `global_mapper` is intentionally absent: current COLMAP 4 integrates GLOMAP,
# but its CLI accepts intrinsic priors rather than a full-pose seed model.
PRIMARY_PIPELINE = (
    "extract_features_per_image",
    "rewrite_per_image_intrinsics_preserving_image_ids",
    "match_temporal_spatial_pairs",
    "seed_known_pose_sparse_model",
    "point_triangulator",
    "bundle_adjuster",
    "sim3_world_alignment",
)
FALLBACK_PIPELINE = (
    "extract_features_per_image",
    "rewrite_per_image_intrinsics_preserving_image_ids",
    "write_position_priors_with_covariance",
    "match_temporal_spatial_pairs",
    "pose_prior_mapper",
    "bundle_adjuster",
    "sim3_world_alignment",
)


class AdapterError(ValueError):
    """Stable adapter failure carrying a future worker error token."""

    def __init__(self, message: str, code: str = "REFINE_ADAPTER_INVALID") -> None:
        super().__init__(message)
        self.code = code


@dataclass(frozen=True)
class PinholeIntrinsics:
    fx: float
    fy: float
    cx: float
    cy: float
    image_width: int
    image_height: int


@dataclass(frozen=True)
class ColmapPose:
    """COLMAP's world-to-camera rigid transform (`cam_from_world`)."""

    rotation: Matrix3
    translation: Vector3
    qvec: tuple[float, float, float, float]  # Hamilton order: qw, qx, qy, qz


@dataclass(frozen=True)
class PositionPrior:
    """Fallback prior: position + covariance only; rotation is not represented."""

    position_m: Vector3
    covariance_m2: Matrix3


@dataclass(frozen=True)
class RefineDeadline:
    """One lease-aware absolute deadline shared by every engine command."""

    expires_at_monotonic_s: float

    @classmethod
    def start(
        cls,
        *,
        lease_expires_at_monotonic_s: float,
        now_monotonic_s: float | None = None,
    ) -> "RefineDeadline":
        now = time.monotonic() if now_monotonic_s is None else now_monotonic_s
        if not math.isfinite(now) or not math.isfinite(lease_expires_at_monotonic_s):
            raise AdapterError("refine deadline needs finite monotonic timestamps")
        deadline = min(
            now + REFINE_STAGE_ENGINE_BUDGET_S,
            lease_expires_at_monotonic_s - LEASE_COMPLETION_RESERVE_S,
        )
        if deadline <= now:
            raise AdapterError(
                "claimed lease has no engine time after the completion reserve",
                "REFINE_ENGINE_TIMEOUT",
            )
        return cls(deadline)

    def remaining_seconds(self, *, now_monotonic_s: float | None = None) -> float:
        now = time.monotonic() if now_monotonic_s is None else now_monotonic_s
        remaining = self.expires_at_monotonic_s - now
        if not math.isfinite(remaining) or remaining <= 0:
            raise AdapterError("refine stage engine deadline is exhausted", "REFINE_ENGINE_TIMEOUT")
        return remaining


@dataclass(frozen=True)
class EngineQualification:
    """Result produced by the future real CLI+binding qualification fixture."""

    target_version: str
    cli_version: str
    binding_version: str


@dataclass(frozen=True)
class ColmapCommandResult:
    returncode: int
    log_path: Path
    output_tail: str


@dataclass(frozen=True)
class NormalizedFrame:
    ordinal: int
    frame_timestamp_s: float
    heic_path: str
    image_name: str
    arkit_camera_to_world: tuple[float, ...]
    native_intrinsics: PinholeIntrinsics
    intrinsics: PinholeIntrinsics
    colmap_pose: ColmapPose
    camera_center_m: Vector3
    pose_prior: PositionPrior


@dataclass(frozen=True)
class Sim3:
    """Target = scale * rotation * source + translation."""

    scale: float
    rotation: Matrix3
    translation: Vector3

    @classmethod
    def identity(cls) -> "Sim3":
        return cls(
            scale=1.0,
            rotation=((1.0, 0.0, 0.0), (0.0, 1.0, 0.0), (0.0, 0.0, 1.0)),
            translation=(0.0, 0.0, 0.0),
        )

    def apply(self, point: Sequence[float]) -> Vector3:
        rotated = _mat_vec(self.rotation, _point(point, "Sim(3) source point"))
        return tuple(self.scale * rotated[i] + self.translation[i] for i in range(3))  # type: ignore[return-value]


@dataclass(frozen=True)
class TrajectoryShapeChangeMetrics:
    """Similarity-invariant change from raw ARKit, never an accuracy score."""

    shape_change_rmse_m: float
    raw_keyframe_rms_radius_m: float
    trajectory_shape_change_pct: float
    mean_keyframe_displacement_pct: float
    max_keyframe_displacement_m: float
    certification_role: str = "diagnostic-only"


@dataclass(frozen=True)
class RefinementEvidence:
    """Comparable before/after evidence evaluated on the same feature tracks."""

    input_images: int
    registered_images_before: int
    registered_images_after: int
    common_observations: int
    common_observation_set_sha256: str
    reprojection_rmse_px_before: float
    reprojection_rmse_px_after: float
    verified_loop_edges: int
    verified_loop_set_sha256: str
    loop_rotation_rmse_deg_before: float
    loop_rotation_rmse_deg_after: float
    loop_translation_direction_rmse_deg_before: float
    loop_translation_direction_rmse_deg_after: float
    external_error_m_before: float | None = None
    external_error_m_after: float | None = None
    external_evidence_kind: str | None = None
    external_evidence_ref: str | None = None


@dataclass(frozen=True)
class RefinementEvidenceVerdict:
    refinement_evidenced: bool
    absolute_accuracy_certified: bool
    code: str | None
    reason: str
    registration_coverage_before: float
    registration_coverage_after: float


@dataclass(frozen=True)
class PresentEnqueueContract:
    task_type: str
    idempotency_key: str
    payload: dict[str, Any]
    parent_task_id: str
    on_conflict: str = "ignore"


@dataclass(frozen=True)
class OverlapVerdict:
    ok: bool
    fatal: bool
    code: str | None
    reason: str
    verified_edges: int
    verified_loop_edges: int
    largest_component_fraction: float


def _number(value: Any, label: str) -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise AdapterError(f"{label} must be a finite number")
    result = float(value)
    if not math.isfinite(result):
        raise AdapterError(f"{label} must be a finite number")
    return result


def _positive_int(value: Any, label: str) -> int:
    if isinstance(value, bool) or not isinstance(value, int) or value <= 0:
        raise AdapterError(f"{label} must be a positive integer")
    return value


def qualify_colmap_versions(cli_output: str, binding_version: str) -> EngineQualification:
    """Require the future box fixture's CLI and binding to match the target.

    Calling this function is only one assertion inside that fixture; it does not
    make this repository or adapter artifact "validated" by itself.
    """

    cli_match = re.search(r"(?<!\d)(\d+\.\d+\.\d+)(?!\d)", cli_output)
    binding_match = re.fullmatch(r"(\d+\.\d+\.\d+)", binding_version.strip())
    cli_version = cli_match.group(1) if cli_match else "unparseable"
    parsed_binding = binding_match.group(1) if binding_match else "unparseable"
    if cli_version != COLMAP_TARGET_VERSION or parsed_binding != COLMAP_TARGET_VERSION:
        raise AdapterError(
            "COLMAP CLI/PyCOLMAP mismatch: "
            f"target={COLMAP_TARGET_VERSION}, cli={cli_version}, binding={parsed_binding}",
            "REFINE_ENGINE_VERSION_MISMATCH",
        )
    return EngineQualification(COLMAP_TARGET_VERSION, cli_version, parsed_binding)


def _stable_identifier(value: Any, label: str) -> str:
    if not isinstance(value, str) or not value or value in (".", "..") or "/" in value or "\\" in value:
        raise AdapterError(f"{label} must be a stable path-safe identifier")
    return value


def build_present_enqueue_contract(
    *,
    scan_id: str,
    room_file_id: str,
    room_file_version: int,
    user_id: str,
    refine_task_id: str,
) -> PresentEnqueueContract:
    """Return the one order-independent enqueue used by both terminal branches.

    No branch-specific artifact pointer belongs in this payload. Present derives
    all canonical manifest keys from these stable identifiers and verifies them.
    Both branch tips use the common refine task as parent, so first-finisher order
    cannot change the durable queue row.
    """

    scan = _stable_identifier(scan_id, "scan_id")
    room_file = _stable_identifier(room_file_id, "room_file_id")
    user = _stable_identifier(user_id, "user_id")
    refine_task = _stable_identifier(refine_task_id, "refine_task_id")
    version = _positive_int(room_file_version, "room_file_version")
    payload = {
        "scan_id": scan,
        "room_file_id": room_file,
        "room_file_version": version,
        "user_id": user,
        "refine_task_id": refine_task,
    }
    return PresentEnqueueContract(
        task_type="scan_pipeline.present",
        idempotency_key=f"{scan}:present:{version}",
        payload=payload,
        parent_task_id=refine_task,
    )


def canonical_present_manifest_keys(
    user_id: str,
    scan_id: str,
    room_file_version: int,
) -> dict[str, str]:
    """Manifest locations Present derives; mesh solve is a required branch tip."""

    user = _stable_identifier(user_id, "user_id")
    scan = _stable_identifier(scan_id, "scan_id")
    version = _positive_int(room_file_version, "room_file_version")
    prefix = f"room_file/{user}/{scan}/v{version}"
    return {
        "refine": f"{prefix}/refine/refine-manifest-v1.json",
        "fuse": f"{prefix}/fuse/fuse-manifest-v1.json",
        "meshSolve": f"{prefix}/solve-upgrade/mesh-solve-manifest-v1.json",
        "splat": f"{prefix}/splat/splat-manifest-v1.json",
    }


def _point(value: Sequence[float], label: str) -> Vector3:
    if len(value) != 3:
        raise AdapterError(f"{label} must contain exactly three numbers")
    return tuple(_number(component, label) for component in value)  # type: ignore[return-value]


def _dot(a: Sequence[float], b: Sequence[float]) -> float:
    return sum(a[i] * b[i] for i in range(3))


def _norm(a: Sequence[float]) -> float:
    return math.sqrt(_dot(a, a))


def _cross(a: Sequence[float], b: Sequence[float]) -> Vector3:
    return (
        a[1] * b[2] - a[2] * b[1],
        a[2] * b[0] - a[0] * b[2],
        a[0] * b[1] - a[1] * b[0],
    )


def _mat_vec(matrix: Matrix3, vector: Sequence[float]) -> Vector3:
    return tuple(sum(matrix[row][col] * vector[col] for col in range(3)) for row in range(3))  # type: ignore[return-value]


def _mat_mul(a: Matrix3, b: Matrix3) -> Matrix3:
    return tuple(
        tuple(sum(a[row][k] * b[k][col] for k in range(3)) for col in range(3))
        for row in range(3)
    )  # type: ignore[return-value]


def _transpose(matrix: Matrix3) -> Matrix3:
    return tuple(tuple(matrix[col][row] for col in range(3)) for row in range(3))  # type: ignore[return-value]


def _determinant(matrix: Matrix3) -> float:
    return (
        matrix[0][0] * (matrix[1][1] * matrix[2][2] - matrix[1][2] * matrix[2][1])
        - matrix[0][1] * (matrix[1][0] * matrix[2][2] - matrix[1][2] * matrix[2][0])
        + matrix[0][2] * (matrix[1][0] * matrix[2][1] - matrix[1][1] * matrix[2][0])
    )


def _parse_arkit_transform(values: Sequence[Any]) -> tuple[Matrix3, Vector3, tuple[float, ...]]:
    if not isinstance(values, (list, tuple)) or len(values) != 16:
        raise AdapterError("cameraTransform must be a row-major 4x4 matrix")
    flat = tuple(_number(value, "cameraTransform") for value in values)
    rotation: Matrix3 = (
        (flat[0], flat[1], flat[2]),
        (flat[4], flat[5], flat[6]),
        (flat[8], flat[9], flat[10]),
    )
    center = (flat[3], flat[7], flat[11])
    if any(abs(flat[index] - expected) > 1e-6 for index, expected in zip((12, 13, 14, 15), (0, 0, 0, 1))):
        raise AdapterError("cameraTransform must have a rigid homogeneous bottom row")
    identity = _mat_mul(_transpose(rotation), rotation)
    for row in range(3):
        for col in range(3):
            expected = 1.0 if row == col else 0.0
            if abs(identity[row][col] - expected) > 5e-3:
                raise AdapterError("cameraTransform rotation must be orthonormal")
    if abs(_determinant(rotation) - 1.0) > 5e-3:
        raise AdapterError("cameraTransform rotation must have determinant +1")
    return rotation, center, flat


def _canonical_quaternion(values: Sequence[float]) -> tuple[float, float, float, float]:
    length = math.sqrt(sum(value * value for value in values))
    if length <= 1e-15:
        raise AdapterError("rotation produced a zero quaternion")
    quaternion = tuple(value / length for value in values)
    # q and -q describe the same rotation. A canonical sign makes artifacts
    # byte-deterministic, including 180-degree rotations where qw is zero.
    for value in quaternion:
        if abs(value) > 1e-14:
            if value < 0:
                quaternion = tuple(-component for component in quaternion)
            break
    return quaternion  # type: ignore[return-value]


def _rotation_to_quaternion(matrix: Matrix3) -> tuple[float, float, float, float]:
    trace = matrix[0][0] + matrix[1][1] + matrix[2][2]
    if trace > 0.0:
        scale = math.sqrt(trace + 1.0) * 2.0
        values = (
            0.25 * scale,
            (matrix[2][1] - matrix[1][2]) / scale,
            (matrix[0][2] - matrix[2][0]) / scale,
            (matrix[1][0] - matrix[0][1]) / scale,
        )
    elif matrix[0][0] >= matrix[1][1] and matrix[0][0] >= matrix[2][2]:
        scale = math.sqrt(1.0 + matrix[0][0] - matrix[1][1] - matrix[2][2]) * 2.0
        values = (
            (matrix[2][1] - matrix[1][2]) / scale,
            0.25 * scale,
            (matrix[0][1] + matrix[1][0]) / scale,
            (matrix[0][2] + matrix[2][0]) / scale,
        )
    elif matrix[1][1] >= matrix[2][2]:
        scale = math.sqrt(1.0 + matrix[1][1] - matrix[0][0] - matrix[2][2]) * 2.0
        values = (
            (matrix[0][2] - matrix[2][0]) / scale,
            (matrix[0][1] + matrix[1][0]) / scale,
            0.25 * scale,
            (matrix[1][2] + matrix[2][1]) / scale,
        )
    else:
        scale = math.sqrt(1.0 + matrix[2][2] - matrix[0][0] - matrix[1][1]) * 2.0
        values = (
            (matrix[1][0] - matrix[0][1]) / scale,
            (matrix[0][2] + matrix[2][0]) / scale,
            (matrix[1][2] + matrix[2][1]) / scale,
            0.25 * scale,
        )
    return _canonical_quaternion(values)


def _quaternion_to_rotation(quaternion: Sequence[float]) -> Matrix3:
    w, x, y, z = _canonical_quaternion(quaternion)
    return (
        (1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)),
        (2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)),
        (2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)),
    )


def right_rotated_intrinsics(
    native: PinholeIntrinsics,
    *,
    encoded_width: int,
    encoded_height: int,
) -> PinholeIntrinsics:
    """Transform native-sensor K for Field's physically-right-rotated HEIC.

    Coordinates use the continuous top-left image-edge convention. For native
    `(u, v)`, the physical clockwise raster maps to `(H - v, u)`, hence
    `(fx', fy', cx', cy') = (fy, fx, H - cy, cx)` and `(W', H') = (H, W)`.
    No image orientation operation belongs in this adapter.
    """

    for name in ("fx", "fy"):
        if not math.isfinite(getattr(native, name)) or getattr(native, name) <= 0:
            raise AdapterError(f"native {name} must be positive and finite")
    for name in ("cx", "cy"):
        if not math.isfinite(getattr(native, name)):
            raise AdapterError(f"native {name} must be finite")
    if native.image_width <= 0 or native.image_height <= 0:
        raise AdapterError("native image dimensions must be positive")
    if encoded_width != native.image_height or encoded_height != native.image_width:
        raise AdapterError(
            "encoded HEIC dimensions do not match a physically right-rotated native image"
        )
    return PinholeIntrinsics(
        fx=native.fy,
        fy=native.fx,
        cx=native.image_height - native.cy,
        cy=native.cx,
        image_width=encoded_width,
        image_height=encoded_height,
    )


def arkit_c2w_to_colmap_w2c(camera_transform: Sequence[Any]) -> ColmapPose:
    """Convert row-major ARKit camera-to-world to rotated COLMAP world-to-camera."""

    arkit_rotation, camera_center, _ = _parse_arkit_transform(camera_transform)
    rotation = _mat_mul(ARKIT_TO_RIGHT_ROTATED_COLMAP, _transpose(arkit_rotation))
    rotated_center = _mat_vec(rotation, camera_center)
    translation = tuple(-component for component in rotated_center)  # type: ignore[assignment]
    return ColmapPose(
        rotation=rotation,
        translation=translation,
        qvec=_rotation_to_quaternion(rotation),
    )


def colmap_w2c_to_arkit_c2w(pose: ColmapPose) -> list[float]:
    """Inverse of :func:`arkit_c2w_to_colmap_w2c`."""

    colmap_to_world = _transpose(pose.rotation)
    camera_center = tuple(-value for value in _mat_vec(colmap_to_world, pose.translation))
    arkit_rotation = _mat_mul(colmap_to_world, ARKIT_TO_RIGHT_ROTATED_COLMAP)
    return [
        arkit_rotation[0][0], arkit_rotation[0][1], arkit_rotation[0][2], camera_center[0],
        arkit_rotation[1][0], arkit_rotation[1][1], arkit_rotation[1][2], camera_center[1],
        arkit_rotation[2][0], arkit_rotation[2][1], arkit_rotation[2][2], camera_center[2],
        0.0, 0.0, 0.0, 1.0,
    ]


def normalize_keyframe_entry(entry: Mapping[str, Any], ordinal: int) -> NormalizedFrame:
    """Validate one Field v3 keyframe-index row and derive COLMAP inputs."""

    if not isinstance(entry, Mapping):
        raise AdapterError(f"keyframe row {ordinal} must be a JSON object")
    heic_path_value = entry.get("heicPath")
    if not isinstance(heic_path_value, str) or not heic_path_value:
        raise AdapterError(f"keyframe row {ordinal} needs heicPath")
    pure_path = PurePosixPath(heic_path_value)
    if pure_path.is_absolute() or ".." in pure_path.parts or pure_path.suffix.lower() != ".heic":
        raise AdapterError(f"keyframe row {ordinal} has an unsafe HEIC path")
    image_name = pure_path.name
    if any(character.isspace() for character in image_name):
        raise AdapterError(f"keyframe row {ordinal} image name cannot contain whitespace")

    frame_timestamp = _number(entry.get("frameTimestamp"), f"keyframe row {ordinal} frameTimestamp")
    intrinsics_value = entry.get("intrinsics")
    if not isinstance(intrinsics_value, Mapping):
        raise AdapterError(f"keyframe row {ordinal} needs intrinsics")
    native = PinholeIntrinsics(
        fx=_number(intrinsics_value.get("fx"), "intrinsics.fx"),
        fy=_number(intrinsics_value.get("fy"), "intrinsics.fy"),
        cx=_number(intrinsics_value.get("cx"), "intrinsics.cx"),
        cy=_number(intrinsics_value.get("cy"), "intrinsics.cy"),
        image_width=_positive_int(intrinsics_value.get("imageWidth"), "intrinsics.imageWidth"),
        image_height=_positive_int(intrinsics_value.get("imageHeight"), "intrinsics.imageHeight"),
    )
    encoded_width = _positive_int(entry.get("width"), f"keyframe row {ordinal} width")
    encoded_height = _positive_int(entry.get("height"), f"keyframe row {ordinal} height")
    rotated = right_rotated_intrinsics(
        native,
        encoded_width=encoded_width,
        encoded_height=encoded_height,
    )
    rotation, camera_center, flat_transform = _parse_arkit_transform(entry.get("cameraTransform"))
    del rotation
    pose = arkit_c2w_to_colmap_w2c(flat_transform)
    variance = POSE_PRIOR_STD_M * POSE_PRIOR_STD_M
    covariance: Matrix3 = (
        (variance, 0.0, 0.0),
        (0.0, variance, 0.0),
        (0.0, 0.0, variance),
    )
    return NormalizedFrame(
        ordinal=ordinal,
        frame_timestamp_s=frame_timestamp,
        heic_path=heic_path_value,
        image_name=image_name,
        arkit_camera_to_world=flat_transform,
        native_intrinsics=native,
        intrinsics=rotated,
        colmap_pose=pose,
        camera_center_m=camera_center,
        pose_prior=PositionPrior(position_m=camera_center, covariance_m2=covariance),
    )


def load_keyframe_index(path: str | os.PathLike[str]) -> tuple[NormalizedFrame, ...]:
    index_path = Path(path)
    frames: list[NormalizedFrame] = []
    try:
        lines = index_path.read_text(encoding="utf-8").splitlines()
    except OSError as exc:
        raise AdapterError(f"cannot read keyframe index: {exc}", "REFINE_INPUT_IO") from exc
    for line_number, line in enumerate(lines, 1):
        if not line.strip():
            continue
        try:
            value = json.loads(line)
        except json.JSONDecodeError as exc:
            raise AdapterError(f"invalid keyframe index JSON on line {line_number}: {exc.msg}") from exc
        frames.append(normalize_keyframe_entry(value, len(frames)))
    if len(frames) < 3:
        raise AdapterError("refine needs at least three keyframes", "REFINE_LOW_OVERLAP")
    names = [frame.image_name for frame in frames]
    paths = [frame.heic_path for frame in frames]
    if len(names) != len(set(names)) or len(paths) != len(set(paths)):
        raise AdapterError("keyframe image names and paths must be unique")
    return tuple(sorted(frames, key=lambda frame: (frame.frame_timestamp_s, frame.image_name)))


def _canonical_pair(first: str, second: str) -> tuple[str, str]:
    if first == second:
        raise AdapterError("a match pair cannot reference the same image twice")
    return (first, second) if first < second else (second, first)


def build_pair_graph(
    frames: Iterable[NormalizedFrame],
    *,
    temporal_window: int = TEMPORAL_WINDOW,
    spatial_radius_m: float = SPATIAL_RADIUS_M,
    spatial_min_baseline_m: float = SPATIAL_MIN_BASELINE_M,
    max_spatial_neighbors: int = MAX_SPATIAL_NEIGHBORS,
) -> tuple[tuple[str, str], ...]:
    """Build sorted temporal pairs plus bounded ARKit-spatial loop candidates."""

    if temporal_window < 1 or max_spatial_neighbors < 1:
        raise AdapterError("pair-graph windows must be positive")
    if not (0 <= spatial_min_baseline_m < spatial_radius_m):
        raise AdapterError("spatial pair bounds must satisfy 0 <= minimum < radius")
    ordered = sorted(frames, key=lambda frame: (frame.frame_timestamp_s, frame.image_name))
    if len({frame.image_name for frame in ordered}) != len(ordered):
        raise AdapterError("pair graph needs unique image names")
    pairs: set[tuple[str, str]] = set()
    for left in range(len(ordered)):
        for right in range(left + 1, min(len(ordered), left + temporal_window + 1)):
            pairs.add(_canonical_pair(ordered[left].image_name, ordered[right].image_name))

        spatial_candidates: list[tuple[float, str, int]] = []
        for right, candidate in enumerate(ordered):
            if right == left or abs(right - left) <= temporal_window:
                continue
            distance = _norm(
                tuple(candidate.camera_center_m[axis] - ordered[left].camera_center_m[axis] for axis in range(3))
            )
            if spatial_min_baseline_m <= distance <= spatial_radius_m:
                spatial_candidates.append((distance, candidate.image_name, right))
        for _, _, right in sorted(spatial_candidates)[:max_spatial_neighbors]:
            pairs.add(_canonical_pair(ordered[left].image_name, ordered[right].image_name))
    return tuple(sorted(pairs))


def classify_overlap(
    frames: Iterable[NormalizedFrame],
    verified_inliers: Mapping[tuple[str, str], int],
    *,
    temporal_window: int = TEMPORAL_WINDOW,
    spatial_radius_m: float = SPATIAL_RADIUS_M,
    spatial_min_baseline_m: float = SPATIAL_MIN_BASELINE_M,
    max_spatial_neighbors: int = MAX_SPATIAL_NEIGHBORS,
    minimum_inliers: int = MIN_VERIFIED_INLIERS,
    minimum_connected_fraction: float = MIN_CONNECTED_FRACTION,
) -> OverlapVerdict:
    """Return the deterministic permanent verdict after geometric verification."""

    ordered = sorted(frames, key=lambda frame: (frame.frame_timestamp_s, frame.image_name))
    if len(ordered) < 3:
        return OverlapVerdict(False, True, "REFINE_LOW_OVERLAP", "fewer_than_three_frames", 0, 0, 0.0)
    candidate_pairs = set(
        build_pair_graph(
            ordered,
            temporal_window=temporal_window,
            spatial_radius_m=spatial_radius_m,
            spatial_min_baseline_m=spatial_min_baseline_m,
            max_spatial_neighbors=max_spatial_neighbors,
        )
    )
    positions = {frame.image_name: index for index, frame in enumerate(ordered)}
    adjacency = {frame.image_name: set() for frame in ordered}
    verified_edges = 0
    loop_edges = 0
    seen: set[tuple[str, str]] = set()
    for pair, inliers in sorted(verified_inliers.items()):
        if len(pair) != 2 or pair[0] not in positions or pair[1] not in positions or pair[0] == pair[1]:
            continue
        canonical = _canonical_pair(pair[0], pair[1])
        if (
            canonical not in candidate_pairs
            or canonical in seen
            or isinstance(inliers, bool)
            or not isinstance(inliers, int)
            or inliers < minimum_inliers
        ):
            continue
        seen.add(canonical)
        verified_edges += 1
        first, second = canonical
        adjacency[first].add(second)
        adjacency[second].add(first)
        if abs(positions[first] - positions[second]) > temporal_window:
            loop_edges += 1

    largest = 0
    remaining = set(adjacency)
    while remaining:
        seed = min(remaining)
        stack = [seed]
        component: set[str] = set()
        while stack:
            current = stack.pop()
            if current in component:
                continue
            component.add(current)
            stack.extend(sorted(adjacency[current] - component, reverse=True))
        remaining -= component
        largest = max(largest, len(component))
    connected_fraction = largest / len(ordered)
    if connected_fraction < minimum_connected_fraction:
        return OverlapVerdict(
            False,
            True,
            "REFINE_LOW_OVERLAP",
            "insufficient_verified_connected_coverage",
            verified_edges,
            loop_edges,
            connected_fraction,
        )
    if loop_edges == 0:
        return OverlapVerdict(
            False,
            True,
            "REFINE_LOW_OVERLAP",
            "no_verified_non_temporal_loop",
            verified_edges,
            0,
            connected_fraction,
        )
    return OverlapVerdict(True, False, None, "verified", verified_edges, loop_edges, connected_fraction)


def _centroid(points: Sequence[Vector3]) -> Vector3:
    return tuple(sum(point[axis] for point in points) / len(points) for axis in range(3))  # type: ignore[return-value]


def _center(points: Sequence[Vector3], centroid: Vector3) -> list[Vector3]:
    return [tuple(point[axis] - centroid[axis] for axis in range(3)) for point in points]  # type: ignore[misc]


def _require_non_collinear(centered: Sequence[Vector3], label: str) -> None:
    first = max(centered, key=lambda point: _dot(point, point))
    first_norm_sq = _dot(first, first)
    if first_norm_sq <= 1e-18:
        raise AdapterError(f"Sim(3) {label} points must be non-collinear")
    max_cross = max((_norm(_cross(first, point)) for point in centered), default=0.0)
    if max_cross <= first_norm_sq * 1e-9:
        raise AdapterError(f"Sim(3) {label} points must be non-collinear")


def _largest_symmetric_eigenvector(matrix: Sequence[Sequence[float]]) -> tuple[float, ...]:
    """Cyclic Jacobi eigen solve for the tiny symmetric 4x4 Horn matrix."""

    size = len(matrix)
    values = [list(row) for row in matrix]
    vectors = [[1.0 if row == col else 0.0 for col in range(size)] for row in range(size)]
    for _ in range(100):
        p, q = max(
            ((row, col) for row in range(size) for col in range(row + 1, size)),
            key=lambda pair: abs(values[pair[0]][pair[1]]),
        )
        off_diagonal = values[p][q]
        if abs(off_diagonal) <= 1e-15:
            break
        tau = (values[q][q] - values[p][p]) / (2.0 * off_diagonal)
        tangent = (1.0 if tau >= 0.0 else -1.0) / (abs(tau) + math.sqrt(1.0 + tau * tau))
        cosine = 1.0 / math.sqrt(1.0 + tangent * tangent)
        sine = tangent * cosine
        pp, qq = values[p][p], values[q][q]
        for index in range(size):
            if index in (p, q):
                continue
            ip, iq = values[index][p], values[index][q]
            values[index][p] = values[p][index] = cosine * ip - sine * iq
            values[index][q] = values[q][index] = sine * ip + cosine * iq
        values[p][p] = cosine * cosine * pp - 2.0 * sine * cosine * off_diagonal + sine * sine * qq
        values[q][q] = sine * sine * pp + 2.0 * sine * cosine * off_diagonal + cosine * cosine * qq
        values[p][q] = values[q][p] = 0.0
        for row in range(size):
            vp, vq = vectors[row][p], vectors[row][q]
            vectors[row][p] = cosine * vp - sine * vq
            vectors[row][q] = sine * vp + cosine * vq
    largest = max(range(size), key=lambda index: values[index][index])
    return tuple(vectors[row][largest] for row in range(size))


def estimate_sim3(source: Sequence[Sequence[float]], target: Sequence[Sequence[float]]) -> Sim3:
    """Horn absolute orientation with a positive uniform scale, dependency-free."""

    if len(source) != len(target) or len(source) < 3:
        raise AdapterError("Sim(3) needs at least three paired points")
    source_points = [_point(point, "Sim(3) source point") for point in source]
    target_points = [_point(point, "Sim(3) target point") for point in target]
    source_centroid = _centroid(source_points)
    target_centroid = _centroid(target_points)
    source_centered = _center(source_points, source_centroid)
    target_centered = _center(target_points, target_centroid)
    _require_non_collinear(source_centered, "source")
    _require_non_collinear(target_centered, "target")

    # Cross-dispersion S = sum(source * target^T), Horn 1987.
    dispersion = [
        [sum(x[row] * y[col] for x, y in zip(source_centered, target_centered)) for col in range(3)]
        for row in range(3)
    ]
    sxx, sxy, sxz = dispersion[0]
    syx, syy, syz = dispersion[1]
    szx, szy, szz = dispersion[2]
    horn = (
        (sxx + syy + szz, syz - szy, szx - sxz, sxy - syx),
        (syz - szy, sxx - syy - szz, sxy + syx, szx + sxz),
        (szx - sxz, sxy + syx, -sxx + syy - szz, syz + szy),
        (sxy - syx, szx + sxz, syz + szy, -sxx - syy + szz),
    )
    quaternion = _canonical_quaternion(_largest_symmetric_eigenvector(horn))
    rotation = _quaternion_to_rotation(quaternion)
    denominator = sum(_dot(point, point) for point in source_centered)
    numerator = sum(_dot(y, _mat_vec(rotation, x)) for x, y in zip(source_centered, target_centered))
    scale = numerator / denominator if denominator > 0.0 else math.nan
    if not math.isfinite(scale) or scale <= 1e-12:
        raise AdapterError("Sim(3) requires a finite positive scale")
    rotated_source_centroid = _mat_vec(rotation, source_centroid)
    translation = tuple(
        target_centroid[axis] - scale * rotated_source_centroid[axis] for axis in range(3)
    )
    return Sim3(scale=scale, rotation=rotation, translation=translation)  # type: ignore[arg-type]


def trajectory_shape_change_metrics(
    source: Sequence[Sequence[float]],
    target: Sequence[Sequence[float]],
    transform: Sim3,
) -> TrajectoryShapeChangeMetrics:
    """Similarity-invariant change between refined and raw keyframe centres.

    This says how much trajectory *shape* changed after the best Sim(3). A no-op
    is exactly zero, so this can never establish reconstruction quality. The RMS
    radius weights captured keyframes equally and is therefore cadence-sensitive.
    """

    if len(source) != len(target) or not source:
        raise AdapterError("shape-change metrics need equal non-empty point sets")
    source_points = [_point(point, "shape-change source point") for point in source]
    target_points = [_point(point, "shape-change target point") for point in target]
    target_centroid = _centroid(target_points)
    radius = math.sqrt(
        sum(_dot(tuple(point[i] - target_centroid[i] for i in range(3)), tuple(point[i] - target_centroid[i] for i in range(3))) for point in target_points)
        / len(target_points)
    )
    if radius <= 1e-12:
        raise AdapterError("raw keyframe trajectory must have non-zero RMS radius")
    residuals = [
        _norm(tuple(target_point[i] - transform.apply(source_point)[i] for i in range(3)))
        for source_point, target_point in zip(source_points, target_points)
    ]
    rmse = math.sqrt(sum(residual * residual for residual in residuals) / len(residuals))
    mean = sum(residuals) / len(residuals)
    return TrajectoryShapeChangeMetrics(
        shape_change_rmse_m=rmse,
        raw_keyframe_rms_radius_m=radius,
        trajectory_shape_change_pct=100.0 * rmse / radius,
        mean_keyframe_displacement_pct=100.0 * mean / radius,
        max_keyframe_displacement_m=max(residuals),
    )


def _relative_improvement(before: float, after: float) -> float:
    if before <= 1e-12:
        return 0.0
    return (before - after) / before


def _relative_gain(before: float, after: float) -> float:
    if before <= 1e-12:
        return 1.0 if after > before else 0.0
    return (after - before) / before


def evaluate_refinement_evidence(evidence: RefinementEvidence) -> RefinementEvidenceVerdict:
    """Evaluate comparable geometric evidence without claiming absolute accuracy.

    Reprojection values must use identical feature tracks/observations before and
    after. Loop values compare trajectory relative poses with the same verified
    non-temporal two-view geometries. Optional external errors are retained as
    evidence, but no absolute-accuracy threshold is ratified here, so this
    function never sets ``absolute_accuracy_certified``. The separate trajectory
    shape-change diagnostic is intentionally not an input and cannot grant or
    veto this verdict.
    """

    integer_fields = {
        "input_images": evidence.input_images,
        "registered_images_before": evidence.registered_images_before,
        "registered_images_after": evidence.registered_images_after,
        "common_observations": evidence.common_observations,
        "verified_loop_edges": evidence.verified_loop_edges,
    }
    if any(isinstance(value, bool) or not isinstance(value, int) or value < 0 for value in integer_fields.values()):
        raise AdapterError("refinement evidence counts must be non-negative integers")
    if evidence.input_images <= 0 or evidence.common_observations <= 0:
        raise AdapterError("refinement evidence needs input images and common observations")
    if max(evidence.registered_images_before, evidence.registered_images_after) > evidence.input_images:
        raise AdapterError("registered image count cannot exceed input image count")
    for label, digest in (
        ("common_observation_set_sha256", evidence.common_observation_set_sha256),
        ("verified_loop_set_sha256", evidence.verified_loop_set_sha256),
    ):
        if not isinstance(digest, str) or re.fullmatch(r"[0-9a-f]{64}", digest) is None:
            raise AdapterError(f"{label} must be a lowercase sha256")
    metrics = (
        evidence.reprojection_rmse_px_before,
        evidence.reprojection_rmse_px_after,
        evidence.loop_rotation_rmse_deg_before,
        evidence.loop_rotation_rmse_deg_after,
        evidence.loop_translation_direction_rmse_deg_before,
        evidence.loop_translation_direction_rmse_deg_after,
    )
    if any(not math.isfinite(value) or value < 0 for value in metrics):
        raise AdapterError("refinement evidence errors must be finite and non-negative")
    external_pair = (evidence.external_error_m_before, evidence.external_error_m_after)
    if (external_pair[0] is None) != (external_pair[1] is None):
        raise AdapterError("external error evidence needs both before and after")
    if any(value is not None and (not math.isfinite(value) or value < 0) for value in external_pair):
        raise AdapterError("external errors must be finite and non-negative")
    external_metadata = (evidence.external_evidence_kind, evidence.external_evidence_ref)
    if external_pair[0] is None:
        if any(value is not None for value in external_metadata):
            raise AdapterError("external evidence metadata requires before/after errors")
    elif any(not isinstance(value, str) or not value.strip() for value in external_metadata):
        raise AdapterError("external errors require evidence kind and provenance reference")

    coverage_before = evidence.registered_images_before / evidence.input_images
    coverage_after = evidence.registered_images_after / evidence.input_images
    if evidence.verified_loop_edges < 1:
        return RefinementEvidenceVerdict(
            False, False, "REFINE_LOW_OVERLAP", "no_verified_loop_evidence", coverage_before, coverage_after
        )
    if coverage_after < MIN_CONNECTED_FRACTION or coverage_after < coverage_before:
        return RefinementEvidenceVerdict(
            False,
            False,
            "REFINE_EVIDENCE_REGRESSION",
            "registration_coverage_regressed_or_below_floor",
            coverage_before,
            coverage_after,
        )
    regressions = (
        evidence.reprojection_rmse_px_after > evidence.reprojection_rmse_px_before,
        evidence.loop_rotation_rmse_deg_after > evidence.loop_rotation_rmse_deg_before,
        evidence.loop_translation_direction_rmse_deg_after
        > evidence.loop_translation_direction_rmse_deg_before,
        external_pair[0] is not None and external_pair[1] > external_pair[0],
    )
    if any(regressions):
        return RefinementEvidenceVerdict(
            False,
            False,
            "REFINE_EVIDENCE_REGRESSION",
            "comparable_geometric_evidence_regressed",
            coverage_before,
            coverage_after,
        )
    improvements = [
        _relative_improvement(evidence.reprojection_rmse_px_before, evidence.reprojection_rmse_px_after),
        _relative_improvement(evidence.loop_rotation_rmse_deg_before, evidence.loop_rotation_rmse_deg_after),
        _relative_improvement(
            evidence.loop_translation_direction_rmse_deg_before,
            evidence.loop_translation_direction_rmse_deg_after,
        ),
        _relative_gain(coverage_before, coverage_after),
    ]
    if external_pair[0] is not None:
        improvements.append(_relative_improvement(external_pair[0], external_pair[1]))  # type: ignore[arg-type]
    if max(improvements, default=0.0) < MIN_REFINEMENT_RELATIVE_IMPROVEMENT:
        return RefinementEvidenceVerdict(
            False,
            False,
            "REFINE_NO_MEASURABLE_IMPROVEMENT",
            "unchanged_or_below_measurable_improvement_floor",
            coverage_before,
            coverage_after,
        )
    return RefinementEvidenceVerdict(
        True,
        False,
        None,
        "internal_geometric_refinement_evidenced_absolute_accuracy_unproven",
        coverage_before,
        coverage_after,
    )


def align_colmap_pose(pose: ColmapPose, transform: Sim3) -> ColmapPose:
    """Rebase a COLMAP pose through the world Sim(3), including orientation.

    If ``metric_world = s * Rg * source_world + t``, then
    ``cam_from_metric_world.R = cam_from_source_world.R * Rg^T``. The camera
    centre receives the full Sim(3); scale does not enter the orientation.
    """

    source_center = tuple(-value for value in _mat_vec(_transpose(pose.rotation), pose.translation))
    metric_center = transform.apply(source_center)
    metric_rotation = _mat_mul(pose.rotation, _transpose(transform.rotation))
    metric_translation = tuple(-value for value in _mat_vec(metric_rotation, metric_center))
    return ColmapPose(
        rotation=metric_rotation,
        translation=metric_translation,  # type: ignore[arg-type]
        qvec=_rotation_to_quaternion(metric_rotation),
    )


def _sha256_bytes(payload: bytes) -> str:
    return hashlib.sha256(payload).hexdigest()


def _sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    try:
        with path.open("rb") as handle:
            while chunk := handle.read(1024 * 1024):
                digest.update(chunk)
    except OSError as exc:
        raise AdapterError(f"cannot read refine input {path}: {exc}", "REFINE_INPUT_IO") from exc
    return digest.hexdigest()


def _json_bytes(value: Any) -> bytes:
    try:
        encoded = json.dumps(
            value,
            sort_keys=True,
            separators=(",", ":"),
            ensure_ascii=False,
            allow_nan=False,
        )
    except (TypeError, ValueError) as exc:
        raise AdapterError(f"adapter artifact is not deterministic JSON: {exc}") from exc
    return (encoded + "\n").encode("utf-8")


def _fsync_directory(path: Path) -> None:
    flags = os.O_RDONLY | getattr(os, "O_DIRECTORY", 0)
    descriptor = os.open(path, flags)
    try:
        os.fsync(descriptor)
    finally:
        os.close(descriptor)


def publish_immutable(path: str | os.PathLike[str], payload: bytes) -> bool:
    """Publish once without replacement; identical concurrent writers are no-ops.

    Returns ``True`` for the writer that created the path and ``False`` when an
    identical path already existed. A different existing payload is a stable
    conflict. The hard-link commit is atomic on the destination filesystem.
    """

    destination = Path(path)
    destination.parent.mkdir(parents=True, exist_ok=True)
    temp_path: Path | None = None
    try:
        with tempfile.NamedTemporaryFile(
            mode="wb",
            dir=destination.parent,
            prefix=f".{destination.name}.",
            delete=False,
        ) as handle:
            temp_path = Path(handle.name)
            handle.write(payload)
            handle.flush()
            os.fsync(handle.fileno())
        try:
            os.link(temp_path, destination)
            _fsync_directory(destination.parent)
            return True
        except FileExistsError:
            try:
                existing = destination.read_bytes()
            except OSError as exc:
                raise AdapterError(
                    f"cannot inspect existing refine artifact {destination}: {exc}",
                    "REFINE_ARTIFACT_CONFLICT",
                ) from exc
            if existing == payload:
                return False
            raise AdapterError(
                f"immutable refine artifact conflicts at {destination}",
                "REFINE_ARTIFACT_CONFLICT",
            )
    finally:
        if temp_path is not None:
            try:
                temp_path.unlink()
            except FileNotFoundError:
                pass


def _frame_artifact(frame: NormalizedFrame, source_sha256: str, source_size: int) -> dict[str, Any]:
    intrinsics = frame.intrinsics
    pose = frame.colmap_pose
    return {
        "ordinal": frame.ordinal,
        "frameTimestampSeconds": frame.frame_timestamp_s,
        "heicPath": frame.heic_path,
        "imageName": frame.image_name,
        "sourceSha256": source_sha256,
        "sourceSizeBytes": source_size,
        "intrinsics": {
            "model": "PINHOLE",
            "params": [intrinsics.fx, intrinsics.fy, intrinsics.cx, intrinsics.cy],
            "width": intrinsics.image_width,
            "height": intrinsics.image_height,
        },
        "camFromWorld": {
            "qvecHamilton": list(pose.qvec),
            "translation": list(pose.translation),
        },
        "positionPrior": {
            "positionMeters": list(frame.pose_prior.position_m),
            "covarianceMetersSquared": [list(row) for row in frame.pose_prior.covariance_m2],
            "rotationRepresented": False,
        },
    }


def _resolve_source(bundle_root: Path, relative_path: str) -> Path:
    candidate = (bundle_root / Path(*PurePosixPath(relative_path).parts)).resolve()
    root = bundle_root.resolve()
    try:
        candidate.relative_to(root)
    except ValueError as exc:
        raise AdapterError(f"keyframe path escapes bundle root: {relative_path}") from exc
    if not candidate.is_file():
        raise AdapterError(f"keyframe HEIC is missing: {relative_path}", "REFINE_INPUT_IO")
    return candidate


def build_adapter_artifacts(
    keyframe_index: str | os.PathLike[str],
    output_dir: str | os.PathLike[str],
    *,
    room_file_version: int,
) -> tuple[Path, Path, Path]:
    """Materialize the deterministic adapter contract; manifest is published last."""

    if isinstance(room_file_version, bool) or not isinstance(room_file_version, int) or room_file_version <= 0:
        raise AdapterError("room_file_version must be a positive integer")
    output = Path(output_dir)
    if output.name != "refine" or output.parent.name != f"v{room_file_version}":
        raise AdapterError("adapter output must end in v<room-file-version>/refine")
    index_path = Path(keyframe_index)
    frames = load_keyframe_index(index_path)
    bundle_root = index_path.parent.parent
    frame_rows = []
    for frame in frames:
        source = _resolve_source(bundle_root, frame.heic_path)
        frame_rows.append(_frame_artifact(frame, _sha256_file(source), source.stat().st_size))

    pairs = build_pair_graph(frames)
    adapter_document = {
        "schemaVersion": ADAPTER_SCHEMA_VERSION,
        "roomFileVersion": room_file_version,
        "targetColmapVersion": COLMAP_TARGET_VERSION,
        "qualificationStatus": ENGINE_QUALIFICATION_STATUS,
        "sourceImageHypothesis": "physical-right-raster-do-not-rotate-again-pending-fixture",
        "coordinateContract": {
            "source": "ARKit camera-to-world metres; +x right, +y up, forward -z",
            "target": "COLMAP cam-from-world; +x right, +y down, forward +z",
            "arkitToRightRotatedColmap": [list(row) for row in ARKIT_TO_RIGHT_ROTATED_COLMAP],
        },
        "primaryPipeline": list(PRIMARY_PIPELINE),
        "fallbackPipeline": list(FALLBACK_PIPELINE),
        "stageEngineBudgetSeconds": REFINE_STAGE_ENGINE_BUDGET_S,
        "leaseCompletionReserveSeconds": LEASE_COMPLETION_RESERVE_S,
        "pairing": {
            "temporalWindow": TEMPORAL_WINDOW,
            "spatialRadiusMeters": SPATIAL_RADIUS_M,
            "spatialMinimumBaselineMeters": SPATIAL_MIN_BASELINE_M,
            "maximumSpatialNeighbors": MAX_SPATIAL_NEIGHBORS,
        },
        "frames": frame_rows,
    }
    adapter_payload = _json_bytes(adapter_document)
    pair_payload = "".join(f"{first} {second}\n" for first, second in pairs).encode("utf-8")
    adapter_path = output / "adapter-v2.json"
    pairs_path = output / "pairs-v2.txt"
    manifest_path = output / "adapter-manifest-v2.json"
    manifest_document = {
        "schemaVersion": ADAPTER_SCHEMA_VERSION,
        "roomFileVersion": room_file_version,
        "engineContract": "colmap-4.0.2-target-known-pose-primary-position-prior-fallback-unvalidated",
        "inputs": [
            {
                "name": index_path.name,
                "sha256": _sha256_file(index_path),
                "sizeBytes": index_path.stat().st_size,
            }
        ],
        "artifacts": [
            {"name": adapter_path.name, "sha256": _sha256_bytes(adapter_payload), "sizeBytes": len(adapter_payload)},
            {"name": pairs_path.name, "sha256": _sha256_bytes(pair_payload), "sizeBytes": len(pair_payload)},
        ],
    }
    manifest_payload = _json_bytes(manifest_document)

    # `adapter-manifest-v2.json` is the commit marker. A crash before it leaves
    # inspectable immutable parts, never a falsely-complete artifact set.
    publish_immutable(adapter_path, adapter_payload)
    publish_immutable(pairs_path, pair_payload)
    publish_immutable(manifest_path, manifest_payload)
    return adapter_path, pairs_path, manifest_path


def run_colmap_subprocess(
    command: Sequence[str],
    *,
    deadline: RefineDeadline,
    log_path: str | os.PathLike[str],
    cwd: str | os.PathLike[str] | None = None,
) -> ColmapCommandResult:
    """Run one argv-only command using what remains of the shared stage budget.

    The future handler creates one :class:`RefineDeadline` from the actual claim
    lease at stage start and passes it to every call. Output streams to a scratch
    log; only its bounded tail is read into memory or attached to an error.
    """

    if not command or any(not isinstance(part, str) or not part for part in command):
        raise AdapterError("COLMAP command must be a non-empty argv sequence")
    timeout_s = deadline.remaining_seconds()
    destination = Path(log_path)
    destination.parent.mkdir(parents=True, exist_ok=True)
    timed_out: subprocess.TimeoutExpired | None = None
    result: subprocess.CompletedProcess[Any] | None = None
    with destination.open("ab") as log_handle:
        try:
            result = subprocess.run(
                list(command),
                cwd=cwd,
                timeout=timeout_s,
                check=False,
                stdout=log_handle,
                stderr=subprocess.STDOUT,
            )
        except subprocess.TimeoutExpired as exc:
            timed_out = exc
        finally:
            log_handle.flush()
            os.fsync(log_handle.fileno())
    with destination.open("rb") as log_handle:
        log_handle.seek(0, os.SEEK_END)
        size = log_handle.tell()
        log_handle.seek(max(0, size - COLMAP_LOG_TAIL_BYTES))
        output_tail = log_handle.read(COLMAP_LOG_TAIL_BYTES).decode("utf-8", errors="replace")
    if timed_out is not None:
        raise AdapterError(
            f"COLMAP subprocess exceeded {timeout_s} seconds: {command[0]}",
            "REFINE_ENGINE_TIMEOUT",
        ) from timed_out
    assert result is not None
    if result.returncode != 0:
        detail = (output_tail or "no output").strip()[-2000:]
        raise AdapterError(
            f"COLMAP subprocess failed ({result.returncode}): {detail}",
            "REFINE_ENGINE_FAILED",
        )
    return ColmapCommandResult(result.returncode, destination, output_tail)


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Build P2 COLMAP adapter-v2 artifacts")
    parser.add_argument("--keyframe-index", required=True, type=Path)
    parser.add_argument("--output-dir", required=True, type=Path)
    parser.add_argument("--room-file-version", required=True, type=int)
    args = parser.parse_args(argv)
    paths = build_adapter_artifacts(
        args.keyframe_index,
        args.output_dir,
        room_file_version=args.room_file_version,
    )
    print(json.dumps({"artifacts": [str(path) for path in paths]}, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
