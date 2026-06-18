-- ═══════════════════════════════════════════════════════════════════════════
-- 00223 — leads.source (Track 6, ruling R65)
--
-- The Desk's "＋ Capture a lead" front door asks "Where from" as free text with
-- quick suggestion chips (Referral · Website / style quiz · Instagram · Past
-- client · …). Storing the chosen value in a real column — not folded into the
-- Brief one-liner — keeps People's pipeline-conversion and referral-rate stats
-- clean despite the free entry.
--
-- Purely additive (D7): a new NULLable column. The old `/portal/leads`
-- AddLeadDialog never sets it (stays NULL there); RLS is inherited from the
-- `leads` table (no policy change). No backfill — historical leads stay NULL.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.leads
  add column if not exists source text;

comment on column public.leads.source is
  'Track 6 R65 — where the lead came from: a canonical chip label (Referral, '
  'Instagram, Past client, …) when a chip is chosen, or free text otherwise. '
  'Powers People pipeline-conversion / referral-rate stats. NULL for leads '
  'captured before this column or via the legacy portal dialog.';
