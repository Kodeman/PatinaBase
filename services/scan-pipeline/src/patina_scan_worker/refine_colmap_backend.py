"""Disabled, lower-level COLMAP 4.0.2 Refine composition contract.

This module deliberately does *not* register ``scan_pipeline.refine`` and is
not a :class:`~patina_scan_worker.refine_runner.RefineExecutionBackend` yet.
It closes only the reviewable seams that must exist before that composition is
safe:

* a bounded immutable archive-chunk packet contract for the existing native
  descriptor boundary (never one descriptor per frame and never a
  ``/proc/self/fd`` image tree);
* canonical COLMAP engine-image identity and the exact I87 primary operation
  plan;
* geometry-only measurement rows for the separate evidence builder; and
* a COLMAP CLI runner whose child inherits the already-isolated native process
  group instead of escaping it with ``start_new_session=True``.

Production remains fail-closed.  In particular, the native boundary has no
output-descriptor channel, the runner still reopens display paths, aligned
model artifact construction is circular with the current runner seam, and the
position-prior fallback was not qualified by I90.  Those facts are executable
flags below, not optimistic documentation.
"""

from __future__ import annotations

import hashlib
import json
import math
import os
import re
import stat
from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from pathlib import Path, PurePosixPath
from typing import Any

from .refine_adapter import (
    MAX_SPATIAL_NEIGHBORS,
    MIN_CONNECTED_FRACTION,
    MIN_VERIFIED_INLIERS,
    SPATIAL_MIN_BASELINE_M,
    SPATIAL_RADIUS_M,
    TEMPORAL_WINDOW,
    AdapterError,
)
from .refine_colmap_command import (
    run_inherited_colmap_command as _run_inherited_colmap_command,
)
from .refine_evidence_builder import (
    RAW_BASELINE_KIND,
    REFINED_MODEL_KIND,
)
from .refine_native_process import (
    NATIVE_CHILD_MAX_PINNED_FILE_BYTES,
    NATIVE_CHILD_MAX_PINNED_FILES,
    NATIVE_CHILD_MAX_PINNED_TOTAL_BYTES,
    NativeChildContext,
    native_engine_entrypoint,
)

PACKET_SCHEMA_VERSION = 1
PACKET_CONTRACT = "patina-refine-colmap-input-packet-v1"
ENGINE_REQUEST_SCHEMA_VERSION = 1
ENGINE_REQUEST_CONTRACT = "patina-refine-colmap-engine-request-v1"
TARGET_COLMAP_VERSION = "4.0.2"
COLMAP_PACKET_MANIFEST_MAX_BYTES = 2 * 1024 * 1024
COLMAP_ENGINE_REQUEST_MAX_BYTES = 4 * 1024 * 1024
PRODUCTION_ENABLEMENT = "disabled-uncomposed"
PILOT_200_400_FRAME_RANGE_QUALIFIED = False
OUTPUT_DESCRIPTOR_HANDOFF_QUALIFIED = False
RUNNER_PATH_REOPEN_COMPOSITION_QUALIFIED = False
PACKET_EXTRACTION_QUALIFIED = False
ALIGNED_MODEL_BUILD_QUALIFIED = False
MEASUREMENT_SNAPSHOT_QUALIFIED = False
EVIDENCE_BUILDER_CONTRACT_COMPATIBLE = False
PRIMARY_EXECUTION_QUALIFIED = False
SEQUENTIAL_COMMAND_QUIESCENCE_QUALIFIED = False
COMMAND_EXCEPTION_NORMALIZATION_QUALIFIED = False
FALLBACK_QUALIFIED = False
_PACKET_INVALID = "REFINE_COLMAP_PACKET_INVALID"
_ENGINE_FAILED = "REFINE_ENGINE_FAILED"
_ENGINE_TIMEOUT = "REFINE_ENGINE_TIMEOUT"
_ENGINE_CLEANUP_FAILED = "REFINE_ENGINE_CLEANUP_FAILED"
_BACKEND_DISABLED = "REFINE_BACKEND_DISABLED"
_FALLBACK_UNQUALIFIED = "REFINE_FALLBACK_UNQUALIFIED"
_SHA256_PATTERN = re.compile(r"^[0-9a-f]{64}$")
_TOKEN_PATTERN = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$")
_RUN_ID_PATTERN = re.compile(r"^[0-9a-f]{64}$")
_ENGINE_NAME_PATTERN = re.compile(r"^frame_[0-9]{6}\.ppm$")
_GPU_INDEX_PATTERN = re.compile(r"^(?:0|[1-9][0-9]*)$")
_SOURCE_IMAGE_PATTERN = re.compile(
    r"^[A-Za-z0-9][A-Za-z0-9_.-]{0,119}\.[Hh][Ee][Ii][Cc]$"
)
_READ_BYTES = 1024 * 1024

# Stable public surface retained for existing disabled backend callers/tests.
run_inherited_colmap_command = _run_inherited_colmap_command


def _fail(message: str, code: str = _PACKET_INVALID) -> AdapterError:
    return AdapterError(message, code)


def _canonical_json_bytes(value: Any) -> bytes:
    try:
        return (
            json.dumps(
                value,
                sort_keys=True,
                separators=(",", ":"),
                ensure_ascii=True,
                allow_nan=False,
            )
            + "\n"
        ).encode("utf-8")
    except (TypeError, ValueError) as exc:
        raise _fail("COLMAP packet JSON is not canonicalizable") from exc


def _exact_int(value: object, label: str, *, minimum: int = 0) -> int:
    if type(value) is not int or value < minimum:
        raise _fail(f"{label} must be an integer >= {minimum}")
    return value


def _finite_float(value: object, label: str) -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise _fail(f"{label} must be a finite number")
    try:
        result = float(value)
    except (OverflowError, TypeError, ValueError) as exc:
        raise _fail(f"{label} must be a finite number") from exc
    if not math.isfinite(result):
        raise _fail(f"{label} must be a finite number")
    return result


def _sha256(value: object, label: str) -> str:
    if type(value) is not str or _SHA256_PATTERN.fullmatch(value) is None:
        raise _fail(f"{label} must be a lowercase SHA-256")
    return value


def _token(value: object, label: str) -> str:
    if type(value) is not str or _TOKEN_PATTERN.fullmatch(value) is None:
        raise _fail(f"{label} is not a canonical pinned-file token")
    return value


def _canonical_relative_path(value: object, label: str) -> str:
    if type(value) is not str or not value or "\\" in value:
        raise _fail(f"{label} must be a non-empty POSIX relative path")
    path = PurePosixPath(value)
    if (
        path.is_absolute()
        or value != path.as_posix()
        or any(part in ("", ".", "..") for part in path.parts)
        or any(character.isspace() for character in value)
    ):
        raise _fail(f"{label} is not a canonical safe relative path")
    return value


def _read_exact_descriptor(
    descriptor: int,
    *,
    expected_size: int,
    expected_sha256: str,
    maximum_size: int,
    label: str,
) -> bytes:
    if expected_size > maximum_size:
        raise _fail(f"{label} exceeds its bounded descriptor size")
    try:
        metadata = os.fstat(descriptor)
    except OSError as exc:
        raise _fail(f"cannot inspect {label}") from exc
    if not stat.S_ISREG(metadata.st_mode) or metadata.st_size != expected_size:
        raise _fail(f"{label} descriptor identity or size changed")
    payload = bytearray()
    digest = hashlib.sha256()
    offset = 0
    while offset < expected_size:
        try:
            block = os.pread(
                descriptor,
                min(_READ_BYTES, expected_size - offset),
                offset,
            )
        except OSError as exc:
            raise _fail(f"cannot read {label}") from exc
        if not block:
            raise _fail(f"{label} ended before its declared size")
        payload.extend(block)
        digest.update(block)
        offset += len(block)
    if digest.hexdigest() != expected_sha256:
        raise _fail(f"{label} SHA-256 does not match its manifest")
    return bytes(payload)


def _verify_exact_descriptor(
    descriptor: int,
    *,
    expected_size: int,
    expected_sha256: str,
    maximum_size: int,
    label: str,
) -> None:
    """Hash one descriptor with ``pread`` and bounded memory."""

    if expected_size > maximum_size:
        raise _fail(f"{label} exceeds its bounded descriptor size")
    try:
        metadata = os.fstat(descriptor)
    except OSError as exc:
        raise _fail(f"cannot inspect {label}") from exc
    if not stat.S_ISREG(metadata.st_mode) or metadata.st_size != expected_size:
        raise _fail(f"{label} descriptor identity or size changed")
    digest = hashlib.sha256()
    offset = 0
    while offset < expected_size:
        try:
            block = os.pread(
                descriptor,
                min(_READ_BYTES, expected_size - offset),
                offset,
            )
        except OSError as exc:
            raise _fail(f"cannot read {label}") from exc
        if not block:
            raise _fail(f"{label} ended before its declared size")
        digest.update(block)
        offset += len(block)
    if digest.hexdigest() != expected_sha256:
        raise _fail(f"{label} SHA-256 does not match its manifest")


@dataclass(frozen=True)
class ColmapPacketChunk:
    token: str
    sha256: str
    size_bytes: int


@dataclass(frozen=True)
class ColmapPacketMember:
    relative_path: str
    chunk_token: str
    archive_member: str
    sha256: str
    size_bytes: int
    role: str


@dataclass(frozen=True)
class ColmapPacketManifest:
    manifest_token: str
    manifest_sha256: str
    request_member: str
    chunks: tuple[ColmapPacketChunk, ...]
    members: tuple[ColmapPacketMember, ...]

    @property
    def member_by_path(self) -> Mapping[str, ColmapPacketMember]:
        return {member.relative_path: member for member in self.members}


def load_colmap_packet_manifest(
    request: Mapping[str, Any],
    context: NativeChildContext,
) -> ColmapPacketManifest:
    """Validate the canonical packet ledger without changing shared FD offsets.

    Frame metadata is itself a declared packet member.  The native JSON request
    therefore carries only the manifest token/hash and one collision-resistant
    run identifier; it never attempts to squeeze 200--400 frame rows through
    the 64 KiB native request envelope.
    """

    if type(request) is not dict:
        raise _fail("COLMAP native request must be an exact JSON object")
    if set(request) != {
        "schemaVersion",
        "contract",
        "manifestToken",
        "manifestSha256",
        "runId",
        "fallbackPolicy",
    }:
        raise _fail("COLMAP native request has an unknown or missing field")
    if (
        type(request["schemaVersion"]) is not int
        or request["schemaVersion"] != PACKET_SCHEMA_VERSION
    ):
        raise _fail("COLMAP native request schema version is unsupported")
    if request["contract"] != PACKET_CONTRACT:
        raise _fail("COLMAP native request contract is unsupported")
    manifest_token = _token(request["manifestToken"], "manifestToken")
    manifest_sha256 = _sha256(request["manifestSha256"], "manifestSha256")
    if (
        type(request["runId"]) is not str
        or _RUN_ID_PATTERN.fullmatch(request["runId"]) is None
    ):
        raise _fail("COLMAP native request runId must be 64 lowercase hex characters")
    if request["fallbackPolicy"] != "primary-only":
        raise _fail(
            "COLMAP position-prior fallback is not I90-qualified",
            _FALLBACK_UNQUALIFIED,
        )
    descriptor = context.pinned_file_descriptor(manifest_token)
    try:
        metadata = os.fstat(descriptor)
    except OSError as exc:
        raise _fail("cannot inspect COLMAP packet manifest descriptor") from exc
    manifest_payload = _read_exact_descriptor(
        descriptor,
        expected_size=metadata.st_size,
        expected_sha256=manifest_sha256,
        maximum_size=COLMAP_PACKET_MANIFEST_MAX_BYTES,
        label="COLMAP packet manifest",
    )
    try:
        document = json.loads(manifest_payload)
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise _fail("COLMAP packet manifest is not valid UTF-8 JSON") from exc
    if type(document) is not dict or manifest_payload != _canonical_json_bytes(
        document
    ):
        raise _fail("COLMAP packet manifest is not canonical JSON")
    if set(document) != {
        "schemaVersion",
        "contract",
        "requestMember",
        "chunks",
        "members",
    }:
        raise _fail("COLMAP packet manifest has an unknown or missing field")
    if (
        type(document["schemaVersion"]) is not int
        or document["schemaVersion"] != PACKET_SCHEMA_VERSION
        or document["contract"] != PACKET_CONTRACT
    ):
        raise _fail("COLMAP packet manifest contract is unsupported")
    request_member = _canonical_relative_path(
        document["requestMember"],
        "requestMember",
    )
    chunk_values = document["chunks"]
    member_values = document["members"]
    if type(chunk_values) is not list or not chunk_values:
        raise _fail("COLMAP packet manifest needs at least one archive chunk")
    if len(chunk_values) + 1 > NATIVE_CHILD_MAX_PINNED_FILES:
        raise _fail("COLMAP packet exceeds the native pinned-file count")
    if type(member_values) is not list or not member_values:
        raise _fail("COLMAP packet manifest needs declared members")

    chunks: list[ColmapPacketChunk] = []
    chunk_tokens: set[str] = set()
    aggregate_bytes = metadata.st_size
    for index, value in enumerate(chunk_values):
        if type(value) is not dict or set(value) != {
            "token",
            "sha256",
            "sizeBytes",
        }:
            raise _fail(f"COLMAP packet chunk {index} has an invalid shape")
        token = _token(value["token"], f"chunks[{index}].token")
        sha256 = _sha256(value["sha256"], f"chunks[{index}].sha256")
        size_bytes = _exact_int(
            value["sizeBytes"],
            f"chunks[{index}].sizeBytes",
            minimum=1,
        )
        if token == manifest_token or token in chunk_tokens:
            raise _fail("COLMAP packet has a duplicate pinned-file token")
        if size_bytes > NATIVE_CHILD_MAX_PINNED_FILE_BYTES:
            raise _fail("COLMAP packet archive chunk exceeds 128 MiB")
        chunk_descriptor = context.pinned_file_descriptor(token)
        _verify_exact_descriptor(
            chunk_descriptor,
            expected_size=size_bytes,
            expected_sha256=sha256,
            maximum_size=NATIVE_CHILD_MAX_PINNED_FILE_BYTES,
            label=f"COLMAP packet archive chunk {index}",
        )
        chunks.append(ColmapPacketChunk(token, sha256, size_bytes))
        chunk_tokens.add(token)
        aggregate_bytes += size_bytes
    if aggregate_bytes > NATIVE_CHILD_MAX_PINNED_TOTAL_BYTES:
        raise _fail("COLMAP packet exceeds the native aggregate byte ceiling")
    if set(context.pinned_file_tokens) != {manifest_token, *chunk_tokens}:
        raise _fail("COLMAP packet pinned token set does not exactly match its ledger")

    members: list[ColmapPacketMember] = []
    member_paths: set[str] = set()
    archive_keys: set[tuple[str, str]] = set()
    allowed_roles = {
        "engine-request",
        "engine-image",
        "source-ledger",
        "adapter-ledger",
    }
    for index, value in enumerate(member_values):
        if type(value) is not dict or set(value) != {
            "relativePath",
            "chunkToken",
            "archiveMember",
            "sha256",
            "sizeBytes",
            "role",
        }:
            raise _fail(f"COLMAP packet member {index} has an invalid shape")
        relative_path = _canonical_relative_path(
            value["relativePath"],
            f"members[{index}].relativePath",
        )
        chunk_token = _token(
            value["chunkToken"],
            f"members[{index}].chunkToken",
        )
        archive_member = _canonical_relative_path(
            value["archiveMember"],
            f"members[{index}].archiveMember",
        )
        sha256 = _sha256(value["sha256"], f"members[{index}].sha256")
        size_bytes = _exact_int(
            value["sizeBytes"],
            f"members[{index}].sizeBytes",
            minimum=1,
        )
        role = value["role"]
        if type(role) is not str or role not in allowed_roles:
            raise _fail(f"COLMAP packet member {index} has an unsupported role")
        archive_key = (chunk_token, archive_member)
        if (
            chunk_token not in chunk_tokens
            or relative_path in member_paths
            or archive_key in archive_keys
        ):
            raise _fail("COLMAP packet has an unknown chunk or duplicate member")
        members.append(
            ColmapPacketMember(
                relative_path,
                chunk_token,
                archive_member,
                sha256,
                size_bytes,
                role,
            )
        )
        member_paths.add(relative_path)
        archive_keys.add(archive_key)
    if request_member not in member_paths:
        raise _fail("COLMAP packet requestMember is not declared")
    request_row = next(row for row in members if row.relative_path == request_member)
    if request_row.role != "engine-request":
        raise _fail("COLMAP packet requestMember has the wrong role")
    if sum(row.role == "engine-request" for row in members) != 1:
        raise _fail("COLMAP packet must contain exactly one engine request member")
    chunk_sizes = {chunk.token: chunk.size_bytes for chunk in chunks}
    for chunk_token, chunk_size in chunk_sizes.items():
        declared_member_bytes = sum(
            member.size_bytes for member in members if member.chunk_token == chunk_token
        )
        if declared_member_bytes > chunk_size:
            raise _fail("COLMAP packet members cannot fit in their declared chunk")
    return ColmapPacketManifest(
        manifest_token,
        manifest_sha256,
        request_member,
        tuple(chunks),
        tuple(members),
    )


@dataclass(frozen=True)
class ColmapEngineFrame:
    ordinal: int
    source_image_name: str
    frame_timestamp_s: float
    engine_image_name: str
    engine_relative_path: str
    engine_sha256: str
    engine_size_bytes: int
    intrinsics: tuple[float, float, float, float, int, int]
    cam_from_world_rotation: tuple[tuple[float, float, float], ...]
    cam_from_world_translation: tuple[float, float, float]
    raw_camera_center_m: tuple[float, float, float]


@dataclass(frozen=True)
class ColmapEngineRequest:
    frames: tuple[ColmapEngineFrame, ...]
    gpu_index: str


def parse_engine_request_member(
    payload: bytes,
    manifest: ColmapPacketManifest,
) -> ColmapEngineRequest:
    """Validate bytes against a manifest member, without claiming extraction.

    The caller-supplied bytes are hash/size-bound here, but this disabled packet
    does not yet extract them from the chunk descriptor.  Production remains
    blocked by ``PACKET_EXTRACTION_QUALIFIED = False``.
    """

    request_member = manifest.member_by_path[manifest.request_member]
    if (
        len(payload) > COLMAP_ENGINE_REQUEST_MAX_BYTES
        or request_member.size_bytes > COLMAP_ENGINE_REQUEST_MAX_BYTES
        or len(payload) != request_member.size_bytes
        or hashlib.sha256(payload).hexdigest() != request_member.sha256
    ):
        raise _fail("COLMAP engine request payload does not match its packet member")
    try:
        document = json.loads(payload)
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise _fail("COLMAP engine request member is not valid UTF-8 JSON") from exc
    if type(document) is not dict or payload != _canonical_json_bytes(document):
        raise _fail("COLMAP engine request member is not canonical JSON")
    if set(document) != {
        "schemaVersion",
        "contract",
        "targetColmapVersion",
        "gpuIndex",
        "frames",
    }:
        raise _fail("COLMAP engine request member has an unknown or missing field")
    if (
        type(document["schemaVersion"]) is not int
        or document["schemaVersion"] != ENGINE_REQUEST_SCHEMA_VERSION
        or document["contract"] != ENGINE_REQUEST_CONTRACT
        or document["targetColmapVersion"] != TARGET_COLMAP_VERSION
    ):
        raise _fail("COLMAP engine request member contract is unsupported")
    gpu_index = document["gpuIndex"]
    if type(gpu_index) is not str or _GPU_INDEX_PATTERN.fullmatch(gpu_index) is None:
        raise _fail("COLMAP engine request gpuIndex must be a decimal device index")
    values = document["frames"]
    if type(values) is not list or len(values) < 3 or len(values) > 400:
        raise _fail("COLMAP engine request needs 3 through 400 frames")
    declared_members = manifest.member_by_path
    frames: list[ColmapEngineFrame] = []
    names: set[str] = set()
    paths: set[str] = set()
    for index, value in enumerate(values):
        expected = {
            "ordinal",
            "sourceImageName",
            "frameTimestampSeconds",
            "engineImageName",
            "engineRelativePath",
            "engineSha256",
            "engineSizeBytes",
            "intrinsics",
            "camFromWorld",
            "rawCameraCenterMeters",
        }
        if type(value) is not dict or set(value) != expected:
            raise _fail(f"COLMAP engine frame {index} has an invalid shape")
        ordinal = _exact_int(value["ordinal"], f"frames[{index}].ordinal")
        if ordinal != index:
            raise _fail("COLMAP engine frame ordinals must be dense and ordered")
        source_name = value["sourceImageName"]
        if (
            type(source_name) is not str
            or _SOURCE_IMAGE_PATTERN.fullmatch(source_name) is None
            or ".." in source_name
        ):
            raise _fail("COLMAP source image identity must be a safe HEIC basename")
        timestamp_s = _finite_float(
            value["frameTimestampSeconds"],
            f"frames[{index}].frameTimestampSeconds",
        )
        if timestamp_s < 0:
            raise _fail("COLMAP frame timestamp must be non-negative")
        name = value["engineImageName"]
        expected_name = f"frame_{index:06d}.ppm"
        if (
            type(name) is not str
            or _ENGINE_NAME_PATTERN.fullmatch(name) is None
            or name != expected_name
        ):
            raise _fail("COLMAP engine image identity must be a canonical PPM name")
        relative_path = _canonical_relative_path(
            value["engineRelativePath"],
            f"frames[{index}].engineRelativePath",
        )
        if relative_path != f"images/{name}":
            raise _fail("COLMAP engine path must be the canonical images/<engine-name>")
        member = declared_members.get(relative_path)
        size_bytes = _exact_int(
            value["engineSizeBytes"],
            f"frames[{index}].engineSizeBytes",
            minimum=1,
        )
        sha256 = _sha256(value["engineSha256"], f"frames[{index}].engineSha256")
        if (
            member is None
            or member.role != "engine-image"
            or member.sha256 != sha256
            or member.size_bytes != size_bytes
        ):
            raise _fail("COLMAP engine frame is not bound to its packet member")
        if name in names or relative_path in paths:
            raise _fail("COLMAP engine image names and paths must be unique")
        intrinsics = value["intrinsics"]
        if type(intrinsics) is not dict or set(intrinsics) != {
            "fx",
            "fy",
            "cx",
            "cy",
            "width",
            "height",
        }:
            raise _fail("COLMAP engine intrinsics have an invalid shape")
        intrinsics_row = (
            _finite_float(intrinsics["fx"], "intrinsics.fx"),
            _finite_float(intrinsics["fy"], "intrinsics.fy"),
            _finite_float(intrinsics["cx"], "intrinsics.cx"),
            _finite_float(intrinsics["cy"], "intrinsics.cy"),
            _exact_int(intrinsics["width"], "intrinsics.width", minimum=1),
            _exact_int(intrinsics["height"], "intrinsics.height", minimum=1),
        )
        if intrinsics_row[0] <= 0 or intrinsics_row[1] <= 0:
            raise _fail("COLMAP engine focal lengths must be positive")
        pose = value["camFromWorld"]
        if type(pose) is not dict or set(pose) != {"rotation", "translation"}:
            raise _fail("COLMAP engine pose has an invalid shape")
        rotation_value = pose["rotation"]
        translation_value = pose["translation"]
        center_value = value["rawCameraCenterMeters"]
        if (
            type(rotation_value) is not list
            or len(rotation_value) != 3
            or any(type(row) is not list or len(row) != 3 for row in rotation_value)
            or type(translation_value) is not list
            or len(translation_value) != 3
            or type(center_value) is not list
            or len(center_value) != 3
        ):
            raise _fail("COLMAP engine pose must contain exact 3x3/3-vector values")
        rotation = tuple(
            tuple(
                _finite_float(component, "camFromWorld.rotation") for component in row
            )
            for row in rotation_value
        )
        translation = tuple(
            _finite_float(component, "camFromWorld.translation")
            for component in translation_value
        )
        center = tuple(
            _finite_float(component, "rawCameraCenterMeters")
            for component in center_value
        )
        for row_index in range(3):
            for column_index in range(3):
                dot = sum(
                    rotation[row_index][axis] * rotation[column_index][axis]
                    for axis in range(3)
                )
                expected_dot = 1.0 if row_index == column_index else 0.0
                if abs(dot - expected_dot) > 1e-6:
                    raise _fail(
                        "COLMAP engine camFromWorld rotation must be orthonormal"
                    )
        determinant = (
            rotation[0][0]
            * (rotation[1][1] * rotation[2][2] - rotation[1][2] * rotation[2][1])
            - rotation[0][1]
            * (rotation[1][0] * rotation[2][2] - rotation[1][2] * rotation[2][0])
            + rotation[0][2]
            * (rotation[1][0] * rotation[2][1] - rotation[1][1] * rotation[2][0])
        )
        if abs(determinant - 1.0) > 1e-6:
            raise _fail(
                "COLMAP engine camFromWorld rotation must be proper right-handed"
            )
        expected_center = tuple(
            -sum(rotation[row][axis] * translation[row] for row in range(3))
            for axis in range(3)
        )
        if any(abs(expected_center[axis] - center[axis]) > 1e-6 for axis in range(3)):
            raise _fail("rawCameraCenterMeters must equal -R^T t for camFromWorld")
        frames.append(
            ColmapEngineFrame(
                ordinal,
                source_name,
                timestamp_s,
                name,
                relative_path,
                sha256,
                size_bytes,
                intrinsics_row,
                rotation,
                translation,
                center,
            )
        )
        names.add(name)
        paths.add(relative_path)
    physical_order = tuple(
        (frame.frame_timestamp_s, frame.source_image_name) for frame in frames
    )
    if physical_order != tuple(sorted(physical_order)):
        raise _fail(
            "COLMAP physical frame rows must be sorted by timestamp and source name"
        )
    if len({frame.source_image_name for frame in frames}) != len(frames):
        raise _fail("COLMAP source image identities must be unique")
    engine_member_paths = {
        member.relative_path
        for member in manifest.members
        if member.role == "engine-image"
    }
    if engine_member_paths != paths:
        raise _fail(
            "COLMAP packet engine-image members must exactly match the frame universe"
        )
    return ColmapEngineRequest(tuple(frames), gpu_index)


def build_engine_pair_graph(
    frames: Sequence[ColmapEngineFrame],
) -> tuple[tuple[str, str], ...]:
    """Build I87 pairs on geometry/order but emit only canonical PPM identities."""

    pairs: set[tuple[str, str]] = set()
    ordered = tuple(frames)
    for left, frame in enumerate(ordered):
        for right in range(left + 1, min(len(ordered), left + TEMPORAL_WINDOW + 1)):
            pairs.add(
                tuple(
                    sorted((frame.engine_image_name, ordered[right].engine_image_name))
                )
            )
        spatial: list[tuple[float, str, int]] = []
        for right, candidate in enumerate(ordered):
            if right == left or abs(right - left) <= TEMPORAL_WINDOW:
                continue
            distance = math.dist(
                frame.raw_camera_center_m, candidate.raw_camera_center_m
            )
            if SPATIAL_MIN_BASELINE_M <= distance <= SPATIAL_RADIUS_M:
                spatial.append((distance, candidate.engine_image_name, right))
        for _, _, right in sorted(spatial)[:MAX_SPATIAL_NEIGHBORS]:
            pairs.add(
                tuple(
                    sorted(
                        (
                            frame.engine_image_name,
                            ordered[right].engine_image_name,
                        )
                    )
                )
            )
    return tuple(sorted(pairs))


@dataclass(frozen=True)
class ColmapLogicalOperation:
    operation: str
    options: tuple[tuple[str, bool | int | float | str], ...]


def build_primary_operation_plan(
    request: ColmapEngineRequest,
) -> tuple[ColmapLogicalOperation, ...]:
    pairs = build_engine_pair_graph(request.frames)
    pair_payload = "".join(f"{first} {second}\n" for first, second in pairs).encode()
    return (
        ColmapLogicalOperation(
            "pycolmap.extract_features",
            (
                ("cameraMode", "PER_IMAGE"),
                ("gpuIndex", request.gpu_index),
                ("randomSeed", 0),
                ("useGpu", True),
            ),
        ),
        ColmapLogicalOperation(
            "pycolmap.rewrite_camera_rows",
            (
                ("hasPriorFocalLength", True),
                ("model", "PINHOLE"),
                ("preserveDatabaseIds", True),
            ),
        ),
        ColmapLogicalOperation(
            "pycolmap.match_image_pairs",
            (
                ("geometricVerification", True),
                ("guidedMatching", True),
                ("gpuIndex", request.gpu_index),
                ("minimumVerifiedInliers", MIN_VERIFIED_INLIERS),
                ("pairCount", len(pairs)),
                ("pairsSha256", hashlib.sha256(pair_payload).hexdigest()),
                ("randomSeed", 0),
                ("computeRelativePose", True),
                ("useGpu", True),
            ),
        ),
        ColmapLogicalOperation(
            "policy.classify_post_match_overlap",
            (
                ("minimumConnectedFraction", MIN_CONNECTED_FRACTION),
                ("minimumVerifiedInliers", MIN_VERIFIED_INLIERS),
                ("requireVerifiedNonTemporalLoop", True),
            ),
        ),
        ColmapLogicalOperation(
            "pycolmap.build_known_pose_seed",
            (
                ("fullCamFromWorld", True),
                ("preserveDatabaseImageCameraIds", True),
                ("requireExactIntrinsics", True),
                ("requireExactNames", True),
                ("registeredImageCount", len(request.frames)),
                ("seedPointCount", 0),
                ("trivialRigsAndFrames", True),
            ),
        ),
        ColmapLogicalOperation(
            "colmap.point_triangulator",
            (("clearPoints", True), ("refineIntrinsics", False), ("randomSeed", 0)),
        ),
        ColmapLogicalOperation(
            "pycolmap.inspect_triangulated_model",
            (
                ("minimumPointCount", 1),
                ("registeredImageCount", len(request.frames)),
                ("requireExactImageCameraIdsNamesIntrinsics", True),
                ("requireValidModel", True),
            ),
        ),
        ColmapLogicalOperation(
            "snapshot.fixed_track_raw_arkit_baseline",
            (("kind", RAW_BASELINE_KIND),),
        ),
        ColmapLogicalOperation(
            "pycolmap.create_default_bundle_adjuster",
            (
                ("allRegisteredImagesInConfig", True),
                ("gauge", "TWO_CAMS_FROM_WORLD"),
                ("refineExtraParams", False),
                ("refineFocalLength", False),
                ("refinePrincipalPoint", False),
                ("requireModelWritten", True),
                ("requirePositiveResidualCount", True),
                ("requireUsableSolution", True),
            ),
        ),
        ColmapLogicalOperation(
            "pycolmap.inspect_adjusted_model",
            (
                ("minimumPointCount", 1),
                ("registeredImageCount", len(request.frames)),
                ("requireExactImageCameraIdsNamesIntrinsics", True),
                ("requireValidModel", True),
            ),
        ),
        ColmapLogicalOperation(
            "sim3.align_centers_points_orientations",
            (("positiveScale", True),),
        ),
        ColmapLogicalOperation(
            "snapshot.fixed_track_geometry",
            (("kind", REFINED_MODEL_KIND),),
        ),
    )


def primary_point_triangulator_argv(
    *,
    colmap: Path,
    database_path: Path,
    image_path: Path,
    seed_model_path: Path,
    triangulated_model_path: Path,
) -> tuple[str, ...]:
    """Return the exact I90-qualified CLI phase; all paths are child-owned."""

    return (
        str(colmap),
        "point_triangulator",
        "--database_path",
        str(database_path),
        "--image_path",
        str(image_path),
        "--input_path",
        str(seed_model_path),
        "--output_path",
        str(triangulated_model_path),
        "--clear_points",
        "1",
        "--refine_intrinsics",
        "0",
        "--Mapper.random_seed",
        "0",
    )


@dataclass(frozen=True)
class ColmapImageMembershipRow:
    ordinal: int
    engine_image_name: str
    image_id: int
    camera_id: int
    registered_before: bool
    registered_after: bool


@dataclass(frozen=True)
class ColmapFixedTrackObservationRow:
    engine_image_name: str
    point2d_index: int
    track_sha256: str
    observed_xy: tuple[float, float]
    raw_projected_xy: tuple[float, float]
    refined_projected_xy: tuple[float, float]


@dataclass(frozen=True)
class ColmapVerifiedLoopRow:
    first_engine_image_name: str
    second_engine_image_name: str
    inlier_index_pairs: tuple[tuple[int, int], ...]
    verified_relative_qvec: tuple[float, float, float, float]
    verified_translation_direction: tuple[float, float, float]
    raw_relative_qvec: tuple[float, float, float, float]
    raw_translation_direction: tuple[float, float, float]
    refined_relative_qvec: tuple[float, float, float, float]
    refined_translation_direction: tuple[float, float, float]


@dataclass(frozen=True)
class ColmapArtifactIdentityRow:
    role: str
    relative_path: str
    sha256: str
    size_bytes: int


@dataclass(frozen=True)
class ColmapPathProvenance:
    selected_engine: str
    fallback_trigger: str | None
    raw_baseline_kind: str
    refined_model_kind: str
    rotation_prior_represented: bool


@dataclass(frozen=True)
class ColmapBackendMeasurements:
    """Provisional schema-only rows, not the evidence-builder request contract.

    Completeness, depth/source grouping, packet extraction, and compatibility
    with the separate evidence builder are all explicitly unqualified.
    """

    images: tuple[ColmapImageMembershipRow, ...]
    artifacts: tuple[ColmapArtifactIdentityRow, ...]
    observations: tuple[ColmapFixedTrackObservationRow, ...]
    verified_loops: tuple[ColmapVerifiedLoopRow, ...]
    provenance: ColmapPathProvenance
    commands: tuple[ColmapLogicalOperation, ...]


class RefineColmapBackend:
    """Explicit disabled gate around the lower-level protocol in this packet."""

    production_enablement = PRODUCTION_ENABLEMENT
    pilot_frame_range_qualified = PILOT_200_400_FRAME_RANGE_QUALIFIED
    output_descriptor_handoff_qualified = OUTPUT_DESCRIPTOR_HANDOFF_QUALIFIED
    runner_path_reopen_composition_qualified = RUNNER_PATH_REOPEN_COMPOSITION_QUALIFIED
    packet_extraction_qualified = PACKET_EXTRACTION_QUALIFIED
    aligned_model_build_qualified = ALIGNED_MODEL_BUILD_QUALIFIED
    measurement_snapshot_qualified = MEASUREMENT_SNAPSHOT_QUALIFIED
    evidence_builder_contract_compatible = EVIDENCE_BUILDER_CONTRACT_COMPATIBLE
    primary_execution_qualified = PRIMARY_EXECUTION_QUALIFIED
    sequential_command_quiescence_qualified = SEQUENTIAL_COMMAND_QUIESCENCE_QUALIFIED
    command_exception_normalization_qualified = (
        COMMAND_EXCEPTION_NORMALIZATION_QUALIFIED
    )
    fallback_qualified = FALLBACK_QUALIFIED

    def run_primary(self, *_args: object, **_kwargs: object) -> None:
        raise _fail(
            "COLMAP backend is disabled until packet extraction, output descriptor "
            "handoff, aligned-model construction, and runner composition are qualified",
            _BACKEND_DISABLED,
        )

    def run_fallback(self, *_args: object, **_kwargs: object) -> None:
        raise _fail(
            "COLMAP position-prior fallback is not I90-qualified",
            _FALLBACK_UNQUALIFIED,
        )


@native_engine_entrypoint
def run_refine_colmap_native(
    _request: Mapping[str, Any],
    _context: NativeChildContext,
) -> None:
    """Fail closed until the explicitly listed composition blockers are closed."""

    raise _fail(
        "COLMAP native backend is disabled and uncomposed",
        _BACKEND_DISABLED,
    )
