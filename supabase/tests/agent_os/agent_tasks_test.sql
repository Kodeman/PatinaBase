-- ═══════════════════════════════════════════════════════════════════════════
-- Agent OS agent_tasks queue tests (migrations 00297 + 00298 + 00378)
--
-- Exercises the queue contract:
--   1. idempotency: 'ignore' double-enqueue = 1 row; 'resurrect' revives a
--      done row (queued, attempts 0) but leaves a live row untouched.
--   2. enqueue p_status='awaiting_review' stamps awaiting_review_at; any other
--      non-queued p_status raises.
--   3. claim flips queued->running (+attempts); a second claim returns nothing;
--      two GPU workers with the same stage filter claim distinct tasks and
--      stamp their own WORKER_ID into both the lease and audit trail.
--   4. a stale running task is reclaimed; only the new lease owner can
--      complete it or enqueue successors (including indirect-lineage
--      children), and both writes require a non-empty actor.
--   5. complete 'failed' backoff walks +1m/+5m/+25m; parks at attempts>=max;
--      p_fatal parks immediately.
--   6. review: reject w/o note raises; reject w/ note merges payload.feedback;
--      approve merges payload_patch; review_state populated incl. meta.
--   7. a direct illegal UPDATE raises from the transition trigger.
--   8. mutations leave agent_task_audit rows with the expected actor.
--   9. cowork bridge: mapping + id preservation + counts; cowork_tasks frozen.
--  10. anon/authenticated cannot EXECUTE the queue RPCs.
--
-- How to run:
--   scripts/run-supabase-sql-test.sh supabase/tests/agent_os/agent_tasks_test.sql
--
-- Single transaction, ROLLBACK at the end — re-runnable with no side effects.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─── Cases 1–8 + 10 setup: exercised through the RPCs ───────────────────────
DO $$
DECLARE
  v_count  int;
  v_id     uuid;
  v_task   public.agent_tasks;
  v_task2  public.agent_tasks;
  v_aid    uuid;   -- task A
  v_bid    uuid;   -- task B (live)
  v_hid    uuid;   -- task H (review reject)
  v_iid    uuid;   -- task I (review approve)
  v_gpu_refine public.agent_tasks;
  v_gpu_splat  public.agent_tasks;
  v_claim_a uuid;
  v_claim_b uuid;
  v_before public.agent_tasks;
  v_key_prefix text := 'agent-tasks-test:' || txid_current()::text || ':';
BEGIN
  -- ── Case 1a: 'ignore' double-enqueue collapses to one row, unchanged. ──
  v_task  := public.enqueue_agent_task(
               p_task_type => v_key_prefix || 'enqueue.ignore', p_summary => 'first',
               p_idempotency_key => v_key_prefix || 'k1', p_actor => 'actor-a');
  v_aid := v_task.id;
  v_task2 := public.enqueue_agent_task(
               p_task_type => v_key_prefix || 'enqueue.ignore', p_summary => 'SECOND',
               p_idempotency_key => v_key_prefix || 'k1', p_actor => 'actor-a');
  SELECT count(*) INTO v_count FROM public.agent_tasks
   WHERE idempotency_key = v_key_prefix || 'k1';
  ASSERT v_count = 1, 'FAIL 1a: ignore double-enqueue should keep 1 row, got ' || v_count;
  ASSERT v_task2.id = v_aid, 'FAIL 1a: ignore should return the existing row';
  ASSERT v_task2.summary = 'first', 'FAIL 1a: ignore must not overwrite, got ' || v_task2.summary;

  -- ── Case 1b: 'resurrect' revives a DONE row (queued, attempts 0). ──
  -- Drive A through its lifecycle first: queued -> running -> done.
  SELECT id INTO v_id FROM public.claim_agent_tasks(
    p_task_types => ARRAY[v_key_prefix || 'enqueue.ignore'], p_batch => 1, p_worker => 'w1');
  ASSERT v_id = v_aid, 'FAIL 1b: expected to claim task A';
  PERFORM public.complete_agent_task(p_id => v_aid, p_outcome => 'done', p_actor => 'w1');
  SELECT * INTO v_task FROM public.agent_tasks WHERE id = v_aid;
  ASSERT v_task.status = 'done', 'FAIL 1b: A should be done, got ' || v_task.status;

  v_task := public.enqueue_agent_task(
              p_task_type => v_key_prefix || 'enqueue.ignore',
              p_idempotency_key => v_key_prefix || 'k1',
              p_on_conflict => 'resurrect', p_actor => 'actor-a');
  ASSERT v_task.status = 'queued' AND v_task.attempts = 0
         AND v_task.completed_at IS NULL AND v_task.id = v_aid,
    'FAIL 1b: resurrect should revive A to queued/attempts=0, got ' || v_task.status || '/' || v_task.attempts;

  -- ── Case 1c: 'resurrect' on a LIVE (queued) row does not touch it. ──
  v_task := public.enqueue_agent_task(
              p_task_type => v_key_prefix || 'enqueue.live',
              p_idempotency_key => v_key_prefix || 'k2',
              p_run_after => now() + interval '1 day', p_summary => 'live-original',
              p_actor => 'agent-tasks-test-setup');
  v_bid := v_task.id;
  v_task2 := public.enqueue_agent_task(
               p_task_type => v_key_prefix || 'enqueue.live',
               p_idempotency_key => v_key_prefix || 'k2',
               p_on_conflict => 'resurrect', p_summary => 'SHOULD-NOT-APPLY',
               p_actor => 'agent-tasks-test-setup');
  ASSERT v_task2.id = v_bid AND v_task2.summary = 'live-original'
         AND v_task2.run_after > now() + interval '23 hours',
    'FAIL 1c: resurrect must leave a live row untouched';

  -- ── Case 2: enqueue awaiting_review stamps awaiting_review_at; bad status raises. ──
  v_task := public.enqueue_agent_task(
              p_task_type => v_key_prefix || 'enqueue.review',
              p_idempotency_key => v_key_prefix || 'k3',
              p_status => 'awaiting_review', p_actor => 'agent-tasks-test-setup');
  ASSERT v_task.status = 'awaiting_review' AND v_task.awaiting_review_at IS NOT NULL,
    'FAIL 2a: awaiting_review enqueue should stamp awaiting_review_at';
  BEGIN
    PERFORM public.enqueue_agent_task(
      p_task_type => v_key_prefix || 'enqueue.bad', p_status => 'running',
      p_actor => 'agent-tasks-test-setup');
    RAISE EXCEPTION 'FAIL 2b: enqueue with p_status=running should raise';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM LIKE 'FAIL%' THEN RAISE; END IF;
  END;

  -- ── Case 3: claim flips to running/attempts+1; second claim empty. ──
  PERFORM public.enqueue_agent_task(
    p_task_type => v_key_prefix || 'claim.test',
    p_idempotency_key => v_key_prefix || 'k4',
    p_actor => 'agent-tasks-test-setup');
  SELECT id INTO v_id FROM public.claim_agent_tasks(
    p_task_types => ARRAY[v_key_prefix || 'claim.test'], p_batch => 10, p_worker => 'w1');
  SELECT * INTO v_task FROM public.agent_tasks WHERE id = v_id;
  ASSERT v_task.status = 'running' AND v_task.attempts = 1
         AND v_task.locked_by = 'w1' AND v_task.started_at IS NOT NULL,
    'FAIL 3: claim should set running/attempts=1/locked_by, got ' || v_task.status || '/' || v_task.attempts;
  SELECT count(*) INTO v_count FROM public.claim_agent_tasks(
    p_task_types => ARRAY[v_key_prefix || 'claim.test'], p_batch => 10, p_worker => 'w1');
  ASSERT v_count = 0, 'FAIL 3: a second claim must return nothing, got ' || v_count;

  -- ── Case 3b: two GPU workers claim two distinct P2 stage tasks. ──
  -- Fixed old created_at values make the fixture deterministic without touching
  -- any pre-existing local queue rows. The enclosing transaction rolls back
  -- both queue and audit rows at the end of the suite.
  v_gpu_refine := public.enqueue_agent_task(
    p_task_type => 'scan_pipeline.refine',
    p_priority => 1,
    p_idempotency_key => v_key_prefix || 'p2:refine',
    p_actor => 'p2-queue-proof-setup');
  v_gpu_splat := public.enqueue_agent_task(
    p_task_type => 'scan_pipeline.splat',
    p_priority => 1,
    p_idempotency_key => v_key_prefix || 'p2:splat',
    p_actor => 'p2-queue-proof-setup');

  PERFORM set_config('app.actor', 'p2-queue-proof-setup', true);
  UPDATE public.agent_tasks
     SET created_at = CASE id
       WHEN v_gpu_refine.id THEN '2000-01-01T00:00:00Z'::timestamptz
       WHEN v_gpu_splat.id  THEN '2000-01-02T00:00:00Z'::timestamptz
     END
   WHERE id IN (v_gpu_refine.id, v_gpu_splat.id);

  SELECT id INTO v_claim_a FROM public.claim_agent_tasks(
    p_task_types => ARRAY['scan_pipeline.refine', 'scan_pipeline.splat'],
    p_batch => 1,
    p_worker => 'p2-gpu-worker-a');
  SELECT id INTO v_claim_b FROM public.claim_agent_tasks(
    p_task_types => ARRAY['scan_pipeline.refine', 'scan_pipeline.splat'],
    p_batch => 1,
    p_worker => 'p2-gpu-worker-b');

  ASSERT v_claim_a = v_gpu_refine.id,
    'FAIL 3b: worker A should claim the first GPU task';
  ASSERT v_claim_b = v_gpu_splat.id,
    'FAIL 3b: worker B should claim the second GPU task';
  ASSERT v_claim_a <> v_claim_b,
    'FAIL 3b: two workers must never receive the same task id';

  SELECT * INTO v_task FROM public.agent_tasks WHERE id = v_claim_a;
  SELECT * INTO v_task2 FROM public.agent_tasks WHERE id = v_claim_b;
  ASSERT v_task.status = 'running' AND v_task.attempts = 1
         AND v_task.locked_by = 'p2-gpu-worker-a',
    'FAIL 3b: worker A lease must carry its WORKER_ID';
  ASSERT v_task2.status = 'running' AND v_task2.attempts = 1
         AND v_task2.locked_by = 'p2-gpu-worker-b',
    'FAIL 3b: worker B lease must carry its WORKER_ID';

  SELECT count(*) INTO v_count FROM public.agent_task_audit a
   WHERE a.task_id = v_claim_a
     AND a.op = 'UPDATE'
     AND a.actor = 'p2-gpu-worker-a'
     AND a.old_row ->> 'status' = 'queued'
     AND a.new_row ->> 'status' = 'running'
     AND a.new_row ->> 'locked_by' = 'p2-gpu-worker-a';
  ASSERT v_count = 1,
    'FAIL 3b: worker A must have exactly one attributed claim audit, got ' || v_count;

  SELECT count(*) INTO v_count FROM public.agent_task_audit a
   WHERE a.task_id = v_claim_b
     AND a.op = 'UPDATE'
     AND a.actor = 'p2-gpu-worker-b'
     AND a.old_row ->> 'status' = 'queued'
     AND a.new_row ->> 'status' = 'running'
     AND a.new_row ->> 'locked_by' = 'p2-gpu-worker-b';
  ASSERT v_count = 1,
    'FAIL 3b: worker B must have exactly one attributed claim audit, got ' || v_count;

  -- ── Case 4: stale lease reclaim transfers completion ownership. ──
  PERFORM set_config('app.actor', 'agent-tasks-test-setup', true);
  UPDATE public.agent_tasks SET locked_at = now() - interval '16 minutes' WHERE id = v_id;
  SELECT count(*) INTO v_count FROM public.claim_agent_tasks(
    p_task_types => ARRAY[v_key_prefix || 'claim.test'], p_batch => 10, p_worker => 'w2');
  ASSERT v_count = 1, 'FAIL 4: a 16-min-stale running task should be reclaimed, got ' || v_count;
  SELECT * INTO v_task FROM public.agent_tasks WHERE id = v_id;
  ASSERT v_task.attempts = 2 AND v_task.locked_by = 'w2',
    'FAIL 4: reclaim should bump attempts to 2 and re-lock, got ' || v_task.attempts || '/' || coalesce(v_task.locked_by,'null');

  v_before := v_task;
  BEGIN
    PERFORM public.complete_agent_task(
      p_id => v_id, p_outcome => 'done', p_actor => 'w1');
    RAISE EXCEPTION 'FAIL 4a: expired owner w1 must not complete w2''s lease';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM LIKE 'FAIL%' THEN RAISE; END IF;
    ASSERT SQLERRM LIKE '%complete_agent_task: lease ownership rejected%',
      'FAIL 4a: unexpected ownership rejection: ' || SQLERRM;
  END;

  SELECT * INTO v_task2 FROM public.agent_tasks WHERE id = v_id;
  ASSERT to_jsonb(v_task2) = to_jsonb(v_before),
    'FAIL 4b: rejected completion must not mutate the B-owned row';

  -- A stale owner cannot advance orchestration by enqueueing a child. Test
  -- both direct lineage (child points at the leased task) and indirect
  -- lineage (catalog_review-style child points at a separate commit task).
  BEGIN
    PERFORM public.enqueue_agent_successor_if_owned(
      p_owner_task_id => v_id,
      p_task_type => v_key_prefix || 'successor.stale.direct',
      p_idempotency_key => v_key_prefix || 'successor-stale-direct',
      p_parent_task_id => v_id,
      p_actor => 'w1');
    RAISE EXCEPTION 'FAIL 4c: expired owner w1 must not enqueue a direct-lineage successor';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM LIKE 'FAIL%' THEN RAISE; END IF;
    ASSERT SQLERRM LIKE '%enqueue_agent_successor_if_owned: lease ownership rejected%',
      'FAIL 4c: unexpected direct-lineage ownership rejection: ' || SQLERRM;
  END;

  BEGIN
    PERFORM public.enqueue_agent_successor_if_owned(
      p_owner_task_id => v_id,
      p_task_type => v_key_prefix || 'successor.stale.indirect',
      p_idempotency_key => v_key_prefix || 'successor-stale-indirect',
      p_parent_task_id => v_bid,
      p_actor => 'w1');
    RAISE EXCEPTION 'FAIL 4d: expired owner w1 must not enqueue an indirect-lineage successor';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM LIKE 'FAIL%' THEN RAISE; END IF;
    ASSERT SQLERRM LIKE '%enqueue_agent_successor_if_owned: lease ownership rejected%',
      'FAIL 4d: unexpected indirect-lineage ownership rejection: ' || SQLERRM;
  END;

  SELECT count(*) INTO v_count FROM public.agent_tasks
   WHERE idempotency_key IN (
     v_key_prefix || 'successor-stale-direct',
     v_key_prefix || 'successor-stale-indirect');
  ASSERT v_count = 0,
    'FAIL 4e: stale successor attempts must create zero child rows, got ' || v_count;

  SELECT count(*) INTO v_count FROM public.claim_agent_tasks(
    p_task_types => ARRAY[
      v_key_prefix || 'successor.stale.direct',
      v_key_prefix || 'successor.stale.indirect'],
    p_batch => 10,
    p_worker => 'w3');
  ASSERT v_count = 0,
    'FAIL 4f: worker C must have no stale-A child to claim, got ' || v_count;

  BEGIN
    PERFORM public.enqueue_agent_successor_if_owned(
      p_owner_task_id => v_id,
      p_task_type => v_key_prefix || 'successor.blank-actor',
      p_idempotency_key => v_key_prefix || 'successor-blank-actor',
      p_parent_task_id => v_id,
      p_actor => '   ');
    RAISE EXCEPTION 'FAIL 4g: blank successor actor must be rejected';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM LIKE 'FAIL%' THEN RAISE; END IF;
    ASSERT SQLERRM LIKE '%enqueue_agent_successor_if_owned: p_actor must be non-empty%',
      'FAIL 4g: unexpected blank-actor rejection: ' || SQLERRM;
  END;

  BEGIN
    PERFORM public.enqueue_agent_successor_if_owned(
      p_owner_task_id => v_id,
      p_task_type => v_key_prefix || 'successor.blank-key',
      p_idempotency_key => '   ',
      p_parent_task_id => v_id,
      p_actor => 'w2');
    RAISE EXCEPTION 'FAIL 4h: blank successor idempotency key must be rejected';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM LIKE 'FAIL%' THEN RAISE; END IF;
    ASSERT SQLERRM LIKE '%enqueue_agent_successor_if_owned: p_idempotency_key must be non-empty%',
      'FAIL 4h: unexpected blank-key rejection: ' || SQLERRM;
  END;

  -- Current owner B may enqueue; a crash/retry repeats the same call and gets
  -- the same conflict-ignore row rather than creating duplicate work.
  v_task := public.enqueue_agent_successor_if_owned(
    p_owner_task_id => v_id,
    p_task_type => v_key_prefix || 'successor.valid',
    p_idempotency_key => v_key_prefix || 'successor-valid',
    p_parent_task_id => v_id,
    p_actor => 'w2');
  v_task2 := public.enqueue_agent_successor_if_owned(
    p_owner_task_id => v_id,
    p_task_type => v_key_prefix || 'successor.valid',
    p_idempotency_key => v_key_prefix || 'successor-valid',
    p_parent_task_id => v_id,
    p_actor => 'w2');
  ASSERT v_task.id = v_task2.id AND v_task.parent_task_id = v_id,
    'FAIL 4i: valid-owner retry must return the same direct-lineage child';
  SELECT count(*) INTO v_count FROM public.agent_tasks
   WHERE idempotency_key = v_key_prefix || 'successor-valid';
  ASSERT v_count = 1,
    'FAIL 4i: valid-owner retry must create exactly one child, got ' || v_count;

  v_task := public.enqueue_agent_successor_if_owned(
    p_owner_task_id => v_id,
    p_task_type => v_key_prefix || 'successor.valid.indirect',
    p_idempotency_key => v_key_prefix || 'successor-valid-indirect',
    p_parent_task_id => v_bid,
    p_actor => 'w2');
  ASSERT v_task.parent_task_id = v_bid,
    'FAIL 4j: ownership fence must preserve an independently supplied lineage parent';

  PERFORM public.complete_agent_task(
    p_id => v_id, p_outcome => 'done', p_actor => 'w2');
  SELECT * INTO v_task FROM public.agent_tasks WHERE id = v_id;
  ASSERT v_task.status = 'done' AND v_task.locked_by IS NULL
         AND v_task.completed_at IS NOT NULL,
    'FAIL 4k: current owner w2 should complete successfully';

  BEGIN
    PERFORM public.enqueue_agent_successor_if_owned(
      p_owner_task_id => v_id,
      p_task_type => v_key_prefix || 'successor.after-complete',
      p_idempotency_key => v_key_prefix || 'successor-after-complete',
      p_parent_task_id => v_id,
      p_actor => 'w2');
    RAISE EXCEPTION 'FAIL 4l: a terminal owner must not enqueue a successor';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM LIKE 'FAIL%' THEN RAISE; END IF;
    ASSERT SQLERRM LIKE '%enqueue_agent_successor_if_owned: owner task % is done (must be running)%',
      'FAIL 4l: unexpected terminal-owner rejection: ' || SQLERRM;
  END;

  SELECT count(*) INTO v_count FROM public.agent_task_audit a
   WHERE a.task_id = v_id AND a.op = 'UPDATE' AND a.actor = 'w1'
     AND a.old_row ->> 'status' = 'queued'
     AND a.new_row ->> 'status' = 'running'
     AND a.new_row ->> 'locked_by' = 'w1';
  ASSERT v_count = 1,
    'FAIL 4m: worker w1 must have exactly its original claim audit, got ' || v_count;

  SELECT count(*) INTO v_count FROM public.agent_task_audit a
   WHERE a.task_id = v_id AND a.op = 'UPDATE' AND a.actor = 'w1'
     AND a.new_row ->> 'status' = 'done';
  ASSERT v_count = 0,
    'FAIL 4m: rejected worker w1 must have no completion audit, got ' || v_count;

  SELECT count(*) INTO v_count FROM public.agent_task_audit a
   WHERE a.task_id = v_id AND a.op = 'UPDATE' AND a.actor = 'w2'
     AND a.old_row ->> 'status' = 'running'
     AND a.new_row ->> 'status' = 'running'
     AND a.new_row ->> 'locked_by' = 'w2';
  ASSERT v_count = 1,
    'FAIL 4m: worker w2 must have exactly one reclaim audit, got ' || v_count;

  SELECT count(*) INTO v_count FROM public.agent_task_audit a
   WHERE a.task_id = v_id AND a.op = 'UPDATE' AND a.actor = 'w2'
     AND a.old_row ->> 'status' = 'running'
     AND a.new_row ->> 'status' = 'done';
  ASSERT v_count = 1,
    'FAIL 4m: worker w2 must have exactly one completion audit, got ' || v_count;

  -- A whitespace-only actor is rejected before any outcome mutation.
  v_task := public.enqueue_agent_task(
    p_task_type => v_key_prefix || 'actor.required',
    p_idempotency_key => v_key_prefix || 'actor-required',
    p_actor => 'agent-tasks-test-setup');
  SELECT id INTO v_id FROM public.claim_agent_tasks(
    p_task_types => ARRAY[v_key_prefix || 'actor.required'], p_batch => 1,
    p_worker => 'actor-required-worker');
  SELECT * INTO v_before FROM public.agent_tasks WHERE id = v_id;
  BEGIN
    PERFORM public.complete_agent_task(
      p_id => v_id, p_outcome => 'done', p_actor => '   ');
    RAISE EXCEPTION 'FAIL 4n: blank completion actor must be rejected';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM LIKE 'FAIL%' THEN RAISE; END IF;
    ASSERT SQLERRM LIKE '%complete_agent_task: p_actor must be non-empty%',
      'FAIL 4n: unexpected blank-actor rejection: ' || SQLERRM;
  END;
  SELECT * INTO v_task2 FROM public.agent_tasks WHERE id = v_id;
  ASSERT to_jsonb(v_task2) = to_jsonb(v_before),
    'FAIL 4n: blank-actor rejection must not mutate the row';
  PERFORM public.complete_agent_task(
    p_id => v_id, p_outcome => 'done', p_actor => 'actor-required-worker');

  -- ── Case 5: failed backoff walk +1m/+5m/+25m. ──
  PERFORM public.enqueue_agent_task(
    p_task_type => v_key_prefix || 'backoff.test',
    p_idempotency_key => v_key_prefix || 'k5',
    p_max_attempts => 10, p_actor => 'agent-tasks-test-setup');

  SELECT id INTO v_id FROM public.claim_agent_tasks(
    p_task_types => ARRAY[v_key_prefix || 'backoff.test'], p_batch => 1, p_worker => 'w1');   -- attempts=1
  PERFORM public.complete_agent_task(
    p_id => v_id, p_outcome => 'failed', p_error => 'e1', p_actor => 'w1');
  SELECT * INTO v_task FROM public.agent_tasks WHERE id = v_id;
  ASSERT v_task.status = 'queued' AND v_task.last_error = 'e1'
         AND v_task.run_after BETWEEN now() + interval '50 seconds' AND now() + interval '70 seconds',
    'FAIL 5a: first failure should back off ~1 minute, run_after=' || v_task.run_after;

  PERFORM set_config('app.actor', 'agent-tasks-test-setup', true);
  UPDATE public.agent_tasks SET run_after = now() WHERE id = v_id;               -- make claimable
  SELECT id INTO v_id FROM public.claim_agent_tasks(
    p_task_types => ARRAY[v_key_prefix || 'backoff.test'], p_batch => 1, p_worker => 'w1');   -- attempts=2
  PERFORM public.complete_agent_task(
    p_id => v_id, p_outcome => 'failed', p_error => 'e2', p_actor => 'w1');
  SELECT * INTO v_task FROM public.agent_tasks WHERE id = v_id;
  ASSERT v_task.run_after BETWEEN now() + interval '4 minutes' AND now() + interval '6 minutes',
    'FAIL 5b: second failure should back off ~5 minutes, run_after=' || v_task.run_after;

  PERFORM set_config('app.actor', 'agent-tasks-test-setup', true);
  UPDATE public.agent_tasks SET run_after = now() WHERE id = v_id;
  SELECT id INTO v_id FROM public.claim_agent_tasks(
    p_task_types => ARRAY[v_key_prefix || 'backoff.test'], p_batch => 1, p_worker => 'w1');   -- attempts=3
  PERFORM public.complete_agent_task(
    p_id => v_id, p_outcome => 'failed', p_error => 'e3', p_actor => 'w1');
  SELECT * INTO v_task FROM public.agent_tasks WHERE id = v_id;
  ASSERT v_task.run_after BETWEEN now() + interval '24 minutes' AND now() + interval '26 minutes',
    'FAIL 5c: third failure should back off ~25 minutes, run_after=' || v_task.run_after;

  -- park at attempts >= max_attempts
  PERFORM public.enqueue_agent_task(
    p_task_type => v_key_prefix || 'park.test',
    p_idempotency_key => v_key_prefix || 'k6',
    p_max_attempts => 2, p_actor => 'agent-tasks-test-setup');
  SELECT id INTO v_id FROM public.claim_agent_tasks(
    p_task_types => ARRAY[v_key_prefix || 'park.test'], p_batch => 1, p_worker => 'w1');       -- attempts=1
  PERFORM public.complete_agent_task(
    p_id => v_id, p_outcome => 'failed', p_error => 'p1', p_actor => 'w1');
  PERFORM set_config('app.actor', 'agent-tasks-test-setup', true);
  UPDATE public.agent_tasks SET run_after = now() WHERE id = v_id;
  SELECT id INTO v_id FROM public.claim_agent_tasks(
    p_task_types => ARRAY[v_key_prefix || 'park.test'], p_batch => 1, p_worker => 'w1');       -- attempts=2 == max
  PERFORM public.complete_agent_task(
    p_id => v_id, p_outcome => 'failed', p_error => 'p2', p_actor => 'w1');
  SELECT * INTO v_task FROM public.agent_tasks WHERE id = v_id;
  ASSERT v_task.status = 'failed' AND v_task.completed_at IS NOT NULL,
    'FAIL 5d: failure at attempts>=max should park failed, got ' || v_task.status;

  -- p_fatal parks immediately (attempts < max)
  PERFORM public.enqueue_agent_task(
    p_task_type => v_key_prefix || 'fatal.test',
    p_idempotency_key => v_key_prefix || 'k7',
    p_max_attempts => 10, p_actor => 'agent-tasks-test-setup');
  SELECT id INTO v_id FROM public.claim_agent_tasks(
    p_task_types => ARRAY[v_key_prefix || 'fatal.test'], p_batch => 1, p_worker => 'w1');      -- attempts=1
  PERFORM public.complete_agent_task(
    p_id => v_id, p_outcome => 'failed', p_error => 'fatal-boom',
    p_fatal => true, p_actor => 'w1');
  SELECT * INTO v_task FROM public.agent_tasks WHERE id = v_id;
  ASSERT v_task.status = 'failed' AND v_task.completed_at IS NOT NULL AND v_task.attempts = 1,
    'FAIL 5e: p_fatal should park failed immediately, got ' || v_task.status || '/' || v_task.attempts;

  -- ── Case 6: review reject/approve. ──
  v_task := public.enqueue_agent_task(
              p_task_type => v_key_prefix || 'review.reject',
              p_idempotency_key => v_key_prefix || 'k8',
              p_status => 'awaiting_review', p_actor => 'agent-tasks-test-setup');
  v_hid := v_task.id;
  BEGIN
    PERFORM public.review_agent_task(p_id => v_hid, p_decision => 'rejected', p_reviewer => 'leah-rev');
    RAISE EXCEPTION 'FAIL 6a: rejection without a note should raise';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM LIKE 'FAIL%' THEN RAISE; END IF;
  END;
  v_task := public.review_agent_task(
              p_id => v_hid, p_decision => 'rejected', p_reviewer => 'leah-rev',
              p_note => 'needs work', p_review_meta => jsonb_build_object('rubric', 'x'));
  ASSERT v_task.status = 'rejected'
         AND v_task.payload ->> 'feedback' = 'needs work'
         AND v_task.review_state ->> 'reviewer' = 'leah-rev'
         AND v_task.review_state ->> 'decision' = 'rejected'
         AND v_task.review_state -> 'meta' ->> 'rubric' = 'x'
         AND v_task.completed_at IS NOT NULL,
    'FAIL 6b: reject-with-note should merge feedback + populate review_state';

  v_task := public.enqueue_agent_task(
              p_task_type => v_key_prefix || 'review.approve',
              p_idempotency_key => v_key_prefix || 'k9',
              p_status => 'awaiting_review', p_payload => jsonb_build_object('a', 1),
              p_actor => 'agent-tasks-test-setup');
  v_iid := v_task.id;
  v_task := public.review_agent_task(
              p_id => v_iid, p_decision => 'approved', p_reviewer => 'kody-rev',
              p_payload_patch => jsonb_build_object('b', 2),
              p_review_meta => jsonb_build_object('score', 0.9));
  ASSERT v_task.status = 'approved'
         AND (v_task.payload ->> 'a') = '1'
         AND (v_task.payload ->> 'b') = '2'
         AND v_task.review_state ->> 'decision' = 'approved'
         AND (v_task.review_state -> 'meta' ->> 'score') = '0.9',
    'FAIL 6c: approve should merge payload_patch + populate review_state';

  -- ── Case 7: a direct illegal UPDATE raises from the transition trigger. ──
  PERFORM set_config('app.actor', 'agent-tasks-test-setup', true);
  BEGIN
    UPDATE public.agent_tasks SET status = 'approved' WHERE id = v_bid;   -- queued -> approved
    RAISE EXCEPTION 'FAIL 7: direct queued->approved should have raised';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM LIKE 'FAIL%' THEN RAISE; END IF;
    ASSERT SQLERRM LIKE '%illegal transition queued -> approved%',
      'FAIL 7: unexpected error: ' || SQLERRM;
  END;

  -- ── Case 8: audit rows carry the expected actor. ──
  SELECT count(*) INTO v_count FROM public.agent_task_audit
   WHERE task_id = v_aid AND actor = 'actor-a' AND op = 'INSERT';
  ASSERT v_count = 1, 'FAIL 8a: expected exactly one enqueue audit for actor-a, got ' || v_count;
  SELECT count(*) INTO v_count FROM public.agent_task_audit
   WHERE task_id = v_aid AND actor = 'w1' AND op = 'UPDATE'
     AND new_row ->> 'status' = 'done';
  ASSERT v_count = 1, 'FAIL 8a: expected exactly one completion audit for worker w1, got ' || v_count;
  SELECT count(*) INTO v_count FROM public.agent_task_audit
   WHERE task_id = v_hid AND actor = 'leah-rev' AND op = 'UPDATE';
  ASSERT v_count >= 1, 'FAIL 8b: expected a review audit row for task H with actor=leah-rev, got ' || v_count;

  RAISE NOTICE 'Cases 1-8 passed.';
END
$$;

-- ─── Case 9: cowork bridge — mapping, id preservation, counts, freeze ───────
-- The 00298 data copy ran at reset over an empty cowork_tasks. To exercise the
-- mapping we insert a synthetic legacy row (disabling the freeze trigger),
-- re-run the migration's idempotent copy verbatim, then assert the result.
ALTER TABLE public.cowork_tasks DISABLE TRIGGER trg_cowork_tasks_frozen;

SELECT set_config('app.actor', 'agent-tasks-test-bridge', true);

INSERT INTO public.pipeline_vendors (id, name, slug)
VALUES ('a5e70000-0000-4000-8000-000000000f01', 'Bridge Test Vendor', 'bridge-test-vendor');

INSERT INTO public.cowork_tasks (
  id, task_type, vendor_id, status,
  input_payload, output_payload, output_files,
  error_message, retry_count, max_retries,
  created_at, picked_up_at, completed_at
) VALUES (
  'a5e70000-0000-4000-8000-000000000f02', 'auto_score',
  'a5e70000-0000-4000-8000-000000000f01', 'completed',
  '{"x":1}'::jsonb, '{"y":2}'::jsonb, ARRAY['file-1.pdf'],
  'legacy-err', 2, 4,
  '2026-01-01T00:00:00Z', '2026-01-01T00:05:00Z', '2026-01-01T00:10:00Z'
);

-- Verbatim copy from 00298_agent_tasks_cowork_bridge.sql
INSERT INTO public.agent_tasks (
  id, task_type, status, source,
  entity_type, entity_id,
  payload, artifacts,
  attempts, max_attempts, last_error,
  started_at, created_at, completed_at,
  idempotency_key
)
SELECT
  ct.id,
  ct.task_type,
  CASE ct.status
    WHEN 'pending'   THEN 'queued'
    WHEN 'picked_up' THEN 'running'
    WHEN 'running'   THEN 'running'
    WHEN 'completed' THEN 'done'
    WHEN 'failed'    THEN 'failed'
    WHEN 'cancelled' THEN 'cancelled'
    ELSE 'queued'
  END,
  'cowork:legacy',
  CASE WHEN ct.vendor_id IS NOT NULL THEN 'pipeline_vendor' END,
  ct.vendor_id,
  coalesce(ct.input_payload, '{}'::jsonb)
    || CASE
         WHEN ct.is_recurring OR ct.cron_expression IS NOT NULL
         THEN jsonb_build_object('recurrence', jsonb_build_object(
                'is_recurring',    ct.is_recurring,
                'cron_expression', ct.cron_expression,
                'last_run_at',     ct.last_run_at,
                'next_run_at',     ct.next_run_at))
         ELSE '{}'::jsonb
       END,
  jsonb_build_object('output', coalesce(ct.output_payload, '{}'::jsonb),
                     'files',  to_jsonb(ct.output_files)),
  coalesce(ct.retry_count, 0),
  coalesce(ct.max_retries, 5),
  ct.error_message,
  ct.picked_up_at,
  ct.created_at,
  ct.completed_at,
  'cowork:' || ct.id::text
FROM public.cowork_tasks ct
ON CONFLICT (idempotency_key) DO NOTHING;

ALTER TABLE public.cowork_tasks ENABLE TRIGGER trg_cowork_tasks_frozen;

DO $$
DECLARE
  v_task   public.agent_tasks;
  v_cw     bigint;
  v_ag     bigint;
BEGIN
  SELECT * INTO v_task FROM public.agent_tasks WHERE id = 'a5e70000-0000-4000-8000-000000000f02';
  ASSERT v_task.id = 'a5e70000-0000-4000-8000-000000000f02', 'FAIL 9a: id not preserved';
  ASSERT v_task.status = 'done', 'FAIL 9b: completed->done map, got ' || v_task.status;
  ASSERT v_task.source = 'cowork:legacy', 'FAIL 9c: source should be cowork:legacy';
  ASSERT v_task.entity_type = 'pipeline_vendor'
         AND v_task.entity_id = 'a5e70000-0000-4000-8000-000000000f01',
    'FAIL 9d: vendor_id should map to entity_type/entity_id';
  ASSERT v_task.idempotency_key = 'cowork:a5e70000-0000-4000-8000-000000000f02',
    'FAIL 9e: idempotency_key mapping wrong, got ' || coalesce(v_task.idempotency_key, 'null');
  ASSERT v_task.attempts = 2 AND v_task.max_attempts = 4 AND v_task.last_error = 'legacy-err',
    'FAIL 9f: retry/max/error mapping wrong';
  ASSERT (v_task.payload ->> 'x') = '1'
         AND (v_task.artifacts -> 'output' ->> 'y') = '2'
         AND (v_task.artifacts -> 'files' ->> 0) = 'file-1.pdf',
    'FAIL 9g: payload/artifacts mapping wrong';
  ASSERT v_task.started_at IS NOT NULL AND v_task.completed_at IS NOT NULL,
    'FAIL 9h: timestamps not carried';

  SELECT count(*) INTO v_cw FROM public.cowork_tasks;
  SELECT count(*) INTO v_ag FROM public.agent_tasks WHERE source = 'cowork:legacy';
  ASSERT v_cw = v_ag, 'FAIL 9i: row counts differ, cowork=' || v_cw || ' agent=' || v_ag;

  -- freeze: a write to cowork_tasks is rejected.
  BEGIN
    INSERT INTO public.cowork_tasks (task_type, status) VALUES ('rescore', 'pending');
    RAISE EXCEPTION 'FAIL 9j: insert into frozen cowork_tasks should have raised';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM LIKE 'FAIL%' THEN RAISE; END IF;
    ASSERT SQLERRM LIKE '%cowork_tasks is frozen%', 'FAIL 9j: unexpected error: ' || SQLERRM;
  END;

  RAISE NOTICE 'Case 9 passed.';
END
$$;

-- ─── Case 10: the queue RPCs are service-role only ──────────────────────────
DO $$
BEGIN
  ASSERT has_function_privilege(
    'service_role',
    'public.enqueue_agent_successor_if_owned(uuid,text,jsonb,text,integer,text,text,uuid,text,timestamp with time zone,integer,text,text,uuid,numeric,jsonb,text)',
    'EXECUTE'),
    'FAIL 10: service_role must execute enqueue_agent_successor_if_owned';

  PERFORM set_config('request.jwt.claims', '{"role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    PERFORM public.enqueue_agent_task(p_task_type => 'x');
    RAISE EXCEPTION 'FAIL 10a: authenticated must not execute enqueue_agent_task';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM public.claim_agent_tasks(ARRAY['x'], 1, 'w');
    RAISE EXCEPTION 'FAIL 10b: authenticated must not execute claim_agent_tasks';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM public.complete_agent_task(
      p_id => 'a5e70000-0000-4000-8000-000000000f02',
      p_outcome => 'done',
      p_actor => 'unauthorized-worker');
    RAISE EXCEPTION 'FAIL 10c: authenticated must not execute complete_agent_task';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM public.enqueue_agent_successor_if_owned(
      p_owner_task_id => 'a5e70000-0000-4000-8000-000000000f02',
      p_task_type => 'x',
      p_actor => 'unauthorized-worker');
    RAISE EXCEPTION 'FAIL 10d: authenticated must not execute enqueue_agent_successor_if_owned';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  EXECUTE 'RESET ROLE';

  PERFORM set_config('request.jwt.claims', '{}', true);
  EXECUTE 'SET LOCAL ROLE anon';
  BEGIN
    PERFORM public.enqueue_agent_task(p_task_type => 'x');
    RAISE EXCEPTION 'FAIL 10e: anon must not execute enqueue_agent_task';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM public.review_agent_task('a5e70000-0000-4000-8000-000000000f02', 'approved', 'x');
    RAISE EXCEPTION 'FAIL 10f: anon must not execute review_agent_task';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM public.enqueue_agent_successor_if_owned(
      p_owner_task_id => 'a5e70000-0000-4000-8000-000000000f02',
      p_task_type => 'x',
      p_actor => 'unauthorized-worker');
    RAISE EXCEPTION 'FAIL 10g: anon must not execute enqueue_agent_successor_if_owned';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claims', NULL, true);

  RAISE NOTICE 'Case 10 passed.';
  RAISE NOTICE 'All agent_tasks queue assertions passed.';
END
$$;

ROLLBACK;
