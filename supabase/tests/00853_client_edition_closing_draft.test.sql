-- 00853 / SQ-1748: closing lane state-machine regressions. Rolled back.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT no_plan();
SET LOCAL statement_timeout = '45s';
-- Real close/claim/begin overlap. Native dblink sessions, finite server deadlines.
CREATE EXTENSION IF NOT EXISTS dblink WITH SCHEMA extensions;
CREATE TEMP TABLE closing_lifecycle_results (name text, passed boolean, detail text);
CREATE FUNCTION pg_temp.act(p_sql text) RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT format($do$DO $call$ BEGIN %s;
    PERFORM set_config('sq1748.result', 'ok', true);
    EXCEPTION WHEN OTHERS THEN PERFORM set_config('sq1748.result', SQLSTATE || ': ' || SQLERRM, true);
    END $call$;$do$, p_sql);
$$;
CREATE FUNCTION pg_temp.outcome(p_conn text) RETURNS text LANGUAGE sql AS $$
  SELECT x FROM extensions.dblink(p_conn, 'SELECT current_setting(''sq1748.result'', true)') AS r(x text);
$$;
CREATE FUNCTION pg_temp.settle(p_conn text) RETURNS text LANGUAGE plpgsql AS $$
BEGIN
  PERFORM * FROM extensions.dblink_get_result(p_conn) AS r(x text);
  PERFORM * FROM extensions.dblink_get_result(p_conn) AS r(x text);
  RETURN pg_temp.outcome(p_conn);
END;
$$;
CREATE FUNCTION pg_temp.blockers(p_pid integer, p_conn text) RETURNS integer[] LANGUAGE plpgsql AS $$
DECLARE v_pids integer[];
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
  v_dsn text := format('host=%s port=54322 dbname=%s user=postgres password=postgres connect_timeout=5',
    host(network(set_masklen(inet_server_addr(), 16)) + 1), current_database());
  v_closeout text := '[{"key":"walkthrough","completed":true},{"key":"punch_list","completed":true},{"key":"payment","completed":true},{"key":"photography","completed":true},{"key":"photos","completed":true},{"key":"case_study","completed":true}]';
  v_actor uuid := gen_random_uuid(); v_project uuid := gen_random_uuid(); v_org uuid;
  v_a int; v_b int; v_c int; v_b_waits int[]; v_a_waits int[];
  v_request uuid; v_token uuid; v_edition uuid; v_ok boolean;
  v_a_result text; v_b_result text; v_conn text; v_detail text := '';
BEGIN
  FOREACH v_conn IN ARRAY ARRAY['sq1748_a','sq1748_b','sq1748_c'] LOOP
    PERFORM extensions.dblink_connect(v_conn, v_dsn);
    PERFORM extensions.dblink_exec(v_conn, 'SET statement_timeout = ''12s''; SET lock_timeout = ''5s''');
  END LOOP;
  BEGIN
    PERFORM extensions.dblink_exec('sq1748_c', format($fixture$
      INSERT INTO auth.users(id,email,encrypted_password,email_confirmed_at,created_at,updated_at,instance_id,aud,role)
      VALUES (%1$L,'sq1748-' || %1$L || '@test.invalid','',now(),now(),now(),'00000000-0000-0000-0000-000000000000','authenticated','authenticated');
      INSERT INTO public.profiles(id,email,full_name,is_designer)
      VALUES (%1$L,'sq1748-' || %1$L || '@test.invalid','SQ1748 Designer',true)
      ON CONFLICT(id) DO UPDATE SET is_designer=true;
    $fixture$,v_actor));
    SELECT id INTO v_org FROM extensions.dblink('sq1748_c',format('SELECT public._primary_studio_for(%L)',v_actor)) AS r(id uuid);
    PERFORM extensions.dblink_exec('sq1748_c',format(
      'INSERT INTO public.projects(id,name,designer_id,created_by,studio_id,status) VALUES (%L,''SQ1748 lifecycle'',%L,%L,%L,''active'')',v_project,v_actor,v_actor,v_org));
    SELECT pid INTO v_a FROM extensions.dblink('sq1748_a','SELECT pg_backend_pid()') AS r(pid int);
    SELECT pid INTO v_b FROM extensions.dblink('sq1748_b','SELECT pg_backend_pid()') AS r(pid int);
    SELECT pid INTO v_c FROM extensions.dblink('sq1748_c','SELECT pg_backend_pid()') AS r(pid int);
    PERFORM extensions.dblink_exec('sq1748_a','SET ROLE authenticated');
    PERFORM * FROM extensions.dblink('sq1748_a',format('SELECT set_config(''request.jwt.claims'',%L,false)',jsonb_build_object('sub',v_actor,'role','authenticated')::text)) AS r(x text);
    -- Protect unrelated queue rows from this claim without mutating their state.
    PERFORM extensions.dblink_exec('sq1748_c','BEGIN');
    PERFORM * FROM extensions.dblink('sq1748_c',format('SELECT id FROM public.client_edition_requests WHERE project_id <> %L FOR UPDATE',v_project)) AS r(id uuid);
    PERFORM extensions.dblink_exec('sq1748_a','BEGIN');
    PERFORM extensions.dblink_exec('sq1748_a',pg_temp.act(format('PERFORM public.close_project(%L,%L::jsonb,''{"headline":"SQ1748 captured"}''::jsonb)',v_project,v_closeout)));
    INSERT INTO closing_lifecycle_results VALUES ('concurrent: real close succeeds',pg_temp.outcome('sq1748_a')='ok','');
    PERFORM extensions.dblink_exec('sq1748_b','BEGIN');
    SELECT passed INTO v_ok FROM extensions.dblink('sq1748_b',format('SELECT count(*)=0 FROM public.claim_client_edition_requests(20) WHERE project_id=%L',v_project)) AS r(passed boolean);
    INSERT INTO closing_lifecycle_results VALUES ('concurrent: claim skips a real close holding the project row',v_ok,'');
    PERFORM extensions.dblink_exec('sq1748_b','ROLLBACK');
    PERFORM extensions.dblink_exec('sq1748_a','COMMIT');
    PERFORM * FROM extensions.dblink('sq1748_c',format('SELECT pg_advisory_xact_lock(hashtextextended(%L,0))::text','client_editions:' || v_project)) AS r(x text);
    PERFORM extensions.dblink_exec('sq1748_b','BEGIN');
    SELECT id,lease_token INTO v_request,v_token FROM extensions.dblink('sq1748_b',format('SELECT id,lease_token FROM public.claim_client_edition_requests(20) WHERE project_id=%L AND closing',v_project)) AS r(id uuid,lease_token uuid);
    IF v_request IS NULL THEN RAISE EXCEPTION 'committed closing request was not claimed'; END IF;
    PERFORM extensions.dblink_send_query('sq1748_b',pg_temp.act(format('PERFORM public.begin_client_edition(%L,%L)',v_request,v_token)));
    v_b_waits := pg_temp.blockers(v_b,'sq1748_b');
    PERFORM extensions.dblink_exec('sq1748_a','BEGIN');
    PERFORM extensions.dblink_send_query('sq1748_a',pg_temp.act(format('PERFORM public.close_project(%L,%L::jsonb,''{"headline":"SQ1748 captured"}''::jsonb)',v_project,v_closeout)));
    v_a_waits := pg_temp.blockers(v_a,'sq1748_a');
    INSERT INTO closing_lifecycle_results VALUES ('concurrent: closing begin holds project before advisory and real re-close waits',v_c=ANY(v_b_waits) AND v_b=ANY(v_a_waits),format('begin blockers=%s close blockers=%s',v_b_waits,v_a_waits));
    PERFORM extensions.dblink_exec('sq1748_c','COMMIT');
    v_b_result := pg_temp.settle('sq1748_b');
    PERFORM extensions.dblink_exec('sq1748_b','COMMIT');
    v_a_result := pg_temp.settle('sq1748_a');
    PERFORM extensions.dblink_exec('sq1748_a','COMMIT');
    INSERT INTO closing_lifecycle_results VALUES ('concurrent: closing begin and real re-close finish without deadlock',v_b_result='ok' AND v_a_result='ok',format('begin=%s close=%s',v_b_result,v_a_result));
    SELECT passed INTO v_ok FROM extensions.dblink('sq1748_c',format($state$
      SELECT (SELECT count(*)=1 FROM public.client_editions WHERE project_id=%1$L AND closing AND status='drafting')
        AND (SELECT count(*)=1 FROM public.client_edition_requests WHERE project_id=%1$L AND closing AND status='done')
        AND (SELECT portfolio_snapshot='{"headline":"SQ1748 captured"}'::jsonb FROM public.projects WHERE id=%1$L)
    $state$,v_project)) AS r(passed boolean);
    INSERT INTO closing_lifecycle_results VALUES ('concurrent: exactly one closing draft and immutable snapshot survive',COALESCE(v_ok,false),'');
  EXCEPTION WHEN OTHERS THEN v_detail := SQLSTATE || ': ' || SQLERRM;
  END;
  FOREACH v_conn IN ARRAY ARRAY['sq1748_a','sq1748_b','sq1748_c'] LOOP
    IF extensions.dblink_is_busy(v_conn)=1 THEN PERFORM extensions.dblink_cancel_query(v_conn); END IF;
    BEGIN
      PERFORM * FROM extensions.dblink_get_result(v_conn,false) AS r(x text);
      PERFORM * FROM extensions.dblink_get_result(v_conn,false) AS r(x text);
    EXCEPTION WHEN OTHERS THEN NULL; END;
    PERFORM extensions.dblink_exec(v_conn,'ROLLBACK; RESET ROLE');
  END LOOP;
  PERFORM extensions.dblink_exec('sq1748_c',format($cleanup$
    SET app.ffe_mutation_rpc='on';
    DELETE FROM public.client_edition_requests WHERE project_id=%1$L;
    DELETE FROM public.projects WHERE id=%1$L;
    DELETE FROM public.audit_logs WHERE user_id=%2$L OR organization_id=%3$L;
    SET ROLE service_role; DELETE FROM public.organizations WHERE id=%3$L; RESET ROLE;
    DELETE FROM public.profiles WHERE id=%2$L; DELETE FROM auth.users WHERE id=%2$L;
  $cleanup$,v_project,v_actor,v_org));
  FOREACH v_conn IN ARRAY ARRAY['sq1748_a','sq1748_b','sq1748_c'] LOOP
    PERFORM extensions.dblink_disconnect(v_conn);
  END LOOP;
  IF v_detail<>'' THEN RAISE EXCEPTION 'closing lifecycle: %',v_detail; END IF;
END;
$test$;
SELECT diag(detail) FROM closing_lifecycle_results WHERE detail<>'';
SELECT ok(passed,name) FROM closing_lifecycle_results;

CREATE TEMP TABLE temp_schema_owner(id int);
DO $$ BEGIN
  EXECUTE format('GRANT USAGE ON SCHEMA %s TO service_role, authenticated', pg_my_temp_schema()::regnamespace);
  EXECUTE format('GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA %s TO service_role, authenticated', pg_my_temp_schema()::regnamespace);
END $$;
INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, instance_id, aud, role)
VALUES
  ('85300000-0000-4000-8000-0000000000a1', 'us49-853-owner@test.invalid',  '', now(), now(), now(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('85300000-0000-4000-8000-0000000000a2', 'us49-853-client@test.invalid', '', now(), now(), now(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');
INSERT INTO public.profiles (id, email, full_name, is_designer, created_at, updated_at)
VALUES
  ('85300000-0000-4000-8000-0000000000a1', 'us49-853-owner@test.invalid',  'US49 853 Owner',  true,  now(), now()),
  ('85300000-0000-4000-8000-0000000000a2', 'us49-853-client@test.invalid', 'US49 853 Client', false, now(), now())
ON CONFLICT (id) DO UPDATE
SET email = EXCLUDED.email, full_name = EXCLUDED.full_name, is_designer = EXCLUDED.is_designer;
INSERT INTO public.organizations (id, type, name, slug, address)
VALUES ('85300000-0000-4000-8000-0000000000f1', 'design_studio', 'US49 853 Studio', 'us49-853-studio-test',
        '{"city": "Hudson"}'::jsonb);
INSERT INTO public.organization_members (id, user_id, organization_id, role, status, joined_at)
VALUES ('85300000-0000-4000-8000-0000000000e1', '85300000-0000-4000-8000-0000000000a1',
        '85300000-0000-4000-8000-0000000000f1', 'owner', 'active', now());
INSERT INTO public.projects (id, name, designer_id, client_id, created_by, studio_id, status, show_makers)
SELECT ('85300000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid, 'US49 853 House ' || n,
       '85300000-0000-4000-8000-0000000000a1', '85300000-0000-4000-8000-0000000000a2',
       '85300000-0000-4000-8000-0000000000a1', '85300000-0000-4000-8000-0000000000f1', 'active', false
FROM generate_series(1, 11) AS n;


UPDATE public.llm_feature_controls SET enabled = false WHERE feature = 'client-edition-compose';
UPDATE public.client_edition_requests SET status = 'done', lease_token = NULL, lease_expires_at = NULL WHERE status IN ('queued','leased');
UPDATE public.projects SET show_makers = true WHERE id = '85300000-0000-4000-8000-000000000001';
CREATE FUNCTION pg_temp.close_job(p_id uuid, p_snapshot jsonb) RETURNS void LANGUAGE sql AS $$
  SELECT public.close_project(p_id,
    '[{"key":"walkthrough","completed":true},{"key":"punch_list","completed":true},{"key":"payment","completed":true},{"key":"photography","completed":true},{"key":"photos","completed":true},{"key":"case_study","completed":true}]', p_snapshot);
$$;
GRANT EXECUTE ON FUNCTION pg_temp.close_job(uuid,jsonb) TO authenticated;
SET LOCAL request.jwt.claims = '{"sub":"85300000-0000-4000-8000-0000000000a1","role":"authenticated"}';
SET LOCAL ROLE authenticated;
SELECT lives_ok($$SELECT pg_temp.close_job('85300000-0000-4000-8000-000000000001', '{"description":"PRIVATE DESCRIPTION","value_cents":123456}')$$, 'closing: real close enqueues the final request');
SELECT lives_ok($$SELECT pg_temp.close_job('85300000-0000-4000-8000-000000000001', '{"value_cents":123456,"description":"PRIVATE DESCRIPTION"}')$$, 'closing: same close is idempotent');
SELECT throws_ok($$SELECT pg_temp.close_job('85300000-0000-4000-8000-000000000001', '{"description":"REWRITTEN"}')$$, '55000', NULL, 'closing: snapshot cannot be replaced before any approval');
SELECT lives_ok($$SELECT public.archive_project('85300000-0000-4000-8000-000000000001','completed')$$, 'closing: archive after completion is allowed');
SELECT lives_ok($$SELECT public.archive_project('85300000-0000-4000-8000-000000000002','active')$$, 'closing: archive from active also queues a final issue');
RESET ROLE;
SELECT is((SELECT count(*) FROM public.client_edition_requests WHERE closing AND project_id = '85300000-0000-4000-8000-000000000001'), 1::bigint, 'closing: repeated close and archive have one request total');
SELECT is((SELECT count(*) FROM public.client_edition_requests WHERE closing AND project_id = '85300000-0000-4000-8000-000000000002'), 1::bigint, 'closing: active archive has one request');
SELECT ok((SELECT closing_facts -> 'portfolio_snapshot' = '{"description":"PRIVATE DESCRIPTION","value_cents":123456}'::jsonb AND closing_facts #>> '{project,phase}' = 'final_walkthrough' FROM public.client_edition_requests WHERE closing AND project_id = '85300000-0000-4000-8000-000000000001'), 'closing: private portfolio and editorial facts captured at close');
SET LOCAL ROLE authenticated;

RESET ROLE;
UPDATE public.projects SET show_makers = false, name = 'Changed live title' WHERE id = '85300000-0000-4000-8000-000000000001';
CREATE TEMP TABLE claimed AS SELECT * FROM public.claim_client_edition_requests(20);
SELECT is((SELECT count(*) FROM claimed WHERE closing), 2::bigint, 'closing: closed jobs are claimed in the narrow final lane');
SELECT ok((SELECT closing_facts #>> '{project,showMakers}' = 'false' AND closing_facts #>> '{project,name}' <> 'Changed live title' FROM claimed WHERE project_id = '85300000-0000-4000-8000-000000000001'), 'closing: maker withdrawal stays live while editorial facts stay captured');
CREATE TEMP TABLE begun AS SELECT project_id, lease_token, public.begin_client_edition(id,lease_token) AS id FROM claimed WHERE closing;
RESET ROLE;
SELECT ok((SELECT bool_and(edition.closing AND edition.status = 'drafting' AND edition.facts ->> 'closing' = 'true') FROM begun JOIN public.client_editions AS edition USING(id)), 'closing: begin opens only the SQL-marked captured draft');
GRANT SELECT ON begun TO service_role, authenticated;
SELECT is(public.finish_client_edition((SELECT id FROM begun WHERE project_id = '85300000-0000-4000-8000-000000000001'), (SELECT lease_token FROM begun WHERE project_id = '85300000-0000-4000-8000-000000000001'), 'approved','plates_only','{"sourceHash":"close-hash","chapters":[],"hero":null}', '{}','[]','closing-test','deterministic',0,NULL), 'awaiting_review', 'closing: even an attempted plates-only auto-publish waits for review');
RESET ROLE;
SELECT ok((SELECT status = 'awaiting_review' AND kind = 'full' AND NOT auto_published AND frozen_at IS NULL AND facts -> 'portfolio_snapshot' ->> 'description' = 'PRIVATE DESCRIPTION' FROM public.client_editions WHERE id = (SELECT id FROM begun WHERE project_id = '85300000-0000-4000-8000-000000000001')), 'closing: awaiting draft retains SQL snapshot and is not published or frozen');
SET LOCAL ROLE authenticated;
SELECT ok(public.list_client_editions('85300000-0000-4000-8000-000000000001') #>> '{editions,0,closing}' = 'true' AND public.list_client_editions('85300000-0000-4000-8000-000000000001')::text NOT LIKE '%PRIVATE DESCRIPTION%', 'closing: Press band gets only the marker, never the portfolio snapshot');
SELECT lives_ok($$SELECT public.hold_client_edition((SELECT id FROM begun WHERE project_id = '85300000-0000-4000-8000-000000000001'))$$, 'closing: designer can hold without publishing');
SELECT lives_ok($$SELECT public.approve_client_edition((SELECT id FROM begun WHERE project_id = '85300000-0000-4000-8000-000000000001'))$$, 'closing: designer approval publishes the final issue');
RESET ROLE;
SELECT ok((SELECT status = 'approved' AND frozen_at IS NOT NULL AND NOT auto_published AND facts -> 'portfolioSnapshotRef' ->> 'present' = 'true' FROM public.client_editions WHERE id = (SELECT id FROM begun WHERE project_id = '85300000-0000-4000-8000-000000000001')), 'closing: approval freezes the final issue');
SET LOCAL ROLE authenticated;
SELECT throws_ok($$SELECT public.undo_client_edition((SELECT id FROM begun WHERE project_id = '85300000-0000-4000-8000-000000000001'))$$, '55000', NULL, 'closing: approved final issue cannot be undone');
SELECT throws_ok($$SELECT public.hold_client_edition((SELECT id FROM begun WHERE project_id = '85300000-0000-4000-8000-000000000001'))$$, '55000', NULL, 'closing: published final issue cannot be held');
RESET ROLE;

-- Ordinary closed-job writers still refuse, and a lost final lease reuses one row.
SELECT throws_ok($$SELECT public.begin_client_edition((SELECT id FROM claimed WHERE project_id='85300000-0000-4000-8000-000000000001'), (SELECT lease_token FROM claimed WHERE project_id='85300000-0000-4000-8000-000000000001'))$$,'55000',NULL,'closing: replaying a consumed request cannot open a second draft');
INSERT INTO public.client_edition_requests(id,project_id,reason,debounce_key,status,lease_token,lease_expires_at)
VALUES ('85300000-0000-4000-8000-000000000900','85300000-0000-4000-8000-000000000002','phase','853-normal-closed','leased','85300000-0000-4000-8000-000000000901',now()+interval '10 minutes');
SELECT throws_ok($$SELECT public.begin_client_edition('85300000-0000-4000-8000-000000000900','85300000-0000-4000-8000-000000000901')$$,'55000',NULL,'closing: ordinary leased request on closed project still refuses');
UPDATE public.client_edition_requests SET status='done', lease_token=NULL, lease_expires_at=NULL WHERE id='85300000-0000-4000-8000-000000000900';
UPDATE public.client_editions SET lease_expires_at=now()-interval '1 second' WHERE id=(SELECT id FROM begun WHERE project_id='85300000-0000-4000-8000-000000000002');
SELECT public.dispatch_client_edition_compose();
SELECT ok((SELECT status='queued' AND attempts=1 FROM public.client_edition_requests WHERE closing AND project_id='85300000-0000-4000-8000-000000000002'),'closing: expired final draft requeues the same closing request');
CREATE TEMP TABLE retried AS SELECT request.id AS request_id,request.lease_token,public.begin_client_edition(request.id,request.lease_token) AS edition_id FROM public.claim_client_edition_requests(20) AS request WHERE request.closing;
SELECT is((SELECT edition_id FROM retried WHERE request_id=(SELECT id FROM claimed WHERE project_id='85300000-0000-4000-8000-000000000002')),(SELECT id FROM begun WHERE project_id='85300000-0000-4000-8000-000000000002'),'closing: retry reuses the one closing edition identity');
SELECT is((SELECT count(*) FROM public.client_editions WHERE closing AND project_id='85300000-0000-4000-8000-000000000002'),1::bigint,'closing: retry never adds another final issue');
SELECT throws_ok($$SELECT public.finish_client_edition((SELECT id FROM begun WHERE project_id='85300000-0000-4000-8000-000000000002'),(SELECT lease_token FROM begun WHERE project_id='85300000-0000-4000-8000-000000000002'),'awaiting_review','full','{}','{}','[]','test','test',0,NULL)$$,'55000',NULL,'closing: old lease cannot finish the retried closing edition');
-- Reported failures use the same bounded retry as a lost lease.
SELECT is(public.finish_client_edition((SELECT edition_id FROM retried), (SELECT lease_token FROM retried), 'failed','full','{}','{}','[]','test','test',0,'provenance read timed out'), 'failed', 'closing: a reported second-attempt failure is recorded');
SELECT public.dispatch_client_edition_compose();
SELECT ok((SELECT status='queued' AND attempts=2 FROM public.client_edition_requests WHERE id=(SELECT request_id FROM retried)), 'closing: reported failure requeues the same request below the retry budget');
CREATE TEMP TABLE final_attempt AS SELECT request.id AS request_id,request.lease_token,public.begin_client_edition(request.id,request.lease_token) AS edition_id FROM public.claim_client_edition_requests(20) AS request WHERE request.closing;
SELECT is((SELECT edition_id FROM final_attempt), (SELECT edition_id FROM retried), 'closing: reported failure retry reuses the same edition identity');
SELECT lives_ok($$SELECT public.finish_client_edition((SELECT edition_id FROM final_attempt), (SELECT lease_token FROM final_attempt), 'failed','full','{}','{}','[]','test','test',0,'settlement unavailable')$$, 'closing: the third reported failure is recorded');
SELECT public.dispatch_client_edition_compose();
SELECT ok((SELECT status='failed' AND attempts=3 FROM public.client_edition_requests WHERE id=(SELECT request_id FROM retried)), 'closing: the third failure makes the request terminal');
SELECT public.dispatch_client_edition_compose();
SELECT is((SELECT count(*) FROM public.claim_client_edition_requests(20) WHERE closing), 0::bigint, 'closing: terminal reported failures never loop');
SELECT is((SELECT count(*) FROM public.client_editions WHERE closing AND project_id='85300000-0000-4000-8000-000000000002'), 1::bigint, 'closing: reported retries never create another closing edition');
SELECT is((SELECT count(*) FROM public.client_edition_requests WHERE closing AND project_id='85300000-0000-4000-8000-000000000002'), 1::bigint, 'closing: reported retries never create another closing request');
SELECT * FROM finish(true);
ROLLBACK;
