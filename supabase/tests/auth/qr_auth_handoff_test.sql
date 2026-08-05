\set ON_ERROR_STOP on

BEGIN;

DO $test$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'qr_auth_sessions'
      AND column_name = 'poll_token_hash'
  ) THEN
    RAISE EXCEPTION 'poll_token_hash column is missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND tablename = 'qr_auth_sessions'
      AND indexname = 'idx_qr_auth_sessions_poll_token_hash'
  ) THEN
    RAISE EXCEPTION 'poll token unique index is missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND tablename = 'qr_auth_sessions'
      AND indexname = 'idx_qr_auth_sessions_ip_created_at'
  ) THEN
    RAISE EXCEPTION 'QR rate-limit index is missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'qr_auth_rate_limits'
  ) THEN
    RAISE EXCEPTION 'atomic QR rate-limit table is missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgname = 'enforce_qr_auth_session_rate_limit'
      AND NOT tgisinternal
  ) THEN
    RAISE EXCEPTION 'atomic QR rate-limit trigger is missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM cron.job
    WHERE jobname = 'qr-auth-session-cleanup'
      AND command LIKE '%DELETE FROM public.qr_auth_sessions%'
      AND command LIKE '%interval ''5 minutes''%'
  ) THEN
    RAISE EXCEPTION 'guarded QR cleanup cron is missing or not schema-qualified';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM cron.job
    WHERE jobname = 'qr-auth-rate-limit-cleanup'
      AND command LIKE '%DELETE FROM public.qr_auth_rate_limits%'
  ) THEN
    RAISE EXCEPTION 'QR rate-limit cleanup cron is missing';
  END IF;
END
$test$;

INSERT INTO public.qr_auth_sessions
  (session_token, poll_token_hash, status, expires_at)
VALUES
  ('approval-nonce-test', 'poll-hash-test', 'pending', now() - interval '11 minutes'),
  ('approval-nonce-live', 'poll-hash-live', 'pending', now() + interval '5 minutes');

DO $test$
BEGIN
  BEGIN
    INSERT INTO public.qr_auth_sessions
      (session_token, poll_token_hash, status, expires_at)
    VALUES
      ('approval-nonce-duplicate', 'poll-hash-test', 'pending', now() + interval '5 minutes');
    RAISE EXCEPTION 'duplicate poll token hash was accepted';
  EXCEPTION
    WHEN unique_violation THEN NULL;
  END;
END
$test$;

DELETE FROM public.qr_auth_sessions
WHERE expires_at < now() - interval '5 minutes';

DO $test$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.qr_auth_sessions
    WHERE session_token = 'approval-nonce-test'
  ) THEN
    RAISE EXCEPTION 'expired QR row was not eligible for cleanup';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.qr_auth_sessions
    WHERE session_token = 'approval-nonce-live'
  ) THEN
    RAISE EXCEPTION 'live QR row was deleted by cleanup predicate';
  END IF;
END
$test$;

INSERT INTO public.qr_auth_sessions
  (session_token, poll_token_hash, status, ip_address, expires_at)
SELECT
  format('rate-approval-%s', attempt),
  format('rate-poll-%s', attempt),
  'pending',
  '203.0.113.44'::inet,
  now() + interval '5 minutes'
FROM generate_series(1, 10) AS attempt;

DO $test$
BEGIN
  BEGIN
    INSERT INTO public.qr_auth_sessions
      (session_token, poll_token_hash, status, ip_address, expires_at)
    VALUES
      ('rate-approval-11', 'rate-poll-11', 'pending',
       '203.0.113.44'::inet, now() + interval '5 minutes');
    RAISE EXCEPTION 'eleventh QR attempt was accepted';
  EXCEPTION
    WHEN SQLSTATE 'P0001' THEN
      IF SQLERRM <> 'qr_auth_rate_limited' THEN
        RAISE;
      END IF;
  END;

  IF (SELECT count(*) FROM public.qr_auth_sessions
      WHERE ip_address = '203.0.113.44'::inet) <> 10 THEN
    RAISE EXCEPTION 'QR limiter rejected an allowed attempt or kept attempt 11';
  END IF;

  IF (SELECT attempt_count FROM public.qr_auth_rate_limits
      WHERE ip_address = '203.0.113.44'::inet) <> 10 THEN
    RAISE EXCEPTION 'QR rate bucket did not stop at ten attempts';
  END IF;
END
$test$;

UPDATE public.qr_auth_rate_limits
SET window_started_at = now() - interval '2 minutes'
WHERE ip_address = '203.0.113.44'::inet;

INSERT INTO public.qr_auth_sessions
  (session_token, poll_token_hash, status, ip_address, expires_at)
VALUES
  ('rate-approval-reset', 'rate-poll-reset', 'pending',
   '203.0.113.44'::inet, now() + interval '5 minutes');

DO $test$
BEGIN
  IF (SELECT attempt_count FROM public.qr_auth_rate_limits
      WHERE ip_address = '203.0.113.44'::inet) <> 1 THEN
    RAISE EXCEPTION 'QR rate bucket did not reset after one minute';
  END IF;
END
$test$;

ROLLBACK;
