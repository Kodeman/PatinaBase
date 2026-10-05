-- Bring in a Deck — 00678 hardening (SQ-367, the SQ-366 review findings).
--   F3  a second designer's Keep of the same page mints their own product
--   F4  Keep onto a scheduled pin, or a pin another piece holds, is refused
--   F14 vendors match on exact host (h.example never matches rh.example);
--       the stub vendor is reused, not duplicated
--   F2  a deck-import Keep product placed through promote keeps trade NULL;
--       a non-deck retail-only product still falls back to retail
--   F6  past 200 adjudications a studio-day claim is denied
--   F7  stale or unowned leases cannot record, consume quota or store
--   F5  a pending adjudication older than the lease is reclaimable
--   F8  the global claim takes pieces round-robin across imports
--   F1  the per-import claim backs off an expired lease
--   Fold a link piece kept onto its import's own picture piece merges into it
-- Not covered here: the concurrent stub-vendor insert (ON CONFLICT on
-- idx_vendors_website_lower) needs two sessions; single-session it is the
-- host lookup that finds the row first.
-- Run after a fresh reset:
--   psql 'postgresql://postgres:postgres@127.0.0.1:54322/postgres' \
--     -v ON_ERROR_STOP=1 -f supabase/tests/deck_import/hardening.test.sql

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

-- Asserts p_sql raises p_state (and, when given, HINT p_hint).
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
-- X lead (studio owner) · Y junior (studio member)

INSERT INTO auth.users (
  id, email, encrypted_password, email_confirmed_at, created_at, updated_at,
  instance_id, aud, role
)
VALUES
  ('d6780000-0000-4000-8000-000000000001', 'harden-lead@test.invalid', '', now(), now(), now(),
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('d6780000-0000-4000-8000-000000000002', 'harden-junior@test.invalid', '', now(), now(), now(),
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');

INSERT INTO public.profiles (id, email, full_name, created_at, updated_at)
VALUES
  ('d6780000-0000-4000-8000-000000000001', 'harden-lead@test.invalid', 'Harden Lead', now(), now()),
  ('d6780000-0000-4000-8000-000000000002', 'harden-junior@test.invalid', 'Harden Junior', now(), now())
ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email, full_name = EXCLUDED.full_name;

INSERT INTO public.organizations (id, type, name, slug, status)
VALUES ('d6781000-0000-4000-8000-000000000001', 'design_studio', 'Harden Studio', 'harden-studio-test', 'active');

INSERT INTO public.organization_members (user_id, organization_id, role, status, joined_at)
VALUES
  ('d6780000-0000-4000-8000-000000000001', 'd6781000-0000-4000-8000-000000000001', 'owner', 'active', now()),
  ('d6780000-0000-4000-8000-000000000002', 'd6781000-0000-4000-8000-000000000001', 'member', 'active', now());

INSERT INTO public.projects (id, designer_id, client_id, created_by, name, status)
VALUES ('d6782000-0000-4000-8000-000000000001', 'd6780000-0000-4000-8000-000000000001', NULL,
        'd6780000-0000-4000-8000-000000000001', 'Harden project', 'active');

INSERT INTO public.proposal_boards (
  id, proposal_id, project_id, name, canvas_width, canvas_height,
  background_color, sections, status, sort_order
) VALUES
  ('d6783000-0000-4000-8000-000000000001', NULL, 'd6782000-0000-4000-8000-000000000001',
   'Harden board', 1200, 800, '#FAF8F5', '[]'::jsonb, 'active', 0);

-- pin1: F3's picture · sched: already on the schedule · taken: another
-- import's piece holds it · free: an unclaimed picture.
INSERT INTO public.proposal_board_items (
  id, board_id, type, x, y, width, height, z_index, rotation, content, data
) VALUES
  ('d6784000-0000-4000-8000-000000000001', 'd6783000-0000-4000-8000-000000000001',
   'capture', 10, 10, 200, 200, 0, 0, NULL, '{"provenance":"imported_deck"}'::jsonb),
  ('d6784000-0000-4000-8000-000000000002', 'd6783000-0000-4000-8000-000000000001',
   'capture', 220, 10, 200, 200, 1, 0, NULL,
   '{"provenance":"imported_deck","proposalItemId":"d6789999-0000-4000-8000-000000000001"}'::jsonb),
  ('d6784000-0000-4000-8000-000000000003', 'd6783000-0000-4000-8000-000000000001',
   'capture', 430, 10, 200, 200, 2, 0, NULL, '{"provenance":"imported_deck"}'::jsonb),
  ('d6784000-0000-4000-8000-000000000004', 'd6783000-0000-4000-8000-000000000001',
   'capture', 640, 10, 200, 200, 3, 0, NULL, '{"provenance":"imported_deck"}'::jsonb);

-- F14: a vendor at rh.example, which ILIKE '%h.example%' used to match.
INSERT INTO public.vendors (id, name, website)
VALUES ('d6785000-0000-4000-8000-000000000001', 'Harden RH', 'https://www.rh.example');

INSERT INTO public.products (id, name, layer, price_retail, source_url, captured_at)
VALUES
  -- F4's existing product.
  ('d6786000-0000-4000-8000-000000000001', 'Harden catalog lamp', 'catalog', 20000,
   'https://catalog.example/lamp', now()),
  -- F2's control: retail-only, not from a deck.
  ('d6786000-0000-4000-8000-000000000002', 'Harden retail-only chair', 'catalog', 50000,
   'https://catalog.example/chair', now());

INSERT INTO public.board_deck_imports (id, board_id, created_by, source_format, file_sha256, file_name, links, status)
VALUES
  ('d6787000-0000-4000-8000-000000000001', 'd6783000-0000-4000-8000-000000000001',
   'd6780000-0000-4000-8000-000000000001', 'deck', repeat('e1', 32), 'Harden.pptx', '{}'::jsonb, 'resolving'),
  ('d6787000-0000-4000-8000-000000000002', 'd6783000-0000-4000-8000-000000000001',
   'd6780000-0000-4000-8000-000000000001', 'deck', repeat('e2', 32), 'Other.pptx', '{}'::jsonb, 'resolving');

INSERT INTO public.board_deck_import_items (
  id, import_id, element_key, board_item_id, slide_index, role, extracted, state, found_by, candidates
) VALUES
  -- F3: a picture found from a page nobody has a product for yet.
  ('d6788000-0000-4000-8000-000000000001', 'd6787000-0000-4000-8000-000000000001', 's1:pic1',
   'd6784000-0000-4000-8000-000000000001', 0, 'product', '{}'::jsonb, 'found', 'link',
   jsonb_build_array(jsonb_build_object(
     'source', 'link', 'band', 'strong', 'rank', 1, 'evidence', '{}'::jsonb,
     'extracted', jsonb_build_object('name', 'Harden page chair', 'price_cents', 12345,
       'images', jsonb_build_array('https://h.example/chair.jpg'),
       'source_url', 'https://h.example/chair')))),
  -- F4: a link piece with no picture of its own.
  ('d6788000-0000-4000-8000-000000000002', 'd6787000-0000-4000-8000-000000000001', 'link:f4',
   NULL, 0, 'product', '{}'::jsonb, 'found', 'link',
   jsonb_build_array(jsonb_build_object(
     'source', 'link_existing', 'band', 'strong', 'rank', 1, 'evidence', '{}'::jsonb,
     'product_id', 'd6786000-0000-4000-8000-000000000001'))),
  -- F4: the other import's piece holding the 'taken' pin.
  ('d6788000-0000-4000-8000-000000000003', 'd6787000-0000-4000-8000-000000000002', 's1:pic1',
   'd6784000-0000-4000-8000-000000000003', 0, 'product', '{}'::jsonb, 'not_found', NULL, '[]'::jsonb);

-- F6/F7/F5: a piece of import 1 leased to 'hd'.
INSERT INTO public.board_deck_import_items (
  id, import_id, element_key, slide_index, role, extracted, state, lease_owner, lease_until, attempts
) VALUES
  ('d6788000-0000-4000-8000-000000000004', 'd6787000-0000-4000-8000-000000000001', 's2:pic1',
   1, 'product', '{}'::jsonb, 'pending', 'hd', now() + interval '1 hour', 1);

-- ── F3 + F14: a second designer's Keep is their own ─────────────────────────
DO $$
DECLARE
  v_item uuid := 'd6788000-0000-4000-8000-000000000001';
  r jsonb;
  v_x_product uuid;
  v_y_product uuid;
  v_x public.products%ROWTYPE;
  v_y public.products%ROWTYPE;
  m jsonb;
BEGIN
  m := public.board_deck_import_match_links('d6787000-0000-4000-8000-000000000001',
    ARRAY['https://h.example/chair']);
  ASSERT NOT (m->'vendors' ? 'h.example'), format('F14: h.example must not match rh.example: %s', m);
  m := public.board_deck_import_match_links('d6787000-0000-4000-8000-000000000001',
    ARRAY['https://rh.example/sofa']);
  ASSERT m->'vendors'->>'rh.example' = 'Harden RH', format('F14: the exact host still matches: %s', m);

  PERFORM pg_temp.act_as('d6780000-0000-4000-8000-000000000001');
  r := public.keep_board_deck_import_item(v_item, 1);
  v_x_product := (r->>'product_id')::uuid;
  SELECT * INTO v_x FROM public.products WHERE id = v_x_product;
  ASSERT v_x.layer = 'personal' AND v_x.owner_user_id = 'd6780000-0000-4000-8000-000000000001',
    'X''s Keep mints X''s personal product';
  ASSERT v_x.vendor_id <> 'd6785000-0000-4000-8000-000000000001',
    'F14: the keep vendor is not the rh.example vendor';
  ASSERT (SELECT website FROM public.vendors WHERE id = v_x.vendor_id) = 'https://h.example',
    'F14: a stub vendor is made for the exact host';
  PERFORM public.unkeep_board_deck_import_item(v_item);

  PERFORM pg_temp.act_as('d6780000-0000-4000-8000-000000000002');
  r := public.keep_board_deck_import_item(v_item, 1);
  v_y_product := (r->>'product_id')::uuid;
  SELECT * INTO v_y FROM public.products WHERE id = v_y_product;
  ASSERT v_y_product <> v_x_product, 'F3: Y''s Keep does not land on X''s product';
  ASSERT v_y.layer = 'personal' AND v_y.owner_user_id = 'd6780000-0000-4000-8000-000000000002',
    'F3: Y''s Keep mints Y''s own personal product';
  ASSERT v_y.vendor_id = v_x.vendor_id, 'F14: the stub vendor is found again by host';
  ASSERT (SELECT count(*) FROM public.vendors WHERE lower(website) = 'https://h.example') = 1,
    'F14: no duplicate stub vendor';
  PERFORM public.unkeep_board_deck_import_item(v_item);

  -- X keeps again: the same product as X's first Keep (idempotent per keeper).
  PERFORM pg_temp.act_as('d6780000-0000-4000-8000-000000000001');
  r := public.keep_board_deck_import_item(v_item, 1);
  ASSERT (r->>'product_id')::uuid = v_x_product, 'F3: a repeat Keep by X reuses X''s product';
END $$;

-- ── F4: a link piece cannot take a pin that has gone onward or is taken ─────
DO $$
DECLARE r jsonb;
BEGIN
  PERFORM pg_temp.act_as('d6780000-0000-4000-8000-000000000001');
  PERFORM pg_temp.expect_error(
    $q$SELECT public.keep_board_deck_import_item('d6788000-0000-4000-8000-000000000002', 1, NULL,
         'd6784000-0000-4000-8000-000000000002')$q$,
    '23514', 'on_schedule', 'F4: a pin already on the schedule');
  PERFORM pg_temp.expect_error(
    $q$SELECT public.keep_board_deck_import_item('d6788000-0000-4000-8000-000000000002', 1, NULL,
         'd6784000-0000-4000-8000-000000000003')$q$,
    '23514', 'pin_taken', 'F4: a pin another import piece holds');
  r := public.keep_board_deck_import_item('d6788000-0000-4000-8000-000000000002', 1, NULL,
    'd6784000-0000-4000-8000-000000000004');
  ASSERT (r->>'board_item_id')::uuid = 'd6784000-0000-4000-8000-000000000004',
    format('F4: a free pin is taken: %s', r);
END $$;

-- ── Fold: a link piece kept onto its own import's picture piece ─────────────
INSERT INTO public.proposal_board_items (
  id, board_id, type, x, y, width, height, z_index, rotation, content, data
) VALUES
  ('d6784000-0000-4000-8000-000000000005', 'd6783000-0000-4000-8000-000000000001',
   'capture', 850, 10, 200, 200, 4, 0, NULL, '{"provenance":"imported_deck"}'::jsonb);

INSERT INTO public.board_deck_import_items (
  id, import_id, element_key, board_item_id, slide_index, role, extracted, state, found_by, candidates, attempts
) VALUES
  -- The picture: the resolver found nothing from its own words.
  ('d6788000-0000-4000-8000-000000000005', 'd6787000-0000-4000-8000-000000000001', 's3:pic1',
   'd6784000-0000-4000-8000-000000000005', 2, 'product',
   '{"caption":"brass lamp","links":[]}'::jsonb, 'not_found', NULL, '[]'::jsonb, 1),
  -- The link row on the same slide, found from its link.
  ('d6788000-0000-4000-8000-000000000006', 'd6787000-0000-4000-8000-000000000001', 'link:fold',
   NULL, 2, 'product',
   '{"links":[{"url":"https://fold.example/lamp","on_picture":false}],"unpaired":true}'::jsonb,
   'found', 'link',
   jsonb_build_array(jsonb_build_object(
     'source', 'link_existing', 'band', 'strong', 'rank', 1, 'evidence', '{}'::jsonb,
     'product_id', 'd6786000-0000-4000-8000-000000000001')), 1);

DO $$
DECLARE
  v_link uuid := 'd6788000-0000-4000-8000-000000000006';
  v_picture uuid := 'd6788000-0000-4000-8000-000000000005';
  v_pin uuid := 'd6784000-0000-4000-8000-000000000005';
  r jsonb;
  r2 jsonb;
  v_row public.board_deck_import_items%ROWTYPE;
BEGIN
  PERFORM pg_temp.act_as('d6780000-0000-4000-8000-000000000001');
  -- Before 00678 this raised unique_violation on uq_board_deck_import_items_pin.
  r := public.keep_board_deck_import_item(v_link, 1, NULL, v_pin);
  ASSERT (r->>'item_id')::uuid = v_picture, format('Fold: the patch is the picture''s: %s', r);
  ASSERT (r->>'board_item_id')::uuid = v_pin, format('Fold: the patch targets the picture''s pin: %s', r);
  ASSERT (r->>'product_id')::uuid = 'd6786000-0000-4000-8000-000000000001',
    format('Fold: the link''s product is kept: %s', r);
  ASSERT r->'data'->'deck_import'->>'found_by' = 'link', format('Fold: found by link: %s', r);

  SELECT * INTO v_row FROM public.board_deck_import_items WHERE id = v_picture;
  ASSERT v_row.state = 'kept' AND v_row.found_by = 'link'
     AND v_row.chosen_product_id = 'd6786000-0000-4000-8000-000000000001',
    'Fold: the picture is kept with the link''s resolution';
  ASSERT v_row.candidates->0->>'band' = 'strong', 'Fold: the link''s candidate (and band) moved to the picture';
  ASSERT v_row.extracted->'links' @> '[{"url":"https://fold.example/lamp"}]'::jsonb,
    'Fold: the link is appended to the picture''s extracted.links';
  ASSERT v_row.extracted->>'caption' = 'brass lamp', 'Fold: the picture keeps what its slide said';

  SELECT * INTO v_row FROM public.board_deck_import_items WHERE id = v_link;
  ASSERT v_row.state = 'merged' AND v_row.merged_into_item_id = v_picture AND v_row.board_item_id IS NULL,
    'Fold: the link row is merged into the picture';

  -- Idempotent: the same pair again gives the same patch.
  r2 := public.keep_board_deck_import_item(v_link, 1, NULL, v_pin);
  ASSERT r2 = r, format('Fold: a repeat returns the same patch: %s vs %s', r2, r);
  ASSERT (SELECT state FROM public.board_deck_import_items WHERE id = v_link) = 'merged',
    'Fold: a repeat leaves the link merged';

  -- A merged row cannot be kept onto another pin, unkept or made a reference.
  PERFORM pg_temp.expect_error(
    format('SELECT public.keep_board_deck_import_item(%L, 1, NULL, %L)', v_link,
           'd6784000-0000-4000-8000-000000000001'),
    '23514', 'merged', 'Fold: a merged row onto another pin');
  PERFORM pg_temp.expect_error(
    format('SELECT public.unkeep_board_deck_import_item(%L)', v_link),
    '23514', 'merged', 'Fold: unkeep of a merged row');
  PERFORM pg_temp.expect_error(
    format('SELECT public.reference_board_deck_import_item(%L)', v_link),
    '23514', 'merged', 'Fold: reference of a merged row');

  -- Unkeep of the picture does not resurrect the link row.
  r := public.unkeep_board_deck_import_item(v_picture);
  ASSERT (SELECT state FROM public.board_deck_import_items WHERE id = v_picture) = 'found',
    'Fold: the unkept picture goes back to found, with the link''s candidates';
  ASSERT (SELECT state FROM public.board_deck_import_items WHERE id = v_link) = 'merged',
    'Fold: unkeeping the picture leaves the link row merged';
  ASSERT NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(public.claim_board_deck_import_items_for_import(
      'd6787000-0000-4000-8000-000000000001', 50)->'items') AS item
    WHERE item->>'item_id' = v_link::text
  ), 'Fold: a merged row is never claimed';
END $$;

-- ── F2: placement of a deck-import Keep product keeps trade empty ───────────
DO $$
DECLARE
  v_board uuid;
  v_deck_product uuid := (SELECT chosen_product_id FROM public.board_deck_import_items
                          WHERE id = 'd6788000-0000-4000-8000-000000000001');
  v_deck_pin uuid := 'd6784100-0000-4000-8000-000000000001';
  v_control_pin uuid := 'd6784100-0000-4000-8000-000000000002';
  v_result jsonb;
  v_line public.project_ffe_items%ROWTYPE;
BEGIN
  ASSERT (SELECT price_trade IS NULL AND price_retail = 12345
                 AND capture_provenance->>'producer' = 'board_deck_import'
          FROM public.products WHERE id = v_deck_product),
    'the Keep product is retail-only and marked board_deck_import';

  PERFORM pg_temp.act_as('d6780000-0000-4000-8000-000000000001');
  v_board := (public.create_project_board(
    '{"projectId":"d6782000-0000-4000-8000-000000000001","name":"Harden promote board"}'::jsonb
  )->>'boardId')::uuid;
  PERFORM set_config('app.board_state_rpc', 'on', true);
  INSERT INTO public.proposal_board_items (id, board_id, type, x, y, width, product_id, content, data) VALUES
    (v_deck_pin, v_board, 'product', 0, 0, 240, v_deck_product, NULL, '{"name":"Harden page chair"}'::jsonb),
    (v_control_pin, v_board, 'product', 260, 0, 240, 'd6786000-0000-4000-8000-000000000002', NULL,
     '{"name":"Harden retail-only chair"}'::jsonb);
  PERFORM set_config('app.board_state_rpc', '', true);

  v_result := public.promote_board_reference_to_selection(v_deck_pin, jsonb_build_object(
    'assignmentScope', 'unassigned', 'roomId', NULL, 'disposition', 'candidate',
    'duplicateMode', 'reuse', 'idempotencyKey', 'promote:' || v_deck_pin,
    'name', 'Harden page chair', 'productId', v_deck_product));
  SELECT * INTO v_line FROM public.project_ffe_items WHERE id = (v_result->>'selectionId')::uuid;
  ASSERT v_line.trade_price_cents IS NULL,
    format('F2: a deck-import retail price is not copied into trade, got %s', v_line.trade_price_cents);
  ASSERT v_line.unit_price_cents = 12345, format('F2: the line still carries retail, got %s', v_line.unit_price_cents);

  v_result := public.promote_board_reference_to_selection(v_control_pin, jsonb_build_object(
    'assignmentScope', 'unassigned', 'roomId', NULL, 'disposition', 'candidate',
    'duplicateMode', 'reuse', 'idempotencyKey', 'promote:' || v_control_pin,
    'name', 'Harden retail-only chair', 'productId', 'd6786000-0000-4000-8000-000000000002'));
  SELECT * INTO v_line FROM public.project_ffe_items WHERE id = (v_result->>'selectionId')::uuid;
  ASSERT v_line.trade_price_cents = 50000,
    format('F2 control: any other retail-only product keeps the old fallback, got %s', v_line.trade_price_cents);
END $$;

-- ── F7: stale and unowned leases write nothing ──────────────────────────────
DO $$
DECLARE
  v_item uuid := 'd6788000-0000-4000-8000-000000000004';
  r jsonb;
BEGIN
  PERFORM pg_temp.expect_error(
    $q$SELECT public.record_board_deck_import_resolution('d6788000-0000-4000-8000-000000000004',
         'not_found', NULL, '[]'::jsonb, 'someone-else')$q$,
    '55P03', NULL, 'F7: another run''s lease');
  PERFORM pg_temp.expect_error(
    $q$SELECT public.record_board_deck_import_resolution('d6788000-0000-4000-8000-000000000004',
         'not_found', NULL, '[]'::jsonb, '')$q$,
    '55P03', NULL, 'F7: no lease owner');
  PERFORM pg_temp.expect_error(
    $q$SELECT public.consume_board_deck_import_link_quota('d6787000-0000-4000-8000-000000000001', 1,
         'someone-else')$q$,
    '55P03', NULL, 'F7: quota under another run''s lease');
  PERFORM pg_temp.expect_error(
    $q$SELECT public.store_board_deck_import_adjudication('d6787000-0000-4000-8000-000000000001', 9,
         NULL, 'someone-else')$q$,
    '55P03', NULL, 'F7: adjudication store under another run''s lease');
  PERFORM pg_temp.expect_error(
    $q$SELECT public.claim_board_deck_import_adjudication('d6787000-0000-4000-8000-000000000001', 9,
         'someone-else')$q$,
    '55P03', NULL, 'F7: adjudication claim under another run''s lease');

  r := public.consume_board_deck_import_link_quota('d6787000-0000-4000-8000-000000000001', 1, 'hd');
  ASSERT (r->>'granted')::int = 1, format('F7: the lease holder spends quota: %s', r);

  -- The holder's own lease, once expired, is refused too.
  UPDATE public.board_deck_import_items SET lease_until = now() - interval '1 second' WHERE id = v_item;
  PERFORM pg_temp.expect_error(
    $q$SELECT public.record_board_deck_import_resolution('d6788000-0000-4000-8000-000000000004',
         'not_found', NULL, '[]'::jsonb, 'hd')$q$,
    '55P03', NULL, 'F7: an expired lease');
  PERFORM pg_temp.expect_error(
    $q$SELECT public.consume_board_deck_import_link_quota('d6787000-0000-4000-8000-000000000001', 1, 'hd')$q$,
    '55P03', NULL, 'F7: quota under an expired lease');
  ASSERT (SELECT state FROM public.board_deck_import_items WHERE id = v_item) = 'pending',
    'F7: a refused record changes nothing';
  UPDATE public.board_deck_import_items SET lease_until = now() + interval '1 hour' WHERE id = v_item;
END $$;

-- ── F6 + F5: studio-day cap and stale pending reclaim ───────────────────────
DO $$
DECLARE
  r jsonb;
  v_studio uuid := 'd6781000-0000-4000-8000-000000000001';
  v_day date := (now() AT TIME ZONE 'UTC')::date;
BEGIN
  INSERT INTO public.board_deck_import_studio_link_days (studio_key, day, adjudications_used)
  VALUES (v_studio, v_day, 200)
  ON CONFLICT (studio_key, day) DO UPDATE SET adjudications_used = 200;
  r := public.claim_board_deck_import_adjudication('d6787000-0000-4000-8000-000000000001', 7, 'hd');
  ASSERT r->>'status' = 'denied' AND r->>'reason' = 'studio_day_cap', format('F6: the 201st call is denied: %s', r);
  ASSERT NOT ((SELECT adjudications FROM public.board_deck_import_link_usage
               WHERE import_id = 'd6787000-0000-4000-8000-000000000001') ? '7'),
    'F6: a capped slide leaves no ledger entry';

  UPDATE public.board_deck_import_studio_link_days SET adjudications_used = 199
  WHERE studio_key = v_studio AND day = v_day;
  r := public.claim_board_deck_import_adjudication('d6787000-0000-4000-8000-000000000001', 7, 'hd');
  ASSERT r->>'status' = 'granted', format('F6: the 200th call is granted: %s', r);
  ASSERT (SELECT adjudications_used FROM public.board_deck_import_studio_link_days
          WHERE studio_key = v_studio AND day = v_day) = 200, 'F6: a grant counts against the day';

  UPDATE public.board_deck_import_studio_link_days SET adjudications_used = 0
  WHERE studio_key = v_studio AND day = v_day;
  r := public.claim_board_deck_import_adjudication('d6787000-0000-4000-8000-000000000001', 7, 'hd');
  ASSERT r->>'status' = 'denied', format('F5: a fresh pending slide is not claimed twice: %s', r);
  UPDATE public.board_deck_import_link_usage
  SET adjudications = jsonb_set(adjudications, '{7,at}', to_jsonb(now() - interval '4 minutes'))
  WHERE import_id = 'd6787000-0000-4000-8000-000000000001';
  r := public.claim_board_deck_import_adjudication('d6787000-0000-4000-8000-000000000001', 7, 'hd');
  ASSERT r->>'status' = 'granted', format('F5: a pending slide older than the lease is reclaimed: %s', r);
END $$;

-- ── F7 (record): the lease holder records; the lease is released ────────────
DO $$
DECLARE r jsonb;
BEGIN
  r := public.record_board_deck_import_resolution('d6788000-0000-4000-8000-000000000004',
    'not_found', NULL, '[]'::jsonb, 'hd');
  ASSERT (r->>'applied')::boolean AND r->>'state' = 'not_found', format('F7: the holder records: %s', r);
  ASSERT (SELECT lease_owner IS NULL FROM public.board_deck_import_items
          WHERE id = 'd6788000-0000-4000-8000-000000000004'), 'F7: recording releases the lease';
END $$;

-- ── F8: round-robin across imports; F1: per-import sweep backs off ──────────
-- Isolate from every other import on the shared local database.
UPDATE public.board_deck_imports SET status = 'abandoned'
WHERE status = 'resolving' AND id NOT IN ('d6787000-0000-4000-8000-000000000011',
                                          'd6787000-0000-4000-8000-000000000012');

INSERT INTO public.board_deck_imports (id, board_id, created_by, source_format, file_sha256, file_name, links, status, created_at)
VALUES
  ('d6787000-0000-4000-8000-000000000011', 'd6783000-0000-4000-8000-000000000001',
   'd6780000-0000-4000-8000-000000000001', 'deck', repeat('f1', 32), 'Big.pptx', '{}'::jsonb, 'resolving',
   now() - interval '1 hour'),
  ('d6787000-0000-4000-8000-000000000012', 'd6783000-0000-4000-8000-000000000001',
   'd6780000-0000-4000-8000-000000000001', 'deck', repeat('f2', 32), 'Small.pptx', '{}'::jsonb, 'resolving',
   now());

INSERT INTO public.board_deck_import_items (import_id, element_key, slide_index, role, extracted, state)
SELECT deck.id, 's' || n || ':pic1', n, 'product', '{}'::jsonb, 'pending'
FROM unnest(ARRAY['d6787000-0000-4000-8000-000000000011',
                  'd6787000-0000-4000-8000-000000000012']::uuid[]) AS deck(id)
CROSS JOIN generate_series(1, 20) AS n;

DO $$
DECLARE
  r jsonb;
  v_first uuid;
  v_count_11 integer;
  v_count_12 integer;
BEGIN
  r := public.claim_board_deck_import_items(8);
  SELECT count(*) FILTER (WHERE item->>'import_id' = 'd6787000-0000-4000-8000-000000000011'),
         count(*) FILTER (WHERE item->>'import_id' = 'd6787000-0000-4000-8000-000000000012')
  INTO v_count_11, v_count_12
  FROM jsonb_array_elements(r->'items') AS item;
  ASSERT v_count_11 = 4 AND v_count_12 = 4,
    format('F8: a batch of 8 splits 4/4 between two waiting imports, got %s/%s', v_count_11, v_count_12);

  -- F1: one of the big import's leases dies; the per-import claim backs it off.
  SELECT (item->>'item_id')::uuid INTO v_first
  FROM jsonb_array_elements(r->'items') AS item
  WHERE item->>'import_id' = 'd6787000-0000-4000-8000-000000000011'
  LIMIT 1;
  UPDATE public.board_deck_import_items SET lease_until = now() - interval '1 second' WHERE id = v_first;
  r := public.claim_board_deck_import_items_for_import('d6787000-0000-4000-8000-000000000011', 50);
  ASSERT NOT (r->'items' @> jsonb_build_array(jsonb_build_object('item_id', v_first))),
    'F1: an expired lease is not handed straight back';
  ASSERT (SELECT lease_owner IS NULL AND next_attempt_at > now()
          FROM public.board_deck_import_items WHERE id = v_first),
    'F1: the per-import sweep sets a backoff';
  ASSERT jsonb_array_length(r->'items') = 16, format('the rest of the import is claimable: %s',
    jsonb_array_length(r->'items'));
END $$;

DO $$ BEGIN RAISE NOTICE 'deck_import hardening tests passed'; END $$;

ROLLBACK;
