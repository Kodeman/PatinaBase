#!/usr/bin/env bash
# install.sh — bring up the Patina scan-pipeline worker natively on a Linux box
# (R109.1: native systemd, no Docker required to operate).
#
# Usage:  sudo ./install.sh [--gpu] [--upgrade]
#
#   --gpu       install the GPU stage extras (.[gpu] = refine+fuse+splat via the
#               PyTorch cu118 index), NVIDIA device preparation, and the same
#               GPU policy on the worker and doctor-only units.
#   --upgrade   build a fresh immutable release. Candidate Python + systemd
#               files are checked while the live worker runs, then units and
#               the .venv symlink activate as one recoverable transaction.
#
# Transaction invariants:
#   1. pip check + import/entrypoint smoke + systemd-analyze verify happen first.
#   2. installed unit contents/presence and the current release are snapshotted.
#   3. only then is an active worker stopped and candidate files atomically moved.
#   4. failed activation restores every unit + release, reloads, and restarts.
#   5. a durable marker lets the next invocation recover power loss/SIGKILL.
set -euo pipefail

GPU=0
UPGRADE=0
for arg in "$@"; do
  case "$arg" in
    --gpu)     GPU=1 ;;
    --upgrade) UPGRADE=1 ;;
    -h|--help)
      sed -n '2,19p' "$0"; exit 0 ;;
    *) echo "unknown flag: $arg (see --help)" >&2; exit 2 ;;
  esac
done

APP_DIR=/opt/patina/scan-pipeline
VENV="$APP_DIR/.venv"
# A venv is not relocatable: console-script shebangs embed the build path. Build
# at an immutable final path, then replace only the stable .venv symlink.
STAGED_VENV=""
PREVIOUS_VENV="$APP_DIR/.venv.previous"
FAILED_VENV="$APP_DIR/.venv.failed"
ETC_DIR=/etc/patina
TRANSACTION_PARENT="$ETC_DIR"
TRANSACTION_DIR="$TRANSACTION_PARENT/.scan-worker-install-transaction"
ENV_FILE="$ETC_DIR/scan-worker.env"
WORK_DIR=/var/lib/patina/scan-work
WORK_PARENT=/var/lib/patina
SYSTEMD_DIR=/etc/systemd/system
UNIT="$SYSTEMD_DIR/patina-scan-worker.service"
DOCTOR_UNIT="$SYSTEMD_DIR/patina-scan-worker-doctor.service"
DROPIN_DIR="$SYSTEMD_DIR/patina-scan-worker.service.d"
DOCTOR_DROPIN_DIR="$SYSTEMD_DIR/patina-scan-worker-doctor.service.d"
NVIDIA_PREPARE_UNIT="$SYSTEMD_DIR/patina-scan-worker-nvidia-prepare.service"
NVIDIA_MODPROBE=/usr/bin/nvidia-modprobe
WORKER_SERVICE=patina-scan-worker
SVC_USER=patina
SRC_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PYTHON="${PYTHON:-python3}"
PATH_GUARD_PYTHON=/usr/bin/python3
PATH_GUARD="$SRC_DIR/install-path-guard.py"
RUNUSER=/usr/sbin/runuser
INSTALL_TRUST_ANCHOR=/
INSTALL_TRUSTED_UID=0
INSTALL_TRUSTED_GID=0
# shellcheck source=install-venv-lib.sh
. "$SRC_DIR/install-venv-lib.sh"

_path_guard() {
  "$PATH_GUARD_PYTHON" "$PATH_GUARD" \
    --anchor "$INSTALL_TRUST_ANCHOR" \
    --trusted-uid "$INSTALL_TRUSTED_UID" \
    --trusted-gid "$INSTALL_TRUSTED_GID" \
    "$@"
}

_harden_managed_release() {
  _path_guard harden-release --app-dir "$APP_DIR" --path "$1" >/dev/null
}

_run_as_service_user() {
  "$RUNUSER" --user "$SVC_USER" -- \
    env -i \
      HOME="$APP_DIR" \
      PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin \
      XDG_CONFIG_HOME="$APP_DIR/.config" \
      XDG_CACHE_HOME="$APP_DIR/.cache" \
      XDG_DATA_HOME="$APP_DIR/.data" \
      XDG_STATE_HOME="$APP_DIR/.state" \
      PYTHONDONTWRITEBYTECODE=1 \
      "$@"
}

_recover_on_exit() {
  local status=$?
  trap - EXIT
  if [ "$status" -ne 0 ] && [ -d "$TRANSACTION_DIR" ]; then
    recover_install_transaction || true
  fi
  exit "$status"
}
trap _recover_on_exit EXIT

if [ "${EUID:-$(id -u)}" -ne 0 ]; then
  echo "ERROR: install.sh must run as root (use sudo)." >&2
  exit 2
fi
if [ ! -x "$PATH_GUARD_PYTHON" ] || [ ! -f "$PATH_GUARD" ]; then
  echo "ERROR: installer path guard unavailable ($PATH_GUARD_PYTHON, $PATH_GUARD)." >&2
  exit 2
fi
if [ ! -x "$RUNUSER" ]; then
  echo "ERROR: service-user smoke requires $RUNUSER (util-linux)." >&2
  exit 2
fi

# Recovery metadata is privileged input. Establish a real, root-owned,
# non-group/world-writable parent before reading any prior marker.
_path_guard ensure-trusted-dir --path "$ETC_DIR" --mode 0750

# Recover before evaluating live GPU policy: an interrupted prior transaction
# may have installed only one of its candidate drop-ins.
recover_install_transaction

# Fail closed BEFORE touching apt, users, dirs, venvs, env, or units. Rebuilding
# an existing GPU install without --gpu would retain device policy but omit its
# Python dependencies.
if [ "$UPGRADE" -eq 1 ] && [ "$GPU" -eq 0 ] && [ -f "$DROPIN_DIR/gpu.conf" ]; then
  echo "ERROR: refusing to rebuild an existing GPU worker as CPU-only by omission." >&2
  echo "       Re-run with: sudo ./install.sh --gpu --upgrade" >&2
  exit 2
fi
if [ "$GPU" -eq 0 ] && [ -f "$DROPIN_DIR/gpu.conf" ] && \
   [ ! -f "$DOCTOR_DROPIN_DIR/gpu.conf" ]; then
  echo "ERROR: this pre-doctor GPU install needs one explicit --gpu run so both" >&2
  echo "       systemd contexts receive the same transactional GPU policy." >&2
  exit 2
fi

# The GPU prepare unit calls this exact executable as root. Validate it before
# any install-side mutation.
if [ "$GPU" -eq 1 ] && [ ! -x "$NVIDIA_MODPROBE" ]; then
  echo "ERROR: --gpu requires executable $NVIDIA_MODPROBE." >&2
  echo "       Install the NVIDIA driver's nvidia-modprobe package first." >&2
  exit 2
fi

echo "== Patina scan-pipeline worker install (gpu=$GPU upgrade=$UPGRADE) =="
echo "source: $SRC_DIR"

# 0. native libs — cairosvg (PDF sheets, item 11) needs libcairo2
if command -v apt-get >/dev/null 2>&1; then
  echo "-- ensuring libcairo2 is present (cairosvg → PDF)"
  apt-get install -y --no-install-recommends libcairo2 >/dev/null 2>&1 || \
    echo "   (could not apt-get libcairo2 — install it manually if PDF rendering fails)"
fi
if [ "$GPU" -eq 1 ] && ! command -v nvidia-smi >/dev/null 2>&1; then
  echo "   WARNING: --gpu given but nvidia-smi not found. Install the NVIDIA driver"
  echo "            + CUDA 11.8 toolkit (nvcc, for gsplat's JIT build) first."
fi

# 1. service user + root-owned executable namespace + delegated writable dirs
if ! id -u "$SVC_USER" >/dev/null 2>&1; then
  echo "-- creating service user '$SVC_USER'"
  useradd --system --no-create-home --shell /usr/sbin/nologin "$SVC_USER"
fi
SVC_UID="$(id -u "$SVC_USER")"
SVC_GID="$(id -g "$SVC_USER")"

# /opt/patina and APP_DIR are an executable trust boundary. The one-time
# --adopt-final transition accepts the old installer-created real APP_DIR, but
# never a symlink and never an untrusted parent. All future release entries are
# created below the root-owned, non-writable namespace.
_path_guard ensure-trusted-dir --path "$(dirname "$APP_DIR")" --mode 0755
_path_guard ensure-trusted-dir --path "$APP_DIR" --mode 0755 --adopt-final
_path_guard ensure-trusted-dir --path "$WORK_PARENT" --mode 0755
_path_guard ensure-owned-dir --app-dir "$WORK_PARENT" --path "$WORK_DIR" \
  --owner-uid "$SVC_UID" --owner-gid "$SVC_GID" --mode 0750
for writable_dir in \
  "$APP_DIR/.config" "$APP_DIR/.cache" "$APP_DIR/.data" "$APP_DIR/.state"; do
  _path_guard ensure-owned-dir --app-dir "$APP_DIR" --path "$writable_dir" \
    --owner-uid "$SVC_UID" --owner-gid "$SVC_GID" --mode 0750
done
if [ "$GPU" -eq 1 ]; then
  for writable_dir in \
    "$APP_DIR/.cache/torch" "$APP_DIR/.cache/nv" \
    "$APP_DIR/.cache/torch_extensions"; do
    _path_guard ensure-owned-dir --app-dir "$APP_DIR" --path "$writable_dir" \
      --owner-uid "$SVC_UID" --owner-gid "$SVC_GID" --mode 0750
  done
fi

# Existing stable/previous symlinks must stay inside the managed immutable
# namespace. Harden old installer releases before any service-user execution;
# the no-follow guard revokes patina writes without traversing internal links.
if [ -L "$VENV" ]; then
  _path_guard harden-release --app-dir "$APP_DIR" --path "$VENV" --stable-link >/dev/null
fi
if [ -L "$PREVIOUS_VENV" ]; then
  _path_guard harden-release --app-dir "$APP_DIR" --path "$PREVIOUS_VENV" \
    --stable-link >/dev/null
fi

# A fresh install, explicit upgrade, CPU→GPU conversion, broken link, or legacy
# real-directory .venv builds a clean release. The legacy case is converted once
# during the recoverable activation window.
BUILD_VENV=0
if [ ! -d "$VENV" ] || [ ! -L "$VENV" ] || [ "$UPGRADE" -eq 1 ]; then
  BUILD_VENV=1
elif [ "$GPU" -eq 1 ] && [ ! -f "$DROPIN_DIR/gpu.conf" ]; then
  BUILD_VENV=1
fi
if [ "$BUILD_VENV" -eq 1 ] && [ "$GPU" -eq 0 ] && [ -f "$DROPIN_DIR/gpu.conf" ]; then
  echo "ERROR: this GPU install needs --gpu whenever its Python release is rebuilt." >&2
  exit 2
fi

if [ "$BUILD_VENV" -eq 1 ]; then
  # Generate only a high-entropy final name now. prepare_install_transaction
  # durably records it before create-release performs the atomic mkdir.
  STAGED_VENV="$(_path_guard generate-release-path --app-dir "$APP_DIR")"
fi

# From this point, every failure is either cleaned by the EXIT trap or recovered
# from the durable marker by the next invocation.
prepare_install_transaction
CANDIDATE_SYSTEMD_DIR="$TRANSACTION_DIR/candidate-systemd"
install -d "$CANDIDATE_SYSTEMD_DIR"

# 2. immutable Python candidate + dependency/import/entrypoint smoke
SMOKE_VENV="$VENV"
if [ "$BUILD_VENV" -eq 1 ]; then
  _path_guard create-release --app-dir "$APP_DIR" --path "$STAGED_VENV"
  echo "-- building staged venv at $STAGED_VENV ($($PYTHON --version 2>&1))"
  "$PYTHON" -m venv "$STAGED_VENV"
  "$STAGED_VENV/bin/pip" install --upgrade pip >/dev/null
  if [ "$GPU" -eq 1 ]; then
    echo "-- pip install $SRC_DIR[drawings,gpu] via PyTorch cu118 index"
    "$STAGED_VENV/bin/pip" install \
      --extra-index-url https://download.pytorch.org/whl/cu118 \
      "$SRC_DIR[drawings,gpu]"
  else
    echo "-- pip install $SRC_DIR[drawings] (CPU-only)"
    "$STAGED_VENV/bin/pip" install "$SRC_DIR[drawings]"
  fi
  "$STAGED_VENV/bin/pip" check
  _path_guard harden-release --app-dir "$APP_DIR" --path "$STAGED_VENV" >/dev/null
  SMOKE_VENV="$STAGED_VENV"
else
  echo "-- existing venv left untouched (use --upgrade to rebuild from source)"
fi
if [ "$SMOKE_VENV" = "$VENV" ]; then
  _path_guard validate-release --app-dir "$APP_DIR" --path "$SMOKE_VENV" \
    --stable-link --require-executables >/dev/null
else
  _path_guard validate-release --app-dir "$APP_DIR" --path "$SMOKE_VENV" \
    --require-executables >/dev/null
fi
echo "-- smoke-checking package imports and console entrypoint"
_run_as_service_user "$SMOKE_VENV/bin/python" -c \
  'import patina_scan_worker; import patina_scan_worker.cli; import patina_scan_worker.doctor'
_run_as_service_user "$SMOKE_VENV/bin/patina-scan-worker" --help >/dev/null

# 3. stage a complete candidate systemd tree. Nothing under /etc/systemd is
# replaced until after verify + the rollback snapshot.
install -m 0644 "$SRC_DIR/patina-scan-worker.service" \
  "$CANDIDATE_SYSTEMD_DIR/patina-scan-worker.service"
install -m 0644 "$SRC_DIR/patina-scan-worker-doctor.service" \
  "$CANDIDATE_SYSTEMD_DIR/patina-scan-worker-doctor.service"

MANAGED_UNIT_TARGETS=("$UNIT" "$DOCTOR_UNIT")
CANDIDATE_UNIT_PATHS=(
  "$CANDIDATE_SYSTEMD_DIR/patina-scan-worker.service"
  "$CANDIDATE_SYSTEMD_DIR/patina-scan-worker-doctor.service"
)
VERIFY_UNITS=(patina-scan-worker.service patina-scan-worker-doctor.service)

if [ "$GPU" -eq 1 ]; then
  install -d \
    "$CANDIDATE_SYSTEMD_DIR/patina-scan-worker.service.d" \
    "$CANDIDATE_SYSTEMD_DIR/patina-scan-worker-doctor.service.d"
  install -m 0644 "$SRC_DIR/patina-scan-worker.gpu.conf" \
    "$CANDIDATE_SYSTEMD_DIR/patina-scan-worker.service.d/gpu.conf"
  install -m 0644 "$SRC_DIR/patina-scan-worker.gpu.conf" \
    "$CANDIDATE_SYSTEMD_DIR/patina-scan-worker-doctor.service.d/gpu.conf"
  install -m 0644 "$SRC_DIR/patina-scan-worker-nvidia-prepare.service" \
    "$CANDIDATE_SYSTEMD_DIR/patina-scan-worker-nvidia-prepare.service"
  MANAGED_UNIT_TARGETS+=(
    "$DROPIN_DIR/gpu.conf"
    "$DOCTOR_DROPIN_DIR/gpu.conf"
    "$NVIDIA_PREPARE_UNIT"
  )
  CANDIDATE_UNIT_PATHS+=(
    "$CANDIDATE_SYSTEMD_DIR/patina-scan-worker.service.d/gpu.conf"
    "$CANDIDATE_SYSTEMD_DIR/patina-scan-worker-doctor.service.d/gpu.conf"
    "$CANDIDATE_SYSTEMD_DIR/patina-scan-worker-nvidia-prepare.service"
  )
  VERIFY_UNITS+=(patina-scan-worker-nvidia-prepare.service)
fi

verify_candidate_units() {
  if [ "$(uname -s)" != Linux ]; then
    echo "-- non-Linux authoring host: systemd-analyze verify deferred to target"
    return 0
  fi
  if ! command -v systemd-analyze >/dev/null 2>&1; then
    echo "ERROR: Linux activation requires systemd-analyze verify." >&2
    return 1
  fi
  echo "-- verifying merged candidate systemd units/drop-ins"
  env SYSTEMD_UNIT_PATH="$CANDIDATE_SYSTEMD_DIR:" \
    systemd-analyze verify "${VERIFY_UNITS[@]}"
}
verify_candidate_units

# PID 1 reads EnvironmentFile before dropping to User=patina. Keep the service
# credential root-owned and unreadable by the worker process itself.
if [ ! -f "$ENV_FILE" ]; then
  echo "-- installing env template -> $ENV_FILE (edit URL/key/WORKER_ID/STAGES)"
  install -o root -g root -m 0600 "$SRC_DIR/scan-worker.env.example" "$ENV_FILE"
else
  echo "-- $ENV_FILE exists; leaving it untouched"
fi

# 4. Snapshot installed units + release, then activate the whole candidate as a
# single transaction. Active activation is proven by the worker's ExecStartPre
# doctor; a failure restores units AND release before restarting the old worker.
begin_install_transaction
activate_install_transaction

echo "-- worker unit installed: $UNIT"
echo "-- doctor-only acceptance unit installed: $DOCTOR_UNIT"
if [ "$GPU" -eq 1 ]; then
  echo "-- identical GPU context installed for worker + doctor-only units"
  cat <<EOF

Next (item-3 GPU acceptance; doctor only, never the queue worker):
  1. edit $ENV_FILE with temporary STAGES=refine,fuse,splat and GPU=auto
  2. retain the README empty-GPU-queue query as rollout evidence
  3. systemctl start patina-scan-worker-doctor
  4. journalctl -u patina-scan-worker-doctor -n 100 --no-pager
  5. restore the normal STAGES value; do not enable GPU handlers early
EOF
else
  cat <<EOF

Next:
  1. edit $ENV_FILE (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, WORKER_ID)
  2. systemctl enable --now patina-scan-worker
  3. systemctl status patina-scan-worker
  4. journalctl -u patina-scan-worker -f
  (GPU worker? re-run: sudo ./install.sh --gpu)
EOF
fi
