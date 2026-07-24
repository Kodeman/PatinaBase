from __future__ import annotations

import io
import os
import signal
import subprocess
import sys
import time
from pathlib import Path

import pytest
from patina_scan_worker import refine_colmap_command as command_module
from patina_scan_worker.refine_adapter import AdapterError, RefineDeadline
from patina_scan_worker.refine_colmap_backend import run_inherited_colmap_command
from patina_scan_worker.refine_native_process import (
    NativeChildContext,
    native_engine_entrypoint,
    run_native_engine_child,
)


def _deadline(seconds: float = 5.0) -> RefineDeadline:
    return RefineDeadline(time.monotonic() + seconds)


def _fake_cli(tmp_path: Path, program: str) -> Path:
    path = tmp_path / "fake-colmap"
    path.write_text(f"#!{sys.executable}\n{program}\n", encoding="utf-8")
    path.chmod(0o700)
    return path


def _patch_unit_host(monkeypatch) -> None:
    process_id = os.getpid()
    monkeypatch.setattr(command_module.sys, "platform", "linux")
    monkeypatch.setattr(command_module.os, "getsid", lambda _pid: process_id)
    monkeypatch.setattr(command_module.os, "getpgrp", lambda: process_id)
    monkeypatch.setattr(
        command_module,
        "_enable_linux_child_subreaper",
        lambda: True,
    )
    monkeypatch.setattr(
        command_module,
        "_restore_linux_child_subreaper",
        lambda _previous: (),
    )
    monkeypatch.setattr(
        command_module,
        "_pre_command_child_errors",
        lambda **_kwargs: (),
    )
    monkeypatch.setattr(
        command_module,
        "_post_command_quiescence_errors",
        lambda **_kwargs: (),
    )


def _run_unit_command(tmp_path: Path, fake: Path, name: str = "command.log"):
    tmp_path.chmod(0o700)
    return run_inherited_colmap_command(
        (str(fake), "point_triangulator"),
        context=NativeChildContext(time.monotonic() + 30.0),
        deadline=_deadline(10.0),
        log_path=tmp_path / name,
        cwd=tmp_path,
    )


def test_subreaper_prior_state_is_restored_only_when_runner_changed_it(
    monkeypatch,
):
    states = iter((False, True, False))
    writes: list[bool] = []
    monkeypatch.setattr(
        command_module,
        "_linux_child_subreaper_state",
        lambda: next(states),
    )
    monkeypatch.setattr(
        command_module,
        "_set_linux_child_subreaper",
        writes.append,
    )

    previous = command_module._enable_linux_child_subreaper()
    restored = command_module._restore_linux_child_subreaper(previous)

    assert previous is False
    assert restored == ()
    assert writes == [True, False]


def test_existing_subreaper_state_is_neither_changed_nor_restored(monkeypatch):
    writes: list[bool] = []
    monkeypatch.setattr(
        command_module,
        "_linux_child_subreaper_state",
        lambda: True,
    )
    monkeypatch.setattr(
        command_module,
        "_set_linux_child_subreaper",
        writes.append,
    )

    previous = command_module._enable_linux_child_subreaper()
    restored = command_module._restore_linux_child_subreaper(previous)

    assert previous is True
    assert restored == ()
    assert writes == []


@pytest.mark.parametrize(
    ("operation", "message"),
    (
        (
            command_module._PR_GET_CHILD_SUBREAPER,
            "cannot inspect Linux child subreaper state",
        ),
        (
            command_module._PR_SET_CHILD_SUBREAPER,
            "cannot configure Linux child subreaper state",
        ),
    ),
)
def test_prctl_get_and_set_failures_are_fixed_cleanup_errors(
    monkeypatch,
    operation,
    message,
):
    class FailingPrctl:
        restype = None

        def __call__(self, requested, *_args):
            return -1 if requested == operation else 0

    class Libc:
        prctl = FailingPrctl()

    monkeypatch.setattr(command_module.sys, "platform", "linux")
    monkeypatch.setattr(command_module.ctypes, "CDLL", lambda *_args, **_kwargs: Libc())

    with pytest.raises(AdapterError) as raised:
        if operation == command_module._PR_GET_CHILD_SUBREAPER:
            command_module._linux_child_subreaper_state()
        else:
            command_module._set_linux_child_subreaper(True)

    assert raised.value.code == "REFINE_ENGINE_CLEANUP_FAILED"
    assert str(raised.value) == message
    assert raised.value.__cause__ is None


def test_subreaper_verification_failure_restores_prior_state(monkeypatch):
    states = iter((False, RuntimeError("DO_NOT_LEAK_VERIFY")))
    writes: list[bool] = []

    def state():
        result = next(states)
        if isinstance(result, BaseException):
            raise result
        return result

    monkeypatch.setattr(command_module, "_linux_child_subreaper_state", state)
    monkeypatch.setattr(
        command_module,
        "_set_linux_child_subreaper",
        writes.append,
    )

    with pytest.raises(AdapterError) as raised:
        command_module._enable_linux_child_subreaper()

    assert raised.value.code == "REFINE_ENGINE_CLEANUP_FAILED"
    assert str(raised.value) == "cannot verify Linux child subreaper activation"
    assert writes == [True, False]
    assert "DO_NOT_LEAK" not in str(raised.value)


def test_subreaper_restore_failure_is_fixed_cleanup_error(monkeypatch):
    monkeypatch.setattr(
        command_module,
        "_set_linux_child_subreaper",
        lambda _enabled: (_ for _ in ()).throw(RuntimeError("DO_NOT_LEAK_RESTORE")),
    )

    assert command_module._restore_linux_child_subreaper(False) == (
        "cannot restore Linux child subreaper state",
    )


def test_non_linux_host_rejects_before_popen(monkeypatch, tmp_path):
    fake = _fake_cli(tmp_path, "print('unused')")
    tmp_path.chmod(0o700)
    popen_called = False
    monkeypatch.setattr(command_module.sys, "platform", "darwin")

    def popen(*_args, **_kwargs):
        nonlocal popen_called
        popen_called = True
        raise AssertionError

    monkeypatch.setattr(command_module.subprocess, "Popen", popen)

    with pytest.raises(AdapterError) as raised:
        run_inherited_colmap_command(
            (str(fake), "point_triangulator"),
            context=NativeChildContext(time.monotonic() + 30.0),
            deadline=_deadline(),
            log_path=tmp_path / "never-created.log",
            cwd=tmp_path,
        )

    assert raised.value.code == "REFINE_ENGINE_FAILED"
    assert "dedicated Linux native child session" in str(raised.value)
    assert popen_called is False


def test_post_command_wait_retries_eintr_and_reaps_all_adopted_children(
    monkeypatch,
):
    calls: list[int] = []
    results = iter(
        (
            InterruptedError(),
            (43210, 0),
            ChildProcessError(),
        )
    )

    def waitpid(pid: int, _options: int):
        calls.append(pid)
        result = next(results)
        if isinstance(result, BaseException):
            raise result
        return result

    monkeypatch.setattr(command_module.os, "waitpid", waitpid)
    errors = command_module._post_command_quiescence_errors(
        deadline=_deadline(),
    )

    assert errors == ()
    # -1 deliberately includes an adopted descendant that called setsid.
    assert calls == [-1, -1, -1]


def test_post_command_live_adopted_child_is_cleanup_failure(monkeypatch):
    monkeypatch.setattr(
        command_module.os,
        "waitpid",
        lambda _pid, _options: (0, 0),
    )
    errors = command_module._post_command_quiescence_errors(
        deadline=_deadline(),
    )

    assert errors == ("native owner retains a live adopted COLMAP descendant",)


def test_post_command_eintr_after_deadline_is_cleanup_failure(monkeypatch):
    monkeypatch.setattr(
        command_module.os,
        "waitpid",
        lambda _pid, _options: (_ for _ in ()).throw(InterruptedError()),
    )

    errors = command_module._post_command_quiescence_errors(
        deadline=RefineDeadline(time.monotonic() - 1.0),
    )

    assert errors == ("inherited COLMAP descendant wait exceeded the carried deadline",)


def test_post_command_invalid_wait_identity_is_cleanup_failure(monkeypatch):
    monkeypatch.setattr(
        command_module.os,
        "waitpid",
        lambda _pid, _options: (-2, 0),
    )

    errors = command_module._post_command_quiescence_errors(
        deadline=_deadline(),
    )

    assert errors == ("inherited COLMAP descendant wait returned invalid identity",)


def test_post_command_reap_cap_is_cleanup_failure(monkeypatch):
    monkeypatch.setattr(command_module, "_MAX_ADOPTED_REAPS", 2)
    monkeypatch.setattr(
        command_module.os,
        "waitpid",
        lambda _pid, _options: (43210, 0),
    )

    errors = command_module._post_command_quiescence_errors(
        deadline=_deadline(),
    )

    assert errors == ("inherited COLMAP command produced too many descendants",)


def test_pre_command_waitid_does_not_reap_an_unexpected_child(monkeypatch):
    sentinel = object()
    waitpid_called = False
    monkeypatch.setattr(
        command_module.os,
        "waitid",
        lambda *_args: sentinel,
        raising=False,
    )

    def waitpid(_pid: int, _options: int):
        nonlocal waitpid_called
        waitpid_called = True
        raise AssertionError

    monkeypatch.setattr(command_module.os, "waitpid", waitpid)

    errors = command_module._pre_command_child_errors(deadline=_deadline())

    assert errors == ("dedicated native owner retained a pre-command child",)
    assert waitpid_called is False


def test_cwd_resolve_exception_is_fixed_and_does_not_leak_details(
    monkeypatch,
    tmp_path,
):
    fake = _fake_cli(tmp_path, "print('unused')")
    _patch_unit_host(monkeypatch)
    monkeypatch.setattr(
        Path,
        "resolve",
        lambda *_args, **_kwargs: (_ for _ in ()).throw(
            RuntimeError("DO_NOT_LEAK_RESOLVE")
        ),
    )

    with pytest.raises(AdapterError) as raised:
        _run_unit_command(tmp_path, fake)

    assert raised.value.code == "REFINE_ENGINE_FAILED"
    assert str(raised.value) == "cannot resolve COLMAP command workspace"
    assert raised.value.__cause__ is None
    assert "DO_NOT_LEAK" not in str(raised.value)


def test_popen_exception_is_fixed_and_cleanup_failure_takes_precedence(
    monkeypatch,
    tmp_path,
):
    fake = _fake_cli(tmp_path, "print('unused')")
    _patch_unit_host(monkeypatch)
    monkeypatch.setattr(
        command_module.subprocess,
        "Popen",
        lambda *_args, **_kwargs: (_ for _ in ()).throw(
            RuntimeError("DO_NOT_LEAK_POPEN")
        ),
    )
    monkeypatch.setattr(
        Path,
        "unlink",
        lambda *_args, **_kwargs: (_ for _ in ()).throw(
            RuntimeError("DO_NOT_LEAK_UNLINK")
        ),
    )

    with pytest.raises(AdapterError) as raised:
        _run_unit_command(tmp_path, fake)

    assert raised.value.code == "REFINE_ENGINE_CLEANUP_FAILED"
    assert str(raised.value) == "cannot remove failed inherited COLMAP log"
    assert raised.value.__cause__ is None
    assert "DO_NOT_LEAK" not in str(raised.value)


def test_thread_start_exception_is_fixed_after_direct_child_reap(
    monkeypatch,
    tmp_path,
):
    fake = _fake_cli(tmp_path, "import time; time.sleep(30)")
    _patch_unit_host(monkeypatch)
    monkeypatch.setattr(
        command_module.threading.Thread,
        "start",
        lambda _self: (_ for _ in ()).throw(RuntimeError("DO_NOT_LEAK_THREAD_START")),
    )

    with pytest.raises(AdapterError) as raised:
        _run_unit_command(tmp_path, fake)

    assert raised.value.code == "REFINE_ENGINE_FAILED"
    assert str(raised.value) == "cannot start COLMAP log drain"
    assert raised.value.__cause__ is None


def test_wait_exception_is_fixed_after_direct_child_reap(
    monkeypatch,
    tmp_path,
):
    fake = _fake_cli(tmp_path, "import time; time.sleep(30)")
    _patch_unit_host(monkeypatch)
    real_wait = subprocess.Popen.wait
    first = True

    def wait(process, timeout=None):
        nonlocal first
        if first:
            first = False
            raise RuntimeError("DO_NOT_LEAK_WAIT")
        return real_wait(process, timeout)

    monkeypatch.setattr(command_module.subprocess.Popen, "wait", wait)

    with pytest.raises(AdapterError) as raised:
        _run_unit_command(tmp_path, fake)

    assert raised.value.code == "REFINE_ENGINE_FAILED"
    assert str(raised.value) == "cannot wait for inherited COLMAP child"
    assert raised.value.__cause__ is None


@pytest.mark.parametrize(
    ("fault", "message"),
    (
        ("poll", "cannot inspect inherited COLMAP child"),
        ("terminate", "cannot terminate inherited COLMAP child"),
        ("wait-terminated", "cannot wait for terminated inherited COLMAP child"),
        ("kill", "cannot kill inherited COLMAP child"),
        ("wait-killed", "cannot wait for killed inherited COLMAP child"),
    ),
)
def test_direct_child_cleanup_faults_override_primary_failure(
    monkeypatch,
    tmp_path,
    fault,
    message,
):
    fake = _fake_cli(tmp_path, "print('unused')")
    _patch_unit_host(monkeypatch)
    events: list[str] = []

    class ScriptedProcess:
        def __init__(self):
            self.stdout = io.BytesIO()
            self.wait_calls = 0

        def poll(self):
            events.append("poll")
            if fault == "poll":
                raise RuntimeError("DO_NOT_LEAK_POLL")
            if fault == "wait-killed" and self.wait_calls >= 2:
                return -signal.SIGKILL
            return None

        def terminate(self):
            events.append("terminate")
            if fault == "terminate":
                raise RuntimeError("DO_NOT_LEAK_TERMINATE")

        def wait(self, timeout=None):
            events.append("wait")
            self.wait_calls += 1
            if fault == "wait-terminated" and self.wait_calls == 1:
                raise RuntimeError("DO_NOT_LEAK_WAIT_TERMINATED")
            if fault in {"kill", "wait-killed"} and self.wait_calls == 1:
                raise subprocess.TimeoutExpired("fake-colmap", timeout)
            if fault == "wait-killed" and self.wait_calls == 2:
                raise RuntimeError("DO_NOT_LEAK_WAIT_KILLED")
            return 0

        def kill(self):
            events.append("kill")
            if fault == "kill":
                raise RuntimeError("DO_NOT_LEAK_KILL")

    scripted = ScriptedProcess()
    monkeypatch.setattr(
        command_module.subprocess,
        "Popen",
        lambda *_args, **_kwargs: scripted,
    )
    monkeypatch.setattr(
        command_module.threading.Thread,
        "start",
        lambda _self: (_ for _ in ()).throw(
            RuntimeError("DO_NOT_LEAK_PRIMARY_THREAD_START")
        ),
    )

    with pytest.raises(AdapterError) as raised:
        _run_unit_command(tmp_path, fake, name=f"{fault}.log")

    assert raised.value.code == "REFINE_ENGINE_CLEANUP_FAILED"
    assert message in str(raised.value)
    assert raised.value.__cause__ is None
    assert "DO_NOT_LEAK" not in str(raised.value)
    if fault == "poll":
        assert events == ["poll"]


def test_log_drain_thread_is_daemonized(monkeypatch, tmp_path):
    fake = _fake_cli(tmp_path, "print('done')")
    _patch_unit_host(monkeypatch)
    real_thread = command_module.threading.Thread
    daemon_values: list[object] = []

    def thread(*args, **kwargs):
        daemon_values.append(kwargs.get("daemon"))
        return real_thread(*args, **kwargs)

    monkeypatch.setattr(command_module.threading, "Thread", thread)

    result = _run_unit_command(tmp_path, fake, name="daemon.log")

    assert result.returncode == 0
    assert daemon_values == [True]


def test_log_drain_join_failure_is_cleanup_failure(monkeypatch, tmp_path):
    fake = _fake_cli(tmp_path, "print('done')")
    _patch_unit_host(monkeypatch)
    real_join = command_module.threading.Thread.join

    def join(thread, timeout=None):
        if thread.name == "colmap-inherited-log-drain":
            raise RuntimeError("DO_NOT_LEAK_JOIN")
        return real_join(thread, timeout)

    monkeypatch.setattr(command_module.threading.Thread, "join", join)

    with pytest.raises(AdapterError) as raised:
        _run_unit_command(tmp_path, fake, name="join.log")

    assert raised.value.code == "REFINE_ENGINE_CLEANUP_FAILED"
    assert str(raised.value) == "cannot join inherited COLMAP log drain"
    assert raised.value.__cause__ is None
    assert "DO_NOT_LEAK" not in str(raised.value)


def test_log_drain_is_alive_failures_are_cleanup_failures(monkeypatch, tmp_path):
    fake = _fake_cli(tmp_path, "print('done')")
    _patch_unit_host(monkeypatch)

    def is_alive(thread):
        if thread.name == "colmap-inherited-log-drain":
            raise RuntimeError("DO_NOT_LEAK_IS_ALIVE")
        return False

    monkeypatch.setattr(command_module.threading.Thread, "is_alive", is_alive)

    with pytest.raises(AdapterError) as raised:
        _run_unit_command(tmp_path, fake, name="is-alive.log")

    assert raised.value.code == "REFINE_ENGINE_CLEANUP_FAILED"
    assert "cannot inspect inherited COLMAP log drain" in str(raised.value)
    assert "cannot confirm inherited COLMAP log drain exit" in str(raised.value)
    assert "inherited COLMAP log drain did not stop" in str(raised.value)
    assert raised.value.__cause__ is None
    assert "DO_NOT_LEAK" not in str(raised.value)


def test_stdout_read_exception_is_fixed_log_io_failure(
    monkeypatch,
    tmp_path,
):
    fake = _fake_cli(tmp_path, "print('unused')")
    _patch_unit_host(monkeypatch)
    real_popen = subprocess.Popen

    class BrokenRead:
        def __init__(self, stream):
            self._stream = stream

        def read(self, _size):
            raise RuntimeError("DO_NOT_LEAK_READ")

        def close(self):
            return self._stream.close()

    def popen(*args, **kwargs):
        process = real_popen(*args, **kwargs)
        process.stdout = BrokenRead(process.stdout)
        return process

    monkeypatch.setattr(command_module.subprocess, "Popen", popen)

    with pytest.raises(AdapterError) as raised:
        _run_unit_command(tmp_path, fake)

    assert raised.value.code == "REFINE_ENGINE_LOG_IO"
    assert str(raised.value) == "cannot retain bounded inherited COLMAP output"
    assert raised.value.__cause__ is None


def test_stdout_close_exception_is_cleanup_failure_without_raw_leak(
    monkeypatch,
    tmp_path,
):
    fake = _fake_cli(tmp_path, "print('done')")
    _patch_unit_host(monkeypatch)
    real_popen = subprocess.Popen

    class BrokenClose:
        def __init__(self, stream):
            self._stream = stream

        def read(self, size):
            return self._stream.read(size)

        def close(self):
            self._stream.close()
            raise RuntimeError("DO_NOT_LEAK_STDOUT_CLOSE")

    def popen(*args, **kwargs):
        process = real_popen(*args, **kwargs)
        process.stdout = BrokenClose(process.stdout)
        return process

    monkeypatch.setattr(command_module.subprocess, "Popen", popen)

    with pytest.raises(AdapterError) as raised:
        _run_unit_command(tmp_path, fake, name="stdout-close.log")

    assert raised.value.code == "REFINE_ENGINE_CLEANUP_FAILED"
    assert str(raised.value) == "cannot close inherited COLMAP output pipe"
    assert raised.value.__cause__ is None
    assert "DO_NOT_LEAK" not in str(raised.value)


def test_log_close_exception_is_cleanup_failure_without_raw_leak(
    monkeypatch,
    tmp_path,
):
    fake = _fake_cli(tmp_path, "print('done')")
    _patch_unit_host(monkeypatch)
    log_path = tmp_path / "close.log"
    real_open = os.open
    real_close = os.close
    log_descriptors: set[int] = set()

    def open_file(path, flags, mode=0o777):
        descriptor = real_open(path, flags, mode)
        if Path(path) == log_path:
            log_descriptors.add(descriptor)
        return descriptor

    def close_file(descriptor):
        if descriptor in log_descriptors:
            log_descriptors.remove(descriptor)
            real_close(descriptor)
            raise RuntimeError("DO_NOT_LEAK_CLOSE")
        return real_close(descriptor)

    monkeypatch.setattr(command_module.os, "open", open_file)
    monkeypatch.setattr(command_module.os, "close", close_file)

    with pytest.raises(AdapterError) as raised:
        _run_unit_command(tmp_path, fake, name="close.log")

    assert raised.value.code == "REFINE_ENGINE_CLEANUP_FAILED"
    assert str(raised.value) == "cannot close inherited COLMAP log"
    assert raised.value.__cause__ is None
    assert "DO_NOT_LEAK" not in str(raised.value)


@native_engine_entrypoint
def _run_two_commands(request, context: NativeChildContext):
    deadline = RefineDeadline(context.expires_at_monotonic_s)
    run_inherited_colmap_command(
        tuple(request["firstCommand"]),
        context=context,
        deadline=deadline,
        log_path=Path(request["firstLog"]),
        cwd=Path(request["cwd"]),
    )
    Path(request["secondStarted"]).write_text("started", encoding="utf-8")
    run_inherited_colmap_command(
        tuple(request["secondCommand"]),
        context=context,
        deadline=deadline,
        log_path=Path(request["secondLog"]),
        cwd=Path(request["cwd"]),
    )


@pytest.mark.skipif(
    not sys.platform.startswith("linux"),
    reason="inherited command quiescence requires Linux child subreapers",
)
def test_same_group_live_descendant_fails_before_second_command(tmp_path):
    descendant_pid_path = tmp_path / "same-group.pid"
    second_started = tmp_path / "second.started"
    descendant_program = (
        "import os,pathlib,time; "
        f"pathlib.Path({str(descendant_pid_path)!r}).write_text(str(os.getpid())); "
        "time.sleep(30)"
    )
    first = _fake_cli(
        tmp_path,
        "import subprocess,sys; "
        f"subprocess.Popen([sys.executable,'-c',{descendant_program!r}])",
    )
    second = tmp_path / "second-colmap"
    second.write_text(f"#!{sys.executable}\nprint('second')\n", encoding="utf-8")
    second.chmod(0o700)
    descendant_pid: int | None = None
    try:
        with pytest.raises(AdapterError) as raised:
            run_native_engine_child(
                f"{__name__}:_run_two_commands",
                {
                    "firstCommand": [str(first), "point_triangulator"],
                    "firstLog": str(tmp_path / "first.log"),
                    "secondCommand": [str(second), "bundle_adjuster"],
                    "secondLog": str(tmp_path / "second.log"),
                    "secondStarted": str(second_started),
                    "cwd": str(tmp_path),
                },
                deadline=_deadline(5.0),
            )
        assert raised.value.code == "REFINE_ENGINE_CLEANUP_FAILED"
        assert not second_started.exists()
        stop = time.monotonic() + 2.0
        while not descendant_pid_path.exists() and time.monotonic() < stop:
            time.sleep(0.01)
        descendant_pid = int(descendant_pid_path.read_text())
        stop = time.monotonic() + 2.0
        while time.monotonic() < stop:
            try:
                os.kill(descendant_pid, 0)
            except ProcessLookupError:
                break
            time.sleep(0.01)
        else:
            pytest.fail("native owner did not reap same-group COLMAP descendant")
    finally:
        if descendant_pid is not None:
            try:
                os.kill(descendant_pid, signal.SIGKILL)
            except ProcessLookupError:
                pass


@pytest.mark.skipif(
    not sys.platform.startswith("linux"),
    reason="inherited command quiescence requires Linux child subreapers",
)
def test_escaped_live_descendant_fails_before_second_command(tmp_path):
    descendant_pid_path = tmp_path / "escaped.pid"
    second_started = tmp_path / "second.started"
    descendant_program = (
        "import os,pathlib,time; "
        f"pathlib.Path({str(descendant_pid_path)!r}).write_text(str(os.getpid())); "
        "time.sleep(30)"
    )
    first = _fake_cli(
        tmp_path,
        "import os,subprocess,sys; os.setsid(); "
        f"subprocess.Popen([sys.executable,'-c',{descendant_program!r}])",
    )
    second = tmp_path / "second-colmap"
    second.write_text(f"#!{sys.executable}\nprint('second')\n", encoding="utf-8")
    second.chmod(0o700)
    descendant_pid: int | None = None
    try:
        with pytest.raises(AdapterError) as raised:
            run_native_engine_child(
                f"{__name__}:_run_two_commands",
                {
                    "firstCommand": [str(first), "point_triangulator"],
                    "firstLog": str(tmp_path / "first.log"),
                    "secondCommand": [str(second), "bundle_adjuster"],
                    "secondLog": str(tmp_path / "second.log"),
                    "secondStarted": str(second_started),
                    "cwd": str(tmp_path),
                },
                deadline=_deadline(5.0),
            )
        assert raised.value.code == "REFINE_ENGINE_CLEANUP_FAILED"
        assert not second_started.exists()
        stop = time.monotonic() + 2.0
        while not descendant_pid_path.exists() and time.monotonic() < stop:
            time.sleep(0.01)
        descendant_pid = int(descendant_pid_path.read_text())
    finally:
        # The outer native owner can kill only its inherited PGID. This escaped
        # child is the explicit blocker that keeps qualification false.
        if descendant_pid is not None:
            try:
                os.kill(descendant_pid, signal.SIGKILL)
            except ProcessLookupError:
                pass
