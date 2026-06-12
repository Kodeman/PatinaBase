#!/usr/bin/env bash
# The Document · local rebuild — one command to recover after a `supabase
# db reset` from main (which wipes this stack's unmerged migrations AND the
# transient demo engagements; the Desk then dies with "Could not find the
# table 'public.document_state' in the schema cache").
#
#   ./apps/designer-portal/scripts/the-document-local-rebuild.sh
#
# Idempotent: re-applies migrations 00191–00197 from this branch, re-runs
# the demo seed, and pokes PostgREST to reload its schema cache.
set -euo pipefail
cd "$(dirname "$0")/../../.."

PSQL=(docker exec -i supabase_db_supabase psql -U postgres -d postgres -v ON_ERROR_STOP=1 -q)

for f in 00191_document_state_view 00192_document_state_open_claims \
         00193_margin_anchors_and_pulses 00194_margin_items_view \
         00195_document_state_pulse_and_send_rpc \
         00196_per_item_claims_and_margin_notes 00197_margin_items_note_branch \
         00198_time_entry_source_activity \
         00200_document_state_send_and_money \
         00201_designer_interruption_rules; do
  echo "── applying $f"
  "${PSQL[@]}" < "supabase/migrations/$f.sql"
done

echo "── seeding demo engagements"
"${PSQL[@]}" < apps/designer-portal/scripts/the-document-local-seed.sql

echo "── reloading PostgREST schema cache"
"${PSQL[@]}" -c "notify pgrst, 'reload schema';"

"${PSQL[@]}" -At -c "select 'desk rows: ' || count(*) from document_state;"
echo "✓ rebuilt — refresh the browser"
