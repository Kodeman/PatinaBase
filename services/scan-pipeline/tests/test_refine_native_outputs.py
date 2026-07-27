"""The seven-descriptor child-to-parent engine output handoff.

Every test here exists to pin one property of the reviewed contract: the parent
names the closed output universe, the child may only fill those names, and the
parent's own descriptor and its own digest are what survive.  Nothing the child
declares is authoritative.
"""

from __future__ import annotations

import ast
import contextlib
import errno
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

#: Reopening ANOTHER process's descriptor through ``/proc/<pid>/fd`` goes through
#: ``proc_fd_access_allowed`` -> ``ptrace_may_access(task,
#: PTRACE_MODE_READ_FSCREDS)``.  ``yama.ptrace_scope`` does NOT gate it at ANY
#: scope: ``yama_ptrace_access_check`` returns 0 immediately unless the mode
#: carries ``PTRACE_MODE_ATTACH``, and this route never does.  That is READ OFF
#: THE KERNEL SOURCE, not measured here.  An earlier revision of this comment
#: went further and asserted "no environment these tests can run in ships Yama
#: at all"; that sentence is DELETED rather than softened.  It was a claim about
#: hosts this file cannot inspect, the reasoning above never depended on it, and
#: it was wrong: ordinary Linux workstations ship Yama enabled.  Nothing here
#: assumes a scope any more -- :func:`_yama_ptrace_scope` reads the live value at
#: the moment a skip is written, so the diagnostic reports what this host
#: actually has instead of what some other host was believed to have.  An
#: earlier revision also skipped F-3 whenever ``ptrace_scope != 0``, on the
#: opposite premise, which meant it skipped on precisely the hosts where the
#: exploit works; the skip is now decided by whether the exploit actually ran,
#: which is the only honest control.
#:
#: The pidfd route DOES carry ``PTRACE_MODE_ATTACH`` and Yama DOES gate it, so
#: the test for that route grants ``PR_SET_PTRACER_ANY`` around both halves of
#: its probe -- see :func:`_ptraceable_by_any_process`.
#:
#: What DOES gate it is the target's ``dumpable`` flag, which
#: ``_seal_process_against_procfs_descriptor_theft`` drops -- see
#: ``test_the_sealed_boundary_refuses_a_same_uid_procfs_reopen``.
_PR_GET_DUMPABLE = 3
_PR_SET_DUMPABLE = 4
#: ``PR_SET_PTRACER``: the literal bytes of "Yama" as a little-endian int, which
#: is how Yama spells its own prctl.  ``PR_SET_PTRACER_ANY`` is ``(unsigned
#: long) -1`` and MUST be passed as an unsigned long -- a plain C ``int`` -1
#: through a varargs prctl is not portably the same value.
_PR_SET_PTRACER = 0x59616D61
_YAMA_PTRACE_SCOPE_PATH = "/proc/sys/kernel/yama/ptrace_scope"
#: Bit 19 of ``CapEff``.  The documented residual explicitly excludes an actor
#: holding it, so a test that needs the seal to bite has to say so rather than
#: fail on a host where the exclusion applies.
_CAP_SYS_PTRACE_BIT = 19


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
# The procfs descriptor-theft route, and the seal that closes it
# ---------------------------------------------------------------------------

#: A same-UID process with no inherited descriptor, reopening one of ours
#: through ``/proc/<pid>/fd`` and rewriting it.  This is the whole exploit; there
#: is nothing privileged in it.
_PROCFS_FD_THIEF = (
    "import os,sys\n"
    "fd=os.open('/proc/'+sys.argv[1]+'/fd/'+sys.argv[2], os.O_RDWR)\n"
    "os.pwrite(fd, bytes.fromhex(sys.argv[3]), 0)\n"
    "os.close(fd)\n"
)

#: The same thief, except it opens the ``/proc/<pid>/fd`` DIRECTORY first and
#: only reaches for the entry once the victim says it has sealed itself.  If the
#: check that matters lived on the directory open, this would win.
_PROCFS_FD_PRE_OPENER = (
    "import os,sys\n"
    "directory=os.open('/proc/'+sys.argv[1]+'/fd', os.O_RDONLY|os.O_DIRECTORY)\n"
    "print('READY', flush=True)\n"
    "sys.stdin.readline()\n"
    "fd=os.open(sys.argv[2], os.O_RDWR, dir_fd=directory)\n"
    "os.pwrite(fd, bytes.fromhex(sys.argv[3]), 0)\n"
    "os.close(fd)\n"
    "print('STOLEN', flush=True)\n"
)


#: ``SYS_pidfd_getfd``.  Linux allocated it in the unified range, so it is 438 on
#: every architecture and CPython exposes no binding for it.
_SYS_PIDFD_GETFD = 438

#: The SAME theft with NO NAME AND NO PROCFS.  ``pidfd_open(2)`` names a process
#: by pid, ``pidfd_getfd(2)`` lifts one of its descriptors straight out of its
#: table, and the only gate is ``ptrace_may_access(..., ATTACH_REALCREDS)``.
#: This is the route the module docstring used to leave out when it called
#: ``/proc/<pid>/fd`` "exactly one route".  Docker's DEFAULT seccomp profile
#: answers ``EPERM`` for ``pidfd_getfd`` regardless of the target, which is why
#: it stays invisible in an ordinary container -- and why the test that uses this
#: refuses to conclude anything unless its own positive control succeeds first.
#:
#: It reports the THEFT and the write separately, on purpose.  This channel hands
#: its caller a READ-ONLY descriptor, so ``pidfd_getfd`` yields a read-only open
#: file description and the rewrite fails with ``EBADF`` even when the theft
#: succeeded.  An assertion on "the attacker could not write" would therefore be
#: green against a completely unsealed process -- measured: with the seal removed
#: this test still passed until the probe was split.  What has to be asserted is
#: that the descriptor cannot be TAKEN.
_PIDFD_GETFD_THIEF = (
    "import ctypes,os,sys\n"
    "pid=int(sys.argv[1]); target=int(sys.argv[2])\n"
    "try:\n"
    "    pidfd=os.pidfd_open(pid, 0)\n"
    "except Exception as exc:\n"
    "    print('NOPIDFD', repr(exc)); sys.exit(3)\n"
    "libc=ctypes.CDLL(None, use_errno=True)\n"
    "libc.syscall.restype=ctypes.c_long\n"
    "ctypes.set_errno(0)\n"
    "stolen=libc.syscall(ctypes.c_long(%d), ctypes.c_int(pidfd),"
    " ctypes.c_int(target), ctypes.c_uint(0))\n"
    "if stolen < 0:\n"
    "    print('REFUSED', ctypes.get_errno()); sys.exit(4)\n"
    "print('GOT')\n"
    "try:\n"
    "    os.pwrite(int(stolen), bytes.fromhex(sys.argv[3]), 0)\n"
    "except OSError as exc:\n"
    "    print('NOWRITE', exc.errno); sys.exit(0)\n"
    "print('STOLEN')\n"
) % _SYS_PIDFD_GETFD


def _steal_through_pidfd(pid: int, descriptor: int, payload: bytes):
    """Try to lift one descriptor out of ``pid`` with pidfd_open + pidfd_getfd."""

    return subprocess.run(
        [
            sys.executable,
            "-c",
            _PIDFD_GETFD_THIEF,
            str(pid),
            str(descriptor),
            payload.hex(),
        ],
        capture_output=True,
    )


def _steal_through_procfs(pid: int, descriptor: int, payload: bytes):
    """Run the thief against one descriptor of ``pid`` and report the outcome."""

    return subprocess.run(
        [
            sys.executable,
            "-c",
            _PROCFS_FD_THIEF,
            str(pid),
            str(descriptor),
            payload.hex(),
        ],
        capture_output=True,
    )


def _prctl(option: int, value: int = 0) -> int:
    import ctypes

    return ctypes.CDLL(None, use_errno=True).prctl(option, value, 0, 0, 0)


@contextlib.contextmanager
def _temporarily_dumpable():
    """Undo the boundary's process-wide seal for the length of one exploit.

    ``_open_output_freeze_vault`` drops ``dumpable`` for the WHOLE pytest process
    the first time any test reaches the receipt path, and production never
    restores it -- restoring it would hand the route back while the caller still
    holds the descriptors.  A test that needs the exploit to be constructible
    against its own process therefore has to raise the flag itself and put it
    back.  Only a test may do this, and only around the exploit.
    """

    previous = _prctl(_PR_GET_DUMPABLE)
    _prctl(_PR_SET_DUMPABLE, 1)
    try:
        yield
    finally:
        _prctl(_PR_SET_DUMPABLE, previous)


def _yama_ptrace_scope() -> str:
    """Report the host's Yama scope, or why it could not be read."""

    try:
        with open(_YAMA_PTRACE_SCOPE_PATH, "r", encoding="utf-8") as handle:
            return handle.read().strip()
    except OSError as exc:
        return f"unreadable ({exc.__class__.__name__})"


@contextlib.contextmanager
def _ptraceable_by_any_process():
    """Take Yama out of the picture for BOTH halves of a ptrace-gated probe.

    ``pidfd_getfd(2)`` asks ``ptrace_may_access(..., PTRACE_MODE_ATTACH_REALCREDS)``,
    and ATTACH is exactly the mode Yama inspects.  READ OFF YAMA'S DOCUMENTED
    SEMANTICS, not measured here: at ``ptrace_scope=1`` -- the default on a stock
    Ubuntu -- a same-UID NON-DESCENDANT tracer is refused unconditionally, and
    that is exactly what the theft probe is.  So on such a host the positive
    control could never succeed and the test skipped on precisely the machines
    it was written for.  ``PR_SET_PTRACER_ANY`` is the documented, unprivileged
    way for a process to declare that anyone may attach to it.

    IT IS HELD ACROSS THE CONTROL **AND** THE REAL ATTEMPT ON PURPOSE.  Granting
    it only for the control would leave Yama refusing the real attempt, and a
    refusal by Yama is indistinguishable from a refusal by the seal -- the test
    would report a proof it had not made.  With the grant held for both, the
    only thing that differs between the two attempts is ``dumpable``, which is
    the whole claim.

    Yama offers no ``PR_GET_PTRACER``, so the restore is to the documented
    default (0, "only descendants"); a host that had configured something else
    for this process cannot be put back, and nothing in this suite does.  On a
    kernel with no Yama the prctl answers ``EINVAL`` and this is a no-op, which
    is correct: there is nothing to take out of the picture.
    """

    import ctypes

    library = ctypes.CDLL(None, use_errno=True)
    library.prctl.restype = ctypes.c_int
    library.prctl.argtypes = (
        ctypes.c_int,
        ctypes.c_ulong,
        ctypes.c_ulong,
        ctypes.c_ulong,
        ctypes.c_ulong,
    )
    library.prctl(_PR_SET_PTRACER, ctypes.c_ulong(-1), 0, 0, 0)
    try:
        yield
    finally:
        library.prctl(_PR_SET_PTRACER, 0, 0, 0, 0)


def _has_cap_sys_ptrace() -> bool:
    """Would a child of this process bypass the seal by capability?

    ``NATIVE_ENGINE_OUTPUT_BYTES_FROZEN_AGAINST_SURVIVING_DESCRIPTORS``
    explicitly excludes ``CAP_SYS_PTRACE``, so a host where the attacker holds it
    is a host where the seal is not claimed to bite.
    """

    try:
        with open("/proc/self/status", "r", encoding="utf-8") as handle:
            for line in handle:
                if line.startswith("CapEff:"):
                    return bool(int(line.split()[1], 16) & (1 << _CAP_SYS_PTRACE_BIT))
    except OSError:
        return False
    return False


def _linkat_through_procfs(descriptor: int, *, directory_fd: int, name: str):
    """Try to give an anonymous file a name; return the errno name, or None.

    ``os.link(src, dst)`` with both dir_fd arguments defaulted calls plain
    ``link(2)`` in CPython, which does NOT follow the procfs magic symlink and so
    always reports ``EXDEV`` (procfs mount != target mount).  That is the trap
    that made an earlier revision of this file conclude the ``O_EXCL``
    differential was unobservable and pin the flag by source text instead.
    Passing a dir_fd forces CPython onto ``linkat(..., AT_SYMLINK_FOLLOW)``,
    which is the call the differential is actually about.
    """

    try:
        os.link(
            f"{native_process.NATIVE_OUTPUT_FREEZE_ALIAS_DIRECTORY}/{descriptor}",
            name,
            dst_dir_fd=directory_fd,
            follow_symlinks=True,
        )
    except OSError as exc:
        return errno.errorcode.get(exc.errno, str(exc.errno))
    return None


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
    """And is refused as an OPERATIONAL condition, not a dead task.

    A run of colliding random names is a property of the container at this
    instant, not of the run, so this raises ``REFINE_ENGINE_SCRATCH_UNAVAILABLE``
    rather than ``REFINE_ENGINE_FAILED``.  The code is asserted here and its
    RETRYABLE fatality is asserted in
    ``test_an_unprovisionable_scratch_directory_is_retryable_not_a_dead_task``:
    ``REFINE_ENGINE_FAILED`` reaches the runner's fatal ARTIFACT_INVALID
    default, so keeping the old code would have made a name collision
    permanently kill a scan.
    """

    def always_taken(*_args, **_kwargs):
        raise FileExistsError("synthetic collision")

    monkeypatch.setattr(native_process.os, "mkdir", always_taken)

    with pytest.raises(AdapterError) as raised:
        native_process._open_output_freeze_vault(leased.lease)

    assert "unique native engine output freeze vault" in str(raised.value)
    assert raised.value.code == "REFINE_ENGINE_SCRATCH_UNAVAILABLE"


@requires_output_freeze
def test_a_vault_the_host_will_not_create_is_an_operational_refusal(
    leased,
    monkeypatch,
):
    """``mkdir`` refused by the host is a shortage, not a statement about us."""

    def out_of_inodes(*_args, **_kwargs):
        raise OSError(errno.ENOSPC, "No space left on device")

    monkeypatch.setattr(native_process.os, "mkdir", out_of_inodes)

    with pytest.raises(AdapterError) as raised:
        native_process._open_output_freeze_vault(leased.lease)

    assert "cannot create the native engine output freeze vault" in str(raised.value)
    assert raised.value.code == "REFINE_ENGINE_SCRATCH_UNAVAILABLE"


@requires_output_freeze
def test_a_vault_that_cannot_be_opened_is_an_operational_refusal(leased, monkeypatch):
    """An exhausted descriptor table refuses the open of a directory we just made.

    ``EMFILE`` is the realistic shape: the directory demonstrably exists -- this
    test lets the real ``mkdir`` run -- so the only thing that failed is the
    host's ability to hand out one more descriptor, which is exactly the
    condition an operator fixes and a retry then survives.
    """

    real_open = os.open

    def refuse_the_vault(path, flags, *args, **kwargs):
        if isinstance(path, str) and path.startswith(
            native_process.NATIVE_OUTPUT_FREEZE_VAULT_PREFIX
        ):
            raise OSError(errno.EMFILE, "Too many open files")
        return real_open(path, flags, *args, **kwargs)

    monkeypatch.setattr(native_process.os, "open", refuse_the_vault)

    with pytest.raises(AdapterError) as raised:
        native_process._open_output_freeze_vault(leased.lease)

    assert "native engine output freeze vault is unreadable" in str(raised.value)
    assert raised.value.code == "REFINE_ENGINE_SCRATCH_UNAVAILABLE"


def test_a_lease_name_that_never_becomes_unique_is_an_operational_refusal(
    tmp_path,
    monkeypatch,
):
    """The lease's half of the same reclassification, with the same reasoning."""

    container = tmp_path / "boundary"
    container.mkdir(mode=0o700)

    def always_taken(*_args, **_kwargs):
        raise FileExistsError("synthetic collision")

    monkeypatch.setattr(native_process.os, "mkdir", always_taken)

    with pytest.raises(AdapterError) as raised:
        native_process.provision_native_workspace_lease(
            str(container),
            deadline=_deadline(30.0),
        )

    assert "cannot create a unique native workspace lease" in str(raised.value)
    assert raised.value.code == "REFINE_ENGINE_SCRATCH_UNAVAILABLE"


def test_a_tampered_scratch_directory_stays_fatal_and_is_not_reclassified(
    tmp_path,
    monkeypatch,
):
    """The other side of the split, pinned so the reclassification cannot spread.

    "Not a fresh private directory" reports a same-UID actor that reached into a
    directory only this process should be able to enter.  That is a statement
    about the host's security state, not about a shortage of it: retrying hands
    the same actor another window.  It keeps ``REFINE_ENGINE_FAILED`` and so
    keeps landing on the runner's FATAL default, deliberately.
    """

    container = tmp_path / "boundary"
    container.mkdir(mode=0o700)
    real_mkdir = os.mkdir

    def widen(path, mode=0o777, *, dir_fd=None):
        real_mkdir(path, mode, dir_fd=dir_fd)
        if isinstance(path, str) and path.startswith(
            native_process.NATIVE_WORKSPACE_NAME_PREFIX
        ):
            os.chmod(path, 0o755, dir_fd=dir_fd)

    monkeypatch.setattr(native_process.os, "mkdir", widen)

    with pytest.raises(AdapterError) as raised:
        native_process.provision_native_workspace_lease(
            str(container),
            deadline=_deadline(30.0),
        )

    assert "native workspace lease is not a fresh private directory" in str(raised.value)
    assert raised.value.code == "REFINE_ENGINE_FAILED"


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


@requires_output_freeze
@pytest.mark.parametrize("code", [errno.ENOSPC, errno.EDQUOT])
def test_a_full_freeze_filesystem_is_named_rather_than_unexpected(
    leased,
    tmp_path,
    monkeypatch,
    code,
):
    """A full lease filesystem is an operational condition, not a mystery.

    It already failed closed -- no short copy, no partial file, space fully
    reclaimed -- but it arrived as "unexpected refine native boundary failure:
    OSError: No space left on device", which tells an operator nothing about the
    fix being disk headroom.  Every other refusal in this module is named; this
    one now is too.
    """

    payload = b"x" * 64
    whole = tmp_path / "whole"
    whole.write_bytes(payload)
    source = os.open(whole, os.O_RDONLY)

    def full(*_args):
        raise OSError(code, os.strerror(code))

    monkeypatch.setattr(native_process.os, "pwrite", full)
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

        assert raised.value.code == "REFINE_ENGINE_NO_SPACE"
        assert "ran out of space mid-copy" in str(raised.value)
        assert "free disk space" in str(raised.value)
    finally:
        os.close(source)
        native_process._release_output_freeze_vault(leased.lease, vault, name)


@requires_output_freeze
def test_a_write_fault_that_is_not_a_full_filesystem_is_not_called_one(
    leased,
    tmp_path,
    monkeypatch,
):
    """The errno clause, isolated.

    Telling an operator to free disk space when the disk is fine is a WRONG
    instruction rather than a vague one, so the no-space refusal is reached only
    by the no-space errnos.  ``EIO`` is the counter-example that makes the clause
    deletable-detectable.
    """

    payload = b"x" * 64
    whole = tmp_path / "whole"
    whole.write_bytes(payload)
    source = os.open(whole, os.O_RDONLY)

    def faulty(*_args):
        raise OSError(errno.EIO, os.strerror(errno.EIO))

    monkeypatch.setattr(native_process.os, "pwrite", faulty)
    name, vault = native_process._open_output_freeze_vault(leased.lease)
    try:
        with pytest.raises(OSError) as raised:
            native_process._frozen_output_copy(
                source,
                token="adapter-v2.json",
                vault_descriptor=vault,
                expected_size=len(payload),
                remaining_seconds=_deadline(30.0).remaining_seconds,
            )

        assert not isinstance(raised.value, AdapterError)
        assert raised.value.errno == errno.EIO
    finally:
        os.close(source)
        native_process._release_output_freeze_vault(leased.lease, vault, name)


@requires_output_freeze
def test_a_full_freeze_filesystem_at_creation_is_not_reported_as_no_o_tmpfile(
    leased,
    tmp_path,
    monkeypatch,
):
    """ENOSPC on the anonymous-file creation is out of space, not a missing flag.

    The creation refusal names ``O_TMPFILE`` support, which is right for
    ``EOPNOTSUPP`` and actively misleading for a full filesystem -- it sends the
    operator to look for a kernel feature instead of for free blocks.
    """

    payload = b"x" * 8
    whole = tmp_path / "whole"
    whole.write_bytes(payload)
    source = os.open(whole, os.O_RDONLY)
    real_open = native_process.os.open

    def full(path, flags, *args, **kwargs):
        if flags & os.O_TMPFILE == os.O_TMPFILE:
            raise OSError(errno.ENOSPC, os.strerror(errno.ENOSPC))
        return real_open(path, flags, *args, **kwargs)

    name, vault = native_process._open_output_freeze_vault(leased.lease)
    monkeypatch.setattr(native_process.os, "open", full)
    try:
        with pytest.raises(AdapterError) as raised:
            native_process._frozen_output_copy(
                source,
                token="adapter-v2.json",
                vault_descriptor=vault,
                expected_size=len(payload),
                remaining_seconds=_deadline(30.0).remaining_seconds,
            )

        assert raised.value.code == "REFINE_ENGINE_NO_SPACE"
        assert "out of space" in str(raised.value)
        assert "O_TMPFILE" not in str(raised.value)
    finally:
        monkeypatch.undo()
        os.close(source)
        native_process._release_output_freeze_vault(leased.lease, vault, name)


@requires_output_freeze
def test_a_creation_failure_that_is_not_a_full_filesystem_still_names_o_tmpfile(
    leased,
    tmp_path,
    monkeypatch,
):
    """The errno clause on the creation path, isolated the same way."""

    payload = b"x" * 8
    whole = tmp_path / "whole"
    whole.write_bytes(payload)
    source = os.open(whole, os.O_RDONLY)
    real_open = native_process.os.open

    def unsupported(path, flags, *args, **kwargs):
        if flags & os.O_TMPFILE == os.O_TMPFILE:
            raise OSError(errno.EOPNOTSUPP, os.strerror(errno.EOPNOTSUPP))
        return real_open(path, flags, *args, **kwargs)

    name, vault = native_process._open_output_freeze_vault(leased.lease)
    monkeypatch.setattr(native_process.os, "open", unsupported)
    try:
        with pytest.raises(AdapterError) as raised:
            native_process._frozen_output_copy(
                source,
                token="adapter-v2.json",
                vault_descriptor=vault,
                expected_size=len(payload),
                remaining_seconds=_deadline(30.0).remaining_seconds,
            )

        assert raised.value.code == "REFINE_ENGINE_FAILED"
        assert "does not support O_TMPFILE anonymous files" in str(raised.value)
    finally:
        monkeypatch.undo()
        os.close(source)
        native_process._release_output_freeze_vault(leased.lease, vault, name)


# ---------------------------------------------------------------------------
# The deadline discipline of the freeze copy
# ---------------------------------------------------------------------------


class _DeadlineLedger:
    """A ``remaining_seconds`` that records how far the copy had got at each call.

    ``_frozen_output_copy`` promises "Every chunk re-checks the one carried
    deadline, so a copy that cannot finish in the stage's remaining time fails on
    time instead of stalling."  That promise has four call sites -- on entry,
    once per chunk, once per ``pwrite``, and once after the loop -- and before
    these tests existed, deleting any one of them, or all four together, left the
    whole suite green.

    A bare call COUNT cannot tell the sites apart, because deleting the per-chunk
    site and deleting the per-``pwrite`` site remove the same number of calls from
    a copy whose writes are never short.  Recording ``(preads, pwrites)`` at each
    check identifies each site individually: the per-chunk check is the one that
    happens with equal counts, the per-``pwrite`` check the one with one more
    read than write.
    """

    def __init__(self, *, raise_on: int | None = None) -> None:
        self._raise_on = raise_on
        self.calls: list[tuple[int, int]] = []
        self.reads = 0
        self.writes = 0

    def remaining_seconds(self) -> float:
        self.calls.append((self.reads, self.writes))
        if self._raise_on is not None and len(self.calls) == self._raise_on:
            raise AdapterError(
                "refine stage engine deadline is exhausted",
                "REFINE_ENGINE_TIMEOUT",
            )
        return 30.0


def _instrumented_copy(monkeypatch, *, chunk_bytes: int, write_bytes: int | None = None):
    """Shrink the copy chunk and count the syscalls, returning the ledger factory.

    ``write_bytes`` caps what one ``pwrite`` accepts, which is how a chunk is made
    to need more than one write without any error being involved -- a short write
    is ordinary POSIX, not a fault.
    """

    monkeypatch.setattr(native_process, "_OUTPUT_FREEZE_COPY_BYTES", chunk_bytes)
    real_pread = native_process.os.pread
    real_pwrite = native_process.os.pwrite
    ledgers: list[_DeadlineLedger] = []

    def make(*, raise_on: int | None = None) -> _DeadlineLedger:
        ledger = _DeadlineLedger(raise_on=raise_on)
        ledgers.append(ledger)
        return ledger

    def counted_pread(fd, length, offset):
        data = real_pread(fd, length, offset)
        for ledger in ledgers:
            ledger.reads += 1
        return data

    def counted_pwrite(fd, data, offset):
        capped = data if write_bytes is None else data[:write_bytes]
        written = real_pwrite(fd, capped, offset)
        for ledger in ledgers:
            ledger.writes += 1
        return written

    monkeypatch.setattr(native_process.os, "pread", counted_pread)
    monkeypatch.setattr(native_process.os, "pwrite", counted_pwrite)
    return make


@requires_output_freeze
def test_the_freeze_copy_checks_the_deadline_at_every_promised_site(
    leased,
    tmp_path,
    monkeypatch,
):
    """The four call sites, each identified by where the copy had got to.

    Deleting the entry check drops the leading ``(0, 0)``.  Deleting the
    per-chunk check drops every later ``(n, n)``.  Deleting the per-``pwrite``
    check drops every ``(n + 1, n)``.  Deleting the post-loop check drops the
    trailing ``(4, 4)``.  Deleting all four leaves an empty list.  No mutation of
    any one of them leaves this assertion intact.
    """

    payload = b"0123456789abcdef"  # four 4-byte chunks, one pwrite each
    whole = tmp_path / "whole"
    whole.write_bytes(payload)
    source = os.open(whole, os.O_RDONLY)
    make = _instrumented_copy(monkeypatch, chunk_bytes=4)
    ledger = make()
    name, vault = native_process._open_output_freeze_vault(leased.lease)
    frozen = None
    try:
        frozen, _identity = native_process._frozen_output_copy(
            source,
            token="adapter-v2.json",
            vault_descriptor=vault,
            expected_size=len(payload),
            remaining_seconds=ledger.remaining_seconds,
        )

        assert os.pread(frozen, len(payload), 0) == payload
        assert ledger.calls == [
            (0, 0),  # entry, before the anonymous file exists
            (0, 0),  # chunk 1
            (1, 0),  # its pwrite
            (1, 1),  # chunk 2
            (2, 1),
            (2, 2),  # chunk 3
            (3, 2),
            (3, 3),  # chunk 4
            (4, 3),
            (4, 4),  # after the loop
        ]
    finally:
        if frozen is not None:
            os.close(frozen)
        os.close(source)
        native_process._release_output_freeze_vault(leased.lease, vault, name)


@requires_output_freeze
def test_an_expired_deadline_refuses_before_the_copy_is_even_created(
    leased,
    tmp_path,
    monkeypatch,
):
    """The entry check, isolated by an effect rather than by a call count.

    A stage with no time left must not allocate an anonymous inode it will never
    fill.  Deleting the entry check makes the ``O_TMPFILE`` open happen first,
    which this observes directly.
    """

    payload = b"x" * 64
    whole = tmp_path / "whole"
    whole.write_bytes(payload)
    source = os.open(whole, os.O_RDONLY)
    name, vault = native_process._open_output_freeze_vault(leased.lease)
    anonymous_opens: list[int] = []
    real_open = native_process.os.open

    def spy(path, flags, *args, **kwargs):
        if flags & getattr(os, "O_TMPFILE", 0) == getattr(os, "O_TMPFILE", 0):
            anonymous_opens.append(flags)
        return real_open(path, flags, *args, **kwargs)

    monkeypatch.setattr(native_process.os, "open", spy)
    ledger = _DeadlineLedger(raise_on=1)
    try:
        with pytest.raises(AdapterError) as raised:
            native_process._frozen_output_copy(
                source,
                token="adapter-v2.json",
                vault_descriptor=vault,
                expected_size=len(payload),
                remaining_seconds=ledger.remaining_seconds,
            )

        assert raised.value.code == "REFINE_ENGINE_TIMEOUT"
        assert anonymous_opens == []
    finally:
        monkeypatch.undo()
        os.close(source)
        native_process._release_output_freeze_vault(leased.lease, vault, name)


@requires_output_freeze
def test_a_deadline_that_expires_mid_copy_stops_between_chunks(
    leased,
    tmp_path,
    monkeypatch,
):
    """The per-chunk check, isolated by how much had been written when it fired.

    The ledger raises on call 4, which with 4-byte chunks and full writes is the
    start of chunk 2 -- exactly one chunk written.  Delete the per-chunk check and
    call 4 becomes the third ``pwrite``'s check, so two chunks are already
    written when it fires and the count below is wrong.
    """

    payload = b"0123456789abcdef"
    whole = tmp_path / "whole"
    whole.write_bytes(payload)
    source = os.open(whole, os.O_RDONLY)
    make = _instrumented_copy(monkeypatch, chunk_bytes=4)
    ledger = make(raise_on=4)
    name, vault = native_process._open_output_freeze_vault(leased.lease)
    try:
        with pytest.raises(AdapterError) as raised:
            native_process._frozen_output_copy(
                source,
                token="adapter-v2.json",
                vault_descriptor=vault,
                expected_size=len(payload),
                remaining_seconds=ledger.remaining_seconds,
            )

        assert raised.value.code == "REFINE_ENGINE_TIMEOUT"
        assert (ledger.reads, ledger.writes) == (1, 1)
        assert ledger.calls[-1] == (1, 1)
    finally:
        os.close(source)
        native_process._release_output_freeze_vault(leased.lease, vault, name)


@requires_output_freeze
def test_a_deadline_that_expires_between_short_writes_of_one_chunk_stops_there(
    leased,
    tmp_path,
    monkeypatch,
):
    """The per-``pwrite`` check, on the only shape where it can be the sole killer.

    A short ``pwrite`` is ordinary POSIX, not a fault, and a chunk that needs four
    of them spends the whole time inside ONE iteration of the outer loop.  With
    only a per-chunk check the copy would run that inner loop to completion with
    no deadline consulted at all.  One 4-byte chunk written one byte at a time
    gives call sites: entry, chunk 1, then one per write.  Raising on call 4 is
    the third write's check -- two bytes in.  Delete the per-``pwrite`` check and
    there are only three calls in the whole copy, so nothing raises and this goes
    red on the missing exception rather than on a count.
    """

    payload = b"abcd"
    whole = tmp_path / "whole"
    whole.write_bytes(payload)
    source = os.open(whole, os.O_RDONLY)
    make = _instrumented_copy(monkeypatch, chunk_bytes=4, write_bytes=1)
    ledger = make(raise_on=4)
    name, vault = native_process._open_output_freeze_vault(leased.lease)
    try:
        with pytest.raises(AdapterError) as raised:
            native_process._frozen_output_copy(
                source,
                token="adapter-v2.json",
                vault_descriptor=vault,
                expected_size=len(payload),
                remaining_seconds=ledger.remaining_seconds,
            )

        assert raised.value.code == "REFINE_ENGINE_TIMEOUT"
        assert ledger.calls == [(0, 0), (0, 0), (1, 0), (1, 1)]
    finally:
        os.close(source)
        native_process._release_output_freeze_vault(leased.lease, vault, name)


@requires_output_freeze
def test_a_deadline_that_expires_after_the_last_byte_still_refuses_the_copy(
    leased,
    tmp_path,
    monkeypatch,
):
    """The post-loop check: a copy finished out of time is not a copy in time.

    The bytes are all there, but the stage's budget is gone, and handing the
    caller a descriptor at that point invites publication after the deadline.
    Deleting the post-loop check returns a descriptor instead of raising.
    """

    payload = b"0123456789abcdef"
    whole = tmp_path / "whole"
    whole.write_bytes(payload)
    source = os.open(whole, os.O_RDONLY)
    make = _instrumented_copy(monkeypatch, chunk_bytes=4)
    ledger = make(raise_on=10)
    name, vault = native_process._open_output_freeze_vault(leased.lease)
    try:
        with pytest.raises(AdapterError) as raised:
            native_process._frozen_output_copy(
                source,
                token="adapter-v2.json",
                vault_descriptor=vault,
                expected_size=len(payload),
                remaining_seconds=ledger.remaining_seconds,
            )

        assert raised.value.code == "REFINE_ENGINE_TIMEOUT"
        assert (ledger.reads, ledger.writes) == (4, 4)
    finally:
        os.close(source)
        native_process._release_output_freeze_vault(leased.lease, vault, name)


# ---------------------------------------------------------------------------
# "never inherited", observed across a real exec
# ---------------------------------------------------------------------------

#: Reports whether one descriptor SURVIVED an ``execve``.  Identity is checked,
#: not mere openness: the number could have been closed at exec and then handed
#: to something the interpreter opened on its way up, which would read as a
#: false ``INHERITED``.
_FD_INHERITANCE_PROBE = (
    "import os,sys\n"
    "fd=int(sys.argv[1]); want=(int(sys.argv[2]), int(sys.argv[3]))\n"
    "try:\n"
    "    info=os.fstat(fd)\n"
    "except OSError:\n"
    "    print('CLOSED')\n"
    "else:\n"
    "    print('INHERITED' if (info.st_dev, info.st_ino) == want else 'OTHER')\n"
)


def _survives_exec(descriptor: int) -> bool:
    """Did ``descriptor`` cross a fork+exec that deliberately closed nothing?

    ``close_fds=False`` is the whole point: with it, the ONLY thing that stops a
    descriptor reaching the exec'd image is its own ``FD_CLOEXEC`` bit -- which
    is exactly what ``O_CLOEXEC`` and ``set_inheritable(..., False)`` set and
    what ``set_inheritable(..., True)`` clears.  ``os.get_inheritable`` would
    read the same bit without proving it has the effect claimed for it.
    """

    info = os.fstat(descriptor)
    completed = subprocess.run(
        [
            sys.executable,
            "-c",
            _FD_INHERITANCE_PROBE,
            str(descriptor),
            str(info.st_dev),
            str(info.st_ino),
        ],
        capture_output=True,
        close_fds=False,
    )
    assert completed.returncode == 0, completed.stderr.decode("utf-8", "replace")
    verdict = completed.stdout.decode("utf-8").strip()
    assert verdict in ("CLOSED", "INHERITED", "OTHER"), verdict
    return verdict == "INHERITED"


def _require_observable_inheritance(tmp_path) -> None:
    """Positive control: on this host an inheritable descriptor really does cross.

    Without it every assertion below would pass on a host where nothing is ever
    inherited, which is a green that means nothing.
    """

    witness = tmp_path / "inheritance-control"
    witness.write_bytes(b"control\n")
    control = os.open(witness, os.O_RDONLY)
    try:
        os.set_inheritable(control, True)
        if not _survives_exec(control):
            pytest.skip(
                "this host does not let an explicitly inheritable descriptor "
                "cross fork+exec, so nothing here could show that the freeze "
                "guards are what stop one"
            )
    finally:
        os.close(control)


@requires_output_freeze
def test_every_freeze_descriptor_is_non_inheritable_from_the_instant_it_is_opened(
    leased,
    tmp_path,
    monkeypatch,
):
    """No window: each descriptor is un-inheritable before the next statement runs.

    The probe is hooked onto ``os.open`` itself and fires on the returned
    descriptor before ``_frozen_output_copy`` or ``_read_only_freeze_alias`` has
    executed another line, so what it reads is what the ``open`` alone produced.

    WHAT THIS DOES NOT DO, stated because the opposite was assumed once already:
    it does not give the two ``O_CLOEXEC`` flags a killer, and nothing can.
    CPython's ``os.open`` sets ``FD_CLOEXEC`` on every descriptor it returns
    whatever flags it was given (PEP 446) -- measured, not argued: on this
    interpreter ``os.open(path, os.O_RDWR)`` reports ``get_inheritable() ==
    False``.  Deleting either ``O_CLOEXEC``, or either
    ``set_inheritable(..., False)``, is therefore behaviour-preserving here, and
    a test that went red on one of those would be reporting its own hook rather
    than the descriptor.  What this pins is the PROPERTY: a future creation path
    that yielded an inheritable descriptor -- ``os.dup``, ``os.pipe``, a raw
    ``ctypes`` ``open(2)``, an interpreter without PEP 446 -- fails here.
    """

    _require_observable_inheritance(tmp_path)
    payload = b"freeze me\n"
    whole = tmp_path / "whole"
    whole.write_bytes(payload)
    source = os.open(whole, os.O_RDONLY)
    name, vault = native_process._open_output_freeze_vault(leased.lease)
    real_open = native_process.os.open
    observed: list[bool] = []
    probing_depth = [0]

    def probing(*args, **kwargs):
        descriptor = real_open(*args, **kwargs)
        # ``_survives_exec`` spawns, and a spawn is entitled to open things; a
        # re-entrant probe would measure the probe.
        if probing_depth[0] == 0:
            probing_depth[0] += 1
            try:
                observed.append(_survives_exec(descriptor))
            finally:
                probing_depth[0] -= 1
        return descriptor

    frozen = None
    try:
        monkeypatch.setattr(native_process.os, "open", probing)
        frozen, _identity = native_process._frozen_output_copy(
            source,
            token="adapter-v2.json",
            vault_descriptor=vault,
            expected_size=len(payload),
            remaining_seconds=_deadline(30.0).remaining_seconds,
        )
        monkeypatch.undo()

        # The anonymous copy, then its read-only alias.  Neither may be
        # inheritable at the instant it exists.
        assert len(observed) == 2
        assert observed == [False, False]
    finally:
        monkeypatch.undo()
        if frozen is not None:
            os.close(frozen)
        os.close(source)
        native_process._release_output_freeze_vault(leased.lease, vault, name)


@requires_output_freeze
def test_the_writable_copy_is_not_inherited_while_the_engine_bytes_are_in_it(
    leased,
    tmp_path,
    monkeypatch,
):
    """The writable descriptor is the dangerous one, and it is never handed out.

    It exists only between the ``O_TMPFILE`` open and the alias, and it is the
    one handle that could REWRITE a frozen copy.  A process that inherited it
    would defeat the whole channel.  This probes it at the last moment it is
    alive -- when ``_read_only_freeze_alias`` is called with it -- so flipping
    ``set_inheritable(writable, False)`` to ``True`` turns this red.
    """

    _require_observable_inheritance(tmp_path)
    payload = b"freeze me\n"
    whole = tmp_path / "whole"
    whole.write_bytes(payload)
    source = os.open(whole, os.O_RDONLY)
    name, vault = native_process._open_output_freeze_vault(leased.lease)
    real_alias = native_process._read_only_freeze_alias
    observed: list[bool] = []

    def probing(writable_descriptor, *, token):
        observed.append(_survives_exec(writable_descriptor))
        return real_alias(writable_descriptor, token=token)

    frozen = None
    try:
        monkeypatch.setattr(native_process, "_read_only_freeze_alias", probing)
        frozen, _identity = native_process._frozen_output_copy(
            source,
            token="adapter-v2.json",
            vault_descriptor=vault,
            expected_size=len(payload),
            remaining_seconds=_deadline(30.0).remaining_seconds,
        )

        assert observed == [False]
    finally:
        monkeypatch.undo()
        if frozen is not None:
            os.close(frozen)
        os.close(source)
        native_process._release_output_freeze_vault(leased.lease, vault, name)


@requires_output_freeze
def test_the_descriptor_the_caller_receives_is_not_inherited_across_an_exec(
    tmp_path,
):
    """The end-to-end statement, on the object the caller is actually handed.

    ``run_native_engine_child``'s docstring says the returned descriptors are
    "unreachable from any name, descriptor, or process outside this one"; the
    freeze posture comment says they were "never transported over SCM_RIGHTS and
    never inherited".  This is the "never inherited" half, measured on the sink's
    own descriptor after a real boundary crossing.  Flip
    ``set_inheritable(readable, False)`` to ``True`` -- which CLEARS the
    ``O_CLOEXEC`` the alias open set -- and it goes red.
    """

    _require_observable_inheritance(tmp_path)
    token = "adapter-v2.json"
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
        frozen = sink.descriptor(token)

        assert _survives_exec(frozen) is False
        assert os.pread(frozen, len(payload), 0) == payload


def test_the_interpreter_is_what_makes_a_fresh_descriptor_non_inheritable():
    """The premise the three tests above rest on, pinned so it cannot rot silently.

    ``_frozen_output_copy``'s docstring states that its ``O_CLOEXEC`` flags and
    its ``set_inheritable(..., False)`` calls are RESTATEMENTS of CPython's own
    behaviour rather than the thing delivering it, and that no test can therefore
    make deleting one of them red.  That is only honest while the premise holds.
    If an interpreter ever returns an inheritable descriptor from ``os.open``,
    those guards stop being redundant, this goes red, and the docstring above has
    to be rewritten rather than quietly becoming false.
    """

    probe = None
    try:
        probe = os.open(__file__, os.O_RDONLY)  # deliberately no O_CLOEXEC
        assert os.get_inheritable(probe) is False
    finally:
        if probe is not None:
            os.close(probe)


def test_the_headroom_contract_is_written_down_where_the_copies_are_minted():
    """The transient disk cost is a precondition no reader could infer.

    It is 1.00x the payload IN ADDITION to the lease, held at the same time as
    the lease -- 2x at the peak, never 3x, because the lease is purged before
    staging.  A number that lives only in a review transcript is a number the
    next operator does not have.
    """

    for documented in (
        native_process._frozen_output_copy.__doc__,
        native_process._open_output_freeze_vault.__doc__,
    ):
        assert "2x" in documented
        assert "8 GiB" in documented
        assert "REFINE_ENGINE_NO_SPACE" in documented


@requires_output_freeze
def test_the_private_copy_is_opened_permanently_unlinkable(leased, tmp_path):
    """``O_EXCL`` pinned by EFFECT: no ``linkat`` can ever name the copy.

    With ``O_TMPFILE``, ``O_EXCL`` means "this file can never be linked into the
    filesystem" -- the one flag that turns "has no name" into "can never be given
    one".  An earlier revision asserted the call's SOURCE TEXT on the belief that
    the differential was unobservable, because a link through ``/proc/self/fd``
    is refused with ``EXDEV`` either way.  The ``EXDEV`` was never a property of
    the filesystem: it was the wrong call.  CPython's ``os.link`` with both
    ``dir_fd`` arguments defaulted issues plain ``link(2)``, which does not
    follow the procfs magic symlink, so it reports ``EXDEV`` (procfs mount !=
    target mount) whatever the flags were.  ``_linkat_through_procfs`` passes a
    ``dst_dir_fd``, which forces ``linkat(..., AT_SYMLINK_FOLLOW)`` -- the call
    the differential is about -- and then it is plainly visible.  Measured in
    this repository's Linux test container on BOTH overlayfs and tmpfs, at
    ``euid 0`` and ``euid 1000``:

        O_EXCL=False  linkat -> OK (A NAME WAS CREATED)
        O_EXCL=True   linkat -> ENOENT

    (``vfs_link`` refuses an inode with ``i_nlink == 0`` unless it carries
    ``I_LINKABLE``, which is exactly what ``O_EXCL`` withholds.)  The control
    below still runs, because a filesystem that refuses the link for its own
    reasons would make the assertion vacuous; where that happens this skips
    rather than reporting a proof it did not make.
    """

    naming = os.open(str(tmp_path), os.O_RDONLY | os.O_DIRECTORY)
    name, vault = native_process._open_output_freeze_vault(leased.lease)
    control = os.open(
        ".", os.O_TMPFILE | os.O_RDWR | os.O_CLOEXEC, 0o600, dir_fd=vault
    )
    try:
        os.pwrite(control, b"linkable\n", 0)
        rehearsal = _linkat_through_procfs(
            control, directory_fd=naming, name="control-link"
        )
        if rehearsal is not None:
            pytest.skip(
                "linkat through /proc/self/fd is refused with "
                + rehearsal
                + " on this filesystem WITHOUT O_EXCL, so nothing here could "
                "show that O_EXCL is what refuses it"
            )
        assert os.fstat(control).st_nlink == 1
        os.unlink("control-link", dir_fd=naming)

        source = tmp_path / "engine-output"
        source.write_bytes(b"linkable\n")
        opened = os.open(source, os.O_RDONLY)
        try:
            frozen, _identity = native_process._frozen_output_copy(
                opened,
                token="adapter-v2.json",
                vault_descriptor=vault,
                expected_size=9,
                remaining_seconds=_deadline(30.0).remaining_seconds,
            )
        finally:
            os.close(opened)
        try:
            assert (
                _linkat_through_procfs(frozen, directory_fd=naming, name="frozen-link")
                == "ENOENT"
            )
            assert os.fstat(frozen).st_nlink == 0
        finally:
            os.close(frozen)
    finally:
        os.close(control)
        native_process._release_output_freeze_vault(leased.lease, vault, name)
        os.close(naming)


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
    unlinked inode through ``/proc/<pid>/fd/<n>`` and rewrite it.  This test
    builds exactly that process and points it at the LEASE-SIDE object, which the
    freeze deliberately does not protect, to show that what the caller holds is a
    different inode the exploit cannot address.

    ``yama.ptrace_scope`` is NOT what decides whether this can be built -- see the
    module-level note on ``_PR_GET_DUMPABLE``.  What decides it is the target's
    ``dumpable`` flag, which the boundary has by now dropped for this whole
    process; that seal is pinned on its own by
    ``test_the_sealed_boundary_refuses_a_same_uid_procfs_reopen``, so this test
    lifts it for the length of its exploit and puts it back.  On a host that
    genuinely refuses the reopen anyway the test still skips -- a fact about the
    host, not evidence that the code is safe.
    """

    if sys.platform != "linux":
        pytest.skip("/proc/<pid>/fd exists only on Linux")

    token = "seed-model-v1.tar"
    payload = _payload(token)
    sink, surviving, _container = _run_keeping_a_writable_lease_route(
        monkeypatch, tmp_path, token, payload
    )
    try:
        with sink:
            assert os.fstat(surviving).st_nlink == 0
            tampered = b"T" * len(payload)
            with _temporarily_dumpable():
                attacker = _steal_through_procfs(os.getpid(), surviving, tampered)
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


@requires_output_freeze
def test_the_sealed_boundary_refuses_a_same_uid_procfs_reopen(tmp_path):
    """F-4: the residual F-3 documented, closed rather than written down.

    F-3 shows the caller's copy is a different inode from the one the exploit can
    address.  It does not close the exploit's other target: the copy's OWN entry
    in ``/proc/<pid>/fd``, which is a name a same-UID process can open ``O_RDWR``
    even though this process holds it read-only.

    The boundary now drops ``dumpable`` before the first copy exists, so the same
    attacker gets ``EACCES``.  The POSITIVE CONTROL below is what keeps a green
    here from meaning "this host has no procfs route at all", and it is also the
    whole evidence that the route was ever open: with the seal lifted, the very
    same attacker against the very same process succeeds and the bytes change.
    No claim here rests on a measurement made somewhere a reader cannot re-run --
    the control runs in the same process, on the same line, every time.
    """

    if sys.platform != "linux":
        pytest.skip("/proc/<pid>/fd exists only on Linux")
    if _has_cap_sys_ptrace():
        pytest.skip(
            "this process's children would inherit CAP_SYS_PTRACE, which the "
            "documented residual explicitly excludes, so the seal is not "
            "claimed to bite here"
        )

    token = "adapter-v2.json"
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
        frozen = sink.descriptor(token)
        rehearsed = b"C" * len(payload)
        control = os.open(str(tmp_path), os.O_TMPFILE | os.O_RDWR, 0o600)
        try:
            os.pwrite(control, payload, 0)
            with _temporarily_dumpable():
                rehearsal = _steal_through_procfs(os.getpid(), control, rehearsed)
            stolen = os.pread(control, len(payload), 0)
        finally:
            os.close(control)
        if rehearsal.returncode != 0 or stolen != rehearsed:
            pytest.skip(
                "this host refuses a cross-process /proc/<pid>/fd reopen even "
                "against a dumpable target, so nothing here could show the seal "
                "is what blocks it: "
                + rehearsal.stderr.decode("utf-8", "replace")[-200:]
            )

        # The real attempt, against the process exactly as the boundary left it.
        tampered = b"T" * len(payload)
        attacker = _steal_through_procfs(os.getpid(), frozen, tampered)

        assert attacker.returncode != 0
        assert "Permission denied" in attacker.stderr.decode("utf-8", "replace")
        frozen_bytes = os.pread(frozen, len(payload), 0)
        assert frozen_bytes == payload
        assert hashlib.sha256(frozen_bytes).hexdigest() == sink.received[token].sha256


@requires_output_freeze
def test_the_sealed_boundary_refuses_a_pidfd_getfd_theft(tmp_path):
    """The route that has no name and never touches procfs.

    ``pidfd_open(2)`` + ``pidfd_getfd(2)`` lifts a descriptor straight out of
    another process's table.  There is no path to open, no ``/proc`` entry
    involved, and the module docstring used to enumerate the procfs reopen as
    "exactly one route", which under-counted.  The property still holds, because
    the real gate is ``ptrace_may_access`` and BOTH routes ask it -- but a reader
    reasoning from the old enumeration would have concluded that hiding procfs
    was sufficient, which it is not.

    MEASURED, euid 1000, kernel ``6.12.76`` aarch64, seccomp UNCONFINED: against
    an unsealed holder ``pidfd_getfd`` returned a descriptor (rc >= 0), and
    against a descriptor the holder had open ``O_RDWR`` the attacker wrote
    through it; sealed, the syscall itself returns ``EPERM``.

    WHAT IS ASSERTED IS THE THEFT, NOT THE WRITE, and that distinction is not
    cosmetic.  This channel hands out read-only descriptors, so a successful
    ``pidfd_getfd`` on one still cannot rewrite it -- an assertion on "the bytes
    did not change" is green against a process with no seal at all.  It was:
    removing :func:`_seal_process_against_procfs_descriptor_theft` entirely left
    an earlier draft of this test passing.  Only ``REFUSED`` distinguishes.

    The POSITIVE CONTROL is what makes a green here mean anything.  Under
    Docker's DEFAULT seccomp profile ``pidfd_getfd`` is refused with ``EPERM``
    whatever the target's ``dumpable`` flag says, so without a control this test
    would pass for the wrong reason in exactly the container the gate runs in.
    Where the control cannot be built this SKIPS, naming what stopped it, rather
    than reporting a proof it did not make.

    YAMA IS TAKEN OUT OF THE PICTURE FIRST, and without that this test could not
    bite on an ordinary Linux workstation.  ``pidfd_getfd`` asks
    ``ptrace_may_access`` in ATTACH mode, which is the one mode Yama inspects,
    and a stock ``yama.ptrace_scope=1`` refuses a same-UID NON-DESCENDANT --
    exactly the shape of this probe.

    PROVENANCE OF THAT CHANGE, stated because this file cannot re-verify it.
    The grant was added on the strength of a measurement made on a qualified
    Linux host, NOT in any environment this repository's gate runs in: with the
    seal lifted and no grant the control was refused and this test skipped, and
    with ``PR_SET_PTRACER_ANY`` granted the control SUCCEEDED while the sealed
    attempt still returned ``EPERM``.  In this repository's default container
    the same run still SKIPS -- Docker's seccomp profile refuses the syscall
    before any of this matters -- and with ``--security-opt seccomp=unconfined``
    it RUNS AND PASSES but proves nothing about Yama, because that kernel has
    none.  So: the grant is what lets this test bite on a Yama host, and the
    only honest thing that can be checked from here is that it is harmless
    where Yama is absent.
    """

    if sys.platform != "linux":
        pytest.skip("pidfd_open/pidfd_getfd exist only on Linux")
    if not hasattr(os, "pidfd_open"):
        pytest.skip("this interpreter has no os.pidfd_open")
    if _has_cap_sys_ptrace():
        pytest.skip(
            "this process's children would inherit CAP_SYS_PTRACE, which the "
            "documented residual explicitly excludes, so the seal is not "
            "claimed to bite here"
        )

    token = "adapter-v2.json"
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
        frozen = sink.descriptor(token)

        # The grant spans BOTH attempts, so Yama cannot be the thing that
        # refuses either one and ``dumpable`` is the only difference left.
        with _ptraceable_by_any_process():
            # Control: the very same theft, against the very same descriptor,
            # with the seal lifted for exactly the length of the attempt.
            with _temporarily_dumpable():
                rehearsal = _steal_through_pidfd(os.getpid(), frozen, b"")
            if b"GOT" not in rehearsal.stdout:
                pytest.skip(
                    "the positive control could not be built: with "
                    "PR_SET_PTRACER_ANY granted and the target dumpable, this "
                    "host still refused pidfd_getfd, so Yama is not what "
                    "stopped it and nothing here could show the seal is. "
                    "Measured refusal: "
                    + rehearsal.stdout.decode("utf-8", "replace").strip()[-200:]
                    + rehearsal.stderr.decode("utf-8", "replace")[-200:]
                    + f" (yama.ptrace_scope={_yama_ptrace_scope()}); a seccomp "
                    "filter refusing the syscall outright -- which is what "
                    "Docker's default profile does -- or an LSM is the "
                    "remaining candidate"
                )

            # The real attempt, against the process exactly as the boundary
            # left it.
            tampered = b"T" * len(payload)
            attacker = _steal_through_pidfd(os.getpid(), frozen, tampered)

        assert b"GOT" not in attacker.stdout, attacker.stdout
        assert b"STOLEN" not in attacker.stdout
        assert attacker.stdout.startswith(b"REFUSED"), attacker.stdout
        assert attacker.returncode == 4
        frozen_bytes = os.pread(frozen, len(payload), 0)
        assert frozen_bytes == payload
        assert hashlib.sha256(frozen_bytes).hexdigest() == sink.received[token].sha256


@requires_output_freeze
def test_a_procfs_directory_opened_before_the_seal_still_cannot_be_used(tmp_path):
    """The seal must not be a race an attacker wins by starting early.

    ``/proc/<pid>/fd`` is a directory, and nothing stops a same-UID process from
    holding an ``O_DIRECTORY`` descriptor to it from before this process seals
    itself.  Sealing would be theatre if the permission that matters were checked
    only when that directory was opened -- an attacker would simply open it
    first and reach for the entries afterwards.  It is not: the
    ``ptrace_may_access`` call is on the ``openat`` of each entry.  That is the
    kind of statement this increment stopped accepting as an argument, so it is
    written here as the exploit instead, with the descriptor demonstrably opened
    while the process was still dumpable.
    """

    if sys.platform != "linux":
        pytest.skip("/proc/<pid>/fd exists only on Linux")
    if _has_cap_sys_ptrace():
        pytest.skip(
            "this process's children would inherit CAP_SYS_PTRACE, which the "
            "documented residual explicitly excludes, so the seal is not "
            "claimed to bite here"
        )

    payload = b"honest bytes\n"
    holder = os.open(str(tmp_path), os.O_TMPFILE | os.O_RDWR, 0o600)
    try:
        os.pwrite(holder, payload, 0)

        # The control: the very same attack, run to completion while dumpable.
        # Without it a refusal below would be indistinguishable from a host that
        # has no procfs route at all.
        with _temporarily_dumpable():
            rehearsal = _steal_through_procfs(
                os.getpid(), holder, b"C" * len(payload)
            )
        if rehearsal.returncode != 0 or os.pread(holder, len(payload), 0) == payload:
            pytest.skip(
                "this host refuses a cross-process /proc/<pid>/fd reopen even "
                "against a dumpable target, so nothing here could show that "
                "ordering is what fails to defeat the seal: "
                + rehearsal.stderr.decode("utf-8", "replace")[-200:]
            )
        os.pwrite(holder, payload, 0)

        with _temporarily_dumpable():
            attacker = subprocess.Popen(
                [
                    sys.executable,
                    "-c",
                    _PROCFS_FD_PRE_OPENER,
                    str(os.getpid()),
                    str(holder),
                    (b"T" * len(payload)).hex(),
                ],
                stdin=subprocess.PIPE,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
            )
            try:
                # The attacker now holds /proc/<our pid>/fd, opened while this
                # process was dumpable.
                assert attacker.stdout.readline().strip() == b"READY"
            except BaseException:
                attacker.kill()
                attacker.wait()
                raise

        # Seal AFTER the directory descriptor is already in the attacker's hand.
        native_process._seal_process_against_procfs_descriptor_theft()
        assert _prctl(_PR_GET_DUMPABLE) == 0
        stdout, stderr = attacker.communicate(b"go\n", timeout=60)

        assert attacker.returncode != 0
        assert b"STOLEN" not in stdout
        assert b"Permission denied" in stderr
        assert os.pread(holder, len(payload), 0) == payload
    finally:
        os.close(holder)


def test_the_module_names_the_gate_rather_than_only_one_route_to_it():
    """Docstring honesty: the enumeration that was wrong, pinned so it stays right.

    ``/proc/<pid>/fd`` was named as "exactly one route".  ``pidfd_getfd`` is a
    second, with no name and no procfs, and the thing that actually closes both
    is ``ptrace_may_access``.  A reader who took the old enumeration at face
    value would have concluded that a procfs-free environment needed no seal.
    """

    module_doc = native_process.__doc__
    assert "pidfd_getfd" in module_doc
    assert "ptrace_may_access" in module_doc
    assert "exactly one route" not in module_doc

    seal_doc = native_process._seal_process_against_procfs_descriptor_theft.__doc__
    # The advice that was impossible: a live debugger is exactly what the seal
    # removes, so the docstring has to say so and say what is left instead.
    # MEASURED at euid 1000, this repository's Linux container (6.12.76
    # aarch64), same process, unsealed -> sealed, same-UID sibling with no
    # CAP_SYS_PTRACE: PTRACE_SEIZE rc=0 -> EPERM; /proc/<pid>/mem OK -> EACCES.
    assert "gdb" in seal_doc
    assert "PTRACE_SEIZE" in seal_doc
    assert "/proc/<pid>/mem" in seal_doc
    assert "WHAT AN OPERATOR CAN ACTUALLY DO" in seal_doc
    # The tail of the old sentence, which appears nowhere in the correction.
    assert "instead of looking for one" not in seal_doc

    # The caller-facing claim, which is the one an integrator reads.  "Core
    # dumps are disabled" understates it and "unreachable from any process"
    # overstates it; both are corrected and both have to stay corrected.
    entry_doc = native_process.run_native_engine_child.__doc__
    assert "undebuggable" in entry_doc
    assert "pidfd_getfd" in entry_doc
    assert "CAP_SYS_PTRACE" in entry_doc
    assert "RETRYABLE" in entry_doc


@requires_output_freeze
def test_the_seal_leaves_the_parent_able_to_reopen_its_own_descriptors(leased):
    """The seal is process-wide, and this channel depends on reading itself.

    ``_read_only_freeze_alias`` reopens a descriptor through ``/proc/self/fd``.
    ``proc_fd_permission`` short-circuits for the owning thread group, so that
    survives a non-dumpable process -- but the whole point of this increment is
    that such reasoning is not evidence, so the reopen is performed after the
    seal and the result compared.
    """

    native_process._seal_process_against_procfs_descriptor_theft()
    assert _prctl(_PR_GET_DUMPABLE) == 0

    name, vault = native_process._open_output_freeze_vault(leased.lease)
    writable = os.open(
        ".", os.O_TMPFILE | os.O_RDWR | os.O_EXCL | os.O_CLOEXEC, 0o600, dir_fd=vault
    )
    try:
        os.pwrite(writable, b"honest\n", 0)
        readable = native_process._read_only_freeze_alias(writable, token="adapter-v2.json")
        try:
            assert os.fstat(readable)[:2] == os.fstat(writable)[:2]
            assert os.pread(readable, 7, 0) == b"honest\n"
        finally:
            os.close(readable)
    finally:
        os.close(writable)
        native_process._release_output_freeze_vault(leased.lease, vault, name)


@requires_output_freeze
def test_the_seal_leaves_the_process_group_scan_able_to_read_other_processes(leased):
    """Quiescence reads ``/proc/<pid>/stat`` of processes this one does not own.

    ``/proc/<pid>/stat`` is world-readable whatever the READER's own dumpable
    flag is, but that is exactly the kind of claim this increment stopped
    accepting without a measurement, so the scan is run while sealed.

    THE SECOND HALF IS NOT DECORATION.  ``_linux_process_group_members``
    ``continue``s past a row that has gone away, so a walk that could read
    NOTHING would return ``()`` too, and the empty-result assertion alone would
    stay green while the thing it claims to prove had stopped happening.  The
    own-group scan is the positive control: a child sharing this process's group
    is alive, so an empty answer there means rows are not being read.
    """

    if sys.platform != "linux":
        pytest.skip("the procfs group scan exists only on Linux")

    native_process._seal_process_against_procfs_descriptor_theft()
    assert _prctl(_PR_GET_DUMPABLE) == 0

    # A leader PID no live process can be a member of, so the scan must walk the
    # WHOLE of /proc and read every row rather than stopping at a match.
    members = native_process._linux_process_group_members(
        2**22 - 1,
        deadline=_deadline(60.0),
    )

    assert members == ()
    assert native_process._read_linux_process_stat("/proc/self/stat")[0] == os.getpid()

    # Popen without start_new_session inherits our process group, so this child
    # is a member the sealed scan has to find by reading somebody else's row.
    member = subprocess.Popen([sys.executable, "-c", "import time; time.sleep(30)"])
    try:
        found = native_process._linux_process_group_members(
            os.getpgid(0),
            deadline=_deadline(60.0),
        )
    finally:
        member.kill()
        member.wait()

    assert found, (
        "the sealed scan found no member of this process's own group while a "
        "child of it was alive, so the empty walk above proves nothing: a scan "
        "that failed to read every row would also have returned ()"
    )


@requires_output_freeze
def test_the_freeze_vault_seals_the_process_before_it_creates_anything(
    leased,
    monkeypatch,
):
    """The seal has to PRECEDE the vault, not merely accompany it.

    The statement after the vault opens mints a copy, and a copy minted while the
    process is still dumpable is reachable for however long the gap lasts.  The
    reading is taken from inside ``mkdir`` -- the vault's first act -- so a seal
    that drifted after it goes red rather than merely looking different.
    """

    observed: list[int] = []
    real_mkdir = native_process.os.mkdir

    def recording_mkdir(*args, **kwargs):
        observed.append(_prctl(_PR_GET_DUMPABLE))
        return real_mkdir(*args, **kwargs)

    monkeypatch.setattr(native_process.os, "mkdir", recording_mkdir)
    _prctl(_PR_SET_DUMPABLE, 1)
    try:
        assert _prctl(_PR_GET_DUMPABLE) == 1
        name, vault = native_process._open_output_freeze_vault(leased.lease)
        native_process._release_output_freeze_vault(leased.lease, vault, name)

        assert observed == [0]
        assert _prctl(_PR_GET_DUMPABLE) == 0
    finally:
        native_process._seal_process_against_procfs_descriptor_theft()


def test_the_seal_refuses_a_prctl_that_fails(monkeypatch):
    """A process that could not be sealed must not mint copies it cannot keep."""

    import ctypes

    class _Failing:
        def prctl(self, _option, *_rest):
            ctypes.set_errno(errno.EPERM)
            return -1

    monkeypatch.setattr(ctypes, "CDLL", lambda *_args, **_kwargs: _Failing())

    with pytest.raises(AdapterError) as raised:
        native_process._seal_process_against_procfs_descriptor_theft()

    assert "prctl(PR_SET_DUMPABLE, 0) failed with errno" in str(raised.value)
    assert str(errno.EPERM) in str(raised.value)


def test_the_seal_refuses_a_prctl_that_reports_success_without_doing_anything(
    monkeypatch,
):
    """The read-back, isolated.

    A seccomp filter or a stubbed libc that answers 0 and changes nothing would
    otherwise leave every frozen copy reachable under a claim that it is not.
    """

    import ctypes

    class _Lying:
        def prctl(self, option, *_rest):
            return 0 if option == native_process._PR_SET_DUMPABLE else 1

    monkeypatch.setattr(ctypes, "CDLL", lambda *_args, **_kwargs: _Lying())

    with pytest.raises(AdapterError) as raised:
        native_process._seal_process_against_procfs_descriptor_theft()

    assert "still dumpable after" in str(raised.value)


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
    # And BOTH routes to that gate, not only the one with a name in it.
    assert "pidfd_getfd" in preamble
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
