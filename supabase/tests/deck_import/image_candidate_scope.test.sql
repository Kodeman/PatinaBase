-- Bring in a Deck — picture candidates scoped to the board's studio (00684,
-- US-15, SQ-373).
--   A designer in studios A and B imports the same deck twice: onto studio
--   A's board and onto studio B's board.
--   1. onto B's board, board_deck_import_match_image_knn and
--      board_deck_import_match_phash never return studio A's private product,
--      and never rank a catalog product by studio A's designer_confirmed row
--   2. onto A's board, both return them (and never studio B's product)
-- Run after a fresh reset:
--   psql 'postgresql://postgres:postgres@127.0.0.1:54322/postgres' \
--     -v ON_ERROR_STOP=1 -f supabase/tests/deck_import/image_candidate_scope.test.sql

BEGIN;

SET LOCAL statement_timeout = '30s';

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
-- 01 dual designer: active member of studio A (…1) and studio B (…2)

INSERT INTO auth.users (
  id, email, encrypted_password, email_confirmed_at, created_at, updated_at,
  instance_id, aud, role
)
VALUES
  ('d6840000-0000-4000-8000-000000000001', 'ics-dual@test.invalid', '', now(), now(), now(),
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');

INSERT INTO public.profiles (id, email, full_name, created_at, updated_at)
VALUES ('d6840000-0000-4000-8000-000000000001', 'ics-dual@test.invalid', 'Ics Dual', now(), now())
ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email, full_name = EXCLUDED.full_name;

INSERT INTO public.organizations (id, type, name, slug, status)
VALUES
  ('d6841000-0000-4000-8000-000000000001', 'design_studio', 'Ics Studio A', 'ics-studio-a-test', 'active'),
  ('d6841000-0000-4000-8000-000000000002', 'design_studio', 'Ics Studio B', 'ics-studio-b-test', 'active');

INSERT INTO public.organization_members (user_id, organization_id, role, status, joined_at)
VALUES
  ('d6840000-0000-4000-8000-000000000001', 'd6841000-0000-4000-8000-000000000001', 'owner', 'active', now() - interval '1 day'),
  ('d6840000-0000-4000-8000-000000000001', 'd6841000-0000-4000-8000-000000000002', 'member', 'active', now());

INSERT INTO public.projects (id, designer_id, client_id, created_by, name, status, studio_id)
VALUES
  ('d6842000-0000-4000-8000-000000000001', 'd6840000-0000-4000-8000-000000000001', NULL,
   'd6840000-0000-4000-8000-000000000001', 'Ics project A', 'active',
   'd6841000-0000-4000-8000-000000000001'),
  ('d6842000-0000-4000-8000-000000000002', 'd6840000-0000-4000-8000-000000000001', NULL,
   'd6840000-0000-4000-8000-000000000001', 'Ics project B', 'active',
   'd6841000-0000-4000-8000-000000000002');

INSERT INTO public.proposal_boards (
  id, proposal_id, project_id, name, canvas_width, canvas_height,
  background_color, sections, status, sort_order
) VALUES
  ('d6843000-0000-4000-8000-000000000001', NULL, 'd6842000-0000-4000-8000-000000000001',
   'Ics board A', 1200, 800, '#FAF8F5', '[]'::jsonb, 'active', 0),
  ('d6843000-0000-4000-8000-000000000002', NULL, 'd6842000-0000-4000-8000-000000000002',
   'Ics board B', 1200, 800, '#FAF8F5', '[]'::jsonb, 'active', 0);

INSERT INTO public.vendors (id, name, website)
VALUES ('d6845000-0000-4000-8000-000000000001', 'Ics Maker Co', 'https://www.icsmaker.example');

INSERT INTO public.products (
  id, name, layer, owner_user_id, studio_id, vendor_id, captured_at, category
) VALUES
  ('d6846000-0000-4000-8000-000000000001', 'Ics catalog sofa', 'catalog', NULL, NULL,
   'd6845000-0000-4000-8000-000000000001', now(), 'seating');

INSERT INTO public.products (
  id, name, layer, studio_id, vendor_id, captured_at,
  vendor_contact, lead_time_weeks, payment_terms, category, usage_notes
) VALUES
  ('d6846000-0000-4000-8000-00000000000a', 'Ics studio A bench', 'studio',
   'd6841000-0000-4000-8000-000000000001', 'd6845000-0000-4000-8000-000000000001', now(),
   '{}'::jsonb, 4, 'fifty_fifty', 'seating', 'test'),
  ('d6846000-0000-4000-8000-00000000000b', 'Ics studio B bench', 'studio',
   'd6841000-0000-4000-8000-000000000002', 'd6845000-0000-4000-8000-000000000001', now(),
   '{}'::jsonb, 4, 'fifty_fifty', 'seating', 'test');

-- Query: unit(0), phash Q = 4294967295 (popcount 32; 00686 never matches a
-- degenerate dHash). Q # 1 = 4294967294 is 1 bit away, Q # 3 = 4294967292 is
-- 2 bits away.
INSERT INTO public.product_image_vectors (
  product_id, image_hash, vector, phash, model_version, source, studio_id, created_by
) VALUES
  -- studio A's private bench: its own picture, near and 1 bit away
  ('d6846000-0000-4000-8000-00000000000a', repeat('a1', 32), pg_temp.unit(0.010), 4294967294,
   'm1', 'product_image', NULL, NULL),
  -- the catalog sofa: its own picture is far and has no hash …
  ('d6846000-0000-4000-8000-000000000001', repeat('c1', 32), pg_temp.unit(0.500), NULL,
   'm1', 'product_image', NULL, NULL),
  -- … and studio A taught it a crop: nearest of all, 2 bits away
  ('d6846000-0000-4000-8000-000000000001', repeat('c2', 32) || ':d6841000-0000-4000-8000-000000000001',
   pg_temp.unit(0.001), 4294967292, 'm1', 'designer_confirmed', 'd6841000-0000-4000-8000-000000000001',
   'd6840000-0000-4000-8000-000000000001'),
  -- studio B's private bench: exact hash
  ('d6846000-0000-4000-8000-00000000000b', repeat('b1', 32), pg_temp.unit(0.020), 4294967295,
   'm1', 'product_image', NULL, NULL);

INSERT INTO public.board_deck_imports (id, board_id, created_by, source_format, file_sha256, file_name, options, status)
VALUES
  ('d6847000-0000-4000-8000-00000000000a', 'd6843000-0000-4000-8000-000000000001',
   'd6840000-0000-4000-8000-000000000001', 'deck', repeat('ea', 32), 'OntoA.pptx',
   '{"photo_match": true}'::jsonb, 'resolving'),
  ('d6847000-0000-4000-8000-00000000000b', 'd6843000-0000-4000-8000-000000000002',
   'd6840000-0000-4000-8000-000000000001', 'deck', repeat('eb', 32), 'OntoB.pptx',
   '{"photo_match": true}'::jsonb, 'resolving');

CREATE TEMP TABLE ics_ctx (k text PRIMARY KEY, v jsonb) ON COMMIT DROP;
GRANT ALL ON ics_ctx TO PUBLIC;

-- The resolver calls both twins with the service role.
SET LOCAL ROLE service_role;
INSERT INTO ics_ctx (k, v)
SELECT 'knn:' || imp.n,
       COALESCE((
         SELECT jsonb_agg(jsonb_build_array(r.product_id, r.rank, r.source) ORDER BY r.ord)
         FROM public.board_deck_import_match_image_knn(imp.id, pg_temp.unit(0), 200, NULL)
           WITH ORDINALITY AS r(product_id, rank, layer, source, ord)
       ), '[]'::jsonb)
FROM (VALUES
  ('a', 'd6847000-0000-4000-8000-00000000000a'::uuid),
  ('b', 'd6847000-0000-4000-8000-00000000000b'::uuid)
) AS imp(n, id);
INSERT INTO ics_ctx (k, v)
SELECT 'phash:' || imp.n,
       COALESCE((
         SELECT jsonb_agg(jsonb_build_array(r.product_id, r.distance, r.source) ORDER BY r.ord)
         FROM public.board_deck_import_match_phash(imp.id, 4294967295, 6, 50)
           WITH ORDINALITY AS r(product_id, distance, layer, source, ord)
       ), '[]'::jsonb)
FROM (VALUES
  ('a', 'd6847000-0000-4000-8000-00000000000a'::uuid),
  ('b', 'd6847000-0000-4000-8000-00000000000b'::uuid)
) AS imp(n, id);
RESET ROLE;

-- ── 1. Onto studio B's board: nothing of studio A's ─────────────────────────
DO $$
DECLARE
  v_knn jsonb := (SELECT v FROM ics_ctx WHERE k = 'knn:b');
  v_phash jsonb := (SELECT v FROM ics_ctx WHERE k = 'phash:b');
BEGIN
  ASSERT v_knn = jsonb_build_array(
      jsonb_build_array('d6846000-0000-4000-8000-00000000000b',
                        (1 - (pg_temp.unit(0.020) <=> pg_temp.unit(0)))::real, 'product_image'),
      jsonb_build_array('d6846000-0000-4000-8000-000000000001',
                        (1 - (pg_temp.unit(0.500) <=> pg_temp.unit(0)))::real, 'product_image')),
    format('image kNN onto B: studio B''s bench, then the catalog sofa by its own picture only: %s', v_knn);
  ASSERT v_knn::text NOT LIKE '%d6846000-0000-4000-8000-00000000000a%',
    'image kNN onto B never offers studio A''s private bench';
  ASSERT v_knn::text NOT LIKE '%designer_confirmed%',
    'image kNN onto B never ranks by studio A''s designer_confirmed row';

  ASSERT v_phash = '[["d6846000-0000-4000-8000-00000000000b", 0, "product_image"]]'::jsonb,
    format('pHash onto B: studio B''s bench only: %s', v_phash);
  RAISE NOTICE 'ok 1 onto studio B''s board: no studio A product, no studio A taught row';
END $$;

-- ── 2. Onto studio A's board: studio A's rows come back ─────────────────────
DO $$
DECLARE
  v_knn jsonb := (SELECT v FROM ics_ctx WHERE k = 'knn:a');
  v_phash jsonb := (SELECT v FROM ics_ctx WHERE k = 'phash:a');
BEGIN
  ASSERT v_knn = jsonb_build_array(
      jsonb_build_array('d6846000-0000-4000-8000-000000000001',
                        (1 - (pg_temp.unit(0.001) <=> pg_temp.unit(0)))::real, 'designer_confirmed'),
      jsonb_build_array('d6846000-0000-4000-8000-00000000000a',
                        (1 - (pg_temp.unit(0.010) <=> pg_temp.unit(0)))::real, 'product_image')),
    format('image kNN onto A: studio A''s taught sofa crop, then its bench; never B''s: %s', v_knn);

  ASSERT v_phash = '[["d6846000-0000-4000-8000-00000000000a", 1, "product_image"],
                     ["d6846000-0000-4000-8000-000000000001", 2, "designer_confirmed"]]'::jsonb,
    format('pHash onto A: studio A''s bench and taught sofa crop; never B''s exact hash: %s', v_phash);
  RAISE NOTICE 'ok 2 onto studio A''s board: studio A product and taught row returned';
END $$;

ROLLBACK;
