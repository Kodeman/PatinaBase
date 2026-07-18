#!/usr/bin/env bash
# Transactional activation used by install.sh.  The immutable venv release and
# every candidate unit are validated before these functions are called.  This
# file is sourced so the filesystem/systemctl state machine can be tested with a
# fake manager and no root privileges.

_transaction_state_write() {
  local state="$1"
  local temporary="$TRANSACTION_DIR/state.tmp.$$"
  printf '%s\n' "$state" > "$temporary" || return 1
  chmod 0600 "$temporary" || return 1
  _atomic_replace_path "$temporary" "$TRANSACTION_DIR/state"
}

_transaction_value_write() {
  local name="$1"
  local value="$2"
  local temporary="$TRANSACTION_DIR/$name.tmp.$$"
  printf '%s\n' "$value" > "$temporary" || return 1
  chmod 0600 "$temporary" || return 1
  _atomic_replace_path "$temporary" "$TRANSACTION_DIR/$name"
}

_atomic_replace_path() {
  # os.replace is a single rename(2). Both source and destination are created in
  # the destination directory, so the operation is same-filesystem and atomic.
  # Unlike `mv`, it cannot mistake a symlink-to-directory for a destination dir.
  local source="$1"
  local destination="$2"
  "${PYTHON:-python3}" -c \
    'import os, sys
source, destination = sys.argv[1:3]
if not os.path.islink(source):
    fd = os.open(source, os.O_RDONLY)
    try: os.fsync(fd)
    finally: os.close(fd)
os.replace(source, destination)
directory = os.path.dirname(destination) or "."
for path in (directory, os.path.dirname(directory) or "."):
    fd = os.open(path, os.O_RDONLY)
    try: os.fsync(fd)
    finally: os.close(fd)' \
    "$source" "$destination"
}

_durable_unlink() {
  local path="$1"
  if [ -e "$path" ] || [ -L "$path" ]; then
    rm -f -- "$path" || return 1
    "${PYTHON:-python3}" -c \
      'import os, sys
directory = os.path.dirname(sys.argv[1]) or "."
fd = os.open(directory, os.O_RDONLY)
try: os.fsync(fd)
finally: os.close(fd)' "$path"
  fi
}

_fsync_transaction_snapshot() {
  "${PYTHON:-python3}" -c \
    'import os, sys
root = sys.argv[1]
for current, directories, files in os.walk(root, topdown=False):
    for name in files:
        path = os.path.join(current, name)
        if os.path.islink(path):
            continue
        fd = os.open(path, os.O_RDONLY)
        try: os.fsync(fd)
        finally: os.close(fd)
    fd = os.open(current, os.O_RDONLY)
    try: os.fsync(fd)
    finally: os.close(fd)' "$TRANSACTION_DIR"
}

_fsync_directory() {
  "${PYTHON:-python3}" -c \
    'import os, sys
fd = os.open(sys.argv[1], os.O_RDONLY)
try: os.fsync(fd)
finally: os.close(fd)' "$1"
}

_atomic_symlink_replace() {
  local target="$1"
  local destination="$2"
  local temporary="${destination}.patina-txn.$$"

  if [ -e "$destination" ] && [ ! -L "$destination" ]; then
    echo "ERROR: refusing to replace non-symlink $destination atomically." >&2
    return 1
  fi
  _durable_unlink "$temporary" || return 1
  ln -s "$target" "$temporary" || return 1
  if ! _atomic_replace_path "$temporary" "$destination"; then
    _durable_unlink "$temporary"
    return 1
  fi
}

_atomic_file_replace() {
  local source="$1"
  local destination="$2"
  local temporary="${destination}.patina-txn.$$"

  install -d "$(dirname "$destination")" || return 1
  install -m 0644 "$source" "$temporary" || return 1
  if ! _atomic_replace_path "$temporary" "$destination"; then
    _durable_unlink "$temporary"
    return 1
  fi
}

_managed_release_is_referenced() {
  local target="$1"
  local reference
  for reference in "$VENV" "$PREVIOUS_VENV"; do
    if [ -L "$reference" ] && [ "$(readlink "$reference")" = "$target" ]; then
      return 0
    fi
  done
  return 1
}

_remove_managed_release() {
  local target="${1:-}"

  [ -n "$APP_DIR" ] && [ "$APP_DIR" != "/" ] || return 1
  case "$target" in
    "$APP_DIR"/.venv.release.*) ;;
    "") return 0 ;;
    *)
      echo "WARNING: refusing to remove unmanaged release path $target" >&2
      return 0
      ;;
  esac
  if _managed_release_is_referenced "$target"; then
    return 0
  fi
  rm -rf -- "$target" || return 1
  _fsync_directory "$APP_DIR"
}

_discard_transaction() {
  if [ -z "$TRANSACTION_PARENT" ] || [ "$TRANSACTION_PARENT" = "/" ] || \
     [ "$TRANSACTION_DIR" != "$TRANSACTION_PARENT/.scan-worker-install-transaction" ]; then
    echo "ERROR: refusing to remove unexpected transaction path $TRANSACTION_DIR" >&2
    return 1
  fi
  rm -rf -- "$TRANSACTION_DIR" || return 1
  _fsync_directory "$TRANSACTION_PARENT"
}

prepare_install_transaction() {
  if [ -e "$TRANSACTION_DIR" ] || [ -L "$TRANSACTION_DIR" ]; then
    echo "ERROR: install transaction already exists at $TRANSACTION_DIR; recover it first." >&2
    return 1
  fi
  install -d -m 0700 "$TRANSACTION_DIR" || return 1
  _fsync_directory "$TRANSACTION_PARENT" || return 1
  _transaction_state_write building || return 1
  # The state marker precedes all build work. If power fails before this value
  # lands, recovery can safely discard an empty building transaction; the stage
  # is not created until prepare_install_transaction returns.
  _transaction_value_write staged_release "${STAGED_VENV:-}" || return 1
}

_snapshot_release() {
  if [ -L "$VENV" ]; then
    _transaction_value_write release_kind symlink || return 1
    _transaction_value_write release_target "$(readlink "$VENV")" || return 1
  elif [ -d "$VENV" ]; then
    # Legacy installers created .venv as a real directory. It is converted once
    # while the worker is stopped; the durable legacy_release path makes every
    # point in that non-atomic one-time conversion recoverable.
    _transaction_value_write release_kind legacy || return 1
    _transaction_value_write release_target "" || return 1
  elif [ -e "$VENV" ]; then
    echo "ERROR: $VENV is neither a venv directory nor a symlink." >&2
    return 1
  else
    _transaction_value_write release_kind absent || return 1
    _transaction_value_write release_target "" || return 1
  fi

  if [ -L "$PREVIOUS_VENV" ]; then
    _transaction_value_write previous_kind symlink || return 1
    _transaction_value_write previous_target "$(readlink "$PREVIOUS_VENV")" || return 1
  elif [ -d "$PREVIOUS_VENV" ]; then
    _transaction_value_write previous_kind legacy || return 1
    _transaction_value_write previous_target "" || return 1
  else
    _transaction_value_write previous_kind absent || return 1
    _transaction_value_write previous_target "" || return 1
  fi
}

_snapshot_units() {
  local index=0
  local target
  install -d -m 0700 "$TRANSACTION_DIR/snapshot" || return 1
  for target in "${MANAGED_UNIT_TARGETS[@]}"; do
    printf '%s\n' "$target" > "$TRANSACTION_DIR/snapshot/unit.$index.target" || return 1
    if [ -f "$target" ]; then
      printf '1\n' > "$TRANSACTION_DIR/snapshot/unit.$index.present" || return 1
      cp -p "$target" "$TRANSACTION_DIR/snapshot/unit.$index.content" || return 1
    else
      printf '0\n' > "$TRANSACTION_DIR/snapshot/unit.$index.present" || return 1
    fi
    index=$((index + 1))
  done
}

begin_install_transaction() {
  local was_active=0

  [ "$(cat "$TRANSACTION_DIR/state")" = building ] || {
    echo "ERROR: transaction is not in building state." >&2
    return 1
  }
  if [ "${#MANAGED_UNIT_TARGETS[@]}" -ne "${#CANDIDATE_UNIT_PATHS[@]}" ]; then
    echo "ERROR: managed/candidate unit lists differ in length." >&2
    return 1
  fi
  _snapshot_release || return 1
  _snapshot_units || return 1
  if systemctl is-active --quiet "$WORKER_SERVICE"; then
    was_active=1
  fi
  _transaction_value_write was_active "$was_active" || return 1
  # All rollback data and containing directories must reach stable storage
  # before the durable state can authorize mutations of live files.
  _fsync_transaction_snapshot || return 1
  # `prepared` is written only after the complete rollback snapshot exists and
  # before the first live unit, service, or release mutation.
  _transaction_state_write prepared || return 1
}

_install_candidate_units() {
  local index
  local candidate
  local target
  for ((index = 0; index < ${#MANAGED_UNIT_TARGETS[@]}; index++)); do
    target="${MANAGED_UNIT_TARGETS[$index]}"
    candidate="${CANDIDATE_UNIT_PATHS[$index]}"
    if [ ! -f "$candidate" ]; then
      echo "ERROR: candidate unit missing: $candidate" >&2
      return 1
    fi
    _atomic_file_replace "$candidate" "$target" || return 1
  done
}

_switch_release() {
  local kind
  local legacy_release
  kind="$(cat "$TRANSACTION_DIR/release_kind")"

  case "$kind" in
    symlink|absent)
      _atomic_symlink_replace "$STAGED_VENV" "$VENV"
      ;;
    legacy)
      legacy_release="$APP_DIR/.venv.release.legacy.$(date -u +%Y%m%d%H%M%S).$$"
      _transaction_value_write legacy_release "$legacy_release" || return 1
      _atomic_replace_path "$VENV" "$legacy_release" || return 1
      if ! _atomic_symlink_replace "$STAGED_VENV" "$VENV"; then
        _atomic_replace_path "$legacy_release" "$VENV" || true
        return 1
      fi
      ;;
    *)
      echo "ERROR: unknown saved release kind: $kind" >&2
      return 1
      ;;
  esac
}

_restore_units() {
  local index=0
  local present
  local target
  while [ -f "$TRANSACTION_DIR/snapshot/unit.$index.target" ]; do
    target="$(cat "$TRANSACTION_DIR/snapshot/unit.$index.target")"
    present="$(cat "$TRANSACTION_DIR/snapshot/unit.$index.present")"
    if [ "$present" = 1 ]; then
      _atomic_file_replace \
        "$TRANSACTION_DIR/snapshot/unit.$index.content" "$target" || return 1
    else
      _durable_unlink "$target" || return 1
    fi
    index=$((index + 1))
  done
}

_restore_release() {
  local kind
  local target
  local legacy_release=""
  kind="$(cat "$TRANSACTION_DIR/release_kind")"
  target="$(cat "$TRANSACTION_DIR/release_target")"
  if [ -f "$TRANSACTION_DIR/legacy_release" ]; then
    legacy_release="$(cat "$TRANSACTION_DIR/legacy_release")"
  fi

  case "$kind" in
    symlink)
      _atomic_symlink_replace "$target" "$VENV"
      ;;
    absent)
      if [ -L "$VENV" ]; then
        _durable_unlink "$VENV" || return 1
      elif [ -e "$VENV" ]; then
        echo "ERROR: cannot restore absent release over non-symlink $VENV" >&2
        return 1
      fi
      ;;
    legacy)
      if [ -d "$VENV" ] && [ ! -L "$VENV" ]; then
        # The interruption/failure happened before the one-time conversion.
        return 0
      fi
      if [ -L "$VENV" ]; then
        _durable_unlink "$VENV" || return 1
      fi
      if [ -n "$legacy_release" ] && [ -d "$legacy_release" ]; then
        _atomic_replace_path "$legacy_release" "$VENV" || return 1
      elif [ ! -d "$VENV" ]; then
        echo "ERROR: legacy venv backup is unavailable; transaction retained." >&2
        return 1
      fi
      ;;
    *)
      echo "ERROR: unknown saved release kind: $kind" >&2
      return 1
      ;;
  esac
}

_restore_previous_release() {
  local kind
  local target
  local moved_previous=""
  kind="$(cat "$TRANSACTION_DIR/previous_kind")"
  target="$(cat "$TRANSACTION_DIR/previous_target")"
  if [ -f "$TRANSACTION_DIR/moved_previous" ]; then
    moved_previous="$(cat "$TRANSACTION_DIR/moved_previous")"
  fi

  case "$kind" in
    symlink)
      if [ -e "$PREVIOUS_VENV" ] && [ ! -L "$PREVIOUS_VENV" ]; then
        echo "ERROR: cannot restore previous symlink over $PREVIOUS_VENV" >&2
        return 1
      fi
      _atomic_symlink_replace "$target" "$PREVIOUS_VENV"
      ;;
    absent)
      if [ -L "$PREVIOUS_VENV" ]; then
        _durable_unlink "$PREVIOUS_VENV" || return 1
      elif [ -e "$PREVIOUS_VENV" ]; then
        echo "ERROR: cannot restore absent previous release over $PREVIOUS_VENV" >&2
        return 1
      fi
      ;;
    legacy)
      if [ -d "$PREVIOUS_VENV" ] && [ ! -L "$PREVIOUS_VENV" ]; then
        return 0
      fi
      if [ -L "$PREVIOUS_VENV" ]; then
        _durable_unlink "$PREVIOUS_VENV" || return 1
      fi
      if [ -n "$moved_previous" ] && [ -d "$moved_previous" ]; then
        _atomic_replace_path "$moved_previous" "$PREVIOUS_VENV" || return 1
      else
        echo "ERROR: previous legacy release backup is unavailable." >&2
        return 1
      fi
      ;;
    *)
      echo "ERROR: unknown saved previous release kind: $kind" >&2
      return 1
      ;;
  esac
}

_cleanup_failed_stage() {
  local staged=""
  if [ -f "$TRANSACTION_DIR/staged_release" ]; then
    staged="$(cat "$TRANSACTION_DIR/staged_release")"
  fi
  _remove_managed_release "$staged"
}

_rollback_install_transaction() {
  local was_active
  local failed=0
  was_active="$(cat "$TRANSACTION_DIR/was_active")"

  # The new unit may be partially active, or a crash may have happened at any
  # point after stop. Quiesce it before restoring the complete snapshot.
  systemctl stop "$WORKER_SERVICE" >/dev/null 2>&1 || true
  _restore_units || failed=1
  _restore_release || failed=1
  _restore_previous_release || failed=1
  systemctl daemon-reload || failed=1
  if [ "$failed" -eq 0 ] && [ "$was_active" = 1 ]; then
    if ! systemctl start "$WORKER_SERVICE"; then
      echo "ERROR: prior units/release restored, but the prior service did not restart." >&2
      failed=1
    fi
  fi
  if [ "$failed" -ne 0 ]; then
    echo "ERROR: rollback incomplete; transaction retained at $TRANSACTION_DIR." >&2
    return 1
  fi

  _cleanup_failed_stage || return 1
  _discard_transaction || return 1
  echo "-- rollback restored prior units and release" >&2
  return 0
}

_finalize_previous_release() {
  local kind
  local desired=""
  local old_previous=""
  local moved_previous=""
  kind="$(cat "$TRANSACTION_DIR/release_kind")"

  case "$kind" in
    symlink) desired="$(cat "$TRANSACTION_DIR/release_target")" ;;
    legacy) desired="$(cat "$TRANSACTION_DIR/legacy_release")" ;;
    absent) desired="" ;;
  esac
  if [ -f "$TRANSACTION_DIR/previous_target" ]; then
    old_previous="$(cat "$TRANSACTION_DIR/previous_target")"
  fi

  if [ -d "$PREVIOUS_VENV" ] && [ ! -L "$PREVIOUS_VENV" ]; then
    moved_previous="$APP_DIR/.venv.release.legacy-previous.$(date -u +%Y%m%d%H%M%S).$$"
    _transaction_value_write moved_previous "$moved_previous" || return 1
    _atomic_replace_path "$PREVIOUS_VENV" "$moved_previous" || return 1
    old_previous="$moved_previous"
  fi
  if [ -n "$desired" ]; then
    _atomic_symlink_replace "$desired" "$PREVIOUS_VENV" || return 1
  elif [ -L "$PREVIOUS_VENV" ]; then
    _durable_unlink "$PREVIOUS_VENV" || return 1
  fi

  if [ -n "$old_previous" ] && [ "$old_previous" != "$desired" ]; then
    # Do not delete the old previous release before commit: switched-state
    # recovery must be able to reproduce the exact pre-install link/directory.
    _transaction_value_write obsolete_previous_release "$old_previous" || return 1
  fi
}

_cleanup_committed_previous() {
  local obsolete=""
  if [ -f "$TRANSACTION_DIR/obsolete_previous_release" ]; then
    obsolete="$(cat "$TRANSACTION_DIR/obsolete_previous_release")"
  fi
  _remove_managed_release "$obsolete"
}

if ! type _transaction_hook >/dev/null 2>&1; then
  _transaction_hook() { return 0; }
fi

activate_install_transaction() {
  local was_active
  local hook_status=0
  was_active="$(cat "$TRANSACTION_DIR/was_active")"

  if [ "$was_active" = 1 ]; then
    echo "-- stopping active worker after candidate validation and snapshot"
    if ! systemctl stop "$WORKER_SERVICE"; then
      _rollback_install_transaction || true
      return 1
    fi
  fi

  if ! _install_candidate_units || ! systemctl daemon-reload; then
    echo "ERROR: candidate unit activation failed; restoring transaction." >&2
    _rollback_install_transaction || true
    return 1
  fi
  if [ "$BUILD_VENV" -eq 1 ] && ! _switch_release; then
    echo "ERROR: immutable release switch failed; restoring transaction." >&2
    _rollback_install_transaction || true
    return 1
  fi
  if ! _transaction_state_write switched; then
    _rollback_install_transaction || true
    return 1
  fi

  # Tests override this no-op to emulate SIGKILL/power loss. A non-zero hook
  # deliberately leaves the durable transaction for the next invocation.
  _transaction_hook after_switch || hook_status=$?
  if [ "$hook_status" -ne 0 ]; then
    return "$hook_status"
  fi

  if [ "$was_active" = 1 ]; then
    echo "-- starting worker with candidate units/release (doctor gates activation)"
    if ! systemctl start "$WORKER_SERVICE"; then
      echo "ERROR: candidate service failed activation; rolling back all files." >&2
      _rollback_install_transaction || true
      return 1
    fi
  fi

  if [ "$BUILD_VENV" -eq 1 ]; then
    if ! _finalize_previous_release; then
      echo "ERROR: could not retain prior release; rolling back transaction." >&2
      _rollback_install_transaction || true
      return 1
    fi
  fi
  _transaction_hook after_previous || hook_status=$?
  if [ "$hook_status" -ne 0 ]; then
    return "$hook_status"
  fi
  if ! _transaction_state_write committed; then
    _rollback_install_transaction || true
    return 1
  fi
  # Irreversible stale-release cleanup starts only after `committed` is durable.
  _cleanup_committed_previous || return 1
  _discard_transaction || return 1
  return 0
}

recover_install_transaction() {
  local state
  local staged=""
  if [ -L "$TRANSACTION_DIR" ]; then
    echo "ERROR: refusing transaction symlink at $TRANSACTION_DIR" >&2
    return 1
  fi
  [ -d "$TRANSACTION_DIR" ] || return 0
  if [ ! -f "$TRANSACTION_DIR/state" ]; then
    echo "ERROR: transaction directory has no durable state marker: $TRANSACTION_DIR" >&2
    return 1
  fi
  state="$(cat "$TRANSACTION_DIR/state")"
  case "$state" in
    building)
      if [ -f "$TRANSACTION_DIR/staged_release" ]; then
        staged="$(cat "$TRANSACTION_DIR/staged_release")"
      fi
      _remove_managed_release "$staged" || return 1
      _discard_transaction || return 1
      echo "-- cleaned interrupted staged build"
      ;;
    prepared|switched)
      echo "-- recovering interrupted install transaction ($state)"
      _rollback_install_transaction || return 1
      ;;
    committed)
      # Activation completed; only marker cleanup was interrupted. The staged
      # release is now live, so do not treat it as failed.
      _cleanup_committed_previous || return 1
      _discard_transaction || return 1
      ;;
    *)
      echo "ERROR: unknown transaction state '$state'; refusing automatic recovery." >&2
      return 1
      ;;
  esac
}
