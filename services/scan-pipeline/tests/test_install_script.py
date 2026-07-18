"""Safety contract for the privileged native installer.

The behavioral tests use a fake systemctl and a temporary filesystem.  They
exercise the same transaction helper sourced by ``install.sh`` without root or
a running systemd manager.
"""

from __future__ import annotations

import os
import stat
import subprocess
from pathlib import Path


INSTALL = Path(__file__).resolve().parent.parent / "install.sh"
VENV_LIB = Path(__file__).resolve().parent.parent / "install-venv-lib.sh"
PATH_GUARD = Path(__file__).resolve().parent.parent / "install-path-guard.py"


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


def test_candidate_is_checked_smoked_and_verified_before_transaction_activation():
    script = INSTALL.read_text()
    assert 'generate-release-path --app-dir "$APP_DIR"' in script
    assert 'create-release --app-dir "$APP_DIR" --path "$STAGED_VENV"' in script
    assert '"$STAGED_VENV/bin/pip" check' in script
    assert 'import patina_scan_worker' in script
    assert '"$SMOKE_VENV/bin/patina-scan-worker" --help' in script
    assert "verify_candidate_units" in script
    assert 'SYSTEMD_UNIT_PATH="$CANDIDATE_SYSTEMD_DIR:"' in script
    assert "systemd-analyze verify" in script
    assert script.index('"$STAGED_VENV/bin/pip" check') < script.index(
        "begin_install_transaction"
    )
    assert script.index("verify_candidate_units") < script.index(
        "begin_install_transaction"
    )
    assert script.index('"$SMOKE_VENV/bin/patina-scan-worker" --help') < script.index(
        "begin_install_transaction"
    )
    # Stop/swap lives only in the helper, after all candidate checks.
    assert "systemctl stop patina-scan-worker" not in script


def test_release_namespace_and_candidate_contents_stay_root_owned():
    script = INSTALL.read_text()
    assert 'ensure-trusted-dir' in script
    assert '"$APP_DIR"' in script
    assert 'generate-release-path' in script
    assert 'create-release' in script
    assert 'harden-release' in script
    assert 'chown -R "$SVC_USER:$SVC_USER" "$STAGED_VENV"' not in script
    assert 'install -d -o "$SVC_USER" -g "$SVC_USER" "$APP_DIR"' not in script


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


def _path_guard(
    tmp_path: Path,
    *args: str,
    expected_ok: bool = True,
) -> subprocess.CompletedProcess[str]:
    anchor = tmp_path / "trusted"
    anchor.mkdir(mode=0o700, exist_ok=True)
    result = subprocess.run(
        [
            "python3",
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
    assert stat.S_IMODE(Path(first).stat().st_mode) == 0o755
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


def _write_fake_systemctl(tmp_path: Path) -> Path:
    fake_bin = tmp_path / "bin"
    fake_bin.mkdir(exist_ok=True)
    fake_systemctl = fake_bin / "systemctl"
    fake_systemctl.write_text(
        """#!/usr/bin/env bash
set -eu
echo "$*" >> "$SYSTEMCTL_LOG"
case "$1" in
  is-active) exit "$SYSTEMCTL_ACTIVE" ;;
  stop|daemon-reload) exit 0 ;;
  start)
    if [ "$FAIL_NEW_UNIT" = 1 ] && grep -q new-worker-unit "$LIVE_WORKER_UNIT"; then
      exit 1
    fi
    exit 0
    ;;
esac
exit 2
"""
    )
    fake_systemctl.chmod(0o755)
    return fake_bin


def _setup_transaction_tree(tmp_path: Path, *, legacy_live: bool = False):
    app = tmp_path / "app"
    transaction_parent = tmp_path / "etc"
    units = tmp_path / "systemd"
    candidates = tmp_path / "candidates"
    app.mkdir()
    transaction_parent.mkdir(mode=0o750)
    units.mkdir()
    candidates.mkdir()

    old_release = app / ".venv.release.old"
    old_release.mkdir()
    (old_release / "marker").write_text("old")
    live = app / ".venv"
    if legacy_live:
        live.mkdir()
        (live / "marker").write_text("old")
    else:
        live.symlink_to(old_release)
    older_release = app / ".venv.release.older"
    older_release.mkdir()
    (older_release / "marker").write_text("older")
    (app / ".venv.previous").symlink_to(older_release)

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
BUILD_VENV=1
PATH_GUARD_SCRIPT="$3"
INSTALL_TRUST_ANCHOR="$(dirname "$APP_DIR")"
_harden_managed_release() {{
  python3 "$PATH_GUARD_SCRIPT" \
    --anchor "$INSTALL_TRUST_ANCHOR" \
    --trusted-uid "$(id -u)" --trusted-gid "$(id -g)" \
    harden-release --app-dir "$APP_DIR" --path "$1" >/dev/null
}}
MANAGED_UNIT_TARGETS=({target_args})
CANDIDATE_UNIT_PATHS=({candidate_args})
_transaction_hook() {{
  {interrupt_body}
  return 0
}}
prepare_install_transaction
begin_install_transaction
activate_install_transaction
"""


def _run_transaction(
    tmp_path: Path,
    *,
    active: bool,
    fail_new_unit: bool = False,
    interrupt: bool = False,
    interrupt_after_previous: bool = False,
    legacy_live: bool = False,
):
    app, units, candidates, staged, targets, candidate_paths = _setup_transaction_tree(
        tmp_path, legacy_live=legacy_live
    )
    fake_bin = _write_fake_systemctl(tmp_path)
    log = tmp_path / "systemctl.log"
    env = {
        **os.environ,
        "PATH": f"{fake_bin}:{os.environ['PATH']}",
        "SYSTEMCTL_LOG": str(log),
        "SYSTEMCTL_ACTIVE": "0" if active else "3",
        "FAIL_NEW_UNIT": "1" if fail_new_unit else "0",
        "LIVE_WORKER_UNIT": str(targets[0]),
    }
    result = subprocess.run(
        [
            "bash",
            "-c",
            _transaction_shell(
                targets,
                candidate_paths,
                interrupt_point=(
                    "after_previous" if interrupt_after_previous
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
    return result, env, app, units, staged, targets, candidate_paths


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
    assert log == ["is-active --quiet patina-scan-worker", "daemon-reload"]


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
        "is-active --quiet patina-scan-worker",
        "stop patina-scan-worker",
        "daemon-reload",
        "start patina-scan-worker",
        "stop patina-scan-worker",
        "daemon-reload",
        "start patina-scan-worker",
    ]


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

    recovery = r"""
set -euo pipefail
source "$1"
APP_DIR="$2"
VENV="$2/.venv"
PREVIOUS_VENV="$2/.venv.previous"
FAILED_VENV="$2/.venv.failed"
TRANSACTION_PARENT="$(dirname "$2")/etc"
TRANSACTION_DIR="$TRANSACTION_PARENT/.scan-worker-install-transaction"
WORKER_SERVICE=patina-scan-worker
recover_install_transaction
"""
    recovered = subprocess.run(
        ["bash", "-c", recovery, "recovery-test", str(VENV_LIB), str(app)],
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


def test_interruption_after_previous_link_change_restores_older_previous(tmp_path):
    result, env, app, _units, _staged, _targets, _candidates = _run_transaction(
        tmp_path, active=True, interrupt_after_previous=True
    )
    assert result.returncode == 97
    assert (app / ".venv.previous" / "marker").read_text() == "old"

    recovery = r"""
set -euo pipefail
source "$1"
APP_DIR="$2"
VENV="$2/.venv"
PREVIOUS_VENV="$2/.venv.previous"
FAILED_VENV="$2/.venv.failed"
TRANSACTION_PARENT="$(dirname "$2")/etc"
TRANSACTION_DIR="$TRANSACTION_PARENT/.scan-worker-install-transaction"
WORKER_SERVICE=patina-scan-worker
recover_install_transaction
"""
    recovered = subprocess.run(
        ["bash", "-c", recovery, "recovery-test", str(VENV_LIB), str(app)],
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
        tmp_path, active=False, legacy_live=True
    )
    assert result.returncode == 0, result.stderr
    assert (app / ".venv").is_symlink()
    assert (app / ".venv" / "marker").read_text() == "new"
    assert (app / ".venv.previous").is_symlink()
    assert (app / ".venv.previous" / "marker").read_text() == "old"


def test_recovery_cleans_an_interrupted_build_stage_without_touching_live(tmp_path):
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
    shell = r"""
set -euo pipefail
source "$1"
APP_DIR="$2"
VENV="$2/.venv"
PREVIOUS_VENV="$2/.venv.previous"
FAILED_VENV="$2/.venv.failed"
TRANSACTION_PARENT="$(dirname "$2")/etc"
TRANSACTION_DIR="$TRANSACTION_PARENT/.scan-worker-install-transaction"
WORKER_SERVICE=patina-scan-worker
recover_install_transaction
"""
    result = subprocess.run(
        ["bash", "-c", shell, "recovery-test", str(VENV_LIB), str(app)],
        text=True,
        capture_output=True,
        check=False,
    )
    assert result.returncode == 0, result.stderr
    assert os.readlink(app / ".venv") == str(old)
    assert not staged.exists()
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


def test_env_file_is_installed_root_owned_0600():
    script = INSTALL.read_text()
    assert 'install -o root -g root -m 0600 "$SRC_DIR/scan-worker.env.example" "$ENV_FILE"' in script
