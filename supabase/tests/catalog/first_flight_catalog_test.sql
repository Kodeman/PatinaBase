-- ═══════════════════════════════════════════════════════════════════════════
-- First Flight catalogue tests (W0 · L0.3, ruling D2)
--
-- Asserts the catalogue row contract PROGRAM.md §3 W0 L0.3 defines, against a
-- locally seeded stack:
--
--   1. publishable  >= :min_publishable
--   2. imageless    =  0
--   3. makerless    =  0, and no row resolves to the 'Unknown Maker' literal
--   4. categories   =  6, every value one of ProductCategory's raw values
--   5. new_this_week >= 3
--   6. every publishable first-flight row has a non-null spectrum
--   7. published_at and quality-tier inputs are present (A3-22)
--
-- SCOPE. Assertions are scoped to rows tagged 'first_flight' — the rows this
-- lane's pipeline produced. The local stack also carries pre-existing dev-seed
-- catalogue rows that belong to other fixtures (the cf13… phase-one pair, the
-- bff0… "unmapped" pair, and three seed rows with no vendor), and they are not
-- this lane's to change. Case 8 REPORTS the same five numbers unscoped, so the
-- whole-stack picture is visible without failing the gate on other people's
-- fixtures. On production the two sets are the same set.
--
-- Two of the charter's own queries do not execute as written and are corrected
-- here:
--   • `images = '[]'::jsonb` — products.images is text[] (00001:38), so the
--     imageless test is coalesce(array_length(images,1),0) = 0.
--   • `count(*) filter (where _aesthete_product_spectrum(p.id) is not null)` —
--     the function is set-returning, and FILTER rejects it ("set-returning
--     functions are not allowed in FILTER"). It must be a LEFT JOIN LATERAL.
--
-- THE ROW-COUNT FLOOR. `min_publishable` defaults to 6 — the size of the
-- fixture catalogue `supabase/seed/catalog/first-flight-catalog.sql` seeds on
-- every `pnpm supabase:reset`, so `scripts/run-sql-tests.sh` passes on a fresh
-- local stack. **Round one's real bar is 30**, and that is asserted where it
-- belongs: on production, by
--   -v min_publishable=30
-- in the Kody-run acceptance step. Every other assertion in this file is
-- absolute and does not move with the count.
--
-- How to run:
--   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" \
--     -X -q -v ON_ERROR_STOP=1 \
--     -f supabase/tests/catalog/first_flight_catalog_test.sql
--   # production acceptance, Kody-run:
--   #   … -v min_publishable=30 …
--
-- Wrapped in one transaction and ROLLBACKed, so it can be re-run with no side
-- effects. Nothing here writes; the ROLLBACK is house style, not a safety net.
-- ═══════════════════════════════════════════════════════════════════════════

\if :{?min_publishable}
\else
\set min_publishable 6
\endif

BEGIN;

-- psql does NOT interpolate :variables inside a dollar-quoted body, so the
-- floor is handed to the DO block through a GUC instead.
\o /dev/null
SELECT set_config('first_flight.min_publishable', :'min_publishable', true);
\o

-- ─── assertions ────────────────────────────────────────────────────────────

DO $$
DECLARE
  v_min             int := current_setting('first_flight.min_publishable')::int;
  v_publishable     int;
  v_imageless       int;
  v_makerless       int;
  v_unknown_maker   int;
  v_categories      int;
  v_bad_categories  text[];
  v_new_this_week   int;
  v_no_spectrum     int;
  v_no_published_at int;
  v_no_quality      int;
  v_makers          int;
  v_hot_link        int;
  v_categories_ok CONSTANT text[] :=
    ARRAY['seating','tables','lighting','storage','decor','textiles'];
BEGIN
  -- Case 1: the shelf is not empty.
  SELECT count(*) INTO v_publishable
    FROM public.products p
   WHERE p.layer = 'catalog' AND p.status = 'published'
     AND 'first_flight' = ANY(p.tags);
  ASSERT v_publishable >= v_min,
    format('FAIL 1: %s publishable first-flight rows, want >= %s', v_publishable, v_min);

  -- Case 2: every row has a photograph. A missing image renders as a flat
  -- colour block (A-36 / C-27 / B-18).
  SELECT count(*) INTO v_imageless
    FROM public.products p
   WHERE p.layer = 'catalog' AND p.status = 'published'
     AND 'first_flight' = ANY(p.tags)
     AND COALESCE(array_length(p.images, 1), 0) = 0;
  ASSERT v_imageless = 0,
    format('FAIL 2: %s first-flight row(s) carry no image', v_imageless);

  -- Case 3: every row has a maker, and none of them reads 'Unknown Maker' —
  -- get_recommendations COALESCEs to that literal and
  -- Product.resolvedMakerName then drops the row client-side.
  SELECT count(*) INTO v_makerless
    FROM public.products p
   WHERE p.layer = 'catalog' AND p.status = 'published'
     AND 'first_flight' = ANY(p.tags)
     AND p.vendor_id IS NULL;
  ASSERT v_makerless = 0,
    format('FAIL 3a: %s first-flight row(s) have no vendor_id', v_makerless);

  SELECT count(*) INTO v_unknown_maker
    FROM public.products p
    LEFT JOIN public.vendors v ON v.id = p.vendor_id
   WHERE p.layer = 'catalog' AND p.status = 'published'
     AND 'first_flight' = ANY(p.tags)
     AND COALESCE(v.name, 'Unknown Maker') = 'Unknown Maker';
  ASSERT v_unknown_maker = 0,
    format('FAIL 3b: %s first-flight row(s) resolve to Unknown Maker', v_unknown_maker);

  SELECT count(DISTINCT p.vendor_id) INTO v_makers
    FROM public.products p
   WHERE p.layer = 'catalog' AND p.status = 'published'
     AND 'first_flight' = ANY(p.tags);
  ASSERT v_makers >= 3,
    format('FAIL 3c: %s distinct maker(s), want >= 3', v_makers);

  -- Case 4: all six categories, and every stored value is one of the enum's
  -- raw values. ProductCategory(normalizing:) lands anything it does not know
  -- on .decor, so a wrong vocabulary is silent rather than loud (A3-21).
  SELECT count(DISTINCT p.category) INTO v_categories
    FROM public.products p
   WHERE p.layer = 'catalog' AND p.status = 'published'
     AND 'first_flight' = ANY(p.tags);
  ASSERT v_categories = 6,
    format('FAIL 4a: %s distinct categories, want 6', v_categories);

  SELECT array_agg(DISTINCT p.category) INTO v_bad_categories
    FROM public.products p
   WHERE p.layer = 'catalog' AND p.status = 'published'
     AND 'first_flight' = ANY(p.tags)
     AND NOT (p.category = ANY(v_categories_ok));
  ASSERT v_bad_categories IS NULL,
    format('FAIL 4b: categories outside ProductCategory: %s', v_bad_categories);

  -- Case 5: NEW THIS WEEK needs at least three rows or it does not render.
  SELECT count(*) INTO v_new_this_week
    FROM public.products p
   WHERE p.layer = 'catalog' AND p.status = 'published'
     AND 'first_flight' = ANY(p.tags)
     AND p.published_at > now() - interval '7 days';
  ASSERT v_new_this_week >= 3,
    format('FAIL 5: %s row(s) published inside 7 days, want >= 3', v_new_this_week);

  -- Case 6: THE decisive one. With no spectrum the anon caller's v_query is
  -- NULL, the ANN insert is skipped, the spectrum-only fallback requires
  -- b.pspec IS NOT NULL, _ae_cand is empty and get_recommendations returns
  -- zero rows however many products are published (A4-02).
  SELECT count(*) INTO v_no_spectrum
    FROM public.products p
    LEFT JOIN LATERAL public._aesthete_product_spectrum(p.id) sp ON true
   WHERE p.layer = 'catalog' AND p.status = 'published'
     AND 'first_flight' = ANY(p.tags)
     AND sp.spectrums IS NULL;
  ASSERT v_no_spectrum = 0,
    format('FAIL 6: %s publishable first-flight row(s) have no spectrum and are '
           'therefore invisible to the matcher', v_no_spectrum);

  -- Case 7: published_at and quality_score drive the tier CASE; a NULL
  -- published_at makes every piece render as 'new' (A3-22). quality_score is
  -- allowed to be NULL — the tier CASE reads COALESCE(quality_score, 0) — but
  -- published_at is not.
  SELECT count(*) INTO v_no_published_at
    FROM public.products p
   WHERE p.layer = 'catalog' AND p.status = 'published'
     AND 'first_flight' = ANY(p.tags)
     AND p.published_at IS NULL;
  ASSERT v_no_published_at = 0,
    format('FAIL 7a: %s first-flight row(s) have a NULL published_at, so every '
           'piece renders as new', v_no_published_at);

  SELECT count(*) INTO v_no_quality
    FROM public.products p
   WHERE p.layer = 'catalog' AND p.status = 'published'
     AND 'first_flight' = ANY(p.tags)
     AND COALESCE(p.quality_score, 0) >= 80;
  ASSERT v_no_quality <= GREATEST(1, v_publishable / 3),
    format('FAIL 7b: %s of %s first-flight rows are designer_selection tier; a '
           'selection that is most of the shelf is decoration',
           v_no_quality, v_publishable);

  -- Case 8: no image points at a third-party CDN. A3-25 records 14 dev-capture
  -- rows hot-linking images.hermanmiller.group and www.masayaco.com; nothing
  -- promoted to catalog may do the same.
  SELECT count(*) INTO v_hot_link
    FROM public.products p
   WHERE p.layer = 'catalog' AND p.status = 'published'
     AND 'first_flight' = ANY(p.tags)
     AND EXISTS (
       SELECT 1 FROM unnest(p.images) img
        WHERE img NOT LIKE '%/storage/v1/object/public/product-images/%');
  ASSERT v_hot_link = 0,
    format('FAIL 8: %s first-flight row(s) carry an image outside the '
           'product-images bucket', v_hot_link);

  RAISE NOTICE 'first-flight catalogue: publishable=% imageless=% makerless=% categories=% new_this_week=% makers=% without_spectrum=%',
    v_publishable, v_imageless, v_makerless, v_categories, v_new_this_week,
    v_makers, v_no_spectrum;
END $$;

-- ─── the whole-stack picture, reported and not asserted ────────────────────
-- On production these numbers are the scoped ones. Locally they also count the
-- pre-existing dev-seed catalogue rows other lanes' fixtures depend on, so
-- they are printed rather than gated.

DO $$
DECLARE
  v_publishable   int;
  v_imageless     int;
  v_makerless     int;
  v_categories    int;
  v_new_this_week int;
  v_no_spectrum   int;
BEGIN
  SELECT count(*) FILTER (WHERE p.layer='catalog' AND p.status='published'),
         count(*) FILTER (WHERE p.layer='catalog' AND p.status='published'
                            AND COALESCE(array_length(p.images,1),0) = 0),
         count(*) FILTER (WHERE p.layer='catalog' AND p.status='published'
                            AND p.vendor_id IS NULL),
         count(DISTINCT p.category) FILTER (WHERE p.layer='catalog' AND p.status='published'),
         count(*) FILTER (WHERE p.layer='catalog' AND p.status='published'
                            AND p.published_at > now() - interval '7 days')
    INTO v_publishable, v_imageless, v_makerless, v_categories, v_new_this_week
    FROM public.products p;

  SELECT count(*) INTO v_no_spectrum
    FROM public.products p
    LEFT JOIN LATERAL public._aesthete_product_spectrum(p.id) sp ON true
   WHERE p.layer = 'catalog' AND p.status = 'published'
     AND sp.spectrums IS NULL;

  RAISE NOTICE 'whole stack (reported, not asserted): publishable=% imageless=% makerless=% categories=% new_this_week=% without_spectrum=%',
    v_publishable, v_imageless, v_makerless, v_categories, v_new_this_week,
    v_no_spectrum;
END $$;

ROLLBACK;
