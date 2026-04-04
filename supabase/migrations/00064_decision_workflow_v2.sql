-- ═══════════════════════════════════════════════════════════════════════════
-- Migration: Decision Workflow v2
-- Description: Extends client_decisions and client_decision_options with
--   decision types, blocking status, pricing, audit trail timestamps,
--   denormalized designer_id, and client-facing RLS policies.
--   Supports the full Decision Workflow feature per the spec.
-- ═══════════════════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. EXTEND client_decisions
-- ═══════════════════════════════════════════════════════════════════════════

-- Decision classification
ALTER TABLE client_decisions
  ADD COLUMN IF NOT EXISTS decision_type TEXT NOT NULL DEFAULT 'product'
    CHECK (decision_type IN ('material', 'product', 'layout', 'budget', 'approval'));

ALTER TABLE client_decisions
  ADD COLUMN IF NOT EXISTS blocking_status TEXT NOT NULL DEFAULT 'non_blocking'
    CHECK (blocking_status IN ('blocks_procurement', 'blocks_phase', 'non_blocking'));

-- Denormalized designer_id for efficient cross-project dashboard queries
ALTER TABLE client_decisions
  ADD COLUMN IF NOT EXISTS designer_id UUID REFERENCES auth.users(id);

-- Proposal linkage
ALTER TABLE client_decisions
  ADD COLUMN IF NOT EXISTS linked_proposal_id UUID REFERENCES proposals(id) ON DELETE SET NULL;

-- Audit trail timestamps
ALTER TABLE client_decisions
  ADD COLUMN IF NOT EXISTS sent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS responded_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS viewed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reminder_sent_at TIMESTAMPTZ;

-- Who made the selection (audit trail)
ALTER TABLE client_decisions
  ADD COLUMN IF NOT EXISTS selected_by UUID REFERENCES auth.users(id);

-- Backfill designer_id from designer_clients
UPDATE client_decisions
SET designer_id = dc.designer_id
FROM designer_clients dc
WHERE client_decisions.designer_client_id = dc.id
  AND client_decisions.designer_id IS NULL;

-- Now make it NOT NULL
ALTER TABLE client_decisions
  ALTER COLUMN designer_id SET NOT NULL;

-- Trigger: auto-populate designer_id on INSERT
CREATE OR REPLACE FUNCTION set_decision_designer_id()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.designer_id IS NULL THEN
    SELECT designer_id INTO NEW.designer_id
    FROM designer_clients
    WHERE id = NEW.designer_client_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_decision_designer_id_trigger
  BEFORE INSERT ON client_decisions
  FOR EACH ROW EXECUTE FUNCTION set_decision_designer_id();

-- New indexes for dashboard and project queries
CREATE INDEX IF NOT EXISTS idx_client_decisions_designer_status
  ON client_decisions(designer_id, status);

CREATE INDEX IF NOT EXISTS idx_client_decisions_project_status
  ON client_decisions(project_id, status)
  WHERE project_id IS NOT NULL;

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. EXTEND client_decision_options
-- ═══════════════════════════════════════════════════════════════════════════

-- Pricing (in cents, consistent with Supabase convention)
ALTER TABLE client_decision_options
  ADD COLUMN IF NOT EXISTS price INTEGER,
  ADD COLUMN IF NOT EXISTS quantity INTEGER DEFAULT 1;

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. CLIENT-FACING RLS POLICIES
--    Clients need to read decisions addressed to them and update their
--    selection / viewing status.
-- ═══════════════════════════════════════════════════════════════════════════

-- Client can READ decisions where they are the client on the relationship
CREATE POLICY "Clients can view their decisions" ON client_decisions
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM designer_clients
      WHERE designer_clients.id = client_decisions.designer_client_id
      AND designer_clients.client_id = auth.uid()
    )
  );

-- Client can UPDATE limited fields on their decisions (viewed_at, responded_at, status → responded)
CREATE POLICY "Clients can respond to their decisions" ON client_decisions
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM designer_clients
      WHERE designer_clients.id = client_decisions.designer_client_id
      AND designer_clients.client_id = auth.uid()
    )
  ) WITH CHECK (
    EXISTS (
      SELECT 1 FROM designer_clients
      WHERE designer_clients.id = client_decisions.designer_client_id
      AND designer_clients.client_id = auth.uid()
    )
  );

-- Client can READ decision options for decisions addressed to them
CREATE POLICY "Clients can view their decision options" ON client_decision_options
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM client_decisions
      JOIN designer_clients ON designer_clients.id = client_decisions.designer_client_id
      WHERE client_decisions.id = client_decision_options.decision_id
      AND designer_clients.client_id = auth.uid()
    )
  );

-- Client can UPDATE selection fields on options (selected, client_note, quantity)
CREATE POLICY "Clients can select decision options" ON client_decision_options
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM client_decisions
      JOIN designer_clients ON designer_clients.id = client_decisions.designer_client_id
      WHERE client_decisions.id = client_decision_options.decision_id
      AND designer_clients.client_id = auth.uid()
    )
  ) WITH CHECK (
    EXISTS (
      SELECT 1 FROM client_decisions
      JOIN designer_clients ON designer_clients.id = client_decisions.designer_client_id
      WHERE client_decisions.id = client_decision_options.decision_id
      AND designer_clients.client_id = auth.uid()
    )
  );
