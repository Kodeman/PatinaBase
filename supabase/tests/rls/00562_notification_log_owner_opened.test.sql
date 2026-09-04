-- ═══════════════════════════════════════════════════════════════════════════
-- 00562 — notification_log owner-opened policy
--
-- NOTE ON STYLE: supabase/tests/** is not pgTAP. Every file in that tree is a
-- plain psql script — BEGIN, fixtures, pg_temp role-assumption helpers, DO
-- blocks of ASSERTs, ROLLBACK — run under ON_ERROR_STOP=1. This file follows
-- rls/00557_increment_scan_upload_attempt.test.sql.
--
-- Run (single file, for iteration):
--   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -X -q \
--     -v ON_ERROR_STOP=1 \
--     -f supabase/tests/rls/00562_notification_log_owner_opened.test.sql
--
-- Run (the actual gate — whole suite against KNOWN_FAILURES.md):
--   bash scripts/run-sql-tests.sh
--
-- Covers:
--   1. the addressed user's own PATCH — exactly the one the iOS app issues,
--      `opened_at IS NULL AND channel IN (in_app, push)` — now affects rows.
--      This is C2-07's whole mechanism: before 00562 it affected zero and the
--      bell could never reach zero.
--   2. a stranger's identical UPDATE still affects nothing.
--   3. the two channels the client never surfaces (email, sms) are out of
--      reach, so a client cannot rewrite delivery machinery.
--   4. the column ceiling: `authenticated` holds UPDATE on exactly
--      opened_at / clicked_at / status and on nothing else — `metadata`
--      carries the deep link and must not be client-writable.
--   5. the WITH CHECK: an engagement write is allowed, a delivery claim
--      ('bounced') is refused.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

SET LOCAL statement_timeout = '60s';

-- ─── fixtures ──────────────────────────────────────────────────────────────
-- Nora = the addressed user. Nolan = a signed-in stranger.
-- notification_log.user_id REFERENCES profiles(id), so both need a profile.

INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, instance_id, aud, role)
VALUES
  ('56200000-0000-4000-8000-000000000001', 'p562-nora@test.invalid',  '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('56200000-0000-4000-8000-000000000002', 'p562-nolan@test.invalid', '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.profiles (id, email)
VALUES
  ('56200000-0000-4000-8000-000000000001', 'p562-nora@test.invalid'),
  ('56200000-0000-4000-8000-000000000002', 'p562-nolan@test.invalid')
ON CONFLICT (id) DO NOTHING;

-- Two surfaced rows for Nora, one email row for Nora, one row for Nolan.
INSERT INTO public.notification_log (id, user_id, type, channel, status, metadata)
VALUES
  ('56200000-0000-4000-8000-0000000000a1', '56200000-0000-4000-8000-000000000001',
   'decision_required', 'in_app', 'delivered', '{"deep_link":"/decisions/x"}'::jsonb),
  ('56200000-0000-4000-8000-0000000000a2', '56200000-0000-4000-8000-000000000001',
   'invoice_due', 'push', 'delivered', '{}'::jsonb),
  ('56200000-0000-4000-8000-0000000000a3', '56200000-0000-4000-8000-000000000001',
   'invoice_due', 'email', 'delivered', '{}'::jsonb),
  ('56200000-0000-4000-8000-0000000000b1', '56200000-0000-4000-8000-000000000002',
   'decision_required', 'in_app', 'delivered', '{}'::jsonb)
ON CONFLICT (id) DO NOTHING;

DO $$
DECLARE
  n integer;
BEGIN
  SELECT count(*) INTO n
    FROM public.notification_log
   WHERE user_id = '56200000-0000-4000-8000-000000000001'
     AND opened_at IS NULL;
  ASSERT n = 3,
    'FIXTURE: Nora must start with 3 unread rows or every count below is meaningless, got ' || n;
END $$;

-- ─── helpers (same shape as 00557's) ───────────────────────────────────────
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

-- ─── 1 + 3. the app's own PATCH lands, and stops at the surfaced channels ──

DO $$
DECLARE
  touched integer;
  still_unread integer;
  email_opened timestamptz;
BEGIN
  PERFORM pg_temp.assume_user('56200000-0000-4000-8000-000000000001');

  -- Exactly `markAllOpened`: opened_at IS NULL, channel in the surfaced set.
  UPDATE public.notification_log
     SET opened_at = NOW(), status = 'opened'
   WHERE opened_at IS NULL
     AND channel IN ('in_app', 'push');
  GET DIAGNOSTICS touched = ROW_COUNT;

  ASSERT touched = 2,
    'FAIL 1: the addressed user''s markAllOpened must affect their 2 surfaced rows, got ' || touched;

  PERFORM pg_temp.reset_role();

  SELECT count(*) INTO still_unread
    FROM public.notification_log
   WHERE user_id = '56200000-0000-4000-8000-000000000001'
     AND channel IN ('in_app', 'push')
     AND opened_at IS NULL;
  ASSERT still_unread = 0,
    'FAIL 1b: the bell must be able to reach zero; ' || still_unread || ' surfaced rows still unread';

  SELECT opened_at INTO email_opened
    FROM public.notification_log
   WHERE id = '56200000-0000-4000-8000-0000000000a3';
  ASSERT email_opened IS NULL,
    'FAIL 3: the email row is delivery machinery and must stay out of the client''s reach';

  RAISE NOTICE '00562 owner-opened assertions passed.';
END $$;

-- ─── 2. a stranger reaches nothing ─────────────────────────────────────────

DO $$
DECLARE
  touched integer;
  nora_row timestamptz;
BEGIN
  PERFORM pg_temp.assume_user('56200000-0000-4000-8000-000000000002');

  UPDATE public.notification_log
     SET opened_at = NOW(), status = 'opened'
   WHERE id = '56200000-0000-4000-8000-0000000000a3';
  GET DIAGNOSTICS touched = ROW_COUNT;
  ASSERT touched = 0,
    'FAIL 2: a stranger must reach none of another user''s rows, got ' || touched;

  PERFORM pg_temp.reset_role();

  SELECT opened_at INTO nora_row
    FROM public.notification_log
   WHERE id = '56200000-0000-4000-8000-0000000000a3';
  ASSERT nora_row IS NULL, 'FAIL 2b: a stranger''s UPDATE changed a row it must not see';

  RAISE NOTICE '00562 stranger assertions passed.';
END $$;

-- ─── 4. the column ceiling ─────────────────────────────────────────────────

DO $$
DECLARE
  granted text[];
BEGIN
  SELECT array_agg(column_name::text ORDER BY column_name) INTO granted
    FROM information_schema.column_privileges
   WHERE table_schema = 'public'
     AND table_name = 'notification_log'
     AND grantee = 'authenticated'
     AND privilege_type = 'UPDATE';

  ASSERT granted = ARRAY['clicked_at', 'opened_at', 'status'],
    'FAIL 4: authenticated must hold UPDATE on exactly the three engagement columns, got '
      || COALESCE(array_to_string(granted, ','), '<none>');
END $$;

DO $$
DECLARE
  refused boolean := false;
BEGIN
  PERFORM pg_temp.assume_user('56200000-0000-4000-8000-000000000001');
  BEGIN
    UPDATE public.notification_log
       SET metadata = '{"deep_link":"/decisions/somebody-elses"}'::jsonb
     WHERE id = '56200000-0000-4000-8000-0000000000a1';
  EXCEPTION WHEN insufficient_privilege THEN
    refused := true;
  END;
  PERFORM pg_temp.reset_role();

  ASSERT refused,
    'FAIL 4b: metadata carries the deep link and must not be client-writable';

  RAISE NOTICE '00562 column-ceiling assertions passed.';
END $$;

-- ─── 5. the WITH CHECK keeps status inside the engagement values ───────────

DO $$
DECLARE
  refused boolean := false;
BEGIN
  PERFORM pg_temp.assume_user('56200000-0000-4000-8000-000000000001');
  BEGIN
    UPDATE public.notification_log
       SET status = 'bounced'
     WHERE id = '56200000-0000-4000-8000-0000000000a1';
  EXCEPTION WHEN insufficient_privilege OR check_violation THEN
    refused := true;
  END;
  PERFORM pg_temp.reset_role();

  ASSERT refused,
    'FAIL 5: a client must not be able to claim a delivery outcome on their own row';

  RAISE NOTICE '00562 status-ceiling assertions passed.';
END $$;

-- ROLLBACK so the test is idempotent.
ROLLBACK;
