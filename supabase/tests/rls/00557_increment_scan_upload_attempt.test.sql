-- ═══════════════════════════════════════════════════════════════════════════
-- 00557 — increment_scan_upload_attempt: owner gate, monotonicity, ACL parity
--
-- NOTE ON STYLE: supabase/tests/** is not pgTAP. Every file in that tree is a
-- plain psql script — BEGIN, fixtures, pg_temp role-assumption helpers, DO
-- blocks of ASSERTs, ROLLBACK — run under ON_ERROR_STOP=1. This file follows
-- rls/products_three_layer_test.sql (identity switching) and the sibling
-- rls/00555_ios_round_one_security.test.sql.
--
-- Run (single file, for iteration):
--   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -X -q \
--     -v ON_ERROR_STOP=1 \
--     -f supabase/tests/rls/00557_increment_scan_upload_attempt.test.sql
--
-- Run (the actual gate — whole suite against KNOWN_FAILURES.md):
--   bash scripts/run-sql-tests.sh
--
-- Covers:
--   1. the owner's call increments the counter, stamps upload_started_at and
--      moves status to 'uploading' — the three things the Swift fallback at
--      RoomScanSyncService+AdvancedBundle.swift:653-664 does when the RPC is
--      absent, which is the contract this function has to honour
--   2. it is monotonic across resumed attempts, and upload_started_at is
--      stamped ONCE (00082 calls it the FIRST-PUT timestamp)
--   3. a non-owner's call is a silent no-op — SECURITY INVOKER plus the
--      auth.uid() gate, same contract as mark_scan_upload_complete
--   4. ACL parity with 00082: not SECURITY DEFINER, PUBLIC holds no EXECUTE,
--      anon and authenticated both do (ruling D13)
--   5. the two departures from 00082 that guard against the 00282 failure
--      mode: search_path is PINNED and room_scans is SCHEMA-QUALIFIED, so the
--      function cannot resolve a different table under a caller's search_path
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

SET LOCAL statement_timeout = '60s';

-- ─── fixtures ──────────────────────────────────────────────────────────────
-- Owen = the scan's owner
-- Otto = a signed-in stranger, who must not be able to touch Owen's scan

INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, instance_id, aud, role)
VALUES
  ('50000000-0000-4000-8000-000000000001', 'p556-owen@test.invalid', '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('50000000-0000-4000-8000-000000000002', 'p556-otto@test.invalid', '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated')
ON CONFLICT (id) DO NOTHING;

-- room_scans requires only user_id + name (00077/00082); upload_attempt_count
-- carries NOT NULL DEFAULT 0 and upload_started_at is nullable, which is
-- exactly the pre-first-attempt state this file exercises.
INSERT INTO public.room_scans (id, user_id, name)
VALUES ('56000000-0000-4000-8000-000000000001'::uuid,
        '50000000-0000-4000-8000-000000000001',
        'p556 upload attempt scan')
ON CONFLICT (id) DO NOTHING;

DO $$
DECLARE
  n integer;
BEGIN
  SELECT upload_attempt_count INTO n
    FROM public.room_scans WHERE id = '56000000-0000-4000-8000-000000000001'::uuid;
  ASSERT n = 0,
    'FIXTURE: the scan must start at attempt 0 or every count below is meaningless, got ' || n;
END $$;

-- ─── helpers (same shape as products_three_layer_test.sql) ─────────────────
-- The GRANT after each definition is required: 00483 revokes database
-- TEMPORARY from authenticated/anon/service_role, so a restricted role cannot
-- reach a pg_temp function without it.

CREATE OR REPLACE FUNCTION pg_temp.assume_user(p_user_id UUID)
RETURNS VOID AS $$
BEGIN
  PERFORM set_config('role', 'authenticated', true);
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', p_user_id::text, 'role', 'authenticated')::text,
    true
  );
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

-- ─── 1 + 2. the owner increments, monotonically, stamping start once ───────

DO $$
DECLARE
  n         integer;
  started_1 timestamptz;
  started_2 timestamptz;
  v_status  text;
BEGIN
  PERFORM pg_temp.assume_user('50000000-0000-4000-8000-000000000001');

  PERFORM public.increment_scan_upload_attempt('56000000-0000-4000-8000-000000000001'::uuid);
  SELECT upload_attempt_count, upload_started_at, status
    INTO n, started_1, v_status
    FROM public.room_scans WHERE id = '56000000-0000-4000-8000-000000000001'::uuid;

  ASSERT n = 1, 'FAIL 1a: the first attempt must set the counter to 1, got ' || n;
  ASSERT started_1 IS NOT NULL, 'FAIL 1b: the first attempt must stamp upload_started_at';
  ASSERT v_status = 'uploading',
    'FAIL 1c: the first attempt must set status=uploading (the Swift fallback does), got '
      || COALESCE(v_status, '<null>');

  -- two resumed attempts
  PERFORM public.increment_scan_upload_attempt('56000000-0000-4000-8000-000000000001'::uuid);
  PERFORM public.increment_scan_upload_attempt('56000000-0000-4000-8000-000000000001'::uuid);
  SELECT upload_attempt_count, upload_started_at
    INTO n, started_2
    FROM public.room_scans WHERE id = '56000000-0000-4000-8000-000000000001'::uuid;

  ASSERT n = 3, 'FAIL 2a: the counter must be monotonic across resumes, got ' || n;
  ASSERT started_2 = started_1,
    'FAIL 2b: upload_started_at is the FIRST PUT (00082 column comment) and must not be rewritten';

  PERFORM pg_temp.reset_role();
END $$;

-- ─── 3. a signed-in stranger cannot touch someone else's scan ──────────────
--
-- SECURITY INVOKER + `AND user_id = auth.uid()` means this is a zero-row
-- UPDATE, not an error — the same contract mark_scan_upload_complete has had
-- since 00082, so the assertion is on the COUNTER, not on an exception.

DO $$
DECLARE
  n integer;
BEGIN
  PERFORM pg_temp.assume_user('50000000-0000-4000-8000-000000000002');
  PERFORM public.increment_scan_upload_attempt('56000000-0000-4000-8000-000000000001'::uuid);
  PERFORM pg_temp.reset_role();

  SELECT upload_attempt_count INTO n
    FROM public.room_scans WHERE id = '56000000-0000-4000-8000-000000000001'::uuid;
  ASSERT n = 3, 'FAIL 3: a non-owner advanced another user''s attempt counter to ' || n;
END $$;

-- ─── 4. ACL parity with mark_scan_upload_complete (00082) ──────────────────

DO $$
BEGIN
  ASSERT NOT (
    SELECT p.prosecdef FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'increment_scan_upload_attempt'
  ), 'increment_scan_upload_attempt must be SECURITY INVOKER, like mark_scan_upload_complete';

  ASSERT NOT has_function_privilege('public'::name, 'public.increment_scan_upload_attempt(uuid)', 'EXECUTE'),
    'PUBLIC must not execute increment_scan_upload_attempt';
  ASSERT has_function_privilege('authenticated'::name, 'public.increment_scan_upload_attempt(uuid)', 'EXECUTE'),
    'authenticated must execute increment_scan_upload_attempt — the uploader is an authenticated caller';
  ASSERT has_function_privilege('anon'::name, 'public.increment_scan_upload_attempt(uuid)', 'EXECUTE'),
    'anon must execute increment_scan_upload_attempt (D13: mirror mark_scan_upload_complete''s grants)';

  -- and it really does mirror 00082 rather than merely resembling it
  ASSERT (
    SELECT bool_and(NOT p.prosecdef) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN ('increment_scan_upload_attempt', 'mark_scan_upload_complete')
  ), 'the two scan-upload RPCs must both be SECURITY INVOKER';

  RAISE NOTICE '00557 assertions passed.';
END $$;

-- ─── 5. search_path is pinned and the table is schema-qualified ────────────
--
-- 00282 shipped a bare table name that resolved locally and failed on Strata
-- with 42883 under the push session's search_path. These two assertions are
-- what stop this file drifting back to 00082's unpinned shape.

DO $$
DECLARE
  v_config text[];
  v_src    text;
BEGIN
  SELECT p.proconfig, p.prosrc INTO v_config, v_src
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'increment_scan_upload_attempt';

  ASSERT v_config IS NOT NULL
     AND EXISTS (SELECT 1 FROM unnest(v_config) c WHERE c LIKE 'search_path=%'),
    'FAIL 5a: increment_scan_upload_attempt does not pin search_path (function_search_path_mutable)';

  ASSERT v_src ILIKE '%public.room_scans%',
    'FAIL 5b: increment_scan_upload_attempt does not schema-qualify room_scans';

  RAISE NOTICE '00557 search_path assertions passed.';
END $$;

-- ROLLBACK so the test is idempotent.
ROLLBACK;
