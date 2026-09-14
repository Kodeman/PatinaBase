-- ═══════════════════════════════════════════════════════════════════════════
-- 00617 — an hour NOTHING priced never reaches an invoice (MS-01, HT-3-a,
--         HT-26)
--
-- ── THE DEFECT (integration round 1, measured end to end twice through RLS) ─
-- An hour whose rate resolves rate_source='none' on a NON-SERVICES project is
-- classified billing_state='authorized' by 00601's non-services branch, which
-- sets hourly_rate_cents := v_rate_cents (NULL) and whose rated_amount_cents
-- CASE has no ELSE (also NULL). Every other eligibility test then admits it:
-- it is billable, un-invoiced, has a duration, and is 'authorized'. So
-- project_unbilled_time COALESCEd both columns to 0 and the invoice composer
-- offered the row as "$0.00/h · $0.00" — tickable, swept in by "tick all",
-- seeded from the Hours ledger's hand-off, stamped by claim_time_entries, and
-- then frozen by the 00177 invoiced lock.
--
-- Measured twice: (i) a legacy project with studio_id IS NULL, and (ii) the same
-- project with studio_id stamped but the studio holding no rate-card row for the
-- member — i.e. EVERY studio that has not yet filled its rate card. These are
-- NEW rows logged after the push, on exactly the projects HT-3-g's cost notes
-- (i)/(ii)/(v) deliberately leave NULL, so P-4 does not apply and HT-6-a (which
-- measured the EXISTING Strata population) does not cover them.
--
-- The composer could not filter them even in principle: project_unbilled_time
-- exposed NO rate_source column at all (information_schema count = 0). HT-3-a
-- ("the composer, not the resolver, is where a none row must be kept off an
-- invoice") and HT-26 ("an unresolved rate prints rate pending instead of a
-- blank") were both built in the Hours ledger and on Patina Field — neither at
-- the one surface that turns an hour into money.
--
-- ── WHAT THIS FILE DOES ────────────────────────────────────────────────────
--  1. project_unbilled_time carries te.rate_source and te.rate_role, so the
--     composer can tell a genuinely $0.00 hour from an hour nothing priced.
--     Both columns are APPENDED LAST, which is what lets CREATE OR REPLACE VIEW
--     hold.
--  2. claim_time_entries refuses rate_source = 'none' — the server backstop no
--     caller can do by hand, under HT-3-a's composer-side refusal.
--
-- WHY A SEPARATE NUMBER rather than an edit to 00596 and 00595 in place:
-- `project_time_entries.rate_source` does not exist until 00600. Both bodies
-- live at numbers BELOW it, so neither can name the column (measured — a
-- `db reset` with the predicate folded into 00595 fails
-- `column "rate_source" does not exist (SQLSTATE 42703)` at 00595 statement 4).
-- 00617 was left deliberately unused by this program and is the first free
-- number after the whole rate chain (00598-00601, 00615, 00616) exists.
--
-- Lineage:
--   public.project_unbilled_time  00177:97 → 00412:2671 → 00596:45 → 00617
--   public.claim_time_entries     00595:135 → 00617
-- Both bodies below are the head bodies VERBATIM (re-read this session) with the
-- delta grafted; every 00596 invariant is kept and re-asserted below — the
-- absent profiles join, the surviving projects join, and the absence of the two
-- legacy rate legs.
--
-- P-4: no historical row is touched. There is no backfill. A pre-00600 legacy
-- row carries rate_source NULL and a real snapshot, and `IS DISTINCT FROM` keeps
-- it claimable — the same line the ledger, the CSV export and the composer all
-- draw between "legacy" and "pending".
--
-- Adds no GRANT/REVOKE beyond restating claim_time_entries' own (unchanged)
-- ACL, which CREATE OR REPLACE FUNCTION preserves; the generated
-- seed/00-legacy-grants.sql is regenerated anyway.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─── 1. the view carries the provenance ────────────────────────────────────

CREATE OR REPLACE VIEW public.project_unbilled_time
WITH (security_invoker = true) AS
SELECT
  te.id, te.project_id, te.phase_key, te.task_id, te.user_id, te.started_at,
  te.duration_minutes, te.notes,
  COALESCE(te.hourly_rate_cents, 0) AS resolved_rate_cents,
  COALESCE(te.rated_amount_cents,
    round(te.duration_minutes / 60.0 * COALESCE(te.hourly_rate_cents, 0))::int
  ) AS amount_cents,
  te.billing_authority_id, te.authority_rate_id, te.billing_state,
  -- 00617 delta. Appended LAST; nothing above it moves, so CREATE OR REPLACE
  -- VIEW holds. rate_role rides along because the composer's "rate pending" line
  -- is also the studio's cue to fill the rate card, and the role is what tells
  -- her WHICH card row is missing.
  te.rate_source, te.rate_role
FROM public.project_time_entries te
-- The projects join selects nothing and is NOT dead: it is the only thing that
-- keeps a project-less internal-time row (W4's nullable project_id) out of this
-- view. Do not tidy it away. profiles is joined NOT AT ALL — see 00596's banner.
JOIN public.projects p ON p.id = te.project_id
WHERE te.invoice_id IS NULL AND te.billable
  AND te.duration_minutes IS NOT NULL AND te.billing_state = 'authorized';

COMMENT ON VIEW public.project_unbilled_time IS
  'Completed, billable, authorized, un-invoiced entries with ONE rate source: '
  'the classifier-owned snapshot on the row (te.hourly_rate_cents / '
  'te.rated_amount_cents). resolved_rate_cents is the rate that priced '
  'amount_cents — never a second chain (00596, HT-6). rate_source and rate_role '
  'are carried (00617) so the invoice composer can tell a genuinely $0.00 hour '
  'from an hour NOTHING PRICED: rate_source = ''none'' is HT-26''s "rate '
  'pending", must never be tickable, and claim_time_entries refuses it '
  'server-side. profiles is NOT joined at all: security_invoker applies the '
  'caller''s profiles RLS to any such join and the inner join this view used to '
  'carry silently dropped entries from the unbilled balance, while selecting '
  'nothing. The projects join stays — it is what keeps project-less internal '
  'time out of this view.';

-- ─── 2. the server backstop on the claim ───────────────────────────────────
-- Grafted from 00595:135-150 verbatim; one predicate added.

CREATE OR REPLACE FUNCTION public.claim_time_entries(
  p_invoice_id uuid,
  p_entry_ids  uuid[]
) RETURNS SETOF uuid
LANGUAGE sql
SECURITY INVOKER            -- RLS is the authorization spine; no DEFINER, no assert needed
SET search_path = public, pg_temp
AS $$
  UPDATE public.project_time_entries
     SET invoice_id = p_invoice_id
   WHERE id = ANY(p_entry_ids)
     AND invoice_id IS NULL
     AND billable
     AND duration_minutes IS NOT NULL
     AND (billing_state = 'authorized' OR billing_state IS NULL)
     -- 00617 (MS-01): an hour NOTHING priced never reaches an invoice, whatever
     -- a caller sends. IS DISTINCT FROM, not <>: a NULL rate_source is a
     -- pre-00600 legacy row carrying a real snapshot and stays claimable.
     AND rate_source IS DISTINCT FROM 'none'
  RETURNING id;
$$;
REVOKE EXECUTE ON FUNCTION public.claim_time_entries(uuid, uuid[]) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.claim_time_entries(uuid, uuid[]) TO authenticated;

COMMENT ON FUNCTION public.claim_time_entries(uuid, uuid[]) IS
  'Stamps invoice_id on the subset of p_entry_ids still unbilled, billable, '
  'COMPLETED (duration_minutes IS NOT NULL), authorized and PRICED '
  '(rate_source IS DISTINCT FROM ''none'' — an hour nothing priced is HT-26''s '
  '"rate pending" and is never invoiceable, 00617/MS-01), returning the ids '
  'actually claimed. A caller that receives fewer ids than it asked for must '
  'delete the draft invoice it just created, which releases the partial stamp '
  'through fk_time_entries_invoice''s ON DELETE SET NULL (00178:211-212) — there '
  'is NO transaction to roll back (PostgREST gives this RPC its own) and '
  'deliberately no compensating UPDATE (the one that shipped in the portal '
  'detached the whole invoice). A RUNNING timer is '
  'never claimable: invoicing one would freeze duration_minutes under '
  'guard_invoiced_time_entry (00177:51-84) while the per-user running-timer index '
  '(00177:37-41) ignores invoice_id, wedging the member''s one timer slot for '
  'good. p_invoice_id is NOT validated here — aad_guard_time_entry_invoice_'
  'authority_trg (00412:2653-2657) is the invoice-aiming guard and raises unless '
  'the invoice is a draft on the same project.';

-- ─── postconditions ────────────────────────────────────────────────────────
DO $postcondition$
DECLARE
  v_def text;
BEGIN
  SELECT pg_get_viewdef('public.project_unbilled_time'::regclass, true) INTO v_def;

  -- 00596's four structural invariants, re-asserted because this file rewrites
  -- the body they were proved on.
  IF v_def LIKE '%change_order_terms%' THEN
    RAISE EXCEPTION
      'time-entry migration: project_unbilled_time still reads change_order_terms as a rate leg';
  END IF;
  IF v_def LIKE '%default_hourly_rate_cents%' THEN
    RAISE EXCEPTION
      'time-entry migration: project_unbilled_time still reads profiles.default_hourly_rate_cents as a rate leg';
  END IF;
  IF v_def LIKE '%JOIN profiles%' THEN
    RAISE EXCEPTION
      'time-entry migration: project_unbilled_time must not join profiles at all, got %', v_def;
  END IF;
  IF v_def NOT LIKE '%JOIN projects%' THEN
    RAISE EXCEPTION
      'time-entry migration: project_unbilled_time must keep its projects join (the project_id IS NULL filter), got %', v_def;
  END IF;

  -- 00617's own: the two provenance columns, asserted on the CATALOG rather than
  -- on the view text, so a later hand cannot drop them and leave the composer
  -- offering $0.00 lines again.
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'project_unbilled_time'
      AND column_name = 'rate_source'
  ) OR NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'project_unbilled_time'
      AND column_name = 'rate_role'
  ) THEN
    RAISE EXCEPTION
      'time-entry migration: project_unbilled_time must expose rate_source and rate_role — without them the invoice composer cannot keep a rate-pending hour off an invoice (MS-01, HT-3-a, HT-26)';
  END IF;

  -- And the claim must carry the backstop.
  IF pg_get_functiondef('public.claim_time_entries(uuid,uuid[])'::regprocedure)
       !~ 'rate_source IS DISTINCT FROM ''none'''
  THEN
    RAISE EXCEPTION
      'time-entry migration: claim_time_entries must refuse rate_source = ''none'' — the composer''s refusal is the surface, this is the backstop no caller can do by hand (MS-01)';
  END IF;

  -- The ACL 00595 set is unchanged (CREATE OR REPLACE FUNCTION preserves it).
  IF has_function_privilege('anon', 'public.claim_time_entries(uuid,uuid[])', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.claim_time_entries(uuid,uuid[])', 'EXECUTE')
  THEN
    RAISE EXCEPTION
      'time-entry migration: claim_time_entries must stay revoked from anon and granted to authenticated (00595)';
  END IF;
END
$postcondition$;

COMMIT;
