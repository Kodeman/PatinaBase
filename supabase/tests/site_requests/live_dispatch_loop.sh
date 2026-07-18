#!/usr/bin/env bash
set -euo pipefail

SITE_DB_URL="${SITE_DB_URL:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}"
SITE_API_URL="${SITE_API_URL:-http://127.0.0.1:54321}"

case "$SITE_DB_URL $SITE_API_URL" in
  *127.0.0.1* | *localhost*) ;;
  *)
    echo "Refusing to run the dispatch fixture probe against a non-local endpoint." >&2
    exit 2
    ;;
esac

DESIGNER_ID="a0000000-0000-0000-0000-000000000004"
PROJECT_ID="f3750000-0000-4000-8000-000000000101"
ROOM_ID="f3750000-0000-4000-8000-000000000201"
PARTY_ID="f3750000-0000-4000-8000-000000000301"
PROBE_TMP="$(mktemp -d)"

cleanup_fixture() {
  psql "$SITE_DB_URL" -v ON_ERROR_STOP=1 -q <<SQL
SET session_replication_role = replica;
DO \$\$
DECLARE
  request_ids uuid[] := ARRAY(
    SELECT id FROM public.site_requests WHERE project_id = '$PROJECT_ID'
  );
BEGIN
  DELETE FROM public.site_binder_entries WHERE request_id = ANY(request_ids);
  DELETE FROM public.site_deliverable_dimensions
  WHERE deliverable_id IN (
    SELECT id FROM public.site_deliverables WHERE request_id = ANY(request_ids)
  );
  DELETE FROM public.site_deliverable_media
  WHERE deliverable_id IN (
    SELECT id FROM public.site_deliverables WHERE request_id = ANY(request_ids)
  );
  DELETE FROM public.site_deliverables WHERE request_id = ANY(request_ids);
  DELETE FROM public.site_request_events WHERE request_id = ANY(request_ids);
  DELETE FROM public.site_request_access WHERE request_id = ANY(request_ids);
  UPDATE public.site_request_items SET current_version_id = NULL
  WHERE request_id = ANY(request_ids);
  DELETE FROM public.site_request_item_versions
  WHERE item_id IN (
    SELECT id FROM public.site_request_items WHERE request_id = ANY(request_ids)
  );
  DELETE FROM public.site_request_items WHERE request_id = ANY(request_ids);
  DELETE FROM public.site_requests WHERE id = ANY(request_ids);
END
\$\$;
DELETE FROM public.sms_messages WHERE project_id = '$PROJECT_ID';
DELETE FROM public.sms_conversations WHERE active_project_id = '$PROJECT_ID';
DELETE FROM public.project_parties WHERE id = '$PARTY_ID';
DELETE FROM public.project_rooms WHERE id = '$ROOM_ID';
DELETE FROM public.projects WHERE id = '$PROJECT_ID';
SET session_replication_role = origin;
SQL
}
cleanup_all() {
  cleanup_fixture >/dev/null 2>&1 || true
  rm -rf -- "$PROBE_TMP"
}
trap cleanup_all EXIT
cleanup_fixture >/dev/null

eval "$(supabase status -o env)"
if [[ -z "${ANON_KEY:-}" || -z "${SERVICE_ROLE_KEY:-}" ]]; then
  echo "Supabase local API keys are unavailable." >&2
  exit 1
fi

AUTH_RESPONSE="$(curl --fail-with-body -sS \
  -X POST "$SITE_API_URL/auth/v1/token?grant_type=password" \
  -H "apikey: $ANON_KEY" \
  -H 'Content-Type: application/json' \
  --data '{"email":"designer@patina.dev","password":"password123"}')"
DESIGNER_JWT="$(jq -er '.access_token' <<<"$AUTH_RESPONSE")"

REQUEST_ID="$(psql "$SITE_DB_URL" -v ON_ERROR_STOP=1 -qAt <<SQL
INSERT INTO public.projects (id, name, designer_id, created_by)
VALUES ('$PROJECT_ID', 'Site Dispatch Live Probe', '$DESIGNER_ID', '$DESIGNER_ID');
INSERT INTO public.project_rooms (id, project_id, name, sort_order)
VALUES ('$ROOM_ID', '$PROJECT_ID', 'Dispatch Probe Room', 0);
INSERT INTO public.project_parties (
  id, project_id, party_kind, display_name, phone, trade, sms_consent_status
) VALUES (
  '$PARTY_ID', '$PROJECT_ID', 'gc', 'Casey Dispatch', '3125550188',
  'General contractor', 'not_asked'
);
WITH claims AS MATERIALIZED (
  SELECT set_config(
    'request.jwt.claims',
    json_build_object('sub', '$DESIGNER_ID', 'role', 'authenticated')::text,
    false
  )
)
SELECT public.site_request_create_draft(
  '$PROJECT_ID', '$PARTY_ID', now() + interval '2 days',
  'before drywall', 'Dispatch live probe',
  jsonb_build_array(jsonb_build_object(
    'sort_order', 0, 'kit_code', 'K-01', 'title', 'Dispatch measurement',
    'room_id', '$ROOM_ID',
    'configuration', jsonb_build_object(
      'dimensions', jsonb_build_array('Width')
    )
  ))
) FROM claims;
SQL
)"

dispatch_as() {
  local bearer="$1"
  local body="$2"
  local output="$3"
  curl -sS -o "$output" -w '%{http_code}' \
    -X POST "$SITE_API_URL/functions/v1/site-request-dispatch" \
    -H "apikey: $ANON_KEY" \
    -H "Authorization: Bearer $bearer" \
    -H 'Content-Type: application/json' \
    --data "$body"
}

SEND_STATUS="$(dispatch_as "$DESIGNER_JWT" \
  "$(jq -cn --arg request "$REQUEST_ID" '{action:"send",request_id:$request}')" \
  "$PROBE_TMP/send.json")"
if [[ "$SEND_STATUS" != "200" ]]; then
  cat "$PROBE_TMP/send.json" >&2
  echo "Authenticated send failed with HTTP $SEND_STATUS." >&2
  exit 1
fi
jq -e '.status == "awaiting_consent"' "$PROBE_TMP/send.json" >/dev/null
psql "$SITE_DB_URL" -v ON_ERROR_STOP=1 -At <<SQL >/dev/null
DO \$\$
BEGIN
  ASSERT (
    SELECT status = 'awaiting_consent'
    FROM public.site_requests WHERE id = '$REQUEST_ID'
  ), 'send did not enter awaiting_consent';
  ASSERT NOT EXISTS (
    SELECT 1 FROM public.site_request_access WHERE request_id = '$REQUEST_ID'
  ), 'consent invite minted guest access';
  ASSERT (
    SELECT sms_consent_status = 'pending'
    FROM public.project_parties WHERE id = '$PARTY_ID'
  ), 'party did not enter pending consent';
  ASSERT EXISTS (
    SELECT 1 FROM public.sms_messages
    WHERE project_id = '$PROJECT_ID'
      AND template_key = 'sms_optin_invite'
      AND body NOT LIKE '%/field/%'
  ), 'consent invite was missing or leaked a request link';
END
\$\$;
SQL
echo "live authenticated send + link-free consent gate: pass"

psql "$SITE_DB_URL" -v ON_ERROR_STOP=1 -q \
  -c "UPDATE public.project_parties SET sms_consent_status = 'granted' WHERE id = '$PARTY_ID';"

DISPATCHED=0
for _ in $(seq 1 40); do
  DISPATCHED="$(psql "$SITE_DB_URL" -Atc \
    "SELECT count(*) FROM public.site_request_access WHERE request_id = '$REQUEST_ID' AND link_dispatched_at IS NOT NULL;")"
  [[ "$DISPATCHED" == "1" ]] && break
  sleep 0.25
done
if [[ "$DISPATCHED" != "1" ]]; then
  echo "Consent-granted dispatch was not acknowledged by the server." >&2
  exit 1
fi
psql "$SITE_DB_URL" -v ON_ERROR_STOP=1 -At <<SQL >/dev/null
DO \$\$
BEGIN
  ASSERT (
    SELECT status = 'sent' AND consent_status_snapshot = 'granted'
    FROM public.site_requests WHERE id = '$REQUEST_ID'
  ), 'consent bridge did not send the request';
  ASSERT EXISTS (
    SELECT 1 FROM public.sms_messages
    WHERE project_id = '$PROJECT_ID'
      AND template_key = 'site_request_send'
      AND body LIKE '%/field/%'
  ), 'consent bridge did not queue the private link';
END
\$\$;
SQL
echo "live YES-consent bridge + acknowledged link dispatch: pass"

NUDGE_BODY="$(jq -cn --arg request "$REQUEST_ID" \
  '{action:"nudge",request_id:$request,note:"Checking in from the local probe."}')"
NUDGE_ONE="$(dispatch_as "$DESIGNER_JWT" "$NUDGE_BODY" "$PROBE_TMP/nudge-one.json")"
NUDGE_TWO="$(dispatch_as "$DESIGNER_JWT" "$NUDGE_BODY" "$PROBE_TMP/nudge-two.json")"
if [[ "$NUDGE_ONE" != "200" || "$NUDGE_TWO" != "409" ]]; then
  echo "Nudge daily limit returned HTTP $NUDGE_ONE then $NUDGE_TWO." >&2
  exit 1
fi
echo "live authenticated nudge + 1/day enforcement: pass"

psql "$SITE_DB_URL" -v ON_ERROR_STOP=1 -q \
  -c "UPDATE public.site_requests SET due_at = now() + interval '1 hour', due_reminder_sent_at = NULL WHERE id = '$REQUEST_ID';"
LIFECYCLE_BODY='{"action":"lifecycle"}'
LIFECYCLE_ONE="$(dispatch_as "$SERVICE_ROLE_KEY" "$LIFECYCLE_BODY" \
  "$PROBE_TMP/lifecycle-one.json")"
LIFECYCLE_TWO="$(dispatch_as "$SERVICE_ROLE_KEY" "$LIFECYCLE_BODY" \
  "$PROBE_TMP/lifecycle-two.json")"
if [[ "$LIFECYCLE_ONE" != "200" || "$LIFECYCLE_TWO" != "200" ]]; then
  cat "$PROBE_TMP/lifecycle-one.json" >&2
  cat "$PROBE_TMP/lifecycle-two.json" >&2
  echo "Service lifecycle failed with HTTP $LIFECYCLE_ONE then $LIFECYCLE_TWO." >&2
  exit 1
fi
jq -e '.dueRemindersSent == 1' "$PROBE_TMP/lifecycle-one.json" >/dev/null
jq -e '.dueRemindersSent == 0' "$PROBE_TMP/lifecycle-two.json" >/dev/null
echo "live once-only due reminder + deferred SMS bookkeeping: pass"

echo "Field Site Request live dispatch loop: PASS"
