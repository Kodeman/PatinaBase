-- ═══════════════════════════════════════════════════════════════════════════
-- Agent OS role tests (migrations 00299, 00484)
--
-- Exercises the least-privilege contract for agent_reader / agent_writer:
--   1. agent_reader: SELECT from 2-3 business tables succeeds (products,
--      profiles, agent_tasks); INSERT into products fails; UPDATE agent_tasks
--      fails. Accepts EITHER SQLSTATE 42501 (insufficient_privilege) or
--      25006 (read_only_sql_transaction) for the write denials and reports
--      which one actually fired — see the header note on why both are legal
--      outcomes.
--   2. agent_writer: a direct INSERT into agent_tasks is DENIED at the
--      table-grant layer; enqueue_agent_task succeeds and produces an
--      agent_task_audit row stamped with the actor passed as p_actor;
--      UPDATE agent_tasks fails; INSERT into products fails.
--   3. agent_writer forgery guard (enqueue_agent_task's p_status gate):
--      an enqueue born status='approved' FAILS; one born
--      status='awaiting_review' SUCCEEDS (it is the intake-bridge landing
--      status and stays allowed).
--
-- Why case 2 asserts a denial: 00299 originally granted agent_writer
-- SELECT/INSERT on agent_tasks plus two RLS policies. 00484
-- (public_rpc_authorization_contract) revoked every agent_tasks privilege
-- from agent_writer and dropped both policies — agent writes must cross the
-- audited SECURITY DEFINER enqueue_agent_task, never the table directly.
--
-- Why two SQLSTATEs are acceptable for agent_reader's write denials: 00299
-- grants agent_reader ZERO write privileges (the real enforcement) AND sets
-- an advisory `default_transaction_read_only = on` via ALTER ROLE ... SET.
-- That role-level GUC default is documented to apply "at the start of a new
-- session" for a role that actually LOGS IN as that role — agent_reader is
-- NOLOGIN, and this test only ever reaches it via `SET LOCAL ROLE` inside an
-- already-running postgres session, so in practice the GUC default is not
-- expected to engage and 42501 should be the one that fires. The test does
-- not assume that ordering — it accepts either SQLSTATE and prints which one
-- it observed, so a future Postgres/Supabase behavior change here is visible
-- in the test output rather than silently invalidating the assertion.
--
-- How to run:
--   docker exec -i supabase_db_supabase psql -U postgres -d postgres \
--     -v ON_ERROR_STOP=1 < supabase/tests/agent_os/roles_test.sql
--
-- Single transaction, ROLLBACK at the end — re-runnable with no side effects
-- (the role GRANTs the migration made persist across the rollback, same as
-- any other cluster-level role state; that's expected and fine).
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─── agent_reader: broad SELECT, zero write ─────────────────────────────────
DO $$
DECLARE
  v_products_count int;
  v_profiles_count int;
  v_tasks_count    int;
  v_write_sqlstate text;
BEGIN
  EXECUTE 'SET LOCAL ROLE agent_reader';

  -- SELECT from 2-3 business tables succeeds (row count may legitimately be
  -- 0 if RLS filters everything out for a role with no matching policy
  -- predicate — pg_read_all_data does NOT bypass RLS. "Succeeds" here means
  -- the statement does not raise, which is what we assert).
  SELECT count(*) INTO v_products_count FROM public.products;
  SELECT count(*) INTO v_profiles_count FROM public.profiles;
  SELECT count(*) INTO v_tasks_count    FROM public.agent_tasks;
  RAISE NOTICE 'agent_reader SELECT ok — products=%, profiles=%, agent_tasks=% (row counts are RLS-filtered, not the point of this assertion)',
    v_products_count, v_profiles_count, v_tasks_count;

  -- INSERT into products fails.
  BEGIN
    INSERT INTO public.products (name, source_url, captured_by, captured_at)
    VALUES ('agent_reader should not be able to insert this', 'https://example.test/x',
            gen_random_uuid(), now());
    RAISE EXCEPTION 'FAIL roles_test: agent_reader INSERT into products should have failed';
  EXCEPTION
    WHEN insufficient_privilege THEN
      GET STACKED DIAGNOSTICS v_write_sqlstate = RETURNED_SQLSTATE;
      RAISE NOTICE 'agent_reader INSERT into products correctly denied — SQLSTATE % (insufficient_privilege)', v_write_sqlstate;
    WHEN read_only_sql_transaction THEN
      GET STACKED DIAGNOSTICS v_write_sqlstate = RETURNED_SQLSTATE;
      RAISE NOTICE 'agent_reader INSERT into products correctly denied — SQLSTATE % (read_only_sql_transaction)', v_write_sqlstate;
  END;

  -- UPDATE agent_tasks fails.
  BEGIN
    UPDATE public.agent_tasks SET summary = 'agent_reader should not be able to do this' WHERE false;
    RAISE EXCEPTION 'FAIL roles_test: agent_reader UPDATE on agent_tasks should have failed';
  EXCEPTION
    WHEN insufficient_privilege THEN
      GET STACKED DIAGNOSTICS v_write_sqlstate = RETURNED_SQLSTATE;
      RAISE NOTICE 'agent_reader UPDATE on agent_tasks correctly denied — SQLSTATE % (insufficient_privilege)', v_write_sqlstate;
    WHEN read_only_sql_transaction THEN
      GET STACKED DIAGNOSTICS v_write_sqlstate = RETURNED_SQLSTATE;
      RAISE NOTICE 'agent_reader UPDATE on agent_tasks correctly denied — SQLSTATE % (read_only_sql_transaction)', v_write_sqlstate;
  END;

  RAISE NOTICE 'agent_reader case passed.';
END
$$;

RESET ROLE;

-- ─── agent_writer: enqueue-only write surface ───────────────────────────────
DO $$
DECLARE
  v_new_id    uuid;
  v_review_id uuid;
  v_count     int;
BEGIN
  EXECUTE 'SET LOCAL ROLE agent_writer';

  -- (2a) Direct INSERT into agent_tasks is denied at the table-grant layer,
  -- not by RLS (00484 revoked the grant and dropped the policies).
  BEGIN
    INSERT INTO public.agent_tasks (task_type, summary)
    VALUES ('roles_test.writer_insert', 'agent_writer direct table insert');
    RAISE EXCEPTION 'FAIL roles_test: agent_writer direct INSERT into agent_tasks should have failed';
  EXCEPTION WHEN insufficient_privilege THEN
    ASSERT SQLERRM LIKE 'permission denied for table agent_tasks%',
      'FAIL roles_test: expected a table-grant denial for the direct INSERT, got: ' || SQLERRM;
    RAISE NOTICE 'agent_writer direct INSERT into agent_tasks correctly denied (42501, table grant)';
  END;

  -- (2b) enqueue_agent_task succeeds; p_actor becomes the audit actor.
  SELECT (public.enqueue_agent_task(
            p_task_type => 'roles_test.writer_enqueue',
            p_summary   => 'agent_writer enqueue',
            p_actor     => 'test:agent-writer')).id
    INTO v_new_id;
  ASSERT v_new_id IS NOT NULL,
    'FAIL roles_test: agent_writer enqueue_agent_task returned no row';
  RAISE NOTICE 'agent_writer enqueue_agent_task succeeded, id=%', v_new_id;

  -- UPDATE agent_tasks fails — agent_writer holds no table privilege.
  BEGIN
    UPDATE public.agent_tasks SET summary = 'nope' WHERE id = v_new_id;
    RAISE EXCEPTION 'FAIL roles_test: agent_writer UPDATE on agent_tasks should have failed';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'agent_writer UPDATE on agent_tasks correctly denied (insufficient_privilege)';
  END;

  -- INSERT into products fails — agent_writer has no grant there at all.
  BEGIN
    INSERT INTO public.products (name, source_url, captured_by, captured_at)
    VALUES ('agent_writer should not be able to insert this', 'https://example.test/y',
            gen_random_uuid(), now());
    RAISE EXCEPTION 'FAIL roles_test: agent_writer INSERT into products should have failed';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'agent_writer INSERT into products correctly denied (insufficient_privilege)';
  END;

  -- ── Forgery guard (3): enqueue_agent_task's p_status gate.

  -- (3a) Born status='approved' fails — would mint a self-approved task.
  BEGIN
    PERFORM public.enqueue_agent_task(
      p_task_type => 'roles_test.forge_approved',
      p_summary   => 'forged pre-approved task',
      p_status    => 'approved',
      p_actor     => 'test:agent-writer');
    RAISE EXCEPTION 'FAIL roles_test: agent_writer enqueue born status=approved should have failed';
  EXCEPTION WHEN raise_exception THEN
    ASSERT SQLERRM LIKE 'enqueue_agent_task: p_status must be queued or awaiting_review%',
      'FAIL roles_test: expected the p_status gate for status=approved, got: ' || SQLERRM;
    RAISE NOTICE 'agent_writer enqueue born status=approved correctly refused (p_status gate)';
  END;

  -- (3b) Born status='awaiting_review' succeeds — intake-bridge landing
  -- status, deliberately allowed. enqueue_agent_task takes no review_state,
  -- so a forged review_state has no path in.
  SELECT (public.enqueue_agent_task(
            p_task_type => 'roles_test.intake_landing',
            p_summary   => 'intake-bridge landing row',
            p_status    => 'awaiting_review',
            p_actor     => 'test:agent-writer')).id
    INTO v_review_id;
  ASSERT v_review_id IS NOT NULL,
    'FAIL roles_test: agent_writer enqueue born status=awaiting_review returned no row';
  RAISE NOTICE 'agent_writer enqueue born status=awaiting_review succeeded, id=%', v_review_id;

  EXECUTE 'RESET ROLE';

  -- Verify the audit trail as the session owner.
  SELECT count(*) INTO v_count FROM public.agent_task_audit
   WHERE task_id = v_new_id AND actor = 'test:agent-writer' AND op = 'INSERT';
  ASSERT v_count >= 1,
    'FAIL roles_test: expected an agent_task_audit row for the agent_writer enqueue with actor=test:agent-writer, got ' || v_count;
  RAISE NOTICE 'agent_writer enqueue produced an audit row with actor=test:agent-writer as expected.';

  RAISE NOTICE 'agent_writer case passed.';
  RAISE NOTICE 'All roles_test assertions passed.';
END
$$;

ROLLBACK;
