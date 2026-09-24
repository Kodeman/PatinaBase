#!/usr/bin/env bash
#
# d7b-suggestion.test.sh — ruling D7b (migration 00664).
#
#   1. SQL: supabase/tests/capture_enrichment/d7b_suggestion_test.sql. Enrichment's
#           vendor/SKU stays on the ledger as a suggestion and is never written
#           onto the capture. A designer-typed or confirmed value is
#           unchanged. category is still prefilled.
#   2. SQL: supabase/tests/capture_enrichment/never_overwrite_result_test.sql.
#           00515's existing guarantees still hold under the 00664 body.
#   3. Report (read-only): field_captures rows whose vendor_name/sku equals a
#           'ready' run's suggestion, which means they were possibly auto-filled
#           before 00664. It prints the count and changes nothing.
#
# Needs a LOCAL database with 00664 applied (`pnpm supabase:reset`). Each SQL
# file runs in one transaction and rolls back.
#
# Usage: bash supabase/tests/capture_enrichment/d7b-suggestion.test.sh
# Env:   SUPABASE_DB_URL (default postgresql://postgres:postgres@127.0.0.1:54322/postgres)

set -euo pipefail

ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../../.." >/dev/null 2>&1 && pwd -P)"
DB_URL="${SUPABASE_DB_URL:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}"

case "$DB_URL" in
  *@127.0.0.1:*|*@localhost:*) ;;
  *) echo "d7b-suggestion: refusing to run against a non-local database" >&2; exit 2 ;;
esac

echo "== sql: supabase/tests/capture_enrichment/d7b_suggestion_test.sql"
psql "$DB_URL" -X -q -v ON_ERROR_STOP=1 -f "$ROOT/supabase/tests/capture_enrichment/d7b_suggestion_test.sql"

echo "== sql: supabase/tests/capture_enrichment/never_overwrite_result_test.sql"
psql "$DB_URL" -X -q -v ON_ERROR_STOP=1 -f "$ROOT/supabase/tests/capture_enrichment/never_overwrite_result_test.sql"

echo "== report: field captures possibly auto-filled with vendor/SKU before 00664"
psql "$DB_URL" -X -q -v ON_ERROR_STOP=1 -c "
  SELECT count(DISTINCT fc.id) AS possibly_autofilled,
         count(DISTINCT fc.id) FILTER (
           WHERE nullif(fc.raw_payload #>> '{tag,vendorName}', '') IS NULL
             AND nullif(fc.raw_payload #>> '{tag,sku}', '') IS NULL
         ) AS device_sent_neither
    FROM public.field_captures fc
    JOIN public.capture_enrichment_runs r
      ON r.target_type = 'field_capture' AND r.target_id = fc.id AND r.status = 'ready'
   WHERE (nullif(r.suggestions ->> 'vendor_name', '') IS NOT NULL AND fc.vendor_name = r.suggestions ->> 'vendor_name')
      OR (nullif(r.suggestions ->> 'sku', '') IS NOT NULL AND fc.sku = r.suggestions ->> 'sku');"

echo "d7b-suggestion: all checks passed"
