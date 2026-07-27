"""The seam between the workspace lease and the pinned COLMAP toolchain.

These two foundations were built concurrently and could not be made
contract-compatible on either branch alone.  Everything here proves the joint,
not either half:

* the lease transports **three** distinct surfaces -- an argv confinement root,
  a working directory, and a scratch directory -- where the toolchain used to
  have one ``workspace`` string;
* confinement resolves *beneath* the lease root, one declared surface per path
  option -- rooting every option at ``<lease>/work`` refuses the extracted
  packet at ``<lease>/packet/images`` that the allowlist is supposed to admit,
  and rooting every option at the lease root admits ``--output_path
  <lease>/packet/images``, which writes over it;
* the transported path really does satisfy ``resolve(strict=True) == path``, the
  check the lease's own contract block promises and the toolchain's private
  workspace validation actually performs.

Nothing here enables, registers, or composes a Refine stage.
"""

from __future__ import annotations

import contextlib
import errno
import os
import time
from pathlib import Path
from types import MappingProxyType

import pytest

import patina_scan_worker.refine_native_process as native_process
from patina_scan_worker.refine_adapter import AdapterError, RefineDeadline
from patina_scan_worker.refine_colmap_command import (
    _validate_pinned_execution,
    _validate_private_command_workspace,
)
from patina_scan_worker.refine_colmap_toolchain import (
    COLMAP_COMMAND_ALLOWLIST,
    _MAX_OPTION_VALUE_BYTES,
    plan_leased_colmap_command,
    plan_pinned_colmap_command,
)
from patina_scan_worker.refine_native_process import (
    NATIVE_WORKSPACE_COMMAND_SUBDIRECTORY,
    NATIVE_WORKSPACE_MAX_ARGV_ITEM_BYTES,
    NATIVE_WORKSPACE_MAX_ARGV_PATH_TAIL_BYTES,
    NATIVE_WORKSPACE_MAX_PATH_BYTES,
    NATIVE_WORKSPACE_NAME_BYTES,
    NATIVE_WORKSPACE_PACKET_SUBDIRECTORY,
    NATIVE_WORKSPACE_SUBDIRECTORIES,
    NATIVE_WORKSPACE_TEMP_SUBDIRECTORY,
    NativeChildContext,
    _release_workspace_lease,
    provision_native_workspace_lease,
)

from _colmap_toolchain import (  # noqa: E402 - tests/ is on pythonpath
    load_fake_toolchain,
    plan_leased_supervised_command,
    write_toolchain,
)

pytestmark = pytest.mark.skipif(
    os.name != "posix", reason="the workspace lease requires POSIX"
)


def _container(tmp_path: Path) -> Path:
    container = tmp_path / "lease-container"
    container.mkdir(mode=0o700)
    return container


@contextlib.contextmanager
def _leased_context(container: Path, seconds: float = 600.0):
    """Provision one real lease and the context a child would receive for it.

    The subdirectory paths are built exactly as the child-side receipt builds
    them (``os.path.join(root_path, name)``), so this exercises the real
    transported strings rather than a convenient reconstruction.
    """

    lease = provision_native_workspace_lease(
        str(container),
        deadline=RefineDeadline(time.monotonic() + seconds),
    )
    try:
        yield (
            lease,
            NativeChildContext(
                time.monotonic() + seconds,
                _workspace_descriptor=lease.descriptor,
                _workspace_path=lease.path,
                _workspace_subdirectory_paths=MappingProxyType(
                    {
                        name: os.path.join(lease.path, name)
                        for name in NATIVE_WORKSPACE_SUBDIRECTORIES
                    }
                ),
            ),
        )
    finally:
        _release_workspace_lease(lease, leader_quiescent=True)


def _lease_argv(executable: str, root: str) -> tuple[str, ...]:
    """The real shape: images come from the packet, output goes to work/."""

    return (
        executable,
        "point_triangulator",
        "--database_path",
        f"{root}/{NATIVE_WORKSPACE_COMMAND_SUBDIRECTORY}/database-v1.db",
        "--image_path",
        f"{root}/{NATIVE_WORKSPACE_PACKET_SUBDIRECTORY}/images",
        "--input_path",
        f"{root}/{NATIVE_WORKSPACE_COMMAND_SUBDIRECTORY}/seed",
        "--output_path",
        f"{root}/{NATIVE_WORKSPACE_COMMAND_SUBDIRECTORY}/triangulated",
        "--clear_points",
        "1",
        "--refine_intrinsics",
        "0",
        "--Mapper.random_seed",
        "0",
    )


def _with_option(argv: tuple[str, ...], option: str, value: str) -> tuple[str, ...]:
    """Return ``argv`` with one option's value replaced, order untouched."""

    replaced = list(argv)
    replaced[replaced.index(option) + 1] = value
    return tuple(replaced)


@contextlib.contextmanager
def _toolchain(tmp_path: Path, *, qualified: bool = True):
    prefix = tmp_path / "colmap"
    write_toolchain(prefix)
    loaded = load_fake_toolchain(prefix, qualified=qualified)
    try:
        yield loaded
    finally:
        loaded.close()


# ---------------------------------------------------------------------------
# The transported path must survive resolve(strict=True) == path
# ---------------------------------------------------------------------------


def test_a_symlinked_final_container_component_is_refused_at_provisioning(tmp_path):
    """The open flags already covered this shape -- and only this shape.

    A symlink as the *final* component of the container path fails the open
    before any check below can look at it, which is why the gap in the next test
    went unnoticed: the obvious test case was already green.  MEASURED, on both
    Linux and macOS, the errno is ``ENOTDIR`` and not ``ELOOP``: ``O_NOFOLLOW``
    stops the resolution ON the link and ``O_DIRECTORY`` then sees something
    that is not a directory.  That distinction is not cosmetic -- it is which
    row of ``_WORKSPACE_PROVISIONING_ERRNOS`` the condition would otherwise
    land on.

    What is asserted here is the REFUSAL ITSELF, not merely that something was
    raised.  An assertion this weak is how the split below went unnoticed once
    already.
    """

    real = tmp_path / "real-scratch"
    real.mkdir(mode=0o700)
    link = tmp_path / "scratch-link"
    link.symlink_to(real, target_is_directory=True)

    with pytest.raises(OSError) as opened:
        os.close(os.open(str(link), native_process._workspace_directory_flags()))
    assert opened.value.errno == errno.ENOTDIR

    with pytest.raises(AdapterError) as raised:
        provision_native_workspace_lease(
            str(link),
            deadline=RefineDeadline(time.monotonic() + 60.0),
        )

    assert str(raised.value) == (
        "native workspace parent directory must not traverse a symlink"
    )
    assert raised.value.code == "REFINE_INPUT_INVALID"
    # Nothing was created inside the container the symlink pointed at.
    assert sorted(os.listdir(real)) == []


def test_an_intermediate_symlinked_component_is_refused_at_provisioning(tmp_path):
    """The failing case the re-review reproduced: the *container* itself is real.

    ``workspace_path`` claims the transported string "survives a consumer's
    ``resolve(strict=True) == path`` check", and item 3's private-workspace
    validation performs exactly that check.  ``O_NOFOLLOW`` does not see an
    intermediate symlink, so provisioning used to mint a lease whose work/ the
    supervisor then rejected with "COLMAP command workspace may not traverse a
    symlink".  It is now refused at the boundary the operator can act on.
    """

    real = tmp_path / "real-scratch"
    (real / "leases").mkdir(mode=0o700, parents=True)
    link = tmp_path / "scratch-link"
    link.symlink_to(real, target_is_directory=True)

    with pytest.raises(AdapterError) as raised:
        provision_native_workspace_lease(
            str(link / "leases"),
            deadline=RefineDeadline(time.monotonic() + 60.0),
        )

    assert str(raised.value) == (
        "native workspace parent directory must not traverse a symlink"
    )
    assert sorted(os.listdir(real / "leases")) == []


def test_a_non_canonical_container_path_is_refused_at_provisioning(tmp_path):
    container = _container(tmp_path)

    with pytest.raises(AdapterError) as raised:
        provision_native_workspace_lease(
            f"{container}/../{container.name}",
            deadline=RefineDeadline(time.monotonic() + 60.0),
        )

    assert str(raised.value) == (
        "native workspace parent directory must not traverse a symlink"
    )


# ---------------------------------------------------------------------------
# Provisioning refusals are classified by ERRNO, one row per real condition
# ---------------------------------------------------------------------------


def _nonexistent_root(tmp_path: Path) -> str:
    return str(tmp_path / "never-created")


def _symlinked_root(tmp_path: Path) -> str:
    real = tmp_path / "real-scratch"
    real.mkdir(mode=0o700)
    link = tmp_path / "scratch-link"
    link.symlink_to(real, target_is_directory=True)
    return str(link)


def _looping_root(tmp_path: Path) -> str:
    loop = tmp_path / "loop"
    loop.symlink_to(loop)
    return str(loop / "leases")


def _regular_file_root(tmp_path: Path) -> str:
    ordinary = tmp_path / "not-a-directory"
    ordinary.write_bytes(b"an operator pointed the scratch root at a file\n")
    return str(ordinary)


def _fifo_root(tmp_path: Path) -> str:
    fifo = tmp_path / "scratch-fifo"
    os.mkfifo(fifo, 0o600)
    return str(fifo)


def _unenterable_root(tmp_path: Path) -> str:
    closed = tmp_path / "unenterable"
    closed.mkdir(mode=0o700)
    os.chmod(closed, 0o000)
    return str(closed)


#: ``(id, builder, errno, code, wording)``.  Every row builds its condition FOR
#: REAL -- a symlinked root, a self-looping root, a regular file, a FIFO, a
#: mode-000 directory, a path nobody created -- and asserts the errno the real
#: open actually produces BEFORE asserting the verdict, so no row can drift into
#: pinning an exception name instead of a condition.
_REAL_PROVISIONING_CONDITIONS = (
    (
        "nonexistent-root",
        _nonexistent_root,
        errno.ENOENT,
        "REFINE_ENGINE_SCRATCH_UNAVAILABLE",
        "(ENOENT)",
    ),
    (
        "symlinked-root",
        _symlinked_root,
        errno.ENOTDIR,
        "REFINE_INPUT_INVALID",
        "must not traverse a symlink",
    ),
    (
        "self-looping-root",
        _looping_root,
        errno.ELOOP,
        "REFINE_INPUT_INVALID",
        "must not traverse a symlink",
    ),
    (
        "regular-file-root",
        _regular_file_root,
        errno.ENOTDIR,
        "REFINE_INPUT_INVALID",
        "must be an owned directory",
    ),
    (
        "fifo-root",
        _fifo_root,
        errno.ENOTDIR,
        "REFINE_INPUT_INVALID",
        "must be an owned directory",
    ),
    (
        "unenterable-root",
        _unenterable_root,
        errno.EACCES,
        "REFINE_ENGINE_FAILED",
        "(EACCES)",
    ),
)


@pytest.mark.parametrize(
    ("build", "expected_errno", "expected_code", "expected_text"),
    [row[1:] for row in _REAL_PROVISIONING_CONDITIONS],
    ids=[row[0] for row in _REAL_PROVISIONING_CONDITIONS],
)
def test_each_real_provisioning_condition_keeps_its_own_verdict(
    tmp_path,
    build,
    expected_errno,
    expected_code,
    expected_text,
):
    """One operator mistake per row, and each keeps the verdict it earns.

    The arm at the bottom of ``provision_native_workspace_lease`` used to bucket
    the whole ``OSError`` TYPE as operational.  Its justification enumerated
    "ENOENT on an unconfigured root, ENOSPC, EMFILE, ENOMEM" -- but the flags it
    opens with, ``O_RDONLY|O_DIRECTORY|O_NOFOLLOW|O_CLOEXEC``, produce ENOTDIR,
    ELOOP and EACCES just as readily, and none of those is a shortage: every one
    reproduces identically on every attempt, so retrying only spends the queue's
    attempts to reach the same refusal later.

    Each row asserts the errno FIRST, from the real open with the module's real
    flags, so what is pinned is the condition and not a name that happens to
    reach it today.  The wording is asserted too: for the rows that reach the
    errno classifier the line has to NAME the errno, because
    ``_exception_summary`` degrades ``NotADirectoryError`` and its siblings to
    "external exception" and an operator handed a slowly-retrying task plus
    "external exception" has been told nothing at all.
    """

    if expected_errno == errno.EACCES and os.geteuid() == 0:
        pytest.skip(
            "a mode-000 directory cannot refuse a root euid, so this condition "
            "cannot be constructed under the root euid the gate containers run "
            "as; EACCES keeps its verdict pinned without a euid dependency in "
            "test_every_classified_provisioning_errno_keeps_its_side_of_the_split"
        )

    root = build(tmp_path)
    try:
        with pytest.raises(OSError) as opened:
            os.close(os.open(root, native_process._workspace_directory_flags()))
        assert opened.value.errno == expected_errno

        with pytest.raises(AdapterError) as raised:
            provision_native_workspace_lease(
                root,
                deadline=RefineDeadline(time.monotonic() + 60.0),
            )
        assert raised.value.code == expected_code
        assert expected_text in str(raised.value)
    finally:
        # A mode-000 directory would otherwise defeat tmp_path's own cleanup.
        with contextlib.suppress(OSError):
            if os.path.isdir(root) and not os.path.islink(root):
                os.chmod(root, 0o700)


def test_a_symlinked_scratch_root_classifies_the_same_at_every_component(tmp_path):
    """ONE operator mistake, ONE verdict -- whichever component is the link.

    This is the self-inconsistency the errno split closed, pinned so it cannot
    re-open on one side only.  The module deliberately refuses a symlinked
    scratch root as fatal input ("must not traverse a symlink"), but the open
    flags beat that check to the punch for the FINAL path component, so the
    final-component shape used to fall through to the operational normalization
    and RETRY while the intermediate-component shape died fatally.  Same
    mistake, same operator fix, two verdicts.
    """

    final_real = tmp_path / "final" / "real-scratch"
    final_real.mkdir(mode=0o700, parents=True)
    final_link = tmp_path / "final" / "scratch-link"
    final_link.symlink_to(final_real, target_is_directory=True)

    middle_real = tmp_path / "middle" / "real-scratch"
    (middle_real / "leases").mkdir(mode=0o700, parents=True)
    middle_link = tmp_path / "middle" / "scratch-link"
    middle_link.symlink_to(middle_real, target_is_directory=True)

    def refusal(path) -> tuple[str, str]:
        with pytest.raises(AdapterError) as raised:
            provision_native_workspace_lease(
                str(path),
                deadline=RefineDeadline(time.monotonic() + 60.0),
            )
        return raised.value.code, str(raised.value)

    final_component = refusal(final_link)
    intermediate_component = refusal(middle_link / "leases")

    assert final_component == intermediate_component
    # And the shared verdict is the fatal, structural one rather than the
    # retryable one: a symlinked root is a configuration error, not a shortage.
    assert final_component == (
        "REFINE_INPUT_INVALID",
        "native workspace parent directory must not traverse a symlink",
    )


#: Written out LITERALLY rather than read back off the module, so that deleting
#: a row from ``_WORKSPACE_PROVISIONING_ERRNOS`` turns this red instead of
#: silently shrinking the parametrization to match itself.
_EXPECTED_ERRNO_VERDICTS = (
    ("ENOSPC", "REFINE_ENGINE_SCRATCH_UNAVAILABLE"),
    ("EDQUOT", "REFINE_ENGINE_SCRATCH_UNAVAILABLE"),
    ("EMFILE", "REFINE_ENGINE_SCRATCH_UNAVAILABLE"),
    ("ENFILE", "REFINE_ENGINE_SCRATCH_UNAVAILABLE"),
    ("ENOMEM", "REFINE_ENGINE_SCRATCH_UNAVAILABLE"),
    ("ENOENT", "REFINE_ENGINE_SCRATCH_UNAVAILABLE"),
    ("ELOOP", "REFINE_ENGINE_FAILED"),
    ("ENOTDIR", "REFINE_ENGINE_FAILED"),
    ("EACCES", "REFINE_ENGINE_FAILED"),
    ("EPERM", "REFINE_ENGINE_FAILED"),
    ("EROFS", "REFINE_ENGINE_FAILED"),
)


@pytest.mark.parametrize(
    ("name", "expected_code"),
    _EXPECTED_ERRNO_VERDICTS,
    ids=[name for name, _code in _EXPECTED_ERRNO_VERDICTS],
)
def test_every_classified_provisioning_errno_keeps_its_side_of_the_split(
    name,
    expected_code,
):
    """One row per enumerated errno, including the ones no test can construct.

    ENOSPC/EDQUOT/EMFILE/ENFILE/ENOMEM cannot be built without exhausting the
    gate's own host, EROFS needs a read-only mount, and EACCES/EPERM cannot be
    built under the root euid the gate containers run as.  Those are pinned
    against the classifier directly; every condition that CAN be built is
    additionally driven through the real function by
    ``test_each_real_provisioning_condition_keeps_its_own_verdict``.
    """

    number = getattr(errno, name)
    assert native_process._workspace_provisioning_refusal(
        OSError(number, "synthetic condition")
    ) == (name, expected_code)


def test_the_provisioning_errno_table_enumerates_exactly_what_was_decided():
    """A new row cannot be added without a verdict being chosen for it here."""

    assert tuple(
        (name, code)
        for name, _number, code in native_process._WORKSPACE_PROVISIONING_ERRNOS
    ) == _EXPECTED_ERRNO_VERDICTS


@pytest.mark.parametrize(
    ("name", "expected_code", "expected_text"),
    (
        ("ENOMEM", "REFINE_ENGINE_SCRATCH_UNAVAILABLE", "(ENOMEM)"),
        ("EACCES", "REFINE_ENGINE_FAILED", "(EACCES)"),
        ("EROFS", "REFINE_ENGINE_FAILED", "(EROFS)"),
        ("EIO", "REFINE_ENGINE_FAILED", "(unclassified errno)"),
    ),
)
def test_the_provisioning_arm_uses_the_errno_verdict_it_was_given(
    tmp_path,
    monkeypatch,
    name,
    expected_code,
    expected_text,
):
    """The classifier being right is not enough: the ARM has to obey it.

    Under the root euid the gate containers run as, NO fatal-side condition can
    be constructed for real -- a mode-000 directory does not refuse root, EROFS
    needs a read-only mount and EPERM needs a capability -- so an arm that
    ignored the table and called every ``OSError`` a shortage would still pass
    every row that IS constructible there.  That is the exact defect being
    fixed, so it may not be invisible to the gate.

    The errno is injected at the second ``fstat``, the module's inspection of
    scratch it has ALREADY created: a real syscall that really can report each
    of these, on the far side of the open the real-condition rows above drive.
    What is asserted is the arm's verdict and wording, not the classifier's.
    """

    container = _container(tmp_path)
    real_fstat = os.fstat
    inspections = 0

    def refuse_the_second_inspection(descriptor):
        nonlocal inspections
        inspections += 1
        if inspections == 2:
            raise OSError(getattr(errno, name), f"synthetic {name}")
        return real_fstat(descriptor)

    monkeypatch.setattr(native_process.os, "fstat", refuse_the_second_inspection)
    with pytest.raises(AdapterError) as raised:
        provision_native_workspace_lease(
            str(container),
            deadline=RefineDeadline(time.monotonic() + 60.0),
        )
    monkeypatch.undo()

    assert raised.value.code == expected_code
    assert expected_text in str(raised.value)
    # The half-provisioned lease is still removed on every one of these paths.
    assert list(container.iterdir()) == []


def test_an_unenumerated_provisioning_errno_fails_closed():
    """The default is FATAL, and it is a DECISION rather than an oversight.

    ``_SCRATCH_UNAVAILABLE_CODE``'s own contract restricts it to "a resource the
    HOST failed to supply".  An errno nobody has reasoned about carries no
    evidence that it is one, so claiming it would be asserting the contract
    without measuring it -- and ``_FAILED_CODE`` is what this arm did before the
    split existed, so an unlisted errno cannot regress against that.  The
    mistake is self-announcing: the line says "unclassified errno", which is a
    one-line addition to the table rather than a quiet retry that ends in the
    same failure anyway.
    """

    for exc in (
        OSError(errno.EIO, "a genuinely unclassified condition"),
        OSError(errno.EBADF, "a defect in this module, not a shortage"),
        OSError("an OSError carrying no errno at all"),
    ):
        assert native_process._workspace_provisioning_refusal(exc) == (
            "unclassified errno",
            "REFINE_ENGINE_FAILED",
        )


def test_every_transported_lease_path_resolves_to_itself(tmp_path):
    """The exact check ``_validate_private_command_workspace`` performs."""

    with _leased_context(_container(tmp_path)) as (_lease, context):
        transported = [context.workspace_path()] + [
            context.workspace_subdirectory_path(name)
            for name in NATIVE_WORKSPACE_SUBDIRECTORIES
        ]
        for path in transported:
            candidate = Path(path)
            assert candidate.is_absolute()
            assert not path.startswith("/proc/self/fd")
            # This is the assertion the module contract promises and that item
            # 3's private-workspace validation performs verbatim.
            assert candidate.resolve(strict=True) == candidate


def test_the_leased_working_directory_passes_the_private_workspace_check(tmp_path):
    with _leased_context(_container(tmp_path)) as (_lease, context):
        work = Path(
            context.workspace_subdirectory_path(NATIVE_WORKSPACE_COMMAND_SUBDIRECTORY)
        )

        assert work.resolve(strict=True) == work
        # The parent created it, so it already exists; the supervisor must
        # accept a pre-existing owned 0700 directory it did not create.
        _validate_private_command_workspace(work, work / "point-triangulator.log")


def test_the_private_workspace_check_has_no_emptiness_precondition(tmp_path):
    """A previous phase's output must not make the next phase refuse to start.

    ``work/`` accumulates across the sequential command plan.  An emptiness
    precondition here would make phase 2 fail on phase 1's own artifacts, and
    the obvious "fix" -- a child-side ``rmdir`` -- would fight the parent's
    purge, which owns removal on every outcome including SIGKILL.
    """

    with _leased_context(_container(tmp_path)) as (_lease, context):
        work = Path(
            context.workspace_subdirectory_path(NATIVE_WORKSPACE_COMMAND_SUBDIRECTORY)
        )
        (work / "database-v1.db").write_bytes(b"phase one output")
        (work / "triangulated").mkdir(mode=0o700)

        _validate_private_command_workspace(work, work / "phase-two.log")


# ---------------------------------------------------------------------------
# Three surfaces, not one
# ---------------------------------------------------------------------------


def test_the_leased_plan_binds_three_distinct_surfaces(tmp_path):
    with _leased_context(_container(tmp_path)) as (lease, context):
        with _toolchain(tmp_path) as toolchain:
            execution = plan_leased_supervised_command(
                toolchain,
                context,
                command=_lease_argv(toolchain.identity.path, lease.path),
            )

            assert execution.workspace == lease.path
            assert (
                execution.cwd == f"{lease.path}/{NATIVE_WORKSPACE_COMMAND_SUBDIRECTORY}"
            )
            assert (
                execution.temp_directory
                == f"{lease.path}/{NATIVE_WORKSPACE_TEMP_SUBDIRECTORY}"
            )
            assert (
                execution.environment()["TMPDIR"]
                == f"{lease.path}/{NATIVE_WORKSPACE_TEMP_SUBDIRECTORY}"
            )
            # The three are genuinely different directories, not aliases.
            assert (
                len({execution.workspace, execution.cwd, execution.temp_directory}) == 3
            )


def test_the_confinement_root_admits_the_extracted_packet(tmp_path):
    """``--image_path <lease>/packet/images`` is the whole point of the split."""

    with _leased_context(_container(tmp_path)) as (lease, context):
        with _toolchain(tmp_path) as toolchain:
            execution = plan_leased_supervised_command(
                toolchain,
                context,
                command=_lease_argv(toolchain.identity.path, lease.path),
            )

            image_path = execution.argv[execution.argv.index("--image_path") + 1]
            assert image_path == (
                f"{lease.path}/{NATIVE_WORKSPACE_PACKET_SUBDIRECTORY}/images"
            )
            assert not Path(image_path).is_relative_to(Path(execution.cwd))


def test_a_work_rooted_confinement_would_reject_the_extracted_packet(tmp_path):
    """The regression this integration closed, stated as an executable fact.

    Rooting confinement at the working directory -- which is what a single
    ``workspace`` string forced once ``cwd`` became ``<lease>/work`` -- refuses
    the packet the extractor just wrote.
    """

    with _leased_context(_container(tmp_path)) as (lease, context):
        work = Path(
            context.workspace_subdirectory_path(NATIVE_WORKSPACE_COMMAND_SUBDIRECTORY)
        )
        with _toolchain(tmp_path) as toolchain:
            with pytest.raises(AdapterError) as raised:
                plan_pinned_colmap_command(
                    _lease_argv(toolchain.identity.path, lease.path),
                    toolchain=toolchain,
                    workspace=work,
                    remaining_seconds=lambda: 600.0,
                    descriptor_exec=False,
                )

    assert str(raised.value) == (
        "pinned COLMAP path option must stay inside its workspace"
    )


def test_the_confinement_root_still_rejects_a_path_outside_the_lease(tmp_path):
    outside = tmp_path / "outside"
    outside.mkdir()

    with _leased_context(_container(tmp_path)) as (lease, context):
        argv = list(_lease_argv("PLACEHOLDER", lease.path))
        argv[argv.index("--image_path") + 1] = str(outside / "images")
        with _toolchain(tmp_path) as toolchain:
            argv[0] = toolchain.identity.path
            with pytest.raises(AdapterError) as raised:
                plan_leased_supervised_command(toolchain, context, command=tuple(argv))

    assert str(raised.value) == (
        "pinned COLMAP path option must stay inside its workspace"
    )


def test_the_lease_root_itself_is_not_a_legal_option_value(tmp_path):
    """Renamed, because per-option confinement changed what this proves.

    While all four options shared one confinement root, ``<lease>`` *was* that
    root and this case pinned the ``candidate == workspace`` clause.  Rooting
    ``--output_path`` at ``<lease>/work`` moved the lease root outside its
    surface, so the same input is now refused by ``is_relative_to`` instead and
    the equality clause needs its own inputs -- one per surface, in
    :func:`test_a_surface_root_itself_is_not_a_legal_option_value` below.  The
    case is still worth keeping: it is the "one directory up" shape, and it is
    the only one here that names the lease root itself.
    """

    with _leased_context(_container(tmp_path)) as (lease, context):
        argv = list(_lease_argv("PLACEHOLDER", lease.path))
        argv[argv.index("--output_path") + 1] = lease.path
        with _toolchain(tmp_path) as toolchain:
            argv[0] = toolchain.identity.path
            with pytest.raises(AdapterError) as raised:
                plan_leased_supervised_command(toolchain, context, command=tuple(argv))

    assert str(raised.value) == (
        "pinned COLMAP path option must stay inside its workspace"
    )


@pytest.mark.parametrize(
    ("option", "surface"),
    (
        pytest.param(
            "--output_path", NATIVE_WORKSPACE_COMMAND_SUBDIRECTORY, id="output-work"
        ),
        pytest.param(
            "--database_path", NATIVE_WORKSPACE_COMMAND_SUBDIRECTORY, id="database-work"
        ),
        pytest.param(
            "--input_path", NATIVE_WORKSPACE_COMMAND_SUBDIRECTORY, id="input-work"
        ),
        pytest.param(
            "--image_path", NATIVE_WORKSPACE_PACKET_SUBDIRECTORY, id="image-packet"
        ),
    ),
)
def test_a_surface_root_itself_is_not_a_legal_option_value(tmp_path, option, surface):
    """An option must name something *in* its surface, never the surface.

    The behavioural stake is small -- ``--output_path <lease>/work`` writes into
    the writable surface anyway, ``--database_path <lease>/work`` would open a
    directory as a SQLite file and fail at runtime, ``--image_path
    <lease>/packet`` reads the packet root -- but the clause that refuses it is
    a real disjunct of the guard, and after the per-option split nothing else
    reached it: ``is_relative_to`` admits a path equal to its own root.
    """

    with _leased_context(_container(tmp_path)) as (lease, context):
        with _toolchain(tmp_path) as toolchain:
            argv = _with_option(
                _lease_argv(toolchain.identity.path, lease.path),
                option,
                f"{lease.path}/{surface}",
            )
            with pytest.raises(AdapterError) as raised:
                plan_leased_supervised_command(toolchain, context, command=argv)

    assert str(raised.value) == (
        "pinned COLMAP path option must stay inside its workspace"
    )


@pytest.mark.parametrize(
    ("option", "declared", "reached"),
    (
        pytest.param(
            "--output_path",
            NATIVE_WORKSPACE_COMMAND_SUBDIRECTORY,
            f"{NATIVE_WORKSPACE_PACKET_SUBDIRECTORY}/images",
            id="output-into-the-packet",
        ),
        pytest.param(
            "--database_path",
            NATIVE_WORKSPACE_COMMAND_SUBDIRECTORY,
            f"{NATIVE_WORKSPACE_PACKET_SUBDIRECTORY}/manifest.json",
            id="database-into-the-packet",
        ),
        pytest.param(
            "--output_path",
            NATIVE_WORKSPACE_COMMAND_SUBDIRECTORY,
            f"{NATIVE_WORKSPACE_TEMP_SUBDIRECTORY}/triangulated",
            id="output-into-the-scratch-surface",
        ),
        pytest.param(
            "--image_path",
            NATIVE_WORKSPACE_PACKET_SUBDIRECTORY,
            f"{NATIVE_WORKSPACE_COMMAND_SUBDIRECTORY}/images",
            id="image-into-work",
        ),
    ),
)
def test_a_path_option_may_not_traverse_out_of_its_surface(
    tmp_path, option, declared, reached
):
    """F-1 reopened by traversal instead of by direct naming.

    ``--output_path <lease>/work/../packet/images`` is *lexically relative to*
    ``<lease>/work``, so per-option confinement's ``is_relative_to`` check
    admits it; it is canonical as a string, so the ``as_posix`` check admits it;
    and it is not equal to its root.  Only the ``".."`` rejection keeps the
    reconstruction off the extracted source images.  Delete that one disjunct
    and every row here is accepted and sealed into a plan.

    The direct-naming form of the same write is covered by
    :func:`test_the_packet_is_not_a_legal_output_target`; these rows exist
    because that form is caught by a *different* clause and therefore proves
    nothing about this one.
    """

    with _leased_context(_container(tmp_path)) as (lease, context):
        value = f"{lease.path}/{declared}/../{reached}"
        # Not vacuous: the value really does resolve into another surface, so a
        # missing ".." rejection is a real escape and not a naming quibble.
        assert os.path.normpath(value) == f"{lease.path}/{reached}"
        assert not Path(os.path.normpath(value)).is_relative_to(
            Path(f"{lease.path}/{declared}")
        )
        with _toolchain(tmp_path) as toolchain:
            argv = _with_option(
                _lease_argv(toolchain.identity.path, lease.path), option, value
            )
            with pytest.raises(AdapterError) as raised:
                plan_leased_supervised_command(toolchain, context, command=argv)

    assert str(raised.value) == (
        "pinned COLMAP path option must stay inside its workspace"
    )


# ---------------------------------------------------------------------------
# The packet is a read-only input surface; work/ is the only writable one
# ---------------------------------------------------------------------------
#
# Widening the confinement root from ``<lease>/work`` to the lease root made
# ``packet/`` a legal value for EVERY path option, not just ``--image_path``.
# The four options are not interchangeable: two of them are where COLMAP
# *writes*, and pointing either at ``packet/`` puts the reconstruction on top of
# the hash-validated extracted source images the evidence builder later binds
# to.  Each option is therefore rooted at the one surface it belongs to.


def test_the_packet_is_not_a_legal_output_target(tmp_path):
    """The confirmed F-1 probe: ``--output_path`` over the extracted images."""

    with _leased_context(_container(tmp_path)) as (lease, context):
        with _toolchain(tmp_path) as toolchain:
            argv = _with_option(
                _lease_argv(toolchain.identity.path, lease.path),
                "--output_path",
                f"{lease.path}/{NATIVE_WORKSPACE_PACKET_SUBDIRECTORY}/images",
            )
            with pytest.raises(AdapterError) as raised:
                plan_leased_supervised_command(toolchain, context, command=argv)

    assert str(raised.value) == (
        "pinned COLMAP path option must stay inside its workspace"
    )


def test_the_packet_is_not_a_legal_database_target(tmp_path):
    """``--database_path`` is opened read-write; it may not name the packet."""

    with _leased_context(_container(tmp_path)) as (lease, context):
        with _toolchain(tmp_path) as toolchain:
            argv = _with_option(
                _lease_argv(toolchain.identity.path, lease.path),
                "--database_path",
                f"{lease.path}/{NATIVE_WORKSPACE_PACKET_SUBDIRECTORY}/database-v1.db",
            )
            with pytest.raises(AdapterError) as raised:
                plan_leased_supervised_command(toolchain, context, command=argv)

    assert str(raised.value) == (
        "pinned COLMAP path option must stay inside its workspace"
    )


def test_no_write_option_may_name_the_scratch_surface_either(tmp_path):
    """``tmp/`` is TMPDIR, not an engine artifact surface."""

    with _leased_context(_container(tmp_path)) as (lease, context):
        with _toolchain(tmp_path) as toolchain:
            argv = _with_option(
                _lease_argv(toolchain.identity.path, lease.path),
                "--output_path",
                f"{lease.path}/{NATIVE_WORKSPACE_TEMP_SUBDIRECTORY}/triangulated",
            )
            with pytest.raises(AdapterError) as raised:
                plan_leased_supervised_command(toolchain, context, command=argv)

    assert str(raised.value) == (
        "pinned COLMAP path option must stay inside its workspace"
    )


def test_the_image_surface_may_not_be_moved_out_of_the_packet(tmp_path):
    """The packet is the only place engine images are allowed to come from."""

    with _leased_context(_container(tmp_path)) as (lease, context):
        with _toolchain(tmp_path) as toolchain:
            argv = _with_option(
                _lease_argv(toolchain.identity.path, lease.path),
                "--image_path",
                f"{lease.path}/{NATIVE_WORKSPACE_COMMAND_SUBDIRECTORY}/images",
            )
            with pytest.raises(AdapterError) as raised:
                plan_leased_supervised_command(toolchain, context, command=argv)

    assert str(raised.value) == (
        "pinned COLMAP path option must stay inside its workspace"
    )


def test_the_seed_model_is_read_from_work_not_the_packet(tmp_path):
    """``--input_path`` reads ``pycolmap.build_known_pose_seed``'s own output.

    The I87 primary plan constructs the known-pose seed model in-process and
    writes it under ``work/``; the packet universe is a declared request, engine
    images, and at most one source and one adapter ledger.  No model seed ships
    in the packet, so ``--input_path`` is rooted at ``work/`` with the other two
    child-produced surfaces rather than at the read-only input surface.
    """

    with _leased_context(_container(tmp_path)) as (lease, context):
        with _toolchain(tmp_path) as toolchain:
            argv = _with_option(
                _lease_argv(toolchain.identity.path, lease.path),
                "--input_path",
                f"{lease.path}/{NATIVE_WORKSPACE_PACKET_SUBDIRECTORY}/seed",
            )
            with pytest.raises(AdapterError) as raised:
                plan_leased_supervised_command(toolchain, context, command=argv)

    assert str(raised.value) == (
        "pinned COLMAP path option must stay inside its workspace"
    )


def test_each_path_option_declares_the_one_surface_it_belongs_to():
    """The spec is a per-option mapping, not one shared confinement root."""

    spec = COLMAP_COMMAND_ALLOWLIST["point_triangulator"]

    assert dict(spec.workspace_path_options) == {
        "--database_path": NATIVE_WORKSPACE_COMMAND_SUBDIRECTORY,
        "--image_path": NATIVE_WORKSPACE_PACKET_SUBDIRECTORY,
        "--input_path": NATIVE_WORKSPACE_COMMAND_SUBDIRECTORY,
        "--output_path": NATIVE_WORKSPACE_COMMAND_SUBDIRECTORY,
    }
    # Every declared surface is a real leased subdirectory, so no option can be
    # rooted at a directory the parent never provisions.
    assert set(spec.workspace_path_options.values()) <= set(
        NATIVE_WORKSPACE_SUBDIRECTORIES
    )


def test_the_packet_extractor_precondition_holds_again(tmp_path):
    """``packet/`` is the surface "nothing else writes" -- provably, now.

    ``refine_packet_extractor`` states an empty-at-borrow precondition for
    ``packet/`` on the grounds that nothing else writes it.  While every path
    option shared one confinement root that statement was false: a sealed,
    supervisor-acceptable plan could name ``packet/`` as its output.  This test
    is the executable form of the extractor's claim.
    """

    with _leased_context(_container(tmp_path)) as (lease, context):
        packet = f"{lease.path}/{NATIVE_WORKSPACE_PACKET_SUBDIRECTORY}"
        with _toolchain(tmp_path) as toolchain:
            base = _lease_argv(toolchain.identity.path, lease.path)
            for option in ("--database_path", "--output_path"):
                with pytest.raises(AdapterError):
                    plan_leased_supervised_command(
                        toolchain,
                        context,
                        command=_with_option(base, option, f"{packet}/written"),
                    )

            # The one read-only use of the packet still plans.
            execution = plan_leased_supervised_command(
                toolchain, context, command=base
            )
            assert execution.argv[execution.argv.index("--image_path") + 1] == (
                f"{packet}/images"
            )


# ---------------------------------------------------------------------------
# The supervisor binds cwd, not the confinement root
# ---------------------------------------------------------------------------


def test_the_supervisor_binds_the_leased_working_directory(tmp_path):
    with _leased_context(_container(tmp_path)) as (lease, context):
        work = Path(
            context.workspace_subdirectory_path(NATIVE_WORKSPACE_COMMAND_SUBDIRECTORY)
        )
        with _toolchain(tmp_path) as toolchain:
            execution = plan_leased_supervised_command(
                toolchain,
                context,
                command=_lease_argv(toolchain.identity.path, lease.path),
            )

            assert _validate_pinned_execution(execution, work) == execution.argv

            # The lease root is not an acceptable cwd for this plan even though
            # it is the confinement root every argv path lives under.
            with pytest.raises(AdapterError) as raised:
                _validate_pinned_execution(execution, Path(lease.path))

    assert str(raised.value) == (
        "pinned COLMAP execution was planned for a different working directory"
    )


def test_planning_never_creates_or_removes_a_lease_subdirectory(tmp_path):
    """The parent owns the tree; the child-side planner only reads paths."""

    with _leased_context(_container(tmp_path)) as (lease, context):
        before = sorted(os.listdir(lease.path))
        with _toolchain(tmp_path) as toolchain:
            plan_leased_supervised_command(
                toolchain,
                context,
                command=_lease_argv(toolchain.identity.path, lease.path),
            )

        assert sorted(os.listdir(lease.path)) == before
        assert before == sorted(NATIVE_WORKSPACE_SUBDIRECTORIES)


def test_leased_planning_requires_the_carried_native_context(tmp_path):
    with _toolchain(tmp_path) as toolchain:
        with pytest.raises(AdapterError) as raised:
            plan_leased_colmap_command(
                (toolchain.identity.path, "point_triangulator"),
                toolchain=toolchain,
                context=object(),
                deadline=RefineDeadline(time.monotonic() + 600.0),
            )

    assert str(raised.value) == (
        "leased COLMAP planning requires the carried native child context"
    )


def test_leased_planning_fails_closed_without_a_lease(tmp_path):
    """A context that never received a lease cannot be planned against."""

    with _toolchain(tmp_path) as toolchain:
        with pytest.raises(AdapterError) as raised:
            plan_leased_colmap_command(
                (toolchain.identity.path, "point_triangulator"),
                toolchain=toolchain,
                context=NativeChildContext(time.monotonic() + 600.0),
                deadline=RefineDeadline(time.monotonic() + 600.0),
            )

    assert str(raised.value) == "native child workspace lease path is unavailable"


# ---------------------------------------------------------------------------
# One argv byte budget, shared by the two layers that spend it
# ---------------------------------------------------------------------------
#
# The lease provisioner used to accept a container path up to 4096 bytes while
# the command layer capped every argv item at 1024.  A scratch root in the gap
# provisioned cleanly and then made every COLMAP command permanently
# unplannable, with an error naming neither the lease nor the operator's
# configuration.  The gap is not reachable on macOS -- PATH_MAX there is 1024,
# which is exactly why every macOS gate missed it -- so these tests stay under
# that limit on purpose and still straddle the old dead zone.

#: Every ``/<surface>/<name>`` tail the reviewed I87 operation plan and the
#: seven-descriptor output design put on the far side of a lease root.
REVIEWED_ARGV_TAILS = (
    f"/{NATIVE_WORKSPACE_PACKET_SUBDIRECTORY}/images",
    f"/{NATIVE_WORKSPACE_COMMAND_SUBDIRECTORY}/adapter-v2.json",
    f"/{NATIVE_WORKSPACE_COMMAND_SUBDIRECTORY}/pairs-v2.txt",
    f"/{NATIVE_WORKSPACE_COMMAND_SUBDIRECTORY}/database-v1.db",
    f"/{NATIVE_WORKSPACE_COMMAND_SUBDIRECTORY}/seed-model-v1.tar",
    f"/{NATIVE_WORKSPACE_COMMAND_SUBDIRECTORY}/aligned-sparse-model-v1.tar",
    f"/{NATIVE_WORKSPACE_COMMAND_SUBDIRECTORY}/engine-command-evidence-v1.json",
    # The seventh transported descriptor: the scratch raw pre-BA snapshot.  It is
    # never published, but the engine writes it under an argv path like every
    # other output, so it spends the same reserve.
    f"/{NATIVE_WORKSPACE_COMMAND_SUBDIRECTORY}/raw-triangulated-model-snapshot-v1.tar",
    f"/{NATIVE_WORKSPACE_COMMAND_SUBDIRECTORY}/triangulated",
)

LONGEST_REVIEWED_ARGV_TAIL = max(REVIEWED_ARGV_TAILS, key=len)

#: The longest container path that can still host a lease: the root is the
#: container plus ``/`` plus a fixed-width scratch name.
MAX_ACCEPTED_CONTAINER_BYTES = (
    NATIVE_WORKSPACE_MAX_PATH_BYTES - NATIVE_WORKSPACE_NAME_BYTES - 1
)


def _container_of_length(tmp_path: Path, path_bytes: int) -> Path:
    """Build a canonical private container whose path is exactly ``path_bytes``.

    Components stay well under ``NAME_MAX`` and the whole path stays under the
    1024-byte macOS ``PATH_MAX``, so this runs identically on both gates.
    """

    container = tmp_path / "lease-container"
    container.mkdir(mode=0o700, exist_ok=True)
    if len(os.fsencode(str(container))) > path_bytes:
        raise AssertionError("tmp_path is already longer than the requested container")
    while True:
        remaining = path_bytes - len(os.fsencode(str(container))) - 1
        if remaining <= 0:
            break
        container = container / ("p" * min(remaining, 200))
        container.mkdir(mode=0o700)
    assert len(os.fsencode(str(container))) == path_bytes
    return container


def test_the_lease_bound_leaves_room_for_the_longest_reviewed_argv_tail():
    """The two bounds are one budget, stated as arithmetic rather than hope."""

    assert NATIVE_WORKSPACE_MAX_ARGV_ITEM_BYTES == _MAX_OPTION_VALUE_BYTES
    assert (
        NATIVE_WORKSPACE_MAX_PATH_BYTES + NATIVE_WORKSPACE_MAX_ARGV_PATH_TAIL_BYTES
        == NATIVE_WORKSPACE_MAX_ARGV_ITEM_BYTES
    )
    assert (
        NATIVE_WORKSPACE_MAX_PATH_BYTES + len(LONGEST_REVIEWED_ARGV_TAIL)
        <= _MAX_OPTION_VALUE_BYTES
    )


def test_every_reviewed_argv_tail_fits_the_reserved_suffix_budget():
    """The reserve is a floor for the whole reviewed artifact universe."""

    for tail in REVIEWED_ARGV_TAILS:
        assert len(os.fsencode(tail)) <= NATIVE_WORKSPACE_MAX_ARGV_PATH_TAIL_BYTES


def test_the_whole_output_universe_is_enrolled_in_the_argv_tail_budget():
    """The budget above only fails closed for tails somebody remembered to list.

    Enrolling the seven-descriptor output universe programmatically is what stops
    a new engine output from being added to the transport, given to COLMAP as an
    argv path, and never measured against the reserve.
    """

    from patina_scan_worker.refine_native_process import NATIVE_ENGINE_OUTPUT_TOKENS

    enrolled = set(REVIEWED_ARGV_TAILS)
    for token in NATIVE_ENGINE_OUTPUT_TOKENS:
        assert (
            f"/{NATIVE_WORKSPACE_COMMAND_SUBDIRECTORY}/{token}" in enrolled
        ), f"engine output {token} is not enrolled in REVIEWED_ARGV_TAILS"


def test_a_container_that_cannot_host_a_usable_command_is_refused(tmp_path):
    """The confirmed F-3 probe: provisioning must not mint an unusable lease."""

    container = _container_of_length(tmp_path, MAX_ACCEPTED_CONTAINER_BYTES + 1)

    with pytest.raises(AdapterError) as raised:
        provision_native_workspace_lease(
            str(container),
            deadline=RefineDeadline(time.monotonic() + 600.0),
        )

    message = str(raised.value)
    # Operator-actionable: the actual and the maximum, in bytes.
    assert str(NATIVE_WORKSPACE_MAX_PATH_BYTES + 1) in message
    assert str(NATIVE_WORKSPACE_MAX_PATH_BYTES) in message
    assert "scratch" in message


def test_the_refusal_leaves_nothing_behind(tmp_path):
    """An over-long container is refused before any directory is created."""

    container = _container_of_length(tmp_path, MAX_ACCEPTED_CONTAINER_BYTES + 40)

    with pytest.raises(AdapterError):
        provision_native_workspace_lease(
            str(container),
            deadline=RefineDeadline(time.monotonic() + 600.0),
        )

    assert os.listdir(container) == []


@pytest.mark.parametrize("offset", (-600, -300, -1, 0, 1, 2, 40, 63, 127))
def test_every_lease_the_parent_provisions_can_host_the_real_command(
    tmp_path, offset
):
    """The joint invariant: what provisioning accepts, planning must accept.

    Anything else is the F-3 shape -- a lease that exists but can never carry a
    command -- and it is the reason this is a property over the whole length
    range rather than a single probe.
    """

    container = _container_of_length(tmp_path, MAX_ACCEPTED_CONTAINER_BYTES + offset)
    if offset > 0:
        # Pinned, not merely tolerated: an over-long container must take the
        # refusal branch, so this half of the range cannot pass vacuously.
        with pytest.raises(AdapterError) as raised:
            provision_native_workspace_lease(
                str(container),
                deadline=RefineDeadline(time.monotonic() + 600.0),
            )
        assert "scratch" in str(raised.value)
        return
    lease = provision_native_workspace_lease(
        str(container),
        deadline=RefineDeadline(time.monotonic() + 600.0),
    )
    try:
        assert (
            len(os.fsencode(lease.path + LONGEST_REVIEWED_ARGV_TAIL))
            <= _MAX_OPTION_VALUE_BYTES
        )
        context = NativeChildContext(
            time.monotonic() + 600.0,
            _workspace_descriptor=lease.descriptor,
            _workspace_path=lease.path,
            _workspace_subdirectory_paths=MappingProxyType(
                {
                    name: os.path.join(lease.path, name)
                    for name in NATIVE_WORKSPACE_SUBDIRECTORIES
                }
            ),
        )
        with _toolchain(tmp_path) as toolchain:
            execution = plan_leased_supervised_command(
                toolchain,
                context,
                command=_lease_argv(toolchain.identity.path, lease.path),
            )
        assert execution.workspace == lease.path
    finally:
        _release_workspace_lease(lease, leader_quiescent=True)


# ---------------------------------------------------------------------------
# _validate_private_command_workspace: one input per refusing disjunct
#
# Before this section the only calls to this function anywhere in the suite
# were the two happy-path ones above, so every rejecting clause could be
# deleted with the whole suite still green.  Each test below is red without
# its clause and green with it.  Two disjuncts are deliberately absent:
#
# * ``stat.S_ISLNK(cwd_metadata.st_mode)`` can never be the sole reason -- no
#   st_mode is both S_IFDIR and S_IFLNK, so ``not S_ISDIR`` always fires first
#   on a symlink.  It is a redundant restatement, not a reachable clause.
# * the ``S_ISLNK`` case a reader expects (a symlinked *workspace*) is covered
#   by the ``resolved_cwd != cwd`` test, which is the clause that actually
#   catches it.
# ---------------------------------------------------------------------------


def _owned_private_dir(parent: Path, name: str) -> Path:
    """A 0700 directory whose mode does not depend on the runner's umask.

    ``mkdir(mode=0o700)`` is umask-proof because 0o700 carries no group or
    other bits for a umask to clear; this mirrors the explicit-mode fixture
    discipline the refine harness adopted after a stock ``umask 0002`` login
    shell collapsed the suite.
    """

    path = parent / name
    path.mkdir(mode=0o700)
    return path


def test_a_relative_command_workspace_is_refused(tmp_path):
    with pytest.raises(AdapterError) as raised:
        _validate_private_command_workspace(
            Path("relative/work"), Path("relative/work/phase.log")
        )

    assert str(raised.value) == (
        "COLMAP command workspace and log path must be absolute"
    )


def test_a_relative_command_log_path_is_refused(tmp_path):
    work = _owned_private_dir(Path(tmp_path).resolve(), "work")

    with pytest.raises(AdapterError) as raised:
        _validate_private_command_workspace(work, Path("phase.log"))

    assert str(raised.value) == (
        "COLMAP command workspace and log path must be absolute"
    )


def test_a_command_workspace_that_is_not_a_directory_is_refused(tmp_path):
    """Owned and 0700, but not a directory -- so only ``S_ISDIR`` refuses it.

    The mode matters: a file left at the default 0o644 is also refused by the
    ``S_IMODE != 0o700`` clause with the *same* message, and the test would
    then stay green with ``S_ISDIR`` deleted.
    """

    root = Path(tmp_path).resolve()
    regular_file = root / "work"
    regular_file.write_bytes(b"not a directory")
    os.chmod(regular_file, 0o700)

    metadata = os.lstat(regular_file)
    assert metadata.st_mode & 0o777 == 0o700
    assert metadata.st_uid == os.geteuid()

    with pytest.raises(AdapterError) as raised:
        _validate_private_command_workspace(regular_file, root / "phase.log")

    assert str(raised.value) == (
        "COLMAP command workspace must be an owned private 0700 directory"
    )


def test_a_command_workspace_owned_by_another_uid_is_refused(tmp_path, monkeypatch):
    """The uid clause, reached without needing a second real uid.

    An unprivileged test cannot create a directory it does not own, so the
    comparison is moved instead of the directory: the guard reads the effective
    uid through ``os.geteuid`` at call time.
    """

    work = _owned_private_dir(Path(tmp_path).resolve(), "work")
    monkeypatch.setattr(os, "geteuid", lambda: os.stat(work).st_uid + 1)

    with pytest.raises(AdapterError) as raised:
        _validate_private_command_workspace(work, work / "phase.log")

    assert str(raised.value) == (
        "COLMAP command workspace must be an owned private 0700 directory"
    )


def test_a_group_or_world_readable_command_workspace_is_refused(tmp_path):
    work = _owned_private_dir(Path(tmp_path).resolve(), "work")
    # chmod, not mkdir(mode=...): chmod ignores the umask, so this stays 0o755
    # under every umask the runner might carry.
    os.chmod(work, 0o755)

    with pytest.raises(AdapterError) as raised:
        _validate_private_command_workspace(work, work / "phase.log")

    assert str(raised.value) == (
        "COLMAP command workspace must be an owned private 0700 directory"
    )
    assert os.stat(work).st_mode & 0o777 == 0o755


def test_a_command_workspace_reached_through_a_symlink_is_refused(tmp_path):
    """``lstat`` does not follow *interior* components; ``resolve`` does.

    The final component here is a genuine owned 0700 directory, so every
    metadata clause is satisfied and only ``resolved_cwd != cwd`` refuses it.
    """

    root = Path(tmp_path).resolve()
    real = _owned_private_dir(root, "real")
    work = _owned_private_dir(real, "work")
    link = root / "link"
    link.symlink_to(real)
    reached = link / "work"

    assert reached.resolve(strict=True) == work
    assert reached != work

    with pytest.raises(AdapterError) as raised:
        _validate_private_command_workspace(reached, reached / "phase.log")

    assert str(raised.value) == (
        "COLMAP command workspace may not traverse a symlink"
    )


def test_a_command_log_outside_the_workspace_is_refused(tmp_path):
    work = _owned_private_dir(Path(tmp_path).resolve(), "work")
    nested = _owned_private_dir(work, "nested")

    with pytest.raises(AdapterError) as raised:
        _validate_private_command_workspace(work, nested / "phase.log")

    assert str(raised.value) == (
        "COLMAP command log must be a new direct workspace child"
    )


def test_an_existing_command_log_is_refused(tmp_path):
    """A phase may reuse ``work/``, but never an existing log path.

    ``test_the_private_workspace_check_has_no_emptiness_precondition`` proves
    the directory may carry a previous phase's artifacts; this proves the log
    itself is still required to be new, which is the other half of that clause.
    """

    work = _owned_private_dir(Path(tmp_path).resolve(), "work")
    log_path = work / "phase.log"
    log_path.write_bytes(b"an earlier phase already wrote here")

    with pytest.raises(AdapterError) as raised:
        _validate_private_command_workspace(work, log_path)

    assert str(raised.value) == (
        "COLMAP command log must be a new direct workspace child"
    )


# ---------------------------------------------------------------------------
# _validate_pinned_execution: the alias shape clauses
#
# The environ/descriptor halves of the same guard are not reachable through a
# real ``PinnedColmapCommand``: ``environment()`` is a dict comprehension and
# ``passed_descriptors()`` returns a tuple literal, and the preceding
# ``type(execution) is not PinnedColmapCommand`` check rules out an override.
# The alias is a plain carried field, so these two are reachable and are the
# ones worth pinning.
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("alias", "label"),
    (
        pytest.param(123, "a non-string", id="not-a-string"),
        pytest.param("", "empty", id="empty"),
    ),
)
def test_a_sealed_execution_with_an_unusable_alias_is_refused(tmp_path, alias, label):
    with _leased_context(_container(tmp_path)) as (lease, context):
        work = Path(
            context.workspace_subdirectory_path(NATIVE_WORKSPACE_COMMAND_SUBDIRECTORY)
        )
        with _toolchain(tmp_path) as toolchain:
            execution = plan_leased_supervised_command(
                toolchain,
                context,
                command=_lease_argv(toolchain.identity.path, lease.path),
            )
            # The plan is otherwise genuine and still authenticates: it keeps
            # its seal, its qualification and its working directory, so the
            # only clause left to refuse it is the alias shape.
            assert _validate_pinned_execution(execution, work) == execution.argv
            object.__setattr__(execution, "executable_alias", alias)
            assert execution.is_verified_pinned_command is True

            with pytest.raises(AdapterError) as raised:
                _validate_pinned_execution(execution, work)

    assert str(raised.value) == (
        "pinned COLMAP execution has an invalid environment or alias"
    )
