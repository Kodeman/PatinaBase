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
-- ⚠ Runs as `postgres` (superuser) — RLS bypassed. Nothing here is evidence
-- about the four "Team can …" policies or the studio-co-member set.
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

ROLLBACK;
