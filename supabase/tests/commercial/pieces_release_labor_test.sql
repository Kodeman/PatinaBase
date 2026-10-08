-- ═══════════════════════════════════════════════════════════════════════════
-- US-21 T-13 — labor is released with its piece (migration 00733; SQ-619)
--
-- Anchors: get_project_ffe_readiness base 00445:5; the authorization impl
-- _create_furnishings_authorization_from_schedule_00444_impl base 00578:2924
-- (the readiness gate 00445:88, renamed _impl by 00462; public outer
-- 00462:1408); add_labor_line 00732 (the fixture's labor line); columns 00729.
--
-- Studio A (owner O). One project with an executed design-services origin and
-- an overridden budget checkpoint covering every room. The release set is
-- a3's (SPEC §4.4, ADV-5): six specced pieces
--   L1 Custom cabinet          2 each  × $4,800  = $9,600   Living Room
--   L3 Hardware, 2 knobs       2 each  × $38     = $76      Living Room
--   F1 White oak floor       830 sq ft × $11.50  = $9,545   Living Room
--   D1 Dining table            1 each  × $6,800  = $6,800   Dining
--   T1 Porcelain floor tile  280 sq ft × $6.80   = $1,904   Primary Bath
--   R1 Wallpaper, grasscloth   9 roll  × $230    = $2,070   Bedroom
-- and R1a, the hanger's install under R1 (9 roll × $85 = $765), added with
-- add_labor_line. Also under the pieces: a removed second labor line on R1,
-- and a COM fabric (link_kind com) under D1; neither is released.
--
-- Cases:
--   R. Readiness: R1a is ready with its piece; with R1 blocked it is not, and
--      its only blocker is parent_not_ready; the piece's own blockers never
--      carry it; the COM child does not inherit its piece's readiness.
--   X. Refusals: R1a alone, and R1a with a piece that is not its own, refuse
--      with "Labor is released with its piece."; R1a alone under a blocked
--      piece is stopped by readiness (parent_not_ready); a piece whose labor
--      is not ready (no client price) refuses, naming the labor line, and
--      writes nothing.
--   D. Naming R1a beside R1 is the same release (the set is deduplicated).
--   W. Releasing the 6 ready pieces creates one authorization with 7 lines
--      and $30,760, the last being "Install, wallpaper hanger" $765 in the
--      Bedroom; the removed labor line and the COM fabric are not on it.
--   G. Grants: the impl stays closed to every API role; readiness stays
--      authenticated-only.
--
-- How to run (local stack, after applying 00732 and 00733):
--   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" \
--     -X -v ON_ERROR_STOP=1 -f supabase/tests/commercial/pieces_release_labor_test.sql
--
-- One transaction, rolled back at the end.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

SET LOCAL timezone TO 'UTC';
SET LOCAL statement_timeout = '60s';

CREATE OR REPLACE FUNCTION pg_temp.t13_as(p_actor uuid) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', p_actor, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', p_actor::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
END;
$$;

-- ─── fixtures ──────────────────────────────────────────────────────────────

INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, instance_id, aud, role)
VALUES ('73300000-0000-4000-8000-0000000000a1', 't13-owner@test.invalid', '', NOW(), NOW(), NOW(),
        '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');

INSERT INTO profiles (id, email, full_name, is_designer, created_at, updated_at)
VALUES ('73300000-0000-4000-8000-0000000000a1', 't13-owner@test.invalid', 'T13 Owner', true, NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

INSERT INTO organizations (id, type, name, slug)
VALUES ('73300000-0000-4000-8000-0000000000f1', 'design_studio', 'T13 Studio A', 't13-studio-a-test');

INSERT INTO organization_members (id, user_id, organization_id, role, status, joined_at)
VALUES ('73300000-0000-4000-8000-0000000000e1', '73300000-0000-4000-8000-0000000000a1',
        '73300000-0000-4000-8000-0000000000f1', 'owner', 'active', NOW());

INSERT INTO projects (id, name, designer_id, created_by, studio_id)
VALUES ('73300000-0000-4000-8000-000000000001', 'T13 Whole Home', '73300000-0000-4000-8000-0000000000a1',
        '73300000-0000-4000-8000-0000000000a1', '73300000-0000-4000-8000-0000000000f1');

INSERT INTO project_rooms (id, project_id, name, sort_order)
VALUES
  ('73300000-0000-4000-8000-0000000000c1', '73300000-0000-4000-8000-000000000001', 'Living Room',  0),
  ('73300000-0000-4000-8000-0000000000c2', '73300000-0000-4000-8000-000000000001', 'Dining',       1),
  ('73300000-0000-4000-8000-0000000000c3', '73300000-0000-4000-8000-000000000001', 'Primary Bath', 2),
  ('73300000-0000-4000-8000-0000000000c4', '73300000-0000-4000-8000-000000000001', 'Bedroom',      3);

INSERT INTO vendors (id, name)
VALUES
  ('73300000-0000-4000-8000-000000000011', 'Hollis Millwork'),
  ('73300000-0000-4000-8000-000000000012', 'Emtek'),
  ('73300000-0000-4000-8000-000000000013', 'Nord Hardwood Co.'),
  ('73300000-0000-4000-8000-000000000014', 'Woodward & Sons'),
  ('73300000-0000-4000-8000-000000000015', 'The Tile Shop'),
  ('73300000-0000-4000-8000-000000000016', 'Phillip Jeffries'),
  ('73300000-0000-4000-8000-000000000017', 'T13 Wallpaper Hanging'),
  ('73300000-0000-4000-8000-000000000018', 'T13 Mill');

-- The executed design-services origin (500/600) the release stands on.
INSERT INTO proposals (id, project_id, designer_id, title, status, document_kind, commercial_state)
VALUES ('73300000-0000-4000-8000-000000000500', '73300000-0000-4000-8000-000000000001',
        '73300000-0000-4000-8000-0000000000a1', 'T13 Design services', 'accepted', 'design_services', 'executed');
INSERT INTO project_commercial_documents (id, project_id, proposal_id, document_kind, is_origin, bound_at, executed_at, created_by)
VALUES ('73300000-0000-4000-8000-000000000600', '73300000-0000-4000-8000-000000000001',
        '73300000-0000-4000-8000-000000000500', 'design_services', true, now(), now(),
        '73300000-0000-4000-8000-0000000000a1');

-- A budget that covers every room.
INSERT INTO project_budget_versions (id, project_id, version, created_by)
VALUES ('73300000-0000-4000-8000-000000000700', '73300000-0000-4000-8000-000000000001', 1,
        '73300000-0000-4000-8000-0000000000a1');
INSERT INTO project_budget_lines (budget_version_id, project_room_id, room_name, category, low_cents, target_cents, high_cents)
VALUES
  ('73300000-0000-4000-8000-000000000700', '73300000-0000-4000-8000-0000000000c1', 'Living Room',  'Furnishings', 1000000, 2000000, 3000000),
  ('73300000-0000-4000-8000-000000000700', '73300000-0000-4000-8000-0000000000c2', 'Dining',       'Furnishings',  500000,  700000,  900000),
  ('73300000-0000-4000-8000-000000000700', '73300000-0000-4000-8000-0000000000c3', 'Primary Bath', 'Finishes',     100000,  200000,  300000),
  ('73300000-0000-4000-8000-000000000700', '73300000-0000-4000-8000-0000000000c4', 'Bedroom',      'Finishes',     200000,  300000,  400000);

-- The six pieces (sort 0–5), selected and priced.
INSERT INTO project_ffe_items (id, project_id, project_room_id, assignment_scope, name, status, item_type,
                               quantity, unit, unit_price_cents, trade_price_cents, line_total_cents,
                               vendor_id, vendor_name, design_disposition, sort_order)
VALUES
  ('73300000-0000-4000-8000-000000000201', '73300000-0000-4000-8000-000000000001', '73300000-0000-4000-8000-0000000000c1', 'room',
   'Custom cabinet', 'specified', 'fixed', 2, 'each', 480000, 390000, 960000,
   '73300000-0000-4000-8000-000000000011', 'Hollis Millwork', 'selected', 0),
  ('73300000-0000-4000-8000-000000000202', '73300000-0000-4000-8000-000000000001', '73300000-0000-4000-8000-0000000000c1', 'room',
   'Hardware, 2 knobs for custom cabinet', 'specified', 'fixed', 2, 'each', 3800, 2900, 7600,
   '73300000-0000-4000-8000-000000000012', 'Emtek', 'selected', 1),
  ('73300000-0000-4000-8000-000000000203', '73300000-0000-4000-8000-000000000001', '73300000-0000-4000-8000-0000000000c1', 'room',
   'White oak floor, satin Bona finish', 'specified', 'fixed', 830, 'sq_ft', 1150, 900, 954500,
   '73300000-0000-4000-8000-000000000013', 'Nord Hardwood Co.', 'selected', 2),
  ('73300000-0000-4000-8000-000000000204', '73300000-0000-4000-8000-000000000001', '73300000-0000-4000-8000-0000000000c2', 'room',
   'Dining table, custom walnut', 'specified', 'fixed', 1, 'each', 680000, 540000, 680000,
   '73300000-0000-4000-8000-000000000014', 'Woodward & Sons', 'selected', 3),
  ('73300000-0000-4000-8000-000000000205', '73300000-0000-4000-8000-000000000001', '73300000-0000-4000-8000-0000000000c3', 'room',
   'Porcelain floor tile, 12 x 24, matte', 'specified', 'fixed', 280, 'sq_ft', 680, 520, 190400,
   '73300000-0000-4000-8000-000000000015', 'The Tile Shop', 'selected', 4),
  ('73300000-0000-4000-8000-000000000206', '73300000-0000-4000-8000-000000000001', '73300000-0000-4000-8000-0000000000c4', 'room',
   'Phillip Jeffries Manila Hemp, Chalk', 'specified', 'fixed', 9, 'roll', 23000, 18400, 207000,
   '73300000-0000-4000-8000-000000000016', 'Phillip Jeffries', 'selected', 5);

-- 207: a COM fabric under the dining table (not labor; never expanded).
INSERT INTO project_ffe_items (id, project_id, project_room_id, assignment_scope, name, status, item_type,
                               quantity, unit, unit_price_cents, line_total_cents, vendor_id, vendor_name,
                               design_disposition, line_kind, link_kind, parent_ffe_item_id, sort_order)
VALUES ('73300000-0000-4000-8000-000000000207', '73300000-0000-4000-8000-000000000001', '73300000-0000-4000-8000-0000000000c2', 'room',
        'T13 COM fabric', 'specified', 'fixed', 6, 'yard', 4000, 24000,
        '73300000-0000-4000-8000-000000000018', 'T13 Mill', 'selected', 'goods', 'com',
        '73300000-0000-4000-8000-000000000204', 6);

CREATE TEMP TABLE t13_ids (key text PRIMARY KEY, id uuid NOT NULL) ON COMMIT DROP;

-- R1a through add_labor_line (00732), then a second labor line on R1 that is
-- removed. Then the checkpoint, published and overridden by the studio.
DO $$
DECLARE
  v_labor jsonb;
  v_removed jsonb;
  v_published jsonb;
BEGIN
  PERFORM pg_temp.t13_as('73300000-0000-4000-8000-0000000000a1');
  v_labor := public.add_labor_line('73300000-0000-4000-8000-000000000206',
    jsonb_build_object('name', 'Install, wallpaper hanger', 'quantity', 9, 'unit', 'roll',
                       'vendorId', '73300000-0000-4000-8000-000000000017'));
  v_removed := public.add_labor_line('73300000-0000-4000-8000-000000000206',
    jsonb_build_object('name', 'Strip old paper', 'quantity', 1, 'unit', 'lot',
                       'vendorId', '73300000-0000-4000-8000-000000000017'));
  INSERT INTO t13_ids VALUES ('labor', (v_labor->>'selectionId')::uuid),
                             ('removed', (v_removed->>'selectionId')::uuid);

  v_published := public.publish_budget_checkpoint('73300000-0000-4000-8000-000000000001',
                                                  '73300000-0000-4000-8000-000000000700');
  PERFORM public.override_budget_checkpoint((v_published->>'checkpointId')::uuid,
    'Client travelling; proceeding on the reviewed budget.');
END $$;

-- The install's client price ($85 / roll, no markup) and selection are set as
-- every line's are; the second line is removed. (Fixture writes, as postgres.)
SELECT set_config('app.ffe_mutation_rpc', 'on', true);
UPDATE project_ffe_items
   SET unit_price_cents = 8500, trade_price_cents = 8500, line_total_cents = 76500,
       item_type = 'fixed', design_disposition = 'selected'
 WHERE id = (SELECT id FROM t13_ids WHERE key = 'labor');
UPDATE project_ffe_items
   SET unit_price_cents = 30000, line_total_cents = 30000, item_type = 'fixed',
       design_disposition = 'not_selected', removed_at = now(),
       removed_by = '73300000-0000-4000-8000-0000000000a1', removal_reason = 'not needed after all'
 WHERE id = (SELECT id FROM t13_ids WHERE key = 'removed');
SELECT set_config('app.ffe_mutation_rpc', '', true);

-- ─── R. readiness ──────────────────────────────────────────────────────────

DO $$
DECLARE
  v_labor uuid := (SELECT id FROM t13_ids WHERE key = 'labor');
  v_r jsonb;
BEGIN
  PERFORM pg_temp.t13_as('73300000-0000-4000-8000-0000000000a1');

  ASSERT (SELECT line_kind = 'labor' AND link_kind = 'labor'
                 AND parent_ffe_item_id = '73300000-0000-4000-8000-000000000206'
                 AND project_room_id = '73300000-0000-4000-8000-0000000000c4'
            FROM project_ffe_items WHERE id = v_labor),
    'fixture: R1a is a labor line on R1 in the Bedroom';

  v_r := public.get_project_ffe_readiness(v_labor);
  ASSERT (v_r->>'ready')::boolean AND v_r->'missingFields' = '[]'::jsonb,
    format('R1: R1a is ready with its piece: %s', v_r);

  -- Block the piece: the labor follows it, by the one key.
  PERFORM set_config('app.ffe_mutation_rpc', 'on', true);
  UPDATE project_ffe_items SET blocked = true WHERE id = '73300000-0000-4000-8000-000000000206';
  v_r := public.get_project_ffe_readiness(v_labor);
  ASSERT NOT (v_r->>'ready')::boolean AND v_r->'missingFields' = '["parent_not_ready"]'::jsonb,
    format('R2: R1a under a blocked piece reads parent_not_ready only: %s', v_r);
  v_r := public.get_project_ffe_readiness('73300000-0000-4000-8000-000000000206');
  ASSERT v_r->'missingFields' = '["releaseBlock"]'::jsonb,
    format('R3: the piece''s own blockers never carry parent_not_ready: %s', v_r);
  UPDATE project_ffe_items SET blocked = false WHERE id = '73300000-0000-4000-8000-000000000206';

  -- A COM child is not labor: its piece's readiness is not its own.
  UPDATE project_ffe_items SET blocked = true WHERE id = '73300000-0000-4000-8000-000000000204';
  v_r := public.get_project_ffe_readiness('73300000-0000-4000-8000-000000000207');
  ASSERT (v_r->>'ready')::boolean,
    format('R4: the COM fabric does not inherit its piece''s readiness: %s', v_r);
  UPDATE project_ffe_items SET blocked = false WHERE id = '73300000-0000-4000-8000-000000000204';
  PERFORM set_config('app.ffe_mutation_rpc', '', true);

  RAISE NOTICE 'PASS R: labor is ready only with its piece (parent_not_ready)';
END $$;

-- ─── X. refusals ───────────────────────────────────────────────────────────

DO $$
DECLARE
  v_project constant uuid := '73300000-0000-4000-8000-000000000001';
  v_labor uuid := (SELECT id FROM t13_ids WHERE key = 'labor');
  v_err text;
  v_state text;
BEGIN
  PERFORM pg_temp.t13_as('73300000-0000-4000-8000-0000000000a1');

  -- X1: the labor line alone.
  BEGIN
    PERFORM public.create_furnishings_authorization_from_schedule(v_project, 'Labor alone', ARRAY[v_labor], NULL);
    RAISE EXCEPTION 'X1: a labor line was released without its piece';
  EXCEPTION WHEN check_violation THEN
    GET STACKED DIAGNOSTICS v_err = MESSAGE_TEXT, v_state = RETURNED_SQLSTATE;
  END;
  ASSERT v_err = 'Labor is released with its piece.' AND v_state = '23514',
    format('X1: labor alone must refuse with the sentence: %L (%s)', v_err, v_state);

  -- X2: the labor line with a piece that is not its own.
  BEGIN
    PERFORM public.create_furnishings_authorization_from_schedule(v_project, 'Labor with another piece',
      ARRAY['73300000-0000-4000-8000-000000000204'::uuid, v_labor], NULL);
    RAISE EXCEPTION 'X2: a labor line was released with a piece that is not its own';
  EXCEPTION WHEN check_violation THEN
    GET STACKED DIAGNOSTICS v_err = MESSAGE_TEXT;
  END;
  ASSERT v_err = 'Labor is released with its piece.',
    format('X2: labor beside another piece must refuse with the sentence: %L', v_err);

  -- X3: labor alone under a blocked piece is stopped by readiness first.
  PERFORM set_config('app.ffe_mutation_rpc', 'on', true);
  UPDATE project_ffe_items SET blocked = true WHERE id = '73300000-0000-4000-8000-000000000206';
  BEGIN
    PERFORM public.create_furnishings_authorization_from_schedule(v_project, 'Labor, piece blocked', ARRAY[v_labor], NULL);
    RAISE EXCEPTION 'X3: a labor line under a blocked piece reached the release';
  EXCEPTION WHEN check_violation THEN
    GET STACKED DIAGNOSTICS v_err = MESSAGE_TEXT;
  END;
  ASSERT v_err LIKE '%is not ready for authorization%parent_not_ready%',
    format('X3: readiness must name parent_not_ready: %L', v_err);
  UPDATE project_ffe_items SET blocked = false WHERE id = '73300000-0000-4000-8000-000000000206';

  -- X4: the piece cannot leave its labor behind. With the install unpriced,
  -- releasing the wallpaper refuses, naming the install, and writes nothing.
  UPDATE project_ffe_items SET unit_price_cents = 0, line_total_cents = 0 WHERE id = v_labor;
  BEGIN
    PERFORM public.create_furnishings_authorization_from_schedule(v_project, 'Wallpaper without its install',
      ARRAY['73300000-0000-4000-8000-000000000206'::uuid], NULL);
    RAISE EXCEPTION 'X4: a piece was released while its labor was not ready';
  EXCEPTION WHEN check_violation THEN
    GET STACKED DIAGNOSTICS v_err = MESSAGE_TEXT;
  END;
  ASSERT v_err = format('schedule line %s is not ready for authorization: ["clientPrice"]', v_labor),
    format('X4: the refusal must name the install and its blocker: %L', v_err);
  UPDATE project_ffe_items SET unit_price_cents = 8500, line_total_cents = 76500 WHERE id = v_labor;
  PERFORM set_config('app.ffe_mutation_rpc', '', true);

  ASSERT NOT EXISTS (SELECT 1 FROM project_commercial_documents
                      WHERE project_id = v_project AND document_kind = 'furnishings_authorization'),
    'X: no refusal may leave an authorization behind';

  RAISE NOTICE 'PASS X: labor alone refuses; a piece never leaves its labor behind';
END $$;

-- ─── D. naming the labor beside its piece is the same release ──────────────

DO $$
DECLARE
  v_labor uuid := (SELECT id FROM t13_ids WHERE key = 'labor');
  v_wave jsonb;
BEGIN
  PERFORM pg_temp.t13_as('73300000-0000-4000-8000-0000000000a1');
  BEGIN
    v_wave := public.create_furnishings_authorization_from_schedule('73300000-0000-4000-8000-000000000001',
      'Wallpaper and its install', ARRAY['73300000-0000-4000-8000-000000000206'::uuid, v_labor, v_labor], NULL);
    ASSERT (v_wave->>'itemCount')::integer = 2,
      format('D: the wallpaper named with its install is 2 lines: %s', v_wave);
    ASSERT (SELECT count(*) = 2 AND sum(client_line_total_cents) = 207000 + 76500
              FROM furnishing_authorization_items a
              JOIN project_commercial_documents d ON d.id = a.commercial_document_id
             WHERE d.proposal_id = (v_wave->>'proposalId')::uuid),
      'D: one row each, $2,835';
    RAISE SQLSTATE 'PT733';  -- undo this release; W releases the full set
  EXCEPTION WHEN SQLSTATE 'PT733' THEN NULL;
  END;
  RAISE NOTICE 'PASS D: labor named beside its piece is not doubled';
END $$;

-- ─── W. the worked release: 6 pieces → 7 lines, $30,760 ────────────────────

DO $$
DECLARE
  v_labor uuid := (SELECT id FROM t13_ids WHERE key = 'labor');
  v_wave jsonb;
  v_last record;
BEGIN
  PERFORM pg_temp.t13_as('73300000-0000-4000-8000-0000000000a1');
  v_wave := public.create_furnishings_authorization_from_schedule('73300000-0000-4000-8000-000000000001',
    'Authorization No. 1', ARRAY[
      '73300000-0000-4000-8000-000000000201'::uuid, '73300000-0000-4000-8000-000000000202'::uuid,
      '73300000-0000-4000-8000-000000000203'::uuid, '73300000-0000-4000-8000-000000000204'::uuid,
      '73300000-0000-4000-8000-000000000205'::uuid, '73300000-0000-4000-8000-000000000206'::uuid], NULL);
  INSERT INTO t13_ids VALUES ('proposal', (v_wave->>'proposalId')::uuid);

  ASSERT (v_wave->>'itemCount')::integer = 7,
    format('W1: releasing 6 pieces names 7 lines: %s', v_wave);
  ASSERT (SELECT subtotal = 3076000 AND total_amount = 3076000
            FROM proposals WHERE id = (v_wave->>'proposalId')::uuid),
    'W2: the release is $30,760';
  ASSERT (SELECT count(*) = 7 AND sum(client_line_total_cents) = 3076000
            FROM furnishing_authorization_items a
            JOIN project_commercial_documents d ON d.id = a.commercial_document_id
           WHERE d.proposal_id = (v_wave->>'proposalId')::uuid),
    'W3: 7 frozen lines summing $30,760';

  SELECT a.source_ffe_item_id, a.name, a.room_name, a.quantity, a.client_unit_price_cents,
         a.client_line_total_cents, a.vendor_name
    INTO v_last
    FROM furnishing_authorization_items a
    JOIN project_commercial_documents d ON d.id = a.commercial_document_id
   WHERE d.proposal_id = (v_wave->>'proposalId')::uuid
   ORDER BY a.sort_order DESC
   LIMIT 1;
  ASSERT v_last.source_ffe_item_id = v_labor
     AND v_last.name = 'Install, wallpaper hanger'
     AND v_last.room_name = 'Bedroom'
     AND v_last.quantity = 9
     AND v_last.client_unit_price_cents = 8500
     AND v_last.client_line_total_cents = 76500
     AND v_last.vendor_name = 'T13 Wallpaper Hanging',
    format('W4: the last line is the install, $765: %s', row_to_json(v_last));

  ASSERT NOT EXISTS (
    SELECT 1 FROM furnishing_authorization_items a
     WHERE a.source_ffe_item_id IN ((SELECT id FROM t13_ids WHERE key = 'removed'),
                                    '73300000-0000-4000-8000-000000000207'::uuid)),
    'W5: neither the removed labor line nor the COM fabric is released';

  -- Once released together, the install cannot be released again on its own.
  BEGIN
    PERFORM public.create_furnishings_authorization_from_schedule('73300000-0000-4000-8000-000000000001',
      'Install again', ARRAY[v_labor], NULL);
    RAISE EXCEPTION 'W6: the released install was released again alone';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  RAISE NOTICE 'PASS W: 6 pieces release as 7 lines, $30,760, ending with the $765 install';
END $$;

-- ─── G. grants ─────────────────────────────────────────────────────────────

DO $$
BEGIN
  ASSERT NOT has_function_privilege('authenticated',
    'public._create_furnishings_authorization_from_schedule_00444_impl(uuid,text,uuid[],numeric)', 'EXECUTE')
     AND NOT has_function_privilege('anon',
    'public._create_furnishings_authorization_from_schedule_00444_impl(uuid,text,uuid[],numeric)', 'EXECUTE')
     AND NOT has_function_privilege('service_role',
    'public._create_furnishings_authorization_from_schedule_00444_impl(uuid,text,uuid[],numeric)', 'EXECUTE'),
    'G1: the impl stays closed to every API role';
  ASSERT has_function_privilege('authenticated', 'public.get_project_ffe_readiness(uuid)', 'EXECUTE')
     AND NOT has_function_privilege('anon', 'public.get_project_ffe_readiness(uuid)', 'EXECUTE'),
    'G2: readiness stays authenticated-only';
  RAISE NOTICE 'PASS G: grants unchanged';
END $$;

ROLLBACK;
