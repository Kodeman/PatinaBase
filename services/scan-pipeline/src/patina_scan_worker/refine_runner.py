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
import json
import math
import os
import re
import stat
from dataclasses import dataclass, field
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
MAX_ENGINE_TELEMETRY_BYTES = 16 * 1024
MAX_ENGINE_TELEMETRY_METRICS = 32
MAX_ENGINE_TELEMETRY_KEY_BYTES = 64
MAX_ENGINE_TELEMETRY_STRING_BYTES = 512
_DEADLINE_CHECK_INTERVAL = 32
_SAFE_ARTIFACT_NAME = re.compile(r"[A-Za-z0-9][A-Za-z0-9._-]*")
_SAFE_TELEMETRY_KEY = re.compile(r"[a-z][A-Za-z0-9.]{0,63}")

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
        "adapter-v2.json",
        "pairs-v2.txt",
        "database-v1.db",
        "seed-model-v1.tar",
        "aligned-sparse-model-v1.tar",
        "engine-command-evidence-v1.json",
    }
)
_ENGINE_ARTIFACT_MEDIA_TYPES: Mapping[str, str] = MappingProxyType(
    {
        "adapter-v2.json": "application/json",
        "pairs-v2.txt": "text/plain",
        "database-v1.db": "application/vnd.sqlite3",
        "seed-model-v1.tar": "application/x-tar",
        "aligned-sparse-model-v1.tar": "application/x-tar",
        "engine-command-evidence-v1.json": "application/json",
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
    engine_image_name: str
    cam_from_world: ColmapPose


@dataclass(frozen=True)
class RefineEngineOutputReference:
    """Immutable identity and integrity claim for one canonical engine output."""

    name: str
    relative_path: str
    sha256: str
    size_bytes: int
    transport_content_type: str
    semantic_media_type: str


EngineTelemetryScalar: TypeAlias = bool | int | float | str


@dataclass(frozen=True)
class RefineEngineTelemetry:
    """Small immutable summary; timestamped command logs remain scratch-only."""

    duration_ms: int
    iterations: int
    vram_peak_mb: int
    command_count: int
    metrics: tuple[tuple[str, EngineTelemetryScalar], ...]


@dataclass(frozen=True)
class RefineEngineCandidate:
    """Queue/storage-free output of either engine path before metric rebase."""

    cli_version: str
    binding_version: str
    refined_poses: tuple[NamedRefinedPose, ...]
    evidence: RefinementEvidence
    outputs: tuple[RefineEngineOutputReference, ...]
    telemetry: RefineEngineTelemetry


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
    """One source HEIC and its distinct canonical materialized engine PPM.

    Both files arrive as BORROWED read-only descriptors opened by whoever
    produced them -- the acquirer for the source, the raster materializer for the
    engine PPM.  The runner reads them and never closes them.  The two relative
    paths are manifest/display metadata; nothing opens them.
    """

    frame: NormalizedFrame
    source_descriptor: int
    relative_source_path: str
    source_archive_key: str
    source_member: str
    source_sha256: str
    source_size_bytes: int
    engine_name: str
    engine_descriptor: int
    engine_relative_path: str
    engine_sha256: str
    engine_size_bytes: int
    materializer_id: str


@dataclass(frozen=True)
class PreparedRefineFrame:
    """Verified descriptor snapshot for a backend handoff.

    Containment plus a checksum never made a path TOCTOU-safe -- the object could
    change between the check and the ``open``, and between the runner's ``open``
    and the backend's.  Both files are therefore pinned to the descriptor their
    producer already holds: the runner verifies that descriptor and the backend
    reads that same descriptor, so the gap has no place left to exist.

    The descriptors are borrowed.  Their owner is the composed caller, which must
    keep them open for the whole run and close them afterwards.
    """

    frame: NormalizedFrame
    source_descriptor: int
    relative_source_path: str
    source_archive_key: str
    source_member: str
    source_sha256: str
    source_size_bytes: int
    engine_name: str
    engine_descriptor: int
    engine_relative_path: str
    engine_sha256: str
    engine_size_bytes: int
    materializer_id: str


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
    """Streaming publisher input bound to one BORROWED read-only descriptor.

    ``descriptor`` is the handoff.  It is not opened here and not closed here:
    its owner is whoever opened it -- in the composed pipeline, the
    ``NativeEngineOutputs`` sink the native boundary populated.  The runner
    verifies that exact descriptor and the publisher uploads that exact
    descriptor, so there is no window in which the object being measured and the
    object being published could differ.  Every read on it is positional, so the
    owner's file offset is never disturbed.

    ``display_path`` is exactly what its name says: metadata for humans and for
    the manifest.  Nothing may open it.  It was previously a ``source_path`` that
    the runner resolved and hashed and the publisher then opened a SECOND time,
    which is the reopen this contract exists to remove.
    """

    name: str
    # A file-descriptor NUMBER is an incidental handle, not part of the
    # artifact's value: two runs over identical bytes must still compare equal,
    # and the byte-determinism contract is carried by ``sha256``/``size_bytes``.
    descriptor: int = field(compare=False)
    sha256: str
    size_bytes: int
    transport_content_type: str
    semantic_media_type: str
    display_path: str | None = None


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
    room_file_id: str
    inputs: tuple[InputArtifact, ...]
    frame_inputs: tuple[PreparedRefineFrame, ...]
    engine_outputs: tuple[RefineEngineOutputReference, ...]
    engine_telemetry: RefineEngineTelemetry
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


def _safe_relative_path(
    value: object,
    label: str,
    *,
    failure_code: RefineFailureCode = RefineFailureCode.INPUT_INVALID,
) -> PurePosixPath:
    if (
        type(value) is not str
        or not value
        or any(character in value for character in ("\\", "?", "#", "%"))
    ):
        _fail(failure_code, f"{label} must be a safe relative path")
    path = PurePosixPath(value)
    if (
        path.is_absolute()
        or not path.parts
        or any(part in ("", ".", "..") for part in path.parts)
        or str(path) != value
    ):
        _fail(failure_code, f"{label} must be a safe relative path")
    return path


def _borrowed_descriptor_stat(
    descriptor: object,
    *,
    label: str,
    failure_code: RefineFailureCode = RefineFailureCode.ARTIFACT_INVALID,
) -> os.stat_result:
    """Fail closed on anything that is not a borrowed read-only regular file."""

    if type(descriptor) is not int or descriptor < 0:
        _fail(
            failure_code,
            f"{label} descriptor must be a non-negative integer",
        )
    try:
        metadata = os.fstat(descriptor)
    except OSError as exc:
        _fail(RefineFailureCode.INPUT_IO, f"cannot inspect {label}: {exc}")
    if not stat.S_ISREG(metadata.st_mode):
        _fail(
            failure_code,
            f"{label} must be a regular file",
        )
    try:
        import fcntl

        access_mode = fcntl.fcntl(descriptor, fcntl.F_GETFL) & os.O_ACCMODE
    except (ImportError, OSError) as exc:
        _fail(RefineFailureCode.INPUT_IO, f"cannot inspect {label} flags: {exc}")
    if access_mode != os.O_RDONLY:
        _fail(
            failure_code,
            f"{label} must be borrowed read-only",
        )
    return metadata


def _stable_descriptor_sha256(
    descriptor: int,
    *,
    expected_size: int,
    deadline: RefineDeadline,
) -> tuple[str, os.stat_result]:
    """Hash a borrowed descriptor positionally, proving its identity held still.

    ``pread`` rather than ``read``: the descriptor belongs to someone else, so
    consuming its offset would corrupt an owner that reads it before or after
    this call -- and, unlike the removed path-based hasher, there is no second
    ``open`` here for an attacker to aim at.
    """

    _require_engine_budget(deadline)
    if not hasattr(os, "pread"):
        raise ValueError("descriptor-relative reads are unavailable")
    before = os.fstat(descriptor)
    if not stat.S_ISREG(before.st_mode):
        raise ValueError("source is not a regular file")
    if before.st_size != expected_size:
        raise ValueError("source size does not match its ledger")
    digest = hashlib.sha256()
    offset = 0
    chunk_index = 0
    while offset < expected_size:
        _deadline_checkpoint(deadline, chunk_index)
        chunk = os.pread(descriptor, min(1024 * 1024, expected_size - offset), offset)
        if not chunk:
            raise ValueError("source ended before its declared size")
        digest.update(chunk)
        offset += len(chunk)
        chunk_index += 1
    if os.pread(descriptor, 1, expected_size):
        raise ValueError("source exceeds its declared size")
    after = os.fstat(descriptor)
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


def _verified_frame_descriptor(
    *,
    descriptor: object,
    relative_path: object,
    expected_name: str,
    expected_sha256: object,
    expected_size_bytes: object,
    label: str,
    deadline: RefineDeadline,
) -> tuple[int, int]:
    """Verify one borrowed frame descriptor and return its ``(dev, ino)``.

    The declared relative path is still validated -- it goes into the manifest --
    but it is never joined, resolved, or opened.  Containment is no longer the
    safety property; descriptor identity is.
    """

    relative = _safe_relative_path(relative_path, f"{label} path")
    if relative.name != expected_name:
        _fail(
            RefineFailureCode.INPUT_INVALID,
            f"{label} basename must equal its declared image name",
        )
    file_stat = _borrowed_descriptor_stat(
        descriptor,
        label=label,
        failure_code=RefineFailureCode.INPUT_INVALID,
    )
    if (
        type(expected_size_bytes) is not int
        or expected_size_bytes <= 0
        or file_stat.st_size != expected_size_bytes
    ):
        _fail(
            RefineFailureCode.INPUT_INVALID,
            f"{label} size does not match its ledger",
        )
    if (
        type(expected_sha256) is not str
        or re.fullmatch(r"[0-9a-f]{64}", expected_sha256) is None
    ):
        _fail(
            RefineFailureCode.INPUT_INVALID,
            f"{label} sha256 must be lowercase hexadecimal",
        )
    try:
        actual_sha256, stable_stat = _stable_descriptor_sha256(
            descriptor,
            expected_size=expected_size_bytes,
            deadline=deadline,
        )
    except OSError as exc:
        _fail(RefineFailureCode.INPUT_IO, str(exc))
    except ValueError as exc:
        _fail(RefineFailureCode.INPUT_INVALID, str(exc))
    if stable_stat.st_size != expected_size_bytes:
        _fail(RefineFailureCode.INPUT_INVALID, f"{label} changed before hashing")
    if actual_sha256 != expected_sha256:
        _fail(
            RefineFailureCode.INPUT_INVALID,
            f"{label} sha256 does not match its ledger",
        )
    return (stable_stat.st_dev, stable_stat.st_ino)


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
    engine_names: set[str] = set()
    ordinals: set[int] = set()
    frame_identities: set[tuple[int, int]] = set()
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
            type(name) is not str
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
        source_archive_key = _safe_relative_path(
            frame_input.source_archive_key,
            "frame source archive key",
        )
        source_member = _safe_relative_path(
            frame_input.source_member,
            "frame source member",
        )
        if str(source_member) != str(heic_path):
            _fail(
                RefineFailureCode.INPUT_INVALID,
                "frame source member must equal the normalized HEIC path",
            )
        if source_member.suffix.lower() != ".heic":
            _fail(
                RefineFailureCode.INPUT_INVALID,
                "frame source member must identify a HEIC",
            )
        if type(frame_input.engine_name) is not str:
            _fail(
                RefineFailureCode.INPUT_INVALID,
                "frame engine image name must be an immutable string",
            )
        engine_name_path = PurePosixPath(frame_input.engine_name)
        if (
            engine_name_path.name != frame_input.engine_name
            or engine_name_path.suffix != ".ppm"
            or frame_input.engine_name in engine_names
        ):
            _fail(
                RefineFailureCode.INPUT_INVALID,
                "frame engine image names must be unique PPM basenames",
            )
        if (
            type(frame_input.materializer_id) is not str
            or not frame_input.materializer_id
            or len(frame_input.materializer_id.encode("utf-8")) > 128
            or any(ord(character) < 0x21 for character in frame_input.materializer_id)
        ):
            _fail(
                RefineFailureCode.INPUT_INVALID,
                "frame materializer id must be a bounded visible string",
            )
        source_identity = _verified_frame_descriptor(
            descriptor=frame_input.source_descriptor,
            relative_path=frame_input.relative_source_path,
            expected_name=name,
            expected_sha256=frame_input.source_sha256,
            expected_size_bytes=frame_input.source_size_bytes,
            label="frame source HEIC",
            deadline=deadline,
        )
        engine_identity = _verified_frame_descriptor(
            descriptor=frame_input.engine_descriptor,
            relative_path=frame_input.engine_relative_path,
            expected_name=frame_input.engine_name,
            expected_sha256=frame_input.engine_sha256,
            expected_size_bytes=frame_input.engine_size_bytes,
            label="frame engine PPM",
            deadline=deadline,
        )
        # The source HEIC and its materialized engine PPM are distinct objects by
        # contract; one inode standing in for both would mean the raster step
        # never ran.  Reusing an inode across frames would mean two frames share
        # pixels, which the pose solve would silently accept.
        for identity in (source_identity, engine_identity):
            if identity in frame_identities:
                _fail(
                    RefineFailureCode.INPUT_INVALID,
                    "frame files must reference unique file identities",
                )
            frame_identities.add(identity)
        prepared_frames.append(
            PreparedRefineFrame(
                frame=frame,
                source_descriptor=frame_input.source_descriptor,
                relative_source_path=frame_input.relative_source_path,
                source_archive_key=str(source_archive_key),
                source_member=str(source_member),
                source_sha256=frame_input.source_sha256,
                source_size_bytes=frame_input.source_size_bytes,
                engine_name=frame_input.engine_name,
                engine_descriptor=frame_input.engine_descriptor,
                engine_relative_path=frame_input.engine_relative_path,
                engine_sha256=frame_input.engine_sha256,
                engine_size_bytes=frame_input.engine_size_bytes,
                materializer_id=frame_input.materializer_id,
            )
        )
        names.add(name)
        engine_names.add(frame_input.engine_name)
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
    for frame_index, prepared_frame in enumerate(prepared_frames):
        _deadline_checkpoint(deadline, frame_index)
        if prepared_frame.source_archive_key not in input_keys:
            _fail(
                RefineFailureCode.INPUT_INVALID,
                "frame source archive key is absent from the input ledger",
            )
    _require_engine_budget(deadline)
    sorted_frames = tuple(
        sorted(
            prepared_frames,
            key=lambda value: (
                value.frame.frame_timestamp_s,
                value.frame.image_name,
            ),
        )
    )
    for engine_ordinal, prepared_frame in enumerate(sorted_frames):
        _deadline_checkpoint(deadline, engine_ordinal)
        canonical_name = f"frame_{engine_ordinal:06d}.ppm"
        if (
            prepared_frame.engine_name != canonical_name
            or prepared_frame.engine_relative_path != f"images/{canonical_name}"
        ):
            _fail(
                RefineFailureCode.INPUT_INVALID,
                "engine PPM identity must use the canonical ordered name and path",
            )

    prepared = PreparedRefineRunRequest(
        user_id=request.user_id,
        scan_id=request.scan_id,
        room_file_id=request.room_file_id,
        room_file_version=request.room_file_version,
        workspace_root=workspace_root,
        frames=sorted_frames,
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


def _snapshot_candidate_pose(value: object) -> ColmapPose:
    """Build a deeply immutable pose snapshot or reject the engine output."""

    if not isinstance(value, ColmapPose):
        _fail(
            RefineFailureCode.SIM3_INVALID,
            "candidate pose has the wrong contract type",
        )
    rotation = value.rotation
    translation = value.translation
    qvec = value.qvec
    if not (
        type(rotation) is tuple
        and len(rotation) == 3
        and all(
            type(row) is tuple
            and len(row) == 3
            and all(_is_finite_number(component) for component in row)
            for row in rotation
        )
    ):
        _fail(
            RefineFailureCode.SIM3_INVALID,
            "candidate pose rotation must be an immutable finite 3x3 tuple",
        )
    if not (
        type(translation) is tuple
        and len(translation) == 3
        and all(_is_finite_number(component) for component in translation)
    ):
        _fail(
            RefineFailureCode.SIM3_INVALID,
            "candidate pose translation must be an immutable finite 3-tuple",
        )
    if not (
        type(qvec) is tuple
        and len(qvec) == 4
        and all(_is_finite_number(component) for component in qvec)
    ):
        _fail(
            RefineFailureCode.SIM3_INVALID,
            "candidate pose quaternion must be an immutable finite 4-tuple",
        )
    return ColmapPose(
        rotation=(
            tuple(float(component) for component in rotation[0]),
            tuple(float(component) for component in rotation[1]),
            tuple(float(component) for component in rotation[2]),
        ),
        translation=tuple(float(component) for component in translation),
        qvec=tuple(float(component) for component in qvec),
    )


def _snapshot_engine_output_references(
    value: object,
    *,
    deadline: RefineDeadline,
) -> tuple[RefineEngineOutputReference, ...]:
    if type(value) is not tuple:
        _fail(
            RefineFailureCode.ARTIFACT_INVALID,
            "candidate output references must be an immutable tuple",
        )
    if len(value) != len(_REQUIRED_ENGINE_ARTIFACT_NAMES):
        _fail(
            RefineFailureCode.ARTIFACT_INVALID,
            "candidate output references must contain the closed canonical set",
        )
    seen: set[str] = set()
    snapshot: list[RefineEngineOutputReference] = []
    for index, item in enumerate(value):
        _deadline_checkpoint(deadline, index)
        if type(item) is not RefineEngineOutputReference:
            _fail(
                RefineFailureCode.ARTIFACT_INVALID,
                "candidate output reference has the wrong contract type",
            )
        if (
            type(item.name) is not str
            or item.name not in _ENGINE_ARTIFACT_MEDIA_TYPES
            or item.name in seen
        ):
            _fail(
                RefineFailureCode.ARTIFACT_INVALID,
                "candidate output names must be the unique canonical engine set",
            )
        relative_path = _safe_relative_path(
            item.relative_path,
            "candidate output path",
            failure_code=RefineFailureCode.ARTIFACT_INVALID,
        )
        if relative_path.name != item.name:
            _fail(
                RefineFailureCode.ARTIFACT_INVALID,
                "candidate output path basename must equal its canonical name",
            )
        if (
            type(item.sha256) is not str
            or re.fullmatch(r"[0-9a-f]{64}", item.sha256) is None
            or type(item.size_bytes) is not int
            or item.size_bytes <= 0
            or type(item.transport_content_type) is not str
            or item.transport_content_type != ROOM_SCANS_BINARY_TRANSPORT_TYPE
            or type(item.semantic_media_type) is not str
            or item.semantic_media_type != _ENGINE_ARTIFACT_MEDIA_TYPES[item.name]
        ):
            _fail(
                RefineFailureCode.ARTIFACT_INVALID,
                "candidate output integrity or media metadata is invalid",
            )
        seen.add(item.name)
        snapshot.append(
            RefineEngineOutputReference(
                name=item.name,
                relative_path=str(relative_path),
                sha256=item.sha256,
                size_bytes=item.size_bytes,
                transport_content_type=item.transport_content_type,
                semantic_media_type=item.semantic_media_type,
            )
        )
    if seen != _REQUIRED_ENGINE_ARTIFACT_NAMES:
        _fail(
            RefineFailureCode.ARTIFACT_INVALID,
            "candidate output references omit a canonical engine artifact",
        )
    _require_engine_budget(deadline)
    return tuple(sorted(snapshot, key=lambda item: item.name))


def _snapshot_engine_telemetry(
    value: object,
    *,
    deadline: RefineDeadline,
) -> RefineEngineTelemetry:
    if type(value) is not RefineEngineTelemetry:
        _fail(
            RefineFailureCode.EVIDENCE_INVALID,
            "engine telemetry has the wrong contract type",
        )
    for label, number in (
        ("duration_ms", value.duration_ms),
        ("iterations", value.iterations),
        ("vram_peak_mb", value.vram_peak_mb),
        ("command_count", value.command_count),
    ):
        if type(number) is not int or number < 0 or number > 2**63 - 1:
            _fail(
                RefineFailureCode.EVIDENCE_INVALID,
                f"engine telemetry {label} must be a bounded non-negative integer",
            )
    if type(value.metrics) is not tuple:
        _fail(
            RefineFailureCode.EVIDENCE_INVALID,
            "engine telemetry metrics must be an immutable tuple",
        )
    if len(value.metrics) > MAX_ENGINE_TELEMETRY_METRICS:
        _fail(
            RefineFailureCode.EVIDENCE_INVALID,
            "engine telemetry has too many metrics",
        )
    seen: set[str] = set()
    metrics: list[tuple[str, EngineTelemetryScalar]] = []
    for index, row in enumerate(value.metrics):
        _deadline_checkpoint(deadline, index)
        if type(row) is not tuple or len(row) != 2:
            _fail(
                RefineFailureCode.EVIDENCE_INVALID,
                "engine telemetry metric rows must be immutable key/value pairs",
            )
        key, scalar = row
        if (
            type(key) is not str
            or len(key.encode("utf-8")) > MAX_ENGINE_TELEMETRY_KEY_BYTES
            or _SAFE_TELEMETRY_KEY.fullmatch(key) is None
            or key in seen
        ):
            _fail(
                RefineFailureCode.EVIDENCE_INVALID,
                "engine telemetry metric keys must be unique bounded identifiers",
            )
        if type(scalar) is bool:
            copied: EngineTelemetryScalar = scalar
        elif type(scalar) is int:
            if abs(scalar) > 2**63 - 1:
                _fail(
                    RefineFailureCode.EVIDENCE_INVALID,
                    "engine telemetry integer metric is out of range",
                )
            copied = scalar
        elif type(scalar) is float:
            if not math.isfinite(scalar):
                _fail(
                    RefineFailureCode.EVIDENCE_INVALID,
                    "engine telemetry float metric must be finite",
                )
            copied = scalar
        elif type(scalar) is str:
            if (
                len(scalar.encode("utf-8")) > MAX_ENGINE_TELEMETRY_STRING_BYTES
                or any(ord(character) < 0x20 for character in scalar)
            ):
                _fail(
                    RefineFailureCode.EVIDENCE_INVALID,
                    "engine telemetry string metric is invalid or too large",
                )
            copied = scalar
        else:
            _fail(
                RefineFailureCode.EVIDENCE_INVALID,
                "engine telemetry metrics must use exact JSON scalar types",
            )
        seen.add(key)
        metrics.append((key, copied))
    snapshot = RefineEngineTelemetry(
        duration_ms=value.duration_ms,
        iterations=value.iterations,
        vram_peak_mb=value.vram_peak_mb,
        command_count=value.command_count,
        metrics=tuple(sorted(metrics)),
    )
    try:
        encoded = _canonical_json_bytes(_telemetry_document(snapshot))
    except (AdapterError, TypeError, ValueError) as exc:
        _fail(RefineFailureCode.EVIDENCE_INVALID, str(exc))
    if len(encoded) > MAX_ENGINE_TELEMETRY_BYTES:
        _fail(
            RefineFailureCode.EVIDENCE_INVALID,
            "engine telemetry summary exceeds its canonical byte budget",
        )
    _require_engine_budget(deadline)
    return snapshot


def _snapshot_refinement_evidence(value: object) -> RefinementEvidence:
    if type(value) is not RefinementEvidence:
        _fail(
            RefineFailureCode.EVIDENCE_INVALID,
            "engine evidence has the wrong contract type",
        )
    return RefinementEvidence(
        input_images=value.input_images,
        registered_images_before=value.registered_images_before,
        registered_images_after=value.registered_images_after,
        common_observations=value.common_observations,
        common_observation_set_sha256=value.common_observation_set_sha256,
        reprojection_rmse_px_before=value.reprojection_rmse_px_before,
        reprojection_rmse_px_after=value.reprojection_rmse_px_after,
        verified_loop_edges=value.verified_loop_edges,
        verified_loop_set_sha256=value.verified_loop_set_sha256,
        loop_rotation_rmse_deg_before=value.loop_rotation_rmse_deg_before,
        loop_rotation_rmse_deg_after=value.loop_rotation_rmse_deg_after,
        loop_translation_direction_rmse_deg_before=(
            value.loop_translation_direction_rmse_deg_before
        ),
        loop_translation_direction_rmse_deg_after=(
            value.loop_translation_direction_rmse_deg_after
        ),
        external_error_m_before=value.external_error_m_before,
        external_error_m_after=value.external_error_m_after,
        external_evidence_kind=value.external_evidence_kind,
        external_evidence_ref=value.external_evidence_ref,
    )


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
    pose_rows: list[NamedRefinedPose] = []
    for row_index, row in enumerate(refined_poses):
        _deadline_checkpoint(deadline, row_index)
        if not isinstance(row, NamedRefinedPose):
            _fail(
                RefineFailureCode.SIM3_INVALID,
                "refined pose row has the wrong contract type",
            )
        if type(row.engine_image_name) is not str:
            _fail(
                RefineFailureCode.SIM3_INVALID,
                "refined pose image name must be an immutable string",
            )
        pose_rows.append(
            NamedRefinedPose(
                engine_image_name=row.engine_image_name,
                cam_from_world=_snapshot_candidate_pose(row.cam_from_world),
            )
        )
    return RefineEngineCandidate(
        cli_version=candidate.cli_version,
        binding_version=candidate.binding_version,
        refined_poses=tuple(pose_rows),
        evidence=_snapshot_refinement_evidence(candidate.evidence),
        outputs=_snapshot_engine_output_references(
            getattr(candidate, "outputs", None),
            deadline=deadline,
        ),
        telemetry=_snapshot_engine_telemetry(
            getattr(candidate, "telemetry", None),
            deadline=deadline,
        ),
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
    except RefineRunError:
        raise
    except Exception as exc:  # noqa: BLE001 - normalize an injected engine
        raise RefineRunError(
            RefineFailureCode.ENGINE_FAILED,
            f"engine adapter raised {type(exc).__name__}",
        ) from exc
    snapshot = _snapshot_candidate(candidate, deadline=deadline)
    _require_engine_budget(deadline)
    return snapshot


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
        if primary_error.kind not in _FALLBACK_ELIGIBLE:
            raise _engine_failure(primary_error) from primary_error
        if fallback_policy is RefineFallbackPolicy.PRIMARY_ONLY:
            raise _engine_failure(primary_error) from primary_error
        fallback_trigger = primary_error.kind
    except RefineRunError:
        raise
    else:
        _require_engine_budget(deadline)
        return PRIMARY_ENGINE, None, candidate

    _require_engine_budget(deadline)
    try:
        candidate = _call_engine(
            _backend_callback(backend, "run_fallback"),
            request,
            deadline,
        )
    except EngineAttemptError as fallback_error:
        raise _engine_failure(fallback_error) from fallback_error
    except RefineRunError:
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
        type(candidate.cli_version) is not str
        or candidate.cli_version != COLMAP_TARGET_VERSION
        or type(candidate.binding_version) is not str
        or candidate.binding_version != COLMAP_TARGET_VERSION
    ):
        _fail(
            RefineFailureCode.ENGINE_VERSION_MISMATCH,
            "candidate CLI and binding versions must exactly equal the target version",
        )
    try:
        qualify_colmap_versions(
            f"COLMAP {candidate.cli_version}",
            candidate.binding_version,
        )
    except Exception as exc:  # noqa: BLE001 - malformed versions also fail closed
        _fail(RefineFailureCode.ENGINE_VERSION_MISMATCH, str(exc))
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
    expected = {value.engine_name: value for value in request.frames}
    refined: dict[str, ColmapPose] = {}
    for row_index, row in enumerate(candidate.refined_poses):
        _deadline_checkpoint(deadline, row_index)
        if not isinstance(row, NamedRefinedPose):
            _fail(
                RefineFailureCode.SIM3_INVALID,
                "refined pose row has the wrong contract type",
            )
        name = row.engine_image_name
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
        prepared_frame = expected.get(name)
        if prepared_frame is None:
            _fail(
                RefineFailureCode.SIM3_INVALID, "refined poses contain an unknown image"
            )
        try:
            EngineImage(
                name=name,
                intrinsics=prepared_frame.frame.intrinsics,
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
        target_centres.append(expected[name].frame.camera_center_m)
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


def _telemetry_document(telemetry: RefineEngineTelemetry) -> dict[str, object]:
    return {
        "durationMs": telemetry.duration_ms,
        "iterations": telemetry.iterations,
        "vramPeakMb": telemetry.vram_peak_mb,
        "commandCount": telemetry.command_count,
        "metrics": [
            {"name": key, "value": value} for key, value in telemetry.metrics
        ],
    }


def _frame_input_document(frame: PreparedRefineFrame) -> dict[str, object]:
    return {
        "imageName": frame.frame.image_name,
        "relativeSourcePath": frame.relative_source_path,
        "sha256": frame.source_sha256,
        "sizeBytes": frame.source_size_bytes,
        "sourceHeic": {
            "archiveKey": frame.source_archive_key,
            "member": frame.source_member,
            "imageName": frame.frame.image_name,
            "relativePath": frame.relative_source_path,
            "sha256": frame.source_sha256,
            "sizeBytes": frame.source_size_bytes,
        },
        "enginePpm": {
            "imageName": frame.engine_name,
            "relativePath": frame.engine_relative_path,
            "sha256": frame.engine_sha256,
            "sizeBytes": frame.engine_size_bytes,
        },
        "materializerId": frame.materializer_id,
    }


def _engine_output_document(
    reference: RefineEngineOutputReference,
) -> dict[str, object]:
    return {
        "name": reference.name,
        "relativePath": reference.relative_path,
        "transportContentType": reference.transport_content_type,
        "semanticMediaType": reference.semantic_media_type,
        "sha256": reference.sha256,
        "sizeBytes": reference.size_bytes,
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
    frames = {value.engine_name: value for value in request.frames}
    pose_rows: list[dict[str, object]] = []
    delta_rows: list[dict[str, object]] = []
    for row_index, row in enumerate(aligned_poses):
        _deadline_checkpoint(deadline, row_index)
        prepared_frame = frames[row.engine_image_name]
        frame = prepared_frame.frame
        aligned_center = _camera_center(row.cam_from_world)
        raw_center = frame.camera_center_m
        pose_rows.append(
            {
                "imageName": frame.image_name,
                "sourceImageName": frame.image_name,
                "engineImageName": row.engine_image_name,
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
                "imageName": frame.image_name,
                "sourceImageName": frame.image_name,
                "engineImageName": row.engine_image_name,
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
    expected_outputs: tuple[RefineEngineOutputReference, ...],
    deadline: RefineDeadline,
) -> tuple[RefineFileArtifact, ...]:
    """Verify every engine artifact through its borrowed descriptor only.

    There is no path here on purpose.  ``workspace_root`` containment used to be
    the safety story, but a containment check followed by an ``open`` is only as
    good as the gap between them; binding to the descriptor the builder already
    holds removes the gap instead of narrowing it.
    """

    artifacts = _snapshot_sequence(
        values,
        label="artifact builder output",
        failure_code=RefineFailureCode.ARTIFACT_INVALID,
        deadline=deadline,
    )
    seen: set[str] = set()
    seen_identities: set[tuple[int, int]] = set()
    expected_by_name = {reference.name: reference for reference in expected_outputs}
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
        if artifact.display_path is not None and (
            type(artifact.display_path) is not str or not artifact.display_path
        ):
            _fail(
                RefineFailureCode.ARTIFACT_INVALID,
                "artifact display path must be absent or a non-empty string",
            )
        file_stat = _borrowed_descriptor_stat(
            artifact.descriptor,
            label="engine artifact",
        )
        reference = expected_by_name.get(artifact.name)
        if reference is None:
            _fail(
                RefineFailureCode.ARTIFACT_INVALID,
                "engine artifact is absent from the candidate output references",
            )
        identity = (file_stat.st_dev, file_stat.st_ino)
        if identity in seen_identities:
            _fail(
                RefineFailureCode.ARTIFACT_INVALID,
                "engine artifacts must reference unique file identities",
            )
        seen_identities.add(identity)
        if (
            type(artifact.size_bytes) is not int
            or artifact.size_bytes <= 0
            or artifact.size_bytes != file_stat.st_size
        ):
            _fail(
                RefineFailureCode.ARTIFACT_INVALID, "engine artifact size is untrusted"
            )
        if (
            type(artifact.sha256) is not str
            or re.fullmatch(r"[0-9a-f]{64}", artifact.sha256) is None
        ):
            _fail(
                RefineFailureCode.ARTIFACT_INVALID,
                "engine artifact sha256 is malformed",
            )
        try:
            actual_sha256, stable_stat = _stable_descriptor_sha256(
                artifact.descriptor,
                expected_size=artifact.size_bytes,
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
        if (
            artifact.sha256 != reference.sha256
            or artifact.size_bytes != reference.size_bytes
            or artifact.transport_content_type != reference.transport_content_type
            or artifact.semantic_media_type != reference.semantic_media_type
        ):
            _fail(
                RefineFailureCode.ARTIFACT_INVALID,
                "engine artifact disagrees with its immutable candidate reference",
            )
        seen.add(artifact.name)
        validated.append(
            RefineFileArtifact(
                name=artifact.name,
                descriptor=artifact.descriptor,
                sha256=artifact.sha256,
                size_bytes=artifact.size_bytes,
                transport_content_type=artifact.transport_content_type,
                semantic_media_type=artifact.semantic_media_type,
                display_path=artifact.display_path,
            )
        )
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


def _publication_invalid(message: str) -> NoReturn:
    _fail(RefineFailureCode.ARTIFACT_INVALID, message)


def _strict_mapping(
    value: object,
    keys: frozenset[str],
    label: str,
) -> dict[str, object]:
    if type(value) is not dict or set(value) != keys:
        _publication_invalid(f"{label} must contain exactly {', '.join(sorted(keys))}")
    return value


def _strict_list(value: object, label: str) -> list[object]:
    if type(value) is not list:
        _publication_invalid(f"{label} must be a JSON array")
    return value


def _strict_string(value: object, label: str) -> str:
    if type(value) is not str or not value:
        _publication_invalid(f"{label} must be a non-empty string")
    return value


def _strict_integer(
    value: object,
    label: str,
    *,
    minimum: int = 0,
) -> int:
    if type(value) is not int or value < minimum or value > 2**63 - 1:
        _publication_invalid(f"{label} must be a bounded integer")
    return value


def _strict_number(value: object, label: str) -> float:
    if type(value) not in (int, float) or not math.isfinite(float(value)):
        _publication_invalid(f"{label} must be a finite JSON number")
    return float(value)


def _strict_json_scalar(value: object, label: str) -> EngineTelemetryScalar:
    if type(value) is bool:
        return value
    if type(value) is int:
        if abs(value) > 2**63 - 1:
            _publication_invalid(f"{label} integer is out of range")
        return value
    if type(value) is float:
        if not math.isfinite(value):
            _publication_invalid(f"{label} float is not finite")
        return value
    if type(value) is str:
        if (
            len(value.encode("utf-8")) > MAX_ENGINE_TELEMETRY_STRING_BYTES
            or not value.isprintable()
        ):
            _publication_invalid(f"{label} string is invalid")
        return value
    _publication_invalid(f"{label} must use an exact JSON scalar type")


def _strict_sha256(value: object, label: str) -> str:
    if type(value) is not str or re.fullmatch(r"[0-9a-f]{64}", value) is None:
        _publication_invalid(f"{label} must be a lowercase sha256")
    return value


def _strict_safe_relative_path(value: object, label: str) -> str:
    text = _strict_string(value, label)
    if any(character in text for character in ("\\", "?", "#", "%")):
        _publication_invalid(f"{label} must be a safe relative path")
    path = PurePosixPath(text)
    if (
        path.is_absolute()
        or any(part in ("", ".", "..") for part in path.parts)
        or str(path) != text
    ):
        _publication_invalid(f"{label} must be a safe relative path")
    return text


def _strict_publication_telemetry(value: object) -> RefineEngineTelemetry:
    if type(value) is not RefineEngineTelemetry:
        _publication_invalid("result engine telemetry has the wrong contract type")
    for label, number in (
        ("durationMs", value.duration_ms),
        ("iterations", value.iterations),
        ("vramPeakMb", value.vram_peak_mb),
        ("commandCount", value.command_count),
    ):
        _strict_integer(number, f"result engine telemetry {label}")
    if type(value.metrics) is not tuple or len(value.metrics) > MAX_ENGINE_TELEMETRY_METRICS:
        _publication_invalid("result engine telemetry metrics are not bounded")
    seen: set[str] = set()
    for row in value.metrics:
        if type(row) is not tuple or len(row) != 2:
            _publication_invalid("result engine telemetry metric row is malformed")
        key, scalar = row
        if (
            type(key) is not str
            or _SAFE_TELEMETRY_KEY.fullmatch(key) is None
            or key in seen
        ):
            _publication_invalid("result engine telemetry metric key is invalid")
        if type(scalar) is int:
            if abs(scalar) > 2**63 - 1:
                _publication_invalid("result engine telemetry integer is out of range")
        elif type(scalar) is float:
            if not math.isfinite(scalar):
                _publication_invalid("result engine telemetry float is not finite")
        elif type(scalar) is str:
            if (
                len(scalar.encode("utf-8")) > MAX_ENGINE_TELEMETRY_STRING_BYTES
                or not scalar.isprintable()
            ):
                _publication_invalid("result engine telemetry string is invalid")
        elif type(scalar) is not bool:
            _publication_invalid("result engine telemetry scalar type is invalid")
        seen.add(key)
    if len(_canonical_json_bytes(_telemetry_document(value))) > MAX_ENGINE_TELEMETRY_BYTES:
        _publication_invalid("result engine telemetry exceeds its canonical byte budget")
    return value


def _strict_output_reference(
    value: object,
) -> RefineEngineOutputReference:
    if type(value) is not RefineEngineOutputReference:
        _publication_invalid("result engine output has the wrong contract type")
    if type(value.name) is not str or value.name not in _ENGINE_ARTIFACT_MEDIA_TYPES:
        _publication_invalid("result engine output name is not canonical")
    relative_path = _strict_safe_relative_path(
        value.relative_path,
        "result engine output path",
    )
    if PurePosixPath(relative_path).name != value.name:
        _publication_invalid("result engine output path/name binding is invalid")
    _strict_sha256(value.sha256, "result engine output sha256")
    _strict_integer(value.size_bytes, "result engine output size", minimum=1)
    if (
        type(value.transport_content_type) is not str
        or value.transport_content_type != ROOM_SCANS_BINARY_TRANSPORT_TYPE
        or type(value.semantic_media_type) is not str
        or value.semantic_media_type != _ENGINE_ARTIFACT_MEDIA_TYPES[value.name]
    ):
        _publication_invalid("result engine output media type is invalid")
    return value


def _decode_canonical_manifest(payload: bytes) -> dict[str, object]:
    if type(payload) is not bytes or not payload:
        _publication_invalid("refine manifest payload must be non-empty bytes")

    def _pairs_hook(pairs):
        document: dict[str, object] = {}
        for key, value in pairs:
            if type(key) is not str or key in document:
                raise ValueError("duplicate or non-string JSON object key")
            document[key] = value
        return document

    try:
        decoded = json.loads(payload.decode("utf-8"), object_pairs_hook=_pairs_hook)
        canonical = _canonical_json_bytes(decoded)
    except (AdapterError, UnicodeError, ValueError, TypeError) as exc:
        _publication_invalid(f"refine manifest is not canonical JSON: {exc}")
    if canonical != payload or type(decoded) is not dict:
        _publication_invalid("refine manifest bytes are not canonical")
    return decoded


def validate_refine_result_for_publication(result: object) -> None:
    """Pure fail-closed gate a publisher must call before manifest-last commit.

    The validator performs no filesystem, queue, storage, clock, or network
    access. It rejects partial/legacy schemas and binds every publishable
    manifest field to the immutable runner result available at this boundary.
    """

    if type(result) is not RefineRunResult:
        _publication_invalid("publication requires an exact RefineRunResult")
    if type(result.files) is not tuple or len(result.files) != (
        len(_REQUIRED_ENGINE_ARTIFACT_NAMES) + len(_RUNNER_ARTIFACT_NAMES) + 1
    ):
        _publication_invalid("result files do not contain the closed Refine set")
    manifest = result.files[-1]
    if type(manifest) is not RefineInlineArtifact:
        _publication_invalid("result manifest must be the last inline artifact")
    if (
        manifest.name != REFINE_MANIFEST_NAME
        or manifest.transport_content_type != "application/json"
        or manifest.semantic_media_type != "application/json"
        or type(result.manifest_sha256) is not str
        or result.manifest_sha256 != manifest.sha256
    ):
        _publication_invalid("result manifest identity or digest is invalid")

    document = _decode_canonical_manifest(manifest.payload)
    _strict_mapping(
        document,
        frozenset(
            {
                "schemaVersion",
                "status",
                "productionEnablement",
                "identity",
                "engine",
                "inputs",
                "frameInputs",
                "sim3",
                "trajectoryShapeChange",
                "refinementEvidence",
                "engineTelemetry",
                "engineOutputs",
                "artifacts",
            }
        ),
        "refine manifest",
    )
    if type(document["schemaVersion"]) is not int or document["schemaVersion"] != 1:
        _publication_invalid("refine manifest schemaVersion must be integer 1")
    if document["status"] != "complete" or type(document["status"]) is not str:
        _publication_invalid("refine manifest status must be complete")
    if (
        document["productionEnablement"] != "disabled"
        or type(document["productionEnablement"]) is not str
    ):
        _publication_invalid("refine manifest must remain disabled")

    identity = _strict_mapping(
        document["identity"],
        frozenset({"userId", "scanId", "roomFileId", "roomFileVersion"}),
        "refine manifest identity",
    )
    user_id = _strict_string(identity["userId"], "identity.userId")
    scan_id = _strict_string(identity["scanId"], "identity.scanId")
    room_file_id = _strict_string(identity["roomFileId"], "identity.roomFileId")
    version = _strict_integer(
        identity["roomFileVersion"],
        "identity.roomFileVersion",
        minimum=1,
    )
    if any("/" in value for value in (user_id, scan_id)):
        _publication_invalid("manifest identity cannot contain path separators")
    expected_manifest_key = (
        f"room_file/{user_id}/{scan_id}/v{version}/refine/{REFINE_MANIFEST_NAME}"
    )
    if type(result.manifest_key) is not str or result.manifest_key != expected_manifest_key:
        _publication_invalid("manifest storage key disagrees with manifest identity")
    if (
        type(result.room_file_id) is not str
        or not result.room_file_id
        or room_file_id != result.room_file_id
    ):
        _publication_invalid("manifest room file identity disagrees with the result")

    engine = _strict_mapping(
        document["engine"],
        frozenset(
            {
                "selected",
                "targetVersion",
                "actualCliVersion",
                "actualPycolmapVersion",
                "fallbackPolicy",
                "fallbackTrigger",
                "rotationPriorRepresented",
            }
        ),
        "refine manifest engine",
    )
    if result.fallback_trigger is not None and type(result.fallback_trigger) is not EngineFailureKind:
        _publication_invalid("result fallback trigger has the wrong contract type")
    expected_trigger = (
        result.fallback_trigger.value if result.fallback_trigger is not None else None
    )
    if (
        type(result.selected_engine) is not str
        or result.selected_engine not in (PRIMARY_ENGINE, FALLBACK_ENGINE)
        or engine["selected"] != result.selected_engine
        or engine["targetVersion"] != COLMAP_TARGET_VERSION
        or engine["actualCliVersion"] != COLMAP_TARGET_VERSION
        or engine["actualPycolmapVersion"] != COLMAP_TARGET_VERSION
        or type(result.fallback_policy) is not RefineFallbackPolicy
        or engine["fallbackPolicy"] != result.fallback_policy.value
        or engine["fallbackTrigger"] != expected_trigger
        or type(engine["rotationPriorRepresented"]) is not bool
        or engine["rotationPriorRepresented"]
        != (result.selected_engine == PRIMARY_ENGINE)
    ):
        _publication_invalid("manifest engine does not bind to the runner result")

    input_rows = _strict_list(document["inputs"], "refine manifest inputs")
    if (
        type(result.inputs) is not tuple
        or not result.inputs
        or len(input_rows) != len(result.inputs)
    ):
        _publication_invalid("manifest inputs do not bind to the runner result")
    input_keys: list[str] = []
    input_documents: list[dict[str, object]] = []
    for index, row_value in enumerate(input_rows):
        row = _strict_mapping(
            row_value,
            frozenset({"key", "sha256", "sizeBytes"}),
            f"refine manifest input {index}",
        )
        input_keys.append(_strict_safe_relative_path(row["key"], "input key"))
        _strict_sha256(row["sha256"], "input sha256")
        _strict_integer(row["sizeBytes"], "input size", minimum=1)
        input_documents.append(row)
    if input_keys != sorted(set(input_keys)):
        _publication_invalid("refine manifest inputs must be unique and sorted")
    trusted_input_documents: list[dict[str, object]] = []
    trusted_input_keys: list[str] = []
    for index, source in enumerate(result.inputs):
        if type(source) is not InputArtifact:
            _publication_invalid(
                f"result input {index} has the wrong contract type"
            )
        key = _strict_safe_relative_path(source.key, "result input key")
        sha256 = _strict_sha256(source.sha256, "result input sha256")
        size_bytes = _strict_integer(
            source.size_bytes,
            "result input size",
            minimum=1,
        )
        trusted_input_keys.append(key)
        trusted_input_documents.append(
            {"key": key, "sha256": sha256, "sizeBytes": size_bytes}
        )
    if trusted_input_keys != sorted(set(trusted_input_keys)):
        _publication_invalid("result inputs must be unique and sorted")
    if input_documents != trusted_input_documents:
        _publication_invalid("manifest inputs disagree with the result")

    frame_rows = _strict_list(document["frameInputs"], "refine manifest frameInputs")
    if (
        type(result.frame_inputs) is not tuple
        or len(frame_rows) != len(result.frame_inputs)
        or len(frame_rows) < 3
    ):
        _publication_invalid("manifest frames do not bind to the runner result")
    for index, row_value in enumerate(frame_rows):
        row = _strict_mapping(
            row_value,
            frozenset(
                {
                    "imageName",
                    "relativeSourcePath",
                    "sha256",
                    "sizeBytes",
                    "sourceHeic",
                    "enginePpm",
                    "materializerId",
                }
            ),
            f"refine manifest frame {index}",
        )
        source = _strict_mapping(
            row["sourceHeic"],
            frozenset(
                {
                    "archiveKey",
                    "member",
                    "imageName",
                    "relativePath",
                    "sha256",
                    "sizeBytes",
                }
            ),
            f"refine manifest source HEIC {index}",
        )
        engine_ppm = _strict_mapping(
            row["enginePpm"],
            frozenset({"imageName", "relativePath", "sha256", "sizeBytes"}),
            f"refine manifest engine PPM {index}",
        )
        source_name = _strict_string(source["imageName"], "source HEIC imageName")
        source_member = _strict_safe_relative_path(
            source["member"],
            "source HEIC member",
        )
        source_relative = _strict_safe_relative_path(
            source["relativePath"],
            "source HEIC relativePath",
        )
        source_archive = _strict_safe_relative_path(
            source["archiveKey"],
            "source HEIC archiveKey",
        )
        source_sha = _strict_sha256(source["sha256"], "source HEIC sha256")
        source_size = _strict_integer(
            source["sizeBytes"],
            "source HEIC size",
            minimum=1,
        )
        engine_name = _strict_string(engine_ppm["imageName"], "engine PPM imageName")
        engine_relative = _strict_safe_relative_path(
            engine_ppm["relativePath"],
            "engine PPM relativePath",
        )
        _strict_sha256(engine_ppm["sha256"], "engine PPM sha256")
        _strict_integer(engine_ppm["sizeBytes"], "engine PPM size", minimum=1)
        materializer_id = _strict_string(row["materializerId"], "materializerId")
        if (
            PurePosixPath(source_member).suffix.lower() != ".heic"
            or PurePosixPath(source_member).name != source_name
            or PurePosixPath(source_relative).name != source_name
            or source_archive not in input_keys
            or engine_name != f"frame_{index:06d}.ppm"
            or engine_relative != f"images/{engine_name}"
            or row["imageName"] != source_name
            or row["relativeSourcePath"] != source_relative
            or row["sha256"] != source_sha
            or row["sizeBytes"] != source_size
            or len(materializer_id.encode("utf-8")) > 128
            or not materializer_id.isprintable()
        ):
            _publication_invalid("manifest source/engine frame identity is invalid")
        prepared = result.frame_inputs[index]
        if (
            type(prepared) is not PreparedRefineFrame
            or type(prepared.frame) is not NormalizedFrame
            or type(prepared.frame.image_name) is not str
        ):
            _publication_invalid("result frame has the wrong contract type")
        if row != _frame_input_document(prepared):
            _publication_invalid("manifest frame identity disagrees with the result")

    if (
        type(result.alignment) is not Sim3
        or not _is_finite_number(result.alignment.scale)
        or not _is_finite_matrix3(result.alignment.rotation)
        or not _is_finite_vector3(result.alignment.translation)
    ):
        _publication_invalid("result Sim(3) has the wrong contract type")
    sim3 = _strict_mapping(
        document["sim3"],
        frozenset({"scale", "rotation", "translationMeters"}),
        "refine manifest sim3",
    )
    _strict_number(sim3["scale"], "sim3.scale")
    rotation = _strict_list(sim3["rotation"], "sim3.rotation")
    translation = _strict_list(sim3["translationMeters"], "sim3.translation")
    if len(rotation) != 3 or len(translation) != 3:
        _publication_invalid("manifest Sim(3) has the wrong dimensions")
    for row in rotation:
        values = _strict_list(row, "sim3 rotation row")
        if len(values) != 3:
            _publication_invalid("manifest Sim(3) rotation row is malformed")
        for value in values:
            _strict_number(value, "sim3 rotation value")
    for value in translation:
        _strict_number(value, "sim3 translation value")
    if sim3 != _sim3_document(result.alignment):
        _publication_invalid("manifest Sim(3) disagrees with the result")

    shape = _strict_mapping(
        document["trajectoryShapeChange"],
        frozenset(
            {
                "shapeChangeRmseMeters",
                "rawKeyframeRmsRadiusMeters",
                "trajectoryShapeChangePercent",
                "meanKeyframeDisplacementPercent",
                "maxKeyframeDisplacementMeters",
                "certificationRole",
            }
        ),
        "refine manifest trajectory shape",
    )
    if (
        type(result.trajectory_shape_change) is not TrajectoryShapeChangeMetrics
        or any(
            not _is_finite_number(value)
            for value in (
                result.trajectory_shape_change.shape_change_rmse_m,
                result.trajectory_shape_change.raw_keyframe_rms_radius_m,
                result.trajectory_shape_change.trajectory_shape_change_pct,
                result.trajectory_shape_change.mean_keyframe_displacement_pct,
                result.trajectory_shape_change.max_keyframe_displacement_m,
            )
        )
        or type(result.trajectory_shape_change.certification_role) is not str
    ):
        _publication_invalid("result trajectory shape has the wrong contract type")
    for key, value in shape.items():
        if key == "certificationRole":
            _strict_string(value, "trajectory shape certificationRole")
        else:
            _strict_number(value, f"trajectory shape {key}")
    if shape != _shape_document(result.trajectory_shape_change):
        _publication_invalid("manifest trajectory shape disagrees with the result")

    evidence = _strict_mapping(
        document["refinementEvidence"],
        frozenset(
            {
                "refinementEvidenced",
                "absoluteAccuracyCertified",
                "verdictReason",
            }
        ),
        "refine manifest evidence",
    )
    if (
        type(result.evidence_verdict) is not RefinementEvidenceVerdict
        or type(result.evidence_verdict.refinement_evidenced) is not bool
        or type(result.evidence_verdict.absolute_accuracy_certified) is not bool
        or type(result.evidence_verdict.reason) is not str
    ):
        _publication_invalid("result evidence verdict has the wrong contract type")
    if (
        type(evidence["refinementEvidenced"]) is not bool
        or type(evidence["absoluteAccuracyCertified"]) is not bool
        or type(evidence["verdictReason"]) is not str
        or evidence["refinementEvidenced"]
        != result.evidence_verdict.refinement_evidenced
        or evidence["absoluteAccuracyCertified"]
        != result.evidence_verdict.absolute_accuracy_certified
        or evidence["verdictReason"] != result.evidence_verdict.reason
    ):
        _publication_invalid("manifest evidence disagrees with the result")

    telemetry = _strict_publication_telemetry(result.engine_telemetry)
    telemetry_document = _strict_mapping(
        document["engineTelemetry"],
        frozenset(
            {"durationMs", "iterations", "vramPeakMb", "commandCount", "metrics"}
        ),
        "refine manifest engineTelemetry",
    )
    for key in ("durationMs", "iterations", "vramPeakMb", "commandCount"):
        _strict_integer(telemetry_document[key], f"engineTelemetry.{key}")
    metric_rows = _strict_list(
        telemetry_document["metrics"],
        "engineTelemetry.metrics",
    )
    if len(metric_rows) > MAX_ENGINE_TELEMETRY_METRICS:
        _publication_invalid("manifest engine telemetry has too many metrics")
    for index, metric_value in enumerate(metric_rows):
        metric = _strict_mapping(
            metric_value,
            frozenset({"name", "value"}),
            f"engineTelemetry metric {index}",
        )
        _strict_string(metric["name"], "engineTelemetry metric name")
        _strict_json_scalar(metric["value"], "engineTelemetry metric value")
    if telemetry_document != _telemetry_document(telemetry):
        _publication_invalid("manifest telemetry disagrees with the result")

    if (
        type(result.engine_outputs) is not tuple
        or len(result.engine_outputs) != len(_REQUIRED_ENGINE_ARTIFACT_NAMES)
    ):
        _publication_invalid("result engine output set is incomplete")
    output_documents: list[dict[str, object]] = []
    output_names: set[str] = set()
    for reference in result.engine_outputs:
        validated = _strict_output_reference(reference)
        if validated.name in output_names:
            _publication_invalid("result engine output names are not unique")
        output_names.add(validated.name)
        output_documents.append(_engine_output_document(validated))
    if tuple(reference.name for reference in result.engine_outputs) != tuple(
        sorted(_REQUIRED_ENGINE_ARTIFACT_NAMES)
    ):
        _publication_invalid("result engine output order is not canonical")
    if output_names != _REQUIRED_ENGINE_ARTIFACT_NAMES:
        _publication_invalid("result engine output names are not the closed set")
    output_documents.sort(key=lambda row: str(row["name"]))
    engine_output_rows = _strict_list(
        document["engineOutputs"],
        "refine manifest engineOutputs",
    )
    for index, row_value in enumerate(engine_output_rows):
        row = _strict_mapping(
            row_value,
            frozenset(
                {
                    "name",
                    "relativePath",
                    "transportContentType",
                    "semanticMediaType",
                    "sha256",
                    "sizeBytes",
                }
            ),
            f"refine manifest engine output {index}",
        )
        _strict_string(row["name"], "engine output name")
        _strict_safe_relative_path(row["relativePath"], "engine output path")
        _strict_string(row["transportContentType"], "engine output transport type")
        _strict_string(row["semanticMediaType"], "engine output semantic type")
        _strict_sha256(row["sha256"], "engine output sha256")
        _strict_integer(row["sizeBytes"], "engine output size", minimum=1)
    if engine_output_rows != output_documents:
        _publication_invalid("manifest engine outputs disagree with the result")

    artifact_names = _REQUIRED_ENGINE_ARTIFACT_NAMES | _RUNNER_ARTIFACT_NAMES
    artifacts = result.files[:-1]
    artifact_documents: list[dict[str, object]] = []
    artifact_by_name: dict[str, RefineArtifact] = {}
    for artifact in artifacts:
        if type(artifact) not in (RefineFileArtifact, RefineInlineArtifact):
            _publication_invalid("result artifact has the wrong contract type")
        if type(artifact.name) is not str or artifact.name in artifact_by_name:
            _publication_invalid("result artifact name is invalid or duplicated")
        _strict_sha256(artifact.sha256, "result artifact sha256")
        _strict_integer(artifact.size_bytes, "result artifact size", minimum=1)
        if (
            type(artifact.transport_content_type) is not str
            or type(artifact.semantic_media_type) is not str
        ):
            _publication_invalid("result artifact media types must be exact strings")
        artifact_by_name[artifact.name] = artifact
        artifact_documents.append(_artifact_row(artifact))
    if tuple(artifact_by_name) != tuple(sorted(artifact_names)):
        _publication_invalid("result artifact order or names are not canonical")
    for reference in result.engine_outputs:
        artifact = artifact_by_name.get(reference.name)
        if (
            type(artifact) is not RefineFileArtifact
            or artifact.sha256 != reference.sha256
            or artifact.size_bytes != reference.size_bytes
            or artifact.transport_content_type != reference.transport_content_type
            or artifact.semantic_media_type != reference.semantic_media_type
        ):
            _publication_invalid("result engine output does not bind to its artifact")
    artifact_rows = _strict_list(document["artifacts"], "refine manifest artifacts")
    for index, row_value in enumerate(artifact_rows):
        row = _strict_mapping(
            row_value,
            frozenset(
                {
                    "name",
                    "transportContentType",
                    "semanticMediaType",
                    "sha256",
                    "sizeBytes",
                }
            ),
            f"refine manifest artifact {index}",
        )
        _strict_string(row["name"], "artifact name")
        _strict_string(row["transportContentType"], "artifact transport type")
        _strict_string(row["semanticMediaType"], "artifact semantic type")
        _strict_sha256(row["sha256"], "artifact sha256")
        _strict_integer(row["sizeBytes"], "artifact size", minimum=1)
    if artifact_rows != artifact_documents:
        _publication_invalid("manifest artifacts disagree with the result")


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
            expected_outputs=candidate.outputs,
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
            frame_rows.append(_frame_input_document(frame))
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
            "engineTelemetry": _telemetry_document(candidate.telemetry),
            "engineOutputs": [
                _engine_output_document(reference) for reference in candidate.outputs
            ],
            "artifacts": artifact_rows,
        }
        manifest = _inline_json(
            REFINE_MANIFEST_NAME,
            manifest_document,
            deadline=deadline,
        )
        _require_engine_budget(deadline)
        result = RefineRunResult(
            selected_engine=selected_engine,
            fallback_policy=self._fallback_policy,
            fallback_trigger=fallback_trigger,
            alignment=alignment,
            evidence_verdict=evidence_verdict,
            trajectory_shape_change=shape,
            room_file_id=prepared.room_file_id,
            inputs=prepared.inputs,
            frame_inputs=prepared.frames,
            engine_outputs=candidate.outputs,
            engine_telemetry=candidate.telemetry,
            manifest_key=manifest_key,
            manifest_sha256=manifest.sha256,
            files=(*artifacts, manifest),
        )
        validate_refine_result_for_publication(result)
        _require_engine_budget(deadline)
        return result
