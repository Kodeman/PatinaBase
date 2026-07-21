"""Static and CLI contracts for the DeskDev COLMAP source installer."""

from __future__ import annotations

import os
import stat
import subprocess
from pathlib import Path


INSTALLER = Path(__file__).resolve().parent.parent / "install-colmap-4.0.2.sh"
BUILD_REQUIREMENTS = (
    Path(__file__).resolve().parent.parent / "pycolmap-build-requirements.txt"
)


def _script() -> str:
    return INSTALLER.read_text()


def test_installer_is_valid_bash_and_help_is_unprivileged():
    assert INSTALLER.stat().st_mode & stat.S_IXUSR
    syntax = subprocess.run(
        ["bash", "-n", str(INSTALLER)], text=True, capture_output=True, check=False
    )
    assert syntax.returncode == 0, syntax.stderr

    hostile_env = os.environ.copy()
    hostile_env["BASH_ENV"] = "/definitely/not/a/real/bash-env"
    help_result = subprocess.run(
        ["bash", "-p", str(INSTALLER), "--help"],
        text=True,
        capture_output=True,
        check=False,
        env=hostile_env,
    )
    assert help_result.returncode == 0, help_result.stderr
    assert "--acknowledge-experimental-ubuntu-24.04" in help_result.stdout
    assert "--verify-only" in help_result.stdout


def test_help_exposes_custom_work_dir_and_paths_are_derived_after_parse():
    selected = (
        "/mnt/ada-data/Patina/.patina-builds/"
        f"patina-colmap-4.0.2-{os.geteuid()}"
    )
    help_result = subprocess.run(
        ["bash", "-p", str(INSTALLER), "--work-dir", selected, "--help"],
        text=True,
        capture_output=True,
        check=False,
    )
    assert help_result.returncode == 0, help_result.stderr
    assert "--work-dir PATH" in help_result.stdout
    assert f"Resumable build state: {selected}" in help_result.stdout
    assert f"Append-only run log:   {selected}/install.log" in help_result.stdout

    script = _script()
    parse = script.index('while [ "$#" -gt 0 ]')
    work_dir_case = script.index("--work-dir)", parse)
    log_derivation = script.index('readonly LOG_FILE="$WORK_DIR/install.log"')
    lock_derivation = script.index('readonly LOCK_FILE="$WORK_DIR/install.lock"')
    assert parse < work_dir_case < log_derivation
    assert parse < work_dir_case < lock_derivation


def test_custom_work_dir_is_a_safe_executable_dedicated_leaf():
    script = _script()
    assert '[[ "$WORK_DIR" = /* ]]' in script
    assert "dangerous work directory" in script
    assert 'realpath -e -- "$WORK_DIR"' in script
    assert "refusing symlinked build directory" in script
    assert "build directory is not owned by uid $EUID" in script
    assert "build directory is group/world writable" in script
    assert 'mkdir -m 0700 -- "$WORK_DIR"' in script
    assert "findmnt" in script
    assert "noexec" in script
    assert "work directory must be below the filesystem mount point" in script


def test_global_lock_serializes_activation_across_selectable_work_dirs():
    script = _script()
    assignment = next(
        line for line in script.splitlines() if line.startswith("readonly GLOBAL_LOCK_FILE=")
    )
    assert "/var/tmp/patina-colmap-4.0.2-${EUID}.global.lock" in assignment
    assert "$WORK_DIR" not in assignment
    assert "validate_lock_file" in script
    assert "multiple hard links" in script
    assert script.index("flock -n 8") < script.index("\nprepare_work_dir\n")
    assert script.index("flock -n 8") < script.index("flock -n 9")
    assert script.index("flock -n 8") < script.index(
        'phase "install immutable versioned prefix"'
    )


def test_installer_pins_the_exact_engine_toolchain_and_target():
    script = _script()
    assert "d927f7e518fc20afa33390712c4cc20d85b730b8" in script
    assert "refs/tags/4.0.2" in script
    assert "refs/tags/4.0.2^{commit}" in script
    assert "COLMAP 4.0.2 -- Structure-from-Motion and Multi-View Stereo" in script
    assert "/usr/local/cuda-11.8/bin/nvcc" in script
    assert "/usr/bin/gcc-11" in script
    assert "/usr/bin/g++-11" in script
    assert "-DCMAKE_CUDA_ARCHITECTURES=75" in script
    assert "-DGIT_COMMIT_ID=d927f7e" in script
    assert "-DGIT_COMMIT_DATE=2026-03-18" in script
    assert "-DCUDAToolkit_ROOT=/usr/local/cuda-11.8" in script
    assert "-DCUDA_ENABLED=ON" in script
    assert "-DONNX_ENABLED=OFF" in script
    assert "-DGUI_ENABLED=OFF" in script
    assert "-DBLA_VENDOR=OpenBLAS" in script


def test_installer_hard_gates_the_experimental_host_and_real_sm75_cuda():
    script = _script()
    assert 'ACKNOWLEDGE_NOBLE_EXPERIMENT=0' in script
    assert 'VERSION_ID="24.04"' in script
    assert "dpkg --print-architecture" in script
    assert "release 11\\.8," in script
    assert "no visible sm_75 device" in script
    assert "-arch=sm_75" in script
    assert "__global__ void increment" in script
    assert "cudaMalloc" in script
    assert "cudaDeviceSynchronize" in script
    assert "cudaMemcpyDeviceToHost" in script
    assert "value != 42" in script
    assert "--allow-unsupported-compiler" not in script


def test_installer_scopes_sudo_and_never_changes_driver_or_global_cuda():
    script = _script()
    assert 'if [ "$EUID" -eq 0 ]' in script
    assert "sudo -v" in script
    assert "sudo apt-get" in script
    assert 'DESTDIR="$INSTALL_STAGE_ROOT" cmake --install' in script
    assert '(umask 022; DESTDIR="$INSTALL_STAGE_ROOT" cmake --install' in script
    assert "sudo cmake --install" not in script
    assert "sudo cp -a --no-preserve=ownership" in script
    assert 'sudo find "$ROOT_CANDIDATE" -type d -exec chmod 0755 {} +' in script
    assert 'sudo find "$ROOT_CANDIDATE" -type f -perm /111 -exec chmod 0755 {} +' in script
    assert (
        'sudo find "$ROOT_CANDIDATE" -type f ! -perm /111 -exec chmod 0644 {} +'
        in script
    )
    assert "-perm /7000" in script
    assert "-type d ! -perm -0555" in script
    assert "-type f ! -perm -0444" in script
    assert "installed COLMAP command is not mode 0755" in script
    assert "verify_privileged_directory /opt" in script
    assert "verify_privileged_directory /usr/local/bin" in script
    assert "sudo ln -s --" in script
    assert "ln -sfn" not in script
    assert "update-alternatives" not in script
    assert "nvidia-cuda-toolkit" not in script
    assert "cuda-toolkit-11-8" not in script
    assert "cuda-drivers" not in script
    assert "systemctl" not in script


def test_installer_is_resumable_observable_and_retains_failure_evidence():
    script = _script()
    assert "/var/tmp/patina-colmap-4.0.2-${EUID}" in script
    assert 'LOG_FILE="$WORK_DIR/install.log"' in script
    assert "tee -a" in script
    assert "flock -n 9" in script
    assert script.index("flock -n 9") < script.index("tee -a")
    assert "cmake --build" in script
    assert "Build state and logs retained" in script
    assert 'mktemp -d -- "$WORK_DIR/install-root.XXXXXXXXXX"' in script
    assert "rm -rf" not in script
    assert 'required_free_label="30 GiB"' in script
    assert 'required_free_label="8 GiB for the retained native build + binding resume"' in script


def test_installer_guards_versioned_prefix_link_and_command_contract():
    script = _script()
    assert "COLMAP_PREFIX=/opt/colmap/4.0.2" in script
    assert "COLMAP_LINK=/usr/local/bin/colmap" in script
    assert "already exists but failed exact verification" in script
    assert "refusing to replace existing" in script
    assert "verify_root_owned_tree" in script
    assert 'output="$(ldd "$executable" 2>&1)" ||' in script
    assert 'ldd "$COLMAP_PREFIX/bin/colmap" | grep' not in script
    assert "status --porcelain --untracked-files=all" in script
    race_gate = (
        'if sudo test -e "$COLMAP_PREFIX" || sudo test -L "$COLMAP_PREFIX"; then\n'
        '    die "$COLMAP_PREFIX appeared while the candidate was being installed"'
    )
    assert race_gate in script
    assert "feature_extractor" in script
    assert "sequential_matcher" in script
    assert "exhaustive_matcher" in script
    assert "point_triangulator" in script
    assert "bundle_adjuster" in script
    assert "pose_prior_mapper" in script
    assert "with CUDA" in script


def test_installer_builds_and_publishes_a_qualified_pycolmap_cuda_artifact():
    script = _script()
    assert "PYCOLMAP_ARTIFACT_DIR=/opt/patina/scan-pipeline-artifacts/pycolmap-4.0.2-cuda118-sm75" in script
    assert "pycolmap-build-requirements.txt" in script
    assert "--require-hashes" in script
    assert "--no-build-isolation" in script
    assert "--no-deps" in script
    assert "SKBUILD_BUILD_DIR" in script
    assert "-Dcolmap_DIR=$COLMAP_PREFIX/share/colmap" in script
    assert "-DGENERATE_STUBS=OFF" in script
    assert "-DCMAKE_CUDA_ARCHITECTURES=75" in script
    assert "SOURCE_DATE_EPOCH=1773829775" in script
    assert "pycolmap_cuda_smoke.py" in script
    assert "timeout 90" in script
    assert "validate-pycolmap-artifact" in script
    assert "artifact.json" in script
    assert "sudo mv -T" in script
    assert "systemctl" not in script


def test_pycolmap_cmake_discovers_the_hash_pinned_build_venv_pybind11():
    script = _script()

    # An explicit COLMAP-only CMAKE_PREFIX_PATH is appended after
    # scikit-build-core's init cache and hides the build venv's pybind11 config.
    # colmap_DIR already selects the immutable native installation exactly.
    assert "-DCMAKE_PREFIX_PATH=$COLMAP_PREFIX" not in script
    assert "-Dcolmap_DIR=$COLMAP_PREFIX/share/colmap" in script

    requirements_install = script.index('-r "$PYCOLMAP_BUILD_REQUIREMENTS"')
    discovery = script.index('PYCOLMAP_PYBIND11_DIR="$(')
    module_lookup = script.index("-m pybind11 --cmakedir", discovery)
    containment = script.index(
        'case "$PYCOLMAP_PYBIND11_DIR" in', module_lookup
    )
    config_guard = script.index(
        "for pybind11_config in "
        "pybind11Config.cmake pybind11ConfigVersion.cmake",
        containment,
    )
    assert '"$PYCOLMAP_PYBIND11_DIR/$pybind11_config"' in script[config_guard:]
    define = script.index(
        '--config-settings="cmake.define.pybind11_DIR=$PYCOLMAP_PYBIND11_DIR"',
        config_guard,
    )
    cache_check = script.index(
        'PYCOLMAP_CACHED_PYBIND11_DIR=', define
    )

    assert requirements_install < discovery < module_lookup
    assert module_lookup < containment < config_guard < define < cache_check


def test_pycolmap_build_requirements_are_exact_and_hash_pinned():
    requirements = [
        line.strip()
        for line in BUILD_REQUIREMENTS.read_text().splitlines()
        if line.strip() and not line.lstrip().startswith("#")
    ]
    assert requirements
    assert any(
        requirement.startswith("pybind11==3.0.1 ")
        for requirement in requirements
    )
    for requirement in requirements:
        assert "==" in requirement
        assert "--hash=sha256:" in requirement
