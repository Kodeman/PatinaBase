"""Static and CLI contracts for the DeskDev COLMAP source installer."""

from __future__ import annotations

import os
import stat
import subprocess
from pathlib import Path


INSTALLER = Path(__file__).resolve().parent.parent / "install-colmap-4.0.2.sh"


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
    assert "needs at least 30 GiB free" in script


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
