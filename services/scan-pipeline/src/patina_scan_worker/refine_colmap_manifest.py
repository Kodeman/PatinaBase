"""Derive and install the pinned COLMAP toolchain manifest from a live install.

``refine_colmap_toolchain.load_qualified_colmap_toolchain`` refuses to load
unless it can read a canonical manifest at ``<prefix>/share/patina/
refine-colmap-toolchain-v1.manifest.json``.  That file is not produced by
``install-colmap-4.0.2.sh``, so on the qualified box the whole toolchain pin --
executable identity, the CUDA/gcc/driver pins, the build-banner check -- is
written, tested, and inert.  This module is the emitter that closes that gap
(P2 finding F5) *without* re-running the installer or rebuilding COLMAP.

Why an emitter rather than a hand-written file
----------------------------------------------

Hand-transcription is the least reliable link in this chain, and it has already
produced one real bug here: the build banner was pinned without the parentheses
the binary actually prints.  The trap is still live on the box --
``/opt/patina/scan-pipeline-artifacts/pycolmap-4.0.2-cuda118-sm75/artifact.json``
records ``colmapBuild`` as the *unparenthesized* ``Commit d927f7e on 2026-03-18
with CUDA``, while :data:`~.refine_colmap_toolchain.QUALIFIED_COLMAP_BUILD_BANNER`
is the parenthesized second line of ``colmap -h``.  An operator copying the
nearest-looking value from the artifact receipt writes a manifest that fails
closed.  So :data:`MEASURED_FIELDS` are read from the live install and nothing
else; the banner in particular is taken verbatim from the binary's own output,
with whatever punctuation it actually prints.

Measured, declared, and pinned -- stated precisely
--------------------------------------------------

The nineteen fields are not all the same kind of thing, and calling them all
"derived" would overclaim:

* :data:`MEASURED_FIELDS` -- read out of the live install.  Hashes, sizes,
  program output, and receipted build facts.  These are measurements.
* :data:`DECLARED_LOCATION_FIELDS` -- install *locations*.  Their value comes
  from this repository's ``QUALIFIED_*`` constants, which are the single source
  of truth the loader itself compares against; the emitter's contribution is to
  *prove the live box actually has that path* in the expected shape.  Copying a
  constant out of the module it is validated against is not transcription, but
  it is a declaration checked against the box, not a measurement of it.
* ``schema`` -- :data:`~.refine_colmap_toolchain.TOOLCHAIN_MANIFEST_SCHEMA`,
  imported, never spelled again.

Nothing is defaulted, inferred, or carried from a report.  Every derivation
raises :class:`~.refine_adapter.AdapterError` on the first value it cannot read,
so a partial manifest is never rendered and never written.

Self-verification
-----------------

Before anything is written, the rendered bytes are put through the *real*
validators in :mod:`~.refine_colmap_toolchain` -- :func:`parse_toolchain_manifest`
and :func:`assert_qualified_box_identity` -- not a local restatement of their
rules.  ``--install`` additionally re-hashes the binary after rendering (so a
mid-run substitution is caught) and, once the file is in place, loads the whole
prefix back through :func:`load_colmap_toolchain` itself.  If that load-back
fails, the write is rolled back rather than left for the worker to trip over.

This module does not enable, register, compose, or dispatch any Refine stage.
It writes one file that a disabled prerequisite will read if it is ever turned
on.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import stat
import subprocess
import sys
from pathlib import Path, PurePosixPath

from . import refine_colmap_toolchain as _toolchain
from .refine_adapter import AdapterError
from .refine_colmap_toolchain import (
    COLMAP_EXECUTABLE_RELATIVE_PATH,
    TOOLCHAIN_MANIFEST_RELATIVE_PATH,
    TOOLCHAIN_MANIFEST_SCHEMA,
    ColmapToolchainManifest,
    QualifiedBoxLocation,
    assert_qualified_box_identity,
    load_colmap_toolchain,
    parse_toolchain_manifest,
)

# The five install-location constants are read off the module object at call
# time rather than bound here at import.  ``assert_qualified_box_identity``
# resolves them the same way, so the emitter's defaults and the validator that
# judges them can never disagree -- and a test that substitutes a fake box
# substitutes both at once, which is what lets the whole install path be proved
# on a developer machine instead of only as root on the qualified host.

#: The PyCOLMAP build receipt ``install-colmap-4.0.2.sh`` publishes.  Its
#: ``wheelSha256`` is the only place the qualified wheel digest exists on the
#: box, which is why the manifest reads it here rather than re-hashing a wheel
#: that may have been installed and removed.
QUALIFIED_PYCOLMAP_ARTIFACT_DIR = (
    "/opt/patina/scan-pipeline-artifacts/pycolmap-4.0.2-cuda118-sm75"
)

#: NVIDIA's kernel-module version node.  A plain procfs read: it reports the
#: loaded driver without opening a device, creating a CUDA context, or adding
#: any GPU work.
NVIDIA_DRIVER_VERSION_PATH = "/proc/driver/nvidia/version"

#: Fields measured from the live install.  See the module docstring for why the
#: split from :data:`DECLARED_LOCATION_FIELDS` is stated rather than blurred.
MEASURED_FIELDS = (
    "colmapBuildBanner",
    "colmapExecutableSha256",
    "colmapExecutableSizeBytes",
    "colmapSourceCommit",
    "colmapSourceTree",
    "colmapVersion",
    "cudaArchitecture",
    "cudaRelease",
    "hostCompilerVersion",
    "nvccVersion",
    "nvidiaDriverVersion",
    "pycolmapVersion",
    "pycolmapWheelSha256",
)

#: Install-location fields: repo-pinned constants, proved present on the box.
DECLARED_LOCATION_FIELDS = (
    "appDir",
    "colmapPrefix",
    "cudaRoot",
    "hostCCompiler",
    "hostCxxCompiler",
)

_MANIFEST_FILE_MODE = 0o644
_MANIFEST_DIRECTORY_MODE = 0o755
_ROOT_UID = 0
_ROOT_GID = 0

_MAX_PROGRAM_OUTPUT_BYTES = 64 * 1024
_MAX_RECEIPT_BYTES = 64 * 1024
_MAX_EXECUTABLE_BYTES = 256 * 1024 * 1024
_PROGRAM_TIMEOUT_SECONDS = 60.0
_READ_BYTES = 1024 * 1024

_COLMAP_HEADER_PREFIX = "COLMAP "
_DOTTED_VERSION = re.compile(r"[0-9]+(?:\.[0-9]+)+")


def _fail(message: str) -> AdapterError:
    return AdapterError(message, "REFINE_TOOLCHAIN_UNQUALIFIED")


# --------------------------------------------------------------------------
# Bounded readers
# --------------------------------------------------------------------------


def _read_bounded_file(path: str, *, limit: int, label: str) -> bytes:
    """Read one regular file through its own descriptor, size-bounded."""

    try:
        descriptor = os.open(path, os.O_RDONLY | getattr(os, "O_CLOEXEC", 0))
    except OSError as exc:
        raise _fail(f"cannot open {label} at {path}: {exc.strerror}") from None
    try:
        metadata = os.fstat(descriptor)
        if not stat.S_ISREG(metadata.st_mode):
            raise _fail(f"{label} at {path} is not a regular file")
        if metadata.st_size < 1 or metadata.st_size > limit:
            raise _fail(f"{label} at {path} is outside its size bounds")
        payload = os.pread(descriptor, metadata.st_size, 0)
    except OSError as exc:
        raise _fail(f"cannot read {label} at {path}: {exc.strerror}") from None
    finally:
        try:
            os.close(descriptor)
        except OSError:
            pass
    if len(payload) != metadata.st_size:
        raise _fail(f"{label} at {path} changed while it was read")
    return payload


def _read_bounded_stream(path: str, *, limit: int, label: str) -> bytes:
    """Read a file whose ``st_size`` is not its content length.

    ``/proc/driver/nvidia/version`` is a procfs node: it stats as **zero bytes**
    and materializes its content only when read, so the ``st_size``-sized
    ``pread`` in :func:`_read_bounded_file` refuses it as "outside its size
    bounds".  That is not a hypothetical -- it is what the first ``--print``
    against the real box did, and no ``tmp_path`` fixture could have shown it,
    because a regular file's size is always its length.

    The bound is therefore enforced on what was actually read rather than on a
    stat that means nothing here: one byte over ``limit`` is a refusal, so a
    node that streams without end cannot exhaust memory.
    """

    try:
        descriptor = os.open(path, os.O_RDONLY | getattr(os, "O_CLOEXEC", 0))
    except OSError as exc:
        raise _fail(f"cannot open {label} at {path}: {exc.strerror}") from None
    chunks: list[bytes] = []
    total = 0
    try:
        while total <= limit:
            try:
                block = os.read(descriptor, min(_READ_BYTES, limit + 1 - total))
            except OSError as exc:
                raise _fail(f"cannot read {label} at {path}: {exc.strerror}") from None
            if not block:
                break
            chunks.append(block)
            total += len(block)
    finally:
        try:
            os.close(descriptor)
        except OSError:
            pass
    if total > limit:
        raise _fail(f"{label} at {path} exceeds its byte ceiling")
    if not total:
        raise _fail(f"{label} at {path} is empty")
    return b"".join(chunks)


def _run_program(argv: tuple[str, ...], *, label: str, cuda_root: str) -> str:
    """Run one bounded, non-shell probe and return its merged output.

    The child gets a closed environment, never the ambient one: the same
    headless/ASCII shape ``build_command_environment`` hands a real COLMAP
    child, so a probe cannot pick up a display, a locale, or a library path from
    whoever invoked the emitter.  ``stderr`` is merged into ``stdout`` because
    ``install-colmap-4.0.2.sh``'s ``verify_colmap_binary`` receipts the banner
    from exactly that merged stream, and this must observe what it receipted.
    """

    environ = {
        "LANG": "C",
        "LC_ALL": "C",
        "LD_LIBRARY_PATH": (PurePosixPath(cuda_root) / "lib64").as_posix(),
        "PATH": "/usr/sbin:/usr/bin:/sbin:/bin",
        # COLMAP links Qt; force headless so no display is ever attempted.
        "QT_QPA_PLATFORM": "offscreen",
    }
    try:
        completed = subprocess.run(  # noqa: S603 - fixed argv, no shell
            list(argv),
            stdin=subprocess.DEVNULL,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            env=environ,
            timeout=_PROGRAM_TIMEOUT_SECONDS,
            shell=False,
        )
    except subprocess.TimeoutExpired:
        raise _fail(f"{label} did not finish within its timeout") from None
    except OSError as exc:
        raise _fail(f"cannot run {label}: {exc.strerror}") from None
    if completed.returncode != 0:
        raise _fail(f"{label} exited {completed.returncode}")
    output = completed.stdout or b""
    if not output:
        raise _fail(f"{label} produced no output")
    if len(output) > _MAX_PROGRAM_OUTPUT_BYTES:
        raise _fail(f"{label} produced more output than its ceiling allows")
    try:
        return output.decode("ascii")
    except UnicodeDecodeError:
        raise _fail(f"{label} produced non-ASCII output") from None


def _require_directory(path: str, *, label: str) -> str:
    try:
        metadata = os.stat(path)
    except OSError as exc:
        raise _fail(f"cannot stat the declared {label} at {path}: {exc.strerror}")
    if not stat.S_ISDIR(metadata.st_mode):
        raise _fail(f"the declared {label} at {path} is not a directory")
    return path


def _require_executable(path: str, *, label: str) -> str:
    try:
        metadata = os.stat(path)
    except OSError as exc:
        raise _fail(f"cannot stat the declared {label} at {path}: {exc.strerror}")
    if not stat.S_ISREG(metadata.st_mode) or not metadata.st_mode & stat.S_IXUSR:
        raise _fail(f"the declared {label} at {path} is not an executable file")
    return path


# --------------------------------------------------------------------------
# Individual derivations
# --------------------------------------------------------------------------


def hash_executable(path: str) -> tuple[str, int]:
    """Return ``(sha256, size_bytes)`` of the installed COLMAP binary.

    Hashed through one descriptor and re-stat'd afterwards, so a binary
    rewritten underneath the read is reported as a failure rather than hashed
    into a manifest that no longer describes it.
    """

    try:
        descriptor = os.open(path, os.O_RDONLY | getattr(os, "O_CLOEXEC", 0))
    except OSError as exc:
        raise _fail(f"cannot open the COLMAP executable: {exc.strerror}") from None
    try:
        before = os.fstat(descriptor)
        if not stat.S_ISREG(before.st_mode):
            raise _fail("the COLMAP executable is not a regular file")
        if before.st_size < 1 or before.st_size > _MAX_EXECUTABLE_BYTES:
            raise _fail("the COLMAP executable is outside its size bounds")
        digest = hashlib.sha256()
        offset = 0
        while offset < before.st_size:
            try:
                block = os.pread(
                    descriptor, min(_READ_BYTES, before.st_size - offset), offset
                )
            except OSError as exc:
                raise _fail(
                    f"cannot read the COLMAP executable: {exc.strerror}"
                ) from None
            if not block:
                raise _fail("the COLMAP executable ended before its declared size")
            digest.update(block)
            offset += len(block)
        after = os.fstat(descriptor)
        if (
            after.st_size != before.st_size
            or after.st_ino != before.st_ino
            or after.st_ctime_ns != before.st_ctime_ns
            or after.st_mtime_ns != before.st_mtime_ns
        ):
            raise _fail("the COLMAP executable changed while it was hashed")
    finally:
        try:
            os.close(descriptor)
        except OSError:
            pass
    return digest.hexdigest(), before.st_size


def read_colmap_banner(executable: str, *, cuda_root: str) -> tuple[str, str]:
    """Return ``(version, build_banner)`` from the binary's own ``-h`` output.

    The banner is line two, taken **verbatim** -- the parentheses the binary
    prints are part of the value, and stripping or re-punctuating them is the
    exact defect this emitter exists to make impossible.  The version is read
    from line one rather than assumed, so a prefix holding some other COLMAP
    build is rejected by ``assert_qualified_box_identity`` instead of being
    described by a pinned constant that was never checked against it.
    """

    output = _run_program((executable, "-h"), label="`colmap -h`", cuda_root=cuda_root)
    lines = output.split("\n")
    if len(lines) < 2:
        raise _fail("`colmap -h` did not print a header and a build banner")
    header = lines[0]
    banner = lines[1]
    if not header.startswith(_COLMAP_HEADER_PREFIX):
        raise _fail("`colmap -h` did not print a COLMAP header on its first line")
    fields = header.split()
    if len(fields) < 2 or not fields[1]:
        raise _fail("`colmap -h` header carries no version token")
    if not banner:
        raise _fail("`colmap -h` printed an empty build banner")
    return fields[1], banner


def read_host_compiler_version(compiler: str, *, cuda_root: str) -> str:
    """Return the exact ``gcc-11 -dumpfullversion`` string, whitespace-stripped."""

    output = _run_program(
        (compiler, "-dumpfullversion"),
        label=f"`{compiler} -dumpfullversion`",
        cuda_root=cuda_root,
    )
    version = output.strip()
    if not version or any(character.isspace() for character in version):
        raise _fail("the host compiler did not print a single version token")
    return version


def read_pycolmap_receipt(artifact_directory: str) -> dict[str, str]:
    """Read the qualified PyCOLMAP build receipt published by the installer."""

    path = os.path.join(artifact_directory, "artifact.json")
    payload = _read_bounded_file(
        path, limit=_MAX_RECEIPT_BYTES, label="the PyCOLMAP artifact receipt"
    )
    try:
        document = json.loads(payload.decode("ascii"))
    except (UnicodeDecodeError, ValueError):
        raise _fail(f"the PyCOLMAP artifact receipt at {path} is not ASCII JSON")
    if type(document) is not dict:
        raise _fail(f"the PyCOLMAP artifact receipt at {path} is not an object")
    wanted = ("cudaArchitecture", "cudaVersion", "sourceCommit", "sourceTree",
              "wheelFile", "wheelSha256")
    receipt: dict[str, str] = {}
    for key in wanted:
        value = document.get(key)
        if type(value) is not str or not value:
            raise _fail(
                f"the PyCOLMAP artifact receipt at {path} has no usable {key}"
            )
        receipt[key] = value
    return receipt


def pycolmap_version_from_wheel(wheel_file: str) -> str:
    """Read the PyCOLMAP version out of the receipted wheel filename."""

    prefix = "pycolmap-"
    if not wheel_file.startswith(prefix) or not wheel_file.endswith(".whl"):
        raise _fail("the receipted PyCOLMAP wheel filename is not a pycolmap wheel")
    remainder = wheel_file[len(prefix) :].split("-", 1)[0]
    if not remainder:
        raise _fail("the receipted PyCOLMAP wheel filename carries no version")
    return remainder


def read_nvcc_version(cuda_root: str) -> str:
    """Read the nvcc component version from the CUDA toolkit's own manifest.

    ``version.json`` is a plain file the toolkit ships.  Reading it reports the
    installed nvcc without executing ``nvcc``, loading a CUDA library, opening a
    device, or adding any GPU work.
    """

    path = os.path.join(cuda_root, "version.json")
    payload = _read_bounded_file(
        path, limit=_MAX_RECEIPT_BYTES, label="the CUDA toolkit version manifest"
    )
    try:
        document = json.loads(payload.decode("ascii"))
    except (UnicodeDecodeError, ValueError):
        raise _fail(f"the CUDA toolkit version manifest at {path} is not ASCII JSON")
    if type(document) is not dict:
        raise _fail(f"the CUDA toolkit version manifest at {path} is not an object")
    component = document.get("cuda_nvcc")
    if type(component) is not dict:
        raise _fail(f"the CUDA toolkit version manifest at {path} declares no nvcc")
    version = component.get("version")
    if type(version) is not str or not version:
        raise _fail(f"the CUDA toolkit version manifest at {path} has no nvcc version")
    return version


def read_nvidia_driver_version(path: str = NVIDIA_DRIVER_VERSION_PATH) -> str:
    """Read the loaded NVIDIA driver release from procfs.

    A file read, not a device probe: nothing here opens ``/dev/nvidia*``,
    initialises CUDA, or adds GPU load.

    Read through :func:`_read_bounded_stream` because this is procfs and stats
    as zero bytes; see that function for the failure this shape actually caused.
    """

    payload = _read_bounded_stream(
        path, limit=_MAX_RECEIPT_BYTES, label="the NVIDIA driver version node"
    )
    try:
        text = payload.decode("ascii")
    except UnicodeDecodeError:
        raise _fail(f"the NVIDIA driver version node at {path} is not ASCII") from None
    for line in text.split("\n"):
        if "NVRM version:" not in line:
            continue
        for token in line.split():
            if _DOTTED_VERSION.fullmatch(token):
                return token
        raise _fail(f"the NVRM line at {path} carries no driver version token")
    raise _fail(f"the NVIDIA driver version node at {path} has no NVRM line")


# --------------------------------------------------------------------------
# Derivation, rendering, verification
# --------------------------------------------------------------------------


class ManifestSources:
    """Where one derivation reads each value from.

    Every attribute defaults to the production constant.  They are parameters
    for exactly the reason :class:`~.refine_colmap_toolchain.QualifiedBoxLocation`
    is: ``/opt/colmap/4.0.2`` cannot be created ``root:root`` on a developer
    macOS box, and a mechanism provable only on the real host is the shape this
    program has repeatedly found hides regressions from the gate.
    """

    __slots__ = (
        "app_dir",
        "artifact_directory",
        "colmap_prefix",
        "cuda_root",
        "driver_version_path",
        "host_c_compiler",
        "host_cxx_compiler",
        "owner_gid",
        "owner_uid",
        "require_elf",
    )

    def __init__(
        self,
        *,
        colmap_prefix: str | None = None,
        app_dir: str | None = None,
        cuda_root: str | None = None,
        host_c_compiler: str | None = None,
        host_cxx_compiler: str | None = None,
        artifact_directory: str = QUALIFIED_PYCOLMAP_ARTIFACT_DIR,
        driver_version_path: str = NVIDIA_DRIVER_VERSION_PATH,
        owner_uid: int = _ROOT_UID,
        owner_gid: int = _ROOT_GID,
        require_elf: bool = True,
    ) -> None:
        self.colmap_prefix = (
            _toolchain.QUALIFIED_COLMAP_PREFIX if colmap_prefix is None
            else colmap_prefix
        )
        self.app_dir = _toolchain.QUALIFIED_APP_DIR if app_dir is None else app_dir
        self.cuda_root = (
            _toolchain.QUALIFIED_CUDA_ROOT if cuda_root is None else cuda_root
        )
        self.host_c_compiler = (
            _toolchain.QUALIFIED_HOST_C_COMPILER if host_c_compiler is None
            else host_c_compiler
        )
        self.host_cxx_compiler = (
            _toolchain.QUALIFIED_HOST_CXX_COMPILER if host_cxx_compiler is None
            else host_cxx_compiler
        )
        self.artifact_directory = artifact_directory
        self.driver_version_path = driver_version_path
        # Deliberately Python-level only, with no CLI flag.  The installed
        # prefix being writable by ``root`` alone is what makes every hash and
        # metadata guarantee in ``refine_colmap_toolchain`` mean anything, so an
        # operator must not be able to relax it from a command line.  Tests
        # substitute it for the same reason ``QualifiedBoxLocation`` is
        # substitutable: a fake prefix under ``tmp_path`` is owned by whoever
        # runs the suite, and a proof that runs only as Linux root is the shape
        # that has hidden regressions from this program's gate before.
        self.owner_uid = owner_uid
        self.owner_gid = owner_gid
        self.require_elf = require_elf

    def box_location(self) -> QualifiedBoxLocation:
        """The install location this derivation must be proved against."""

        return QualifiedBoxLocation(
            colmap_prefix=self.colmap_prefix,
            app_dir=self.app_dir,
            cuda_root=self.cuda_root,
        )

    def executable_path(self) -> str:
        return (
            PurePosixPath(self.colmap_prefix) / COLMAP_EXECUTABLE_RELATIVE_PATH
        ).as_posix()

    def manifest_path(self) -> str:
        return (
            PurePosixPath(self.colmap_prefix) / TOOLCHAIN_MANIFEST_RELATIVE_PATH
        ).as_posix()


def derive_manifest_fields(sources: ManifestSources | None = None) -> dict[str, object]:
    """Derive all nineteen manifest fields from one live install.

    Raises on the first value it cannot read.  There is no default, no fallback,
    and no partial result: a caller either gets every field or an
    :class:`~.refine_adapter.AdapterError`.
    """

    sources = ManifestSources() if sources is None else sources
    if type(sources) is not ManifestSources:
        raise _fail("manifest derivation requires declared sources")

    prefix = _require_directory(sources.colmap_prefix, label="COLMAP prefix")
    app_dir = _require_directory(sources.app_dir, label="APP_DIR")
    cuda_root = _require_directory(sources.cuda_root, label="CUDA root")
    host_cc = _require_executable(sources.host_c_compiler, label="host C compiler")
    host_cxx = _require_executable(
        sources.host_cxx_compiler, label="host C++ compiler"
    )
    executable = _require_executable(
        sources.executable_path(), label="COLMAP executable"
    )

    digest, size_bytes = hash_executable(executable)
    version, banner = read_colmap_banner(executable, cuda_root=cuda_root)
    receipt = read_pycolmap_receipt(sources.artifact_directory)

    fields: dict[str, object] = {
        "appDir": app_dir,
        "colmapBuildBanner": banner,
        "colmapExecutableSha256": digest,
        "colmapExecutableSizeBytes": size_bytes,
        "colmapPrefix": prefix,
        "colmapSourceCommit": receipt["sourceCommit"],
        "colmapSourceTree": receipt["sourceTree"],
        "colmapVersion": version,
        "cudaArchitecture": receipt["cudaArchitecture"],
        "cudaRelease": receipt["cudaVersion"],
        "cudaRoot": cuda_root,
        "hostCCompiler": host_cc,
        "hostCompilerVersion": read_host_compiler_version(
            host_cc, cuda_root=cuda_root
        ),
        "hostCxxCompiler": host_cxx,
        "nvccVersion": read_nvcc_version(cuda_root),
        "nvidiaDriverVersion": read_nvidia_driver_version(sources.driver_version_path),
        "pycolmapVersion": pycolmap_version_from_wheel(receipt["wheelFile"]),
        "pycolmapWheelSha256": receipt["wheelSha256"],
        "schema": TOOLCHAIN_MANIFEST_SCHEMA,
    }
    missing = sorted(
        name
        for name in (*MEASURED_FIELDS, *DECLARED_LOCATION_FIELDS, "schema")
        if fields.get(name) in (None, "")
    )
    if missing:
        raise _fail(
            "refusing a partial COLMAP toolchain manifest; "
            f"underived: {', '.join(missing)}"
        )
    return fields


def render_manifest_bytes(fields: dict[str, object]) -> bytes:
    """Render the canonical payload the loader will re-canonicalize and compare.

    Byte-for-byte the shape ``install-colmap-4.0.2.sh``'s ``artifact.json``
    emitter produces and ``parse_toolchain_manifest`` requires: sorted keys, no
    separator padding, ASCII-escaped, one trailing newline.
    """

    try:
        text = json.dumps(
            fields,
            sort_keys=True,
            separators=(",", ":"),
            ensure_ascii=True,
            allow_nan=False,
        )
    except (RecursionError, TypeError, ValueError) as exc:
        raise _fail("the derived COLMAP toolchain manifest is not canonicalizable") from exc
    return (text + "\n").encode("ascii")


def verify_manifest_payload(
    payload: bytes,
    *,
    sources: ManifestSources,
    executable_digest: str | None = None,
    executable_size: int | None = None,
) -> ColmapToolchainManifest:
    """Prove the payload satisfies the loader's contract, using its validators.

    The rules are not restated here.  :func:`parse_toolchain_manifest` and
    :func:`assert_qualified_box_identity` are imported from the module that will
    reject the file at runtime, so a rule that changes there changes here in the
    same commit or this refuses.

    ``executable_digest``/``executable_size``, when supplied, are compared
    against the manifest's own claims.  ``--install`` passes a *fresh* re-hash,
    which is what turns "the bytes were right when we rendered them" into "the
    bytes are still right at the moment we write".
    """

    manifest = parse_toolchain_manifest(payload)
    assert_qualified_box_identity(manifest, location=sources.box_location())
    if manifest.colmap_prefix != PurePosixPath(sources.colmap_prefix).as_posix():
        raise _fail(
            "the derived COLMAP toolchain manifest prefix does not match its "
            "installation"
        )
    if executable_digest is not None and manifest.colmap_executable_sha256 != (
        executable_digest
    ):
        raise _fail("the COLMAP executable changed after the manifest was derived")
    if executable_size is not None and manifest.colmap_executable_size_bytes != (
        executable_size
    ):
        raise _fail("the COLMAP executable size changed after the manifest was derived")
    return manifest


# --------------------------------------------------------------------------
# Install
# --------------------------------------------------------------------------


def _existing_manifest_bytes(path: str) -> bytes | None:
    try:
        return _read_bounded_file(
            path, limit=_MAX_RECEIPT_BYTES, label="the installed toolchain manifest"
        )
    except AdapterError:
        if os.path.lexists(path):
            raise
        return None


def _ensure_manifest_directory(directory: str, *, owner_uid: int, owner_gid: int) -> None:
    """Create the manifest's parent owner-owned 0755 if it is not already there.

    The loader walks every component of ``share/patina`` by descriptor and
    refuses any that is group- or world-writable or not owned by the declared
    owner, so a directory created under a loose umask would fail the very load
    this file exists to enable.  The mode is therefore set explicitly, never
    inherited.  An existing directory is *checked*, never relaxed: a
    ``share/patina`` already present in a shape the loader would refuse is a
    refusal here, not something this quietly chmods into compliance.
    """

    try:
        metadata = os.stat(directory)
    except FileNotFoundError:
        parent = os.path.dirname(directory)
        if parent and not os.path.isdir(parent):
            _ensure_manifest_directory(
                parent, owner_uid=owner_uid, owner_gid=owner_gid
            )
        try:
            os.mkdir(directory, _MANIFEST_DIRECTORY_MODE)
        except OSError as exc:
            raise _fail(
                f"cannot create the manifest directory {directory}: {exc.strerror}"
            ) from None
        try:
            os.chmod(directory, _MANIFEST_DIRECTORY_MODE)
            os.chown(directory, owner_uid, owner_gid)
        except OSError as exc:
            raise _fail(
                f"cannot secure the manifest directory {directory}: {exc.strerror}"
            ) from None
        return
    except OSError as exc:
        raise _fail(
            f"cannot inspect the manifest directory {directory}: {exc.strerror}"
        ) from None
    if not stat.S_ISDIR(metadata.st_mode):
        raise _fail(f"the manifest directory {directory} is not a directory")
    if metadata.st_uid != owner_uid or metadata.st_mode & 0o022:
        raise _fail(
            f"the manifest directory {directory} is not owned by uid {owner_uid} "
            "and non-group/world-writable; the loader would refuse it"
        )


def _write_candidate(
    directory: str, payload: bytes, *, owner_uid: int, owner_gid: int
) -> str:
    candidate = os.path.join(directory, f".refine-toolchain-manifest.{os.getpid()}")
    try:
        descriptor = os.open(
            candidate,
            os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW,
            _MANIFEST_FILE_MODE,
        )
    except OSError as exc:
        raise _fail(f"cannot stage the toolchain manifest: {exc.strerror}") from None
    try:
        written = os.write(descriptor, payload)
        if written != len(payload):
            raise _fail("the staged toolchain manifest was truncated")
        os.fchmod(descriptor, _MANIFEST_FILE_MODE)
        os.fchown(descriptor, owner_uid, owner_gid)
        os.fsync(descriptor)
    except OSError as exc:
        try:
            os.unlink(candidate)
        except OSError:
            pass
        raise _fail(f"cannot stage the toolchain manifest: {exc.strerror}") from None
    except BaseException:
        try:
            os.unlink(candidate)
        except OSError:
            pass
        raise
    finally:
        try:
            os.close(descriptor)
        except OSError:
            pass
    return candidate


def install_manifest(
    payload: bytes,
    *,
    sources: ManifestSources,
    force: bool = False,
) -> str:
    """Write the verified manifest root-owned 0644 and load the prefix back.

    Refuses an existing manifest unless ``force``.  The refusal is not a
    check-then-write race: the non-forcing path publishes with :func:`os.link`,
    which fails ``EEXIST`` atomically, so a manifest that appears between the
    check and the publish is still refused.

    After publishing, the whole prefix is loaded through
    :func:`~.refine_colmap_toolchain.load_colmap_toolchain` -- the real loader,
    not a restatement of it.  If that fails the write is rolled back: a created
    file is removed, and a forced replacement is restored from the bytes read
    before it was overwritten.  The box is never left holding a manifest that
    fails closed.
    """

    manifest_path = sources.manifest_path()
    directory = os.path.dirname(manifest_path)
    previous = _existing_manifest_bytes(manifest_path)
    if previous is not None and not force:
        raise _fail(
            f"a toolchain manifest already exists at {manifest_path}; "
            "pass --force to replace it"
        )
    _ensure_manifest_directory(
        directory, owner_uid=sources.owner_uid, owner_gid=sources.owner_gid
    )
    candidate = _write_candidate(
        directory, payload, owner_uid=sources.owner_uid, owner_gid=sources.owner_gid
    )
    published = False
    try:
        if previous is None:
            try:
                os.link(candidate, manifest_path)
            except FileExistsError:
                raise _fail(
                    f"a toolchain manifest appeared at {manifest_path} while it "
                    "was being written; refusing to overwrite it"
                ) from None
            except OSError as exc:
                raise _fail(
                    f"cannot publish the toolchain manifest: {exc.strerror}"
                ) from None
        else:
            try:
                os.replace(candidate, manifest_path)
            except OSError as exc:
                raise _fail(
                    f"cannot replace the toolchain manifest: {exc.strerror}"
                ) from None
        published = True
    finally:
        if not published or previous is None:
            try:
                os.unlink(candidate)
            except OSError:
                pass

    try:
        toolchain = load_colmap_toolchain(
            Path(sources.colmap_prefix),
            remaining_seconds=lambda: float(_PROGRAM_TIMEOUT_SECONDS),
            require_elf=sources.require_elf,
            owner_uid=sources.owner_uid,
            box_location=sources.box_location(),
        )
    except BaseException:
        _roll_back(manifest_path, previous, sources=sources)
        raise
    toolchain.close()
    return manifest_path


def _roll_back(
    manifest_path: str, previous: bytes | None, *, sources: ManifestSources
) -> None:
    """Undo a publish whose load-back failed.

    Best-effort by construction: if the restore itself fails there is nothing
    further this can do, and the original failure -- not a secondary one -- is
    what the caller must see.  The created-file case is exact; the forced-replace
    case restores the bytes read before the overwrite.
    """

    if previous is None:
        try:
            os.unlink(manifest_path)
        except OSError:
            pass
        return
    directory = os.path.dirname(manifest_path)
    try:
        restored = _write_candidate(
            directory,
            previous,
            owner_uid=sources.owner_uid,
            owner_gid=sources.owner_gid,
        )
        os.replace(restored, manifest_path)
    except BaseException:
        pass


# --------------------------------------------------------------------------
# CLI
# --------------------------------------------------------------------------


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="python -m patina_scan_worker.refine_colmap_manifest",
        description=(
            "Derive the pinned COLMAP toolchain manifest from the live install. "
            "--print writes nothing and needs no privileges; --install writes "
            "the manifest root-owned 0644 and refuses to overwrite one."
        ),
    )
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument(
        "--print",
        dest="print_only",
        action="store_true",
        help="derive, verify, and print the manifest to stdout; write nothing",
    )
    mode.add_argument(
        "--install",
        action="store_true",
        help="derive, verify, and write the manifest to the pinned path",
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="with --install, replace an existing manifest",
    )
    parser.add_argument("--prefix", default=_toolchain.QUALIFIED_COLMAP_PREFIX)
    parser.add_argument("--app-dir", default=_toolchain.QUALIFIED_APP_DIR)
    parser.add_argument("--cuda-root", default=_toolchain.QUALIFIED_CUDA_ROOT)
    parser.add_argument("--host-cc", default=_toolchain.QUALIFIED_HOST_C_COMPILER)
    parser.add_argument("--host-cxx", default=_toolchain.QUALIFIED_HOST_CXX_COMPILER)
    parser.add_argument("--artifact-dir", default=QUALIFIED_PYCOLMAP_ARTIFACT_DIR)
    parser.add_argument("--driver-version-file", default=NVIDIA_DRIVER_VERSION_PATH)
    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    if args.force and not args.install:
        parser.error("--force is only meaningful with --install")
    sources = ManifestSources(
        colmap_prefix=args.prefix,
        app_dir=args.app_dir,
        cuda_root=args.cuda_root,
        host_c_compiler=args.host_cc,
        host_cxx_compiler=args.host_cxx,
        artifact_directory=args.artifact_dir,
        driver_version_path=args.driver_version_file,
    )
    try:
        fields = derive_manifest_fields(sources)
        payload = render_manifest_bytes(fields)
        verify_manifest_payload(payload, sources=sources)
        if args.print_only:
            sys.stdout.write(payload.decode("ascii"))
            return 0
        # Re-hash immediately before publishing: the pre-write proof must be
        # about the bytes on disk now, not the bytes read when derivation began.
        digest, size_bytes = hash_executable(sources.executable_path())
        verify_manifest_payload(
            payload,
            sources=sources,
            executable_digest=digest,
            executable_size=size_bytes,
        )
        written = install_manifest(payload, sources=sources, force=args.force)
    except AdapterError as exc:
        sys.stderr.write(f"refusing to emit the COLMAP toolchain manifest: {exc}\n")
        return 2
    sys.stdout.write(f"installed {written}\n")
    return 0


if __name__ == "__main__":  # pragma: no cover - CLI entry
    raise SystemExit(main())
