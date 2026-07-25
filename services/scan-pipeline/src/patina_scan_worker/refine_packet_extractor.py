"""Bounded USTAR extraction for the disabled native Refine packet.

This module owns only the child-side extraction boundary.  It never opens a
caller display path or ``/proc/self/fd`` alias: source archive reads are
positional reads from descriptors already pinned by ``refine_native_process``.
Destinations are created descriptor-relatively beneath the ``packet/`` child of
the parent-provisioned 0700 workspace leased through
:meth:`NativeChildContext.workspace_descriptor`.  The extractor borrows that
directory; it never creates, names, or removes the workspace root or any of its
siblings, so a SIGKILLed child can no longer strand scratch — the parent
performs bounded descriptor-relative cleanup after every child outcome.  The
child-side ledger cleanup retained here is a fast-path courtesy, not the
authority.  Execution, output handoff, publication, fallback, and stage
registration remain separate disabled gates.

The two optional provenance ledgers (``source-ledger`` and ``adapter-ledger``)
are parsed here rather than left opaque.  Their bytes are bound to the packet
manifest exactly like every other member, and their rows are cross-checked
against the manifest-declared member universe and the extracted engine request.
What they cannot do is prove anything about objects outside the packet: the
source HEIC digests a source ledger declares have no counterpart inside the
archive, so they stay carried claims rather than verified identities.
"""

from __future__ import annotations

import hashlib
import json
import os
import re
import stat
from collections.abc import Iterator, Mapping, Sequence
from contextlib import contextmanager
from dataclasses import dataclass, field
from pathlib import PurePosixPath
from typing import TYPE_CHECKING, Any

from .refine_adapter import AdapterError
from .refine_native_process import (
    NATIVE_CHILD_MAX_PINNED_FILE_BYTES,
    NATIVE_CHILD_MAX_PINNED_TOTAL_BYTES,
    NATIVE_WORKSPACE_PACKET_SUBDIRECTORY,
    NativeChildContext,
)

if TYPE_CHECKING:
    from .refine_colmap_backend import (
        ColmapEngineRequest,
        ColmapPacketManifest,
        ColmapPacketMember,
    )

COLMAP_PACKET_TAR_BLOCK_BYTES = 512
COLMAP_PACKET_MEMBER_MAX_BYTES = NATIVE_CHILD_MAX_PINNED_FILE_BYTES
COLMAP_PACKET_EXTRACTED_MAX_BYTES = NATIVE_CHILD_MAX_PINNED_TOTAL_BYTES

# The closed member-role universe.  ``load_colmap_packet_manifest`` owns the
# authoritative manifest-level copy of this set; it is restated here as an
# executable constant because extraction is the step that actually creates
# files, and it must refuse a role it does not understand rather than treat it
# as an inert blob.  ``test_packet_role_universe_matches_the_manifest_loader``
# guards the two copies against drift.
COLMAP_PACKET_ENGINE_REQUEST_ROLE = "engine-request"
COLMAP_PACKET_ENGINE_IMAGE_ROLE = "engine-image"
COLMAP_PACKET_SOURCE_LEDGER_ROLE = "source-ledger"
COLMAP_PACKET_ADAPTER_LEDGER_ROLE = "adapter-ledger"
COLMAP_PACKET_MEMBER_ROLES = frozenset(
    {
        COLMAP_PACKET_ENGINE_REQUEST_ROLE,
        COLMAP_PACKET_ENGINE_IMAGE_ROLE,
        COLMAP_PACKET_SOURCE_LEDGER_ROLE,
        COLMAP_PACKET_ADAPTER_LEDGER_ROLE,
    }
)
# Both ledgers are optional and appear at most once.  Their destination paths
# are exact: a ledger is a packet-root document, never a file hiding inside the
# engine image tree.  This is a chosen convention, not one derived from an
# existing producer -- no production packet builder exists yet.
COLMAP_PACKET_LEDGER_MEMBER_PATHS: Mapping[str, str] = {
    COLMAP_PACKET_SOURCE_LEDGER_ROLE: "source-ledger-v1.json",
    COLMAP_PACKET_ADAPTER_LEDGER_ROLE: "adapter-ledger-v1.json",
}
# A ledger is read into memory whole, so it carries the same 4 MiB envelope the
# engine request uses, not the 128 MiB per-member archive ceiling.  400 rows of
# either schema is well under 200 KiB.
COLMAP_PACKET_LEDGER_MAX_BYTES = 4 * 1024 * 1024
SOURCE_LEDGER_SCHEMA_VERSION = 1
SOURCE_LEDGER_CONTRACT = "patina-refine-colmap-source-ledger-v1"
ADAPTER_LEDGER_SCHEMA_VERSION = 1
ADAPTER_LEDGER_CONTRACT = "patina-refine-colmap-adapter-ledger-v1"

# Two different numbers are in play and they are not the same contract.
#
# * ``COLMAP_PACKET_MIN_ENGINE_IMAGES`` / ``COLMAP_PACKET_MAX_ENGINE_IMAGES``
#   in ``refine_colmap_backend`` (3 and 400) are the authoritative *enforced*
#   packet bound.  ``_validate_packet_member_roles`` imports those exact
#   constants rather than restating them, and rejects anything outside them.
# * 200--400 below is the separate *operational pilot target* -- the frame
#   count a real Field capture is expected to produce.  It is deliberately NOT
#   enforced: ``refine_colmap_backend.PILOT_200_400_FRAME_RANGE_QUALIFIED`` is
#   still ``False``, no packet in that range has ever been built or extracted,
#   and every fixture in this repository uses 3 frames.  Enforcing it here
#   would reject the only packets that exist while proving nothing.
#
# It is therefore exposed as an explicit, inspectable classification
# (:attr:`ExtractedColmapPacket.within_pilot_frame_range`) so a caller can see
# whether a packet is inside the unqualified pilot band instead of inferring it.
COLMAP_PACKET_PILOT_MIN_ENGINE_IMAGES = 200
COLMAP_PACKET_PILOT_MAX_ENGINE_IMAGES = 400

_PACKET_INVALID = "REFINE_COLMAP_PACKET_INVALID"
_BACKEND_DISABLED = "REFINE_BACKEND_DISABLED"
_ENGINE_FAILED = "REFINE_ENGINE_FAILED"
_ENGINE_CLEANUP_FAILED = "REFINE_ENGINE_CLEANUP_FAILED"
_READ_BYTES = 1024 * 1024
_ZERO_BLOCK = b"\x00" * COLMAP_PACKET_TAR_BLOCK_BYTES
_USTAR_MAGIC = b"ustar\x00"
_USTAR_VERSION = b"00"
_REQUIRED_DIR_FD_FUNCTIONS = (os.open, os.mkdir, os.stat, os.unlink, os.rmdir)
_SHA256_PATTERN = re.compile(r"^[0-9a-f]{64}$")
_MATERIALIZER_ID_PATTERN = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$")
# Roles whose bytes the extractor keeps while copying so it can compare them
# against the re-read extracted file.  Engine images are deliberately absent:
# they are hashed streaming and never held in memory.
_CAPTURED_MEMBER_ROLES = frozenset(
    {
        COLMAP_PACKET_ENGINE_REQUEST_ROLE,
        COLMAP_PACKET_SOURCE_LEDGER_ROLE,
        COLMAP_PACKET_ADAPTER_LEDGER_ROLE,
    }
)


def _fail(message: str, code: str = _PACKET_INVALID) -> AdapterError:
    return AdapterError(message, code)


@dataclass(frozen=True)
class ColmapSourceLedgerRow:
    """One declared pre-raster source object for a single engine frame.

    Every field except the digest/size pair is cross-checked: the ordinal and
    image name must match the extracted engine request, and the member basename
    must match the image name.  ``source_sha256``/``source_size_bytes`` describe
    an object that is not in the packet and are therefore unverifiable here.
    """

    ordinal: int
    source_archive_key: str
    source_member: str
    source_image_name: str
    source_sha256: str
    source_size_bytes: int


@dataclass(frozen=True)
class ColmapSourceLedger:
    """The parsed optional ``source-ledger`` member, bound to this packet."""

    relative_path: str
    sha256: str
    rows: tuple[ColmapSourceLedgerRow, ...]


@dataclass(frozen=True)
class ColmapAdapterLedgerRow:
    """One declared raster-adapter output, fully bound to a packet member."""

    ordinal: int
    engine_image_name: str
    engine_relative_path: str
    engine_sha256: str
    engine_size_bytes: int


@dataclass(frozen=True)
class ColmapAdapterLedger:
    """The parsed optional ``adapter-ledger`` member, bound to this packet.

    ``rows`` covers the manifest's ``engine-image`` universe exactly: a row for
    an undeclared member and a declared member without a row both fail closed.
    ``materializer_id`` is an opaque identity token; nothing here proves which
    adapter build actually produced the bytes.
    """

    relative_path: str
    sha256: str
    materializer_id: str
    rows: tuple[ColmapAdapterLedgerRow, ...]


@dataclass(frozen=True)
class ExtractedColmapPacket:
    """One extraction into the leased workspace, valid while its context is open.

    ``workspace_descriptor`` is a borrowed directory descriptor, not a path:
    consumers must stay descriptor-relative.  The parent owns the underlying
    directory and removes it after the child exits by any route.

    ``source_ledger`` and ``adapter_ledger`` are ``None`` when the packet
    declared no such member; both are optional by contract.
    """

    workspace_descriptor: int
    manifest: ColmapPacketManifest
    engine_request: ColmapEngineRequest
    extracted_relative_paths: tuple[str, ...]
    source_ledger: ColmapSourceLedger | None = None
    adapter_ledger: ColmapAdapterLedger | None = None

    @property
    def engine_image_count(self) -> int:
        return sum(
            1
            for member in self.manifest.members
            if member.role == COLMAP_PACKET_ENGINE_IMAGE_ROLE
        )

    @property
    def within_pilot_frame_range(self) -> bool:
        """Whether this packet sits in the 200--400 operational pilot band.

        This is a classification, not a qualification: the band itself is
        unproven (``PILOT_200_400_FRAME_RANGE_QUALIFIED`` is ``False``) and the
        enforced packet bound stays 3--400.
        """

        return (
            COLMAP_PACKET_PILOT_MIN_ENGINE_IMAGES
            <= self.engine_image_count
            <= COLMAP_PACKET_PILOT_MAX_ENGINE_IMAGES
        )


@dataclass
class _ExtractionLedger:
    root_descriptor: int
    root_identity: tuple[int, int]
    files: list[str]
    directories: list[str]
    file_identities: dict[str, tuple[int, int]] = field(default_factory=dict)
    directory_identities: dict[str, tuple[int, int]] = field(default_factory=dict)


def _require_native_child_session(context: NativeChildContext) -> None:
    if type(context) is not NativeChildContext:
        raise _fail(
            "COLMAP packet extraction requires a verified native child boundary",
            _BACKEND_DISABLED,
        )
    try:
        verified_native_boundary = context.is_verified_native_boundary
    except BaseException:  # noqa: BLE001 - boundary inspection must fail closed
        raise _fail(
            "cannot authenticate COLMAP packet native child boundary",
            _BACKEND_DISABLED,
        ) from None
    if verified_native_boundary is not True:
        raise _fail(
            "COLMAP packet extraction requires a verified native child boundary",
            _BACKEND_DISABLED,
        )
    context.remaining_seconds()


def _require_extraction_platform_capabilities() -> None:
    required_constants = ("O_NOFOLLOW", "O_DIRECTORY", "O_CLOEXEC", "O_NONBLOCK")
    required_functions = (
        "open",
        "mkdir",
        "stat",
        "unlink",
        "rmdir",
        "pread",
        "pwrite",
    )
    try:
        supported = (
            os.name == "posix"
            and all(
                hasattr(os, constant) and getattr(os, constant) != 0
                for constant in required_constants
            )
            and all(callable(getattr(os, name, None)) for name in required_functions)
            and hasattr(os, "supports_dir_fd")
            and all(
                function in os.supports_dir_fd
                for function in _REQUIRED_DIR_FD_FUNCTIONS
            )
            and hasattr(os, "supports_follow_symlinks")
            and os.stat in os.supports_follow_symlinks
            and hasattr(os, "supports_fd")
            and os.listdir in os.supports_fd
        )
    except BaseException:  # noqa: BLE001 - platform inspection must fail closed
        supported = False
    if not supported:
        raise _fail(
            "COLMAP packet extraction platform lacks required descriptor safety",
            _BACKEND_DISABLED,
        )


@dataclass(frozen=True)
class _PacketLedgerMembers:
    """The optional ledger members a validated manifest declared, if any."""

    source: ColmapPacketMember | None
    adapter: ColmapPacketMember | None
    engine_image_count: int

    @property
    def declared_roles(self) -> frozenset[str]:
        roles: set[str] = set()
        if self.source is not None:
            roles.add(COLMAP_PACKET_SOURCE_LEDGER_ROLE)
        if self.adapter is not None:
            roles.add(COLMAP_PACKET_ADAPTER_LEDGER_ROLE)
        return frozenset(roles)


def _validate_packet_member_roles(
    manifest: ColmapPacketManifest,
) -> _PacketLedgerMembers:
    """Close the role universe and ledger cardinality before touching the disk.

    This repeats bounds ``load_colmap_packet_manifest`` also applies.  That is
    intentional: extraction is reachable from tests and future callers with a
    manifest object it did not build itself, and it must not create a single
    file on the strength of somebody else's validation.  The engine-image bound
    is imported from the backend rather than restated so the two cannot drift.
    """

    from .refine_colmap_backend import (
        COLMAP_PACKET_MAX_ENGINE_IMAGES,
        COLMAP_PACKET_MIN_ENGINE_IMAGES,
    )

    ledgers: dict[str, ColmapPacketMember] = {}
    engine_requests = 0
    engine_images = 0
    for member in manifest.members:
        if member.role not in COLMAP_PACKET_MEMBER_ROLES:
            raise _fail("COLMAP packet member declares a role outside the universe")
        if member.role == COLMAP_PACKET_ENGINE_REQUEST_ROLE:
            engine_requests += 1
            continue
        if member.role == COLMAP_PACKET_ENGINE_IMAGE_ROLE:
            engine_images += 1
            continue
        if member.role in ledgers:
            raise _fail("COLMAP packet declares more than one ledger for a role")
        if member.relative_path != COLMAP_PACKET_LEDGER_MEMBER_PATHS[member.role]:
            raise _fail("COLMAP packet ledger is not at its exact declared path")
        if member.size_bytes > COLMAP_PACKET_LEDGER_MAX_BYTES:
            raise _fail("COLMAP packet ledger exceeds its byte ceiling")
        ledgers[member.role] = member
    if engine_requests != 1:
        raise _fail("COLMAP packet must declare exactly one engine request")
    if not (
        COLMAP_PACKET_MIN_ENGINE_IMAGES
        <= engine_images
        <= COLMAP_PACKET_MAX_ENGINE_IMAGES
    ):
        raise _fail(
            "COLMAP packet must declare between "
            f"{COLMAP_PACKET_MIN_ENGINE_IMAGES} and "
            f"{COLMAP_PACKET_MAX_ENGINE_IMAGES} engine images"
        )
    request_member = manifest.member_by_path.get(manifest.request_member)
    if (
        request_member is None
        or request_member.role != COLMAP_PACKET_ENGINE_REQUEST_ROLE
    ):
        raise _fail("COLMAP packet request member is undeclared or misrouted")
    return _PacketLedgerMembers(
        ledgers.get(COLMAP_PACKET_SOURCE_LEDGER_ROLE),
        ledgers.get(COLMAP_PACKET_ADAPTER_LEDGER_ROLE),
        engine_images,
    )


def _pread_exact(
    descriptor: int,
    *,
    offset: int,
    size_bytes: int,
    context: NativeChildContext,
    label: str,
) -> bytes:
    output = bytearray()
    while len(output) < size_bytes:
        context.remaining_seconds()
        try:
            block = os.pread(
                descriptor,
                min(_READ_BYTES, size_bytes - len(output)),
                offset + len(output),
            )
        except OSError as exc:
            raise _fail(f"cannot read {label}") from exc
        if not block:
            raise _fail(f"{label} ended before its declared size")
        output.extend(block)
    return bytes(output)


def _canonical_relative_path(value: str, label: str) -> str:
    if not value or "\\" in value:
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


def _ledger_relative_path(value: object, label: str) -> str:
    if type(value) is not str:
        raise _fail(f"{label} must be a non-empty POSIX relative path")
    return _canonical_relative_path(value, label)


def _ledger_exact_int(value: object, label: str, *, minimum: int) -> int:
    if type(value) is not int or value < minimum:
        raise _fail(f"{label} must be an integer >= {minimum}")
    return value


def _ledger_sha256(value: object, label: str) -> str:
    if type(value) is not str or _SHA256_PATTERN.fullmatch(value) is None:
        raise _fail(f"{label} must be a lowercase SHA-256")
    return value


def _canonical_json_bytes(value: Any) -> bytes:
    """Mirror the backend's canonical form, including recursion normalization."""

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


def _canonical_ustar_split(value: str, label: str) -> tuple[str, str]:
    name = _canonical_relative_path(value, label)
    encoded = name.encode("ascii")
    if len(encoded) <= 100:
        return "", name
    for separator in range(len(encoded) - 1, -1, -1):
        if encoded[separator : separator + 1] != b"/":
            continue
        prefix = encoded[:separator]
        leaf = encoded[separator + 1 :]
        if prefix and leaf and len(prefix) <= 155 and len(leaf) <= 100:
            return prefix.decode("ascii"), leaf.decode("ascii")
    raise _fail(f"{label} is not representable by canonical USTAR")


def _canonical_ustar_member_name(value: str, label: str) -> str:
    name = _canonical_relative_path(value, label)
    _canonical_ustar_split(name, label)
    return name


def _tar_text_field(
    header: bytes,
    *,
    start: int,
    length: int,
    label: str,
) -> str:
    raw = header[start : start + length]
    marker = raw.find(b"\x00")
    if marker >= 0:
        if any(raw[marker:]):
            raise _fail(f"{label} has non-canonical NUL padding")
        raw = raw[:marker]
    try:
        return raw.decode("ascii")
    except UnicodeDecodeError as exc:
        raise _fail(f"{label} is not portable ASCII") from exc


def _tar_octal_field(raw: bytes, *, label: str) -> int:
    if re.fullmatch(rb"[0-7]{11}\x00", raw) is None:
        raise _fail(f"{label} is not canonical USTAR octal")
    return int(raw[:11], 8)


def _parse_ustar_header(header: bytes) -> tuple[str, int]:
    if len(header) != COLMAP_PACKET_TAR_BLOCK_BYTES:
        raise _fail("COLMAP packet archive header is truncated")
    if header[257:263] != _USTAR_MAGIC or header[263:265] != _USTAR_VERSION:
        raise _fail("COLMAP packet archive must use canonical USTAR headers")
    if header[156:157] != b"0":
        raise _fail(
            "COLMAP packet archive rejects links, directories, devices, FIFOs, "
            "PAX/GNU extensions, and sparse entries"
        )
    if any(header[157:257]):
        raise _fail("COLMAP packet regular member has a non-empty link target")
    if any(header[500:512]):
        raise _fail("COLMAP packet archive header padding is not zero")
    if (
        header[100:108] != b"0000600\x00"
        or header[108:116] != b"0000000\x00"
        or header[116:124] != b"0000000\x00"
        or header[136:148] != b"00000000000\x00"
        or any(header[265:329])
        or header[329:337] != b"0000000\x00"
        or header[337:345] != b"0000000\x00"
    ):
        raise _fail("COLMAP packet archive member metadata is not canonical")
    checksum_field = header[148:156]
    if re.fullmatch(rb"[0-7]{6}\x00 ", checksum_field) is None:
        raise _fail("COLMAP packet archive checksum field is not canonical")
    expected_checksum = int(checksum_field[:6], 8)
    actual_checksum = sum(header[:148]) + (8 * ord(" ")) + sum(header[156:])
    if expected_checksum != actual_checksum:
        raise _fail("COLMAP packet archive header checksum does not match")
    name = _tar_text_field(
        header,
        start=0,
        length=100,
        label="COLMAP packet archive member name",
    )
    prefix = _tar_text_field(
        header,
        start=345,
        length=155,
        label="COLMAP packet archive member prefix",
    )
    archive_member = f"{prefix}/{name}" if prefix else name
    expected_prefix, expected_name = _canonical_ustar_split(
        archive_member,
        "COLMAP packet archive member",
    )
    if (prefix, name) != (expected_prefix, expected_name):
        raise _fail("COLMAP packet archive member name/prefix split is not canonical")
    size_bytes = _tar_octal_field(
        header[124:136],
        label="COLMAP packet archive member size",
    )
    if size_bytes < 1 or size_bytes > COLMAP_PACKET_MEMBER_MAX_BYTES:
        raise _fail("COLMAP packet archive member exceeds its byte ceiling")
    return archive_member, size_bytes


def _attempt_descriptor_close(
    descriptor: int,
    label: str,
) -> tuple[str, OSError] | None:
    try:
        os.close(descriptor)
    except OSError as exc:
        return f"cannot close {label}", exc
    return None


def _raise_cleanup_failures(
    failures: Sequence[tuple[str, OSError]],
    *,
    cause: BaseException | None = None,
) -> None:
    if not failures:
        raise AssertionError("cleanup failure report cannot be empty")
    error = _fail(
        "; ".join(message for message, _exception in failures),
        _ENGINE_CLEANUP_FAILED,
    )
    raise error from (cause if cause is not None else failures[0][1])


def _lease_extraction_workspace(context: NativeChildContext) -> _ExtractionLedger:
    """Borrow the parent-provisioned ``packet/`` directory; never own the root.

    Extraction takes the ``packet/`` child of the lease rather than the lease
    root itself.  The root is shared: item 3 points an exec'd COLMAP's
    ``TMPDIR`` and ``cwd`` at its siblings ``tmp/`` and ``work/``, so requiring
    an empty *root* here would break the moment those orderings shifted.  The
    empty-at-borrow precondition therefore belongs to ``packet/``, which nothing
    else writes.  Removal of the whole tree still stays exclusively with the
    parent.
    """

    leased_descriptor = context.workspace_descriptor()
    root_descriptor: int | None = None
    try:
        metadata = os.fstat(leased_descriptor)
        if (
            not stat.S_ISDIR(metadata.st_mode)
            or metadata.st_uid != os.geteuid()
            or stat.S_IMODE(metadata.st_mode) != 0o700
        ):
            raise _fail(
                "COLMAP packet workspace lease is not a private owned directory",
                _ENGINE_FAILED,
            )
        root_descriptor = os.open(
            NATIVE_WORKSPACE_PACKET_SUBDIRECTORY,
            os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW | os.O_CLOEXEC,
            dir_fd=leased_descriptor,
        )
        os.set_inheritable(root_descriptor, False)
        root_metadata = os.fstat(root_descriptor)
        if (
            not stat.S_ISDIR(root_metadata.st_mode)
            or root_metadata.st_uid != os.geteuid()
            or stat.S_IMODE(root_metadata.st_mode) != 0o700
            or (root_metadata.st_dev, root_metadata.st_ino)
            == (metadata.st_dev, metadata.st_ino)
        ):
            raise _fail(
                "COLMAP packet workspace lease is not a private owned directory",
                _ENGINE_FAILED,
            )
        if os.listdir(root_descriptor):
            raise _fail(
                "COLMAP packet workspace lease is not empty",
                _ENGINE_FAILED,
            )
    except BaseException as exc:
        if root_descriptor is not None:
            close_failure = _attempt_descriptor_close(
                root_descriptor,
                "failed COLMAP packet workspace borrow",
            )
            if close_failure is not None:
                _raise_cleanup_failures([close_failure], cause=exc)
        if isinstance(exc, AdapterError):
            raise
        raise _fail(
            "cannot borrow the parent-provisioned COLMAP packet workspace",
            _ENGINE_FAILED,
        ) from exc
    return _ExtractionLedger(
        root_descriptor,
        (root_metadata.st_dev, root_metadata.st_ino),
        [],
        [],
    )


def _open_existing_directory_chain(
    root_descriptor: int,
    parts: Sequence[str],
    *,
    expected_identities: Mapping[str, tuple[int, int]] | None = None,
) -> int:
    descriptor = os.dup(root_descriptor)
    prefix: list[str] = []
    try:
        os.set_inheritable(descriptor, False)
        for part in parts:
            prefix.append(part)
            child = os.open(
                part,
                os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW | os.O_CLOEXEC,
                dir_fd=descriptor,
            )
            if expected_identities is not None:
                try:
                    relative = "/".join(prefix)
                    expected_identity = expected_identities.get(relative)
                    child_metadata = os.fstat(child)
                    if (
                        expected_identity is None
                        or (
                            child_metadata.st_dev,
                            child_metadata.st_ino,
                        )
                        != expected_identity
                    ):
                        raise _fail(
                            f"COLMAP packet directory identity changed at {relative}"
                        )
                except BaseException as exc:
                    close_failure = _attempt_descriptor_close(
                        child,
                        "replaced COLMAP packet directory-chain descriptor",
                    )
                    if close_failure is not None:
                        _raise_cleanup_failures([close_failure], cause=exc)
                    raise
            previous = descriptor
            descriptor = -1
            close_failure = _attempt_descriptor_close(
                previous,
                "COLMAP packet directory-chain descriptor",
            )
            if close_failure is not None:
                failures = [close_failure]
                child_close_failure = _attempt_descriptor_close(
                    child,
                    "new COLMAP packet directory-chain descriptor",
                )
                if child_close_failure is not None:
                    failures.append(child_close_failure)
                _raise_cleanup_failures(failures)
            descriptor = child
        return descriptor
    except BaseException as exc:
        if descriptor >= 0:
            close_failure = _attempt_descriptor_close(
                descriptor,
                "COLMAP packet directory-chain descriptor",
            )
            if close_failure is not None:
                _raise_cleanup_failures([close_failure], cause=exc)
        raise


def _open_directory_chain(
    ledger: _ExtractionLedger,
    parts: Sequence[str],
) -> int:
    descriptor = os.dup(ledger.root_descriptor)
    prefix: list[str] = []
    try:
        os.set_inheritable(descriptor, False)
        for part in parts:
            prefix.append(part)
            relative = "/".join(prefix)
            expected_identity = ledger.directory_identities.get(relative)
            if expected_identity is None:
                if relative in ledger.directories:
                    raise _fail(
                        f"COLMAP packet directory identity is missing at {relative}"
                    )
                os.mkdir(part, mode=0o700, dir_fd=descriptor)
                try:
                    created_metadata = os.stat(
                        part,
                        dir_fd=descriptor,
                        follow_symlinks=False,
                    )
                    if (
                        not stat.S_ISDIR(created_metadata.st_mode)
                        or created_metadata.st_uid != os.geteuid()
                        or stat.S_IMODE(created_metadata.st_mode) != 0o700
                    ):
                        raise _fail("COLMAP packet member directory is not private")
                except BaseException as exc:
                    try:
                        os.rmdir(part, dir_fd=descriptor)
                    except OSError as cleanup_exc:
                        _raise_cleanup_failures(
                            [
                                (
                                    (
                                        "cannot roll back unledgered COLMAP "
                                        "packet member directory"
                                    ),
                                    cleanup_exc,
                                )
                            ],
                            cause=exc,
                        )
                    raise
                expected_identity = (
                    created_metadata.st_dev,
                    created_metadata.st_ino,
                )
                ledger.directories.append(relative)
                ledger.directory_identities[relative] = expected_identity
            child = os.open(
                part,
                os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW | os.O_CLOEXEC,
                dir_fd=descriptor,
            )
            try:
                child_metadata = os.fstat(child)
                if (
                    not stat.S_ISDIR(child_metadata.st_mode)
                    or child_metadata.st_uid != os.geteuid()
                    or stat.S_IMODE(child_metadata.st_mode) != 0o700
                    or (
                        child_metadata.st_dev,
                        child_metadata.st_ino,
                    )
                    != expected_identity
                ):
                    raise _fail(
                        f"COLMAP packet member directory identity changed at {relative}"
                    )
            except BaseException as exc:
                close_failure = _attempt_descriptor_close(
                    child,
                    "invalid COLMAP packet member directory",
                )
                if close_failure is not None:
                    _raise_cleanup_failures([close_failure], cause=exc)
                raise
            previous = descriptor
            descriptor = -1
            close_failure = _attempt_descriptor_close(
                previous,
                "COLMAP packet directory-chain descriptor",
            )
            if close_failure is not None:
                failures = [close_failure]
                child_close_failure = _attempt_descriptor_close(
                    child,
                    "new COLMAP packet directory-chain descriptor",
                )
                if child_close_failure is not None:
                    failures.append(child_close_failure)
                _raise_cleanup_failures(failures)
            descriptor = child
        return descriptor
    except OSError as exc:
        if descriptor >= 0:
            close_failure = _attempt_descriptor_close(
                descriptor,
                "COLMAP packet directory-chain descriptor",
            )
            if close_failure is not None:
                _raise_cleanup_failures([close_failure], cause=exc)
        raise _fail(
            "cannot create or open a private COLMAP packet member directory"
        ) from exc
    except BaseException as exc:
        if descriptor >= 0:
            close_failure = _attempt_descriptor_close(
                descriptor,
                "COLMAP packet directory-chain descriptor",
            )
            if close_failure is not None:
                _raise_cleanup_failures([close_failure], cause=exc)
        raise


def _create_extracted_member(
    ledger: _ExtractionLedger,
    member: ColmapPacketMember,
) -> int:
    parts = PurePosixPath(member.relative_path).parts
    parent_descriptor = _open_directory_chain(ledger, parts[:-1])
    descriptor: int | None = None
    identity_recorded = False
    try:
        descriptor = os.open(
            parts[-1],
            os.O_CREAT | os.O_EXCL | os.O_RDWR | os.O_NOFOLLOW | os.O_CLOEXEC,
            0o600,
            dir_fd=parent_descriptor,
        )
        metadata = os.fstat(descriptor)
        identity = (metadata.st_dev, metadata.st_ino)
        if member.relative_path in ledger.file_identities:
            raise _fail("COLMAP packet file creation ledger contains a duplicate")
        ledger.files.append(member.relative_path)
        ledger.file_identities[member.relative_path] = identity
        identity_recorded = True
        os.set_inheritable(descriptor, False)
        if (
            not stat.S_ISREG(metadata.st_mode)
            or metadata.st_uid != os.geteuid()
            or stat.S_IMODE(metadata.st_mode) != 0o600
            or metadata.st_nlink != 1
        ):
            raise _fail("extracted COLMAP packet member is not private")
    except BaseException as exc:
        cleanup_failures: list[tuple[str, OSError]] = []
        if descriptor is not None and not identity_recorded:
            try:
                descriptor_metadata = os.fstat(descriptor)
                path_metadata = os.stat(
                    parts[-1],
                    dir_fd=parent_descriptor,
                    follow_symlinks=False,
                )
                if not stat.S_ISREG(path_metadata.st_mode) or (
                    path_metadata.st_dev,
                    path_metadata.st_ino,
                ) != (
                    descriptor_metadata.st_dev,
                    descriptor_metadata.st_ino,
                ):
                    raise OSError("unledgered extracted member identity is not exact")
                os.unlink(parts[-1], dir_fd=parent_descriptor)
            except BaseException as cleanup_exc:  # noqa: BLE001 - cleanup is fixed
                cleanup_failures.append(
                    (
                        "cannot roll back unledgered extracted COLMAP packet member",
                        (
                            cleanup_exc
                            if isinstance(cleanup_exc, OSError)
                            else OSError("unledgered member rollback failed")
                        ),
                    )
                )
        if descriptor is not None:
            close_failure = _attempt_descriptor_close(
                descriptor,
                "failed extracted COLMAP packet member",
            )
            if close_failure is not None:
                cleanup_failures.append(close_failure)
        parent_close_failure = _attempt_descriptor_close(
            parent_descriptor,
            "COLMAP packet member parent directory",
        )
        if parent_close_failure is not None:
            cleanup_failures.append(parent_close_failure)
        if cleanup_failures:
            _raise_cleanup_failures(cleanup_failures, cause=exc)
        if isinstance(exc, OSError):
            raise _fail("cannot create an extracted COLMAP packet member") from exc
        raise
    assert descriptor is not None
    parent_close_failure = _attempt_descriptor_close(
        parent_descriptor,
        "COLMAP packet member parent directory",
    )
    if parent_close_failure is not None:
        member_close_failure = _attempt_descriptor_close(
            descriptor,
            "extracted COLMAP packet member after parent close failure",
        )
        failures = [parent_close_failure]
        if member_close_failure is not None:
            failures.append(member_close_failure)
        _raise_cleanup_failures(failures)
    return descriptor


def _copy_archive_member(
    source_descriptor: int,
    *,
    source_offset: int,
    destination_descriptor: int,
    member: ColmapPacketMember,
    context: NativeChildContext,
) -> bytes | None:
    digest = hashlib.sha256()
    copied = 0
    if (
        member.role in COLMAP_PACKET_LEDGER_MEMBER_PATHS
        and member.size_bytes > COLMAP_PACKET_LEDGER_MAX_BYTES
    ):
        raise _fail("COLMAP packet ledger exceeds its byte ceiling")
    captured_payload = bytearray() if member.role in _CAPTURED_MEMBER_ROLES else None
    while copied < member.size_bytes:
        context.remaining_seconds()
        try:
            block = os.pread(
                source_descriptor,
                min(_READ_BYTES, member.size_bytes - copied),
                source_offset + copied,
            )
        except OSError as exc:
            raise _fail("cannot read a declared COLMAP packet member") from exc
        if not block:
            raise _fail("COLMAP packet member ended before its declared size")
        if captured_payload is not None:
            captured_payload.extend(block)
        digest.update(block)
        written = 0
        while written < len(block):
            context.remaining_seconds()
            try:
                count = os.pwrite(
                    destination_descriptor,
                    block[written:],
                    copied + written,
                )
            except OSError as exc:
                raise _fail("cannot write an extracted COLMAP packet member") from exc
            if count <= 0:
                raise _fail("COLMAP packet member extraction made no write progress")
            written += count
        copied += len(block)
    if digest.hexdigest() != member.sha256:
        raise _fail("COLMAP packet member SHA-256 does not match its manifest")
    try:
        os.fsync(destination_descriptor)
        metadata = os.fstat(destination_descriptor)
    except OSError as exc:
        raise _fail("cannot synchronize an extracted COLMAP packet member") from exc
    if metadata.st_size != member.size_bytes:
        raise _fail("extracted COLMAP packet member size does not match its manifest")
    context.remaining_seconds()
    return bytes(captured_payload) if captured_payload is not None else None


def _close_descriptor_or_fail(descriptor: int, label: str) -> None:
    failure = _attempt_descriptor_close(descriptor, label)
    if failure is not None:
        _raise_cleanup_failures([failure])


def _revalidate_chunk_after_extraction(
    chunk: Any,
    context: NativeChildContext,
) -> None:
    descriptor = context.pinned_file_descriptor(chunk.token)
    try:
        metadata = os.fstat(descriptor)
    except OSError as exc:
        raise _fail("cannot re-inspect a COLMAP packet archive chunk") from exc
    if not stat.S_ISREG(metadata.st_mode) or metadata.st_size != chunk.size_bytes:
        raise _fail("COLMAP packet archive chunk changed during extraction")
    digest = hashlib.sha256()
    offset = 0
    while offset < chunk.size_bytes:
        context.remaining_seconds()
        try:
            block = os.pread(
                descriptor,
                min(_READ_BYTES, chunk.size_bytes - offset),
                offset,
            )
        except OSError as exc:
            raise _fail("cannot re-read a COLMAP packet archive chunk") from exc
        if not block:
            raise _fail("COLMAP packet archive chunk changed during extraction")
        digest.update(block)
        offset += len(block)
    if digest.hexdigest() != chunk.sha256:
        raise _fail("COLMAP packet archive chunk changed during extraction")


def _extract_archive_chunk(
    *,
    chunk: Any,
    manifest: ColmapPacketManifest,
    context: NativeChildContext,
    ledger: _ExtractionLedger,
    extracted_paths: set[str],
    ledger_payloads: dict[str, bytes] | None = None,
) -> bytes | None:
    descriptor = context.pinned_file_descriptor(chunk.token)
    declared = {
        member.archive_member: member
        for member in manifest.members
        if member.chunk_token == chunk.token
    }
    seen: set[str] = set()
    seen_order: list[str] = []
    request_payload: bytes | None = None
    offset = 0
    found_terminator = False
    if chunk.size_bytes % COLMAP_PACKET_TAR_BLOCK_BYTES != 0:
        raise _fail("COLMAP packet archive size is not USTAR-block aligned")
    while offset < chunk.size_bytes:
        header = _pread_exact(
            descriptor,
            offset=offset,
            size_bytes=COLMAP_PACKET_TAR_BLOCK_BYTES,
            context=context,
            label="COLMAP packet archive header",
        )
        offset += COLMAP_PACKET_TAR_BLOCK_BYTES
        if header == _ZERO_BLOCK:
            second = _pread_exact(
                descriptor,
                offset=offset,
                size_bytes=COLMAP_PACKET_TAR_BLOCK_BYTES,
                context=context,
                label="COLMAP packet archive terminator",
            )
            offset += COLMAP_PACKET_TAR_BLOCK_BYTES
            if second != _ZERO_BLOCK:
                raise _fail("COLMAP packet archive has an ambiguous terminator")
            if offset != chunk.size_bytes:
                raise _fail(
                    "COLMAP packet archive has bytes after its exact terminator"
                )
            found_terminator = True
            break
        archive_member, size_bytes = _parse_ustar_header(header)
        if archive_member in seen:
            raise _fail("COLMAP packet archive repeats a member")
        seen.add(archive_member)
        seen_order.append(archive_member)
        member = declared.get(archive_member)
        if member is None:
            raise _fail("COLMAP packet archive contains an undeclared member")
        if size_bytes != member.size_bytes:
            raise _fail("COLMAP packet archive member size disagrees with its ledger")
        destination_descriptor = _create_extracted_member(ledger, member)
        try:
            payload = _copy_archive_member(
                descriptor,
                source_offset=offset,
                destination_descriptor=destination_descriptor,
                member=member,
                context=context,
            )
        finally:
            _close_descriptor_or_fail(
                destination_descriptor,
                "extracted COLMAP packet member",
            )
        if payload is not None:
            if member.role == COLMAP_PACKET_ENGINE_REQUEST_ROLE:
                if request_payload is not None:
                    raise _fail("COLMAP packet archive repeats the engine request")
                request_payload = payload
            elif ledger_payloads is None:
                raise _fail("COLMAP packet ledger has nowhere to be captured")
            elif member.role in ledger_payloads:
                raise _fail("COLMAP packet archive repeats a ledger role")
            else:
                ledger_payloads[member.role] = payload
        extracted_paths.add(member.relative_path)
        offset += size_bytes
        padding = (-size_bytes) % COLMAP_PACKET_TAR_BLOCK_BYTES
        if padding:
            padding_payload = _pread_exact(
                descriptor,
                offset=offset,
                size_bytes=padding,
                context=context,
                label="COLMAP packet archive member padding",
            )
            if any(padding_payload):
                raise _fail("COLMAP packet archive member padding is not zero")
            offset += padding
    if not found_terminator:
        raise _fail("COLMAP packet archive lacks an exact two-block terminator")
    if seen != set(declared):
        raise _fail("COLMAP packet archive omits a declared member")
    if tuple(seen_order) != tuple(declared):
        raise _fail("COLMAP packet archive member order is not canonical")
    _revalidate_chunk_after_extraction(chunk, context)
    return request_payload


def _cleanup_extraction_workspace(ledger: _ExtractionLedger) -> tuple[str, ...]:
    errors: list[str] = []
    for relative_path in reversed(ledger.files):
        parts = PurePosixPath(relative_path).parts
        parent_descriptor: int | None = None
        try:
            expected_identity = ledger.file_identities.get(relative_path)
            if expected_identity is None:
                raise _fail(f"extracted member identity is missing for {relative_path}")
            parent_descriptor = _open_existing_directory_chain(
                ledger.root_descriptor,
                parts[:-1],
                expected_identities=ledger.directory_identities,
            )
            metadata = os.stat(
                parts[-1],
                dir_fd=parent_descriptor,
                follow_symlinks=False,
            )
            if (
                not stat.S_ISREG(metadata.st_mode)
                or (metadata.st_dev, metadata.st_ino) != expected_identity
            ):
                raise _fail(
                    f"extracted member identity changed before cleanup: {relative_path}"
                )
            os.unlink(parts[-1], dir_fd=parent_descriptor)
        except AdapterError as exc:
            errors.append(str(exc))
        except OSError:
            errors.append(f"cannot remove extracted member {relative_path}")
        finally:
            if parent_descriptor is not None:
                close_failure = _attempt_descriptor_close(
                    parent_descriptor,
                    f"cleanup parent for extracted member {relative_path}",
                )
                if close_failure is not None:
                    errors.append(close_failure[0])
    for relative_path in sorted(
        ledger.directories,
        key=lambda value: (value.count("/"), value),
        reverse=True,
    ):
        parts = PurePosixPath(relative_path).parts
        parent_descriptor = None
        try:
            expected_identity = ledger.directory_identities.get(relative_path)
            if expected_identity is None:
                raise _fail(
                    f"extracted directory identity is missing for {relative_path}"
                )
            parent_descriptor = _open_existing_directory_chain(
                ledger.root_descriptor,
                parts[:-1],
                expected_identities=ledger.directory_identities,
            )
            metadata = os.stat(
                parts[-1],
                dir_fd=parent_descriptor,
                follow_symlinks=False,
            )
            if (
                not stat.S_ISDIR(metadata.st_mode)
                or (metadata.st_dev, metadata.st_ino) != expected_identity
            ):
                raise _fail(
                    f"extracted directory identity changed before cleanup: {relative_path}"
                )
            os.rmdir(parts[-1], dir_fd=parent_descriptor)
        except AdapterError as exc:
            errors.append(str(exc))
        except OSError:
            errors.append(f"cannot remove extracted directory {relative_path}")
        finally:
            if parent_descriptor is not None:
                close_failure = _attempt_descriptor_close(
                    parent_descriptor,
                    f"cleanup parent for extracted directory {relative_path}",
                )
                if close_failure is not None:
                    errors.append(close_failure[0])
    try:
        live_metadata = os.fstat(ledger.root_descriptor)
        if (live_metadata.st_dev, live_metadata.st_ino) != ledger.root_identity:
            errors.append("COLMAP packet workspace identity changed before cleanup")
    except OSError:
        errors.append("cannot verify COLMAP packet workspace before cleanup")
    # The leased root itself is never removed here: the parent owns it and
    # removes it after this child exits by any route, including SIGKILL.
    root_close_failure = _attempt_descriptor_close(
        ledger.root_descriptor,
        "COLMAP packet workspace descriptor",
    )
    if root_close_failure is not None:
        errors.append(root_close_failure[0])
    return tuple(errors)


def _read_extracted_member_payload(
    *,
    ledger: _ExtractionLedger,
    member: ColmapPacketMember,
    context: NativeChildContext,
    expected_payload: bytes | None,
    label: str,
) -> bytes:
    """Re-read one extracted member descriptor-relatively and prove its identity.

    The bytes captured while copying are not trusted on their own: the file the
    consumer will actually use is opened again beneath the leased workspace,
    its mode/owner/size/link count are checked, and its content must equal both
    the captured payload and the manifest digest.
    """

    if expected_payload is None:
        raise _fail(f"extracted COLMAP {label} was never captured")
    parts = PurePosixPath(member.relative_path).parts
    try:
        member_directory = _open_existing_directory_chain(
            ledger.root_descriptor,
            parts[:-1],
            expected_identities=ledger.directory_identities,
        )
    except OSError as exc:
        raise _fail(f"cannot open the extracted COLMAP {label} directory") from exc
    member_descriptor: int | None = None
    try:
        member_descriptor = os.open(
            parts[-1],
            os.O_RDONLY | os.O_NONBLOCK | os.O_NOFOLLOW | os.O_CLOEXEC,
            dir_fd=member_directory,
        )
    except BaseException as exc:
        close_failure = _attempt_descriptor_close(
            member_directory,
            f"COLMAP packet {label} directory",
        )
        if close_failure is not None:
            _raise_cleanup_failures([close_failure], cause=exc)
        if isinstance(exc, OSError):
            raise _fail(f"cannot open the extracted COLMAP {label}") from exc
        raise
    directory_close_failure = _attempt_descriptor_close(
        member_directory,
        f"COLMAP packet {label} directory",
    )
    if directory_close_failure is not None:
        member_close_failure = _attempt_descriptor_close(
            member_descriptor,
            f"extracted COLMAP {label} after directory close failure",
        )
        failures = [directory_close_failure]
        if member_close_failure is not None:
            failures.append(member_close_failure)
        _raise_cleanup_failures(failures)
    try:
        try:
            member_metadata = os.fstat(member_descriptor)
        except OSError as exc:
            raise _fail(f"cannot inspect the extracted COLMAP {label}") from exc
        if (
            not stat.S_ISREG(member_metadata.st_mode)
            or member_metadata.st_uid != os.geteuid()
            or stat.S_IMODE(member_metadata.st_mode) != 0o600
            or member_metadata.st_size != member.size_bytes
            or member_metadata.st_nlink != 1
        ):
            raise _fail(f"extracted COLMAP {label} identity is not exact")
        extracted_payload = _pread_exact(
            member_descriptor,
            offset=0,
            size_bytes=member.size_bytes,
            context=context,
            label=f"extracted COLMAP {label}",
        )
    except BaseException as exc:
        close_failure = _attempt_descriptor_close(
            member_descriptor,
            f"extracted COLMAP {label}",
        )
        if close_failure is not None:
            _raise_cleanup_failures([close_failure], cause=exc)
        raise
    _close_descriptor_or_fail(
        member_descriptor,
        f"extracted COLMAP {label}",
    )
    if (
        extracted_payload != expected_payload
        or hashlib.sha256(extracted_payload).hexdigest() != member.sha256
    ):
        raise _fail(f"extracted COLMAP {label} identity changed")
    return extracted_payload


def _read_and_parse_extracted_request(
    *,
    ledger: _ExtractionLedger,
    manifest: ColmapPacketManifest,
    context: NativeChildContext,
    expected_request_payload: bytes,
) -> ColmapEngineRequest:
    from .refine_colmap_backend import parse_engine_request_member

    request_member = manifest.member_by_path[manifest.request_member]
    extracted_request_payload = _read_extracted_member_payload(
        ledger=ledger,
        member=request_member,
        context=context,
        expected_payload=expected_request_payload,
        label="engine request",
    )
    return parse_engine_request_member(
        extracted_request_payload,
        manifest,
    )


def _parse_ledger_document(
    payload: bytes,
    *,
    manifest: ColmapPacketManifest,
    contract: str,
    schema_version: int,
    fields: frozenset[str],
    label: str,
) -> Mapping[str, Any]:
    """Validate the envelope every ledger shares, including its run binding."""

    try:
        document = json.loads(payload)
    except (RecursionError, UnicodeDecodeError, ValueError) as exc:
        raise _fail(f"COLMAP packet {label} is not valid UTF-8 JSON") from exc
    if type(document) is not dict or payload != _canonical_json_bytes(document):
        raise _fail(f"COLMAP packet {label} is not canonical JSON")
    if set(document) != fields:
        raise _fail(f"COLMAP packet {label} has an unknown or missing field")
    if (
        type(document["schemaVersion"]) is not int
        or document["schemaVersion"] != schema_version
        or document["contract"] != contract
    ):
        raise _fail(f"COLMAP packet {label} contract is unsupported")
    if document["runId"] != manifest.run_id:
        raise _fail(f"COLMAP packet {label} runId does not match its manifest")
    rows = document["frames"]
    if type(rows) is not list:
        raise _fail(f"COLMAP packet {label} frames must be an exact JSON array")
    return document


def _parse_source_ledger(
    payload: bytes,
    *,
    manifest: ColmapPacketManifest,
    member: ColmapPacketMember,
    engine_request: ColmapEngineRequest,
) -> ColmapSourceLedger:
    """Bind pre-raster source provenance to the extracted engine frames.

    Coverage is exact: one row per engine frame, in frame order.  What this
    does not do is verify the declared source digests -- those objects are
    outside the packet -- so a wrong ``sourceSha256`` is caught only if the
    downstream acquirer re-hashes the real object.
    """

    label = "source ledger"
    document = _parse_ledger_document(
        payload,
        manifest=manifest,
        contract=SOURCE_LEDGER_CONTRACT,
        schema_version=SOURCE_LEDGER_SCHEMA_VERSION,
        fields=frozenset({"schemaVersion", "contract", "runId", "frames"}),
        label=label,
    )
    rows = document["frames"]
    frames = engine_request.frames
    if len(rows) != len(frames):
        raise _fail("COLMAP packet source ledger does not cover every engine frame")
    parsed: list[ColmapSourceLedgerRow] = []
    seen_source_objects: set[tuple[str, str]] = set()
    for index, row in enumerate(rows):
        if type(row) is not dict or set(row) != {
            "ordinal",
            "sourceArchiveKey",
            "sourceMember",
            "sourceImageName",
            "sourceSha256",
            "sourceSizeBytes",
        }:
            raise _fail(f"COLMAP packet source ledger row {index} has an invalid shape")
        ordinal = _ledger_exact_int(
            row["ordinal"],
            f"source ledger row {index} ordinal",
            minimum=0,
        )
        if ordinal != index:
            raise _fail(
                "COLMAP packet source ledger ordinals must be dense and ordered"
            )
        image_name = row["sourceImageName"]
        if type(image_name) is not str or image_name != frames[index].source_image_name:
            raise _fail(
                "COLMAP packet source ledger row does not match its engine frame"
            )
        archive_key = _ledger_relative_path(
            row["sourceArchiveKey"],
            f"source ledger row {index} sourceArchiveKey",
        )
        source_member = _ledger_relative_path(
            row["sourceMember"],
            f"source ledger row {index} sourceMember",
        )
        if PurePosixPath(source_member).name != image_name:
            raise _fail(
                "COLMAP packet source ledger member does not match its image identity"
            )
        source_object = (archive_key, source_member)
        if source_object in seen_source_objects:
            raise _fail("COLMAP packet source ledger repeats a source object identity")
        seen_source_objects.add(source_object)
        parsed.append(
            ColmapSourceLedgerRow(
                ordinal,
                archive_key,
                source_member,
                image_name,
                _ledger_sha256(
                    row["sourceSha256"],
                    f"source ledger row {index} sourceSha256",
                ),
                _ledger_exact_int(
                    row["sourceSizeBytes"],
                    f"source ledger row {index} sourceSizeBytes",
                    minimum=1,
                ),
            )
        )
    return ColmapSourceLedger(
        member.relative_path,
        member.sha256,
        tuple(parsed),
    )


def _parse_adapter_ledger(
    payload: bytes,
    *,
    manifest: ColmapPacketManifest,
    member: ColmapPacketMember,
    engine_request: ColmapEngineRequest,
) -> ColmapAdapterLedger:
    """Bind raster-adapter provenance to the manifest's engine-image universe.

    Every row must name a declared ``engine-image`` member and repeat its exact
    digest and size, and every declared engine image must have a row.  The
    materializer identity is checked for shape only; no build is authenticated.
    """

    label = "adapter ledger"
    document = _parse_ledger_document(
        payload,
        manifest=manifest,
        contract=ADAPTER_LEDGER_CONTRACT,
        schema_version=ADAPTER_LEDGER_SCHEMA_VERSION,
        fields=frozenset(
            {"schemaVersion", "contract", "runId", "materializerId", "frames"}
        ),
        label=label,
    )
    materializer_id = document["materializerId"]
    if (
        type(materializer_id) is not str
        or _MATERIALIZER_ID_PATTERN.fullmatch(materializer_id) is None
    ):
        raise _fail("COLMAP packet adapter ledger materializerId is not canonical")
    rows = document["frames"]
    frames = engine_request.frames
    if len(rows) != len(frames):
        raise _fail("COLMAP packet adapter ledger does not cover every engine frame")
    declared_members = manifest.member_by_path
    engine_member_paths = {
        row.relative_path
        for row in manifest.members
        if row.role == COLMAP_PACKET_ENGINE_IMAGE_ROLE
    }
    parsed: list[ColmapAdapterLedgerRow] = []
    covered_paths: set[str] = set()
    for index, row in enumerate(rows):
        if type(row) is not dict or set(row) != {
            "ordinal",
            "engineImageName",
            "engineRelativePath",
            "engineSha256",
            "engineSizeBytes",
        }:
            raise _fail(
                f"COLMAP packet adapter ledger row {index} has an invalid shape"
            )
        ordinal = _ledger_exact_int(
            row["ordinal"],
            f"adapter ledger row {index} ordinal",
            minimum=0,
        )
        if ordinal != index:
            raise _fail(
                "COLMAP packet adapter ledger ordinals must be dense and ordered"
            )
        frame = frames[index]
        image_name = row["engineImageName"]
        relative_path = _ledger_relative_path(
            row["engineRelativePath"],
            f"adapter ledger row {index} engineRelativePath",
        )
        if (
            type(image_name) is not str
            or image_name != frame.engine_image_name
            or relative_path != frame.engine_relative_path
        ):
            raise _fail(
                "COLMAP packet adapter ledger row does not match its engine frame"
            )
        sha256 = _ledger_sha256(
            row["engineSha256"],
            f"adapter ledger row {index} engineSha256",
        )
        size_bytes = _ledger_exact_int(
            row["engineSizeBytes"],
            f"adapter ledger row {index} engineSizeBytes",
            minimum=1,
        )
        declared = declared_members.get(relative_path)
        if (
            declared is None
            or declared.role != COLMAP_PACKET_ENGINE_IMAGE_ROLE
            or declared.sha256 != sha256
            or declared.size_bytes != size_bytes
        ):
            raise _fail(
                "COLMAP packet adapter ledger row is not bound to a declared "
                "engine image"
            )
        # A repeated path needs no separate rejection: the exact-coverage check
        # below fails closed because some declared engine image is then missing.
        covered_paths.add(relative_path)
        parsed.append(
            ColmapAdapterLedgerRow(
                ordinal,
                image_name,
                relative_path,
                sha256,
                size_bytes,
            )
        )
    if covered_paths != engine_member_paths:
        raise _fail(
            "COLMAP packet adapter ledger must account for every declared engine image"
        )
    return ColmapAdapterLedger(
        member.relative_path,
        member.sha256,
        materializer_id,
        tuple(parsed),
    )


def _read_and_parse_optional_ledgers(
    *,
    ledger: _ExtractionLedger,
    manifest: ColmapPacketManifest,
    context: NativeChildContext,
    engine_request: ColmapEngineRequest,
    members: _PacketLedgerMembers,
    ledger_payloads: Mapping[str, bytes],
) -> tuple[ColmapSourceLedger | None, ColmapAdapterLedger | None]:
    """Read and parse whichever optional ledgers this packet declared.

    Ledger rows are bound to engine frames by ordinal, so the extracted request
    and the manifest-declared engine-image universe must first agree on how many
    frames exist.  That agreement is checked here rather than assumed from the
    request parser.
    """

    if len(engine_request.frames) != members.engine_image_count:
        raise _fail(
            "COLMAP packet engine frame count disagrees with its declared engine images"
        )
    source_ledger: ColmapSourceLedger | None = None
    adapter_ledger: ColmapAdapterLedger | None = None
    if members.source is not None:
        source_ledger = _parse_source_ledger(
            _read_extracted_member_payload(
                ledger=ledger,
                member=members.source,
                context=context,
                expected_payload=ledger_payloads.get(COLMAP_PACKET_SOURCE_LEDGER_ROLE),
                label="source ledger",
            ),
            manifest=manifest,
            member=members.source,
            engine_request=engine_request,
        )
    if members.adapter is not None:
        adapter_ledger = _parse_adapter_ledger(
            _read_extracted_member_payload(
                ledger=ledger,
                member=members.adapter,
                context=context,
                expected_payload=ledger_payloads.get(COLMAP_PACKET_ADAPTER_LEDGER_ROLE),
                label="adapter ledger",
            ),
            manifest=manifest,
            member=members.adapter,
            engine_request=engine_request,
        )
    return source_ledger, adapter_ledger


@contextmanager
def extract_colmap_packet(
    request: Mapping[str, Any],
    context: NativeChildContext,
) -> Iterator[ExtractedColmapPacket]:
    """Extract exactly one manifest-bound packet inside the native child."""

    from .refine_colmap_backend import load_colmap_packet_manifest

    _require_extraction_platform_capabilities()
    _require_native_child_session(context)
    manifest = load_colmap_packet_manifest(request, context)
    ledger_members = _validate_packet_member_roles(manifest)
    ledger = _lease_extraction_workspace(context)
    extracted_paths: set[str] = set()
    ledger_payloads: dict[str, bytes] = {}
    request_payload: bytes | None = None
    try:
        for chunk in manifest.chunks:
            payload = _extract_archive_chunk(
                chunk=chunk,
                manifest=manifest,
                context=context,
                ledger=ledger,
                extracted_paths=extracted_paths,
                ledger_payloads=ledger_payloads,
            )
            if payload is not None:
                if request_payload is not None:
                    raise _fail("COLMAP packet contains multiple engine requests")
                request_payload = payload
        if extracted_paths != set(manifest.member_by_path) or request_payload is None:
            raise _fail("COLMAP packet extraction did not close its declared universe")
        engine_request = _read_and_parse_extracted_request(
            ledger=ledger,
            manifest=manifest,
            context=context,
            expected_request_payload=request_payload,
        )
        source_ledger, adapter_ledger = _read_and_parse_optional_ledgers(
            ledger=ledger,
            manifest=manifest,
            context=context,
            engine_request=engine_request,
            members=ledger_members,
            ledger_payloads=ledger_payloads,
        )
        yield ExtractedColmapPacket(
            ledger.root_descriptor,
            manifest,
            engine_request,
            tuple(sorted(extracted_paths)),
            source_ledger=source_ledger,
            adapter_ledger=adapter_ledger,
        )
    finally:
        cleanup_errors = _cleanup_extraction_workspace(ledger)
        if cleanup_errors:
            raise _fail("; ".join(cleanup_errors), _ENGINE_CLEANUP_FAILED)
