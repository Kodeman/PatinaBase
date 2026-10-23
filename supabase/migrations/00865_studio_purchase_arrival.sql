-- 00865 — Clean dealer/antique arrivals advance the purchased piece (US-51).
-- Lineage: receiving_inspection_side_effects 00184 → 00665 → 00857 → 00861;
-- complete_receiving_inspection 00861 → 00862 → 00863.
-- Mirror PO movement: only clean inspections advance to delivered; pending,
-- damaged and partial retain their existing movement. Preserve the rank ratchet,
-- receipt quantities, PO arrival/payment clocks, claim authority and all ACLs.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

CREATE OR REPLACE FUNCTION public.receiving_inspection_side_effects()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_po                 purchase_orders%ROWTYPE;
  v_purchase           public.studio_purchases%ROWTYPE;
  v_delivered_was_null BOOLEAN;
  v_delivered_date     DATE;
BEGIN
  IF NEW.studio_purchase_id IS NOT NULL THEN
    SELECT * INTO v_purchase FROM public.studio_purchases
    WHERE id = NEW.studio_purchase_id FOR UPDATE;
    -- Like PO receipts, pending/damaged/partial arrivals do not advance movement.
    IF NEW.outcome = 'clean' AND v_purchase.status IN ('recorded', 'billed') THEN
      UPDATE public.project_ffe_items
         SET status = 'delivered', updated_at = now()
       WHERE id = v_purchase.ffe_item_id AND status <> 'cancelled'
         AND public.ffe_status_rank(status) < public.ffe_status_rank('delivered');
    END IF;
    RETURN NEW;
  END IF;

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
  SELECT * INTO v_inspection FROM public.receiving_inspections WHERE id = p_inspection_id;
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
  -- Authorize before locking; serialize against cancellation and another completion.
  IF v_inspection.purchase_order_id IS NOT NULL THEN
    SELECT * INTO v_po FROM public.purchase_orders WHERE id = v_inspection.purchase_order_id FOR UPDATE;
    IF v_po.status = 'cancelled' THEN
      RAISE EXCEPTION 'purchase order is not in a receivable state' USING ERRCODE = 'check_violation';
    END IF;
  ELSE
    SELECT * INTO v_purchase FROM public.studio_purchases WHERE id = v_inspection.studio_purchase_id FOR UPDATE;
    IF v_purchase.status NOT IN ('recorded', 'billed') THEN
      RAISE EXCEPTION 'studio purchase is not receivable' USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  SELECT * INTO v_inspection FROM public.receiving_inspections WHERE id = p_inspection_id FOR UPDATE;
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
  IF v_inspection.po_shipment_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.po_shipment_lines WHERE shipment_id = v_inspection.po_shipment_id
  ) THEN
    IF p_outcome = 'clean' AND EXISTS (
      SELECT 1 FROM public.po_shipment_lines shipped
      JOIN public.receiving_inspection_lines recorded ON recorded.ffe_item_id = shipped.ffe_item_id
        AND recorded.inspection_id = p_inspection_id
      WHERE shipped.shipment_id = v_inspection.po_shipment_id
        AND (SELECT COALESCE(sum(line.quantity_received), 0)
          FROM public.receiving_inspection_lines line
          JOIN public.receiving_inspections ri ON ri.id = line.inspection_id
          WHERE ri.po_shipment_id = v_inspection.po_shipment_id AND line.ffe_item_id = shipped.ffe_item_id
            AND line.received_quantity <= recorded.received_quantity) <> shipped.qty
    ) THEN
      RAISE EXCEPTION 'clean receipt requires every shipment line to be fully received' USING ERRCODE = 'check_violation';
    END IF;
    IF p_outcome = 'partial' AND NOT EXISTS (
      SELECT 1 FROM public.po_shipment_lines shipped
      JOIN public.receiving_inspection_lines recorded ON recorded.ffe_item_id = shipped.ffe_item_id
        AND recorded.inspection_id = p_inspection_id
      WHERE shipped.shipment_id = v_inspection.po_shipment_id
        AND (SELECT COALESCE(sum(line.quantity_received), 0)
          FROM public.receiving_inspection_lines line
          JOIN public.receiving_inspections ri ON ri.id = line.inspection_id
          WHERE ri.po_shipment_id = v_inspection.po_shipment_id AND line.ffe_item_id = shipped.ffe_item_id
            AND line.received_quantity <= recorded.received_quantity) < shipped.qty
    ) THEN
      RAISE EXCEPTION 'partial receipt requires at least one short shipment line' USING ERRCODE = 'check_violation';
    END IF;
  ELSE
    IF p_outcome = 'clean' AND EXISTS (
      SELECT 1 FROM public.receiving_inspection_lines line
      JOIN public.project_ffe_items item ON item.id = line.ffe_item_id
      WHERE line.inspection_id = p_inspection_id AND line.received_quantity <> item.quantity
    ) THEN
      RAISE EXCEPTION 'clean receipt requires every purchase-order line to be fully received' USING ERRCODE = 'check_violation';
    END IF;
    IF p_outcome = 'partial' AND NOT EXISTS (
      SELECT 1 FROM public.receiving_inspection_lines line
      JOIN public.project_ffe_items item ON item.id = line.ffe_item_id
      WHERE line.inspection_id = p_inspection_id AND line.received_quantity < item.quantity
    ) THEN
      RAISE EXCEPTION 'partial receipt requires at least one short purchase-order line' USING ERRCODE = 'check_violation';
    END IF;
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
  ELSIF p_outcome = 'clean' AND v_inspection.studio_purchase_id IS NOT NULL THEN
    -- 00863 already locked the recorded/billed purchase; finish movement only.
    UPDATE public.project_ffe_items
       SET status = 'delivered', updated_at = now()
     WHERE id = v_purchase.ffe_item_id AND status <> 'cancelled'
       AND public.ffe_status_rank(status) < public.ffe_status_rank('delivered');
  END IF;
  RETURN to_jsonb(v_inspection);
END;
$$;

COMMIT;
