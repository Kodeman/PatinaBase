-- ═══════════════════════════════════════════════════════════════════════════
-- 00737 — W2 review fixes: labor has a client price, remove and restore
--         carry a piece's children, fill / quantity / placement guards
--         (US-21 T-21a, SQ-676; findings from the T-21 review, SQ-627)
-- ═══════════════════════════════════════════════════════════════════════════
-- CONTRACT §2 (artifacts/pieces-building-room-2026-10-08/build/CONTRACT.md).
-- Every rewritten body is a full copy of its W2 base plus the change named
-- below; each keeps _ffe_require_studio_project, app.ffe_mutation_rpc, its
-- grants and its pinned search_path.
--
-- ── WHAT THIS CHANGES ───────────────────────────────────────────────────────
-- 1. F4 _place_product_in_project_v2_00438_impl
--      CREATE OR REPLACE base: 00730_pieces_need_unit_rough_rpcs.sql:53.
--      The fill path refuses a labor placeholder ("Labor isn't filled with a
--      product.") and a removed one ("This line was removed."). Grants are
--      unchanged (postgres-only; CREATE OR REPLACE keeps the ACL).
-- 2. F1 + F5 set_project_ffe_line_build_fields
--      CREATE OR REPLACE base: 00730_pieces_need_unit_rough_rpcs.sql:381.
--      A priced labor line keeps line_total_cents = quantity × unit price.
--      A quantity below the sum of the line's room placements (00734) is
--      refused: "Quantity is below the rooms' total (N)."
-- 3. F2 archive_project_selection / restore_project_selection
--      CREATE OR REPLACE base: 00731_pieces_remove_restore.sql:49 and :91.
--      Removing a piece removes its active children (labor, COM, accessory)
--      with the same removed_at, reason and disposition handling; it refuses,
--      as for the piece, when an active child is released or on a PO.
--      Restoring a piece restores the children removed with it (same
--      removed_at). Restoring a child whose piece is removed refuses with
--      "Restore its piece first."
-- 4. F1 + F6 add_labor_line
--      CREATE base: 00732_pieces_labor_gate.sql:153.
--      SIGNATURE CHANGE: DROP FUNCTION IF EXISTS add_labor_line(uuid, jsonb),
--      then CREATE add_labor_line(uuid, jsonb, p_unit_price_cents integer
--      DEFAULT NULL); grants re-issued. A two-argument call still resolves
--      through the default. Above 0, the price sets unit_price_cents and
--      line_total_cents = quantity × price. A parent whose design_disposition
--      is alternate or not_selected is refused.
-- 5. F1 set_labor_line_price(p_ffe_item_id uuid, p_unit_price_cents integer)
--      New. Orchestrator ruling under Q5: labor is billed on its own line, so
--      it carries its own client price. Refuses a non-labor line ("Only a
--      labor line takes a price here."), a removed line ("This line was
--      removed."), and a released one ("Released labor changes through Record
--      a change.": ffe_line_authorization_state, the check behind
--      ffe_line_authorization (00736), or a PO, as set_project_ffe_line_build_
--      fields treats a line as released).
-- 6. F13 set_line_placements
--      CREATE OR REPLACE base: 00734_pieces_room_placements.sql:133.
--      Refuses a removed line, and a labor line in any room where its piece
--      is neither assigned nor placed ("Labor goes where its piece goes.").
-- 7. F11 project_ffe_placement_events is append-only: REVOKE UPDATE, DELETE,
--      TRUNCATE from service_role, authenticated and anon (00734:127-129 left
--      service_role its default privileges).
-- 8. F8 _spec_book_current_item_snapshots
--      CREATE OR REPLACE base: 00735_pieces_spec_book_snapshot.sql:47.
--      needLabel is emitted only for the thread's primary line (the primary
--      rule of the 00729:145-149 backfill, thread.primary_ffe_item_id), NULL
--      for every other line, so an alternate in a backfilled thread keeps its
--      00714 content_hash.
--
-- Adds GRANT/REVOKE → regenerate supabase/seed/00-legacy-grants.sql.
-- Idempotent: CREATE OR REPLACE, DROP FUNCTION IF EXISTS, REVOKE/GRANT.
-- Tests: supabase/tests/ffe/pieces_w2_review_fixes_test.sql;
--        supabase/tests/commercial/pieces_release_labor_test.sql;
--        supabase/tests/spec_books/pieces_snapshot_hash_test.sql.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 1. F4: _place_product_in_project_v2_00438_impl (base 00730:53) ─────────

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

-- ─── 2. F1 + F5: set_project_ffe_line_build_fields (base 00730:381) ─────────

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
  v_placed bigint;
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

  -- 00737 (F5): the line never holds less than its rooms add up to (00734).
  IF v_quantity IS DISTINCT FROM v_item.quantity THEN
    SELECT COALESCE(sum(placement.quantity), 0) INTO v_placed
    FROM public.project_ffe_placements placement
    WHERE placement.ffe_item_id = v_item.id;
    IF v_quantity < v_placed THEN
      RAISE EXCEPTION 'Quantity is below the rooms'' total (%).', v_placed
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  IF p_request ?| ARRAY['name', 'quantity', 'unit', 'roughCents'] THEN
    PERFORM set_config('app.ffe_mutation_rpc', 'on', true);
    UPDATE public.project_ffe_items SET
      name = v_name,
      quantity = v_quantity,
      unit = v_unit,
      rough_cents = v_rough,
      line_total_cents = CASE
        -- 00737 (F1): a priced labor line always totals quantity × its price.
        WHEN line_kind = 'labor' AND unit_price_cents > 0
          THEN v_quantity * unit_price_cents
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

-- ─── 3. F2: archive_project_selection, restore_project_selection (base 00731:49)

CREATE OR REPLACE FUNCTION public.archive_project_selection(p_ffe_item_id uuid, p_reason text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $$
DECLARE v_item public.project_ffe_items%ROWTYPE; v_reason text := NULLIF(btrim(COALESCE(p_reason,'')),'');
  v_removed_at timestamptz;
BEGIN
  SELECT * INTO v_item FROM public.project_ffe_items WHERE id=p_ffe_item_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'selection not found' USING ERRCODE='no_data_found'; END IF;
  PERFORM public._ffe_require_studio_project(v_item.project_id);
  IF v_item.removed_at IS NOT NULL THEN
    RETURN jsonb_build_object('selectionId',v_item.id,'archived',true);
  END IF;
  IF v_item.trade_scope_document_id IS NOT NULL THEN
    RAISE EXCEPTION 'Trade Scope lines change in their scope.' USING ERRCODE='check_violation';
  END IF;
  IF EXISTS(
    SELECT 1 FROM public.furnishing_authorization_items line
    JOIN public.project_commercial_documents document ON document.id=line.commercial_document_id
    JOIN public.proposals proposal ON proposal.id=document.proposal_id
    WHERE line.source_ffe_item_id=v_item.id AND proposal.commercial_state IN ('draft','sent','executed')
  ) OR v_item.purchase_order_id IS NOT NULL THEN
    RAISE EXCEPTION 'Released lines change through Record a change.'
      USING ERRCODE='check_violation';
  END IF;
  -- 00737 (F2): the piece's active children (labor, COM, accessory) go with
  -- it, so none may be released or ordered on its own.
  IF EXISTS(
    SELECT 1 FROM public.project_ffe_items child
    WHERE child.parent_ffe_item_id=v_item.id AND child.removed_at IS NULL
      AND (child.purchase_order_id IS NOT NULL OR EXISTS(
        SELECT 1 FROM public.furnishing_authorization_items line
        JOIN public.project_commercial_documents document ON document.id=line.commercial_document_id
        JOIN public.proposals proposal ON proposal.id=document.proposal_id
        WHERE line.source_ffe_item_id=child.id AND proposal.commercial_state IN ('draft','sent','executed')))
  ) THEN
    RAISE EXCEPTION 'Released lines change through Record a change.'
      USING ERRCODE='check_violation';
  END IF;
  IF EXISTS(
    SELECT 1 FROM public.project_review_items review_item
    JOIN public.project_review_editions edition ON edition.id=review_item.edition_id
    WHERE review_item.source_ffe_item_id=v_item.id AND edition.status<>'draft'
  ) THEN
    IF char_length(COALESCE(v_reason,''))<5 THEN
      RAISE EXCEPTION 'archive reason must be at least 5 characters' USING ERRCODE='check_violation';
    END IF;
  END IF;
  PERFORM set_config('app.ffe_mutation_rpc','on',true);
  UPDATE public.project_ffe_items SET removed_at=now(),removed_by=auth.uid(),
    removal_reason=COALESCE(v_reason,'removed while building'),
    removed_disposition=design_disposition,
    design_disposition='not_selected',updated_at=now() WHERE id=v_item.id
  RETURNING removed_at INTO v_removed_at;
  -- 00737 (F2): the children are removed with the piece, at the same moment,
  -- so restoring the piece brings back exactly these.
  UPDATE public.project_ffe_items SET removed_at=v_removed_at,removed_by=auth.uid(),
    removal_reason=COALESCE(v_reason,'removed while building'),
    removed_disposition=design_disposition,
    design_disposition='not_selected',updated_at=now()
  WHERE parent_ffe_item_id=v_item.id AND removed_at IS NULL;
  RETURN jsonb_build_object('selectionId',v_item.id,'archived',true);
END;
$$;

CREATE OR REPLACE FUNCTION public.restore_project_selection(p_ffe_item_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $$
DECLARE v_item public.project_ffe_items%ROWTYPE; v_primary uuid;
BEGIN
  SELECT * INTO v_item FROM public.project_ffe_items WHERE id=p_ffe_item_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'selection not found' USING ERRCODE='no_data_found'; END IF;
  PERFORM public._ffe_require_studio_project(v_item.project_id);
  IF v_item.removed_at IS NULL THEN
    RAISE EXCEPTION 'This line is not removed.' USING ERRCODE='check_violation';
  END IF;
  -- 00737 (F2): a child comes back only under an active piece.
  IF v_item.parent_ffe_item_id IS NOT NULL AND EXISTS(
    SELECT 1 FROM public.project_ffe_items parent
    WHERE parent.id=v_item.parent_ffe_item_id AND parent.removed_at IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'Restore its piece first.' USING ERRCODE='check_violation';
  END IF;
  SELECT primary_ffe_item_id INTO v_primary FROM public.project_ffe_selection_threads
  WHERE id=v_item.selection_thread_id FOR UPDATE;
  IF v_primary IS NOT NULL AND v_primary<>v_item.id AND EXISTS(
    SELECT 1 FROM public.project_ffe_items other
    WHERE other.id=v_primary AND other.removed_at IS NULL
      AND other.design_disposition NOT IN ('superseded','not_selected')
  ) THEN
    RAISE EXCEPTION 'Another line now fills this need, so this one cannot be restored.'
      USING ERRCODE='check_violation';
  END IF;
  PERFORM set_config('app.ffe_mutation_rpc','on',true);
  UPDATE public.project_ffe_items SET removed_at=NULL,removed_by=NULL,removal_reason=NULL,
    design_disposition=COALESCE(removed_disposition,'candidate'),removed_disposition=NULL,
    updated_at=now() WHERE id=v_item.id;
  -- 00737 (F2): the children removed with the piece (same removed_at) return
  -- with it; a child removed on its own earlier stays removed.
  UPDATE public.project_ffe_items SET removed_at=NULL,removed_by=NULL,removal_reason=NULL,
    design_disposition=COALESCE(removed_disposition,'candidate'),removed_disposition=NULL,
    updated_at=now()
  WHERE parent_ffe_item_id=v_item.id AND removed_at=v_item.removed_at;
  RETURN jsonb_build_object('selectionId',v_item.id,'restored',true);
END;
$$;

REVOKE ALL ON FUNCTION public.archive_project_selection(uuid,text) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.restore_project_selection(uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.archive_project_selection(uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.restore_project_selection(uuid) TO authenticated;

-- ─── 4. F1 + F6: add_labor_line (base 00732:153), signature change ──────────

DROP FUNCTION IF EXISTS public.add_labor_line(uuid, jsonb);

CREATE OR REPLACE FUNCTION public.add_labor_line(
  p_parent_ffe_item_id uuid,
  p_request jsonb,
  p_unit_price_cents integer DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $$
DECLARE
  v_keys constant text[] := ARRAY['name', 'quantity', 'unit', 'roughCents', 'vendorId'];
  v_parent public.project_ffe_items%ROWTYPE;
  v_item public.project_ffe_items%ROWTYPE;
  v_name text;
  v_quantity integer := 1;
  v_unit text := 'each';
  v_rough integer;
  v_vendor_id uuid;
  v_vendor_name text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'authentication required' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO v_parent FROM public.project_ffe_items
   WHERE id = p_parent_ffe_item_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'project not found or access denied'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  PERFORM public._ffe_require_studio_project(v_parent.project_id);

  -- ── The request ──
  IF p_request IS NULL OR jsonb_typeof(p_request) <> 'object' OR (p_request - v_keys) <> '{}'::jsonb THEN
    RAISE EXCEPTION 'add_labor_line: the request is an object with keys %', array_to_string(v_keys, ', ')
      USING ERRCODE = 'check_violation';
  END IF;

  v_name := CASE WHEN jsonb_typeof(p_request->'name') = 'string'
                 THEN NULLIF(btrim(p_request->>'name'), '') END;
  IF v_name IS NULL THEN
    RAISE EXCEPTION 'add_labor_line: a labor line needs a name'
      USING ERRCODE = 'check_violation';
  END IF;

  IF jsonb_typeof(COALESCE(p_request->'quantity', 'null'::jsonb)) <> 'null' THEN
    IF jsonb_typeof(p_request->'quantity') <> 'number'
       OR (p_request->>'quantity')::numeric <> trunc((p_request->>'quantity')::numeric)
       OR (p_request->>'quantity')::numeric <= 0
       OR (p_request->>'quantity')::numeric > 2147483647 THEN
      RAISE EXCEPTION 'add_labor_line: quantity is a whole number above 0'
        USING ERRCODE = 'check_violation';
    END IF;
    v_quantity := (p_request->>'quantity')::numeric::integer;
  END IF;

  -- The value list is project_ffe_items_unit_check (00729); it names itself.
  IF jsonb_typeof(COALESCE(p_request->'unit', 'null'::jsonb)) <> 'null' THEN
    IF jsonb_typeof(p_request->'unit') <> 'string' THEN
      RAISE EXCEPTION 'add_labor_line: unit is a string'
        USING ERRCODE = 'check_violation';
    END IF;
    v_unit := p_request->>'unit';
  END IF;

  IF jsonb_typeof(COALESCE(p_request->'roughCents', 'null'::jsonb)) <> 'null' THEN
    IF jsonb_typeof(p_request->'roughCents') <> 'number'
       OR (p_request->>'roughCents')::numeric <> trunc((p_request->>'roughCents')::numeric)
       OR (p_request->>'roughCents')::numeric < 0
       OR (p_request->>'roughCents')::numeric > 2147483647 THEN
      RAISE EXCEPTION 'add_labor_line: roughCents is whole cents, 0 or more'
        USING ERRCODE = 'check_violation';
    END IF;
    v_rough := (p_request->>'roughCents')::numeric::integer;
  END IF;

  IF jsonb_typeof(COALESCE(p_request->'vendorId', 'null'::jsonb)) <> 'null' THEN
    BEGIN
      v_vendor_id := CASE WHEN jsonb_typeof(p_request->'vendorId') = 'string'
                          THEN (p_request->>'vendorId')::uuid END;
    EXCEPTION WHEN invalid_text_representation THEN
      v_vendor_id := NULL;
    END;
    SELECT name INTO v_vendor_name FROM public.vendors WHERE id = v_vendor_id;
    IF v_vendor_id IS NULL OR NOT FOUND THEN
      RAISE EXCEPTION 'add_labor_line: vendor not found'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  -- 00737 (F1): the client price, whole cents. Above 0 it prices the line.
  IF p_unit_price_cents < 0 THEN
    RAISE EXCEPTION 'add_labor_line: the price is whole cents, 0 or more'
      USING ERRCODE = 'check_violation';
  END IF;

  -- ── The piece ──
  IF v_parent.line_kind = 'labor' THEN
    RAISE EXCEPTION 'add_labor_line: labor attaches to a piece, not to another labor line'
      USING ERRCODE = 'check_violation';
  END IF;
  IF v_parent.parent_ffe_item_id IS NOT NULL THEN
    RAISE EXCEPTION 'add_labor_line: labor attaches to a piece, not to a line that supplies one'
      USING ERRCODE = 'check_violation';
  END IF;
  IF v_parent.removed_at IS NOT NULL THEN
    RAISE EXCEPTION 'add_labor_line: the piece was removed'
      USING ERRCODE = 'check_violation';
  END IF;
  -- 00737 (F6): labor goes on a piece in the design, not on an alternate or a
  -- passed-over line.
  IF v_parent.design_disposition IN ('alternate', 'not_selected') THEN
    RAISE EXCEPTION 'add_labor_line: labor attaches to a chosen piece, not an alternate or a passed-over line'
      USING ERRCODE = 'check_violation';
  END IF;
  IF v_parent.trade_scope_document_id IS NOT NULL THEN
    RAISE EXCEPTION 'add_labor_line: this line is a Trade Scope; its work is billed by the scope, not as labor'
      USING ERRCODE = 'check_violation';
  END IF;
  IF v_parent.purchase_order_id IS NOT NULL THEN
    RAISE EXCEPTION 'add_labor_line: the piece is on an order. Labor changes through Record a change.'
      USING ERRCODE = 'check_violation';
  END IF;
  IF public.ffe_line_authorization_state(v_parent.id) IS NOT NULL THEN
    RAISE EXCEPTION 'add_labor_line: the piece is released. Labor changes through Record a change.'
      USING ERRCODE = 'check_violation';
  END IF;

  PERFORM set_config('app.ffe_mutation_rpc', 'on', true);
  INSERT INTO public.project_ffe_items (
    project_id, project_room_id, assignment_scope, name, quantity, unit,
    rough_cents, vendor_id, vendor_name, line_kind, link_kind,
    parent_ffe_item_id, design_disposition, added_via, sort_order,
    unit_price_cents, line_total_cents
  ) VALUES (
    v_parent.project_id, v_parent.project_room_id, v_parent.assignment_scope,
    v_name, v_quantity, v_unit, v_rough, v_vendor_id, v_vendor_name,
    'labor', 'labor', v_parent.id, 'candidate', 'labor',
    COALESCE((SELECT max(sort_order) + 1 FROM public.project_ffe_items
               WHERE project_id = v_parent.project_id), 0),
    CASE WHEN p_unit_price_cents > 0 THEN p_unit_price_cents ELSE 0 END,
    CASE WHEN p_unit_price_cents > 0 THEN v_quantity * p_unit_price_cents ELSE 0 END
  ) RETURNING * INTO v_item;

  -- Every line has its spec row (precedent 00678:1437).
  INSERT INTO public.project_ffe_specs (ffe_item_id, updated_by)
  VALUES (v_item.id, auth.uid())
  ON CONFLICT (ffe_item_id) DO NOTHING;

  -- D2: a created line's thread is named for it (00729 backfill, 00730).
  UPDATE public.project_ffe_selection_threads
     SET need_label = v_name
   WHERE id = v_item.selection_thread_id
     AND need_label IS NULL;

  RETURN jsonb_build_object('selectionId', v_item.id, 'parentFfeItemId', v_parent.id);
END;
$$;

COMMENT ON FUNCTION public.add_labor_line(uuid, jsonb, integer) IS
  'Adds a labor line under its piece (00732, D5, Q5; 00737): line_kind and link_kind labor, the piece''s room '
  'and scope, disposition candidate. p_unit_price_cents above 0 sets the client price and the line total. '
  'Refuses a piece that is labor, a child, removed, an alternate or not selected, a Trade Scope '
  'presence line, on a PO, or released. Labor bills on its own line, never on the maker''s PO. '
  'Gate: _ffe_require_studio_project.';

REVOKE ALL ON FUNCTION public.add_labor_line(uuid, jsonb, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.add_labor_line(uuid, jsonb, integer) TO authenticated;

-- ─── 5. F1: set_labor_line_price (new) ──────────────────────────────────────

CREATE OR REPLACE FUNCTION public.set_labor_line_price(
  p_ffe_item_id uuid,
  p_unit_price_cents integer
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $$
DECLARE
  v_item public.project_ffe_items%ROWTYPE;
BEGIN
  SELECT * INTO v_item FROM public.project_ffe_items
   WHERE id = p_ffe_item_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'project not found or access denied'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  PERFORM public._ffe_require_studio_project(v_item.project_id);

  IF p_unit_price_cents IS NULL OR p_unit_price_cents < 0 THEN
    RAISE EXCEPTION 'set_labor_line_price: the price is whole cents, 0 or more'
      USING ERRCODE = 'check_violation';
  END IF;
  IF v_item.line_kind IS DISTINCT FROM 'labor' THEN
    RAISE EXCEPTION 'Only a labor line takes a price here.'
      USING ERRCODE = 'check_violation';
  END IF;
  IF v_item.removed_at IS NOT NULL THEN
    RAISE EXCEPTION 'This line was removed.'
      USING ERRCODE = 'check_violation';
  END IF;
  -- Released: on a sent, signed or executed authorization (the
  -- ffe_line_authorization check, 00736 → 00705:79), or on a PO.
  IF v_item.purchase_order_id IS NOT NULL
     OR public.ffe_line_authorization_state(v_item.id) IS NOT NULL THEN
    RAISE EXCEPTION 'Released labor changes through Record a change.'
      USING ERRCODE = 'check_violation';
  END IF;

  PERFORM set_config('app.ffe_mutation_rpc', 'on', true);
  UPDATE public.project_ffe_items
     SET unit_price_cents = p_unit_price_cents,
         line_total_cents = quantity * p_unit_price_cents,
         updated_at = now()
   WHERE id = v_item.id
  RETURNING * INTO v_item;

  RETURN jsonb_build_object(
    'selectionId', v_item.id,
    'unitPriceCents', v_item.unit_price_cents,
    'lineTotalCents', v_item.line_total_cents
  );
END;
$$;

COMMENT ON FUNCTION public.set_labor_line_price(uuid, integer) IS
  'Sets a labor line''s client price (00737, F1; Q5: labor is billed on its own line): unit_price_cents '
  'and line_total_cents = quantity × price. Refuses a line that is not labor, a removed line, and a '
  'released one (on a sent, signed or executed authorization, or on a PO). '
  'Gate: _ffe_require_studio_project. Returns {selectionId, unitPriceCents, lineTotalCents}.';

REVOKE ALL ON FUNCTION public.set_labor_line_price(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_labor_line_price(uuid, integer) TO authenticated;

-- ─── 6. F13: set_line_placements (base 00734:133) ───────────────────────────

CREATE OR REPLACE FUNCTION public.set_line_placements(p_ffe_item_id uuid, p_placements jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_item     public.project_ffe_items%ROWTYPE;
  v_elem     jsonb;
  v_ord      bigint;
  v_room_id  uuid;
  v_qty      numeric;
  v_note     text;
  v_rooms    uuid[] := ARRAY[]::uuid[];
  v_sum      bigint := 0;
  v_primary  uuid;
  v_locked   boolean;
  v_before   jsonb;
  v_after    jsonb;
  v_piece_rooms uuid[];
BEGIN
  IF p_placements IS NULL OR jsonb_typeof(p_placements) <> 'array' THEN
    RAISE EXCEPTION 'Placements are a list of rooms.'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  SELECT * INTO v_item
  FROM public.project_ffe_items
  WHERE id = p_ffe_item_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'line not found' USING ERRCODE = 'no_data_found';
  END IF;

  PERFORM public._ffe_require_studio_project(v_item.project_id);

  -- 00737 (F13): a removed line has no rooms to change.
  IF v_item.removed_at IS NOT NULL THEN
    RAISE EXCEPTION 'This line was removed.' USING ERRCODE = 'check_violation';
  END IF;
  -- 00737 (F13): labor is placed only where its piece is assigned or placed.
  IF v_item.line_kind = 'labor' THEN
    SELECT COALESCE(array_agg(DISTINCT piece_room.room_id), ARRAY[]::uuid[]) INTO v_piece_rooms
    FROM (
      SELECT piece.project_room_id AS room_id FROM public.project_ffe_items piece
      WHERE piece.id = v_item.parent_ffe_item_id AND piece.project_room_id IS NOT NULL
      UNION
      SELECT placement.project_room_id FROM public.project_ffe_placements placement
      WHERE placement.ffe_item_id = v_item.parent_ffe_item_id
    ) piece_room;
  END IF;

  -- Validate every element before writing anything.
  FOR v_elem, v_ord IN
    SELECT e.value, e.ordinality FROM jsonb_array_elements(p_placements) WITH ORDINALITY AS e
  LOOP
    IF jsonb_typeof(v_elem) <> 'object'
       OR jsonb_typeof(v_elem -> 'roomId') IS DISTINCT FROM 'string'
       OR (v_elem ->> 'roomId') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    THEN
      RAISE EXCEPTION 'Each placement names a room.'
        USING ERRCODE = 'invalid_parameter_value';
    END IF;
    v_room_id := (v_elem ->> 'roomId')::uuid;

    IF jsonb_typeof(v_elem -> 'quantity') IS DISTINCT FROM 'number' THEN
      RAISE EXCEPTION 'Each room''s quantity is a whole number above zero.'
        USING ERRCODE = 'check_violation';
    END IF;
    v_qty := (v_elem ->> 'quantity')::numeric;
    IF v_qty <= 0 OR v_qty <> trunc(v_qty) OR v_qty > 2147483647 THEN
      RAISE EXCEPTION 'Each room''s quantity is a whole number above zero.'
        USING ERRCODE = 'check_violation';
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM public.project_rooms room
      WHERE room.id = v_room_id AND room.project_id = v_item.project_id
    ) THEN
      RAISE EXCEPTION 'That room is not in this project.'
        USING ERRCODE = 'check_violation';
    END IF;
    IF v_item.line_kind = 'labor' AND NOT (v_room_id = ANY (v_piece_rooms)) THEN
      RAISE EXCEPTION 'Labor goes where its piece goes.'
        USING ERRCODE = 'check_violation';
    END IF;
    IF v_room_id = ANY (v_rooms) THEN
      RAISE EXCEPTION 'A room appears twice in the placements.'
        USING ERRCODE = 'unique_violation';
    END IF;

    v_rooms := v_rooms || v_room_id;
    v_sum := v_sum + v_qty::integer;
  END LOOP;

  IF v_sum > v_item.quantity THEN
    RAISE EXCEPTION 'The rooms add up to %, more than the % on the line.', v_sum, v_item.quantity
      USING ERRCODE = 'check_violation',
            HINT = 'Change the line''s quantity first; once released, through Record a change.';
  END IF;

  v_primary := CASE WHEN cardinality(v_rooms) > 0 THEN v_rooms[1] ELSE v_item.project_room_id END;

  IF v_item.purchase_order_id IS NOT NULL
     AND v_primary IS DISTINCT FROM v_item.project_room_id THEN
    RAISE EXCEPTION 'The primary room is fixed while the line is on an order.'
      USING ERRCODE = 'check_violation';
  END IF;

  v_locked := v_item.purchase_order_id IS NOT NULL
              OR public.ffe_line_authorization_state(v_item.id) IS NOT NULL;

  SELECT jsonb_build_object(
           'primaryRoomId', v_item.project_room_id,
           'placements', COALESCE(jsonb_agg(jsonb_build_object(
             'roomId', p.project_room_id, 'quantity', p.quantity, 'areaNote', p.area_note)
             ORDER BY p.sort_order, p.created_at), '[]'::jsonb))
  INTO v_before
  FROM public.project_ffe_placements p
  WHERE p.ffe_item_id = v_item.id;

  -- Replace the set: drop rooms no longer named, upsert the rest.
  DELETE FROM public.project_ffe_placements p
  WHERE p.ffe_item_id = v_item.id
    AND NOT (p.project_room_id = ANY (v_rooms));

  FOR v_elem, v_ord IN
    SELECT e.value, e.ordinality FROM jsonb_array_elements(p_placements) WITH ORDINALITY AS e
  LOOP
    v_note := NULLIF(btrim(v_elem ->> 'areaNote'), '');
    INSERT INTO public.project_ffe_placements AS p
      (ffe_item_id, project_id, project_room_id, quantity, area_note, sort_order)
    VALUES
      (v_item.id, v_item.project_id, (v_elem ->> 'roomId')::uuid,
       (v_elem ->> 'quantity')::numeric::integer, v_note, (v_ord - 1)::integer)
    ON CONFLICT (ffe_item_id, project_room_id) DO UPDATE
      SET quantity   = EXCLUDED.quantity,
          area_note  = EXCLUDED.area_note,
          sort_order = EXCLUDED.sort_order
      WHERE (p.quantity, p.area_note, p.sort_order)
            IS DISTINCT FROM (EXCLUDED.quantity, EXCLUDED.area_note, EXCLUDED.sort_order);
  END LOOP;

  -- The first placement is the primary room. Only quantity-free columns move.
  IF cardinality(v_rooms) > 0
     AND (v_item.project_room_id IS DISTINCT FROM v_primary
          OR v_item.assignment_scope IS DISTINCT FROM 'room') THEN
    PERFORM set_config('app.ffe_mutation_rpc', 'on', true);
    UPDATE public.project_ffe_items
    SET project_room_id = v_primary,
        assignment_scope = 'room'
    WHERE id = v_item.id;
  END IF;

  SELECT jsonb_build_object(
           'primaryRoomId', v_primary,
           'placements', COALESCE(jsonb_agg(jsonb_build_object(
             'roomId', p.project_room_id, 'quantity', p.quantity, 'areaNote', p.area_note)
             ORDER BY p.sort_order, p.created_at), '[]'::jsonb))
  INTO v_after
  FROM public.project_ffe_placements p
  WHERE p.ffe_item_id = v_item.id;

  IF v_locked AND v_after IS DISTINCT FROM v_before THEN
    INSERT INTO public.project_ffe_placement_events
      (ffe_item_id, project_id, changed_by, before, after)
    VALUES
      (v_item.id, v_item.project_id, auth.uid(), v_before, v_after);
  END IF;

  RETURN jsonb_build_object(
    'placements', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'placementId', p.id,
               'roomId', p.project_room_id,
               'roomName', room.name,
               'quantity', p.quantity,
               'areaNote', p.area_note,
               'sortOrder', p.sort_order)
             ORDER BY p.sort_order, p.created_at)
      FROM public.project_ffe_placements p
      JOIN public.project_rooms room ON room.id = p.project_room_id
      WHERE p.ffe_item_id = v_item.id), '[]'::jsonb),
    'wasteQuantity', v_item.quantity - v_sum
  );
END;
$$;

COMMENT ON FUNCTION public.set_line_placements(uuid, jsonb) IS
  'Replaces the rooms a line is placed in (00734, D7 phase 1): [{roomId, quantity, areaNote?}]. '
  'Rooms in the line''s project, whole quantities > 0, sum <= line quantity. The first room is primary '
  '(project_room_id, assignment_scope room); [] keeps the primary and clears the rows. On a PO the '
  'primary room is fixed. After release or a PO the change is recorded in project_ffe_placement_events. '
  'Never writes quantity, unit or money. Returns {placements, wasteQuantity}. 00737: refuses a removed '
  'line, and a labor line in a room its piece is neither assigned to nor placed in.';

REVOKE ALL ON FUNCTION public.set_line_placements(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_line_placements(uuid, jsonb) TO authenticated;

-- ─── 7. F11: placement events are append-only ───────────────────────────────

REVOKE UPDATE, DELETE, TRUNCATE ON TABLE public.project_ffe_placement_events
  FROM service_role, authenticated, anon;

-- ─── 8. F8: _spec_book_current_item_snapshots (base 00735:47) ───────────────

CREATE OR REPLACE FUNCTION public._spec_book_current_item_snapshots(p_spec_book_id uuid)
RETURNS TABLE (
  ffe_item_id uuid,
  item_type text,
  document_code text,
  chapter_position integer,
  item_position integer,
  item_snapshot jsonb,
  content_hash text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
  WITH source AS (
    SELECT
      i.id AS ffe_item_id,
      i.item_type,
      i.doc_code,
      COALESCE(c.position, 2147483647) AS chapter_position,
      s.position AS item_position,
      jsonb_strip_nulls(jsonb_build_object(
        'ffeItemId', i.id,
        'itemType', i.item_type,
        'documentCode', i.doc_code,
        'name', i.name,
        'needLabel', CASE WHEN t.primary_ffe_item_id = i.id THEN NULLIF(t.need_label, i.name) END,
        'projectId', i.project_id,
        'room', CASE WHEN r.id IS NULL THEN NULL ELSE jsonb_build_object(
          'id', r.id, 'name', r.name
        ) END,
        'placements', pl.placements,
        'quantity', i.quantity,
        'unit', NULLIF(i.unit, 'each'),
        'lineKind', NULLIF(i.line_kind, 'goods'),
        'parentFfeItemId', CASE WHEN i.line_kind = 'labor' THEN i.parent_ffe_item_id END,
        'category', i.ffe_category,
        'selectedMedia', CASE
          WHEN jsonb_array_length(sp.selected_media) > 0 THEN sp.selected_media
          ELSE COALESCE(to_jsonb(p.images), '[]'::jsonb)
        END,
        'selection', jsonb_build_object(
          'sku', public._spec_book_resolve_field(
            to_jsonb(sp.sku), i.custom_fields->'sku', to_jsonb(p.sku),
            p.capture_provenance#>'{studioCustom,sku}', sp.na_declarations->'sku',
            sp.updated_at, i.updated_at, p.updated_at,
            NULLIF(sp.source_verifications->>'sku', '')::timestamptz,
            sp.field_provenance->>'sku'
          ),
          'finish', public._spec_book_resolve_field(
            to_jsonb(sp.finish), i.custom_fields->'finish', to_jsonb(p.finish),
            p.capture_provenance#>'{studioCustom,finish}', sp.na_declarations->'finish',
            sp.updated_at, i.updated_at, p.updated_at,
            NULLIF(sp.source_verifications->>'finish', '')::timestamptz,
            sp.field_provenance->>'finish'
          ),
          'material', public._spec_book_resolve_field(
            to_jsonb(sp.material), i.custom_fields->'material', to_jsonb(p.materials),
            p.capture_provenance#>'{studioCustom,material}', sp.na_declarations->'material',
            sp.updated_at, i.updated_at, p.updated_at,
            NULLIF(sp.source_verifications->>'material', '')::timestamptz,
            sp.field_provenance->>'material'
          ),
          'colorFabric', public._spec_book_resolve_field(
            to_jsonb(sp.color_fabric), i.custom_fields->'colorFabric', to_jsonb(p.colors),
            p.capture_provenance#>'{studioCustom,colorFabric}', sp.na_declarations->'colorFabric',
            sp.updated_at, i.updated_at, p.updated_at,
            NULLIF(sp.source_verifications->>'colorFabric', '')::timestamptz,
            sp.field_provenance->>'colorFabric'
          ),
          'dimensions', public._spec_book_resolve_field(
            sp.selected_dimensions, i.custom_fields->'dimensions', p.dimensions,
            p.capture_provenance#>'{studioCustom,dimensions}', sp.na_declarations->'dimensions',
            sp.updated_at, i.updated_at, p.updated_at,
            NULLIF(sp.source_verifications->>'dimensions', '')::timestamptz,
            sp.field_provenance->>'dimensions'
          ),
          'exactLocation', public._spec_book_resolve_field(
            to_jsonb(sp.exact_location), i.custom_fields->'exactLocation', NULL,
            p.capture_provenance#>'{studioCustom,exactLocation}', sp.na_declarations->'exactLocation',
            sp.updated_at, i.updated_at, p.updated_at,
            NULLIF(sp.source_verifications->>'exactLocation', '')::timestamptz,
            sp.field_provenance->>'exactLocation'
          )
        ),
        'notes', jsonb_build_object(
          'client', sp.client_notes,
          'trade', sp.trade_notes,
          'install', sp.install_notes,
          'private', i.notes,
          'care', sp.care_notes,
          'warranty', sp.warranty_notes
        ),
        'pricing', jsonb_build_object(
          'clientPriceCents', i.unit_price_cents,
          'tradePriceCents', i.trade_price_cents,
          'markupPercent', i.markup_percent,
          'currency', i.currency
        ),
        'vendor', jsonb_build_object(
          'id', i.vendor_id,
          'name', i.vendor_name,
          'internalContact', p.vendor_contact
        ),
        'configuration', CASE WHEN sp.configuration_id IS NULL THEN NULL ELSE jsonb_build_object(
          'id', sp.configuration_id,
          'snapshot', sp.configuration_snapshot,
          'snapshotHash', sp.configuration_snapshot_hash,
          'lockedAt', sp.configuration_locked_at
        ) END,
        'provenance', sp.field_provenance,
        'sourceVerification', sp.source_verifications,
        'naDeclarations', sp.na_declarations,
        'readinessStatus', sp.readiness_status,
        'rowVersion', sp.row_version
      )) AS snapshot
    FROM public.spec_book_item_settings s
    JOIN public.spec_books b ON b.id = s.spec_book_id
    JOIN public.project_ffe_items i ON i.id = s.ffe_item_id
    JOIN public.project_ffe_specs sp ON sp.ffe_item_id = i.id
    LEFT JOIN public.spec_book_chapters c ON c.id = s.chapter_id
    LEFT JOIN public.project_rooms r ON r.id = i.project_room_id
    LEFT JOIN public.products p ON p.id = i.product_id
    LEFT JOIN public.project_ffe_selection_threads t ON t.id = i.selection_thread_id
    LEFT JOIN LATERAL (
      SELECT CASE WHEN count(*) > 1 THEN jsonb_agg(jsonb_build_object(
          'roomName', pr.name,
          'quantity', fp.quantity,
          'areaNote', fp.area_note
        ) ORDER BY fp.sort_order, fp.created_at, fp.id)
      END AS placements
      FROM public.project_ffe_placements fp
      JOIN public.project_rooms pr ON pr.id = fp.project_room_id
      WHERE fp.ffe_item_id = i.id
    ) pl ON true
    WHERE s.spec_book_id = p_spec_book_id
      AND s.included
      AND (c.id IS NULL OR c.included)
      AND i.removed_at IS NULL
  )
  SELECT
    source.ffe_item_id,
    source.item_type,
    source.doc_code,
    source.chapter_position,
    source.item_position,
    source.snapshot,
    encode(
      extensions.digest(public._spec_book_canonical_json(source.snapshot), 'sha256'),
      'hex'
    )
  FROM source
  ORDER BY source.chapter_position, source.item_position, source.ffe_item_id;
$$;

REVOKE ALL ON FUNCTION public._spec_book_current_item_snapshots(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._spec_book_current_item_snapshots(uuid) TO service_role;
