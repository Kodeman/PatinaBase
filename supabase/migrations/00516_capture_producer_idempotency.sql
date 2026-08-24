-- ═══════════════════════════════════════════════════════════════════════════
-- 00516 — capture producer idempotency (Phase 3 / C-A2)
--
-- Drawn from the 00514-00520 Phase 3 reservation (docs/engineering/
-- migration-number-reservations.md). Wires 00515's enqueue_capture_enrichment
-- into the intake commit paths so every capture producer both (a) writes a
-- stable client-generated idempotency key and (b) enqueues an enrichment run
-- in the SAME transaction as intake.
--
-- Three producers, three states going in:
--   1. field_captures (00233/00235) — ALREADY idempotency-compliant
--      (client_capture_id UNIQUE NOT NULL + ON CONFLICT in
--      commit_field_capture). This migration only ADDS the
--      enqueue_capture_enrichment call to its existing transaction.
--   2. proposal_captures (00130) — had no client-generated idempotency key at
--      all; the Chrome extension inserted products -> product_styles ->
--      proposal_captures as three separate round trips with no way to detect
--      a retried submission. This migration adds client_capture_id (nullable,
--      for backfill-free rollout onto an existing table with rows) and a new
--      commit_proposal_capture(...) RPC that does all three inserts plus the
--      enqueue in one transaction, upsert-safe on client_capture_id.
--   3. Designer-portal URL-paste (AddFromUrl, in product-picker-modal.tsx) —
--      previously called captureProduct() for a bare products insert with NO
--      proposal_captures row at all. It now goes through the same
--      commit_proposal_capture RPC as the extension.
--
-- ACL note (deliberate, reviewed change to 00515's posture): 00515 granted
-- EXECUTE on enqueue_capture_enrichment to service_role only, revoking
-- authenticated/anon, because at that point no producer called it yet.
-- commit_field_capture is SECURITY INVOKER (00235) — its calls run as the
-- CALLING role (authenticated via PostgREST), never switching to a function
-- owner. So for it to call enqueue_capture_enrichment inside its own
-- transaction, `authenticated` needs direct EXECUTE — nesting a DEFINER call
-- inside an INVOKER function does not borrow the callee's owner privileges.
-- commit_proposal_capture (below) is SECURITY DEFINER and therefore does NOT
-- strictly need this grant (object owners always have implicit EXECUTE on
-- objects they themselves own), but the grant is kept symmetric across both
-- producer paths rather than relying on ownership incidentally lining up.
-- enqueue_capture_enrichment's own body still validates target_type/
-- target_id itself and is idempotent by (target_type, target_id,
-- content_revision) — a widened caller set cannot create duplicate runs or
-- read/mutate result data (claim/record stay service_role-only).
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─── proposal_captures.client_capture_id ────────────────────────────────────
--
-- Nullable: this is an existing table with rows already in it (unlike
-- field_captures, which shipped its client_capture_id UNIQUE NOT NULL on a
-- brand-new table in 00233). New rows written by commit_proposal_capture
-- always set it; historical rows keep it NULL, which a plain unique index
-- already tolerates (NULLs are never considered equal to each other).
ALTER TABLE public.proposal_captures
  ADD COLUMN IF NOT EXISTS client_capture_id UUID;

-- Plain (non-partial) unique index: a plain unique b-tree index already
-- tolerates unlimited NULLs (each NULL is distinct from every other), and
-- being non-partial lets commit_proposal_capture's ON CONFLICT
-- (client_capture_id) below infer it directly — a partial index's WHERE
-- clause would otherwise have to be repeated verbatim on every ON CONFLICT
-- target that wants to use it.
CREATE UNIQUE INDEX IF NOT EXISTS proposal_captures_client_capture_id_uq
  ON public.proposal_captures (client_capture_id);

COMMENT ON COLUMN public.proposal_captures.client_capture_id IS
  'Client-generated idempotency key (mirrors field_captures.client_capture_id, 00233). Minted once at capture time by the producer (extension content script / portal URL-paste) and persisted across retries so a repeated submission upserts the same row instead of duplicating it. NULL on rows written before 00516.';

-- ─── enqueue_capture_enrichment: widen to authenticated ─────────────────────
-- See banner. commit_field_capture (SECURITY INVOKER) needs this directly;
-- commit_proposal_capture (SECURITY DEFINER, below) does not strictly need
-- it but is unaffected either way.
GRANT EXECUTE ON FUNCTION public.enqueue_capture_enrichment(text, uuid, integer, text, text, jsonb) TO authenticated;

DO $$
BEGIN
  IF has_function_privilege('anon', 'public.enqueue_capture_enrichment(text, uuid, integer, text, text, jsonb)', 'EXECUTE') THEN
    RAISE EXCEPTION 'ACL: anon must not have EXECUTE on enqueue_capture_enrichment';
  END IF;
  IF NOT has_function_privilege('authenticated', 'public.enqueue_capture_enrichment(text, uuid, integer, text, text, jsonb)', 'EXECUTE') THEN
    RAISE EXCEPTION 'ACL: authenticated must have EXECUTE on enqueue_capture_enrichment (needed by commit_field_capture / commit_proposal_capture)';
  END IF;
  IF NOT has_function_privilege('service_role', 'public.enqueue_capture_enrichment(text, uuid, integer, text, text, jsonb)', 'EXECUTE') THEN
    RAISE EXCEPTION 'ACL: service_role must still have EXECUTE on enqueue_capture_enrichment';
  END IF;
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- commit_field_capture — CREATE OR REPLACE from its 00235 body verbatim,
-- plus ONE added call: enqueue_capture_enrichment, right after the upsert
-- succeeds (i.e. NOT on the "already saved/dismissed, no-op" early return —
-- enrichment is only (re-)enqueued when this call actually applied new or
-- updated content). Everything else — signature, SECURITY INVOKER, the
-- destination branches, the safe-harbor exception handler — is unchanged.
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

  -- ─── C-A2: enqueue an enrichment run for this content commit ──────────────
  -- Runs once per actual insert/update (never on the no-op branch above).
  -- content_revision is a fixed 1 for now — field_captures has no true
  -- content-versioning scheme yet (00515's own note on today's intake
  -- schemas); enqueue_capture_enrichment's own (target_type, target_id,
  -- content_revision) uniqueness still makes every re-commit of the SAME
  -- capture (same client_capture_id => same v_capture.id) a no-op re-enqueue
  -- rather than a duplicate run.
  PERFORM public.enqueue_capture_enrichment(
    p_target_type      => 'field_capture',
    p_target_id        => v_capture.id,
    p_content_revision => 1,
    p_content_hash     => encode(extensions.digest(convert_to(v_payload::text, 'UTF8'), 'sha256'), 'hex'),
    p_pipeline_version => NULL,
    p_provenance       => jsonb_build_object('producer', 'commit_field_capture', 'client_capture_id', p_client_capture_id)
  );

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

COMMENT ON FUNCTION commit_field_capture(UUID, TEXT, JSONB, UUID, UUID, TEXT, UUID) IS
  'Idempotent upsert of a field capture; destination=library mints a draft personal-library product, destination=inbox holds it. Any library-path failure safe-harbors into the inbox. Since 00516, also enqueues a capture_enrichment run in the same transaction on every real insert/update (not on the already-terminal no-op branch).';

-- ═══════════════════════════════════════════════════════════════════════════
-- commit_proposal_capture — modeled line-for-line on commit_field_capture's
-- shape (upsert-on-conflict, safe-harbor product creation, single JSONB
-- payload envelope), adapted to proposal_captures' simpler schema (no
-- project/room routing — proposal_id/scope_room_id/ffe_category_slug only).
--
-- SECURITY DEFINER (unlike commit_field_capture's INVOKER): this function
-- performs three inserts across two tables it doesn't otherwise expose write
-- access to in one shot (products, product_styles, proposal_captures) and
-- calls the service_role-scoped enqueue_capture_enrichment. Every actor
-- check that RLS would otherwise provide is done explicitly in-body instead
-- (auth.uid() ownership, exactly as commit_field_capture already does).
--
-- Payload envelope (p_payload), all keys optional except name:
--   name, description, sourceUrl, images[], priceRetailCents,
--   materials[], colors[] (names), finish, availableColors[], vendorId,
--   retailerId, captureSource ('web_extension'|'portal'|'manual'|'import'),
--   captureProvenance{}, productStatus ('draft'|'published', default
--   'draft'), rawPayload{} (stored verbatim as proposal_captures.raw_payload
--   — the small display-oriented snapshot the extension/portal already
--   compute; this function does not reconstruct it).
--
-- Idempotent on client_capture_id: a retry with the SAME id upserts the
-- proposal_captures row's content columns but creates the product/styles
-- exactly ONCE (guarded by v_capture.product_id IS NULL, since 'inbox' and
-- 'assigned' are NORMAL resting statuses here, unlike field_captures where
-- product creation and the terminal status land in the same call — the
-- ON CONFLICT ... WHERE status NOT IN (terminal) guard alone is not enough
-- to prevent a second product on this table). enqueue_capture_enrichment is
-- called on every successful call regardless of branch; it is idempotent by
-- (target_type, target_id, content_revision) so a repeat is a safe no-op.
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.commit_proposal_capture(
  p_client_capture_id  UUID,
  p_payload            JSONB,
  p_style_ids          UUID[] DEFAULT '{}',
  p_proposal_id        UUID DEFAULT NULL,
  p_scope_room_id      UUID DEFAULT NULL,
  p_ffe_category_slug  TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid         UUID := auth.uid();
  v_capture     proposal_captures%ROWTYPE;
  v_payload     JSONB := COALESCE(p_payload, '{}'::jsonb);
  v_status      TEXT;
  v_product_id  UUID;
  v_created     BOOLEAN := false;
  v_run_id      UUID;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'commit_proposal_capture: not authenticated';
  END IF;

  IF p_client_capture_id IS NULL THEN
    RAISE EXCEPTION 'commit_proposal_capture: p_client_capture_id is required';
  END IF;

  IF NULLIF(v_payload->>'sourceUrl', '') IS NULL THEN
    -- proposal_captures.source_url is NOT NULL (00130) — fail fast with a
    -- clear message rather than a bare not-null-violation from the insert.
    RAISE EXCEPTION 'commit_proposal_capture: payload.sourceUrl is required';
  END IF;

  -- Same derivation as buildCapturePayload/deriveCaptureStatus (payloads.ts):
  -- fully-targeted captures land 'assigned', everything else 'inbox'.
  v_status := CASE
    WHEN p_proposal_id IS NOT NULL AND p_scope_room_id IS NOT NULL AND p_ffe_category_slug IS NOT NULL
      THEN 'assigned'
    ELSE 'inbox'
  END;

  -- ─── Upsert the capture row (product_id is NEVER touched here — see
  -- below; it is set only once, the first time a product is minted) ────────
  INSERT INTO proposal_captures (
    client_capture_id, designer_id, product_id,
    proposal_id, scope_room_id, ffe_category_slug,
    source_url, raw_payload, thumbnail_url, status
  )
  VALUES (
    p_client_capture_id, v_uid, NULL,
    p_proposal_id, p_scope_room_id, p_ffe_category_slug,
    v_payload->>'sourceUrl',
    COALESCE(v_payload->'rawPayload', '{}'::jsonb),
    v_payload->>'thumbnailUrl',
    v_status
  )
  ON CONFLICT (client_capture_id) DO UPDATE SET
    proposal_id        = EXCLUDED.proposal_id,
    scope_room_id      = EXCLUDED.scope_room_id,
    ffe_category_slug  = EXCLUDED.ffe_category_slug,
    source_url         = EXCLUDED.source_url,
    raw_payload        = EXCLUDED.raw_payload,
    thumbnail_url      = EXCLUDED.thumbnail_url,
    status             = EXCLUDED.status
  WHERE proposal_captures.status NOT IN ('consumed', 'dismissed')
  RETURNING * INTO v_capture;

  -- Conflict skipped (row already consumed or dismissed): idempotent no-op,
  -- exactly like commit_field_capture's terminal branch. No product
  -- (re-)creation, no re-enqueue.
  IF NOT FOUND THEN
    SELECT * INTO v_capture FROM proposal_captures WHERE client_capture_id = p_client_capture_id;
    RETURN jsonb_build_object(
      'capture_id', v_capture.id,
      'product_id', v_capture.product_id,
      'status',     v_capture.status,
      'created',    false
    );
  END IF;

  -- ─── Mint the product + styles exactly once ────────────────────────────
  IF v_capture.product_id IS NULL THEN
    INSERT INTO products (
      name, description, source_url, images, price_retail,
      materials, colors, finish, available_colors,
      vendor_id, retailer_id, captured_by, captured_at,
      capture_source, capture_provenance,
      layer, owner_user_id, status
    )
    VALUES (
      COALESCE(NULLIF(TRIM(v_payload->>'name'), ''), 'Untitled Product'),
      v_payload->>'description',
      v_payload->>'sourceUrl',
      field_capture_jsonb_text_array(v_payload->'images'),
      NULLIF(v_payload->>'priceRetailCents', '')::int,
      field_capture_jsonb_text_array(v_payload->'materials'),
      field_capture_jsonb_text_array(v_payload->'colors'),
      v_payload->>'finish',
      field_capture_jsonb_text_array(v_payload->'availableColors'),
      NULLIF(v_payload->>'vendorId', '')::uuid,
      NULLIF(v_payload->>'retailerId', '')::uuid,
      v_uid,
      NOW(),
      COALESCE(v_payload->>'captureSource', 'web_extension'),
      COALESCE(v_payload->'captureProvenance', '{}'::jsonb),
      'personal', v_uid,
      COALESCE(NULLIF(v_payload->>'productStatus', ''), 'draft')
    )
    RETURNING id INTO v_product_id;

    IF array_length(p_style_ids, 1) IS NOT NULL THEN
      INSERT INTO product_styles (product_id, style_id, confidence, is_primary, source, assigned_by)
      SELECT v_product_id, s.style_id, 1.0, (s.ord = 1), 'manual', v_uid
        FROM unnest(p_style_ids) WITH ORDINALITY AS s(style_id, ord);
    END IF;

    UPDATE proposal_captures
       SET product_id = v_product_id
     WHERE id = v_capture.id
    RETURNING * INTO v_capture;

    v_created := true;
  ELSE
    v_product_id := v_capture.product_id;
  END IF;

  -- ─── C-A2: enqueue an enrichment run ────────────────────────────────────
  -- Idempotent by (target_type, target_id, content_revision) — safe to call
  -- on both the fresh-commit and the repeat-retry path.
  v_run_id := public.enqueue_capture_enrichment(
    p_target_type      => 'proposal_capture',
    p_target_id        => v_capture.id,
    p_content_revision => 1,
    p_content_hash     => encode(extensions.digest(convert_to(v_payload::text, 'UTF8'), 'sha256'), 'hex'),
    p_pipeline_version => NULL,
    p_provenance       => jsonb_build_object('producer', 'commit_proposal_capture', 'client_capture_id', p_client_capture_id)
  );

  RETURN jsonb_build_object(
    'capture_id',        v_capture.id,
    'product_id',        v_product_id,
    'status',            v_capture.status,
    'created',           v_created,
    'enrichment_run_id', v_run_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.commit_proposal_capture(UUID, JSONB, UUID[], UUID, UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.commit_proposal_capture(UUID, JSONB, UUID[], UUID, UUID, TEXT) TO authenticated;

COMMENT ON FUNCTION public.commit_proposal_capture(UUID, JSONB, UUID[], UUID, UUID, TEXT) IS
  'Idempotent upsert of a proposal_captures inbox row + its draft product/styles, keyed on client_capture_id. Enqueues a capture_enrichment run in the same transaction (C-A2). Producers: Chrome extension (saveToInbox, background.ts queue drain), designer-portal URL-paste (AddFromUrl).';

DO $$
BEGIN
  IF has_function_privilege('anon', 'public.commit_proposal_capture(uuid, jsonb, uuid[], uuid, uuid, text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'ACL: anon must not have EXECUTE on commit_proposal_capture';
  END IF;
  IF NOT has_function_privilege('authenticated', 'public.commit_proposal_capture(uuid, jsonb, uuid[], uuid, uuid, text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'ACL: authenticated must have EXECUTE on commit_proposal_capture';
  END IF;
END $$;

COMMIT;
