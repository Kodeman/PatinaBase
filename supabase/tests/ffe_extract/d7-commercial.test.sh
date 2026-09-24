#!/usr/bin/env bash
#
# d7-commercial.test.sh — rulings D7 + D7a (migration 00661, CONTRACT A §A.4–A.12).
#
#   1. Deno: project-ffe-document-extract's v2 validator, tool schema and prompt.
#   2. SQL:  supabase/tests/ffe_extract/d7_commercial_test.sql — the commit gate
#            refuses an unconfirmed price and accepts a confirmed one, the
#            currency persists, and the injection guard flags =, + and @ inside
#            an envelope. Needs a LOCAL database with 00661 applied
#            (`pnpm supabase:reset`). The SQL file runs in one transaction and
#            rolls back.
#
# Usage: bash supabase/tests/ffe_extract/d7-commercial.test.sh
# Env:   SUPABASE_DB_URL (default postgresql://postgres:postgres@127.0.0.1:54322/postgres)

set -euo pipefail

ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../../.." >/dev/null 2>&1 && pwd -P)"
DB_URL="${SUPABASE_DB_URL:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}"

case "$DB_URL" in
  *@127.0.0.1:*|*@localhost:*) ;;
  *) echo "d7-commercial: refusing to run against a non-local database" >&2; exit 2 ;;
esac

echo "== deno: supabase/functions/project-ffe-document-extract"
(cd "$ROOT/supabase/functions" && deno test --allow-all --config deno.json project-ffe-document-extract/)

echo "== sql: supabase/tests/ffe_extract/d7_commercial_test.sql"
psql "$DB_URL" -X -q -v ON_ERROR_STOP=1 -f "$ROOT/supabase/tests/ffe_extract/d7_commercial_test.sql"

echo "d7-commercial: all checks passed"
