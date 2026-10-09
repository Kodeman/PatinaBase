-- ═══════════════════════════════════════════════════════════════════════════
-- US-21 T-51b — the working budget splits a placed line across its rooms by
-- share (migration 00757; SQ-690)
--
-- D7 phase 3: every per-room money reader splits a placed line by share, the
-- same rule as the Account Page (T-51, use-account-page.ts accountRoomRows).
-- Bases: _derive_working_budget_draft_00661_impl (00423:3173) and
-- _publish_budget_checkpoint_00661_impl (00578:3305), reached through their
-- public wrappers (00661); the grid reads get_project_working_budget.
--
-- Fixture, one project, four rooms (Hall · Living Room · Dining · Kitchen):
--   oak floor   Flooring           913 sq ft × $11.50 = $10,499.50, placed
--                                  Hall 120 · Living Room 320 · Dining 180 ·
--                                  Kitchen 210 (830 placed, 83 waste)
--   drapery     Window Treatments  4 × $250.01 = $1,000.04, placed Living Room
--                                  1 · Dining 1 · Kitchen 1 (tied remainders)
--   sconces     Lighting           4 × $25.00 = $100.00, placed Dining 1 ·
--                                  Kitchen 2 (the larger remainder wins)
--   runner      Rugs               3 × $400 in the Hall, no placements
--   console     Decor              2 × $450 in the Living Room, one placement
--
-- Cases:
--   D. derive mints one line per (room, category) slice; the four flooring
--      targets are the floor's shares and sum to 1,049,950.
--   P. publish stamps scheduled_cents by share; get_project_working_budget
--      returns the same figures the grid shows.
--   R. largest remainder: tied remainders go in placement order; a larger
--      remainder beats placement order.
--   S. single-room lines (no placements, one placement) count whole, as before.
--   T. the job total is unchanged: every derived target, every scheduled
--      stamp and the version target total equal the whole lines' sum.
--
-- How to run (local stack, after applying 00757):
--   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" \
--     -X -v ON_ERROR_STOP=1 -f supabase/tests/commercial/pieces_working_budget_shares_test.sql
--
-- One transaction, rolled back at the end.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

SET LOCAL timezone TO 'UTC';
SET LOCAL statement_timeout = '60s';

CREATE OR REPLACE FUNCTION pg_temp.t51b_as(p_actor uuid) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', p_actor, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', p_actor::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
END;
$$;

-- ─── fixtures ──────────────────────────────────────────────────────────────

INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, instance_id, aud, role)
VALUES ('75700000-0000-4000-8000-0000000000a1', 't51b-owner@test.invalid', '', NOW(), NOW(), NOW(),
        '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');

INSERT INTO profiles (id, email, full_name, is_designer, created_at, updated_at)
VALUES ('75700000-0000-4000-8000-0000000000a1', 't51b-owner@test.invalid', 'T51b Owner', true, NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

INSERT INTO organizations (id, type, name, slug)
VALUES ('75700000-0000-4000-8000-0000000000f1', 'design_studio', 'T51b Studio', 't51b-studio-test');

INSERT INTO organization_members (id, user_id, organization_id, role, status, joined_at)
VALUES ('75700000-0000-4000-8000-0000000000e1', '75700000-0000-4000-8000-0000000000a1',
        '75700000-0000-4000-8000-0000000000f1', 'owner', 'active', NOW());

INSERT INTO projects (id, name, designer_id, created_by, studio_id)
VALUES ('75700000-0000-4000-8000-000000000001', 'T51b Main Level', '75700000-0000-4000-8000-0000000000a1',
        '75700000-0000-4000-8000-0000000000a1', '75700000-0000-4000-8000-0000000000f1');

INSERT INTO project_rooms (id, project_id, name, sort_order)
VALUES
  ('75700000-0000-4000-8000-0000000000c1', '75700000-0000-4000-8000-000000000001', 'Hall',        0),
  ('75700000-0000-4000-8000-0000000000c2', '75700000-0000-4000-8000-000000000001', 'Living Room', 1),
  ('75700000-0000-4000-8000-0000000000c3', '75700000-0000-4000-8000-000000000001', 'Dining',      2),
  ('75700000-0000-4000-8000-0000000000c4', '75700000-0000-4000-8000-000000000001', 'Kitchen',     3);

INSERT INTO vendors (id, name)
VALUES ('75700000-0000-4000-8000-000000000011', 'Nord Hardwood Co.');

-- The executed design-services origin a checkpoint stands on.
INSERT INTO proposals (id, project_id, designer_id, title, status, document_kind, commercial_state)
VALUES ('75700000-0000-4000-8000-000000000500', '75700000-0000-4000-8000-000000000001',
        '75700000-0000-4000-8000-0000000000a1', 'T51b Design services', 'accepted', 'design_services', 'executed');
INSERT INTO project_commercial_documents (id, project_id, proposal_id, document_kind, is_origin, bound_at, executed_at, created_by)
VALUES ('75700000-0000-4000-8000-000000000600', '75700000-0000-4000-8000-000000000001',
        '75700000-0000-4000-8000-000000000500', 'design_services', true, now(), now(),
        '75700000-0000-4000-8000-0000000000a1');

INSERT INTO project_ffe_items (id, project_id, project_room_id, assignment_scope, name, status, item_type,
                               ffe_category, quantity, unit, unit_price_cents, line_total_cents,
                               vendor_id, vendor_name, design_disposition, sort_order)
VALUES
  ('75700000-0000-4000-8000-000000000201', '75700000-0000-4000-8000-000000000001', '75700000-0000-4000-8000-0000000000c1', 'room',
   'White oak floor, satin Bona finish', 'specified', 'fixed', 'Flooring', 913, 'sq_ft', 1150, 1049950,
   '75700000-0000-4000-8000-000000000011', 'Nord Hardwood Co.', 'selected', 0),
  ('75700000-0000-4000-8000-000000000202', '75700000-0000-4000-8000-000000000001', '75700000-0000-4000-8000-0000000000c2', 'room',
   'Linen drapery panel', 'specified', 'fixed', 'Window Treatments', 4, 'each', 25001, 100004,
   '75700000-0000-4000-8000-000000000011', 'Nord Hardwood Co.', 'selected', 1),
  ('75700000-0000-4000-8000-000000000203', '75700000-0000-4000-8000-000000000001', '75700000-0000-4000-8000-0000000000c3', 'room',
   'Brass sconce', 'specified', 'fixed', 'Lighting', 4, 'each', 2500, 10000,
   '75700000-0000-4000-8000-000000000011', 'Nord Hardwood Co.', 'selected', 2),
  ('75700000-0000-4000-8000-000000000204', '75700000-0000-4000-8000-000000000001', '75700000-0000-4000-8000-0000000000c1', 'room',
   'Hall runner', 'specified', 'fixed', 'Rugs', 3, 'each', 40000, 120000,
   '75700000-0000-4000-8000-000000000011', 'Nord Hardwood Co.', 'selected', 3),
  ('75700000-0000-4000-8000-000000000205', '75700000-0000-4000-8000-000000000001', '75700000-0000-4000-8000-0000000000c2', 'room',
   'Walnut console', 'specified', 'fixed', 'Decor', 2, 'each', 45000, 90000,
   '75700000-0000-4000-8000-000000000011', 'Nord Hardwood Co.', 'selected', 4);

-- Placements (through the act, as the studio), then derive and publish.
DO $$
DECLARE
  v_placed jsonb;
BEGIN
  PERFORM pg_temp.t51b_as('75700000-0000-4000-8000-0000000000a1');

  v_placed := public.set_line_placements('75700000-0000-4000-8000-000000000201', '[
    {"roomId":"75700000-0000-4000-8000-0000000000c1","quantity":120,"areaNote":"entry and closet"},
    {"roomId":"75700000-0000-4000-8000-0000000000c2","quantity":320},
    {"roomId":"75700000-0000-4000-8000-0000000000c3","quantity":180},
    {"roomId":"75700000-0000-4000-8000-0000000000c4","quantity":210}
  ]'::jsonb);
  ASSERT (v_placed->>'wasteQuantity')::int = 83,
    format('fixture: the floor is placed 830 of 913: %s', v_placed);

  PERFORM public.set_line_placements('75700000-0000-4000-8000-000000000202', '[
    {"roomId":"75700000-0000-4000-8000-0000000000c2","quantity":1},
    {"roomId":"75700000-0000-4000-8000-0000000000c3","quantity":1},
    {"roomId":"75700000-0000-4000-8000-0000000000c4","quantity":1}
  ]'::jsonb);
  PERFORM public.set_line_placements('75700000-0000-4000-8000-000000000203', '[
    {"roomId":"75700000-0000-4000-8000-0000000000c3","quantity":1},
    {"roomId":"75700000-0000-4000-8000-0000000000c4","quantity":2}
  ]'::jsonb);
  PERFORM public.set_line_placements('75700000-0000-4000-8000-000000000205', '[
    {"roomId":"75700000-0000-4000-8000-0000000000c2","quantity":2}
  ]'::jsonb);

  ASSERT (SELECT count(*) FROM project_ffe_placements
           WHERE project_id = '75700000-0000-4000-8000-000000000001') = 10,
    'fixture: 4 + 3 + 2 + 1 placements, none on the runner';
END $$;

-- The expected room × category figures, written out by hand.
--   floor   1,049,950 × {120, 320, 180, 210} / 830 → 151,800 · 404,800 ·
--           227,700 · 265,650 (exact: 1,049,950 / 830 = 1,265)
--   drapery 100,004 / 3 = 33,334.67 each; floors 100,002, 2 cents left, all
--           three remainders tie → Living Room and Dining take one each
--   sconces 10,000 × {1, 2} / 3 = 3,333.33 · 6,666.67; 1 cent left → Kitchen
--           (remainder 2/3) beats Dining (1/3, but first in order)
CREATE TEMP TABLE t51b_expected (room text, category text, cents integer,
                                 PRIMARY KEY (room, category)) ON COMMIT DROP;
INSERT INTO t51b_expected VALUES
  ('Hall',        'Flooring',          151800),
  ('Living Room', 'Flooring',          404800),
  ('Dining',      'Flooring',          227700),
  ('Kitchen',     'Flooring',          265650),
  ('Living Room', 'Window Treatments',  33335),
  ('Dining',      'Window Treatments',  33335),
  ('Kitchen',     'Window Treatments',  33334),
  ('Dining',      'Lighting',            3333),
  ('Kitchen',     'Lighting',            6667),
  ('Hall',        'Rugs',              120000),
  ('Living Room', 'Decor',              90000);

-- ─── D. derive ─────────────────────────────────────────────────────────────

DO $$
DECLARE
  v_budget jsonb;
  v_version uuid;
  v_got integer;
  v_bad text;
BEGIN
  PERFORM pg_temp.t51b_as('75700000-0000-4000-8000-0000000000a1');
  v_budget := public.derive_working_budget_draft('75700000-0000-4000-8000-000000000001');
  v_version := (v_budget->'version'->>'id')::uuid;
  PERFORM set_config('t51b.version', v_version::text, true);

  SELECT count(*) INTO v_got FROM project_budget_lines WHERE budget_version_id = v_version;
  ASSERT v_got = 11, format('D: one draft line per (room, category) slice, got %s', v_got);

  SELECT string_agg(format('%s · %s: want %s got %s', e.room, e.category, e.cents, l.target_cents), '; ')
    INTO v_bad
    FROM t51b_expected e
    LEFT JOIN project_budget_lines l
      ON l.budget_version_id = v_version AND l.room_name = e.room AND l.category = e.category
   WHERE l.target_cents IS DISTINCT FROM e.cents;
  ASSERT v_bad IS NULL, format('D: derived targets by share: %s', v_bad);

  SELECT sum(target_cents) INTO v_got FROM project_budget_lines
   WHERE budget_version_id = v_version AND category = 'Flooring';
  ASSERT v_got = 1049950, format('D: the four flooring targets sum to 1,049,950, got %s', v_got);

  RAISE NOTICE 'PASS D: derive mints the floor in four rooms by share, summing 1,049,950';
END $$;

-- ─── P. publish, read through the grid's RPC ───────────────────────────────

DO $$
DECLARE
  v_version uuid := current_setting('t51b.version')::uuid;
  v_budget jsonb;
  v_bad text;
  v_flooring bigint;
BEGIN
  PERFORM pg_temp.t51b_as('75700000-0000-4000-8000-0000000000a1');
  PERFORM public.publish_budget_checkpoint('75700000-0000-4000-8000-000000000001', v_version);
  v_budget := public.get_project_working_budget('75700000-0000-4000-8000-000000000001');
  ASSERT v_budget->'version'->>'status' = 'published', format('P: published: %s', v_budget->'version');

  SELECT string_agg(format('%s · %s: want %s got %s', e.room, e.category, e.cents,
                           line->>'scheduledCents'), '; ')
    INTO v_bad
    FROM t51b_expected e
    LEFT JOIN jsonb_array_elements(v_budget->'lines') line
      ON line->>'roomName' = e.room AND line->>'category' = e.category
   WHERE (line->>'scheduledCents')::integer IS DISTINCT FROM e.cents;
  ASSERT v_bad IS NULL, format('P: scheduledCents by share: %s', v_bad);

  SELECT sum((line->>'scheduledCents')::bigint) INTO v_flooring
    FROM jsonb_array_elements(v_budget->'lines') line
   WHERE line->>'category' = 'Flooring';
  ASSERT v_flooring = 1049950,
    format('P: the four room × flooring scheduled amounts sum to exactly 1,049,950, got %s', v_flooring);

  ASSERT (SELECT (line->>'scheduledCents')::integer FROM jsonb_array_elements(v_budget->'lines') line
           WHERE line->>'roomName' = 'Hall' AND line->>'category' = 'Flooring') = 151800,
    'P: Hall × flooring is its 120/830 share, not the whole $10,499.50';

  RAISE NOTICE 'PASS P: Hall 151,800 · Living Room 404,800 · Dining 227,700 · Kitchen 265,650 scheduled';
END $$;

-- ─── R. largest remainder ──────────────────────────────────────────────────

DO $$
DECLARE
  v_version uuid := current_setting('t51b.version')::uuid;
BEGIN
  ASSERT (SELECT array_agg(scheduled_cents ORDER BY sort_order)
            FROM project_budget_lines
           WHERE budget_version_id = v_version AND category = 'Window Treatments')
         = ARRAY[33335, 33335, 33334],
    'R: tied remainders go in placement order (Living Room, Dining, then Kitchen)';
  ASSERT (SELECT array_agg(scheduled_cents ORDER BY sort_order)
            FROM project_budget_lines
           WHERE budget_version_id = v_version AND category = 'Lighting')
         = ARRAY[3333, 6667],
    'R: the larger remainder (Kitchen, 2/3) takes the cent before placement order (Dining, 1/3)';
  RAISE NOTICE 'PASS R: cents by largest remainder, ties to placement order';
END $$;

-- ─── S. single-room lines are unchanged ────────────────────────────────────

DO $$
DECLARE
  v_version uuid := current_setting('t51b.version')::uuid;
BEGIN
  ASSERT (SELECT scheduled_cents FROM project_budget_lines
           WHERE budget_version_id = v_version AND room_name = 'Hall' AND category = 'Rugs') = 120000,
    'S: the runner (no placements) counts whole in the Hall';
  ASSERT (SELECT scheduled_cents FROM project_budget_lines
           WHERE budget_version_id = v_version AND room_name = 'Living Room' AND category = 'Decor') = 90000,
    'S: the console (one placement) counts whole in the Living Room';
  ASSERT NOT EXISTS (SELECT 1 FROM project_budget_lines
                      WHERE budget_version_id = v_version
                        AND category IN ('Rugs', 'Decor')
                        AND room_name NOT IN ('Hall', 'Living Room')),
    'S: a single-room line never reaches another room';
  RAISE NOTICE 'PASS S: single-room lines count whole in project_room_id';
END $$;

-- ─── T. the job total is unchanged ─────────────────────────────────────────

DO $$
DECLARE
  v_version uuid := current_setting('t51b.version')::uuid;
  v_whole bigint;
  v_target bigint;
  v_scheduled bigint;
  v_version_target integer;
BEGIN
  SELECT sum(line_total_cents) INTO v_whole FROM project_ffe_items
   WHERE project_id = '75700000-0000-4000-8000-000000000001';
  SELECT sum(target_cents), sum(scheduled_cents) INTO v_target, v_scheduled
    FROM project_budget_lines WHERE budget_version_id = v_version;
  SELECT target_total_cents INTO v_version_target
    FROM project_budget_versions WHERE id = v_version;

  ASSERT v_whole = 1369954, format('T: fixture lines sum to 1,369,954, got %s', v_whole);
  ASSERT v_target = v_whole, format('T: derived targets %s = whole lines %s', v_target, v_whole);
  ASSERT v_scheduled = v_whole, format('T: scheduled stamps %s = whole lines %s', v_scheduled, v_whole);
  ASSERT v_version_target = v_whole,
    format('T: version target total %s = whole lines %s', v_version_target, v_whole);
  RAISE NOTICE 'PASS T: the job total is unchanged at 1,369,954';
END $$;

ROLLBACK;
