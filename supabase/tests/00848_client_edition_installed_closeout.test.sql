-- ═══════════════════════════════════════════════════════════════════════════
-- 00848 — close-out freezes the edition; client_plate_source_owned fails closed
--
-- Named cases (the dispatcher runs with composition switched off, so no run
-- opens and no function is called):
--   shape       the freeze trigger is on projects; the new helpers are
--               callable by no API role; undo and dispatch keep their grants
--   freeze      closing a job freezes its approved edition and points
--               facts.portfolioSnapshotRef at projects.portfolio_snapshot
--               (sha256, never a copy); other facts stay; a draft awaiting
--               review is not frozen
--   guards      after the close, approve, undo and begin refuse (55000);
--               a closed job with no approved edition refuses with the
--               closed message, and undo of an approved edition that is not
--               frozen refuses too
--   backfill    _client_edition_freeze freezes a completed job's approved
--               edition (present false without a snapshot)
--   dispatcher  a closed job's queued requests end done, close_reason
--               'closed'; a leased one and an open job's are left alone
--   recovery    00847's recompose trigger queues nothing for a closed job's
--               swept draft; an open job's swept draft still gets one
--   ownership   client_plate_source_owned: field_captures and any unknown
--               table are FALSE; the four emitted tables keep the 00843
--               answers (checked against 00843's body, kept here verbatim)
--   lifecycle   two dblink sessions with the real close_project and
--               archive_project (SQ-1725 R2/R3): a begin parked between
--               the project and the edition lock makes the close wait, no
--               40P01; archive vs approve and archive vs finish, both
--               orders; the writer that loses refuses 55000
--   plates      a closed job's plates keep what its edition showed (R1):
--               a late focal save and a perception refuse; a re-crop
--               queued before the close is closed 'closed' unleased; its
--               settlement keeps the plate; a first copy still lands
--   snapshot    a repeated real close with the same snapshot changes
--               nothing; a different one, or NULL → a value, refuses (R4)
--   archived    an archived job with completion evidence freezes; one
--               archived without a close does not (R5)
--   band        list_client_editions answers projectClosed; hold refuses
--               on a closed job (R6)
--
-- Run (from supabase/): psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" \
--        -v ON_ERROR_STOP=1 -f tests/00848_client_edition_installed_closeout.test.sql
-- finish(true) raises on any failed assertion, so psql exits non-zero.
-- Everything is rolled back.
-- ═══════════════════════════════════════════════════════════════════════════
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT plan(50);

-- ─── shape ─────────────────────────────────────────────────────────────────

SELECT has_trigger('public', 'projects', 'trg_client_edition_freeze_on_close',
                   'shape: the freeze trigger is on projects');
SELECT has_trigger('public', 'projects', 'trg_client_edition_keep_snapshot',
                   'shape: the snapshot trigger is on projects');
SELECT ok(NOT has_function_privilege('anon', 'public._client_edition_closed(uuid)', 'EXECUTE')
          AND NOT has_function_privilege('authenticated', 'public._client_edition_closed(uuid)', 'EXECUTE')
          AND NOT has_function_privilege('anon', 'public._client_edition_freeze(uuid)', 'EXECUTE')
          AND NOT has_function_privilege('authenticated', 'public._client_edition_freeze(uuid)', 'EXECUTE')
          AND NOT has_function_privilege('anon', 'public.client_edition_freeze_on_close()', 'EXECUTE')
          AND NOT has_function_privilege('authenticated', 'public.client_edition_freeze_on_close()', 'EXECUTE')
          AND NOT has_function_privilege('anon', 'public._client_edition_lock(uuid)', 'EXECUTE')
          AND NOT has_function_privilege('authenticated', 'public._client_edition_lock(uuid)', 'EXECUTE')
          AND NOT has_function_privilege('anon', 'public._client_plate_refuse_closed(uuid)', 'EXECUTE')
          AND NOT has_function_privilege('authenticated', 'public._client_plate_refuse_closed(uuid)', 'EXECUTE')
          AND NOT has_function_privilege('anon', 'public.client_edition_keep_snapshot()', 'EXECUTE')
          AND NOT has_function_privilege('authenticated', 'public.client_edition_keep_snapshot()', 'EXECUTE'),
          'shape: the closed, lock, freeze, refusal and trigger functions are callable by no API role');
SELECT ok(has_function_privilege('authenticated', 'public.undo_client_edition(uuid)', 'EXECUTE')
          AND NOT has_function_privilege('anon', 'public.undo_client_edition(uuid)', 'EXECUTE')
          AND has_function_privilege('service_role', 'public.dispatch_client_edition_compose()', 'EXECUTE')
          AND NOT has_function_privilege('authenticated', 'public.dispatch_client_edition_compose()', 'EXECUTE')
          AND has_function_privilege('service_role', 'public.client_plate_source_owned(uuid, text, uuid, text)', 'EXECUTE')
          AND NOT has_function_privilege('authenticated', 'public.client_plate_source_owned(uuid, text, uuid, text)', 'EXECUTE'),
          'shape: undo stays the studio''s, dispatch and the ownership check stay service-only');

-- ─── lifecycle: two sessions, the real close_project and archive_project ───
-- Committed fixtures (every session must see them), cleaned by this run's
-- UUIDs. A is the designer closing or archiving; B is the edition writer;
-- C holds the edition lock in T1. Runs before this file's own fixtures and
-- its sweep UPDATEs, which hold row locks until the final ROLLBACK.
--   T1  B's begin waits on C's edition lock holding the project FOR SHARE;
--       A's close_project waits on B; C lets go: B opens its draft, then A
--       closes. With the edition lock taken first, B's INSERT waited on
--       A's FOR UPDATE while A's freeze waited on B: 40P01.
--   T2  A archives and holds; B's approve waits, then refuses 55000.
--   T3a A archives and holds; B's finish waits, then refuses 55000.
--   T3b B finishes and holds; A's archive waits, then archives.
CREATE EXTENSION IF NOT EXISTS dblink WITH SCHEMA extensions;
CREATE TEMP TABLE lifecycle_results (name text PRIMARY KEY, passed boolean, detail text);

-- A DO block that runs one act and leaves its outcome in sq1725.result.
CREATE FUNCTION pg_temp.act(p_sql text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT format($do$DO $call$ BEGIN
      %s;
      PERFORM set_config('sq1725.result', 'ok', true);
    EXCEPTION WHEN OTHERS THEN
      PERFORM set_config('sq1725.result', SQLSTATE || ': ' || SQLERRM, true);
    END $call$;$do$, p_sql);
$$;
-- The outcome of the act last run on a connection.
CREATE FUNCTION pg_temp.outcome(p_conn text)
RETURNS text LANGUAGE sql AS $$
  SELECT x FROM extensions.dblink(p_conn, 'SELECT current_setting(''sq1725.result'', true)') AS r(x text);
$$;
-- Wait for a sent act, then its outcome.
CREATE FUNCTION pg_temp.settle(p_conn text)
RETURNS text LANGUAGE plpgsql AS $$
BEGIN
  PERFORM * FROM extensions.dblink_get_result(p_conn) AS r(x text);
  PERFORM * FROM extensions.dblink_get_result(p_conn) AS r(x text);
  RETURN pg_temp.outcome(p_conn);
END;
$$;
-- Who a sent act waits on, once it waits (empty if it finished first).
CREATE FUNCTION pg_temp.blockers(p_pid integer, p_conn text)
RETURNS integer[] LANGUAGE plpgsql AS $$
DECLARE
  v_pids integer[];
BEGIN
  FOR attempt IN 1..200 LOOP
    v_pids := pg_blocking_pids(p_pid);
    EXIT WHEN cardinality(v_pids) > 0 OR extensions.dblink_is_busy(p_conn) = 0;
    PERFORM pg_sleep(0.025);
  END LOOP;
  RETURN COALESCE(v_pids, '{}'::integer[]);
END;
$$;

DO $test$
DECLARE
  v_dsn text := format(
    'host=%s port=54322 dbname=%s user=postgres password=postgres connect_timeout=5',
    host(network(set_masklen(inet_server_addr(), 16)) + 1), current_database());
  v_closeout text := '[{"key":"walkthrough","completed":true},{"key":"punch_list","completed":true},'
                     '{"key":"payment","completed":true},{"key":"photography","completed":true},'
                     '{"key":"photos","completed":true},{"key":"case_study","completed":true}]';
  v_actor uuid := gen_random_uuid();
  v_t1 uuid := gen_random_uuid();
  v_t2 uuid := gen_random_uuid();
  v_t3a uuid := gen_random_uuid();
  v_t3b uuid := gen_random_uuid();
  v_request uuid := gen_random_uuid();
  v_e2 uuid := gen_random_uuid();
  v_e3a uuid := gen_random_uuid();
  v_e3b uuid := gen_random_uuid();
  v_token uuid := gen_random_uuid();
  v_org uuid;
  v_a integer;
  v_b integer;
  v_c integer;
  v_b_waits integer[];
  v_a_waits integer[];
  v_a_result text;
  v_b_result text;
  v_ok boolean;
  v_conn text;
  v_detail text := '';
BEGIN
  FOREACH v_conn IN ARRAY ARRAY['sq1725_a', 'sq1725_b', 'sq1725_c'] LOOP
    PERFORM extensions.dblink_connect(v_conn, v_dsn);
    PERFORM extensions.dblink_exec(v_conn, 'SET statement_timeout = ''12s''');
    PERFORM extensions.dblink_exec(v_conn, 'SET lock_timeout = ''5s''');
  END LOOP;
  BEGIN
    PERFORM extensions.dblink_exec('sq1725_c', format($fixture$
      INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at,
                              instance_id, aud, role)
      VALUES (%1$L, 'sq1725-' || %1$L || '@test.invalid', '', now(), now(), now(),
              '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');
      INSERT INTO public.profiles (id, email, full_name, is_designer)
      VALUES (%1$L, 'sq1725-' || %1$L || '@test.invalid', 'SQ1725 Designer', true)
      ON CONFLICT (id) DO UPDATE SET is_designer = true;
    $fixture$, v_actor));
    SELECT id INTO v_org FROM extensions.dblink('sq1725_c', format(
      'SELECT public._primary_studio_for(%L)', v_actor)) AS r(id uuid);
    PERFORM extensions.dblink_exec('sq1725_c', format($fixture$
      INSERT INTO public.projects (id, name, designer_id, created_by, studio_id, status)
      SELECT project.id, 'SQ1725 lifecycle ' || project.n, %1$L, %1$L, %2$L, 'active'
      FROM unnest(ARRAY[%3$L, %4$L, %5$L, %6$L]::uuid[]) WITH ORDINALITY AS project(id, n);
      INSERT INTO public.client_edition_requests (id, project_id, reason, debounce_key, status, attempts,
                                                  lease_token, lease_expires_at)
      VALUES (%7$L, %3$L, 'phase', %3$L || ':phase', 'leased', 1, %11$L, now() + interval '10 minutes');
      INSERT INTO public.client_editions (id, project_id, seq, status, kind, facts)
      VALUES (%8$L, %4$L, 1, 'awaiting_review', 'full', '{}'::jsonb);
      INSERT INTO public.client_editions (id, project_id, seq, status, lease_token, lease_expires_at)
      VALUES (%9$L, %5$L, 1, 'drafting', %11$L, now() + interval '10 minutes'),
             (%10$L, %6$L, 1, 'drafting', %11$L, now() + interval '10 minutes');
    $fixture$, v_actor, v_org, v_t1, v_t2, v_t3a, v_t3b, v_request, v_e2, v_e3a, v_e3b, v_token));
    SELECT pid INTO v_a FROM extensions.dblink('sq1725_a', 'SELECT pg_backend_pid()') AS r(pid integer);
    SELECT pid INTO v_b FROM extensions.dblink('sq1725_b', 'SELECT pg_backend_pid()') AS r(pid integer);
    SELECT pid INTO v_c FROM extensions.dblink('sq1725_c', 'SELECT pg_backend_pid()') AS r(pid integer);
    PERFORM extensions.dblink_exec('sq1725_a', 'SET ROLE authenticated');
    PERFORM * FROM extensions.dblink('sq1725_a', format(
      'SELECT set_config(''request.jwt.claims'', %L, false)',
      jsonb_build_object('sub', v_actor, 'role', 'authenticated')::text)) AS r(x text);

    -- T1: close_project vs begin_client_edition.
    PERFORM extensions.dblink_exec('sq1725_c', 'BEGIN');
    PERFORM * FROM extensions.dblink('sq1725_c', format(
      'SELECT pg_advisory_xact_lock(hashtextextended(%L, 0))::text', 'client_editions:' || v_t1)) AS r(x text);
    PERFORM extensions.dblink_exec('sq1725_b', 'BEGIN');
    PERFORM extensions.dblink_send_query('sq1725_b', pg_temp.act(format(
      'PERFORM public.begin_client_edition(%L, %L)', v_request, v_token)));
    v_b_waits := pg_temp.blockers(v_b, 'sq1725_b');
    PERFORM extensions.dblink_exec('sq1725_a', 'BEGIN');
    PERFORM extensions.dblink_send_query('sq1725_a', pg_temp.act(format(
      'PERFORM public.close_project(%L, %L::jsonb, %L::jsonb)', v_t1, v_closeout, '{"headline": "SQ1725"}')));
    v_a_waits := pg_temp.blockers(v_a, 'sq1725_a');
    INSERT INTO lifecycle_results VALUES ('t1 wait', v_c = ANY(v_b_waits) AND v_b = ANY(v_a_waits),
      format('A=%s B=%s C=%s; begin waits on %s; close waits on %s', v_a, v_b, v_c, v_b_waits, v_a_waits));
    PERFORM extensions.dblink_exec('sq1725_c', 'COMMIT');
    v_b_result := pg_temp.settle('sq1725_b');
    PERFORM extensions.dblink_exec('sq1725_b', 'COMMIT');
    v_a_result := pg_temp.settle('sq1725_a');
    PERFORM extensions.dblink_exec('sq1725_a', 'COMMIT');
    INSERT INTO lifecycle_results VALUES ('t1 complete', v_b_result = 'ok' AND v_a_result = 'ok',
      format('begin=%s close=%s', v_b_result, v_a_result));
    SELECT passed INTO v_ok FROM extensions.dblink('sq1725_c', format($state$
      SELECT (SELECT status = 'completed' FROM public.projects WHERE id = %1$L)
         AND (SELECT count(*) = 1 FROM public.client_editions WHERE project_id = %1$L AND status = 'drafting')
         AND (SELECT status = 'done' FROM public.client_edition_requests WHERE id = %2$L)
    $state$, v_t1, v_request)) AS r(passed boolean);
    INSERT INTO lifecycle_results VALUES ('t1 state', COALESCE(v_ok, false), '');

    -- T2: archive_project, then approve_client_edition.
    PERFORM extensions.dblink_exec('sq1725_b', 'SET ROLE authenticated');
    PERFORM * FROM extensions.dblink('sq1725_b', format(
      'SELECT set_config(''request.jwt.claims'', %L, false)',
      jsonb_build_object('sub', v_actor, 'role', 'authenticated')::text)) AS r(x text);
    PERFORM extensions.dblink_exec('sq1725_a', 'BEGIN');
    PERFORM extensions.dblink_exec('sq1725_a', pg_temp.act(format(
      'PERFORM public.archive_project(%L, %L)', v_t2, 'active')));
    v_a_result := pg_temp.outcome('sq1725_a');
    PERFORM extensions.dblink_exec('sq1725_b', 'BEGIN');
    PERFORM extensions.dblink_send_query('sq1725_b', pg_temp.act(format(
      'PERFORM public.approve_client_edition(%L)', v_e2)));
    v_b_waits := pg_temp.blockers(v_b, 'sq1725_b');
    PERFORM extensions.dblink_exec('sq1725_a', 'COMMIT');
    v_b_result := pg_temp.settle('sq1725_b');
    PERFORM extensions.dblink_exec('sq1725_b', 'COMMIT');
    PERFORM extensions.dblink_exec('sq1725_b', 'RESET ROLE');
    SELECT passed INTO v_ok FROM extensions.dblink('sq1725_c', format($state$
      SELECT (SELECT status = 'archived' FROM public.projects WHERE id = %1$L)
         AND (SELECT status = 'awaiting_review' AND approved_at IS NULL
              FROM public.client_editions WHERE id = %2$L)
    $state$, v_t2, v_e2)) AS r(passed boolean);
    INSERT INTO lifecycle_results VALUES ('t2 approve', v_a_result = 'ok' AND v_a = ANY(v_b_waits)
      AND v_b_result = '55000: client_edition_frozen: this job is closed; its editions no longer change'
      AND COALESCE(v_ok, false),
      format('archive=%s; approve waits on %s; approve=%s; state=%s', v_a_result, v_b_waits, v_b_result, v_ok));

    -- T3a: archive_project, then finish_client_edition.
    PERFORM extensions.dblink_exec('sq1725_a', 'BEGIN');
    PERFORM extensions.dblink_exec('sq1725_a', pg_temp.act(format(
      'PERFORM public.archive_project(%L, %L)', v_t3a, 'active')));
    v_a_result := pg_temp.outcome('sq1725_a');
    PERFORM extensions.dblink_exec('sq1725_b', 'BEGIN');
    PERFORM extensions.dblink_send_query('sq1725_b', pg_temp.act(format(
      'PERFORM public.finish_client_edition(%L, %L, ''awaiting_review'', ''full'', ''{}''::jsonb, ''{}''::jsonb, NULL::jsonb, ''sq1725'', ''test'', 0, NULL)',
      v_e3a, v_token)));
    v_b_waits := pg_temp.blockers(v_b, 'sq1725_b');
    PERFORM extensions.dblink_exec('sq1725_a', 'COMMIT');
    v_b_result := pg_temp.settle('sq1725_b');
    PERFORM extensions.dblink_exec('sq1725_b', 'COMMIT');
    SELECT passed INTO v_ok FROM extensions.dblink('sq1725_c', format(
      'SELECT status = ''drafting'' FROM public.client_editions WHERE id = %L', v_e3a)) AS r(passed boolean);
    INSERT INTO lifecycle_results VALUES ('t3a finish', v_a_result = 'ok' AND v_a = ANY(v_b_waits)
      AND v_b_result = '55000: client_edition_frozen: this job is closed; its editions no longer change'
      AND COALESCE(v_ok, false),
      format('archive=%s; finish waits on %s; finish=%s; state=%s', v_a_result, v_b_waits, v_b_result, v_ok));

    -- T3b: finish_client_edition, then archive_project.
    PERFORM extensions.dblink_exec('sq1725_b', 'BEGIN');
    PERFORM extensions.dblink_exec('sq1725_b', pg_temp.act(format(
      'PERFORM public.finish_client_edition(%L, %L, ''awaiting_review'', ''full'', ''{}''::jsonb, ''{}''::jsonb, NULL::jsonb, ''sq1725'', ''test'', 0, NULL)',
      v_e3b, v_token)));
    v_b_result := pg_temp.outcome('sq1725_b');
    PERFORM extensions.dblink_exec('sq1725_a', 'BEGIN');
    PERFORM extensions.dblink_send_query('sq1725_a', pg_temp.act(format(
      'PERFORM public.archive_project(%L, %L)', v_t3b, 'active')));
    v_a_waits := pg_temp.blockers(v_a, 'sq1725_a');
    PERFORM extensions.dblink_exec('sq1725_b', 'COMMIT');
    v_a_result := pg_temp.settle('sq1725_a');
    PERFORM extensions.dblink_exec('sq1725_a', 'COMMIT');
    INSERT INTO lifecycle_results VALUES ('t3b archive', v_b_result = 'ok' AND v_b = ANY(v_a_waits)
      AND v_a_result = 'ok',
      format('finish=%s; archive waits on %s; archive=%s', v_b_result, v_a_waits, v_a_result));
    SELECT passed INTO v_ok FROM extensions.dblink('sq1725_c', format($state$
      SELECT (SELECT status = 'archived' FROM public.projects WHERE id = %1$L)
         AND (SELECT status = 'awaiting_review' FROM public.client_editions WHERE id = %2$L)
    $state$, v_t3b, v_e3b)) AS r(passed boolean);
    INSERT INTO lifecycle_results VALUES ('t3b state', COALESCE(v_ok, false), '');
  EXCEPTION WHEN OTHERS THEN
    v_detail := SQLSTATE || ': ' || SQLERRM;
  END;
  FOREACH v_conn IN ARRAY ARRAY['sq1725_a', 'sq1725_b', 'sq1725_c'] LOOP
    IF extensions.dblink_is_busy(v_conn) = 1 THEN
      PERFORM extensions.dblink_cancel_query(v_conn);
    END IF;
    BEGIN
      PERFORM * FROM extensions.dblink_get_result(v_conn, false) AS r(x text);
      PERFORM * FROM extensions.dblink_get_result(v_conn, false) AS r(x text);
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
    PERFORM extensions.dblink_exec(v_conn, 'ROLLBACK');
    PERFORM extensions.dblink_exec(v_conn, 'RESET ROLE');
  END LOOP;
  PERFORM extensions.dblink_exec('sq1725_c', format($cleanup$
    SET app.ffe_mutation_rpc = 'on';
    DELETE FROM public.client_edition_requests WHERE project_id = ANY(ARRAY[%1$L, %2$L, %3$L, %4$L]::uuid[]);
    DELETE FROM public.projects WHERE id = ANY(ARRAY[%1$L, %2$L, %3$L, %4$L]::uuid[]);
    DELETE FROM public.audit_logs WHERE user_id = %5$L OR organization_id = %6$L;
    SET ROLE service_role;
    DELETE FROM public.organizations WHERE id = %6$L;
    RESET ROLE;
    DELETE FROM public.profiles WHERE id = %5$L;
    DELETE FROM auth.users WHERE id = %5$L;
  $cleanup$, v_t1, v_t2, v_t3a, v_t3b, v_actor, v_org));
  SELECT passed INTO v_ok FROM extensions.dblink('sq1725_c', format($clean$
    SELECT NOT EXISTS (SELECT 1 FROM public.projects WHERE id = ANY(ARRAY[%1$L, %2$L, %3$L, %4$L]::uuid[]))
      AND NOT EXISTS (SELECT 1 FROM public.client_editions
                      WHERE project_id = ANY(ARRAY[%1$L, %2$L, %3$L, %4$L]::uuid[]))
      AND NOT EXISTS (SELECT 1 FROM public.client_edition_requests
                      WHERE project_id = ANY(ARRAY[%1$L, %2$L, %3$L, %4$L]::uuid[]))
      AND NOT EXISTS (SELECT 1 FROM auth.users WHERE id = %5$L)
  $clean$, v_t1, v_t2, v_t3a, v_t3b, v_actor)) AS r(passed boolean);
  INSERT INTO lifecycle_results VALUES ('cleanup', COALESCE(v_ok, false), v_detail);
  FOREACH v_conn IN ARRAY ARRAY['sq1725_a', 'sq1725_b', 'sq1725_c'] LOOP
    PERFORM extensions.dblink_disconnect(v_conn);
  END LOOP;
  INSERT INTO lifecycle_results
    SELECT name, false, v_detail
    FROM unnest(ARRAY['t1 wait', 't1 complete', 't1 state', 't2 approve', 't3a finish', 't3b archive',
                      't3b state']) AS name
    ON CONFLICT (name) DO NOTHING;
END
$test$;
SELECT diag(name || ': ' || detail) FROM lifecycle_results WHERE detail <> '';
SELECT ok(passed, 'lifecycle: begin waits on the edition lock holding the project; the close waits on begin')
FROM lifecycle_results WHERE name = 't1 wait';
SELECT ok(passed, 'lifecycle: close_project vs begin_client_edition completes both, no 40P01')
FROM lifecycle_results WHERE name = 't1 complete';
SELECT ok(passed, 'lifecycle: the draft opened before the close; the job closed after it')
FROM lifecycle_results WHERE name = 't1 state';
SELECT ok(passed, 'lifecycle: approve waits on archive_project, then refuses 55000; the edition stays awaiting review')
FROM lifecycle_results WHERE name = 't2 approve';
SELECT ok(passed, 'lifecycle: finish waits on archive_project, then refuses 55000; the draft stays drafting')
FROM lifecycle_results WHERE name = 't3a finish';
SELECT ok(passed, 'lifecycle: archive_project waits on a finish in flight, then archives')
FROM lifecycle_results WHERE name = 't3b archive';
SELECT ok(passed, 'lifecycle: the finished edition stands and the job is archived after it')
FROM lifecycle_results WHERE name = 't3b state';
SELECT ok(passed, 'lifecycle: only this run''s synthetic fixtures are removed')
FROM lifecycle_results WHERE name = 'cleanup';

-- ─── fixtures (as postgres) ────────────────────────────────────────────────
-- O owner of the studio · C the client. P1 closed with a snapshot and an
-- approved edition · P2 closed, no snapshot, no approved edition · P3 closed
-- with an expired draft · P4 open, a queued change · P5 open, an expired
-- draft · P6/P7 the plate ownership matrix · P8/P9 closed by the real
-- close_project (snapshot) · P10/P11 archived (completion evidence).

INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, instance_id, aud, role)
VALUES
  ('84800000-0000-4000-8000-0000000000a1', 'us49-848-owner@test.invalid',  '', now(), now(), now(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('84800000-0000-4000-8000-0000000000a2', 'us49-848-client@test.invalid', '', now(), now(), now(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');
INSERT INTO public.profiles (id, email, full_name, is_designer, created_at, updated_at)
VALUES
  ('84800000-0000-4000-8000-0000000000a1', 'us49-848-owner@test.invalid',  'US49 848 Owner',  true,  now(), now()),
  ('84800000-0000-4000-8000-0000000000a2', 'us49-848-client@test.invalid', 'US49 848 Client', false, now(), now())
ON CONFLICT (id) DO UPDATE
SET email = EXCLUDED.email, full_name = EXCLUDED.full_name, is_designer = EXCLUDED.is_designer;
INSERT INTO public.organizations (id, type, name, slug, address)
VALUES ('84800000-0000-4000-8000-0000000000f1', 'design_studio', 'US49 848 Studio', 'us49-848-studio-test',
        '{"city": "Hudson"}'::jsonb);
INSERT INTO public.organization_members (id, user_id, organization_id, role, status, joined_at)
VALUES ('84800000-0000-4000-8000-0000000000e1', '84800000-0000-4000-8000-0000000000a1',
        '84800000-0000-4000-8000-0000000000f1', 'owner', 'active', now());
INSERT INTO public.projects (id, name, designer_id, client_id, created_by, studio_id, status, show_makers)
SELECT ('84800000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid, 'US49 848 House ' || n,
       '84800000-0000-4000-8000-0000000000a1', '84800000-0000-4000-8000-0000000000a2',
       '84800000-0000-4000-8000-0000000000a1', '84800000-0000-4000-8000-0000000000f1', 'active', false
FROM generate_series(1, 11) AS n;

-- Composition off: the sweep runs, no run opens. Every open request
-- anywhere is answered; this file queues its own.
UPDATE public.llm_feature_controls SET enabled = false WHERE feature = 'client-edition-compose';
UPDATE public.client_edition_requests
   SET status = 'done', lease_token = NULL, lease_expires_at = NULL
 WHERE status IN ('queued', 'leased');

INSERT INTO public.client_editions (id, project_id, seq, status, kind, approved_at, facts, created_at)
VALUES
  ('84800000-0000-4000-8000-000000000911', '84800000-0000-4000-8000-000000000001', 1, 'approved', 'full',
   now() - interval '2 days', '{"keep": 1}'::jsonb, now() - interval '2 days'),
  ('84800000-0000-4000-8000-000000000912', '84800000-0000-4000-8000-000000000001', 2, 'awaiting_review', 'full',
   NULL, '{}'::jsonb, now() - interval '2 days'),
  ('84800000-0000-4000-8000-000000000921', '84800000-0000-4000-8000-000000000002', 1, 'awaiting_review', 'full',
   NULL, '{}'::jsonb, now() - interval '2 days');
INSERT INTO public.client_editions (id, project_id, seq, status, lease_token, lease_expires_at, created_at)
VALUES
  ('84800000-0000-4000-8000-000000000931', '84800000-0000-4000-8000-000000000003', 1, 'drafting',
   '84800000-0000-4000-8000-000000000731', now() - interval '1 minute', now() - interval '2 days'),
  ('84800000-0000-4000-8000-000000000951', '84800000-0000-4000-8000-000000000005', 1, 'drafting',
   '84800000-0000-4000-8000-000000000751', now() - interval '1 minute', now() - interval '2 days');

-- close_project's own transition: the completion GUC around the UPDATE.
CREATE FUNCTION pg_temp.close_job(p_id uuid, p_snapshot jsonb)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('app.project_completion_id', p_id::text, true);
  UPDATE public.projects SET status = 'completed', portfolio_snapshot = p_snapshot WHERE id = p_id;
  PERFORM set_config('app.project_completion_id', '', true);
END;
$$;

SELECT pg_temp.close_job('84800000-0000-4000-8000-000000000001',
                         '{"headline": "Done", "value_cents": 120000}'::jsonb);
SELECT pg_temp.close_job('84800000-0000-4000-8000-000000000002', NULL);
SELECT pg_temp.close_job('84800000-0000-4000-8000-000000000003',
                         '{"headline": "Porch", "value_cents": 5000}'::jsonb);

-- ─── freeze ────────────────────────────────────────────────────────────────

SELECT is(
  (SELECT jsonb_build_object('frozen', edition.frozen_at IS NOT NULL, 'ref', edition.facts -> 'portfolioSnapshotRef')
   FROM public.client_editions AS edition WHERE edition.id = '84800000-0000-4000-8000-000000000911'),
  (SELECT jsonb_build_object('frozen', true, 'ref', jsonb_build_object(
     'table', 'projects', 'column', 'portfolio_snapshot', 'id', project.id, 'present', true,
     'sha256', encode(sha256(convert_to('{"headline": "Done", "value_cents": 120000}'::jsonb::text, 'UTF8')), 'hex'),
     'closedAt', project.completed_at))
   FROM public.projects AS project WHERE project.id = '84800000-0000-4000-8000-000000000001'),
  'freeze: the approved edition is frozen with a pointer and hash of the portfolio snapshot');
SELECT is(
  (SELECT facts -> 'keep' FROM public.client_editions WHERE id = '84800000-0000-4000-8000-000000000911'),
  '1'::jsonb,
  'freeze: the edition''s other facts stay');
SELECT ok(
  (SELECT position('value_cents' IN facts::text) = 0 AND position('120000' IN facts::text) = 0
   FROM public.client_editions WHERE id = '84800000-0000-4000-8000-000000000911'),
  'freeze: the snapshot is pointed at, never copied (no value_cents in facts)');
SELECT is(
  (SELECT frozen_at FROM public.client_editions WHERE id = '84800000-0000-4000-8000-000000000912'),
  NULL::timestamptz,
  'freeze: a draft awaiting review is not frozen');

-- ─── guards ────────────────────────────────────────────────────────────────

INSERT INTO public.client_editions (id, project_id, seq, status, kind, approved_at, facts, created_at)
VALUES ('84800000-0000-4000-8000-000000000922', '84800000-0000-4000-8000-000000000002', 2, 'approved', 'full',
        now() - interval '1 day', '{}'::jsonb, now() - interval '2 days');
INSERT INTO public.client_edition_requests (id, project_id, reason, debounce_key, status, attempts, lease_token, lease_expires_at)
VALUES ('84800000-0000-4000-8000-000000000821', '84800000-0000-4000-8000-000000000002', 'phase',
        '84800000-0000-4000-8000-000000000002:phase', 'leased', 1,
        '84800000-0000-4000-8000-000000000721', now() + interval '10 minutes');

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"84800000-0000-4000-8000-0000000000a1","role":"authenticated"}';
SELECT throws_ok($$SELECT public.approve_client_edition('84800000-0000-4000-8000-000000000912')$$,
                 '55000', 'client_edition_frozen: this job is closed; its editions no longer change',
                 'guards: approve on a closed job is refused');
SELECT throws_ok($$SELECT public.approve_client_edition('84800000-0000-4000-8000-000000000921')$$,
                 '55000', 'client_edition_frozen: this job is closed; its editions no longer change',
                 'guards: approve on a closed job with no approved edition is refused with the closed message');
SELECT throws_ok($$SELECT public.undo_client_edition('84800000-0000-4000-8000-000000000911')$$,
                 '55000', NULL,
                 'guards: undo of the frozen edition is refused');
SELECT throws_ok($$SELECT public.undo_client_edition('84800000-0000-4000-8000-000000000922')$$,
                 '55000', 'client_edition_frozen: this job is closed; its editions no longer change',
                 'guards: undo of an approved edition that is not frozen is refused on a closed job');
RESET ROLE;

SET LOCAL ROLE service_role;
SELECT throws_ok($$SELECT public.begin_client_edition('84800000-0000-4000-8000-000000000821',
                                                      '84800000-0000-4000-8000-000000000721')$$,
                 '55000', 'client_edition_frozen: this job is closed; its editions no longer change',
                 'guards: begin on a closed job is refused');
RESET ROLE;

-- ─── backfill ──────────────────────────────────────────────────────────────

SELECT public._client_edition_freeze('84800000-0000-4000-8000-000000000002');
SELECT is(
  (SELECT jsonb_build_object('frozen', frozen_at IS NOT NULL,
                             'present', facts -> 'portfolioSnapshotRef' -> 'present',
                             'sha256', facts -> 'portfolioSnapshotRef' -> 'sha256')
   FROM public.client_editions WHERE id = '84800000-0000-4000-8000-000000000922'),
  '{"frozen": true, "present": false, "sha256": null}'::jsonb,
  'backfill: a completed job''s approved edition is frozen; no snapshot → present false, no hash');

-- ─── dispatcher + recovery ─────────────────────────────────────────────────
-- P1 and P2 got the 'closed' request 00844 queues on the close; P1 and P4
-- get a change too. P3's requests are answered so the only thing keeping
-- its swept draft from a recovery is the close.

SELECT public._enqueue_client_edition_request('84800000-0000-4000-8000-000000000001', 'phase', interval '0');
SELECT public._enqueue_client_edition_request('84800000-0000-4000-8000-000000000004', 'phase', interval '0');
UPDATE public.client_edition_requests SET status = 'done'
 WHERE project_id = '84800000-0000-4000-8000-000000000003' AND status = 'queued';

SELECT is(public.dispatch_client_edition_compose(), NULL::bigint,
          'dispatcher: composition off → no run');
SELECT is(
  (SELECT jsonb_agg(jsonb_build_object('p', right(project_id::text, 1), 'reason', reason,
                                       'status', status, 'close', close_reason)
                    ORDER BY project_id, reason)
   FROM public.client_edition_requests
   WHERE project_id IN ('84800000-0000-4000-8000-000000000001', '84800000-0000-4000-8000-000000000002')
     AND (status = 'queued' OR close_reason IS NOT NULL)),
  '[{"p": "1", "reason": "closed", "status": "done", "close": "closed"},
    {"p": "1", "reason": "phase",  "status": "done", "close": "closed"},
    {"p": "2", "reason": "closed", "status": "done", "close": "closed"}]'::jsonb,
  'dispatcher: a closed job''s queued requests end done, close_reason closed');
SELECT is(
  (SELECT status FROM public.client_edition_requests WHERE id = '84800000-0000-4000-8000-000000000821'),
  'leased',
  'dispatcher: a closed job''s leased request is left to its lease holder');
SELECT is(
  (SELECT jsonb_agg(jsonb_build_object('reason', reason, 'status', status, 'close', close_reason))
   FROM public.client_edition_requests WHERE project_id = '84800000-0000-4000-8000-000000000004'
     AND (status = 'queued' OR close_reason IS NOT NULL)),
  '[{"reason": "phase", "status": "queued", "close": null}]'::jsonb,
  'dispatcher: an open job''s queued request waits');
SELECT is(
  (SELECT jsonb_build_object(
     'swept', (SELECT status FROM public.client_editions WHERE id = '84800000-0000-4000-8000-000000000931'),
     'recovery', (SELECT count(*) FROM public.client_edition_requests
                  WHERE project_id = '84800000-0000-4000-8000-000000000003'
                    AND reason = 'recompose_after_failed_draft'))),
  '{"swept": "failed", "recovery": 0}'::jsonb,
  'recovery: a closed job''s swept draft queues no recomposition, in any status');
SELECT is(
  (SELECT jsonb_agg(jsonb_build_object('reason', reason, 'status', status))
   FROM public.client_edition_requests WHERE project_id = '84800000-0000-4000-8000-000000000005'
     AND reason = 'recompose_after_failed_draft'),
  '[{"reason": "recompose_after_failed_draft", "status": "queued"}]'::jsonb,
  'recovery: an open job''s swept draft still gets one recomposition');

-- ─── ownership ─────────────────────────────────────────────────────────────

-- 00843's client_plate_source_owned, verbatim, as the oracle for the four
-- emitted tables.
CREATE FUNCTION pg_temp.owned_00843(
  p_project_id uuid, p_table text, p_id uuid, p_source_url text)
RETURNS boolean LANGUAGE sql STABLE SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT CASE
    WHEN COALESCE(p_table, '') NOT IN ('project_rooms', 'room_scan_images', 'project_boards')
      OR target.path ~* '^https?://' THEN true
    WHEN p_project_id IS NULL
      OR target.path ~* '(^|/)(\.|%2e){0,2}(/|$)' THEN false
    WHEN p_table = 'project_rooms' THEN
      target.path ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/.+$'
      AND lower(target.folder[1]) = p_project_id::text
    WHEN p_table = 'room_scan_images' THEN EXISTS (
      SELECT 1
      FROM public.room_scan_images AS still
      JOIN public.room_scans AS scan ON scan.id = still.scan_id
      WHERE still.id = p_id
        AND scan.project_id = p_project_id
        AND scan.user_id::text = target.folder[2]
        AND (scan.id::text = target.folder[3] OR scan.room_id::text = target.folder[3])
    )
    ELSE EXISTS (
      SELECT 1
      FROM public.proposals AS proposal
      WHERE proposal.id::text = target.folder[1]
        AND proposal.project_id = p_project_id
    )
  END
  FROM (
    SELECT address.path, storage.foldername(address.path) AS folder
    FROM (SELECT ltrim(btrim(COALESCE(p_source_url, '')), '/') AS path) AS address
  ) AS target;
$$;

INSERT INTO public.project_rooms (id, project_id, name, sort_order)
VALUES ('84800000-0000-4000-8000-000000000061', '84800000-0000-4000-8000-000000000006', 'Kitchen', 0);
INSERT INTO public.room_scans (id, user_id, name, project_id, project_room_id)
VALUES ('84800000-0000-4000-8000-000000000361', '84800000-0000-4000-8000-0000000000a1', 'Kitchen scan',
        '84800000-0000-4000-8000-000000000006', '84800000-0000-4000-8000-000000000061');
INSERT INTO public.room_scan_images (id, scan_id, role, image_url, captured_at)
VALUES ('84800000-0000-4000-8000-000000000362', '84800000-0000-4000-8000-000000000361', 'still',
        'http://127.0.0.1:54321/storage/v1/object/public/room-scans/photos/84800000-0000-4000-8000-0000000000a1/84800000-0000-4000-8000-000000000361/still-1.jpg', now());
INSERT INTO public.proposals (id, project_id, designer_id, title, status, document_kind, commercial_state, total_amount, subtotal)
VALUES ('84800000-0000-4000-8000-000000000461', '84800000-0000-4000-8000-000000000006', '84800000-0000-4000-8000-0000000000a1',
        'US49 848 Authorization', 'accepted', 'furnishings_authorization', 'executed', 30000, 30000);

CREATE TEMP TABLE owned_matrix ON COMMIT DROP AS
SELECT m.p_table, m.p_project::uuid AS p_project, m.p_id::uuid AS p_id, m.p_url,
       public.client_plate_source_owned(m.p_project::uuid, m.p_table, m.p_id::uuid, m.p_url) AS now_owned,
       pg_temp.owned_00843(m.p_project::uuid, m.p_table, m.p_id::uuid, m.p_url) AS old_owned
FROM (VALUES
  ('project_ffe_item_images', '84800000-0000-4000-8000-000000000006', '84800000-0000-4000-8000-000000000071', 'https://cdn.test/chair.jpg'),
  ('project_ffe_item_images', '84800000-0000-4000-8000-000000000006', '84800000-0000-4000-8000-000000000071', 'item-images/84800000-0000-4000-8000-000000000006/chair.jpg'),
  ('project_ffe_item_images', NULL, '84800000-0000-4000-8000-000000000071', 'item-images/chair.jpg'),
  ('project_rooms', '84800000-0000-4000-8000-000000000006', '84800000-0000-4000-8000-000000000061', '84800000-0000-4000-8000-000000000006/84800000-0000-4000-8000-000000000099/render.png'),
  ('project_rooms', '84800000-0000-4000-8000-000000000007', '84800000-0000-4000-8000-000000000061', '84800000-0000-4000-8000-000000000006/84800000-0000-4000-8000-000000000099/render.png'),
  ('project_rooms', NULL, '84800000-0000-4000-8000-000000000061', '84800000-0000-4000-8000-000000000006/84800000-0000-4000-8000-000000000099/render.png'),
  ('project_rooms', '84800000-0000-4000-8000-000000000006', '84800000-0000-4000-8000-000000000061', '84800000-0000-4000-8000-000000000006/../84800000-0000-4000-8000-000000000099/render.png'),
  ('project_rooms', '84800000-0000-4000-8000-000000000006', '84800000-0000-4000-8000-000000000061', 'https://cdn.test/render.png'),
  ('room_scan_images', '84800000-0000-4000-8000-000000000006', '84800000-0000-4000-8000-000000000362', 'photos/84800000-0000-4000-8000-0000000000a1/84800000-0000-4000-8000-000000000361/still-1.jpg'),
  ('room_scan_images', '84800000-0000-4000-8000-000000000006', '84800000-0000-4000-8000-000000000362', 'photos/84800000-0000-4000-8000-0000000000a2/84800000-0000-4000-8000-000000000361/still-1.jpg'),
  ('room_scan_images', '84800000-0000-4000-8000-000000000007', '84800000-0000-4000-8000-000000000362', 'photos/84800000-0000-4000-8000-0000000000a1/84800000-0000-4000-8000-000000000361/still-1.jpg'),
  ('room_scan_images', '84800000-0000-4000-8000-000000000006', '84800000-0000-4000-8000-000000000362', 'https://cdn.test/still-1.jpg'),
  ('project_boards', '84800000-0000-4000-8000-000000000006', '84800000-0000-4000-8000-000000000401', '84800000-0000-4000-8000-000000000461/boards/b401/cover.jpg'),
  ('project_boards', '84800000-0000-4000-8000-000000000007', '84800000-0000-4000-8000-000000000401', '84800000-0000-4000-8000-000000000461/boards/b401/cover.jpg'),
  ('project_boards', '84800000-0000-4000-8000-000000000006', '84800000-0000-4000-8000-000000000401', 'https://cdn.test/cover.jpg'),
  ('field_captures', '84800000-0000-4000-8000-000000000006', '84800000-0000-4000-8000-000000000081', '84800000-0000-4000-8000-0000000000a1/84800000-0000-4000-8000-000000000081/photo-1.jpg'),
  ('field_captures', '84800000-0000-4000-8000-000000000006', '84800000-0000-4000-8000-000000000081', 'https://cdn.test/photo-1.jpg'),
  ('some_future_table', '84800000-0000-4000-8000-000000000006', '84800000-0000-4000-8000-000000000082', 'anything/at/all.jpg'),
  (NULL, '84800000-0000-4000-8000-000000000006', NULL, 'anything/at/all.jpg')
) AS m(p_table, p_project, p_id, p_url);

SELECT is(
  (SELECT count(*)::int FROM owned_matrix
   WHERE p_table IN ('project_ffe_item_images', 'project_rooms', 'room_scan_images', 'project_boards')
     AND now_owned IS DISTINCT FROM old_owned),
  0,
  'ownership: every emitted table keeps its 00843 answer on every row of the matrix');
SELECT is(
  (SELECT jsonb_object_agg(p_table, n) FROM (
     SELECT p_table, count(*) FILTER (WHERE now_owned) AS n FROM owned_matrix
     WHERE p_table IN ('project_ffe_item_images', 'project_rooms', 'room_scan_images', 'project_boards')
     GROUP BY p_table) AS counts),
  '{"project_ffe_item_images": 3, "project_rooms": 2, "room_scan_images": 2, "project_boards": 2}'::jsonb,
  'ownership: the matrix holds owned rows for every emitted table, not only refusals');
SELECT is(
  (SELECT jsonb_agg(now_owned ORDER BY p_table NULLS LAST, p_url) FROM owned_matrix
   WHERE p_table IS NULL OR p_table NOT IN ('project_ffe_item_images', 'project_rooms', 'room_scan_images', 'project_boards')),
  '[false, false, false, false]'::jsonb,
  'ownership: field_captures (path or URL), an unknown table and no table are FALSE');
SELECT ok(
  (SELECT bool_and(old_owned) FROM owned_matrix
   WHERE p_table IS NULL OR p_table NOT IN ('project_ffe_item_images', 'project_rooms', 'room_scan_images', 'project_boards')),
  'ownership: the same four rows were TRUE under 00843 (the footgun this closes)');

-- ─── plates (R1) ───────────────────────────────────────────────────────────
-- X1 (0511) is closed P1's plate, the hero of its frozen edition 911; X4
-- (0541) is open P4's. Requests: 0601 X1's re-crop, queued before the
-- close · 0602 a first copy on P1 · 0604 X4's re-crop · 0605 X1's re-crop,
-- leased before the close. Every other queued copy is answered first, so
-- the claim sees only these.

UPDATE public.client_plate_requests SET status = 'done' WHERE status = 'queued';
INSERT INTO public.client_plate_assets (id, project_id, sha256, source_kind, source_ref, original_key,
                                        width, height, crops, focal, subject_box, focal_origin, flags,
                                        perceived_alt)
VALUES
  ('84800000-0000-4000-8000-000000000511', '84800000-0000-4000-8000-000000000001', repeat('a', 64), 'upload',
   '{"table": "project_files", "id": "84800000-0000-4000-8000-000000000511"}'::jsonb,
   'plates/84800000-0000-4000-8000-000000000001/' || repeat('a', 64) || '/original.jpg', 1600, 1200,
   '{"wide": {"rect": [0, 0, 1600, 1000], "widths": [800]}}'::jsonb, '{0.5,0.5}', '{0.1,0.1,0.8,0.8}',
   'model', '{}', 'A kitchen'),
  ('84800000-0000-4000-8000-000000000541', '84800000-0000-4000-8000-000000000004', repeat('b', 64), 'upload',
   '{"table": "project_files", "id": "84800000-0000-4000-8000-000000000541"}'::jsonb,
   'plates/84800000-0000-4000-8000-000000000004/' || repeat('b', 64) || '/original.jpg', 1600, 1200,
   '{"wide": {"rect": [0, 0, 1600, 1000], "widths": [800]}}'::jsonb, '{0.5,0.5}', '{0.1,0.1,0.8,0.8}',
   'model', '{}', NULL);
INSERT INTO public.client_edition_images (edition_id, asset_id, plate_role, crop_key, rank)
VALUES ('84800000-0000-4000-8000-000000000911', '84800000-0000-4000-8000-000000000511', 'hero', 'wide', 1);
INSERT INTO public.client_plate_requests (id, project_id, source_kind, source_ref, source_url, status,
                                          lease_token, lease_expires_at, attempts, asset_id)
SELECT request.id::uuid, request.project_id::uuid, 'upload',
       jsonb_build_object('table', 'project_files', 'id', request.id), request.url, request.status,
       request.token::uuid, CASE WHEN request.token IS NOT NULL THEN now() + interval '10 minutes' END,
       CASE WHEN request.token IS NOT NULL THEN 1 ELSE 0 END, request.asset_id::uuid
FROM (VALUES
  ('84800000-0000-4000-8000-000000000601', '84800000-0000-4000-8000-000000000001', 'https://img.test/x1.jpg',
   'queued', NULL, '84800000-0000-4000-8000-000000000511'),
  ('84800000-0000-4000-8000-000000000602', '84800000-0000-4000-8000-000000000001', 'https://img.test/new.jpg',
   'queued', NULL, NULL),
  ('84800000-0000-4000-8000-000000000604', '84800000-0000-4000-8000-000000000004', 'https://img.test/x4.jpg',
   'queued', NULL, '84800000-0000-4000-8000-000000000541'),
  ('84800000-0000-4000-8000-000000000605', '84800000-0000-4000-8000-000000000001', 'https://img.test/x1b.jpg',
   'leased', '84800000-0000-4000-8000-000000000705', '84800000-0000-4000-8000-000000000511')
) AS request(id, project_id, url, status, token, asset_id);

CREATE TEMP TABLE x1_before AS
SELECT focal, subject_box, focal_origin, crops, original_key, width, height, flags, perceived_alt
FROM public.client_plate_assets WHERE id = '84800000-0000-4000-8000-000000000511';

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"84800000-0000-4000-8000-0000000000a1","role":"authenticated"}';
SELECT throws_ok($$SELECT public.set_plate_focal('84800000-0000-4000-8000-000000000511',
                                                 '{0.2,0.2,0.4,0.4}', '{0.3,0.3}')$$,
                 '55000', 'client_edition_frozen: this job is closed; its pictures no longer change',
                 'plates: a late focal save on a closed job is refused');
RESET ROLE;
SET LOCAL ROLE service_role;
SELECT throws_ok($$SELECT public.record_plate_perception('84800000-0000-4000-8000-000000000511',
                                                         '{0.2,0.2,0.5,0.5}', '{0.4,0.4}', '{people}',
                                                         'Someone in a kitchen', 'v9')$$,
                 '55000', 'client_edition_frozen: this job is closed; its pictures no longer change',
                 'plates: a perception of a closed job''s plate is refused');
RESET ROLE;

CREATE TEMP TABLE plate_claimed AS
SELECT id, lease_token FROM public.claim_client_plate_requests(50);
SELECT is(
  (SELECT jsonb_build_object('status', status, 'close', close_reason, 'error', last_error,
                             'leased', lease_token IS NOT NULL, 'asset', asset_id)
   FROM public.client_plate_requests WHERE id = '84800000-0000-4000-8000-000000000601'),
  '{"status": "done", "close": "closed", "error": null, "leased": false,
    "asset": "84800000-0000-4000-8000-000000000511"}'::jsonb,
  'plates: a re-crop queued before the close ends done, close_reason closed, no error, never leased');
SELECT is(
  (SELECT jsonb_agg(right(id::text, 4) ORDER BY id) FROM plate_claimed),
  '["0602", "0604"]'::jsonb,
  'plates: the claim still leases a first copy on the closed job and an open job''s re-crop');

SELECT is(
  public.record_client_plate_asset('84800000-0000-4000-8000-000000000605', '84800000-0000-4000-8000-000000000705',
    jsonb_build_object('sha256', repeat('a', 64),
                       'originalKey', 'plates/84800000-0000-4000-8000-000000000001/' || repeat('a', 64) || '/original.jpg',
                       'width', 1600, 'height', 1200,
                       'crops', '{"wide": {"rect": [200, 0, 1400, 1000], "widths": [800, 1200]}}'::jsonb)),
  '84800000-0000-4000-8000-000000000511'::uuid,
  'plates: a re-crop leased before the close settles onto the same plate');
SELECT is(
  (SELECT jsonb_build_object('status', status, 'close', close_reason, 'asset', asset_id)
   FROM public.client_plate_requests WHERE id = '84800000-0000-4000-8000-000000000605'),
  '{"status": "done", "close": "closed", "asset": "84800000-0000-4000-8000-000000000511"}'::jsonb,
  'plates: that settlement closes its request closed');

CREATE TEMP TABLE first_copy AS
SELECT public.record_client_plate_asset(claimed.id, claimed.lease_token,
         jsonb_build_object('sha256', repeat('c', 64),
                            'originalKey', 'plates/84800000-0000-4000-8000-000000000001/' || repeat('c', 64) || '/original.jpg',
                            'width', 800, 'height', 600, 'crops', '{}'::jsonb)) AS asset_id
FROM plate_claimed AS claimed WHERE claimed.id = '84800000-0000-4000-8000-000000000602';
SELECT ok(
  (SELECT asset.sha256 = repeat('c', 64) AND asset.project_id = '84800000-0000-4000-8000-000000000001'
   FROM first_copy JOIN public.client_plate_assets AS asset ON asset.id = first_copy.asset_id)
  AND (SELECT status = 'done' AND close_reason IS NULL
       FROM public.client_plate_requests WHERE id = '84800000-0000-4000-8000-000000000602'),
  'plates: a first copy of new bytes on the closed job still lands as a new plate');
SELECT is(
  (SELECT to_jsonb(now_row) FROM (
     SELECT focal, subject_box, focal_origin, crops, original_key, width, height, flags, perceived_alt
     FROM public.client_plate_assets WHERE id = '84800000-0000-4000-8000-000000000511') AS now_row),
  (SELECT to_jsonb(x1_before) FROM x1_before),
  'plates: the frozen edition''s plate keeps its framing, crops and perception through all of it');

-- ─── band (R6) ─────────────────────────────────────────────────────────────

SET LOCAL ROLE authenticated;
SELECT is(
  jsonb_build_object('closed', public.list_client_editions('84800000-0000-4000-8000-000000000001') -> 'projectClosed',
                     'open', public.list_client_editions('84800000-0000-4000-8000-000000000004') -> 'projectClosed'),
  '{"closed": true, "open": false}'::jsonb,
  'band: list_client_editions answers projectClosed');
SELECT throws_ok($$SELECT public.hold_client_edition('84800000-0000-4000-8000-000000000921')$$,
                 '55000', 'client_edition_frozen: this job is closed; its editions no longer change',
                 'band: hold on a closed job is refused');
RESET ROLE;

-- ─── snapshot (R4) ─────────────────────────────────────────────────────────
-- P8 and P9 each have an approved edition and close through the real
-- close_project as their designer: P8 with a snapshot, P9 without.

INSERT INTO public.client_editions (id, project_id, seq, status, kind, approved_at, facts, created_at)
VALUES
  ('84800000-0000-4000-8000-000000000981', '84800000-0000-4000-8000-000000000008', 1, 'approved', 'full',
   now() - interval '1 day', '{}'::jsonb, now() - interval '1 day'),
  ('84800000-0000-4000-8000-000000000991', '84800000-0000-4000-8000-000000000009', 1, 'approved', 'full',
   now() - interval '1 day', '{}'::jsonb, now() - interval '1 day');

SET LOCAL ROLE authenticated;
SELECT lives_ok($$SELECT public.close_project('84800000-0000-4000-8000-000000000008',
  '[{"key":"walkthrough","completed":true},{"key":"punch_list","completed":true},{"key":"payment","completed":true},
    {"key":"photography","completed":true},{"key":"photos","completed":true},{"key":"case_study","completed":true}]'::jsonb,
  '{"headline": "Eight", "value_cents": 8000}'::jsonb)$$,
  'snapshot: the real close_project closes a job with a snapshot');
RESET ROLE;
SELECT is(
  (SELECT facts -> 'portfolioSnapshotRef' ->> 'sha256' FROM public.client_editions
   WHERE id = '84800000-0000-4000-8000-000000000981'),
  encode(sha256(convert_to('{"headline": "Eight", "value_cents": 8000}'::jsonb::text, 'UTF8')), 'hex'),
  'snapshot: the close froze the approved edition with the snapshot''s hash');
SET LOCAL ROLE authenticated;
SELECT lives_ok($$SELECT public.close_project('84800000-0000-4000-8000-000000000008',
  '[{"key":"walkthrough","completed":true},{"key":"punch_list","completed":true},{"key":"payment","completed":true},
    {"key":"photography","completed":true},{"key":"photos","completed":true},{"key":"case_study","completed":true}]'::jsonb,
  '{"value_cents": 8000, "headline": "Eight"}'::jsonb)$$,
  'snapshot: closing again with the same snapshot is allowed');
RESET ROLE;
SELECT is(
  (SELECT jsonb_build_object('sha256', edition.facts -> 'portfolioSnapshotRef' ->> 'sha256',
                             'snapshot', project.portfolio_snapshot)
   FROM public.client_editions AS edition
   JOIN public.projects AS project ON project.id = edition.project_id
   WHERE edition.id = '84800000-0000-4000-8000-000000000981'),
  jsonb_build_object(
    'sha256', encode(sha256(convert_to('{"headline": "Eight", "value_cents": 8000}'::jsonb::text, 'UTF8')), 'hex'),
    'snapshot', '{"headline": "Eight", "value_cents": 8000}'::jsonb),
  'snapshot: the same snapshot again changes neither the snapshot nor the frozen hash');
SET LOCAL ROLE authenticated;
SELECT throws_ok($$SELECT public.close_project('84800000-0000-4000-8000-000000000008',
  '[{"key":"walkthrough","completed":true},{"key":"punch_list","completed":true},{"key":"payment","completed":true},
    {"key":"photography","completed":true},{"key":"photos","completed":true},{"key":"case_study","completed":true}]'::jsonb,
  '{"headline": "Eight, rewritten", "value_cents": 9000}'::jsonb)$$,
  '55000', 'client_edition_frozen: this job is closed out; its portfolio snapshot no longer changes',
  'snapshot: a later close with a different snapshot is refused');
SELECT lives_ok($$SELECT public.close_project('84800000-0000-4000-8000-000000000009',
  '[{"key":"walkthrough","completed":true},{"key":"punch_list","completed":true},{"key":"payment","completed":true},
    {"key":"photography","completed":true},{"key":"photos","completed":true},{"key":"case_study","completed":true}]'::jsonb,
  NULL)$$,
  'snapshot: the real close_project closes a job without a snapshot');
SELECT throws_ok($$SELECT public.close_project('84800000-0000-4000-8000-000000000009',
  '[{"key":"walkthrough","completed":true},{"key":"punch_list","completed":true},{"key":"payment","completed":true},
    {"key":"photography","completed":true},{"key":"photos","completed":true},{"key":"case_study","completed":true}]'::jsonb,
  '{"headline": "Nine"}'::jsonb)$$,
  '55000', 'client_edition_frozen: this job is closed out; its portfolio snapshot no longer changes',
  'snapshot: a later close that adds a snapshot the frozen edition did not have is refused');
RESET ROLE;

-- ─── archived (R5) ─────────────────────────────────────────────────────────
-- P10 was completed, then archived; P11 was archived from active. Each gets
-- an approved edition only afterwards, as one approved before this
-- migration would have stood.

SELECT pg_temp.close_job('84800000-0000-4000-8000-000000000010', '{"headline": "Ten"}'::jsonb);
SET LOCAL ROLE authenticated;
SELECT status FROM public.archive_project('84800000-0000-4000-8000-000000000010', 'completed');
SELECT status FROM public.archive_project('84800000-0000-4000-8000-000000000011', 'active');
RESET ROLE;
INSERT INTO public.client_editions (id, project_id, seq, status, kind, approved_at, facts, created_at)
VALUES
  ('84800000-0000-4000-8000-000000001001', '84800000-0000-4000-8000-000000000010', 1, 'approved', 'full',
   now() - interval '1 day', '{}'::jsonb, now() - interval '1 day'),
  ('84800000-0000-4000-8000-000000001101', '84800000-0000-4000-8000-000000000011', 1, 'approved', 'full',
   now() - interval '1 day', '{}'::jsonb, now() - interval '1 day');
SELECT public._client_edition_freeze('84800000-0000-4000-8000-000000000010');
SELECT public._client_edition_freeze('84800000-0000-4000-8000-000000000011');
SELECT is(
  (SELECT jsonb_object_agg(right(project_id::text, 2), jsonb_build_object(
            'frozen', frozen_at IS NOT NULL,
            'present', facts -> 'portfolioSnapshotRef' -> 'present'))
   FROM public.client_editions
   WHERE id IN ('84800000-0000-4000-8000-000000001001', '84800000-0000-4000-8000-000000001101')),
  '{"10": {"frozen": true, "present": true}, "11": {"frozen": false, "present": null}}'::jsonb,
  'archived: a job completed then archived freezes; one archived without a close does not');

SELECT * FROM finish(true);
ROLLBACK;
