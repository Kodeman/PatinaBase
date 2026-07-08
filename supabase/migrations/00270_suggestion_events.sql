-- ═══════════════════════════════════════════════════════════════════════════
-- 00270 — suggestion_events  (Schedule & Boards Wave 3 · Track A — Designer-Taught)
--
-- The receipts of Designer-Taught Intelligence. Every taught suggestion the
-- designer is shown, accepts (swaps / composes a Decision), or dismisses is one
-- row here — a training signal from the designer's own hand, keyed to the
-- surface it fired on (a flagged proposal line, or a board's "more like this"
-- rail). Nothing in this wave reads them back for ranking yet; they are written
-- now so the loop has a corpus to learn from, and are indexed for the
-- per-designer / per-product reads a later ranking pass will run.
--
-- Also here: item_feedback.decision_id — the back-reference written when a
-- designer escalates a flagged line to a client Decision (C4, via 00271's
-- escalate_item_feedback_to_decision). A nullable FK, SET NULL on decision
-- delete, so a flag survives its escalation being torn down.
--
-- Additive only (D7). designer-own RLS; never client- or anon-readable. No
-- functions in this migration.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── item_feedback.decision_id — C4 escalation back-reference ─────────────────
ALTER TABLE public.item_feedback
  ADD COLUMN IF NOT EXISTS decision_id UUID
    REFERENCES public.client_decisions(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.item_feedback.decision_id IS
  'Set when a designer escalates this flagged line to a client Decision (00271 '
  'escalate_item_feedback_to_decision). The flag stays open — the Decision is the '
  'consequential instrument that answers it. SET NULL if the Decision is deleted.';

CREATE INDEX IF NOT EXISTS idx_item_feedback_decision
  ON public.item_feedback(decision_id) WHERE decision_id IS NOT NULL;

-- ── suggestion_events — the taught-intelligence training log ─────────────────
CREATE TABLE IF NOT EXISTS public.suggestion_events (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- The designer whose corpus this signal belongs to. Pinned to auth.uid() by
  -- the INSERT policy.
  designer_id  UUID NOT NULL DEFAULT auth.uid()
                 REFERENCES auth.users(id) ON DELETE CASCADE,
  context      TEXT NOT NULL CHECK (context IN ('line_alternatives', 'board_rail')),
  action       TEXT NOT NULL CHECK (action  IN ('shown', 'accepted', 'dismissed')),
  -- The suggested product (what was shown / acted on).
  product_id   UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  -- Surface anchors. At most one is meaningful, matching context; both nullable
  -- (a shown batch may precede any durable anchor). context is authoritative.
  feedback_id  UUID REFERENCES public.item_feedback(id)   ON DELETE CASCADE,
  board_id     UUID REFERENCES public.proposal_boards(id) ON DELETE CASCADE,
  -- The rank the suggestion held in the shortlist when the event fired (0-based).
  rank         INTEGER,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.suggestion_events IS
  'Append-only receipts of Designer-Taught Intelligence: every taught suggestion '
  'shown / accepted / dismissed, keyed to its surface (line_alternatives | '
  'board_rail). A per-designer training corpus for the ranking loop. designer-own '
  'RLS; never client- or anon-readable.';

-- Corpus reads a later ranking pass will run: a designer's recent signals, and
-- their per-product accept/dismiss history (the boost/penalty lookup).
CREATE INDEX IF NOT EXISTS idx_suggestion_events_designer
  ON public.suggestion_events(designer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_suggestion_events_designer_product
  ON public.suggestion_events(designer_id, product_id, action);
CREATE INDEX IF NOT EXISTS idx_suggestion_events_feedback
  ON public.suggestion_events(feedback_id) WHERE feedback_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_suggestion_events_board
  ON public.suggestion_events(board_id) WHERE board_id IS NOT NULL;

-- ── RLS: designer-own, append-only ───────────────────────────────────────────
ALTER TABLE public.suggestion_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS suggestion_events_designer_insert ON public.suggestion_events;
CREATE POLICY suggestion_events_designer_insert
  ON public.suggestion_events FOR INSERT
  TO authenticated
  WITH CHECK (designer_id = auth.uid());

DROP POLICY IF EXISTS suggestion_events_designer_select ON public.suggestion_events;
CREATE POLICY suggestion_events_designer_select
  ON public.suggestion_events FOR SELECT
  TO authenticated
  USING (designer_id = auth.uid());

-- No UPDATE / DELETE policy — the log is append-only; a designer may only add to
-- and read her own signals.

GRANT SELECT, INSERT ON public.suggestion_events TO authenticated;
GRANT ALL           ON public.suggestion_events TO service_role;
