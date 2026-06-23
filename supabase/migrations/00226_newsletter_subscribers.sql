-- ═══════════════════════════════════════════════════════════════════════════
-- Migration: Newsletter Subscribers
-- Description: Brings the marketing site's newsletter_subscribers table under
--   managed migrations. It was previously created out-of-band on the self-hosted
--   DB by the PatinaWebsite repo (schema drift); this migration is the canonical
--   definition. Captures email-capture signups with full UTM/lead attribution and
--   double opt-in (confirmed + confirmation_token).
--
--   Writers (service role, RLS-bypassing):
--     /api/newsletter         → upsert on email (rotates token, confirmed=false)
--     /api/newsletter/confirm → match (email, confirmation_token) → confirmed=true, token=null
--
--   Idempotent: CREATE TABLE / ADD COLUMN / policies / trigger are all guarded so
--   this reconciles a table that may already exist out-of-band. Additive only (D7).
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS newsletter_subscribers (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  source TEXT NOT NULL DEFAULT 'website',

  -- Behavioral context
  signup_page TEXT,

  -- UTM attribution
  utm_source TEXT,
  utm_medium TEXT,
  utm_campaign TEXT,
  utm_content TEXT,
  utm_term TEXT,

  -- Technical attribution
  referrer TEXT,
  user_agent TEXT,

  -- Analytics
  lead_attribution JSONB,
  posthog_distinct_id TEXT,

  -- Subscription state / double opt-in
  subscribed BOOLEAN NOT NULL DEFAULT TRUE,
  confirmed BOOLEAN NOT NULL DEFAULT FALSE,
  confirmation_token TEXT,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Reconcile a pre-existing out-of-band table that may carry only a subset of columns
-- (the original PatinaWebsite migration had: email, source, signup_page, utm_source,
--  utm_medium, utm_campaign, subscribed, timestamps).
ALTER TABLE newsletter_subscribers
  ADD COLUMN IF NOT EXISTS signup_page TEXT,
  ADD COLUMN IF NOT EXISTS utm_source TEXT,
  ADD COLUMN IF NOT EXISTS utm_medium TEXT,
  ADD COLUMN IF NOT EXISTS utm_campaign TEXT,
  ADD COLUMN IF NOT EXISTS utm_content TEXT,
  ADD COLUMN IF NOT EXISTS utm_term TEXT,
  ADD COLUMN IF NOT EXISTS referrer TEXT,
  ADD COLUMN IF NOT EXISTS user_agent TEXT,
  ADD COLUMN IF NOT EXISTS lead_attribution JSONB,
  ADD COLUMN IF NOT EXISTS posthog_distinct_id TEXT,
  ADD COLUMN IF NOT EXISTS subscribed BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS confirmed BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS confirmation_token TEXT;

-- ═══════════════════════════════════════════════════════════════════════════
-- INDEXES
-- ═══════════════════════════════════════════════════════════════════════════

CREATE INDEX IF NOT EXISTS idx_newsletter_subscribers_email ON newsletter_subscribers(email);
CREATE INDEX IF NOT EXISTS idx_newsletter_subscribers_source ON newsletter_subscribers(source);
CREATE INDEX IF NOT EXISTS idx_newsletter_subscribers_created_at ON newsletter_subscribers(created_at);
CREATE INDEX IF NOT EXISTS idx_newsletter_subscribers_confirmation_token ON newsletter_subscribers(confirmation_token);
CREATE INDEX IF NOT EXISTS idx_newsletter_subscribers_posthog_id ON newsletter_subscribers(posthog_distinct_id);

-- ═══════════════════════════════════════════════════════════════════════════
-- ROW LEVEL SECURITY  (mirrors waitlist: admin-managed, service-role insert)
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE newsletter_subscribers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can manage newsletter_subscribers" ON newsletter_subscribers;
CREATE POLICY "Admins can manage newsletter_subscribers" ON newsletter_subscribers
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM user_roles ur
      JOIN roles r ON ur.role_id = r.id
      WHERE ur.user_id = auth.uid()
      AND r.domain = 'admin'
    )
  );

DROP POLICY IF EXISTS "Service role can insert newsletter_subscribers" ON newsletter_subscribers;
CREATE POLICY "Service role can insert newsletter_subscribers" ON newsletter_subscribers
  FOR INSERT WITH CHECK (auth.uid() IS NULL);

-- ═══════════════════════════════════════════════════════════════════════════
-- TRIGGER: Update updated_at timestamp (repo-canonical helper from 00001)
-- ═══════════════════════════════════════════════════════════════════════════

DROP TRIGGER IF EXISTS update_newsletter_subscribers_updated_at ON newsletter_subscribers;
CREATE TRIGGER update_newsletter_subscribers_updated_at
  BEFORE UPDATE ON newsletter_subscribers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
