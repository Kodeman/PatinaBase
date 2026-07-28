"""Safety contract for the privileged native installer.

The behavioral tests use a fake systemctl and a temporary filesystem.  They
exercise the same transaction helper sourced by ``install.sh`` without root or
a running systemd manager.
"""

from __future__ import annotations

import base64
import hashlib
import importlib.util
import json
import os
import shutil
import stat
import subprocess
import sys
import threading
import zipfile
from pathlib import Path
from types import SimpleNamespace

import pytest

INSTALL = Path(__file__).resolve().parent.parent / "install.sh"
README = Path(__file__).resolve().parent.parent / "README.md"
VENV_LIB = Path(__file__).resolve().parent.parent / "install-venv-lib.sh"
PATH_GUARD = Path(__file__).resolve().parent.parent / "install-path-guard.py"
ENV_EXAMPLE = Path(__file__).resolve().parent.parent / "scan-worker.env.example"

INSTALL_SOURCE_FILES = (
    "README.md",
    "install-colmap-4.0.2.sh",
    "install-path-guard.py",
    "install-venv-lib.sh",
    "install.sh",
    "patina-scan-worker-doctor.service",
    "patina-scan-worker-nvidia-prepare.service",
    "patina-scan-worker.gpu.conf",
    "patina-scan-worker.service",
    "pyproject.toml",
    "pycolmap-build-requirements.txt",
    "scan-worker.env.example",
    "src/patina_scan_worker/__init__.py",
    "src/patina_scan_worker/__main__.py",
    "src/patina_scan_worker/cli.py",
    "src/patina_scan_worker/colmap_qualification.py",
    "src/patina_scan_worker/config.py",
    "src/patina_scan_worker/db.py",
    "src/patina_scan_worker/doctor.py",
    "src/patina_scan_worker/drawing/__init__.py",
    "src/patina_scan_worker/drawing/brand.py",
    "src/patina_scan_worker/drawing/dxf.py",
    "src/patina_scan_worker/drawing/model.py",
    "src/patina_scan_worker/drawing/pdf.py",
    "src/patina_scan_worker/drawing/svg.py",
    "src/patina_scan_worker/drawing/units.py",
    "src/patina_scan_worker/errors.py",
    "src/patina_scan_worker/field_raster_libheif.c",
    "src/patina_scan_worker/field_raster_materializer.py",
    "src/patina_scan_worker/field_raster_qualification.py",
    "src/patina_scan_worker/field_storage_acquirer.py",
    "src/patina_scan_worker/pycolmap_cuda_smoke.py",
    "src/patina_scan_worker/refine_adapter.py",
    "src/patina_scan_worker/refine_colmap_backend.py",
    "src/patina_scan_worker/refine_colmap_command.py",
    "src/patina_scan_worker/refine_colmap_manifest.py",
    "src/patina_scan_worker/refine_colmap_toolchain.py",
    "src/patina_scan_worker/refine_evidence_builder.py",
    "src/patina_scan_worker/refine_engine.py",
    "src/patina_scan_worker/refine_materializer.py",
    "src/patina_scan_worker/refine_native_process.py",
    "src/patina_scan_worker/refine_packet_extractor.py",
    "src/patina_scan_worker/refine_publisher.py",
    "src/patina_scan_worker/refine_runner.py",
    "src/patina_scan_worker/http.py",
    "src/patina_scan_worker/keys.py",
    "src/patina_scan_worker/queue.py",
    "src/patina_scan_worker/stages/__init__.py",
    "src/patina_scan_worker/stages/base.py",
    "src/patina_scan_worker/stages/captured_room.py",
    "src/patina_scan_worker/stages/dimensions.py",
    "src/patina_scan_worker/stages/drawings.py",
    "src/patina_scan_worker/stages/ingest.py",
    "src/patina_scan_worker/stages/solve.py",
    "src/patina_scan_worker/stages/solve_math.py",
    "src/patina_scan_worker/stages/validator.py",
    "src/patina_scan_worker/storage.py",
    "src/patina_scan_worker/telemetry.py",
    "src/patina_scan_worker/untar.py",
    "src/patina_scan_worker/worker.py",
)


def test_upgrade_refuses_to_rebuild_gpu_install_as_cpu_by_omission():
    script = INSTALL.read_text()
    guard = 'if [ "$UPGRADE" -eq 1 ] && [ "$GPU" -eq 0 ] && [ -f "$DROPIN_DIR/gpu.conf" ]'
    assert guard in script
    assert "--gpu --upgrade" in script[script.index(guard):]


def test_installer_never_runs_doctor_from_its_root_shell():
    script = INSTALL.read_text()
    assert 'set -a; [ -f "$ENV_FILE" ] && . "$ENV_FILE"; set +a' not in script
    assert '"$VENV/bin/patina-scan-worker" doctor' not in script
    assert "patina-scan-worker-doctor.service" in script


def test_gpu_install_fails_before_changes_without_nvidia_modprobe():
    script = INSTALL.read_text()
    check = 'if [ "$GPU" -eq 1 ] && [ ! -x "$NVIDIA_MODPROBE" ]'
    assert check in script
    assert script.index(check) < script.index("# 0. native libs")
    assert "nvidia-modprobe" in script[script.index(check):script.index("# 0. native libs")]


def test_gpu_install_ensures_ninja_for_gsplat_jit():
    script = INSTALL.read_text()
    native_libs = script[script.index("# 0. native libs") : script.index("# 1. service user")]
    assert 'if [ "$GPU" -eq 1 ]' in native_libs
    assert "ninja-build" in native_libs


def test_gpu_install_ensures_direct_field_raster_libheif_toolchain():
    script = INSTALL.read_text()
    native_libs = script[script.index("# 0. native libs") : script.index("# 1. service user")]
    for dependency in (
        "build-essential",
        "pkg-config",
        "zlib1g-dev",
        "libheif1",
        "libheif-dev",
        "libheif-plugin-libde265",
    ):
        assert dependency in native_libs
    assert 'VERSION_ID="?24\\.04"?' in script
    assert "/usr/bin/cc" in native_libs
    assert "/usr/bin/pkg-config --exists libheif" in native_libs
    assert "/usr/bin/dpkg-query -W" in native_libs
    assert "1.17.6-1ubuntu4.6" in native_libs
    assert '/usr/bin/dpkg --compare-versions "$raster_package_version" ge' in native_libs
    assert "apt-get update" in native_libs
    assert "PKG_CONFIG_LIBDIR=/usr/lib/x86_64-linux-gnu/pkgconfig" in native_libs
    raster_gate = native_libs[
        native_libs.index(
            "-- validating the preinstalled Field raster C/libheif toolchain"
        ) :
        native_libs.index(
            'if [ "$GPU" -eq 1 ] && ! command -v nvidia-smi'
        )
    ]
    assert "apt-get install" not in raster_gate


def test_gpu_install_rejects_non_noble_before_native_or_release_mutation():
    script = INSTALL.read_text()
    gate = 'echo "ERROR: --gpu Field raster execution is qualified only on Ubuntu 24.04."'
    assert gate in script
    assert script.index(gate) < script.index("# 0. native libs")
    assert script.index(gate) < script.index("# 1. service user")
    assert script.index(gate) < script.index("prepare_install_transaction")


def test_gpu_candidate_compiles_and_validates_exact_field_raster_helper():
    script = INSTALL.read_text()
    build = script[
        script.index("# 2. immutable Python candidate") :
        script.index("# 3. stage a complete candidate systemd tree")
    ]
    compile_helper = build.index("_compile_field_raster_helper")
    harden = build.index(
        '_path_guard harden-release --app-dir "$APP_DIR" --path "$STAGED_VENV"'
    )
    transaction = script.index("begin_install_transaction")

    assert "4840e0e6d3c98bbebecc4354349bae3963718583fb5c882f9807b0d222bee9c3" in script
    assert "field-raster-libheif-helper-v2" in script
    assert 'helper_manifest="$helper_output.manifest.json"' in script
    assert 'if [ "$GPU" -eq 1 ]; then' in build[:compile_helper]
    assert script.index('    "-x",\n    "c",') < script.index(
        'f"/proc/self/fd/{{SOURCE_FD}}"'
    )
    assert "pass_fds=(compile_source_fd,)" in script
    assert compile_helper < harden < transaction
    assert "FIELD_RASTER_RELEASE_GUARD_ARGS" in script[harden:transaction]
    assert '"pkgConfigFlags": list(pkg_flags)' in script
    assert "--expected-field-raster-libheif-package-version" in script
    assert "--expected-field-raster-libheif-pkg-config-version" in script
    assert "--expected-field-raster-pkg-config-flags-json" in script
    assert (
        '_run_as_service_user /usr/bin/test -x \\\n'
        '    "$SMOKE_VENV/libexec/patina/field-raster-libheif-helper-v2"'
    ) in script
    assert "_run_as_service_user /usr/bin/timeout 5" in script
    assert "usage: field-raster-libheif INPUT.heic OUTPUT.ppm" in script
    reprobe = script.index(
        "-- revalidating Field raster libheif identity before activation"
    )
    assert harden < reprobe < transaction
    assert script.count("_probe_field_raster_libheif_toolchain") >= 3


def test_candidate_is_checked_smoked_and_verified_before_transaction_activation():
    script = INSTALL.read_text()
    assert 'generate-release-path --app-dir "$APP_DIR"' in script
    assert 'create-release --app-dir "$APP_DIR" --path "$STAGED_VENV"' in script
    pip_check = '--isolated --disable-pip-version-check check'
    assert pip_check in script
    assert 'import patina_scan_worker' in script
    assert '"$SMOKE_VENV/bin/patina-scan-worker" --help' in script
    assert "verify_candidate_units" in script
    assert 'SYSTEMD_UNIT_PATH="$CANDIDATE_SYSTEMD_DIR:"' in script
    assert "systemd-analyze verify" in script
    assert script.index(pip_check) < script.index("begin_install_transaction")
    assert script.index("verify_candidate_units") < script.index(
        "begin_install_transaction"
    )
    assert script.index('"$SMOKE_VENV/bin/patina-scan-worker" --help') < script.index(
        "begin_install_transaction"
    )
    build = script[script.index("# 2. immutable Python candidate") : script.index(
        "# 3. stage a complete candidate systemd tree"
    )]
    harden = build.index(
        '_path_guard harden-release --app-dir "$APP_DIR" --path "$STAGED_VENV"'
    )
    build_lines = build.splitlines()
    candidate_invocations = [
        offset
        for offset, line in enumerate(build_lines)
        if line.lstrip().startswith("_run_candidate_python ")
    ]
    harden_line = next(
        offset
        for offset, line in enumerate(build_lines)
        if line.lstrip().startswith("_path_guard harden-release ")
    )
    assert len(candidate_invocations) >= 4
    assert build.index('_run_privileged_python -m venv "$STAGED_VENV"') < harden
    assert all(invocation < harden_line for invocation in candidate_invocations)
    assert "_run_candidate_python" not in build[harden:]
    assert harden < build.index('_run_as_service_user "$SMOKE_VENV/bin/python"')
    # Stop/swap lives only in the helper, after all candidate checks.
    assert not any(
        line.strip() == "systemctl stop patina-scan-worker"
        for line in script.splitlines()
    )


def test_gpu_install_consumes_only_the_verified_local_pycolmap_wheel():
    script = INSTALL.read_text()
    artifact_check = 'validate-pycolmap-artifact --artifact-dir "$PYCOLMAP_ARTIFACT_DIR"'
    transaction = "prepare_install_transaction"
    assert artifact_check in script
    assert script.index(artifact_check) < script.index(transaction)
    assert "PIP_CONFIG_FILE=/dev/null" in script
    assert "--isolated" in script
    assert "--no-cache-dir" in script
    assert "--disable-pip-version-check" in script
    assert '"$PYCOLMAP_WHEEL"' in script
    assert "direct_url.json" in script
    assert "patina_scan_worker.pycolmap_cuda_smoke" in script
    assert "timeout 90" in script
    candidate = script[script.index("# 2. immutable Python candidate") :]
    assert candidate.index("pycolmap_cuda_smoke") < candidate.index(
        "begin_install_transaction"
    )


def test_candidate_build_uses_a_validated_direct_worker_wheel():
    script = INSTALL.read_text()
    prepare = script.index("prepare_install_transaction")
    isolate = script.index(
        'BUILD_SOURCE="$(_prepare_isolated_source_build "$SRC_DIR")"'
    )
    wheel_build = script.index('--wheel-dir "$STAGED_VENV/.artifacts" "$BUILD_SOURCE"')
    wheel_validation = script.index("validate-worker-wheel")
    gpu_requirement = script.index(
        'WORKER_REQUIREMENT="patina-scan-worker[drawings,gpu] @ file://'
    )
    cpu_requirement = script.index(
        'WORKER_REQUIREMENT="patina-scan-worker[drawings] @ file://'
    )
    source_rechecks = [
        offset
        for offset in range(len(script))
        if script.startswith(
            '_path_guard validate-source-tree --source-dir "$SRC_DIR"', offset
        )
    ]
    harden = script.index(
        '_path_guard harden-release --app-dir "$APP_DIR" --path "$STAGED_VENV"'
    )

    assert len(source_rechecks) == 2
    assert prepare < isolate < wheel_build < wheel_validation
    assert wheel_validation < gpu_requirement < source_rechecks[1] < harden
    assert wheel_validation < cpu_requirement < source_rechecks[1]
    assert script.count(' --wheel-dir "$STAGED_VENV/.artifacts" "$BUILD_SOURCE"') == 1
    assert '"${BUILD_SOURCE}[' not in script
    assert 'SOURCE_DATE_EPOCH="$WORKER_SOURCE_DATE_EPOCH"' in script
    assert 'TMPDIR="$TRANSACTION_DIR/build-tmp"' in script
    assert script.count('_validate_direct_wheel_report "$STAGED_VENV/bin/python"') == 2


def test_release_namespace_and_candidate_contents_stay_root_owned():
    script = INSTALL.read_text()
    assert script.index("umask 077") < script.index('for arg in "$@"')
    assert 'ensure-trusted-dir' in script
    assert '"$APP_DIR"' in script
    assert 'generate-release-path' in script
    assert 'create-release' in script
    assert 'harden-release' in script
    assert 'chown -R "$SVC_USER:$SVC_USER" "$STAGED_VENV"' not in script
    assert 'install -d -o "$SVC_USER" -g "$SVC_USER" "$APP_DIR"' not in script
    live_checks = script[
        script.index("# Existing stable/previous symlinks") : script.index(
            "# A fresh install, explicit upgrade"
        )
    ]
    assert "validate-release" in live_checks
    assert "harden-release" not in live_checks


def test_candidate_and_existing_release_smoke_runs_as_service_user():
    script = INSTALL.read_text()
    smoke = script[script.index("-- smoke-checking package imports") :]
    assert '_run_as_service_user "$SMOKE_VENV/bin/python"' in smoke
    assert '_run_as_service_user "$SMOKE_VENV/bin/patina-scan-worker"' in smoke
    assert not any(
        line.startswith('"$SMOKE_VENV/bin/python"') for line in smoke.splitlines()
    )
    assert not any(
        line.startswith('"$SMOKE_VENV/bin/patina-scan-worker"')
        for line in smoke.splitlines()
    )


def test_candidate_smoke_imports_disabled_refine_foundations_before_activation():
    script = INSTALL.read_text()
    expected_imports = (
        "'import patina_scan_worker; import patina_scan_worker.cli; "
        "import patina_scan_worker.doctor; "
        "import patina_scan_worker.field_raster_materializer; "
        "import patina_scan_worker.field_storage_acquirer; "
        "import patina_scan_worker.refine_colmap_backend; "
        "import patina_scan_worker.refine_colmap_command; "
        "import patina_scan_worker.refine_colmap_manifest; "
        "import patina_scan_worker.refine_colmap_toolchain; "
        "import patina_scan_worker.refine_evidence_builder; "
        "import patina_scan_worker.refine_materializer; "
        "import patina_scan_worker.refine_native_process; "
        "import patina_scan_worker.refine_packet_extractor; "
        "import patina_scan_worker.refine_publisher; "
        "import patina_scan_worker.refine_runner'"
    )
    service_user_smoke = (
        '_run_as_service_user "$SMOKE_VENV/bin/python" -I -c \\\n  '
        + expected_imports
    )

    assert service_user_smoke in script
    assert script.index(expected_imports) < script.index("begin_install_transaction")


def _path_guard(
    tmp_path: Path,
    *args: str,
    expected_ok: bool = True,
) -> subprocess.CompletedProcess[str]:
    anchor = tmp_path / "trusted"
    anchor.mkdir(mode=0o700, exist_ok=True)
    result = subprocess.run(
        [
            sys.executable,
            "-I",
            "-S",
            str(PATH_GUARD),
            "--anchor",
            str(anchor),
            "--trusted-uid",
            str(os.getuid()),
            "--trusted-gid",
            str(os.getgid()),
            *args,
        ],
        text=True,
        capture_output=True,
        check=False,
    )
    if expected_ok:
        assert result.returncode == 0, result.stderr
    else:
        assert result.returncode != 0
    return result


def _load_path_guard_module():
    spec = importlib.util.spec_from_file_location(
        "patina_install_path_guard_test", PATH_GUARD
    )
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


PYCOLMAP_WHEEL_NAME = (
    "pycolmap-4.0.2-1patinacu118sm75-"
    "cp312-cp312-linux_x86_64.whl"
)


def _record_digest(data: bytes) -> str:
    encoded = base64.urlsafe_b64encode(hashlib.sha256(data).digest()).rstrip(b"=")
    return "sha256=" + encoded.decode("ascii")


def _write_pycolmap_artifact(
    tmp_path: Path,
    *,
    wheel_tag: str = "cp312-cp312-linux_x86_64",
) -> tuple[Path, Path, Path]:
    trusted = tmp_path / "trusted"
    trusted.mkdir(mode=0o700)
    artifact = trusted / "artifact"
    artifact.mkdir(mode=0o700)
    wheel = artifact / PYCOLMAP_WHEEL_NAME
    dist_info = "pycolmap-4.0.2.dist-info"
    files = {
        "pycolmap/__init__.py": b"from ._core import *\n",
        "pycolmap/_core.cpython-312-x86_64-linux-gnu.so": b"fake-elf-for-guard-test",
        f"{dist_info}/METADATA": (
            b"Metadata-Version: 2.3\nName: pycolmap\nVersion: 4.0.2\n"
            b"Requires-Dist: numpy\n\n"
        ),
        f"{dist_info}/WHEEL": (
            "Wheel-Version: 1.0\n"
            "Generator: patina-test\n"
            "Root-Is-Purelib: false\n"
            "Build: 1patinacu118sm75\n"
            f"Tag: {wheel_tag}\n\n"
        ).encode(),
    }
    record_name = f"{dist_info}/RECORD"
    record_lines = [
        f"{name},{_record_digest(data)},{len(data)}" for name, data in files.items()
    ]
    record_lines.append(f"{record_name},,")
    files[record_name] = ("\n".join(record_lines) + "\n").encode()
    with zipfile.ZipFile(wheel, "x", compression=zipfile.ZIP_DEFLATED) as archive:
        for name, data in files.items():
            archive.writestr(name, data)
    wheel.chmod(0o600)
    wheel_bytes = wheel.read_bytes()
    manifest = {
        "artifact": "pycolmap-4.0.2-cuda118-sm75",
        "colmapBuild": "Commit d927f7e on 2026-03-18 with CUDA",
        "cudaArchitecture": "75",
        "cudaDeviceCount": 1,
        "cudaVersion": "11.8",
        "gpuSiftKeypoints": 100,
        "hasCuda": True,
        "pythonTag": "cp312-cp312",
        "schemaVersion": 1,
        "sourceCmakeSha256": "d6881e9110f221cbb0e725d1ff837f0a573e9e310c83447ff3bfcf9bc1c0adaa",
        "sourceCommit": "d927f7e518fc20afa33390712c4cc20d85b730b8",
        "sourcePyprojectSha256": "60b1cedf70be21acc3b8e33455f4f0d482e380c1c9cab65f8598613695be5fc5",
        "sourceTree": "9c381aea43304df66df991183563b659c2f712fa",
        "wheelFile": PYCOLMAP_WHEEL_NAME,
        "wheelSha256": hashlib.sha256(wheel_bytes).hexdigest(),
        "wheelSizeBytes": len(wheel_bytes),
    }
    manifest_path = artifact / "artifact.json"
    manifest_path.write_text(
        json.dumps(manifest, sort_keys=True, separators=(",", ":")) + "\n"
    )
    manifest_path.chmod(0o600)
    return artifact, wheel, manifest_path


def _validate_pycolmap_test_artifact(
    tmp_path: Path, artifact: Path, *, expected_ok: bool = True
) -> subprocess.CompletedProcess[str]:
    return _path_guard(
        tmp_path,
        "validate-pycolmap-artifact",
        "--artifact-dir",
        str(artifact),
        "--expected-python-tag",
        "cp312-cp312",
        expected_ok=expected_ok,
    )


def test_pycolmap_artifact_guard_accepts_exact_closed_artifact(tmp_path):
    artifact, wheel, _manifest = _write_pycolmap_artifact(tmp_path)
    result = _validate_pycolmap_test_artifact(tmp_path, artifact)
    assert result.stdout.strip() == str(wheel)


def test_pycolmap_artifact_guard_rejects_corrupt_hash(tmp_path):
    artifact, _wheel, manifest_path = _write_pycolmap_artifact(tmp_path)
    manifest = json.loads(manifest_path.read_text())
    manifest["wheelSha256"] = "0" * 64
    manifest_path.write_text(
        json.dumps(manifest, sort_keys=True, separators=(",", ":")) + "\n"
    )
    _validate_pycolmap_test_artifact(tmp_path, artifact, expected_ok=False)


@pytest.mark.parametrize("kind", ["unknown-key", "noncanonical", "duplicate-key"])
def test_pycolmap_artifact_guard_rejects_noncanonical_manifest(tmp_path, kind):
    artifact, _wheel, manifest_path = _write_pycolmap_artifact(tmp_path)
    manifest = json.loads(manifest_path.read_text())
    if kind == "unknown-key":
        manifest["unexpected"] = True
        payload = json.dumps(manifest, sort_keys=True, separators=(",", ":")) + "\n"
    elif kind == "noncanonical":
        payload = json.dumps(manifest, indent=2) + "\n"
    else:
        canonical = json.dumps(manifest, sort_keys=True, separators=(",", ":"))
        payload = canonical[:-1] + ',"wheelSizeBytes":1}\n'
    manifest_path.write_text(payload)
    _validate_pycolmap_test_artifact(tmp_path, artifact, expected_ok=False)


@pytest.mark.parametrize("kind", ["symlink", "hardlink", "writable", "extra"])
def test_pycolmap_artifact_guard_rejects_unsafe_filesystem_shape(tmp_path, kind):
    artifact, wheel, manifest_path = _write_pycolmap_artifact(tmp_path)
    if kind == "symlink":
        outside = tmp_path / "trusted" / "outside-manifest"
        outside.write_bytes(manifest_path.read_bytes())
        manifest_path.unlink()
        manifest_path.symlink_to(outside)
    elif kind == "hardlink":
        os.link(wheel, tmp_path / "trusted" / "wheel-hardlink")
    elif kind == "writable":
        wheel.chmod(0o666)
    else:
        (artifact / "unexpected.txt").write_text("unexpected")
    _validate_pycolmap_test_artifact(tmp_path, artifact, expected_ok=False)


def test_pycolmap_artifact_guard_rejects_wrong_internal_wheel_tag(tmp_path):
    artifact, _wheel, _manifest = _write_pycolmap_artifact(
        tmp_path, wheel_tag="cp312-cp312-manylinux_2_17_x86_64"
    )
    _validate_pycolmap_test_artifact(tmp_path, artifact, expected_ok=False)


def _write_stock_legacy_venv(tmp_path: Path) -> tuple[Path, Path, Path, Path]:
    """Build the Debian-style interpreter-link shape seen in a stock venv."""

    app = tmp_path / "trusted" / "opt" / "patina" / "scan-pipeline"
    _path_guard(
        tmp_path,
        "ensure-trusted-dir",
        "--path",
        str(app),
        "--mode",
        "0755",
    )
    interpreter_dir = tmp_path / "trusted" / "usr" / "bin"
    interpreter_dir.mkdir(parents=True)
    canonical = interpreter_dir / "python3.11"
    canonical.write_text("#!/bin/sh\nexit 0\n")
    canonical.chmod(0o755)
    alias = interpreter_dir / "python3"
    alias.symlink_to(canonical.name)

    legacy = app / ".venv"
    bin_dir = legacy / "bin"
    lib_dir = legacy / "lib"
    bin_dir.mkdir(parents=True)
    lib_dir.mkdir()
    (bin_dir / "python3").symlink_to(alias)
    (bin_dir / "python").symlink_to("python3")
    (bin_dir / "python3.11").symlink_to("python3")
    entrypoint = bin_dir / "patina-scan-worker"
    entrypoint.write_text("#!/bin/sh\nexit 0\n")
    entrypoint.chmod(0o755)
    (legacy / "lib64").symlink_to("lib")
    (legacy / "marker").write_text("legacy bytes\n")
    return app, legacy, alias, canonical


def _materialize_legacy(
    tmp_path: Path,
    app: Path,
    legacy: Path,
    interpreter: Path,
    *,
    name: str = ".venv.release.materialized",
    expected_ok: bool = True,
) -> tuple[Path, subprocess.CompletedProcess[str]]:
    destination = app / name
    result = _path_guard(
        tmp_path,
        "materialize-legacy-release",
        "--app-dir",
        str(app),
        "--source",
        str(legacy),
        "--destination",
        str(destination),
        "--interpreter",
        str(interpreter),
        expected_ok=expected_ok,
    )
    return destination, result


def test_legacy_materialization_uses_fresh_independent_inodes(tmp_path):
    app, legacy, _alias, canonical = _write_stock_legacy_venv(tmp_path)
    outside = tmp_path / "service-controlled-hardlink"
    outside.write_text("shared source bytes\n")
    first_link = legacy / "lib" / "shared.py"
    second_link = legacy / "lib" / "shared-copy.py"
    first_link.hardlink_to(outside)
    second_link.hardlink_to(outside)
    marker = legacy / "marker"
    old_marker_inode = marker.stat().st_ino
    held_writer = os.open(marker, os.O_WRONLY)
    try:
        quarantine = app / ".venv.quarantine.fixture"
        _path_guard(
            tmp_path,
            "quarantine-legacy-release",
            "--app-dir",
            str(app),
            "--source",
            str(legacy),
            "--quarantine",
            str(quarantine),
        )
        assert not legacy.exists()
        quarantine.chmod(0o777)  # simulate inferred post-rename unsealed state
        _path_guard(
            tmp_path,
            "seal-legacy-quarantine",
            "--app-dir",
            str(app),
            "--quarantine",
            str(quarantine),
        )
        assert stat.S_IMODE(quarantine.stat().st_mode) == 0o700
        destination, _result = _materialize_legacy(
            tmp_path, app, quarantine, canonical
        )
        os.lseek(held_writer, 0, os.SEEK_SET)
        os.write(held_writer, b"attacker bytes")
        outside.write_text("changed through outside hardlink\n")
    finally:
        os.close(held_writer)

    copied_marker = destination / "marker"
    copied_first = destination / "lib" / "shared.py"
    copied_second = destination / "lib" / "shared-copy.py"
    assert copied_marker.read_text() == "legacy bytes\n"
    assert copied_marker.stat().st_ino != old_marker_inode
    assert copied_marker.stat().st_nlink == 1
    assert copied_first.read_text() == "shared source bytes\n"
    assert copied_second.read_text() == "shared source bytes\n"
    assert copied_first.stat().st_ino != copied_second.stat().st_ino
    assert copied_first.stat().st_nlink == copied_second.stat().st_nlink == 1

    _path_guard(
        tmp_path,
        "remove-legacy-quarantine",
        "--app-dir",
        str(app),
        "--quarantine",
        str(quarantine),
    )
    assert not quarantine.exists()


def test_legacy_materialization_accepts_stock_interpreter_links_only(tmp_path):
    app, legacy, alias, canonical = _write_stock_legacy_venv(tmp_path)

    destination, _result = _materialize_legacy(
        tmp_path, app, legacy, canonical
    )

    assert (destination / "bin" / "python3").readlink() == canonical
    assert (destination / "bin" / "python").readlink() == Path("python3")
    assert (destination / "bin" / "python3.11").readlink() == Path("python3")
    assert (destination / "lib64").readlink() == Path("lib")
    assert (destination / "bin" / "python").resolve() == canonical
    assert alias.resolve() == canonical


def test_legacy_materialization_rejects_external_non_interpreter_symlink(tmp_path):
    app, legacy, _alias, canonical = _write_stock_legacy_venv(tmp_path)
    external = tmp_path / "external-library.py"
    external.write_text("unsafe = True\n")
    (legacy / "lib" / "escape.py").symlink_to(external)

    _destination, result = _materialize_legacy(
        tmp_path, app, legacy, canonical, expected_ok=False
    )

    assert "escapes the release" in result.stderr


def test_legacy_materialization_rejects_internal_link_with_external_terminal(tmp_path):
    app, legacy, _alias, canonical = _write_stock_legacy_venv(tmp_path)
    (legacy / "lib" / "python-view").symlink_to("../bin/python3")

    _destination, result = _materialize_legacy(
        tmp_path, app, legacy, canonical, expected_ok=False
    )

    assert "external terminal" in result.stderr


def test_legacy_materialization_rejects_different_trusted_interpreter(tmp_path):
    app, legacy, _alias, canonical = _write_stock_legacy_venv(tmp_path)
    other = canonical.with_name("python3.12")
    other.write_text("#!/bin/sh\nexit 0\n")
    other.chmod(0o755)

    _destination, result = _materialize_legacy(
        tmp_path, app, legacy, other, expected_ok=False
    )

    assert "does not resolve to the selected trusted interpreter" in result.stderr


def test_legacy_materialization_rejects_special_files(tmp_path):
    app, legacy, _alias, canonical = _write_stock_legacy_venv(tmp_path)
    os.mkfifo(legacy / "service-runtime.pipe")

    _destination, result = _materialize_legacy(
        tmp_path, app, legacy, canonical, expected_ok=False
    )

    assert "unsupported filesystem object" in result.stderr


def test_legacy_materialization_rejects_unmanaged_source_directory(tmp_path):
    app, legacy, _alias, canonical = _write_stock_legacy_venv(tmp_path)
    unmanaged = app / ".venv.unmanaged"
    legacy.rename(unmanaged)

    _destination, result = _materialize_legacy(
        tmp_path, app, unmanaged, canonical, expected_ok=False
    )

    assert "unmanaged legacy quarantine name" in result.stderr


@pytest.mark.parametrize("operation", ["copy", "cleanup"])
def test_legacy_tree_operations_reject_cross_device_mounts(monkeypatch, operation):
    guard = _load_path_guard_module()
    mounted_directory = SimpleNamespace(st_mode=stat.S_IFDIR | 0o755, st_dev=2)
    if operation == "copy":
        monkeypatch.setattr(guard.os, "fstat", lambda _fd: mounted_directory)
        def call():
            guard._copy_legacy_directory(
                10,
                11,
                "mounted",
                [],
                interpreter="/trusted/python",
                anchor="/trusted",
                uid=os.getuid(),
                gid=os.getgid(),
                source_device=1,
                source_mount_id=None,
            )
    else:
        monkeypatch.setattr(
            guard.os,
            "stat",
            lambda *_args, **_kwargs: mounted_directory,
        )
        def call():
            guard._remove_tree_entry(
                10,
                "mounted",
                "/quarantine/mounted",
                expected_device=1,
            )

    with pytest.raises(guard.GuardError, match="mounted filesystem"):
        call()


@pytest.mark.parametrize("operation", ["copy", "cleanup"])
def test_legacy_tree_operations_reject_same_device_bind_mounts(
    monkeypatch, operation
):
    guard = _load_path_guard_module()
    directory = SimpleNamespace(
        st_mode=stat.S_IFDIR | 0o755,
        st_dev=1,
        st_ino=42,
    )
    monkeypatch.setattr(guard, "_fd_mount_id", lambda _fd: 2)
    monkeypatch.setattr(guard.os, "fstat", lambda _fd: directory)
    if operation == "copy":
        def call():
            guard._copy_legacy_directory(
                10,
                11,
                "bind-mounted",
                [],
                interpreter="/trusted/python",
                anchor="/trusted",
                uid=os.getuid(),
                gid=os.getgid(),
                source_device=1,
                source_mount_id=1,
            )
    else:
        monkeypatch.setattr(
            guard.os,
            "stat",
            lambda *_args, **_kwargs: directory,
        )
        monkeypatch.setattr(guard, "_open_child_directory", lambda *_args: 12)
        monkeypatch.setattr(guard.os, "close", lambda _fd: None)

        def call():
            guard._remove_tree_entry(
                10,
                "bind-mounted",
                "/quarantine/bind-mounted",
                expected_device=1,
                expected_mount_id=1,
            )

    with pytest.raises(guard.GuardError, match="mounted filesystem"):
        call()


def test_path_guard_adopts_only_the_final_real_directory(tmp_path):
    anchor = tmp_path / "trusted"
    parent = anchor / "opt" / "patina"
    parent.mkdir(parents=True, mode=0o755)
    app = parent / "scan-pipeline"
    app.mkdir(mode=0o777)
    app.chmod(0o777)

    _path_guard(
        tmp_path,
        "ensure-trusted-dir",
        "--path",
        str(app),
        "--mode",
        "0755",
        "--adopt-final",
    )

    assert stat.S_IMODE(app.stat().st_mode) == 0o755


def test_path_guard_rejects_a_symlinked_managed_parent(tmp_path):
    anchor = tmp_path / "trusted"
    outside = tmp_path / "outside"
    outside.mkdir()
    anchor.mkdir(mode=0o700)
    (anchor / "opt").symlink_to(outside)

    result = _path_guard(
        tmp_path,
        "ensure-trusted-dir",
        "--path",
        str(anchor / "opt" / "patina"),
        "--mode",
        "0755",
        expected_ok=False,
    )
    assert "symlink" in result.stderr.lower()
    assert not (outside / "patina").exists()


def test_path_guard_canonicalizes_only_a_trusted_executable(tmp_path):
    anchor = tmp_path / "trusted"
    bin_dir = anchor / "usr" / "bin"
    bin_dir.mkdir(parents=True, mode=0o755)
    target = bin_dir / "python3.11"
    target.write_text("#!/bin/sh\n")
    target.chmod(0o755)
    link = bin_dir / "python3"
    link.symlink_to(target.name)

    accepted = _path_guard(
        tmp_path,
        "validate-trusted-executable",
        "--path",
        str(link),
    )
    assert accepted.stdout.strip() == str(target)


def test_path_guard_rejects_writable_or_relative_privileged_executable(tmp_path):
    anchor = tmp_path / "trusted"
    bin_dir = anchor / "usr" / "bin"
    bin_dir.mkdir(parents=True, mode=0o755)
    executable = bin_dir / "python3.11"
    executable.write_text("#!/bin/sh\n")
    executable.chmod(0o777)

    writable = _path_guard(
        tmp_path,
        "validate-trusted-executable",
        "--path",
        str(executable),
        expected_ok=False,
    )
    assert "writable" in writable.stderr.lower()

    relative = _path_guard(
        tmp_path,
        "validate-trusted-executable",
        "--path",
        "python3.11",
        expected_ok=False,
    )
    assert "absolute" in relative.stderr.lower()


def test_release_path_is_unpredictable_recordable_then_atomically_created(tmp_path):
    app = tmp_path / "trusted" / "opt" / "patina" / "scan-pipeline"
    _path_guard(
        tmp_path,
        "ensure-trusted-dir",
        "--path",
        str(app),
        "--mode",
        "0755",
    )
    first = _path_guard(
        tmp_path, "generate-release-path", "--app-dir", str(app)
    ).stdout.strip()
    second = _path_guard(
        tmp_path, "generate-release-path", "--app-dir", str(app)
    ).stdout.strip()
    assert first != second
    assert Path(first).parent == app
    assert Path(first).name.startswith(".venv.release.")
    assert not Path(first).exists(), "marker can be made durable before mkdir"

    _path_guard(tmp_path, "create-release", "--app-dir", str(app), "--path", first)
    assert Path(first).is_dir()
    assert stat.S_IMODE(Path(first).stat().st_mode) == 0o700
    duplicate = _path_guard(
        tmp_path,
        "create-release",
        "--app-dir",
        str(app),
        "--path",
        first,
        expected_ok=False,
    )
    assert "exists" in duplicate.stderr.lower()


def test_hostile_umask_concurrent_service_cannot_inject_root_candidate(
    tmp_path, monkeypatch
):
    app = tmp_path / "trusted" / "opt" / "patina" / "scan-pipeline"
    _path_guard(
        tmp_path,
        "ensure-trusted-dir",
        "--path",
        str(app),
        "--mode",
        "0755",
    )
    release = app / ".venv.release.hostile-umask"
    guard = _load_path_guard_module()
    previous_umask = os.umask(0)
    try:
        guard.create_release(
            str(app),
            str(release),
            anchor=str(tmp_path / "trusted"),
            uid=os.getuid(),
            gid=os.getgid(),
        )
        bin_dir = release / "bin"
        bin_dir.mkdir(mode=0o777)
        (bin_dir / "python").symlink_to(sys.executable)
        site_packages = release / "lib" / "python" / "site-packages"
        site_packages.mkdir(parents=True, mode=0o777)
        payload = site_packages / "payload.py"
        payload.write_text("result.write_text('trusted')\n")
        launcher = site_packages / "candidate.py"
        launcher.write_text(
            "from pathlib import Path\n"
            "import sys\n"
            "result = Path(sys.argv[1])\n"
            "print('READY', flush=True)\n"
            "sys.stdin.readline()\n"
            "exec(Path(sys.argv[0]).with_name('payload.py').read_text())\n"
        )
    finally:
        os.umask(previous_umask)

    service_uid = os.getuid() + 1000
    service_gid = os.getgid() + 1000
    attempts: list[bool] = []

    def service_can_overwrite() -> bool:
        return all(
            _principal_has_mode(path, uid=service_uid, gid=service_gid, bits=0b001)
            for path in (release, release / "lib", release / "lib" / "python", site_packages)
        ) and _principal_can_write(payload, uid=service_uid, gid=service_gid)

    def concurrent_service_writer() -> None:
        permitted = service_can_overwrite()
        attempts.append(permitted)
        if permitted:
            payload.write_text("result.write_text('service-controlled')\n")

    def run_candidate_while_service_writes(result: Path) -> None:
        process = subprocess.Popen(
            [str(bin_dir / "python"), "-I", str(launcher), str(result)],
            text=True,
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
        )
        assert process.stdout is not None
        assert process.stdout.readline().strip() == "READY"
        writer = threading.Thread(target=concurrent_service_writer)
        writer.start()
        writer.join(timeout=5)
        assert not writer.is_alive()
        stdout, stderr = process.communicate("\n", timeout=5)
        assert process.returncode == 0, f"{stdout}\n{stderr}"

    # Exercise an actual privileged-candidate-shaped Python process while a
    # modeled distinct service identity tries to replace code it will import.
    # Hostile child modes alone are insufficient: traversal of the 0700 release
    # root must deny the concurrent writer.
    assert stat.S_IMODE(release.stat().st_mode) == 0o700
    assert stat.S_IMODE(site_packages.stat().st_mode) == 0o777
    assert stat.S_IMODE(payload.stat().st_mode) == 0o666
    private_result = tmp_path / "private-result"
    run_candidate_while_service_writes(private_result)
    assert attempts == [False]
    assert private_result.read_text() == "trusted"

    # Pause the first descendant harden operation and run the same writer in
    # parallel. This deterministically catches publishing the root as 0755
    # before broad descendants are normalized.
    guard = _load_path_guard_module()
    original_harden_entry = guard._harden_entry
    original_validate_release_tree = guard._validate_release_tree
    original_fsync = guard.os.fsync
    first_entry = True
    validation_root_modes: list[int] = []
    fsync_events: list[tuple[int, int]] = []
    release_inode = release.stat().st_ino
    payload_inode = payload.stat().st_ino

    def harden_entry_with_concurrent_writer(*args, **kwargs):
        nonlocal first_entry
        if first_entry:
            first_entry = False
            writer = threading.Thread(target=concurrent_service_writer)
            writer.start()
            writer.join(timeout=5)
            assert not writer.is_alive()
        return original_harden_entry(*args, **kwargs)

    def validate_release_tree_with_mode_observation(path, **kwargs):
        validation_root_modes.append(stat.S_IMODE(Path(path).stat().st_mode))
        return original_validate_release_tree(path, **kwargs)

    def fsync_with_inode_observation(fd):
        info = os.fstat(fd)
        fsync_events.append((info.st_ino, stat.S_IMODE(info.st_mode)))
        return original_fsync(fd)

    monkeypatch.setattr(guard, "_harden_entry", harden_entry_with_concurrent_writer)
    monkeypatch.setattr(
        guard, "_validate_release_tree", validate_release_tree_with_mode_observation
    )
    monkeypatch.setattr(guard.os, "fsync", fsync_with_inode_observation)
    guard.harden_release(
        str(app),
        str(release),
        stable_link=False,
        anchor=str(tmp_path / "trusted"),
        uid=os.getuid(),
        gid=os.getgid(),
    )
    assert attempts == [False, False]
    assert validation_root_modes == [0o700, 0o755]
    payload_sync = next(
        offset for offset, event in enumerate(fsync_events) if event == (payload_inode, 0o644)
    )
    publication_sync = next(
        offset for offset, event in enumerate(fsync_events) if event == (release_inode, 0o755)
    )
    assert payload_sync < publication_sync
    assert stat.S_IMODE(release.stat().st_mode) == 0o755
    assert stat.S_IMODE(site_packages.stat().st_mode) == 0o755
    assert stat.S_IMODE(payload.stat().st_mode) == 0o644
    published_result = tmp_path / "published-result"
    run_candidate_while_service_writes(published_result)
    assert attempts == [False, False, False]
    assert published_result.read_text() == "trusted"


def test_harden_release_failure_leaves_candidate_root_sealed(tmp_path, monkeypatch):
    app = tmp_path / "trusted" / "opt" / "patina" / "scan-pipeline"
    _path_guard(
        tmp_path,
        "ensure-trusted-dir",
        "--path",
        str(app),
        "--mode",
        "0755",
    )
    release = app / ".venv.release.harden-failure"
    _path_guard(tmp_path, "create-release", "--app-dir", str(app), "--path", str(release))
    child = release / "candidate.py"
    child.write_text("pass\n")

    guard = _load_path_guard_module()

    def fail_hardening(*_args, **_kwargs):
        raise OSError("injected descendant harden failure")

    monkeypatch.setattr(guard, "_harden_entry", fail_hardening)
    with pytest.raises(OSError, match="injected descendant harden failure"):
        guard.harden_release(
            str(app),
            str(release),
            stable_link=False,
            anchor=str(tmp_path / "trusted"),
            uid=os.getuid(),
            gid=os.getgid(),
        )

    assert stat.S_IMODE(release.stat().st_mode) == 0o700


def test_release_validation_rejects_escape_and_untrusted_targets(tmp_path):
    app = tmp_path / "trusted" / "opt" / "patina" / "scan-pipeline"
    _path_guard(
        tmp_path,
        "ensure-trusted-dir",
        "--path",
        str(app),
        "--mode",
        "0755",
    )
    outside = tmp_path / "trusted" / "outside"
    outside.mkdir()
    stable = app / ".venv"
    stable.symlink_to(outside)

    escaped = _path_guard(
        tmp_path,
        "validate-release",
        "--app-dir",
        str(app),
        "--path",
        str(stable),
        "--stable-link",
        expected_ok=False,
    )
    assert "contained" in escaped.stderr.lower()

    stable.unlink()
    release = app / ".venv.release.deadbeefdeadbeefdeadbeef"
    release.mkdir(mode=0o777)
    release.chmod(0o777)
    stable.symlink_to(release)
    writable = _path_guard(
        tmp_path,
        "validate-release",
        "--app-dir",
        str(app),
        "--path",
        str(stable),
        "--stable-link",
        expected_ok=False,
    )
    assert "writable" in writable.stderr.lower()


def test_release_validation_requires_exact_field_raster_helper(tmp_path):
    guard = _load_path_guard_module()
    app = tmp_path / "trusted" / "opt" / "patina" / "scan-pipeline"
    _path_guard(
        tmp_path,
        "ensure-trusted-dir",
        "--path",
        str(app),
        "--mode",
        "0755",
    )
    release = app / ".venv.release.deadbeefdeadbeefdeadbeef"
    _path_guard(
        tmp_path,
        "create-release",
        "--app-dir",
        str(app),
        "--path",
        str(release),
    )
    helper = (
        release
        / "libexec"
        / "patina"
        / "field-raster-libheif-helper-v2"
    )
    helper.parent.mkdir(parents=True, mode=0o700)
    helper_payload = b"\x7fELFqualified helper fixture"
    helper.write_bytes(helper_payload)
    helper.chmod(0o755)
    manifest = helper.with_name(helper.name + ".manifest.json")
    manifest_value = {
        "binarySha256": hashlib.sha256(helper_payload).hexdigest(),
        "compileFlags": list(guard.FIELD_RASTER_HELPER_COMPILE_FLAGS),
        "compilerPath": "/usr/bin/cc",
        "compilerVersion": "fixture cc 1.0",
        "libheifPackageVersion": "1.17.6-1ubuntu4.6",
        "libheifPkgConfigVersion": "1.17.6",
        "pkgConfigFlags": ["-lheif"],
        "schema": guard.FIELD_RASTER_HELPER_MANIFEST_SCHEMA,
        "sourceSha256": guard.FIELD_RASTER_HELPER_SOURCE_SHA256,
    }
    manifest.write_text(
        json.dumps(
            manifest_value,
            sort_keys=True,
            separators=(",", ":"),
            ensure_ascii=True,
        )
        + "\n",
        encoding="ascii",
    )
    manifest.chmod(0o644)
    field_raster_args = (
        "--require-field-raster-helper",
        "--expected-field-raster-libheif-package-version",
        "1.17.6-1ubuntu4.6",
        "--expected-field-raster-libheif-pkg-config-version",
        "1.17.6",
        "--expected-field-raster-pkg-config-flags-json",
        '["-lheif"]',
    )
    _path_guard(
        tmp_path,
        "harden-release",
        "--app-dir",
        str(app),
        "--path",
        str(release),
    )

    _path_guard(
        tmp_path,
        "validate-release",
        "--app-dir",
        str(app),
        "--path",
        str(release),
        *field_raster_args,
    )

    stale = _path_guard(
        tmp_path,
        "validate-release",
        "--app-dir",
        str(app),
        "--path",
        str(release),
        "--require-field-raster-helper",
        "--expected-field-raster-libheif-package-version",
        "1.17.6-1ubuntu4.7",
        "--expected-field-raster-libheif-pkg-config-version",
        "1.17.6",
        "--expected-field-raster-pkg-config-flags-json",
        '["-lheif"]',
        expected_ok=False,
    )
    assert "manifest contract failed" in stale.stderr.lower()

    malformed_manifest = dict(manifest_value)
    malformed_manifest["compilerVersion"] = float("nan")
    manifest.write_text(
        json.dumps(
            malformed_manifest,
            sort_keys=True,
            separators=(",", ":"),
        )
        + "\n",
        encoding="ascii",
    )
    invalid_json = _path_guard(
        tmp_path,
        "validate-release",
        "--app-dir",
        str(app),
        "--path",
        str(release),
        *field_raster_args,
        expected_ok=False,
    )
    assert "manifest is invalid" in invalid_json.stderr.lower()
    manifest.write_text(
        json.dumps(
            manifest_value,
            sort_keys=True,
            separators=(",", ":"),
            ensure_ascii=True,
        )
        + "\n",
        encoding="ascii",
    )
    manifest.chmod(0o644)

    helper.chmod(0o755 | stat.S_IWGRP)
    rejected = _path_guard(
        tmp_path,
        "validate-release",
        "--app-dir",
        str(app),
        "--path",
        str(release),
        *field_raster_args,
        expected_ok=False,
    )
    assert "writable" in rejected.stderr.lower() or "0755" in rejected.stderr

    helper.chmod(0o755)
    helper.write_bytes(b"\x7fELFtampered helper fixture")
    helper.chmod(0o755)
    tampered = _path_guard(
        tmp_path,
        "validate-release",
        "--app-dir",
        str(app),
        "--path",
        str(release),
        *field_raster_args,
        expected_ok=False,
    )
    assert "hash differs" in tampered.stderr.lower()
    helper.write_bytes(helper_payload)
    helper.chmod(0o755)

    real_libexec = release / "real-libexec"
    (release / "libexec").rename(real_libexec)
    (release / "libexec").symlink_to("real-libexec")
    symlinked = _path_guard(
        tmp_path,
        "validate-release",
        "--app-dir",
        str(app),
        "--path",
        str(release),
        *field_raster_args,
        expected_ok=False,
    )
    assert symlinked.returncode != 0


def test_harden_release_removes_service_write_without_following_symlinks(tmp_path):
    app = tmp_path / "trusted" / "opt" / "patina" / "scan-pipeline"
    _path_guard(
        tmp_path,
        "ensure-trusted-dir",
        "--path",
        str(app),
        "--mode",
        "0755",
    )
    release = app / ".venv.release.deadbeefdeadbeefdeadbeef"
    release.mkdir(mode=0o777)
    release.chmod(0o777)
    writable = release / "bin"
    writable.mkdir(mode=0o777)
    writable.chmod(0o777)
    entrypoint = writable / "patina-scan-worker"
    entrypoint.write_text("#!/bin/sh\n")
    entrypoint.chmod(0o777)
    outside = tmp_path / "outside"
    outside.write_text("untouched")
    outside.chmod(0o666)
    (writable / "outside-link").symlink_to(outside)

    _path_guard(
        tmp_path,
        "harden-release",
        "--app-dir",
        str(app),
        "--path",
        str(release),
    )

    assert stat.S_IMODE(release.stat().st_mode) & 0o022 == 0
    assert stat.S_IMODE(writable.stat().st_mode) & 0o022 == 0
    assert stat.S_IMODE(entrypoint.stat().st_mode) & 0o022 == 0
    assert stat.S_IMODE(outside.stat().st_mode) == 0o666


def test_stable_release_check_never_chmods_active_release(tmp_path, monkeypatch):
    app = tmp_path / "trusted" / "opt" / "patina" / "scan-pipeline"
    _path_guard(
        tmp_path,
        "ensure-trusted-dir",
        "--path",
        str(app),
        "--mode",
        "0755",
    )
    release = app / ".venv.release.active"
    release.mkdir(mode=0o755)
    module = release / "worker.py"
    module.write_text("pass\n")
    module.chmod(0o644)
    stable = app / ".venv"
    stable.symlink_to(release.name)

    guard = _load_path_guard_module()
    chmod_calls: list[tuple[int, int]] = []

    def forbidden_fchmod(fd: int, mode: int) -> None:
        chmod_calls.append((fd, mode))
        raise AssertionError("stable release validation must not chmod")

    monkeypatch.setattr(guard.os, "fchmod", forbidden_fchmod)
    resolved = guard.harden_release(
        str(app),
        str(stable),
        stable_link=True,
        anchor=str(tmp_path / "trusted"),
        uid=os.getuid(),
        gid=os.getgid(),
    )

    assert resolved == str(release)
    assert chmod_calls == []
    assert stat.S_IMODE(release.stat().st_mode) == 0o755
    assert stat.S_IMODE(module.stat().st_mode) == 0o644

    module.chmod(0o666)
    with pytest.raises(guard.GuardError, match="group/world writable"):
        guard.harden_release(
            str(app),
            str(stable),
            stable_link=True,
            anchor=str(tmp_path / "trusted"),
            uid=os.getuid(),
            gid=os.getgid(),
        )
    assert stat.S_IMODE(release.stat().st_mode) == 0o755
    assert stat.S_IMODE(module.stat().st_mode) == 0o666


def test_trusted_directory_validation_rejects_group_world_writable_state(tmp_path):
    transaction = tmp_path / "trusted" / "etc" / ".scan-worker-install-transaction"
    transaction.mkdir(parents=True, mode=0o700)
    transaction.chmod(0o777)

    result = _path_guard(
        tmp_path,
        "validate-trusted-dir",
        "--path",
        str(transaction),
        expected_ok=False,
    )

    assert "writable" in result.stderr.lower()


def test_marker_read_rejects_symlinks_without_disclosing_the_target(tmp_path):
    transaction = tmp_path / "trusted" / "etc" / ".scan-worker-install-transaction"
    transaction.mkdir(parents=True, mode=0o700)
    outside = tmp_path / "service-controlled-secret"
    outside.write_text("arbitrary-unit-target\n")
    (transaction / "state").symlink_to(outside)

    result = _path_guard(
        tmp_path,
        "read-trusted-file",
        "--root",
        str(transaction),
        "--path",
        str(transaction / "state"),
        expected_ok=False,
    )

    assert "symlink" in result.stderr.lower()
    assert "arbitrary-unit-target" not in result.stdout


def test_marker_read_requires_trusted_regular_nonwritable_file(tmp_path):
    transaction = tmp_path / "trusted" / "etc" / ".scan-worker-install-transaction"
    transaction.mkdir(parents=True, mode=0o700)
    marker = transaction / "state"
    marker.write_text("prepared\n")
    marker.chmod(0o666)

    result = _path_guard(
        tmp_path,
        "read-trusted-file",
        "--root",
        str(transaction),
        "--path",
        str(marker),
        expected_ok=False,
    )
    assert "writable" in result.stderr.lower()

    marker.chmod(0o600)
    accepted = _path_guard(
        tmp_path,
        "read-trusted-file",
        "--root",
        str(transaction),
        "--path",
        str(marker),
    )
    assert accepted.stdout == "prepared\n"


def _write_minimal_installer_source(source: Path) -> None:
    source.mkdir(parents=True, exist_ok=True)
    for name in INSTALL_SOURCE_FILES:
        path = source / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(f"fixture {name}\n")
        path.chmod(
            0o755
            if name in {"install.sh", "install-colmap-4.0.2.sh"}
            else 0o644
        )


def test_installer_source_fixture_and_guard_allowlists_match_reviewed_tree():
    guard = _load_path_guard_module()
    package_root = INSTALL.parent / "src" / "patina_scan_worker"
    actual_package_files = {
        path.relative_to(INSTALL.parent).as_posix()
        for path in package_root.rglob("*")
        if path.is_file() and path.suffix in {".py", ".c"}
    }

    assert set(INSTALL_SOURCE_FILES) == set(guard.SOURCE_FILES)
    assert actual_package_files == set(guard.SOURCE_PACKAGE_FILES)


def _copy_reviewed_installer_source(source: Path) -> None:
    for name in INSTALL_SOURCE_FILES:
        original = INSTALL.parent / name
        destination = source / name
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(original, destination)


def _installer_source_snapshot(source: Path) -> tuple[tuple[object, ...], ...]:
    entries: list[tuple[object, ...]] = []
    for path in sorted(source.rglob("*")):
        relative = path.relative_to(source).as_posix()
        mode = stat.S_IMODE(path.stat().st_mode)
        if path.is_dir():
            entries.append((relative, "directory", mode))
        else:
            entries.append(
                (relative, "file", mode, hashlib.sha256(path.read_bytes()).hexdigest())
            )
    return tuple(entries)


def _rewrite_worker_wheel(wheel: Path, mutate) -> None:
    with zipfile.ZipFile(wheel) as archive:
        payloads = {
            info.filename: archive.read(info.filename) for info in archive.infolist()
        }
    record_name = next(name for name in payloads if name.endswith(".dist-info/RECORD"))
    payloads.pop(record_name)
    mutate(payloads)
    record_lines = [
        f"{name},{_record_digest(data)},{len(data)}"
        for name, data in payloads.items()
    ]
    record_lines.append(f"{record_name},,")
    payloads[record_name] = ("\n".join(record_lines) + "\n").encode()
    replacement = wheel.with_suffix(".replacement")
    with zipfile.ZipFile(replacement, "x", compression=zipfile.ZIP_DEFLATED) as archive:
        for name, data in payloads.items():
            archive.writestr(name, data)
    replacement.replace(wheel)


def _principal_can_write(path: Path, *, uid: int, gid: int) -> bool:
    info = path.stat()
    mode = stat.S_IMODE(info.st_mode)
    if info.st_uid == uid:
        return bool(mode & stat.S_IWUSR)
    if info.st_gid == gid:
        return bool(mode & stat.S_IWGRP)
    return bool(mode & stat.S_IWOTH)


def _principal_has_mode(path: Path, *, uid: int, gid: int, bits: int) -> bool:
    info = path.stat()
    mode = stat.S_IMODE(info.st_mode)
    if info.st_uid == uid:
        granted = (mode & stat.S_IRWXU) >> 6
    elif info.st_gid == gid:
        granted = (mode & stat.S_IRWXG) >> 3
    else:
        granted = mode & stat.S_IRWXO
    return granted & bits == bits


def test_source_validation_accepts_only_complete_root_owned_snapshot(tmp_path):
    source = tmp_path / "trusted" / "opt" / "patina" / "scan-pipeline"
    _path_guard(
        tmp_path,
        "ensure-trusted-dir",
        "--path",
        str(source),
        "--mode",
        "0755",
    )
    _write_minimal_installer_source(source)

    _path_guard(tmp_path, "validate-source-tree", "--source-dir", str(source))

    service_uid = os.getuid() + 1000
    service_gid = os.getgid() + 1000
    protected = [
        source / "install.sh",
        source / "install-path-guard.py",
        source / "install-venv-lib.sh",
        source / "pyproject.toml",
        source / "src" / "patina_scan_worker" / "__init__.py",
    ]
    assert all(path.stat().st_uid == os.getuid() for path in protected)
    assert not any(
        _principal_can_write(path, uid=service_uid, gid=service_gid)
        for path in protected
    )


def test_transaction_source_copy_requires_exact_trusted_bytes(tmp_path):
    source = tmp_path / "trusted" / "source"
    copy = tmp_path / "trusted" / "copy"
    _write_minimal_installer_source(source)
    shutil.copytree(source, copy)
    (copy / "pyproject.toml").write_text("different but structurally valid\n")

    result = _path_guard(
        tmp_path,
        "validate-source-copy",
        "--source-dir",
        str(source),
        "--copy-dir",
        str(copy),
        expected_ok=False,
    )
    assert "transaction source copy differs at pyproject.toml" in result.stderr


@pytest.mark.parametrize(
    ("extras", "deleted_worker_member"),
    (
        pytest.param("drawings", None, id="cpu"),
        pytest.param(
            "drawings,gpu",
            "patina_scan_worker/field_raster_materializer.py",
            id="gpu-missing-field-raster-materializer",
        ),
        pytest.param(
            "drawings,gpu",
            "patina_scan_worker/field_storage_acquirer.py",
            id="gpu-missing-field-storage-acquirer",
        ),
        pytest.param(
            "drawings,gpu",
            "patina_scan_worker/refine_colmap_backend.py",
            id="gpu-missing-refine-colmap-backend",
        ),
        pytest.param(
            "drawings,gpu",
            "patina_scan_worker/refine_colmap_command.py",
            id="gpu-missing-refine-colmap-command",
        ),
        pytest.param(
            "drawings,gpu",
            "patina_scan_worker/refine_colmap_manifest.py",
            id="gpu-missing-refine-colmap-manifest",
        ),
        pytest.param(
            "drawings,gpu",
            "patina_scan_worker/refine_colmap_toolchain.py",
            id="gpu-missing-refine-colmap-toolchain",
        ),
        pytest.param(
            "drawings,gpu",
            "patina_scan_worker/refine_evidence_builder.py",
            id="gpu-missing-refine-evidence-builder",
        ),
        pytest.param(
            "drawings,gpu",
            "patina_scan_worker/refine_materializer.py",
            id="gpu-missing-refine-materializer",
        ),
        pytest.param(
            "drawings,gpu",
            "patina_scan_worker/refine_native_process.py",
            id="gpu-missing-refine-native-process",
        ),
        pytest.param(
            "drawings,gpu",
            "patina_scan_worker/refine_packet_extractor.py",
            id="gpu-missing-refine-packet-extractor",
        ),
        pytest.param(
            "drawings,gpu",
            "patina_scan_worker/refine_runner.py",
            id="gpu-missing-refine-runner",
        ),
        pytest.param(
            "drawings,gpu",
            "patina_scan_worker/refine_publisher.py",
            id="gpu-missing-refine-publisher",
        ),
    ),
)
def test_local_path_build_keeps_trusted_source_byte_and_tree_clean(
    tmp_path, extras, deleted_worker_member
):
    trusted = tmp_path / "trusted"
    source = trusted / "scan-pipeline-source"
    transaction_parent = trusted / "etc"
    transaction_parent.mkdir(parents=True, mode=0o750)
    _copy_reviewed_installer_source(source)
    _path_guard(tmp_path, "validate-source-tree", "--source-dir", str(source))
    source_before = _installer_source_snapshot(source)

    shell = r"""
set -euo pipefail
source "$1"
SRC_DIR="$2"
TRANSACTION_PARENT="$3"
TRANSACTION_DIR="$TRANSACTION_PARENT/.scan-worker-install-transaction"
STAGED_VENV=""
INSTALL_PATH_GUARD_SCRIPT="$4"
INSTALL_PATH_GUARD_PYTHON="$5"
INSTALL_TRUST_ANCHOR="$6"
INSTALL_TRUSTED_UID="$(id -u)"
INSTALL_TRUSTED_GID="$(id -g)"
TEST_PYTHON="$5"
_run_privileged_python() { "$TEST_PYTHON" -I -S "$@"; }
prepare_install_transaction
_prepare_isolated_source_build "$SRC_DIR"
"""
    prepared = subprocess.run(
        [
            "bash",
            "-c",
            shell,
            "source-isolation-test",
            str(VENV_LIB),
            str(source),
            str(transaction_parent),
            str(PATH_GUARD),
            sys.executable,
            str(trusted),
        ],
        text=True,
        capture_output=True,
        check=False,
    )
    assert prepared.returncode == 0, prepared.stderr
    build_source = Path(prepared.stdout.strip())
    assert build_source == (
        transaction_parent / ".scan-worker-install-transaction" / "source-build"
    )
    _path_guard(
        tmp_path,
        "validate-source-copy",
        "--source-dir",
        str(source),
        "--copy-dir",
        str(build_source),
    )
    for relative in (
        "src/patina_scan_worker/field_raster_materializer.py",
        "src/patina_scan_worker/field_storage_acquirer.py",
        "src/patina_scan_worker/refine_colmap_backend.py",
        "src/patina_scan_worker/refine_colmap_command.py",
        "src/patina_scan_worker/refine_colmap_manifest.py",
        "src/patina_scan_worker/refine_colmap_toolchain.py",
        "src/patina_scan_worker/refine_evidence_builder.py",
        "src/patina_scan_worker/refine_materializer.py",
        "src/patina_scan_worker/refine_native_process.py",
        "src/patina_scan_worker/refine_packet_extractor.py",
        "src/patina_scan_worker/refine_publisher.py",
        "src/patina_scan_worker/refine_runner.py",
    ):
        assert (build_source / relative).read_bytes() == (source / relative).read_bytes()

    wheel_dir = trusted / "candidate-release" / ".artifacts"
    wheel_dir.mkdir(parents=True)
    build_tmp = (
        transaction_parent / ".scan-worker-install-transaction" / "build-tmp"
    )
    build_tmp.mkdir()
    build_env = {
        **os.environ,
        "SOURCE_DATE_EPOCH": "1784655816",
        "TMPDIR": str(build_tmp),
    }
    built = subprocess.run(
        [
            sys.executable,
            "-m",
            "pip",
            "wheel",
            "--disable-pip-version-check",
            "--no-input",
            "--no-deps",
            "--no-build-isolation",
            "--wheel-dir",
            str(wheel_dir),
            str(build_source),
        ],
        text=True,
        capture_output=True,
        env=build_env,
        check=False,
    )
    assert built.returncode == 0, built.stdout + built.stderr
    assert (build_source / "build").is_dir()
    assert (build_source / "src" / "patina_scan_worker.egg-info").is_dir()

    wheel_result = _path_guard(
        tmp_path,
        "validate-worker-wheel",
        "--wheel-dir",
        str(wheel_dir),
        "--source-dir",
        str(source),
    )
    wheel_value, wheel_sha256 = wheel_result.stdout.strip().split("\t")
    wheel = Path(wheel_value)
    assert wheel.name == "patina_scan_worker-0.1.0-py3-none-any.whl"
    assert hashlib.sha256(wheel.read_bytes()).hexdigest() == wheel_sha256

    install_target = tmp_path / "installed"
    worker_requirement = (
        f"patina-scan-worker[{extras}] @ {wheel.as_uri()}#sha256={wheel_sha256}"
    )
    installed = subprocess.run(
        [
            sys.executable,
            "-m",
            "pip",
            "install",
            "--disable-pip-version-check",
            "--no-input",
            "--no-deps",
            "--target",
            str(install_target),
            worker_requirement,
        ],
        text=True,
        capture_output=True,
        check=False,
    )
    assert installed.returncode == 0, installed.stdout + installed.stderr
    imported = subprocess.run(
        [
            sys.executable,
            "-I",
            "-c",
            (
                "import pathlib,sys; sys.path.insert(0,sys.argv[1]); "
                "import patina_scan_worker.field_raster_materializer as raster; "
                "import patina_scan_worker.field_storage_acquirer as storage_acquirer; "
                "import patina_scan_worker.refine_colmap_backend as colmap_backend; "
                "import patina_scan_worker.refine_colmap_command as colmap_command; "
                "import patina_scan_worker.refine_colmap_toolchain as colmap_toolchain; "
                "import patina_scan_worker.refine_evidence_builder as evidence_builder; "
                "import patina_scan_worker.refine_materializer as materializer; "
                "import patina_scan_worker.refine_native_process as native; "
                "import patina_scan_worker.refine_packet_extractor as packet_extractor; "
                "import patina_scan_worker.refine_publisher as publisher; "
                "import patina_scan_worker.refine_runner as runner; "
                "root=pathlib.Path(sys.argv[1]).resolve(); "
                "assert pathlib.Path(raster.__file__).resolve().is_relative_to(root); "
                "assert pathlib.Path(storage_acquirer.__file__).resolve().is_relative_to(root); "
                "assert pathlib.Path(colmap_backend.__file__).resolve().is_relative_to(root); "
                "assert pathlib.Path(colmap_command.__file__).resolve().is_relative_to(root); "
                "assert pathlib.Path(colmap_toolchain.__file__).resolve().is_relative_to(root); "
                "assert pathlib.Path(evidence_builder.__file__).resolve().is_relative_to(root); "
                "assert pathlib.Path(materializer.__file__).resolve().is_relative_to(root); "
                "assert pathlib.Path(native.__file__).resolve().is_relative_to(root); "
                "assert pathlib.Path(packet_extractor.__file__).resolve().is_relative_to(root); "
                "assert pathlib.Path(publisher.__file__).resolve().is_relative_to(root); "
                "assert pathlib.Path(runner.__file__).resolve().is_relative_to(root)"
            ),
            str(install_target),
        ],
        text=True,
        capture_output=True,
        check=False,
    )
    assert imported.returncode == 0, imported.stdout + imported.stderr
    direct_url = json.loads(
        (
            install_target
            / "patina_scan_worker-0.1.0.dist-info"
            / "direct_url.json"
        ).read_text()
    )
    assert direct_url["url"] == wheel.as_uri()
    assert direct_url["archive_info"]["hashes"]["sha256"] == wheel_sha256
    assert _installer_source_snapshot(source) == source_before
    assert not (source / "build").exists()
    assert not (source / "src" / "patina_scan_worker.egg-info").exists()
    _path_guard(tmp_path, "validate-source-tree", "--source-dir", str(source))

    rejected_copy = _path_guard(
        tmp_path,
        "validate-source-tree",
        "--source-dir",
        str(build_source),
        expected_ok=False,
    )
    assert "unexpected installer source directory: build" in rejected_copy.stderr

    bad_wheel_dir = trusted / f"bad-wheel-{extras.replace(',', '-')}"
    shutil.copytree(wheel_dir, bad_wheel_dir)
    bad_wheel = bad_wheel_dir / wheel.name
    if deleted_worker_member is None:
        def inject_dependency(payloads):
            metadata_name = next(
                name for name in payloads if name.endswith(".dist-info/METADATA")
            )
            headers, body = payloads[metadata_name].split(b"\n\n", 1)
            payloads[metadata_name] = (
                headers
                + b"\nRequires-Dist: attacker-package @ https://example.invalid/x.whl"
                + b"\n\n"
                + body
            )

        _rewrite_worker_wheel(bad_wheel, inject_dependency)
        expected_rejection = "Requires-Dist contract changed"
    else:
        _rewrite_worker_wheel(
            bad_wheel,
            lambda payloads: payloads.pop(deleted_worker_member),
        )
        expected_rejection = "package payload does not exactly match trusted source"
    rejected_wheel = _path_guard(
        tmp_path,
        "validate-worker-wheel",
        "--wheel-dir",
        str(bad_wheel_dir),
        "--source-dir",
        str(source),
        expected_ok=False,
    )
    assert expected_rejection in rejected_wheel.stderr

    shutil.rmtree(transaction_parent / ".scan-worker-install-transaction")
    assert wheel.is_file()
    assert Path(direct_url["url"].removeprefix("file://")).is_file()


def test_source_validation_rejects_symlinked_package_content(tmp_path):
    source = tmp_path / "trusted" / "opt" / "patina" / "scan-pipeline"
    _path_guard(
        tmp_path,
        "ensure-trusted-dir",
        "--path",
        str(source),
        "--mode",
        "0755",
    )
    _write_minimal_installer_source(source)
    outside = tmp_path / "outside.py"
    outside.write_text("do not touch\n")
    outside.chmod(0o666)
    module = source / "src" / "patina_scan_worker" / "__init__.py"
    module.unlink()
    module.symlink_to(outside)

    result = _path_guard(
        tmp_path,
        "validate-source-tree",
        "--source-dir",
        str(source),
        expected_ok=False,
    )

    assert "symlink" in result.stderr.lower()
    assert stat.S_IMODE(outside.stat().st_mode) == 0o666


@pytest.mark.parametrize(
    "unexpected",
    ["setup.py", "setup.cfg", "MANIFEST.in", "sitecustomize.py", "usercustomize.py"],
)
def test_source_validation_rejects_stale_executable_build_inputs(
    tmp_path, unexpected
):
    source = tmp_path / "trusted" / "opt" / "patina" / "scan-pipeline-source"
    _path_guard(
        tmp_path,
        "ensure-trusted-dir",
        "--path",
        str(source),
        "--mode",
        "0755",
    )
    _write_minimal_installer_source(source)
    sentinel = tmp_path / "unexpected-build-input-ran"
    injected = source / unexpected
    injected.write_text(
        f"from pathlib import Path\nPath({str(sentinel)!r}).write_text('ran')\n"
    )
    injected.chmod(0o644)

    result = _path_guard(
        tmp_path,
        "validate-source-tree",
        "--source-dir",
        str(source),
        expected_ok=False,
    )

    assert "unexpected installer source" in result.stderr.lower()
    assert not sentinel.exists()


def test_source_validation_rejects_hardlinked_privileged_input(tmp_path):
    source = tmp_path / "trusted" / "opt" / "patina" / "scan-pipeline-source"
    _path_guard(
        tmp_path,
        "ensure-trusted-dir",
        "--path",
        str(source),
        "--mode",
        "0755",
    )
    _write_minimal_installer_source(source)
    alternate = tmp_path / "alternate-pyproject.toml"
    alternate.hardlink_to(source / "pyproject.toml")

    result = _path_guard(
        tmp_path,
        "validate-source-tree",
        "--source-dir",
        str(source),
        expected_ok=False,
    )

    assert "hardlink" in result.stderr.lower()
    assert alternate.read_text() == "fixture pyproject.toml\n"


def test_source_validation_rejects_an_unreviewed_package_module(tmp_path):
    source = tmp_path / "trusted" / "opt" / "patina" / "scan-pipeline-source"
    _path_guard(
        tmp_path,
        "ensure-trusted-dir",
        "--path",
        str(source),
        "--mode",
        "0755",
    )
    _write_minimal_installer_source(source)
    adapter = source / "src" / "patina_scan_worker" / "unreviewed_adapter.py"
    adapter.write_text("SAFE_ADAPTER = True\n")
    adapter.chmod(0o644)

    result = _path_guard(
        tmp_path,
        "validate-source-tree",
        "--source-dir",
        str(source),
        expected_ok=False,
    )
    assert "unexpected installer source" in result.stderr.lower()


@pytest.mark.parametrize(
    "required_module",
    [
        "colmap_qualification.py",
        "field_raster_materializer.py",
        "field_storage_acquirer.py",
        "refine_adapter.py",
        "refine_colmap_backend.py",
        "refine_colmap_command.py",
        "refine_colmap_manifest.py",
        "refine_colmap_toolchain.py",
        "refine_evidence_builder.py",
        "refine_engine.py",
        "refine_materializer.py",
        "refine_native_process.py",
        "refine_packet_extractor.py",
        "refine_publisher.py",
        "refine_runner.py",
    ],
)
def test_source_validation_requires_reviewed_refine_modules(tmp_path, required_module):
    source = tmp_path / "trusted" / "opt" / "patina" / "scan-pipeline-source"
    _path_guard(
        tmp_path,
        "ensure-trusted-dir",
        "--path",
        str(source),
        "--mode",
        "0755",
    )
    _write_minimal_installer_source(source)
    (source / "src" / "patina_scan_worker" / required_module).unlink()

    result = _path_guard(
        tmp_path,
        "validate-source-tree",
        "--source-dir",
        str(source),
        expected_ok=False,
    )

    assert "snapshot is incomplete" in result.stderr.lower()
    assert required_module in result.stderr


def test_source_validation_rejects_unreviewed_native_package_source(tmp_path):
    source = tmp_path / "trusted" / "opt" / "patina" / "scan-pipeline-source"
    _path_guard(
        tmp_path,
        "ensure-trusted-dir",
        "--path",
        str(source),
        "--mode",
        "0755",
    )
    _write_minimal_installer_source(source)
    unreviewed = source / "src" / "patina_scan_worker" / "unreviewed.c"
    unreviewed.write_text("int unreviewed(void) { return 1; }\n")
    unreviewed.chmod(0o644)

    result = _path_guard(
        tmp_path,
        "validate-source-tree",
        "--source-dir",
        str(source),
        expected_ok=False,
    )

    assert "unexpected installer source" in result.stderr.lower()


def test_restrictive_legacy_release_becomes_service_readable_and_executable(tmp_path):
    app = tmp_path / "trusted" / "opt" / "patina" / "scan-pipeline"
    _path_guard(
        tmp_path,
        "ensure-trusted-dir",
        "--path",
        str(app),
        "--mode",
        "0755",
    )
    release = app / ".venv.release.legacy-restrictive"
    package = release / "lib" / "patina_scan_worker"
    executable_dir = release / "bin"
    package.mkdir(parents=True, mode=0o700)
    executable_dir.mkdir(parents=True, mode=0o700)
    module = package / "__init__.py"
    module.write_text("READY = True\n")
    module.chmod(0o600)
    entrypoint = executable_dir / "patina-scan-worker"
    entrypoint.write_text("#!/bin/sh\nprintf 'usage: patina-scan-worker\\n'\n")
    entrypoint.chmod(0o700)
    for directory in (release, release / "lib", package, executable_dir):
        directory.chmod(0o700)

    _path_guard(
        tmp_path,
        "harden-release",
        "--app-dir",
        str(app),
        "--path",
        str(release),
    )

    service_uid = os.getuid() + 1000
    service_gid = os.getgid() + 1000
    for directory in (release, release / "lib", package, executable_dir):
        assert stat.S_IMODE(directory.stat().st_mode) == 0o755
        assert _principal_has_mode(
            directory, uid=service_uid, gid=service_gid, bits=0b101
        )
    assert stat.S_IMODE(module.stat().st_mode) == 0o644
    assert _principal_has_mode(module, uid=service_uid, gid=service_gid, bits=0b100)
    assert stat.S_IMODE(entrypoint.stat().st_mode) == 0o755
    assert _principal_has_mode(
        entrypoint, uid=service_uid, gid=service_gid, bits=0b101
    )
    help_result = subprocess.run(
        [str(entrypoint), "--help"], text=True, capture_output=True, check=False
    )
    assert help_result.returncode == 0
    assert "usage: patina-scan-worker" in help_result.stdout
    imported = subprocess.run(
        [
            "python3",
            "-c",
            "import patina_scan_worker; assert patina_scan_worker.READY",
        ],
        text=True,
        capture_output=True,
        env={**os.environ, "PYTHONPATH": str(release / "lib")},
        check=False,
    )
    assert imported.returncode == 0, imported.stderr


def test_source_bootstrap_precedes_every_sourced_or_executed_helper():
    script = INSTALL.read_text()
    bootstrap = script.index(
        '"$PATH_GUARD_PYTHON" -I -S - "$SRC_DIR" "$APP_DIR"'
    )
    validate = script.index('_path_guard validate-source-tree --source-dir "$SRC_DIR"')
    source_lib = script.index('. "$SRC_DIR/install-venv-lib.sh"')
    recovery = script.index("recover_install_transaction")

    assert bootstrap < validate < source_lib < recovery
    bootstrap_body = script[bootstrap:validate]
    assert "source == app" in bootstrap_body
    assert "must be staged separately" in bootstrap_body
    assert "os.fchown" not in bootstrap_body
    assert "os.fchmod" not in bootstrap_body
    assert "st_nlink != 1" in bootstrap_body


def test_bootstrap_never_invokes_a_service_writable_guard_or_library():
    script = INSTALL.read_text()
    bootstrap = script.index(
        '"$PATH_GUARD_PYTHON" -I -S - "$SRC_DIR" "$APP_DIR"'
    )
    validate = script.index('_path_guard validate-source-tree --source-dir "$SRC_DIR"')
    pre_validate = script[bootstrap:validate]

    # One occurrence is the inert function body; no call happens until the
    # validate-source-tree invocation at the slice boundary.
    guard_call = '"$PATH_GUARD_PYTHON" -I -S "$PATH_GUARD"'
    assert pre_validate.count(guard_call) == 1
    assert '. "$SRC_DIR/install-venv-lib.sh"' not in pre_validate
    assert "O_NOFOLLOW" in pre_validate


def test_privileged_entrypoint_ignores_hostile_path_and_bash_env(tmp_path):
    sentinel = tmp_path / "bash-env-ran"
    bash_env = tmp_path / "hostile-bash-env"
    bash_env.write_text(f"printf ran > {sentinel!s}\n")
    hostile_bin = tmp_path / "hostile-bin"
    hostile_bin.mkdir()
    fake_sed_sentinel = tmp_path / "fake-sed-ran"
    fake_sed = hostile_bin / "sed"
    fake_sed.write_text(f"#!/bin/sh\nprintf ran > {fake_sed_sentinel!s}\n")
    fake_sed.chmod(0o755)

    result = subprocess.run(
        [str(INSTALL), "--help"],
        text=True,
        capture_output=True,
        env={
            **os.environ,
            "BASH_ENV": str(bash_env),
            "PATH": str(hostile_bin),
        },
        check=False,
    )

    assert result.returncode == 0, result.stderr
    assert "Usage:" in result.stdout
    assert not sentinel.exists()
    assert not fake_sed_sentinel.exists()


def test_all_privileged_python_paths_are_isolated_and_environment_scrubbed(tmp_path):
    installer = INSTALL.read_text()
    activation = VENV_LIB.read_text()
    assert installer.startswith("#!/bin/bash -p\n")
    assert installer.index("PATH=/usr/sbin:/usr/bin:/sbin:/bin") < installer.index(
        'for arg in "$@"'
    )
    assert "/usr/bin/sed -n" in installer
    assert '$(dirname "${BASH_SOURCE[0]}")' not in installer
    assert '"$PATH_GUARD_PYTHON" -I -S - ' in installer
    assert '"$PATH_GUARD_PYTHON" -I -S "$PATH_GUARD"' in installer
    assert '_run_privileged_python -m venv "$STAGED_VENV"' in installer
    assert '"$STAGED_VENV/bin/pip"' not in installer
    assert '_run_candidate_python "$STAGED_VENV/bin/python" -m pip' in installer
    assert '"${PYTHON:-python3}" -c' not in activation
    assert "_run_privileged_python -c" in activation

    sentinel = tmp_path / "sitecustomize-ran"
    injection = tmp_path / "injection"
    injection.mkdir()
    (injection / "sitecustomize.py").write_text(
        f"from pathlib import Path\nPath({str(sentinel)!r}).write_text('ran')\n"
    )
    shell = r'''
set -euo pipefail
source "$1"
PYTHON="$2"
INSTALL_SECURE_PATH=/usr/sbin:/usr/bin:/sbin:/bin
_run_privileged_python -c 'print("isolated")'
'''
    result = subprocess.run(
        ["bash", "-c", shell, "python-isolation", str(VENV_LIB), sys.executable],
        text=True,
        capture_output=True,
        env={
            **os.environ,
            "PYTHONPATH": str(injection),
            "PYTHONHOME": str(tmp_path / "invalid-home"),
            "PYTHONSTARTUP": str(injection / "sitecustomize.py"),
        },
        check=False,
    )
    assert result.returncode == 0, result.stderr
    assert result.stdout.strip() == "isolated"
    assert not sentinel.exists()


def test_installer_validates_python_override_before_sourcing_helper():
    script = INSTALL.read_text()
    validate = 'PYTHON="$(_path_guard validate-trusted-executable --path "$PYTHON")"'
    source_helper = '. "$SRC_DIR/install-venv-lib.sh"'
    assert validate in script
    assert script.index(validate) < script.index(source_helper)


def test_documented_staging_replaces_stale_inputs_in_separate_source_tree():
    readme = (INSTALL.parent / "README.md").read_text()
    staging = readme[
        readme.index("# Stop the worker") : readme.index("CPU is enough")
    ]
    assert "/opt/patina/scan-pipeline-source" in staging
    assert "/opt/patina/scan-pipeline/install.sh" not in staging
    assert "--delete" in staging
    assert "--delete-excluded" in staging
    assert "--ignore-times" in staging
    assert "--chown=root:root" in staging
    assert "--chmod=Dgo-w,Fgo-w" in staging
    assert "--include='/install-colmap-4.0.2.sh'" in staging
    assert "--include='/pycolmap-build-requirements.txt'" in staging
    harden = "sudo chmod -R go-w -- /opt/patina/scan-pipeline-source"
    assert harden in staging
    assert staging.index("sudo rsync") < staging.index(harden)
    assert staging.index(harden) < staging.index(
        "sudo /opt/patina/scan-pipeline-source/install.sh"
    )
    assert "pgrep -u patina" in readme
    assert staging.index("pgrep -u patina") < staging.index("sudo rsync")
    assert "stop every patina process" in staging
    assert "exit 1" in staging
    assert "setup.py" in readme


def test_routine_upgrade_preserves_active_posture_without_pre_stop():
    readme = (INSTALL.parent / "README.md").read_text()
    upgrade = readme[
        readme.index("### Upgrading a running worker") : readme.index(
            "## The env file"
        )
    ]
    assert "while the worker remains active" in upgrade
    assert "do not pre-stop worker" in upgrade
    assert "systemctl stop patina-scan-worker" not in upgrade


def test_runtime_app_installer_is_atomically_neutralized():
    script = INSTALL.read_text()
    assert '_path_guard install-runtime-stub --app-dir "$APP_DIR"' in script


def test_runtime_installer_stub_replaces_legacy_hardlink_with_fresh_inode(tmp_path):
    app = tmp_path / "trusted" / "opt" / "patina" / "scan-pipeline"
    _path_guard(
        tmp_path,
        "ensure-trusted-dir",
        "--path",
        str(app),
        "--mode",
        "0755",
    )
    legacy = app / "install.sh"
    legacy.write_text("legacy attacker-controlled bytes\n")
    alternate = tmp_path / "alternate-install.sh"
    alternate.hardlink_to(legacy)
    old_inode = legacy.stat().st_ino

    _path_guard(tmp_path, "install-runtime-stub", "--app-dir", str(app))

    assert legacy.stat().st_ino != old_inode
    assert legacy.stat().st_nlink == 1
    assert stat.S_IMODE(legacy.stat().st_mode) == 0o755
    assert "runtime APP_DIR is not installer source" in legacy.read_text()
    assert alternate.read_text() == "legacy attacker-controlled bytes\n"


def test_units_are_staged_instead_of_overwriting_live_paths_early():
    script = INSTALL.read_text()
    assert 'CANDIDATE_SYSTEMD_DIR="$TRANSACTION_DIR/candidate-systemd"' in script
    assert '"$CANDIDATE_SYSTEMD_DIR/patina-scan-worker.service"' in script
    assert '"$CANDIDATE_SYSTEMD_DIR/patina-scan-worker-doctor.service"' in script
    assert 'install -m 0644 "$SRC_DIR/patina-scan-worker.service" "$UNIT"' not in script
    assert 'install -m 0644 "$SRC_DIR/patina-scan-worker.gpu.conf" "$DROPIN_DIR/gpu.conf"' not in script


def test_live_release_switch_is_an_atomic_symlink_replace():
    activation = VENV_LIB.read_text()
    assert '_atomic_symlink_replace "$STAGED_VENV" "$VENV"' in activation
    assert 'mv "$VENV" "$PREVIOUS_VENV"' not in activation
    assert 'mv "$NEXT_VENV_LINK" "$VENV"' not in activation
    assert 'mv "$STAGED_VENV"' not in activation


def test_transaction_snapshots_units_and_recovers_on_next_install():
    installer = INSTALL.read_text()
    activation = VENV_LIB.read_text()
    assert 'TRANSACTION_PARENT="$ETC_DIR"' in installer
    assert 'TRANSACTION_DIR="$TRANSACTION_PARENT/.scan-worker-install-transaction"' in installer
    assert '_path_guard ensure-trusted-dir --path "$ETC_DIR" --mode 0750' in installer
    assert 'install -d -m 0700 "$TRANSACTION_DIR"' in activation
    assert 'TRANSACTION_DIR="$APP_DIR/' not in installer
    assert "snapshot/unit.$index.present" in activation
    assert "snapshot/unit.$index.content" in activation
    assert "recover_install_transaction" in activation
    assert '"$TRANSACTION_DIR/state"' in activation
    assert "systemctl daemon-reload" in activation
    assert "os.fsync" in activation
    assert "os.replace" in activation


def test_legacy_commit_boundary_is_copy_smoke_quarantine_then_ready():
    activation = VENV_LIB.read_text()
    prepare = activation[
        activation.index("_prepare_legacy_materialization()") : activation.index(
            "_cleanup_legacy_quarantine()"
        )
    ]
    no_processes = prepare.index("_require_no_service_processes")
    copy = prepare.index("_path_guard materialize-legacy-release")
    smoke = prepare.index('_smoke_legacy_materialized_release "$materialized"', copy)
    post_smoke_process_check = prepare.index("_require_no_service_processes", smoke)
    quarantine = prepare.index("_path_guard quarantine-legacy-release")
    ready = prepare.rindex("_transaction_value_write legacy_materialized_ready 1")

    assert no_processes < copy < smoke < post_smoke_process_check < quarantine < ready
    assert '"$release/bin/python" -I "$release/bin/patina-scan-worker" --help' in activation
    activate = activation[activation.index("activate_install_transaction()") :]
    assert activate.index('systemctl stop "$WORKER_SERVICE"') < activate.index(
        "_prepare_legacy_materialization"
    )


def _write_fake_systemctl(tmp_path: Path) -> Path:
    fake_bin = tmp_path / "bin"
    fake_bin.mkdir(exist_ok=True)
    fake_systemctl = fake_bin / "systemctl"
    fake_systemctl.write_text(
        """#!/usr/bin/env bash
set -eu
echo "$*" >> "$SYSTEMCTL_LOG"
case "$1" in
  show)
    state="$(cat "$SYSTEMCTL_STATE_FILE")"
    if [ "$state" = not-found ]; then
      case "$*" in
        *LoadState*) printf 'not-found\n'; exit 0 ;;
        *) exit 4 ;;
      esac
    fi
    printf '%s\n' "$state"
    exit 0
    ;;
  stop)
    if [ "$FAIL_STOP" = 1 ]; then exit 1; fi
    printf 'inactive\n' > "$SYSTEMCTL_STATE_FILE"
    exit 0
    ;;
  daemon-reload)
    count="$(cat "$RELOAD_COUNT_FILE")"
    count=$((count + 1))
    printf '%s\n' "$count" > "$RELOAD_COUNT_FILE"
    if [ "$FAIL_RELOAD_ON_CALL" = "$count" ]; then exit 1; fi
    exit 0
    ;;
  start)
    if [ "$FAIL_NEW_UNIT" = 1 ] && grep -q new-worker-unit "$LIVE_WORKER_UNIT"; then
      exit 1
    fi
    if [ "$FAIL_ROLLBACK_START" = 1 ] && grep -q old-worker-unit "$LIVE_WORKER_UNIT"; then
      exit 1
    fi
    printf 'active\n' > "$SYSTEMCTL_STATE_FILE"
    exit 0
    ;;
esac
exit 2
"""
    )
    fake_systemctl.chmod(0o755)
    return fake_bin


def _setup_transaction_tree(
    tmp_path: Path, *, legacy_live: bool = False, relative_live: bool = False
):
    app = tmp_path / "app"
    transaction_parent = tmp_path / "etc"
    units = tmp_path / "systemd"
    candidates = tmp_path / "candidates"
    app.mkdir()
    transaction_parent.mkdir(mode=0o750)
    units.mkdir()
    candidates.mkdir()
    trusted_interpreter = tmp_path / "python3.11"
    trusted_interpreter.write_text("#!/bin/sh\nexit 0\n")
    trusted_interpreter.chmod(0o755)

    old_release = app / ".venv.release.old"
    old_release.mkdir()
    (old_release / "marker").write_text("old")
    live = app / ".venv"
    if legacy_live:
        live.mkdir()
        (live / "marker").write_text("old")
        legacy_bin = live / "bin"
        (live / "lib").mkdir()
        legacy_bin.mkdir()
        (legacy_bin / "python").symlink_to(trusted_interpreter)
        entrypoint = legacy_bin / "patina-scan-worker"
        entrypoint.write_text("#!/bin/sh\nexit 0\n")
        entrypoint.chmod(0o755)
    else:
        live.symlink_to(old_release.name if relative_live else old_release)
    older_release = app / ".venv.release.older"
    older_release.mkdir()
    (older_release / "marker").write_text("older")
    (app / ".venv.previous").symlink_to(
        older_release.name if relative_live else older_release
    )

    staged = app / ".venv.release.new"
    staged.mkdir()
    (staged / "marker").write_text("new")

    names = [
        "patina-scan-worker.service",
        "patina-scan-worker-doctor.service",
        "patina-scan-worker.service.d/gpu.conf",
        "patina-scan-worker-doctor.service.d/gpu.conf",
        "patina-scan-worker-nvidia-prepare.service",
    ]
    targets: list[Path] = []
    candidate_paths: list[Path] = []
    for index, name in enumerate(names):
        target = units / name
        candidate = candidates / name
        target.parent.mkdir(parents=True, exist_ok=True)
        candidate.parent.mkdir(parents=True, exist_ok=True)
        old_value = "old-worker-unit\n" if index == 0 else f"old-{index}\n"
        new_value = "new-worker-unit\n" if index == 0 else f"new-{index}\n"
        target.write_text(old_value)
        candidate.write_text(new_value)
        targets.append(target)
        candidate_paths.append(candidate)
    return app, units, candidates, staged, targets, candidate_paths


def _transaction_shell(
    targets: list[Path], candidates: list[Path], *, interrupt_point: str | None
) -> str:
    target_args = " ".join(f'"{path}"' for path in targets)
    candidate_args = " ".join(f'"{path}"' for path in candidates)
    interrupt_body = (
        f'if [ "$1" = {interrupt_point} ]; then return 97; fi'
        if interrupt_point
        else ":"
    )
    return rf"""
set -euo pipefail
source "$1"
APP_DIR="$2"
VENV="$2/.venv"
STAGED_VENV="$2/.venv.release.new"
PREVIOUS_VENV="$2/.venv.previous"
FAILED_VENV="$2/.venv.failed"
TRANSACTION_PARENT="$(dirname "$2")/etc"
TRANSACTION_DIR="$TRANSACTION_PARENT/.scan-worker-install-transaction"
WORKER_SERVICE=patina-scan-worker
SVC_USER=patina
PYTHON="$2/../python3.11"
BUILD_VENV=1
PATH_GUARD_SCRIPT="$3"
INSTALL_PATH_GUARD_SCRIPT="$PATH_GUARD_SCRIPT"
INSTALL_PATH_GUARD_PYTHON=python3
INSTALL_TRUST_ANCHOR="$(dirname "$APP_DIR")"
INSTALL_TRUSTED_UID="$(id -u)"
INSTALL_TRUSTED_GID="$(id -g)"
_run_privileged_python() {{ python3 -I -S "$@"; }}
_harden_managed_release() {{
  if [ "${{INTERRUPT_DURING_HARDEN:-0}}" = 1 ] && \
     [ ! -e "${{HARDEN_INTERRUPTED_FILE:?}}" ]; then
    chmod 0755 "$1"
    chmod 0600 "$1/marker"
    : > "$HARDEN_INTERRUPTED_FILE"
    exit 97
  fi
  _path_guard \
    harden-release --app-dir "$APP_DIR" --path "$1" >/dev/null
}}
_require_no_service_processes() {{ return 0; }}
_smoke_legacy_materialized_release() {{ return 0; }}
MANAGED_UNIT_TARGETS=({target_args})
CANDIDATE_UNIT_PATHS=({candidate_args})
_transaction_hook() {{
  {interrupt_body}
  return 0
}}
prepare_install_transaction
begin_install_transaction
if [ "${{INTERRUPT_AFTER_PREPARED:-0}}" = 1 ]; then exit 97; fi
activate_install_transaction
"""


def _recovery_shell(targets: list[Path]) -> str:
    target_args = " ".join(f'"{path}"' for path in targets)
    return rf"""
set -euo pipefail
source "$1"
APP_DIR="$2"
VENV="$2/.venv"
PREVIOUS_VENV="$2/.venv.previous"
FAILED_VENV="$2/.venv.failed"
TRANSACTION_PARENT="$(dirname "$2")/etc"
TRANSACTION_DIR="$TRANSACTION_PARENT/.scan-worker-install-transaction"
WORKER_SERVICE=patina-scan-worker
SVC_USER=patina
PYTHON="$2/../python3.11"
INSTALL_PATH_GUARD_SCRIPT="$3"
INSTALL_PATH_GUARD_PYTHON=python3
INSTALL_TRUST_ANCHOR="$(dirname "$APP_DIR")"
INSTALL_TRUSTED_UID="$(id -u)"
INSTALL_TRUSTED_GID="$(id -g)"
MANAGED_UNIT_TARGETS=({target_args})
_run_privileged_python() {{ python3 -I -S "$@"; }}
_harden_managed_release() {{
  _path_guard harden-release --app-dir "$APP_DIR" --path "$1" >/dev/null
}}
_require_no_service_processes() {{ return 0; }}
_smoke_legacy_materialized_release() {{ return 0; }}
recover_install_transaction
"""


def _run_transaction(
    tmp_path: Path,
    *,
    active: bool,
    fail_new_unit: bool = False,
    interrupt: bool = False,
    interrupt_after_previous: bool = False,
    interrupt_after_commit: bool = False,
    interrupt_after_unit: int | None = None,
    legacy_live: bool = False,
    initial_state: str | None = None,
    fail_reload_on_call: int = 0,
    fail_rollback_start: bool = False,
    fail_stop: bool = False,
    restrictive_legacy: bool = False,
    interrupt_after_prepared: bool = False,
    fresh_install: bool = False,
    relative_live: bool = False,
    crash_at: str | None = None,
    mutate_legacy_aliases_after_activation: bool = False,
    real_previous: bool = False,
    legacy_external_symlink: bool = False,
):
    app, units, candidates, staged, targets, candidate_paths = _setup_transaction_tree(
        tmp_path, legacy_live=legacy_live, relative_live=relative_live
    )
    if real_previous:
        (app / ".venv.previous").unlink()
        (app / ".venv.previous").mkdir()
        (app / ".venv.previous" / "marker").write_text("obsolete raw backup")
    if legacy_external_symlink:
        assert legacy_live
        outside = tmp_path / "outside-legacy-module"
        outside.write_text("unsafe = True\n")
        (app / ".venv" / "lib" / "escape.py").symlink_to(outside)
    if restrictive_legacy:
        assert legacy_live
        (app / ".venv" / "marker").chmod(0o600)
        (app / ".venv").chmod(0o700)
    held_legacy_writer: int | None = None
    if mutate_legacy_aliases_after_activation:
        assert legacy_live
        raw_marker = app / ".venv" / "marker"
        (tmp_path / "legacy-marker-hardlink").hardlink_to(raw_marker)
        held_legacy_writer = os.open(raw_marker, os.O_WRONLY)
    if fresh_install:
        (app / ".venv").unlink()
        (app / ".venv.previous").unlink()
        for target in targets:
            target.unlink()
    fake_bin = _write_fake_systemctl(tmp_path)
    log = tmp_path / "systemctl.log"
    state_file = tmp_path / "systemctl.state"
    state_file.write_text(f"{initial_state or ('active' if active else 'inactive')}\n")
    reload_count_file = tmp_path / "reload.count"
    reload_count_file.write_text("0\n")
    env = {
        **os.environ,
        "PATH": f"{fake_bin}:{os.environ['PATH']}",
        "SYSTEMCTL_LOG": str(log),
        "SYSTEMCTL_STATE_FILE": str(state_file),
        "RELOAD_COUNT_FILE": str(reload_count_file),
        "FAIL_NEW_UNIT": "1" if fail_new_unit else "0",
        "FAIL_RELOAD_ON_CALL": str(fail_reload_on_call),
        "FAIL_ROLLBACK_START": "1" if fail_rollback_start else "0",
        "FAIL_STOP": "1" if fail_stop else "0",
        "LIVE_WORKER_UNIT": str(targets[0]),
        "INTERRUPT_AFTER_PREPARED": "1" if interrupt_after_prepared else "0",
    }
    result = subprocess.run(
        [
            "bash",
            "-c",
            _transaction_shell(
                targets,
                candidate_paths,
                interrupt_point=(
                    crash_at
                    if crash_at is not None
                    else f"after_unit_{interrupt_after_unit}"
                    if interrupt_after_unit is not None
                    else "after_commit" if interrupt_after_commit
                    else "after_previous" if interrupt_after_previous
                    else "after_switch" if interrupt
                    else None
                ),
            ),
            "transaction-test",
            str(VENV_LIB),
            str(app),
            str(PATH_GUARD),
        ],
        text=True,
        capture_output=True,
        env=env,
        check=False,
    )
    if held_legacy_writer is not None:
        try:
            os.lseek(held_legacy_writer, 0, os.SEEK_SET)
            os.write(held_legacy_writer, b"BAD")
            (tmp_path / "legacy-marker-hardlink").write_text(
                "changed through outside hardlink\n"
            )
        finally:
            os.close(held_legacy_writer)
    return result, env, app, units, staged, targets, candidate_paths


def _run_recovery(
    env: dict[str, str], app: Path, targets: list[Path]
) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [
            "bash",
            "-c",
            _recovery_shell(targets),
            "recovery-test",
            str(VENV_LIB),
            str(app),
            str(PATH_GUARD),
        ],
        text=True,
        capture_output=True,
        env=env,
        check=False,
    )


def test_inactive_transaction_switches_units_and_release_without_start(tmp_path):
    result, _env, app, _units, _staged, targets, candidates = _run_transaction(
        tmp_path, active=False
    )
    assert result.returncode == 0, result.stderr
    assert (app / ".venv").is_symlink()
    assert (app / ".venv" / "marker").read_text() == "new"
    assert (app / ".venv.previous" / "marker").read_text() == "old"
    assert not (app / ".venv.release.older").exists()
    assert [path.read_text() for path in targets] == [
        path.read_text() for path in candidates
    ]
    assert not (app.parent / "etc" / ".scan-worker-install-transaction").exists()
    log = (tmp_path / "systemctl.log").read_text().splitlines()
    assert log == [
        "show --property=ActiveState --value patina-scan-worker",
        "daemon-reload",
    ]


@pytest.mark.parametrize("state", ["activating", "deactivating", "reloading"])
def test_transitional_active_state_fails_closed_before_live_mutation(tmp_path, state):
    result, _env, app, _units, _staged, targets, _candidates = _run_transaction(
        tmp_path, active=False, initial_state=state
    )

    assert result.returncode != 0
    assert f"is {state}" in result.stderr
    assert (app / ".venv" / "marker").read_text() == "old"
    assert [path.read_text() for path in targets] == [
        "old-worker-unit\n",
        "old-1\n",
        "old-2\n",
        "old-3\n",
        "old-4\n",
    ]
    transaction = app.parent / "etc" / ".scan-worker-install-transaction"
    assert (transaction / "state").read_text().strip() == "building"
    assert (tmp_path / "systemctl.log").read_text().splitlines() == [
        "show --property=ActiveState --value patina-scan-worker"
    ]


def test_partial_unit_activation_failure_restores_all_prior_files(tmp_path):
    result, _env, app, _units, staged, targets, _candidates = _run_transaction(
        tmp_path, active=True, interrupt_after_unit=1
    )

    assert result.returncode == 1
    assert (app / ".venv" / "marker").read_text() == "old"
    assert [path.read_text() for path in targets] == [
        "old-worker-unit\n",
        "old-1\n",
        "old-2\n",
        "old-3\n",
        "old-4\n",
    ]
    assert not staged.exists()
    assert not (app.parent / "etc" / ".scan-worker-install-transaction").exists()


def test_candidate_daemon_reload_failure_restores_all_prior_files(tmp_path):
    result, _env, app, _units, staged, targets, _candidates = _run_transaction(
        tmp_path, active=True, fail_reload_on_call=1
    )

    assert result.returncode == 1
    assert (app / ".venv" / "marker").read_text() == "old"
    assert all(path.read_text().startswith("old-") for path in targets[1:])
    assert targets[0].read_text() == "old-worker-unit\n"
    assert not staged.exists()
    assert (tmp_path / "reload.count").read_text().strip() == "2"
    assert not (app.parent / "etc" / ".scan-worker-install-transaction").exists()


def test_rollback_restart_failure_retains_transaction_evidence(tmp_path):
    result, _env, app, _units, staged, targets, _candidates = _run_transaction(
        tmp_path,
        active=True,
        fail_new_unit=True,
        fail_rollback_start=True,
    )

    assert result.returncode == 1
    assert "prior service did not restart" in result.stderr
    assert (app / ".venv" / "marker").read_text() == "old"
    assert targets[0].read_text() == "old-worker-unit\n"
    assert staged.exists(), "cleanup waits until rollback fully succeeds"
    assert (app.parent / "etc" / ".scan-worker-install-transaction").is_dir()


def test_candidate_unit_start_failure_restores_release_and_every_unit(tmp_path):
    result, _env, app, _units, staged, targets, _candidates = _run_transaction(
        tmp_path, active=True, fail_new_unit=True
    )
    assert result.returncode == 1
    assert (app / ".venv" / "marker").read_text() == "old"
    assert (app / ".venv.previous" / "marker").read_text() == "older"
    assert [path.read_text() for path in targets] == [
        "old-worker-unit\n",
        "old-1\n",
        "old-2\n",
        "old-3\n",
        "old-4\n",
    ]
    assert not staged.exists(), "failed immutable release should be cleaned"
    assert not (app.parent / "etc" / ".scan-worker-install-transaction").exists()
    log = (tmp_path / "systemctl.log").read_text().splitlines()
    assert log == [
        "show --property=ActiveState --value patina-scan-worker",
        "stop patina-scan-worker",
        "show --property=ActiveState --value patina-scan-worker",
        "daemon-reload",
        "start patina-scan-worker",
        "show --property=ActiveState --value patina-scan-worker",
        "daemon-reload",
        "start patina-scan-worker",
    ]


def test_relative_release_links_are_canonicalized_for_upgrade_rollback(tmp_path):
    result, _env, app, _units, staged, targets, _candidates = _run_transaction(
        tmp_path,
        active=True,
        fail_new_unit=True,
        relative_live=True,
    )

    assert result.returncode == 1
    assert (app / ".venv").is_symlink()
    assert (app / ".venv" / "marker").read_text() == "old"
    assert (app / ".venv.previous" / "marker").read_text() == "older"
    assert targets[0].read_text() == "old-worker-unit\n"
    assert not staged.exists()


def test_interrupted_switch_is_recovered_by_a_fresh_installer_process(tmp_path):
    result, env, app, _units, staged, targets, _candidates = _run_transaction(
        tmp_path, active=True, interrupt=True
    )
    assert result.returncode == 97
    assert (app / ".venv" / "marker").read_text() == "new"
    assert targets[0].read_text() == "new-worker-unit\n"
    transaction = app.parent / "etc" / ".scan-worker-install-transaction"
    assert transaction.is_dir()
    assert stat.S_IMODE(transaction.stat().st_mode) == 0o700
    assert stat.S_IMODE(transaction.parent.stat().st_mode) == 0o750

    recovered = subprocess.run(
        [
            "bash",
            "-c",
            _recovery_shell(targets),
            "recovery-test",
            str(VENV_LIB),
            str(app),
            str(PATH_GUARD),
        ],
        text=True,
        capture_output=True,
        env={**env, "FAIL_NEW_UNIT": "0"},
        check=False,
    )
    assert recovered.returncode == 0, recovered.stderr
    assert (app / ".venv" / "marker").read_text() == "old"
    assert (app / ".venv.previous" / "marker").read_text() == "older"
    assert [path.read_text() for path in targets] == [
        "old-worker-unit\n",
        "old-1\n",
        "old-2\n",
        "old-3\n",
        "old-4\n",
    ]
    assert not staged.exists()
    assert not (app.parent / "etc" / ".scan-worker-install-transaction").exists()


def test_recovery_rejects_snapshot_target_outside_exact_allowlist(tmp_path):
    result, env, app, _units, _staged, targets, _candidates = _run_transaction(
        tmp_path, active=True, interrupt=True
    )
    assert result.returncode == 97
    transaction = app.parent / "etc" / ".scan-worker-install-transaction"
    outside = tmp_path / "outside-unit"
    outside.write_text("must remain untouched\n")
    target_marker = transaction / "snapshot" / "unit.0.target"
    target_marker.write_text(f"{outside}\n")
    target_marker.chmod(0o600)

    recovered = _run_recovery({**env, "FAIL_NEW_UNIT": "0"}, app, targets)

    assert recovered.returncode != 0
    assert "outside MANAGED_UNIT_TARGETS" in recovered.stderr
    assert outside.read_text() == "must remain untouched\n"
    assert transaction.is_dir(), "failed secure recovery must retain evidence"


def test_recovery_rejects_symlinked_state_marker(tmp_path):
    result, env, app, _units, _staged, targets, _candidates = _run_transaction(
        tmp_path, active=True, interrupt=True
    )
    assert result.returncode == 97
    transaction = app.parent / "etc" / ".scan-worker-install-transaction"
    outside = tmp_path / "outside-state"
    outside.write_text("switched\n")
    state = transaction / "state"
    state.unlink()
    state.symlink_to(outside)

    recovered = _run_recovery({**env, "FAIL_NEW_UNIT": "0"}, app, targets)

    assert recovered.returncode != 0
    assert "symlink" in recovered.stderr.lower()
    assert transaction.is_dir()


def test_interruption_after_previous_link_change_restores_older_previous(tmp_path):
    result, env, app, _units, _staged, targets, _candidates = _run_transaction(
        tmp_path, active=True, interrupt_after_previous=True
    )
    assert result.returncode == 97
    assert (app / ".venv.previous" / "marker").read_text() == "old"

    recovered = subprocess.run(
        [
            "bash",
            "-c",
            _recovery_shell(targets),
            "recovery-test",
            str(VENV_LIB),
            str(app),
            str(PATH_GUARD),
        ],
        text=True,
        capture_output=True,
        env={**env, "FAIL_NEW_UNIT": "0"},
        check=False,
    )
    assert recovered.returncode == 0, recovered.stderr
    assert (app / ".venv" / "marker").read_text() == "old"
    assert (app / ".venv.previous" / "marker").read_text() == "older"
    assert (app / ".venv.release.older").is_dir()


def test_legacy_real_venv_is_converted_once_and_retained_as_previous(tmp_path):
    result, _env, app, _units, _staged, _targets, _candidates = _run_transaction(
        tmp_path,
        active=False,
        legacy_live=True,
        mutate_legacy_aliases_after_activation=True,
    )
    assert result.returncode == 0, result.stderr
    assert (app / ".venv").is_symlink()
    assert (app / ".venv" / "marker").read_text() == "new"
    assert (app / ".venv.previous").is_symlink()
    assert (app / ".venv.previous" / "marker").read_text() == "old"
    assert (app / ".venv.previous" / "marker").stat().st_nlink == 1
    assert (tmp_path / "legacy-marker-hardlink").read_text() == (
        "changed through outside hardlink\n"
    )
    assert not list(app.glob(".venv.quarantine.*"))


def test_real_previous_directory_fails_closed_with_actionable_archive_step(tmp_path):
    result, _env, app, _units, staged, targets, _candidates = _run_transaction(
        tmp_path,
        active=True,
        legacy_live=True,
        real_previous=True,
    )

    assert result.returncode != 0
    assert "move/archive that backup outside" in result.stderr
    assert "nothing was deleted" in result.stderr
    assert (app / ".venv").is_dir() and not (app / ".venv").is_symlink()
    assert (app / ".venv.previous" / "marker").read_text() == "obsolete raw backup"
    assert staged.exists()
    assert targets[0].read_text() == "old-worker-unit\n"


def test_legacy_policy_failure_keeps_raw_prestate_stopped_and_unquarantined(tmp_path):
    result, _env, app, _units, staged, targets, _candidates = _run_transaction(
        tmp_path,
        active=True,
        legacy_live=True,
        legacy_external_symlink=True,
    )

    assert result.returncode != 0
    assert "raw release was not restarted" in result.stderr
    transaction = app.parent / "etc" / ".scan-worker-install-transaction"
    materialized = Path(
        (transaction / "legacy_materialized_release").read_text().strip()
    )
    assert (transaction / "state").read_text().strip() == "prepared"
    assert (app / ".venv").is_dir() and not (app / ".venv").is_symlink()
    assert not materialized.exists()
    assert not list(app.glob(".venv.quarantine.*"))
    assert (tmp_path / "systemctl.state").read_text().strip() == "inactive"
    assert targets[0].read_text() == "old-worker-unit\n"
    assert staged.exists(), "failed transaction evidence is intentionally retained"


def test_restrictive_legacy_rollback_uses_fresh_alias_isolated_release(tmp_path):
    result, _env, app, _units, staged, targets, _candidates = _run_transaction(
        tmp_path,
        active=True,
        fail_new_unit=True,
        legacy_live=True,
        restrictive_legacy=True,
        mutate_legacy_aliases_after_activation=True,
    )

    assert result.returncode == 1
    assert (app / ".venv").is_symlink()
    assert (app / ".venv" / "marker").read_text() == "old"
    assert stat.S_IMODE((app / ".venv").stat().st_mode) == 0o755
    assert stat.S_IMODE((app / ".venv" / "marker").stat().st_mode) == 0o644
    assert (app / ".venv" / "marker").stat().st_nlink == 1
    assert (tmp_path / "legacy-marker-hardlink").read_text() == (
        "changed through outside hardlink\n"
    )
    assert targets[0].read_text() == "old-worker-unit\n"
    assert not staged.exists()
    assert not list(app.glob(".venv.quarantine.*"))


def test_crash_before_legacy_quarantine_discards_and_recopies_fresh_release(tmp_path):
    """The stale half-materialized release must be DISCARDED, not adopted.

    HOW THAT IS PROVED, and why it is no longer proved by an inode number.  This
    test used to assert ``marker.st_ino != first_inode`` as a proxy for "a
    different file".  A qualified-host probe showed the installer is correct --
    tainting the stale release and dropping a sentinel found the taint erased,
    the sentinel absent, and ``statx`` btime about a second later, i.e. a
    genuinely different file -- and that the assertion still FAILED, as
    ``assert 7903675 != 7903675``.  The release directory is content-addressed,
    so the allocation sequence repeats exactly, and **the filesystem hands the
    just-freed inode number straight back**.

    WHAT WAS MEASURED, and nothing beyond it.  Running the pre-fix revision of
    this file in this repository's own gate container fails the same way, as
    ``assert 6945173 != 6945173``; probing that container directly, an
    unlink-and-recreate of the same allocation sequence recycled the inode
    number 20/20 times.  The fixed revision passes there and on macOS/APFS.

    An earlier revision of this docstring named ext4 as the mechanism and said
    the test "was green in CI only because overlayfs and tmpfs allocate inode
    numbers differently".  BOTH HALVES ARE WITHDRAWN, because the gate container
    where the failure reproduces has no separate ``/tmp`` mount and reports
    ``overlayfs`` -- Docker's overlay upper layer passes the backing
    filesystem's inode numbers straight through, so overlayfs is not the
    discriminator it was claimed to be.  What discriminates a host that recycles
    from one that does not has NOT been isolated here and is therefore not
    stated.  What holds without it: recycling is real, it is reproducible on
    both hosts this repository is tested on, and an inode number is consequently
    not an identity.

    That is the same property that forced an earlier increment to pin directory
    identity with an ``O_PATH`` descriptor instead of a name-plus-stat re-check
    (``NATIVE_WORKSPACE_ENTRY_PIN_IS_UNIVERSAL`` in ``refine_native_process``):
    ``st_ino`` is a REUSED handle, not an identity, and nothing may treat it as
    one.

    What replaces it is the evidence the probe actually collected: a taint
    written into the stale release's payload and a sentinel file that only the
    stale copy has.  If recovery adopted the stale release, the taint survives
    and the sentinel is present.  Both must be gone.
    """

    result, env, app, _units, staged, targets, _candidates = _run_transaction(
        tmp_path,
        active=True,
        legacy_live=True,
        restrictive_legacy=True,
        crash_at="before_legacy_quarantine",
    )
    assert result.returncode == 97
    transaction = app.parent / "etc" / ".scan-worker-install-transaction"
    materialized = Path(
        (transaction / "legacy_materialized_release").read_text().strip()
    )
    # Taint the stale release in two independent ways: rewrite the payload the
    # final assertion reads, and add a file the true source does not have.
    assert (materialized / "marker").read_text() == "old"
    (materialized / "marker").write_text("stale-materialized-release")
    (materialized / "discarded-release-sentinel").write_text("stale\n")
    assert (app / ".venv").is_dir() and not (app / ".venv").is_symlink()
    assert not list(app.glob(".venv.quarantine.*"))
    assert not (transaction / "legacy_materialized_ready").exists()
    assert targets[0].read_text() == "old-worker-unit\n"

    recovered = _run_recovery({**env, "FAIL_NEW_UNIT": "0"}, app, targets)

    assert recovered.returncode == 0, recovered.stderr
    assert (app / ".venv").is_symlink()
    # The taint is erased and the sentinel never arrives, so what is live is a
    # fresh copy of the true source rather than the stale materialization --
    # regardless of what inode number the filesystem chose to reuse for it.
    assert (app / ".venv" / "marker").read_text() == "old"
    assert not (app / ".venv" / "discarded-release-sentinel").exists()
    assert not list(app.glob(".venv.quarantine.*"))
    assert not staged.exists()


def test_crash_after_quarantine_before_ready_recovers_only_fresh_release(tmp_path):
    result, env, app, _units, staged, targets, _candidates = _run_transaction(
        tmp_path,
        active=True,
        legacy_live=True,
        restrictive_legacy=True,
        crash_at="after_legacy_quarantine",
    )
    assert result.returncode == 97
    transaction = app.parent / "etc" / ".scan-worker-install-transaction"
    materialized = Path(
        (transaction / "legacy_materialized_release").read_text().strip()
    )
    quarantine = Path((transaction / "legacy_quarantine").read_text().strip())
    assert materialized.is_dir()
    assert quarantine.is_dir()
    assert stat.S_IMODE(quarantine.stat().st_mode) == 0o700
    assert stat.S_IMODE((materialized / "marker").stat().st_mode) == 0o644
    assert not (app / ".venv").exists()
    assert not (transaction / "legacy_materialized_ready").exists()
    assert targets[0].read_text() == "old-worker-unit\n"
    quarantine.chmod(0o777)  # inferred-rename recovery must seal before ready

    recovered = _run_recovery({**env, "FAIL_NEW_UNIT": "0"}, app, targets)

    assert recovered.returncode == 0, recovered.stderr
    assert (app / ".venv").is_symlink()
    assert (app / ".venv" / "marker").read_text() == "old"
    assert stat.S_IMODE((app / ".venv" / "marker").stat().st_mode) == 0o644
    assert not quarantine.exists()
    assert not staged.exists()
    assert not transaction.exists()


def test_prepared_legacy_crash_materializes_before_restoring_active_posture(tmp_path):
    result, env, app, _units, staged, targets, _candidates = _run_transaction(
        tmp_path,
        active=True,
        legacy_live=True,
        interrupt_after_prepared=True,
    )
    assert result.returncode == 97
    transaction = app.parent / "etc" / ".scan-worker-install-transaction"
    assert (transaction / "state").read_text().strip() == "prepared"
    assert (app / ".venv").is_dir() and not (app / ".venv").is_symlink()
    assert not (transaction / "legacy_quarantine").exists()

    recovered = _run_recovery(env, app, targets)

    assert recovered.returncode == 0, recovered.stderr
    assert (app / ".venv").is_symlink()
    assert (app / ".venv" / "marker").read_text() == "old"
    assert not staged.exists()
    assert not transaction.exists()
    assert (tmp_path / "systemctl.state").read_text().strip() == "active"


def test_partial_unready_materialization_is_discarded_and_retried(tmp_path):
    result, env, app, _units, staged, targets, _candidates = _run_transaction(
        tmp_path,
        active=True,
        legacy_live=True,
        interrupt_after_prepared=True,
    )
    assert result.returncode == 97
    transaction = app.parent / "etc" / ".scan-worker-install-transaction"
    materialized = app / ".venv.release.partial"
    quarantine = app / ".venv.quarantine.partial"
    materialized.mkdir()
    partial_marker = materialized / "marker"
    partial_marker.write_text("partial")
    (tmp_path / "partial-marker-alias").hardlink_to(partial_marker)
    partial_inode = partial_marker.stat().st_ino
    markers = {
        "legacy_materialized_release": materialized,
        "legacy_quarantine": quarantine,
        "legacy_interpreter": tmp_path / "python3.11",
    }
    for name, value in markers.items():
        marker = transaction / name
        marker.write_text(f"{value}\n")
        marker.chmod(0o600)

    recovered = _run_recovery(env, app, targets)

    assert recovered.returncode == 0, recovered.stderr
    assert (app / ".venv").is_symlink()
    assert (app / ".venv" / "marker").read_text() == "old"
    assert (app / ".venv" / "marker").stat().st_ino != partial_inode
    assert not quarantine.exists()
    assert not staged.exists()
    assert not transaction.exists()


@pytest.mark.parametrize(
    ("crash_at", "expect_new_units", "expect_candidate_link"),
    [
        ("after_legacy_ready", False, False),
        ("after_candidate_units", True, False),
        ("after_release_link", True, True),
    ],
)
def test_legacy_pre_switch_crash_states_recover_fresh_rollback(
    tmp_path, crash_at, expect_new_units, expect_candidate_link
):
    result, env, app, _units, staged, targets, candidates = _run_transaction(
        tmp_path,
        active=True,
        legacy_live=True,
        crash_at=crash_at,
    )
    assert result.returncode == 97
    transaction = app.parent / "etc" / ".scan-worker-install-transaction"
    assert (transaction / "state").read_text().strip() == "prepared"
    assert (transaction / "legacy_materialized_ready").read_text().strip() == "1"
    assert [path.read_text() for path in targets] == (
        [path.read_text() for path in candidates]
        if expect_new_units
        else ["old-worker-unit\n", "old-1\n", "old-2\n", "old-3\n", "old-4\n"]
    )
    if expect_candidate_link:
        assert (app / ".venv").is_symlink()
        assert (app / ".venv" / "marker").read_text() == "new"
    else:
        assert not (app / ".venv").exists()

    recovered = _run_recovery(env, app, targets)

    assert recovered.returncode == 0, recovered.stderr
    assert (app / ".venv").is_symlink()
    assert (app / ".venv" / "marker").read_text() == "old"
    assert not list(app.glob(".venv.quarantine.*"))
    assert not staged.exists()
    assert not transaction.exists()


def test_legacy_committed_recovery_keeps_new_and_cleans_raw_quarantine(tmp_path):
    result, env, app, _units, _staged, targets, _candidates = _run_transaction(
        tmp_path,
        active=True,
        legacy_live=True,
        crash_at="after_commit",
    )
    assert result.returncode == 97
    transaction = app.parent / "etc" / ".scan-worker-install-transaction"
    quarantine = Path((transaction / "legacy_quarantine").read_text().strip())
    assert (transaction / "state").read_text().strip() == "committed"
    assert quarantine.is_dir()
    assert (app / ".venv" / "marker").read_text() == "new"
    assert (app / ".venv.previous" / "marker").read_text() == "old"

    recovered = _run_recovery(env, app, targets)

    assert recovered.returncode == 0, recovered.stderr
    assert (app / ".venv" / "marker").read_text() == "new"
    assert (app / ".venv.previous" / "marker").read_text() == "old"
    assert not quarantine.exists()
    assert not transaction.exists()


@pytest.mark.parametrize("fail_new_unit", [False, True])
def test_interrupted_quarantine_cleanup_is_idempotently_recovered(
    tmp_path, fail_new_unit
):
    result, env, app, _units, staged, targets, _candidates = _run_transaction(
        tmp_path,
        active=True,
        fail_new_unit=fail_new_unit,
        legacy_live=True,
        crash_at="after_legacy_quarantine_cleanup",
    )
    transaction = app.parent / "etc" / ".scan-worker-install-transaction"
    expected_state = "rolled_back" if fail_new_unit else "committed"
    assert result.returncode in (1, 97)
    assert (transaction / "state").read_text().strip() == expected_state
    assert not list(app.glob(".venv.quarantine.*"))

    recovered = _run_recovery({**env, "FAIL_NEW_UNIT": "0"}, app, targets)

    assert recovered.returncode == 0, recovered.stderr
    assert (app / ".venv").is_symlink()
    assert (app / ".venv" / "marker").read_text() == (
        "old" if fail_new_unit else "new"
    )
    assert not transaction.exists()
    if fail_new_unit:
        assert not staged.exists()


def test_prepared_fresh_install_recovers_when_unit_is_not_found(tmp_path):
    result, env, app, _units, staged, targets, _candidates = _run_transaction(
        tmp_path,
        active=False,
        initial_state="not-found",
        interrupt_after_prepared=True,
        fresh_install=True,
    )
    assert result.returncode == 97
    transaction = app.parent / "etc" / ".scan-worker-install-transaction"
    assert (transaction / "state").read_text().strip() == "prepared"
    assert not any(target.exists() for target in targets)

    recovered = _run_recovery(env, app, targets)

    assert recovered.returncode == 0, recovered.stderr
    assert not (app / ".venv").exists()
    assert not any(target.exists() for target in targets)
    assert not staged.exists()
    assert not transaction.exists()
    log = (tmp_path / "systemctl.log").read_text().splitlines()
    assert "stop patina-scan-worker" not in log
    assert log.count(
        "show --property=LoadState --value patina-scan-worker"
    ) == 2


def test_interruption_after_durable_commit_keeps_new_release_on_recovery(tmp_path):
    result, env, app, _units, _staged, targets, _candidates = _run_transaction(
        tmp_path, active=True, interrupt_after_commit=True
    )
    assert result.returncode == 97
    transaction = app.parent / "etc" / ".scan-worker-install-transaction"
    assert (transaction / "state").read_text().strip() == "committed"
    assert (app / ".venv" / "marker").read_text() == "new"
    assert (app / ".venv.previous" / "marker").read_text() == "old"
    assert (app / ".venv.release.older").exists()

    log_before = (tmp_path / "systemctl.log").read_text()
    recovered = _run_recovery({**env, "FAIL_NEW_UNIT": "0"}, app, targets)

    assert recovered.returncode == 0, recovered.stderr
    assert (app / ".venv" / "marker").read_text() == "new"
    assert (app / ".venv.previous" / "marker").read_text() == "old"
    assert not (app / ".venv.release.older").exists()
    assert not transaction.exists()
    assert (tmp_path / "systemctl.log").read_text() == log_before


def test_recovery_cleans_an_interrupted_build_stage_without_touching_live(tmp_path):
    trusted_source = tmp_path / "trusted-source"
    trusted_source.mkdir()
    trusted_marker = trusted_source / "pyproject.toml"
    trusted_marker.write_text("reviewed-source\n")
    app = tmp_path / "app"
    app.mkdir()
    old = app / ".venv.release.old"
    old.mkdir()
    (app / ".venv").symlink_to(old)
    staged = app / ".venv.release.abandoned"
    staged.mkdir()
    transaction_parent = tmp_path / "etc"
    transaction_parent.mkdir(mode=0o750)
    txn = transaction_parent / ".scan-worker-install-transaction"
    txn.mkdir()
    (txn / "state").write_text("building\n")
    (txn / "staged_release").write_text(f"{staged}\n")
    source_build = txn / "source-build" / "build"
    source_build.mkdir(parents=True)
    (source_build / "backend-output").write_text("interrupted\n")
    (txn / "source-build" / "pyproject.toml").write_text("partial-copy\n")
    result = subprocess.run(
        [
            "bash",
            "-c",
            _recovery_shell([]),
            "recovery-test",
            str(VENV_LIB),
            str(app),
            str(PATH_GUARD),
        ],
        text=True,
        capture_output=True,
        check=False,
    )
    assert result.returncode == 0, result.stderr
    assert os.readlink(app / ".venv") == str(old)
    assert not staged.exists()
    assert trusted_marker.read_text() == "reviewed-source\n"
    assert not source_build.exists()
    assert not txn.exists()


def test_prepare_refuses_a_dangling_transaction_symlink(tmp_path):
    app = tmp_path / "app"
    app.mkdir()
    transaction_parent = tmp_path / "etc"
    transaction_parent.mkdir(mode=0o750)
    txn = transaction_parent / ".scan-worker-install-transaction"
    txn.symlink_to(app / "missing-transaction-target")
    shell = r"""
set -euo pipefail
source "$1"
APP_DIR="$2"
VENV="$2/.venv"
STAGED_VENV="$2/.venv.release.new"
PREVIOUS_VENV="$2/.venv.previous"
TRANSACTION_PARENT="$(dirname "$2")/etc"
TRANSACTION_DIR="$TRANSACTION_PARENT/.scan-worker-install-transaction"
prepare_install_transaction
"""
    result = subprocess.run(
        ["bash", "-c", shell, "symlink-test", str(VENV_LIB), str(app)],
        text=True,
        capture_output=True,
        check=False,
    )
    assert result.returncode != 0
    assert txn.is_symlink()
    assert "already exists" in result.stderr


def test_gpu_candidates_include_prepare_and_both_context_dropins():
    script = INSTALL.read_text()
    assert 'patina-scan-worker-nvidia-prepare.service' in script
    assert 'patina-scan-worker.service.d/gpu.conf' in script
    assert 'patina-scan-worker-doctor.service.d/gpu.conf' in script


def test_gpu_dropin_selects_the_qualified_cuda_toolkit_for_both_contexts():
    dropin = (INSTALL.parent / "patina-scan-worker.gpu.conf").read_text()
    assert "Environment=CUDA_HOME=/usr/local/cuda-11.8" in dropin
    assert (
        "Environment=PATH=/opt/patina/scan-pipeline/.venv/bin:"
        "/usr/local/cuda-11.8/bin:" in dropin
    )
    assert "TORCH_CUDA_ARCH_LIST" not in dropin
    for doctor_only_name in (
        "CC",
        "CXX",
        "CUDAHOSTCXX",
        "LD_LIBRARY_PATH",
        "MAX_JOBS",
    ):
        assert f"Environment={doctor_only_name}=" not in dropin


def test_emitted_gpu_acceptance_uses_ephemeral_doctor_only_env_override():
    script = INSTALL.read_text()
    acceptance = script[script.index("Next (item-3 GPU acceptance") :]
    stop = acceptance.index("sudo systemctl stop $WORKER_SERVICE")
    copy = acceptance.index('sudo install -o root -g root -m 0600 "$ENV_FILE"')
    append = acceptance.index("STAGES=refine,fuse,splat")
    dropin = acceptance.index("EnvironmentFile=\\nEnvironmentFile=%s")
    reload = acceptance.index("sudo systemctl daemon-reload", dropin)
    doctor = acceptance.index("run_item3_doctor cold")

    assert stop < copy < append < dropin < reload < doctor
    assert "TORCH_CUDA_ARCH_LIST=7.5" in acceptance
    assert "restore_item3_gpu()" in acceptance
    assert 'if [ "\\$WORKER_WAS_ACTIVE" = active ]' in acceptance
    assert "sudo systemctl start $WORKER_SERVICE" in acceptance
    assert 'sudo rm -f -- "\\$ITEM3_DROPIN" "\\$ITEM3_ENV"' in acceptance
    assert acceptance.count("sudo systemctl start patina-scan-worker-doctor") == 1
    assert acceptance.count("run_item3_doctor cold") == 1
    assert acceptance.count("run_item3_doctor warm") == 1
    assert "/run/systemd/system/patina-scan-worker-doctor.service.d" in acceptance
    assert "sudoedit" not in acceptance
    assert ".item3-backup" not in acceptance
    assert "systemctl enable patina-scan-worker-doctor" not in acceptance


def test_emitted_gpu_acceptance_pins_deskdev_jit_toolchain_only_in_temp_env():
    script = INSTALL.read_text()
    acceptance = script[script.index("Next (item-3 GPU acceptance") :]
    required = {
        "CC": "/usr/bin/gcc-11",
        "CXX": "/usr/bin/g++-11",
        "CUDAHOSTCXX": "/usr/bin/g++-11",
        "LD_LIBRARY_PATH": "/usr/local/cuda-11.8/lib64",
        "TORCH_CUDA_ARCH_LIST": "7.5",
        "MAX_JOBS": "4",
    }

    for name, value in required.items():
        assert f"{name}={value}" in acceptance

    persistent_write = 'sudo tee -a "$ENV_FILE"'
    assert persistent_write not in acceptance
    assert acceptance.index("CC=/usr/bin/gcc-11") > acceptance.index(
        'sudo install -o root -g root -m 0600 "$ENV_FILE"'
    )


def test_emitted_gpu_acceptance_prints_only_each_current_doctor_run():
    script = INSTALL.read_text()
    acceptance = script[script.index("Next (item-3 GPU acceptance") :]
    function = acceptance[
        acceptance.index("run_item3_doctor()") : acceptance.index(
            "run_item3_doctor cold"
        )
    ]

    sync = function.index("sudo journalctl --sync")
    cursor = function.index("--show-cursor")
    start = function.index("sudo systemctl start patina-scan-worker-doctor")
    status = function.index("ITEM3_DOCTOR_STATUS=", start)
    journal = function.index('--after-cursor="\\$ITEM3_CURSOR"')
    returned = function.index('return "\\$ITEM3_DOCTOR_STATUS"')

    assert sync < cursor < start < status < journal < returned
    assert "ITEM3_DOCTOR_STATUS=\\$?" in function
    assert 'if [ -z "\\$ITEM3_CURSOR" ]' in function
    assert acceptance.count("run_item3_doctor cold") == 1
    assert acceptance.count("run_item3_doctor warm") == 1
    assert "journalctl -u patina-scan-worker-doctor -n 100" not in acceptance


def test_readme_gpu_acceptance_matches_jit_and_journal_isolation_contract():
    readme = README.read_text()
    acceptance = readme[
        readme.index("#### Item-3-only GPU acceptance") : readme.index(
            "Optional pre-install resolver evidence"
        )
    ]
    required = {
        "CC": "/usr/bin/gcc-11",
        "CXX": "/usr/bin/g++-11",
        "CUDAHOSTCXX": "/usr/bin/g++-11",
        "LD_LIBRARY_PATH": "/usr/local/cuda-11.8/lib64",
        "TORCH_CUDA_ARCH_LIST": "7.5",
        "MAX_JOBS": "4",
    }

    for name, value in required.items():
        assert f"{name}={value}" in acceptance

    assert "run_item3_doctor cold" in acceptance
    assert "run_item3_doctor warm" in acceptance
    assert 'journalctl --sync' in acceptance
    assert '--after-cursor="$item3_cursor"' in acceptance
    assert "journalctl -u patina-scan-worker-doctor -n 100" not in acceptance
    assert 'sudo tee -a "$env_file"' not in acceptance
    assert '/usr/bin/find -P "$item3_dropin_dir"' in acceptance
    assert "-name '*.conf'" in acceptance
    assert "refusing pre-existing doctor /run drop-in" in acceptance
    trap = acceptance.index("trap restore_item3_gpu EXIT INT TERM")
    worker_stop = acceptance.index("sudo systemctl stop patina-scan-worker", trap)
    doctor_stop = acceptance.index(
        "sudo systemctl stop patina-scan-worker-doctor", worker_stop
    )
    doctor_state = acceptance.index(
        "systemctl show --property=ActiveState --value \\",
        doctor_stop,
    )
    install_override = acceptance.index(
        'sudo install -o root -g root -m 0600 "$env_file"', doctor_state
    )
    assert worker_stop < doctor_stop < doctor_state < install_override


def test_emitted_gpu_acceptance_rejects_every_preexisting_runtime_dropin_before_stop():
    script = INSTALL.read_text()
    acceptance = script[script.index("Next (item-3 GPU acceptance") :]
    validator = acceptance.index("assert_no_item3_runtime_dropins()")
    validator_end = acceptance.index("\n  }", validator)
    preflight = acceptance.index("assert_no_item3_runtime_dropins", validator_end)
    worker_stop = acceptance.index("sudo systemctl stop $WORKER_SERVICE")

    assert '/usr/bin/find -P "\\$ITEM3_DROPIN_DIR"' in acceptance
    assert "-name '*.conf'" in acceptance
    assert "refusing pre-existing doctor /run drop-in" in acceptance
    assert acceptance.count("assert_no_item3_runtime_dropins") == 3
    assert 'rm -f -- "\\$ITEM3_DROPIN_DIR"/*.conf' not in acceptance
    assert validator < validator_end < preflight < worker_stop
    assert preflight < acceptance.index(
        'sudo install -o root -g root -m 0600 "$ENV_FILE"'
    )


def test_emitted_gpu_acceptance_stops_and_proves_doctor_quiescent_before_override():
    script = INSTALL.read_text()
    acceptance = script[script.index("Next (item-3 GPU acceptance") :]
    trap = acceptance.index("trap restore_item3_gpu EXIT INT TERM")
    worker_stop = acceptance.index("sudo systemctl stop $WORKER_SERVICE", trap)
    doctor_stop = acceptance.index(
        "sudo systemctl stop patina-scan-worker-doctor", worker_stop
    )
    doctor_state = acceptance.index(
        "systemctl show --property=ActiveState --value \\",
        doctor_stop,
    )
    recheck = acceptance.index("assert_no_item3_runtime_dropins", doctor_state)
    install_override = acceptance.index(
        'sudo install -o root -g root -m 0600 "$ENV_FILE"', recheck
    )

    assert trap < worker_stop < doctor_stop < doctor_state < recheck < install_override
    assert "inactive|failed" in acceptance[doctor_state:recheck]
    assert "refusing non-quiescent doctor state" in acceptance[doctor_state:recheck]


def test_env_file_is_installed_root_owned_0600():
    script = INSTALL.read_text()
    assert 'install -o root -g root -m 0600 "$SRC_DIR/scan-worker.env.example" "$ENV_FILE"' in script


def test_env_template_routes_gpu_preflight_to_doctor_only_unit():
    template = ENV_EXAMPLE.read_text()
    assert "doctor-only" in template
    assert "patina-scan-worker-doctor" in template
    assert "never start the queue worker" in template
    assert "start the service only long enough for ExecStartPre" not in template
    assert "GPU names may be listed temporarily" not in template
