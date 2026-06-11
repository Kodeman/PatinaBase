-- ============================================================================
-- Migration 00187: FF&E invoice lines + coverage RPC
--
-- The invoice ↔ procurement bridge powering the soft client-payment gate in
-- the Order Assistant: an invoice line can now bill a specific
-- project_ffe_items row (kind 'ffe'), and get_ffe_invoice_coverage() answers
-- "which items has the client been invoiced for / paid for?" per project.
--
-- Clones the proven milestone-line pattern from 00178 for FF&E:
--   • partial UNIQUE index = one live billing slot per item,
--   • void_invoice releases the slot (metadata audit crumb + pointer cleared
--     + kind rewritten to 'adhoc' so the kind CHECK keeps holding).
--
-- Contents:
--   1. Rebuild the invoice_line_items.kind CHECK to admit 'ffe' (the 00178
--      CHECK was declared inline and auto-named — resolved via pg_constraint,
--      never a hardcoded name).
--   2. ADD COLUMN ffe_item_id + chk_line_items_ffe_kind + partial UNIQUE
--      index uniq_invoice_line_items_ffe_item (one live slot per item).
--   3. Redefine void_invoice — 00178 body verbatim (00182 touched only the
--      chk_invoices_number_when_issued TABLE constraint, not this function)
--      plus the FF&E release block mirroring the milestone release.
--   4. get_ffe_invoice_coverage(p_project_id) — SQL STABLE SECURITY INVOKER
--      read-model: one row per project FF&E item with its live billing line
--      (if any) and a coverage verdict 'uninvoiced' | 'invoiced' | 'paid'.
--
-- Migrations 00178 (invoices core) and 00182 (void-draft constraint fix)
-- must be applied first. Re-run safe: guarded DO blocks, IF NOT EXISTS,
-- CREATE OR REPLACE, idempotent GRANT/REVOKE/COMMENT.
-- ============================================================================

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. kind CHECK — admit 'ffe'
-- ═══════════════════════════════════════════════════════════════════════════
--
-- 00178 declared the kind CHECK inline (`kind TEXT ... CHECK (kind IN
-- ('milestone','time','adhoc'))`), so Postgres auto-named it (typically
-- invoice_line_items_kind_check, but that's an implementation detail). The
-- drop therefore resolves the constraint from pg_constraint by its deparsed
-- definition. Matching on '%kind = ANY%' (how an IN-list CHECK deparses)
-- deliberately does NOT match chk_line_items_milestone_kind /
-- chk_line_items_ffe_kind, whose definitions contain 'kind' but deparse as
-- `kind <> '…'` disjunctions. Re-run safe: a kind IN-list that already
-- admits 'ffe' is left alone, and the replacement ADD only fires when no
-- such check survived. A final verification query asserts exactly that
-- shape exists before the migration is allowed to proceed.

DO $$
DECLARE
  v_con           RECORD;
  v_has_ffe_check BOOLEAN := FALSE;
BEGIN
  FOR v_con IN
    SELECT conname, pg_get_constraintdef(oid) AS def
      FROM pg_constraint
     WHERE conrelid = 'public.invoice_line_items'::regclass
       AND contype = 'c'
       AND pg_get_constraintdef(oid) LIKE '%kind = ANY%'
  LOOP
    IF v_con.def LIKE '%''ffe''%' THEN
      -- Already rebuilt by a previous run of this migration.
      v_has_ffe_check := TRUE;
    ELSE
      EXECUTE format(
        'ALTER TABLE public.invoice_line_items DROP CONSTRAINT %I',
        v_con.conname
      );
    END IF;
  END LOOP;

  IF NOT v_has_ffe_check THEN
    ALTER TABLE public.invoice_line_items
      ADD CONSTRAINT chk_line_items_kind
        CHECK (kind IN ('milestone', 'time', 'adhoc', 'ffe'));
  END IF;

  -- Verify the rebuild: exactly the admitting IN-list shape must now exist.
  PERFORM 1
    FROM pg_constraint
   WHERE conrelid = 'public.invoice_line_items'::regclass
     AND contype = 'c'
     AND pg_get_constraintdef(oid) LIKE '%kind = ANY%'
     AND pg_get_constraintdef(oid) LIKE '%''ffe''%';
  IF NOT FOUND THEN
    RAISE EXCEPTION
      '00187: kind CHECK rebuild failed — no kind IN-list constraint admitting ''ffe'' on invoice_line_items';
  END IF;
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. ffe_item_id + ffe-kind CHECK + unique live billing slot
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.invoice_line_items
  ADD COLUMN IF NOT EXISTS ffe_item_id UUID
    REFERENCES public.project_ffe_items(id) ON DELETE SET NULL;

-- ADD CONSTRAINT has no IF NOT EXISTS — guard via pg_constraint for re-run
-- safety (same reason the kind rebuild above is a DO block).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname  = 'chk_line_items_ffe_kind'
       AND conrelid = 'public.invoice_line_items'::regclass
  ) THEN
    ALTER TABLE public.invoice_line_items
      ADD CONSTRAINT chk_line_items_ffe_kind
        CHECK (kind <> 'ffe' OR ffe_item_id IS NOT NULL);
  END IF;
END $$;

-- An FF&E item can be billed on at most one invoice line, ever, until
-- released (void_invoice clears ffe_item_id, releasing the slot) — the exact
-- pattern of uniq_invoice_line_items_milestone (00178).
CREATE UNIQUE INDEX IF NOT EXISTS uniq_invoice_line_items_ffe_item
  ON public.invoice_line_items(ffe_item_id)
  WHERE ffe_item_id IS NOT NULL;

-- Same SET NULL ↔ CHECK tension as chk_line_items_milestone_kind (00178):
-- deleting a project_ffe_items row that a live kind='ffe' line references
-- makes ON DELETE SET NULL violate the CHECK and fail the delete. That is a
-- deliberate guard here — a billed item should not silently vanish from
-- under its invoice; void the invoice (releasing the slot) first.
COMMENT ON CONSTRAINT chk_line_items_ffe_kind ON public.invoice_line_items IS
  'ffe-kind lines must reference a project_ffe_items row; void_invoice releases '
  'by clearing ffe_item_id AND rewriting kind to adhoc (00187, mirroring the '
  'milestone release). Side effect: deleting a billed FF&E item fails loudly '
  '(SET NULL would violate this CHECK) until the line is released.';

COMMENT ON COLUMN public.invoice_line_items.ffe_item_id IS
  'The project_ffe_items row this line bills (kind ''ffe'', 00187). Partial '
  'UNIQUE index uniq_invoice_line_items_ffe_item = one live billing slot per '
  'item; void_invoice releases the slot into metadata.released_ffe_item_id.';

COMMENT ON TABLE public.invoice_line_items IS
  'Invoice lines: milestone (links project_payment_milestones, unique per live '
  'invoice), time (00177 pull-through), adhoc, ffe (00187 — links '
  'project_ffe_items, one live billing slot per item; void_invoice releases).';

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. void_invoice — release FF&E billing slots alongside milestones
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Provenance: body is the live 00178 revision VERBATIM — 00182 changed only
-- the chk_invoices_number_when_issued TABLE constraint, never this function
-- (verified: `grep -l void_invoice supabase/migrations/*.sql` → 00178,
-- 00182 only in prior migrations) — except ONE addition: the "Release FF&E billing slots" block
-- after the milestone-status reset, mirroring the milestone release
-- (metadata audit crumb || pointer cleared || kind rewritten to 'adhoc' so
-- chk_line_items_ffe_kind keeps holding). CREATE OR REPLACE preserves the
-- function's existing ACLs; the REVOKE/GRANT below re-asserts them anyway.

CREATE OR REPLACE FUNCTION public.void_invoice(
  p_invoice_id UUID,
  p_reason TEXT
)
RETURNS public.invoices
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_invoice invoices%ROWTYPE;
BEGIN
  SELECT * INTO v_invoice FROM invoices WHERE id = p_invoice_id FOR UPDATE;
  IF NOT FOUND OR v_invoice.designer_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'void_invoice: invoice % not found or access denied', p_invoice_id;
  END IF;
  IF v_invoice.status NOT IN ('draft','sent','partially_paid') THEN
    RAISE EXCEPTION 'void_invoice: invoice % is %, expected draft/sent/partially_paid',
      p_invoice_id, v_invoice.status;
  END IF;
  IF v_invoice.amount_paid_cents <> 0 THEN
    RAISE EXCEPTION 'void_invoice: invoice % has collected payments and cannot be voided', p_invoice_id;
  END IF;

  UPDATE invoices
  SET status      = 'void',
      voided_at   = NOW(),
      void_reason = p_reason,
      updated_at  = NOW()
  WHERE id = p_invoice_id
  RETURNING * INTO v_invoice;

  -- Release milestones: clear the pointer (frees the unique slot) and rewrite
  -- kind so the milestone-kind CHECK keeps holding. Keep the original
  -- milestone id in metadata for the audit trail.
  UPDATE invoice_line_items
  SET metadata     = metadata || jsonb_build_object('released_milestone_id', milestone_id::text),
      milestone_id = NULL,
      kind         = 'adhoc'
  WHERE invoice_id = p_invoice_id
    AND milestone_id IS NOT NULL;

  -- Linked milestones that were flipped outstanding by issue go back to
  -- pending (paid milestones are unreachable here — amount_paid is 0).
  UPDATE project_payment_milestones m
  SET status = 'pending',
      due_date = NULL,
      updated_at = NOW()
  FROM invoice_line_items li
  WHERE li.invoice_id = p_invoice_id
    AND (li.metadata->>'released_milestone_id')::uuid = m.id
    AND m.status = 'outstanding';

  -- Release FF&E billing slots (00187): same pattern as the milestone
  -- release — audit crumb into metadata, pointer cleared (frees the
  -- uniq_invoice_line_items_ffe_item slot so the item can be billed again),
  -- kind rewritten so chk_line_items_ffe_kind keeps holding.
  UPDATE invoice_line_items
  SET metadata    = metadata || jsonb_build_object('released_ffe_item_id', ffe_item_id::text),
      ffe_item_id = NULL,
      kind        = 'adhoc'
  WHERE invoice_id = p_invoice_id
    AND ffe_item_id IS NOT NULL;

  -- Release time entries back to the unbilled pool (order-tolerant with 00177).
  IF to_regclass('public.project_time_entries') IS NOT NULL THEN
    EXECUTE 'UPDATE public.project_time_entries SET invoice_id = NULL WHERE invoice_id = $1'
    USING p_invoice_id;
  END IF;

  RETURN v_invoice;
END;
$$;

REVOKE ALL ON FUNCTION public.void_invoice(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.void_invoice(UUID, TEXT) TO authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. get_ffe_invoice_coverage — the soft-gate read-model
-- ═══════════════════════════════════════════════════════════════════════════
--
-- One row per project FF&E item (the partial UNIQUE index guarantees at most
-- one live billing line per item, so the LEFT JOIN cannot fan out), with the
-- live (non-void) line's invoice and a coverage verdict:
--   'uninvoiced' — no live billing line,
--   'invoiced'   — on a draft / sent / partially_paid invoice,
--   'paid'       — that invoice is fully paid.
--
-- SECURITY INVOKER (deliberate, vs the DEFINER transition RPCs above): this
-- is a pure read-model with no privileged writes, and RLS on all three
-- joined tables already scopes rows to the caller — project_ffe_items and
-- invoices/invoice_line_items are designer-scoped (clients see issued
-- invoices only). Running as the caller means the function can never leak a
-- rival designer's billing state and needs no ownership check of its own:
-- a non-owner simply gets zero rows.

CREATE OR REPLACE FUNCTION public.get_ffe_invoice_coverage(p_project_id UUID)
RETURNS TABLE (
  ffe_item_id    UUID,
  invoice_id     UUID,
  invoice_number TEXT,
  invoice_status TEXT,
  billed_cents   INTEGER,
  coverage       TEXT
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  SELECT
    f.id  AS ffe_item_id,
    i.id  AS invoice_id,
    i.invoice_number,
    i.status AS invoice_status,
    -- Guard billed_cents behind the invoice join: a line whose invoice was
    -- filtered out (void without release — unreachable via the RPCs, but
    -- cheap to defend) must not report stale money.
    CASE WHEN i.id IS NULL THEN NULL ELSE li.amount_cents END AS billed_cents,
    CASE
      WHEN i.id IS NULL      THEN 'uninvoiced'
      WHEN i.status = 'paid' THEN 'paid'
      ELSE 'invoiced'
    END AS coverage
  FROM project_ffe_items f
  LEFT JOIN invoice_line_items li ON li.ffe_item_id = f.id
  LEFT JOIN invoices i ON i.id = li.invoice_id AND i.status <> 'void'
  WHERE f.project_id = p_project_id
$$;

COMMENT ON FUNCTION public.get_ffe_invoice_coverage(UUID) IS
  'Per-item invoice coverage for a project''s FF&E schedule (00187): one row '
  'per project_ffe_items row with its live (non-void) billing line and a '
  'verdict — uninvoiced | invoiced (draft/sent/partially_paid) | paid. '
  'SECURITY INVOKER: RLS on project_ffe_items / invoice_line_items / invoices '
  'scopes the result to the caller, so non-owners get zero rows. Powers the '
  'Order Assistant soft client-payment gate.';

REVOKE ALL ON FUNCTION public.get_ffe_invoice_coverage(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_ffe_invoice_coverage(UUID) TO authenticated;
