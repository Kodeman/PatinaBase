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
    FROM cron.job
    WHERE jobname = 'qr-auth-session-cleanup'
      AND command LIKE '%DELETE FROM public.qr_auth_sessions%'
      AND command LIKE '%interval ''5 minutes''%'
  ) THEN
    RAISE EXCEPTION 'guarded QR cleanup cron is missing or not schema-qualified';
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

ROLLBACK;
