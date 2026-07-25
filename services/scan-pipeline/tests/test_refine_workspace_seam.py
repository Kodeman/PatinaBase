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
