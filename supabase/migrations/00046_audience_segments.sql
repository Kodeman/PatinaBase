-- ═══════════════════════════════════════════════════════════════════════════
-- Migration: Audience Segments
-- Description: Saved audience segments for campaign targeting.
--              Rules are compiled to Supabase queries at send time.
-- ═══════════════════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════════════════
-- AUDIENCE SEGMENTS TABLE
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE audience_segments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  -- rules: JSONB describing segment conditions
  -- Format: { logic: 'and'|'or', conditions: [{ field, operator, value }] }
  rules JSONB NOT NULL DEFAULT '{"logic": "and", "conditions": []}',
  -- Cached recipient count (updated on save/estimate)
  estimated_size INTEGER DEFAULT 0,
  is_preset BOOLEAN NOT NULL DEFAULT false,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ═══════════════════════════════════════════════════════════════════════════
-- INDEXES
-- ═══════════════════════════════════════════════════════════════════════════

CREATE INDEX idx_audience_segments_preset ON audience_segments(is_preset);
CREATE INDEX idx_audience_segments_created_by ON audience_segments(created_by);

-- ═══════════════════════════════════════════════════════════════════════════
-- UPDATED_AT TRIGGER
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TRIGGER set_audience_segments_updated_at
  BEFORE UPDATE ON audience_segments
  FOR EACH ROW
  EXECUTE FUNCTION extensions.moddatetime(updated_at);

-- ═══════════════════════════════════════════════════════════════════════════
-- ROW LEVEL SECURITY
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE audience_segments ENABLE ROW LEVEL SECURITY;

-- Service role full access
CREATE POLICY "Service role full access on audience_segments" ON audience_segments
  FOR ALL USING (auth.uid() IS NULL);

-- Admins can manage segments
CREATE POLICY "Admins can manage audience_segments" ON audience_segments
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM user_roles ur
      JOIN roles r ON ur.role_id = r.id
      WHERE ur.user_id = auth.uid()
      AND r.domain = 'admin'
    )
  );

-- ═══════════════════════════════════════════════════════════════════════════
-- SEED: 6 preset segments
-- ═══════════════════════════════════════════════════════════════════════════

INSERT INTO audience_segments (name, description, rules, is_preset) VALUES
  (
    'All Subscribers',
    'All users who have not unsubscribed from marketing emails',
    '{"logic": "and", "conditions": [{"field": "channels_email", "operator": "eq", "value": true}]}',
    true
  ),
  (
    'Designers Only',
    'Users with a designer role',
    '{"logic": "and", "conditions": [{"field": "role", "operator": "eq", "value": "designer"}]}',
    true
  ),
  (
    'Consumers Only',
    'Users with a consumer role',
    '{"logic": "and", "conditions": [{"field": "role", "operator": "eq", "value": "consumer"}]}',
    true
  ),
  (
    'Founding Circle',
    'Founding Circle members',
    '{"logic": "and", "conditions": [{"field": "founding_circle", "operator": "eq", "value": true}]}',
    true
  ),
  (
    'Highly Engaged',
    'Users with high engagement score (100+)',
    '{"logic": "and", "conditions": [{"field": "engagement_score", "operator": "gte", "value": 100}]}',
    true
  ),
  (
    'Inactive 30 Days',
    'Users with no activity in 30 days',
    '{"logic": "and", "conditions": [{"field": "last_active_at", "operator": "older_than", "value": 30}]}',
    true
  );
