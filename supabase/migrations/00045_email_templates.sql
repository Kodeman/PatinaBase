-- ═══════════════════════════════════════════════════════════════════════════
-- Migration: Email Templates
-- Description: Metadata layer for email templates. References existing
--              React Email components in packages/email/src/templates/.
-- ═══════════════════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════════════════
-- TEMPLATE CATEGORY ENUM
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TYPE email_template_category AS ENUM (
  'transactional',
  'engagement',
  'campaign',
  'sequence'
);

-- ═══════════════════════════════════════════════════════════════════════════
-- EMAIL TEMPLATES TABLE
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE email_templates (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  category email_template_category NOT NULL,
  subject_default TEXT,
  -- content_blocks: JSONB array describing composable block structure
  -- Each block: { type, props } — rendered by block-renderer at send time
  content_blocks JSONB NOT NULL DEFAULT '[]',
  -- Variables this template accepts (for merge tag UI)
  variables JSONB NOT NULL DEFAULT '[]',
  -- Thumbnail preview URL (optional, for library grid)
  thumbnail_url TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ═══════════════════════════════════════════════════════════════════════════
-- INDEXES
-- ═══════════════════════════════════════════════════════════════════════════

CREATE INDEX idx_email_templates_category ON email_templates(category);
CREATE INDEX idx_email_templates_slug ON email_templates(slug);
CREATE INDEX idx_email_templates_active ON email_templates(is_active);

-- ═══════════════════════════════════════════════════════════════════════════
-- UPDATED_AT TRIGGER
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TRIGGER set_email_templates_updated_at
  BEFORE UPDATE ON email_templates
  FOR EACH ROW
  EXECUTE FUNCTION extensions.moddatetime(updated_at);

-- ═══════════════════════════════════════════════════════════════════════════
-- ROW LEVEL SECURITY
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE email_templates ENABLE ROW LEVEL SECURITY;

-- Service role full access
CREATE POLICY "Service role full access on email_templates" ON email_templates
  FOR ALL USING (auth.uid() IS NULL);

-- Admins can manage templates
CREATE POLICY "Admins can manage email_templates" ON email_templates
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM user_roles ur
      JOIN roles r ON ur.role_id = r.id
      WHERE ur.user_id = auth.uid()
      AND r.domain = 'admin'
    )
  );

-- ═══════════════════════════════════════════════════════════════════════════
-- SEED: Register existing 16 React Email templates
-- ═══════════════════════════════════════════════════════════════════════════

INSERT INTO email_templates (slug, name, description, category, subject_default, variables) VALUES
  -- Transactional
  ('welcome-verification', 'Welcome & Verification', 'Account verification email with welcome message', 'transactional', 'Verify your Patina account', '["first_name", "verification_url"]'),
  ('password-reset', 'Password Reset', 'Password reset link email', 'transactional', 'Reset your password', '["first_name", "reset_url"]'),
  ('security-alert', 'Security Alert', 'Security alert notification', 'transactional', 'Security alert for your account', '["first_name", "alert_type", "alert_details"]'),
  ('order-confirmation', 'Order Confirmation', 'Order confirmation with details', 'transactional', 'Order confirmed', '["first_name", "order_id", "items", "total"]'),
  ('payment-receipt', 'Payment Receipt', 'Payment receipt with breakdown', 'transactional', 'Payment received', '["first_name", "amount", "payment_method"]'),
  ('client-confirmation', 'Client Confirmation', 'Consultation request confirmation', 'transactional', 'Consultation request received', '["first_name", "designer_name", "date"]'),

  -- Engagement
  ('new-lead-designer', 'New Lead (Designer)', 'New lead notification for designers', 'engagement', 'New lead from Patina', '["designer_name", "client_name", "project_type"]'),
  ('lead-expiring', 'Lead Expiring', 'Lead about to expire reminder', 'engagement', 'Lead expiring soon', '["designer_name", "client_name", "expires_in"]'),
  ('weekly-inspiration', 'Weekly Inspiration', 'Weekly curated content digest', 'engagement', 'Your weekly inspiration', '["first_name", "products", "articles"]'),
  ('founding-circle-update', 'Founding Circle Update', 'Exclusive update for founding members', 'engagement', 'Founding Circle update', '["first_name", "update_title"]'),
  ('price-drop', 'Price Drop Alert', 'Wishlist item price reduction', 'engagement', 'Price drop on a saved item', '["first_name", "product_name", "old_price", "new_price"]'),
  ('back-in-stock', 'Back in Stock', 'Previously out-of-stock item available', 'engagement', 'Back in stock', '["first_name", "product_name"]'),

  -- Campaign
  ('campaign-product-launch', 'Product Launch Campaign', 'Announce new product arrivals', 'campaign', NULL, '["headline", "body", "hero_image_url", "products", "cta_text", "cta_url"]'),
  ('campaign-seasonal', 'Seasonal Campaign', 'Seasonal marketing campaign', 'campaign', NULL, '["season", "headline", "body", "hero_image_url", "products", "cta_text", "cta_url"]'),
  ('campaign-maker-spotlight', 'Maker Spotlight Campaign', 'Feature an artisan maker', 'campaign', NULL, '["maker_name", "maker_location", "narrative", "philosophy_quote", "products", "cta_text", "cta_url"]'),
  ('campaign-reengagement', 'Re-engagement Campaign', 'Win back inactive users', 'campaign', NULL, '["headline", "body", "offer_text", "cta_text", "cta_url"]');
