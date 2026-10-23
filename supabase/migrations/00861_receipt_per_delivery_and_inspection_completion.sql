-- ═══════════════════════════════════════════════════════════════════════════
-- 00861 — Per-delivery receipt outcomes and pending inspection completion
-- Lineage: 00446 → 00762 → 00857. Copy the latest private batch authority;
-- only the clean/partial outcome checks change. All locks, access checks,
-- quantity ceilings, replay and receipt metadata remain owned there.
-- ═══════════════════════════════════════════════════════════════════════════
BEGIN;

CREATE OR REPLACE FUNCTION public._record_project_ffe_receipt_batch_00446_impl(
  p_purchase_order_id uuid,
  p_lines jsonb,
  p_outcome public.receiving_inspection_outcome,
  p_notes text DEFAULT NULL,
  p_photo_asset_ids uuid[] DEFAULT '{}',
  p_po_shipment_id uuid DEFAULT NULL,
  p_studio_purchase_id uuid DEFAULT NULL,
  p_arrival_method text DEFAULT NULL,
  p_reported_by text DEFAULT NULL,
  p_report_source text DEFAULT NULL,
  p_received_on date DEFAULT NULL,
  p_location_id uuid DEFAULT NULL,
  p_inspection_pending boolean DEFAULT NULL,
  p_inspection_owner_user_id uuid DEFAULT NULL,
  p_receipt_key uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions', 'pg_temp'
AS $$
DECLARE
  v_po public.purchase_orders%ROWTYPE;
  v_project public.projects%ROWTYPE;
  v_normalized_lines jsonb;
  v_request_hash text;
  v_existing jsonb;
  v_inspection_id uuid;
  v_response jsonb;
  v_purchase public.studio_purchases%ROWTYPE;
  v_item_id uuid;
  v_before jsonb;
  v_replay_id uuid;
  v_po_line_count integer;
  v_input_line_count integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'authentication required' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF jsonb_typeof(p_lines) IS DISTINCT FROM 'array'
     OR jsonb_array_length(p_lines) = 0
     OR jsonb_array_length(p_lines) > 1000
     OR EXISTS (
       SELECT 1 FROM jsonb_array_elements(p_lines) entry
       WHERE jsonb_typeof(entry) IS DISTINCT FROM 'object'
          OR jsonb_typeof(entry->'selectionId') IS DISTINCT FROM 'string'
          OR jsonb_typeof(entry->'receivedQuantity') IS DISTINCT FROM 'number'
          OR entry->>'selectionId' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
          OR entry->>'receivedQuantity' !~ '^[0-9]+$'
          OR EXISTS (
            SELECT 1 FROM jsonb_object_keys(entry) key
            WHERE key NOT IN ('selectionId', 'receivedQuantity')
          )
     )
  THEN
    RAISE EXCEPTION 'lines must be a nonempty array of selectionId and receivedQuantity entries'
      USING ERRCODE = 'check_violation';
  END IF;

  IF (p_purchase_order_id IS NULL) = (p_studio_purchase_id IS NULL) THEN
    RAISE EXCEPTION 'exactly one purchase order or studio purchase is required' USING ERRCODE = 'check_violation';
  END IF;
  IF p_purchase_order_id IS NOT NULL THEN
    SELECT * INTO v_po FROM public.purchase_orders WHERE id = p_purchase_order_id;
    PERFORM public._ffe_require_studio_project(v_po.project_id);
    IF NOT public.is_studio_comember(v_po.designer_id) THEN
      RAISE EXCEPTION 'purchase order owner is not accessible' USING ERRCODE = 'insufficient_privilege';
    END IF;
    SELECT * INTO v_po FROM public.purchase_orders WHERE id = p_purchase_order_id FOR UPDATE;
    SELECT * INTO STRICT v_project FROM public.projects WHERE id = v_po.project_id;
  ELSE
    SELECT * INTO v_purchase FROM public.studio_purchases WHERE id = p_studio_purchase_id;
    IF NOT FOUND OR v_purchase.ffe_item_id IS NULL OR NOT public.can_buy_for_project(v_purchase.project_id) THEN
      RAISE EXCEPTION 'studio purchase not found or access denied' USING ERRCODE = 'insufficient_privilege';
    END IF;
    SELECT * INTO v_purchase FROM public.studio_purchases WHERE id = p_studio_purchase_id FOR UPDATE;
    IF v_purchase.status NOT IN ('recorded', 'billed') THEN
      RAISE EXCEPTION 'studio purchase is not receivable' USING ERRCODE = 'check_violation';
    END IF;
    SELECT * INTO STRICT v_project FROM public.projects WHERE id = v_purchase.project_id;
  END IF;

  SELECT jsonb_agg(jsonb_build_object(
    'selectionId', entry->>'selectionId',
    'receivedQuantity', (entry->>'receivedQuantity')::integer
  ) ORDER BY entry->>'selectionId')
  INTO v_normalized_lines
  FROM jsonb_array_elements(p_lines) entry;

  IF (SELECT count(*) FROM jsonb_array_elements(v_normalized_lines)) IS DISTINCT FROM
     (SELECT count(DISTINCT entry->>'selectionId') FROM jsonb_array_elements(v_normalized_lines) entry)
  THEN
    RAISE EXCEPTION 'each purchase-order line must appear exactly once'
      USING ERRCODE = 'check_violation';
  END IF;

  -- The subject lock serializes key lookup, quantity deltas and insertion.
  IF p_receipt_key IS NOT NULL THEN
    SELECT line.inspection_id INTO v_replay_id
    FROM public.receiving_inspection_lines line
    JOIN jsonb_array_elements(v_normalized_lines) entry ON line.ffe_item_id = (entry->>'selectionId')::uuid
    WHERE line.receipt_key = p_receipt_key LIMIT 1;
    IF v_replay_id IS NOT NULL THEN
      IF EXISTS (
        SELECT 1 FROM public.receiving_inspections ri WHERE ri.id = v_replay_id
          AND (ri.purchase_order_id IS DISTINCT FROM p_purchase_order_id
            OR ri.studio_purchase_id IS DISTINCT FROM p_studio_purchase_id)
      ) OR EXISTS (
        SELECT 1 FROM jsonb_array_elements(v_normalized_lines) entry
        FULL JOIN (SELECT * FROM public.receiving_inspection_lines WHERE inspection_id = v_replay_id) line
          ON line.ffe_item_id = (entry->>'selectionId')::uuid
        WHERE entry IS NULL OR line.ffe_item_id IS NULL OR line.receipt_key IS DISTINCT FROM p_receipt_key
      ) THEN
        RAISE EXCEPTION 'receipt key is already used by another receipt' USING ERRCODE = 'check_violation';
      END IF;
      SELECT receipt_response INTO v_existing FROM public.receiving_inspections WHERE id = v_replay_id;
      RETURN v_existing || jsonb_build_object('reused', true);
    END IF;
  END IF;
  IF p_purchase_order_id IS NOT NULL AND v_po.status NOT IN ('confirmed', 'in_production', 'shipped', 'delivered') THEN
    RAISE EXCEPTION 'purchase order is not in a receivable state' USING ERRCODE = 'check_violation';
  END IF;
  IF p_outcome IS NULL AND NOT COALESCE(p_inspection_pending, false)
     OR p_outcome IS NOT NULL AND COALESCE(p_inspection_pending, false) THEN
    RAISE EXCEPTION 'pending inspection requires no outcome; completed inspection requires an outcome' USING ERRCODE = 'check_violation';
  END IF;

  v_request_hash := encode(extensions.digest(
    (jsonb_build_object(
      'lines', v_normalized_lines,
      'outcome', p_outcome,
      'notes', NULLIF(btrim(p_notes), ''),
      'photoAssetIds', to_jsonb(COALESCE(p_photo_asset_ids, '{}'))
    ) || CASE WHEN p_po_shipment_id IS NOT NULL OR p_studio_purchase_id IS NOT NULL
      OR p_arrival_method IS NOT NULL OR p_reported_by IS NOT NULL OR p_report_source IS NOT NULL
      OR p_received_on IS NOT NULL OR p_location_id IS NOT NULL OR p_inspection_pending IS NOT NULL
      OR p_inspection_owner_user_id IS NOT NULL OR p_receipt_key IS NOT NULL
      THEN jsonb_build_object('shipment', p_po_shipment_id, 'purchase', p_studio_purchase_id,
        'arrival', p_arrival_method, 'reportedBy', p_reported_by, 'source', p_report_source,
        'receivedOn', p_received_on, 'location', p_location_id, 'pending', p_inspection_pending,
        'owner', p_inspection_owner_user_id, 'key', p_receipt_key) ELSE '{}'::jsonb END)::text,
    'sha256'
  ), 'hex');

  SELECT response INTO v_existing
  FROM public.project_ffe_receipt_commands
  WHERE purchase_order_id = v_po.id AND request_hash = v_request_hash
  FOR UPDATE;
  IF FOUND THEN
    IF v_existing IS NULL THEN
      RAISE EXCEPTION 'receipt command is still in progress'
        USING ERRCODE = 'serialization_failure';
    END IF;
    RETURN v_existing || jsonb_build_object('reused', true);
  END IF;

  PERFORM 1 FROM public.project_ffe_items item
  WHERE (p_purchase_order_id IS NOT NULL AND item.purchase_order_id = v_po.id OR p_studio_purchase_id IS NOT NULL AND item.id = v_purchase.ffe_item_id)
  ORDER BY item.id
  FOR UPDATE;
  SELECT count(*) INTO v_po_line_count
  FROM public.project_ffe_items item
  WHERE (p_purchase_order_id IS NOT NULL AND item.purchase_order_id = v_po.id OR p_studio_purchase_id IS NOT NULL AND item.id = v_purchase.ffe_item_id);
  SELECT count(*) INTO v_input_line_count FROM jsonb_array_elements(v_normalized_lines);
  IF v_po_line_count = 0 OR v_input_line_count <> v_po_line_count
     OR EXISTS (
       SELECT 1
       FROM public.project_ffe_items item
       LEFT JOIN jsonb_array_elements(v_normalized_lines) entry
         ON (entry->>'selectionId')::uuid = item.id
       WHERE (p_purchase_order_id IS NOT NULL AND item.purchase_order_id = v_po.id OR p_studio_purchase_id IS NOT NULL AND item.id = v_purchase.ffe_item_id)
         AND entry IS NULL
     )
     OR EXISTS (
       SELECT 1
       FROM jsonb_array_elements(v_normalized_lines) entry
       LEFT JOIN public.project_ffe_items item
         ON item.id = (entry->>'selectionId')::uuid
        AND (p_purchase_order_id IS NOT NULL AND item.purchase_order_id = v_po.id OR p_studio_purchase_id IS NOT NULL AND item.id = v_purchase.ffe_item_id)
       WHERE item.id IS NULL
     )
  THEN
    RAISE EXCEPTION 'lines must name every purchase-order selection exactly once'
      USING ERRCODE = 'check_violation';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM public.project_ffe_items item
    JOIN jsonb_array_elements(v_normalized_lines) entry
      ON item.id = (entry->>'selectionId')::uuid
    WHERE item.project_id <> v_project.id
       OR (p_purchase_order_id IS NOT NULL AND item.vendor_id IS DISTINCT FROM v_po.vendor_id)
       OR (p_studio_purchase_id IS NOT NULL AND item.purchase_order_id IS NOT NULL)
       OR (entry->>'receivedQuantity')::integer < COALESCE(item.received_quantity, 0)
       OR (entry->>'receivedQuantity')::integer > item.quantity
  ) THEN
    RAISE EXCEPTION 'receipt lines must match project and vendor and advance within ordered quantities'
      USING ERRCODE = 'check_violation';
  END IF;
  IF p_po_shipment_id IS NOT NULL THEN
    -- The expected count belongs to this shipment, not the unshipped order.
    IF p_outcome = 'clean' AND EXISTS (
      SELECT 1 FROM public.po_shipment_lines shipped
      JOIN public.project_ffe_items item ON item.id = shipped.ffe_item_id
      JOIN jsonb_array_elements(v_normalized_lines) entry ON (entry->>'selectionId')::uuid = item.id
      WHERE shipped.shipment_id = p_po_shipment_id
        AND (entry->>'receivedQuantity')::integer - COALESCE(item.received_quantity, 0)
          + COALESCE((SELECT sum(line.quantity_received) FROM public.receiving_inspection_lines line
              JOIN public.receiving_inspections ri ON ri.id = line.inspection_id
              WHERE ri.po_shipment_id = p_po_shipment_id AND line.ffe_item_id = item.id), 0) <> shipped.qty
    ) THEN
      RAISE EXCEPTION 'clean receipt requires every shipment line to be fully received' USING ERRCODE = 'check_violation';
    END IF;
    IF p_outcome = 'partial' AND NOT EXISTS (
      SELECT 1 FROM public.po_shipment_lines shipped
      JOIN public.project_ffe_items item ON item.id = shipped.ffe_item_id
      JOIN jsonb_array_elements(v_normalized_lines) entry ON (entry->>'selectionId')::uuid = item.id
      WHERE shipped.shipment_id = p_po_shipment_id
        AND (entry->>'receivedQuantity')::integer - COALESCE(item.received_quantity, 0)
          + COALESCE((SELECT sum(line.quantity_received) FROM public.receiving_inspection_lines line
              JOIN public.receiving_inspections ri ON ri.id = line.inspection_id
              WHERE ri.po_shipment_id = p_po_shipment_id AND line.ffe_item_id = item.id), 0) < shipped.qty
    ) THEN
      RAISE EXCEPTION 'partial receipt requires at least one short shipment line' USING ERRCODE = 'check_violation';
    END IF;
  ELSE
  IF p_outcome = 'clean' AND EXISTS (
    SELECT 1
    FROM public.project_ffe_items item
    JOIN jsonb_array_elements(v_normalized_lines) entry
      ON item.id = (entry->>'selectionId')::uuid
    WHERE (entry->>'receivedQuantity')::integer <> item.quantity
  ) THEN
    RAISE EXCEPTION 'clean receipt requires every purchase-order line to be fully received'
      USING ERRCODE = 'check_violation';
  END IF;
  IF p_outcome = 'partial' AND NOT EXISTS (
    SELECT 1
    FROM public.project_ffe_items item
    JOIN jsonb_array_elements(v_normalized_lines) entry
      ON item.id = (entry->>'selectionId')::uuid
    WHERE (entry->>'receivedQuantity')::integer < item.quantity
  ) THEN
    RAISE EXCEPTION 'partial receipt requires at least one short purchase-order line'
      USING ERRCODE = 'check_violation';
  END IF;

  END IF;

  SELECT jsonb_object_agg(item.id::text, COALESCE(item.received_quantity, 0)) INTO v_before
  FROM public.project_ffe_items item
  WHERE (p_purchase_order_id IS NOT NULL AND item.purchase_order_id = v_po.id)
     OR (p_studio_purchase_id IS NOT NULL AND item.id = v_purchase.ffe_item_id);
  IF p_po_shipment_id IS NOT NULL THEN
    PERFORM 1 FROM public.po_shipments WHERE id = p_po_shipment_id AND purchase_order_id = v_po.id FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'shipment must belong to the receipt purchase order' USING ERRCODE = 'check_violation';
    END IF;
    IF EXISTS (
      SELECT 1 FROM jsonb_array_elements(v_normalized_lines) entry
      LEFT JOIN public.po_shipment_lines shipped ON shipped.shipment_id = p_po_shipment_id
        AND shipped.ffe_item_id = (entry->>'selectionId')::uuid
      WHERE (entry->>'receivedQuantity')::integer - (v_before->>(entry->>'selectionId'))::integer
        + COALESCE((SELECT sum(line.quantity_received) FROM public.receiving_inspection_lines line
            JOIN public.receiving_inspections ri ON ri.id = line.inspection_id
            WHERE ri.po_shipment_id = p_po_shipment_id AND line.ffe_item_id = (entry->>'selectionId')::uuid), 0)
        > COALESCE(shipped.qty, 0)
    ) THEN
      RAISE EXCEPTION 'received quantity exceeds the shipment line quantity' USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  IF p_purchase_order_id IS NOT NULL THEN
    INSERT INTO public.project_ffe_receipt_commands(purchase_order_id, request_hash) VALUES (v_po.id, v_request_hash);
  END IF;
  PERFORM set_config('app.ffe_mutation_rpc', 'on', true);
  UPDATE public.project_ffe_items item
  SET received_quantity = (entry->>'receivedQuantity')::integer,
      updated_at = now()
  FROM jsonb_array_elements(v_normalized_lines) entry
  WHERE item.id = (entry->>'selectionId')::uuid
    AND (p_purchase_order_id IS NOT NULL AND item.purchase_order_id = v_po.id OR p_studio_purchase_id IS NOT NULL AND item.id = v_purchase.ffe_item_id);

  INSERT INTO public.receiving_inspections(
    purchase_order_id, inspected_by, outcome, notes, photo_asset_ids, studio_purchase_id,
    po_shipment_id, arrival_method, reported_by, report_source, received_on, location_id,
    inspection_pending, inspection_owner_user_id
  ) VALUES (
    p_purchase_order_id, auth.uid(), p_outcome, NULLIF(btrim(p_notes), ''),
    COALESCE(p_photo_asset_ids, '{}'), p_studio_purchase_id, p_po_shipment_id,
    p_arrival_method, COALESCE(p_reported_by, 'studio_member'), NULLIF(btrim(p_report_source), ''),
    p_received_on, p_location_id, COALESCE(p_inspection_pending, false), p_inspection_owner_user_id
  ) RETURNING id INTO v_inspection_id;

  INSERT INTO public.receiving_inspection_lines(inspection_id, ffe_item_id, received_quantity, quantity_received, receipt_key)
  SELECT v_inspection_id, (entry->>'selectionId')::uuid, (entry->>'receivedQuantity')::integer,
    (entry->>'receivedQuantity')::integer - (v_before->>(entry->>'selectionId'))::integer, p_receipt_key
  FROM jsonb_array_elements(v_normalized_lines) entry;

  v_response := jsonb_build_object(
    'purchaseOrderId', p_purchase_order_id,
    'studioPurchaseId', p_studio_purchase_id,
    'poShipmentId', p_po_shipment_id,
    'inspectionPending', COALESCE(p_inspection_pending, false),
    'inspectionOwnerUserId', p_inspection_owner_user_id,
    'arrivalMethod', p_arrival_method, 'reportedBy', COALESCE(p_reported_by, 'studio_member'),
    'reportSource', NULLIF(btrim(p_report_source), ''), 'receivedOn', p_received_on, 'locationId', p_location_id,
    'claim_draft_skipped', CASE WHEN p_studio_purchase_id IS NOT NULL AND p_outcome IN ('damaged', 'partial') THEN 'no_purchase_order' END,
    'inspectionId', v_inspection_id,
    'outcome', p_outcome,
    'reused', false,
    'lines', (
      SELECT jsonb_agg(jsonb_build_object(
        'selectionId', item.id,
        'receivedQuantity', item.received_quantity,
        'orderedQuantity', item.quantity,
        'complete', item.received_quantity = item.quantity
      ) ORDER BY item.id)
      FROM public.project_ffe_items item
      WHERE (p_purchase_order_id IS NOT NULL AND item.purchase_order_id = v_po.id OR p_studio_purchase_id IS NOT NULL AND item.id = v_purchase.ffe_item_id)
    )
  );
  UPDATE public.project_ffe_receipt_commands
  SET inspection_id = v_inspection_id, response = v_response
  WHERE purchase_order_id = v_po.id AND request_hash = v_request_hash;
  UPDATE public.receiving_inspections SET receipt_response = v_response WHERE id = v_inspection_id;
  RETURN v_response;
END;
$$;

CREATE OR REPLACE FUNCTION public.receiving_inspection_side_effects()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_po                 purchase_orders%ROWTYPE;
  v_delivered_was_null BOOLEAN;
  v_delivered_date     DATE;
BEGIN
  SELECT * INTO v_po
    FROM purchase_orders
   WHERE id = NEW.purchase_order_id;

  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  v_delivered_was_null := v_po.delivered_date IS NULL;
  -- D9 (00665): the phone's local day wins over the UTC day of the instant.
  v_delivered_date     := COALESCE(v_po.delivered_date,
                                   NEW.received_on,
                                   NEW.inspected_local_date,
                                   NEW.inspected_at::date);

  -- Stamp delivered_date on ALL outcomes (the truck arrived), but only a
  -- CLEAN inspection advances the PO to 'delivered'. Damaged/partial leave
  -- the PO status alone — deliberate tightening vs the legacy hook, which
  -- advanced on every outcome. The status change cascades to linked items
  -- via Trigger B.
  UPDATE purchase_orders
     SET delivered_date = v_delivered_date,
         status = CASE
                    WHEN NEW.outcome = 'clean'
                         AND (NEW.po_shipment_id IS NULL OR NOT EXISTS (
                           SELECT 1 FROM public.project_ffe_items item
                           WHERE item.purchase_order_id = NEW.purchase_order_id
                             AND item.status <> 'cancelled'
                             AND COALESCE(item.received_quantity, 0) < item.quantity
                         ))
                         AND status NOT IN ('delivered', 'cancelled')
                    THEN 'delivered'
                    ELSE status
                  END
   WHERE id = NEW.purchase_order_id;

  -- net-30: when delivered_date just transitioned from NULL, the balance
  -- becomes due 30 days after delivery. Only pending rows — never overwrite
  -- a paid or already-due row (mirrors the legacy hook's predicate).
  IF v_po.payment_pattern = 'net_30' AND v_delivered_was_null THEN
    UPDATE po_payments
       SET due_date = (v_delivered_date + INTERVAL '30 days')::date
     WHERE purchase_order_id = NEW.purchase_order_id
       AND kind  = 'balance'
       AND state = 'pending';
  END IF;

  -- Clean inspection ⇒ everything on the PO arrived: mark items fully
  -- received (never decreases an existing count).
  IF NEW.outcome = 'clean' AND NEW.po_shipment_id IS NULL THEN
    UPDATE project_ffe_items
       SET received_quantity = quantity,
           updated_at        = NOW()
     WHERE purchase_order_id = NEW.purchase_order_id
       AND (received_quantity IS NULL OR received_quantity < quantity);
  END IF;

  RETURN NEW;
END;
$$;

-- Complete the check, never repeat the arrival. Claim drafting remains in the
-- existing shared hook authority, after this transaction has committed.
CREATE OR REPLACE FUNCTION public.complete_receiving_inspection(
  p_inspection_id uuid,
  p_outcome text,
  p_lines jsonb,
  p_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_inspection public.receiving_inspections%ROWTYPE;
  v_po public.purchase_orders%ROWTYPE;
  v_purchase public.studio_purchases%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'authentication required' USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT * INTO v_inspection FROM public.receiving_inspections WHERE id = p_inspection_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'inspection not found or access denied' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF v_inspection.purchase_order_id IS NOT NULL THEN
    SELECT * INTO v_po FROM public.purchase_orders WHERE id = v_inspection.purchase_order_id;
    PERFORM public._ffe_require_studio_project(v_po.project_id);
    IF NOT public.is_studio_comember(v_po.designer_id) THEN
      RAISE EXCEPTION 'purchase order owner is not accessible' USING ERRCODE = 'insufficient_privilege';
    END IF;
  ELSE
    SELECT * INTO v_purchase FROM public.studio_purchases WHERE id = v_inspection.studio_purchase_id;
    IF NOT FOUND OR NOT public.can_buy_for_project(v_purchase.project_id) THEN
      RAISE EXCEPTION 'studio purchase not found or access denied' USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;
  IF NOT v_inspection.inspection_pending THEN
    RAISE EXCEPTION 'inspection is already complete' USING ERRCODE = 'check_violation';
  END IF;
  IF p_outcome IS NULL OR p_outcome NOT IN ('clean', 'damaged', 'partial') THEN
    RAISE EXCEPTION 'inspection outcome must be clean, damaged or partial' USING ERRCODE = 'check_violation';
  END IF;
  IF jsonb_typeof(p_lines) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'inspection lines must be an array' USING ERRCODE = 'check_violation';
  END IF;
  IF jsonb_array_length(p_lines) = 0 OR jsonb_array_length(p_lines) > 1000
     OR EXISTS (SELECT 1 FROM jsonb_array_elements(p_lines) entry
       WHERE jsonb_typeof(entry) IS DISTINCT FROM 'object'
          OR jsonb_typeof(entry->'selectionId') IS DISTINCT FROM 'string'
          OR entry->>'selectionId' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
          OR jsonb_typeof(entry->'condition') IS DISTINCT FROM 'string'
          OR entry->>'condition' NOT IN ('good','damaged','short','wrong')
          OR (entry ? 'notedOnBol' AND jsonb_typeof(entry->'notedOnBol') IS DISTINCT FROM 'boolean')
          OR (entry ? 'receivedQuantity' AND (jsonb_typeof(entry->'receivedQuantity') IS DISTINCT FROM 'number'
              OR entry->>'receivedQuantity' !~ '^[0-9]{1,10}$'))
          OR EXISTS (SELECT 1 FROM jsonb_object_keys(entry) AS key
              WHERE key NOT IN ('selectionId','receivedQuantity','condition','notedOnBol')))
  THEN
    RAISE EXCEPTION 'invalid inspection line condition or shape' USING ERRCODE = 'check_violation';
  END IF;
  IF (SELECT count(*) FROM jsonb_array_elements(p_lines)) <>
     (SELECT count(DISTINCT entry->>'selectionId') FROM jsonb_array_elements(p_lines) entry)
     OR EXISTS (
       SELECT 1 FROM jsonb_array_elements(p_lines) entry
       FULL JOIN (SELECT * FROM public.receiving_inspection_lines WHERE inspection_id = p_inspection_id) line
         ON line.ffe_item_id = (entry->>'selectionId')::uuid
       WHERE entry IS NULL OR line.ffe_item_id IS NULL
          OR (entry ? 'receivedQuantity' AND (entry->>'receivedQuantity')::bigint <> line.received_quantity)
     ) THEN
    RAISE EXCEPTION 'inspection lines must match the recorded receipt without changing quantities' USING ERRCODE = 'check_violation';
  END IF;
  IF p_outcome = 'clean' AND EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_lines) entry WHERE entry->>'condition' <> 'good'
  ) THEN
    RAISE EXCEPTION 'a clean inspection requires every line in good condition' USING ERRCODE = 'check_violation';
  END IF;
  UPDATE public.receiving_inspection_lines line
     SET condition = entry->>'condition', noted_on_bol = COALESCE((entry->>'notedOnBol')::boolean, false)
    FROM jsonb_array_elements(p_lines) entry
   WHERE line.inspection_id = p_inspection_id AND line.ffe_item_id = (entry->>'selectionId')::uuid;
  UPDATE public.receiving_inspections
     SET outcome = p_outcome::public.receiving_inspection_outcome,
         inspection_pending = false,
         inspected_by = auth.uid(), inspected_at = now(),
         notes = COALESCE(NULLIF(btrim(p_notes), ''), notes)
   WHERE id = p_inspection_id RETURNING * INTO v_inspection;
  -- The INSERT-only arrival trigger must not run again during completion.
  IF p_outcome = 'clean' AND v_inspection.purchase_order_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.project_ffe_items item
       WHERE item.purchase_order_id = v_inspection.purchase_order_id
         AND item.status <> 'cancelled' AND COALESCE(item.received_quantity, 0) < item.quantity)
  THEN
    UPDATE public.purchase_orders SET status = 'delivered'
    WHERE id = v_inspection.purchase_order_id AND status NOT IN ('delivered','cancelled');
  END IF;
  RETURN to_jsonb(v_inspection);
END;
$$;
REVOKE ALL ON FUNCTION public.complete_receiving_inspection(uuid,text,jsonb,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.complete_receiving_inspection(uuid,text,jsonb,text) TO authenticated;

COMMIT;
