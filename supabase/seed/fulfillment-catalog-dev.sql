-- fulfillment-catalog-dev.sql — BOH (S0, task C1) dev seed.
--
-- Maps a handful of existing products.sql products to the 6 vendors profiled
-- in fulfillment-vendor-profiles.sql, so the intake RPC's mapping check
-- (vendor_id + price_trade both present, 00353 fulfillment_intake_order) sees
-- them as 'mapped', and deliberately creates + keeps exactly 2 NEW products
-- 'unmapped' (vendor_id NULL) for scripts/seed-fulfillment-orders.ts to
-- reference. public.products is NOT a writer-guarded BOH table (00350 only
-- guards fulfillment_*/ledger_* tables) — no app.fulfillment_writer GUC needed.
--
-- price_trade (R3.2, C1 fix): products.sql seeds every one of these 7 products
-- at a uniform 80% trade (20% spread) — below the 25% margin_floor_warning
-- config default (00351), which tripped the terracotta warning on EVERY
-- seeded order, not just the one meant to demonstrate it (drop-1 KNOWN
-- DEVIATION #5). The UPDATEs below override price_trade per product to varied,
-- realistic ~25–45% spreads so orders #1 and #2 land healthy, EXCEPT the
-- marble side table, held deliberately thin at ~19% — it is order 5's sole
-- line (qty 2, scripts/seed-fulfillment-orders.ts), so the floor warning gets
-- a truthful single-product demo instead of a seed-wide artifact. That same
-- product is also one of order 1's five lines; order 1's other four lines are
-- priced healthy enough that the BLENDED margin still clears the floor (see
-- the C1 fix report's per-order spread table).

-- ─── Map existing seed products to vendors + set C1 trade pricing ───────────
-- (→ 'mapped', 5 distinct vendors; spread% = (unit_price_cents − price_trade)
-- ÷ unit_price_cents, per scripts/seed-fulfillment-orders.ts's unit prices)
UPDATE public.products SET vendor_id = '11111111-1111-1111-1111-111111111101', price_trade = 273000  -- 35% spread
  WHERE id = 'a0000000-0000-0000-0000-000000000001';  -- Heirloom Oak Dining Table (orders 1, 4)
UPDATE public.products SET vendor_id = '11111111-1111-1111-1111-111111111101', price_trade = 462400  -- 32% spread
  WHERE id = 'a0000000-0000-0000-0000-000000000010';  -- Meadow Linen Sectional (order 2)
UPDATE public.products SET vendor_id = '11111111-1111-1111-1111-111111111102', price_trade = 216000  -- 40% spread
  WHERE id = 'a0000000-0000-0000-0000-000000000002';  -- Walnut Credenza (order 1)
UPDATE public.products SET vendor_id = '11111111-1111-1111-1111-111111111102', price_trade = 64080   -- 28% spread
  WHERE id = 'a0000000-0000-0000-0000-000000000011';  -- Brass Arc Floor Lamp (order 3)
UPDATE public.products SET vendor_id = '11111111-1111-1111-1111-111111111103', price_trade = 147000  -- 30% spread
  WHERE id = 'a0000000-0000-0000-0000-000000000003';  -- Live-Edge Coffee Table (order 1)
UPDATE public.products SET vendor_id = '11111111-1111-1111-1111-111111111111', price_trade = 68750   -- 45% spread
  WHERE id = 'a0000000-0000-0000-0000-000000000012';  -- Velvet Club Chair (order 1)
UPDATE public.products SET vendor_id = '11111111-1111-1111-1111-111111111118', price_trade = 72819   -- ~19% spread — DELIBERATELY THIN (R3.2)
  WHERE id = 'a0000000-0000-0000-0000-000000000013';  -- Marble Side Table (order 1's 5th line + order 5's sole qty-2 line)

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
