-- SQ-1255: real authenticated void/promotion/merge calls, committed fixtures,
-- observed blockers and final money/audit rows. PO cancellation is not faked:
-- its current canonical writer detaches before cancellation (00449/00453).
BEGIN;
SET LOCAL statement_timeout = '90s';
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS dblink WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;
SELECT plan(7);
CREATE TEMP TABLE inherited_lock_results (name text PRIMARY KEY, passed boolean, detail text);
DO $test$
DECLARE
  v_dsn text := format(
    'host=%s port=54322 dbname=%s user=postgres password=postgres connect_timeout=5',
    host(network(set_masklen(inet_server_addr(), 16)) + 1), current_database());
  v_cleanup text := $cleanup$
    SET app.ffe_mutation_rpc = 'on';
    SET app.board_state_rpc = 'on';
    DELETE FROM public.proposal_board_items WHERE board_id IN
      ('12550000-0000-4000-8000-000000000008','12550000-0000-4000-8000-000000000010');
    DELETE FROM public.proposal_boards WHERE id IN
      ('12550000-0000-4000-8000-000000000008','12550000-0000-4000-8000-000000000010');
    DELETE FROM public.studio_purchases WHERE recorded_by = '12550000-0000-4000-8000-000000000001';
    DELETE FROM public.project_ffe_command_idempotency WHERE actor_id = '12550000-0000-4000-8000-000000000001';
    DELETE FROM public.ffe_pricing_approvals WHERE project_id IN
      ('12550000-0000-4000-8000-000000000002','12550000-0000-4000-8000-000000000003');
    SET patina.configuration_spec_workflow = '00403';
    DELETE FROM public.product_configurations WHERE id = '12550000-0000-4000-8000-000000000007';
    DELETE FROM public.projects WHERE id IN
      ('12550000-0000-4000-8000-000000000002','12550000-0000-4000-8000-000000000003');
    SET patina.configuration_spec_workflow = '';
    DELETE FROM public.products WHERE id IN ('12550000-0000-4000-8000-000000000004',
      '12550000-0000-4000-8000-000000000005','12550000-0000-4000-8000-000000000006');
    DELETE FROM public.audit_logs WHERE user_id = '12550000-0000-4000-8000-000000000001'
      OR organization_id IN (SELECT organization_id FROM public.organization_members
        WHERE user_id = '12550000-0000-4000-8000-000000000001');
    SET ROLE service_role;
    DELETE FROM public.organizations WHERE id IN (SELECT organization_id FROM public.organization_members
      WHERE user_id = '12550000-0000-4000-8000-000000000001');
    RESET ROLE;
    DELETE FROM public.profiles WHERE id = '12550000-0000-4000-8000-000000000001';
    DELETE FROM auth.users WHERE id = '12550000-0000-4000-8000-000000000001';
  $cleanup$;
  v_merge text := $merge$DO $call$ BEGIN
    PERFORM public.merge_studio_product('12550000-0000-4000-8000-000000000005',
      '12550000-0000-4000-8000-000000000006');
    PERFORM set_config('sq1255.result', 'ok', true);
  EXCEPTION WHEN OTHERS THEN PERFORM set_config('sq1255.result', SQLSTATE || ': ' || SQLERRM, true);
  END $call$;$merge$;
  v_item uuid;
  v_purchase uuid;
  v_json jsonb;
  v_a_pid integer;
  v_b_pid integer;
  v_wait boolean;
  v_advisory boolean;
  v_free boolean;
  v_ok boolean;
  v_result text;
  v_promotion text;
  v_conn text;
  v_detail text := '';
BEGIN
  FOREACH v_conn IN ARRAY ARRAY['sq1255_setup','sq1255_a','sq1255_b'] LOOP
    PERFORM extensions.dblink_connect(v_conn, v_dsn);
    PERFORM extensions.dblink_exec(v_conn, 'SET statement_timeout = ''20s''');
    PERFORM extensions.dblink_exec(v_conn, 'SET lock_timeout = ''15s''');
  END LOOP;
  BEGIN
    PERFORM extensions.dblink_exec('sq1255_setup', v_cleanup);
    PERFORM extensions.dblink_exec('sq1255_setup', $fixture$
      INSERT INTO auth.users (id,email,encrypted_password,email_confirmed_at,created_at,updated_at,instance_id,aud,role)
      VALUES ('12550000-0000-4000-8000-000000000001','sq1255@test.invalid','',now(),now(),now(),
        '00000000-0000-0000-0000-000000000000','authenticated','authenticated');
      INSERT INTO public.profiles (id,email,full_name,is_designer)
      VALUES ('12550000-0000-4000-8000-000000000001','sq1255@test.invalid','SQ1255 Designer',true)
      ON CONFLICT (id) DO UPDATE SET is_designer = true;
      INSERT INTO public.projects (id,name,designer_id,created_by,studio_id,status)
      SELECT id,name,'12550000-0000-4000-8000-000000000001','12550000-0000-4000-8000-000000000001',
        public._primary_studio_for('12550000-0000-4000-8000-000000000001'),'active'
      FROM (VALUES ('12550000-0000-4000-8000-000000000002'::uuid,'SQ1255 void'),
        ('12550000-0000-4000-8000-000000000003'::uuid,'SQ1255 board-only')) jobs(id,name);
      INSERT INTO public.products (id,name,captured_at,layer,studio_id,vendor_contact,lead_time_weeks,payment_terms,category,usage_notes)
      SELECT id,name,now(),'studio',public._primary_studio_for('12550000-0000-4000-8000-000000000001'),
        '{}',6,'net_30','seating','test'
      FROM (VALUES ('12550000-0000-4000-8000-000000000004'::uuid,'Configured chair'),
        ('12550000-0000-4000-8000-000000000005'::uuid,'Duplicate chair'),
        ('12550000-0000-4000-8000-000000000006'::uuid,'Kept chair')) products(id,name);
      INSERT INTO public.product_configurations (id,product_id,project_id,owner_user_id,version,schema_revision,
        status,evaluation,snapshot,snapshot_hash,is_complete,is_valid,retail_price_cents,trade_price_cents)
      SELECT '12550000-0000-4000-8000-000000000007','12550000-0000-4000-8000-000000000004',
        '12550000-0000-4000-8000-000000000002','12550000-0000-4000-8000-000000000001',1,1,
        'saved','{}',snapshot,public._configuration_snapshot_hash(snapshot),true,true,80000,50000
      FROM (SELECT '{"retailPriceCents":80000,"tradePriceCents":50000}'::jsonb snapshot) frozen;
      INSERT INTO public.proposal_boards (id,name,project_id)
      VALUES ('12550000-0000-4000-8000-000000000008','Board before selection','12550000-0000-4000-8000-000000000003'),
        ('12550000-0000-4000-8000-000000000010','Late board','12550000-0000-4000-8000-000000000002');
      INSERT INTO public.proposal_board_items (id,board_id,type,product_id)
      VALUES ('12550000-0000-4000-8000-000000000009','12550000-0000-4000-8000-000000000008','product',
        '12550000-0000-4000-8000-000000000005');
    $fixture$);
    FOREACH v_conn IN ARRAY ARRAY['sq1255_setup','sq1255_a','sq1255_b'] LOOP
      PERFORM extensions.dblink_exec(v_conn, 'SET ROLE authenticated');
      PERFORM * FROM extensions.dblink(v_conn, $jwt$SELECT set_config('request.jwt.claims',
        '{"sub":"12550000-0000-4000-8000-000000000001","role":"authenticated"}',false)$jwt$) AS r(x text);
    END LOOP;
    SELECT result INTO v_json FROM extensions.dblink('sq1255_setup', $place$SELECT public.place_product_configuration_in_project(
      '12550000-0000-4000-8000-000000000002','12550000-0000-4000-8000-000000000007',NULL,NULL,'seating',
      '{"idempotencyKey":"sq1255-void"}')$place$) AS r(result jsonb);
    v_item := COALESCE(v_json->>'selectionId',v_json->>'ffeItemId')::uuid;
    IF v_item IS NULL THEN RAISE EXCEPTION 'placement missing item: %',v_json; END IF;
    PERFORM * FROM extensions.dblink('sq1255_setup',format($select$SELECT public.triage_project_ffe_items(
      jsonb_build_object('projectId','12550000-0000-4000-8000-000000000002','selectionIds',jsonb_build_array(%L::text),
        'assignmentScope','unassigned','disposition','selected'))::text$select$,v_item)) AS r(x text);
    PERFORM * FROM extensions.dblink('sq1255_setup', format(
      'SELECT public.set_ffe_line_pricing(%L,''unit_client_price_cents'',90000)::text',v_item)) AS r(x text);
    SELECT id INTO v_purchase FROM extensions.dblink('sq1255_setup', format($purchase$
      SELECT (public.record_studio_purchase(jsonb_build_object('ffeItemId',%L::text,'kind','one_off',
        'payeeName','SQ1255 shop','amountCents',50000))).id$purchase$,v_item)) AS r(id uuid);

    -- First approval is open in A. B must not lock the item or reprice yet.
    PERFORM extensions.dblink_exec('sq1255_a','RESET ROLE');
    PERFORM extensions.dblink_exec('sq1255_a','BEGIN');
    SELECT pid INTO v_a_pid FROM extensions.dblink('sq1255_a','SELECT pg_backend_pid()') AS r(pid integer);
    SELECT pid INTO v_b_pid FROM extensions.dblink('sq1255_b','SELECT pg_backend_pid()') AS r(pid integer);
    PERFORM * FROM extensions.dblink('sq1255_a', $lock$SELECT public._ffe_lock_job_labels(
      '12550000-0000-4000-8000-000000000002')::text$lock$) AS r(x text);
    PERFORM extensions.dblink_exec('sq1255_a', $approval$INSERT INTO public.ffe_pricing_approvals
      (project_id,approval_source,approval_ref) VALUES ('12550000-0000-4000-8000-000000000002',
        'project_approval','12550000-0000-4000-8000-000000000011')$approval$);
    PERFORM extensions.dblink_exec('sq1255_b','BEGIN');
    PERFORM extensions.dblink_send_query('sq1255_b', format(
      'SELECT public.void_studio_purchase(%L,''Returned configured chair'')::text',v_purchase));
    FOR attempt IN 1..100 LOOP
      SELECT blocked,advisory INTO v_wait,v_advisory FROM extensions.dblink('sq1255_a',format(
        'SELECT %s = ANY(pg_blocking_pids(pid)),wait_event = ''advisory'' FROM pg_stat_activity WHERE pid=%s',
        v_a_pid,v_b_pid)) AS r(blocked boolean,advisory boolean);
      EXIT WHEN v_wait OR extensions.dblink_is_busy('sq1255_b') = 0;
      PERFORM pg_sleep(0.05);
    END LOOP;
    INSERT INTO inherited_lock_results VALUES ('void_wait',COALESCE(v_wait AND v_advisory,false),'');
    PERFORM extensions.dblink_exec('sq1255_a','SAVEPOINT item_probe');
    v_free := false;
    BEGIN
      PERFORM * FROM extensions.dblink('sq1255_a',format(
        'SELECT id FROM public.project_ffe_items WHERE id=%L FOR UPDATE NOWAIT',v_item)) AS r(id uuid);
      v_free := true;
    EXCEPTION WHEN lock_not_available THEN NULL;
    END;
    PERFORM extensions.dblink_exec('sq1255_a','ROLLBACK TO SAVEPOINT item_probe');
    INSERT INTO inherited_lock_results VALUES ('void_outer',v_free,'');
    PERFORM extensions.dblink_exec('sq1255_a','COMMIT');
    PERFORM * FROM extensions.dblink_get_result('sq1255_b') AS r(x text);
    PERFORM * FROM extensions.dblink_get_result('sq1255_b') AS r(x text);
    SELECT matches INTO v_ok FROM extensions.dblink('sq1255_b',format($money$
      SELECT item.status='approved' AND item.unit_price_cents=80000 AND item.trade_price_cents=50000
        AND item.line_total_cents=item.quantity*80000 AND EXISTS (
          SELECT 1 FROM public.ffe_pricing_events event WHERE event.item_id=item.id
            AND event.field='unit_price_cents' AND event.old_value='90000'
            AND event.new_value='80000' AND event.actor='12550000-0000-4000-8000-000000000001')
      FROM public.project_ffe_items item WHERE item.id=%L$money$,v_item)) AS r(matches boolean);
    INSERT INTO inherited_lock_results VALUES ('void_audit',COALESCE(v_ok,false),'');
    PERFORM extensions.dblink_exec('sq1255_b','ROLLBACK');

    -- Reproduce the public promotion prefix: job → board, before product FK.
    PERFORM extensions.dblink_exec('sq1255_a','BEGIN');
    PERFORM * FROM extensions.dblink('sq1255_a',$lock$SELECT public._ffe_lock_job_labels(
      '12550000-0000-4000-8000-000000000003')::text$lock$) AS r(x text);
    PERFORM * FROM extensions.dblink('sq1255_a',$lock$SELECT id FROM public.proposal_board_items
      WHERE id='12550000-0000-4000-8000-000000000009' FOR UPDATE$lock$) AS r(id uuid);
    SELECT n=0 INTO v_ok FROM extensions.dblink('sq1255_a',$count$SELECT count(*)::integer FROM public.project_ffe_items
      WHERE project_id='12550000-0000-4000-8000-000000000003'$count$) AS r(n integer);
    IF NOT v_ok THEN RAISE EXCEPTION 'board-only job already has FF&E'; END IF;
    PERFORM extensions.dblink_exec('sq1255_b','BEGIN');
    PERFORM extensions.dblink_send_query('sq1255_b',v_merge);
    FOR attempt IN 1..100 LOOP
      SELECT blocked,advisory INTO v_wait,v_advisory FROM extensions.dblink('sq1255_a',format(
        'SELECT %s = ANY(pg_blocking_pids(pid)),wait_event = ''advisory'' FROM pg_stat_activity WHERE pid=%s',
        v_a_pid,v_b_pid)) AS r(blocked boolean,advisory boolean);
      EXIT WHEN v_wait OR extensions.dblink_is_busy('sq1255_b') = 0;
      PERFORM pg_sleep(0.05);
    END LOOP;
    INSERT INTO inherited_lock_results VALUES ('merge_wait',COALESCE(v_wait AND v_advisory,false),'');
    PERFORM extensions.dblink_exec('sq1255_a','SET LOCAL ROLE authenticated');
    PERFORM extensions.dblink_exec('sq1255_a',$promote$DO $call$ BEGIN
      PERFORM public.promote_board_reference_to_selection('12550000-0000-4000-8000-000000000009','{}');
      PERFORM set_config('sq1255.result','ok',true);
    EXCEPTION WHEN OTHERS THEN PERFORM set_config('sq1255.result',SQLSTATE || ': ' || SQLERRM,true);
    END $call$;$promote$);
    SELECT result INTO v_promotion FROM extensions.dblink('sq1255_a',
      'SELECT current_setting(''sq1255.result'')') AS r(result text);
    PERFORM extensions.dblink_exec('sq1255_a','COMMIT');
    PERFORM * FROM extensions.dblink_get_result('sq1255_b') AS r(x text);
    PERFORM * FROM extensions.dblink_get_result('sq1255_b') AS r(x text);
    SELECT result INTO v_result FROM extensions.dblink('sq1255_b',
      'SELECT current_setting(''sq1255.result'')') AS r(result text);
    INSERT INTO inherited_lock_results VALUES ('merge_no_deadlock',v_result='ok' AND v_promotion='ok',
      'merge=' || v_result || '; promotion=' || v_promotion);
    SELECT matches INTO v_ok FROM extensions.dblink('sq1255_b',$linked$SELECT
      board_item.product_id='12550000-0000-4000-8000-000000000006'::uuid
      AND item.product_id=board_item.product_id
      FROM public.proposal_board_items board_item JOIN public.project_ffe_items item ON item.id=board_item.project_ffe_item_id
      WHERE board_item.id='12550000-0000-4000-8000-000000000009'$linked$) AS r(matches boolean);
    INSERT INTO inherited_lock_results VALUES ('merge_link',COALESCE(v_ok,false),'');
    PERFORM extensions.dblink_exec('sq1255_b','ROLLBACK');

    -- A board reference committed after the census must retry, as late lines do.
    PERFORM extensions.dblink_exec('sq1255_a','BEGIN');
    PERFORM extensions.dblink_exec('sq1255_a',$late$INSERT INTO public.proposal_board_items (board_id,type,product_id)
      VALUES ('12550000-0000-4000-8000-000000000010','product','12550000-0000-4000-8000-000000000005')$late$);
    PERFORM extensions.dblink_exec('sq1255_b','BEGIN');
    PERFORM extensions.dblink_send_query('sq1255_b',v_merge);
    FOR attempt IN 1..100 LOOP
      SELECT blocked INTO v_wait FROM extensions.dblink('sq1255_a',format(
        'SELECT %s = ANY(pg_blocking_pids(pid)) FROM pg_stat_activity WHERE pid=%s',v_a_pid,v_b_pid)) AS r(blocked boolean);
      EXIT WHEN v_wait OR extensions.dblink_is_busy('sq1255_b')=0;
      PERFORM pg_sleep(0.05);
    END LOOP;
    PERFORM extensions.dblink_exec('sq1255_a','COMMIT');
    PERFORM * FROM extensions.dblink_get_result('sq1255_b') AS r(x text);
    PERFORM * FROM extensions.dblink_get_result('sq1255_b') AS r(x text);
    SELECT result INTO v_result FROM extensions.dblink('sq1255_b',
      'SELECT current_setting(''sq1255.result'')') AS r(result text);
    INSERT INTO inherited_lock_results VALUES ('late_board',COALESCE(v_wait,false) AND v_result LIKE '40001:%',v_result);
    PERFORM extensions.dblink_exec('sq1255_b','ROLLBACK');
  EXCEPTION WHEN OTHERS THEN
    v_detail := SQLSTATE || ': ' || SQLERRM;
  END;
  FOREACH v_conn IN ARRAY COALESCE(extensions.dblink_get_connections(),ARRAY[]::text[]) LOOP
    IF v_conn IN ('sq1255_a','sq1255_b') THEN PERFORM extensions.dblink_disconnect(v_conn); END IF;
  END LOOP;
  PERFORM extensions.dblink_exec('sq1255_setup','RESET ROLE');
  PERFORM * FROM extensions.dblink('sq1255_setup','SELECT set_config(''request.jwt.claims'',''{}'',false)') AS r(x text);
  PERFORM extensions.dblink_exec('sq1255_setup',v_cleanup);
  PERFORM extensions.dblink_disconnect('sq1255_setup');
  INSERT INTO inherited_lock_results
  SELECT name,false,v_detail FROM unnest(ARRAY['void_wait','void_outer','void_audit',
    'merge_wait','merge_no_deadlock','merge_link','late_board']) name
  ON CONFLICT (name) DO NOTHING;
END
$test$;
SELECT diag(name || ': ' || detail) FROM inherited_lock_results WHERE detail <> '';
SELECT ok(passed,'void waits on first-approval job advisory lock') FROM inherited_lock_results WHERE name='void_wait';
SELECT ok(passed,'void leaves the item free while waiting for the job lock') FROM inherited_lock_results WHERE name='void_outer';
SELECT ok(passed,'void restores configuration money and logs the post-approval price event') FROM inherited_lock_results WHERE name='void_audit';
SELECT ok(passed,'merge waits on board-only job before product locks') FROM inherited_lock_results WHERE name='merge_wait';
SELECT ok(passed,'board promotion and merge both complete without 40P01') FROM inherited_lock_results WHERE name='merge_no_deadlock';
SELECT ok(passed,'merge repoints the promoted selection and its board together') FROM inherited_lock_results WHERE name='merge_link';
SELECT ok(passed,'merge refuses a late board-only job with 40001') FROM inherited_lock_results WHERE name='late_board';
SELECT * FROM finish();
ROLLBACK;
