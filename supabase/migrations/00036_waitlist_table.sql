-- ═══════════════════════════════════════════════════════════════════════════
-- Migration: Waitlist Table
-- Description: Captures pre-signup interest with full UTM attribution tracking
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS waitlist (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  source TEXT NOT NULL, -- 'website', 'extension', 'referral', 'social', etc.
  role TEXT CHECK (role IN ('designer', 'consumer', 'unknown')) DEFAULT 'unknown',

  -- UTM Attribution
  utm_source TEXT,
  utm_medium TEXT,
  utm_campaign TEXT,
  utm_content TEXT,
  utm_term TEXT,

  -- Technical Attribution
  referrer TEXT,
  user_agent TEXT,
  ip_address INET,

  -- Behavioral Context
  signup_page TEXT,
  cta_text TEXT,

  -- Analytics
  posthog_distinct_id TEXT,
  first_touch_attribution JSONB,
  last_touch_attribution JSONB,

  -- Conversion
  converted_at TIMESTAMPTZ,
  auth_user_id UUID REFERENCES auth.users(id),

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ═══════════════════════════════════════════════════════════════════════════
-- INDEXES
-- ═══════════════════════════════════════════════════════════════════════════

CREATE INDEX IF NOT EXISTS idx_waitlist_email ON waitlist(email);
CREATE INDEX IF NOT EXISTS idx_waitlist_source ON waitlist(source);
CREATE INDEX IF NOT EXISTS idx_waitlist_role ON waitlist(role);
CREATE INDEX IF NOT EXISTS idx_waitlist_created_at ON waitlist(created_at);
CREATE INDEX IF NOT EXISTS idx_waitlist_utm_source ON waitlist(utm_source);
CREATE INDEX IF NOT EXISTS idx_waitlist_posthog_id ON waitlist(posthog_distinct_id);

-- ═══════════════════════════════════════════════════════════════════════════
-- ROW LEVEL SECURITY
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE waitlist ENABLE ROW LEVEL SECURITY;

-- Admin-only access via user_roles/roles join
CREATE POLICY "Admins can manage waitlist" ON waitlist
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM user_roles ur
      JOIN roles r ON ur.role_id = r.id
      WHERE ur.user_id = auth.uid()
      AND r.domain = 'admin'
    )
  );

-- Service role can insert (for API/webhook signups)
CREATE POLICY "Service role can insert waitlist" ON waitlist
  FOR INSERT WITH CHECK (auth.uid() IS NULL);

-- ═══════════════════════════════════════════════════════════════════════════
-- TRIGGER: Update updated_at timestamp
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TRIGGER update_waitlist_updated_at
  BEFORE UPDATE ON waitlist
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
