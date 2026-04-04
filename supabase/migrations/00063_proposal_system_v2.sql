-- ═══════════════════════════════════════════════════════════════════════════
-- Migration: Proposal System V2
-- Description: Adds proposal sections, templates, engagement tracking,
--              and additional proposal fields for the full proposal workflow
-- ═══════════════════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════════════════
-- PROPOSAL TEMPLATES TABLE
-- Pre-built starting structures for proposals
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS proposal_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  sections_config JSONB NOT NULL DEFAULT '[]'::jsonb,
  estimated_pages INTEGER DEFAULT 1,
  is_system BOOLEAN NOT NULL DEFAULT false,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE proposal_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read system templates" ON proposal_templates
  FOR SELECT USING (is_system = true);

CREATE POLICY "Users can read their own templates" ON proposal_templates
  FOR SELECT USING (auth.uid() = created_by);

CREATE POLICY "Users can manage their own templates" ON proposal_templates
  FOR ALL USING (auth.uid() = created_by AND is_system = false);

-- ═══════════════════════════════════════════════════════════════════════════
-- ALTER PROPOSALS TABLE
-- Add template_id, revision/signing fields, send fields
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE proposals
  ADD COLUMN IF NOT EXISTS template_id UUID REFERENCES proposal_templates(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS revision_summary TEXT,
  ADD COLUMN IF NOT EXISTS client_feedback TEXT,
  ADD COLUMN IF NOT EXISTS personal_message TEXT,
  ADD COLUMN IF NOT EXISTS cc_email TEXT,
  ADD COLUMN IF NOT EXISTS signed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS signed_by_name TEXT,
  ADD COLUMN IF NOT EXISTS signed_ip TEXT;

-- ═══════════════════════════════════════════════════════════════════════════
-- PROPOSAL SECTIONS TABLE
-- The 7 document sections per proposal (vision, concept, space_plan, etc.)
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS proposal_sections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id UUID NOT NULL REFERENCES proposals(id) ON DELETE CASCADE,

  -- Section identity
  type TEXT NOT NULL, -- 'vision', 'concept', 'space_plan', 'selections', 'investment', 'timeline', 'terms'
  title TEXT NOT NULL,
  body TEXT, -- Rich text / markdown content

  -- Section-specific data
  metadata JSONB DEFAULT '{}'::jsonb,
  -- For concept: { mood_board_urls: [], color_palette: [{hex, name}] }
  -- For space_plan: { room_scan_id: uuid, floor_plan_url: string }
  -- For investment: { payment_schedule: [{label, percent, description}] }
  -- For timeline: { phases: [{date_range, name}] }
  -- For terms: { designer_name: string, valid_days: number }

  -- Ordering
  sort_order INTEGER NOT NULL DEFAULT 0,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_proposal_sections_proposal ON proposal_sections(proposal_id);
CREATE INDEX IF NOT EXISTS idx_proposal_sections_order ON proposal_sections(proposal_id, sort_order);

ALTER TABLE proposal_sections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Inherit proposal access for sections" ON proposal_sections
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM proposals
      WHERE proposals.id = proposal_sections.proposal_id
      AND (proposals.designer_id = auth.uid() OR proposals.client_id = auth.uid())
    )
  );

-- ═══════════════════════════════════════════════════════════════════════════
-- PROPOSAL ENGAGEMENT TABLE
-- Tracks client viewing activity for proposals
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS proposal_engagement (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id UUID NOT NULL REFERENCES proposals(id) ON DELETE CASCADE,
  viewer_id UUID REFERENCES profiles(id) ON DELETE SET NULL,

  -- Event
  event_type TEXT NOT NULL, -- 'opened', 'section_viewed', 'signed', 'downloaded'
  section_type TEXT, -- nullable: which section was viewed
  duration_seconds INTEGER, -- nullable: time spent on section

  -- Context
  metadata JSONB DEFAULT '{}'::jsonb, -- IP, user agent, device info

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_proposal_engagement_proposal ON proposal_engagement(proposal_id);
CREATE INDEX IF NOT EXISTS idx_proposal_engagement_created ON proposal_engagement(proposal_id, created_at DESC);

ALTER TABLE proposal_engagement ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Designers can read engagement for their proposals" ON proposal_engagement
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM proposals
      WHERE proposals.id = proposal_engagement.proposal_id
      AND proposals.designer_id = auth.uid()
    )
  );

-- Allow inserts from authenticated users (clients viewing their proposals)
CREATE POLICY "Clients can record engagement" ON proposal_engagement
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM proposals
      WHERE proposals.id = proposal_engagement.proposal_id
      AND proposals.client_id = auth.uid()
      AND proposals.status != 'draft'
    )
  );

-- ═══════════════════════════════════════════════════════════════════════════
-- SEED SYSTEM TEMPLATES
-- ═══════════════════════════════════════════════════════════════════════════

INSERT INTO proposal_templates (name, description, sections_config, estimated_pages, is_system) VALUES
(
  'Full Room Design',
  'Complete design proposal with all seven sections. Vision, concept, space plan, products, investment, timeline, terms.',
  '[
    {"type": "vision", "title": "Design Vision", "default_body": ""},
    {"type": "concept", "title": "Design Concept", "default_body": ""},
    {"type": "space_plan", "title": "Space Plan", "default_body": ""},
    {"type": "selections", "title": "Product Selections", "default_body": "Every piece has been selected for this specific room — considering your light, your floors, and the way your family uses the space."},
    {"type": "investment", "title": "Investment", "default_body": ""},
    {"type": "timeline", "title": "Project Timeline", "default_body": ""},
    {"type": "terms", "title": "Terms & Agreement", "default_body": "This proposal is valid for 14 days from the date above. Signing below constitutes agreement to the scope, investment, and payment schedule described in this document."}
  ]'::jsonb,
  4,
  true
),
(
  'Room Refresh',
  'Lighter engagement — styling and product recommendations without full space planning or construction.',
  '[
    {"type": "vision", "title": "Design Vision", "default_body": ""},
    {"type": "concept", "title": "Design Concept", "default_body": ""},
    {"type": "selections", "title": "Product Selections", "default_body": ""},
    {"type": "investment", "title": "Investment", "default_body": ""},
    {"type": "terms", "title": "Terms & Agreement", "default_body": "This proposal is valid for 14 days from the date above."}
  ]'::jsonb,
  2,
  true
),
(
  'Consultation Only',
  'Paid consultation with design direction, mood board, and recommended next steps. No product selections.',
  '[
    {"type": "vision", "title": "Design Vision", "default_body": ""},
    {"type": "concept", "title": "Design Concept", "default_body": ""},
    {"type": "terms", "title": "Terms & Agreement", "default_body": "This proposal is valid for 14 days from the date above."}
  ]'::jsonb,
  1,
  true
),
(
  'Virtual Design',
  'Remote-only engagement with room scan-based recommendations and shopping list. No on-site work.',
  '[
    {"type": "vision", "title": "Design Vision", "default_body": ""},
    {"type": "concept", "title": "Design Concept", "default_body": ""},
    {"type": "space_plan", "title": "Space Plan", "default_body": ""},
    {"type": "selections", "title": "Product Selections", "default_body": ""},
    {"type": "investment", "title": "Investment", "default_body": ""},
    {"type": "terms", "title": "Terms & Agreement", "default_body": "This proposal is valid for 14 days from the date above."}
  ]'::jsonb,
  3,
  true
),
(
  'Custom',
  'Start from scratch. Add sections as needed. Full control over structure and content.',
  '[]'::jsonb,
  0,
  true
);
