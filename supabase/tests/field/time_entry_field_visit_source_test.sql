-- ═══════════════════════════════════════════════════════════════════════════
-- project_time_entries.source gains 'field_visit'
-- (the time-entry migration — 005NN_time_entry_field_visit_source.sql, §9.5)
--
-- V4 (the visit review) offers, on one tap, a COMPLETED time entry for the
-- visit she just closed. §9.6 and Flow 7 both say the same thing twice:
-- NEVER a running timer.
--
-- 1. THE OFFER LANDS   → source='field_visit', activity='site_visit',
--                        duration_minutes > 0 inserts cleanly.
-- 2. THE OLD THREE     → timer_auto / timer_manual / manual_entry still insert.
--    STILL WORK           A widening that narrowed something else is a
--                         regression, not a widening.
-- 3. GARBAGE STILL     → an unknown source still raises. The CHECK was
--    RAISES               replaced, not dropped.
-- 4. ACTIVITY UNTOUCHED→ 'site_visit' was already admitted (00198:27-29) and
--                        nothing here widened activity.
-- 5. NEVER A RUNNING   → uniq_project_time_entries_running_timer (00177:39-41)
--    TIMER                still bites: a second duration_minutes IS NULL row
--                         for one user raises 23505. That index belongs to the
--                         portal's TimerButton and V4 must never take its slot.
--
-- How to run:
--   scripts/run-sql-tests.sh -f time_entry_field_visit_source
-- and the FULL suite for the wave report (22 documented known failures).
--
-- 6. AS authenticated  → cases 1-5 run as the connecting superuser. Case 6
--                        switches role and proves the offer INSERTs, reads
--                        back and still fails a garbage source under the
--                        designer's own policies, and that another designer
--                        reads none of it.
--
-- ⚠ Cases 1-5 run as `postgres` (superuser) — RLS bypassed there. Nothing in
-- them, and nothing in case 6, is evidence about the four "Team can …"
-- policies or the studio-co-member set.
--
-- Transaction-wrapped + ROLLBACK.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, instance_id, aud, role)
VALUES ('fbc00000-0000-4000-8000-000000000001', 'fbc-designer@test.invalid', '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');

INSERT INTO profiles (id, email, full_name, created_at, updated_at)
VALUES ('fbc00000-0000-4000-8000-000000000001', 'fbc-designer@test.invalid', 'FBC Designer', NOW(), NOW())
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name;

INSERT INTO projects (id, name, designer_id, created_by)
VALUES ('fbc00000-0000-4000-8000-0000000000a1', 'FBC Maple St',
        'fbc00000-0000-4000-8000-000000000001', 'fbc00000-0000-4000-8000-000000000001');

DO $$
DECLARE
  v_row       RECORD;
  v_raised    BOOLEAN;
  v_activity  TEXT;
BEGIN
  -- 1 ---------------------------------------------------------------------
  INSERT INTO project_time_entries (
    id, project_id, user_id, started_at, duration_minutes,
    source, activity, billable, notes)
  VALUES (
    'fbc00000-0000-4000-8000-0000000000e1',
    'fbc00000-0000-4000-8000-0000000000a1',
    'fbc00000-0000-4000-8000-000000000001',
    NOW() - INTERVAL '130 minutes', 130,
    'field_visit', 'site_visit', true, 'Maple St · Living, Dining');

  SELECT * INTO v_row FROM project_time_entries
   WHERE id = 'fbc00000-0000-4000-8000-0000000000e1';
  ASSERT v_row.source = 'field_visit',
    'FAIL 1a: source must be field_visit, got ' || v_row.source;
  ASSERT v_row.activity = 'site_visit',
    'FAIL 1b: activity must be site_visit, got ' || COALESCE(v_row.activity, 'NULL');
  ASSERT v_row.duration_minutes = 130,
    'FAIL 1c: a field_visit entry is COMPLETED — duration_minutes must be set';

  -- 2 ---------------------------------------------------------------------
  INSERT INTO project_time_entries (project_id, user_id, duration_minutes, source)
  VALUES ('fbc00000-0000-4000-8000-0000000000a1', 'fbc00000-0000-4000-8000-000000000001', 15, 'timer_auto'),
         ('fbc00000-0000-4000-8000-0000000000a1', 'fbc00000-0000-4000-8000-000000000001', 15, 'timer_manual'),
         ('fbc00000-0000-4000-8000-0000000000a1', 'fbc00000-0000-4000-8000-000000000001', 15, 'manual_entry');

  -- 3 ---------------------------------------------------------------------
  v_raised := false;
  BEGIN
    INSERT INTO project_time_entries (project_id, user_id, duration_minutes, source)
    VALUES ('fbc00000-0000-4000-8000-0000000000a1', 'fbc00000-0000-4000-8000-000000000001', 15, 'field_note');
  EXCEPTION WHEN check_violation THEN
    v_raised := true;
  END;
  ASSERT v_raised,
    'FAIL 3: an unknown source no longer raises — the CHECK was dropped, not replaced';

  -- 4 ---------------------------------------------------------------------
  SELECT pg_get_constraintdef(oid) INTO v_activity
    FROM pg_constraint
   WHERE conrelid = 'public.project_time_entries'::regclass
     AND contype = 'c'
     AND pg_get_constraintdef(oid) LIKE '%site_visit%';
  ASSERT v_activity LIKE '%''design''%' AND v_activity LIKE '%''admin''%',
    'FAIL 4: the activity CHECK changed — this migration must not touch it: ' ||
    COALESCE(v_activity, 'NULL');

  -- 5 ---------------------------------------------------------------------
  ASSERT to_regclass('public.uniq_project_time_entries_running_timer') IS NOT NULL,
    'FAIL 5a: the one-running-timer-per-user index is gone';

  INSERT INTO project_time_entries (project_id, user_id, duration_minutes, source)
  VALUES ('fbc00000-0000-4000-8000-0000000000a1', 'fbc00000-0000-4000-8000-000000000001', NULL, 'timer_manual');

  v_raised := false;
  BEGIN
    INSERT INTO project_time_entries (project_id, user_id, duration_minutes, source)
    VALUES ('fbc00000-0000-4000-8000-0000000000a1', 'fbc00000-0000-4000-8000-000000000001', NULL, 'field_visit');
  EXCEPTION WHEN unique_violation THEN
    v_raised := true;
  END;
  ASSERT v_raised,
    'FAIL 5b: a second running timer inserted — V4 could steal the desk timer''s slot';

  RAISE NOTICE 'time_entry field_visit source: all 5 cases passed.';
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 6 — AS `authenticated`, not as the superuser the runner connects as.
--
-- Cases 1-5 run as `postgres`: RLS bypassed, table privileges never checked.
-- V4 writes this row from the phone as `authenticated` through PostgREST, so
-- "the offer lands" is only really proven under that role. Role-switching
-- idiom copied from supabase/tests/security/extension_execute_authenticated_test.sql.
--
--   6a  the designer INSERTs a completed field_visit entry on her own project
--       ("Designers manage their project time entries") and reads it back.
--   6b  the widened CHECK still bites under RLS — an unknown source raises.
--   6c  a different authenticated designer reads none of it.
-- ═══════════════════════════════════════════════════════════════════════════

INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, instance_id, aud, role)
VALUES ('fbc00000-0000-4000-8000-000000000002', 'fbc-outsider@test.invalid', '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');

INSERT INTO profiles (id, email, full_name, created_at, updated_at)
VALUES ('fbc00000-0000-4000-8000-000000000002', 'fbc-outsider@test.invalid', 'FBC Outsider', NOW(), NOW())
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name;

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

DO $$
DECLARE
  v_row     RECORD;
  v_raised  BOOLEAN := false;
  v_others  INTEGER;
BEGIN
  -- 6a ---------------------------------------------------------------------
  SET LOCAL ROLE authenticated;
  PERFORM pg_temp.assume_user('fbc00000-0000-4000-8000-000000000001');

  INSERT INTO project_time_entries (
    id, project_id, user_id, started_at, duration_minutes,
    source, activity, billable, notes)
  VALUES (
    'fbc00000-0000-4000-8000-0000000000e2',
    'fbc00000-0000-4000-8000-0000000000a1',
    'fbc00000-0000-4000-8000-000000000001',
    NOW() - INTERVAL '95 minutes', 95,
    'field_visit', 'site_visit', true, 'Maple St · punch walk');

  SELECT * INTO v_row FROM project_time_entries
   WHERE id = 'fbc00000-0000-4000-8000-0000000000e2';

  -- 6b ---------------------------------------------------------------------
  BEGIN
    INSERT INTO project_time_entries (project_id, user_id, duration_minutes, source)
    VALUES ('fbc00000-0000-4000-8000-0000000000a1', 'fbc00000-0000-4000-8000-000000000001', 20, 'field_note');
  EXCEPTION WHEN check_violation THEN
    v_raised := true;
  END;

  RESET ROLE;

  ASSERT v_row.id IS NOT NULL,
    'FAIL 6a1: the designer must be able to INSERT and read back a field_visit entry as authenticated';
  ASSERT v_row.source = 'field_visit' AND v_row.activity = 'site_visit',
    'FAIL 6a2: the field_visit / site_visit pair must survive the authenticated INSERT';
  ASSERT v_row.duration_minutes = 95,
    'FAIL 6a3: a field_visit entry is COMPLETED under RLS too';
  ASSERT v_raised,
    'FAIL 6b: an unknown source no longer raises as authenticated — the CHECK is not the gate it looks like';

  -- 6c ---------------------------------------------------------------------
  SET LOCAL ROLE authenticated;
  PERFORM pg_temp.assume_user('fbc00000-0000-4000-8000-000000000002');
  SELECT count(*) INTO v_others FROM project_time_entries
   WHERE id = 'fbc00000-0000-4000-8000-0000000000e2';
  RESET ROLE;

  ASSERT v_others = 0,
    'FAIL 6c: another designer read this project''s time entry — project_time_entries RLS is not per-project any more';

  RAISE NOTICE 'time_entry field_visit source: case 6 (authenticated) passed.';
END $$;

ROLLBACK;
