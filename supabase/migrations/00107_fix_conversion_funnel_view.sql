-- ═══════════════════════════════════════════════════════════════════════════
-- Migration: Fix conversion_funnel view (FULL OUTER JOIN was unsupported)
-- ═══════════════════════════════════════════════════════════════════════════
-- The original definition in 00038 used:
--   FULL OUTER JOIN waitlist w ON w.posthog_distinct_id IS NOT NULL
-- Postgres rejects this with:
--   "FULL JOIN is only supported with merge-joinable or hash-joinable join conditions"
-- The intent was to combine visitor IDs from engagement_events (page_view) and
-- waitlist into the funnel's first step. Replace the broken FULL JOIN with two
-- selects combined via UNION ALL.

CREATE OR REPLACE VIEW conversion_funnel AS
WITH funnel_steps AS (
  -- Step 1a: Visitors observed via page_view events
  SELECT
    COALESCE(p.posthog_distinct_id, p.id::TEXT) AS visitor_id,
    'visitor' AS step,
    1 AS step_order
  FROM engagement_events ee
  LEFT JOIN profiles p ON ee.user_id = p.id
  WHERE ee.event_name = 'page_view'

  UNION ALL

  -- Step 1b: Visitors observed via waitlist entries
  SELECT
    COALESCE(w.posthog_distinct_id, w.email) AS visitor_id,
    'visitor' AS step,
    1 AS step_order
  FROM waitlist w

  UNION ALL

  -- Step 2: Waitlist signup
  SELECT
    COALESCE(w.posthog_distinct_id, w.email) AS visitor_id,
    'waitlist' AS step,
    2 AS step_order
  FROM waitlist w

  UNION ALL

  -- Step 3: Account created
  SELECT
    COALESCE(p.posthog_distinct_id, p.id::TEXT) AS visitor_id,
    'account_created' AS step,
    3 AS step_order
  FROM profiles p

  UNION ALL

  -- Step 4: First meaningful action
  SELECT
    COALESCE(p.posthog_distinct_id, p.id::TEXT) AS visitor_id,
    'first_action' AS step,
    4 AS step_order
  FROM profiles p
  JOIN engagement_events ee ON ee.user_id = p.id
  WHERE ee.event_name IN ('project_create', 'product_saved', 'room_scan_completed')
  GROUP BY COALESCE(p.posthog_distinct_id, p.id::TEXT)

  UNION ALL

  -- Step 5: Active user (3+ different days)
  SELECT
    COALESCE(p.posthog_distinct_id, p.id::TEXT) AS visitor_id,
    'active_user' AS step,
    5 AS step_order
  FROM profiles p
  JOIN engagement_events ee ON ee.user_id = p.id
  GROUP BY COALESCE(p.posthog_distinct_id, p.id::TEXT)
  HAVING COUNT(DISTINCT DATE(ee.created_at)) >= 3
)
SELECT
  step,
  step_order,
  COUNT(DISTINCT visitor_id) AS users_at_step,
  LAG(COUNT(DISTINCT visitor_id)) OVER (ORDER BY step_order) AS users_at_previous_step,
  ROUND(
    COUNT(DISTINCT visitor_id)::DECIMAL /
    NULLIF(LAG(COUNT(DISTINCT visitor_id)) OVER (ORDER BY step_order), 0) * 100,
    2
  ) AS conversion_rate_percent
FROM funnel_steps
GROUP BY step, step_order
ORDER BY step_order;
