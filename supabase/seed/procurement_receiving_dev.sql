-- ============================================================================
-- Procurement Receiving — Development Seed Data
-- ----------------------------------------------------------------------------
-- Two receiving inspections (one clean, one damaged) + a drafted damage claim
-- against the POs created by procurement_workspace_dev.sql.
--
-- 00184 trigger interactions (trg_receiving_inspection_side_effects et al.):
--   * The CLEAN inspection on the Woodward WS-188 PO auto-advances the PO to
--     'delivered', stamps delivered_date from inspected_at, cascades linked
--     project_ffe_items to 'delivered', and sets received_quantity = quantity.
--     The manual `UPDATE purchase_orders SET status = 'delivered'` this seed
--     used to carry is therefore removed — the trigger owns that transition.
--   * The DAMAGED inspection on the Apparatus AP-012 PO stamps delivered_date
--     (the truck arrived) but leaves the PO at 'shipped', and — because the PO
--     is net_30 — shifts the pending balance due_date to delivered + 30 days.
--     That is the intended post-00184 state (state stays 'pending', so no
--     payment-due notification fires).
--   * The damage_claims INSERT fires trg_notify_damage_claim_drafted (00151),
--     which creates the damage_claim_drafted procurement_notifications row.
--     procurement_notifications_dev.sql's guarded insert then no-ops.
--
-- Idempotent: inspections are guarded on (purchase_order_id, outcome) — NOT on
-- the freshly generated UUIDs, which would always pass — and the damage claim
-- re-resolves the surviving inspection id so a re-run never violates the FK.
-- ============================================================================

DO $$
DECLARE
  v_designer_id         UUID;
  v_po_woodward         UUID;
  v_po_apparatus        UUID;
  v_inspection_damaged  UUID;
BEGIN
  SELECT id INTO v_designer_id FROM profiles WHERE is_designer = true LIMIT 1;

  SELECT po.id INTO v_po_woodward
    FROM purchase_orders po JOIN vendors v ON v.id = po.vendor_id
   WHERE v.name ILIKE 'Woodward%' AND po.vendor_po_number = 'WS-188' LIMIT 1;

  SELECT po.id INTO v_po_apparatus
    FROM purchase_orders po JOIN vendors v ON v.id = po.vendor_id
   WHERE v.name ILIKE 'Apparatus%' AND po.vendor_po_number = 'AP-012' LIMIT 1;

  IF v_po_apparatus IS NULL THEN
    SELECT id INTO v_po_apparatus FROM purchase_orders
     WHERE designer_id = v_designer_id AND id != COALESCE(v_po_woodward, gen_random_uuid()) LIMIT 1;
  END IF;

  IF v_designer_id IS NULL OR v_po_woodward IS NULL THEN
    RAISE NOTICE 'Skipping receiving seed: prerequisites not found.';
    RETURN;
  END IF;

  -- Inspection 1: Clean Woodward sectional, 2026-05-27.
  -- 00184 Trigger C advances the PO to 'delivered' / stamps delivered_date.
  INSERT INTO receiving_inspections (purchase_order_id, inspected_at, inspected_by, outcome, notes, photo_asset_ids)
  SELECT v_po_woodward, '2026-05-27T10:30:00+00:00'::timestamptz, v_designer_id,
         'clean', 'Sectional arrived in good condition. All 3 pieces accounted for. Packaging intact.', '{}'
  WHERE NOT EXISTS (
    SELECT 1 FROM receiving_inspections
     WHERE purchase_order_id = v_po_woodward AND outcome = 'clean'
  );

  -- Inspection 2: Damaged Apparatus pendant, 2026-05-26.
  -- 00184 Trigger C stamps delivered_date + shifts the net-30 balance due_date,
  -- but the PO deliberately stays 'shipped' (only clean outcomes advance it).
  INSERT INTO receiving_inspections (purchase_order_id, inspected_at, inspected_by, outcome, notes, photo_asset_ids)
  SELECT v_po_apparatus, '2026-05-26T14:15:00+00:00'::timestamptz, v_designer_id,
         'damaged', 'Chip on canopy of pendant cluster. Estimated 2cm chip on painted surface. 4 photos attached.', '{}'
  WHERE NOT EXISTS (
    SELECT 1 FROM receiving_inspections
     WHERE purchase_order_id = v_po_apparatus AND outcome = 'damaged'
  );

  -- Re-resolve the damaged inspection id (covers both the fresh-insert and
  -- already-seeded paths) before drafting the claim against it.
  SELECT id INTO v_inspection_damaged
    FROM receiving_inspections
   WHERE purchase_order_id = v_po_apparatus AND outcome = 'damaged'
   ORDER BY inspected_at ASC
   LIMIT 1;

  IF v_inspection_damaged IS NULL THEN
    RAISE NOTICE 'Skipping damage claim seed: damaged inspection not found.';
    RETURN;
  END IF;

  -- Damage claim drafted (fires trg_notify_damage_claim_drafted on insert).
  INSERT INTO damage_claims (receiving_inspection_id, state, description)
  SELECT v_inspection_damaged, 'drafted',
         'Damage reported on delivery from Apparatus Studio (PO AP-012).'
         || E'\n\nInspection notes: Chip on canopy of pendant cluster. Estimated 2cm chip on painted surface.'
         || E'\n\nPlease describe the issue in detail before notifying the vendor.'
  WHERE NOT EXISTS (SELECT 1 FROM damage_claims WHERE receiving_inspection_id = v_inspection_damaged);
END $$;
