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

import dataclasses
import hashlib
import json
import math
import os
import re
import stat
import time
from collections.abc import Callable, Mapping, Sequence
from dataclasses import dataclass
from pathlib import Path, PurePosixPath
from typing import Any

from .refine_adapter import (
    MAX_SPATIAL_NEIGHBORS,
    MIN_CONNECTED_FRACTION,
    MIN_VERIFIED_INLIERS,
    TEMPORAL_WINDOW,
    AdapterError,
    ColmapPose,
    PinholeIntrinsics,
    RefineDeadline,
    Sim3,
    estimate_sim3,
    loop_candidate_admitted,
)
from .refine_colmap_command import (
    run_inherited_colmap_command as _run_inherited_colmap_command,
)
from .refine_colmap_toolchain import (
    ColmapToolchain,
    load_qualified_colmap_toolchain,
    plan_leased_colmap_command,
)
from .refine_engine import (
    EngineImage,
    PycolmapBackend,
    PycolmapBackendConfig,
)
from .refine_evidence_builder import (
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
from .refine_model_alignment import (
    SPARSE_MODEL_CANONICAL_MEMBER_ORDER,
    SPARSE_MODEL_REQUIRED_MEMBERS,
    canonical_pose_digest,
    read_sparse_model_snapshot,
)
from .refine_native_process import (
    NATIVE_CHILD_MAX_PINNED_FILE_BYTES,
    NATIVE_CHILD_MAX_PINNED_FILES,
    NATIVE_CHILD_MAX_PINNED_TOTAL_BYTES,
    NATIVE_ENGINE_OUTPUT_TOKENS,
    NATIVE_WORKSPACE_COMMAND_SUBDIRECTORY,
    NATIVE_WORKSPACE_PACKET_SUBDIRECTORY,
    NATIVE_WORKSPACE_TEMP_SUBDIRECTORY,
    NativeChildContext,
    native_engine_entrypoint,
)
from .refine_packet_extractor import (
    COLMAP_PACKET_EXTRACTED_MAX_BYTES,
    COLMAP_PACKET_MEMBER_MAX_BYTES,
)
from .refine_packet_extractor import (
    ExtractedColmapPacket as _ExtractedColmapPacket,
)
from .refine_packet_extractor import (
    extract_colmap_packet as _extract_colmap_packet,
)

ExtractedColmapPacket = _ExtractedColmapPacket
extract_colmap_packet = _extract_colmap_packet

PACKET_SCHEMA_VERSION = 1
PACKET_CONTRACT = "patina-refine-colmap-input-packet-v1"
ENGINE_REQUEST_SCHEMA_VERSION = 1
ENGINE_REQUEST_CONTRACT = "patina-refine-colmap-engine-request-v1"
TARGET_COLMAP_VERSION = "4.0.2"
COLMAP_PACKET_MANIFEST_MAX_BYTES = 2 * 1024 * 1024
COLMAP_ENGINE_REQUEST_MAX_BYTES = 4 * 1024 * 1024
COLMAP_PACKET_MAX_MEMBERS = 403
COLMAP_PACKET_MIN_ENGINE_IMAGES = 3
COLMAP_PACKET_MAX_ENGINE_IMAGES = 400
#: Composed, and still not a registered worker stage.  ``DEFAULT_STAGES``
#: remains ``ingest,solve,drawings``; writing the body did not enable anything.
PRODUCTION_ENABLEMENT = "composed-unregistered"
#: R117.  No packet in the 200-400 band has ever been built, let alone run; the
#: subject that HAS run carries 49 frames.
PILOT_200_400_FRAME_RANGE_QUALIFIED = False
#: TRUE ON R121's HOST RUN.  Seven engine artifacts crossed the boundary as
#: parent-owned frozen copies; ``refine_lifecycle._require_parent_hashed
#: _artifacts`` compared the child's declared digest for each against the
#: PARENT's own hash of the copy it holds and agreed on all seven; the parent
#: then parsed three of them (seed, raw pre-BA, aligned) with its own reader.
#: The I96 docstring's "the native boundary has no output-descriptor channel"
#: was closed by I97 and is now exercised by real engine output.
OUTPUT_DESCRIPTOR_HANDOFF_QUALIFIED = True
#: STILL FALSE, and not for want of trying: the composed run reaches
#: ``RefineRunner`` and stops inside ``_validate_evidence``, which is UPSTREAM of
#: ``ComposedArtifactBuilder``.  So the seam that would prove the runner
#: publishes from parent-owned descriptors instead of reopening display paths
#: has not executed on a real engine's output even once.
RUNNER_PATH_REOPEN_COMPOSITION_QUALIFIED = False
#: TRUE ON R121's HOST RUN.  ``extract_colmap_packet`` ran inside the native
#: child over a real 4-chunk, 52-member packet (49 engine rasters at 1440x1920
#: plus the request and both ledgers) and COLMAP consumed the extracted files
#: directly -- 341_749 SIFT features off those 49 PPMs.  The extractor also
#: PROVED it validates rather than accepts: it refused the parent's own archives
#: until the writer's USTAR mode and device fields were corrected.
PACKET_EXTRACTION_QUALIFIED = True
#: TRUE ON R121's HOST RUN.  The child builds the aligned model and declares the
#: centres-only Sim(3) plus both pose digests; ``verify_child_alignment_proposal``
#: re-solved that similarity from the child's own raw and aligned archives with
#: an independent plain-``math`` Horn solve, agreed inside every pinned
#: tolerance, cleared all three gauge floors, and reproduced both digests.  The
#: I96 docstring's "aligned model artifact construction is circular with the
#: current runner seam" no longer describes this module.
ALIGNED_MODEL_BUILD_QUALIFIED = True
#: STILL FALSE, and the reason is that the schema is UNUSED rather than wrong.
#: The composed path measures evidence inside ``refine_evidence_builder`` from
#: complete model snapshots; the per-observation rows below are not what it
#: consumes, and an unexercised schema is not a qualified one.
MEASUREMENT_SNAPSHOT_QUALIFIED = False
#: TRUE ON R121's HOST RUN.  ``build_refinement_evidence`` was fed real frames,
#: real database keypoint tables, both complete track universes and one row per
#: candidate pair, and returned a ``RefinementEvidence`` that
#: ``refine_runner._validate_evidence`` accepted structurally and carried into
#: ``evaluate_refinement_evidence``.  The contract is compatible; what the
#: verdict SAID about this subject is a separate fact and is not this flag.
EVIDENCE_BUILDER_CONTRACT_COMPATIBLE = True
#: STILL FALSE.  The plan executed end to end on the qualified host and produced
#: a verified aligned model, and then the run was REFUSED --
#: ``REFINE_EVIDENCE_REGRESSION`` on loop rotation RMSE (4.915408 -> 4.930533
#: deg over four verified loop edges), while reprojection RMSE improved 2.015458
#: -> 1.351599 px.  No run has ever reached publication, so nothing has shown
#: this path producing an ACCEPTED refinement.  A path qualified only up to the
#: point where it is refused is not a qualified path.
PRIMARY_EXECUTION_QUALIFIED = False
#: STILL FALSE.  The I87 plan contains exactly ONE CLI phase
#: (``point_triangulator``), so a SEQUENCE of inherited commands has never run
#: and the supervisor's between-command quiescence proof has never been
#: exercised twice in one child.
SEQUENTIAL_COMMAND_QUIESCENCE_QUALIFIED = False
#: TRUE, and this one rests on a CONSTRUCTED test rather than the host run,
#: because what it names is not a host-only property: ``_guarded`` turns any
#: non-``AdapterError`` escaping a binding call into ``REFINE_ENGINE_FAILED``
#: with the operation named and the message flattened and truncated below the
#: child's 1 KiB error envelope, and passes an ``AdapterError`` through
#: untouched so its code survives.  The host run is what showed the gap was
#: real: an unguarded ``cam2_from_cam1`` returning ``None`` reached the operator
#: as a bare ``'NoneType' object has no attribute 'matrix'`` with no indication
#: of which engine call produced it.
COMMAND_EXCEPTION_NORMALIZATION_QUALIFIED = True
#: STILL FALSE.  I90 never qualified the position-prior mapper and this module
#: does not implement it; ``run_fallback`` refuses and the packet contract
#: refuses any ``fallbackPolicy`` other than ``primary-only``.
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
    except (RecursionError, TypeError, ValueError) as exc:
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
        or any(ord(character) < 0x20 or ord(character) == 0x7F for character in value)
    ):
        raise _fail(f"{label} is not a canonical safe relative path")
    try:
        encoded = value.encode("ascii")
    except UnicodeEncodeError as exc:
        raise _fail(f"{label} must use portable ASCII path components") from exc
    if len(encoded) > 1024 or any(
        len(part.encode("ascii")) > 255 for part in path.parts
    ):
        raise _fail(f"{label} exceeds the bounded portable path length")
    return value


def _canonical_ustar_member_name(value: object, label: str) -> str:
    name = _canonical_relative_path(value, label)
    encoded = name.encode("ascii")
    if len(encoded) <= 100:
        return name
    for separator in range(len(encoded) - 1, -1, -1):
        if encoded[separator : separator + 1] != b"/":
            continue
        prefix = encoded[:separator]
        leaf = encoded[separator + 1 :]
        if prefix and leaf and len(prefix) <= 155 and len(leaf) <= 100:
            return name
    raise _fail(f"{label} is not representable by canonical USTAR")


def _reject_file_path_collisions(
    values: Sequence[str],
    *,
    label: str,
) -> None:
    files = {tuple(PurePosixPath(value).parts) for value in values}
    for parts in files:
        for length in range(1, len(parts)):
            if parts[:length] in files:
                raise _fail(f"{label} contains a file/directory path collision")


def _read_exact_descriptor(
    descriptor: int,
    *,
    expected_size: int,
    expected_sha256: str,
    maximum_size: int,
    label: str,
    remaining_seconds: Callable[[], float] | None = None,
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
        if remaining_seconds is not None:
            remaining_seconds()
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
    remaining_seconds: Callable[[], float] | None = None,
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
        if remaining_seconds is not None:
            remaining_seconds()
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
    run_id: str
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
    run_id = request["runId"]
    if type(run_id) is not str or _RUN_ID_PATTERN.fullmatch(run_id) is None:
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
        remaining_seconds=context.remaining_seconds,
    )
    try:
        document = json.loads(manifest_payload)
    except (RecursionError, UnicodeDecodeError, ValueError) as exc:
        raise _fail("COLMAP packet manifest is not valid UTF-8 JSON") from exc
    if type(document) is not dict or manifest_payload != _canonical_json_bytes(
        document
    ):
        raise _fail("COLMAP packet manifest is not canonical JSON")
    if set(document) != {
        "schemaVersion",
        "contract",
        "runId",
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
    manifest_run_id = document["runId"]
    if (
        type(manifest_run_id) is not str
        or _RUN_ID_PATTERN.fullmatch(manifest_run_id) is None
        or manifest_run_id != run_id
    ):
        raise _fail("COLMAP packet manifest runId does not match its native request")
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
    if len(member_values) > COLMAP_PACKET_MAX_MEMBERS:
        raise _fail("COLMAP packet manifest exceeds its member-count ceiling")

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
            remaining_seconds=context.remaining_seconds,
        )
        chunks.append(ColmapPacketChunk(token, sha256, size_bytes))
        chunk_tokens.add(token)
        aggregate_bytes += size_bytes
    chunk_order = tuple(chunk.token for chunk in chunks)
    if chunk_order != tuple(sorted(chunk_order)):
        raise _fail("COLMAP packet chunks must use canonical token order")
    if aggregate_bytes > NATIVE_CHILD_MAX_PINNED_TOTAL_BYTES:
        raise _fail("COLMAP packet exceeds the native aggregate byte ceiling")
    expected_pinned_tokens = tuple(sorted((manifest_token, *chunk_order)))
    if context.pinned_file_tokens != expected_pinned_tokens:
        raise _fail(
            "COLMAP packet pinned token set and order do not exactly match its ledger"
        )

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
        archive_member = _canonical_ustar_member_name(
            value["archiveMember"],
            f"members[{index}].archiveMember",
        )
        sha256 = _sha256(value["sha256"], f"members[{index}].sha256")
        size_bytes = _exact_int(
            value["sizeBytes"],
            f"members[{index}].sizeBytes",
            minimum=1,
        )
        if size_bytes > COLMAP_PACKET_MEMBER_MAX_BYTES:
            raise _fail("COLMAP packet member exceeds the per-member byte ceiling")
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
    member_order = tuple(
        (member.chunk_token, member.archive_member) for member in members
    )
    if member_order != tuple(sorted(member_order)):
        raise _fail("COLMAP packet members must use canonical chunk/member order")
    if sum(member.size_bytes for member in members) > COLMAP_PACKET_EXTRACTED_MAX_BYTES:
        raise _fail("COLMAP packet exceeds the extracted-member byte ceiling")
    _reject_file_path_collisions(
        tuple(member.relative_path for member in members),
        label="COLMAP packet destination ledger",
    )
    for chunk_token in chunk_tokens:
        _reject_file_path_collisions(
            tuple(
                member.archive_member
                for member in members
                if member.chunk_token == chunk_token
            ),
            label=f"COLMAP packet archive ledger {chunk_token}",
        )
    if request_member not in member_paths:
        raise _fail("COLMAP packet requestMember is not declared")
    request_row = next(row for row in members if row.relative_path == request_member)
    if request_row.role != "engine-request":
        raise _fail("COLMAP packet requestMember has the wrong role")
    if request_row.size_bytes > COLMAP_ENGINE_REQUEST_MAX_BYTES:
        raise _fail("COLMAP packet engine request exceeds its byte ceiling")
    role_counts = {
        role: sum(row.role == role for row in members) for role in allowed_roles
    }
    if role_counts["engine-request"] != 1:
        raise _fail("COLMAP packet must contain exactly one engine request member")
    if role_counts["source-ledger"] > 1 or role_counts["adapter-ledger"] > 1:
        raise _fail("COLMAP packet permits at most one member for each ledger role")
    if not (
        COLMAP_PACKET_MIN_ENGINE_IMAGES
        <= role_counts["engine-image"]
        <= COLMAP_PACKET_MAX_ENGINE_IMAGES
    ):
        raise _fail("COLMAP packet must contain between 3 and 400 engine images")
    chunk_sizes = {chunk.token: chunk.size_bytes for chunk in chunks}
    for chunk_token, chunk_size in chunk_sizes.items():
        chunk_members = tuple(
            member for member in members if member.chunk_token == chunk_token
        )
        if not chunk_members:
            raise _fail("COLMAP packet archive chunk has no declared members")
        declared_member_bytes = sum(member.size_bytes for member in chunk_members)
        if declared_member_bytes > chunk_size:
            raise _fail("COLMAP packet members cannot fit in their declared chunk")
    return ColmapPacketManifest(
        manifest_token,
        manifest_sha256,
        manifest_run_id,
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
    """Validate bytes read from the extracted declared request member.

    This parser remains separately callable for focused contract tests, but
    production composition must use :func:`extract_colmap_packet`; it must
    never accept a caller-provided lookalike payload.
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
    except (RecursionError, UnicodeDecodeError, ValueError) as exc:
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
    """Build I87 pairs on geometry/order but emit only canonical PPM identities.

    The loop half of the policy is R122's NEAR-AND-CO-DIRECTED predicate,
    delegated to ``refine_adapter.loop_candidate_admitted`` rather than restated,
    so this derivation and the parent's cannot drift apart in the one place they
    used to be able to.
    """

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
            if loop_candidate_admitted(
                distance_m=distance,
                first_rotation=frame.cam_from_world_rotation,  # type: ignore[arg-type]
                second_rotation=candidate.cam_from_world_rotation,  # type: ignore[arg-type]
            ):
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


# ===========================================================================
# The composed child body (R121)
# ===========================================================================
#: The report envelope the parent parses in ``refine_lifecycle
#: .parse_engine_report``.  It is redeclared here rather than imported because
#: ``refine_lifecycle`` imports THIS module; a test asserts the two agree, which
#: is what stops the redeclaration from becoming a fork.
ENGINE_REPORT_CONTRACT = "patina-refine-colmap-engine-report-v1"
ENGINE_REPORT_SCHEMA_VERSION = 1

#: SIFT budget per engine image.  It is a CEILING on features, not a target: the
#: 1440x1920 Field raster is 2.8 MPx and COLMAP's own default (8192) is the
#: value the I88 box fixture and ``colmap_qualification`` already exercise at a
#: smaller size.  Raising it costs match time quadratically in the pair count.
PRIMARY_MAX_FEATURES_PER_IMAGE = 8192
#: Every stochastic surface in the plan is seeded with this and only this.
PRIMARY_RANDOM_SEED = 0

#: Child-side names inside the leased ``work/`` surface.  Seven of them are the
#: closed output-token universe the parent named; the rest are directories and
#: logs that never cross the boundary and die with the lease.
_SEED_MODEL_DIRECTORY = "seed-model"
_TRIANGULATED_MODEL_DIRECTORY = "triangulated-model"
_REFINED_MODEL_DIRECTORY = "refined-model"
_ALIGNED_MODEL_DIRECTORY = "aligned-model"
_DATABASE_OUTPUT = "database-v1.db"
_PAIRS_OUTPUT = "pairs-v2.txt"
_SEED_TAR_OUTPUT = "seed-model-v1.tar"
_RAW_TAR_OUTPUT = "raw-triangulated-model-snapshot-v1.tar"
_ALIGNED_TAR_OUTPUT = "aligned-sparse-model-v1.tar"
_ADAPTER_OUTPUT = "adapter-v2.json"
_COMMAND_EVIDENCE_OUTPUT = "engine-command-evidence-v1.json"
#: The post-BA, PRE-alignment model, tarred so the evidence builder's artifact
#: identity set can name the bytes the refined measurements were read from.  It
#: is deliberately NOT an output token: the closed universe is seven, the parent
#: publishes the aligned model, and widening the universe to carry a fourth
#: archive would be an unreviewed artifact leaving the boundary.
_REFINED_TAR_SCRATCH = "refined-model-snapshot-v1.tar"
_TRIANGULATOR_LOG = "point-triangulator.log"
_MODEL_TAR_BLOCK = 512
_MODEL_TAR_MODE = b"0000644\x00"
_NATIVE_TEXT_BYTES = 512
#: Ceiling on one model member the child is willing to read into the tar
#: writer's stream.  It matches the parent's own parse ceiling so an archive
#: this side accepts cannot be one the other side refuses on size alone.
_MODEL_MEMBER_MAX_BYTES = 2 * 1024 * 1024 * 1024
_MODEL_COPY_BYTES = 1024 * 1024
#: How often the bounded per-item loops below re-read the carried deadline.
_DEADLINE_CHECK_INTERVAL = 64


def _engine_failed(message: str) -> AdapterError:
    return AdapterError(message, _ENGINE_FAILED)


def _bounded_native_text(exc: BaseException) -> str:
    """Return one bounded single-line rendering of a native binding failure.

    PyCOLMAP raises through pybind11, and a failing solve can carry a Ceres
    report of unbounded length with embedded newlines.  Letting that reach the
    child's error envelope means the envelope overflows
    ``NATIVE_CHILD_MAX_ERROR_BYTES`` and the operator sees a transport error
    instead of the engine's own diagnosis.
    """

    try:
        raw = str(exc)
    except BaseException:  # noqa: BLE001 - normalization must not itself raise
        return f"<unrenderable {type(exc).__name__}>"
    flattened = raw.replace("\r", " ").replace("\n", " ").encode(
        "utf-8", errors="replace"
    )
    if len(flattened) <= _NATIVE_TEXT_BYTES:
        return flattened.decode("utf-8", errors="replace")
    suffix = b"...<truncated>"
    head = flattened[: _NATIVE_TEXT_BYTES - len(suffix)]
    return head.decode("utf-8", errors="ignore") + suffix.decode("ascii")


def _guarded(label: str, callback: Callable[[], Any]) -> Any:
    """Run one native binding call under the adapter's error contract.

    ``AdapterError`` passes through untouched -- it already carries a stable
    code the runner maps.  Everything else, including ``BaseException``
    subclasses pybind11 can surface, becomes ``REFINE_ENGINE_FAILED`` with a
    bounded message naming the operation that produced it.  Without this an
    ``AttributeError`` from a binding-surface drift and a genuine solver failure
    reach the parent as the same anonymous transport error.
    """

    try:
        return callback()
    except AdapterError:
        raise
    except BaseException as exc:  # noqa: BLE001 - the whole point is to normalize
        raise _engine_failed(
            f"{label} failed: {type(exc).__name__}: {_bounded_native_text(exc)}"
        ) from exc


def _checkpoint(context: NativeChildContext, index: int) -> None:
    if index % _DEADLINE_CHECK_INTERVAL == 0:
        context.remaining_seconds()


# ---------------------------------------------------------------------------
# Canonical sparse-model archives
# ---------------------------------------------------------------------------
def _model_tar_header(name: str, size: int) -> bytes:
    """Emit the exact USTAR header ``refine_model_alignment`` will accept.

    Mode 0644 and zero uid/gid/mtime are not defaults -- the parent's
    ``_archive_member_map`` refuses any other value, because a reproducible
    archive is what makes the item-5 freeze digest mean anything.
    """

    encoded = name.encode("ascii")
    if not encoded or len(encoded) > 100:
        raise _engine_failed("sparse-model member name does not fit a USTAR header")
    header = bytearray(_MODEL_TAR_BLOCK)
    header[0 : len(encoded)] = encoded
    header[100:108] = _MODEL_TAR_MODE
    header[108:116] = b"0000000\x00"
    header[116:124] = b"0000000\x00"
    header[124:136] = ("%011o\x00" % size).encode("ascii")
    header[136:148] = b"00000000000\x00"
    header[156:157] = b"0"
    header[257:263] = b"ustar\x00"
    header[263:265] = b"00"
    header[148:156] = b" " * 8
    header[148:156] = ("%06o\x00 " % sum(header)).encode("ascii")
    return bytes(header)


def _write_canonical_model_tar(
    model_directory: Path,
    destination: Path,
    *,
    context: NativeChildContext,
) -> tuple[str, int]:
    """Pack one COLMAP sparse model into the reviewed canonical archive.

    Members are emitted in :data:`SPARSE_MODEL_CANONICAL_MEMBER_ORDER`, not in
    directory order: fixing the ORDER as well as the set is what makes the bytes
    deterministic for a given model.  COLMAP 4 writes ``rigs.bin`` and
    ``frames.bin`` alongside the three classic files and both are carried.
    """

    present = [
        name
        for name in SPARSE_MODEL_CANONICAL_MEMBER_ORDER
        if (model_directory / name).is_file()
    ]
    missing = [name for name in SPARSE_MODEL_REQUIRED_MEMBERS if name not in present]
    if missing:
        raise _engine_failed(
            f"COLMAP wrote no {missing[0]} into {model_directory.name}"
        )
    digest = hashlib.sha256()
    written = 0
    descriptor = os.open(
        destination,
        os.O_CREAT | os.O_EXCL | os.O_WRONLY | getattr(os, "O_NOFOLLOW", 0),
        0o600,
    )
    with os.fdopen(descriptor, "wb", closefd=True) as archive:

        def emit(payload: bytes) -> None:
            nonlocal written
            archive.write(payload)
            digest.update(payload)
            written += len(payload)

        for index, name in enumerate(present):
            _checkpoint(context, index)
            member = model_directory / name
            size = member.stat().st_size
            if size > _MODEL_MEMBER_MAX_BYTES:
                raise _engine_failed(
                    f"COLMAP sparse-model member {name} exceeds the reviewed ceiling"
                )
            emit(_model_tar_header(name, size))
            remaining = size
            with member.open("rb") as handle:
                while remaining > 0:
                    context.remaining_seconds()
                    block = handle.read(min(_MODEL_COPY_BYTES, remaining))
                    if not block:
                        raise _engine_failed(
                            f"COLMAP sparse-model member {name} ended before its size"
                        )
                    emit(block)
                    remaining -= len(block)
            pad = (-size) % _MODEL_TAR_BLOCK
            if pad:
                emit(b"\x00" * pad)
        emit(b"\x00" * (_MODEL_TAR_BLOCK * 2))
        archive.flush()
        os.fsync(archive.fileno())
    return digest.hexdigest(), written


def _parse_own_snapshot(path: Path, *, label: str, deadline: RefineDeadline):
    """Parse an archive this child just wrote with the PARENT's own parser.

    Using ``read_sparse_model_snapshot`` here rather than reading poses out of
    the live ``pycolmap`` objects is deliberate and is what makes the child's
    declared Sim(3) and pose digests reproducible by the parent: both sides then
    canonicalise the same bytes through the same code.  A child that digested
    its in-memory reconstruction instead would disagree with the parent on
    quaternion sign, ordering, or grid rounding, and every run would be refused
    for a reason that has nothing to do with the reconstruction.
    """

    descriptor = os.open(path, os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0))
    try:
        return read_sparse_model_snapshot(descriptor, label=label, deadline=deadline)
    finally:
        os.close(descriptor)


# ---------------------------------------------------------------------------
# Small pose arithmetic (kept dependency-free on purpose)
# ---------------------------------------------------------------------------
def _canonical_quaternion_from_rotation(
    rotation: Sequence[Sequence[float]],
) -> tuple[float, float, float, float]:
    """Return a unit Hamilton quaternion with the canonical sign convention.

    The sign rule is the one ``refine_evidence_builder._quaternion_rotation``
    enforces and ``refine_model_alignment._canonical_unit_quaternion`` applies:
    the first component whose magnitude clears the threshold is made positive.
    """

    trace = rotation[0][0] + rotation[1][1] + rotation[2][2]
    if trace > 0.0:
        scale = math.sqrt(trace + 1.0) * 2.0
        quaternion = (
            0.25 * scale,
            (rotation[2][1] - rotation[1][2]) / scale,
            (rotation[0][2] - rotation[2][0]) / scale,
            (rotation[1][0] - rotation[0][1]) / scale,
        )
    elif rotation[0][0] > rotation[1][1] and rotation[0][0] > rotation[2][2]:
        scale = (
            math.sqrt(1.0 + rotation[0][0] - rotation[1][1] - rotation[2][2]) * 2.0
        )
        quaternion = (
            (rotation[2][1] - rotation[1][2]) / scale,
            0.25 * scale,
            (rotation[0][1] + rotation[1][0]) / scale,
            (rotation[0][2] + rotation[2][0]) / scale,
        )
    elif rotation[1][1] > rotation[2][2]:
        scale = (
            math.sqrt(1.0 + rotation[1][1] - rotation[0][0] - rotation[2][2]) * 2.0
        )
        quaternion = (
            (rotation[0][2] - rotation[2][0]) / scale,
            (rotation[0][1] + rotation[1][0]) / scale,
            0.25 * scale,
            (rotation[1][2] + rotation[2][1]) / scale,
        )
    else:
        scale = (
            math.sqrt(1.0 + rotation[2][2] - rotation[0][0] - rotation[1][1]) * 2.0
        )
        quaternion = (
            (rotation[1][0] - rotation[0][1]) / scale,
            (rotation[0][2] + rotation[2][0]) / scale,
            (rotation[1][2] + rotation[2][1]) / scale,
            0.25 * scale,
        )
    norm = math.sqrt(sum(component * component for component in quaternion))
    if not math.isfinite(norm) or norm <= 0.0:
        raise _engine_failed("a COLMAP pose carried a degenerate rotation")
    normalized = tuple(component / norm for component in quaternion)
    leading = next(
        (component for component in normalized if abs(component) > 1e-12),
        1.0,
    )
    if leading < 0:
        normalized = tuple(-component for component in normalized)
    return normalized  # type: ignore[return-value]


def _pose_from_cam_from_world_matrix(matrix: Sequence[Sequence[float]]) -> ColmapPose:
    """Build the adapter's pose contract from COLMAP's 3x4 ``cam_from_world``."""

    rotation = tuple(
        tuple(float(matrix[row][column]) for column in range(3)) for row in range(3)
    )
    translation = tuple(float(matrix[row][3]) for row in range(3))
    if any(not math.isfinite(value) for row in rotation for value in row) or any(
        not math.isfinite(value) for value in translation
    ):
        raise _engine_failed("a COLMAP pose carried a non-finite component")
    return ColmapPose(
        rotation=rotation,  # type: ignore[arg-type]
        translation=translation,  # type: ignore[arg-type]
        qvec=_canonical_quaternion_from_rotation(rotation),
    )


def _camera_center_m(pose: ColmapPose) -> tuple[float, float, float]:
    """``-R^T t`` computed exactly as every consumer of it computes it."""

    return tuple(
        -sum(pose.rotation[row][axis] * pose.translation[row] for row in range(3))
        for axis in range(3)
    )  # type: ignore[return-value]


def _sha256_and_size(path: Path, *, context: NativeChildContext) -> tuple[str, int]:
    digest = hashlib.sha256()
    size = 0
    with path.open("rb") as handle:
        while True:
            context.remaining_seconds()
            block = handle.read(_MODEL_COPY_BYTES)
            if not block:
                break
            digest.update(block)
            size += len(block)
    if size <= 0:
        raise _engine_failed(f"engine artifact {path.name} is empty")
    return digest.hexdigest(), size


def _write_json_artifact(
    path: Path,
    document: Mapping[str, Any],
    *,
    context: NativeChildContext,
) -> tuple[str, int]:
    payload = _canonical_json_bytes(document)
    descriptor = os.open(
        path,
        os.O_CREAT | os.O_EXCL | os.O_WRONLY | getattr(os, "O_NOFOLLOW", 0),
        0o600,
    )
    with os.fdopen(descriptor, "wb", closefd=True) as handle:
        handle.write(payload)
        handle.flush()
        os.fsync(handle.fileno())
    context.remaining_seconds()
    return hashlib.sha256(payload).hexdigest(), len(payload)


# ---------------------------------------------------------------------------
# One executed operation, recorded for the command-evidence artifact
# ---------------------------------------------------------------------------
@dataclass(frozen=True)
class ExecutedColmapOperation:
    """One logical operation actually run, with its own wall clock and counters.

    ``options`` is the reviewed plan's declaration; ``observations`` is what the
    run produced.  Keeping them in separate fields is the point: an operation
    whose declared options and observed counters disagree is visible in the
    published artifact rather than reconciled inside it.
    """

    operation: str
    duration_ms: int
    observations: tuple[tuple[str, bool | int | float | str], ...]

    def document(self) -> dict[str, Any]:
        return {
            "operation": self.operation,
            "durationMs": self.duration_ms,
            "observations": {name: value for name, value in self.observations},
        }


class _OperationClock:
    """Time one operation without acquiring a second deadline.

    ``time.monotonic`` is read for DURATION only.  Nothing here compares against
    an expiry; every expiry check in this module goes through
    ``NativeChildContext.remaining_seconds``, which reads the one instant the
    parent transported.
    """

    def __init__(self) -> None:
        self._started = time.monotonic()
        self.records: list[ExecutedColmapOperation] = []

    def record(
        self,
        operation: str,
        started_s: float,
        observations: Sequence[tuple[str, bool | int | float | str]],
    ) -> None:
        self.records.append(
            ExecutedColmapOperation(
                operation=operation,
                duration_ms=max(0, int((time.monotonic() - started_s) * 1000.0)),
                observations=tuple(observations),
            )
        )

    @property
    def elapsed_ms(self) -> int:
        return max(0, int((time.monotonic() - self._started) * 1000.0))


# ---------------------------------------------------------------------------
# The primary plan, executed
# ---------------------------------------------------------------------------
def _engine_images(request: ColmapEngineRequest) -> tuple[EngineImage, ...]:
    return tuple(
        EngineImage(
            name=frame.engine_image_name,
            intrinsics=PinholeIntrinsics(
                fx=frame.intrinsics[0],
                fy=frame.intrinsics[1],
                cx=frame.intrinsics[2],
                cy=frame.intrinsics[3],
                image_width=frame.intrinsics[4],
                image_height=frame.intrinsics[5],
            ),
            cam_from_world=ColmapPose(
                rotation=frame.cam_from_world_rotation,  # type: ignore[arg-type]
                translation=frame.cam_from_world_translation,
                qvec=_canonical_quaternion_from_rotation(
                    frame.cam_from_world_rotation
                ),
            ),
        )
        for frame in request.frames
    )


def _write_pairs_file(
    path: Path,
    pairs: Sequence[tuple[str, str]],
    *,
    context: NativeChildContext,
) -> tuple[str, int]:
    payload = "".join(f"{first} {second}\n" for first, second in pairs).encode("ascii")
    if not payload:
        raise _engine_failed("the deterministic candidate graph is empty")
    descriptor = os.open(
        path,
        os.O_CREAT | os.O_EXCL | os.O_WRONLY | getattr(os, "O_NOFOLLOW", 0),
        0o600,
    )
    with os.fdopen(descriptor, "wb", closefd=True) as handle:
        handle.write(payload)
        handle.flush()
        os.fsync(handle.fileno())
    context.remaining_seconds()
    return hashlib.sha256(payload).hexdigest(), len(payload)


def _reconstruction_rows(
    reconstruction: Any,
    *,
    label: str,
    expected_names: Sequence[str],
    context: NativeChildContext,
) -> tuple[dict[str, Any], tuple[ModelTrackSnapshot, ...], int, int]:
    """Read poses, the point2D table and the complete track universe once.

    Everything the evidence builder needs from one model comes out of this
    single pass, so the raw and refined reads are literally the same code on two
    models -- which is the only way "identical feature tracks before and after"
    can be a property of the measurement rather than a hope about it.
    """

    registered = tuple(sorted(int(value) for value in reconstruction.reg_image_ids()))
    if len(registered) != len(expected_names):
        raise _engine_failed(
            f"{label} model registered {len(registered)} of "
            f"{len(expected_names)} engine images"
        )
    by_name: dict[str, dict[str, Any]] = {}
    image_id_to_name: dict[int, str] = {}
    for index, image_id in enumerate(registered):
        _checkpoint(context, index)
        image = reconstruction.image(image_id)
        name = str(image.name)
        if name not in expected_names:
            raise _engine_failed(f"{label} model carries an unexpected image {name}")
        if name in by_name:
            raise _engine_failed(f"{label} model repeats image name {name}")
        points2d = image.points2D
        keypoints = tuple(
            (float(point.xy[0]), float(point.xy[1])) for point in points2d
        )
        by_name[name] = {
            "imageId": image_id,
            "cameraId": int(image.camera_id),
            "pose": _pose_from_cam_from_world_matrix(image.cam_from_world().matrix()),
            "keypoints": keypoints,
            "point3dIds": tuple(int(point.point3D_id) for point in points2d),
        }
        image_id_to_name[image_id] = name
    if set(by_name) != set(expected_names):
        raise _engine_failed(f"{label} model does not cover the engine image universe")

    tracks: list[ModelTrackSnapshot] = []
    repeated_image_tracks = 0
    short_tracks = 0
    for index, point3d_id in enumerate(
        sorted(int(value) for value in reconstruction.point3D_ids())
    ):
        _checkpoint(context, index)
        point = reconstruction.point3D(point3d_id)
        xyz = tuple(float(value) for value in point.xyz)
        observations: list[ModelTrackObservation] = []
        seen_images: set[str] = set()
        repeats_an_image = False
        for element in point.track.elements:
            image_id = int(element.image_id)
            name = image_id_to_name.get(image_id)
            if name is None:
                raise _engine_failed(
                    f"{label} model track references unregistered image {image_id}"
                )
            if name in seen_images:
                repeats_an_image = True
                break
            seen_images.add(name)
            observations.append(
                ModelTrackObservation(
                    engine_image_name=name,
                    point2d_index=int(element.point2D_idx),
                )
            )
        # MEASURED on the qualified host, not assumed: COLMAP 4.0.2's
        # ``point_triangulator`` DOES emit tracks that observe one image twice.
        # A 3D point projects to exactly one pixel in one camera, so such a
        # track is a merge of two distinct features and at least one of its two
        # observations must carry a large residual by construction.  The
        # evidence builder's membership key forbids it outright.
        #
        # It is EXCLUDED, from both models, by a criterion that is purely
        # structural -- it reads the track's membership and never looks at a
        # residual -- so it cannot form a favourable intersection.  The two
        # exclusions are computed independently on the two models and the
        # builder still requires the surviving universes to be identical, so a
        # disagreement fails closed rather than shrinking the baseline.  The
        # counts are carried out to telemetry and to ``adapter-v2.json``: an
        # exclusion nobody can see is the thing this program keeps catching.
        if repeats_an_image:
            repeated_image_tracks += 1
            continue
        if len(observations) < 2:
            short_tracks += 1
            continue
        tracks.append(
            ModelTrackSnapshot(
                point3d=xyz,  # type: ignore[arg-type]
                observations=tuple(observations),
            )
        )
    if not tracks:
        raise _engine_failed(f"{label} model carries no usable triangulated tracks")
    return by_name, tuple(tracks), repeated_image_tracks, short_tracks


def _two_view_rows(
    database: Any,
    *,
    pairs: Sequence[tuple[str, str]],
    rows_by_name: Mapping[str, Mapping[str, Any]],
    context: NativeChildContext,
) -> tuple[tuple[CandidateTwoViewGeometry, ...], int, int]:
    """Read one row per candidate pair straight out of the engine database.

    A pair with no stored two-view geometry contributes an EMPTY row rather than
    being dropped: the evidence builder requires exactly one row per
    deterministic candidate pair, and a builder handed only the pairs that
    verified would be computing coverage over a set the run chose after seeing
    the answer.
    """

    rows: list[CandidateTwoViewGeometry] = []
    verified = 0
    degenerate: list[str] = []
    for index, (first_name, second_name) in enumerate(pairs):
        _checkpoint(context, index)
        first_id = int(rows_by_name[first_name]["imageId"])
        second_id = int(rows_by_name[second_name]["imageId"])
        inliers: tuple[tuple[int, int], ...] = ()
        rotation = None
        direction = None
        if bool(database.exists_two_view_geometry(first_id, second_id)):
            geometry = database.read_two_view_geometry(first_id, second_id)
            matches = geometry.inlier_matches
            inliers = tuple(
                (int(row[0]), int(row[1]))
                for row in (
                    matches.tolist() if hasattr(matches, "tolist") else list(matches)
                )
            )
            # MEASURED, not assumed: ``cam2_from_cam1`` is OPTIONAL in COLMAP
            # 4.0.2 and really does come back ``None`` for a stored geometry
            # whose relative pose was not estimated.  ``pose.matrix()`` on that
            # is an ``AttributeError``, which is what the first host run that
            # got this far actually produced.
            pose = geometry.cam2_from_cam1
            matrix = None if pose is None else pose.matrix()
            translation = (
                (0.0, 0.0, 0.0)
                if matrix is None
                else tuple(float(matrix[row][3]) for row in range(3))
            )
            norm = math.sqrt(sum(value * value for value in translation))
            if matrix is not None and math.isfinite(norm) and norm > 1e-9:
                rotation = tuple(
                    tuple(float(matrix[row][column]) for column in range(3))
                    for row in range(3)
                )
                direction = tuple(value / norm for value in translation)
                verified += 1
            elif len(inliers) >= MIN_VERIFIED_INLIERS:
                degenerate.append(f"{first_name}|{second_name}")
        rows.append(
            CandidateTwoViewGeometry(
                first_engine_image_name=first_name,
                second_engine_image_name=second_name,
                inlier_correspondences=inliers,
                verified_relative_rotation=rotation,  # type: ignore[arg-type]
                verified_translation_direction=direction,  # type: ignore[arg-type]
            )
        )
    if degenerate:
        # Named explicitly.  A pure-rotation ("panoramic") pair is a real
        # outcome of standing still and turning, and COLMAP stores it with a
        # zero baseline; the evidence builder refuses such a pair once it clears
        # the inlier floor, and a run killed by it deserves to say which pairs
        # did it rather than surface as an anonymous contract violation.
        raise _engine_failed(
            "COLMAP verified a zero-baseline two-view geometry above the inlier "
            f"floor for {len(degenerate)} candidate pair(s): "
            + ",".join(sorted(degenerate)[:8])
        )
    return tuple(rows), verified, len(pairs)


def require_candidate_graph_agreement(
    pairs: Sequence[tuple[str, str]],
    frames: Sequence[ColmapEngineFrame],
    centres_by_name: Mapping[str, tuple[float, float, float]],
    rotations_by_name: Mapping[str, tuple[tuple[float, float, float], ...]],
) -> None:
    """Refuse a run whose two derivations of the candidate graph disagree.

    TWO DIFFERENT POSES produce this graph.  The MATCHER is given the graph built
    from ``rawCameraCenterMeters``/``camFromWorldRotation`` as the packet
    declared them; the EVIDENCE BUILDER rebuilds its own from ``-R^T t`` and the
    R of the raw model's parsed poses.  Those agree to float noise, and the
    packet parser already bounds the centre disagreement at ``1e-6`` m -- but the
    policy has hard edges at ``SPATIAL_MIN_BASELINE_M``, ``SPATIAL_RADIUS_M`` and
    (since R122) ``LOOP_MAX_VIEW_AXIS_ANGLE_DEG``, and a pair sitting exactly on
    one could fall on different sides in the two derivations.  The builder would
    then refuse with "two-view snapshot omitted a deterministic candidate pair",
    which says nothing about the cause.

    BOTH halves of the pose are substituted, not just the centre.  R122 added a
    second hard edge to the policy; a shadow that re-derived only the distances
    would have gone on agreeing with itself about the angles and the guard would
    have quietly stopped covering the new edge.

    Extracted from ``_run_primary_plan`` rather than inlined for the reason this
    codebase has extracted a guard before: inlined, it sits behind a GPU, a
    pinned COLMAP and a real capture, so no deletion of it could redden.  Named,
    it is directly falsifiable.
    """

    shadow = tuple(
        dataclasses.replace(
            frame,
            raw_camera_center_m=centres_by_name[frame.engine_image_name],
            cam_from_world_rotation=rotations_by_name[frame.engine_image_name],
        )
        for frame in frames
    )
    if build_engine_pair_graph(shadow) != tuple(pairs):
        raise _engine_failed(
            "the candidate graph derived from the raw model's centres differs "
            "from the one the matcher was given"
        )


def _run_primary_plan(
    packet: ExtractedColmapPacket,
    *,
    context: NativeChildContext,
    deadline: RefineDeadline,
    toolchain: ColmapToolchain,
    clock: _OperationClock,
) -> dict[str, Any]:
    """Execute the exact I87 primary plan and return the parent's report.

    ORDER, and why each step is where it is: features and matches are produced
    from the extracted packet while the packet still exists (the extractor
    removes it when its context closes); the seed carries the device's poses
    into COLMAP unchanged; the CLI triangulator adds points WITHOUT moving a
    known pose; bundle adjustment is the only step allowed to move one; and the
    Sim(3) rebase happens last, on camera centres only, because that is the
    transform ``refine_model_alignment.verify_child_alignment_proposal``
    recomputes.
    """

    work = Path(context.workspace_subdirectory_path(NATIVE_WORKSPACE_COMMAND_SUBDIRECTORY))
    scratch = Path(context.workspace_subdirectory_path(NATIVE_WORKSPACE_TEMP_SUBDIRECTORY))
    images = Path(
        context.workspace_subdirectory_path(NATIVE_WORKSPACE_PACKET_SUBDIRECTORY)
    ) / "images"
    request = packet.engine_request
    frames = request.frames
    engine_images = _engine_images(request)
    expected_names = tuple(frame.engine_image_name for frame in frames)
    database_path = work / _DATABASE_OUTPUT
    pairs_path = work / _PAIRS_OUTPUT

    backend = _guarded(
        "pycolmap.load",
        lambda: PycolmapBackend.load(
            config=PycolmapBackendConfig(
                random_seed=PRIMARY_RANDOM_SEED,
                maximum_features_per_image=PRIMARY_MAX_FEATURES_PER_IMAGE,
                geometric_verification_minimum_inliers=MIN_VERIFIED_INLIERS,
            )
        ),
    )
    binding_version = str(backend.version)
    toolchain_evidence = _guarded("pycolmap.toolchain_evidence", backend.toolchain_evidence)
    # MEASURED on the qualified host: ``pycolmap.COLMAP_version`` is the banner
    # form ``"COLMAP 4.0.2"``, not the bare version, and ``COLMAP_build`` is the
    # UNPARENTHESIZED build string -- both distinct from what the CLI and the
    # toolchain manifest carry.  The pin is therefore stated against the exact
    # strings the binding really emits, with the version embedded rather than
    # compared for equality.
    if str(toolchain_evidence.get("colmapVersion")) != (
        f"COLMAP {TARGET_COLMAP_VERSION}"
    ):
        raise _engine_failed(
            "PyCOLMAP reports a COLMAP version other than the pinned "
            f"{TARGET_COLMAP_VERSION}"
        )
    if not bool(toolchain_evidence.get("hasCuda")):
        raise _engine_failed("PyCOLMAP was built without CUDA on this host")
    if binding_version != TARGET_COLMAP_VERSION:
        raise _engine_failed(
            f"PyCOLMAP binding is {binding_version}, not the pinned "
            f"{TARGET_COLMAP_VERSION}"
        )

    # 1. GPU SIFT, one camera per image.
    started = time.monotonic()
    feature_rows = _guarded(
        "pycolmap.extract_features",
        lambda: backend.extract_gpu_features(
            database_path=database_path,
            image_dir=images,
            images=engine_images,
            gpu_index=request.gpu_index,
            log_path=scratch / "extract-features.log",
        ),
    )
    clock.record(
        "pycolmap.extract_features",
        started,
        (
            ("images", len(feature_rows)),
            ("minKeypoints", min(int(row["keypoints"]) for row in feature_rows)),
            ("maxKeypoints", max(int(row["keypoints"]) for row in feature_rows)),
            (
                "totalKeypoints",
                sum(int(row["keypoints"]) for row in feature_rows),
            ),
        ),
    )
    context.remaining_seconds()

    # 2. Replace COLMAP's guessed intrinsics with the device's, ids preserved.
    started = time.monotonic()
    camera_rows = _guarded(
        "pycolmap.rewrite_camera_rows",
        lambda: backend.rewrite_intrinsics_preserving_ids(
            database_path=database_path,
            images=engine_images,
            log_path=scratch / "rewrite-cameras.log",
        ),
    )
    clock.record(
        "pycolmap.rewrite_camera_rows",
        started,
        (
            ("cameras", len(camera_rows)),
            ("model", "PINHOLE"),
            ("idsPreserved", all(bool(row["idsPreserved"]) for row in camera_rows)),
        ),
    )

    # 3. The deterministic candidate graph, then guided GPU matching over it.
    pairs = build_engine_pair_graph(frames)
    pairs_sha256, pairs_size = _write_pairs_file(pairs_path, pairs, context=context)
    started = time.monotonic()
    match_rows = _guarded(
        "pycolmap.match_image_pairs",
        lambda: backend.match_explicit_pairs(
            database_path=database_path,
            pairs_path=pairs_path,
            image_pairs=pairs,
            gpu_index=request.gpu_index,
            log_path=scratch / "match-pairs.log",
        ),
    )
    verified_pairs = sum(
        1 for row in match_rows if int(row["verifiedInliers"]) >= MIN_VERIFIED_INLIERS
    )
    clock.record(
        "pycolmap.match_image_pairs",
        started,
        (
            ("candidatePairs", len(pairs)),
            ("pairsSha256", pairs_sha256),
            ("verifiedPairs", verified_pairs),
            ("minimumVerifiedInliers", MIN_VERIFIED_INLIERS),
        ),
    )

    # 4. Post-match overlap policy, evaluated BEFORE any model is built.
    started = time.monotonic()
    connected_fraction = _connected_fraction(expected_names, match_rows)
    clock.record(
        "policy.classify_post_match_overlap",
        started,
        (
            ("connectedFraction", connected_fraction),
            ("minimumConnectedFraction", MIN_CONNECTED_FRACTION),
        ),
    )
    if connected_fraction < MIN_CONNECTED_FRACTION:
        raise AdapterError(
            "verified matches connect only "
            f"{connected_fraction:.3f} of the engine images, below the "
            f"{MIN_CONNECTED_FRACTION:.2f} floor",
            "REFINE_LOW_OVERLAP",
        )

    # 5. The known-pose seed: the device's full poses, not a warm start.
    started = time.monotonic()
    seed_directory = work / _SEED_MODEL_DIRECTORY
    seed_evidence = _guarded(
        "pycolmap.build_known_pose_seed",
        lambda: backend.build_known_pose_seed(
            database_path=database_path,
            images=engine_images,
            output_path=seed_directory,
            log_path=scratch / "build-seed.log",
        ),
    )
    clock.record(
        "pycolmap.build_known_pose_seed",
        started,
        (
            ("registeredImages", len(seed_evidence.registered_image_ids)),
            ("seedPoints", seed_evidence.num_points3d),
            ("valid", bool(seed_evidence.valid)),
        ),
    )

    # 6. The one CLI phase.  It runs inside the already-isolated native session
    #    and inherits its process group; the supervisor proves quiescence.
    started = time.monotonic()
    triangulated_directory = work / _TRIANGULATED_MODEL_DIRECTORY
    execution = plan_leased_colmap_command(
        primary_point_triangulator_argv(
            colmap=Path(toolchain.identity.path),
            database_path=database_path,
            image_path=images,
            seed_model_path=seed_directory,
            triangulated_model_path=triangulated_directory,
        ),
        toolchain=toolchain,
        context=context,
        deadline=deadline,
    )
    triangulated_directory.mkdir(mode=0o700, exist_ok=False)
    result = _run_inherited_colmap_command(
        execution,
        context=context,
        deadline=deadline,
        log_path=work / _TRIANGULATOR_LOG,
        cwd=work,
    )
    if result.returncode != 0:
        raise _engine_failed(
            f"COLMAP point_triangulator exited {result.returncode}: "
            f"{_bounded_native_text(RuntimeError(result.output_tail))}"
        )
    clock.record(
        "colmap.point_triangulator",
        started,
        (
            ("returncode", int(result.returncode)),
            ("clearPoints", True),
            ("refineIntrinsics", False),
            ("randomSeed", PRIMARY_RANDOM_SEED),
        ),
    )

    # 7/8. The raw pre-BA baseline, read once and frozen as an archive.
    started = time.monotonic()
    raw_reconstruction = _guarded(
        "pycolmap.inspect_triangulated_model",
        lambda: _open_reconstruction(triangulated_directory),
    )
    raw_rows, raw_tracks, raw_repeated, raw_short = _reconstruction_rows(
        raw_reconstruction,
        label="raw pre-BA",
        expected_names=expected_names,
        context=context,
    )
    raw_tar = work / _RAW_TAR_OUTPUT
    raw_tar_sha256, raw_tar_size = _write_canonical_model_tar(
        triangulated_directory, raw_tar, context=context
    )
    clock.record(
        "snapshot.fixed_track_raw_arkit_baseline",
        started,
        (
            ("kind", RAW_BASELINE_KIND),
            ("tracks", len(raw_tracks)),
            ("excludedRepeatedImageTracks", raw_repeated),
            ("excludedShortTracks", raw_short),
            ("archiveSha256", raw_tar_sha256),
        ),
    )

    require_candidate_graph_agreement(
        pairs,
        frames,
        {
            name: _camera_center_m(row["pose"])
            for name, row in raw_rows.items()
        },
        {name: row["pose"].rotation for name, row in raw_rows.items()},
    )

    # 9. Bundle adjustment, the only step permitted to move a known pose.
    started = time.monotonic()
    refined_directory = work / _REFINED_MODEL_DIRECTORY
    bundle_evidence = _guarded(
        "pycolmap.create_default_bundle_adjuster",
        lambda: backend.bundle_adjust_with_success_evidence(
            input_path=triangulated_directory,
            output_path=refined_directory,
            log_path=scratch / "bundle-adjust.log",
        ),
    )
    if not bool(bundle_evidence["usable"]) or not bool(bundle_evidence["modelWritten"]):
        raise _engine_failed(
            "COLMAP bundle adjustment produced no usable solution "
            f"({bundle_evidence['terminationType']})"
        )
    clock.record(
        "pycolmap.create_default_bundle_adjuster",
        started,
        (
            ("terminationType", str(bundle_evidence["terminationType"])),
            ("numResiduals", int(bundle_evidence["numResiduals"])),
            ("gauge", "TWO_CAMS_FROM_WORLD"),
            ("refineFocalLength", False),
            ("refinePrincipalPoint", False),
            ("refineExtraParams", False),
        ),
    )

    # 10. The refined model, read on the same code path as the raw one.
    started = time.monotonic()
    refined_reconstruction = _guarded(
        "pycolmap.inspect_adjusted_model",
        lambda: _open_reconstruction(refined_directory),
    )
    refined_rows, refined_tracks, refined_repeated, refined_short = (
        _reconstruction_rows(
            refined_reconstruction,
            label="refined",
            expected_names=expected_names,
            context=context,
        )
    )
    refined_tar = work / _REFINED_TAR_SCRATCH
    refined_tar_sha256, refined_tar_size = _write_canonical_model_tar(
        refined_directory, refined_tar, context=context
    )
    clock.record(
        "snapshot.fixed_track_geometry",
        started,
        (
            ("kind", REFINED_MODEL_KIND),
            ("tracks", len(refined_tracks)),
            ("excludedRepeatedImageTracks", refined_repeated),
            ("excludedShortTracks", refined_short),
            ("archiveSha256", refined_tar_sha256),
        ),
    )

    # 11. The Sim(3) rebase back into the seed's metric frame, camera centres
    #     only, followed by the archive the parent will verify and publish.
    started = time.monotonic()
    aligned_directory = work / _ALIGNED_MODEL_DIRECTORY
    rebase = estimate_sim3(
        [_camera_center_m(refined_rows[name]["pose"]) for name in expected_names],
        [_camera_center_m(raw_rows[name]["pose"]) for name in expected_names],
    )
    _guarded(
        "sim3.align_centers_points_orientations",
        lambda: _write_aligned_model(
            refined_directory,
            aligned_directory,
            rebase,
        ),
    )
    aligned_tar = work / _ALIGNED_TAR_OUTPUT
    aligned_tar_sha256, aligned_tar_size = _write_canonical_model_tar(
        aligned_directory, aligned_tar, context=context
    )
    seed_tar = work / _SEED_TAR_OUTPUT
    seed_tar_sha256, seed_tar_size = _write_canonical_model_tar(
        seed_directory, seed_tar, context=context
    )
    clock.record(
        "sim3.align_centers_points_orientations",
        started,
        (
            ("positiveScale", rebase.scale > 0.0),
            ("scale", float(rebase.scale)),
            ("archiveSha256", aligned_tar_sha256),
        ),
    )

    # 12. The child's PROPOSAL, computed on the archives it just wrote, using
    #     the parent's own parser and solver so the parent can reproduce it.
    raw_snapshot = _parse_own_snapshot(raw_tar, label="raw pre-BA", deadline=deadline)
    aligned_snapshot = _parse_own_snapshot(
        aligned_tar, label="aligned", deadline=deadline
    )
    proposal = estimate_sim3(
        list(raw_snapshot.centres()), list(aligned_snapshot.centres())
    )
    raw_digest = canonical_pose_digest(raw_snapshot)
    aligned_digest = canonical_pose_digest(aligned_snapshot)

    # 13. Comparable evidence, on one fixed track universe and the verified
    #     non-temporal loop set.
    started = time.monotonic()
    database = _guarded(
        "pycolmap.Database.open",
        lambda: _open_database(database_path),
    )
    try:
        two_view_rows, verified_geometries, candidate_pairs = _guarded(
            "pycolmap.read_two_view_geometries",
            lambda: _two_view_rows(
                database,
                pairs=pairs,
                rows_by_name=raw_rows,
                context=context,
            ),
        )
        keypoint_counts = _guarded(
            "pycolmap.num_keypoints_for_image",
            lambda: {
                name: int(database.num_keypoints_for_image(int(row["imageId"])))
                for name, row in raw_rows.items()
            },
        )
    finally:
        _guarded("pycolmap.Database.close", database.close)
    for name, count in keypoint_counts.items():
        if count != len(raw_rows[name]["keypoints"]):
            raise _engine_failed(
                f"model point2D table for {name} does not match its database "
                "keypoint table"
            )

    evidence_frames = tuple(
        EvidenceFrameSnapshot(
            ordinal=frame.ordinal,
            frame_timestamp_s=frame.frame_timestamp_s,
            engine_image_name=frame.engine_image_name,
            engine_relative_path=frame.engine_relative_path,
            engine_sha256=frame.engine_sha256,
            engine_size_bytes=frame.engine_size_bytes,
            source_archive_key=_source_archive_key(packet, frame),
            source_member=_source_member(packet, frame),
            source_image_name=frame.source_image_name,
            source_sha256=_source_sha256(packet, frame),
            source_size_bytes=_source_size_bytes(packet, frame),
            materializer_id=_materializer_id(packet),
            intrinsics=PinholeIntrinsics(
                fx=frame.intrinsics[0],
                fy=frame.intrinsics[1],
                cx=frame.intrinsics[2],
                cy=frame.intrinsics[3],
                image_width=frame.intrinsics[4],
                image_height=frame.intrinsics[5],
            ),
            database_image_id=int(raw_rows[frame.engine_image_name]["imageId"]),
            database_camera_id=int(raw_rows[frame.engine_image_name]["cameraId"]),
            database_keypoints=raw_rows[frame.engine_image_name]["keypoints"],
            raw_cam_from_world=raw_rows[frame.engine_image_name]["pose"],
            refined_cam_from_world=refined_rows[frame.engine_image_name]["pose"],
        )
        for frame in frames
    )
    database_sha256, database_size = _sha256_and_size(database_path, context=context)
    evidence_artifacts = (
        EvidenceEngineArtifactIdentity(
            name=_DATABASE_OUTPUT,
            relative_path=f"engine/{_DATABASE_OUTPUT}",
            sha256=database_sha256,
            size_bytes=database_size,
            semantic_media_type="application/vnd.sqlite3",
        ),
        EvidenceEngineArtifactIdentity(
            name=_RAW_TAR_OUTPUT,
            relative_path=f"evidence/{_RAW_TAR_OUTPUT}",
            sha256=raw_tar_sha256,
            size_bytes=raw_tar_size,
            semantic_media_type="application/x-tar",
        ),
        EvidenceEngineArtifactIdentity(
            name=_REFINED_TAR_SCRATCH,
            relative_path=f"evidence/{_REFINED_TAR_SCRATCH}",
            sha256=refined_tar_sha256,
            size_bytes=refined_tar_size,
            semantic_media_type="application/x-tar",
        ),
    )
    evidence = build_refinement_evidence(
        RefinementEvidenceBuildRequest(
            frames=evidence_frames,
            engine_artifacts=evidence_artifacts,
            provenance=EvidencePathProvenance(
                selected_engine=PRIMARY_ENGINE,
                fallback_trigger=None,
                raw_baseline_kind=RAW_BASELINE_KIND,
                refined_model_kind=REFINED_MODEL_KIND,
                rotation_prior_represented=True,
            ),
            raw_tracks=raw_tracks,
            refined_tracks=refined_tracks,
            two_view_geometries=two_view_rows,
        ),
        deadline=deadline,
    )
    clock.record(
        "evidence.build_refinement_evidence",
        started,
        (
            ("commonObservations", evidence.common_observations),
            ("verifiedLoopEdges", evidence.verified_loop_edges),
            ("verifiedGeometries", verified_geometries),
            ("candidatePairs", candidate_pairs),
        ),
    )

    # 14. The two published JSON artifacts.
    adapter_document = {
        "schemaVersion": 2,
        "contract": "patina-refine-colmap-adapter-v2",
        "targetColmapVersion": TARGET_COLMAP_VERSION,
        "bindingVersion": binding_version,
        "toolchain": {
            "colmapPrefix": toolchain.manifest.colmap_prefix,
            "colmapVersion": toolchain.manifest.colmap_version,
            "colmapExecutableSha256": toolchain.manifest.colmap_executable_sha256,
            "cudaRelease": toolchain.manifest.cuda_release,
            "nvidiaDriverVersion": toolchain.manifest.nvidia_driver_version,
            "pycolmapVersion": toolchain.manifest.pycolmap_version,
            "hasCuda": bool(toolchain_evidence.get("hasCuda")),
        },
        "provenance": {
            "selectedEngine": PRIMARY_ENGINE,
            "fallbackTrigger": None,
            "rawBaselineKind": RAW_BASELINE_KIND,
            "refinedModelKind": REFINED_MODEL_KIND,
            "rotationPriorRepresented": True,
        },
        "images": [
            {
                "ordinal": frame.ordinal,
                "engineImageName": frame.engine_image_name,
                "sourceImageName": frame.source_image_name,
                "databaseImageId": int(raw_rows[frame.engine_image_name]["imageId"]),
                "databaseCameraId": int(raw_rows[frame.engine_image_name]["cameraId"]),
                "keypoints": len(raw_rows[frame.engine_image_name]["keypoints"]),
                "registeredBefore": True,
                "registeredAfter": True,
            }
            for frame in frames
        ],
        "alignment": {
            "scale": float(proposal.scale),
            "rotation": [list(row) for row in proposal.rotation],
            "translationMeters": list(proposal.translation),
            "rawPoseDigestSha256": raw_digest,
            "alignedPoseDigestSha256": aligned_digest,
        },
        "evidence": _evidence_document(evidence),
        "trackUniverse": {
            "rawUsableTracks": len(raw_tracks),
            "refinedUsableTracks": len(refined_tracks),
            "rawExcludedRepeatedImageTracks": raw_repeated,
            "refinedExcludedRepeatedImageTracks": refined_repeated,
            "rawExcludedShortTracks": raw_short,
            "refinedExcludedShortTracks": refined_short,
        },
    }
    adapter_sha256, adapter_size = _write_json_artifact(
        work / _ADAPTER_OUTPUT, adapter_document, context=context
    )
    command_document = {
        "schemaVersion": 1,
        "contract": "patina-refine-colmap-engine-command-evidence-v1",
        "plan": [
            {
                "operation": operation.operation,
                "options": {name: value for name, value in operation.options},
            }
            for operation in build_primary_operation_plan(request)
        ],
        "executed": [operation.document() for operation in clock.records],
    }
    command_sha256, command_size = _write_json_artifact(
        work / _COMMAND_EVIDENCE_OUTPUT, command_document, context=context
    )

    outputs = {
        _ADAPTER_OUTPUT: adapter_sha256,
        _ALIGNED_TAR_OUTPUT: aligned_tar_sha256,
        _DATABASE_OUTPUT: database_sha256,
        _COMMAND_EVIDENCE_OUTPUT: command_sha256,
        _PAIRS_OUTPUT: pairs_sha256,
        _SEED_TAR_OUTPUT: seed_tar_sha256,
        _RAW_TAR_OUTPUT: raw_tar_sha256,
    }
    if tuple(sorted(outputs)) != NATIVE_ENGINE_OUTPUT_TOKENS:
        raise _engine_failed(
            "the child produced a token set other than the closed output universe"
        )
    sizes = {
        _ADAPTER_OUTPUT: adapter_size,
        _ALIGNED_TAR_OUTPUT: aligned_tar_size,
        _DATABASE_OUTPUT: database_size,
        _COMMAND_EVIDENCE_OUTPUT: command_size,
        _PAIRS_OUTPUT: pairs_size,
        _SEED_TAR_OUTPUT: seed_tar_size,
        _RAW_TAR_OUTPUT: raw_tar_size,
    }
    return {
        "contract": ENGINE_REPORT_CONTRACT,
        "schemaVersion": ENGINE_REPORT_SCHEMA_VERSION,
        "cliVersion": toolchain.manifest.colmap_version,
        "bindingVersion": binding_version,
        "selectedEngine": PRIMARY_ENGINE,
        "evidence": _evidence_document(evidence),
        "alignment": {
            "scale": float(proposal.scale),
            "rotation": [list(row) for row in proposal.rotation],
            "translationMeters": list(proposal.translation),
            "rawPoseDigestSha256": raw_digest,
            "alignedPoseDigestSha256": aligned_digest,
        },
        "telemetry": {
            "durationMs": clock.elapsed_ms,
            "iterations": len(clock.records),
            "vramPeakMb": 0,
            "commandCount": 1,
            "metrics": {
                "candidatePairs": candidate_pairs,
                "verifiedGeometries": verified_geometries,
                "connectedFraction": connected_fraction,
                "rawTracks": len(raw_tracks),
                "refinedTracks": len(refined_tracks),
                "rawExcludedRepeatedImageTracks": raw_repeated,
                "refinedExcludedRepeatedImageTracks": refined_repeated,
                "rawExcludedShortTracks": raw_short,
                "refinedExcludedShortTracks": refined_short,
                "alignmentScale": float(proposal.scale),
                "bundleTerminationType": str(bundle_evidence["terminationType"]),
                "bundleResiduals": int(bundle_evidence["numResiduals"]),
                "totalOutputBytes": sum(sizes.values()),
            },
        },
        "outputs": {token: {"sha256": digest} for token, digest in outputs.items()},
    }


def _evidence_document(evidence: Any) -> dict[str, Any]:
    return {
        "inputImages": evidence.input_images,
        "registeredImagesBefore": evidence.registered_images_before,
        "registeredImagesAfter": evidence.registered_images_after,
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
    }


def _connected_fraction(
    names: Sequence[str],
    match_rows: Sequence[Mapping[str, Any]],
) -> float:
    """Largest verified-match component as a fraction of the engine universe."""

    parent = {name: name for name in names}

    def find(name: str) -> str:
        while parent[name] != name:
            parent[name] = parent[parent[name]]
            name = parent[name]
        return name

    for row in match_rows:
        if int(row["verifiedInliers"]) < MIN_VERIFIED_INLIERS:
            continue
        first_root = find(str(row["first"]))
        second_root = find(str(row["second"]))
        if first_root != second_root:
            parent[second_root] = first_root
    sizes: dict[str, int] = {}
    for name in names:
        root = find(name)
        sizes[root] = sizes.get(root, 0) + 1
    return max(sizes.values(), default=0) / len(names)


def _open_reconstruction(path: Path) -> Any:
    import pycolmap  # noqa: PLC0415 - native import stays inside the child

    return pycolmap.Reconstruction(path)


def _open_database(path: Path) -> Any:
    import pycolmap  # noqa: PLC0415 - native import stays inside the child

    return pycolmap.Database.open(path)


def _write_aligned_model(source: Path, destination: Path, rebase: Sim3) -> None:
    """Apply one similarity to the whole reconstruction and write it out.

    ``Reconstruction.transform`` moves POINTS as well as cameras, which is what
    keeps the reprojection residuals invariant under the rebase -- so the
    published aligned model and the pre-alignment refined model carry the same
    evidence, and only the gauge differs.
    """

    import numpy  # noqa: PLC0415 - native import stays inside the child
    import pycolmap  # noqa: PLC0415 - native import stays inside the child

    reconstruction = pycolmap.Reconstruction(source)
    transform = pycolmap.Sim3d(
        float(rebase.scale),
        pycolmap.Rotation3d(
            numpy.asarray(
                [list(row) for row in rebase.rotation],
                dtype=numpy.float64,
            )
        ),
        numpy.asarray(list(rebase.translation), dtype=numpy.float64),
    )
    reconstruction.transform(transform)
    destination.mkdir(mode=0o700, exist_ok=False)
    reconstruction.write(destination)


def _source_row(packet: ExtractedColmapPacket, frame: ColmapEngineFrame) -> Any:
    ledger = packet.source_ledger
    if ledger is None:
        raise _engine_failed(
            "the packet declared no source ledger, so evidence cannot name the "
            "capture archive its rasters came from"
        )
    # Source rows carry no engine identity by design: the extractor already
    # bound row ``i`` to frame ``i`` and checked that the row's
    # ``sourceImageName`` equals the frame's, so ordinal IS the join and adding
    # a second key would be a copy of a fact already proven.  The two guards
    # below re-state that binding at the point of USE rather than trusting it.
    if frame.ordinal >= len(ledger.rows):
        raise _engine_failed(
            f"the packet source ledger has no row at ordinal {frame.ordinal}"
        )
    row = ledger.rows[frame.ordinal]
    if row.ordinal != frame.ordinal or row.source_image_name != frame.source_image_name:
        raise _engine_failed(
            f"packet source ledger row {frame.ordinal} is not bound to its frame"
        )
    return row


def _source_archive_key(packet: ExtractedColmapPacket, frame: ColmapEngineFrame) -> str:
    return str(_source_row(packet, frame).source_archive_key)


def _source_member(packet: ExtractedColmapPacket, frame: ColmapEngineFrame) -> str:
    return str(_source_row(packet, frame).source_member)


def _source_sha256(packet: ExtractedColmapPacket, frame: ColmapEngineFrame) -> str:
    return str(_source_row(packet, frame).source_sha256)


def _source_size_bytes(packet: ExtractedColmapPacket, frame: ColmapEngineFrame) -> int:
    return int(_source_row(packet, frame).source_size_bytes)


def _materializer_id(packet: ExtractedColmapPacket) -> str:
    ledger = packet.adapter_ledger
    if ledger is None:
        raise _engine_failed(
            "the packet declared no adapter ledger, so evidence cannot name the "
            "raster adapter that produced its engine images"
        )
    return str(ledger.materializer_id)


class RefineColmapBackend:
    """The composed COLMAP 4.0.2 primary path, and the refusal for everything else.

    R121 authorised writing this body; it did NOT make it qualified.  The class
    attributes below are the executable posture, and each one means "a real run
    on the qualified host established the named property", not "the code exists".
    """

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

    def run_primary(
        self,
        packet: ExtractedColmapPacket,
        *,
        context: NativeChildContext,
        deadline: RefineDeadline,
        toolchain: ColmapToolchain,
        clock: _OperationClock | None = None,
    ) -> dict[str, Any]:
        if type(packet) is not ExtractedColmapPacket:
            raise _fail("the primary plan requires an extracted COLMAP packet")
        if type(context) is not NativeChildContext:
            raise _fail("the primary plan requires the native child context")
        if not context.is_verified_native_boundary:
            raise _fail(
                "the primary plan may only run inside a verified native child",
                _ENGINE_FAILED,
            )
        if type(deadline) is not RefineDeadline:
            raise _fail("the primary plan requires the carried refine deadline")
        if type(toolchain) is not ColmapToolchain or toolchain.qualified is not True:
            raise _fail(
                "the primary plan requires the qualified pinned toolchain",
                _ENGINE_FAILED,
            )
        return _run_primary_plan(
            packet,
            context=context,
            deadline=deadline,
            toolchain=toolchain,
            clock=clock if clock is not None else _OperationClock(),
        )

    def run_fallback(self, *_args: object, **_kwargs: object) -> None:
        raise _fail(
            "COLMAP position-prior fallback is not I90-qualified",
            _FALLBACK_UNQUALIFIED,
        )


@native_engine_entrypoint
def run_refine_colmap_native(
    request: Mapping[str, Any],
    context: NativeChildContext,
) -> dict[str, Any]:
    """Run one COLMAP 4.0.2 primary reconstruction inside the native child.

    Everything this function may touch is already bounded by the time it is
    called: the request names one manifest token, the extractor opens only the
    declared members under the leased ``packet/`` surface, and the toolchain is
    the pinned prefix or nothing.  The order below is not incidental --
    ``load_qualified_colmap_toolchain`` runs BEFORE extraction so a drifted box
    is refused while the lease is still empty.
    """

    deadline = context.carried_deadline()
    toolchain = load_qualified_colmap_toolchain(context=context, deadline=deadline)
    clock = _OperationClock()
    try:
        with extract_colmap_packet(request, context) as packet:
            return RefineColmapBackend().run_primary(
                packet,
                context=context,
                deadline=deadline,
                toolchain=toolchain,
                clock=clock,
            )
    finally:
        # The pinned executable descriptor is this function's to release on
        # every outcome.  It cannot leak past the child -- the process exits
        # moments later -- but a descriptor still open when the boundary counts
        # what the child holds is a difference, and differences are what this
        # boundary refuses.
        toolchain.close()
