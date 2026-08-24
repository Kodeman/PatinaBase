-- ═══════════════════════════════════════════════════════════════════════════
-- capture_enrichment_runs RLS — target-type-dispatched visibility
-- (migration 00514 capture_enrichment_runs_target_visibility policy)
--
-- A run's visibility mirrors its TARGET's visibility, dispatched on
-- target_type: proposal_capture runs defer to proposal_captures' owner-only
-- RLS; field_capture runs defer to field_captures' owner-or-org-inbox RLS.
-- An unrecognized target_type has no branch and must fail closed.
--
-- Covers:
--   (a) proposal_capture target: owning designer sees the run; an unrelated
--       designer does not (mirrors proposal_captures' owner-only policy).
--   (b) field_capture target: owning designer sees the run; an unrelated,
--       non-org-member designer does not.
--   (c) field_capture target with status='inbox' and an organization_id:
--       an ACTIVE org co-member sees the run via field_captures' org-inbox
--       policy, even though they don't own the capture.
--   (d) fail-closed on an unrecognized target_type — even the run's own
--       enqueuer-equivalent owner cannot see it once target_type doesn't
--       match either branch.
--   (e) anon: zero grant, zero rows either way.
--   (f) ANTI-VACUITY — widen the policy to USING (true), confirm a
--       previously-invisible cross-designer run becomes visible, then
--       restore the exact policy and re-confirm invisibility.
--
-- Run:
--   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -X -q \
--     -v ON_ERROR_STOP=1 \
--     -f supabase/tests/capture_enrichment/target_type_visibility_test.sql
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

SET LOCAL statement_timeout = '30s';

-- ─── fixtures ────────────────────────────────────────────────────────────────
INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, instance_id, aud, role)
VALUES
  ('ce000000-0000-4000-8000-000000000010', 'ce-vis-owner@test.invalid', '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('ce000000-0000-4000-8000-000000000011', 'ce-vis-unrelated@test.invalid', '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('ce000000-0000-4000-8000-000000000012', 'ce-vis-coworker@test.invalid', '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');

INSERT INTO profiles (id, email, full_name, created_at, updated_at)
VALUES
  ('ce000000-0000-4000-8000-000000000010', 'ce-vis-owner@test.invalid', 'CE Vis Owner', NOW(), NOW()),
  ('ce000000-0000-4000-8000-000000000011', 'ce-vis-unrelated@test.invalid', 'CE Vis Unrelated', NOW(), NOW()),
  ('ce000000-0000-4000-8000-000000000012', 'ce-vis-coworker@test.invalid', 'CE Vis Coworker', NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

INSERT INTO organizations (id, type, name, slug)
VALUES ('ce000000-0000-4000-8000-0000000000e0', 'design_studio', 'CE Vis Test Org', 'ce-vis-test-org');

INSERT INTO organization_members (organization_id, user_id, role, status)
VALUES
  ('ce000000-0000-4000-8000-0000000000e0', 'ce000000-0000-4000-8000-000000000010', 'owner', 'active'),
  ('ce000000-0000-4000-8000-0000000000e0', 'ce000000-0000-4000-8000-000000000012', 'member', 'active');

INSERT INTO proposal_captures (id, designer_id, source_url)
VALUES ('ce000000-0000-4000-8000-0000000000f1', 'ce000000-0000-4000-8000-000000000010', 'https://example.invalid/vis-proposal');

INSERT INTO field_captures (id, client_capture_id, designer_id, status, organization_id)
VALUES ('ce000000-0000-4000-8000-0000000000f2', gen_random_uuid(), 'ce000000-0000-4000-8000-000000000010', 'inbox', 'ce000000-0000-4000-8000-0000000000e0');

INSERT INTO field_captures (id, client_capture_id, designer_id, status, organization_id)
VALUES ('ce000000-0000-4000-8000-0000000000f3', gen_random_uuid(), 'ce000000-0000-4000-8000-000000000010', 'synced', 'ce000000-0000-4000-8000-0000000000e0');

-- Runs, one per target (created as postgres so the SECURITY DEFINER RPC's own
-- grant restriction isn't part of what's under test here).
DO $$
BEGIN
  PERFORM public.enqueue_capture_enrichment('proposal_capture', 'ce000000-0000-4000-8000-0000000000f1', 0);
  PERFORM public.enqueue_capture_enrichment('field_capture', 'ce000000-0000-4000-8000-0000000000f2', 0);   -- inbox, org-visible
  PERFORM public.enqueue_capture_enrichment('field_capture', 'ce000000-0000-4000-8000-0000000000f3', 0);   -- synced, owner-only
END $$;

-- ─── helpers ─────────────────────────────────────────────────────────────────
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

-- ─── (a) proposal_capture target: owner sees, unrelated does not ──────────
DO $$
DECLARE v_count int;
BEGIN
  PERFORM pg_temp.assume_user('ce000000-0000-4000-8000-000000000010');
  SELECT count(*) INTO v_count FROM public.capture_enrichment_runs
   WHERE target_type = 'proposal_capture' AND target_id = 'ce000000-0000-4000-8000-0000000000f1';
  ASSERT v_count = 1, 'FAIL a1: owning designer must see the proposal_capture-targeted run, got ' || v_count;
  PERFORM pg_temp.reset_role();

  PERFORM pg_temp.assume_user('ce000000-0000-4000-8000-000000000011');
  SELECT count(*) INTO v_count FROM public.capture_enrichment_runs
   WHERE target_type = 'proposal_capture' AND target_id = 'ce000000-0000-4000-8000-0000000000f1';
  ASSERT v_count = 0, 'FAIL a2 (CROSS-TENANT): an unrelated designer must not see another designer''s proposal_capture-targeted run, got ' || v_count;
  PERFORM pg_temp.reset_role();

  RAISE NOTICE 'target_type_visibility: case (a) passed.';
END $$;

-- ─── (b) field_capture target (synced, owner-only): owner sees, unrelated not ─
DO $$
DECLARE v_count int;
BEGIN
  PERFORM pg_temp.assume_user('ce000000-0000-4000-8000-000000000010');
  SELECT count(*) INTO v_count FROM public.capture_enrichment_runs
   WHERE target_type = 'field_capture' AND target_id = 'ce000000-0000-4000-8000-0000000000f3';
  ASSERT v_count = 1, 'FAIL b1: owning designer must see the field_capture-targeted run, got ' || v_count;
  PERFORM pg_temp.reset_role();

  PERFORM pg_temp.assume_user('ce000000-0000-4000-8000-000000000011');
  SELECT count(*) INTO v_count FROM public.capture_enrichment_runs
   WHERE target_type = 'field_capture' AND target_id = 'ce000000-0000-4000-8000-0000000000f3';
  ASSERT v_count = 0, 'FAIL b2: an unrelated, non-org-member designer must not see a synced (non-inbox) field_capture-targeted run, got ' || v_count;
  PERFORM pg_temp.reset_role();

  RAISE NOTICE 'target_type_visibility: case (b) passed.';
END $$;

-- ─── (c) field_capture target (inbox + org): active org co-member sees it ──
DO $$
DECLARE v_count int;
BEGIN
  PERFORM pg_temp.assume_user('ce000000-0000-4000-8000-000000000012');  -- co-member, not the owner
  SELECT count(*) INTO v_count FROM public.capture_enrichment_runs
   WHERE target_type = 'field_capture' AND target_id = 'ce000000-0000-4000-8000-0000000000f2';
  ASSERT v_count = 1, 'FAIL c1: an active org co-member must see a run targeting an inbox, org-scoped field_capture, got ' || v_count;
  PERFORM pg_temp.reset_role();

  -- The SAME co-member must NOT see the synced (non-inbox) capture's run.
  PERFORM pg_temp.assume_user('ce000000-0000-4000-8000-000000000012');
  SELECT count(*) INTO v_count FROM public.capture_enrichment_runs
   WHERE target_type = 'field_capture' AND target_id = 'ce000000-0000-4000-8000-0000000000f3';
  ASSERT v_count = 0, 'FAIL c2: an org co-member must not see a run targeting a non-inbox field_capture they do not own, got ' || v_count;
  PERFORM pg_temp.reset_role();

  RAISE NOTICE 'target_type_visibility: case (c) passed.';
END $$;

-- ─── (d) fail-closed on an unrecognized target_type ─────────────────────────
DO $$
DECLARE
  v_run_id uuid := gen_random_uuid();
  v_count int;
BEGIN
  ALTER TABLE public.capture_enrichment_runs DROP CONSTRAINT capture_enrichment_runs_target_type_check;

  INSERT INTO public.capture_enrichment_runs (id, target_type, target_id, content_revision, status)
  VALUES (v_run_id, 'vendor_capture', 'ce000000-0000-4000-8000-0000000000f1', 0, 'queued');
  -- target_id deliberately reuses f1, a REAL row the owner can otherwise
  -- see under the proposal_capture branch — proves the ELSE branch is what
  -- refuses it, not merely a nonexistent target_id.

  PERFORM pg_temp.assume_user('ce000000-0000-4000-8000-000000000010');  -- owns the f1 target row
  SELECT count(*) INTO v_count FROM public.capture_enrichment_runs WHERE id = v_run_id;
  ASSERT v_count = 0, 'FAIL d1 (FAIL-CLOSED): an unrecognized target_type must be invisible even when target_id resolves to a row the caller can otherwise see, got ' || v_count;
  PERFORM pg_temp.reset_role();

  -- Clean up the deliberately-invalid row before restoring the CHECK
  -- constraint (it would otherwise fail validation against this row).
  DELETE FROM public.capture_enrichment_runs WHERE id = v_run_id;

  ALTER TABLE public.capture_enrichment_runs
    ADD CONSTRAINT capture_enrichment_runs_target_type_check
    CHECK (target_type IN ('proposal_capture', 'field_capture'));

  RAISE NOTICE 'target_type_visibility: case (d) FAIL-CLOSED passed.';
END $$;

-- ─── (e) anon: zero grant, zero rows ────────────────────────────────────────
DO $$
DECLARE v_raised boolean := false;
BEGIN
  ASSERT NOT has_table_privilege('anon'::name, 'public.capture_enrichment_runs'::regclass, 'SELECT'),
    'FAIL e1: anon must not hold SELECT privilege on capture_enrichment_runs at all';

  BEGIN
    EXECUTE 'SET LOCAL ROLE anon';
    PERFORM 1 FROM public.capture_enrichment_runs LIMIT 1;
  EXCEPTION WHEN insufficient_privilege THEN v_raised := true;
  END;
  RESET ROLE;
  ASSERT v_raised, 'FAIL e2: anon querying capture_enrichment_runs must raise insufficient_privilege, not merely return zero rows';

  RAISE NOTICE 'target_type_visibility: case (e) passed.';
END $$;

-- ─── (f) ANTI-VACUITY — prove the assertions above can actually fail ───────
DO $$
DECLARE v_count int;
BEGIN
  DROP POLICY IF EXISTS capture_enrichment_runs_target_visibility ON public.capture_enrichment_runs;
  CREATE POLICY capture_enrichment_runs_target_visibility ON public.capture_enrichment_runs
    FOR SELECT TO authenticated USING (true);

  PERFORM pg_temp.assume_user('ce000000-0000-4000-8000-000000000011');  -- unrelated, from case (a)
  SELECT count(*) INTO v_count FROM public.capture_enrichment_runs
   WHERE target_type = 'proposal_capture' AND target_id = 'ce000000-0000-4000-8000-0000000000f1';
  ASSERT v_count = 1,
    'FAIL f1 (ANTI-VACUITY SETUP BROKEN): widening the policy to USING (true) must make the cross-tenant run visible — if it does not, case (a) proves nothing, got ' || v_count;
  PERFORM pg_temp.reset_role();

  -- Restore the real policy verbatim from 00514_capture_enrichment_ledger.sql.
  DROP POLICY IF EXISTS capture_enrichment_runs_target_visibility ON public.capture_enrichment_runs;
  CREATE POLICY capture_enrichment_runs_target_visibility
    ON public.capture_enrichment_runs
    FOR SELECT
    TO authenticated
    USING (
      CASE target_type
        WHEN 'proposal_capture' THEN EXISTS (
          SELECT 1 FROM public.proposal_captures pc WHERE pc.id = capture_enrichment_runs.target_id
        )
        WHEN 'field_capture' THEN EXISTS (
          SELECT 1 FROM public.field_captures fc WHERE fc.id = capture_enrichment_runs.target_id
        )
        ELSE false
      END
    );

  PERFORM pg_temp.assume_user('ce000000-0000-4000-8000-000000000011');
  SELECT count(*) INTO v_count FROM public.capture_enrichment_runs
   WHERE target_type = 'proposal_capture' AND target_id = 'ce000000-0000-4000-8000-0000000000f1';
  ASSERT v_count = 0, 'FAIL f2: after restoring the real policy the cross-tenant run must be invisible again, got ' || v_count;
  PERFORM pg_temp.reset_role();

  RAISE NOTICE 'target_type_visibility: case (f) ANTI-VACUITY passed — assertions above are load-bearing.';
END $$;

ROLLBACK;
