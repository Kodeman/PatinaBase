-- ═══════════════════════════════════════════════════════════════════════════
-- 00592 — Atomic invoice claim for time entries + the source vocabulary
--
-- HT-5 (W0): public.claim_time_entries(p_invoice_id, p_entry_ids) replaces the
-- portal's read-modify-write claim, whose partial-conflict compensation ran
-- `update({invoice_id:null}).eq('invoice_id', invoiceId)` — detaching EVERY
-- entry the invoice already carried, not only the ones just stamped. One
-- statement stamps only still-unbilled, billable, authorized rows; the caller
-- detects a partial claim by counting the returned ids and rolls the
-- transaction back. No compensating UPDATE exists any more.
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
  'exists yet (00592 buys the vocabulary once). A field_visit, field_manual, '
  'command_bar or manual_entry row is always COMPLETED — duration_minutes > 0, '
  'never a running timer (the one-running-timer slot stays with the desk, HT-7).';

-- Postcondition: the constraint is keyed on `source` (conkey, not a text
-- match — Postgres canonicalizes `source IN (...)` to `source = ANY (ARRAY…)`,
-- so "(source)" never appears in the definition text) and admits all nine
-- values. Same shape as 00545's check, extended to the new vocabulary.
DO $constraint_definition_check$
DECLARE
  v_def text;
  v_val text;
BEGIN
  SELECT pg_get_constraintdef(oid) INTO v_def
  FROM pg_constraint
  WHERE conrelid = 'public.project_time_entries'::regclass
    AND contype = 'c'
    AND conname = 'project_time_entries_source_ck'
    AND conkey = ARRAY[(
      SELECT attnum FROM pg_attribute
       WHERE attrelid = 'public.project_time_entries'::regclass
         AND attname = 'source'
    )];

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
     AND (billing_state = 'authorized' OR billing_state IS NULL)
  RETURNING id;
$$;
REVOKE EXECUTE ON FUNCTION public.claim_time_entries(uuid, uuid[]) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.claim_time_entries(uuid, uuid[]) TO authenticated;

COMMENT ON FUNCTION public.claim_time_entries(uuid, uuid[]) IS
  'Stamps invoice_id on the subset of p_entry_ids still unbilled, billable and '
  'authorized, returning the ids actually claimed. A caller that receives fewer '
  'ids than it asked for must roll the transaction back — there is deliberately '
  'no compensating UPDATE (the one that shipped in the portal detached the whole '
  'invoice).';

COMMIT;
