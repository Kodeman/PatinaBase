"""Disabled, queue-independent input materializer for P2 Refine.

This module stops before the unqualified Field/Core Image raster boundary.  It
owns a private workspace for one task lease, acquires the four immutable Field
inputs through an injected adapter, verifies each acquisition from one
nonblocking/no-follow descriptor, and extracts ``keyframes.tar`` only after a
complete bounded preflight.

``FieldRasterMaterializer`` is intentionally a protocol with no production
implementation here.  The physical iPhone/Core Image fixture must qualify that
implementation before Refine can be registered.  Tests use a deterministic
pre-materialized PPM fake.

The result deliberately does not import :mod:`refine_runner`.  A later disabled
composition layer can adapt each :class:`MaterializedRefineFrame` to the
runner's ``RefineFrameInput`` by preserving ``frame`` as the source identity and
using ``engine_name``/``engine_path`` as the canonical engine identity.  The
explicit mapping prevents a decoded ``.ppm`` from being confused with its
archive ``.heic`` source.
"""

from __future__ import annotations

import errno
import hashlib
import json
import math
import os
import re
import shutil
import stat
import tarfile
from contextlib import contextmanager
from dataclasses import dataclass, field
from enum import Enum
from pathlib import Path, PurePosixPath
from typing import Any, BinaryIO, Iterator, NoReturn, Protocol

from .keys import OwnershipError, assert_owner_prefix
from .refine_adapter import AdapterError, NormalizedFrame, RefineDeadline, normalize_keyframe_entry

_COPY_CHUNK_BYTES = 1 << 20
_SAFE_IDENTIFIER = re.compile(r"[A-Za-z0-9][A-Za-z0-9._:-]{0,127}")
_SAFE_ARCHIVE_MEMBER = re.compile(
    r"keyframes/[A-Za-z0-9][A-Za-z0-9._-]*\.(?:heic|bin)"
)
_SHA256 = re.compile(r"[0-9a-f]{64}")
_INPUT_LAYOUT = (
    (
        "bundleManifest",
        "manifest",
        "manifests/{user_id}/{scan_id}/manifest.json",
        4 * 1024 * 1024,
    ),
    (
        "keyframeIndex",
        "keyframe_index",
        "keyframes/{user_id}/{scan_id}/keyframe_index.ndjson",
        32 * 1024 * 1024,
    ),
    (
        "keyframeSummary",
        "keyframe_summary",
        "keyframes/{user_id}/{scan_id}/keyframe_summary.json",
        1024 * 1024,
    ),
    (
        "keyframesArchive",
        "keyframes_archive",
        "bundle/{user_id}/{scan_id}/keyframes.tar",
        1024 * 1024 * 1024,
    ),
)
_MANIFEST_ROWS = {
    "keyframeIndex": (
        "keyframes/keyframe_index.ndjson",
        "application/x-ndjson",
    ),
    "keyframeSummary": (
        "keyframes/keyframe_summary.json",
        "application/json",
    ),
    "keyframesArchive": ("keyframes.tar", "application/x-tar"),
}


class MaterializerFailureCode(str, Enum):
    """Closed failure surface for a later lease-owning stage adapter."""

    DEADLINE = "REFINE_ENGINE_TIMEOUT"
    INPUT_IO = "REFINE_INPUT_IO"
    INPUT_INVALID = "REFINE_INPUT_INVALID"
    OWNERSHIP = "OWNERSHIP_VIOLATION"
    RASTER_UNQUALIFIED = "REFINE_RASTER_UNQUALIFIED"


_FAILURE_FATALITY = {
    MaterializerFailureCode.DEADLINE: False,
    MaterializerFailureCode.INPUT_IO: False,
    MaterializerFailureCode.INPUT_INVALID: True,
    MaterializerFailureCode.OWNERSHIP: True,
    MaterializerFailureCode.RASTER_UNQUALIFIED: True,
}


class RefineMaterializerError(RuntimeError):
    """Stable, classified materializer failure."""

    def __init__(self, code: MaterializerFailureCode, message: str) -> None:
        if not isinstance(code, MaterializerFailureCode):
            raise TypeError("materializer failures require MaterializerFailureCode")
        detail = str(message).encode("utf-8", errors="replace")[:65536]
        super().__init__(f"{code.value}: {detail.decode('utf-8', errors='ignore')}")
        self.code = code
        self.token = code.value
        self.fatal = _FAILURE_FATALITY[code]


def _fail(code: MaterializerFailureCode, message: str) -> NoReturn:
    raise RefineMaterializerError(code, message)


@dataclass(frozen=True)
class RefineSourceArtifact:
    """Expected immutable fingerprint and owner-anchored Storage object key."""

    object_key: str
    sha256: str
    size_bytes: int


@dataclass(frozen=True)
class RefineMaterializationRequest:
    """Pure request for one task lease.

    ``workspace_parent`` is not inspected until every object key has passed its
    owner-prefix and exact-layout checks.
    """

    user_id: str
    scan_id: str
    task_id: str
    lease_id: str
    workspace_parent: Path
    manifest: RefineSourceArtifact
    keyframe_index: RefineSourceArtifact
    keyframe_summary: RefineSourceArtifact
    keyframes_archive: RefineSourceArtifact


@dataclass(frozen=True)
class RefineMaterializationLimits:
    """Hard resource ceilings for untrusted Field inputs."""

    max_manifest_bytes: int = 4 * 1024 * 1024
    max_index_bytes: int = 32 * 1024 * 1024
    max_summary_bytes: int = 1024 * 1024
    max_archive_bytes: int = 1024 * 1024 * 1024
    max_archive_members: int = 2048
    max_archive_member_bytes: int = 128 * 1024 * 1024
    max_archive_expanded_bytes: int = 2 * 1024 * 1024 * 1024
    max_frames: int = 1000
    max_index_line_bytes: int = 256 * 1024
    max_raster_bytes: int = 128 * 1024 * 1024

    def __post_init__(self) -> None:
        for name, value in vars(self).items():
            if isinstance(value, bool) or not isinstance(value, int) or value <= 0:
                raise ValueError(f"{name} must be a positive integer")


class RefineArtifactAcquirer(Protocol):
    """Injected authenticated acquisition seam.

    The implementation must create ``destination`` and obey the supplied
    absolute deadline.  This module distrusts the resulting path and freezes it
    through its own descriptor before parsing anything.
    """

    def acquire(
        self,
        *,
        object_key: str,
        destination: Path,
        deadline: RefineDeadline,
    ) -> None: ...


@dataclass(frozen=True)
class FieldRasterMaterialization:
    """Evidence returned by a future physically-qualified raster adapter."""

    materializer_id: str
    source_width: int
    source_height: int
    output_width: int
    output_height: int


class FieldRasterMaterializer(Protocol):
    """Still-unqualified Field/Core Image HEIC-to-engine-raster seam."""

    def materialize(
        self,
        *,
        source: Path,
        destination: Path,
        engine_name: str,
        encoded_width: int,
        encoded_height: int,
        deadline: RefineDeadline,
    ) -> FieldRasterMaterialization: ...


@dataclass(frozen=True)
class VerifiedRefineInput:
    """One exact acquired input suitable for the runner input hash ledger."""

    kind: str
    object_key: str
    sha256: str
    size_bytes: int
    local_path: Path


@dataclass(frozen=True)
class MaterializedRefineFrame:
    """Explicit source-to-engine identity mapping for one indexed keyframe."""

    frame: NormalizedFrame
    source_archive_key: str
    source_member: str
    source_path: Path
    source_sha256: str
    source_size_bytes: int
    engine_name: str
    engine_relative_path: str
    engine_path: Path
    engine_sha256: str
    engine_size_bytes: int
    encoded_width: int
    encoded_height: int
    materializer_id: str


@dataclass(frozen=True)
class RefineMaterialization:
    """Private, verified, still-unpublished runner input."""

    task_id: str
    lease_id: str
    workspace_root: Path
    inputs: tuple[VerifiedRefineInput, ...]
    frames: tuple[MaterializedRefineFrame, ...]
    production_enablement: str = field(default="disabled", init=False)


@dataclass(frozen=True)
class _FrozenFile:
    path: Path
    sha256: str
    size_bytes: int


@dataclass(frozen=True)
class _IndexedFrame:
    frame: NormalizedFrame
    depth_path: str | None


@dataclass(frozen=True)
class _ArchiveMember:
    name: str
    size_bytes: int


@dataclass(frozen=True)
class _ExtractedMember:
    name: str
    path: Path
    sha256: str
    size_bytes: int


class _DeadlineFile:
    """Minimal seekable file proxy that checkpoints every tarfile operation."""

    def __init__(self, handle: BinaryIO, deadline: RefineDeadline) -> None:
        self._handle = handle
        self._deadline = deadline

    def read(self, size: int = -1) -> bytes:
        _require_deadline(self._deadline)
        if size < 0 or size > _COPY_CHUNK_BYTES:
            size = _COPY_CHUNK_BYTES
        return self._handle.read(size)

    def seek(self, offset: int, whence: int = os.SEEK_SET) -> int:
        _require_deadline(self._deadline)
        return self._handle.seek(offset, whence)

    def tell(self) -> int:
        return self._handle.tell()


def _require_deadline(deadline: RefineDeadline) -> float:
    if not isinstance(deadline, RefineDeadline):
        _fail(MaterializerFailureCode.DEADLINE, "deadline has the wrong contract type")
    try:
        remaining = deadline.remaining_seconds()
    except Exception as exc:  # noqa: BLE001 - normalize an injected deadline
        _fail(MaterializerFailureCode.DEADLINE, f"deadline is exhausted: {exc}")
    if (
        isinstance(remaining, bool)
        or not isinstance(remaining, (int, float))
        or not math.isfinite(float(remaining))
        or float(remaining) <= 0
    ):
        _fail(MaterializerFailureCode.DEADLINE, "deadline is exhausted")
    return float(remaining)


def _stable_identifier(value: object, label: str) -> str:
    if not isinstance(value, str) or _SAFE_IDENTIFIER.fullmatch(value) is None:
        _fail(
            MaterializerFailureCode.INPUT_INVALID,
            f"{label} must be a stable ASCII identifier",
        )
    return value


def _safe_owner_key(
    value: object,
    *,
    user_id: str,
    scan_id: str,
    expected: str,
) -> str:
    if (
        not isinstance(value, str)
        or not value
        or any(character in value for character in ("\\", "?", "#", "%"))
    ):
        _fail(MaterializerFailureCode.OWNERSHIP, "unsafe Storage object key")
    path = PurePosixPath(value)
    if (
        path.is_absolute()
        or not path.parts
        or any(part in ("", ".", "..") for part in path.parts)
        or str(path) != value
    ):
        _fail(MaterializerFailureCode.OWNERSHIP, "unsafe Storage object key")
    try:
        assert_owner_prefix(value, user_id, scan_id)
    except OwnershipError as exc:
        _fail(MaterializerFailureCode.OWNERSHIP, str(exc))
    if value != expected:
        _fail(
            MaterializerFailureCode.INPUT_INVALID,
            f"input key does not match the reviewed Field layout: {value!r}",
        )
    return value


def _validate_source(
    value: object,
    *,
    maximum_size: int,
    expected_key: str,
    user_id: str,
    scan_id: str,
) -> RefineSourceArtifact:
    if not isinstance(value, RefineSourceArtifact):
        _fail(
            MaterializerFailureCode.INPUT_INVALID,
            "source artifact has the wrong contract type",
        )
    _safe_owner_key(
        value.object_key,
        user_id=user_id,
        scan_id=scan_id,
        expected=expected_key,
    )
    if not isinstance(value.sha256, str) or _SHA256.fullmatch(value.sha256) is None:
        _fail(
            MaterializerFailureCode.INPUT_INVALID,
            "source sha256 must be lowercase hexadecimal",
        )
    if (
        isinstance(value.size_bytes, bool)
        or not isinstance(value.size_bytes, int)
        or value.size_bytes <= 0
        or value.size_bytes > maximum_size
    ):
        _fail(
            MaterializerFailureCode.INPUT_INVALID,
            f"source size must be in 1..{maximum_size} bytes",
        )
    return value


def _validate_request(
    request: RefineMaterializationRequest,
    limits: RefineMaterializationLimits,
) -> tuple[tuple[str, RefineSourceArtifact], ...]:
    """Validate all owner keys without touching the filesystem or network."""

    if not isinstance(request, RefineMaterializationRequest):
        _fail(
            MaterializerFailureCode.INPUT_INVALID,
            "materialization request has the wrong contract type",
        )
    user_id = _stable_identifier(request.user_id, "user_id")
    scan_id = _stable_identifier(request.scan_id, "scan_id")
    _stable_identifier(request.task_id, "task_id")
    _stable_identifier(request.lease_id, "lease_id")
    if not isinstance(request.workspace_parent, Path) or not request.workspace_parent.is_absolute():
        _fail(
            MaterializerFailureCode.INPUT_INVALID,
            "workspace_parent must be an absolute Path",
        )

    configured_maxima = {
        "manifest": limits.max_manifest_bytes,
        "keyframe_index": limits.max_index_bytes,
        "keyframe_summary": limits.max_summary_bytes,
        "keyframes_archive": limits.max_archive_bytes,
    }
    validated: list[tuple[str, RefineSourceArtifact]] = []
    keys: set[str] = set()
    for kind, attribute, template, _default_maximum in _INPUT_LAYOUT:
        source = _validate_source(
            getattr(request, attribute),
            maximum_size=configured_maxima[attribute],
            expected_key=template.format(user_id=user_id, scan_id=scan_id),
            user_id=user_id,
            scan_id=scan_id,
        )
        if source.object_key in keys:
            _fail(
                MaterializerFailureCode.INPUT_INVALID,
                "source object keys must be unique",
            )
        keys.add(source.object_key)
        validated.append((kind, source))
    return tuple(validated)


def _workspace_name(task_id: str, lease_id: str) -> str:
    task_digest = hashlib.sha256(task_id.encode("utf-8")).hexdigest()[:16]
    lease_digest = hashlib.sha256(lease_id.encode("utf-8")).hexdigest()[:16]
    return f"refine-{task_digest}-{lease_digest}"


def _create_private_workspace(
    request: RefineMaterializationRequest,
    *,
    deadline: RefineDeadline,
) -> Path:
    _require_deadline(deadline)
    parent = request.workspace_parent
    try:
        parent_stat = os.lstat(parent)
    except OSError as exc:
        _fail(
            MaterializerFailureCode.INPUT_IO,
            f"workspace parent is unavailable: {exc}",
        )
    if stat.S_ISLNK(parent_stat.st_mode) or not stat.S_ISDIR(parent_stat.st_mode):
        _fail(
            MaterializerFailureCode.INPUT_INVALID,
            "workspace parent must be a real directory",
        )
    if parent_stat.st_uid != os.geteuid() or parent_stat.st_mode & 0o022:
        _fail(
            MaterializerFailureCode.INPUT_INVALID,
            "workspace parent must be service-owned and not group/world writable",
        )

    workspace = parent / _workspace_name(request.task_id, request.lease_id)
    created = False
    try:
        os.mkdir(workspace, 0o700)
        created = True
        os.chmod(workspace, 0o700)
        for child in ("incoming", "inputs", "extracted", "images", "raster-incoming"):
            os.mkdir(workspace / child, 0o700)
    except FileExistsError:
        if created:
            shutil.rmtree(workspace, ignore_errors=True)
        _fail(
            MaterializerFailureCode.INPUT_IO,
            "task/lease workspace already exists",
        )
    except OSError as exc:
        if created:
            shutil.rmtree(workspace, ignore_errors=True)
        _fail(
            MaterializerFailureCode.INPUT_IO,
            f"cannot create private task/lease workspace: {exc}",
        )
    try:
        mode = stat.S_IMODE(os.lstat(workspace).st_mode)
    except OSError as exc:
        shutil.rmtree(workspace, ignore_errors=True)
        _fail(MaterializerFailureCode.INPUT_IO, f"cannot inspect workspace: {exc}")
    if mode != 0o700:
        shutil.rmtree(workspace, ignore_errors=True)
        _fail(
            MaterializerFailureCode.INPUT_INVALID,
            "task/lease workspace is not mode 0700",
        )
    _require_deadline(deadline)
    return workspace


def _stat_identity(metadata: os.stat_result) -> tuple[int, int, int, int, int, int]:
    return (
        metadata.st_dev,
        metadata.st_ino,
        metadata.st_mode,
        metadata.st_size,
        metadata.st_mtime_ns,
        metadata.st_ctime_ns,
    )


def _safe_source_descriptor(path: Path) -> tuple[int, os.stat_result]:
    try:
        path_snapshot = os.lstat(path)
    except OSError as exc:
        _fail(MaterializerFailureCode.INPUT_IO, f"cannot inspect acquired file: {exc}")
    if stat.S_ISLNK(path_snapshot.st_mode) or not stat.S_ISREG(path_snapshot.st_mode):
        _fail(
            MaterializerFailureCode.INPUT_INVALID,
            "acquired source must be a regular non-symlink file",
        )
    nonblocking = getattr(os, "O_NONBLOCK", None)
    if nonblocking is None:
        _fail(
            MaterializerFailureCode.INPUT_INVALID,
            "nonblocking file opens are unavailable",
        )
    flags = (
        os.O_RDONLY
        | getattr(os, "O_CLOEXEC", 0)
        | getattr(os, "O_NOFOLLOW", 0)
        | nonblocking
    )
    try:
        descriptor = os.open(path, flags)
    except OSError as exc:
        if exc.errno == errno.ELOOP:
            _fail(
                MaterializerFailureCode.INPUT_INVALID,
                "acquired source changed to a symlink while opening",
            )
        _fail(MaterializerFailureCode.INPUT_IO, f"cannot open acquired file: {exc}")
    try:
        opened = os.fstat(descriptor)
    except OSError as exc:
        os.close(descriptor)
        _fail(MaterializerFailureCode.INPUT_IO, f"cannot inspect acquired descriptor: {exc}")
    if not stat.S_ISREG(opened.st_mode) or (
        opened.st_dev,
        opened.st_ino,
    ) != (
        path_snapshot.st_dev,
        path_snapshot.st_ino,
    ):
        os.close(descriptor)
        _fail(
            MaterializerFailureCode.INPUT_INVALID,
            "acquired source changed identity while opening",
        )
    return descriptor, opened


def _write_all(
    descriptor: int,
    payload: bytes,
    *,
    deadline: RefineDeadline,
) -> None:
    offset = 0
    while offset < len(payload):
        _require_deadline(deadline)
        try:
            written = os.write(descriptor, payload[offset:])
        except OSError as exc:
            _fail(MaterializerFailureCode.INPUT_IO, f"cannot write private snapshot: {exc}")
        if written <= 0:
            _fail(
                MaterializerFailureCode.INPUT_IO,
                "private snapshot write made no progress",
            )
        offset += written


def _freeze_untrusted_file(
    source: Path,
    destination: Path,
    *,
    maximum_size: int,
    deadline: RefineDeadline,
    expected_sha256: str | None = None,
    expected_size: int | None = None,
) -> _FrozenFile:
    """Copy and hash one untrusted generation through the same source descriptor."""

    _require_deadline(deadline)
    descriptor, before = _safe_source_descriptor(source)
    output_descriptor: int | None = None
    destination_created = False
    pending_error = False
    digest = hashlib.sha256()
    copied = 0
    try:
        flags = (
            os.O_WRONLY
            | os.O_CREAT
            | os.O_EXCL
            | getattr(os, "O_CLOEXEC", 0)
            | getattr(os, "O_NOFOLLOW", 0)
        )
        output_descriptor = os.open(destination, flags, 0o600)
        destination_created = True
        chunk_index = 0
        while True:
            if chunk_index % 16 == 0:
                _require_deadline(deadline)
            try:
                chunk = os.read(descriptor, _COPY_CHUNK_BYTES)
            except OSError as exc:
                _fail(
                    MaterializerFailureCode.INPUT_IO,
                    f"cannot read acquired descriptor: {exc}",
                )
            if not chunk:
                break
            copied += len(chunk)
            if copied > maximum_size or (
                expected_size is not None and copied > expected_size
            ):
                _fail(
                    MaterializerFailureCode.INPUT_INVALID,
                    "acquired source exceeds its bounded expected size",
                )
            digest.update(chunk)
            _write_all(output_descriptor, chunk, deadline=deadline)
            chunk_index += 1
        try:
            after = os.fstat(descriptor)
        except OSError as exc:
            _fail(
                MaterializerFailureCode.INPUT_IO,
                f"cannot recheck acquired descriptor: {exc}",
            )
        if _stat_identity(before) != _stat_identity(after):
            _fail(
                MaterializerFailureCode.INPUT_INVALID,
                "acquired source changed while it was consumed",
            )
        if copied <= 0:
            _fail(MaterializerFailureCode.INPUT_INVALID, "acquired source is empty")
        actual_sha256 = digest.hexdigest()
        if expected_size is not None and copied != expected_size:
            _fail(
                MaterializerFailureCode.INPUT_INVALID,
                "acquired source size does not match its ledger",
            )
        if expected_sha256 is not None and actual_sha256 != expected_sha256:
            _fail(
                MaterializerFailureCode.INPUT_INVALID,
                "acquired source sha256 does not match its ledger",
            )
        try:
            os.fsync(output_descriptor)
            output_stat = os.fstat(output_descriptor)
        except OSError as exc:
            _fail(
                MaterializerFailureCode.INPUT_IO,
                f"cannot sync private snapshot: {exc}",
            )
        if not stat.S_ISREG(output_stat.st_mode) or output_stat.st_size != copied:
            _fail(
                MaterializerFailureCode.INPUT_IO,
                "private snapshot did not retain the verified byte count",
            )
    except BaseException:
        pending_error = True
        raise
    finally:
        close_error: OSError | None = None
        for open_descriptor in (output_descriptor, descriptor):
            if open_descriptor is None:
                continue
            try:
                os.close(open_descriptor)
            except OSError as exc:
                close_error = close_error or exc
        if pending_error and destination_created:
            try:
                os.unlink(destination)
            except OSError:
                pass
        if close_error is not None and not pending_error:
            _fail(
                MaterializerFailureCode.INPUT_IO,
                f"cannot close verified descriptor: {close_error}",
            )
    _require_deadline(deadline)
    return _FrozenFile(destination, actual_sha256, copied)


def _read_frozen_file(
    frozen: _FrozenFile,
    *,
    deadline: RefineDeadline,
) -> bytes:
    descriptor, before = _safe_source_descriptor(frozen.path)
    payload = bytearray()
    digest = hashlib.sha256()
    pending_error = False
    try:
        chunk_index = 0
        while True:
            if chunk_index % 16 == 0:
                _require_deadline(deadline)
            try:
                chunk = os.read(descriptor, _COPY_CHUNK_BYTES)
            except OSError as exc:
                _fail(
                    MaterializerFailureCode.INPUT_IO,
                    f"cannot read private snapshot: {exc}",
                )
            if not chunk:
                break
            payload.extend(chunk)
            digest.update(chunk)
            if len(payload) > frozen.size_bytes:
                _fail(
                    MaterializerFailureCode.INPUT_INVALID,
                    "private snapshot grew after verification",
                )
            chunk_index += 1
        try:
            after = os.fstat(descriptor)
        except OSError as exc:
            _fail(
                MaterializerFailureCode.INPUT_IO,
                f"cannot recheck private snapshot: {exc}",
            )
    except BaseException:
        pending_error = True
        raise
    finally:
        try:
            os.close(descriptor)
        except OSError as exc:
            if not pending_error:
                _fail(
                    MaterializerFailureCode.INPUT_IO,
                    f"cannot close private snapshot: {exc}",
                )
    if (
        _stat_identity(before) != _stat_identity(after)
        or len(payload) != frozen.size_bytes
        or digest.hexdigest() != frozen.sha256
    ):
        _fail(
            MaterializerFailureCode.INPUT_INVALID,
            "private snapshot changed after verification",
        )
    _require_deadline(deadline)
    return bytes(payload)


def _hash_frozen_file(
    frozen: _FrozenFile,
    *,
    deadline: RefineDeadline,
) -> None:
    descriptor, before = _safe_source_descriptor(frozen.path)
    digest = hashlib.sha256()
    size = 0
    pending_error = False
    try:
        chunk_index = 0
        while True:
            if chunk_index % 16 == 0:
                _require_deadline(deadline)
            try:
                chunk = os.read(descriptor, _COPY_CHUNK_BYTES)
            except OSError as exc:
                _fail(
                    MaterializerFailureCode.INPUT_IO,
                    f"cannot hash private file: {exc}",
                )
            if not chunk:
                break
            size += len(chunk)
            if size > frozen.size_bytes:
                _fail(
                    MaterializerFailureCode.INPUT_INVALID,
                    "private file grew after verification",
                )
            digest.update(chunk)
            chunk_index += 1
        try:
            after = os.fstat(descriptor)
        except OSError as exc:
            _fail(
                MaterializerFailureCode.INPUT_IO,
                f"cannot recheck private file: {exc}",
            )
    except BaseException:
        pending_error = True
        raise
    finally:
        try:
            os.close(descriptor)
        except OSError as exc:
            if not pending_error:
                _fail(MaterializerFailureCode.INPUT_IO, f"cannot close private file: {exc}")
    if (
        _stat_identity(before) != _stat_identity(after)
        or size != frozen.size_bytes
        or digest.hexdigest() != frozen.sha256
    ):
        _fail(
            MaterializerFailureCode.INPUT_INVALID,
            "private file changed after verification",
        )


def _json_value(payload: bytes, label: str) -> Any:
    def reject_constant(value: str) -> NoReturn:
        raise ValueError(f"non-finite JSON constant {value}")

    def unique_object(pairs: list[tuple[str, Any]]) -> dict[str, Any]:
        result: dict[str, Any] = {}
        for key, value in pairs:
            if key in result:
                raise ValueError(f"duplicate JSON key {key!r}")
            result[key] = value
        return result

    try:
        text = payload.decode("utf-8", errors="strict")
        return json.loads(
            text,
            object_pairs_hook=unique_object,
            parse_constant=reject_constant,
        )
    except (UnicodeDecodeError, json.JSONDecodeError, ValueError) as exc:
        _fail(
            MaterializerFailureCode.INPUT_INVALID,
            f"{label} is not strict duplicate-free JSON: {exc}",
        )


def _validate_manifest(
    payload: bytes,
    *,
    request: RefineMaterializationRequest,
) -> None:
    document = _json_value(payload, "bundle manifest")
    if not isinstance(document, dict):
        _fail(MaterializerFailureCode.INPUT_INVALID, "bundle manifest must be an object")
    if (
        type(document.get("schemaVersion")) is not int
        or document["schemaVersion"] != 3
        or type(document.get("bundleSpecVersion")) is not int
        or document["bundleSpecVersion"] != 1
        or document.get("scanId") != request.scan_id
        or document.get("checksumAlgorithm") != "sha256"
    ):
        _fail(
            MaterializerFailureCode.INPUT_INVALID,
            "bundle manifest identity/schema contract does not match the request",
        )
    artifacts = document.get("artifacts")
    if not isinstance(artifacts, list) or len(artifacts) > 256:
        _fail(
            MaterializerFailureCode.INPUT_INVALID,
            "bundle manifest artifacts must be a bounded array",
        )
    by_kind: dict[str, dict[str, Any]] = {}
    for row in artifacts:
        if not isinstance(row, dict) or not isinstance(row.get("kind"), str):
            _fail(
                MaterializerFailureCode.INPUT_INVALID,
                "bundle manifest artifact rows must be objects with string kinds",
            )
        kind = row["kind"]
        if kind in by_kind:
            _fail(
                MaterializerFailureCode.INPUT_INVALID,
                f"bundle manifest artifact kind is duplicated: {kind}",
            )
        by_kind[kind] = row

    sources = {
        "keyframeIndex": request.keyframe_index,
        "keyframeSummary": request.keyframe_summary,
        "keyframesArchive": request.keyframes_archive,
    }
    for kind, source in sources.items():
        row = by_kind.get(kind)
        relative_path, media_type = _MANIFEST_ROWS[kind]
        if (
            row is None
            or row.get("relativePath") != relative_path
            or row.get("mimeType") != media_type
            or row.get("sha256") != source.sha256
            or type(row.get("sizeBytes")) is not int
            or row.get("sizeBytes") != source.size_bytes
        ):
            _fail(
                MaterializerFailureCode.INPUT_INVALID,
                f"bundle manifest does not bind the requested {kind} artifact",
            )


def _validate_member_path(value: object, *, suffix: str) -> str:
    if not isinstance(value, str) or _SAFE_ARCHIVE_MEMBER.fullmatch(value) is None:
        _fail(
            MaterializerFailureCode.INPUT_INVALID,
            "keyframe index contains an unsafe archive member path",
        )
    path = PurePosixPath(value)
    if (
        path.is_absolute()
        or len(path.parts) != 2
        or any(part in ("", ".", "..") for part in path.parts)
        or str(path) != value
        or path.suffix.lower() != suffix
    ):
        _fail(
            MaterializerFailureCode.INPUT_INVALID,
            "keyframe index contains an unsafe archive member path",
        )
    return value


def _parse_index(
    payload: bytes,
    *,
    limits: RefineMaterializationLimits,
) -> tuple[_IndexedFrame, ...]:
    try:
        text = payload.decode("utf-8", errors="strict")
    except UnicodeDecodeError as exc:
        _fail(MaterializerFailureCode.INPUT_INVALID, f"keyframe index is not UTF-8: {exc}")
    rows: list[_IndexedFrame] = []
    paths: set[str] = set()
    names: set[str] = set()
    for line_number, line in enumerate(text.splitlines(), 1):
        if not line.strip():
            continue
        if len(line.encode("utf-8")) > limits.max_index_line_bytes:
            _fail(
                MaterializerFailureCode.INPUT_INVALID,
                f"keyframe index line {line_number} exceeds its byte ceiling",
            )
        if len(rows) >= limits.max_frames:
            _fail(
                MaterializerFailureCode.INPUT_INVALID,
                "keyframe index exceeds the frame-count ceiling",
            )
        value = _json_value(line.encode("utf-8"), f"keyframe index line {line_number}")
        if not isinstance(value, dict):
            _fail(
                MaterializerFailureCode.INPUT_INVALID,
                f"keyframe index line {line_number} must be an object",
            )
        try:
            frame = normalize_keyframe_entry(value, len(rows))
        except AdapterError as exc:
            _fail(
                MaterializerFailureCode.INPUT_INVALID,
                f"invalid keyframe index row {line_number}: {exc}",
            )
        heic_path = _validate_member_path(value.get("heicPath"), suffix=".heic")
        depth_value = value.get("depthPath")
        has_depth = value.get("hasDepth")
        smoothed_depth = value.get("smoothedDepth")
        if type(has_depth) is not bool or type(smoothed_depth) is not bool:
            _fail(
                MaterializerFailureCode.INPUT_INVALID,
                "keyframe depth flags must be booleans",
            )
        depth_path: str | None
        if depth_value is None:
            depth_path = None
            if has_depth or smoothed_depth:
                _fail(
                    MaterializerFailureCode.INPUT_INVALID,
                    "keyframe depth flags disagree with the absent depth member",
                )
        else:
            depth_path = _validate_member_path(depth_value, suffix=".bin")
            if not has_depth or PurePosixPath(depth_path).stem != PurePosixPath(heic_path).stem:
                _fail(
                    MaterializerFailureCode.INPUT_INVALID,
                    "keyframe depth member must share its HEIC stem",
                )
        if heic_path in paths or frame.image_name in names or (
            depth_path is not None and depth_path in paths
        ):
            _fail(
                MaterializerFailureCode.INPUT_INVALID,
                "keyframe index paths and image names must be unique",
            )
        paths.add(heic_path)
        if depth_path is not None:
            paths.add(depth_path)
        names.add(frame.image_name)
        rows.append(_IndexedFrame(frame=frame, depth_path=depth_path))
    if len(rows) < 3:
        _fail(
            MaterializerFailureCode.INPUT_INVALID,
            "Refine materialization needs at least three keyframes",
        )
    return tuple(
        sorted(
            rows,
            key=lambda row: (
                row.frame.frame_timestamp_s,
                row.frame.image_name,
            ),
        )
    )


def _validate_summary(
    payload: bytes,
    *,
    frame_count: int,
    limits: RefineMaterializationLimits,
) -> None:
    summary = _json_value(payload, "keyframe summary")
    if not isinstance(summary, dict):
        _fail(MaterializerFailureCode.INPUT_INVALID, "keyframe summary must be an object")
    fired = summary.get("fired")
    if type(fired) is not int or fired < 0 or fired > limits.max_frames:
        _fail(
            MaterializerFailureCode.INPUT_INVALID,
            "keyframe summary fired must be a bounded non-negative integer",
        )
    if fired != frame_count:
        _fail(
            MaterializerFailureCode.INPUT_INVALID,
            "keyframe summary fired count disagrees with the index",
        )
    for key in ("blurRejected", "rawBlurFailures", "encodeDropped"):
        value = summary.get(key)
        if type(value) is not int or value < 0:
            _fail(
                MaterializerFailureCode.INPUT_INVALID,
                f"keyframe summary {key} must be a non-negative integer",
            )
    ratio = summary.get("blurRejectionRatio")
    if (
        isinstance(ratio, bool)
        or not isinstance(ratio, (int, float))
        or not math.isfinite(float(ratio))
        or not 0.0 <= float(ratio) <= 1.0
    ):
        _fail(
            MaterializerFailureCode.INPUT_INVALID,
            "keyframe summary blurRejectionRatio must be finite in [0,1]",
        )


@contextmanager
def _open_frozen_binary(
    frozen: _FrozenFile,
    *,
    deadline: RefineDeadline,
) -> Iterator[tuple[BinaryIO, os.stat_result]]:
    _require_deadline(deadline)
    descriptor, before = _safe_source_descriptor(frozen.path)
    handle = os.fdopen(descriptor, "rb", closefd=True)
    pending_error = False
    try:
        digest = hashlib.sha256()
        size = 0
        chunk_index = 0
        while True:
            if chunk_index % 16 == 0:
                _require_deadline(deadline)
            try:
                chunk = os.read(handle.fileno(), _COPY_CHUNK_BYTES)
            except OSError as exc:
                _fail(
                    MaterializerFailureCode.INPUT_IO,
                    f"cannot verify private archive descriptor: {exc}",
                )
            if not chunk:
                break
            size += len(chunk)
            if size > frozen.size_bytes:
                _fail(
                    MaterializerFailureCode.INPUT_INVALID,
                    "private archive grew after verification",
                )
            digest.update(chunk)
            chunk_index += 1
        try:
            verified_stat = os.fstat(handle.fileno())
            os.lseek(handle.fileno(), 0, os.SEEK_SET)
        except OSError as exc:
            _fail(
                MaterializerFailureCode.INPUT_IO,
                f"cannot rewind private archive descriptor: {exc}",
            )
        if (
            _stat_identity(before) != _stat_identity(verified_stat)
            or size != frozen.size_bytes
            or digest.hexdigest() != frozen.sha256
        ):
            _fail(
                MaterializerFailureCode.INPUT_INVALID,
                "private archive changed after acquisition verification",
            )
        yield handle, before
        try:
            after = os.fstat(handle.fileno())
        except OSError as exc:
            _fail(
                MaterializerFailureCode.INPUT_IO,
                f"cannot recheck private archive descriptor: {exc}",
            )
        if _stat_identity(before) != _stat_identity(after):
            _fail(
                MaterializerFailureCode.INPUT_INVALID,
                "private archive changed while it was consumed",
            )
    except BaseException:
        pending_error = True
        raise
    finally:
        try:
            handle.close()
        except OSError as exc:
            if not pending_error:
                _fail(
                    MaterializerFailureCode.INPUT_IO,
                    f"cannot close private archive descriptor: {exc}",
                )
    _require_deadline(deadline)


def _expected_archive_members(frames: tuple[_IndexedFrame, ...]) -> frozenset[str]:
    values: set[str] = set()
    for row in frames:
        values.add(row.frame.heic_path)
        if row.depth_path is not None:
            values.add(row.depth_path)
    return frozenset(values)


def _preflight_archive(
    archive: _FrozenFile,
    *,
    expected_names: frozenset[str],
    limits: RefineMaterializationLimits,
    deadline: RefineDeadline,
) -> tuple[_ArchiveMember, ...]:
    members: list[_ArchiveMember] = []
    names: set[str] = set()
    expanded = 0
    try:
        with _open_frozen_binary(archive, deadline=deadline) as (handle, _snapshot):
            with tarfile.open(
                fileobj=_DeadlineFile(handle, deadline),
                mode="r:",
            ) as tar:
                while True:
                    _require_deadline(deadline)
                    member = tar.next()
                    if member is None:
                        break
                    if len(members) >= limits.max_archive_members:
                        _fail(
                            MaterializerFailureCode.INPUT_INVALID,
                            "keyframes archive exceeds its member-count ceiling",
                        )
                    name = member.name
                    if (
                        not isinstance(name, str)
                        or len(name.encode("utf-8", errors="replace")) > 512
                        or _SAFE_ARCHIVE_MEMBER.fullmatch(name) is None
                    ):
                        _fail(
                            MaterializerFailureCode.INPUT_INVALID,
                            "keyframes archive contains an unsafe member path",
                        )
                    path = PurePosixPath(name)
                    if (
                        path.is_absolute()
                        or len(path.parts) != 2
                        or any(part in ("", ".", "..") for part in path.parts)
                        or str(path) != name
                    ):
                        _fail(
                            MaterializerFailureCode.INPUT_INVALID,
                            "keyframes archive member escapes the extraction root",
                        )
                    if (
                        member.type not in (tarfile.REGTYPE, tarfile.AREGTYPE)
                        or member.pax_headers
                        or getattr(member, "sparse", None)
                    ):
                        _fail(
                            MaterializerFailureCode.INPUT_INVALID,
                            "keyframes archive may contain regular files only",
                        )
                    if name in names:
                        _fail(
                            MaterializerFailureCode.INPUT_INVALID,
                            "keyframes archive contains a duplicate member",
                        )
                    if (
                        isinstance(member.size, bool)
                        or not isinstance(member.size, int)
                        or member.size <= 0
                        or member.size > limits.max_archive_member_bytes
                    ):
                        _fail(
                            MaterializerFailureCode.INPUT_INVALID,
                            "keyframes archive member size exceeds its ceiling",
                        )
                    expanded += member.size
                    if expanded > limits.max_archive_expanded_bytes:
                        _fail(
                            MaterializerFailureCode.INPUT_INVALID,
                            "keyframes archive exceeds its expanded-byte ceiling",
                        )
                    names.add(name)
                    members.append(_ArchiveMember(name=name, size_bytes=member.size))
    except RefineMaterializerError:
        raise
    except OSError as exc:
        _fail(
            MaterializerFailureCode.INPUT_IO,
            f"cannot read keyframes archive: {exc}",
        )
    except (tarfile.TarError, EOFError) as exc:
        _fail(
            MaterializerFailureCode.INPUT_INVALID,
            f"keyframes archive is not a readable uncompressed tar: {exc}",
        )
    if names != set(expected_names):
        missing = sorted(set(expected_names) - names)
        extra = sorted(names - set(expected_names))
        _fail(
            MaterializerFailureCode.INPUT_INVALID,
            f"keyframes archive/index membership mismatch; missing={missing}, extra={extra}",
        )
    return tuple(members)


def _extract_archive(
    archive: _FrozenFile,
    *,
    members: tuple[_ArchiveMember, ...],
    destination: Path,
    deadline: RefineDeadline,
) -> dict[str, _ExtractedMember]:
    expected = {member.name: member for member in members}
    extracted: dict[str, _ExtractedMember] = {}
    keyframes_dir = destination / "keyframes"
    try:
        os.mkdir(keyframes_dir, 0o700)
    except OSError as exc:
        _fail(
            MaterializerFailureCode.INPUT_IO,
            f"cannot create private keyframe extraction directory: {exc}",
        )
    try:
        with _open_frozen_binary(archive, deadline=deadline) as (handle, _snapshot):
            with tarfile.open(
                fileobj=_DeadlineFile(handle, deadline),
                mode="r:",
            ) as tar:
                while True:
                    _require_deadline(deadline)
                    member = tar.next()
                    if member is None:
                        break
                    preflight = expected.get(member.name)
                    if (
                        preflight is None
                        or member.type not in (tarfile.REGTYPE, tarfile.AREGTYPE)
                        or member.pax_headers
                        or getattr(member, "sparse", None)
                        or member.size != preflight.size_bytes
                        or member.name in extracted
                    ):
                        _fail(
                            MaterializerFailureCode.INPUT_INVALID,
                            "keyframes archive changed between preflight and extraction",
                        )
                    stream = tar.extractfile(member)
                    if stream is None:
                        _fail(
                            MaterializerFailureCode.INPUT_INVALID,
                            "keyframes archive regular member has no payload",
                        )
                    target = destination.joinpath(*PurePosixPath(member.name).parts)
                    flags = (
                        os.O_WRONLY
                        | os.O_CREAT
                        | os.O_EXCL
                        | getattr(os, "O_CLOEXEC", 0)
                        | getattr(os, "O_NOFOLLOW", 0)
                    )
                    try:
                        output = os.open(target, flags, 0o600)
                    except OSError as exc:
                        _fail(
                            MaterializerFailureCode.INPUT_IO,
                            f"cannot create extracted keyframe: {exc}",
                        )
                    digest = hashlib.sha256()
                    written = 0
                    pending_error = False
                    try:
                        while True:
                            _require_deadline(deadline)
                            chunk = stream.read(_COPY_CHUNK_BYTES)
                            if not chunk:
                                break
                            written += len(chunk)
                            if written > preflight.size_bytes:
                                _fail(
                                    MaterializerFailureCode.INPUT_INVALID,
                                    "archive member exceeds its preflight size",
                                )
                            digest.update(chunk)
                            _write_all(output, chunk, deadline=deadline)
                        if written != preflight.size_bytes:
                            _fail(
                                MaterializerFailureCode.INPUT_INVALID,
                                "archive member is truncated",
                            )
                        os.fsync(output)
                        output_stat = os.fstat(output)
                        if not stat.S_ISREG(output_stat.st_mode) or output_stat.st_size != written:
                            _fail(
                                MaterializerFailureCode.INPUT_IO,
                                "extracted keyframe did not retain its byte count",
                            )
                    except BaseException:
                        pending_error = True
                        raise
                    finally:
                        try:
                            os.close(output)
                        except OSError as exc:
                            if not pending_error:
                                _fail(
                                    MaterializerFailureCode.INPUT_IO,
                                    f"cannot close extracted keyframe: {exc}",
                                )
                    extracted[member.name] = _ExtractedMember(
                        name=member.name,
                        path=target,
                        sha256=digest.hexdigest(),
                        size_bytes=written,
                    )
    except RefineMaterializerError:
        raise
    except OSError as exc:
        _fail(
            MaterializerFailureCode.INPUT_IO,
            f"keyframes archive extraction I/O failed: {exc}",
        )
    except (tarfile.TarError, EOFError) as exc:
        _fail(
            MaterializerFailureCode.INPUT_INVALID,
            f"keyframes archive extraction failed: {exc}",
        )
    if set(extracted) != set(expected):
        _fail(
            MaterializerFailureCode.INPUT_INVALID,
            "keyframes archive extraction did not reproduce the preflight set",
        )
    return extracted


def _validate_raster_evidence(
    value: object,
    *,
    width: int,
    height: int,
) -> FieldRasterMaterialization:
    if not isinstance(value, FieldRasterMaterialization):
        _fail(
            MaterializerFailureCode.RASTER_UNQUALIFIED,
            "raster adapter returned the wrong evidence contract",
        )
    if (
        not isinstance(value.materializer_id, str)
        or not value.materializer_id
        or len(value.materializer_id.encode("utf-8")) > 256
    ):
        _fail(
            MaterializerFailureCode.RASTER_UNQUALIFIED,
            "raster adapter needs a bounded materializer identity",
        )
    dimensions = (
        value.source_width,
        value.source_height,
        value.output_width,
        value.output_height,
    )
    if any(type(dimension) is not int or dimension <= 0 for dimension in dimensions):
        _fail(
            MaterializerFailureCode.RASTER_UNQUALIFIED,
            "raster adapter dimensions must be positive integers",
        )
    if dimensions != (width, height, width, height):
        _fail(
            MaterializerFailureCode.RASTER_UNQUALIFIED,
            "raster adapter source/output dimensions disagree with the index",
        )
    return value


def _validate_canonical_ppm(
    frozen: _FrozenFile,
    *,
    width: int,
    height: int,
    deadline: RefineDeadline,
) -> None:
    header = f"P6\n{width} {height}\n255\n".encode("ascii")
    expected_size = len(header) + width * height * 3
    if frozen.size_bytes != expected_size:
        _fail(
            MaterializerFailureCode.RASTER_UNQUALIFIED,
            "materialized PPM byte count does not match its indexed dimensions",
        )
    descriptor, before = _safe_source_descriptor(frozen.path)
    pending_error = False
    try:
        _require_deadline(deadline)
        try:
            actual_header = os.read(descriptor, len(header))
            after = os.fstat(descriptor)
        except OSError as exc:
            _fail(
                MaterializerFailureCode.INPUT_IO,
                f"cannot inspect materialized PPM: {exc}",
            )
    except BaseException:
        pending_error = True
        raise
    finally:
        try:
            os.close(descriptor)
        except OSError as exc:
            if not pending_error:
                _fail(MaterializerFailureCode.INPUT_IO, f"cannot close PPM: {exc}")
    if _stat_identity(before) != _stat_identity(after) or actual_header != header:
        _fail(
            MaterializerFailureCode.RASTER_UNQUALIFIED,
            "raster adapter must emit canonical binary RGB PPM bytes",
        )


class RefineMaterializer:
    """Materialize verified Refine inputs without queue or stage registration."""

    def __init__(
        self,
        *,
        acquirer: RefineArtifactAcquirer,
        raster_materializer: FieldRasterMaterializer,
        limits: RefineMaterializationLimits | None = None,
    ) -> None:
        self._acquirer = acquirer
        self._raster_materializer = raster_materializer
        self._limits = limits or RefineMaterializationLimits()
        if not isinstance(self._limits, RefineMaterializationLimits):
            raise TypeError("limits must be RefineMaterializationLimits")

    def materialize(
        self,
        request: RefineMaterializationRequest,
        *,
        deadline: RefineDeadline,
    ) -> RefineMaterialization:
        sources = _validate_request(request, self._limits)
        _require_deadline(deadline)
        workspace: Path | None = None
        try:
            workspace = _create_private_workspace(request, deadline=deadline)
            incoming_dir = workspace / "incoming"
            input_dir = workspace / "inputs"
            frozen_by_kind: dict[str, _FrozenFile] = {}
            verified_inputs: list[VerifiedRefineInput] = []
            local_names = {
                "bundleManifest": "manifest.json",
                "keyframeIndex": "keyframe_index.ndjson",
                "keyframeSummary": "keyframe_summary.json",
                "keyframesArchive": "keyframes.tar",
            }
            maxima = {
                "bundleManifest": self._limits.max_manifest_bytes,
                "keyframeIndex": self._limits.max_index_bytes,
                "keyframeSummary": self._limits.max_summary_bytes,
                "keyframesArchive": self._limits.max_archive_bytes,
            }
            for kind, source in sources:
                _require_deadline(deadline)
                incoming = incoming_dir / local_names[kind]
                try:
                    self._acquirer.acquire(
                        object_key=source.object_key,
                        destination=incoming,
                        deadline=deadline,
                    )
                except RefineMaterializerError:
                    raise
                except AdapterError as exc:
                    if exc.code == MaterializerFailureCode.DEADLINE.value:
                        _fail(MaterializerFailureCode.DEADLINE, str(exc))
                    _fail(MaterializerFailureCode.INPUT_IO, str(exc))
                except Exception as exc:  # noqa: BLE001 - normalize injected acquisition
                    _fail(
                        MaterializerFailureCode.INPUT_IO,
                        f"input acquirer raised {type(exc).__name__}",
                    )
                _require_deadline(deadline)
                frozen = _freeze_untrusted_file(
                    incoming,
                    input_dir / local_names[kind],
                    maximum_size=maxima[kind],
                    expected_sha256=source.sha256,
                    expected_size=source.size_bytes,
                    deadline=deadline,
                )
                try:
                    os.unlink(incoming)
                except OSError as exc:
                    _fail(
                        MaterializerFailureCode.INPUT_IO,
                        f"cannot remove untrusted acquisition path: {exc}",
                    )
                frozen_by_kind[kind] = frozen
                verified_inputs.append(
                    VerifiedRefineInput(
                        kind=kind,
                        object_key=source.object_key,
                        sha256=frozen.sha256,
                        size_bytes=frozen.size_bytes,
                        local_path=frozen.path,
                    )
                )

            manifest_payload = _read_frozen_file(
                frozen_by_kind["bundleManifest"],
                deadline=deadline,
            )
            _validate_manifest(manifest_payload, request=request)
            index_payload = _read_frozen_file(
                frozen_by_kind["keyframeIndex"],
                deadline=deadline,
            )
            frames = _parse_index(index_payload, limits=self._limits)
            summary_payload = _read_frozen_file(
                frozen_by_kind["keyframeSummary"],
                deadline=deadline,
            )
            _validate_summary(
                summary_payload,
                frame_count=len(frames),
                limits=self._limits,
            )

            archive = frozen_by_kind["keyframesArchive"]
            expected_members = _expected_archive_members(frames)
            preflight = _preflight_archive(
                archive,
                expected_names=expected_members,
                limits=self._limits,
                deadline=deadline,
            )
            extracted = _extract_archive(
                archive,
                members=preflight,
                destination=workspace / "extracted",
                deadline=deadline,
            )

            materialized_frames: list[MaterializedRefineFrame] = []
            raster_incoming_dir = workspace / "raster-incoming"
            images_dir = workspace / "images"
            for engine_ordinal, indexed in enumerate(frames):
                _require_deadline(deadline)
                source = extracted[indexed.frame.heic_path]
                source_frozen = _FrozenFile(
                    source.path,
                    source.sha256,
                    source.size_bytes,
                )
                engine_name = f"frame_{engine_ordinal:06d}.ppm"
                incoming_raster = raster_incoming_dir / engine_name
                width = indexed.frame.intrinsics.image_width
                height = indexed.frame.intrinsics.image_height
                try:
                    evidence_value = self._raster_materializer.materialize(
                        source=source.path,
                        destination=incoming_raster,
                        engine_name=engine_name,
                        encoded_width=width,
                        encoded_height=height,
                        deadline=deadline,
                    )
                except RefineMaterializerError:
                    raise
                except AdapterError as exc:
                    if exc.code == MaterializerFailureCode.DEADLINE.value:
                        _fail(MaterializerFailureCode.DEADLINE, str(exc))
                    _fail(MaterializerFailureCode.RASTER_UNQUALIFIED, str(exc))
                except Exception as exc:  # noqa: BLE001 - normalize unqualified adapter
                    _fail(
                        MaterializerFailureCode.RASTER_UNQUALIFIED,
                        f"raster adapter raised {type(exc).__name__}",
                    )
                _require_deadline(deadline)
                evidence = _validate_raster_evidence(
                    evidence_value,
                    width=width,
                    height=height,
                )
                raster = _freeze_untrusted_file(
                    incoming_raster,
                    images_dir / engine_name,
                    maximum_size=self._limits.max_raster_bytes,
                    deadline=deadline,
                )
                try:
                    os.unlink(incoming_raster)
                except OSError as exc:
                    _fail(
                        MaterializerFailureCode.INPUT_IO,
                        f"cannot remove untrusted raster path: {exc}",
                    )
                _validate_canonical_ppm(
                    raster,
                    width=width,
                    height=height,
                    deadline=deadline,
                )
                _hash_frozen_file(raster, deadline=deadline)
                _hash_frozen_file(source_frozen, deadline=deadline)
                materialized_frames.append(
                    MaterializedRefineFrame(
                        frame=indexed.frame,
                        source_archive_key=request.keyframes_archive.object_key,
                        source_member=indexed.frame.heic_path,
                        source_path=source.path,
                        source_sha256=source.sha256,
                        source_size_bytes=source.size_bytes,
                        engine_name=engine_name,
                        engine_relative_path=f"images/{engine_name}",
                        engine_path=raster.path,
                        engine_sha256=raster.sha256,
                        engine_size_bytes=raster.size_bytes,
                        encoded_width=width,
                        encoded_height=height,
                        materializer_id=evidence.materializer_id,
                    )
                )

            try:
                os.rmdir(incoming_dir)
                os.rmdir(raster_incoming_dir)
            except OSError as exc:
                _fail(
                    MaterializerFailureCode.INPUT_IO,
                    f"cannot retire untrusted workspace lanes: {exc}",
                )
            _require_deadline(deadline)
            return RefineMaterialization(
                task_id=request.task_id,
                lease_id=request.lease_id,
                workspace_root=workspace,
                inputs=tuple(verified_inputs),
                frames=tuple(materialized_frames),
            )
        except BaseException as primary_error:
            if workspace is not None:
                try:
                    shutil.rmtree(workspace)
                except OSError as cleanup_error:
                    raise RefineMaterializerError(
                        MaterializerFailureCode.INPUT_IO,
                        f"task/lease workspace cleanup failed: {cleanup_error}",
                    ) from primary_error
            raise
