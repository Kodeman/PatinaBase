"""Disabled, queue-independent orchestration contract for P2 Refine.

The production stage is deliberately not registered.  This module coordinates
an injected engine and artifact assembler using the already-qualified adapter
contracts: one absolute lease-aware deadline, exact COLMAP version parity,
Sim(3) metric-gauge restoration, and comparable refinement evidence.  It does
not import the queue, Storage, business database, worker settings, or stages.
The lower-fidelity position-prior mapper is fail-closed by default and requires
an explicit immutable fallback policy.

Concrete COLMAP execution, process termination, create-only Storage writes, and
the lease-owning stage handler remain separate integrations.  Fakes can exercise
this state machine without a GPU, database, network, or physical raster fixture.
"""

from __future__ import annotations

import hashlib
import math
import os
import re
import stat
from dataclasses import dataclass
from enum import Enum
from pathlib import Path, PurePosixPath
from types import MappingProxyType
from typing import Mapping, NoReturn, Protocol, Sequence, TypeAlias

from .refine_adapter import (
    COLMAP_TARGET_VERSION,
    COLMAP_LOG_TAIL_BYTES,
    AdapterError,
    ColmapPose,
    NormalizedFrame,
    PinholeIntrinsics,
    PositionPrior,
    RefineDeadline,
    RefinementEvidence,
    RefinementEvidenceVerdict,
    Sim3,
    TrajectoryShapeChangeMetrics,
    _json_bytes as _canonical_json_bytes,
    _sha256_bytes as _sha256_bytes,
    align_colmap_pose,
    arkit_c2w_to_colmap_w2c,
    build_present_enqueue_contract,
    canonical_present_manifest_keys,
    colmap_w2c_to_arkit_c2w,
    estimate_sim3,
    evaluate_refinement_evidence,
    qualify_colmap_versions,
    right_rotated_intrinsics,
    trajectory_shape_change_metrics,
)
from .refine_engine import EngineImage

PRIMARY_ENGINE = "colmap-4-known-pose-triangulate-ba"
FALLBACK_ENGINE = "colmap-4-position-prior-mapper"
REFINE_MANIFEST_SCHEMA_VERSION = 1
REFINE_MANIFEST_NAME = "refine-manifest-v1.json"
MAX_INLINE_ARTIFACT_BYTES = 2 * 1024 * 1024
ROOM_SCANS_BINARY_TRANSPORT_TYPE = "application/octet-stream"
MAX_RUNNER_ERROR_BYTES = COLMAP_LOG_TAIL_BYTES
_DEADLINE_CHECK_INTERVAL = 32
_SAFE_ARTIFACT_NAME = re.compile(r"[A-Za-z0-9][A-Za-z0-9._-]*")

_RUNNER_ARTIFACT_NAMES = frozenset(
    {
        "pose-deltas-v1.json",
        "refined-poses-v1.json",
        "refinement-evidence-v1.json",
        "trajectory-shape-v1.json",
    }
)
_REQUIRED_ENGINE_ARTIFACT_NAMES = frozenset(
    {
        "database-v1.db",
        "seed-model-v1.tar",
        "aligned-sparse-model-v1.tar",
    }
)
_ENGINE_ARTIFACT_MEDIA_TYPES: Mapping[str, str] = MappingProxyType(
    {
        "database-v1.db": "application/vnd.sqlite3",
        "seed-model-v1.tar": "application/x-tar",
        "aligned-sparse-model-v1.tar": "application/x-tar",
    }
)


def _bounded_error_text(value: object, *, maximum_bytes: int) -> str:
    """Return deterministic UTF-8 text within the existing 64 KiB log ceiling."""

    try:
        text = value if isinstance(value, str) else str(value)
    except Exception:  # noqa: BLE001 - error rendering must itself stay bounded
        text = f"<{type(value).__name__} message unavailable>"
    encoded = text.encode("utf-8", errors="replace")
    if len(encoded) <= maximum_bytes:
        return encoded.decode("utf-8")
    return encoded[:maximum_bytes].decode("utf-8", errors="ignore")


class EngineFailureKind(str, Enum):
    """Closed failure surface an engine adapter may report to the runner."""

    PRIMARY_UNSUPPORTED = "primary_known_pose_unsupported"
    PRIMARY_CONSTRUCTION_FAILED = "primary_known_pose_construction_failed"
    TIMEOUT = "engine_timeout"
    TRANSIENT_IO = "transient_io"
    DRIVER = "gpu_driver"
    OOM = "gpu_oom"
    VERSION_MISMATCH = "engine_version_mismatch"
    INVALID_INPUT = "invalid_input"
    LOW_OVERLAP = "low_overlap"
    CLEANUP_FAILED = "engine_cleanup_failed"


class RefineFallbackPolicy(str, Enum):
    """Immutable opt-in policy for the lower-fidelity position-prior engine."""

    PRIMARY_ONLY = "primary_only"
    POSITION_PRIOR_ENABLED = "position_prior_enabled"


class RefineFailureCode(str, Enum):
    """Stable final tokens exposed by this runner contract."""

    ENGINE_TIMEOUT = "REFINE_ENGINE_TIMEOUT"
    ENGINE_FAILED = "REFINE_ENGINE_FAILED"
    INPUT_IO = "REFINE_INPUT_IO"
    GPU_DRIVER = "REFINE_GPU_DRIVER"
    GPU_OOM = "REFINE_GPU_OOM"
    ENGINE_VERSION_MISMATCH = "REFINE_ENGINE_VERSION_MISMATCH"
    INPUT_INVALID = "REFINE_INPUT_INVALID"
    LOW_OVERLAP = "REFINE_LOW_OVERLAP"
    SIM3_INVALID = "REFINE_SIM3_INVALID"
    EVIDENCE_INVALID = "REFINE_EVIDENCE_INVALID"
    EVIDENCE_REGRESSION = "REFINE_EVIDENCE_REGRESSION"
    NO_MEASURABLE_IMPROVEMENT = "REFINE_NO_MEASURABLE_IMPROVEMENT"
    ARTIFACT_INVALID = "REFINE_ARTIFACT_INVALID"
    ENGINE_CLEANUP_FAILED = "REFINE_ENGINE_CLEANUP_FAILED"


REFINE_FAILURE_FATALITY: Mapping[RefineFailureCode, bool] = MappingProxyType(
    {
        RefineFailureCode.ENGINE_TIMEOUT: False,
        RefineFailureCode.ENGINE_FAILED: False,
        RefineFailureCode.INPUT_IO: False,
        RefineFailureCode.GPU_DRIVER: False,
        RefineFailureCode.GPU_OOM: False,
        RefineFailureCode.ENGINE_VERSION_MISMATCH: True,
        RefineFailureCode.INPUT_INVALID: True,
        RefineFailureCode.LOW_OVERLAP: True,
        RefineFailureCode.SIM3_INVALID: True,
        RefineFailureCode.EVIDENCE_INVALID: True,
        RefineFailureCode.EVIDENCE_REGRESSION: True,
        RefineFailureCode.NO_MEASURABLE_IMPROVEMENT: True,
        RefineFailureCode.ARTIFACT_INVALID: True,
        RefineFailureCode.ENGINE_CLEANUP_FAILED: True,
    }
)

_ENGINE_FAILURE_CODES: Mapping[EngineFailureKind, RefineFailureCode] = MappingProxyType(
    {
        EngineFailureKind.PRIMARY_UNSUPPORTED: RefineFailureCode.ENGINE_FAILED,
        EngineFailureKind.PRIMARY_CONSTRUCTION_FAILED: RefineFailureCode.ENGINE_FAILED,
        EngineFailureKind.TIMEOUT: RefineFailureCode.ENGINE_TIMEOUT,
        EngineFailureKind.TRANSIENT_IO: RefineFailureCode.INPUT_IO,
        EngineFailureKind.DRIVER: RefineFailureCode.GPU_DRIVER,
        EngineFailureKind.OOM: RefineFailureCode.GPU_OOM,
        EngineFailureKind.VERSION_MISMATCH: RefineFailureCode.ENGINE_VERSION_MISMATCH,
        EngineFailureKind.INVALID_INPUT: RefineFailureCode.INPUT_INVALID,
        EngineFailureKind.LOW_OVERLAP: RefineFailureCode.LOW_OVERLAP,
        EngineFailureKind.CLEANUP_FAILED: RefineFailureCode.ENGINE_CLEANUP_FAILED,
    }
)
_FALLBACK_ELIGIBLE = frozenset(
    {
        EngineFailureKind.PRIMARY_UNSUPPORTED,
        EngineFailureKind.PRIMARY_CONSTRUCTION_FAILED,
    }
)

if set(REFINE_FAILURE_FATALITY) != set(RefineFailureCode):  # pragma: no cover
    raise RuntimeError("Refine failure fatality map is not exhaustive")
if set(_ENGINE_FAILURE_CODES) != set(EngineFailureKind):  # pragma: no cover
    raise RuntimeError("Refine engine failure map is not exhaustive")
if set(_ENGINE_ARTIFACT_MEDIA_TYPES) != set(  # pragma: no cover
    _REQUIRED_ENGINE_ARTIFACT_NAMES
):
    raise RuntimeError("Refine engine artifact media map is not exhaustive")


class EngineAttemptError(RuntimeError):
    """Typed boundary failure from an injected engine implementation."""

    def __init__(self, kind: EngineFailureKind, message: str) -> None:
        if not isinstance(kind, EngineFailureKind):
            raise TypeError("engine attempt failures require an EngineFailureKind")
        super().__init__(
            _bounded_error_text(message, maximum_bytes=MAX_RUNNER_ERROR_BYTES)
        )
        self.kind = kind


class RefineRunError(RuntimeError):
    """Final classified runner failure suitable for a later stage adapter."""

    def __init__(self, code: RefineFailureCode, message: str) -> None:
        if not isinstance(code, RefineFailureCode):
            raise TypeError("refine run failures require a RefineFailureCode")
        prefix = f"{code.value}: "
        detail = _bounded_error_text(
            message,
            maximum_bytes=MAX_RUNNER_ERROR_BYTES - len(prefix.encode("utf-8")),
        )
        super().__init__(f"{prefix}{detail}")
        self.code = code
        self.token = code.value
        self.fatal = REFINE_FAILURE_FATALITY[code]


@dataclass(frozen=True)
class InputArtifact:
    """One already-verified source included in the final input hash ledger."""

    key: str
    sha256: str
    size_bytes: int


@dataclass(frozen=True)
class NamedRefinedPose:
    image_name: str
    cam_from_world: ColmapPose


@dataclass(frozen=True)
class RefineEngineCandidate:
    """Queue/storage-free output of either engine path before metric rebase."""

    cli_version: str
    binding_version: str
    refined_poses: tuple[NamedRefinedPose, ...]
    evidence: RefinementEvidence
    iterations: int
    vram_peak_mb: int


@dataclass(frozen=True)
class RefineRunRequest:
    user_id: str
    scan_id: str
    room_file_id: str
    room_file_version: int
    workspace_root: Path
    frames: tuple["RefineFrameInput", ...]
    inputs: tuple[InputArtifact, ...]


@dataclass(frozen=True)
class RefineFrameInput:
    """One normalized frame plus its already-materialized workspace source."""

    frame: NormalizedFrame
    relative_source_path: str
    source_sha256: str
    source_size_bytes: int


@dataclass(frozen=True)
class PreparedRefineFrame:
    """Runner-time path snapshot for a backend handoff.

    Containment and checksum validation do not make a path TOCTOU-safe.  A
    concrete backend must bind its read to a no-follow descriptor (or an
    equivalently isolated immutable workspace) instead of validating one open
    and consuming another.
    """

    frame: NormalizedFrame
    source_path: Path
    relative_source_path: str
    source_sha256: str
    source_size_bytes: int


@dataclass(frozen=True)
class PreparedRefineRunRequest:
    user_id: str
    scan_id: str
    room_file_id: str
    room_file_version: int
    workspace_root: Path
    frames: tuple[PreparedRefineFrame, ...]
    inputs: tuple[InputArtifact, ...]


@dataclass(frozen=True)
class RefineFileArtifact:
    """Streaming publisher input; binary payload is never retained in memory.

    This is a handoff descriptor, not a durable attestation.  The create-only
    publisher MUST open without following links and hash, size, and publish the
    exact same open descriptor; validating one path open and uploading from a
    second is not sufficient.  Runner-time verification cannot stop a workspace
    file from changing after :meth:`RefineRunner.run` returns.
    """

    name: str
    source_path: Path
    sha256: str
    size_bytes: int
    transport_content_type: str
    semantic_media_type: str


@dataclass(frozen=True)
class RefineInlineArtifact:
    """Small canonical document with a hard in-memory byte ceiling."""

    name: str
    transport_content_type: str
    semantic_media_type: str
    payload: bytes

    def __post_init__(self) -> None:
        if not isinstance(self.payload, bytes) or not self.payload:
            raise ValueError("inline artifact payload must be non-empty bytes")
        if len(self.payload) > MAX_INLINE_ARTIFACT_BYTES:
            raise ValueError(
                f"inline artifact exceeds {MAX_INLINE_ARTIFACT_BYTES} bytes"
            )

    @property
    def sha256(self) -> str:
        return _sha256_bytes(self.payload)

    @property
    def size_bytes(self) -> int:
        return len(self.payload)


RefineArtifact: TypeAlias = RefineFileArtifact | RefineInlineArtifact


@dataclass(frozen=True)
class RefineRunResult:
    """Validated unpublished output.

    Publication remains a separate lease-owned operation.  It must revalidate
    every :class:`RefineFileArtifact` and publish the manifest last through the
    create-only publisher; this result never authorizes an overwrite.
    """

    selected_engine: str
    fallback_policy: RefineFallbackPolicy
    fallback_trigger: EngineFailureKind | None
    alignment: Sim3
    evidence_verdict: RefinementEvidenceVerdict
    trajectory_shape_change: TrajectoryShapeChangeMetrics
    manifest_key: str
    manifest_sha256: str
    files: tuple[RefineArtifact, ...]

    @property
    def manifest(self) -> RefineInlineArtifact:
        value = self.files[-1]
        if not isinstance(value, RefineInlineArtifact):  # pragma: no cover
            raise RuntimeError("Refine result manifest is not inline JSON")
        return value


class RefineExecutionBackend(Protocol):
    """High-level engine seam; concrete command plumbing lands separately."""

    def run_primary(
        self,
        request: PreparedRefineRunRequest,
        *,
        deadline: RefineDeadline,
    ) -> RefineEngineCandidate: ...

    def run_fallback(
        self,
        request: PreparedRefineRunRequest,
        *,
        deadline: RefineDeadline,
    ) -> RefineEngineCandidate: ...


class RefineArtifactBuilder(Protocol):
    """Backend-specific deterministic model/archive materialization seam."""

    def build_engine_artifacts(
        self,
        *,
        request: PreparedRefineRunRequest,
        candidate: RefineEngineCandidate,
        selected_engine: str,
        alignment: Sim3,
        aligned_poses: Sequence[NamedRefinedPose],
        deadline: RefineDeadline,
    ) -> Sequence[RefineFileArtifact]: ...


def _fail(code: RefineFailureCode, message: str) -> NoReturn:
    raise RefineRunError(code, message)


def _deadline_checkpoint(deadline: RefineDeadline, index: int) -> None:
    if index % _DEADLINE_CHECK_INTERVAL == 0:
        _require_engine_budget(deadline)


def _snapshot_sequence(
    value: object,
    *,
    label: str,
    failure_code: RefineFailureCode,
    deadline: RefineDeadline,
) -> tuple[object, ...]:
    """Snapshot replayable contracts and reject iterators/one-shot generators."""

    if not isinstance(value, (tuple, list)):
        _fail(failure_code, f"{label} must be a tuple or list")
    snapshot: list[object] = []
    for index, item in enumerate(value):
        _deadline_checkpoint(deadline, index)
        snapshot.append(item)
    return tuple(snapshot)


def _is_finite_number(value: object) -> bool:
    return (
        not isinstance(value, bool)
        and isinstance(value, (int, float))
        and math.isfinite(float(value))
    )


def _is_finite_vector3(value: object) -> bool:
    return (
        isinstance(value, tuple)
        and len(value) == 3
        and all(_is_finite_number(component) for component in value)
    )


def _is_finite_matrix3(value: object) -> bool:
    return (
        isinstance(value, tuple)
        and len(value) == 3
        and all(
            isinstance(row, tuple)
            and len(row) == 3
            and all(_is_finite_number(component) for component in row)
            for row in value
        )
    )


def _close(left: object, right: object, *, tolerance: float = 1e-6) -> bool:
    return (
        _is_finite_number(left)
        and _is_finite_number(right)
        and math.isclose(
            float(left),
            float(right),
            rel_tol=tolerance,
            abs_tol=tolerance,
        )
    )


def _validate_intrinsics(value: object, label: str) -> PinholeIntrinsics:
    if not isinstance(value, PinholeIntrinsics):
        _fail(RefineFailureCode.INPUT_INVALID, f"{label} has the wrong contract type")
    for field_name in ("fx", "fy"):
        field_value = getattr(value, field_name)
        if not _is_finite_number(field_value) or float(field_value) <= 0:
            _fail(
                RefineFailureCode.INPUT_INVALID,
                f"{label}.{field_name} must be positive and finite",
            )
    for field_name in ("cx", "cy"):
        if not _is_finite_number(getattr(value, field_name)):
            _fail(
                RefineFailureCode.INPUT_INVALID,
                f"{label}.{field_name} must be finite",
            )
    for field_name in ("image_width", "image_height"):
        field_value = getattr(value, field_name)
        if (
            isinstance(field_value, bool)
            or not isinstance(field_value, int)
            or field_value <= 0
        ):
            _fail(
                RefineFailureCode.INPUT_INVALID,
                f"{label}.{field_name} must be a positive integer",
            )
    return value


def _pose_matches(left: ColmapPose, right: ColmapPose) -> bool:
    if not (
        _is_finite_matrix3(left.rotation)
        and _is_finite_matrix3(right.rotation)
        and _is_finite_vector3(left.translation)
        and _is_finite_vector3(right.translation)
    ):
        return False
    if any(
        not _close(left.rotation[row][column], right.rotation[row][column])
        for row in range(3)
        for column in range(3)
    ) or any(
        not _close(left.translation[index], right.translation[index])
        for index in range(3)
    ):
        return False
    if not (
        isinstance(left.qvec, tuple)
        and isinstance(right.qvec, tuple)
        and len(left.qvec) == len(right.qvec) == 4
        and all(_is_finite_number(value) for value in (*left.qvec, *right.qvec))
    ):
        return False
    left_norm = math.sqrt(sum(float(value) ** 2 for value in left.qvec))
    right_norm = math.sqrt(sum(float(value) ** 2 for value in right.qvec))
    if left_norm <= 1e-12 or right_norm <= 1e-12:
        return False
    agreement = abs(
        sum(
            float(left.qvec[index])
            * float(right.qvec[index])
            / (left_norm * right_norm)
            for index in range(4)
        )
    )
    return math.isclose(agreement, 1.0, rel_tol=1e-6, abs_tol=1e-6)


def _validate_frame_consistency(frame: NormalizedFrame) -> None:
    """Reject manually-constructed frames that disagree with normalized inputs."""

    if not _is_finite_number(frame.frame_timestamp_s):
        _fail(RefineFailureCode.INPUT_INVALID, "frame timestamp must be finite")
    transform = frame.arkit_camera_to_world
    if not (
        isinstance(transform, tuple)
        and len(transform) == 16
        and all(_is_finite_number(value) for value in transform)
    ):
        _fail(
            RefineFailureCode.INPUT_INVALID,
            "ARKit camera transform must contain sixteen finite numbers",
        )

    native = _validate_intrinsics(frame.native_intrinsics, "native intrinsics")
    encoded = _validate_intrinsics(frame.intrinsics, "encoded intrinsics")
    try:
        expected_intrinsics = right_rotated_intrinsics(
            native,
            encoded_width=encoded.image_width,
            encoded_height=encoded.image_height,
        )
    except Exception as exc:  # noqa: BLE001 - normalize the frame boundary
        _fail(RefineFailureCode.INPUT_INVALID, f"intrinsics are inconsistent: {exc}")
    for field_name in ("fx", "fy", "cx", "cy"):
        if not _close(
            getattr(encoded, field_name),
            getattr(expected_intrinsics, field_name),
        ):
            _fail(
                RefineFailureCode.INPUT_INVALID,
                "encoded intrinsics disagree with the right-rotated native camera",
            )
    if (
        encoded.image_width != expected_intrinsics.image_width
        or encoded.image_height != expected_intrinsics.image_height
    ):
        _fail(
            RefineFailureCode.INPUT_INVALID,
            "encoded dimensions disagree with the right-rotated native camera",
        )

    if not isinstance(frame.colmap_pose, ColmapPose):
        _fail(
            RefineFailureCode.INPUT_INVALID,
            "raw COLMAP pose has the wrong contract type",
        )
    try:
        expected_pose = arkit_c2w_to_colmap_w2c(transform)
        EngineImage(
            name=frame.image_name,
            intrinsics=encoded,
            cam_from_world=frame.colmap_pose,
        )
    except Exception as exc:  # noqa: BLE001 - normalize the frame boundary
        _fail(RefineFailureCode.INPUT_INVALID, f"raw camera pose is malformed: {exc}")
    if not _pose_matches(frame.colmap_pose, expected_pose):
        _fail(
            RefineFailureCode.INPUT_INVALID,
            "raw COLMAP pose disagrees with the ARKit transform",
        )

    transform_center = (transform[3], transform[7], transform[11])
    if not _is_finite_vector3(frame.camera_center_m) or any(
        not _close(frame.camera_center_m[index], transform_center[index])
        for index in range(3)
    ):
        _fail(
            RefineFailureCode.INPUT_INVALID,
            "raw camera centre disagrees with the ARKit transform",
        )
    if not isinstance(frame.pose_prior, PositionPrior):
        _fail(
            RefineFailureCode.INPUT_INVALID,
            "position prior has the wrong contract type",
        )
    if not _is_finite_vector3(frame.pose_prior.position_m) or any(
        not _close(frame.pose_prior.position_m[index], transform_center[index])
        for index in range(3)
    ):
        _fail(
            RefineFailureCode.INPUT_INVALID,
            "position prior disagrees with the raw camera centre",
        )
    covariance = frame.pose_prior.covariance_m2
    if not _is_finite_matrix3(covariance):
        _fail(
            RefineFailureCode.INPUT_INVALID,
            "position-prior covariance must be a finite 3x3 matrix",
        )
    covariance_values = tuple(
        tuple(float(covariance[row][column]) for column in range(3)) for row in range(3)
    )
    leading_minor_2 = (
        covariance_values[0][0] * covariance_values[1][1]
        - covariance_values[0][1] * covariance_values[1][0]
    )
    determinant = (
        covariance_values[0][0]
        * (
            covariance_values[1][1] * covariance_values[2][2]
            - covariance_values[1][2] * covariance_values[2][1]
        )
        - covariance_values[0][1]
        * (
            covariance_values[1][0] * covariance_values[2][2]
            - covariance_values[1][2] * covariance_values[2][0]
        )
        + covariance_values[0][2]
        * (
            covariance_values[1][0] * covariance_values[2][1]
            - covariance_values[1][1] * covariance_values[2][0]
        )
    )
    if (
        covariance_values[0][0] <= 0
        or leading_minor_2 <= 0
        or determinant <= 0
        or any(float(covariance[index][index]) <= 0 for index in range(3))
        or any(
            not _close(covariance[row][column], covariance[column][row])
            for row in range(3)
            for column in range(3)
        )
    ):
        _fail(
            RefineFailureCode.INPUT_INVALID,
            "position-prior covariance must be symmetric positive-definite",
        )


def _safe_relative_path(value: object, label: str) -> PurePosixPath:
    if (
        not isinstance(value, str)
        or not value
        or any(character in value for character in ("\\", "?", "#", "%"))
    ):
        _fail(RefineFailureCode.INPUT_INVALID, f"{label} must be a safe relative path")
    path = PurePosixPath(value)
    if (
        path.is_absolute()
        or not path.parts
        or any(part in ("", ".", "..") for part in path.parts)
        or str(path) != value
    ):
        _fail(RefineFailureCode.INPUT_INVALID, f"{label} must be a safe relative path")
    return path


def _stable_file_sha256(
    path: Path,
    *,
    deadline: RefineDeadline,
) -> tuple[str, os.stat_result]:
    """Stream one regular file while proving its identity stayed unchanged."""

    _require_engine_budget(deadline)
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        before = os.fstat(handle.fileno())
        if not stat.S_ISREG(before.st_mode):
            raise ValueError("source is not a regular file")
        chunk_index = 0
        while True:
            _deadline_checkpoint(deadline, chunk_index)
            chunk = handle.read(1024 * 1024)
            if not chunk:
                break
            digest.update(chunk)
            chunk_index += 1
        after = os.fstat(handle.fileno())
    _require_engine_budget(deadline)
    stable_fields_before = (
        before.st_dev,
        before.st_ino,
        before.st_mode,
        before.st_size,
        before.st_mtime_ns,
        before.st_ctime_ns,
    )
    stable_fields_after = (
        after.st_dev,
        after.st_ino,
        after.st_mode,
        after.st_size,
        after.st_mtime_ns,
        after.st_ctime_ns,
    )
    if stable_fields_before != stable_fields_after:
        raise ValueError("source changed while it was hashed")
    return digest.hexdigest(), after


def _verified_frame_source(
    *,
    workspace_root: Path,
    frame_input: RefineFrameInput,
    deadline: RefineDeadline,
) -> Path:
    relative = _safe_relative_path(
        frame_input.relative_source_path,
        "frame source path",
    )
    if relative.name != frame_input.frame.image_name:
        _fail(
            RefineFailureCode.INPUT_INVALID,
            "frame source basename must equal the canonical image name",
        )
    candidate = workspace_root.joinpath(*relative.parts)
    try:
        resolved = candidate.resolve(strict=True)
        resolved.relative_to(workspace_root)
        file_stat = resolved.stat()
    except (OSError, ValueError) as exc:
        _fail(RefineFailureCode.INPUT_INVALID, f"frame source is not contained: {exc}")
    if resolved != candidate or not stat.S_ISREG(file_stat.st_mode):
        _fail(
            RefineFailureCode.INPUT_INVALID,
            "frame source must be a contained regular file without symlinks",
        )
    if (
        isinstance(frame_input.source_size_bytes, bool)
        or not isinstance(frame_input.source_size_bytes, int)
        or frame_input.source_size_bytes <= 0
        or file_stat.st_size != frame_input.source_size_bytes
    ):
        _fail(
            RefineFailureCode.INPUT_INVALID,
            "frame source size does not match its ledger",
        )
    if (
        not isinstance(frame_input.source_sha256, str)
        or re.fullmatch(r"[0-9a-f]{64}", frame_input.source_sha256) is None
    ):
        _fail(
            RefineFailureCode.INPUT_INVALID,
            "frame source sha256 must be lowercase hexadecimal",
        )
    try:
        actual_sha256, stable_stat = _stable_file_sha256(
            resolved,
            deadline=deadline,
        )
    except OSError as exc:
        _fail(RefineFailureCode.INPUT_IO, str(exc))
    except ValueError as exc:
        _fail(RefineFailureCode.INPUT_INVALID, str(exc))
    if stable_stat.st_size != frame_input.source_size_bytes:
        _fail(RefineFailureCode.INPUT_INVALID, "frame source changed before hashing")
    if actual_sha256 != frame_input.source_sha256:
        _fail(
            RefineFailureCode.INPUT_INVALID,
            "frame source sha256 does not match its ledger",
        )
    return resolved


def _validate_request(
    request: RefineRunRequest,
    *,
    deadline: RefineDeadline,
) -> tuple[str, PreparedRefineRunRequest]:
    _require_engine_budget(deadline)
    if not isinstance(request, RefineRunRequest):
        _fail(RefineFailureCode.INPUT_INVALID, "request has the wrong contract type")
    try:
        # Reuse the fork/join identifier contract so a future stage cannot
        # produce a manifest identity that Present would reject.
        build_present_enqueue_contract(
            scan_id=request.scan_id,
            room_file_id=request.room_file_id,
            room_file_version=request.room_file_version,
            user_id=request.user_id,
            refine_task_id="disabled-refine-runner-contract",
        )
        manifest_key = canonical_present_manifest_keys(
            request.user_id,
            request.scan_id,
            request.room_file_version,
        )["refine"]
    except RefineRunError:
        raise
    except Exception as exc:  # noqa: BLE001 - normalize the request boundary
        _fail(RefineFailureCode.INPUT_INVALID, str(exc))

    if (
        not isinstance(request.workspace_root, Path)
        or not request.workspace_root.is_absolute()
    ):
        _fail(
            RefineFailureCode.INPUT_INVALID, "workspace root must be an absolute Path"
        )
    try:
        if request.workspace_root.is_symlink():
            _fail(
                RefineFailureCode.INPUT_INVALID,
                "workspace root must not be a symlink",
            )
        workspace_root = request.workspace_root.resolve(strict=True)
        root_stat = workspace_root.stat()
    except OSError as exc:
        _fail(RefineFailureCode.INPUT_INVALID, f"workspace root is unavailable: {exc}")
    if not stat.S_ISDIR(root_stat.st_mode):
        _fail(RefineFailureCode.INPUT_INVALID, "workspace root must be a directory")

    frame_values = _snapshot_sequence(
        request.frames,
        label="request frames",
        failure_code=RefineFailureCode.INPUT_INVALID,
        deadline=deadline,
    )
    if len(frame_values) < 3:
        _fail(RefineFailureCode.LOW_OVERLAP, "refine needs at least three frames")
    names: set[str] = set()
    ordinals: set[int] = set()
    prepared_frames: list[PreparedRefineFrame] = []
    for frame_index, frame_input in enumerate(frame_values):
        _deadline_checkpoint(deadline, frame_index)
        if not isinstance(frame_input, RefineFrameInput):
            _fail(
                RefineFailureCode.INPUT_INVALID,
                "frame input has the wrong contract type",
            )
        frame = frame_input.frame
        if not isinstance(frame, NormalizedFrame):
            _fail(RefineFailureCode.INPUT_INVALID, "frame has the wrong contract type")
        _validate_frame_consistency(frame)
        name = frame.image_name
        if (
            not isinstance(name, str)
            or not name
            or PurePosixPath(name).name != name
            or any(character.isspace() for character in name)
            or name in names
        ):
            _fail(
                RefineFailureCode.INPUT_INVALID,
                "frame image names must be unique safe basenames",
            )
        if (
            isinstance(frame.ordinal, bool)
            or not isinstance(frame.ordinal, int)
            or frame.ordinal < 0
            or frame.ordinal in ordinals
        ):
            _fail(
                RefineFailureCode.INPUT_INVALID,
                "frame ordinals must be unique non-negative integers",
            )
        if not _is_finite_vector3(frame.camera_center_m):
            _fail(
                RefineFailureCode.INPUT_INVALID,
                "raw camera centres must be finite 3-vectors",
            )
        heic_path = _safe_relative_path(frame.heic_path, "bundle frame path")
        if heic_path.name != name:
            _fail(
                RefineFailureCode.INPUT_INVALID,
                "bundle frame basename must equal the canonical image name",
            )
        source_path = _verified_frame_source(
            workspace_root=workspace_root,
            frame_input=frame_input,
            deadline=deadline,
        )
        prepared_frames.append(
            PreparedRefineFrame(
                frame=frame,
                source_path=source_path,
                relative_source_path=frame_input.relative_source_path,
                source_sha256=frame_input.source_sha256,
                source_size_bytes=frame_input.source_size_bytes,
            )
        )
        names.add(name)
        ordinals.add(frame.ordinal)

    input_values = _snapshot_sequence(
        request.inputs,
        label="request inputs",
        failure_code=RefineFailureCode.INPUT_INVALID,
        deadline=deadline,
    )
    if not input_values:
        _fail(RefineFailureCode.INPUT_INVALID, "refine needs at least one hashed input")
    input_keys: set[str] = set()
    validated_inputs: list[InputArtifact] = []
    for input_index, source in enumerate(input_values):
        _deadline_checkpoint(deadline, input_index)
        if not isinstance(source, InputArtifact):
            _fail(
                RefineFailureCode.INPUT_INVALID,
                "input artifact has the wrong contract type",
            )
        key = source.key
        _safe_relative_path(key, "input artifact key")
        if key in input_keys:
            _fail(
                RefineFailureCode.INPUT_INVALID,
                "input artifact keys must be unique safe relative paths",
            )
        if (
            not isinstance(source.sha256, str)
            or re.fullmatch(r"[0-9a-f]{64}", source.sha256) is None
        ):
            _fail(
                RefineFailureCode.INPUT_INVALID,
                "input artifact sha256 must be lowercase hexadecimal",
            )
        if (
            isinstance(source.size_bytes, bool)
            or not isinstance(source.size_bytes, int)
            or source.size_bytes <= 0
        ):
            _fail(
                RefineFailureCode.INPUT_INVALID,
                "input artifact sizes must be positive integers",
            )
        input_keys.add(key)
        validated_inputs.append(source)
    _require_engine_budget(deadline)
    prepared = PreparedRefineRunRequest(
        user_id=request.user_id,
        scan_id=request.scan_id,
        room_file_id=request.room_file_id,
        room_file_version=request.room_file_version,
        workspace_root=workspace_root,
        frames=tuple(
            sorted(
                prepared_frames,
                key=lambda value: (
                    value.frame.frame_timestamp_s,
                    value.frame.image_name,
                ),
            )
        ),
        inputs=tuple(sorted(validated_inputs, key=lambda source: source.key)),
    )
    return manifest_key, prepared


def _require_engine_budget(deadline: RefineDeadline) -> None:
    if not isinstance(deadline, RefineDeadline):
        _fail(
            RefineFailureCode.ENGINE_TIMEOUT,
            "engine deadline has the wrong contract type",
        )
    try:
        remaining = deadline.remaining_seconds()
    except Exception as exc:  # noqa: BLE001 - normalize a dependency boundary
        _fail(RefineFailureCode.ENGINE_TIMEOUT, f"engine deadline is exhausted: {exc}")
    if (
        isinstance(remaining, bool)
        or not isinstance(remaining, (int, float))
        or not math.isfinite(float(remaining))
        or float(remaining) <= 0
    ):
        _fail(RefineFailureCode.ENGINE_TIMEOUT, "engine deadline is exhausted")


def _engine_failure(error: EngineAttemptError) -> RefineRunError:
    code = _ENGINE_FAILURE_CODES[error.kind]
    return RefineRunError(code, str(error))


def _snapshot_candidate(
    candidate: object,
    *,
    deadline: RefineDeadline,
) -> RefineEngineCandidate:
    if not isinstance(candidate, RefineEngineCandidate):
        _fail(
            RefineFailureCode.ENGINE_FAILED,
            "engine returned the wrong result contract",
        )
    refined_poses = _snapshot_sequence(
        candidate.refined_poses,
        label="candidate refined poses",
        failure_code=RefineFailureCode.SIM3_INVALID,
        deadline=deadline,
    )
    return RefineEngineCandidate(
        cli_version=candidate.cli_version,
        binding_version=candidate.binding_version,
        refined_poses=refined_poses,  # type: ignore[arg-type]
        evidence=candidate.evidence,
        iterations=candidate.iterations,
        vram_peak_mb=candidate.vram_peak_mb,
    )


def _call_engine(
    callback,
    request: PreparedRefineRunRequest,
    deadline: RefineDeadline,
) -> RefineEngineCandidate:
    _require_engine_budget(deadline)
    if not callable(callback):
        _fail(RefineFailureCode.ENGINE_FAILED, "engine callback is not callable")
    try:
        candidate = callback(request, deadline=deadline)
    except EngineAttemptError:
        raise
    except Exception as exc:  # noqa: BLE001 - normalize an injected engine
        raise RefineRunError(
            RefineFailureCode.ENGINE_FAILED,
            f"engine adapter raised {type(exc).__name__}",
        ) from exc
    _require_engine_budget(deadline)
    return _snapshot_candidate(candidate, deadline=deadline)


def _backend_callback(backend: object, name: str):
    try:
        callback = getattr(backend, name)
    except Exception as exc:  # noqa: BLE001 - normalize an injected backend
        raise RefineRunError(
            RefineFailureCode.ENGINE_FAILED,
            f"engine backend lookup raised {type(exc).__name__}",
        ) from exc
    if not callable(callback):
        _fail(RefineFailureCode.ENGINE_FAILED, f"engine backend {name} is not callable")
    return callback


def _select_candidate(
    backend: RefineExecutionBackend,
    request: PreparedRefineRunRequest,
    deadline: RefineDeadline,
    fallback_policy: RefineFallbackPolicy,
) -> tuple[str, EngineFailureKind | None, RefineEngineCandidate]:
    _require_engine_budget(deadline)
    try:
        candidate = _call_engine(
            _backend_callback(backend, "run_primary"),
            request,
            deadline,
        )
    except EngineAttemptError as primary_error:
        _require_engine_budget(deadline)
        if primary_error.kind not in _FALLBACK_ELIGIBLE:
            raise _engine_failure(primary_error) from primary_error
        if fallback_policy is RefineFallbackPolicy.PRIMARY_ONLY:
            raise _engine_failure(primary_error) from primary_error
        fallback_trigger = primary_error.kind
    except RefineRunError:
        _require_engine_budget(deadline)
        raise
    else:
        _require_engine_budget(deadline)
        return PRIMARY_ENGINE, None, candidate

    try:
        candidate = _call_engine(
            _backend_callback(backend, "run_fallback"),
            request,
            deadline,
        )
    except EngineAttemptError as fallback_error:
        _require_engine_budget(deadline)
        raise _engine_failure(fallback_error) from fallback_error
    except RefineRunError:
        _require_engine_budget(deadline)
        raise
    _require_engine_budget(deadline)
    return FALLBACK_ENGINE, fallback_trigger, candidate


def _validate_candidate_versions(
    candidate: RefineEngineCandidate,
    *,
    deadline: RefineDeadline,
) -> None:
    _require_engine_budget(deadline)
    if (
        not isinstance(candidate.cli_version, str)
        or not candidate.cli_version
        or not isinstance(candidate.binding_version, str)
        or not candidate.binding_version
    ):
        _fail(
            RefineFailureCode.ENGINE_VERSION_MISMATCH,
            "engine versions must be non-empty strings",
        )
    try:
        qualify_colmap_versions(
            f"COLMAP {candidate.cli_version}",
            candidate.binding_version,
        )
    except Exception as exc:  # noqa: BLE001 - malformed versions also fail closed
        _fail(RefineFailureCode.ENGINE_VERSION_MISMATCH, str(exc))
    for label, value in (
        ("iterations", candidate.iterations),
        ("vram_peak_mb", candidate.vram_peak_mb),
    ):
        if isinstance(value, bool) or not isinstance(value, int) or value < 0:
            _fail(
                RefineFailureCode.EVIDENCE_INVALID,
                f"{label} must be a non-negative integer",
            )
    _require_engine_budget(deadline)


def _camera_center(pose: ColmapPose) -> tuple[float, float, float]:
    transform = colmap_w2c_to_arkit_c2w(pose)
    center = (transform[3], transform[7], transform[11])
    if not _is_finite_vector3(center):
        _fail(RefineFailureCode.SIM3_INVALID, "refined camera centre is not finite")
    return center


def _validate_and_align(
    request: PreparedRefineRunRequest,
    candidate: RefineEngineCandidate,
    *,
    deadline: RefineDeadline,
) -> tuple[
    Sim3,
    tuple[NamedRefinedPose, ...],
    TrajectoryShapeChangeMetrics,
]:
    _require_engine_budget(deadline)
    expected = {value.frame.image_name: value.frame for value in request.frames}
    refined: dict[str, ColmapPose] = {}
    for row_index, row in enumerate(candidate.refined_poses):
        _deadline_checkpoint(deadline, row_index)
        if not isinstance(row, NamedRefinedPose):
            _fail(
                RefineFailureCode.SIM3_INVALID,
                "refined pose row has the wrong contract type",
            )
        name = row.image_name
        if (
            not isinstance(name, str)
            or not name
            or PurePosixPath(name).name != name
            or any(character.isspace() for character in name)
        ):
            _fail(
                RefineFailureCode.SIM3_INVALID,
                "refined pose image name must be a safe basename",
            )
        if name in refined:
            _fail(
                RefineFailureCode.SIM3_INVALID,
                "refined poses must have unique named rows",
            )
        frame = expected.get(name)
        if frame is None:
            _fail(
                RefineFailureCode.SIM3_INVALID, "refined poses contain an unknown image"
            )
        try:
            EngineImage(
                name=name,
                intrinsics=frame.intrinsics,
                cam_from_world=row.cam_from_world,
            )
            round_trip = arkit_c2w_to_colmap_w2c(
                colmap_w2c_to_arkit_c2w(row.cam_from_world)
            )
            qvec = row.cam_from_world.qvec
            if (
                not isinstance(qvec, tuple)
                or len(qvec) != 4
                or any(
                    isinstance(value, bool)
                    or not isinstance(value, (int, float))
                    or not math.isfinite(float(value))
                    for value in qvec
                )
            ):
                raise AdapterError("refined pose quaternion must be finite")
            qnorm = math.sqrt(sum(float(value) * float(value) for value in qvec))
            if qnorm <= 1e-12:
                raise AdapterError("refined pose quaternion must be non-zero")
            normalized = tuple(float(value) / qnorm for value in qvec)
            agreement = abs(
                sum(normalized[index] * round_trip.qvec[index] for index in range(4))
            )
            if abs(agreement - 1.0) > 5e-3:
                raise AdapterError(
                    "refined pose quaternion disagrees with its rotation"
                )
        except Exception as exc:  # noqa: BLE001 - candidate boundary
            _fail(RefineFailureCode.SIM3_INVALID, f"refined pose is malformed: {exc}")
        refined[name] = row.cam_from_world
    if set(refined) != set(expected):
        _fail(
            RefineFailureCode.SIM3_INVALID,
            "refined pose set must equal the input frame set",
        )

    ordered_names = sorted(expected)
    source_centres: list[tuple[float, float, float]] = []
    target_centres: list[tuple[float, float, float]] = []
    for name_index, name in enumerate(ordered_names):
        _deadline_checkpoint(deadline, name_index)
        source_centres.append(_camera_center(refined[name]))
        target_centres.append(expected[name].camera_center_m)
    try:
        _require_engine_budget(deadline)
        alignment = estimate_sim3(source_centres, target_centres)
        _require_engine_budget(deadline)
        shape = trajectory_shape_change_metrics(
            source_centres,
            target_centres,
            alignment,
        )
        aligned_values: list[NamedRefinedPose] = []
        for name_index, name in enumerate(ordered_names):
            _deadline_checkpoint(deadline, name_index)
            aligned_values.append(
                NamedRefinedPose(name, align_colmap_pose(refined[name], alignment))
            )
        aligned = tuple(aligned_values)
    except Exception as exc:  # noqa: BLE001 - normalize all invalid geometry
        if isinstance(exc, RefineRunError):
            raise
        _fail(RefineFailureCode.SIM3_INVALID, str(exc))
    _require_engine_budget(deadline)
    return alignment, aligned, shape


def _validate_evidence(
    request: PreparedRefineRunRequest,
    candidate: RefineEngineCandidate,
    *,
    deadline: RefineDeadline,
) -> RefinementEvidenceVerdict:
    _require_engine_budget(deadline)
    evidence = candidate.evidence
    if not isinstance(evidence, RefinementEvidence):
        _fail(
            RefineFailureCode.EVIDENCE_INVALID,
            "engine evidence has the wrong contract type",
        )
    counts = (
        evidence.input_images,
        evidence.registered_images_before,
        evidence.registered_images_after,
        evidence.common_observations,
        evidence.verified_loop_edges,
    )
    if any(
        isinstance(value, bool) or not isinstance(value, int) or value < 0
        for value in counts
    ):
        _fail(
            RefineFailureCode.EVIDENCE_INVALID,
            "evidence counts must be non-negative integers, never booleans",
        )
    for label, value in (
        ("common observation digest", evidence.common_observation_set_sha256),
        ("verified loop digest", evidence.verified_loop_set_sha256),
    ):
        if not isinstance(value, str) or re.fullmatch(r"[0-9a-f]{64}", value) is None:
            _fail(
                RefineFailureCode.EVIDENCE_INVALID,
                f"{label} must be a lowercase sha256",
            )
    metrics = (
        evidence.reprojection_rmse_px_before,
        evidence.reprojection_rmse_px_after,
        evidence.loop_rotation_rmse_deg_before,
        evidence.loop_rotation_rmse_deg_after,
        evidence.loop_translation_direction_rmse_deg_before,
        evidence.loop_translation_direction_rmse_deg_after,
    )
    if any(not _is_finite_number(value) or float(value) < 0 for value in metrics):
        _fail(
            RefineFailureCode.EVIDENCE_INVALID,
            "evidence metrics must be finite non-negative numbers, never booleans",
        )
    external_errors = (
        evidence.external_error_m_before,
        evidence.external_error_m_after,
    )
    if (external_errors[0] is None) != (external_errors[1] is None):
        _fail(
            RefineFailureCode.EVIDENCE_INVALID,
            "external evidence needs both before and after errors",
        )
    if any(
        value is not None and (not _is_finite_number(value) or float(value) < 0)
        for value in external_errors
    ):
        _fail(
            RefineFailureCode.EVIDENCE_INVALID,
            "external evidence errors must be finite non-negative numbers",
        )
    external_metadata = (
        evidence.external_evidence_kind,
        evidence.external_evidence_ref,
    )
    if external_errors[0] is None:
        if any(value is not None for value in external_metadata):
            _fail(
                RefineFailureCode.EVIDENCE_INVALID,
                "external metadata requires before and after errors",
            )
    elif any(
        not isinstance(value, str) or not value.strip() for value in external_metadata
    ):
        _fail(
            RefineFailureCode.EVIDENCE_INVALID,
            "external errors require non-empty kind and provenance",
        )
    if evidence.input_images != len(request.frames):
        _fail(
            RefineFailureCode.EVIDENCE_INVALID,
            "evidence input count disagrees with the request",
        )
    if evidence.registered_images_after != len(candidate.refined_poses):
        _fail(
            RefineFailureCode.EVIDENCE_INVALID,
            "evidence registration count disagrees with refined poses",
        )
    try:
        verdict = evaluate_refinement_evidence(evidence)
    except Exception as exc:  # noqa: BLE001 - malformed evidence is permanent
        _fail(RefineFailureCode.EVIDENCE_INVALID, str(exc))
    _require_engine_budget(deadline)
    if verdict.refinement_evidenced:
        return verdict
    verdict_codes = {
        "REFINE_LOW_OVERLAP": RefineFailureCode.LOW_OVERLAP,
        "REFINE_EVIDENCE_REGRESSION": RefineFailureCode.EVIDENCE_REGRESSION,
        "REFINE_NO_MEASURABLE_IMPROVEMENT": RefineFailureCode.NO_MEASURABLE_IMPROVEMENT,
    }
    code = verdict_codes.get(verdict.code or "")
    if code is None:
        _fail(
            RefineFailureCode.EVIDENCE_INVALID,
            "evidence verdict returned an unknown failure code",
        )
    _fail(code, verdict.reason)


def _sim3_document(alignment: Sim3) -> dict[str, object]:
    return {
        "scale": alignment.scale,
        "rotation": [list(row) for row in alignment.rotation],
        "translationMeters": list(alignment.translation),
    }


def _shape_document(shape: TrajectoryShapeChangeMetrics) -> dict[str, object]:
    return {
        "shapeChangeRmseMeters": shape.shape_change_rmse_m,
        "rawKeyframeRmsRadiusMeters": shape.raw_keyframe_rms_radius_m,
        "trajectoryShapeChangePercent": shape.trajectory_shape_change_pct,
        "meanKeyframeDisplacementPercent": shape.mean_keyframe_displacement_pct,
        "maxKeyframeDisplacementMeters": shape.max_keyframe_displacement_m,
        "certificationRole": shape.certification_role,
    }


def _evidence_document(
    evidence: RefinementEvidence,
    verdict: RefinementEvidenceVerdict,
) -> dict[str, object]:
    return {
        "schemaVersion": 1,
        "inputImages": evidence.input_images,
        "registeredImagesBefore": evidence.registered_images_before,
        "registeredImagesAfter": evidence.registered_images_after,
        "registrationCoverageBefore": verdict.registration_coverage_before,
        "registrationCoverageAfter": verdict.registration_coverage_after,
        "commonObservations": evidence.common_observations,
        "commonObservationSetSha256": evidence.common_observation_set_sha256,
        "reprojectionRmsePxBefore": evidence.reprojection_rmse_px_before,
        "reprojectionRmsePxAfter": evidence.reprojection_rmse_px_after,
        "verifiedLoopEdges": evidence.verified_loop_edges,
        "verifiedLoopSetSha256": evidence.verified_loop_set_sha256,
        "loopRotationRmseDegBefore": evidence.loop_rotation_rmse_deg_before,
        "loopRotationRmseDegAfter": evidence.loop_rotation_rmse_deg_after,
        "loopTranslationDirectionRmseDegBefore": (
            evidence.loop_translation_direction_rmse_deg_before
        ),
        "loopTranslationDirectionRmseDegAfter": (
            evidence.loop_translation_direction_rmse_deg_after
        ),
        "externalErrorMetersBefore": evidence.external_error_m_before,
        "externalErrorMetersAfter": evidence.external_error_m_after,
        "externalEvidenceKind": evidence.external_evidence_kind,
        "externalEvidenceRef": evidence.external_evidence_ref,
        "refinementEvidenced": verdict.refinement_evidenced,
        "absoluteAccuracyCertified": verdict.absolute_accuracy_certified,
        "verdictCode": verdict.code,
        "verdictReason": verdict.reason,
    }


def _pose_documents(
    request: PreparedRefineRunRequest,
    aligned_poses: Sequence[NamedRefinedPose],
    *,
    deadline: RefineDeadline,
) -> tuple[dict[str, object], dict[str, object]]:
    frames = {value.frame.image_name: value.frame for value in request.frames}
    pose_rows: list[dict[str, object]] = []
    delta_rows: list[dict[str, object]] = []
    for row_index, row in enumerate(aligned_poses):
        _deadline_checkpoint(deadline, row_index)
        frame = frames[row.image_name]
        aligned_center = _camera_center(row.cam_from_world)
        raw_center = frame.camera_center_m
        pose_rows.append(
            {
                "imageName": row.image_name,
                "cameraCenterMeters": list(aligned_center),
                "camFromWorld": {
                    "qvecHamilton": list(row.cam_from_world.qvec),
                    "rotation": [
                        list(rotation_row)
                        for rotation_row in row.cam_from_world.rotation
                    ],
                    "translation": list(row.cam_from_world.translation),
                },
            }
        )
        delta_rows.append(
            {
                "imageName": row.image_name,
                "rawCameraCenterMeters": list(raw_center),
                "alignedCameraCenterMeters": list(aligned_center),
                "cameraCenterDeltaMeters": [
                    aligned_center[index] - raw_center[index] for index in range(3)
                ],
                "rawQvecHamilton": list(frame.colmap_pose.qvec),
                "alignedQvecHamilton": list(row.cam_from_world.qvec),
            }
        )
    return (
        {"schemaVersion": 1, "frames": pose_rows},
        {"schemaVersion": 1, "frames": delta_rows},
    )


def _validate_engine_artifacts(
    values: object,
    *,
    workspace_root: Path,
    deadline: RefineDeadline,
) -> tuple[RefineFileArtifact, ...]:
    artifacts = _snapshot_sequence(
        values,
        label="artifact builder output",
        failure_code=RefineFailureCode.ARTIFACT_INVALID,
        deadline=deadline,
    )
    seen: set[str] = set()
    validated: list[RefineFileArtifact] = []
    for artifact_index, artifact in enumerate(artifacts):
        _deadline_checkpoint(deadline, artifact_index)
        if not isinstance(artifact, RefineFileArtifact):
            _fail(
                RefineFailureCode.ARTIFACT_INVALID,
                "artifact has the wrong contract type",
            )
        if (
            type(artifact.name) is not str
            or _SAFE_ARTIFACT_NAME.fullmatch(artifact.name) is None
            or artifact.name in seen
            or artifact.name in _RUNNER_ARTIFACT_NAMES
            or artifact.name == REFINE_MANIFEST_NAME
            or artifact.name not in _ENGINE_ARTIFACT_MEDIA_TYPES
        ):
            _fail(
                RefineFailureCode.ARTIFACT_INVALID,
                "artifact names must be the unique canonical engine artifacts",
            )
        if (
            type(artifact.transport_content_type) is not str
            or artifact.transport_content_type != ROOM_SCANS_BINARY_TRANSPORT_TYPE
        ):
            _fail(
                RefineFailureCode.ARTIFACT_INVALID,
                "engine artifacts must use the room-scans binary transport type",
            )
        expected_media_type = _ENGINE_ARTIFACT_MEDIA_TYPES[artifact.name]
        if (
            type(artifact.semantic_media_type) is not str
            or artifact.semantic_media_type != expected_media_type
        ):
            _fail(
                RefineFailureCode.ARTIFACT_INVALID,
                "artifact semantic media type does not match its canonical name",
            )
        if (
            not isinstance(artifact.source_path, Path)
            or not artifact.source_path.is_absolute()
        ):
            _fail(
                RefineFailureCode.ARTIFACT_INVALID,
                "artifact source path must be absolute",
            )
        try:
            resolved = artifact.source_path.resolve(strict=True)
            resolved.relative_to(workspace_root)
            file_stat = resolved.stat()
        except OSError as exc:
            _fail(RefineFailureCode.INPUT_IO, f"cannot inspect engine artifact: {exc}")
        except ValueError as exc:
            _fail(
                RefineFailureCode.ARTIFACT_INVALID,
                f"engine artifact escapes workspace: {exc}",
            )
        if resolved != artifact.source_path or not stat.S_ISREG(file_stat.st_mode):
            _fail(
                RefineFailureCode.ARTIFACT_INVALID,
                "engine artifact must be a contained regular file without symlinks",
            )
        if (
            isinstance(artifact.size_bytes, bool)
            or not isinstance(artifact.size_bytes, int)
            or artifact.size_bytes <= 0
            or artifact.size_bytes != file_stat.st_size
        ):
            _fail(
                RefineFailureCode.ARTIFACT_INVALID, "engine artifact size is untrusted"
            )
        if (
            not isinstance(artifact.sha256, str)
            or re.fullmatch(r"[0-9a-f]{64}", artifact.sha256) is None
        ):
            _fail(
                RefineFailureCode.ARTIFACT_INVALID,
                "engine artifact sha256 is malformed",
            )
        try:
            actual_sha256, stable_stat = _stable_file_sha256(
                resolved,
                deadline=deadline,
            )
        except OSError as exc:
            _fail(RefineFailureCode.INPUT_IO, str(exc))
        except ValueError as exc:
            _fail(RefineFailureCode.ARTIFACT_INVALID, str(exc))
        if stable_stat.st_size != artifact.size_bytes:
            _fail(
                RefineFailureCode.ARTIFACT_INVALID,
                "engine artifact changed before hashing",
            )
        if actual_sha256 != artifact.sha256:
            _fail(
                RefineFailureCode.ARTIFACT_INVALID,
                "engine artifact sha256 is untrusted",
            )
        seen.add(artifact.name)
        validated.append(artifact)
    missing = _REQUIRED_ENGINE_ARTIFACT_NAMES - seen
    if missing:
        _fail(
            RefineFailureCode.ARTIFACT_INVALID,
            f"artifact builder omitted required artifacts: {', '.join(sorted(missing))}",
        )
    _require_engine_budget(deadline)
    return tuple(sorted(validated, key=lambda artifact: artifact.name))


def _inline_json(
    name: str,
    document: object,
    *,
    deadline: RefineDeadline,
) -> RefineInlineArtifact:
    _require_engine_budget(deadline)
    try:
        payload = _canonical_json_bytes(document)
        artifact = RefineInlineArtifact(
            name=name,
            transport_content_type="application/json",
            semantic_media_type="application/json",
            payload=payload,
        )
    except (AdapterError, TypeError, ValueError) as exc:
        _fail(RefineFailureCode.ARTIFACT_INVALID, str(exc))
    _require_engine_budget(deadline)
    return artifact


def _artifact_row(artifact: RefineArtifact) -> dict[str, object]:
    return {
        "name": artifact.name,
        "transportContentType": artifact.transport_content_type,
        "semanticMediaType": artifact.semantic_media_type,
        "sha256": artifact.sha256,
        "sizeBytes": artifact.size_bytes,
    }


class RefineRunner:
    """Pure Refine orchestration; no queue claim, publication, or registration."""

    def __init__(
        self,
        *,
        backend: RefineExecutionBackend,
        artifact_builder: RefineArtifactBuilder,
        fallback_policy: RefineFallbackPolicy = RefineFallbackPolicy.PRIMARY_ONLY,
    ) -> None:
        if not isinstance(fallback_policy, RefineFallbackPolicy):
            raise TypeError("fallback_policy must be a RefineFallbackPolicy")
        self._backend = backend
        self._artifact_builder = artifact_builder
        self._fallback_policy = fallback_policy

    @property
    def fallback_policy(self) -> RefineFallbackPolicy:
        return self._fallback_policy

    def run(
        self,
        request: RefineRunRequest,
        *,
        deadline: RefineDeadline,
    ) -> RefineRunResult:
        _require_engine_budget(deadline)
        manifest_key, prepared = _validate_request(request, deadline=deadline)
        _require_engine_budget(deadline)
        selected_engine, fallback_trigger, candidate = _select_candidate(
            self._backend,
            prepared,
            deadline,
            self._fallback_policy,
        )
        _validate_candidate_versions(candidate, deadline=deadline)
        alignment, aligned_poses, shape = _validate_and_align(
            prepared,
            candidate,
            deadline=deadline,
        )
        evidence_verdict = _validate_evidence(
            prepared,
            candidate,
            deadline=deadline,
        )

        _require_engine_budget(deadline)
        try:
            built_artifacts = self._artifact_builder.build_engine_artifacts(
                request=prepared,
                candidate=candidate,
                selected_engine=selected_engine,
                alignment=alignment,
                aligned_poses=aligned_poses,
                deadline=deadline,
            )
        except RefineRunError:
            _require_engine_budget(deadline)
            raise
        except TimeoutError as exc:
            _require_engine_budget(deadline)
            _fail(RefineFailureCode.ENGINE_TIMEOUT, str(exc))
        except AdapterError as exc:
            _require_engine_budget(deadline)
            if exc.code == RefineFailureCode.ENGINE_TIMEOUT.value:
                _fail(RefineFailureCode.ENGINE_TIMEOUT, str(exc))
            if exc.code == RefineFailureCode.INPUT_IO.value:
                _fail(RefineFailureCode.INPUT_IO, str(exc))
            _fail(RefineFailureCode.ARTIFACT_INVALID, str(exc))
        except OSError as exc:
            _require_engine_budget(deadline)
            _fail(RefineFailureCode.INPUT_IO, str(exc))
        except Exception as exc:  # noqa: BLE001 - normalize an injected assembler
            _require_engine_budget(deadline)
            raise RefineRunError(
                RefineFailureCode.ARTIFACT_INVALID,
                f"artifact builder raised {type(exc).__name__}",
            ) from exc
        _require_engine_budget(deadline)
        engine_artifacts = _validate_engine_artifacts(
            built_artifacts,
            workspace_root=prepared.workspace_root,
            deadline=deadline,
        )
        _require_engine_budget(deadline)

        pose_document, delta_document = _pose_documents(
            prepared,
            aligned_poses,
            deadline=deadline,
        )
        evidence_document = _evidence_document(candidate.evidence, evidence_verdict)
        shape_document = {"schemaVersion": 1, **_shape_document(shape)}
        runner_artifacts = (
            _inline_json(
                "pose-deltas-v1.json",
                delta_document,
                deadline=deadline,
            ),
            _inline_json(
                "refined-poses-v1.json",
                pose_document,
                deadline=deadline,
            ),
            _inline_json(
                "refinement-evidence-v1.json",
                evidence_document,
                deadline=deadline,
            ),
            _inline_json(
                "trajectory-shape-v1.json",
                shape_document,
                deadline=deadline,
            ),
        )
        artifacts = tuple(
            sorted(
                (*engine_artifacts, *runner_artifacts),
                key=lambda artifact: artifact.name,
            )
        )

        fallback_value = (
            fallback_trigger.value if fallback_trigger is not None else None
        )
        input_rows: list[dict[str, object]] = []
        for input_index, source in enumerate(prepared.inputs):
            _deadline_checkpoint(deadline, input_index)
            input_rows.append(
                {
                    "key": source.key,
                    "sha256": source.sha256,
                    "sizeBytes": source.size_bytes,
                }
            )
        frame_rows: list[dict[str, object]] = []
        for frame_index, frame in enumerate(prepared.frames):
            _deadline_checkpoint(deadline, frame_index)
            frame_rows.append(
                {
                    "imageName": frame.frame.image_name,
                    "relativeSourcePath": frame.relative_source_path,
                    "sha256": frame.source_sha256,
                    "sizeBytes": frame.source_size_bytes,
                }
            )
        artifact_rows: list[dict[str, object]] = []
        for artifact_index, artifact in enumerate(artifacts):
            _deadline_checkpoint(deadline, artifact_index)
            artifact_rows.append(_artifact_row(artifact))
        manifest_document = {
            "schemaVersion": REFINE_MANIFEST_SCHEMA_VERSION,
            "status": "complete",
            "productionEnablement": "disabled",
            "identity": {
                "userId": prepared.user_id,
                "scanId": prepared.scan_id,
                "roomFileId": prepared.room_file_id,
                "roomFileVersion": prepared.room_file_version,
            },
            "engine": {
                "selected": selected_engine,
                "targetVersion": COLMAP_TARGET_VERSION,
                "actualCliVersion": candidate.cli_version,
                "actualPycolmapVersion": candidate.binding_version,
                "fallbackPolicy": self._fallback_policy.value,
                "fallbackTrigger": fallback_value,
                "rotationPriorRepresented": selected_engine == PRIMARY_ENGINE,
            },
            "inputs": input_rows,
            "frameInputs": frame_rows,
            "sim3": _sim3_document(alignment),
            "trajectoryShapeChange": _shape_document(shape),
            "refinementEvidence": {
                "refinementEvidenced": evidence_verdict.refinement_evidenced,
                "absoluteAccuracyCertified": evidence_verdict.absolute_accuracy_certified,
                "verdictReason": evidence_verdict.reason,
            },
            "engineTelemetry": {
                "iterations": candidate.iterations,
                "vramPeakMb": candidate.vram_peak_mb,
            },
            "artifacts": artifact_rows,
        }
        manifest = _inline_json(
            REFINE_MANIFEST_NAME,
            manifest_document,
            deadline=deadline,
        )
        _require_engine_budget(deadline)
        return RefineRunResult(
            selected_engine=selected_engine,
            fallback_policy=self._fallback_policy,
            fallback_trigger=fallback_trigger,
            alignment=alignment,
            evidence_verdict=evidence_verdict,
            trajectory_shape_change=shape,
            manifest_key=manifest_key,
            manifest_sha256=manifest.sha256,
            files=(*artifacts, manifest),
        )
