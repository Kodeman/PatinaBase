-- ═══════════════════════════════════════════════════════════════════════════
-- Migration: Admin platform-wide decision analytics
-- Description: Counterpart to get_decision_bottleneck_phases (mig 00065) that
--              aggregates across ALL designers, for the admin /analytics page.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.get_decision_bottleneck_phases_admin()
RETURNS TABLE (
  linked_phase TEXT,
  total_count BIGINT,
  overdue_count BIGINT,
  pending_count BIGINT,
  responded_count BIGINT,
  avg_response_hours NUMERIC
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    COALESCE(cd.linked_phase, 'Unlinked') AS linked_phase,
    COUNT(*)::BIGINT AS total_count,
    COUNT(*) FILTER (
      WHERE cd.status = 'pending'
      AND cd.due_date IS NOT NULL
      AND cd.due_date < NOW()
    )::BIGINT AS overdue_count,
    COUNT(*) FILTER (WHERE cd.status = 'pending')::BIGINT AS pending_count,
    COUNT(*) FILTER (WHERE cd.status = 'responded')::BIGINT AS responded_count,
    COALESCE(
      AVG(EXTRACT(EPOCH FROM (cd.responded_at - cd.sent_at)) / 3600)
      FILTER (WHERE cd.status = 'responded' AND cd.sent_at IS NOT NULL AND cd.responded_at IS NOT NULL),
      0
    )::NUMERIC AS avg_response_hours
  FROM client_decisions cd
  WHERE cd.status != 'draft'
  GROUP BY COALESCE(cd.linked_phase, 'Unlinked')
  ORDER BY overdue_count DESC, total_count DESC;
$$;

REVOKE EXECUTE ON FUNCTION public.get_decision_bottleneck_phases_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_decision_bottleneck_phases_admin() TO service_role;
