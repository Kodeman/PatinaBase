-- ═══════════════════════════════════════════════════════════════════════════
-- US-21 T-55c — W5 residuals (migration 00759; SQ-695, from SQ-691 / SQ-661)
--
-- Anchors: triage_project_ffe_items (base 00758:935); set_line_placements
-- (base 00758:696). S3 (one open draft) was dropped by ruling; see 00759.
--
-- Studio owner O, client C. One project, room Hall.
--   R      runner, 4 each, on an executed authorization and a confirmed PO,
--          placed Hall 4; 2 received into Hall
--   N      bench, placed Hall 1, nothing received
--
-- Named cases, one DO block each, every one with a named ASSERT:
--   S2_triage_keeps_received   Move to no room refuses a received placement and
--                              keeps its receipts; an unreceived one is dropped
--   S4_auth_before_existence   set_line_placements on an unknown line reads like
--                              an unreachable one
--
-- How to run (local stack, after applying 00759):
--   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" \
--     -X -v ON_ERROR_STOP=1 -f supabase/tests/commercial/pieces_w5_residuals_test.sql
--
-- One transaction, rolled back at the end.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

SET LOCAL timezone TO 'UTC';
SET LOCAL statement_timeout = '60s';

CREATE OR REPLACE FUNCTION pg_temp.t55c_as(p_actor uuid) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', p_actor, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', p_actor::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
END;
$$;

-- Runs p_sql and returns 'code|message' for the error it raised, or NULL.
CREATE OR REPLACE FUNCTION pg_temp.t55c_refusal(p_sql text) RETURNS text LANGUAGE plpgsql AS $$
DECLARE v_state text; v_message text;
BEGIN
  EXECUTE p_sql;
  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  GET STACKED DIAGNOSTICS v_state = RETURNED_SQLSTATE, v_message = MESSAGE_TEXT;
  RETURN v_state || '|' || v_message;
END;
$$;

-- ─── fixtures (as postgres) ────────────────────────────────────────────────

INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, instance_id, aud, role)
VALUES
  ('75900000-0000-4000-8000-0000000000a1', 't55c-owner@test.invalid', '', NOW(), NOW(), NOW(),
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('75900000-0000-4000-8000-0000000000a2', 't55c-client@test.invalid', '', NOW(), NOW(), NOW(),
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');

INSERT INTO profiles (id, email, full_name, is_designer, created_at, updated_at)
VALUES
  ('75900000-0000-4000-8000-0000000000a1', 't55c-owner@test.invalid', 'T55c Owner', true, NOW(), NOW()),
  ('75900000-0000-4000-8000-0000000000a2', 't55c-client@test.invalid', 'T55c Client', false, NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

INSERT INTO organizations (id, type, name, slug)
VALUES ('75900000-0000-4000-8000-0000000000f1', 'design_studio', 'T55c Studio', 't55c-studio-test');

INSERT INTO organization_members (id, user_id, organization_id, role, status, joined_at)
VALUES ('75900000-0000-4000-8000-0000000000e1', '75900000-0000-4000-8000-0000000000a1',
        '75900000-0000-4000-8000-0000000000f1', 'owner', 'active', NOW());

INSERT INTO projects (id, name, designer_id, client_id, created_by, studio_id)
VALUES ('75900000-0000-4000-8000-000000000001', 'T55c Main Level', '75900000-0000-4000-8000-0000000000a1',
        '75900000-0000-4000-8000-0000000000a2', '75900000-0000-4000-8000-0000000000a1',
        '75900000-0000-4000-8000-0000000000f1');

INSERT INTO project_rooms (id, project_id, name, sort_order)
VALUES
  ('75900000-0000-4000-8000-0000000000c1', '75900000-0000-4000-8000-000000000001', 'Hall', 0);

INSERT INTO vendors (id, name)
VALUES ('75900000-0000-4000-8000-000000000011', 'T55c Workroom');

SELECT set_config('app.ffe_mutation_rpc', 'on', true);
INSERT INTO project_ffe_items (id, project_id, project_room_id, assignment_scope, name, status, item_type,
                               quantity, unit, unit_price_cents, trade_price_cents, line_total_cents,
                               vendor_id, vendor_name, design_disposition, sort_order)
VALUES
  ('75900000-0000-4000-8000-000000000221', '75900000-0000-4000-8000-000000000001', '75900000-0000-4000-8000-0000000000c1', 'room',
   'R Runner', 'specified', 'fixed', 4, 'each', 10000, 7000, 40000,
   '75900000-0000-4000-8000-000000000011', 'T55c Workroom', 'selected', 0),
  ('75900000-0000-4000-8000-000000000222', '75900000-0000-4000-8000-000000000001', '75900000-0000-4000-8000-0000000000c1', 'room',
   'N Bench', 'specified', 'fixed', 1, 'each', 50000, 30000, 50000,
   '75900000-0000-4000-8000-000000000011', 'T55c Workroom', 'selected', 1);
SELECT set_config('app.ffe_mutation_rpc', '', true);

-- R is covered by an executed authorization, then ordered.
INSERT INTO proposals (id, project_id, designer_id, client_id, title, status, document_kind, commercial_state,
                       total_amount, subtotal, sent_at)
VALUES ('75900000-0000-4000-8000-000000000510', '75900000-0000-4000-8000-000000000001',
        '75900000-0000-4000-8000-0000000000a1', '75900000-0000-4000-8000-0000000000a2',
        'T55c Authorization No. 0', 'accepted', 'furnishings_authorization', 'executed', 40000, 40000, now());
INSERT INTO project_commercial_documents (id, project_id, proposal_id, document_kind, wave_name, is_origin,
                                          bound_at, executed_at, created_by)
VALUES ('75900000-0000-4000-8000-000000000610', '75900000-0000-4000-8000-000000000001',
        '75900000-0000-4000-8000-000000000510', 'furnishings_authorization', 'Authorization No. 0', false,
        now(), now(), '75900000-0000-4000-8000-0000000000a1');
INSERT INTO furnishing_authorization_items (id, commercial_document_id, source_ffe_item_id, project_room_id,
                                            name, room_name, category, item_type, quantity,
                                            client_unit_price_cents, client_line_total_cents, snapshot, sort_order)
VALUES ('75900000-0000-4000-8000-000000000611', '75900000-0000-4000-8000-000000000610',
        '75900000-0000-4000-8000-000000000221', '75900000-0000-4000-8000-0000000000c1',
        'R Runner', 'Hall', 'Rugs', 'fixed', 4, 10000, 40000, '{}'::jsonb, 0);
INSERT INTO purchase_orders (id, designer_id, project_id, vendor_id, payment_pattern, total_cents, status, is_patina_catalog)
VALUES ('75900000-0000-4000-8000-000000000901', '75900000-0000-4000-8000-0000000000a1',
        '75900000-0000-4000-8000-000000000001', '75900000-0000-4000-8000-000000000011',
        'net_30', 28000, 'confirmed', false);
-- The PO link trigger wants an authenticated actor.
SELECT pg_temp.t55c_as('75900000-0000-4000-8000-0000000000a1');
SELECT set_config('app.ffe_mutation_rpc', 'on', true);
UPDATE project_ffe_items
   SET source_commercial_document_id = '75900000-0000-4000-8000-000000000610',
       source_authorization_item_id = '75900000-0000-4000-8000-000000000611'
 WHERE id = '75900000-0000-4000-8000-000000000221';
UPDATE project_ffe_items SET purchase_order_id = '75900000-0000-4000-8000-000000000901', status = 'ordered'
 WHERE id = '75900000-0000-4000-8000-000000000221';
SELECT set_config('app.ffe_mutation_rpc', '', true);

-- Placements and R's first delivery, as the studio.
DO $$
DECLARE
  v_hall uuid;
BEGIN
  PERFORM pg_temp.t55c_as('75900000-0000-4000-8000-0000000000a1');

  PERFORM public.set_line_placements('75900000-0000-4000-8000-000000000221',
    '[{"roomId":"75900000-0000-4000-8000-0000000000c1","quantity":4}]'::jsonb);
  PERFORM public.set_line_placements('75900000-0000-4000-8000-000000000222',
    '[{"roomId":"75900000-0000-4000-8000-0000000000c1","quantity":1}]'::jsonb);

  SELECT p.id INTO v_hall FROM public.project_ffe_placements p
  WHERE p.ffe_item_id = '75900000-0000-4000-8000-000000000221';
  PERFORM public.record_project_ffe_receipt_batch('75900000-0000-4000-8000-000000000901',
    jsonb_build_array(jsonb_build_object('selectionId', '75900000-0000-4000-8000-000000000221',
      'receivedQuantity', 2, 'placements', jsonb_build_array(
        jsonb_build_object('placementId', v_hall, 'quantity', 2)))),
    'partial', 'First boxes', '{}');
  ASSERT (SELECT sum(quantity) FROM public.project_ffe_placement_receipts WHERE placement_id = v_hall) = 2,
    'setup: Hall has received 2 of R';
END $$;

-- ─── S2_triage_keeps_received ──────────────────────────────────────────────

DO $S2_triage_keeps_received$
DECLARE
  v_err text;
BEGIN
  PERFORM pg_temp.t55c_as('75900000-0000-4000-8000-0000000000a1');

  v_err := pg_temp.t55c_refusal($q$SELECT public.triage_project_ffe_items(jsonb_build_object(
    'projectId', '75900000-0000-4000-8000-000000000001',
    'selectionIds', jsonb_build_array('75900000-0000-4000-8000-000000000221'),
    'assignmentScope', 'throughout'))$q$);
  ASSERT v_err = '23514|Hall has already received 2. Record a change instead.',
    format('S2_received_placement_refuses_move_to_no_room: got %s', v_err);
  ASSERT (SELECT sum(r.quantity) FROM public.project_ffe_placement_receipts r
          JOIN public.project_ffe_placements p ON p.id = r.placement_id
          WHERE p.ffe_item_id = '75900000-0000-4000-8000-000000000221') = 2
     AND (SELECT project_room_id FROM public.project_ffe_items
          WHERE id = '75900000-0000-4000-8000-000000000221') = '75900000-0000-4000-8000-0000000000c1',
    'S2_receipts_and_room_survive: R stays in Hall with its 2 received';

  -- Nothing received: the placement is dropped as before.
  PERFORM public.triage_project_ffe_items(jsonb_build_object(
    'projectId', '75900000-0000-4000-8000-000000000001',
    'selectionIds', jsonb_build_array('75900000-0000-4000-8000-000000000222'),
    'assignmentScope', 'unassigned'));
  ASSERT NOT EXISTS (SELECT 1 FROM public.project_ffe_placements
                     WHERE ffe_item_id = '75900000-0000-4000-8000-000000000222')
     AND (SELECT project_room_id IS NULL AND assignment_scope = 'unassigned' FROM public.project_ffe_items
          WHERE id = '75900000-0000-4000-8000-000000000222'),
    'S2_unreceived_placement_dropped: N moves to unassigned without its placement';

  RAISE NOTICE 'PASS S2_triage_keeps_received: Move to no room never deletes a receipt';
END
$S2_triage_keeps_received$;

-- ─── S4_auth_before_existence ──────────────────────────────────────────────

DO $S4_auth_before_existence$
DECLARE
  v_known text;
  v_unknown text;
  v_owner_unknown text;
  c_denied CONSTANT text := '42501|project not found or access denied';
  c_rooms CONSTANT text := '[{"roomId":"75900000-0000-4000-8000-0000000000c1","quantity":1}]';
BEGIN
  -- The client cannot buy for the project: a real line and an unknown one
  -- answer the same.
  PERFORM pg_temp.t55c_as('75900000-0000-4000-8000-0000000000a2');
  v_known := pg_temp.t55c_refusal(format($q$SELECT public.set_line_placements(
    '75900000-0000-4000-8000-000000000222', %L::jsonb)$q$, c_rooms));
  v_unknown := pg_temp.t55c_refusal(format($q$SELECT public.set_line_placements(
    '75900000-0000-4000-8000-0000000002ff', %L::jsonb)$q$, c_rooms));
  ASSERT v_known = c_denied AND v_unknown = c_denied,
    format('S4_unknown_reads_like_unreachable: known %s, unknown %s', v_known, v_unknown);

  -- The owner naming an unknown line is denied the same way.
  PERFORM pg_temp.t55c_as('75900000-0000-4000-8000-0000000000a1');
  v_owner_unknown := pg_temp.t55c_refusal(format($q$SELECT public.set_line_placements(
    '75900000-0000-4000-8000-0000000002ff', %L::jsonb)$q$, c_rooms));
  ASSERT v_owner_unknown = c_denied, format('S4_owner_unknown_line_denied: got %s', v_owner_unknown);

  RAISE NOTICE 'PASS S4_auth_before_existence: set_line_placements authorizes before any existence error';
END
$S4_auth_before_existence$;

ROLLBACK;
