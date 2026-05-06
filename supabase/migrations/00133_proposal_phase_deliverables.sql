-- ═══════════════════════════════════════════════════════════════════════════
-- Migration: proposal_phase_deliverables — first-class deliverable rows
-- Description: Migration 00066 stored deliverables as a `JSONB DEFAULT '[]'`
--              column on `proposal_phases`. The Proposal Builder upgrade
--              (Wave 4) needs:
--                - sortable, individually addressable deliverable rows
--                - per-row "completed" tracking (timestamp + actor)
--                - "is_required" flag so optional deliverables don't block
--                  the deliverables_complete gate
--
--              The legacy JSONB column on proposal_phases is left untouched
--              for now (read-only fallback in the UI). New writes go to this
--              table; the gate-conditions editor surfaces both shapes during
--              the rollout window.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE proposal_phase_deliverables (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phase_id UUID NOT NULL REFERENCES proposal_phases(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  description TEXT NULL,
  is_required BOOLEAN NOT NULL DEFAULT true,
  completed_at TIMESTAMPTZ NULL,
  completed_by UUID NULL REFERENCES profiles(id) ON DELETE SET NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_proposal_phase_deliverables_phase
  ON proposal_phase_deliverables(phase_id);

-- updated_at trigger (helper from earlier migrations)
CREATE TRIGGER trg_proposal_phase_deliverables_updated_at
  BEFORE UPDATE ON proposal_phase_deliverables
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ─── RLS ─────────────────────────────────────────────────────────────────────

ALTER TABLE proposal_phase_deliverables ENABLE ROW LEVEL SECURITY;

-- Designer ownership flows through proposal_phases → proposals.designer_id.

CREATE POLICY "proposal_phase_deliverables_select"
  ON proposal_phase_deliverables FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM proposals p
      JOIN proposal_phases ph ON ph.proposal_id = p.id
      WHERE ph.id = proposal_phase_deliverables.phase_id
        AND p.designer_id = auth.uid()
    )
  );

CREATE POLICY "proposal_phase_deliverables_insert"
  ON proposal_phase_deliverables FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM proposals p
      JOIN proposal_phases ph ON ph.proposal_id = p.id
      WHERE ph.id = proposal_phase_deliverables.phase_id
        AND p.designer_id = auth.uid()
    )
  );

CREATE POLICY "proposal_phase_deliverables_update"
  ON proposal_phase_deliverables FOR UPDATE
  USING (
    EXISTS (
      SELECT 1
      FROM proposals p
      JOIN proposal_phases ph ON ph.proposal_id = p.id
      WHERE ph.id = proposal_phase_deliverables.phase_id
        AND p.designer_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM proposals p
      JOIN proposal_phases ph ON ph.proposal_id = p.id
      WHERE ph.id = proposal_phase_deliverables.phase_id
        AND p.designer_id = auth.uid()
    )
  );

CREATE POLICY "proposal_phase_deliverables_delete"
  ON proposal_phase_deliverables FOR DELETE
  USING (
    EXISTS (
      SELECT 1
      FROM proposals p
      JOIN proposal_phases ph ON ph.proposal_id = p.id
      WHERE ph.id = proposal_phase_deliverables.phase_id
        AND p.designer_id = auth.uid()
    )
  );
