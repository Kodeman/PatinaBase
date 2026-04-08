#!/usr/bin/env bash
# Run Supabase CLI (or psql) against the remote Coolify-hosted Postgres
# via an ephemeral SSH tunnel.
#
# Usage:
#   scripts/remote-db.sh push                 # supabase db push
#   scripts/remote-db.sh pull                 # supabase db pull
#   scripts/remote-db.sh diff [name]          # supabase db diff
#   scripts/remote-db.sh types                # gen typescript types -> packages/supabase/src/database.types.ts
#   scripts/remote-db.sh psql                 # open psql shell
#   scripts/remote-db.sh bootstrap            # pre-create extensions requiring supabase_admin
#   scripts/remote-db.sh raw -- <cmd...>      # run any command with $REMOTE_DB_URL set
set -euo pipefail

SSH_HOST="${PATINA_SSH_HOST:-kody@192.168.1.14}"
REMOTE_PG_PORT="${PATINA_REMOTE_PG_PORT:-5433}"
LOCAL_PORT="${PATINA_LOCAL_PG_PORT:-54322}"

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="$ROOT/infra/.env"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "error: $ENV_FILE not found" >&2
  exit 1
fi

# shellcheck disable=SC1090
PG_PASS=$(grep -E '^POSTGRES_PASSWORD=' "$ENV_FILE" | head -1 | cut -d= -f2- | tr -d '"' | tr -d "'")
if [[ -z "$PG_PASS" ]]; then
  echo "error: POSTGRES_PASSWORD missing from $ENV_FILE" >&2
  exit 1
fi

# URL-encode the password (handles special chars)
PG_PASS_ENC=$(python3 -c 'import sys,urllib.parse;print(urllib.parse.quote(sys.argv[1],safe=""))' "$PG_PASS")

CTRL_SOCK="$(mktemp -u -t patina-pgtun.XXXXXX)"
cleanup() {
  ssh -S "$CTRL_SOCK" -O exit "$SSH_HOST" 2>/dev/null || true
}
trap cleanup EXIT

echo "→ opening ssh tunnel $LOCAL_PORT → $SSH_HOST:$REMOTE_PG_PORT"
ssh -f -N -M -S "$CTRL_SOCK" \
  -L "${LOCAL_PORT}:localhost:${REMOTE_PG_PORT}" \
  "$SSH_HOST"

export REMOTE_DB_URL="postgresql://postgres:${PG_PASS_ENC}@localhost:${LOCAL_PORT}/postgres?sslmode=disable"
export PGSSLMODE=disable  # supabase CLI ignores query string on some commands

cmd="${1:-}"; shift || true
case "$cmd" in
  push)  supabase db push --db-url "$REMOTE_DB_URL" "$@" ;;
  pull)  supabase db pull --db-url "$REMOTE_DB_URL" "$@" ;;
  diff)  supabase db diff --db-url "$REMOTE_DB_URL" "$@" ;;
  types)
    out="$ROOT/packages/supabase/src/database.types.ts"
    echo "→ writing $out"
    supabase gen types typescript --db-url "$REMOTE_DB_URL" --schema public > "$out"
    ;;
  bootstrap)
    # Extensions our migrations CREATE that require supabase_admin on self-hosted.
    # Safe to re-run — all use IF NOT EXISTS.
    PSQL_BIN="$(command -v psql || true)"
    [[ -z "$PSQL_BIN" && -x /opt/homebrew/opt/libpq/bin/psql ]] && PSQL_BIN=/opt/homebrew/opt/libpq/bin/psql
    if [[ -z "$PSQL_BIN" ]]; then
      echo "error: psql not found. Install with: brew install libpq" >&2
      exit 1
    fi
    echo "→ creating extensions as supabase_admin"
    PGPASSWORD="$PG_PASS" "$PSQL_BIN" -h localhost -p "$LOCAL_PORT" -U supabase_admin -d postgres -v ON_ERROR_STOP=1 <<'SQL'
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS moddatetime WITH SCHEMA extensions;
SELECT extname, extversion FROM pg_extension ORDER BY extname;
SQL
    ;;
  psql)
    PSQL_BIN="$(command -v psql || true)"
    if [[ -z "$PSQL_BIN" && -x /opt/homebrew/opt/libpq/bin/psql ]]; then
      PSQL_BIN=/opt/homebrew/opt/libpq/bin/psql
    fi
    if [[ -z "$PSQL_BIN" ]]; then
      echo "error: psql not found. Install with: brew install libpq" >&2
      exit 1
    fi
    PGPASSWORD="$PG_PASS" "$PSQL_BIN" -h localhost -p "$LOCAL_PORT" -U postgres -d postgres "$@"
    ;;
  raw)
    [[ "${1:-}" == "--" ]] && shift
    "$@"
    ;;
  *)
    echo "usage: $0 {push|pull|diff|types|psql|bootstrap|raw -- <cmd>}" >&2
    exit 2
    ;;
esac
