-- SQ-1148: regression-only. 00810 already serializes configuration revision
-- with configured placement (SQ-1194). No production body is replaced here.
-- A pauses placement after its job/configuration locks, before the item lock.
-- B calls the real public revision RPC. pg_blocking_pids identifies A and the
-- advisory wait; NOWAIT proves B has not taken the item. A then executes the
-- real idempotent placement replay before B finishes its revision.
BEGIN;
SET LOCAL statement_timeout = '60s';
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS dblink WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;
SELECT plan(4);
CREATE TEMP TABLE revise_interleave (
  advisory_wait boolean, item_free boolean, replay_ok boolean,
  revision_ok boolean, detail text
);
DO $test$
DECLARE
  v_dsn text := format(
    'host=%s port=54322 dbname=%s user=postgres password=postgres connect_timeout=5',
    host(network(set_masklen(inet_server_addr(), 16)) + 1), current_database());
  v_cleanup text := $cleanup$
    DELETE FROM public.project_ffe_command_idempotency
      WHERE actor_id = '11480000-0000-4000-8000-000000000001';
    SET patina.configuration_spec_workflow = '00403';
    DELETE FROM public.product_configurations WHERE project_id = '11480000-0000-4000-8000-000000000002';
    DELETE FROM public.projects WHERE id = '11480000-0000-4000-8000-000000000002';
    SET patina.configuration_spec_workflow = '';
    DELETE FROM public.products WHERE id = '11480000-0000-4000-8000-000000000003';
    -- Auth provisioning creates a studio; only service_role may remove its last owner.
    SET ROLE service_role;
    DELETE FROM public.organizations WHERE id IN (
      SELECT organization_id FROM public.organization_members
      WHERE user_id = '11480000-0000-4000-8000-000000000001');
    RESET ROLE;
    DELETE FROM public.profiles WHERE id = '11480000-0000-4000-8000-000000000001';
    DELETE FROM auth.users WHERE id = '11480000-0000-4000-8000-000000000001';
  $cleanup$;
  v_place text := $place$SELECT public.place_product_configuration_in_project(
    '11480000-0000-4000-8000-000000000002',
    '11480000-0000-4000-8000-000000000004', NULL, NULL, 'seating',
    '{"idempotencyKey":"sq1148-config-replay"}'::jsonb)$place$;
  v_item uuid;
  v_a_pid integer;
  v_b_pid integer;
  v_blocked boolean := false;
  v_advisory boolean := false;
  v_free boolean := false;
  v_replay boolean := false;
  v_revision boolean := false;
  v_result jsonb;
  v_initial jsonb;
  v_count integer;
  v_detail text := '';
  v_conn text;
BEGIN
  PERFORM extensions.dblink_connect('r1148_setup', v_dsn);
  PERFORM extensions.dblink_connect('r1148_a', v_dsn);
  PERFORM extensions.dblink_connect('r1148_b', v_dsn);
  BEGIN
    PERFORM extensions.dblink_exec('r1148_setup', 'SET statement_timeout = ''20s''');
    PERFORM extensions.dblink_exec('r1148_setup', v_cleanup);
    PERFORM extensions.dblink_exec('r1148_setup', $fixture$
      INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at,
        created_at, updated_at, instance_id, aud, role)
      VALUES ('11480000-0000-4000-8000-000000000001', 'sq1148@test.invalid', '',
        now(), now(), now(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');
      INSERT INTO public.profiles (id, email, full_name, is_designer)
      VALUES ('11480000-0000-4000-8000-000000000001', 'sq1148@test.invalid', 'SQ1148 Designer', true)
      ON CONFLICT (id) DO UPDATE SET is_designer = true;
      INSERT INTO public.projects (id, name, designer_id, created_by, status)
      VALUES ('11480000-0000-4000-8000-000000000002', 'SQ1148 configuration interleave',
        '11480000-0000-4000-8000-000000000001', '11480000-0000-4000-8000-000000000001', 'active');
      INSERT INTO public.products (id, name, captured_at, layer, owner_user_id,
        vendor_contact, lead_time_weeks, payment_terms, category, usage_notes)
      VALUES ('11480000-0000-4000-8000-000000000003', 'SQ1148 chair', now(), 'personal',
        '11480000-0000-4000-8000-000000000001', '{}', 6, 'net_30', 'seating', 'test');
      INSERT INTO public.product_configurations (id, product_id, project_id,
        owner_user_id, version, schema_revision, status, evaluation,
        snapshot, snapshot_hash, is_complete, is_valid, retail_price_cents, trade_price_cents)
      SELECT id, '11480000-0000-4000-8000-000000000003', '11480000-0000-4000-8000-000000000002',
        '11480000-0000-4000-8000-000000000001', 1, 1, 'saved', '{}',
        snapshot, public._configuration_snapshot_hash(snapshot), true, true, retail, trade
      FROM (VALUES
        ('11480000-0000-4000-8000-000000000004'::uuid, 80000, 50000),
        ('11480000-0000-4000-8000-000000000005'::uuid, 90000, 60000)
      ) AS prices(id, retail, trade)
      CROSS JOIN LATERAL (SELECT jsonb_build_object(
        'retailPriceCents', retail, 'tradePriceCents', trade) AS snapshot) AS frozen;
    $fixture$);
    FOREACH v_conn IN ARRAY ARRAY['r1148_setup', 'r1148_a', 'r1148_b'] LOOP
      PERFORM extensions.dblink_exec(v_conn, 'SET statement_timeout = ''20s''');
      PERFORM extensions.dblink_exec(v_conn, 'SET lock_timeout = ''15s''');
      PERFORM extensions.dblink_exec(v_conn, 'SET ROLE authenticated');
      PERFORM * FROM extensions.dblink(v_conn, $jwt$SELECT set_config('request.jwt.claims',
        '{"sub":"11480000-0000-4000-8000-000000000001","role":"authenticated"}', false)$jwt$) AS r(x text);
    END LOOP;
    SELECT result INTO v_initial FROM extensions.dblink('r1148_setup', v_place) AS r(result jsonb);
    v_item := COALESCE(v_initial->>'selectionId', v_initial->>'ffeItemId')::uuid;
    IF v_item IS NULL THEN RAISE EXCEPTION 'placement returned no item: %', v_initial; END IF;
    -- A reproduces the prefix of the public placement path. Use postgres for
    -- its private helper and NOWAIT probe, then authenticated for the real RPC.
    PERFORM extensions.dblink_exec('r1148_a', 'RESET ROLE');
    PERFORM extensions.dblink_exec('r1148_a', 'BEGIN');
    SELECT pid INTO v_a_pid FROM extensions.dblink('r1148_a', 'SELECT pg_backend_pid()') AS r(pid integer);
    SELECT pid INTO v_b_pid FROM extensions.dblink('r1148_b', 'SELECT pg_backend_pid()') AS r(pid integer);
    PERFORM * FROM extensions.dblink('r1148_a', $lock$SELECT public._ffe_lock_job_labels(
      '11480000-0000-4000-8000-000000000002')::text$lock$) AS r(x text);
    PERFORM * FROM extensions.dblink('r1148_a', $lock$SELECT id FROM public.product_configurations
      WHERE id = '11480000-0000-4000-8000-000000000004' FOR UPDATE$lock$) AS r(id uuid);
    PERFORM extensions.dblink_exec('r1148_b', 'BEGIN');
    PERFORM extensions.dblink_send_query('r1148_b', format($revise$SELECT public.revise_project_ffe_configuration(
      '11480000-0000-4000-8000-000000000002', %L,
      '11480000-0000-4000-8000-000000000004', 1,
      (SELECT snapshot_hash FROM public.product_configurations
       WHERE id = '11480000-0000-4000-8000-000000000004'),
      '11480000-0000-4000-8000-000000000005', 1)$revise$, v_item));
    PERFORM extensions.dblink_exec('r1148_setup', 'RESET ROLE');
    FOR attempt IN 1..100 LOOP
      SELECT blocked, advisory INTO v_blocked, v_advisory
      FROM extensions.dblink('r1148_setup', format($observe$
        SELECT %s = ANY(pg_blocking_pids(pid)), wait_event = 'advisory'
        FROM pg_stat_activity WHERE pid = %s AND wait_event_type = 'Lock'
      $observe$, v_a_pid, v_b_pid)) AS r(blocked boolean, advisory boolean);
      EXIT WHEN v_blocked;
      PERFORM pg_sleep(0.05);
    END LOOP;
    -- This is an assertion probe, not a timeout/deadlock-detector oracle.
    PERFORM extensions.dblink_exec('r1148_a', 'SAVEPOINT item_probe');
    BEGIN
      PERFORM * FROM extensions.dblink('r1148_a', format(
        'SELECT id FROM public.project_ffe_items WHERE id = %L FOR UPDATE NOWAIT', v_item)) AS r(id uuid);
      v_free := true;
    EXCEPTION WHEN lock_not_available THEN
      v_detail := 'revision holds the item while waiting for configuration';
    END;
    PERFORM extensions.dblink_exec('r1148_a', 'ROLLBACK TO SAVEPOINT item_probe');
    IF v_free AND v_blocked AND v_advisory THEN
      PERFORM extensions.dblink_exec('r1148_a', 'SET LOCAL ROLE authenticated');
      SELECT result INTO v_result FROM extensions.dblink('r1148_a', v_place) AS r(result jsonb);
      SELECT n INTO v_count FROM extensions.dblink('r1148_a',
        $count$SELECT count(*)::integer FROM public.project_ffe_items
          WHERE project_id = '11480000-0000-4000-8000-000000000002'$count$) AS r(n integer);
      v_replay := v_result = v_initial AND v_count = 1;
    END IF;
    PERFORM extensions.dblink_exec('r1148_a', 'COMMIT');
    SELECT result INTO v_result FROM extensions.dblink_get_result('r1148_b') AS r(result jsonb);
    PERFORM * FROM extensions.dblink_get_result('r1148_b') AS r(result jsonb);
    SELECT matches INTO v_revision FROM extensions.dblink('r1148_b', format($check$
      SELECT spec.configuration_id = '11480000-0000-4000-8000-000000000005'::uuid
        AND item.unit_price_cents = 90000 AND item.trade_price_cents = 60000
        AND item.line_total_cents = item.quantity * 90000
      FROM public.project_ffe_items item JOIN public.project_ffe_specs spec ON spec.ffe_item_id = item.id
      WHERE item.id = %L$check$, v_item)) AS r(matches boolean);
    v_revision := v_revision AND v_result->>'configurationId' = '11480000-0000-4000-8000-000000000005';
    PERFORM extensions.dblink_exec('r1148_b', 'ROLLBACK');
  EXCEPTION WHEN OTHERS THEN
    v_detail := v_detail || ' / interleave error: ' || SQLERRM;
  END;
  -- Closing both actors first rolls back even failed/busy transactions, so
  -- committed fixtures cannot be stranded behind their locks during cleanup.
  FOREACH v_conn IN ARRAY COALESCE(extensions.dblink_get_connections(), ARRAY[]::text[]) LOOP
    IF v_conn IN ('r1148_a', 'r1148_b') THEN
      PERFORM extensions.dblink_disconnect(v_conn);
    END IF;
  END LOOP;
  PERFORM extensions.dblink_exec('r1148_setup', 'RESET ROLE');
  PERFORM * FROM extensions.dblink('r1148_setup', $jwt$SELECT set_config('request.jwt.claims', '{}', false)$jwt$) AS r(x text);
  PERFORM extensions.dblink_exec('r1148_setup', v_cleanup);
  PERFORM extensions.dblink_disconnect('r1148_setup');
  INSERT INTO revise_interleave VALUES (v_blocked AND v_advisory, v_free, v_replay, v_revision, v_detail);
END
$test$;
SELECT diag(detail) FROM revise_interleave WHERE detail <> '';
SELECT ok(advisory_wait, 'revision waits on the placement job advisory lock (pg_blocking_pids)') FROM revise_interleave;
SELECT ok(item_free, 'revision leaves the replay item free while waiting (FOR UPDATE NOWAIT)') FROM revise_interleave;
SELECT ok(replay_ok, 'configured placement replays the saved receipt without a duplicate item') FROM revise_interleave;
SELECT ok(revision_ok, 'revision completes with replacement configuration and prices after replay releases') FROM revise_interleave;
SELECT * FROM finish();
ROLLBACK;
