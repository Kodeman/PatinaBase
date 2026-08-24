-- ═══════════════════════════════════════════════════════════════════════════
-- capture_enrichment: atomic claim — duplicate delivery + stale revision
-- (migration 00515 claim_capture_enrichment_run) — golden-set GS-03/GS-04
-- (docs/engineering/capture-enrichment-golden-set.md)
--
-- Covers:
--   (a) GS-03 — a run already 'ready'; a second claim attempt for the same
--       run/revision returns 'ignore_duplicate' and does not touch ledger
--       state (suggestions/status untouched).
--   (b) a run already 'running' (claimed once); a second concurrent claim
--       attempt for the same run/revision also returns 'ignore_duplicate',
--       not 'claimed' again.
--   (c) GS-04 — a newer run exists for the same target at a higher
--       content_revision; claiming the OLDER run returns 'ignore_stale' and
--       cancels the older run, leaving the newer (current) run's status
--       untouched.
--   (d) the happy path — claiming a queued run at its own current revision
--       returns 'claimed' and transitions status -> running, attempts +1.
--   (e) ANTI-VACUITY — a deliberately-permissive claim variant (no
--       "already resolved" check) would re-claim an already-'ready' run;
--       proven by inlining that broken logic directly and showing it WOULD
--       flip status back to running, then confirming the real function
--       still refuses on a fresh case.
--
-- Run:
--   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -X -q \
--     -v ON_ERROR_STOP=1 \
--     -f supabase/tests/capture_enrichment/claim_duplicate_stale_test.sql
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

SET LOCAL statement_timeout = '30s';

-- ─── fixtures ────────────────────────────────────────────────────────────────
INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, instance_id, aud, role)
VALUES ('ce000000-0000-4000-8000-000000000002', 'ce-owner-b@test.invalid', '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');

INSERT INTO profiles (id, email, full_name, created_at, updated_at)
VALUES ('ce000000-0000-4000-8000-000000000002', 'ce-owner-b@test.invalid', 'CE Owner B', NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

INSERT INTO proposal_captures (id, designer_id, source_url)
VALUES
  ('ce000000-0000-4000-8000-0000000000c2', 'ce000000-0000-4000-8000-000000000002', 'https://example.invalid/product-b'),
  ('ce000000-0000-4000-8000-0000000000c3', 'ce000000-0000-4000-8000-000000000002', 'https://example.invalid/product-c');

-- ─── (a) GS-03: already-ready run ignores a second claim ───────────────────
DO $$
DECLARE
  v_run_id uuid;
  v_outcome text;
  v_status text;
  v_suggestions_before jsonb;
  v_suggestions_after jsonb;
BEGIN
  v_run_id := public.enqueue_capture_enrichment('proposal_capture', 'ce000000-0000-4000-8000-0000000000c2', 0);
  v_outcome := public.claim_capture_enrichment_run(v_run_id, 0);
  ASSERT v_outcome = 'claimed', 'FAIL a0 setup: first claim must succeed, got ' || v_outcome;

  PERFORM public.record_capture_enrichment_result(v_run_id, '{"category":"Sofa"}'::jsonb, '{}'::jsonb, 'ready');
  SELECT suggestions INTO v_suggestions_before FROM public.capture_enrichment_runs WHERE id = v_run_id;

  -- Duplicate delivery of the SAME message (same run id, same revision).
  v_outcome := public.claim_capture_enrichment_run(v_run_id, 0);
  ASSERT v_outcome = 'ignore_duplicate', 'FAIL a1 (GS-03): a second claim on an already-ready run must return ignore_duplicate, got ' || v_outcome;

  SELECT status INTO v_status FROM public.capture_enrichment_runs WHERE id = v_run_id;
  ASSERT v_status = 'ready', 'FAIL a2: duplicate claim must not change status away from ready, got ' || v_status;

  SELECT suggestions INTO v_suggestions_after FROM public.capture_enrichment_runs WHERE id = v_run_id;
  ASSERT v_suggestions_after = v_suggestions_before, 'FAIL a3: duplicate claim must not touch suggestions';

  RAISE NOTICE 'claim_duplicate_stale: case (a) GS-03 passed.';
END $$;

-- ─── (b) already-running run also ignores a second concurrent claim ───────
DO $$
DECLARE
  v_run_id uuid;
  v_outcome text;
  v_attempts_before int;
  v_attempts_after int;
BEGIN
  v_run_id := public.enqueue_capture_enrichment('proposal_capture', 'ce000000-0000-4000-8000-0000000000c3', 0);
  v_outcome := public.claim_capture_enrichment_run(v_run_id, 0);
  ASSERT v_outcome = 'claimed', 'FAIL b0 setup: first claim must succeed, got ' || v_outcome;

  SELECT attempts INTO v_attempts_before FROM public.capture_enrichment_runs WHERE id = v_run_id;

  -- A redelivered copy of the same message while the first claim is still
  -- in flight (status='running').
  v_outcome := public.claim_capture_enrichment_run(v_run_id, 0);
  ASSERT v_outcome = 'ignore_duplicate', 'FAIL b1: a claim attempt on an already-running run must return ignore_duplicate, got ' || v_outcome;

  SELECT attempts INTO v_attempts_after FROM public.capture_enrichment_runs WHERE id = v_run_id;
  ASSERT v_attempts_after = v_attempts_before, 'FAIL b2: duplicate claim on a running run must not bump attempts again, got ' || v_attempts_after || ' vs ' || v_attempts_before;

  RAISE NOTICE 'claim_duplicate_stale: case (b) passed.';
END $$;

-- ─── (c) GS-04: stale revision is ignored in favor of current ─────────────
DO $$
DECLARE
  v_target_id uuid := 'ce000000-0000-4000-8000-0000000000c4';
  v_run_id_rev0 uuid;
  v_run_id_rev1 uuid;
  v_outcome text;
  v_status_rev0 text;
  v_status_rev1 text;
BEGIN
  INSERT INTO proposal_captures (id, designer_id, source_url)
  VALUES (v_target_id, 'ce000000-0000-4000-8000-000000000002', 'https://example.invalid/product-d');

  v_run_id_rev0 := public.enqueue_capture_enrichment('proposal_capture', v_target_id, 0);
  -- Designer edits the capture before the rev-0 message is consumed; the
  -- producer bumps the revision and enqueues a NEW run for rev 1.
  v_run_id_rev1 := public.enqueue_capture_enrichment('proposal_capture', v_target_id, 1);

  -- The rev-0 message (minted before the edit) is now delivered late.
  v_outcome := public.claim_capture_enrichment_run(v_run_id_rev0, 0);
  ASSERT v_outcome = 'ignore_stale', 'FAIL c1 (GS-04): claiming a run whose target has a newer revision must return ignore_stale, got ' || v_outcome;

  SELECT status INTO v_status_rev0 FROM public.capture_enrichment_runs WHERE id = v_run_id_rev0;
  ASSERT v_status_rev0 = 'cancelled', 'FAIL c2: the stale rev-0 run must be marked cancelled, got ' || v_status_rev0;

  SELECT status INTO v_status_rev1 FROM public.capture_enrichment_runs WHERE id = v_run_id_rev1;
  ASSERT v_status_rev1 = 'queued', 'FAIL c3: the current rev-1 run must be untouched by the stale rev-0 delivery, got ' || v_status_rev1;

  -- The current (rev-1) run remains claimable normally.
  v_outcome := public.claim_capture_enrichment_run(v_run_id_rev1, 1);
  ASSERT v_outcome = 'claimed', 'FAIL c4: the current revision must still be claimable after the stale sibling was ignored, got ' || v_outcome;

  RAISE NOTICE 'claim_duplicate_stale: case (c) GS-04 passed.';
END $$;

-- ─── (d) happy path claim ───────────────────────────────────────────────────
DO $$
DECLARE
  v_target_id uuid := 'ce000000-0000-4000-8000-0000000000c5';
  v_run_id uuid;
  v_outcome text;
  v_status text;
  v_attempts int;
  v_dispatched_at timestamptz;
BEGIN
  INSERT INTO proposal_captures (id, designer_id, source_url)
  VALUES (v_target_id, 'ce000000-0000-4000-8000-000000000002', 'https://example.invalid/product-e');

  v_run_id := public.enqueue_capture_enrichment('proposal_capture', v_target_id, 0);
  v_outcome := public.claim_capture_enrichment_run(v_run_id, 0);
  ASSERT v_outcome = 'claimed', 'FAIL d1: happy-path claim must return claimed, got ' || v_outcome;

  SELECT status, attempts, dispatched_at INTO v_status, v_attempts, v_dispatched_at
    FROM public.capture_enrichment_runs WHERE id = v_run_id;
  ASSERT v_status = 'running', 'FAIL d2: claimed run must transition to running, got ' || v_status;
  ASSERT v_attempts = 1, 'FAIL d3: claimed run must have attempts=1, got ' || v_attempts;
  ASSERT v_dispatched_at IS NOT NULL, 'FAIL d4: claimed run must stamp dispatched_at';

  RAISE NOTICE 'claim_duplicate_stale: case (d) passed.';
END $$;

-- ─── (e) ANTI-VACUITY — prove the "already resolved" guard is load-bearing ──
-- Inline the SAME permissive logic a broken claim function would use if it
-- forgot the resolved/running check (unconditionally flips status to
-- 'running' whenever the revision matches), applied directly against an
-- already-'ready' run from case (a)'s fixture. This proves such a run CAN
-- be flipped back to running absent the guard — i.e. case (a)'s assertion
-- is not vacuously true because a ready run is somehow un-claimable by
-- construction. Then confirm the REAL function still refuses a fresh case.
DO $$
DECLARE
  v_run_id uuid;
  v_status_before text;
  v_status_after_naive text;
  v_outcome text;
BEGIN
  SELECT id, status INTO v_run_id, v_status_before
    FROM public.capture_enrichment_runs
   WHERE target_type = 'proposal_capture' AND target_id = 'ce000000-0000-4000-8000-0000000000c2' AND content_revision = 0;
  ASSERT v_status_before = 'ready', 'FAIL e0 setup: expected the case (a) run to still be ready, got ' || v_status_before;

  -- Naive permissive claim: matches revision, unconditionally sets running.
  UPDATE public.capture_enrichment_runs
     SET status = 'running', attempts = attempts + 1
   WHERE id = v_run_id AND content_revision = 0;

  SELECT status INTO v_status_after_naive FROM public.capture_enrichment_runs WHERE id = v_run_id;
  ASSERT v_status_after_naive = 'running',
    'FAIL e1 (ANTI-VACUITY SETUP BROKEN): the naive permissive update must have flipped the ready run to running — if it did not, case (a) is not a meaningful assertion, got ' || v_status_after_naive;

  -- Restore ledger state and re-confirm the REAL function still refuses.
  UPDATE public.capture_enrichment_runs SET status = 'ready' WHERE id = v_run_id;

  v_outcome := public.claim_capture_enrichment_run(v_run_id, 0);
  ASSERT v_outcome = 'ignore_duplicate', 'FAIL e2: after restoring ready status, the real claim function must still refuse, got ' || v_outcome;

  RAISE NOTICE 'claim_duplicate_stale: case (e) ANTI-VACUITY passed — the resolved-state guard is load-bearing.';
END $$;

ROLLBACK;
