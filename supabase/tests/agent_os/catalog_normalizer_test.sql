-- ═══════════════════════════════════════════════════════════════════════════
-- Catalog Normalizer staging tests (WP-2.4, migration 00306)
--
-- Exercises:
--   1. DDL sanity — catalog_feed_batches / catalog_feed_items columns +
--      CHECK constraints exist and behave.
--   2. catalog_feed_batches UNIQUE(vendor_id, content_hash) — a byte-identical
--      re-upload for the same vendor is rejected at the DB level (the upload
--      route pre-checks this and returns the existing row instead of hitting
--      the constraint in normal operation, but the constraint is the backstop).
--   3. catalog_feed_items UNIQUE(batch_id, source_row_hash) — the normalizer's
--      idempotent-rerun guarantee rests on this.
--   4. products partial unique index idx_products_vendor_sku_catalog — two
--      catalog-layer rows sharing (vendor_id, vendor_sku) are rejected; NULL
--      vendor_sku is unconstrained (any number of NULLs coexist).
--   5. promotion_audit_log accepts the new 'catalog_commit' action_type
--      (widened by 00306) alongside the original promote/demote/merge/undo.
--   6. products gains vendor_sku/finishes/freight_class/pricing_tiers and
--      they round-trip.
--   7. storage.buckets has 'catalog-feeds' (private).
--
-- Commit-route (gated write-back) logic — eligibility filter, approval gate,
-- field-correction merge, idempotent re-run — is pure TypeScript, covered by
-- jest: apps/admin-portal/src/lib/__tests__/catalog-commit.test.ts. Not
-- re-tested here at the SQL level beyond the constraints it relies on (this
-- file's cases 4-5).
--
-- Single transaction, ROLLBACK at the end — re-runnable with no side effects.
-- How to run:
--   docker exec -i supabase_db_supabase psql -U postgres -d postgres \
--     -v ON_ERROR_STOP=1 < supabase/tests/agent_os/catalog_normalizer_test.sql
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

DO $$
DECLARE
  v_vendor_id      uuid;
  v_other_vendor_id uuid;
  v_batch_id       uuid;
  v_item_id        uuid;
  v_product_id     uuid;
  v_product2_id    uuid;
  v_count          int;
  v_col_count      int;
BEGIN
  -- ── fixtures: two catalog-side vendors (marker: 'w24-sql-test') ──────────
  INSERT INTO public.vendors (id, name)
  VALUES (gen_random_uuid(), 'w24-sql-test Acme Furniture Co')
  RETURNING id INTO v_vendor_id;

  INSERT INTO public.vendors (id, name)
  VALUES (gen_random_uuid(), 'w24-sql-test Other Vendor Co')
  RETURNING id INTO v_other_vendor_id;

  -- ── Case 1: DDL sanity — columns + CHECK constraints exist ───────────────
  SELECT count(*) INTO v_col_count
    FROM information_schema.columns
   WHERE table_schema = 'public'
     AND table_name = 'catalog_feed_batches'
     AND column_name IN ('id','vendor_id','pipeline_vendor_id','source','storage_path',
                          'content_hash','status','row_count','auto_count','review_count',
                          'error','commit_task_id','created_at','updated_at');
  ASSERT v_col_count = 14, 'FAIL 1a: catalog_feed_batches missing expected columns, got ' || v_col_count;

  SELECT count(*) INTO v_col_count
    FROM information_schema.columns
   WHERE table_schema = 'public'
     AND table_name = 'catalog_feed_items'
     AND column_name IN ('id','batch_id','row_index','source_row_hash','raw','normalized',
                          'confidence','field_confidence','match_product_id','action','diff',
                          'status','committed_product_id','error','created_at');
  ASSERT v_col_count = 15, 'FAIL 1b: catalog_feed_items missing expected columns, got ' || v_col_count;

  BEGIN
    INSERT INTO public.catalog_feed_batches (vendor_id, source, storage_path, content_hash, status)
    VALUES (v_vendor_id, 'upload', 'x/y.csv', 'deadbeef', 'not-a-real-status');
    RAISE EXCEPTION 'FAIL 1c: an invalid batch status should have raised a CHECK violation';
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM LIKE 'FAIL%' THEN RAISE; END IF;
  END;

  BEGIN
    INSERT INTO public.catalog_feed_batches (vendor_id, source, storage_path, content_hash)
    VALUES (v_vendor_id, 'not-a-real-source', 'x/y.csv', 'deadbeef');
    RAISE EXCEPTION 'FAIL 1d: an invalid batch source should have raised a CHECK violation';
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM LIKE 'FAIL%' THEN RAISE; END IF;
  END;

  -- ── Case 2: catalog_feed_batches UNIQUE(vendor_id, content_hash) ─────────
  INSERT INTO public.catalog_feed_batches (id, vendor_id, source, storage_path, content_hash, status)
  VALUES (gen_random_uuid(), v_vendor_id, 'upload', 'acme/batch-1.csv', 'hash-aaa', 'received')
  RETURNING id INTO v_batch_id;

  BEGIN
    INSERT INTO public.catalog_feed_batches (vendor_id, source, storage_path, content_hash, status)
    VALUES (v_vendor_id, 'upload', 'acme/batch-1-retry.csv', 'hash-aaa', 'received');
    RAISE EXCEPTION 'FAIL 2a: a duplicate (vendor_id, content_hash) batch should have raised a UNIQUE violation';
  EXCEPTION WHEN unique_violation THEN
    IF SQLERRM LIKE 'FAIL%' THEN RAISE; END IF;
  END;

  -- Same content_hash for a DIFFERENT vendor is fine (vendor-scoped uniqueness).
  INSERT INTO public.catalog_feed_batches (vendor_id, source, storage_path, content_hash, status)
  VALUES (v_other_vendor_id, 'upload', 'other/batch-1.csv', 'hash-aaa', 'received');
  SELECT count(*) INTO v_count FROM public.catalog_feed_batches WHERE content_hash = 'hash-aaa';
  ASSERT v_count = 2, 'FAIL 2b: same content_hash across two vendors should both exist, got ' || v_count;

  -- ── Case 3: catalog_feed_items UNIQUE(batch_id, source_row_hash) ─────────
  INSERT INTO public.catalog_feed_items (id, batch_id, row_index, source_row_hash, raw, status)
  VALUES (gen_random_uuid(), v_batch_id, 0, 'row-hash-1', '{"name":"Sofa"}'::jsonb, 'pending')
  RETURNING id INTO v_item_id;

  BEGIN
    INSERT INTO public.catalog_feed_items (batch_id, row_index, source_row_hash, raw, status)
    VALUES (v_batch_id, 1, 'row-hash-1', '{"name":"Sofa (dup)"}'::jsonb, 'pending');
    RAISE EXCEPTION 'FAIL 3a: a duplicate (batch_id, source_row_hash) item should have raised a UNIQUE violation';
  EXCEPTION WHEN unique_violation THEN
    IF SQLERRM LIKE 'FAIL%' THEN RAISE; END IF;
  END;

  -- ON CONFLICT (batch_id, source_row_hash) DO NOTHING is the idempotent-
  -- rerun idiom the normalizer relies on — confirm it's a silent no-op, not
  -- an error, and doesn't create a second row.
  INSERT INTO public.catalog_feed_items (batch_id, row_index, source_row_hash, raw, status)
  VALUES (v_batch_id, 0, 'row-hash-1', '{"name":"Sofa"}'::jsonb, 'pending')
  ON CONFLICT (batch_id, source_row_hash) DO NOTHING;
  SELECT count(*) INTO v_count FROM public.catalog_feed_items WHERE batch_id = v_batch_id AND source_row_hash = 'row-hash-1';
  ASSERT v_count = 1, 'FAIL 3b: ON CONFLICT DO NOTHING must not create a duplicate row, got ' || v_count;

  BEGIN
    INSERT INTO public.catalog_feed_items (batch_id, row_index, source_row_hash, raw, status)
    VALUES (v_batch_id, 2, 'row-hash-2', '{"name":"Chair"}'::jsonb, 'not-a-real-status');
    RAISE EXCEPTION 'FAIL 3c: an invalid item status should have raised a CHECK violation';
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM LIKE 'FAIL%' THEN RAISE; END IF;
  END;

  -- ── Case 4: products.vendor_sku partial unique index (catalog layer only) ──
  INSERT INTO public.products (
    id, name, source_url, captured_by, captured_at, layer, patina_managed,
    vendor_id, vendor_sku, finishes, freight_class, pricing_tiers
  ) VALUES (
    gen_random_uuid(), 'w24-sql-test Chesterfield Sofa', 'https://acme.example.com/sofa',
    gen_random_uuid(), now(), 'catalog', true,
    v_vendor_id, 'ACME-SOFA-001', ARRAY['brushed brass'], 'class-70',
    '[{"min_qty":1,"price_cents":129900},{"min_qty":10,"price_cents":119900}]'::jsonb
  ) RETURNING id INTO v_product_id;

  -- Round-trip the four new columns.
  PERFORM 1 FROM public.products
   WHERE id = v_product_id
     AND vendor_sku = 'ACME-SOFA-001'
     AND finishes = ARRAY['brushed brass']
     AND freight_class = 'class-70'
     AND pricing_tiers @> '[{"min_qty":1,"price_cents":129900}]'::jsonb;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  ASSERT v_count = 1, 'FAIL 4a: new products columns did not round-trip as inserted';

  BEGIN
    INSERT INTO public.products (
      id, name, source_url, captured_by, captured_at, layer, patina_managed, vendor_id, vendor_sku
    ) VALUES (
      gen_random_uuid(), 'w24-sql-test Chesterfield Sofa II', 'https://acme.example.com/sofa-ii',
      gen_random_uuid(), now(), 'catalog', true, v_vendor_id, 'ACME-SOFA-001'
    );
    RAISE EXCEPTION 'FAIL 4b: a duplicate (vendor_id, vendor_sku) catalog product should have raised a UNIQUE violation';
  EXCEPTION WHEN unique_violation THEN
    IF SQLERRM LIKE 'FAIL%' THEN RAISE; END IF;
  END;

  -- Same vendor_sku for a DIFFERENT vendor is fine (vendor-scoped uniqueness).
  INSERT INTO public.products (
    id, name, source_url, captured_by, captured_at, layer, patina_managed, vendor_id, vendor_sku
  ) VALUES (
    gen_random_uuid(), 'w24-sql-test Other Vendor Sofa', 'https://other.example.com/sofa',
    gen_random_uuid(), now(), 'catalog', true, v_other_vendor_id, 'ACME-SOFA-001'
  );

  -- NULL vendor_sku is unconstrained by the partial index — any number of
  -- catalog rows with no SKU coexist for the same vendor.
  INSERT INTO public.products (
    id, name, source_url, captured_by, captured_at, layer, patina_managed, vendor_id, vendor_sku
  ) VALUES (
    gen_random_uuid(), 'w24-sql-test No-SKU Product A', 'https://acme.example.com/a',
    gen_random_uuid(), now(), 'catalog', true, v_vendor_id, NULL
  ) RETURNING id INTO v_product2_id;
  INSERT INTO public.products (
    id, name, source_url, captured_by, captured_at, layer, patina_managed, vendor_id, vendor_sku
  ) VALUES (
    gen_random_uuid(), 'w24-sql-test No-SKU Product B', 'https://acme.example.com/b',
    gen_random_uuid(), now(), 'catalog', true, v_vendor_id, NULL
  );
  SELECT count(*) INTO v_count
    FROM public.products
   WHERE vendor_id = v_vendor_id AND vendor_sku IS NULL AND layer = 'catalog'
     AND name LIKE 'w24-sql-test No-SKU Product%';
  ASSERT v_count = 2, 'FAIL 4c: two catalog products with NULL vendor_sku should coexist, got ' || v_count;

  -- ── Case 5: promotion_audit_log accepts the new 'catalog_commit' action_type ──
  INSERT INTO public.promotion_audit_log (product_id, from_layer, to_layer, action_type, field_snapshot)
  VALUES (v_product_id, 'catalog', 'catalog', 'catalog_commit', '{"name":"w24-sql-test Chesterfield Sofa"}'::jsonb);
  SELECT count(*) INTO v_count FROM public.promotion_audit_log WHERE product_id = v_product_id AND action_type = 'catalog_commit';
  ASSERT v_count = 1, 'FAIL 5a: promotion_audit_log should accept action_type=catalog_commit';

  -- The original vocabulary still works (widened, not replaced).
  INSERT INTO public.promotion_audit_log (product_id, from_layer, to_layer, action_type)
  VALUES (v_product_id, 'personal', 'studio', 'promote');

  BEGIN
    INSERT INTO public.promotion_audit_log (product_id, from_layer, to_layer, action_type)
    VALUES (v_product_id, 'catalog', 'catalog', 'not-a-real-action');
    RAISE EXCEPTION 'FAIL 5b: an invalid action_type should still raise a CHECK violation';
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM LIKE 'FAIL%' THEN RAISE; END IF;
  END;

  -- ── Case 6: RLS enabled, no client write policy ───────────────────────────
  SELECT count(*) INTO v_count
    FROM pg_tables
   WHERE schemaname = 'public'
     AND tablename IN ('catalog_feed_batches','catalog_feed_items')
     AND rowsecurity = true;
  ASSERT v_count = 2, 'FAIL 6: both staging tables must have RLS enabled, got ' || v_count;

  -- ── Case 7: storage bucket exists and is private ──────────────────────────
  PERFORM 1 FROM storage.buckets WHERE id = 'catalog-feeds' AND public = false;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  ASSERT v_count = 1, 'FAIL 7: catalog-feeds bucket must exist and be private';

  RAISE NOTICE 'catalog_normalizer_test: all cases passed';
END $$;

ROLLBACK;
