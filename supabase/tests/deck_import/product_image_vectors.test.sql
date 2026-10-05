-- Bring in a Deck — precision (00681, US-15 W5, SQ-363).
--   1. RLS: product_image_vectors reads only where the product is visible
--      and the row's studio (if any) is the reader's
--   2. parity: board_deck_import_match_image_knn and
--      board_deck_import_match_phash return EXACTLY what the RLS read returns
--      under each importer's own JWT (3 importers, each onto a board of
--      their only studio; with and without category)
--   3. replace_product_image_vectors: replaces a product's picture rows for a
--      model, drops older models, never touches designer_confirmed rows
--   4. store_board_deck_import_crop_signature: lease-guarded
--   5. Keep teaches (designer_confirmed, board's studio); swap suppresses the
--      old product on the item and untaches it; unkeep untaches
--   6. grants: twins, replace and store are service_role only; the table is
--      SELECT-only for authenticated; signatures are service only
-- Run after a fresh reset:
--   psql 'postgresql://postgres:postgres@127.0.0.1:54322/postgres' \
--     -v ON_ERROR_STOP=1 -f supabase/tests/deck_import/product_image_vectors.test.sql

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
-- 01 lead (studio A) · 02 co-member (studio A) · 03 foreign (studio B)

INSERT INTO auth.users (
  id, email, encrypted_password, email_confirmed_at, created_at, updated_at,
  instance_id, aud, role
)
VALUES
  ('d6810000-0000-4000-8000-000000000001', 'piv-lead@test.invalid', '', now(), now(), now(),
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('d6810000-0000-4000-8000-000000000002', 'piv-other@test.invalid', '', now(), now(), now(),
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('d6810000-0000-4000-8000-000000000003', 'piv-foreign@test.invalid', '', now(), now(), now(),
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');

INSERT INTO public.profiles (id, email, full_name, created_at, updated_at)
VALUES
  ('d6810000-0000-4000-8000-000000000001', 'piv-lead@test.invalid', 'Piv Lead', now(), now()),
  ('d6810000-0000-4000-8000-000000000002', 'piv-other@test.invalid', 'Piv Other', now(), now()),
  ('d6810000-0000-4000-8000-000000000003', 'piv-foreign@test.invalid', 'Piv Foreign', now(), now())
ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email, full_name = EXCLUDED.full_name;

INSERT INTO public.organizations (id, type, name, slug, status)
VALUES
  ('d6811000-0000-4000-8000-000000000001', 'design_studio', 'Piv Studio', 'piv-studio-test', 'active'),
  ('d6811000-0000-4000-8000-000000000002', 'design_studio', 'Piv Foreign', 'piv-foreign-test', 'active');

INSERT INTO public.organization_members (user_id, organization_id, role, status, joined_at)
VALUES
  ('d6810000-0000-4000-8000-000000000001', 'd6811000-0000-4000-8000-000000000001', 'owner', 'active', now()),
  ('d6810000-0000-4000-8000-000000000002', 'd6811000-0000-4000-8000-000000000001', 'member', 'active', now()),
  ('d6810000-0000-4000-8000-000000000003', 'd6811000-0000-4000-8000-000000000002', 'owner', 'active', now());

-- Since 00684 the twins offer studio products and studio rows of the BOARD's
-- studio only, so each importer imports onto a board of their own studio (the
-- foreign designer onto studio B's board); a two-studio importer is covered by
-- image_candidate_scope.test.sql.
INSERT INTO public.projects (id, designer_id, client_id, created_by, name, status, studio_id)
VALUES ('d6812000-0000-4000-8000-000000000001', 'd6810000-0000-4000-8000-000000000001', NULL,
        'd6810000-0000-4000-8000-000000000001', 'Piv project', 'active',
        'd6811000-0000-4000-8000-000000000001'),
       ('d6812000-0000-4000-8000-000000000002', 'd6810000-0000-4000-8000-000000000003', NULL,
        'd6810000-0000-4000-8000-000000000003', 'Piv foreign project', 'active',
        'd6811000-0000-4000-8000-000000000002');

INSERT INTO public.proposal_boards (
  id, proposal_id, project_id, name, canvas_width, canvas_height,
  background_color, sections, status, sort_order
) VALUES
  ('d6813000-0000-4000-8000-000000000001', NULL, 'd6812000-0000-4000-8000-000000000001',
   'Piv board', 1200, 800, '#FAF8F5', '[]'::jsonb, 'active', 0),
  ('d6813000-0000-4000-8000-000000000002', NULL, 'd6812000-0000-4000-8000-000000000002',
   'Piv foreign board', 1200, 800, '#FAF8F5', '[]'::jsonb, 'active', 0);

SET LOCAL session_replication_role = replica;
INSERT INTO public.proposal_board_items (
  id, board_id, type, x, y, width, height, z_index, rotation, content, data, image_url
) VALUES
  ('d6814000-0000-4000-8000-000000000001', 'd6813000-0000-4000-8000-000000000001',
   'image', 10, 10, 200, 200, 0, 0, NULL, '{}'::jsonb,
   'https://example.supabase.co/storage/v1/object/public/proposal-mood-boards/x/boards/y/piv1.webp');
SET LOCAL session_replication_role = origin;

INSERT INTO public.vendors (id, name, website)
VALUES ('d6815000-0000-4000-8000-000000000001', 'Piv Maker Co', 'https://www.pivmaker.example');

INSERT INTO public.products (
  id, name, layer, owner_user_id, studio_id, vendor_id, captured_at, category, deleted_at, merged_into_id
) VALUES
  ('d6816000-0000-4000-8000-000000000001', 'Piv catalog sofa', 'catalog', NULL, NULL,
   'd6815000-0000-4000-8000-000000000001', now(), 'seating', NULL, NULL),
  ('d6816000-0000-4000-8000-000000000002', 'Piv catalog lamp', 'catalog', NULL, NULL,
   'd6815000-0000-4000-8000-000000000001', now(), 'lighting', NULL, NULL),
  ('d6816000-0000-4000-8000-000000000003', 'Piv lead personal chair', 'personal',
   'd6810000-0000-4000-8000-000000000001', NULL,
   'd6815000-0000-4000-8000-000000000001', now(), 'seating', NULL, NULL),
  ('d6816000-0000-4000-8000-000000000004', 'Piv other personal chair', 'personal',
   'd6810000-0000-4000-8000-000000000002', NULL,
   'd6815000-0000-4000-8000-000000000001', now(), 'seating', NULL, NULL),
  ('d6816000-0000-4000-8000-000000000006', 'Piv deleted sofa', 'catalog', NULL, NULL,
   'd6815000-0000-4000-8000-000000000001', now(), 'seating', now(), NULL),
  ('d6816000-0000-4000-8000-000000000007', 'Piv merged sofa', 'catalog', NULL, NULL,
   'd6815000-0000-4000-8000-000000000001', now(), 'seating', NULL,
   'd6816000-0000-4000-8000-000000000001');

INSERT INTO public.products (
  id, name, layer, studio_id, vendor_id, captured_at,
  vendor_contact, lead_time_weeks, payment_terms, category, usage_notes
) VALUES
  ('d6816000-0000-4000-8000-000000000009', 'Piv studio bench', 'studio',
   'd6811000-0000-4000-8000-000000000001', 'd6815000-0000-4000-8000-000000000001', now(),
   '{}'::jsonb, 4, 'fifty_fifty', 'seating', 'test'),
  ('d6816000-0000-4000-8000-00000000000a', 'Piv foreign bench', 'studio',
   'd6811000-0000-4000-8000-000000000002', 'd6815000-0000-4000-8000-000000000001', now(),
   '{}'::jsonb, 4, 'fifty_fifty', 'seating', 'test');

-- Picture rows. phash values: 0 is the query; 7 differs by 3 bits; -1 by 64.
INSERT INTO public.product_image_vectors (
  product_id, image_hash, vector, phash, model_version, source, studio_id, created_by
) VALUES
  -- catalog sofa: two pictures (the nearer one wins) + a foreign studio's taught crop
  ('d6816000-0000-4000-8000-000000000001', repeat('a1', 32), pg_temp.unit(0.010), NULL, 'm1', 'product_image', NULL, NULL),
  ('d6816000-0000-4000-8000-000000000001', repeat('a2', 32), pg_temp.unit(0.300), NULL, 'm1', 'product_image', NULL, NULL),
  ('d6816000-0000-4000-8000-000000000001', repeat('a3', 32) || ':d6811000-0000-4000-8000-000000000002',
   pg_temp.unit(0.0001), 7, 'm1', 'designer_confirmed', 'd6811000-0000-4000-8000-000000000002',
   'd6810000-0000-4000-8000-000000000003'),
  ('d6816000-0000-4000-8000-000000000002', repeat('b1', 32), pg_temp.unit(0.020), NULL, 'm1', 'product_image', NULL, NULL),
  ('d6816000-0000-4000-8000-000000000003', repeat('c1', 32), pg_temp.unit(0.030), NULL, 'm1', 'product_image', NULL, NULL),
  ('d6816000-0000-4000-8000-000000000004', repeat('d1', 32), pg_temp.unit(0.005), NULL, 'm1', 'product_image', NULL, NULL),
  ('d6816000-0000-4000-8000-000000000006', repeat('e1', 32), pg_temp.unit(0.001), 0, 'm1', 'product_image', NULL, NULL),
  ('d6816000-0000-4000-8000-000000000007', repeat('f1', 32), pg_temp.unit(0.002), 0, 'm1', 'product_image', NULL, NULL),
  -- studio A's taught crop on its bench (studio A only)
  ('d6816000-0000-4000-8000-000000000009', repeat('91', 32) || ':d6811000-0000-4000-8000-000000000001',
   pg_temp.unit(0.040), 7, 'm1', 'designer_confirmed', 'd6811000-0000-4000-8000-000000000001',
   'd6810000-0000-4000-8000-000000000001'),
  ('d6816000-0000-4000-8000-00000000000a', repeat('0a', 32), pg_temp.unit(0.003), -1, 'm1', 'product_image', NULL, NULL);

INSERT INTO public.board_deck_imports (id, board_id, created_by, source_format, file_sha256, file_name, options, status)
VALUES
  ('d6817000-0000-4000-8000-000000000001', 'd6813000-0000-4000-8000-000000000001',
   'd6810000-0000-4000-8000-000000000001', 'deck', repeat('e1', 32), 'Lead.pptx',
   '{"photo_match": true}'::jsonb, 'resolving'),
  ('d6817000-0000-4000-8000-000000000002', 'd6813000-0000-4000-8000-000000000001',
   'd6810000-0000-4000-8000-000000000002', 'deck', repeat('e2', 32), 'Other.pptx',
   '{}'::jsonb, 'resolving'),
  ('d6817000-0000-4000-8000-000000000003', 'd6813000-0000-4000-8000-000000000002',
   'd6810000-0000-4000-8000-000000000003', 'deck', repeat('e3', 32), 'Foreign.pptx',
   '{}'::jsonb, 'resolving');

CREATE TEMP TABLE piv_ctx (k text PRIMARY KEY, v jsonb) ON COMMIT DROP;
GRANT ALL ON piv_ctx TO PUBLIC;

-- ── 1+2. RLS reads and twin parity ──────────────────────────────────────────
SET LOCAL ROLE service_role;
INSERT INTO piv_ctx (k, v)
SELECT 'twin:' || imp.n || ':' || COALESCE(cat.c, '*'),
       COALESCE((
         SELECT jsonb_agg(jsonb_build_array(r.product_id, r.rank) ORDER BY r.ord)
         FROM public.board_deck_import_match_image_knn(imp.id, pg_temp.unit(0), 200, cat.c)
           WITH ORDINALITY AS r(product_id, rank, layer, source, ord)
       ), '[]'::jsonb)
FROM (VALUES
  ('lead', 'd6817000-0000-4000-8000-000000000001'::uuid),
  ('other', 'd6817000-0000-4000-8000-000000000002'::uuid),
  ('foreign', 'd6817000-0000-4000-8000-000000000003'::uuid)
) AS imp(n, id)
CROSS JOIN (VALUES (NULL::text), ('seating')) AS cat(c);
INSERT INTO piv_ctx (k, v)
SELECT 'twin:' || imp.n || ':phash',
       COALESCE((
         SELECT jsonb_agg(jsonb_build_array(r.product_id, r.distance) ORDER BY r.ord)
         FROM public.board_deck_import_match_phash(imp.id, 0, 6, 50)
           WITH ORDINALITY AS r(product_id, distance, layer, source, ord)
       ), '[]'::jsonb)
FROM (VALUES
  ('lead', 'd6817000-0000-4000-8000-000000000001'::uuid),
  ('other', 'd6817000-0000-4000-8000-000000000002'::uuid),
  ('foreign', 'd6817000-0000-4000-8000-000000000003'::uuid)
) AS imp(n, id);
RESET ROLE;

-- The same reads under each importer's JWT: RLS on products and on
-- product_image_vectors decides; only the deleted/merged/category filters
-- are spelled out.
CREATE OR REPLACE FUNCTION pg_temp.read_as(p_name text, p_user uuid)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM pg_temp.act_as(p_user);
  INSERT INTO piv_ctx (k, v)
  SELECT 'rls:' || p_name || ':' || COALESCE(cat.c, '*'),
         COALESCE((
           SELECT jsonb_agg(jsonb_build_array(best.product_id, best.similarity)
                            ORDER BY best.similarity DESC, best.product_id)
           FROM (
             SELECT picture.product_id, max((1 - (picture.vector <=> pg_temp.unit(0)))::real) AS similarity
             FROM public.product_image_vectors AS picture
             JOIN public.products AS product ON product.id = picture.product_id
             WHERE product.deleted_at IS NULL AND product.merged_into_id IS NULL
               AND (cat.c IS NULL OR product.category = cat.c)
             GROUP BY picture.product_id
           ) AS best
         ), '[]'::jsonb)
  FROM (VALUES (NULL::text), ('seating')) AS cat(c);
  INSERT INTO piv_ctx (k, v)
  SELECT 'rls:' || p_name || ':phash',
         COALESCE((
           SELECT jsonb_agg(jsonb_build_array(best.product_id, best.distance)
                            ORDER BY best.distance, best.product_id)
           FROM (
             SELECT picture.product_id, min(bit_count((picture.phash # 0::bigint)::bit(64)))::integer AS distance
             FROM public.product_image_vectors AS picture
             JOIN public.products AS product ON product.id = picture.product_id
             WHERE picture.phash IS NOT NULL
               AND product.deleted_at IS NULL AND product.merged_into_id IS NULL
             GROUP BY picture.product_id
             HAVING min(bit_count((picture.phash # 0::bigint)::bit(64))) <= 6
           ) AS best
         ), '[]'::jsonb);
END;
$$;
GRANT EXECUTE ON FUNCTION pg_temp.read_as(text, uuid) TO PUBLIC;

SET LOCAL ROLE authenticated;
SELECT pg_temp.read_as('lead', 'd6810000-0000-4000-8000-000000000001');
SELECT pg_temp.read_as('other', 'd6810000-0000-4000-8000-000000000002');
SELECT pg_temp.read_as('foreign', 'd6810000-0000-4000-8000-000000000003');
RESET ROLE;

DO $$
DECLARE
  v_name text;
  v_kind text;
  v_twin jsonb;
  v_rls jsonb;
BEGIN
  FOREACH v_name IN ARRAY ARRAY['lead', 'other', 'foreign'] LOOP
    FOREACH v_kind IN ARRAY ARRAY['*', 'seating', 'phash'] LOOP
      SELECT v INTO v_twin FROM piv_ctx WHERE k = 'twin:' || v_name || ':' || v_kind;
      SELECT v INTO v_rls FROM piv_ctx WHERE k = 'rls:' || v_name || ':' || v_kind;
      ASSERT jsonb_array_length(v_rls) > 0, format('the RLS read sees fixtures for %s/%s', v_name, v_kind);
      ASSERT v_twin = v_rls, format('parity for %s/%s: twin=%s rls=%s', v_name, v_kind, v_twin, v_rls);
    END LOOP;
  END LOOP;
  RAISE NOTICE 'ok 2 parity: image and phash twins = RLS read under JWT (3 importers)';
END $$;

DO $$
DECLARE
  v_ids text;
  v_sofa real;
BEGIN
  SELECT string_agg(e->>0, ',') INTO v_ids FROM piv_ctx, jsonb_array_elements(v) AS e WHERE k = 'twin:lead:*';
  ASSERT v_ids LIKE '%d6816000-0000-4000-8000-000000000001%', 'lead sees the catalog sofa pictures';
  ASSERT v_ids LIKE '%d6816000-0000-4000-8000-000000000003%', 'lead sees their own personal pictures';
  ASSERT v_ids LIKE '%d6816000-0000-4000-8000-000000000009%', 'lead sees studio A''s taught bench';
  ASSERT v_ids NOT LIKE '%d6816000-0000-4000-8000-000000000004%', 'never a co-member''s personal product';
  ASSERT v_ids NOT LIKE '%d6816000-0000-4000-8000-00000000000a%', 'never another studio''s product';
  ASSERT v_ids NOT LIKE '%d6816000-0000-4000-8000-000000000006%', 'never a deleted product';
  ASSERT v_ids NOT LIKE '%d6816000-0000-4000-8000-000000000007%', 'never a merged product';
  -- Studio B's taught crop on a catalog product stays studio B's: the lead
  -- sees the sofa only through its own pictures (best at 0.010 rad).
  SELECT (e->>1)::real INTO v_sofa FROM piv_ctx, jsonb_array_elements(v) AS e
  WHERE k = 'twin:lead:*' AND e->>0 = 'd6816000-0000-4000-8000-000000000001';
  ASSERT v_sofa = (1 - (pg_temp.unit(0.010) <=> pg_temp.unit(0)))::real,
    format('lead never sees studio B''s taught crop: %s', v_sofa);
  SELECT (e->>1)::real INTO v_sofa FROM piv_ctx, jsonb_array_elements(v) AS e
  WHERE k = 'twin:foreign:*' AND e->>0 = 'd6816000-0000-4000-8000-000000000001';
  ASSERT v_sofa = (1 - (pg_temp.unit(0.0001) <=> pg_temp.unit(0)))::real,
    format('studio B sees its own taught crop: %s', v_sofa);

  ASSERT (SELECT v FROM piv_ctx WHERE k = 'twin:lead:phash')
       = '[["d6816000-0000-4000-8000-000000000009", 3]]'::jsonb,
    format('lead: studio A''s taught hash only: %s', (SELECT v FROM piv_ctx WHERE k = 'twin:lead:phash'));
  ASSERT (SELECT v FROM piv_ctx WHERE k = 'twin:foreign:phash')
       = '[["d6816000-0000-4000-8000-000000000001", 3]]'::jsonb,
    'foreign: studio B''s taught hash only; 64 bits away never matches';

  SELECT string_agg(e->>0, ',') INTO v_ids FROM piv_ctx, jsonb_array_elements(v) AS e WHERE k = 'twin:lead:seating';
  ASSERT v_ids NOT LIKE '%d6816000-0000-4000-8000-000000000002%', 'category filter drops the lamp';
  RAISE NOTICE 'ok 1 RLS: product visibility and studio scope hold';
END $$;

-- anon reads nothing; the co-member reads studio A's taught row
SET LOCAL ROLE anon;
DO $$
BEGIN
  BEGIN
    PERFORM 1 FROM public.product_image_vectors;
    RAISE EXCEPTION 'anon should not read product_image_vectors';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END $$;
RESET ROLE;

-- ── 3. The worker's write ───────────────────────────────────────────────────
SET LOCAL ROLE service_role;
DO $$
DECLARE
  v_product uuid := 'd6816000-0000-4000-8000-000000000002';
  v_vec text := pg_temp.unit(0.5)::text;
BEGIN
  PERFORM public.replace_product_image_vectors(v_product, 'm1', jsonb_build_array(
    jsonb_build_object('image_hash', repeat('b1', 32), 'vector', v_vec),
    jsonb_build_object('image_hash', repeat('b2', 32), 'vector', v_vec)));
  ASSERT (SELECT count(*) FROM public.product_image_vectors WHERE product_id = v_product) = 2, 'two pictures';
  ASSERT (SELECT vector::text FROM public.product_image_vectors
          WHERE product_id = v_product AND image_hash = repeat('b1', 32)) = v_vec, 'existing row updated';

  PERFORM public.replace_product_image_vectors(v_product, 'm1', jsonb_build_array(
    jsonb_build_object('image_hash', repeat('b2', 32), 'vector', v_vec)));
  ASSERT (SELECT array_agg(image_hash) FROM public.product_image_vectors WHERE product_id = v_product)
       = ARRAY[repeat('b2', 32)], 'a removed picture drops out';

  PERFORM public.replace_product_image_vectors(v_product, 'm2', jsonb_build_array(
    jsonb_build_object('image_hash', repeat('b2', 32), 'vector', v_vec)));
  ASSERT (SELECT array_agg(model_version) FROM public.product_image_vectors WHERE product_id = v_product)
       = ARRAY['m2'], 'an older model drops out';

  -- designer_confirmed rows are never touched by the worker
  PERFORM public.replace_product_image_vectors('d6816000-0000-4000-8000-000000000009', 'm1', '[]'::jsonb);
  ASSERT (SELECT count(*) FROM public.product_image_vectors
          WHERE product_id = 'd6816000-0000-4000-8000-000000000009' AND source = 'designer_confirmed') = 1,
    'the taught row survives an empty replace';

  BEGIN
    PERFORM public.replace_product_image_vectors(v_product, 'm2',
      jsonb_build_array(jsonb_build_object('image_hash', 'not-a-hash', 'vector', v_vec)));
    RAISE EXCEPTION 'a bad hash should be refused';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  RAISE NOTICE 'ok 3 replace_product_image_vectors';
END $$;
RESET ROLE;

-- ── 4. Crop signature under the lease ───────────────────────────────────────
INSERT INTO public.board_deck_import_items (
  id, import_id, element_key, board_item_id, slide_index, role, extracted, state,
  found_by, candidates, lease_owner, lease_until, attempts
) VALUES
  ('d6818000-0000-4000-8000-000000000001', 'd6817000-0000-4000-8000-000000000001', 's1:pic1',
   'd6814000-0000-4000-8000-000000000001', 0, 'product', '{}'::jsonb, 'pending',
   NULL, '[]'::jsonb, 'piv-lease', now() + interval '1 hour', 1);

SET LOCAL ROLE service_role;
DO $$
BEGIN
  BEGIN
    PERFORM public.store_board_deck_import_crop_signature(
      'd6818000-0000-4000-8000-000000000001', 'someone-else', repeat('cc', 32), 5, pg_temp.unit(0.2), 'm1');
    RAISE EXCEPTION 'a run without the lease should be refused';
  EXCEPTION WHEN lock_not_available THEN NULL;
  END;
  PERFORM public.store_board_deck_import_crop_signature(
    'd6818000-0000-4000-8000-000000000001', 'piv-lease', repeat('cc', 32), 5, pg_temp.unit(0.2), 'm1');
  PERFORM public.store_board_deck_import_crop_signature(
    'd6818000-0000-4000-8000-000000000001', 'piv-lease', repeat('cc', 32), 5, pg_temp.unit(0.2), 'm1');
  ASSERT (SELECT count(*) FROM public.board_deck_import_crop_signatures
          WHERE item_id = 'd6818000-0000-4000-8000-000000000001') = 1, 'one signature per piece';
  RAISE NOTICE 'ok 4 crop signature is lease-guarded and idempotent';
END $$;
RESET ROLE;

-- The resolver records the piece (lease released).
UPDATE public.board_deck_import_items
SET state = 'found', found_by = 'look', lease_owner = NULL, lease_until = NULL,
    candidates = jsonb_build_array(
      jsonb_build_object('source', 'look', 'band', 'possible', 'rank', 1, 'evidence', '{}'::jsonb,
                         'product_id', 'd6816000-0000-4000-8000-000000000001'),
      jsonb_build_object('source', 'look', 'band', 'possible', 'rank', 2, 'evidence', '{}'::jsonb,
                         'product_id', 'd6816000-0000-4000-8000-000000000003'))
WHERE id = 'd6818000-0000-4000-8000-000000000001';

-- ── 5. Keep teaches; swap suppresses; unkeep untaches ───────────────────────
DO $$
DECLARE
  v_item uuid := 'd6818000-0000-4000-8000-000000000001';
  v_hash text := repeat('cc', 32) || ':d6811000-0000-4000-8000-000000000001';
  v_row public.product_image_vectors%ROWTYPE;
  v_evidence jsonb;
BEGIN
  PERFORM pg_temp.act_as('d6810000-0000-4000-8000-000000000001');
  PERFORM public.keep_board_deck_import_item(v_item, 1);
  SELECT * INTO v_row FROM public.product_image_vectors
  WHERE product_id = 'd6816000-0000-4000-8000-000000000001' AND image_hash = v_hash;
  ASSERT v_row.id IS NOT NULL, 'Keep teaches the kept product this crop';
  ASSERT v_row.source = 'designer_confirmed', 'source designer_confirmed';
  ASSERT v_row.studio_id = 'd6811000-0000-4000-8000-000000000001', 'scoped to the board''s studio';
  ASSERT v_row.phash = 5 AND v_row.model_version = 'm1', 'the crop''s hash and model';
  ASSERT v_row.created_by = 'd6810000-0000-4000-8000-000000000001', 'by the keeper';
  ASSERT v_row.vector = pg_temp.unit(0.2), 'the crop''s vector';

  PERFORM public.swap_board_deck_import_item(v_item, 2);
  SELECT evidence INTO v_evidence FROM public.board_deck_import_items WHERE id = v_item;
  ASSERT v_evidence->'suppressed'->0->>'product_id' = 'd6816000-0000-4000-8000-000000000001',
    format('swap away suppresses the old product: %s', v_evidence);
  ASSERT (v_evidence->'suppressed'->0->>'phash')::bigint = 5, 'the suppression pair carries the crop hash';
  ASSERT NOT EXISTS (SELECT 1 FROM public.product_image_vectors
                     WHERE product_id = 'd6816000-0000-4000-8000-000000000001' AND image_hash = v_hash),
    'the swapped-away product is no longer taught this crop';
  ASSERT EXISTS (SELECT 1 FROM public.product_image_vectors
                 WHERE product_id = 'd6816000-0000-4000-8000-000000000003' AND image_hash = v_hash
                   AND source = 'designer_confirmed'),
    'the swapped-to product is taught';

  -- Swap back and away again: one suppression entry per product.
  PERFORM public.swap_board_deck_import_item(v_item, 1);
  PERFORM public.swap_board_deck_import_item(v_item, 2);
  SELECT evidence INTO v_evidence FROM public.board_deck_import_items WHERE id = v_item;
  ASSERT jsonb_array_length(v_evidence->'suppressed') = 2,
    format('one entry per swapped-away product: %s', v_evidence);

  PERFORM public.unkeep_board_deck_import_item(v_item);
  ASSERT NOT EXISTS (SELECT 1 FROM public.product_image_vectors WHERE image_hash = v_hash),
    'unkeep untaches';
  SELECT evidence INTO v_evidence FROM public.board_deck_import_items WHERE id = v_item;
  ASSERT jsonb_array_length(v_evidence->'suppressed') = 2, 'unkeep is not a rejection';
  RAISE NOTICE 'ok 5 keep teaches, swap suppresses and untaches, unkeep untaches';
END $$;

-- The taught row is the studio's: a co-member sees it, the foreign designer does not.
DO $$
BEGIN
  PERFORM pg_temp.act_as('d6810000-0000-4000-8000-000000000001');
  PERFORM public.keep_board_deck_import_item('d6818000-0000-4000-8000-000000000001', 1);
END $$;
SET LOCAL ROLE authenticated;
SELECT pg_temp.act_as('d6810000-0000-4000-8000-000000000002');
DO $$
BEGIN
  ASSERT EXISTS (SELECT 1 FROM public.product_image_vectors
                 WHERE image_hash = repeat('cc', 32) || ':d6811000-0000-4000-8000-000000000001'),
    'a co-member reads the studio''s taught row';
END $$;
SELECT pg_temp.act_as('d6810000-0000-4000-8000-000000000003');
DO $$
BEGIN
  ASSERT NOT EXISTS (SELECT 1 FROM public.product_image_vectors
                     WHERE image_hash = repeat('cc', 32) || ':d6811000-0000-4000-8000-000000000001'),
    'a foreign designer never reads it, though the catalog product is visible';
  BEGIN
    PERFORM 1 FROM public.board_deck_import_crop_signatures;
    RAISE EXCEPTION 'authenticated should not read crop signatures';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    INSERT INTO public.product_image_vectors (product_id, image_hash, vector, model_version, source)
    VALUES ('d6816000-0000-4000-8000-000000000001', repeat('99', 32), pg_temp.unit(0), 'm1', 'product_image');
    RAISE EXCEPTION 'authenticated should not write product_image_vectors';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  RAISE NOTICE 'ok 5b the taught row is the studio''s; clients cannot write';
END $$;
RESET ROLE;

-- ── 6. Grants and definer shape ─────────────────────────────────────────────
DO $$
DECLARE
  v_fn text;
BEGIN
  FOREACH v_fn IN ARRAY ARRAY[
    'public.board_deck_import_match_image_knn(uuid, vector, integer, text)',
    'public.board_deck_import_match_phash(uuid, bigint, integer, integer)',
    'public.replace_product_image_vectors(uuid, text, jsonb)',
    'public.store_board_deck_import_crop_signature(uuid, text, text, bigint, vector, text)'
  ] LOOP
    ASSERT NOT has_function_privilege('anon', v_fn, 'EXECUTE'), v_fn || ': anon cannot execute';
    ASSERT NOT has_function_privilege('authenticated', v_fn, 'EXECUTE'), v_fn || ': authenticated cannot execute';
    ASSERT has_function_privilege('service_role', v_fn, 'EXECUTE'), v_fn || ': service_role can execute';
    ASSERT (SELECT prosecdef FROM pg_proc WHERE oid = v_fn::regprocedure), v_fn || ': SECURITY DEFINER';
    ASSERT (SELECT bool_or(setting ~ '^search_path=public, (extensions, )?pg_temp$')
            FROM pg_proc, unnest(proconfig) AS setting WHERE oid = v_fn::regprocedure),
      v_fn || ': pinned search_path';
  END LOOP;
  FOREACH v_fn IN ARRAY ARRAY[
    'public._board_deck_import_row_studio_visible(uuid, uuid)',
    'public._board_deck_import_board_studio(uuid, uuid)',
    'public._board_deck_import_teach()'
  ] LOOP
    ASSERT NOT has_function_privilege('authenticated', v_fn, 'EXECUTE'), v_fn || ': internal';
    ASSERT NOT has_function_privilege('service_role', v_fn, 'EXECUTE'), v_fn || ': internal';
  END LOOP;
  ASSERT has_table_privilege('authenticated', 'public.product_image_vectors', 'SELECT'), 'clients read under RLS';
  ASSERT NOT has_table_privilege('authenticated', 'public.product_image_vectors', 'INSERT'), 'clients never insert';
  ASSERT NOT has_table_privilege('authenticated', 'public.product_image_vectors', 'UPDATE'), 'clients never update';
  ASSERT NOT has_table_privilege('authenticated', 'public.product_image_vectors', 'DELETE'), 'clients never delete';
  ASSERT NOT has_table_privilege('anon', 'public.product_image_vectors', 'SELECT'), 'anon never reads';
  ASSERT NOT has_table_privilege('authenticated', 'public.board_deck_import_crop_signatures', 'SELECT'),
    'signatures are service only';
  ASSERT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.product_image_vectors'::regclass), 'RLS on';
  ASSERT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.board_deck_import_crop_signatures'::regclass),
    'RLS on signatures';
  ASSERT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_product_image_vectors_hnsw'
                 AND indexdef LIKE '%hnsw%vector_cosine_ops%'), 'HNSW cosine index';
  ASSERT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_product_image_vectors_phash'
                 AND indexdef LIKE '%btree%phash%'), 'btree on phash';
  RAISE NOTICE 'ok 6 grants: twins, replace and store are service_role only';
END $$;

ROLLBACK;
