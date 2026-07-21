#!/bin/bash -p
# Transactional activation used by install.sh.  The immutable venv release and
# every candidate unit are validated before these functions are called.  This
# file is sourced so the filesystem/systemctl state machine can be tested with a
# fake manager and no root privileges.

if ! type _path_guard >/dev/null 2>&1; then
  _path_guard() {
    /usr/bin/env -i HOME="${INSTALL_ROOT_HOME:-/root}" \
      PATH="${INSTALL_SECURE_PATH:-/usr/sbin:/usr/bin:/sbin:/bin}" \
      "${INSTALL_PATH_GUARD_PYTHON:-/usr/bin/python3}" -I -S \
      "${INSTALL_PATH_GUARD_SCRIPT:?INSTALL_PATH_GUARD_SCRIPT is required}" \
      --anchor "${INSTALL_TRUST_ANCHOR:?INSTALL_TRUST_ANCHOR is required}" \
      --trusted-uid "${INSTALL_TRUSTED_UID:?INSTALL_TRUSTED_UID is required}" \
      --trusted-gid "${INSTALL_TRUSTED_GID:?INSTALL_TRUSTED_GID is required}" \
      "$@"
  }
fi

if ! type _run_privileged_python >/dev/null 2>&1; then
  _run_privileged_python() {
    /usr/bin/env -i HOME="${INSTALL_ROOT_HOME:-/root}" \
      PATH="${INSTALL_SECURE_PATH:-/usr/sbin:/usr/bin:/sbin:/bin}" \
      "${PYTHON:-/usr/bin/python3}" -I -S "$@"
  }
fi

_assert_transaction_dir_trusted() {
  _path_guard validate-trusted-dir --path "$TRANSACTION_DIR"
}

_prepare_isolated_source_build() {
  local source="$1"
  local destination="$TRANSACTION_DIR/source-build"

  _assert_transaction_dir_trusted || return 1
  _path_guard validate-source-tree --source-dir "$source" || return 1
  if [ -e "$destination" ] || [ -L "$destination" ]; then
    echo "ERROR: refusing pre-existing transaction source build: $destination" >&2
    return 1
  fi
  install -d -m 0700 "$destination" || return 1
  cp -a -- "$source/." "$destination/" || return 1
  _path_guard validate-source-copy \
    --source-dir "$source" --copy-dir "$destination" || return 1
  printf '%s\n' "$destination"
}

_trusted_transaction_file_read() {
  local path="$1"
  _path_guard read-trusted-file --root "$TRANSACTION_DIR" --path "$path"
}

_transaction_value_read() {
  local name="$1"
  case "$name" in
    ""|*/*|*..*)
      echo "ERROR: unsafe transaction marker name: $name" >&2
      return 1
      ;;
  esac
  _trusted_transaction_file_read "$TRANSACTION_DIR/$name"
}

_transaction_value_exists() {
  local name="$1"
  [ -e "$TRANSACTION_DIR/$name" ] || [ -L "$TRANSACTION_DIR/$name" ]
}

_trusted_transaction_file_validate() {
  _trusted_transaction_file_read "$1" >/dev/null
}

_managed_unit_target_allowed() {
  local candidate="$1"
  local allowed
  if ! declare -p MANAGED_UNIT_TARGETS >/dev/null 2>&1; then
    echo "ERROR: MANAGED_UNIT_TARGETS is unavailable during recovery." >&2
    return 1
  fi
  for allowed in "${MANAGED_UNIT_TARGETS[@]}"; do
    if [ "$candidate" = "$allowed" ]; then
      return 0
    fi
  done
  echo "ERROR: snapshot unit target is outside MANAGED_UNIT_TARGETS: $candidate" >&2
  return 1
}

_worker_active_state() {
  local load_state
  local state
  if ! state="$(systemctl show --property=ActiveState --value "$WORKER_SERVICE")"; then
    if load_state="$(systemctl show --property=LoadState --value \
      "$WORKER_SERVICE" 2>/dev/null)" && [ "$load_state" = not-found ]; then
      printf 'not-found\n'
      return 0
    fi
    echo "ERROR: could not inspect ActiveState/LoadState for $WORKER_SERVICE." >&2
    return 1
  fi
  case "$state" in
    active|inactive|failed|activating|deactivating|reloading|not-found) ;;
    *)
      echo "ERROR: unexpected ActiveState for $WORKER_SERVICE: $state" >&2
      return 1
      ;;
  esac
  printf '%s\n' "$state"
}

_require_worker_quiescent() {
  local state
  state="$(_worker_active_state)" || return 1
  case "$state" in
    inactive|failed|not-found) return 0 ;;
    *)
      echo "ERROR: $WORKER_SERVICE did not quiesce (ActiveState=$state)." >&2
      return 1
      ;;
  esac
}

_require_no_service_processes() {
  local pids
  local status
  if ! command -v pgrep >/dev/null 2>&1; then
    echo "ERROR: pgrep is required to prove no ${SVC_USER:-patina} process can mutate legacy .venv." >&2
    return 1
  fi
  if pids="$(pgrep -u "${SVC_USER:-patina}")"; then
    echo "ERROR: refusing legacy migration while ${SVC_USER:-patina} processes remain: $pids" >&2
    return 1
  else
    status=$?
  fi
  if [ "$status" -ne 1 ]; then
    echo "ERROR: could not inspect ${SVC_USER:-patina} processes (pgrep status $status)." >&2
    return 1
  fi
}

_validate_managed_release_path() {
  _path_guard validate-release-name --app-dir "$APP_DIR" --path "$1" >/dev/null
}

_resolve_managed_release_link() {
  _path_guard resolve-release-link --app-dir "$APP_DIR" --path "$1"
}

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
  _run_privileged_python -c \
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
    _run_privileged_python -c \
      'import os, sys
directory = os.path.dirname(sys.argv[1]) or "."
fd = os.open(directory, os.O_RDONLY)
try: os.fsync(fd)
finally: os.close(fd)' "$path"
  fi
}

_fsync_transaction_snapshot() {
  _run_privileged_python -c \
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
  _run_privileged_python -c \
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
  local destination_parent="${destination%/*}"
  local temporary="${destination}.patina-txn.$$"

  if [ "$destination_parent" = "$destination" ]; then
    destination_parent=.
  fi
  install -d "$destination_parent" || return 1
  install -m 0644 "$source" "$temporary" || return 1
  if ! _atomic_replace_path "$temporary" "$destination"; then
    _durable_unlink "$temporary"
    return 1
  fi
}

_managed_release_is_referenced() {
  local target="$1"
  local reference
  local reference_target
  for reference in "$VENV" "$PREVIOUS_VENV"; do
    if [ -L "$reference" ]; then
      reference_target="$(_resolve_managed_release_link "$reference")" || return 2
      if [ "$reference_target" = "$target" ]; then
        return 0
      fi
    fi
  done
  return 1
}

_remove_managed_release() {
  local target="${1:-}"
  local reference_status

  [ -n "$APP_DIR" ] && [ "$APP_DIR" != "/" ] || return 1
  [ -n "$target" ] || return 0
  if ! _validate_managed_release_path "$target"; then
    echo "ERROR: refusing unmanaged release path $target" >&2
    return 1
  fi
  if _managed_release_is_referenced "$target"; then
    return 0
  else
    reference_status=$?
  fi
  [ "$reference_status" -eq 1 ] || return 1
  rm -rf -- "$target" || return 1
  _fsync_directory "$APP_DIR"
}

_discard_transaction() {
  if [ -z "$TRANSACTION_PARENT" ] || [ "$TRANSACTION_PARENT" = "/" ] || \
     [ "$TRANSACTION_DIR" != "$TRANSACTION_PARENT/.scan-worker-install-transaction" ]; then
    echo "ERROR: refusing to remove unexpected transaction path $TRANSACTION_DIR" >&2
    return 1
  fi
  _assert_transaction_dir_trusted || return 1
  rm -rf -- "$TRANSACTION_DIR" || return 1
  _fsync_directory "$TRANSACTION_PARENT"
}

prepare_install_transaction() {
  if [ -e "$TRANSACTION_DIR" ] || [ -L "$TRANSACTION_DIR" ]; then
    echo "ERROR: install transaction already exists at $TRANSACTION_DIR; recover it first." >&2
    return 1
  fi
  install -d -m 0700 "$TRANSACTION_DIR" || return 1
  _assert_transaction_dir_trusted || return 1
  _fsync_directory "$TRANSACTION_PARENT" || return 1
  _transaction_state_write building || return 1
  # The state marker precedes all build work. If power fails before this value
  # lands, recovery can safely discard an empty building transaction; the stage
  # is not created until prepare_install_transaction returns.
  _transaction_value_write staged_release "${STAGED_VENV:-}" || return 1
}

_snapshot_release() {
  local resolved
  if [ -L "$VENV" ]; then
    _transaction_value_write release_kind symlink || return 1
    resolved="$(_resolve_managed_release_link "$VENV")" || return 1
    _transaction_value_write release_target "$resolved" || return 1
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
    resolved="$(_resolve_managed_release_link "$PREVIOUS_VENV")" || return 1
    _transaction_value_write previous_target "$resolved" || return 1
  elif [ -d "$PREVIOUS_VENV" ]; then
    echo "ERROR: obsolete real-directory $PREVIOUS_VENV cannot be used as a rollback source." >&2
    echo "       Stop all patina processes, review and move/archive that backup outside" >&2
    echo "       $APP_DIR, then rerun the installer; nothing was deleted." >&2
    return 1
  elif [ -e "$PREVIOUS_VENV" ]; then
    echo "ERROR: $PREVIOUS_VENV is neither a managed symlink nor absent." >&2
    return 1
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
    _managed_unit_target_allowed "$target" || return 1
    printf '%s\n' "$target" > "$TRANSACTION_DIR/snapshot/unit.$index.target" || return 1
    chmod 0600 "$TRANSACTION_DIR/snapshot/unit.$index.target" || return 1
    if [ -L "$target" ]; then
      echo "ERROR: refusing to snapshot symlinked managed unit: $target" >&2
      return 1
    elif [ -f "$target" ]; then
      printf '1\n' > "$TRANSACTION_DIR/snapshot/unit.$index.present" || return 1
      chmod 0600 "$TRANSACTION_DIR/snapshot/unit.$index.present" || return 1
      cp -p "$target" "$TRANSACTION_DIR/snapshot/unit.$index.content" || return 1
      chmod 0600 "$TRANSACTION_DIR/snapshot/unit.$index.content" || return 1
    else
      printf '0\n' > "$TRANSACTION_DIR/snapshot/unit.$index.present" || return 1
      chmod 0600 "$TRANSACTION_DIR/snapshot/unit.$index.present" || return 1
    fi
    index=$((index + 1))
  done
  _transaction_value_write unit_count "$index" || return 1
}

begin_install_transaction() {
  local active_state
  local transaction_state
  local was_active=0

  transaction_state="$(_transaction_value_read state)" || return 1
  [ "$transaction_state" = building ] || {
    echo "ERROR: transaction is not in building state." >&2
    return 1
  }
  if [ "${#MANAGED_UNIT_TARGETS[@]}" -ne "${#CANDIDATE_UNIT_PATHS[@]}" ]; then
    echo "ERROR: managed/candidate unit lists differ in length." >&2
    return 1
  fi
  _snapshot_release || return 1
  _snapshot_units || return 1
  active_state="$(_worker_active_state)" || return 1
  case "$active_state" in
    active) was_active=1 ;;
    inactive|failed|not-found) was_active=0 ;;
    activating|deactivating|reloading)
      echo "ERROR: refusing install while $WORKER_SERVICE is $active_state; " \
        "wait for a stable ActiveState or stop it explicitly." >&2
      return 1
      ;;
  esac
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
    _transaction_hook "after_unit_$index" || return $?
  done
}

_validate_legacy_materialized_release() {
  _path_guard validate-release \
    --app-dir "$APP_DIR" \
    --path "$1" \
    --require-executables >/dev/null
}

_smoke_legacy_materialized_release() {
  local release="$1"
  if ! type _run_as_service_user >/dev/null 2>&1; then
    echo "ERROR: service-user runner is unavailable for legacy release smoke." >&2
    return 1
  fi
  _run_as_service_user "$release/bin/python" -I -c \
    'import patina_scan_worker' || return 1
  # A copied console script usually retains a #! path through stable `.venv`.
  # Invoke it explicitly with the fresh interpreter so this smoke remains valid
  # both before quarantine and while stable `.venv` is intentionally absent.
  _run_as_service_user \
    "$release/bin/python" -I "$release/bin/patina-scan-worker" --help >/dev/null
}

_record_legacy_materialization_paths() {
  local interpreter
  local materialized
  local quarantine

  if _transaction_value_exists legacy_quarantine; then
    quarantine="$(_transaction_value_read legacy_quarantine)" || return 1
    _path_guard validate-quarantine-name \
      --app-dir "$APP_DIR" --path "$quarantine" >/dev/null || return 1
  else
    quarantine="$(_path_guard generate-quarantine-path --app-dir "$APP_DIR")" || return 1
    _transaction_value_write legacy_quarantine "$quarantine" || return 1
  fi

  if _transaction_value_exists legacy_materialized_release; then
    materialized="$(_transaction_value_read legacy_materialized_release)" || return 1
    _validate_managed_release_path "$materialized" || return 1
  else
    materialized="$(_path_guard generate-release-path --app-dir "$APP_DIR")" || return 1
    _transaction_value_write legacy_materialized_release "$materialized" || return 1
  fi

  if _transaction_value_exists legacy_interpreter; then
    interpreter="$(_transaction_value_read legacy_interpreter)" || return 1
    interpreter="$(_path_guard validate-trusted-executable --path "$interpreter")" || return 1
  else
    interpreter="$(_path_guard validate-trusted-executable \
      --path "${PYTHON:?PYTHON is required for legacy materialization}")" || return 1
    _transaction_value_write legacy_interpreter "$interpreter" || return 1
  fi
}

_seal_legacy_quarantine() {
  _path_guard seal-legacy-quarantine \
    --app-dir "$APP_DIR" --quarantine "$1"
}

_prepare_legacy_materialization() {
  local hook_status
  local interpreter
  local kind
  local materialized
  local quarantine
  local ready
  local status

  kind="$(_transaction_value_read release_kind)" || return 1
  [ "$kind" = legacy ] || return 0
  _require_no_service_processes || return 1
  _record_legacy_materialization_paths || return 1
  quarantine="$(_transaction_value_read legacy_quarantine)" || return 1
  materialized="$(_transaction_value_read legacy_materialized_release)" || return 1
  interpreter="$(_transaction_value_read legacy_interpreter)" || return 1

  if _transaction_value_exists legacy_materialized_ready; then
    ready="$(_transaction_value_read legacy_materialized_ready)" || return 1
    if [ "$ready" != 1 ]; then
      echo "ERROR: invalid legacy materialization ready marker: $ready" >&2
      return 1
    fi
    if [ -d "$VENV" ] && [ ! -L "$VENV" ]; then
      echo "ERROR: raw $VENV exists after durable materialization readiness." >&2
      return 1
    fi
    if [ ! -d "$quarantine" ] || [ -L "$quarantine" ]; then
      echo "ERROR: ready legacy transaction is missing its real quarantine; refusing recovery." >&2
      return 1
    fi
    _seal_legacy_quarantine "$quarantine" || return 1
    # After ready, a missing or altered fresh release is fatal. Never recreate it
    # from the service-controlled quarantine and never restore the raw tree.
    _validate_legacy_materialized_release "$materialized" || {
      echo "ERROR: ready legacy materialization is missing/untrusted; transaction retained." >&2
      return 1
    }
    _smoke_legacy_materialized_release "$materialized" || {
      echo "ERROR: ready legacy materialization failed service-user smoke; transaction retained." >&2
      return 1
    }
    _require_no_service_processes || return 1
    return 0
  fi

  if [ -d "$VENV" ] && [ ! -L "$VENV" ]; then
    if [ -e "$quarantine" ] || [ -L "$quarantine" ]; then
      echo "ERROR: both raw legacy and quarantine paths exist; refusing recovery." >&2
      return 1
    fi
    # A crash or failed policy/copy check before quarantine leaves ordinary
    # prestate. Discard any incomplete/unready destination and perform the full
    # fresh-inode copy, validation, fsync, and service-user smoke again.
    _remove_managed_release "$materialized" || return 1
    _path_guard materialize-legacy-release \
      --app-dir "$APP_DIR" \
      --source "$VENV" \
      --destination "$materialized" \
      --interpreter "$interpreter" >/dev/null || {
        status=$?
        _remove_managed_release "$materialized" || true
        echo "ERROR: legacy materialization failed before quarantine; raw release was not restarted." >&2
        return "$status"
      }
    _smoke_legacy_materialized_release "$materialized" || {
      status=$?
      _remove_managed_release "$materialized" || true
      echo "ERROR: fresh legacy materialization failed service-user smoke before quarantine." >&2
      return "$status"
    }
    _transaction_hook before_legacy_quarantine || {
      hook_status=$?
      return "$hook_status"
    }
    # Legacy code just ran as the service UID. It must not have daemonized or
    # retained a directory fd across the ownership/quarantine handoff.
    _require_no_service_processes || return 1
    _path_guard quarantine-legacy-release \
      --app-dir "$APP_DIR" \
      --source "$VENV" \
      --quarantine "$quarantine" >/dev/null || return 1
    _seal_legacy_quarantine "$quarantine" || return 1
    # This hook emulates power loss after the durable one-way rename and before
    # any separate completion flag. Filesystem pair state is the recovery record.
    _transaction_hook after_legacy_quarantine || {
      hook_status=$?
      return "$hook_status"
    }
  elif [ ! -e "$VENV" ] && [ ! -L "$VENV" ] && \
       [ -d "$quarantine" ] && [ ! -L "$quarantine" ]; then
    # Rename completed but ready did not. The copy was fully validated/fsynced
    # before that rename. The original guard may have died between rename(2)
    # and its parent fsync, so force that durability boundary before readiness.
    _seal_legacy_quarantine "$quarantine" || return 1
    _fsync_directory "$APP_DIR" || return 1
    if [ -e "$VENV" ] || [ -L "$VENV" ] || \
       [ ! -d "$quarantine" ] || [ -L "$quarantine" ]; then
      echo "ERROR: legacy raw/quarantine pair changed while making rename durable." >&2
      return 1
    fi
    # Revalidate and smoke it, then synthesize readiness.
    _validate_legacy_materialized_release "$materialized" || {
      echo "ERROR: post-quarantine materialization is missing/untrusted; transaction retained." >&2
      return 1
    }
    _smoke_legacy_materialized_release "$materialized" || {
      echo "ERROR: post-quarantine materialization failed service-user smoke." >&2
      return 1
    }
    _require_no_service_processes || return 1
  else
    echo "ERROR: inconsistent raw/quarantine pair for legacy transaction; refusing recovery." >&2
    return 1
  fi

  _validate_legacy_materialized_release "$materialized" || return 1
  _transaction_value_write legacy_materialized_ready 1 || return 1
}

_cleanup_legacy_quarantine() {
  local kind
  local quarantine
  kind="$(_transaction_value_read release_kind)" || return 1
  case "$kind" in
    legacy)
      quarantine="$(_transaction_value_read legacy_quarantine)" || return 1
      _path_guard remove-legacy-quarantine \
        --app-dir "$APP_DIR" --quarantine "$quarantine"
      ;;
    symlink|absent) return 0 ;;
    *)
      echo "ERROR: unknown release kind during quarantine cleanup: $kind" >&2
      return 1
      ;;
  esac
}

_switch_release() {
  local kind
  local ready
  kind="$(_transaction_value_read release_kind)" || return 1
  _validate_managed_release_path "$STAGED_VENV" || return 1

  case "$kind" in
    symlink|absent)
      _atomic_symlink_replace "$STAGED_VENV" "$VENV"
      ;;
    legacy)
      if [ -d "$VENV" ] && [ ! -L "$VENV" ]; then
        echo "ERROR: refusing candidate link over unquarantined raw $VENV." >&2
        return 1
      fi
      ready="$(_transaction_value_read legacy_materialized_ready)" || return 1
      [ "$ready" = 1 ] || return 1
      _atomic_symlink_replace "$STAGED_VENV" "$VENV"
      ;;
    *)
      echo "ERROR: unknown saved release kind: $kind" >&2
      return 1
      ;;
  esac
}

_restore_units() {
  local count
  local index
  local present
  local target
  count="$(_transaction_value_read unit_count)" || return 1
  case "$count" in
    ""|*[!0-9]*)
      echo "ERROR: invalid unit_count marker: $count" >&2
      return 1
      ;;
  esac
  if [ "$count" -gt "${#MANAGED_UNIT_TARGETS[@]}" ]; then
    echo "ERROR: unit_count exceeds MANAGED_UNIT_TARGETS." >&2
    return 1
  fi
  for ((index = 0; index < count; index++)); do
    target="$(_trusted_transaction_file_read \
      "$TRANSACTION_DIR/snapshot/unit.$index.target")" || return 1
    present="$(_trusted_transaction_file_read \
      "$TRANSACTION_DIR/snapshot/unit.$index.present")" || return 1
    _managed_unit_target_allowed "$target" || return 1
    if [ "$present" = 1 ]; then
      _trusted_transaction_file_validate \
        "$TRANSACTION_DIR/snapshot/unit.$index.content" || return 1
      _atomic_file_replace \
        "$TRANSACTION_DIR/snapshot/unit.$index.content" "$target" || return 1
    elif [ "$present" = 0 ]; then
      _durable_unlink "$target" || return 1
    else
      echo "ERROR: invalid unit presence marker for $target: $present" >&2
      return 1
    fi
  done
}

_restore_release() {
  local kind
  local materialized=""
  local ready
  local target
  kind="$(_transaction_value_read release_kind)" || return 1
  target="$(_transaction_value_read release_target)" || return 1

  case "$kind" in
    symlink)
      _validate_managed_release_path "$target" || return 1
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
        echo "ERROR: raw legacy $VENV was never quarantined; refusing rollback restart." >&2
        return 1
      fi
      ready="$(_transaction_value_read legacy_materialized_ready)" || return 1
      [ "$ready" = 1 ] || return 1
      materialized="$(_transaction_value_read legacy_materialized_release)" || return 1
      _validate_legacy_materialized_release "$materialized" || return 1
      _atomic_symlink_replace "$materialized" "$VENV"
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
  kind="$(_transaction_value_read previous_kind)" || return 1
  target="$(_transaction_value_read previous_target)" || return 1

  case "$kind" in
    symlink)
      if [ -e "$PREVIOUS_VENV" ] && [ ! -L "$PREVIOUS_VENV" ]; then
        echo "ERROR: cannot restore previous symlink over $PREVIOUS_VENV" >&2
        return 1
      fi
      _validate_managed_release_path "$target" || return 1
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
      echo "ERROR: real-directory previous release is unsupported and will not be restored." >&2
      return 1
      ;;
    *)
      echo "ERROR: unknown saved previous release kind: $kind" >&2
      return 1
      ;;
  esac
}

_cleanup_failed_stage() {
  local staged=""
  if _transaction_value_exists staged_release; then
    staged="$(_transaction_value_read staged_release)" || return 1
  fi
  _remove_managed_release "$staged"
}

_rollback_install_transaction() {
  local active_state
  local was_active
  local failed=0
  was_active="$(_transaction_value_read was_active)" || return 1
  case "$was_active" in
    0|1) ;;
    *) echo "ERROR: invalid was_active marker: $was_active" >&2; return 1 ;;
  esac

  # A fresh-install prepared transaction can predate the first loaded unit.
  # Stop only a live/transitional service; inactive, failed, and not-found are
  # already safe for file restoration.
  active_state="$(_worker_active_state)" || return 1
  case "$active_state" in
    inactive|failed|not-found) ;;
    *)
      if ! systemctl stop "$WORKER_SERVICE" >/dev/null 2>&1 || \
         ! _require_worker_quiescent; then
        echo "ERROR: rollback could not quiesce $WORKER_SERVICE; transaction retained." >&2
        return 1
      fi
      ;;
  esac
  # Legacy rollback cannot write units or restart anything until a fresh,
  # validated materialization exists and the raw tree has crossed the one-way
  # quarantine boundary.
  _prepare_legacy_materialization || return 1
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

  # Make quarantine deletion interruption-safe. `rolled_back` means all live
  # references/units and service posture are already restored from fresh inodes;
  # recovery only finishes idempotent cleanup and never reuses the raw tree.
  _transaction_state_write rolled_back || return 1
  _cleanup_legacy_quarantine || return 1
  _transaction_hook after_legacy_quarantine_cleanup || return $?
  _cleanup_failed_stage || return 1
  _discard_transaction || return 1
  echo "-- rollback restored prior units and release" >&2
  return 0
}

_finalize_previous_release() {
  local kind
  local desired=""
  local old_previous=""
  local ready
  kind="$(_transaction_value_read release_kind)" || return 1

  case "$kind" in
    symlink)
      desired="$(_transaction_value_read release_target)" || return 1
      ;;
    legacy)
      ready="$(_transaction_value_read legacy_materialized_ready)" || return 1
      [ "$ready" = 1 ] || return 1
      desired="$(_transaction_value_read legacy_materialized_release)" || return 1
      ;;
    absent) desired="" ;;
    *)
      echo "ERROR: unknown saved release kind while retaining previous: $kind" >&2
      return 1
      ;;
  esac
  if _transaction_value_exists previous_target; then
    old_previous="$(_transaction_value_read previous_target)" || return 1
  fi

  if [ -d "$PREVIOUS_VENV" ] && [ ! -L "$PREVIOUS_VENV" ]; then
    echo "ERROR: refusing to rename/harden real-directory $PREVIOUS_VENV." >&2
    return 1
  fi
  if [ -n "$desired" ]; then
    _validate_managed_release_path "$desired" || return 1
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
  if _transaction_value_exists obsolete_previous_release; then
    obsolete="$(_transaction_value_read obsolete_previous_release)" || return 1
  fi
  _remove_managed_release "$obsolete"
}

if ! type _transaction_hook >/dev/null 2>&1; then
  _transaction_hook() { return 0; }
fi

activate_install_transaction() {
  local kind
  local was_active
  local hook_status=0
  was_active="$(_transaction_value_read was_active)" || return 1
  kind="$(_transaction_value_read release_kind)" || return 1
  case "$was_active" in
    0|1) ;;
    *) echo "ERROR: invalid was_active marker: $was_active" >&2; return 1 ;;
  esac
  case "$kind" in
    symlink|legacy|absent) ;;
    *) echo "ERROR: unknown saved release kind: $kind" >&2; return 1 ;;
  esac

  if [ "$was_active" = 1 ]; then
    echo "-- stopping active worker after candidate validation and snapshot"
    if ! systemctl stop "$WORKER_SERVICE"; then
      _rollback_install_transaction || true
      return 1
    fi
    if ! _require_worker_quiescent; then
      _rollback_install_transaction || true
      return 1
    fi
  fi

  if [ "$BUILD_VENV" -eq 1 ] && [ "$kind" = legacy ]; then
    # Copy/validate/smoke while raw stable prestate still exists, then perform
    # the durable one-way quarantine rename and write readiness. On failure the
    # service remains stopped and the transaction is retained for safe recovery.
    _require_worker_quiescent || return 1
    _prepare_legacy_materialization || return $?
    _transaction_hook after_legacy_ready || {
      hook_status=$?
      return "$hook_status"
    }
  fi

  if ! _install_candidate_units || ! systemctl daemon-reload; then
    echo "ERROR: candidate unit activation failed; restoring transaction." >&2
    _rollback_install_transaction || true
    return 1
  fi
  _transaction_hook after_candidate_units || {
    hook_status=$?
    return "$hook_status"
  }
  if [ "$BUILD_VENV" -eq 1 ] && ! _switch_release; then
    echo "ERROR: immutable release switch failed; restoring transaction." >&2
    _rollback_install_transaction || true
    return 1
  fi
  _transaction_hook after_release_link || {
    hook_status=$?
    return "$hook_status"
  }
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
  _transaction_hook after_commit || hook_status=$?
  if [ "$hook_status" -ne 0 ]; then
    return "$hook_status"
  fi
  # Irreversible stale-release cleanup starts only after `committed` is durable.
  _cleanup_committed_previous || return 1
  _cleanup_legacy_quarantine || return 1
  _transaction_hook after_legacy_quarantine_cleanup || return $?
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
  [ -e "$TRANSACTION_DIR" ] || return 0
  _assert_transaction_dir_trusted || return 1
  if ! _transaction_value_exists state; then
    echo "ERROR: transaction directory has no durable state marker: $TRANSACTION_DIR" >&2
    return 1
  fi
  state="$(_transaction_value_read state)" || return 1
  case "$state" in
    building)
      if _transaction_value_exists staged_release; then
        staged="$(_transaction_value_read staged_release)" || return 1
      fi
      _remove_managed_release "$staged" || return 1
      _discard_transaction || return 1
      echo "-- cleaned interrupted staged build"
      ;;
    prepared|switched)
      echo "-- recovering interrupted install transaction ($state)"
      _rollback_install_transaction || return 1
      ;;
    rolled_back)
      # Live old state and service posture were durably restored before raw
      # quarantine cleanup began. Finish only idempotent cleanup.
      _cleanup_legacy_quarantine || return 1
      _cleanup_failed_stage || return 1
      _discard_transaction || return 1
      ;;
    committed)
      # Activation completed; only marker cleanup was interrupted. The staged
      # release is now live, so do not treat it as failed.
      _cleanup_committed_previous || return 1
      _cleanup_legacy_quarantine || return 1
      _discard_transaction || return 1
      ;;
    *)
      echo "ERROR: unknown transaction state '$state'; refusing automatic recovery." >&2
      return 1
      ;;
  esac
}
