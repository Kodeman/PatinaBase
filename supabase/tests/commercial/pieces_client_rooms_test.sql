-- ═══════════════════════════════════════════════════════════════════════════
-- US-21 T-37 — client payloads carry rooms (migration 00745; SQ-643)
--
-- Anchors: get_client_project_selections base 00441:82 (the iOS Patina
-- app's reader, ProjectsAPIClient.swift:120); get_client_project_threshold
-- base 00580:167 (the Client Page); get_client_commercial_document_bundle
-- base 00638:322 (furnishings.items). Placements 00734; the frozen snapshot's
-- placements key 00744 (written here by hand, as 00744 would); columns 00729.
--
-- Studio A (owner O), client C. Rooms: Living Room, Dining, Primary Bath,
-- Bedroom. Every line carries rough_cents 987654 and every thread a need
-- label containing NEEDLABEL; the frozen snapshots also carry needLabel,
-- lineKind, parentFfeItemId and an area note containing AREANOTE.
--
-- Live lines (selected, never authorized):
--   F1 white oak floor 913 sq_ft, placed Living 300 / Dining 210 /
--      Primary Bath 200 / Bedroom 120 (830; 83 waste)
--   D1 dining table 1 each, Dining, no placements
--   U1 lighting allowance 1 lot, throughout (no room)
--   R1 wallpaper 9 roll, Bedroom; R1a its install 9 roll (labor, under R1)
-- Authorized lines (an executed furnishings authorization):
--   A1 oak floor 913 sq_ft; snapshot placements Living 300 / Dining 210 /
--      Primary Bath 200 / Bedroom 120 and unit sq_ft; after release the live
--      Living share moves to 330 (00734's recorded change)
--   A2 side chairs 2 each, Dining; snapshot without placements or unit;
--      after release, live placements Dining 1 / Living 1
--   A3 wallpaper 9 roll, Bedroom; A3a its install 9 roll (labor, under A3)
-- Trade: P1 painting presence line under an executed trade scope, Living.
--
-- Cases:
--   S. get_client_project_selections: unit and rooms on every line; F1 lists
--      its four live rooms in order (the waste is not a room); D1 one room;
--      U1 no room; R1a is its own line in roll; A1 and A2 read the frozen
--      snapshot, never the live placements; roomName stays the primary and
--      the iOS keys are unchanged.
--   T. get_client_project_threshold: the authorized lines only, rooms frozen;
--      unit from the snapshot, else the live line; A3a its own line in roll;
--      the trade line carries unit and its one room.
--   B. get_client_commercial_document_bundle: furnishings.items carry unit
--      and rooms from each row's frozen snapshot; roomName unchanged.
--   N. Never in any of the three payloads: rough (key or value), the need
--      label, line_kind / link_kind / parent_ffe_item_id in any spelling, or
--      the area note.
--   G. Grants: _client_line_rooms is closed to every API role; the readers
--      keep their grants.
--
-- How to run (local stack, after applying 00745):
--   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" \
--     -X -v ON_ERROR_STOP=1 -f supabase/tests/commercial/pieces_client_rooms_test.sql
--
-- One transaction, rolled back at the end.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

SET LOCAL timezone TO 'UTC';
SET LOCAL statement_timeout = '60s';

CREATE OR REPLACE FUNCTION pg_temp.t37_as(p_actor uuid) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', p_actor, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', p_actor::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
END;
$$;

-- ─── fixtures (as postgres, before any claim is set) ───────────────────────

INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, instance_id, aud, role)
VALUES
  ('74500000-0000-4000-8000-0000000000a1', 't37-owner@test.invalid', '', NOW(), NOW(), NOW(),
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('74500000-0000-4000-8000-0000000000a2', 't37-client@test.invalid', '', NOW(), NOW(), NOW(),
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');

INSERT INTO profiles (id, email, full_name, is_designer, created_at, updated_at)
VALUES
  ('74500000-0000-4000-8000-0000000000a1', 't37-owner@test.invalid', 'T37 Owner', true, NOW(), NOW()),
  ('74500000-0000-4000-8000-0000000000a2', 't37-client@test.invalid', 'T37 Client', false, NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

INSERT INTO organizations (id, type, name, slug)
VALUES ('74500000-0000-4000-8000-0000000000f1', 'design_studio', 'T37 Studio A', 't37-studio-a-test');

INSERT INTO organization_members (id, user_id, organization_id, role, status, joined_at)
VALUES ('74500000-0000-4000-8000-0000000000e1', '74500000-0000-4000-8000-0000000000a1',
        '74500000-0000-4000-8000-0000000000f1', 'owner', 'active', NOW());

INSERT INTO projects (id, name, designer_id, client_id, created_by, studio_id)
VALUES ('74500000-0000-4000-8000-000000000001', 'T37 Whole Home', '74500000-0000-4000-8000-0000000000a1',
        '74500000-0000-4000-8000-0000000000a2', '74500000-0000-4000-8000-0000000000a1',
        '74500000-0000-4000-8000-0000000000f1');

INSERT INTO project_rooms (id, project_id, name, sort_order)
VALUES
  ('74500000-0000-4000-8000-0000000000c1', '74500000-0000-4000-8000-000000000001', 'Living Room',  0),
  ('74500000-0000-4000-8000-0000000000c2', '74500000-0000-4000-8000-000000000001', 'Dining',       1),
  ('74500000-0000-4000-8000-0000000000c3', '74500000-0000-4000-8000-000000000001', 'Primary Bath', 2),
  ('74500000-0000-4000-8000-0000000000c4', '74500000-0000-4000-8000-000000000001', 'Bedroom',      3);

INSERT INTO vendors (id, name)
VALUES
  ('74500000-0000-4000-8000-000000000011', 'Nord Hardwood Co.'),
  ('74500000-0000-4000-8000-000000000012', 'T37 Wallpaper Hanging');

-- Pieces first (sort 0–8), then the labor children that point at them.
INSERT INTO project_ffe_items (id, project_id, project_room_id, assignment_scope, name, status, item_type,
                               quantity, unit, unit_price_cents, line_total_cents, rough_cents,
                               vendor_id, design_disposition, sort_order)
VALUES
  ('74500000-0000-4000-8000-000000000201', '74500000-0000-4000-8000-000000000001', '74500000-0000-4000-8000-0000000000c1', 'room',
   'F1 White oak floor', 'specified', 'fixed', 913, 'sq_ft', 1150, 1049950, 987654,
   '74500000-0000-4000-8000-000000000011', 'selected', 0),
  ('74500000-0000-4000-8000-000000000202', '74500000-0000-4000-8000-000000000001', '74500000-0000-4000-8000-0000000000c2', 'room',
   'D1 Dining table', 'specified', 'fixed', 1, 'each', 680000, 680000, 987654,
   '74500000-0000-4000-8000-000000000011', 'selected', 1),
  ('74500000-0000-4000-8000-000000000205', '74500000-0000-4000-8000-000000000001', NULL, 'throughout',
   'U1 Lighting allowance', 'specified', 'fixed', 1, 'lot', 250000, 250000, 987654,
   '74500000-0000-4000-8000-000000000011', 'selected', 2),
  ('74500000-0000-4000-8000-000000000203', '74500000-0000-4000-8000-000000000001', '74500000-0000-4000-8000-0000000000c4', 'room',
   'R1 Wallpaper, grasscloth', 'specified', 'fixed', 9, 'roll', 23000, 207000, 987654,
   '74500000-0000-4000-8000-000000000011', 'selected', 3),
  ('74500000-0000-4000-8000-000000000211', '74500000-0000-4000-8000-000000000001', '74500000-0000-4000-8000-0000000000c1', 'room',
   'A1 White oak floor', 'approved', 'fixed', 913, 'sq_ft', 1150, 1049950, 987654,
   '74500000-0000-4000-8000-000000000011', 'selected', 5),
  ('74500000-0000-4000-8000-000000000212', '74500000-0000-4000-8000-000000000001', '74500000-0000-4000-8000-0000000000c2', 'room',
   'A2 Side chairs', 'approved', 'fixed', 2, 'each', 90000, 180000, 987654,
   '74500000-0000-4000-8000-000000000011', 'selected', 6),
  ('74500000-0000-4000-8000-000000000213', '74500000-0000-4000-8000-000000000001', '74500000-0000-4000-8000-0000000000c4', 'room',
   'A3 Wallpaper, hemp', 'approved', 'fixed', 9, 'roll', 21000, 189000, 987654,
   '74500000-0000-4000-8000-000000000011', 'selected', 7);

INSERT INTO project_ffe_items (id, project_id, project_room_id, assignment_scope, name, status, item_type,
                               quantity, unit, unit_price_cents, line_total_cents, rough_cents,
                               vendor_id, design_disposition, sort_order,
                               line_kind, link_kind, parent_ffe_item_id)
VALUES
  ('74500000-0000-4000-8000-000000000204', '74500000-0000-4000-8000-000000000001', '74500000-0000-4000-8000-0000000000c4', 'room',
   'R1a Install, wallpaper hanger', 'specified', 'fixed', 9, 'roll', 8500, 76500, 987654,
   '74500000-0000-4000-8000-000000000012', 'selected', 4,
   'labor', 'labor', '74500000-0000-4000-8000-000000000203'),
  ('74500000-0000-4000-8000-000000000214', '74500000-0000-4000-8000-000000000001', '74500000-0000-4000-8000-0000000000c4', 'room',
   'A3a Install, wallpaper hanger', 'approved', 'fixed', 9, 'roll', 8500, 76500, 987654,
   '74500000-0000-4000-8000-000000000012', 'selected', 8,
   'labor', 'labor', '74500000-0000-4000-8000-000000000213');

-- Every thread carries a need label the client must never see.
UPDATE project_ffe_selection_threads thread
SET need_label = 'NEEDLABEL ' || item.name
FROM project_ffe_items item
WHERE item.selection_thread_id = thread.id
  AND item.project_id = '74500000-0000-4000-8000-000000000001';

-- F1's live placements: 830 of 913 placed, waste 83.
INSERT INTO project_ffe_placements (ffe_item_id, project_id, project_room_id, quantity, area_note, sort_order)
VALUES
  ('74500000-0000-4000-8000-000000000201', '74500000-0000-4000-8000-000000000001', '74500000-0000-4000-8000-0000000000c1', 300, 'AREANOTE living', 0),
  ('74500000-0000-4000-8000-000000000201', '74500000-0000-4000-8000-000000000001', '74500000-0000-4000-8000-0000000000c2', 210, 'AREANOTE dining', 1),
  ('74500000-0000-4000-8000-000000000201', '74500000-0000-4000-8000-000000000001', '74500000-0000-4000-8000-0000000000c3', 200, NULL, 2),
  ('74500000-0000-4000-8000-000000000201', '74500000-0000-4000-8000-000000000001', '74500000-0000-4000-8000-0000000000c4', 120, NULL, 3);

-- The executed furnishings authorization (500/600) and its frozen rows.
INSERT INTO proposals (id, project_id, designer_id, client_id, title, status, document_kind, commercial_state,
                       total_amount, subtotal, sent_at)
VALUES ('74500000-0000-4000-8000-000000000500', '74500000-0000-4000-8000-000000000001',
        '74500000-0000-4000-8000-0000000000a1', '74500000-0000-4000-8000-0000000000a2',
        'T37 Authorization No. 1', 'accepted', 'furnishings_authorization', 'executed',
        1495450, 1495450, now());
INSERT INTO project_commercial_documents (id, project_id, proposal_id, document_kind, wave_name, is_origin,
                                          bound_at, executed_at, created_by)
VALUES ('74500000-0000-4000-8000-000000000600', '74500000-0000-4000-8000-000000000001',
        '74500000-0000-4000-8000-000000000500', 'furnishings_authorization', 'Authorization No. 1', false,
        now(), now(), '74500000-0000-4000-8000-0000000000a1');

INSERT INTO furnishing_authorization_items (id, commercial_document_id, source_ffe_item_id, project_room_id,
                                            name, room_name, category, item_type, quantity,
                                            client_unit_price_cents, client_line_total_cents, snapshot, sort_order)
VALUES
  ('74500000-0000-4000-8000-000000000611', '74500000-0000-4000-8000-000000000600', '74500000-0000-4000-8000-000000000211',
   '74500000-0000-4000-8000-0000000000c1', 'A1 White oak floor', 'Living Room', 'Flooring', 'fixed', 913, 1150, 1049950,
   jsonb_build_object(
     'docCode', 'FL-1', 'unit', 'sq_ft', 'needLabel', 'NEEDLABEL floor',
     'placements', jsonb_build_array(
       jsonb_build_object('roomName', 'Living Room',  'quantity', 300, 'areaNote', 'AREANOTE living'),
       jsonb_build_object('roomName', 'Dining',       'quantity', 210, 'areaNote', NULL),
       jsonb_build_object('roomName', 'Primary Bath', 'quantity', 200, 'areaNote', NULL),
       jsonb_build_object('roomName', 'Bedroom',      'quantity', 120, 'areaNote', 'AREANOTE bedroom'))),
   0),
  ('74500000-0000-4000-8000-000000000612', '74500000-0000-4000-8000-000000000600', '74500000-0000-4000-8000-000000000212',
   '74500000-0000-4000-8000-0000000000c2', 'A2 Side chairs', 'Dining', 'Seating', 'fixed', 2, 90000, 180000,
   jsonb_build_object('docCode', 'SE-1'),
   1),
  ('74500000-0000-4000-8000-000000000613', '74500000-0000-4000-8000-000000000600', '74500000-0000-4000-8000-000000000213',
   '74500000-0000-4000-8000-0000000000c4', 'A3 Wallpaper, hemp', 'Bedroom', 'Wallcovering', 'fixed', 9, 21000, 189000,
   jsonb_build_object('unit', 'roll'),
   2),
  ('74500000-0000-4000-8000-000000000614', '74500000-0000-4000-8000-000000000600', '74500000-0000-4000-8000-000000000214',
   '74500000-0000-4000-8000-0000000000c4', 'A3a Install, wallpaper hanger', 'Bedroom', 'Labor', 'fixed', 9, 8500, 76500,
   jsonb_build_object('unit', 'roll', 'lineKind', 'labor', 'needLabel', 'NEEDLABEL install',
                      'parentFfeItemId', '74500000-0000-4000-8000-000000000213'),
   3);

-- Execution links each line to the row it froze (00578, provenance b).
UPDATE project_ffe_items item
SET source_commercial_document_id = '74500000-0000-4000-8000-000000000600',
    source_authorization_item_id = authorization_item.id
FROM furnishing_authorization_items authorization_item
WHERE authorization_item.commercial_document_id = '74500000-0000-4000-8000-000000000600'
  AND item.id = authorization_item.source_ffe_item_id;

-- After release the live rooms move (00734 records such a change): A1's Living
-- share 300 → 330, and A2 is split Dining 1 / Living 1. The client signed the
-- frozen rooms, and that is what every payload must print.
INSERT INTO project_ffe_placements (ffe_item_id, project_id, project_room_id, quantity, area_note, sort_order)
VALUES
  ('74500000-0000-4000-8000-000000000211', '74500000-0000-4000-8000-000000000001', '74500000-0000-4000-8000-0000000000c1', 330, 'AREANOTE living', 0),
  ('74500000-0000-4000-8000-000000000211', '74500000-0000-4000-8000-000000000001', '74500000-0000-4000-8000-0000000000c2', 210, NULL, 1),
  ('74500000-0000-4000-8000-000000000211', '74500000-0000-4000-8000-000000000001', '74500000-0000-4000-8000-0000000000c3', 200, NULL, 2),
  ('74500000-0000-4000-8000-000000000211', '74500000-0000-4000-8000-000000000001', '74500000-0000-4000-8000-0000000000c4', 120, NULL, 3),
  ('74500000-0000-4000-8000-000000000212', '74500000-0000-4000-8000-000000000001', '74500000-0000-4000-8000-0000000000c2', 1, NULL, 0),
  ('74500000-0000-4000-8000-000000000212', '74500000-0000-4000-8000-000000000001', '74500000-0000-4000-8000-0000000000c1', 1, NULL, 1);

-- Trade: an executed painting scope (700/800) and its presence line P1.
INSERT INTO proposals (id, project_id, designer_id, client_id, title, status, document_kind, commercial_state,
                       total_amount, subtotal, sent_at)
VALUES ('74500000-0000-4000-8000-000000000700', '74500000-0000-4000-8000-000000000001',
        '74500000-0000-4000-8000-0000000000a1', '74500000-0000-4000-8000-0000000000a2',
        'T37 Painting', 'draft', 'trade_scope', 'executed', 450000, 450000, now());
-- guard_trade_scope_terms writes terms only while status is draft, and
-- guard_commercial_proposal_authority refuses a later status change outside
-- the signature rail, so status stays draft. The threshold's trade branch
-- reads commercial_state and executed_at, never status.
INSERT INTO trade_scope_terms (proposal_id) VALUES ('74500000-0000-4000-8000-000000000700');
INSERT INTO project_commercial_documents (id, project_id, proposal_id, document_kind, is_origin,
                                          bound_at, executed_at, created_by)
VALUES ('74500000-0000-4000-8000-000000000800', '74500000-0000-4000-8000-000000000001',
        '74500000-0000-4000-8000-000000000700', 'trade_scope', false,
        now(), now(), '74500000-0000-4000-8000-0000000000a1');
INSERT INTO project_ffe_items (id, project_id, project_room_id, assignment_scope, name, status, item_type,
                               quantity, unit, line_total_cents, rough_cents, design_disposition, sort_order,
                               trade_scope_document_id)
VALUES ('74500000-0000-4000-8000-000000000221', '74500000-0000-4000-8000-000000000001',
        '74500000-0000-4000-8000-0000000000c1', 'room', 'P1 Painting', 'specified', 'fixed',
        1, 'lot', 450000, 987654, 'selected', 9, '74500000-0000-4000-8000-000000000800');

-- ─── S, T, B, N: the three payloads, read as the client ────────────────────

SELECT pg_temp.t37_as('74500000-0000-4000-8000-0000000000a2');
SET LOCAL ROLE authenticated;

DO $$
DECLARE
  v_project constant uuid := '74500000-0000-4000-8000-000000000001';
  v_sel jsonb;
  v_thr jsonb;
  v_bun jsonb;
  v_line jsonb;
  v_payload record;
  v_needle text;
  v_four_frozen constant jsonb := '[
    {"name":"Living Room","quantity":300,"unit":"sq_ft"},
    {"name":"Dining","quantity":210,"unit":"sq_ft"},
    {"name":"Primary Bath","quantity":200,"unit":"sq_ft"},
    {"name":"Bedroom","quantity":120,"unit":"sq_ft"}]';
BEGIN
  v_sel := public.get_client_project_selections(v_project);
  v_thr := public.get_client_project_threshold(v_project);
  v_bun := public.get_client_commercial_document_bundle('74500000-0000-4000-8000-000000000500');

  -- ── S. get_client_project_selections ──────────────────────────────────
  -- 9 schedule lines plus the trade presence line P1, all selected.
  IF jsonb_array_length(v_sel->'selections') <> 10 THEN
    RAISE EXCEPTION 'S0: selections lists the 10 selected lines, got %', jsonb_array_length(v_sel->'selections');
  END IF;

  SELECT e INTO v_line FROM jsonb_array_elements(v_sel->'selections') e
  WHERE e->>'id' = '74500000-0000-4000-8000-000000000201';
  IF v_line->'rooms' IS DISTINCT FROM v_four_frozen THEN
    RAISE EXCEPTION 'S1: F1 lists its four live rooms in order (830 of 913; waste is not a room), got %', v_line->'rooms';
  END IF;
  IF v_line->>'unit' IS DISTINCT FROM 'sq_ft' OR v_line->>'roomName' IS DISTINCT FROM 'Living Room'
     OR (v_line->>'quantity')::int <> 913 THEN
    RAISE EXCEPTION 'S1: F1 keeps unit sq_ft, its primary room and quantity 913, got %', v_line;
  END IF;
  -- The iOS RemoteFFEItem keys are still there, under their names.
  IF NOT (v_line ? 'id' AND v_line ? 'name' AND v_line ? 'logisticsStatus' AND v_line ? 'roomName') THEN
    RAISE EXCEPTION 'S1: the iOS keys id/name/logisticsStatus/roomName are unchanged, got %', v_line;
  END IF;

  SELECT e INTO v_line FROM jsonb_array_elements(v_sel->'selections') e
  WHERE e->>'id' = '74500000-0000-4000-8000-000000000202';
  IF v_line->'rooms' IS DISTINCT FROM '[{"name":"Dining","quantity":1,"unit":"each"}]'::jsonb
     OR v_line->>'unit' IS DISTINCT FROM 'each' THEN
    RAISE EXCEPTION 'S2: D1 is one room, its primary, in each, got %', v_line;
  END IF;

  SELECT e INTO v_line FROM jsonb_array_elements(v_sel->'selections') e
  WHERE e->>'id' = '74500000-0000-4000-8000-000000000205';
  IF v_line->'rooms' IS DISTINCT FROM '[]'::jsonb OR v_line->>'unit' IS DISTINCT FROM 'lot'
     OR v_line ? 'roomName' THEN
    RAISE EXCEPTION 'S3: U1 (throughout) has rooms [] and unit lot, got %', v_line;
  END IF;

  SELECT e INTO v_line FROM jsonb_array_elements(v_sel->'selections') e
  WHERE e->>'id' = '74500000-0000-4000-8000-000000000204';
  IF v_line IS NULL OR v_line->>'unit' IS DISTINCT FROM 'roll'
     OR v_line->'rooms' IS DISTINCT FROM '[{"name":"Bedroom","quantity":9,"unit":"roll"}]'::jsonb THEN
    RAISE EXCEPTION 'S4: R1a (labor) is its own line, 9 roll in the Bedroom, got %', v_line;
  END IF;

  SELECT e INTO v_line FROM jsonb_array_elements(v_sel->'selections') e
  WHERE e->>'id' = '74500000-0000-4000-8000-000000000211';
  IF v_line->'rooms' IS DISTINCT FROM v_four_frozen THEN
    RAISE EXCEPTION 'S5: A1 reads its frozen rooms (Living 300), never the live 330, got %', v_line->'rooms';
  END IF;

  SELECT e INTO v_line FROM jsonb_array_elements(v_sel->'selections') e
  WHERE e->>'id' = '74500000-0000-4000-8000-000000000212';
  IF v_line->'rooms' IS DISTINCT FROM '[{"name":"Dining","quantity":2,"unit":"each"}]'::jsonb
     OR v_line->>'unit' IS DISTINCT FROM 'each' THEN
    RAISE EXCEPTION 'S6: A2 reads its one frozen room, never the live Dining 1 / Living 1, got %', v_line;
  END IF;

  -- ── T. get_client_project_threshold ───────────────────────────────────
  IF (SELECT count(*) FROM jsonb_array_elements(v_thr->'selections') e WHERE e->>'kind' = 'furnishings') <> 4 THEN
    RAISE EXCEPTION 'T0: the Client Page lists the 4 authorized lines, got %', v_thr->'selections';
  END IF;

  SELECT e INTO v_line FROM jsonb_array_elements(v_thr->'selections') e
  WHERE e->>'id' = '74500000-0000-4000-8000-000000000211';
  IF v_line->'rooms' IS DISTINCT FROM v_four_frozen OR v_line->>'unit' IS DISTINCT FROM 'sq_ft'
     OR v_line->>'roomName' IS DISTINCT FROM 'Living Room' THEN
    RAISE EXCEPTION 'T1: A1 on the Client Page reads its frozen rooms and the snapshot unit, got %', v_line;
  END IF;

  SELECT e INTO v_line FROM jsonb_array_elements(v_thr->'selections') e
  WHERE e->>'id' = '74500000-0000-4000-8000-000000000212';
  IF v_line->'rooms' IS DISTINCT FROM '[{"name":"Dining","quantity":2,"unit":"each"}]'::jsonb
     OR v_line->>'unit' IS DISTINCT FROM 'each' THEN
    RAISE EXCEPTION 'T2: A2 has one frozen room; with no snapshot unit it reads the line''s, got %', v_line;
  END IF;

  SELECT e INTO v_line FROM jsonb_array_elements(v_thr->'selections') e
  WHERE e->>'id' = '74500000-0000-4000-8000-000000000214';
  IF v_line IS NULL OR v_line->>'unit' IS DISTINCT FROM 'roll'
     OR v_line->'rooms' IS DISTINCT FROM '[{"name":"Bedroom","quantity":9,"unit":"roll"}]'::jsonb
     OR (v_line->>'clientLineTotalCents')::int <> 76500 THEN
    RAISE EXCEPTION 'T3: A3a (labor) is its own line, 9 roll, $765, got %', v_line;
  END IF;

  SELECT e INTO v_line FROM jsonb_array_elements(v_thr->'selections') e
  WHERE e->>'id' = '74500000-0000-4000-8000-000000000221';
  IF v_line IS NULL OR v_line->>'kind' IS DISTINCT FROM 'trade' OR v_line->>'unit' IS DISTINCT FROM 'lot'
     OR v_line->'rooms' IS DISTINCT FROM '[{"name":"Living Room","quantity":1,"unit":"lot"}]'::jsonb THEN
    RAISE EXCEPTION 'T4: the trade presence line carries unit and its one room, got %', v_line;
  END IF;

  -- ── B. get_client_commercial_document_bundle ──────────────────────────
  IF jsonb_array_length(v_bun->'furnishings'->'items') <> 4 THEN
    RAISE EXCEPTION 'B0: the authorization carries its 4 rows, got %', v_bun->'furnishings'->'items';
  END IF;

  SELECT e INTO v_line FROM jsonb_array_elements(v_bun->'furnishings'->'items') e
  WHERE e->>'id' = '74500000-0000-4000-8000-000000000611';
  IF v_line->'rooms' IS DISTINCT FROM v_four_frozen OR v_line->>'unit' IS DISTINCT FROM 'sq_ft'
     OR v_line->>'roomName' IS DISTINCT FROM 'Living Room' THEN
    RAISE EXCEPTION 'B1: A1 on the paper reads its frozen rooms; roomName stays the primary, got %', v_line;
  END IF;

  SELECT e INTO v_line FROM jsonb_array_elements(v_bun->'furnishings'->'items') e
  WHERE e->>'id' = '74500000-0000-4000-8000-000000000612';
  IF v_line->'rooms' IS DISTINCT FROM '[{"name":"Dining","quantity":2,"unit":"each"}]'::jsonb
     OR v_line->>'unit' IS DISTINCT FROM 'each' THEN
    RAISE EXCEPTION 'B2: A2 on the paper is one frozen room in each, got %', v_line;
  END IF;

  SELECT e INTO v_line FROM jsonb_array_elements(v_bun->'furnishings'->'items') e
  WHERE e->>'id' = '74500000-0000-4000-8000-000000000614';
  IF v_line->>'unit' IS DISTINCT FROM 'roll'
     OR v_line->'rooms' IS DISTINCT FROM '[{"name":"Bedroom","quantity":9,"unit":"roll"}]'::jsonb THEN
    RAISE EXCEPTION 'B3: A3a on the paper is its own line in roll, got %', v_line;
  END IF;

  -- ── N. never in a client payload ──────────────────────────────────────
  FOR v_payload IN
    SELECT 'selections' AS reader, v_sel::text AS body
    UNION ALL SELECT 'threshold', v_thr::text
    UNION ALL SELECT 'bundle', v_bun::text
  LOOP
    -- The one legitimate "rough" is inside the assignment scope value
    -- 'throughout' (U1), which every base payload has always carried.
    IF replace(v_payload.body, '"throughout"', '') ~* 'rough' THEN
      RAISE EXCEPTION 'N1: % carries "rough"', v_payload.reader;
    END IF;
    IF position('987654' IN v_payload.body) > 0 THEN
      RAISE EXCEPTION 'N2: % carries the rough figure 987654', v_payload.reader;
    END IF;
    FOREACH v_needle IN ARRAY ARRAY[
      'NEEDLABEL', 'AREANOTE',
      'needLabel', 'need_label', 'lineKind', 'line_kind', 'linkKind', 'link_kind',
      'parentFfeItemId', 'parent_ffe_item_id', 'areaNote', 'area_note'
    ] LOOP
      IF position(v_needle IN v_payload.body) > 0 THEN
        RAISE EXCEPTION 'N3: % carries %', v_payload.reader, v_needle;
      END IF;
    END LOOP;
  END LOOP;

  RAISE NOTICE 'T-37 S/T/B/N: rooms and unit on every client line; nothing internal crosses';
END $$;

RESET ROLE;

-- ─── G. grants ─────────────────────────────────────────────────────────────

DO $$
DECLARE
  v_role text;
BEGIN
  FOREACH v_role IN ARRAY ARRAY['anon', 'authenticated', 'service_role'] LOOP
    IF has_function_privilege(v_role, 'public._client_line_rooms(uuid, boolean, jsonb, text, integer, text)', 'EXECUTE') THEN
      RAISE EXCEPTION 'G1: _client_line_rooms is executable by %', v_role;
    END IF;
  END LOOP;
  IF has_function_privilege('anon', 'public.get_client_project_selections(uuid)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.get_client_project_threshold(uuid)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.get_client_commercial_document_bundle(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'G2: a client reader is executable by anon';
  END IF;
  IF NOT has_function_privilege('authenticated', 'public.get_client_project_selections(uuid)', 'EXECUTE')
     OR NOT has_function_privilege('service_role', 'public.get_client_project_selections(uuid)', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.get_client_project_threshold(uuid)', 'EXECUTE')
     OR NOT has_function_privilege('service_role', 'public.get_client_project_threshold(uuid)', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.get_client_commercial_document_bundle(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'G3: a client reader lost a grant its base gave it';
  END IF;
  RAISE NOTICE 'T-37 G: grants hold';
END $$;

ROLLBACK;
