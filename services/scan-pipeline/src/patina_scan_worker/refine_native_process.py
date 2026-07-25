"""Killable POSIX process boundary for future native Refine engine calls.

PyCOLMAP calls into native code and cannot be interrupted safely by a Python
thread timeout.  This module starts a fresh ``spawn`` interpreter, establishes
that child as a new POSIX session, and loads the requested engine entry point
only after the parent validates that boundary and returns an exact readiness
acknowledgement.  The parent accepts a result only after the session leader
exits inside the one shared :class:`RefineDeadline`.

The boundary deliberately transports bounded canonical JSON made only from
exact built-in JSON containers/scalars, not Python/native objects or hostile
container subclasses. Future handler entry points must therefore load PyCOLMAP
inside the child, use scratch paths from the request, and return evidence needed
by the parent. They must also be explicitly marked as in-process-only: native
threads are allowed, but an entry point may not spawn an OS child and then
return while that process remains alive. Timeout cleanup kills a whole process
group; successful cleanup relies on this narrower contract. Any durable
artifact publication remains parent-only and must occur only after this
function returns successfully. The Item 4A qualifier remains in-process until
the production handler contract is built and separately qualified.

Scratch is parent-owned. When a caller asks for one, the parent provisions a
private 0700 workspace, pins it and its container by descriptor, leases a
duplicate descriptor down to the child over SCM_RIGHTS, and performs bounded
descriptor-relative cleanup after every child outcome. The child is never given
the path and never removes the root, so a SIGKILLed child cannot strand it.
Containment rests on parent ownership, not on path secrecy: a compromised child
could still resolve its own descriptor through Linux procfs, and a hostile
same-UID actor that already knows the container can still race the cleanup
window. Cleanup therefore quarantine-renames each entry to an unguessable name
inside the pinned directory and refuses to remove anything whose identity
changed, which bounds that race rather than eliminating it.
"""

from __future__ import annotations

import hashlib
import importlib
import json
import math
import multiprocessing
import os
import re
import secrets
import signal
import stat
import sys
import time
from collections.abc import Iterable, Iterator, Mapping
from dataclasses import dataclass, field
from json.encoder import encode_basestring_ascii
from multiprocessing.connection import Connection, wait
from types import MappingProxyType
from typing import Any

from .refine_adapter import AdapterError, RefineDeadline

NATIVE_CHILD_MAX_REQUEST_BYTES = 64 * 1024
NATIVE_CHILD_MAX_RESPONSE_BYTES = 256 * 1024
NATIVE_CHILD_MAX_ERROR_BYTES = 1024
NATIVE_CHILD_MAX_PINNED_FILES = 64
NATIVE_CHILD_MAX_PINNED_TOKEN_BYTES = 64
NATIVE_CHILD_MAX_PINNED_FILE_BYTES = 128 * 1024 * 1024
NATIVE_CHILD_MAX_PINNED_TOTAL_BYTES = 4 * 1024 * 1024 * 1024
NATIVE_CHILD_TERM_GRACE_S = 0.10
NATIVE_CHILD_KILL_REAP_S = 1.0
NATIVE_WORKSPACE_NAME_PREFIX = "patina-refine-native-workspace-"
NATIVE_WORKSPACE_QUARANTINE_PREFIX = "patina-refine-native-purge-"
NATIVE_WORKSPACE_MAX_ENTRIES = 4096
NATIVE_WORKSPACE_MAX_DEPTH = 8
NATIVE_WORKSPACE_NAME_ATTEMPTS = 8

_PROTOCOL_VERSION = 1
_ENTRYPOINT_PATTERN = re.compile(r"^[A-Za-z_]\w*(?:\.[A-Za-z_]\w*)*:[A-Za-z_]\w*$")
_ACK_READY = b"ready-accept-v1"
_ACK_ACCEPT = b"accept-v1"
_TIMEOUT_CODE = "REFINE_ENGINE_TIMEOUT"
_FAILED_CODE = "REFINE_ENGINE_FAILED"
_INVALID_INPUT_CODE = "REFINE_INPUT_INVALID"
_CLEANUP_FAILED_CODE = "REFINE_ENGINE_CLEANUP_FAILED"
_CHILD_PROTOCOL_REJECT_EXIT_CODE = 74
_IN_PROCESS_ENTRYPOINT_MARKER = "__patina_refine_in_process_only__"
_JSON_STRING_CHUNK_CHARS = 1024
_JSON_OUTPUT_CHUNK_CHARS = 1024
# Individual cleanup entries stay small enough that a final 1 KiB report can
# retain more than one independently failing resource.
_MAX_CLEANUP_ERRORS = 32
_MAX_CLEANUP_ERROR_BYTES = 256
_ERROR_CODE_PATTERN = re.compile(r"^REFINE_[A-Z0-9_]{1,63}$")
_PINNED_FILE_TOKEN_PATTERN = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$")
_PINNED_FILE_READ_BYTES = 1024 * 1024
_NATIVE_CHILD_CONTEXT_SEAL = object()


class _ChildBoundaryTimeout(TimeoutError):
    pass


class _ChildTransportError(ValueError):
    pass


class _ChildJsonOverflow(OverflowError):
    pass


@dataclass(frozen=True)
class NativeChildContext:
    """The same absolute engine deadline, visible inside the spawned child."""

    expires_at_monotonic_s: float
    _pinned_files: Mapping[str, int] = field(
        default_factory=lambda: MappingProxyType({}),
        repr=False,
        compare=False,
    )
    _workspace_descriptor: int | None = field(
        default=None,
        repr=False,
        compare=False,
    )
    _boundary_seal: object | None = field(
        default=None,
        init=False,
        repr=False,
        compare=False,
    )
    _boundary_pid: int | None = field(
        default=None,
        init=False,
        repr=False,
        compare=False,
    )

    def remaining_seconds(self) -> float:
        remaining = self.expires_at_monotonic_s - time.monotonic()
        if not math.isfinite(remaining) or remaining <= 0:
            raise AdapterError(
                "refine native engine child deadline is exhausted",
                _TIMEOUT_CODE,
            )
        return remaining

    @property
    def pinned_file_tokens(self) -> tuple[str, ...]:
        """Return the canonical closed token set received from the parent."""

        return tuple(self._pinned_files)

    def pinned_file_descriptor(self, token: str) -> int:
        """Borrow one verified read-only descriptor for the entry point call."""

        if type(token) is not str:
            raise AdapterError(
                "native child pinned file token must be a string",
                _INVALID_INPUT_CODE,
            )
        try:
            return self._pinned_files[token]
        except KeyError as exc:
            raise AdapterError(
                "native child pinned file token is unavailable",
                _INVALID_INPUT_CODE,
            ) from exc

    @property
    def has_leased_workspace(self) -> bool:
        """Report whether the parent leased a writable workspace to this child."""

        return type(self._workspace_descriptor) is int

    def workspace_descriptor(self) -> int:
        """Borrow the parent-owned workspace root for descriptor-relative writes.

        This is the reverse of :meth:`pinned_file_descriptor`: pinned files are
        read-only inputs the parent hands down, while the workspace is the one
        writable directory the child may populate, and its contents travel back
        to the parent.  The child is not given a path, does not create the
        directory, and must not remove it; the parent provisions it before
        ``spawn`` and performs bounded cleanup after every child outcome,
        including SIGKILL.
        """

        descriptor = self._workspace_descriptor
        if type(descriptor) is not int:
            raise AdapterError(
                "native child workspace lease is unavailable",
                _INVALID_INPUT_CODE,
            )
        return descriptor

    @property
    def is_verified_native_boundary(self) -> bool:
        """Authenticate the context created for one isolated child entry point."""

        try:
            pid = os.getpid()
            isolated = os.getsid(0) == pid and os.getpgrp() == pid
        except BaseException:  # noqa: BLE001 - authentication must fail closed
            return False
        return (
            self._boundary_seal is _NATIVE_CHILD_CONTEXT_SEAL
            and self._boundary_pid == pid
            and isolated
        )


def _seal_native_child_context(context: NativeChildContext) -> NativeChildContext:
    """Seal only the final entry-point context after child descriptor receipt."""

    try:
        pid = os.getpid()
        isolated = os.getsid(0) == pid and os.getpgrp() == pid
    except BaseException as exc:  # noqa: BLE001 - normalize injected inspection
        raise _ChildTransportError(
            "native child context isolation cannot be inspected"
        ) from exc
    if not isolated:
        raise _ChildTransportError(
            "native child context cannot be sealed outside its isolated session"
        )
    object.__setattr__(context, "_boundary_seal", _NATIVE_CHILD_CONTEXT_SEAL)
    object.__setattr__(context, "_boundary_pid", pid)
    return context


@dataclass(frozen=True)
class NativePinnedFile:
    """Parent descriptor plus the exact immutable fingerprint sent to the child.

    This disabled prerequisite accepts only service-owned local regular files.
    Callers must not pass FUSE, network, removable, or other externally blocking
    filesystem descriptors: parent-side ``pread`` hashing is synchronous and
    cannot preempt a kernel-blocked read. Production composition must enforce
    that local-file contract or move validation behind another killable process
    boundary before registering Refine.
    """

    descriptor: int
    sha256: str
    size_bytes: int


@dataclass(frozen=True)
class NativeWorkspaceLease:
    """One parent-provisioned, descriptor-rooted 0700 workspace for a child.

    The parent creates the directory before any child exists, pins both the
    containing directory and the workspace itself by descriptor, and never
    re-resolves either by path afterwards.  ``path`` is retained for parent-side
    diagnostics only and is never transported to the child.  The child receives
    only a duplicate of ``descriptor`` over SCM_RIGHTS, so it cannot outlive the
    workspace: cleanup is the parent's obligation on every outcome, including a
    SIGKILLed child that never ran Python cleanup at all.
    """

    parent_descriptor: int
    name: str
    descriptor: int
    identity: tuple[int, int]
    path: str


@dataclass(frozen=True)
class _PinnedFileTransfer:
    token: str
    descriptor: int
    sha256: str
    size_bytes: int
    original_offset: int | None = None


def native_engine_entrypoint(target):
    """Declare a top-level target that never returns with live OS children.

    The decorator intentionally does not wrap ``target`` so its module-level
    import identity remains stable under the ``spawn`` start method.
    """

    if not callable(target):
        raise TypeError("native engine entry point marker requires a callable")
    setattr(target, _IN_PROCESS_ENTRYPOINT_MARKER, True)
    return target


def _iter_json_string(value: str) -> Iterator[str]:
    """Yield canonical ``ensure_ascii`` JSON without copying a huge string."""

    yield '"'
    for offset in range(0, len(value), _JSON_STRING_CHUNK_CHARS):
        encoded = encode_basestring_ascii(
            value[offset : offset + _JSON_STRING_CHUNK_CHARS]
        )
        yield encoded[1:-1]
    yield '"'


def _bounded_int_repr(value: int, *, maximum_bytes: int) -> str:
    # A base-10 integer has more than one digit per four binary bits.  Reject
    # impossible-to-fit integers before making their decimal copy; any
    # surviving representation is bounded by a small multiple of the cap.
    if int.bit_length(value) > (maximum_bytes + 1) * 4:
        raise _ChildJsonOverflow
    return int.__repr__(value)


def _json_string_content_size(value: str, *, maximum_bytes: int) -> int:
    size = 0
    for offset in range(0, len(value), _JSON_STRING_CHUNK_CHARS):
        encoded = encode_basestring_ascii(
            value[offset : offset + _JSON_STRING_CHUNK_CHARS]
        )
        size += len(encoded) - 2
        if size > maximum_bytes:
            raise _ChildJsonOverflow
    return size


def _sort_bounded_json_keys(value: dict[str, Any]) -> list[str]:
    """Sort only after callers prove the key-reference copy fits the cap."""

    return sorted(dict.keys(value))


def _validated_bounded_json_keys(
    value: dict[str, Any],
    *,
    maximum_bytes: int,
) -> list[str]:
    count = dict.__len__(value)
    # Braces + newline, commas, quoted empty keys, colons, and the smallest
    # possible one-byte values.  Reject before iterating or copying keys.
    minimum_document_bytes = 3 if count == 0 else (5 * count) + 2
    if minimum_document_bytes > maximum_bytes:
        raise _ChildJsonOverflow

    key_content_bytes = 0
    for key in dict.keys(value):
        if type(key) is not str:
            raise TypeError(
                "native child JSON object keys must be exact built-in strings"
            )
        key_content_bytes += _json_string_content_size(
            key,
            maximum_bytes=maximum_bytes - minimum_document_bytes,
        )
        if minimum_document_bytes + key_content_bytes > maximum_bytes:
            raise _ChildJsonOverflow
    return _sort_bounded_json_keys(value)


def _iter_canonical_json_chunks(
    value: Any,
    *,
    maximum_bytes: int,
    active_containers: set[int] | None = None,
) -> Iterator[str]:
    """Stream the supported stdlib JSON model in canonical byte order.

    Strings are escaped in bounded slices because ``JSONEncoder.iterencode``
    may emit one string value as a single unbounded chunk.  Container identity
    tracking preserves the stdlib encoder's circular-reference rejection.
    """

    if active_containers is None:
        active_containers = set()
    if value is None:
        yield "null"
        return
    if value is True:
        yield "true"
        return
    if value is False:
        yield "false"
        return
    value_type = type(value)
    if value_type is str:
        yield from _iter_json_string(value)
        return
    if value_type is int:
        yield _bounded_int_repr(value, maximum_bytes=maximum_bytes)
        return
    if value_type is float:
        if not math.isfinite(value):
            raise ValueError("Out of range float values are not JSON compliant")
        yield float.__repr__(value)
        return
    if value_type is list or value_type is tuple:
        marker = id(value)
        if marker in active_containers:
            raise ValueError("Circular reference detected")
        active_containers.add(marker)
        try:
            yield "["
            first = True
            for item in value:
                if not first:
                    yield ","
                first = False
                yield from _iter_canonical_json_chunks(
                    item,
                    maximum_bytes=maximum_bytes,
                    active_containers=active_containers,
                )
            yield "]"
        finally:
            active_containers.remove(marker)
        return
    if value_type is dict:
        marker = id(value)
        if marker in active_containers:
            raise ValueError("Circular reference detected")
        active_containers.add(marker)
        try:
            yield "{"
            first = True
            for key in _validated_bounded_json_keys(
                value,
                maximum_bytes=maximum_bytes,
            ):
                if not first:
                    yield ","
                first = False
                yield from _iter_json_string(key)
                yield ":"
                yield from _iter_canonical_json_chunks(
                    dict.__getitem__(value, key),
                    maximum_bytes=maximum_bytes,
                    active_containers=active_containers,
                )
            yield "}"
        finally:
            active_containers.remove(marker)
        return
    raise _ChildTransportError(
        "native child transport requires exact built-in JSON values"
    )


def _collect_bounded_json_chunks(
    chunks: Iterable[str],
    *,
    maximum_bytes: int,
    overflow_message: str,
) -> bytes:
    """Collect UTF-8 chunks without ever constructing output beyond ``cap``."""

    if type(maximum_bytes) is not int or maximum_bytes < 1:
        raise ValueError("native child JSON byte cap must be positive")
    safe_overflow_message = (
        _truncate_utf8(overflow_message, NATIVE_CHILD_MAX_ERROR_BYTES)
        if type(overflow_message) is str
        else "native child JSON exceeds the bounded transport"
    )
    output = bytearray()
    for chunk in chunks:
        if type(chunk) is not str:
            raise _ChildTransportError(
                "native child JSON encoder yielded a non-text chunk"
            )
        for offset in range(0, len(chunk), _JSON_OUTPUT_CHUNK_CHARS):
            piece = chunk[offset : offset + _JSON_OUTPUT_CHUNK_CHARS]
            encoded = piece.encode("utf-8")
            if len(output) + len(encoded) > maximum_bytes:
                raise _ChildTransportError(safe_overflow_message)
            output.extend(encoded)
    return bytes(output)


def _bounded_json_bytes(
    value: Any,
    *,
    maximum_bytes: int,
    overflow_message: str,
) -> bytes:
    def chunks_with_terminal_newline() -> Iterator[str]:
        yield from _iter_canonical_json_chunks(
            value,
            maximum_bytes=maximum_bytes,
        )
        yield "\n"

    try:
        return _collect_bounded_json_chunks(
            chunks_with_terminal_newline(),
            maximum_bytes=maximum_bytes,
            overflow_message=overflow_message,
        )
    except _ChildTransportError:
        raise
    except _ChildJsonOverflow as exc:
        raise _ChildTransportError(
            _truncate_utf8(
                overflow_message
                if type(overflow_message) is str
                else "native child JSON exceeds the bounded transport",
                NATIVE_CHILD_MAX_ERROR_BYTES,
            )
        ) from exc
    except (RecursionError, TypeError, ValueError, OverflowError) as exc:
        raise _ChildTransportError(
            _bounded_diagnostic(
                "native child transport requires finite JSON values: ",
                _exception_summary(exc),
            )
        ) from exc


def _bounded_request(request: Mapping[str, Any]) -> bytes:
    if type(request) is not dict:
        raise AdapterError(
            "refine native child request must be an exact built-in JSON object",
            _FAILED_CODE,
        )
    try:
        payload = _bounded_json_bytes(
            request,
            maximum_bytes=NATIVE_CHILD_MAX_REQUEST_BYTES,
            overflow_message=(
                "refine native child request exceeds the bounded transport"
            ),
        )
    except _ChildTransportError as exc:
        raise AdapterError(
            _safe_exception_message(
                exc,
                fallback="refine native child request transport failed",
            ),
            _FAILED_CODE,
        ) from exc
    return payload


# This is deliberately a tuple searched with ``is``. A dict lookup can invoke
# a hostile exception metaclass's dynamic ``__hash__`` implementation.
_SAFE_EXCEPTION_LABELS: tuple[tuple[type[BaseException], str], ...] = (
    (AdapterError, "AdapterError"),
    (_ChildBoundaryTimeout, "child boundary timeout"),
    (_ChildJsonOverflow, "child JSON overflow"),
    (_ChildTransportError, "child transport error"),
    (AssertionError, "AssertionError"),
    (AttributeError, "AttributeError"),
    (BaseException, "BaseException"),
    (BrokenPipeError, "BrokenPipeError"),
    (ChildProcessError, "ChildProcessError"),
    (ConnectionError, "ConnectionError"),
    (EOFError, "EOFError"),
    (Exception, "Exception"),
    (FileNotFoundError, "FileNotFoundError"),
    (ImportError, "ImportError"),
    (json.JSONDecodeError, "JSONDecodeError"),
    (KeyboardInterrupt, "KeyboardInterrupt"),
    (MemoryError, "MemoryError"),
    (OSError, "OSError"),
    (OverflowError, "OverflowError"),
    (PermissionError, "PermissionError"),
    (ProcessLookupError, "ProcessLookupError"),
    (RecursionError, "RecursionError"),
    (RuntimeError, "RuntimeError"),
    (SystemExit, "SystemExit"),
    (TimeoutError, "TimeoutError"),
    (TypeError, "TypeError"),
    (UnicodeDecodeError, "UnicodeDecodeError"),
    (ValueError, "ValueError"),
)


def _bounded_diagnostic(
    *parts: Any,
    maximum_bytes: int = NATIVE_CHILD_MAX_ERROR_BYTES,
) -> str:
    """Join exact built-in strings without constructing text beyond the cap."""

    if type(maximum_bytes) is not int or maximum_bytes < 1:
        maximum_bytes = NATIVE_CHILD_MAX_ERROR_BYTES
    output = bytearray()
    for part in parts:
        text = part if type(part) is str else "invalid diagnostic"
        for offset in range(0, len(text), _JSON_STRING_CHUNK_CHARS):
            encoded = text[offset : offset + _JSON_STRING_CHUNK_CHARS].encode(
                "utf-8",
                errors="replace",
            )
            remaining = maximum_bytes - len(output)
            if len(encoded) > remaining:
                output.extend(encoded[:remaining])
                if maximum_bytes >= 3:
                    return (
                        bytes(output[: maximum_bytes - 3]).decode(
                            "utf-8",
                            errors="ignore",
                        )
                        + "..."
                    )
                return bytes(output).decode("utf-8", errors="ignore")
            output.extend(encoded)
    return bytes(output).decode("utf-8")


def _truncate_utf8(value: str, maximum_bytes: int) -> str:
    return _bounded_diagnostic(value, maximum_bytes=maximum_bytes)


def _safe_exception_details(exc: BaseException) -> tuple[str, str | None]:
    """Return fixed type metadata and only exact built-in string arguments."""

    exception_type = type(exc)
    label = None
    for candidate, candidate_label in _SAFE_EXCEPTION_LABELS:
        if exception_type is candidate:
            label = candidate_label
            break
    if label is None:
        return "external exception", None
    try:
        args = BaseException.args.__get__(exc, BaseException)
    except BaseException:
        return label, None
    if type(args) is tuple:
        count = tuple.__len__(args)
        if count <= 4:
            for index in range(count):
                message = tuple.__getitem__(args, index)
                if type(message) is str:
                    return label, message
    return label, None


def _safe_exception_message(
    exc: BaseException,
    *,
    fallback: str,
) -> str:
    _label, message = _safe_exception_details(exc)
    if message is None:
        message = fallback if type(fallback) is str else "external exception"
    return _truncate_utf8(message, NATIVE_CHILD_MAX_ERROR_BYTES)


def _validated_error_code(value: Any) -> str:
    if (
        type(value) is str
        and len(value) <= 64
        and _ERROR_CODE_PATTERN.fullmatch(value) is not None
    ):
        return value
    return _FAILED_CODE


def _safe_adapter_error_code(exc: BaseException) -> str:
    if type(exc) is not AdapterError:
        return _FAILED_CODE
    try:
        return _validated_error_code(object.__getattribute__(exc, "code"))
    except BaseException:
        return _FAILED_CODE


def _error_envelope(exc: BaseException) -> Mapping[str, Any]:
    label, message = _safe_exception_details(exc)
    return {
        "protocolVersion": _PROTOCOL_VERSION,
        "kind": "error",
        "code": _safe_adapter_error_code(exc),
        "exceptionType": label,
        "message": _truncate_utf8(
            message if message is not None else label,
            NATIVE_CHILD_MAX_ERROR_BYTES,
        ),
    }


def _send_envelope(connection: Connection, envelope: Mapping[str, Any]) -> None:
    payload = _bounded_json_bytes(
        envelope,
        maximum_bytes=NATIVE_CHILD_MAX_RESPONSE_BYTES,
        overflow_message="native child result exceeds the bounded transport",
    )
    connection.send_bytes(payload)


def _resolve_entrypoint(value: str):
    if type(value) is not str or _ENTRYPOINT_PATTERN.fullmatch(value) is None:
        raise _ChildTransportError(
            "native child entry point must be module.path:function_name"
        )
    module_name, function_name = value.split(":", 1)
    module = importlib.import_module(module_name)
    target = getattr(module, function_name, None)
    if target is None or not callable(target):
        raise _ChildTransportError("native child entry point is not callable")
    if getattr(target, _IN_PROCESS_ENTRYPOINT_MARKER, False) is not True:
        raise _ChildTransportError(
            "native child entry point must declare the in-process-only contract"
        )
    return target


def _receive_exact_child_ack(
    connection: Connection,
    *,
    expected: bytes,
    context: NativeChildContext,
    phase: str,
) -> None:
    """Receive one deadline-bounded exact ACK without an oversized read."""

    try:
        acknowledged = connection.poll(context.remaining_seconds())
    except (EOFError, OSError) as exc:
        raise _ChildTransportError(
            _bounded_diagnostic(
                "cannot wait for native child ",
                phase,
                " acknowledgement: ",
                _exception_summary(exc),
            )
        ) from exc
    if not acknowledged:
        raise AdapterError(
            _bounded_diagnostic(
                "native child ",
                phase,
                " acknowledgement exceeded the shared deadline",
            ),
            _TIMEOUT_CODE,
        )
    try:
        acknowledgement = connection.recv_bytes(len(expected))
    except (EOFError, OSError) as exc:
        raise _ChildTransportError(
            _bounded_diagnostic(
                "cannot receive native child ",
                phase,
                " acknowledgement: ",
                _exception_summary(exc),
            )
        ) from exc
    if acknowledgement != expected:
        raise _ChildTransportError(
            _bounded_diagnostic(
                "native child ",
                phase,
                " acknowledgement is invalid",
            )
        )


def _descriptor_snapshot(
    metadata: os.stat_result,
    descriptor: int,
    *,
    token: str,
) -> tuple[int, ...]:
    try:
        offset = os.lseek(descriptor, 0, os.SEEK_CUR)
    except OSError as exc:
        raise AdapterError(
            f"native pinned file {token} offset is unavailable",
            _INVALID_INPUT_CODE,
        ) from exc
    return (
        metadata.st_dev,
        metadata.st_ino,
        metadata.st_mode,
        metadata.st_size,
        metadata.st_mtime_ns,
        metadata.st_ctime_ns,
        offset,
    )


def _restore_descriptor_offset(
    descriptor: int,
    *,
    token: str,
    offset: int,
) -> None:
    try:
        os.lseek(descriptor, offset, os.SEEK_SET)
    except OSError as exc:
        raise AdapterError(
            f"native pinned file {token} shared offset could not be restored",
            _CLEANUP_FAILED_CODE,
        ) from exc


def _descriptor_access_mode(descriptor: int) -> int:
    try:
        import fcntl
    except ImportError as exc:  # pragma: no cover - POSIX platforms provide fcntl
        raise AdapterError(
            "native pinned file access-mode inspection is unavailable",
            _FAILED_CODE,
        ) from exc
    try:
        return fcntl.fcntl(descriptor, fcntl.F_GETFL) & os.O_ACCMODE
    except OSError as exc:
        raise AdapterError(
            "native pinned file descriptor flags are unavailable",
            _INVALID_INPUT_CODE,
        ) from exc


def _validate_pinned_descriptor(
    descriptor: int,
    *,
    token: str,
    expected_sha256: str,
    expected_size: int,
    remaining_seconds,
    expected_snapshot: tuple[int, ...] | None = None,
) -> tuple[int, ...]:
    """Verify one read-only regular descriptor without changing its offset."""

    try:
        remaining_seconds()
    except AdapterError:
        raise
    except BaseException as exc:
        raise AdapterError(
            "cannot inspect the native pinned file deadline",
            _FAILED_CODE,
        ) from exc
    if not hasattr(os, "pread"):
        raise AdapterError(
            "native pinned files require descriptor-relative reads",
            _FAILED_CODE,
        )
    try:
        before = os.fstat(descriptor)
    except OSError as exc:
        raise AdapterError(
            f"native pinned file {token} descriptor is unavailable",
            _INVALID_INPUT_CODE,
        ) from exc
    if not stat.S_ISREG(before.st_mode):
        raise AdapterError(
            f"native pinned file {token} must be a regular file",
            _INVALID_INPUT_CODE,
        )
    if _descriptor_access_mode(descriptor) != os.O_RDONLY:
        raise AdapterError(
            f"native pinned file {token} must be opened read-only",
            _INVALID_INPUT_CODE,
        )
    before_snapshot = _descriptor_snapshot(
        before,
        descriptor,
        token=token,
    )
    if expected_snapshot is not None and before_snapshot != expected_snapshot:
        if (
            len(expected_snapshot) == len(before_snapshot)
            and before_snapshot[-1] != expected_snapshot[-1]
        ):
            _restore_descriptor_offset(
                descriptor,
                token=token,
                offset=expected_snapshot[-1],
            )
        raise AdapterError(
            f"native pinned file {token} changed after transfer validation",
            _INVALID_INPUT_CODE,
        )
    if before.st_size != expected_size:
        raise AdapterError(
            f"native pinned file {token} size does not match its ledger",
            _INVALID_INPUT_CODE,
        )

    digest = hashlib.sha256()
    offset = 0
    while offset < expected_size:
        remaining_seconds()
        read_size = min(_PINNED_FILE_READ_BYTES, expected_size - offset)
        try:
            chunk = os.pread(descriptor, read_size, offset)
        except OSError as exc:
            raise AdapterError(
                f"native pinned file {token} could not be read",
                _INVALID_INPUT_CODE,
            ) from exc
        if not chunk:
            raise AdapterError(
                f"native pinned file {token} ended before its declared size",
                _INVALID_INPUT_CODE,
            )
        digest.update(chunk)
        offset += len(chunk)
    try:
        trailing = os.pread(descriptor, 1, expected_size)
        after = os.fstat(descriptor)
    except OSError as exc:
        raise AdapterError(
            f"native pinned file {token} final verification failed",
            _INVALID_INPUT_CODE,
        ) from exc
    if trailing:
        raise AdapterError(
            f"native pinned file {token} exceeds its declared size",
            _INVALID_INPUT_CODE,
        )
    after_snapshot = _descriptor_snapshot(
        after,
        descriptor,
        token=token,
    )
    if before_snapshot != after_snapshot:
        if before_snapshot[-1] != after_snapshot[-1]:
            _restore_descriptor_offset(
                descriptor,
                token=token,
                offset=before_snapshot[-1],
            )
        raise AdapterError(
            f"native pinned file {token} changed during verification",
            _INVALID_INPUT_CODE,
        )
    if digest.hexdigest() != expected_sha256:
        raise AdapterError(
            f"native pinned file {token} sha256 does not match its ledger",
            _INVALID_INPUT_CODE,
        )
    remaining_seconds()
    return after_snapshot


def _close_descriptors_safely(
    descriptors: Iterable[tuple[str, int]],
) -> tuple[str, ...]:
    errors: list[str] = []
    for token, descriptor in descriptors:
        try:
            os.close(descriptor)
        except BaseException as exc:
            errors.append(
                _bounded_diagnostic(
                    "cannot close native pinned file ",
                    token,
                    ": ",
                    _exception_summary(exc),
                    maximum_bytes=_MAX_CLEANUP_ERROR_BYTES,
                )
            )
    return tuple(errors)


def _prepare_pinned_files(
    values: Mapping[str, NativePinnedFile] | None,
    *,
    deadline: RefineDeadline,
) -> tuple[_PinnedFileTransfer, ...]:
    """Validate a closed ledger and duplicate its exact descriptors for transfer."""

    if values is None:
        return ()
    if type(values) is not dict:
        raise AdapterError(
            "native pinned files must be an exact token-to-file dictionary",
            _INVALID_INPUT_CODE,
        )
    count = dict.__len__(values)
    if count > NATIVE_CHILD_MAX_PINNED_FILES:
        raise AdapterError(
            "native pinned file count exceeds the transfer limit",
            _INVALID_INPUT_CODE,
        )

    try:
        rows = tuple(dict.items(values))
    except RuntimeError as exc:
        raise AdapterError(
            "native pinned file dictionary changed during validation",
            _INVALID_INPUT_CODE,
        ) from exc
    if len(rows) != count or dict.__len__(values) != count:
        raise AdapterError(
            "native pinned file dictionary changed during validation",
            _INVALID_INPUT_CODE,
        )
    for token, _value in rows:
        if type(token) is not str:
            raise AdapterError(
                "native pinned file tokens must be unique safe bounded strings",
                _INVALID_INPUT_CODE,
            )

    seen_descriptors: set[int] = set()
    declared_total_bytes = 0
    contracts: list[_PinnedFileTransfer] = []
    for token, value in sorted(rows, key=lambda item: item[0]):
        deadline.remaining_seconds()
        if (
            len(token) > NATIVE_CHILD_MAX_PINNED_TOKEN_BYTES
            or _PINNED_FILE_TOKEN_PATTERN.fullmatch(token) is None
        ):
            raise AdapterError(
                "native pinned file tokens must be unique safe bounded strings",
                _INVALID_INPUT_CODE,
            )
        if type(value) is not NativePinnedFile:
            raise AdapterError(
                f"native pinned file {token} has the wrong contract type",
                _INVALID_INPUT_CODE,
            )
        descriptor = value.descriptor
        expected_sha256 = value.sha256
        expected_size = value.size_bytes
        if (
            type(descriptor) is not int
            or descriptor < 0
            or descriptor in seen_descriptors
        ):
            raise AdapterError(
                "native pinned file descriptors must be unique non-negative integers",
                _INVALID_INPUT_CODE,
            )
        if (
            type(expected_sha256) is not str
            or re.fullmatch(r"[0-9a-f]{64}", expected_sha256) is None
            or type(expected_size) is not int
            or expected_size < 0
        ):
            raise AdapterError(
                f"native pinned file {token} has an invalid fingerprint ledger",
                _INVALID_INPUT_CODE,
            )
        if expected_size > NATIVE_CHILD_MAX_PINNED_FILE_BYTES:
            raise AdapterError(
                f"native pinned file {token} exceeds the per-file byte limit",
                _INVALID_INPUT_CODE,
            )
        declared_total_bytes += expected_size
        if declared_total_bytes > NATIVE_CHILD_MAX_PINNED_TOTAL_BYTES:
            raise AdapterError(
                "native pinned files exceed the aggregate byte limit",
                _INVALID_INPUT_CODE,
            )
        seen_descriptors.add(descriptor)
        contracts.append(
            _PinnedFileTransfer(
                token=token,
                descriptor=descriptor,
                sha256=expected_sha256,
                size_bytes=expected_size,
            )
        )

    seen_identities: set[tuple[int, int]] = set()
    prepared: list[_PinnedFileTransfer] = []
    try:
        for contract in contracts:
            deadline.remaining_seconds()
            try:
                duplicate = os.dup(contract.descriptor)
            except OSError as exc:
                raise AdapterError(
                    f"native pinned file {contract.token} could not be duplicated",
                    _INVALID_INPUT_CODE,
                ) from exc
            transfer = _PinnedFileTransfer(
                token=contract.token,
                descriptor=duplicate,
                sha256=contract.sha256,
                size_bytes=contract.size_bytes,
            )
            prepared.append(transfer)
            try:
                os.set_inheritable(duplicate, False)
            except OSError as exc:
                raise AdapterError(
                    (
                        f"native pinned file {contract.token} could not be made "
                        "non-inheritable"
                    ),
                    _FAILED_CODE,
                ) from exc
            snapshot = _validate_pinned_descriptor(
                duplicate,
                token=contract.token,
                expected_sha256=contract.sha256,
                expected_size=contract.size_bytes,
                remaining_seconds=deadline.remaining_seconds,
            )
            identity = (snapshot[0], snapshot[1])
            if identity in seen_identities:
                raise AdapterError(
                    "native pinned files must reference unique regular-file identities",
                    _INVALID_INPUT_CODE,
                )
            seen_identities.add(identity)
            prepared[-1] = _PinnedFileTransfer(
                token=contract.token,
                descriptor=duplicate,
                sha256=contract.sha256,
                size_bytes=contract.size_bytes,
                original_offset=snapshot[-1],
            )
    except BaseException as exc:
        close_errors = _close_descriptors_safely(
            (value.token, value.descriptor) for value in prepared
        )
        if close_errors:
            raise _cleanup_failed_error(
                "native pinned file preparation failed",
                close_errors,
            ) from exc
        raise
    return tuple(prepared)


def _validated_pinned_ledger(
    value: object,
) -> tuple[tuple[str, str, int], ...]:
    if type(value) is not tuple or len(value) > NATIVE_CHILD_MAX_PINNED_FILES:
        raise _ChildTransportError("native child pinned-file ledger is invalid")
    seen: set[str] = set()
    declared_total_bytes = 0
    rows: list[tuple[str, str, int]] = []
    for row in value:
        if type(row) is not tuple or len(row) != 3:
            raise _ChildTransportError("native child pinned-file ledger is invalid")
        token, expected_sha256, expected_size = row
        if (
            type(token) is not str
            or len(token) > NATIVE_CHILD_MAX_PINNED_TOKEN_BYTES
            or _PINNED_FILE_TOKEN_PATTERN.fullmatch(token) is None
            or token in seen
            or type(expected_sha256) is not str
            or re.fullmatch(r"[0-9a-f]{64}", expected_sha256) is None
            or type(expected_size) is not int
            or expected_size < 0
            or expected_size > NATIVE_CHILD_MAX_PINNED_FILE_BYTES
        ):
            raise _ChildTransportError("native child pinned-file ledger is invalid")
        declared_total_bytes += expected_size
        if declared_total_bytes > NATIVE_CHILD_MAX_PINNED_TOTAL_BYTES:
            raise _ChildTransportError(
                "native child pinned-file ledger exceeds its byte limit"
            )
        seen.add(token)
        rows.append((token, expected_sha256, expected_size))
    if tuple(sorted(seen)) != tuple(row[0] for row in rows):
        raise _ChildTransportError(
            "native child pinned-file ledger must use canonical token order"
        )
    return tuple(rows)


def _receive_pinned_files(
    connection: Connection | None,
    ledger: tuple[tuple[str, str, int], ...],
    *,
    context: NativeChildContext,
) -> tuple[Mapping[str, int], Mapping[str, tuple[int, ...]]]:
    """Receive and independently verify the parent's SCM_RIGHTS descriptors."""

    if not ledger:
        if connection is not None:
            raise _ChildTransportError(
                "native child received an unexpected pinned-file transport"
            )
        return MappingProxyType({}), MappingProxyType({})
    if connection is None:
        raise _ChildTransportError("native child pinned-file transport is unavailable")

    received: dict[str, int] = {}
    snapshots: dict[str, tuple[int, ...]] = {}
    seen_identities: set[tuple[int, int]] = set()
    try:
        from multiprocessing.reduction import recv_handle

        for token, expected_sha256, expected_size in ledger:
            if not connection.poll(context.remaining_seconds()):
                raise AdapterError(
                    "native pinned file transfer exceeded the shared deadline",
                    _TIMEOUT_CODE,
                )
            descriptor = recv_handle(connection)
            received[token] = descriptor
            os.set_inheritable(descriptor, False)
            snapshot = _validate_pinned_descriptor(
                descriptor,
                token=token,
                expected_sha256=expected_sha256,
                expected_size=expected_size,
                remaining_seconds=context.remaining_seconds,
            )
            identity = (snapshot[0], snapshot[1])
            if identity in seen_identities:
                raise AdapterError(
                    "native child pinned files repeat a regular-file identity",
                    _INVALID_INPUT_CODE,
                )
            seen_identities.add(identity)
            snapshots[token] = snapshot
    except BaseException as exc:
        close_errors = _close_descriptors_safely(received.items())
        if close_errors:
            raise AdapterError(
                _bounded_cleanup_report(
                    "native child pinned-file receipt failed",
                    close_errors,
                ),
                _CLEANUP_FAILED_CODE,
            ) from exc
        raise
    return MappingProxyType(received), MappingProxyType(snapshots)


def _child_entry(
    connection: Connection,
    pinned_connection: Connection | None,
    pinned_ledger: tuple[tuple[str, str, int], ...],
    workspace_connection: Connection | None,
    workspace_leased: bool,
    entrypoint: str,
    request_payload: bytes,
    expires_at_monotonic_s: float,
) -> None:
    """Spawn-safe fixed target; native modules are imported after ``setsid``."""

    received_files: Mapping[str, int] = MappingProxyType({})
    received_snapshots: Mapping[str, tuple[int, ...]] = MappingProxyType({})
    workspace_descriptor: int | None = None
    terminal: Mapping[str, Any] | None = None
    try:
        if os.name != "posix" or not hasattr(os, "setsid"):
            raise _ChildTransportError(
                "refine native child requires POSIX session isolation"
            )
        if workspace_leased is not True and workspace_leased is not False:
            raise _ChildTransportError(
                "native child workspace lease declaration must be an exact boolean"
            )
        os.setsid()
        pid = os.getpid()
        _send_envelope(
            connection,
            {
                "protocolVersion": _PROTOCOL_VERSION,
                "kind": "ready",
                "pid": pid,
                "processGroupId": os.getpgrp(),
                "sessionId": os.getsid(0),
                "pinnedFileCount": len(pinned_ledger),
                "workspaceLeased": workspace_leased,
            },
        )
        context = NativeChildContext(expires_at_monotonic_s)
        _receive_exact_child_ack(
            connection,
            expected=_ACK_READY,
            context=context,
            phase="readiness",
        )
        validated_ledger = _validated_pinned_ledger(pinned_ledger)
        received_files, received_snapshots = _receive_pinned_files(
            pinned_connection,
            validated_ledger,
            context=context,
        )
        workspace_descriptor = _receive_workspace_lease(
            workspace_connection,
            leased=workspace_leased,
            context=context,
        )
        context = _seal_native_child_context(
            NativeChildContext(
                expires_at_monotonic_s,
                received_files,
                workspace_descriptor,
            )
        )
        context.remaining_seconds()
        request = json.loads(request_payload.decode("utf-8"))
        if type(request) is not dict:
            raise _ChildTransportError(
                "native child request did not decode to an object"
            )
        target = _resolve_entrypoint(entrypoint)
        result = target(request, context)
        context.remaining_seconds()
        for token, expected_sha256, expected_size in validated_ledger:
            _validate_pinned_descriptor(
                received_files[token],
                token=token,
                expected_sha256=expected_sha256,
                expected_size=expected_size,
                remaining_seconds=context.remaining_seconds,
                expected_snapshot=received_snapshots[token],
            )
        terminal = {
            "protocolVersion": _PROTOCOL_VERSION,
            "kind": "result",
            "value": result,
        }
        _bounded_json_bytes(
            terminal,
            maximum_bytes=NATIVE_CHILD_MAX_RESPONSE_BYTES,
            overflow_message="native child result exceeds the bounded transport",
        )
    except BaseException as exc:
        terminal = _error_envelope(exc)
    finally:
        cleanup_errors = list(_close_descriptors_safely(received_files.items()))
        if workspace_descriptor is not None:
            cleanup_errors.extend(
                _close_descriptors_safely(
                    (("child workspace lease", workspace_descriptor),)
                )
            )
        if pinned_connection is not None:
            cleanup_errors.extend(
                _close_connections_safely((("child pinned-file", pinned_connection),))
            )
        if workspace_connection is not None:
            cleanup_errors.extend(
                _close_connections_safely(
                    (("child workspace lease", workspace_connection),)
                )
            )
        if cleanup_errors:
            terminal = _error_envelope(
                AdapterError(
                    _bounded_cleanup_report(
                        "native child pinned-file cleanup failed",
                        tuple(cleanup_errors),
                    ),
                    _CLEANUP_FAILED_CODE,
                )
            )

    if terminal is None:  # pragma: no cover - every path sets a terminal envelope
        terminal = _error_envelope(
            AdapterError("native child produced no terminal result", _FAILED_CODE)
        )
    try:
        _send_envelope(connection, terminal)
    except BaseException:
        try:
            connection.close()
        except BaseException:
            pass
        return

    protocol_rejected = False
    try:
        context = NativeChildContext(expires_at_monotonic_s)
        _receive_exact_child_ack(
            connection,
            expected=_ACK_ACCEPT,
            context=context,
            phase="result",
        )
    except BaseException:
        protocol_rejected = True
    finally:
        try:
            connection.close()
        except BaseException:
            protocol_rejected = True
    if protocol_rejected:
        raise SystemExit(_CHILD_PROTOCOL_REJECT_EXIT_CODE)


def _receive_envelope(
    connection: Connection,
    process: multiprocessing.Process,
    deadline: RefineDeadline,
) -> Mapping[str, Any]:
    timeout_s = deadline.remaining_seconds()
    try:
        ready = wait((connection, process.sentinel), timeout=timeout_s)
    except OSError as exc:
        raise AdapterError(
            _bounded_diagnostic(
                "cannot wait for refine native child response: ",
                _exception_summary(exc),
            ),
            _FAILED_CODE,
        ) from exc
    if not ready:
        raise _ChildBoundaryTimeout
    if connection not in ready:
        try:
            response_ready = connection.poll(0)
        except OSError as exc:
            raise AdapterError(
                _bounded_diagnostic(
                    "cannot inspect refine native child response: ",
                    _exception_summary(exc),
                ),
                _FAILED_CODE,
            ) from exc
        if not response_ready:
            raise AdapterError(
                "refine native child exited before its response",
                _FAILED_CODE,
            )
    try:
        payload = connection.recv_bytes(NATIVE_CHILD_MAX_RESPONSE_BYTES)
        envelope = json.loads(payload.decode("utf-8"))
    except (EOFError, OSError, UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise AdapterError(
            _bounded_diagnostic(
                "refine native child returned an invalid bounded response: ",
                _exception_summary(exc),
            ),
            _FAILED_CODE,
        ) from exc
    if type(envelope) is not dict:
        raise AdapterError(
            "refine native child response must be a JSON object",
            _FAILED_CODE,
        )
    if envelope.get("protocolVersion") != _PROTOCOL_VERSION:
        raise AdapterError(
            "refine native child response has an unsupported protocol version",
            _FAILED_CODE,
        )
    return envelope


def _parse_linux_process_stat(payload: bytes) -> tuple[int, int]:
    """Parse the PID and process-group fields from one bounded procfs stat row."""

    if type(payload) is not bytes or len(payload) == 0 or len(payload) > 8192:
        raise ValueError("Linux process stat payload is invalid")
    opening = payload.find(b" (")
    closing = payload.rfind(b") ")
    if opening <= 0 or closing <= opening:
        raise ValueError("Linux process stat payload is malformed")
    prefix = payload[:opening]
    fields = payload[closing + 2 :].split()
    if not prefix.isdigit() or len(fields) < 3:
        raise ValueError("Linux process stat fields are malformed")
    pid = int(prefix)
    process_group_id = int(fields[2])
    if pid <= 0 or process_group_id <= 0:
        raise ValueError("Linux process stat identifiers are invalid")
    return pid, process_group_id


def _read_linux_process_stat(path: str) -> tuple[int, int]:
    flags = os.O_RDONLY
    if hasattr(os, "O_CLOEXEC"):
        flags |= os.O_CLOEXEC
    descriptor = os.open(path, flags)
    try:
        payload = os.read(descriptor, 8193)
    finally:
        os.close(descriptor)
    return _parse_linux_process_stat(payload)


def _linux_process_group_members(
    group_leader_pid: int,
    *,
    deadline: RefineDeadline,
) -> tuple[int, ...]:
    """Inspect the frozen Linux group while its unreaped leader reserves the PGID."""

    members: list[int] = []
    try:
        entries = os.scandir("/proc")
    except OSError as exc:
        raise AdapterError(
            _bounded_diagnostic(
                "cannot enumerate Linux process groups: ",
                _exception_summary(exc),
            ),
            _CLEANUP_FAILED_CODE,
        ) from exc
    with entries:
        for entry in entries:
            deadline.remaining_seconds()
            name = entry.name
            if type(name) is not str or not name.isdecimal():
                continue
            pid = int(name)
            if pid == group_leader_pid:
                continue
            try:
                reported_pid, process_group_id = _read_linux_process_stat(
                    f"/proc/{name}/stat"
                )
            except (FileNotFoundError, ProcessLookupError):
                continue
            except (OSError, ValueError) as exc:
                raise AdapterError(
                    _bounded_diagnostic(
                        "cannot inspect Linux process group member: ",
                        _exception_summary(exc),
                    ),
                    _CLEANUP_FAILED_CODE,
                ) from exc
            if reported_pid != pid:
                raise AdapterError(
                    "Linux process stat changed identity during group inspection",
                    _CLEANUP_FAILED_CODE,
                )
            if process_group_id == group_leader_pid:
                members.append(pid)
                if len(members) >= 4:
                    break
    return tuple(members)


def _success_group_quiescence_errors(
    *,
    group_leader_pid: int,
    deadline: RefineDeadline,
) -> tuple[str, ...]:
    """Freeze and inspect a successful child's group before reaping its leader."""

    deadline.remaining_seconds()
    try:
        os.killpg(group_leader_pid, signal.SIGSTOP)
    except ProcessLookupError:
        return ()
    except PermissionError as exc:
        if sys.platform == "darwin":
            # Darwin reports EPERM when the group contains only our dead,
            # unreaped leader. Every live descendant of this unprivileged child
            # retains our uid and would make the group signal succeed.
            return ()
        return (
            _bounded_diagnostic(
                "cannot freeze successful native child process group: ",
                _exception_summary(exc),
            ),
        )
    except OSError as exc:
        return (
            _bounded_diagnostic(
                "cannot freeze successful native child process group: ",
                _exception_summary(exc),
            ),
        )

    if sys.platform.startswith("linux"):
        # Repeat after the first scan. A descendant racing fork with SIGSTOP
        # cannot keep spawning once stopped; the second frozen snapshot closes
        # that delivery window while the unreaped leader still reserves PGID.
        for _attempt in range(2):
            members = _linux_process_group_members(
                group_leader_pid,
                deadline=deadline,
            )
            if members:
                return ("native child process group retains descendant members",)
            time.sleep(0)
        return ()
    if sys.platform == "darwin":
        return ("native child process group retains a live descendant",)
    return ("successful native child process-group inspection is unsupported",)


def _signal_group(
    group_leader_pid: int,
    sig: signal.Signals,
) -> OSError | None:
    try:
        os.killpg(group_leader_pid, sig)
    except ProcessLookupError:
        return None
    except OSError as exc:
        return exc
    return None


def _signal_error(sig: signal.Signals, exc: OSError) -> str:
    if sig is signal.SIGTERM:
        signal_label = "SIGTERM"
    elif sig is signal.SIGKILL:
        signal_label = "SIGKILL"
    else:
        signal_label = "signal"
    return _bounded_diagnostic(
        "cannot signal native child process group with ",
        signal_label,
        ": ",
        _exception_summary(exc),
    )


def _reap_proven_quiescent_leader(
    process: multiprocessing.Process,
) -> tuple[str, ...]:
    """Reap only the known leader after its group was frozen and proven empty."""

    errors: list[str] = []
    try:
        process.join(NATIVE_CHILD_KILL_REAP_S)
    except BaseException as exc:
        errors.append(
            _bounded_diagnostic(
                "cannot retry joining quiescent native child leader: ",
                _exception_summary(exc),
            )
        )
    try:
        leader_alive = process.is_alive()
    except BaseException as exc:
        errors.append(
            _bounded_diagnostic(
                "cannot inspect quiescent native child leader: ",
                _exception_summary(exc),
            )
        )
        leader_alive = True
    if leader_alive:
        try:
            process.kill()
        except BaseException as exc:
            errors.append(
                _bounded_diagnostic(
                    "cannot kill quiescent native child leader directly: ",
                    _exception_summary(exc),
                )
            )
        try:
            process.join(NATIVE_CHILD_KILL_REAP_S)
        except BaseException as exc:
            errors.append(
                _bounded_diagnostic(
                    "cannot join killed quiescent native child leader: ",
                    _exception_summary(exc),
                )
            )
    try:
        if process.is_alive():
            errors.append("quiescent native child leader could not be reaped")
    except BaseException as exc:
        errors.append(
            _bounded_diagnostic(
                "cannot confirm quiescent native child leader exit: ",
                _exception_summary(exc),
            )
        )
    return tuple(errors)


def _terminate_and_reap(
    process: multiprocessing.Process,
    *,
    group_leader_pid: int | None,
) -> tuple[str, ...]:
    """Bounded TERM/KILL cleanup; the direct session leader is always joined."""

    errors: list[str] = []
    if group_leader_pid is not None:
        error = _signal_group(group_leader_pid, signal.SIGTERM)
        if error is not None:
            errors.append(_signal_error(signal.SIGTERM, error))
        # Do not poll/join the leader before the final group signal: retaining
        # the unreaped leader prevents its PID/process-group ID being reused.
        time.sleep(NATIVE_CHILD_TERM_GRACE_S)
        error = _signal_group(group_leader_pid, signal.SIGKILL)
        if error is not None:
            message = _signal_error(signal.SIGKILL, error)
            if not (sys.platform == "darwin" and isinstance(error, PermissionError)):
                errors.append(message)
            # Darwin reports EPERM when the group contains only our dead,
            # unreaped leader. Every live descendant of this unprivileged
            # child retains our uid, so a live descendant would make the
            # signal succeed. Resolve that case while the leader still
            # reserves the PGID; never defer a numeric-PGID probe past reap.
    else:
        try:
            process.terminate()
        except (AttributeError, ProcessLookupError, OSError) as exc:
            errors.append(
                _bounded_diagnostic(
                    "cannot terminate native child before session setup: ",
                    _exception_summary(exc),
                )
            )

    try:
        process.join(NATIVE_CHILD_KILL_REAP_S)
    except (AssertionError, OSError, ValueError) as exc:
        errors.append(
            _bounded_diagnostic(
                "cannot join native child leader: ",
                _exception_summary(exc),
            )
        )
    try:
        leader_alive = process.is_alive()
    except (AssertionError, OSError, ValueError) as exc:
        errors.append(
            _bounded_diagnostic(
                "cannot inspect native child leader: ",
                _exception_summary(exc),
            )
        )
        leader_alive = True
    if leader_alive:
        try:
            process.kill()
        except (
            AttributeError,
            ProcessLookupError,
            AssertionError,
            OSError,
            ValueError,
        ) as exc:
            errors.append(
                _bounded_diagnostic(
                    "cannot kill native child leader: ",
                    _exception_summary(exc),
                )
            )
        try:
            process.join(NATIVE_CHILD_KILL_REAP_S)
        except (AssertionError, OSError, ValueError) as exc:
            errors.append(
                _bounded_diagnostic(
                    "cannot join killed native child leader: ",
                    _exception_summary(exc),
                )
            )
    try:
        leader_alive = process.is_alive()
    except (AssertionError, OSError, ValueError) as exc:
        errors.append(
            _bounded_diagnostic(
                "cannot confirm native child leader exit: ",
                _exception_summary(exc),
            )
        )
        leader_alive = True
    if leader_alive:
        errors.append("native child session leader could not be reaped")
    return tuple(errors)


def _exception_summary(exc: BaseException, *, maximum_bytes: int = 1024) -> str:
    label, message = _safe_exception_details(exc)
    if message is None:
        return _truncate_utf8(label, maximum_bytes)
    return _bounded_diagnostic(
        label,
        ": ",
        message,
        maximum_bytes=maximum_bytes,
    )


def _emergency_kill_and_reap(
    process: multiprocessing.Process,
    *,
    group_leader_pid: int | None,
) -> tuple[str, ...]:
    """Independent last-resort SIGKILL + reap after primary cleanup crashes."""

    errors: list[str] = []
    if group_leader_pid is not None:
        try:
            os.killpg(group_leader_pid, signal.SIGKILL)
        except ProcessLookupError:
            pass
        except BaseException as exc:
            errors.append(
                _bounded_diagnostic(
                    "emergency process-group SIGKILL failed: ",
                    _exception_summary(exc),
                )
            )
    else:
        try:
            process.kill()
        except ProcessLookupError:
            pass
        except BaseException as exc:
            errors.append(
                _bounded_diagnostic(
                    "emergency native child kill failed: ",
                    _exception_summary(exc),
                )
            )

    try:
        process.join(NATIVE_CHILD_KILL_REAP_S)
    except BaseException as exc:
        errors.append(
            _bounded_diagnostic(
                "emergency native child join failed: ",
                _exception_summary(exc),
            )
        )
    try:
        leader_alive = process.is_alive()
    except BaseException as exc:
        errors.append(
            _bounded_diagnostic(
                "emergency native child liveness check failed: ",
                _exception_summary(exc),
            )
        )
        leader_alive = True
    if leader_alive:
        try:
            process.kill()
        except ProcessLookupError:
            pass
        except BaseException as exc:
            errors.append(
                _bounded_diagnostic(
                    "emergency direct leader SIGKILL failed: ",
                    _exception_summary(exc),
                )
            )
        try:
            process.join(NATIVE_CHILD_KILL_REAP_S)
        except BaseException as exc:
            errors.append(
                _bounded_diagnostic(
                    "emergency killed leader join failed: ",
                    _exception_summary(exc),
                )
            )
    try:
        leader_alive = process.is_alive()
    except BaseException as exc:
        errors.append(
            _bounded_diagnostic(
                "emergency final leader liveness check failed: ",
                _exception_summary(exc),
            )
        )
        leader_alive = True
    if leader_alive:
        errors.append("emergency cleanup could not reap native child leader")

    return tuple(errors)


def _verify_cleanup_complete(
    process: multiprocessing.Process,
    *,
    group_leader_pid: int | None,
) -> tuple[str, ...]:
    """Prove the direct child is gone without addressing a possibly reused PGID.

    All process-group signals happen before the direct leader can be reaped.
    Once cleanup reaches this verifier, the numeric group identifier is no
    longer safe to inspect or signal and is intentionally ignored.
    """

    errors: list[str] = []
    leader_alive: bool | None = None
    try:
        process.join(0)
    except BaseException as exc:
        errors.append(
            _bounded_diagnostic(
                "cannot nonblocking-join native child during cleanup verification: ",
                _exception_summary(exc),
            )
        )
    try:
        leader_alive = process.is_alive()
    except BaseException as exc:
        errors.append(
            _bounded_diagnostic(
                "cannot inspect native child during cleanup verification: ",
                _exception_summary(exc),
            )
        )
    else:
        if leader_alive:
            errors.append(
                "native child leader remains alive after cleanup verification"
            )

    return tuple(errors)


def _normalize_cleanup_errors(errors: Any) -> tuple[str, ...] | None:
    if type(errors) is not tuple:
        return None
    count = tuple.__len__(errors)
    if count > _MAX_CLEANUP_ERRORS:
        return None
    normalized: list[str] = []
    for index in range(count):
        error = tuple.__getitem__(errors, index)
        if type(error) is not str or len(error) == 0:
            return None
        normalized.append(_truncate_utf8(error, _MAX_CLEANUP_ERROR_BYTES))
    return tuple(normalized)


def _cleanup_verification_errors(
    process: multiprocessing.Process,
    *,
    group_leader_pid: int | None,
) -> tuple[str, ...]:
    try:
        errors = _verify_cleanup_complete(
            process,
            group_leader_pid=group_leader_pid,
        )
    except BaseException as exc:
        return (
            _bounded_diagnostic(
                "native child cleanup verification raised ",
                _exception_summary(exc),
            ),
        )
    normalized = _normalize_cleanup_errors(errors)
    if normalized is None:
        return ("native child cleanup verification returned an invalid report",)
    return normalized


def _emergency_cleanup_errors(
    process: multiprocessing.Process,
    *,
    group_leader_pid: int | None,
) -> tuple[str, ...]:
    try:
        errors = _emergency_kill_and_reap(
            process,
            group_leader_pid=group_leader_pid,
        )
    except BaseException as exc:
        return (
            _bounded_diagnostic(
                "emergency native child cleanup raised ",
                _exception_summary(exc),
            ),
        )
    normalized = _normalize_cleanup_errors(errors)
    if normalized is None:
        return ("emergency native child cleanup returned an invalid report",)
    return normalized


def _leader_exit_observed_without_reap(
    process: multiprocessing.Process,
) -> tuple[bool | None, tuple[str, ...]]:
    """Observe the child sentinel without calling waitpid or releasing its PID."""

    try:
        sentinel = process.sentinel
        exited = wait((sentinel,), timeout=0)
    except BaseException as exc:
        return (
            None,
            (
                _bounded_diagnostic(
                    "cannot inspect native child sentinel before emergency cleanup: ",
                    _exception_summary(exc),
                ),
            ),
        )
    return bool(exited), ()


def _bounded_cleanup_report(
    message: str,
    cleanup_errors: tuple[str, ...],
) -> str:
    safe_message = _truncate_utf8(
        (message if type(message) is str else "refine native boundary cleanup failed"),
        NATIVE_CHILD_MAX_ERROR_BYTES,
    )
    normalized = _normalize_cleanup_errors(cleanup_errors)
    if normalized is None:
        normalized = ("native child cleanup returned an invalid uncertainty report",)
    parts: list[str] = [safe_message]
    if normalized:
        parts.append("; cleanup: ")
        for index, error in enumerate(normalized):
            if index:
                parts.append("; ")
            parts.append(error)
    return _bounded_diagnostic(*parts)


def _cleanup_process(
    process: multiprocessing.Process,
    *,
    group_leader_pid: int | None,
) -> tuple[str, ...]:
    """Run cleanup, prove its result, and fail closed on every uncertainty."""

    force_emergency = False
    try:
        errors = _terminate_and_reap(
            process,
            group_leader_pid=group_leader_pid,
        )
    except BaseException as exc:
        primary_errors = (
            _bounded_diagnostic(
                "native child cleanup raised ",
                _exception_summary(exc),
            ),
        )
        force_emergency = True
    else:
        normalized_errors = _normalize_cleanup_errors(errors)
        if normalized_errors is None:
            primary_errors = (
                "native child cleanup returned an invalid uncertainty report",
            )
            force_emergency = True
        else:
            primary_errors = normalized_errors

    # Decide whether a group signal is still identity-safe before any verifier
    # can join/reap the direct leader. If the sentinel is not ready, our live
    # child still owns its PID/PGID and an immediate group SIGKILL is safe. If
    # exit is already observable, primary cleanup may have reaped it; from that
    # point onward emergency cleanup is leader-only and no numeric PGID is ever
    # addressed again.
    exit_observed, observation_errors = _leader_exit_observed_without_reap(process)
    if exit_observed is False:
        observation_errors = (
            *observation_errors,
            "native child leader remains alive after cleanup verification",
        )
    emergency_group_leader_pid = group_leader_pid if exit_observed is False else None
    emergency_errors: tuple[str, ...] = ()
    emergency_attempted = force_emergency or exit_observed is not True
    if emergency_attempted:
        emergency_errors = _emergency_cleanup_errors(
            process,
            group_leader_pid=emergency_group_leader_pid,
        )

    verification_errors = _cleanup_verification_errors(
        process,
        group_leader_pid=None,
    )
    if verification_errors and not emergency_attempted:
        # Verification runs only after all identity-safe group work. A retry may
        # address the direct process object, but never the old numeric PGID.
        emergency_errors = _emergency_cleanup_errors(
            process,
            group_leader_pid=None,
        )
        verification_errors = (
            *verification_errors,
            *_cleanup_verification_errors(
                process,
                group_leader_pid=None,
            ),
        )

    combined = (
        *primary_errors,
        *observation_errors,
        *emergency_errors,
        *verification_errors,
    )
    normalized_combined = _normalize_cleanup_errors(combined)
    if normalized_combined is None:
        return ("native child cleanup produced excessive uncertainty",)
    return normalized_combined


def _cleanup_failed_error(
    message: str,
    cleanup_errors: tuple[str, ...],
) -> AdapterError:
    return AdapterError(
        _bounded_cleanup_report(message, cleanup_errors),
        _CLEANUP_FAILED_CODE,
    )


def _timeout_error(cleanup_errors: tuple[str, ...]) -> AdapterError:
    normalized = _normalize_cleanup_errors(cleanup_errors)
    if normalized is None:
        return _cleanup_failed_error(
            "refine native engine child exceeded the shared deadline",
            ("native child cleanup returned an invalid uncertainty report",),
        )
    if normalized:
        return _cleanup_failed_error(
            "refine native engine child exceeded the shared deadline",
            normalized,
        )
    return AdapterError(
        "refine native engine child exceeded the shared deadline",
        _TIMEOUT_CODE,
    )


def _close_connections_safely(
    connections: tuple[tuple[str, Any], ...],
) -> tuple[str, ...]:
    errors: list[str] = []
    for label, connection in connections:
        try:
            connection.close()
        except BaseException as exc:
            errors.append(
                _bounded_diagnostic(
                    "cannot close ",
                    label,
                    " native child transport: ",
                    _exception_summary(exc),
                )
            )
    return tuple(errors)


def _add_cleanup_note(exc: BaseException, errors: tuple[str, ...]) -> None:
    note = _bounded_cleanup_report(
        "non-masking native boundary cleanup report",
        errors,
    )
    try:
        BaseException.add_note(exc, note)
    except BaseException:
        return


def _send_pinned_files(
    connection: Connection | None,
    transfers: tuple[_PinnedFileTransfer, ...],
    *,
    destination_pid: int,
    deadline: RefineDeadline,
) -> None:
    if not transfers:
        if connection is not None:
            raise AdapterError(
                "native pinned-file transport exists without a ledger",
                _FAILED_CODE,
            )
        return
    if connection is None:
        raise AdapterError(
            "native pinned-file transport is unavailable",
            _FAILED_CODE,
        )
    try:
        from multiprocessing.reduction import send_handle

        for transfer in transfers:
            deadline.remaining_seconds()
            send_handle(connection, transfer.descriptor, destination_pid)
        deadline.remaining_seconds()
    except AdapterError:
        raise
    except OSError as exc:
        raise AdapterError(
            _bounded_diagnostic(
                "cannot transfer native pinned file descriptor: ",
                _exception_summary(exc),
            ),
            _FAILED_CODE,
        ) from exc


def _restore_transfer_offsets_safely(
    transfers: Iterable[_PinnedFileTransfer],
) -> tuple[str, ...]:
    """Restore shared open-file-description offsets before parent fd close."""

    errors: list[str] = []
    for transfer in transfers:
        original_offset = transfer.original_offset
        if original_offset is None:
            continue
        try:
            current_offset = os.lseek(
                transfer.descriptor,
                0,
                os.SEEK_CUR,
            )
        except OSError as exc:
            errors.append(
                _bounded_diagnostic(
                    "cannot inspect native pinned file ",
                    transfer.token,
                    " shared offset during parent cleanup: ",
                    _exception_summary(exc),
                    maximum_bytes=_MAX_CLEANUP_ERROR_BYTES,
                )
            )
            continue
        if current_offset == original_offset:
            continue
        try:
            os.lseek(
                transfer.descriptor,
                original_offset,
                os.SEEK_SET,
            )
        except OSError as exc:
            errors.append(
                _bounded_diagnostic(
                    "cannot restore native pinned file ",
                    transfer.token,
                    " shared offset during parent cleanup: ",
                    _exception_summary(exc),
                    maximum_bytes=_MAX_CLEANUP_ERROR_BYTES,
                )
            )
            continue
        errors.append(
            _bounded_diagnostic(
                "native pinned file ",
                transfer.token,
                " changed its shared offset; parent cleanup restored it",
                maximum_bytes=_MAX_CLEANUP_ERROR_BYTES,
            )
        )
    return tuple(errors)


_WORKSPACE_REQUIRED_DIR_FD_FUNCTIONS = (
    os.open,
    os.mkdir,
    os.stat,
    os.unlink,
    os.rmdir,
    os.rename,
)


def _require_workspace_platform_capabilities() -> None:
    """Refuse a workspace lease unless every removal can stay descriptor-bound."""

    try:
        supported = (
            os.name == "posix"
            and all(
                hasattr(os, constant)
                for constant in ("O_RDONLY", "O_DIRECTORY", "O_NOFOLLOW", "O_CLOEXEC")
            )
            and os.O_DIRECTORY != 0
            and os.O_NOFOLLOW != 0
            and hasattr(os, "supports_dir_fd")
            and all(
                function in os.supports_dir_fd
                for function in _WORKSPACE_REQUIRED_DIR_FD_FUNCTIONS
            )
            and hasattr(os, "supports_fd")
            and os.listdir in os.supports_fd
            and hasattr(os, "supports_follow_symlinks")
            and os.stat in os.supports_follow_symlinks
        )
    except BaseException:  # noqa: BLE001 - platform inspection must fail closed
        supported = False
    if not supported:
        raise AdapterError(
            "native workspace leases require descriptor-relative directory support",
            _FAILED_CODE,
        )


def _workspace_directory_flags() -> int:
    return os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW | os.O_CLOEXEC


def _workspace_scratch_name(prefix: str) -> str:
    return prefix + secrets.token_hex(16)


def _close_workspace_descriptors(
    descriptors: tuple[tuple[str, int | None], ...],
) -> tuple[str, ...]:
    return _close_descriptors_safely(
        (label, descriptor)
        for label, descriptor in descriptors
        if type(descriptor) is int
    )


def provision_native_workspace_lease(
    parent_directory: str,
    *,
    deadline: RefineDeadline,
) -> NativeWorkspaceLease:
    """Create one private 0700 workspace and pin it plus its container by fd."""

    _require_workspace_platform_capabilities()
    deadline.remaining_seconds()
    if type(parent_directory) is not str or not parent_directory:
        raise AdapterError(
            "native workspace parent directory must be a non-empty path",
            _INVALID_INPUT_CODE,
        )
    flags = _workspace_directory_flags()
    parent_descriptor: int | None = None
    workspace_descriptor: int | None = None
    name: str | None = None
    try:
        parent_descriptor = os.open(parent_directory, flags)
        os.set_inheritable(parent_descriptor, False)
        parent_metadata = os.fstat(parent_descriptor)
        parent_mode = stat.S_IMODE(parent_metadata.st_mode)
        if (
            not stat.S_ISDIR(parent_metadata.st_mode)
            or parent_metadata.st_uid != os.geteuid()
        ):
            raise AdapterError(
                "native workspace parent directory must be an owned directory",
                _INVALID_INPUT_CODE,
            )
        if (
            parent_mode & (stat.S_IWGRP | stat.S_IWOTH)
            and not parent_mode & stat.S_ISVTX
        ):
            # A non-sticky group/world-writable container lets a foreign account
            # rename the leased workspace out from under its pinned descriptor.
            raise AdapterError(
                "native workspace parent directory is unsafely writable",
                _INVALID_INPUT_CODE,
            )
        for _attempt in range(NATIVE_WORKSPACE_NAME_ATTEMPTS):
            deadline.remaining_seconds()
            candidate = _workspace_scratch_name(NATIVE_WORKSPACE_NAME_PREFIX)
            try:
                os.mkdir(candidate, mode=0o700, dir_fd=parent_descriptor)
            except FileExistsError:
                continue
            name = candidate
            break
        if name is None:
            raise AdapterError(
                "cannot create a unique native workspace lease",
                _FAILED_CODE,
            )
        workspace_descriptor = os.open(name, flags, dir_fd=parent_descriptor)
        os.set_inheritable(workspace_descriptor, False)
        metadata = os.fstat(workspace_descriptor)
        named_metadata = os.stat(
            name,
            dir_fd=parent_descriptor,
            follow_symlinks=False,
        )
        if (
            not stat.S_ISDIR(metadata.st_mode)
            or metadata.st_uid != os.geteuid()
            or stat.S_IMODE(metadata.st_mode) != 0o700
            or (metadata.st_dev, metadata.st_ino)
            != (named_metadata.st_dev, named_metadata.st_ino)
            or metadata.st_dev != parent_metadata.st_dev
            or os.listdir(workspace_descriptor)
        ):
            raise AdapterError(
                "native workspace lease is not a fresh private directory",
                _FAILED_CODE,
            )
    except BaseException as exc:
        cleanup_errors: list[str] = []
        if name is not None and parent_descriptor is not None:
            try:
                os.rmdir(name, dir_fd=parent_descriptor)
            except OSError as cleanup_exc:
                cleanup_errors.append(
                    _bounded_diagnostic(
                        "cannot remove a failed native workspace lease: ",
                        _exception_summary(cleanup_exc),
                        maximum_bytes=_MAX_CLEANUP_ERROR_BYTES,
                    )
                )
        cleanup_errors.extend(
            _close_workspace_descriptors(
                (
                    ("failed workspace lease", workspace_descriptor),
                    ("failed workspace lease container", parent_descriptor),
                )
            )
        )
        if cleanup_errors:
            raise _cleanup_failed_error(
                "native workspace lease provisioning failed",
                tuple(cleanup_errors),
            ) from exc
        if type(exc) is AdapterError:
            raise
        if isinstance(exc, OSError):
            raise AdapterError(
                _bounded_diagnostic(
                    "cannot provision a private native workspace lease: ",
                    _exception_summary(exc),
                ),
                _FAILED_CODE,
            ) from exc
        raise
    return NativeWorkspaceLease(
        parent_descriptor,
        name,
        workspace_descriptor,
        (metadata.st_dev, metadata.st_ino),
        os.path.join(parent_directory, name),
    )


def _purge_leased_entry(
    directory_descriptor: int,
    name: str,
    *,
    root_device: int,
    depth: int,
    budget: list[int],
    errors: list[str],
) -> None:
    """Remove one entry without ever unlinking a changed or escaped identity.

    Each entry is first renamed to an unguessable quarantine name inside the
    same pinned directory.  Only after the quarantined name re-resolves to the
    exact identity observed before the rename is it unlinked, so a hostile
    same-UID actor can no longer control which name the final removal targets.
    """

    if type(name) is not str or name in (".", "..") or "/" in name or not name:
        errors.append("leased native workspace entry name is not a safe component")
        return
    try:
        before = os.stat(name, dir_fd=directory_descriptor, follow_symlinks=False)
    except FileNotFoundError:
        return
    except OSError as exc:
        errors.append(
            _bounded_diagnostic(
                "cannot inspect a leased native workspace entry: ",
                _exception_summary(exc),
                maximum_bytes=_MAX_CLEANUP_ERROR_BYTES,
            )
        )
        return
    identity = (before.st_dev, before.st_ino)
    if before.st_dev != root_device:
        errors.append("leased native workspace entry crosses a filesystem boundary")
        return
    quarantine = _workspace_scratch_name(NATIVE_WORKSPACE_QUARANTINE_PREFIX)
    try:
        os.rename(
            name,
            quarantine,
            src_dir_fd=directory_descriptor,
            dst_dir_fd=directory_descriptor,
        )
    except FileNotFoundError:
        return
    except OSError as exc:
        errors.append(
            _bounded_diagnostic(
                "cannot quarantine a leased native workspace entry: ",
                _exception_summary(exc),
                maximum_bytes=_MAX_CLEANUP_ERROR_BYTES,
            )
        )
        return
    try:
        quarantined = os.stat(
            quarantine,
            dir_fd=directory_descriptor,
            follow_symlinks=False,
        )
    except OSError as exc:
        errors.append(
            _bounded_diagnostic(
                "cannot inspect a quarantined native workspace entry: ",
                _exception_summary(exc),
                maximum_bytes=_MAX_CLEANUP_ERROR_BYTES,
            )
        )
        return
    if (quarantined.st_dev, quarantined.st_ino) != identity:
        errors.append("leased native workspace entry identity changed before removal")
        return
    if stat.S_ISDIR(quarantined.st_mode):
        child_descriptor: int | None = None
        try:
            child_descriptor = os.open(
                quarantine,
                _workspace_directory_flags(),
                dir_fd=directory_descriptor,
            )
            child_metadata = os.fstat(child_descriptor)
            if (child_metadata.st_dev, child_metadata.st_ino) != identity:
                errors.append(
                    "leased native workspace directory identity changed before removal"
                )
                return
            _purge_leased_directory(
                child_descriptor,
                root_device=root_device,
                depth=depth + 1,
                budget=budget,
                errors=errors,
            )
        except OSError as exc:
            errors.append(
                _bounded_diagnostic(
                    "cannot open a quarantined native workspace directory: ",
                    _exception_summary(exc),
                    maximum_bytes=_MAX_CLEANUP_ERROR_BYTES,
                )
            )
            return
        finally:
            if child_descriptor is not None:
                errors.extend(
                    _close_workspace_descriptors(
                        (("quarantined native workspace directory", child_descriptor),)
                    )
                )
        try:
            os.rmdir(quarantine, dir_fd=directory_descriptor)
        except FileNotFoundError:
            return
        except OSError as exc:
            errors.append(
                _bounded_diagnostic(
                    "cannot remove a quarantined native workspace directory: ",
                    _exception_summary(exc),
                    maximum_bytes=_MAX_CLEANUP_ERROR_BYTES,
                )
            )
        return
    try:
        os.unlink(quarantine, dir_fd=directory_descriptor)
    except FileNotFoundError:
        return
    except OSError as exc:
        errors.append(
            _bounded_diagnostic(
                "cannot remove a quarantined native workspace entry: ",
                _exception_summary(exc),
                maximum_bytes=_MAX_CLEANUP_ERROR_BYTES,
            )
        )


def _purge_leased_directory(
    directory_descriptor: int,
    *,
    root_device: int,
    depth: int,
    budget: list[int],
    errors: list[str],
) -> None:
    """Empty one pinned directory within a fixed depth and entry budget."""

    if depth > NATIVE_WORKSPACE_MAX_DEPTH:
        errors.append("leased native workspace exceeds its bounded cleanup depth")
        return
    try:
        names = os.listdir(directory_descriptor)
    except OSError as exc:
        errors.append(
            _bounded_diagnostic(
                "cannot enumerate a leased native workspace directory: ",
                _exception_summary(exc),
                maximum_bytes=_MAX_CLEANUP_ERROR_BYTES,
            )
        )
        return
    if len(names) > NATIVE_WORKSPACE_MAX_ENTRIES:
        errors.append(
            "leased native workspace directory exceeds its bounded entry count"
        )
        return
    for name in names:
        if budget[0] <= 0:
            errors.append("leased native workspace cleanup exhausted its entry budget")
            return
        budget[0] -= 1
        _purge_leased_entry(
            directory_descriptor,
            name,
            root_device=root_device,
            depth=depth,
            budget=budget,
            errors=errors,
        )


def _remove_leased_workspace_root(lease: NativeWorkspaceLease) -> tuple[str, ...]:
    """Quarantine and remove the workspace itself relative to its pinned parent."""

    try:
        named = os.stat(
            lease.name,
            dir_fd=lease.parent_descriptor,
            follow_symlinks=False,
        )
    except FileNotFoundError:
        return ("leased native workspace root disappeared before cleanup",)
    except OSError as exc:
        return (
            _bounded_diagnostic(
                "cannot inspect the leased native workspace root: ",
                _exception_summary(exc),
                maximum_bytes=_MAX_CLEANUP_ERROR_BYTES,
            ),
        )
    if (named.st_dev, named.st_ino) != lease.identity:
        return ("leased native workspace root name no longer resolves to the lease",)
    quarantine = _workspace_scratch_name(NATIVE_WORKSPACE_QUARANTINE_PREFIX)
    try:
        os.rename(
            lease.name,
            quarantine,
            src_dir_fd=lease.parent_descriptor,
            dst_dir_fd=lease.parent_descriptor,
        )
    except OSError as exc:
        return (
            _bounded_diagnostic(
                "cannot quarantine the leased native workspace root: ",
                _exception_summary(exc),
                maximum_bytes=_MAX_CLEANUP_ERROR_BYTES,
            ),
        )
    try:
        moved = os.stat(
            quarantine,
            dir_fd=lease.parent_descriptor,
            follow_symlinks=False,
        )
    except OSError as exc:
        return (
            _bounded_diagnostic(
                "cannot inspect the quarantined native workspace root: ",
                _exception_summary(exc),
                maximum_bytes=_MAX_CLEANUP_ERROR_BYTES,
            ),
        )
    if (moved.st_dev, moved.st_ino) != lease.identity:
        return ("leased native workspace root identity changed before removal",)
    try:
        os.rmdir(quarantine, dir_fd=lease.parent_descriptor)
    except OSError as exc:
        return (
            _bounded_diagnostic(
                "cannot remove the leased native workspace root: ",
                _exception_summary(exc),
                maximum_bytes=_MAX_CLEANUP_ERROR_BYTES,
            ),
        )
    return ()


def _release_workspace_lease(
    lease: NativeWorkspaceLease,
    *,
    leader_quiescent: bool,
) -> tuple[str, ...]:
    """Purge and remove the leased workspace, then close both pinned descriptors.

    This runs after every child outcome — normal return, timeout, SIGTERM, and
    SIGKILL — because the parent, not the child, owns the directory.  Work is
    bounded by depth and entry budget rather than the shared deadline so an
    exhausted deadline can never strand scratch.
    """

    errors: list[str] = []
    if leader_quiescent is not True:
        errors.append(
            "leased native workspace cleanup ran without a proven-dead native child"
        )
    root_metadata: os.stat_result | None = None
    try:
        root_metadata = os.fstat(lease.descriptor)
    except OSError as exc:
        errors.append(
            _bounded_diagnostic(
                "cannot inspect the leased native workspace before cleanup: ",
                _exception_summary(exc),
                maximum_bytes=_MAX_CLEANUP_ERROR_BYTES,
            )
        )
    if root_metadata is not None:
        if (root_metadata.st_dev, root_metadata.st_ino) != lease.identity:
            errors.append("leased native workspace identity changed before cleanup")
        else:
            purge_errors: list[str] = []
            _purge_leased_directory(
                lease.descriptor,
                root_device=root_metadata.st_dev,
                depth=0,
                budget=[NATIVE_WORKSPACE_MAX_ENTRIES],
                errors=purge_errors,
            )
            errors.extend(purge_errors)
            if purge_errors:
                # An incomplete purge must not rename or remove the root: the
                # retained directory keeps its provisioned name for forensics.
                errors.append(
                    "leased native workspace root retained after an incomplete purge"
                )
            else:
                errors.extend(_remove_leased_workspace_root(lease))
    errors.extend(
        _close_workspace_descriptors(
            (
                ("native workspace lease", lease.descriptor),
                ("native workspace lease container", lease.parent_descriptor),
            )
        )
    )
    normalized = _normalize_cleanup_errors(tuple(errors))
    if normalized is None:
        return ("leased native workspace cleanup produced excessive uncertainty",)
    return normalized


def _send_workspace_lease(
    connection: Connection | None,
    lease: NativeWorkspaceLease | None,
    *,
    destination_pid: int,
    deadline: RefineDeadline,
) -> None:
    if lease is None:
        if connection is not None:
            raise AdapterError(
                "native workspace lease transport exists without a lease",
                _FAILED_CODE,
            )
        return
    if connection is None:
        raise AdapterError(
            "native workspace lease transport is unavailable",
            _FAILED_CODE,
        )
    try:
        from multiprocessing.reduction import send_handle

        deadline.remaining_seconds()
        send_handle(connection, lease.descriptor, destination_pid)
        deadline.remaining_seconds()
    except AdapterError:
        raise
    except OSError as exc:
        raise AdapterError(
            _bounded_diagnostic(
                "cannot transfer the native workspace lease descriptor: ",
                _exception_summary(exc),
            ),
            _FAILED_CODE,
        ) from exc


def _receive_workspace_lease(
    connection: Connection | None,
    *,
    leased: bool,
    context: NativeChildContext,
) -> int | None:
    """Receive and independently verify the parent's writable workspace root."""

    if leased is not True:
        if connection is not None:
            raise _ChildTransportError(
                "native child received an unexpected workspace lease transport"
            )
        return None
    if connection is None:
        raise _ChildTransportError(
            "native child workspace lease transport is unavailable"
        )
    from multiprocessing.reduction import recv_handle

    if not connection.poll(context.remaining_seconds()):
        raise AdapterError(
            "native workspace lease transfer exceeded the shared deadline",
            _TIMEOUT_CODE,
        )
    descriptor = recv_handle(connection)
    try:
        os.set_inheritable(descriptor, False)
        metadata = os.fstat(descriptor)
        if (
            not stat.S_ISDIR(metadata.st_mode)
            or metadata.st_uid != os.geteuid()
            or stat.S_IMODE(metadata.st_mode) != 0o700
        ):
            raise AdapterError(
                "native child workspace lease is not a private owned directory",
                _INVALID_INPUT_CODE,
            )
        if os.listdir(descriptor):
            raise AdapterError(
                "native child workspace lease is not empty at receipt",
                _INVALID_INPUT_CODE,
            )
    except BaseException as exc:
        close_errors = _close_descriptors_safely((("workspace lease", descriptor),))
        if close_errors:
            raise AdapterError(
                _bounded_cleanup_report(
                    "native child workspace lease receipt failed",
                    close_errors,
                ),
                _CLEANUP_FAILED_CODE,
            ) from exc
        raise
    return descriptor


def run_native_engine_child(
    entrypoint: str,
    request: Mapping[str, Any],
    *,
    deadline: RefineDeadline,
    pinned_files: Mapping[str, NativePinnedFile] | None = None,
    workspace_parent_directory: str | None = None,
) -> Any:
    """Run one importable JSON engine operation in a killable child session.

    ``entrypoint`` is an import path, never a bound PyCOLMAP object.  Explicit
    ``spawn`` avoids inheriting a possibly initialized native/CUDA runtime.  A
    terminal result is not returned until the child leader exits and the shared
    deadline is checked again, so callers cannot enter publication after a
    timed-out native operation.

    ``workspace_parent_directory`` opts into one parent-provisioned 0700 scratch
    workspace.  The parent creates and pins it before the child exists, leases a
    descriptor down over SCM_RIGHTS, and removes it with bounded
    descriptor-relative cleanup after every outcome, so a SIGKILLed child cannot
    strand scratch.
    """

    if os.name != "posix" or not hasattr(os, "killpg"):
        raise AdapterError(
            "refine native engine isolation requires POSIX process groups",
            _FAILED_CODE,
        )
    if type(entrypoint) is not str or _ENTRYPOINT_PATTERN.fullmatch(entrypoint) is None:
        raise AdapterError(
            "native child entry point must be module.path:function_name",
            _FAILED_CODE,
        )
    request_payload = _bounded_request(request)
    try:
        deadline.remaining_seconds()
    except AdapterError as exc:
        raise AdapterError(
            _safe_exception_message(
                exc,
                fallback="refine native boundary deadline failed",
            ),
            _safe_adapter_error_code(exc),
        ) from exc
    except Exception as exc:
        raise AdapterError(
            _bounded_diagnostic(
                "cannot inspect refine native boundary deadline: ",
                _exception_summary(exc),
            ),
            _FAILED_CODE,
        ) from exc
    except BaseException as exc:
        if type(exc) is KeyboardInterrupt or type(exc) is SystemExit:
            raise
        raise AdapterError(
            "cannot inspect refine native boundary deadline: external exception",
            _FAILED_CODE,
        ) from exc

    transfers = _prepare_pinned_files(pinned_files, deadline=deadline)
    workspace_lease: NativeWorkspaceLease | None = None
    if workspace_parent_directory is not None:
        try:
            workspace_lease = provision_native_workspace_lease(
                workspace_parent_directory,
                deadline=deadline,
            )
        except BaseException as exc:
            descriptor_errors = _close_descriptors_safely(
                (transfer.token, transfer.descriptor) for transfer in transfers
            )
            if descriptor_errors:
                raise _cleanup_failed_error(
                    "cannot provision the refine native workspace lease",
                    descriptor_errors,
                ) from exc
            raise
    parent_pinned_connection: Connection | None = None
    child_pinned_connection: Connection | None = None
    parent_workspace_connection: Connection | None = None
    child_workspace_connection: Connection | None = None

    def _optional_transports() -> tuple[tuple[str, Any], ...]:
        return (
            *(
                (
                    ("parent pinned-file", parent_pinned_connection),
                    ("child pinned-file", child_pinned_connection),
                )
                if parent_pinned_connection is not None
                and child_pinned_connection is not None
                else ()
            ),
            *(
                (
                    ("parent workspace lease", parent_workspace_connection),
                    ("child workspace lease", child_workspace_connection),
                )
                if parent_workspace_connection is not None
                and child_workspace_connection is not None
                else ()
            ),
        )

    def _release_lease_for_setup_failure() -> tuple[str, ...]:
        if workspace_lease is None:
            return ()
        return _release_workspace_lease(workspace_lease, leader_quiescent=True)

    try:
        context = multiprocessing.get_context("spawn")
        parent_connection, child_connection = context.Pipe(duplex=True)
        if transfers:
            parent_pinned_connection, child_pinned_connection = context.Pipe(
                duplex=True
            )
        if workspace_lease is not None:
            parent_workspace_connection, child_workspace_connection = context.Pipe(
                duplex=True
            )
    except BaseException as exc:
        connection_errors: tuple[str, ...] = ()
        if "parent_connection" in locals() and "child_connection" in locals():
            connection_errors = _close_connections_safely(
                (
                    ("parent", parent_connection),
                    ("child", child_connection),
                    *_optional_transports(),
                ),
            )
        descriptor_errors = _close_descriptors_safely(
            (transfer.token, transfer.descriptor) for transfer in transfers
        )
        workspace_errors = _release_lease_for_setup_failure()
        cleanup_errors = (*connection_errors, *descriptor_errors, *workspace_errors)
        message = _bounded_diagnostic(
            "cannot create refine native child transport: ",
            _safe_exception_message(
                exc,
                fallback="transport setup failed",
            ),
        )
        if cleanup_errors:
            raise _cleanup_failed_error(message, cleanup_errors) from exc
        raise AdapterError(message, _FAILED_CODE) from exc
    pinned_ledger = tuple(
        (transfer.token, transfer.sha256, transfer.size_bytes) for transfer in transfers
    )
    try:
        process = context.Process(
            target=_child_entry,
            args=(
                child_connection,
                child_pinned_connection,
                pinned_ledger,
                child_workspace_connection,
                workspace_lease is not None,
                entrypoint,
                request_payload,
                deadline.expires_at_monotonic_s,
            ),
            name="patina-refine-native",
            daemon=False,
        )
    except BaseException as exc:
        close_errors = _close_connections_safely(
            (
                ("parent", parent_connection),
                ("child", child_connection),
                *_optional_transports(),
            )
        )
        descriptor_errors = _close_descriptors_safely(
            (transfer.token, transfer.descriptor) for transfer in transfers
        )
        workspace_errors = _release_lease_for_setup_failure()
        message = _bounded_diagnostic(
            "cannot prepare refine native child: ",
            _safe_exception_message(
                exc,
                fallback="process construction failed",
            ),
        )
        cleanup_errors = (*close_errors, *descriptor_errors, *workspace_errors)
        if cleanup_errors:
            raise _cleanup_failed_error(message, cleanup_errors) from exc
        raise AdapterError(message, _FAILED_CODE) from exc
    started = False
    group_leader_pid: int | None = None
    reaped = False
    cleanup_handled = False
    try:
        try:
            # Pipe/process construction can consume the entire absolute budget.
            # This final no-side-effect gate must remain adjacent to start().
            deadline.remaining_seconds()
            process.start()
        except OSError as exc:
            raise AdapterError(
                _bounded_diagnostic(
                    "cannot start refine native child: ",
                    _safe_exception_message(
                        exc,
                        fallback="process start failed",
                    ),
                ),
                _FAILED_CODE,
            ) from exc
        started = True
        try:
            child_connection.close()
            if child_pinned_connection is not None:
                child_pinned_connection.close()
            if child_workspace_connection is not None:
                child_workspace_connection.close()
        except OSError as exc:
            raise AdapterError(
                _bounded_diagnostic(
                    "cannot close parent copy of native child transport: ",
                    _safe_exception_message(
                        exc,
                        fallback="transport close failed",
                    ),
                ),
                _FAILED_CODE,
            ) from exc

        ready = _receive_envelope(parent_connection, process, deadline)
        if ready.get("kind") != "ready":
            raw_message = ready.get("message")
            message = (
                _truncate_utf8(raw_message, NATIVE_CHILD_MAX_ERROR_BYTES)
                if type(raw_message) is str
                else "child failed before session setup"
            )
            raise AdapterError(
                message,
                _validated_error_code(ready.get("code")),
            )
        pid = process.pid
        reported_pinned_count = ready.get("pinnedFileCount")
        if (
            type(pid) is not int
            or ready.get("pid") != pid
            or ready.get("processGroupId") != pid
            or ready.get("sessionId") != pid
            or (bool(transfers) and reported_pinned_count != len(transfers))
            or (not transfers and reported_pinned_count not in (None, 0))
            or ready.get("workspaceLeased") is not (workspace_lease is not None)
        ):
            raise AdapterError(
                "refine native child did not establish its dedicated POSIX session",
                _FAILED_CODE,
            )
        group_leader_pid = pid
        try:
            parent_connection.send_bytes(_ACK_READY)
        except OSError as exc:
            raise AdapterError(
                _bounded_diagnostic(
                    "cannot acknowledge refine native child readiness: ",
                    _safe_exception_message(
                        exc,
                        fallback="readiness acknowledgement failed",
                    ),
                ),
                _FAILED_CODE,
            ) from exc
        _send_pinned_files(
            parent_pinned_connection,
            transfers,
            destination_pid=pid,
            deadline=deadline,
        )
        _send_workspace_lease(
            parent_workspace_connection,
            workspace_lease,
            destination_pid=pid,
            deadline=deadline,
        )

        terminal = _receive_envelope(parent_connection, process, deadline)
        kind = terminal.get("kind")
        if kind == "error":
            raw_message = terminal.get("message")
            message = (
                _truncate_utf8(raw_message, NATIVE_CHILD_MAX_ERROR_BYTES)
                if type(raw_message) is str
                else "native child failed"
            )
            raise AdapterError(
                message,
                _validated_error_code(terminal.get("code")),
            )
        if kind != "result" or "value" not in terminal:
            raise AdapterError(
                "refine native child returned an invalid terminal response",
                _FAILED_CODE,
            )

        try:
            parent_connection.send_bytes(_ACK_ACCEPT)
        except OSError as exc:
            raise AdapterError(
                _bounded_diagnostic(
                    "cannot acknowledge refine native child result: ",
                    _safe_exception_message(
                        exc,
                        fallback="result acknowledgement failed",
                    ),
                ),
                _FAILED_CODE,
            ) from exc
        try:
            exited = wait(
                (process.sentinel,),
                timeout=deadline.remaining_seconds(),
            )
        except OSError as exc:
            raise AdapterError(
                _bounded_diagnostic(
                    "cannot wait for refine native child leader exit: ",
                    _safe_exception_message(
                        exc,
                        fallback="leader exit wait failed",
                    ),
                ),
                _FAILED_CODE,
            ) from exc
        if not exited:
            raise _ChildBoundaryTimeout
        success_group_errors = _success_group_quiescence_errors(
            group_leader_pid=group_leader_pid,
            deadline=deadline,
        )
        if success_group_errors:
            descendant_cleanup_errors = _cleanup_process(
                process,
                group_leader_pid=group_leader_pid,
            )
            # Cleanup held the unreaped leader through its final group signal.
            # Never address this PGID again after cleanup may have released it.
            cleanup_handled = True
            reaped = True
            raise _cleanup_failed_error(
                "refine native child returned before its process group was quiescent",
                (*success_group_errors, *descendant_cleanup_errors),
            )

        try:
            process.join(deadline.remaining_seconds())
        except OSError as exc:
            message = _bounded_diagnostic(
                "cannot join refine native child leader: ",
                _safe_exception_message(
                    exc,
                    fallback="leader join failed",
                ),
            )
            direct_reap_errors = _reap_proven_quiescent_leader(process)
            # The group was proven empty before the first join. Retrying only
            # the direct leader cannot hit a recycled PGID.
            cleanup_handled = True
            reaped = True
            if direct_reap_errors:
                raise _cleanup_failed_error(
                    message,
                    direct_reap_errors,
                ) from exc
            raise AdapterError(message, _FAILED_CODE) from exc
        # The frozen group was proven empty while this unreaped leader still
        # reserved its PID. From here onward no code may signal/probe that PGID.
        reaped = True
        try:
            leader_alive = process.is_alive()
        except (AssertionError, OSError, ValueError) as exc:
            raise AdapterError(
                _bounded_diagnostic(
                    "cannot inspect refine native child leader after join: ",
                    _safe_exception_message(
                        exc,
                        fallback="leader inspection failed",
                    ),
                ),
                _FAILED_CODE,
            ) from exc
        if leader_alive:
            raise _ChildBoundaryTimeout
        exitcode = process.exitcode
        if type(exitcode) is not int or exitcode != 0:
            detail = (
                int.__str__(exitcode) if type(exitcode) is int else "unknown status"
            )
            raise AdapterError(
                _bounded_diagnostic(
                    "refine native child exited unsuccessfully (",
                    detail,
                    ")",
                ),
                _FAILED_CODE,
            )
        deadline.remaining_seconds()
        return terminal["value"]
    except _ChildBoundaryTimeout as exc:
        cleanup_errors = ()
        if started and not reaped:
            cleanup_errors = _cleanup_process(
                process,
                group_leader_pid=group_leader_pid,
            )
            cleanup_handled = True
        raise _timeout_error(cleanup_errors) from exc
    except AdapterError as exc:
        safe_message = _safe_exception_message(
            exc,
            fallback="refine native boundary failed",
        )
        cleanup_errors = ()
        if started and not reaped:
            cleanup_errors = _cleanup_process(
                process,
                group_leader_pid=group_leader_pid,
            )
            cleanup_handled = True
        if cleanup_errors:
            raise _cleanup_failed_error(
                safe_message,
                cleanup_errors,
            ) from exc
        raise AdapterError(
            safe_message,
            _safe_adapter_error_code(exc),
        ) from exc
    except Exception as exc:
        cleanup_errors = ()
        if started and not reaped:
            cleanup_errors = _cleanup_process(
                process,
                group_leader_pid=group_leader_pid,
            )
            cleanup_handled = True
        detail = _bounded_diagnostic(
            "unexpected refine native boundary failure: ",
            _exception_summary(exc),
        )
        if cleanup_errors:
            raise _cleanup_failed_error(detail, cleanup_errors) from exc
        raise AdapterError(detail, _FAILED_CODE) from exc
    except BaseException as exc:
        cleanup_errors = ()
        if started and not reaped:
            cleanup_errors = _cleanup_process(
                process,
                group_leader_pid=group_leader_pid,
            )
            cleanup_handled = True
        if cleanup_errors:
            raise _cleanup_failed_error(
                "unexpected refine native boundary failure",
                cleanup_errors,
            ) from exc
        if type(exc) is KeyboardInterrupt or type(exc) is SystemExit:
            raise
        raise AdapterError(
            _bounded_diagnostic(
                "unexpected refine native boundary failure: ",
                _exception_summary(exc),
            ),
            _FAILED_CODE,
        ) from exc
    finally:
        active_exception = sys.exc_info()[1]
        final_cleanup_errors: tuple[str, ...] = ()
        if started and not reaped and not cleanup_handled:
            final_cleanup_errors = _cleanup_process(
                process,
                group_leader_pid=group_leader_pid,
            )
        resource_errors = list(
            _close_connections_safely(
                (
                    ("parent", parent_connection),
                    ("child", child_connection),
                    *_optional_transports(),
                )
            )
        )
        offset_restore_errors = _restore_transfer_offsets_safely(transfers)
        resource_errors.extend(
            _close_descriptors_safely(
                (transfer.token, transfer.descriptor) for transfer in transfers
            )
        )
        leader_quiescent = not started
        if started:
            try:
                leader_alive = process.is_alive()
            except BaseException as exc:
                resource_errors.append(
                    _bounded_diagnostic(
                        "cannot inspect native child leader during final resource "
                        "cleanup: ",
                        _exception_summary(exc),
                    )
                )
                leader_alive = True
            if not leader_alive:
                leader_quiescent = True
                try:
                    process.close()
                except BaseException as exc:
                    resource_errors.append(
                        _bounded_diagnostic(
                            "cannot close native child process handle: ",
                            _exception_summary(exc),
                        )
                    )

        # The workspace is parent-owned, so it is removed after every outcome:
        # normal return, timeout, SIGTERM, and SIGKILL all arrive here with the
        # leader already reaped by the cleanup above.
        workspace_cleanup_errors: tuple[str, ...] = ()
        if workspace_lease is not None:
            workspace_cleanup_errors = _release_workspace_lease(
                workspace_lease,
                leader_quiescent=leader_quiescent,
            )

        all_final_errors = (
            *final_cleanup_errors,
            *offset_restore_errors,
            *workspace_cleanup_errors,
            *resource_errors,
        )
        if final_cleanup_errors or offset_restore_errors or workspace_cleanup_errors:
            raise _cleanup_failed_error(
                "refine native child cleanup failed",
                all_final_errors,
            ) from active_exception
        if resource_errors:
            if active_exception is not None:
                _add_cleanup_note(active_exception, tuple(resource_errors))
            else:
                raise _cleanup_failed_error(
                    "refine native boundary resource cleanup failed",
                    tuple(resource_errors),
                )
