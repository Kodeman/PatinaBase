-- ═══════════════════════════════════════════════════════════════════════════
-- Migration: proposal_phase_gates — structured phase-completion gates
-- Description: Migration 00066 carried a single free-text `gate_condition`
--              column on `proposal_phases`. The Proposal Builder upgrade
--              (Wave 4) replaces it with multi-row, kind-aware gates that
--              the UI can satisfy individually:
--                - client_signature       (artifact-bound signature)
--                - deliverables_complete  (all required deliverables done)
--                - payment_received       (a specific milestone paid)
--                - designer_override      (escape hatch with reason)
--                - prior_phase_signed     (reference to an earlier phase)
--
--              At the end of this migration we backfill any non-empty legacy
--              `gate_condition` text into a single `deliverables_complete`
--              gate per phase. The backfill is idempotent — running this
--              migration twice will not produce duplicates because the
--              insert is guarded by a NOT EXISTS clause.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE proposal_phase_gates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phase_id UUID NOT NULL REFERENCES proposal_phases(id) ON DELETE CASCADE,
  gate_kind TEXT NOT NULL CHECK (gate_kind IN (
    'client_signature',
    'deliverables_complete',
    'payment_received',
    'designer_override',
    'prior_phase_signed'
  )),
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  satisfied_at TIMESTAMPTZ NULL,
  satisfied_by UUID NULL REFERENCES profiles(id) ON DELETE SET NULL,
  override_reason TEXT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_proposal_phase_gates_phase
  ON proposal_phase_gates(phase_id);

CREATE INDEX idx_proposal_phase_gates_unsatisfied
  ON proposal_phase_gates(phase_id)
  WHERE satisfied_at IS NULL;

-- updated_at trigger (helper from earlier migrations)
CREATE TRIGGER trg_proposal_phase_gates_updated_at
  BEFORE UPDATE ON proposal_phase_gates
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ─── RLS ─────────────────────────────────────────────────────────────────────

ALTER TABLE proposal_phase_gates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "proposal_phase_gates_select"
  ON proposal_phase_gates FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM proposals p
      JOIN proposal_phases ph ON ph.proposal_id = p.id
      WHERE ph.id = proposal_phase_gates.phase_id
        AND p.designer_id = auth.uid()
    )
  );

CREATE POLICY "proposal_phase_gates_insert"
  ON proposal_phase_gates FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM proposals p
      JOIN proposal_phases ph ON ph.proposal_id = p.id
      WHERE ph.id = proposal_phase_gates.phase_id
        AND p.designer_id = auth.uid()
    )
  );

CREATE POLICY "proposal_phase_gates_update"
  ON proposal_phase_gates FOR UPDATE
  USING (
    EXISTS (
      SELECT 1
      FROM proposals p
      JOIN proposal_phases ph ON ph.proposal_id = p.id
      WHERE ph.id = proposal_phase_gates.phase_id
        AND p.designer_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM proposals p
      JOIN proposal_phases ph ON ph.proposal_id = p.id
      WHERE ph.id = proposal_phase_gates.phase_id
        AND p.designer_id = auth.uid()
    )
  );

CREATE POLICY "proposal_phase_gates_delete"
  ON proposal_phase_gates FOR DELETE
  USING (
    EXISTS (
      SELECT 1
      FROM proposals p
      JOIN proposal_phases ph ON ph.proposal_id = p.id
      WHERE ph.id = proposal_phase_gates.phase_id
        AND p.designer_id = auth.uid()
    )
  );

-- ─── One-time backfill of legacy gate_condition text ────────────────────────
--
-- For every phase with a non-empty legacy `gate_condition` and no existing
-- gate rows, insert a single `deliverables_complete` gate carrying the
-- legacy text under `payload.legacy_text`. This is the seam the new gate
-- editor uses to render "(legacy)" rows with a "Convert to gate" affordance.
--
-- Idempotent — the NOT EXISTS clause means running the migration a second
-- time (or running this statement twice in the same transaction) produces
-- no additional rows.
INSERT INTO proposal_phase_gates (phase_id, gate_kind, payload)
SELECT ph.id,
       'deliverables_complete',
       jsonb_build_object('legacy_text', ph.gate_condition)
  FROM proposal_phases ph
 WHERE ph.gate_condition IS NOT NULL
   AND ph.gate_condition <> ''
   AND NOT EXISTS (
     SELECT 1
       FROM proposal_phase_gates g
      WHERE g.phase_id = ph.id
   );
