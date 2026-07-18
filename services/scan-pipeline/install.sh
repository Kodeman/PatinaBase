#!/usr/bin/env bash
# install.sh — bring up the Patina scan-pipeline worker natively on a Linux box
# (R109.1: native systemd, no Docker required to operate). Idempotent: safe to
# re-run to refresh the unit or (with --upgrade) replace the venv atomically.
#
# Usage:  sudo ./install.sh [--gpu] [--upgrade]
#
#   --gpu       also install the GPU extras (.[gpu] = refine+fuse+splat, via the
#               PyTorch cu118 index) and lay down the GPU systemd drop-in
#               (exact 2080 Ti device nodes, torch/CUDA cache confinement). Omit it
#               for a CPU-only worker — which then never pulls CUDA or installs
#               a GPU device allowlist.
#   --upgrade   Build and `pip check` a fresh staged venv while the live worker
#               keeps running, then stop only for an atomic symlink switch. An
#               active worker that fails to restart is rolled back to the prior
#               venv; an inactive worker keeps that prior venv at .venv.previous.
#               The worker installs a COPY of the source, so `git pull` alone does
#               NOT update it. If a GPU drop-in already exists, omitting --gpu is
#               a hard error rather than an accidental dependency downgrade.
#
# Steps:
#   1. create the `patina` service user + dirs (/opt/patina, /var/lib/patina, /etc/patina)
#   2. build + pip-check a staged venv without touching the live venv
#   3. drop the systemd unit (+ GPU prep/drop-in) + root-owned 0600 env template
#   4. atomically point .venv at the staged release; rollback a failed activation
#
# After install: edit /etc/patina/scan-worker.env, then follow the emitted CPU
# startup or item-3 GPU preflight instructions.
set -euo pipefail

GPU=0
UPGRADE=0
for arg in "$@"; do
  case "$arg" in
    --gpu)     GPU=1 ;;
    --upgrade) UPGRADE=1 ;;
    -h|--help)
      sed -n '2,28p' "$0"; exit 0 ;;
    *) echo "unknown flag: $arg (see --help)" >&2; exit 2 ;;
  esac
done

APP_DIR=/opt/patina/scan-pipeline
VENV="$APP_DIR/.venv"
# A venv is not relocatable: console-script shebangs embed its absolute build
# path. Build an immutable release path and atomically switch the stable .venv
# symlink to it; never rename the release directory after pip installs scripts.
STAGED_VENV="$APP_DIR/.venv.release.$(date -u +%Y%m%d%H%M%S).$$"
NEXT_VENV_LINK="$APP_DIR/.venv.next"
PREVIOUS_VENV="$APP_DIR/.venv.previous"
FAILED_VENV="$APP_DIR/.venv.failed"
ETC_DIR=/etc/patina
ENV_FILE="$ETC_DIR/scan-worker.env"
WORK_DIR=/var/lib/patina/scan-work
UNIT=/etc/systemd/system/patina-scan-worker.service
DROPIN_DIR=/etc/systemd/system/patina-scan-worker.service.d
NVIDIA_PREPARE_UNIT=/etc/systemd/system/patina-scan-worker-nvidia-prepare.service
NVIDIA_MODPROBE=/usr/bin/nvidia-modprobe
SVC_USER=patina
SRC_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PYTHON="${PYTHON:-python3}"
# shellcheck source=install-venv-lib.sh
. "$SRC_DIR/install-venv-lib.sh"

# Fail closed BEFORE touching the venv. Rebuilding an existing GPU installation
# without --gpu would leave the GPU unit policy in place but remove its Python
# dependencies. The operator must state the GPU intent on every upgrade.
if [ "$UPGRADE" -eq 1 ] && [ "$GPU" -eq 0 ] && [ -f "$DROPIN_DIR/gpu.conf" ]; then
  echo "ERROR: refusing to rebuild an existing GPU worker as CPU-only by omission." >&2
  echo "       Re-run with: sudo ./install.sh --gpu --upgrade" >&2
  exit 2
fi

# The GPU unit calls this exact executable as root before the worker. Fail before
# apt, user, directory, venv, or unit changes if the driver package omitted it.
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
  echo "            + CUDA 11.8 toolkit (nvcc, for gsplat's JIT build) FIRST — see"
  echo "            README 'Box prep (GPU)'. torch will install regardless, but the"
  echo "            splat cannot run until doctor's gpu/nvcc/torch-cuda/gsplat-cuda lines pass."
fi

# 1. service user + dirs
if ! id -u "$SVC_USER" >/dev/null 2>&1; then
  echo "-- creating service user '$SVC_USER'"
  useradd --system --no-create-home --shell /usr/sbin/nologin "$SVC_USER"
fi
install -d -o "$SVC_USER" -g "$SVC_USER" "$APP_DIR" "$WORK_DIR"
# ezdxf writes BOTH its config and its font cache on use. Give the service user
# writable XDG state dirs INSIDE APP_DIR (the unit points all four XDG_* base
# vars here), so nothing ever depends on a root-owned/absent service-user home.
install -d -o "$SVC_USER" -g "$SVC_USER" \
  "$APP_DIR/.config" "$APP_DIR/.cache" "$APP_DIR/.data" "$APP_DIR/.state"
if [ "$GPU" -eq 1 ]; then
  # torch hub, nvidia JIT/PTX, and torch extension-build caches, all under the
  # already-RW .cache (the GPU drop-in points their env vars here).
  install -d -o "$SVC_USER" -g "$SVC_USER" \
    "$APP_DIR/.cache/torch" "$APP_DIR/.cache/nv" \
    "$APP_DIR/.cache/torch_extensions"
fi
install -d -m 0750 "$ETC_DIR"

# 2. staged venv + install. The live $VENV is never modified in place. A fresh
# install, explicit --upgrade, or first CPU→GPU conversion builds a clean stage;
# a flag-free re-run only refreshes dirs/units as documented.
BUILD_VENV=0
if [ ! -d "$VENV" ] || [ "$UPGRADE" -eq 1 ]; then
  BUILD_VENV=1
elif [ "$GPU" -eq 1 ] && [ ! -f "$DROPIN_DIR/gpu.conf" ]; then
  BUILD_VENV=1
fi

if [ "$BUILD_VENV" -eq 1 ]; then
  echo "-- building staged venv at $STAGED_VENV ($($PYTHON --version 2>&1))"
  "$PYTHON" -m venv "$STAGED_VENV"
  "$STAGED_VENV/bin/pip" install --upgrade pip >/dev/null
  if [ "$GPU" -eq 1 ]; then
    echo "-- pip install $SRC_DIR[drawings,gpu]  (+ torch/gsplat/pycolmap/open3d via cu118 index)"
    "$STAGED_VENV/bin/pip" install \
      --extra-index-url https://download.pytorch.org/whl/cu118 \
      "$SRC_DIR[drawings,gpu]"
  else
    echo "-- pip install $SRC_DIR[drawings]  (CPU-only: ezdxf + cairosvg, no CUDA)"
    "$STAGED_VENV/bin/pip" install "$SRC_DIR[drawings]"
  fi
  echo "-- checking staged dependency graph"
  "$STAGED_VENV/bin/pip" check
  chown -R "$SVC_USER:$SVC_USER" "$STAGED_VENV"
else
  echo "-- existing venv left untouched (use --upgrade to rebuild from current source)"
fi

# 3. unit (+ GPU drop-in) + env template
echo "-- installing systemd unit -> $UNIT"
install -m 0644 "$SRC_DIR/patina-scan-worker.service" "$UNIT"
if [ "$GPU" -eq 1 ]; then
  install -m 0644 "$SRC_DIR/patina-scan-worker-nvidia-prepare.service" \
    "$NVIDIA_PREPARE_UNIT"
  install -d "$DROPIN_DIR"
  install -m 0644 "$SRC_DIR/patina-scan-worker.gpu.conf" "$DROPIN_DIR/gpu.conf"
  echo "-- installed GPU prepare unit -> $NVIDIA_PREPARE_UNIT"
  echo "-- installed GPU drop-in -> $DROPIN_DIR/gpu.conf (prep ordering + device/cache policy)"
else
  echo "-- CPU install: no GPU drop-in laid down (pass --gpu on a GPU box)."
  [ -f "$DROPIN_DIR/gpu.conf" ] && \
    echo "   NOTE: a GPU drop-in from a prior --gpu run still exists at $DROPIN_DIR/gpu.conf;" && \
    echo "         remove it + daemon-reload to fully revert this box to CPU-only."
fi
if [ ! -f "$ENV_FILE" ]; then
  echo "-- installing env template -> $ENV_FILE (EDIT THIS: URL, key, WORKER_ID, STAGES)"
  # PID 1 reads EnvironmentFile before dropping to User=patina. Keep the
  # service-role credential root-owned and unreadable by the worker process.
  install -o root -g root -m 0600 "$SRC_DIR/scan-worker.env.example" "$ENV_FILE"
else
  echo "-- $ENV_FILE exists; leaving it untouched"
fi
systemctl daemon-reload

# 4. Activate only after the complete staged install, pip check, and unit
# installation succeeded. The stable .venv symlink switch stays on APP_DIR's
# filesystem and is atomic; the helper is behavior-tested with fake systemctl.
activate_staged_venv

# 5. doctor is the unit's ExecStartPre — never run it here as root. systemd
# executes it as User=patina with the unit's EnvironmentFile, cache variables,
# filesystem sandbox, NVIDIA prepare dependency, and GPU DeviceAllow before
# ExecStart can claim work.
echo "-- doctor installed as ExecStartPre in $UNIT"
echo "   readiness is certified only when systemctl start runs it in the real unit context"

if [ "$GPU" -eq 1 ]; then
  cat <<EOF

Next (item-3 GPU preflight — handlers are not registered yet):
  1. edit $ENV_FILE (credentials + temporary STAGES=refine,fuse,splat)
  2. follow README "Item-3-only GPU acceptance": prove the GPU-stage queue empty,
     start only long enough for ExecStartPre, then stop immediately
  3. restore CPU STAGES before normal P1 service, or leave the worker stopped
  Do NOT leave GPU stages enabled until their handlers register in items 4–7.
EOF
else
  cat <<EOF

Next:
  1. edit $ENV_FILE   (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, WORKER_ID)
  2. systemctl enable --now patina-scan-worker  (ExecStartPre doctor must pass)
  3. systemctl status patina-scan-worker
  4. journalctl -u patina-scan-worker -f
  (GPU worker? re-run: sudo ./install.sh --gpu)
EOF
fi
