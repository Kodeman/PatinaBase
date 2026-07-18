"""Static safety contract for the privileged native installer."""

from pathlib import Path


INSTALL = Path(__file__).resolve().parent.parent / "install.sh"


def test_upgrade_refuses_to_rebuild_gpu_install_as_cpu_by_omission():
    script = INSTALL.read_text()
    guard = 'if [ "$UPGRADE" -eq 1 ] && [ "$GPU" -eq 0 ] && [ -f "$DROPIN_DIR/gpu.conf" ]'
    assert guard in script
    assert script.index(guard) < script.index('rm -rf "$VENV"')
    assert "--gpu --upgrade" in script[script.index(guard):script.index('rm -rf "$VENV"')]


def test_installer_does_not_run_doctor_as_root_shell():
    script = INSTALL.read_text()
    assert 'set -a; [ -f "$ENV_FILE" ] && . "$ENV_FILE"; set +a' not in script
    assert '"$VENV/bin/patina-scan-worker" doctor' not in script
    assert "ExecStartPre" in script
