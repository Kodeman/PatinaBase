-- ============================================================================
-- Procurement Notifications — Development Seed Data
-- ----------------------------------------------------------------------------
-- Inserts 3 sample procurement_notifications rows for the seed designer so the
-- nav badge and notification feed render with non-empty content in local dev.
--
-- Composition:
--   1. UNREAD balance_due — tied to the Woodward & Sons WS-188 PO + its balance payment.
--   2. UNREAD damage_claim_drafted — tied to the Apparatus AP-012 damaged inspection.
--   3. READ   deposit_due — tied to a deposit payment on any of the seed POs.
--
-- Prerequisites:
--   * supabase/seed/procurement_workspace_dev.sql (the 8 POs + their po_payments).
--   * supabase/seed/procurement_receiving_dev.sql (the damaged Apparatus inspection).
--   * Migration 00151 (procurement_notifications + procurement_notification_kind enum).
--
-- Idempotent: each insert is guarded with a uniqueness check on (user_id, kind,
-- subject_payment_id / subject_inspection_id).
--
-- Note: the seed deliberately INSERTs directly into procurement_notifications
-- rather than triggering the rows via po_payments/damage_claims state mutations,
-- because the seed pipeline is non-deterministic ordering-wise and we want a
-- predictable seed state regardless of upstream seed-file order.
-- ============================================================================

DO $$
DECLARE
  v_designer_id        UUID;
  v_po_woodward        UUID;
  v_po_apparatus       UUID;
  v_payment_balance    UUID;
  v_payment_deposit    UUID;
  v_inspection_damaged UUID;
BEGIN
  -- 1. Resolve the seed designer profile.
  SELECT id INTO v_designer_id
    FROM profiles
   WHERE is_designer = true
   LIMIT 1;

  IF v_designer_id IS NULL THEN
    RAISE NOTICE 'procurement_notifications seed skipped: no designer profile found.';
    RETURN;
  END IF;

  -- 2. Resolve the Woodward & Sons PO and its UNPAID balance payment row.
  SELECT po.id INTO v_po_woodward
    FROM purchase_orders po
    JOIN vendors v ON v.id = po.vendor_id
   WHERE v.name ILIKE 'Woodward%' AND po.vendor_po_number = 'WS-188'
   LIMIT 1;

  IF v_po_woodward IS NOT NULL THEN
    SELECT id INTO v_payment_balance
      FROM po_payments
     WHERE purchase_order_id = v_po_woodward
       AND kind = 'balance'
     ORDER BY sort_order ASC
     LIMIT 1;
  END IF;

  -- 3. Resolve the Apparatus PO and its damaged-inspection row.
  SELECT po.id INTO v_po_apparatus
    FROM purchase_orders po
    JOIN vendors v ON v.id = po.vendor_id
   WHERE v.name ILIKE 'Apparatus%' AND po.vendor_po_number = 'AP-012'
   LIMIT 1;

  IF v_po_apparatus IS NULL THEN
    -- Receiving seed may have re-bound to a different PO; fall back to any
    -- damaged inspection for this designer.
    SELECT ri.id INTO v_inspection_damaged
      FROM receiving_inspections ri
      JOIN purchase_orders po ON po.id = ri.purchase_order_id
     WHERE po.designer_id = v_designer_id
       AND ri.outcome = 'damaged'
     LIMIT 1;
  ELSE
    SELECT id INTO v_inspection_damaged
      FROM receiving_inspections
     WHERE purchase_order_id = v_po_apparatus
       AND outcome = 'damaged'
     LIMIT 1;
  END IF;

  -- 4. Resolve any deposit payment for the already-read notification (any PO).
  SELECT pmt.id INTO v_payment_deposit
    FROM po_payments pmt
    JOIN purchase_orders po ON po.id = pmt.purchase_order_id
   WHERE po.designer_id = v_designer_id
     AND pmt.kind = 'deposit'
   ORDER BY pmt.created_at DESC
   LIMIT 1;

  -- ─── Notification 1: UNREAD balance_due (Woodward PO) ────────────────────
  IF v_payment_balance IS NOT NULL THEN
    INSERT INTO procurement_notifications (
      user_id,
      kind,
      subject_purchase_order_id,
      subject_payment_id,
      read_at,
      created_at
    )
    SELECT
      v_designer_id,
      'balance_due'::procurement_notification_kind,
      v_po_woodward,
      v_payment_balance,
      NULL,
      NOW() - INTERVAL '6 hours'
    WHERE NOT EXISTS (
      SELECT 1 FROM procurement_notifications
       WHERE user_id = v_designer_id
         AND kind = 'balance_due'
         AND subject_payment_id = v_payment_balance
    );
  ELSE
    RAISE NOTICE 'procurement_notifications seed: skipped balance_due (Woodward PO/payment not found).';
  END IF;

  -- ─── Notification 2: UNREAD damage_claim_drafted (Apparatus inspection) ──
  IF v_inspection_damaged IS NOT NULL THEN
    INSERT INTO procurement_notifications (
      user_id,
      kind,
      subject_purchase_order_id,
      subject_inspection_id,
      read_at,
      created_at
    )
    SELECT
      v_designer_id,
      'damage_claim_drafted'::procurement_notification_kind,
      COALESCE(v_po_apparatus, (SELECT purchase_order_id FROM receiving_inspections WHERE id = v_inspection_damaged)),
      v_inspection_damaged,
      NULL,
      NOW() - INTERVAL '18 hours'
    WHERE NOT EXISTS (
      SELECT 1 FROM procurement_notifications
       WHERE user_id = v_designer_id
         AND kind = 'damage_claim_drafted'
         AND subject_inspection_id = v_inspection_damaged
    );
  ELSE
    RAISE NOTICE 'procurement_notifications seed: skipped damage_claim_drafted (damaged inspection not found).';
  END IF;

  -- ─── Notification 3: ALREADY-READ deposit_due ─────────────────────────────
  IF v_payment_deposit IS NOT NULL THEN
    INSERT INTO procurement_notifications (
      user_id,
      kind,
      subject_purchase_order_id,
      subject_payment_id,
      read_at,
      created_at
    )
    SELECT
      v_designer_id,
      'deposit_due'::procurement_notification_kind,
      (SELECT purchase_order_id FROM po_payments WHERE id = v_payment_deposit),
      v_payment_deposit,
      NOW() - INTERVAL '2 days',
      NOW() - INTERVAL '3 days'
    WHERE NOT EXISTS (
      SELECT 1 FROM procurement_notifications
       WHERE user_id = v_designer_id
         AND kind = 'deposit_due'
         AND subject_payment_id = v_payment_deposit
    );
  ELSE
    RAISE NOTICE 'procurement_notifications seed: skipped deposit_due (no deposit payment found).';
  END IF;
END $$;
