-- ═══════════════════════════════════════════════════════════════════════════
-- Aesthete jobs queue tests (migration 00239)
--
-- Exercises design §5.5 (jobs part) + §6.1 + §12.2:
--   1. A products INSERT enqueues exactly 3 jobs (embed_text, embed_fused,
--      dna_draft) with the product_id:kind:r1 dedupe keys.
--   2. Dedupe holds: re-firing the trigger (UPDATE OF description) while
--      jobs are live adds nothing.
--   3. Re-enqueue law: a re-fire AFTER a job completed resurrects it to
--      pending (attempts reset) — §6.1 "products re-enqueue on UPDATE".
--   4. claim_aesthete_jobs: claims flip to running + attempts+1; a second
--      claim never returns already-claimed rows (FOR UPDATE SKIP LOCKED +
--      status flip).
--   5. complete_aesthete_job: 'done' stamps completed_at; 'failed' backs off
--      to pending (1 m at attempt 1) and parks as failed at attempts ≥ 5;
--      invalid status / unknown id raise.
--   6. DNA + spectrum writes re-enqueue embed_fused (caption re-embed §4.5).
--   7. anon/authenticated cannot execute the claim/complete RPCs
--      (service-role only).
--   8. Both pg_cron drains are registered against the right edge functions.
--
-- How to run:
--   docker exec -i supabase_db_supabase psql -U postgres -d postgres \
--     -v ON_ERROR_STOP=1 < supabase/tests/aesthete/jobs_queue_test.sql
--
-- The script wraps everything in a single transaction and ROLLBACKs at the
-- end so it can be re-run without side effects (including the mid-test
-- DELETE that isolates the queue from seed-product jobs).
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─── fixtures ──────────────────────────────────────────────────────────────

-- One fixture auth user (self-contained; profiles may be auto-created by the
-- auth.users trigger).
INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, instance_id, aud, role)
VALUES
  ('ae3b0000-0000-4000-8000-0000000000aa', 'aesthete-jobs@test.invalid', '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');

INSERT INTO profiles (id, email, full_name, created_at, updated_at)
VALUES
  ('ae3b0000-0000-4000-8000-0000000000aa', 'aesthete-jobs@test.invalid', 'Aesthete Jobs Tester', NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

-- ─── assertions ────────────────────────────────────────────────────────────

DO $$
DECLARE
  u_tester UUID := 'ae3b0000-0000-4000-8000-0000000000aa';
  p1       UUID := 'ae3b0000-0000-4000-8000-000000000001';
  v_count int;
  v_job aesthete_jobs;
  v_id bigint;
BEGIN
  -- Case 1: product INSERT enqueues exactly the 3 job kinds with the
  -- documented dedupe keys.
  INSERT INTO products (id, name, source_url, captured_by, captured_at, layer, patina_managed)
  VALUES (p1, 'Jobs test stool', 'http://test.invalid/jobs1', u_tester, NOW(), 'catalog', TRUE);

  SELECT count(*) INTO v_count FROM aesthete_jobs WHERE product_id = p1;
  ASSERT v_count = 3,
    'FAIL 1a: product INSERT should enqueue 3 jobs, got ' || v_count;

  SELECT count(*) INTO v_count FROM aesthete_jobs
   WHERE product_id = p1 AND status = 'pending'
     AND (kind, dedupe_key) IN (
       ('embed_text',  p1 || ':embed_text:r1'),
       ('embed_fused', p1 || ':embed_fused:r1'),
       ('dna_draft',   p1 || ':dna_draft:r1'));
  ASSERT v_count = 3,
    'FAIL 1b: expected pending embed_text/embed_fused/dna_draft with product_id:kind:r1 dedupe keys, got ' || v_count;

  -- Case 2: dedupe holds on re-fire while jobs are live.
  UPDATE products SET description = 'now with a description' WHERE id = p1;
  SELECT count(*) INTO v_count FROM aesthete_jobs WHERE product_id = p1;
  ASSERT v_count = 3,
    'FAIL 2: re-firing the trigger must not duplicate live jobs, got ' || v_count;

  -- Case 3: a COMPLETED job is resurrected by a re-fire (§6.1 re-enqueue law).
  UPDATE aesthete_jobs SET status = 'done', completed_at = now(), attempts = 3
   WHERE product_id = p1 AND kind = 'embed_text';
  UPDATE products SET description = 'edited again' WHERE id = p1;

  SELECT count(*) INTO v_count FROM aesthete_jobs
   WHERE product_id = p1 AND kind = 'embed_text'
     AND status = 'pending' AND attempts = 0 AND completed_at IS NULL;
  ASSERT v_count = 1,
    'FAIL 3a: a done job should resurrect to pending (attempts reset) on re-fire, got ' || v_count;
  SELECT count(*) INTO v_count FROM aesthete_jobs WHERE product_id = p1;
  ASSERT v_count = 3,
    'FAIL 3b: resurrection must reuse the row, not add one — got ' || v_count;

  -- Isolate the queue for the claim walk: seed products also enqueue jobs at
  -- reset time; drop everything that is not P1's (transaction-local, rolled
  -- back at the end).
  DELETE FROM aesthete_jobs WHERE product_id IS DISTINCT FROM p1;

  -- Case 4a: claiming flips to running and increments attempts.
  SELECT count(*) INTO v_count FROM claim_aesthete_jobs('embed_text', 10);
  ASSERT v_count = 1,
    'FAIL 4a: expected to claim exactly 1 embed_text job, got ' || v_count;

  SELECT * INTO v_job FROM aesthete_jobs WHERE product_id = p1 AND kind = 'embed_text';
  ASSERT v_job.status = 'running' AND v_job.attempts = 1,
    'FAIL 4b: claimed job should be running with attempts=1, got ' || v_job.status || '/' || v_job.attempts;

  -- Case 4c: a second claim returns nothing — the row is no longer pending
  -- (and a concurrent claimer would have skipped it via SKIP LOCKED).
  SELECT count(*) INTO v_count FROM claim_aesthete_jobs('embed_text', 10);
  ASSERT v_count = 0,
    'FAIL 4c: a second claim must not return the already-claimed row, got ' || v_count;

  -- Case 5a: complete 'done' stamps completed_at and clears last_error.
  PERFORM complete_aesthete_job(v_job.id, 'done', NULL);
  SELECT count(*) INTO v_count FROM aesthete_jobs
   WHERE id = v_job.id AND status = 'done' AND completed_at IS NOT NULL AND last_error IS NULL;
  ASSERT v_count = 1,
    'FAIL 5a: complete(done) should stamp done/completed_at, got ' || v_count;

  -- Case 5b: complete 'failed' at attempt 1 backs off to pending ~1 minute out.
  SELECT id INTO v_id FROM claim_aesthete_jobs('embed_fused', 1);
  PERFORM complete_aesthete_job(v_id, 'failed', 'boom');
  SELECT count(*) INTO v_count FROM aesthete_jobs
   WHERE id = v_id AND status = 'pending' AND last_error = 'boom'
     AND run_after > now() + interval '50 seconds'
     AND run_after < now() + interval '2 minutes';
  ASSERT v_count = 1,
    'FAIL 5b: first failure should back off ~1 minute to pending with last_error, got ' || v_count;

  -- Case 5c: backed-off jobs are not claimable before run_after.
  SELECT count(*) INTO v_count FROM claim_aesthete_jobs('embed_fused', 10);
  ASSERT v_count = 0,
    'FAIL 5c: a backed-off job must not be claimable before run_after, got ' || v_count;

  -- Case 5d: at attempts >= 5 a failure parks the job as failed (terminal).
  UPDATE aesthete_jobs SET attempts = 5, status = 'running' WHERE id = v_id;
  PERFORM complete_aesthete_job(v_id, 'failed', 'kaput');
  SELECT count(*) INTO v_count FROM aesthete_jobs
   WHERE id = v_id AND status = 'failed' AND completed_at IS NOT NULL AND last_error = 'kaput';
  ASSERT v_count = 1,
    'FAIL 5d: failure at attempts>=5 should park the job as failed, got ' || v_count;

  -- Case 5e: invalid status and unknown id raise.
  BEGIN
    PERFORM complete_aesthete_job(v_id, 'weird', NULL);
    RAISE EXCEPTION 'FAIL 5e: complete with status=weird should raise';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM LIKE 'FAIL%' THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM complete_aesthete_job(-1, 'done', NULL);
    RAISE EXCEPTION 'FAIL 5f: complete on an unknown job id should raise';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM LIKE 'FAIL%' THEN RAISE; END IF;
  END;

  -- Case 6a: a product_dna write re-enqueues embed_fused (caption re-embed).
  -- v_id (the embed_fused job) is currently 'failed' → the DNA trigger must
  -- resurrect it.
  INSERT INTO product_dna (product_id, line_quality) VALUES (p1, 0.3);
  SELECT count(*) INTO v_count FROM aesthete_jobs
   WHERE id = v_id AND status = 'pending' AND attempts = 0 AND completed_at IS NULL;
  ASSERT v_count = 1,
    'FAIL 6a: a product_dna write should re-enqueue the embed_fused job, got ' || v_count;

  -- Case 6b: a product_style_spectrum write does the same.
  UPDATE aesthete_jobs SET status = 'done', completed_at = now() WHERE id = v_id;
  INSERT INTO product_style_spectrum (product_id, warmth, assigned_by)
  VALUES (p1, 0.5, u_tester);
  SELECT count(*) INTO v_count FROM aesthete_jobs
   WHERE id = v_id AND status = 'pending' AND completed_at IS NULL;
  ASSERT v_count = 1,
    'FAIL 6b: a spectrum write should re-enqueue the embed_fused job, got ' || v_count;

  -- Case 7: the queue RPCs are service-role only.
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', u_tester::text, 'role', 'authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    PERFORM claim_aesthete_jobs('embed_text', 1);
    RAISE EXCEPTION 'FAIL 7a: authenticated must not execute claim_aesthete_jobs';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM complete_aesthete_job(v_id, 'done', NULL);
    RAISE EXCEPTION 'FAIL 7b: authenticated must not execute complete_aesthete_job';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  EXECUTE 'RESET ROLE';

  PERFORM set_config('request.jwt.claims', '{}', true);
  EXECUTE 'SET LOCAL ROLE anon';
  BEGIN
    PERFORM claim_aesthete_jobs('embed_text', 1);
    RAISE EXCEPTION 'FAIL 7c: anon must not execute claim_aesthete_jobs';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claims', NULL, true);

  -- Case 8: both cron drains are registered with the right edge functions.
  SELECT count(*) INTO v_count FROM cron.job
   WHERE jobname = 'aesthete-embed'
     AND schedule = '* * * * *'
     AND command LIKE '%invoke_edge_function(''aesthete-embed-worker''%';
  ASSERT v_count = 1,
    'FAIL 8a: aesthete-embed cron (every minute → aesthete-embed-worker) missing, got ' || v_count;

  SELECT count(*) INTO v_count FROM cron.job
   WHERE jobname = 'aesthete-dna-draft'
     AND schedule = '*/2 * * * *'
     AND command LIKE '%invoke_edge_function(''aesthete-dna-draft''%';
  ASSERT v_count = 1,
    'FAIL 8b: aesthete-dna-draft cron (every 2 min → aesthete-dna-draft) missing, got ' || v_count;

  RAISE NOTICE 'All aesthete jobs queue assertions passed.';
END
$$;

-- ROLLBACK so the test is idempotent.
ROLLBACK;
