-- ═══════════════════════════════════════════════════════════════════════════
-- 00554 — Onboarding-lane review fixes: app_setting EXECUTE for service_role,
--         'sent' folded into the notification census, test-login retention
--
-- Four independent corrections found reviewing the onboarding lane against
-- 00551–00553. Each is stated with the defect it closes.
--
-- 1. public.app_setting(text) — 00258 revoked EXECUTE from PUBLIC/anon/
--    authenticated on the reasoning that every caller was a SECURITY DEFINER
--    function owned by postgres (which keeps EXECUTE regardless). The
--    test-account-login edge function (00551 lane) is the FIRST caller that is
--    not one of those: it reaches app_setting over PostgREST as service_role,
--    so it hits the 00258 revoke and 42501s — and because that function fails
--    closed on a config read error, the allowlisted test login would 403
--    forever. Granting service_role only; anon/authenticated stay revoked (the
--    function can return the service-role key).
--
-- 2. idx_notification_log_frequency_cap — 00392 built the partial index over
--    ('sending','unconfirmed','delivered','opened','clicked'). 00552 added
--    'sent', and _shared/send-email.ts now writes 'sent' on Resend's 2xx
--    accept, so the frequency-cap queries include it. A predicate that omits
--    'sent' no longer implies the query's predicate, so the planner drops the
--    index and the cap check seq-scans notification_log. Recreated with 'sent'
--    added; otherwise identical to 00392.
--
-- 3. get_ab_variant_stats(uuid) — its `sent` column counts attempted volume
--    over a status list that predates 00552. Rows now landing at 'sent' (the
--    normal accept state) and 'complained' fall out of the denominator, so
--    open/click rates inflate and A/B winners are picked off a partial census.
--    Body copied verbatim from 00392 (the current head — no later redefinition
--    exists) with only those two values added.
--    Lineage: 00080 → 00392 → this file.
--
-- 4. public.test_login_attempts (00551) is an append-only pre-auth log with no
--    retention. Only the trailing 15-minute window is ever read, so anything
--    older is pure accumulation of caller IPs. Hourly sweep drops rows older
--    than 24 hours (a day of forensic headroom past the rate-limit window).
--
-- No enum values are added here — 00552 already committed 'sent'/'complained',
-- so this migration may reference them.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ── 1. app_setting EXECUTE for service_role ────────────────────────────────
-- First non-SECURITY-DEFINER caller: the test-account-login edge function
-- invokes rpc('app_setting') with the service-role key over PostgREST, which
-- executes as the service_role GRANTee rather than as the function's owner.
GRANT EXECUTE ON FUNCTION public.app_setting(text) TO service_role;

-- Restated from 00258 so the reconstructed local ACL keeps the lockdown that
-- this file's GRANT sits beside (app_setting can return the service-role key).
REVOKE EXECUTE ON FUNCTION public.app_setting(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.app_setting(text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.app_setting(text) FROM authenticated;

-- ── 2. Frequency-cap partial index gains 'sent' ────────────────────────────
DROP INDEX IF EXISTS public.idx_notification_log_frequency_cap;
CREATE INDEX idx_notification_log_frequency_cap
  ON public.notification_log(user_id, type, status, created_at)
  WHERE status IN (
    'sending',
    'sent',
    'unconfirmed',
    'delivered',
    'opened',
    'clicked'
  );

-- ── 3. get_ab_variant_stats census includes 'sent' and 'complained' ────────
CREATE OR REPLACE FUNCTION public.get_ab_variant_stats(p_campaign_id uuid)
RETURNS TABLE (
  variant text,
  sent bigint,
  delivered bigint,
  opened bigint,
  clicked bigint,
  bounced bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role'
     AND (
       auth.uid() IS NULL
       OR NOT EXISTS (
         SELECT 1
         FROM public.campaigns AS campaign
         WHERE campaign.id = p_campaign_id
           AND (
             campaign.created_by = auth.uid()
             OR EXISTS (
               SELECT 1
               FROM public.user_roles AS user_role
               JOIN public.roles AS role
                 ON role.id = user_role.role_id
               WHERE user_role.user_id = auth.uid()
                 AND role.domain = 'admin'
             )
           )
       )
     )
  THEN
    RAISE EXCEPTION 'campaign % not found or access denied', p_campaign_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN QUERY
  SELECT
    COALESCE(log.metadata->>'ab_variant', 'a') AS variant,
    COUNT(*) FILTER (
      WHERE log.status IN (
        'queued',
        'sending',
        'sent',
        'unconfirmed',
        'delivered',
        'opened',
        'clicked',
        'bounced',
        'complained',
        'failed'
      )
    )::bigint AS sent,
    COUNT(*) FILTER (
      WHERE log.status IN ('delivered', 'opened', 'clicked')
    )::bigint AS delivered,
    COUNT(*) FILTER (WHERE log.opened_at IS NOT NULL)::bigint AS opened,
    COUNT(*) FILTER (WHERE log.clicked_at IS NOT NULL)::bigint AS clicked,
    COUNT(*) FILTER (WHERE log.status = 'bounced')::bigint AS bounced
  FROM public.notification_log AS log
  WHERE log.metadata->>'campaign_id' = p_campaign_id::text
  GROUP BY COALESCE(log.metadata->>'ab_variant', 'a')
  ORDER BY 1;
END;
$$;

REVOKE ALL ON FUNCTION public.get_ab_variant_stats(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_ab_variant_stats(uuid)
  TO authenticated, service_role;

COMMENT ON FUNCTION public.get_ab_variant_stats(uuid) IS
  'Creator/admin/service-only per-variant campaign engagement. sent is attempted '
  'volume, including terminal unconfirmed/complained outcomes and the post-00552 '
  'accept state; delivered is confirmed only.';

COMMIT;

-- ── 4. Retention sweep for the pre-auth test-login attempt log ─────────────
-- Guarded (re)schedule idiom of 00553: unschedule-if-exists, then schedule, so
-- a replay is a no-op. The relation is schema-qualified because pg_cron runs
-- the body under the scheduling role's search_path, not this migration's.
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'purge-test-login-attempts-hourly') THEN
    PERFORM cron.unschedule('purge-test-login-attempts-hourly');
  END IF;
END $$;

SELECT cron.schedule(
  'purge-test-login-attempts-hourly',
  '25 * * * *',
  $$DELETE FROM public.test_login_attempts
     WHERE attempted_at < now() - interval '24 hours';$$
);

-- Best-effort registry comment (pg_cron is owned by supabase_admin on
-- self-hosted, so a postgres-run migration may lack privilege; cron.job is
-- the authoritative registry regardless — same guard as 00181/00491/00553).
DO $$ BEGIN
  EXECUTE $C$COMMENT ON EXTENSION pg_cron IS 'pg_cron schedules: see cron.job for the authoritative registry. Test-account login (00554): purge-test-login-attempts-hourly at :25 -> plain SQL deleting public.test_login_attempts rows older than 24 hours (only the trailing 15-minute window is ever read). Studio onboarding (00553): expire-stale-workspace-invites-daily at 07:40 UTC -> plain SQL flipping organization_members rows stuck at invited with invitation_expires_at older than 30 days to removed. Rendered Room v2 (00491): dispatch-scan-modal-sweep every 5 minutes. Rendered Room v2 (00501): expire-stale-upload-intents-daily at 07:15 UTC -> public.expire_stale_upload_intents() directly (no edge function), transitioning stale pending upload-interface media_objects rows to expired. Room View, Agent OS, BOH, Field Site Request, Mood Board, invoice/decision reminders, and earlier schedules are unchanged (see prior registry text / cron.job).'$C$;
EXCEPTION WHEN insufficient_privilege THEN NULL;
END $$;
