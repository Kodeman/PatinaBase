-- ═══════════════════════════════════════════════════════════════════════════
-- 00214 — coordination_item_revisions: Submittal Rev-N history (Track 5, R48)
--
-- A submittal's life is a back-and-forth: the vendor sends Rev 1, the designer
-- says "revise & resubmit", the vendor sends Rev 2, … until the designer
-- approves a revision and releases fabrication. Modeling this as STATUS churn on
-- client_decisions would make the 00171 guard police a revision dance and would
-- lose the per-rev attachment history. Instead each round is a CHILD ROW here;
-- the item stays status='pending' the whole time (R48) — the 00171 guard never
-- sees the churn, and "revise & resubmit" is a clean INSERT, not a status flip.
--
-- R48: a (tracked) vendor's resubmit = a new revision row (status 'submitted');
-- only the designer sets a revision 'approved' and resolves the item (which
-- releases fabrication via the resolve cascade). Both moves are designer-recorded
-- in v1 (R46) and go through the SECURITY DEFINER resolve RPC (00218) — there is
-- deliberately NO broad authenticated INSERT/UPDATE policy here.
--
-- RLS mirrors decision_events (00171): the owning designer and the addressed
-- client may READ a revision's history for transparency. Writes are RPC-only.
--
-- Additive only (D7): CREATE TABLE / INDEX IF NOT EXISTS. Nothing existing
-- changes. attachments reuses the comms_messages ≤4 JSONB-array contract (00101).
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.coordination_item_revisions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  decision_id   UUID NOT NULL
                  REFERENCES public.client_decisions(id) ON DELETE CASCADE,
  rev_number    INTEGER NOT NULL,
  status        TEXT NOT NULL DEFAULT 'submitted'
                  CHECK (status IN ('submitted', 'approved', 'rejected', 'revise_resubmit')),
  attachments   JSONB NOT NULL DEFAULT '[]'::jsonb,
  note          TEXT,
  submitted_by  UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_by   UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at   TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- one Rev-N per item (DB-enforced; the resolve RPC computes the next number).
  CONSTRAINT coordination_item_revisions_unique_rev
    UNIQUE (decision_id, rev_number),

  -- attachments JSON must be an array, capped at 4 (mirrors comms_messages 00101).
  CONSTRAINT coordination_item_revisions_attachments_array
    CHECK (jsonb_typeof(attachments) = 'array'),
  CONSTRAINT coordination_item_revisions_attachment_count
    CHECK (jsonb_array_length(attachments) <= 4)
);

COMMENT ON TABLE public.coordination_item_revisions IS
  'Track 5 submittal Rev-N history (R48). One row per round of a submittal: the '
  'item stays client_decisions.status=''pending'' across the whole back-and-forth '
  '(so the 00171 guard never sees revision churn). A vendor resubmit is a new '
  'row (status submitted); the designer approves a row (status approved) then '
  'resolves the item, releasing fabrication. Write-path is RPC-only (00218).';

-- Latest-rev-first scan (the sheet shows newest revision on top).
CREATE INDEX IF NOT EXISTS idx_coordination_item_revisions_decision
  ON public.coordination_item_revisions(decision_id, rev_number DESC);

-- ═══════════════════════════════════════════════════════════════════════════
-- RLS — read scope mirrors decision_events (00171): owning designer + addressed
-- client may read. INSERT/UPDATE are SECURITY DEFINER (00218) only — no broad
-- write policy (acts funnel through resolve_coordination_item, R48).
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.coordination_item_revisions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS coordination_item_revisions_designer_select
  ON public.coordination_item_revisions;
CREATE POLICY coordination_item_revisions_designer_select
  ON public.coordination_item_revisions FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.client_decisions cd
      JOIN public.designer_clients dc ON dc.id = cd.designer_client_id
      WHERE cd.id = coordination_item_revisions.decision_id
        AND dc.designer_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS coordination_item_revisions_client_select
  ON public.coordination_item_revisions;
CREATE POLICY coordination_item_revisions_client_select
  ON public.coordination_item_revisions FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.client_decisions cd
      JOIN public.designer_clients dc ON dc.id = cd.designer_client_id
      WHERE cd.id = coordination_item_revisions.decision_id
        AND dc.client_id = auth.uid()
    )
  );

-- INSERT / UPDATE are RPC-only (SECURITY DEFINER). No authenticated write policy.

GRANT SELECT ON public.coordination_item_revisions TO authenticated;
GRANT ALL ON public.coordination_item_revisions TO service_role;
