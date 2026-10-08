-- ═══════════════════════════════════════════════════════════════════════════
-- Receiving by room, room placements phase 3 (00754; US-21 T-48, SQ-654)
--
-- CONTRACT §2 W5 "00754"; direction.md §3.4 D7 case 2; ruling Q4.
-- Anchors: record_project_ffe_receipt_batch (00754, base 00493:83, impl
-- 00446:19), set_line_placements (00754, base 00737:841),
-- project_ffe_placement_receipts (00754), can_buy_for_project (00702:60).
--
-- Scenario S2: one white-oak floor line, 913 sq ft, on a confirmed PO,
-- placed Hall 120 · Living 320 · Dining 180 · Kitchen 210 (830 measured).
--
-- Named cases, each one DO block:
--   case_default    500 of 913 arrive: Hall 120 → Living 320 → Dining 60;
--                   received_quantity stays the one integer 500
--   case_reused     the same request again allocates nothing more
--   case_given      +300 given as Kitchen 210 · Dining 90; refusals for a
--                   foreign placement, over the delivery, over the room
--   case_waste      the last 113 fill Dining 30 and leave 83 in no room
--   case_primary    the primary room may change while on the PO; recorded;
--                   a kept room keeps its receipts
--   rls             a client JWT reads 0 receipts; the studio reads them;
--                   direct writes refused
--
-- Run:
--   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -X -q \
--     -v ON_ERROR_STOP=1 -f supabase/tests/receiving/pieces_order_rooms_test.sql
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

SET LOCAL statement_timeout = '60s';

-- ── Actors, project, rooms, line, PO ──────────────────────────────────────
INSERT INTO auth.users (
  id, email, encrypted_password, email_confirmed_at, created_at, updated_at,
  instance_id, aud, role
) VALUES
  ('75400000-0000-4000-8000-000000000001', 'or-designer@test.invalid', '', now(), now(), now(),
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('75400000-0000-4000-8000-000000000002', 'or-client@test.invalid', '', now(), now(), now(),
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');

INSERT INTO public.profiles (id, email, full_name, is_designer, created_at, updated_at)
VALUES
  ('75400000-0000-4000-8000-000000000001', 'or-designer@test.invalid', 'OR Designer', true, now(), now()),
  ('75400000-0000-4000-8000-000000000002', 'or-client@test.invalid', 'OR Client', false, now(), now())
ON CONFLICT (id) DO UPDATE
SET email = EXCLUDED.email, full_name = EXCLUDED.full_name, is_designer = EXCLUDED.is_designer;

INSERT INTO public.projects (id, name, designer_id, client_id, created_by, status)
VALUES ('75410000-0000-4000-8000-000000000001', 'Order rooms project',
        '75400000-0000-4000-8000-000000000001', '75400000-0000-4000-8000-000000000002',
        '75400000-0000-4000-8000-000000000001', 'active');

INSERT INTO public.project_rooms (id, project_id, name, sort_order) VALUES
  ('75420000-0000-4000-8000-000000000001', '75410000-0000-4000-8000-000000000001', 'Hall', 0),
  ('75420000-0000-4000-8000-000000000002', '75410000-0000-4000-8000-000000000001', 'Living', 1),
  ('75420000-0000-4000-8000-000000000003', '75410000-0000-4000-8000-000000000001', 'Dining', 2),
  ('75420000-0000-4000-8000-000000000004', '75410000-0000-4000-8000-000000000001', 'Kitchen', 3);

INSERT INTO public.vendors (id, name)
VALUES ('75430000-0000-4000-8000-000000000001', 'OR Flooring Supply');

-- L: the oak floor. L2: a runner on another line, for the foreign-placement refusal.
INSERT INTO public.project_ffe_items (
  id, project_id, name, status, quantity, unit, unit_price_cents, vendor_id,
  assignment_scope, project_room_id
) VALUES
  ('75440000-0000-4000-8000-000000000001', '75410000-0000-4000-8000-000000000001',
   'White oak floor', 'specified', 913, 'sq_ft', 1150, '75430000-0000-4000-8000-000000000001',
   'unassigned', NULL),
  ('75440000-0000-4000-8000-000000000002', '75410000-0000-4000-8000-000000000001',
   'Hall runner', 'specified', 3, 'each', 40000, '75430000-0000-4000-8000-000000000001',
   'room', '75420000-0000-4000-8000-000000000001');

DO $setup$
BEGIN
  PERFORM set_config('request.jwt.claim.sub', '75400000-0000-4000-8000-000000000001', true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  PERFORM set_config('request.jwt.claims',
    '{"sub":"75400000-0000-4000-8000-000000000001","role":"authenticated"}', true);

  PERFORM public.set_line_placements('75440000-0000-4000-8000-000000000001', '[
    {"roomId":"75420000-0000-4000-8000-000000000001","quantity":120},
    {"roomId":"75420000-0000-4000-8000-000000000002","quantity":320},
    {"roomId":"75420000-0000-4000-8000-000000000003","quantity":180},
    {"roomId":"75420000-0000-4000-8000-000000000004","quantity":210}
  ]'::jsonb);
  PERFORM public.set_line_placements('75440000-0000-4000-8000-000000000002',
    '[{"roomId":"75420000-0000-4000-8000-000000000001","quantity":3}]'::jsonb);
END
$setup$;

INSERT INTO public.purchase_orders (
  id, designer_id, project_id, vendor_id, payment_pattern, total_cents, status, is_patina_catalog
) VALUES (
  '75450000-0000-4000-8000-000000000001', '75400000-0000-4000-8000-000000000001',
  '75410000-0000-4000-8000-000000000001', '75430000-0000-4000-8000-000000000001',
  'net_30', 1049950, 'confirmed', false
);

UPDATE public.project_ffe_items
SET purchase_order_id = '75450000-0000-4000-8000-000000000001', status = 'ordered'
WHERE id = '75440000-0000-4000-8000-000000000001';

-- Placement id of a room on the oak floor.
CREATE FUNCTION pg_temp.or_placement(p_room text) RETURNS uuid
LANGUAGE sql STABLE AS $$
  SELECT placement.id
  FROM public.project_ffe_placements placement
  JOIN public.project_rooms room ON room.id = placement.project_room_id
  WHERE placement.ffe_item_id = '75440000-0000-4000-8000-000000000001' AND room.name = p_room
$$;

-- Received so far per room on the oak floor, as {Hall: n, Living: n, ...}.
CREATE FUNCTION pg_temp.or_received() RETURNS jsonb
LANGUAGE sql STABLE AS $$
  SELECT jsonb_object_agg(room.name, COALESCE((
           SELECT sum(receipt.quantity) FROM public.project_ffe_placement_receipts receipt
           WHERE receipt.placement_id = placement.id), 0))
  FROM public.project_ffe_placements placement
  JOIN public.project_rooms room ON room.id = placement.project_room_id
  WHERE placement.ffe_item_id = '75440000-0000-4000-8000-000000000001'
$$;

-- ── case_default: 500 of 913 → Hall 120, Living 320, Dining 60 ───────────
DO $case_default$
DECLARE
  v_result jsonb;
  v_item   public.project_ffe_items%ROWTYPE;
  v_rooms  jsonb;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', '75400000-0000-4000-8000-000000000001', true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  PERFORM set_config('request.jwt.claims',
    '{"sub":"75400000-0000-4000-8000-000000000001","role":"authenticated"}', true);

  v_result := public.record_project_ffe_receipt_batch(
    '75450000-0000-4000-8000-000000000001',
    '[{"selectionId":"75440000-0000-4000-8000-000000000001","receivedQuantity":500}]'::jsonb,
    'partial', 'First pallets', '{}');

  IF (v_result ->> 'reused')::boolean OR v_result ->> 'inspectionId' IS NULL THEN
    RAISE EXCEPTION 'case_default: a fresh receipt must create an inspection, got %', v_result;
  END IF;

  v_rooms := pg_temp.or_received();
  IF v_rooms IS DISTINCT FROM '{"Hall":120,"Living":320,"Dining":60,"Kitchen":0}'::jsonb THEN
    RAISE EXCEPTION 'case_default: 500 must fill Hall 120 → Living 320 → Dining 60, got %', v_rooms;
  END IF;
  IF (SELECT count(*) FROM public.project_ffe_placement_receipts
      WHERE receipt_batch_id = (v_result ->> 'inspectionId')::uuid) <> 3 THEN
    RAISE EXCEPTION 'case_default: the batch must write three room receipts (none for Kitchen)';
  END IF;

  -- D7 case 2: the line keeps one integer.
  SELECT * INTO v_item FROM public.project_ffe_items WHERE id = '75440000-0000-4000-8000-000000000001';
  IF v_item.received_quantity IS DISTINCT FROM 500
     OR pg_typeof(v_item.received_quantity)::text <> 'integer'
     OR v_item.quantity <> 913 THEN
    RAISE EXCEPTION 'case_default: received_quantity must stay the one integer 500 of 913, got % of %',
      v_item.received_quantity, v_item.quantity;
  END IF;
  IF (SELECT count(*) FROM public.project_ffe_items
      WHERE project_id = '75410000-0000-4000-8000-000000000001' AND name = 'White oak floor') <> 1 THEN
    RAISE EXCEPTION 'case_default: the oak floor must stay one line';
  END IF;
END
$case_default$;

-- ── case_reused: the same request allocates nothing more ─────────────────
DO $case_reused$
DECLARE
  v_result jsonb;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', '75400000-0000-4000-8000-000000000001', true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  PERFORM set_config('request.jwt.claims',
    '{"sub":"75400000-0000-4000-8000-000000000001","role":"authenticated"}', true);

  v_result := public.record_project_ffe_receipt_batch(
    '75450000-0000-4000-8000-000000000001',
    '[{"selectionId":"75440000-0000-4000-8000-000000000001","receivedQuantity":500}]'::jsonb,
    'partial', 'First pallets', '{}');
  IF NOT (v_result ->> 'reused')::boolean THEN
    RAISE EXCEPTION 'case_reused: the retry must be reused, got %', v_result;
  END IF;
  IF pg_temp.or_received() IS DISTINCT FROM '{"Hall":120,"Living":320,"Dining":60,"Kitchen":0}'::jsonb
     OR (SELECT count(*) FROM public.project_ffe_placement_receipts receipt
         JOIN public.project_ffe_placements placement ON placement.id = receipt.placement_id
         WHERE placement.ffe_item_id = '75440000-0000-4000-8000-000000000001') <> 3 THEN
    RAISE EXCEPTION 'case_reused: a reused request must not allocate again, got %', pg_temp.or_received();
  END IF;
END
$case_reused$;

-- ── case_given: +300 as given, and the refusals ──────────────────────────
DO $case_given$
DECLARE
  v_result jsonb;
  v_msg    text;
  v_kitchen uuid := pg_temp.or_placement('Kitchen');
  v_dining  uuid := pg_temp.or_placement('Dining');
  v_runner  uuid := (SELECT id FROM public.project_ffe_placements
                     WHERE ffe_item_id = '75440000-0000-4000-8000-000000000002');
BEGIN
  PERFORM set_config('request.jwt.claim.sub', '75400000-0000-4000-8000-000000000001', true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  PERFORM set_config('request.jwt.claims',
    '{"sub":"75400000-0000-4000-8000-000000000001","role":"authenticated"}', true);

  -- A placement of another line is refused.
  BEGIN
    PERFORM public.record_project_ffe_receipt_batch(
      '75450000-0000-4000-8000-000000000001',
      jsonb_build_array(jsonb_build_object(
        'selectionId', '75440000-0000-4000-8000-000000000001', 'receivedQuantity', 800,
        'placements', jsonb_build_array(jsonb_build_object('placementId', v_runner, 'quantity', 3)))),
      'partial', 'Second pallets', '{}');
    RAISE EXCEPTION 'case_given: a placement of another line was accepted';
  EXCEPTION WHEN check_violation THEN
    GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
    IF v_msg <> 'That room is not one this line is placed in.' THEN RAISE; END IF;
  END;

  -- More than the delivery brought (300) is refused.
  BEGIN
    PERFORM public.record_project_ffe_receipt_batch(
      '75450000-0000-4000-8000-000000000001',
      jsonb_build_array(jsonb_build_object(
        'selectionId', '75440000-0000-4000-8000-000000000001', 'receivedQuantity', 800,
        'placements', jsonb_build_array(
          jsonb_build_object('placementId', v_kitchen, 'quantity', 210),
          jsonb_build_object('placementId', v_dining, 'quantity', 120)))),
      'partial', 'Second pallets', '{}');
    RAISE EXCEPTION 'case_given: 330 given from a 300 delivery was accepted';
  EXCEPTION WHEN check_violation THEN
    GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
    IF v_msg <> 'The rooms are given 330, more than the 300 this delivery brought.' THEN RAISE; END IF;
  END;

  -- More than a room holds (Dining 60 received + 150 > 180) is refused.
  BEGIN
    PERFORM public.record_project_ffe_receipt_batch(
      '75450000-0000-4000-8000-000000000001',
      jsonb_build_array(jsonb_build_object(
        'selectionId', '75440000-0000-4000-8000-000000000001', 'receivedQuantity', 800,
        'placements', jsonb_build_array(jsonb_build_object('placementId', v_dining, 'quantity', 150)))),
      'partial', 'Second pallets', '{}');
    RAISE EXCEPTION 'case_given: Dining over its 180 was accepted';
  EXCEPTION WHEN check_violation THEN
    GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
    IF v_msg <> 'A room cannot receive more than is placed there.' THEN RAISE; END IF;
  END;

  -- A malformed placements entry is refused before anything runs.
  BEGIN
    PERFORM public.record_project_ffe_receipt_batch(
      '75450000-0000-4000-8000-000000000001',
      jsonb_build_array(jsonb_build_object(
        'selectionId', '75440000-0000-4000-8000-000000000001', 'receivedQuantity', 800,
        'placements', jsonb_build_array(jsonb_build_object('placementId', v_dining, 'quantity', 1.5)))),
      'partial', 'Second pallets', '{}');
    RAISE EXCEPTION 'case_given: a fractional room receipt was accepted';
  EXCEPTION WHEN check_violation THEN
    GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
    IF v_msg <> 'placements must be a list of placementId and quantity entries' THEN RAISE; END IF;
  END;

  -- Every refusal rolled back the whole batch.
  IF (SELECT received_quantity FROM public.project_ffe_items
      WHERE id = '75440000-0000-4000-8000-000000000001') IS DISTINCT FROM 500
     OR (SELECT count(*) FROM public.receiving_inspections
         WHERE purchase_order_id = '75450000-0000-4000-8000-000000000001') <> 1
     OR pg_temp.or_received() IS DISTINCT FROM '{"Hall":120,"Living":320,"Dining":60,"Kitchen":0}'::jsonb THEN
    RAISE EXCEPTION 'case_given: a refused batch left a quantity, inspection or room receipt';
  END IF;

  -- As given: Kitchen 210, Dining 90 out of +300.
  v_result := public.record_project_ffe_receipt_batch(
    '75450000-0000-4000-8000-000000000001',
    jsonb_build_array(jsonb_build_object(
      'selectionId', '75440000-0000-4000-8000-000000000001', 'receivedQuantity', 800,
      'placements', jsonb_build_array(
        jsonb_build_object('placementId', v_kitchen, 'quantity', 210),
        jsonb_build_object('placementId', v_dining, 'quantity', 90)))),
    'partial', 'Second pallets', '{}');
  IF pg_temp.or_received() IS DISTINCT FROM '{"Hall":120,"Living":320,"Dining":150,"Kitchen":210}'::jsonb THEN
    RAISE EXCEPTION 'case_given: the given split must land as given, got %', pg_temp.or_received();
  END IF;
  IF (SELECT received_quantity FROM public.project_ffe_items
      WHERE id = '75440000-0000-4000-8000-000000000001') IS DISTINCT FROM 800 THEN
    RAISE EXCEPTION 'case_given: received_quantity must be the one integer 800';
  END IF;
  IF (SELECT count(*) FROM public.project_ffe_placement_receipts
      WHERE receipt_batch_id = (v_result ->> 'inspectionId')::uuid) <> 2 THEN
    RAISE EXCEPTION 'case_given: the second batch must write two room receipts';
  END IF;
END
$case_given$;

-- ── case_waste: the last 113 fill Dining 30; 83 are in no room ───────────
DO $case_waste$
BEGIN
  PERFORM set_config('request.jwt.claim.sub', '75400000-0000-4000-8000-000000000001', true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  PERFORM set_config('request.jwt.claims',
    '{"sub":"75400000-0000-4000-8000-000000000001","role":"authenticated"}', true);

  PERFORM public.record_project_ffe_receipt_batch(
    '75450000-0000-4000-8000-000000000001',
    '[{"selectionId":"75440000-0000-4000-8000-000000000001","receivedQuantity":913}]'::jsonb,
    'clean', 'Last pallets', '{}');
  IF pg_temp.or_received() IS DISTINCT FROM '{"Hall":120,"Living":320,"Dining":180,"Kitchen":210}'::jsonb THEN
    RAISE EXCEPTION 'case_waste: every room must be full at 830, got %', pg_temp.or_received();
  END IF;
  IF (SELECT received_quantity FROM public.project_ffe_items
      WHERE id = '75440000-0000-4000-8000-000000000001') - 830 IS DISTINCT FROM 83 THEN
    RAISE EXCEPTION 'case_waste: 913 received over 830 roomed must leave 83 in no room';
  END IF;
END
$case_waste$;

-- ── case_primary: the primary room may change while on the PO ────────────
DO $case_primary$
DECLARE
  v_result jsonb;
  v_hall   uuid := pg_temp.or_placement('Hall');
  v_event  public.project_ffe_placement_events%ROWTYPE;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', '75400000-0000-4000-8000-000000000001', true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  PERFORM set_config('request.jwt.claims',
    '{"sub":"75400000-0000-4000-8000-000000000001","role":"authenticated"}', true);

  v_result := public.set_line_placements('75440000-0000-4000-8000-000000000001', '[
    {"roomId":"75420000-0000-4000-8000-000000000002","quantity":320},
    {"roomId":"75420000-0000-4000-8000-000000000001","quantity":120},
    {"roomId":"75420000-0000-4000-8000-000000000003","quantity":180},
    {"roomId":"75420000-0000-4000-8000-000000000004","quantity":210}
  ]'::jsonb);

  IF (SELECT project_room_id FROM public.project_ffe_items
      WHERE id = '75440000-0000-4000-8000-000000000001') IS DISTINCT FROM '75420000-0000-4000-8000-000000000002' THEN
    RAISE EXCEPTION 'case_primary: Living must now be the primary room on the PO';
  END IF;
  IF (SELECT purchase_order_id FROM public.project_ffe_items
      WHERE id = '75440000-0000-4000-8000-000000000001') IS DISTINCT FROM '75450000-0000-4000-8000-000000000001' THEN
    RAISE EXCEPTION 'case_primary: the line must stay on its PO';
  END IF;

  SELECT * INTO v_event FROM public.project_ffe_placement_events
  WHERE ffe_item_id = '75440000-0000-4000-8000-000000000001'
  ORDER BY changed_at DESC, id DESC LIMIT 1;
  IF v_event.id IS NULL
     OR v_event.before ->> 'primaryRoomId' IS DISTINCT FROM '75420000-0000-4000-8000-000000000001'
     OR v_event.after  ->> 'primaryRoomId' IS DISTINCT FROM '75420000-0000-4000-8000-000000000002' THEN
    RAISE EXCEPTION 'case_primary: the change must be recorded Hall → Living, got %', to_jsonb(v_event);
  END IF;

  -- A kept room keeps its placement id and its receipts.
  IF pg_temp.or_placement('Hall') IS DISTINCT FROM v_hall
     OR pg_temp.or_received() IS DISTINCT FROM '{"Hall":120,"Living":320,"Dining":180,"Kitchen":210}'::jsonb THEN
    RAISE EXCEPTION 'case_primary: reordering the rooms must keep their receipts, got %', pg_temp.or_received();
  END IF;
END
$case_primary$;

-- ── rls: a client JWT reads 0 receipts; the studio reads them ────────────
SET LOCAL "request.jwt.claim.sub" TO '75400000-0000-4000-8000-000000000002';
SET LOCAL "request.jwt.claim.role" TO 'authenticated';
SET LOCAL "request.jwt.claims" TO '{"sub":"75400000-0000-4000-8000-000000000002","role":"authenticated"}';
SET LOCAL ROLE authenticated;

DO $rls_client$
BEGIN
  IF (SELECT count(*) FROM public.project_ffe_placement_receipts) <> 0 THEN
    RAISE EXCEPTION 'rls: a client JWT must read 0 room receipts';
  END IF;
END
$rls_client$;

RESET ROLE;

SET LOCAL "request.jwt.claim.sub" TO '75400000-0000-4000-8000-000000000001';
SET LOCAL "request.jwt.claims" TO '{"sub":"75400000-0000-4000-8000-000000000001","role":"authenticated"}';
SET LOCAL ROLE authenticated;

DO $rls_studio$
BEGIN
  IF (SELECT sum(receipt.quantity) FROM public.project_ffe_placement_receipts receipt
      JOIN public.project_ffe_placements placement ON placement.id = receipt.placement_id
      WHERE placement.ffe_item_id = '75440000-0000-4000-8000-000000000001') IS DISTINCT FROM 830 THEN
    RAISE EXCEPTION 'rls: the studio must read its 830 roomed';
  END IF;

  BEGIN
    INSERT INTO public.project_ffe_placement_receipts (placement_id, receipt_batch_id, quantity)
    SELECT receipt.placement_id, receipt.receipt_batch_id, 1
    FROM public.project_ffe_placement_receipts receipt LIMIT 1;
    RAISE EXCEPTION 'rls: a direct insert was allowed';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
  BEGIN
    UPDATE public.project_ffe_placement_receipts SET quantity = 1;
    RAISE EXCEPTION 'rls: a direct update was allowed';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
  BEGIN
    DELETE FROM public.project_ffe_placement_receipts;
    RAISE EXCEPTION 'rls: a direct delete was allowed';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
END
$rls_studio$;

RESET ROLE;

ROLLBACK;
