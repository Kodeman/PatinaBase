-- ═══════════════════════════════════════════════════════════════════════════
-- Agent OS queue-groom tests (migration 00300)
--
-- Exercises groom_agent_tasks() against real queue state produced through the
-- 00297 RPCs (never a raw status-column UPDATE, except the backdating below,
-- which touches non-status timestamp columns only and is legal):
--   (i)   a task parked in awaiting_review, backdated stale -> flagged_stale_at
--         set by groom.
--   (ii)  a task parked failed (p_fatal), backdated past cooldown -> groom
--         requeues it exactly once (status=queued, payload.groom_requeued_at
--         set); driven to failed again and re-backdated -> a SECOND groom
--         run does NOT requeue it again (marker persists) and that run's
--         failed_requeued count is 0.
--   (iii) a claimed (running) task, backdated past the stale-running window
--         -> groom resets it to queued (locked_by/locked_at cleared).
--   (iv)  every groom call leaves a 'succeeded' public.job_runs row with the
--         matching counts in `detail`.
--   (v)   the cron registration (jobname='agent-queue-groom') exists exactly
--         once.
--
-- The advisory-lock 'skipped' path (a second concurrent call while another
-- session holds the same lock) is NOT exercised in this file — it needs a
-- second, separately-connected Postgres session held open concurrently,
-- which doesn't fit a single self-contained transactional psql script. It
-- was verified out-of-band via two concurrent `docker exec` psql sessions
-- (see the delivery report for the transcript); the mechanism itself
-- (`pg_try_advisory_xact_lock(hashtext('job:queue-groom'))`) is otherwise
-- exercised on every successful call below, which always acquires it
-- (nothing else holds the lock during this test).
--
-- How to run:
--   docker exec -i supabase_db_supabase psql -U postgres -d postgres \
--     -v ON_ERROR_STOP=1 < supabase/tests/agent_os/groom_test.sql
--
-- Single transaction, ROLLBACK at the end — re-runnable with no side effects.
-- Assumes a clean agent_tasks/job_runs table (true right after a reset, or
-- right after another ROLLBACK-ending test file in the same session) so the
-- counts below can be asserted exactly rather than as lower bounds.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

DO $$
DECLARE
  v_task       public.agent_tasks;
  v_review_id  uuid;
  v_failed_id  uuid;
  v_running_id uuid;
  v_result1    jsonb;
  v_result2    jsonb;
  v_run_count  int;
BEGIN
  -- ── Seed (i): a task parked in awaiting_review, backdated stale ──────────
  v_task := public.enqueue_agent_task(
              p_task_type => 'groom.review', p_idempotency_key => 'groom-g1',
              p_summary => 'review case');
  v_review_id := v_task.id;
  PERFORM public.claim_agent_tasks(p_task_types => ARRAY['groom.review'], p_batch => 1, p_worker => 'gw1');
  PERFORM public.complete_agent_task(p_id => v_review_id, p_outcome => 'awaiting_review', p_actor => 'gw1');
  UPDATE public.agent_tasks SET awaiting_review_at = now() - interval '49 hours' WHERE id = v_review_id;

  -- ── Seed (ii): a task parked failed (fatal), backdated past cooldown ─────
  v_task := public.enqueue_agent_task(
              p_task_type => 'groom.failed', p_idempotency_key => 'groom-g2',
              p_summary => 'failed case');
  v_failed_id := v_task.id;
  PERFORM public.claim_agent_tasks(p_task_types => ARRAY['groom.failed'], p_batch => 1, p_worker => 'gw1');
  PERFORM public.complete_agent_task(p_id => v_failed_id, p_outcome => 'failed', p_error => 'boom-1', p_fatal => true, p_actor => 'gw1');
  UPDATE public.agent_tasks SET completed_at = now() - interval '7 hours' WHERE id = v_failed_id;

  -- ── Seed (iii): a claimed (running) task, backdated past the stale window ─
  v_task := public.enqueue_agent_task(
              p_task_type => 'groom.orphan', p_idempotency_key => 'groom-g3',
              p_summary => 'orphan case');
  v_running_id := v_task.id;
  PERFORM public.claim_agent_tasks(p_task_types => ARRAY['groom.orphan'], p_batch => 1, p_worker => 'gw1');
  UPDATE public.agent_tasks SET locked_at = now() - interval '2 hours' WHERE id = v_running_id;

  -- Pre-groom sanity.
  SELECT * INTO v_task FROM public.agent_tasks WHERE id = v_review_id;
  ASSERT v_task.status = 'awaiting_review' AND v_task.flagged_stale_at IS NULL,
    'setup sanity: review task should be awaiting_review/unflagged before groom';
  SELECT * INTO v_task FROM public.agent_tasks WHERE id = v_failed_id;
  ASSERT v_task.status = 'failed' AND NOT (v_task.payload ? 'groom_requeued_at'),
    'setup sanity: failed task should have no groom marker before groom';
  SELECT * INTO v_task FROM public.agent_tasks WHERE id = v_running_id;
  ASSERT v_task.status = 'running', 'setup sanity: orphan task should still be running before groom';

  RAISE NOTICE 'Seed complete: review=%, failed=%, running=%', v_review_id, v_failed_id, v_running_id;

  -- ── Groom run #1: all three should fire exactly once each ───────────────
  v_result1 := public.groom_agent_tasks();
  RAISE NOTICE 'groom run #1 result: %', v_result1;
  ASSERT (v_result1 ->> 'stale_flagged')::int   = 1, 'FAIL: groom #1 stale_flagged should be 1, got ' || v_result1;
  ASSERT (v_result1 ->> 'failed_requeued')::int = 1, 'FAIL: groom #1 failed_requeued should be 1, got ' || v_result1;
  ASSERT (v_result1 ->> 'orphans_reset')::int   = 1, 'FAIL: groom #1 orphans_reset should be 1, got ' || v_result1;

  -- (i) stale review is flagged.
  SELECT * INTO v_task FROM public.agent_tasks WHERE id = v_review_id;
  ASSERT v_task.flagged_stale_at IS NOT NULL, 'FAIL (i): review task should be flagged_stale_at after groom #1';
  ASSERT v_task.status = 'awaiting_review', 'FAIL (i): flagging must not change status, got ' || v_task.status;

  -- (ii) failed task requeued exactly once, marker set.
  SELECT * INTO v_task FROM public.agent_tasks WHERE id = v_failed_id;
  ASSERT v_task.status = 'queued', 'FAIL (ii): failed task should be requeued to queued, got ' || v_task.status;
  ASSERT v_task.attempts = 0 AND v_task.last_error IS NULL AND v_task.completed_at IS NULL,
    'FAIL (ii): requeue should have reset attempts/last_error/completed_at';
  ASSERT (v_task.payload ->> 'groom_requeued_at') IS NOT NULL,
    'FAIL (ii): payload.groom_requeued_at marker should be set after groom requeue';

  -- (iii) orphaned running task reset to queued.
  SELECT * INTO v_task FROM public.agent_tasks WHERE id = v_running_id;
  ASSERT v_task.status = 'queued' AND v_task.locked_by IS NULL AND v_task.locked_at IS NULL,
    'FAIL (iii): orphaned running task should be reset to queued/unlocked, got ' || v_task.status;

  RAISE NOTICE 'Cases (i)-(iii) after groom #1 passed.';

  -- ── Drive the (ii) task to failed again, then re-backdate ────────────────
  PERFORM public.claim_agent_tasks(p_task_types => ARRAY['groom.failed'], p_batch => 1, p_worker => 'gw2');
  PERFORM public.complete_agent_task(p_id => v_failed_id, p_outcome => 'failed', p_error => 'boom-2', p_fatal => true, p_actor => 'gw2');
  UPDATE public.agent_tasks SET completed_at = now() - interval '7 hours' WHERE id = v_failed_id;

  SELECT * INTO v_task FROM public.agent_tasks WHERE id = v_failed_id;
  ASSERT v_task.status = 'failed' AND (v_task.payload ->> 'groom_requeued_at') IS NOT NULL,
    'setup sanity: task should be failed again with the marker STILL present before groom #2';

  -- ── Groom run #2: the marker must prevent a second automatic requeue ────
  v_result2 := public.groom_agent_tasks();
  RAISE NOTICE 'groom run #2 result: %', v_result2;
  ASSERT (v_result2 ->> 'failed_requeued')::int = 0,
    'FAIL: groom #2 should NOT requeue the already-marked task, got failed_requeued=' || (v_result2 ->> 'failed_requeued');

  SELECT * INTO v_task FROM public.agent_tasks WHERE id = v_failed_id;
  ASSERT v_task.status = 'failed',
    'FAIL: the marked task should remain failed (not re-requeued) after groom #2, got ' || v_task.status;

  RAISE NOTICE 'Groom-does-not-double-requeue case passed.';

  -- ── (iv) job_runs has a succeeded row per groom call with sane detail ────
  SELECT count(*) INTO v_run_count FROM public.job_runs
   WHERE job_name = 'queue-groom' AND status = 'succeeded';
  ASSERT v_run_count = 2, 'FAIL (iv): expected exactly 2 succeeded job_runs rows, got ' || v_run_count;

  SELECT count(*) INTO v_run_count FROM public.job_runs
   WHERE job_name = 'queue-groom' AND status = 'succeeded'
     AND detail = jsonb_build_object('stale_flagged', 1, 'failed_requeued', 1, 'orphans_reset', 1);
  ASSERT v_run_count = 1, 'FAIL (iv): expected exactly 1 job_runs row matching groom #1''s detail, got ' || v_run_count;

  SELECT count(*) INTO v_run_count FROM public.job_runs
   WHERE job_name = 'queue-groom' AND status = 'succeeded'
     AND detail = jsonb_build_object('stale_flagged', 0, 'failed_requeued', 0, 'orphans_reset', 0);
  ASSERT v_run_count = 1, 'FAIL (iv): expected exactly 1 job_runs row matching groom #2''s all-zero detail, got ' || v_run_count;

  RAISE NOTICE 'Case (iv) job_runs bookkeeping passed.';

  RAISE NOTICE 'All groom_test assertions passed.';
END
$$;

-- ── (v) cron registration exists exactly once ────────────────────────────
DO $$
DECLARE
  v_cron_count int;
BEGIN
  SELECT count(*) INTO v_cron_count FROM cron.job WHERE jobname = 'agent-queue-groom';
  ASSERT v_cron_count = 1, 'FAIL (v): expected exactly 1 agent-queue-groom cron.job row, got ' || v_cron_count;
  RAISE NOTICE 'Case (v) cron registration passed.';
END
$$;

ROLLBACK;
