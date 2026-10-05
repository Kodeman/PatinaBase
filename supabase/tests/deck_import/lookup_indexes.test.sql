-- Bring in a Deck — URL normalizer parity, the T0a index and candidates
-- scoped to the board's studio (00683, SQ-369; SQ-366 F12 F13 F17).
--   1. F13: _board_deck_import_normalize_url gives every shared vector's
--      expected value and is a fixed point on it. The url-vectors block is
--      the ONE table: links_test.ts parses it and runs normalizeProductUrl
--      over the same rows. Keep one row per line, plain '…' literals only.
--   2. F12: the expression index (on the key's md5 since 00686) exists, is
--      valid, and serves the T0a predicate as an index condition (seq scans
--      off); no matching RPC calls the per-row DEFINER visibility helper any
--      more
--   3. F17: a designer in studios A and B importing onto B's board gets B's
--      products, never A's, from T0a, T0c, T1 and T2 (and the look gate
--      counts B only); onto A's board, the reverse
--   4. grants: candidate_scope is owner-only; the normalizer and its helpers
--      are executable by authenticated and service_role (00685: the URL index
--      runs as the writer) and not by anon (00686: anon writes no products);
--      the RPCs stay service_role
-- Run after a fresh reset:
--   psql 'postgresql://postgres:postgres@127.0.0.1:54322/postgres' \
--     -v ON_ERROR_STOP=1 -f supabase/tests/deck_import/lookup_indexes.test.sql

BEGIN;

SET LOCAL statement_timeout = '30s';

-- ── 1. URL vectors (shared with links_test.ts) ──────────────────────────────

CREATE TEMP TABLE url_vectors (ord serial, input text NOT NULL, expected text) ON COMMIT DROP;

-- url-vectors:begin
INSERT INTO url_vectors (input, expected) VALUES
  ('https://Shop.Example.com:443/a/b/?utm_source=x&id=7#frag', 'https://shop.example.com/a/b?id=7'),
  ('http://shop.example.com:80/a', 'https://shop.example.com/a'),
  ('https://shop.example.com:80/a', 'https://shop.example.com:80/a'),
  ('http://shop.example.com:443/a', 'https://shop.example.com/a'),
  ('https://shop.example.com:0443/a', 'https://shop.example.com/a'),
  ('https://shop.example.com:/a', 'https://shop.example.com/a'),
  ('https://shop.example.com:8080/a', 'https://shop.example.com:8080/a'),
  ('https://shop.example:65535/', 'https://shop.example:65535/'),
  ('https://Bücher.example/Stühle', 'https://xn--bcher-kva.example/St%C3%BChle'),
  ('https://例え.テスト/家具?q=椅子', 'https://xn--r8jz45g.xn--zckzah/%E5%AE%B6%E5%85%B7?q=%E6%A4%85%E5%AD%90'),
  ('https://münchen-straße.example/', 'https://xn--mnchen-strae-v9a90b.example/'),
  ('https://www.пример.рф/', 'https://xn--e1afmkfd.xn--p1ai/'),
  ('https://faß.example/', 'https://xn--fa-hia.example/'),
  ('https://ÉCOLE.example/', 'https://xn--cole-9oa.example/'),
  ('https://ｓｈｏｐ.example/x', 'https://shop.example/x'),
  ('https://😀.example/', 'https://xn--e28h.example/'),
  ('https://shop.example/a b/c"d<e>f`g{h}i^j|k', 'https://shop.example/a%20b/c%22d%3Ce%3Ef%60g%7Bh%7Di^j|k'),
  ('https://shop.example/p?a=b c&q="x"&r=<y>&s=''z''&t=`u`&v={w}&x=^|', 'https://shop.example/p?a=b%20c&q=%22x%22&r=%3Cy%3E&s=%27z%27&t=`u`&v={w}&x=^|'),
  ('https://shop.example/%7Efoo/%e2%82%ac', 'https://shop.example/%7Efoo/%e2%82%ac'),
  ('https://shop.example/a%20b?c%20d', 'https://shop.example/a%20b?c%20d'),
  ('https://shop.example/a%2Fb', 'https://shop.example/a%2Fb'),
  ('https://shop.example/100%', 'https://shop.example/100%'),
  ('https://shop.example/sofa-ä/', 'https://shop.example/sofa-%C3%A4'),
  ('https://SHOP.EXAMPLE.COM/ÄÖ', 'https://shop.example.com/%C3%84%C3%96'),
  ('https://shop.example/é?é=é', 'https://shop.example/%C3%A9?%C3%A9=%C3%A9'),
  ('https://shop.example/😀', 'https://shop.example/%F0%9F%98%80'),
  ('https://shop.example/~tilde/[x]@!$&()*+,;=:', 'https://shop.example/~tilde/[x]@!$&()*+,;=:'),
  ('https://WWW.EXAMPLE.COM', 'https://example.com/'),
  ('HTTPS://Shop.Example/Path?A=B', 'https://shop.example/Path?A=B'),
  ('https://shop.example', 'https://shop.example/'),
  ('https://shop.example/?', 'https://shop.example/'),
  ('https://shop.example///', 'https://shop.example/'),
  ('https://shop.example/a///', 'https://shop.example/a'),
  ('https://shop.example/x?&&a=1&&', 'https://shop.example/x?a=1'),
  ('https://shop.example/x?gclid=1&fbclid=2&utm_medium=3&REF=4&ref_=5&refx=6', 'https://shop.example/x?refx=6'),
  ('https://shop.example/x?ref=abc&color=red', 'https://shop.example/x?color=red'),
  ('https://shop.example/a?b=c=d', 'https://shop.example/a?b=c=d'),
  ('https://user:pw@shop.example/a', 'https://shop.example/a'),
  ('  https://shop.example/x  ', 'https://shop.example/x'),
  ('ftp://shop.example/x', NULL),
  ('shop.example/x', NULL),
  ('https://shop.example:99999/', NULL),
  ('https://shop.example:12ab/', NULL);
-- url-vectors:end

DO $$
DECLARE
  v_row record;
  v_got text;
  v_count integer := 0;
BEGIN
  FOR v_row IN SELECT * FROM url_vectors ORDER BY ord LOOP
    v_got := public._board_deck_import_normalize_url(v_row.input);
    ASSERT v_got IS NOT DISTINCT FROM v_row.expected,
      format('vector %s: normalize(%L) = %L, expected %L', v_row.ord, v_row.input, v_got, v_row.expected);
    IF v_row.expected IS NOT NULL THEN
      ASSERT public._board_deck_import_normalize_url(v_row.expected) = v_row.expected,
        format('vector %s: not a fixed point on %L', v_row.ord, v_row.expected);
    END IF;
    v_count := v_count + 1;
  END LOOP;
  ASSERT v_count >= 25, format('vector table has %s rows', v_count);
  RAISE NOTICE 'ok 1 normalizer: % shared vectors match and are fixed points', v_count;
END $$;

-- ── 2. The T0a index ────────────────────────────────────────────────────────

DO $$
DECLARE
  v_plan text;
  v_fn text;
BEGIN
  ASSERT (SELECT indisvalid FROM pg_index
          WHERE indexrelid = 'public.idx_products_deck_import_source_url'::regclass),
    'idx_products_deck_import_source_url exists and is valid';

  SET LOCAL enable_seqscan = off;
  EXECUTE $q$
    EXPLAIN (FORMAT JSON)
    SELECT product.id FROM public.products AS product
    WHERE product.source_url IS NOT NULL
      AND product.deleted_at IS NULL
      AND product.merged_into_id IS NULL
      AND md5(public._board_deck_import_normalize_url(product.source_url))
          = ANY (ARRAY[md5('https://scope.example/oak-bench')])
      AND public._board_deck_import_normalize_url(product.source_url)
          = ANY (ARRAY['https://scope.example/oak-bench'])
  $q$ INTO v_plan;
  RESET enable_seqscan;
  ASSERT v_plan LIKE '%idx_products_deck_import_source_url%', format('T0a uses the index: %s', v_plan);
  ASSERT v_plan ~ '"Index Cond": "\(md5\(', format('the md5 is the index condition: %s', v_plan);

  FOREACH v_fn IN ARRAY ARRAY[
    'public.board_deck_import_match_links(uuid, text[])',
    'public.board_deck_import_match_sku(uuid, text, text)',
    'public.board_deck_import_search_words(uuid, text, text, integer)',
    'public.board_deck_import_match_knn(uuid, vector, integer, text)',
    'public.board_deck_import_look_gate(uuid)'
  ] LOOP
    ASSERT (SELECT prosrc NOT LIKE '%_board_deck_import_visible_for%'
            FROM pg_proc WHERE oid = v_fn::regprocedure),
      v_fn || ': no per-row DEFINER visibility call';
  END LOOP;
  RAISE NOTICE 'ok 2 T0a is served by idx_products_deck_import_source_url; no per-row DEFINER call';
END $$;

-- ── 3. Fixtures: one designer in studios A and B ────────────────────────────
-- 01 dual (A + B) · 02 B-only lead (owns B's board)

CREATE OR REPLACE FUNCTION pg_temp.unit(p_turn double precision)
RETURNS vector
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT ('[' || cos(p_turn)::text || ',' || sin(p_turn)::text || repeat(',0', 766) || ']')::vector;
$$;
GRANT EXECUTE ON FUNCTION pg_temp.unit(double precision) TO PUBLIC;

INSERT INTO auth.users (
  id, email, encrypted_password, email_confirmed_at, created_at, updated_at,
  instance_id, aud, role
)
VALUES
  ('d6830000-0000-4000-8000-000000000001', 'scope-dual@test.invalid', '', now(), now(), now(),
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('d6830000-0000-4000-8000-000000000002', 'scope-lead-b@test.invalid', '', now(), now(), now(),
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');

INSERT INTO public.profiles (id, email, full_name, created_at, updated_at)
VALUES
  ('d6830000-0000-4000-8000-000000000001', 'scope-dual@test.invalid', 'Scope Dual', now(), now()),
  ('d6830000-0000-4000-8000-000000000002', 'scope-lead-b@test.invalid', 'Scope Lead B', now(), now())
ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email, full_name = EXCLUDED.full_name;

INSERT INTO public.organizations (id, type, name, slug, status)
VALUES
  ('d6831000-0000-4000-8000-00000000000a', 'design_studio', 'Scope Studio A', 'scope-studio-a-test', 'active'),
  ('d6831000-0000-4000-8000-00000000000b', 'design_studio', 'Scope Studio B', 'scope-studio-b-test', 'active');

-- The dual member joined A first, so A is their "earliest" studio. Each
-- studio's owner row goes in before any other member (membership guard).
INSERT INTO public.organization_members (user_id, organization_id, role, status, joined_at)
VALUES
  ('d6830000-0000-4000-8000-000000000002', 'd6831000-0000-4000-8000-00000000000b', 'owner', 'active', now() - interval '3 days'),
  ('d6830000-0000-4000-8000-000000000001', 'd6831000-0000-4000-8000-00000000000a', 'owner', 'active', now() - interval '2 days');
INSERT INTO public.organization_members (user_id, organization_id, role, status, joined_at)
VALUES
  ('d6830000-0000-4000-8000-000000000001', 'd6831000-0000-4000-8000-00000000000b', 'member', 'active', now() - interval '1 day');

-- B's board (B's lead designs it; the job records studio B) and A's board.
INSERT INTO public.projects (id, designer_id, client_id, created_by, name, status, studio_id)
VALUES
  ('d6832000-0000-4000-8000-00000000000b', 'd6830000-0000-4000-8000-000000000002', NULL,
   'd6830000-0000-4000-8000-000000000002', 'Scope B project', 'active', 'd6831000-0000-4000-8000-00000000000b'),
  ('d6832000-0000-4000-8000-00000000000a', 'd6830000-0000-4000-8000-000000000001', NULL,
   'd6830000-0000-4000-8000-000000000001', 'Scope A project', 'active', 'd6831000-0000-4000-8000-00000000000a');

INSERT INTO public.proposal_boards (
  id, proposal_id, project_id, name, canvas_width, canvas_height,
  background_color, sections, status, sort_order
) VALUES
  ('d6833000-0000-4000-8000-00000000000b', NULL, 'd6832000-0000-4000-8000-00000000000b',
   'Scope B board', 1200, 800, '#FAF8F5', '[]'::jsonb, 'active', 0),
  ('d6833000-0000-4000-8000-00000000000a', NULL, 'd6832000-0000-4000-8000-00000000000a',
   'Scope A board', 1200, 800, '#FAF8F5', '[]'::jsonb, 'active', 0);

INSERT INTO public.vendors (id, name, website)
VALUES ('d6835000-0000-4000-8000-000000000001', 'Scope Maker Co', 'https://scope.example');

-- Every product shares the link, the SKU, the name words and (nearly) the look.
INSERT INTO public.products (
  id, name, layer, owner_user_id, studio_id, vendor_id, captured_at, category,
  source_url, vendor_sku, aesthete_vector
) VALUES
  ('d6836000-0000-4000-8000-000000000001', 'Scope oak bench', 'catalog', NULL, NULL,
   'd6835000-0000-4000-8000-000000000001', now(), 'seating',
   'https://www.scope.example/oak-bench/', 'SCOPE-1', pg_temp.unit(0.010)),
  ('d6836000-0000-4000-8000-000000000002', 'Scope oak bench', 'personal',
   'd6830000-0000-4000-8000-000000000001', NULL,
   'd6835000-0000-4000-8000-000000000001', now(), 'seating',
   'https://scope.example/oak-bench?utm_source=deck', 'SCOPE-1', pg_temp.unit(0.020));

INSERT INTO public.products (
  id, name, layer, studio_id, vendor_id, captured_at,
  vendor_contact, lead_time_weeks, payment_terms, category, usage_notes,
  source_url, vendor_sku, aesthete_vector
) VALUES
  ('d6836000-0000-4000-8000-00000000000a', 'Scope oak bench', 'studio',
   'd6831000-0000-4000-8000-00000000000a', 'd6835000-0000-4000-8000-000000000001', now(),
   '{}'::jsonb, 4, 'fifty_fifty', 'seating', 'test',
   'https://scope.example/oak-bench', 'SCOPE-1', pg_temp.unit(0.001)),
  ('d6836000-0000-4000-8000-00000000000b', 'Scope oak bench', 'studio',
   'd6831000-0000-4000-8000-00000000000b', 'd6835000-0000-4000-8000-000000000001', now(),
   '{}'::jsonb, 4, 'fifty_fifty', 'seating', 'test',
   'HTTPS://scope.example:443/oak-bench#top', 'SCOPE-1', pg_temp.unit(0.002));

INSERT INTO public.board_deck_imports (id, board_id, created_by, source_format, file_sha256, file_name, options, status)
VALUES
  ('d6837000-0000-4000-8000-00000000000b', 'd6833000-0000-4000-8000-00000000000b',
   'd6830000-0000-4000-8000-000000000001', 'deck', repeat('e1', 32), 'OntoB.pptx', '{}'::jsonb, 'resolving'),
  ('d6837000-0000-4000-8000-00000000000a', 'd6833000-0000-4000-8000-00000000000a',
   'd6830000-0000-4000-8000-000000000001', 'deck', repeat('e2', 32), 'OntoA.pptx', '{}'::jsonb, 'resolving');

-- ── 3. Candidates come from the board's studio only ────────────────────────
SET LOCAL ROLE service_role;
DO $$
DECLARE
  v_case record;
  v_ids text;
  v_gate jsonb;
BEGIN
  FOR v_case IN
    SELECT * FROM (VALUES
      ('B', 'd6837000-0000-4000-8000-00000000000b'::uuid,
       'd6836000-0000-4000-8000-00000000000b', 'd6836000-0000-4000-8000-00000000000a'),
      ('A', 'd6837000-0000-4000-8000-00000000000a'::uuid,
       'd6836000-0000-4000-8000-00000000000a', 'd6836000-0000-4000-8000-00000000000b')
    ) AS c(board, import_id, own_studio, other_studio)
  LOOP
    -- T0a
    SELECT string_agg(e->>'product_id', ',') INTO v_ids
    FROM jsonb_array_elements(public.board_deck_import_match_links(
      v_case.import_id, ARRAY['https://scope.example/oak-bench'])->'products') AS e;
    ASSERT v_ids LIKE '%' || v_case.own_studio || '%', format('%s T0a: board studio product: %s', v_case.board, v_ids);
    ASSERT v_ids NOT LIKE '%' || v_case.other_studio || '%', format('%s T0a: never the other studio: %s', v_case.board, v_ids);
    ASSERT v_ids LIKE '%d6836000-0000-4000-8000-000000000001%', format('%s T0a: catalog', v_case.board);
    ASSERT v_ids LIKE '%d6836000-0000-4000-8000-000000000002%', format('%s T0a: own personal', v_case.board);

    -- T0c
    SELECT string_agg(e->>'product_id', ',') INTO v_ids
    FROM jsonb_array_elements(public.board_deck_import_match_sku(v_case.import_id, 'scope-1', 'Scope Maker Co')) AS e;
    ASSERT v_ids LIKE '%' || v_case.own_studio || '%', format('%s T0c: board studio product: %s', v_case.board, v_ids);
    ASSERT v_ids NOT LIKE '%' || v_case.other_studio || '%', format('%s T0c: never the other studio: %s', v_case.board, v_ids);

    -- T1
    SELECT string_agg(e->>'product_id', ',') INTO v_ids
    FROM jsonb_array_elements(public.board_deck_import_search_words(
      v_case.import_id, 'Scope oak bench in natural oak', 'Scope Maker Co', 10)) AS e;
    ASSERT v_ids LIKE '%' || v_case.own_studio || '%', format('%s T1: board studio product: %s', v_case.board, v_ids);
    ASSERT v_ids NOT LIKE '%' || v_case.other_studio || '%', format('%s T1: never the other studio: %s', v_case.board, v_ids);

    -- T2
    SELECT string_agg(r.product_id::text, ',') INTO v_ids
    FROM public.board_deck_import_match_knn(v_case.import_id, pg_temp.unit(0), 200, NULL) AS r;
    ASSERT v_ids LIKE '%' || v_case.own_studio || '%', format('%s T2: board studio product: %s', v_case.board, v_ids);
    ASSERT v_ids NOT LIKE '%' || v_case.other_studio || '%', format('%s T2: never the other studio: %s', v_case.board, v_ids);

    -- the look gate counts the same pool
    v_gate := public.board_deck_import_look_gate(v_case.import_id);
    ASSERT (v_gate->>'visible_vectors')::int = (
      SELECT count(*) FROM public.products AS product
      WHERE product.aesthete_vector IS NOT NULL AND product.deleted_at IS NULL
        AND product.merged_into_id IS NULL
        AND (product.layer = 'catalog'
             OR product.id IN ('d6836000-0000-4000-8000-000000000002'::uuid, v_case.own_studio::uuid))
    ), format('%s look gate counts catalog + own personal + board studio: %s', v_case.board, v_gate);
  END LOOP;

  BEGIN
    PERFORM public.board_deck_import_match_links('d6837000-0000-4000-8000-0000000000ff', ARRAY['https://x.example/']);
    RAISE EXCEPTION 'a missing import should be refused';
  EXCEPTION WHEN no_data_found THEN NULL;
  END;
  RAISE NOTICE 'ok 3 a two-studio designer gets only the board''s studio from T0a, T0c, T1, T2 and the gate';
END $$;
RESET ROLE;

-- ── 4. Grants ───────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_fn text;
BEGIN
  ASSERT NOT has_function_privilege('anon', 'public._board_deck_import_candidate_scope(uuid)', 'EXECUTE'),
    '_board_deck_import_candidate_scope: anon cannot execute';
  ASSERT NOT has_function_privilege('authenticated', 'public._board_deck_import_candidate_scope(uuid)', 'EXECUTE'),
    '_board_deck_import_candidate_scope: authenticated cannot execute';
  ASSERT NOT has_function_privilege('service_role', 'public._board_deck_import_candidate_scope(uuid)', 'EXECUTE'),
    '_board_deck_import_candidate_scope: owner only';
  -- idx_products_deck_import_source_url evaluates the normalizer as whoever
  -- writes products (00685): authenticated and service_role. anon writes no
  -- products (no anon write policy; WITH CHECK runs first), so not anon (00686).
  FOREACH v_fn IN ARRAY ARRAY[
    'public._board_deck_import_normalize_url(text)',
    'public._board_deck_import_pct_encode(text, text)',
    'public._board_deck_import_punycode(text)'
  ] LOOP
    ASSERT NOT has_function_privilege('anon', v_fn, 'EXECUTE'), v_fn || ': anon cannot execute (00686)';
    ASSERT has_function_privilege('authenticated', v_fn, 'EXECUTE'), v_fn || ': authenticated can execute (00685)';
    ASSERT has_function_privilege('service_role', v_fn, 'EXECUTE'), v_fn || ': service_role can execute (00685)';
  END LOOP;
  FOREACH v_fn IN ARRAY ARRAY[
    'public.board_deck_import_match_links(uuid, text[])',
    'public.board_deck_import_match_sku(uuid, text, text)',
    'public.board_deck_import_search_words(uuid, text, text, integer)',
    'public.board_deck_import_match_knn(uuid, vector, integer, text)',
    'public.board_deck_import_look_gate(uuid)'
  ] LOOP
    ASSERT NOT has_function_privilege('anon', v_fn, 'EXECUTE'), v_fn || ': anon cannot execute';
    ASSERT NOT has_function_privilege('authenticated', v_fn, 'EXECUTE'), v_fn || ': authenticated cannot execute';
    ASSERT has_function_privilege('service_role', v_fn, 'EXECUTE'), v_fn || ': service_role can execute';
    ASSERT (SELECT prosecdef FROM pg_proc WHERE oid = v_fn::regprocedure), v_fn || ': SECURITY DEFINER';
    ASSERT (SELECT bool_or(setting ~ '^search_path=public, (extensions, )?pg_temp$')
            FROM pg_proc, unnest(proconfig) AS setting WHERE oid = v_fn::regprocedure),
      v_fn || ': pinned search_path';
  END LOOP;
  RAISE NOTICE 'ok 4 grants';
END $$;

ROLLBACK;
