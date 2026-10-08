-- ═══════════════════════════════════════════════════════════════════════════
-- 00728 — "Follow up with the maker" is its own held draft kind
--         (US-19 FR5 530-3, Fix F5-2; SQ-538)
-- ═══════════════════════════════════════════════════════════════════════════
-- 00727 held "Ask the maker for a date" as a procurement draft on its line
-- (kind 'maker_eta_request'). FR4's `Follow up with the maker` composer
-- (SQ-530) held its note through the same route under the same kind, so the
-- Desk, the Movement cell and the route's refusal called a follow-up a date
-- request. The kind is the structured fact the readers need (530-3).
--
-- ── WHAT THIS ADDS ──────────────────────────────────────────────────────────
-- procurement_drafts.kind      gains 'maker_follow_up'.
-- One open maker note per line, across both kinds: 00727's partial unique
--   index widens from 'maker_eta_request' to both maker kinds. A line holding
--   a date request refuses a follow-up and the reverse; the second insert
--   fails 23505 and /api/document/ask-maker-date answers 409 with the open row.
--
-- The row is still written only by /api/document/ask-maker-date with the
-- service role, after the caller's own RLS read of the line. No function,
-- grant or policy changes here, so seed/00-legacy-grants.sql needs no
-- regeneration.
-- ═══════════════════════════════════════════════════════════════════════════

COMMENT ON COLUMN public.procurement_drafts.ffe_item_id IS
  'The FF&E line a draft is about (00727, 00728): set on maker_eta_request (the install reading''s '
  '"Ask the maker for a date") and maker_follow_up ("Follow up with the maker"). Null on the PO-, '
  'shipment- and exception-level kinds.';

ALTER TABLE public.procurement_drafts DROP CONSTRAINT IF EXISTS procurement_drafts_kind_ck;
ALTER TABLE public.procurement_drafts
  ADD CONSTRAINT procurement_drafts_kind_ck
  CHECK (kind IN ('ack_discrepancy_reply', 'ack_chase', 'receiver_inbound_notice', 'vendor_claim_notice',
                  'client_delay_note', 'client_substitution_note', 'memo_return_note',
                  'maker_eta_request', 'maker_follow_up'));

-- One open maker note per line, whichever kind (530-3). Replaces 00727's
-- date-request-only index under a name that says what it now holds.
DROP INDEX IF EXISTS public.procurement_drafts_one_open_maker_eta_request;
CREATE UNIQUE INDEX IF NOT EXISTS procurement_drafts_one_open_maker_note
  ON public.procurement_drafts (ffe_item_id)
  WHERE kind IN ('maker_eta_request', 'maker_follow_up') AND status IN ('awaiting_review', 'sending');
