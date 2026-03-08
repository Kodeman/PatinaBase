-- ═══════════════════════════════════════════════════════════════════════════
-- Migration: Portal Business Features
-- Description: Adds leads, clients, proposals, earnings, and room scans tables
-- ═══════════════════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════════════════
-- LEADS TABLE
-- Homeowner project inquiries matched to designers
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Parties
  homeowner_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  designer_id UUID REFERENCES profiles(id) ON DELETE SET NULL,

  -- Project Details
  project_type TEXT NOT NULL, -- 'full_room', 'consultation', 'single_piece', 'staging'
  project_description TEXT,
  budget_range TEXT, -- 'under_5k', '5k_15k', '15k_50k', '50k_100k', 'over_100k'
  timeline TEXT, -- 'asap', '1_3_months', '3_6_months', '6_12_months', 'flexible'

  -- Location
  location_city TEXT,
  location_state TEXT,
  location_zip TEXT,

  -- Matching
  match_score DECIMAL(3,2), -- 0.00 to 1.00
  match_reasons JSONB DEFAULT '[]'::jsonb, -- Array of reasons for match

  -- Status
  status TEXT NOT NULL DEFAULT 'new', -- 'new', 'viewed', 'contacted', 'accepted', 'declined', 'expired'
  response_deadline TIMESTAMPTZ,

  -- Timestamps
  contacted_at TIMESTAMPTZ,
  accepted_at TIMESTAMPTZ,
  declined_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_leads_designer ON leads(designer_id);
CREATE INDEX IF NOT EXISTS idx_leads_homeowner ON leads(homeowner_id);
CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(status);
CREATE INDEX IF NOT EXISTS idx_leads_match_score ON leads(match_score DESC);
CREATE INDEX IF NOT EXISTS idx_leads_created ON leads(created_at DESC);

-- RLS
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Designers can view their leads" ON leads
  FOR SELECT USING (auth.uid() = designer_id);

CREATE POLICY "Homeowners can view their leads" ON leads
  FOR SELECT USING (auth.uid() = homeowner_id);

CREATE POLICY "Designers can update their leads" ON leads
  FOR UPDATE USING (auth.uid() = designer_id);

CREATE POLICY "Homeowners can create leads" ON leads
  FOR INSERT WITH CHECK (auth.uid() = homeowner_id);

-- ═══════════════════════════════════════════════════════════════════════════
-- DESIGNER CLIENTS TABLE
-- Relationship between designers and their clients
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS designer_clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  designer_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,

  -- Relationship Info
  nickname TEXT, -- Designer's nickname for client
  notes TEXT, -- Private notes
  tags TEXT[] DEFAULT '{}', -- Custom tags like 'VIP', 'Referral'

  -- Source
  source TEXT, -- 'lead', 'referral', 'direct', 'other'
  lead_id UUID REFERENCES leads(id) ON DELETE SET NULL,

  -- Status
  status TEXT NOT NULL DEFAULT 'active', -- 'active', 'archived', 'prospect'

  -- Stats
  total_projects INTEGER DEFAULT 0,
  total_revenue INTEGER DEFAULT 0, -- cents

  -- Timestamps
  first_project_at TIMESTAMPTZ,
  last_project_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE(designer_id, client_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_designer_clients_designer ON designer_clients(designer_id);
CREATE INDEX IF NOT EXISTS idx_designer_clients_client ON designer_clients(client_id);
CREATE INDEX IF NOT EXISTS idx_designer_clients_status ON designer_clients(status);

-- RLS
ALTER TABLE designer_clients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Designers can manage their clients" ON designer_clients
  FOR ALL USING (auth.uid() = designer_id);

-- ═══════════════════════════════════════════════════════════════════════════
-- PROPOSALS TABLE
-- Design proposals sent to clients
-- (Must be created before client_messages which references it)
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS proposals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Relationships
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  designer_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  client_id UUID REFERENCES profiles(id) ON DELETE SET NULL,

  -- Content
  title TEXT NOT NULL,
  description TEXT,
  cover_image TEXT, -- URL to cover image

  -- Pricing
  subtotal INTEGER DEFAULT 0, -- cents
  discount_amount INTEGER DEFAULT 0, -- cents
  discount_percent DECIMAL(5,2), -- percentage
  tax_rate DECIMAL(5,4), -- 0.0825 for 8.25%
  tax_amount INTEGER DEFAULT 0, -- cents
  total_amount INTEGER DEFAULT 0, -- cents

  -- Payment Terms
  deposit_percent DECIMAL(5,2) DEFAULT 50.00,
  payment_terms TEXT, -- 'net_30', 'due_on_receipt', 'custom'
  payment_notes TEXT,

  -- Validity
  valid_until TIMESTAMPTZ,

  -- Status
  status TEXT NOT NULL DEFAULT 'draft', -- 'draft', 'sent', 'viewed', 'accepted', 'declined', 'expired', 'revised'
  version INTEGER DEFAULT 1,
  parent_proposal_id UUID REFERENCES proposals(id), -- For revisions

  -- Tracking
  sent_at TIMESTAMPTZ,
  viewed_at TIMESTAMPTZ,
  accepted_at TIMESTAMPTZ,
  declined_at TIMESTAMPTZ,
  decline_reason TEXT,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_proposals_designer ON proposals(designer_id);
CREATE INDEX IF NOT EXISTS idx_proposals_client ON proposals(client_id);
CREATE INDEX IF NOT EXISTS idx_proposals_project ON proposals(project_id);
CREATE INDEX IF NOT EXISTS idx_proposals_status ON proposals(status);
CREATE INDEX IF NOT EXISTS idx_proposals_created ON proposals(created_at DESC);

-- RLS
ALTER TABLE proposals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Designers can manage their proposals" ON proposals
  FOR ALL USING (auth.uid() = designer_id);

CREATE POLICY "Clients can view their proposals" ON proposals
  FOR SELECT USING (auth.uid() = client_id AND status != 'draft');

CREATE POLICY "Clients can update proposal status" ON proposals
  FOR UPDATE USING (auth.uid() = client_id AND status IN ('sent', 'viewed'));

-- ═══════════════════════════════════════════════════════════════════════════
-- CLIENT MESSAGES TABLE
-- Communication between designers and clients
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS client_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Parties (one must be designer, one must be client)
  sender_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  recipient_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,

  -- Context
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  proposal_id UUID REFERENCES proposals(id) ON DELETE SET NULL,

  -- Content
  subject TEXT,
  body TEXT NOT NULL,
  attachments JSONB DEFAULT '[]'::jsonb, -- Array of {url, name, type}

  -- Status
  read_at TIMESTAMPTZ,
  archived_by_sender BOOLEAN DEFAULT false,
  archived_by_recipient BOOLEAN DEFAULT false,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_client_messages_sender ON client_messages(sender_id);
CREATE INDEX IF NOT EXISTS idx_client_messages_recipient ON client_messages(recipient_id);
CREATE INDEX IF NOT EXISTS idx_client_messages_project ON client_messages(project_id);
CREATE INDEX IF NOT EXISTS idx_client_messages_created ON client_messages(created_at DESC);

-- RLS
ALTER TABLE client_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their messages" ON client_messages
  FOR SELECT USING (auth.uid() = sender_id OR auth.uid() = recipient_id);

CREATE POLICY "Users can send messages" ON client_messages
  FOR INSERT WITH CHECK (auth.uid() = sender_id);

CREATE POLICY "Users can update their messages" ON client_messages
  FOR UPDATE USING (auth.uid() = sender_id OR auth.uid() = recipient_id);

-- ═══════════════════════════════════════════════════════════════════════════
-- PROPOSAL ITEMS TABLE
-- Line items within a proposal
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS proposal_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id UUID NOT NULL REFERENCES proposals(id) ON DELETE CASCADE,

  -- Product reference (optional - can be custom item)
  product_id UUID REFERENCES products(id) ON DELETE SET NULL,

  -- Item Details
  name TEXT NOT NULL,
  description TEXT,
  image_url TEXT,

  -- Categorization
  room TEXT, -- 'living_room', 'bedroom', etc.
  category TEXT, -- 'furniture', 'lighting', 'decor', 'service'

  -- Pricing
  quantity INTEGER NOT NULL DEFAULT 1,
  unit_price INTEGER NOT NULL, -- cents (trade price)
  markup_percent DECIMAL(5,2) DEFAULT 0, -- Designer markup
  unit_sell_price INTEGER NOT NULL, -- cents (client price)
  line_total INTEGER NOT NULL, -- quantity * unit_sell_price

  -- Vendor Info
  vendor_id UUID REFERENCES vendors(id) ON DELETE SET NULL,
  vendor_name TEXT,
  lead_time_weeks INTEGER,

  -- Notes
  notes TEXT,
  internal_notes TEXT, -- Designer only

  -- Ordering
  position INTEGER NOT NULL DEFAULT 0,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_proposal_items_proposal ON proposal_items(proposal_id);
CREATE INDEX IF NOT EXISTS idx_proposal_items_product ON proposal_items(product_id);
CREATE INDEX IF NOT EXISTS idx_proposal_items_position ON proposal_items(proposal_id, position);

-- RLS
ALTER TABLE proposal_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Inherit proposal access" ON proposal_items
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM proposals
      WHERE proposals.id = proposal_items.proposal_id
      AND (proposals.designer_id = auth.uid() OR proposals.client_id = auth.uid())
    )
  );

-- ═══════════════════════════════════════════════════════════════════════════
-- DESIGNER EARNINGS TABLE
-- Track commissions and payouts
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS designer_earnings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  designer_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,

  -- Source
  source_type TEXT NOT NULL, -- 'product_commission', 'referral', 'bonus', 'adjustment'
  proposal_id UUID REFERENCES proposals(id) ON DELETE SET NULL,
  proposal_item_id UUID REFERENCES proposal_items(id) ON DELETE SET NULL,
  order_id UUID, -- Future: when orders table exists

  -- Amounts
  gross_amount INTEGER NOT NULL, -- cents (before fees)
  platform_fee INTEGER DEFAULT 0, -- cents
  net_amount INTEGER NOT NULL, -- cents (after fees)
  commission_rate DECIMAL(5,4), -- 0.0800 for 8%

  -- Description
  description TEXT,

  -- Status
  status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'confirmed', 'paid', 'cancelled'

  -- Payout
  payout_id UUID, -- Reference to payout batch
  paid_at TIMESTAMPTZ,

  -- Timestamps
  earned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_designer_earnings_designer ON designer_earnings(designer_id);
CREATE INDEX IF NOT EXISTS idx_designer_earnings_status ON designer_earnings(status);
CREATE INDEX IF NOT EXISTS idx_designer_earnings_earned ON designer_earnings(earned_at DESC);
CREATE INDEX IF NOT EXISTS idx_designer_earnings_payout ON designer_earnings(payout_id);

-- RLS
ALTER TABLE designer_earnings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Designers can view their earnings" ON designer_earnings
  FOR SELECT USING (auth.uid() = designer_id);

-- ═══════════════════════════════════════════════════════════════════════════
-- DESIGNER PAYOUTS TABLE
-- Batch payouts to designers
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS designer_payouts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  designer_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,

  -- Amount
  amount INTEGER NOT NULL, -- cents
  currency TEXT DEFAULT 'USD',

  -- Period
  period_start TIMESTAMPTZ NOT NULL,
  period_end TIMESTAMPTZ NOT NULL,

  -- Status
  status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'processing', 'completed', 'failed'

  -- Payment Info
  payment_method TEXT, -- 'stripe', 'paypal', 'check', 'wire'
  payment_reference TEXT, -- External payment ID

  -- Processing
  processed_at TIMESTAMPTZ,
  failed_reason TEXT,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_designer_payouts_designer ON designer_payouts(designer_id);
CREATE INDEX IF NOT EXISTS idx_designer_payouts_status ON designer_payouts(status);
CREATE INDEX IF NOT EXISTS idx_designer_payouts_created ON designer_payouts(created_at DESC);

-- RLS
ALTER TABLE designer_payouts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Designers can view their payouts" ON designer_payouts
  FOR SELECT USING (auth.uid() = designer_id);

-- ═══════════════════════════════════════════════════════════════════════════
-- ROOM SCANS TABLE
-- Room scans from mobile app
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS room_scans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Owner
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,

  -- Room Info
  name TEXT NOT NULL,
  room_type TEXT, -- 'living_room', 'bedroom', 'dining_room', 'office', etc.

  -- Dimensions (from RoomPlan)
  dimensions JSONB, -- {width, length, height, unit}
  floor_area DECIMAL(10,2), -- square feet/meters

  -- Features detected
  features JSONB DEFAULT '{}'::jsonb, -- {windows: [], doors: [], outlets: []}
  furniture_detected JSONB DEFAULT '[]'::jsonb, -- Array of detected items

  -- Style Analysis
  style_signals JSONB DEFAULT '{}'::jsonb, -- AI-analyzed style indicators
  suggested_styles TEXT[] DEFAULT '{}',

  -- Raw Data
  scan_data JSONB, -- Full RoomPlan export
  thumbnail_url TEXT,
  model_url TEXT, -- 3D model URL if exported

  -- Status
  status TEXT NOT NULL DEFAULT 'processing', -- 'processing', 'ready', 'failed'

  -- Timestamps
  scanned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_room_scans_user ON room_scans(user_id);
CREATE INDEX IF NOT EXISTS idx_room_scans_project ON room_scans(project_id);
CREATE INDEX IF NOT EXISTS idx_room_scans_status ON room_scans(status);
CREATE INDEX IF NOT EXISTS idx_room_scans_created ON room_scans(created_at DESC);

-- RLS
ALTER TABLE room_scans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their room scans" ON room_scans
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Designers can view client room scans" ON room_scans
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM designer_clients
      WHERE designer_clients.designer_id = auth.uid()
      AND designer_clients.client_id = room_scans.user_id
    )
  );

-- ═══════════════════════════════════════════════════════════════════════════
-- SETTINGS TABLE
-- User settings and preferences
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS user_settings (
  user_id UUID PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,

  -- Notification Preferences
  email_notifications BOOLEAN DEFAULT true,
  email_leads BOOLEAN DEFAULT true,
  email_messages BOOLEAN DEFAULT true,
  email_proposals BOOLEAN DEFAULT true,
  email_marketing BOOLEAN DEFAULT false,

  push_notifications BOOLEAN DEFAULT true,
  push_leads BOOLEAN DEFAULT true,
  push_messages BOOLEAN DEFAULT true,
  push_proposals BOOLEAN DEFAULT true,

  -- Display Preferences
  theme TEXT DEFAULT 'system', -- 'light', 'dark', 'system'
  compact_mode BOOLEAN DEFAULT false,
  show_pricing BOOLEAN DEFAULT true, -- Show trade pricing
  default_currency TEXT DEFAULT 'USD',

  -- Business Settings (for designers)
  default_markup DECIMAL(5,2) DEFAULT 30.00, -- Default markup percentage
  auto_accept_leads BOOLEAN DEFAULT false,
  lead_response_hours INTEGER DEFAULT 24,

  -- Privacy
  profile_visible BOOLEAN DEFAULT true,
  show_in_directory BOOLEAN DEFAULT true,

  -- Timestamps
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- RLS
ALTER TABLE user_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their settings" ON user_settings
  FOR ALL USING (auth.uid() = user_id);

-- ═══════════════════════════════════════════════════════════════════════════
-- UPDATED_AT TRIGGERS
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply triggers
CREATE TRIGGER update_leads_updated_at BEFORE UPDATE ON leads
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_designer_clients_updated_at BEFORE UPDATE ON designer_clients
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_proposals_updated_at BEFORE UPDATE ON proposals
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_proposal_items_updated_at BEFORE UPDATE ON proposal_items
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_user_settings_updated_at BEFORE UPDATE ON user_settings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
