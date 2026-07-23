"""Killable POSIX process boundary for future native Refine engine calls.

PyCOLMAP calls into native code and cannot be interrupted safely by a Python
thread timeout.  This module starts a fresh ``spawn`` interpreter, establishes
that child as a new POSIX session, and loads the requested engine entry point
only after the parent validates that boundary and returns an exact readiness
acknowledgement.  The parent accepts a result only after the session leader
exits inside the one shared :class:`RefineDeadline`.

The boundary deliberately transports bounded JSON, not Python/native objects.
Future handler entry points must therefore load PyCOLMAP inside the child, use
scratch paths from the request, and return evidence needed by the parent.  They
must also be explicitly marked as in-process-only: native threads are allowed,
but an entry point may not spawn an OS child and then return while that process
remains alive.  Timeout cleanup kills a whole process group; successful cleanup
relies on this narrower contract.  Any durable artifact publication remains
parent-only and must occur only after this function returns successfully.  The
Item 4A qualifier remains in-process until the production handler contract is
built and separately qualified.
"""

from __future__ import annotations

import importlib
import json
import math
import multiprocessing
import os
import re
import signal
import time
from dataclasses import dataclass
from json.encoder import encode_basestring_ascii
from multiprocessing.connection import Connection, wait
from typing import Any, Iterable, Iterator, Mapping

from .refine_adapter import AdapterError, RefineDeadline

NATIVE_CHILD_MAX_REQUEST_BYTES = 64 * 1024
NATIVE_CHILD_MAX_RESPONSE_BYTES = 256 * 1024
NATIVE_CHILD_MAX_ERROR_BYTES = 4 * 1024
NATIVE_CHILD_TERM_GRACE_S = 0.10
NATIVE_CHILD_KILL_REAP_S = 1.0

_PROTOCOL_VERSION = 1
_ENTRYPOINT_PATTERN = re.compile(r"^[A-Za-z_]\w*(?:\.[A-Za-z_]\w*)*:[A-Za-z_]\w*$")
_ACK_READY = b"ready-accept-v1"
_ACK_ACCEPT = b"accept-v1"
_TIMEOUT_CODE = "REFINE_ENGINE_TIMEOUT"
_FAILED_CODE = "REFINE_ENGINE_FAILED"
_CLEANUP_FAILED_CODE = "REFINE_ENGINE_CLEANUP_FAILED"
_IN_PROCESS_ENTRYPOINT_MARKER = "__patina_refine_in_process_only__"
_JSON_STRING_CHUNK_CHARS = 1024
_JSON_OUTPUT_CHUNK_CHARS = 1024


class _ChildBoundaryTimeout(TimeoutError):
    pass


class _ChildTransportError(ValueError):
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
        raise _ChildTransportError(
            "native child JSON integer exceeds the bounded transport"
        )
    return int.__repr__(value)


def _json_mapping_key(value: Any, *, maximum_bytes: int) -> str:
    if isinstance(value, str):
        return value
    if value is True:
        return "true"
    if value is False:
        return "false"
    if value is None:
        return "null"
    if isinstance(value, int):
        return _bounded_int_repr(value, maximum_bytes=maximum_bytes)
    if isinstance(value, float):
        if not math.isfinite(value):
            raise ValueError("Out of range float values are not JSON compliant")
        return float.__repr__(value)
    raise TypeError(
        f"keys must be str, int, float, bool or None, not {type(value).__name__}"
    )


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
    if isinstance(value, str):
        yield from _iter_json_string(value)
        return
    if isinstance(value, int):
        yield _bounded_int_repr(value, maximum_bytes=maximum_bytes)
        return
    if isinstance(value, float):
        if not math.isfinite(value):
            raise ValueError("Out of range float values are not JSON compliant")
        yield float.__repr__(value)
        return
    if isinstance(value, (list, tuple)):
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
    if isinstance(value, dict):
        marker = id(value)
        if marker in active_containers:
            raise ValueError("Circular reference detected")
        active_containers.add(marker)
        try:
            yield "{"
            first = True
            # Match JSONEncoder(sort_keys=True): sort original keys before the
            # supported non-string key conversion.
            for key, item in sorted(value.items()):
                if not first:
                    yield ","
                first = False
                yield from _iter_json_string(
                    _json_mapping_key(key, maximum_bytes=maximum_bytes)
                )
                yield ":"
                yield from _iter_canonical_json_chunks(
                    item,
                    maximum_bytes=maximum_bytes,
                    active_containers=active_containers,
                )
            yield "}"
        finally:
            active_containers.remove(marker)
        return
    raise TypeError(f"Object of type {type(value).__name__} is not JSON serializable")


def _collect_bounded_json_chunks(
    chunks: Iterable[str],
    *,
    maximum_bytes: int,
    overflow_message: str,
) -> bytes:
    """Collect UTF-8 chunks without ever constructing output beyond ``cap``."""

    if not isinstance(maximum_bytes, int) or maximum_bytes < 1:
        raise ValueError("native child JSON byte cap must be positive")
    output = bytearray()
    for chunk in chunks:
        if not isinstance(chunk, str):
            raise _ChildTransportError(
                "native child JSON encoder yielded a non-text chunk"
            )
        for offset in range(0, len(chunk), _JSON_OUTPUT_CHUNK_CHARS):
            piece = chunk[offset : offset + _JSON_OUTPUT_CHUNK_CHARS]
            encoded = piece.encode("utf-8")
            if len(output) + len(encoded) > maximum_bytes:
                raise _ChildTransportError(overflow_message)
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
    except (RecursionError, TypeError, ValueError, OverflowError) as exc:
        raise _ChildTransportError(
            f"native child transport requires finite JSON values: {exc}"
        ) from exc


def _bounded_request(request: Mapping[str, Any]) -> bytes:
    if not isinstance(request, Mapping):
        raise AdapterError(
            "refine native child request must be a JSON object",
            _FAILED_CODE,
        )
    try:
        payload = _bounded_json_bytes(
            dict(request),
            maximum_bytes=NATIVE_CHILD_MAX_REQUEST_BYTES,
            overflow_message=(
                "refine native child request exceeds the bounded transport"
            ),
        )
    except _ChildTransportError as exc:
        raise AdapterError(str(exc), _FAILED_CODE) from exc
    return payload


def _truncate_utf8(value: str, maximum_bytes: int) -> str:
    output = bytearray()
    for offset in range(0, len(value), _JSON_STRING_CHUNK_CHARS):
        encoded = value[offset : offset + _JSON_STRING_CHUNK_CHARS].encode(
            "utf-8", errors="replace"
        )
        remaining = maximum_bytes - len(output)
        if len(encoded) > remaining:
            output.extend(encoded[:remaining])
            return output.decode("utf-8", errors="ignore") + "..."
        output.extend(encoded)
    return output.decode("utf-8")


def _error_envelope(exc: BaseException) -> Mapping[str, Any]:
    code = exc.code if isinstance(exc, AdapterError) else _FAILED_CODE
    return {
        "protocolVersion": _PROTOCOL_VERSION,
        "kind": "error",
        "code": code,
        "exceptionType": type(exc).__name__,
        "message": _truncate_utf8(str(exc), NATIVE_CHILD_MAX_ERROR_BYTES),
    }


def _send_envelope(connection: Connection, envelope: Mapping[str, Any]) -> None:
    payload = _bounded_json_bytes(
        envelope,
        maximum_bytes=NATIVE_CHILD_MAX_RESPONSE_BYTES,
        overflow_message="native child result exceeds the bounded transport",
    )
    connection.send_bytes(payload)


def _resolve_entrypoint(value: str):
    if not isinstance(value, str) or _ENTRYPOINT_PATTERN.fullmatch(value) is None:
        raise _ChildTransportError(
            "native child entry point must be module.path:function_name"
        )
    module_name, function_name = value.split(":", 1)
    module = importlib.import_module(module_name)
    target = getattr(module, function_name, None)
    if target is None or not callable(target):
        raise _ChildTransportError(f"native child entry point is not callable: {value}")
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
            f"cannot wait for native child {phase} acknowledgement: {exc}"
        ) from exc
    if not acknowledged:
        raise AdapterError(
            f"native child {phase} acknowledgement exceeded the shared deadline",
            _TIMEOUT_CODE,
        )
    try:
        acknowledgement = connection.recv_bytes(len(expected))
    except (EOFError, OSError) as exc:
        raise _ChildTransportError(
            f"cannot receive native child {phase} acknowledgement: {exc}"
        ) from exc
    if acknowledgement != expected:
        raise _ChildTransportError(f"native child {phase} acknowledgement is invalid")


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
        if not isinstance(request, dict):
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

    try:
        context = NativeChildContext(expires_at_monotonic_s)
        _receive_exact_child_ack(
            connection,
            expected=_ACK_ACCEPT,
            context=context,
            phase="result",
        )
    except (AdapterError, _ChildTransportError, EOFError, OSError):
        return
    finally:
        connection.close()


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
            f"cannot wait for refine native child response: {exc}",
            _FAILED_CODE,
        ) from exc
    if not ready:
        raise _ChildBoundaryTimeout
    if connection not in ready:
        try:
            response_ready = connection.poll(0)
        except OSError as exc:
            raise AdapterError(
                f"cannot inspect refine native child response: {exc}",
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
            f"refine native child returned an invalid bounded response: {exc}",
            _FAILED_CODE,
        ) from exc
    if not isinstance(envelope, dict):
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
    return f"cannot signal native child process group with {sig.name}: {exc}"


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
            errors.append(f"cannot terminate native child before session setup: {exc}")

    try:
        process.join(NATIVE_CHILD_KILL_REAP_S)
    except (AssertionError, OSError, ValueError) as exc:
        errors.append(f"cannot join native child leader: {exc}")
    try:
        leader_alive = process.is_alive()
    except (AssertionError, OSError, ValueError) as exc:
        errors.append(f"cannot inspect native child leader: {exc}")
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
            errors.append(f"cannot kill native child leader: {exc}")
        try:
            process.join(NATIVE_CHILD_KILL_REAP_S)
        except (AssertionError, OSError, ValueError) as exc:
            errors.append(f"cannot join killed native child leader: {exc}")
    try:
        leader_alive = process.is_alive()
    except (AssertionError, OSError, ValueError) as exc:
        errors.append(f"cannot confirm native child leader exit: {exc}")
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
                f"cannot confirm native child process group removal after reap: {exc}"
            )
        else:
            errors.append(deferred_kill_permission_error)
            errors.append("native child process group still exists after leader reap")
    return tuple(errors)


def _cleanup_process(
    process: multiprocessing.Process,
    *,
    group_leader_pid: int | None,
) -> tuple[str, ...]:
    """Convert every cleanup implementation failure into stable uncertainty."""

    try:
        errors = _terminate_and_reap(
            process,
            group_leader_pid=group_leader_pid,
        )
    except BaseException as exc:
        return (
            "native child cleanup raised "
            f"{type(exc).__name__}: {_truncate_utf8(str(exc), 1024)}",
        )
    if not isinstance(errors, tuple) or any(
        not isinstance(error, str) or not error for error in errors
    ):
        return ("native child cleanup returned an invalid uncertainty report",)
    return errors


def _cleanup_failed_error(
    message: str,
    cleanup_errors: tuple[str, ...],
) -> AdapterError:
    return AdapterError(
        message + "; cleanup: " + "; ".join(cleanup_errors),
        _CLEANUP_FAILED_CODE,
    )


def _timeout_error(cleanup_errors: tuple[str, ...]) -> AdapterError:
    if cleanup_errors:
        return _cleanup_failed_error(
            "refine native engine child exceeded the shared deadline",
            cleanup_errors,
        )
    return AdapterError(
        "refine native engine child exceeded the shared deadline",
        _TIMEOUT_CODE,
    )


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
    if (
        not isinstance(entrypoint, str)
        or _ENTRYPOINT_PATTERN.fullmatch(entrypoint) is None
    ):
        raise AdapterError(
            "native child entry point must be module.path:function_name",
            _FAILED_CODE,
        )
    request_payload = _bounded_request(request)
    deadline.remaining_seconds()

    context = multiprocessing.get_context("spawn")
    try:
        parent_connection, child_connection = context.Pipe(duplex=True)
    except OSError as exc:
        raise AdapterError(
            f"cannot create refine native child transport: {exc}",
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
    except (OSError, ValueError) as exc:
        parent_connection.close()
        child_connection.close()
        raise AdapterError(
            f"cannot prepare refine native child: {exc}",
            _FAILED_CODE,
        ) from exc
    started = False
    group_leader_pid: int | None = None
    reaped = False
    cleanup_handled = False
    try:
        try:
            process.start()
        except OSError as exc:
            raise AdapterError(
                f"cannot start refine native child: {exc}",
                _FAILED_CODE,
            ) from exc
        started = True
        try:
            child_connection.close()
        except OSError as exc:
            raise AdapterError(
                f"cannot close parent copy of native child transport: {exc}",
                _FAILED_CODE,
            ) from exc

        ready = _receive_envelope(parent_connection, process, deadline)
        if ready.get("kind") != "ready":
            message = str(ready.get("message", "child failed before session setup"))
            raise AdapterError(message, str(ready.get("code", _FAILED_CODE)))
        pid = process.pid
        if (
            not isinstance(pid, int)
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
                f"cannot acknowledge refine native child readiness: {exc}",
                _FAILED_CODE,
            ) from exc

        terminal = _receive_envelope(parent_connection, process, deadline)
        kind = terminal.get("kind")
        if kind == "error":
            message = _truncate_utf8(
                str(terminal.get("message", "native child failed")),
                NATIVE_CHILD_MAX_ERROR_BYTES,
            )
            code = terminal.get("code")
            if not isinstance(code, str) or not code.startswith("REFINE_"):
                code = _FAILED_CODE
            raise AdapterError(message, code)
        if kind != "result" or "value" not in terminal:
            raise AdapterError(
                "refine native child returned an invalid terminal response",
                _FAILED_CODE,
            )

        try:
            parent_connection.send_bytes(_ACK_ACCEPT)
        except OSError as exc:
            raise AdapterError(
                f"cannot acknowledge refine native child result: {exc}",
                _FAILED_CODE,
            ) from exc
        try:
            process.join(deadline.remaining_seconds())
        except OSError as exc:
            raise AdapterError(
                f"cannot join refine native child leader: {exc}",
                _FAILED_CODE,
            ) from exc
        try:
            leader_alive = process.is_alive()
        except (AssertionError, OSError, ValueError) as exc:
            raise AdapterError(
                f"cannot inspect refine native child leader after join: {exc}",
                _FAILED_CODE,
            ) from exc
        if leader_alive:
            raise _ChildBoundaryTimeout
        reaped = True
        if process.exitcode != 0:
            raise AdapterError(
                f"refine native child exited unsuccessfully ({process.exitcode})",
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
        cleanup_errors = ()
        if started and not reaped:
            cleanup_errors = _cleanup_process(
                process,
                group_leader_pid=group_leader_pid,
            )
            cleanup_handled = True
        if cleanup_errors:
            raise _cleanup_failed_error(str(exc), cleanup_errors) from exc
        raise
    except Exception as exc:
        cleanup_errors = ()
        if started and not reaped:
            cleanup_errors = _cleanup_process(
                process,
                group_leader_pid=group_leader_pid,
            )
            cleanup_handled = True
        detail = (
            f"unexpected refine native boundary failure: {type(exc).__name__}: {exc}"
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
        raise
    finally:
        if started and not reaped and not cleanup_handled:
            cleanup_errors = _cleanup_process(
                process,
                group_leader_pid=group_leader_pid,
            )
            if cleanup_errors:
                raise _cleanup_failed_error(
                    "refine native child cleanup failed",
                    cleanup_errors,
                )
        for connection in (parent_connection, child_connection):
            try:
                connection.close()
            except OSError:
                pass
        if started:
            try:
                leader_alive = process.is_alive()
            except (AssertionError, OSError, ValueError):
                leader_alive = True
            if not leader_alive:
                try:
                    process.close()
                except (OSError, ValueError):
                    pass
