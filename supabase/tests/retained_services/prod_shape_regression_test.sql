-- Workstream A2 — committed prod-shape regression fixture.
--
-- Prod's svc_media / svc_orders schemas were provisioned by Prisma before its
-- @@map()/@map() directives were applied, so prod carries:
--   svc_media."MediaAsset"   (camelCase columns, id is text, no svc_media.media_assets)
--   svc_media.outbox_events  (camelCase createdAt/publishedAt/retryCount/lastError)
--   svc_orders.outbox_events (same camelCase timestamp/scalar columns)
-- while local/CI/staging all carry the snake_case 00052/00053/00054 shapes. See
-- docs/engineering/patina-cloudflare-phase-2-census.md §3 for the verbatim prod
-- column list and 00493's header for the full incident writeup: three function
-- bodies (record_project_ffe_receipt_batch, get_outbox_events, get_outbox_counts)
-- installed clean everywhere and only failed at CALL time on prod (42P01 / 42703),
-- because a function body's identifiers aren't resolved at CREATE time the way
-- 00482's DDL is. Nothing in CI exercised the Prisma-shaped branch before this file.
--
-- This test reshapes a transaction-scoped copy of svc_media/svc_orders to prod's
-- physical casing (rename + retype, matching the census exactly), exercises every
-- catalog-resolving path 00493 repaired, proves the reshape isn't vacuous by
-- showing the OLD snake_case spellings genuinely 42P01/42703 against the reshaped
-- tables, then ROLLBACKs and re-proves the snake_case originals are untouched.
-- Zero residue: everything happens inside one transaction that never commits.

BEGIN;
SET LOCAL statement_timeout = '30s';

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. RESHAPE — rename/retype svc_media + svc_orders to prod's Prisma-default
--    physical casing. AssetRendition/ThreeDAsset/ProcessJob are NOT renamed —
--    the functions under test never touch them; their FKs to media_assets(id)
--    are dropped only because retyping id to text requires it.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE svc_media.asset_renditions DROP CONSTRAINT asset_renditions_asset_id_fkey;
ALTER TABLE svc_media.three_d_assets DROP CONSTRAINT three_d_assets_asset_id_fkey;
ALTER TABLE svc_media.process_jobs DROP CONSTRAINT process_jobs_asset_id_fkey;

-- 1a. media_assets -> "MediaAsset": id uuid -> text (prod's actual column type;
--     00493's header: "the SQL shape's media_assets.id is uuid" vs prod's text),
--     then every column the census documents as camelCase. project_id is left
--     snake_case — the census shows it is the one column prod carries unmapped,
--     added by a later Prisma migration after @map had landed for new columns.
ALTER TABLE svc_media.media_assets ALTER COLUMN id DROP DEFAULT;
ALTER TABLE svc_media.media_assets ALTER COLUMN id TYPE text USING id::text;
ALTER TABLE svc_media.media_assets RENAME TO "MediaAsset";
ALTER TABLE svc_media."MediaAsset" RENAME COLUMN product_id TO "productId";
ALTER TABLE svc_media."MediaAsset" RENAME COLUMN variant_id TO "variantId";
ALTER TABLE svc_media."MediaAsset" RENAME COLUMN raw_key TO "rawKey";
ALTER TABLE svc_media."MediaAsset" RENAME COLUMN size_bytes TO "sizeBytes";
ALTER TABLE svc_media."MediaAsset" RENAME COLUMN mime_type TO "mimeType";
ALTER TABLE svc_media."MediaAsset" RENAME COLUMN lqip_key TO "lqipKey";
ALTER TABLE svc_media."MediaAsset" RENAME COLUMN qc_issues TO "qcIssues";
ALTER TABLE svc_media."MediaAsset" RENAME COLUMN qc_score TO "qcScore";
ALTER TABLE svc_media."MediaAsset" RENAME COLUMN scan_status TO "scanStatus";
ALTER TABLE svc_media."MediaAsset" RENAME COLUMN scan_result TO "scanResult";
ALTER TABLE svc_media."MediaAsset" RENAME COLUMN is_public TO "isPublic";
ALTER TABLE svc_media."MediaAsset" RENAME COLUMN view_count TO "viewCount";
ALTER TABLE svc_media."MediaAsset" RENAME COLUMN download_count TO "downloadCount";
ALTER TABLE svc_media."MediaAsset" RENAME COLUMN sort_order TO "sortOrder";
ALTER TABLE svc_media."MediaAsset" RENAME COLUMN uploaded_by TO "uploadedBy";
ALTER TABLE svc_media."MediaAsset" RENAME COLUMN created_at TO "createdAt";
ALTER TABLE svc_media."MediaAsset" RENAME COLUMN updated_at TO "updatedAt";

-- 1b. Enums: label sets are identical, only the type name carries the
--     "half-finished @@map rollout" casing 00493 documents.
ALTER TYPE svc_media.asset_kind RENAME TO "AssetKind";
ALTER TYPE svc_media.asset_status RENAME TO "AssetStatus";
ALTER TYPE svc_media.scan_status RENAME TO "ScanStatus";

-- 1c. outbox_events (both svc_media and svc_orders): table name already
--     matches prod (per the census, this is the one table where it does);
--     only the timestamp/scalar columns are camelCase, and prod's Prisma
--     DateTime columns are `timestamp(3) without time zone`, not timestamptz
--     — that distinction is exactly what makes get_outbox_events'/get_outbox_counts'
--     `atttypid = 'timestamp'::regtype` UTC-normalization branch fire for real.
ALTER TABLE svc_media.outbox_events RENAME COLUMN created_at TO "createdAt";
ALTER TABLE svc_media.outbox_events ALTER COLUMN "createdAt" TYPE timestamp(3) without time zone USING "createdAt"::timestamp(3);
ALTER TABLE svc_media.outbox_events RENAME COLUMN published_at TO "publishedAt";
ALTER TABLE svc_media.outbox_events ALTER COLUMN "publishedAt" TYPE timestamp(3) without time zone USING "publishedAt"::timestamp(3);
ALTER TABLE svc_media.outbox_events RENAME COLUMN retry_count TO "retryCount";
ALTER TABLE svc_media.outbox_events RENAME COLUMN last_error TO "lastError";

ALTER TABLE svc_orders.outbox_events RENAME COLUMN created_at TO "createdAt";
ALTER TABLE svc_orders.outbox_events ALTER COLUMN "createdAt" TYPE timestamp(3) without time zone USING "createdAt"::timestamp(3);
ALTER TABLE svc_orders.outbox_events RENAME COLUMN published_at TO "publishedAt";
ALTER TABLE svc_orders.outbox_events ALTER COLUMN "publishedAt" TYPE timestamp(3) without time zone USING "publishedAt"::timestamp(3);
ALTER TABLE svc_orders.outbox_events RENAME COLUMN retry_count TO "retryCount";
ALTER TABLE svc_orders.outbox_events RENAME COLUMN last_error TO "lastError";

-- svc_orders.set_updated_at() is intentionally left alone: 00482 recreated it,
-- so prod HAS it now (unlike the state the 00493 header describes pre-00482).

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. EXERCISE — every catalog-resolving path 00493 repaired, against the
--    reshape above.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE FUNCTION pg_temp.assume_actor(p_actor uuid) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', p_actor, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', p_actor::text, true);
END;
$$;
GRANT EXECUTE ON FUNCTION pg_temp.assume_actor(uuid) TO PUBLIC;

-- 2a. get_outbox_events / get_outbox_counts: seed one prod-shaped row per
--     source with a known naive-UTC "createdAt", then prove both RPCs resolve
--     the camelCase columns AND normalize the naive timestamp(3) as UTC.
INSERT INTO svc_media.outbox_events (id, type, payload, published, "createdAt", "retryCount", "lastError")
VALUES ('a2fd0000-0000-4000-8000-000000000601', 'a2fixture.media.probe', '{}'::jsonb, false, timestamp '2026-01-01 12:00:00', 2, 'transient upstream timeout');

INSERT INTO svc_orders.outbox_events (id, type, payload, published, "createdAt", "retryCount", "lastError")
VALUES ('a2fd0000-0000-4000-8000-000000000602', 'a2fixture.orders.probe', '{}'::jsonb, true, timestamp '2026-01-01 12:00:00', 0, NULL);

DO $$
DECLARE
  v_media_row record;
  v_orders_row record;
  v_media_count record;
  v_orders_count record;
BEGIN
  SELECT * INTO v_media_row
  FROM public.get_outbox_events(10, false)
  WHERE id = 'a2fd0000-0000-4000-8000-000000000601';
  ASSERT v_media_row.id IS NOT NULL,
    'get_outbox_events did not resolve the prod-shaped svc_media.outbox_events row';
  ASSERT v_media_row.source = 'media' AND v_media_row.retry_count = 2
    AND v_media_row.last_error = 'transient upstream timeout' AND v_media_row.published = false,
    format('get_outbox_events resolved the wrong camelCase columns for media: %s', v_media_row);
  ASSERT v_media_row.created_at = timestamptz '2026-01-01 12:00:00+00',
    format('naive timestamp(3) "createdAt" was not normalized as UTC: got %s', v_media_row.created_at);

  SELECT * INTO v_orders_row
  FROM public.get_outbox_events(10, false)
  WHERE id = 'a2fd0000-0000-4000-8000-000000000602';
  ASSERT v_orders_row.id IS NOT NULL,
    'get_outbox_events did not resolve the prod-shaped svc_orders.outbox_events row';
  ASSERT v_orders_row.source = 'orders' AND v_orders_row.retry_count = 0
    AND v_orders_row.last_error IS NULL AND v_orders_row.published = true,
    format('get_outbox_events resolved the wrong camelCase columns for orders: %s', v_orders_row);
  ASSERT v_orders_row.created_at = timestamptz '2026-01-01 12:00:00+00',
    format('naive timestamp(3) "createdAt" was not normalized as UTC: got %s', v_orders_row.created_at);

  SELECT * INTO v_media_count FROM public.get_outbox_counts() WHERE source = 'media';
  ASSERT v_media_count.unpublished = 1 AND v_media_count.published = 0
    AND v_media_count.oldest_unpublished = timestamptz '2026-01-01 12:00:00+00',
    format('get_outbox_counts miscounted the prod-shaped media source: %s', v_media_count);

  SELECT * INTO v_orders_count FROM public.get_outbox_counts() WHERE source = 'orders';
  ASSERT v_orders_count.unpublished = 0 AND v_orders_count.published = 1,
    format('get_outbox_counts miscounted the prod-shaped orders source: %s', v_orders_count);

  RAISE NOTICE 'get_outbox_events/get_outbox_counts resolved prod-shaped camelCase + timestamp(3) columns correctly';
END;
$$;

-- 2b. record_project_ffe_receipt_batch: seed the minimal FF&E receiving
--     scaffold (project, vendor, product, one selected line, a confirmed+sent
--     PO) via the same public RPCs release_lineage_compat_test.sql already
--     proves work against the SQL shape, then seed two prod-shaped
--     svc_media."MediaAsset" rows: one that satisfies all six photo-validation
--     predicates and one that fails exactly one (status). This proves BOTH
--     that a real receiving batch completes end to end against the reshaped
--     join (full call, not just join resolution) AND that the business
--     rejection for an invalid photo is still the correct 23000
--     integrity_constraint_violation — not a 42P01/42703 resolution failure.
INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, instance_id, aud, role)
VALUES ('a2fd0000-0000-4000-8000-000000000001', 'a2fixture-designer@test.invalid', '', now(), now(), now(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');

INSERT INTO public.profiles (id, email, full_name)
VALUES ('a2fd0000-0000-4000-8000-000000000001', 'a2fixture-designer@test.invalid', 'A2 Fixture Designer')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.projects (id, name, designer_id, created_by)
VALUES ('a2fd0000-0000-4000-8000-000000000101', 'A2 Fixture Project', 'a2fd0000-0000-4000-8000-000000000001', 'a2fd0000-0000-4000-8000-000000000001');

INSERT INTO public.vendors (id, name)
VALUES ('a2fd0000-0000-4000-8000-000000000201', 'A2 Fixture Vendor');

INSERT INTO public.products (id, name, price_retail, price_trade, images, vendor_id, captured_by, captured_at, layer, status)
VALUES ('a2fd0000-0000-4000-8000-000000000301', 'A2 Fixture Chair', 100000, 60000, ARRAY[]::text[], 'a2fd0000-0000-4000-8000-000000000201', 'a2fd0000-0000-4000-8000-000000000001', now(), 'catalog', 'published');

DO $$
DECLARE
  v_line jsonb;
  v_po public.purchase_orders;
  v_valid_asset text := 'a2fd0000-0000-4000-8000-000000000601';
  v_wrong_status_asset text := 'a2fd0000-0000-4000-8000-000000000602';
  v_receipt jsonb;
  v_state text;
  v_message text;
BEGIN
  PERFORM pg_temp.assume_actor('a2fd0000-0000-4000-8000-000000000001');

  v_line := public.place_product_in_project_v2(jsonb_build_object(
    'projectId', 'a2fd0000-0000-4000-8000-000000000101',
    'productId', 'a2fd0000-0000-4000-8000-000000000301',
    'assignmentScope', 'throughout',
    'disposition', 'selected',
    'duplicateMode', 'create',
    'idempotencyKey', 'a2fixture-receipt-line'
  ));
  v_po := public.create_purchase_order(
    'a2fd0000-0000-4000-8000-000000000101',
    'a2fd0000-0000-4000-8000-000000000201',
    'full_upfront'::public.purchase_order_payment_pattern,
    ARRAY[(v_line->>'selectionId')::uuid]
  );
  UPDATE public.purchase_orders SET status = 'confirmed', sent_at = now() WHERE id = v_po.id;

  -- Prod-shaped MediaAsset rows the photo-validation join must resolve.
  -- v_valid_asset satisfies every predicate: READY, CLEAN, uploadedBy = the
  -- calling actor, permissions->>'projectId' = the project, 'receiving' tag.
  INSERT INTO svc_media."MediaAsset" (
    id, kind, "rawKey", status, "scanStatus", "uploadedBy", permissions, tags
  ) VALUES (
    v_valid_asset, 'IMAGE', 'a2fixture/valid.jpg', 'READY', 'CLEAN',
    'a2fd0000-0000-4000-8000-000000000001',
    jsonb_build_object('projectId', 'a2fd0000-0000-4000-8000-000000000101'),
    ARRAY['receiving']
  );
  -- v_wrong_status_asset fails exactly one predicate (status = PROCESSING,
  -- not READY) — everything else matches, so a resolution bug would let it
  -- through silently instead of raising the specific business rejection.
  INSERT INTO svc_media."MediaAsset" (
    id, kind, "rawKey", status, "scanStatus", "uploadedBy", permissions, tags
  ) VALUES (
    v_wrong_status_asset, 'IMAGE', 'a2fixture/processing.jpg', 'PROCESSING', 'CLEAN',
    'a2fd0000-0000-4000-8000-000000000001',
    jsonb_build_object('projectId', 'a2fd0000-0000-4000-8000-000000000101'),
    ARRAY['receiving']
  );

  -- (A) FULL SUCCESSFUL CALL — proves the reshaped join resolves and the
  -- receiving batch completes end to end, not merely that no 42P01/42703 fires.
  v_receipt := public.record_project_ffe_receipt_batch(
    v_po.id,
    jsonb_build_array(jsonb_build_object('selectionId', v_line->>'selectionId', 'receivedQuantity', 1)),
    'clean'::public.receiving_inspection_outcome,
    'A2 fixture: prod-shaped photo validated',
    ARRAY[v_valid_asset::uuid]
  );
  ASSERT (v_receipt->>'outcome') = 'clean',
    format('record_project_ffe_receipt_batch did not complete against the prod-shaped MediaAsset join: %s', v_receipt);
  ASSERT EXISTS (
    SELECT 1 FROM public.receiving_inspections
    WHERE purchase_order_id = v_po.id AND v_valid_asset::uuid = ANY(photo_asset_ids)
  ), 'receiving inspection did not record the validated prod-shaped photo asset id';
  ASSERT (SELECT received_quantity FROM public.project_ffe_items WHERE id = (v_line->>'selectionId')::uuid) = 1,
    'receipt batch against the prod-shaped join did not update the FF&E line quantity';

  -- (B) EXPECTED BUSINESS REJECTION — the single wrong predicate must still
  -- raise 23000 integrity_constraint_violation with 00447's exact message,
  -- not 42P01/42703. This is the proof the task calls "an expected
  -- business-rule rejection with the CORRECT error" for the join-resolution
  -- path, on top of the full successful call above.
  BEGIN
    PERFORM public.record_project_ffe_receipt_batch(
      v_po.id,
      jsonb_build_array(jsonb_build_object('selectionId', v_line->>'selectionId', 'receivedQuantity', 1)),
      'clean'::public.receiving_inspection_outcome,
      'A2 fixture: wrong-status photo must be rejected',
      ARRAY[v_wrong_status_asset::uuid]
    );
    RAISE EXCEPTION 'receipt batch accepted a non-READY prod-shaped photo asset';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_state = RETURNED_SQLSTATE, v_message = MESSAGE_TEXT;
    ASSERT v_state = '23000'
      AND v_message = 'receiving photos must be clean project receiving assets owned by the actor',
      format('expected 00447''s business rejection (23000), got % : %', v_state, v_message);
  END;

  RAISE NOTICE 'record_project_ffe_receipt_batch resolved the prod-shaped MediaAsset join for both the accept and reject paths';
END;
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. ANTI-VACUITY — with the reshape still in place, prove the OLD
--    snake_case-hardcoded probes (mirroring what the pre-00493 bodies did)
--    genuinely fail with the exact SQLSTATEs 00493's header cites: 42P01 for
--    the relation lookup, 42703 for the column lookups. If the reshape above
--    were a no-op, every probe below would succeed instead of erroring.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE FUNCTION pg_temp.expect_sqlstate(p_case text, p_sql text, p_expected_state text)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp AS $$
DECLARE
  v_state text;
  v_message text;
BEGIN
  BEGIN
    EXECUTE p_sql;
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_state = RETURNED_SQLSTATE, v_message = MESSAGE_TEXT;
  END;
  ASSERT v_state = p_expected_state,
    format('%s expected SQLSTATE %s, got %s (%s)', p_case, p_expected_state, COALESCE(v_state, '<success>'), v_message);
END;
$$;
GRANT EXECUTE ON FUNCTION pg_temp.expect_sqlstate(text, text, text) TO PUBLIC;

SELECT pg_temp.expect_sqlstate(
  'old snake_case svc_media.media_assets relation must be gone (mirrors 00493''s 42P01 receipt-batch failure)',
  $$SELECT 1 FROM svc_media.media_assets LIMIT 1$$,
  '42P01'
);
SELECT pg_temp.expect_sqlstate(
  'old snake_case "MediaAsset".created_at column must be gone',
  $$SELECT created_at FROM svc_media."MediaAsset" LIMIT 1$$,
  '42703'
);
SELECT pg_temp.expect_sqlstate(
  'old snake_case "MediaAsset".scan_status column must be gone',
  $$SELECT scan_status FROM svc_media."MediaAsset" LIMIT 1$$,
  '42703'
);
SELECT pg_temp.expect_sqlstate(
  'old snake_case "MediaAsset".uploaded_by column must be gone',
  $$SELECT uploaded_by FROM svc_media."MediaAsset" LIMIT 1$$,
  '42703'
);
SELECT pg_temp.expect_sqlstate(
  'old snake_case svc_media.outbox_events.created_at column must be gone (mirrors 00493''s 42703 get_outbox_counts failure)',
  $$SELECT created_at FROM svc_media.outbox_events LIMIT 1$$,
  '42703'
);
SELECT pg_temp.expect_sqlstate(
  'old snake_case svc_orders.outbox_events.retry_count column must be gone (mirrors 00493''s 42703 get_outbox_events failure)',
  $$SELECT retry_count FROM svc_orders.outbox_events LIMIT 1$$,
  '42703'
);

DO $$ BEGIN RAISE NOTICE 'anti-vacuity: every old snake_case probe failed with the exact SQLSTATE 00493''s incident cites'; END $$;

ROLLBACK;

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. Post-rollback — the snake_case originals must be untouched: zero residue.
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
BEGIN
  ASSERT to_regclass('svc_media.media_assets') IS NOT NULL,
    'rollback did not restore svc_media.media_assets';
  ASSERT to_regclass('svc_media."MediaAsset"') IS NULL,
    'rollback left the prod-shaped MediaAsset table behind';
  ASSERT (
    SELECT data_type FROM information_schema.columns
    WHERE table_schema = 'svc_media' AND table_name = 'media_assets' AND column_name = 'id'
  ) = 'uuid', 'rollback did not restore svc_media.media_assets.id to uuid';
  ASSERT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'svc_media' AND table_name = 'media_assets' AND column_name = 'created_at'
  ), 'rollback did not restore svc_media.media_assets.created_at';
  ASSERT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'svc_orders' AND table_name = 'outbox_events' AND column_name = 'retry_count'
      AND data_type = 'integer'
  ), 'rollback did not restore svc_orders.outbox_events.retry_count';
  ASSERT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'svc_media' AND table_name = 'outbox_events' AND column_name = 'created_at'
      AND data_type = 'timestamp with time zone'
  ), 'rollback did not restore svc_media.outbox_events.created_at to timestamptz';
  ASSERT EXISTS (
    SELECT 1 FROM pg_type WHERE typname = 'asset_status' AND typnamespace = 'svc_media'::regnamespace
  ), 'rollback did not restore the svc_media.asset_status enum name';
  ASSERT NOT EXISTS (
    SELECT 1 FROM pg_type WHERE typname = 'AssetStatus' AND typnamespace = 'svc_media'::regnamespace
  ), 'rollback left the prod-cased "AssetStatus" enum name behind';
  ASSERT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'asset_renditions_asset_id_fkey'
  ), 'rollback did not restore the asset_renditions -> media_assets FK';
  ASSERT NOT EXISTS (
    SELECT 1 FROM auth.users WHERE id = 'a2fd0000-0000-4000-8000-000000000001'
  ), 'rollback left the A2 fixture actor behind';

  RAISE NOTICE 'A2 prod-shape regression fixture rolled back cleanly: zero residue';
END;
$$;
