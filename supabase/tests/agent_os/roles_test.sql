-- ═══════════════════════════════════════════════════════════════════════════
-- Agent OS role tests (migration 00299)
--
-- Exercises the least-privilege contract for agent_reader / agent_writer:
--   1. agent_reader: SELECT from 2-3 business tables succeeds (products,
--      profiles, agent_tasks); INSERT into products fails; UPDATE agent_tasks
--      fails. Accepts EITHER SQLSTATE 42501 (insufficient_privilege) or
--      25006 (read_only_sql_transaction) for the write denials and reports
--      which one actually fired — see the header note on why both are legal
--      outcomes.
--   2. agent_writer: a direct INSERT into agent_tasks succeeds and produces
--      an agent_task_audit row stamped with the actor passed via
--      set_config('app.actor', ...); UPDATE agent_tasks fails; INSERT into
--      products fails.
--   3. agent_writer forgery guard (the 00299 INSERT policy's WITH CHECK,
--      which mirrors enqueue_agent_task's p_status gate — the state-machine
--      trigger is UPDATE-only and does not constrain INSERTs): INSERT born
--      status='approved' FAILS; INSERT carrying a review_state FAILS (both
--      raise the new-row-violates-row-level-security error, SQLSTATE 42501);
--      INSERT born status='awaiting_review' SUCCEEDS (it is the
--      intake-bridge landing status and stays allowed).
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
  PERFORM set_config('app.actor', 'test:agent-writer', true);

  INSERT INTO public.agent_tasks (task_type, summary)
  VALUES ('roles_test.writer_insert', 'agent_writer direct table insert')
  RETURNING id INTO v_new_id;
  RAISE NOTICE 'agent_writer direct INSERT into agent_tasks succeeded, id=%', v_new_id;

  -- UPDATE agent_tasks fails — agent_writer has SELECT/INSERT only.
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

  -- ── Forgery guard (3): the INSERT policy's WITH CHECK blocks pre-approved
  -- rows. RLS WITH CHECK violations surface as SQLSTATE 42501
  -- (insufficient_privilege) with a 'row-level security' message — assert
  -- both, so a plain grant failure can't masquerade as the policy working.

  -- (3a) INSERT born status='approved' fails — would mint a self-approved task.
  BEGIN
    INSERT INTO public.agent_tasks (task_type, summary, status)
    VALUES ('roles_test.forge_approved', 'forged pre-approved task', 'approved');
    RAISE EXCEPTION 'FAIL roles_test: agent_writer INSERT with status=approved should have failed';
  EXCEPTION WHEN insufficient_privilege THEN
    ASSERT SQLERRM LIKE '%row-level security%',
      'FAIL roles_test: expected an RLS violation for status=approved, got: ' || SQLERRM;
    RAISE NOTICE 'agent_writer INSERT born status=approved correctly denied (42501, row-level security)';
  END;

  -- (3b) INSERT carrying a forged review_state fails.
  BEGIN
    INSERT INTO public.agent_tasks (task_type, summary, review_state)
    VALUES ('roles_test.forge_review', 'forged review_state', '{"forged":true}'::jsonb);
    RAISE EXCEPTION 'FAIL roles_test: agent_writer INSERT with a review_state should have failed';
  EXCEPTION WHEN insufficient_privilege THEN
    ASSERT SQLERRM LIKE '%row-level security%',
      'FAIL roles_test: expected an RLS violation for forged review_state, got: ' || SQLERRM;
    RAISE NOTICE 'agent_writer INSERT carrying a review_state correctly denied (42501, row-level security)';
  END;

  -- (3c) INSERT born status='awaiting_review' succeeds — intake-bridge landing
  -- status, deliberately allowed by the policy.
  INSERT INTO public.agent_tasks (task_type, summary, status, awaiting_review_at)
  VALUES ('roles_test.intake_landing', 'intake-bridge landing row', 'awaiting_review', now())
  RETURNING id INTO v_review_id;
  RAISE NOTICE 'agent_writer INSERT born status=awaiting_review succeeded, id=%', v_review_id;

  EXECUTE 'RESET ROLE';

  -- Verify the audit trail — read back as the (unprivileged-role-reset)
  -- session role, which owns agent_task_audit and can see it directly.
  SELECT count(*) INTO v_count FROM public.agent_task_audit
   WHERE task_id = v_new_id AND actor = 'test:agent-writer' AND op = 'INSERT';
  ASSERT v_count >= 1,
    'FAIL roles_test: expected an agent_task_audit row for the agent_writer insert with actor=test:agent-writer, got ' || v_count;
  RAISE NOTICE 'agent_writer insert produced an audit row with actor=test:agent-writer as expected.';

  RAISE NOTICE 'agent_writer case passed.';
  RAISE NOTICE 'All roles_test assertions passed.';
END
$$;

ROLLBACK;
