-- ═══════════════════════════════════════════════════════════════════════════
-- project_time_entries.activity gains 'travel' (00616 — HT-19, plan-v2 §7/W6)
--
-- The drive between two houses is an hour of the studio's day and had no name
-- before 00616. This proves the widening is a widening: the new value lands,
-- the five 00198 values still land, garbage still raises, NULL is still
-- "activity not set", and the constraint that does it is the NAMED one — so
-- the next widening is a one-line edit rather than another archaeology dig.
--
-- 1. TRAVEL LANDS      → activity='travel' with source='field_manual'
--                        (Patina Field's LogTimeSheet) inserts cleanly.
-- 2. THE OLD FIVE      → design / sourcing / client / site_visit / admin still
--    STILL WORK           insert. A widening that narrowed something else is a
--                         regression.
-- 3. GARBAGE RAISES    → an unknown activity still raises check_violation. The
--                        CHECK was replaced, not dropped.
-- 4. NULL IS LEGAL     → HT-24's honest "activity not set" survives.
-- 5. THE NAME          → the constraint is project_time_entries_activity_ck,
--                        keyed on `activity`, and it is the ONLY CHECK on that
--                        column — a surviving 00198-era twin would still be
--                        rejecting 'travel'.
-- 6. AS authenticated  → cases 1-5 run as the connecting superuser (RLS
--                        bypassed). Case 6 switches role and proves the field
--                        worker's own travel row inserts and reads back under
--                        her own policies.
--
-- How to run:
--   scripts/run-sql-tests.sh -d supabase/tests/field
--
-- Transaction-wrapped + ROLLBACK.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, instance_id, aud, role)
VALUES ('fac00000-0000-4000-8000-000000000001', 'fac-designer@test.invalid', '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');

INSERT INTO profiles (id, email, full_name, created_at, updated_at)
VALUES ('fac00000-0000-4000-8000-000000000001', 'fac-designer@test.invalid', 'FAC Designer', NOW(), NOW())
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name;

INSERT INTO projects (id, name, designer_id, created_by)
VALUES ('fac00000-0000-4000-8000-0000000000a1', 'FAC Maple St',
        'fac00000-0000-4000-8000-000000000001', 'fac00000-0000-4000-8000-000000000001');

DO $$
DECLARE
  v_row      RECORD;
  v_raised   BOOLEAN := false;
  v_def      TEXT;
  v_count    INTEGER;
  v_activity TEXT;
BEGIN
  -- 1 ---------------------------------------------------------------------
  INSERT INTO project_time_entries (
    id, project_id, user_id, started_at, duration_minutes,
    source, activity, billable, notes)
  VALUES (
    'fac00000-0000-4000-8000-0000000000e1',
    'fac00000-0000-4000-8000-0000000000a1',
    'fac00000-0000-4000-8000-000000000001',
    NOW() - INTERVAL '40 minutes', 40,
    'field_manual', 'travel', true, 'Maple St → High Point');

  SELECT * INTO v_row FROM project_time_entries
   WHERE id = 'fac00000-0000-4000-8000-0000000000e1';

  ASSERT v_row.activity = 'travel',
    'FAIL 1: activity=''travel'' did not land — 00616 did not widen the CHECK';
  ASSERT v_row.source = 'field_manual',
    'FAIL 1b: source=''field_manual'' did not land — 00595 bought that value';

  -- 2 ---------------------------------------------------------------------
  FOREACH v_activity IN ARRAY ARRAY['design','sourcing','client','site_visit','admin']
  LOOP
    INSERT INTO project_time_entries (
      project_id, user_id, started_at, duration_minutes, source, activity, billable)
    VALUES (
      'fac00000-0000-4000-8000-0000000000a1',
      'fac00000-0000-4000-8000-000000000001',
      NOW() - INTERVAL '3 hours', 15, 'manual_entry', v_activity, true);
  END LOOP;

  SELECT count(*) INTO v_count FROM project_time_entries
   WHERE project_id = 'fac00000-0000-4000-8000-0000000000a1'
     AND activity IN ('design','sourcing','client','site_visit','admin');
  ASSERT v_count = 5,
    'FAIL 2: the five 00198 activity values no longer all insert — the widening narrowed something';

  -- 3 ---------------------------------------------------------------------
  BEGIN
    INSERT INTO project_time_entries (
      project_id, user_id, duration_minutes, source, activity, billable)
    VALUES ('fac00000-0000-4000-8000-0000000000a1',
            'fac00000-0000-4000-8000-000000000001', 20, 'manual_entry', 'driving', true);
  EXCEPTION WHEN check_violation THEN
    v_raised := true;
  END;
  ASSERT v_raised,
    'FAIL 3: an unknown activity no longer raises — the CHECK was dropped, not replaced';

  -- 4 ---------------------------------------------------------------------
  INSERT INTO project_time_entries (
    id, project_id, user_id, duration_minutes, source, activity, billable)
  VALUES ('fac00000-0000-4000-8000-0000000000e4',
          'fac00000-0000-4000-8000-0000000000a1',
          'fac00000-0000-4000-8000-000000000001', 25, 'manual_entry', NULL, true);

  SELECT * INTO v_row FROM project_time_entries
   WHERE id = 'fac00000-0000-4000-8000-0000000000e4';
  ASSERT v_row.activity IS NULL,
    'FAIL 4: a NULL activity no longer survives — HT-24''s "activity not set" is no longer expressible';

  -- 5 ---------------------------------------------------------------------
  SELECT pg_get_constraintdef(oid) INTO v_def
    FROM pg_constraint
   WHERE conrelid = 'public.project_time_entries'::regclass
     AND contype = 'c'
     AND conname = 'project_time_entries_activity_ck'
     AND conkey = ARRAY[(
       SELECT attnum FROM pg_attribute
        WHERE attrelid = 'public.project_time_entries'::regclass
          AND attname = 'activity')];
  ASSERT v_def IS NOT NULL,
    'FAIL 5a: project_time_entries_activity_ck is missing or is not keyed on the activity column';

  SELECT count(*) INTO v_count
    FROM pg_constraint
   WHERE conrelid = 'public.project_time_entries'::regclass
     AND contype = 'c'
     AND conkey = ARRAY[(
       SELECT attnum FROM pg_attribute
        WHERE attrelid = 'public.project_time_entries'::regclass
          AND attname = 'activity')];
  ASSERT v_count = 1,
    'FAIL 5b: more than one CHECK is keyed on activity — a 00198-era twin survived and still rejects travel';

  RAISE NOTICE 'time_entry activity travel: cases 1-5 passed.';
END $$;

CREATE OR REPLACE FUNCTION pg_temp.assume_user(
  p_user_id uuid,
  p_role text DEFAULT 'authenticated'
)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', p_user_id, 'role', p_role)::text,
    true
  );
END;
$$;
GRANT EXECUTE ON FUNCTION pg_temp.assume_user(uuid, text) TO PUBLIC;

-- 6 -------------------------------------------------------------------------
DO $$
DECLARE
  v_row RECORD;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM pg_temp.assume_user('fac00000-0000-4000-8000-000000000001');

  INSERT INTO project_time_entries (
    id, project_id, user_id, started_at, duration_minutes,
    source, activity, billable, notes)
  VALUES (
    'fac00000-0000-4000-8000-0000000000e6',
    'fac00000-0000-4000-8000-0000000000a1',
    'fac00000-0000-4000-8000-000000000001',
    NOW() - INTERVAL '35 minutes', 35,
    'field_manual', 'travel', true, 'Drive to the site');

  SELECT * INTO v_row FROM project_time_entries
   WHERE id = 'fac00000-0000-4000-8000-0000000000e6';

  RESET ROLE;

  ASSERT v_row.id IS NOT NULL,
    'FAIL 6a: the field worker could not INSERT and read back a travel entry as authenticated';
  ASSERT v_row.activity = 'travel' AND v_row.source = 'field_manual',
    'FAIL 6b: the travel / field_manual pair did not survive the authenticated INSERT';
  ASSERT v_row.duration_minutes = 35,
    'FAIL 6c: a Field-written travel entry is COMPLETED under RLS too';

  RAISE NOTICE 'time_entry activity travel: case 6 (authenticated) passed.';
END $$;

ROLLBACK;
