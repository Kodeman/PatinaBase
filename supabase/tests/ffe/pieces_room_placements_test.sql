-- ═══════════════════════════════════════════════════════════════════════════
-- Room placements, phase 1 (00734; US-21 T-14, SQ-620)
--
-- CONTRACT §2 "00734 in full"; direction.md §3.4 D7 worked cases; ruling Q4.
-- Anchors: set_line_placements (00734), can_buy_for_project (00702:60),
-- _ffe_require_studio_project (00717:75), ffe_line_authorization_state
-- (00705:79).
--
-- Scenario S2, frame a5: one white-oak floor line, 913 sq ft at $11.50
-- ($10,499.50), placed Hall 120 · Living 320 · Dining 180 · Kitchen 210
-- (830 measured).
--
-- Named cases, each one DO block:
--   rules              single room stored; [] keeps the primary; refusals
--   case_1_waste       913 over 830 returns wasteQuantity 83
--   case_2_partial     500 of 913 received: received_quantity stays one integer
--   case_3_share       210→240 / 120→90 after the PO: recorded, no money, no PO change
--   case_4_fit         860 ≤ 913 accepted; 950 refused (the primary-room-on-a-PO
--                      rule moved to receiving/pieces_order_rooms_test.sql, 00754)
--   rls                a client JWT reads 0 rows; the studio reads them
--
-- Run:
--   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -X -q \
--     -v ON_ERROR_STOP=1 -f supabase/tests/ffe/pieces_room_placements_test.sql
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

SET LOCAL statement_timeout = '60s';

-- ── Actors, project, rooms, line ──────────────────────────────────────────
INSERT INTO auth.users (
  id, email, encrypted_password, email_confirmed_at, created_at, updated_at,
  instance_id, aud, role
) VALUES
  ('73400000-0000-4000-8000-000000000001', 'rp-designer@test.invalid', '', now(), now(), now(),
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('73400000-0000-4000-8000-000000000002', 'rp-client@test.invalid', '', now(), now(), now(),
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');

INSERT INTO public.profiles (id, email, full_name, is_designer, created_at, updated_at)
VALUES
  ('73400000-0000-4000-8000-000000000001', 'rp-designer@test.invalid', 'RP Designer', true, now(), now()),
  ('73400000-0000-4000-8000-000000000002', 'rp-client@test.invalid', 'RP Client', false, now(), now())
ON CONFLICT (id) DO UPDATE
SET email = EXCLUDED.email, full_name = EXCLUDED.full_name, is_designer = EXCLUDED.is_designer;

INSERT INTO public.projects (id, name, designer_id, client_id, created_by, status)
VALUES
  ('73410000-0000-4000-8000-000000000001', 'Room placements project',
   '73400000-0000-4000-8000-000000000001', '73400000-0000-4000-8000-000000000002',
   '73400000-0000-4000-8000-000000000001', 'active'),
  ('73410000-0000-4000-8000-000000000002', 'Other project',
   '73400000-0000-4000-8000-000000000001', NULL,
   '73400000-0000-4000-8000-000000000001', 'active');

INSERT INTO public.project_rooms (id, project_id, name, sort_order) VALUES
  ('73420000-0000-4000-8000-000000000001', '73410000-0000-4000-8000-000000000001', 'Hall', 0),
  ('73420000-0000-4000-8000-000000000002', '73410000-0000-4000-8000-000000000001', 'Living', 1),
  ('73420000-0000-4000-8000-000000000003', '73410000-0000-4000-8000-000000000001', 'Dining', 2),
  ('73420000-0000-4000-8000-000000000004', '73410000-0000-4000-8000-000000000001', 'Kitchen', 3),
  ('73420000-0000-4000-8000-000000000009', '73410000-0000-4000-8000-000000000002', 'Elsewhere', 0);

INSERT INTO public.vendors (id, name)
VALUES ('73430000-0000-4000-8000-000000000001', 'RP Flooring Supply');

-- L: the oak floor (S2). L2: a second line the rules block uses.
INSERT INTO public.project_ffe_items (
  id, project_id, name, status, quantity, unit, unit_price_cents, vendor_id,
  assignment_scope, project_room_id
) VALUES
  ('73440000-0000-4000-8000-000000000001', '73410000-0000-4000-8000-000000000001',
   'White oak floor', 'specified', 913, 'sq_ft', 1150, '73430000-0000-4000-8000-000000000001',
   'unassigned', NULL),
  ('73440000-0000-4000-8000-000000000002', '73410000-0000-4000-8000-000000000001',
   'Hall runner', 'specified', 3, 'each', 40000, '73430000-0000-4000-8000-000000000001',
   'room', '73420000-0000-4000-8000-000000000001');

DO $setup$
BEGIN
  IF (SELECT quantity::bigint * unit_price_cents FROM public.project_ffe_items
      WHERE id = '73440000-0000-4000-8000-000000000001') <> 1049950 THEN
    RAISE EXCEPTION 'SETUP: the oak floor must be 913 sq ft at $11.50 = $10,499.50';
  END IF;
END
$setup$;

-- ── rules ─────────────────────────────────────────────────────────────────
DO $rules$
DECLARE
  v_result jsonb;
  v_msg    text;
  v_item   public.project_ffe_items%ROWTYPE;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', '73400000-0000-4000-8000-000000000001', true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  PERFORM set_config('request.jwt.claims',
    '{"sub":"73400000-0000-4000-8000-000000000001","role":"authenticated"}', true);

  -- A set of one row is stored (single room).
  v_result := public.set_line_placements('73440000-0000-4000-8000-000000000002',
    '[{"roomId":"73420000-0000-4000-8000-000000000002","quantity":2}]'::jsonb);
  IF jsonb_array_length(v_result -> 'placements') <> 1
     OR (v_result ->> 'wasteQuantity')::int <> 1
     OR (SELECT count(*) FROM public.project_ffe_placements
         WHERE ffe_item_id = '73440000-0000-4000-8000-000000000002') <> 1 THEN
    RAISE EXCEPTION 'rules: a one-room set must be stored, got %', v_result;
  END IF;
  SELECT * INTO v_item FROM public.project_ffe_items WHERE id = '73440000-0000-4000-8000-000000000002';
  IF v_item.project_room_id <> '73420000-0000-4000-8000-000000000002' OR v_item.assignment_scope <> 'room' THEN
    RAISE EXCEPTION 'rules: the first placement must become the primary room';
  END IF;

  -- [] deletes the rows and leaves the primary room.
  v_result := public.set_line_placements('73440000-0000-4000-8000-000000000002', '[]'::jsonb);
  SELECT * INTO v_item FROM public.project_ffe_items WHERE id = '73440000-0000-4000-8000-000000000002';
  IF jsonb_array_length(v_result -> 'placements') <> 0
     OR EXISTS (SELECT 1 FROM public.project_ffe_placements
                WHERE ffe_item_id = '73440000-0000-4000-8000-000000000002')
     OR v_item.project_room_id <> '73420000-0000-4000-8000-000000000002'
     OR v_item.assignment_scope <> 'room' THEN
    RAISE EXCEPTION 'rules: [] must clear the rows and keep the primary room';
  END IF;

  -- A room in another project is refused.
  BEGIN
    PERFORM public.set_line_placements('73440000-0000-4000-8000-000000000002',
      '[{"roomId":"73420000-0000-4000-8000-000000000009","quantity":1}]'::jsonb);
    RAISE EXCEPTION 'rules: a room from another project was accepted';
  EXCEPTION WHEN check_violation THEN
    GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
    IF v_msg <> 'That room is not in this project.' THEN RAISE; END IF;
  END;

  -- The same room twice is refused.
  BEGIN
    PERFORM public.set_line_placements('73440000-0000-4000-8000-000000000002',
      '[{"roomId":"73420000-0000-4000-8000-000000000001","quantity":1},
        {"roomId":"73420000-0000-4000-8000-000000000001","quantity":1}]'::jsonb);
    RAISE EXCEPTION 'rules: a duplicate room was accepted';
  EXCEPTION WHEN unique_violation THEN
    GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
    IF v_msg <> 'A room appears twice in the placements.' THEN RAISE; END IF;
  END;

  -- A fractional or zero share is refused.
  BEGIN
    PERFORM public.set_line_placements('73440000-0000-4000-8000-000000000002',
      '[{"roomId":"73420000-0000-4000-8000-000000000001","quantity":1.5}]'::jsonb);
    RAISE EXCEPTION 'rules: a fractional share was accepted';
  EXCEPTION WHEN check_violation THEN
    GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
    IF v_msg <> 'Each room''s quantity is a whole number above zero.' THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM public.set_line_placements('73440000-0000-4000-8000-000000000002',
      '[{"roomId":"73420000-0000-4000-8000-000000000001","quantity":0}]'::jsonb);
    RAISE EXCEPTION 'rules: a zero share was accepted';
  EXCEPTION WHEN check_violation THEN
    GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
    IF v_msg <> 'Each room''s quantity is a whole number above zero.' THEN RAISE; END IF;
  END;

  -- Nothing placed or recorded by the refusals; nothing recorded before a PO.
  IF EXISTS (SELECT 1 FROM public.project_ffe_placements
             WHERE ffe_item_id = '73440000-0000-4000-8000-000000000002')
     OR EXISTS (SELECT 1 FROM public.project_ffe_placement_events
                WHERE ffe_item_id = '73440000-0000-4000-8000-000000000002') THEN
    RAISE EXCEPTION 'rules: a refused or unlocked change left rows or events';
  END IF;
END
$rules$;

-- ── case_1_waste: 913 ordered over 830 measured prints waste 83 ──────────
DO $case_1_waste$
DECLARE
  v_result jsonb;
  v_item   public.project_ffe_items%ROWTYPE;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', '73400000-0000-4000-8000-000000000001', true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  PERFORM set_config('request.jwt.claims',
    '{"sub":"73400000-0000-4000-8000-000000000001","role":"authenticated"}', true);

  v_result := public.set_line_placements('73440000-0000-4000-8000-000000000001', '[
    {"roomId":"73420000-0000-4000-8000-000000000001","quantity":120,"areaNote":"entry and closet"},
    {"roomId":"73420000-0000-4000-8000-000000000002","quantity":320},
    {"roomId":"73420000-0000-4000-8000-000000000003","quantity":180},
    {"roomId":"73420000-0000-4000-8000-000000000004","quantity":210}
  ]'::jsonb);

  IF (v_result ->> 'wasteQuantity')::int <> 83 THEN
    RAISE EXCEPTION 'case_1_waste: wasteQuantity must be 83, got %', v_result ->> 'wasteQuantity';
  END IF;
  IF jsonb_array_length(v_result -> 'placements') <> 4
     OR v_result #>> '{placements,0,roomName}' <> 'Hall'
     OR v_result #>> '{placements,0,areaNote}' <> 'entry and closet'
     OR v_result #>> '{placements,3,roomName}' <> 'Kitchen'
     OR (v_result #>> '{placements,3,quantity}')::int <> 210 THEN
    RAISE EXCEPTION 'case_1_waste: placements must be Hall 120 · Living 320 · Dining 180 · Kitchen 210, got %',
      v_result -> 'placements';
  END IF;
  IF (SELECT sum(quantity) FROM public.project_ffe_placements
      WHERE ffe_item_id = '73440000-0000-4000-8000-000000000001') <> 830 THEN
    RAISE EXCEPTION 'case_1_waste: stored placements must sum to 830';
  END IF;

  -- One line, never a fifth room; the money stays on the line, unsplit.
  SELECT * INTO v_item FROM public.project_ffe_items WHERE id = '73440000-0000-4000-8000-000000000001';
  IF v_item.quantity <> 913 OR v_item.unit <> 'sq_ft' OR v_item.unit_price_cents <> 1150
     OR v_item.project_room_id <> '73420000-0000-4000-8000-000000000001'
     OR v_item.assignment_scope <> 'room' THEN
    RAISE EXCEPTION 'case_1_waste: the line must stay 913 sq ft at 1150 with Hall as its primary room';
  END IF;
  IF (SELECT count(*) FROM public.project_ffe_items
      WHERE project_id = '73410000-0000-4000-8000-000000000001' AND name = 'White oak floor') <> 1 THEN
    RAISE EXCEPTION 'case_1_waste: the oak floor must stay one line';
  END IF;
  IF EXISTS (SELECT 1 FROM public.project_ffe_placement_events
             WHERE ffe_item_id = '73440000-0000-4000-8000-000000000001') THEN
    RAISE EXCEPTION 'case_1_waste: a change before release or a PO is not recorded as an event';
  END IF;
END
$case_1_waste$;

-- ── The line goes on a PO ─────────────────────────────────────────────────
INSERT INTO public.purchase_orders (
  id, designer_id, project_id, vendor_id, payment_pattern, total_cents, status, is_patina_catalog
) VALUES (
  '73450000-0000-4000-8000-000000000001', '73400000-0000-4000-8000-000000000001',
  '73410000-0000-4000-8000-000000000001', '73430000-0000-4000-8000-000000000001',
  'net_30', 1049950, 'confirmed', false
);

UPDATE public.project_ffe_items
SET purchase_order_id = '73450000-0000-4000-8000-000000000001', status = 'ordered'
WHERE id = '73440000-0000-4000-8000-000000000001';

-- ── case_2_partial: 500 of 913 arrive; one integer stays on the line ─────
UPDATE public.project_ffe_items
SET received_quantity = 500
WHERE id = '73440000-0000-4000-8000-000000000001';

DO $case_2_partial$
DECLARE
  v_result jsonb;
  v_item   public.project_ffe_items%ROWTYPE;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', '73400000-0000-4000-8000-000000000001', true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  PERFORM set_config('request.jwt.claims',
    '{"sub":"73400000-0000-4000-8000-000000000001","role":"authenticated"}', true);

  -- Re-saving the same rooms after the receipt changes nothing.
  v_result := public.set_line_placements('73440000-0000-4000-8000-000000000001', '[
    {"roomId":"73420000-0000-4000-8000-000000000001","quantity":120,"areaNote":"entry and closet"},
    {"roomId":"73420000-0000-4000-8000-000000000002","quantity":320},
    {"roomId":"73420000-0000-4000-8000-000000000003","quantity":180},
    {"roomId":"73420000-0000-4000-8000-000000000004","quantity":210}
  ]'::jsonb);

  SELECT * INTO v_item FROM public.project_ffe_items WHERE id = '73440000-0000-4000-8000-000000000001';
  IF v_item.received_quantity IS DISTINCT FROM 500
     OR pg_typeof(v_item.received_quantity)::text <> 'integer' THEN
    RAISE EXCEPTION 'case_2_partial: received_quantity must stay the one integer 500 on the line';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema = 'public' AND table_name = 'project_ffe_placements'
               AND column_name ILIKE '%receiv%')
     OR EXISTS (SELECT 1 FROM jsonb_array_elements(v_result -> 'placements') e
                WHERE e.value ?| ARRAY['received', 'receivedQuantity']) THEN
    RAISE EXCEPTION 'case_2_partial: no room is allocated a receipt in phase 1';
  END IF;
  IF (v_result ->> 'wasteQuantity')::int <> 83 THEN
    RAISE EXCEPTION 'case_2_partial: wasteQuantity must still be 83';
  END IF;
  IF EXISTS (SELECT 1 FROM public.project_ffe_placement_events
             WHERE ffe_item_id = '73440000-0000-4000-8000-000000000001') THEN
    RAISE EXCEPTION 'case_2_partial: an unchanged set records no event';
  END IF;
END
$case_2_partial$;

-- ── case_3_share: Kitchen 210→240, Hall 120→90 after the PO ──────────────
DO $case_3_share$
DECLARE
  v_po_before   jsonb;
  v_po_after    jsonb;
  v_line_before jsonb;
  v_line_after  jsonb;
  v_result      jsonb;
  v_event       public.project_ffe_placement_events%ROWTYPE;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', '73400000-0000-4000-8000-000000000001', true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  PERFORM set_config('request.jwt.claims',
    '{"sub":"73400000-0000-4000-8000-000000000001","role":"authenticated"}', true);

  SELECT to_jsonb(po) INTO v_po_before FROM public.purchase_orders po
  WHERE id = '73450000-0000-4000-8000-000000000001';
  SELECT jsonb_build_object('quantity', quantity, 'unit', unit, 'unit_price_cents', unit_price_cents,
           'trade_cost_cents', to_jsonb(i) -> 'trade_cost_cents', 'item_type', item_type,
           'purchase_order_id', purchase_order_id, 'received_quantity', received_quantity,
           'project_room_id', project_room_id)
  INTO v_line_before FROM public.project_ffe_items i WHERE id = '73440000-0000-4000-8000-000000000001';

  v_result := public.set_line_placements('73440000-0000-4000-8000-000000000001', '[
    {"roomId":"73420000-0000-4000-8000-000000000001","quantity":90,"areaNote":"entry and closet"},
    {"roomId":"73420000-0000-4000-8000-000000000002","quantity":320},
    {"roomId":"73420000-0000-4000-8000-000000000003","quantity":180},
    {"roomId":"73420000-0000-4000-8000-000000000004","quantity":240}
  ]'::jsonb);

  IF (v_result ->> 'wasteQuantity')::int <> 83 THEN
    RAISE EXCEPTION 'case_3_share: the total stays 830, so waste stays 83; got %', v_result ->> 'wasteQuantity';
  END IF;

  IF (SELECT count(*) FROM public.project_ffe_placement_events
      WHERE ffe_item_id = '73440000-0000-4000-8000-000000000001') <> 1 THEN
    RAISE EXCEPTION 'case_3_share: the change after the PO must be recorded once';
  END IF;
  SELECT * INTO v_event FROM public.project_ffe_placement_events
  WHERE ffe_item_id = '73440000-0000-4000-8000-000000000001';
  IF v_event.changed_by <> '73400000-0000-4000-8000-000000000001'
     OR v_event.project_id <> '73410000-0000-4000-8000-000000000001'
     OR (v_event.before #>> '{placements,0,quantity}')::int <> 120
     OR (v_event.before #>> '{placements,3,quantity}')::int <> 210
     OR (v_event.after  #>> '{placements,0,quantity}')::int <> 90
     OR (v_event.after  #>> '{placements,3,quantity}')::int <> 240
     OR v_event.after ->> 'primaryRoomId' <> '73420000-0000-4000-8000-000000000001' THEN
    RAISE EXCEPTION 'case_3_share: the event must hold before 120/210 and after 90/240, got % → %',
      v_event.before, v_event.after;
  END IF;

  -- No PO change, no money change.
  SELECT to_jsonb(po) INTO v_po_after FROM public.purchase_orders po
  WHERE id = '73450000-0000-4000-8000-000000000001';
  SELECT jsonb_build_object('quantity', quantity, 'unit', unit, 'unit_price_cents', unit_price_cents,
           'trade_cost_cents', to_jsonb(i) -> 'trade_cost_cents', 'item_type', item_type,
           'purchase_order_id', purchase_order_id, 'received_quantity', received_quantity,
           'project_room_id', project_room_id)
  INTO v_line_after FROM public.project_ffe_items i WHERE id = '73440000-0000-4000-8000-000000000001';
  IF v_po_after IS DISTINCT FROM v_po_before THEN
    RAISE EXCEPTION 'case_3_share: the PO changed: % → %', v_po_before, v_po_after;
  END IF;
  IF v_line_after IS DISTINCT FROM v_line_before THEN
    RAISE EXCEPTION 'case_3_share: the line''s quantity or money changed: % → %', v_line_before, v_line_after;
  END IF;
END
$case_3_share$;

-- ── case_4_fit: Kitchen alone to 240 (860 ≤ 913) fits; 950 does not ──────
DO $case_4_fit$
DECLARE
  v_result jsonb;
  v_msg    text;
  v_events int;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', '73400000-0000-4000-8000-000000000001', true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  PERFORM set_config('request.jwt.claims',
    '{"sub":"73400000-0000-4000-8000-000000000001","role":"authenticated"}', true);

  v_result := public.set_line_placements('73440000-0000-4000-8000-000000000001', '[
    {"roomId":"73420000-0000-4000-8000-000000000001","quantity":120,"areaNote":"entry and closet"},
    {"roomId":"73420000-0000-4000-8000-000000000002","quantity":320},
    {"roomId":"73420000-0000-4000-8000-000000000003","quantity":180},
    {"roomId":"73420000-0000-4000-8000-000000000004","quantity":240}
  ]'::jsonb);
  IF (v_result ->> 'wasteQuantity')::int <> 53 THEN
    RAISE EXCEPTION 'case_4_fit: 860 measured fits 913 ordered, waste 53; got %', v_result ->> 'wasteQuantity';
  END IF;
  SELECT count(*) INTO v_events FROM public.project_ffe_placement_events
  WHERE ffe_item_id = '73440000-0000-4000-8000-000000000001';
  IF v_events <> 2 THEN
    RAISE EXCEPTION 'case_4_fit: the accepted 860 change must be recorded (2 events), got %', v_events;
  END IF;

  -- 950 > 913: refused, and nothing moves.
  BEGIN
    PERFORM public.set_line_placements('73440000-0000-4000-8000-000000000001', '[
      {"roomId":"73420000-0000-4000-8000-000000000001","quantity":120},
      {"roomId":"73420000-0000-4000-8000-000000000002","quantity":320},
      {"roomId":"73420000-0000-4000-8000-000000000003","quantity":180},
      {"roomId":"73420000-0000-4000-8000-000000000004","quantity":330}
    ]'::jsonb);
    RAISE EXCEPTION 'case_4_fit: 950 over 913 was accepted';
  EXCEPTION WHEN check_violation THEN
    GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
    IF v_msg <> 'The rooms add up to 950, more than the 913 on the line.' THEN RAISE; END IF;
  END;
  IF (SELECT sum(quantity) FROM public.project_ffe_placements
      WHERE ffe_item_id = '73440000-0000-4000-8000-000000000001') <> 860
     OR (SELECT count(*) FROM public.project_ffe_placement_events
         WHERE ffe_item_id = '73440000-0000-4000-8000-000000000001') <> 2 THEN
    RAISE EXCEPTION 'case_4_fit: the refused 950 must leave 860 placed and 2 events';
  END IF;

  -- 00754 (phase 3) lifted the "primary room fixed on a PO" refusal; that a
  -- primary-room change on a PO is accepted and recorded is asserted in
  -- supabase/tests/receiving/pieces_order_rooms_test.sql (case_primary).
  IF (SELECT project_room_id FROM public.project_ffe_items
      WHERE id = '73440000-0000-4000-8000-000000000001') <> '73420000-0000-4000-8000-000000000001' THEN
    RAISE EXCEPTION 'case_4_fit: Hall must stay the primary room';
  END IF;
END
$case_4_fit$;

-- ── rls: a client JWT reads 0 rows; the studio reads them ────────────────
SET LOCAL "request.jwt.claim.sub" TO '73400000-0000-4000-8000-000000000002';
SET LOCAL "request.jwt.claim.role" TO 'authenticated';
SET LOCAL "request.jwt.claims" TO '{"sub":"73400000-0000-4000-8000-000000000002","role":"authenticated"}';
SET LOCAL ROLE authenticated;

DO $rls_client$
DECLARE
  v_msg text;
BEGIN
  IF (SELECT count(*) FROM public.project_ffe_placements) <> 0 THEN
    RAISE EXCEPTION 'rls: a client JWT must read 0 placements';
  END IF;
  IF (SELECT count(*) FROM public.project_ffe_placement_events) <> 0 THEN
    RAISE EXCEPTION 'rls: a client JWT must read 0 placement events';
  END IF;

  BEGIN
    PERFORM public.set_line_placements('73440000-0000-4000-8000-000000000001', '[]'::jsonb);
    RAISE EXCEPTION 'rls: the client was allowed to set placements';
  EXCEPTION WHEN insufficient_privilege THEN
    GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
    IF v_msg <> 'project not found or access denied' THEN RAISE; END IF;
  END;

  BEGIN
    INSERT INTO public.project_ffe_placements (ffe_item_id, project_id, project_room_id, quantity)
    VALUES ('73440000-0000-4000-8000-000000000001', '73410000-0000-4000-8000-000000000001',
            '73420000-0000-4000-8000-000000000001', 1);
    RAISE EXCEPTION 'rls: a direct insert was allowed';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
END
$rls_client$;

RESET ROLE;

SET LOCAL "request.jwt.claim.sub" TO '73400000-0000-4000-8000-000000000001';
SET LOCAL "request.jwt.claims" TO '{"sub":"73400000-0000-4000-8000-000000000001","role":"authenticated"}';
SET LOCAL ROLE authenticated;

DO $rls_studio$
DECLARE
  v_msg text;
BEGIN
  IF (SELECT count(*) FROM public.project_ffe_placements
      WHERE ffe_item_id = '73440000-0000-4000-8000-000000000001') <> 4 THEN
    RAISE EXCEPTION 'rls: the studio must read its 4 placements';
  END IF;
  IF (SELECT count(*) FROM public.project_ffe_placement_events
      WHERE ffe_item_id = '73440000-0000-4000-8000-000000000001') <> 2 THEN
    RAISE EXCEPTION 'rls: the studio must read its 2 placement events';
  END IF;

  BEGIN
    UPDATE public.project_ffe_placements SET quantity = 1
    WHERE ffe_item_id = '73440000-0000-4000-8000-000000000001';
    RAISE EXCEPTION 'rls: a direct update was allowed';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
  BEGIN
    DELETE FROM public.project_ffe_placement_events
    WHERE ffe_item_id = '73440000-0000-4000-8000-000000000001';
    RAISE EXCEPTION 'rls: a direct delete of an event was allowed';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
END
$rls_studio$;

RESET ROLE;

ROLLBACK;
