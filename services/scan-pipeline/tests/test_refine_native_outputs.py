"""The seven-descriptor child-to-parent engine output handoff.

Every test here exists to pin one property of the reviewed contract: the parent
names the closed output universe, the child may only fill those names, and the
parent's own descriptor and its own digest are what survive.  Nothing the child
declares is authoritative.
"""

from __future__ import annotations

import ast
import hashlib
import inspect
import os
import stat
import subprocess
import sys
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

#: The receipt path copies every artifact into an ``O_TMPFILE`` anonymous file,
#: which is a Linux primitive with no macOS/BSD equivalent.  The channel fails
#: closed there rather than degrading to create-then-unlink, so these tests skip
#: rather than pass -- an unavailable platform, not a satisfied contract.
requires_output_freeze = pytest.mark.skipif(
    not hasattr(os, "O_TMPFILE") or not os.path.isdir("/proc/self/fd"),
    reason=(
        "the engine output handoff freezes bytes by copying them into an "
        "O_TMPFILE anonymous file reopened through /proc/self/fd; this platform "
        "provides no primitive that creates a file which never had a name, so "
        "the channel refuses rather than weakening its contract"
    ),
)

#: Reopening ANOTHER process's descriptor through ``/proc/<pid>/fd`` is gated by
#: ``ptrace_may_access``.  Ubuntu ships ``yama.ptrace_scope=1``, which forbids it
#: between unrelated same-UID processes; a container without Yama permits it.
#: Where it is forbidden the F-3 exploit cannot be built at all, which is a
#: property of the host, not evidence that the code is safe.
_YAMA_PTRACE_SCOPE_PATH = "/proc/sys/kernel/yama/ptrace_scope"


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
def _write_outputs_then_escape_by_hardlink(request, context: NativeChildContext):
    """Write the honest outputs, then keep a name for one OUTSIDE the lease.

    This is the whole exploit.  The parent's receipt checks all pass -- the
    transported descriptor, the identity match and the parent's own digest are
    all satisfied by honest bytes -- and the escaped name only becomes usable
    once the parent has removed every name it owns.
    """

    _write_engine_outputs(request, context)
    work = _open_leased_work_directory(context)
    try:
        os.link(
            request["escape"]["token"],
            request["escape"]["path"],
            src_dir_fd=work,
        )
    finally:
        os.close(work)
    return {"escaped": request["escape"]["path"]}


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


@native_engine_entrypoint
def _create_directory_at_an_output_name(request, context: NativeChildContext):
    work = _open_leased_work_directory(context)
    try:
        os.mkdir(request["name"], 0o700, dir_fd=work)
    finally:
        os.close(work)
    return {"created": request["name"]}


@native_engine_entrypoint
def _write_outputs_then_overflow(request, context: NativeChildContext):
    _write_engine_outputs(request, context)
    return {"oversized": "x" * (256 * 1024)}


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


class _LookalikeToken(str):
    """A ``str`` subclass that compares equal to a canonical token.

    Membership tests use ``==``, so this passes ``in NATIVE_ENGINE_OUTPUT_TOKENS``
    while being free to override anything else about itself.  Exact-type checks
    are the only thing that stops it.
    """

    def __new__(cls) -> "_LookalikeToken":
        return super().__new__(cls, "adapter-v2.json")


@pytest.mark.parametrize(
    ("tokens", "message"),
    (
        ((), "count is outside the reviewed universe"),
        # Eight entries: the length clause must fire before the duplicate clause.
        (
            (*NATIVE_ENGINE_OUTPUT_TOKENS, "adapter-v2.json"),
            "count is outside the reviewed universe",
        ),
        (["not-a-reviewed-token"], "outside the reviewed universe"),
        (("adapter-v2.json", 7), "outside the reviewed universe"),
        ((_LookalikeToken(),), "outside the reviewed universe"),
        (("adapter-v2.json", "adapter-v2.json"), "must be unique"),
        (("pairs-v2.txt", "adapter-v2.json"), "canonical order"),
        ("adapter-v2.json", "exact tuple or list"),
        ({"adapter-v2.json"}, "exact tuple or list"),
    ),
)
def test_output_sinks_refuse_a_noncanonical_request(tokens, message):
    with pytest.raises(AdapterError) as raised:
        NativeEngineOutputs(tokens)

    assert message in str(raised.value)


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


def test_the_child_side_size_ceilings_refuse_what_they_promise():
    """The 4 GiB per-file and 8 GiB aggregate bounds, exercised without the bytes."""

    assert native_process._accumulated_output_bytes("adapter-v2.json", 10, 0) == 10
    assert native_process._accumulated_output_bytes("adapter-v2.json", 10, 5) == 15

    with pytest.raises(AdapterError) as empty:
        native_process._accumulated_output_bytes("adapter-v2.json", 0, 0)
    assert "is empty" in str(empty.value)

    with pytest.raises(AdapterError) as oversized:
        native_process._accumulated_output_bytes(
            "database-v1.db",
            NATIVE_CHILD_MAX_OUTPUT_FILE_BYTES + 1,
            0,
        )
    assert "exceeds the per-file byte limit" in str(oversized.value)

    with pytest.raises(AdapterError) as aggregate:
        native_process._accumulated_output_bytes(
            "database-v1.db",
            NATIVE_CHILD_MAX_OUTPUT_FILE_BYTES,
            NATIVE_CHILD_MAX_OUTPUT_TOTAL_BYTES
            - NATIVE_CHILD_MAX_OUTPUT_FILE_BYTES
            + 1,
        )
    assert "exceed the aggregate byte limit" in str(aggregate.value)


def test_the_child_opener_spends_the_shared_size_budget():
    """The opener must go through the bounded helper, not its own arithmetic."""

    source = inspect.getsource(native_process._open_child_outputs)
    assert "_accumulated_output_bytes(" in source
    assert "NATIVE_CHILD_MAX_OUTPUT_FILE_BYTES" not in source
    assert "NATIVE_CHILD_MAX_OUTPUT_TOTAL_BYTES" not in source


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
        self.released = False

    def write(self, token: str, payload: bytes) -> Path:
        target = self.work / token
        target.write_bytes(payload)
        return target

    def release(self) -> None:
        """Purge the lease at most once, so a test may purge it explicitly.

        The post-purge properties can only be exercised by a test that performs
        the purge itself, and the fixture still has to guarantee the purge on
        every path.
        """

        if self.released:
            return
        self.released = True
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


def _close_receipt(receipt) -> None:
    """Close everything a receipt owns: the caller's copies and the witnesses.

    In production ``run_native_engine_child`` closes the witnesses itself and
    hands the copies to the sink.  A test that drives the receipt directly owns
    both halves.
    """

    for output in receipt.outputs:
        os.close(output.descriptor)
    for witness in receipt.witnesses:
        os.close(witness.descriptor)


@pytest.fixture()
def leased(tmp_path):
    fixture = _LeasedOutputs(tmp_path)
    try:
        yield fixture
    finally:
        fixture.release()


@requires_output_freeze
def test_the_parent_keeps_a_private_copy_not_any_descriptor_on_the_lease(leased):
    """The returned descriptor is a DIFFERENT INODE from the one the engine wrote.

    That is the whole change.  The transported descriptor and the parent's own
    lease-side open both refer to an object other descriptors may still be able
    to write; the caller receives neither.  It receives an anonymous copy whose
    only reference is the descriptor it is handed.
    """

    payload = _payload("adapter-v2.json")
    target = leased.write("adapter-v2.json", payload)
    lease_identity = (os.stat(target).st_dev, os.stat(target).st_ino)
    sent = os.open(target, os.O_RDONLY)
    try:
        receipt = _receive_with_sent_descriptors(
            leased,
            (("adapter-v2.json", _sha256(payload), len(payload)),),
            (sent,),
        )
    finally:
        os.close(sent)

    assert len(receipt.outputs) == 1
    output = receipt.outputs[0]
    try:
        assert output.token == "adapter-v2.json"
        assert output.sha256 == _sha256(payload)
        assert output.size_bytes == len(payload)
        assert output.descriptor != sent
        assert os.pread(output.descriptor, len(payload), 0) == payload
        # ``identity`` is the object the caller will read, so a consumer that
        # re-fstats before use is checking the right thing.
        metadata = os.fstat(output.descriptor)
        assert (metadata.st_dev, metadata.st_ino) == output.identity
        # NOT the lease-side inode -- and the lease-side inode is recorded
        # separately, as diagnostics only.
        assert output.identity != lease_identity
        assert output.source_identity == lease_identity
        # Never named, so no purge is needed to make it unreachable by path.
        assert metadata.st_nlink == 0
        # Handed over read-only: no consumer can write what it borrows.
        import fcntl

        assert fcntl.fcntl(output.descriptor, fcntl.F_GETFL) & os.O_ACCMODE == (
            os.O_RDONLY
        )
        # The witness still refers to the lease-side object the copy came from.
        witness = receipt.witnesses[0]
        witness_metadata = os.fstat(witness.descriptor)
        assert (witness_metadata.st_dev, witness_metadata.st_ino) == lease_identity
    finally:
        _close_receipt(receipt)


@requires_output_freeze
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


@requires_output_freeze
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

    assert (
        "native engine output adapter-v2.json size does not match its ledger"
        in str(raised.value)
    )


@requires_output_freeze
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


@requires_output_freeze
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


@requires_output_freeze
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


@requires_output_freeze
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


@requires_output_freeze
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


@requires_output_freeze
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


@requires_output_freeze
def test_a_failed_receipt_leaves_no_open_output_descriptor(leased):
    payload = _payload("adapter-v2.json")
    first = leased.write("adapter-v2.json", payload)
    second_payload = _payload("pairs-v2.txt")
    leased.write("pairs-v2.txt", second_payload)
    sent = [
        os.open(first, os.O_RDONLY),
        os.open(leased.work / "pairs-v2.txt", os.O_RDONLY),
    ]
    before = (
        len(os.listdir("/proc/self/fd")) if os.path.isdir("/proc/self/fd") else None
    )
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


@requires_output_freeze
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


@requires_output_freeze
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
        # This assertion used to hold only because the honest fixture child does
        # not hardlink; the boundary now refuses the run when it does not hold.
        assert metadata.st_nlink == 0
        assert os.pread(sink.descriptor(token), len(payload), 0) == payload
        # The fingerprint the post-purge freeze proof compares against is the
        # parent's own measurement, kept rather than discarded.
        verified = sink.received[token].verified_snapshot
        assert len(verified) == native_process._DESCRIPTOR_SNAPSHOT_FIELDS
        assert verified[3] == len(payload)


# ---------------------------------------------------------------------------
# The post-purge freeze proof
# ---------------------------------------------------------------------------


@requires_output_freeze
def test_an_output_hardlinked_out_of_the_lease_fails_the_run(tmp_path):
    """The reviewer's exploit, end to end, with a real spawned child.

    Every receipt-time check passes: the child transports the descriptor for the
    inode it really wrote, the parent's own open lands on the same
    ``(st_dev, st_ino)``, and the parent's own digest reproduces the declared
    one.  What none of that can see is the second NAME the child created outside
    the lease, through which the bytes the parent just froze can be rewritten
    afterwards.  Only a check made after the purge can tell the two runs apart.
    """

    token = "adapter-v2.json"
    payload = _payload(token)
    container = tmp_path / "boundary"
    container.mkdir(mode=0o700)
    escape = tmp_path / "escaped-adapter-v2.json"
    sink = NativeEngineOutputs((token,))

    with pytest.raises(AdapterError) as raised:
        run_native_engine_child(
            _entrypoint("_write_outputs_then_escape_by_hardlink"),
            {
                "outputs": {token: payload.hex()},
                "escape": {"token": token, "path": str(escape)},
            },
            deadline=_deadline(30.0),
            workspace_parent_directory=str(container),
            outputs=sink,
        )

    assert "were not frozen by the workspace purge" in str(raised.value)
    assert "still reachable by name after the lease purge" in str(raised.value)
    assert raised.value.code == "REFINE_INPUT_INVALID"
    # The escaped name is exactly the capability the run was refused for.
    assert escape.exists()
    assert escape.read_bytes() == payload
    # A refused run hands the caller nothing to close and nothing to read.
    assert sink.is_closed is True
    with pytest.raises(AdapterError):
        sink.received
    assert os.listdir(container) == []


# ---------------------------------------------------------------------------
# The freeze machinery, clause by clause
# ---------------------------------------------------------------------------


def test_the_channel_refuses_a_platform_without_anonymous_files(monkeypatch):
    """Fail closed, not fall back.  A named temporary would reopen the escape."""

    monkeypatch.setattr(
        native_process,
        "_OUTPUT_FREEZE_REQUIRED_OS_NAMES",
        ("O_TMPFILE", "O_THIS_PLATFORM_HAS_NO_SUCH_FLAG"),
    )

    with pytest.raises(AdapterError) as raised:
        native_process._require_output_freeze_capabilities()

    assert "O_TMPFILE anonymous files" in str(raised.value)
    assert "Linux-only" in str(raised.value)


@requires_output_freeze
def test_the_channel_refuses_a_platform_without_a_descriptor_table(
    monkeypatch,
    tmp_path,
):
    monkeypatch.setattr(
        native_process,
        "NATIVE_OUTPUT_FREEZE_ALIAS_DIRECTORY",
        str(tmp_path / "no-such-procfs"),
    )

    with pytest.raises(AdapterError) as raised:
        native_process._require_output_freeze_capabilities()

    assert "/proc/self/fd" in str(raised.value)


def test_an_unsupported_platform_is_refused_before_anything_is_provisioned(
    monkeypatch,
    tmp_path,
):
    """The refusal has to come first, or a real engine run is thrown away."""

    monkeypatch.setattr(
        native_process,
        "_OUTPUT_FREEZE_REQUIRED_OS_NAMES",
        ("O_THIS_PLATFORM_HAS_NO_SUCH_FLAG",),
    )

    def must_not_provision(*_args, **_kwargs):
        raise AssertionError("the workspace was provisioned before the refusal")

    monkeypatch.setattr(
        native_process, "provision_native_workspace_lease", must_not_provision
    )
    container = tmp_path / "boundary"
    container.mkdir(mode=0o700)

    with pytest.raises(AdapterError) as raised:
        run_native_engine_child(
            _entrypoint("_report_output_visibility"),
            {},
            deadline=_deadline(30.0),
            workspace_parent_directory=str(container),
            outputs=NativeEngineOutputs(("adapter-v2.json",)),
        )

    assert "O_TMPFILE anonymous files" in str(raised.value)
    assert os.listdir(container) == []


@requires_output_freeze
def test_a_vault_name_that_never_becomes_unique_is_refused(leased, monkeypatch):
    def always_taken(*_args, **_kwargs):
        raise FileExistsError("synthetic collision")

    monkeypatch.setattr(native_process.os, "mkdir", always_taken)

    with pytest.raises(AdapterError) as raised:
        native_process._open_output_freeze_vault(leased.lease)

    assert "unique native engine output freeze vault" in str(raised.value)


def _vault_with_doctored_mkdir(monkeypatch, doctor):
    real_mkdir = os.mkdir

    def doctored(path, mode=0o777, *, dir_fd=None):
        real_mkdir(path, mode, dir_fd=dir_fd)
        doctor(path, dir_fd)

    monkeypatch.setattr(native_process.os, "mkdir", doctored)


@requires_output_freeze
def test_a_vault_that_is_not_private_is_refused(leased, monkeypatch):
    _vault_with_doctored_mkdir(
        monkeypatch,
        lambda path, dir_fd: os.chmod(path, 0o755, dir_fd=dir_fd),
    )

    with pytest.raises(AdapterError) as raised:
        native_process._open_output_freeze_vault(leased.lease)

    assert "fresh private directory on the lease filesystem" in str(raised.value)


@requires_output_freeze
def test_a_vault_that_is_not_ours_is_refused(leased, monkeypatch):
    """Ownership is checked after the open, not inferred from having made it."""

    real_geteuid = os.geteuid()
    monkeypatch.setattr(native_process.os, "geteuid", lambda: real_geteuid + 1)

    with pytest.raises(AdapterError) as raised:
        native_process._open_output_freeze_vault(leased.lease)

    assert "fresh private directory on the lease filesystem" in str(raised.value)


@requires_output_freeze
def test_a_vault_on_another_filesystem_is_refused(leased):
    """A copy is only cheap, and only same-device, if the anchor is."""

    import dataclasses

    elsewhere = dataclasses.replace(
        leased.lease, identity=(leased.lease.identity[0] + 1, leased.lease.identity[1])
    )

    with pytest.raises(AdapterError) as raised:
        native_process._open_output_freeze_vault(elsewhere)

    assert "fresh private directory on the lease filesystem" in str(raised.value)


@requires_output_freeze
def test_a_vault_that_is_not_empty_is_refused(leased, monkeypatch):
    def plant(path, dir_fd):
        vault = os.open(path, os.O_RDONLY | os.O_DIRECTORY, dir_fd=dir_fd)
        try:
            os.close(os.open("planted", os.O_WRONLY | os.O_CREAT, 0o600, dir_fd=vault))
        finally:
            os.close(vault)

    _vault_with_doctored_mkdir(monkeypatch, plant)

    with pytest.raises(AdapterError) as raised:
        native_process._open_output_freeze_vault(leased.lease)

    # The refusal fires, and its own cleanup then reports that it could not
    # remove what somebody else put inside a directory only we should reach.
    assert raised.value.code == "REFINE_ENGINE_CLEANUP_FAILED"
    assert "cannot remove the native engine output freeze vault" in str(raised.value)
    assert "Directory not empty" in str(raised.value)


@requires_output_freeze
def test_the_read_only_alias_refuses_a_descriptor_that_is_not_the_same_inode(
    monkeypatch,
    leased,
):
    """The alias is bound back by identity rather than trusted to be right.

    The impostor is a SECOND anonymous file of the same size, so it satisfies
    every other clause -- nameless, regular, same length.  Only the identity
    comparison can tell the two apart, which is what makes this test able to go
    red when that comparison is removed.
    """

    name, vault = native_process._open_output_freeze_vault(leased.lease)
    flags = os.O_TMPFILE | os.O_RDWR | os.O_EXCL
    writable = os.open(".", flags, 0o600, dir_fd=vault)
    impostor = os.open(".", flags, 0o600, dir_fd=vault)
    native_process._release_output_freeze_vault(leased.lease, vault, name)
    try:
        os.pwrite(writable, b"honest\n", 0)
        os.pwrite(impostor, b"honest\n", 0)
        real_open = os.open

        def impostor_open(path, flags, *args, **kwargs):
            if type(path) is str and path.startswith(
                native_process.NATIVE_OUTPUT_FREEZE_ALIAS_DIRECTORY
            ):
                return os.dup(impostor)
            return real_open(path, flags, *args, **kwargs)

        monkeypatch.setattr(native_process.os, "open", impostor_open)

        with pytest.raises(AdapterError) as raised:
            native_process._read_only_freeze_alias(writable, token="adapter-v2.json")

        assert "is not the anonymous file the parent just wrote" in str(raised.value)
    finally:
        os.close(writable)
        os.close(impostor)


@requires_output_freeze
def test_the_read_only_alias_refuses_a_descriptor_that_is_not_a_regular_file(
    tmp_path,
):
    """Same inode, already nameless, but not a regular file.

    An unlinked FIFO is the one object that satisfies the identity and link-count
    clauses while failing the type clause, so this is what isolates ``S_ISREG``.
    The alias open does not block because this process still holds the FIFO open
    for writing.
    """

    fifo = tmp_path / "fifo"
    os.mkfifo(fifo, 0o600)
    descriptor = os.open(fifo, os.O_RDWR | os.O_NONBLOCK)
    os.unlink(fifo)
    try:
        metadata = os.fstat(descriptor)
        assert metadata.st_nlink == 0
        assert not stat.S_ISREG(metadata.st_mode)

        with pytest.raises(AdapterError) as raised:
            native_process._read_only_freeze_alias(descriptor, token="adapter-v2.json")

        assert "is not the anonymous file the parent just wrote" in str(raised.value)
    finally:
        os.close(descriptor)


@requires_output_freeze
def test_the_receipt_refuses_an_unsupported_platform_on_its_own(leased, monkeypatch):
    """``_receive_native_outputs`` has direct callers, so it checks for itself.

    The boundary refuses before spawning, but that is a different call site with
    a different reason to exist.  Deleting either one must go red.
    """

    monkeypatch.setattr(
        native_process,
        "_OUTPUT_FREEZE_REQUIRED_OS_NAMES",
        ("O_THIS_PLATFORM_HAS_NO_SUCH_FLAG",),
    )

    from multiprocessing.connection import Pipe

    parent_connection, child_connection = Pipe(duplex=True)
    try:
        with pytest.raises(AdapterError) as raised:
            native_process._receive_native_outputs(
                parent_connection,
                (("adapter-v2.json", "0" * 64, 8),),
                workspace_lease=leased.lease,
                deadline=_deadline(30.0),
            )
    finally:
        parent_connection.close()
        child_connection.close()

    assert "O_TMPFILE anonymous files" in str(raised.value)


@requires_output_freeze
def test_the_read_only_alias_refuses_a_descriptor_that_still_has_a_name(tmp_path):
    """Same inode, regular file, but linked -- so only the nlink clause fires.

    This is the runtime check that the returned object really is anonymous.  It
    is here rather than beside the ``O_TMPFILE`` call because here a wrong
    descriptor can actually make it fire.
    """

    named = tmp_path / "named"
    named.write_bytes(b"honest\n")
    descriptor = os.open(named, os.O_RDONLY)
    try:
        with pytest.raises(AdapterError) as raised:
            native_process._read_only_freeze_alias(descriptor, token="adapter-v2.json")

        assert "is not the anonymous file the parent just wrote" in str(raised.value)
    finally:
        os.close(descriptor)


@requires_output_freeze
def test_the_copy_refuses_a_source_that_ends_before_its_declared_size(
    leased,
    tmp_path,
):
    """The only bound on the copy loop, exercised rather than assumed."""

    short = tmp_path / "short"
    short.write_bytes(b"tiny")
    source = os.open(short, os.O_RDONLY)
    name, vault = native_process._open_output_freeze_vault(leased.lease)
    try:
        with pytest.raises(AdapterError) as raised:
            native_process._frozen_output_copy(
                source,
                token="adapter-v2.json",
                vault_descriptor=vault,
                expected_size=4096,
                remaining_seconds=_deadline(30.0).remaining_seconds,
            )

        assert "ended before its declared size" in str(raised.value)
    finally:
        os.close(source)
        native_process._release_output_freeze_vault(leased.lease, vault, name)


@requires_output_freeze
def test_the_copy_refuses_a_destination_that_stops_accepting_bytes(
    leased,
    tmp_path,
    monkeypatch,
):
    """Without this the inner write loop spins on one offset until the lease dies."""

    payload = b"x" * 64
    whole = tmp_path / "whole"
    whole.write_bytes(payload)
    source = os.open(whole, os.O_RDONLY)
    monkeypatch.setattr(native_process.os, "pwrite", lambda *_args: 0)
    name, vault = native_process._open_output_freeze_vault(leased.lease)
    try:
        with pytest.raises(AdapterError) as raised:
            native_process._frozen_output_copy(
                source,
                token="adapter-v2.json",
                vault_descriptor=vault,
                expected_size=len(payload),
                remaining_seconds=_deadline(30.0).remaining_seconds,
            )

        assert "stopped accepting bytes" in str(raised.value)
    finally:
        os.close(source)
        native_process._release_output_freeze_vault(leased.lease, vault, name)


def test_the_private_copy_is_opened_permanently_unlinkable():
    """``O_EXCL`` is pinned by shape because no test here can pin it by effect.

    With ``O_TMPFILE``, ``O_EXCL`` means "this file can never be linked into the
    filesystem" -- the one flag that turns "has no name" into "can never be given
    one".  The runtime differential is not observable in this repository's test
    environments: a ``linkat`` through ``/proc/self/fd`` is refused with
    ``EXDEV`` whether or not ``O_EXCL`` was used, so an effect-based assertion
    would be green either way.  Asserting the call shape does go red if the flag
    is dropped, which is the property that matters.
    """

    source = inspect.getsource(native_process._frozen_output_copy)

    assert "os.O_TMPFILE | os.O_RDWR | os.O_EXCL | os.O_CLOEXEC" in source


@requires_output_freeze
def test_a_witness_that_cannot_be_closed_fails_the_run(monkeypatch, tmp_path):
    """Witness descriptors are boundary-owned, so failing to close one is fatal."""

    token = "pairs-v2.txt"
    payload = _payload(token)
    real_check = native_process._unfrozen_output_errors

    def closing_check(outputs, witnesses):
        errors = real_check(outputs, witnesses)
        # Steal the close, so the boundary's own close finds a dead number.
        for witness in witnesses:
            os.close(witness.descriptor)
        return errors

    monkeypatch.setattr(native_process, "_unfrozen_output_errors", closing_check)
    container = tmp_path / "boundary"
    container.mkdir(mode=0o700)
    sink = NativeEngineOutputs((token,))

    with pytest.raises(AdapterError) as raised:
        run_native_engine_child(
            _entrypoint("_write_engine_outputs"),
            {"outputs": {token: payload.hex()}},
            deadline=_deadline(30.0),
            workspace_parent_directory=str(container),
            outputs=sink,
        )

    assert raised.value.code == "REFINE_ENGINE_CLEANUP_FAILED"
    assert f"cannot close native pinned file {token}" in str(raised.value)
    assert sink.is_closed is True


# ---------------------------------------------------------------------------
# The three demonstrated escapes, each reproduced before it was closed
# ---------------------------------------------------------------------------


def _writable_lease_route(workspace_lease, token: str) -> int:
    """Open the lease-side engine output O_RDWR, the way an escapee would.

    This stands in for the routes the reviewer actually built: a descendant that
    outlived its session holding an ``O_RDWR`` descriptor, and a same-UID process
    that reopened the inode.  What matters is only that the route exists and is
    not the descriptor the caller is given.
    """

    work = os.open(
        NATIVE_WORKSPACE_COMMAND_SUBDIRECTORY,
        os.O_RDONLY | os.O_DIRECTORY,
        dir_fd=workspace_lease.descriptor,
    )
    try:
        return os.open(token, os.O_RDWR, dir_fd=work)
    finally:
        os.close(work)


def _run_keeping_a_writable_lease_route(monkeypatch, tmp_path, token, payload):
    """Run the whole boundary while stealing an O_RDWR route to one output.

    The route is taken at receipt time, from inside a wrapper around
    ``_receive_native_outputs``, because that is the only instant at which the
    lease still exists and the object has already been written.  The wrapper
    passes the receipt straight through, so it behaves identically whatever that
    function returns.
    """

    surviving: list[int] = []
    real_receive = native_process._receive_native_outputs

    def capturing(connection, ledger, *, workspace_lease, deadline):
        received = real_receive(
            connection,
            ledger,
            workspace_lease=workspace_lease,
            deadline=deadline,
        )
        surviving.append(_writable_lease_route(workspace_lease, token))
        return received

    monkeypatch.setattr(native_process, "_receive_native_outputs", capturing)
    container = tmp_path / "boundary"
    container.mkdir(mode=0o700, exist_ok=True)
    sink = NativeEngineOutputs((token,))
    run_native_engine_child(
        _entrypoint("_write_engine_outputs"),
        {"outputs": {token: payload.hex()}},
        deadline=_deadline(30.0),
        workspace_parent_directory=str(container),
        outputs=sink,
    )
    assert len(surviving) == 1
    return sink, surviving[0], container


@requires_output_freeze
def test_f1_the_futimens_forge_no_longer_reaches_the_returned_bytes(
    monkeypatch,
    tmp_path,
):
    """F-1: a same-length rewrite plus ``futimens`` defeats every fstat field.

    Excluding ``st_ctime_ns`` from the comparison was correct -- the purge itself
    moves it -- but it removed the only field a writer cannot forge.  This test
    performs the forge and asserts that it SUCCEEDS at leaving every remaining
    field identical, because pretending otherwise would be the dishonest version
    of this fix.  What it also asserts is that the forged bytes are not the bytes
    the caller holds: the caller holds a copy the surviving route cannot address.

    Written entirely against the public surface so it can be run unchanged
    against the code it was built to break.
    """

    token = "adapter-v2.json"
    payload = _payload(token)
    sink, surviving, _container = _run_keeping_a_writable_lease_route(
        monkeypatch, tmp_path, token, payload
    )
    try:
        with sink:
            before = os.fstat(surviving)
            assert before.st_nlink == 0
            tampered = b"T" * len(payload)
            assert tampered != payload
            os.pwrite(surviving, tampered, 0)
            os.utime(surviving, ns=(before.st_atime_ns, before.st_mtime_ns))
            after = os.fstat(surviving)

            # The forge works.  Every field the freeze compares -- everything
            # except the deliberately excluded ``st_ctime_ns`` -- is identical
            # across a rewrite that changed the bytes.
            assert os.pread(surviving, len(payload), 0) == tampered
            assert (
                before.st_dev,
                before.st_ino,
                before.st_mode,
                before.st_size,
                before.st_mtime_ns,
            ) == (
                after.st_dev,
                after.st_ino,
                after.st_mode,
                after.st_size,
                after.st_mtime_ns,
            )

            # And it no longer matters: the caller's descriptor is a different
            # inode the surviving route was never able to name or open.
            frozen = os.pread(sink.descriptor(token), len(payload), 0)
            assert frozen == payload
            assert hashlib.sha256(frozen).hexdigest() == sink.received[token].sha256
            assert os.fstat(sink.descriptor(token)).st_ino != before.st_ino
    finally:
        os.close(surviving)


@requires_output_freeze
def test_f2_bytes_rewritten_after_a_clean_return_cannot_reach_the_caller(
    monkeypatch,
    tmp_path,
):
    """F-2: the freeze was one sample, taken before the caller ever read.

    ``run_native_engine_child`` returned successfully, every post-purge check
    passed, and only THEN did a surviving writable route change the object.
    Nothing re-checked, and nothing could have: the caller reads whenever it
    likes.  The fix is that the object the caller reads is not the object the
    surviving route can write.
    """

    token = "database-v1.db"
    payload = _payload(token)
    sink, surviving, container = _run_keeping_a_writable_lease_route(
        monkeypatch, tmp_path, token, payload
    )
    try:
        with sink:
            declared = sink.received[token].sha256
            assert os.listdir(container) == []
            tampered = b"T" * len(payload)
            os.pwrite(surviving, tampered, 0)

            # The surviving route really did rewrite the object it can see.
            assert os.pread(surviving, len(payload), 0) == tampered
            # The caller's bytes are untouched and still hash to what it was told.
            frozen = os.pread(sink.descriptor(token), len(payload), 0)
            assert frozen == payload
            assert hashlib.sha256(frozen).hexdigest() == declared
    finally:
        os.close(surviving)


@requires_output_freeze
def test_f3_a_same_uid_process_reopening_the_nameless_inode_cannot_reach_it(
    monkeypatch,
    tmp_path,
):
    """F-3: ``st_nlink == 0`` never closed the name route -- procfs is a name.

    A separate same-UID process with no inherited descriptor can reopen an
    unlinked inode through ``/proc/<pid>/fd/<n>`` and rewrite it, where the host
    permits that. This test builds exactly that process. Where the host forbids
    it (Yama ``ptrace_scope`` other than 0, or no procfs) the exploit cannot be
    constructed and the test skips -- which is a fact about the host, not
    evidence that the code is safe.
    """

    if sys.platform != "linux":
        pytest.skip("/proc/<pid>/fd exists only on Linux")
    if os.path.exists(_YAMA_PTRACE_SCOPE_PATH):
        scope = Path(_YAMA_PTRACE_SCOPE_PATH).read_text().strip()
        if scope != "0":
            pytest.skip(
                "Yama ptrace_scope is "
                + scope
                + "; a non-ancestor same-UID process may not read this "
                "process's /proc/<pid>/fd, so the F-3 exploit cannot be built "
                "on this host"
            )

    token = "seed-model-v1.tar"
    payload = _payload(token)
    sink, surviving, _container = _run_keeping_a_writable_lease_route(
        monkeypatch, tmp_path, token, payload
    )
    try:
        with sink:
            assert os.fstat(surviving).st_nlink == 0
            tampered = b"T" * len(payload)
            attacker = subprocess.run(
                [
                    sys.executable,
                    "-c",
                    (
                        "import os,sys\n"
                        "fd=os.open('/proc/'+sys.argv[1]+'/fd/'+sys.argv[2],"
                        " os.O_RDWR)\n"
                        "os.pwrite(fd, bytes.fromhex(sys.argv[3]), 0)\n"
                        "os.close(fd)\n"
                    ),
                    str(os.getpid()),
                    str(surviving),
                    tampered.hex(),
                ],
                capture_output=True,
            )
            if attacker.returncode != 0:
                pytest.skip(
                    "this host refuses a cross-process /proc/<pid>/fd reopen: "
                    + attacker.stderr.decode("utf-8", "replace")[-200:]
                )

            # The exploit works against the nameless lease-side inode.
            assert os.pread(surviving, len(payload), 0) == tampered
            # It cannot reach the caller's copy, which that process never had a
            # descriptor for and which never had a name it could have opened.
            assert os.pread(sink.descriptor(token), len(payload), 0) == payload
    finally:
        os.close(surviving)


def _frozen_output(descriptor: int, snapshot, *, token="adapter-v2.json"):
    return native_process.NativeEngineOutput(
        token=token,
        descriptor=descriptor,
        sha256="0" * 64,
        size_bytes=1,
        identity=(1, 2),
        verified_snapshot=snapshot,
    )


def _snapshot_of(descriptor: int, *, token="adapter-v2.json"):
    return native_process._descriptor_snapshot(
        os.fstat(descriptor),
        descriptor,
        token=token,
    )


def _witness(descriptor: int, *, token="adapter-v2.json"):
    return native_process._OutputSourceWitness(
        token=token,
        descriptor=descriptor,
        identity=(1, 2),
    )


def test_the_freeze_proof_accepts_an_output_the_purge_left_nameless(tmp_path):
    source = tmp_path / "output"
    source.write_bytes(b"honest\n")
    descriptor = os.open(source, os.O_RDONLY)
    try:
        snapshot = _snapshot_of(descriptor)
        source.unlink()

        assert os.fstat(descriptor).st_nlink == 0
        errors = native_process._unfrozen_output_errors(
            (_frozen_output(descriptor, snapshot),),
            (),
        )

        assert errors == ()
    finally:
        os.close(descriptor)


def test_the_witness_refuses_a_name_that_survived_the_purge(tmp_path):
    """Only the ``st_nlink`` clause may fire here, and it fires on the WITNESS.

    The escaped name is a fact about the lease-side object the child wrote, not
    about the private copy the caller holds, so this is checked on the witness
    descriptor the boundary retained for exactly that purpose.
    """

    source = tmp_path / "output"
    source.write_bytes(b"honest\n")
    escape = tmp_path / "escaped"
    os.link(source, escape)
    descriptor = os.open(source, os.O_RDONLY)
    try:
        source.unlink()

        errors = native_process._unfrozen_output_errors(
            (),
            (_witness(descriptor),),
        )

        assert len(errors) == 1
        assert "still reachable by name after the lease purge (1 links)" in errors[0]
    finally:
        os.close(descriptor)


def test_the_witness_accepts_an_object_the_purge_left_nameless(tmp_path):
    source = tmp_path / "output"
    source.write_bytes(b"honest\n")
    descriptor = os.open(source, os.O_RDONLY)
    try:
        source.unlink()

        assert native_process._unfrozen_output_errors((), (_witness(descriptor),)) == ()
    finally:
        os.close(descriptor)


def test_the_witness_reports_a_descriptor_it_cannot_inspect(tmp_path):
    source = tmp_path / "output"
    source.write_bytes(b"honest\n")
    descriptor = os.open(source, os.O_RDONLY)
    os.close(descriptor)

    errors = native_process._unfrozen_output_errors((), (_witness(descriptor),))

    assert len(errors) == 1
    assert "could not be re-inspected after the purge" in errors[0]


def test_the_frozen_copy_must_be_nameless(tmp_path):
    """A construction invariant, asserted rather than assumed.

    An ``O_TMPFILE | O_EXCL`` file always has ``st_nlink == 0``.  The clause
    exists so that returning the lease-side descriptor by mistake -- the exact
    regression this design replaces -- cannot pass silently.
    """

    source = tmp_path / "output"
    source.write_bytes(b"honest\n")
    descriptor = os.open(source, os.O_RDONLY)
    try:
        snapshot = _snapshot_of(descriptor)

        errors = native_process._unfrozen_output_errors(
            (_frozen_output(descriptor, snapshot),),
            (),
        )

        assert len(errors) == 1
        assert "private copy is reachable by name (1 links)" in errors[0]
    finally:
        os.close(descriptor)


def test_the_freeze_proof_refuses_bytes_rewritten_after_verification(tmp_path):
    """Only the fingerprint clause may fire here: the name is already gone.

    A nameless inode is still writable through any descriptor that outlived the
    purge, so ``st_nlink == 0`` on its own is not a freeze.
    """

    source = tmp_path / "output"
    source.write_bytes(b"honest\n")
    readable = os.open(source, os.O_RDONLY)
    writable = os.open(source, os.O_WRONLY)
    try:
        snapshot = _snapshot_of(readable)
        source.unlink()
        os.pwrite(writable, b"TAMPERED-AFTER-THE-PARENT-HASHED-IT\n", 0)

        assert os.fstat(readable).st_nlink == 0
        errors = native_process._unfrozen_output_errors(
            (_frozen_output(readable, snapshot),),
            (),
        )

        assert errors == (
            "native engine output adapter-v2.json changed after the parent "
            "verified it",
        )
    finally:
        os.close(readable)
        os.close(writable)


def test_the_freeze_proof_refuses_an_output_the_parent_never_fingerprinted(tmp_path):
    source = tmp_path / "output"
    source.write_bytes(b"honest\n")
    descriptor = os.open(source, os.O_RDONLY)
    try:
        source.unlink()

        errors = native_process._unfrozen_output_errors(
            (_frozen_output(descriptor, ()),),
            (),
        )

        assert errors == (
            "native engine output adapter-v2.json was never fingerprinted by "
            "the parent",
        )
    finally:
        os.close(descriptor)


def test_the_freeze_proof_reports_an_uninspectable_descriptor(tmp_path):
    source = tmp_path / "output"
    source.write_bytes(b"honest\n")
    descriptor = os.open(source, os.O_RDONLY)
    snapshot = _snapshot_of(descriptor)
    os.close(descriptor)

    errors = native_process._unfrozen_output_errors(
        (_frozen_output(descriptor, snapshot),),
        (),
    )

    assert len(errors) == 1
    assert "could not be re-inspected after the purge" in errors[0]


def test_the_freeze_proof_ignores_the_ctime_a_purge_legitimately_moves(tmp_path):
    """``st_ctime_ns`` is excluded on purpose, and the exclusion is pinned here.

    Removing an open file's last name bumps ``st_ctime_ns`` on both platforms
    this repository builds on -- and on Linux only once the coarse inode clock
    has ticked since the hash, so comparing it would be green in a fast
    container and red on the qualified host.
    """

    source = tmp_path / "output"
    source.write_bytes(b"honest\n")
    descriptor = os.open(source, os.O_RDONLY)
    try:
        snapshot = list(_snapshot_of(descriptor))
        source.unlink()
        snapshot[native_process._DESCRIPTOR_SNAPSHOT_CTIME_INDEX] += 1

        errors = native_process._unfrozen_output_errors(
            (_frozen_output(descriptor, tuple(snapshot)),),
            (),
        )

        assert errors == ()
    finally:
        os.close(descriptor)


def test_the_freeze_proof_refuses_a_fingerprint_of_the_wrong_shape(tmp_path):
    source = tmp_path / "output"
    source.write_bytes(b"honest\n")
    descriptor = os.open(source, os.O_RDONLY)
    try:
        snapshot = _snapshot_of(descriptor)
        source.unlink()

        errors = native_process._unfrozen_output_errors(
            (_frozen_output(descriptor, (*snapshot, 0)),),
            (),
        )

        assert len(errors) == 1
        assert "fingerprint could not be compared" in errors[0]
    finally:
        os.close(descriptor)


def test_the_descriptor_snapshot_has_the_shape_the_freeze_proof_assumes(tmp_path):
    """The exclusion is by index, so the index is asserted rather than trusted."""

    source = tmp_path / "output"
    source.write_bytes(b"honest\n")
    descriptor = os.open(source, os.O_RDONLY)
    try:
        metadata = os.fstat(descriptor)
        snapshot = _snapshot_of(descriptor)

        assert len(snapshot) == native_process._DESCRIPTOR_SNAPSHOT_FIELDS
        assert (
            snapshot[native_process._DESCRIPTOR_SNAPSHOT_CTIME_INDEX]
            == metadata.st_ctime_ns
        )
        assert native_process._frozen_snapshot_fields(snapshot) == (
            metadata.st_dev,
            metadata.st_ino,
            metadata.st_mode,
            metadata.st_size,
            metadata.st_mtime_ns,
            0,
        )
    finally:
        os.close(descriptor)


@requires_output_freeze
def test_a_purge_failure_after_a_successful_run_closes_the_caller_owned_sink(
    monkeypatch,
    tmp_path,
):
    """A cleanup failure discovered after the return value is still a failure.

    The boundary docstring tells callers an exception never leaves a populated
    sink behind, which licenses ``try``/``except`` instead of ``with``.  Before
    this was fixed, a lease-purge failure raised with all seven descriptors
    still open and unowned by anyone who could close them.
    """

    tokens = ("adapter-v2.json", "pairs-v2.txt")
    payloads = {token: _payload(token) for token in tokens}
    container = tmp_path / "boundary"
    container.mkdir(mode=0o700)
    real_release = native_process._release_workspace_lease

    def failing_release(lease, *, leader_quiescent):
        # Purge for real, then report the uncertainty the parent must honour.
        return (
            *real_release(lease, leader_quiescent=leader_quiescent),
            "synthetic purge failure",
        )

    monkeypatch.setattr(native_process, "_release_workspace_lease", failing_release)
    sink = NativeEngineOutputs(tokens)
    before = (
        len(os.listdir("/proc/self/fd")) if os.path.isdir("/proc/self/fd") else None
    )

    with pytest.raises(AdapterError) as raised:
        run_native_engine_child(
            _entrypoint("_write_engine_outputs"),
            {"outputs": {name: payload.hex() for name, payload in payloads.items()}},
            deadline=_deadline(30.0),
            workspace_parent_directory=str(container),
            outputs=sink,
        )

    assert raised.value.code == "REFINE_ENGINE_CLEANUP_FAILED"
    assert "synthetic purge failure" in str(raised.value)
    assert sink.is_closed is True
    with pytest.raises(AdapterError):
        sink.received
    # ``is_populated`` records that outputs were once adopted, so it is NOT the
    # predicate a caller should use to decide whether it still owns anything.
    assert sink.is_populated is True
    if before is not None:
        assert len(os.listdir("/proc/self/fd")) <= before


@requires_output_freeze
def test_a_sink_that_refuses_adoption_leaves_no_open_descriptor(monkeypatch, tmp_path):
    """The receipt succeeded, so the boundary owns those descriptors either way.

    Closing the sink is the normal release, but the sink only holds the
    descriptors once ``_adopt`` accepted them.  If adoption refuses, closing it
    closes nothing, and the parent-opened descriptors have no other owner.
    """

    tokens = ("adapter-v2.json", "pairs-v2.txt")
    payloads = {token: _payload(token) for token in tokens}
    container = tmp_path / "boundary"
    container.mkdir(mode=0o700)

    def refusing_adopt(self, outputs):
        raise AdapterError("synthetic adoption refusal", "REFINE_INPUT_INVALID")

    monkeypatch.setattr(NativeEngineOutputs, "_adopt", refusing_adopt)
    sink = NativeEngineOutputs(tokens)
    before = (
        len(os.listdir("/proc/self/fd")) if os.path.isdir("/proc/self/fd") else None
    )

    with pytest.raises(AdapterError) as raised:
        run_native_engine_child(
            _entrypoint("_write_engine_outputs"),
            {"outputs": {name: payload.hex() for name, payload in payloads.items()}},
            deadline=_deadline(30.0),
            workspace_parent_directory=str(container),
            outputs=sink,
        )

    assert "synthetic adoption refusal" in str(raised.value)
    assert sink.is_populated is False
    assert sink.is_closed is True
    if before is not None:
        assert len(os.listdir("/proc/self/fd")) <= before


@requires_output_freeze
def test_a_double_release_after_a_refused_adoption_closes_nothing_twice(
    monkeypatch,
    tmp_path,
):
    """F-4: the orphan branch ran twice, on descriptor numbers already reused.

    ``_release_outputs_for_failure`` is called once because the run failed and
    again because cleanup must raise, and ``_release_workspace_lease`` allocates
    descriptors in between.  With the orphan tuple left in place the second pass
    closed the same NUMBERS again -- by then owned by whatever the lease release
    opened -- and reported a ``Bad file descriptor`` per token for damage it had
    caused itself.
    """

    tokens = ("adapter-v2.json", "pairs-v2.txt")
    payloads = {token: _payload(token) for token in tokens}
    container = tmp_path / "boundary"
    container.mkdir(mode=0o700)
    real_release = native_process._release_workspace_lease

    def failing_release(lease, *, leader_quiescent):
        return (
            *real_release(lease, leader_quiescent=leader_quiescent),
            "synthetic purge failure",
        )

    def refusing_adopt(self, outputs):
        raise AdapterError("synthetic adoption refusal", "REFINE_INPUT_INVALID")

    monkeypatch.setattr(native_process, "_release_workspace_lease", failing_release)
    monkeypatch.setattr(NativeEngineOutputs, "_adopt", refusing_adopt)
    sink = NativeEngineOutputs(tokens)

    with pytest.raises(AdapterError) as raised:
        run_native_engine_child(
            _entrypoint("_write_engine_outputs"),
            {"outputs": {name: payload.hex() for name, payload in payloads.items()}},
            deadline=_deadline(30.0),
            workspace_parent_directory=str(container),
            outputs=sink,
        )

    report = str(raised.value)
    assert str(raised.value.__cause__) == "synthetic adoption refusal"
    assert "synthetic purge failure" in report
    # The self-inflicted damage, named exactly.  Every token used to appear here.
    assert "Bad file descriptor" not in report
    for token in tokens:
        assert f"cannot close native pinned file {token}" not in report
    assert sink.is_closed is True


def test_the_freeze_posture_flag_says_what_is_and_is_not_closed():
    """The flag is a claim, so its exact scope is pinned next to it."""

    assert native_process.NATIVE_ENGINE_OUTPUT_BYTES_FROZEN_AGAINST_SURVIVING_DESCRIPTORS is True
    doc = inspect.getsource(native_process)
    marker = "NATIVE_ENGINE_OUTPUT_BYTES_FROZEN_AGAINST_SURVIVING_DESCRIPTORS = True"
    preamble = doc[: doc.index(marker)]
    # The residual has to be stated where the flag is, not somewhere else.
    assert "ptrace_may_access" in preamble
    assert "/proc/<pid>/fd" in preamble
    # And the alignment claim stays exactly where it was.
    assert NATIVE_ENGINE_OUTPUT_ALIGNMENT_VERIFIED_BY_PARENT is False


@requires_output_freeze
def test_the_freeze_vault_is_removed_on_every_path(tmp_path):
    """The vault's whole lifetime is inside one receipt call.

    Nothing is ever named inside it, so its removal cannot fail for
    ``ENOTEMPTY``; and because it is a sibling of the lease rather than part of
    it, a test can prove the container is empty afterwards on both the success
    and the failure path.
    """

    token = "pairs-v2.txt"
    payload = _payload(token)
    container = tmp_path / "boundary"
    container.mkdir(mode=0o700)

    sink = NativeEngineOutputs((token,))
    run_native_engine_child(
        _entrypoint("_write_engine_outputs"),
        {"outputs": {token: payload.hex()}},
        deadline=_deadline(30.0),
        workspace_parent_directory=str(container),
        outputs=sink,
    )
    with sink:
        assert os.listdir(container) == []

    failing = NativeEngineOutputs((token, "seed-model-v1.tar"))
    with pytest.raises(AdapterError):
        run_native_engine_child(
            _entrypoint("_write_engine_outputs"),
            {"outputs": {token: payload.hex()}},
            deadline=_deadline(30.0),
            workspace_parent_directory=str(container),
            outputs=failing,
        )
    assert os.listdir(container) == []


def test_the_child_sends_descriptors_only_inside_the_result_branch():
    """The property is control flow now, so it is asserted as control flow.

    No external test can turn a defensive ``if kind != "result"`` red: an error
    run fails identically whether or not descriptors were first written into a
    pipe, and proving otherwise would mean spying inside a ``spawn``ed child --
    which means driving ``_child_entry`` in-process, which calls ``os.setsid``
    and would detach the test runner's session.  Asserting the shape of the code
    is a real check that does go red if the call is ever hoisted back out.
    """

    tree = ast.parse(inspect.getsource(native_process))

    def sender_positions(nodes):
        found = set()
        for node in nodes:
            for inner in ast.walk(node):
                if (
                    isinstance(inner, ast.Call)
                    and isinstance(inner.func, ast.Name)
                    and inner.func.id == "_send_native_outputs"
                ):
                    found.add((inner.lineno, inner.col_offset))
        return found

    guarded = set()
    unguarded = set()
    for node in ast.walk(tree):
        if (
            isinstance(node, ast.If)
            and ast.unparse(node.test) == "terminal.get('kind') == 'result'"
        ):
            # ``ast.walk(if_node)`` descends into ``node.orelse`` too, so the
            # previous spelling of this test accepted a send that had been MOVED
            # INTO THE ELSE -- the exact mutation it exists to catch.  Only the
            # ``body`` is the guarded branch.
            guarded |= sender_positions(node.body)
            unguarded |= sender_positions(node.orelse)

    calls = sender_positions([tree])
    assert calls, "the child must still hand its outputs up"
    assert unguarded == set(), "an error branch must never send descriptors"
    assert calls == guarded


@requires_output_freeze
def test_a_subset_of_the_universe_is_a_legal_request(tmp_path):
    tokens = ("adapter-v2.json", "pairs-v2.txt")
    payloads = {token: _payload(token) for token in tokens}

    _value, sink, _container = _run_with_outputs(tokens, payloads, tmp_path)

    with sink:
        assert tuple(sink.received) == tokens


@requires_output_freeze
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
    assert raised.value.code == "REFINE_INPUT_INVALID"
    assert sink.is_populated is False
    assert sink.is_closed is True
    assert os.listdir(container) == []


@requires_output_freeze
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


@requires_output_freeze
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


@requires_output_freeze
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

    # The PARENT wording, not the child's: this must fail before any spawn.
    assert "require a workspace_parent_directory" in str(raised.value)


@requires_output_freeze
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


@requires_output_freeze
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


@requires_output_freeze
def test_a_non_regular_object_at_an_output_name_is_refused(tmp_path):
    """The child refuses to export a directory standing in for an artifact."""

    container = tmp_path / "boundary"
    container.mkdir(mode=0o700)
    sink = NativeEngineOutputs(("adapter-v2.json",))

    with pytest.raises(AdapterError) as raised:
        run_native_engine_child(
            _entrypoint("_create_directory_at_an_output_name"),
            {"name": "adapter-v2.json"},
            deadline=_deadline(30.0),
            workspace_parent_directory=str(container),
            outputs=sink,
        )

    assert (
        "native engine output adapter-v2.json must be a regular file"
        in str(raised.value)
    )
    assert sink.is_populated is False


def test_the_child_refuses_to_export_outside_a_verified_boundary(leased):
    """``_open_child_outputs`` authenticates before it touches leased scratch.

    Called here from the parent process, where the sealed-boundary predicate is
    false by construction, so the refusal cannot be mistaken for a lucky path.
    """

    leased.write("adapter-v2.json", _payload("adapter-v2.json"))
    context = NativeChildContext(
        time.monotonic() + 600.0,
        _workspace_descriptor=leased.lease.descriptor,
        _workspace_path=leased.lease.path,
    )
    assert context.is_verified_native_boundary is False

    with pytest.raises(native_process._ChildTransportError) as raised:
        native_process._open_child_outputs(
            ("adapter-v2.json",),
            context=context,
        )

    assert "outside its verified boundary" in str(raised.value)


@requires_output_freeze
def test_an_error_terminal_carries_no_descriptors_even_after_they_opened(tmp_path):
    """Outputs are opened before the envelope is sized, so both paths exist.

    An oversized result fails AFTER ``_open_child_outputs`` has succeeded, which
    is the only way to reach the branch that closes those descriptors instead of
    putting them on the wire.  Deleting that branch is not independently
    observable from out here -- the run fails on the overflow either way -- so
    this test exercises the path rather than proving the branch.
    """

    token = "adapter-v2.json"
    container = tmp_path / "boundary"
    container.mkdir(mode=0o700)
    sink = NativeEngineOutputs((token,))

    with pytest.raises(AdapterError) as raised:
        run_native_engine_child(
            _entrypoint("_write_outputs_then_overflow"),
            {"outputs": {token: _payload(token).hex()}},
            deadline=_deadline(30.0),
            workspace_parent_directory=str(container),
            outputs=sink,
        )

    assert "exceeds the bounded transport" in str(raised.value)
    assert sink.is_populated is False
    assert sink.is_closed is True
    assert os.listdir(container) == []


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


@pytest.mark.parametrize("process_pid", (None, "4321", 4321.0, True))
def test_a_non_integer_leader_pid_is_refused(process_pid):
    """``process.pid`` is ``None`` before start and must never reach ``killpg``."""

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
