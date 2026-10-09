-- ═══════════════════════════════════════════════════════════════════════════
-- US-21 T-43a — W4 review fixes (migration 00755; SQ-686, from SQ-649)
--
-- Anchors: make_ffe_line_allowance 00743 and set_labor_line_price 00737
-- (both re-headed in 00755); draft_release_for_project (00755, new);
-- void_furnishings_authorization 00422:662 (the existing void, reused);
-- the release impl's step (5) live check 00744:280; triage_project_ffe_items
-- (re-headed in 00755, base 00435:494); project_room_handbacks 00742; the
-- client readers 00745 (re-headed in 00755).
--
-- Studio owner O, client C. Rooms: Hall, Living, Dining (budgeted), Study.
--   A   sofa, Hall, 1 × $4,800; AL its install (labor)
--   B   lamp, Hall, 2 each, one placement (Hall 2)
--   F   oak floor, Hall, 500 sq ft, placed Hall 200 / Dining 250
--   P   console, Hall, one placement (Hall 1); PL its install (labor, placed
--       Hall 1); PC its COM fabric (no placement)
--   E1  wallpaper on an executed authorization: frozen in Hall with no unit
--       (00744 writes NULLIF(unit,'each')); live now in Living, in roll.
--
-- Cases:
--   D. Draft-held: releasing A drafts A and AL; draft_release_for_project
--      (as the studio, API role) names the draft and both lines; the
--      allowance and the labor price refuse, word for word.
--   V. Void: void_furnishings_authorization frees them; the read is NULL;
--      the labor price takes; A releases again.
--   M. Move: F (2 rooms) refuses, word for word, and a disposition-only call
--      on F still works; B carries its one placement (same id) to Living; P
--      carries PL (and PL's placement) and PC to Dining; PL alone refuses.
--   H. Hand-backs: UPDATE and DELETE refuse; UPDATE, DELETE and TRUNCATE are
--      revoked from service_role, authenticated and anon; a deleted room
--      still cascades its hand-backs.
--   E. Frozen name and unit win: E1's rooms read Hall and unit 'each' in
--      selections and threshold; the bundle's unit is 'each'.
--
-- How to run (local stack, after applying 00755):
--   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" \
--     -X -v ON_ERROR_STOP=1 -f supabase/tests/commercial/pieces_w4_review_fixes_test.sql
--
-- One transaction, rolled back at the end.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

SET LOCAL timezone TO 'UTC';
SET LOCAL statement_timeout = '60s';

CREATE OR REPLACE FUNCTION pg_temp.t43a_as(p_actor uuid) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', p_actor, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', p_actor::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
END;
$$;

-- ─── fixtures (as postgres) ────────────────────────────────────────────────

INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, instance_id, aud, role)
VALUES
  ('75500000-0000-4000-8000-0000000000a1', 't43a-owner@test.invalid', '', NOW(), NOW(), NOW(),
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('75500000-0000-4000-8000-0000000000a2', 't43a-client@test.invalid', '', NOW(), NOW(), NOW(),
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');

INSERT INTO profiles (id, email, full_name, is_designer, created_at, updated_at)
VALUES
  ('75500000-0000-4000-8000-0000000000a1', 't43a-owner@test.invalid', 'T43a Owner', true, NOW(), NOW()),
  ('75500000-0000-4000-8000-0000000000a2', 't43a-client@test.invalid', 'T43a Client', false, NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

INSERT INTO organizations (id, type, name, slug)
VALUES ('75500000-0000-4000-8000-0000000000f1', 'design_studio', 'T43a Studio', 't43a-studio-test');

INSERT INTO organization_members (id, user_id, organization_id, role, status, joined_at)
VALUES ('75500000-0000-4000-8000-0000000000e1', '75500000-0000-4000-8000-0000000000a1',
        '75500000-0000-4000-8000-0000000000f1', 'owner', 'active', NOW());

INSERT INTO projects (id, name, designer_id, client_id, created_by, studio_id)
VALUES ('75500000-0000-4000-8000-000000000001', 'T43a Main Level', '75500000-0000-4000-8000-0000000000a1',
        '75500000-0000-4000-8000-0000000000a2', '75500000-0000-4000-8000-0000000000a1',
        '75500000-0000-4000-8000-0000000000f1');

INSERT INTO project_rooms (id, project_id, name, sort_order)
VALUES
  ('75500000-0000-4000-8000-0000000000c1', '75500000-0000-4000-8000-000000000001', 'Hall',   0),
  ('75500000-0000-4000-8000-0000000000c2', '75500000-0000-4000-8000-000000000001', 'Living', 1),
  ('75500000-0000-4000-8000-0000000000c3', '75500000-0000-4000-8000-000000000001', 'Dining', 2),
  ('75500000-0000-4000-8000-0000000000c4', '75500000-0000-4000-8000-000000000001', 'Study',  3);

INSERT INTO vendors (id, name)
VALUES
  ('75500000-0000-4000-8000-000000000011', 'T43a Upholstery'),
  ('75500000-0000-4000-8000-000000000012', 'T43a Installer');

-- The executed design-services origin the release stands on.
INSERT INTO proposals (id, project_id, designer_id, title, status, document_kind, commercial_state)
VALUES ('75500000-0000-4000-8000-000000000500', '75500000-0000-4000-8000-000000000001',
        '75500000-0000-4000-8000-0000000000a1', 'T43a Design services', 'accepted', 'design_services', 'executed');
INSERT INTO project_commercial_documents (id, project_id, proposal_id, document_kind, is_origin, bound_at, executed_at, created_by)
VALUES ('75500000-0000-4000-8000-000000000600', '75500000-0000-4000-8000-000000000001',
        '75500000-0000-4000-8000-000000000500', 'design_services', true, now(), now(),
        '75500000-0000-4000-8000-0000000000a1');

INSERT INTO project_budget_versions (id, project_id, version, created_by)
VALUES ('75500000-0000-4000-8000-000000000700', '75500000-0000-4000-8000-000000000001', 1,
        '75500000-0000-4000-8000-0000000000a1');
INSERT INTO project_budget_lines (budget_version_id, project_room_id, room_name, category, low_cents, target_cents, high_cents)
VALUES
  ('75500000-0000-4000-8000-000000000700', '75500000-0000-4000-8000-0000000000c1', 'Hall',   'Furniture', 100000, 900000, 1900000),
  ('75500000-0000-4000-8000-000000000700', '75500000-0000-4000-8000-0000000000c2', 'Living', 'Furniture', 100000, 900000, 1900000),
  ('75500000-0000-4000-8000-000000000700', '75500000-0000-4000-8000-0000000000c3', 'Dining', 'Furniture', 100000, 900000, 1900000);

INSERT INTO project_ffe_items (id, project_id, project_room_id, assignment_scope, name, status, item_type,
                               quantity, unit, unit_price_cents, trade_price_cents, line_total_cents,
                               vendor_id, vendor_name, design_disposition, sort_order)
VALUES
  ('75500000-0000-4000-8000-000000000201', '75500000-0000-4000-8000-000000000001', '75500000-0000-4000-8000-0000000000c1', 'room',
   'A Sofa', 'specified', 'fixed', 1, 'each', 480000, 300000, 480000,
   '75500000-0000-4000-8000-000000000011', 'T43a Upholstery', 'selected', 0),
  ('75500000-0000-4000-8000-000000000202', '75500000-0000-4000-8000-000000000001', '75500000-0000-4000-8000-0000000000c1', 'room',
   'B Lamp', 'specified', 'fixed', 2, 'each', 30000, 20000, 60000,
   '75500000-0000-4000-8000-000000000011', 'T43a Upholstery', 'selected', 1),
  ('75500000-0000-4000-8000-000000000203', '75500000-0000-4000-8000-000000000001', '75500000-0000-4000-8000-0000000000c1', 'room',
   'F Oak floor', 'specified', 'fixed', 500, 'sq_ft', 1150, 900, 575000,
   '75500000-0000-4000-8000-000000000011', 'T43a Upholstery', 'selected', 2),
  ('75500000-0000-4000-8000-000000000204', '75500000-0000-4000-8000-000000000001', '75500000-0000-4000-8000-0000000000c1', 'room',
   'P Console', 'specified', 'fixed', 1, 'each', 250000, 150000, 250000,
   '75500000-0000-4000-8000-000000000011', 'T43a Upholstery', 'selected', 3),
  ('75500000-0000-4000-8000-000000000206', '75500000-0000-4000-8000-000000000001', '75500000-0000-4000-8000-0000000000c2', 'room',
   'E1 Wallpaper', 'specified', 'fixed', 2, 'roll', 21000, 15000, 42000,
   '75500000-0000-4000-8000-000000000011', 'T43a Upholstery', 'selected', 5);

-- PC: P's COM fabric, a child of the console.
SELECT set_config('app.ffe_mutation_rpc', 'on', true);
INSERT INTO project_ffe_items (id, project_id, project_room_id, assignment_scope, name, status, item_type,
                               quantity, unit, unit_price_cents, line_total_cents, design_disposition, sort_order,
                               parent_ffe_item_id, link_kind)
VALUES ('75500000-0000-4000-8000-000000000205', '75500000-0000-4000-8000-000000000001',
        '75500000-0000-4000-8000-0000000000c1', 'room', 'PC COM fabric', 'specified', 'fixed', 1, 'each',
        0, 0, 'selected', 4, '75500000-0000-4000-8000-000000000204', 'com');
SELECT set_config('app.ffe_mutation_rpc', '', true);

-- E1 sits on an executed furnishings authorization, frozen in the Hall with
-- no unit key value (00744's NULLIF(unit, 'each')).
INSERT INTO proposals (id, project_id, designer_id, client_id, title, status, document_kind, commercial_state,
                       total_amount, subtotal, sent_at)
VALUES ('75500000-0000-4000-8000-000000000510', '75500000-0000-4000-8000-000000000001',
        '75500000-0000-4000-8000-0000000000a1', '75500000-0000-4000-8000-0000000000a2',
        'T43a Authorization No. 0', 'accepted', 'furnishings_authorization', 'executed', 42000, 42000, now());
INSERT INTO project_commercial_documents (id, project_id, proposal_id, document_kind, wave_name, is_origin,
                                          bound_at, executed_at, created_by)
VALUES ('75500000-0000-4000-8000-000000000610', '75500000-0000-4000-8000-000000000001',
        '75500000-0000-4000-8000-000000000510', 'furnishings_authorization', 'Authorization No. 0', false,
        now(), now(), '75500000-0000-4000-8000-0000000000a1');
INSERT INTO furnishing_authorization_items (id, commercial_document_id, source_ffe_item_id, project_room_id,
                                            name, room_name, category, item_type, quantity,
                                            client_unit_price_cents, client_line_total_cents, snapshot, sort_order)
VALUES ('75500000-0000-4000-8000-000000000611', '75500000-0000-4000-8000-000000000610',
        '75500000-0000-4000-8000-000000000206', '75500000-0000-4000-8000-0000000000c1',
        'E1 Wallpaper', 'Hall', 'Wallcovering', 'fixed', 2, 21000, 42000,
        jsonb_build_object('unit', NULL, 'placements', NULL), 0);
UPDATE project_ffe_items
   SET source_commercial_document_id = '75500000-0000-4000-8000-000000000610',
       source_authorization_item_id = '75500000-0000-4000-8000-000000000611'
 WHERE id = '75500000-0000-4000-8000-000000000206';

-- Placements, labor and the checkpoint, as the studio.
DO $$
DECLARE
  v_labor jsonb;
  v_published jsonb;
BEGIN
  PERFORM pg_temp.t43a_as('75500000-0000-4000-8000-0000000000a1');

  PERFORM public.set_line_placements('75500000-0000-4000-8000-000000000202',
    '[{"roomId":"75500000-0000-4000-8000-0000000000c1","quantity":2}]'::jsonb);
  PERFORM public.set_line_placements('75500000-0000-4000-8000-000000000203', '[
    {"roomId":"75500000-0000-4000-8000-0000000000c1","quantity":200},
    {"roomId":"75500000-0000-4000-8000-0000000000c3","quantity":250}]'::jsonb);
  PERFORM public.set_line_placements('75500000-0000-4000-8000-000000000204',
    '[{"roomId":"75500000-0000-4000-8000-0000000000c1","quantity":1}]'::jsonb);

  v_labor := public.add_labor_line('75500000-0000-4000-8000-000000000201',
    jsonb_build_object('name', 'AL Install, sofa', 'quantity', 1,
                       'vendorId', '75500000-0000-4000-8000-000000000012'));
  PERFORM set_config('t43a.al', v_labor->>'selectionId', true);
  PERFORM public.set_labor_line_price((v_labor->>'selectionId')::uuid, 20000);

  v_labor := public.add_labor_line('75500000-0000-4000-8000-000000000204',
    jsonb_build_object('name', 'PL Install, console', 'quantity', 1,
                       'vendorId', '75500000-0000-4000-8000-000000000012'));
  PERFORM set_config('t43a.pl', v_labor->>'selectionId', true);
  PERFORM public.set_line_placements((v_labor->>'selectionId')::uuid,
    '[{"roomId":"75500000-0000-4000-8000-0000000000c1","quantity":1}]'::jsonb);

  v_published := public.publish_budget_checkpoint('75500000-0000-4000-8000-000000000001',
                                                  '75500000-0000-4000-8000-000000000700');
  PERFORM public.override_budget_checkpoint((v_published->>'checkpointId')::uuid,
    'Client travelling; proceeding on the reviewed budget.');
END $$;
SELECT set_config('app.ffe_mutation_rpc', 'on', true);
UPDATE project_ffe_items
   SET trade_price_cents = 15000, item_type = 'fixed', design_disposition = 'selected'
 WHERE id IN (current_setting('t43a.al')::uuid, current_setting('t43a.pl')::uuid);
SELECT set_config('app.ffe_mutation_rpc', '', true);

-- ─── D. a line on a draft release ──────────────────────────────────────────
-- Everything below runs as the studio owner under the API role.

SELECT pg_temp.t43a_as('75500000-0000-4000-8000-0000000000a1');
SET LOCAL ROLE authenticated;

DO $$
DECLARE
  v_wave jsonb;
  v_draft jsonb;
  v_msg text;
  v_al uuid := current_setting('t43a.al')::uuid;
BEGIN
  ASSERT public.draft_release_for_project('75500000-0000-4000-8000-000000000001') IS NULL,
    'D0: no draft yet, the read is NULL';

  v_wave := public.create_furnishings_authorization_from_schedule('75500000-0000-4000-8000-000000000001',
    'Release No. 1', ARRAY['75500000-0000-4000-8000-000000000201'::uuid], NULL);
  ASSERT v_wave->>'commercialState' = 'draft', format('D1: the release is a draft: %s', v_wave);
  PERFORM set_config('t43a.proposal', v_wave->>'proposalId', true);

  v_draft := public.draft_release_for_project('75500000-0000-4000-8000-000000000001');
  ASSERT v_draft->>'documentId' = v_wave->>'documentId'
     AND v_draft->>'proposalId' = v_wave->>'proposalId',
    format('D2: the read names the draft document and its proposal: %s vs %s', v_draft, v_wave);
  ASSERT v_draft->'itemIds' @> jsonb_build_array('75500000-0000-4000-8000-000000000201', v_al)
     AND jsonb_array_length(v_draft->'itemIds') = 2,
    format('D3: the draft-held lines are the sofa and its install: %s', v_draft);

  BEGIN
    PERFORM public.make_ffe_line_allowance('75500000-0000-4000-8000-000000000201', 400000);
    v_msg := NULL;
  EXCEPTION WHEN check_violation THEN v_msg := SQLERRM;
  END;
  ASSERT v_msg = 'This line is on a drafted release. Send it or void the draft first.',
    format('D4: Make it an allowance refuses a drafted line, word for word: %s', v_msg);

  BEGIN
    PERFORM public.set_labor_line_price(v_al, 25000);
    v_msg := NULL;
  EXCEPTION WHEN check_violation THEN v_msg := SQLERRM;
  END;
  ASSERT v_msg = 'This line is on a drafted release. Send it or void the draft first.',
    format('D5: the labor price refuses a drafted line, word for word: %s', v_msg);

  RAISE NOTICE 'PASS D: a drafted line is found by the read and refused by the price acts';
END $$;

-- ─── V. void, then the line releases again ─────────────────────────────────

DO $$
DECLARE
  v_void jsonb;
  v_priced jsonb;
  v_wave jsonb;
  v_al uuid := current_setting('t43a.al')::uuid;
BEGIN
  v_void := public.void_furnishings_authorization(current_setting('t43a.proposal')::uuid,
                                                  'Client asked to hold the sofa.');
  ASSERT v_void->>'commercialState' = 'superseded', format('V1: the draft is voided: %s', v_void);
  ASSERT public.draft_release_for_project('75500000-0000-4000-8000-000000000001') IS NULL,
    'V2: no draft remains, the read is NULL';

  v_priced := public.set_labor_line_price(v_al, 25000);
  ASSERT (v_priced->>'unitPriceCents')::int = 25000, format('V3: the freed labor takes a price: %s', v_priced);

  v_wave := public.create_furnishings_authorization_from_schedule('75500000-0000-4000-8000-000000000001',
    'Release No. 2', ARRAY['75500000-0000-4000-8000-000000000201'::uuid], NULL);
  ASSERT (v_wave->>'itemCount')::int = 2 AND v_wave->>'commercialState' = 'draft',
    format('V4: the sofa and its install release again: %s', v_wave);

  RAISE NOTICE 'PASS V: void frees the lines and they release again';
END $$;

-- ─── M. Move to room… ──────────────────────────────────────────────────────

DO $$
DECLARE
  v_msg text;
  v_placement uuid;
  v_row record;
  v_pl uuid := current_setting('t43a.pl')::uuid;
  v_move CONSTANT jsonb := jsonb_build_object('projectId', '75500000-0000-4000-8000-000000000001',
                                              'assignmentScope', 'room');
BEGIN
  -- M1. F sits in 2 rooms: Move refuses.
  BEGIN
    PERFORM public.triage_project_ffe_items(v_move || jsonb_build_object(
      'selectionIds', jsonb_build_array('75500000-0000-4000-8000-000000000203'),
      'roomId', '75500000-0000-4000-8000-0000000000c2'));
    v_msg := NULL;
  EXCEPTION WHEN check_violation THEN v_msg := SQLERRM;
  END;
  ASSERT v_msg = 'This line sits in 2 rooms. Change its rooms instead.',
    format('M1: a two-room line refuses Move, word for word: %s', v_msg);

  -- M2. A disposition-only call on F (its room unchanged) is not a move.
  PERFORM public.triage_project_ffe_items(v_move || jsonb_build_object(
    'selectionIds', jsonb_build_array('75500000-0000-4000-8000-000000000203'),
    'roomId', '75500000-0000-4000-8000-0000000000c1', 'disposition', 'alternate'));
  ASSERT (SELECT design_disposition = 'alternate' AND project_room_id = '75500000-0000-4000-8000-0000000000c1'
            FROM project_ffe_items WHERE id = '75500000-0000-4000-8000-000000000203'),
    'M2: a disposition-only call on a two-room line still writes the disposition';
  ASSERT (SELECT count(*) FROM project_ffe_placements
           WHERE ffe_item_id = '75500000-0000-4000-8000-000000000203') = 2,
    'M2: and leaves its two rooms alone';

  -- M3. B, one room: its placement moves with it, same id, same share.
  SELECT id INTO v_placement FROM project_ffe_placements
   WHERE ffe_item_id = '75500000-0000-4000-8000-000000000202';
  PERFORM public.triage_project_ffe_items(v_move || jsonb_build_object(
    'selectionIds', jsonb_build_array('75500000-0000-4000-8000-000000000202'),
    'roomId', '75500000-0000-4000-8000-0000000000c2'));
  ASSERT (SELECT project_room_id FROM project_ffe_items WHERE id = '75500000-0000-4000-8000-000000000202')
         = '75500000-0000-4000-8000-0000000000c2',
    'M3: the lamp is in the Living room';
  SELECT * INTO v_row FROM project_ffe_placements WHERE ffe_item_id = '75500000-0000-4000-8000-000000000202';
  ASSERT v_row.id = v_placement AND v_row.project_room_id = '75500000-0000-4000-8000-0000000000c2'
     AND v_row.quantity = 2
     AND (SELECT count(*) FROM project_ffe_placements WHERE ffe_item_id = '75500000-0000-4000-8000-000000000202') = 1,
    format('M3: its one placement moved with it: %s', row_to_json(v_row));

  -- M4. P moves to Dining and carries its install (and its placement) and its COM.
  PERFORM public.triage_project_ffe_items(v_move || jsonb_build_object(
    'selectionIds', jsonb_build_array('75500000-0000-4000-8000-000000000204'),
    'roomId', '75500000-0000-4000-8000-0000000000c3'));
  ASSERT (SELECT bool_and(project_room_id = '75500000-0000-4000-8000-0000000000c3' AND assignment_scope = 'room')
            FROM project_ffe_items
           WHERE id IN ('75500000-0000-4000-8000-000000000204', '75500000-0000-4000-8000-000000000205', v_pl)),
    'M4: the console, its install and its COM are all in Dining';
  ASSERT (SELECT array_agg(project_room_id) FROM project_ffe_placements
           WHERE ffe_item_id IN ('75500000-0000-4000-8000-000000000204', v_pl))
         = ARRAY['75500000-0000-4000-8000-0000000000c3'::uuid, '75500000-0000-4000-8000-0000000000c3'::uuid],
    'M4: the console''s and the install''s placements moved to Dining';

  -- M5. The install on its own refuses.
  BEGIN
    PERFORM public.triage_project_ffe_items(v_move || jsonb_build_object(
      'selectionIds', jsonb_build_array(v_pl),
      'roomId', '75500000-0000-4000-8000-0000000000c2'));
    v_msg := NULL;
  EXCEPTION WHEN check_violation THEN v_msg := SQLERRM;
  END;
  ASSERT v_msg = 'Labor moves with its piece.',
    format('M5: labor alone refuses Move, word for word: %s', v_msg);
  ASSERT (SELECT project_room_id FROM project_ffe_items WHERE id = v_pl) = '75500000-0000-4000-8000-0000000000c3',
    'M5: the install stayed with its piece';

  RAISE NOTICE 'PASS M: Move keeps placements and labor with their line';
END $$;

-- H0. Two hand-backs, through the one writer.
SELECT public.hand_back_project_room('75500000-0000-4000-8000-0000000000c1');
SELECT public.hand_back_project_room('75500000-0000-4000-8000-0000000000c4');

-- ─── E. the frozen room name and unit win (as the client) ──────────────────

RESET ROLE;
SELECT pg_temp.t43a_as('75500000-0000-4000-8000-0000000000a2');
SET LOCAL ROLE authenticated;

DO $$
DECLARE
  v_line jsonb;
  v_frozen CONSTANT jsonb := '[{"name":"Hall","quantity":2,"unit":"each"}]';
BEGIN
  SELECT s INTO v_line
    FROM jsonb_array_elements(public.get_client_project_selections('75500000-0000-4000-8000-000000000001')->'selections') s
   WHERE s->>'id' = '75500000-0000-4000-8000-000000000206';
  ASSERT v_line->'rooms' = v_frozen AND v_line->>'unit' = 'each',
    format('E1: selections read the frozen Hall and unit each, never the live Living and roll: %s', v_line);

  SELECT s INTO v_line
    FROM jsonb_array_elements(public.get_client_project_threshold('75500000-0000-4000-8000-000000000001')->'selections') s
   WHERE s->>'id' = '75500000-0000-4000-8000-000000000206';
  ASSERT v_line->'rooms' = v_frozen AND v_line->>'unit' = 'each',
    format('E2: the Client Page reads the frozen Hall and unit each: %s', v_line);

  SELECT s INTO v_line
    FROM jsonb_array_elements(public.get_client_commercial_document_bundle(
           '75500000-0000-4000-8000-000000000510')->'furnishings'->'items') s
   WHERE s->>'sourceFfeItemId' = '75500000-0000-4000-8000-000000000206';
  ASSERT v_line->'rooms' = v_frozen AND v_line->>'unit' = 'each',
    format('E3: the paper reads the frozen unit each, never the live roll: %s', v_line);

  RAISE NOTICE 'PASS E: the frozen room name and unit win';
END $$;

RESET ROLE;

-- ─── H. hand-backs are append-only (as postgres) ───────────────────────────

DO $$
DECLARE
  v_msg text;
  v_role text;
  v_priv text;
BEGIN
  ASSERT (SELECT count(*) FROM project_room_handbacks
           WHERE project_id = '75500000-0000-4000-8000-000000000001') = 2,
    'H0: two hand-backs recorded';

  BEGIN
    UPDATE project_room_handbacks SET handed_back_at = now() - interval '1 day'
     WHERE project_room_id = '75500000-0000-4000-8000-0000000000c1';
    v_msg := NULL;
  EXCEPTION WHEN check_violation THEN v_msg := SQLERRM;
  END;
  ASSERT v_msg = 'Hand-backs are a record: they are never changed or removed.',
    format('H1: UPDATE refuses: %s', v_msg);

  BEGIN
    DELETE FROM project_room_handbacks WHERE project_room_id = '75500000-0000-4000-8000-0000000000c1';
    v_msg := NULL;
  EXCEPTION WHEN check_violation THEN v_msg := SQLERRM;
  END;
  ASSERT v_msg = 'Hand-backs are a record: they are never changed or removed.',
    format('H2: DELETE refuses: %s', v_msg);

  FOREACH v_role IN ARRAY ARRAY['service_role', 'authenticated', 'anon'] LOOP
    FOREACH v_priv IN ARRAY ARRAY['UPDATE', 'DELETE', 'TRUNCATE'] LOOP
      ASSERT NOT has_table_privilege(v_role, 'public.project_room_handbacks', v_priv),
        format('H3: %s holds no %s on project_room_handbacks', v_role, v_priv);
    END LOOP;
  END LOOP;
  ASSERT has_table_privilege('service_role', 'public.project_room_handbacks', 'INSERT')
     AND has_table_privilege('authenticated', 'public.project_room_handbacks', 'SELECT'),
    'H3: service_role keeps INSERT and authenticated keeps SELECT';

  -- H4. A deleted room still takes its hand-backs with it.
  DELETE FROM project_rooms WHERE id = '75500000-0000-4000-8000-0000000000c4';
  ASSERT NOT EXISTS (SELECT 1 FROM project_room_handbacks
                      WHERE project_room_id = '75500000-0000-4000-8000-0000000000c4'),
    'H4: the Study''s hand-back cascaded with the room';

  RAISE NOTICE 'PASS H: hand-backs are append-only; a deleted room still cascades';
END $$;

-- ─── G. grants ─────────────────────────────────────────────────────────────

DO $$
BEGIN
  ASSERT has_function_privilege('authenticated', 'public.draft_release_for_project(uuid)', 'EXECUTE')
     AND NOT has_function_privilege('anon', 'public.draft_release_for_project(uuid)', 'EXECUTE'),
    'G1: the draft read is open to authenticated only';
  ASSERT NOT (SELECT prosecdef FROM pg_proc WHERE oid = 'public.draft_release_for_project(uuid)'::regprocedure),
    'G2: the draft read is SECURITY INVOKER';
  ASSERT NOT has_function_privilege('authenticated', 'public.guard_project_room_handbacks_append_only()', 'EXECUTE'),
    'G3: the hand-back guard is closed';
  RAISE NOTICE 'PASS G: grants';
END $$;

ROLLBACK;
