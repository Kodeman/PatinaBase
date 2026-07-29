"""Executable identity, command/environment allowlist, and toolchain pin.

This module is a disabled Refine prerequisite.  It bounds *what* the COLMAP
command supervisor may execute and *what environment* that child receives; it
does not enable, register, or compose any Refine stage.

Three closed contracts live here:

* **Executable identity** -- the qualified COLMAP CLI is opened through a
  descriptor-rooted walk of its installed prefix, every component of which must
  be owned by ``root``, its inode metadata is recorded, its bytes are hashed
  under the carried deadline, and the digest must equal the installed toolchain
  manifest.  The supervisor re-verifies the recorded identity -- inode, size,
  mode, ownership, *and* ``st_ctime_ns``/``st_mtime_ns`` -- immediately before
  ``execve`` and, on Linux, executes the already-open descriptor through
  ``/proc/self/fd`` so no path lookup can be swapped underneath it.  The
  timestamps are what make an in-place same-length byte substitution visible:
  every other stat field survives a ``pwrite`` into the verified inode
  untouched, and the descriptor exec would then run exactly those bytes.  The
  load-bearing guarantee is still that only ``root`` may write the installed
  prefix; the timestamps are the detector, not the barrier.
* **Command allowlist** -- argv is not "any bounded absolute argv".  It must be
  the pinned executable followed by one allowlisted COLMAP subcommand and that
  subcommand's exact ordered option sequence.  Each path-valued option must stay
  inside the *one leased surface it is declared for*; every other option must
  equal one allowlisted literal.
* **Environment allowlist** -- the child never inherits the ambient process
  environment.  It receives exactly :data:`COMMAND_ENVIRONMENT_ALLOWLIST`,
  built from the manifest, with every writable surface confined to ``APP_DIR``
  or the private workspace.  That confinement is what keeps the systemd
  ``ProtectSystem=strict`` sandbox intact.

Three surfaces, not one
-----------------------

``workspace``, ``cwd``, and ``temp_directory`` used to be a single string.  They
are not the same thing, and collapsing them is what made the parent-provisioned
workspace lease unusable:

* ``workspace`` is the **lease root**.  Under the lease it is
  ``context.workspace_path()``.  It is not itself a confinement root: each path
  option is confined to the one named child of it declared in
  :class:`ColmapCommandSpec`.  ``--image_path`` reads ``<lease>/packet``;
  ``--database_path``, ``--input_path`` and ``--output_path`` live in
  ``<lease>/work``.  Rooting every option at the lease root instead -- the first
  shape of this split -- admitted ``--output_path <lease>/packet/images``, which
  writes the reconstruction over the extracted source images.  Rooting all of
  them at the working directory rejects the packet outright.  Neither single
  root is correct, which is why the mapping is per option.
* ``cwd`` is ``context.workspace_subdirectory_path("work")``.
* ``temp_directory`` is ``context.workspace_subdirectory_path("tmp")`` and is
  the only value ``TMPDIR`` may take.

``cwd`` and ``temp_directory`` default to ``workspace``, so a caller that passes
one flat directory gets the previous *exec-surface* behaviour.  Argv is not flat
and never was after this split: a path option always names ``<workspace>/packet``
or ``<workspace>/work``, whether or not the caller went through a real lease.
:func:`plan_leased_colmap_command` is the binding that hands the lease's three
real surfaces to the planner.  The parent owns the lease tree and purges it
after every child outcome, so nothing here creates or removes any of the three.

The toolchain pin follows the I93 helper-manifest precedent: values that this
repository already receipts (COLMAP 4.0.2 / commit ``d927f7e`` / CUDA 11.8 /
``gcc-11`` / ``sm_75``) are pinned here and rejected on drift, while values that
are only knowable from the qualified host are *declared inputs* of a canonical
installed manifest.  Nothing is guessed: see :data:`OWED_BOX_VALUES` for the
exact list that must still be produced on the box before this policy is real.

Provenance for every pinned constant below:

* ``services/scan-pipeline/install-colmap-4.0.2.sh`` (the in-repo builder that
  produced the qualified COLMAP/PyCOLMAP artifacts), and
* ``docs/design/field-capture/p2-item3-gpu-box-acceptance-2026-07-19.md``
  (the I88 real-DeskDev dependency/sandbox receipt).
"""

from __future__ import annotations

import hashlib
import json
import os
import re
import stat
from collections.abc import Callable, Mapping, Sequence
from dataclasses import dataclass, field
from pathlib import Path, PurePosixPath
from types import MappingProxyType

from .refine_adapter import AdapterError, RefineDeadline
from .refine_native_process import (
    NATIVE_WORKSPACE_COMMAND_SUBDIRECTORY,
    NATIVE_WORKSPACE_MAX_ARGV_ITEM_BYTES,
    NATIVE_WORKSPACE_PACKET_SUBDIRECTORY,
    NATIVE_WORKSPACE_TEMP_SUBDIRECTORY,
    NativeChildContext,
)

TOOLCHAIN_MANIFEST_SCHEMA = "patina-refine-colmap-toolchain-manifest-v1"
TOOLCHAIN_MANIFEST_RELATIVE_PATH = PurePosixPath(
    "share/patina/refine-colmap-toolchain-v1.manifest.json"
)
COLMAP_EXECUTABLE_RELATIVE_PATH = PurePosixPath("bin/colmap")

# --- Repo-pinned qualified box identity (drift is rejected, never adopted). ---
QUALIFIED_COLMAP_PREFIX = "/opt/colmap/4.0.2"
QUALIFIED_COLMAP_VERSION = "4.0.2"
QUALIFIED_COLMAP_SOURCE_COMMIT = "d927f7e518fc20afa33390712c4cc20d85b730b8"
QUALIFIED_COLMAP_SOURCE_TREE = "9c381aea43304df66df991183563b659c2f712fa"
# Byte-for-byte the SECOND line of `colmap -h`, parentheses included, exactly as
# install-colmap-4.0.2.sh receipts it (`EXPECTED_BUILD`) and prints it.  An
# operator transcribing what the binary emits must not trip `colmapBuildBanner
# drifted`.  (PyCOLMAP's `COLMAP_build` attribute is the *unparenthesized* form;
# that separate surface is pinned in pycolmap_cuda_smoke.py and is not this.)
QUALIFIED_COLMAP_BUILD_BANNER = "(Commit d927f7e on 2026-03-18 with CUDA)"
QUALIFIED_CUDA_ROOT = "/usr/local/cuda-11.8"
QUALIFIED_CUDA_RELEASE = "11.8"
QUALIFIED_CUDA_ARCHITECTURE = "75"
QUALIFIED_NVCC_VERSION = "11.8.89"
QUALIFIED_HOST_C_COMPILER = "/usr/bin/gcc-11"
QUALIFIED_HOST_CXX_COMPILER = "/usr/bin/g++-11"
# The I88 receipt records "GCC/G++ 11.5"; the exact dumpfullversion string is a
# box value, so the pin is the receipted release series and drift outside it is
# a hard failure rather than an adaptation.
QUALIFIED_HOST_COMPILER_SERIES = "11.5"
QUALIFIED_NVIDIA_DRIVER_VERSION = "580.159.03"
QUALIFIED_PYCOLMAP_VERSION = "4.0.2"
QUALIFIED_APP_DIR = "/opt/patina/scan-pipeline"

# These flags stay false until the box supplies OWED_BOX_VALUES and a Linux
# lifecycle receipt exists.  Nothing in this module may be read as enablement.
TOOLCHAIN_POLICY_QUALIFIED = False
EXECUTABLE_IDENTITY_QUALIFIED = False
COMMAND_ENVIRONMENT_QUALIFIED = False

#: The exact values an operator must produce on the qualified host before the
#: toolchain pin is real.  Every one of them is a declared manifest input; none
#: of them is guessed in this repository.
OWED_BOX_VALUES = (
    "sha256 of /opt/colmap/4.0.2/bin/colmap  (colmapExecutableSha256)",
    "byte size of /opt/colmap/4.0.2/bin/colmap  (colmapExecutableSizeBytes)",
    "exact `/usr/bin/gcc-11 -dumpfullversion` output  (hostCompilerVersion)",
    (
        "wheelSha256 from /opt/patina/scan-pipeline-artifacts/"
        "pycolmap-4.0.2-cuda118-sm75/artifact.json  (pycolmapWheelSha256)"
    ),
    (
        "the installed manifest itself at /opt/colmap/4.0.2/"
        "share/patina/refine-colmap-toolchain-v1.manifest.json"
    ),
)

#: Exact closed environment handed to every COLMAP child.  The ambient process
#: environment is never inherited.
COMMAND_ENVIRONMENT_ALLOWLIST = (
    "CUDA_CACHE_PATH",
    "CUDA_HOME",
    "HOME",
    "LANG",
    "LC_ALL",
    "LD_LIBRARY_PATH",
    "PATH",
    "QT_QPA_PLATFORM",
    "TMPDIR",
    "XDG_CACHE_HOME",
    "XDG_CONFIG_HOME",
    "XDG_DATA_HOME",
    "XDG_STATE_HOME",
)

#: Environment entries whose value must resolve inside APP_DIR.  Everything the
#: child can write must land on a surface systemd already lists in
#: ``ReadWritePaths``; TMPDIR is handled separately because it is the private
#: per-command workspace.
_APP_DIR_CONFINED_ENVIRONMENT = (
    "CUDA_CACHE_PATH",
    "HOME",
    "XDG_CACHE_HOME",
    "XDG_CONFIG_HOME",
    "XDG_DATA_HOME",
    "XDG_STATE_HOME",
)

_ENGINE_FAILED = "REFINE_ENGINE_FAILED"
_TOOLCHAIN_UNQUALIFIED = "REFINE_TOOLCHAIN_UNQUALIFIED"

_MAX_COLMAP_EXECUTABLE_BYTES = 256 * 1024 * 1024
_MAX_TOOLCHAIN_MANIFEST_BYTES = 8 * 1024
_MAX_ENVIRONMENT_VALUE_BYTES = 4096
_MAX_ENVIRONMENT_BYTES = 64 * 1024
_MAX_ARGV_ITEMS = 64
#: One number, owned by the layer that mints the leased path this bounds.  See
#: ``NATIVE_WORKSPACE_MAX_ARGV_ITEM_BYTES``.  Stated precisely, because the
#: earlier wording here overreached: the lease provisioner refuses a container
#: whose **lease root** would exceed ``NATIVE_WORKSPACE_MAX_PATH_BYTES``, which
#: is this ceiling less ``NATIVE_WORKSPACE_MAX_ARGV_PATH_TAIL_BYTES``.  What
#: that buys is guaranteed room for a tail of *at most* the reserve -- 64
#: bytes, against a longest reviewed tail of 37 -- not room for an arbitrary
#: path option.  A longer tail is still refused, here, by this ceiling.  What
#: can no longer happen is the F-3 shape: an operator scratch root landing in a
#: gap between the two bounds, provisioning cleanly and then making every
#: command unplannable.
_MAX_OPTION_VALUE_BYTES = NATIVE_WORKSPACE_MAX_ARGV_ITEM_BYTES
_READ_BYTES = 1024 * 1024

_SHA256_PATTERN = re.compile(r"^[0-9a-f]{64}$")
_VERSION_PATTERN = re.compile(r"^[0-9A-Za-z][0-9A-Za-z.+~_-]{0,63}$")
_PROC_FD_ROOT = PurePosixPath("/proc/self/fd")


def _fail(message: str, code: str = _TOOLCHAIN_UNQUALIFIED) -> AdapterError:
    return AdapterError(message, code)


def _canonical_json_bytes(value: object) -> bytes:
    try:
        return (
            json.dumps(
                value,
                sort_keys=True,
                separators=(",", ":"),
                ensure_ascii=True,
                allow_nan=False,
            )
            + "\n"
        ).encode("ascii")
    except (RecursionError, TypeError, ValueError, UnicodeEncodeError) as exc:
        raise _fail("COLMAP toolchain manifest is not canonicalizable") from exc


def shared_remaining_seconds(
    context: NativeChildContext,
    deadline: RefineDeadline,
) -> float:
    """Return the single lease-aware budget shared by context and deadline."""

    try:
        return min(context.remaining_seconds(), deadline.remaining_seconds())
    except AdapterError:
        raise
    except BaseException:
        raise _fail(
            "cannot read the carried COLMAP toolchain deadline",
            _ENGINE_FAILED,
        ) from None


def carried_deadline_probe(
    context: NativeChildContext,
    deadline: RefineDeadline,
) -> Callable[[], float]:
    """Bind one probe so every toolchain read observes the same deadline."""

    if type(context) is not NativeChildContext or not isinstance(
        deadline, RefineDeadline
    ):
        raise _fail(
            "COLMAP toolchain reads require the carried native deadline",
            _ENGINE_FAILED,
        )

    def probe() -> float:
        return shared_remaining_seconds(context, deadline)

    probe()
    return probe


# --------------------------------------------------------------------------
# Command allowlist
# --------------------------------------------------------------------------


@dataclass(frozen=True)
class ColmapCommandSpec:
    """One allowlisted COLMAP subcommand and its exact ordered option shape.

    ``workspace_path_options`` maps each path-valued option to the **one leased
    surface** its value must stay inside, not to a shared confinement root.  The
    four options are not interchangeable: two of them are where COLMAP writes.
    """

    subcommand: str
    option_order: tuple[str, ...]
    workspace_path_options: Mapping[str, str]
    literal_options: Mapping[str, frozenset[str]]


_POINT_TRIANGULATOR = ColmapCommandSpec(
    subcommand="point_triangulator",
    option_order=(
        "--database_path",
        "--image_path",
        "--input_path",
        "--output_path",
        "--clear_points",
        "--refine_intrinsics",
        "--Mapper.random_seed",
    ),
    # Read-vs-write, stated per option:
    #
    # * ``--image_path`` READS the extracted engine images, so it is rooted at
    #   ``packet/`` -- the read-only input surface the packet extractor fills
    #   and, by its own documented precondition, "nothing else writes".
    # * ``--input_path`` READS the known-pose seed model, which the I87 primary
    #   plan *builds in-process* (``pycolmap.build_known_pose_seed``) under
    #   ``work/``.  No model seed ships in the packet -- its universe is one
    #   declared request, 3-400 engine images, and at most one source and one
    #   adapter ledger -- so this option is rooted at ``work/`` with the other
    #   child-produced surfaces.  If a seed model is ever packaged, moving this
    #   one entry to ``packet/`` is the whole change.
    # * ``--database_path`` and ``--output_path`` are WRITE surfaces: the
    #   feature/match database and the triangulated model.  Both are rooted at
    #   ``work/``, the only writable engine surface.
    #
    # ``tmp/`` appears nowhere: it is TMPDIR scratch, not an artifact surface.
    workspace_path_options=MappingProxyType(
        {
            "--database_path": NATIVE_WORKSPACE_COMMAND_SUBDIRECTORY,
            "--image_path": NATIVE_WORKSPACE_PACKET_SUBDIRECTORY,
            "--input_path": NATIVE_WORKSPACE_COMMAND_SUBDIRECTORY,
            "--output_path": NATIVE_WORKSPACE_COMMAND_SUBDIRECTORY,
        }
    ),
    literal_options={
        "--clear_points": frozenset({"1"}),
        "--refine_intrinsics": frozenset({"0"}),
        "--Mapper.random_seed": frozenset({"0"}),
    },
)

#: The complete CLI surface of the I87 primary plan.  Every other reviewed
#: operation is an in-process PyCOLMAP call, so no other subcommand -- not
#: ``gui``, ``model_converter``, ``mapper``, or the fallback
#: ``pose_prior_mapper`` -- may be executed by the supervisor.
COLMAP_COMMAND_ALLOWLIST: Mapping[str, ColmapCommandSpec] = {
    _POINT_TRIANGULATOR.subcommand: _POINT_TRIANGULATOR,
}


def _bounded_argv(command: Sequence[str]) -> tuple[str, ...]:
    """Materialize bounded exact-string argv without trusting its container."""

    try:
        iterator = iter(command)
    except BaseException:
        raise _fail("cannot normalize the pinned COLMAP argv") from None
    argv: list[str] = []
    for index in range(_MAX_ARGV_ITEMS + 1):
        try:
            part = next(iterator)
        except StopIteration:
            break
        except BaseException:
            raise _fail("cannot normalize the pinned COLMAP argv") from None
        if index == _MAX_ARGV_ITEMS:
            raise _fail("pinned COLMAP argv exceeds the allowlist item limit")
        if type(part) is not str or not part or "\x00" in part:
            raise _fail("pinned COLMAP argv must be exact non-empty strings")
        if len(part.encode("utf-8", errors="surrogatepass")) > _MAX_OPTION_VALUE_BYTES:
            raise _fail("pinned COLMAP argv item exceeds its byte ceiling")
        argv.append(part)
    if not argv:
        raise _fail("pinned COLMAP argv must be non-empty")
    return tuple(argv)


def _validate_workspace_path(value: str, *, workspace: PurePosixPath) -> None:
    """Confine one path option lexically inside one leased surface.

    Lexical, and only lexical: this compares strings and never calls
    ``realpath``, so a symlink planted inside ``work/`` by a same-UID actor
    still points a confined-looking option outside the lease.  That residual is
    pre-existing and unchanged by the per-surface split -- narrowing each option
    to one child of the lease root shrinks the set of names an option may take
    without touching what a name may resolve to.  Closing it needs a
    descriptor-rooted (``O_NOFOLLOW`` walk) resolution of every option value,
    which belongs with the parent-owned workspace work, not here.
    """

    if not value.startswith("/"):
        raise _fail("pinned COLMAP path option must be absolute")
    if any(ord(character) < 0x20 or ord(character) == 0x7F for character in value):
        raise _fail("pinned COLMAP path option contains control characters")
    candidate = PurePosixPath(value)
    if (
        value != candidate.as_posix()
        or any(part in ("", ".", "..") for part in candidate.parts[1:])
        or candidate == workspace
        or not candidate.is_relative_to(workspace)
    ):
        raise _fail("pinned COLMAP path option must stay inside its workspace")


def _confined_directory(
    value: Path,
    *,
    workspace: PurePosixPath,
    label: str,
) -> str:
    """Bind one exec surface (``cwd``/``TMPDIR``) inside the confinement root.

    The root is allowed to be the value itself: a caller with a single flat
    workspace gets exactly its previous behaviour.  Under the parent-provisioned
    lease the two are distinct children of the root, and neither is created or
    removed here -- the parent owns the whole lease tree.
    """

    try:
        is_absolute = value.is_absolute()
    except BaseException:
        raise _fail(f"cannot inspect the COLMAP command {label}") from None
    if not is_absolute:
        raise _fail(f"COLMAP command {label} must be absolute")
    try:
        raw = os.fspath(value)
    except BaseException:
        raise _fail(f"cannot inspect the COLMAP command {label}") from None
    candidate = PurePosixPath(raw)
    if raw != candidate.as_posix() or any(
        part in ("", ".", "..") for part in candidate.parts[1:]
    ):
        raise _fail(f"COLMAP command {label} must be a canonical path")
    if not candidate.is_relative_to(workspace):
        raise _fail(f"COLMAP command {label} must stay inside its workspace")
    return candidate.as_posix()


def validate_allowlisted_argv(
    command: Sequence[str],
    *,
    executable_path: str,
    workspace: Path,
) -> tuple[str, ...]:
    """Bind argv to one allowlisted subcommand, the pinned binary, and surfaces.

    ``workspace`` is the lease **root**, not a single confinement root for every
    option.  Each path option is confined to ``workspace / <its declared
    surface>``: reads of the extracted packet to ``packet/``, everything the
    engine writes to ``work/``.  Rooting all four at ``workspace`` -- which is
    what widening confinement from ``work/`` to the lease root did in order to
    admit ``--image_path`` -- made ``--output_path <lease>/packet/images`` an
    admissible, sealable plan that writes the reconstruction over the
    hash-validated extracted source images.
    """

    if type(executable_path) is not str or not executable_path.startswith("/"):
        raise _fail("pinned COLMAP executable path must be absolute")
    try:
        workspace_is_absolute = workspace.is_absolute()
    except BaseException:
        raise _fail("cannot validate the pinned COLMAP workspace") from None
    if not workspace_is_absolute:
        raise _fail("pinned COLMAP workspace must be absolute")
    workspace_posix = PurePosixPath(os.fspath(workspace))
    argv = _bounded_argv(command)
    if argv[0] != executable_path:
        raise _fail("pinned COLMAP argv[0] is not the verified executable")
    if len(argv) < 2:
        raise _fail("pinned COLMAP argv needs an allowlisted subcommand")
    spec = COLMAP_COMMAND_ALLOWLIST.get(argv[1])
    if spec is None:
        raise _fail("COLMAP subcommand is not on the pilot allowlist")
    options = argv[2:]
    if len(options) != 2 * len(spec.option_order):
        raise _fail("COLMAP subcommand argv does not match its allowlisted shape")
    for index, expected_option in enumerate(spec.option_order):
        name = options[2 * index]
        value = options[2 * index + 1]
        if name != expected_option:
            raise _fail("COLMAP subcommand options must use the allowlisted order")
        surface = spec.workspace_path_options.get(name)
        if surface is not None:
            _validate_workspace_path(value, workspace=workspace_posix / surface)
            continue
        allowed = spec.literal_options.get(name)
        if allowed is None or value not in allowed:
            raise _fail("COLMAP subcommand option value is not allowlisted")
    return argv


# --------------------------------------------------------------------------
# Toolchain manifest
# --------------------------------------------------------------------------


@dataclass(frozen=True)
class ColmapToolchainManifest:
    colmap_prefix: str
    colmap_version: str
    colmap_build_banner: str
    colmap_source_commit: str
    colmap_source_tree: str
    colmap_executable_sha256: str
    colmap_executable_size_bytes: int
    cuda_root: str
    cuda_release: str
    cuda_architecture: str
    nvcc_version: str
    host_c_compiler: str
    host_cxx_compiler: str
    host_compiler_version: str
    nvidia_driver_version: str
    pycolmap_version: str
    pycolmap_wheel_sha256: str
    app_dir: str


_MANIFEST_FIELDS = {
    "appDir",
    "colmapBuildBanner",
    "colmapExecutableSha256",
    "colmapExecutableSizeBytes",
    "colmapPrefix",
    "colmapSourceCommit",
    "colmapSourceTree",
    "colmapVersion",
    "cudaArchitecture",
    "cudaRelease",
    "cudaRoot",
    "hostCCompiler",
    "hostCompilerVersion",
    "hostCxxCompiler",
    "nvccVersion",
    "nvidiaDriverVersion",
    "pycolmapVersion",
    "pycolmapWheelSha256",
    "schema",
}


def _manifest_absolute_path(document: Mapping[str, object], key: str) -> str:
    value = document.get(key)
    if (
        type(value) is not str
        or not value.startswith("/")
        or len(value) > 512
        or value != PurePosixPath(value).as_posix()
        or any(part in ("", ".", "..") for part in PurePosixPath(value).parts[1:])
    ):
        raise _fail(f"COLMAP toolchain manifest {key} is not a canonical path")
    return value


def _manifest_version(document: Mapping[str, object], key: str) -> str:
    value = document.get(key)
    if type(value) is not str or _VERSION_PATTERN.fullmatch(value) is None:
        raise _fail(f"COLMAP toolchain manifest {key} is not a safe version")
    return value


def _manifest_sha256(document: Mapping[str, object], key: str) -> str:
    value = document.get(key)
    if type(value) is not str or _SHA256_PATTERN.fullmatch(value) is None:
        raise _fail(f"COLMAP toolchain manifest {key} is not a lowercase SHA-256")
    return value


def _manifest_sha256_like(document: Mapping[str, object], key: str) -> str:
    value = document.get(key)
    if type(value) is not str or re.fullmatch(r"[0-9a-f]{40}", value) is None:
        raise _fail(f"COLMAP toolchain manifest {key} is not a git object id")
    return value


def parse_toolchain_manifest(payload: bytes) -> ColmapToolchainManifest:
    """Validate the canonical installed manifest before any value is trusted."""

    if type(payload) is not bytes or not payload:
        raise _fail("COLMAP toolchain manifest payload is empty")
    if len(payload) > _MAX_TOOLCHAIN_MANIFEST_BYTES:
        raise _fail("COLMAP toolchain manifest exceeds its byte ceiling")
    try:
        document = json.loads(payload.decode("ascii"))
    except (RecursionError, UnicodeDecodeError, ValueError) as exc:
        raise _fail("COLMAP toolchain manifest is not canonical ASCII JSON") from exc
    if type(document) is not dict or _canonical_json_bytes(document) != payload:
        raise _fail("COLMAP toolchain manifest is not canonical JSON")
    if set(document) != _MANIFEST_FIELDS:
        raise _fail("COLMAP toolchain manifest has an unknown or missing field")
    if document["schema"] != TOOLCHAIN_MANIFEST_SCHEMA:
        raise _fail("COLMAP toolchain manifest schema is unsupported")
    banner = document["colmapBuildBanner"]
    if type(banner) is not str or not 1 <= len(banner) <= 128:
        raise _fail("COLMAP toolchain manifest colmapBuildBanner is not bounded text")
    size_bytes = document["colmapExecutableSizeBytes"]
    if (
        type(size_bytes) is not int
        or size_bytes < 1
        or size_bytes > _MAX_COLMAP_EXECUTABLE_BYTES
    ):
        raise _fail("COLMAP toolchain manifest colmapExecutableSizeBytes is invalid")
    manifest = ColmapToolchainManifest(
        colmap_prefix=_manifest_absolute_path(document, "colmapPrefix"),
        colmap_version=_manifest_version(document, "colmapVersion"),
        colmap_build_banner=banner,
        colmap_source_commit=_manifest_sha256_like(document, "colmapSourceCommit"),
        colmap_source_tree=_manifest_sha256_like(document, "colmapSourceTree"),
        colmap_executable_sha256=_manifest_sha256(document, "colmapExecutableSha256"),
        colmap_executable_size_bytes=size_bytes,
        cuda_root=_manifest_absolute_path(document, "cudaRoot"),
        cuda_release=_manifest_version(document, "cudaRelease"),
        cuda_architecture=_manifest_version(document, "cudaArchitecture"),
        nvcc_version=_manifest_version(document, "nvccVersion"),
        host_c_compiler=_manifest_absolute_path(document, "hostCCompiler"),
        host_cxx_compiler=_manifest_absolute_path(document, "hostCxxCompiler"),
        host_compiler_version=_manifest_version(document, "hostCompilerVersion"),
        nvidia_driver_version=_manifest_version(document, "nvidiaDriverVersion"),
        pycolmap_version=_manifest_version(document, "pycolmapVersion"),
        pycolmap_wheel_sha256=_manifest_sha256(document, "pycolmapWheelSha256"),
        app_dir=_manifest_absolute_path(document, "appDir"),
    )
    if manifest.colmap_prefix in ("/", manifest.app_dir):
        raise _fail("COLMAP toolchain prefix and APP_DIR must be distinct real paths")
    if manifest.app_dir == "/" or manifest.cuda_root == "/":
        raise _fail("COLMAP toolchain APP_DIR and CUDA root may not be the filesystem")
    return manifest


@dataclass(frozen=True)
class QualifiedBoxLocation:
    """Where the qualified COLMAP box is installed on disk.

    These three install-location paths are the *only* substitutable part of the
    box identity, and they are substitutable only so the mechanism stays
    testable off the real host: ``/opt/colmap/4.0.2`` cannot be created
    ``root:root`` on a developer macOS box, and a proof that runs only on Linux
    is exactly the shape that let the last regression through unseen.

    Every other qualified-box fact -- COLMAP version, build banner, source
    commit and tree, CUDA release and architecture, nvcc, host compilers,
    driver, pycolmap -- is compared against the repo-pinned production constant
    on every route, substituted location or not.  Production never constructs
    one of these: it uses :data:`QUALIFIED_BOX_LOCATION`.
    """

    colmap_prefix: str
    app_dir: str
    cuda_root: str


#: The one location production accepts.  Every default in this module points
#: here; nothing in the package may pass a different one.
QUALIFIED_BOX_LOCATION = QualifiedBoxLocation(
    colmap_prefix=QUALIFIED_COLMAP_PREFIX,
    app_dir=QUALIFIED_APP_DIR,
    cuda_root=QUALIFIED_CUDA_ROOT,
)


def assert_qualified_box_identity(
    manifest: ColmapToolchainManifest,
    *,
    location: QualifiedBoxLocation = QUALIFIED_BOX_LOCATION,
) -> None:
    """Reject any drift from the exact I87/I88 qualified box identity."""

    if type(location) is not QualifiedBoxLocation:
        raise _fail("COLMAP box identity requires a declared install location")
    exact = (
        (manifest.colmap_prefix, location.colmap_prefix, "colmapPrefix"),
        (manifest.colmap_version, QUALIFIED_COLMAP_VERSION, "colmapVersion"),
        (
            manifest.colmap_build_banner,
            QUALIFIED_COLMAP_BUILD_BANNER,
            "colmapBuildBanner",
        ),
        (
            manifest.colmap_source_commit,
            QUALIFIED_COLMAP_SOURCE_COMMIT,
            "colmapSourceCommit",
        ),
        (manifest.colmap_source_tree, QUALIFIED_COLMAP_SOURCE_TREE, "colmapSourceTree"),
        (manifest.cuda_root, location.cuda_root, "cudaRoot"),
        (manifest.cuda_release, QUALIFIED_CUDA_RELEASE, "cudaRelease"),
        (
            manifest.cuda_architecture,
            QUALIFIED_CUDA_ARCHITECTURE,
            "cudaArchitecture",
        ),
        (manifest.nvcc_version, QUALIFIED_NVCC_VERSION, "nvccVersion"),
        (manifest.host_c_compiler, QUALIFIED_HOST_C_COMPILER, "hostCCompiler"),
        (manifest.host_cxx_compiler, QUALIFIED_HOST_CXX_COMPILER, "hostCxxCompiler"),
        (
            manifest.nvidia_driver_version,
            QUALIFIED_NVIDIA_DRIVER_VERSION,
            "nvidiaDriverVersion",
        ),
        (manifest.pycolmap_version, QUALIFIED_PYCOLMAP_VERSION, "pycolmapVersion"),
        (manifest.app_dir, location.app_dir, "appDir"),
    )
    for observed, pinned, label in exact:
        if observed != pinned:
            raise _fail(f"COLMAP toolchain {label} drifted from the qualified box")
    series = manifest.host_compiler_version
    if series != QUALIFIED_HOST_COMPILER_SERIES and not series.startswith(
        QUALIFIED_HOST_COMPILER_SERIES + "."
    ):
        raise _fail(
            "COLMAP toolchain hostCompilerVersion drifted from the qualified box"
        )


# --------------------------------------------------------------------------
# Executable identity
# --------------------------------------------------------------------------


@dataclass(frozen=True)
class ColmapExecutableIdentity:
    path: str
    sha256: str
    size_bytes: int
    device: int
    inode: int
    nlink: int
    mode: int
    uid: int
    gid: int
    #: ``st_ctime_ns`` cannot be set by userspace and moves on any write, so it
    #: is the field that catches an in-place same-length byte substitution.
    #: ``st_mtime_ns`` is recorded with it: it is forgeable through
    #: ``utimensat``, but only by a writer who already had to move ``ctime``.
    ctime_ns: int
    mtime_ns: int


def _identity_from_stat(
    path: str,
    digest: str,
    metadata: os.stat_result,
) -> ColmapExecutableIdentity:
    return ColmapExecutableIdentity(
        path=path,
        sha256=digest,
        size_bytes=metadata.st_size,
        device=metadata.st_dev,
        inode=metadata.st_ino,
        nlink=metadata.st_nlink,
        mode=metadata.st_mode,
        uid=metadata.st_uid,
        gid=metadata.st_gid,
        ctime_ns=metadata.st_ctime_ns,
        mtime_ns=metadata.st_mtime_ns,
    )


def _trusted_metadata_ok(
    metadata: os.stat_result,
    *,
    directory: bool,
    owner_uid: int,
) -> bool:
    if directory and not stat.S_ISDIR(metadata.st_mode):
        return False
    if not directory and not stat.S_ISREG(metadata.st_mode):
        return False
    if metadata.st_mode & 0o022:
        return False
    # Exactly one declared owner.  The former ``st_uid in (0, os.geteuid())``
    # accepted a prefix owned by the *executing* identity, which makes every
    # later hash and metadata check worthless: the same identity could rewrite
    # the binary afterwards.  Production declares ``root`` and nothing else.
    return metadata.st_uid == owner_uid


def _directory_flags() -> int:
    return (
        os.O_RDONLY
        | getattr(os, "O_DIRECTORY", 0)
        | getattr(os, "O_CLOEXEC", 0)
        | getattr(os, "O_NOFOLLOW", 0)
    )


def _file_flags() -> int:
    return (
        os.O_RDONLY
        | getattr(os, "O_CLOEXEC", 0)
        | getattr(os, "O_NOFOLLOW", 0)
    )


def _open_prefix_relative(
    prefix: Path,
    relative: PurePosixPath,
    *,
    owner_uid: int,
) -> tuple[int, os.stat_result]:
    """Walk one installed prefix by descriptor and open its trusted leaf."""

    try:
        directory = os.open(prefix, _directory_flags())
    except OSError as exc:
        raise _fail(
            f"cannot open the COLMAP toolchain prefix: {exc.strerror}"
        ) from None
    leaf: int | None = None
    try:
        metadata = os.fstat(directory)
        if not _trusted_metadata_ok(metadata, directory=True, owner_uid=owner_uid):
            raise _fail("COLMAP toolchain prefix has unsafe ownership or mode")
        for component in relative.parts[:-1]:
            child = os.open(component, _directory_flags(), dir_fd=directory)
            os.close(directory)
            directory = child
            metadata = os.fstat(directory)
            if not _trusted_metadata_ok(metadata, directory=True, owner_uid=owner_uid):
                raise _fail("COLMAP toolchain directory has unsafe ownership or mode")
        leaf = os.open(relative.parts[-1], _file_flags(), dir_fd=directory)
        leaf_metadata = os.fstat(leaf)
        if not _trusted_metadata_ok(leaf_metadata, directory=False, owner_uid=owner_uid):
            raise _fail("COLMAP toolchain file has unsafe ownership or mode")
    except AdapterError:
        if leaf is not None:
            try:
                os.close(leaf)
            except OSError:
                pass
        raise
    except OSError as exc:
        if leaf is not None:
            try:
                os.close(leaf)
            except OSError:
                pass
        raise _fail(f"cannot open the COLMAP toolchain file: {exc.strerror}") from None
    finally:
        try:
            os.close(directory)
        except OSError:
            pass
    return leaf, leaf_metadata


def _hash_descriptor(
    descriptor: int,
    *,
    expected_size: int,
    label: str,
    remaining_seconds: Callable[[], float],
) -> str:
    digest = hashlib.sha256()
    offset = 0
    while offset < expected_size:
        remaining_seconds()
        try:
            block = os.pread(
                descriptor,
                min(_READ_BYTES, expected_size - offset),
                offset,
            )
        except OSError:
            raise _fail(f"cannot read {label}") from None
        if not block:
            raise _fail(f"{label} ended before its declared size")
        digest.update(block)
        offset += len(block)
    return digest.hexdigest()


@dataclass(frozen=True)
class ColmapToolchain:
    """One verified COLMAP CLI installation, reusable across command phases."""

    manifest: ColmapToolchainManifest
    identity: ColmapExecutableIdentity
    executable_descriptor: int
    #: The install location this toolchain's manifest was proved against, or
    #: ``None`` for a load that never claimed the qualified box at all.
    box_location: QualifiedBoxLocation | None
    _closed: list[bool] = field(default_factory=lambda: [False], repr=False)

    @property
    def qualified(self) -> bool:
        """Whether this toolchain passed :func:`assert_qualified_box_identity`.

        Derived, never accepted on a caller's word.  ``load_colmap_toolchain``
        used to take a bare ``qualified=`` bool, and the flag rode straight into
        the sealed plan the supervisor gates on -- so ``qualified=True`` over an
        arbitrary prefix produced a plan indistinguishable from the production
        one without the box identity ever being checked on that route.
        """

        return self.box_location is not None

    def close(self) -> None:
        """Release the pinned executable descriptor exactly once."""

        if self._closed[0]:
            return
        self._closed[0] = True
        try:
            os.close(self.executable_descriptor)
        except OSError:
            raise _fail("cannot release the pinned COLMAP executable") from None


def load_colmap_toolchain(
    prefix: Path,
    *,
    remaining_seconds: Callable[[], float],
    require_elf: bool = True,
    owner_uid: int = 0,
    box_location: QualifiedBoxLocation | None = None,
) -> ColmapToolchain:
    """Verify one installed COLMAP prefix against its canonical manifest.

    ``prefix``, ``require_elf``, ``owner_uid``, and ``box_location`` are
    parameters only so this mechanism stays testable without the qualified host.
    Every one of them defaults to the production value, and production must call
    :func:`load_qualified_colmap_toolchain`, which supplies the pinned prefix and
    the pinned box location; nothing else in the package may call this function
    directly.  ``owner_uid`` in particular defaults to ``root``: the qualified
    box installs ``/opt/colmap/4.0.2`` ``root:root`` ``0755``, and a prefix
    writable by the executing identity would void every hash and metadata
    guarantee this module makes.

    ``box_location`` replaces a former ``qualified=`` bool.  A toolchain is
    qualified if and only if its manifest was *proved* against a declared box
    location here -- the caller can no longer simply assert it -- because that
    flag is what the supervisor gates every launch on.
    """

    if not callable(remaining_seconds):
        raise _fail("COLMAP toolchain load requires a carried deadline probe")
    if type(owner_uid) is not int or owner_uid < 0:
        raise _fail("COLMAP toolchain load requires a declared owner uid")
    if box_location is not None and type(box_location) is not QualifiedBoxLocation:
        raise _fail("COLMAP toolchain load requires a declared install location")
    remaining_seconds()
    # O_NOFOLLOW protects each descriptor-relative component below the prefix,
    # but not the prefix's own ancestors.  Require the installed prefix to be
    # its own canonical path so no ancestor symlink can redirect the install.
    try:
        resolved_prefix = prefix.resolve(strict=True)
    except BaseException:
        raise _fail("cannot resolve the COLMAP toolchain prefix") from None
    if resolved_prefix != prefix:
        raise _fail("COLMAP toolchain prefix may not traverse a symlink")
    manifest_fd, manifest_metadata = _open_prefix_relative(
        prefix, TOOLCHAIN_MANIFEST_RELATIVE_PATH, owner_uid=owner_uid
    )
    try:
        if (
            manifest_metadata.st_nlink != 1
            or manifest_metadata.st_size < 2
            or manifest_metadata.st_size > _MAX_TOOLCHAIN_MANIFEST_BYTES
        ):
            raise _fail("COLMAP toolchain manifest is not a trusted regular file")
        remaining_seconds()
        try:
            payload = os.pread(manifest_fd, manifest_metadata.st_size, 0)
        except OSError:
            raise _fail("cannot read the COLMAP toolchain manifest") from None
        if len(payload) != manifest_metadata.st_size:
            raise _fail("COLMAP toolchain manifest changed while it was read")
        manifest = parse_toolchain_manifest(payload)
    finally:
        try:
            os.close(manifest_fd)
        except OSError:
            pass

    try:
        prefix_posix = PurePosixPath(os.fspath(prefix))
    except BaseException:
        raise _fail("cannot inspect the COLMAP toolchain prefix") from None
    if manifest.colmap_prefix != prefix_posix.as_posix():
        raise _fail("COLMAP toolchain manifest prefix does not match its installation")
    if box_location is not None:
        # Before the executable is so much as opened, so a drifted box leaks no
        # descriptor.  This is the check that used to sit only on
        # ``plan_qualified_colmap_command`` while ``qualified=True`` reached the
        # supervisor by a route that never ran it.
        assert_qualified_box_identity(manifest, location=box_location)

    executable_fd, executable_metadata = _open_prefix_relative(
        prefix, COLMAP_EXECUTABLE_RELATIVE_PATH, owner_uid=owner_uid
    )
    try:
        # ``st_nlink != 1`` is deliberate and fail-closed.  Anyone able to
        # hardlink the installed binary can make every load fail -- but that
        # requires write access to a root-owned directory inside the prefix, and
        # a refusal to start is the correct outcome for a prefix in that state.
        # The alternative (tolerating extra links) would let a second name for
        # the same inode outlive an operator's `rm`.
        if (
            executable_metadata.st_nlink != 1
            or not executable_metadata.st_mode & stat.S_IXUSR
            or executable_metadata.st_size != manifest.colmap_executable_size_bytes
        ):
            raise _fail("COLMAP toolchain executable is not the manifest identity")
        if require_elf:
            try:
                magic = os.pread(executable_fd, 4, 0)
            except OSError:
                raise _fail("cannot inspect the COLMAP toolchain executable") from None
            if magic != b"\x7fELF":
                raise _fail("COLMAP toolchain executable is not an ELF binary")
        digest = _hash_descriptor(
            executable_fd,
            expected_size=executable_metadata.st_size,
            label="the COLMAP toolchain executable",
            remaining_seconds=remaining_seconds,
        )
        if digest != manifest.colmap_executable_sha256:
            raise _fail("COLMAP toolchain executable differs from its manifest")
        after = os.fstat(executable_fd)
        if (
            after.st_dev != executable_metadata.st_dev
            or after.st_ino != executable_metadata.st_ino
            or after.st_size != executable_metadata.st_size
            or after.st_nlink != executable_metadata.st_nlink
            or after.st_mode != executable_metadata.st_mode
            or after.st_uid != executable_metadata.st_uid
            or after.st_gid != executable_metadata.st_gid
            or after.st_ctime_ns != executable_metadata.st_ctime_ns
            or after.st_mtime_ns != executable_metadata.st_mtime_ns
        ):
            raise _fail("COLMAP toolchain executable changed while it was verified")
    except BaseException:
        try:
            os.close(executable_fd)
        except OSError:
            pass
        raise
    executable_path = (prefix_posix / COLMAP_EXECUTABLE_RELATIVE_PATH).as_posix()
    # The identity is built from ``after``, the post-hash stat.  That choice is
    # cosmetic, not a guarantee: the equality guard above already compares every
    # one of the nine recorded fields between ``executable_metadata`` and
    # ``after``, so either stat yields a byte-identical identity and the load
    # would have failed had they differed.  The guarantee is the guard, not the
    # stat that feeds this call.
    return ColmapToolchain(
        manifest=manifest,
        identity=_identity_from_stat(executable_path, digest, after),
        executable_descriptor=executable_fd,
        box_location=box_location,
    )


def load_qualified_colmap_toolchain(
    *,
    context: NativeChildContext,
    deadline: RefineDeadline,
) -> ColmapToolchain:
    """Load the exact pinned COLMAP installation, rejecting any box drift.

    The box-identity assertion is not repeated here: passing
    :data:`QUALIFIED_BOX_LOCATION` *is* how the loader is told to run it, and it
    runs before any descriptor is opened.  A second call afterwards would be a
    no-op that reads like a guarantee.
    """

    return load_colmap_toolchain(
        Path(QUALIFIED_COLMAP_PREFIX),
        remaining_seconds=carried_deadline_probe(context, deadline),
        require_elf=True,
        box_location=QUALIFIED_BOX_LOCATION,
    )


def verify_executable_identity(
    identity: ColmapExecutableIdentity,
    descriptor: int,
) -> None:
    """Re-prove the recorded inode identity right before ``execve``.

    ``st_ctime_ns``/``st_mtime_ns`` are part of the comparison because every
    other field survives an in-place same-length ``pwrite`` into the verified
    inode -- and the qualified path execs that exact descriptor, so the
    substituted bytes would be what runs.  This is a detector, not a barrier:
    it cannot close the residual window between this check and ``execve``.  What
    closes that window is the installed prefix being writable only by ``root``,
    which :func:`load_colmap_toolchain` now requires.
    """

    if type(identity) is not ColmapExecutableIdentity:
        raise _fail(
            "pinned COLMAP execution requires a recorded executable identity",
            _ENGINE_FAILED,
        )
    try:
        held = os.fstat(descriptor)
        named = os.stat(identity.path)
    except BaseException:
        raise _fail(
            "cannot re-verify the pinned COLMAP executable identity",
            _ENGINE_FAILED,
        ) from None
    for metadata in (held, named):
        if (
            metadata.st_dev != identity.device
            or metadata.st_ino != identity.inode
            or metadata.st_size != identity.size_bytes
            or metadata.st_nlink != identity.nlink
            or metadata.st_mode != identity.mode
            or metadata.st_uid != identity.uid
            or metadata.st_gid != identity.gid
            or metadata.st_ctime_ns != identity.ctime_ns
            or metadata.st_mtime_ns != identity.mtime_ns
        ):
            raise _fail(
                "pinned COLMAP executable identity changed before execution",
                _ENGINE_FAILED,
            )


# --------------------------------------------------------------------------
# Environment allowlist
# --------------------------------------------------------------------------


def build_command_environment(
    manifest: ColmapToolchainManifest,
    *,
    workspace: Path,
    temp_directory: Path | None = None,
) -> tuple[tuple[str, str], ...]:
    """Build the exact closed environment; the ambient one is never inherited.

    ``workspace`` is the confinement root; ``temp_directory`` is the child of it
    the engine may fill with scratch and is the only value ``TMPDIR`` may take.
    It defaults to ``workspace`` so a flat single-directory caller is unchanged;
    under the workspace lease it is ``<lease>/tmp``.
    """

    if type(manifest) is not ColmapToolchainManifest:
        raise _fail("COLMAP command environment requires a validated manifest")
    try:
        workspace_is_absolute = workspace.is_absolute()
    except BaseException:
        raise _fail("cannot inspect the COLMAP command workspace") from None
    if not workspace_is_absolute:
        raise _fail("COLMAP command workspace must be absolute")
    workspace_value = PurePosixPath(os.fspath(workspace)).as_posix()
    temp_value = _confined_directory(
        workspace if temp_directory is None else temp_directory,
        workspace=PurePosixPath(workspace_value),
        label="TMPDIR",
    )
    app_dir = PurePosixPath(manifest.app_dir)
    cuda_root = PurePosixPath(manifest.cuda_root)
    environ = {
        # Confine the CUDA JIT cache; ProtectSystem=strict makes ~/.nv EACCES.
        # This must stay byte-identical to patina-scan-worker.gpu.conf, which is
        # the directory install.sh creates and doctor probes.
        "CUDA_CACHE_PATH": (app_dir / ".cache" / "nv").as_posix(),
        "CUDA_HOME": cuda_root.as_posix(),
        "HOME": app_dir.as_posix(),
        "LANG": "C",
        "LC_ALL": "C",
        "LD_LIBRARY_PATH": (cuda_root / "lib64").as_posix(),
        # Only the pinned CUDA toolchain is resolvable by name; no system PATH.
        "PATH": (cuda_root / "bin").as_posix(),
        # COLMAP links Qt; force headless so no display is ever attempted.
        "QT_QPA_PLATFORM": "offscreen",
        "TMPDIR": temp_value,
        "XDG_CACHE_HOME": (app_dir / ".cache").as_posix(),
        "XDG_CONFIG_HOME": (app_dir / ".config").as_posix(),
        "XDG_DATA_HOME": (app_dir / ".data").as_posix(),
        "XDG_STATE_HOME": (app_dir / ".state").as_posix(),
    }
    return validate_command_environment(
        environ,
        manifest=manifest,
        workspace=workspace,
        temp_directory=temp_directory,
    )


def validate_command_environment(
    environ: Mapping[str, str],
    *,
    manifest: ColmapToolchainManifest,
    workspace: Path,
    temp_directory: Path | None = None,
) -> tuple[tuple[str, str], ...]:
    """Prove one environment is exactly the allowlist and stays confined.

    ``TMPDIR`` is checked against ``temp_directory`` -- the scratch child of the
    confinement root -- not against the root itself.  The key set is unchanged;
    only which of the three surfaces ``TMPDIR`` must equal has been made exact.
    """

    if type(environ) is not dict:
        raise _fail("COLMAP command environment must be an exact mapping")
    if tuple(sorted(environ)) != COMMAND_ENVIRONMENT_ALLOWLIST:
        raise _fail("COLMAP command environment is not exactly the allowlist")
    app_dir = PurePosixPath(manifest.app_dir)
    workspace_value = PurePosixPath(os.fspath(workspace)).as_posix()
    temp_value = _confined_directory(
        workspace if temp_directory is None else temp_directory,
        workspace=PurePosixPath(workspace_value),
        label="TMPDIR",
    )
    total = 0
    rows: list[tuple[str, str]] = []
    for name in COMMAND_ENVIRONMENT_ALLOWLIST:
        value = environ[name]
        if type(value) is not str or not value:
            raise _fail(f"COLMAP command environment {name} must be a non-empty string")
        try:
            encoded = value.encode("ascii")
        except UnicodeEncodeError:
            raise _fail(f"COLMAP command environment {name} must be ASCII") from None
        if len(encoded) > _MAX_ENVIRONMENT_VALUE_BYTES:
            raise _fail(f"COLMAP command environment {name} exceeds its byte ceiling")
        if any(byte < 0x20 or byte == 0x7F for byte in encoded):
            raise _fail(f"COLMAP command environment {name} contains control bytes")
        total += len(name.encode("ascii")) + len(encoded) + 2
        rows.append((name, value))
    if total > _MAX_ENVIRONMENT_BYTES:
        raise _fail("COLMAP command environment exceeds its aggregate byte ceiling")
    if environ["TMPDIR"] != temp_value:
        raise _fail("COLMAP command TMPDIR must be the private command workspace")
    for name in _APP_DIR_CONFINED_ENVIRONMENT:
        candidate = PurePosixPath(environ[name])
        if not candidate.is_absolute() or not candidate.is_relative_to(app_dir):
            raise _fail(f"COLMAP command environment {name} escapes APP_DIR")
    return tuple(rows)


# --------------------------------------------------------------------------
# Pinned command
# --------------------------------------------------------------------------

_PINNED_COMMAND_SEAL = object()


@dataclass(frozen=True)
class PinnedColmapCommand:
    """One allowlisted argv bound to a verified binary and a closed environ.

    ``qualified`` and ``descriptor_pinned`` are carried so the supervisor can
    tell a production plan from an arbitrary one.  Without them every sealed
    plan looked alike: a plan built from any prefix with ``descriptor_exec=
    False`` -- a path-lookup exec with no TOCTOU protection -- was structurally
    indistinguishable from the qualified descriptor-pinned form.

    ``workspace`` is the argv confinement root, ``cwd`` the directory the child
    is launched in, and ``temp_directory`` the one ``TMPDIR`` names.  The
    supervisor binds its own ``cwd=`` argument against :attr:`cwd`, so a plan
    built for one working directory can never be run in another even though all
    three live under the same root.
    """

    argv: tuple[str, ...]
    environ: tuple[tuple[str, str], ...]
    workspace: str
    cwd: str
    temp_directory: str
    identity: ColmapExecutableIdentity
    executable_descriptor: int
    executable_alias: str
    descriptor_pinned: bool
    qualified: bool
    _boundary_seal: object | None = field(
        default=None,
        init=False,
        repr=False,
        compare=False,
    )
    _boundary_pid: int | None = field(
        default=None,
        init=False,
        repr=False,
        compare=False,
    )

    @property
    def is_verified_pinned_command(self) -> bool:
        """Authenticate a plan produced by this module in this process."""

        try:
            pid = os.getpid()
        except BaseException:  # noqa: BLE001 - authentication must fail closed
            return False
        return self._boundary_seal is _PINNED_COMMAND_SEAL and self._boundary_pid == pid

    def environment(self) -> dict[str, str]:
        return {name: value for name, value in self.environ}

    def passed_descriptors(self) -> tuple[int, ...]:
        return (self.executable_descriptor,) if self.descriptor_pinned else ()


def _seal_pinned_command(command: PinnedColmapCommand) -> PinnedColmapCommand:
    object.__setattr__(command, "_boundary_seal", _PINNED_COMMAND_SEAL)
    object.__setattr__(command, "_boundary_pid", os.getpid())
    return command


def plan_pinned_colmap_command(
    command: Sequence[str],
    *,
    toolchain: ColmapToolchain,
    workspace: Path,
    cwd: Path | None = None,
    temp_directory: Path | None = None,
    remaining_seconds: Callable[[], float],
    descriptor_exec: bool,
) -> PinnedColmapCommand:
    """Bind one allowlisted argv, verified binary, and closed environment.

    ``descriptor_exec`` is not a convenience switch: production always uses
    :func:`plan_qualified_colmap_command`, which requires the real Linux
    ``/proc/self/fd`` alias so no path lookup can be substituted between
    verification and ``execve``.  Both that choice and the toolchain's own
    ``qualified`` flag are carried into the sealed plan, because the supervisor
    accepts nothing else: a plan that is not both is refused before ``Popen``.

    A plan may not claim ``qualified`` on the toolchain's say-so either: this
    function re-proves the box identity against the location the toolchain was
    loaded with before stamping the flag, so there is no route to a
    supervisor-acceptable plan on which **a** box-identity check never ran --
    against a caller-declared location.

    That last clause is the whole of the guarantee, and it is weaker than it
    reads at a glance.  ``QualifiedBoxLocation`` is caller-declared, so a caller
    with arbitrary in-process Python can load a toolchain from a prefix it
    controls, declare that prefix as the location, and mint a plan the
    supervisor's validator accepts -- the identity check ran, it simply ran
    against a hostile declaration.  What that costs the attacker is total: it
    needs code execution inside this worker, at which point the plan is not the
    weakest link.  Both production doors -- :func:`plan_qualified_colmap_command`
    and :func:`plan_leased_colmap_command` -- compare against
    :data:`QUALIFIED_BOX_LOCATION` and refuse a substituted prefix outright.
    Closing the remaining route structurally would mean deleting the substitutable
    location, which makes the mechanism testable only on the real
    ``/opt/colmap/4.0.2`` as Linux root -- exactly the shape that hid three
    findings from the macOS gate for a full review cycle.  It is a documented
    residual, not a closed hole.

    ``workspace`` is the lease root each path option is confined *under*, one
    named surface per option; ``cwd`` and ``temp_directory`` are the two exec
    surfaces inside it and both default to ``workspace``.  Under the
    parent-provisioned lease they are ``<lease>/work`` and ``<lease>/tmp`` while
    ``workspace`` stays the lease root, which is what lets an ``--image_path``
    into ``<lease>/packet/images`` pass the allowlist while ``--output_path``
    into that same directory does not.  See
    :func:`plan_leased_colmap_command`.

    The per-option mapping is resolved relative to whatever ``workspace`` this
    function is *handed*, and this function takes it from its caller.  So a
    caller that passes ``workspace=<lease>/packet`` makes ``--output_path
    <lease>/packet/work/tri`` admissible -- a write inside the packet, by
    re-rooting rather than by naming.  Production cannot reach it: the two
    doors are :func:`plan_qualified_colmap_command` and
    :func:`plan_leased_colmap_command`, and the leased one takes its three
    surfaces from :func:`leased_command_surfaces`, which returns the lease root
    it was given.  This is the same class of residual as the caller-declared
    ``QualifiedBoxLocation`` above -- reachable only with arbitrary in-process
    Python, at which point the plan is not the weakest link -- and it is
    recorded here for the same reason.
    """

    if type(toolchain) is not ColmapToolchain:
        raise _fail("pinned COLMAP planning requires a verified toolchain")
    if toolchain.qualified:
        assert_qualified_box_identity(
            toolchain.manifest, location=toolchain.box_location
        )
    if type(descriptor_exec) is not bool:
        raise _fail("pinned COLMAP planning requires an exact descriptor_exec flag")
    if not callable(remaining_seconds):
        raise _fail("pinned COLMAP planning requires a carried deadline probe")
    remaining_seconds()
    argv = validate_allowlisted_argv(
        command,
        executable_path=toolchain.identity.path,
        workspace=workspace,
    )
    workspace_posix = PurePosixPath(os.fspath(workspace))
    command_cwd = _confined_directory(
        workspace if cwd is None else cwd,
        workspace=workspace_posix,
        label="working directory",
    )
    temp_value = _confined_directory(
        workspace if temp_directory is None else temp_directory,
        workspace=workspace_posix,
        label="TMPDIR",
    )
    environ = build_command_environment(
        toolchain.manifest,
        workspace=workspace,
        temp_directory=Path(temp_value),
    )
    verify_executable_identity(toolchain.identity, toolchain.executable_descriptor)
    if descriptor_exec:
        if not Path(_PROC_FD_ROOT).is_dir():
            raise _fail(
                "descriptor-pinned COLMAP execution requires Linux /proc/self/fd"
            )
        alias = (_PROC_FD_ROOT / str(toolchain.executable_descriptor)).as_posix()
    else:
        alias = toolchain.identity.path
    remaining_seconds()
    return _seal_pinned_command(
        PinnedColmapCommand(
            argv=argv,
            environ=environ,
            workspace=workspace_posix.as_posix(),
            cwd=command_cwd,
            temp_directory=temp_value,
            identity=toolchain.identity,
            executable_descriptor=toolchain.executable_descriptor,
            executable_alias=alias,
            descriptor_pinned=descriptor_exec is True,
            qualified=toolchain.qualified is True,
        )
    )


def plan_qualified_colmap_command(
    command: Sequence[str],
    *,
    toolchain: ColmapToolchain,
    workspace: Path,
    cwd: Path | None = None,
    temp_directory: Path | None = None,
    context: NativeChildContext,
    deadline: RefineDeadline,
) -> PinnedColmapCommand:
    """The only production planner: pinned box identity plus descriptor exec."""

    if type(toolchain) is not ColmapToolchain or toolchain.qualified is not True:
        raise _fail("production COLMAP planning requires the qualified toolchain")
    assert_qualified_box_identity(toolchain.manifest)
    return plan_pinned_colmap_command(
        command,
        toolchain=toolchain,
        workspace=workspace,
        cwd=cwd,
        temp_directory=temp_directory,
        remaining_seconds=carried_deadline_probe(context, deadline),
        descriptor_exec=True,
    )


def leased_command_surfaces(
    context: NativeChildContext,
) -> tuple[Path, Path, Path]:
    """Return ``(lease root, cwd, TMPDIR)`` for one leased native context.

    This is the whole reason the surfaces were split.  Confinement is resolved
    per option beneath the lease **root**, so an ``--image_path`` into
    ``<lease>/packet/images`` -- written by the packet extractor, not by this
    command -- is admissible, while a write option naming that same directory,
    and anything outside the lease, are both refused.  The child is launched in
    ``<lease>/work`` and given ``TMPDIR=<lease>/tmp``.

    Nothing is created or removed here.  The parent created all three at 0700
    inside the lease root before the child existed and purges the whole tree
    after every child outcome, including SIGKILL; a child-side ``rmdir`` would
    fight that purge, and the accessors below only read transported strings that
    the child already verified against its leased descriptor at receipt.
    """

    if type(context) is not NativeChildContext:
        raise _fail(
            "leased COLMAP planning requires the carried native child context",
            _ENGINE_FAILED,
        )
    try:
        workspace = Path(context.workspace_path())
        cwd = Path(
            context.workspace_subdirectory_path(NATIVE_WORKSPACE_COMMAND_SUBDIRECTORY)
        )
        temp_directory = Path(
            context.workspace_subdirectory_path(NATIVE_WORKSPACE_TEMP_SUBDIRECTORY)
        )
    except AdapterError:
        raise
    except BaseException:
        raise _fail(
            "cannot read the leased COLMAP command workspace",
            _ENGINE_FAILED,
        ) from None
    return workspace, cwd, temp_directory


def plan_leased_colmap_command(
    command: Sequence[str],
    *,
    toolchain: ColmapToolchain,
    context: NativeChildContext,
    deadline: RefineDeadline,
) -> PinnedColmapCommand:
    """Plan the production shape against the workspace lease's three surfaces.

    This keeps :func:`plan_qualified_colmap_command`'s guard that the toolchain
    was installed at the *production* location, so a toolchain loaded against a
    substituted prefix cannot reach the supervisor through this door.  Tests
    that must use a fake prefix go through :func:`leased_command_surfaces` plus
    :func:`plan_pinned_colmap_command`, exactly as they already do for the
    non-leased shape.
    """

    workspace, cwd, temp_directory = leased_command_surfaces(context)
    return plan_qualified_colmap_command(
        command,
        toolchain=toolchain,
        workspace=workspace,
        cwd=cwd,
        temp_directory=temp_directory,
        context=context,
        deadline=deadline,
    )
