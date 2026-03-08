-- ═══════════════════════════════════════════════════════════════════════════
-- Migration: Notification Log
-- Description: Tracks all sent notifications with delivery status,
--              provider tracking, open/click events, and error details.
--              Standard PostgreSQL with time-based indexes.
-- NOTE: Can upgrade to TimescaleDB hypertable for better time-series
--       performance at scale. See: https://docs.timescale.com/
-- ═══════════════════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════════════════
-- NOTIFICATION STATUS ENUM
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TYPE notification_status AS ENUM (
  'queued',
  'sending',
  'delivered',
  'opened',
  'clicked',
  'bounced',
  'failed',
  'suppressed'
);

-- ═══════════════════════════════════════════════════════════════════════════
-- NOTIFICATION CHANNEL ENUM
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TYPE notification_channel AS ENUM ('email', 'push', 'in_app', 'sms');

-- ═══════════════════════════════════════════════════════════════════════════
-- NOTIFICATION LOG TABLE
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE notification_log (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  channel notification_channel NOT NULL,
  status notification_status NOT NULL DEFAULT 'queued',

  -- Provider tracking
  provider_id TEXT,         -- Resend message ID, push token, etc.
  template_id TEXT,         -- Template name/version used

  -- Content metadata
  metadata JSONB DEFAULT '{}',

  -- Error tracking
  error TEXT,
  retry_count INTEGER NOT NULL DEFAULT 0,

  -- Engagement tracking
  opened_at TIMESTAMPTZ,
  clicked_at TIMESTAMPTZ,

  -- Timestamps
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ═══════════════════════════════════════════════════════════════════════════
-- INDEXES
-- ═══════════════════════════════════════════════════════════════════════════

CREATE INDEX idx_notification_log_user_id ON notification_log(user_id);
CREATE INDEX idx_notification_log_type ON notification_log(type);
CREATE INDEX idx_notification_log_status ON notification_log(status);
CREATE INDEX idx_notification_log_created_at ON notification_log(created_at);
CREATE INDEX idx_notification_log_composite
  ON notification_log(user_id, type, created_at);
-- For frequency cap queries (e.g. "any price_drop for this user in last 7 days?")
CREATE INDEX idx_notification_log_frequency_cap
  ON notification_log(user_id, type, status, created_at)
  WHERE status IN ('delivered', 'opened', 'clicked');

-- ═══════════════════════════════════════════════════════════════════════════
-- ROW LEVEL SECURITY
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE notification_log ENABLE ROW LEVEL SECURITY;

-- Users can read their own notification history
CREATE POLICY "Users can read own notification logs" ON notification_log
  FOR SELECT USING (auth.uid() = user_id);

-- Service role can insert and update (for dispatch and webhook handlers)
CREATE POLICY "Service role can insert notification logs" ON notification_log
  FOR INSERT WITH CHECK (auth.uid() IS NULL);

CREATE POLICY "Service role can update notification logs" ON notification_log
  FOR UPDATE USING (auth.uid() IS NULL);

-- Admins can read all logs
CREATE POLICY "Admins can read all notification logs" ON notification_log
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM user_roles ur
      JOIN roles r ON ur.role_id = r.id
      WHERE ur.user_id = auth.uid()
      AND r.domain = 'admin'
    )
  );

-- ═══════════════════════════════════════════════════════════════════════════
-- BOUNCE TRACKING ON PROFILES
-- Track hard/soft bounces for suppression logic
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS email_bounce_count INTEGER DEFAULT 0;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS email_suppressed BOOLEAN DEFAULT false;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS email_suppressed_at TIMESTAMPTZ;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS email_complaint BOOLEAN DEFAULT false;
