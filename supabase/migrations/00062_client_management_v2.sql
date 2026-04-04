-- ═══════════════════════════════════════════════════════════════════════════
-- Migration: Client Management v2
-- Description: Extends designer_clients with lifecycle stages, adds tables
--   for decisions, reviews, nurture touchpoints, and activity logging.
--   Supports the full Client Management & Communication feature set.
-- ═══════════════════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. EXTEND designer_clients
-- ═══════════════════════════════════════════════════════════════════════════

-- Original status values: 'active', 'archived', 'prospect' (from 00014)
-- The Supabase hooks use: 'active', 'paused', 'completed'
-- New lifecycle stages: 'lead', 'proposal', 'active', 'completed', 'nurture'
-- Keep 'paused' and 'archived' for backward compat

ALTER TABLE designer_clients
  ADD COLUMN IF NOT EXISTS referral_source TEXT,
  ADD COLUMN IF NOT EXISTS location TEXT,
  ADD COLUMN IF NOT EXISTS preferred_contact TEXT,
  ADD COLUMN IF NOT EXISTS style_tags TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS style_preferences JSONB DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS inspiration_quote TEXT,
  ADD COLUMN IF NOT EXISTS last_contacted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS satisfaction_score NUMERIC(3,2);

-- Add CHECK constraint for lifecycle stages
-- Drop if exists first (idempotent)
ALTER TABLE designer_clients DROP CONSTRAINT IF EXISTS designer_clients_status_check;
ALTER TABLE designer_clients ADD CONSTRAINT designer_clients_status_check
  CHECK (status IN ('lead', 'proposal', 'active', 'completed', 'nurture', 'paused', 'archived', 'prospect'));

-- Migrate 'paused' rows to 'nurture' (they map semantically)
UPDATE designer_clients SET status = 'nurture' WHERE status = 'paused';
-- Migrate 'prospect' to 'lead'
UPDATE designer_clients SET status = 'lead' WHERE status = 'prospect';
-- Migrate 'archived' to 'completed' (close enough)
UPDATE designer_clients SET status = 'completed' WHERE status = 'archived';

-- Now tighten the constraint to only the 5 lifecycle stages
ALTER TABLE designer_clients DROP CONSTRAINT designer_clients_status_check;
ALTER TABLE designer_clients ADD CONSTRAINT designer_clients_status_check
  CHECK (status IN ('lead', 'proposal', 'active', 'completed', 'nurture'));

-- Index for last_contacted_at (nurture queries)
CREATE INDEX IF NOT EXISTS idx_designer_clients_last_contact
  ON designer_clients(last_contacted_at)
  WHERE last_contacted_at IS NOT NULL;

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. ADD designer_client_id TO client_messages
--    The existing table uses sender_id/recipient_id but the hooks need
--    to query messages by designer-client relationship.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE client_messages
  ADD COLUMN IF NOT EXISTS designer_client_id UUID REFERENCES designer_clients(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_client_messages_designer_client
  ON client_messages(designer_client_id)
  WHERE designer_client_id IS NOT NULL;

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. CLIENT DECISIONS
--    Structured decision requests sent to clients (rug color, paint, etc.)
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS client_decisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  designer_client_id UUID NOT NULL REFERENCES designer_clients(id) ON DELETE CASCADE,
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,

  -- Content
  title TEXT NOT NULL,
  context TEXT, -- Designer's explanation to client
  due_date TIMESTAMPTZ,
  linked_phase TEXT, -- e.g. 'Procurement', 'Design', 'Installation'

  -- Status
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('draft', 'pending', 'responded', 'expired')),

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_client_decisions_client_status
  ON client_decisions(designer_client_id, status);

CREATE INDEX IF NOT EXISTS idx_client_decisions_due_date
  ON client_decisions(due_date)
  WHERE status = 'pending';

-- RLS
ALTER TABLE client_decisions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Designers can manage their decisions" ON client_decisions
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM designer_clients
      WHERE designer_clients.id = client_decisions.designer_client_id
      AND designer_clients.designer_id = auth.uid()
    )
  );

-- Updated_at trigger
CREATE TRIGGER update_client_decisions_updated_at
  BEFORE UPDATE ON client_decisions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. CLIENT DECISION OPTIONS
--    Visual options within a decision request
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS client_decision_options (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  decision_id UUID NOT NULL REFERENCES client_decisions(id) ON DELETE CASCADE,

  -- Content
  name TEXT NOT NULL,
  image_url TEXT,
  designer_note TEXT,

  -- Flags
  is_recommended BOOLEAN DEFAULT false,
  selected BOOLEAN DEFAULT false,
  client_note TEXT, -- Note the client adds when selecting

  -- Ordering
  sort_order INTEGER DEFAULT 0,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_decision_options_decision
  ON client_decision_options(decision_id, sort_order);

-- RLS
ALTER TABLE client_decision_options ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Designers can manage decision options" ON client_decision_options
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM client_decisions
      JOIN designer_clients ON designer_clients.id = client_decisions.designer_client_id
      WHERE client_decisions.id = client_decision_options.decision_id
      AND designer_clients.designer_id = auth.uid()
    )
  );

-- ═══════════════════════════════════════════════════════════════════════════
-- 5. CLIENT REVIEWS
--    Review collection and portfolio publishing
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS client_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  designer_client_id UUID NOT NULL REFERENCES designer_clients(id) ON DELETE CASCADE,
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,

  -- Review content
  rating INTEGER CHECK (rating >= 1 AND rating <= 5),
  review_text TEXT,
  tags TEXT[] DEFAULT '{}',

  -- Publishing
  published_to_portfolio BOOLEAN DEFAULT false,
  referral_count INTEGER DEFAULT 0,

  -- Request workflow
  request_status TEXT NOT NULL DEFAULT 'not_sent'
    CHECK (request_status IN ('not_sent', 'queued', 'sent', 'collected')),
  request_sent_at TIMESTAMPTZ,
  scheduled_for TIMESTAMPTZ,
  custom_message TEXT, -- Designer's custom request message

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_client_reviews_client_status
  ON client_reviews(designer_client_id, request_status);

CREATE INDEX IF NOT EXISTS idx_client_reviews_published
  ON client_reviews(published_to_portfolio)
  WHERE published_to_portfolio = true;

-- RLS
ALTER TABLE client_reviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Designers can manage their reviews" ON client_reviews
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM designer_clients
      WHERE designer_clients.id = client_reviews.designer_client_id
      AND designer_clients.designer_id = auth.uid()
    )
  );

-- Updated_at trigger
CREATE TRIGGER update_client_reviews_updated_at
  BEFORE UPDATE ON client_reviews
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ═══════════════════════════════════════════════════════════════════════════
-- 6. CLIENT NURTURE TOUCHPOINTS
--    Suggested and scheduled touchpoints for past clients
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS client_nurture_touchpoints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  designer_client_id UUID NOT NULL REFERENCES designer_clients(id) ON DELETE CASCADE,

  -- Touchpoint details
  touchpoint_type TEXT NOT NULL
    CHECK (touchpoint_type IN ('check_in', 'anniversary', 'seasonal', 'product_match', 'referral_ask')),
  suggested_date DATE,
  reason TEXT, -- Why this touchpoint is suggested

  -- Status
  status TEXT NOT NULL DEFAULT 'suggested'
    CHECK (status IN ('suggested', 'scheduled', 'sent', 'dismissed')),

  -- Optional product link (for product_match type)
  product_id UUID REFERENCES products(id) ON DELETE SET NULL,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_nurture_touchpoints_status_date
  ON client_nurture_touchpoints(status, suggested_date);

CREATE INDEX IF NOT EXISTS idx_nurture_touchpoints_client
  ON client_nurture_touchpoints(designer_client_id);

-- RLS
ALTER TABLE client_nurture_touchpoints ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Designers can manage their touchpoints" ON client_nurture_touchpoints
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM designer_clients
      WHERE designer_clients.id = client_nurture_touchpoints.designer_client_id
      AND designer_clients.designer_id = auth.uid()
    )
  );

-- ═══════════════════════════════════════════════════════════════════════════
-- 7. CLIENT ACTIVITY LOG
--    Unified activity feed for the client profile
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS client_activity_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  designer_client_id UUID NOT NULL REFERENCES designer_clients(id) ON DELETE CASCADE,

  -- Activity details
  activity_type TEXT NOT NULL
    CHECK (activity_type IN ('message', 'decision', 'status_change', 'invoice', 'project_update', 'review', 'note', 'milestone')),
  title TEXT NOT NULL,
  description TEXT,
  metadata JSONB DEFAULT '{}',

  -- Actor (denormalized for fast display)
  actor_name TEXT,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_activity_log_client_created
  ON client_activity_log(designer_client_id, created_at DESC);

-- RLS
ALTER TABLE client_activity_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Designers can manage their activity log" ON client_activity_log
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM designer_clients
      WHERE designer_clients.id = client_activity_log.designer_client_id
      AND designer_clients.designer_id = auth.uid()
    )
  );
