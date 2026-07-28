"""Disabled concrete Field/Core Image raster materializer.

This adapter implements one ImageIO/libheif raster profile per instance.  The
profile is **declared** at construction, not compiled in: it is carried down to
the helper on argv, echoed back by the helper, and compared against every
dimension the helper reports.  The adapter copies an already-pinned source
descriptor into an adapter-owned private directory, runs the byte-identical
packaged helper through descriptor-pinned ``/proc/self/fd`` aliases, validates
and unlinks the helper output, and only then streams canonical PPM bytes
through the caller's bounded destination.

R118 moved this file off two pinned 360x640 constants.  360x640 was the debug
fixture's size (``FieldRasterFixtureExporter.swift``), never production's:
Field writes full-resolution HEIC at whatever format ARKit selected for that
device, so the pinned adapter refused a real capture at its first frame.  The
replacement is a parameter, not a different constant — the capture resolution
is a property of the device and session, not of this code.
The declaration is bounded — see ``_MAX_PROFILE_DIMENSION`` and
``_MAX_PROFILE_PPM_BYTES`` — because a merely variable profile is an
allocation hazard: a declared 60000x60000 implies a 10.8 GB PPM.

**Nothing here is qualified.**  Editing ``field_raster_libheif.c`` changed its
SHA-256, which by construction invalidated the I92 physical-device receipt that
covered the old helper.  No capture profile has a receipt: qualifying one needs
a physical fixture emitted at that device's capture resolution plus a run on
the qualified host, and neither is an agent's step.  Until such a receipt
exists this module stays packaged and unused — importing it does not register
``scan_pipeline.refine`` or change the worker stage set.
"""

from __future__ import annotations

import hashlib
import json
import math
import os
import re
import secrets
import selectors
import signal
import stat
import subprocess
import sys
import time
from dataclasses import dataclass
from pathlib import Path
from typing import NoReturn

from .field_raster_qualification import (
    LIBHEIF_HELPER_SCHEMA,
    RasterQualificationError,
    _parse_helper_metadata,
)
from .refine_adapter import AdapterError, RefineDeadline
from .refine_materializer import (
    FieldRasterMaterialization,
    MaterializerFailureCode,
    RefineBoundedWriter,
    RefineMaterializationLimits,
    RefineMaterializerError,
    RefinePinnedSource,
)

# SHA-256 of the packaged `field_raster_libheif.c`.  The name is kept because
# R118 names it, but read it as PINNED, not as QUALIFIED: it moved from
# 4840e0e6...ee9c3 (the source I92 physically qualified) when the helper
# protocol started carrying dimensions on argv, and the I92 receipt covers the
# old bytes only.  This constant, install.sh's `expected_source_sha256`, and
# install-path-guard.py's FIELD_RASTER_HELPER_SOURCE_SHA256 must move together
# or the installer refuses to build the helper.  Recompute with
# `sha256sum src/patina_scan_worker/field_raster_libheif.c`.
QUALIFIED_HELPER_SOURCE_SHA256 = (
    "3b184937b755dc4acca4347ea6dba43dbeb111f090a91cd340e65d214937c626"
)
# The installed filename still says v2 while the protocol is v3, and that is a
# deliberate, narrow choice rather than an oversight.  This path is a DEPLOYMENT
# SLOT, not the protocol's identity: install-path-guard.py names it in the
# release's required-executable list, so renaming it would make a new guard
# refuse an already-installed older release — an operator-visible consequence
# on a host this work package may not touch.  Nothing is lost by holding it
# stable, because the drift it might otherwise hide is already caught: the
# manifest binds `sourceSha256`, and `_open_helper` refuses any release whose
# manifest does not carry exactly QUALIFIED_HELPER_SOURCE_SHA256 below.  A v2
# binary in a v3 tree therefore fails closed before it is ever executed.
# Renaming the slot belongs with the re-qualification that installs the next
# release, not here.
HELPER_RELATIVE_PATH = Path("libexec/patina/field-raster-libheif-helper-v2")
HELPER_MANIFEST_NAME = HELPER_RELATIVE_PATH.name + ".manifest.json"
HELPER_MANIFEST_SCHEMA = "patina-field-raster-helper-manifest-v1"
MATERIALIZER_ID_PREFIX = "patina-field-raster-libheif-helper-v2"

_MAX_HEIC_BYTES = 32 * 1024 * 1024
_MAX_HELPER_BYTES = 16 * 1024 * 1024
_COPY_CHUNK_BYTES = 1024 * 1024
_PIPE_READ_BYTES = 16 * 1024
_STDOUT_LIMIT = 64 * 1024
_STDERR_LIMIT = 64 * 1024
_TERM_GRACE_SECONDS = 0.10
_KILL_REAP_SECONDS = 1.0
_GROUP_GONE_SECONDS = 1.0
_SAFE_NAME = re.compile(r"[A-Za-z0-9][A-Za-z0-9._/-]{0,255}")
_SAFE_VERSION = re.compile(r"[0-9A-Za-z.+~_-]{1,128}")
_MAX_MATERIALIZER_ID_BYTES = 128
_HELPER_COMPILE_FLAGS = (
    "-std=c11",
    "-O2",
    "-Wall",
    "-Wextra",
    "-Werror",
    "-D_FORTIFY_SOURCE=3",
    "-fstack-protector-strong",
    "-fPIE",
    "-pie",
    "-Wl,-z,relro,-z,now",
    "-x",
    "c",
)

# Per-axis ceiling on a declared profile.  4096 is not a new number: it is the
# MAX_DIMENSION the packaged helper already enforces on every decoded plane and
# the bound `_metadata_positive_int` already applies to every dimension the
# helper reports.  Declaring inside it means a declaration can never describe a
# raster this pipeline's own decode path would refuse.  It clears the capture
# profile observed on scan 95266be1 on both axes with better than 2x headroom,
# and every ARKit format that device reports.
_MAX_PROFILE_DIMENSION = 4096

# Ceiling on the canonical PPM a declared profile may imply.  Read live off the
# enclosing materializer's per-frame limit rather than restated, so the two
# cannot drift: `_preflight_raster_sizes` refuses any indexed frame whose P6
# size exceeds `max_raster_bytes` before a decode is attempted, and the frozen
# child refuses to pin a file above the identical
# NATIVE_CHILD_MAX_PINNED_FILE_BYTES.  A profile above this bound cannot cross
# either seam, so accepting one would only buy an allocation nothing
# downstream can use — which is the 10.8 GB failure mode R118 names.
_MAX_PROFILE_PPM_BYTES = RefineMaterializationLimits().max_raster_bytes


@dataclass(frozen=True)
class FieldRasterProfile:
    """One declared, bounded encoded raster size for the helper protocol.

    Constructed by program code, not parsed from untrusted input, so an invalid
    profile is a programming error: it raises at construction rather than
    deferring to a fail-closed adapter failure code at materialize time.
    """

    width: int
    height: int

    def __post_init__(self) -> None:
        for label, value in (("width", self.width), ("height", self.height)):
            if type(value) is not int:
                raise TypeError(f"raster profile {label} must be an int")
            if value < 1 or value > _MAX_PROFILE_DIMENSION:
                raise ValueError(
                    f"raster profile {label} {value} is outside "
                    f"[1, {_MAX_PROFILE_DIMENSION}]"
                )
        # Bound the product as well as each axis.  At a 4096 axis ceiling the
        # implied PPM peaks at 48 MiB, inside the byte ceiling, so this never
        # fires today; it is what keeps the byte guarantee true if the axis
        # ceiling is ever raised, and it names the real downstream limit.
        if self.ppm_size > _MAX_PROFILE_PPM_BYTES:
            raise ValueError(
                f"raster profile {self.label} implies {self.ppm_size} PPM bytes, "
                f"above the {_MAX_PROFILE_PPM_BYTES}-byte ceiling"
            )

    @property
    def label(self) -> str:
        return f"{self.width}x{self.height}"

    @property
    def ppm_header(self) -> bytes:
        return f"P6\n{self.width} {self.height}\n255\n".encode("ascii")

    @property
    def ppm_size(self) -> int:
        return len(self.ppm_header) + self.width * self.height * 3


# The encoded size of the reference DRAWING DESIGN — the 640x360 native fixture
# rotated — which is what I92 physically qualified.  It is named here because
# the reference design is a fixed artefact of this repository (the exporter
# still emits it, byte for byte, and the marker arithmetic is defined relative
# to it), not because it describes anything a device captures.
#
# There is deliberately NO capture-resolution constant in this module.  Capture
# resolution is not a property of any code here: `SharedARCaptureRig
# .makeConfiguration()` never assigns `ARConfiguration.videoFormat`, so ARKit
# picks a device- and semantics-dependent default and `FieldKeyframeRecorder`
# stamps whatever `frame.camera.imageResolution` reports per keyframe.  The
# 1440x1920 seen on scan 95266be1 is one device's observed pair, not a contract
# — writing it down as a constant is precisely the mistake R118 exists to
# correct.  Callers declare the profile they actually have.
REFERENCE_DESIGN_ENCODED_PROFILE = FieldRasterProfile(360, 640)


@dataclass(frozen=True)
class _HelperResult:
    stdout: bytes
    stderr: bytes


class _HelperFailure(RuntimeError):
    def __init__(self, message: str, *, timeout: bool = False) -> None:
        super().__init__(message)
        self.timeout = timeout


def _bounded_message(value: object, maximum_bytes: int = 4096) -> str:
    payload = str(value).encode("utf-8", errors="replace")[:maximum_bytes]
    return payload.decode("utf-8", errors="ignore")


def _fail(
    code: MaterializerFailureCode,
    message: object,
) -> NoReturn:
    raise RefineMaterializerError(code, _bounded_message(message))


def _remaining(deadline: RefineDeadline) -> float:
    if not isinstance(deadline, RefineDeadline):
        _fail(MaterializerFailureCode.DEADLINE, "deadline has the wrong contract")
    try:
        value = deadline.remaining_seconds()
    except RefineMaterializerError:
        raise
    except AdapterError as exc:
        _fail(MaterializerFailureCode.DEADLINE, exc)
    except Exception as exc:  # noqa: BLE001 - normalize injected deadlines
        _fail(
            MaterializerFailureCode.DEADLINE,
            f"cannot inspect raster deadline: {type(exc).__name__}",
        )
    if (
        isinstance(value, bool)
        or not isinstance(value, (int, float))
        or not math.isfinite(float(value))
        or float(value) <= 0
    ):
        _fail(MaterializerFailureCode.DEADLINE, "raster deadline is exhausted")
    return float(value)


def _directory_flags() -> int:
    nofollow = getattr(os, "O_NOFOLLOW", None)
    directory = getattr(os, "O_DIRECTORY", None)
    if nofollow is None or directory is None:
        _fail(
            MaterializerFailureCode.RASTER_UNQUALIFIED,
            "descriptor-pinned directories are unavailable",
        )
    return os.O_RDONLY | nofollow | directory | getattr(os, "O_CLOEXEC", 0)


def _open_absolute_directory(path: Path) -> int:
    if (
        not isinstance(path, Path)
        or not path.is_absolute()
        or any(part in ("", ".", "..") for part in path.parts[1:])
    ):
        _fail(
            MaterializerFailureCode.RASTER_UNQUALIFIED,
            "raster directory must be a canonical absolute Path",
        )
    try:
        descriptor = os.open(os.sep, _directory_flags())
    except OSError as exc:
        _fail(
            MaterializerFailureCode.RASTER_UNQUALIFIED,
            f"cannot pin filesystem root: {exc}",
        )
    try:
        for component in path.parts[1:]:
            child = os.open(component, _directory_flags(), dir_fd=descriptor)
            os.close(descriptor)
            descriptor = child
        return descriptor
    except BaseException:
        try:
            os.close(descriptor)
        except OSError:
            pass
        raise


def _trusted_directory(
    path: Path, *, service_owned: bool
) -> tuple[int, os.stat_result]:
    descriptor = _open_absolute_directory(path)
    try:
        metadata = os.fstat(descriptor)
    except OSError:
        os.close(descriptor)
        raise
    if (
        not stat.S_ISDIR(metadata.st_mode)
        or metadata.st_mode & 0o022
        or (service_owned and metadata.st_uid != os.geteuid())
    ):
        os.close(descriptor)
        label = "service-owned scratch" if service_owned else "trusted release"
        _fail(
            MaterializerFailureCode.RASTER_UNQUALIFIED,
            f"{label} directory has unsafe ownership or mode",
        )
    return descriptor, metadata


def _validate_string(value: object, label: str, suffix: str) -> str:
    if (
        type(value) is not str
        or _SAFE_NAME.fullmatch(value) is None
        or not value.endswith(suffix)
        or ".." in Path(value).parts
    ):
        _fail(
            MaterializerFailureCode.RASTER_UNQUALIFIED,
            f"{label} is outside the qualified naming contract",
        )
    return value


def _source_identity(metadata: os.stat_result) -> tuple[int, int, int, int, int, int]:
    return (
        metadata.st_dev,
        metadata.st_ino,
        metadata.st_mode,
        metadata.st_size,
        metadata.st_mtime_ns,
        metadata.st_ctime_ns,
    )


def _copy_pinned_source(
    source: RefinePinnedSource,
    destination_fd: int,
    *,
    deadline: RefineDeadline,
) -> None:
    held_fd: int | None = None
    close_error: OSError | None = None
    try:
        source_fd = source.fileno()
        if type(source_fd) is not int or source_fd < 0:
            raise ValueError("fileno() did not return an open integer descriptor")
        caller_stat = os.fstat(source_fd)
        held_fd = os.dup(source_fd)
        before = os.fstat(held_fd)
    except (AttributeError, OSError, ValueError) as exc:
        if held_fd is not None:
            try:
                os.close(held_fd)
            except OSError:
                pass
        _fail(
            MaterializerFailureCode.RASTER_UNQUALIFIED,
            f"cannot inspect pinned HEIC source: {exc}",
        )
    try:
        if (
            _source_identity(caller_stat) != _source_identity(before)
            or not stat.S_ISREG(before.st_mode)
            or before.st_size < 12
            or before.st_size > _MAX_HEIC_BYTES
        ):
            _fail(
                MaterializerFailureCode.RASTER_UNQUALIFIED,
                "pinned HEIC source is not a bounded regular descriptor",
            )
        copied = 0
        while copied < before.st_size:
            _remaining(deadline)
            try:
                chunk = os.pread(
                    held_fd,
                    min(_COPY_CHUNK_BYTES, before.st_size - copied),
                    copied,
                )
            except OSError as exc:
                _fail(
                    MaterializerFailureCode.RASTER_UNQUALIFIED,
                    f"cannot read pinned HEIC descriptor: {exc}",
                )
            if not chunk:
                _fail(
                    MaterializerFailureCode.RASTER_UNQUALIFIED,
                    "pinned HEIC descriptor ended before its advertised size",
                )
            copied += len(chunk)
            if copied > before.st_size:
                _fail(
                    MaterializerFailureCode.RASTER_UNQUALIFIED,
                    "pinned HEIC source exceeded its descriptor size",
                )
            offset = 0
            while offset < len(chunk):
                _remaining(deadline)
                try:
                    written = os.write(destination_fd, chunk[offset:])
                except OSError as exc:
                    _fail(
                        MaterializerFailureCode.RASTER_UNQUALIFIED,
                        f"cannot copy pinned HEIC source: {exc}",
                    )
                if written <= 0:
                    _fail(
                        MaterializerFailureCode.RASTER_UNQUALIFIED,
                        "pinned HEIC copy made no progress",
                    )
                offset += written
        try:
            after = os.fstat(held_fd)
            os.fsync(destination_fd)
            copied_stat = os.fstat(destination_fd)
        except OSError as exc:
            _fail(
                MaterializerFailureCode.RASTER_UNQUALIFIED,
                f"cannot seal pinned HEIC copy: {exc}",
            )
        if (
            _source_identity(before) != _source_identity(after)
            or copied != before.st_size
            or not stat.S_ISREG(copied_stat.st_mode)
            or copied_stat.st_size != copied
        ):
            _fail(
                MaterializerFailureCode.RASTER_UNQUALIFIED,
                "pinned HEIC source changed while copied",
            )
    finally:
        try:
            os.close(held_fd)
        except OSError as exc:
            close_error = exc
        if close_error is not None:
            _fail(
                MaterializerFailureCode.RASTER_UNQUALIFIED,
                f"pinned HEIC cleanup uncertainty: {close_error}",
            )


def _open_packaged_source(
    *,
    require_root_owner: bool = False,
) -> tuple[int, str]:
    path = Path(__file__).with_name("field_raster_libheif.c")
    flags = (
        os.O_RDONLY
        | getattr(os, "O_NONBLOCK", 0)
        | getattr(os, "O_CLOEXEC", 0)
        | getattr(os, "O_NOFOLLOW", 0)
    )
    descriptor: int | None = None
    try:
        descriptor = os.open(path, flags)
        metadata = os.fstat(descriptor)
    except OSError as exc:
        if descriptor is not None:
            try:
                os.close(descriptor)
            except OSError:
                pass
        _fail(
            MaterializerFailureCode.RASTER_UNQUALIFIED,
            f"cannot open packaged helper source: {exc}",
        )
    if (
        not stat.S_ISREG(metadata.st_mode)
        or metadata.st_mode & 0o022
        or metadata.st_nlink != 1
        or (require_root_owner and (metadata.st_uid != 0 or metadata.st_gid != 0))
    ):
        os.close(descriptor)
        _fail(
            MaterializerFailureCode.RASTER_UNQUALIFIED,
            "packaged helper source has unsafe type or mode",
        )
    digest = hashlib.sha256()
    try:
        while chunk := os.read(descriptor, _COPY_CHUNK_BYTES):
            digest.update(chunk)
    except OSError as exc:
        os.close(descriptor)
        _fail(
            MaterializerFailureCode.RASTER_UNQUALIFIED,
            f"cannot hash packaged helper source: {exc}",
        )
    actual = digest.hexdigest()
    if actual != QUALIFIED_HELPER_SOURCE_SHA256:
        os.close(descriptor)
        _fail(
            MaterializerFailureCode.RASTER_UNQUALIFIED,
            "packaged helper source does not match the I92 qualification",
        )
    return descriptor, actual


def _open_helper(prefix: Path, *, require_elf: bool) -> tuple[int, str]:
    prefix_fd, prefix_stat = _trusted_directory(prefix, service_owned=False)
    descriptor = prefix_fd
    helper_fd: int | None = None
    try:
        for component in HELPER_RELATIVE_PATH.parts[:-1]:
            child = os.open(component, _directory_flags(), dir_fd=descriptor)
            child_stat = os.fstat(child)
            if child_stat.st_uid != prefix_stat.st_uid or child_stat.st_mode & 0o022:
                os.close(child)
                _fail(
                    MaterializerFailureCode.RASTER_UNQUALIFIED,
                    "helper directory has unsafe ownership or mode",
                )
            os.close(descriptor)
            descriptor = child
        flags = (
            os.O_RDONLY
            | getattr(os, "O_NONBLOCK", 0)
            | getattr(os, "O_CLOEXEC", 0)
            | getattr(os, "O_NOFOLLOW", 0)
        )
        helper_fd = os.open(
            HELPER_RELATIVE_PATH.name,
            flags,
            dir_fd=descriptor,
        )
        helper_stat = os.fstat(helper_fd)
        if (
            not stat.S_ISREG(helper_stat.st_mode)
            or helper_stat.st_uid != prefix_stat.st_uid
            or helper_stat.st_mode & 0o022
            or not helper_stat.st_mode & stat.S_IXUSR
            or helper_stat.st_nlink != 1
            or helper_stat.st_size < 4
            or helper_stat.st_size > _MAX_HELPER_BYTES
        ):
            os.close(helper_fd)
            helper_fd = None
            _fail(
                MaterializerFailureCode.RASTER_UNQUALIFIED,
                "installed Field raster helper is not a trusted executable",
            )
        if require_elf and os.pread(helper_fd, 4, 0) != b"\x7fELF":
            os.close(helper_fd)
            helper_fd = None
            _fail(
                MaterializerFailureCode.RASTER_UNQUALIFIED,
                "installed Field raster helper is not an ELF binary",
            )
        manifest_fd = os.open(
            HELPER_MANIFEST_NAME,
            flags,
            dir_fd=descriptor,
        )
        try:
            manifest_stat = os.fstat(manifest_fd)
            if (
                not stat.S_ISREG(manifest_stat.st_mode)
                or manifest_stat.st_uid != prefix_stat.st_uid
                or manifest_stat.st_gid != prefix_stat.st_gid
                or stat.S_IMODE(manifest_stat.st_mode) != 0o644
                or manifest_stat.st_nlink != 1
                or manifest_stat.st_size < 2
                or manifest_stat.st_size > 4096
            ):
                _fail(
                    MaterializerFailureCode.RASTER_UNQUALIFIED,
                    "installed Field raster helper manifest is untrusted",
                )
            manifest_bytes = os.pread(
                manifest_fd,
                manifest_stat.st_size,
                0,
            )
            try:
                manifest = json.loads(manifest_bytes.decode("ascii"))
                canonical = (
                    json.dumps(
                        manifest,
                        sort_keys=True,
                        separators=(",", ":"),
                        ensure_ascii=True,
                        allow_nan=False,
                    )
                    + "\n"
                ).encode("ascii")
            except (UnicodeDecodeError, json.JSONDecodeError, ValueError) as exc:
                _fail(
                    MaterializerFailureCode.RASTER_UNQUALIFIED,
                    f"installed Field raster helper manifest is invalid: {exc}",
                )
            expected_keys = {
                "binarySha256",
                "compileFlags",
                "compilerPath",
                "compilerVersion",
                "libheifPackageVersion",
                "libheifPkgConfigVersion",
                "pkgConfigFlags",
                "schema",
                "sourceSha256",
            }
            if (
                type(manifest) is not dict
                or canonical != manifest_bytes
                or set(manifest) != expected_keys
                or manifest.get("schema") != HELPER_MANIFEST_SCHEMA
                or manifest.get("sourceSha256") != QUALIFIED_HELPER_SOURCE_SHA256
                or manifest.get("compileFlags") != list(_HELPER_COMPILE_FLAGS)
                or type(manifest.get("libheifPackageVersion")) is not str
                or re.fullmatch(
                    r"[0-9A-Za-z.+:~_-]{1,128}",
                    manifest["libheifPackageVersion"],
                )
                is None
                or type(manifest.get("libheifPkgConfigVersion")) is not str
                or _SAFE_VERSION.fullmatch(manifest["libheifPkgConfigVersion"]) is None
                or type(manifest.get("pkgConfigFlags")) is not list
                or not manifest["pkgConfigFlags"]
                or any(
                    type(token) is not str
                    or re.fullmatch(
                        r"(?:-pthread|-l[A-Za-z0-9_+.-]+|-[IL]/"
                        r"[A-Za-z0-9_+.,/@:-]+|-D[A-Za-z_][A-Za-z0-9_]*"
                        r"(?:=[A-Za-z0-9_+.,-]+)?)",
                        token,
                    )
                    is None
                    for token in manifest["pkgConfigFlags"]
                )
                or "-lheif" not in manifest["pkgConfigFlags"]
                or type(manifest.get("binarySha256")) is not str
                or re.fullmatch(r"[0-9a-f]{64}", manifest["binarySha256"]) is None
            ):
                _fail(
                    MaterializerFailureCode.RASTER_UNQUALIFIED,
                    "installed Field raster helper manifest contract failed",
                )
            digest = hashlib.sha256()
            offset = 0
            while offset < helper_stat.st_size:
                chunk = os.pread(
                    helper_fd,
                    min(_COPY_CHUNK_BYTES, helper_stat.st_size - offset),
                    offset,
                )
                if not chunk:
                    _fail(
                        MaterializerFailureCode.RASTER_UNQUALIFIED,
                        "installed Field raster helper ended during hashing",
                    )
                digest.update(chunk)
                offset += len(chunk)
            if digest.hexdigest() != manifest["binarySha256"]:
                _fail(
                    MaterializerFailureCode.RASTER_UNQUALIFIED,
                    "installed Field raster helper differs from its manifest",
                )
        finally:
            os.close(manifest_fd)
        return helper_fd, manifest["libheifPkgConfigVersion"]
    except OSError as exc:
        if helper_fd is not None:
            try:
                os.close(helper_fd)
            except OSError:
                pass
        _fail(
            MaterializerFailureCode.RASTER_UNQUALIFIED,
            f"installed Field raster helper is unavailable: {exc}",
        )
    except BaseException:
        if helper_fd is not None:
            try:
                os.close(helper_fd)
            except OSError:
                pass
        raise
    finally:
        try:
            os.close(descriptor)
        except OSError:
            pass


def _signal_group(process: subprocess.Popen[bytes], sig: signal.Signals) -> str | None:
    try:
        os.killpg(process.pid, sig)
    except ProcessLookupError:
        return None
    except OSError as exc:
        return f"{sig.name} failed: {_bounded_message(exc, 512)}"
    return None


def _terminate_and_reap(process: subprocess.Popen[bytes]) -> tuple[str, ...]:
    errors: list[str] = []
    error = _signal_group(process, signal.SIGTERM)
    if error is not None:
        errors.append(error)
    time.sleep(_TERM_GRACE_SECONDS)
    error = _signal_group(process, signal.SIGKILL)
    if error is not None:
        errors.append(error)
    try:
        process.wait(timeout=_KILL_REAP_SECONDS)
    except subprocess.TimeoutExpired:
        try:
            process.kill()
        except (ProcessLookupError, OSError) as exc:
            errors.append(f"direct kill failed: {_bounded_message(exc, 512)}")
        try:
            process.wait(timeout=_KILL_REAP_SECONDS)
        except (subprocess.TimeoutExpired, OSError) as exc:
            errors.append(f"leader reap failed: {_bounded_message(exc, 512)}")
    except OSError as exc:
        errors.append(f"leader wait failed: {_bounded_message(exc, 512)}")
    if process.returncode is None:
        errors.append("helper session leader was not reaped")

    group_deadline = time.monotonic() + _GROUP_GONE_SECONDS
    while True:
        try:
            os.killpg(process.pid, 0)
        except ProcessLookupError:
            break
        except OSError as exc:
            errors.append(f"group removal probe failed: {_bounded_message(exc, 512)}")
            break
        if time.monotonic() >= group_deadline:
            errors.append("helper process group still exists after SIGKILL")
            break
        time.sleep(0.01)
    return tuple(errors)


def _wait_for_unreaped_exit(
    process: subprocess.Popen[bytes],
    *,
    deadline: RefineDeadline,
) -> None:
    required = ("P_PID", "WEXITED", "WNOWAIT", "WNOHANG")
    if not hasattr(os, "waitid") or any(not hasattr(os, name) for name in required):
        raise _HelperFailure("Linux waitid WNOWAIT is unavailable")
    options = os.WEXITED | os.WNOWAIT | os.WNOHANG
    while True:
        try:
            observed = os.waitid(os.P_PID, process.pid, options)
        except InterruptedError:
            continue
        except (ChildProcessError, OSError) as exc:
            raise _HelperFailure(
                f"cannot observe helper exit without reaping: {exc}"
            ) from exc
        if observed is not None:
            return
        try:
            remaining = _remaining(deadline)
        except RefineMaterializerError as exc:
            raise _HelperFailure(str(exc), timeout=True) from exc
        time.sleep(min(remaining, 0.01))


def _linux_process_group_members(
    group_id: int,
    *,
    deadline: RefineDeadline,
) -> tuple[int, ...]:
    members: list[int] = []
    try:
        entries = os.scandir("/proc")
    except OSError as exc:
        raise _HelperFailure(f"cannot inspect Linux process table: {exc}") from exc
    with entries:
        for offset, entry in enumerate(entries):
            if offset % 256 == 0:
                try:
                    _remaining(deadline)
                except RefineMaterializerError as exc:
                    raise _HelperFailure(str(exc), timeout=True) from exc
            if not entry.name.isascii() or not entry.name.isdigit():
                continue
            pid = int(entry.name)
            try:
                with open(
                    f"/proc/{pid}/stat",
                    "rb",
                    buffering=0,
                ) as handle:
                    payload = handle.read(8193)
            except (FileNotFoundError, ProcessLookupError, PermissionError):
                continue
            except OSError as exc:
                raise _HelperFailure(
                    f"cannot inspect process {pid} for helper group proof: {exc}"
                ) from exc
            if len(payload) > 8192:
                raise _HelperFailure("Linux process stat exceeded its bound")
            try:
                fields = payload.rsplit(b")", 1)[1].split()
                process_group = int(fields[2])
            except (IndexError, ValueError) as exc:
                raise _HelperFailure(
                    f"Linux process {pid} has malformed stat data"
                ) from exc
            if process_group == group_id:
                members.append(pid)
    if group_id not in members:
        raise _HelperFailure(
            "unreaped helper leader disappeared during process-group proof"
        )
    return tuple(sorted(members))


def _finish_exited_session(
    process: subprocess.Popen[bytes],
) -> tuple[int | None, tuple[str, ...]]:
    errors: list[str] = []
    error = _signal_group(process, signal.SIGKILL)
    if error is not None:
        errors.append(error)
    try:
        process.wait(timeout=_KILL_REAP_SECONDS)
    except (subprocess.TimeoutExpired, OSError) as exc:
        errors.append(f"leader reap failed: {_bounded_message(exc, 512)}")
    if process.returncode is None:
        errors.append("helper session leader was not reaped")

    group_deadline = time.monotonic() + _GROUP_GONE_SECONDS
    while process.returncode is not None:
        try:
            os.killpg(process.pid, 0)
        except ProcessLookupError:
            break
        except OSError as exc:
            errors.append(f"group removal probe failed: {_bounded_message(exc, 512)}")
            break
        if time.monotonic() >= group_deadline:
            errors.append("helper process group still exists after final SIGKILL")
            break
        time.sleep(0.01)
    return process.returncode, tuple(errors)


def _close_pipe(pipe: object | None) -> str | None:
    if pipe is None:
        return None
    try:
        pipe.close()  # type: ignore[attr-defined]
    except OSError as exc:
        return f"cannot close helper pipe: {_bounded_message(exc, 512)}"
    return None


def _run_helper(
    helper_fd: int,
    scratch_fd: int,
    *,
    profile: FieldRasterProfile,
    deadline: RefineDeadline,
    proc_fd_root: Path,
) -> _HelperResult:
    if proc_fd_root != Path("/proc/self/fd") or not proc_fd_root.is_dir():
        raise _HelperFailure("Linux /proc/self/fd is unavailable")
    helper_alias = str(proc_fd_root / str(helper_fd))
    input_alias = str(proc_fd_root / str(scratch_fd) / "input.heic")
    output_alias = str(proc_fd_root / str(scratch_fd) / "output.ppm")
    process: subprocess.Popen[bytes] | None = None
    session_closed = False
    selector = selectors.DefaultSelector()
    stdout = bytearray()
    stderr = bytearray()
    pipes: dict[int, tuple[object, bytearray, int, str]] = {}
    primary: BaseException | None = None
    try:
        _remaining(deadline)
        process = subprocess.Popen(
            (
                helper_alias,
                input_alias,
                output_alias,
                str(profile.width),
                str(profile.height),
            ),
            executable=helper_alias,
            stdin=subprocess.DEVNULL,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            close_fds=True,
            pass_fds=(helper_fd, scratch_fd),
            start_new_session=True,
            cwd="/",
            env={"LANG": "C", "LC_ALL": "C"},
            bufsize=0,
        )
        if process.stdout is None or process.stderr is None:
            raise _HelperFailure("helper pipes were not created")
        for pipe, buffer, limit, label in (
            (process.stdout, stdout, _STDOUT_LIMIT, "stdout"),
            (process.stderr, stderr, _STDERR_LIMIT, "stderr"),
        ):
            descriptor = pipe.fileno()
            os.set_blocking(descriptor, False)
            selector.register(descriptor, selectors.EVENT_READ)
            pipes[descriptor] = (pipe, buffer, limit, label)

        while pipes:
            try:
                timeout = min(_remaining(deadline), 0.10)
            except RefineMaterializerError as exc:
                raise _HelperFailure(str(exc), timeout=True) from exc
            try:
                events = selector.select(timeout)
            except OSError as exc:
                raise _HelperFailure(f"helper pipe wait failed: {exc}") from exc
            for key, _mask in events:
                descriptor = int(key.fd)
                pipe, buffer, limit, label = pipes[descriptor]
                try:
                    chunk = os.read(descriptor, _PIPE_READ_BYTES)
                except BlockingIOError:
                    continue
                except OSError as exc:
                    raise _HelperFailure(f"helper {label} read failed: {exc}") from exc
                if not chunk:
                    selector.unregister(descriptor)
                    close_error = _close_pipe(pipe)
                    del pipes[descriptor]
                    if close_error is not None:
                        raise _HelperFailure(
                            f"helper cleanup uncertainty: {close_error}"
                        )
                    continue
                if len(buffer) + len(chunk) > limit:
                    raise _HelperFailure(f"helper {label} exceeded {limit} bytes")
                buffer.extend(chunk)

        _wait_for_unreaped_exit(process, deadline=deadline)
        group_members = _linux_process_group_members(
            process.pid,
            deadline=deadline,
        )
        returncode, finish_errors = _finish_exited_session(process)
        session_closed = True
        if finish_errors:
            raise _HelperFailure(
                "helper cleanup uncertainty: " + "; ".join(finish_errors)
            )
        descendants = tuple(pid for pid in group_members if pid != process.pid)
        if descendants:
            raise _HelperFailure(
                "helper left descendant processes after its leader exited"
            )
        if returncode != 0:
            detail = stderr.decode("utf-8", errors="replace")[-4096:]
            raise _HelperFailure(
                f"helper exited {returncode}: {_bounded_message(detail)}"
            )
        _remaining(deadline)
        return _HelperResult(bytes(stdout), bytes(stderr))
    except BaseException as exc:
        primary = exc
        raise
    finally:
        final_errors: list[str] = []
        try:
            selector.close()
        except OSError as exc:
            final_errors.append(
                f"cannot close helper selector: {_bounded_message(exc, 512)}"
            )
        for pipe, _buffer, _limit, _label in tuple(pipes.values()):
            close_error = _close_pipe(pipe)
            if close_error is not None:
                final_errors.append(close_error)
        if process is not None and not session_closed:
            final_errors.extend(_terminate_and_reap(process))
        if final_errors:
            raise _HelperFailure(
                "helper cleanup uncertainty: " + "; ".join(final_errors)
            ) from primary


def _validated_metadata(
    payload: bytes,
    *,
    profile: FieldRasterProfile,
) -> dict[str, str]:
    if len(payload) > _STDOUT_LIMIT:
        _fail(
            MaterializerFailureCode.RASTER_UNQUALIFIED,
            "helper metadata exceeded its bound",
        )
    try:
        text = payload.decode("utf-8", errors="strict")
        values = _parse_helper_metadata(text)
    except (UnicodeDecodeError, RasterQualificationError) as exc:
        _fail(
            MaterializerFailureCode.RASTER_UNQUALIFIED,
            f"helper metadata is invalid: {exc}",
        )
    width = str(profile.width)
    height = str(profile.height)
    expected = {
        "schema": LIBHEIF_HELPER_SCHEMA,
        "decoder_id": "libde265",
        "input_mime_type": "image/heic",
        "top_level_images": "1",
        "metadata_blocks": "0",
        "transformation_properties": "1",
        "transformation_property_type": "irot",
        "transformation_rotation_ccw": "0",
        # `declared_*` is the helper echoing back the argv it was given.  It
        # proves the run enforced the profile this adapter asked for, rather
        # than a size the helper still had compiled into it; the six that
        # follow prove the file agrees with that declaration.
        "declared_width": width,
        "declared_height": height,
        "ispe_width": width,
        "ispe_height": height,
        "presented_width": width,
        "presented_height": height,
        "raw_width": width,
        "raw_height": height,
        "default_width": width,
        "default_height": height,
        "raw_default_rgb_identical": "1",
        "matching_decoder_descriptor_count": "1",
    }
    if any(values.get(key) != value for key, value in expected.items()):
        _fail(
            MaterializerFailureCode.RASTER_UNQUALIFIED,
            f"helper metadata does not match the declared {profile.label} profile",
        )
    if _SAFE_VERSION.fullmatch(values["libheif_version"]) is None:
        _fail(
            MaterializerFailureCode.RASTER_UNQUALIFIED,
            "helper libheif version is invalid",
        )
    return values


def _stream_output(
    scratch_fd: int,
    destination: RefineBoundedWriter,
    *,
    profile: FieldRasterProfile,
    deadline: RefineDeadline,
) -> None:
    ppm_header = profile.ppm_header
    ppm_size = profile.ppm_size
    try:
        before = os.stat("output.ppm", dir_fd=scratch_fd, follow_symlinks=False)
    except OSError as exc:
        _fail(
            MaterializerFailureCode.RASTER_UNQUALIFIED,
            f"helper did not create its PPM: {exc}",
        )
    flags = (
        os.O_RDONLY
        | os.O_NONBLOCK
        | getattr(os, "O_CLOEXEC", 0)
        | getattr(os, "O_NOFOLLOW", 0)
    )
    descriptor: int | None = None
    close_error: OSError | None = None
    try:
        descriptor = os.open("output.ppm", flags, dir_fd=scratch_fd)
        opened = os.fstat(descriptor)
        if (
            not stat.S_ISREG(opened.st_mode)
            or (opened.st_dev, opened.st_ino) != (before.st_dev, before.st_ino)
            or stat.S_IMODE(opened.st_mode) != 0o600
            or opened.st_nlink != 1
            or opened.st_size != ppm_size
        ):
            _fail(
                MaterializerFailureCode.RASTER_UNQUALIFIED,
                "helper PPM has unsafe identity, mode, or size",
            )
        os.unlink("output.ppm", dir_fd=scratch_fd)
        sealed = os.fstat(descriptor)
        header = os.read(descriptor, len(ppm_header))
        if header != ppm_header:
            _fail(
                MaterializerFailureCode.RASTER_UNQUALIFIED,
                "helper PPM is not canonical P6 RGB",
            )
        os.lseek(descriptor, 0, os.SEEK_SET)
        copied = 0
        while True:
            _remaining(deadline)
            chunk = os.read(descriptor, _COPY_CHUNK_BYTES)
            if not chunk:
                break
            copied += len(chunk)
            if copied > ppm_size:
                _fail(
                    MaterializerFailureCode.RASTER_UNQUALIFIED,
                    "helper PPM exceeded its exact size",
                )
            try:
                written = destination.write(chunk)
            except RefineMaterializerError:
                raise
            except Exception as exc:  # noqa: BLE001 - protocol normalization
                _fail(
                    MaterializerFailureCode.RASTER_UNQUALIFIED,
                    f"bounded raster destination raised {type(exc).__name__}",
                )
            if written != len(chunk):
                _fail(
                    MaterializerFailureCode.RASTER_UNQUALIFIED,
                    "bounded raster destination accepted a short write",
                )
        after = os.fstat(descriptor)
        if copied != ppm_size or _source_identity(sealed) != _source_identity(after):
            _fail(
                MaterializerFailureCode.RASTER_UNQUALIFIED,
                "helper PPM changed while it was consumed",
            )
    except OSError as exc:
        _fail(
            MaterializerFailureCode.RASTER_UNQUALIFIED,
            f"cannot consume helper PPM: {exc}",
        )
    finally:
        if descriptor is not None:
            try:
                os.close(descriptor)
            except OSError as exc:
                close_error = exc
        if close_error is not None:
            _fail(
                MaterializerFailureCode.RASTER_UNQUALIFIED,
                f"raster output cleanup uncertainty: {close_error}",
            )


def _materializer_id(
    source_hash: str,
    version: str,
    profile: FieldRasterProfile,
) -> str:
    # The profile belongs in the identity now that it is a parameter.  Two runs
    # of the same helper source against the same libheif at different declared
    # sizes produce rasters that are not comparable, and the materializer id is
    # how the evidence ledger tells materializations apart.
    value = (
        f"{MATERIALIZER_ID_PREFIX}-{source_hash[:12]}"
        f"-libheif-{version}-libde265-{profile.label}"
    )
    if len(value.encode("utf-8")) > _MAX_MATERIALIZER_ID_BYTES:
        _fail(
            MaterializerFailureCode.RASTER_UNQUALIFIED,
            "helper libheif version makes the materializer identity too long",
        )
    return value


def _scratch_cleanup(
    parent_fd: int | None,
    scratch_fd: int | None,
    scratch_name: str | None,
    scratch_identity: tuple[int, int] | None,
) -> tuple[str, ...]:
    errors: list[str] = []
    if scratch_fd is not None:
        for name in ("input.heic", "output.ppm"):
            try:
                os.unlink(name, dir_fd=scratch_fd)
            except FileNotFoundError:
                pass
            except OSError as exc:
                errors.append(f"cannot remove {name}: {_bounded_message(exc, 512)}")
        if parent_fd is not None and scratch_name is not None:
            try:
                visible = os.stat(
                    scratch_name,
                    dir_fd=parent_fd,
                    follow_symlinks=False,
                )
                opened = os.fstat(scratch_fd)
                if (
                    scratch_identity is None
                    or (
                        visible.st_dev,
                        visible.st_ino,
                    )
                    != scratch_identity
                    or (
                        opened.st_dev,
                        opened.st_ino,
                    )
                    != scratch_identity
                ):
                    errors.append("scratch directory identity changed before cleanup")
            except OSError as exc:
                errors.append(
                    f"cannot verify scratch directory cleanup: "
                    f"{_bounded_message(exc, 512)}"
                )
        try:
            os.close(scratch_fd)
        except OSError as exc:
            errors.append(
                f"cannot close scratch directory: {_bounded_message(exc, 512)}"
            )
    if parent_fd is not None and scratch_name is not None and not errors:
        try:
            os.rmdir(scratch_name, dir_fd=parent_fd)
        except OSError as exc:
            errors.append(
                f"cannot remove scratch directory: {_bounded_message(exc, 512)}"
            )
    if parent_fd is not None:
        try:
            os.close(parent_fd)
        except OSError as exc:
            errors.append(f"cannot close scratch parent: {_bounded_message(exc, 512)}")
    return tuple(errors)


class PackagedLibheifFieldRasterMaterializer:
    """Concrete disabled adapter for one declared, bounded raster profile.

    ``profile`` has no default on purpose.  The size this adapter enforces is
    the whole subject of R118, and a default would let a composition inherit a
    profile it never stated — which is how a fixture size came to be shipped as
    the production one in the first place.
    """

    production_enablement = "disabled"

    def __init__(
        self,
        *,
        scratch_parent: Path,
        profile: FieldRasterProfile,
    ) -> None:
        if not isinstance(scratch_parent, Path) or not scratch_parent.is_absolute():
            raise TypeError("scratch_parent must be an absolute Path")
        if not isinstance(profile, FieldRasterProfile):
            raise TypeError("profile must be a FieldRasterProfile")
        self._scratch_parent = scratch_parent
        self._profile = profile
        self._test_release_prefix: Path | None = None
        self._proc_fd_root = Path("/proc/self/fd")

    @property
    def profile(self) -> FieldRasterProfile:
        return self._profile

    @classmethod
    def _for_test(
        cls,
        *,
        scratch_parent: Path,
        release_prefix: Path,
        profile: FieldRasterProfile,
    ) -> PackagedLibheifFieldRasterMaterializer:
        instance = cls(scratch_parent=scratch_parent, profile=profile)
        instance._test_release_prefix = release_prefix
        return instance

    def _prefix(self) -> Path:
        if self._test_release_prefix is not None:
            return self._test_release_prefix
        try:
            prefix = Path(sys.prefix).resolve(strict=True)
            metadata = prefix.stat()
        except OSError as exc:
            _fail(
                MaterializerFailureCode.RASTER_UNQUALIFIED,
                f"cannot resolve installed release: {exc}",
            )
        if metadata.st_uid != 0 or metadata.st_gid != 0:
            _fail(
                MaterializerFailureCode.RASTER_UNQUALIFIED,
                "installed release is not root-owned",
            )
        return prefix

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
    ) -> FieldRasterMaterialization:
        _validate_string(source_name, "source_name", ".heic")
        _validate_string(engine_name, "engine_name", ".ppm")
        profile = self._profile
        if (
            type(encoded_width) is not int
            or type(encoded_height) is not int
            or (encoded_width, encoded_height) != (profile.width, profile.height)
        ):
            _fail(
                MaterializerFailureCode.RASTER_UNQUALIFIED,
                f"raster dimensions are outside the declared {profile.label} profile",
            )
        _remaining(deadline)

        parent_fd: int | None = None
        scratch_fd: int | None = None
        scratch_name: str | None = None
        scratch_identity: tuple[int, int] | None = None
        helper_fd: int | None = None
        packaged_source_fd: int | None = None
        primary: BaseException | None = None
        result: FieldRasterMaterialization | None = None
        try:
            packaged_source_fd, source_hash = _open_packaged_source(
                require_root_owner=self._test_release_prefix is None,
            )
            helper_fd, manifest_libheif_version = _open_helper(
                self._prefix(),
                require_elf=self._test_release_prefix is None,
            )
            parent_fd, _parent_stat = _trusted_directory(
                self._scratch_parent,
                service_owned=True,
            )
            for _attempt in range(32):
                candidate = "field-raster-" + secrets.token_hex(16)
                try:
                    os.mkdir(candidate, 0o700, dir_fd=parent_fd)
                except FileExistsError:
                    continue
                scratch_name = candidate
                break
            if scratch_name is None:
                _fail(
                    MaterializerFailureCode.RASTER_UNQUALIFIED,
                    "cannot allocate a unique raster scratch directory",
                )
            scratch_fd = os.open(scratch_name, _directory_flags(), dir_fd=parent_fd)
            scratch_stat = os.fstat(scratch_fd)
            if (
                not stat.S_ISDIR(scratch_stat.st_mode)
                or scratch_stat.st_uid != os.geteuid()
                or stat.S_IMODE(scratch_stat.st_mode) != 0o700
            ):
                _fail(
                    MaterializerFailureCode.RASTER_UNQUALIFIED,
                    "raster scratch directory is untrusted",
                )
            scratch_identity = (scratch_stat.st_dev, scratch_stat.st_ino)
            input_flags = (
                os.O_WRONLY
                | os.O_CREAT
                | os.O_EXCL
                | getattr(os, "O_CLOEXEC", 0)
                | getattr(os, "O_NOFOLLOW", 0)
            )
            input_fd = os.open(
                "input.heic",
                input_flags,
                0o600,
                dir_fd=scratch_fd,
            )
            try:
                _copy_pinned_source(source, input_fd, deadline=deadline)
            finally:
                os.close(input_fd)

            try:
                helper_result = _run_helper(
                    helper_fd,
                    scratch_fd,
                    profile=profile,
                    deadline=deadline,
                    proc_fd_root=self._proc_fd_root,
                )
            except _HelperFailure as exc:
                code = (
                    MaterializerFailureCode.DEADLINE
                    if exc.timeout
                    else MaterializerFailureCode.RASTER_UNQUALIFIED
                )
                _fail(code, exc)
            if helper_result.stderr:
                _fail(
                    MaterializerFailureCode.RASTER_UNQUALIFIED,
                    "qualified helper emitted stderr on success",
                )
            metadata = _validated_metadata(helper_result.stdout, profile=profile)
            if metadata["libheif_version"] != manifest_libheif_version:
                _fail(
                    MaterializerFailureCode.RASTER_UNQUALIFIED,
                    "loaded libheif version differs from the qualified helper manifest",
                )
            materializer_id = _materializer_id(
                source_hash,
                metadata["libheif_version"],
                profile,
            )
            try:
                os.unlink("input.heic", dir_fd=scratch_fd)
            except OSError as exc:
                _fail(
                    MaterializerFailureCode.RASTER_UNQUALIFIED,
                    f"cannot retire helper input: {exc}",
                )
            _stream_output(
                scratch_fd,
                destination,
                profile=profile,
                deadline=deadline,
            )
            result = FieldRasterMaterialization(
                materializer_id=materializer_id,
                source_width=profile.width,
                source_height=profile.height,
                output_width=profile.width,
                output_height=profile.height,
            )
        except RefineMaterializerError as exc:
            primary = exc
        except Exception as exc:  # noqa: BLE001 - stable adapter failure surface
            primary = RefineMaterializerError(
                MaterializerFailureCode.RASTER_UNQUALIFIED,
                _bounded_message(
                    f"raster adapter failed closed: {type(exc).__name__}: {exc}"
                ),
            )
        except BaseException as exc:  # noqa: BLE001 - cleanup precedes interrupt
            primary = exc
        finally:
            provenance_cleanup_errors: list[str] = []
            for descriptor in (helper_fd, packaged_source_fd):
                if descriptor is None:
                    continue
                try:
                    os.close(descriptor)
                except OSError as exc:
                    provenance_cleanup_errors.append(
                        f"cannot close raster provenance descriptor: {exc}"
                    )
            if provenance_cleanup_errors:
                primary = RefineMaterializerError(
                    MaterializerFailureCode.RASTER_UNQUALIFIED,
                    "raster cleanup uncertainty: "
                    + "; ".join(provenance_cleanup_errors),
                )
            cleanup_errors = _scratch_cleanup(
                parent_fd,
                scratch_fd,
                scratch_name,
                scratch_identity,
            )
            if cleanup_errors:
                primary = RefineMaterializerError(
                    MaterializerFailureCode.RASTER_UNQUALIFIED,
                    "raster cleanup uncertainty: " + "; ".join(cleanup_errors),
                )
        if primary is not None:
            raise primary
        if result is None:  # pragma: no cover - every successful path assigns it
            _fail(
                MaterializerFailureCode.RASTER_UNQUALIFIED,
                "raster materializer produced no evidence",
            )
        _remaining(deadline)
        return result
