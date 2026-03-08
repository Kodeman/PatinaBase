-- ═══════════════════════════════════════════════════════════════════════════
-- Migration: Engagement Events & Profile Extensions
-- Description: PostHog event sync table, profile analytics fields,
--              engagement scoring function, and scores view
-- ═══════════════════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════════════════
-- ENGAGEMENT EVENTS TABLE
-- Stores PostHog events synced for server-side scoring
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS engagement_events (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  posthog_event_id TEXT UNIQUE,
  event_name TEXT NOT NULL,
  event_properties JSONB,
  platform TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT valid_platform CHECK (
    platform IN ('website', 'extension', 'portal', 'ios', 'planning')
  )
);

-- ═══════════════════════════════════════════════════════════════════════════
-- INDEXES
-- ═══════════════════════════════════════════════════════════════════════════

CREATE INDEX IF NOT EXISTS idx_engagement_events_user_id ON engagement_events(user_id);
CREATE INDEX IF NOT EXISTS idx_engagement_events_created_at ON engagement_events(created_at);
CREATE INDEX IF NOT EXISTS idx_engagement_events_event_name ON engagement_events(event_name);
CREATE INDEX IF NOT EXISTS idx_engagement_events_platform ON engagement_events(platform);
CREATE INDEX IF NOT EXISTS idx_engagement_events_composite
  ON engagement_events(user_id, event_name, created_at);

-- ═══════════════════════════════════════════════════════════════════════════
-- ROW LEVEL SECURITY
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE engagement_events ENABLE ROW LEVEL SECURITY;

-- Users can read their own events
CREATE POLICY "Users can read own engagement events" ON engagement_events
  FOR SELECT USING (auth.uid() = user_id);

-- Admins can read all
CREATE POLICY "Admins can read all engagement events" ON engagement_events
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM user_roles ur
      JOIN roles r ON ur.role_id = r.id
      WHERE ur.user_id = auth.uid()
      AND r.domain = 'admin'
    )
  );

-- Users can insert their own events
CREATE POLICY "Users can insert own engagement events" ON engagement_events
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Service role can insert (for PostHog webhook sync)
CREATE POLICY "Service role can insert engagement events" ON engagement_events
  FOR INSERT WITH CHECK (auth.uid() IS NULL);

-- ═══════════════════════════════════════════════════════════════════════════
-- EXTEND PROFILES TABLE
-- Add cross-platform identity and engagement fields
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS posthog_distinct_id TEXT UNIQUE;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS extension_user_id TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS ios_device_id TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS original_source TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS original_utm JSONB;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS total_engagement_score INTEGER DEFAULT 0;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS last_active_at TIMESTAMPTZ;

-- ═══════════════════════════════════════════════════════════════════════════
-- ENGAGEMENT SCORING FUNCTION
-- Single efficient query with CASE weights, designer 1.2x multiplier
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION calculate_engagement_score(p_user_id UUID)
RETURNS INTEGER AS $$
DECLARE
  raw_score INTEGER := 0;
  user_role TEXT;
BEGIN
  -- Get user role for multiplier
  SELECT role INTO user_role FROM profiles WHERE id = p_user_id;
  IF user_role IS NULL THEN
    RETURN 0;
  END IF;

  -- Calculate raw score from all events in 30-day window
  SELECT COALESCE(SUM(
    CASE event_name
      -- Website events
      WHEN 'page_view' THEN 1
      WHEN 'cta_click' THEN 3
      WHEN 'waitlist_signup' THEN 10
      WHEN 'content_engagement' THEN 2
      -- Extension events
      WHEN 'product_saved' THEN 5
      WHEN 'vendor_saved' THEN 5
      WHEN 'extension_opened' THEN 2
      WHEN 'extraction_completed' THEN 3
      -- Portal events
      WHEN 'project_create' THEN 15
      WHEN 'product_create' THEN 3
      WHEN 'product_view' THEN 1
      WHEN 'client_interaction' THEN 8
      WHEN 'client_create' THEN 5
      WHEN 'vendor_search' THEN 1
      -- iOS events
      WHEN 'room_scan_completed' THEN 10
      WHEN 'ar_view' THEN 5
      WHEN 'room_scan_started' THEN 2
      -- Planning events
      WHEN 'feature_vote' THEN 2
      WHEN 'feedback_submit' THEN 5
      ELSE 0
    END
  ), 0) INTO raw_score
  FROM engagement_events
  WHERE user_id = p_user_id
  AND created_at >= NOW() - INTERVAL '30 days';

  -- Designer 1.2x multiplier
  IF user_role = 'designer' THEN
    raw_score := (raw_score * 1.2)::INTEGER;
  END IF;

  RETURN raw_score;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- ═══════════════════════════════════════════════════════════════════════════
-- USER ENGAGEMENT SCORES VIEW
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE VIEW user_engagement_scores AS
SELECT
  p.id,
  p.email,
  p.role,
  calculate_engagement_score(p.id) AS current_score,
  p.last_active_at,
  CASE
    WHEN calculate_engagement_score(p.id) >= 100 THEN 'high'
    WHEN calculate_engagement_score(p.id) >= 50 THEN 'medium'
    WHEN calculate_engagement_score(p.id) >= 20 THEN 'low'
    ELSE 'minimal'
  END AS engagement_tier
FROM profiles p;
