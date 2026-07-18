#!/usr/bin/env bash
set -euo pipefail

SITE_DB_URL="${SITE_DB_URL:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}"
SITE_API_URL="${SITE_API_URL:-http://127.0.0.1:54321}"
SITE_ASSET="${SITE_ASSET:-services/aesthete-inference/tests/fixtures/img-circle.png}"

case "$SITE_DB_URL $SITE_API_URL" in
  *127.0.0.1* | *localhost*) ;;
  *)
    echo "Refusing to run the destructive fixture probe against a non-local endpoint." >&2
    exit 2
    ;;
esac

if [[ ! -f "$SITE_ASSET" ]]; then
  echo "Probe asset not found: $SITE_ASSET" >&2
  exit 2
fi

PROBE_TMP="$(mktemp -d)"
DESIGNER_ID="f3740000-0000-4000-8000-000000000001"
PROJECT_ID="f3740000-0000-4000-8000-000000000101"
ROOM_ID="f3740000-0000-4000-8000-000000000201"
PARTY_ID="f3740000-0000-4000-8000-000000000301"

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
  DELETE FROM public.site_request_delivery_notification_outbox
  WHERE request_id = ANY(request_ids);
  DELETE FROM public.site_request_dispatch_outbox
  WHERE request_id = ANY(request_ids);
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
DELETE FROM public.project_parties WHERE id = '$PARTY_ID';
DELETE FROM public.project_rooms WHERE id = '$ROOM_ID';
DELETE FROM public.projects WHERE id = '$PROJECT_ID';
DELETE FROM public.profiles WHERE id = '$DESIGNER_ID';
DELETE FROM auth.users WHERE id = '$DESIGNER_ID';
SET session_replication_role = origin;
SQL
}

cleanup_all() {
  if [[ "${SITE_KEEP_FIXTURE:-0}" != "1" ]]; then
    cleanup_fixture >/dev/null 2>&1 || true
  fi
  rm -rf -- "$PROBE_TMP"
}
trap cleanup_all EXIT
cleanup_fixture >/dev/null

FIXTURE_ROW="$(
  psql "$SITE_DB_URL" -v ON_ERROR_STOP=1 -qAt -F '|' <<SQL
INSERT INTO auth.users (
  id, email, encrypted_password, email_confirmed_at, created_at, updated_at,
  instance_id, aud, role
) VALUES (
  '$DESIGNER_ID', 'site-live-probe@test.invalid', '', now(), now(), now(),
  '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'
);
INSERT INTO public.profiles (id, email, full_name, created_at, updated_at)
VALUES (
  '$DESIGNER_ID', 'site-live-probe@test.invalid', 'Site Probe Designer', now(), now()
)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name;
INSERT INTO public.projects (id, name, designer_id, created_by)
VALUES ('$PROJECT_ID', 'Site Request Live Probe', '$DESIGNER_ID', '$DESIGNER_ID');
INSERT INTO public.project_rooms (id, project_id, name, sort_order)
VALUES ('$ROOM_ID', '$PROJECT_ID', 'Probe Room', 0);
INSERT INTO public.project_parties (
  id, project_id, party_kind, display_name, phone, trade, sms_consent_status
) VALUES (
  '$PARTY_ID', '$PROJECT_ID', 'gc', 'Casey Probe', '3125550199',
  'General contractor', 'granted'
);

WITH claims AS MATERIALIZED (
  SELECT set_config(
    'request.jwt.claims',
    json_build_object('sub', '$DESIGNER_ID', 'role', 'authenticated')::text,
    false
  )
), draft AS MATERIALIZED (
  SELECT public.site_request_create_draft(
    '$PROJECT_ID', '$PARTY_ID', now() + interval '2 days',
    'before drywall', 'Live local HTTP probe',
    jsonb_build_array(
      jsonb_build_object(
        'sort_order', 0, 'kit_code', 'K-01', 'title', 'Probe opening',
        'guidance', 'Measure width.', 'room_id', '$ROOM_ID',
        'configuration', jsonb_build_object(
          'dimensions', jsonb_build_array(
            jsonb_build_object('id', 'width', 'label', 'Width')
          )
        )
      ),
      jsonb_build_object(
        'sort_order', 1, 'kit_code', 'K-02', 'title', 'Probe photo',
        'guidance', 'Photograph the opening.', 'room_id', '$ROOM_ID',
        'configuration', jsonb_build_object(
          'shots', jsonb_build_array(
            jsonb_build_object('id', 'wide', 'label', 'Wide view')
          )
        )
      )
    )
  ) AS request_id
  FROM claims
)
SELECT
  draft.request_id
FROM draft;
SQL
)"
if [[ -z "$FIXTURE_ROW" ]]; then
  echo "Fixture creation returned no request row." >&2
  exit 1
fi
REQUEST_ID="$FIXTURE_ROW"
ITEM_ROW="$(psql "$SITE_DB_URL" -v ON_ERROR_STOP=1 -qAt -F '|' <<SQL
SELECT
  max(i.id::text) FILTER (WHERE iv.kit_code = 'K-01'),
  max(iv.id::text) FILTER (WHERE iv.kit_code = 'K-01'),
  max(i.id::text) FILTER (WHERE iv.kit_code = 'K-02'),
  max(iv.id::text) FILTER (WHERE iv.kit_code = 'K-02')
FROM public.site_request_items i
JOIN public.site_request_item_versions iv ON iv.id = i.current_version_id
WHERE i.request_id = '$REQUEST_ID';
SQL
)"
IFS='|' read -r MEASURE_ITEM MEASURE_VERSION PHOTO_ITEM PHOTO_VERSION \
  <<<"$ITEM_ROW"

TOKEN="$(psql "$SITE_DB_URL" -v ON_ERROR_STOP=1 -qAt <<SQL
WITH claims AS MATERIALIZED (
  SELECT set_config(
    'request.jwt.claims',
    json_build_object('sub', '$DESIGNER_ID', 'role', 'authenticated')::text,
    false
  )
), sent AS MATERIALIZED (
  SELECT public.site_request_send(
    '$REQUEST_ID', now() + interval '3 days'
  ) AS result
  FROM claims
), claimed AS MATERIALIZED (
  SELECT public.site_request_claim_dispatch(
    (sent.result->>'outbox_id')::uuid, now()
  ) AS result
  FROM sent
), completed AS MATERIALIZED (
  SELECT public.site_request_complete_dispatch(
    (claimed.result->>'outbox_id')::uuid,
    'sent', 'live-guest-probe', NULL, now()
  ) AS result
  FROM claimed
)
SELECT claimed.result->>'token'
FROM claimed, completed;
SQL
)"

if [[ ! "$TOKEN" =~ ^sr_[A-Za-z0-9_-]{43}$ || -z "$PHOTO_VERSION" || -z "$MEASURE_VERSION" ]]; then
  echo "Fixture creation did not return the guest contract." >&2
  exit 1
fi

guest_post() {
  local action="$1"
  local body="$2"
  curl --fail-with-body -sS \
    -X POST "$SITE_API_URL/functions/v1/site-request-guest/$action" \
    -H "Authorization: Bearer $TOKEN" \
    -H 'Content-Type: application/json' \
    --data "$body"
}

BOOTSTRAP="$(guest_post bootstrap '{}')"
jq -e \
  --arg request "$REQUEST_ID" \
  --arg measure "$MEASURE_VERSION" \
  --arg photo "$PHOTO_VERSION" \
  '.request.request.id == $request
    and (.request.items | length) == 2
    and any(.request.items[]; .current_version_id == $measure)
    and any(.request.items[]; .current_version_id == $photo)' \
  <<<"$BOOTSTRAP" >/dev/null
echo "live guest bootstrap: pass"

MEASURE_ATTEMPT="$(uuidgen | tr '[:upper:]' '[:lower:]')"
MEASURE_BODY="$(jq -cn \
  --arg version "$MEASURE_VERSION" \
  --arg attempt "$MEASURE_ATTEMPT" \
  '{
    itemVersionId: $version,
    clientAttemptId: $attempt,
    payload: {kit_code: "K-01", display_unit: "in"},
    dimensions: [{label: "Width", value_mm: 914}],
    capturedByName: "Casey Probe",
    capturedAt: "2026-07-18T05:00:00.000Z"
  }')"
MEASURE_DELIVERY="$(guest_post deliver "$MEASURE_BODY")"
MEASURE_DELIVERABLE="$(jq -er '.delivery.deliverable_id' <<<"$MEASURE_DELIVERY")"
MEASURE_REPLAY="$(guest_post deliver "$MEASURE_BODY")"
jq -e '.delivery.idempotent == true' <<<"$MEASURE_REPLAY" >/dev/null
echo "live K-01 delivery + idempotent replay: pass"

ASSET_SIZE="$(wc -c < "$SITE_ASSET" | tr -d ' ')"
ASSET_SHA="$(shasum -a 256 "$SITE_ASSET" | awk '{print $1}')"

upload_photo_attempt() {
  local attempt="$1"
  local filename="$2"
  local intent_body intent media_id upload_url upload_status receipt_body delivery_body

  intent_body="$(jq -cn \
    --arg version "$PHOTO_VERSION" \
    --arg attempt "$attempt" \
    --arg filename "$filename" \
    --arg checksum "$ASSET_SHA" \
    --argjson size "$ASSET_SIZE" \
    '{
      itemVersionId: $version,
      clientAttemptId: $attempt,
      filename: $filename,
      mimeType: "image/png",
      checksumSha256: $checksum,
      sizeBytes: $size
    }')"
  intent="$(guest_post upload-intent "$intent_body")"
  media_id="$(jq -er '.mediaId' <<<"$intent")"
  upload_url="$(jq -er '.uploadUrl' <<<"$intent")"
  jq -e \
    --arg request "$REQUEST_ID" \
    --arg version "$PHOTO_VERSION" \
    '.bucketId == "site-requests"
      and (.objectPath | startswith($request + "/" + $version + "/"))' \
    <<<"$intent" >/dev/null

  upload_status="$(curl -sS -o "$PROBE_TMP/upload.json" -w '%{http_code}' \
    -X PUT "$upload_url" \
    -H 'x-upsert: false' \
    -F 'cacheControl=3600' \
    -F "=@$SITE_ASSET;type=image/png")"
  if [[ "$upload_status" -lt 200 || "$upload_status" -ge 300 ]]; then
    cat "$PROBE_TMP/upload.json" >&2
    echo "Signed Storage upload failed with HTTP $upload_status" >&2
    return 1
  fi

  receipt_body="$(jq -c --arg media "$media_id" '. + {mediaId: $media}' <<<"$intent_body")"
  guest_post receipt "$receipt_body" >"$PROBE_TMP/receipt.json"
  jq -e '.receipt.upload_state == "uploaded"' "$PROBE_TMP/receipt.json" >/dev/null

  delivery_body="$(jq -cn \
    --arg version "$PHOTO_VERSION" \
    --arg attempt "$attempt" \
    --arg media "$media_id" \
    '{
      itemVersionId: $version,
      clientAttemptId: $attempt,
      payload: {
        kit_code: "K-02",
        shots: [{id: "wide", label: "Wide view", status: "captured", media_id: $media}]
      },
      dimensions: [],
      capturedByName: "Casey Probe",
      capturedAt: "2026-07-18T05:01:00.000Z"
    }')"
  guest_post deliver "$delivery_body"
}

PHOTO_ATTEMPT_ONE="$(uuidgen | tr '[:upper:]' '[:lower:]')"
PHOTO_DELIVERY_ONE="$(upload_photo_attempt "$PHOTO_ATTEMPT_ONE" 'probe-one.png')"
PHOTO_DELIVERABLE_ONE="$(jq -er '.delivery.deliverable_id' <<<"$PHOTO_DELIVERY_ONE")"
echo "live signed upload + receipt + K-02 delivery: pass"

designer_rpc() {
  local expression="$1"
  psql "$SITE_DB_URL" -v ON_ERROR_STOP=1 -At <<SQL
WITH claims AS MATERIALIZED (
  SELECT set_config(
    'request.jwt.claims',
    json_build_object('sub', '$DESIGNER_ID', 'role', 'authenticated')::text,
    false
  )
)
SELECT $expression FROM claims;
SQL
}

MEASURE_APPROVAL="$(designer_rpc \
  "public.site_request_approve_item('$MEASURE_ITEM', '$MEASURE_DELIVERABLE', '$ROOM_ID')")"
PHOTO_APPROVAL_ONE="$(designer_rpc \
  "public.site_request_approve_item('$PHOTO_ITEM', '$PHOTO_DELIVERABLE_ONE', '$ROOM_ID')")"
jq -e '.binder_entry_id != null' <<<"$MEASURE_APPROVAL" >/dev/null
jq -e '.binder_entry_id != null' <<<"$PHOTO_APPROVAL_ONE" >/dev/null
MEASURE_APPROVAL_REPLAY="$(designer_rpc \
  "public.site_request_approve_item('$MEASURE_ITEM', '$MEASURE_DELIVERABLE', '$ROOM_ID')")"
jq -e '.idempotent == true' <<<"$MEASURE_APPROVAL_REPLAY" >/dev/null
echo "live atomic approval + idempotent replay: pass"

designer_rpc "public.site_request_redo_item('$PHOTO_ITEM', 'Please retake the wide view in daylight.')" >/dev/null
REDO_BOOTSTRAP="$(guest_post bootstrap '{}')"
jq -e \
  --arg item "$PHOTO_ITEM" \
  'any(.request.items[];
    .id == $item
    and .status == "redo_requested"
    and (.deliveries | length) == 1)' \
  <<<"$REDO_BOOTSTRAP" >/dev/null

PHOTO_ATTEMPT_TWO="$(uuidgen | tr '[:upper:]' '[:lower:]')"
PHOTO_DELIVERY_TWO="$(upload_photo_attempt "$PHOTO_ATTEMPT_TWO" 'probe-two.png')"
PHOTO_DELIVERABLE_TWO="$(jq -er '.delivery.deliverable_id' <<<"$PHOTO_DELIVERY_TWO")"
PHOTO_APPROVAL_TWO="$(designer_rpc \
  "public.site_request_approve_item('$PHOTO_ITEM', '$PHOTO_DELIVERABLE_TWO', '$ROOM_ID')")"
jq -e '.binder_entry_id != null' \
  <<<"$PHOTO_APPROVAL_TWO" >/dev/null
echo "live single-item redo + redelivery + Binder supersession: pass"

psql "$SITE_DB_URL" -v ON_ERROR_STOP=1 -At <<SQL >/dev/null
DO \$\$
BEGIN
  ASSERT (
    SELECT count(*) = 1 FROM public.site_deliverables
    WHERE item_id = '$MEASURE_ITEM' AND status = 'delivered'
  ), 'K-01 replay created a duplicate delivery';
  ASSERT (
    SELECT count(*) = 2 FROM public.site_deliverables
    WHERE item_id = '$PHOTO_ITEM' AND status = 'delivered'
  ), 'photo redo did not preserve exactly two attempts';
  ASSERT (
    SELECT count(*) = 2 FROM public.site_binder_entries
    WHERE item_id = '$PHOTO_ITEM'
  ), 'Binder did not preserve both approved photo versions';
  ASSERT (
    SELECT count(*) = 1 FROM public.site_binder_current
    WHERE item_id = '$PHOTO_ITEM'
  ), 'Binder current projection is not singular';
  ASSERT (
    SELECT bool_and(upload_state = 'uploaded')
    FROM public.site_deliverable_media m
    JOIN public.site_deliverables d ON d.id = m.deliverable_id
    WHERE d.request_id = '$REQUEST_ID'
  ), 'server did not acknowledge every uploaded object';
END
\$\$;
SQL
echo "live server-side DB + Storage evidence: pass"

designer_rpc "public.site_request_revoke_access('$REQUEST_ID', 'live probe complete')" >/dev/null
REVOKED_STATUS="$(curl -sS -o "$PROBE_TMP/revoked.json" -w '%{http_code}' \
  -X POST "$SITE_API_URL/functions/v1/site-request-guest/bootstrap" \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  --data '{}')"
if [[ "$REVOKED_STATUS" != "404" ]]; then
  echo "Revoked guest token returned HTTP $REVOKED_STATUS, expected 404." >&2
  exit 1
fi
echo "live revoked-token denial: pass"

echo "Field Site Request live guest loop: PASS"
