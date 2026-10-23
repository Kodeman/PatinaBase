-- ═══════════════════════════════════════════════════════════════════════════
-- 00858 — Claim windows stay unknown until vendor terms are entered (V26).
-- Lineage: studio_vendor_claim_windows 00696 → 00858.
-- Keep the signature, SECURITY INVOKER/RLS and existing EXECUTE ACLs.
-- NULL claims_window_days explicitly means the notice window is unknown;
-- NULL inspection terms (including absent keys) likewise stay unknown.
-- procurement_claim_deadline (00700) already adds nullable terms to the PO's
-- delivered_date, so either missing fact yields NULL. The sweep (latest
-- 00720) compares that nullable deadline and therefore emits no deadline notice.
-- No stored vendor terms are rewritten and no external sends are introduced.
--
-- Follow-up: 00857 adds receiving_inspections.received_on + po_shipment_id.
-- Deliberately retain the PO delivered_date basis here without depending on
-- 00857; choosing a receipt/shipment-specific clock belongs to the claims UI.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

CREATE OR REPLACE FUNCTION public.studio_vendor_claim_windows(p_org uuid, p_vendor_id uuid)
RETURNS TABLE (claims_window_days integer, inspection_window_days jsonb)
LANGUAGE sql
STABLE
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT account.claims_window_days,
         account.inspection_window_days
  FROM (SELECT 1) AS one
  LEFT JOIN public.studio_vendor_accounts AS account
    ON account.organization_id = p_org
   AND account.vendor_id = p_vendor_id;
$$;

COMMENT ON FUNCTION public.studio_vendor_claim_windows(uuid, uuid) IS
  'Entered studio vendor claim windows (00858, V26), with no defaults. NULL claims_window_days '
  'means the vendor notice window is unknown. NULL inspection_window_days or an absent key '
  'means that inspection window is unknown. SECURITY INVOKER preserves studio account RLS.';
COMMENT ON COLUMN public.studio_vendor_accounts.claims_window_days IS
  'Vendor notice window in days. NULL means unknown until vendor terms are entered (00858, V26).';
COMMENT ON COLUMN public.studio_vendor_accounts.inspection_window_days IS
  'Inspection windows by mode. NULL or an absent key means unknown, never a default (00858, V26).';
COMMENT ON FUNCTION public.procurement_claim_deadline(uuid) IS
  'The claim clock for a purchase order: PO delivered_date plus entered studio vendor terms. '
  'NULL window days explicitly mean unknown; each deadline is NULL unless its term and delivery '
  'date are both present (00858, V26). Retains the 00700 SECURITY DEFINER/read predicate and '
  'PO-level basis, independent of 00857 receipt linkage.';

COMMIT;
