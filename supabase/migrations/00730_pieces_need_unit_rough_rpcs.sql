-- ═══════════════════════════════════════════════════════════════════════════
-- 00730 — Need label, unit, Rough $, paste batch, build fields
--         (US-21 slice 1, W2; T-10, SQ-616)
-- ═══════════════════════════════════════════════════════════════════════════
-- CONTRACT §2 row 00730 (artifacts/pieces-building-room-2026-10-08/build/
-- CONTRACT.md). D2, D3, D12, D13. Writes the columns 00729 added.
--
-- ── 1. _place_product_in_project_v2_00438_impl (rewritten) ──────────────────
-- CREATE OR REPLACE base: 00678_board_deck_import_hardening.sql:1263 (the
-- latest definer; full copy plus the change). Reached through
-- place_product_in_project_v2 (00447:190) → _00444_impl → _00441_wrapper.
-- Neither the public entry nor create_named_project_need (00435:332) changes:
-- both pass the jsonb request through.
--   New request keys, validated before any write:
--     unit        each | sq_ft | lin_ft | roll | yard | box | hour | lot
--     roughCents  whole cents ≥ 0, or null (D12: never budget_max_cents)
--     needLabel   text; blank falls back to the line name
--     lineKind    'goods' only; labor goes through add_labor_line (00732)
--   An unknown value is refused with check_violation, naming the CHECK.
--   On create: writes unit, rough_cents and line_kind = 'goods', and sets the
--     new thread's need_label from needLabel, else the line name (only while
--     the thread has none, so an existing thread keeps its label).
--   On fill (00678:1378): the line name still takes the product name, and
--     need_label on the thread is never touched (D2).
--   Privileges are unchanged: CREATE OR REPLACE keeps the impl's ACL
--   (revoked from authenticated since 00438).
--
-- ── 2. batch_create_named_project_needs(p_request jsonb) (new) ──────────────
-- D13, the paste batch. {projectId, roomId|null, assignmentScope,
-- lines:[{name, quantity?, unit?, roughCents?}], idempotencyKey}. 1–100
-- lines, all or nothing (one statement). Each line goes through
-- create_named_project_need, so through the 00438 impl above, with the key
-- '<idempotencyKey>:<n>' (precedent batch_place_library_products_in_project,
-- 00435:336). A replay with the same key returns the same ids. Returns
-- {selectionIds:[…]} in line order. Unknown keys are refused, so no
-- allowance key rides in.
--
-- ── 3. set_project_ffe_line_build_fields(p_item_id, p_request) (new) ────────
-- D2, D3, D12. Keys: name, needLabel, quantity (int > 0), unit, roughCents
-- (int ≥ 0 or null). Refuses a removed line. Once the line is on a PO or
-- ffe_line_authorization_state(id) is not null, a change to quantity or unit
-- is refused with "This line is released. Quantity and unit change through
-- Record a change."; name, needLabel and roughCents stay editable. A
-- quantity change keeps line_total_cents = quantity × unit_price_cents (the
-- unit price is never written here). needLabel writes the thread only.
--
-- Adds GRANT/REVOKE → regenerate supabase/seed/00-legacy-grants.sql.
-- Test: supabase/tests/ffe/pieces_need_unit_rough_test.sql.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 1. The placement impl: unit, Rough $, need label ───────────────────────

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
      line_total_cents = quantity * COALESCE(v_product.price_retail, v_product.price_trade, 0),
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

-- ─── 2. The paste batch (D13) ────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.batch_create_named_project_needs(p_request jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_project_id uuid;
  v_key text;
  v_line jsonb;
  v_i integer := 0;
  v_result jsonb;
  v_ids jsonb := '[]'::jsonb;
BEGIN
  IF p_request IS NULL OR jsonb_typeof(p_request) <> 'object' THEN
    RAISE EXCEPTION 'batch_create_named_project_needs: request must be a JSON object'
      USING ERRCODE = 'check_violation';
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_object_keys(p_request) AS k
    WHERE k NOT IN ('projectId', 'roomId', 'assignmentScope', 'lines', 'idempotencyKey')
  ) THEN
    RAISE EXCEPTION 'batch_create_named_project_needs: only projectId, roomId, assignmentScope, lines and idempotencyKey can be sent'
      USING ERRCODE = 'check_violation';
  END IF;
  v_project_id := NULLIF(p_request->>'projectId', '')::uuid;
  IF v_project_id IS NULL THEN
    RAISE EXCEPTION 'placement request must name a project' USING ERRCODE = 'check_violation';
  END IF;
  PERFORM public._ffe_require_studio_project(v_project_id);
  v_key := NULLIF(btrim(p_request->>'idempotencyKey'), '');
  IF v_key IS NULL THEN
    RAISE EXCEPTION 'idempotencyKey is required' USING ERRCODE = 'check_violation';
  END IF;
  IF jsonb_typeof(p_request->'lines') IS DISTINCT FROM 'array'
     OR jsonb_array_length(p_request->'lines') NOT BETWEEN 1 AND 100 THEN
    RAISE EXCEPTION 'lines must be an array of 1 to 100 entries' USING ERRCODE = 'check_violation';
  END IF;

  FOR v_line IN SELECT value FROM jsonb_array_elements(p_request->'lines') WITH ORDINALITY ORDER BY ordinality LOOP
    v_i := v_i + 1;
    IF jsonb_typeof(v_line) <> 'object' OR EXISTS (
      SELECT 1 FROM jsonb_object_keys(v_line) AS k
      WHERE k NOT IN ('name', 'quantity', 'unit', 'roughCents')
    ) THEN
      RAISE EXCEPTION 'line % takes only name, quantity, unit and roughCents', v_i
        USING ERRCODE = 'check_violation';
    END IF;
    v_result := public.create_named_project_need(jsonb_strip_nulls(jsonb_build_object(
      'projectId', v_project_id,
      'roomId', p_request->'roomId',
      'assignmentScope', p_request->'assignmentScope',
      'name', v_line->'name',
      'quantity', v_line->'quantity',
      'unit', v_line->'unit',
      'roughCents', v_line->'roughCents',
      'idempotencyKey', v_key || ':' || v_i::text
    )));
    v_ids := v_ids || jsonb_build_array(v_result->'selectionId');
  END LOOP;

  RETURN jsonb_build_object('selectionIds', v_ids);
END;
$$;

REVOKE ALL ON FUNCTION public.batch_create_named_project_needs(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.batch_create_named_project_needs(jsonb) TO authenticated;

-- ─── 3. Build fields: name, need label, quantity, unit, Rough $ ─────────────

CREATE OR REPLACE FUNCTION public.set_project_ffe_line_build_fields(
  p_item_id uuid, p_request jsonb
)
RETURNS public.project_ffe_items
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_item public.project_ffe_items%ROWTYPE;
  v_name text;
  v_need_label text;
  v_quantity integer;
  v_unit text;
  v_rough integer;
  v_changes_count boolean;
BEGIN
  IF p_request IS NULL OR jsonb_typeof(p_request) <> 'object' THEN
    RAISE EXCEPTION 'set_project_ffe_line_build_fields: request must be a JSON object'
      USING ERRCODE = 'check_violation';
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_object_keys(p_request) AS k
    WHERE k NOT IN ('name', 'needLabel', 'quantity', 'unit', 'roughCents')
  ) THEN
    RAISE EXCEPTION 'set_project_ffe_line_build_fields: only name, needLabel, quantity, unit and roughCents can be set here'
      USING ERRCODE = 'check_violation';
  END IF;
  IF p_request = '{}'::jsonb THEN
    RAISE EXCEPTION 'set_project_ffe_line_build_fields: nothing to set'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO v_item FROM public.project_ffe_items WHERE id = p_item_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'project not found or access denied'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  PERFORM public._ffe_require_studio_project(v_item.project_id);
  IF v_item.removed_at IS NOT NULL THEN
    RAISE EXCEPTION 'set_project_ffe_line_build_fields: line was removed'
      USING ERRCODE = 'check_violation';
  END IF;

  v_name := v_item.name;
  IF p_request ? 'name' THEN
    v_name := CASE WHEN jsonb_typeof(p_request->'name') = 'string'
      THEN NULLIF(btrim(p_request->>'name'), '') END;
    IF v_name IS NULL THEN
      RAISE EXCEPTION 'name cannot be blank' USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  IF p_request ? 'needLabel' THEN
    v_need_label := CASE WHEN jsonb_typeof(p_request->'needLabel') = 'string'
      THEN NULLIF(btrim(p_request->>'needLabel'), '') END;
    IF v_need_label IS NULL THEN
      RAISE EXCEPTION 'needLabel cannot be blank' USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  v_quantity := v_item.quantity;
  IF p_request ? 'quantity' THEN
    IF jsonb_typeof(p_request->'quantity') <> 'number'
       OR (p_request->>'quantity') !~ '^[1-9][0-9]{0,9}$'
       OR (p_request->>'quantity')::bigint > 2147483647 THEN
      RAISE EXCEPTION 'quantity must be a positive whole number'
        USING ERRCODE = 'check_violation';
    END IF;
    v_quantity := (p_request->>'quantity')::integer;
  END IF;

  v_unit := v_item.unit;
  IF p_request ? 'unit' THEN
    v_unit := CASE WHEN jsonb_typeof(p_request->'unit') = 'string' THEN p_request->>'unit' END;
    IF v_unit IS NULL
       OR v_unit NOT IN ('each', 'sq_ft', 'lin_ft', 'roll', 'yard', 'box', 'hour', 'lot') THEN
      RAISE EXCEPTION 'unit must be one of each, sq_ft, lin_ft, roll, yard, box, hour, lot'
        USING ERRCODE = 'check_violation', CONSTRAINT = 'project_ffe_items_unit_check';
    END IF;
  END IF;

  v_rough := v_item.rough_cents;
  IF p_request ? 'roughCents' THEN
    IF jsonb_typeof(p_request->'roughCents') = 'null' THEN
      v_rough := NULL;
    ELSIF jsonb_typeof(p_request->'roughCents') <> 'number'
       OR (p_request->>'roughCents') !~ '^(0|[1-9][0-9]{0,9})$'
       OR (p_request->>'roughCents')::bigint > 2147483647 THEN
      RAISE EXCEPTION 'roughCents must be a whole number of cents, 0 or more'
        USING ERRCODE = 'check_violation', CONSTRAINT = 'project_ffe_items_rough_cents_check';
    ELSE
      v_rough := (p_request->>'roughCents')::integer;
    END IF;
  END IF;

  -- A released line keeps its count: on a PO, or on a sent, signed or
  -- executed authorization (00705:79).
  v_changes_count := v_quantity IS DISTINCT FROM v_item.quantity
    OR v_unit IS DISTINCT FROM v_item.unit;
  IF v_changes_count AND (
    v_item.purchase_order_id IS NOT NULL
    OR public.ffe_line_authorization_state(v_item.id) IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'This line is released. Quantity and unit change through Record a change.'
      USING ERRCODE = 'check_violation';
  END IF;

  IF p_request ?| ARRAY['name', 'quantity', 'unit', 'roughCents'] THEN
    PERFORM set_config('app.ffe_mutation_rpc', 'on', true);
    UPDATE public.project_ffe_items SET
      name = v_name,
      quantity = v_quantity,
      unit = v_unit,
      rough_cents = v_rough,
      line_total_cents = CASE
        WHEN v_quantity IS DISTINCT FROM v_item.quantity AND unit_price_cents IS NOT NULL
          THEN v_quantity * unit_price_cents
        ELSE line_total_cents END,
      updated_at = now()
    WHERE id = p_item_id
    RETURNING * INTO v_item;
  END IF;

  IF v_need_label IS NOT NULL THEN
    UPDATE public.project_ffe_selection_threads
    SET need_label = v_need_label
    WHERE id = v_item.selection_thread_id;
  END IF;

  RETURN v_item;
END;
$$;

REVOKE ALL ON FUNCTION public.set_project_ffe_line_build_fields(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_project_ffe_line_build_fields(uuid, jsonb) TO authenticated;
