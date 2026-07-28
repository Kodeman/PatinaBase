"""The toolchain-manifest emitter: derivation, refusals, and the write path.

Every test here builds a *fake* qualified box under ``tmp_path`` and runs the
real emitter against it.  Only the install locations and the declared owner are
substituted -- exactly the two relaxations
:mod:`patina_scan_worker.refine_colmap_toolchain` already documents -- so the
validators doing the judging (:func:`parse_toolchain_manifest`,
:func:`assert_qualified_box_identity`, :func:`load_colmap_toolchain`) are the
production ones, not restatements.

The load-bearing test is
:func:`test_banner_is_taken_verbatim_not_from_the_artifact_receipt`: the
PyCOLMAP receipt on the real box records the build string *without* the
parentheses the binary prints, and an operator reaching for the nearest-looking
value writes a manifest that fails closed.  That is finding F5's original defect
and it is what this emitter exists to make unreachable.
"""

from __future__ import annotations

import hashlib
import json
import os
import stat
import subprocess
import sys
from pathlib import Path

import pytest

from _colmap_toolchain import make_trusted_directory

import patina_scan_worker.refine_colmap_manifest as emitter
import patina_scan_worker.refine_colmap_toolchain as toolchain_module
from patina_scan_worker.refine_adapter import AdapterError
from patina_scan_worker.refine_colmap_toolchain import (
    QUALIFIED_COLMAP_BUILD_BANNER,
    QUALIFIED_COLMAP_SOURCE_COMMIT,
    QUALIFIED_COLMAP_SOURCE_TREE,
    QUALIFIED_COLMAP_VERSION,
    QUALIFIED_CUDA_ARCHITECTURE,
    QUALIFIED_CUDA_RELEASE,
    QUALIFIED_HOST_COMPILER_SERIES,
    QUALIFIED_NVCC_VERSION,
    QUALIFIED_NVIDIA_DRIVER_VERSION,
    QUALIFIED_PYCOLMAP_VERSION,
    TOOLCHAIN_MANIFEST_SCHEMA,
)

#: The exact string the real box's artifact.json records: the build banner
#: WITHOUT the parentheses ``colmap -h`` prints around it.
UNPARENTHESIZED_BUILD = "Commit d927f7e on 2026-03-18 with CUDA"
WHEEL_FILE = "pycolmap-4.0.2-1patinacu118sm75-cp312-cp312-linux_x86_64.whl"
WHEEL_SHA256 = "73a176fa1ecb6bafa920bf3d74cf89ec96a850b2613fb1145229d9961b4779de"


def _write_script(path, body: str) -> None:
    path.write_text(f"#!/bin/sh\n{body}\n", encoding="ascii")
    path.chmod(0o755)


class FakeBox:
    """One fake qualified box, plus the sources that read it."""

    def __init__(self, root):
        self.root = root
        self.prefix = root / "colmap"
        self.app_dir = root / "app"
        self.cuda_root = root / "cuda"
        self.artifact_dir = root / "artifacts"
        self.host_cc = root / "gcc-11"
        self.host_cxx = root / "g++-11"
        self.driver_file = root / "nvidia-version"
        self.executable = self.prefix / "bin" / "colmap"

    def sources(self, **overrides) -> emitter.ManifestSources:
        defaults = dict(
            colmap_prefix=str(self.prefix),
            app_dir=str(self.app_dir),
            cuda_root=str(self.cuda_root),
            artifact_directory=str(self.artifact_dir),
            driver_version_path=str(self.driver_file),
            owner_uid=os.geteuid(),
            owner_gid=os.getegid(),
            require_elf=False,
        )
        defaults.update(overrides)
        return emitter.ManifestSources(**defaults)

    def manifest_path(self):
        return self.prefix / "share" / "patina" / (
            "refine-colmap-toolchain-v1.manifest.json"
        )


@pytest.fixture()
def box(tmp_path, monkeypatch) -> FakeBox:
    """A fake box whose every derivable value matches the pinned constants."""

    fake = FakeBox(tmp_path)
    make_trusted_directory(fake.executable.parent)
    make_trusted_directory(fake.app_dir)
    make_trusted_directory(fake.cuda_root)
    make_trusted_directory(fake.artifact_dir)

    _write_script(
        fake.executable,
        "printf '%s\\n%s\\n' "
        f"'COLMAP {QUALIFIED_COLMAP_VERSION} -- Structure-from-Motion' "
        f"'{QUALIFIED_COLMAP_BUILD_BANNER}'",
    )
    _write_script(fake.host_cc, f"echo {QUALIFIED_HOST_COMPILER_SERIES}.0")
    _write_script(fake.host_cxx, "echo unused")

    (fake.cuda_root / "version.json").write_text(
        json.dumps({"cuda_nvcc": {"version": QUALIFIED_NVCC_VERSION}}),
        encoding="ascii",
    )
    (fake.cuda_root / "version.json").chmod(0o644)
    (fake.artifact_dir / "artifact.json").write_text(
        json.dumps(
            {
                "colmapBuild": UNPARENTHESIZED_BUILD,
                "cudaArchitecture": QUALIFIED_CUDA_ARCHITECTURE,
                "cudaVersion": QUALIFIED_CUDA_RELEASE,
                "sourceCommit": QUALIFIED_COLMAP_SOURCE_COMMIT,
                "sourceTree": QUALIFIED_COLMAP_SOURCE_TREE,
                "wheelFile": WHEEL_FILE,
                "wheelSha256": WHEEL_SHA256,
            }
        ),
        encoding="ascii",
    )
    (fake.artifact_dir / "artifact.json").chmod(0o644)
    fake.driver_file.write_text(
        "NVRM version: NVIDIA UNIX Open Kernel Module for x86_64  "
        f"{QUALIFIED_NVIDIA_DRIVER_VERSION}  Release Build  (dvs-builder@host)\n"
        "GCC version:  gcc version 13.3.0 (Ubuntu 13.3.0-6ubuntu2~24.04.1)\n",
        encoding="ascii",
    )
    fake.driver_file.chmod(0o644)

    # The two compiler paths are compared exactly against the repo constants by
    # assert_qualified_box_identity, so the fake box substitutes the constants
    # themselves.  The emitter reads them off the same module object at call
    # time, so both sides move together and neither can silently disagree.
    monkeypatch.setattr(
        toolchain_module, "QUALIFIED_HOST_C_COMPILER", str(fake.host_cc)
    )
    monkeypatch.setattr(
        toolchain_module, "QUALIFIED_HOST_CXX_COMPILER", str(fake.host_cxx)
    )
    return fake


# --------------------------------------------------------------------------
# Derivation
# --------------------------------------------------------------------------


def test_derives_every_declared_field_from_the_live_install(box):
    fields = emitter.derive_manifest_fields(box.sources())

    assert set(fields) == toolchain_module._MANIFEST_FIELDS
    assert len(fields) == 19
    payload = box.executable.read_bytes()
    assert fields["colmapExecutableSha256"] == hashlib.sha256(payload).hexdigest()
    assert fields["colmapExecutableSizeBytes"] == len(payload)
    assert fields["hostCompilerVersion"] == f"{QUALIFIED_HOST_COMPILER_SERIES}.0"
    assert fields["nvccVersion"] == QUALIFIED_NVCC_VERSION
    assert fields["nvidiaDriverVersion"] == QUALIFIED_NVIDIA_DRIVER_VERSION
    assert fields["pycolmapWheelSha256"] == WHEEL_SHA256
    assert fields["pycolmapVersion"] == QUALIFIED_PYCOLMAP_VERSION
    assert fields["schema"] == TOOLCHAIN_MANIFEST_SCHEMA


def test_banner_is_taken_verbatim_not_from_the_artifact_receipt(box):
    """The F5 defect: the receipt's build string has no parentheses.

    Both strings are present on the real box.  The manifest must carry the one
    the binary prints, and a manifest carrying the receipt's form must be
    refused rather than installed -- which is the second half of this test.
    """

    fields = emitter.derive_manifest_fields(box.sources())

    assert fields["colmapBuildBanner"] == QUALIFIED_COLMAP_BUILD_BANNER
    assert fields["colmapBuildBanner"].startswith("(")
    assert fields["colmapBuildBanner"].endswith(")")
    assert fields["colmapBuildBanner"] != UNPARENTHESIZED_BUILD
    receipt = emitter.read_pycolmap_receipt(str(box.artifact_dir))
    assert "colmapBuild" not in receipt


def test_a_binary_printing_the_unparenthesized_banner_is_refused(box):
    """Mutation: strip the parentheses and the loader's contract must reject."""

    _write_script(
        box.executable,
        "printf '%s\\n%s\\n' "
        f"'COLMAP {QUALIFIED_COLMAP_VERSION} -- Structure-from-Motion' "
        f"'{UNPARENTHESIZED_BUILD}'",
    )
    sources = box.sources()
    payload = emitter.render_manifest_bytes(emitter.derive_manifest_fields(sources))

    with pytest.raises(AdapterError, match="colmapBuildBanner drifted"):
        emitter.verify_manifest_payload(payload, sources=sources)


def test_version_is_read_from_the_header_not_assumed(box):
    _write_script(
        box.executable,
        "printf '%s\\n%s\\n' 'COLMAP 9.9.9 -- Structure-from-Motion' "
        f"'{QUALIFIED_COLMAP_BUILD_BANNER}'",
    )
    sources = box.sources()
    fields = emitter.derive_manifest_fields(sources)

    assert fields["colmapVersion"] == "9.9.9"
    with pytest.raises(AdapterError, match="colmapVersion drifted"):
        emitter.verify_manifest_payload(
            emitter.render_manifest_bytes(fields), sources=sources
        )


@pytest.mark.parametrize(
    ("removed", "expected"),
    [
        ("wheelSha256", "no usable wheelSha256"),
        ("sourceCommit", "no usable sourceCommit"),
        ("sourceTree", "no usable sourceTree"),
        ("cudaVersion", "no usable cudaVersion"),
        ("cudaArchitecture", "no usable cudaArchitecture"),
        ("wheelFile", "no usable wheelFile"),
    ],
)
def test_a_receipt_missing_any_value_is_refused(box, removed, expected):
    path = box.artifact_dir / "artifact.json"
    document = json.loads(path.read_text(encoding="ascii"))
    del document[removed]
    path.write_text(json.dumps(document), encoding="ascii")

    with pytest.raises(AdapterError, match=expected):
        emitter.derive_manifest_fields(box.sources())


def test_a_driver_node_without_an_nvrm_line_is_refused(box):
    box.driver_file.write_text("GCC version: gcc 13.3.0\n", encoding="ascii")

    with pytest.raises(AdapterError, match="no NVRM line"):
        emitter.derive_manifest_fields(box.sources())


def test_the_driver_node_is_read_without_trusting_its_stat_size(tmp_path):
    """Regression: procfs stats as zero bytes and materializes content on read.

    A ``tmp_path`` regular file can never show this -- its size is always its
    length -- so the first ``--print`` against the real box refused with "the
    NVIDIA driver version node is outside its size bounds".  A FIFO is the
    portable stand-in: it also stats as zero bytes while carrying content.
    """

    fifo = tmp_path / "driver-version"
    os.mkfifo(fifo)
    text = (
        "NVRM version: NVIDIA UNIX Open Kernel Module for x86_64  "
        f"{QUALIFIED_NVIDIA_DRIVER_VERSION}  Release Build  (dvs-builder@host)\n"
    )

    writer = os.fork()
    if writer == 0:  # pragma: no cover - child process
        try:
            with open(fifo, "w", encoding="ascii") as stream:
                stream.write(text)
        finally:
            os._exit(0)
    try:
        assert fifo.stat().st_size == 0
        assert emitter.read_nvidia_driver_version(str(fifo)) == (
            QUALIFIED_NVIDIA_DRIVER_VERSION
        )
    finally:
        os.waitpid(writer, 0)


def test_an_oversized_driver_node_is_refused(tmp_path):
    oversized = tmp_path / "driver-version"
    oversized.write_text("NVRM version: x\n" + "0" * (64 * 1024), encoding="ascii")

    with pytest.raises(AdapterError, match="exceeds its byte ceiling"):
        emitter.read_nvidia_driver_version(str(oversized))


def test_an_empty_driver_node_is_refused(tmp_path):
    empty = tmp_path / "driver-version"
    empty.write_text("", encoding="ascii")

    with pytest.raises(AdapterError, match="is empty"):
        emitter.read_nvidia_driver_version(str(empty))


def test_a_cuda_manifest_without_nvcc_is_refused(box):
    (box.cuda_root / "version.json").write_text(
        json.dumps({"cuda_cudart": {"version": "11.8.89"}}), encoding="ascii"
    )

    with pytest.raises(AdapterError, match="declares no nvcc"):
        emitter.derive_manifest_fields(box.sources())


def test_a_binary_printing_an_empty_banner_line_is_refused(box):
    """A header plus a trailing newline leaves line two empty, not absent."""

    _write_script(
        box.executable,
        f"printf '%s\\n' 'COLMAP {QUALIFIED_COLMAP_VERSION} -- Structure-from-Motion'",
    )

    with pytest.raises(AdapterError, match="empty build banner"):
        emitter.derive_manifest_fields(box.sources())


def test_a_binary_printing_only_one_line_is_refused(box):
    """No trailing newline at all: there is no second line to read."""

    _write_script(
        box.executable,
        f"printf '%s' 'COLMAP {QUALIFIED_COLMAP_VERSION} -- Structure-from-Motion'",
    )

    with pytest.raises(AdapterError, match="header and a build banner"):
        emitter.derive_manifest_fields(box.sources())


def test_a_binary_printing_a_foreign_header_is_refused(box):
    _write_script(box.executable, "printf '%s\\n%s\\n' 'NOT COLMAP' 'x'")

    with pytest.raises(AdapterError, match="COLMAP header"):
        emitter.derive_manifest_fields(box.sources())


def test_a_failing_binary_is_refused(box):
    _write_script(box.executable, "exit 3")

    with pytest.raises(AdapterError, match="exited 3"):
        emitter.derive_manifest_fields(box.sources())


def test_a_missing_declared_location_is_refused(box):
    with pytest.raises(AdapterError, match="cannot stat the declared APP_DIR"):
        emitter.derive_manifest_fields(
            box.sources(app_dir=str(box.root / "absent"))
        )


# --------------------------------------------------------------------------
# Rendering
# --------------------------------------------------------------------------


def test_rendered_bytes_are_exactly_canonical(box):
    fields = emitter.derive_manifest_fields(box.sources())
    payload = emitter.render_manifest_bytes(fields)

    assert payload.endswith(b"\n")
    assert b", " not in payload and b": " not in payload
    assert payload == (
        json.dumps(fields, sort_keys=True, separators=(",", ":"), ensure_ascii=True)
        + "\n"
    ).encode("ascii")
    # The loader re-canonicalizes and compares byte-for-byte; this is that check.
    assert toolchain_module.parse_toolchain_manifest(payload) is not None


def test_rendered_bytes_round_trip_through_the_real_parser(box):
    sources = box.sources()
    payload = emitter.render_manifest_bytes(emitter.derive_manifest_fields(sources))
    manifest = emitter.verify_manifest_payload(payload, sources=sources)

    assert manifest.colmap_build_banner == QUALIFIED_COLMAP_BUILD_BANNER
    assert manifest.pycolmap_wheel_sha256 == WHEEL_SHA256


def test_a_stale_digest_is_refused_before_write(box):
    sources = box.sources()
    payload = emitter.render_manifest_bytes(emitter.derive_manifest_fields(sources))

    with pytest.raises(AdapterError, match="executable changed after"):
        emitter.verify_manifest_payload(
            payload, sources=sources, executable_digest="0" * 64
        )
    with pytest.raises(AdapterError, match="size changed after"):
        emitter.verify_manifest_payload(
            payload, sources=sources, executable_size=1
        )


# --------------------------------------------------------------------------
# Install
# --------------------------------------------------------------------------


def _install(box, **overrides):
    sources = box.sources(**overrides)
    payload = emitter.render_manifest_bytes(emitter.derive_manifest_fields(sources))
    emitter.verify_manifest_payload(payload, sources=sources)
    return sources, payload


def test_install_writes_the_manifest_and_loads_it_back(box):
    sources, payload = _install(box)

    written = emitter.install_manifest(payload, sources=sources)

    assert written == str(box.manifest_path())
    assert box.manifest_path().read_bytes() == payload
    metadata = box.manifest_path().stat()
    assert stat.S_IMODE(metadata.st_mode) == 0o644
    assert metadata.st_nlink == 1
    assert stat.S_IMODE(box.manifest_path().parent.stat().st_mode) == 0o755


def test_install_refuses_to_overwrite_an_existing_manifest(box):
    sources, payload = _install(box)
    emitter.install_manifest(payload, sources=sources)
    before = box.manifest_path().read_bytes()

    with pytest.raises(AdapterError, match="already exists"):
        emitter.install_manifest(payload, sources=sources)

    assert box.manifest_path().read_bytes() == before


def test_force_replaces_an_existing_manifest(box):
    sources, payload = _install(box)
    emitter.install_manifest(payload, sources=sources)
    box.manifest_path().write_bytes(b'{"schema":"stale"}\n')

    emitter.install_manifest(payload, sources=sources, force=True)

    assert box.manifest_path().read_bytes() == payload
    assert stat.S_IMODE(box.manifest_path().stat().st_mode) == 0o644


def test_install_leaves_no_candidate_behind(box):
    sources, payload = _install(box)
    emitter.install_manifest(payload, sources=sources)

    siblings = sorted(p.name for p in box.manifest_path().parent.iterdir())
    assert siblings == ["refine-colmap-toolchain-v1.manifest.json"]


def test_install_refuses_a_group_writable_manifest_directory(box):
    sources, payload = _install(box)
    directory = box.manifest_path().parent
    make_trusted_directory(directory)
    directory.chmod(0o775)

    with pytest.raises(AdapterError, match="loader would refuse it"):
        emitter.install_manifest(payload, sources=sources)


def test_a_failed_load_back_rolls_back_a_created_manifest(box, monkeypatch):
    sources, payload = _install(box)

    def boom(*args, **kwargs):
        raise AdapterError("load-back refused", "REFINE_TOOLCHAIN_UNQUALIFIED")

    monkeypatch.setattr(emitter, "load_colmap_toolchain", boom)

    with pytest.raises(AdapterError, match="load-back refused"):
        emitter.install_manifest(payload, sources=sources)

    assert not box.manifest_path().exists()


def test_a_failed_load_back_restores_a_forced_replacement(box, monkeypatch):
    sources, payload = _install(box)
    emitter.install_manifest(payload, sources=sources)
    previous = b'{"schema":"previous"}\n'
    box.manifest_path().write_bytes(previous)

    def boom(*args, **kwargs):
        raise AdapterError("load-back refused", "REFINE_TOOLCHAIN_UNQUALIFIED")

    monkeypatch.setattr(emitter, "load_colmap_toolchain", boom)

    with pytest.raises(AdapterError, match="load-back refused"):
        emitter.install_manifest(payload, sources=sources, force=True)

    assert box.manifest_path().read_bytes() == previous


def test_install_refuses_a_manifest_the_loader_would_reject(box):
    """A payload that fails the box-identity contract never reaches the disk."""

    sources = box.sources()
    fields = emitter.derive_manifest_fields(sources)
    fields["nvccVersion"] = "1.2.3"
    payload = emitter.render_manifest_bytes(fields)

    with pytest.raises(AdapterError, match="nvccVersion drifted"):
        emitter.verify_manifest_payload(payload, sources=sources)
    assert not box.manifest_path().exists()


# --------------------------------------------------------------------------
# CLI
# --------------------------------------------------------------------------


def test_print_emits_the_manifest_and_writes_nothing(box, capsys):
    before = sorted(str(p) for p in box.prefix.rglob("*"))

    assert emitter.main(["--print"], sources=box.sources()) == 0

    printed = capsys.readouterr().out.encode("ascii")
    assert printed == emitter.render_manifest_bytes(
        emitter.derive_manifest_fields(box.sources())
    )
    assert toolchain_module.parse_toolchain_manifest(printed) is not None
    assert sorted(str(p) for p in box.prefix.rglob("*")) == before
    assert not box.manifest_path().exists()


def test_print_reports_a_refusal_on_stderr_and_exits_nonzero(box, capsys):
    box.driver_file.write_text("no nvrm here\n", encoding="ascii")

    assert emitter.main(["--print"], sources=box.sources()) == 2

    captured = capsys.readouterr()
    assert captured.out == ""
    assert "refusing to emit" in captured.err


def test_a_mode_is_required(box):
    with pytest.raises(SystemExit):
        emitter.main([], sources=box.sources())


def test_print_and_install_are_mutually_exclusive(box):
    with pytest.raises(SystemExit):
        emitter.main(["--print", "--install"], sources=box.sources())


def test_force_without_install_is_rejected(box):
    with pytest.raises(SystemExit):
        emitter.main(["--print", "--force"], sources=box.sources())


def test_install_through_the_cli_writes_the_manifest_and_reports_it(box, capsys):
    """The mode the operator will run as root, end to end on a fake box.

    Only reachable because the substituted install lives in a Python-level
    parameter rather than on the command line; the alternative was leaving the
    ``--install`` branch -- the re-hash, the publish, the load-back -- proved
    nowhere but on the qualified host itself.
    """

    assert emitter.main(["--install"], sources=box.sources()) == 0

    assert capsys.readouterr().out == f"installed {box.manifest_path()}\n"
    assert box.manifest_path().read_bytes() == emitter.render_manifest_bytes(
        emitter.derive_manifest_fields(box.sources())
    )
    assert stat.S_IMODE(box.manifest_path().stat().st_mode) == 0o644


def test_install_re_hashes_the_binary_immediately_before_publishing(
    box, capsys, monkeypatch
):
    """A binary swapped after derivation must refuse, not be described."""

    real = emitter.hash_executable
    seen: list[str] = []

    def counting(path: str):
        seen.append(path)
        digest, size = real(path)
        return (digest, size) if len(seen) == 1 else ("0" * 64, size)

    monkeypatch.setattr(emitter, "hash_executable", counting)

    assert emitter.main(["--install"], sources=box.sources()) == 2

    assert "executable changed after" in capsys.readouterr().err
    assert not box.manifest_path().exists()


@pytest.mark.parametrize(
    "flag",
    [
        "--prefix",
        "--app-dir",
        "--cuda-root",
        "--host-cc",
        "--host-cxx",
        "--artifact-dir",
        "--driver-version-file",
    ],
)
def test_no_source_path_is_reachable_from_the_command_line(box, flag):
    """P2 finding F3: these flags used to verify themselves against themselves.

    ``colmapPrefix``, ``appDir`` and ``cudaRoot`` are judged by
    ``assert_qualified_box_identity`` against the location it is *handed*, so a
    value supplied on the command line was both the manifest's claim and the
    standard it was checked against: a typo derived a manifest naming the typo,
    verified the typo against the typo, printed success, and installed a file
    ``load_qualified_colmap_toolchain`` refuses.  ``--artifact-dir`` carried the
    same hole for ``pycolmapWheelSha256``, the one receipted value no constant
    is compared against.  None of them may be spellable again.
    """

    with pytest.raises(SystemExit) as refusal:
        emitter.main(["--print", flag, str(box.prefix)], sources=box.sources())

    assert refusal.value.code == 2


def test_the_command_line_selects_a_mode_and_nothing_else():
    """Root-only ownership -- and now every source path -- stays Python-level.

    ``owner_uid`` was always kept off the command line because an operator must
    not be able to relax the guarantee every hash rests on.  The install
    locations earn the same treatment for a stronger reason: they are half of
    the comparison that judges them.
    """

    parser = emitter.build_parser()

    assert emitter.CLI_SELECTIONS == frozenset({"force", "install", "print_only"})
    assert frozenset(vars(parser.parse_args(["--print"]))) == emitter.CLI_SELECTIONS

    flags = {action.dest for action in parser._actions}
    for substitutable in emitter.ManifestSources.__slots__:
        assert substitutable not in flags, f"{substitutable} must not be an option"
    for spelling in ("prefix", "host_cc", "host_cxx", "artifact_dir",
                     "driver_version_file"):
        assert spelling not in flags, f"{spelling} must not be an option"


def test_a_command_line_alone_derives_the_pinned_production_install(capsys, monkeypatch):
    """What the operator's own invocation resolves to, with nothing injected.

    Removing the flags is only half the claim; the other half is that what is
    left reads the constants the loader pins.  Derivation is stubbed out, so
    this asserts the resolved sources without stat'ing ``/opt`` on any machine.
    """

    seen: list[emitter.ManifestSources] = []

    def capture(sources):
        seen.append(sources)
        raise AdapterError("derivation stopped here", "REFINE_TOOLCHAIN_UNQUALIFIED")

    monkeypatch.setattr(emitter, "derive_manifest_fields", capture)

    assert emitter.main(["--print"]) == 2

    (resolved,) = seen
    assert resolved.box_location() == toolchain_module.QUALIFIED_BOX_LOCATION
    assert resolved.host_c_compiler == toolchain_module.QUALIFIED_HOST_C_COMPILER
    assert resolved.host_cxx_compiler == toolchain_module.QUALIFIED_HOST_CXX_COMPILER
    assert resolved.artifact_directory == emitter.QUALIFIED_PYCOLMAP_ARTIFACT_DIR
    assert resolved.driver_version_path == emitter.NVIDIA_DRIVER_VERSION_PATH
    assert resolved.owner_uid == 0 and resolved.owner_gid == 0
    assert resolved.require_elf is True
    assert "refusing to emit" in capsys.readouterr().err


def test_a_command_line_that_grew_a_source_flag_is_refused_at_runtime(
    box, capsys, monkeypatch
):
    """Deleting the flags is not durable on its own; growing one back refuses.

    Without this the regression is silent: a re-added option is ignored on the
    day it lands and honoured on the day someone wires it into
    :class:`ManifestSources`, which is precisely how the emitter would come to
    report success over a manifest the loader rejects.
    """

    pinned_parser = emitter.build_parser

    def parser_with_a_location_flag():
        parser = pinned_parser()
        parser.add_argument("--prefix", default=str(box.prefix))
        return parser

    monkeypatch.setattr(emitter, "build_parser", parser_with_a_location_flag)

    assert emitter.main(["--print", "--prefix", "/typo"], sources=box.sources()) == 2

    captured = capsys.readouterr()
    assert captured.out == ""
    assert "may select a mode and nothing else" in captured.err
    assert "prefix" in captured.err


def test_running_as_a_script_caches_no_bytecode_for_its_own_imports(tmp_path):
    """``-B`` is documented, but the module must not depend on remembering it.

    Run as root without ``-B``, every module the interpreter compiles is cached
    as a root-owned ``.pyc`` in the operator's checkout.  ``PYTHONPYCACHEPREFIX``
    redirects those writes into ``tmp_path``, so this observes exactly what the
    interpreter *would* have left behind -- while touching neither the checkout
    nor ``/opt``: the child is given no mode, so it refuses at argument parsing,
    after every import and before any path is read.
    """

    source_root = Path(emitter.__file__).resolve().parents[1]
    cache = tmp_path / "pycache"
    environ = dict(os.environ)
    environ["PYTHONPYCACHEPREFIX"] = str(cache)
    environ["PYTHONPATH"] = str(source_root)
    environ.pop("PYTHONDONTWRITEBYTECODE", None)

    completed = subprocess.run(
        [sys.executable, "-m", "patina_scan_worker.refine_colmap_manifest"],
        capture_output=True,
        cwd=str(tmp_path),
        env=environ,
        timeout=120.0,
    )

    assert completed.returncode == 2
    cached = {path.name.split(".")[0] for path in cache.rglob("*.pyc")}
    # Positive control: bytecode caching really was on for this child, so the
    # absences below are the module's doing and not the environment's.
    assert "refine_colmap_manifest" in cached
    assert "refine_colmap_toolchain" not in cached
    assert "refine_adapter" not in cached
    assert "refine_native_process" not in cached


def test_production_defaults_are_the_pinned_qualified_box():
    sources = emitter.ManifestSources()

    assert sources.colmap_prefix == toolchain_module.QUALIFIED_COLMAP_PREFIX
    assert sources.app_dir == toolchain_module.QUALIFIED_APP_DIR
    assert sources.cuda_root == toolchain_module.QUALIFIED_CUDA_ROOT
    assert sources.host_c_compiler == toolchain_module.QUALIFIED_HOST_C_COMPILER
    assert sources.host_cxx_compiler == toolchain_module.QUALIFIED_HOST_CXX_COMPILER
    assert sources.owner_uid == 0 and sources.owner_gid == 0
    assert sources.require_elf is True
    assert sources.box_location() == toolchain_module.QUALIFIED_BOX_LOCATION
    assert sources.manifest_path() == (
        "/opt/colmap/4.0.2/share/patina/refine-colmap-toolchain-v1.manifest.json"
    )


def test_the_emitter_neither_enables_nor_composes_refine():
    """This module writes one file; it is not a Refine enablement.

    Emitting the manifest is what makes the toolchain pin *loadable*.  It must
    not also make Refine runnable: the qualification flags stay false, the
    default stage set is untouched, and nothing here imports the engine, the
    runner, or the stage registry.
    """

    assert toolchain_module.TOOLCHAIN_POLICY_QUALIFIED is False
    assert toolchain_module.EXECUTABLE_IDENTITY_QUALIFIED is False
    assert toolchain_module.COMMAND_ENVIRONMENT_QUALIFIED is False

    with open(emitter.__file__, encoding="utf-8") as stream:
        source = stream.read()
    for forbidden in (
        "refine_engine",
        "refine_runner",
        "register_stage",
        "DEFAULT_STAGES",
        "scan_pipeline.refine",
    ):
        assert forbidden not in source, f"the emitter must not reference {forbidden}"
