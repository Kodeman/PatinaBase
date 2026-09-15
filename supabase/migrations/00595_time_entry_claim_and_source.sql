-- ═══════════════════════════════════════════════════════════════════════════
-- 00595 — Atomic invoice claim for time entries + the source vocabulary
--
-- HT-5 (W0): public.claim_time_entries(p_invoice_id, p_entry_ids) replaces the
-- portal's read-modify-write claim, whose partial-conflict compensation ran
-- `update({invoice_id:null}).eq('invoice_id', invoiceId)` — detaching EVERY
-- entry the invoice already carried, not only the ones just stamped. One
-- statement stamps only still-unbilled, billable, authorized, COMPLETED rows;
-- the caller detects a partial claim by counting the returned ids.
--
-- What "the caller compensates" means, precisely (corrected in review round 2,
-- finding m5): there is NO transaction for the caller to roll back. PostgREST
-- gives the RPC its own transaction, so a short return means the matching rows
-- ARE stamped by the time the hook throws. The composer therefore deletes the
-- draft invoice it had just created, and fk_time_entries_invoice
-- (00178:211-212) is ON DELETE SET NULL, so deleting the draft releases the
-- partial stamp. Both BEFORE-UPDATE guards permit that detach:
-- guard_invoiced_time_entry (00177:51-84) allows an invoice_id-only change and
-- guard_time_entry_invoice_authority (00412) returns early on
-- NEW.invoice_id IS NULL. No compensating UPDATE exists any more — the one that
-- shipped detached every entry the invoice already carried.
--
-- `duration_minutes IS NOT NULL` is load-bearing, not tidiness: a running timer
-- on a non-services project is billable + billing_state 'authorized'
-- (00578:2648-2650), so without it the RPC could invoice a RUNNING row. The
-- invoiced lock (00177:51-84) would then freeze duration_minutes — the timer
-- could neither be stopped nor discarded — while the per-user running-timer
-- index (00177:37-41) ignores invoice_id, so the member could never start
-- another timer. No shipped caller reaches it (the composer's ids come from
-- project_unbilled_time, which already filters completed rows), so this closes
-- the hole on a newly-exposed authenticated surface rather than a live bug.
--
-- Source vocabulary: project_time_entries_source_ck (named by 00545:148) is
-- widened from four values to nine — 'command_bar' (the ⌘K verb), 'field_manual'
-- and 'internal' (live in this program), plus 'widget' and 'intent' reserved so
-- a later surface costs no constraint archaeology. The 00198 constraint was
-- unnamed; 00545 paid that cost once and named it, so this file widens by name.
--
-- Lineage: no function is redefined here (claim_time_entries is new).
-- Reconciles: nothing — additive to project_time_entries (plan-v2 §0.1).
-- The invoiced-entry lock (00177:51-84) and aad_guard_time_entry_invoice_
-- authority_trg (00412:2653-2657) are untouched and still fire per row.
--
-- Renumbered 00592 -> 00595 before merge: 00592-00594 were taken by the
-- people-room CRM program (branch build/people-room-crm-2026-09-11, commit
-- 1970075c2), cut from the same head 00591 on the same day. This program is
-- the undeployed side and so it moved (patina-db-migrations step 8).
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─── 1. The source vocabulary ───────────────────────────────────────────────

ALTER TABLE public.project_time_entries
  DROP CONSTRAINT IF EXISTS project_time_entries_source_ck,
  ADD CONSTRAINT project_time_entries_source_ck CHECK (
    source IN (
      'timer_auto', 'timer_manual', 'manual_entry', 'field_visit',
      'command_bar', 'field_manual', 'internal', 'widget', 'intent'
    )
  );

COMMENT ON COLUMN public.project_time_entries.source IS
  'timer_auto = document spine timer (D11) · timer_manual = header TimerButton '
  '· manual_entry = typed in · field_visit = offered by Patina Field''s visit '
  'review when a visit closes · command_bar = the ⌘K "Log time" verb with '
  'nothing in hand · field_manual = Patina Field''s LogTimeSheet (an hour that '
  'is not a visit) · internal = studio/admin time with no project · widget and '
  'intent = RESERVED for a home-screen widget and an App Intent; no writer '
  'exists yet (00595 buys the vocabulary once). A field_visit, field_manual, '
  'command_bar or manual_entry row is always COMPLETED — duration_minutes > 0, '
  'never a running timer (the one-running-timer slot stays with the desk, HT-7).';

-- Postcondition: the constraint is keyed on `source` (conkey, not a text
-- match — Postgres canonicalizes `source IN (...)` to `source = ANY (ARRAY…)`,
-- so "(source)" never appears in the definition text), admits all nine
-- values, and is the ONLY CHECK keyed on that column. Same shape as 00545's
-- check, extended to the new vocabulary.
DO $constraint_definition_check$
DECLARE
  v_attnum smallint;
  v_count  integer;
  v_def    text;
  v_val    text;
BEGIN
  SELECT attnum INTO v_attnum FROM pg_attribute
   WHERE attrelid = 'public.project_time_entries'::regclass
     AND attname = 'source';

  -- Widening by name is only provably EFFECTIVE if no OTHER CHECK also keys on
  -- `source` and still carries the narrow list — 00545's own F4 comment warns
  -- about exactly that shape. 00545 paid the archaeology (it dropped every
  -- source CHECK mentioning timer_manual + manual_entry before adding the named
  -- one) and nothing between 00545 and 00591 touches `source`, so this asserts
  -- the fact rather than assuming it. Strata was NOT probed for this: the assert
  -- is what will probe it, at push time (review round 2, finding n6).
  SELECT count(*) INTO v_count
  FROM pg_constraint
  WHERE conrelid = 'public.project_time_entries'::regclass
    AND contype = 'c'
    AND conkey = ARRAY[v_attnum];

  IF v_count <> 1 THEN
    RAISE EXCEPTION
      'time-entry migration: expected exactly ONE CHECK keyed on project_time_entries.source, found % — a second narrow CHECK would veto the widened vocabulary',
      v_count;
  END IF;

  SELECT pg_get_constraintdef(oid) INTO v_def
  FROM pg_constraint
  WHERE conrelid = 'public.project_time_entries'::regclass
    AND contype = 'c'
    AND conname = 'project_time_entries_source_ck'
    AND conkey = ARRAY[v_attnum];

  IF v_def IS NULL THEN
    RAISE EXCEPTION
      'time-entry migration: project_time_entries_source_ck is missing or is not keyed on the source column';
  END IF;

  FOREACH v_val IN ARRAY ARRAY['timer_auto', 'timer_manual', 'manual_entry',
    'field_visit', 'command_bar', 'field_manual', 'internal', 'widget', 'intent']
  LOOP
    IF v_def NOT LIKE '%''' || v_val || '''%' THEN
      RAISE EXCEPTION
        'time-entry migration: project_time_entries_source_ck does not admit %, got %',
        v_val, v_def;
    END IF;
  END LOOP;
END
$constraint_definition_check$;

-- ─── 2. The atomic claim ────────────────────────────────────────────────────

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
  RETURNING id;
$$;
REVOKE EXECUTE ON FUNCTION public.claim_time_entries(uuid, uuid[]) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.claim_time_entries(uuid, uuid[]) TO authenticated;

COMMENT ON FUNCTION public.claim_time_entries(uuid, uuid[]) IS
  'Stamps invoice_id on the subset of p_entry_ids still unbilled, billable, '
  'COMPLETED (duration_minutes IS NOT NULL) and authorized, returning the ids '
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

COMMIT;
