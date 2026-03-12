-- ═══════════════════════════════════════════════════════════════════════════
-- Migration: Campaigns
-- Description: Campaign management tables for marketing email campaigns,
--              analytics tracking, and automated sequences (schema only).
-- ═══════════════════════════════════════════════════════════════════════════

-- Enable moddatetime extension for updated_at triggers
CREATE EXTENSION IF NOT EXISTS moddatetime WITH SCHEMA extensions;

-- ═══════════════════════════════════════════════════════════════════════════
-- CAMPAIGN STATUS ENUM
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TYPE campaign_status AS ENUM (
  'draft',
  'scheduled',
  'sending',
  'sent',
  'cancelled'
);

-- ═══════════════════════════════════════════════════════════════════════════
-- AUDIENCE TYPE ENUM
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TYPE audience_type AS ENUM ('all', 'segment', 'individual');

-- ═══════════════════════════════════════════════════════════════════════════
-- CAMPAIGNS TABLE
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE campaigns (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  subject TEXT NOT NULL,
  preview_text TEXT,
  template_id TEXT NOT NULL,
  template_data JSONB NOT NULL DEFAULT '{}',
  audience_type audience_type NOT NULL DEFAULT 'all',
  audience_segment JSONB,
  status campaign_status NOT NULL DEFAULT 'draft',
  scheduled_for TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  total_recipients INTEGER DEFAULT 0,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ═══════════════════════════════════════════════════════════════════════════
-- CAMPAIGN INDEXES
-- ═══════════════════════════════════════════════════════════════════════════

CREATE INDEX idx_campaigns_status_scheduled ON campaigns(status, scheduled_for);
CREATE INDEX idx_campaigns_created_by ON campaigns(created_by);

-- ═══════════════════════════════════════════════════════════════════════════
-- CAMPAIGN ANALYTICS TABLE
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE campaign_analytics (
  campaign_id UUID PRIMARY KEY REFERENCES campaigns(id) ON DELETE CASCADE,
  delivered INTEGER NOT NULL DEFAULT 0,
  opened INTEGER NOT NULL DEFAULT 0,
  clicked INTEGER NOT NULL DEFAULT 0,
  unsubscribed INTEGER NOT NULL DEFAULT 0,
  bounced INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Auto-create analytics row when campaign is inserted
CREATE OR REPLACE FUNCTION create_campaign_analytics()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO campaign_analytics (campaign_id) VALUES (NEW.id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_create_campaign_analytics
  AFTER INSERT ON campaigns
  FOR EACH ROW
  EXECUTE FUNCTION create_campaign_analytics();

-- ═══════════════════════════════════════════════════════════════════════════
-- AUTOMATED SEQUENCES (schema only — Sprint 5)
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE automated_sequences (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  trigger_event TEXT NOT NULL,
  emails JSONB NOT NULL DEFAULT '[]',
  is_active BOOLEAN NOT NULL DEFAULT false,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE sequence_enrollments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  sequence_id UUID NOT NULL REFERENCES automated_sequences(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  current_step INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active',
  enrolled_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  last_email_sent_at TIMESTAMPTZ,
  next_email_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(sequence_id, user_id)
);

-- ═══════════════════════════════════════════════════════════════════════════
-- UPDATED_AT TRIGGERS
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TRIGGER set_campaigns_updated_at
  BEFORE UPDATE ON campaigns
  FOR EACH ROW
  EXECUTE FUNCTION extensions.moddatetime(updated_at);

CREATE TRIGGER set_campaign_analytics_updated_at
  BEFORE UPDATE ON campaign_analytics
  FOR EACH ROW
  EXECUTE FUNCTION extensions.moddatetime(updated_at);

CREATE TRIGGER set_automated_sequences_updated_at
  BEFORE UPDATE ON automated_sequences
  FOR EACH ROW
  EXECUTE FUNCTION extensions.moddatetime(updated_at);

CREATE TRIGGER set_sequence_enrollments_updated_at
  BEFORE UPDATE ON sequence_enrollments
  FOR EACH ROW
  EXECUTE FUNCTION extensions.moddatetime(updated_at);

-- ═══════════════════════════════════════════════════════════════════════════
-- ROW LEVEL SECURITY
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaign_analytics ENABLE ROW LEVEL SECURITY;
ALTER TABLE automated_sequences ENABLE ROW LEVEL SECURITY;
ALTER TABLE sequence_enrollments ENABLE ROW LEVEL SECURITY;

-- Service role full access (Edge Functions run as service role)
CREATE POLICY "Service role full access on campaigns" ON campaigns
  FOR ALL USING (auth.uid() IS NULL);

CREATE POLICY "Service role full access on campaign_analytics" ON campaign_analytics
  FOR ALL USING (auth.uid() IS NULL);

CREATE POLICY "Service role full access on automated_sequences" ON automated_sequences
  FOR ALL USING (auth.uid() IS NULL);

CREATE POLICY "Service role full access on sequence_enrollments" ON sequence_enrollments
  FOR ALL USING (auth.uid() IS NULL);

-- Admins can read all campaigns
CREATE POLICY "Admins can read all campaigns" ON campaigns
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM user_roles ur
      JOIN roles r ON ur.role_id = r.id
      WHERE ur.user_id = auth.uid()
      AND r.domain = 'admin'
    )
  );

-- Campaign creators can read their own campaigns
CREATE POLICY "Creators can read own campaigns" ON campaigns
  FOR SELECT USING (auth.uid() = created_by);

-- Admins can read all campaign analytics
CREATE POLICY "Admins can read all campaign_analytics" ON campaign_analytics
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM user_roles ur
      JOIN roles r ON ur.role_id = r.id
      WHERE ur.user_id = auth.uid()
      AND r.domain = 'admin'
    )
  );

-- Admins can read all sequences
CREATE POLICY "Admins can read all automated_sequences" ON automated_sequences
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM user_roles ur
      JOIN roles r ON ur.role_id = r.id
      WHERE ur.user_id = auth.uid()
      AND r.domain = 'admin'
    )
  );

-- Users can read their own sequence enrollments
CREATE POLICY "Users can read own sequence_enrollments" ON sequence_enrollments
  FOR SELECT USING (auth.uid() = user_id);
