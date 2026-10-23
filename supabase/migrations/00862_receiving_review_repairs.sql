-- 00862 — Receiving review repairs (US-51 / SQ-1787).
-- Lineage: status ratchets 00184 → 00855; linkage/inspection 00857;
-- batch 00446 → 00525 → 00754 → 00758 → 00762 → 00857 → 00861;
-- completion 00861; claim deadline 00700; sweep 00700 → 00708 → 00712 → 00720.
-- No backfill; first-arrival delivered_date and net-30 timing stay unchanged.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

CREATE OR REPLACE FUNCTION public.ffe_ratchet_to_po_stage()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_po_status TEXT;
  v_sent_at   timestamptz;
  v_target    TEXT;
BEGIN
  IF NEW.purchase_order_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- On UPDATE, only react when the link itself changed.
  IF TG_OP = 'UPDATE' AND NEW.purchase_order_id IS NOT DISTINCT FROM OLD.purchase_order_id THEN
    RETURN NEW;
  END IF;

  -- FOR SHARE: a status-only UPDATE takes FOR NO KEY UPDATE, which FOR KEY
  -- SHARE would NOT conflict with — FOR SHARE does. This blocks until a
  -- concurrent cancel commits, so the ratchet sees the final status (closes
  -- the read-then-ratchet TOCTOU window). A rare simultaneous cancel+link can
  -- deadlock; Postgres aborts one tx loudly, which beats a silent wrong link.
  SELECT status, sent_at INTO v_po_status, v_sent_at
    FROM purchase_orders
   WHERE id = NEW.purchase_order_id
     FOR SHARE;

  IF v_po_status IS NULL THEN
    RETURN NEW;  -- Dangling link; FK will reject it anyway.
  END IF;

  v_target := po_status_to_ffe_stage(v_po_status);
  -- Only an unsent draft is not yet an order; vendor confirmation is a commitment.
  IF v_po_status = 'draft' AND v_sent_at IS NULL THEN
    RETURN NEW;
  END IF;

  IF v_target IS NOT NULL AND ffe_status_rank(NEW.status) < ffe_status_rank(v_target) THEN
    NEW.status := v_target;
    -- stamp_ffe_status_change_trigger (00084) is BEFORE UPDATE only — cover
    -- the INSERT path here so last_status_change_at is stamped either way.
    IF TG_OP = 'INSERT' THEN
      NEW.last_status_change_at := NOW();
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.po_status_cascade_to_items()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_target TEXT;
BEGIN
  -- Circuit breaker: the state chain is acyclic by construction (items- and
  -- payments-side triggers never write purchase_orders), but guard against
  -- future regressions introducing a cycle.
  -- Max expected depth: 2 (PO update → item cascade) or 3 (PO update →
  -- flip helper → Trigger D). 4+ indicates a cycle introduced by a future
  -- regression.
  IF pg_trigger_depth() > 3 THEN
    RETURN NEW;
  END IF;

  IF NEW.status IN ('draft', 'confirmed', 'in_production', 'shipped', 'delivered') THEN
    v_target := po_status_to_ffe_stage(NEW.status);
    IF NEW.status = 'draft' AND NEW.sent_at IS NULL THEN
      v_target := NULL;
    END IF;
    -- Rank ratchet: only items BELOW the target advance. Items a designer
    -- manually moved ahead are never clobbered.
    UPDATE project_ffe_items
       SET status     = v_target,
           updated_at = NOW()
     WHERE purchase_order_id = NEW.id
       AND ffe_status_rank(status) < ffe_status_rank(v_target);

  ELSIF NEW.status = 'cancelled' THEN
    -- Single atomic detach of every linked item: rank 0-2 items
    -- (specified/quoted/approved) detach keeping their status; in-flight
    -- items (ordered..shipped, rank 3-5) roll back to 'approved';
    -- delivered/installed items (rank 6-7) detach keeping their status
    -- (the goods physically exist regardless of the PO's fate).
    UPDATE project_ffe_items
       SET purchase_order_id = NULL,
           status = CASE WHEN ffe_status_rank(status) BETWEEN 3 AND 5 THEN 'approved' ELSE status END,
           updated_at = NOW()
     WHERE purchase_order_id = NEW.id;
  END IF;

  -- Deposit/balance inverse-order rule, PO-progressed-second path: if the
  -- deposit was already paid before the PO shipped — or jumped straight to
  -- 'delivered' without passing 'shipped' (e.g. a clean receiving
  -- inspection on a confirmed PO) — flip the pending balance to due now.
  -- Status set is symmetric with Trigger D. (Deposit-paid-second path is
  -- Trigger D.)
  IF NEW.status IN ('shipped', 'delivered')
     AND NEW.payment_pattern IN ('fifty_fifty', 'thirty_seventy')
     AND EXISTS (
       SELECT 1
         FROM po_payments
        WHERE purchase_order_id = NEW.id
          AND kind  = 'deposit'
          AND state = 'paid'
     )
  THEN
    PERFORM flip_pending_balance_to_due(NEW.id);
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.validate_receipt_linkage()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $$
DECLARE v_project public.projects%ROWTYPE; v_org uuid;
BEGIN
  IF NEW.purchase_order_id IS NOT NULL THEN
    SELECT p.* INTO v_project FROM public.projects p JOIN public.purchase_orders po ON po.project_id = p.id WHERE po.id = NEW.purchase_order_id;
  ELSE
    SELECT p.* INTO v_project FROM public.projects p JOIN public.studio_purchases sp ON sp.project_id = p.id WHERE sp.id = NEW.studio_purchase_id;
    IF NOT FOUND OR NOT EXISTS (SELECT 1 FROM public.studio_purchases sp
        JOIN public.project_ffe_items item ON item.id = sp.ffe_item_id AND item.project_id = sp.project_id
        WHERE sp.id = NEW.studio_purchase_id AND item.purchase_order_id IS NULL) THEN
      RAISE EXCEPTION 'purchase receipt requires a project purchase linked to its item' USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  v_org := COALESCE(v_project.studio_id, public._primary_studio_for(v_project.designer_id));
  IF NEW.inspection_owner_user_id IS NOT NULL
     AND (TG_OP = 'INSERT' OR NEW.inspection_owner_user_id IS DISTINCT FROM OLD.inspection_owner_user_id)
     AND NOT EXISTS (
    SELECT 1 FROM public.organization_members member WHERE member.organization_id = v_org
      AND member.user_id = NEW.inspection_owner_user_id AND member.status = 'active' AND member.role <> 'guest'
  ) THEN
    RAISE EXCEPTION 'inspection owner must be an active studio member' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.location_id IS NOT NULL
     AND (TG_OP = 'INSERT' OR NEW.location_id IS DISTINCT FROM OLD.location_id)
     AND NOT EXISTS (SELECT 1 FROM public.studio_locations location
      WHERE location.id = NEW.location_id AND location.organization_id = v_org) THEN
    RAISE EXCEPTION 'receipt location must belong to the project studio' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.po_shipment_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.po_shipments shipment
      WHERE shipment.id = NEW.po_shipment_id AND shipment.purchase_order_id = NEW.purchase_order_id) THEN
    RAISE EXCEPTION 'shipment must belong to the receipt purchase order' USING ERRCODE = 'check_violation';
  END IF;
  IF TG_OP = 'UPDATE' AND (OLD.po_shipment_id IS DISTINCT FROM NEW.po_shipment_id
      OR OLD.purchase_order_id IS DISTINCT FROM NEW.purchase_order_id OR OLD.studio_purchase_id IS DISTINCT FROM NEW.studio_purchase_id) THEN
    RAISE EXCEPTION 'receipt subject and shipment cannot be changed' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

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
           OR line.received_quantity IS DISTINCT FROM (entry->>'receivedQuantity')::integer
      ) OR EXISTS (
        SELECT 1 FROM public.receiving_inspections ri WHERE ri.id = v_replay_id
          AND (ri.receipt_response->>'outcome' IS DISTINCT FROM p_outcome::text
            OR (ri.receipt_response->>'inspectionPending')::boolean IS DISTINCT FROM COALESCE(p_inspection_pending, false))
      ) THEN
        RAISE EXCEPTION 'receipt_key_conflict' USING ERRCODE = 'check_violation';
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
  IF p_po_shipment_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.po_shipment_lines WHERE shipment_id = p_po_shipment_id
  ) THEN
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
    IF EXISTS (SELECT 1 FROM public.po_shipment_lines WHERE shipment_id = p_po_shipment_id) AND EXISTS (
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

CREATE OR REPLACE FUNCTION public.record_project_ffe_inspection(
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
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_result jsonb;
  v_purchase public.studio_purchases%ROWTYPE;
  v_inspection_id uuid;
  -- 00756: the rooms add up to the delivery.
  v_received_before jsonb;
  v_entry jsonb;
  v_item_id uuid;
  v_receipt bigint;
  v_given_total bigint;
  v_lacking bigint;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'record_project_ffe_inspection: authentication required'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF jsonb_typeof(p_lines) IS DISTINCT FROM 'array'
     OR jsonb_array_length(p_lines) = 0
     OR EXISTS (SELECT 1 FROM jsonb_array_elements(p_lines) entry
                WHERE jsonb_typeof(entry) IS DISTINCT FROM 'object') THEN
    RAISE EXCEPTION 'record_project_ffe_inspection: lines must be a nonempty array of objects'
      USING ERRCODE = 'check_violation';
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_lines) entry
    WHERE (NOT COALESCE(p_inspection_pending, false) AND jsonb_typeof(entry->'condition') IS DISTINCT FROM 'string')
       OR entry->>'condition' NOT IN ('good', 'damaged', 'short', 'wrong')
       OR (entry ? 'notedOnBol' AND jsonb_typeof(entry->'notedOnBol') <> 'boolean')
       OR EXISTS (SELECT 1 FROM jsonb_object_keys(entry) AS key
                  WHERE key NOT IN ('selectionId', 'receivedQuantity', 'condition', 'notedOnBol', 'placements'))
  ) THEN
    RAISE EXCEPTION 'record_project_ffe_inspection: each line takes selectionId, receivedQuantity, a condition of good, damaged, short or wrong, an optional boolean notedOnBol and optional placements'
      USING ERRCODE = 'check_violation';
  END IF;
  IF p_outcome = 'clean' AND EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_lines) entry WHERE entry->>'condition' <> 'good'
  ) THEN
    RAISE EXCEPTION 'record_project_ffe_inspection: a clean receipt requires every line in good condition'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO v_purchase FROM public.studio_purchases WHERE id = p_studio_purchase_id;

  -- 00756: each roomed line's count before this delivery. Read only to size
  -- the delivery once the batch below has passed its access checks.
  SELECT COALESCE(jsonb_object_agg(item.id::text, COALESCE(item.received_quantity, 0)), '{}'::jsonb)
  INTO v_received_before
  FROM public.project_ffe_items item
  WHERE (item.purchase_order_id = p_purchase_order_id OR item.id = v_purchase.ffe_item_id)
    AND item.id::text IN (SELECT entry->>'selectionId'
                            FROM jsonb_array_elements(p_lines) entry
                           WHERE entry ? 'placements');

  -- Access, PO state, counts, photos and idempotency stay with the batch RPC.
  v_result := public.record_project_ffe_receipt_batch(
    p_purchase_order_id,
    (SELECT jsonb_agg(entry - ARRAY['condition', 'notedOnBol']) FROM jsonb_array_elements(p_lines) entry),
    p_outcome,
    p_notes,
    p_photo_asset_ids, p_po_shipment_id, p_studio_purchase_id, p_arrival_method, p_reported_by,
    p_report_source, p_received_on, p_location_id, p_inspection_pending,
    p_inspection_owner_user_id, p_receipt_key
  );
  v_inspection_id := (v_result->>'inspectionId')::uuid;

  -- 00756: a line that names its rooms names the whole delivery.
  IF NOT COALESCE((v_result->>'reused')::boolean, false) THEN
    FOR v_entry IN
      SELECT entry FROM jsonb_array_elements(p_lines) entry WHERE entry ? 'placements'
    LOOP
      v_item_id := (v_entry->>'selectionId')::uuid;
      v_receipt := (v_entry->>'receivedQuantity')::bigint
                   - COALESCE((v_received_before->>v_item_id::text)::bigint, 0);
      SELECT COALESCE(sum((given->>'quantity')::bigint), 0) INTO v_given_total
        FROM jsonb_array_elements(v_entry->'placements') given;
      -- What the rooms lacked before this batch.
      SELECT COALESCE(sum(GREATEST(placement.quantity - COALESCE((
               SELECT sum(earlier.quantity)
                 FROM public.project_ffe_placement_receipts earlier
                WHERE earlier.placement_id = placement.id
                  AND earlier.receipt_batch_id <> v_inspection_id), 0), 0)), 0)
        INTO v_lacking
        FROM public.project_ffe_placements placement
       WHERE placement.ffe_item_id = v_item_id;
      IF v_given_total <> LEAST(GREATEST(v_receipt, 0), v_lacking) THEN
        RAISE EXCEPTION 'The rooms add up to %, but this delivery brought % to place.',
          v_given_total, LEAST(GREATEST(v_receipt, 0), v_lacking)
          USING ERRCODE = 'check_violation';
      END IF;
    END LOOP;
  END IF;

  IF COALESCE(p_inspection_pending, false) THEN RETURN v_result; END IF;
  IF NOT COALESCE((v_result->>'reused')::boolean, false) THEN
    UPDATE public.receiving_inspection_lines recorded
    SET condition = entry->>'condition', noted_on_bol = COALESCE((entry->>'notedOnBol')::boolean, false)
    FROM jsonb_array_elements(p_lines) entry
    WHERE recorded.inspection_id = v_inspection_id AND recorded.ffe_item_id = (entry->>'selectionId')::uuid;
  END IF;
  IF EXISTS (SELECT 1 FROM public.receiving_inspection_lines WHERE inspection_id = v_inspection_id) THEN
    -- A replay of a receipt already recorded: the lines must agree.
    IF EXISTS (
      SELECT 1
      FROM (SELECT (entry->>'selectionId')::uuid AS ffe_item_id,
                   entry->>'condition' AS condition,
                   COALESCE((entry->>'notedOnBol')::boolean, false) AS noted_on_bol
              FROM jsonb_array_elements(p_lines) entry) AS requested
      FULL JOIN (SELECT ffe_item_id, condition, noted_on_bol
                   FROM public.receiving_inspection_lines
                  WHERE inspection_id = v_inspection_id) AS stored
        ON stored.ffe_item_id = requested.ffe_item_id
      WHERE requested.ffe_item_id IS NULL
         OR stored.ffe_item_id IS NULL
         OR stored.condition <> requested.condition
         OR stored.noted_on_bol <> requested.noted_on_bol
    ) THEN
      RAISE EXCEPTION 'record_project_ffe_inspection: this receipt was already recorded with different line conditions'
        USING ERRCODE = 'check_violation';
    END IF;
  ELSE
    INSERT INTO public.receiving_inspection_lines (
      inspection_id, ffe_item_id, received_quantity, condition, noted_on_bol
    )
    SELECT v_inspection_id,
           (entry->>'selectionId')::uuid,
           (entry->>'receivedQuantity')::integer,
           entry->>'condition',
           COALESCE((entry->>'notedOnBol')::boolean, false)
      FROM jsonb_array_elements(p_lines) entry;
  END IF;

  RETURN v_result || jsonb_build_object('lines', (
    SELECT jsonb_agg(line || jsonb_build_object(
             'condition', recorded.condition,
             'notedOnBol', recorded.noted_on_bol
           ) ORDER BY line->>'selectionId')
      FROM jsonb_array_elements(v_result->'lines') AS line
      LEFT JOIN public.receiving_inspection_lines AS recorded
        ON recorded.inspection_id = v_inspection_id
       AND recorded.ffe_item_id = (line->>'selectionId')::uuid
  ));
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
  END IF;
  RETURN to_jsonb(v_inspection);
END;
$$;

CREATE OR REPLACE FUNCTION public.clear_moved_ffe_planned_destination()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $$
BEGIN
  IF NEW.project_id IS DISTINCT FROM OLD.project_id
     AND NEW.planned_destination_location_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.project_destination_locations destination
       WHERE destination.project_id = NEW.project_id
         AND destination.location_id = NEW.planned_destination_location_id) THEN
    NEW.planned_destination_location_id := NULL;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.clear_moved_ffe_planned_destination() FROM PUBLIC, anon, authenticated, service_role;
DROP TRIGGER IF EXISTS clear_moved_ffe_planned_destination ON public.project_ffe_items;
CREATE TRIGGER clear_moved_ffe_planned_destination
BEFORE UPDATE OF project_id ON public.project_ffe_items
FOR EACH ROW EXECUTE FUNCTION public.clear_moved_ffe_planned_destination();

CREATE OR REPLACE FUNCTION public.procurement_receipt_claim_deadline(p_inspection_id uuid)
RETURNS TABLE (
  delivered_on            date,
  claims_window_days      integer,
  vendor_deadline         date,
  concealed_carrier_days  integer,
  carrier_deadline        date
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT COALESCE(ri.received_on, ri.inspected_local_date, ri.inspected_at::date),
         windows.claims_window_days,
         COALESCE(ri.received_on, ri.inspected_local_date, ri.inspected_at::date) + windows.claims_window_days,
         (windows.inspection_window_days->>'concealed_carrier')::integer,
         COALESCE(ri.received_on, ri.inspected_local_date, ri.inspected_at::date) + (windows.inspection_window_days->>'concealed_carrier')::integer
  FROM public.receiving_inspections AS ri
  JOIN public.purchase_orders AS po ON po.id = ri.purchase_order_id
  JOIN public.projects AS project ON project.id = po.project_id
  CROSS JOIN LATERAL public.studio_vendor_claim_windows(
    public.purchase_order_studio_id(po.id), po.vendor_id
  ) AS windows
  WHERE ri.id = p_inspection_id
    -- purchase_orders_studio_read's predicate; a call without a user
    -- (pg_cron, service_role) reads every PO, as RLS would let it.
    AND ((select auth.uid()) IS NULL OR public.is_studio_comember(project.designer_id));
$$;

CREATE OR REPLACE FUNCTION public.sweep_procurement_clocks()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_run_id        bigint;
  v_claim_window  int := 0;
  v_ack           int := 0;
  v_backorder     int := 0;
  v_quote         int := 0;
  v_cfa           int := 0;
  v_memo          int := 0;
  v_stalled       int := 0;
  v_detail        jsonb;
BEGIN
  IF NOT pg_try_advisory_xact_lock(hashtext('job:procurement-clocks-daily')) THEN
    INSERT INTO public.job_runs (job_name, status, finished_at)
    VALUES ('procurement-clocks-daily', 'skipped', now());
    RETURN jsonb_build_object('skipped', true);
  END IF;

  PERFORM set_config('app.actor', 'job:procurement-clocks-daily', true);

  INSERT INTO public.job_runs (job_name, status)
  VALUES ('procurement-clocks-daily', 'running')
  RETURNING id INTO v_run_id;

  BEGIN
    -- claim_window_closing: the day before the vendor deadline (or on it),
    -- while a drafted damage claim still waits to be sent. Windows are at
    -- most 365 days (00696), which bounds the receipt-date scan.
    INSERT INTO public.procurement_notifications (user_id, kind, subject_purchase_order_id)
    SELECT DISTINCT recipient,
           'claim_window_closing'::public.procurement_notification_kind,
           po.id
      FROM public.purchase_orders AS po
      JOIN public.receiving_inspections AS ri ON ri.purchase_order_id = po.id
      JOIN public.damage_claims AS claim ON claim.receiving_inspection_id = ri.id AND claim.state = 'drafted'
     CROSS JOIN LATERAL public.procurement_receipt_claim_deadline(ri.id) AS clock
     CROSS JOIN LATERAL public.procurement_notice_recipients(po.id) AS recipient
     WHERE clock.delivered_on IS NOT NULL
       AND clock.delivered_on >= CURRENT_DATE - 365
       AND po.status <> 'cancelled'
       AND clock.vendor_deadline - 1 <= CURRENT_DATE
       AND clock.vendor_deadline >= CURRENT_DATE
       AND NOT EXISTS (
         SELECT 1
           FROM public.procurement_notifications AS n
          WHERE n.subject_purchase_order_id = po.id
            AND n.kind = 'claim_window_closing'
            AND n.user_id = recipient
       );
    GET DIAGNOSTICS v_claim_window = ROW_COUNT;

    -- ack_discrepancy (00708): an open acknowledgment discrepancy, once per
    -- exception and recipient (the PO creator and the project lead).
    INSERT INTO public.procurement_notifications (
      user_id, kind, subject_purchase_order_id, subject_exception_id, organization_id
    )
    SELECT recipient, 'ack_discrepancy'::public.procurement_notification_kind,
           exc.purchase_order_id, exc.id, exc.organization_id
      FROM public.procurement_exceptions AS exc
     CROSS JOIN LATERAL public.procurement_notice_recipients(exc.purchase_order_id) AS recipient
     WHERE exc.type = 'ack_discrepancy'
       AND exc.status <> 'resolved'
       AND NOT EXISTS (
         SELECT 1 FROM public.procurement_notifications AS n
          WHERE n.subject_exception_id = exc.id
            AND n.kind = 'ack_discrepancy'
            AND n.user_id = recipient
       );
    GET DIAGNOSTICS v_ack = ROW_COUNT;

    -- backorder_reported (00708): an open backorder exception, once per
    -- exception and recipient (the PO's recipients, or for a line not yet on
    -- a PO the project lead and whoever opened it).
    INSERT INTO public.procurement_notifications (
      user_id, kind, subject_purchase_order_id, subject_exception_id, organization_id
    )
    SELECT DISTINCT recipient.user_id, 'backorder_reported'::public.procurement_notification_kind,
           exc.purchase_order_id, exc.id, exc.organization_id
      FROM public.procurement_exceptions AS exc
      JOIN public.projects AS project ON project.id = exc.project_id
     CROSS JOIN LATERAL (
       SELECT r FROM public.procurement_notice_recipients(exc.purchase_order_id) AS r
        WHERE exc.purchase_order_id IS NOT NULL
       UNION
       SELECT v FROM (VALUES (project.designer_id), (exc.opened_by)) AS t(v)
        WHERE exc.purchase_order_id IS NULL AND v IS NOT NULL
     ) AS recipient(user_id)
     WHERE exc.type = 'backorder'
       AND exc.status <> 'resolved'
       AND NOT EXISTS (
         SELECT 1 FROM public.procurement_notifications AS n
          WHERE n.subject_exception_id = exc.id
            AND n.kind = 'backorder_reported'
            AND n.user_id = recipient.user_id
       );
    GET DIAGNOSTICS v_backorder = ROW_COUNT;

    -- quote_expiring (00708): the day before valid_until, or on it, for a live
    -- quote with a line not yet ordered. R6 is open: valid_until only.
    INSERT INTO public.procurement_notifications (user_id, kind, subject_quote_id, organization_id)
    SELECT DISTINCT recipient.user_id, 'quote_expiring'::public.procurement_notification_kind,
           quote.id, quote.organization_id
      FROM public.vendor_quotes AS quote
      JOIN public.projects AS project ON project.id = quote.project_id
     CROSS JOIN LATERAL (VALUES (quote.recorded_by), (project.designer_id)) AS recipient(user_id)
     WHERE quote.superseded_by IS NULL
       AND quote.valid_until IS NOT NULL
       AND quote.valid_until - 1 <= CURRENT_DATE
       AND quote.valid_until >= CURRENT_DATE
       AND recipient.user_id IS NOT NULL
       AND EXISTS (
         SELECT 1
           FROM public.vendor_quote_lines AS ql
           JOIN public.project_ffe_items AS item ON item.id = ql.ffe_item_id
          WHERE ql.quote_id = quote.id
            AND item.purchase_order_id IS NULL
            AND item.removed_at IS NULL
       )
       AND NOT EXISTS (
         SELECT 1 FROM public.procurement_notifications AS n
          WHERE n.subject_quote_id = quote.id
            AND n.kind = 'quote_expiring'
            AND n.user_id = recipient.user_id
       );
    GET DIAGNOSTICS v_quote = ROW_COUNT;

    -- cfa_reserve_expiring (00712): the day before a pending submittal's
    -- reserve_expires_on, or on it — the vendor stops holding the cut. Once
    -- per submittal and recipient (whoever recorded it and the project lead).
    INSERT INTO public.procurement_notifications (
      user_id, kind, subject_submittal_id, subject_purchase_order_id, organization_id
    )
    SELECT DISTINCT recipient.user_id, 'cfa_reserve_expiring'::public.procurement_notification_kind,
           sub.id, sub.purchase_order_id, sub.organization_id
      FROM public.po_submittals AS sub
      JOIN public.projects AS project ON project.id = sub.project_id
     CROSS JOIN LATERAL (VALUES (sub.created_by), (project.designer_id)) AS recipient(user_id)
     WHERE sub.decision = 'pending'
       AND sub.reserve_expires_on IS NOT NULL
       AND sub.reserve_expires_on - 1 <= CURRENT_DATE
       AND sub.reserve_expires_on >= CURRENT_DATE
       AND recipient.user_id IS NOT NULL
       AND NOT EXISTS (
         SELECT 1 FROM public.procurement_notifications AS n
          WHERE n.subject_submittal_id = sub.id
            AND n.kind = 'cfa_reserve_expiring'
            AND n.user_id = recipient.user_id
       );
    GET DIAGNOSTICS v_cfa = ROW_COUNT;

    -- memo_return_due (00712): return_by within three days, or past, on a
    -- sample not yet returned or cancelled — before the vendor bills for it.
    -- Once per sample and recipient (whoever recorded it and, for a project
    -- sample, the project lead).
    INSERT INTO public.procurement_notifications (user_id, kind, subject_sample_id, organization_id)
    SELECT DISTINCT recipient.user_id, 'memo_return_due'::public.procurement_notification_kind,
           sample.id, sample.organization_id
      FROM public.sample_requests AS sample
      LEFT JOIN public.projects AS project ON project.id = sample.project_id
     CROSS JOIN LATERAL (VALUES (sample.created_by), (project.designer_id)) AS recipient(user_id)
     WHERE sample.status IN ('requested', 'received')
       AND sample.return_by IS NOT NULL
       AND sample.return_by - 3 <= CURRENT_DATE
       AND recipient.user_id IS NOT NULL
       AND NOT EXISTS (
         SELECT 1 FROM public.procurement_notifications AS n
          WHERE n.subject_sample_id = sample.id
            AND n.kind = 'memo_return_due'
            AND n.user_id = recipient.user_id
       );
    GET DIAGNOSTICS v_memo = ROW_COUNT;

    -- draft_send_stalled (00720, G5): a draft claimed for sending more than
    -- 10 minutes ago. With a send on record it is sent (sent_at the log
    -- row's time, sent_by the claimer); without one it goes back to
    -- awaiting_review, unclaimed.
    WITH stalled AS (
      SELECT d.id, rec.id AS log_id, rec.created_at AS log_at, rec.provider_id
        FROM public.procurement_drafts AS d
        LEFT JOIN LATERAL public._procurement_draft_send_on_record(d.id) AS rec ON true
       WHERE d.status = 'sending'
         AND d.updated_at < now() - interval '10 minutes'
         FOR UPDATE OF d SKIP LOCKED
    )
    UPDATE public.procurement_drafts AS d
       SET status     = CASE WHEN s.log_id IS NULL THEN 'awaiting_review' ELSE 'sent' END,
           sent_by    = CASE WHEN s.log_id IS NULL THEN NULL ELSE d.sent_by END,
           sent_at    = CASE WHEN s.log_id IS NULL THEN d.sent_at ELSE s.log_at END,
           message_id = CASE WHEN s.log_id IS NULL THEN d.message_id
                             ELSE NULLIF(btrim(COALESCE(s.provider_id, '')), '') END
      FROM stalled AS s
     WHERE d.id = s.id;
    GET DIAGNOSTICS v_stalled = ROW_COUNT;
  EXCEPTION WHEN OTHERS THEN
    -- No re-RAISE (the 00300 / 00574 / 00630 idiom): the failed row persists
    -- as the failure record and the guarded block rolls back to its savepoint.
    UPDATE public.job_runs
       SET status = 'failed', finished_at = now(), error = SQLERRM,
           detail = jsonb_build_object('claim_window_closing', v_claim_window,
                                       'ack_discrepancy', v_ack,
                                       'backorder_reported', v_backorder,
                                       'quote_expiring', v_quote,
                                       'cfa_reserve_expiring', v_cfa,
                                       'memo_return_due', v_memo,
                                       'draft_send_stalled', v_stalled)
     WHERE id = v_run_id;
    RETURN jsonb_build_object('error', SQLERRM);
  END;

  v_detail := jsonb_build_object('claim_window_closing', v_claim_window,
                                 'ack_discrepancy', v_ack,
                                 'backorder_reported', v_backorder,
                                 'quote_expiring', v_quote,
                                 'cfa_reserve_expiring', v_cfa,
                                 'memo_return_due', v_memo,
                                 'draft_send_stalled', v_stalled);

  UPDATE public.job_runs
     SET status = 'succeeded', finished_at = now(), detail = v_detail
   WHERE id = v_run_id;

  RETURN v_detail;
END;
$$;

COMMENT ON FUNCTION public.ffe_ratchet_to_po_stage() IS '00862: unsent drafts stay approved; confirmed and sent orders ratchet forward. No backfill.';
REVOKE ALL ON FUNCTION public.procurement_receipt_claim_deadline(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.procurement_receipt_claim_deadline(uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.complete_receiving_inspection(uuid,text,jsonb,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.complete_receiving_inspection(uuid,text,jsonb,text) TO authenticated;
COMMIT;
