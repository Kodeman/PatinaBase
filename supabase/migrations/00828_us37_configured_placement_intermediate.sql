-- ═══════════════════════════════════════════════════════════════════════════
-- 00828 — Avoid an unused catalog total during priced configuration fills
-- Lineage: 00438 → 00666 → 00678 → 00730 → 00737 (latest core body).
-- SQ-1158 / Astra SQ-1157 F1: qty 2 × catalog retail 1.2B overflows int4
-- before 00809 installs a valid approved configuration total (2 × 1B).
-- Bigint multiplication alone cannot help: line_total_cents is still int4.
-- Skip only that temporary total under 00809's existing pricing-writer mark
-- and configured-placement metadata. Ordinary fills keep their pricing;
-- 00809 still validates and installs configuration cents atomically.
-- CREATE OR REPLACE preserves the existing internal ACL and signature;
-- authorization, idempotency, label locks, and trigger flow are unchanged.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public._place_product_in_project_v2_00438_impl(p_request jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions', 'pg_temp'
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_project_id uuid := NULLIF(p_request->>'projectId', '')::uuid;
  v_product_id uuid := NULLIF(p_request->>'productId', '')::uuid;
  v_room_id uuid := NULLIF(p_request->>'roomId', '')::uuid;
  v_board_id uuid := NULLIF(p_request->>'boardId', '')::uuid;
  v_placeholder_id uuid := NULLIF(p_request->>'placeholderSelectionId', '')::uuid;
  v_reference_id uuid := NULLIF(p_request->>'selectionReferenceId', '')::uuid;
  v_thread_id uuid := NULLIF(p_request->>'selectionThreadId', '')::uuid;
  v_configuration_id uuid := NULLIF(p_request->>'configurationId', '')::uuid;
  v_assignment text := COALESCE(NULLIF(p_request->>'assignmentScope', ''), 'unassigned');
  v_disposition text := COALESCE(NULLIF(p_request->>'disposition', ''), 'candidate');
  v_duplicate text := COALESCE(NULLIF(p_request->>'duplicateMode', ''), 'reuse');
  v_key text := NULLIF(btrim(p_request->>'idempotencyKey'), '');
  v_hash text;
  v_existing_hash text;
  v_response jsonb;
  v_product public.products%ROWTYPE;
  v_item public.project_ffe_items%ROWTYPE;
  v_board public.proposal_boards%ROWTYPE;
  v_vendor_name text;
  v_placement_id uuid;
  v_inserted integer;
  v_outcome text;
  -- 00678 F2: a deck-import Keep product with only a retail price.
  v_retail_only boolean := false;
  -- 00730: the Build room's fields.
  v_unit text := NULLIF(btrim(p_request->>'unit'), '');
  v_rough_text text := NULLIF(btrim(p_request->>'roughCents'), '');
  v_rough integer;
  v_need_label text := NULLIF(btrim(p_request->>'needLabel'), '');
  v_line_kind text := NULLIF(btrim(p_request->>'lineKind'), '');
BEGIN
  IF v_actor IS NULL THEN RAISE EXCEPTION 'authentication required' USING ERRCODE = 'insufficient_privilege'; END IF;
  IF p_request IS NULL OR jsonb_typeof(p_request) <> 'object' OR v_project_id IS NULL THEN
    RAISE EXCEPTION 'placement request must name a project' USING ERRCODE = 'check_violation';
  END IF;
  PERFORM public._ffe_require_studio_project(v_project_id);
  IF v_key IS NULL OR char_length(v_key) > 200 THEN
    RAISE EXCEPTION 'idempotencyKey is required and must be at most 200 characters'
      USING ERRCODE = 'check_violation';
  END IF;
  IF v_assignment NOT IN ('room', 'throughout', 'unassigned')
     OR v_disposition NOT IN ('candidate', 'selected', 'alternate', 'not_selected')
     OR v_duplicate NOT IN ('reuse', 'create', 'hold')
  THEN RAISE EXCEPTION 'invalid placement routing choice' USING ERRCODE = 'check_violation'; END IF;
  IF (v_assignment = 'room') <> (v_room_id IS NOT NULL) THEN
    RAISE EXCEPTION 'room assignment requires exactly one project room'
      USING ERRCODE = 'check_violation';
  END IF;
  IF v_room_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.project_rooms room WHERE room.id = v_room_id AND room.project_id = v_project_id
  ) THEN RAISE EXCEPTION 'room does not belong to project' USING ERRCODE = 'integrity_constraint_violation'; END IF;
  -- 00730: unit, Rough $ and line kind are refused by name before any write.
  IF v_unit IS NOT NULL
     AND v_unit NOT IN ('each', 'sq_ft', 'lin_ft', 'roll', 'yard', 'box', 'hour', 'lot') THEN
    RAISE EXCEPTION 'unit must be one of each, sq_ft, lin_ft, roll, yard, box, hour, lot'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'project_ffe_items_unit_check';
  END IF;
  IF v_rough_text IS NOT NULL THEN
    IF v_rough_text !~ '^(0|[1-9][0-9]{0,9})$' OR v_rough_text::bigint > 2147483647 THEN
      RAISE EXCEPTION 'roughCents must be a whole number of cents, 0 or more'
        USING ERRCODE = 'check_violation', CONSTRAINT = 'project_ffe_items_rough_cents_check';
    END IF;
    v_rough := v_rough_text::integer;
  END IF;
  IF v_line_kind IS NOT NULL AND v_line_kind <> 'goods' THEN
    RAISE EXCEPTION 'lineKind must be goods; a labor line is added with add_labor_line'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'project_ffe_items_line_kind_check';
  END IF;

  v_hash := encode(extensions.digest(p_request::text, 'sha256'), 'hex');
  INSERT INTO public.project_ffe_command_idempotency(actor_id, idempotency_key, request_hash)
  VALUES (v_actor, v_key, v_hash) ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  IF v_inserted = 0 THEN
    SELECT request_hash, response INTO v_existing_hash, v_response
    FROM public.project_ffe_command_idempotency
    WHERE actor_id = v_actor AND idempotency_key = v_key FOR UPDATE;
    IF v_existing_hash <> v_hash THEN
      RAISE EXCEPTION 'idempotency key was used for a different request'
        USING ERRCODE = 'unique_violation';
    END IF;
    IF v_response IS NULL THEN
      RAISE EXCEPTION 'idempotent command is still in progress'
        USING ERRCODE = 'serialization_failure';
    END IF;
    RETURN v_response;
  END IF;

  IF v_duplicate = 'hold' THEN
    v_response := jsonb_build_object('outcome', 'held', 'projectId', v_project_id);
    UPDATE public.project_ffe_command_idempotency SET response = v_response
    WHERE actor_id = v_actor AND idempotency_key = v_key;
    RETURN v_response;
  END IF;

  IF v_product_id IS NOT NULL THEN
    SELECT * INTO v_product FROM public.products WHERE id = v_product_id;
    IF NOT FOUND OR v_product.deleted_at IS NOT NULL OR v_product.merged_into_id IS NOT NULL OR NOT (
      v_product.layer = 'catalog'
      OR (v_product.layer = 'personal' AND v_product.owner_user_id = v_actor)
      OR (v_product.layer = 'studio' AND EXISTS (
        SELECT 1 FROM public.organization_members member
        WHERE member.organization_id = v_product.studio_id
          AND member.user_id = v_actor AND member.status = 'active'
      ))
    ) THEN RAISE EXCEPTION 'product not found or not accessible' USING ERRCODE = 'insufficient_privilege'; END IF;
    SELECT name INTO v_vendor_name FROM public.vendors WHERE id = v_product.vendor_id;
    -- R-DI4: a price read off a deck or its page is retail; it is not trade.
    v_retail_only := v_product.price_trade IS NULL
      AND COALESCE(v_product.capture_provenance->>'producer', '') = 'board_deck_import';
  END IF;

  IF v_reference_id IS NOT NULL THEN
    SELECT * INTO v_item FROM public.project_ffe_items
    WHERE id = v_reference_id AND project_id = v_project_id AND removed_at IS NULL FOR UPDATE;
    IF NOT FOUND OR (v_product_id IS NOT NULL AND v_item.product_id IS DISTINCT FROM v_product_id) THEN
      RAISE EXCEPTION 'selection reference does not match the project/product'
        USING ERRCODE = 'integrity_constraint_violation';
    END IF;
    v_outcome := 'reused';
  ELSIF v_placeholder_id IS NOT NULL THEN
    SELECT * INTO v_item FROM public.project_ffe_items
    WHERE id = v_placeholder_id AND project_id = v_project_id FOR UPDATE;
    IF NOT FOUND OR v_item.product_id IS NOT NULL OR v_product_id IS NULL THEN
      RAISE EXCEPTION 'placeholder is unavailable or already filled'
        USING ERRCODE = 'integrity_constraint_violation';
    END IF;
    -- 00737 (F4): a labor line is never filled with a product, and a removed
    -- line is never filled.
    IF v_item.line_kind = 'labor' THEN
      RAISE EXCEPTION 'Labor isn''t filled with a product.'
        USING ERRCODE = 'check_violation';
    END IF;
    IF v_item.removed_at IS NOT NULL THEN
      RAISE EXCEPTION 'This line was removed.'
        USING ERRCODE = 'check_violation';
    END IF;
    -- 00730 (D2): the line name takes the product; the thread's need_label
    -- is never touched here.
    PERFORM set_config('app.ffe_mutation_rpc', 'on', true);
    UPDATE public.project_ffe_items SET
      product_id = v_product.id,
      name = v_product.name,
      ffe_category = COALESCE(NULLIF(btrim(p_request->>'category'), ''), v_product.category, ffe_category),
      project_room_id = v_room_id,
      assignment_scope = v_assignment,
      design_disposition = v_disposition,
      vendor_id = v_product.vendor_id,
      vendor_name = v_vendor_name,
      trade_price_cents = CASE WHEN v_retail_only THEN NULL
        ELSE COALESCE(v_product.price_trade, v_product.price_retail, 0) END,
      unit_price_cents = COALESCE(v_product.price_retail, v_product.price_trade, 0),
      -- 00828: a priced configuration installs its checked total after this
      -- fill. Its catalog total is unused and can exceed int4 beforehand.
      line_total_cents = CASE
        WHEN current_setting('app.ffe_pricing_writer', true) = 'on'
          AND NULLIF(p_request#>>'{sourceMetadata,configurationId}', '') IS NOT NULL
        THEN 0
        ELSE quantity * COALESCE(v_product.price_retail, v_product.price_trade, 0)
      END,
      currency = 'USD',
      updated_at = now()
    WHERE id = v_item.id RETURNING * INTO v_item;
    v_outcome := 'filled';
  ELSE
    IF v_duplicate = 'reuse' AND v_product_id IS NOT NULL THEN
      SELECT * INTO v_item FROM public.project_ffe_items
      WHERE project_id = v_project_id AND product_id = v_product_id
        AND removed_at IS NULL AND design_disposition NOT IN ('not_selected', 'superseded')
        AND assignment_scope = v_assignment
        AND project_room_id IS NOT DISTINCT FROM v_room_id
      ORDER BY created_at, id LIMIT 1 FOR UPDATE;
    END IF;
    IF v_item.id IS NOT NULL THEN
      v_outcome := 'reused';
    ELSE
      PERFORM set_config('app.ffe_mutation_rpc', 'on', true);
      INSERT INTO public.project_ffe_items (
        project_id, project_room_id, product_id, name, ffe_category,
        quantity, trade_price_cents, unit_price_cents, line_total_cents,
        vendor_id, vendor_name, added_via, sort_order, selection_thread_id,
        design_disposition, assignment_scope,
        unit, rough_cents, line_kind
      ) VALUES (
        v_project_id, v_room_id, v_product_id,
        COALESCE(v_product.name, NULLIF(btrim(p_request->>'name'), ''), 'Named need'),
        COALESCE(NULLIF(btrim(p_request->>'category'), ''), v_product.category),
        COALESCE(NULLIF(p_request->>'quantity', '')::integer, 1),
        CASE WHEN v_product_id IS NULL OR v_retail_only THEN NULL ELSE COALESCE(v_product.price_trade, v_product.price_retail, 0) END,
        CASE WHEN v_product_id IS NULL THEN 0 ELSE COALESCE(v_product.price_retail, v_product.price_trade, 0) END,
        CASE WHEN v_product_id IS NULL THEN 0 ELSE COALESCE(NULLIF(p_request->>'quantity', '')::integer, 1) * COALESCE(v_product.price_retail, v_product.price_trade, 0) END,
        v_product.vendor_id, v_vendor_name,
        COALESCE(NULLIF(p_request->>'source', ''), 'project-add'),
        COALESCE((SELECT max(sort_order) + 1 FROM public.project_ffe_items WHERE project_id = v_project_id), 0),
        v_thread_id, v_disposition, v_assignment,
        COALESCE(v_unit, 'each'), v_rough, 'goods'
      ) RETURNING * INTO v_item;
      -- 00730 (D2): the new thread names the need; an existing thread keeps
      -- the label it already has.
      UPDATE public.project_ffe_selection_threads
      SET need_label = COALESCE(v_need_label, v_item.name)
      WHERE id = v_item.selection_thread_id AND need_label IS NULL;
      v_outcome := 'created';
    END IF;
  END IF;

  IF v_configuration_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.product_configurations configuration
      WHERE configuration.id = v_configuration_id
        AND configuration.product_id = v_item.product_id
        AND (configuration.project_id IS NULL OR configuration.project_id = v_project_id)
        AND configuration.is_valid
    ) THEN RAISE EXCEPTION 'configuration does not match the placed product/project' USING ERRCODE = 'integrity_constraint_violation'; END IF;
  END IF;
  INSERT INTO public.project_ffe_specs(ffe_item_id, routing_source, updated_by, configuration_id)
  VALUES (
    v_item.id,
    COALESCE(p_request->'sourceMetadata', '{}'::jsonb)
      || jsonb_strip_nulls(jsonb_build_object('captureId', p_request->>'captureId')),
    v_actor,
    v_configuration_id
  )
  ON CONFLICT (ffe_item_id) DO UPDATE SET
    routing_source = project_ffe_specs.routing_source || EXCLUDED.routing_source,
    updated_by = v_actor,
    configuration_id = COALESCE(EXCLUDED.configuration_id, project_ffe_specs.configuration_id);

  IF v_board_id IS NOT NULL THEN
    SELECT * INTO v_board FROM public.proposal_boards
    WHERE id = v_board_id AND project_id = v_project_id AND proposal_id IS NULL FOR UPDATE;
    IF NOT FOUND OR (v_board.project_room_id IS NOT NULL
       AND v_item.assignment_scope = 'room'
       AND v_board.project_room_id <> v_item.project_room_id)
    THEN RAISE EXCEPTION 'board is not compatible with the project assignment' USING ERRCODE = 'integrity_constraint_violation'; END IF;
    PERFORM set_config('app.board_state_rpc', 'on', true);
    INSERT INTO public.proposal_board_items (
      board_id, type, x, y, width, product_id, image_url, data, project_ffe_item_id
    ) VALUES (
      v_board_id, CASE WHEN v_item.product_id IS NULL THEN 'note' ELSE 'product' END,
      COALESCE(NULLIF(p_request#>>'{placement,x}', '')::numeric, 0),
      COALESCE(NULLIF(p_request#>>'{placement,y}', '')::numeric, 0),
      COALESCE(NULLIF(p_request#>>'{placement,width}', '')::numeric, 240),
      v_item.product_id, CASE WHEN v_product_id IS NULL THEN NULL ELSE v_product.images[1] END,
      jsonb_strip_nulls(jsonb_build_object('name', v_item.name, 'section_id', p_request#>>'{placement,sectionId}')),
      v_item.id
    ) RETURNING id INTO v_placement_id;
  END IF;

  v_response := jsonb_strip_nulls(jsonb_build_object(
    'outcome', v_outcome,
    'projectId', v_project_id,
    'selectionId', v_item.id,
    'threadId', v_item.selection_thread_id,
    'placementId', v_placement_id,
    'productId', v_item.product_id,
    'assignmentScope', v_item.assignment_scope,
    'roomId', v_item.project_room_id
  ));
  UPDATE public.project_ffe_command_idempotency SET response = v_response
  WHERE actor_id = v_actor AND idempotency_key = v_key;
  RETURN v_response;
END;
$$;
