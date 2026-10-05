-- Bring in a Deck — resolver quota, matching and dispatch (00677, US-15 W3).
--   1. URL normalization (parity with links.ts normalizeProductUrl)
--   2. link quota: 300 per import, partial grant, denial; 1500 per studio-day
--   3. T0a / T0c / T1 match only what the importer can see (00152 rules)
--   4. unpaired links become pin-less pieces once; a ready import reopens
--   5. pairing a link row to a picture; stale pairs are refused
--   6. adjudication: ≤1 call per slide, cached on re-run
--   7. dispatch billing guard: no claimable piece → no job_runs row, no request;
--      a claimable piece → one row and one invoke with {job_run_id}
--   8. client roles cannot call the service RPCs or read the ledgers
-- Run after a fresh reset:
--   psql 'postgresql://postgres:postgres@127.0.0.1:54322/postgres' \
--     -v ON_ERROR_STOP=1 -f supabase/tests/deck_import/resolve_dispatch.test.sql

BEGIN;

SET LOCAL statement_timeout = '30s';

-- ── Fixtures ────────────────────────────────────────────────────────────────
-- 01 lead (studio A) · 02 foreign designer (studio B)

INSERT INTO auth.users (
  id, email, encrypted_password, email_confirmed_at, created_at, updated_at,
  instance_id, aud, role
)
VALUES
  ('d6770000-0000-4000-8000-000000000001', 'resolve-lead@test.invalid', '', now(), now(), now(),
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('d6770000-0000-4000-8000-000000000002', 'resolve-foreign@test.invalid', '', now(), now(), now(),
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');

INSERT INTO public.profiles (id, email, full_name, created_at, updated_at)
VALUES
  ('d6770000-0000-4000-8000-000000000001', 'resolve-lead@test.invalid', 'Resolve Lead', now(), now()),
  ('d6770000-0000-4000-8000-000000000002', 'resolve-foreign@test.invalid', 'Resolve Foreign', now(), now())
ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email, full_name = EXCLUDED.full_name;

INSERT INTO public.organizations (id, type, name, slug, status)
VALUES
  ('d6771000-0000-4000-8000-000000000001', 'design_studio', 'Resolve Studio', 'resolve-studio-test', 'active'),
  ('d6771000-0000-4000-8000-000000000002', 'design_studio', 'Resolve Foreign', 'resolve-foreign-test', 'active');

INSERT INTO public.organization_members (user_id, organization_id, role, status, joined_at)
VALUES
  ('d6770000-0000-4000-8000-000000000001', 'd6771000-0000-4000-8000-000000000001', 'owner', 'active', now()),
  ('d6770000-0000-4000-8000-000000000002', 'd6771000-0000-4000-8000-000000000002', 'owner', 'active', now());

INSERT INTO public.projects (id, designer_id, client_id, created_by, name, status)
VALUES ('d6772000-0000-4000-8000-000000000001', 'd6770000-0000-4000-8000-000000000001', NULL,
        'd6770000-0000-4000-8000-000000000001', 'Resolve project', 'active'),
       ('d6772000-0000-4000-8000-000000000002', 'd6770000-0000-4000-8000-000000000002', NULL,
        'd6770000-0000-4000-8000-000000000002', 'Resolve foreign project', 'active');

INSERT INTO public.proposal_boards (
  id, proposal_id, project_id, name, canvas_width, canvas_height,
  background_color, sections, status, sort_order
) VALUES
  ('d6773000-0000-4000-8000-000000000001', NULL, 'd6772000-0000-4000-8000-000000000001',
   'Resolve board', 1200, 800, '#FAF8F5', '[]'::jsonb, 'active', 0),
  ('d6773000-0000-4000-8000-000000000002', NULL, 'd6772000-0000-4000-8000-000000000001',
   'Resolve board two', 1200, 800, '#FAF8F5', '[]'::jsonb, 'active', 1),
  -- The foreign designer imports onto their own studio's board: since 00683
  -- studio candidates come from the board's studio.
  ('d6773000-0000-4000-8000-000000000003', NULL, 'd6772000-0000-4000-8000-000000000002',
   'Resolve foreign board', 1200, 800, '#FAF8F5', '[]'::jsonb, 'active', 0);

-- The crops point at a storage path no live board owns; the media-reference
-- guard (not under test here) is bypassed for these two fixture rows only.
SET LOCAL session_replication_role = replica;
INSERT INTO public.proposal_board_items (
  id, board_id, type, x, y, width, height, z_index, rotation, content, data, image_url
) VALUES
  ('d6774000-0000-4000-8000-000000000001', 'd6773000-0000-4000-8000-000000000001',
   'image', 10, 10, 200, 200, 0, 0, NULL, '{}'::jsonb,
   'https://example.supabase.co/storage/v1/object/public/proposal-mood-boards/x/boards/y/crop1.jpg'),
  ('d6774000-0000-4000-8000-000000000002', 'd6773000-0000-4000-8000-000000000001',
   'image', 220, 10, 200, 200, 1, 0, NULL, '{}'::jsonb,
   'https://example.supabase.co/storage/v1/object/public/proposal-mood-boards/x/boards/y/crop2.jpg');
SET LOCAL session_replication_role = origin;

INSERT INTO public.vendors (id, name, website)
VALUES ('d6775000-0000-4000-8000-000000000001', 'Resolve Maker Co', 'https://www.resolvemaker.example');

-- catalog (everyone) · studio A · personal (lead) · studio B (foreign only)
INSERT INTO public.products (
  id, name, layer, owner_user_id, studio_id, price_retail, source_url, vendor_id, vendor_sku, captured_at
) VALUES
  ('d6776000-0000-4000-8000-000000000001', 'Zephyrine catalog sofa', 'catalog', NULL, NULL, 100000,
   'https://resolvemaker.example/products/zephyrine-sofa', 'd6775000-0000-4000-8000-000000000001', 'ZS-100', now()),
  ('d6776000-0000-4000-8000-000000000003', 'Zephyrine personal rug', 'personal',
   'd6770000-0000-4000-8000-000000000001', NULL, 30000,
   'https://resolvemaker.example/products/zephyrine-rug', 'd6775000-0000-4000-8000-000000000001', 'ZR-300', now());

INSERT INTO public.products (
  id, name, layer, studio_id, price_retail, source_url, vendor_id, vendor_sku, captured_at,
  vendor_contact, lead_time_weeks, payment_terms, category, usage_notes
) VALUES
  ('d6776000-0000-4000-8000-000000000002', 'Zephyrine studio lamp', 'studio',
   'd6771000-0000-4000-8000-000000000001', 20000,
   'https://resolvemaker.example/products/zephyrine-lamp', 'd6775000-0000-4000-8000-000000000001', 'ZL-200', now(),
   '{}'::jsonb, 4, 'fifty_fifty', 'lighting', 'test'),
  ('d6776000-0000-4000-8000-000000000004', 'Zephyrine foreign chair', 'studio',
   'd6771000-0000-4000-8000-000000000002', 40000,
   'https://resolvemaker.example/products/zephyrine-chair', 'd6775000-0000-4000-8000-000000000001', 'ZC-400', now(),
   '{}'::jsonb, 4, 'fifty_fifty', 'seating', 'test');

-- Imports written directly (the 00676 register path is covered by schema.test.sql).
INSERT INTO public.board_deck_imports (id, board_id, created_by, source_format, file_sha256, file_name, links, status)
VALUES
  ('d6777000-0000-4000-8000-000000000001', 'd6773000-0000-4000-8000-000000000001',
   'd6770000-0000-4000-8000-000000000001', 'deck', repeat('c1', 32), 'Lead.pptx',
   jsonb_build_object(
     'deck_links', jsonb_build_array(
       jsonb_build_object('url', 'https://www.shop.example/products/deck-sofa?utm_source=deck', 'source', 'notes'),
       jsonb_build_object('url', 'https://shop.example/products/slide-rug/', 'source', 'notes')),
     'slide_links', jsonb_build_array(jsonb_build_object('slide_index', 2, 'unpaired_links', jsonb_build_array(
       jsonb_build_object('url', 'https://shop.example/products/slide-rug', 'source', 'legend'),
       jsonb_build_object('url', 'mailto:someone@example.com', 'source', 'text'))))),
   'ready'),
  ('d6777000-0000-4000-8000-000000000002', 'd6773000-0000-4000-8000-000000000002',
   'd6770000-0000-4000-8000-000000000001', 'deck', repeat('c2', 32), 'Second.pptx', '{}'::jsonb, 'resolving'),
  ('d6777000-0000-4000-8000-000000000003', 'd6773000-0000-4000-8000-000000000003',
   'd6770000-0000-4000-8000-000000000002', 'deck', repeat('c3', 32), 'Foreign.pptx', '{}'::jsonb, 'resolving');

INSERT INTO public.board_deck_import_items (id, import_id, element_key, board_item_id, slide_index, role, extracted, state)
VALUES
  ('d6778000-0000-4000-8000-000000000001', 'd6777000-0000-4000-8000-000000000001', 's3:pic1',
   'd6774000-0000-4000-8000-000000000001', 2, 'product', '{}'::jsonb, 'not_found'),
  ('d6778000-0000-4000-8000-000000000002', 'd6777000-0000-4000-8000-000000000001', 's3:pic2',
   'd6774000-0000-4000-8000-000000000002', 2, 'product',
   '{"links":[{"url":"https://own.example/p/1"}]}'::jsonb, 'not_found');

-- 00678 F7: quota and adjudication writes need a live lease on some piece of
-- the import. One leased holder piece per import, owner 'rd'.
INSERT INTO public.board_deck_import_items (
  import_id, element_key, slide_index, role, extracted, state, lease_owner, lease_until
)
SELECT id, 'holder', 0, 'product', '{}'::jsonb, 'pending', 'rd', now() + interval '1 hour'
FROM public.board_deck_imports
WHERE id IN ('d6777000-0000-4000-8000-000000000001', 'd6777000-0000-4000-8000-000000000002',
             'd6777000-0000-4000-8000-000000000003');

CREATE TEMP TABLE resolve_ctx (k text PRIMARY KEY, v jsonb) ON COMMIT DROP;

-- ── 1. Normalization ────────────────────────────────────────────────────────
DO $$
BEGIN
  ASSERT public._board_deck_import_normalize_url(
    'HTTP://WWW.Shop.Example/Products/Sofa/?utm_source=x&color=blue&gclid=1&ref=pin#top')
    = 'https://shop.example/Products/Sofa?color=blue', 'normalize must match links.ts';
  ASSERT public._board_deck_import_normalize_url('https://shop.example') = 'https://shop.example/',
    'a bare host normalizes to /';
  ASSERT public._board_deck_import_normalize_url('https://shop.example/a?utm_medium=x') = 'https://shop.example/a',
    'a query of only tracking params disappears';
  ASSERT public._board_deck_import_normalize_url('mailto:a@b.c') IS NULL, 'non-http is null';
END $$;

-- ── 2. Link quota ───────────────────────────────────────────────────────────
DO $$
DECLARE r jsonb;
BEGIN
  r := public.consume_board_deck_import_link_quota('d6777000-0000-4000-8000-000000000002', 250, 'rd');
  ASSERT (r->>'granted')::int = 250, format('first grant: %s', r);
  r := public.consume_board_deck_import_link_quota('d6777000-0000-4000-8000-000000000002', 100, 'rd');
  ASSERT (r->>'granted')::int = 50, format('partial grant up to 300 per import: %s', r);
  ASSERT (r->>'import_used')::int = 300, format('import_used: %s', r);
  r := public.consume_board_deck_import_link_quota('d6777000-0000-4000-8000-000000000002', 1, 'rd');
  ASSERT (r->>'granted')::int = 0, format('import quota spent: %s', r);
END $$;

-- Studio-day cap: the lead's studio has used 300 today; push it to 1450 and
-- a fresh import of the same studio gets only the last 50.
UPDATE public.board_deck_import_studio_link_days
SET links_used = 1450
WHERE studio_key = 'd6771000-0000-4000-8000-000000000001'
  AND day = (now() AT TIME ZONE 'UTC')::date;

DO $$
DECLARE r jsonb;
BEGIN
  r := public.consume_board_deck_import_link_quota('d6777000-0000-4000-8000-000000000001', 200, 'rd');
  ASSERT (r->>'granted')::int = 50, format('studio-day cap 1500: %s', r);
  ASSERT (r->>'studio_used')::int = 1500, format('studio_used: %s', r);
  r := public.consume_board_deck_import_link_quota('d6777000-0000-4000-8000-000000000001', 1, 'rd');
  ASSERT (r->>'granted')::int = 0, format('studio-day quota spent: %s', r);
  -- Another studio is unaffected.
  r := public.consume_board_deck_import_link_quota('d6777000-0000-4000-8000-000000000003', 5, 'rd');
  ASSERT (r->>'granted')::int = 5, format('foreign studio has its own day: %s', r);
  BEGIN
    PERFORM public.consume_board_deck_import_link_quota('d6777000-0000-4000-8000-000000000001', 0, 'rd');
    RAISE EXCEPTION 'n=0 must be refused';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
END $$;

-- ── 3. Matching as the importer ─────────────────────────────────────────────
DO $$
DECLARE
  r jsonb;
  ids text[];
BEGIN
  r := public.board_deck_import_match_links('d6777000-0000-4000-8000-000000000001', ARRAY[
    'https://www.resolvemaker.example/products/zephyrine-sofa/?utm_source=deck',
    'https://resolvemaker.example/products/zephyrine-lamp',
    'https://resolvemaker.example/products/zephyrine-rug',
    'https://resolvemaker.example/products/zephyrine-chair']);
  SELECT array_agg(value->>'product_id' ORDER BY value->>'product_id') INTO ids
  FROM jsonb_array_elements(r->'products');
  ASSERT ids = ARRAY['d6776000-0000-4000-8000-000000000001', 'd6776000-0000-4000-8000-000000000002',
                     'd6776000-0000-4000-8000-000000000003'],
    format('T0a sees catalog, own studio and own personal, never the foreign studio: %s', r);
  ASSERT r->'products'->0->>'product_id' = 'd6776000-0000-4000-8000-000000000003',
    'the importer''s own library ranks first';
  ASSERT r->'vendors'->>'resolvemaker.example' = 'Resolve Maker Co', format('vendor by domain: %s', r);

  -- The foreign designer's import sees the foreign chair and not the lead's rug.
  r := public.board_deck_import_match_links('d6777000-0000-4000-8000-000000000003', ARRAY[
    'https://resolvemaker.example/products/zephyrine-rug',
    'https://resolvemaker.example/products/zephyrine-chair']);
  ASSERT jsonb_array_length(r->'products') = 1
     AND r->'products'->0->>'product_id' = 'd6776000-0000-4000-8000-000000000004',
    format('visibility follows import.created_by: %s', r);

  r := public.board_deck_import_match_sku('d6777000-0000-4000-8000-000000000001', 'zc-400', 'resolve maker co');
  ASSERT r = '[]'::jsonb, 'T0c never returns a foreign studio product';
  r := public.board_deck_import_match_sku('d6777000-0000-4000-8000-000000000001', 'ZL-200', 'Resolve Maker Co');
  ASSERT r->0->>'product_id' = 'd6776000-0000-4000-8000-000000000002', format('T0c sku+vendor: %s', r);
  r := public.board_deck_import_match_sku('d6777000-0000-4000-8000-000000000001', 'ZL-200', 'Other Maker');
  ASSERT r = '[]'::jsonb, 'T0c needs the vendor to match';

  r := public.board_deck_import_search_words('d6777000-0000-4000-8000-000000000001', 'Zephyrine chair', NULL, 10);
  ASSERT NOT (r @> '[{"product_id":"d6776000-0000-4000-8000-000000000004"}]'),
    format('T1 never returns a foreign studio product: %s', r);
  r := public.board_deck_import_search_words('d6777000-0000-4000-8000-000000000001', 'Zephyrine personal rug', 'Resolve Maker Co', 5);
  ASSERT r->0->>'product_id' = 'd6776000-0000-4000-8000-000000000003', format('T1 finds the named rug: %s', r);
  ASSERT (r->0->>'score')::numeric >= 0.6, format('T1 score: %s', r);
END $$;

-- ── 4. Unpaired links become pieces ─────────────────────────────────────────
DO $$
DECLARE
  added integer;
  rows_now integer;
BEGIN
  added := public.materialize_board_deck_import_links('d6777000-0000-4000-8000-000000000001');
  ASSERT added = 2, format('two distinct links (the rug dedupes, mailto drops): %s', added);
  ASSERT (SELECT status FROM public.board_deck_imports WHERE id = 'd6777000-0000-4000-8000-000000000001')
    = 'resolving', 'a ready import reopens while its link rows resolve';
  ASSERT EXISTS (
    SELECT 1 FROM public.board_deck_import_items
    WHERE import_id = 'd6777000-0000-4000-8000-000000000001'
      AND element_key = 'link:' || md5('https://shop.example/products/slide-rug')
      AND slide_index = 2 AND board_item_id IS NULL AND state = 'pending'
      AND (extracted->>'deck_level')::boolean = false
  ), 'the slide copy of a link wins over the deck copy';
  ASSERT EXISTS (
    SELECT 1 FROM public.board_deck_import_items
    WHERE import_id = 'd6777000-0000-4000-8000-000000000001'
      AND element_key = 'link:' || md5('https://shop.example/products/deck-sofa')
      AND (extracted->>'deck_level')::boolean = true
  ), 'a deck link is a deck-level piece';
  added := public.materialize_board_deck_import_links('d6777000-0000-4000-8000-000000000001');
  ASSERT added = 0, 'materialize runs once per import';
  SELECT count(*) INTO rows_now FROM public.board_deck_import_items
  WHERE import_id = 'd6777000-0000-4000-8000-000000000001' AND element_key <> 'holder';
  ASSERT rows_now = 4, format('no duplicate pieces: %s', rows_now);
END $$;

-- ── 5. Pairing by look ──────────────────────────────────────────────────────
DO $$
DECLARE
  pics jsonb;
  link_id uuid;
  candidates jsonb := jsonb_build_array(jsonb_build_object(
    'source', 'link', 'band', 'likely', 'rank', 1,
    'extracted', jsonb_build_object('name', 'Slide rug', 'source_url', 'https://shop.example/products/slide-rug'),
    'evidence', jsonb_build_object('paired_by', 'look')));
BEGIN
  pics := public.board_deck_import_pairable_pictures('d6777000-0000-4000-8000-000000000001');
  ASSERT jsonb_array_length(pics) = 1
     AND pics->0->>'item_id' = 'd6778000-0000-4000-8000-000000000001',
    format('only a picture with no link of its own is pairable: %s', pics);

  SELECT id INTO link_id FROM public.board_deck_import_items
  WHERE import_id = 'd6777000-0000-4000-8000-000000000001'
    AND element_key = 'link:' || md5('https://shop.example/products/slide-rug');
  UPDATE public.board_deck_import_items
  SET lease_owner = 'rd', lease_until = now() + interval '1 hour'
  WHERE id = link_id;
  -- A leased link row is never paired from under its run.
  ASSERT NOT public.pair_board_deck_import_link(link_id, 'd6778000-0000-4000-8000-000000000001', candidates),
    'a leased link row is not paired';
  PERFORM public.record_board_deck_import_resolution(link_id, 'found', 'link', candidates, 'rd');

  ASSERT public.pair_board_deck_import_link(link_id, 'd6778000-0000-4000-8000-000000000001', candidates),
    'a clear pair is applied';
  ASSERT NOT EXISTS (SELECT 1 FROM public.board_deck_import_items WHERE id = link_id),
    'the link row is gone once paired';
  ASSERT (SELECT state || '/' || found_by FROM public.board_deck_import_items
          WHERE id = 'd6778000-0000-4000-8000-000000000001') = 'found/link',
    'the picture carries the link''s product';
  ASSERT NOT public.pair_board_deck_import_link(link_id, 'd6778000-0000-4000-8000-000000000001', candidates),
    'a stale pair is refused';
END $$;

-- ── 6. Adjudication ledger ──────────────────────────────────────────────────
DO $$
DECLARE r jsonb;
BEGIN
  r := public.claim_board_deck_import_adjudication('d6777000-0000-4000-8000-000000000001', 4, 'rd');
  ASSERT r->>'status' = 'granted', format('first claim: %s', r);
  r := public.claim_board_deck_import_adjudication('d6777000-0000-4000-8000-000000000001', 4, 'rd');
  ASSERT r->>'status' = 'denied', format('a slide in flight is not called twice: %s', r);
  PERFORM public.store_board_deck_import_adjudication('d6777000-0000-4000-8000-000000000001', 4,
    '[{"image_element_key":"s5:pic1","text_element_keys":["t1"],"link_ids":[]}]'::jsonb, 'rd');
  r := public.claim_board_deck_import_adjudication('d6777000-0000-4000-8000-000000000001', 4, 'rd');
  ASSERT r->>'status' = 'cached' AND jsonb_array_length(r->'assignments') = 1,
    format('a re-run reuses the answer: %s', r);
  -- 00678 F5: a failed call is tried once more, then no more.
  PERFORM public.store_board_deck_import_adjudication('d6777000-0000-4000-8000-000000000001', 5, NULL, 'rd');
  r := public.claim_board_deck_import_adjudication('d6777000-0000-4000-8000-000000000001', 5, 'rd');
  ASSERT r->>'status' = 'granted', format('a failed call is retried once: %s', r);
  PERFORM public.store_board_deck_import_adjudication('d6777000-0000-4000-8000-000000000001', 5, NULL, 'rd');
  r := public.claim_board_deck_import_adjudication('d6777000-0000-4000-8000-000000000001', 5, 'rd');
  ASSERT r->>'status' = 'denied', format('a second failure is final: %s', r);
  FOR i IN 6..30 LOOP
    r := public.claim_board_deck_import_adjudication('d6777000-0000-4000-8000-000000000001', i, 'rd');
  END LOOP;
  ASSERT r->>'status' = 'denied', format('per-import cap of 20 slides: %s', r);
END $$;

-- ── 7. Dispatch ─────────────────────────────────────────────────────────────
-- Stub the edge bridge inside this transaction so no request leaves the box.
CREATE TEMP TABLE resolve_invocations (fn_name text, body jsonb) ON COMMIT DROP;
CREATE OR REPLACE FUNCTION public.invoke_edge_function(fn_name text, body jsonb DEFAULT '{}'::jsonb)
RETURNS bigint
LANGUAGE sql
AS $$
  INSERT INTO pg_temp.resolve_invocations VALUES (fn_name, body);
  SELECT 42::bigint;
$$;

-- Isolate from other sessions' imports on the shared local database.
UPDATE public.board_deck_imports SET status = 'abandoned'
WHERE status IN ('resolving', 'ready') AND id NOT IN (
  'd6777000-0000-4000-8000-000000000001', 'd6777000-0000-4000-8000-000000000002',
  'd6777000-0000-4000-8000-000000000003');
UPDATE public.board_deck_import_items SET state = 'not_found'
WHERE state = 'pending' AND import_id IN (
  'd6777000-0000-4000-8000-000000000001', 'd6777000-0000-4000-8000-000000000002',
  'd6777000-0000-4000-8000-000000000003');

DO $$
DECLARE
  before_runs integer;
  run_id bigint;
BEGIN
  SELECT count(*) INTO before_runs FROM public.job_runs WHERE job_name = 'board-deck-import-resolve';
  run_id := public.dispatch_board_deck_import_resolve();
  ASSERT run_id IS NULL, 'nothing claimable → no run';
  ASSERT (SELECT count(*) FROM public.job_runs WHERE job_name = 'board-deck-import-resolve') = before_runs,
    'billing guard: no job_runs row';
  ASSERT NOT EXISTS (SELECT 1 FROM pg_temp.resolve_invocations), 'billing guard: no request';

  INSERT INTO public.board_deck_import_items (import_id, element_key, slide_index, role, extracted, state)
  VALUES ('d6777000-0000-4000-8000-000000000002', 's1:pic1', 0, 'product', '{}'::jsonb, 'pending');

  run_id := public.dispatch_board_deck_import_resolve();
  ASSERT run_id IS NOT NULL, 'a claimable piece → a run';
  ASSERT (SELECT status = 'running' AND detail->>'dispatch_state' = 'sent' AND (detail->>'request_id')::bigint = 42
          FROM public.job_runs WHERE id = run_id), 'the run is sent with the request id';
  ASSERT (SELECT count(*) FROM pg_temp.resolve_invocations
          WHERE fn_name = 'board-deck-import-resolve' AND (body->>'job_run_id')::bigint = run_id) = 1,
    'one invoke carrying job_run_id';

  PERFORM public.finish_board_deck_import_resolve_run(run_id, 'succeeded', '{"summary":{"claimed":1}}'::jsonb, NULL, 0.004321);
  ASSERT (SELECT status = 'succeeded' AND cost_usd = 0.00 AND (detail->>'cost_usd_exact')::numeric = 0.004321
          FROM public.job_runs WHERE id = run_id), 'finish records status and cost';
  BEGIN
    PERFORM public.finish_board_deck_import_resolve_run(run_id, 'succeeded', '{}'::jsonb, NULL, NULL);
    RAISE EXCEPTION 'a finished run cannot be finished twice';
  EXCEPTION WHEN no_data_found THEN NULL;
  END;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    ASSERT (SELECT schedule FROM cron.job WHERE jobname = 'board-deck-import-resolve') = '* * * * *',
      'the resolver is scheduled every minute';
  END IF;
END $$;

-- ── 8. Client roles are locked out ──────────────────────────────────────────
DO $$
DECLARE fn text;
BEGIN
  FOREACH fn IN ARRAY ARRAY[
    'public.consume_board_deck_import_link_quota(uuid,integer,text)',
    'public.record_board_deck_import_resolution(uuid,text,text,jsonb,text)',
    'public.claim_board_deck_import_adjudication(uuid,integer,text)',
    'public.store_board_deck_import_adjudication(uuid,integer,jsonb,text)',
    'public.board_deck_import_match_links(uuid,text[])',
    'public.board_deck_import_search_words(uuid,text,text,integer)',
    'public.materialize_board_deck_import_links(uuid)',
    'public.pair_board_deck_import_link(uuid,uuid,jsonb)',
    'public.dispatch_board_deck_import_resolve()',
    'public.claim_board_deck_import_items_for_import(uuid,integer)'
  ] LOOP
    ASSERT NOT has_function_privilege('authenticated', fn, 'EXECUTE'), fn || ' must not be callable by authenticated';
    ASSERT NOT has_function_privilege('anon', fn, 'EXECUTE'), fn || ' must not be callable by anon';
    ASSERT has_function_privilege('service_role', fn, 'EXECUTE'), fn || ' must be callable by service_role';
  END LOOP;
  ASSERT NOT has_table_privilege('authenticated', 'public.board_deck_import_link_usage', 'SELECT'),
    'the usage ledger is not readable by clients';
  ASSERT NOT has_table_privilege('authenticated', 'public.board_deck_import_studio_link_days', 'SELECT'),
    'the studio ledger is not readable by clients';
END $$;

ROLLBACK;
