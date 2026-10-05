-- Bring in a Deck — the look tier's kNN twin (00679, US-15 W4a).
--   1. parity: board_deck_import_match_knn(import) returns EXACTLY the rows
--      aesthete_ask_knn returns under the importer's own JWT (products RLS),
--      for an importer with a studio, a co-member of that studio, and a
--      designer in another studio; with and without a category filter
--   2. negative: another studio's products, someone else's personal products,
--      deleted and merged products never appear
--   3. the look gate: photo_match comes from options; visible vectors counted
--   4. only service_role can call the twin and the gate; both are DEFINER
--      with a pinned search_path
--   5. a "Find this piece" pin job registers once per pin and resumes
-- Run after a fresh reset:
--   psql 'postgresql://postgres:postgres@127.0.0.1:54322/postgres' \
--     -v ON_ERROR_STOP=1 -f supabase/tests/deck_import/match_knn_parity.test.sql

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

-- A 768-d unit vector at angle p_turn (radians) from the first axis, in the
-- plane of the first two axes: cosine to pg_temp.unit(0) = cos(p_turn).
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
  ('d6790000-0000-4000-8000-000000000001', 'knn-lead@test.invalid', '', now(), now(), now(),
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('d6790000-0000-4000-8000-000000000002', 'knn-other@test.invalid', '', now(), now(), now(),
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('d6790000-0000-4000-8000-000000000003', 'knn-foreign@test.invalid', '', now(), now(), now(),
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');

INSERT INTO public.profiles (id, email, full_name, created_at, updated_at)
VALUES
  ('d6790000-0000-4000-8000-000000000001', 'knn-lead@test.invalid', 'Knn Lead', now(), now()),
  ('d6790000-0000-4000-8000-000000000002', 'knn-other@test.invalid', 'Knn Other', now(), now()),
  ('d6790000-0000-4000-8000-000000000003', 'knn-foreign@test.invalid', 'Knn Foreign', now(), now())
ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email, full_name = EXCLUDED.full_name;

INSERT INTO public.organizations (id, type, name, slug, status)
VALUES
  ('d6791000-0000-4000-8000-000000000001', 'design_studio', 'Knn Studio', 'knn-studio-test', 'active'),
  ('d6791000-0000-4000-8000-000000000002', 'design_studio', 'Knn Foreign', 'knn-foreign-test', 'active');

INSERT INTO public.organization_members (user_id, organization_id, role, status, joined_at)
VALUES
  ('d6790000-0000-4000-8000-000000000001', 'd6791000-0000-4000-8000-000000000001', 'owner', 'active', now()),
  ('d6790000-0000-4000-8000-000000000002', 'd6791000-0000-4000-8000-000000000001', 'member', 'active', now()),
  ('d6790000-0000-4000-8000-000000000003', 'd6791000-0000-4000-8000-000000000002', 'owner', 'active', now());

INSERT INTO public.projects (id, designer_id, client_id, created_by, name, status)
VALUES ('d6792000-0000-4000-8000-000000000001', 'd6790000-0000-4000-8000-000000000001', NULL,
        'd6790000-0000-4000-8000-000000000001', 'Knn project', 'active');

INSERT INTO public.proposal_boards (
  id, proposal_id, project_id, name, canvas_width, canvas_height,
  background_color, sections, status, sort_order
) VALUES
  ('d6793000-0000-4000-8000-000000000001', NULL, 'd6792000-0000-4000-8000-000000000001',
   'Knn board', 1200, 800, '#FAF8F5', '[]'::jsonb, 'active', 0);

-- The pins point at a storage path no live board owns; the media-reference
-- guard (not under test here) is bypassed for these fixture rows only.
SET LOCAL session_replication_role = replica;
INSERT INTO public.proposal_board_items (
  id, board_id, type, x, y, width, height, z_index, rotation, content, data, image_url
) VALUES
  ('d6794000-0000-4000-8000-000000000001', 'd6793000-0000-4000-8000-000000000001',
   'image', 10, 10, 200, 200, 0, 0, NULL, '{}'::jsonb,
   'https://example.supabase.co/storage/v1/object/public/proposal-mood-boards/x/boards/y/knn1.jpg'),
  ('d6794000-0000-4000-8000-000000000002', 'd6793000-0000-4000-8000-000000000001',
   'note', 220, 10, 200, 200, 1, 0, 'a note', '{}'::jsonb, NULL);
SET LOCAL session_replication_role = origin;

INSERT INTO public.vendors (id, name, website)
VALUES ('d6795000-0000-4000-8000-000000000001', 'Knn Maker Co', 'https://www.knnmaker.example');

-- Every fixture vector sits within a few degrees of the query, nearer than
-- anything seeded, so all of them fall inside the compared top 200.
INSERT INTO public.products (
  id, name, layer, owner_user_id, studio_id, vendor_id, captured_at, category,
  aesthete_vector, deleted_at, merged_into_id
) VALUES
  -- catalog (everyone)
  ('d6796000-0000-4000-8000-000000000001', 'Knn catalog sofa', 'catalog', NULL, NULL,
   'd6795000-0000-4000-8000-000000000001', now(), 'seating', pg_temp.unit(0.010), NULL, NULL),
  ('d6796000-0000-4000-8000-000000000002', 'Knn catalog lamp', 'catalog', NULL, NULL,
   'd6795000-0000-4000-8000-000000000001', now(), 'lighting', pg_temp.unit(0.020), NULL, NULL),
  -- the lead's own personal product
  ('d6796000-0000-4000-8000-000000000003', 'Knn lead personal chair', 'personal',
   'd6790000-0000-4000-8000-000000000001', NULL,
   'd6795000-0000-4000-8000-000000000001', now(), 'seating', pg_temp.unit(0.030), NULL, NULL),
  -- the co-member's personal product (never the lead's)
  ('d6796000-0000-4000-8000-000000000004', 'Knn other personal chair', 'personal',
   'd6790000-0000-4000-8000-000000000002', NULL,
   'd6795000-0000-4000-8000-000000000001', now(), 'seating', pg_temp.unit(0.005), NULL, NULL),
  -- the foreign designer's personal product
  ('d6796000-0000-4000-8000-000000000005', 'Knn foreign personal chair', 'personal',
   'd6790000-0000-4000-8000-000000000003', NULL,
   'd6795000-0000-4000-8000-000000000001', now(), 'seating', pg_temp.unit(0.006), NULL, NULL),
  -- deleted and merged catalog products (never anyone's)
  ('d6796000-0000-4000-8000-000000000006', 'Knn deleted sofa', 'catalog', NULL, NULL,
   'd6795000-0000-4000-8000-000000000001', now(), 'seating', pg_temp.unit(0.001), now(), NULL),
  ('d6796000-0000-4000-8000-000000000007', 'Knn merged sofa', 'catalog', NULL, NULL,
   'd6795000-0000-4000-8000-000000000001', now(), 'seating', pg_temp.unit(0.002), NULL,
   'd6796000-0000-4000-8000-000000000001'),
  -- a twin vector of the catalog sofa: equal distance, ordered by id in both
  ('d6796000-0000-4000-8000-000000000008', 'Knn catalog sofa twin', 'catalog', NULL, NULL,
   'd6795000-0000-4000-8000-000000000001', now(), 'seating', pg_temp.unit(0.010), NULL, NULL);

INSERT INTO public.products (
  id, name, layer, studio_id, vendor_id, captured_at,
  vendor_contact, lead_time_weeks, payment_terms, category, usage_notes, aesthete_vector
) VALUES
  -- studio A (lead + co-member)
  ('d6796000-0000-4000-8000-000000000009', 'Knn studio bench', 'studio',
   'd6791000-0000-4000-8000-000000000001', 'd6795000-0000-4000-8000-000000000001', now(),
   '{}'::jsonb, 4, 'fifty_fifty', 'seating', 'test', pg_temp.unit(0.040)),
  -- studio B (foreign only)
  ('d6796000-0000-4000-8000-00000000000a', 'Knn foreign bench', 'studio',
   'd6791000-0000-4000-8000-000000000002', 'd6795000-0000-4000-8000-000000000001', now(),
   '{}'::jsonb, 4, 'fifty_fifty', 'seating', 'test', pg_temp.unit(0.003));

-- One import per importer (written directly; the twin reads created_by only).
INSERT INTO public.board_deck_imports (id, board_id, created_by, source_format, file_sha256, file_name, options, status)
VALUES
  ('d6797000-0000-4000-8000-000000000001', 'd6793000-0000-4000-8000-000000000001',
   'd6790000-0000-4000-8000-000000000001', 'deck', repeat('d1', 32), 'Lead.pptx',
   '{"photo_match": true}'::jsonb, 'resolving'),
  ('d6797000-0000-4000-8000-000000000002', 'd6793000-0000-4000-8000-000000000001',
   'd6790000-0000-4000-8000-000000000002', 'deck', repeat('d2', 32), 'Other.pptx',
   '{}'::jsonb, 'resolving'),
  ('d6797000-0000-4000-8000-000000000003', 'd6793000-0000-4000-8000-000000000001',
   'd6790000-0000-4000-8000-000000000003', 'deck', repeat('d3', 32), 'Foreign.pptx',
   '{"photo_match": "yes"}'::jsonb, 'resolving');

CREATE TEMP TABLE knn_ctx (k text PRIMARY KEY, v jsonb) ON COMMIT DROP;
GRANT ALL ON knn_ctx TO PUBLIC;

-- ── 1. Parity under each importer's JWT ─────────────────────────────────────
-- The twin, as the service role.
SET LOCAL ROLE service_role;
INSERT INTO knn_ctx (k, v)
SELECT 'twin:' || imp.n || ':' || COALESCE(cat.c, '*'),
       COALESCE((
         SELECT jsonb_agg(jsonb_build_array(r.product_id, r.rank, r.match_source) ORDER BY r.ord)
         FROM public.board_deck_import_match_knn(imp.id, pg_temp.unit(0), 200, cat.c)
           WITH ORDINALITY AS r(product_id, rank, match_source, layer, ord)
       ), '[]'::jsonb)
FROM (VALUES
  ('lead', 'd6797000-0000-4000-8000-000000000001'::uuid),
  ('other', 'd6797000-0000-4000-8000-000000000002'::uuid),
  ('foreign', 'd6797000-0000-4000-8000-000000000003'::uuid)
) AS imp(n, id)
CROSS JOIN (VALUES (NULL::text), ('seating')) AS cat(c);
RESET ROLE;

-- aesthete_ask_knn, as each importer (products RLS decides).
CREATE OR REPLACE FUNCTION pg_temp.ask_as(p_name text, p_user uuid)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM pg_temp.act_as(p_user);
  INSERT INTO knn_ctx (k, v)
  SELECT 'ask:' || p_name || ':' || COALESCE(cat.c, '*'),
         COALESCE((
           SELECT jsonb_agg(jsonb_build_array(r.product_id, r.rank, r.match_source) ORDER BY r.ord)
           FROM public.aesthete_ask_knn(
             pg_temp.unit(0),
             jsonb_strip_nulls(jsonb_build_object('limit', 200, 'category', cat.c))
           ) WITH ORDINALITY AS r(product_id, rank, match_source, ord)
         ), '[]'::jsonb)
  FROM (VALUES (NULL::text), ('seating')) AS cat(c);
END;
$$;
GRANT EXECUTE ON FUNCTION pg_temp.ask_as(text, uuid) TO PUBLIC;

SET LOCAL ROLE authenticated;
SELECT pg_temp.ask_as('lead', 'd6790000-0000-4000-8000-000000000001');
SELECT pg_temp.ask_as('other', 'd6790000-0000-4000-8000-000000000002');
SELECT pg_temp.ask_as('foreign', 'd6790000-0000-4000-8000-000000000003');
RESET ROLE;

DO $$
DECLARE
  v_name text;
  v_cat text;
  v_twin jsonb;
  v_ask jsonb;
BEGIN
  FOREACH v_name IN ARRAY ARRAY['lead', 'other', 'foreign'] LOOP
    FOREACH v_cat IN ARRAY ARRAY['*', 'seating'] LOOP
      SELECT v INTO v_twin FROM knn_ctx WHERE k = 'twin:' || v_name || ':' || v_cat;
      SELECT v INTO v_ask FROM knn_ctx WHERE k = 'ask:' || v_name || ':' || v_cat;
      ASSERT jsonb_array_length(v_ask) > 0,
        format('aesthete_ask_knn sees fixtures for %s/%s', v_name, v_cat);
      ASSERT v_twin = v_ask,
        format('twin parity for %s/%s: twin=%s ask=%s', v_name, v_cat, v_twin, v_ask);
    END LOOP;
  END LOOP;
  RAISE NOTICE 'ok 1 parity: twin = aesthete_ask_knn under JWT (3 importers x 2 filters)';
END $$;

-- ── 2. Negative: what an importer never sees ────────────────────────────────
DO $$
DECLARE
  v_ids text;
BEGIN
  SELECT string_agg(e->>0, ',') INTO v_ids
  FROM knn_ctx, jsonb_array_elements(v) AS e WHERE k = 'twin:lead:*';
  -- seen: catalog, own personal, own studio, the equal-distance twin
  ASSERT v_ids LIKE '%d6796000-0000-4000-8000-000000000001%', 'lead sees the catalog sofa';
  ASSERT v_ids LIKE '%d6796000-0000-4000-8000-000000000003%', 'lead sees their own personal product';
  ASSERT v_ids LIKE '%d6796000-0000-4000-8000-000000000009%', 'lead sees their studio product';
  -- never: foreign studio, someone else's personal, deleted, merged
  ASSERT v_ids NOT LIKE '%d6796000-0000-4000-8000-00000000000a%', 'foreign-studio product never appears';
  ASSERT v_ids NOT LIKE '%d6796000-0000-4000-8000-000000000004%', 'a co-member''s personal product never appears';
  ASSERT v_ids NOT LIKE '%d6796000-0000-4000-8000-000000000005%', 'a foreign personal product never appears';
  ASSERT v_ids NOT LIKE '%d6796000-0000-4000-8000-000000000006%', 'a deleted product never appears';
  ASSERT v_ids NOT LIKE '%d6796000-0000-4000-8000-000000000007%', 'a merged product never appears';

  SELECT string_agg(e->>0, ',') INTO v_ids
  FROM knn_ctx, jsonb_array_elements(v) AS e WHERE k = 'twin:foreign:*';
  ASSERT v_ids LIKE '%d6796000-0000-4000-8000-00000000000a%', 'foreign sees their own studio product';
  ASSERT v_ids NOT LIKE '%d6796000-0000-4000-8000-000000000009%', 'foreign never sees studio A';
  ASSERT v_ids NOT LIKE '%d6796000-0000-4000-8000-000000000003%', 'foreign never sees the lead''s personal product';

  -- the category filter narrows to seating
  SELECT string_agg(e->>0, ',') INTO v_ids
  FROM knn_ctx, jsonb_array_elements(v) AS e WHERE k = 'twin:lead:seating';
  ASSERT v_ids NOT LIKE '%d6796000-0000-4000-8000-000000000002%', 'category filter drops the lamp';

  -- ties are ordered by id; ranks are cosine similarity
  ASSERT (SELECT (v->0->>1)::real FROM knn_ctx WHERE k = 'twin:lead:*') > 0.99,
    'rank is cosine similarity (1 - distance)';
  RAISE NOTICE 'ok 2 negative: foreign studio, others'' personal, deleted and merged never appear';
END $$;

DO $$
BEGIN
  BEGIN
    PERFORM * FROM public.board_deck_import_match_knn(
      'd6797000-0000-4000-8000-0000000000ff', pg_temp.unit(0), 5, NULL);
    RAISE EXCEPTION 'a missing import should be refused';
  EXCEPTION WHEN no_data_found THEN NULL;
  END;
  RAISE NOTICE 'ok 2b a missing import is refused';
END $$;

-- ── 3. The look gate ────────────────────────────────────────────────────────
DO $$
DECLARE
  v_gate jsonb;
BEGIN
  v_gate := public.board_deck_import_look_gate('d6797000-0000-4000-8000-000000000001');
  ASSERT (v_gate->>'photo_match')::boolean IS TRUE, 'photo_match true from options';
  ASSERT (v_gate->>'visible_vectors')::int >= 4, format('lead sees >= 4 vectors: %s', v_gate);
  v_gate := public.board_deck_import_look_gate('d6797000-0000-4000-8000-000000000002');
  ASSERT (v_gate->>'photo_match')::boolean IS FALSE, 'no photo_match option → false';
  v_gate := public.board_deck_import_look_gate('d6797000-0000-4000-8000-000000000003');
  ASSERT (v_gate->>'photo_match')::boolean IS FALSE, 'only boolean true asks for photo match';
  RAISE NOTICE 'ok 3 look gate';
END $$;

-- ── 4. Grants and definer shape ─────────────────────────────────────────────
DO $$
DECLARE
  v_fn text;
BEGIN
  FOREACH v_fn IN ARRAY ARRAY[
    'public.board_deck_import_match_knn(uuid, vector, integer, text)',
    'public.board_deck_import_look_gate(uuid)'
  ] LOOP
    ASSERT NOT has_function_privilege('anon', v_fn, 'EXECUTE'), v_fn || ': anon cannot execute';
    ASSERT NOT has_function_privilege('authenticated', v_fn, 'EXECUTE'), v_fn || ': authenticated cannot execute';
    ASSERT has_function_privilege('service_role', v_fn, 'EXECUTE'), v_fn || ': service_role can execute';
    ASSERT (SELECT prosecdef FROM pg_proc WHERE oid = v_fn::regprocedure), v_fn || ': SECURITY DEFINER';
    ASSERT (SELECT 'search_path=public, extensions, pg_temp' = ANY (proconfig)
            FROM pg_proc WHERE oid = v_fn::regprocedure), v_fn || ': pinned search_path';
  END LOOP;
  ASSERT has_function_privilege('authenticated',
    'public.register_board_deck_import(uuid, text, text, jsonb)', 'EXECUTE'), 'register stays callable';
  ASSERT NOT has_function_privilege('anon',
    'public.register_board_deck_import(uuid, text, text, jsonb)', 'EXECUTE'), 'register not for anon';
  RAISE NOTICE 'ok 4 grants: twin and gate are service_role only';
END $$;

SET LOCAL ROLE authenticated;
SELECT pg_temp.act_as('d6790000-0000-4000-8000-000000000001');
DO $$
BEGIN
  BEGIN
    PERFORM * FROM public.board_deck_import_match_knn(
      'd6797000-0000-4000-8000-000000000001', pg_temp.unit(0), 5, NULL);
    RAISE EXCEPTION 'authenticated should not reach the twin';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  RAISE NOTICE 'ok 4b an authenticated call is refused';
END $$;

-- ── 5. "Find this piece": one pin job per pin, resumable ───────────────────
DO $$
DECLARE
  v_first jsonb;
  v_again jsonb;
  v_import uuid;
BEGIN
  v_first := public.register_board_deck_import(
    'd6793000-0000-4000-8000-000000000001', '', '',
    jsonb_build_object(
      'source_format', 'pin',
      'board_item_id', 'd6794000-0000-4000-8000-000000000001',
      'options', jsonb_build_object('photo_match', true),
      'extracted', jsonb_build_object('caption', jsonb_build_object('name', 'Knn sofa'))));
  v_import := (v_first->>'import_id')::uuid;
  ASSERT (v_first->>'resumed')::boolean IS FALSE, 'first register is new';
  ASSERT v_first->>'status' = 'resolving', format('pin job resolves: %s', v_first);
  ASSERT jsonb_array_length(v_first->'items') = 1, 'one piece';
  ASSERT v_first->'items'->0->>'element_key' = 'pin:d6794000-0000-4000-8000-000000000001', 'keyed by pin';
  ASSERT v_first->'items'->0->>'state' = 'pending', 'pending';

  v_again := public.register_board_deck_import(
    'd6793000-0000-4000-8000-000000000001', '', '',
    jsonb_build_object('source_format', 'pin', 'board_item_id', 'd6794000-0000-4000-8000-000000000001',
                       'options', jsonb_build_object('photo_match', false)));
  ASSERT (v_again->>'import_id')::uuid = v_import, 'same pin → same job';
  ASSERT (v_again->>'resumed')::boolean IS TRUE, 'second register resumes';

  BEGIN
    PERFORM public.register_board_deck_import(
      'd6793000-0000-4000-8000-000000000001', '', '',
      jsonb_build_object('source_format', 'pin', 'board_item_id', 'd6794000-0000-4000-8000-000000000002'));
    RAISE EXCEPTION 'a note pin should be refused';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    PERFORM public.register_board_deck_import(
      'd6793000-0000-4000-8000-000000000001', repeat('a', 64), 'x.pptx',
      jsonb_build_object('source_format', 'pin', 'board_item_id', 'd6794000-0000-4000-8000-000000000001'));
    RAISE EXCEPTION 'a pin job with a file should be refused';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  RAISE NOTICE 'ok 5 pin job registers once per pin and resumes';
END $$;
RESET ROLE;

DO $$
BEGIN
  ASSERT (SELECT options FROM public.board_deck_imports
          WHERE source_format = 'pin' AND board_item_id = 'd6794000-0000-4000-8000-000000000001')
         = '{"photo_match": false}'::jsonb, 'a resumed pin job takes the new options';
  RAISE NOTICE 'ok 5b resume refreshes options';
END $$;

-- foreign designer cannot register on a board they cannot manage
SET LOCAL ROLE authenticated;
SELECT pg_temp.act_as('d6790000-0000-4000-8000-000000000003');
DO $$
BEGIN
  BEGIN
    PERFORM public.register_board_deck_import(
      'd6793000-0000-4000-8000-000000000001', '', '',
      jsonb_build_object('source_format', 'pin', 'board_item_id', 'd6794000-0000-4000-8000-000000000001'));
    RAISE EXCEPTION 'foreign should not register on this board';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  RAISE NOTICE 'ok 5c a foreign designer cannot start a pin job';
END $$;
RESET ROLE;

ROLLBACK;
