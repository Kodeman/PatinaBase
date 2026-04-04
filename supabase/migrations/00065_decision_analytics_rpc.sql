-- ═══════════════════════════════════════════════════════════════════════════
-- Migration: Decision Analytics RPC
-- Description: SQL functions for computing decision analytics efficiently.
-- ═══════════════════════════════════════════════════════════════════════════

-- Analytics by decision type: average response time per type
CREATE OR REPLACE FUNCTION get_decision_analytics_by_type(p_designer_id UUID)
RETURNS TABLE (
  decision_type TEXT,
  total_count BIGINT,
  responded_count BIGINT,
  avg_response_hours NUMERIC,
  on_time_count BIGINT
) LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT
    cd.decision_type,
    COUNT(*)::BIGINT AS total_count,
    COUNT(*) FILTER (WHERE cd.status = 'responded')::BIGINT AS responded_count,
    COALESCE(
      AVG(EXTRACT(EPOCH FROM (cd.responded_at - cd.sent_at)) / 3600)
      FILTER (WHERE cd.status = 'responded' AND cd.sent_at IS NOT NULL AND cd.responded_at IS NOT NULL),
      0
    )::NUMERIC AS avg_response_hours,
    COUNT(*) FILTER (
      WHERE cd.status = 'responded'
      AND cd.due_date IS NOT NULL
      AND cd.responded_at <= cd.due_date
    )::BIGINT AS on_time_count
  FROM client_decisions cd
  WHERE cd.designer_id = p_designer_id
    AND cd.status != 'draft'
  GROUP BY cd.decision_type
  ORDER BY avg_response_hours DESC;
$$;

-- Analytics by client: average response time per client
CREATE OR REPLACE FUNCTION get_decision_analytics_by_client(p_designer_id UUID)
RETURNS TABLE (
  designer_client_id UUID,
  client_name TEXT,
  total_count BIGINT,
  responded_count BIGINT,
  avg_response_hours NUMERIC,
  on_time_rate NUMERIC
) LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT
    cd.designer_client_id,
    COALESCE(p.full_name, dc.client_name, dc.client_email, 'Unknown') AS client_name,
    COUNT(*)::BIGINT AS total_count,
    COUNT(*) FILTER (WHERE cd.status = 'responded')::BIGINT AS responded_count,
    COALESCE(
      AVG(EXTRACT(EPOCH FROM (cd.responded_at - cd.sent_at)) / 3600)
      FILTER (WHERE cd.status = 'responded' AND cd.sent_at IS NOT NULL AND cd.responded_at IS NOT NULL),
      0
    )::NUMERIC AS avg_response_hours,
    CASE
      WHEN COUNT(*) FILTER (WHERE cd.status = 'responded' AND cd.due_date IS NOT NULL) = 0 THEN 100
      ELSE (
        COUNT(*) FILTER (WHERE cd.status = 'responded' AND cd.due_date IS NOT NULL AND cd.responded_at <= cd.due_date)::NUMERIC
        / COUNT(*) FILTER (WHERE cd.status = 'responded' AND cd.due_date IS NOT NULL)::NUMERIC
        * 100
      )
    END AS on_time_rate
  FROM client_decisions cd
  JOIN designer_clients dc ON dc.id = cd.designer_client_id
  LEFT JOIN profiles p ON p.id = dc.client_id
  WHERE cd.designer_id = p_designer_id
    AND cd.status != 'draft'
  GROUP BY cd.designer_client_id, p.full_name, dc.client_name, dc.client_email
  ORDER BY avg_response_hours DESC;
$$;

-- Bottleneck phases: which phases have the most overdue decisions
CREATE OR REPLACE FUNCTION get_decision_bottleneck_phases(p_designer_id UUID)
RETURNS TABLE (
  linked_phase TEXT,
  total_count BIGINT,
  overdue_count BIGINT,
  avg_response_hours NUMERIC
) LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT
    COALESCE(cd.linked_phase, 'Unlinked') AS linked_phase,
    COUNT(*)::BIGINT AS total_count,
    COUNT(*) FILTER (
      WHERE cd.status = 'pending'
      AND cd.due_date IS NOT NULL
      AND cd.due_date < NOW()
    )::BIGINT AS overdue_count,
    COALESCE(
      AVG(EXTRACT(EPOCH FROM (cd.responded_at - cd.sent_at)) / 3600)
      FILTER (WHERE cd.status = 'responded' AND cd.sent_at IS NOT NULL AND cd.responded_at IS NOT NULL),
      0
    )::NUMERIC AS avg_response_hours
  FROM client_decisions cd
  WHERE cd.designer_id = p_designer_id
    AND cd.status != 'draft'
  GROUP BY COALESCE(cd.linked_phase, 'Unlinked')
  ORDER BY overdue_count DESC, avg_response_hours DESC;
$$;
