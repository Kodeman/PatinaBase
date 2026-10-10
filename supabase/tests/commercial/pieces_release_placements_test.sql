-- ═══════════════════════════════════════════════════════════════════════════
-- US-21 T-36 — the authorization freezes each line's rooms (migration 00744;
-- SQ-642)
--
-- CONTRACT §2 00744; D7 phase 2; slice 3 "why here" (one row, never four,
-- never only the primary).
-- Anchors: _create_furnishings_authorization_from_schedule_00444_impl base
-- 00733:134 (step 2b, labor with its piece); guard_furnishing_authorization_
-- item_insert base 00462:1449; the new _furnishing_authorization_item_snapshot
-- (00744); set_line_placements 00737:841; add_labor_line 00732;
-- set_labor_line_price 00737; snapshot keys mirror 00735:74-83.
--
-- Scenario S2, frame a5: the white oak floor, 913 sq ft at $11.50
-- ($10,499.50), placed Hall 120 (entry and closet) · Living 320 · Dining 180
-- · Kitchen 210 (830 measured, 83 waste). Beside it: a hall runner (one room,
-- 3 each × $400) and the floor's install (labor, 913 sq ft × $3).
--
-- The release runs through the public outer under SET LOCAL ROLE
-- authenticated, so the insert guard (00462) runs its full re-derivation
-- instead of its direct-postgres bypass. That is the seam this file proves:
-- the guard and the release agree on the new snapshot.
--
-- Cases:
--   O. One row: the floor is one authorization row, room_name the primary
--      (Hall), quantity 913, $10,499.50; its snapshot names 4 rooms in order
--      summing 830, with the area note; unit sq_ft; need label kept.
--   S. Single-room and default keys: the runner's placements, unit, lineKind,
--      parentFfeItemId and needLabel are JSON null; the six base keys remain.
--   L. Labor rides with its piece: releasing the floor alone freezes 3 lines
--      (floor, runner, install) and the install's snapshot carries lineKind
--      labor and the floor as parentFfeItemId.
--   F. Every frozen snapshot equals the helper re-derived from its source.
--   G. Grants: the helper, the impl and the guard are closed to every API role.
--
-- How to run (local stack, after applying 00744):
--   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" \
--     -X -v ON_ERROR_STOP=1 -f supabase/tests/commercial/pieces_release_placements_test.sql
--
-- One transaction, rolled back at the end.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

SET LOCAL timezone TO 'UTC';
SET LOCAL statement_timeout = '60s';

CREATE OR REPLACE FUNCTION pg_temp.t36_as(p_actor uuid) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', p_actor, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', p_actor::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
END;
$$;

-- ─── fixtures ──────────────────────────────────────────────────────────────

INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, instance_id, aud, role)
VALUES ('74400000-0000-4000-8000-0000000000a1', 't36-owner@test.invalid', '', NOW(), NOW(), NOW(),
        '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');

INSERT INTO profiles (id, email, full_name, is_designer, created_at, updated_at)
VALUES ('74400000-0000-4000-8000-0000000000a1', 't36-owner@test.invalid', 'T36 Owner', true, NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

INSERT INTO organizations (id, type, name, slug)
VALUES ('74400000-0000-4000-8000-0000000000f1', 'design_studio', 'T36 Studio', 't36-studio-test');

INSERT INTO organization_members (id, user_id, organization_id, role, status, joined_at)
VALUES ('74400000-0000-4000-8000-0000000000e1', '74400000-0000-4000-8000-0000000000a1',
        '74400000-0000-4000-8000-0000000000f1', 'owner', 'active', NOW());

INSERT INTO projects (id, name, designer_id, created_by, studio_id)
VALUES ('74400000-0000-4000-8000-000000000001', 'T36 Main Level', '74400000-0000-4000-8000-0000000000a1',
        '74400000-0000-4000-8000-0000000000a1', '74400000-0000-4000-8000-0000000000f1');

INSERT INTO project_rooms (id, project_id, name, sort_order)
VALUES
  ('74400000-0000-4000-8000-0000000000c1', '74400000-0000-4000-8000-000000000001', 'Hall',    0),
  ('74400000-0000-4000-8000-0000000000c2', '74400000-0000-4000-8000-000000000001', 'Living',  1),
  ('74400000-0000-4000-8000-0000000000c3', '74400000-0000-4000-8000-000000000001', 'Dining',  2),
  ('74400000-0000-4000-8000-0000000000c4', '74400000-0000-4000-8000-000000000001', 'Kitchen', 3);

INSERT INTO vendors (id, name)
VALUES
  ('74400000-0000-4000-8000-000000000011', 'Nord Hardwood Co.'),
  ('74400000-0000-4000-8000-000000000012', 'T36 Rug Maker'),
  ('74400000-0000-4000-8000-000000000013', 'T36 Floor Installer');

-- The executed design-services origin the release stands on.
INSERT INTO proposals (id, project_id, designer_id, title, status, document_kind, commercial_state)
VALUES ('74400000-0000-4000-8000-000000000500', '74400000-0000-4000-8000-000000000001',
        '74400000-0000-4000-8000-0000000000a1', 'T36 Design services', 'accepted', 'design_services', 'executed');
INSERT INTO project_commercial_documents (id, project_id, proposal_id, document_kind, is_origin, bound_at, executed_at, created_by)
VALUES ('74400000-0000-4000-8000-000000000600', '74400000-0000-4000-8000-000000000001',
        '74400000-0000-4000-8000-000000000500', 'design_services', true, now(), now(),
        '74400000-0000-4000-8000-0000000000a1');

-- A budget that covers every room.
INSERT INTO project_budget_versions (id, project_id, version, created_by)
VALUES ('74400000-0000-4000-8000-000000000700', '74400000-0000-4000-8000-000000000001', 1,
        '74400000-0000-4000-8000-0000000000a1');
INSERT INTO project_budget_lines (budget_version_id, project_room_id, room_name, category, low_cents, target_cents, high_cents)
VALUES
  ('74400000-0000-4000-8000-000000000700', '74400000-0000-4000-8000-0000000000c1', 'Hall',    'Finishes', 100000, 500000, 900000),
  ('74400000-0000-4000-8000-000000000700', '74400000-0000-4000-8000-0000000000c2', 'Living',  'Finishes', 100000, 500000, 900000),
  ('74400000-0000-4000-8000-000000000700', '74400000-0000-4000-8000-0000000000c3', 'Dining',  'Finishes', 100000, 500000, 900000),
  ('74400000-0000-4000-8000-000000000700', '74400000-0000-4000-8000-0000000000c4', 'Kitchen', 'Finishes', 100000, 500000, 900000);

-- F: the oak floor, in the Hall for now (placements move nothing but rooms).
-- H: the hall runner, one room.
INSERT INTO project_ffe_items (id, project_id, project_room_id, assignment_scope, name, status, item_type,
                               quantity, unit, unit_price_cents, trade_price_cents, line_total_cents,
                               vendor_id, vendor_name, design_disposition, sort_order)
VALUES
  ('74400000-0000-4000-8000-000000000201', '74400000-0000-4000-8000-000000000001', '74400000-0000-4000-8000-0000000000c1', 'room',
   'White oak floor, satin Bona finish', 'specified', 'fixed', 913, 'sq_ft', 1150, 900, 1049950,
   '74400000-0000-4000-8000-000000000011', 'Nord Hardwood Co.', 'selected', 0),
  ('74400000-0000-4000-8000-000000000202', '74400000-0000-4000-8000-000000000001', '74400000-0000-4000-8000-0000000000c1', 'room',
   'Hall runner', 'specified', 'fixed', 3, 'each', 40000, 30000, 120000,
   '74400000-0000-4000-8000-000000000012', 'T36 Rug Maker', 'selected', 1);

CREATE TEMP TABLE t36_ids (key text PRIMARY KEY, id uuid NOT NULL) ON COMMIT DROP;

-- The floor's need label (D2) differs from its name; the runner's does not.
DO $$
DECLARE
  v_thread uuid;
BEGIN
  SELECT selection_thread_id INTO v_thread FROM project_ffe_items
   WHERE id = '74400000-0000-4000-8000-000000000201';
  ASSERT v_thread IS NOT NULL, 'fixture: the floor has a selection thread';
  UPDATE project_ffe_selection_threads SET need_label = 'Main-level floor' WHERE id = v_thread;
  UPDATE project_ffe_selection_threads SET need_label = 'Hall runner'
   WHERE id = (SELECT selection_thread_id FROM project_ffe_items
                WHERE id = '74400000-0000-4000-8000-000000000202');
END $$;

-- Placements, the install, and the checkpoint, as the studio.
DO $$
DECLARE
  v_placed jsonb;
  v_labor jsonb;
  v_priced jsonb;
  v_published jsonb;
BEGIN
  PERFORM pg_temp.t36_as('74400000-0000-4000-8000-0000000000a1');

  v_placed := public.set_line_placements('74400000-0000-4000-8000-000000000201', '[
    {"roomId":"74400000-0000-4000-8000-0000000000c1","quantity":120,"areaNote":"entry and closet"},
    {"roomId":"74400000-0000-4000-8000-0000000000c2","quantity":320},
    {"roomId":"74400000-0000-4000-8000-0000000000c3","quantity":180},
    {"roomId":"74400000-0000-4000-8000-0000000000c4","quantity":210}
  ]'::jsonb);
  ASSERT (v_placed->>'wasteQuantity')::int = 83,
    format('fixture: the floor is placed 830 of 913: %s', v_placed);

  v_labor := public.add_labor_line('74400000-0000-4000-8000-000000000201',
    jsonb_build_object('name', 'Install, oak floor', 'quantity', 913, 'unit', 'sq_ft',
                       'vendorId', '74400000-0000-4000-8000-000000000013'));
  INSERT INTO t36_ids VALUES ('labor', (v_labor->>'selectionId')::uuid);
  v_priced := public.set_labor_line_price((v_labor->>'selectionId')::uuid, 300);
  ASSERT (v_priced->>'lineTotalCents')::int = 273900,
    format('fixture: the install prices at 913 sq ft x $3 = $2,739: %s', v_priced);

  v_published := public.publish_budget_checkpoint('74400000-0000-4000-8000-000000000001',
                                                  '74400000-0000-4000-8000-000000000700');
  PERFORM public.override_budget_checkpoint((v_published->>'checkpointId')::uuid,
    'Client travelling; proceeding on the reviewed budget.');
END $$;
SELECT set_config('app.ffe_mutation_rpc', 'on', true);
UPDATE project_ffe_items
   SET trade_price_cents = 250, item_type = 'fixed', design_disposition = 'selected'
 WHERE id = (SELECT id FROM t36_ids WHERE key = 'labor');
SELECT set_config('app.ffe_mutation_rpc', '', true);

-- ─── the release, through the API path ─────────────────────────────────────
-- Under SET LOCAL ROLE authenticated the 00462 guard re-derives every row's
-- snapshot; a mismatch refuses the whole release. The proposal id leaves the
-- block through a transaction-local setting.

SELECT pg_temp.t36_as('74400000-0000-4000-8000-0000000000a1');
SET LOCAL ROLE authenticated;
DO $$
DECLARE
  v_wave jsonb;
BEGIN
  ASSERT current_setting('role') = 'authenticated', 'release: the API role is in force';
  v_wave := public.create_furnishings_authorization_from_schedule('74400000-0000-4000-8000-000000000001',
    'Authorization No. 1', ARRAY['74400000-0000-4000-8000-000000000201'::uuid,
                                 '74400000-0000-4000-8000-000000000202'::uuid], NULL);
  ASSERT (v_wave->>'itemCount')::integer = 3,
    format('L1: the floor and the runner release with the install, 3 lines: %s', v_wave);
  ASSERT v_wave->>'documentFingerprint' IS NOT NULL, 'release: the document has a fingerprint';
  PERFORM set_config('t36.proposal', v_wave->>'proposalId', true);
END $$;
RESET ROLE;

-- ─── O. one row, every room ────────────────────────────────────────────────

DO $$
DECLARE
  v_proposal uuid := current_setting('t36.proposal')::uuid;
  v_rows integer;
  v_row record;
  v_rooms jsonb;
BEGIN
  SELECT count(*) INTO v_rows
    FROM furnishing_authorization_items a
    JOIN project_commercial_documents d ON d.id = a.commercial_document_id
   WHERE d.proposal_id = v_proposal
     AND a.source_ffe_item_id = '74400000-0000-4000-8000-000000000201';
  ASSERT v_rows = 1, format('O1: the floor is one authorization row, never one per room: %s', v_rows);

  SELECT a.* INTO v_row
    FROM furnishing_authorization_items a
    JOIN project_commercial_documents d ON d.id = a.commercial_document_id
   WHERE d.proposal_id = v_proposal
     AND a.source_ffe_item_id = '74400000-0000-4000-8000-000000000201';
  ASSERT v_row.room_name = 'Hall' AND v_row.project_room_id = '74400000-0000-4000-8000-0000000000c1',
    format('O2: room_name stays the primary room: %s', v_row.room_name);
  ASSERT v_row.quantity = 913 AND v_row.client_unit_price_cents = 1150
     AND v_row.client_line_total_cents = 1049950,
    format('O3: the row carries the whole 913 sq ft and $10,499.50: %s x %s = %s',
           v_row.quantity, v_row.client_unit_price_cents, v_row.client_line_total_cents);

  v_rooms := v_row.snapshot->'placements';
  ASSERT jsonb_typeof(v_rooms) = 'array' AND jsonb_array_length(v_rooms) = 4,
    format('O4: the snapshot names 4 rooms, never only the primary: %s', v_rooms);
  ASSERT (SELECT sum((p->>'quantity')::int) FROM jsonb_array_elements(v_rooms) p) = 830,
    format('O5: the rooms sum to 830 of 913: %s', v_rooms);
  ASSERT v_rooms = '[{"roomName":"Hall","quantity":120,"areaNote":"entry and closet"},
                     {"roomName":"Living","quantity":320,"areaNote":null},
                     {"roomName":"Dining","quantity":180,"areaNote":null},
                     {"roomName":"Kitchen","quantity":210,"areaNote":null}]'::jsonb,
    format('O6: rooms in placement order with their shares and note: %s', v_rooms);
  ASSERT v_row.snapshot->>'unit' = 'sq_ft'
     AND v_row.snapshot->>'needLabel' = 'Main-level floor'
     AND v_row.snapshot->'lineKind' = 'null'::jsonb
     AND v_row.snapshot->'parentFfeItemId' = 'null'::jsonb,
    format('O7: unit, need label, goods, no parent: %s', v_row.snapshot);

  RAISE NOTICE 'PASS O: the oak floor is one row, 913 sq ft, its snapshot 4 rooms summing 830';
END $$;

-- ─── S. single room and default keys ───────────────────────────────────────

DO $$
DECLARE
  v_snap jsonb;
BEGIN
  SELECT a.snapshot INTO v_snap
    FROM furnishing_authorization_items a
    JOIN project_commercial_documents d ON d.id = a.commercial_document_id
   WHERE d.proposal_id = current_setting('t36.proposal')::uuid
     AND a.source_ffe_item_id = '74400000-0000-4000-8000-000000000202';
  ASSERT v_snap->'placements' = 'null'::jsonb
     AND v_snap->'unit' = 'null'::jsonb
     AND v_snap->'needLabel' = 'null'::jsonb
     AND v_snap->'lineKind' = 'null'::jsonb
     AND v_snap->'parentFfeItemId' = 'null'::jsonb,
    format('S1: a one-room each goods line keeps every new key null: %s', v_snap);
  ASSERT v_snap ?& ARRAY['budgetMinCents', 'budgetMaxCents', 'docCode', 'customFields', 'notes', 'productImageUrl'],
    format('S2: the six base keys remain: %s', v_snap);

  RAISE NOTICE 'PASS S: a single-room default line freezes no placements';
END $$;

-- ─── L. labor rides with its piece ─────────────────────────────────────────

DO $$
DECLARE
  v_labor uuid := (SELECT id FROM t36_ids WHERE key = 'labor');
  v_row record;
BEGIN
  SELECT a.* INTO v_row
    FROM furnishing_authorization_items a
    JOIN project_commercial_documents d ON d.id = a.commercial_document_id
   WHERE d.proposal_id = current_setting('t36.proposal')::uuid
     AND a.source_ffe_item_id = v_labor;
  ASSERT FOUND, 'L2: the install is on the floor''s authorization';
  ASSERT v_row.name = 'Install, oak floor' AND v_row.room_name = 'Hall'
     AND v_row.quantity = 913 AND v_row.client_line_total_cents = 273900,
    format('L3: the install, 913 sq ft, $2,739, in the floor''s primary room: %s', row_to_json(v_row));
  ASSERT v_row.snapshot->>'lineKind' = 'labor'
     AND v_row.snapshot->>'parentFfeItemId' = '74400000-0000-4000-8000-000000000201'
     AND v_row.snapshot->>'unit' = 'sq_ft'
     AND v_row.snapshot->'placements' = 'null'::jsonb,
    format('L4: the install''s snapshot names it labor under the floor: %s', v_row.snapshot);
  ASSERT (SELECT subtotal = 1049950 + 120000 + 273900 FROM proposals
           WHERE id = current_setting('t36.proposal')::uuid),
    'L5: the release is $14,437.50';

  RAISE NOTICE 'PASS L: the install rides with the floor and names its piece';
END $$;

-- ─── F. the guard's derivation is the release's ────────────────────────────

DO $$
BEGIN
  ASSERT NOT EXISTS (
    SELECT 1
      FROM furnishing_authorization_items a
      JOIN project_commercial_documents d ON d.id = a.commercial_document_id
      JOIN project_ffe_items i ON i.id = a.source_ffe_item_id
     WHERE d.proposal_id = current_setting('t36.proposal')::uuid
       AND a.snapshot IS DISTINCT FROM public._furnishing_authorization_item_snapshot(i)),
    'F1: every frozen snapshot equals the helper re-derived from its source';
  RAISE NOTICE 'PASS F: the frozen snapshot is the one definition';
END $$;

-- ─── G. grants ─────────────────────────────────────────────────────────────

DO $$
DECLARE
  v_role text;
BEGIN
  FOREACH v_role IN ARRAY ARRAY['anon', 'authenticated', 'service_role']
  LOOP
    ASSERT NOT has_function_privilege(v_role,
      'public._furnishing_authorization_item_snapshot(public.project_ffe_items)', 'EXECUTE'),
      format('G1: the snapshot helper is closed to %s', v_role);
    ASSERT NOT has_function_privilege(v_role,
      'public._create_furnishings_authorization_from_schedule_00444_impl(uuid,text,uuid[],numeric)', 'EXECUTE'),
      format('G2: the impl is closed to %s', v_role);
    ASSERT NOT has_function_privilege(v_role,
      'public.guard_furnishing_authorization_item_insert()', 'EXECUTE'),
      format('G3: the guard is closed to %s', v_role);
  END LOOP;
  RAISE NOTICE 'PASS G: grants closed';
END $$;

ROLLBACK;
