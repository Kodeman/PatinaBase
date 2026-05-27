DO $$
DECLARE
  v_designer_id         UUID;
  v_po_woodward         UUID;
  v_po_apparatus        UUID;
  v_inspection_clean    UUID := gen_random_uuid();
  v_inspection_damaged  UUID := gen_random_uuid();
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

  -- Inspection 1: Clean Woodward sectional, 2026-05-27
  INSERT INTO receiving_inspections (id, purchase_order_id, inspected_at, inspected_by, outcome, notes, photo_asset_ids)
  SELECT v_inspection_clean, v_po_woodward, '2026-05-27T10:30:00+00:00'::timestamptz, v_designer_id,
         'clean', 'Sectional arrived in good condition. All 3 pieces accounted for. Packaging intact.', '{}'
  WHERE NOT EXISTS (SELECT 1 FROM receiving_inspections WHERE id = v_inspection_clean);

  UPDATE purchase_orders SET status = 'delivered', delivered_date = '2026-05-27'::date
   WHERE id = v_po_woodward AND delivered_date IS NULL;

  -- Inspection 2: Damaged Apparatus pendant, 2026-05-26
  INSERT INTO receiving_inspections (id, purchase_order_id, inspected_at, inspected_by, outcome, notes, photo_asset_ids)
  SELECT v_inspection_damaged, v_po_apparatus, '2026-05-26T14:15:00+00:00'::timestamptz, v_designer_id,
         'damaged', 'Chip on canopy of pendant cluster. Estimated 2cm chip on painted surface. 4 photos attached.', '{}'
  WHERE NOT EXISTS (SELECT 1 FROM receiving_inspections WHERE id = v_inspection_damaged);

  -- Damage claim drafted
  INSERT INTO damage_claims (receiving_inspection_id, state, description)
  SELECT v_inspection_damaged, 'drafted',
         'Damage reported on delivery from Apparatus Studio (PO AP-012).'
         || E'\n\nInspection notes: Chip on canopy of pendant cluster. Estimated 2cm chip on painted surface.'
         || E'\n\nPlease describe the issue in detail before notifying the vendor.'
  WHERE NOT EXISTS (SELECT 1 FROM damage_claims WHERE receiving_inspection_id = v_inspection_damaged);
END $$;
