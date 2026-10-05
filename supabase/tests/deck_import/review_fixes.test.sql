-- Bring in a Deck — 00682 review fixes (SQ-372, the SQ-371 review findings).
--   N2  release_board_deck_import_items: only the lease owner's live rows are
--       handed back; the claim's attempt is refunded once; the piece is
--       claimable again at once
--   N4  web match bills the BOARD's studio (recorded project studio, else the
--       board designer's studio, preferring one the importer shares), not the
--       importer's earliest studio; the link quota keeps the 00677 key
--   N5  the shop filter's vendor list is the studio's vendors + catalog
--       vendors, every matching row, in a fixed order
--   N6  keep onto a plain pin: the second import is refused pin_taken (the
--       sequential case), and the pin row is locked before the check
--   ACL client roles cannot call the new service RPCs
-- Not covered here: two truly concurrent keeps need two sessions; the lock
-- itself is probed in the function body.
-- Run after a fresh reset:
--   psql 'postgresql://postgres:postgres@127.0.0.1:54322/postgres' \
--     -v ON_ERROR_STOP=1 -f supabase/tests/deck_import/review_fixes.test.sql

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

CREATE OR REPLACE FUNCTION pg_temp.expect_error(p_sql text, p_state text, p_hint text, p_label text)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_state text;
  v_hint text;
BEGIN
  BEGIN
    EXECUTE p_sql;
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_state = RETURNED_SQLSTATE, v_hint = PG_EXCEPTION_HINT;
    IF v_state <> p_state OR (p_hint IS NOT NULL AND v_hint IS DISTINCT FROM p_hint) THEN
      RAISE EXCEPTION '%: expected % / %, got % / %', p_label, p_state, p_hint, v_state, v_hint;
    END IF;
    RETURN;
  END;
  RAISE EXCEPTION '%: expected an error, none raised', p_label;
END;
$$;

-- ── Fixtures ────────────────────────────────────────────────────────────────
-- U importer (studio A since January, studio B since June)
-- D designer (studio B only) · E designer (A since January, B since June)
-- V importer (studio B only)

INSERT INTO auth.users (
  id, email, encrypted_password, email_confirmed_at, created_at, updated_at,
  instance_id, aud, role
)
VALUES
  ('d6820000-0000-4000-8000-000000000001', 'review-u@test.invalid', '', now(), now(), now(),
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('d6820000-0000-4000-8000-000000000002', 'review-d@test.invalid', '', now(), now(), now(),
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('d6820000-0000-4000-8000-000000000003', 'review-e@test.invalid', '', now(), now(), now(),
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('d6820000-0000-4000-8000-000000000004', 'review-v@test.invalid', '', now(), now(), now(),
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');

INSERT INTO public.profiles (id, email, full_name, created_at, updated_at)
VALUES
  ('d6820000-0000-4000-8000-000000000001', 'review-u@test.invalid', 'Review U', now(), now()),
  ('d6820000-0000-4000-8000-000000000002', 'review-d@test.invalid', 'Review D', now(), now()),
  ('d6820000-0000-4000-8000-000000000003', 'review-e@test.invalid', 'Review E', now(), now()),
  ('d6820000-0000-4000-8000-000000000004', 'review-v@test.invalid', 'Review V', now(), now())
ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email, full_name = EXCLUDED.full_name;

INSERT INTO public.organizations (id, type, name, slug, status)
VALUES
  ('d6821000-0000-4000-8000-00000000000a', 'design_studio', 'Review A', 'review-a-test', 'active'),
  ('d6821000-0000-4000-8000-00000000000b', 'design_studio', 'Review B', 'review-b-test', 'active');

-- Owners first: the membership guard wants a studio's owner before its members.
INSERT INTO public.organization_members (user_id, organization_id, role, status, joined_at)
VALUES
  ('d6820000-0000-4000-8000-000000000001', 'd6821000-0000-4000-8000-00000000000a', 'owner', 'active', '2026-01-01'),
  ('d6820000-0000-4000-8000-000000000002', 'd6821000-0000-4000-8000-00000000000b', 'owner', 'active', '2026-02-01');

INSERT INTO public.organization_members (user_id, organization_id, role, status, joined_at)
VALUES
  ('d6820000-0000-4000-8000-000000000001', 'd6821000-0000-4000-8000-00000000000b', 'member', 'active', '2026-06-01'),
  ('d6820000-0000-4000-8000-000000000003', 'd6821000-0000-4000-8000-00000000000a', 'member', 'active', '2026-01-01'),
  ('d6820000-0000-4000-8000-000000000003', 'd6821000-0000-4000-8000-00000000000b', 'member', 'active', '2026-06-01'),
  ('d6820000-0000-4000-8000-000000000004', 'd6821000-0000-4000-8000-00000000000b', 'member', 'active', '2026-03-01');

-- P1: D's job, no recorded studio · P2: U's job, recorded studio B ·
-- P3: E's job, no recorded studio · Q: D's proposal, no project
INSERT INTO public.projects (id, designer_id, client_id, created_by, name, status, studio_id)
VALUES
  ('d6822000-0000-4000-8000-000000000001', 'd6820000-0000-4000-8000-000000000002', NULL,
   'd6820000-0000-4000-8000-000000000002', 'Review P1', 'active', NULL),
  ('d6822000-0000-4000-8000-000000000002', 'd6820000-0000-4000-8000-000000000001', NULL,
   'd6820000-0000-4000-8000-000000000001', 'Review P2', 'active', 'd6821000-0000-4000-8000-00000000000b'),
  ('d6822000-0000-4000-8000-000000000003', 'd6820000-0000-4000-8000-000000000003', NULL,
   'd6820000-0000-4000-8000-000000000003', 'Review P3', 'active', NULL);

INSERT INTO public.proposals (id, designer_id, title)
VALUES ('d6822100-0000-4000-8000-000000000001', 'd6820000-0000-4000-8000-000000000002', 'Review Q');

INSERT INTO public.proposal_boards (
  id, proposal_id, project_id, name, canvas_width, canvas_height,
  background_color, sections, status, sort_order
) VALUES
  ('d6823000-0000-4000-8000-000000000001', NULL, 'd6822000-0000-4000-8000-000000000001',
   'Review board P1', 1200, 800, '#FAF8F5', '[]'::jsonb, 'active', 0),
  ('d6823000-0000-4000-8000-000000000002', 'd6822100-0000-4000-8000-000000000001', NULL,
   'Review board Q', 1200, 800, '#FAF8F5', '[]'::jsonb, 'active', 0),
  ('d6823000-0000-4000-8000-000000000003', NULL, 'd6822000-0000-4000-8000-000000000002',
   'Review board P2', 1200, 800, '#FAF8F5', '[]'::jsonb, 'active', 0),
  ('d6823000-0000-4000-8000-000000000004', NULL, 'd6822000-0000-4000-8000-000000000003',
   'Review board P3', 1200, 800, '#FAF8F5', '[]'::jsonb, 'active', 0);

-- The N6 plain pin on board P1.
INSERT INTO public.proposal_board_items (
  id, board_id, type, x, y, width, height, z_index, rotation, content, data
) VALUES
  ('d6824000-0000-4000-8000-000000000001', 'd6823000-0000-4000-8000-000000000001',
   'capture', 10, 10, 200, 200, 0, 0, NULL, '{"provenance":"imported_deck"}'::jsonb);

-- I1/I6: U's imports on P1 · I2: U on Q · I3: U on P2 · I4: V on P3 · IR: release
INSERT INTO public.board_deck_imports (id, board_id, created_by, source_format, file_sha256, file_name, links, status)
VALUES
  ('d6827000-0000-4000-8000-000000000001', 'd6823000-0000-4000-8000-000000000001',
   'd6820000-0000-4000-8000-000000000001', 'deck', repeat('f1', 32), 'I1.pptx', '{}'::jsonb, 'resolving'),
  ('d6827000-0000-4000-8000-000000000002', 'd6823000-0000-4000-8000-000000000002',
   'd6820000-0000-4000-8000-000000000001', 'deck', repeat('f2', 32), 'I2.pptx', '{}'::jsonb, 'ready'),
  ('d6827000-0000-4000-8000-000000000003', 'd6823000-0000-4000-8000-000000000003',
   'd6820000-0000-4000-8000-000000000001', 'deck', repeat('f3', 32), 'I3.pptx', '{}'::jsonb, 'ready'),
  ('d6827000-0000-4000-8000-000000000004', 'd6823000-0000-4000-8000-000000000004',
   'd6820000-0000-4000-8000-000000000004', 'deck', repeat('f4', 32), 'I4.pptx', '{}'::jsonb, 'ready'),
  ('d6827000-0000-4000-8000-000000000006', 'd6823000-0000-4000-8000-000000000001',
   'd6820000-0000-4000-8000-000000000001', 'deck', repeat('f6', 32), 'I6.pptx', '{}'::jsonb, 'resolving'),
  ('d6827000-0000-4000-8000-0000000000ee', 'd6823000-0000-4000-8000-000000000003',
   'd6820000-0000-4000-8000-000000000001', 'deck', repeat('fe', 32), 'IR.pptx', '{}'::jsonb, 'resolving');

INSERT INTO public.products (id, name, layer, price_retail, source_url, captured_at)
VALUES ('d6826000-0000-4000-8000-000000000001', 'Review catalog lamp', 'catalog', 20000,
        'https://catalog.example/review-lamp', now());

INSERT INTO public.board_deck_import_items (
  id, import_id, element_key, board_item_id, slide_index, role, extracted, state, found_by, candidates, attempts
) VALUES
  -- N6: a link piece in each of two imports on one board, neither with a pin.
  ('d6828000-0000-4000-8000-000000000001', 'd6827000-0000-4000-8000-000000000001', 'link:x',
   NULL, 0, 'product', '{}'::jsonb, 'found', 'link',
   jsonb_build_array(jsonb_build_object(
     'source', 'link_existing', 'band', 'strong', 'rank', 1, 'evidence', '{}'::jsonb,
     'product_id', 'd6826000-0000-4000-8000-000000000001')), 0),
  ('d6828000-0000-4000-8000-000000000002', 'd6827000-0000-4000-8000-000000000006', 'link:y',
   NULL, 0, 'product', '{}'::jsonb, 'found', 'link',
   jsonb_build_array(jsonb_build_object(
     'source', 'link_existing', 'band', 'strong', 'rank', 1, 'evidence', '{}'::jsonb,
     'product_id', 'd6826000-0000-4000-8000-000000000001')), 0),
  -- N2: two pending pieces, each tried twice before.
  ('d682800e-0000-4000-8000-000000000001', 'd6827000-0000-4000-8000-0000000000ee', 's1:p1',
   NULL, 1, 'product', '{}'::jsonb, 'pending', NULL, '[]'::jsonb, 2),
  ('d682800e-0000-4000-8000-000000000002', 'd6827000-0000-4000-8000-0000000000ee', 's1:p2',
   NULL, 1, 'product', '{}'::jsonb, 'pending', NULL, '[]'::jsonb, 2);

-- ── N2: release hands back untried pieces ───────────────────────────────────
DO $$
DECLARE
  p1 constant uuid := 'd682800e-0000-4000-8000-000000000001';
  p2 constant uuid := 'd682800e-0000-4000-8000-000000000002';
  r jsonb;
  v_owner text;
  n integer;
  v_item public.board_deck_import_items%ROWTYPE;
BEGIN
  r := public.claim_board_deck_import_items_for_import('d6827000-0000-4000-8000-0000000000ee', 8);
  v_owner := r->>'lease_owner';
  ASSERT jsonb_array_length(r->'items') = 2, format('both pieces claimed: %s', r);
  ASSERT (SELECT attempts FROM public.board_deck_import_items WHERE id = p1) = 3, 'the claim adds an attempt';

  -- Another run's owner touches nothing.
  n := public.release_board_deck_import_items('not-the-owner', ARRAY[p1, p2]);
  ASSERT n = 0, format('a foreign owner releases nothing: %s', n);
  SELECT * INTO v_item FROM public.board_deck_import_items WHERE id = p1;
  ASSERT v_item.attempts = 3 AND v_item.lease_owner = v_owner,
    format('a foreign release leaves lease and attempts: %s', row_to_json(v_item));

  -- The owner hands back p1: lease cleared, attempt refunded, not backed off.
  n := public.release_board_deck_import_items(v_owner, ARRAY[p1]);
  ASSERT n = 1, format('the owner releases p1: %s', n);
  SELECT * INTO v_item FROM public.board_deck_import_items WHERE id = p1;
  ASSERT v_item.attempts = 2 AND v_item.lease_owner IS NULL AND v_item.lease_until IS NULL
     AND v_item.next_attempt_at IS NULL AND v_item.state = 'pending',
    format('p1 is back as it was before the claim: %s', row_to_json(v_item));
  ASSERT (SELECT lease_owner FROM public.board_deck_import_items WHERE id = p2) = v_owner,
    'p2 was not named and stays leased';

  -- No double refund once the lease is gone.
  n := public.release_board_deck_import_items(v_owner, ARRAY[p1]);
  ASSERT n = 0 AND (SELECT attempts FROM public.board_deck_import_items WHERE id = p1) = 2,
    'a second release refunds nothing';

  -- An expired lease is the claim sweep's, not the release's.
  UPDATE public.board_deck_import_items SET lease_until = now() - interval '1 second' WHERE id = p2;
  n := public.release_board_deck_import_items(v_owner, ARRAY[p2]);
  ASSERT n = 0 AND (SELECT attempts FROM public.board_deck_import_items WHERE id = p2) = 3,
    'an expired lease is not released';

  -- Attempts never go below zero.
  UPDATE public.board_deck_import_items
  SET lease_owner = v_owner, lease_until = now() + interval '1 minute', attempts = 0 WHERE id = p2;
  n := public.release_board_deck_import_items(v_owner, ARRAY[p2]);
  ASSERT n = 1 AND (SELECT attempts FROM public.board_deck_import_items WHERE id = p2) = 0,
    'attempts floor at zero';

  PERFORM pg_temp.expect_error(
    $q$SELECT public.release_board_deck_import_items(NULL, ARRAY['d682800e-0000-4000-8000-000000000001'::uuid])$q$,
    '55P03', NULL, 'a missing owner is refused');

  -- The released piece is claimable again at once.
  r := public.claim_board_deck_import_items_for_import('d6827000-0000-4000-8000-0000000000ee', 8);
  ASSERT r->'items' @> jsonb_build_array(jsonb_build_object('item_id', p1)),
    format('p1 is claimed again on the next run: %s', r);
END $$;

-- ── N4: web match bills the board's studio ──────────────────────────────────
DO $$
DECLARE
  studio_a constant uuid := 'd6821000-0000-4000-8000-00000000000a';
  studio_b constant uuid := 'd6821000-0000-4000-8000-00000000000b';
  r jsonb;
BEGIN
  -- The SQ-371 failing input: U (A first, then B) imports onto B's board.
  ASSERT public._board_deck_import_studio_key('d6827000-0000-4000-8000-000000000001') = studio_a,
    'the 00677 link-quota key is still the importer''s earliest studio';
  ASSERT public.board_web_match_studio_key('d6827000-0000-4000-8000-000000000001') = studio_b,
    'N4: a project board bills its designer''s studio B, not the importer''s A';
  ASSERT public.board_web_match_studio_key('d6827000-0000-4000-8000-000000000002') = studio_b,
    'N4: a proposal board bills its designer''s studio B';
  ASSERT public.board_web_match_studio_key('d6827000-0000-4000-8000-000000000003') = studio_b,
    'N4: a recorded project studio wins over the importer''s earliest studio';
  ASSERT public.board_web_match_studio_key('d6827000-0000-4000-8000-000000000004') = studio_b,
    'N4: of the designer''s studios, the one the importer shares is billed';

  -- B's searches spend B's budget; A is untouched.
  r := public.consume_board_web_match_budget(
    public.board_web_match_studio_key('d6827000-0000-4000-8000-000000000001'), 3);
  ASSERT (r->>'granted')::int = 3, format('granted: %s', r);
  ASSERT (SELECT calls FROM public.board_web_match_usage WHERE studio_id = studio_b) = 3,
    'B''s ledger holds the calls';
  ASSERT NOT EXISTS (SELECT 1 FROM public.board_web_match_usage WHERE studio_id = studio_a),
    'A is not charged for B''s board';
END $$;

-- ── N5: the studio's vendors and catalog vendors, every row ─────────────────
INSERT INTO public.vendors (id, name, website, is_patina_catalog, created_at)
VALUES
  ('d6825000-0000-4000-8000-000000000001', 'Review Catalog Co', 'https://review-catalog.test', true, '2020-01-01'),
  ('d6825000-0000-4000-8000-000000000002', 'Review B Maker', 'review-b-maker.test', false, '2020-01-02'),
  ('d6825000-0000-4000-8000-000000000003', 'Review A Maker', 'review-a-maker.test', false, '2020-01-03'),
  ('d6825000-0000-4000-8000-000000000004', 'Review Poison', 'com', false, '2020-01-04'),
  ('d6825000-0000-4000-8000-000000000005', 'Review No Site', '  ', true, '2020-01-05');

-- Studio-layer products carry the 00159-era required metadata.
INSERT INTO public.products (
  id, name, layer, studio_id, vendor_id, price_retail, captured_at,
  vendor_contact, lead_time_weeks, payment_terms, category, usage_notes
)
VALUES
  ('d6826000-0000-4000-8000-0000000000b1', 'Review B chair', 'studio', 'd6821000-0000-4000-8000-00000000000b',
   'd6825000-0000-4000-8000-000000000002', 1000, now(), '{}'::jsonb, 4, 'net_30', 'seating', 'test'),
  ('d6826000-0000-4000-8000-0000000000a1', 'Review A chair', 'studio', 'd6821000-0000-4000-8000-00000000000a',
   'd6825000-0000-4000-8000-000000000003', 1000, now(), '{}'::jsonb, 4, 'net_30', 'seating', 'test');

DO $$
DECLARE
  r jsonb;
  names text[];
  expected jsonb;
BEGIN
  r := public.board_web_match_vendor_websites('d6821000-0000-4000-8000-00000000000b');
  SELECT array_agg(value->>'name') INTO names FROM jsonb_array_elements(r);
  ASSERT 'Review Catalog Co' = ANY(names), 'N5: catalog vendors count';
  ASSERT 'Review B Maker' = ANY(names), 'N5: the studio''s own vendors count';
  ASSERT NOT ('Review A Maker' = ANY(names)), 'N5: another studio''s vendor does not';
  ASSERT NOT ('Review Poison' = ANY(names)), 'N5: an unlinked vendor (website ''com'') does not';
  ASSERT NOT ('Review No Site' = ANY(names)), 'N5: a blank website is skipped';

  -- Every matching row, oldest first: nothing capped, nothing reordered.
  SELECT COALESCE(jsonb_agg(jsonb_build_object('name', v.name, 'website', v.website)
                            ORDER BY v.created_at ASC NULLS LAST, v.id), '[]'::jsonb)
  INTO expected
  FROM public.vendors AS v
  WHERE NULLIF(btrim(v.website), '') IS NOT NULL
    AND (v.is_patina_catalog OR EXISTS (
      SELECT 1 FROM public.products AS p
      WHERE p.vendor_id = v.id AND p.studio_id = 'd6821000-0000-4000-8000-00000000000b'));
  ASSERT r = expected, 'N5: the full, ordered list';
END $$;

-- ── N6: one plain pin, two imports ──────────────────────────────────────────
DO $$
DECLARE
  r jsonb;
  v_def text;
BEGIN
  PERFORM pg_temp.act_as('d6820000-0000-4000-8000-000000000002');
  r := public.keep_board_deck_import_item('d6828000-0000-4000-8000-000000000001', 1, NULL,
    'd6824000-0000-4000-8000-000000000001');
  ASSERT (r->>'board_item_id')::uuid = 'd6824000-0000-4000-8000-000000000001',
    format('N6: import X takes the free pin: %s', r);
  PERFORM pg_temp.expect_error(
    $q$SELECT public.keep_board_deck_import_item('d6828000-0000-4000-8000-000000000002', 1, NULL,
         'd6824000-0000-4000-8000-000000000001')$q$,
    '23514', 'pin_taken', 'N6: import Y is refused the pin X took');

  -- The race guard: the pin row is locked before the pin_taken check.
  v_def := pg_get_functiondef(
    'public._board_deck_import_choose(uuid, integer, uuid, text, uuid)'::regprocedure);
  ASSERT position('FROM public.proposal_board_items WHERE id = p_board_item_id FOR UPDATE' IN v_def) > 0
     AND position('FROM public.proposal_board_items WHERE id = p_board_item_id FOR UPDATE' IN v_def)
         < position('pin_taken' IN v_def),
    'N6: the pin is locked FOR UPDATE before the pin_taken check';
END $$;

-- ── ACL: the new service RPCs are not client-callable ───────────────────────
DO $$
BEGIN
  ASSERT NOT has_function_privilege('authenticated',
    'public.release_board_deck_import_items(text, uuid[])', 'EXECUTE'), 'release: no authenticated';
  ASSERT NOT has_function_privilege('anon',
    'public.release_board_deck_import_items(text, uuid[])', 'EXECUTE'), 'release: no anon';
  ASSERT NOT has_function_privilege('authenticated',
    'public.board_web_match_vendor_websites(uuid)', 'EXECUTE'), 'vendor websites: no authenticated';
  ASSERT NOT has_function_privilege('anon',
    'public.board_web_match_vendor_websites(uuid)', 'EXECUTE'), 'vendor websites: no anon';
  ASSERT has_function_privilege('service_role',
    'public.release_board_deck_import_items(text, uuid[])', 'EXECUTE'), 'release: service_role';
  ASSERT has_function_privilege('service_role',
    'public.board_web_match_vendor_websites(uuid)', 'EXECUTE'), 'vendor websites: service_role';
END $$;

ROLLBACK;
