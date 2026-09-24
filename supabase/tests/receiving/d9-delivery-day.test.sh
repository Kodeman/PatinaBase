#!/usr/bin/env bash
#
# d9-delivery-day.test.sh — ruling D9 (migration 00665).
#
#   1. SQL: supabase/tests/receiving/d9_delivery_day_test.sql. An inspection
#           carrying the phone's local day stamps that day; a legacy one falls
#           back to the UTC day; the net-30 due_date is delivered + 30; a later
#           inspection does not move a delivery already stamped.
#           (procurement/state_chain_test.sql would cover 00184's other paths,
#           but it stops at fixture time; see tests/KNOWN_FAILURES.md.)
#   2. Report (read-only): existing inspections whose UTC day differs from the
#           studio's local day. They were stamped with the UTC day and are NOT
#           rewritten. Every existing row has a NULL local day, so the new rule
#           changes none of them. It prints the counts and changes nothing.
#
# Needs a LOCAL database with 00665 applied (`pnpm supabase:reset`). Each SQL
# file runs in one transaction and rolls back.
#
# Usage: bash supabase/tests/receiving/d9-delivery-day.test.sh
# Env:   SUPABASE_DB_URL (default postgresql://postgres:postgres@127.0.0.1:54322/postgres)

set -euo pipefail

ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../../.." >/dev/null 2>&1 && pwd -P)"
DB_URL="${SUPABASE_DB_URL:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}"

case "$DB_URL" in
  *@127.0.0.1:*|*@localhost:*) ;;
  *) echo "d9-delivery-day: refusing to run against a non-local database" >&2; exit 2 ;;
esac

echo "== sql: supabase/tests/receiving/d9_delivery_day_test.sql"
psql "$DB_URL" -X -q -v ON_ERROR_STOP=1 -f "$ROOT/supabase/tests/receiving/d9_delivery_day_test.sql"

echo "== report: existing inspections whose UTC day is not the studio's local day"
psql "$DB_URL" -X -q -v ON_ERROR_STOP=1 -c "
  SELECT count(*) AS inspections,
         count(*) FILTER (WHERE inspected_local_date IS NULL) AS without_local_day,
         count(*) FILTER (
           WHERE (inspected_at AT TIME ZONE 'UTC')::date
              <> (inspected_at AT TIME ZONE 'America/Chicago')::date
         ) AS utc_day_differs_chicago,
         count(*) FILTER (
           WHERE (inspected_at AT TIME ZONE 'UTC')::date
              <> (inspected_at AT TIME ZONE 'America/Los_Angeles')::date
         ) AS utc_day_differs_los_angeles
    FROM public.receiving_inspections;"

echo "d9-delivery-day: all checks passed"
