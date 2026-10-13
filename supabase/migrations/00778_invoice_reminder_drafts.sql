-- ═══════════════════════════════════════════════════════════════════════════
-- 00778 — Resolve invoice reminder drafts when the invoice is no longer collectible.
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.resolve_invoice_outbound_drafts_on_state_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  IF NEW.status IN ('paid', 'void') OR NEW.ar_flagged_at IS NOT NULL THEN
    PERFORM public.resolve_outbound_drafts('invoice', NEW.id);
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.resolve_invoice_outbound_drafts_on_state_change() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS invoices_resolve_outbound_drafts ON public.invoices;
CREATE TRIGGER invoices_resolve_outbound_drafts
  AFTER UPDATE OF status, ar_flagged_at ON public.invoices
  FOR EACH ROW
  WHEN (
    (NEW.status IN ('paid', 'void') AND OLD.status IS DISTINCT FROM NEW.status)
    OR (NEW.ar_flagged_at IS NOT NULL AND OLD.ar_flagged_at IS NULL)
  )
  EXECUTE FUNCTION public.resolve_invoice_outbound_drafts_on_state_change();
