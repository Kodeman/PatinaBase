"""Hard-deadline process boundary for future native Refine engine calls."""

from __future__ import annotations

import hashlib
import json
import os
import signal
import subprocess
import sys
import threading
import time
from collections.abc import Mapping
from multiprocessing.process import BaseProcess
from pathlib import Path

import pytest

import patina_scan_worker.refine_native_process as native_process
from patina_scan_worker.refine_adapter import (
    LEASE_COMPLETION_RESERVE_S,
    AdapterError,
    RefineDeadline,
)
from patina_scan_worker.refine_native_process import (
    NATIVE_CHILD_MAX_ERROR_BYTES,
    NATIVE_CHILD_MAX_PINNED_FILE_BYTES,
    NATIVE_CHILD_MAX_PINNED_FILES,
    NATIVE_CHILD_MAX_PINNED_TOTAL_BYTES,
    NATIVE_CHILD_MAX_REQUEST_BYTES,
    NATIVE_CHILD_MAX_RESPONSE_BYTES,
    NativeChildContext,
    NativePinnedFile,
    native_engine_entrypoint,
    run_native_engine_child,
)


def _entrypoint(name: str) -> str:
    return f"{__name__}:{name}"


def _deadline(seconds: float) -> RefineDeadline:
    now = time.monotonic()
    return RefineDeadline.start(
        now_monotonic_s=now,
        lease_expires_at_monotonic_s=(now + LEASE_COMPLETION_RESERVE_S + seconds),
    )


@native_engine_entrypoint
def _echo_with_budget(request, context: NativeChildContext):
    return {
        "request": request,
        "remainingBudgetSeconds": context.remaining_seconds(),
    }


@native_engine_entrypoint
def _report_boundary_seal(_request, context: NativeChildContext):
    return {"verified": context.is_verified_native_boundary}


@native_engine_entrypoint
def _raise_large_error(_request, _context: NativeChildContext):
    raise RuntimeError("native-boom-" + ("x" * NATIVE_CHILD_MAX_RESPONSE_BYTES))


@native_engine_entrypoint
def _return_oversized_result(_request, _context: NativeChildContext):
    return {"oversized": "x" * NATIVE_CHILD_MAX_RESPONSE_BYTES}


class _OversizedGeneratedList(list):
    """A JSON-compatible container whose iterator never terminates."""

    def __iter__(self):
        while True:
            yield "x" * 4096


@native_engine_entrypoint
def _return_oversized_generated_result(_request, _context: NativeChildContext):
    return {"oversized": _OversizedGeneratedList()}


@native_engine_entrypoint
def _sleep_past_deadline(_request, _context: NativeChildContext):
    time.sleep(30.0)
    return {"unreachable": True}


@native_engine_entrypoint
def _spawn_late_writer(request, _context: NativeChildContext):
    # Deliberately violates the success-only contract so the timeout path proves
    # it kills every member of the isolated group before returning an error.
    leader_pid = Path(request["leaderPid"])
    descendant_pid = Path(request["descendantPid"])
    late_artifact = Path(request["lateArtifact"])
    activity_log = Path(request["activityLog"])
    leader_pid.write_text(str(os.getpid()), encoding="utf-8")
    activity_log.write_text("leader-ready\n", encoding="utf-8")
    program = (
        "import os,pathlib,signal,sys,time; "
        "signal.signal(signal.SIGTERM, signal.SIG_IGN); "
        "pathlib.Path(sys.argv[1]).write_text(str(os.getpid()), encoding='utf-8'); "
        "time.sleep(0.75); "
        "pathlib.Path(sys.argv[2]).write_text('late-artifact\\n', encoding='utf-8'); "
        "pathlib.Path(sys.argv[3]).open('a', encoding='utf-8').write('late-write\\n')"
    )
    subprocess.Popen(
        [
            sys.executable,
            "-c",
            program,
            str(descendant_pid),
            str(late_artifact),
            str(activity_log),
        ],
        close_fds=True,
    )
    stop = time.monotonic() + 5.0
    while not descendant_pid.exists():
        if time.monotonic() >= stop:
            raise RuntimeError("descendant did not report its pid")
        time.sleep(0.005)
    time.sleep(30.0)
    return {"unreachable": True}


@native_engine_entrypoint
def _read_pinned_file(request, context: NativeChildContext):
    token = request["token"]
    descriptor = context.pinned_file_descriptor(token)
    size = os.fstat(descriptor).st_size
    payload = os.pread(descriptor, size, 0)
    return {
        "payloadHex": payload.hex(),
        "sha256": hashlib.sha256(payload).hexdigest(),
        "tokens": list(context.pinned_file_tokens),
        "offset": os.lseek(descriptor, 0, os.SEEK_CUR),
    }


@native_engine_entrypoint
def _advance_pinned_file_offset(request, context: NativeChildContext):
    descriptor = context.pinned_file_descriptor(request["token"])
    os.read(descriptor, 1)
    return {"unexpected": "success"}


@native_engine_entrypoint
def _advance_pinned_file_offset_then_sleep(
    request,
    context: NativeChildContext,
):
    descriptor = context.pinned_file_descriptor(request["token"])
    os.read(descriptor, 1)
    Path(request["readyMarker"]).write_text("advanced\n", encoding="utf-8")
    time.sleep(30.0)
    return {"unexpected": "success"}


@native_engine_entrypoint
def _wait_for_pinned_mutation(request, context: NativeChildContext):
    descriptor = context.pinned_file_descriptor(request["token"])
    marker = Path(request["readyMarker"])
    marker.write_text("ready\n", encoding="utf-8")
    stop = time.monotonic() + 2.0
    expected = request["replacement"].encode("utf-8")
    while time.monotonic() < stop:
        if os.pread(descriptor, len(expected), 0) == expected:
            return {"nominal": "success"}
        time.sleep(0.005)
    raise RuntimeError("pinned mutation was not observed")


@native_engine_entrypoint
def _observe_transient_pinned_mutation(request, context: NativeChildContext):
    descriptor = context.pinned_file_descriptor(request["token"])
    ready_marker = Path(request["readyMarker"])
    observed_marker = Path(request["observedMarker"])
    restored_marker = Path(request["restoredMarker"])
    replacement = request["replacement"].encode("utf-8")
    original = request["original"].encode("utf-8")
    ready_marker.write_text("ready\n", encoding="utf-8")

    stop = time.monotonic() + 2.0
    while time.monotonic() < stop:
        if os.pread(descriptor, len(replacement), 0) == replacement:
            observed_marker.write_text("observed\n", encoding="utf-8")
            break
        time.sleep(0.005)
    else:
        raise RuntimeError("transient pinned mutation was not observed")

    while time.monotonic() < stop:
        if (
            restored_marker.exists()
            and os.pread(descriptor, len(original), 0) == original
        ):
            return {"mustNotBeAccepted": True}
        time.sleep(0.005)
    raise RuntimeError("pinned bytes were not restored")


@native_engine_entrypoint
def _spawn_survivor_and_return(request, _context: NativeChildContext):
    descendant_pid = Path(request["descendantPid"])
    late_artifact = Path(request["lateArtifact"])
    program = (
        "import os,pathlib,signal,sys,time; "
        "signal.signal(signal.SIGTERM, signal.SIG_IGN); "
        "pathlib.Path(sys.argv[1]).write_text(str(os.getpid()), encoding='utf-8'); "
        "time.sleep(0.75); "
        "pathlib.Path(sys.argv[2]).write_text('late-artifact\\n', encoding='utf-8')"
    )
    subprocess.Popen(
        [
            sys.executable,
            "-c",
            program,
            str(descendant_pid),
            str(late_artifact),
        ],
        close_fds=True,
    )
    stop = time.monotonic() + 2.0
    while not descendant_pid.exists():
        if time.monotonic() >= stop:
            raise RuntimeError("surviving descendant did not report its pid")
        time.sleep(0.005)
    return {"mustNotBeAccepted": True}


def _unmarked_entrypoint(_request, _context: NativeChildContext):
    return {"unsafe": True}


def _pid_is_gone(pid: int) -> bool:
    try:
        os.kill(pid, 0)
    except ProcessLookupError:
        return True
    return False


@pytest.mark.skipif(os.name != "posix", reason="Refine requires POSIX process groups")
def test_native_child_receives_one_shared_remaining_budget():
    result = run_native_engine_child(
        _entrypoint("_echo_with_budget"),
        {"fixture": "known-pose"},
        deadline=_deadline(3.0),
    )

    assert result["request"] == {"fixture": "known-pose"}
    assert 0.0 < result["remainingBudgetSeconds"] <= 3.0


def test_public_native_child_context_is_never_boundary_authenticated():
    context = NativeChildContext(time.monotonic() + 3.0)

    assert context.is_verified_native_boundary is False


@pytest.mark.skipif(os.name != "posix", reason="Refine requires POSIX process groups")
def test_only_child_entrypoint_context_is_boundary_authenticated():
    result = run_native_engine_child(
        _entrypoint("_report_boundary_seal"),
        {},
        deadline=_deadline(3.0),
    )

    assert result == {"verified": True}


def test_boundary_authentication_rejects_pid_session_and_inspection_failures(
    monkeypatch,
):
    context = NativeChildContext(time.monotonic() + 3.0)
    pid = os.getpid()
    object.__setattr__(context, "_boundary_pid", pid)
    monkeypatch.setattr(native_process.os, "getsid", lambda _value: pid)
    monkeypatch.setattr(native_process.os, "getpgrp", lambda: pid)

    object.__setattr__(context, "_boundary_seal", object())
    assert context.is_verified_native_boundary is False
    object.__setattr__(
        context,
        "_boundary_seal",
        native_process._NATIVE_CHILD_CONTEXT_SEAL,
    )
    assert context.is_verified_native_boundary is True

    object.__setattr__(context, "_boundary_pid", pid + 1)
    assert context.is_verified_native_boundary is False
    object.__setattr__(context, "_boundary_pid", pid)
    monkeypatch.setattr(native_process.os, "getsid", lambda _value: pid + 1)
    assert context.is_verified_native_boundary is False

    def fail_inspection(_value):
        raise RuntimeError("synthetic PID/session inspection failure")

    monkeypatch.setattr(native_process.os, "getsid", fail_inspection)
    assert context.is_verified_native_boundary is False
    with pytest.raises(
        native_process._ChildTransportError,
        match="cannot be inspected",
    ):
        native_process._seal_native_child_context(context)


@pytest.mark.skipif(os.name != "posix", reason="Refine requires POSIX process groups")
def test_success_group_is_frozen_and_checked_before_leader_reap(monkeypatch):
    events: list[str] = []
    joined = False
    real_join = BaseProcess.join
    real_killpg = os.killpg

    def record_join(process, timeout=None):
        nonlocal joined
        if process.name == "patina-refine-native":
            joined = True
            events.append("join")
        return real_join(process, timeout)

    def record_group_signal(process_group_id, sent_signal):
        if sent_signal == signal.SIGSTOP:
            assert not joined
            events.append("freeze")
        return real_killpg(process_group_id, sent_signal)

    monkeypatch.setattr(BaseProcess, "join", record_join)
    monkeypatch.setattr(native_process.os, "killpg", record_group_signal)

    result = run_native_engine_child(
        _entrypoint("_echo_with_budget"),
        {"fixture": "quiescence-order"},
        deadline=_deadline(3.0),
    )

    assert result["request"] == {"fixture": "quiescence-order"}
    assert events == ["freeze", "join"]


def test_linux_process_stat_parser_handles_parentheses_in_command_name():
    payload = b"123 (worker ) name) S 1 77 77 0 -1 4194560 1 2 3 4 5 6 7 8 9 10 11 12\n"

    assert native_process._parse_linux_process_stat(payload) == (123, 77)


@pytest.mark.skipif(os.name != "posix", reason="Refine requires SCM_RIGHTS")
def test_native_child_reads_unlinked_path_swapped_pinned_bytes(tmp_path):
    original = b"qualified-pinned-bytes"
    replacement = b"replacement-path-bytes"
    source_path = tmp_path / "frame.ppm"
    source_path.write_bytes(original)

    with source_path.open("rb") as source:
        source.seek(7)
        pinned = NativePinnedFile(
            descriptor=source.fileno(),
            sha256=hashlib.sha256(original).hexdigest(),
            size_bytes=len(original),
        )
        source_path.unlink()
        source_path.write_bytes(replacement)

        result = run_native_engine_child(
            _entrypoint("_read_pinned_file"),
            {"token": "frame.000000"},
            deadline=_deadline(3.0),
            pinned_files={"frame.000000": pinned},
        )

        assert source.tell() == 7

    assert result == {
        "payloadHex": original.hex(),
        "sha256": hashlib.sha256(original).hexdigest(),
        "tokens": ["frame.000000"],
        "offset": 7,
    }
    assert source_path.read_bytes() == replacement


@pytest.mark.skipif(os.name != "posix", reason="Refine requires SCM_RIGHTS")
def test_native_child_rejects_and_restores_shared_offset_mutation(tmp_path):
    payload = b"qualified-pinned-bytes"
    source_path = tmp_path / "offset.ppm"
    source_path.write_bytes(payload)

    with source_path.open("rb") as source:
        source.seek(7)
        pinned = NativePinnedFile(
            descriptor=source.fileno(),
            sha256=hashlib.sha256(payload).hexdigest(),
            size_bytes=len(payload),
        )

        with pytest.raises(
            AdapterError,
            match="changed after transfer validation",
        ) as raised:
            run_native_engine_child(
                _entrypoint("_advance_pinned_file_offset"),
                {"token": "frame.000000"},
                deadline=_deadline(3.0),
                pinned_files={"frame.000000": pinned},
            )

        assert raised.value.code == "REFINE_INPUT_INVALID"
        assert source.tell() == 7


@pytest.mark.skipif(os.name != "posix", reason="Refine requires SCM_RIGHTS")
def test_parent_restores_shared_offset_when_mutating_child_times_out(tmp_path):
    payload = b"qualified-pinned-bytes"
    source_path = tmp_path / "timeout-offset.ppm"
    ready_marker = tmp_path / "offset-advanced"
    source_path.write_bytes(payload)

    with source_path.open("rb") as source:
        source.seek(7)
        pinned = NativePinnedFile(
            descriptor=source.fileno(),
            sha256=hashlib.sha256(payload).hexdigest(),
            size_bytes=len(payload),
        )

        with pytest.raises(AdapterError) as raised:
            run_native_engine_child(
                _entrypoint("_advance_pinned_file_offset_then_sleep"),
                {
                    "token": "frame.000000",
                    "readyMarker": str(ready_marker),
                },
                deadline=_deadline(1.0),
                pinned_files={"frame.000000": pinned},
            )

        assert raised.value.code == "REFINE_ENGINE_CLEANUP_FAILED"
        assert "shared offset; parent cleanup restored it" in str(raised.value)
        assert ready_marker.read_text(encoding="utf-8") == "advanced\n"
        assert source.tell() == 7


@pytest.mark.skipif(os.name != "posix", reason="Refine requires SCM_RIGHTS")
def test_pinned_descriptor_is_sent_only_after_verified_ready_ack(
    monkeypatch,
    tmp_path,
):
    from multiprocessing import reduction

    payload = b"ordered-transfer"
    source_path = tmp_path / "ordered.ppm"
    source_path.write_bytes(payload)
    events: list[str] = []
    real_send_bytes = native_process.Connection.send_bytes
    real_send_handle = reduction.send_handle

    def record_ack(connection, value, *args, **kwargs):
        if value == native_process._ACK_READY:
            events.append("ready-ack")
        elif value == native_process._ACK_ACCEPT:
            events.append("result-ack")
        return real_send_bytes(connection, value, *args, **kwargs)

    def record_handle(connection, descriptor, destination_pid):
        events.append("descriptor")
        return real_send_handle(connection, descriptor, destination_pid)

    monkeypatch.setattr(native_process.Connection, "send_bytes", record_ack)
    monkeypatch.setattr(reduction, "send_handle", record_handle)

    with source_path.open("rb") as source:
        result = run_native_engine_child(
            _entrypoint("_read_pinned_file"),
            {"token": "frame"},
            deadline=_deadline(3.0),
            pinned_files={
                "frame": NativePinnedFile(
                    source.fileno(),
                    hashlib.sha256(payload).hexdigest(),
                    len(payload),
                )
            },
        )

    assert result["payloadHex"] == payload.hex()
    assert events == ["ready-ack", "descriptor", "result-ack"]


@pytest.mark.skipif(os.name != "posix", reason="Refine requires POSIX process groups")
def test_no_file_transfer_accepts_legacy_ready_without_pinned_count(monkeypatch):
    real_receive = native_process._receive_envelope
    stripped = False

    def strip_ready_count(connection, process, deadline):
        nonlocal stripped
        envelope = real_receive(connection, process, deadline)
        if not stripped and envelope.get("kind") == "ready":
            envelope = dict(envelope)
            envelope.pop("pinnedFileCount")
            stripped = True
        return envelope

    monkeypatch.setattr(native_process, "_receive_envelope", strip_ready_count)

    result = run_native_engine_child(
        _entrypoint("_echo_with_budget"),
        {"fixture": "legacy-ready"},
        deadline=_deadline(3.0),
    )

    assert stripped
    assert result["request"] == {"fixture": "legacy-ready"}


@pytest.mark.skipif(os.name != "posix", reason="Refine requires SCM_RIGHTS")
def test_native_child_rejects_inode_mutated_during_entrypoint(tmp_path):
    original = b"original-pinned"
    replacement = b"mutated!-pinned"
    assert len(original) == len(replacement)
    source_path = tmp_path / "mutable.ppm"
    marker = tmp_path / "child-ready"
    source_path.write_bytes(original)
    writer_errors: list[BaseException] = []

    def mutate_after_child_readiness() -> None:
        try:
            stop = time.monotonic() + 3.0
            while time.monotonic() < stop and not marker.exists():
                time.sleep(0.005)
            if not marker.exists():
                raise RuntimeError("child did not reach the mutation gate")
            with source_path.open("r+b") as writer:
                writer.write(replacement)
                writer.flush()
                os.fsync(writer.fileno())
        except Exception as exc:
            writer_errors.append(exc)

    with source_path.open("rb") as source:
        thread = threading.Thread(target=mutate_after_child_readiness)
        thread.start()
        try:
            with pytest.raises(AdapterError) as raised:
                run_native_engine_child(
                    _entrypoint("_wait_for_pinned_mutation"),
                    {
                        "token": "frame",
                        "readyMarker": str(marker),
                        "replacement": replacement.decode("utf-8"),
                    },
                    deadline=_deadline(3.0),
                    pinned_files={
                        "frame": NativePinnedFile(
                            descriptor=source.fileno(),
                            sha256=hashlib.sha256(original).hexdigest(),
                            size_bytes=len(original),
                        )
                    },
                )
        finally:
            thread.join(timeout=3.0)

    assert not thread.is_alive()
    assert writer_errors == []
    assert raised.value.code == "REFINE_INPUT_INVALID"
    assert any(
        detail in str(raised.value)
        for detail in (
            "changed after transfer validation",
            "changed during verification",
            "sha256 does not match",
        )
    )


@pytest.mark.skipif(os.name != "posix", reason="Refine requires SCM_RIGHTS")
def test_native_child_rejects_transient_inode_mutation_restored_before_return(
    tmp_path,
):
    original = b"original-pinned"
    replacement = b"mutated!-pinned"
    assert len(original) == len(replacement)
    source_path = tmp_path / "transient.ppm"
    ready_marker = tmp_path / "transient-ready"
    observed_marker = tmp_path / "transient-observed"
    restored_marker = tmp_path / "transient-restored"
    source_path.write_bytes(original)
    initial_metadata = source_path.stat()
    writer_errors: list[BaseException] = []

    def mutate_and_restore_after_child_readiness() -> None:
        try:
            stop = time.monotonic() + 3.0
            while time.monotonic() < stop and not ready_marker.exists():
                time.sleep(0.005)
            if not ready_marker.exists():
                raise RuntimeError("child did not reach the transient mutation gate")
            with source_path.open("r+b") as writer:
                writer.write(replacement)
                writer.flush()
                os.fsync(writer.fileno())
                while time.monotonic() < stop and not observed_marker.exists():
                    time.sleep(0.005)
                if not observed_marker.exists():
                    raise RuntimeError("child did not observe transient replacement")
                writer.seek(0)
                writer.write(original)
                writer.flush()
                os.fsync(writer.fileno())
            os.utime(
                source_path,
                ns=(initial_metadata.st_atime_ns, initial_metadata.st_mtime_ns),
            )
            restored_marker.write_text("restored\n", encoding="utf-8")
        except Exception as exc:
            writer_errors.append(exc)

    with source_path.open("rb") as source:
        thread = threading.Thread(target=mutate_and_restore_after_child_readiness)
        thread.start()
        try:
            with pytest.raises(AdapterError) as raised:
                run_native_engine_child(
                    _entrypoint("_observe_transient_pinned_mutation"),
                    {
                        "token": "frame",
                        "readyMarker": str(ready_marker),
                        "observedMarker": str(observed_marker),
                        "restoredMarker": str(restored_marker),
                        "original": original.decode("utf-8"),
                        "replacement": replacement.decode("utf-8"),
                    },
                    deadline=_deadline(3.0),
                    pinned_files={
                        "frame": NativePinnedFile(
                            descriptor=source.fileno(),
                            sha256=hashlib.sha256(original).hexdigest(),
                            size_bytes=len(original),
                        )
                    },
                )
        finally:
            thread.join(timeout=3.0)

    assert not thread.is_alive()
    assert writer_errors == []
    assert observed_marker.is_file()
    assert source_path.read_bytes() == original
    assert raised.value.code == "REFINE_INPUT_INVALID"
    assert "changed after transfer validation" in str(raised.value)


@pytest.mark.skipif(os.name != "posix", reason="Refine requires SCM_RIGHTS")
@pytest.mark.parametrize(
    ("token", "fingerprint_change", "detail"),
    (
        ("../escape", None, "tokens must be"),
        ("a" * 65, None, "tokens must be"),
        ("\N{LATIN SMALL LETTER E WITH ACUTE}", None, "tokens must be"),
        ("frame", "sha256", "sha256 does not match"),
        ("frame", "size", "size does not match"),
    ),
)
def test_native_pinned_file_rejects_unsafe_token_or_wrong_ledger(
    tmp_path,
    token,
    fingerprint_change,
    detail,
):
    payload = b"pinned-ledger"
    source_path = tmp_path / "ledger.ppm"
    source_path.write_bytes(payload)
    with source_path.open("rb") as source:
        sha256 = hashlib.sha256(payload).hexdigest()
        size_bytes = len(payload)
        if fingerprint_change == "sha256":
            sha256 = "0" * 64
        elif fingerprint_change == "size":
            size_bytes += 1
        with pytest.raises(AdapterError) as raised:
            run_native_engine_child(
                _entrypoint("_read_pinned_file"),
                {"token": token},
                deadline=_deadline(3.0),
                pinned_files={
                    token: NativePinnedFile(
                        descriptor=source.fileno(),
                        sha256=sha256,
                        size_bytes=size_bytes,
                    )
                },
            )

    assert raised.value.code == "REFINE_INPUT_INVALID"
    assert detail in str(raised.value)


@pytest.mark.skipif(os.name != "posix", reason="Refine requires SCM_RIGHTS")
def test_native_pinned_file_rejects_nonregular_writable_and_duplicate_descriptors(
    tmp_path,
):
    payload = b"descriptor-contract"
    source_path = tmp_path / "source.ppm"
    source_path.write_bytes(payload)
    sha256 = hashlib.sha256(payload).hexdigest()

    directory_descriptor = os.open(tmp_path, os.O_RDONLY)
    try:
        with pytest.raises(AdapterError, match="regular file") as nonregular:
            run_native_engine_child(
                _entrypoint("_read_pinned_file"),
                {"token": "frame"},
                deadline=_deadline(3.0),
                pinned_files={
                    "frame": NativePinnedFile(
                        directory_descriptor,
                        sha256,
                        len(payload),
                    )
                },
            )
        assert nonregular.value.code == "REFINE_INPUT_INVALID"
    finally:
        os.close(directory_descriptor)

    writable_descriptor = os.open(source_path, os.O_RDWR)
    try:
        with pytest.raises(AdapterError, match="opened read-only") as writable:
            run_native_engine_child(
                _entrypoint("_read_pinned_file"),
                {"token": "frame"},
                deadline=_deadline(3.0),
                pinned_files={
                    "frame": NativePinnedFile(writable_descriptor, sha256, len(payload))
                },
            )
        assert writable.value.code == "REFINE_INPUT_INVALID"
    finally:
        os.close(writable_descriptor)

    with source_path.open("rb") as source:
        value = NativePinnedFile(source.fileno(), sha256, len(payload))
        with pytest.raises(AdapterError, match="unique non-negative") as duplicate:
            run_native_engine_child(
                _entrypoint("_read_pinned_file"),
                {"token": "frame"},
                deadline=_deadline(3.0),
                pinned_files={"frame": value, "frame-copy": value},
            )
        assert duplicate.value.code == "REFINE_INPUT_INVALID"

    with source_path.open("rb") as first, source_path.open("rb") as second:
        with pytest.raises(AdapterError, match="unique regular-file") as same_inode:
            run_native_engine_child(
                _entrypoint("_read_pinned_file"),
                {"token": "frame"},
                deadline=_deadline(3.0),
                pinned_files={
                    "frame": NativePinnedFile(
                        first.fileno(),
                        sha256,
                        len(payload),
                    ),
                    "frame-copy": NativePinnedFile(
                        second.fileno(),
                        sha256,
                        len(payload),
                    ),
                },
            )
        assert same_inode.value.code == "REFINE_INPUT_INVALID"


def test_native_pinned_file_rejects_closed_descriptor_before_spawn(tmp_path):
    source_path = tmp_path / "closed.ppm"
    payload = b"closed-descriptor"
    source_path.write_bytes(payload)
    descriptor = os.open(source_path, os.O_RDONLY)
    os.close(descriptor)

    with pytest.raises(AdapterError, match="could not be duplicated") as raised:
        run_native_engine_child(
            _entrypoint("_read_pinned_file"),
            {"token": "frame"},
            deadline=_deadline(3.0),
            pinned_files={
                "frame": NativePinnedFile(
                    descriptor,
                    hashlib.sha256(payload).hexdigest(),
                    len(payload),
                )
            },
        )

    assert raised.value.code == "REFINE_INPUT_INVALID"


def test_parent_closes_duplicate_when_noninheritable_setup_fails(
    monkeypatch,
    tmp_path,
):
    payload = b"noninheritable-parent"
    source_path = tmp_path / "parent.ppm"
    source_path.write_bytes(payload)
    duplicates: list[int] = []
    closed: list[int] = []
    real_dup = os.dup
    real_close = os.close
    real_set_inheritable = os.set_inheritable

    def record_dup(descriptor):
        duplicate = real_dup(descriptor)
        duplicates.append(duplicate)
        return duplicate

    def fail_noninheritable(descriptor, _inheritable):
        if descriptor in duplicates:
            raise OSError("synthetic non-inheritable failure")
        return real_set_inheritable(descriptor, _inheritable)

    def record_close(descriptor):
        if descriptor in duplicates:
            closed.append(descriptor)
        return real_close(descriptor)

    monkeypatch.setattr(native_process.os, "dup", record_dup)
    monkeypatch.setattr(
        native_process.os,
        "set_inheritable",
        fail_noninheritable,
    )
    monkeypatch.setattr(native_process.os, "close", record_close)

    with source_path.open("rb") as source:
        with pytest.raises(AdapterError) as raised:
            run_native_engine_child(
                _entrypoint("_read_pinned_file"),
                {"token": "frame"},
                deadline=_deadline(3.0),
                pinned_files={
                    "frame": NativePinnedFile(
                        source.fileno(),
                        hashlib.sha256(payload).hexdigest(),
                        len(payload),
                    )
                },
            )
        assert os.pread(source.fileno(), len(payload), 0) == payload

    assert raised.value.code == "REFINE_ENGINE_FAILED"
    assert duplicates
    assert closed == duplicates


def test_child_closes_received_descriptor_when_noninheritable_setup_fails(
    monkeypatch,
    tmp_path,
):
    payload = b"noninheritable-child"
    source_path = tmp_path / "child.ppm"
    source_path.write_bytes(payload)
    real_close = os.close
    real_set_inheritable = os.set_inheritable
    closed: list[int] = []

    class ReadyConnection:
        def poll(self, _timeout):
            return True

    with source_path.open("rb") as source:
        received_descriptor = os.dup(source.fileno())

        def fail_noninheritable(descriptor, _inheritable):
            if descriptor == received_descriptor:
                raise OSError("synthetic child non-inheritable failure")
            return real_set_inheritable(descriptor, _inheritable)

        def record_close(descriptor):
            if descriptor == received_descriptor:
                closed.append(descriptor)
            return real_close(descriptor)

        monkeypatch.setattr(
            "multiprocessing.reduction.recv_handle",
            lambda _connection: received_descriptor,
        )
        monkeypatch.setattr(
            native_process.os,
            "set_inheritable",
            fail_noninheritable,
        )
        monkeypatch.setattr(native_process.os, "close", record_close)

        with pytest.raises(OSError, match="synthetic child non-inheritable"):
            native_process._receive_pinned_files(
                ReadyConnection(),
                (("frame", hashlib.sha256(payload).hexdigest(), len(payload)),),
                context=NativeChildContext(time.monotonic() + 3.0),
            )

    assert closed == [received_descriptor]


@pytest.mark.parametrize(
    ("values", "detail"),
    (
        (
            {
                "frame": NativePinnedFile(
                    1000,
                    "0" * 64,
                    NATIVE_CHILD_MAX_PINNED_FILE_BYTES + 1,
                )
            },
            "per-file byte limit",
        ),
        (
            {
                f"frame.{index:06d}": NativePinnedFile(
                    1000 + index,
                    "0" * 64,
                    NATIVE_CHILD_MAX_PINNED_FILE_BYTES,
                )
                for index in range(
                    (
                        NATIVE_CHILD_MAX_PINNED_TOTAL_BYTES
                        // NATIVE_CHILD_MAX_PINNED_FILE_BYTES
                    )
                    + 1
                )
            },
            "aggregate byte limit",
        ),
    ),
)
def test_native_pinned_file_byte_caps_are_enforced_before_duplication(
    monkeypatch,
    values,
    detail,
):
    side_effects: list[str] = []
    monkeypatch.setattr(
        native_process.os,
        "dup",
        lambda _descriptor: side_effects.append("duplicate"),
    )
    monkeypatch.setattr(
        native_process.multiprocessing,
        "get_context",
        lambda _method: side_effects.append("spawn-context"),
    )

    with pytest.raises(AdapterError, match=detail) as raised:
        run_native_engine_child(
            _entrypoint("_read_pinned_file"),
            {"token": "frame"},
            deadline=_deadline(3.0),
            pinned_files=values,
        )

    assert raised.value.code == "REFINE_INPUT_INVALID"
    assert side_effects == []


def test_native_pinned_file_count_is_bounded_before_spawn(monkeypatch):
    launched: list[str] = []
    monkeypatch.setattr(
        native_process.multiprocessing,
        "get_context",
        lambda _method: launched.append("context"),
    )
    values = {
        f"frame.{index:06d}": NativePinnedFile(index, "0" * 64, 0)
        for index in range(NATIVE_CHILD_MAX_PINNED_FILES + 1)
    }

    with pytest.raises(AdapterError, match="count exceeds") as raised:
        run_native_engine_child(
            _entrypoint("_read_pinned_file"),
            {"token": "frame.000000"},
            deadline=_deadline(3.0),
            pinned_files=values,
        )

    assert raised.value.code == "REFINE_INPUT_INVALID"
    assert launched == []


def test_preexpired_deadline_does_not_duplicate_pinned_file_or_spawn(
    monkeypatch,
    tmp_path,
):
    payload = b"preexpired-pinned-file"
    source_path = tmp_path / "preexpired.ppm"
    source_path.write_bytes(payload)
    side_effects: list[str] = []

    class ExpiredDeadline:
        expires_at_monotonic_s = 1.0

        def remaining_seconds(self):
            raise AdapterError(
                "refine stage engine deadline is exhausted",
                "REFINE_ENGINE_TIMEOUT",
            )

    monkeypatch.setattr(
        native_process.os,
        "dup",
        lambda _descriptor: side_effects.append("duplicate"),
    )
    monkeypatch.setattr(
        native_process.multiprocessing,
        "get_context",
        lambda _method: side_effects.append("spawn-context"),
    )

    with source_path.open("rb") as source, pytest.raises(AdapterError) as raised:
        run_native_engine_child(
            _entrypoint("_read_pinned_file"),
            {"token": "frame"},
            deadline=ExpiredDeadline(),
            pinned_files={
                "frame": NativePinnedFile(
                    source.fileno(),
                    hashlib.sha256(payload).hexdigest(),
                    len(payload),
                )
            },
        )

    assert raised.value.code == "REFINE_ENGINE_TIMEOUT"
    assert side_effects == []


@pytest.mark.skipif(os.name != "posix", reason="Refine requires SCM_RIGHTS")
def test_interrupted_pinned_file_transfer_closes_duplicate_and_kills_child(
    monkeypatch,
    tmp_path,
):
    payload = b"interrupt-transfer"
    source_path = tmp_path / "interrupt.ppm"
    source_path.write_bytes(payload)
    closed_tokens: list[str] = []
    cleanup_calls: list[tuple[int | None, tuple[str, ...]]] = []
    real_close_descriptors = native_process._close_descriptors_safely
    real_cleanup = native_process._cleanup_process

    def record_descriptor_closes(descriptors):
        rows = tuple(descriptors)
        closed_tokens.extend(token for token, _descriptor in rows)
        return real_close_descriptors(rows)

    def record_cleanup(process, *, group_leader_pid):
        errors = real_cleanup(
            process,
            group_leader_pid=group_leader_pid,
        )
        cleanup_calls.append((group_leader_pid, errors))
        return errors

    def interrupt_send_handle(_connection, _descriptor, _destination_pid):
        raise KeyboardInterrupt

    monkeypatch.setattr(
        native_process,
        "_close_descriptors_safely",
        record_descriptor_closes,
    )
    monkeypatch.setattr(native_process, "_cleanup_process", record_cleanup)
    monkeypatch.setattr(
        "multiprocessing.reduction.send_handle",
        interrupt_send_handle,
    )

    with source_path.open("rb") as source:
        with pytest.raises(KeyboardInterrupt):
            run_native_engine_child(
                _entrypoint("_read_pinned_file"),
                {"token": "frame"},
                deadline=_deadline(3.0),
                pinned_files={
                    "frame": NativePinnedFile(
                        source.fileno(),
                        hashlib.sha256(payload).hexdigest(),
                        len(payload),
                    )
                },
            )
        assert os.pread(source.fileno(), len(payload), 0) == payload

    assert closed_tokens.count("frame") == 1
    assert len(cleanup_calls) == 1
    group_leader_pid, cleanup_errors = cleanup_calls[0]
    assert isinstance(group_leader_pid, int)
    assert cleanup_errors == ()
    assert _pid_is_gone(group_leader_pid)


@pytest.mark.skipif(os.name != "posix", reason="Refine requires POSIX process groups")
def test_native_child_rejects_entrypoint_without_in_process_only_contract():
    with pytest.raises(AdapterError) as raised:
        run_native_engine_child(
            _entrypoint("_unmarked_entrypoint"),
            {},
            deadline=_deadline(3.0),
        )

    assert raised.value.code == "REFINE_ENGINE_FAILED"
    assert "in-process-only contract" in str(raised.value)


def test_native_child_start_oserror_is_stable(monkeypatch):
    class FakeConnection:
        def close(self):
            return None

    class StartFailureProcess:
        def start(self):
            raise OSError("synthetic spawn failure")

    class StartFailureContext:
        def Pipe(self, *, duplex):
            assert duplex is True
            return FakeConnection(), FakeConnection()

        def Process(self, **_kwargs):
            return StartFailureProcess()

    monkeypatch.setattr(
        native_process.multiprocessing,
        "get_context",
        lambda method: StartFailureContext() if method == "spawn" else None,
    )

    with pytest.raises(AdapterError) as raised:
        run_native_engine_child(
            _entrypoint("_echo_with_budget"),
            {},
            deadline=_deadline(3.0),
        )

    assert raised.value.code == "REFINE_ENGINE_FAILED"
    assert "cannot start refine native child: synthetic spawn failure" in str(
        raised.value
    )


def test_deadline_expiring_during_setup_does_not_start_child(monkeypatch):
    starts: list[str] = []
    close_attempts: list[str] = []

    class TrackingConnection:
        def __init__(self, label):
            self.label = label

        def close(self):
            close_attempts.append(self.label)

    class TrackingProcess:
        def start(self):
            starts.append("started")

    class SlowSetupContext:
        def Pipe(self, *, duplex):
            assert duplex is True
            return TrackingConnection("parent"), TrackingConnection("child")

        def Process(self, **_kwargs):
            return TrackingProcess()

    class SetupExpiringDeadline:
        expires_at_monotonic_s = 1.0

        def __init__(self):
            self.checks = 0

        def remaining_seconds(self):
            self.checks += 1
            if self.checks == 1:
                return 1.0
            raise AdapterError(
                "refine stage engine deadline is exhausted",
                "REFINE_ENGINE_TIMEOUT",
            )

    deadline = SetupExpiringDeadline()
    monkeypatch.setattr(
        native_process.multiprocessing,
        "get_context",
        lambda method: SlowSetupContext() if method == "spawn" else None,
    )

    with pytest.raises(AdapterError) as raised:
        run_native_engine_child(
            _entrypoint("_echo_with_budget"),
            {},
            deadline=deadline,
        )

    assert raised.value.code == "REFINE_ENGINE_TIMEOUT", str(raised.value)
    assert starts == []
    assert deadline.checks == 2
    assert close_attempts == ["parent", "child"]


@pytest.mark.parametrize(
    ("close_error", "expected_code"),
    (
        (False, "REFINE_ENGINE_FAILED"),
        (True, "REFINE_ENGINE_CLEANUP_FAILED"),
    ),
)
def test_process_construction_exception_closes_both_pipes_and_is_stable(
    monkeypatch,
    close_error,
    expected_code,
):
    close_attempts: list[str] = []

    class TrackingConnection:
        def __init__(self, label, *, close_error=False):
            self.label = label
            self.close_error = close_error

        def close(self):
            close_attempts.append(self.label)
            if self.close_error:
                raise RuntimeError("synthetic process-construction close failure")

    parent = TrackingConnection("parent", close_error=close_error)
    child = TrackingConnection("child")

    class ConstructionFailureContext:
        def Pipe(self, *, duplex):
            assert duplex is True
            return parent, child

        def Process(self, **_kwargs):
            raise RuntimeError("synthetic process construction failure")

    monkeypatch.setattr(
        native_process.multiprocessing,
        "get_context",
        lambda method: ConstructionFailureContext() if method == "spawn" else None,
    )

    with pytest.raises(AdapterError) as raised:
        run_native_engine_child(
            _entrypoint("_echo_with_budget"),
            {},
            deadline=_deadline(3.0),
        )

    assert raised.value.code == expected_code
    assert "cannot prepare refine native child" in str(raised.value)
    assert "synthetic process construction failure" in str(raised.value)
    assert (
        "synthetic process-construction close failure" in str(raised.value)
    ) is close_error
    assert close_attempts == ["parent", "child"]


def test_final_pipe_close_failure_does_not_mask_start_error(monkeypatch):
    close_attempts: list[str] = []

    class RaisingCloseConnection:
        def __init__(self, label):
            self.label = label

        def close(self):
            close_attempts.append(self.label)
            raise RuntimeError(
                f"synthetic {self.label} final close failure " + ("x" * 16_000)
            )

    class StartFailureProcess:
        def start(self):
            raise OSError("synthetic intended start failure")

    class StartFailureContext:
        def Pipe(self, *, duplex):
            assert duplex is True
            return RaisingCloseConnection("parent"), RaisingCloseConnection("child")

        def Process(self, **_kwargs):
            return StartFailureProcess()

    monkeypatch.setattr(
        native_process.multiprocessing,
        "get_context",
        lambda method: StartFailureContext() if method == "spawn" else None,
    )

    with pytest.raises(AdapterError) as raised:
        run_native_engine_child(
            _entrypoint("_echo_with_budget"),
            {},
            deadline=_deadline(3.0),
        )

    assert raised.value.code == "REFINE_ENGINE_FAILED"
    assert "cannot start refine native child: synthetic intended start failure" in str(
        raised.value
    )
    assert close_attempts == ["parent", "child"]
    notes = getattr(raised.value, "__notes__", ())
    assert len(notes) == 1
    assert "parent final close failure" in notes[0]
    assert "child final close failure" in notes[0]
    assert len(notes[0].encode("utf-8")) <= NATIVE_CHILD_MAX_ERROR_BYTES


@pytest.mark.skipif(os.name != "posix", reason="Refine requires POSIX process groups")
def test_native_child_ack_oserror_is_stable(monkeypatch):
    real_send_bytes = native_process.Connection.send_bytes
    real_cleanup = native_process._terminate_and_reap

    def fail_parent_ack(connection, payload, *args, **kwargs):
        if payload == b"accept-v1":
            raise BrokenPipeError("synthetic closed result pipe")
        return real_send_bytes(connection, payload, *args, **kwargs)

    def cleanup_with_reported_failure(process, *, group_leader_pid):
        return (
            *real_cleanup(process, group_leader_pid=group_leader_pid),
            "synthetic cleanup failure",
        )

    monkeypatch.setattr(native_process.Connection, "send_bytes", fail_parent_ack)
    monkeypatch.setattr(
        native_process,
        "_terminate_and_reap",
        cleanup_with_reported_failure,
    )

    with pytest.raises(AdapterError) as raised:
        run_native_engine_child(
            _entrypoint("_echo_with_budget"),
            {},
            deadline=_deadline(3.0),
        )

    assert raised.value.code == "REFINE_ENGINE_CLEANUP_FAILED"
    assert "cannot acknowledge refine native child result" in str(raised.value)
    assert "cleanup:" in str(raised.value)
    assert "synthetic cleanup failure" in str(raised.value)


@pytest.mark.skipif(os.name != "posix", reason="Refine requires POSIX process groups")
def test_ready_ack_failure_cleans_group_before_importing_engine_target(
    monkeypatch,
    tmp_path,
):
    import_marker = tmp_path / "engine-imported"
    module_path = tmp_path / "ready_ack_probe.py"
    module_path.write_text(
        "from pathlib import Path\n"
        "import os\n"
        "Path(os.environ['PATINA_READY_ACK_IMPORT_MARKER']).write_text('imported')\n"
        "from patina_scan_worker.refine_native_process import "
        "native_engine_entrypoint\n"
        "@native_engine_entrypoint\n"
        "def run(request, context):\n"
        "    return {'unexpected': True}\n",
        encoding="utf-8",
    )
    monkeypatch.syspath_prepend(str(tmp_path))
    monkeypatch.setenv("PATINA_READY_ACK_IMPORT_MARKER", str(import_marker))

    real_send_bytes = native_process.Connection.send_bytes
    real_cleanup = native_process._terminate_and_reap
    cleaned_group_leaders: list[int | None] = []

    def fail_ready_ack(connection, payload, *args, **kwargs):
        if payload == native_process._ACK_READY:
            raise BrokenPipeError("synthetic closed ready pipe")
        return real_send_bytes(connection, payload, *args, **kwargs)

    def record_cleanup(process, *, group_leader_pid):
        cleaned_group_leaders.append(group_leader_pid)
        return real_cleanup(process, group_leader_pid=group_leader_pid)

    monkeypatch.setattr(native_process.Connection, "send_bytes", fail_ready_ack)
    monkeypatch.setattr(native_process, "_terminate_and_reap", record_cleanup)

    with pytest.raises(AdapterError) as raised:
        run_native_engine_child(
            "ready_ack_probe:run",
            {},
            deadline=_deadline(3.0),
        )

    assert raised.value.code == "REFINE_ENGINE_FAILED"
    assert "cannot acknowledge refine native child readiness" in str(raised.value)
    assert len(cleaned_group_leaders) == 1
    assert isinstance(cleaned_group_leaders[0], int)
    assert not import_marker.exists()


@pytest.mark.skipif(os.name != "posix", reason="Refine requires POSIX process groups")
@pytest.mark.parametrize("replacement", (b"wrong-ready-ack", b"ready-accept-v1!"))
def test_child_requires_bounded_exact_ready_ack_before_engine_import(
    monkeypatch,
    tmp_path,
    replacement,
):
    import_marker = tmp_path / "engine-imported"
    module_path = tmp_path / "ready_ack_exact_probe.py"
    module_path.write_text(
        "from pathlib import Path\n"
        "import os\n"
        "Path(os.environ['PATINA_READY_ACK_IMPORT_MARKER']).write_text('imported')\n"
        "from patina_scan_worker.refine_native_process import "
        "native_engine_entrypoint\n"
        "@native_engine_entrypoint\n"
        "def run(request, context):\n"
        "    return {'unexpected': True}\n",
        encoding="utf-8",
    )
    monkeypatch.syspath_prepend(str(tmp_path))
    monkeypatch.setenv("PATINA_READY_ACK_IMPORT_MARKER", str(import_marker))

    real_send_bytes = native_process.Connection.send_bytes

    def replace_ready_ack(connection, payload, *args, **kwargs):
        if payload == native_process._ACK_READY:
            payload = replacement
        return real_send_bytes(connection, payload, *args, **kwargs)

    monkeypatch.setattr(native_process.Connection, "send_bytes", replace_ready_ack)

    with pytest.raises(AdapterError) as raised:
        run_native_engine_child(
            "ready_ack_exact_probe:run",
            {},
            deadline=_deadline(3.0),
        )

    assert raised.value.code == "REFINE_ENGINE_FAILED"
    assert not import_marker.exists()


@pytest.mark.skipif(os.name != "posix", reason="Refine requires POSIX process groups")
@pytest.mark.parametrize("replacement", (b"reject-v1", b"accept-v1!"))
def test_malformed_result_ack_is_parent_visible_failure(monkeypatch, replacement):
    real_send_bytes = native_process.Connection.send_bytes

    def replace_result_ack(connection, payload, *args, **kwargs):
        if payload == native_process._ACK_ACCEPT:
            payload = replacement
        return real_send_bytes(connection, payload, *args, **kwargs)

    monkeypatch.setattr(native_process.Connection, "send_bytes", replace_result_ack)

    with pytest.raises(AdapterError) as raised:
        run_native_engine_child(
            _entrypoint("_echo_with_budget"),
            {"fixture": "known-pose"},
            deadline=_deadline(3.0),
        )

    assert raised.value.code == "REFINE_ENGINE_FAILED"
    assert "exited unsuccessfully" in str(raised.value)


def test_native_child_sentinel_poll_oserror_is_stable(monkeypatch):
    sentinel = object()

    class PollFailureConnection:
        def poll(self, _timeout):
            raise OSError("synthetic sentinel poll failure")

    class ExitedProcess:
        pass

    process = ExitedProcess()
    process.sentinel = sentinel
    monkeypatch.setattr(native_process, "wait", lambda _objects, timeout: [sentinel])

    with pytest.raises(AdapterError) as raised:
        native_process._receive_envelope(
            PollFailureConnection(),
            process,
            _deadline(3.0),
        )

    assert raised.value.code == "REFINE_ENGINE_FAILED"
    assert "cannot inspect refine native child response" in str(raised.value)


@pytest.mark.skipif(os.name != "posix", reason="Refine requires POSIX process groups")
def test_native_child_join_oserror_is_stable(monkeypatch):
    real_join = BaseProcess.join
    failed = False

    def fail_first_parent_join(process, timeout=None):
        nonlocal failed
        if process.name == "patina-refine-native" and not failed:
            failed = True
            raise OSError("synthetic join failure")
        return real_join(process, timeout)

    monkeypatch.setattr(BaseProcess, "join", fail_first_parent_join)

    with pytest.raises(AdapterError) as raised:
        run_native_engine_child(
            _entrypoint("_echo_with_budget"),
            {},
            deadline=_deadline(3.0),
        )

    assert raised.value.code == "REFINE_ENGINE_FAILED"
    assert "cannot join refine native child leader: synthetic join failure" in str(
        raised.value
    )


@pytest.mark.skipif(os.name != "posix", reason="Refine requires POSIX process groups")
@pytest.mark.parametrize(
    ("target", "detail"),
    (
        ("_raise_large_error", "native-boom-"),
        ("_return_oversized_result", "exceeds the bounded transport"),
        (
            "_return_oversized_generated_result",
            "requires exact built-in JSON values",
        ),
    ),
)
def test_native_child_result_and_error_transport_is_bounded(target, detail):
    with pytest.raises(AdapterError) as raised:
        run_native_engine_child(
            _entrypoint(target),
            {},
            deadline=_deadline(3.0),
        )

    assert raised.value.code == "REFINE_ENGINE_FAILED"
    assert detail in str(raised.value)
    assert len(str(raised.value).encode("utf-8")) < 8 * 1024


def test_bounded_json_encoding_stops_an_oversized_chunk_generator_early():
    chunks_requested: list[int] = []

    def oversized_chunks():
        yield '{"value":"'
        for index in range(1000):
            chunks_requested.append(index)
            if index > 2:
                pytest.fail("bounded collector consumed past its byte cap")
            yield "x" * 32

    with pytest.raises(native_process._ChildTransportError) as raised:
        native_process._collect_bounded_json_chunks(
            oversized_chunks(),
            maximum_bytes=64,
            overflow_message="synthetic bounded overflow",
        )

    assert str(raised.value) == "synthetic bounded overflow"
    assert chunks_requested == [0, 1]


def test_bounded_json_encoding_is_canonical_and_counts_terminal_newline(monkeypatch):
    value = {"unicode": "Patina \N{WHITE HEART SUIT}", "value": [1, True, None]}
    canonical = (
        json.dumps(
            value,
            sort_keys=True,
            separators=(",", ":"),
            ensure_ascii=True,
            allow_nan=False,
        )
        + "\n"
    ).encode("utf-8")

    monkeypatch.setattr(
        native_process.json,
        "dumps",
        lambda *_args, **_kwargs: pytest.fail(
            "bounded transport materialized JSON with dumps"
        ),
    )

    assert (
        native_process._bounded_json_bytes(
            value,
            maximum_bytes=len(canonical),
            overflow_message="too large",
        )
        == canonical
    )
    with pytest.raises(native_process._ChildTransportError, match="too large"):
        native_process._bounded_json_bytes(
            value,
            maximum_bytes=len(canonical) - 1,
            overflow_message="too large",
        )


@pytest.mark.parametrize("name_behavior", ("raise", "huge"))
def test_nested_json_rejection_never_reads_hostile_dynamic_type_name(name_behavior):
    metadata_reads: list[str] = []

    class HostileNameMeta(type):
        def __getattribute__(cls, name):
            if name == "__name__":
                metadata_reads.append(name)
                if name_behavior == "raise" and len(metadata_reads) == 1:
                    raise AssertionError("hostile metaclass name was read")
                if name_behavior == "huge":
                    return "x" * (2 * NATIVE_CHILD_MAX_RESPONSE_BYTES)
                return "HostileValue"
            return type.__getattribute__(cls, name)

    class HostileValue(metaclass=HostileNameMeta):
        pass

    with pytest.raises(native_process._ChildTransportError) as raised:
        native_process._bounded_json_bytes(
            {"nested": HostileValue()},
            maximum_bytes=1024,
            overflow_message="too large",
        )

    assert str(raised.value) == (
        "native child transport requires exact built-in JSON values"
    )
    assert metadata_reads == []
    assert len(str(raised.value).encode("utf-8")) <= NATIVE_CHILD_MAX_ERROR_BYTES


@pytest.mark.parametrize("text_behavior", ("raise", "huge"))
def test_exception_diagnostics_never_read_hostile_dynamic_metadata_or_text(
    text_behavior,
):
    metadata_reads: list[str] = []
    hash_reads: list[str] = []
    text_reads: list[str] = []

    class HostileExceptionMeta(type):
        def __getattribute__(cls, name):
            if name == "__name__":
                metadata_reads.append(name)
                if len(metadata_reads) == 1:
                    raise AssertionError("hostile exception type name was read")
                return "HostileDiagnosticError"
            return type.__getattribute__(cls, name)

        def __hash__(cls):
            hash_reads.append("hash")
            raise AssertionError("hostile exception type hash was read")

    class HostileDiagnosticError(Exception, metaclass=HostileExceptionMeta):
        def __str__(self):
            text_reads.append("str")
            if text_behavior == "raise" and len(text_reads) == 1:
                raise AssertionError("hostile exception text was read")
            if text_behavior == "huge":
                return "x" * (2 * NATIVE_CHILD_MAX_RESPONSE_BYTES)
            return "HostileDiagnosticError"

    error = HostileDiagnosticError()
    summary = native_process._exception_summary(error)
    envelope = native_process._error_envelope(error)

    assert summary == "external exception"
    assert envelope["exceptionType"] == "external exception"
    assert envelope["message"] == "external exception"
    assert metadata_reads == []
    assert hash_reads == []
    assert text_reads == []
    assert len(summary.encode("utf-8")) <= NATIVE_CHILD_MAX_ERROR_BYTES


class _RaisingMapping(Mapping):
    def __getitem__(self, _key):
        raise AssertionError("hostile mapping was indexed")

    def __iter__(self):
        raise AssertionError("hostile mapping was iterated")

    def __len__(self):
        raise AssertionError("hostile mapping length was read")


class _InfiniteMapping(Mapping):
    def __getitem__(self, key):
        return key

    def __iter__(self):
        index = 0
        while True:
            yield f"key-{index}"
            index += 1

    def __len__(self):
        return 2**63 - 1


class _RaisingDict(dict):
    def __iter__(self):
        raise AssertionError("hostile dict subclass was iterated")

    def items(self):
        raise AssertionError("hostile dict subclass items were read")

    def keys(self):
        raise AssertionError("hostile dict subclass keys were read")


@pytest.mark.parametrize("hostile_mapping", (_RaisingMapping(), _InfiniteMapping()))
def test_request_rejects_hostile_mapping_without_inspection(hostile_mapping):
    with pytest.raises(AdapterError) as raised:
        run_native_engine_child(
            _entrypoint("_echo_with_budget"),
            hostile_mapping,
            deadline=_deadline(3.0),
        )

    assert raised.value.code == "REFINE_ENGINE_FAILED"
    assert "exact built-in JSON object" in str(raised.value)


def test_nested_json_rejects_hostile_dict_subclass_without_inspection():
    with pytest.raises(native_process._ChildTransportError) as raised:
        native_process._bounded_json_bytes(
            {"nested": _RaisingDict()},
            maximum_bytes=1024,
            overflow_message="too large",
        )

    assert str(raised.value) == (
        "native child transport requires exact built-in JSON values"
    )


def test_tiny_json_cap_rejects_builtin_mapping_before_sort(monkeypatch):
    monkeypatch.setattr(
        native_process,
        "_sort_bounded_json_keys",
        lambda _value: pytest.fail("mapping keys sorted before cap validation"),
    )

    with pytest.raises(native_process._ChildTransportError, match="too large"):
        native_process._bounded_json_bytes(
            {"a": 0, "b": 0},
            maximum_bytes=8,
            overflow_message="too large",
        )


def test_oversized_request_is_rejected_before_process_setup(monkeypatch):
    def unexpected_context(_method):
        pytest.fail("process setup ran before request encoding was bounded")

    monkeypatch.setattr(
        native_process.multiprocessing,
        "get_context",
        unexpected_context,
    )

    with pytest.raises(AdapterError) as raised:
        run_native_engine_child(
            _entrypoint("_echo_with_budget"),
            {"oversized": "x" * NATIVE_CHILD_MAX_REQUEST_BYTES},
            deadline=_deadline(3.0),
        )

    assert raised.value.code == "REFINE_ENGINE_FAILED"
    assert "request exceeds the bounded transport" in str(raised.value)


@pytest.mark.skipif(os.name != "posix", reason="Refine requires POSIX process groups")
def test_timeout_cleanup_uncertainty_has_distinct_stable_code(monkeypatch):
    real_cleanup = native_process._terminate_and_reap

    def cleanup_with_reported_failure(process, *, group_leader_pid):
        return (
            *real_cleanup(process, group_leader_pid=group_leader_pid),
            "synthetic timeout cleanup uncertainty",
        )

    monkeypatch.setattr(
        native_process,
        "_terminate_and_reap",
        cleanup_with_reported_failure,
    )

    with pytest.raises(AdapterError) as raised:
        run_native_engine_child(
            _entrypoint("_sleep_past_deadline"),
            {},
            deadline=_deadline(0.20),
        )

    assert raised.value.code == "REFINE_ENGINE_CLEANUP_FAILED"
    assert "exceeded the shared deadline" in str(raised.value)
    assert "synthetic timeout cleanup uncertainty" in str(raised.value)


@pytest.mark.skipif(os.name != "posix", reason="Refine requires POSIX process groups")
def test_cleanup_exception_has_distinct_stable_code(monkeypatch):
    real_cleanup = native_process._terminate_and_reap

    def cleanup_then_raise(process, *, group_leader_pid):
        errors = real_cleanup(process, group_leader_pid=group_leader_pid)
        assert errors == ()
        raise RuntimeError("synthetic cleanup implementation crash")

    monkeypatch.setattr(
        native_process,
        "_terminate_and_reap",
        cleanup_then_raise,
    )

    with pytest.raises(AdapterError) as raised:
        run_native_engine_child(
            _entrypoint("_sleep_past_deadline"),
            {},
            deadline=_deadline(0.20),
        )

    assert raised.value.code == "REFINE_ENGINE_CLEANUP_FAILED"
    assert "cleanup raised RuntimeError" in str(raised.value)
    assert "synthetic cleanup implementation crash" in str(raised.value)


@pytest.mark.skipif(os.name != "posix", reason="Refine requires POSIX process groups")
@pytest.mark.parametrize("failure_mode", ("returned", "raised"))
def test_huge_cleanup_diagnostics_and_final_report_are_strictly_bounded(
    monkeypatch,
    failure_mode,
):
    real_cleanup = native_process._terminate_and_reap
    huge_detail = "synthetic huge cleanup uncertainty " + (
        "x" * (2 * NATIVE_CHILD_MAX_RESPONSE_BYTES)
    )

    def huge_cleanup(process, *, group_leader_pid):
        errors = real_cleanup(process, group_leader_pid=group_leader_pid)
        assert errors == ()
        if failure_mode == "raised":
            raise RuntimeError(huge_detail)
        return (huge_detail,)

    monkeypatch.setattr(native_process, "_terminate_and_reap", huge_cleanup)

    with pytest.raises(AdapterError) as raised:
        run_native_engine_child(
            _entrypoint("_sleep_past_deadline"),
            {},
            deadline=_deadline(0.20),
        )

    assert raised.value.code == "REFINE_ENGINE_CLEANUP_FAILED"
    message = str(raised.value)
    assert "synthetic huge cleanup uncertainty" in message
    assert len(message.encode("utf-8")) <= NATIVE_CHILD_MAX_ERROR_BYTES


@pytest.mark.skipif(os.name != "posix", reason="Refine requires POSIX process groups")
def test_cleanup_crash_still_emergency_kills_group_and_prevents_late_write(
    monkeypatch,
    tmp_path,
):
    leader_pid_path = tmp_path / "leader.pid"
    descendant_pid_path = tmp_path / "descendant.pid"
    late_artifact = tmp_path / "published-after-cleanup-crash.json"
    activity_log = tmp_path / "cleanup-crash-native.log"
    leader_pid = None
    descendant_pid = None
    gone_before_manual_cleanup = False

    def cleanup_crash(_process, *, group_leader_pid):
        assert isinstance(group_leader_pid, int)
        raise RuntimeError("synthetic primary cleanup crash before signalling")

    monkeypatch.setattr(native_process, "_terminate_and_reap", cleanup_crash)

    try:
        with pytest.raises(AdapterError) as raised:
            run_native_engine_child(
                _entrypoint("_spawn_late_writer"),
                {
                    "leaderPid": str(leader_pid_path),
                    "descendantPid": str(descendant_pid_path),
                    "lateArtifact": str(late_artifact),
                    "activityLog": str(activity_log),
                },
                deadline=_deadline(0.30),
            )

        assert raised.value.code == "REFINE_ENGINE_CLEANUP_FAILED"
        assert "synthetic primary cleanup crash before signalling" in str(raised.value)
        assert leader_pid_path.is_file()
        assert descendant_pid_path.is_file()
        leader_pid = int(leader_pid_path.read_text(encoding="utf-8"))
        descendant_pid = int(descendant_pid_path.read_text(encoding="utf-8"))

        stop = time.monotonic() + 1.0
        while time.monotonic() < stop and not (
            _pid_is_gone(leader_pid) and _pid_is_gone(descendant_pid)
        ):
            time.sleep(0.01)
        gone_before_manual_cleanup = _pid_is_gone(leader_pid) and _pid_is_gone(
            descendant_pid
        )
    finally:
        if leader_pid is not None and not _pid_is_gone(leader_pid):
            try:
                os.killpg(leader_pid, signal.SIGKILL)
            except ProcessLookupError:
                pass
        if descendant_pid is not None and not _pid_is_gone(descendant_pid):
            try:
                os.kill(descendant_pid, signal.SIGKILL)
            except ProcessLookupError:
                pass

    assert gone_before_manual_cleanup
    time.sleep(0.80)
    assert activity_log.read_text(encoding="utf-8") == "leader-ready\n"
    assert not late_artifact.exists()


@pytest.mark.skipif(os.name != "posix", reason="Refine requires POSIX process groups")
def test_false_clean_primary_cleanup_is_verified_before_return_and_kills_group(
    monkeypatch,
    tmp_path,
):
    leader_pid_path = tmp_path / "false-clean-leader.pid"
    descendant_pid_path = tmp_path / "false-clean-descendant.pid"
    late_artifact = tmp_path / "published-after-false-clean.json"
    activity_log = tmp_path / "false-clean-native.log"
    verification_reports: list[tuple[str, ...]] = []
    emergency_calls: list[int | None] = []
    failure = None
    leader_pid = None
    descendant_pid = None
    gone_at_return = False

    def false_clean(_process, *, group_leader_pid):
        assert isinstance(group_leader_pid, int)
        return ()

    monkeypatch.setattr(native_process, "_terminate_and_reap", false_clean)
    real_emergency = native_process._emergency_kill_and_reap

    def record_emergency(process, *, group_leader_pid):
        emergency_calls.append(group_leader_pid)
        return real_emergency(process, group_leader_pid=group_leader_pid)

    monkeypatch.setattr(
        native_process,
        "_emergency_kill_and_reap",
        record_emergency,
    )
    real_verify = getattr(native_process, "_verify_cleanup_complete", None)
    if real_verify is not None:

        def record_verification(process, *, group_leader_pid):
            report = real_verify(
                process,
                group_leader_pid=group_leader_pid,
            )
            verification_reports.append(report)
            return report

        monkeypatch.setattr(
            native_process,
            "_verify_cleanup_complete",
            record_verification,
        )

    try:
        try:
            run_native_engine_child(
                _entrypoint("_spawn_late_writer"),
                {
                    "leaderPid": str(leader_pid_path),
                    "descendantPid": str(descendant_pid_path),
                    "lateArtifact": str(late_artifact),
                    "activityLog": str(activity_log),
                },
                deadline=_deadline(0.30),
            )
        except AdapterError as exc:
            failure = exc

        if leader_pid_path.is_file() and descendant_pid_path.is_file():
            leader_pid = int(leader_pid_path.read_text(encoding="utf-8"))
            descendant_pid = int(descendant_pid_path.read_text(encoding="utf-8"))
            gone_at_return = _pid_is_gone(leader_pid) and _pid_is_gone(descendant_pid)
    finally:
        if leader_pid is not None and not _pid_is_gone(leader_pid):
            try:
                os.killpg(leader_pid, signal.SIGKILL)
            except ProcessLookupError:
                pass
        if descendant_pid is not None and not _pid_is_gone(descendant_pid):
            try:
                os.kill(descendant_pid, signal.SIGKILL)
            except ProcessLookupError:
                pass

    assert failure is not None
    assert failure.code == "REFINE_ENGINE_CLEANUP_FAILED"
    assert "remains alive after cleanup verification" in str(failure)
    assert len(str(failure).encode("utf-8")) <= NATIVE_CHILD_MAX_ERROR_BYTES
    assert emergency_calls == [leader_pid]
    assert verification_reports == [()]
    assert gone_at_return
    time.sleep(0.80)
    assert activity_log.read_text(encoding="utf-8") == "leader-ready\n"
    assert not late_artifact.exists()


@pytest.mark.skipif(os.name != "posix", reason="Refine requires POSIX process groups")
def test_false_clean_primary_cleanup_with_verification_exception_is_fatal(
    monkeypatch,
):
    verify_calls: list[int | None] = []
    emergency_calls: list[int | None] = []
    real_emergency = native_process._emergency_kill_and_reap

    def false_clean(_process, *, group_leader_pid):
        assert isinstance(group_leader_pid, int)
        return ()

    def verification_raises(_process, *, group_leader_pid):
        verify_calls.append(group_leader_pid)
        raise RuntimeError("synthetic cleanup verification crash")

    def record_emergency(process, *, group_leader_pid):
        emergency_calls.append(group_leader_pid)
        return real_emergency(process, group_leader_pid=group_leader_pid)

    monkeypatch.setattr(native_process, "_terminate_and_reap", false_clean)
    monkeypatch.setattr(
        native_process,
        "_verify_cleanup_complete",
        verification_raises,
    )
    monkeypatch.setattr(
        native_process,
        "_emergency_kill_and_reap",
        record_emergency,
    )

    with pytest.raises(AdapterError) as raised:
        run_native_engine_child(
            _entrypoint("_sleep_past_deadline"),
            {},
            deadline=_deadline(0.20),
        )

    assert raised.value.code == "REFINE_ENGINE_CLEANUP_FAILED"
    assert "verification raised RuntimeError" in str(raised.value)
    assert "synthetic cleanup verification crash" in str(raised.value)
    assert len(str(raised.value).encode("utf-8")) <= NATIVE_CHILD_MAX_ERROR_BYTES
    assert verify_calls == [None]
    assert len(emergency_calls) == 1
    assert isinstance(emergency_calls[0], int)


def test_group_cleanup_never_addresses_pgid_after_leader_reap(monkeypatch):
    events: list[tuple[str, object]] = []

    class ReapedProcess:
        sentinel = 101

        def __init__(self):
            self.reaped = False

        def join(self, _timeout=None):
            events.append(("join", self.reaped))
            self.reaped = True

        def is_alive(self):
            return False

        def kill(self):
            events.append(("direct-kill", self.reaped))

    process = ReapedProcess()

    def record_group_signal(_group_leader_pid, sent_signal):
        events.append(("group", (sent_signal, process.reaped)))

    monkeypatch.setattr(native_process.os, "killpg", record_group_signal)

    assert (
        native_process._terminate_and_reap(
            process,
            group_leader_pid=424242,
        )
        == ()
    )
    group_events = [value for kind, value in events if kind == "group"]
    assert group_events == [
        (signal.SIGTERM, False),
        (signal.SIGKILL, False),
    ]
    assert process.reaped is True

    events.clear()
    verify_calls = 0

    def primary_already_reaped(candidate, *, group_leader_pid):
        assert group_leader_pid == 424242
        candidate.join(0)
        return ()

    def verification_uncertain(_candidate, *, group_leader_pid):
        nonlocal verify_calls
        verify_calls += 1
        assert group_leader_pid is None
        if verify_calls == 1:
            return ("synthetic post-reap verification uncertainty",)
        return ()

    monkeypatch.setattr(
        native_process,
        "_terminate_and_reap",
        primary_already_reaped,
    )
    monkeypatch.setattr(
        native_process,
        "_leader_exit_observed_without_reap",
        lambda _candidate: (True, ()),
    )
    monkeypatch.setattr(
        native_process,
        "_verify_cleanup_complete",
        verification_uncertain,
    )

    errors = native_process._cleanup_process(
        process,
        group_leader_pid=424242,
    )

    assert errors == ("synthetic post-reap verification uncertainty",)
    assert [event for event in events if event[0] == "group"] == []
    assert ("direct-kill", True) in events


@pytest.mark.skipif(os.name != "posix", reason="Refine requires POSIX process groups")
def test_success_result_with_surviving_descendant_is_rejected_and_group_is_killed(
    tmp_path,
):
    descendant_pid_path = tmp_path / "success-descendant.pid"
    late_artifact = tmp_path / "published-after-success.json"
    descendant_pid = None
    gone_before_manual_cleanup = False

    try:
        with pytest.raises(AdapterError) as raised:
            run_native_engine_child(
                _entrypoint("_spawn_survivor_and_return"),
                {
                    "descendantPid": str(descendant_pid_path),
                    "lateArtifact": str(late_artifact),
                },
                deadline=_deadline(3.0),
            )

        assert raised.value.code == "REFINE_ENGINE_CLEANUP_FAILED"
        assert "process group was quiescent" in str(raised.value)
        assert descendant_pid_path.is_file()
        descendant_pid = int(descendant_pid_path.read_text(encoding="utf-8"))
        stop = time.monotonic() + 2.0
        while time.monotonic() < stop and not _pid_is_gone(descendant_pid):
            time.sleep(0.01)
        gone_before_manual_cleanup = _pid_is_gone(descendant_pid)
    finally:
        if descendant_pid is not None and not _pid_is_gone(descendant_pid):
            try:
                os.kill(descendant_pid, signal.SIGKILL)
            except ProcessLookupError:
                pass

    assert gone_before_manual_cleanup
    time.sleep(0.80)
    assert not late_artifact.exists()


@pytest.mark.skipif(os.name != "posix", reason="Refine requires POSIX process groups")
def test_timeout_kills_group_reaps_leader_and_prevents_late_publication(tmp_path):
    leader_pid_path = tmp_path / "leader.pid"
    descendant_pid_path = tmp_path / "descendant.pid"
    late_artifact = tmp_path / "published-after-timeout.json"
    activity_log = tmp_path / "native.log"
    accepted_artifact = tmp_path / "accepted.json"

    started = time.monotonic()
    with pytest.raises(AdapterError) as raised:
        result = run_native_engine_child(
            _entrypoint("_spawn_late_writer"),
            {
                "leaderPid": str(leader_pid_path),
                "descendantPid": str(descendant_pid_path),
                "lateArtifact": str(late_artifact),
                "activityLog": str(activity_log),
            },
            deadline=_deadline(0.30),
        )
        accepted_artifact.write_text(json.dumps(result), encoding="utf-8")

    assert raised.value.code == "REFINE_ENGINE_TIMEOUT", str(raised.value)
    assert time.monotonic() - started < 2.0
    assert leader_pid_path.is_file()
    assert descendant_pid_path.is_file()
    leader_pid = int(leader_pid_path.read_text(encoding="utf-8"))
    descendant_pid = int(descendant_pid_path.read_text(encoding="utf-8"))

    stop = time.monotonic() + 2.0
    while time.monotonic() < stop and not (
        _pid_is_gone(leader_pid) and _pid_is_gone(descendant_pid)
    ):
        time.sleep(0.01)

    assert _pid_is_gone(leader_pid)
    assert _pid_is_gone(descendant_pid)
    time.sleep(0.80)
    assert activity_log.read_text(encoding="utf-8") == "leader-ready\n"
    assert not late_artifact.exists()
    assert not accepted_artifact.exists()
