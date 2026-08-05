-- ═══════════════════════════════════════════════════════════════════════════
-- 00426 — Harden the portal QR authentication handoff
--
-- Separates the QR-visible mobile approval nonce from the browser-only polling
-- bearer. The status endpoint temporarily accepts existing query-based clients,
-- but hashes their credential before the database lookup; new clients use an
-- Authorization bearer. A guarded five-minute cleanup removes expired handoffs
-- after a short grace period. The table remains service-role-only under its
-- existing RLS.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.qr_auth_sessions
  ADD COLUMN IF NOT EXISTS poll_token_hash text;

CREATE UNIQUE INDEX IF NOT EXISTS idx_qr_auth_sessions_poll_token_hash
  ON public.qr_auth_sessions (poll_token_hash)
  WHERE poll_token_hash IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_qr_auth_sessions_ip_created_at
  ON public.qr_auth_sessions (ip_address, created_at DESC)
  WHERE ip_address IS NOT NULL;

DO $migration$
DECLARE
  v_job_id bigint;
BEGIN
  FOR v_job_id IN
    SELECT jobid
    FROM cron.job
    WHERE jobname = 'qr-auth-session-cleanup'
  LOOP
    PERFORM cron.unschedule(v_job_id);
  END LOOP;

  PERFORM cron.schedule(
    'qr-auth-session-cleanup',
    '*/5 * * * *',
    $command$
      DELETE FROM public.qr_auth_sessions
      WHERE expires_at < now() - interval '5 minutes';
    $command$
  );
END
$migration$;
