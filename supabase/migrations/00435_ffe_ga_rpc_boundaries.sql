-- ═══════════════════════════════════════════════════════════════════════════
-- 00435 — FF&E GA command, review, import, and change boundaries
--
-- Current-body lineage:
--   place_product_in_project ................. 00380 → 00435 wrapper
--   apply_board_room_state ................... 00411 → 00435 wrapper
--   continue_board_in_project ................ 00407 → 00435 wrapper
--   create_purchase_order .................... 00186 → 00435 wrapper
--   activate_proposal_as_project public gate . 00412 → 00435 regraft
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public._ffe_require_studio_project(p_project_id uuid)
RETURNS public.projects
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE v_project public.projects%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'authentication required'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT * INTO v_project FROM public.projects WHERE id = p_project_id;
  IF NOT FOUND OR NOT public.is_studio_comember(v_project.designer_id) THEN
    RAISE EXCEPTION 'project not found or access denied'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN v_project;
END;
$$;

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
  ORDER BY book.created_at LIMIT 1;

  FOR v_rule IN SELECT jsonb_array_elements_text(COALESCE(v_rules, '[]'::jsonb)) LOOP
    IF (v_rule = 'name' AND btrim(COALESCE(v_item.name, '')) = '')
       OR (v_rule = 'documentCode' AND btrim(COALESCE(v_item.doc_code, '')) = '')
       OR (v_rule = 'room' AND v_item.assignment_scope = 'unassigned')
       OR (v_rule = 'quantity' AND COALESCE(v_item.quantity, 0) <= 0)
       OR (v_rule = 'image' AND COALESCE(jsonb_array_length(v_spec.selected_media), 0) = 0)
       OR (v_rule = 'selection' AND v_item.product_id IS NULL)
    THEN v_missing := array_append(v_missing, v_rule); END IF;
  END LOOP;
  IF v_item.design_disposition = 'selected' AND v_item.item_type = 'fixed' THEN
    IF v_item.vendor_id IS NULL THEN v_missing := array_append(v_missing, 'vendor'); END IF;
    IF v_item.unit_price_cents IS NULL OR v_item.line_total_cents IS NULL
       OR v_item.line_total_cents <> v_item.quantity * v_item.unit_price_cents
    THEN v_missing := array_append(v_missing, 'clientPrice'); END IF;
  END IF;
  IF v_item.blocked THEN v_missing := array_append(v_missing, 'releaseBlock'); END IF;
  RETURN jsonb_build_object(
    'selectionId', v_item.id,
    'ready', cardinality(v_missing) = 0,
    'missingFields', to_jsonb(v_missing),
    'cacheStatus', v_spec.readiness_status
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.place_product_in_project_v2(p_request jsonb)
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
      trade_price_cents = COALESCE(v_product.price_trade, v_product.price_retail, 0),
      unit_price_cents = COALESCE(v_product.price_retail, v_product.price_trade, 0),
      line_total_cents = quantity * COALESCE(v_product.price_retail, v_product.price_trade, 0),
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
        design_disposition, assignment_scope
      ) VALUES (
        v_project_id, v_room_id, v_product_id,
        COALESCE(v_product.name, NULLIF(btrim(p_request->>'name'), ''), 'Named need'),
        COALESCE(NULLIF(btrim(p_request->>'category'), ''), v_product.category),
        COALESCE(NULLIF(p_request->>'quantity', '')::integer, 1),
        CASE WHEN v_product_id IS NULL THEN NULL ELSE COALESCE(v_product.price_trade, v_product.price_retail, 0) END,
        CASE WHEN v_product_id IS NULL THEN 0 ELSE COALESCE(v_product.price_retail, v_product.price_trade, 0) END,
        CASE WHEN v_product_id IS NULL THEN 0 ELSE COALESCE(NULLIF(p_request->>'quantity', '')::integer, 1) * COALESCE(v_product.price_retail, v_product.price_trade, 0) END,
        v_product.vendor_id, v_vendor_name,
        COALESCE(NULLIF(p_request->>'source', ''), 'project-add'),
        COALESCE((SELECT max(sort_order) + 1 FROM public.project_ffe_items WHERE project_id = v_project_id), 0),
        v_thread_id, v_disposition, v_assignment
      ) RETURNING * INTO v_item;
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

CREATE OR REPLACE FUNCTION public.place_product_in_project(
  p_project_id uuid,
  p_product_id uuid,
  p_room_id uuid DEFAULT NULL,
  p_slot_id uuid DEFAULT NULL,
  p_category text DEFAULT NULL,
  p_source jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE sql
SECURITY INVOKER
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT public.place_product_in_project_v2(jsonb_strip_nulls(jsonb_build_object(
    'projectId', p_project_id,
    'productId', p_product_id,
    'roomId', p_room_id,
    'assignmentScope', CASE WHEN p_room_id IS NULL THEN 'unassigned' ELSE 'room' END,
    'placeholderSelectionId', p_slot_id,
    'category', p_category,
    'duplicateMode', CASE WHEN p_slot_id IS NULL THEN 'create' ELSE 'reuse' END,
    'disposition', 'candidate',
    'source', COALESCE(NULLIF(p_source->>'client', ''), NULLIF(p_source->>'source', ''), 'chrome-n-1'),
    'sourceMetadata', p_source,
    'idempotencyKey', COALESCE(NULLIF(p_source->>'idempotencyKey', ''),
      'n1:' || p_project_id::text || ':' || p_product_id::text || ':' || COALESCE(p_room_id::text, 'unsorted') || ':' || COALESCE(p_slot_id::text, 'new'))
  )));
$$;

CREATE OR REPLACE FUNCTION public.create_named_project_need(p_request jsonb)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path TO 'public', 'pg_temp'
AS $$ SELECT public.place_product_in_project_v2(p_request - 'productId' || jsonb_build_object('duplicateMode', 'create')); $$;

CREATE OR REPLACE FUNCTION public.batch_place_library_products_in_project(p_request jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE v_entry jsonb; v_results jsonb := '[]'::jsonb; v_result jsonb; v_i integer := 0;
BEGIN
  IF jsonb_typeof(p_request->'products') <> 'array' OR jsonb_array_length(p_request->'products') > 500 THEN
    RAISE EXCEPTION 'products must be an array of at most 500 entries' USING ERRCODE = 'check_violation';
  END IF;
  FOR v_entry IN SELECT value FROM jsonb_array_elements(p_request->'products') LOOP
    v_i := v_i + 1;
    v_result := public.place_product_in_project_v2(
      (p_request - 'products' - 'idempotencyKey') || v_entry ||
      jsonb_build_object('idempotencyKey', (p_request->>'idempotencyKey') || ':' || v_i::text)
    );
    v_results := v_results || jsonb_build_array(v_result);
  END LOOP;
  RETURN jsonb_build_object(
    'results', v_results,
    'createdCount', (SELECT count(*) FROM jsonb_array_elements(v_results) r WHERE r->>'outcome' = 'created'),
    'reusedCount', (SELECT count(*) FROM jsonb_array_elements(v_results) r WHERE r->>'outcome' = 'reused'),
    'heldCount', (SELECT count(*) FROM jsonb_array_elements(v_results) r WHERE r->>'outcome' = 'held')
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.create_project_board(p_request jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE v_project_id uuid := NULLIF(p_request->>'projectId','')::uuid; v_room_id uuid := NULLIF(p_request->>'roomId','')::uuid; v_board public.proposal_boards%ROWTYPE;
BEGIN
  PERFORM public._ffe_require_studio_project(v_project_id);
  IF v_room_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.project_rooms WHERE id=v_room_id AND project_id=v_project_id) THEN
    RAISE EXCEPTION 'room does not belong to project' USING ERRCODE='integrity_constraint_violation';
  END IF;
  PERFORM set_config('app.board_state_rpc','on',true);
  INSERT INTO public.proposal_boards(proposal_id,project_id,name,scope_room_id,project_room_id,sort_order)
  VALUES(NULL,v_project_id,COALESCE(NULLIF(btrim(p_request->>'name'),''),'New board'),NULL,v_room_id,
    COALESCE((SELECT max(sort_order)+1 FROM public.proposal_boards WHERE project_id=v_project_id),0))
  RETURNING * INTO v_board;
  RETURN jsonb_build_object('boardId',v_board.id,'projectId',v_project_id,'roomId',v_room_id);
END;
$$;

ALTER FUNCTION public.apply_board_room_state(uuid, text, uuid, jsonb)
  RENAME TO _apply_board_room_state_v1_impl;
REVOKE ALL ON FUNCTION public._apply_board_room_state_v1_impl(uuid, text, uuid, jsonb)
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
DECLARE v_entry jsonb; v_selection_id uuid;
BEGIN
  IF p_owner_kind = 'project' THEN
    PERFORM public._ffe_require_studio_project(p_owner_id);
  ELSIF p_owner_kind = 'proposal' THEN
    IF auth.uid() IS NULL OR NOT EXISTS (
      SELECT 1 FROM public.proposals proposal
      WHERE proposal.id = p_owner_id AND public.is_studio_comember(proposal.designer_id)
    ) THEN RAISE EXCEPTION 'proposal not found or not accessible' USING ERRCODE='insufficient_privilege'; END IF;
  ELSE RAISE EXCEPTION 'invalid board owner kind' USING ERRCODE='check_violation'; END IF;

  FOR v_entry IN SELECT value FROM jsonb_array_elements(COALESCE(p_state->'items','[]'::jsonb)) LOOP
    IF v_entry ? 'projectFfeItemId' AND v_entry->'projectFfeItemId' <> 'null'::jsonb THEN
      IF p_owner_kind <> 'project' OR v_entry->>'projectFfeItemId' !~* '^[0-9a-f-]{36}$' THEN
        RAISE EXCEPTION 'only project boards may place project selections' USING ERRCODE='check_violation';
      END IF;
      v_selection_id := (v_entry->>'projectFfeItemId')::uuid;
      IF NOT EXISTS (
        SELECT 1 FROM public.project_ffe_items item
        WHERE item.id=v_selection_id AND item.project_id=p_owner_id AND item.removed_at IS NULL
      ) THEN RAISE EXCEPTION 'board selection does not belong to project' USING ERRCODE='integrity_constraint_violation'; END IF;
    END IF;
  END LOOP;

  PERFORM set_config('app.board_state_rpc','on',true);
  PERFORM public._apply_board_room_state_v1_impl(p_board_id,p_owner_kind,p_owner_id,p_state);
  IF p_owner_kind='project' THEN
    UPDATE public.proposal_board_items item
    SET project_ffe_item_id=NULLIF(entry->>'projectFfeItemId','')::uuid
    FROM jsonb_array_elements(p_state->'items') entry
    WHERE item.id=(entry->>'id')::uuid AND item.board_id=p_board_id;
  END IF;
END;
$$;

ALTER FUNCTION public.continue_board_in_project(uuid)
  RENAME TO _continue_board_in_project_v1_impl;
REVOKE ALL ON FUNCTION public._continue_board_in_project_v1_impl(uuid)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.continue_board_in_project(p_project_board_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE v_source public.project_boards%ROWTYPE; v_new_id uuid;
BEGIN
  SELECT * INTO v_source FROM public.project_boards WHERE id=p_project_board_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'board not found or not accessible' USING ERRCODE='insufficient_privilege'; END IF;
  PERFORM public._ffe_require_studio_project(v_source.project_id);
  PERFORM set_config('app.board_state_rpc','on',true);
  v_new_id := public._continue_board_in_project_v1_impl(p_project_board_id);
  UPDATE public.proposal_boards SET project_room_id=v_source.project_room_id
  WHERE id=v_new_id;
  UPDATE public.proposal_board_items item
  SET project_ffe_item_id=NULLIF(item.data->>'project_ffe_item_id','')::uuid
  WHERE item.board_id=v_new_id
    AND item.data->>'project_ffe_item_id' ~* '^[0-9a-f-]{36}$';
  RETURN v_new_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.promote_board_reference_to_selection(
  p_board_item_id uuid,
  p_request jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE v_board_id uuid; v_project_id uuid; v_product_id uuid; v_result jsonb;
BEGIN
  SELECT item.board_id, board.project_id, item.product_id
  INTO v_board_id,v_project_id,v_product_id
  FROM public.proposal_board_items item
  JOIN public.proposal_boards board ON board.id=item.board_id
  WHERE item.id=p_board_item_id AND board.project_id IS NOT NULL FOR UPDATE OF item;
  IF NOT FOUND THEN RAISE EXCEPTION 'project board reference not found' USING ERRCODE='no_data_found'; END IF;
  PERFORM public._ffe_require_studio_project(v_project_id);
  v_result := public.place_product_in_project_v2(
    (p_request - 'boardId') || jsonb_strip_nulls(jsonb_build_object(
      'projectId',v_project_id,'productId',COALESCE(NULLIF(p_request->>'productId','')::uuid,v_product_id),
      'duplicateMode',COALESCE(p_request->>'duplicateMode','reuse'),
      'idempotencyKey',COALESCE(NULLIF(p_request->>'idempotencyKey',''),'promote:'||p_board_item_id::text)
    ))
  );
  PERFORM set_config('app.board_state_rpc','on',true);
  UPDATE public.proposal_board_items SET
    project_ffe_item_id=(v_result->>'selectionId')::uuid,
    product_id=COALESCE(product_id,(v_result->>'productId')::uuid)
  WHERE id=p_board_item_id;
  RETURN v_result || jsonb_build_object('placementId',p_board_item_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.triage_project_ffe_items(p_request jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE v_project_id uuid:=NULLIF(p_request->>'projectId','')::uuid; v_ids uuid[]; v_scope text:=p_request->>'assignmentScope'; v_room uuid:=NULLIF(p_request->>'roomId','')::uuid; v_disposition text:=NULLIF(p_request->>'disposition',''); v_count integer;
BEGIN
  PERFORM public._ffe_require_studio_project(v_project_id);
  SELECT array_agg(value::uuid) INTO v_ids FROM jsonb_array_elements_text(p_request->'selectionIds');
  IF COALESCE(cardinality(v_ids),0)=0 OR v_scope NOT IN ('room','throughout','unassigned')
     OR (v_scope='room')<>(v_room IS NOT NULL)
     OR (v_disposition IS NOT NULL AND v_disposition NOT IN ('candidate','selected','alternate','not_selected'))
  THEN RAISE EXCEPTION 'invalid triage request' USING ERRCODE='check_violation'; END IF;
  IF v_room IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.project_rooms WHERE id=v_room AND project_id=v_project_id) THEN
    RAISE EXCEPTION 'room does not belong to project' USING ERRCODE='integrity_constraint_violation';
  END IF;
  PERFORM set_config('app.ffe_mutation_rpc','on',true);
  UPDATE public.project_ffe_items SET project_room_id=v_room,assignment_scope=v_scope,
    design_disposition=COALESCE(v_disposition,design_disposition),updated_at=now()
  WHERE project_id=v_project_id AND id=ANY(v_ids) AND removed_at IS NULL;
  GET DIAGNOSTICS v_count=ROW_COUNT;
  IF v_count<>cardinality(v_ids) THEN RAISE EXCEPTION 'one or more selections are missing or cross-project' USING ERRCODE='integrity_constraint_violation'; END IF;
  RETURN jsonb_build_object('updatedCount',v_count,'assignmentScope',v_scope,'roomId',v_room);
END;
$$;

CREATE OR REPLACE FUNCTION public.archive_project_selection(p_ffe_item_id uuid,p_reason text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $$
DECLARE v_item public.project_ffe_items%ROWTYPE;
BEGIN
  SELECT * INTO v_item FROM public.project_ffe_items WHERE id=p_ffe_item_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'selection not found' USING ERRCODE='no_data_found'; END IF;
  PERFORM public._ffe_require_studio_project(v_item.project_id);
  IF char_length(btrim(COALESCE(p_reason,'')))<5 THEN RAISE EXCEPTION 'archive reason must be at least 5 characters' USING ERRCODE='check_violation'; END IF;
  IF EXISTS(
    SELECT 1 FROM public.furnishing_authorization_items line
    JOIN public.project_commercial_documents document ON document.id=line.commercial_document_id
    JOIN public.proposals proposal ON proposal.id=document.proposal_id
    WHERE line.source_ffe_item_id=v_item.id AND proposal.commercial_state IN ('draft','sent','executed')
  ) OR v_item.purchase_order_id IS NOT NULL THEN
    RAISE EXCEPTION 'authorized or ordered selections must be changed through supersession/PO change'
      USING ERRCODE='check_violation';
  END IF;
  PERFORM set_config('app.ffe_mutation_rpc','on',true);
  UPDATE public.project_ffe_items SET removed_at=now(),removed_by=auth.uid(),removal_reason=btrim(p_reason),
    design_disposition='not_selected',updated_at=now() WHERE id=v_item.id;
  RETURN jsonb_build_object('selectionId',v_item.id,'archived',true);
END;
$$;

CREATE OR REPLACE FUNCTION public.supersede_project_selection(p_request jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $$
DECLARE v_old_id uuid:=NULLIF(p_request->>'selectionId','')::uuid; v_old public.project_ffe_items%ROWTYPE; v_new public.project_ffe_items%ROWTYPE; v_new_product uuid:=NULLIF(p_request->>'productId','')::uuid; v_placements uuid[];
BEGIN
  SELECT * INTO v_old FROM public.project_ffe_items WHERE id=v_old_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'selection not found' USING ERRCODE='no_data_found'; END IF;
  PERFORM public._ffe_require_studio_project(v_old.project_id);
  IF EXISTS(
    SELECT 1 FROM public.furnishing_authorization_items line
    JOIN public.project_commercial_documents document ON document.id=line.commercial_document_id
    JOIN public.proposals proposal ON proposal.id=document.proposal_id
    WHERE line.source_ffe_item_id=v_old.id AND proposal.commercial_state IN ('draft','sent')
  ) THEN RAISE EXCEPTION 'draft or sent authorization must be voided before replacement' USING ERRCODE='check_violation'; END IF;
  IF v_old.design_disposition='superseded' OR v_old.removed_at IS NOT NULL THEN RAISE EXCEPTION 'selection is already inactive' USING ERRCODE='check_violation'; END IF;
  IF v_new_product IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.products WHERE id=v_new_product AND deleted_at IS NULL AND merged_into_id IS NULL) THEN
    RAISE EXCEPTION 'replacement product not found' USING ERRCODE='no_data_found';
  END IF;
  SELECT array_agg(value::uuid) INTO v_placements FROM jsonb_array_elements_text(COALESCE(p_request->'placementIds','[]'::jsonb));
  PERFORM set_config('app.ffe_mutation_rpc','on',true);
  UPDATE public.project_ffe_items SET design_disposition='superseded',updated_at=now() WHERE id=v_old.id;
  INSERT INTO public.project_ffe_items(
    project_id,project_room_id,product_id,name,ffe_category,item_type,status,quantity,
    unit_price_cents,line_total_cents,budget_min_cents,budget_max_cents,vendor_name,vendor_id,
    blocked,notes,sort_order,trade_price_cents,markup_percent,added_via,doc_code,custom_fields,
    selection_thread_id,supersedes_ffe_item_id,design_disposition,assignment_scope
  ) SELECT
    project_id,project_room_id,COALESCE(v_new_product,product_id),COALESCE(NULLIF(btrim(p_request->>'name'),''),name),ffe_category,item_type,'specified',quantity,
    CASE WHEN v_new_product IS NULL THEN unit_price_cents ELSE COALESCE((SELECT price_retail FROM public.products WHERE id=v_new_product),0) END,
    quantity*CASE WHEN v_new_product IS NULL THEN COALESCE(unit_price_cents,0) ELSE COALESCE((SELECT price_retail FROM public.products WHERE id=v_new_product),0) END,
    budget_min_cents,budget_max_cents,
    CASE WHEN v_new_product IS NULL THEN vendor_name ELSE (SELECT vendor.name FROM public.products product LEFT JOIN public.vendors vendor ON vendor.id=product.vendor_id WHERE product.id=v_new_product) END,
    CASE WHEN v_new_product IS NULL THEN vendor_id ELSE (SELECT vendor_id FROM public.products WHERE id=v_new_product) END,
    false,NULL,sort_order,
    CASE WHEN v_new_product IS NULL THEN trade_price_cents ELSE COALESCE((SELECT price_trade FROM public.products WHERE id=v_new_product),(SELECT price_retail FROM public.products WHERE id=v_new_product),0) END,
    markup_percent,'replacement',doc_code,custom_fields,selection_thread_id,id,'selected',assignment_scope
  FROM public.project_ffe_items WHERE id=v_old.id RETURNING * INTO v_new;
  INSERT INTO public.project_ffe_specs(ffe_item_id,routing_source,updated_by)
  VALUES(v_new.id,jsonb_build_object('supersedesSelectionId',v_old.id),auth.uid()) ON CONFLICT DO NOTHING;
  UPDATE public.project_ffe_selection_threads SET primary_ffe_item_id=v_new.id,updated_at=now() WHERE id=v_new.selection_thread_id;
  IF cardinality(v_placements)>0 THEN
    PERFORM set_config('app.board_state_rpc','on',true);
    UPDATE public.proposal_board_items placement SET project_ffe_item_id=v_new.id,product_id=v_new.product_id
    FROM public.proposal_boards board
    WHERE placement.id=ANY(v_placements) AND placement.board_id=board.id AND board.project_id=v_old.project_id
      AND placement.project_ffe_item_id=v_old.id;
    IF NOT FOUND THEN RAISE EXCEPTION 'chosen placements were not linked to predecessor' USING ERRCODE='integrity_constraint_violation'; END IF;
  END IF;
  RETURN jsonb_build_object('predecessorSelectionId',v_old.id,'selectionId',v_new.id,'threadId',v_new.selection_thread_id,'repointedPlacementIds',to_jsonb(COALESCE(v_placements,'{}'::uuid[])));
END;
$$;

CREATE OR REPLACE FUNCTION public.stage_project_ffe_import(p_request jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $$
DECLARE
  v_project_id uuid:=NULLIF(p_request->>'projectId','')::uuid;
  v_hash text:=lower(p_request->>'fileHash');
  v_kind text:=lower(p_request->>'sourceKind');
  v_rows jsonb:=p_request->'rows';
  v_batch public.project_ffe_import_batches%ROWTYPE;
  v_row jsonb; v_ordinal integer:=0; v_room_id uuid; v_errors jsonb;
BEGIN
  PERFORM public._ffe_require_studio_project(v_project_id);
  IF v_hash !~ '^[0-9a-f]{64}$' OR v_kind NOT IN ('csv','xls','xlsx','pdf')
     OR jsonb_typeof(v_rows)<>'array' OR jsonb_array_length(v_rows)>5000
  THEN RAISE EXCEPTION 'invalid import envelope' USING ERRCODE='check_violation'; END IF;
  SELECT * INTO v_batch FROM public.project_ffe_import_batches
  WHERE project_id=v_project_id AND file_hash=v_hash FOR UPDATE;
  IF FOUND THEN
    RETURN jsonb_build_object('batchId',v_batch.id,'status',v_batch.status,'rowCount',v_batch.row_count,'reused',true);
  END IF;
  INSERT INTO public.project_ffe_import_batches(project_id,source_kind,file_hash,row_count,staged_by)
  VALUES(v_project_id,v_kind,v_hash,jsonb_array_length(v_rows),auth.uid()) RETURNING * INTO v_batch;
  FOR v_row IN SELECT value FROM jsonb_array_elements(v_rows) LOOP
    v_ordinal:=v_ordinal+1; v_errors:='[]'::jsonb; v_room_id:=NULL;
    IF jsonb_typeof(v_row)<>'object' THEN RAISE EXCEPTION 'import row % must be an object',v_ordinal USING ERRCODE='check_violation'; END IF;
    IF EXISTS(SELECT 1 FROM jsonb_each_text(v_row) field WHERE field.value ~ '^[=+@]' OR field.value ~ '^-[A-Za-z]') THEN
      v_errors:=v_errors||jsonb_build_array('formula_like_value');
    END IF;
    IF NULLIF(btrim(v_row->>'roomName'),'') IS NOT NULL THEN
      SELECT id INTO v_room_id FROM public.project_rooms
      WHERE project_id=v_project_id AND lower(btrim(name))=lower(btrim(v_row->>'roomName'))
      ORDER BY sort_order,id LIMIT 1;
      IF v_room_id IS NULL THEN v_errors:=v_errors||jsonb_build_array('unknown_room'); END IF;
    END IF;
    IF NULLIF(btrim(v_row->>'name'),'') IS NULL AND NULLIF(v_row->>'productId','') IS NULL THEN
      v_errors:=v_errors||jsonb_build_array('missing_name');
    END IF;
    INSERT INTO public.project_ffe_import_rows(
      batch_id,row_ordinal,raw_row,normalized_row,project_room_id,assignment_scope,
      duplicate_mode,imported_approval_text,validation_errors
    ) VALUES(
      v_batch.id,v_ordinal,v_row,
      jsonb_strip_nulls(jsonb_build_object(
        'name',NULLIF(btrim(v_row->>'name'),''),'category',NULLIF(btrim(v_row->>'category'),''),
        'productId',NULLIF(v_row->>'productId',''),'quantity',COALESCE(NULLIF(v_row->>'quantity','')::integer,1)
      )),v_room_id,
      CASE WHEN v_room_id IS NOT NULL THEN 'room' ELSE NULL END,
      NULL,NULLIF(v_row->>'approved',''),v_errors
    );
  END LOOP;
  RETURN jsonb_build_object('batchId',v_batch.id,'status','staged','rowCount',v_ordinal,'reused',false);
END;
$$;

CREATE OR REPLACE FUNCTION public.commit_project_ffe_import(
  p_batch_id uuid,
  p_decisions jsonb DEFAULT '[]'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $$
DECLARE v_batch public.project_ffe_import_batches%ROWTYPE; v_decision jsonb; v_row public.project_ffe_import_rows%ROWTYPE; v_result jsonb; v_results jsonb:='[]'::jsonb; v_count integer:=0;
BEGIN
  SELECT * INTO v_batch FROM public.project_ffe_import_batches WHERE id=p_batch_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'import batch not found' USING ERRCODE='no_data_found'; END IF;
  PERFORM public._ffe_require_studio_project(v_batch.project_id);
  IF v_batch.status='committed' THEN
    RETURN jsonb_build_object('batchId',v_batch.id,'status','committed','results',COALESCE((SELECT jsonb_agg(jsonb_build_object('rowOrdinal',row_ordinal,'selectionId',committed_ffe_item_id) ORDER BY row_ordinal) FROM public.project_ffe_import_rows WHERE batch_id=v_batch.id),'[]'::jsonb));
  END IF;
  IF v_batch.status<>'staged' OR jsonb_typeof(p_decisions)<>'array' THEN RAISE EXCEPTION 'import batch is not committable' USING ERRCODE='check_violation'; END IF;
  FOR v_decision IN SELECT value FROM jsonb_array_elements(p_decisions) LOOP
    UPDATE public.project_ffe_import_rows SET
      project_room_id=NULLIF(v_decision->>'roomId','')::uuid,
      assignment_scope=v_decision->>'assignmentScope',
      duplicate_mode=v_decision->>'duplicateMode',
      validation_errors=CASE WHEN v_decision ? 'roomId' OR v_decision->>'assignmentScope' IN ('throughout','unassigned')
        THEN COALESCE((SELECT jsonb_agg(error) FROM jsonb_array_elements(validation_errors) error WHERE error#>>'{}'<>'unknown_room'),'[]'::jsonb)
        ELSE validation_errors END
    WHERE batch_id=v_batch.id AND row_ordinal=(v_decision->>'rowOrdinal')::integer;
  END LOOP;
  IF EXISTS(
    SELECT 1 FROM public.project_ffe_import_rows row
    WHERE row.batch_id=v_batch.id AND (
      jsonb_array_length(row.validation_errors)>0 OR row.assignment_scope IS NULL OR row.duplicate_mode IS NULL
      OR (row.assignment_scope='room' AND (row.project_room_id IS NULL OR NOT EXISTS(SELECT 1 FROM public.project_rooms room WHERE room.id=row.project_room_id AND room.project_id=v_batch.project_id)))
      OR (row.assignment_scope<>'room' AND row.project_room_id IS NOT NULL)
    )
  ) THEN RAISE EXCEPTION 'every import row requires valid room and duplicate decisions' USING ERRCODE='check_violation'; END IF;
  FOR v_row IN SELECT * FROM public.project_ffe_import_rows WHERE batch_id=v_batch.id ORDER BY row_ordinal LOOP
    v_result:=public.place_product_in_project_v2(jsonb_strip_nulls(jsonb_build_object(
      'projectId',v_batch.project_id,'productId',v_row.normalized_row->>'productId','name',v_row.normalized_row->>'name',
      'category',v_row.normalized_row->>'category','quantity',v_row.normalized_row->>'quantity',
      'roomId',v_row.project_room_id,'assignmentScope',v_row.assignment_scope,'duplicateMode',v_row.duplicate_mode,
      'disposition','candidate','source','spreadsheet-import','sourceMetadata',jsonb_build_object('batchId',v_batch.id,'rowOrdinal',v_row.row_ordinal,'importedApprovalText',v_row.imported_approval_text),
      'idempotencyKey','import:'||v_batch.id::text||':'||v_row.row_ordinal::text
    )));
    UPDATE public.project_ffe_import_rows SET committed_ffe_item_id=NULLIF(v_result->>'selectionId','')::uuid WHERE id=v_row.id;
    v_results:=v_results||jsonb_build_array(v_result||jsonb_build_object('rowOrdinal',v_row.row_ordinal)); v_count:=v_count+1;
  END LOOP;
  UPDATE public.project_ffe_import_batches SET status='committed',committed_at=now(),updated_at=now() WHERE id=v_batch.id;
  RETURN jsonb_build_object('batchId',v_batch.id,'status','committed','committedCount',v_count,'results',v_results);
END;
$$;

CREATE OR REPLACE FUNCTION public.publish_project_review(p_request jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','extensions','pg_temp'
AS $$
DECLARE
  v_project_id uuid:=NULLIF(p_request->>'projectId','')::uuid; v_edition public.project_review_editions%ROWTYPE;
  v_entry jsonb; v_item public.project_ffe_items%ROWTYPE; v_item_snapshot jsonb; v_room_snapshot jsonb; v_media jsonb; v_content_hash text;
  v_item_ids uuid[]:='{}'; v_number integer; v_hash text; v_previous text:=current_setting('app.project_review_publish',true);
BEGIN
  PERFORM public._ffe_require_studio_project(v_project_id);
  IF jsonb_typeof(p_request->'items')<>'array' OR jsonb_array_length(p_request->'items')=0
     OR COALESCE(p_request->>'clientPriceMode','hide') NOT IN ('hide','unit','line_total')
  THEN RAISE EXCEPTION 'review publication requires items and a valid price mode' USING ERRCODE='check_violation'; END IF;
  PERFORM set_config('app.project_review_publish','on',true);
  UPDATE public.project_review_editions SET status='superseded',superseded_at=now(),updated_at=now()
  WHERE project_id=v_project_id AND status='published';
  SELECT COALESCE(max(edition_number),0)+1 INTO v_number FROM public.project_review_editions WHERE project_id=v_project_id;
  INSERT INTO public.project_review_editions(project_id,edition_number,title,client_price_mode,room_snapshot,board_snapshot,created_by)
  VALUES(
    v_project_id,v_number,COALESCE(NULLIF(btrim(p_request->>'title'),''),'Selections review '||v_number),
    COALESCE(p_request->>'clientPriceMode','hide'),
    COALESCE((SELECT jsonb_agg(jsonb_build_object('id',room.id,'name',room.name,'sortOrder',room.sort_order) ORDER BY room.sort_order,room.id) FROM public.project_rooms room WHERE room.project_id=v_project_id),'[]'::jsonb),
    COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'id',board.id,'name',board.name,'roomId',board.project_room_id,'canvasWidth',board.canvas_width,'canvasHeight',board.canvas_height,
      'backgroundColor',board.background_color,'sections',board.sections,
      'items',COALESCE((SELECT jsonb_agg(jsonb_strip_nulls(jsonb_build_object('id',placement.id,'selectionId',placement.project_ffe_item_id,'x',placement.x,'y',placement.y,'width',placement.width,'height',placement.height,'zIndex',placement.z_index,'rotation',placement.rotation,'data',placement.data)) ORDER BY placement.z_index,placement.id) FROM public.proposal_board_items placement WHERE placement.board_id=board.id AND placement.project_ffe_item_id IS NOT NULL),'[]'::jsonb)
    ) ORDER BY board.sort_order,board.id) FROM public.proposal_boards board WHERE board.project_id=v_project_id AND board.id IN (SELECT value::uuid FROM jsonb_array_elements_text(COALESCE(p_request->'boardIds','[]'::jsonb)))),'[]'::jsonb),
    auth.uid()
  ) RETURNING * INTO v_edition;
  FOR v_entry IN SELECT value FROM jsonb_array_elements(p_request->'items') LOOP
    SELECT * INTO v_item FROM public.project_ffe_items WHERE id=(v_entry->>'selectionId')::uuid AND project_id=v_project_id AND removed_at IS NULL;
    IF NOT FOUND OR v_item.design_disposition IN ('not_selected','superseded') THEN RAISE EXCEPTION 'review item is unavailable' USING ERRCODE='integrity_constraint_violation'; END IF;
    IF v_item.id=ANY(v_item_ids) THEN RAISE EXCEPTION 'review cannot contain duplicate selections' USING ERRCODE='unique_violation'; END IF;
    v_item_ids:=array_append(v_item_ids,v_item.id);
    SELECT COALESCE(jsonb_agg(jsonb_build_object('id',asset.id,'checksumSha256',asset.checksum_sha256,'kind',asset.derivative_kind) ORDER BY asset.derivative_kind,asset.id),'[]'::jsonb)
    INTO v_media FROM public.project_review_media_assets asset
    WHERE asset.project_id=v_project_id AND asset.id IN (SELECT value::uuid FROM jsonb_array_elements_text(COALESCE(v_entry->'mediaAssetIds','[]'::jsonb)));
    IF jsonb_array_length(v_media)<>jsonb_array_length(COALESCE(v_entry->'mediaAssetIds','[]'::jsonb)) THEN RAISE EXCEPTION 'review media is not prepared for this project' USING ERRCODE='integrity_constraint_violation'; END IF;
    SELECT jsonb_build_object('id',room.id,'name',room.name) INTO v_room_snapshot FROM public.project_rooms room WHERE room.id=v_item.project_room_id;
    v_room_snapshot:=COALESCE(v_room_snapshot,jsonb_build_object('scope',v_item.assignment_scope));
    v_item_snapshot:=jsonb_strip_nulls(jsonb_build_object(
      'selectionId',v_item.id,'threadId',v_item.selection_thread_id,'productId',v_item.product_id,
      'name',v_item.name,'category',v_item.ffe_category,'quantity',v_item.quantity,'assignmentScope',v_item.assignment_scope,
      'room',v_room_snapshot,'clientFields',COALESCE(v_entry->'clientFields','{}'::jsonb),'media',v_media,
      'clientUnitPriceCents',CASE WHEN v_edition.client_price_mode='unit' THEN v_item.unit_price_cents ELSE NULL END,
      'clientLineTotalCents',CASE WHEN v_edition.client_price_mode='line_total' THEN v_item.line_total_cents ELSE NULL END
    ));
    v_content_hash:=encode(extensions.digest(v_item_snapshot::text,'sha256'),'hex');
    INSERT INTO public.project_review_items(
      edition_id,source_ffe_item_id,selection_thread_id,product_id,project_room_id,item_snapshot,room_snapshot,client_fields,
      client_unit_price_cents,client_line_total_cents,media_manifest,content_hash,sort_order
    ) VALUES(
      v_edition.id,v_item.id,v_item.selection_thread_id,v_item.product_id,v_item.project_room_id,v_item_snapshot,v_room_snapshot,
      COALESCE(v_entry->'clientFields','{}'::jsonb),
      CASE WHEN v_edition.client_price_mode='unit' THEN v_item.unit_price_cents END,
      CASE WHEN v_edition.client_price_mode='line_total' THEN v_item.line_total_cents END,
      v_media,v_content_hash,COALESCE(NULLIF(v_entry->>'sortOrder','')::integer,cardinality(v_item_ids)-1)
    );
  END LOOP;
  SELECT encode(extensions.digest(jsonb_build_object('editionId',v_edition.id,'rooms',v_edition.room_snapshot,'boards',v_edition.board_snapshot,'items',(SELECT jsonb_agg(jsonb_build_object('id',id,'hash',content_hash) ORDER BY sort_order,id) FROM public.project_review_items WHERE edition_id=v_edition.id))::text,'sha256'),'hex') INTO v_hash;
  UPDATE public.project_review_editions SET status='published',snapshot_hash=v_hash,published_at=now(),published_by=auth.uid(),updated_at=now() WHERE id=v_edition.id RETURNING * INTO v_edition;
  PERFORM set_config('app.project_review_publish',COALESCE(v_previous,''),true);
  RETURN jsonb_build_object('editionId',v_edition.id,'editionNumber',v_edition.edition_number,'status','published','snapshotHash',v_hash,'itemCount',cardinality(v_item_ids));
EXCEPTION WHEN OTHERS THEN PERFORM set_config('app.project_review_publish',COALESCE(v_previous,''),true); RAISE;
END;
$$;

CREATE OR REPLACE FUNCTION public.record_project_review_feedback(p_review_item_id uuid,p_verdict text,p_body text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $$
DECLARE v_actor uuid:=auth.uid(); v_edition_id uuid; v_project_id uuid; v_feedback_id uuid;
BEGIN
  IF v_actor IS NULL OR p_verdict NOT IN ('approved','rejected','comment') OR (p_verdict='comment' AND btrim(COALESCE(p_body,''))='') THEN RAISE EXCEPTION 'invalid review feedback' USING ERRCODE='check_violation'; END IF;
  SELECT edition.id,edition.project_id INTO v_edition_id,v_project_id FROM public.project_review_items item JOIN public.project_review_editions edition ON edition.id=item.edition_id JOIN public.projects project ON project.id=edition.project_id WHERE item.id=p_review_item_id AND edition.status='published' AND project.client_id=v_actor;
  IF NOT FOUND THEN RAISE EXCEPTION 'published review item not found or not accessible' USING ERRCODE='insufficient_privilege'; END IF;
  INSERT INTO public.item_feedback(project_review_item_id,client_id,verdict,body)
  VALUES(p_review_item_id,v_actor,p_verdict,NULLIF(btrim(p_body),'')) RETURNING id INTO v_feedback_id;
  RETURN jsonb_build_object('feedbackId',v_feedback_id,'reviewItemId',p_review_item_id,'verdict',p_verdict);
END;
$$;

CREATE OR REPLACE FUNCTION public.get_client_project_selections(p_project_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $$
DECLARE v_actor uuid:=auth.uid(); v_project public.projects%ROWTYPE;
BEGIN
  IF v_actor IS NULL THEN RAISE EXCEPTION 'authentication required' USING ERRCODE='insufficient_privilege'; END IF;
  SELECT * INTO v_project FROM public.projects WHERE id=p_project_id;
  IF NOT FOUND OR NOT(v_project.client_id=v_actor OR public.is_studio_comember(v_project.designer_id)) THEN RAISE EXCEPTION 'project not found or not accessible' USING ERRCODE='insufficient_privilege'; END IF;
  RETURN jsonb_build_object('projectId',v_project.id,'projectName',v_project.name,'selections',COALESCE((
    SELECT jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
      'id',item.id,'threadId',item.selection_thread_id,'name',item.name,'category',item.ffe_category,
      'assignmentScope',item.assignment_scope,'roomId',item.project_room_id,'roomName',room.name,
      'quantity',item.quantity,'clientUnitPriceCents',item.unit_price_cents,'clientLineTotalCents',item.line_total_cents,
      'logisticsStatus',item.status,'designDisposition',item.design_disposition,'productId',item.product_id,'imageUrl',product.images[1]
    )) ORDER BY room.sort_order NULLS FIRST,item.sort_order,item.created_at,item.id)
    FROM public.project_ffe_items item LEFT JOIN public.project_rooms room ON room.id=item.project_room_id LEFT JOIN public.products product ON product.id=item.product_id
    WHERE item.project_id=p_project_id AND item.removed_at IS NULL AND item.design_disposition NOT IN ('not_selected','superseded')
  ),'[]'::jsonb));
END;
$$;

CREATE OR REPLACE FUNCTION public.get_client_project_review_bundle(p_edition_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $$
DECLARE v_actor uuid:=auth.uid(); v_edition public.project_review_editions%ROWTYPE; v_project public.projects%ROWTYPE;
BEGIN
  IF v_actor IS NULL THEN RAISE EXCEPTION 'authentication required' USING ERRCODE='insufficient_privilege'; END IF;
  SELECT * INTO v_edition FROM public.project_review_editions WHERE id=p_edition_id AND status IN ('published','finalized');
  IF NOT FOUND THEN RAISE EXCEPTION 'published review not found' USING ERRCODE='no_data_found'; END IF;
  SELECT * INTO v_project FROM public.projects WHERE id=v_edition.project_id;
  IF NOT(v_project.client_id=v_actor OR public.is_studio_comember(v_project.designer_id)) THEN RAISE EXCEPTION 'review not accessible' USING ERRCODE='insufficient_privilege'; END IF;
  RETURN jsonb_build_object(
    'edition',jsonb_build_object('id',v_edition.id,'number',v_edition.edition_number,'title',v_edition.title,'status',v_edition.status,'publishedAt',v_edition.published_at,'priceMode',v_edition.client_price_mode,'snapshotHash',v_edition.snapshot_hash),
    'project',jsonb_build_object('id',v_project.id,'name',v_project.name),
    'rooms',v_edition.room_snapshot,'boards',v_edition.board_snapshot,
    'items',COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'id',item.id,'selectionId',item.source_ffe_item_id,'threadId',item.selection_thread_id,
      'snapshot',item.item_snapshot,'contentHash',item.content_hash,
      'feedback',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',feedback.id,'verdict',feedback.verdict,'body',feedback.body,'createdAt',feedback.created_at) ORDER BY feedback.created_at) FROM public.item_feedback feedback WHERE feedback.project_review_item_id=item.id AND feedback.client_id=v_actor),'[]'::jsonb)
    ) ORDER BY item.sort_order,item.id) FROM public.project_review_items item WHERE item.edition_id=v_edition.id),'[]'::jsonb)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_project_review_media_manifest(p_edition_id uuid,p_client_id uuid)
RETURNS jsonb
LANGUAGE sql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $$
  SELECT COALESCE(jsonb_agg(DISTINCT jsonb_build_object(
    'assetId',asset.id,'bucket',asset.storage_bucket,'path',asset.storage_path,
    'checksumSha256',asset.checksum_sha256,'contentType',asset.content_type
  )),'[]'::jsonb)
  FROM public.project_review_editions edition
  JOIN public.projects project ON project.id=edition.project_id
  JOIN public.project_review_items item ON item.edition_id=edition.id
  CROSS JOIN LATERAL jsonb_array_elements(item.media_manifest) media
  JOIN public.project_review_media_assets asset ON asset.id=(media->>'id')::uuid
  WHERE edition.id=p_edition_id AND edition.status IN ('published','finalized') AND project.client_id=p_client_id;
$$;

CREATE OR REPLACE FUNCTION public.start_purchase_order_change(p_request jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $$
DECLARE v_po_id uuid:=NULLIF(p_request->>'purchaseOrderId','')::uuid; v_item_id uuid:=NULLIF(p_request->>'selectionId','')::uuid; v_kind text:=p_request->>'changeKind'; v_reason text:=btrim(COALESCE(p_request->>'reason','')); v_po public.purchase_orders%ROWTYPE; v_item public.project_ffe_items%ROWTYPE; v_change public.purchase_order_changes%ROWTYPE; v_rebuildable boolean;
BEGIN
  SELECT * INTO v_po FROM public.purchase_orders WHERE id=v_po_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'purchase order not found' USING ERRCODE='no_data_found'; END IF;
  PERFORM public._ffe_require_studio_project(v_po.project_id);
  IF v_kind NOT IN ('vendor_change','cancellation','credit','claim','remedy','new_scope') OR char_length(v_reason)<5 THEN RAISE EXCEPTION 'invalid purchase order change' USING ERRCODE='check_violation'; END IF;
  IF v_item_id IS NOT NULL THEN SELECT * INTO v_item FROM public.project_ffe_items WHERE id=v_item_id AND project_id=v_po.project_id AND purchase_order_id=v_po.id FOR UPDATE; IF NOT FOUND THEN RAISE EXCEPTION 'selection is not on purchase order' USING ERRCODE='integrity_constraint_violation'; END IF; END IF;
  IF v_item.status IN ('delivered','installed') AND v_kind NOT IN ('claim','remedy','new_scope') THEN RAISE EXCEPTION 'delivered or installed selections require claim, remedy, or new scope' USING ERRCODE='check_violation'; END IF;
  v_rebuildable:=v_po.status='draft' AND v_po.sent_at IS NULL AND v_po.acknowledged_at IS NULL AND NOT EXISTS(SELECT 1 FROM public.po_payments payment WHERE payment.purchase_order_id=v_po.id AND payment.state='paid');
  INSERT INTO public.purchase_order_changes(project_id,purchase_order_id,project_ffe_item_id,change_kind,reason,prior_snapshot,created_by)
  VALUES(v_po.project_id,v_po.id,v_item_id,v_kind,v_reason,jsonb_build_object('purchaseOrder',to_jsonb(v_po),'selection',CASE WHEN v_item_id IS NULL THEN NULL ELSE to_jsonb(v_item) END),auth.uid()) RETURNING * INTO v_change;
  IF v_rebuildable AND v_kind IN ('vendor_change','cancellation') THEN
    PERFORM set_config('app.ffe_mutation_rpc','on',true);
    UPDATE public.project_ffe_items SET purchase_order_id=NULL,updated_at=now() WHERE purchase_order_id=v_po.id;
    UPDATE public.purchase_orders SET status='cancelled',updated_at=now() WHERE id=v_po.id;
  END IF;
  RETURN jsonb_build_object('changeId',v_change.id,'purchaseOrderId',v_po.id,'rebuildable',v_rebuildable,'requiresImmutableFollowup',NOT v_rebuildable);
END;
$$;

ALTER FUNCTION public.create_purchase_order(uuid,uuid,public.purchase_order_payment_pattern,uuid[],text,date,boolean,date,integer,jsonb,text,text)
  RENAME TO _create_purchase_order_v1_impl;
REVOKE ALL ON FUNCTION public._create_purchase_order_v1_impl(uuid,uuid,public.purchase_order_payment_pattern,uuid[],text,date,boolean,date,integer,jsonb,text,text)
  FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.create_purchase_order(
  p_project_id uuid,p_vendor_id uuid,p_payment_pattern public.purchase_order_payment_pattern,p_ffe_item_ids uuid[],
  p_vendor_po_number text DEFAULT NULL,p_confirmed_eta date DEFAULT NULL,p_is_patina_catalog boolean DEFAULT false,
  p_deposit_due_date date DEFAULT NULL,p_deposit_amount_cents integer DEFAULT NULL,p_custom_milestones jsonb DEFAULT '[]'::jsonb,
  p_sidemark text DEFAULT NULL,p_notes text DEFAULT NULL
)
RETURNS public.purchase_orders
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $$
DECLARE v_po public.purchase_orders%ROWTYPE; v_requested integer:=COALESCE(cardinality(p_ffe_item_ids),0);
BEGIN
  PERFORM public._ffe_require_studio_project(p_project_id);
  IF v_requested=0 THEN RAISE EXCEPTION 'create_purchase_order: at least one FF&E item is required' USING ERRCODE='check_violation'; END IF;
  IF (SELECT count(*) FROM public.project_ffe_items item WHERE item.id=ANY(p_ffe_item_ids) AND item.project_id=p_project_id)<>v_requested THEN
    RAISE EXCEPTION 'create_purchase_order: FF&E items not found in project % (missing, duplicate, or cross-project ids)',p_project_id USING ERRCODE='integrity_constraint_violation';
  END IF;
  IF (SELECT count(*) FROM public.project_ffe_items item WHERE item.id=ANY(p_ffe_item_ids) AND item.project_id=p_project_id AND item.vendor_id=p_vendor_id AND item.removed_at IS NULL AND item.design_disposition='selected')<>v_requested THEN
    RAISE EXCEPTION 'every PO line must be an active selected line for the PO project and vendor' USING ERRCODE='integrity_constraint_violation';
  END IF;
  PERFORM set_config('app.ffe_mutation_rpc','on',true);
  v_po:=public._create_purchase_order_v1_impl(p_project_id,p_vendor_id,p_payment_pattern,p_ffe_item_ids,p_vendor_po_number,p_confirmed_eta,p_is_patina_catalog,p_deposit_due_date,p_deposit_amount_cents,p_custom_milestones,p_sidemark,p_notes);
  RETURN v_po;
END;
$$;

CREATE OR REPLACE FUNCTION public._reconcile_activated_ffe_placements(p_project_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $$
BEGIN
  UPDATE public.project_boards board SET items=COALESCE((
    SELECT jsonb_agg(CASE
      WHEN element->'data'->>'proposalItemId' ~* '^[0-9a-f-]{36}$' AND selection.id IS NOT NULL
        THEN element||jsonb_build_object('project_ffe_item_id',selection.id)
      ELSE element END ORDER BY ordinal)
    FROM jsonb_array_elements(board.items) WITH ORDINALITY entry(element,ordinal)
    LEFT JOIN public.project_ffe_items selection ON selection.project_id=p_project_id AND selection.source_proposal_item_id=NULLIF(element->'data'->>'proposalItemId','')::uuid
  ),'[]'::jsonb) WHERE board.project_id=p_project_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.activate_proposal_as_project(p_proposal_id uuid,p_start_date date DEFAULT CURRENT_DATE)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $$
DECLARE v_designer_id uuid; v_document_kind text; v_commercial_state text; v_project_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'activate_proposal_as_project requires an authenticated studio author' USING ERRCODE='insufficient_privilege'; END IF;
  SELECT proposal.designer_id,proposal.document_kind,proposal.commercial_state INTO v_designer_id,v_document_kind,v_commercial_state FROM public.proposals proposal WHERE proposal.id=p_proposal_id FOR UPDATE;
  IF NOT FOUND OR NOT public._can_author_proposal(v_designer_id) THEN RAISE EXCEPTION 'activate_proposal_as_project: proposal % not found or access denied',p_proposal_id USING ERRCODE='insufficient_privilege'; END IF;
  IF v_document_kind<>'legacy' THEN RAISE EXCEPTION 'commercial documents activate only through their dedicated execution RPC' USING ERRCODE='check_violation'; END IF;
  IF v_commercial_state='superseded' THEN RAISE EXCEPTION 'superseded proposal % cannot be activated',p_proposal_id USING ERRCODE='check_violation'; END IF;
  PERFORM set_config('app.ffe_mutation_rpc','on',true); PERFORM set_config('app.board_state_rpc','on',true);
  v_project_id:=public._activate_proposal_as_project_authorized(p_proposal_id,p_start_date);
  PERFORM public._reconcile_activated_ffe_placements(v_project_id);
  RETURN v_project_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.guard_ffe_rpc_mutation()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public','pg_temp'
AS $$
BEGIN
  IF auth.uid() IS NULL OR current_setting('app.ffe_mutation_rpc',true)='on' THEN RETURN COALESCE(NEW,OLD); END IF;
  IF TG_OP='INSERT' AND (NEW.source_proposal_item_id IS NOT NULL OR NEW.source_authorization_item_id IS NOT NULL OR NEW.source_decision_id IS NOT NULL OR NEW.trade_scope_document_id IS NOT NULL) THEN RETURN NEW; END IF;
  IF TG_OP='UPDATE' AND
     NEW.project_id IS NOT DISTINCT FROM OLD.project_id AND NEW.project_room_id IS NOT DISTINCT FROM OLD.project_room_id
     AND NEW.product_id IS NOT DISTINCT FROM OLD.product_id AND NEW.status IS NOT DISTINCT FROM OLD.status
     AND NEW.quantity IS NOT DISTINCT FROM OLD.quantity AND NEW.unit_price_cents IS NOT DISTINCT FROM OLD.unit_price_cents
     AND NEW.line_total_cents IS NOT DISTINCT FROM OLD.line_total_cents AND NEW.trade_price_cents IS NOT DISTINCT FROM OLD.trade_price_cents
     AND NEW.markup_percent IS NOT DISTINCT FROM OLD.markup_percent AND NEW.purchase_order_id IS NOT DISTINCT FROM OLD.purchase_order_id
     AND NEW.selection_thread_id IS NOT DISTINCT FROM OLD.selection_thread_id AND NEW.supersedes_ffe_item_id IS NOT DISTINCT FROM OLD.supersedes_ffe_item_id
     AND NEW.design_disposition IS NOT DISTINCT FROM OLD.design_disposition AND NEW.assignment_scope IS NOT DISTINCT FROM OLD.assignment_scope
     AND NEW.removed_at IS NOT DISTINCT FROM OLD.removed_at AND NEW.removed_by IS NOT DISTINCT FROM OLD.removed_by
     AND NEW.removal_reason IS NOT DISTINCT FROM OLD.removal_reason
  THEN RETURN NEW; END IF;
  RAISE EXCEPTION 'FF&E lifecycle, assignment, pricing, replacement, and removal mutations are RPC-only'
    USING ERRCODE='insufficient_privilege';
END;
$$;

DROP TRIGGER IF EXISTS a_ffe_rpc_mutation_only_trg ON public.project_ffe_items;
CREATE TRIGGER a_ffe_rpc_mutation_only_trg
BEFORE INSERT OR UPDATE OR DELETE ON public.project_ffe_items
FOR EACH ROW EXECUTE FUNCTION public.guard_ffe_rpc_mutation();

CREATE OR REPLACE FUNCTION public.guard_project_board_rpc_mutation()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public','pg_temp'
AS $$
DECLARE v_project_id uuid;
BEGIN
  IF auth.uid() IS NULL OR current_setting('app.board_state_rpc',true)='on' THEN RETURN COALESCE(NEW,OLD); END IF;
  IF TG_TABLE_NAME='proposal_boards' THEN v_project_id:=COALESCE(NEW.project_id,OLD.project_id);
  ELSE SELECT project_id INTO v_project_id FROM public.proposal_boards WHERE id=COALESCE(NEW.board_id,OLD.board_id); END IF;
  IF v_project_id IS NULL THEN RETURN COALESCE(NEW,OLD); END IF;
  RAISE EXCEPTION 'project board state writes are RPC-only' USING ERRCODE='insufficient_privilege';
END;
$$;

DROP TRIGGER IF EXISTS a_project_board_rpc_mutation_only_trg ON public.proposal_boards;
CREATE TRIGGER a_project_board_rpc_mutation_only_trg BEFORE INSERT OR UPDATE OR DELETE ON public.proposal_boards FOR EACH ROW EXECUTE FUNCTION public.guard_project_board_rpc_mutation();
DROP TRIGGER IF EXISTS a_project_board_item_rpc_mutation_only_trg ON public.proposal_board_items;
CREATE TRIGGER a_project_board_item_rpc_mutation_only_trg BEFORE INSERT OR UPDATE OR DELETE ON public.proposal_board_items FOR EACH ROW EXECUTE FUNCTION public.guard_project_board_rpc_mutation();

REVOKE INSERT,UPDATE,DELETE ON public.project_ffe_items,public.proposal_boards,public.proposal_board_items,public.item_feedback FROM authenticated;
GRANT INSERT,UPDATE,DELETE ON public.proposal_boards,public.proposal_board_items TO authenticated;
GRANT INSERT ON public.item_feedback TO authenticated;
REVOKE INSERT,UPDATE,DELETE ON public.project_ffe_specs FROM authenticated;
GRANT UPDATE (sku,finish,material,color_fabric,selected_dimensions,exact_location,client_notes,trade_notes,install_notes,care_notes,warranty_notes,selected_media,source_verifications,na_declarations,field_provenance,routing_source,updated_by,updated_at)
  ON public.project_ffe_specs TO authenticated;

REVOKE ALL ON FUNCTION public._ffe_require_studio_project(uuid),public._reconcile_activated_ffe_placements(uuid),
  public.guard_ffe_rpc_mutation(),public.guard_project_board_rpc_mutation(),
  public.get_project_review_media_manifest(uuid,uuid)
FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.get_project_review_media_manifest(uuid,uuid) TO service_role;

REVOKE ALL ON FUNCTION public.get_project_ffe_readiness(uuid),public.place_product_in_project_v2(jsonb),
  public.place_product_in_project(uuid,uuid,uuid,uuid,text,jsonb),public.create_named_project_need(jsonb),
  public.batch_place_library_products_in_project(jsonb),public.create_project_board(jsonb),
  public.apply_board_room_state(uuid,text,uuid,jsonb),public.continue_board_in_project(uuid),
  public.promote_board_reference_to_selection(uuid,jsonb),public.triage_project_ffe_items(jsonb),
  public.archive_project_selection(uuid,text),public.supersede_project_selection(jsonb),
  public.stage_project_ffe_import(jsonb),public.commit_project_ffe_import(uuid,jsonb),
  public.publish_project_review(jsonb),public.record_project_review_feedback(uuid,text,text),
  public.get_client_project_selections(uuid),public.get_client_project_review_bundle(uuid),
  public.start_purchase_order_change(jsonb),
  public.create_purchase_order(uuid,uuid,public.purchase_order_payment_pattern,uuid[],text,date,boolean,date,integer,jsonb,text,text),
  public.activate_proposal_as_project(uuid,date)
FROM PUBLIC,anon,authenticated,service_role;

GRANT EXECUTE ON FUNCTION public.get_project_ffe_readiness(uuid),public.place_product_in_project_v2(jsonb),
  public.place_product_in_project(uuid,uuid,uuid,uuid,text,jsonb),public.create_named_project_need(jsonb),
  public.batch_place_library_products_in_project(jsonb),public.create_project_board(jsonb),
  public.apply_board_room_state(uuid,text,uuid,jsonb),public.continue_board_in_project(uuid),
  public.promote_board_reference_to_selection(uuid,jsonb),public.triage_project_ffe_items(jsonb),
  public.archive_project_selection(uuid,text),public.supersede_project_selection(jsonb),
  public.stage_project_ffe_import(jsonb),public.commit_project_ffe_import(uuid,jsonb),
  public.publish_project_review(jsonb),public.record_project_review_feedback(uuid,text,text),
  public.get_client_project_selections(uuid),public.get_client_project_review_bundle(uuid),
  public.start_purchase_order_change(jsonb),
  public.create_purchase_order(uuid,uuid,public.purchase_order_payment_pattern,uuid[],text,date,boolean,date,integer,jsonb,text,text),
  public.activate_proposal_as_project(uuid,date)
TO authenticated;

GRANT EXECUTE ON FUNCTION public.get_client_project_selections(uuid),public.get_client_project_review_bundle(uuid)
TO service_role;

COMMENT ON FUNCTION public.place_product_in_project_v2(jsonb) IS
  'Canonical idempotent project placement command. Creates/reuses/fills one selection and optionally one board placement atomically.';
COMMENT ON FUNCTION public.record_project_review_feedback(uuid,text,text) IS
  'Records nonauthoritative approved/rejected/comment feedback against one published immutable review item.';
