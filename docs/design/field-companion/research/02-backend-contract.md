# D2 — Field Capture Backend Contract (research, read-only)

Scope per brief: `supabase/migrations`, `supabase/functions`, `supabase/config.toml`,
storage bucket policies, `packages/supabase/src/hooks`, `services/media`. All claims
below are grep/read-verified against the checked-out tree at HEAD unless marked
**[inference]**. File:line citations are given wherever useful.

**Filesystem migration ledger head: `00513`** (`00513_invoice_numbering_studio_uniqueness.sql`).
481 files under `supabase/migrations/`. See "Numbering hazards" at the end — there
are real gaps in the 00480s–00510s range that matter for whoever mints the next
field-companion migration.

---

## 1. Entity map

### 1.1 Field Capture inbox (P0 — "tag a specimen at a market")

**`field_captures`** — `supabase/migrations/00233_field_captures_inbox.sql`
One row per capture made in Patina Field (product tag, photos, voice note, barcode,
venue pin). Idempotent on `client_capture_id` (device-generated UUID).

Key columns:
- Lifecycle: `status` (`queued|synced|inbox|saved|dismissed`), `destination` (`library|inbox`)
- Owner: `designer_id` (FK `profiles`, `ON DELETE CASCADE`), `organization_id` (nullable, FK `organizations`)
- Commit result: `product_id` (FK `products`, `ON DELETE SET NULL`), `committed_at`
- Captured "tag": `title, notes, category, subcategory, dimensions jsonb, materials[], colors[], style_tags[], material_tags[], finish, vendor_name, vendor_id, sku, price_trade_cents, price_retail_cents, barcode_value, barcode_symbology, catalog_match_product_id`
- **Voice note**: `voice_audio_path text, voice_transcript text, voice_partial_transcript text, voice_duration_seconds numeric` — see §5, transcription is on-device, this table only carries the resulting text + a storage path to the raw audio
- Photos: `photos jsonb[]`, `primary_photo_path`, `thumbnail_url`
- Provenance/inference: `provenance jsonb`, `guesses jsonb`
- Geo: `captured_lat/lng`, `captured_accuracy_m`, `venue_label`, `venue_place_id`, `captured_at`, `captured_timezone`
- **Optional project routing**: `project_id` (FK `projects`, `ON DELETE SET NULL`), `project_room_id` (FK `project_rooms`), `shelf` — **these ARE real columns** (contra a stale assumption in project memory that association lives only in `provenance`; that statement is true for the *scan-context* capture flow (§1.3) but not for `field_captures.project_id/project_room_id`, which are set by `commit_field_capture`'s library branch, 00235)
- Resumable upload pipeline (mirrors `room_scans`/00082): `media_manifest_url, artifacts_sha256 jsonb, upload_progress smallint, upload_completed_at, upload_error`
- Envelope: `raw_payload jsonb, device_model, os_version, app_version, capture_schema_version, synced_at`

RLS: owner (`designer_id = auth.uid()`) full CRUD; studio co-members get **SELECT only**, and only for rows with `status = 'inbox'` AND `organization_id` in their active memberships (`field_captures_org_inbox_select`, 00233). No delegated read to a project's other designers/co-members outside that inbox-share case — **this is a materially narrower RLS model than `room_scans`/`room_files`** (see §1.3 "RLS asymmetry" callout, which the code itself documents as a known gap).

A `BEFORE INSERT/UPDATE` trigger (`field_captures_guard_routing`) hard-blocks routing a capture to a `project_id`/`project_room_id`/`organization_id` the caller doesn't own/belong to — runs `SECURITY INVOKER` so the ownership checks themselves ride RLS.

**`products`** capture-origin columns — `00232_products_field_capture_origin.sql`:
`capture_source text CHECK IN ('web_extension','portal','field_capture','manual','import')`, `capture_provenance jsonb`, `field_capture_id uuid` (FK → `field_captures.id`, added by 00233 once the table exists). A field-capture-origin product must be `layer='personal'` with `owner_user_id` set (`NOT VALID` check, back-fill-safe).

### 1.2 Storage: `capture-media` bucket

`supabase/migrations/00234_capture_media_bucket.sql`. **Private**, 500 MB limit.
Allowed MIME types explicitly include audio: `image/heic, image/jpeg, image/png,
image/webp, audio/mp4, audio/x-m4a, audio/aac, audio/wav, application/json,
application/octet-stream`. **Voice-note audio IS uploaded here** — the bucket was
designed for it from day one; this contradicts an "audio-write seam TODO" note in
project memory for the *earlier* P1 rig, which is a distinct (room-scan) code path.
Path convention (policy-enforced via `storage.foldername(name)[1]`):
`capture-media/<auth.uid()>/<client_capture_id>/<artifact>`. All 4 object policies
(`SELECT/INSERT/UPDATE/DELETE`) gate on `auth.uid()::text = foldername[1]` — strictly
owner-scoped, no studio co-member storage access even when the row itself is
inbox-shared.

### 1.3 Site-scan / Room File pipeline (P1/P2 — LiDAR room capture)

Base tables `rooms` / `room_scans` predate this program (00019/00020/00077/00082) and
were deliberately **not** re-created — 00341 explicitly rules "no new
rooms/scans/capture_bundles/assets tables" (ruling R-a). `room_scans` carries the
resumable-upload columns (`bundle_manifest_url, artifacts_sha256, upload_progress,
scan_schema_version`) that `field_captures` mirrors.

New tables from **`00341_field_capture_p1_schema.sql`** (additive, R-b), all FK'ing
`room_scans(id)`:
- **`scan_anchors`** — typed ground-truth anchor (two taps + a typed tape/laser
  value). Owner-writable (device posts these), RLS `scan_anchors_select` delegates
  read to *any* row visible via `room_scans` (no ownership filter on read — broad,
  by design). `endpoint_a/endpoint_b jsonb {x,y,z}` model-space metres,
  `measured_value_mm integer`.
- **`room_files`** — versioned deliverable, append-only (`UNIQUE(scan_id, version)`,
  never UPDATE-in-place). `unverified boolean`, `certificate jsonb`,
  `tolerance_class`, `svg_url/pdf_url/dxf_url`, `drawings jsonb` (full sheet set,
  added 00373), `status CHECK IN ('pending','solved','generated','error')`.
  Server-generated only — SELECT delegates to `room_scans` visibility (owner +
  designer-association + studio-co-member all compose, per 00341 comment), no
  client INSERT/UPDATE policy.
- **`room_file_measurements`** — per-dimension provenance, `source CHECK IN
  ('anchor','parametric')` (widened to add `'mesh'` in 00376/P2),
  `tolerance_class CHECK IN ('verified','measured','estimated')`,
  `UNIQUE(room_file_id, element_ref)` guards a racing double-solve. Server-write only.
- **`scan_pipeline_events`** — append-only telemetry, `stage CHECK IN
  ('capture','upload','ingest','solve','drawing','delivery')`, widened by 00376
  (P2) to add `'refine','fuse','splat','present'`. Server-write only.

**P2 additions (`00376_field_capture_p2_present_schema.sql`)**: `room_files` gains a
parallel "Present Layer" (dense mesh + splat walkthrough) alongside the P1 "True
Layer" (measured drawings) on the *same* versioned row — `present_status` is an
independent lifecycle from `status`. `00377_scan_pipeline_present_query_surface.sql`
adds the corresponding read view + GRANT.

**Rendered Room v2 media registry (`00489_media_registry_kernel.sql` +
`00490_scan_worker_roles.sql` + `00494_media_registry.sql` +
`00498_media_upload_intent_and_scan_version_lock.sql`)**: a newer, scan-scoped
`media_objects`-style registry (id/version/bucket/key/checksum/etag/mime/size/
access-class/lifecycle-state/provenance) that `room_files` can point into
(`artifacts`, `verify` columns) instead of storing bare URLs. Explicitly scoped to
the GPU-splat pipeline (**not** field-capture voice/photo media) and explicitly
called out as "mutable until a second consumer adopts it" (00489 header) —
**[inference]** this is a plausible future home for capture-media artifacts if the
program ever wants registry-grade dedup/lifecycle for photos/audio, but nothing
wires `field_captures` into it today. 00490 mints two NOLOGIN capability roles
(`scan_worker`, `scan_reader`) in the `agent_reader`/`agent_writer` family, distinct
from the general Agent OS roles.

**Confirm-scan-bundle** (`supabase/functions/confirm-scan-bundle/index.ts`) is the
sync-completion checkpoint for `room_scans` (not `field_captures` — that has its
own `mark_capture_upload_complete` RPC, §2). It HEAD-checks every populated
artifact-URL column via the RLS-gated `object/info/authenticated/<bucket>/<key>`
endpoint (not a raw public HEAD — private buckets 400 on that), cross-checks the
`photos_manifest.ndjson` line count against `room_scan_images` row count
(informational only, never gates the 409), and on success calls
`mark_scan_upload_complete` RPC. **JWT-forwarding pattern**: no service-role key
used; PostgREST enforces RLS + SECURITY INVOKER RPCs as the caller.

### 1.4 Field Coordination — parties, SMS, tasks, decisions

**`project_parties`** — originally 00212 (GC/vendor/client_rep/other, login-less
"courts"), widened by **`00281_field_parties.sql`** to add `'sub','installer',
'receiver'` kinds plus `trade`, `phone_e164` (normalized via trigger
`normalize_party_phone_e164` calling `normalize_phone_e164`), `sms_consent_status`
(+ timestamps). `project_tasks.owner_*` and `client_decisions.court_*` CHECKs
widened in the same migration so a task/item can sit in a field party's court.

**`sms_conversations` / `sms_messages`** — `00282_sms_core.sql`. Team-scoped SELECT
RLS. Central RPC **`apply_field_effect(...)`** (00282, line 225) is the single
mutation surface an inbound SMS's parsed intent replays against (task/decision
state changes) — **this is the closest existing analog to "structured
note/task/decision extraction from field input"**, but it's driven by SMS text
parsing, not by field_captures voice transcripts. `review_sms_message` (line 489)
is the Desk triage mutation for low-confidence parses
(`sms_messages.needs_review`/`parsed_intent`).

**`field_link_tokens`** — `00283_field_links.sql`. No-auth client-portal field
links (`create_field_link`, `revoke_field_link`, `resolve_field_link` RPCs);
designer-only RLS (`field_link_tokens_designer_all`).

**`field_activity_summary`** view (00282) — read by
`packages/supabase/src/hooks/use-field-activity.ts` → the Desk "In the field"
rollup (`unreviewed_sms_count`, `awaiting_reply_count`,
`overdue_field_task_count` per project). SECURITY INVOKER; RLS on base tables does
the scoping.

**`field-daily`** cron (`00284_field_dispatch_wiring.sql:278`, schedule
`'0 13 * * *'` i.e. 13:00 UTC daily) → `invoke_edge_function('field-daily', '{}')`
→ `supabase/functions/field-daily/core.ts::runFieldDaily`. Per consented
(`sms_consent_status='granted'`) field party (`gc|sub|installer|receiver`) per
project: composes a numbered digest of open owned `project_tasks` + `client_decisions`
pending > 48h in that party's court, persists the numbered menu into
`sms_conversations.state_context.menu` (so an inbound "DONE 2" resolves
deterministically), sends `sms_daily_digest`; separately sends
`sms_delivery_confirm` to receiver/gc parties for `delivery_events` in the next 48h
(deduped via `state_context.delivery_confirms_sent`); flushes deferred outbound rows.

### 1.5 Site Requests — the *designer-initiated* zero-install capture loop

`00374_field_site_request_loop.sql` (huge — ~3500 lines) is a **separate, mature
system** worth naming even though it's the inverse direction of the field-companion
brief (designer → asks a non-app party for specific evidence, rather than a
designer capturing in the field themselves). It is the closest existing precedent
for "capture whatever's needed, land it in the right place" done as a *checklist*:

- `site_requests` (project-scoped, `assignee_party_id`, `status` state machine
  `draft→awaiting_consent→sent→in_progress→delivered→completed→closed|expired`,
  `due_at`, consent snapshot)
- `site_request_items` (ordered checklist items, `status
  open|delivered|redo_requested|approved`)
- `site_request_item_versions` (`kit_code CHECK IN ('K-01','K-02')` — two built-in
  capture kit types, `room_id`, `configuration jsonb`)
- `site_deliverables` / `site_deliverable_media` (checksum-verified, MIME-gated
  photo evidence, `upload_state` lifecycle) / `site_deliverable_dimensions`
  (measured value + proof photo)
- `site_binder_entries` — **append-only, approved** evidence promoted into a
  room's permanent "binder" (project_id/room_id/request_id chain, `supersedes_entry_id`
  for corrections) — this is the pattern a field-companion note/decision/task
  extraction system would likely want to imitate for its own "promote a field
  capture into a durable project record" step.
- `site_request_access` (opaque-token guest sessions) + `site_request_events`
  (append-only audit) + `site_request_dispatch_outbox` /
  `site_request_delivery_notification_outbox` (SMS + notification queues)

Guest-side edge function `site-request-guest` (`verify_jwt = false`) is
token-authenticated in-code (`site_request_guest_bootstrap` etc., all
`SECURITY DEFINER` + service-role-only per the 00374 header) — the opaque
64-hex-char token IS the credential, never a JWT. `site-request-dispatch`
(`verify_jwt = true`) is the designer-authenticated send/resend/nudge/consent
boundary; the `consent-granted` action additionally requires a service_role claim
in-code. Cron: `site-request-lifecycle` every 15 min → `site_request_process_lifecycle`
(expiry + once-only due reminders); `site-request-media-maintenance` every 5 min
(`00375`) creates JPEG derivatives + purges unapproved evidence past a 90-day
retention deadline.

`00469/00470/00471` (`project_contextual_handoffs`,
`site_request_awaiting_consent_handoff`, `site_request_authority_action_detail`)
extend this with a `get_project_contextual_handoffs` RPC (redefined across all
three) and `get_site_request_action_detail` — Desk-surface read models for "what's
blocked on whom" across the site-request lifecycle.

---

## 2. RPC / edge-function contract list

### Field Capture inbox RPCs (`00235`, all `SECURITY INVOKER`, `authenticated` grant, `PUBLIC` revoked)
| RPC | Caller | Inputs | Side effects |
|---|---|---|---|
| `commit_field_capture(p_client_capture_id, p_destination, p_payload, p_project_id?, p_project_room_id?, p_shelf?, p_organization_id?)` | Patina Field (sync) | `FieldCapturePayload` JSONB envelope (documented in the 00235 header comment: title/notes/category/measurements/tag/barcode/attributes/guesses/voice/photos/venue/provenance/device/schemaVersion) | Idempotent upsert into `field_captures` (skips if already `saved`/`dismissed`); `destination='library'` mints a **draft personal-library `products`** row + optional `project_products` link, `EXCEPTION WHEN OTHERS` safe-harbors any failure (bad route, RLS trip) back to `status='inbox'` with the error stashed in `raw_payload.conflict` — sync always converges, never hard-fails the client |
| `route_field_capture(p_capture_id, p_project_id?, p_project_room_id?, p_shelf?)` | Portal (promote an inbox row) | capture id + routing | Wraps `commit_field_capture('library', ...)` using the stored `raw_payload` |
| `dismiss_field_capture(p_capture_id)` | Portal or device | capture id | `status='dismissed'` unless already `saved` |
| `merge_capture_artifact_sha256(p_capture_id, p_kind, p_sha)` | Device (resumable upload) | kind + sha | JSONB-merges into `artifacts_sha256` |
| `mark_capture_upload_complete(p_capture_id)` | Device | capture id | `upload_completed_at=NOW(), upload_progress=100, status: queued→synced` |

### Room-scan / Room File RPCs
- `mark_scan_upload_complete(p_scan_id)` — SECURITY INVOKER (00082 origin), called
  by `confirm-scan-bundle` edge function after all artifact HEAD-checks pass.
- `merge_scan_artifact_sha256` — the 00082 original that `field_captures`'
  equivalent (above) was cloned from.

### Field Coordination
- `apply_field_effect(...)` — `00282_sms_core.sql:225`, the SMS-parsed-intent →
  task/decision state-change replay RPC.
- `review_sms_message(...)` — `00282_sms_core.sql:489`, Desk triage mutation.
- `create_field_link` / `revoke_field_link` / `resolve_field_link` — `00283`.
- `normalize_phone_e164` — `00281`, generic E.164 normalizer used by the party
  phone trigger.

### Site Requests (designer-authored checklist loop — 30+ RPCs in `00374`)
Notable ones: `site_request_create_draft`, `site_request_revise_item`,
`site_request_send` / `_resend` / `_nudge` / `_dispatch_after_consent`,
`site_request_guest_bootstrap` / `_guest_create_upload` / `_guest_ack_upload` /
`_guest_deliver` (the token-authenticated guest capture path),
`site_request_approve_item` / `_redo_item` (promotes/rejects a deliverable),
`site_request_claim_dispatch` / `_complete_dispatch` / `_pending_dispatches` (the
outbox worker contract the edge function polls), `site_request_close`,
`get_site_request_action_detail` (00471).

### Edge functions Field/scan-adjacent code talks to

| Function | verify_jwt | Caller | Purpose |
|---|---|---|---|
| `confirm-scan-bundle` | (no explicit stanza → platform default `true`) | Both iOS apps, JWT-forwarding | Verifies `room_scans` artifact URLs reachable + photo-count cross-check, flips to `ready` |
| `parse-room-scan` | `true` (explicit) | pg_cron sweep every 10 min (`room-scan-parse-sweep`, service-role Bearer) + targeted service-role calls | Parses RoomPlan geometry; requires `role=='service_role'` claim in-code, no browser caller |
| `derive-scan-photo-media` | `true` (explicit) | pg_cron sweep every 5 min + callable `{scanId\|imageId, force?}` | HEIC→JPEG derivatives (512 thumb + 1600 preview) via Cloudflare inference, stamps `room_scan_images.thumbnail_url/preview_url`; requires service_role claim in-code |
| `convert-room-scan-glb` | `true` (explicit) | pg_cron every 15 min + `{scanId, force?}` | USDZ→GLB via aesthete-inference, stamps `room_scans.model_url_gltf` |
| `dispatch-scan-modal` | `true` (explicit) | pg_cron every 5 min | Billing-guarded Modal GPU dispatcher for `scan_pipeline.verify\|splat\|renders` `agent_tasks` (00297 `claim_agent_tasks`) — Rendered Room v2 |
| `field-login-token` | `true` (explicit) | Designer portal ("Connect Patina Field" QR) | Mints a single-use GoTrue magiclink for the **caller's own** email only; portal re-invokes every 60s to rotate the QR |
| `site-request-guest` | `false` | Guest (client-portal-adjacent, no login) | Opaque-token-authenticated; token hash is the sole credential |
| `site-request-dispatch` | `true` (explicit) | Designer portal (send/resend/nudge) + service-role consent-granted bridge | SMS dispatch state machine (see §1.5) |
| `site-request-media-maintenance` | `true` (explicit) | Cron, every 5 min | JPEG derivatives + 90-day evidence purge |
| `field-daily` | (relies on platform default `true`, no explicit stanza — noted as intentional in the `morning-brief` comment) | Cron, daily 13:00 UTC | Field Coordination digest (§1.4) |
| `sms-inbound` | `false` | Twilio webhook | X-Twilio-Signature HMAC verified in-code, not JWT |
| `sms-status` | `false` | Twilio delivery receipts | Same signature scheme |
| `sms-dispatch` | (not seen in the excerpted config; **[gap in this pass]** — not explicitly confirmed, likely platform default `true` since it's invoked from `use-party-sms.ts`'s browser client via `supabase.functions.invoke`) | Portal composer ("Send text") | Authorizes caller against the party's project + consent gate |

No transcription/speech edge function exists anywhere under `supabase/functions/`
(confirmed by directory listing — 68 functions total, none named
transcribe/whisper/speech).

---

## 3. Storage bucket / path conventions (field-relevant)

| Bucket | Public? | Size limit | Path convention | Migration |
|---|---|---|---|---|
| `capture-media` | No | 500 MB | `<uid>/<client_capture_id>/<artifact>` | 00234 |
| `room-scans` | No (private; URLs are "public-shaped" path-carriers only, per confirm-scan-bundle's extensive comment) | — | `{artifactType}/{userId}/{scanId}/…` (per 00077/00287) | 00077 et al. |
| `field-media` | referenced in `use-party-sms.ts` comment ("Field-media MMS/photos resolve to short-lived signed URLs from the private field-media bucket") — **not directly located in the migrations grepped for this pass**; likely created by an SMS/MMS-inbound migration outside the searched table-name list. **[gap — flag for D-follow-up]** | | | |

`00234`'s header explicitly frames `capture-media` as parallel-but-separate from
`product-images` (public, 00057): field capture media is *private to the capturing
designer*, never public by default.

---

## 4. `field_captures` + provenance shape, precisely

The exact `FieldCapturePayload` JSONB shape `commit_field_capture` expects (from
the 00235 header comment, cross-checked against the INSERT's field extraction):

```
{
  title, notes, category, subcategory,
  measurements: { width, height, depth, unit },
  tag: { vendorName, sku, priceTradeCents, priceRetailCents, vendorId },
  barcode: { value, symbology, catalogMatchProductId },
  attributes: { materials[], colors[], finish, styleTags[], materialTags[] },
  guesses: {...},
  voice: { audioPath, transcript, partialTranscript, durationSeconds },
  photos: [{ path, publicUrl, isPrimary, isDuplicate, ... }],
  thumbnailUrl,
  venue: { lat, lng, accuracyM, label, placeId, capturedAt, timezone },
  provenance: {...},
  device: { model, osVersion, appVersion },
  schemaVersion
}
```

**Two distinct provenance shapes coexist and must not be confused:**

1. `field_captures.provenance` (this table) — free-form, whatever the device sends
   in `p_payload.provenance`.
2. The **scan-context capture** flat-key convention consumed by
   `packages/supabase/src/hooks/use-room-files.ts::useScanContextCaptures` (lines
   226–241, 354–390): a *separate* `field_captures` row (same table, `destination`
   presumably `'inbox'`) gets pinned to a room scan via a **flat, dotted top-level
   JSONB key** — `provenance @> {"siteScanContext.scanId": "<scanId>"}` — NOT a
   nested `{siteScanContext:{scanId}}` object. The hook's own comment flags that an
   earlier design doc's nested-path assumption "matches zero real captures." The
   frozen wire contract lives in
   `apps/mobile/Capture/CaptureKit/CaptureKit/SiteScan/ContextCaptureProvenance.swift`.
   This is the mechanism behind the project-memory note "project association lives
   ONLY in provenance.siteScanContext.*" — true for *this* capture flow, but
   `field_captures.project_id`/`project_room_id` columns (§1.1) are a **separate,
   real-column** routing path used by the market/product-tag capture flow via
   `commit_field_capture`'s library branch. Two different association mechanisms
   for two different capture use-cases inside the same table.

---

## 5. Voice / transcription — what exists today

- **On-device only.** `apps/mobile/Capture/Capture/Services/Recognition/SpeechVoiceNoteService.swift`
  uses Apple's `SFSpeechRecognizer` (hardcoded `Locale(identifier: "en-US")`) +
  `AVAudioEngine` for live transcription (comment: "N4 — live, on-device voice
  transcription... mic capture is flaky on Simulator... transcript-entry fallback.
  The raw audio file is always kept alongside the text").
- The raw audio **is** uploaded (capture-media bucket allows `audio/mp4,
  audio/x-m4a, audio/aac, audio/wav`), and its storage path lands in
  `field_captures.voice_audio_path`; the transcript text lands in
  `voice_transcript` / `voice_partial_transcript`.
- **No server-side transcription pipeline exists.** No Whisper/speech-to-text edge
  function, no cron job, no `agent_tasks` task kind for transcription — confirmed
  by repo-wide grep for `transcri|whisper|speech-to-text` across
  `supabase/migrations`, `supabase/functions`, `packages/supabase/src`,
  `services/media`. The only server awareness of "transcript" text is the passive
  `voice_transcript` column and the read of it in
  `useScanContextCaptures`'s selected columns (display only, no processing).
- **Implication**: today's system trusts the phone's live SFSpeechRecognizer output
  entirely. There is no re-transcription path for a voice note captured offline
  (network-degraded field conditions) beyond whatever on-device partial transcript
  was buffered, and no server-side quality/confidence signal on the transcript the
  way `sms_messages.needs_review`/`parsed_intent` exists for SMS.

---

## 6. Portal consumers (hook → component)

| Table/view | Hook | Portal component | Notes |
|---|---|---|---|
| `field_captures` (scan-context rows) | `useScanContextCaptures` (`packages/supabase/src/hooks/use-room-files.ts:370`) | `apps/designer-portal/src/components/room-file/room-file-view.tsx:76` (via `capture-context-section.tsx`) | Only rows whose `provenance` contains the flat `siteScanContext.scanId` key; **documented RLS asymmetry**: this query is owner+org-inbox scoped (00233 RLS) while the `room_files`/`room_file_measurements` it's displayed alongside on the same page delegate to `room_scans`' broader owner+designer-association+studio-co-member visibility — a studio co-member can see a scan's drawings but an *empty* capture-context list even when captures exist. Called out in-code as "a P2 item, not a v0 blocker." |
| `room_files` | `useRoomFiles`, `useGeneratedRoomFilesByScan` | `room-file-view.tsx` + project page's "Room Files" section | Batch sibling avoids a hook-in-a-loop across many scans |
| `room_file_measurements` | `useRoomFileMeasurements` | `room-file-view.tsx` | |
| `field_activity_summary` | `useFieldActivity` (`use-field-activity.ts`) | `apps/designer-portal/src/components/document/field/field-desk.tsx` | 30s poll, the Desk "In the field" rollup; drops zero-activity projects |
| `sms_messages` (party thread) | `usePartySms` family (`use-party-sms.ts`) | `apps/designer-portal/src/components/document/people/party-profile-sheet.tsx` | Also wraps `create_field_link`/`revoke_field_link`; field-media MMS resolves to signed URLs from a `field-media` bucket (see §3 gap) |
| `sms_messages.needs_review` | `use-sms-review.ts` | Desk field-triage queue | 30s poll, matches Post/Desk background-resort cadence |
| **`products` (via `field_capture_id`)** | Personal-library layer hooks (not enumerated by name in this pass — the FK exists, no dedicated "captures inbox" listing hook was found) | Personal Library ("layer-products" query key invalidated on capture-product mutations) | See gap below: no direct portal UI was found that lists raw `field_captures` inbox rows (status='inbox', destination='inbox') for triage the way the SMS-review queue does for texts |

**Notable absence**: `use-capture-product.ts` and `use-capture-from-url.ts` are
**not** part of the Field Capture pipeline — they back the Chrome-extension /
URL-paste product-capture flow into the personal Library (`capture-from-url` edge
function, SSRF-guarded server-side fetch+extract). Easy to conflate by name with
Patina Field's `field_captures` table; they are a completely separate system that
happens to write into the same `products` table with `capture_source='web_extension'`
vs `'field_capture'`.

**No portal inbox-triage UI was located** for raw `field_captures` rows sitting at
`status='inbox'` (i.e., a designer's "review what I tagged today and decide
library vs. discard" screen). The only portal reads of `field_captures` found are
the scan-pinned subset (`useScanContextCaptures`). **[gap — confirm with a portal
route grep before treating as certain; this pass searched hooks + known
components, not every route file]**.

---

## 7. `services/media` (NestJS) — confirmed NOT part of the field-capture path

`services/media/src/modules/upload/upload.controller.ts` exposes `POST /upload`
and `POST /upload/:sessionId/confirm` — this is the **separate** `svc_media`
Prisma-schema NestJS upload-session API (R2/MinIO-backed). Grepped for
`capture-media|room-scans|field_captures|FieldCapture` inside `services/media/src`:
**zero hits**. Field Capture and Room Scan uploads go directly against Supabase
Storage (`capture-media`, `room-scans` buckets) via the iOS app's own resumable
uploader + the RPCs in §2 — they never touch the NestJS `media` service. Worth
stating explicitly since the program overview lists `media` as one of the 3
retained NestJS services; for the field-companion program specifically, it is not
in the data path.

---

## 8. Queue / cron pattern inventory (field-relevant)

All Field/scan crons ride the same `pg_cron → public.invoke_edge_function`
service-role-Bearer bridge as the rest of Agent OS (per CLAUDE.md rule: "Scheduled
jobs = pg_cron... run history = `job_runs`"):

| Job name | Schedule | Target |
|---|---|---|
| `field-daily` | `0 13 * * *` (13:00 UTC) | `field-daily` edge fn |
| `site-request-lifecycle` | every 15 min | `site-request-dispatch` action=`lifecycle` → `site_request_process_lifecycle` |
| `site-request-media-maintenance` | every 5 min | derivatives + 90-day evidence purge |
| `room-scan-parse-sweep` | every 10 min | `parse-room-scan` |
| `room-scan-glb-sweep` | every 15 min | `convert-room-scan-glb` |
| `room-scan-photo-derivative-sweep` | every 5 min | `derive-scan-photo-media` |
| `dispatch-scan-modal-sweep` | every 5 min | `dispatch-scan-modal` (billing-guarded, checks `agent_tasks` non-empty before any Modal HTTP call) |
| `expire-stale-upload-intents-daily` | 07:15 UTC | `public.expire_stale_upload_intents()` — direct SQL, no edge fn (00501) |

**`agent_tasks` task kinds observed touching this domain**: `scan_pipeline.verify`,
`scan_pipeline.splat`, `scan_pipeline.renders` (claimed by `dispatch-scan-modal` via
`claim_agent_tasks`, 00297). No `agent_tasks` kind exists yet for "transcribe a
voice note," "extract a task/decision from field input," or "associate a capture
with a project" — those would be new task kinds per the Agent OS convention
(`enqueue_agent_task`, never a direct table write) if the program routes that work
through the agent queue rather than a dedicated edge function/cron.

`field_captures`' own upload-completion path (`mark_capture_upload_complete`) is
**not** cron-swept the way `room_scans` is — there is no equivalent of
`confirm-scan-bundle` wired to a cron for `field_captures`; it appears to rely
entirely on the device calling `mark_capture_upload_complete` directly once its
own upload loop finishes. **[inference — no direct edge-function/cron artifact
verification step for field_captures uploads was found; if the device sync dies
mid-upload, nothing server-side seems to catch and re-verify a stuck
`queued`/`synced` row]**.

---

## 9. GAPS

1. **Server-side transcription**: none exists (§5). Everything today is on-device
   `SFSpeechRecognizer`, English-locale-hardcoded, no fallback re-transcription
   path, no confidence signal, no multi-language support. A server-side
   transcription program would need: (a) a place for it to run — an edge function
   (Deno, so no native Whisper — would need an external API call, e.g. OpenAI/
   Deepgram/AssemblyAI, similar to how `capture-from-url` already makes outbound
   HTTP from an edge function) invoked from a cron sweep over `field_captures`
   rows with `voice_audio_path IS NOT NULL AND voice_transcript IS NULL` (or a
   confidence threshold), mirroring the `derive-scan-photo-media` sweep pattern
   exactly; (b) per repo convention, this is edge-fn + cron, not `agent_tasks` —
   the derived-media crons (photo/GLB derivatives) are the closest precedent and
   don't use the agent queue at all, they just sweep a table for a null/stale
   column.

2. **Structured note/task/decision extraction from field input**: `apply_field_effect`
   (00282) already does exactly this shape of work — parses a structured intent and
   replays it as a `project_tasks`/`client_decisions` state change — but only for
   **inbound SMS text**, not for `field_captures.voice_transcript` or `.notes`.
   There is no RPC or edge function that reads a `field_captures` row's transcript/
   notes and proposes/creates a task or decision. Building this would plausibly
   reuse `apply_field_effect`'s shape (a `p_effect` JSONB the caller supplies) but
   needs its own trigger point — nothing currently fires on `field_captures` insert/
   update the way SMS inbound triggers a parse. Per Agent OS rules (CLAUDE.md): any
   automated extraction that *writes* business data must go through
   `enqueue_agent_task` → `agent_writer`, not a direct table write from an edge
   function, and any output aimed at an external party must land `awaiting_review`
   (not applicable here since tasks/decisions are internal, but the "drafts land
   awaiting_review" convention for anything client-facing would apply if extracted
   notes ever surface to a client).

3. **Capture → project/room association**: two incompatible mechanisms already
   coexist in the *same* table (§4) — real FK columns
   (`project_id`/`project_room_id`) for the market/product-tag flow vs. a flat
   dotted-JSONB-key convention (`provenance @> {"siteScanContext.scanId": ...}`)
   for the scan-context flow. A field-companion "capture whatever, land it in the
   right place" feature touching both capture types needs to either (a) pick one
   mechanism and migrate, or (b) explicitly handle both, because a single
   `useCaptures`-style hook cannot filter both classes with one predicate today.
   This asymmetry is a landmine for anyone extending the capture surface without
   reading both `00233`/`00235` and `use-room-files.ts`'s `useScanContextCaptures`
   comment carefully.

4. **RLS asymmetry** (§1.1, §6): `field_captures` RLS is strictly
   owner-or-org-inbox-shared; `room_scans`/`room_files` RLS is owner +
   designer-association + studio-co-member. Any UI that wants to show "everything
   the field team captured on this project" to a studio co-member who isn't the
   original capturer will silently under-return for `field_captures` rows while
   fully returning for scan-derived rows. Documented in-code as a known "P2 item,"
   not yet fixed.

5. **No inbox-triage portal surface** located for raw `field_captures` (status=
   `inbox`) rows outside the scan-pinned subset (§6) — worth confirming with a
   fuller route search before design work assumes one exists or doesn't.

6. **Upload-completion verification gap for `field_captures`**: unlike
   `room_scans` (which has `confirm-scan-bundle` + a photo-count cross-check), there
   is no analogous artifact-verification edge function/cron for `field_captures`
   uploads (§8). A field-companion voice/photo capture that fails mid-sync has no
   server-side detection or retry-nudge mechanism visible in this pass.

7. **`field-media` bucket**: referenced in a hook comment (`use-party-sms.ts`) as
   the storage for field SMS/MMS photo attachments, but its creating migration
   was not located by the table-name-scoped grep this task used (it's almost
   certainly created inside an SMS-inbound-media migration outside the searched
   names). Flagging as unverified rather than asserting its shape.

8. **No agent_tasks task kind exists** for any field-capture-adjacent async work
   today (transcription, extraction, association) — the closest analogs
   (scan_pipeline.verify/splat/renders) are GPU-pipeline-specific and use a
   different claim/lease RPC (`claim_agent_tasks`, 00297) than the generic
   `enqueue_agent_task` the CLAUDE.md Agent OS rules describe as the canonical
   write path. Whichever mechanism a new field-companion background job uses
   should be chosen deliberately (cron+edge-fn sweep vs. agent_tasks queue) rather
   than assumed from either precedent.

---

## 10. Numbering hazards

Filesystem head is **00513**. Gaps exist at: **00487, 00488** (per project memory,
renumbered forward to 00511/00512/00513 during "SD-hardening" — 00512 is
specifically noted as parked/unapplied on a separate branch
`followon/sd-caller-hardening-00512`), and **00496, 00497, 00502–00509** (cause not
determined in this pass — could be other in-flight branches' reserved-but-unmerged
numbers; do not assume any of these are safely reusable without checking
`git log`/other worktrees first, per `patina-parallel-work`). A `_pending/` folder
also exists under `supabase/migrations/` (currently containing only a stray
`00106_drop_client_messages.sql`) — its purpose wasn't investigated in this pass.
Any new field-companion migration should mint its number starting from **00514**
and re-verify the live head via `supabase migration list` against Strata (per
`patina-db-migrations`) before writing, not just from this filesystem snapshot.
