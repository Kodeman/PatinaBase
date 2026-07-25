from __future__ import annotations

import dataclasses
import io
import json
import os
import signal
import subprocess
import sys
import time
from pathlib import Path

import pytest
from _colmap_toolchain import (
    load_fake_toolchain,
    plan_fake_command,
    plan_supervised_command,
    write_toolchain,
)

from patina_scan_worker import refine_colmap_command as command_module
from patina_scan_worker import refine_native_process as native_process
from patina_scan_worker.refine_adapter import AdapterError, RefineDeadline
from patina_scan_worker.refine_colmap_backend import run_inherited_colmap_command
from patina_scan_worker.refine_colmap_toolchain import (
    COMMAND_ENVIRONMENT_ALLOWLIST,
    PinnedColmapCommand,
)
from patina_scan_worker.refine_native_process import (
    NativeChildContext,
    native_engine_entrypoint,
    run_native_engine_child,
)

#: Captured before any test patches ``sys.platform`` for the Linux-only paths.
_HOST_PLATFORM = sys.platform


def _deadline(seconds: float = 5.0) -> RefineDeadline:
    return RefineDeadline(time.monotonic() + seconds)


def _fake_cli(tmp_path: Path, program: str) -> Path:
    """Install a fake COLMAP prefix and return its pinned executable."""

    return write_toolchain(tmp_path / "colmap", program=program)


def _pinned(fake: Path, workspace: Path):
    """Load the fake toolchain and seal one supervisable plan for it.

    The supervisor accepts only a qualified, descriptor-pinned plan, so every
    test that launches a child must build that exact shape.
    """

    toolchain = load_fake_toolchain(fake.parent.parent, qualified=True)
    return toolchain, plan_supervised_command(toolchain, workspace)


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


def _run_unit_command(
    tmp_path: Path,
    fake: Path,
    name: str = "command.log",
    pinned=None,
):
    tmp_path.chmod(0o700)
    toolchain, execution = _pinned(fake, tmp_path) if pinned is None else pinned
    try:
        return run_inherited_colmap_command(
            execution,
            context=native_process._seal_native_child_context(
                NativeChildContext(time.monotonic() + 30.0)
            ),
            deadline=_deadline(10.0),
            log_path=tmp_path / name,
            cwd=tmp_path,
        )
    finally:
        toolchain.close()


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
    toolchain, execution = _pinned(fake, tmp_path)
    popen_called = False
    monkeypatch.setattr(command_module.sys, "platform", "darwin")

    def popen(*_args, **_kwargs):
        nonlocal popen_called
        popen_called = True
        raise AssertionError

    monkeypatch.setattr(command_module.subprocess, "Popen", popen)

    try:
        with pytest.raises(AdapterError) as raised:
            run_inherited_colmap_command(
                execution,
                context=NativeChildContext(time.monotonic() + 30.0),
                deadline=_deadline(),
                log_path=tmp_path / "never-created.log",
                cwd=tmp_path,
            )
    finally:
        toolchain.close()

    assert raised.value.code == "REFINE_ENGINE_FAILED"
    assert "dedicated Linux native child session" in str(raised.value)
    assert popen_called is False


def test_unsealed_context_is_rejected_before_popen(monkeypatch, tmp_path):
    fake = _fake_cli(tmp_path, "print('unused')")
    tmp_path.chmod(0o700)
    toolchain, execution = _pinned(fake, tmp_path)
    _patch_unit_host(monkeypatch)
    popen_called = False

    def popen(*_args, **_kwargs):
        nonlocal popen_called
        popen_called = True
        raise AssertionError

    monkeypatch.setattr(command_module.subprocess, "Popen", popen)

    try:
        with pytest.raises(AdapterError) as raised:
            run_inherited_colmap_command(
                execution,
                context=NativeChildContext(time.monotonic() + 30.0),
                deadline=_deadline(),
                log_path=tmp_path / "never-created.log",
                cwd=tmp_path,
            )
    finally:
        toolchain.close()

    assert raised.value.code == "REFINE_ENGINE_FAILED"
    assert str(raised.value) == (
        "inherited COLMAP commands require a verified native child boundary"
    )
    assert raised.value.__cause__ is None
    assert popen_called is False
    assert not (tmp_path / "never-created.log").exists()


def test_context_lookalike_cannot_claim_verified_boundary(monkeypatch, tmp_path):
    fake = _fake_cli(tmp_path, "print('unused')")
    tmp_path.chmod(0o700)
    toolchain, execution = _pinned(fake, tmp_path)
    _patch_unit_host(monkeypatch)

    class ForgedContext:
        is_verified_native_boundary = True

        def remaining_seconds(self):
            return 30.0

    monkeypatch.setattr(
        command_module.subprocess,
        "Popen",
        lambda *_args, **_kwargs: (_ for _ in ()).throw(AssertionError),
    )

    try:
        with pytest.raises(AdapterError) as raised:
            run_inherited_colmap_command(
                execution,
                context=ForgedContext(),
                deadline=_deadline(),
                log_path=tmp_path / "never-created.log",
                cwd=tmp_path,
            )
    finally:
        toolchain.close()

    assert raised.value.code == "REFINE_ENGINE_FAILED"
    assert str(raised.value) == (
        "inherited COLMAP commands require a verified native child boundary"
    )
    assert raised.value.__cause__ is None
    assert not (tmp_path / "never-created.log").exists()


def test_boundary_inspection_failure_is_fixed_without_cause(monkeypatch, tmp_path):
    fake = _fake_cli(tmp_path, "print('unused')")
    tmp_path.chmod(0o700)
    toolchain, execution = _pinned(fake, tmp_path)
    _patch_unit_host(monkeypatch)
    context = native_process._seal_native_child_context(
        NativeChildContext(time.monotonic() + 30.0)
    )

    def inspect_boundary(_context):
        raise RuntimeError("DO_NOT_LEAK_BOUNDARY")

    monkeypatch.setattr(
        NativeChildContext,
        "is_verified_native_boundary",
        property(inspect_boundary),
    )
    monkeypatch.setattr(
        command_module.subprocess,
        "Popen",
        lambda *_args, **_kwargs: (_ for _ in ()).throw(AssertionError),
    )

    try:
        with pytest.raises(AdapterError) as raised:
            run_inherited_colmap_command(
                execution,
                context=context,
                deadline=_deadline(),
                log_path=tmp_path / "never-created.log",
                cwd=tmp_path,
            )
    finally:
        toolchain.close()

    assert raised.value.code == "REFINE_ENGINE_FAILED"
    assert str(raised.value) == (
        "cannot authenticate inherited COLMAP native child boundary"
    )
    assert raised.value.__cause__ is None
    assert "DO_NOT_LEAK" not in str(raised.value)
    assert not (tmp_path / "never-created.log").exists()


def test_argv_normalization_does_not_use_source_truthiness_or_indexing():
    class PathologicalSequence:
        def __bool__(self):
            raise RuntimeError("DO_NOT_LEAK_TRUTHINESS")

        def __len__(self):
            raise RuntimeError("DO_NOT_LEAK_LENGTH")

        def __getitem__(self, _index):
            raise RuntimeError("DO_NOT_LEAK_INDEX")

        def __iter__(self):
            return iter(("/opt/colmap/4.0.2/bin/colmap", "point_triangulator"))

    assert command_module._normalize_command_argv(PathologicalSequence()) == (
        "/opt/colmap/4.0.2/bin/colmap",
        "point_triangulator",
    )


def test_argv_container_exceptions_are_fixed_failures():
    class BrokenIteration:
        def __iter__(self):
            raise RuntimeError("DO_NOT_LEAK_ITER")

    class BrokenIndexing:
        def __getitem__(self, _index):
            raise RuntimeError("DO_NOT_LEAK_INDEX")

    for command in (BrokenIteration(), BrokenIndexing()):
        with pytest.raises(AdapterError) as raised:
            command_module._normalize_command_argv(command)

        assert raised.value.code == "REFINE_ENGINE_FAILED"
        assert str(raised.value) == "cannot normalize inherited COLMAP argv"
        assert raised.value.__cause__ is None
        assert "DO_NOT_LEAK" not in str(raised.value)


def test_argv_item_limit_is_explicit():
    command = ("/opt/colmap/4.0.2/bin/colmap",) * (
        command_module._MAX_COMMAND_ARGV_ITEMS + 1
    )

    with pytest.raises(AdapterError) as raised:
        command_module._normalize_command_argv(command)

    assert raised.value.code == "REFINE_ENGINE_FAILED"
    assert str(raised.value) == "COLMAP command argv exceeds the item limit"


def test_argv_total_byte_limit_is_explicit():
    command = (
        "/opt/colmap/4.0.2/bin/colmap",
        "x" * command_module._MAX_COMMAND_ARGV_BYTES,
    )

    with pytest.raises(AdapterError) as raised:
        command_module._normalize_command_argv(command)

    assert raised.value.code == "REFINE_ENGINE_FAILED"
    assert str(raised.value) == "COLMAP command argv exceeds the byte limit"


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


def test_pre_command_live_child_is_rejected(monkeypatch):
    monkeypatch.setattr(
        command_module.os,
        "waitid",
        lambda *_args: None,
        raising=False,
    )
    monkeypatch.setattr(
        command_module.os,
        "waitpid",
        lambda _pid, _options: (0, 0),
    )

    errors = command_module._pre_command_child_errors(deadline=_deadline())

    assert errors == ("dedicated native owner has a live pre-command child",)


@pytest.mark.parametrize("stage", ("waitid", "waitpid"))
def test_pre_command_eintr_retries_while_deadline_remains(monkeypatch, stage):
    if stage == "waitid":
        results = iter((InterruptedError(), ChildProcessError()))

        def waitid(*_args):
            result = next(results)
            if isinstance(result, BaseException):
                raise result
            return result

        monkeypatch.setattr(command_module.os, "waitid", waitid, raising=False)
        monkeypatch.setattr(
            command_module.os,
            "waitpid",
            lambda *_args: (_ for _ in ()).throw(AssertionError),
        )
    else:
        results = iter((InterruptedError(), ChildProcessError()))
        monkeypatch.setattr(
            command_module.os,
            "waitid",
            lambda *_args: None,
            raising=False,
        )

        def waitpid(*_args):
            result = next(results)
            if isinstance(result, BaseException):
                raise result
            return result

        monkeypatch.setattr(command_module.os, "waitpid", waitpid)

    assert command_module._pre_command_child_errors(deadline=_deadline()) == ()


@pytest.mark.parametrize("stage", ("waitid", "waitpid"))
def test_pre_command_eintr_after_deadline_is_cleanup_failure(
    monkeypatch,
    stage,
):
    def interrupted(*_args):
        raise InterruptedError

    if stage == "waitid":
        monkeypatch.setattr(
            command_module.os,
            "waitid",
            interrupted,
            raising=False,
        )
        monkeypatch.setattr(
            command_module.os,
            "waitpid",
            lambda *_args: (_ for _ in ()).throw(AssertionError),
        )
    else:
        monkeypatch.setattr(
            command_module.os,
            "waitid",
            lambda *_args: None,
            raising=False,
        )
        monkeypatch.setattr(command_module.os, "waitpid", interrupted)

    errors = command_module._pre_command_child_errors(
        deadline=RefineDeadline(time.monotonic() - 1.0)
    )

    assert errors == ("pre-command child inspection exceeded the carried deadline",)


def test_cwd_resolve_exception_is_fixed_and_does_not_leak_details(
    monkeypatch,
    tmp_path,
):
    fake = _fake_cli(tmp_path, "print('unused')")
    tmp_path.chmod(0o700)
    # Pin the toolchain before Path.resolve is instrumented; the fault under
    # test is the command workspace, not the installed prefix.
    pinned = _pinned(fake, tmp_path)
    _patch_unit_host(monkeypatch)
    monkeypatch.setattr(
        Path,
        "resolve",
        lambda *_args, **_kwargs: (_ for _ in ()).throw(
            RuntimeError("DO_NOT_LEAK_RESOLVE")
        ),
    )

    with pytest.raises(AdapterError) as raised:
        _run_unit_command(tmp_path, fake, pinned=pinned)

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


def test_real_nonzero_exit_retains_only_bounded_tail(monkeypatch, tmp_path):
    marker = "NONZERO_COLMAP_TAIL"
    fake = _fake_cli(
        tmp_path,
        "import sys; "
        f"sys.stdout.write('x' * 70000 + {marker!r} + '\\n'); "
        "sys.stdout.flush(); raise SystemExit(7)",
    )
    _patch_unit_host(monkeypatch)
    log_path = tmp_path / "nonzero.log"

    with pytest.raises(AdapterError) as raised:
        _run_unit_command(tmp_path, fake, name=log_path.name)

    assert raised.value.code == "REFINE_ENGINE_FAILED"
    assert str(raised.value).startswith("COLMAP command failed (7): ")
    assert str(raised.value).endswith(marker + "\n")
    assert len(str(raised.value).encode("utf-8")) <= 2100
    assert log_path.stat().st_size <= command_module.COLMAP_LOG_TAIL_BYTES
    assert log_path.read_text(encoding="utf-8").endswith(marker + "\n")


def test_log_close_exception_is_cleanup_failure_without_raw_leak(
    monkeypatch,
    tmp_path,
):
    fake = _fake_cli(tmp_path, "print('done')")
    tmp_path.chmod(0o700)
    # Pin the toolchain before os.open/os.close are instrumented; the fault
    # under test is the command log descriptor, not toolchain verification.
    pinned = _pinned(fake, tmp_path)
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
        _run_unit_command(tmp_path, fake, name="close.log", pinned=pinned)

    assert raised.value.code == "REFINE_ENGINE_CLEANUP_FAILED"
    assert str(raised.value) == "cannot close inherited COLMAP log"
    assert raised.value.__cause__ is None
    assert "DO_NOT_LEAK" not in str(raised.value)


@native_engine_entrypoint
def _run_two_commands(request, context: NativeChildContext):
    # Both phases must be planned in the one shape the supervisor accepts --
    # qualified *and* descriptor-pinned.  These two tests are the only cover for
    # sequential quiescence, subreaper adoption, and the escaped-``setsid``
    # descendant, and an unqualified plan makes the first command die before
    # ``Popen`` with no child, no descendant and nothing under test.
    deadline = RefineDeadline(context.expires_at_monotonic_s)
    workspace = Path(request["cwd"])
    first = load_fake_toolchain(Path(request["firstPrefix"]), qualified=True)
    second = load_fake_toolchain(Path(request["secondPrefix"]), qualified=True)
    try:
        run_inherited_colmap_command(
            plan_supervised_command(first, workspace),
            context=context,
            deadline=deadline,
            log_path=Path(request["firstLog"]),
            cwd=workspace,
        )
        Path(request["secondStarted"]).write_text("started", encoding="utf-8")
        run_inherited_colmap_command(
            plan_supervised_command(second, workspace),
            context=context,
            deadline=deadline,
            log_path=Path(request["secondLog"]),
            cwd=workspace,
        )
    finally:
        first.close()
        second.close()


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
    write_toolchain(
        tmp_path / "colmap-first",
        program=(
            "import subprocess,sys; "
            f"subprocess.Popen([sys.executable,'-c',{descendant_program!r}])"
        ),
    )
    write_toolchain(tmp_path / "colmap-second", program="print('second')")
    descendant_pid: int | None = None
    try:
        with pytest.raises(AdapterError) as raised:
            run_native_engine_child(
                f"{__name__}:_run_two_commands",
                {
                    "firstPrefix": str(tmp_path / "colmap-first"),
                    "firstLog": str(tmp_path / "first.log"),
                    "secondPrefix": str(tmp_path / "colmap-second"),
                    "secondLog": str(tmp_path / "second.log"),
                    "secondStarted": str(second_started),
                    "cwd": str(tmp_path),
                },
                deadline=_deadline(5.0),
            )
        assert raised.value.code == "REFINE_ENGINE_CLEANUP_FAILED"
        # Name the descendant clause, not just the code.  A live descendant
        # holds the command's log pipe open *and* is adopted by the subreaper,
        # so two independent guarantees fire; asserting only the code would let
        # the adoption half rot away unnoticed.
        assert "native owner retains a live adopted COLMAP descendant" in str(
            raised.value
        )
        # The first command must actually have launched: a plan refused before
        # ``Popen`` creates no log, spawns no child and leaves this assertion --
        # and the descendant wait below -- as the only thing between a real
        # quiescence proof and a vacuously green test.
        assert (tmp_path / "first.log").exists()
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
    write_toolchain(
        tmp_path / "colmap-first",
        program=(
            "import os,subprocess,sys; os.setsid(); "
            f"subprocess.Popen([sys.executable,'-c',{descendant_program!r}])"
        ),
    )
    write_toolchain(tmp_path / "colmap-second", program="print('second')")
    descendant_pid: int | None = None
    try:
        with pytest.raises(AdapterError) as raised:
            run_native_engine_child(
                f"{__name__}:_run_two_commands",
                {
                    "firstPrefix": str(tmp_path / "colmap-first"),
                    "firstLog": str(tmp_path / "first.log"),
                    "secondPrefix": str(tmp_path / "colmap-second"),
                    "secondLog": str(tmp_path / "second.log"),
                    "secondStarted": str(second_started),
                    "cwd": str(tmp_path),
                },
                deadline=_deadline(5.0),
            )
        assert raised.value.code == "REFINE_ENGINE_CLEANUP_FAILED"
        # The escaped ``setsid`` descendant is in its own session and its own
        # group, so nothing but Linux subreaper adoption can observe it.  This
        # clause is that observation.
        assert "native owner retains a live adopted COLMAP descendant" in str(
            raised.value
        )
        # As above: proof the first command reached ``Popen`` at all, so the
        # refusal being asserted is the quiescence gate and not a plan the
        # supervisor rejected before any child existed.
        assert (tmp_path / "first.log").exists()
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


# ---------------------------------------------------------------------------
# I97 item 3 — executable identity, environment allowlist, deadline carriage
# ---------------------------------------------------------------------------


def test_child_receives_only_the_allowlisted_environment(monkeypatch, tmp_path):
    monkeypatch.setenv("PATINA_AMBIENT_SECRET", "DO_NOT_LEAK_AMBIENT")
    monkeypatch.setenv("LD_PRELOAD", "/tmp/ambient.so")
    fake = _fake_cli(
        tmp_path,
        "import json,os,sys; sys.stdout.write(json.dumps(dict(os.environ)))",
    )
    _patch_unit_host(monkeypatch)

    result = _run_unit_command(tmp_path, fake, name="environment.log")

    child_environment = json.loads(result.output_tail)
    # Darwin's libSystem injects __CF_USER_TEXT_ENCODING into every process it
    # starts; on the qualified Linux target the child environment is exactly the
    # allowlist and nothing else.
    injected = (
        set()
        if _HOST_PLATFORM.startswith("linux")
        else {"__CF_USER_TEXT_ENCODING"}
    )
    assert (
        tuple(sorted(set(child_environment) - injected))
        == COMMAND_ENVIRONMENT_ALLOWLIST
    )
    assert "PATINA_AMBIENT_SECRET" not in child_environment
    assert "LD_PRELOAD" not in child_environment
    assert child_environment["TMPDIR"] == str(tmp_path)
    assert child_environment["LANG"] == child_environment["LC_ALL"] == "C"
    assert child_environment["QT_QPA_PLATFORM"] == "offscreen"
    assert "DO_NOT_LEAK" not in result.output_tail


def test_child_runs_in_the_private_workspace_with_closed_stdin(monkeypatch, tmp_path):
    fake = _fake_cli(
        tmp_path,
        "import json,os,sys; "
        "sys.stdout.write(json.dumps([os.getcwd(), sys.stdin.read()]))",
    )
    _patch_unit_host(monkeypatch)

    result = _run_unit_command(tmp_path, fake, name="workspace.log")

    cwd, stdin_payload = json.loads(result.output_tail)
    assert cwd == str(tmp_path)
    assert stdin_payload == ""


def test_popen_receives_the_pinned_alias_and_closed_environment(monkeypatch, tmp_path):
    fake = _fake_cli(tmp_path, "print('done')")
    tmp_path.chmod(0o700)
    pinned = _pinned(fake, tmp_path)
    _patch_unit_host(monkeypatch)
    real_popen = subprocess.Popen
    recorded: dict[str, object] = {}

    def popen(argv, **kwargs):
        recorded["argv"] = tuple(argv)
        recorded.update(kwargs)
        return real_popen(argv, **kwargs)

    monkeypatch.setattr(command_module.subprocess, "Popen", popen)

    result = _run_unit_command(tmp_path, fake, name="popen.log", pinned=pinned)

    assert result.returncode == 0
    assert recorded["argv"] == pinned[1].argv
    assert recorded["executable"] == pinned[1].executable_alias
    assert recorded["env"] == pinned[1].environment()
    assert recorded["close_fds"] is True
    assert recorded["pass_fds"] == pinned[1].passed_descriptors()
    assert recorded["stdin"] == subprocess.DEVNULL
    assert recorded["start_new_session"] is False


def test_unsealed_pinned_command_is_rejected_before_popen(monkeypatch, tmp_path):
    fake = _fake_cli(tmp_path, "print('unused')")
    tmp_path.chmod(0o700)
    toolchain, execution = _pinned(fake, tmp_path)
    forged = dataclasses.replace(execution)
    _patch_unit_host(monkeypatch)
    monkeypatch.setattr(
        command_module.subprocess,
        "Popen",
        lambda *_args, **_kwargs: (_ for _ in ()).throw(AssertionError),
    )

    try:
        assert forged.is_verified_pinned_command is False
        with pytest.raises(AdapterError) as raised:
            run_inherited_colmap_command(
                forged,
                context=native_process._seal_native_child_context(
                    NativeChildContext(time.monotonic() + 30.0)
                ),
                deadline=_deadline(),
                log_path=tmp_path / "never-created.log",
                cwd=tmp_path,
            )
    finally:
        toolchain.close()

    assert raised.value.code == "REFINE_ENGINE_FAILED"
    assert str(raised.value) == (
        "inherited COLMAP commands require a pinned toolchain execution"
    )
    assert not (tmp_path / "never-created.log").exists()


def test_pinned_command_lookalike_is_rejected_before_popen(monkeypatch, tmp_path):
    fake = _fake_cli(tmp_path, "print('unused')")
    tmp_path.chmod(0o700)
    toolchain, execution = _pinned(fake, tmp_path)

    class ForgedExecution:
        is_verified_pinned_command = True
        argv = execution.argv
        workspace = execution.workspace
        identity = execution.identity
        executable_descriptor = execution.executable_descriptor
        executable_alias = execution.executable_alias
        descriptor_pinned = False

        def environment(self):
            return {"LD_PRELOAD": "/tmp/ambient.so"}

        def passed_descriptors(self):
            return ()

    _patch_unit_host(monkeypatch)
    monkeypatch.setattr(
        command_module.subprocess,
        "Popen",
        lambda *_args, **_kwargs: (_ for _ in ()).throw(AssertionError),
    )

    try:
        with pytest.raises(AdapterError) as raised:
            run_inherited_colmap_command(
                ForgedExecution(),
                context=native_process._seal_native_child_context(
                    NativeChildContext(time.monotonic() + 30.0)
                ),
                deadline=_deadline(),
                log_path=tmp_path / "never-created.log",
                cwd=tmp_path,
            )
    finally:
        toolchain.close()

    assert raised.value.code == "REFINE_ENGINE_FAILED"
    assert str(raised.value) == (
        "inherited COLMAP commands require a pinned toolchain execution"
    )
    assert not (tmp_path / "never-created.log").exists()


def test_plan_authentication_failure_is_fixed_without_cause(monkeypatch, tmp_path):
    fake = _fake_cli(tmp_path, "print('unused')")
    tmp_path.chmod(0o700)
    toolchain, execution = _pinned(fake, tmp_path)
    _patch_unit_host(monkeypatch)
    monkeypatch.setattr(
        PinnedColmapCommand,
        "is_verified_pinned_command",
        property(
            lambda _self: (_ for _ in ()).throw(RuntimeError("DO_NOT_LEAK_PLAN"))
        ),
    )
    monkeypatch.setattr(
        command_module.subprocess,
        "Popen",
        lambda *_args, **_kwargs: (_ for _ in ()).throw(AssertionError),
    )

    try:
        with pytest.raises(AdapterError) as raised:
            run_inherited_colmap_command(
                execution,
                context=native_process._seal_native_child_context(
                    NativeChildContext(time.monotonic() + 30.0)
                ),
                deadline=_deadline(),
                log_path=tmp_path / "never-created.log",
                cwd=tmp_path,
            )
    finally:
        toolchain.close()

    assert str(raised.value) == (
        "cannot authenticate the pinned COLMAP toolchain execution"
    )
    assert raised.value.__cause__ is None
    assert "DO_NOT_LEAK" not in str(raised.value)


def test_execution_planned_for_another_working_directory_is_rejected(
    monkeypatch, tmp_path
):
    fake = _fake_cli(tmp_path, "print('unused')")
    other = tmp_path / "other"
    other.mkdir()
    other.chmod(0o700)
    tmp_path.chmod(0o700)
    toolchain = load_fake_toolchain(fake.parent.parent, qualified=True)
    execution = plan_supervised_command(toolchain, other)
    _patch_unit_host(monkeypatch)
    monkeypatch.setattr(
        command_module.subprocess,
        "Popen",
        lambda *_args, **_kwargs: (_ for _ in ()).throw(AssertionError),
    )

    try:
        with pytest.raises(AdapterError) as raised:
            run_inherited_colmap_command(
                execution,
                context=native_process._seal_native_child_context(
                    NativeChildContext(time.monotonic() + 30.0)
                ),
                deadline=_deadline(),
                log_path=tmp_path / "never-created.log",
                cwd=tmp_path,
            )
    finally:
        toolchain.close()

    assert str(raised.value) == (
        "pinned COLMAP execution was planned for a different working directory"
    )
    assert not (tmp_path / "never-created.log").exists()


def test_environment_materialization_failure_is_fixed(monkeypatch, tmp_path):
    fake = _fake_cli(tmp_path, "print('unused')")
    tmp_path.chmod(0o700)
    toolchain, execution = _pinned(fake, tmp_path)
    _patch_unit_host(monkeypatch)
    monkeypatch.setattr(
        PinnedColmapCommand,
        "environment",
        lambda _self: (_ for _ in ()).throw(RuntimeError("DO_NOT_LEAK_ENVIRON")),
    )
    monkeypatch.setattr(
        command_module.subprocess,
        "Popen",
        lambda *_args, **_kwargs: (_ for _ in ()).throw(AssertionError),
    )

    try:
        with pytest.raises(AdapterError) as raised:
            run_inherited_colmap_command(
                execution,
                context=native_process._seal_native_child_context(
                    NativeChildContext(time.monotonic() + 30.0)
                ),
                deadline=_deadline(),
                log_path=tmp_path / "never-created.log",
                cwd=tmp_path,
            )
    finally:
        toolchain.close()

    assert str(raised.value) == (
        "cannot materialize the pinned COLMAP command environment"
    )
    assert raised.value.__cause__ is None
    assert "DO_NOT_LEAK" not in str(raised.value)


def test_executable_swapped_after_planning_is_rejected_before_popen(
    monkeypatch,
    tmp_path,
):
    fake = _fake_cli(tmp_path, "print('unused')")
    tmp_path.chmod(0o700)
    pinned = _pinned(fake, tmp_path)
    replacement = tmp_path / "replacement"
    replacement.write_bytes(fake.read_bytes())
    replacement.chmod(0o755)
    replacement.replace(fake)
    _patch_unit_host(monkeypatch)
    popen_called = False

    def popen(*_args, **_kwargs):
        nonlocal popen_called
        popen_called = True
        raise AssertionError

    monkeypatch.setattr(command_module.subprocess, "Popen", popen)

    with pytest.raises(AdapterError) as raised:
        _run_unit_command(tmp_path, fake, name="swapped.log", pinned=pinned)

    assert raised.value.code == "REFINE_ENGINE_FAILED"
    assert str(raised.value) == (
        "pinned COLMAP executable identity changed before execution"
    )
    assert popen_called is False
    assert not (tmp_path / "swapped.log").exists()


def test_executable_bytes_swapped_in_place_are_rejected_before_popen(
    monkeypatch,
    tmp_path,
):
    """An in-place same-length ``pwrite`` must not survive to ``execve``.

    ``test_executable_swapped_after_planning_is_rejected_before_popen`` only
    covers a *rename* swap, which changes the inode.  Overwriting the bytes of
    the already-verified inode leaves ``st_dev``/``st_ino``/``st_size``/
    ``st_nlink``/``st_mode``/``st_uid``/``st_gid`` identical, and the qualified
    path execs that same descriptor -- so the substituted bytes are precisely
    what would run.
    """

    fake = _fake_cli(tmp_path, "print('unused')")
    tmp_path.chmod(0o700)
    pinned = _pinned(fake, tmp_path)
    original = fake.read_bytes()
    swapped = original.replace(b"print('unused')", b"print('pwned!')")
    assert len(swapped) == len(original)
    assert swapped != original
    descriptor = os.open(fake, os.O_WRONLY)
    try:
        assert os.pwrite(descriptor, swapped, 0) == len(swapped)
    finally:
        os.close(descriptor)
    assert fake.stat().st_size == len(original)
    _patch_unit_host(monkeypatch)

    with pytest.raises(AdapterError) as raised:
        _run_unit_command(tmp_path, fake, name="in-place.log", pinned=pinned)

    assert raised.value.code == "REFINE_ENGINE_FAILED"
    assert str(raised.value) == (
        "pinned COLMAP executable identity changed before execution"
    )
    assert not (tmp_path / "in-place.log").exists()


def test_a_hostile_prefix_cannot_mint_a_qualified_descriptor_pinned_plan(
    monkeypatch,
    tmp_path,
):
    """The reviewer's exploit: an arbitrary prefix claiming the production shape.

    ``test_hostile_unqualified_plan_is_refused_by_the_supervisor`` closed only
    the ``qualified=False``/``descriptor_exec=False`` shape.  ``load_colmap_
    toolchain`` also took a bare ``qualified=`` bool that nothing verified, and
    ``plan_pinned_colmap_command`` stamped it straight into the sealed plan, so
    ``load_colmap_toolchain(hostile, qualified=True)`` plus ``descriptor_exec=
    True`` minted a ``qualified=True descriptor_pinned=True`` plan from
    ``/tmp/.../hostile``.  ``assert_qualified_box_identity`` was not on that
    route -- only on ``plan_qualified_colmap_command`` -- so the supervisor
    accepted it, the child ran, and the hostile binary wrote its marker.

    ``qualified`` is now derived from a box-identity assertion instead of taken
    on the caller's word, so a prefix whose manifest is not the qualified box is
    refused before any descriptor is even opened.
    """

    workspace = tmp_path / "work"
    workspace.mkdir()
    workspace.chmod(0o700)
    hostile = tmp_path / "hostile"
    marker = tmp_path / "hostile-ran"
    write_toolchain(
        hostile,
        program=(
            "import pathlib; "
            f"pathlib.Path({str(marker)!r}).write_text('owned')"
        ),
        # Everything else about this manifest is a faithful copy of the
        # qualified box; one drifted field is all it takes to be refused.
        manifest_overrides={"colmapVersion": "4.0.3"},
    )
    _patch_unit_host(monkeypatch)

    with pytest.raises(AdapterError) as raised:
        toolchain = load_fake_toolchain(hostile, qualified=True)
        try:
            run_inherited_colmap_command(
                plan_supervised_command(toolchain, workspace),
                context=native_process._seal_native_child_context(
                    NativeChildContext(time.monotonic() + 30.0)
                ),
                deadline=_deadline(10.0),
                log_path=workspace / "hostile.log",
                cwd=workspace,
            )
        finally:
            toolchain.close()

    assert raised.value.code == "REFINE_TOOLCHAIN_UNQUALIFIED"
    assert str(raised.value) == (
        "COLMAP toolchain colmapVersion drifted from the qualified box"
    )
    assert not marker.exists()
    assert not (workspace / "hostile.log").exists()


def test_hostile_unqualified_plan_is_refused_by_the_supervisor(monkeypatch, tmp_path):
    """A plan built from an arbitrary prefix may not reach ``Popen``.

    ``plan_pinned_colmap_command`` is public and takes ``descriptor_exec``.  The
    supervisor authenticated only the module seal and the pid, so a plan built
    from a hostile prefix with ``descriptor_exec=False`` -- a full path-lookup
    exec with no TOCTOU protection -- was accepted indistinguishably from the
    descriptor-pinned qualified form.
    """

    workspace = tmp_path / "work"
    workspace.mkdir()
    workspace.chmod(0o700)
    hostile = tmp_path / "hostile"
    marker = tmp_path / "hostile-ran"
    write_toolchain(
        hostile,
        program=(
            "import pathlib; "
            f"pathlib.Path({str(marker)!r}).write_text('owned')"
        ),
    )
    toolchain = load_fake_toolchain(hostile)
    execution = plan_fake_command(toolchain, workspace)
    _patch_unit_host(monkeypatch)

    try:
        assert execution.is_verified_pinned_command is True
        assert execution.descriptor_pinned is False
        with pytest.raises(AdapterError) as raised:
            run_inherited_colmap_command(
                execution,
                context=native_process._seal_native_child_context(
                    NativeChildContext(time.monotonic() + 30.0)
                ),
                deadline=_deadline(10.0),
                log_path=workspace / "hostile.log",
                cwd=workspace,
            )
    finally:
        toolchain.close()

    assert raised.value.code == "REFINE_ENGINE_FAILED"
    assert str(raised.value) == (
        "inherited COLMAP commands require a qualified descriptor-pinned execution"
    )
    assert not marker.exists()


@pytest.mark.parametrize(
    ("toolchain_qualified", "descriptor_exec"),
    (
        (False, False),
        (True, False),
        (False, True),
    ),
)
def test_only_a_qualified_descriptor_pinned_plan_reaches_popen(
    monkeypatch,
    tmp_path,
    toolchain_qualified,
    descriptor_exec,
):
    """Both facts are required; either one alone is refused before ``Popen``."""

    fake = _fake_cli(tmp_path, "print('unused')")
    tmp_path.chmod(0o700)
    toolchain = load_fake_toolchain(fake.parent.parent, qualified=toolchain_qualified)
    execution = (
        plan_supervised_command(toolchain, tmp_path)
        if descriptor_exec
        else plan_fake_command(toolchain, tmp_path)
    )
    _patch_unit_host(monkeypatch)
    monkeypatch.setattr(
        command_module.subprocess,
        "Popen",
        lambda *_args, **_kwargs: (_ for _ in ()).throw(AssertionError),
    )

    try:
        assert execution.is_verified_pinned_command is True
        assert execution.qualified is toolchain_qualified
        assert execution.descriptor_pinned is descriptor_exec
        with pytest.raises(AdapterError) as raised:
            run_inherited_colmap_command(
                execution,
                context=native_process._seal_native_child_context(
                    NativeChildContext(time.monotonic() + 30.0)
                ),
                deadline=_deadline(),
                log_path=tmp_path / "never-created.log",
                cwd=tmp_path,
            )
    finally:
        toolchain.close()

    assert raised.value.code == "REFINE_ENGINE_FAILED"
    assert str(raised.value) == (
        "inherited COLMAP commands require a qualified descriptor-pinned execution"
    )
    assert not (tmp_path / "never-created.log").exists()


def test_plan_qualification_inspection_failure_is_fixed_without_cause(
    monkeypatch,
    tmp_path,
):
    fake = _fake_cli(tmp_path, "print('unused')")
    tmp_path.chmod(0o700)
    toolchain, execution = _pinned(fake, tmp_path)
    _patch_unit_host(monkeypatch)
    # A ``property`` on the class is a data descriptor, so it wins over the
    # dataclass field held in the instance ``__dict__``.
    monkeypatch.setattr(
        PinnedColmapCommand,
        "qualified",
        property(
            lambda _self: (_ for _ in ()).throw(RuntimeError("DO_NOT_LEAK_PLAN"))
        ),
        raising=False,
    )
    monkeypatch.setattr(
        command_module.subprocess,
        "Popen",
        lambda *_args, **_kwargs: (_ for _ in ()).throw(AssertionError),
    )

    try:
        with pytest.raises(AdapterError) as raised:
            run_inherited_colmap_command(
                execution,
                context=native_process._seal_native_child_context(
                    NativeChildContext(time.monotonic() + 30.0)
                ),
                deadline=_deadline(),
                log_path=tmp_path / "never-created.log",
                cwd=tmp_path,
            )
    finally:
        toolchain.close()

    assert raised.value.code == "REFINE_ENGINE_FAILED"
    assert str(raised.value) == (
        "cannot authenticate the pinned COLMAP toolchain qualification"
    )
    assert raised.value.__cause__ is None
    assert "DO_NOT_LEAK" not in str(raised.value)


@pytest.mark.skipif(
    not _HOST_PLATFORM.startswith("linux"),
    # On Linux this launches a real child through the live
    # `/proc/self/fd/<fd>` alias and proves the child ran the *pinned inode*.
    # macOS has no /proc, so the plan is descriptor-pinned against a symlink
    # farm instead: running it there would prove that a symlink resolves, not
    # that an open descriptor is what execve consumed.  Do not relax this.
    reason=(
        "fd-backed execve needs Linux /proc/self/fd; off Linux this would prove"
        " only that a symlink resolved, not that the descriptor was exec'd"
    ),
)
def test_descriptor_pinned_child_runs_the_pinned_inode_on_linux(monkeypatch, tmp_path):
    fake = _fake_cli(
        tmp_path,
        "import json,os,sys; "
        "metadata = os.stat(sys.argv[0]); "
        "sys.stdout.write(json.dumps({"
        "'argv0': sys.argv[0], "
        "'dev': metadata.st_dev, "
        "'ino': metadata.st_ino}))",
    )
    tmp_path.chmod(0o700)
    pinned = _pinned(fake, tmp_path)
    toolchain, execution = pinned
    assert execution.descriptor_pinned is True
    assert execution.executable_alias == (
        f"/proc/self/fd/{toolchain.executable_descriptor}"
    )
    assert execution.passed_descriptors() == (toolchain.executable_descriptor,)
    _patch_unit_host(monkeypatch)

    result = _run_unit_command(tmp_path, fake, name="descriptor.log", pinned=pinned)

    assert result.returncode == 0
    observed = json.loads(result.output_tail)
    # The child was exec'd through the inherited descriptor, not a path lookup.
    assert observed["argv0"] == execution.executable_alias
    # ...and that descriptor resolved to exactly the inode that was hashed.
    assert observed["dev"] == execution.identity.device
    assert observed["ino"] == execution.identity.inode
    assert (observed["dev"], observed["ino"]) == (
        fake.stat().st_dev,
        fake.stat().st_ino,
    )


def test_identity_reverification_faults_are_fixed_and_remove_the_log(
    monkeypatch,
    tmp_path,
):
    fake = _fake_cli(tmp_path, "print('unused')")
    tmp_path.chmod(0o700)
    pinned = _pinned(fake, tmp_path)
    _patch_unit_host(monkeypatch)
    monkeypatch.setattr(
        command_module,
        "verify_executable_identity",
        lambda *_args: (_ for _ in ()).throw(RuntimeError("DO_NOT_LEAK_IDENTITY")),
    )
    monkeypatch.setattr(
        command_module.subprocess,
        "Popen",
        lambda *_args, **_kwargs: (_ for _ in ()).throw(AssertionError),
    )

    with pytest.raises(AdapterError) as raised:
        _run_unit_command(tmp_path, fake, name="identity.log", pinned=pinned)

    assert raised.value.code == "REFINE_ENGINE_FAILED"
    assert str(raised.value) == (
        "cannot re-verify the pinned COLMAP executable identity"
    )
    assert raised.value.__cause__ is None
    assert "DO_NOT_LEAK" not in str(raised.value)
    assert not (tmp_path / "identity.log").exists()


def test_drain_deadline_helper_tracks_the_one_shared_deadline():
    context = NativeChildContext(time.monotonic() + 30.0)

    assert command_module._drain_deadline_exhausted(context, _deadline(10.0)) is False
    assert (
        command_module._drain_deadline_exhausted(
            context, RefineDeadline(time.monotonic() - 1.0)
        )
        is True
    )
    assert (
        command_module._drain_deadline_exhausted(
            NativeChildContext(time.monotonic() - 1.0), _deadline(10.0)
        )
        is True
    )


def test_log_drain_stops_and_fails_closed_when_the_deadline_expires(
    monkeypatch,
    tmp_path,
):
    fake = _fake_cli(tmp_path, "print('done')")
    _patch_unit_host(monkeypatch)
    monkeypatch.setattr(
        command_module,
        "_drain_deadline_exhausted",
        lambda _context, _deadline: True,
    )

    with pytest.raises(AdapterError) as raised:
        _run_unit_command(tmp_path, fake, name="drain-deadline.log")

    assert raised.value.code == "REFINE_ENGINE_TIMEOUT"
    assert str(raised.value) == (
        "inherited COLMAP log drain exceeded the carried deadline"
    )
    assert raised.value.__cause__ is None
