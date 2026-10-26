-- 00881 — Fill the locked current requirement, never restore a stale snapshot.
-- Public lineage: 00435 → 00439 → 00442 → 00445 → 00447 → 00752 → 00808 → 00873.
-- SQ-2084 / SQ-2044 F4: only the public 00873 entry is grafted. Preserve raw
-- receipts, job→item lock order, authority, signed ceiling and native bridges.
-- Fixed/allowance type drift refuses; native tbd completion remains available.

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
  v_placeholder_id uuid;
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
  BEGIN
    v_placeholder_id := NULLIF(p_request->>'placeholderSelectionId', '')::uuid;
  EXCEPTION WHEN invalid_text_representation THEN
    v_placeholder_id := NULL;
  END;
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

  IF v_placeholder_id IS NOT NULL THEN
    -- Validate the caller's original routing before replacing its stale context.
    -- Otherwise normalization would admit malformed or foreign-room requests.
    IF COALESCE(NULLIF(p_request->>'assignmentScope', ''), 'unassigned')
         NOT IN ('room', 'throughout', 'unassigned')
       OR COALESCE(NULLIF(p_request->>'disposition', ''), 'candidate')
         NOT IN ('candidate', 'selected', 'alternate', 'not_selected') THEN
      RAISE EXCEPTION 'invalid placement routing choice' USING ERRCODE = 'check_violation';
    END IF;
    IF (COALESCE(NULLIF(p_request->>'assignmentScope', ''), 'unassigned') = 'room')
       <> (NULLIF(p_request->>'roomId', '') IS NOT NULL) THEN
      RAISE EXCEPTION 'room assignment requires exactly one project room'
        USING ERRCODE = 'check_violation';
    END IF;
    IF NULLIF(p_request->>'roomId', '') IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.project_rooms room
      WHERE room.id = (p_request->>'roomId')::uuid AND room.project_id = v_project_id
    ) THEN
      RAISE EXCEPTION 'room does not belong to project'
        USING ERRCODE = 'integrity_constraint_violation';
    END IF;
    IF v_existing.item_type IN ('fixed', 'allowance')
       AND v_existing.item_type IS DISTINCT FROM v_item_type THEN
      RAISE EXCEPTION 'This line changed type. Choose Fill again.'
        USING ERRCODE = 'check_violation';
    END IF;
    -- Only the derived request uses current context; the receipt hashes the
    -- original caller body above. The native core still owns Fill eligibility.
    v_request := v_request || jsonb_build_object(
      'roomId', v_existing.project_room_id,
      'assignmentScope', v_existing.assignment_scope,
      'disposition', v_existing.design_disposition
    );
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
    -- 00881: every Fill keeps current budgets, including NULL legacy values.
    UPDATE public.project_ffe_items
    SET item_type = v_item_type,
        budget_min_cents = CASE WHEN v_result->>'outcome' = 'filled' THEN budget_min_cents
          WHEN v_item_type = 'allowance'
          THEN COALESCE(NULLIF(p_request->>'budgetMinCents', '')::integer, 0)
          ELSE budget_min_cents END,
        budget_max_cents = CASE WHEN v_result->>'outcome' = 'filled' THEN budget_max_cents
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

REVOKE ALL ON FUNCTION public.place_product_in_project_v2(jsonb)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.place_product_in_project_v2(jsonb) TO authenticated;
