-- ═══════════════════════════════════════════════════════════════════════════
-- Migration: Funnel Analysis Views
-- Description: Conversion funnel, designer funnel, consumer funnel views
-- ═══════════════════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════════════════
-- MAIN CONVERSION FUNNEL
-- Tracks: visitor → waitlist → account → first_action → active_user
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE VIEW conversion_funnel AS
WITH funnel_steps AS (
  -- Step 1: Website visitors (anyone with a page_view event or waitlist entry)
  SELECT
    COALESCE(w.posthog_distinct_id, p.posthog_distinct_id, p.id::TEXT) AS visitor_id,
    'visitor' AS step,
    1 AS step_order
  FROM engagement_events ee
  FULL OUTER JOIN waitlist w ON w.posthog_distinct_id IS NOT NULL
  LEFT JOIN profiles p ON ee.user_id = p.id
  WHERE ee.event_name = 'page_view' OR w.id IS NOT NULL
  GROUP BY COALESCE(w.posthog_distinct_id, p.posthog_distinct_id, p.id::TEXT)

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

-- ═══════════════════════════════════════════════════════════════════════════
-- DESIGNER FUNNEL
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE VIEW designer_funnel AS
WITH designer_journey AS (
  SELECT
    p.id AS user_id,
    p.email,
    p.created_at AS signup_date,
    MIN(CASE WHEN ee.event_name = 'project_create' THEN ee.created_at END) AS first_project,
    MIN(CASE WHEN ee.event_name = 'client_interaction' THEN ee.created_at END) AS first_client_interaction,
    COUNT(DISTINCT CASE WHEN ee.event_name = 'project_create' THEN DATE(ee.created_at) END) AS active_project_days,
    MAX(ee.created_at) AS last_activity
  FROM profiles p
  LEFT JOIN engagement_events ee ON ee.user_id = p.id
  WHERE p.role = 'designer'
  GROUP BY p.id, p.email, p.created_at
)
SELECT
  'Designer Signups' AS step,
  COUNT(*) AS count,
  1 AS step_order
FROM designer_journey
UNION ALL
SELECT
  'Created First Project' AS step,
  COUNT(*) AS count,
  2 AS step_order
FROM designer_journey
WHERE first_project IS NOT NULL
UNION ALL
SELECT
  'Client Interaction' AS step,
  COUNT(*) AS count,
  3 AS step_order
FROM designer_journey
WHERE first_client_interaction IS NOT NULL
UNION ALL
SELECT
  'Active Users (3+ project days)' AS step,
  COUNT(*) AS count,
  4 AS step_order
FROM designer_journey
WHERE active_project_days >= 3
ORDER BY step_order;

-- ═══════════════════════════════════════════════════════════════════════════
-- CONSUMER FUNNEL
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE VIEW consumer_funnel AS
WITH consumer_journey AS (
  SELECT
    p.id AS user_id,
    p.email,
    p.created_at AS signup_date,
    MIN(CASE WHEN ee.event_name = 'product_saved' THEN ee.created_at END) AS first_capture,
    MIN(CASE WHEN ee.event_name = 'room_scan_completed' THEN ee.created_at END) AS first_room_scan,
    MIN(CASE WHEN ee.event_name = 'ar_view' THEN ee.created_at END) AS first_ar_view,
    COUNT(DISTINCT CASE WHEN ee.event_name IN ('product_saved', 'room_scan_completed', 'ar_view')
      THEN DATE(ee.created_at) END) AS active_days,
    MAX(ee.created_at) AS last_activity
  FROM profiles p
  LEFT JOIN engagement_events ee ON ee.user_id = p.id
  WHERE p.role != 'designer'
  GROUP BY p.id, p.email, p.created_at
)
SELECT
  'Consumer Signups' AS step,
  COUNT(*) AS count,
  1 AS step_order
FROM consumer_journey
UNION ALL
SELECT
  'First Product Interaction' AS step,
  COUNT(*) AS count,
  2 AS step_order
FROM consumer_journey
WHERE first_capture IS NOT NULL OR first_room_scan IS NOT NULL
UNION ALL
SELECT
  'AR Experience' AS step,
  COUNT(*) AS count,
  3 AS step_order
FROM consumer_journey
WHERE first_ar_view IS NOT NULL
UNION ALL
SELECT
  'Regular Users (5+ active days)' AS step,
  COUNT(*) AS count,
  4 AS step_order
FROM consumer_journey
WHERE active_days >= 5
ORDER BY step_order;
