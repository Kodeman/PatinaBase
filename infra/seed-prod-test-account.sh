#!/usr/bin/env bash
# =============================================================================
# Patina: seed kody@kochaver.com on production
# =============================================================================
# Idempotent. Re-runnable. Streams seed-prod-test-account.sql into the
# Supabase Postgres container on the prod server.
#
# Usage (from monorepo root):
#   ./infra/seed-prod-test-account.sh
# =============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SQL="${SCRIPT_DIR}/seed-prod-test-account.sql"
SERVER="${PATINA_PROD_SSH:-kody@192.168.1.14}"
DB_CONTAINER="${PATINA_DB_CONTAINER:-db-es8w8g0c00og4gsgg0k8w8o8}"

if [ ! -f "$SQL" ]; then
  echo "ERROR: $SQL not found" >&2
  exit 1
fi

echo "[seed] streaming $(basename "$SQL") to $DB_CONTAINER on $SERVER..."
ssh "$SERVER" "sudo docker exec -i $DB_CONTAINER psql -U postgres -d postgres -v ON_ERROR_STOP=1" \
  < "$SQL"

echo
echo "[seed] complete."
echo
echo "Smoke URLs (log in as kody@kochaver.com via magic link):"
echo "  https://app.patina.cloud/portal/proposals/00000000-0000-0000-0000-000000000c01/scope"
echo "  https://app.patina.cloud/portal/proposals/00000000-0000-0000-0000-000000000c01/scope?tab=palette"
echo "  https://app.patina.cloud/portal/proposals/00000000-0000-0000-0000-000000000c01/scope?tab=ffe"
echo "  https://app.patina.cloud/portal/proposals/00000000-0000-0000-0000-000000000c01/scope?tab=phases"
