"""Static safety contract for the privileged native installer."""

import os
import subprocess
from pathlib import Path


INSTALL = Path(__file__).resolve().parent.parent / "install.sh"
VENV_LIB = Path(__file__).resolve().parent.parent / "install-venv-lib.sh"


def test_upgrade_refuses_to_rebuild_gpu_install_as_cpu_by_omission():
    script = INSTALL.read_text()
    guard = 'if [ "$UPGRADE" -eq 1 ] && [ "$GPU" -eq 0 ] && [ -f "$DROPIN_DIR/gpu.conf" ]'
    assert guard in script
    assert "--gpu --upgrade" in script[script.index(guard):]


def test_installer_does_not_run_doctor_as_root_shell():
    script = INSTALL.read_text()
    assert 'set -a; [ -f "$ENV_FILE" ] && . "$ENV_FILE"; set +a' not in script
    assert '"$VENV/bin/patina-scan-worker" doctor' not in script
    assert "ExecStartPre" in script


def test_gpu_install_fails_before_changes_without_nvidia_modprobe():
    script = INSTALL.read_text()
    check = 'if [ "$GPU" -eq 1 ] && [ ! -x "$NVIDIA_MODPROBE" ]'
    assert check in script
    assert script.index(check) < script.index("# 0. native libs")
    assert "nvidia-modprobe" in script[script.index(check):script.index("# 0. native libs")]


def test_upgrade_builds_and_checks_a_staged_venv_before_stopping_service():
    script = INSTALL.read_text()
    assert 'STAGED_VENV="$APP_DIR/.venv.release.' in script
    assert '"$PYTHON" -m venv "$STAGED_VENV"' in script
    assert '"$STAGED_VENV/bin/pip" check' in script
    assert 'rm -rf "$VENV"' not in script
    assert script.index('"$STAGED_VENV/bin/pip" check') < script.index(
        "activate_staged_venv"
    )
    # Stop/swap lives only in the helper invoked after the checked build.
    assert "systemctl stop patina-scan-worker" not in script


def test_activation_switches_a_symlink_and_keeps_a_previous_venv():
    script = INSTALL.read_text()
    activation = VENV_LIB.read_text()
    assert 'PREVIOUS_VENV="$APP_DIR/.venv.previous"' in script
    old_to_previous = 'mv "$VENV" "$PREVIOUS_VENV"'
    next_to_live = 'mv "$NEXT_VENV_LINK" "$VENV"'
    assert old_to_previous in activation
    assert 'ln -s "$STAGED_VENV" "$NEXT_VENV_LINK"' in activation
    assert next_to_live in activation
    assert 'mv "$STAGED_VENV"' not in activation
    assert activation.index(old_to_previous) < activation.index(next_to_live)


def test_failed_active_upgrade_rolls_back_and_restarts_previous_venv():
    script = VENV_LIB.read_text()
    failure = 'if ! systemctl start patina-scan-worker; then'
    assert failure in script
    rollback = script[script.index(failure):]
    assert 'mv "$VENV" "$FAILED_VENV"' in rollback
    assert 'mv "$PREVIOUS_VENV" "$VENV"' in rollback
    assert rollback.count("systemctl start patina-scan-worker") >= 2


def _run_activation(tmp_path, *, active, fail_first_start=False):
    app = tmp_path / "app"
    live = app / ".venv"
    staged = app / ".venv.staged"
    live.mkdir(parents=True)
    staged.mkdir()
    (live / "marker").write_text("old")
    (staged / "marker").write_text("new")

    fake_bin = tmp_path / "bin"
    fake_bin.mkdir()
    fake_systemctl = fake_bin / "systemctl"
    fake_systemctl.write_text("""#!/usr/bin/env bash
set -eu
echo "$*" >> "$SYSTEMCTL_LOG"
case "$1" in
  is-active) exit "$SYSTEMCTL_ACTIVE" ;;
  stop) exit 0 ;;
  start)
    count=0
    if [ -f "$SYSTEMCTL_START_COUNT" ]; then count=$(<"$SYSTEMCTL_START_COUNT"); fi
    count=$((count + 1))
    echo "$count" > "$SYSTEMCTL_START_COUNT"
    if [ "$FAIL_FIRST_START" = 1 ] && [ "$count" -eq 1 ]; then exit 1; fi
    exit 0
    ;;
esac
exit 2
""")
    fake_systemctl.chmod(0o755)

    shell = r"""
set -euo pipefail
source "$1"
BUILD_VENV=1
APP_DIR="$2"
VENV="$2/.venv"
STAGED_VENV="$2/.venv.staged"
NEXT_VENV_LINK="$2/.venv.next"
PREVIOUS_VENV="$2/.venv.previous"
FAILED_VENV="$2/.venv.failed"
activate_staged_venv
"""
    env = {
        **os.environ,
        "PATH": f"{fake_bin}:{os.environ['PATH']}",
        "SYSTEMCTL_LOG": str(tmp_path / "systemctl.log"),
        "SYSTEMCTL_START_COUNT": str(tmp_path / "start-count"),
        "SYSTEMCTL_ACTIVE": "0" if active else "3",
        "FAIL_FIRST_START": "1" if fail_first_start else "0",
    }
    result = subprocess.run(
        ["bash", "-c", shell, "activation-test", str(VENV_LIB), str(app)],
        text=True,
        capture_output=True,
        env=env,
        check=False,
    )
    log = (tmp_path / "systemctl.log").read_text().splitlines()
    return result, app, log


def test_inactive_upgrade_swaps_without_start_and_preserves_previous(tmp_path):
    result, app, log = _run_activation(tmp_path, active=False)
    assert result.returncode == 0, result.stderr
    assert (app / ".venv").is_symlink()
    assert os.readlink(app / ".venv") == str(app / ".venv.staged")
    assert (app / ".venv" / "marker").read_text() == "new"
    assert (app / ".venv.previous" / "marker").read_text() == "old"
    assert log == ["is-active --quiet patina-scan-worker"]


def test_active_failed_activation_restores_and_restarts_previous(tmp_path):
    result, app, log = _run_activation(
        tmp_path, active=True, fail_first_start=True,
    )
    assert result.returncode == 1
    assert (app / ".venv" / "marker").read_text() == "old"
    assert (app / ".venv.failed" / "marker").read_text() == "new"
    assert not (app / ".venv.previous").exists()
    assert log == [
        "is-active --quiet patina-scan-worker",
        "stop patina-scan-worker",
        "start patina-scan-worker",
        "start patina-scan-worker",
    ]


def test_gpu_installs_prepare_unit_only_in_gpu_branch():
    script = INSTALL.read_text()
    gpu_branch = script[script.index('if [ "$GPU" -eq 1 ]; then', script.index("# 3.")):]
    assert "patina-scan-worker-nvidia-prepare.service" in gpu_branch
    assert 'install -m 0644 "$SRC_DIR/patina-scan-worker-nvidia-prepare.service"' in gpu_branch


def test_env_file_is_installed_root_owned_0600():
    script = INSTALL.read_text()
    assert 'install -o root -g root -m 0600 "$SRC_DIR/scan-worker.env.example" "$ENV_FILE"' in script
