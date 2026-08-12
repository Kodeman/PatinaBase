-- Materialized 2026-08-12 from Strata's migration ledger (applied out-of-band; git had no source file). Do not re-run manually.

-- 00447 — Close the final adversarial authorization and atomicity gaps.

DROP POLICY IF EXISTS "Designers manage their own purchase orders" ON public.purchase_orders;

CREATE POLICY purchase_orders_studio_read ON public.purchase_orders
FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.projects project
  WHERE project.id = purchase_orders.project_id
    AND public.is_studio_comember(project.designer_id)
));

REVOKE INSERT, UPDATE, DELETE ON TABLE public.purchase_orders FROM authenticated;

CREATE OR REPLACE FUNCTION public.guard_purchase_order_rpc_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  IF current_user IN ('postgres', 'service_role')
     OR current_setting('app.ffe_mutation_rpc', true) = 'on' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;
  RAISE EXCEPTION 'purchase-order lifecycle and commercial fields are RPC-only'
    USING ERRCODE = 'insufficient_privilege';
END;
$$;

DROP TRIGGER IF EXISTS guard_purchase_order_rpc_mutation_trg ON public.purchase_orders;

CREATE TRIGGER guard_purchase_order_rpc_mutation_trg
BEFORE INSERT OR UPDATE OR DELETE ON public.purchase_orders
FOR EACH ROW EXECUTE FUNCTION public.guard_purchase_order_rpc_mutation();

CREATE OR REPLACE FUNCTION public.guard_purchase_order_change_immutable()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public', 'pg_temp' AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'purchase order change records are immutable'
      USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.project_id IS DISTINCT FROM OLD.project_id
     OR NEW.purchase_order_id IS DISTINCT FROM OLD.purchase_order_id
     OR NEW.project_ffe_item_id IS DISTINCT FROM OLD.project_ffe_item_id
     OR NEW.change_kind IS DISTINCT FROM OLD.change_kind
     OR NEW.reason IS DISTINCT FROM OLD.reason
     OR NEW.prior_snapshot IS DISTINCT FROM OLD.prior_snapshot
     OR NEW.requested_vendor_id IS DISTINCT FROM OLD.requested_vendor_id
     OR NEW.created_by IS DISTINCT FROM OLD.created_by
     OR NEW.created_at IS DISTINCT FROM OLD.created_at
  THEN
    RAISE EXCEPTION 'purchase order change evidence is immutable'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

ALTER FUNCTION public.start_purchase_order_change(jsonb)
  RENAME TO _start_purchase_order_change_00446_impl;

REVOKE ALL ON FUNCTION public._start_purchase_order_change_00446_impl(jsonb)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.start_purchase_order_change(p_request jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_po public.purchase_orders%ROWTYPE;
  v_result jsonb;
  v_line_ids uuid[];
  v_replacement public.purchase_orders%ROWTYPE;
  v_vendor_id uuid := CASE WHEN p_request->>'replacementVendorId' ~* '^[0-9a-f-]{36}$'
    THEN (p_request->>'replacementVendorId')::uuid END;
BEGIN
  SELECT * INTO v_po FROM public.purchase_orders
  WHERE id = NULLIF(p_request->>'purchaseOrderId', '')::uuid FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'purchase order not found' USING ERRCODE = 'no_data_found';
  END IF;
  SELECT array_agg(id ORDER BY id) INTO v_line_ids
  FROM public.project_ffe_items WHERE purchase_order_id = v_po.id;
  v_result := public._start_purchase_order_change_00446_impl(p_request);
  IF (v_result->>'rebuildable')::boolean AND p_request->>'changeKind' = 'vendor_change' THEN
    IF cardinality(v_line_ids) = 0 THEN
      RAISE EXCEPTION 'vendor change cannot rebuild an empty purchase order'
        USING ERRCODE = 'check_violation';
    END IF;
    PERFORM set_config('app.ffe_mutation_rpc', 'on', true);
    UPDATE public.project_ffe_items item
    SET vendor_id = v_vendor_id,
        vendor_name = vendor.name,
        updated_at = now()
    FROM public.vendors vendor
    WHERE item.id = ANY(v_line_ids) AND vendor.id = v_vendor_id;
    v_replacement := public.create_purchase_order(
      v_po.project_id, v_vendor_id, v_po.payment_pattern, v_line_ids,
      NULL, v_po.confirmed_eta, v_po.is_patina_catalog,
      NULL, NULL, '[]'::jsonb, v_po.sidemark, v_po.notes
    );
    UPDATE public.purchase_order_changes
    SET replacement_purchase_order_id = v_replacement.id
    WHERE id = (v_result->>'changeId')::uuid;
    v_result := v_result || jsonb_build_object('replacementPoId', v_replacement.id);
  ELSE
    v_result := v_result || jsonb_build_object('replacementPoId', NULL);
  END IF;
  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.continue_board_in_project(p_project_board_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_source public.project_boards%ROWTYPE;
  v_new_id uuid;
BEGIN
  SELECT * INTO v_source FROM public.project_boards
  WHERE id = p_project_board_id FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'board not found or not accessible'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  PERFORM public._ffe_require_studio_project(v_source.project_id);
  SELECT id INTO v_new_id FROM public.proposal_boards
  WHERE source_project_board_id = p_project_board_id;
  IF v_new_id IS NOT NULL THEN RETURN v_new_id; END IF;

  PERFORM set_config('app.board_state_rpc', 'on', true);
  INSERT INTO public.proposal_boards(
    proposal_id, project_id, source_project_board_id, name, scope_room_id,
    project_room_id, cover_image_url, canvas_width, canvas_height,
    background_color, sort_order, sections, status
  ) VALUES (
    NULL, v_source.project_id, v_source.id, v_source.name, NULL,
    v_source.project_room_id, v_source.cover_image_url, v_source.canvas_width,
    v_source.canvas_height, v_source.background_color, v_source.sort_order,
    COALESCE(v_source.sections, '[]'::jsonb), 'active'
  )
  ON CONFLICT (source_project_board_id) WHERE source_project_board_id IS NOT NULL
  DO NOTHING RETURNING id INTO v_new_id;
  IF v_new_id IS NULL THEN
    SELECT id INTO STRICT v_new_id FROM public.proposal_boards
    WHERE source_project_board_id = p_project_board_id;
    RETURN v_new_id;
  END IF;

  INSERT INTO public.proposal_board_items(
    board_id, type, x, y, width, height, z_index, rotation, locked,
    product_id, image_url, content, data, project_ffe_item_id
  )
  SELECT v_new_id,
    COALESCE(element->>'type', 'image'),
    COALESCE((element->>'x')::numeric, 0),
    COALESCE((element->>'y')::numeric, 0),
    COALESCE((element->>'width')::numeric, 240),
    NULLIF(element->>'height', '')::numeric,
    COALESCE(NULLIF(element->>'z_index', '')::integer, 0),
    COALESCE(NULLIF(element->>'rotation', '')::numeric, 0),
    COALESCE(NULLIF(element->>'locked', '')::boolean, false),
    NULLIF(element->>'product_id', '')::uuid,
    NULLIF(element->>'image_url', ''),
    element->>'content',
    COALESCE(element->'data', '{}'::jsonb) - 'project_ffe_item_id',
    CASE WHEN element->>'project_ffe_item_id' ~* '^[0-9a-f-]{36}$'
      THEN (element->>'project_ffe_item_id')::uuid END
  FROM jsonb_array_elements(COALESCE(v_source.items, '[]'::jsonb))
    WITH ORDINALITY source(element, ordinal)
  ORDER BY ordinal;
  RETURN v_new_id;
END;
$$;

ALTER FUNCTION public.place_product_in_project_v2(jsonb)
  RENAME TO _place_product_in_project_v2_00446_impl;

REVOKE ALL ON FUNCTION public._place_product_in_project_v2_00446_impl(jsonb)
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
  v_role text := COALESCE(NULLIF(btrim(p_request->>'roleConfigurationIdentity'), ''),
    NULLIF(btrim(p_request->>'roleIdentity'), ''), 'default');
  v_reference_id uuid := CASE WHEN p_request->>'selectionReferenceId' ~* '^[0-9a-f-]{36}$'
    THEN (p_request->>'selectionReferenceId')::uuid END;
  v_placeholder_id uuid := CASE WHEN p_request->>'placeholderSelectionId' ~* '^[0-9a-f-]{36}$'
    THEN (p_request->>'placeholderSelectionId')::uuid END;
  v_configuration_id uuid := CASE WHEN p_request->>'configurationId' ~* '^[0-9a-f-]{36}$'
    THEN (p_request->>'configurationId')::uuid END;
  v_existing public.project_ffe_items%ROWTYPE;
  v_existing_configuration uuid;
  v_result jsonb;
BEGIN
  IF NULLIF(p_request->>'quantity', '') IS NOT NULL AND (
    p_request->>'quantity' !~ '^[1-9][0-9]{0,9}$'
    OR (p_request->>'quantity')::numeric > 2147483647
  ) THEN
    RAISE EXCEPTION 'quantity must be a positive 32-bit integer'
      USING ERRCODE = 'check_violation';
  END IF;
  IF NULLIF(p_request->>'budgetMinCents', '') IS NOT NULL AND (
    p_request->>'budgetMinCents' !~ '^[0-9]{1,10}$'
    OR (p_request->>'budgetMinCents')::numeric > 2147483647
  ) OR NULLIF(p_request->>'budgetMaxCents', '') IS NOT NULL AND (
    p_request->>'budgetMaxCents' !~ '^[0-9]{1,10}$'
    OR (p_request->>'budgetMaxCents')::numeric > 2147483647
  ) THEN
    RAISE EXCEPTION 'allowance cents must be 32-bit nonnegative integers'
      USING ERRCODE = 'check_violation';
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
  IF v_item_type = 'allowance' AND COALESCE(p_request->>'budgetMaxCents', '') !~ '^[1-9][0-9]{0,9}$' THEN
    RAISE EXCEPTION 'allowance selections require a positive budgetMaxCents'
      USING ERRCODE = 'check_violation';
  END IF;

  IF v_reference_id IS NOT NULL OR v_placeholder_id IS NOT NULL THEN
    SELECT item.*
    INTO v_existing
    FROM public.project_ffe_items item
    WHERE item.id = COALESCE(v_reference_id, v_placeholder_id)
    FOR UPDATE OF item;
    SELECT configuration_id INTO v_existing_configuration
    FROM public.project_ffe_specs WHERE ffe_item_id = v_existing.id;
    IF NOT FOUND OR v_existing.role_identity IS DISTINCT FROM v_role
       OR (v_reference_id IS NOT NULL AND v_existing_configuration IS DISTINCT FROM v_configuration_id)
       OR (v_reference_id IS NOT NULL AND v_existing.item_type IS DISTINCT FROM v_item_type)
    THEN
      RAISE EXCEPTION 'selection reference does not match role, configuration, or item type'
        USING ERRCODE = 'integrity_constraint_violation';
    END IF;
    IF v_placeholder_id IS NOT NULL AND (
      v_existing.purchase_order_id IS NOT NULL
      OR v_existing.source_commercial_document_id IS NOT NULL
      OR EXISTS (
        SELECT 1 FROM public.furnishing_authorization_items line
        JOIN public.project_commercial_documents document ON document.id = line.commercial_document_id
        JOIN public.proposals proposal ON proposal.id = document.proposal_id
        WHERE line.source_ffe_item_id = v_existing.id
          AND proposal.commercial_state IN ('draft', 'sent', 'executed')
      )
    ) THEN
      RAISE EXCEPTION 'authorized or ordered placeholders cannot be filled in place'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  v_request := v_request || jsonb_build_object('roleIdentity', v_role);
  v_result := public._place_product_in_project_v2_00444_impl(v_request);
  IF v_result->>'outcome' IN ('created', 'filled') THEN
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
    WHERE id = (v_result->>'selectionId')::uuid;
  ELSE
    SELECT * INTO v_existing FROM public.project_ffe_items
    WHERE id = (v_result->>'selectionId')::uuid;
  END IF;
  RETURN (v_result - 'roleIdentity') || jsonb_build_object(
    'itemType', CASE WHEN v_result->>'outcome' = 'reused' THEN v_existing.item_type ELSE v_item_type END,
    'roleConfigurationIdentity', v_role
  );
END;
$$;

ALTER FUNCTION public.commit_project_ffe_import(uuid, jsonb)
  RENAME TO _commit_project_ffe_import_00446_impl;

REVOKE ALL ON FUNCTION public._commit_project_ffe_import_00446_impl(uuid, jsonb)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.commit_project_ffe_import(
  p_batch_id uuid, p_decisions jsonb DEFAULT '[]'::jsonb
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $$
BEGIN
  IF jsonb_typeof(p_decisions) IS DISTINCT FROM 'array' OR EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_decisions) decision
    WHERE decision->>'rowOrdinal' !~ '^[1-9][0-9]{0,9}$'
       OR (decision->>'rowOrdinal')::numeric > 2147483647
  ) THEN
    RAISE EXCEPTION 'import rowOrdinal must be a positive 32-bit integer'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN public._commit_project_ffe_import_00446_impl(p_batch_id, p_decisions);
END;
$$;

ALTER FUNCTION public.publish_project_review(jsonb)
  RENAME TO _publish_project_review_00446_impl;

REVOKE ALL ON FUNCTION public._publish_project_review_00446_impl(jsonb)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.publish_project_review(p_request jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions', 'pg_temp'
AS $$
DECLARE
  v_project_id uuid := NULLIF(p_request->>'projectId', '')::uuid;
  v_board_ids uuid[];
  v_result jsonb;
  v_edition_id uuid;
  v_boards jsonb;
  v_hash text;
BEGIN
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(COALESCE(p_request->'items', '[]'::jsonb)) item
    WHERE NULLIF(item->>'sortOrder', '') IS NOT NULL AND (
      item->>'sortOrder' !~ '^-?[0-9]{1,10}$'
      OR abs((item->>'sortOrder')::numeric) > 2147483647
    )
  ) THEN
    RAISE EXCEPTION 'review sortOrder must be a 32-bit integer'
      USING ERRCODE = 'check_violation';
  END IF;
  IF jsonb_typeof(COALESCE(p_request->'boardIds', '[]'::jsonb)) IS DISTINCT FROM 'array'
     OR EXISTS (
       SELECT 1 FROM jsonb_array_elements_text(COALESCE(p_request->'boardIds', '[]'::jsonb)) id
       WHERE id !~* '^[0-9a-f-]{36}$'
     )
  THEN
    RAISE EXCEPTION 'boardIds must contain UUIDs' USING ERRCODE = 'check_violation';
  END IF;
  SELECT array_agg(value::uuid ORDER BY value)
  INTO v_board_ids
  FROM jsonb_array_elements_text(COALESCE(p_request->'boardIds', '[]'::jsonb));
  IF COALESCE(cardinality(v_board_ids), 0) <> (
      SELECT count(DISTINCT value::uuid)
      FROM jsonb_array_elements_text(COALESCE(p_request->'boardIds', '[]'::jsonb))
    ) OR (SELECT count(*) FROM public.proposal_boards
      WHERE id = ANY(COALESCE(v_board_ids, '{}')) AND project_id = v_project_id
        AND proposal_id IS NULL) <> COALESCE(cardinality(v_board_ids), 0)
  THEN
    RAISE EXCEPTION 'every requested review board must belong to the project exactly once'
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;

  v_result := public._publish_project_review_00446_impl(p_request);
  v_edition_id := (v_result->>'editionId')::uuid;
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', board.id, 'name', board.name, 'roomId', board.project_room_id,
    'canvasWidth', board.canvas_width, 'canvasHeight', board.canvas_height,
    'backgroundColor', board.background_color, 'sections', board.sections,
    'items', COALESCE((
      SELECT jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
        'id', placement.id, 'type', placement.type,
        'selectionId', placement.project_ffe_item_id,
        'productId', placement.product_id, 'captureId', placement.capture_id,
        'paletteId', placement.palette_id, 'content', placement.content,
        'x', placement.x, 'y', placement.y, 'width', placement.width,
        'height', placement.height, 'zIndex', placement.z_index,
        'rotation', placement.rotation, 'locked', placement.locked,
        'sectionId', COALESCE(placement.data->>'sectionId', placement.data->>'section_id')
      )) ORDER BY placement.z_index, placement.id)
      FROM public.proposal_board_items placement WHERE placement.board_id = board.id
    ), '[]'::jsonb)
  ) ORDER BY board.sort_order, board.id), '[]'::jsonb)
  INTO v_boards
  FROM public.proposal_boards board WHERE board.id = ANY(COALESCE(v_board_ids, '{}'));
  SELECT encode(extensions.digest(jsonb_build_object(
    'editionId', edition.id, 'rooms', edition.room_snapshot, 'boards', v_boards,
    'items', (SELECT jsonb_agg(jsonb_build_object('id', item.id, 'hash', item.content_hash)
      ORDER BY item.sort_order, item.id) FROM public.project_review_items item WHERE item.edition_id = edition.id)
  )::text, 'sha256'), 'hex') INTO v_hash
  FROM public.project_review_editions edition WHERE edition.id = v_edition_id;
  PERFORM set_config('app.project_review_publish', 'on', true);
  UPDATE public.project_review_editions
  SET board_snapshot = v_boards, snapshot_hash = v_hash, updated_at = now()
  WHERE id = v_edition_id;
  RETURN v_result || jsonb_build_object('snapshotHash', v_hash);
END;
$$;

ALTER FUNCTION public.record_project_ffe_receipt_batch(
  uuid, jsonb, public.receiving_inspection_outcome, text, uuid[]
) RENAME TO _record_project_ffe_receipt_batch_00446_impl;

REVOKE ALL ON FUNCTION public._record_project_ffe_receipt_batch_00446_impl(
  uuid, jsonb, public.receiving_inspection_outcome, text, uuid[]
) FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.record_project_ffe_receipt_batch(
  p_purchase_order_id uuid, p_lines jsonb,
  p_outcome public.receiving_inspection_outcome, p_notes text DEFAULT NULL,
  p_photo_asset_ids uuid[] DEFAULT '{}'
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp' AS $$
DECLARE v_project_id uuid;
BEGIN
  IF jsonb_typeof(p_lines) IS DISTINCT FROM 'array' OR EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_lines) entry
    WHERE entry->>'receivedQuantity' !~ '^[0-9]{1,10}$'
       OR (entry->>'receivedQuantity')::numeric > 2147483647
  ) THEN
    RAISE EXCEPTION 'receivedQuantity must be a nonnegative 32-bit integer'
      USING ERRCODE = 'check_violation';
  END IF;
  SELECT project_id INTO v_project_id FROM public.purchase_orders WHERE id = p_purchase_order_id;
  IF cardinality(COALESCE(p_photo_asset_ids, '{}')) > 0 AND EXISTS (
    SELECT 1 FROM unnest(p_photo_asset_ids) asset_id
    LEFT JOIN svc_media.media_assets asset ON asset.id = asset_id
    WHERE asset.id IS NULL OR asset.status <> 'READY' OR asset.scan_status <> 'CLEAN'
       OR asset.uploaded_by IS DISTINCT FROM auth.uid()::text
       OR asset.permissions->>'projectId' IS DISTINCT FROM v_project_id::text
       OR NOT ('receiving' = ANY(COALESCE(asset.tags, '{}')))
  ) THEN
    RAISE EXCEPTION 'receiving photos must be clean project receiving assets owned by the actor'
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  RETURN public._record_project_ffe_receipt_batch_00446_impl(
    p_purchase_order_id, p_lines, p_outcome, p_notes, p_photo_asset_ids
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.set_project_ffe_thread_primary()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $$
DECLARE v_thread_id uuid; v_primary uuid;
BEGIN
  FOR v_thread_id IN
    SELECT DISTINCT thread_id FROM unnest(ARRAY[
      CASE WHEN TG_OP <> 'INSERT' THEN OLD.selection_thread_id END,
      CASE WHEN TG_OP <> 'DELETE' THEN NEW.selection_thread_id END
    ]) thread_id WHERE thread_id IS NOT NULL
  LOOP
    SELECT id INTO v_primary FROM public.project_ffe_items
    WHERE selection_thread_id = v_thread_id AND removed_at IS NULL
    ORDER BY (design_disposition = 'selected') DESC, created_at, id LIMIT 1;
    UPDATE public.project_ffe_selection_threads
    SET primary_ffe_item_id = v_primary, updated_at = now() WHERE id = v_thread_id;
  END LOOP;
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE OR REPLACE FUNCTION public.assert_project_ffe_thread_consistency()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $$
DECLARE v_thread_id uuid; v_selected integer; v_alternates integer; v_primary uuid; v_expected uuid;
BEGIN
  FOR v_thread_id IN
    SELECT DISTINCT thread_id FROM unnest(ARRAY[
      CASE WHEN TG_OP <> 'INSERT' THEN OLD.selection_thread_id END,
      CASE WHEN TG_OP <> 'DELETE' THEN NEW.selection_thread_id END
    ]) thread_id WHERE thread_id IS NOT NULL
  LOOP
    SELECT count(*) FILTER (WHERE design_disposition = 'selected'),
           count(*) FILTER (WHERE design_disposition = 'alternate')
    INTO v_selected, v_alternates FROM public.project_ffe_items
    WHERE selection_thread_id = v_thread_id AND removed_at IS NULL;
    IF v_selected > 1 OR (v_alternates > 0 AND v_selected <> 1) THEN
      RAISE EXCEPTION 'selected or alternate threads require exactly one selected row; candidate-only threads may have none'
        USING ERRCODE = 'integrity_constraint_violation';
    END IF;
    SELECT primary_ffe_item_id INTO v_primary FROM public.project_ffe_selection_threads WHERE id = v_thread_id;
    SELECT id INTO v_expected FROM public.project_ffe_items
    WHERE selection_thread_id = v_thread_id AND removed_at IS NULL
    ORDER BY (design_disposition = 'selected') DESC, created_at, id LIMIT 1;
    IF v_primary IS DISTINCT FROM v_expected THEN
      RAISE EXCEPTION 'selection thread primary is inconsistent'
        USING ERRCODE = 'integrity_constraint_violation';
    END IF;
  END LOOP;
  RETURN COALESCE(NEW, OLD);
END;
$$;

REVOKE ALL ON FUNCTION public.guard_purchase_order_rpc_mutation(),
  public.guard_purchase_order_change_immutable(),
  public.set_project_ffe_thread_primary(),
  public.assert_project_ffe_thread_consistency()
FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.start_purchase_order_change(jsonb),
  public.continue_board_in_project(uuid), public.place_product_in_project_v2(jsonb),
  public.commit_project_ffe_import(uuid, jsonb), public.publish_project_review(jsonb),
  public.record_project_ffe_receipt_batch(uuid, jsonb, public.receiving_inspection_outcome, text, uuid[])
FROM PUBLIC, anon, service_role;

GRANT EXECUTE ON FUNCTION public.start_purchase_order_change(jsonb),
  public.continue_board_in_project(uuid), public.place_product_in_project_v2(jsonb),
  public.commit_project_ffe_import(uuid, jsonb), public.publish_project_review(jsonb),
  public.record_project_ffe_receipt_batch(uuid, jsonb, public.receiving_inspection_outcome, text, uuid[])
TO authenticated;
