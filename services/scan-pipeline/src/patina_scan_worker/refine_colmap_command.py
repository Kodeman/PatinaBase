"""Linux-only supervision for one inherited-process-group COLMAP phase.

This module is a disabled Refine prerequisite, not a production backend.  It
may run only inside the dedicated native session leader.  Every command keeps
that inherited group, reaps its direct child, adopts and reaps exited
descendants with Linux ``PR_SET_CHILD_SUBREAPER``, and refuses to return while
any descendant remains. More precisely, residue prevents a successful return;
an escaped adopted descendant is detected but not yet contained. It never
signals a scanned numeric PID or PGID.
"""

from __future__ import annotations

import ctypes
import os
import stat
import subprocess
import sys
import threading
from collections.abc import Sequence
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from .refine_adapter import (
    COLMAP_LOG_TAIL_BYTES,
    COLMAP_PROCESS_KILL_REAP_S,
    COLMAP_PROCESS_TERM_GRACE_S,
    AdapterError,
    ColmapCommandResult,
    RefineDeadline,
)
from .refine_native_process import NativeChildContext

_ENGINE_FAILED = "REFINE_ENGINE_FAILED"
_ENGINE_TIMEOUT = "REFINE_ENGINE_TIMEOUT"
_ENGINE_CLEANUP_FAILED = "REFINE_ENGINE_CLEANUP_FAILED"
_ENGINE_LOG_IO = "REFINE_ENGINE_LOG_IO"
_PR_SET_CHILD_SUBREAPER = 36
_PR_GET_CHILD_SUBREAPER = 37
_MAX_ADOPTED_REAPS = 4096
_MAX_COMMAND_ARGV_ITEMS = 256
_MAX_COMMAND_ARGV_BYTES = 64 * 1024


def _fail(message: str, code: str) -> AdapterError:
    return AdapterError(message, code)


@dataclass(frozen=True)
class _DirectChildCleanup:
    errors: tuple[str, ...]
    reaped: bool


def _normalize_command_argv(command: Sequence[str]) -> tuple[str, ...]:
    """Materialize bounded exact-string argv without trusting its container."""

    try:
        iterator = iter(command)
    except BaseException:
        raise _fail("cannot normalize inherited COLMAP argv", _ENGINE_FAILED) from None

    argv: list[str] = []
    total_bytes = 0
    for index in range(_MAX_COMMAND_ARGV_ITEMS + 1):
        try:
            part = next(iterator)
        except StopIteration:
            break
        except BaseException:
            raise _fail(
                "cannot normalize inherited COLMAP argv", _ENGINE_FAILED
            ) from None
        if index == _MAX_COMMAND_ARGV_ITEMS:
            raise _fail("COLMAP command argv exceeds the item limit", _ENGINE_FAILED)
        if type(part) is not str or not part or "\x00" in part:
            raise _fail(
                "COLMAP command must be absolute non-empty argv", _ENGINE_FAILED
            )
        try:
            encoded_part = os.fsencode(part)
        except BaseException:
            raise _fail(
                "cannot normalize inherited COLMAP argv", _ENGINE_FAILED
            ) from None
        # Include execve's terminating NUL for each exact argument.
        total_bytes += len(encoded_part) + 1
        if total_bytes > _MAX_COMMAND_ARGV_BYTES:
            raise _fail("COLMAP command argv exceeds the byte limit", _ENGINE_FAILED)
        argv.append(part)

    if not argv:
        raise _fail("COLMAP command must be absolute non-empty argv", _ENGINE_FAILED)
    try:
        command_is_absolute = Path(argv[0]).is_absolute()
    except BaseException:
        raise _fail("cannot validate inherited COLMAP argv", _ENGINE_FAILED) from None
    if not command_is_absolute:
        raise _fail("COLMAP command must be absolute non-empty argv", _ENGINE_FAILED)
    return tuple(argv)


def _direct_child_reaped(
    process: subprocess.Popen[bytes],
) -> tuple[bool, str | None]:
    try:
        return process.poll() is not None, None
    except BaseException:
        return False, "cannot inspect inherited COLMAP child"


def _terminate_direct_child(
    process: subprocess.Popen[bytes],
) -> _DirectChildCleanup:
    """Boundedly stop one direct child while its unreaped PID is still owned."""

    errors: list[str] = []
    reaped, inspection_error = _direct_child_reaped(process)
    if inspection_error is not None:
        # A failed wait/poll means the numeric PID may no longer identify our
        # child. Do not signal it. The outer native owner will clean the whole
        # inherited group while its original leader still reserves the PGID.
        return _DirectChildCleanup((inspection_error,), False)
    if reaped:
        return _DirectChildCleanup((), True)

    try:
        process.terminate()
    except ProcessLookupError:
        pass
    except BaseException:
        errors.append("cannot terminate inherited COLMAP child")
    try:
        process.wait(timeout=COLMAP_PROCESS_TERM_GRACE_S)
    except subprocess.TimeoutExpired:
        pass
    except BaseException:
        errors.append("cannot wait for terminated inherited COLMAP child")
    else:
        return _DirectChildCleanup(tuple(errors), True)

    reaped, inspection_error = _direct_child_reaped(process)
    if inspection_error is not None:
        errors.append(inspection_error)
        return _DirectChildCleanup(tuple(errors), False)
    if reaped:
        return _DirectChildCleanup(tuple(errors), True)

    try:
        process.kill()
    except ProcessLookupError:
        pass
    except BaseException:
        errors.append("cannot kill inherited COLMAP child")
    try:
        process.wait(timeout=COLMAP_PROCESS_KILL_REAP_S)
    except subprocess.TimeoutExpired:
        errors.append("inherited COLMAP child could not be reaped")
    except BaseException:
        errors.append("cannot wait for killed inherited COLMAP child")
    else:
        return _DirectChildCleanup(tuple(errors), True)

    reaped, inspection_error = _direct_child_reaped(process)
    if inspection_error is not None:
        errors.append(inspection_error)
    return _DirectChildCleanup(tuple(errors), reaped)


def _linux_child_subreaper_state() -> bool:
    if not sys.platform.startswith("linux"):
        raise _fail(
            "inherited COLMAP command quiescence requires Linux child subreapers",
            _ENGINE_CLEANUP_FAILED,
        )
    try:
        libc = ctypes.CDLL(None, use_errno=True)
        prctl = libc.prctl
        prctl.restype = ctypes.c_int
        state = ctypes.c_int()
        result = prctl(
            _PR_GET_CHILD_SUBREAPER,
            ctypes.byref(state),
            0,
            0,
            0,
        )
        if result != 0 or state.value not in (0, 1):
            raise RuntimeError
        return state.value == 1
    except BaseException:
        raise _fail(
            "cannot inspect Linux child subreaper state",
            _ENGINE_CLEANUP_FAILED,
        ) from None


def _set_linux_child_subreaper(enabled: bool) -> None:
    if type(enabled) is not bool or not sys.platform.startswith("linux"):
        raise _fail(
            "cannot configure Linux child subreaper state",
            _ENGINE_CLEANUP_FAILED,
        )
    try:
        libc = ctypes.CDLL(None, use_errno=True)
        prctl = libc.prctl
        prctl.restype = ctypes.c_int
        if prctl(_PR_SET_CHILD_SUBREAPER, int(enabled), 0, 0, 0) != 0:
            raise RuntimeError
    except BaseException:
        raise _fail(
            "cannot configure Linux child subreaper state",
            _ENGINE_CLEANUP_FAILED,
        ) from None


def _enable_linux_child_subreaper() -> bool:
    """Return the prior state after enabling adoption for this one CLI phase."""

    previous = _linux_child_subreaper_state()
    if previous:
        return True
    _set_linux_child_subreaper(True)
    try:
        if _linux_child_subreaper_state() is not True:
            raise RuntimeError
    except BaseException:
        try:
            _set_linux_child_subreaper(False)
        except BaseException:
            raise _fail(
                "cannot restore Linux child subreaper after activation failure",
                _ENGINE_CLEANUP_FAILED,
            ) from None
        raise _fail(
            "cannot verify Linux child subreaper activation",
            _ENGINE_CLEANUP_FAILED,
        ) from None
    return False


def _restore_linux_child_subreaper(previous: bool | None) -> tuple[str, ...]:
    if previous is None or previous is True:
        return ()
    try:
        _set_linux_child_subreaper(False)
        if _linux_child_subreaper_state() is not False:
            raise RuntimeError
    except BaseException:
        return ("cannot restore Linux child subreaper state",)
    return ()


def _deadline_still_available(deadline: RefineDeadline) -> bool:
    try:
        deadline.remaining_seconds()
    except BaseException:
        return False
    return True


def _pre_command_child_errors(
    *,
    deadline: RefineDeadline,
) -> tuple[str, ...]:
    """Prove this dedicated native owner has no child before launch.

    ``waitid(..., WNOWAIT)`` detects an exited child without reaping it.  Only
    after that non-consuming check reports none do we use ``waitpid`` to
    distinguish a live child (zero) from ECHILD.  This establishes that every
    child adopted after launch belongs to this command, including a descendant
    that escapes the inherited process group.
    """

    while True:
        try:
            pending = os.waitid(
                os.P_ALL,
                0,
                os.WEXITED | os.WNOHANG | os.WNOWAIT,
            )
        except InterruptedError:
            if _deadline_still_available(deadline):
                continue
            return ("pre-command child inspection exceeded the carried deadline",)
        except ChildProcessError:
            return ()
        except BaseException:
            return ("cannot inspect pre-command native child ownership",)
        if pending is not None:
            return ("dedicated native owner retained a pre-command child",)
        break

    while True:
        try:
            child_pid, _status = os.waitpid(-1, os.WNOHANG)
        except InterruptedError:
            if _deadline_still_available(deadline):
                continue
            return ("pre-command child inspection exceeded the carried deadline",)
        except ChildProcessError:
            return ()
        except BaseException:
            return ("cannot prove pre-command native child ownership",)
        if child_pid == 0:
            return ("dedicated native owner has a live pre-command child",)
        # A child exited between WNOWAIT and waitpid. The race is fail-closed;
        # this dedicated owner had no authority to start another phase.
        return ("dedicated native owner reaped an unexpected pre-command child",)


def _post_command_quiescence_errors(
    *,
    deadline: RefineDeadline,
) -> tuple[str, ...]:
    """Reap adopted command descendants and refuse any live residue."""

    errors: list[str] = []
    # The native process is a temporary Linux subreaper and had no child
    # immediately before launch. Therefore every child matched here belongs to
    # this command, including an adopted descendant that called setsid/setpgid.
    # No numeric PID or PGID is ever signalled.
    for _attempt in range(_MAX_ADOPTED_REAPS):
        try:
            adopted_pid, _status = os.waitpid(-1, os.WNOHANG)
        except InterruptedError:
            if not _deadline_still_available(deadline):
                errors.append(
                    "inherited COLMAP descendant wait exceeded the carried deadline"
                )
                break
            continue
        except ChildProcessError:
            break
        except BaseException:
            errors.append("cannot reap adopted inherited COLMAP descendants")
            break
        if adopted_pid == 0:
            errors.append("native owner retains a live adopted COLMAP descendant")
            break
        if adopted_pid < 0:
            errors.append("inherited COLMAP descendant wait returned invalid identity")
            break
    else:
        errors.append("inherited COLMAP command produced too many descendants")

    return tuple(errors)


def _validate_private_command_workspace(cwd: Path, log_path: Path) -> None:
    try:
        absolute_paths = cwd.is_absolute() and log_path.is_absolute()
    except BaseException:
        raise _fail(
            "cannot validate COLMAP command workspace paths", _ENGINE_FAILED
        ) from None
    if not absolute_paths:
        raise _fail(
            "COLMAP command workspace and log path must be absolute", _ENGINE_FAILED
        )
    try:
        cwd_metadata = os.lstat(cwd)
    except BaseException:
        raise _fail("cannot inspect COLMAP command workspace", _ENGINE_FAILED) from None
    if (
        not stat.S_ISDIR(cwd_metadata.st_mode)
        or stat.S_ISLNK(cwd_metadata.st_mode)
        or cwd_metadata.st_uid != os.geteuid()
        or stat.S_IMODE(cwd_metadata.st_mode) != 0o700
    ):
        raise _fail(
            "COLMAP command workspace must be an owned private 0700 directory",
            _ENGINE_FAILED,
        )
    try:
        resolved_cwd = cwd.resolve(strict=True)
    except BaseException:
        raise _fail("cannot resolve COLMAP command workspace", _ENGINE_FAILED) from None
    if resolved_cwd != cwd:
        raise _fail(
            "COLMAP command workspace may not traverse a symlink", _ENGINE_FAILED
        )
    try:
        direct_child = log_path.parent == cwd
    except BaseException:
        raise _fail("cannot validate COLMAP command log path", _ENGINE_FAILED) from None
    try:
        os.lstat(log_path)
    except FileNotFoundError:
        log_exists = False
    except BaseException:
        raise _fail("cannot inspect COLMAP command log path", _ENGINE_FAILED) from None
    else:
        log_exists = True
    if not direct_child or log_exists:
        raise _fail(
            "COLMAP command log must be a new direct workspace child",
            _ENGINE_FAILED,
        )


def _shared_remaining_seconds(
    context: NativeChildContext,
    deadline: RefineDeadline,
) -> float:
    try:
        return min(
            context.remaining_seconds(),
            deadline.remaining_seconds(),
        )
    except AdapterError:
        raise
    except BaseException:
        raise _fail("cannot read inherited COLMAP deadline", _ENGINE_FAILED) from None


def run_inherited_colmap_command(
    command: Sequence[str],
    *,
    context: NativeChildContext,
    deadline: RefineDeadline,
    log_path: Path,
    cwd: Path,
) -> ColmapCommandResult:
    """Run one Linux CLI phase and prove the inherited group is quiescent."""

    try:
        process_id = os.getpid()
        native_owner = (
            os.name == "posix"
            and sys.platform.startswith("linux")
            and os.getsid(0) == process_id
            and os.getpgrp() == process_id
        )
    except BaseException:
        raise _fail(
            "cannot inspect inherited COLMAP command process isolation",
            _ENGINE_FAILED,
        ) from None
    if not native_owner:
        raise _fail(
            "inherited COLMAP commands require the dedicated Linux "
            "native child session",
            _ENGINE_FAILED,
        )
    normalized_command = _normalize_command_argv(command)
    _validate_private_command_workspace(cwd, log_path)
    _shared_remaining_seconds(context, deadline)

    tail = bytearray()
    drain_errors: list[str] = []
    drain_cleanup_errors: list[str] = []
    cleanup_errors: list[str] = []
    previous_subreaper: bool | None = None
    log_descriptor: int | None = None
    process: subprocess.Popen[bytes] | None = None
    output_stream: Any = None
    thread: threading.Thread | None = None
    thread_started = False
    direct_child_reaped = False
    launch_attempted = False
    remove_log = False
    primary_error: AdapterError | None = None
    returncode: int | None = None

    try:
        previous_subreaper = _enable_linux_child_subreaper()
        preflight_errors = _pre_command_child_errors(deadline=deadline)
        if preflight_errors:
            cleanup_errors.extend(preflight_errors)
        else:
            try:
                log_descriptor = os.open(
                    log_path,
                    os.O_CREAT | os.O_EXCL | os.O_WRONLY | getattr(os, "O_NOFOLLOW", 0),
                    0o600,
                )
            except BaseException:
                primary_error = _fail(
                    "cannot create inherited COLMAP log", _ENGINE_LOG_IO
                )
            if log_descriptor is not None:
                launch_attempted = True
                try:
                    process = subprocess.Popen(
                        list(normalized_command),
                        cwd=cwd,
                        stdout=subprocess.PIPE,
                        stderr=subprocess.STDOUT,
                        bufsize=0,
                        start_new_session=False,
                    )
                except BaseException:
                    primary_error = _fail(
                        "cannot start inherited COLMAP child", _ENGINE_FAILED
                    )
                    remove_log = True
                if process is not None:
                    try:
                        output_stream = process.stdout
                    except BaseException:
                        primary_error = _fail(
                            "cannot inspect inherited COLMAP output pipe",
                            _ENGINE_FAILED,
                        )
                    if output_stream is None and primary_error is None:
                        primary_error = _fail(
                            "inherited COLMAP child did not expose its output pipe",
                            _ENGINE_FAILED,
                        )

                def drain() -> None:
                    assert output_stream is not None
                    assert log_descriptor is not None
                    try:
                        while True:
                            block = output_stream.read(16 * 1024)
                            if not block:
                                break
                            tail.extend(block)
                            if len(tail) > COLMAP_LOG_TAIL_BYTES:
                                del tail[: len(tail) - COLMAP_LOG_TAIL_BYTES]
                            os.ftruncate(log_descriptor, 0)
                            offset = 0
                            while offset < len(tail):
                                written = os.pwrite(
                                    log_descriptor,
                                    tail[offset:],
                                    offset,
                                )
                                if type(written) is not int or written <= 0:
                                    raise OSError
                                offset += written
                    except BaseException:
                        drain_errors.append(
                            "cannot retain bounded inherited COLMAP output"
                        )
                    finally:
                        try:
                            output_stream.close()
                        except BaseException:
                            drain_cleanup_errors.append(
                                "cannot close inherited COLMAP output pipe"
                            )

                if process is not None and primary_error is None:
                    try:
                        thread = threading.Thread(
                            target=drain,
                            name="colmap-inherited-log-drain",
                            daemon=True,
                        )
                    except BaseException:
                        primary_error = _fail(
                            "cannot create COLMAP log drain", _ENGINE_FAILED
                        )
                    if thread is not None:
                        try:
                            thread.start()
                        except BaseException:
                            primary_error = _fail(
                                "cannot start COLMAP log drain", _ENGINE_FAILED
                            )
                        else:
                            thread_started = True

                if process is not None and thread_started and primary_error is None:
                    try:
                        remaining = _shared_remaining_seconds(context, deadline)
                    except AdapterError as exc:
                        primary_error = exc
                    if primary_error is None:
                        try:
                            returncode = process.wait(timeout=remaining)
                        except subprocess.TimeoutExpired:
                            primary_error = _fail(
                                "COLMAP command exceeded the carried RefineDeadline",
                                _ENGINE_TIMEOUT,
                            )
                        except BaseException:
                            primary_error = _fail(
                                "cannot wait for inherited COLMAP child",
                                _ENGINE_FAILED,
                            )
                        else:
                            direct_child_reaped = True
    except AdapterError as exc:
        primary_error = exc
    except BaseException:
        primary_error = _fail("inherited COLMAP command setup failed", _ENGINE_FAILED)
    finally:
        if process is not None and not direct_child_reaped:
            direct_cleanup = _terminate_direct_child(process)
            cleanup_errors.extend(direct_cleanup.errors)
            direct_child_reaped = direct_cleanup.reaped

        if thread_started and thread is not None:
            try:
                thread.join(COLMAP_PROCESS_KILL_REAP_S)
            except BaseException:
                cleanup_errors.append("cannot join inherited COLMAP log drain")
            try:
                thread_alive = thread.is_alive()
            except BaseException:
                cleanup_errors.append("cannot inspect inherited COLMAP log drain")
                thread_alive = True
            if thread_alive and output_stream is not None:
                try:
                    output_stream.close()
                except BaseException:
                    cleanup_errors.append("cannot close inherited COLMAP output pipe")
                try:
                    thread.join(COLMAP_PROCESS_KILL_REAP_S)
                except BaseException:
                    cleanup_errors.append(
                        "cannot retry joining inherited COLMAP log drain"
                    )
                try:
                    thread_alive = thread.is_alive()
                except BaseException:
                    cleanup_errors.append(
                        "cannot confirm inherited COLMAP log drain exit"
                    )
                    thread_alive = True
            if thread_alive:
                cleanup_errors.append("inherited COLMAP log drain did not stop")
        elif output_stream is not None:
            try:
                output_stream.close()
            except BaseException:
                cleanup_errors.append("cannot close inherited COLMAP output pipe")

        cleanup_errors.extend(drain_cleanup_errors)

        if launch_attempted:
            if process is None or direct_child_reaped:
                cleanup_errors.extend(
                    _post_command_quiescence_errors(
                        deadline=deadline,
                    )
                )
            else:
                cleanup_errors.append(
                    "cannot prove inherited COLMAP group with an unreaped direct child"
                )

        if log_descriptor is not None:
            try:
                os.fsync(log_descriptor)
            except BaseException:
                cleanup_errors.append("cannot synchronize inherited COLMAP log")
            try:
                os.close(log_descriptor)
            except BaseException:
                cleanup_errors.append("cannot close inherited COLMAP log")

        if remove_log:
            try:
                log_path.unlink()
            except BaseException:
                cleanup_errors.append("cannot remove failed inherited COLMAP log")

        cleanup_errors.extend(_restore_linux_child_subreaper(previous_subreaper))

    if cleanup_errors:
        raise _fail(
            "; ".join(cleanup_errors),
            _ENGINE_CLEANUP_FAILED,
        ) from None
    if drain_errors:
        raise _fail(drain_errors[0], _ENGINE_LOG_IO) from None
    if primary_error is not None:
        raise primary_error from None
    _shared_remaining_seconds(context, deadline)
    if returncode is None:
        raise _fail(
            "inherited COLMAP command has no normalized return code",
            _ENGINE_FAILED,
        )
    try:
        output_tail = bytes(tail).decode("utf-8", errors="replace")
    except BaseException:
        raise _fail("cannot decode inherited COLMAP output", _ENGINE_LOG_IO) from None
    if returncode != 0:
        raise _fail(
            f"COLMAP command failed ({returncode}): " + output_tail[-2000:],
            _ENGINE_FAILED,
        )
    return ColmapCommandResult(returncode, log_path, output_tail)
