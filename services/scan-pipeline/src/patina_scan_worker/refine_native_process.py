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
"""

from __future__ import annotations

import importlib
import json
import math
import multiprocessing
import os
import re
import signal
import sys
import time
from dataclasses import dataclass
from json.encoder import encode_basestring_ascii
from multiprocessing.connection import Connection, wait
from typing import Any, Iterable, Iterator, Mapping

from .refine_adapter import AdapterError, RefineDeadline

NATIVE_CHILD_MAX_REQUEST_BYTES = 64 * 1024
NATIVE_CHILD_MAX_RESPONSE_BYTES = 256 * 1024
NATIVE_CHILD_MAX_ERROR_BYTES = 1024
NATIVE_CHILD_TERM_GRACE_S = 0.10
NATIVE_CHILD_KILL_REAP_S = 1.0

_PROTOCOL_VERSION = 1
_ENTRYPOINT_PATTERN = re.compile(r"^[A-Za-z_]\w*(?:\.[A-Za-z_]\w*)*:[A-Za-z_]\w*$")
_ACK_READY = b"ready-accept-v1"
_ACK_ACCEPT = b"accept-v1"
_TIMEOUT_CODE = "REFINE_ENGINE_TIMEOUT"
_FAILED_CODE = "REFINE_ENGINE_FAILED"
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

    def remaining_seconds(self) -> float:
        remaining = self.expires_at_monotonic_s - time.monotonic()
        if not math.isfinite(remaining) or remaining <= 0:
            raise AdapterError(
                "refine native engine child deadline is exhausted",
                _TIMEOUT_CODE,
            )
        return remaining


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


def _child_entry(
    connection: Connection,
    entrypoint: str,
    request_payload: bytes,
    expires_at_monotonic_s: float,
) -> None:
    """Spawn-safe fixed target; native modules are imported after ``setsid``."""

    try:
        if os.name != "posix" or not hasattr(os, "setsid"):
            raise _ChildTransportError(
                "refine native child requires POSIX session isolation"
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
            },
        )
        context = NativeChildContext(expires_at_monotonic_s)
        _receive_exact_child_ack(
            connection,
            expected=_ACK_READY,
            context=context,
            phase="readiness",
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
        _send_envelope(
            connection,
            {
                "protocolVersion": _PROTOCOL_VERSION,
                "kind": "result",
                "value": result,
            },
        )
    except BaseException as exc:
        try:
            _send_envelope(connection, _error_envelope(exc))
        except BaseException:
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


def _terminate_and_reap(
    process: multiprocessing.Process,
    *,
    group_leader_pid: int | None,
) -> tuple[str, ...]:
    """Bounded TERM/KILL cleanup; the direct session leader is always joined."""

    errors: list[str] = []
    deferred_kill_permission_error: str | None = None
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
            if isinstance(error, PermissionError):
                # Darwin reports EPERM when a process group contains only our
                # already-dead, unreaped leader.  Defer that report until the
                # leader is reaped, then prove the group no longer exists.
                deferred_kill_permission_error = message
            else:
                errors.append(message)
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
    if deferred_kill_permission_error is not None:
        try:
            os.killpg(group_leader_pid, 0)
        except ProcessLookupError:
            pass
        except OSError as exc:
            errors.append(deferred_kill_permission_error)
            errors.append(
                _bounded_diagnostic(
                    "cannot confirm native child process group removal after reap: ",
                    _exception_summary(exc),
                )
            )
        else:
            errors.append(deferred_kill_permission_error)
            errors.append("native child process group still exists after leader reap")
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

    if group_leader_pid is not None and not leader_alive:
        try:
            os.killpg(group_leader_pid, 0)
        except ProcessLookupError:
            pass
        except BaseException as exc:
            errors.append(
                _bounded_diagnostic(
                    "emergency cleanup cannot confirm process-group removal: ",
                    _exception_summary(exc),
                )
            )
        else:
            errors.append("emergency cleanup process group still exists after reap")
    return tuple(errors)


def _verify_cleanup_complete(
    process: multiprocessing.Process,
    *,
    group_leader_pid: int | None,
) -> tuple[str, ...]:
    """Independently prove the direct child and its known group are gone."""

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

    if group_leader_pid is not None:
        # Darwin can transiently report EPERM while the group contains only a
        # killed descendant awaiting reaping. Once the direct leader is proven
        # dead, retry that uncertainty for one bounded reap window.
        permission_deadline = time.monotonic() + NATIVE_CHILD_KILL_REAP_S
        while True:
            try:
                os.killpg(group_leader_pid, 0)
            except ProcessLookupError:
                break
            except PermissionError as exc:
                if leader_alive is False and time.monotonic() < permission_deadline:
                    time.sleep(0.01)
                    continue
                errors.append(
                    _bounded_diagnostic(
                        "cannot verify native child process-group removal: ",
                        _exception_summary(exc),
                    )
                )
                break
            except BaseException as exc:
                errors.append(
                    _bounded_diagnostic(
                        "cannot verify native child process-group removal: ",
                        _exception_summary(exc),
                    )
                )
                break
            else:
                errors.append(
                    "native child process group remains alive after cleanup verification"
                )
                break
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

    verification_errors = _cleanup_verification_errors(
        process,
        group_leader_pid=group_leader_pid,
    )
    if force_emergency or verification_errors:
        emergency_errors = _emergency_cleanup_errors(
            process,
            group_leader_pid=group_leader_pid,
        )
        post_emergency_errors = _cleanup_verification_errors(
            process,
            group_leader_pid=group_leader_pid,
        )
        combined = (
            *primary_errors,
            *verification_errors,
            *emergency_errors,
            *post_emergency_errors,
        )
        normalized_combined = _normalize_cleanup_errors(combined)
        if normalized_combined is None:
            return ("native child cleanup produced excessive uncertainty",)
        return normalized_combined
    return primary_errors


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


def run_native_engine_child(
    entrypoint: str,
    request: Mapping[str, Any],
    *,
    deadline: RefineDeadline,
) -> Any:
    """Run one importable JSON engine operation in a killable child session.

    ``entrypoint`` is an import path, never a bound PyCOLMAP object.  Explicit
    ``spawn`` avoids inheriting a possibly initialized native/CUDA runtime.  A
    terminal result is not returned until the child leader exits and the shared
    deadline is checked again, so callers cannot enter publication after a
    timed-out native operation.
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

    try:
        context = multiprocessing.get_context("spawn")
        parent_connection, child_connection = context.Pipe(duplex=True)
    except BaseException as exc:
        raise AdapterError(
            _bounded_diagnostic(
                "cannot create refine native child transport: ",
                _safe_exception_message(
                    exc,
                    fallback="transport setup failed",
                ),
            ),
            _FAILED_CODE,
        ) from exc
    try:
        process = context.Process(
            target=_child_entry,
            args=(
                child_connection,
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
            )
        )
        message = _bounded_diagnostic(
            "cannot prepare refine native child: ",
            _safe_exception_message(
                exc,
                fallback="process construction failed",
            ),
        )
        if close_errors:
            raise _cleanup_failed_error(message, close_errors) from exc
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
        if (
            type(pid) is not int
            or ready.get("pid") != pid
            or ready.get("processGroupId") != pid
            or ready.get("sessionId") != pid
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
            process.join(deadline.remaining_seconds())
        except OSError as exc:
            raise AdapterError(
                _bounded_diagnostic(
                    "cannot join refine native child leader: ",
                    _safe_exception_message(
                        exc,
                        fallback="leader join failed",
                    ),
                ),
                _FAILED_CODE,
            ) from exc
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
        reaped = True
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
        if started:
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
                )
            )
        )
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
                try:
                    process.close()
                except BaseException as exc:
                    resource_errors.append(
                        _bounded_diagnostic(
                            "cannot close native child process handle: ",
                            _exception_summary(exc),
                        )
                    )

        all_final_errors = (*final_cleanup_errors, *resource_errors)
        if final_cleanup_errors:
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
