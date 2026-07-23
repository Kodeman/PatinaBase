"""Hard-deadline process boundary for future native Refine engine calls."""

from __future__ import annotations

import json
import os
import subprocess
import sys
import time
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
    NATIVE_CHILD_MAX_REQUEST_BYTES,
    NATIVE_CHILD_MAX_RESPONSE_BYTES,
    NativeChildContext,
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
            "exceeds the bounded transport",
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

    assert raised.value.code == "REFINE_ENGINE_TIMEOUT"
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
