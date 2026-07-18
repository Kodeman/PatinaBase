#!/usr/bin/env bash
# install.sh — bring up the Patina scan-pipeline worker natively on a Linux box
# (R109.1: native systemd, no Docker required to operate). Idempotent: safe to
# re-run to upgrade the venv or refresh the unit.
#
# Usage:  sudo ./install.sh
#
# Steps:
#   1. create the `patina` service user + dirs (/opt/patina, /var/lib/patina, /etc/patina)
#   2. build a venv at /opt/patina/scan-pipeline/.venv and `pip install .`
#   3. drop the systemd unit + env template (0600) if absent
#   4. run `doctor` and print the result
#
# After install: edit /etc/patina/scan-worker.env (URL, key, WORKER_ID), then
#   patina-scan-worker doctor
#   systemctl enable --now patina-scan-worker
#   journalctl -u patina-scan-worker -f
set -euo pipefail

APP_DIR=/opt/patina/scan-pipeline
VENV="$APP_DIR/.venv"
ETC_DIR=/etc/patina
ENV_FILE="$ETC_DIR/scan-worker.env"
WORK_DIR=/var/lib/patina/scan-work
UNIT=/etc/systemd/system/patina-scan-worker.service
SVC_USER=patina
SRC_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PYTHON="${PYTHON:-python3}"

echo "== Patina scan-pipeline worker install =="
echo "source: $SRC_DIR"

# 0. native libs — cairosvg (PDF sheets, item 11) needs libcairo2
if command -v apt-get >/dev/null 2>&1; then
  echo "-- ensuring libcairo2 is present (cairosvg → PDF)"
  apt-get install -y --no-install-recommends libcairo2 >/dev/null 2>&1 || \
    echo "   (could not apt-get libcairo2 — install it manually if PDF rendering fails)"
fi

# 1. service user + dirs
if ! id -u "$SVC_USER" >/dev/null 2>&1; then
  echo "-- creating service user '$SVC_USER'"
  useradd --system --no-create-home --shell /usr/sbin/nologin "$SVC_USER"
fi
install -d -o "$SVC_USER" -g "$SVC_USER" "$APP_DIR" "$WORK_DIR"
# ezdxf writes its XDG config on use — give the service user a writable config
# dir INSIDE APP_DIR (the unit points XDG_CONFIG_HOME here), so it never depends
# on a root-owned/absent service-user home.
install -d -o "$SVC_USER" -g "$SVC_USER" "$APP_DIR/.config"
install -d -m 0750 "$ETC_DIR"

# 2. venv + install
echo "-- building venv at $VENV ($($PYTHON --version 2>&1))"
"$PYTHON" -m venv "$VENV"
"$VENV/bin/pip" install --upgrade pip >/dev/null
echo "-- pip install $SRC_DIR[drawings]  (ezdxf + cairosvg for item-11 renderers)"
"$VENV/bin/pip" install "$SRC_DIR[drawings]"
chown -R "$SVC_USER:$SVC_USER" "$APP_DIR"

# 3. unit + env template
echo "-- installing systemd unit -> $UNIT"
install -m 0644 "$SRC_DIR/patina-scan-worker.service" "$UNIT"
if [ ! -f "$ENV_FILE" ]; then
  echo "-- installing env template -> $ENV_FILE (EDIT THIS: URL, key, WORKER_ID)"
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
  1. edit $ENV_FILE   (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, WORKER_ID)
  2. $VENV/bin/patina-scan-worker doctor
  3. systemctl enable --now patina-scan-worker
  4. journalctl -u patina-scan-worker -f
EOF
