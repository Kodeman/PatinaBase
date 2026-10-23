-- 00857 — Link physical receipts to shipments or studio purchases and track inspection standing.
-- Lineage: batch 00446 → 00525 (private impl) → 00754 → 00758 → 00762;
-- inspection 00700 → 00756; receiving side effects 00184 → 00665; exceptions 00708.
-- Preserve photo validation, authorization-before-lock, cumulative quantities, room allocation,
-- legacy content-hash retries and PO/payment side effects. New keys are unique per item.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

ALTER TABLE public.receiving_inspections
  ALTER COLUMN purchase_order_id DROP NOT NULL,
  ALTER COLUMN outcome DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS po_shipment_id uuid REFERENCES public.po_shipments(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS studio_purchase_id uuid REFERENCES public.studio_purchases(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS arrival_method text,
  ADD COLUMN IF NOT EXISTS reported_by text NOT NULL DEFAULT 'studio_member',
  ADD COLUMN IF NOT EXISTS report_source text,
  ADD COLUMN IF NOT EXISTS received_on date,
  ADD COLUMN IF NOT EXISTS location_id uuid REFERENCES public.studio_locations(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS inspection_pending boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS inspection_owner_user_id uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS receipt_response jsonb;
ALTER TABLE public.receiving_inspections
  DROP CONSTRAINT IF EXISTS receiving_inspections_subject_ck,
  DROP CONSTRAINT IF EXISTS receiving_inspections_standing_ck,
  DROP CONSTRAINT IF EXISTS receiving_inspections_source_ck;
ALTER TABLE public.receiving_inspections
  ADD CONSTRAINT receiving_inspections_subject_ck CHECK (num_nonnulls(purchase_order_id, studio_purchase_id) = 1),
  ADD CONSTRAINT receiving_inspections_standing_ck CHECK (inspection_pending = (outcome IS NULL)),
  ADD CONSTRAINT receiving_inspections_source_ck CHECK (
    (arrival_method IS NULL OR arrival_method IN ('delivered', 'picked_up'))
    AND reported_by IN ('studio_member', 'receiver_report')
    AND (report_source IS NULL OR char_length(btrim(report_source)) BETWEEN 1 AND 500)
    AND (reported_by <> 'receiver_report' OR NULLIF(btrim(report_source), '') IS NOT NULL)
    AND (po_shipment_id IS NULL OR purchase_order_id IS NOT NULL)
  );
CREATE INDEX IF NOT EXISTS receiving_inspections_shipment ON public.receiving_inspections(po_shipment_id) WHERE po_shipment_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS receiving_inspections_purchase ON public.receiving_inspections(studio_purchase_id) WHERE studio_purchase_id IS NOT NULL;

ALTER TABLE public.receiving_inspection_lines
  ALTER COLUMN condition DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS quantity_received integer CHECK (quantity_received >= 0),
  ADD COLUMN IF NOT EXISTS receipt_key uuid;
CREATE UNIQUE INDEX IF NOT EXISTS receiving_inspection_lines_receipt_key
  ON public.receiving_inspection_lines(ffe_item_id, receipt_key) WHERE receipt_key IS NOT NULL;
COMMENT ON COLUMN public.receiving_inspection_lines.quantity_received IS
  'Increment received in this event, not the cumulative received_quantity. NULL for legacy events without a shipment link.';
COMMENT ON COLUMN public.receiving_inspections.inspection_pending IS
  'Arrival recorded but not inspected; outcome is NULL, never clean. inspected_by identifies the studio actor recording the report.';

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
  IF NEW.inspection_owner_user_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.organization_members member WHERE member.organization_id = v_org
      AND member.user_id = NEW.inspection_owner_user_id AND member.status = 'active' AND member.role <> 'guest'
  ) THEN
    RAISE EXCEPTION 'inspection owner must be an active studio member' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.location_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.studio_locations location
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
REVOKE ALL ON FUNCTION public.validate_receipt_linkage() FROM PUBLIC, anon, authenticated, service_role;
DROP TRIGGER IF EXISTS validate_receipt_linkage ON public.receiving_inspections;
CREATE TRIGGER validate_receipt_linkage BEFORE INSERT OR UPDATE ON public.receiving_inspections
  FOR EACH ROW EXECUTE FUNCTION public.validate_receipt_linkage();

-- Keep the established PO policy; purchase-only rows follow the same project purchasing authority.
DROP POLICY IF EXISTS receiving_inspections_studio_rw ON public.receiving_inspections;
CREATE POLICY receiving_inspections_studio_rw ON public.receiving_inspections FOR ALL TO authenticated
  USING (public.can_send_purchase_order(purchase_order_id) OR EXISTS (
    SELECT 1 FROM public.studio_purchases sp WHERE sp.id = studio_purchase_id AND public.can_buy_for_project(sp.project_id)
  ))
  WITH CHECK (public.can_send_purchase_order(purchase_order_id) OR EXISTS (
    SELECT 1 FROM public.studio_purchases sp WHERE sp.id = studio_purchase_id AND public.can_buy_for_project(sp.project_id)
  ));
DROP POLICY IF EXISTS receiving_inspection_lines_studio_select ON public.receiving_inspection_lines;
CREATE POLICY receiving_inspection_lines_studio_select ON public.receiving_inspection_lines FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.receiving_inspections ri WHERE ri.id = inspection_id));

-- Arrival, including pending inspection, still starts the established PO balance clock.
-- The actual receipt date wins only for new rows which explicitly supply it.

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
  IF NEW.outcome = 'clean' THEN
    UPDATE project_ffe_items
       SET received_quantity = quantity,
           updated_at        = NOW()
     WHERE purchase_order_id = NEW.purchase_order_id
       AND (received_quantity IS NULL OR received_quantity < quantity);
  END IF;

  RETURN NEW;
END;
$$;
DROP FUNCTION IF EXISTS public.record_project_ffe_inspection(uuid, jsonb, public.receiving_inspection_outcome, text, uuid[]);
DROP FUNCTION IF EXISTS public.record_project_ffe_receipt_batch(uuid, jsonb, public.receiving_inspection_outcome, text, uuid[]);
DROP FUNCTION IF EXISTS public._record_project_ffe_receipt_batch_00446_impl(uuid, jsonb, public.receiving_inspection_outcome, text, uuid[]);

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

CREATE OR REPLACE FUNCTION public.record_project_ffe_receipt_batch(
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
AS $fn$
DECLARE
  v_project_id  uuid;
  v_asset_rel   regclass;
  v_col_id      text;
  v_col_status  text;
  v_col_scan    text;
  v_col_upload  text;
  v_col_perms   text;
  v_col_tags    text;
  v_ambiguous   text;
  v_invalid     boolean;
  -- 00754: receiving by room.
  v_entry       jsonb;
  v_given       jsonb;
  v_given_ids   uuid[];
  v_impl_lines  jsonb;
  v_received_before jsonb;
  v_response    jsonb;
  v_batch_id    uuid;
  v_item_id     uuid;
  v_receipt     bigint;
  v_given_total bigint;
  v_left        bigint;
  v_take        bigint;
  v_placement   record;
  v_lacking     bigint;  -- 00758 (F11)
  v_purchase public.studio_purchases%ROWTYPE;
  v_designer_id uuid;    -- 00762 (F5)
BEGIN
  IF jsonb_typeof(p_lines) IS DISTINCT FROM 'array' OR EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_lines) entry
    WHERE entry->>'receivedQuantity' !~ '^[0-9]{1,10}$'
       OR (entry->>'receivedQuantity')::numeric > 2147483647
  ) THEN
    RAISE EXCEPTION 'receivedQuantity must be a nonnegative 32-bit integer'
      USING ERRCODE = 'check_violation';
  END IF;

  -- 00754: the optional placements key, shape only. Ownership is checked
  -- after the impl has authorized the caller.
  FOR v_entry IN SELECT entry FROM jsonb_array_elements(p_lines) entry LOOP
    CONTINUE WHEN jsonb_typeof(v_entry) IS DISTINCT FROM 'object' OR NOT (v_entry ? 'placements');
    IF jsonb_typeof(v_entry -> 'placements') IS DISTINCT FROM 'array' THEN
      RAISE EXCEPTION 'placements must be a list of placementId and quantity entries'
        USING ERRCODE = 'check_violation';
    END IF;
    v_given_ids := ARRAY[]::uuid[];
    FOR v_given IN SELECT given FROM jsonb_array_elements(v_entry -> 'placements') given LOOP
      IF jsonb_typeof(v_given) IS DISTINCT FROM 'object'
         OR EXISTS (SELECT 1 FROM jsonb_object_keys(v_given) key
                    WHERE key NOT IN ('placementId', 'quantity'))
         OR jsonb_typeof(v_given -> 'placementId') IS DISTINCT FROM 'string'
         OR (v_given ->> 'placementId') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
         OR jsonb_typeof(v_given -> 'quantity') IS DISTINCT FROM 'number'
         OR (v_given ->> 'quantity') !~ '^[0-9]{1,10}$'
      THEN
        RAISE EXCEPTION 'placements must be a list of placementId and quantity entries'
          USING ERRCODE = 'check_violation';
      END IF;
      IF (v_given ->> 'quantity')::bigint NOT BETWEEN 1 AND 2147483647 THEN
        RAISE EXCEPTION 'Each room''s receipt is a whole number above zero.'
          USING ERRCODE = 'check_violation';
      END IF;
      IF (v_given ->> 'placementId')::uuid = ANY (v_given_ids) THEN
        RAISE EXCEPTION 'A room appears twice in the receipt.'
          USING ERRCODE = 'check_violation';
      END IF;
      v_given_ids := v_given_ids || (v_given ->> 'placementId')::uuid;
    END LOOP;
  END LOOP;

  IF p_purchase_order_id IS NOT NULL THEN
  -- 00762 (F5): authorize before taking the lock, with the impl's own checks
  -- and errors (00446 impl), so an unauthorized caller never holds the PO row.
  SELECT project_id, designer_id INTO v_project_id, v_designer_id
  FROM public.purchase_orders
  WHERE id = p_purchase_order_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'purchase order not found or access denied'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  PERFORM public._ffe_require_studio_project(v_project_id);
  IF NOT public.is_studio_comember(v_designer_id) THEN
    RAISE EXCEPTION 'purchase order owner is not accessible'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- 00754: lock the PO (the impl's first lock, taken earlier) so the
  -- quantities read below are the ones this batch advances from.
  SELECT project_id INTO v_project_id
  FROM public.purchase_orders
  WHERE id = p_purchase_order_id
  FOR UPDATE;

  ELSE
    SELECT * INTO v_purchase FROM public.studio_purchases WHERE id = p_studio_purchase_id;
    IF NOT FOUND OR v_purchase.ffe_item_id IS NULL OR NOT public.can_buy_for_project(v_purchase.project_id) THEN
      RAISE EXCEPTION 'studio purchase not found or access denied' USING ERRCODE = 'insufficient_privilege';
    END IF;
    SELECT * INTO v_purchase FROM public.studio_purchases WHERE id = p_studio_purchase_id FOR UPDATE;
    v_project_id := v_purchase.project_id;
  END IF;

  SELECT COALESCE(jsonb_object_agg(item.id::text, COALESCE(item.received_quantity, 0)), '{}'::jsonb)
  INTO v_received_before
  FROM public.project_ffe_items item
  WHERE item.purchase_order_id = p_purchase_order_id OR item.id = v_purchase.ffe_item_id;

  IF cardinality(COALESCE(p_photo_asset_ids, '{}')) > 0 THEN
    v_asset_rel := COALESCE(
      to_regclass('svc_media."MediaAsset"'),
      to_regclass('svc_media.media_assets')
    );
    IF v_asset_rel IS NULL THEN
      RAISE EXCEPTION 'receiving photos cannot be validated: the svc_media asset table is absent'
        USING ERRCODE = 'integrity_constraint_violation';
    END IF;

    -- A key that two physical columns collapse onto (a half-finished @@map
    -- rollout leaving scan_status beside "scanStatus") must abort rather than
    -- silently bind whichever spelling sorts higher.
    SELECT
      max(col.ident) FILTER (WHERE col.key = 'id'),
      max(col.ident) FILTER (WHERE col.key = 'status'),
      max(col.ident) FILTER (WHERE col.key = 'scanstatus'),
      max(col.ident) FILTER (WHERE col.key = 'uploadedby'),
      max(col.ident) FILTER (WHERE col.key = 'permissions'),
      max(col.ident) FILTER (WHERE col.key = 'tags'),
      string_agg(DISTINCT col.key, ', ') FILTER (WHERE col.collisions > 1)
    INTO v_col_id, v_col_status, v_col_scan, v_col_upload, v_col_perms,
         v_col_tags, v_ambiguous
    FROM (
      SELECT lower(replace(attribute.attname, '_', '')) AS key,
             quote_ident(attribute.attname) AS ident,
             count(*) OVER (
               PARTITION BY lower(replace(attribute.attname, '_', ''))
             ) AS collisions
      FROM pg_attribute AS attribute
      WHERE attribute.attrelid = v_asset_rel
        AND attribute.attnum > 0
        AND NOT attribute.attisdropped
    ) AS col
    WHERE col.key IN (
      'id', 'status', 'scanstatus', 'uploadedby', 'permissions', 'tags'
    );

    IF v_ambiguous IS NOT NULL THEN
      RAISE EXCEPTION
        'receiving photos cannot be validated: % carries more than one column for: %',
        v_asset_rel::text, v_ambiguous
        USING ERRCODE = 'integrity_constraint_violation';
    END IF;

    IF v_col_id IS NULL OR v_col_status IS NULL OR v_col_scan IS NULL
       OR v_col_upload IS NULL OR v_col_perms IS NULL OR v_col_tags IS NULL THEN
      RAISE EXCEPTION 'receiving photos cannot be validated: % is missing a required asset column',
        v_asset_rel::text
        USING ERRCODE = 'integrity_constraint_violation';
    END IF;

    EXECUTE format(
      'SELECT EXISTS ('
      ||   'SELECT 1 '
      ||     'FROM unnest($1::uuid[]) AS requested(asset_id) '
      ||     'LEFT JOIN %s AS asset ON asset.%s::text = requested.asset_id::text '
      ||    'WHERE asset.%s IS NULL '
      ||       'OR asset.%s::text <> ''READY'' '
      ||       'OR asset.%s::text <> ''CLEAN'' '
      ||       'OR asset.%s::text IS DISTINCT FROM $2::text '
      ||       'OR asset.%s->>''projectId'' IS DISTINCT FROM $3::text '
      ||       'OR NOT (''receiving'' = ANY(COALESCE(asset.%s, ''{}''::text[])))'
      || ')',
      v_asset_rel::text,
      v_col_id,
      v_col_id,
      v_col_status,
      v_col_scan,
      v_col_upload,
      v_col_perms,
      v_col_tags
    )
    USING p_photo_asset_ids, auth.uid()::text, v_project_id::text
    INTO v_invalid;

    IF v_invalid THEN
      RAISE EXCEPTION 'receiving photos must be clean project receiving assets owned by the actor'
        USING ERRCODE = 'integrity_constraint_violation';
    END IF;
  END IF;

  -- 00754: the impl allows only selectionId and receivedQuantity, and hashes
  -- exactly those; the placements key is ours.
  SELECT COALESCE(jsonb_agg(
           CASE WHEN jsonb_typeof(entry) = 'object' THEN entry - 'placements' ELSE entry END
           ORDER BY ordinality), '[]'::jsonb)
  INTO v_impl_lines
  FROM jsonb_array_elements(p_lines) WITH ORDINALITY AS lines(entry, ordinality);

  v_response := public._record_project_ffe_receipt_batch_00446_impl(
    p_purchase_order_id, v_impl_lines, p_outcome, p_notes, p_photo_asset_ids, p_po_shipment_id, p_studio_purchase_id, p_arrival_method, p_reported_by,
    p_report_source, p_received_on, p_location_id, p_inspection_pending,
    p_inspection_owner_user_id, p_receipt_key
  );

  -- 00754: allocate this batch's receipt to the line's rooms. A reused
  -- request already allocated when it first ran.
  IF COALESCE((v_response ->> 'reused')::boolean, false) THEN
    RETURN v_response;
  END IF;
  v_batch_id := (v_response ->> 'inspectionId')::uuid;

  FOR v_entry IN SELECT entry FROM jsonb_array_elements(p_lines) entry LOOP
    v_item_id := (v_entry ->> 'selectionId')::uuid;
    v_receipt := (v_entry ->> 'receivedQuantity')::bigint
                 - COALESCE((v_received_before ->> v_item_id::text)::bigint, 0);

    IF v_entry ? 'placements' THEN
      IF EXISTS (
        SELECT 1
        FROM jsonb_array_elements(v_entry -> 'placements') given
        LEFT JOIN public.project_ffe_placements placement
          ON placement.id = (given ->> 'placementId')::uuid
         AND placement.ffe_item_id = v_item_id
        WHERE placement.id IS NULL
      ) THEN
        RAISE EXCEPTION 'That room is not one this line is placed in.'
          USING ERRCODE = 'check_violation';
      END IF;

      SELECT COALESCE(sum((given ->> 'quantity')::bigint), 0) INTO v_given_total
      FROM jsonb_array_elements(v_entry -> 'placements') given;
      IF v_given_total > v_receipt THEN
        RAISE EXCEPTION 'The rooms are given %, more than the % this delivery brought.',
          v_given_total, v_receipt
          USING ERRCODE = 'check_violation';
      END IF;

      IF EXISTS (
        SELECT 1
        FROM jsonb_array_elements(v_entry -> 'placements') given
        JOIN public.project_ffe_placements placement
          ON placement.id = (given ->> 'placementId')::uuid
        WHERE (given ->> 'quantity')::bigint
              + COALESCE((SELECT sum(earlier.quantity)
                          FROM public.project_ffe_placement_receipts earlier
                          WHERE earlier.placement_id = placement.id), 0)
              > placement.quantity
      ) THEN
        RAISE EXCEPTION 'A room cannot receive more than is placed there.'
          USING ERRCODE = 'check_violation';
      END IF;

      -- 00758 (F11): named rooms account for the whole delivery, as 00756
      -- checks: this batch's receipt, or all the rooms still lack when that
      -- is less (the waste).
      SELECT COALESCE(sum(GREATEST(placement.quantity - COALESCE((
               SELECT sum(earlier.quantity)
                 FROM public.project_ffe_placement_receipts earlier
                WHERE earlier.placement_id = placement.id), 0), 0)), 0)
        INTO v_lacking
        FROM public.project_ffe_placements placement
       WHERE placement.ffe_item_id = v_item_id;
      IF v_given_total <> LEAST(GREATEST(v_receipt, 0), v_lacking) THEN
        RAISE EXCEPTION 'The rooms add up to %, but this delivery brought % to place.',
          v_given_total, LEAST(GREATEST(v_receipt, 0), v_lacking)
          USING ERRCODE = 'check_violation';
      END IF;

      INSERT INTO public.project_ffe_placement_receipts (placement_id, receipt_batch_id, quantity)
      SELECT (given ->> 'placementId')::uuid, v_batch_id, (given ->> 'quantity')::integer
      FROM jsonb_array_elements(v_entry -> 'placements') given;
    ELSE
      v_left := v_receipt;
      FOR v_placement IN
        SELECT placement.id,
               placement.quantity - COALESCE((SELECT sum(earlier.quantity)
                                              FROM public.project_ffe_placement_receipts earlier
                                              WHERE earlier.placement_id = placement.id), 0) AS lacking
        FROM public.project_ffe_placements placement
        WHERE placement.ffe_item_id = v_item_id
        ORDER BY placement.sort_order, placement.created_at, placement.id
      LOOP
        EXIT WHEN v_left <= 0;
        v_take := LEAST(v_left, GREATEST(v_placement.lacking, 0));
        IF v_take > 0 THEN
          INSERT INTO public.project_ffe_placement_receipts (placement_id, receipt_batch_id, quantity)
          VALUES (v_placement.id, v_batch_id, v_take::integer);
          v_left := v_left - v_take;
        END IF;
      END LOOP;
    END IF;
  END LOOP;

  RETURN v_response;
END;
$fn$;

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

  -- 00756: each roomed line's count before this delivery. Read only to size
  -- the delivery once the batch below has passed its access checks.
  SELECT COALESCE(jsonb_object_agg(item.id::text, COALESCE(item.received_quantity, 0)), '{}'::jsonb)
  INTO v_received_before
  FROM public.project_ffe_items item
  WHERE item.purchase_order_id = p_purchase_order_id
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

REVOKE ALL ON FUNCTION public._record_project_ffe_receipt_batch_00446_impl(uuid, jsonb, public.receiving_inspection_outcome, text, uuid[], uuid, uuid, text, text, text, date, uuid, boolean, uuid, uuid) FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.record_project_ffe_receipt_batch(uuid, jsonb, public.receiving_inspection_outcome, text, uuid[], uuid, uuid, text, text, text, date, uuid, boolean, uuid, uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.record_project_ffe_receipt_batch(uuid, jsonb, public.receiving_inspection_outcome, text, uuid[], uuid, uuid, text, text, text, date, uuid, boolean, uuid, uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.record_project_ffe_inspection(uuid, jsonb, public.receiving_inspection_outcome, text, uuid[], uuid, uuid, text, text, text, date, uuid, boolean, uuid, uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.record_project_ffe_inspection(uuid, jsonb, public.receiving_inspection_outcome, text, uuid[], uuid, uuid, text, text, text, date, uuid, boolean, uuid, uuid) TO authenticated;
-- Purchase-only receipts must never be attached to the existing PO-only exception model.
CREATE OR REPLACE FUNCTION public.open_procurement_exception(p_request jsonb)
RETURNS public.procurement_exceptions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_uid        uuid := auth.uid();
  v_req        jsonb := COALESCE(p_request, '{}'::jsonb);
  v_keys       constant text[] := ARRAY['type', 'ffeItemId', 'purchaseOrderId', 'shipmentId', 'inspectionId',
                                        'damageClaimId', 'note', 'evidenceMediaIds', 'clockDueOn', 'clockBasis'];
  v_key        text;
  v_type       text := NULLIF(btrim(COALESCE(v_req->>'type', '')), '');
  v_note       text := NULLIF(btrim(COALESCE(v_req->>'note', '')), '');
  v_basis      text := NULLIF(btrim(COALESCE(v_req->>'clockBasis', '')), '');
  v_due        date;
  v_item_id    uuid;
  v_po_id      uuid;
  v_shipment_id uuid;
  v_inspection_id uuid;
  v_claim_id   uuid;
  v_media      uuid[] := '{}'::uuid[];
  v_found      uuid;
  v_item       public.project_ffe_items%ROWTYPE;
  v_po         public.purchase_orders%ROWTYPE;
  v_claim      public.damage_claims%ROWTYPE;
  v_project_id uuid;
  v_project    public.projects%ROWTYPE;
  v_clock      record;
  v_vendor     text;
  v_row        public.procurement_exceptions%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'open_procurement_exception: not authenticated' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF jsonb_typeof(v_req) <> 'object' THEN
    RAISE EXCEPTION 'open_procurement_exception: request must be an object' USING ERRCODE = 'check_violation';
  END IF;
  IF (v_req - v_keys) <> '{}'::jsonb THEN
    RAISE EXCEPTION 'open_procurement_exception: unknown keys %',
      (SELECT string_agg(key, ', ') FROM jsonb_object_keys(v_req - v_keys) AS key)
      USING ERRCODE = 'check_violation';
  END IF;
  FOR v_key IN SELECT key FROM jsonb_object_keys(v_req) AS key LOOP
    IF jsonb_typeof(v_req->v_key) <> 'null' AND jsonb_typeof(v_req->v_key) <> (CASE
         WHEN v_key = 'evidenceMediaIds' THEN 'array' ELSE 'string' END) THEN
      RAISE EXCEPTION 'open_procurement_exception: % has the wrong type', v_key USING ERRCODE = 'check_violation';
    END IF;
  END LOOP;
  IF v_type = 'ack_discrepancy' THEN
    RAISE EXCEPTION 'open_procurement_exception: an acknowledgment discrepancy opens from log_po_acknowledgment_v2'
      USING ERRCODE = 'check_violation';
  END IF;
  IF v_type IS NULL OR v_type NOT IN ('concealed_damage', 'damage', 'short_ship', 'wrong_item', 'delay',
                                      'backorder', 'discontinued', 'price_change') THEN
    RAISE EXCEPTION 'open_procurement_exception: type must be concealed_damage, damage, short_ship, wrong_item, delay, backorder, discontinued or price_change'
      USING ERRCODE = 'check_violation';
  END IF;
  IF char_length(v_note) > 2000 OR char_length(v_basis) > 500 THEN
    RAISE EXCEPTION 'open_procurement_exception: note is at most 2000 characters, clockBasis 500'
      USING ERRCODE = 'check_violation';
  END IF;

  BEGIN
    v_item_id := NULLIF(btrim(COALESCE(v_req->>'ffeItemId', '')), '')::uuid;
    v_po_id := NULLIF(btrim(COALESCE(v_req->>'purchaseOrderId', '')), '')::uuid;
    v_shipment_id := NULLIF(btrim(COALESCE(v_req->>'shipmentId', '')), '')::uuid;
    v_inspection_id := NULLIF(btrim(COALESCE(v_req->>'inspectionId', '')), '')::uuid;
    v_claim_id := NULLIF(btrim(COALESCE(v_req->>'damageClaimId', '')), '')::uuid;
    IF jsonb_typeof(v_req->'evidenceMediaIds') = 'array' THEN
      SELECT COALESCE(array_agg(DISTINCT value::uuid), '{}'::uuid[]) INTO v_media
      FROM jsonb_array_elements_text(v_req->'evidenceMediaIds') AS value;
    END IF;
  EXCEPTION WHEN invalid_text_representation THEN
    RAISE EXCEPTION 'open_procurement_exception: subject ids and evidenceMediaIds must be ids'
      USING ERRCODE = 'check_violation';
  END;
  BEGIN
    v_due := NULLIF(btrim(COALESCE(v_req->>'clockDueOn', '')), '')::date;
  EXCEPTION WHEN invalid_datetime_format OR datetime_field_overflow THEN
    RAISE EXCEPTION 'open_procurement_exception: clockDueOn must be a date (YYYY-MM-DD)'
      USING ERRCODE = 'check_violation';
  END;
  IF cardinality(v_media) > 50 THEN
    RAISE EXCEPTION 'open_procurement_exception: at most 50 evidence media ids' USING ERRCODE = 'check_violation';
  END IF;

  -- Walk the subjects down to one PO and project; every given id must agree.
  IF v_claim_id IS NOT NULL THEN
    SELECT * INTO v_claim FROM public.damage_claims WHERE id = v_claim_id FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'open_procurement_exception: subject not found or access denied' USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF v_inspection_id IS NOT NULL AND v_inspection_id <> v_claim.receiving_inspection_id
       OR v_item_id IS NOT NULL AND v_claim.ffe_item_id IS NOT NULL AND v_item_id <> v_claim.ffe_item_id THEN
      RAISE EXCEPTION 'open_procurement_exception: the subjects do not belong together' USING ERRCODE = 'check_violation';
    END IF;
    v_inspection_id := v_claim.receiving_inspection_id;
    v_item_id := COALESCE(v_item_id, v_claim.ffe_item_id);
  END IF;
  IF v_inspection_id IS NOT NULL THEN
    SELECT purchase_order_id INTO v_found FROM public.receiving_inspections WHERE id = v_inspection_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'open_procurement_exception: subject not found or access denied' USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF v_found IS NULL THEN
      RAISE EXCEPTION 'exception_requires_purchase_order: inspection has no purchase order'
        USING ERRCODE = 'check_violation';
    END IF;
    IF v_po_id IS NOT NULL AND v_po_id <> v_found THEN
      RAISE EXCEPTION 'open_procurement_exception: the subjects do not belong together' USING ERRCODE = 'check_violation';
    END IF;
    v_po_id := v_found;
  END IF;
  IF v_shipment_id IS NOT NULL THEN
    SELECT purchase_order_id INTO v_found FROM public.po_shipments WHERE id = v_shipment_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'open_procurement_exception: subject not found or access denied' USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF v_po_id IS NOT NULL AND v_po_id <> v_found THEN
      RAISE EXCEPTION 'open_procurement_exception: the subjects do not belong together' USING ERRCODE = 'check_violation';
    END IF;
    v_po_id := v_found;
  END IF;
  IF v_item_id IS NOT NULL THEN
    SELECT * INTO v_item FROM public.project_ffe_items WHERE id = v_item_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'open_procurement_exception: subject not found or access denied' USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF v_po_id IS NOT NULL AND v_item.purchase_order_id IS DISTINCT FROM v_po_id THEN
      RAISE EXCEPTION 'open_procurement_exception: the subjects do not belong together' USING ERRCODE = 'check_violation';
    END IF;
    v_po_id := v_item.purchase_order_id;
    v_project_id := v_item.project_id;
  END IF;
  IF v_po_id IS NOT NULL THEN
    SELECT * INTO v_po FROM public.purchase_orders WHERE id = v_po_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'open_procurement_exception: subject not found or access denied' USING ERRCODE = 'insufficient_privilege';
    END IF;
    v_project_id := v_po.project_id;
  END IF;
  IF v_project_id IS NULL THEN
    RAISE EXCEPTION 'open_procurement_exception: name a subject (a line, purchase order, shipment, inspection or damage claim)'
      USING ERRCODE = 'check_violation';
  END IF;
  SELECT * INTO v_project FROM public.projects WHERE id = v_project_id;
  IF NOT public.can_buy_for_project(v_project_id) THEN
    RAISE EXCEPTION 'open_procurement_exception: subject not found or access denied' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF v_claim.id IS NOT NULL AND v_claim.exception_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.procurement_exceptions WHERE id = v_claim.exception_id AND status <> 'resolved'
  ) THEN
    RAISE EXCEPTION 'open_procurement_exception: damage claim % already has an open exception', v_claim.id
      USING ERRCODE = 'check_violation';
  END IF;

  -- The claim clock (00700 / R-PB9): the vendor's window, or the carrier's.
  IF v_type IN ('concealed_damage', 'damage', 'short_ship', 'wrong_item') THEN
    v_due := NULL;
    v_basis := NULL;
    IF v_po.id IS NOT NULL THEN
      SELECT * INTO v_clock FROM public.procurement_claim_deadline(v_po.id);
      SELECT name INTO v_vendor FROM public.vendors WHERE id = v_po.vendor_id;
      IF v_clock.delivered_on IS NOT NULL THEN
        IF v_type = 'concealed_damage' THEN
          v_due := v_clock.carrier_deadline;
          v_basis := format('The carrier wants concealed damage reported within %s days of delivery.',
                            v_clock.concealed_carrier_days);
        ELSE
          v_due := v_clock.vendor_deadline;
          v_basis := format('%s wants written notice within %s days of delivery.',
                            COALESCE(v_vendor, 'The vendor'), v_clock.claims_window_days);
        END IF;
      END IF;
    END IF;
  ELSIF v_due IS NOT NULL AND v_basis IS NULL THEN
    RAISE EXCEPTION 'open_procurement_exception: a clockDueOn needs its clockBasis in plain words'
      USING ERRCODE = 'check_violation';
  END IF;

  INSERT INTO public.procurement_exceptions (
    organization_id, project_id, type, ffe_item_id, purchase_order_id, shipment_id, inspection_id,
    damage_claim_id, status, opened_by, clock_due_on, clock_basis, evidence_media_ids, note
  ) VALUES (
    COALESCE(v_project.studio_id, public._primary_studio_for(v_project.designer_id)), v_project_id, v_type,
    v_item_id, v_po_id, v_shipment_id, v_inspection_id, v_claim_id, 'open', v_uid,
    v_due, CASE WHEN v_due IS NOT NULL THEN v_basis END, v_media, v_note
  )
  RETURNING * INTO v_row;

  IF v_claim.id IS NOT NULL THEN
    UPDATE public.damage_claims SET exception_id = v_row.id WHERE id = v_claim.id;
  END IF;
  RETURN v_row;
END;
$$;

COMMIT;
