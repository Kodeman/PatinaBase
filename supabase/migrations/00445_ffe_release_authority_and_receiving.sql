-- 00445 — Close release-authority, named-need, receiving, and board-cover gaps.

CREATE OR REPLACE FUNCTION public.get_project_ffe_readiness(p_ffe_item_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_item public.project_ffe_items%ROWTYPE;
  v_spec public.project_ffe_specs%ROWTYPE;
  v_rules jsonb := '[]'::jsonb;
  v_rule text;
  v_missing text[] := '{}';
BEGIN
  SELECT * INTO v_item FROM public.project_ffe_items WHERE id = p_ffe_item_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'selection not found' USING ERRCODE = 'no_data_found';
  END IF;
  PERFORM public._ffe_require_studio_project(v_item.project_id);
  SELECT * INTO v_spec FROM public.project_ffe_specs WHERE ffe_item_id = v_item.id;
  SELECT COALESCE(template.required_field_rules->'fixed', '[]'::jsonb)
  INTO v_rules
  FROM public.spec_books book
  JOIN public.spec_book_templates template ON template.id = book.template_id
  WHERE book.project_id = v_item.project_id
  ORDER BY book.created_at
  LIMIT 1;

  FOR v_rule IN SELECT jsonb_array_elements_text(COALESCE(v_rules, '[]'::jsonb)) LOOP
    IF (v_rule = 'name' AND btrim(COALESCE(v_item.name, '')) = '')
       OR (v_rule = 'documentCode' AND btrim(COALESCE(v_item.doc_code, '')) = '')
       OR (v_rule = 'room' AND v_item.assignment_scope = 'unassigned')
       OR (v_rule = 'quantity' AND COALESCE(v_item.quantity, 0) <= 0)
       OR (v_rule = 'image' AND COALESCE(jsonb_array_length(v_spec.selected_media), 0) = 0)
       OR (v_rule = 'selection' AND v_item.product_id IS NULL)
    THEN
      v_missing := array_append(v_missing, v_rule);
    END IF;
  END LOOP;

  IF v_item.design_disposition <> 'selected' THEN
    v_missing := array_append(v_missing, 'designDisposition');
  END IF;
  IF v_item.removed_at IS NOT NULL THEN
    v_missing := array_append(v_missing, 'removed');
  END IF;
  IF v_item.blocked THEN
    v_missing := array_append(v_missing, 'releaseBlock');
  END IF;
  IF v_item.vendor_id IS NULL THEN
    v_missing := array_append(v_missing, 'vendor');
  END IF;
  IF COALESCE(v_item.quantity, 0) <= 0 THEN
    v_missing := array_append(v_missing, 'quantity');
  END IF;
  IF v_item.item_type = 'fixed' AND (
    COALESCE(v_item.unit_price_cents, 0) <= 0
    OR v_item.line_total_cents IS NULL
    OR v_item.line_total_cents <> v_item.quantity * v_item.unit_price_cents
  ) THEN
    v_missing := array_append(v_missing, 'clientPrice');
  ELSIF v_item.item_type = 'allowance' AND COALESCE(v_item.budget_max_cents, 0) <= 0 THEN
    v_missing := array_append(v_missing, 'allowanceCeiling');
  ELSIF v_item.item_type NOT IN ('fixed', 'allowance') THEN
    v_missing := array_append(v_missing, 'itemType');
  END IF;

  SELECT COALESCE(array_agg(DISTINCT missing ORDER BY missing), '{}')
  INTO v_missing
  FROM unnest(v_missing) AS missing;

  RETURN jsonb_build_object(
    'selectionId', v_item.id,
    'ready', cardinality(v_missing) = 0,
    'missingFields', to_jsonb(v_missing)
  );
END;
$$;

ALTER FUNCTION public.create_furnishings_authorization_from_schedule(uuid, text, uuid[], numeric)
  RENAME TO _create_furnishings_authorization_from_schedule_00444_impl;
REVOKE ALL ON FUNCTION public._create_furnishings_authorization_from_schedule_00444_impl(uuid, text, uuid[], numeric)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.create_furnishings_authorization_from_schedule(
  p_project_id uuid,
  p_name text,
  p_ffe_item_ids uuid[],
  p_deposit_percent numeric DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_id uuid;
  v_readiness jsonb;
BEGIN
  PERFORM public._ffe_require_studio_project(p_project_id);
  IF p_ffe_item_ids IS NULL OR cardinality(p_ffe_item_ids) = 0 THEN
    RAISE EXCEPTION 'furnishings release requires at least one schedule line'
      USING ERRCODE = 'check_violation';
  END IF;
  FOREACH v_id IN ARRAY p_ffe_item_ids LOOP
    IF NOT EXISTS (
      SELECT 1 FROM public.project_ffe_items
      WHERE id = v_id AND project_id = p_project_id
    ) THEN
      RAISE EXCEPTION 'schedule line % does not belong to project %', v_id, p_project_id
        USING ERRCODE = 'check_violation';
    END IF;
    v_readiness := public.get_project_ffe_readiness(v_id);
    IF NOT COALESCE((v_readiness->>'ready')::boolean, false) THEN
      RAISE EXCEPTION 'schedule line % is not ready for authorization: %',
        v_id, v_readiness->'missingFields'
        USING ERRCODE = 'check_violation';
    END IF;
  END LOOP;
  RETURN public._create_furnishings_authorization_from_schedule_00444_impl(
    p_project_id, p_name, p_ffe_item_ids, p_deposit_percent
  );
END;
$$;

ALTER FUNCTION public.place_product_in_project_v2(jsonb)
  RENAME TO _place_product_in_project_v2_00444_impl;
REVOKE ALL ON FUNCTION public._place_product_in_project_v2_00444_impl(jsonb)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.place_product_in_project_v2(p_request jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_request jsonb := p_request;
  v_item_type text := COALESCE(NULLIF(p_request->>'itemType', ''),
    CASE WHEN NULLIF(p_request->>'productId', '') IS NULL THEN 'tbd' ELSE 'fixed' END);
  v_result jsonb;
  v_selection_id uuid;
BEGIN
  IF NULLIF(p_request->>'roleConfigurationIdentity', '') IS NOT NULL THEN
    v_request := v_request || jsonb_build_object(
      'roleIdentity', p_request->>'roleConfigurationIdentity'
    );
  END IF;
  IF v_item_type NOT IN ('fixed', 'allowance', 'tbd') THEN
    RAISE EXCEPTION 'itemType must be fixed, allowance, or tbd'
      USING ERRCODE = 'check_violation';
  END IF;
  IF NULLIF(p_request->>'productId', '') IS NULL
     AND NULLIF(btrim(p_request->>'name'), '') IS NULL THEN
    RAISE EXCEPTION 'manual selections and placeholders require a name'
      USING ERRCODE = 'check_violation';
  END IF;
  IF v_item_type = 'allowance' AND (
    COALESCE(p_request->>'budgetMaxCents', '') !~ '^[1-9][0-9]*$'
  ) THEN
    RAISE EXCEPTION 'allowance selections require a positive budgetMaxCents'
      USING ERRCODE = 'check_violation';
  END IF;

  v_result := public._place_product_in_project_v2_00444_impl(v_request);
  IF v_result->>'outcome' <> 'held' THEN
    v_selection_id := (v_result->>'selectionId')::uuid;
    PERFORM set_config('app.ffe_mutation_rpc', 'on', true);
    UPDATE public.project_ffe_items
    SET item_type = v_item_type,
        budget_min_cents = CASE WHEN v_item_type = 'allowance'
          THEN COALESCE(NULLIF(p_request->>'budgetMinCents', '')::integer, 0)
          ELSE budget_min_cents END,
        budget_max_cents = CASE WHEN v_item_type = 'allowance'
          THEN (p_request->>'budgetMaxCents')::integer
          ELSE budget_max_cents END,
        updated_at = now()
    WHERE id = v_selection_id;
    v_result := (v_result - 'roleIdentity') || jsonb_build_object(
      'itemType', v_item_type,
      'roleConfigurationIdentity', COALESCE(
        NULLIF(p_request->>'roleConfigurationIdentity', ''),
        NULLIF(p_request->>'roleIdentity', ''),
        'default'
      )
    );
  END IF;
  RETURN v_result;
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
  v_inspection_id uuid;
BEGIN
  SELECT * INTO v_item FROM public.project_ffe_items WHERE id = p_ffe_item_id FOR UPDATE;
  IF NOT FOUND OR v_item.purchase_order_id IS NULL THEN
    RAISE EXCEPTION 'selection is not linked to a purchase order'
      USING ERRCODE = 'check_violation';
  END IF;
  PERFORM public._ffe_require_studio_project(v_item.project_id);
  IF p_received_quantity < COALESCE(v_item.received_quantity, 0)
     OR p_received_quantity > v_item.quantity THEN
    RAISE EXCEPTION 'received quantity must advance monotonically and not exceed ordered quantity'
      USING ERRCODE = 'check_violation';
  END IF;
  IF p_outcome = 'clean' AND (
    p_received_quantity <> v_item.quantity
    OR EXISTS (
      SELECT 1 FROM public.project_ffe_items sibling
      WHERE sibling.purchase_order_id = v_item.purchase_order_id
        AND sibling.id <> v_item.id
        AND COALESCE(sibling.received_quantity, 0) < sibling.quantity
    )
  ) THEN
    RAISE EXCEPTION 'clean receipt requires every purchase-order line to be fully received'
      USING ERRCODE = 'check_violation';
  END IF;
  IF p_outcome = 'partial' AND p_received_quantity >= v_item.quantity THEN
    RAISE EXCEPTION 'partial receipt must remain below the ordered quantity'
      USING ERRCODE = 'check_violation';
  END IF;

  PERFORM set_config('app.ffe_mutation_rpc', 'on', true);
  UPDATE public.project_ffe_items
  SET received_quantity = p_received_quantity, updated_at = now()
  WHERE id = v_item.id;
  INSERT INTO public.receiving_inspections(
    purchase_order_id, inspected_by, outcome, notes, photo_asset_ids
  ) VALUES (
    v_item.purchase_order_id, auth.uid(), p_outcome, NULLIF(btrim(p_notes), ''),
    COALESCE(p_photo_asset_ids, '{}')
  ) RETURNING id INTO v_inspection_id;

  RETURN jsonb_build_object(
    'selectionId', v_item.id,
    'purchaseOrderId', v_item.purchase_order_id,
    'inspectionId', v_inspection_id,
    'receivedQuantity', p_received_quantity,
    'orderedQuantity', v_item.quantity,
    'outcome', p_outcome
  );
END;
$$;

ALTER FUNCTION public.apply_board_room_state(uuid, text, uuid, jsonb)
  RENAME TO _apply_board_room_state_00444_impl;
REVOKE ALL ON FUNCTION public._apply_board_room_state_00444_impl(uuid, text, uuid, jsonb)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.apply_board_room_state(
  p_board_id uuid,
  p_owner_kind text,
  p_owner_id uuid,
  p_state jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_cover text := NULLIF(btrim(p_state->>'coverImageUrl'), '');
BEGIN
  IF p_owner_kind = 'project' AND p_state ? 'coverImageUrl' THEN
    IF length(COALESCE(v_cover, '')) > 4096
       OR (v_cover IS NOT NULL AND (
         v_cover LIKE '%/storage/v1/object/public/proposal-mood-boards/%'
         OR v_cover LIKE 'proposal-mood-boards/%'
       )) THEN
      RAISE EXCEPTION 'project board cover must use private project working media'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  PERFORM public._apply_board_room_state_00444_impl(
    p_board_id, p_owner_kind, p_owner_id, p_state
  );
  IF p_owner_kind = 'project' AND p_state ? 'coverImageUrl' THEN
    PERFORM set_config('app.board_state_rpc', 'on', true);
    UPDATE public.proposal_boards
    SET cover_image_url = v_cover
    WHERE id = p_board_id AND project_id = p_owner_id AND proposal_id IS NULL;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'project board unavailable'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.get_project_ffe_readiness(uuid),
  public.create_furnishings_authorization_from_schedule(uuid, text, uuid[], numeric),
  public.place_product_in_project_v2(jsonb),
  public.record_project_ffe_receipt(uuid, integer, public.receiving_inspection_outcome, text, uuid[]),
  public.apply_board_room_state(uuid, text, uuid, jsonb)
FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.get_project_ffe_readiness(uuid),
  public.create_furnishings_authorization_from_schedule(uuid, text, uuid[], numeric),
  public.place_product_in_project_v2(jsonb),
  public.record_project_ffe_receipt(uuid, integer, public.receiving_inspection_outcome, text, uuid[]),
  public.apply_board_room_state(uuid, text, uuid, jsonb)
TO authenticated;
