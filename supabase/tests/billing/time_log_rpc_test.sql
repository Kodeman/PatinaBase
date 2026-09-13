-- ═══════════════════════════════════════════════════════════════════════════
-- log_time + start_timer — the two capture doors (migration 00608, W3)
--
-- Covers, in the plan's own words (plan-v2 §4 "Tests to write"):
--   (a) a replayed log_time inserts ONCE and returns the existing row — the
--       offline-drain case (W6). A NULL back would read as a failed write and
--       the queue would try forever.
--   (b) start_timer leaves EXACTLY ONE running row and the caller whose slot
--       was taken gets the stopped row back, so the log-offer strip can still
--       be raised for the hour it chained out (R20/§0.22).
--   (c) p_billable = NULL raises on BOTH doors (HT-11 — once every surface
--       carries the control, a missing value is a caught bug, not `?? true`).
--   (d) HT-13's bound: a backdated started_at is accepted freely, and the
--       moment the entry is INVOICED guard_invoiced_time_entry (00177:51-84)
--       refuses to move it. "Any date, until the entry is invoiced."
--   (e) log_time never opens a running slot (§0.11): a NULL or non-positive
--       duration raises rather than taking the desk's one clock.
--
-- Sequential, not threaded: two psql sessions cannot be driven from one
-- script, so (b) asserts the door's OWN contract — call it twice in a row and
-- the second call stops the first call's row, returns it, and leaves one
-- running hour. The true-concurrency arm is the partial unique index
-- (00177:37-41), which 00608's retry loop closes over.
--
-- How to run:
--   psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 \
--     -f supabase/tests/billing/time_log_rpc_test.sql
--
-- Transaction-wrapped + ROLLBACK — rerunnable, no side effects.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─── fixtures ──────────────────────────────────────────────────────────────
INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, instance_id, aud, role)
VALUES
  ('a7200000-0000-4000-8000-000000000001', 'logtime-designer@test.invalid', '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('a7200000-0000-4000-8000-000000000002', 'logtime-client@test.invalid',   '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');

INSERT INTO profiles (id, email, full_name, is_designer, created_at, updated_at)
VALUES
  ('a7200000-0000-4000-8000-000000000001', 'logtime-designer@test.invalid', 'Log Designer', true,  NOW(), NOW()),
  ('a7200000-0000-4000-8000-000000000002', 'logtime-client@test.invalid',   'Log Client',   false, NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

INSERT INTO projects (id, name, designer_id, created_by, client_id)
VALUES
  ('a7200000-0000-4000-8000-0000000000e1', 'Log House',
   'a7200000-0000-4000-8000-000000000001', 'a7200000-0000-4000-8000-000000000001',
   'a7200000-0000-4000-8000-000000000002'),
  ('a7200000-0000-4000-8000-0000000000e2', 'Log Cottage',
   'a7200000-0000-4000-8000-000000000001', 'a7200000-0000-4000-8000-000000000001',
   'a7200000-0000-4000-8000-000000000002');

INSERT INTO invoices (id, project_id, designer_id, client_id, status, currency, memo)
VALUES ('a7200000-0000-4000-8000-0000000000a1', 'a7200000-0000-4000-8000-0000000000e1',
        'a7200000-0000-4000-8000-000000000001', 'a7200000-0000-4000-8000-000000000002',
        'draft', 'USD', 'Backdating bound');

-- ─── helpers ───────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION pg_temp.assume_user(p_user_id UUID)
RETURNS VOID AS $$
BEGIN
  PERFORM set_config('role', 'authenticated', true);
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', p_user_id::text, 'role', 'authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION pg_temp.assume_user(UUID) TO PUBLIC;

CREATE OR REPLACE FUNCTION pg_temp.reset_role()
RETURNS VOID AS $$
BEGIN
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claims', NULL, true);
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION pg_temp.reset_role() TO PUBLIC;

-- ─── (a) a replay inserts once and reads back the row it wrote ─────────────
DO $$
DECLARE
  v_first  public.project_time_entries;
  v_second public.project_time_entries;
  v_rows   INTEGER;
BEGIN
  PERFORM pg_temp.assume_user('a7200000-0000-4000-8000-000000000001');

  v_first := public.log_time(
    'a7200000-0000-4000-8000-0000000000b1',
    'a7200000-0000-4000-8000-0000000000e1',
    NOW() - INTERVAL '2 days', 45,
    'client', true, NULL, NULL, NULL, 'command_bar');

  -- The same id, a DIFFERENT payload: the drain replaying what it already sent.
  v_second := public.log_time(
    'a7200000-0000-4000-8000-0000000000b1',
    'a7200000-0000-4000-8000-0000000000e1',
    NOW(), 999,
    'design', false, NULL, NULL, NULL, 'field_manual');

  PERFORM pg_temp.reset_role();

  SELECT count(*) INTO v_rows FROM project_time_entries
   WHERE id = 'a7200000-0000-4000-8000-0000000000b1';

  ASSERT v_rows = 1,
    'FAIL a1: a replayed log_time must insert exactly once, found ' || v_rows;
  ASSERT v_second.id = v_first.id,
    'FAIL a2: the replay must return the existing row, not NULL';
  ASSERT v_second.duration_minutes = 45,
    'FAIL a3: the replay must not overwrite the stored hour, got '
      || COALESCE(v_second.duration_minutes::text, 'NULL');
  ASSERT v_second.source = 'command_bar',
    'FAIL a4: the stored source must survive a replay, got ' || COALESCE(v_second.source, 'NULL');

  RAISE NOTICE 'time_log_rpc: case (a) passed.';
END
$$;

-- ─── (b) one running row, and the loser gets the stopped row back ──────────
DO $$
DECLARE
  v_call           record;
  v_first_started  uuid;
  v_second_started uuid;
  v_second_stopped public.project_time_entries;
  v_running        INTEGER;
BEGIN
  PERFORM pg_temp.assume_user('a7200000-0000-4000-8000-000000000001');

  SELECT * INTO v_call
  FROM public.start_timer('a7200000-0000-4000-8000-0000000000e1', 'timer_auto', false);
  v_first_started := (v_call.started).id;

  SELECT * INTO v_call
  FROM public.start_timer('a7200000-0000-4000-8000-0000000000e2', 'timer_auto', true);
  v_second_started := (v_call.started).id;
  v_second_stopped := v_call.stopped;

  PERFORM pg_temp.reset_role();

  SELECT count(*) INTO v_running FROM project_time_entries
   WHERE user_id = 'a7200000-0000-4000-8000-000000000001'
     AND duration_minutes IS NULL;

  ASSERT v_running = 1,
    'FAIL b1: exactly one running row may survive two starts, found ' || v_running;
  ASSERT v_second_stopped.id = v_first_started,
    'FAIL b2: the second start must return the row it chained out, so the strip can still be raised';
  ASSERT v_second_stopped.duration_minutes IS NOT NULL,
    'FAIL b3: the chained-out row must actually be stopped';
  ASSERT (SELECT duration_minutes IS NULL FROM project_time_entries WHERE id = v_second_started),
    'FAIL b4: the new slot must be the running one';
  ASSERT (SELECT billable FROM project_time_entries WHERE id = v_second_started),
    'FAIL b5: start_timer must record the billable intent it was handed';

  -- Leave nothing running for the cases below.
  UPDATE project_time_entries SET duration_minutes = 5 WHERE id = v_second_started;

  RAISE NOTICE 'time_log_rpc: case (b) passed.';
END
$$;

-- ─── (c) a missing billable is a caught bug on BOTH doors (HT-11) ──────────
DO $$
DECLARE
  v_log_raised   BOOLEAN := false;
  v_timer_raised BOOLEAN := false;
BEGIN
  PERFORM pg_temp.assume_user('a7200000-0000-4000-8000-000000000001');

  BEGIN
    PERFORM public.log_time(
      'a7200000-0000-4000-8000-0000000000b9',
      'a7200000-0000-4000-8000-0000000000e1',
      NOW(), 30);
  EXCEPTION WHEN OTHERS THEN
    v_log_raised := true;
  END;

  BEGIN
    PERFORM public.start_timer('a7200000-0000-4000-8000-0000000000e1');
  EXCEPTION WHEN OTHERS THEN
    v_timer_raised := true;
  END;

  PERFORM pg_temp.reset_role();

  ASSERT v_log_raised,  'FAIL c1: log_time must raise when billable is not stated (HT-11)';
  ASSERT v_timer_raised,'FAIL c2: start_timer must raise when billable is not stated (HT-11)';
  ASSERT NOT EXISTS (SELECT 1 FROM project_time_entries
                      WHERE id = 'a7200000-0000-4000-8000-0000000000b9'),
    'FAIL c3: a refused log_time must write nothing';

  RAISE NOTICE 'time_log_rpc: case (c) passed.';
END
$$;

-- ─── (d) HT-13 — any date, until the entry is invoiced ─────────────────────
DO $$
DECLARE
  v_old     public.project_time_entries;
  v_raised  BOOLEAN := false;
BEGIN
  PERFORM pg_temp.assume_user('a7200000-0000-4000-8000-000000000001');

  -- Any date. 400 days back is accepted with no bound and no warning: the
  -- ruling puts the only limit on the INVOICED side.
  v_old := public.log_time(
    'a7200000-0000-4000-8000-0000000000c1',
    'a7200000-0000-4000-8000-0000000000e1',
    NOW() - INTERVAL '400 days', 60,
    'design', true, NULL, NULL, NULL, 'command_bar');

  PERFORM pg_temp.reset_role();

  ASSERT v_old.started_at < NOW() - INTERVAL '399 days',
    'FAIL d1: a backdated hour must land on the date it names';
  ASSERT v_old.created_at - v_old.started_at > INTERVAL '30 days',
    'FAIL d2: the derived "backdated" mark reads created_at - started_at; the fixture must exceed 30 days';

  -- Now bill it, and the guard freezes the date.
  UPDATE project_time_entries
     SET invoice_id = 'a7200000-0000-4000-8000-0000000000a1'
   WHERE id = 'a7200000-0000-4000-8000-0000000000c1';

  BEGIN
    UPDATE project_time_entries
       SET started_at = NOW() - INTERVAL '3 days'
     WHERE id = 'a7200000-0000-4000-8000-0000000000c1';
  EXCEPTION WHEN OTHERS THEN
    v_raised := true;
  END;

  ASSERT v_raised,
    'FAIL d3: guard_invoiced_time_entry must refuse to re-date an invoiced hour (00177:51-84) — this is the whole of HT-13''s bound';

  RAISE NOTICE 'time_log_rpc: case (d) passed.';
END
$$;

-- ─── (e) log_time never takes the desk's one clock (§0.11) ─────────────────
DO $$
DECLARE
  v_null_raised BOOLEAN := false;
  v_zero_raised BOOLEAN := false;
BEGIN
  PERFORM pg_temp.assume_user('a7200000-0000-4000-8000-000000000001');

  BEGIN
    PERFORM public.log_time(
      'a7200000-0000-4000-8000-0000000000d1',
      'a7200000-0000-4000-8000-0000000000e1',
      NOW(), NULL, 'design', true);
  EXCEPTION WHEN OTHERS THEN
    v_null_raised := true;
  END;

  BEGIN
    PERFORM public.log_time(
      'a7200000-0000-4000-8000-0000000000d2',
      'a7200000-0000-4000-8000-0000000000e1',
      NOW(), 0, 'design', true);
  EXCEPTION WHEN OTHERS THEN
    v_zero_raised := true;
  END;

  PERFORM pg_temp.reset_role();

  ASSERT v_null_raised, 'FAIL e1: log_time must refuse a NULL duration — that is a running slot';
  ASSERT v_zero_raised, 'FAIL e2: log_time must refuse a non-positive duration';
  ASSERT NOT EXISTS (
    SELECT 1 FROM project_time_entries
     WHERE user_id = 'a7200000-0000-4000-8000-000000000001'
       AND duration_minutes IS NULL),
    'FAIL e3: no running row may survive this file';

  RAISE NOTICE 'time_log_rpc: case (e) passed.';
  RAISE NOTICE 'All time_log_rpc assertions passed.';
END
$$;

ROLLBACK;
