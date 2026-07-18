#!/usr/bin/env bash
# Atomic venv activation used by install.sh. Kept as a small sourced function so
# its active/inactive/rollback control flow can be exercised without root or a
# real systemd manager.

_remove_managed_venv_reference() {
  local reference="$1"
  local target=""
  local current_target=""

  if [ -L "$reference" ]; then
    target="$(readlink "$reference")"
    if [ -L "$VENV" ]; then
      current_target="$(readlink "$VENV")"
    fi
    rm -- "$reference"
    # We create only absolute release links. Delete an orphaned managed target,
    # never an arbitrary/relative operator link or the current/new release.
    case "$target" in
      "$APP_DIR"/.venv.release.*)
        if [ "$target" != "$current_target" ] && [ "$target" != "$STAGED_VENV" ]; then
          rm -rf -- "$target"
        fi
        ;;
    esac
  elif [ -e "$reference" ]; then
    # Compatibility with the pre-release-layout installer, whose backups were
    # real venv directories rather than symlinks.
    rm -rf -- "$reference"
  fi
}


activate_staged_venv() {
  if [ "$BUILD_VENV" -ne 1 ]; then
    return 0
  fi

  # Remove stale backups while the live service is still untouched/running. If
  # either cleanup fails, errexit aborts before systemctl stop.
  _remove_managed_venv_reference "$PREVIOUS_VENV"
  _remove_managed_venv_reference "$FAILED_VENV"
  _remove_managed_venv_reference "$NEXT_VENV_LINK"
  ln -s "$STAGED_VENV" "$NEXT_VENV_LINK"

  WAS_ACTIVE=0
  if systemctl is-active --quiet patina-scan-worker; then
    WAS_ACTIVE=1
    echo "-- stopping active worker only after staged build + pip check succeeded"
    systemctl stop patina-scan-worker
  fi

  HAD_LIVE_VENV=0
  if [ -d "$VENV" ]; then
    HAD_LIVE_VENV=1
    if ! mv "$VENV" "$PREVIOUS_VENV"; then
      echo "ERROR: could not preserve live venv; activation aborted." >&2
      if [ "$WAS_ACTIVE" -eq 1 ]; then
        systemctl start patina-scan-worker
      fi
      return 1
    fi
  fi
  if ! mv "$NEXT_VENV_LINK" "$VENV"; then
    echo "ERROR: staged venv link activation failed; restoring prior venv." >&2
    if [ "$HAD_LIVE_VENV" -eq 1 ]; then
      mv "$PREVIOUS_VENV" "$VENV"
    fi
    if [ "$WAS_ACTIVE" -eq 1 ]; then
      systemctl start patina-scan-worker
    fi
    return 1
  fi

  if [ "$WAS_ACTIVE" -eq 1 ]; then
    echo "-- starting worker with staged venv (ExecStartPre doctor is activation gate)"
    if ! systemctl start patina-scan-worker; then
      echo "ERROR: upgraded worker failed activation; rolling back prior venv." >&2
      mv "$VENV" "$FAILED_VENV"
      if [ "$HAD_LIVE_VENV" -eq 1 ]; then
        mv "$PREVIOUS_VENV" "$VENV"
        if ! systemctl start patina-scan-worker; then
          echo "ERROR: prior venv was restored but its service restart also failed." >&2
        else
          echo "-- rollback succeeded; prior worker is running" >&2
        fi
      fi
      return 1
    fi
    echo "-- activation passed; prior venv retained at $PREVIOUS_VENV"
  elif [ "$HAD_LIVE_VENV" -eq 1 ]; then
    echo "-- service was inactive; prior venv retained at $PREVIOUS_VENV for rollback"
  fi
}
