#!/usr/bin/env bash
#
# snapshot-currency.test.sh — 00667 (T6-01d, SQ-214): a Spec Book item snapshot
# carries its price's currency at `pricing.currency`, the key spec-book-render
# reads (SQ-212).
#
#   SQL: supabase/tests/spec_books/snapshot_currency_test.sql — a EUR item's
#        snapshot carries 'EUR' and a USD item's carries 'USD'. Needs a LOCAL
#        database with 00667 applied (`pnpm supabase:reset`). The SQL file runs
#        in one transaction and rolls back.
#
# Usage: bash supabase/tests/spec_books/snapshot-currency.test.sh
# Env:   SUPABASE_DB_URL (default postgresql://postgres:postgres@127.0.0.1:54322/postgres)

set -euo pipefail

ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../../.." >/dev/null 2>&1 && pwd -P)"
DB_URL="${SUPABASE_DB_URL:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}"

case "$DB_URL" in
  *@127.0.0.1:*|*@localhost:*) ;;
  *) echo "snapshot-currency: refusing to run against a non-local database" >&2; exit 2 ;;
esac

echo "== sql: supabase/tests/spec_books/snapshot_currency_test.sql"
psql "$DB_URL" -X -q -v ON_ERROR_STOP=1 -f "$ROOT/supabase/tests/spec_books/snapshot_currency_test.sql"

echo "snapshot-currency: all checks passed"
