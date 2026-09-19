-- The field-daily cron registry after 00648. LOCAL ONLY, read-only, and never
-- pointed at production. Nothing here writes a row: it asserts what the
-- migrations left in cron.job.
--
--   psql "postgresql://postgres:postgres@127.0.0.1:54322/<disposable>" -X \
--     -v ON_ERROR_STOP=1 -f supabase/tests/field/field_daily_schedule_test.sql
--
-- What is proved: exactly two jobs invoke field-daily and they are the two
-- 00648 names; each one's expression is the documented one; both invoke the
-- SAME function with the SAME payload; and each expression lands where the
-- gates in field-daily/core.ts need it to — past the site card's 17:00 local
-- floor for the evening job, past the ask's 07:30 for the morning one, and
-- inside 08:00-20:00 quiet hours for both — in BOTH daylight-saving states of
-- the rail's zone. That last part is what a fixed UTC hour has to earn.
--
-- THE ZONE IS NOT THE MIGRATION'S. FIELD_TZ (read by the edge function) is the
-- one source of the zone; 00648 names none and does no zone arithmetic. This
-- test needs a zone to check that arithmetic against, so it takes one as a
-- psql variable defaulting to the deployed FIELD_TZ. Override it the day
-- FIELD_TZ changes:  -v field_tz=America/Denver
--
-- ─── Running this on a disposable clone ────────────────────────────────────
-- pg_cron is database-scoped: CREATE EXTENSION pg_cron fails on any database
-- other than the one named in cron.database_name ("can only create extension
-- in database postgres"), so a clone made with TEMPLATE template0 cannot have
-- the real extension. There is no earlier cron shim in supabase/tests/ to copy
-- — every existing cron assertion (supabase/tests/agent_os/vitals_test.sql:198,
-- supabase/tests/aesthete/house_portfolio_test.sql:617,
-- supabase/tests/billing/invoice_links_test.sql:364) reads cron.job on the
-- migrated stack itself. So the clone gets this TEST DOUBLE, installed BEFORE
-- the migrations are replayed. It is all of pg_cron's surface the three
-- field-daily migrations touch: cron.schedule upserts on the job name, and
-- cron.unschedule raises on a name it does not know — the error 00284, 00432
-- and 00648 each swallow in a DO block so their schedule blocks re-run.
--
--   CREATE SCHEMA cron;
--   CREATE TABLE cron.job (jobid bigserial PRIMARY KEY, schedule text NOT NULL,
--     command text NOT NULL, nodename text NOT NULL DEFAULT 'localhost',
--     nodeport int NOT NULL DEFAULT 5432,
--     database text NOT NULL DEFAULT current_database(),
--     username text NOT NULL DEFAULT current_user,
--     active boolean NOT NULL DEFAULT true, jobname text UNIQUE);
--   CREATE FUNCTION cron.schedule(job_name text, schedule text, command text)
--   RETURNS bigint LANGUAGE sql AS $f$
--     INSERT INTO cron.job (jobname, schedule, command) VALUES ($1, $2, $3)
--     ON CONFLICT (jobname) DO UPDATE SET schedule = excluded.schedule,
--       command = excluded.command, active = true
--     RETURNING jobid $f$;
--   CREATE FUNCTION cron.unschedule(job_name text)
--   RETURNS boolean LANGUAGE plpgsql AS $f$
--     DECLARE n int;
--     BEGIN
--       DELETE FROM cron.job WHERE jobname = $1;
--       GET DIAGNOSTICS n = ROW_COUNT;
--       IF n = 0 THEN
--         RAISE EXCEPTION 'could not find valid entry for job "%"', $1;
--       END IF;
--       RETURN true;
--     END $f$;
--
-- On a database that has the real pg_cron (the local stack's `postgres`, or
-- Strata once the Phase 1 activation ticket pushes 00648) install nothing and
-- run the file as it stands: every assertion below is a plain read of cron.job.
\set ON_ERROR_STOP on

\if :{?field_tz}
\else
  \set field_tz America/Chicago
\endif

BEGIN;
SET LOCAL statement_timeout='30s';
-- Carried in a GUC because psql does not interpolate a variable inside the
-- dollar-quoted body of a DO block.
SET LOCAL sq94.field_tz = :'field_tz';

-- ── 1. The registry exists, and is the two jobs 00648 declares ─────────────
DO $t1$
DECLARE
  v_names text[];
BEGIN
  ASSERT EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='cron' AND tablename='job'),
    'FAIL 1a: no cron.job on this database — install pg_cron, or the shim documented in this file''s header, and replay the migrations first';

  -- Anything that invokes the field-daily edge function, whatever it is named,
  -- plus anything named after it. A third tick nobody documented fails here.
  SELECT array_agg(jobname ORDER BY jobname) INTO v_names
  FROM cron.job
  WHERE command LIKE '%field-daily%' OR jobname LIKE 'field-daily%';

  ASSERT v_names = ARRAY['field-daily','field-daily-evening'],
    format('FAIL 1b: the field-daily registry is %s, expected {field-daily,field-daily-evening}',
           coalesce(v_names::text, 'empty'));
END
$t1$;

-- ── 2. Each job's name, expression, command and state ──────────────────────
DO $t2$
DECLARE
  v_command CONSTANT text := 'SELECT public.invoke_edge_function(''field-daily'', ''{}''::jsonb);';
  c record;
  j cron.job%ROWTYPE;
  n int;
BEGIN
  FOR c IN SELECT * FROM (VALUES
      ('field-daily',         '0 14 * * *'),   -- 08:00 CST / 09:00 CDT (00432)
      ('field-daily-evening', '5 23 * * *')    -- 17:05 CST / 18:05 CDT (00648)
    ) v(jobname, schedule)
  LOOP
    SELECT count(*) INTO n FROM cron.job WHERE jobname = c.jobname;
    ASSERT n = 1,
      format('FAIL 2a: expected exactly 1 cron.job row named %s, got %s', c.jobname, n);
    SELECT * INTO j FROM cron.job WHERE jobname = c.jobname;

    ASSERT j.schedule = c.schedule,
      format('FAIL 2b: %s is scheduled %L, expected %L', c.jobname, j.schedule, c.schedule);

    -- Both ticks run the WHOLE function with the same empty payload: which of
    -- its blocks does anything is decided by core.ts's local-minute gates, not
    -- by the caller. A payload here would be a second place to keep that.
    ASSERT j.command = v_command,
      format('FAIL 2c: %s runs %L, expected %L', c.jobname, j.command, v_command);

    ASSERT j.active,
      format('FAIL 2d: %s is scheduled but inactive', c.jobname);
  END LOOP;
END
$t2$;

-- ── 3. Where those expressions land, at both offsets the zone takes ────────
-- Read back out of cron.job rather than restated, so an edited expression is
-- caught here and not only by eye. The minute and hour are the first two
-- fields of the expression.
DO $t3$
DECLARE
  v_tz CONSTANT text := current_setting('sq94.field_tz');
  c record;
  v_sched text;
  v_day date;
  v_local int;
BEGIN
  FOR c IN SELECT * FROM (VALUES
      -- job, and the local floor it exists to clear (core.ts:54-55).
      ('field-daily',         7*60+30),
      ('field-daily-evening', 17*60)
    ) v(jobname, floor_minutes)
  LOOP
    SELECT schedule INTO v_sched FROM cron.job WHERE jobname = c.jobname;
    ASSERT v_sched ~ '^[0-9]+ [0-9]+ \* \* \*$',
      format('FAIL 3a: %s is %L, and the arithmetic below only holds for a plain daily "<minute> <hour> * * *"',
             c.jobname, v_sched);

    -- One date in daylight time, one in standard time. A fixed UTC hour is a
    -- different local hour in each, and the card is due at a LOCAL hour.
    FOREACH v_day IN ARRAY ARRAY['2026-07-15'::date, '2026-12-02'::date]
    LOOP
      SELECT EXTRACT(hour FROM t)::int * 60 + EXTRACT(minute FROM t)::int
        INTO v_local
      FROM (SELECT ((v_day + make_interval(
                      hours => split_part(v_sched, ' ', 2)::int,
                      mins  => split_part(v_sched, ' ', 1)::int)
                    ) AT TIME ZONE 'UTC') AT TIME ZONE v_tz AS t) x;

      -- Past the floor, or the block it feeds never runs that day — and the
      -- next tick is the following morning, after the visit has started.
      ASSERT v_local >= c.floor_minutes,
        format('FAIL 3b: %s (%L) lands at local minute %s on %s in %s, short of its %s floor',
               c.jobname, v_sched, v_local, v_day, v_tz, c.floor_minutes);

      -- And inside quiet hours, or the send is held until the morning it was
      -- meant to precede. 08:00-20:00 in the rail's zone is the compliance
      -- floor every send is subject to (00432 header).
      ASSERT v_local >= 8*60 AND v_local <= 20*60,
        format('FAIL 3c: %s (%L) lands at local minute %s on %s in %s, outside quiet hours',
               c.jobname, v_sched, v_local, v_day, v_tz);
    END LOOP;
  END LOOP;
END
$t3$;

ROLLBACK;

\echo 'field_daily_schedule_test: PASS'
