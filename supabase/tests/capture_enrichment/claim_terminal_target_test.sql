-- ═══════════════════════════════════════════════════════════════════════════
-- capture_enrichment: atomic claim — deleted / dismissed / superseded target
-- (migration 00515 claim_capture_enrichment_run) — golden-set GS-05/06/07
-- (docs/engineering/capture-enrichment-golden-set.md)
--
-- Covers, for BOTH target ledgers (proposal_captures and field_captures):
--   (a) target row deleted before the consumer claims -> ignore_terminal,
--       run transitions to 'cancelled' (never 'ready'/'failed').
--   (b) target dismissed before claim -> ignore_terminal, run cancelled;
--       the target's own dismissed status is left untouched.
--   (c) target already finalized (proposal_captures 'consumed' /
--       field_captures 'saved' — this ledger's modeled equivalent of
--       "superseded", per 00515's migration comment) before claim ->
--       ignore_terminal, run cancelled.
--   (d) ANTI-VACUITY — a permissive claim variant that skips the target-
--       liveness check would claim a run whose target is already deleted;
--       proven by inlining that broken shape directly, then confirming the
--       real function still refuses on a fresh deleted-target case.
--
-- Run:
--   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -X -q \
--     -v ON_ERROR_STOP=1 \
--     -f supabase/tests/capture_enrichment/claim_terminal_target_test.sql
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

SET LOCAL statement_timeout = '30s';

INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, instance_id, aud, role)
VALUES ('ce000000-0000-4000-8000-000000000003', 'ce-owner-c@test.invalid', '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');

INSERT INTO profiles (id, email, full_name, created_at, updated_at)
VALUES ('ce000000-0000-4000-8000-000000000003', 'ce-owner-c@test.invalid', 'CE Owner C', NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

-- ─── (a) proposal_capture: row deleted before claim -> ignore_terminal ─────
DO $$
DECLARE
  v_target_id uuid := 'ce000000-0000-4000-8000-0000000000d1';
  v_run_id uuid;
  v_outcome text;
  v_status text;
BEGIN
  INSERT INTO proposal_captures (id, designer_id, source_url)
  VALUES (v_target_id, 'ce000000-0000-4000-8000-000000000003', 'https://example.invalid/deleted-target');

  v_run_id := public.enqueue_capture_enrichment('proposal_capture', v_target_id, 0);

  DELETE FROM proposal_captures WHERE id = v_target_id;

  v_outcome := public.claim_capture_enrichment_run(v_run_id, 0);
  ASSERT v_outcome = 'ignore_terminal', 'FAIL a1 (GS-05 deleted): claiming a run whose proposal_capture target is deleted must return ignore_terminal, got ' || v_outcome;

  SELECT status INTO v_status FROM public.capture_enrichment_runs WHERE id = v_run_id;
  ASSERT v_status = 'cancelled', 'FAIL a2: run must be cancelled, not ready/failed, got ' || v_status;

  RAISE NOTICE 'claim_terminal_target: case (a) proposal_capture deleted passed.';
END $$;

-- ─── (b) proposal_capture: dismissed before claim -> ignore_terminal ───────
DO $$
DECLARE
  v_target_id uuid := 'ce000000-0000-4000-8000-0000000000d2';
  v_run_id uuid;
  v_outcome text;
  v_run_status text;
  v_target_status text;
BEGIN
  INSERT INTO proposal_captures (id, designer_id, source_url)
  VALUES (v_target_id, 'ce000000-0000-4000-8000-000000000003', 'https://example.invalid/dismissed-target');

  v_run_id := public.enqueue_capture_enrichment('proposal_capture', v_target_id, 0);

  UPDATE proposal_captures SET status = 'dismissed' WHERE id = v_target_id;

  v_outcome := public.claim_capture_enrichment_run(v_run_id, 0);
  ASSERT v_outcome = 'ignore_terminal', 'FAIL b1 (GS-06 dismissed): claiming a run whose target is dismissed must return ignore_terminal, got ' || v_outcome;

  SELECT status INTO v_run_status FROM public.capture_enrichment_runs WHERE id = v_run_id;
  ASSERT v_run_status = 'cancelled', 'FAIL b2: run must be cancelled, got ' || v_run_status;

  SELECT status INTO v_target_status FROM proposal_captures WHERE id = v_target_id;
  ASSERT v_target_status = 'dismissed', 'FAIL b3: the target''s own dismissed status must be left untouched, got ' || v_target_status;

  RAISE NOTICE 'claim_terminal_target: case (b) proposal_capture dismissed passed.';
END $$;

-- ─── (c) proposal_capture: already-consumed ("superseded" equivalent) ─────
DO $$
DECLARE
  v_target_id uuid := 'ce000000-0000-4000-8000-0000000000d3';
  v_run_id uuid;
  v_outcome text;
  v_status text;
BEGIN
  INSERT INTO proposal_captures (id, designer_id, source_url, status)
  VALUES (v_target_id, 'ce000000-0000-4000-8000-000000000003', 'https://example.invalid/consumed-target', 'consumed');

  v_run_id := public.enqueue_capture_enrichment('proposal_capture', v_target_id, 0);

  v_outcome := public.claim_capture_enrichment_run(v_run_id, 0);
  ASSERT v_outcome = 'ignore_terminal', 'FAIL c1 (GS-07 superseded-equivalent): claiming a run whose proposal_capture target is already consumed must return ignore_terminal, got ' || v_outcome;

  SELECT status INTO v_status FROM public.capture_enrichment_runs WHERE id = v_run_id;
  ASSERT v_status = 'cancelled', 'FAIL c2: run must be cancelled, got ' || v_status;

  RAISE NOTICE 'claim_terminal_target: case (c) proposal_capture consumed passed.';
END $$;

-- ─── (a2)/(b2)/(c2) — mirror the three cases on field_captures ─────────────
DO $$
DECLARE
  v_deleted_id uuid := 'ce000000-0000-4000-8000-0000000000d4';
  v_dismissed_id uuid := 'ce000000-0000-4000-8000-0000000000d5';
  v_saved_id uuid := 'ce000000-0000-4000-8000-0000000000d6';
  v_run_id uuid;
  v_outcome text;
  v_status text;
BEGIN
  -- deleted
  INSERT INTO field_captures (id, client_capture_id, designer_id)
  VALUES (v_deleted_id, gen_random_uuid(), 'ce000000-0000-4000-8000-000000000003');
  v_run_id := public.enqueue_capture_enrichment('field_capture', v_deleted_id, 0);
  DELETE FROM field_captures WHERE id = v_deleted_id;
  v_outcome := public.claim_capture_enrichment_run(v_run_id, 0);
  ASSERT v_outcome = 'ignore_terminal', 'FAIL a2-1 (GS-05 field_capture deleted): got ' || v_outcome;
  SELECT status INTO v_status FROM public.capture_enrichment_runs WHERE id = v_run_id;
  ASSERT v_status = 'cancelled', 'FAIL a2-2: got ' || v_status;

  -- dismissed
  INSERT INTO field_captures (id, client_capture_id, designer_id)
  VALUES (v_dismissed_id, gen_random_uuid(), 'ce000000-0000-4000-8000-000000000003');
  v_run_id := public.enqueue_capture_enrichment('field_capture', v_dismissed_id, 0);
  UPDATE field_captures SET status = 'dismissed' WHERE id = v_dismissed_id;
  v_outcome := public.claim_capture_enrichment_run(v_run_id, 0);
  ASSERT v_outcome = 'ignore_terminal', 'FAIL b2-1 (GS-06 field_capture dismissed): got ' || v_outcome;
  SELECT status INTO v_status FROM public.capture_enrichment_runs WHERE id = v_run_id;
  ASSERT v_status = 'cancelled', 'FAIL b2-2: got ' || v_status;

  -- saved (superseded-equivalent)
  INSERT INTO field_captures (id, client_capture_id, designer_id, status)
  VALUES (v_saved_id, gen_random_uuid(), 'ce000000-0000-4000-8000-000000000003', 'saved');
  v_run_id := public.enqueue_capture_enrichment('field_capture', v_saved_id, 0);
  v_outcome := public.claim_capture_enrichment_run(v_run_id, 0);
  ASSERT v_outcome = 'ignore_terminal', 'FAIL c2-1 (GS-07 field_capture saved): got ' || v_outcome;
  SELECT status INTO v_status FROM public.capture_enrichment_runs WHERE id = v_run_id;
  ASSERT v_status = 'cancelled', 'FAIL c2-2: got ' || v_status;

  RAISE NOTICE 'claim_terminal_target: field_capture mirror cases passed.';
END $$;

-- ─── (d) ANTI-VACUITY — prove the target-liveness check is load-bearing ────
DO $$
DECLARE
  v_target_id uuid := 'ce000000-0000-4000-8000-0000000000d7';
  v_run_id uuid;
  v_status_after_naive text;
  v_outcome text;
BEGIN
  INSERT INTO proposal_captures (id, designer_id, source_url)
  VALUES (v_target_id, 'ce000000-0000-4000-8000-000000000003', 'https://example.invalid/anti-vacuity-target');

  v_run_id := public.enqueue_capture_enrichment('proposal_capture', v_target_id, 0);
  DELETE FROM proposal_captures WHERE id = v_target_id;

  -- Naive permissive claim: ignores target liveness entirely, just checks
  -- the run's own status/revision and flips it to running.
  UPDATE public.capture_enrichment_runs
     SET status = 'running', attempts = attempts + 1
   WHERE id = v_run_id AND status = 'queued' AND content_revision = 0;

  SELECT status INTO v_status_after_naive FROM public.capture_enrichment_runs WHERE id = v_run_id;
  ASSERT v_status_after_naive = 'running',
    'FAIL d1 (ANTI-VACUITY SETUP BROKEN): a naive claim ignoring target liveness must have claimed the run for a deleted target — if it did not, case (a) proves nothing, got ' || v_status_after_naive;

  -- Restore ledger state and re-confirm the REAL function still refuses.
  UPDATE public.capture_enrichment_runs SET status = 'queued', attempts = 0 WHERE id = v_run_id;

  v_outcome := public.claim_capture_enrichment_run(v_run_id, 0);
  ASSERT v_outcome = 'ignore_terminal', 'FAIL d2: after restoring queued status, the real claim function must still refuse a deleted target, got ' || v_outcome;

  RAISE NOTICE 'claim_terminal_target: case (d) ANTI-VACUITY passed — the target-liveness guard is load-bearing.';
END $$;

ROLLBACK;
