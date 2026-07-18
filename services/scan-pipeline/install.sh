#!/usr/bin/env bash
# install.sh — bring up the Patina scan-pipeline worker natively on a Linux box
# (R109.1: native systemd, no Docker required to operate). Idempotent: safe to
# re-run to refresh the unit or (with --upgrade) rebuild the venv.
#
# Usage:  sudo ./install.sh [--gpu] [--upgrade]
#
#   --gpu       also install the GPU extras (.[gpu] = refine+fuse+splat, via the
#               PyTorch cu118 index) and lay down the GPU systemd drop-in
#               (DeviceAllow=/dev/nvidia*, torch/CUDA cache confinement). Omit it
#               for a CPU-only worker — which then never pulls CUDA and stays
#               device-isolated.
#   --upgrade   REBUILD the venv from scratch (rm -rf then fresh install). The
#               worker installs a COPY of the source, so `git pull` alone (or a
#               plain re-run at an unchanged version) does NOT update a running
#               worker — the two-command upgrade is:  git pull && sudo ./install.sh --upgrade
#               (add --gpu to that if this is a GPU box).
#
# Steps:
#   1. create the `patina` service user + dirs (/opt/patina, /var/lib/patina, /etc/patina)
#   2. build a venv at /opt/patina/scan-pipeline/.venv and `pip install .[…]`
#   3. drop the systemd unit (+ GPU drop-in with --gpu) + env template (0600) if absent
#   4. run `doctor` and print the result
#
# After install: edit /etc/patina/scan-worker.env (URL, key, WORKER_ID, STAGES), then
#   patina-scan-worker doctor
#   systemctl enable --now patina-scan-worker
#   journalctl -u patina-scan-worker -f
set -euo pipefail

GPU=0
UPGRADE=0
for arg in "$@"; do
  case "$arg" in
    --gpu)     GPU=1 ;;
    --upgrade) UPGRADE=1 ;;
    -h|--help)
      sed -n '2,30p' "$0"; exit 0 ;;
    *) echo "unknown flag: $arg (see --help)" >&2; exit 2 ;;
  esac
done

APP_DIR=/opt/patina/scan-pipeline
VENV="$APP_DIR/.venv"
ETC_DIR=/etc/patina
ENV_FILE="$ETC_DIR/scan-worker.env"
WORK_DIR=/var/lib/patina/scan-work
UNIT=/etc/systemd/system/patina-scan-worker.service
DROPIN_DIR=/etc/systemd/system/patina-scan-worker.service.d
SVC_USER=patina
SRC_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PYTHON="${PYTHON:-python3}"

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
  echo "            splat stage cannot run until doctor's gpu/torch-cuda lines pass."
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
  # torch hub cache + nvidia JIT/PTX cache, both under the already-RW .cache
  # (the GPU drop-in points TORCH_HOME / CUDA_CACHE_PATH here).
  install -d -o "$SVC_USER" -g "$SVC_USER" "$APP_DIR/.cache/torch" "$APP_DIR/.cache/nv"
fi
install -d -m 0750 "$ETC_DIR"

# 2. venv + install
if [ "$UPGRADE" -eq 1 ] && [ -d "$VENV" ]; then
  echo "-- --upgrade: removing existing venv for a clean rebuild ($VENV)"
  rm -rf "$VENV"
fi
echo "-- building venv at $VENV ($($PYTHON --version 2>&1))"
"$PYTHON" -m venv "$VENV"
"$VENV/bin/pip" install --upgrade pip >/dev/null
if [ "$GPU" -eq 1 ]; then
  echo "-- pip install $SRC_DIR[drawings,gpu]  (+ torch/gsplat/pycolmap/open3d via cu118 index)"
  "$VENV/bin/pip" install --extra-index-url https://download.pytorch.org/whl/cu118 \
    "$SRC_DIR[drawings,gpu]"
else
  echo "-- pip install $SRC_DIR[drawings]  (CPU-only: ezdxf + cairosvg, no CUDA)"
  "$VENV/bin/pip" install "$SRC_DIR[drawings]"
fi
chown -R "$SVC_USER:$SVC_USER" "$APP_DIR"

# 3. unit (+ GPU drop-in) + env template
echo "-- installing systemd unit -> $UNIT"
install -m 0644 "$SRC_DIR/patina-scan-worker.service" "$UNIT"
if [ "$GPU" -eq 1 ]; then
  install -d "$DROPIN_DIR"
  install -m 0644 "$SRC_DIR/patina-scan-worker.gpu.conf" "$DROPIN_DIR/gpu.conf"
  echo "-- installed GPU drop-in -> $DROPIN_DIR/gpu.conf (nvidia devices + cache confinement)"
else
  echo "-- CPU install: no GPU drop-in laid down (pass --gpu on a GPU box)."
  [ -f "$DROPIN_DIR/gpu.conf" ] && \
    echo "   NOTE: a GPU drop-in from a prior --gpu run still exists at $DROPIN_DIR/gpu.conf;" && \
    echo "         remove it + daemon-reload to fully revert this box to CPU-only."
fi
if [ ! -f "$ENV_FILE" ]; then
  echo "-- installing env template -> $ENV_FILE (EDIT THIS: URL, key, WORKER_ID, STAGES)"
  install -m 0600 "$SRC_DIR/scan-worker.env.example" "$ENV_FILE"
else
  echo "-- $ENV_FILE exists; leaving it untouched"
fi
systemctl daemon-reload

# 4. doctor (best-effort — will FAIL until the env file is filled in)
echo "-- running doctor (expect FAIL until $ENV_FILE is filled in):"
set +e
# shellcheck disable=SC1090
set -a; [ -f "$ENV_FILE" ] && . "$ENV_FILE"; set +a
"$VENV/bin/patina-scan-worker" doctor
set -e

cat <<EOF

Next:
  1. edit $ENV_FILE   (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, WORKER_ID$([ "$GPU" -eq 1 ] && echo ", STAGES incl. a GPU stage"))
  2. $VENV/bin/patina-scan-worker doctor
  3. systemctl enable --now patina-scan-worker
  4. journalctl -u patina-scan-worker -f
$([ "$GPU" -eq 0 ] && echo "  (GPU worker?  re-run:  sudo ./install.sh --gpu)")
EOF
