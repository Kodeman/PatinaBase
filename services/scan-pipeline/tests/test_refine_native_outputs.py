"""The seven-descriptor child-to-parent engine output handoff.

Every test here exists to pin one property of the reviewed contract: the parent
names the closed output universe, the child may only fill those names, and the
parent's own descriptor and its own digest are what survive.  Nothing the child
declares is authoritative.
"""

from __future__ import annotations

import hashlib
import os
import stat
import threading
import time
from pathlib import Path

import patina_scan_worker.refine_native_process as native_process
import pytest
from patina_scan_worker.refine_adapter import (
    LEASE_COMPLETION_RESERVE_S,
    AdapterError,
    RefineDeadline,
)
from patina_scan_worker.refine_native_process import (
    NATIVE_CHILD_MAX_OUTPUT_FILE_BYTES,
    NATIVE_CHILD_MAX_OUTPUT_FILES,
    NATIVE_CHILD_MAX_OUTPUT_TOTAL_BYTES,
    NATIVE_ENGINE_OUTPUT_ALIGNMENT_VERIFIED_BY_PARENT,
    NATIVE_ENGINE_OUTPUT_TOKENS,
    NATIVE_ENGINE_PERSISTENT_OUTPUT_TOKENS,
    NATIVE_ENGINE_SCRATCH_OUTPUT_TOKENS,
    NATIVE_WORKSPACE_COMMAND_SUBDIRECTORY,
    NATIVE_WORKSPACE_MAX_ARGV_PATH_TAIL_BYTES,
    NativeChildContext,
    NativeEngineOutputs,
    native_engine_entrypoint,
    provision_native_workspace_lease,
    run_native_engine_child,
)

pytestmark = pytest.mark.skipif(
    os.name != "posix", reason="Refine requires SCM_RIGHTS and POSIX sessions"
)


def _entrypoint(name: str) -> str:
    return f"{__name__}:{name}"


def _deadline(seconds: float) -> RefineDeadline:
    now = time.monotonic()
    return RefineDeadline.start(
        now_monotonic_s=now,
        lease_expires_at_monotonic_s=(now + LEASE_COMPLETION_RESERVE_S + seconds),
    )


def _payload(token: str) -> bytes:
    return f"payload-for-{token}\n".encode("utf-8")


def _sha256(payload: bytes) -> str:
    return hashlib.sha256(payload).hexdigest()


# ---------------------------------------------------------------------------
# Spawn-safe entry points
# ---------------------------------------------------------------------------


def _open_leased_work_directory(context: NativeChildContext) -> int:
    return os.open(
        NATIVE_WORKSPACE_COMMAND_SUBDIRECTORY,
        os.O_RDONLY | os.O_DIRECTORY | getattr(os, "O_NOFOLLOW", 0),
        dir_fd=context.workspace_descriptor(),
    )


@native_engine_entrypoint
def _write_engine_outputs(request, context: NativeChildContext):
    """Write exactly the requested ``work/<name>`` files and nothing else."""

    work = _open_leased_work_directory(context)
    try:
        for name in sorted(request["outputs"]):
            payload = bytes.fromhex(request["outputs"][name])
            descriptor = os.open(
                name,
                os.O_WRONLY | os.O_CREAT | os.O_EXCL,
                0o600,
                dir_fd=work,
            )
            with os.fdopen(descriptor, "wb") as handle:
                handle.write(payload)
    finally:
        os.close(work)
    return {"wrote": sorted(request["outputs"])}


@native_engine_entrypoint
def _write_outputs_then_hardlink(request, context: NativeChildContext):
    """Write one file and expose it under a second canonical name."""

    work = _open_leased_work_directory(context)
    try:
        first, second = request["first"], request["second"]
        payload = bytes.fromhex(request["payload"])
        descriptor = os.open(
            first,
            os.O_WRONLY | os.O_CREAT | os.O_EXCL,
            0o600,
            dir_fd=work,
        )
        with os.fdopen(descriptor, "wb") as handle:
            handle.write(payload)
        os.link(first, second, src_dir_fd=work, dst_dir_fd=work)
    finally:
        os.close(work)
    return {"linked": True}


@native_engine_entrypoint
def _write_outputs_then_raise(request, context: NativeChildContext):
    _write_engine_outputs(request, context)
    raise RuntimeError("engine failed after writing its outputs")


@native_engine_entrypoint
def _write_nothing(_request, _context: NativeChildContext):
    return {"wrote": []}


@native_engine_entrypoint
def _report_output_visibility(_request, _context: NativeChildContext):
    return {"ok": True}


# ---------------------------------------------------------------------------
# The closed universe
# ---------------------------------------------------------------------------


def test_the_output_universe_is_exactly_seven_reviewed_tokens():
    assert len(NATIVE_ENGINE_PERSISTENT_OUTPUT_TOKENS) == 6
    assert len(NATIVE_ENGINE_SCRATCH_OUTPUT_TOKENS) == 1
    assert NATIVE_ENGINE_OUTPUT_TOKENS == tuple(sorted(NATIVE_ENGINE_OUTPUT_TOKENS))
    assert len(NATIVE_ENGINE_OUTPUT_TOKENS) == 7
    assert NATIVE_CHILD_MAX_OUTPUT_FILES == 7
    assert set(NATIVE_ENGINE_OUTPUT_TOKENS) == set(
        NATIVE_ENGINE_PERSISTENT_OUTPUT_TOKENS
    ) | set(NATIVE_ENGINE_SCRATCH_OUTPUT_TOKENS)


def test_the_persistent_tokens_are_the_runner_engine_artifact_set():
    """The six published names have one meaning across the two modules.

    Drift here would let the boundary transport a name the runner refuses, or
    make the runner require a name that can never arrive.
    """

    from patina_scan_worker.refine_runner import _REQUIRED_ENGINE_ARTIFACT_NAMES

    assert set(NATIVE_ENGINE_PERSISTENT_OUTPUT_TOKENS) == set(
        _REQUIRED_ENGINE_ARTIFACT_NAMES
    )


def test_the_scratch_snapshot_is_the_evidence_builder_raw_pre_ba_name():
    """The seventh descriptor is the pre-BA snapshot the evidence builder wants."""

    from patina_scan_worker.refine_evidence_builder import (
        _REQUIRED_SNAPSHOT_ARTIFACTS,
    )

    assert NATIVE_ENGINE_SCRATCH_OUTPUT_TOKENS == (
        "raw-triangulated-model-snapshot-v1.tar",
    )
    assert NATIVE_ENGINE_SCRATCH_OUTPUT_TOKENS[0] in _REQUIRED_SNAPSHOT_ARTIFACTS


def test_every_output_token_fits_the_reserved_argv_tail_budget():
    """All seven are engine command outputs, so all seven ride the argv budget."""

    for token in NATIVE_ENGINE_OUTPUT_TOKENS:
        tail = f"/{NATIVE_WORKSPACE_COMMAND_SUBDIRECTORY}/{token}"
        assert len(os.fsencode(tail)) <= NATIVE_WORKSPACE_MAX_ARGV_PATH_TAIL_BYTES


def test_parent_side_alignment_verification_is_not_claimed():
    """Item 5 transports the aligned model; it does not vouch for it."""

    assert NATIVE_ENGINE_OUTPUT_ALIGNMENT_VERIFIED_BY_PARENT is False


# ---------------------------------------------------------------------------
# The request contract
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "tokens",
    (
        (),
        ["not-a-reviewed-token"],
        ("adapter-v2.json", "adapter-v2.json"),
        ("pairs-v2.txt", "adapter-v2.json"),
        (*NATIVE_ENGINE_OUTPUT_TOKENS, "adapter-v2.json"),
        ("adapter-v2.json", 7),
        "adapter-v2.json",
        {"adapter-v2.json"},
    ),
)
def test_output_sinks_refuse_a_noncanonical_request(tokens):
    with pytest.raises(AdapterError):
        NativeEngineOutputs(tokens)


def test_an_output_sink_exposes_its_canonical_tokens():
    sink = NativeEngineOutputs(NATIVE_ENGINE_OUTPUT_TOKENS)
    assert sink.tokens == NATIVE_ENGINE_OUTPUT_TOKENS
    assert sink.is_populated is False
    assert sink.is_closed is False
    assert dict(sink.received) == {}
    assert sink.close() == ()
    assert sink.is_closed is True


def test_a_closed_sink_refuses_to_hand_out_anything():
    sink = NativeEngineOutputs(("adapter-v2.json",))
    sink.close()
    with pytest.raises(AdapterError):
        sink.received
    with pytest.raises(AdapterError):
        sink.descriptor("adapter-v2.json")


def test_a_sink_cannot_be_populated_twice():
    sink = NativeEngineOutputs(("adapter-v2.json",))
    output = native_process.NativeEngineOutput(
        token="adapter-v2.json",
        descriptor=-1,
        sha256="0" * 64,
        size_bytes=1,
        identity=(1, 2),
    )
    sink._adopt((output,))
    with pytest.raises(AdapterError):
        sink._adopt((output,))


def test_a_sink_refuses_outputs_that_are_not_its_own_tokens():
    sink = NativeEngineOutputs(("adapter-v2.json",))
    with pytest.raises(AdapterError):
        sink._adopt(
            (
                native_process.NativeEngineOutput(
                    token="pairs-v2.txt",
                    descriptor=-1,
                    sha256="0" * 64,
                    size_bytes=1,
                    identity=(1, 2),
                ),
            )
        )


def test_close_is_idempotent_and_reports_a_failing_descriptor(tmp_path):
    source = tmp_path / "already-closed"
    source.write_bytes(b"x")
    descriptor = os.open(source, os.O_RDONLY)
    sink = NativeEngineOutputs(("adapter-v2.json",))
    sink._adopt(
        (
            native_process.NativeEngineOutput(
                token="adapter-v2.json",
                descriptor=descriptor,
                sha256="0" * 64,
                size_bytes=1,
                identity=(1, 2),
            ),
        )
    )
    os.close(descriptor)

    errors = sink.close()

    assert len(errors) == 1
    assert "adapter-v2.json" in errors[0]
    assert sink.close() == ()


def test_the_context_manager_raises_a_cleanup_failure_when_idle(tmp_path):
    source = tmp_path / "already-closed"
    source.write_bytes(b"x")
    descriptor = os.open(source, os.O_RDONLY)

    with pytest.raises(AdapterError) as raised:
        with NativeEngineOutputs(("adapter-v2.json",)) as sink:
            sink._adopt(
                (
                    native_process.NativeEngineOutput(
                        token="adapter-v2.json",
                        descriptor=descriptor,
                        sha256="0" * 64,
                        size_bytes=1,
                        identity=(1, 2),
                    ),
                )
            )
            os.close(descriptor)

    assert raised.value.code == "REFINE_ENGINE_CLEANUP_FAILED"


# ---------------------------------------------------------------------------
# The declared ledger
# ---------------------------------------------------------------------------


def _ledger(tokens, *, size=8, digest="a" * 64):
    return [[token, digest, size] for token in tokens]


def test_a_canonical_ledger_is_accepted():
    tokens = ("adapter-v2.json", "pairs-v2.txt")
    rows = native_process._validated_output_ledger(_ledger(tokens), tokens)
    assert rows == (("adapter-v2.json", "a" * 64, 8), ("pairs-v2.txt", "a" * 64, 8))


@pytest.mark.parametrize(
    "ledger",
    (
        None,
        (),
        [["adapter-v2.json", "a" * 64, 8]],
        [["adapter-v2.json", "a" * 64, 8], ["adapter-v2.json", "a" * 64, 8]],
        [["pairs-v2.txt", "a" * 64, 8], ["adapter-v2.json", "a" * 64, 8]],
        [["adapter-v2.json", "a" * 64, 8], ("pairs-v2.txt", "a" * 64, 8)],
        [["adapter-v2.json", "a" * 64], ["pairs-v2.txt", "a" * 64, 8]],
        [["adapter-v2.json", "A" * 64, 8], ["pairs-v2.txt", "a" * 64, 8]],
        [["adapter-v2.json", "a" * 63, 8], ["pairs-v2.txt", "a" * 64, 8]],
        [["adapter-v2.json", "a" * 64, 0], ["pairs-v2.txt", "a" * 64, 8]],
        [["adapter-v2.json", "a" * 64, -1], ["pairs-v2.txt", "a" * 64, 8]],
        [["adapter-v2.json", "a" * 64, True], ["pairs-v2.txt", "a" * 64, 8]],
        [
            ["adapter-v2.json", "a" * 64, NATIVE_CHILD_MAX_OUTPUT_FILE_BYTES + 1],
            ["pairs-v2.txt", "a" * 64, 8],
        ],
    ),
)
def test_a_noncanonical_ledger_is_refused(ledger):
    with pytest.raises(AdapterError):
        native_process._validated_output_ledger(
            ledger, ("adapter-v2.json", "pairs-v2.txt")
        )


def test_a_ledger_that_exceeds_the_aggregate_budget_is_refused():
    tokens = NATIVE_ENGINE_OUTPUT_TOKENS
    per_file = NATIVE_CHILD_MAX_OUTPUT_FILE_BYTES
    assert per_file * len(tokens) > NATIVE_CHILD_MAX_OUTPUT_TOTAL_BYTES
    with pytest.raises(AdapterError) as raised:
        native_process._validated_output_ledger(
            _ledger(tokens, size=per_file), tokens
        )
    assert "aggregate byte limit" in str(raised.value)


# ---------------------------------------------------------------------------
# The parent's independent verification
# ---------------------------------------------------------------------------


class _LeasedOutputs:
    """A real lease with real ``work/`` files and a real SCM_RIGHTS sender."""

    def __init__(self, tmp_path: Path) -> None:
        container = tmp_path / "scratch"
        container.mkdir(mode=0o700)
        self.lease = provision_native_workspace_lease(
            str(container), deadline=_deadline(60.0)
        )
        self.work = Path(self.lease.path) / NATIVE_WORKSPACE_COMMAND_SUBDIRECTORY

    def write(self, token: str, payload: bytes) -> Path:
        target = self.work / token
        target.write_bytes(payload)
        return target

    def release(self) -> None:
        native_process._release_workspace_lease(self.lease, leader_quiescent=True)


def _receive_with_sent_descriptors(leased, ledger, descriptors):
    """Drive ``_receive_native_outputs`` against descriptors sent from a thread."""

    from multiprocessing.connection import Pipe
    from multiprocessing.reduction import send_handle

    parent_connection, child_connection = Pipe(duplex=True)
    failures: list[BaseException] = []

    def sender() -> None:
        try:
            for descriptor in descriptors:
                send_handle(child_connection, descriptor, os.getpid())
        except BaseException as exc:  # noqa: BLE001 - surfaced by the assertion
            failures.append(exc)

    thread = threading.Thread(target=sender)
    thread.start()
    try:
        return native_process._receive_native_outputs(
            parent_connection,
            ledger,
            workspace_lease=leased.lease,
            deadline=_deadline(60.0),
        )
    finally:
        thread.join(timeout=30.0)
        parent_connection.close()
        child_connection.close()
        assert not failures


@pytest.fixture()
def leased(tmp_path):
    fixture = _LeasedOutputs(tmp_path)
    try:
        yield fixture
    finally:
        fixture.release()


def test_the_parent_keeps_its_own_descriptor_not_the_transported_one(leased):
    payload = _payload("adapter-v2.json")
    target = leased.write("adapter-v2.json", payload)
    sent = os.open(target, os.O_RDONLY)
    try:
        received = _receive_with_sent_descriptors(
            leased,
            (("adapter-v2.json", _sha256(payload), len(payload)),),
            (sent,),
        )
    finally:
        os.close(sent)

    assert len(received) == 1
    output = received[0]
    try:
        assert output.token == "adapter-v2.json"
        assert output.sha256 == _sha256(payload)
        assert output.size_bytes == len(payload)
        # A different open file description on the same inode.
        assert output.descriptor != sent
        assert os.fstat(output.descriptor).st_ino == output.identity[1]
        assert os.pread(output.descriptor, len(payload), 0) == payload
    finally:
        os.close(output.descriptor)


def test_a_declared_digest_the_parent_cannot_reproduce_fails_the_run(leased):
    payload = _payload("adapter-v2.json")
    target = leased.write("adapter-v2.json", payload)
    sent = os.open(target, os.O_RDONLY)
    try:
        with pytest.raises(AdapterError) as raised:
            _receive_with_sent_descriptors(
                leased,
                (("adapter-v2.json", "b" * 64, len(payload)),),
                (sent,),
            )
    finally:
        os.close(sent)

    assert "sha256 does not match its ledger" in str(raised.value)


def test_a_declared_size_that_disagrees_with_the_object_fails_the_run(leased):
    payload = _payload("adapter-v2.json")
    target = leased.write("adapter-v2.json", payload)
    sent = os.open(target, os.O_RDONLY)
    try:
        with pytest.raises(AdapterError) as raised:
            _receive_with_sent_descriptors(
                leased,
                (("adapter-v2.json", _sha256(payload), len(payload) + 1),),
                (sent,),
            )
    finally:
        os.close(sent)

    assert "size does not match its ledger" in str(raised.value)


def test_a_descriptor_for_a_file_outside_the_lease_is_refused(leased, tmp_path):
    payload = _payload("adapter-v2.json")
    leased.write("adapter-v2.json", payload)
    elsewhere = tmp_path / "outside.bin"
    elsewhere.write_bytes(payload)
    sent = os.open(elsewhere, os.O_RDONLY)
    try:
        with pytest.raises(AdapterError) as raised:
            _receive_with_sent_descriptors(
                leased,
                (("adapter-v2.json", _sha256(payload), len(payload)),),
                (sent,),
            )
    finally:
        os.close(sent)

    assert "is not the object the child transported" in str(raised.value)


def test_a_token_the_parent_cannot_open_in_its_lease_is_refused(leased, tmp_path):
    payload = _payload("adapter-v2.json")
    elsewhere = tmp_path / "outside.bin"
    elsewhere.write_bytes(payload)
    sent = os.open(elsewhere, os.O_RDONLY)
    try:
        with pytest.raises(AdapterError) as raised:
            _receive_with_sent_descriptors(
                leased,
                (("adapter-v2.json", _sha256(payload), len(payload)),),
                (sent,),
            )
    finally:
        os.close(sent)

    assert "not readable from the parent-owned lease" in str(raised.value)


def test_a_writable_transported_descriptor_is_refused(leased):
    payload = _payload("adapter-v2.json")
    target = leased.write("adapter-v2.json", payload)
    sent = os.open(target, os.O_RDWR)
    try:
        with pytest.raises(AdapterError) as raised:
            _receive_with_sent_descriptors(
                leased,
                (("adapter-v2.json", _sha256(payload), len(payload)),),
                (sent,),
            )
    finally:
        os.close(sent)

    assert "must be transported read-only" in str(raised.value)


def test_a_transported_directory_descriptor_is_refused(leased):
    payload = _payload("adapter-v2.json")
    leased.write("adapter-v2.json", payload)
    sent = os.open(leased.work, os.O_RDONLY)
    try:
        with pytest.raises(AdapterError) as raised:
            _receive_with_sent_descriptors(
                leased,
                (("adapter-v2.json", _sha256(payload), len(payload)),),
                (sent,),
            )
    finally:
        os.close(sent)

    assert "must be a regular file" in str(raised.value)


def test_two_tokens_may_not_name_the_same_inode(leased):
    payload = _payload("shared")
    first = leased.write("adapter-v2.json", payload)
    os.link(first, leased.work / "pairs-v2.txt")
    sent = [os.open(first, os.O_RDONLY), os.open(leased.work / "pairs-v2.txt", os.O_RDONLY)]
    try:
        with pytest.raises(AdapterError) as raised:
            _receive_with_sent_descriptors(
                leased,
                (
                    ("adapter-v2.json", _sha256(payload), len(payload)),
                    ("pairs-v2.txt", _sha256(payload), len(payload)),
                ),
                sent,
            )
    finally:
        for descriptor in sent:
            os.close(descriptor)

    assert "unique file identities" in str(raised.value)


def test_a_symlink_planted_at_a_canonical_name_is_refused(leased, tmp_path):
    payload = _payload("adapter-v2.json")
    real = tmp_path / "real.bin"
    real.write_bytes(payload)
    os.symlink(real, leased.work / "adapter-v2.json")
    sent = os.open(real, os.O_RDONLY)
    try:
        with pytest.raises(AdapterError) as raised:
            _receive_with_sent_descriptors(
                leased,
                (("adapter-v2.json", _sha256(payload), len(payload)),),
                (sent,),
            )
    finally:
        os.close(sent)

    assert "not readable from the parent-owned lease" in str(raised.value)


def test_a_failed_receipt_leaves_no_open_output_descriptor(leased):
    payload = _payload("adapter-v2.json")
    first = leased.write("adapter-v2.json", payload)
    second_payload = _payload("pairs-v2.txt")
    leased.write("pairs-v2.txt", second_payload)
    sent = [
        os.open(first, os.O_RDONLY),
        os.open(leased.work / "pairs-v2.txt", os.O_RDONLY),
    ]
    before = len(os.listdir("/proc/self/fd")) if os.path.isdir("/proc/self/fd") else None
    try:
        with pytest.raises(AdapterError):
            _receive_with_sent_descriptors(
                leased,
                (
                    ("adapter-v2.json", _sha256(payload), len(payload)),
                    ("pairs-v2.txt", "c" * 64, len(second_payload)),
                ),
                sent,
            )
    finally:
        for descriptor in sent:
            os.close(descriptor)
    if before is not None:
        assert len(os.listdir("/proc/self/fd")) <= before


# ---------------------------------------------------------------------------
# The whole boundary, with a real spawned child
# ---------------------------------------------------------------------------


def _run_with_outputs(tokens, payloads, tmp_path, *, entrypoint="_write_engine_outputs"):
    container = tmp_path / "boundary"
    container.mkdir(mode=0o700, exist_ok=True)
    sink = NativeEngineOutputs(tokens)
    value = run_native_engine_child(
        _entrypoint(entrypoint),
        {"outputs": {name: payload.hex() for name, payload in payloads.items()}},
        deadline=_deadline(30.0),
        workspace_parent_directory=str(container),
        outputs=sink,
    )
    return value, sink, container


def test_the_seven_descriptor_handoff_crosses_the_real_boundary(tmp_path):
    payloads = {token: _payload(token) for token in NATIVE_ENGINE_OUTPUT_TOKENS}

    value, sink, container = _run_with_outputs(
        NATIVE_ENGINE_OUTPUT_TOKENS, payloads, tmp_path
    )

    with sink:
        assert value["wrote"] == sorted(NATIVE_ENGINE_OUTPUT_TOKENS)
        assert sink.is_populated is True
        assert tuple(sink.received) == NATIVE_ENGINE_OUTPUT_TOKENS
        for token, payload in payloads.items():
            output = sink.received[token]
            assert output.sha256 == _sha256(payload)
            assert output.size_bytes == len(payload)
            assert os.pread(sink.descriptor(token), len(payload), 0) == payload
    assert sink.is_closed is True


def test_output_descriptors_outlive_the_purged_lease_and_have_no_path(tmp_path):
    token = "database-v1.db"
    payload = _payload(token)

    _value, sink, container = _run_with_outputs(
        (token,), {token: payload}, tmp_path
    )

    with sink:
        # The parent purged the whole lease tree before returning.
        assert os.listdir(container) == []
        metadata = os.fstat(sink.descriptor(token))
        assert stat.S_ISREG(metadata.st_mode)
        # Unlinked, so no name anywhere can be reopened to reach these bytes.
        assert metadata.st_nlink == 0
        assert os.pread(sink.descriptor(token), len(payload), 0) == payload


def test_a_subset_of_the_universe_is_a_legal_request(tmp_path):
    tokens = ("adapter-v2.json", "pairs-v2.txt")
    payloads = {token: _payload(token) for token in tokens}

    _value, sink, _container = _run_with_outputs(tokens, payloads, tmp_path)

    with sink:
        assert tuple(sink.received) == tokens


def test_a_missing_engine_output_fails_the_run_and_leaves_the_sink_empty(tmp_path):
    tokens = ("adapter-v2.json", "pairs-v2.txt")
    container = tmp_path / "boundary"
    container.mkdir(mode=0o700)
    sink = NativeEngineOutputs(tokens)

    with pytest.raises(AdapterError) as raised:
        run_native_engine_child(
            _entrypoint("_write_engine_outputs"),
            {"outputs": {"adapter-v2.json": _payload("adapter-v2.json").hex()}},
            deadline=_deadline(30.0),
            workspace_parent_directory=str(container),
            outputs=sink,
        )

    assert "pairs-v2.txt could not be opened" in str(raised.value)
    assert sink.is_populated is False
    assert sink.is_closed is True
    assert os.listdir(container) == []


def test_an_empty_engine_output_is_an_engine_failure(tmp_path):
    token = "pairs-v2.txt"
    container = tmp_path / "boundary"
    container.mkdir(mode=0o700)
    sink = NativeEngineOutputs((token,))

    with pytest.raises(AdapterError) as raised:
        run_native_engine_child(
            _entrypoint("_write_engine_outputs"),
            {"outputs": {token: ""}},
            deadline=_deadline(30.0),
            workspace_parent_directory=str(container),
            outputs=sink,
        )

    assert f"native engine output {token} is empty" in str(raised.value)
    assert sink.is_populated is False


def test_an_entrypoint_failure_sends_no_descriptors(tmp_path):
    tokens = ("adapter-v2.json",)
    container = tmp_path / "boundary"
    container.mkdir(mode=0o700)
    sink = NativeEngineOutputs(tokens)

    with pytest.raises(AdapterError) as raised:
        run_native_engine_child(
            _entrypoint("_write_outputs_then_raise"),
            {"outputs": {"adapter-v2.json": _payload("adapter-v2.json").hex()}},
            deadline=_deadline(30.0),
            workspace_parent_directory=str(container),
            outputs=sink,
        )

    assert "engine failed after writing its outputs" in str(raised.value)
    assert sink.is_populated is False
    assert sink.is_closed is True


def test_two_tokens_backed_by_one_inode_are_refused_across_the_boundary(tmp_path):
    container = tmp_path / "boundary"
    container.mkdir(mode=0o700)
    sink = NativeEngineOutputs(("adapter-v2.json", "pairs-v2.txt"))

    with pytest.raises(AdapterError) as raised:
        run_native_engine_child(
            _entrypoint("_write_outputs_then_hardlink"),
            {
                "first": "adapter-v2.json",
                "second": "pairs-v2.txt",
                "payload": _payload("shared").hex(),
            },
            deadline=_deadline(30.0),
            workspace_parent_directory=str(container),
            outputs=sink,
        )

    assert "unique file identities" in str(raised.value)
    assert sink.is_populated is False


def test_outputs_require_a_parent_provisioned_workspace(tmp_path):
    sink = NativeEngineOutputs(("adapter-v2.json",))

    with pytest.raises(AdapterError) as raised:
        run_native_engine_child(
            _entrypoint("_write_nothing"),
            {},
            deadline=_deadline(5.0),
            outputs=sink,
        )

    assert "require a parent-provisioned workspace lease" in str(raised.value)


def test_a_used_sink_cannot_be_handed_to_a_second_run(tmp_path):
    token = "adapter-v2.json"
    payload = _payload(token)
    _value, sink, container = _run_with_outputs((token,), {token: payload}, tmp_path)

    with sink:
        with pytest.raises(AdapterError) as raised:
            run_native_engine_child(
                _entrypoint("_write_engine_outputs"),
                {"outputs": {token: payload.hex()}},
                deadline=_deadline(30.0),
                workspace_parent_directory=str(container),
                outputs=sink,
            )

    assert "must be unused" in str(raised.value)


def test_a_non_sink_object_is_refused(tmp_path):
    with pytest.raises(AdapterError) as raised:
        run_native_engine_child(
            _entrypoint("_write_nothing"),
            {},
            deadline=_deadline(5.0),
            workspace_parent_directory=str(tmp_path),
            outputs=object(),
        )

    assert "exact NativeEngineOutputs sink" in str(raised.value)


def test_a_run_without_outputs_is_unchanged(tmp_path):
    result = run_native_engine_child(
        _entrypoint("_report_output_visibility"),
        {},
        deadline=_deadline(10.0),
        workspace_parent_directory=str(tmp_path),
    )

    assert result == {"ok": True}


def test_an_unrequested_output_ledger_is_refused(monkeypatch, tmp_path):
    """A child cannot volunteer outputs the parent never asked for."""

    real_receive = native_process._receive_envelope

    def inject_ledger(connection, process, deadline):
        envelope = real_receive(connection, process, deadline)
        if envelope.get("kind") == "result":
            envelope = dict(envelope)
            envelope["outputLedger"] = [["adapter-v2.json", "a" * 64, 8]]
        return envelope

    monkeypatch.setattr(native_process, "_receive_envelope", inject_ledger)

    with pytest.raises(AdapterError) as raised:
        run_native_engine_child(
            _entrypoint("_report_output_visibility"),
            {},
            deadline=_deadline(10.0),
            workspace_parent_directory=str(tmp_path),
        )

    assert "declared engine outputs that were not requested" in str(raised.value)


def test_a_ready_envelope_with_the_wrong_token_set_is_refused(monkeypatch, tmp_path):
    real_receive = native_process._receive_envelope

    def corrupt_ready(connection, process, deadline):
        envelope = real_receive(connection, process, deadline)
        if envelope.get("kind") == "ready":
            envelope = dict(envelope)
            envelope["outputTokens"] = ["pairs-v2.txt"]
        return envelope

    monkeypatch.setattr(native_process, "_receive_envelope", corrupt_ready)
    container = tmp_path / "boundary"
    container.mkdir(mode=0o700)
    sink = NativeEngineOutputs(("adapter-v2.json",))

    with pytest.raises(AdapterError) as raised:
        run_native_engine_child(
            _entrypoint("_write_engine_outputs"),
            {"outputs": {"adapter-v2.json": _payload("adapter-v2.json").hex()}},
            deadline=_deadline(30.0),
            workspace_parent_directory=str(container),
            outputs=sink,
        )

    assert "did not establish its dedicated POSIX session" in str(raised.value)
    assert sink.is_populated is False


# ---------------------------------------------------------------------------
# The ready-envelope identity guard
# ---------------------------------------------------------------------------


def _ready(leader_pid: int, overrides: dict | None = None):
    envelope = {
        "protocolVersion": 1,
        "kind": "ready",
        "pid": leader_pid,
        "processGroupId": leader_pid,
        "sessionId": leader_pid,
        "pinnedFileCount": 0,
        "workspaceLeased": False,
        "workspacePath": None,
        "outputTokens": [],
    }
    envelope.update(overrides or {})
    return envelope


def test_a_valid_ready_envelope_yields_the_group_leader_pid():
    assert (
        native_process._validated_group_leader_pid(
            _ready(4321),
            process_pid=4321,
            transfer_count=0,
            workspace_lease=None,
            output_tokens=(),
        )
        == 4321
    )


@pytest.mark.parametrize("process_pid", (0, -1, -4321))
def test_a_non_positive_leader_pid_is_refused(process_pid):
    """``killpg(0, ...)`` addresses the worker's OWN group; refuse it up front."""

    with pytest.raises(AdapterError) as raised:
        native_process._validated_group_leader_pid(
            _ready(process_pid),
            process_pid=process_pid,
            transfer_count=0,
            workspace_lease=None,
            output_tokens=(),
        )

    assert "did not establish its dedicated POSIX session" in str(raised.value)


@pytest.mark.parametrize(
    "overrides",
    (
        {"pid": 99},
        {"processGroupId": 99},
        {"sessionId": 99},
        {"pinnedFileCount": 1},
        {"workspaceLeased": True},
        {"workspacePath": "/tmp/elsewhere"},
        {"outputTokens": ["adapter-v2.json"]},
    ),
)
def test_a_disagreeing_ready_envelope_is_refused(overrides):
    with pytest.raises(AdapterError):
        native_process._validated_group_leader_pid(
            _ready(4321, overrides),
            process_pid=4321,
            transfer_count=0,
            workspace_lease=None,
            output_tokens=(),
        )


def test_a_legacy_ready_envelope_without_output_tokens_is_accepted():
    envelope = _ready(4321)
    del envelope["outputTokens"]

    assert (
        native_process._validated_group_leader_pid(
            envelope,
            process_pid=4321,
            transfer_count=0,
            workspace_lease=None,
            output_tokens=(),
        )
        == 4321
    )


def test_a_requested_token_set_must_be_echoed_exactly():
    with pytest.raises(AdapterError):
        native_process._validated_group_leader_pid(
            _ready(4321, {"outputTokens": ["adapter-v2.json"]}),
            process_pid=4321,
            transfer_count=0,
            workspace_lease=None,
            output_tokens=("adapter-v2.json", "pairs-v2.txt"),
        )
