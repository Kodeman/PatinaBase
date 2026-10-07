-- ═══════════════════════════════════════════════════════════════════════════
-- 00727 — "Ask the maker for a date" lands as a procurement draft
--         (US-19 FR1 F2/F7, rulings R37 + R42; SQ-506)
-- ═══════════════════════════════════════════════════════════════════════════
-- The install reading's `Hold for review` held its note on the agent queue
-- (`maker_eta_request`, SQ-497). Studio members cannot read agent_tasks
-- (agent_tasks_select_admin), so the held note reached no one (SQ-501 F3). R37
-- moves it onto procurement_drafts (00706), the studio's own review-and-send
-- path: Desk drafts and DraftReview already read it, procurement-draft-send
-- sends it only on a member's press, and nothing else acts on a new row (the
-- only trigger is set_updated_at; the 00720 sweep touches `sending` rows only).
--
-- ── WHAT THIS ADDS ──────────────────────────────────────────────────────────
-- procurement_drafts.kind      gains 'maker_eta_request'.
-- procurement_drafts.ffe_item_id  the line a note asks about. A line with no PO
--   still holds a project-level draft, so the line is the draft's subject.
--   ON DELETE SET NULL: a sent letter outlives a deleted line.
-- One open note per line: a partial unique index over awaiting_review and
--   sending. Two presses (or two members) at once file one; the second insert
--   fails 23505 and the route answers 409 with the open row.
--
-- The row is written by /api/document/ask-maker-date with the service role,
-- after the caller's own RLS read of the line (can_buy_for_project). The table
-- keeps its SELECT-only grant to authenticated; no function, grant or policy
-- changes here, so seed/00-legacy-grants.sql needs no regeneration.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.procurement_drafts
  ADD COLUMN IF NOT EXISTS ffe_item_id uuid
    REFERENCES public.project_ffe_items(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.procurement_drafts.ffe_item_id IS
  'The FF&E line a draft is about (00727): set on maker_eta_request, the install reading''s '
  '"Ask the maker for a date". Null on the PO-, shipment- and exception-level kinds.';

ALTER TABLE public.procurement_drafts DROP CONSTRAINT IF EXISTS procurement_drafts_kind_ck;
ALTER TABLE public.procurement_drafts
  ADD CONSTRAINT procurement_drafts_kind_ck
  CHECK (kind IN ('ack_discrepancy_reply', 'ack_chase', 'receiver_inbound_notice', 'vendor_claim_notice',
                  'client_delay_note', 'client_substitution_note', 'memo_return_note',
                  'maker_eta_request'));

CREATE INDEX IF NOT EXISTS idx_procurement_drafts_ffe_item
  ON public.procurement_drafts (ffe_item_id, created_at DESC)
  WHERE ffe_item_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS procurement_drafts_one_open_maker_eta_request
  ON public.procurement_drafts (ffe_item_id)
  WHERE kind = 'maker_eta_request' AND status IN ('awaiting_review', 'sending');
