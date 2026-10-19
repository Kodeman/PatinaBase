-- SQ-1414: two authenticated public writers, no private lock-only prefix.
-- Remote fixtures must commit so both sessions see them; delete only this run's UUIDs.
BEGIN;
SET LOCAL statement_timeout = '60s';
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS dblink WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;
SELECT plan(5);
CREATE TEMP TABLE quote_lock_results (name text PRIMARY KEY, passed boolean, detail text);
DO $test$
DECLARE
  v_dsn text := format(
    'host=%s port=54322 dbname=%s user=postgres password=postgres connect_timeout=5',
    host(network(set_masklen(inet_server_addr(), 16)) + 1), current_database());
  v_actor uuid := gen_random_uuid();
  v_project uuid := gen_random_uuid();
  v_vendor uuid := gen_random_uuid();
  v_item_a uuid := gen_random_uuid();
  v_item_b uuid := gen_random_uuid();
  v_quote uuid;
  v_org uuid;
  v_a_pid integer;
  v_b_pid integer;
  v_wait boolean := false;
  v_advisory boolean := false;
  v_a_result text;
  v_b_result text;
  v_ok boolean;
  v_conn text;
  v_cleanup text;
  v_detail text := '';
BEGIN
  FOREACH v_conn IN ARRAY ARRAY['sq1414_a','sq1414_b'] LOOP
    PERFORM extensions.dblink_connect(v_conn, v_dsn);
    PERFORM extensions.dblink_exec(v_conn, 'SET statement_timeout = ''12s''');
    PERFORM extensions.dblink_exec(v_conn, 'SET lock_timeout = ''10s''');
  END LOOP;
  BEGIN
    PERFORM extensions.dblink_exec('sq1414_b', format($fixture$
      INSERT INTO auth.users (id,email,encrypted_password,email_confirmed_at,created_at,updated_at,instance_id,aud,role)
      VALUES (%1$L,'sq1414-' || %1$L || '@test.invalid','',now(),now(),now(),
        '00000000-0000-0000-0000-000000000000','authenticated','authenticated');
      INSERT INTO public.profiles (id,email,full_name,is_designer)
      VALUES (%1$L,'sq1414-' || %1$L || '@test.invalid','SQ1414 Designer',true)
      ON CONFLICT (id) DO UPDATE SET is_designer = true;
      INSERT INTO public.projects (id,name,designer_id,created_by,studio_id,status)
      VALUES (%2$L,'SQ1414 quote lock',%1$L,%1$L,public._primary_studio_for(%1$L),'active');
      INSERT INTO public.vendors (id,name) VALUES (%3$L,'SQ1414 synthetic vendor');
      INSERT INTO public.project_ffe_items
        (id,project_id,name,status,quantity,unit_price_cents,trade_price_cents,line_total_cents,vendor_id,design_disposition,blocked)
      VALUES (%4$L,%2$L,'SQ1414 quoted item','approved',1,30000,20000,30000,%3$L,'selected',false),
        (%5$L,%2$L,'SQ1414 sibling item','approved',1,40000,25000,40000,%3$L,'selected',false);
    $fixture$,v_actor,v_project,v_vendor,v_item_a,v_item_b));
    SELECT id INTO v_org FROM extensions.dblink('sq1414_b',format(
      'SELECT public._primary_studio_for(%L)',v_actor)) AS r(id uuid);
    FOREACH v_conn IN ARRAY ARRAY['sq1414_a','sq1414_b'] LOOP
      PERFORM extensions.dblink_exec(v_conn, 'SET ROLE authenticated');
      PERFORM * FROM extensions.dblink(v_conn,format(
        'SELECT set_config(''request.jwt.claims'',%L,false)',
        jsonb_build_object('sub',v_actor,'role','authenticated')::text)) AS r(x text);
    END LOOP;
    SELECT id INTO v_quote FROM extensions.dblink('sq1414_b',format($quote$
      SELECT (public.record_vendor_quote(jsonb_build_object(
        'vendorId',%L::text,'projectId',%L::text,'quoteRef','SQ1414',
        'lines',jsonb_build_array(jsonb_build_object('ffeItemId',%L::text,'unitTradeCents',18000))))).id
    $quote$,v_vendor,v_project,v_item_a)) AS r(id uuid);
    SELECT pid INTO v_a_pid FROM extensions.dblink('sq1414_a','SELECT pg_backend_pid()') AS r(pid integer);
    SELECT pid INTO v_b_pid FROM extensions.dblink('sq1414_b','SELECT pg_backend_pid()') AS r(pid integer);
    PERFORM extensions.dblink_exec('sq1414_b','BEGIN');
    PERFORM * FROM extensions.dblink('sq1414_b',format(
      'SELECT public.set_project_ffe_line_commercials(%L,''{"tradePriceCents":24000}'')::text',v_item_b)) AS r(x text);
    PERFORM extensions.dblink_exec('sq1414_a','BEGIN');
    PERFORM extensions.dblink_send_query('sq1414_a',format($apply$
      DO $call$ BEGIN
        PERFORM public.apply_vendor_quote_to_lines(%L,ARRAY[%L]::uuid[]);
        PERFORM set_config('sq1414.result','ok',true);
      EXCEPTION WHEN OTHERS THEN
        PERFORM set_config('sq1414.result',SQLSTATE || ': ' || SQLERRM,true);
      END $call$;
    $apply$,v_quote,v_item_a));
    FOR attempt IN 1..100 LOOP
      SELECT v_b_pid = ANY(pg_blocking_pids(pid)),wait_event = 'advisory'
        INTO v_wait,v_advisory FROM pg_stat_activity WHERE pid = v_a_pid;
      EXIT WHEN v_wait OR extensions.dblink_is_busy('sq1414_a') = 0;
      PERFORM pg_sleep(0.025);
      PERFORM pg_stat_clear_snapshot();
    END LOOP;
    INSERT INTO quote_lock_results VALUES ('wait',COALESCE(v_wait AND v_advisory,false),
      format('A=%s B=%s A blocked by B=%s advisory=%s',v_a_pid,v_b_pid,v_wait,v_advisory));
    PERFORM extensions.dblink_exec('sq1414_b',format($edit$
      DO $call$ BEGIN
        PERFORM public.set_project_ffe_line_commercials(%L,'{"tradePriceCents":19000}');
        PERFORM set_config('sq1414.result','ok',true);
      EXCEPTION WHEN OTHERS THEN
        PERFORM set_config('sq1414.result',SQLSTATE || ': ' || SQLERRM,true);
      END $call$;
    $edit$,v_item_a));
    SELECT x INTO v_b_result FROM extensions.dblink('sq1414_b',
      'SELECT current_setting(''sq1414.result'')') AS r(x text);
    PERFORM extensions.dblink_exec('sq1414_b','COMMIT');
    PERFORM * FROM extensions.dblink_get_result('sq1414_a') AS r(x text);
    PERFORM * FROM extensions.dblink_get_result('sq1414_a') AS r(x text);
    SELECT x INTO v_a_result FROM extensions.dblink('sq1414_a',
      'SELECT current_setting(''sq1414.result'')') AS r(x text);
    PERFORM extensions.dblink_exec('sq1414_a','COMMIT');
    INSERT INTO quote_lock_results VALUES ('complete',v_a_result = 'ok' AND v_b_result = 'ok',
      format('A=%s; B=%s',v_a_result,v_b_result));
    SELECT passed INTO v_ok FROM extensions.dblink('sq1414_b',format($money$
      SELECT (SELECT trade_price_cents=18000 AND unit_price_cents=30000 AND purchase_order_id IS NULL
        FROM public.project_ffe_items WHERE id=%L)
      AND (SELECT trade_price_cents=24000 AND unit_price_cents=40000
        FROM public.project_ffe_items WHERE id=%L)
    $money$,v_item_a,v_item_b)) AS r(passed boolean);
    INSERT INTO quote_lock_results VALUES ('money',v_ok,'');
    SELECT passed INTO v_ok FROM extensions.dblink('sq1414_b',format($markers$
      SELECT count(*)=1 AND bool_and(applied_at IS NOT NULL AND applied_by=%L::uuid)
      FROM public.vendor_quote_lines WHERE quote_id=%L AND ffe_item_id=%L
    $markers$,v_actor,v_quote,v_item_a)) AS r(passed boolean);
    INSERT INTO quote_lock_results VALUES ('markers',v_ok,'');
  EXCEPTION WHEN OTHERS THEN
    v_detail := SQLSTATE || ': ' || SQLERRM;
  END;
  FOREACH v_conn IN ARRAY ARRAY['sq1414_a','sq1414_b'] LOOP
    IF extensions.dblink_is_busy(v_conn) = 1 THEN
      PERFORM extensions.dblink_cancel_query(v_conn);
    END IF;
    BEGIN
      PERFORM * FROM extensions.dblink_get_result(v_conn,false) AS r(x text);
      PERFORM * FROM extensions.dblink_get_result(v_conn,false) AS r(x text);
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
    PERFORM extensions.dblink_exec(v_conn,'ROLLBACK');
    PERFORM extensions.dblink_exec(v_conn,'RESET ROLE');
  END LOOP;
  v_cleanup := format($cleanup$
    SET app.ffe_mutation_rpc = 'on';
    DELETE FROM public.vendor_quotes WHERE project_id=%1$L;
    DELETE FROM public.projects WHERE id=%1$L;
    DELETE FROM public.vendors WHERE id=%2$L;
    DELETE FROM public.audit_logs WHERE user_id=%3$L OR organization_id=%4$L;
    SET ROLE service_role;
    DELETE FROM public.organizations WHERE id=%4$L;
    RESET ROLE;
    DELETE FROM public.profiles WHERE id=%3$L;
    DELETE FROM auth.users WHERE id=%3$L;
  $cleanup$,v_project,v_vendor,v_actor,v_org);
  PERFORM extensions.dblink_exec('sq1414_b',v_cleanup);
  SELECT passed INTO v_ok FROM extensions.dblink('sq1414_b',format($clean$
    SELECT NOT EXISTS (SELECT 1 FROM public.projects WHERE id=%1$L)
      AND NOT EXISTS (SELECT 1 FROM public.vendor_quotes WHERE project_id=%1$L)
      AND NOT EXISTS (SELECT 1 FROM public.vendors WHERE id=%2$L)
      AND NOT EXISTS (SELECT 1 FROM auth.users WHERE id=%3$L)
  $clean$,v_project,v_vendor,v_actor)) AS r(passed boolean);
  INSERT INTO quote_lock_results VALUES ('cleanup',v_ok,v_detail);
  FOREACH v_conn IN ARRAY ARRAY['sq1414_a','sq1414_b'] LOOP
    PERFORM extensions.dblink_disconnect(v_conn);
  END LOOP;
  INSERT INTO quote_lock_results
    SELECT name,false,v_detail FROM unnest(ARRAY['wait','complete','money','markers']) name
    ON CONFLICT (name) DO NOTHING;
END
$test$;
SELECT diag(name || ': ' || detail) FROM quote_lock_results WHERE detail <> '';
SELECT ok(passed,'quote apply waits on sibling public writer job lock') FROM quote_lock_results WHERE name='wait';
SELECT ok(passed,'quote apply and same-job public edits complete without 40P01') FROM quote_lock_results WHERE name='complete';
SELECT ok(passed,'quote trade wins after sibling edits without changing client prices') FROM quote_lock_results WHERE name='money';
SELECT ok(passed,'quote applied markers retain the authenticated actor') FROM quote_lock_results WHERE name='markers';
SELECT ok(passed,'only this run synthetic fixtures are removed') FROM quote_lock_results WHERE name='cleanup';
SELECT * FROM finish();
ROLLBACK;
