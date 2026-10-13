-- ═══════════════════════════════════════════════════════════════════════════
-- 00779 — Resolve decision reminder and overdue drafts with decision lifecycle.
-- Lineage: 00775 outbound draft lifecycle.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.resolve_client_decision_outbound_drafts()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.status IN ('responded', 'withdrawn', 'expired')
     AND OLD.status IS DISTINCT FROM NEW.status THEN
    PERFORM public.resolve_outbound_drafts('client_decision', NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS resolve_client_decision_outbound_drafts_trg ON public.client_decisions;
CREATE TRIGGER resolve_client_decision_outbound_drafts_trg
  AFTER UPDATE OF status ON public.client_decisions
  FOR EACH ROW
  EXECUTE FUNCTION public.resolve_client_decision_outbound_drafts();

