-- ═══════════════════════════════════════════════════════════════════════════
-- Migration: Campaigns Extended
-- Description: Additive ALTER on campaigns table for A/B testing,
--              content blocks, audience segments, inline counters,
--              and archived status.
-- ═══════════════════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════════════════
-- ADD 'archived' TO campaign_status ENUM
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TYPE campaign_status ADD VALUE IF NOT EXISTS 'archived';

-- ═══════════════════════════════════════════════════════════════════════════
-- EXTEND CAMPAIGNS TABLE
-- ═══════════════════════════════════════════════════════════════════════════

-- Content blocks (matches email_templates.content_blocks structure)
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS content_json JSONB DEFAULT '{}';

-- Audience segment reference
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS audience_segment_id UUID REFERENCES audience_segments(id) ON DELETE SET NULL;

-- Frozen audience snapshot at send time
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS audience_snapshot JSONB;

-- A/B testing fields
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS ab_enabled BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS ab_subject_b TEXT;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS ab_split_pct INTEGER DEFAULT 50 CHECK (ab_split_pct BETWEEN 10 AND 90);
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS ab_winner TEXT CHECK (ab_winner IN ('a', 'b'));
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS ab_decided_at TIMESTAMPTZ;

-- Inline counters (denormalized for fast reads — updated by resend-webhook)
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS sent_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS open_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS click_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS bounce_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS unsubscribe_count INTEGER NOT NULL DEFAULT 0;

-- Email template reference (nullable — legacy campaigns use template_id string)
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS email_template_id UUID REFERENCES email_templates(id) ON DELETE SET NULL;

-- ═══════════════════════════════════════════════════════════════════════════
-- ADD INDEXES
-- ═══════════════════════════════════════════════════════════════════════════

CREATE INDEX IF NOT EXISTS idx_campaigns_audience_segment ON campaigns(audience_segment_id);
CREATE INDEX IF NOT EXISTS idx_campaigns_email_template ON campaigns(email_template_id);
CREATE INDEX IF NOT EXISTS idx_campaigns_ab_enabled ON campaigns(ab_enabled) WHERE ab_enabled = true;
