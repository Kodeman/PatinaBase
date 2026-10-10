-- ═══════════════════════════════════════════════════════════════════════════
-- 00764 — An allowance bills once it's filled (US-21 T-60k, SQ-709; QA F21)
-- ═══════════════════════════════════════════════════════════════════════════
-- F21: a released allowance with no price yet (item_type 'allowance',
-- unit_price_cents 0, the 00066 default) was drafted onto an invoice as a
-- $0.00 line. get_ffe_invoice_stage_coverage then read the line `invoiced`,
-- and the uniq_invoice_line_items_ffe_item slot (00709) held it, so it could
-- never be billed once filled. Ruling (Q12): an allowance whose price is
-- still unset is not billable.
--
-- ── WHERE THE REFUSAL LIVES ─────────────────────────────────────────────────
-- Three paths write an invoice line that names an FF&E line:
--   create_draft_invoice (00511)           full slots
--   add_invoice_billing_lines (00709)      deposit and balance slots
--   a direct insert/update under RLS       useUpsertLineItems (draft edits)
-- None refuses an unfilled allowance today. One BEFORE trigger on
-- invoice_line_items, beside trg_ffe_usd_invoice_line (00666), refuses all
-- three, so no RPC body is redefined here.
--
-- A line is refused when it newly names an allowance whose unit price is null
-- or 0: 'An allowance bills once it's filled.' (23514). An update that keeps
-- the same ffe_item_id is let through, so an existing draft line can still be
-- edited or deleted; voiding clears ffe_item_id and is unaffected.
--
-- Coverage is not redefined. With this guard no new $0 allowance line can be
-- written, and a line already written must keep reading `invoiced`: it still
-- holds the slot, so reading it `uninvoiced` would offer a bill the unique
-- index then refuses.
--
-- ── ACCESS ──────────────────────────────────────────────────────────────────
-- The trigger function is SECURITY DEFINER (RLS must not hide the FF&E line
-- from the check) and is executable by no API role, like 00666's guard.
-- Adds REVOKE → regenerate supabase/seed/00-legacy-grants.sql.
--
-- Idempotent: CREATE OR REPLACE FUNCTION, DROP TRIGGER IF EXISTS.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public._ffe_guard_unfilled_allowance_invoice_line()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.ffe_item_id IS NOT DISTINCT FROM OLD.ffe_item_id THEN
    RETURN NEW;
  END IF;
  IF EXISTS (SELECT 1 FROM public.project_ffe_items item
             WHERE item.id = NEW.ffe_item_id
               AND item.item_type = 'allowance'
               AND COALESCE(item.unit_price_cents, 0) = 0) THEN
    RAISE EXCEPTION 'An allowance bills once it''s filled.'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public._ffe_guard_unfilled_allowance_invoice_line() IS
  'Refuses an invoice line that newly names an allowance with no price yet (unit_price_cents null or 0): '
  '''An allowance bills once it''''s filled.'' (00764, US-21 F21, ruling Q12). Covers create_draft_invoice, '
  'add_invoice_billing_lines and direct draft-line writes.';

REVOKE ALL ON FUNCTION public._ffe_guard_unfilled_allowance_invoice_line()
FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS trg_ffe_unfilled_allowance_invoice_line ON public.invoice_line_items;
CREATE TRIGGER trg_ffe_unfilled_allowance_invoice_line
  BEFORE INSERT OR UPDATE OF ffe_item_id ON public.invoice_line_items
  FOR EACH ROW WHEN (NEW.ffe_item_id IS NOT NULL)
  EXECUTE FUNCTION public._ffe_guard_unfilled_allowance_invoice_line();
