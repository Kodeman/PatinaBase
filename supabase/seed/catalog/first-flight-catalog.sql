-- ═══════════════════════════════════════════════════════════════════════════
-- First Flight catalogue — GENERATED, do not hand-edit.
--
--   generator : scripts/first-flight/build-catalog.py
--   manifest  : catalog-fixture.csv
--   profile   : fixture
--   rows      : 6
--
-- No generation timestamp and no absolute seeded dates: the file is a
-- deterministic function of the manifest, so regenerating it produces no
-- diff, and a stack reset months from now still has rows inside the last
-- seven days for NEW THIS WEEK to draw.
--
-- Re-generate rather than patch: product ids and image object names are
-- uuid5 derivations of the manifest, so the same manifest always produces
-- the same file and re-running overwrites rather than duplicates.
--
-- `published_at` means the moment the piece entered the Patina catalogue.
-- Rows whose manifest cell was blank carry a staggered seeding timestamp;
-- that is the only thing the column asserts.
--
-- Every optional column the manifest left blank is written as NULL. A piece
-- with no lead time has no lead time; the app omits the line rather than
-- printing a placeholder.
--
-- `patina_managed` is not a choice here: products_catalog_requires_management
-- CHECKs (layer <> 'catalog' OR patina_managed) and the
-- products_normalize_layer_defaults BEFORE INSERT trigger sets it true for
-- every catalog row.
-- ═══════════════════════════════════════════════════════════════════════════

-- Applied by `pnpm supabase:reset` (wired into config.toml [db.seed]) and,
-- on production, by a Kody-run `psql -1 -f`. No BEGIN/COMMIT here: no other
-- seed file in this tree opens a transaction, and psql's -1 is what makes the
-- production apply all-or-nothing.

-- ─── makers ──────────────────────────────────────────────────────────────
-- vendors has no unique constraint on name, so ON CONFLICT is unavailable:
-- resolve by lower(name), insert when absent, and refuse an ambiguous name
-- rather than pick one. `maker_name` must never resolve to 'Unknown Maker' —
-- Product.resolvedMakerName drops those rows client-side.
DO $ff$
DECLARE
  v_n int;
BEGIN

  SELECT count(*) INTO v_n FROM public.vendors WHERE lower(name) = lower('Fixture Chairworks');
  IF v_n > 1 THEN
    RAISE EXCEPTION 'maker % matches % vendor rows — resolve by hand before seeding', 'Fixture Chairworks', v_n;
  ELSIF v_n = 0 THEN
    INSERT INTO public.vendors (name, made_in, website, is_patina_catalog)
    VALUES ('Fixture Chairworks', 'Bath, Maine', NULL, true);
  ELSE
    UPDATE public.vendors SET is_patina_catalog = true WHERE lower(name) = lower('Fixture Chairworks');
  END IF;

  SELECT count(*) INTO v_n FROM public.vendors WHERE lower(name) = lower('Fixture Metalworks');
  IF v_n > 1 THEN
    RAISE EXCEPTION 'maker % matches % vendor rows — resolve by hand before seeding', 'Fixture Metalworks', v_n;
  ELSIF v_n = 0 THEN
    INSERT INTO public.vendors (name, made_in, website, is_patina_catalog)
    VALUES ('Fixture Metalworks', 'Portland, Oregon', NULL, true);
  ELSE
    UPDATE public.vendors SET is_patina_catalog = true WHERE lower(name) = lower('Fixture Metalworks');
  END IF;

  SELECT count(*) INTO v_n FROM public.vendors WHERE lower(name) = lower('Fixture Pottery');
  IF v_n > 1 THEN
    RAISE EXCEPTION 'maker % matches % vendor rows — resolve by hand before seeding', 'Fixture Pottery', v_n;
  ELSIF v_n = 0 THEN
    INSERT INTO public.vendors (name, made_in, website, is_patina_catalog)
    VALUES ('Fixture Pottery', 'Asheville, North Carolina', NULL, true);
  ELSE
    UPDATE public.vendors SET is_patina_catalog = true WHERE lower(name) = lower('Fixture Pottery');
  END IF;

  SELECT count(*) INTO v_n FROM public.vendors WHERE lower(name) = lower('Fixture Weavers');
  IF v_n > 1 THEN
    RAISE EXCEPTION 'maker % matches % vendor rows — resolve by hand before seeding', 'Fixture Weavers', v_n;
  ELSIF v_n = 0 THEN
    INSERT INTO public.vendors (name, made_in, website, is_patina_catalog)
    VALUES ('Fixture Weavers', 'Chattanooga, Tennessee', NULL, true);
  ELSE
    UPDATE public.vendors SET is_patina_catalog = true WHERE lower(name) = lower('Fixture Weavers');
  END IF;

  SELECT count(*) INTO v_n FROM public.vendors WHERE lower(name) = lower('Fixture Woodshop');
  IF v_n > 1 THEN
    RAISE EXCEPTION 'maker % matches % vendor rows — resolve by hand before seeding', 'Fixture Woodshop', v_n;
  ELSIF v_n = 0 THEN
    INSERT INTO public.vendors (name, made_in, website, is_patina_catalog)
    VALUES ('Fixture Woodshop', 'Aarhus, Denmark', NULL, true);
  ELSE
    UPDATE public.vendors SET is_patina_catalog = true WHERE lower(name) = lower('Fixture Woodshop');
  END IF;
END
$ff$;

-- ─── pieces ──────────────────────────────────────────────────────────────

INSERT INTO public.products (
  id, name, slug, brand, description, category, status, layer,
  price_retail, materials, style_tags, tags, finish, dimensions,
  lead_time_weeks, images, source_url, quality_score, published_at,
  photo_verified_at, shipping_flat_cents, vendor_id,
  captured_by, captured_at
) VALUES (
  '85b1952a-4427-5360-8632-a088a9acd024', 'Fixture Oak Dining Table', 'ff-fixture-oak-dining-table', 'Fixture Woodshop', 'A fixture row. Solid white oak with a hand-rubbed oil finish.',
  'tables', 'published', 'catalog',
  420000, ARRAY['white oak', 'tung oil'], ARRAY['Warm Modern'], ARRAY['first_flight', 'maker_piece'],
  'Hand-rubbed tung oil', '{"depth": 40, "height": 30, "unit": "in", "width": 96}'::jsonb, 10,
  ARRAY['http://127.0.0.1:54321/storage/v1/object/public/product-images/a0000000-0000-0000-0000-000000000001/85b1952a-4427-5360-8632-a088a9acd024/c61abfc5-6024-5138-9654-a4d383f881c1.jpg'],
  NULL, NULL, now() - interval '0 minutes',
  NULL, NULL,
  (SELECT id FROM public.vendors WHERE lower(name) = lower('Fixture Woodshop') LIMIT 1),
  'a0000000-0000-0000-0000-000000000001', now() - interval '0 minutes'
)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name, slug = EXCLUDED.slug, brand = EXCLUDED.brand,
  description = EXCLUDED.description, category = EXCLUDED.category,
  status = EXCLUDED.status, layer = EXCLUDED.layer,
  price_retail = EXCLUDED.price_retail, materials = EXCLUDED.materials,
  style_tags = EXCLUDED.style_tags, tags = EXCLUDED.tags,
  finish = EXCLUDED.finish, dimensions = EXCLUDED.dimensions,
  lead_time_weeks = EXCLUDED.lead_time_weeks, images = EXCLUDED.images,
  source_url = EXCLUDED.source_url, quality_score = EXCLUDED.quality_score,
  published_at = EXCLUDED.published_at,
  photo_verified_at = EXCLUDED.photo_verified_at,
  shipping_flat_cents = EXCLUDED.shipping_flat_cents,
  vendor_id = EXCLUDED.vendor_id, updated_at = now();
-- hand-authored mapping (First Flight W0 L0.3, 2026-09-02, ruling D2); style=Warm Modern; materials moved=yes; palette moved=yes
INSERT INTO public.product_style_spectrum (
  product_id, warmth, complexity, formality, timelessness, boldness,
  craftsmanship, source, confidence, assigned_by
) VALUES (
  '85b1952a-4427-5360-8632-a088a9acd024', 0.8, -0.1, 0.05, 0.3, -0.05, 0.45,
  'manual', '{"boldness": 0.7, "complexity": 0.55, "craftsmanship": 0.7, "formality": 0.55, "timelessness": 0.7, "warmth": 0.7}'::jsonb, 'a0000000-0000-0000-0000-000000000001'
)
ON CONFLICT (product_id) DO UPDATE SET
  warmth = EXCLUDED.warmth, complexity = EXCLUDED.complexity,
  formality = EXCLUDED.formality, timelessness = EXCLUDED.timelessness,
  boldness = EXCLUDED.boldness, craftsmanship = EXCLUDED.craftsmanship,
  source = EXCLUDED.source, confidence = EXCLUDED.confidence,
  updated_at = now();

INSERT INTO public.products (
  id, name, slug, brand, description, category, status, layer,
  price_retail, materials, style_tags, tags, finish, dimensions,
  lead_time_weeks, images, source_url, quality_score, published_at,
  photo_verified_at, shipping_flat_cents, vendor_id,
  captured_by, captured_at
) VALUES (
  '33ef1884-2a20-5467-879b-4a3e91cde8a9', 'Fixture Turned-Leg Side Chair', 'ff-fixture-turned-leg-side-chair', 'Fixture Chairworks', 'A fixture row. Turned legs, caned seat, original finish left alone.',
  'seating', 'published', 'catalog',
  89000, ARRAY['ash', 'cane'], ARRAY['Rustic'], ARRAY['first_flight', 'maker_piece'],
  'Original shellac', '{"depth": 20, "height": 36, "unit": "in", "width": 18}'::jsonb, 6,
  ARRAY['http://127.0.0.1:54321/storage/v1/object/public/product-images/a0000000-0000-0000-0000-000000000001/33ef1884-2a20-5467-879b-4a3e91cde8a9/5acf9c6f-5ed7-51d2-9404-3148d2a4f21d.jpg'],
  NULL, 84, now() - interval '2881 minutes',
  now() - interval '2881 minutes', NULL,
  (SELECT id FROM public.vendors WHERE lower(name) = lower('Fixture Chairworks') LIMIT 1),
  'a0000000-0000-0000-0000-000000000001', now() - interval '2881 minutes'
)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name, slug = EXCLUDED.slug, brand = EXCLUDED.brand,
  description = EXCLUDED.description, category = EXCLUDED.category,
  status = EXCLUDED.status, layer = EXCLUDED.layer,
  price_retail = EXCLUDED.price_retail, materials = EXCLUDED.materials,
  style_tags = EXCLUDED.style_tags, tags = EXCLUDED.tags,
  finish = EXCLUDED.finish, dimensions = EXCLUDED.dimensions,
  lead_time_weeks = EXCLUDED.lead_time_weeks, images = EXCLUDED.images,
  source_url = EXCLUDED.source_url, quality_score = EXCLUDED.quality_score,
  published_at = EXCLUDED.published_at,
  photo_verified_at = EXCLUDED.photo_verified_at,
  shipping_flat_cents = EXCLUDED.shipping_flat_cents,
  vendor_id = EXCLUDED.vendor_id, updated_at = now();
-- hand-authored mapping (First Flight W0 L0.3, 2026-09-02, ruling D2); style=Rustic; materials moved=yes; palette moved=no
INSERT INTO public.product_style_spectrum (
  product_id, warmth, complexity, formality, timelessness, boldness,
  craftsmanship, source, confidence, assigned_by
) VALUES (
  '33ef1884-2a20-5467-879b-4a3e91cde8a9', 0.92, 0.2, -0.57, 0.55, 0.1, 0.7,
  'manual', '{"boldness": 0.55, "complexity": 0.7, "craftsmanship": 0.7, "formality": 0.7, "timelessness": 0.7, "warmth": 0.7}'::jsonb, 'a0000000-0000-0000-0000-000000000001'
)
ON CONFLICT (product_id) DO UPDATE SET
  warmth = EXCLUDED.warmth, complexity = EXCLUDED.complexity,
  formality = EXCLUDED.formality, timelessness = EXCLUDED.timelessness,
  boldness = EXCLUDED.boldness, craftsmanship = EXCLUDED.craftsmanship,
  source = EXCLUDED.source, confidence = EXCLUDED.confidence,
  updated_at = now();

INSERT INTO public.products (
  id, name, slug, brand, description, category, status, layer,
  price_retail, materials, style_tags, tags, finish, dimensions,
  lead_time_weeks, images, source_url, quality_score, published_at,
  photo_verified_at, shipping_flat_cents, vendor_id,
  captured_by, captured_at
) VALUES (
  '1a666c28-9477-52b9-86ed-a09a6fd7eebb', 'Fixture Enamel Dome Pendant', 'ff-fixture-enamel-dome-pendant', 'Fixture Metalworks', 'A fixture row. Spun steel dome in a soft matte enamel.',
  'lighting', 'published', 'catalog',
  34000, ARRAY['steel', 'enamel'], ARRAY['Modern Industrial'], ARRAY['first_flight', 'maker_piece'],
  'Matte enamel', '{"depth": 16, "height": 11, "unit": "in", "width": 16}'::jsonb, 4,
  ARRAY['http://127.0.0.1:54321/storage/v1/object/public/product-images/a0000000-0000-0000-0000-000000000001/1a666c28-9477-52b9-86ed-a09a6fd7eebb/e5e50860-93ba-55c9-a23f-42dcbd35cb29.jpg'],
  NULL, NULL, now() - interval '5762 minutes',
  NULL, NULL,
  (SELECT id FROM public.vendors WHERE lower(name) = lower('Fixture Metalworks') LIMIT 1),
  'a0000000-0000-0000-0000-000000000001', now() - interval '5762 minutes'
)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name, slug = EXCLUDED.slug, brand = EXCLUDED.brand,
  description = EXCLUDED.description, category = EXCLUDED.category,
  status = EXCLUDED.status, layer = EXCLUDED.layer,
  price_retail = EXCLUDED.price_retail, materials = EXCLUDED.materials,
  style_tags = EXCLUDED.style_tags, tags = EXCLUDED.tags,
  finish = EXCLUDED.finish, dimensions = EXCLUDED.dimensions,
  lead_time_weeks = EXCLUDED.lead_time_weeks, images = EXCLUDED.images,
  source_url = EXCLUDED.source_url, quality_score = EXCLUDED.quality_score,
  published_at = EXCLUDED.published_at,
  photo_verified_at = EXCLUDED.photo_verified_at,
  shipping_flat_cents = EXCLUDED.shipping_flat_cents,
  vendor_id = EXCLUDED.vendor_id, updated_at = now();
-- hand-authored mapping (First Flight W0 L0.3, 2026-09-02, ruling D2); style=Modern Industrial; materials moved=yes; palette moved=yes
INSERT INTO public.product_style_spectrum (
  product_id, warmth, complexity, formality, timelessness, boldness,
  craftsmanship, source, confidence, assigned_by
) VALUES (
  '1a666c28-9477-52b9-86ed-a09a6fd7eebb', -0.67, 0.0, 0.05, 0.25, 0.38, 0.4,
  'manual', '{"boldness": 0.7, "complexity": 0.7, "craftsmanship": 0.7, "formality": 0.7, "timelessness": 0.7, "warmth": 0.7}'::jsonb, 'a0000000-0000-0000-0000-000000000001'
)
ON CONFLICT (product_id) DO UPDATE SET
  warmth = EXCLUDED.warmth, complexity = EXCLUDED.complexity,
  formality = EXCLUDED.formality, timelessness = EXCLUDED.timelessness,
  boldness = EXCLUDED.boldness, craftsmanship = EXCLUDED.craftsmanship,
  source = EXCLUDED.source, confidence = EXCLUDED.confidence,
  updated_at = now();

INSERT INTO public.products (
  id, name, slug, brand, description, category, status, layer,
  price_retail, materials, style_tags, tags, finish, dimensions,
  lead_time_weeks, images, source_url, quality_score, published_at,
  photo_verified_at, shipping_flat_cents, vendor_id,
  captured_by, captured_at
) VALUES (
  '744a5f21-feb6-5f1b-a036-f1fba4f182d2', 'Fixture Glazed Stoneware Planter', 'ff-fixture-glazed-stoneware-planter', 'Fixture Pottery', 'A fixture row. Wheel-thrown stoneware in a single soft glaze.',
  'decor', 'published', 'catalog',
  12000, ARRAY['stoneware'], ARRAY['Japandi'], ARRAY['first_flight', 'maker_piece'],
  'Satin glaze', '{"depth": 7, "height": 6, "unit": "in", "width": 7}'::jsonb, NULL,
  ARRAY['http://127.0.0.1:54321/storage/v1/object/public/product-images/a0000000-0000-0000-0000-000000000001/744a5f21-feb6-5f1b-a036-f1fba4f182d2/f8e13faf-5152-5451-a2d6-34f5d98cf06f.jpg'],
  NULL, NULL, now() - interval '10083 minutes',
  NULL, NULL,
  (SELECT id FROM public.vendors WHERE lower(name) = lower('Fixture Pottery') LIMIT 1),
  'a0000000-0000-0000-0000-000000000001', now() - interval '10083 minutes'
)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name, slug = EXCLUDED.slug, brand = EXCLUDED.brand,
  description = EXCLUDED.description, category = EXCLUDED.category,
  status = EXCLUDED.status, layer = EXCLUDED.layer,
  price_retail = EXCLUDED.price_retail, materials = EXCLUDED.materials,
  style_tags = EXCLUDED.style_tags, tags = EXCLUDED.tags,
  finish = EXCLUDED.finish, dimensions = EXCLUDED.dimensions,
  lead_time_weeks = EXCLUDED.lead_time_weeks, images = EXCLUDED.images,
  source_url = EXCLUDED.source_url, quality_score = EXCLUDED.quality_score,
  published_at = EXCLUDED.published_at,
  photo_verified_at = EXCLUDED.photo_verified_at,
  shipping_flat_cents = EXCLUDED.shipping_flat_cents,
  vendor_id = EXCLUDED.vendor_id, updated_at = now();
-- hand-authored mapping (First Flight W0 L0.3, 2026-09-02, ruling D2); style=Japandi; materials moved=yes; palette moved=yes
INSERT INTO public.product_style_spectrum (
  product_id, warmth, complexity, formality, timelessness, boldness,
  craftsmanship, source, confidence, assigned_by
) VALUES (
  '744a5f21-feb6-5f1b-a036-f1fba4f182d2', 0.42, -0.55, 0.33, 0.75, -0.4, 0.85,
  'manual', '{"boldness": 0.7, "complexity": 0.7, "craftsmanship": 0.7, "formality": 0.7, "timelessness": 0.7, "warmth": 0.7}'::jsonb, 'a0000000-0000-0000-0000-000000000001'
)
ON CONFLICT (product_id) DO UPDATE SET
  warmth = EXCLUDED.warmth, complexity = EXCLUDED.complexity,
  formality = EXCLUDED.formality, timelessness = EXCLUDED.timelessness,
  boldness = EXCLUDED.boldness, craftsmanship = EXCLUDED.craftsmanship,
  source = EXCLUDED.source, confidence = EXCLUDED.confidence,
  updated_at = now();

INSERT INTO public.products (
  id, name, slug, brand, description, category, status, layer,
  price_retail, materials, style_tags, tags, finish, dimensions,
  lead_time_weeks, images, source_url, quality_score, published_at,
  photo_verified_at, shipping_flat_cents, vendor_id,
  captured_by, captured_at
) VALUES (
  '4c2b6fed-5877-558e-b4ec-bf24a12a9abc', 'Fixture Flatweave Dining Rug', 'ff-fixture-flatweave-dining-rug', 'Fixture Weavers', 'A fixture row. Flatweave wool, woven to size.',
  'textiles', 'published', 'catalog',
  145000, ARRAY['wool', 'cotton'], ARRAY['Coastal'], ARRAY['first_flight', 'sourced'],
  NULL, '{"depth": 96, "unit": "in", "width": 120}'::jsonb, 12,
  ARRAY['http://127.0.0.1:54321/storage/v1/object/public/product-images/a0000000-0000-0000-0000-000000000001/4c2b6fed-5877-558e-b4ec-bf24a12a9abc/c164b4af-1db8-5872-ab36-0078c7e94b6b.jpg'],
  NULL, NULL, now() - interval '33124 minutes',
  NULL, NULL,
  (SELECT id FROM public.vendors WHERE lower(name) = lower('Fixture Weavers') LIMIT 1),
  'a0000000-0000-0000-0000-000000000001', now() - interval '33124 minutes'
)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name, slug = EXCLUDED.slug, brand = EXCLUDED.brand,
  description = EXCLUDED.description, category = EXCLUDED.category,
  status = EXCLUDED.status, layer = EXCLUDED.layer,
  price_retail = EXCLUDED.price_retail, materials = EXCLUDED.materials,
  style_tags = EXCLUDED.style_tags, tags = EXCLUDED.tags,
  finish = EXCLUDED.finish, dimensions = EXCLUDED.dimensions,
  lead_time_weeks = EXCLUDED.lead_time_weeks, images = EXCLUDED.images,
  source_url = EXCLUDED.source_url, quality_score = EXCLUDED.quality_score,
  published_at = EXCLUDED.published_at,
  photo_verified_at = EXCLUDED.photo_verified_at,
  shipping_flat_cents = EXCLUDED.shipping_flat_cents,
  vendor_id = EXCLUDED.vendor_id, updated_at = now();
-- hand-authored mapping (First Flight W0 L0.3, 2026-09-02, ruling D2); style=Coastal; materials moved=yes; palette moved=yes
INSERT INTO public.product_style_spectrum (
  product_id, warmth, complexity, formality, timelessness, boldness,
  craftsmanship, source, confidence, assigned_by
) VALUES (
  '4c2b6fed-5877-558e-b4ec-bf24a12a9abc', 0.37, -0.25, -0.47, 0.2, -0.25, 0.2,
  'manual', '{"boldness": 0.7, "complexity": 0.7, "craftsmanship": 0.7, "formality": 0.7, "timelessness": 0.7, "warmth": 0.7}'::jsonb, 'a0000000-0000-0000-0000-000000000001'
)
ON CONFLICT (product_id) DO UPDATE SET
  warmth = EXCLUDED.warmth, complexity = EXCLUDED.complexity,
  formality = EXCLUDED.formality, timelessness = EXCLUDED.timelessness,
  boldness = EXCLUDED.boldness, craftsmanship = EXCLUDED.craftsmanship,
  source = EXCLUDED.source, confidence = EXCLUDED.confidence,
  updated_at = now();

INSERT INTO public.products (
  id, name, slug, brand, description, category, status, layer,
  price_retail, materials, style_tags, tags, finish, dimensions,
  lead_time_weeks, images, source_url, quality_score, published_at,
  photo_verified_at, shipping_flat_cents, vendor_id,
  captured_by, captured_at
) VALUES (
  'bd9b7e9f-6555-5d8f-bc58-a5fd80eddadf', 'Fixture Painted Pine Sideboard', 'ff-fixture-painted-pine-sideboard', 'Fixture Woodshop', 'A fixture row. Painted pine case with unlacquered brass pulls.',
  'storage', 'published', 'catalog',
  260000, ARRAY['pine', 'brass'], ARRAY['Transitional'], ARRAY['first_flight', 'maker_piece'],
  'Hand-painted', '{"depth": 18, "height": 32, "unit": "in", "width": 72}'::jsonb, 8,
  ARRAY['http://127.0.0.1:54321/storage/v1/object/public/product-images/a0000000-0000-0000-0000-000000000001/bd9b7e9f-6555-5d8f-bc58-a5fd80eddadf/12b5e91a-ac1a-5ef3-bece-ed9fa6f3f170.jpg'],
  NULL, NULL, now() - interval '56165 minutes',
  NULL, NULL,
  (SELECT id FROM public.vendors WHERE lower(name) = lower('Fixture Woodshop') LIMIT 1),
  'a0000000-0000-0000-0000-000000000001', now() - interval '56165 minutes'
)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name, slug = EXCLUDED.slug, brand = EXCLUDED.brand,
  description = EXCLUDED.description, category = EXCLUDED.category,
  status = EXCLUDED.status, layer = EXCLUDED.layer,
  price_retail = EXCLUDED.price_retail, materials = EXCLUDED.materials,
  style_tags = EXCLUDED.style_tags, tags = EXCLUDED.tags,
  finish = EXCLUDED.finish, dimensions = EXCLUDED.dimensions,
  lead_time_weeks = EXCLUDED.lead_time_weeks, images = EXCLUDED.images,
  source_url = EXCLUDED.source_url, quality_score = EXCLUDED.quality_score,
  published_at = EXCLUDED.published_at,
  photo_verified_at = EXCLUDED.photo_verified_at,
  shipping_flat_cents = EXCLUDED.shipping_flat_cents,
  vendor_id = EXCLUDED.vendor_id, updated_at = now();
-- hand-authored mapping (First Flight W0 L0.3, 2026-09-02, ruling D2); style=Transitional; materials moved=yes; palette moved=yes
INSERT INTO public.product_style_spectrum (
  product_id, warmth, complexity, formality, timelessness, boldness,
  craftsmanship, source, confidence, assigned_by
) VALUES (
  'bd9b7e9f-6555-5d8f-bc58-a5fd80eddadf', 0.53, 0.0, 0.4, 0.45, -0.1, 0.45,
  'manual', '{"boldness": 0.55, "complexity": 0.7, "craftsmanship": 0.7, "formality": 0.7, "timelessness": 0.7, "warmth": 0.7}'::jsonb, 'a0000000-0000-0000-0000-000000000001'
)
ON CONFLICT (product_id) DO UPDATE SET
  warmth = EXCLUDED.warmth, complexity = EXCLUDED.complexity,
  formality = EXCLUDED.formality, timelessness = EXCLUDED.timelessness,
  boldness = EXCLUDED.boldness, craftsmanship = EXCLUDED.craftsmanship,
  source = EXCLUDED.source, confidence = EXCLUDED.confidence,
  updated_at = now();

-- ─── the refusal, restated as an assertion ───────────────────────────────
-- A publishable row with no spectrum is invisible to get_aesthete_matches.
-- The generator cannot emit one; this catches a hand-edit that removed a
-- spectrum insert but left the product behind.
DO $ff$
DECLARE
  v_missing int;
BEGIN
  SELECT count(*) INTO v_missing
    FROM public.products p
    LEFT JOIN LATERAL public._aesthete_product_spectrum(p.id) sp ON true
   WHERE p.layer = 'catalog' AND p.status = 'published'
     AND 'first_flight' = ANY(p.tags)
     AND sp.spectrums IS NULL;
  IF v_missing > 0 THEN
    RAISE EXCEPTION '% first-flight row(s) have no spectrum and would be invisible', v_missing;
  END IF;
END
$ff$;

