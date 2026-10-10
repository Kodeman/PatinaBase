-- ═══════════════════════════════════════════════════════════════════════════
-- The line-by-line check-in names the rooms (00756; US-21 T-54, SQ-660)
--
-- direction.md §3.4 D7 case 2. Anchors: record_project_ffe_inspection
-- (00756, base 00700:373), record_project_ffe_receipt_batch (00754).
--
-- Scenario S2: one white-oak floor line, 913 sq ft, on a confirmed PO,
-- placed Hall 120 · Living 320 · Dining 180 · Kitchen 210 (830 measured),
-- received through the desktop drawer's RPC (every line has a condition).
--
-- Named cases, each one DO block:
--   case_default    500 with no placements: Hall 120 → Living 320 → Dining 60
--   case_refusals   +300 naming 210 (short of the delivery), a foreign room,
--                   an unknown key: each refused, nothing written
--   case_given      +300 as Kitchen 210 · Dining 90; the check-in line row
--   case_reused     the same request again is reused, allocates nothing
--   case_waste      the last 113 name Dining 30, all the rooms still lack
--
-- Run:
--   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -X -q \
--     -v ON_ERROR_STOP=1 -f supabase/tests/receiving/pieces_receipt_placements_test.sql
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

SET LOCAL statement_timeout = '60s';

-- ── Actors, project, rooms, lines, PO ─────────────────────────────────────
INSERT INTO auth.users (
  id, email, encrypted_password, email_confirmed_at, created_at, updated_at,
  instance_id, aud, role
) VALUES
  ('75600000-0000-4000-8000-000000000001', 'rp-designer@test.invalid', '', now(), now(), now(),
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');

INSERT INTO public.profiles (id, email, full_name, is_designer, created_at, updated_at)
VALUES ('75600000-0000-4000-8000-000000000001', 'rp-designer@test.invalid', 'RP Designer', true, now(), now())
ON CONFLICT (id) DO UPDATE
SET email = EXCLUDED.email, full_name = EXCLUDED.full_name, is_designer = EXCLUDED.is_designer;

INSERT INTO public.projects (id, name, designer_id, created_by, status)
VALUES ('75610000-0000-4000-8000-000000000001', 'Receipt rooms project',
        '75600000-0000-4000-8000-000000000001', '75600000-0000-4000-8000-000000000001', 'active');

INSERT INTO public.project_rooms (id, project_id, name, sort_order) VALUES
  ('75620000-0000-4000-8000-000000000001', '75610000-0000-4000-8000-000000000001', 'Hall', 0),
  ('75620000-0000-4000-8000-000000000002', '75610000-0000-4000-8000-000000000001', 'Living', 1),
  ('75620000-0000-4000-8000-000000000003', '75610000-0000-4000-8000-000000000001', 'Dining', 2),
  ('75620000-0000-4000-8000-000000000004', '75610000-0000-4000-8000-000000000001', 'Kitchen', 3);

INSERT INTO public.vendors (id, name)
VALUES ('75630000-0000-4000-8000-000000000001', 'RP Flooring Supply');

-- L: the oak floor. L2: a runner on another line, for the foreign-room refusal.
INSERT INTO public.project_ffe_items (
  id, project_id, name, status, quantity, unit, unit_price_cents, vendor_id,
  assignment_scope, project_room_id
) VALUES
  ('75640000-0000-4000-8000-000000000001', '75610000-0000-4000-8000-000000000001',
   'White oak floor', 'specified', 913, 'sq_ft', 1150, '75630000-0000-4000-8000-000000000001',
   'unassigned', NULL),
  ('75640000-0000-4000-8000-000000000002', '75610000-0000-4000-8000-000000000001',
   'Hall runner', 'specified', 3, 'each', 40000, '75630000-0000-4000-8000-000000000001',
   'room', '75620000-0000-4000-8000-000000000001');

DO $setup$
BEGIN
  PERFORM set_config('request.jwt.claim.sub', '75600000-0000-4000-8000-000000000001', true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  PERFORM set_config('request.jwt.claims',
    '{"sub":"75600000-0000-4000-8000-000000000001","role":"authenticated"}', true);

  PERFORM public.set_line_placements('75640000-0000-4000-8000-000000000001', '[
    {"roomId":"75620000-0000-4000-8000-000000000001","quantity":120},
    {"roomId":"75620000-0000-4000-8000-000000000002","quantity":320},
    {"roomId":"75620000-0000-4000-8000-000000000003","quantity":180},
    {"roomId":"75620000-0000-4000-8000-000000000004","quantity":210}
  ]'::jsonb);
  PERFORM public.set_line_placements('75640000-0000-4000-8000-000000000002',
    '[{"roomId":"75620000-0000-4000-8000-000000000001","quantity":3}]'::jsonb);
END
$setup$;

INSERT INTO public.purchase_orders (
  id, designer_id, project_id, vendor_id, payment_pattern, total_cents, status, is_patina_catalog
) VALUES (
  '75650000-0000-4000-8000-000000000001', '75600000-0000-4000-8000-000000000001',
  '75610000-0000-4000-8000-000000000001', '75630000-0000-4000-8000-000000000001',
  'net_30', 1049950, 'confirmed', false
);

UPDATE public.project_ffe_items
SET purchase_order_id = '75650000-0000-4000-8000-000000000001', status = 'ordered'
WHERE id = '75640000-0000-4000-8000-000000000001';

CREATE FUNCTION pg_temp.rp_placement(p_room text) RETURNS uuid
LANGUAGE sql STABLE AS $$
  SELECT placement.id
  FROM public.project_ffe_placements placement
  JOIN public.project_rooms room ON room.id = placement.project_room_id
  WHERE placement.ffe_item_id = '75640000-0000-4000-8000-000000000001' AND room.name = p_room
$$;

CREATE FUNCTION pg_temp.rp_received() RETURNS jsonb
LANGUAGE sql STABLE AS $$
  SELECT jsonb_object_agg(room.name, COALESCE((
           SELECT sum(receipt.quantity) FROM public.project_ffe_placement_receipts receipt
           WHERE receipt.placement_id = placement.id), 0))
  FROM public.project_ffe_placements placement
  JOIN public.project_rooms room ON room.id = placement.project_room_id
  WHERE placement.ffe_item_id = '75640000-0000-4000-8000-000000000001'
$$;

-- One oak-floor check-in line, good, with an optional placements list.
CREATE FUNCTION pg_temp.rp_line(p_received int, p_placements jsonb DEFAULT NULL) RETURNS jsonb
LANGUAGE sql IMMUTABLE AS $$
  SELECT jsonb_build_array(
    jsonb_build_object('selectionId', '75640000-0000-4000-8000-000000000001',
                       'receivedQuantity', p_received, 'condition', 'good')
    || CASE WHEN p_placements IS NULL THEN '{}'::jsonb
            ELSE jsonb_build_object('placements', p_placements) END)
$$;

-- ── case_default: no placements keeps the placement-order fill ───────────
DO $case_default$
DECLARE
  v_result jsonb;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', '75600000-0000-4000-8000-000000000001', true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  PERFORM set_config('request.jwt.claims',
    '{"sub":"75600000-0000-4000-8000-000000000001","role":"authenticated"}', true);

  v_result := public.record_project_ffe_inspection(
    '75650000-0000-4000-8000-000000000001', pg_temp.rp_line(500), 'partial', 'First pallets', '{}');
  IF (v_result ->> 'reused')::boolean OR v_result ->> 'inspectionId' IS NULL THEN
    RAISE EXCEPTION 'case_default: a fresh check-in must create an inspection, got %', v_result;
  END IF;
  IF pg_temp.rp_received() IS DISTINCT FROM '{"Hall":120,"Living":320,"Dining":60,"Kitchen":0}'::jsonb THEN
    RAISE EXCEPTION 'case_default: 500 must fill Hall 120 → Living 320 → Dining 60, got %', pg_temp.rp_received();
  END IF;
  IF (SELECT received_quantity FROM public.project_ffe_items
      WHERE id = '75640000-0000-4000-8000-000000000001') IS DISTINCT FROM 500 THEN
    RAISE EXCEPTION 'case_default: received_quantity must stay the one integer 500';
  END IF;
END
$case_default$;

-- ── case_refusals: the rooms must name the whole delivery ────────────────
DO $case_refusals$
DECLARE
  v_msg     text;
  v_kitchen uuid := pg_temp.rp_placement('Kitchen');
  v_runner  uuid := (SELECT id FROM public.project_ffe_placements
                     WHERE ffe_item_id = '75640000-0000-4000-8000-000000000002');
BEGIN
  PERFORM set_config('request.jwt.claim.sub', '75600000-0000-4000-8000-000000000001', true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  PERFORM set_config('request.jwt.claims',
    '{"sub":"75600000-0000-4000-8000-000000000001","role":"authenticated"}', true);

  -- 210 named from a 300 delivery the rooms could take (330 lacking).
  BEGIN
    PERFORM public.record_project_ffe_inspection(
      '75650000-0000-4000-8000-000000000001',
      pg_temp.rp_line(800, jsonb_build_array(jsonb_build_object('placementId', v_kitchen, 'quantity', 210))),
      'partial', 'Second pallets', '{}');
    RAISE EXCEPTION 'case_refusals: rooms short of the delivery were accepted';
  EXCEPTION WHEN check_violation THEN
    GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
    IF v_msg <> 'The rooms add up to 210, but this delivery brought 300 to place.' THEN RAISE; END IF;
  END;

  -- A room of another line.
  BEGIN
    PERFORM public.record_project_ffe_inspection(
      '75650000-0000-4000-8000-000000000001',
      pg_temp.rp_line(800, jsonb_build_array(jsonb_build_object('placementId', v_runner, 'quantity', 3))),
      'partial', 'Second pallets', '{}');
    RAISE EXCEPTION 'case_refusals: a room of another line was accepted';
  EXCEPTION WHEN check_violation THEN
    GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
    IF v_msg <> 'That room is not one this line is placed in.' THEN RAISE; END IF;
  END;

  -- The allow-list still refuses a key it does not know.
  BEGIN
    PERFORM public.record_project_ffe_inspection(
      '75650000-0000-4000-8000-000000000001',
      jsonb_build_array(jsonb_build_object(
        'selectionId', '75640000-0000-4000-8000-000000000001', 'receivedQuantity', 800,
        'condition', 'good', 'rooms', '[]'::jsonb)),
      'partial', 'Second pallets', '{}');
    RAISE EXCEPTION 'case_refusals: an unknown line key was accepted';
  EXCEPTION WHEN check_violation THEN
    GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
    IF v_msg NOT LIKE 'record_project_ffe_inspection: each line takes %' THEN RAISE; END IF;
  END;

  IF (SELECT received_quantity FROM public.project_ffe_items
      WHERE id = '75640000-0000-4000-8000-000000000001') IS DISTINCT FROM 500
     OR (SELECT count(*) FROM public.receiving_inspections
         WHERE purchase_order_id = '75650000-0000-4000-8000-000000000001') <> 1
     OR pg_temp.rp_received() IS DISTINCT FROM '{"Hall":120,"Living":320,"Dining":60,"Kitchen":0}'::jsonb THEN
    RAISE EXCEPTION 'case_refusals: a refused check-in left a quantity, inspection or room receipt';
  END IF;
END
$case_refusals$;

-- ── case_given: +300 as Kitchen 210 · Dining 90 ──────────────────────────
DO $case_given$
DECLARE
  v_result jsonb;
  v_inspection uuid;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', '75600000-0000-4000-8000-000000000001', true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  PERFORM set_config('request.jwt.claims',
    '{"sub":"75600000-0000-4000-8000-000000000001","role":"authenticated"}', true);

  v_result := public.record_project_ffe_inspection(
    '75650000-0000-4000-8000-000000000001',
    pg_temp.rp_line(800, jsonb_build_array(
      jsonb_build_object('placementId', pg_temp.rp_placement('Kitchen'), 'quantity', 210),
      jsonb_build_object('placementId', pg_temp.rp_placement('Dining'), 'quantity', 90))),
    'partial', 'Second pallets', '{}');
  v_inspection := (v_result ->> 'inspectionId')::uuid;

  IF pg_temp.rp_received() IS DISTINCT FROM '{"Hall":120,"Living":320,"Dining":150,"Kitchen":210}'::jsonb THEN
    RAISE EXCEPTION 'case_given: the named rooms must land as given, got %', pg_temp.rp_received();
  END IF;
  IF (SELECT received_quantity FROM public.project_ffe_items
      WHERE id = '75640000-0000-4000-8000-000000000001') IS DISTINCT FROM 800 THEN
    RAISE EXCEPTION 'case_given: received_quantity must be the one integer 800';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.receiving_inspection_lines
                 WHERE inspection_id = v_inspection
                   AND ffe_item_id = '75640000-0000-4000-8000-000000000001'
                   AND received_quantity = 800 AND condition = 'good') THEN
    RAISE EXCEPTION 'case_given: the check-in line must be recorded';
  END IF;
  IF v_result -> 'lines' -> 0 ->> 'condition' IS DISTINCT FROM 'good' THEN
    RAISE EXCEPTION 'case_given: the response lines must carry the condition, got %', v_result;
  END IF;
END
$case_given$;

-- ── case_reused: the same request allocates nothing more ─────────────────
DO $case_reused$
DECLARE
  v_result jsonb;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', '75600000-0000-4000-8000-000000000001', true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  PERFORM set_config('request.jwt.claims',
    '{"sub":"75600000-0000-4000-8000-000000000001","role":"authenticated"}', true);

  v_result := public.record_project_ffe_inspection(
    '75650000-0000-4000-8000-000000000001',
    pg_temp.rp_line(800, jsonb_build_array(
      jsonb_build_object('placementId', pg_temp.rp_placement('Kitchen'), 'quantity', 210),
      jsonb_build_object('placementId', pg_temp.rp_placement('Dining'), 'quantity', 90))),
    'partial', 'Second pallets', '{}');
  IF NOT (v_result ->> 'reused')::boolean THEN
    RAISE EXCEPTION 'case_reused: the retry must be reused, got %', v_result;
  END IF;
  IF pg_temp.rp_received() IS DISTINCT FROM '{"Hall":120,"Living":320,"Dining":150,"Kitchen":210}'::jsonb THEN
    RAISE EXCEPTION 'case_reused: a reused request must not allocate again, got %', pg_temp.rp_received();
  END IF;
END
$case_reused$;

-- ── case_waste: the last 113 name all the rooms still lack ───────────────
DO $case_waste$
BEGIN
  PERFORM set_config('request.jwt.claim.sub', '75600000-0000-4000-8000-000000000001', true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  PERFORM set_config('request.jwt.claims',
    '{"sub":"75600000-0000-4000-8000-000000000001","role":"authenticated"}', true);

  PERFORM public.record_project_ffe_inspection(
    '75650000-0000-4000-8000-000000000001',
    pg_temp.rp_line(913, jsonb_build_array(
      jsonb_build_object('placementId', pg_temp.rp_placement('Dining'), 'quantity', 30))),
    'clean', 'Last pallets', '{}');
  IF pg_temp.rp_received() IS DISTINCT FROM '{"Hall":120,"Living":320,"Dining":180,"Kitchen":210}'::jsonb THEN
    RAISE EXCEPTION 'case_waste: Dining 30 must fill the rooms and leave 83 in none, got %', pg_temp.rp_received();
  END IF;
  IF (SELECT received_quantity FROM public.project_ffe_items
      WHERE id = '75640000-0000-4000-8000-000000000001') IS DISTINCT FROM 913 THEN
    RAISE EXCEPTION 'case_waste: received_quantity must be the one integer 913';
  END IF;
END
$case_waste$;

\echo 'pieces_receipt_placements_test: all cases passed'

ROLLBACK;
