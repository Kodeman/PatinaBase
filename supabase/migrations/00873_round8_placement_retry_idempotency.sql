-- ═══════════════════════════════════════════════════════════════════════════
-- 00873 — Admit placement retries against the original caller request
-- Public lineage: 00435 → 00439 → 00442 → 00445 → 00447 → 00752 → 00808.
-- Core lineage: 00438 → 00666 → 00678 → 00730 → 00737 → 00828.
-- SQ-2016 / SQ-2013: 00809 resolves duplicates before 00828 hashes the body,
-- so a successful create changes the body of its own identical retry.
-- Move receipt ownership to the public entry, before role normalization or
-- state-dependent reference/duplicate resolution, and store its final reply.
-- The 00442 and 00809 bridges remain byte-identical. No caller hash, new
-- signature, helper, or GUC is introduced. Actor/project authorization and
-- the existing configuration-workflow guard precede every replay. Existing
-- pre-00873 derived-hash receipts are not rewritten or guessed from state.
-- Rollout: a lost-response retry spanning this migration can be refused with
-- 23505 because its old receipt hashes the derived body, without a duplicate
-- write. Migrate at a quiet time; there is no compatibility fallback.
-- ═══════════════════════════════════════════════════════════════════════════

-- No native caller or API/agent EXECUTE remains for this obsolete entry,
-- which bypasses the public receipt owner through the 00444 bridge.
DROP FUNCTION IF EXISTS public._place_product_in_project_v2_00446_impl(jsonb);

CREATE OR REPLACE FUNCTION public.place_product_in_project_v2(p_request jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  -- 00873: only this entry sees the original caller request and final response.
  v_actor uuid := auth.uid();
  v_project_id uuid := NULLIF(p_request->>'projectId', '')::uuid;
  v_key text := NULLIF(btrim(p_request->>'idempotencyKey'), '');
  v_hash text;
  v_existing_hash text;
  v_response jsonb;
  v_inserted integer;
  v_previous text := current_setting('patina.configuration_spec_workflow', true);
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
  -- 00752 (D10): the signed allowance this fill resolves, if any.
  v_snapshot public.furnishing_authorization_items%ROWTYPE;
  v_allowance_fill boolean := false;
  v_filled public.project_ffe_items%ROWTYPE;
  v_filled_cents bigint;
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

  -- 00808 (SQ-1121): the job label lock comes before any row lock.
  PERFORM public._ffe_lock_job_labels(NULLIF(p_request->>'projectId', '')::uuid);

  -- 00873: keep 00442's configuration guard ahead of receipt replay as well
  -- as execution. Its existing bridge remains unchanged for nested callers.
  IF NULLIF(p_request->>'configurationId', '') IS NOT NULL THEN
    PERFORM set_config('patina.configuration_spec_workflow', '00403', true);
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
    PERFORM set_config('patina.configuration_spec_workflow', COALESCE(v_previous, ''), true);
    RETURN v_response;
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
    -- 00752 (D10, Q12): an allowance bound to a signed authorization may be
    -- filled. The frozen row is the line's own provenance (set at execution,
    -- immutable after), on an executed document whose proposal is executed.
    -- The request must keep the line an allowance; a PO or a live draft/sent
    -- authorization still refuses below.
    IF v_placeholder_id IS NOT NULL
       AND v_existing.item_type = 'allowance' AND v_item_type = 'allowance'
       AND v_existing.purchase_order_id IS NULL
       AND v_existing.source_authorization_item_id IS NOT NULL
    THEN
      SELECT line.* INTO v_snapshot
      FROM public.furnishing_authorization_items line
      JOIN public.project_commercial_documents document ON document.id = line.commercial_document_id
      JOIN public.proposals proposal ON proposal.id = document.proposal_id
      WHERE line.id = v_existing.source_authorization_item_id
        AND document.id = v_existing.source_commercial_document_id
        AND document.executed_at IS NOT NULL
        AND proposal.commercial_state = 'executed'
        AND line.item_type = 'allowance';
      v_allowance_fill := v_snapshot.id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM public.furnishing_authorization_items line
        JOIN public.project_commercial_documents document ON document.id = line.commercial_document_id
        JOIN public.proposals proposal ON proposal.id = document.proposal_id
        WHERE line.source_ffe_item_id = v_existing.id
          AND proposal.commercial_state IN ('draft', 'sent')
      );
    END IF;
    IF v_placeholder_id IS NOT NULL AND NOT v_allowance_fill AND (
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

  -- 00752 (D10, Q12): the fill is measured against the signed ceiling. Over
  -- it, the whole fill rolls back. A replay (the line already held a product
  -- before this call) records nothing.
  IF v_allowance_fill AND v_result->>'outcome' = 'filled' AND v_existing.product_id IS NULL THEN
    SELECT * INTO v_filled FROM public.project_ffe_items
    WHERE id = (v_result->>'selectionId')::uuid;
    v_filled_cents := v_filled.quantity::bigint * COALESCE(v_filled.unit_price_cents, 0)::bigint;
    IF v_filled_cents > v_snapshot.client_line_total_cents THEN
      RAISE EXCEPTION 'Over the allowance. This goes through Record a change.'
        USING ERRCODE = 'check_violation';
    END IF;
    INSERT INTO public.project_ffe_allowance_fills (
      ffe_item_id, authorization_item_id, ceiling_cents, filled_cents, variance_cents, filled_by
    ) VALUES (
      v_filled.id, v_snapshot.id, v_snapshot.client_line_total_cents,
      v_filled_cents::integer,
      (v_snapshot.client_line_total_cents - v_filled_cents)::integer,
      auth.uid()
    );
  END IF;

  IF v_result->>'outcome' IN ('created', 'filled') THEN
    PERFORM set_config('app.ffe_mutation_rpc', 'on', true);
    -- 00752: a signed allowance keeps the budget the client signed.
    UPDATE public.project_ffe_items
    SET item_type = v_item_type,
        budget_min_cents = CASE WHEN v_allowance_fill THEN budget_min_cents
          WHEN v_item_type = 'allowance'
          THEN COALESCE(NULLIF(p_request->>'budgetMinCents', '')::integer, 0)
          ELSE budget_min_cents END,
        budget_max_cents = CASE WHEN v_allowance_fill THEN budget_max_cents
          WHEN v_item_type = 'allowance'
          THEN (p_request->>'budgetMaxCents')::integer
          ELSE budget_max_cents END,
        updated_at = now()
    WHERE id = (v_result->>'selectionId')::uuid;
  ELSE
    SELECT * INTO v_existing FROM public.project_ffe_items
    WHERE id = (v_result->>'selectionId')::uuid;
  END IF;
  v_result := (v_result - 'roleIdentity') || jsonb_build_object(
    'itemType', CASE WHEN v_result->>'outcome' = 'reused' THEN v_existing.item_type ELSE v_item_type END,
    'roleConfigurationIdentity', v_role
  );
  UPDATE public.project_ffe_command_idempotency SET response = v_result
  WHERE actor_id = v_actor AND idempotency_key = v_key;
  PERFORM set_config('patina.configuration_spec_workflow', COALESCE(v_previous, ''), true);
  RETURN v_result;
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('patina.configuration_spec_workflow', COALESCE(v_previous, ''), true);
  RAISE;
END;
$$;

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
  v_response jsonb;
  v_product public.products%ROWTYPE;
  v_item public.project_ffe_items%ROWTYPE;
  v_board public.proposal_boards%ROWTYPE;
  v_vendor_name text;
  v_placement_id uuid;
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

  IF v_duplicate = 'hold' THEN
    v_response := jsonb_build_object('outcome', 'held', 'projectId', v_project_id);
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
  RETURN v_response;
END;
$$;

REVOKE ALL ON FUNCTION public._place_product_in_project_v2_00438_impl(jsonb)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.place_product_in_project_v2(jsonb)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.place_product_in_project_v2(jsonb) TO authenticated;
