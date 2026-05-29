-- ═══════════════════════════════════════════════════════════════════════════
-- Migration: Designer-created leads
-- Description: Let a designer manually capture an inbound prospect as a lead.
--   Until now the only INSERT policy on `leads` (00014) allowed a homeowner to
--   create their own lead (auth.uid() = homeowner_id), so the designer pipeline
--   could never be populated from the designer side. This adds a designer-side
--   INSERT policy and two optional contact columns for prospects who do not yet
--   have a Patina profile.
-- ═══════════════════════════════════════════════════════════════════════════

-- Allow a designer to create a lead attributed to themselves. homeowner_id must
-- be NULL so a designer cannot fabricate a lead against a real homeowner profile
-- they do not own. This is additive to the 00014 "Homeowners can create leads"
-- policy — multiple permissive INSERT policies are OR'd together, so the future
-- consumer-intake path (homeowner_id = auth.uid()) keeps working unchanged.
CREATE POLICY "Designers can create leads" ON leads
  FOR INSERT
  WITH CHECK (auth.uid() = designer_id AND homeowner_id IS NULL);

-- Capture prospect contact details when there is no homeowner profile yet.
-- These carry onto designer_clients (client_email / client_name, added in 00018)
-- when the designer accepts the lead.
ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS contact_name  TEXT,
  ADD COLUMN IF NOT EXISTS contact_email TEXT;

-- Note: the AFTER INSERT notification triggers from 00042
-- (on_lead_created_notify_designer / on_lead_created_notify_consumer) are
-- already null-safe for a designer-created lead — the consumer trigger returns
-- early when homeowner_id IS NULL, and the designer trigger wraps its network
-- call in EXCEPTION WHEN OTHERS, so neither can block the INSERT. No change
-- required here.
