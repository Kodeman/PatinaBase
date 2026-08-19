-- ═══════════════════════════════════════════════════════════════════════════
-- project_ffe_items.assignment_scope derivation in shipped RPCs (00510)
--
-- 00434 added project_ffe_items.assignment_scope (DEFAULT 'unassigned') with
--   CHECK (assignment_scope IN ('room','throughout','unassigned')
--          AND ((assignment_scope = 'room') = (project_room_id IS NOT NULL)))
-- and, in guard_project_ffe_selection_integrity(), an auto-derivation:
--   NEW.assignment_scope := CASE WHEN NEW.project_room_id IS NULL
--                                THEN 'throughout' ELSE 'room' END;   (00434:472)
--
-- 00438 re-created that guard WITHOUT the derivation. Every writer now has to
-- set the column, and two shipped RPCs did not:
--   public.engage_trade_scope(uuid, jsonb)   00423 → 00475
--   public.apply_scope_change(uuid)          00084 → 00253 → 00395
-- Both insert project_ffe_items with a non-NULL project_room_id and no
-- assignment_scope, so a room-scoped section/amendment hard-failed with
-- 'non-room assignment cannot carry a room'. 00510 restores 00434's mapping
-- inside both bodies.
--
-- Sections (3) and (5) are the discriminators: each reconstructs the pre-00510
-- body from the live definition by removing exactly the two 00510 lines, and
-- proves the failure comes back. A suite that only ran the happy path would be
-- green against a body that set assignment_scope to any constant.
--
-- Run:
--   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -X -q \
--     -v ON_ERROR_STOP=1 \
--     -f supabase/tests/ffe/assignment_scope_rpc_derivation_test.sql
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

SET LOCAL statement_timeout = '60s';

-- ── Actors and project ────────────────────────────────────────────────────
INSERT INTO auth.users (
  id, email, encrypted_password, email_confirmed_at, created_at, updated_at,
  instance_id, aud, role
) VALUES
  ('52000000-0000-4000-8000-000000000001', 'as-designer@test.invalid', '', now(), now(), now(),
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('52000000-0000-4000-8000-000000000002', 'as-client@test.invalid', '', now(), now(), now(),
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');

INSERT INTO public.profiles (id, email, full_name, is_designer, created_at, updated_at)
VALUES
  ('52000000-0000-4000-8000-000000000001', 'as-designer@test.invalid', 'AS Designer', true, now(), now()),
  ('52000000-0000-4000-8000-000000000002', 'as-client@test.invalid', 'AS Client', false, now(), now())
ON CONFLICT (id) DO UPDATE
SET email = EXCLUDED.email,
    full_name = EXCLUDED.full_name,
    is_designer = EXCLUDED.is_designer;

INSERT INTO public.projects (
  id, name, designer_id, client_id, created_by, status,
  budget_cents, design_fee_cents, target_end_date
) VALUES (
  '52100000-0000-4000-8000-000000000001', 'Assignment scope project',
  '52000000-0000-4000-8000-000000000001',
  '52000000-0000-4000-8000-000000000002',
  '52000000-0000-4000-8000-000000000001', 'active',
  100000, 20000, DATE '2026-12-31'
);

INSERT INTO public.project_rooms (id, project_id, name, sort_order)
VALUES (
  '52200000-0000-4000-8000-000000000001',
  '52100000-0000-4000-8000-000000000001', 'Existing Study', 0
);

-- Two approved designer amendments. The first names a room (via roomName, which
-- apply_scope_change resolves to the room it mints in the same call); the
-- second names none, so it exercises the NULL-room branch of the derivation.
INSERT INTO public.scope_change_requests (
  id, project_id, requested_by, request_origin, title, description, status,
  sent_at, approved_at, additional_ffe_budget_cents, additional_design_fee_cents,
  timeline_impact_weeks, new_rooms, new_ffe_items
) VALUES
  ('52300000-0000-4000-8000-000000000001',
   '52100000-0000-4000-8000-000000000001',
   '52000000-0000-4000-8000-000000000001',
   'designer_amendment',
   'Room-scoped amendment', 'Adds a room and a line filed in it.',
   'approved', now(), now(), 500, 200, 1,
   '[{"name":"Reading Nook","roomType":"living","budgetCents":800,"ffeCategories":["lighting"]}]'::jsonb,
   '[{"roomName":"Reading Nook","name":"Floor Lamp","ffeCategory":"lighting","itemType":"allowance","quantity":2,"unitPriceCents":15000}]'::jsonb),
  ('52300000-0000-4000-8000-000000000002',
   '52100000-0000-4000-8000-000000000001',
   '52000000-0000-4000-8000-000000000001',
   'designer_amendment',
   'Project-wide amendment', 'Adds a line with no room.',
   'approved', now(), now(), 0, 0, 0,
   '[]'::jsonb,
   '[{"name":"Hallway runner","ffeCategory":"rugs","itemType":"allowance","quantity":1,"unitPriceCents":40000}]'::jsonb),
  -- Consumed only by the anti-vacuity section, inside a savepoint that is
  -- rolled back. Names an EXISTING room directly, so the reverted body has to
  -- take the room branch on its first item.
  ('52300000-0000-4000-8000-000000000003',
   '52100000-0000-4000-8000-000000000001',
   '52000000-0000-4000-8000-000000000001',
   'designer_amendment',
   'Anti-vacuity amendment', 'Room-scoped line for the reverted body.',
   'approved', now(), now(), 0, 0, 0,
   '[]'::jsonb,
   '[{"project_room_id":"52200000-0000-4000-8000-000000000001","name":"Reverted probe","ffeCategory":"Seating","itemType":"allowance","quantity":1,"unitPriceCents":1000}]'::jsonb);

CREATE OR REPLACE FUNCTION pg_temp.assume(p_actor uuid)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', p_actor::text, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', p_actor::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
END;
$$;

-- Builds the pre-00510 body of a function by deleting exactly the two lines
-- 00510 added. Both replacements must bite — if either anchor stops matching
-- the migration's text changed and the discriminator would silently become a
-- no-op, so this raises instead.
CREATE OR REPLACE FUNCTION pg_temp.revert_00510(
  p_signature text,
  p_column_anchor text,
  p_column_replacement text,
  p_value_anchor text,
  p_value_replacement text
)
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  v_def  text := pg_get_functiondef(p_signature::regprocedure);
  v_next text;
BEGIN
  v_next := replace(v_def, p_column_anchor, p_column_replacement);
  IF v_next = v_def THEN
    RAISE EXCEPTION 'anti-vacuity setup: column anchor did not match in %', p_signature;
  END IF;
  v_def := v_next;

  v_next := replace(v_def, p_value_anchor, p_value_replacement);
  IF v_next = v_def THEN
    RAISE EXCEPTION 'anti-vacuity setup: value anchor did not match in %', p_signature;
  END IF;

  -- Only the INSERT is reverted; the surrounding `-- 00510` prose comment stays,
  -- so a bare `assignment_scope` substring check would false-positive here.
  RETURN v_next;
END;
$$;

-- ── (1) The guard really does require the column ──────────────────────────
-- This is the statement shape both RPCs executed before 00510: a room-scoped
-- row that leaves assignment_scope at its 'unassigned' default.
DO $$
DECLARE
  v_err text;
BEGIN
  BEGIN
    INSERT INTO public.project_ffe_items (
      project_id, project_room_id, name, ffe_category, item_type, quantity,
      unit_price_cents, line_total_cents
    ) VALUES (
      '52100000-0000-4000-8000-000000000001',
      '52200000-0000-4000-8000-000000000001',
      'Unscoped probe', 'Seating', 'fixed', 1, 1000, 1000
    );
    ASSERT false, 'a room-scoped insert that omits assignment_scope must be rejected';
  EXCEPTION WHEN check_violation THEN
    v_err := SQLERRM;
  END;
  ASSERT v_err = 'non-room assignment cannot carry a room',
    format('unexpected guard message: %L', v_err);
END $$;

-- ── (2) apply_scope_change files a room-scoped amendment ──────────────────
DO $$
DECLARE
  v_room uuid;
  v_item public.project_ffe_items%ROWTYPE;
BEGIN
  PERFORM pg_temp.assume('52000000-0000-4000-8000-000000000001');
  PERFORM public.apply_scope_change('52300000-0000-4000-8000-000000000001');

  SELECT id INTO v_room FROM public.project_rooms
  WHERE project_id = '52100000-0000-4000-8000-000000000001' AND name = 'Reading Nook';
  ASSERT v_room IS NOT NULL, 'the amendment must have minted its room';

  SELECT * INTO v_item FROM public.project_ffe_items
  WHERE project_id = '52100000-0000-4000-8000-000000000001' AND name = 'Floor Lamp';
  ASSERT FOUND, 'the amendment must have minted its FF&E line';
  ASSERT v_item.project_room_id = v_room,
    'the roomName item must link to the newly inserted room';
  ASSERT v_item.assignment_scope = 'room',
    format('a room-linked amendment line must be filed room, got %L', v_item.assignment_scope);
END $$;

-- ── (3) ANTI-VACUITY for apply_scope_change ───────────────────────────────
SAVEPOINT pre_00510_apply;

DO $$
DECLARE
  v_reverted text;
  v_err      text;
BEGIN
  v_reverted := pg_temp.revert_00510(
    'public.apply_scope_change(uuid)',
    E'      notes,\n      assignment_scope\n    ) VALUES (',
    E'      notes\n    ) VALUES (',
    E'      v_new_item->>''notes'',\n      CASE WHEN v_project_room_id IS NOT NULL THEN ''room'' ELSE ''throughout'' END\n    );',
    E'      v_new_item->>''notes''\n    );'
  );
  EXECUTE v_reverted;

  PERFORM pg_temp.assume('52000000-0000-4000-8000-000000000001');
  BEGIN
    PERFORM public.apply_scope_change('52300000-0000-4000-8000-000000000003');
    ASSERT false,
      'the pre-00510 apply_scope_change body must fail on a room-scoped amendment';
  EXCEPTION WHEN check_violation THEN
    v_err := SQLERRM;
  END;
  ASSERT v_err = 'non-room assignment cannot carry a room',
    format('pre-00510 apply_scope_change failure message: %L', v_err);
END $$;

ROLLBACK TO SAVEPOINT pre_00510_apply;

-- ── (4) apply_scope_change files a room-less amendment 'throughout' ───────
DO $$
DECLARE
  v_item public.project_ffe_items%ROWTYPE;
BEGIN
  PERFORM pg_temp.assume('52000000-0000-4000-8000-000000000001');
  PERFORM public.apply_scope_change('52300000-0000-4000-8000-000000000002');

  SELECT * INTO v_item FROM public.project_ffe_items
  WHERE project_id = '52100000-0000-4000-8000-000000000001' AND name = 'Hallway runner';
  ASSERT FOUND, 'the room-less amendment must have minted its line';
  ASSERT v_item.project_room_id IS NULL, 'the room-less line must carry no room';
  ASSERT v_item.assignment_scope = 'throughout',
    format('a room-less amendment line must be filed throughout (00434:472), got %L',
           v_item.assignment_scope);
END $$;

-- ── (5) ANTI-VACUITY for engage_trade_scope ───────────────────────────────
-- The full engagement ceremony (executed scope + paid deposit) is exercised by
-- supabase/tests/commercial/trade_scope_test.sql section (6); here we only pin
-- that the 00510 delta is present verbatim and load-bearing — the reverted
-- body's INSERT is the shape section (1) just proved the guard rejects.
DO $$
DECLARE
  v_def      text := pg_get_functiondef('public.engage_trade_scope(uuid,jsonb)'::regprocedure);
  v_reverted text;
BEGIN
  ASSERT position(
    E'      trade_scope_document_id,\n      assignment_scope\n    ) VALUES (' IN v_def) <> 0,
    'engage_trade_scope must name assignment_scope in its project_ffe_items column list';
  ASSERT position(
    E'      CASE WHEN v_section.project_room_id IS NOT NULL THEN ''room'' ELSE ''throughout'' END' IN v_def) <> 0,
    'engage_trade_scope must carry the 00434:472 derivation verbatim';

  -- Proves both anchors bite and that removing them leaves a body with no
  -- mention of the column at all.
  v_reverted := pg_temp.revert_00510(
    'public.engage_trade_scope(uuid,jsonb)',
    E'      trade_scope_document_id,\n      assignment_scope\n    ) VALUES (',
    E'      trade_scope_document_id\n    ) VALUES (',
    E'      v_document.id,\n      CASE WHEN v_section.project_room_id IS NOT NULL THEN ''room'' ELSE ''throughout'' END\n    );',
    E'      v_document.id\n    );'
  );
  ASSERT v_reverted <> v_def, 'the revert must have changed the body';
END $$;

-- ── (6) Both RPCs keep their authorization posture ────────────────────────
DO $$
BEGIN
  ASSERT has_function_privilege('authenticated', 'public.engage_trade_scope(uuid,jsonb)', 'EXECUTE'),
    'authenticated must keep EXECUTE on engage_trade_scope';
  ASSERT NOT has_function_privilege('anon', 'public.engage_trade_scope(uuid,jsonb)', 'EXECUTE'),
    'anon must not hold EXECUTE on engage_trade_scope';
  ASSERT has_function_privilege('authenticated', 'public.apply_scope_change(uuid)', 'EXECUTE'),
    'authenticated must keep EXECUTE on apply_scope_change';
  ASSERT NOT has_function_privilege('anon', 'public.apply_scope_change(uuid)', 'EXECUTE'),
    'anon must not hold EXECUTE on apply_scope_change';
END $$;

ROLLBACK;
