"""Shared fixtures for the pinned COLMAP toolchain contract.

These helpers build a *fake* installed COLMAP prefix so the executable-identity,
allowlist, and environment contracts can be exercised without the qualified
DeskDev host.  They deliberately go through the real loader/planner rather than
constructing :class:`PinnedColmapCommand` directly: an unsealed lookalike is
rejected by the supervisor, which is itself part of the contract under test.
"""

from __future__ import annotations

import contextlib
import hashlib
import json
import os
import sys
import time
from pathlib import Path, PurePosixPath

from patina_scan_worker import refine_colmap_toolchain as toolchain_module
from patina_scan_worker.refine_colmap_toolchain import (
    QUALIFIED_APP_DIR,
    QUALIFIED_COLMAP_BUILD_BANNER,
    QUALIFIED_COLMAP_PREFIX,
    QUALIFIED_COLMAP_SOURCE_COMMIT,
    QUALIFIED_COLMAP_SOURCE_TREE,
    QUALIFIED_COLMAP_VERSION,
    QUALIFIED_CUDA_ARCHITECTURE,
    QUALIFIED_CUDA_RELEASE,
    QUALIFIED_CUDA_ROOT,
    QUALIFIED_HOST_C_COMPILER,
    QUALIFIED_HOST_COMPILER_SERIES,
    QUALIFIED_HOST_CXX_COMPILER,
    QUALIFIED_NVCC_VERSION,
    QUALIFIED_NVIDIA_DRIVER_VERSION,
    QUALIFIED_PYCOLMAP_VERSION,
    TOOLCHAIN_MANIFEST_RELATIVE_PATH,
    TOOLCHAIN_MANIFEST_SCHEMA,
    ColmapToolchain,
    PinnedColmapCommand,
    QualifiedBoxLocation,
    load_colmap_toolchain,
    plan_pinned_colmap_command,
)

#: Captured at import, before any test patches ``sys.platform`` to fake the
#: Linux-only supervisor host.  The descriptor alias is a real-host question.
_HOST_PLATFORM = sys.platform

FAKE_DIGEST = "0" * 64
QUALIFIED_MANIFEST_FIELDS = {
    "appDir": QUALIFIED_APP_DIR,
    "colmapBuildBanner": QUALIFIED_COLMAP_BUILD_BANNER,
    "colmapExecutableSha256": "1" * 64,
    "colmapExecutableSizeBytes": 4096,
    "colmapPrefix": QUALIFIED_COLMAP_PREFIX,
    "colmapSourceCommit": QUALIFIED_COLMAP_SOURCE_COMMIT,
    "colmapSourceTree": QUALIFIED_COLMAP_SOURCE_TREE,
    "colmapVersion": QUALIFIED_COLMAP_VERSION,
    "cudaArchitecture": QUALIFIED_CUDA_ARCHITECTURE,
    "cudaRelease": QUALIFIED_CUDA_RELEASE,
    "cudaRoot": QUALIFIED_CUDA_ROOT,
    "hostCCompiler": QUALIFIED_HOST_C_COMPILER,
    "hostCompilerVersion": QUALIFIED_HOST_COMPILER_SERIES,
    "hostCxxCompiler": QUALIFIED_HOST_CXX_COMPILER,
    "nvccVersion": QUALIFIED_NVCC_VERSION,
    "nvidiaDriverVersion": QUALIFIED_NVIDIA_DRIVER_VERSION,
    "pycolmapVersion": QUALIFIED_PYCOLMAP_VERSION,
    "pycolmapWheelSha256": "2" * 64,
    "schema": TOOLCHAIN_MANIFEST_SCHEMA,
}


def canonical_manifest_bytes(fields: dict[str, object]) -> bytes:
    return (
        json.dumps(fields, sort_keys=True, separators=(",", ":"), ensure_ascii=True)
        + "\n"
    ).encode("ascii")


def qualified_manifest_fields(**overrides: object) -> dict[str, object]:
    fields = dict(QUALIFIED_MANIFEST_FIELDS)
    fields.update(overrides)
    return fields


#: How long :func:`age_past_the_inode_timestamp_tick` will wait for the
#: filesystem clock to move.  One coarse Linux tick is 1 ms; five seconds is a
#: failure, not a slow machine.
_CTIME_TICK_TIMEOUT_S = 5.0


def age_past_the_inode_timestamp_tick(reference_ns: int, *, near: Path) -> None:
    """Block until the filesystem clock has moved strictly past ``reference_ns``.

    ``st_ctime_ns`` granularity is per-filesystem: about 23 us on macOS/APFS but
    a full **1.0 ms on Linux** (ext4/overlayfs -- what the container gate and the
    qualified box both run).  A fixture that creates the fake COLMAP binary and
    lets the caller stat it inside one coarse tick hands every same-tick write
    an *identical* ``st_ctime_ns``/``st_mtime_ns``, so the timestamp half of
    ``verify_executable_identity`` observes no change at all.  Measured on the
    unaged fixture: an in-place ``pwrite`` went undetected 78/100 and 75/100
    times on Linux, and 0/50 times on macOS -- which is exactly why the F1
    regression tests looked green on a developer laptop while being vacuous in
    the container.

    Production never has that shape: the recorded baseline is the installed
    binary's own last inode-change time, i.e. install time on a real box, so any
    later write lands in a strictly later tick.  Giving the fixture the same
    property is therefore restoring realism, not weakening the check -- deleting
    the ``st_ctime_ns`` comparison from ``verify_executable_identity`` still
    turns those tests red.

    The probe is a *separate* inode: touching the binary itself would only move
    its own ctime into the current tick and leave the same-tick question open.
    Creating a fresh file until its ctime exceeds ``reference_ns`` proves the
    clock itself has advanced beyond the tick the binary was written in.
    """

    if type(reference_ns) is not int:
        raise TypeError("the inode-timestamp reference must be an exact int")
    probe = near / f".ctime-tick-probe-{os.getpid()}"
    stop = time.monotonic() + _CTIME_TICK_TIMEOUT_S
    try:
        while True:
            # Unlink first: a fresh inode is guaranteed to carry the current
            # coarse clock, whereas rewriting a same-size file need not.
            try:
                probe.unlink()
            except FileNotFoundError:
                pass
            probe.write_bytes(b"")
            if probe.stat().st_ctime_ns > reference_ns:
                return
            if time.monotonic() >= stop:
                raise AssertionError(
                    "the filesystem clock never moved past the fake COLMAP "
                    "binary's ctime; the executable-identity regression tests "
                    "would be silently vacuous"
                )
            time.sleep(0.0005)
    finally:
        try:
            probe.unlink()
        except FileNotFoundError:
            pass


def write_toolchain(
    prefix: Path,
    *,
    program: str = "print('done')",
    manifest_overrides: dict[str, object] | None = None,
    manifest_bytes: bytes | None = None,
    executable_mode: int = 0o755,
) -> Path:
    """Install a fake COLMAP prefix whose manifest matches its binary.

    The installed binary is aged past its own ctime tick before this returns --
    see :func:`age_past_the_inode_timestamp_tick` for why a fixture that skips
    that makes the in-place-byte-swap tests pass without testing anything.
    """

    binary = prefix / "bin" / "colmap"
    binary.parent.mkdir(parents=True, exist_ok=True)
    binary.write_text(f"#!{sys.executable}\n{program}\n", encoding="utf-8")
    binary.chmod(executable_mode)
    payload = binary.read_bytes()

    manifest_path = prefix / TOOLCHAIN_MANIFEST_RELATIVE_PATH
    manifest_path.parent.mkdir(parents=True, exist_ok=True)
    if manifest_bytes is None:
        fields = {
            "appDir": str(prefix / "app"),
            "colmapBuildBanner": QUALIFIED_COLMAP_BUILD_BANNER,
            "colmapExecutableSha256": hashlib.sha256(payload).hexdigest(),
            "colmapExecutableSizeBytes": len(payload),
            "colmapPrefix": str(prefix),
            "colmapSourceCommit": QUALIFIED_COLMAP_SOURCE_COMMIT,
            "colmapSourceTree": QUALIFIED_COLMAP_SOURCE_TREE,
            "colmapVersion": QUALIFIED_COLMAP_VERSION,
            "cudaArchitecture": QUALIFIED_CUDA_ARCHITECTURE,
            "cudaRelease": QUALIFIED_CUDA_RELEASE,
            "cudaRoot": str(prefix / "cuda"),
            "hostCCompiler": QUALIFIED_HOST_C_COMPILER,
            "hostCompilerVersion": QUALIFIED_HOST_COMPILER_SERIES,
            "hostCxxCompiler": QUALIFIED_HOST_CXX_COMPILER,
            "nvccVersion": QUALIFIED_NVCC_VERSION,
            "nvidiaDriverVersion": QUALIFIED_NVIDIA_DRIVER_VERSION,
            "pycolmapVersion": QUALIFIED_PYCOLMAP_VERSION,
            "pycolmapWheelSha256": "2" * 64,
            "schema": TOOLCHAIN_MANIFEST_SCHEMA,
        }
        fields.update(manifest_overrides or {})
        manifest_bytes = canonical_manifest_bytes(fields)
    manifest_path.write_bytes(manifest_bytes)
    manifest_path.chmod(0o644)
    age_past_the_inode_timestamp_tick(binary.stat().st_ctime_ns, near=prefix.parent)
    return binary


def fake_box_location(prefix: Path) -> QualifiedBoxLocation:
    """Declare where one fake prefix's "qualified box" is installed.

    ``write_toolchain`` writes the real pinned constants for every box-identity
    field except the three install-location paths, which have to live under
    ``tmp_path``: ``/opt/colmap/4.0.2`` cannot be created on a developer macOS
    box, and a Linux-only proof is the shape that hid the last regression.  So
    only the location is substituted -- COLMAP version, build banner, source
    commit and tree, CUDA release and architecture, nvcc, host compilers,
    driver and pycolmap are still compared against the production constants.
    """

    return QualifiedBoxLocation(
        colmap_prefix=str(prefix),
        app_dir=str(prefix / "app"),
        cuda_root=str(prefix / "cuda"),
    )


def load_fake_toolchain(
    prefix: Path,
    *,
    remaining_seconds=None,
    qualified: bool = False,
) -> ColmapToolchain:
    """Load a fake prefix through the real loader.

    ``owner_uid`` defaults to ``root`` in production; a fake prefix built under
    ``tmp_path`` is owned by whoever runs the suite, so the declared owner is
    this euid.  That substitution is the *only* ownership relaxation: the
    exact-owner comparison itself is still the production one.

    ``qualified=True`` does not assert qualification -- it declares this fake
    prefix's install location and lets the real loader *prove* the manifest
    against it.  A prefix whose manifest drifts from the pinned box is refused
    here exactly as production would refuse it.
    """

    return load_colmap_toolchain(
        prefix,
        remaining_seconds=remaining_seconds or (lambda: 30.0),
        require_elf=False,
        owner_uid=os.geteuid(),
        box_location=fake_box_location(prefix) if qualified else None,
    )


def allowlisted_argv(executable: Path | str, workspace: Path) -> tuple[str, ...]:
    return (
        str(executable),
        "point_triangulator",
        "--database_path",
        str(workspace / "database.db"),
        "--image_path",
        str(workspace / "images"),
        "--input_path",
        str(workspace / "seed"),
        "--output_path",
        str(workspace / "triangulated"),
        "--clear_points",
        "1",
        "--refine_intrinsics",
        "0",
        "--Mapper.random_seed",
        "0",
    )


def plan_fake_command(
    toolchain: ColmapToolchain,
    workspace: Path,
    *,
    command=None,
    remaining_seconds=None,
) -> PinnedColmapCommand:
    """Plan an UNQUALIFIED, path-lookup command.

    The supervisor refuses this shape outright, which is itself part of the
    contract under test.  Use it only to exercise planning (argv allowlist,
    environment, deadline carriage); anything that must actually launch a child
    has to go through :func:`plan_supervised_command`.
    """

    return plan_pinned_colmap_command(
        command
        if command is not None
        else allowlisted_argv(toolchain.identity.path, workspace),
        toolchain=toolchain,
        workspace=workspace,
        remaining_seconds=remaining_seconds or (lambda: 30.0),
        descriptor_exec=False,
    )


@contextlib.contextmanager
def descriptor_alias_root(toolchain: ColmapToolchain):
    """Make the module's descriptor alias reachable on a non-Linux host.

    Production resolves ``/proc/self/fd/<fd>``, which exists only on Linux.  Off
    Linux we point the module at a directory holding one symlink named for the
    open descriptor, so the plan is genuinely descriptor-pinned, the fd is
    genuinely passed to the child, and the exec genuinely goes through the
    alias -- only the alias's *location* is faked.  Nothing here relaxes the
    supervisor's requirement that a plan be qualified and descriptor-pinned; the
    fd-backed form itself is proved by the Linux-gated
    ``test_descriptor_pinned_child_runs_the_pinned_inode_on_linux``.
    """

    if _HOST_PLATFORM.startswith("linux"):
        yield
        return
    root = Path(toolchain.identity.path).parents[2] / ".fd-alias-root"
    root.mkdir(exist_ok=True)
    alias = root / str(toolchain.executable_descriptor)
    if alias.is_symlink() or alias.exists():
        alias.unlink()
    alias.symlink_to(toolchain.identity.path)
    previous = toolchain_module._PROC_FD_ROOT
    toolchain_module._PROC_FD_ROOT = PurePosixPath(str(root))
    try:
        yield
    finally:
        toolchain_module._PROC_FD_ROOT = previous


def plan_supervised_command(
    toolchain: ColmapToolchain,
    workspace: Path,
    *,
    command=None,
    remaining_seconds=None,
) -> PinnedColmapCommand:
    """Plan the one shape the supervisor accepts: qualified + descriptor-pinned."""

    with descriptor_alias_root(toolchain):
        return plan_pinned_colmap_command(
            command
            if command is not None
            else allowlisted_argv(toolchain.identity.path, workspace),
            toolchain=toolchain,
            workspace=workspace,
            remaining_seconds=remaining_seconds or (lambda: 30.0),
            descriptor_exec=True,
        )


def pinned_command(
    prefix: Path,
    workspace: Path,
    *,
    program: str = "print('done')",
) -> tuple[ColmapToolchain, PinnedColmapCommand]:
    """Build a ready-to-run sealed plan for one fake COLMAP installation."""

    write_toolchain(prefix, program=program)
    toolchain = load_fake_toolchain(prefix, qualified=True)
    return toolchain, plan_supervised_command(toolchain, workspace)
