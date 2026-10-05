-- Bring in a Deck — third review fixes (00686, US-15, SQ-381; SQ-380 R1–R5).
--   1. R1 a product write whose URL key is far over the btree limit succeeds
--      as authenticated (a 4000-character random URL, and a 1500-character
--      non-ASCII path whose key is ~13 KB); T0a still finds the long product
--      by an equivalent URL; the T0a predicate is served by the md5 index.
--   2. R2 the normalizer never raises: a 2000-character ASCII label plus
--      U+10FFFF, an input over 2048 characters, a 63-character label.
--   3. R3 the normalizer and its helpers: anon cannot execute, authenticated
--      and service_role can.
--   4. R4 un-teach removes the row of the studio that was taught:
--      (b) the import's created_by changes after the keep;
--      (c) the project's studio_id changes after the keep;
--      the importer loses their membership after the keep.
--   5. R5 a degenerate dHash: teach stores NULL for it, and match_phash never
--      returns a stored row whose phash is 0 or has popcount < 8.
-- Run after a fresh reset (or inside a transaction that applied 00686):
--   psql 'postgresql://postgres:postgres@127.0.0.1:54322/postgres' \
--     -v ON_ERROR_STOP=1 -f supabase/tests/deck_import/review_fixes_3.test.sql

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
-- 01 K: studio B · 02 D: studio A · 03 X (designer of the no-studio project):
-- A (joined first) and B · 04 L: studio B

INSERT INTO auth.users (
  id, email, encrypted_password, email_confirmed_at, created_at, updated_at,
  instance_id, aud, role
)
SELECT ('d6860000-0000-4000-8000-00000000000' || n)::uuid, 'rf3-' || n || '@test.invalid', '',
       now(), now(), now(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'
FROM generate_series(1, 4) AS n;

INSERT INTO public.profiles (id, email, full_name, created_at, updated_at)
SELECT ('d6860000-0000-4000-8000-00000000000' || n)::uuid, 'rf3-' || n || '@test.invalid',
       'Rf3 user ' || n, now(), now()
FROM generate_series(1, 4) AS n
ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email, full_name = EXCLUDED.full_name;

INSERT INTO public.organizations (id, type, name, slug, status)
VALUES
  ('d6861000-0000-4000-8000-00000000000a', 'design_studio', 'Rf3 Studio A', 'rf3-studio-a-test', 'active'),
  ('d6861000-0000-4000-8000-00000000000b', 'design_studio', 'Rf3 Studio B', 'rf3-studio-b-test', 'active');

INSERT INTO public.organization_members (user_id, organization_id, role, status, joined_at)
VALUES
  ('d6860000-0000-4000-8000-000000000001', 'd6861000-0000-4000-8000-00000000000b', 'owner', 'active', now()),
  ('d6860000-0000-4000-8000-000000000002', 'd6861000-0000-4000-8000-00000000000a', 'owner', 'active', now()),
  ('d6860000-0000-4000-8000-000000000003', 'd6861000-0000-4000-8000-00000000000a', 'member', 'active', now() - interval '3 days'),
  ('d6860000-0000-4000-8000-000000000003', 'd6861000-0000-4000-8000-00000000000b', 'member', 'active', now() - interval '2 days'),
  ('d6860000-0000-4000-8000-000000000004', 'd6861000-0000-4000-8000-00000000000b', 'member', 'active', now());

-- P1: X's, no studio_id (the board's studio follows the importer) · P2:
-- studio A's, D's · P3: studio B's, L's.
INSERT INTO public.projects (id, designer_id, client_id, created_by, name, status, studio_id)
VALUES
  ('d6862000-0000-4000-8000-000000000001', 'd6860000-0000-4000-8000-000000000003', NULL,
   'd6860000-0000-4000-8000-000000000003', 'Rf3 P1', 'active', NULL),
  ('d6862000-0000-4000-8000-000000000002', 'd6860000-0000-4000-8000-000000000002', NULL,
   'd6860000-0000-4000-8000-000000000002', 'Rf3 P2', 'active', 'd6861000-0000-4000-8000-00000000000a'),
  ('d6862000-0000-4000-8000-000000000003', 'd6860000-0000-4000-8000-000000000004', NULL,
   'd6860000-0000-4000-8000-000000000004', 'Rf3 P3', 'active', 'd6861000-0000-4000-8000-00000000000b');

INSERT INTO public.proposal_boards (
  id, proposal_id, project_id, name, canvas_width, canvas_height,
  background_color, sections, status, sort_order
)
SELECT ('d6863000-0000-4000-8000-00000000000' || n)::uuid, NULL,
       ('d6862000-0000-4000-8000-00000000000' || n)::uuid,
       'Rf3 board ' || n, 1200, 800, '#FAF8F5', '[]'::jsonb, 'active', 0
FROM generate_series(1, 3) AS n;

INSERT INTO public.vendors (id, name, website)
VALUES ('d6865000-0000-4000-8000-000000000001', 'Rf3 Maker Co', 'https://www.rf3maker.example');

INSERT INTO public.products (id, name, layer, vendor_id, captured_at, category)
VALUES
  ('d6866000-0000-4000-8000-000000000001', 'Rf3 sofa', 'catalog',
   'd6865000-0000-4000-8000-000000000001', now(), 'seating'),
  ('d6866000-0000-4000-8000-000000000002', 'Rf3 chair', 'catalog',
   'd6865000-0000-4000-8000-000000000001', now(), 'seating'),
  ('d6866000-0000-4000-8000-000000000003', 'Rf3 bench', 'catalog',
   'd6865000-0000-4000-8000-000000000001', now(), 'seating');

-- Imports: on P1 by K (scope B), on P2 by D (scope A), on P3 by L (scope B).
INSERT INTO public.board_deck_imports (id, board_id, created_by, source_format, file_sha256, file_name, options, status)
VALUES
  ('d6867000-0000-4000-8000-000000000001', 'd6863000-0000-4000-8000-000000000001',
   'd6860000-0000-4000-8000-000000000001', 'deck', repeat('f1', 32), 'P1.pptx', '{}'::jsonb, 'resolving'),
  ('d6867000-0000-4000-8000-000000000002', 'd6863000-0000-4000-8000-000000000002',
   'd6860000-0000-4000-8000-000000000002', 'deck', repeat('f2', 32), 'P2.pptx', '{}'::jsonb, 'resolving'),
  ('d6867000-0000-4000-8000-000000000003', 'd6863000-0000-4000-8000-000000000003',
   'd6860000-0000-4000-8000-000000000004', 'deck', repeat('f3', 32), 'P3.pptx', '{}'::jsonb, 'resolving');

-- Pieces and crop signatures. Hashes 1–3 have popcount 32; crop 4 is a
-- uniform crop stored before 00686 (phash 0).
--   i1 P1 crop e1 · i2 P2 crop e2 · i3 P3 crop e3 · i4 P2 crop e4
INSERT INTO public.board_deck_import_items (id, import_id, element_key, slide_index, role, state)
VALUES
  ('d6868000-0000-4000-8000-000000000001', 'd6867000-0000-4000-8000-000000000001', 's1:p1', 0, 'product', 'found'),
  ('d6868000-0000-4000-8000-000000000002', 'd6867000-0000-4000-8000-000000000002', 's1:p2', 0, 'product', 'found'),
  ('d6868000-0000-4000-8000-000000000003', 'd6867000-0000-4000-8000-000000000003', 's1:p3', 0, 'product', 'found'),
  ('d6868000-0000-4000-8000-000000000004', 'd6867000-0000-4000-8000-000000000002', 's1:p4', 0, 'product', 'found');

INSERT INTO public.board_deck_import_crop_signatures (item_id, image_hash, phash, vector, model_version)
VALUES
  ('d6868000-0000-4000-8000-000000000001', repeat('e1', 32), 1085102592571150095, pg_temp.unit(0.1), 'm1'),
  ('d6868000-0000-4000-8000-000000000002', repeat('e2', 32), 71777214294589695, pg_temp.unit(0.2), 'm1'),
  ('d6868000-0000-4000-8000-000000000003', repeat('e3', 32), 3689348814741910323, pg_temp.unit(0.3), 'm1'),
  ('d6868000-0000-4000-8000-000000000004', repeat('e4', 32), 0, pg_temp.unit(0.4), 'm1');

CREATE TEMP TABLE rf3_ctx (k text PRIMARY KEY, v jsonb) ON COMMIT DROP;
GRANT ALL ON rf3_ctx TO PUBLIC;

-- ── 1. R1: long URL keys ────────────────────────────────────────────────────
-- 1500 random BMP characters U+0800..U+C34F: each is 3 UTF-8 bytes, so the
-- key's path is ~13.5 KB of percent-escapes (the btree limit is 2704 B).
INSERT INTO rf3_ctx (k, v)
SELECT 'path', to_jsonb(string_agg(chr(2048 + floor(random() * 48000)::integer), ''))
FROM generate_series(1, 1500);
INSERT INTO rf3_ctx (k, v)
SELECT 'ascii', to_jsonb(string_agg(chr(33 + floor(random() * 94)::integer), ''))
FROM generate_series(1, 4000);

SET LOCAL ROLE authenticated;
SELECT pg_temp.act_as('d6860000-0000-4000-8000-000000000001');
INSERT INTO public.products (id, name, layer, owner_user_id, source_url, captured_at)
SELECT 'd6866000-0000-4000-8000-000000000011', 'Rf3 random-url lamp', 'personal',
       'd6860000-0000-4000-8000-000000000001',
       'https://www.long.example/q?x=' || (SELECT v #>> '{}' FROM rf3_ctx WHERE k = 'ascii'), now();
INSERT INTO public.products (id, name, layer, owner_user_id, source_url, captured_at)
SELECT 'd6866000-0000-4000-8000-000000000012', 'Rf3 long-path lamp', 'personal',
       'd6860000-0000-4000-8000-000000000001',
       'https://www.long.example/p/' || (SELECT v #>> '{}' FROM rf3_ctx WHERE k = 'path'), now();
INSERT INTO rf3_ctx (k, v)
SELECT 'inserted', to_jsonb(count(*))
FROM public.products
WHERE id IN ('d6866000-0000-4000-8000-000000000011', 'd6866000-0000-4000-8000-000000000012');
RESET ROLE;

-- T0a by an equivalent URL (scheme case, :443, no www., tracking param,
-- trailing slash, fragment).
SET LOCAL ROLE service_role;
INSERT INTO rf3_ctx (k, v)
SELECT 't0a', public.board_deck_import_match_links(
  'd6867000-0000-4000-8000-000000000001',
  ARRAY['HTTPS://Long.Example:443/p/' || (SELECT v #>> '{}' FROM rf3_ctx WHERE k = 'path')
        || '/?utm_source=deck#top']);
RESET ROLE;

DO $$
DECLARE
  v_key text := public._board_deck_import_normalize_url(
    (SELECT source_url FROM public.products WHERE id = 'd6866000-0000-4000-8000-000000000012'));
  v_plan text;
BEGIN
  ASSERT (SELECT v FROM rf3_ctx WHERE k = 'inserted') = '2'::jsonb,
    'the owner inserted both long-URL products as authenticated';
  ASSERT octet_length(v_key) > 8000,
    format('the long-path key is far over the btree limit: %s bytes', octet_length(v_key));
  ASSERT public._board_deck_import_normalize_url(
           (SELECT source_url FROM public.products WHERE id = 'd6866000-0000-4000-8000-000000000011')) IS NULL,
    'a 4000-character URL has no key';
  ASSERT (SELECT v->'products' FROM rf3_ctx WHERE k = 't0a')
         @> jsonb_build_array(jsonb_build_object('product_id', 'd6866000-0000-4000-8000-000000000012', 'url', v_key)),
    format('T0a finds the long-path product by an equivalent URL: %s',
           left((SELECT v::text FROM rf3_ctx WHERE k = 't0a'), 300));

  ASSERT pg_get_indexdef('public.idx_products_deck_import_source_url'::regclass)
         LIKE '%md5(_board_deck_import_normalize_url(source_url))%',
    pg_get_indexdef('public.idx_products_deck_import_source_url'::regclass);
  SET LOCAL enable_seqscan = off;
  EXECUTE format($q$
    EXPLAIN (FORMAT JSON)
    SELECT product.id FROM public.products AS product
    WHERE product.source_url IS NOT NULL
      AND product.deleted_at IS NULL
      AND product.merged_into_id IS NULL
      AND md5(public._board_deck_import_normalize_url(product.source_url)) = ANY (%L::text[])
      AND public._board_deck_import_normalize_url(product.source_url) = ANY (%L::text[])
  $q$, ARRAY[md5(v_key)], ARRAY[v_key]) INTO v_plan;
  RESET enable_seqscan;
  ASSERT v_plan LIKE '%idx_products_deck_import_source_url%', format('T0a uses the md5 index: %s', v_plan);
  ASSERT v_plan ~ '"Index Cond": "\(md5\(', format('the md5 is the index condition: %s', left(v_plan, 600));
  ASSERT (SELECT prosrc LIKE '%md5(public._board_deck_import_normalize_url(product.source_url)) = ANY (v_hashes)%'
          FROM pg_proc WHERE oid = 'public.board_deck_import_match_links(uuid, text[])'::regprocedure),
    'board_deck_import_match_links filters on the indexed md5';
  RAISE NOTICE 'ok 1 R1 long URL keys: writes succeed, T0a finds them, md5 index serves T0a';
END $$;

-- ── 2. R2: the normalizer never raises ──────────────────────────────────────
DO $$
DECLARE
  v_label text := repeat('a', 2000) || chr(1114111);
BEGIN
  ASSERT public._board_deck_import_normalize_url('https://' || v_label || '.example/') IS NULL,
    'a host label over 63 characters has no key';
  ASSERT public._board_deck_import_punycode(v_label) LIKE 'xn--' || repeat('a', 2000) || '-%',
    'punycode of a 2001-character label does not overflow';
  ASSERT public._board_deck_import_normalize_url('https://shop.example/' || repeat('x', 2028)) IS NULL,
    'an input over 2048 characters has no key';
  ASSERT public._board_deck_import_normalize_url('https://shop.example/' || repeat('x', 2027))
         = 'https://shop.example/' || repeat('x', 2027),
    'an input of 2048 characters keeps its key';
  ASSERT public._board_deck_import_normalize_url('https://' || repeat('ü', 63) || '.example/') LIKE 'https://xn--%',
    'a 63-character label is still punycoded';
  RAISE NOTICE 'ok 2 R2 the normalizer never raises';
END $$;

-- ── 3. R3: no anon EXECUTE ──────────────────────────────────────────────────
DO $$
DECLARE
  v_fn text;
BEGIN
  FOREACH v_fn IN ARRAY ARRAY[
    'public._board_deck_import_normalize_url(text)',
    'public._board_deck_import_pct_encode(text, text)',
    'public._board_deck_import_punycode(text)'
  ] LOOP
    ASSERT NOT has_function_privilege('anon', v_fn, 'EXECUTE'), v_fn || ': anon cannot execute';
    ASSERT has_function_privilege('authenticated', v_fn, 'EXECUTE'), v_fn || ': authenticated can execute';
    ASSERT has_function_privilege('service_role', v_fn, 'EXECUTE'), v_fn || ': service_role can execute';
  END LOOP;
  RAISE NOTICE 'ok 3 R3 the normalizer and helpers: not anon; authenticated and service_role';
END $$;

-- ── 4. R4: un-teach the studio that was taught ──────────────────────────────
-- (b) K keeps i1 on P1 → studio B. created_by becomes D (studio A only), so
-- the scope is now A; unkeep removes the B row.
UPDATE public.board_deck_import_items
SET state = 'kept', chosen_product_id = 'd6866000-0000-4000-8000-000000000001',
    kept_by = 'd6860000-0000-4000-8000-000000000001', kept_at = now()
WHERE id = 'd6868000-0000-4000-8000-000000000001';
INSERT INTO rf3_ctx (k, v)
SELECT 'b:taught', to_jsonb(taught_studio_id) FROM public.board_deck_import_items
WHERE id = 'd6868000-0000-4000-8000-000000000001';
INSERT INTO rf3_ctx (k, v)
SELECT 'b:row', to_jsonb(count(*)) FROM public.product_image_vectors
WHERE image_hash = repeat('e1', 32) || ':d6861000-0000-4000-8000-00000000000b';
UPDATE public.board_deck_imports SET created_by = 'd6860000-0000-4000-8000-000000000002'
WHERE id = 'd6867000-0000-4000-8000-000000000001';
INSERT INTO rf3_ctx (k, v)
SELECT 'b:scope-after', to_jsonb(scope.studio_id)
FROM public._board_deck_import_candidate_scope('d6867000-0000-4000-8000-000000000001') AS scope;
UPDATE public.board_deck_import_items
SET state = 'found', chosen_product_id = NULL, kept_by = NULL, kept_at = NULL
WHERE id = 'd6868000-0000-4000-8000-000000000001';

-- (c) D keeps i2 on P2 → studio A. P2 moves to studio B; unkeep removes the A row.
UPDATE public.board_deck_import_items
SET state = 'kept', chosen_product_id = 'd6866000-0000-4000-8000-000000000001',
    kept_by = 'd6860000-0000-4000-8000-000000000002', kept_at = now()
WHERE id = 'd6868000-0000-4000-8000-000000000002';
INSERT INTO rf3_ctx (k, v)
SELECT 'c:row', to_jsonb(count(*)) FROM public.product_image_vectors
WHERE image_hash = repeat('e2', 32) || ':d6861000-0000-4000-8000-00000000000a';
UPDATE public.projects SET studio_id = 'd6861000-0000-4000-8000-00000000000b'
WHERE id = 'd6862000-0000-4000-8000-000000000002';
INSERT INTO rf3_ctx (k, v)
SELECT 'c:key-after', to_jsonb(public.board_web_match_studio_key('d6867000-0000-4000-8000-000000000002'));
UPDATE public.board_deck_import_items
SET state = 'found', chosen_product_id = NULL, kept_by = NULL, kept_at = NULL
WHERE id = 'd6868000-0000-4000-8000-000000000002';
UPDATE public.projects SET studio_id = 'd6861000-0000-4000-8000-00000000000a'
WHERE id = 'd6862000-0000-4000-8000-000000000002';

-- L keeps i3 on P3 → studio B, then leaves B (no scope); unkeep still removes
-- the B row, and a keep with no scope teaches nothing.
UPDATE public.board_deck_import_items
SET state = 'kept', chosen_product_id = 'd6866000-0000-4000-8000-000000000002',
    kept_by = 'd6860000-0000-4000-8000-000000000004', kept_at = now()
WHERE id = 'd6868000-0000-4000-8000-000000000003';
INSERT INTO rf3_ctx (k, v)
SELECT 'l:row', to_jsonb(count(*)) FROM public.product_image_vectors
WHERE image_hash = repeat('e3', 32) || ':d6861000-0000-4000-8000-00000000000b';
DELETE FROM public.organization_members
WHERE user_id = 'd6860000-0000-4000-8000-000000000004'
  AND organization_id = 'd6861000-0000-4000-8000-00000000000b';
INSERT INTO rf3_ctx (k, v)
SELECT 'l:scope-after', COALESCE(to_jsonb(scope.studio_id), 'null'::jsonb)
FROM public._board_deck_import_candidate_scope('d6867000-0000-4000-8000-000000000003') AS scope;
UPDATE public.board_deck_import_items
SET state = 'found', chosen_product_id = NULL, kept_by = NULL, kept_at = NULL
WHERE id = 'd6868000-0000-4000-8000-000000000003';
INSERT INTO rf3_ctx (k, v)
SELECT 'l:row-after', to_jsonb(count(*)) FROM public.product_image_vectors
WHERE image_hash LIKE repeat('e3', 32) || ':%';
UPDATE public.board_deck_import_items
SET state = 'kept', chosen_product_id = 'd6866000-0000-4000-8000-000000000002',
    kept_by = 'd6860000-0000-4000-8000-000000000004', kept_at = now()
WHERE id = 'd6868000-0000-4000-8000-000000000003';

DO $$
BEGIN
  ASSERT (SELECT v FROM rf3_ctx WHERE k = 'b:taught') = to_jsonb('d6861000-0000-4000-8000-00000000000b'::text),
    format('the keep records the studio it taught: %s', (SELECT v FROM rf3_ctx WHERE k = 'b:taught'));
  ASSERT (SELECT v FROM rf3_ctx WHERE k = 'b:row') = '1'::jsonb, '(b) K''s keep taught studio B';
  ASSERT (SELECT v FROM rf3_ctx WHERE k = 'b:scope-after') = to_jsonb('d6861000-0000-4000-8000-00000000000a'::text),
    format('(b) the scope drifted to A: %s', (SELECT v FROM rf3_ctx WHERE k = 'b:scope-after'));
  ASSERT NOT EXISTS (SELECT 1 FROM public.product_image_vectors WHERE image_hash LIKE repeat('e1', 32) || ':%'),
    '(b) unkeep after created_by changed removed the B row';
  ASSERT (SELECT taught_studio_id FROM public.board_deck_import_items
          WHERE id = 'd6868000-0000-4000-8000-000000000001') IS NULL,
    '(b) an unkept piece records no taught studio';

  ASSERT (SELECT v FROM rf3_ctx WHERE k = 'c:row') = '1'::jsonb, '(c) D''s keep taught studio A';
  ASSERT (SELECT v FROM rf3_ctx WHERE k = 'c:key-after') = to_jsonb('d6861000-0000-4000-8000-00000000000b'::text),
    format('(c) the board''s studio drifted to B: %s', (SELECT v FROM rf3_ctx WHERE k = 'c:key-after'));
  ASSERT NOT EXISTS (SELECT 1 FROM public.product_image_vectors WHERE image_hash LIKE repeat('e2', 32) || ':%'),
    '(c) unkeep after projects.studio_id changed removed the A row';

  ASSERT (SELECT v FROM rf3_ctx WHERE k = 'l:row') = '1'::jsonb, 'L''s keep taught studio B';
  ASSERT (SELECT v FROM rf3_ctx WHERE k = 'l:scope-after') = 'null'::jsonb,
    format('L lost membership, so the scope is empty: %s', (SELECT v FROM rf3_ctx WHERE k = 'l:scope-after'));
  ASSERT (SELECT v FROM rf3_ctx WHERE k = 'l:row-after') = '0'::jsonb,
    'unkeep after the importer lost membership removed the B row';
  ASSERT NOT EXISTS (SELECT 1 FROM public.product_image_vectors WHERE image_hash LIKE repeat('e3', 32) || ':%'),
    'a keep with no scope studio teaches nothing';
  ASSERT (SELECT taught_studio_id FROM public.board_deck_import_items
          WHERE id = 'd6868000-0000-4000-8000-000000000003') IS NULL,
    'a keep with no scope studio records none';
  RAISE NOTICE 'ok 4 R4 un-teach uses the recorded studio: created_by drift, studio drift, lost membership';
END $$;

-- ── 5. R5: degenerate dHash ─────────────────────────────────────────────────
-- D keeps i4 (a uniform crop stored with phash 0) on P2 → studio A.
UPDATE public.board_deck_import_items
SET state = 'kept', chosen_product_id = 'd6866000-0000-4000-8000-000000000003',
    kept_by = 'd6860000-0000-4000-8000-000000000002', kept_at = now()
WHERE id = 'd6868000-0000-4000-8000-000000000004';

-- Stored pictures: the sofa's phash is 0, the bench's has popcount 7, the
-- chair's has popcount 32.
INSERT INTO public.product_image_vectors (
  product_id, image_hash, vector, phash, model_version, source, studio_id, created_by
) VALUES
  ('d6866000-0000-4000-8000-000000000001', repeat('d1', 32), pg_temp.unit(1.0), 0, 'm1', 'product_image', NULL, NULL),
  ('d6866000-0000-4000-8000-000000000003', repeat('d3', 32), pg_temp.unit(1.1), 127, 'm1', 'product_image', NULL, NULL),
  ('d6866000-0000-4000-8000-000000000002', repeat('d2', 32), pg_temp.unit(1.2), 4294967295, 'm1', 'product_image', NULL, NULL);

SET LOCAL ROLE service_role;
INSERT INTO rf3_ctx (k, v)
SELECT 'phash:' || q.n,
       COALESCE((
         SELECT jsonb_agg(jsonb_build_array(r.product_id, r.distance) ORDER BY r.ord)
         FROM public.board_deck_import_match_phash('d6867000-0000-4000-8000-000000000002', q.phash, q.max, 50)
           WITH ORDINALITY AS r(product_id, distance, layer, source, ord)
       ), '[]'::jsonb)
FROM (VALUES ('zero', 0::bigint, 0), ('zero-near', 0::bigint, 6), ('seven', 127::bigint, 0),
             ('normal', 4294967295::bigint, 0)) AS q(n, phash, max);
RESET ROLE;

DO $$
BEGIN
  ASSERT EXISTS (SELECT 1 FROM public.product_image_vectors
                 WHERE image_hash = repeat('e4', 32) || ':d6861000-0000-4000-8000-00000000000a'
                   AND product_id = 'd6866000-0000-4000-8000-000000000003'
                   AND source = 'designer_confirmed' AND phash IS NULL),
    'teach stores NULL phash for a degenerate crop hash';
  ASSERT (SELECT v FROM rf3_ctx WHERE k = 'phash:zero') = '[]'::jsonb,
    format('a stored phash 0 is never returned: %s', (SELECT v FROM rf3_ctx WHERE k = 'phash:zero'));
  ASSERT (SELECT v FROM rf3_ctx WHERE k = 'phash:zero-near') = '[]'::jsonb,
    format('nor within distance 6: %s', (SELECT v FROM rf3_ctx WHERE k = 'phash:zero-near'));
  ASSERT (SELECT v FROM rf3_ctx WHERE k = 'phash:seven') = '[]'::jsonb,
    format('a stored popcount-7 phash is never returned: %s', (SELECT v FROM rf3_ctx WHERE k = 'phash:seven'));
  ASSERT (SELECT v FROM rf3_ctx WHERE k = 'phash:normal')
         = '[["d6866000-0000-4000-8000-000000000002", 0]]'::jsonb,
    format('a structured phash is still an exact: %s', (SELECT v FROM rf3_ctx WHERE k = 'phash:normal'));
  RAISE NOTICE 'ok 5 R5 degenerate dHash: taught as NULL, never returned by match_phash';
END $$;

ROLLBACK;
