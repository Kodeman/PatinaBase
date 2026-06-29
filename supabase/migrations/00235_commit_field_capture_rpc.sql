-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 00235: Field Capture commit / route / dismiss + upload RPCs
--
-- The state machine for field_captures (00233). The iOS app never writes the
-- terminal columns directly — it calls these SECURITY INVOKER RPCs, so RLS +
-- the routing guard remain the single source of truth.
--
--   commit_field_capture(...)      upsert a capture + (optionally) mint a draft
--                                  product in the designer's personal Library.
--                                  Idempotent on client_capture_id. Any failure
--                                  on the library path safe-harbors to the
--                                  inbox rather than erroring (offline clients
--                                  must always converge).
--   route_field_capture(...)       promote an inbox capture into the Library
--                                  (with optional project routing).
--   dismiss_field_capture(...)     soft-dismiss an inbox capture.
--   merge_capture_artifact_sha256  owner-only JSONB merge of an artifact hash
--                                  (clone of merge_scan_artifact_sha256, 00082).
--   mark_capture_upload_complete   owner-only "media uploaded" stamp
--                                  (clone of mark_scan_upload_complete, 00082).
--
-- Payload envelope (FieldCapturePayload, p_payload): title, notes, category,
-- subcategory, measurements{width,height,depth,unit}, tag{vendorName, sku,
-- priceTradeCents, priceRetailCents, vendorId}, barcode{value, symbology,
-- catalogMatchProductId}, attributes{materials, colors, finish, styleTags,
-- materialTags}, guesses, voice{audioPath, transcript, partialTranscript,
-- durationSeconds}, photos[{path, publicUrl, isPrimary, isDuplicate, ...}],
-- thumbnailUrl, venue{lat, lng, accuracyM, label, placeId, capturedAt,
-- timezone}, provenance, device{model, osVersion, appVersion}, schemaVersion.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─── helper: coerce a jsonb array into a text[] (NULL/non-array → '{}') ─────
CREATE OR REPLACE FUNCTION field_capture_jsonb_text_array(p_value JSONB)
  RETURNS TEXT[]
  LANGUAGE sql
  IMMUTABLE
  SET search_path = public, pg_temp
AS $$
  SELECT CASE
    WHEN jsonb_typeof(p_value) = 'array'
      THEN ARRAY(SELECT jsonb_array_elements_text(p_value))
    ELSE '{}'::text[]
  END;
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- commit_field_capture
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
  v_uid          UUID := auth.uid();
  v_capture      field_captures%ROWTYPE;
  v_payload      JSONB := COALESCE(p_payload, '{}'::jsonb);
  v_photos       JSONB;
  v_product_id   UUID;
  v_images       TEXT[];
  v_captured_at  TIMESTAMPTZ;
  v_name         TEXT;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'commit_field_capture: not authenticated';
  END IF;

  IF p_destination IS NULL OR p_destination NOT IN ('library', 'inbox') THEN
    RAISE EXCEPTION 'commit_field_capture: invalid destination % (expected library|inbox)', p_destination;
  END IF;

  v_photos      := COALESCE(v_payload->'photos', '[]'::jsonb);
  v_captured_at := COALESCE((v_payload#>>'{venue,capturedAt}')::timestamptz, NOW());

  -- ─── Upsert the capture row (no project routing here — see below) ─────────
  -- organization_id is applied now (validated by the guard); project_id /
  -- project_room_id are deferred to the library branch so a bad route can be
  -- safe-harbored instead of hard-failing the whole sync.
  INSERT INTO field_captures (
    client_capture_id, designer_id, organization_id, destination, status,
    title, notes, category, subcategory, dimensions,
    materials, colors, style_tags, material_tags, finish,
    vendor_name, vendor_id, sku, price_trade_cents, price_retail_cents,
    barcode_value, barcode_symbology, catalog_match_product_id,
    voice_audio_path, voice_transcript, voice_partial_transcript, voice_duration_seconds,
    photos, primary_photo_path, thumbnail_url,
    provenance, guesses,
    captured_lat, captured_lng, captured_accuracy_m, venue_label, venue_place_id,
    captured_at, captured_timezone,
    raw_payload, device_model, os_version, app_version, capture_schema_version,
    synced_at
  )
  VALUES (
    p_client_capture_id, v_uid, p_organization_id, p_destination, 'synced',
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
    v_payload,
    v_payload#>>'{device,model}',
    v_payload#>>'{device,osVersion}',
    v_payload#>>'{device,appVersion}',
    COALESCE(NULLIF(v_payload->>'schemaVersion', '')::int, 1),
    NOW()
  )
  ON CONFLICT (client_capture_id) DO UPDATE SET
    destination              = EXCLUDED.destination,
    organization_id          = EXCLUDED.organization_id,
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

  -- ─── Destination: inbox ──────────────────────────────────────────────────
  IF p_destination = 'inbox' THEN
    UPDATE field_captures
       SET status = 'inbox'
     WHERE id = v_capture.id
    RETURNING * INTO v_capture;

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

REVOKE ALL ON FUNCTION commit_field_capture(UUID, TEXT, JSONB, UUID, UUID, TEXT, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION commit_field_capture(UUID, TEXT, JSONB, UUID, UUID, TEXT, UUID) TO authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- route_field_capture — promote an inbox capture into the Library
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION route_field_capture(
  p_capture_id      UUID,
  p_project_id      UUID DEFAULT NULL,
  p_project_room_id UUID DEFAULT NULL,
  p_shelf           TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_capture field_captures%ROWTYPE;
BEGIN
  SELECT * INTO v_capture
    FROM field_captures
   WHERE id = p_capture_id AND designer_id = auth.uid();

  IF NOT FOUND THEN
    RAISE EXCEPTION 'route_field_capture: capture % not found or not owned', p_capture_id;
  END IF;

  RETURN commit_field_capture(
    v_capture.client_capture_id,
    'library',
    v_capture.raw_payload,
    p_project_id,
    p_project_room_id,
    p_shelf,
    v_capture.organization_id
  );
END;
$$;

REVOKE ALL ON FUNCTION route_field_capture(UUID, UUID, UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION route_field_capture(UUID, UUID, UUID, TEXT) TO authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- dismiss_field_capture
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION dismiss_field_capture(p_capture_id UUID)
  RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_capture field_captures%ROWTYPE;
BEGIN
  UPDATE field_captures
     SET status = 'dismissed'
   WHERE id = p_capture_id
     AND designer_id = auth.uid()
     AND status <> 'saved'
  RETURNING * INTO v_capture;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'dismiss_field_capture: capture % not found, not owned, or already saved', p_capture_id;
  END IF;

  RETURN jsonb_build_object(
    'capture_id', v_capture.id,
    'status',     v_capture.status,
    'created',    false
  );
END;
$$;

REVOKE ALL ON FUNCTION dismiss_field_capture(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION dismiss_field_capture(UUID) TO authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- Upload-pipeline RPCs (clones of 00082's scan helpers)
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION merge_capture_artifact_sha256(
  p_capture_id UUID,
  p_kind       TEXT,
  p_sha        TEXT
) RETURNS void
LANGUAGE sql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  UPDATE field_captures
     SET artifacts_sha256 = artifacts_sha256 || jsonb_build_object(p_kind, p_sha)
   WHERE id = p_capture_id
     AND designer_id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION mark_capture_upload_complete(p_capture_id UUID)
  RETURNS void
LANGUAGE sql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  UPDATE field_captures
     SET upload_completed_at = NOW(),
         upload_progress     = 100,
         synced_at           = COALESCE(synced_at, NOW()),
         status              = CASE WHEN status = 'queued' THEN 'synced' ELSE status END
   WHERE id = p_capture_id
     AND designer_id = auth.uid();
$$;

REVOKE ALL ON FUNCTION merge_capture_artifact_sha256(UUID, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION mark_capture_upload_complete(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION merge_capture_artifact_sha256(UUID, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION mark_capture_upload_complete(UUID) TO authenticated;

COMMENT ON FUNCTION commit_field_capture(UUID, TEXT, JSONB, UUID, UUID, TEXT, UUID) IS
  'Idempotent upsert of a field capture; destination=library mints a draft personal-library product, destination=inbox holds it. Any library-path failure safe-harbors into the inbox.';

COMMIT;
