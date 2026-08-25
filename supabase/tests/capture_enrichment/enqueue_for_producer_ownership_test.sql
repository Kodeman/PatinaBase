-- ═══════════════════════════════════════════════════════════════════════════
-- capture_enrichment: enqueue_capture_enrichment_for_producer ownership gate
-- (migration 00516, security fix-up)
--
-- Adversarial review of the first cut of 00516 found that it granted EXECUTE
-- on the service-role primitive enqueue_capture_enrichment directly to
-- `authenticated`. That primitive takes a bare target_id with NO ownership
-- check of its own (ownership is meant to be enforced one layer up, by the
-- producer RPC) — so the direct grant let ANY authenticated caller enqueue
-- an enrichment run against ANY capture id, including one they don't own:
--   - suppression: enqueue a high content_revision against a victim's real
--     capture id so claim_capture_enrichment_run's staleness check (00515)
--     cancels the victim's own in-flight run.
--   - spam/cost amplification: enqueue arbitrary (target_type, target_id)
--     pairs with no ownership gate.
--   - unsolicited writes: ledger rows attached to a capture the caller
--     doesn't own.
--
-- The fix revokes that grant (enqueue_capture_enrichment goes back to
-- service_role-only, matching 00515) and introduces a new SECURITY DEFINER
-- wrapper, enqueue_capture_enrichment_for_producer, which re-verifies the
-- caller owns the target row BEFORE calling the primitive. THIS test proves
-- that check is load-bearing:
--   (a) an authenticated caller CANNOT enqueue for a field_capture owned by
--       a different designer — raises insufficient_privilege (42501), and
--       creates no enrichment run.
--   (b) same, for a proposal_capture owned by a different designer.
--   (c) ANTI-VACUITY: the SAME caller CAN enqueue for their OWN capture of
--       each type — proves (a)/(b) fail because of the cross-tenant check
--       specifically, not because the wrapper (or this test) is broken and
--       rejects everything unconditionally. A version of the wrapper with
--       the ownership check deleted (i.e. it just forwards to the primitive)
--       would make (a)/(b) FAIL this test (no exception raised, run count
--       increments) — that is the anti-vacuity property this test relies on.
--
-- Run:
--   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -X -q \
--     -v ON_ERROR_STOP=1 \
--     -f supabase/tests/capture_enrichment/enqueue_for_producer_ownership_test.sql
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

SET LOCAL statement_timeout = '30s';

-- ─── helpers (mirrors supabase/tests/aesthete/match_rpc_test.sql /
-- capture_enrichment/producer_double_submit_proposal_capture_test.sql) ─────
CREATE OR REPLACE FUNCTION pg_temp.assume_user(p_user_id UUID)
RETURNS VOID AS $$
BEGIN
  PERFORM set_config('role', 'authenticated', true);
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', p_user_id::text, 'role', 'authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION pg_temp.assume_user(UUID) TO PUBLIC;

CREATE OR REPLACE FUNCTION pg_temp.reset_role()
RETURNS VOID AS $$
BEGIN
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claims', NULL, true);
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION pg_temp.reset_role() TO PUBLIC;

-- ─── fixtures ────────────────────────────────────────────────────────────────
SET LOCAL ROLE postgres;

INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, instance_id, aud, role)
VALUES
  ('ea000000-0000-4000-8000-00000000000a', 'ea-designer-a@test.invalid', '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('ea000000-0000-4000-8000-00000000000b', 'ea-designer-b@test.invalid', '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');

INSERT INTO profiles (id, email, full_name, created_at, updated_at)
VALUES
  ('ea000000-0000-4000-8000-00000000000a', 'ea-designer-a@test.invalid', 'EA Designer A', NOW(), NOW()),
  ('ea000000-0000-4000-8000-00000000000b', 'ea-designer-b@test.invalid', 'EA Designer B', NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

-- A field_capture and a proposal_capture, BOTH owned by designer B.
INSERT INTO field_captures (id, client_capture_id, designer_id)
VALUES ('ea000000-0000-4000-8000-0000000000f1', 'ea000000-0000-4000-8000-0000000000f2', 'ea000000-0000-4000-8000-00000000000b');

INSERT INTO proposal_captures (id, designer_id, source_url)
VALUES ('ea000000-0000-4000-8000-0000000000c1', 'ea000000-0000-4000-8000-00000000000b', 'https://example.invalid/owned-by-b');

RESET ROLE;

-- ─── (a) cross-tenant field_capture: A cannot enqueue for B's row ──────────
DO $$
DECLARE
  v_user_a UUID := 'ea000000-0000-4000-8000-00000000000a';
  v_field_capture_b UUID := 'ea000000-0000-4000-8000-0000000000f1';
  v_run_count_before INT;
  v_run_count_after INT;
  v_raised BOOLEAN := false;
  v_sqlstate TEXT := NULL;
BEGIN
  SET LOCAL ROLE postgres;
  SELECT count(*) INTO v_run_count_before FROM capture_enrichment_runs
   WHERE target_type = 'field_capture' AND target_id = v_field_capture_b;
  RESET ROLE;

  PERFORM pg_temp.assume_user(v_user_a);
  BEGIN
    PERFORM public.enqueue_capture_enrichment_for_producer('field_capture', v_field_capture_b, 1);
  EXCEPTION WHEN insufficient_privilege THEN
    v_raised := true;
    v_sqlstate := SQLSTATE;
  END;
  PERFORM pg_temp.reset_role();

  ASSERT v_raised, 'FAIL a0 (CROSS-TENANT): designer A must NOT be able to enqueue enrichment for a field_capture owned by designer B — a version of the wrapper without the ownership check would let this call succeed silently';
  ASSERT v_sqlstate = '42501', 'FAIL a1: expected insufficient_privilege (42501), got ' || COALESCE(v_sqlstate, 'NULL (no exception raised)');

  SET LOCAL ROLE postgres;
  SELECT count(*) INTO v_run_count_after FROM capture_enrichment_runs
   WHERE target_type = 'field_capture' AND target_id = v_field_capture_b;
  RESET ROLE;
  ASSERT v_run_count_after = v_run_count_before,
    'FAIL a2: the rejected cross-tenant call must not create an enrichment run — before=' || v_run_count_before || ' after=' || v_run_count_after;

  RAISE NOTICE 'enqueue_for_producer_ownership: case (a) passed — cross-tenant field_capture enqueue rejected.';
END $$;

-- ─── (b) cross-tenant proposal_capture: A cannot enqueue for B's row ───────
DO $$
DECLARE
  v_user_a UUID := 'ea000000-0000-4000-8000-00000000000a';
  v_proposal_capture_b UUID := 'ea000000-0000-4000-8000-0000000000c1';
  v_run_count_before INT;
  v_run_count_after INT;
  v_raised BOOLEAN := false;
  v_sqlstate TEXT := NULL;
BEGIN
  SET LOCAL ROLE postgres;
  SELECT count(*) INTO v_run_count_before FROM capture_enrichment_runs
   WHERE target_type = 'proposal_capture' AND target_id = v_proposal_capture_b;
  RESET ROLE;

  PERFORM pg_temp.assume_user(v_user_a);
  BEGIN
    PERFORM public.enqueue_capture_enrichment_for_producer('proposal_capture', v_proposal_capture_b, 1);
  EXCEPTION WHEN insufficient_privilege THEN
    v_raised := true;
    v_sqlstate := SQLSTATE;
  END;
  PERFORM pg_temp.reset_role();

  ASSERT v_raised, 'FAIL b0 (CROSS-TENANT): designer A must NOT be able to enqueue enrichment for a proposal_capture owned by designer B — a version of the wrapper without the ownership check would let this call succeed silently';
  ASSERT v_sqlstate = '42501', 'FAIL b1: expected insufficient_privilege (42501), got ' || COALESCE(v_sqlstate, 'NULL (no exception raised)');

  SET LOCAL ROLE postgres;
  SELECT count(*) INTO v_run_count_after FROM capture_enrichment_runs
   WHERE target_type = 'proposal_capture' AND target_id = v_proposal_capture_b;
  RESET ROLE;
  ASSERT v_run_count_after = v_run_count_before,
    'FAIL b2: the rejected cross-tenant call must not create an enrichment run — before=' || v_run_count_before || ' after=' || v_run_count_after;

  RAISE NOTICE 'enqueue_for_producer_ownership: case (b) passed — cross-tenant proposal_capture enqueue rejected.';
END $$;

-- ─── (c) ANTI-VACUITY: the OWNER can still enqueue for their own captures
-- of both target types — proves (a)/(b) reject specifically because of
-- cross-tenant ownership, not because the wrapper (or this test's harness)
-- rejects every call unconditionally. ───────────────────────────────────────
DO $$
DECLARE
  v_user_b UUID := 'ea000000-0000-4000-8000-00000000000b';
  v_field_capture_b UUID := 'ea000000-0000-4000-8000-0000000000f1';
  v_proposal_capture_b UUID := 'ea000000-0000-4000-8000-0000000000c1';
  v_field_run_id UUID;
  v_proposal_run_id UUID;
  v_field_run_count INT;
  v_proposal_run_count INT;
BEGIN
  PERFORM pg_temp.assume_user(v_user_b);
  v_field_run_id := public.enqueue_capture_enrichment_for_producer('field_capture', v_field_capture_b, 1);
  v_proposal_run_id := public.enqueue_capture_enrichment_for_producer('proposal_capture', v_proposal_capture_b, 1);
  PERFORM pg_temp.reset_role();

  ASSERT v_field_run_id IS NOT NULL, 'FAIL c0 (ANTI-VACUITY): the OWNER must be able to enqueue enrichment for their own field_capture';
  ASSERT v_proposal_run_id IS NOT NULL, 'FAIL c1 (ANTI-VACUITY): the OWNER must be able to enqueue enrichment for their own proposal_capture';

  SET LOCAL ROLE postgres;
  SELECT count(*) INTO v_field_run_count FROM capture_enrichment_runs
   WHERE target_type = 'field_capture' AND target_id = v_field_capture_b;
  SELECT count(*) INTO v_proposal_run_count FROM capture_enrichment_runs
   WHERE target_type = 'proposal_capture' AND target_id = v_proposal_capture_b;
  RESET ROLE;

  ASSERT v_field_run_count = 1, 'FAIL c2: expected exactly one field_capture enrichment run for the owner-initiated enqueue, got ' || v_field_run_count;
  ASSERT v_proposal_run_count = 1, 'FAIL c3: expected exactly one proposal_capture enrichment run for the owner-initiated enqueue, got ' || v_proposal_run_count;

  RAISE NOTICE 'enqueue_for_producer_ownership: ANTI-VACUITY case (c) passed — the owner-path still works; (a)/(b) fail specifically on cross-tenant ownership.';
END $$;

RESET ROLE;
ROLLBACK;
