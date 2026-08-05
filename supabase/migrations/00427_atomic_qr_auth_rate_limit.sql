-- ═══════════════════════════════════════════════════════════════════════════
-- 00427 — Make anonymous QR session creation rate limiting atomic
--
-- A count-then-insert check in the route can be bypassed by concurrent
-- requests. This per-IP bucket is updated under PostgreSQL's unique-row lock
-- from a BEFORE INSERT trigger, so only ten QR sessions can enter a rolling
-- one-minute bucket for a trusted address.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.qr_auth_rate_limits (
  ip_address inet PRIMARY KEY,
  window_started_at timestamptz NOT NULL,
  attempt_count integer NOT NULL CHECK (attempt_count > 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.qr_auth_rate_limits ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.qr_auth_rate_limits FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.qr_auth_rate_limits TO service_role;

CREATE OR REPLACE FUNCTION public.enforce_qr_auth_session_rate_limit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_now timestamptz := clock_timestamp();
  v_attempt_count integer;
BEGIN
  -- Local development may not have a trusted proxy address. Production route
  -- handling rejects a missing cf-connecting-ip before an insert reaches here.
  IF NEW.ip_address IS NULL THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.qr_auth_rate_limits AS limits
    (ip_address, window_started_at, attempt_count, updated_at)
  VALUES
    (NEW.ip_address, v_now, 1, v_now)
  ON CONFLICT (ip_address) DO UPDATE
  SET
    attempt_count = CASE
      WHEN limits.window_started_at <= v_now - interval '1 minute' THEN 1
      ELSE limits.attempt_count + 1
    END,
    window_started_at = CASE
      WHEN limits.window_started_at <= v_now - interval '1 minute' THEN v_now
      ELSE limits.window_started_at
    END,
    updated_at = v_now
  RETURNING attempt_count INTO v_attempt_count;

  IF v_attempt_count > 10 THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'qr_auth_rate_limited';
  END IF;

  RETURN NEW;
END
$function$;

REVOKE ALL ON FUNCTION public.enforce_qr_auth_session_rate_limit()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enforce_qr_auth_session_rate_limit()
  TO service_role;

DROP TRIGGER IF EXISTS enforce_qr_auth_session_rate_limit
  ON public.qr_auth_sessions;
CREATE TRIGGER enforce_qr_auth_session_rate_limit
BEFORE INSERT ON public.qr_auth_sessions
FOR EACH ROW
EXECUTE FUNCTION public.enforce_qr_auth_session_rate_limit();

DO $migration$
DECLARE
  v_job_id bigint;
BEGIN
  FOR v_job_id IN
    SELECT jobid
    FROM cron.job
    WHERE jobname = 'qr-auth-rate-limit-cleanup'
  LOOP
    PERFORM cron.unschedule(v_job_id);
  END LOOP;

  PERFORM cron.schedule(
    'qr-auth-rate-limit-cleanup',
    '17 * * * *',
    $command$
      DELETE FROM public.qr_auth_rate_limits
      WHERE updated_at < now() - interval '1 day';
    $command$
  );
END
$migration$;

COMMENT ON TABLE public.qr_auth_rate_limits IS
  'Service-only atomic per-IP buckets for anonymous portal QR session creation.';
COMMENT ON FUNCTION public.enforce_qr_auth_session_rate_limit() IS
  'Serializes QR session creation per trusted IP and rejects attempts above ten per minute.';
