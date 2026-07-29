"""Disabled, queue-independent input materializer for P2 Refine.

This module owns a private workspace for one task lease, acquires the four
immutable Field inputs through an injected adapter, verifies each acquisition
from one nonblocking/no-follow descriptor, and extracts ``keyframes.tar`` only
after a complete bounded preflight.

Concrete Field Storage and Field/Core Image adapters are packaged separately,
but remain disabled and uncomposed. Tests use deterministic in-memory Storage
and pre-materialized PPM fakes.

The result deliberately does not import :mod:`refine_runner`.  A later disabled
composition layer can adapt each :class:`MaterializedRefineFrame` to the
runner's ``RefineFrameInput`` by preserving ``frame`` as the source identity and
using ``engine_name``/``engine_path`` as the canonical engine identity.  The
explicit mapping prevents a decoded ``.ppm`` from being confused with its
archive ``.heic`` source. The composition must retain this materialization and
consume bytes through ``open_verified_file`` until the runner finishes.
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
from .refine_adapter import (
    AdapterError,
    NormalizedFrame,
    RefineDeadline,
    normalize_keyframe_entry,
)

_COPY_CHUNK_BYTES = 1 << 20
_MAX_MATERIALIZER_ID_BYTES = 128
_SAFE_IDENTIFIER = re.compile(r"[A-Za-z0-9][A-Za-z0-9._:-]{0,127}")
_SAFE_ARCHIVE_MEMBER = re.compile(r"keyframes/[A-Za-z0-9][A-Za-z0-9._-]*\.(?:heic|bin)")
_SHA256 = re.compile(r"[0-9a-f]{64}")
# THE READ LAYOUT IS KEYED BY ``room_id``, NOT by the scan.  Every template
# below formats ``{room_id}`` because that is what the shipped uploader actually
# writes: ``RoomScanStoragePath.object`` (CaptureKit) builds every ``room-scans``
# key as ``{folder}/{userId}/{roomId}/{filename}``, capture-bundle-spec-v1 B-18
# pins that shape as a contract, and ``keys.assert_owner_prefix`` has always said
# segment ``[2]`` is the row's ``room_id`` -- every P1 caller (ingest, solve,
# drawings) passes ``scan_row["room_id"]`` into it.
#
# These templates formatted ``{scan_id}`` until I104.  That was not a second
# opinion about the layout; it was the same parameter renamed at the call site.
# It made a Storage-sourced Refine run impossible: the request's ``scan_id`` had
# to equal BOTH this key segment and the manifest's ``scanId``, and on the real
# capture I104 measured those are two different UUIDs.  R122 authorised the split.
#
# The REJECTED alternative was to keep one field and teach the acquirer to accept
# either identifier at ``[2]``.  That reads as leniency, but it is the opposite:
# it turns the ownership check into "matches one of the ids I happen to hold",
# which is exactly the RLS-equivalent the worker's service key makes load-bearing
# (B-18: the service key bypasses storage RLS, so this check IS the guard).  Three
# identifiers exist; the contract now names three.
_INPUT_LAYOUT = (
    (
        "bundleManifest",
        "manifest",
        "manifests/{user_id}/{room_id}/manifest.json",
        4 * 1024 * 1024,
    ),
    (
        "keyframeIndex",
        "keyframe_index",
        "keyframes/{user_id}/{room_id}/keyframe_index.ndjson",
        32 * 1024 * 1024,
    ),
    (
        "keyframeSummary",
        "keyframe_summary",
        "keyframes/{user_id}/{room_id}/keyframe_summary.json",
        1024 * 1024,
    ),
    (
        "keyframesArchive",
        "keyframes_archive",
        "bundle/{user_id}/{room_id}/keyframes.tar",
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


def _fail_acquisition(exc: AdapterError) -> NoReturn:
    for code in MaterializerFailureCode:
        if exc.code == code.value:
            _fail(code, str(exc))
    _fail(MaterializerFailureCode.INPUT_IO, str(exc))


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

    THREE IDENTIFIERS, DELIBERATELY NOT ONE (R122, on the evidence of I104):

    * ``room_id`` -- ``room_scans.room_id``.  The Storage owner-prefix segment
      for READS out of the private ``room-scans`` bucket.  B-18 pins it; the iOS
      uploader writes it; ``keys.assert_owner_prefix``'s own docstring names it.
    * ``scan_id`` -- ``room_scans.id``.  The queue payload's identity and the
      publication prefix ``room_file/{user}/{scan}/v{n}/``.  It is NOT a read
      segment and this module never asserts a read key against it; it is carried
      so the composed lifecycle can hand the same request to the publisher.
    * ``capture_session_id`` -- the manifest's own ``scanId``.  Device-minted at
      capture-session start (``RoomPlanScanSession.scanSessionId``) with NO
      server-side counterpart: no ``room_scans`` column has ever held it.
      OPTIONAL, default ``None``: a caller that knows the value still gets an
      exact equality guard in ``_validate_manifest``; a caller that does not --
      which is every caller today, because nothing persists it -- gets the value
      recorded on the result instead of a contract it cannot satisfy.
    """

    user_id: str
    scan_id: str
    room_id: str
    task_id: str
    lease_id: str
    workspace_parent: Path
    manifest: RefineSourceArtifact
    keyframe_index: RefineSourceArtifact
    keyframe_summary: RefineSourceArtifact
    keyframes_archive: RefineSourceArtifact
    capture_session_id: str | None = None


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
    # One task stays below DeskDev's ~1.5 GiB nominal estimate and 24 GiB disk
    # posture in ordinary use, while 4 GiB is the absolute fail-closed ceiling.
    max_raster_workspace_bytes: int = 4 * 1024 * 1024 * 1024

    def __post_init__(self) -> None:
        for name, value in vars(self).items():
            if isinstance(value, bool) or not isinstance(value, int) or value <= 0:
                raise ValueError(f"{name} must be a positive integer")


class RefineBoundedWriter(Protocol):
    """Materializer-owned private regular-file sink with an exact byte ceiling.

    Its synchronous ``write`` checkpoints the carried deadline around bounded
    ``os.write`` calls. In-process code cannot preempt a kernel-blocked regular
    file write, so future production composition still needs a killable
    execution boundary before Refine can be enabled.
    """

    def write(self, payload: bytes | bytearray | memoryview) -> int: ...


class RefinePinnedSource(Protocol):
    """Deadline-aware view of one already-verified, pinned source descriptor."""

    def read(self, size: int = -1) -> bytes: ...

    def seek(self, offset: int, whence: int = os.SEEK_SET) -> int: ...

    def tell(self) -> int: ...

    def fileno(self) -> int: ...


class RefineArtifactAcquirer(Protocol):
    """Injected authenticated acquisition seam.

    The implementation receives the exact validated source fingerprint and
    owner identity -- ``user_id`` plus ``room_id``, which are the two segments
    the 00077 storage RLS reads and therefore the only two an acquirer may
    re-check. It must repeat owner scoping before service-role I/O, stream
    only through ``destination``, and obey the supplied absolute deadline. The
    sink is the materializer-owned private regular-file writer and enforces the
    reviewed source size while the callback is running; no unrestricted
    destination path is exposed. Implementations must checkpoint the deadline
    immediately before and after each synchronous sink write. They cannot claim
    to preempt a kernel-blocked write while running in-process.
    """

    def acquire(
        self,
        *,
        source: RefineSourceArtifact,
        user_id: str,
        room_id: str,
        destination: RefineBoundedWriter,
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
    """Field/Core Image HEIC-to-engine-raster seam.

    The implementation receives a pinned read-only source view, its reviewed
    archive name, and a bounded output sink; it never receives workspace paths.
    """

    def materialize(
        self,
        *,
        source: RefinePinnedSource,
        source_name: str,
        destination: RefineBoundedWriter,
        engine_name: str,
        encoded_width: int,
        encoded_height: int,
        deadline: RefineDeadline,
    ) -> FieldRasterMaterialization: ...


@dataclass(frozen=True)
class VerifiedRefineInput:
    """One exact acquired input suitable for the runner input hash ledger.

    ``local_path`` is display metadata. Consumers must acquire bytes through
    :meth:`RefineMaterialization.open_verified_file`.
    """

    kind: str
    object_key: str
    sha256: str
    size_bytes: int
    local_path: Path


@dataclass(frozen=True)
class MaterializedRefineFrame:
    """Explicit source-to-engine identity mapping for one indexed keyframe.

    The absolute paths are display metadata. Consumers must acquire bytes
    through :meth:`RefineMaterialization.open_verified_file`.
    """

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
    """Private, verified, still-unpublished runner input.

    The workspace remains descriptor-pinned until :meth:`cleanup`. Consumers
    must use :meth:`open_verified_file`; reopening the absolute display paths
    would discard the ancestry pin.
    """

    task_id: str
    lease_id: str
    workspace_root: Path
    inputs: tuple[VerifiedRefineInput, ...]
    frames: tuple[MaterializedRefineFrame, ...]
    #: The manifest's own ``scanId``, as OBSERVED -- recorded, not equated.
    #: Nothing server-side holds this value, so a run that carries it forward is
    #: the only way a later reader can tell which device capture session produced
    #: the bundle.  Discarding it (the shape before R122) meant the one
    #: identifier the bundle actually asserts about itself left no trace.
    capture_session_id: str
    _workspace_anchor: _PrivateWorkspace = field(repr=False, compare=False)
    production_enablement: str = field(default="disabled", init=False)

    def validate_workspace(self) -> None:
        """Fail closed if the visible handoff path no longer matches its pin."""

        self._workspace_anchor.validate_path_identity()

    @contextmanager
    def open_verified_file(
        self,
        relative_path: str,
        *,
        deadline: RefineDeadline,
    ) -> Iterator[RefinePinnedSource]:
        """Open a ledger-bound file through the pinned workspace hierarchy."""

        if not isinstance(relative_path, str):
            _fail(
                MaterializerFailureCode.INPUT_INVALID,
                "verified workspace path must be a string",
            )
        candidate = PurePosixPath(relative_path)
        if candidate.is_absolute() or str(candidate) != relative_path:
            _fail(
                MaterializerFailureCode.INPUT_INVALID,
                "verified workspace path must be canonical and relative",
            )
        ledger: dict[str, tuple[str, int]] = {}
        for source in self.inputs:
            try:
                local_relative = source.local_path.relative_to(
                    self.workspace_root
                ).as_posix()
            except ValueError:
                _fail(
                    MaterializerFailureCode.INPUT_INVALID,
                    "verified input path escaped its workspace",
                )
            ledger[local_relative] = (source.sha256, source.size_bytes)
        for frame in self.frames:
            ledger[f"extracted/{frame.source_member}"] = (
                frame.source_sha256,
                frame.source_size_bytes,
            )
            ledger[frame.engine_relative_path] = (
                frame.engine_sha256,
                frame.engine_size_bytes,
            )
        expected = ledger.get(relative_path)
        if expected is None:
            _fail(
                MaterializerFailureCode.INPUT_INVALID,
                "workspace file is not present in the verified materialization ledger",
            )
        frozen = _FrozenFile(
            workspace=self._workspace_anchor,
            relative_path=candidate,
            sha256=expected[0],
            size_bytes=expected[1],
        )
        with _open_frozen_binary(frozen, deadline=deadline) as (handle, _snapshot):
            yield _DeadlineFile(handle, deadline)

    def cleanup(self) -> None:
        """Delete the pinned private workspace and release its descriptors."""

        self._workspace_anchor.cleanup()

    def __enter__(self) -> RefineMaterialization:
        self.validate_workspace()
        return self

    def __exit__(self, *_exc: object) -> None:
        self.cleanup()


@dataclass(frozen=True)
class _FrozenFile:
    workspace: _PrivateWorkspace
    relative_path: PurePosixPath
    sha256: str
    size_bytes: int

    @property
    def path(self) -> Path:
        return self.workspace.path.joinpath(*self.relative_path.parts)


@dataclass(frozen=True)
class _IndexedFrame:
    frame: NormalizedFrame
    depth_path: str | None


@dataclass(frozen=True)
class _ArchiveMember:
    name: str
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

    def fileno(self) -> int:
        return self._handle.fileno()


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


def _directory_open_flags() -> int:
    nofollow = getattr(os, "O_NOFOLLOW", None)
    directory = getattr(os, "O_DIRECTORY", None)
    if nofollow is None or directory is None:
        _fail(
            MaterializerFailureCode.INPUT_INVALID,
            "no-follow directory descriptors are unavailable",
        )
    return os.O_RDONLY | nofollow | directory | getattr(os, "O_CLOEXEC", 0)


def _open_absolute_directory(path: Path) -> int:
    """Walk and pin an absolute directory without following any symlink component."""

    if not path.is_absolute() or any(
        part in ("", ".", "..") for part in path.parts[1:]
    ):
        _fail(
            MaterializerFailureCode.INPUT_INVALID,
            "workspace parent must have canonical absolute components",
        )
    flags = _directory_open_flags()
    try:
        descriptor = os.open(os.sep, flags)
    except OSError as exc:
        _fail(
            MaterializerFailureCode.INPUT_IO,
            f"cannot pin the filesystem root: {exc}",
        )
    pending_error = False
    try:
        for component in path.parts[1:]:
            try:
                child = os.open(component, flags, dir_fd=descriptor)
            except OSError as exc:
                if exc.errno in (errno.ELOOP, errno.ENOTDIR):
                    _fail(
                        MaterializerFailureCode.INPUT_INVALID,
                        "workspace parent ancestry must contain only real directories",
                    )
                _fail(
                    MaterializerFailureCode.INPUT_IO,
                    f"workspace parent is unavailable: {exc}",
                )
            try:
                os.close(descriptor)
            except OSError as exc:
                os.close(child)
                _fail(
                    MaterializerFailureCode.INPUT_IO,
                    f"cannot close workspace ancestry descriptor: {exc}",
                )
            descriptor = child
        metadata = os.fstat(descriptor)
    except BaseException:
        pending_error = True
        raise
    finally:
        if pending_error:
            try:
                os.close(descriptor)
            except OSError:
                pass
    if not stat.S_ISDIR(metadata.st_mode):
        os.close(descriptor)
        _fail(
            MaterializerFailureCode.INPUT_INVALID,
            "workspace parent must be a directory",
        )
    return descriptor


@dataclass
class _PrivateWorkspace:
    path: Path
    name: str
    parent_descriptor: int | None
    workspace_descriptor: int | None

    def validate_path_identity(self) -> None:
        if self.parent_descriptor is None or self.workspace_descriptor is None:
            _fail(
                MaterializerFailureCode.INPUT_IO,
                "private workspace descriptors are unavailable",
            )
        try:
            opened = os.fstat(self.workspace_descriptor)
            anchored = os.stat(
                self.name,
                dir_fd=self.parent_descriptor,
                follow_symlinks=False,
            )
            visible = os.lstat(self.path)
        except OSError as exc:
            _fail(
                MaterializerFailureCode.INPUT_INVALID,
                f"private workspace path identity changed: {exc}",
            )
        expected = (opened.st_dev, opened.st_ino)
        if (
            not stat.S_ISDIR(opened.st_mode)
            or stat.S_IMODE(opened.st_mode) != 0o700
            or expected != (anchored.st_dev, anchored.st_ino)
            or expected != (visible.st_dev, visible.st_ino)
            or stat.S_ISLNK(anchored.st_mode)
            or stat.S_ISLNK(visible.st_mode)
        ):
            _fail(
                MaterializerFailureCode.INPUT_INVALID,
                "private workspace path no longer names its pinned directory",
            )

    def open_directory(self, *components: str) -> int:
        if self.workspace_descriptor is None:
            _fail(
                MaterializerFailureCode.INPUT_IO,
                "private workspace descriptor is unavailable",
            )
        try:
            descriptor = os.dup(self.workspace_descriptor)
        except OSError as exc:
            _fail(
                MaterializerFailureCode.INPUT_IO,
                f"cannot duplicate private workspace descriptor: {exc}",
            )
        pending_error = False
        try:
            for component in components:
                if (
                    not isinstance(component, str)
                    or not component
                    or component in (".", "..")
                    or "/" in component
                    or "\x00" in component
                ):
                    _fail(
                        MaterializerFailureCode.INPUT_INVALID,
                        "private workspace path has an unsafe component",
                    )
                child: int | None = None
                try:
                    child = os.open(
                        component,
                        _directory_open_flags(),
                        dir_fd=descriptor,
                    )
                    metadata = os.fstat(child)
                except OSError as exc:
                    if child is not None:
                        try:
                            os.close(child)
                        except OSError:
                            pass
                    _fail(
                        MaterializerFailureCode.INPUT_IO,
                        f"cannot pin private workspace directory {component!r}: {exc}",
                    )
                if (
                    not stat.S_ISDIR(metadata.st_mode)
                    or metadata.st_uid != os.geteuid()
                    or stat.S_IMODE(metadata.st_mode) != 0o700
                ):
                    os.close(child)
                    _fail(
                        MaterializerFailureCode.INPUT_INVALID,
                        f"private workspace directory {component!r} is untrusted",
                    )
                try:
                    os.close(descriptor)
                except OSError as exc:
                    os.close(child)
                    _fail(
                        MaterializerFailureCode.INPUT_IO,
                        f"cannot close private workspace directory: {exc}",
                    )
                descriptor = child
            return descriptor
        except BaseException:
            pending_error = True
            raise
        finally:
            if pending_error:
                try:
                    os.close(descriptor)
                except OSError:
                    pass

    def cleanup(self) -> None:
        cleanup_error: OSError | None = None
        if self.parent_descriptor is not None:
            try:
                if self.workspace_descriptor is None:
                    raise OSError("private workspace descriptor is unavailable")
                opened = os.fstat(self.workspace_descriptor)
                anchored = os.stat(
                    self.name,
                    dir_fd=self.parent_descriptor,
                    follow_symlinks=False,
                )
                if (opened.st_dev, opened.st_ino) != (
                    anchored.st_dev,
                    anchored.st_ino,
                ):
                    raise OSError(
                        "private workspace entry no longer names its pinned directory"
                    )
                shutil.rmtree(self.name, dir_fd=self.parent_descriptor)
            except FileNotFoundError:
                pass
            except OSError as exc:
                cleanup_error = exc
        for attribute in ("workspace_descriptor", "parent_descriptor"):
            descriptor = getattr(self, attribute)
            if descriptor is None:
                continue
            try:
                os.close(descriptor)
            except OSError as exc:
                cleanup_error = cleanup_error or exc
            setattr(self, attribute, None)
        if cleanup_error is not None:
            _fail(
                MaterializerFailureCode.INPUT_IO,
                f"task/lease workspace cleanup failed: {cleanup_error}",
            )


class _BoundedFileWriter:
    """Private descriptor-backed sink with sticky deadline and size failures."""

    def __init__(
        self,
        *,
        directory_descriptor: int,
        filename: str,
        expected_size: int,
        maximum_size: int,
        deadline: RefineDeadline,
        violation_code: MaterializerFailureCode,
        label: str,
    ) -> None:
        if (
            type(expected_size) is not int
            or expected_size <= 0
            or type(maximum_size) is not int
            or maximum_size <= 0
            or expected_size > maximum_size
        ):
            _fail(
                MaterializerFailureCode.INPUT_INVALID,
                f"{label} has an invalid write ceiling",
            )
        self._directory_descriptor = directory_descriptor
        self._filename = filename
        self._expected_size = expected_size
        self._maximum_size = maximum_size
        self._deadline = deadline
        self._violation_code = violation_code
        self._label = label
        self._written = 0
        self._violation: RefineMaterializerError | None = None
        self._descriptor: int | None = None
        flags = (
            os.O_WRONLY
            | os.O_CREAT
            | os.O_EXCL
            | getattr(os, "O_CLOEXEC", 0)
            | getattr(os, "O_NOFOLLOW", 0)
        )
        try:
            self._descriptor = os.open(
                filename,
                flags,
                0o600,
                dir_fd=directory_descriptor,
            )
            metadata = os.fstat(self._descriptor)
        except OSError as exc:
            self._close_and_unlink()
            _fail(
                MaterializerFailureCode.INPUT_IO,
                f"cannot create bounded {label} destination: {exc}",
            )
        if (
            not stat.S_ISREG(metadata.st_mode)
            or stat.S_IMODE(metadata.st_mode) != 0o600
        ):
            self._close_and_unlink()
            _fail(
                MaterializerFailureCode.INPUT_INVALID,
                f"bounded {label} destination is not a private regular file",
            )

    def _record_violation(
        self,
        code: MaterializerFailureCode,
        message: str,
    ) -> NoReturn:
        if self._violation is None:
            self._violation = RefineMaterializerError(code, message)
        raise self._violation

    def _checkpoint(self) -> None:
        try:
            _require_deadline(self._deadline)
        except RefineMaterializerError as exc:
            self._violation = self._violation or exc
            raise self._violation

    def write(self, payload: bytes | bytearray | memoryview) -> int:
        if self._violation is not None:
            raise self._violation
        self._checkpoint()
        if self._descriptor is None:
            self._record_violation(
                MaterializerFailureCode.INPUT_IO,
                f"bounded {self._label} destination is closed",
            )
        if not isinstance(payload, (bytes, bytearray, memoryview)):
            self._record_violation(
                self._violation_code,
                f"bounded {self._label} writes require bytes",
            )
        try:
            view = memoryview(payload).cast("B")
        except (TypeError, ValueError) as exc:
            self._record_violation(
                self._violation_code,
                f"bounded {self._label} write is not a contiguous byte buffer: {exc}",
            )
        payload_size = len(view)
        if (
            self._written + payload_size > self._maximum_size
            or self._written + payload_size > self._expected_size
        ):
            self._record_violation(
                self._violation_code,
                f"bounded {self._label} write exceeds its exact byte ceiling",
            )
        offset = 0
        while offset < payload_size:
            self._checkpoint()
            try:
                written = os.write(
                    self._descriptor,
                    view[offset : offset + _COPY_CHUNK_BYTES],
                )
            except OSError as exc:
                self._record_violation(
                    MaterializerFailureCode.INPUT_IO,
                    f"bounded {self._label} write failed: {exc}",
                )
            if written <= 0:
                self._record_violation(
                    MaterializerFailureCode.INPUT_IO,
                    f"bounded {self._label} write made no progress",
                )
            offset += written
            self._written += written
            self._checkpoint()
        return payload_size

    def finish(self) -> None:
        if self._violation is not None:
            raise self._violation
        if self._descriptor is None:
            _fail(
                MaterializerFailureCode.INPUT_IO,
                f"bounded {self._label} destination is closed",
            )
        self._checkpoint()
        if self._written != self._expected_size:
            self._record_violation(
                self._violation_code,
                f"bounded {self._label} write did not match its exact byte count",
            )
        try:
            os.fsync(self._descriptor)
            metadata = os.fstat(self._descriptor)
            os.close(self._descriptor)
            self._descriptor = None
        except OSError as exc:
            self._record_violation(
                MaterializerFailureCode.INPUT_IO,
                f"cannot seal bounded {self._label} destination: {exc}",
            )
        if not stat.S_ISREG(metadata.st_mode) or metadata.st_size != self._written:
            self._record_violation(
                MaterializerFailureCode.INPUT_IO,
                f"bounded {self._label} destination did not retain its bytes",
            )
        self._checkpoint()

    def _close_and_unlink(self) -> None:
        if self._descriptor is not None:
            try:
                os.close(self._descriptor)
            except OSError:
                pass
            self._descriptor = None
        try:
            os.unlink(self._filename, dir_fd=self._directory_descriptor)
        except FileNotFoundError:
            pass
        except OSError:
            pass

    def abort(self) -> None:
        self._close_and_unlink()


@contextmanager
def _bounded_workspace_destination(
    workspace: _PrivateWorkspace,
    *,
    directory: str,
    filename: str,
    expected_size: int,
    maximum_size: int,
    deadline: RefineDeadline,
    violation_code: MaterializerFailureCode,
    label: str,
) -> Iterator[RefineBoundedWriter]:
    workspace.validate_path_identity()
    directory_descriptor = workspace.open_directory(directory)
    writer: _BoundedFileWriter | None = None
    primary_error = False
    try:
        writer = _BoundedFileWriter(
            directory_descriptor=directory_descriptor,
            filename=filename,
            expected_size=expected_size,
            maximum_size=maximum_size,
            deadline=deadline,
            violation_code=violation_code,
            label=label,
        )
        try:
            yield writer
        except BaseException:
            primary_error = True
            writer.abort()
            raise
        try:
            writer.finish()
        except BaseException:
            primary_error = True
            writer.abort()
            raise
        workspace.validate_path_identity()
    finally:
        if writer is not None and primary_error:
            writer.abort()
        try:
            os.close(directory_descriptor)
        except OSError as exc:
            if not primary_error:
                _fail(
                    MaterializerFailureCode.INPUT_IO,
                    f"cannot close bounded {label} directory: {exc}",
                )


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
    room_id: str,
    expected: str,
) -> str:
    """Owner-anchor and exact-layout one Storage READ key.

    ``room_id``, not the scan: ``assert_owner_prefix`` compares segment ``[2]``
    against ``room_scans.room_id`` (its docstring, its error text, and all five
    P1 call sites agree), and the exact-match below is against a template that
    formats the same identifier.  The two checks are deliberately redundant --
    the prefix assert is the RLS-equivalent, the equality is the layout contract
    -- and they must therefore be fed the SAME identifier or one of them is
    always vacuous.
    """

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
        assert_owner_prefix(value, user_id, room_id)
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
    room_id: str,
) -> RefineSourceArtifact:
    if not isinstance(value, RefineSourceArtifact):
        _fail(
            MaterializerFailureCode.INPUT_INVALID,
            "source artifact has the wrong contract type",
        )
    _safe_owner_key(
        value.object_key,
        user_id=user_id,
        room_id=room_id,
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
    # ``scan_id`` is validated but NOT used to build or check a read key.  It is
    # the publication identity (``room_scans.id``); a malformed one has to fail
    # here rather than three stages later at the publisher.
    _stable_identifier(request.scan_id, "scan_id")
    room_id = _stable_identifier(request.room_id, "room_id")
    _stable_identifier(request.task_id, "task_id")
    _stable_identifier(request.lease_id, "lease_id")
    if request.capture_session_id is not None:
        _stable_identifier(request.capture_session_id, "capture_session_id")
    if (
        not isinstance(request.workspace_parent, Path)
        or not request.workspace_parent.is_absolute()
    ):
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
            expected_key=template.format(user_id=user_id, room_id=room_id),
            user_id=user_id,
            room_id=room_id,
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
) -> _PrivateWorkspace:
    _require_deadline(deadline)
    parent = request.workspace_parent
    parent_descriptor = _open_absolute_directory(parent)
    try:
        parent_stat = os.fstat(parent_descriptor)
    except OSError as exc:
        os.close(parent_descriptor)
        _fail(
            MaterializerFailureCode.INPUT_IO, f"cannot inspect workspace parent: {exc}"
        )
    if parent_stat.st_uid != os.geteuid() or parent_stat.st_mode & 0o022:
        os.close(parent_descriptor)
        _fail(
            MaterializerFailureCode.INPUT_INVALID,
            "workspace parent must be service-owned and not group/world writable",
        )

    workspace_name = _workspace_name(request.task_id, request.lease_id)
    workspace = parent / workspace_name
    try:
        os.mkdir(workspace_name, 0o700, dir_fd=parent_descriptor)
    except FileExistsError:
        os.close(parent_descriptor)
        _fail(
            MaterializerFailureCode.INPUT_IO,
            "task/lease workspace already exists",
        )
    except OSError as exc:
        os.close(parent_descriptor)
        _fail(
            MaterializerFailureCode.INPUT_IO,
            f"cannot create private task/lease workspace: {exc}",
        )

    workspace_descriptor: int | None = None
    anchor: _PrivateWorkspace | None = None
    try:
        workspace_descriptor = os.open(
            workspace_name,
            _directory_open_flags(),
            dir_fd=parent_descriptor,
        )
        os.fchmod(workspace_descriptor, 0o700)
        workspace_stat = os.fstat(workspace_descriptor)
        anchored_stat = os.stat(
            workspace_name,
            dir_fd=parent_descriptor,
            follow_symlinks=False,
        )
        if (
            not stat.S_ISDIR(workspace_stat.st_mode)
            or workspace_stat.st_uid != os.geteuid()
            or stat.S_IMODE(workspace_stat.st_mode) != 0o700
            or (workspace_stat.st_dev, workspace_stat.st_ino)
            != (anchored_stat.st_dev, anchored_stat.st_ino)
        ):
            _fail(
                MaterializerFailureCode.INPUT_INVALID,
                "task/lease workspace descriptor is untrusted",
            )
        anchor = _PrivateWorkspace(
            path=workspace,
            name=workspace_name,
            parent_descriptor=parent_descriptor,
            workspace_descriptor=workspace_descriptor,
        )
        for child in ("incoming", "inputs", "extracted", "images", "raster-incoming"):
            os.mkdir(child, 0o700, dir_fd=workspace_descriptor)
            child_descriptor = os.open(
                child,
                _directory_open_flags(),
                dir_fd=workspace_descriptor,
            )
            try:
                os.fchmod(child_descriptor, 0o700)
                child_stat = os.fstat(child_descriptor)
            finally:
                os.close(child_descriptor)
            if (
                not stat.S_ISDIR(child_stat.st_mode)
                or child_stat.st_uid != os.geteuid()
                or stat.S_IMODE(child_stat.st_mode) != 0o700
            ):
                _fail(
                    MaterializerFailureCode.INPUT_INVALID,
                    f"task/lease workspace child {child!r} is untrusted",
                )
        anchor.validate_path_identity()
    except RefineMaterializerError as primary_error:
        if anchor is not None:
            try:
                anchor.cleanup()
            except RefineMaterializerError as cleanup_error:
                raise cleanup_error from primary_error
        else:
            try:
                shutil.rmtree(workspace_name, dir_fd=parent_descriptor)
            except OSError as cleanup_error:
                if workspace_descriptor is not None:
                    os.close(workspace_descriptor)
                os.close(parent_descriptor)
                raise RefineMaterializerError(
                    MaterializerFailureCode.INPUT_IO,
                    f"cannot clean partial task/lease workspace: {cleanup_error}",
                ) from primary_error
            if workspace_descriptor is not None:
                os.close(workspace_descriptor)
            os.close(parent_descriptor)
        raise
    except OSError as exc:
        primary_error = RefineMaterializerError(
            MaterializerFailureCode.INPUT_IO,
            f"cannot create private task/lease workspace: {exc}",
        )
        if anchor is not None:
            try:
                anchor.cleanup()
            except RefineMaterializerError as cleanup_error:
                raise cleanup_error from primary_error
        else:
            try:
                shutil.rmtree(workspace_name, dir_fd=parent_descriptor)
            except OSError as cleanup_error:
                if workspace_descriptor is not None:
                    os.close(workspace_descriptor)
                os.close(parent_descriptor)
                raise RefineMaterializerError(
                    MaterializerFailureCode.INPUT_IO,
                    f"cannot clean partial task/lease workspace: {cleanup_error}",
                ) from primary_error
            if workspace_descriptor is not None:
                os.close(workspace_descriptor)
            os.close(parent_descriptor)
        raise primary_error from exc
    _require_deadline(deadline)
    if anchor is None:  # pragma: no cover - every successful path assigns it
        _fail(MaterializerFailureCode.INPUT_IO, "private workspace was not created")
    return anchor


def _stat_identity(metadata: os.stat_result) -> tuple[int, int, int, int, int, int]:
    return (
        metadata.st_dev,
        metadata.st_ino,
        metadata.st_mode,
        metadata.st_size,
        metadata.st_mtime_ns,
        metadata.st_ctime_ns,
    )


def _workspace_file_parts(
    relative_path: PurePosixPath,
) -> tuple[tuple[str, ...], str]:
    if (
        not isinstance(relative_path, PurePosixPath)
        or relative_path.is_absolute()
        or len(relative_path.parts) < 2
        or any(
            part in ("", ".", "..") or "/" in part or "\x00" in part
            for part in relative_path.parts
        )
    ):
        _fail(
            MaterializerFailureCode.INPUT_INVALID,
            "private workspace file path is unsafe",
        )
    return tuple(relative_path.parts[:-1]), relative_path.parts[-1]


def _safe_source_descriptor(
    workspace: _PrivateWorkspace,
    relative_path: PurePosixPath,
) -> tuple[int, os.stat_result]:
    workspace.validate_path_identity()
    directory_parts, filename = _workspace_file_parts(relative_path)
    directory_descriptor = workspace.open_directory(*directory_parts)
    descriptor: int | None = None
    pending_error = False
    try:
        try:
            path_snapshot = os.stat(
                filename,
                dir_fd=directory_descriptor,
                follow_symlinks=False,
            )
        except OSError as exc:
            _fail(
                MaterializerFailureCode.INPUT_IO,
                f"cannot inspect private workspace file: {exc}",
            )
        if stat.S_ISLNK(path_snapshot.st_mode) or not stat.S_ISREG(
            path_snapshot.st_mode
        ):
            _fail(
                MaterializerFailureCode.INPUT_INVALID,
                "private workspace source must be a regular non-symlink file",
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
            descriptor = os.open(
                filename,
                flags,
                dir_fd=directory_descriptor,
            )
        except OSError as exc:
            if exc.errno == errno.ELOOP:
                _fail(
                    MaterializerFailureCode.INPUT_INVALID,
                    "private workspace source changed to a symlink while opening",
                )
            _fail(
                MaterializerFailureCode.INPUT_IO,
                f"cannot open private workspace file: {exc}",
            )
        try:
            opened = os.fstat(descriptor)
        except OSError as exc:
            _fail(
                MaterializerFailureCode.INPUT_IO,
                f"cannot inspect private workspace descriptor: {exc}",
            )
        if not stat.S_ISREG(opened.st_mode) or (
            opened.st_dev,
            opened.st_ino,
        ) != (
            path_snapshot.st_dev,
            path_snapshot.st_ino,
        ):
            _fail(
                MaterializerFailureCode.INPUT_INVALID,
                "private workspace source changed identity while opening",
            )
    except BaseException:
        pending_error = True
        raise
    finally:
        try:
            os.close(directory_descriptor)
        except OSError as exc:
            if not pending_error:
                if descriptor is not None:
                    os.close(descriptor)
                _fail(
                    MaterializerFailureCode.INPUT_IO,
                    f"cannot close private workspace directory: {exc}",
                )
        if pending_error and descriptor is not None:
            try:
                os.close(descriptor)
            except OSError:
                pass
    return descriptor, opened


def _unlink_workspace_file(
    workspace: _PrivateWorkspace,
    relative_path: PurePosixPath,
) -> None:
    workspace.validate_path_identity()
    directory_parts, filename = _workspace_file_parts(relative_path)
    directory_descriptor = workspace.open_directory(*directory_parts)
    primary_error = False
    try:
        os.unlink(filename, dir_fd=directory_descriptor)
    except OSError as exc:
        primary_error = True
        _fail(
            MaterializerFailureCode.INPUT_IO,
            f"cannot remove private workspace file: {exc}",
        )
    finally:
        try:
            os.close(directory_descriptor)
        except OSError as exc:
            if not primary_error:
                _fail(
                    MaterializerFailureCode.INPUT_IO,
                    f"cannot close private workspace directory: {exc}",
                )


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
            _fail(
                MaterializerFailureCode.INPUT_IO,
                f"cannot write private snapshot: {exc}",
            )
        if written <= 0:
            _fail(
                MaterializerFailureCode.INPUT_IO,
                "private snapshot write made no progress",
            )
        offset += written


def _freeze_untrusted_file(
    workspace: _PrivateWorkspace,
    source: PurePosixPath,
    destination: PurePosixPath,
    *,
    maximum_size: int,
    deadline: RefineDeadline,
    expected_sha256: str | None = None,
    expected_size: int | None = None,
) -> _FrozenFile:
    """Copy and hash one untrusted generation through the same source descriptor."""

    _require_deadline(deadline)
    descriptor, before = _safe_source_descriptor(workspace, source)
    output_descriptor: int | None = None
    output_directory_descriptor: int | None = None
    destination_name = ""
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
        destination_directories, destination_name = _workspace_file_parts(destination)
        output_directory_descriptor = workspace.open_directory(*destination_directories)
        output_descriptor = os.open(
            destination_name,
            flags,
            0o600,
            dir_fd=output_directory_descriptor,
        )
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
        if (
            pending_error
            and destination_created
            and output_directory_descriptor is not None
        ):
            try:
                os.unlink(
                    destination_name,
                    dir_fd=output_directory_descriptor,
                )
            except OSError:
                pass
        if output_directory_descriptor is not None:
            try:
                os.close(output_directory_descriptor)
            except OSError as exc:
                close_error = close_error or exc
        if close_error is not None and not pending_error:
            _fail(
                MaterializerFailureCode.INPUT_IO,
                f"cannot close verified descriptor: {close_error}",
            )
    _require_deadline(deadline)
    return _FrozenFile(workspace, destination, actual_sha256, copied)


def _read_frozen_file(
    frozen: _FrozenFile,
    *,
    deadline: RefineDeadline,
) -> bytes:
    descriptor, before = _safe_source_descriptor(
        frozen.workspace,
        frozen.relative_path,
    )
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
    descriptor, before = _safe_source_descriptor(
        frozen.workspace,
        frozen.relative_path,
    )
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
                _fail(
                    MaterializerFailureCode.INPUT_IO,
                    f"cannot close private file: {exc}",
                )
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
    except MemoryError:
        _fail(
            MaterializerFailureCode.INPUT_IO,
            f"{label} exhausted memory while parsing",
        )
    except RecursionError:
        _fail(
            MaterializerFailureCode.INPUT_INVALID,
            f"{label} exceeds the supported JSON nesting depth",
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
) -> str:
    """Check the manifest against the request; return its observed ``scanId``.

    WHAT CHANGED AND WHY IT IS NOT A WEAKENING.  This function used to require
    ``document["scanId"] == request.scan_id``.  No server-side identifier has
    ever held the manifest's ``scanId``: the iOS instrument mints it as
    ``RoomPlanScanSession.scanSessionId = UUID()`` when the capture session
    OPENS, minutes before ``room_scans.id`` exists (that row is reserved at
    upload, ``SupabaseSiteScanService.reservation``), and no ``ADD COLUMN`` in
    any migration persists it.  The equality was therefore not a check that
    could fail on a doctored bundle and pass on an honest one -- it was a check
    that could only fail, which is what I104 measured on the real capture
    (``da3af6b7…`` at the key, ``e3ea64a8…`` in the manifest).  R122 requires a
    bundle "as the app actually writes it" to be satisfiable.

    Manifest identity is still anchored, twice, and neither anchor moved:

    1. THE OBJECT KEY.  The manifest was fetched from
       ``manifests/{user_id}/{room_id}/manifest.json`` -- owner-asserted by
       ``_safe_owner_key`` against the row's ``user_id`` and ``room_id`` before
       any I/O, and exact-matched against the B-18 template.  A manifest from
       another owner or another room cannot reach this function.
    2. THE EXPECTED DIGEST.  ``RefineMaterializer.materialize`` freezes the
       acquired bytes through ``_freeze_untrusted_file(..., expected_sha256=
       source.sha256)``, which re-hashes the private copy and fails
       INPUT_INVALID on any mismatch.  ``payload`` below is read back out of
       that frozen file.  So this is not "some JSON the network returned": it is
       the exact bytes the caller's ledger named.

    What the ``scanId`` still has to be is a well-formed stable identifier by
    the SAME rule the request's own identifiers pass -- an empty string, a null,
    a nested object or a path-shaped value is still a rejected manifest.  And
    when the caller supplies ``capture_session_id`` it is still required to
    match exactly, so a caller that does know the value keeps a real guard
    rather than being told the check no longer exists.

    The REJECTED alternative was to drop the key entirely from the schema check.
    That would have let a bundle with no session identity at all through, and
    the observed value is the only thing tying a published Refine run back to
    the device capture session that produced it.
    """

    document = _json_value(payload, "bundle manifest")
    if not isinstance(document, dict):
        _fail(
            MaterializerFailureCode.INPUT_INVALID, "bundle manifest must be an object"
        )
    if (
        type(document.get("schemaVersion")) is not int
        or document["schemaVersion"] != 3
        or type(document.get("bundleSpecVersion")) is not int
        or document["bundleSpecVersion"] != 1
        or document.get("checksumAlgorithm") != "sha256"
    ):
        _fail(
            MaterializerFailureCode.INPUT_INVALID,
            "bundle manifest identity/schema contract does not match the request",
        )
    capture_session_id = _stable_identifier(
        document.get("scanId"),
        "bundle manifest scanId",
    )
    if (
        request.capture_session_id is not None
        and capture_session_id != request.capture_session_id
    ):
        _fail(
            MaterializerFailureCode.INPUT_INVALID,
            "bundle manifest scanId does not match the requested capture session",
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
    return capture_session_id


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
        _fail(
            MaterializerFailureCode.INPUT_INVALID, f"keyframe index is not UTF-8: {exc}"
        )
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
            if (
                not has_depth
                or PurePosixPath(depth_path).stem != PurePosixPath(heic_path).stem
            ):
                _fail(
                    MaterializerFailureCode.INPUT_INVALID,
                    "keyframe depth member must share its HEIC stem",
                )
        if (
            heic_path in paths
            or frame.image_name in names
            or (depth_path is not None and depth_path in paths)
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
        _fail(
            MaterializerFailureCode.INPUT_INVALID, "keyframe summary must be an object"
        )
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
    descriptor, before = _safe_source_descriptor(
        frozen.workspace,
        frozen.relative_path,
    )
    try:
        handle = os.fdopen(descriptor, "rb", closefd=True)
    except BaseException as exc:
        try:
            os.close(descriptor)
        except OSError:
            pass
        if isinstance(exc, OSError):
            _fail(
                MaterializerFailureCode.INPUT_IO,
                f"cannot wrap private file descriptor: {exc}",
            )
        raise
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
    destination: PurePosixPath,
    deadline: RefineDeadline,
) -> dict[str, _FrozenFile]:
    expected = {member.name: member for member in members}
    extracted: dict[str, _FrozenFile] = {}
    workspace = archive.workspace
    if (
        destination.is_absolute()
        or not destination.parts
        or any(part in ("", ".", "..") for part in destination.parts)
    ):
        _fail(
            MaterializerFailureCode.INPUT_INVALID,
            "private extraction directory is unsafe",
        )
    destination_descriptor = workspace.open_directory(*destination.parts)
    keyframes_descriptor: int | None = None
    primary_error = False
    try:
        try:
            os.mkdir("keyframes", 0o700, dir_fd=destination_descriptor)
            keyframes_descriptor = os.open(
                "keyframes",
                _directory_open_flags(),
                dir_fd=destination_descriptor,
            )
            os.fchmod(keyframes_descriptor, 0o700)
            keyframes_stat = os.fstat(keyframes_descriptor)
        except OSError as exc:
            _fail(
                MaterializerFailureCode.INPUT_IO,
                f"cannot create private keyframe extraction directory: {exc}",
            )
        if (
            not stat.S_ISDIR(keyframes_stat.st_mode)
            or keyframes_stat.st_uid != os.geteuid()
            or stat.S_IMODE(keyframes_stat.st_mode) != 0o700
        ):
            _fail(
                MaterializerFailureCode.INPUT_INVALID,
                "private keyframe extraction directory is untrusted",
            )
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
                    member_path = PurePosixPath(member.name)
                    if (
                        len(member_path.parts) != 2
                        or member_path.parts[0] != "keyframes"
                    ):
                        _fail(
                            MaterializerFailureCode.INPUT_INVALID,
                            "keyframes archive changed to an unsafe member path",
                        )
                    target_name = member_path.parts[1]
                    flags = (
                        os.O_WRONLY
                        | os.O_CREAT
                        | os.O_EXCL
                        | getattr(os, "O_CLOEXEC", 0)
                        | getattr(os, "O_NOFOLLOW", 0)
                    )
                    try:
                        output = os.open(
                            target_name,
                            flags,
                            0o600,
                            dir_fd=keyframes_descriptor,
                        )
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
                        if (
                            not stat.S_ISREG(output_stat.st_mode)
                            or output_stat.st_size != written
                        ):
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
                    extracted[member.name] = _FrozenFile(
                        workspace=workspace,
                        relative_path=destination / member_path,
                        sha256=digest.hexdigest(),
                        size_bytes=written,
                    )
        workspace.validate_path_identity()
    except RefineMaterializerError:
        primary_error = True
        raise
    except OSError as exc:
        primary_error = True
        _fail(
            MaterializerFailureCode.INPUT_IO,
            f"keyframes archive extraction I/O failed: {exc}",
        )
    except (tarfile.TarError, EOFError) as exc:
        primary_error = True
        _fail(
            MaterializerFailureCode.INPUT_INVALID,
            f"keyframes archive extraction failed: {exc}",
        )
    finally:
        close_error: OSError | None = None
        for descriptor in (keyframes_descriptor, destination_descriptor):
            if descriptor is None:
                continue
            try:
                os.close(descriptor)
            except OSError as exc:
                close_error = close_error or exc
        if close_error is not None and not primary_error:
            _fail(
                MaterializerFailureCode.INPUT_IO,
                f"cannot close private extraction directory: {close_error}",
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
    materializer_id = value.materializer_id
    if (
        type(materializer_id) is not str
        or not materializer_id
        or not materializer_id.isprintable()
        or any(ord(character) < 0x21 for character in materializer_id)
        or len(materializer_id.encode("utf-8")) > _MAX_MATERIALIZER_ID_BYTES
    ):
        _fail(
            MaterializerFailureCode.RASTER_UNQUALIFIED,
            "raster adapter materializer id must be a bounded visible string",
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


def _canonical_ppm_size(width: int, height: int) -> int:
    if type(width) is not int or width <= 0 or type(height) is not int or height <= 0:
        _fail(
            MaterializerFailureCode.INPUT_INVALID,
            "indexed raster dimensions must be positive integers",
        )
    header = f"P6\n{width} {height}\n255\n".encode("ascii")
    return len(header) + width * height * 3


def _preflight_raster_sizes(
    frames: tuple[_IndexedFrame, ...],
    *,
    limits: RefineMaterializationLimits,
) -> tuple[int, ...]:
    """Reject impossible per-frame or aggregate raster allocation before decode."""

    sizes: list[int] = []
    materialized_bytes = 0
    for indexed in frames:
        width = indexed.frame.intrinsics.image_width
        height = indexed.frame.intrinsics.image_height
        size = _canonical_ppm_size(width, height)
        if size > limits.max_raster_bytes:
            _fail(
                MaterializerFailureCode.INPUT_INVALID,
                "indexed raster dimensions exceed the per-frame byte ceiling",
            )
        peak_bytes = materialized_bytes + 2 * size
        if peak_bytes > limits.max_raster_workspace_bytes:
            _fail(
                MaterializerFailureCode.INPUT_INVALID,
                "indexed rasters exceed the aggregate workspace byte ceiling",
            )
        materialized_bytes += size
        sizes.append(size)
    return tuple(sizes)


def _validate_canonical_ppm(
    frozen: _FrozenFile,
    *,
    width: int,
    height: int,
    deadline: RefineDeadline,
) -> None:
    header = f"P6\n{width} {height}\n255\n".encode("ascii")
    expected_size = _canonical_ppm_size(width, height)
    if frozen.size_bytes != expected_size:
        _fail(
            MaterializerFailureCode.RASTER_UNQUALIFIED,
            "materialized PPM byte count does not match its indexed dimensions",
        )
    descriptor, before = _safe_source_descriptor(
        frozen.workspace,
        frozen.relative_path,
    )
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
        workspace_anchor: _PrivateWorkspace | None = None
        try:
            workspace_anchor = _create_private_workspace(request, deadline=deadline)
            workspace = workspace_anchor.path
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
                local_name = local_names[kind]
                incoming = PurePosixPath("incoming") / local_name
                private_input = PurePosixPath("inputs") / local_name
                try:
                    with _bounded_workspace_destination(
                        workspace_anchor,
                        directory="incoming",
                        filename=local_name,
                        expected_size=source.size_bytes,
                        maximum_size=maxima[kind],
                        deadline=deadline,
                        violation_code=MaterializerFailureCode.INPUT_INVALID,
                        label=f"{kind} acquisition",
                    ) as destination:
                        self._acquirer.acquire(
                            source=source,
                            user_id=request.user_id,
                            # The READ identity, not the publication one: the
                            # acquirer re-checks the same ``[1]``/``[2]`` pair
                            # the storage RLS would have checked.
                            room_id=request.room_id,
                            destination=destination,
                            deadline=deadline,
                        )
                except RefineMaterializerError:
                    raise
                except AdapterError as exc:
                    _fail_acquisition(exc)
                except Exception as exc:  # noqa: BLE001 - normalize injected acquisition
                    _fail(
                        MaterializerFailureCode.INPUT_IO,
                        f"input acquirer raised {type(exc).__name__}",
                    )
                _require_deadline(deadline)
                frozen = _freeze_untrusted_file(
                    workspace_anchor,
                    incoming,
                    private_input,
                    maximum_size=maxima[kind],
                    expected_sha256=source.sha256,
                    expected_size=source.size_bytes,
                    deadline=deadline,
                )
                _unlink_workspace_file(workspace_anchor, incoming)
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
            capture_session_id = _validate_manifest(manifest_payload, request=request)
            index_payload = _read_frozen_file(
                frozen_by_kind["keyframeIndex"],
                deadline=deadline,
            )
            frames = _parse_index(index_payload, limits=self._limits)
            raster_sizes = _preflight_raster_sizes(frames, limits=self._limits)
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
                destination=PurePosixPath("extracted"),
                deadline=deadline,
            )

            materialized_frames: list[MaterializedRefineFrame] = []
            for engine_ordinal, indexed in enumerate(frames):
                _require_deadline(deadline)
                source = extracted[indexed.frame.heic_path]
                source_frozen = source
                engine_name = f"frame_{engine_ordinal:06d}.ppm"
                incoming_raster = PurePosixPath("raster-incoming") / engine_name
                private_raster = PurePosixPath("images") / engine_name
                width = indexed.frame.intrinsics.image_width
                height = indexed.frame.intrinsics.image_height
                try:
                    with _open_frozen_binary(
                        source,
                        deadline=deadline,
                    ) as (source_handle, _source_snapshot):
                        with _bounded_workspace_destination(
                            workspace_anchor,
                            directory="raster-incoming",
                            filename=engine_name,
                            expected_size=raster_sizes[engine_ordinal],
                            maximum_size=self._limits.max_raster_bytes,
                            deadline=deadline,
                            violation_code=MaterializerFailureCode.RASTER_UNQUALIFIED,
                            label=f"raster {engine_name}",
                        ) as destination:
                            evidence_value = self._raster_materializer.materialize(
                                source=_DeadlineFile(source_handle, deadline),
                                source_name=indexed.frame.heic_path,
                                destination=destination,
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
                    workspace_anchor,
                    incoming_raster,
                    private_raster,
                    maximum_size=self._limits.max_raster_bytes,
                    deadline=deadline,
                )
                _unlink_workspace_file(workspace_anchor, incoming_raster)
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
                if workspace_anchor.workspace_descriptor is None:
                    _fail(
                        MaterializerFailureCode.INPUT_IO,
                        "private workspace descriptor is unavailable",
                    )
                os.rmdir("incoming", dir_fd=workspace_anchor.workspace_descriptor)
                os.rmdir(
                    "raster-incoming",
                    dir_fd=workspace_anchor.workspace_descriptor,
                )
            except OSError as exc:
                _fail(
                    MaterializerFailureCode.INPUT_IO,
                    f"cannot retire untrusted workspace lanes: {exc}",
                )
            workspace_anchor.validate_path_identity()
            _require_deadline(deadline)
            result = RefineMaterialization(
                task_id=request.task_id,
                lease_id=request.lease_id,
                workspace_root=workspace,
                inputs=tuple(verified_inputs),
                frames=tuple(materialized_frames),
                capture_session_id=capture_session_id,
                _workspace_anchor=workspace_anchor,
            )
            workspace_anchor = None
            return result
        except BaseException as primary_error:
            if workspace_anchor is not None:
                try:
                    workspace_anchor.cleanup()
                except RefineMaterializerError as cleanup_error:
                    raise cleanup_error from primary_error
            raise
