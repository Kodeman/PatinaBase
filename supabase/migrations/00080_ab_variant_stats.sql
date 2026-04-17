-- ═══════════════════════════════════════════════════════════════════════════
-- Migration: A/B variant stats RPC
-- Description: Returns per-variant sent/delivered/opened/clicked/bounced
--              counts for a campaign by joining notification_log on the
--              `ab_variant` key in its metadata JSONB.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION get_ab_variant_stats(p_campaign_id UUID)
RETURNS TABLE (
  variant TEXT,
  sent BIGINT,
  delivered BIGINT,
  opened BIGINT,
  clicked BIGINT,
  bounced BIGINT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    COALESCE(metadata->>'ab_variant', 'a') AS variant,
    COUNT(*) FILTER (WHERE status IN ('delivered','opened','clicked','sending','queued','bounced','failed'))::BIGINT AS sent,
    COUNT(*) FILTER (WHERE status IN ('delivered','opened','clicked'))::BIGINT AS delivered,
    COUNT(*) FILTER (WHERE opened_at IS NOT NULL)::BIGINT AS opened,
    COUNT(*) FILTER (WHERE clicked_at IS NOT NULL)::BIGINT AS clicked,
    COUNT(*) FILTER (WHERE status = 'bounced')::BIGINT AS bounced
  FROM notification_log
  WHERE metadata->>'campaign_id' = p_campaign_id::TEXT
  GROUP BY COALESCE(metadata->>'ab_variant', 'a')
  ORDER BY variant;
$$;

-- Admins can read per-campaign variant stats
GRANT EXECUTE ON FUNCTION get_ab_variant_stats(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION get_ab_variant_stats(UUID) TO service_role;

COMMENT ON FUNCTION get_ab_variant_stats IS
  'Per-variant engagement stats for a campaign. Grouped by metadata->>ab_variant; defaults to "a" when not set.';
