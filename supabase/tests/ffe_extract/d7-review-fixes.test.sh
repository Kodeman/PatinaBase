#!/usr/bin/env bash
#
# d7-review-fixes.test.sh — SQ-208's review findings on 00661, closed by 00666.
#
#   1. Deno: lib.ts refuses a -<digit> formula in text fields and keeps a plain
#            negative number (F6).
#   2. SQL:  supabase/tests/ffe_extract/d7_review_fixes_test.sql — one block per
#            finding: F1 (invoice lines bill USD selections only), F3 (a catalog
#            row is never relabelled), F4 (catalog repricing relabels USD), F5
#            (staging fails closed without `reused`), F6 (formula guard gaps)
#            and F8 (a replayed placement key is refused). Needs a LOCAL
#            database with 00666 applied (`pnpm supabase:reset`). The SQL file
#            runs in one transaction and rolls back.
#
# Usage: bash supabase/tests/ffe_extract/d7-review-fixes.test.sh
# Env:   SUPABASE_DB_URL (default postgresql://postgres:postgres@127.0.0.1:54322/postgres)

set -euo pipefail

ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../../.." >/dev/null 2>&1 && pwd -P)"
DB_URL="${SUPABASE_DB_URL:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}"

case "$DB_URL" in
  *@127.0.0.1:*|*@localhost:*) ;;
  *) echo "d7-review-fixes: refusing to run against a non-local database" >&2; exit 2 ;;
esac

echo "== deno: project-ffe-document-extract injection guard"
(cd "$ROOT/supabase/functions" && deno test --allow-all --config deno.json \
  --filter "injection guard" project-ffe-document-extract/)

echo "== sql: supabase/tests/ffe_extract/d7_review_fixes_test.sql"
psql "$DB_URL" -X -q -v ON_ERROR_STOP=1 -f "$ROOT/supabase/tests/ffe_extract/d7_review_fixes_test.sql"

echo "d7-review-fixes: all checks passed"
