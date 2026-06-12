-- ============================================================================
-- Migration 00190: log_po_acknowledgment — accept any active (non-cancelled)
-- status
--
-- Closes the expediting gap found by the W5-T2 e2e
-- (apps/designer-portal/e2e/procurement/expediting.spec.ts): 00186's guard
-- allowed acknowledgment only on draft/confirmed POs, so a PO advanced past
-- 'confirmed' without an ack (in_production/shipped/delivered) showed a
-- "no ack" flag that NO UI could ever clear — the only acknowledgment
-- affordance (the By Vendor popover) called an RPC that hard-refused it.
--
-- Body copied VERBATIM from 00186 except:
--   * status guard: rejects only 'cancelled' (was: anything outside
--     draft/confirmed);
--   * status transition: draft → 'confirmed' ONLY; every later status keeps
--     its status (a late acknowledgment never regresses or advances the
--     lifecycle — the 00184 ratchet semantics are untouched. A same-status
--     UPDATE doesn't fire Trigger B, which is gated
--     WHEN (OLD.status IS DISTINCT FROM NEW.status)).
--
-- Idempotency unchanged: acknowledged_at = COALESCE(acknowledged_at, NOW())
-- keeps the original stamp; vendor_po_number / confirmed_eta only overwrite
-- when args are non-NULL.
--
-- Migration 00186 (function + acknowledged_at column) must be applied first.
-- Re-run safe: CREATE OR REPLACE + idempotent COMMENT/REVOKE/GRANT.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.log_po_acknowledgment(
  p_po_id            UUID,
  p_vendor_po_number TEXT DEFAULT NULL,
  p_confirmed_eta    DATE DEFAULT NULL
)
RETURNS purchase_orders
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_po purchase_orders;
BEGIN
  SELECT * INTO v_po
    FROM purchase_orders
   WHERE id = p_po_id
     AND designer_id = auth.uid()
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'log_po_acknowledgment: purchase order % not found or access denied', p_po_id;
  END IF;

  IF v_po.status NOT IN ('draft', 'confirmed', 'in_production', 'shipped', 'delivered') THEN
    RAISE EXCEPTION 'log_po_acknowledgment: purchase order % is %, cancelled orders cannot be acknowledged',
      p_po_id, v_po.status;
  END IF;

  UPDATE purchase_orders
     SET acknowledged_at  = COALESCE(acknowledged_at, NOW()),
         status           = CASE WHEN status = 'draft' THEN 'confirmed' ELSE status END,
         vendor_po_number = COALESCE(p_vendor_po_number, vendor_po_number),
         confirmed_eta    = COALESCE(p_confirmed_eta, confirmed_eta)
   WHERE id = p_po_id
   RETURNING * INTO v_po;

  RETURN v_po;
END;
$$;

COMMENT ON FUNCTION public.log_po_acknowledgment(UUID, TEXT, DATE) IS
  'Records the vendor''s acknowledgment of a purchase order: stamps '
  'acknowledged_at (idempotent — never overwrites an earlier stamp), advances '
  'draft → confirmed (00184 Trigger B keeps linked items at ''ordered''), and '
  'coalesce-updates vendor_po_number / confirmed_eta (NULL args preserve '
  'existing values). Accepts any non-cancelled status (00190): a late '
  'acknowledgment on an in_production/shipped/delivered PO stamps the '
  'timestamp without touching the status. Owner-scoped via '
  'designer_id = auth.uid().';

REVOKE ALL ON FUNCTION public.log_po_acknowledgment(UUID, TEXT, DATE) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.log_po_acknowledgment(UUID, TEXT, DATE) TO authenticated;
