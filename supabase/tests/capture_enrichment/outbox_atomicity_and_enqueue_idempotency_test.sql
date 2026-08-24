-- ═══════════════════════════════════════════════════════════════════════════
-- capture_enrichment: outbox same-transaction atomicity + enqueue idempotency
-- (migrations 00514/00515)
--
-- Covers:
--   (a) enqueue_capture_enrichment writes the run row AND its outbox row
--       together — a run never exists without exactly one matching outbox
--       row (same-transaction outbox pattern).
--   (b) re-enqueuing the SAME (target_type, target_id, content_revision)
--       is a no-op: same run id returned, no second run row, no second
--       outbox row.
--   (c) a DIFFERENT content_revision for the same target creates a
--       genuinely new run + outbox row (not folded into the first).
--   (d) ANTI-VACUITY — a permissive variant of enqueue that skips the
--       ON CONFLICT guard would create a duplicate run; proven by
--       temporarily dropping the unique index and re-running the naive
--       insert shape, then restoring it and re-confirming idempotency.
--
-- Run:
--   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -X -q \
--     -v ON_ERROR_STOP=1 \
--     -f supabase/tests/capture_enrichment/outbox_atomicity_and_enqueue_idempotency_test.sql
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

SET LOCAL statement_timeout = '30s';
SET LOCAL ROLE postgres;

-- ─── fixtures ────────────────────────────────────────────────────────────────
INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, instance_id, aud, role)
VALUES ('ce000000-0000-4000-8000-000000000001', 'ce-owner-a@test.invalid', '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');

INSERT INTO profiles (id, email, full_name, created_at, updated_at)
VALUES ('ce000000-0000-4000-8000-000000000001', 'ce-owner-a@test.invalid', 'CE Owner A', NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

INSERT INTO proposal_captures (id, designer_id, source_url)
VALUES ('ce000000-0000-4000-8000-0000000000c1', 'ce000000-0000-4000-8000-000000000001', 'https://example.invalid/product-a');

-- ─── (a) run + outbox created together, exactly one of each ───────────────
DO $$
DECLARE
  v_run_id uuid;
  v_run_count int;
  v_outbox_count int;
BEGIN
  v_run_id := public.enqueue_capture_enrichment(
    p_target_type => 'proposal_capture',
    p_target_id => 'ce000000-0000-4000-8000-0000000000c1',
    p_content_revision => 0,
    p_content_hash => 'hash-0',
    p_pipeline_version => 'v1'
  );

  SELECT count(*) INTO v_run_count FROM public.capture_enrichment_runs WHERE id = v_run_id;
  ASSERT v_run_count = 1, 'FAIL a1: exactly one run row must exist for the new id, got ' || v_run_count;

  SELECT count(*) INTO v_outbox_count FROM public.capture_enrichment_outbox WHERE enrichment_run_id = v_run_id;
  ASSERT v_outbox_count = 1, 'FAIL a2 (OUTBOX ATOMICITY): exactly one outbox row must exist for the new run, got ' || v_outbox_count;

  PERFORM 1 FROM public.capture_enrichment_runs WHERE id = v_run_id AND status = 'queued';
  ASSERT FOUND, 'FAIL a3: a freshly enqueued run must start status=queued';

  RAISE NOTICE 'outbox_atomicity: case (a) passed. run_id=%', v_run_id;
END $$;

-- ─── (b) re-enqueue same tuple is a no-op ──────────────────────────────────
DO $$
DECLARE
  v_run_id_1 uuid;
  v_run_id_2 uuid;
  v_run_count int;
  v_outbox_count int;
BEGIN
  SELECT id INTO v_run_id_1 FROM public.capture_enrichment_runs
   WHERE target_type = 'proposal_capture' AND target_id = 'ce000000-0000-4000-8000-0000000000c1' AND content_revision = 0;

  v_run_id_2 := public.enqueue_capture_enrichment(
    p_target_type => 'proposal_capture',
    p_target_id => 'ce000000-0000-4000-8000-0000000000c1',
    p_content_revision => 0,
    p_content_hash => 'hash-0-resent',
    p_pipeline_version => 'v1'
  );

  ASSERT v_run_id_2 = v_run_id_1, 'FAIL b1 (ENQUEUE IDEMPOTENCY): re-enqueuing the same (target_type, target_id, content_revision) must return the SAME run id, got a different one';

  SELECT count(*) INTO v_run_count FROM public.capture_enrichment_runs
   WHERE target_type = 'proposal_capture' AND target_id = 'ce000000-0000-4000-8000-0000000000c1' AND content_revision = 0;
  ASSERT v_run_count = 1, 'FAIL b2: re-enqueue must never create a duplicate run row, got ' || v_run_count;

  SELECT count(*) INTO v_outbox_count FROM public.capture_enrichment_outbox WHERE enrichment_run_id = v_run_id_1;
  ASSERT v_outbox_count = 1, 'FAIL b3: re-enqueue must never create a duplicate outbox row, got ' || v_outbox_count;

  RAISE NOTICE 'outbox_atomicity: case (b) passed.';
END $$;

-- ─── (c) a different content_revision creates a genuinely new run ─────────
DO $$
DECLARE
  v_run_id_rev0 uuid;
  v_run_id_rev1 uuid;
  v_run_count int;
BEGIN
  SELECT id INTO v_run_id_rev0 FROM public.capture_enrichment_runs
   WHERE target_type = 'proposal_capture' AND target_id = 'ce000000-0000-4000-8000-0000000000c1' AND content_revision = 0;

  v_run_id_rev1 := public.enqueue_capture_enrichment(
    p_target_type => 'proposal_capture',
    p_target_id => 'ce000000-0000-4000-8000-0000000000c1',
    p_content_revision => 1,
    p_content_hash => 'hash-1',
    p_pipeline_version => 'v1'
  );

  ASSERT v_run_id_rev1 <> v_run_id_rev0, 'FAIL c1: a new content_revision must produce a NEW run id';

  SELECT count(*) INTO v_run_count FROM public.capture_enrichment_runs
   WHERE target_type = 'proposal_capture' AND target_id = 'ce000000-0000-4000-8000-0000000000c1';
  ASSERT v_run_count = 2, 'FAIL c2: target must now have exactly two run rows (revision 0 and 1), got ' || v_run_count;

  RAISE NOTICE 'outbox_atomicity: case (c) passed.';
END $$;

-- ─── (d) ANTI-VACUITY — prove the ON CONFLICT guard is load-bearing ────────
-- Drop the unique index that backs the idempotency guarantee, then issue the
-- SAME plain INSERT shape enqueue_capture_enrichment uses internally (minus
-- the ON CONFLICT clause, which would fail without a matching unique/exclusion
-- constraint) for an ALREADY-enqueued tuple. Without the constraint, this
-- naive insert succeeds and creates a duplicate — proving the assertions in
-- (b) are not vacuously true because duplicates were already structurally
-- impossible for some unrelated reason. Restore the index and re-confirm.
DO $$
DECLARE
  v_dup_run_id uuid := gen_random_uuid();
  v_run_count int;
BEGIN
  DROP INDEX IF EXISTS public.capture_enrichment_runs_target_revision_uq;

  INSERT INTO public.capture_enrichment_runs (
    id, target_type, target_id, content_revision, status
  ) VALUES (
    v_dup_run_id, 'proposal_capture', 'ce000000-0000-4000-8000-0000000000c1', 0, 'queued'
  );

  SELECT count(*) INTO v_run_count FROM public.capture_enrichment_runs
   WHERE target_type = 'proposal_capture' AND target_id = 'ce000000-0000-4000-8000-0000000000c1' AND content_revision = 0;
  ASSERT v_run_count = 2,
    'FAIL d1 (ANTI-VACUITY SETUP BROKEN): without the unique index, a second insert for the same tuple must succeed and create a duplicate — if it does not, case (b) proves nothing, got ' || v_run_count;

  -- Clean up the deliberately-created duplicate before restoring the index
  -- (the index recreation below would otherwise fail on the duplicate).
  DELETE FROM public.capture_enrichment_runs WHERE id = v_dup_run_id;

  CREATE UNIQUE INDEX capture_enrichment_runs_target_revision_uq
    ON public.capture_enrichment_runs (target_type, target_id, content_revision);

  -- Re-confirm idempotency now that the real constraint is back.
  PERFORM public.enqueue_capture_enrichment(
    p_target_type => 'proposal_capture',
    p_target_id => 'ce000000-0000-4000-8000-0000000000c1',
    p_content_revision => 0
  );
  SELECT count(*) INTO v_run_count FROM public.capture_enrichment_runs
   WHERE target_type = 'proposal_capture' AND target_id = 'ce000000-0000-4000-8000-0000000000c1' AND content_revision = 0;
  ASSERT v_run_count = 1,
    'FAIL d2: after restoring the real unique index, re-enqueue must be idempotent again, got ' || v_run_count;

  RAISE NOTICE 'outbox_atomicity: case (d) ANTI-VACUITY passed — the uniqueness guarantee is load-bearing.';
END $$;

RESET ROLE;
ROLLBACK;
