-- ═══════════════════════════════════════════════════════════════════════════
-- 00559 — mark_first_document_opened: own-row-only, once, ACL parity
--
-- NOTE ON STYLE: supabase/tests/** is not pgTAP. Every file in that tree is a
-- plain psql script — BEGIN, fixtures, pg_temp role-assumption helpers, DO
-- blocks of ASSERTs, ROLLBACK — run under ON_ERROR_STOP=1. This file follows
-- rls/00557_increment_scan_upload_attempt.test.sql.
--
-- Run (single file, for iteration):
--   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -X -q \
--     -v ON_ERROR_STOP=1 \
--     -f supabase/tests/rls/00559_first_document_opened_test.sql
--
-- Run (the actual gate — whole suite against KNOWN_FAILURES.md):
--   bash scripts/run-sql-tests.sh
--
-- Covers:
--   1. an active member's first call stamps first_document_opened_at
--   2. a second call by the same member does not re-stamp it (the moment is
--      "first", not "most recent")
--   3. calling as a different active member never touches another member's
--      row — own-row only, via auth.uid()
--   4. ACL parity: SECURITY DEFINER (own-row UPDATE policy doesn't exist on
--      organization_members, mirroring set_my_member_title/00416), PUBLIC and
--      anon hold no EXECUTE, authenticated does
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

SET LOCAL statement_timeout = '60s';

-- ─── fixtures ──────────────────────────────────────────────────────────────
-- Olive = the studio owner. Hana = the first hire, whose arrival this row
-- exists to mark.

INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, instance_id, aud, role)
VALUES
  ('50000000-0000-4000-8000-000000000559', 'p559-olive@test.invalid', '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('50000000-0000-4000-8000-000000000560', 'p559-hana@test.invalid', '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.organizations (id, type, name, slug, status, created_at, updated_at)
VALUES ('0f559000-0000-4000-8000-000000000001'::uuid, 'design_studio', 'Test Studio 559', 'p559-test-studio', 'active', NOW(), NOW())
ON CONFLICT DO NOTHING;

INSERT INTO public.organization_members (user_id, organization_id, role, status, joined_at, created_at, updated_at)
VALUES
  ('50000000-0000-4000-8000-000000000559', '0f559000-0000-4000-8000-000000000001'::uuid, 'owner',  'active', NOW(), NOW(), NOW()),
  ('50000000-0000-4000-8000-000000000560', '0f559000-0000-4000-8000-000000000001'::uuid, 'member', 'active', NOW(), NOW(), NOW())
ON CONFLICT DO NOTHING;

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

CREATE OR REPLACE FUNCTION pg_temp.assume_anon()
RETURNS VOID AS $$
BEGIN
  PERFORM set_config('role', 'anon', true);
  PERFORM set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  EXECUTE 'SET LOCAL ROLE anon';
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION pg_temp.assume_anon() TO PUBLIC;

CREATE OR REPLACE FUNCTION pg_temp.reset_role()
RETURNS VOID AS $$
BEGIN
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claims', NULL, true);
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION pg_temp.reset_role() TO PUBLIC;

-- ─── 1 + 2. Hana's first call stamps once; a second call does not re-stamp ─

DO $$
DECLARE
  first_stamp  timestamptz;
  second_stamp timestamptz;
BEGIN
  PERFORM pg_temp.assume_user('50000000-0000-4000-8000-000000000560');
  PERFORM public.mark_first_document_opened();
  PERFORM pg_temp.reset_role();

  SELECT first_document_opened_at INTO first_stamp
    FROM public.organization_members
   WHERE user_id = '50000000-0000-4000-8000-000000000560'
     AND organization_id = '0f559000-0000-4000-8000-000000000001'::uuid;

  ASSERT first_stamp IS NOT NULL, 'FAIL 1: first call must stamp first_document_opened_at';

  PERFORM pg_temp.assume_user('50000000-0000-4000-8000-000000000560');
  PERFORM public.mark_first_document_opened();
  PERFORM pg_temp.reset_role();

  SELECT first_document_opened_at INTO second_stamp
    FROM public.organization_members
   WHERE user_id = '50000000-0000-4000-8000-000000000560'
     AND organization_id = '0f559000-0000-4000-8000-000000000001'::uuid;

  ASSERT second_stamp = first_stamp,
    'FAIL 2: a second call must not re-stamp — this is a FIRST-open marker, not a last-seen one';
END $$;

-- ─── 3. Olive's row is untouched — own-row only ────────────────────────────

DO $$
DECLARE
  owner_stamp timestamptz;
BEGIN
  SELECT first_document_opened_at INTO owner_stamp
    FROM public.organization_members
   WHERE user_id = '50000000-0000-4000-8000-000000000559'
     AND organization_id = '0f559000-0000-4000-8000-000000000001'::uuid;

  ASSERT owner_stamp IS NULL,
    'FAIL 3: Hana''s call must not have stamped the owner''s own row';
END $$;

-- ─── 4. ACL: SECURITY DEFINER, PUBLIC/anon locked out, authenticated in ────

DO $$
BEGIN
  ASSERT (
    SELECT p.prosecdef FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'mark_first_document_opened'
  ), 'mark_first_document_opened must be SECURITY DEFINER — organization_members has no own-row UPDATE policy';

  ASSERT NOT has_function_privilege('public'::name, 'public.mark_first_document_opened()', 'EXECUTE'),
    'PUBLIC must not execute mark_first_document_opened';
  ASSERT NOT has_function_privilege('anon'::name, 'public.mark_first_document_opened()', 'EXECUTE'),
    'anon must not execute mark_first_document_opened (prod auto-grants anon EXECUTE on create — the migration''s REVOKE must hold)';
  ASSERT has_function_privilege('authenticated'::name, 'public.mark_first_document_opened()', 'EXECUTE'),
    'authenticated must execute mark_first_document_opened — the caller is always a signed-in member';

  RAISE NOTICE '00559 assertions passed.';
END $$;

-- ─── 5. anon cannot stamp anyone's row, demonstrated rather than assumed ───

DO $$
DECLARE
  n integer;
BEGIN
  PERFORM pg_temp.assume_anon();
  BEGIN
    PERFORM public.mark_first_document_opened();
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;  -- expected: the REVOKE above should reject this before the body runs
  END;
  PERFORM pg_temp.reset_role();

  SELECT count(*) INTO n
    FROM public.organization_members
   WHERE organization_id = '0f559000-0000-4000-8000-000000000001'::uuid
     AND first_document_opened_at IS NOT NULL
     AND user_id <> '50000000-0000-4000-8000-000000000560';

  ASSERT n = 0, 'FAIL 5: the anon key must not be able to stamp any member''s row';
END $$;

-- ROLLBACK so the test is idempotent.
ROLLBACK;
