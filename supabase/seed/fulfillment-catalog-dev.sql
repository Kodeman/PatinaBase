-- fulfillment-catalog-dev.sql — BOH (S0, task C1) dev seed.
--
-- Maps a handful of existing products.sql products to the 6 vendors profiled
-- in fulfillment-vendor-profiles.sql, so the intake RPC's mapping check
-- (vendor_id + price_trade both present, 00353 fulfillment_intake_order) sees
-- them as 'mapped', and deliberately creates + keeps exactly 2 NEW products
-- 'unmapped' (vendor_id NULL) for scripts/seed-fulfillment-orders.ts to
-- reference. public.products is NOT a writer-guarded BOH table (00350 only
-- guards fulfillment_*/ledger_* tables) — no app.fulfillment_writer GUC needed.

-- ─── Map existing seed products to vendors (→ 'mapped', 5 distinct vendors) ──
UPDATE public.products SET vendor_id = '11111111-1111-1111-1111-111111111101'
  WHERE id IN ('a0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000010');
UPDATE public.products SET vendor_id = '11111111-1111-1111-1111-111111111102'
  WHERE id IN ('a0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000011');
UPDATE public.products SET vendor_id = '11111111-1111-1111-1111-111111111103'
  WHERE id = 'a0000000-0000-0000-0000-000000000003';
UPDATE public.products SET vendor_id = '11111111-1111-1111-1111-111111111111'
  WHERE id = 'a0000000-0000-0000-0000-000000000012';
UPDATE public.products SET vendor_id = '11111111-1111-1111-1111-111111111118'
  WHERE id = 'a0000000-0000-0000-0000-000000000013';

-- ─── Two deliberately UNMAPPED products (vendor_id NULL) ────────────────────
-- Confirmed live column set against 00001/00015/00060/00129/00152: source_url
-- and captured_by are nullable (00060 dropped their NOT NULL), captured_at is
-- NOT NULL (00001), status NOT NULL default 'published' (00129), layer NOT
-- NULL with no default — the 00152 products_normalize_layer_defaults_trigger
-- would backfill layer='catalog' anyway, but we set it explicitly. That
-- trigger also forces patina_managed=true for layer='catalog' rows, which is
-- required by the products_catalog_requires_management CHECK.
INSERT INTO public.products
  (id, name, slug, price_retail, price_trade, category, status, source_url, captured_by, captured_at, layer)
VALUES
  ('bff00000-0000-0000-0000-0000000000f1', 'Unmapped Brass Sconce', 'unmapped-brass-sconce',
   48000, 38400, 'lighting', 'published', 'seed://boh', 'a0000000-0000-0000-0000-000000000004', now(), 'catalog'),
  ('bff00000-0000-0000-0000-0000000000f2', 'Unmapped Oak Stool', 'unmapped-oak-stool',
   32000, 25600, 'chair', 'published', 'seed://boh', 'a0000000-0000-0000-0000-000000000004', now(), 'catalog')
ON CONFLICT (id) DO NOTHING;

-- Defensive: guarantee they stay unmapped even if a prior seed run or a
-- future products.sql edit ever touched them (ON CONFLICT DO NOTHING above
-- means a re-run wouldn't otherwise correct a drifted vendor_id).
UPDATE public.products SET vendor_id = NULL
  WHERE id IN ('bff00000-0000-0000-0000-0000000000f1', 'bff00000-0000-0000-0000-0000000000f2');
