-- ═══════════════════════════════════════════════════════════════════════════
-- 00392 — Include unconfirmed attempts in notification analytics
--
-- 00391 adds the enum value in its own committed migration. PostgreSQL must
-- commit an enum addition before functions and indexes can safely reference it.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

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
        'unconfirmed',
        'delivered',
        'opened',
        'clicked',
        'bounced',
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
  'volume, including terminal unconfirmed outcomes; delivered is confirmed only.';

-- Keep the frequency-cap index aligned with the attempted-status census used
-- by campaign and sequence enforcement. Suppressed rows are intentionally out.
DROP INDEX IF EXISTS public.idx_notification_log_frequency_cap;
CREATE INDEX idx_notification_log_frequency_cap
  ON public.notification_log(user_id, type, status, created_at)
  WHERE status IN (
    'sending',
    'unconfirmed',
    'delivered',
    'opened',
    'clicked'
  );

COMMIT;
