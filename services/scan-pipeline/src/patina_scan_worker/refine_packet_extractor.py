"""Bounded USTAR extraction for the disabled native Refine packet.

This module owns only the child-side extraction boundary.  It never opens a
caller display path or ``/proc/self/fd`` alias: source archive reads are
positional reads from descriptors already pinned by ``refine_native_process``.
Destinations are created descriptor-relatively beneath one new private 0700
workspace.  Execution, output handoff, publication, fallback, and stage
registration remain separate disabled gates.  This child-owned scratch model is
also not timeout-safe: SIGKILL can strand it before Python cleanup runs.
Production composition therefore still requires a parent-provisioned,
descriptor-rooted workspace with bounded parent-owned cleanup.
"""

from __future__ import annotations

import hashlib
import os
import re
import stat
import tempfile
from collections.abc import Iterator, Mapping, Sequence
from contextlib import contextmanager
from dataclasses import dataclass, field
from pathlib import Path, PurePosixPath
from typing import TYPE_CHECKING, Any

from .refine_adapter import AdapterError
from .refine_native_process import (
    NATIVE_CHILD_MAX_PINNED_FILE_BYTES,
    NATIVE_CHILD_MAX_PINNED_TOTAL_BYTES,
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

_PACKET_INVALID = "REFINE_COLMAP_PACKET_INVALID"
_BACKEND_DISABLED = "REFINE_BACKEND_DISABLED"
_ENGINE_FAILED = "REFINE_ENGINE_FAILED"
_ENGINE_CLEANUP_FAILED = "REFINE_ENGINE_CLEANUP_FAILED"
_READ_BYTES = 1024 * 1024
_ZERO_BLOCK = b"\x00" * COLMAP_PACKET_TAR_BLOCK_BYTES
_USTAR_MAGIC = b"ustar\x00"
_USTAR_VERSION = b"00"
_REQUIRED_DIR_FD_FUNCTIONS = (os.open, os.mkdir, os.stat, os.unlink, os.rmdir)


def _fail(message: str, code: str = _PACKET_INVALID) -> AdapterError:
    return AdapterError(message, code)


@dataclass(frozen=True)
class ExtractedColmapPacket:
    """One child-owned extraction, valid only while its context is open."""

    workspace: Path
    manifest: ColmapPacketManifest
    engine_request: ColmapEngineRequest
    extracted_relative_paths: tuple[str, ...]


@dataclass
class _ExtractionLedger:
    workspace: Path
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
        )
    except BaseException:  # noqa: BLE001 - platform inspection must fail closed
        supported = False
    if not supported:
        raise _fail(
            "COLMAP packet extraction platform lacks required descriptor safety",
            _BACKEND_DISABLED,
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


def _new_extraction_workspace() -> _ExtractionLedger:
    workspace: Path | None = None
    root_descriptor: int | None = None
    try:
        temporary_parent = Path(tempfile.gettempdir()).resolve(strict=True)
        workspace = Path(
            tempfile.mkdtemp(
                prefix="patina-refine-colmap-packet-",
                dir=temporary_parent,
            )
        )
        metadata = os.lstat(workspace)
        if (
            not stat.S_ISDIR(metadata.st_mode)
            or stat.S_ISLNK(metadata.st_mode)
            or metadata.st_uid != os.geteuid()
            or stat.S_IMODE(metadata.st_mode) != 0o700
            or workspace.resolve(strict=True) != workspace
        ):
            raise OSError("new extraction workspace is not private")
        root_descriptor = os.open(
            workspace,
            os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW | os.O_CLOEXEC,
        )
        root_metadata = os.fstat(root_descriptor)
        if (
            (root_metadata.st_dev, root_metadata.st_ino)
            != (metadata.st_dev, metadata.st_ino)
            or root_metadata.st_uid != os.geteuid()
            or stat.S_IMODE(root_metadata.st_mode) != 0o700
        ):
            raise OSError("extraction workspace descriptor identity changed")
    except BaseException as exc:
        cleanup_failures: list[tuple[str, OSError]] = []
        if root_descriptor is not None:
            close_failure = _attempt_descriptor_close(
                root_descriptor,
                "failed COLMAP packet workspace descriptor",
            )
            if close_failure is not None:
                cleanup_failures.append(close_failure)
        if workspace is not None:
            try:
                os.rmdir(workspace)
            except OSError as cleanup_exc:
                cleanup_failures.append(
                    ("cannot remove failed COLMAP packet workspace", cleanup_exc)
                )
        if cleanup_failures:
            _raise_cleanup_failures(cleanup_failures, cause=exc)
        raise _fail(
            "cannot create a private child-owned COLMAP packet workspace",
            _ENGINE_FAILED,
        ) from exc
    return _ExtractionLedger(
        workspace,
        root_descriptor,
        (metadata.st_dev, metadata.st_ino),
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
    request_payload = bytearray() if member.role == "engine-request" else None
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
        if request_payload is not None:
            request_payload.extend(block)
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
    return bytes(request_payload) if request_payload is not None else None


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
            if request_payload is not None:
                raise _fail("COLMAP packet archive repeats the engine request")
            request_payload = payload
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
        path_metadata = os.lstat(ledger.workspace)
        if (live_metadata.st_dev, live_metadata.st_ino) != ledger.root_identity or (
            path_metadata.st_dev,
            path_metadata.st_ino,
        ) != ledger.root_identity:
            errors.append("COLMAP packet workspace identity changed before cleanup")
    except OSError:
        errors.append("cannot verify COLMAP packet workspace before cleanup")
    root_close_failure = _attempt_descriptor_close(
        ledger.root_descriptor,
        "COLMAP packet workspace descriptor",
    )
    if root_close_failure is not None:
        errors.append(root_close_failure[0])
    if not errors:
        try:
            os.rmdir(ledger.workspace)
        except OSError:
            errors.append("cannot remove COLMAP packet workspace")
    return tuple(errors)


def _read_and_parse_extracted_request(
    *,
    ledger: _ExtractionLedger,
    manifest: ColmapPacketManifest,
    context: NativeChildContext,
    expected_request_payload: bytes,
) -> ColmapEngineRequest:
    from .refine_colmap_backend import parse_engine_request_member

    request_member = manifest.member_by_path[manifest.request_member]
    parts = PurePosixPath(request_member.relative_path).parts
    try:
        request_directory = _open_existing_directory_chain(
            ledger.root_descriptor,
            parts[:-1],
            expected_identities=ledger.directory_identities,
        )
    except OSError as exc:
        raise _fail(
            "cannot open the extracted COLMAP engine request directory"
        ) from exc
    request_descriptor: int | None = None
    try:
        request_descriptor = os.open(
            parts[-1],
            os.O_RDONLY | os.O_NONBLOCK | os.O_NOFOLLOW | os.O_CLOEXEC,
            dir_fd=request_directory,
        )
    except BaseException as exc:
        close_failure = _attempt_descriptor_close(
            request_directory,
            "COLMAP packet request directory",
        )
        if close_failure is not None:
            _raise_cleanup_failures([close_failure], cause=exc)
        if isinstance(exc, OSError):
            raise _fail("cannot open the extracted COLMAP engine request") from exc
        raise
    directory_close_failure = _attempt_descriptor_close(
        request_directory,
        "COLMAP packet request directory",
    )
    if directory_close_failure is not None:
        request_close_failure = _attempt_descriptor_close(
            request_descriptor,
            "extracted COLMAP engine request after directory close failure",
        )
        failures = [directory_close_failure]
        if request_close_failure is not None:
            failures.append(request_close_failure)
        _raise_cleanup_failures(failures)
    try:
        try:
            request_metadata = os.fstat(request_descriptor)
        except OSError as exc:
            raise _fail("cannot inspect the extracted COLMAP engine request") from exc
        if (
            not stat.S_ISREG(request_metadata.st_mode)
            or request_metadata.st_uid != os.geteuid()
            or stat.S_IMODE(request_metadata.st_mode) != 0o600
            or request_metadata.st_size != request_member.size_bytes
            or request_metadata.st_nlink != 1
        ):
            raise _fail("extracted COLMAP engine request identity is not exact")
        extracted_request_payload = _pread_exact(
            request_descriptor,
            offset=0,
            size_bytes=request_member.size_bytes,
            context=context,
            label="extracted COLMAP engine request",
        )
    except BaseException as exc:
        close_failure = _attempt_descriptor_close(
            request_descriptor,
            "extracted COLMAP engine request",
        )
        if close_failure is not None:
            _raise_cleanup_failures([close_failure], cause=exc)
        raise
    _close_descriptor_or_fail(
        request_descriptor,
        "extracted COLMAP engine request",
    )
    if (
        extracted_request_payload != expected_request_payload
        or hashlib.sha256(extracted_request_payload).hexdigest()
        != request_member.sha256
    ):
        raise _fail("extracted COLMAP engine request identity changed")
    return parse_engine_request_member(
        extracted_request_payload,
        manifest,
    )


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
    ledger = _new_extraction_workspace()
    extracted_paths: set[str] = set()
    request_payload: bytes | None = None
    try:
        for chunk in manifest.chunks:
            payload = _extract_archive_chunk(
                chunk=chunk,
                manifest=manifest,
                context=context,
                ledger=ledger,
                extracted_paths=extracted_paths,
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
        yield ExtractedColmapPacket(
            ledger.workspace,
            manifest,
            engine_request,
            tuple(sorted(extracted_paths)),
        )
    finally:
        cleanup_errors = _cleanup_extraction_workspace(ledger)
        if cleanup_errors:
            raise _fail("; ".join(cleanup_errors), _ENGINE_CLEANUP_FAILED)
