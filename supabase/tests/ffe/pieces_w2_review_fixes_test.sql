-- ═══════════════════════════════════════════════════════════════════════════
-- W2 review fixes (00737; US-21 T-21a, SQ-676; T-21 review SQ-627)
--
-- Migration: supabase/migrations/00737_pieces_w2_review_fixes.sql.
-- Anchors: add_labor_line (00732:153 → 00737), set_labor_line_price (00737),
-- set_project_ffe_line_build_fields (00730:381 → 00737),
-- archive/restore_project_selection (00731:49/:91 → 00737), the fill path of
-- _place_product_in_project_v2_00438_impl (00730:181 → 00737),
-- set_line_placements (00734:133 → 00737), project_ffe_placement_events
-- (00734:101), ffe_line_authorization_state (00705:79).
--
-- Named cases, each one DO block:
--   F1   labor carries its client price: add_labor_line prices it; the new
--        set_labor_line_price prices it; a quantity change keeps the total;
--        refusals (not labor, removed, released, negative, not the studio);
--        grants (old signature gone, anon closed).
--   F2   removing a piece removes its active children with it; a child cannot
--        come back alone; restoring the piece restores exactly the children
--        removed with it; an ordered child blocks the removal.
--   F4   a fill refuses a labor placeholder and a removed one.
--   F5   a quantity below the rooms' total is refused; equal is accepted.
--   F6   labor refuses an alternate or a not-selected piece.
--   F11  placement events are append-only for every API role.
--   F13  placements refuse a removed line, and labor outside its piece's rooms.
--
-- Run:
--   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -X -q \
--     -v ON_ERROR_STOP=1 -f supabase/tests/ffe/pieces_w2_review_fixes_test.sql
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

SET LOCAL statement_timeout = '60s';

-- ── Actors, studio, project, rooms, vendor, product ───────────────────────
INSERT INTO auth.users (
  id, email, encrypted_password, email_confirmed_at, created_at, updated_at,
  instance_id, aud, role
) VALUES
  ('73700000-0000-4000-8000-0000000000a1', 'p737-designer@test.invalid', '', now(), now(), now(),
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('73700000-0000-4000-8000-0000000000a2', 'p737-client@test.invalid', '', now(), now(), now(),
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');

INSERT INTO public.profiles (id, email, full_name, is_designer, created_at, updated_at)
VALUES
  ('73700000-0000-4000-8000-0000000000a1', 'p737-designer@test.invalid', 'P737 Designer', true, now(), now()),
  ('73700000-0000-4000-8000-0000000000a2', 'p737-client@test.invalid', 'P737 Client', false, now(), now())
ON CONFLICT (id) DO UPDATE
SET email = EXCLUDED.email, full_name = EXCLUDED.full_name, is_designer = EXCLUDED.is_designer;

INSERT INTO public.organizations (id, type, name, slug)
VALUES ('73700000-0000-4000-8000-0000000000f1', 'design_studio', 'P737 Studio', 'p737-studio-test');

INSERT INTO public.organization_members (id, user_id, organization_id, role, status, joined_at)
VALUES ('73700000-0000-4000-8000-0000000000e1', '73700000-0000-4000-8000-0000000000a1',
        '73700000-0000-4000-8000-0000000000f1', 'owner', 'active', now());

INSERT INTO public.projects (id, name, designer_id, client_id, created_by, studio_id, status)
VALUES ('73700000-0000-4000-8000-000000000001', 'P737 Whole Home',
        '73700000-0000-4000-8000-0000000000a1', '73700000-0000-4000-8000-0000000000a2',
        '73700000-0000-4000-8000-0000000000a1', '73700000-0000-4000-8000-0000000000f1', 'active');

INSERT INTO public.project_rooms (id, project_id, name, sort_order)
VALUES
  ('73700000-0000-4000-8000-000000000021', '73700000-0000-4000-8000-000000000001', 'Living Room', 0),
  ('73700000-0000-4000-8000-000000000022', '73700000-0000-4000-8000-000000000001', 'Dining', 1),
  ('73700000-0000-4000-8000-000000000023', '73700000-0000-4000-8000-000000000001', 'Bedroom', 2);

INSERT INTO public.vendors (id, name)
VALUES ('73700000-0000-4000-8000-000000000011', 'P737 Workroom');

INSERT INTO public.products (
  id, name, layer, owner_user_id, captured_at, vendor_id, category, price_retail, price_trade
) VALUES (
  '73700000-0000-4000-8000-000000000031', 'P737 Brass sconce', 'personal',
  '73700000-0000-4000-8000-0000000000a1', now(), '73700000-0000-4000-8000-000000000011',
  'Lighting', 42000, 30000
);

-- Lines (fixture writes, as postgres):
--   sofa      the piece labor attaches to (Living Room)
--   table     the piece F2 removes and restores (Dining), with children below
--   floor     913 sq ft for F5
--   alt       an alternate; passed  a not-selected line that is not removed
--   blank     a product-less goods line F4 removes, then tries to fill
--   lamp      a goods line set_labor_line_price refuses
SELECT set_config('app.ffe_mutation_rpc', 'on', true);
INSERT INTO public.project_ffe_items (
  id, project_id, name, status, quantity, unit, unit_price_cents, line_total_cents, vendor_id,
  vendor_name, assignment_scope, project_room_id, design_disposition
) VALUES
  ('73700000-0000-4000-8000-000000000101', '73700000-0000-4000-8000-000000000001', 'Sofa',
   'specified', 1, 'each', 480000, 480000, '73700000-0000-4000-8000-000000000011', 'P737 Workroom',
   'room', '73700000-0000-4000-8000-000000000021', 'selected'),
  ('73700000-0000-4000-8000-000000000102', '73700000-0000-4000-8000-000000000001', 'Dining table',
   'specified', 1, 'each', 680000, 680000, '73700000-0000-4000-8000-000000000011', 'P737 Workroom',
   'room', '73700000-0000-4000-8000-000000000022', 'selected'),
  ('73700000-0000-4000-8000-000000000103', '73700000-0000-4000-8000-000000000001', 'White oak floor',
   'specified', 913, 'sq_ft', 1150, 1049950, '73700000-0000-4000-8000-000000000011', 'P737 Workroom',
   'unassigned', NULL, 'selected'),
  ('73700000-0000-4000-8000-000000000104', '73700000-0000-4000-8000-000000000001', 'Other sofa',
   'specified', 1, 'each', 390000, 390000, '73700000-0000-4000-8000-000000000011', 'P737 Workroom',
   'room', '73700000-0000-4000-8000-000000000021', 'alternate'),
  ('73700000-0000-4000-8000-000000000105', '73700000-0000-4000-8000-000000000001', 'Passed-over chair',
   'specified', 1, 'each', 120000, 120000, '73700000-0000-4000-8000-000000000011', 'P737 Workroom',
   'room', '73700000-0000-4000-8000-000000000021', 'not_selected'),
  ('73700000-0000-4000-8000-000000000106', '73700000-0000-4000-8000-000000000001', 'Bedside lamp',
   'specified', 2, 'each', 0, 0, NULL, NULL,
   'room', '73700000-0000-4000-8000-000000000023', 'candidate'),
  ('73700000-0000-4000-8000-000000000107', '73700000-0000-4000-8000-000000000001', 'Table lamp',
   'specified', 1, 'each', 18000, 18000, '73700000-0000-4000-8000-000000000011', 'P737 Workroom',
   'room', '73700000-0000-4000-8000-000000000023', 'selected');

-- The table's children: a COM fabric, and an accessory removed earlier on its
-- own (an hour before, so its removed_at differs from the cascade's).
INSERT INTO public.project_ffe_items (
  id, project_id, name, status, quantity, unit, unit_price_cents, line_total_cents, vendor_id,
  vendor_name, assignment_scope, project_room_id, design_disposition, parent_ffe_item_id, link_kind,
  removed_at, removed_by, removal_reason, removed_disposition
) VALUES
  ('73700000-0000-4000-8000-000000000111', '73700000-0000-4000-8000-000000000001', 'Seat fabric',
   'specified', 6, 'yard', 9000, 54000, '73700000-0000-4000-8000-000000000011', 'P737 Workroom',
   'room', '73700000-0000-4000-8000-000000000022', 'selected',
   '73700000-0000-4000-8000-000000000102', 'com', NULL, NULL, NULL, NULL),
  ('73700000-0000-4000-8000-000000000112', '73700000-0000-4000-8000-000000000001', 'Table pads',
   'specified', 1, 'each', 9000, 9000, '73700000-0000-4000-8000-000000000011', 'P737 Workroom',
   'room', '73700000-0000-4000-8000-000000000022', 'not_selected',
   '73700000-0000-4000-8000-000000000102', 'accessory', now() - interval '1 hour',
   '73700000-0000-4000-8000-0000000000a1', 'not needed', 'candidate');
SELECT set_config('app.ffe_mutation_rpc', '', true);

CREATE OR REPLACE FUNCTION pg_temp.assume(p_actor uuid)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', p_actor::text, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', p_actor::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
END;
$$;

-- Runs p_sql and returns 'code|message' for the error it raised, or NULL.
CREATE OR REPLACE FUNCTION pg_temp.refusal(p_sql text)
RETURNS text LANGUAGE plpgsql AS $$
DECLARE v_state text; v_message text;
BEGIN
  EXECUTE p_sql;
  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  GET STACKED DIAGNOSTICS v_state = RETURNED_SQLSTATE, v_message = MESSAGE_TEXT;
  RETURN v_state || '|' || v_message;
END;
$$;

CREATE TEMP TABLE t737 (key text PRIMARY KEY, id uuid) ON COMMIT DROP;

-- ── F1: labor carries its client price ─────────────────────────────────────
DO $$
DECLARE
  v_sofa constant uuid := '73700000-0000-4000-8000-000000000101';
  v_result jsonb;
  v_install uuid;
  v_haul uuid;
  v_item public.project_ffe_items%ROWTYPE;
  v_err text;
BEGIN
  PERFORM pg_temp.assume('73700000-0000-4000-8000-0000000000a1');

  -- add_labor_line with a price: 9 roll × $85 = $765.
  v_result := public.add_labor_line(v_sofa,
    jsonb_build_object('name', 'Install, upholsterer', 'quantity', 9, 'unit', 'roll',
                       'vendorId', '73700000-0000-4000-8000-000000000011'), 8500);
  v_install := (v_result->>'selectionId')::uuid;
  SELECT * INTO v_item FROM public.project_ffe_items WHERE id = v_install;
  ASSERT v_item.unit_price_cents = 8500 AND v_item.line_total_cents = 76500
         AND v_item.line_kind = 'labor' AND v_item.parent_ffe_item_id = v_sofa,
    format('F1: add_labor_line prices 9 x $85 = $765, got %s / %s', v_item.unit_price_cents, v_item.line_total_cents);

  -- Two arguments still resolve; no price leaves the line at 0.
  v_result := public.add_labor_line(v_sofa, jsonb_build_object('name', 'Haul away', 'quantity', 3, 'unit', 'hour'));
  v_haul := (v_result->>'selectionId')::uuid;
  SELECT * INTO v_item FROM public.project_ffe_items WHERE id = v_haul;
  ASSERT v_item.unit_price_cents = 0 AND v_item.line_total_cents = 0,
    format('F1: an unpriced labor line stays at 0, got %s / %s', v_item.unit_price_cents, v_item.line_total_cents);

  -- A price of 0 or NULL is "no price"; a negative one is refused.
  v_err := pg_temp.refusal(format('SELECT public.add_labor_line(%L, %L::jsonb, -1)',
    v_sofa, '{"name": "Bad price"}'));
  ASSERT v_err = '23514|add_labor_line: the price is whole cents, 0 or more',
    format('F1: a negative labor price is refused, got %L', v_err);

  -- set_labor_line_price: 3 hour × $120 = $360.
  v_result := public.set_labor_line_price(v_haul, 12000);
  ASSERT v_result = jsonb_build_object('selectionId', v_haul, 'unitPriceCents', 12000, 'lineTotalCents', 36000),
    format('F1: set_labor_line_price returns the price and total, got %s', v_result);

  -- A quantity change keeps the total = quantity × price.
  PERFORM public.set_project_ffe_line_build_fields(v_haul, '{"quantity": 4}'::jsonb);
  SELECT * INTO v_item FROM public.project_ffe_items WHERE id = v_haul;
  ASSERT v_item.quantity = 4 AND v_item.unit_price_cents = 12000 AND v_item.line_total_cents = 48000,
    format('F1: 4 hour x $120 = $480 after the quantity change, got %s', v_item.line_total_cents);

  -- Refusals.
  v_err := pg_temp.refusal(format('SELECT public.set_labor_line_price(%L, 5000)',
    '73700000-0000-4000-8000-000000000107'));
  ASSERT v_err = '23514|Only a labor line takes a price here.',
    format('F1: a goods line is refused, got %L', v_err);
  v_err := pg_temp.refusal(format('SELECT public.set_labor_line_price(%L, -5)', v_haul));
  ASSERT v_err = '23514|set_labor_line_price: the price is whole cents, 0 or more',
    format('F1: a negative price is refused, got %L', v_err);

  PERFORM pg_temp.assume('73700000-0000-4000-8000-0000000000a2');
  v_err := pg_temp.refusal(format('SELECT public.set_labor_line_price(%L, 5000)', v_haul));
  ASSERT v_err = '42501|project not found or access denied',
    format('F1: the client cannot price labor, got %L', v_err);

  INSERT INTO t737 VALUES ('install', v_install), ('haul', v_haul);
END $$;

-- A removed labor line, and a labor line on a sent authorization.
DO $$
BEGIN
  PERFORM pg_temp.assume('73700000-0000-4000-8000-0000000000a1');
  PERFORM public.archive_project_selection((SELECT id FROM t737 WHERE key = 'haul'), NULL);
END $$;

INSERT INTO public.proposals (id, project_id, designer_id, title, status, document_kind, commercial_state, total_amount, subtotal)
VALUES ('73700000-0000-4000-8000-000000000041', '73700000-0000-4000-8000-000000000001',
        '73700000-0000-4000-8000-0000000000a1', 'P737 Authorization No. 1', 'sent',
        'furnishings_authorization', 'sent', 0, 0);
INSERT INTO public.project_commercial_documents (id, project_id, proposal_id, document_kind, wave_name, is_origin, bound_at, created_by)
VALUES ('73700000-0000-4000-8000-000000000042', '73700000-0000-4000-8000-000000000001',
        '73700000-0000-4000-8000-000000000041', 'furnishings_authorization', 'Authorization No. 1',
        false, now(), '73700000-0000-4000-8000-0000000000a1');
INSERT INTO public.furnishing_authorization_items (id, commercial_document_id, source_ffe_item_id, name, quantity, client_unit_price_cents, client_line_total_cents)
VALUES ('73700000-0000-4000-8000-000000000043', '73700000-0000-4000-8000-000000000042',
        (SELECT id FROM t737 WHERE key = 'install'), 'Install, upholsterer', 9, 8500, 76500);

DO $$
DECLARE
  v_err text;
BEGIN
  PERFORM pg_temp.assume('73700000-0000-4000-8000-0000000000a1');
  v_err := pg_temp.refusal(format('SELECT public.set_labor_line_price(%L, 9000)',
    (SELECT id FROM t737 WHERE key = 'haul')));
  ASSERT v_err = '23514|This line was removed.',
    format('F1: a removed labor line is refused, got %L', v_err);
  v_err := pg_temp.refusal(format('SELECT public.set_labor_line_price(%L, 9000)',
    (SELECT id FROM t737 WHERE key = 'install')));
  ASSERT v_err = '23514|Released labor changes through Record a change.',
    format('F1: released labor is refused, got %L', v_err);
  ASSERT (SELECT unit_price_cents = 8500 FROM public.project_ffe_items WHERE id = (SELECT id FROM t737 WHERE key = 'install')),
    'F1: a refused price writes nothing';

  -- Grants: the two-argument signature is gone; anon executes neither.
  ASSERT to_regprocedure('public.add_labor_line(uuid,jsonb)') IS NULL,
    'F1: the old add_labor_line(uuid,jsonb) signature must be dropped';
  ASSERT has_function_privilege('authenticated', 'public.add_labor_line(uuid,jsonb,integer)', 'EXECUTE')
     AND NOT has_function_privilege('anon', 'public.add_labor_line(uuid,jsonb,integer)', 'EXECUTE')
     AND has_function_privilege('authenticated', 'public.set_labor_line_price(uuid,integer)', 'EXECUTE')
     AND NOT has_function_privilege('anon', 'public.set_labor_line_price(uuid,integer)', 'EXECUTE'),
    'F1: authenticated executes both RPCs; anon executes neither';
  ASSERT (SELECT prosecdef FROM pg_proc WHERE oid = 'public.set_labor_line_price(uuid,integer)'::regprocedure),
    'F1: set_labor_line_price is SECURITY DEFINER';

  RAISE NOTICE 'PASS F1: labor carries its client price';
END $$;

-- ── F6: labor attaches to a chosen piece ──────────────────────────────────
DO $$
DECLARE
  v_err text;
  v_refusal constant text := '23514|add_labor_line: labor attaches to a chosen piece, not an alternate or a passed-over line';
BEGIN
  PERFORM pg_temp.assume('73700000-0000-4000-8000-0000000000a1');
  v_err := pg_temp.refusal(format('SELECT public.add_labor_line(%L, %L::jsonb)',
    '73700000-0000-4000-8000-000000000104', '{"name": "Install"}'));
  ASSERT v_err = v_refusal, format('F6: an alternate parent is refused, got %L', v_err);
  v_err := pg_temp.refusal(format('SELECT public.add_labor_line(%L, %L::jsonb)',
    '73700000-0000-4000-8000-000000000105', '{"name": "Install"}'));
  ASSERT v_err = v_refusal, format('F6: a not-selected parent is refused, got %L', v_err);
  ASSERT NOT EXISTS (SELECT 1 FROM public.project_ffe_items
                      WHERE parent_ffe_item_id IN ('73700000-0000-4000-8000-000000000104',
                                                   '73700000-0000-4000-8000-000000000105')),
    'F6: no labor line was written';
  RAISE NOTICE 'PASS F6: labor refuses an alternate or a not-selected piece';
END $$;

-- ── F2: remove and restore carry the piece's children ─────────────────────
DO $$
DECLARE
  v_table constant uuid := '73700000-0000-4000-8000-000000000102';
  v_com constant uuid := '73700000-0000-4000-8000-000000000111';
  v_pads constant uuid := '73700000-0000-4000-8000-000000000112';
  v_labor uuid;
  v_pads_removed_at timestamptz;
  v_piece public.project_ffe_items%ROWTYPE;
  v_err text;
BEGIN
  PERFORM pg_temp.assume('73700000-0000-4000-8000-0000000000a1');
  v_labor := (public.add_labor_line(v_table,
    jsonb_build_object('name', 'Deliver and set', 'quantity', 1), 25000)->>'selectionId')::uuid;
  SELECT removed_at INTO v_pads_removed_at FROM public.project_ffe_items WHERE id = v_pads;

  PERFORM public.archive_project_selection(v_table, NULL);
  SELECT * INTO v_piece FROM public.project_ffe_items WHERE id = v_table;
  ASSERT v_piece.removed_at IS NOT NULL AND v_piece.design_disposition = 'not_selected',
    'F2: the piece is removed';
  ASSERT (SELECT count(*) FROM public.project_ffe_items
           WHERE id IN (v_labor, v_com) AND removed_at = v_piece.removed_at
             AND design_disposition = 'not_selected'
             AND removal_reason = v_piece.removal_reason) = 2,
    'F2: the labor and COM children are removed with the piece, same removed_at and reason';
  ASSERT (SELECT removed_disposition FROM public.project_ffe_items WHERE id = v_labor) = 'candidate'
     AND (SELECT removed_disposition FROM public.project_ffe_items WHERE id = v_com) = 'selected',
    'F2: each child records its own disposition';
  ASSERT (SELECT removed_at FROM public.project_ffe_items WHERE id = v_pads) = v_pads_removed_at,
    'F2: a child removed earlier keeps its own removal';

  -- A child cannot come back while its piece is removed.
  v_err := pg_temp.refusal(format('SELECT public.restore_project_selection(%L)', v_labor));
  ASSERT v_err = '23514|Restore its piece first.', format('F2: restoring a child alone refuses, got %L', v_err);
  v_err := pg_temp.refusal(format('SELECT public.restore_project_selection(%L)', v_com));
  ASSERT v_err = '23514|Restore its piece first.', format('F2: restoring the COM alone refuses, got %L', v_err);

  -- Restoring the piece brings back the children removed with it, and only them.
  PERFORM public.restore_project_selection(v_table);
  ASSERT (SELECT removed_at IS NULL AND design_disposition = 'selected' FROM public.project_ffe_items WHERE id = v_table),
    'F2: the piece is restored';
  ASSERT (SELECT removed_at IS NULL AND removed_disposition IS NULL AND design_disposition = 'candidate'
            FROM public.project_ffe_items WHERE id = v_labor),
    'F2: the labor child is restored to candidate';
  ASSERT (SELECT removed_at IS NULL AND design_disposition = 'selected' FROM public.project_ffe_items WHERE id = v_com),
    'F2: the COM child is restored to selected';
  ASSERT (SELECT removed_at = v_pads_removed_at AND design_disposition = 'not_selected'
            FROM public.project_ffe_items WHERE id = v_pads),
    'F2: the accessory removed on its own stays removed';

  -- The earlier accessory comes back on its own now that its piece is active.
  PERFORM public.restore_project_selection(v_pads);
  ASSERT (SELECT removed_at IS NULL AND design_disposition = 'candidate' FROM public.project_ffe_items WHERE id = v_pads),
    'F2: a child restores alone under an active piece';
  INSERT INTO t737 VALUES ('table_labor', v_labor);
END $$;

-- An ordered child blocks removing its piece.
INSERT INTO public.purchase_orders (id, designer_id, project_id, vendor_id, payment_pattern, total_cents, status, created_by)
VALUES ('73700000-0000-4000-8000-000000000051', '73700000-0000-4000-8000-0000000000a1',
        '73700000-0000-4000-8000-000000000001', '73700000-0000-4000-8000-000000000011',
        'net_30', 54000, 'draft', '73700000-0000-4000-8000-0000000000a1');
SELECT set_config('app.ffe_mutation_rpc', 'on', true);
UPDATE public.project_ffe_items SET purchase_order_id = '73700000-0000-4000-8000-000000000051'
WHERE id = '73700000-0000-4000-8000-000000000111';
SELECT set_config('app.ffe_mutation_rpc', '', true);

DO $$
DECLARE
  v_err text;
BEGIN
  PERFORM pg_temp.assume('73700000-0000-4000-8000-0000000000a1');
  v_err := pg_temp.refusal(format('SELECT public.archive_project_selection(%L, NULL)',
    '73700000-0000-4000-8000-000000000102'));
  ASSERT v_err = '23514|Released lines change through Record a change.',
    format('F2: a piece with an ordered child refuses removal, got %L', v_err);
  ASSERT NOT EXISTS (SELECT 1 FROM public.project_ffe_items
                      WHERE (id = '73700000-0000-4000-8000-000000000102'
                             OR parent_ffe_item_id = '73700000-0000-4000-8000-000000000102')
                        AND removed_at IS NOT NULL),
    'F2: the refusal writes nothing';
  RAISE NOTICE 'PASS F2: remove and restore carry the piece''s children';
END $$;

-- ── F4: the fill path refuses labor and removed placeholders ──────────────
DO $$
DECLARE
  v_err text;
BEGIN
  PERFORM pg_temp.assume('73700000-0000-4000-8000-0000000000a1');
  v_err := pg_temp.refusal(format('SELECT public.place_product_in_project_v2(%L::jsonb)',
    jsonb_build_object(
      'projectId', '73700000-0000-4000-8000-000000000001',
      'productId', '73700000-0000-4000-8000-000000000031',
      'placeholderSelectionId', (SELECT id FROM t737 WHERE key = 'table_labor'),
      'assignmentScope', 'unassigned',
      'idempotencyKey', 'p737-fill-labor')));
  ASSERT v_err = '23514|Labor isn''t filled with a product.',
    format('F4: a labor placeholder is refused, got %L', v_err);
  ASSERT (SELECT product_id IS NULL AND name = 'Deliver and set' FROM public.project_ffe_items
           WHERE id = (SELECT id FROM t737 WHERE key = 'table_labor')),
    'F4: the labor line is untouched';

  PERFORM public.archive_project_selection('73700000-0000-4000-8000-000000000106', NULL);
  v_err := pg_temp.refusal(format('SELECT public.place_product_in_project_v2(%L::jsonb)',
    jsonb_build_object(
      'projectId', '73700000-0000-4000-8000-000000000001',
      'productId', '73700000-0000-4000-8000-000000000031',
      'placeholderSelectionId', '73700000-0000-4000-8000-000000000106',
      'assignmentScope', 'unassigned',
      'idempotencyKey', 'p737-fill-removed')));
  ASSERT v_err = '23514|This line was removed.',
    format('F4: a removed placeholder is refused, got %L', v_err);
  ASSERT (SELECT product_id IS NULL FROM public.project_ffe_items WHERE id = '73700000-0000-4000-8000-000000000106'),
    'F4: the removed line is untouched';
  RAISE NOTICE 'PASS F4: the fill refuses labor and removed placeholders';
END $$;

-- ── F5: quantity never drops below the rooms' total ───────────────────────
DO $$
DECLARE
  v_floor constant uuid := '73700000-0000-4000-8000-000000000103';
  v_err text;
  v_item public.project_ffe_items%ROWTYPE;
BEGIN
  PERFORM pg_temp.assume('73700000-0000-4000-8000-0000000000a1');
  PERFORM public.set_line_placements(v_floor, jsonb_build_array(
    jsonb_build_object('roomId', '73700000-0000-4000-8000-000000000021', 'quantity', 500),
    jsonb_build_object('roomId', '73700000-0000-4000-8000-000000000022', 'quantity', 330)));

  v_err := pg_temp.refusal(format('SELECT public.set_project_ffe_line_build_fields(%L, %L::jsonb)',
    v_floor, '{"quantity": 829}'));
  ASSERT v_err = '23514|Quantity is below the rooms'' total (830).',
    format('F5: 829 below 830 placed is refused, got %L', v_err);

  PERFORM public.set_project_ffe_line_build_fields(v_floor, '{"quantity": 830}'::jsonb);
  SELECT * INTO v_item FROM public.project_ffe_items WHERE id = v_floor;
  ASSERT v_item.quantity = 830 AND v_item.line_total_cents = 830 * 1150,
    format('F5: 830 equal to the rooms is accepted, got %s', v_item.quantity);

  -- A line with no placements is unaffected.
  PERFORM public.set_project_ffe_line_build_fields('73700000-0000-4000-8000-000000000107', '{"quantity": 3}'::jsonb);
  RAISE NOTICE 'PASS F5: quantity never drops below the rooms'' total';
END $$;

-- ── F11: placement events are append-only ─────────────────────────────────
DO $$
DECLARE
  v_role text;
BEGIN
  FOREACH v_role IN ARRAY ARRAY['service_role', 'authenticated', 'anon'] LOOP
    ASSERT NOT has_table_privilege(v_role, 'public.project_ffe_placement_events', 'UPDATE')
       AND NOT has_table_privilege(v_role, 'public.project_ffe_placement_events', 'DELETE')
       AND NOT has_table_privilege(v_role, 'public.project_ffe_placement_events', 'TRUNCATE'),
      format('F11: %s must not update, delete or truncate placement events', v_role);
  END LOOP;
  ASSERT has_table_privilege('service_role', 'public.project_ffe_placement_events', 'INSERT')
     AND has_table_privilege('service_role', 'public.project_ffe_placement_events', 'SELECT')
     AND has_table_privilege('authenticated', 'public.project_ffe_placement_events', 'SELECT'),
    'F11: service_role still inserts and reads; the studio still reads';
  RAISE NOTICE 'PASS F11: placement events are append-only';
END $$;

-- ── F13: placements refuse a removed line and stray labor ─────────────────
DO $$
DECLARE
  v_install uuid := (SELECT id FROM t737 WHERE key = 'install');
  v_haul uuid := (SELECT id FROM t737 WHERE key = 'haul');
  v_floor_labor uuid;
  v_err text;
  v_result jsonb;
BEGIN
  PERFORM pg_temp.assume('73700000-0000-4000-8000-0000000000a1');

  v_err := pg_temp.refusal(format('SELECT public.set_line_placements(%L, %L::jsonb)', v_haul,
    '[{"roomId":"73700000-0000-4000-8000-000000000021","quantity":1}]'));
  ASSERT v_err = '23514|This line was removed.', format('F13: a removed line is refused, got %L', v_err);

  -- The sofa is assigned to the Living Room: its labor may go there, not Dining.
  v_err := pg_temp.refusal(format('SELECT public.set_line_placements(%L, %L::jsonb)', v_install,
    '[{"roomId":"73700000-0000-4000-8000-000000000022","quantity":1}]'));
  ASSERT v_err = '23514|Labor goes where its piece goes.',
    format('F13: labor outside its piece''s room is refused, got %L', v_err);
  v_result := public.set_line_placements(v_install,
    '[{"roomId":"73700000-0000-4000-8000-000000000021","quantity":9}]'::jsonb);
  ASSERT jsonb_array_length(v_result->'placements') = 1, 'F13: labor in its piece''s room is accepted';

  -- The floor is placed in the Living Room (primary) and Dining (F5). Its
  -- install may go to either placed room, never to the Bedroom.
  v_floor_labor := (public.add_labor_line('73700000-0000-4000-8000-000000000103',
    jsonb_build_object('name', 'Install floor', 'quantity', 830, 'unit', 'sq_ft'), 400)->>'selectionId')::uuid;
  v_result := public.set_line_placements(v_floor_labor,
    '[{"roomId":"73700000-0000-4000-8000-000000000021","quantity":500},{"roomId":"73700000-0000-4000-8000-000000000022","quantity":330}]'::jsonb);
  ASSERT jsonb_array_length(v_result->'placements') = 2,
    'F13: labor follows its piece into every room the piece is placed in';
  v_err := pg_temp.refusal(format('SELECT public.set_line_placements(%L, %L::jsonb)', v_floor_labor,
    '[{"roomId":"73700000-0000-4000-8000-000000000021","quantity":500},{"roomId":"73700000-0000-4000-8000-000000000023","quantity":330}]'));
  ASSERT v_err = '23514|Labor goes where its piece goes.',
    format('F13: a room the piece is not placed in is refused, got %L', v_err);
  ASSERT (SELECT count(*) = 2 FROM public.project_ffe_placements WHERE ffe_item_id = v_floor_labor
                                AND project_room_id <> '73700000-0000-4000-8000-000000000023'),
    'F13: the refusal writes nothing';
  RAISE NOTICE 'PASS F13: placements refuse a removed line and labor outside its piece''s rooms';
END $$;

ROLLBACK;
