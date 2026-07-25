"""The seam between the workspace lease and the pinned COLMAP toolchain.

These two foundations were built concurrently and could not be made
contract-compatible on either branch alone.  Everything here proves the joint,
not either half:

* the lease transports **three** distinct surfaces -- an argv confinement root,
  a working directory, and a scratch directory -- where the toolchain used to
  have one ``workspace`` string;
* the confinement root must be the lease root, or the extracted packet at
  ``<lease>/packet/images`` is refused by the very allowlist that is supposed to
  admit it;
* the transported path really does satisfy ``resolve(strict=True) == path``, the
  check the lease's own contract block promises and the toolchain's private
  workspace validation actually performs.

Nothing here enables, registers, or composes a Refine stage.
"""

from __future__ import annotations

import contextlib
import os
import time
from pathlib import Path
from types import MappingProxyType

import pytest

from patina_scan_worker.refine_adapter import AdapterError, RefineDeadline
from patina_scan_worker.refine_colmap_command import (
    _validate_pinned_execution,
    _validate_private_command_workspace,
)
from patina_scan_worker.refine_colmap_toolchain import (
    plan_leased_colmap_command,
    plan_pinned_colmap_command,
)
from patina_scan_worker.refine_native_process import (
    NATIVE_WORKSPACE_COMMAND_SUBDIRECTORY,
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
    """``O_NOFOLLOW`` already covered this shape -- and only this shape.

    A symlink as the *final* component of the container path fails the open with
    ``ELOOP``, which is why the gap below went unnoticed: the obvious test case
    was already green.
    """

    real = tmp_path / "real-scratch"
    real.mkdir(mode=0o700)
    link = tmp_path / "scratch-link"
    link.symlink_to(real, target_is_directory=True)

    with pytest.raises(AdapterError):
        provision_native_workspace_lease(
            str(link),
            deadline=RefineDeadline(time.monotonic() + 60.0),
        )

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


def test_the_confinement_root_itself_is_still_not_an_argv_value(tmp_path):
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
