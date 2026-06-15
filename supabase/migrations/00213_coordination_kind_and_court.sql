-- ═══════════════════════════════════════════════════════════════════════════
-- 00213 — client_decisions generalize: coordination_kind + court (Track 5)
--
-- An RFI / Submittal / Sign-off / Punch IS a decision with an owner. Rather than
-- fork a parent table (which would clone the 00171 status guard + decision_events
-- audit, client_decision_options, the margin branch, and the resolve RPC — the
-- opposite of one-act-many-surfaces), we widen client_decisions in place with a
-- NEW ORTHOGONAL axis.
--
-- coordination_kind is the THIRD orthogonal axis on this table:
--   · decision_type (00064/00084: material|color|product|layout|substitution|
--     budget|approval)  — UNTOUCHED. Subject matter of a selection.
--   · decision_kind (00202: choice|approval)                      — UNTOUCHED.
--     The shipped section-gate axis.
--   · coordination_kind (NEW: selection|rfi|submittal|signoff|punch) — the
--     WORKFLOW SHAPE (has options? has an answer? carries revisions?).
-- We do NOT touch the decision_type or decision_kind CHECKs.
--
-- court is the ball-in-court: whose move it is right now (designer|client|gc|
-- vendor). court_party_id points the gc/vendor courts at a concrete
-- project_parties row (00212) when one exists.
--
-- BACKFILL (additive UPDATE): existing decision_kind='approval' rows become
-- coordination_kind='signoff' — the existing approval gates ARE sign-offs in the
-- coordination grammar. Every NEW column carries a NOT NULL DEFAULT, so the CHECK
-- validates instantly against the default for the entire legacy population; the
-- backfill only re-labels the approval subset. No legacy re-scan of decision_type
-- or decision_kind; neither CHECK is altered.
--
-- Additive only (D7): ADD COLUMN IF NOT EXISTS + CREATE INDEX IF NOT EXISTS.
-- Old zones (the legacy choice/approval decision path) keep working untouched —
-- they simply default to coordination_kind='selection', court='client'.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.client_decisions
  ADD COLUMN IF NOT EXISTS coordination_kind TEXT NOT NULL DEFAULT 'selection'
    CHECK (coordination_kind IN ('selection', 'rfi', 'submittal', 'signoff', 'punch')),
  ADD COLUMN IF NOT EXISTS court TEXT NOT NULL DEFAULT 'client'
    CHECK (court IN ('designer', 'client', 'gc', 'vendor')),
  ADD COLUMN IF NOT EXISTS court_party_id UUID
    REFERENCES public.project_parties(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS answer TEXT,
  ADD COLUMN IF NOT EXISTS answered_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS answered_by UUID
    REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS blocks_kind TEXT NOT NULL DEFAULT 'none'
    CHECK (blocks_kind IN ('none', 'ffe', 'task', 'phase'));

COMMENT ON COLUMN public.client_decisions.coordination_kind IS
  'Track 5: the workflow SHAPE of this open item — selection (option-pick, the '
  'shipped path), rfi (question→answer), submittal (vendor spec → Rev-N review), '
  'signoff (a gate), punch (defect fix). Orthogonal to decision_type and '
  'decision_kind; both of those are UNTOUCHED. Default selection keeps every '
  'legacy decision in its existing behavior.';

COMMENT ON COLUMN public.client_decisions.court IS
  'Track 5 ball-in-court: whose move it is right now (designer|client|gc|vendor). '
  'next_court_for() / resolve_coordination_item shift this as the item moves. '
  'Default client preserves the shipped client-decision posture.';

COMMENT ON COLUMN public.client_decisions.court_party_id IS
  'The project_parties row (00212) the current court points at when court is gc/ '
  'vendor (or a client_rep). NULL for the designer/primary-client courts.';

COMMENT ON COLUMN public.client_decisions.answer IS
  'Track 5 RFI/Punch resolution text — the recorded answer / verification note. '
  'NULL for selection items (their resolution is the selected option).';

COMMENT ON COLUMN public.client_decisions.blocks_kind IS
  'Track 5: what downstream work this item gates — none | ffe (project_ffe_items '
  'blocked_by_decision_id) | task (project_tasks blocked_by_item_id) | phase '
  '(a section/phase gate). Drives the resolve cascade and the "blocks N" line.';

-- Court-grouped scans (the court bar + open-item groups, read model 00219).
CREATE INDEX IF NOT EXISTS idx_client_decisions_coord_kind
  ON public.client_decisions(project_id, coordination_kind, status);

-- "In your court · N" / per-court open counts — only pending items matter.
CREATE INDEX IF NOT EXISTS idx_client_decisions_court_pending
  ON public.client_decisions(project_id, court)
  WHERE status = 'pending';

-- ── Backfill: existing approval gates ARE sign-offs in the coordination grammar.
-- Additive re-label only; touches no other column and no CHECK. Idempotent (a
-- re-run rewrites the same rows to the same value).
UPDATE public.client_decisions
   SET coordination_kind = 'signoff'
 WHERE decision_kind = 'approval'
   AND coordination_kind = 'selection';
