-- Board asset-maintenance ledger, guarded dry-run schedule, and durable URL
-- unfurl quota regressions (00410). Run after a fresh reset:
--   psql 'postgresql://postgres:postgres@127.0.0.1:54322/postgres' \
--     -v ON_ERROR_STOP=1 \
--     -f supabase/tests/mood_boards/maintenance_quota_test.sql

BEGIN;

SET LOCAL statement_timeout = '20s';

CREATE OR REPLACE FUNCTION pg_temp.assume_mood_board_actor(
  p_actor uuid,
  p_role text DEFAULT 'authenticated'
)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM set_config(
    'request.jwt.claims',
    jsonb_strip_nulls(jsonb_build_object(
      'sub', p_actor,
      'role', p_role
    ))::text,
    true
  );
  PERFORM set_config(
    'request.jwt.claim.sub',
    COALESCE(p_actor::text, ''),
    true
  );
  PERFORM set_config('request.jwt.claim.role', p_role, true);
END;
$$;

DO $$
BEGIN
  ASSERT NOT has_table_privilege(
    'anon',
    'public.board_asset_gc_candidates',
    'SELECT'
  ) AND NOT has_table_privilege(
    'authenticated',
    'public.board_asset_gc_candidates',
    'SELECT'
  ), 'GC candidate ledger must be service-only';

  ASSERT NOT has_table_privilege(
    'anon',
    'public.board_unfurl_usage',
    'SELECT'
  ) AND NOT has_table_privilege(
    'authenticated',
    'public.board_unfurl_usage',
    'SELECT'
  ), 'raw unfurl usage must be service-only';

  -- 00511 narrows consume_board_unfurl_quota to service_role only (and its body
  -- RAISEs 'requires service_role' for any other caller). Its sole caller is the
  -- capture-from-url edge function, which runs as service_role — no authenticated
  -- portal path invokes it. authenticated EXECUTE was defense-in-depth surface
  -- with no user; the grant now matches the body guard.
  ASSERT NOT has_function_privilege(
    'authenticated',
    'public.consume_board_unfurl_quota(uuid)',
    'EXECUTE'
  ) AND has_function_privilege(
    'service_role',
    'public.consume_board_unfurl_quota(uuid)',
    'EXECUTE'
  ) AND NOT has_function_privilege(
    'anon',
    'public.consume_board_unfurl_quota(uuid)',
    'EXECUTE'
  ), 'quota RPC caller grants are incorrect';

  ASSERT has_function_privilege(
    'service_role',
    'public.dispatch_board_asset_gc(boolean)',
    'EXECUTE'
  ) AND NOT has_function_privilege(
    'authenticated',
    'public.dispatch_board_asset_gc(boolean)',
    'EXECUTE'
  ), 'GC dispatch must be service-only';

  ASSERT has_function_privilege(
    'service_role',
    'public.finish_board_asset_gc_run(bigint,text,jsonb,text)',
    'EXECUTE'
  ) AND NOT has_function_privilege(
    'authenticated',
    'public.finish_board_asset_gc_run(bigint,text,jsonb,text)',
    'EXECUTE'
  ), 'GC terminal job update must be service-only';

  ASSERT EXISTS (
    SELECT 1
    FROM cron.job
    WHERE jobname = 'board-asset-gc-dry-run'
      AND schedule = '17 4 * * *'
      AND command = 'SELECT public.dispatch_board_asset_gc(true);'
  ), 'daily board asset GC schedule must remain an explicit dry-run';
END;
$$;

-- 00511 makes consume_board_unfurl_quota service-role only (both the EXECUTE
-- grant and a current_setting('role') body gate) and requires an explicit
-- p_user_id — no auth.uid() fallback. Its sole caller is the capture-from-url
-- edge function, which runs as service_role and names the verified user. Drive
-- the quota mechanics that way: establish the database role at the top level
-- (as PostgREST would) rather than through the JWT-claims-only actor helper.

-- Rolling ten-minute window, as the service-role edge caller naming user …004.
SET LOCAL ROLE service_role;
DO $rolling$
DECLARE
  v_result jsonb;
  v_attempt integer;
  v_count integer;
BEGIN
  DELETE FROM public.board_unfurl_usage
  WHERE user_id IN (
    'a0000000-0000-0000-0000-000000000004',
    'a0000000-0000-0000-0000-000000000005'
  );

  FOR v_attempt IN 1..10 LOOP
    v_result := public.consume_board_unfurl_quota(
      'a0000000-0000-0000-0000-000000000004'
    );
    ASSERT (v_result->>'allowed')::boolean,
      format('rolling quota attempt %s should be accepted: %s', v_attempt, v_result);
  END LOOP;

  v_result := public.consume_board_unfurl_quota(
    'a0000000-0000-0000-0000-000000000004'
  );
  ASSERT NOT (v_result->>'allowed')::boolean
     AND v_result->>'reason' = 'ten_minute_limit'
     AND (v_result->>'retry_after_seconds')::integer > 0,
    format('11th rolling attempt must be denied with retry data: %s', v_result);

  SELECT count(*)::integer INTO v_count
  FROM public.board_unfurl_usage
  WHERE user_id = 'a0000000-0000-0000-0000-000000000004';
  ASSERT v_count = 10,
    'rejected rolling-window attempt must not consume a usage row';
END;
$rolling$;
RESET ROLE;

-- No authenticated caller may invoke the RPC at all now — the old per-user
-- impersonation guard is subsumed by the service-role gate (EXECUTE is revoked
-- from authenticated, so the call is refused before the body runs).
SET LOCAL ROLE authenticated;
DO $denied$
BEGIN
  BEGIN
    PERFORM public.consume_board_unfurl_quota(
      'a0000000-0000-0000-0000-000000000005'
    );
    RAISE EXCEPTION 'authenticated caller unexpectedly consumed quota';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
END;
$denied$;
RESET ROLE;

-- A service-role edge caller names the verified user, and the daily cap denies
-- the 101st event in a UTC day.
SET LOCAL ROLE service_role;
DO $service_and_daily$
DECLARE
  v_result jsonb;
  v_count integer;
  v_day_start timestamptz;
  v_elapsed interval;
BEGIN
  v_result := public.consume_board_unfurl_quota(
    'a0000000-0000-0000-0000-000000000005'
  );
  ASSERT (v_result->>'allowed')::boolean,
    'service role must be able to consume a named verified-user allowance';

  DELETE FROM public.board_unfurl_usage
  WHERE user_id IN (
    'a0000000-0000-0000-0000-000000000004',
    'a0000000-0000-0000-0000-000000000005'
  );

  v_day_start := (
    date_trunc('day', clock_timestamp() AT TIME ZONE 'UTC')
      AT TIME ZONE 'UTC'
  );
  v_elapsed := clock_timestamp() - v_day_start;

  INSERT INTO public.board_unfurl_usage(user_id, consumed_at)
  SELECT
    'a0000000-0000-0000-0000-000000000004',
    v_day_start
  FROM generate_series(1, 100);

  v_result := public.consume_board_unfurl_quota(
    'a0000000-0000-0000-0000-000000000004'
  );
  ASSERT NOT (v_result->>'allowed')::boolean,
    '100 accepted events in one UTC day must deny the next attempt';
  IF v_elapsed > interval '10 minutes' THEN
    ASSERT v_result->>'reason' = 'daily_limit',
      format('daily cap should be the active boundary: %s', v_result);
  ELSE
    -- During UTC's first ten minutes the same 100 rows necessarily also occupy
    -- the rolling window, whose branch intentionally takes precedence.
    ASSERT v_result->>'reason' = 'ten_minute_limit',
      format('midnight overlap should hit the rolling cap first: %s', v_result);
  END IF;

  SELECT count(*)::integer INTO v_count
  FROM public.board_unfurl_usage
  WHERE user_id = 'a0000000-0000-0000-0000-000000000004';
  ASSERT v_count = 100,
    'rejected daily-limit attempt must not consume a usage row';
END;
$service_and_daily$;
RESET ROLE;

INSERT INTO public.board_asset_gc_candidates(object_name)
VALUES (
  'b3900000-0000-4000-8000-000000000001/boards/c4101000-0000-4000-8000-000000000001/orphan.webp'
);

DO $$
DECLARE
  v_first timestamptz;
  v_eligible timestamptz;
  v_run_id bigint;
  v_status text;
BEGIN
  SELECT first_unreferenced_at, eligible_after
  INTO v_first, v_eligible
  FROM public.board_asset_gc_candidates
  WHERE object_name =
    'b3900000-0000-4000-8000-000000000001/boards/c4101000-0000-4000-8000-000000000001/orphan.webp';

  ASSERT v_eligible - v_first = interval '14 days',
    'new orphan candidates require an exact 14-day grace period';

  BEGIN
    UPDATE public.board_asset_gc_candidates
    SET eligible_after = first_unreferenced_at + interval '13 days'
    WHERE object_name =
      'b3900000-0000-4000-8000-000000000001/boards/c4101000-0000-4000-8000-000000000001/orphan.webp';
    RAISE EXCEPTION 'candidate unexpectedly shortened its 14-day grace';
  EXCEPTION WHEN check_violation THEN
    NULL;
  END;

  BEGIN
    UPDATE public.board_asset_gc_candidates
    SET deleted_at = now()
    WHERE object_name =
      'b3900000-0000-4000-8000-000000000001/boards/c4101000-0000-4000-8000-000000000001/orphan.webp';
    RAISE EXCEPTION 'candidate unexpectedly marked deleted before grace elapsed';
  EXCEPTION WHEN check_violation THEN
    NULL;
  END;

  UPDATE public.board_asset_gc_candidates
  SET first_unreferenced_at = now() - interval '15 days',
      eligible_after = now() - interval '1 day',
      deleted_at = now()
  WHERE object_name =
    'b3900000-0000-4000-8000-000000000001/boards/c4101000-0000-4000-8000-000000000001/orphan.webp';
  ASSERT FOUND, 'eligible second-pass candidate must accept a deletion stamp';

  INSERT INTO public.job_runs(job_name, status, detail)
  VALUES ('board-asset-gc', 'running', '{"dry_run":true}'::jsonb)
  RETURNING id INTO v_run_id;

  PERFORM public.finish_board_asset_gc_run(
    v_run_id,
    'succeeded',
    '{"scanned":1,"deleted":0}'::jsonb,
    NULL
  );

  SELECT status INTO v_status
  FROM public.job_runs
  WHERE id = v_run_id;
  ASSERT v_status = 'succeeded',
    'future cleanup worker must be able to close its job_runs row';
END;
$$;

ROLLBACK;
