#!/bin/sh
# Wave 3c — the concept-render storage round-trip, driven end to end and with
# postgres read at each of the three moments that matter. Writes
# roundtrip-evidence.txt beside it.
#
# The Playwright legs are run from apps/designer-portal because that is where
# @playwright/test resolves in this workspace (ESM resolves from the SCRIPT's
# directory, not the cwd), so each leg is copied there for the run.
set -e

WT=/Users/kody/Code/patina-merged/.codex/worktrees/agent-pp-int3c
OUT="$WT/artifacts/portal-polish-build-2026-09-08/waves/w3c/renders"
APP="$WT/apps/designer-portal"
EV="$OUT/roundtrip-evidence.txt"

ROOM=b0000000-0000-0000-0000-0000000d2c0b   # Aspen Loft Refresh · Living Room
PROJECT=b0000000-0000-0000-0000-0000000000d1

psql_() {
  PGPASSWORD=postgres psql -h 127.0.0.1 -p 54322 -U postgres -d postgres "$@"
}

snapshot() {
  echo "───────────────────────────────────────────────────────────────" >>"$EV"
  echo "## $1" >>"$EV"
  echo "" >>"$EV"
  echo "project_rooms — the four columns 00580 added:" >>"$EV"
  psql_ -x -c "select concept_render_url, concept_render_caption,
                      concept_render_uploaded_at, concept_render_uploaded_by
               from public.project_rooms where id='$ROOM';" >>"$EV"
  echo "storage.objects in the PRIVATE room-renders bucket:" >>"$EV"
  psql_ -x -c "select bucket_id, name, owner,
                      (metadata->>'size') as size_bytes,
                      (metadata->>'mimetype') as mimetype
               from storage.objects where bucket_id='room-renders';" >>"$EV"
  psql_ -c "select count(*) as objects_in_bucket
            from storage.objects where bucket_id='room-renders';" >>"$EV"
}

{
  echo "Wave 3c — concept-render storage round-trip"
  echo "Run: $(date -u '+%Y-%m-%dT%H:%M:%SZ')"
  echo "Local stack only — API_URL http://127.0.0.1:54321, linked_project null."
  echo "Signed in through the real UI as designer@patina.dev, who IS this"
  echo "project's designer_id — so the four storage policies' gate,"
  echo "app_private.is_project_studio_member, is satisfied by the user session."
  echo "No service_role key is used anywhere in this round-trip."
  echo "Project $PROJECT · Room $ROOM (Aspen Loft Refresh · Living Room)"
  echo ""
} >"$EV"

snapshot "BEFORE — nothing uploaded"

cp "$OUT/concept-render-roundtrip.mjs" "$APP/.w3c-roundtrip.mjs"
echo "───────────────────────────────────────────────────────────────" >>"$EV"
echo "## UPLOAD leg (Playwright, real UI: open the act → choose PNG → caption → Upload)" >>"$EV"
echo "" >>"$EV"
( cd "$APP" && node .w3c-roundtrip.mjs upload ) 2>&1 | tee -a "$EV"

snapshot "AFTER UPLOAD — the object stands and the row points at it"

echo "───────────────────────────────────────────────────────────────" >>"$EV"
echo "## REMOVE leg (Playwright, real UI: press Remove)" >>"$EV"
echo "" >>"$EV"
( cd "$APP" && node .w3c-roundtrip.mjs remove ) 2>&1 | tee -a "$EV"

snapshot "AFTER REMOVE — the object is gone AND the four columns are null"

rm -f "$APP/.w3c-roundtrip.mjs"
echo "done — $EV"
