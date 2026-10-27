-- F4 real two-session oracle, ONLY for the lead's coordinated committed replay.
-- NOT included by scope_composition_isolated.sql: another session cannot see
-- its uncommitted 00868 objects, and that wrapper holds agreement-table DDL locks.
-- Run on the LOCAL stack with 00868 COMMITTED, dblink installed, and no other
-- scope writers. The lead must provide scope_editions=true already committed
-- and restore it after the rehearsal. This oracle NEVER toggles the capability.
-- Fixtures are restored on success or caught failure. Outbound workers must
-- remain stopped throughout the rehearsal; native send creates a LOCAL outbox.
-- Prerequisite: the dblink extension. No migration or seed installs it; the
-- window owner installs it on that stack only (supabase/tests/round8/README.md).
-- psql -v ON_ERROR_STOP=1 -v scope_concurrency_rehearsal=on \
--   [-v expected_port=<db port>, default 54322] \
--   postgresql://postgres:postgres@127.0.0.1:54322/postgres \
--   -f supabase/tests/round8/scope_composition_concurrency_test.sql
-- It must NOT be run concurrently with an isolated migration wrapper.
\set ON_ERROR_STOP on
\if :{?scope_concurrency_rehearsal}
SELECT :'scope_concurrency_rehearsal' = 'on' AS approved \gset
\else
\set approved false
\endif
\if :approved
\else
\echo 'REFUSED: requires explicit scope_concurrency_rehearsal=on in a coordinated window'
DO $$ BEGIN RAISE EXCEPTION 'scope_composition_concurrency refused: explicit rehearsal approval required'; END $$;
\quit
\endif

\if :{?expected_port}
\else
\set expected_port 54322
\endif
SELECT :'HOST' = '127.0.0.1' AND :'PORT' = :'expected_port' AS local_stack \gset
\if :local_stack
\else
\echo 'REFUSED: requires host 127.0.0.1 port' :expected_port
DO $$ BEGIN RAISE EXCEPTION 'scope_composition_concurrency refused: not the expected local stack'; END $$;
\quit
\endif
SELECT EXISTS(SELECT 1 FROM pg_extension WHERE extname='dblink') AS dblink_installed \gset
\if :dblink_installed
\else
\echo 'REFUSED: prerequisite dblink extension missing; install it on this local stack only, never in a migration or seed'
DO $$ BEGIN RAISE EXCEPTION 'scope_composition_concurrency refused: prerequisite dblink extension missing'; END $$;
\quit
\endif
SET statement_timeout='90s';
DO $oracle$
DECLARE
  -- dblink connects inside the Postgres container, not to the host's mapped port.
  -- Non-superuser dblink must authenticate with its password, and the Supabase
  -- image trusts 127.0.0.1, so dial the server's own network address, where
  -- pg_hba requires scram-sha-256. A socket session (NULL address) would fall
  -- back to a passwordless socket, which dblink refuses.
  conn text := format('host=%s port=%s dbname=%L user=postgres password=postgres connect_timeout=3',host(inet_server_addr()),current_setting('port'),current_database());
  ext_schema text;
  a_pid integer; b_pid integer; deadline timestamptz;
  case_name text; payload_a jsonb; payload_b jsonb; base_payload jsonb;
  error_state text; error_message text; result text;
  write_sql text; send_parts jsonb;
  a_connected boolean := false; b_connected boolean := false; setup_done boolean := false;
  setup_sql text := $setup$
    BEGIN;
    SET LOCAL statement_timeout='10s'; SET LOCAL lock_timeout='3s';
    SET LOCAL session_replication_role=replica;
    INSERT INTO auth.users(id,email,aud,role) VALUES
      ('f8690000-0000-4000-8000-000000000001','scope-race@test.invalid','authenticated','authenticated');
    INSERT INTO public.profiles(id,email,full_name,is_designer) VALUES
      ('f8690000-0000-4000-8000-000000000001','scope-race@test.invalid','Scope race',true);
    INSERT INTO public.designer_clients(id,designer_id,client_id,client_name,client_email,status,source) VALUES
      ('f8692000-0000-4000-8000-000000000001','f8690000-0000-4000-8000-000000000001','f8690000-0000-4000-8000-000000000001','Scope race','scope-race@test.invalid','active','direct');
    INSERT INTO public.proposals(id,designer_id,designer_client_id,client_id,title,total_amount,status,valid_until) VALUES
      ('f8693000-0000-4000-8000-000000000001','f8690000-0000-4000-8000-000000000001',
       'f8692000-0000-4000-8000-000000000001','f8690000-0000-4000-8000-000000000001','Scope race',0,'draft',now()+interval '1 day');
    INSERT INTO public.proposal_phases(id,proposal_id,name,phase_key,fee_cents,sort_order,lane,duration_days) VALUES
      ('f8695000-0000-4000-8000-000000000001','f8693000-0000-4000-8000-000000000001','Design','concept_development',0,1,'main',1);
    SET LOCAL session_replication_role=origin;
    COMMIT;
  $setup$;
  cleanup_sql text := $cleanup$
    BEGIN;
    SET LOCAL statement_timeout='10s'; SET LOCAL lock_timeout='3s';
    SET LOCAL session_replication_role=replica;
    UPDATE public.proposals SET proposal_send_dispatch_id=NULL WHERE id='f8693000-0000-4000-8000-000000000001';
    DELETE FROM public.proposal_send_dispatches WHERE proposal_id='f8693000-0000-4000-8000-000000000001';
    DELETE FROM public.agreement_part_events WHERE proposal_id='f8693000-0000-4000-8000-000000000001';
    DELETE FROM public.proposal_service_rates WHERE proposal_id='f8693000-0000-4000-8000-000000000001';
    DELETE FROM public.proposal_service_terms WHERE proposal_id='f8693000-0000-4000-8000-000000000001';
    DELETE FROM public.proposal_agreement_parts WHERE proposal_id='f8693000-0000-4000-8000-000000000001';
    DELETE FROM public.proposal_phases WHERE proposal_id='f8693000-0000-4000-8000-000000000001';
    DELETE FROM public.proposals WHERE id='f8693000-0000-4000-8000-000000000001';
    DELETE FROM public.designer_clients WHERE id='f8692000-0000-4000-8000-000000000001';
    -- Native send records an engagement event; replica-role deletes skip its FK check.
    DELETE FROM public.engagement_events WHERE user_id='f8690000-0000-4000-8000-000000000001';
    DELETE FROM public.profiles WHERE id='f8690000-0000-4000-8000-000000000001';
    DELETE FROM auth.users WHERE id='f8690000-0000-4000-8000-000000000001';
    SET LOCAL session_replication_role=origin;
    COMMIT;
  $cleanup$;
BEGIN
  IF current_user <> 'postgres' THEN
    RAISE EXCEPTION 'local Supabase postgres connection required';
  END IF;
  IF to_regprocedure('public._guard_scope_package_storage()') IS NULL THEN
    RAISE EXCEPTION 'REFUSED: committed 00868 install required';
  END IF;
  IF (SELECT enabled FROM public.server_capabilities WHERE key='scope_editions') IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'REFUSED: requires lead-provided committed scope_editions=true rehearsal';
  END IF;
  IF EXISTS(SELECT 1 FROM auth.users WHERE id::text LIKE 'f869%')
    OR EXISTS(SELECT 1 FROM public.proposals WHERE id::text LIKE 'f869%')
    OR EXISTS(SELECT 1 FROM public.designer_clients WHERE id::text LIKE 'f869%')
    OR EXISTS(SELECT 1 FROM public.profiles WHERE id::text LIKE 'f869%') THEN
    RAISE EXCEPTION 'REFUSED: race fixture prefix must start empty';
  END IF;
  SELECT n.nspname INTO ext_schema FROM pg_extension e JOIN pg_namespace n ON n.oid=e.extnamespace WHERE e.extname='dblink';
  IF ext_schema IS NULL THEN RAISE EXCEPTION 'dblink extension required for committed rehearsal'; END IF;
  PERFORM set_config('search_path',format('pg_temp,public,%I',ext_schema),false);
  PERFORM dblink_connect('scope_a',conn); a_connected := true;
  PERFORM dblink_connect('scope_b',conn); b_connected := true;
  SELECT pid INTO a_pid FROM dblink('scope_a','SELECT pg_backend_pid()') AS t(pid integer);
  SELECT pid INTO b_pid FROM dblink('scope_b','SELECT pg_backend_pid()') AS t(pid integer);
  -- Mark ownership before setup: even a connection error after COMMIT needs cleanup.
  setup_done := true;
  PERFORM dblink_exec('scope_a',setup_sql);
  base_payload := '{"label":"Race","inclusion":"included","responsibilities":{"design":"studio","purchasing":"client","payer":"client","fabrication_contract":"gc","installation":"gc"}}';
  FOREACH case_name IN ARRAY ARRAY['packageKey','phase binding'] LOOP
    PERFORM dblink_exec('scope_a','BEGIN; SET LOCAL statement_timeout=''15s''; SET LOCAL lock_timeout=''10s''; SET LOCAL request.jwt.claim.sub=''f8690000-0000-4000-8000-000000000001''');
    PERFORM dblink_exec('scope_b','BEGIN; SET LOCAL statement_timeout=''15s''; SET LOCAL lock_timeout=''10s''; SET LOCAL request.jwt.claim.sub=''f8690000-0000-4000-8000-000000000001''');
    payload_a := base_payload || '{"packageKey":"pkg.race"}';
    payload_b := payload_a;
    IF case_name='phase binding' THEN
      payload_a := payload_a || '{"serviceBindings":{"design":["f8695000-0000-4000-8000-000000000001"]}}';
      payload_b := jsonb_set(payload_a,'{packageKey}','"pkg.other"');
    END IF;
    PERFORM dblink_exec('scope_a',format($writer$DO $insert$
      BEGIN
        PERFORM 1 FROM public.proposals WHERE id='f8693000-0000-4000-8000-000000000001' AND status='draft' FOR UPDATE;
        IF NOT FOUND THEN RAISE EXCEPTION 'fixture writer requires draft'; END IF;
        PERFORM set_config('app.scope_parts_writer','f8693000-0000-4000-8000-000000000001',true);
        INSERT INTO public.proposal_agreement_parts(proposal_id,position,kind,part_key,title,payload)
          VALUES ('f8693000-0000-4000-8000-000000000001',1,'scope_package','race-a','Race A',%L::jsonb);
        PERFORM set_config('app.scope_parts_writer','',true);
      END $insert$;$writer$,payload_a));
    PERFORM dblink_send_query('scope_b',format($writer$DO $insert$
      BEGIN
        PERFORM 1 FROM public.proposals WHERE id='f8693000-0000-4000-8000-000000000001' AND status='draft' FOR UPDATE;
        IF NOT FOUND THEN RAISE EXCEPTION 'fixture writer requires draft'; END IF;
        PERFORM set_config('app.scope_parts_writer','f8693000-0000-4000-8000-000000000001',true);
        INSERT INTO public.proposal_agreement_parts(proposal_id,position,kind,part_key,title,payload)
          VALUES ('f8693000-0000-4000-8000-000000000001',2,'scope_package','race-b','Race B',%L::jsonb);
        PERFORM set_config('app.scope_parts_writer','',true);
      END $insert$;$writer$,payload_b));
    deadline := clock_timestamp()+interval '5s';
    LOOP
      EXIT WHEN a_pid=ANY(pg_blocking_pids(b_pid));
      IF clock_timestamp()>deadline THEN RAISE EXCEPTION 'ASSERTION FAILED: % second writer did not block on first',case_name; END IF;
      PERFORM pg_sleep(0.02);
    END LOOP;
    RAISE NOTICE 'PASS: concurrent % second writer blocks on proposal owner',case_name;
    PERFORM dblink_exec('scope_a','COMMIT');
    error_state := NULL; error_message := NULL;
    BEGIN
      SELECT status INTO result FROM dblink_get_result('scope_b') AS t(status text);
    EXCEPTION WHEN OTHERS THEN
      GET STACKED DIAGNOSTICS error_state=RETURNED_SQLSTATE,error_message=MESSAGE_TEXT;
    END;
    IF error_state IS DISTINCT FROM '23514' OR strpos(COALESCE(error_message,''),
      CASE case_name WHEN 'packageKey' THEN 'scope_package_key_duplicate' ELSE 'scope_package_phase_shared' END)=0 THEN
      RAISE EXCEPTION 'ASSERTION FAILED: concurrent % duplicate must refuse, got %/%',case_name,error_state,error_message;
    END IF;
    -- Drain the async result before reusing this connection.
    PERFORM * FROM dblink_get_result('scope_b') AS t(status text);
    PERFORM dblink_exec('scope_b','ROLLBACK');
    IF (SELECT count(*) FROM public.proposal_agreement_parts WHERE proposal_id='f8693000-0000-4000-8000-000000000001') <> 1 THEN
      RAISE EXCEPTION 'ASSERTION FAILED: concurrent % both writers committed',case_name;
    END IF;
    RAISE NOTICE 'PASS: concurrent % duplicate cannot commit',case_name;
    PERFORM dblink_exec('scope_a','BEGIN; SET LOCAL request.jwt.claim.sub=''f8690000-0000-4000-8000-000000000001''; DO $discard$ BEGIN PERFORM public.discard_agreement_parts(''f8693000-0000-4000-8000-000000000001''); END $discard$; COMMIT');
  END LOOP;
  -- R2-F4a: reproduce the native P-first / direct-child interleaving.
  -- A owns P before B takes a child; B must REFUSE without waiting for P.
  send_parts := jsonb_build_array(jsonb_build_object('kind','scope_package','partKey','race','title','Race',
      'payload',base_payload || '{"packageKey":"pkg.race"}'),
    '{"kind":"schedule","variant":"flat","partKey":"fee","title":"Fee","payload":{"cents":10000}}'::jsonb);
  write_sql := format($write$DO $upsert$ BEGIN
    PERFORM public.upsert_agreement_parts('f8693000-0000-4000-8000-000000000001',%L::jsonb,'Race fixture');
  END $upsert$;$write$,send_parts);
  PERFORM dblink_exec('scope_a','BEGIN; SET LOCAL statement_timeout=''15s''; SET LOCAL lock_timeout=''10s''; SET LOCAL request.jwt.claim.sub=''f8690000-0000-4000-8000-000000000001''');
  PERFORM dblink_exec('scope_a',write_sql);
  PERFORM dblink_exec('scope_a','COMMIT');
  PERFORM dblink_exec('scope_a','BEGIN; SET LOCAL statement_timeout=''15s''; SET LOCAL lock_timeout=''10s''; SET LOCAL request.jwt.claim.sub=''f8690000-0000-4000-8000-000000000001''');
  PERFORM dblink_exec('scope_a',$lock$DO $p$ BEGIN
    PERFORM 1 FROM public.proposals WHERE id='f8693000-0000-4000-8000-000000000001' FOR UPDATE;
  END $p$;$lock$);
  PERFORM dblink_exec('scope_b','BEGIN; SET LOCAL statement_timeout=''15s''; SET LOCAL lock_timeout=''10s''; SET LOCAL request.jwt.claim.sub=''f8690000-0000-4000-8000-000000000001''');
  PERFORM dblink_send_query('scope_b',$direct$UPDATE public.proposal_agreement_parts SET payload=payload
    WHERE proposal_id='f8693000-0000-4000-8000-000000000001' AND kind='scope_package'$direct$);
  deadline := clock_timestamp()+interval '5s';
  WHILE dblink_is_busy('scope_b')=1 LOOP
    IF clock_timestamp()>deadline THEN RAISE EXCEPTION 'ASSERTION FAILED: direct UPDATE waits on proposal owner'; END IF;
    PERFORM pg_sleep(0.02);
  END LOOP;
  error_state := NULL; error_message := NULL;
  BEGIN
    SELECT status INTO result FROM dblink_get_result('scope_b') AS t(status text);
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS error_state=RETURNED_SQLSTATE,error_message=MESSAGE_TEXT;
  END;
  IF error_state IS DISTINCT FROM '42501' OR strpos(COALESCE(error_message,''),'scope_parts_sanctioned_writer_required')=0 THEN
    RAISE EXCEPTION 'ASSERTION FAILED: direct UPDATE must refuse without 40P01, got %/%',error_state,error_message;
  END IF;
  PERFORM * FROM dblink_get_result('scope_b') AS t(status text);
  PERFORM dblink_exec('scope_b','ROLLBACK');
  PERFORM dblink_exec('scope_a',write_sql);
  PERFORM dblink_exec('scope_a','COMMIT');
  RAISE NOTICE 'PASS: direct UPDATE refuses while upsert owns proposal; no 40P01';

  -- R2-F4b: real native send holds P; waiting native upsert must see SENT.
  -- The rehearsal must keep outbound workers stopped (local outbox only).
  PERFORM dblink_exec('scope_a','BEGIN; SET LOCAL statement_timeout=''15s''; SET LOCAL lock_timeout=''10s''; SET LOCAL request.jwt.claim.sub=''f8690000-0000-4000-8000-000000000001''');
  PERFORM dblink_exec('scope_a',$send$DO $native_send$ BEGIN
    PERFORM public.send_commercial_document('f8693000-0000-4000-8000-000000000001',
      public._commercial_document_fingerprint('f8693000-0000-4000-8000-000000000001'));
  END $native_send$;$send$);
  PERFORM dblink_exec('scope_b','BEGIN; SET LOCAL statement_timeout=''15s''; SET LOCAL lock_timeout=''10s''; SET LOCAL request.jwt.claim.sub=''f8690000-0000-4000-8000-000000000001''');
  write_sql := format($write$DO $upsert$ BEGIN
    PERFORM public.upsert_agreement_parts('f8693000-0000-4000-8000-000000000001',%L::jsonb,'Must not save after send');
  END $upsert$;$write$,jsonb_set(send_parts,'{0,title}','"Unexpected after send"'));
  PERFORM dblink_send_query('scope_b',write_sql);
  deadline := clock_timestamp()+interval '5s';
  LOOP
    EXIT WHEN a_pid=ANY(pg_blocking_pids(b_pid));
    IF clock_timestamp()>deadline THEN RAISE EXCEPTION 'ASSERTION FAILED: sanctioned write did not wait on sender'; END IF;
    PERFORM pg_sleep(0.02);
  END LOOP;
  PERFORM dblink_exec('scope_a','COMMIT');
  error_state := NULL; error_message := NULL;
  BEGIN
    SELECT status INTO result FROM dblink_get_result('scope_b') AS t(status text);
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS error_state=RETURNED_SQLSTATE,error_message=MESSAGE_TEXT;
  END;
  IF error_state IS DISTINCT FROM '42501' OR strpos(COALESCE(error_message,''),'draft proposal')=0 THEN
    RAISE EXCEPTION 'ASSERTION FAILED: sanctioned write must recheck sent state after wait, got %/%',error_state,error_message;
  END IF;
  PERFORM * FROM dblink_get_result('scope_b') AS t(status text);
  PERFORM dblink_exec('scope_b','ROLLBACK');
  IF (SELECT status FROM public.proposals WHERE id='f8693000-0000-4000-8000-000000000001') IS DISTINCT FROM 'sent' THEN
    RAISE EXCEPTION 'ASSERTION FAILED: native send did not commit sent';
  END IF;
  IF (SELECT count(*) FROM public.proposal_agreement_parts WHERE proposal_id='f8693000-0000-4000-8000-000000000001') <> 2
     OR (SELECT title FROM public.proposal_agreement_parts WHERE proposal_id='f8693000-0000-4000-8000-000000000001' AND kind='scope_package') IS DISTINCT FROM 'Race' THEN
    RAISE EXCEPTION 'ASSERTION FAILED: refused post-send write changed stored parts';
  END IF;
  RAISE NOTICE 'PASS: sanctioned write sees sent after waiting on native sender';
  PERFORM dblink_exec('scope_a',cleanup_sql); setup_done := false;
  PERFORM dblink_disconnect('scope_a'); a_connected := false;
  PERFORM dblink_disconnect('scope_b'); b_connected := false;
  RAISE NOTICE 'PASS: concurrency fixture cleaned; capability unchanged';
EXCEPTION WHEN query_canceled OR OTHERS THEN
  IF b_connected THEN
    PERFORM dblink_cancel_query('scope_b');
    PERFORM dblink_disconnect('scope_b');
  END IF;
  IF a_connected THEN
    PERFORM dblink_exec('scope_a','ROLLBACK');
    IF setup_done THEN PERFORM dblink_exec('scope_a',cleanup_sql); END IF;
    PERFORM dblink_disconnect('scope_a');
  END IF;
  RAISE;
END;
$oracle$;
