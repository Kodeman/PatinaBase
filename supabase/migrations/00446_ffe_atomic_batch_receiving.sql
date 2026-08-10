-- 00446 — Record one atomic receiving event across every line on a purchase order.

CREATE TABLE public.project_ffe_receipt_commands (
  purchase_order_id uuid NOT NULL REFERENCES public.purchase_orders(id) ON DELETE RESTRICT,
  request_hash text NOT NULL CHECK (request_hash ~ '^[0-9a-f]{64}$'),
  inspection_id uuid REFERENCES public.receiving_inspections(id) ON DELETE RESTRICT,
  response jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (purchase_order_id, request_hash)
);

ALTER TABLE public.project_ffe_receipt_commands ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.project_ffe_receipt_commands
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.record_project_ffe_receipt_batch(
  p_purchase_order_id uuid,
  p_lines jsonb,
  p_outcome public.receiving_inspection_outcome,
  p_notes text DEFAULT NULL,
  p_photo_asset_ids uuid[] DEFAULT '{}'
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

  SELECT * INTO v_po
  FROM public.purchase_orders
  WHERE id = p_purchase_order_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'purchase order not found or access denied'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT * INTO STRICT v_project FROM public.projects WHERE id = v_po.project_id;
  PERFORM public._ffe_require_studio_project(v_project.id);
  IF NOT public.is_studio_comember(v_po.designer_id) THEN
    RAISE EXCEPTION 'purchase order owner is not accessible'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF v_po.status NOT IN ('confirmed', 'in_production', 'shipped', 'delivered') THEN
    RAISE EXCEPTION 'purchase order is not in a receivable state'
      USING ERRCODE = 'check_violation';
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

  v_request_hash := encode(extensions.digest(
    jsonb_build_object(
      'lines', v_normalized_lines,
      'outcome', p_outcome,
      'notes', NULLIF(btrim(p_notes), ''),
      'photoAssetIds', to_jsonb(COALESCE(p_photo_asset_ids, '{}'))
    )::text,
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
  WHERE item.purchase_order_id = v_po.id
  ORDER BY item.id
  FOR UPDATE;
  SELECT count(*) INTO v_po_line_count
  FROM public.project_ffe_items item
  WHERE item.purchase_order_id = v_po.id;
  SELECT count(*) INTO v_input_line_count FROM jsonb_array_elements(v_normalized_lines);
  IF v_po_line_count = 0 OR v_input_line_count <> v_po_line_count
     OR EXISTS (
       SELECT 1
       FROM public.project_ffe_items item
       LEFT JOIN jsonb_array_elements(v_normalized_lines) entry
         ON (entry->>'selectionId')::uuid = item.id
       WHERE item.purchase_order_id = v_po.id
         AND entry IS NULL
     )
     OR EXISTS (
       SELECT 1
       FROM jsonb_array_elements(v_normalized_lines) entry
       LEFT JOIN public.project_ffe_items item
         ON item.id = (entry->>'selectionId')::uuid
        AND item.purchase_order_id = v_po.id
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
    WHERE item.project_id <> v_po.project_id
       OR item.vendor_id IS DISTINCT FROM v_po.vendor_id
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

  INSERT INTO public.project_ffe_receipt_commands(purchase_order_id, request_hash)
  VALUES (v_po.id, v_request_hash);
  PERFORM set_config('app.ffe_mutation_rpc', 'on', true);
  UPDATE public.project_ffe_items item
  SET received_quantity = (entry->>'receivedQuantity')::integer,
      updated_at = now()
  FROM jsonb_array_elements(v_normalized_lines) entry
  WHERE item.id = (entry->>'selectionId')::uuid
    AND item.purchase_order_id = v_po.id;

  INSERT INTO public.receiving_inspections(
    purchase_order_id, inspected_by, outcome, notes, photo_asset_ids
  ) VALUES (
    v_po.id, auth.uid(), p_outcome, NULLIF(btrim(p_notes), ''),
    COALESCE(p_photo_asset_ids, '{}')
  ) RETURNING id INTO v_inspection_id;

  v_response := jsonb_build_object(
    'purchaseOrderId', v_po.id,
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
      WHERE item.purchase_order_id = v_po.id
    )
  );
  UPDATE public.project_ffe_receipt_commands
  SET inspection_id = v_inspection_id, response = v_response
  WHERE purchase_order_id = v_po.id AND request_hash = v_request_hash;
  RETURN v_response;
END;
$$;

CREATE OR REPLACE FUNCTION public.record_project_ffe_receipt(
  p_ffe_item_id uuid,
  p_received_quantity integer,
  p_outcome public.receiving_inspection_outcome,
  p_notes text DEFAULT NULL,
  p_photo_asset_ids uuid[] DEFAULT '{}'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_item public.project_ffe_items%ROWTYPE;
  v_result jsonb;
BEGIN
  SELECT * INTO v_item FROM public.project_ffe_items WHERE id = p_ffe_item_id;
  IF NOT FOUND OR v_item.purchase_order_id IS NULL THEN
    RAISE EXCEPTION 'selection is not linked to a purchase order'
      USING ERRCODE = 'check_violation';
  END IF;
  IF (SELECT count(*) FROM public.project_ffe_items WHERE purchase_order_id = v_item.purchase_order_id) <> 1 THEN
    RAISE EXCEPTION 'multi-line purchase orders require record_project_ffe_receipt_batch'
      USING ERRCODE = 'check_violation';
  END IF;
  v_result := public.record_project_ffe_receipt_batch(
    v_item.purchase_order_id,
    jsonb_build_array(jsonb_build_object(
      'selectionId', v_item.id,
      'receivedQuantity', p_received_quantity
    )),
    p_outcome,
    p_notes,
    p_photo_asset_ids
  );
  RETURN jsonb_build_object(
    'selectionId', v_item.id,
    'purchaseOrderId', v_item.purchase_order_id,
    'inspectionId', v_result->'inspectionId',
    'receivedQuantity', p_received_quantity,
    'orderedQuantity', v_item.quantity,
    'outcome', p_outcome,
    'reused', v_result->'reused'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.record_project_ffe_receipt_batch(
  uuid, jsonb, public.receiving_inspection_outcome, text, uuid[]
), public.record_project_ffe_receipt(
  uuid, integer, public.receiving_inspection_outcome, text, uuid[]
) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.record_project_ffe_receipt_batch(
  uuid, jsonb, public.receiving_inspection_outcome, text, uuid[]
), public.record_project_ffe_receipt(
  uuid, integer, public.receiving_inspection_outcome, text, uuid[]
) TO authenticated;
