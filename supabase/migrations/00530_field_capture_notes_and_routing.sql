-- ═══════════════════════════════════════════════════════════════════════════
-- 00530_field_capture_notes_and_routing.sql (Field Companion, wave 1)
--
-- ⚠ HARD PREREQUISITE: 00516_capture_producer_idempotency.sql. THIS MIGRATION
--   DEPENDS ON 00516 AND MUST APPLY AFTER IT.
--   Lineage: 00235 → 00516 → 00530.
--
--   commit_field_capture is a shared object with two authors. 00516 does
--   CREATE OR REPLACE on it from 00235's body; so does section (c) below.
--   Whichever lands second SILENTLY REVERTS the other — no error, no failed
--   migration, no ledger signal. Section (c) is copied from 00516's merged
--   body, so landing AFTER 00516 preserves 00516's work; landing BEFORE it
--   would have 00516 wipe out everything in section (c). Section (c) also
--   CALLS enqueue_capture_enrichment_for_producer, which 00516 creates, so
--   applying this file first would leave commit_field_capture referencing a
--   function that does not exist. Verify the deployed function carries
--   00516's enqueue call before applying this.
--
-- Address drawn at landing from the reserved 00530–00535 Field Companion band
-- (docs/engineering/migration-number-reservations.md).
--
-- Three things, all additive:
--   (a) the note/audio lane on field_captures + the provenance GIN index
--   (b) the five 00233 RLS policies restated TO authenticated (no widening)
--   (c) commit_field_capture replaced so its INBOX branch persists routing
--
-- No new field_captures.status value. "Filed" is project_id IS NOT NULL.
-- field_captures_org_inbox_select keys on status = 'inbox' (00233:175-188), so
-- introducing a terminal status would silently revoke studio read.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ═══════════════════════════════════════════════════════════════════════════
-- (a) The note shape and the audio lane
-- ═══════════════════════════════════════════════════════════════════════════
-- CHECK constraints are NAMED: wave 6A widens transcript_source and
-- audio_retention, and a system-generated name is more expensive to DROP.
ALTER TABLE field_captures
  ADD COLUMN IF NOT EXISTS capture_kind text NOT NULL DEFAULT 'specimen'
    CONSTRAINT field_captures_capture_kind_ck
    CHECK (capture_kind IN ('specimen','note','context')),
  ADD COLUMN IF NOT EXISTS voice_audio_segments jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS voice_audio_purged_at timestamptz,
  -- DEFAULT 'keep', NOT '90_days'. Nothing purges anything until wave 6A's
  -- maintenance cron exists, and a column default that asserts a retention
  -- policy nothing implements is an unverifiable claim. The default flips to
  -- '90_days' in the migration that actually ships the purge.
  ADD COLUMN IF NOT EXISTS audio_retention text NOT NULL DEFAULT 'keep'
    CONSTRAINT field_captures_audio_retention_ck
    CHECK (audio_retention IN ('keep','discard_after_transcript','90_days')),
  ADD COLUMN IF NOT EXISTS transcript_source text
    CONSTRAINT field_captures_transcript_source_ck
    CHECK (transcript_source IS NULL
           OR transcript_source IN ('device','device_partial','server','designer')),
  ADD COLUMN IF NOT EXISTS note_setting text
    CONSTRAINT field_captures_note_setting_ck
    CHECK (note_setting IS NULL OR note_setting IN ('solo','conversation'));

-- Deliberately NOT shipped here: voice_audio_sha256 and transcript_edited_at.
-- Neither has a wave-1 producer or a wave-1 reader — nothing in the recorder
-- or the uploader hashes audio, and transcript_edited_at's only consumer is
-- wave 6A's COALESCE rule. Both land with 6A.
--
-- Forward-declared on purpose (no wave-1 writer, but the payload reader is
-- written once): note_setting (writer = wave 3's consent posture),
-- audio_retention and voice_audio_purged_at (purge = 6A). capture_kind DOES
-- get a real wave-1 producer — FieldCapturePayload gains a top-level
-- captureKind — because a CHECK the app can never satisfy is a green test
-- over behaviour that cannot happen.

COMMENT ON COLUMN field_captures.capture_kind IS
  'What the capture is: specimen (a piece), note (voice-only), or context (a room/site context capture). Written from the payload''s top-level captureKind since the W1 routing migration; defaults to specimen for every pre-wave-1 row and payload.';
COMMENT ON COLUMN field_captures.voice_audio_segments IS
  'Ordered JSONB array of storage paths for a multi-segment voice note (voice.audioSegments). voice_audio_path remains the first/primary segment for single-segment captures.';
COMMENT ON COLUMN field_captures.audio_retention IS
  'Retention posture for the captured audio. Defaults to ''keep'': nothing purges audio until wave 6A ships the maintenance cron, and the default must not assert a policy no code implements.';
COMMENT ON COLUMN field_captures.voice_audio_purged_at IS
  'Set by wave 6A''s purge when the audio behind this capture is deleted. NULL means the audio is still present (or was never captured).';
COMMENT ON COLUMN field_captures.transcript_source IS
  'Where voice_transcript came from: device (on-device recognition), device_partial, server, or designer (hand-edited). Widened by wave 6A.';
COMMENT ON COLUMN field_captures.note_setting IS
  'Recording setting declared at capture time — solo (the designer talking to herself) or conversation (someone else present). Written from wave 3''s consent posture.';

-- Carried unbuilt since R112/R113. useScanContextCaptures does a `@>`
-- containment filter (use-room-files.ts:385, fn at :370) that is a seq scan
-- today. jsonb_path_ops is the right opclass: the query is containment-only,
-- and it indexes smaller and faster than the default jsonb_ops.
CREATE INDEX IF NOT EXISTS idx_field_captures_provenance_gin
  ON field_captures USING gin (provenance jsonb_path_ops);

-- ═══════════════════════════════════════════════════════════════════════════
-- (b) RLS hardening: five policies, no behaviour change
-- ═══════════════════════════════════════════════════════════════════════════
-- 00233:155-188 carries NO `TO authenticated` clause, so all five policies
-- default to PUBLIC. Harmless in practice today (auth.uid() is NULL for anon,
-- so every predicate is already false for an anonymous caller) but against
-- house convention after the mood-board exposure. RESTATE, DO NOT WIDEN — the
-- predicates below are byte-identical to 00233's.
DROP POLICY IF EXISTS field_captures_owner_select ON field_captures;
CREATE POLICY field_captures_owner_select
  ON field_captures FOR SELECT
  TO authenticated
  USING (designer_id = auth.uid());

DROP POLICY IF EXISTS field_captures_owner_insert ON field_captures;
CREATE POLICY field_captures_owner_insert
  ON field_captures FOR INSERT
  TO authenticated
  WITH CHECK (designer_id = auth.uid());

DROP POLICY IF EXISTS field_captures_owner_update ON field_captures;
CREATE POLICY field_captures_owner_update
  ON field_captures FOR UPDATE
  TO authenticated
  USING (designer_id = auth.uid())
  WITH CHECK (designer_id = auth.uid());

DROP POLICY IF EXISTS field_captures_owner_delete ON field_captures;
CREATE POLICY field_captures_owner_delete
  ON field_captures FOR DELETE
  TO authenticated
  USING (designer_id = auth.uid());

DROP POLICY IF EXISTS field_captures_org_inbox_select ON field_captures;
CREATE POLICY field_captures_org_inbox_select
  ON field_captures FOR SELECT
  TO authenticated
  USING (
    status = 'inbox'
    AND organization_id IS NOT NULL
    AND organization_id IN (
      SELECT om.organization_id
      FROM organization_members om
      WHERE om.user_id = auth.uid()
        AND om.status = 'active'
    )
  );

-- ═══════════════════════════════════════════════════════════════════════════
-- (c) commit_field_capture — the fix without which nothing lands
-- ═══════════════════════════════════════════════════════════════════════════
-- The initial INSERT never sets project_id/project_room_id (00235:89-146), and
-- the inbox branch sets ONLY status (00235:205-217); only the library branch
-- persists routing (:255-264). Every note-shaped capture takes the inbox path,
-- so today every note arrives with no project column.
--
-- ⚠ AUTHORED FROM 00516'S BODY, NOT 00235'S (FC-R18). Same signature, same
--   SECURITY INVOKER, same search_path, same upsert, same library branch, same
--   enqueue call. Three edits:
--     EDIT 1 — the inbox branch now persists project_id / project_room_id /
--              shelf, wrapped in its OWN EXCEPTION WHEN OTHERS safe harbor.
--     EDIT 2 — five payload reads: the routing-clear flag plus four new
--              columns in the INSERT column list, the VALUES list, and the
--              ON CONFLICT DO UPDATE SET list.
--     EDIT 3 — those four reads are PROJECTED DEFENSIVELY so a malformed
--              payload value can never trip section (a)'s CHECK constraints.
--              A raise there would be outside every safe harbor (it comes
--              from the upsert, before both destination branches), failing
--              the RPC on BOTH destinations and making an offline device
--              retry that capture forever. Dropped values are recorded in
--              raw_payload -> 'projection_errors', never raised.
--
-- ⚠ THE INBOX BRANCH NEEDS ITS OWN SAFE HARBOR. 00235:85-88 records the routing
--   deferral as DELIBERATE — "project_id / project_room_id are deferred to the
--   library branch so a bad route can be safe-harbored instead of hard-failing
--   the whole sync" — and the library branch is wrapped in
--   BEGIN … EXCEPTION WHEN OTHERS (00235:223-299). An unwrapped inbox UPDATE
--   turns that documented safe harbor into a hard abort:
--   field_captures_guard_routing RAISEs (00233:206/212/224/230/240) would kill
--   the whole RPC, and on the device that surfaces as a plain Error, not a
--   LocalSyncError, so runAttempt's catch falls to recordFailure
--   (LocalCaptureSyncService.swift:219-235) → .retryableFailure, retried on
--   EVERY drain forever. Reachable whenever a stamped project/room goes stale
--   (project transferred, room deleted, room belonging to another project once
--   projectRoomID starts flowing).
--
-- ⚠ Un-placing is a PAYLOAD KEY, not a new parameter. COALESCE cannot tell
--   "not supplied" from "explicitly cleared". A defaulted 8th argument would
--   create a SECOND OVERLOAD in Postgres and make every existing
--   seven-argument call resolve ambiguously. Read
--   v_payload #>> '{routing,clear}' instead.
--
-- ⚠ The enrichment enqueue goes through enqueue_capture_enrichment_for_producer,
--   NEVER the primitive enqueue_capture_enrichment. The primitive is
--   service_role-only and takes a bare target_id with no ownership check;
--   granting or calling it from an `authenticated` path is the cross-tenant
--   hole 00516's adversarial review closed (suppression of a victim's
--   in-flight run, cost amplification, unsolicited ledger writes). This
--   function is SECURITY INVOKER, so it runs as the calling role and cannot
--   reach the primitive at all.
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION commit_field_capture(
  p_client_capture_id UUID,
  p_destination       TEXT,
  p_payload           JSONB,
  p_project_id        UUID DEFAULT NULL,
  p_project_room_id   UUID DEFAULT NULL,
  p_shelf             TEXT DEFAULT NULL,
  p_organization_id   UUID DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid           UUID := auth.uid();
  v_capture       field_captures%ROWTYPE;
  v_payload       JSONB := COALESCE(p_payload, '{}'::jsonb);
  v_photos        JSONB;
  v_product_id    UUID;
  v_images        TEXT[];
  v_captured_at   TIMESTAMPTZ;
  v_name          TEXT;
  v_clear_routing BOOLEAN;   -- EDIT 2
  -- EDIT 3 (defensive projection)
  v_capture_kind      TEXT;
  v_transcript_source TEXT;
  v_note_setting      TEXT;
  v_audio_segments    JSONB;
  v_projection_errors JSONB := '[]'::jsonb;
  v_raw_payload       JSONB;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'commit_field_capture: not authenticated';
  END IF;

  IF p_destination IS NULL OR p_destination NOT IN ('library', 'inbox') THEN
    RAISE EXCEPTION 'commit_field_capture: invalid destination % (expected library|inbox)', p_destination;
  END IF;

  v_photos      := COALESCE(v_payload->'photos', '[]'::jsonb);
  v_captured_at := COALESCE((v_payload#>>'{venue,capturedAt}')::timestamptz, NOW());
  -- EDIT 2: explicit un-placing. A jsonb comparison, NOT a ::boolean cast.
  -- (v_payload #>> '{routing,clear}')::boolean raises 22P02 on any value
  -- Postgres cannot read as a boolean, and it sits before the upsert and
  -- outside every exception block — so one malformed payload key would hard-
  -- fail the whole RPC, which on the device surfaces as a plain Error rather
  -- than a LocalSyncError and is therefore retried on EVERY drain forever:
  -- exactly the failure the safe harbors below exist to prevent, moved one
  -- step earlier. The jsonb comparison is total and never throws. Anything
  -- that is not JSON `true` — absent, a string, a number, an object — reads
  -- as "do not clear"; an absent key yields NULL, which takes the ELSE branch
  -- of every CASE below and so keeps the stored routing.
  v_clear_routing := ((v_payload #> '{routing,clear}') = 'true'::jsonb);

  -- ─── EDIT 3: DEFENSIVE PROJECTION OF THE FOUR NEW PAYLOAD READS ──────────
  -- Same failure class as the routing.clear cast above, and the reason this
  -- block exists: a payload value that violates one of section (a)'s named
  -- CHECK constraints — captureKind 'foo', transcriptSource 'x', noteSetting
  -- 'both' — or an audioSegments value that is not a jsonb array raises
  -- INSIDE this function but OUTSIDE every safe harbor (the raise comes from
  -- the upsert itself, which precedes both destination branches). The RPC
  -- then fails on BOTH destinations, and an offline-retrying device never
  -- syncs that capture at all: it retries forever. So the reads are projected
  -- to a legal value here and CANNOT trip a constraint.
  --
  -- The whitelists below are the allowed-value lists of the named CHECK
  -- constraints declared in section (a) of this same file —
  -- field_captures_capture_kind_ck, field_captures_transcript_source_ck,
  -- field_captures_note_setting_ck. They are quoted from those constraints,
  -- not invented; widening one means widening both, in this one file.
  -- The constraints STAY as belt-and-braces: a second line of defence this
  -- function can no longer reach.
  --
  -- Nothing is swallowed silently. Every dropped value is appended to
  -- raw_payload -> 'projection_errors', a jsonb ARRAY of {key, reason}
  -- objects. Never a RAISE.
  v_capture_kind := NULLIF(v_payload #>> '{captureKind}', '');
  IF v_capture_kind IS NULL THEN
    v_capture_kind := 'specimen';
  ELSIF v_capture_kind NOT IN ('specimen', 'note', 'context') THEN
    v_projection_errors := v_projection_errors || jsonb_build_object(
      'key', 'captureKind', 'reason', 'not in (specimen,note,context)');
    v_capture_kind := 'specimen';
  END IF;

  v_transcript_source := NULLIF(v_payload #>> '{voice,transcriptSource}', '');
  IF v_transcript_source IS NOT NULL
     AND v_transcript_source NOT IN ('device', 'device_partial', 'server', 'designer') THEN
    v_projection_errors := v_projection_errors || jsonb_build_object(
      'key', 'voice.transcriptSource',
      'reason', 'not in (device,device_partial,server,designer)');
    v_transcript_source := NULL;
  END IF;

  v_note_setting := NULLIF(v_payload #>> '{voice,noteSetting}', '');
  IF v_note_setting IS NOT NULL
     AND v_note_setting NOT IN ('solo', 'conversation') THEN
    v_projection_errors := v_projection_errors || jsonb_build_object(
      'key', 'voice.noteSetting', 'reason', 'not in (solo,conversation)');
    v_note_setting := NULL;
  END IF;

  -- voice_audio_segments is jsonb NOT NULL DEFAULT '[]'. A string, number or
  -- object would be stored happily by the column type but is a lie to every
  -- reader, and a JSON null would violate NOT NULL. Take it only if it really
  -- is an array.
  v_audio_segments := v_payload #> '{voice,audioSegments}';
  IF v_audio_segments IS NULL OR jsonb_typeof(v_audio_segments) = 'null' THEN
    v_audio_segments := '[]'::jsonb;
  ELSIF jsonb_typeof(v_audio_segments) <> 'array' THEN
    v_projection_errors := v_projection_errors || jsonb_build_object(
      'key', 'voice.audioSegments',
      'reason', 'not a jsonb array (got ' || jsonb_typeof(v_audio_segments) || ')');
    v_audio_segments := '[]'::jsonb;
  END IF;

  -- raw_payload carries the projection errors alongside the payload. A
  -- top-level jsonb || merges KEYS, so this composes with the safe harbors'
  -- `raw_payload || {conflict: …}` in either order: 'projection_errors' and
  -- 'conflict' are distinct top-level keys and neither merge can clobber the
  -- other. The final CASE arm keeps the record even for the (unreachable)
  -- case of a non-object payload, where || would not merge.
  v_raw_payload := CASE
    WHEN jsonb_array_length(v_projection_errors) = 0 THEN v_payload
    WHEN jsonb_typeof(v_payload) = 'object'
      THEN v_payload || jsonb_build_object('projection_errors', v_projection_errors)
    ELSE jsonb_build_object('projection_errors', v_projection_errors)
  END;

  -- ─── Upsert the capture row (no project routing here — see below) ─────────
  -- organization_id is applied now (validated by the guard); project_id /
  -- project_room_id are deferred to the destination branches so a bad route can
  -- be safe-harbored instead of hard-failing the whole sync.
  INSERT INTO field_captures (
    client_capture_id, designer_id, organization_id, destination, status,
    capture_kind,
    title, notes, category, subcategory, dimensions,
    materials, colors, style_tags, material_tags, finish,
    vendor_name, vendor_id, sku, price_trade_cents, price_retail_cents,
    barcode_value, barcode_symbology, catalog_match_product_id,
    voice_audio_path, voice_transcript, voice_partial_transcript, voice_duration_seconds,
    voice_audio_segments, transcript_source, note_setting,
    photos, primary_photo_path, thumbnail_url,
    provenance, guesses,
    captured_lat, captured_lng, captured_accuracy_m, venue_label, venue_place_id,
    captured_at, captured_timezone,
    raw_payload, device_model, os_version, app_version, capture_schema_version,
    synced_at
  )
  VALUES (
    p_client_capture_id, v_uid, p_organization_id, p_destination, 'synced',
    v_capture_kind,
    v_payload->>'title', v_payload->>'notes', v_payload->>'category', v_payload->>'subcategory',
      v_payload->'measurements',
    field_capture_jsonb_text_array(v_payload#>'{attributes,materials}'),
    field_capture_jsonb_text_array(v_payload#>'{attributes,colors}'),
    field_capture_jsonb_text_array(v_payload#>'{attributes,styleTags}'),
    field_capture_jsonb_text_array(v_payload#>'{attributes,materialTags}'),
    v_payload#>>'{attributes,finish}',
    v_payload#>>'{tag,vendorName}',
    NULLIF(v_payload#>>'{tag,vendorId}', '')::uuid,
    v_payload#>>'{tag,sku}',
    NULLIF(v_payload#>>'{tag,priceTradeCents}', '')::int,
    NULLIF(v_payload#>>'{tag,priceRetailCents}', '')::int,
    v_payload#>>'{barcode,value}',
    v_payload#>>'{barcode,symbology}',
    NULLIF(v_payload#>>'{barcode,catalogMatchProductId}', '')::uuid,
    v_payload#>>'{voice,audioPath}',
    v_payload#>>'{voice,transcript}',
    v_payload#>>'{voice,partialTranscript}',
    NULLIF(v_payload#>>'{voice,durationSeconds}', '')::numeric,
    v_audio_segments,
    v_transcript_source,
    v_note_setting,
    v_photos,
    COALESCE(
      (SELECT ph->>'path' FROM jsonb_array_elements(v_photos) ph
        WHERE (ph->>'isPrimary')::boolean IS TRUE LIMIT 1),
      (SELECT ph->>'path' FROM jsonb_array_elements(v_photos) ph LIMIT 1)
    ),
    v_payload->>'thumbnailUrl',
    COALESCE(v_payload->'provenance', '{}'::jsonb),
    COALESCE(v_payload->'guesses', '{}'::jsonb),
    NULLIF(v_payload#>>'{venue,lat}', '')::double precision,
    NULLIF(v_payload#>>'{venue,lng}', '')::double precision,
    NULLIF(v_payload#>>'{venue,accuracyM}', '')::numeric,
    v_payload#>>'{venue,label}',
    v_payload#>>'{venue,placeId}',
    v_captured_at,
    v_payload#>>'{venue,timezone}',
    v_raw_payload,
    v_payload#>>'{device,model}',
    v_payload#>>'{device,osVersion}',
    v_payload#>>'{device,appVersion}',
    COALESCE(NULLIF(v_payload->>'schemaVersion', '')::int, 1),
    NOW()
  )
  ON CONFLICT (client_capture_id) DO UPDATE SET
    destination              = EXCLUDED.destination,
    organization_id          = EXCLUDED.organization_id,
    capture_kind             = EXCLUDED.capture_kind,
    title                    = EXCLUDED.title,
    notes                    = EXCLUDED.notes,
    category                 = EXCLUDED.category,
    subcategory              = EXCLUDED.subcategory,
    dimensions               = EXCLUDED.dimensions,
    materials                = EXCLUDED.materials,
    colors                   = EXCLUDED.colors,
    style_tags               = EXCLUDED.style_tags,
    material_tags            = EXCLUDED.material_tags,
    finish                   = EXCLUDED.finish,
    vendor_name              = EXCLUDED.vendor_name,
    vendor_id                = EXCLUDED.vendor_id,
    sku                      = EXCLUDED.sku,
    price_trade_cents        = EXCLUDED.price_trade_cents,
    price_retail_cents       = EXCLUDED.price_retail_cents,
    barcode_value            = EXCLUDED.barcode_value,
    barcode_symbology        = EXCLUDED.barcode_symbology,
    catalog_match_product_id = EXCLUDED.catalog_match_product_id,
    voice_audio_path         = EXCLUDED.voice_audio_path,
    voice_transcript         = EXCLUDED.voice_transcript,
    voice_partial_transcript = EXCLUDED.voice_partial_transcript,
    voice_duration_seconds   = EXCLUDED.voice_duration_seconds,
    voice_audio_segments     = EXCLUDED.voice_audio_segments,
    transcript_source        = EXCLUDED.transcript_source,
    note_setting             = EXCLUDED.note_setting,
    photos                   = EXCLUDED.photos,
    primary_photo_path       = EXCLUDED.primary_photo_path,
    thumbnail_url            = EXCLUDED.thumbnail_url,
    provenance               = EXCLUDED.provenance,
    guesses                  = EXCLUDED.guesses,
    captured_lat             = EXCLUDED.captured_lat,
    captured_lng             = EXCLUDED.captured_lng,
    captured_accuracy_m      = EXCLUDED.captured_accuracy_m,
    venue_label              = EXCLUDED.venue_label,
    venue_place_id           = EXCLUDED.venue_place_id,
    captured_at              = EXCLUDED.captured_at,
    captured_timezone        = EXCLUDED.captured_timezone,
    raw_payload              = EXCLUDED.raw_payload,
    device_model             = EXCLUDED.device_model,
    os_version               = EXCLUDED.os_version,
    app_version              = EXCLUDED.app_version,
    capture_schema_version   = EXCLUDED.capture_schema_version,
    synced_at                = EXCLUDED.synced_at
  WHERE field_captures.status NOT IN ('saved', 'dismissed')
  RETURNING * INTO v_capture;

  -- Conflict skipped (row already saved or dismissed): idempotent no-op.
  IF NOT FOUND THEN
    SELECT * INTO v_capture FROM field_captures WHERE client_capture_id = p_client_capture_id;
    RETURN jsonb_build_object(
      'capture_id', v_capture.id,
      'product_id', v_capture.product_id,
      'status',     v_capture.status,
      'created',    false
    );
  END IF;

  -- ─── C-A2: enqueue an enrichment run for this content commit ──────────────
  -- Runs once per actual insert/update (never on the no-op branch above).
  -- content_revision is a fixed 1 for now — field_captures has no true
  -- content-versioning scheme yet (00515's own note on today's intake
  -- schemas); enqueue_capture_enrichment's own (target_type, target_id,
  -- content_revision) uniqueness still makes every re-commit of the SAME
  -- capture (same client_capture_id => same v_capture.id) a no-op re-enqueue
  -- rather than a duplicate run. Goes through enqueue_capture_enrichment_for_
  -- producer (not the primitive) because this function is SECURITY INVOKER —
  -- see 00516's ACL note. v_capture.id was just inserted/updated with
  -- designer_id = v_uid above, so the wrapper's ownership check always passes
  -- for this caller's own row.
  PERFORM public.enqueue_capture_enrichment_for_producer(
    p_target_type      => 'field_capture',
    p_target_id        => v_capture.id,
    p_content_revision => 1,
    p_content_hash     => encode(extensions.digest(convert_to(v_payload::text, 'UTF8'), 'sha256'), 'hex'),
    p_pipeline_version => NULL,
    p_provenance       => jsonb_build_object('producer', 'commit_field_capture', 'client_capture_id', p_client_capture_id)
  );

  -- ─── Destination: inbox ──────────────────────────────────────────────────
  -- EDIT 1. The branch now persists routing, and carries its own safe harbor.
  IF p_destination = 'inbox' THEN
    BEGIN
      UPDATE field_captures
         SET status          = 'inbox',
             project_id      = CASE WHEN v_clear_routing THEN NULL
                                    ELSE COALESCE(p_project_id, project_id) END,
             project_room_id = CASE WHEN v_clear_routing THEN NULL
                                    ELSE COALESCE(p_project_room_id, project_room_id) END,
             shelf           = CASE WHEN v_clear_routing THEN NULL
                                    ELSE COALESCE(p_shelf, shelf) END
       WHERE id = v_capture.id
      RETURNING * INTO v_capture;
    EXCEPTION WHEN OTHERS THEN
      -- Byte-for-byte the shape of 00235:278-291. 00235:85-88 records the
      -- routing deferral as deliberate precisely so a bad route can be
      -- safe-harbored instead of hard-failing the whole sync; the inbox
      -- branch must not turn that into an abort. The failed UPDATE above was
      -- rolled back with this subtransaction, so routing is untouched and the
      -- update below passes the guard.
      UPDATE field_captures
         SET status      = 'inbox',
             raw_payload = COALESCE(raw_payload, '{}'::jsonb)
                           || jsonb_build_object('conflict', jsonb_build_object(
                                'error', SQLERRM, 'sqlstate', SQLSTATE, 'at', NOW(),
                                'attempted_project_id', p_project_id))
       WHERE id = v_capture.id
      RETURNING * INTO v_capture;
    END;

    RETURN jsonb_build_object(
      'capture_id', v_capture.id,
      'product_id', v_capture.product_id,
      'status',     v_capture.status,
      'created',    false
    );
  END IF;

  -- ─── Destination: library ────────────────────────────────────────────────
  -- Mint a draft personal-library product. Wrapped so any failure (bad
  -- project route tripping the guard or project_products RLS, a stray FK,
  -- etc.) safe-harbors the capture into the inbox instead of erroring.
  BEGIN
    v_name := COALESCE(NULLIF(TRIM(v_capture.title), ''), 'Untitled capture');

    -- Non-duplicate photo publicUrls become the product image set.
    v_images := ARRAY(
      SELECT ph->>'publicUrl'
        FROM jsonb_array_elements(v_photos) ph
       WHERE COALESCE((ph->>'isDuplicate')::boolean, false) = false
         AND NULLIF(ph->>'publicUrl', '') IS NOT NULL
    );

    INSERT INTO products (
      name, layer, owner_user_id, captured_by, captured_at, status,
      capture_source, field_capture_id, capture_provenance,
      category, subcategory, vendor_id, price_retail, images
    )
    VALUES (
      v_name, 'personal', v_uid, v_uid, v_capture.captured_at, 'draft',
      'field_capture', v_capture.id, v_capture.provenance,
      v_capture.category, v_capture.subcategory, v_capture.vendor_id,
      v_capture.price_retail_cents, v_images
    )
    RETURNING id INTO v_product_id;

    -- Optional project routing (guard validates ownership on the capture
    -- update; project_products RLS re-checks created_by = auth.uid()).
    IF p_project_id IS NOT NULL THEN
      INSERT INTO project_products (project_id, product_id)
      VALUES (p_project_id, v_product_id)
      ON CONFLICT (project_id, product_id) DO NOTHING;
    END IF;

    UPDATE field_captures
       SET status          = 'saved',
           destination     = 'library',
           product_id      = v_product_id,
           committed_at    = NOW(),
           project_id      = p_project_id,
           project_room_id = p_project_room_id,
           shelf           = p_shelf
     WHERE id = v_capture.id
    RETURNING * INTO v_capture;

    RETURN jsonb_build_object(
      'capture_id', v_capture.id,
      'product_id', v_product_id,
      'status',     'saved',
      'created',    true
    );

  EXCEPTION WHEN OTHERS THEN
    -- Safe harbor: the product insert (and any routing) inside this block was
    -- rolled back. Park the capture in the inbox and stash the conflict so
    -- the designer can re-route it by hand. project_id is still NULL here, so
    -- this update passes the routing guard.
    UPDATE field_captures
       SET status      = 'inbox',
           raw_payload = COALESCE(raw_payload, '{}'::jsonb)
                         || jsonb_build_object(
                              'conflict',
                              jsonb_build_object(
                                'error', SQLERRM,
                                'sqlstate', SQLSTATE,
                                'at', NOW(),
                                'attempted_project_id', p_project_id
                              )
                            )
     WHERE id = v_capture.id
    RETURNING * INTO v_capture;

    RETURN jsonb_build_object(
      'capture_id', v_capture.id,
      'product_id', NULL,
      'status',     'inbox',
      'created',    false
    );
  END;
END;
$$;

-- ─── ACL restatement ───────────────────────────────────────────────────────
-- Honestly: this changes nothing. CREATE OR REPLACE PRESERVES the existing
-- ACL, and commit_field_capture already carries REVOKE ALL … FROM PUBLIC /
-- GRANT EXECUTE … TO authenticated (00235:303-304, restated by 00516). The
-- block is belt-and-braces, keeping the canonical shape the ACL conformance
-- gate recognises. service_role is deliberately NOT in the revoke list: the
-- spec writes FROM PUBLIC, anon, and adding service_role would DROP a
-- privilege 00235 never revoked rather than restate one.
REVOKE ALL ON FUNCTION public.commit_field_capture(UUID, TEXT, JSONB, UUID, UUID, TEXT, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.commit_field_capture(UUID, TEXT, JSONB, UUID, UUID, TEXT, UUID)
  TO authenticated;

COMMENT ON FUNCTION public.commit_field_capture(UUID, TEXT, JSONB, UUID, UUID, TEXT, UUID) IS
  'Idempotent upsert of a field capture; destination=library mints a draft personal-library product, destination=inbox holds it. BOTH destination branches persist project_id/project_room_id/shelf, and both carry an EXCEPTION WHEN OTHERS safe harbor that parks a refused route at status=inbox with the conflict stashed in raw_payload. A {routing:{clear:true}} payload key un-places a capture. The four note/audio payload reads are projected to legal values so a malformed value cannot trip a CHECK constraint from outside a safe harbor; anything dropped is recorded in raw_payload.projection_errors rather than raised. Enqueues a capture_enrichment run (via enqueue_capture_enrichment_for_producer, 00516) in the same transaction on every real insert/update.';

COMMIT;
