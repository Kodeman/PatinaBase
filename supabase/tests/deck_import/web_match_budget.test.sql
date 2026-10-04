-- Bring in a Deck — web match budget (00680, US-15 W4b, SQ-361).
--   1. consume grants calls and books cost in micros (3500 per call)
--   2. the default cap is 500 a studio-month: partial grant, then denial with
--      resets_at = the next UTC month start
--   3. the cap is read from the settings row (no migration to change it)
--   4. n is validated
--   5. an import bills to the importer's studio; web results append to a
--      settled piece only (stale base dropped, decisions untouched, web rows
--      only) — needs 00678's _board_deck_import_record
--   6. studio members read their studio's row; others and anon do not
--   7. client roles cannot call the RPCs or write the ledger/settings
-- Run after a fresh reset:
--   psql 'postgresql://postgres:postgres@127.0.0.1:54322/postgres' \
--     -v ON_ERROR_STOP=1 -f supabase/tests/deck_import/web_match_budget.test.sql

BEGIN;

SET LOCAL statement_timeout = '30s';

-- ── Fixtures ────────────────────────────────────────────────────────────────
-- 01 lead (studio A) · 02 outsider (studio B)

INSERT INTO auth.users (
  id, email, encrypted_password, email_confirmed_at, created_at, updated_at,
  instance_id, aud, role
)
VALUES
  ('d6800000-0000-4000-8000-000000000001', 'webmatch-lead@test.invalid', '', now(), now(), now(),
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('d6800000-0000-4000-8000-000000000002', 'webmatch-outsider@test.invalid', '', now(), now(), now(),
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');

INSERT INTO public.profiles (id, email, full_name, created_at, updated_at)
VALUES
  ('d6800000-0000-4000-8000-000000000001', 'webmatch-lead@test.invalid', 'Web Lead', now(), now()),
  ('d6800000-0000-4000-8000-000000000002', 'webmatch-outsider@test.invalid', 'Web Outsider', now(), now())
ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email, full_name = EXCLUDED.full_name;

INSERT INTO public.organizations (id, type, name, slug, status)
VALUES
  ('d6801000-0000-4000-8000-000000000001', 'design_studio', 'Web Studio', 'web-studio-test', 'active'),
  ('d6801000-0000-4000-8000-000000000002', 'design_studio', 'Web Outsider', 'web-outsider-test', 'active');

INSERT INTO public.organization_members (user_id, organization_id, role, status, joined_at)
VALUES
  ('d6800000-0000-4000-8000-000000000001', 'd6801000-0000-4000-8000-000000000001', 'owner', 'active', now()),
  ('d6800000-0000-4000-8000-000000000002', 'd6801000-0000-4000-8000-000000000002', 'owner', 'active', now());

INSERT INTO public.projects (id, designer_id, client_id, created_by, name, status)
VALUES ('d6802000-0000-4000-8000-000000000001', 'd6800000-0000-4000-8000-000000000001', NULL,
        'd6800000-0000-4000-8000-000000000001', 'Web project', 'active');

INSERT INTO public.proposal_boards (
  id, proposal_id, project_id, name, canvas_width, canvas_height,
  background_color, sections, status, sort_order
) VALUES
  ('d6803000-0000-4000-8000-000000000001', NULL, 'd6802000-0000-4000-8000-000000000001',
   'Web board', 1200, 800, '#FAF8F5', '[]'::jsonb, 'active', 0);

INSERT INTO public.board_deck_imports (id, board_id, created_by, source_format, file_sha256, file_name, status)
VALUES ('d6807000-0000-4000-8000-000000000001', 'd6803000-0000-4000-8000-000000000001',
        'd6800000-0000-4000-8000-000000000001', 'deck', repeat('e1', 32), 'Web.pptx', 'ready');

-- 1 not found · 2 found by its link · 3 kept
INSERT INTO public.board_deck_import_items (id, import_id, element_key, role, state, found_by, candidates)
VALUES
  ('d6808000-0000-4000-8000-000000000001', 'd6807000-0000-4000-8000-000000000001', 's1:p1', 'product',
   'not_found', NULL, '[]'::jsonb),
  ('d6808000-0000-4000-8000-000000000002', 'd6807000-0000-4000-8000-000000000001', 's1:p2', 'product',
   'found', 'link',
   '[{"source":"link","extracted":{"source_url":"https://shop.example/a"},"band":"likely","rank":1,"evidence":{}}]'::jsonb),
  ('d6808000-0000-4000-8000-000000000003', 'd6807000-0000-4000-8000-000000000001', 's1:p3', 'product',
   'kept', 'link',
   '[{"source":"link","extracted":{"source_url":"https://shop.example/k"},"band":"likely","rank":1,"evidence":{}}]'::jsonb);

-- ── 1–4. Consume ────────────────────────────────────────────────────────────
DO $$
DECLARE
  r jsonb;
  studio constant uuid := 'd6801000-0000-4000-8000-000000000001';
  next_month constant timestamptz :=
    (date_trunc('month', now() AT TIME ZONE 'UTC') + interval '1 month') AT TIME ZONE 'UTC';
BEGIN
  ASSERT (SELECT monthly_call_cap FROM public.board_web_match_settings) = 500, 'default cap is 500';

  r := public.consume_board_web_match_budget(studio, 20);
  ASSERT (r->>'granted')::int = 20, format('first grant: %s', r);
  ASSERT (r->>'cost_micros')::bigint = 70000, format('20 calls cost 70000 micros: %s', r);
  ASSERT (SELECT calls FROM public.board_web_match_usage
          WHERE studio_id = studio AND month = date_trunc('month', now() AT TIME ZONE 'UTC')::date) = 20,
    'the ledger holds the calls';

  -- Spend up to 490, then a request for 20 gets the last 10.
  UPDATE public.board_web_match_usage SET calls = 490 WHERE studio_id = studio;
  r := public.consume_board_web_match_budget(studio, 20);
  ASSERT (r->>'granted')::int = 10, format('partial grant at the cap: %s', r);
  ASSERT (r->>'calls')::int = 500, format('cap reached: %s', r);

  r := public.consume_board_web_match_budget(studio, 1);
  ASSERT (r->>'granted')::int = 0, format('denied over the cap: %s', r);
  ASSERT (r->>'resets_at')::timestamptz = next_month, format('resets at the next UTC month: %s', r);

  -- The cap is a settings row.
  UPDATE public.board_web_match_settings SET monthly_call_cap = 502;
  r := public.consume_board_web_match_budget(studio, 5);
  ASSERT (r->>'granted')::int = 2, format('a raised cap grants more: %s', r);

  BEGIN
    PERFORM public.consume_board_web_match_budget(studio, 0);
    RAISE EXCEPTION 'n = 0 must be refused';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    PERFORM public.consume_board_web_match_budget(NULL, 1);
    RAISE EXCEPTION 'a null studio must be refused';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  -- ── 5. An import bills to the importer's studio ──
  ASSERT public.board_web_match_studio_key('d6807000-0000-4000-8000-000000000001') = studio,
    'the import bills to the lead''s studio';
END $$;

-- ── 5b. Web results append to a settled piece (needs 00678) ─────────────────
DO $$
DECLARE
  r jsonb;
  web constant jsonb :=
    '{"source":"web","extracted":{"source_url":"https://www.wayfair.com/cove","name":"Cove sofa"},"band":"likely","rank":2,"evidence":{"web_match":"full"}}';
  linked constant jsonb :=
    '[{"source":"link","extracted":{"source_url":"https://shop.example/a"},"band":"likely","rank":1,"evidence":{}}]';
  v_item public.board_deck_import_items%ROWTYPE;
BEGIN
  -- A piece with nothing becomes found by the web.
  r := public.record_board_web_match_result('d6808000-0000-4000-8000-000000000001',
    jsonb_build_array(jsonb_set(web, '{rank}', '1')), '[]'::jsonb);
  ASSERT (r->>'applied')::boolean, format('appended to the not-found piece: %s', r);
  SELECT * INTO v_item FROM public.board_deck_import_items WHERE id = 'd6808000-0000-4000-8000-000000000001';
  ASSERT v_item.state = 'found' AND v_item.found_by = 'web' AND jsonb_array_length(v_item.candidates) = 1,
    format('found on the web: %s', row_to_json(v_item));

  -- A found piece keeps how it was found; the web row follows its candidates.
  r := public.record_board_web_match_result('d6808000-0000-4000-8000-000000000002',
    linked || jsonb_build_array(web), linked);
  ASSERT (r->>'applied')::boolean, format('appended to the found piece: %s', r);
  SELECT * INTO v_item FROM public.board_deck_import_items WHERE id = 'd6808000-0000-4000-8000-000000000002';
  ASSERT v_item.found_by = 'link' AND v_item.candidates = linked || jsonb_build_array(web),
    format('found_by kept, web appended: %s', row_to_json(v_item));

  -- A stale base (a concurrent search already wrote) is dropped, not merged.
  r := public.record_board_web_match_result('d6808000-0000-4000-8000-000000000002',
    linked || jsonb_build_array(web), linked);
  ASSERT NOT (r->>'applied')::boolean, format('stale base refused: %s', r);

  -- Her decision is never touched.
  r := public.record_board_web_match_result('d6808000-0000-4000-8000-000000000003',
    '[{"source":"link","extracted":{"source_url":"https://shop.example/k"},"band":"likely","rank":1,"evidence":{}}]'::jsonb
      || jsonb_build_array(web),
    '[{"source":"link","extracted":{"source_url":"https://shop.example/k"},"band":"likely","rank":1,"evidence":{}}]'::jsonb);
  ASSERT NOT (r->>'applied')::boolean, format('a kept piece is left alone: %s', r);

  -- Only web rows may be appended, and the base must be kept as it was.
  BEGIN
    PERFORM public.record_board_web_match_result('d6808000-0000-4000-8000-000000000001',
      (SELECT candidates FROM public.board_deck_import_items WHERE id = 'd6808000-0000-4000-8000-000000000001')
        || jsonb_build_array(jsonb_set(jsonb_set(web, '{source}', '"words"'), '{rank}', '2')),
      (SELECT candidates FROM public.board_deck_import_items WHERE id = 'd6808000-0000-4000-8000-000000000001'));
    RAISE EXCEPTION 'a non-web append must be refused';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    PERFORM public.record_board_web_match_result('d6808000-0000-4000-8000-000000000002',
      jsonb_build_array(web, jsonb_set(web, '{rank}', '3')),
      linked);
    RAISE EXCEPTION 'a rewritten base must be refused';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
END $$;

-- ── 6. Studio members read their row ────────────────────────────────────────
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims',
  '{"sub":"d6800000-0000-4000-8000-000000000001","role":"authenticated"}', true);
DO $$
BEGIN
  ASSERT (SELECT count(*) FROM public.board_web_match_usage
          WHERE studio_id = 'd6801000-0000-4000-8000-000000000001') = 1,
    'a studio member reads her studio''s usage';
END $$;

SELECT set_config('request.jwt.claims',
  '{"sub":"d6800000-0000-4000-8000-000000000002","role":"authenticated"}', true);
DO $$
BEGIN
  ASSERT (SELECT count(*) FROM public.board_web_match_usage
          WHERE studio_id = 'd6801000-0000-4000-8000-000000000001') = 0,
    'another studio does not read it';
END $$;
RESET ROLE;

-- ── 7. Client roles are locked out ──────────────────────────────────────────
DO $$
DECLARE fn text;
BEGIN
  FOREACH fn IN ARRAY ARRAY[
    'public.consume_board_web_match_budget(uuid,integer)',
    'public.board_web_match_studio_key(uuid)',
    'public.record_board_web_match_result(uuid,jsonb,jsonb)'
  ] LOOP
    ASSERT NOT has_function_privilege('authenticated', fn, 'EXECUTE'), fn || ' must not be callable by authenticated';
    ASSERT NOT has_function_privilege('anon', fn, 'EXECUTE'), fn || ' must not be callable by anon';
    ASSERT has_function_privilege('service_role', fn, 'EXECUTE'), fn || ' must be callable by service_role';
  END LOOP;
  ASSERT NOT has_table_privilege('authenticated', 'public.board_web_match_usage', 'INSERT'),
    'clients cannot write the ledger';
  ASSERT NOT has_table_privilege('authenticated', 'public.board_web_match_usage', 'UPDATE'),
    'clients cannot change the ledger';
  ASSERT NOT has_table_privilege('anon', 'public.board_web_match_usage', 'SELECT'),
    'anon cannot read the ledger';
  ASSERT NOT has_table_privilege('authenticated', 'public.board_web_match_settings', 'SELECT'),
    'clients cannot read the settings';
  ASSERT NOT has_table_privilege('authenticated', 'public.board_web_match_settings', 'UPDATE'),
    'clients cannot change the cap';
END $$;

ROLLBACK;
