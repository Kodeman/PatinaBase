-- Bring in a Deck — second review fixes (00685, US-15, SQ-377; SQ-375 F1–F3).
--   1. F1 products writes evaluate idx_products_deck_import_source_url as the
--      writer: as authenticated (the product's owner) INSERT with a source_url,
--      UPDATE the source_url, UPDATE only the name; as service_role INSERT, and
--      the embed worker's write (aesthete-embed-worker/lib.ts, aesthete_vector +
--      style_caption) on a row with a source_url. All succeed.
--   2. F2 a Keep teaches the candidate scope's studio: keeper K is in studios A
--      (joined first) and B, designer D is in B only, D's project has no
--      studio_id. K keeps on D's board → the row is B's; match_phash finds it
--      on a B-board import and not on an A-board import.
--   3. F3 a swap by a different user than the keeper removes the old
--      confirmation; a kept same-crop piece in another studio does not keep
--      this studio's row alive, one in the same studio does; the un-teach holds
--      the (studio, crop) advisory lock.
-- Run after a fresh reset (or inside a transaction that applied 00685):
--   psql 'postgresql://postgres:postgres@127.0.0.1:54322/postgres' \
--     -v ON_ERROR_STOP=1 -f supabase/tests/deck_import/review_fixes_2.test.sql

BEGIN;

SET LOCAL statement_timeout = '30s';

CREATE OR REPLACE FUNCTION pg_temp.act_as(p_actor uuid)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', p_actor, 'role', 'authenticated')::text,
    true
  );
  PERFORM set_config('request.jwt.claim.sub', COALESCE(p_actor::text, ''), true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
END;
$$;
GRANT EXECUTE ON FUNCTION pg_temp.act_as(uuid) TO PUBLIC;

-- A 768-d unit vector at angle p_turn from the first axis.
CREATE OR REPLACE FUNCTION pg_temp.unit(p_turn double precision)
RETURNS vector
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT ('[' || cos(p_turn)::text || ',' || sin(p_turn)::text || repeat(',0', 766) || ']')::vector;
$$;
GRANT EXECUTE ON FUNCTION pg_temp.unit(double precision) TO PUBLIC;

-- ── Fixtures ────────────────────────────────────────────────────────────────
-- 01 keeper K: studio A (joined first) and studio B · 02 designer D: studio B

INSERT INTO auth.users (
  id, email, encrypted_password, email_confirmed_at, created_at, updated_at,
  instance_id, aud, role
)
VALUES
  ('d6850000-0000-4000-8000-000000000001', 'rf2-keeper@test.invalid', '', now(), now(), now(),
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('d6850000-0000-4000-8000-000000000002', 'rf2-designer@test.invalid', '', now(), now(), now(),
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');

INSERT INTO public.profiles (id, email, full_name, created_at, updated_at)
VALUES
  ('d6850000-0000-4000-8000-000000000001', 'rf2-keeper@test.invalid', 'Rf2 Keeper', now(), now()),
  ('d6850000-0000-4000-8000-000000000002', 'rf2-designer@test.invalid', 'Rf2 Designer', now(), now())
ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email, full_name = EXCLUDED.full_name;

INSERT INTO public.organizations (id, type, name, slug, status)
VALUES
  ('d6851000-0000-4000-8000-00000000000a', 'design_studio', 'Rf2 Studio A', 'rf2-studio-a-test', 'active'),
  ('d6851000-0000-4000-8000-00000000000b', 'design_studio', 'Rf2 Studio B', 'rf2-studio-b-test', 'active');

INSERT INTO public.organization_members (user_id, organization_id, role, status, joined_at)
VALUES
  ('d6850000-0000-4000-8000-000000000001', 'd6851000-0000-4000-8000-00000000000a', 'owner', 'active', now() - interval '2 days'),
  ('d6850000-0000-4000-8000-000000000002', 'd6851000-0000-4000-8000-00000000000b', 'owner', 'active', now()),
  ('d6850000-0000-4000-8000-000000000001', 'd6851000-0000-4000-8000-00000000000b', 'member', 'active', now() - interval '1 day');

-- D's project has no studio_id (the board's studio comes from D's membership);
-- K's project is studio A's.
INSERT INTO public.projects (id, designer_id, client_id, created_by, name, status, studio_id)
VALUES
  ('d6852000-0000-4000-8000-00000000000b', 'd6850000-0000-4000-8000-000000000002', NULL,
   'd6850000-0000-4000-8000-000000000002', 'Rf2 D project', 'active', NULL),
  ('d6852000-0000-4000-8000-00000000000a', 'd6850000-0000-4000-8000-000000000001', NULL,
   'd6850000-0000-4000-8000-000000000001', 'Rf2 A project', 'active',
   'd6851000-0000-4000-8000-00000000000a');

INSERT INTO public.proposal_boards (
  id, proposal_id, project_id, name, canvas_width, canvas_height,
  background_color, sections, status, sort_order
) VALUES
  ('d6853000-0000-4000-8000-00000000000b', NULL, 'd6852000-0000-4000-8000-00000000000b',
   'Rf2 board B', 1200, 800, '#FAF8F5', '[]'::jsonb, 'active', 0),
  ('d6853000-0000-4000-8000-00000000000a', NULL, 'd6852000-0000-4000-8000-00000000000a',
   'Rf2 board A', 1200, 800, '#FAF8F5', '[]'::jsonb, 'active', 0);

INSERT INTO public.vendors (id, name, website)
VALUES ('d6855000-0000-4000-8000-000000000001', 'Rf2 Maker Co', 'https://www.rf2maker.example');

INSERT INTO public.products (id, name, layer, vendor_id, captured_at, category)
VALUES
  ('d6856000-0000-4000-8000-000000000001', 'Rf2 sofa', 'catalog',
   'd6855000-0000-4000-8000-000000000001', now(), 'seating'),
  ('d6856000-0000-4000-8000-000000000002', 'Rf2 chair', 'catalog',
   'd6855000-0000-4000-8000-000000000001', now(), 'seating');

-- Imports: two on D's board (D's, K's) and one on studio A's board (K's).
INSERT INTO public.board_deck_imports (id, board_id, created_by, source_format, file_sha256, file_name, options, status)
VALUES
  ('d6857000-0000-4000-8000-0000000000b1', 'd6853000-0000-4000-8000-00000000000b',
   'd6850000-0000-4000-8000-000000000002', 'deck', repeat('b1', 32), 'B1.pptx', '{}'::jsonb, 'resolving'),
  ('d6857000-0000-4000-8000-0000000000b2', 'd6853000-0000-4000-8000-00000000000b',
   'd6850000-0000-4000-8000-000000000001', 'deck', repeat('b2', 32), 'B2.pptx', '{}'::jsonb, 'resolving'),
  ('d6857000-0000-4000-8000-0000000000a1', 'd6853000-0000-4000-8000-00000000000a',
   'd6850000-0000-4000-8000-000000000001', 'deck', repeat('a1', 32), 'A1.pptx', '{}'::jsonb, 'resolving');

-- Pieces (found, not yet kept) and their crop signatures.
--   i1 B1 crop aa · i2 B1 crop bb · i3 A1 crop cc · i4 B1 crop cc
--   i5 B1 crop dd · i6 B2 crop dd
INSERT INTO public.board_deck_import_items (id, import_id, element_key, slide_index, role, state)
VALUES
  ('d6858000-0000-4000-8000-000000000001', 'd6857000-0000-4000-8000-0000000000b1', 's1:p1', 0, 'product', 'found'),
  ('d6858000-0000-4000-8000-000000000002', 'd6857000-0000-4000-8000-0000000000b1', 's1:p2', 0, 'product', 'found'),
  ('d6858000-0000-4000-8000-000000000003', 'd6857000-0000-4000-8000-0000000000a1', 's1:p3', 0, 'product', 'found'),
  ('d6858000-0000-4000-8000-000000000004', 'd6857000-0000-4000-8000-0000000000b1', 's1:p4', 0, 'product', 'found'),
  ('d6858000-0000-4000-8000-000000000005', 'd6857000-0000-4000-8000-0000000000b1', 's1:p5', 0, 'product', 'found'),
  ('d6858000-0000-4000-8000-000000000006', 'd6857000-0000-4000-8000-0000000000b2', 's1:p6', 0, 'product', 'found');

-- phash 4294967295 (popcount 32): 00686 never matches a degenerate dHash.
INSERT INTO public.board_deck_import_crop_signatures (item_id, image_hash, phash, vector, model_version)
VALUES
  ('d6858000-0000-4000-8000-000000000001', repeat('aa', 32), 4294967295, pg_temp.unit(0), 'm1'),
  ('d6858000-0000-4000-8000-000000000002', repeat('bb', 32), 4294967295, pg_temp.unit(0.1), 'm1'),
  ('d6858000-0000-4000-8000-000000000003', repeat('cc', 32), 4294967295, pg_temp.unit(0.2), 'm1'),
  ('d6858000-0000-4000-8000-000000000004', repeat('cc', 32), 4294967295, pg_temp.unit(0.2), 'm1'),
  ('d6858000-0000-4000-8000-000000000005', repeat('dd', 32), 4294967295, pg_temp.unit(0.3), 'm1'),
  ('d6858000-0000-4000-8000-000000000006', repeat('dd', 32), 4294967295, pg_temp.unit(0.3), 'm1');

CREATE TEMP TABLE rf2_ctx (k text PRIMARY KEY, v jsonb) ON COMMIT DROP;
GRANT ALL ON rf2_ctx TO PUBLIC;

-- ── 1. F1: product writes as authenticated and as service_role ──────────────
SET LOCAL ROLE authenticated;
SELECT pg_temp.act_as('d6850000-0000-4000-8000-000000000001');
INSERT INTO public.products (id, name, layer, owner_user_id, source_url, captured_at)
VALUES ('d6856000-0000-4000-8000-000000000011', 'Rf2 captured lamp', 'personal',
        'd6850000-0000-4000-8000-000000000001',
        'https://www.Rf2Maker.example/lamp?utm_source=deck', now());
UPDATE public.products SET source_url = 'https://möbel.rf2maker.example/lämp/'
WHERE id = 'd6856000-0000-4000-8000-000000000011';
UPDATE public.products SET name = 'Rf2 captured lamp, renamed'
WHERE id = 'd6856000-0000-4000-8000-000000000011';
INSERT INTO rf2_ctx (k, v)
SELECT 'authenticated', to_jsonb(product.name)
FROM public.products AS product WHERE product.id = 'd6856000-0000-4000-8000-000000000011';
RESET ROLE;

SET LOCAL ROLE service_role;
INSERT INTO public.products (id, name, layer, vendor_id, source_url, captured_at, category)
VALUES ('d6856000-0000-4000-8000-000000000012', 'Rf2 service sofa', 'catalog',
        'd6855000-0000-4000-8000-000000000001',
        'https://www.rf2maker.example/sofa', now(), 'seating');
-- The embed worker's write (aesthete-embed-worker/lib.ts): aesthete_vector has
-- an HNSW index, so this UPDATE is never HOT and re-evaluates the URL index.
UPDATE public.products
SET aesthete_vector = pg_temp.unit(0.4),
    style_caption = 'a low sofa',
    aesthete_vector_at = now(),
    aesthete_model_version = 'm1'
WHERE id = 'd6856000-0000-4000-8000-000000000012';
INSERT INTO rf2_ctx (k, v)
SELECT 'service_role', to_jsonb(product.style_caption)
FROM public.products AS product WHERE product.id = 'd6856000-0000-4000-8000-000000000012';
RESET ROLE;

DO $$
BEGIN
  ASSERT (SELECT v FROM rf2_ctx WHERE k = 'authenticated') = to_jsonb('Rf2 captured lamp, renamed'::text),
    'the owner inserted, re-pointed and renamed a product with a source_url';
  ASSERT (SELECT v FROM rf2_ctx WHERE k = 'service_role') = to_jsonb('a low sofa'::text),
    'service_role inserted a product and wrote its fused vector';
  ASSERT (SELECT public._board_deck_import_normalize_url(source_url) FROM public.products
          WHERE id = 'd6856000-0000-4000-8000-000000000011') LIKE 'https://xn--%',
    'the non-ASCII host went through punycode';
  RAISE NOTICE 'ok 1 F1 product writes as authenticated and service_role';
END $$;

-- ── 2. F2: a Keep teaches the candidate scope's studio ──────────────────────
UPDATE public.board_deck_import_items
SET state = 'kept', chosen_product_id = 'd6856000-0000-4000-8000-000000000001',
    kept_by = 'd6850000-0000-4000-8000-000000000001', kept_at = now()
WHERE id = 'd6858000-0000-4000-8000-000000000001';

SET LOCAL ROLE service_role;
INSERT INTO rf2_ctx (k, v)
SELECT 'phash:' || imp.n,
       COALESCE((
         SELECT jsonb_agg(jsonb_build_array(r.product_id, r.distance, r.source) ORDER BY r.ord)
         FROM public.board_deck_import_match_phash(imp.id, 4294967295, 6, 50)
           WITH ORDINALITY AS r(product_id, distance, layer, source, ord)
       ), '[]'::jsonb)
FROM (VALUES
  ('b', 'd6857000-0000-4000-8000-0000000000b1'::uuid),
  ('a', 'd6857000-0000-4000-8000-0000000000a1'::uuid)
) AS imp(n, id);
RESET ROLE;

DO $$
DECLARE
  v_row public.product_image_vectors%ROWTYPE;
BEGIN
  SELECT * INTO v_row FROM public.product_image_vectors
  WHERE product_id = 'd6856000-0000-4000-8000-000000000001' AND source = 'designer_confirmed';
  ASSERT v_row.studio_id = 'd6851000-0000-4000-8000-00000000000b',
    format('K''s keep on D''s board teaches studio B, not K''s earliest studio A: %s', v_row.studio_id);
  ASSERT v_row.image_hash = repeat('aa', 32) || ':d6851000-0000-4000-8000-00000000000b', v_row.image_hash;
  ASSERT (SELECT v FROM rf2_ctx WHERE k = 'phash:b')
         = '[["d6856000-0000-4000-8000-000000000001", 0, "designer_confirmed"]]'::jsonb,
    format('match_phash on a B-board import finds the taught crop: %s', (SELECT v FROM rf2_ctx WHERE k = 'phash:b'));
  ASSERT (SELECT v FROM rf2_ctx WHERE k = 'phash:a') = '[]'::jsonb,
    format('match_phash on an A-board import finds nothing: %s', (SELECT v FROM rf2_ctx WHERE k = 'phash:a'));
  RAISE NOTICE 'ok 2 F2 keep teaches the board''s scope studio';
END $$;

-- ── 3. F3: un-teach in the same studio, scoped, under the crop lock ─────────
-- i2: D keeps the sofa; K (another user) swaps it to the chair.
UPDATE public.board_deck_import_items
SET state = 'kept', chosen_product_id = 'd6856000-0000-4000-8000-000000000001',
    kept_by = 'd6850000-0000-4000-8000-000000000002', kept_at = now()
WHERE id = 'd6858000-0000-4000-8000-000000000002';
UPDATE public.board_deck_import_items
SET chosen_product_id = 'd6856000-0000-4000-8000-000000000002',
    kept_by = 'd6850000-0000-4000-8000-000000000001', kept_at = now()
WHERE id = 'd6858000-0000-4000-8000-000000000002';

DO $$
DECLARE
  v_hash text := repeat('bb', 32) || ':d6851000-0000-4000-8000-00000000000b';
BEGIN
  ASSERT NOT EXISTS (SELECT 1 FROM public.product_image_vectors
                     WHERE product_id = 'd6856000-0000-4000-8000-000000000001'
                       AND image_hash LIKE repeat('bb', 32) || ':%'),
    'a swap by another user removes the sofa''s confirmation';
  ASSERT EXISTS (SELECT 1 FROM public.product_image_vectors
                 WHERE product_id = 'd6856000-0000-4000-8000-000000000002' AND image_hash = v_hash),
    'the swapped-to chair is taught in studio B';
  ASSERT (SELECT count(*) FROM public.product_image_vectors
          WHERE image_hash LIKE repeat('bb', 32) || ':%') = 1,
    'nothing is taught to the swapper''s other studio';
  ASSERT EXISTS (
      SELECT 1 FROM pg_locks
      WHERE locktype = 'advisory' AND pid = pg_backend_pid() AND objsubid = 1
        AND ((classid::bigint << 32) | objid::bigint)
            = hashtextextended('board_deck_import_teach:' || repeat('bb', 32) || ':d6851000-0000-4000-8000-00000000000b', 0)),
    'the (studio, crop) advisory lock is held for the transaction';
  RAISE NOTICE 'ok 3a F3 swap by another user removes the confirmation, under the crop lock';
END $$;

-- i3 (studio A) and i4 (studio B) both keep the sofa with crop cc; i4 unkeeps.
UPDATE public.board_deck_import_items
SET state = 'kept', chosen_product_id = 'd6856000-0000-4000-8000-000000000001',
    kept_by = 'd6850000-0000-4000-8000-000000000001', kept_at = now()
WHERE id IN ('d6858000-0000-4000-8000-000000000003', 'd6858000-0000-4000-8000-000000000004');
UPDATE public.board_deck_import_items
SET state = 'found', chosen_product_id = NULL, kept_by = NULL, kept_at = NULL
WHERE id = 'd6858000-0000-4000-8000-000000000004';

DO $$
BEGIN
  ASSERT NOT EXISTS (SELECT 1 FROM public.product_image_vectors
                     WHERE image_hash = repeat('cc', 32) || ':d6851000-0000-4000-8000-00000000000b'),
    'studio A''s kept same-crop piece does not keep studio B''s row alive';
  ASSERT EXISTS (SELECT 1 FROM public.product_image_vectors
                 WHERE product_id = 'd6856000-0000-4000-8000-000000000001'
                   AND image_hash = repeat('cc', 32) || ':d6851000-0000-4000-8000-00000000000a'),
    'studio A''s own row stays';
  RAISE NOTICE 'ok 3b F3 another studio''s kept crop does not keep this studio''s row';
END $$;

-- i5 and i6 (two imports on D's board, both studio B) keep the sofa with crop
-- dd: unkeeping one leaves the row, unkeeping both removes it.
UPDATE public.board_deck_import_items
SET state = 'kept', chosen_product_id = 'd6856000-0000-4000-8000-000000000001',
    kept_by = 'd6850000-0000-4000-8000-000000000002', kept_at = now()
WHERE id IN ('d6858000-0000-4000-8000-000000000005', 'd6858000-0000-4000-8000-000000000006');
UPDATE public.board_deck_import_items
SET state = 'found', chosen_product_id = NULL, kept_by = NULL, kept_at = NULL
WHERE id = 'd6858000-0000-4000-8000-000000000005';
INSERT INTO rf2_ctx (k, v)
SELECT 'dd-after-one', to_jsonb(count(*))
FROM public.product_image_vectors
WHERE image_hash = repeat('dd', 32) || ':d6851000-0000-4000-8000-00000000000b';
UPDATE public.board_deck_import_items
SET state = 'found', chosen_product_id = NULL, kept_by = NULL, kept_at = NULL
WHERE id = 'd6858000-0000-4000-8000-000000000006';

DO $$
BEGIN
  ASSERT (SELECT v FROM rf2_ctx WHERE k = 'dd-after-one') = '1'::jsonb,
    'a kept same-crop piece in the same studio keeps the row';
  ASSERT NOT EXISTS (SELECT 1 FROM public.product_image_vectors
                     WHERE image_hash = repeat('dd', 32) || ':d6851000-0000-4000-8000-00000000000b'),
    'the last unkeep in the studio removes it';
  RAISE NOTICE 'ok 3c F3 a same-studio kept crop keeps the row until the last unkeep';
END $$;

ROLLBACK;
