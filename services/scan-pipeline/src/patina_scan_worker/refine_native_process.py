"""Killable POSIX process boundary for future native Refine engine calls.

PyCOLMAP calls into native code and cannot be interrupted safely by a Python
thread timeout.  This module starts a fresh ``spawn`` interpreter, establishes
that child as a new POSIX session, and loads the requested engine entry point
only after the session boundary exists.  The parent accepts a result only after
the session leader exits inside the one shared :class:`RefineDeadline`.

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
from multiprocessing.connection import Connection, wait
from typing import Any, Mapping

from .refine_adapter import AdapterError, RefineDeadline

NATIVE_CHILD_MAX_REQUEST_BYTES = 64 * 1024
NATIVE_CHILD_MAX_RESPONSE_BYTES = 256 * 1024
NATIVE_CHILD_MAX_ERROR_BYTES = 4 * 1024
NATIVE_CHILD_TERM_GRACE_S = 0.10
NATIVE_CHILD_KILL_REAP_S = 1.0

_PROTOCOL_VERSION = 1
_ENTRYPOINT_PATTERN = re.compile(
    r"^[A-Za-z_]\w*(?:\.[A-Za-z_]\w*)*:[A-Za-z_]\w*$"
)
_ACK_ACCEPT = b"accept-v1"
_TIMEOUT_CODE = "REFINE_ENGINE_TIMEOUT"
_FAILED_CODE = "REFINE_ENGINE_FAILED"
_IN_PROCESS_ENTRYPOINT_MARKER = "__patina_refine_in_process_only__"


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


def _json_bytes(value: Any) -> bytes:
    try:
        text = json.dumps(
            value,
            sort_keys=True,
            separators=(",", ":"),
            ensure_ascii=True,
            allow_nan=False,
        )
    except (TypeError, ValueError) as exc:
        raise _ChildTransportError(
            f"native child transport requires finite JSON values: {exc}"
        ) from exc
    return (text + "\n").encode("utf-8")


def _bounded_request(request: Mapping[str, Any]) -> bytes:
    if not isinstance(request, Mapping):
        raise AdapterError(
            "refine native child request must be a JSON object",
            _FAILED_CODE,
        )
    try:
        payload = _json_bytes(dict(request))
    except _ChildTransportError as exc:
        raise AdapterError(str(exc), _FAILED_CODE) from exc
    if len(payload) > NATIVE_CHILD_MAX_REQUEST_BYTES:
        raise AdapterError(
            "refine native child request exceeds the bounded transport",
            _FAILED_CODE,
        )
    return payload


def _truncate_utf8(value: str, maximum_bytes: int) -> str:
    payload = value.encode("utf-8", errors="replace")
    if len(payload) <= maximum_bytes:
        return payload.decode("utf-8")
    return payload[:maximum_bytes].decode("utf-8", errors="ignore") + "..."


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
    payload = _json_bytes(envelope)
    if len(payload) > NATIVE_CHILD_MAX_RESPONSE_BYTES:
        raise _ChildTransportError(
            "native child result exceeds the bounded transport"
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
        raise _ChildTransportError(
            f"native child entry point is not callable: {value}"
        )
    if getattr(target, _IN_PROCESS_ENTRYPOINT_MARKER, False) is not True:
        raise _ChildTransportError(
            "native child entry point must declare the in-process-only contract"
        )
    return target


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
        context.remaining_seconds()
        request = json.loads(request_payload.decode("utf-8"))
        if not isinstance(request, dict):
            raise _ChildTransportError("native child request did not decode to an object")
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
        if connection.poll(context.remaining_seconds()):
            acknowledgement = connection.recv_bytes(len(_ACK_ACCEPT))
            if acknowledgement != _ACK_ACCEPT:
                return
    except (AdapterError, EOFError, OSError):
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


def _signal_group(group_leader_pid: int, sig: signal.Signals) -> str | None:
    try:
        os.killpg(group_leader_pid, sig)
    except ProcessLookupError:
        return None
    except OSError as exc:
        return f"cannot signal native child process group with {sig.name}: {exc}"
    return None


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
            errors.append(error)
        # Do not poll/join the leader before the final group signal: retaining
        # the unreaped leader prevents its PID/process-group ID being reused.
        time.sleep(NATIVE_CHILD_TERM_GRACE_S)
        error = _signal_group(group_leader_pid, signal.SIGKILL)
        if error is not None:
            errors.append(error)
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
        except (AttributeError, ProcessLookupError, AssertionError, OSError, ValueError) as exc:
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
    return tuple(errors)


def _timeout_error(cleanup_errors: tuple[str, ...]) -> AdapterError:
    detail = ""
    if cleanup_errors:
        detail = "; cleanup: " + "; ".join(cleanup_errors)
    return AdapterError(
        "refine native engine child exceeded the shared deadline" + detail,
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
    if not isinstance(entrypoint, str) or _ENTRYPOINT_PATTERN.fullmatch(entrypoint) is None:
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
            cleanup_errors = _terminate_and_reap(
                process,
                group_leader_pid=group_leader_pid,
            )
            cleanup_handled = True
        raise _timeout_error(cleanup_errors) from exc
    except AdapterError as exc:
        cleanup_errors = ()
        if started and not reaped:
            cleanup_errors = _terminate_and_reap(
                process,
                group_leader_pid=group_leader_pid,
            )
            cleanup_handled = True
        if cleanup_errors:
            raise AdapterError(
                str(exc) + "; cleanup: " + "; ".join(cleanup_errors),
                exc.code,
            ) from exc
        raise
    except Exception as exc:
        cleanup_errors = ()
        if started and not reaped:
            cleanup_errors = _terminate_and_reap(
                process,
                group_leader_pid=group_leader_pid,
            )
            cleanup_handled = True
        detail = f"unexpected refine native boundary failure: {type(exc).__name__}: {exc}"
        if cleanup_errors:
            detail += "; cleanup: " + "; ".join(cleanup_errors)
        raise AdapterError(detail, _FAILED_CODE) from exc
    except BaseException as exc:
        cleanup_errors = ()
        if started and not reaped:
            cleanup_errors = _terminate_and_reap(
                process,
                group_leader_pid=group_leader_pid,
            )
            cleanup_handled = True
        if cleanup_errors:
            raise AdapterError(
                "unexpected refine native boundary failure; cleanup: "
                + "; ".join(cleanup_errors),
                _FAILED_CODE,
            ) from exc
        raise
    finally:
        if started and not reaped and not cleanup_handled:
            cleanup_errors = _terminate_and_reap(
                process,
                group_leader_pid=group_leader_pid,
            )
            if cleanup_errors:
                raise AdapterError(
                    "refine native child cleanup failed: "
                    + "; ".join(cleanup_errors),
                    _FAILED_CODE,
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
