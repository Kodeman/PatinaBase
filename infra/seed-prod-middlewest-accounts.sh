#!/usr/bin/env bash
# =============================================================================
# Patina: seed Middlewest Studio test accounts on production
# =============================================================================
# Idempotent. Re-runnable. Streams seed-prod-middlewest-accounts.sql into the
# Supabase Postgres container on the prod server.
#
# Designer:  kody@middlewest.studio (existing — roles fixed only)
# Client:    client@middlewest.studio (created fresh, password from env)
#
# Usage (from monorepo root):
#   PATINA_CLIENT_PASSWORD='...' ./infra/seed-prod-middlewest-accounts.sh
#
# The password should match what's documented in infra/seed-credentials.md
# (gitignored). The same password is reusable on re-run — the auth user insert
# is ON CONFLICT DO NOTHING so the password isn't rewritten on subsequent runs.
# =============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SQL="${SCRIPT_DIR}/seed-prod-middlewest-accounts.sql"
SERVER="${PATINA_PROD_SSH:-kody@192.168.1.14}"
DB_CONTAINER="${PATINA_DB_CONTAINER:-db-es8w8g0c00og4gsgg0k8w8o8}"
PASSWORD="${PATINA_CLIENT_PASSWORD:-}"

if [ ! -f "$SQL" ]; then
  echo "ERROR: $SQL not found" >&2
  exit 1
fi

if [ -z "$PASSWORD" ]; then
  cat >&2 <<'EOF'
ERROR: PATINA_CLIENT_PASSWORD env var is required.
       The password is used to bcrypt-hash the client@middlewest.studio
       auth.users row. Pull it from infra/seed-credentials.md (gitignored),
       or set a new one and update that file after running.

Example:
  PATINA_CLIENT_PASSWORD='your-strong-password' ./infra/seed-prod-middlewest-accounts.sh
EOF
  exit 1
fi

# Escape any single-quote in the password for safe interpolation into the
# remote shell. psql `-v var=value` takes the value verbatim, but we have to
# wrap it in single quotes for the shell.
ESCAPED_PASSWORD="${PASSWORD//\'/\'\\\'\'}"

echo "[seed] streaming $(basename "$SQL") to $DB_CONTAINER on $SERVER..."
ssh "$SERVER" "sudo docker exec -i $DB_CONTAINER psql -U postgres -d postgres -v ON_ERROR_STOP=1 -v client_password='$ESCAPED_PASSWORD'" \
  < "$SQL"

echo
echo "[seed] complete."
echo
echo "Smoke URLs:"
echo "  Designer: https://app.patina.cloud/desk                 (QR sign-in as kody@middlewest.studio)"
echo "  Client:   https://client.patina.cloud/projects          (password sign-in as client@middlewest.studio)"
echo
echo "Seeded UUID namespace: 99999999-9999-9999-9999-*"
echo "Cleanup: see DELETE recipe in infra/seed-credentials.md"
