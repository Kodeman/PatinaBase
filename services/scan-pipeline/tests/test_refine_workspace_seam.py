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


def _over_long_component_root(tmp_path: Path) -> str:
    """A single component past NAME_MAX, inside the module's own byte ceiling.

    This is the ONE fatal-side condition that constructs under a root euid, and
    it is here for that reason: every other fatal row needs a non-root uid, a
    read-only mount or a capability, so under the gate containers' root euid an
    arm that called every ``OSError`` a shortage could otherwise reach the errno
    table without a single fatal row proving it obeys the table.
    """

    root = str(tmp_path / ("n" * 300))
    assert len(os.fsencode(root)) < NATIVE_WORKSPACE_MAX_PATH_BYTES
    return root


#: ``(id, builder, errno, code, wording)``.  Every row builds its condition FOR
#: REAL -- a symlinked root, a self-looping root, a regular file, a FIFO, a
#: mode-000 directory, an over-long component, a path nobody created -- and
#: asserts the errno the real open actually produces BEFORE asserting the
#: verdict, so no row can drift into pinning an exception name instead of a
#: condition.
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
    (
        "over-long-component-root",
        _over_long_component_root,
        errno.ENAMETOOLONG,
        "REFINE_ENGINE_FAILED",
        "(ENAMETOOLONG)",
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


def _refusal(path) -> tuple[str, str]:
    with pytest.raises(AdapterError) as raised:
        provision_native_workspace_lease(
            str(path),
            deadline=RefineDeadline(time.monotonic() + 60.0),
        )
    return raised.value.code, str(raised.value)


def test_a_symlinked_root_over_a_mount_that_is_not_up_is_fatal_at_every_component(
    tmp_path,
):
    """The reopened half of the same asymmetry: the link's TARGET is absent.

    The test above builds both shapes over targets that exist.  With the target
    absent -- an operator who symlinked the scratch root at a mount that has not
    come up -- the two shapes produced different errnos and the errno decided
    the verdict:

    * final component is the link -> ``os.open`` gives ENOTDIR, refused fatally;
    * an intermediate component is the link -> ``os.open`` follows it, the
      absent target gives ENOENT, and ENOENT is retryable ON PURPOSE, to protect
      exactly the "mount is not up yet" case.

    So ONE operator mistake retried on one shape and died on the other, and the
    retryable one was the wrong terminal answer: once the mount comes up, both
    shapes are refused fatally anyway (the test above), so the disagreement was
    only ever about WHEN.  Deciding it before the open removes the errno from
    the question entirely.
    """

    absent = tmp_path / "mount-not-up"
    assert not absent.exists()

    final_link = tmp_path / "final-scratch-link"
    final_link.symlink_to(absent / "scratch", target_is_directory=True)

    middle_link = tmp_path / "middle-scratch-link"
    middle_link.symlink_to(absent, target_is_directory=True)

    # Not vacuous: the two shapes really do produce different errnos from the
    # module's own flags, which is what used to split the verdict.
    with pytest.raises(OSError) as final_open:
        os.open(str(final_link), native_process._workspace_directory_flags())
    assert final_open.value.errno == errno.ENOTDIR
    with pytest.raises(OSError) as middle_open:
        os.open(
            str(middle_link / "leases"), native_process._workspace_directory_flags()
        )
    assert middle_open.value.errno == errno.ENOENT

    fatal = (
        "REFINE_INPUT_INVALID",
        "native workspace parent directory must not traverse a symlink",
    )
    assert _refusal(final_link) == fatal
    assert _refusal(middle_link / "leases") == fatal


def test_a_plain_root_whose_mount_is_not_up_is_still_retryable(tmp_path):
    """The control for the test above, and the thing it must not have swept up.

    ENOENT sits on the retryable side to protect a root whose mount is not up.
    Deciding the SYMLINK question before the open must not turn that protection
    off for a root with no symlink anywhere in it.
    """

    absent = tmp_path / "mount-not-up" / "scratch"
    assert not absent.exists()
    assert os.path.realpath(str(absent)) == str(absent)

    code, message = _refusal(absent)
    assert code == "REFINE_ENGINE_SCRATCH_UNAVAILABLE"
    assert "(ENOENT)" in message


@pytest.mark.parametrize(
    "shape",
    ("final-symlink", "intermediate-symlink", "self-looping-root", "dotdot"),
)
def test_no_symlinked_root_shape_reaches_the_container_open_at_all(
    tmp_path, monkeypatch, shape
):
    """The ordering itself, because for one shape nothing else can prove it.

    A self-looping symlink used AS the root is the case where the two pre-open
    probes genuinely differ: MEASURED, ``S_ISLNK`` is true on it while non-strict
    ``realpath`` returns it unchanged, so only the ``S_ISLNK`` probe sees it --
    and the post-open ENOTDIR arm would reach the SAME verdict, so no assertion
    about the verdict can tell whether the decision was made before the open or
    after it.  This asserts the ordering directly: for every symlinked shape the
    container is never opened, which is what stops the errno from being part of
    the answer.
    """

    real = tmp_path / "real-scratch"
    (real / "leases").mkdir(mode=0o700, parents=True)
    if shape == "final-symlink":
        link = tmp_path / "final-link"
        link.symlink_to(real, target_is_directory=True)
        root = str(link)
    elif shape == "intermediate-symlink":
        link = tmp_path / "middle-link"
        link.symlink_to(real, target_is_directory=True)
        root = str(link / "leases")
    elif shape == "self-looping-root":
        loop = tmp_path / "loop"
        loop.symlink_to(loop)
        root = str(loop)
        # The measurement this shape exists for, stated where it is relied on.
        assert os.path.realpath(root) == root
    else:
        root = f"{real}/../{real.name}"

    real_open = os.open
    opened: list[str] = []

    def record_the_container_open(path, *args, **kwargs):
        if path == root:
            opened.append(path)
        return real_open(path, *args, **kwargs)

    monkeypatch.setattr(native_process.os, "open", record_the_container_open)
    code, message = _refusal(root)
    monkeypatch.undo()

    assert opened == []
    assert code == "REFINE_INPUT_INVALID"
    assert message == "native workspace parent directory must not traverse a symlink"
    assert sorted(os.listdir(real)) == ["leases"]


def test_the_post_open_checks_still_refuse_a_symlink_the_pre_check_missed(
    tmp_path, monkeypatch
):
    """The pre-open gate is a PRE-EMPTION, not a guarantee -- so prove the rest.

    Both pre-open probes are by name, so a root replaced between them and the
    open is not prevented there; nothing can be pinned by descriptor before the
    open, because the open is what produces the descriptor.  Blinding the gate
    is how that race is made deterministic, and what it has to show is that the
    answer does not change -- only which line reports it.

    Each shape below is refused by a DIFFERENT post-open guard: the final
    component by the open arm's own ENOTDIR translation, the intermediate one by
    the canonical-form check bound to the pinned descriptor.  Both messages are
    asserted exactly, because both guards raise the same exception class and
    ``REFINE_INPUT_INVALID`` alone cannot tell them apart.
    """

    monkeypatch.setattr(
        native_process,
        "_refuse_a_symlinked_workspace_container",
        lambda _parent_directory: None,
    )

    real = tmp_path / "real-scratch"
    (real / "leases").mkdir(mode=0o700, parents=True)
    final_link = tmp_path / "final-link"
    final_link.symlink_to(real, target_is_directory=True)
    middle_link = tmp_path / "middle-link"
    middle_link.symlink_to(real, target_is_directory=True)

    fatal = (
        "REFINE_INPUT_INVALID",
        "native workspace parent directory must not traverse a symlink",
    )
    assert _refusal(final_link) == fatal
    assert _refusal(middle_link / "leases") == fatal
    # Nothing was minted inside the container either link pointed at.
    assert sorted(os.listdir(real)) == ["leases"]
    assert sorted(os.listdir(real / "leases")) == []


#: Written out LITERALLY rather than read back off the module, so that deleting
#: a row from ``_WORKSPACE_PROVISIONING_ERRNOS`` turns this red instead of
#: silently shrinking the parametrization to match itself.
#:
#: The retryable rows are redundant with the module's default IN THE CODE THEY
#: PRODUCE, and are listed anyway so a reader cannot mistake a decision for an
#: oversight.  They are not redundant in the journal line: the default names the
#: condition "unclassified errno", so a dropped retryable row still costs the
#: operator the errno's name.  MEASURED by deleting rows against this whole gate
#: selection: dropping ``ESTALE`` reddens both this parametrization (the name
#: changes) and the table test, and dropping ``EACCES`` reddens those plus the
#: arm test, because for a fatal row the default changes the code as well.
_EXPECTED_ERRNO_VERDICTS = (
    ("ENOSPC", "REFINE_ENGINE_SCRATCH_UNAVAILABLE"),
    ("EDQUOT", "REFINE_ENGINE_SCRATCH_UNAVAILABLE"),
    ("EMFILE", "REFINE_ENGINE_SCRATCH_UNAVAILABLE"),
    ("ENFILE", "REFINE_ENGINE_SCRATCH_UNAVAILABLE"),
    ("ENOMEM", "REFINE_ENGINE_SCRATCH_UNAVAILABLE"),
    ("ENOENT", "REFINE_ENGINE_SCRATCH_UNAVAILABLE"),
    ("ESTALE", "REFINE_ENGINE_SCRATCH_UNAVAILABLE"),
    ("ETIMEDOUT", "REFINE_ENGINE_SCRATCH_UNAVAILABLE"),
    ("EAGAIN", "REFINE_ENGINE_SCRATCH_UNAVAILABLE"),
    ("EIO", "REFINE_ENGINE_SCRATCH_UNAVAILABLE"),
    ("EBUSY", "REFINE_ENGINE_SCRATCH_UNAVAILABLE"),
    ("ENETDOWN", "REFINE_ENGINE_SCRATCH_UNAVAILABLE"),
    ("ELOOP", "REFINE_ENGINE_FAILED"),
    ("ENOTDIR", "REFINE_ENGINE_FAILED"),
    ("EACCES", "REFINE_ENGINE_FAILED"),
    ("EPERM", "REFINE_ENGINE_FAILED"),
    ("EROFS", "REFINE_ENGINE_FAILED"),
    ("ENAMETOOLONG", "REFINE_ENGINE_FAILED"),
)

#: Errnos on NEITHER list, so they can only be answered by the default.  None of
#: them is reachable from this module's own syscalls in any way anybody has
#: constructed; that is the point -- the default is what an errno nobody
#: anticipated gets, and it has to be pinned by something nobody anticipated.
_UNLISTED_ERRNOS = ("EBADF", "EXDEV", "ENOTTY", "EPIPE", "ENOSYS")


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
    gate's own host, EROFS needs a read-only mount, EACCES/EPERM cannot be built
    under the root euid the gate containers run as, and the network-storage rows
    need network storage.  Those are pinned against the classifier directly;
    every condition that CAN be built -- including ENAMETOOLONG, which is the
    one fatal-side row that constructs under a root euid -- is additionally
    driven through the real function by
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


def test_the_two_sides_of_the_split_do_not_overlap():
    """No errno may be listed twice, and the fatal side is the enumerated one.

    The default answers the retryable side, so a fatal row that got dropped
    silently becomes retryable rather than becoming an error.  Stating the fatal
    set as its own literal is what makes that droppable-by-accident set explicit.
    """

    listed = [name for name, _code in _EXPECTED_ERRNO_VERDICTS]
    fatal = [
        name
        for name, code in _EXPECTED_ERRNO_VERDICTS
        if code == "REFINE_ENGINE_FAILED"
    ]

    assert len(listed) == len(set(listed))
    assert fatal == ["ELOOP", "ENOTDIR", "EACCES", "EPERM", "EROFS", "ENAMETOOLONG"]
    assert not set(listed) & set(_UNLISTED_ERRNOS)


@pytest.mark.parametrize(
    ("name", "expected_code", "expected_text"),
    (
        ("ENOMEM", "REFINE_ENGINE_SCRATCH_UNAVAILABLE", "(ENOMEM)"),
        ("ESTALE", "REFINE_ENGINE_SCRATCH_UNAVAILABLE", "(ESTALE)"),
        ("EIO", "REFINE_ENGINE_SCRATCH_UNAVAILABLE", "(EIO)"),
        ("EACCES", "REFINE_ENGINE_FAILED", "(EACCES)"),
        ("EROFS", "REFINE_ENGINE_FAILED", "(EROFS)"),
        ("ENAMETOOLONG", "REFINE_ENGINE_FAILED", "(ENAMETOOLONG)"),
        ("EBADF", "REFINE_ENGINE_SCRATCH_UNAVAILABLE", "(unclassified errno)"),
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


def test_an_errno_on_neither_list_defaults_to_the_recoverable_side():
    """The DEFAULT itself, pinned with errnos on neither list.

    This is the load-bearing decision in the arm, so it is asserted directly
    rather than inferred from a row that happens to be absent.  The default was
    FATAL for one revision, defended partly by "``_FAILED_CODE`` is what this
    arm did before the split existed".  Traced across the arm's history, that
    was true from ``beb34abd`` through ``7539c5e5`` and NOT true at
    ``f10eee2b``, the immediate parent and the actual diff base, where every
    ``OSError`` here raised ``REFINE_ENGINE_SCRATCH_UNAVAILABLE``.

    What the default rests on now is the asymmetry, which is measurable rather
    than historical: ``complete_agent_task`` fails a task once ``attempts >=
    max_attempts``, so calling a permanent condition retryable costs a bounded
    budget and then fails anyway, while calling a transient one fatal leaves
    nothing to re-run.  The line still says "unclassified errno", so the errno
    that should have had a row is still a one-line addition and not a silent
    retry.

    Not claimed: that these errnos are transient.  ``EBADF`` would be a defect
    in this module.  The claim is only that the recoverable side is where an
    unanticipated condition belongs.
    """

    unlisted = [
        OSError(getattr(errno, name), f"a condition with no row: {name}")
        for name in _UNLISTED_ERRNOS
    ]
    unlisted.append(OSError("an OSError carrying no errno at all"))
    for exc in unlisted:
        assert native_process._workspace_provisioning_refusal(exc) == (
            "unclassified errno",
            "REFINE_ENGINE_SCRATCH_UNAVAILABLE",
        ), exc


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
