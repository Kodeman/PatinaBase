-- ═══════════════════════════════════════════════════════════════════════════
-- 00415 — Decision selections and promoted templates carry only what they should
--
-- Three leaks found in adversarial review of 00413/00403:
--
-- PRIV-1/cfg-3 (CRITICAL) — client_decision_options.selection_snapshot is
--   written from designer-supplied JSON with no server-side shape control, and
--   the option row is readable by the client the decision is addressed to. A
--   snapshot copied straight off a configuration carries
--   tradePriceDeltaCents/retailPriceDeltaCents, so the trade side of the book
--   reaches the client the moment a decision is sent. The two write RPCs now
--   REBUILD every entry from an allowlist — {optionGroupId, optionValueId,
--   groupCode, valueCode, groupName, valueLabel, leadTimeDeltaWeeks,
--   allowsCom} — dropping both price deltas and anything else unrecognised.
--   An allowlist, not a denylist: tomorrow's new snapshot key cannot leak by
--   being forgotten here. The apply feed-through reads only groupCode and
--   valueLabel, so what the decision specifies is unchanged.
--
-- cfg-2 (MAJOR) — promote_configuration_to_library copied the source snapshot
--   into a reusable library template. Once 00413 merged comDetails into the
--   snapshot, promoting a COM piece carried one project's actual fabric —
--   mill, pattern, yardage, ship-to, sidemark — into a template meant to be
--   reused everywhere. The promoted snapshot is now scrubbed of comDetails
--   (and re-hashed), the evaluation's nested snapshot is kept coherent with
--   it, and com_details is written NULL explicitly. Value-level
--   com_requirements stay on the option values, so the reusable COM knowledge
--   is not lost — only the one project's fabric is.
--
-- cfg-6 (MINOR) — save_product_configuration merged comDetails into the
--   snapshot it stores and hashes, but left evaluation->'snapshot' as the
--   pre-merge copy, so one row carried two disagreeing snapshots. The
--   evaluation now carries the same object that was hashed.
--
-- Lineage:
--   save_product_configuration          00403 → 00413 → 00415
--   promote_configuration_to_library    00403 → 00415
--   create_client_decision              00085 → 00175 → 00185 → 00399 → 00413 → 00415
--   update_client_decision              00085 → 00175 → 00185 → 00399 → 00413 → 00415
-- Bodies below are the live heads copied verbatim, with only the deltas above
-- grafted on. Grants are re-asserted exactly as the source migrations wrote
-- them (CREATE OR REPLACE preserves ACLs; the re-assert is the house posture).
-- ═══════════════════════════════════════════════════════════════════════════

-- ── The one place that decides what a decision option may carry ────────────
-- Rebuilt, never filtered: an entry keeps the allowlisted keys and nothing
-- else, so a key nobody thought about here cannot ride along. Array order is
-- preserved because the apply feed-through string_aggs by ordinality.
CREATE OR REPLACE FUNCTION public._decision_selection_snapshot_safe(p_snapshot jsonb)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN p_snapshot IS NULL OR jsonb_typeof(p_snapshot) <> 'array' THEN NULL
    ELSE COALESCE((
      SELECT jsonb_agg(sanitized.entry ORDER BY sanitized.ord)
      FROM (
        SELECT
          source.ord,
          COALESCE((
            SELECT jsonb_object_agg(pair.key, pair.value)
            FROM jsonb_each(source.value) AS pair
            WHERE pair.key IN (
              'optionGroupId', 'optionValueId', 'groupCode', 'valueCode',
              'groupName', 'valueLabel', 'leadTimeDeltaWeeks', 'allowsCom'
            )
          ), '{}'::jsonb) AS entry
        FROM jsonb_array_elements(p_snapshot)
             WITH ORDINALITY AS source(value, ord)
        WHERE jsonb_typeof(source.value) = 'object'
      ) AS sanitized
    ), '[]'::jsonb)
  END
$$;

COMMENT ON FUNCTION public._decision_selection_snapshot_safe(jsonb) IS
  'Client-safe rebuild of a decision option selection snapshot: keeps only {optionGroupId, optionValueId, groupCode, valueCode, groupName, valueLabel, leadTimeDeltaWeeks, allowsCom}. Trade and retail price deltas — and every unrecognised key — are dropped, because the client reads this row.';

-- ── save_product_configuration (live head 00413) ─────────────────────────
CREATE OR REPLACE FUNCTION public.save_product_configuration(p_input jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_product_id uuid;
  v_old_id uuid;
  v_old public.product_configurations;
  v_product public.products;
  v_project public.projects;
  v_configuration public.product_configurations;
  v_evaluation jsonb;
  v_snapshot jsonb;
  v_hash text;
  v_selected_ids uuid[] := '{}'::uuid[];
  v_group_entry record;
  v_value_ref text;
  v_value_id uuid;
  v_components jsonb;
  v_component_input jsonb;
  v_configuration_key uuid;
  v_version integer;
  v_project_id uuid;
  v_ffe_item_id uuid;
  v_variant_id uuid;
  v_studio_id uuid;
  v_latest_id uuid;
  v_custom_brief jsonb;
  v_com_details jsonb;
  v_com_value_id uuid;
  v_custom_revision public.custom_commission_revisions;
  v_previous_custom_revision public.custom_commission_revisions;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'authentication required' USING errcode = 'insufficient_privilege';
  END IF;
  IF p_input IS NULL OR jsonb_typeof(p_input) <> 'object' THEN
    RAISE EXCEPTION 'configuration input must be an object' USING errcode = 'check_violation';
  END IF;
  v_product_id := NULLIF(p_input->>'productId', '')::uuid;
  v_project_id := NULLIF(p_input->>'projectId', '')::uuid;
  v_ffe_item_id := NULLIF(p_input->>'ffeItemId', '')::uuid;
  v_old_id := NULLIF(p_input->>'configurationId', '')::uuid;
  v_components := COALESCE(p_input->'components', '[]'::jsonb);

  IF NOT public._can_read_configurable_product(v_product_id) THEN
    RAISE EXCEPTION 'product not found or not accessible' USING errcode = 'insufficient_privilege';
  END IF;
  SELECT * INTO STRICT v_product FROM public.products WHERE id = v_product_id;
  v_custom_brief := p_input->'customBrief';
  IF v_product.configuration_mode = 'custom' THEN
    IF v_custom_brief IS NULL OR jsonb_typeof(v_custom_brief) <> 'object'
       OR length(btrim(COALESCE(v_custom_brief->>'summary', ''))) = 0 THEN
      RAISE EXCEPTION 'custom configuration requires a brief summary'
        USING errcode = 'check_violation';
    END IF;
    IF COALESCE(v_custom_brief->>'fabricatorVendorId', '') = '' THEN
      v_custom_brief := v_custom_brief - 'fabricatorVendorId';
    END IF;
  END IF;

  IF jsonb_typeof(COALESCE(p_input->'selections', '{}'::jsonb)) <> 'object' THEN
    RAISE EXCEPTION 'selections must be an object' USING errcode = 'check_violation';
  END IF;
  IF jsonb_typeof(v_components) <> 'array' THEN
    RAISE EXCEPTION 'components must be an array' USING errcode = 'check_violation';
  END IF;
  IF v_product.configuration_mode IN ('standard', 'custom') AND (
       NULLIF(p_input->>'variantId', '') IS NOT NULL
       OR EXISTS (SELECT 1 FROM jsonb_each(COALESCE(p_input->'selections', '{}'::jsonb)))
       OR jsonb_array_length(v_components) > 0
     ) THEN
    RAISE EXCEPTION '% mode cannot save variants, option selections, or components',
      v_product.configuration_mode USING errcode = 'check_violation';
  END IF;
  IF v_product.configuration_mode = 'variant' AND jsonb_array_length(v_components) > 0 THEN
    RAISE EXCEPTION 'variant mode cannot save modular components'
      USING errcode = 'check_violation';
  END IF;
  IF v_product.configuration_mode = 'configured' AND NULLIF(p_input->>'variantId', '') IS NOT NULL THEN
    RAISE EXCEPTION 'configured mode cannot save an exact variant'
      USING errcode = 'check_violation';
  END IF;
  IF v_product.configuration_mode <> 'custom'
     AND p_input ? 'customBrief' AND p_input->'customBrief' <> 'null'::jsonb THEN
    RAISE EXCEPTION 'customBrief is only valid for custom products'
      USING errcode = 'check_violation';
  END IF;
  FOR v_group_entry IN SELECT key, value FROM jsonb_each(COALESCE(p_input->'selections', '{}'::jsonb)) LOOP
    IF jsonb_typeof(v_group_entry.value) <> 'array' THEN
      RAISE EXCEPTION 'each selection value must be an array' USING errcode = 'check_violation';
    END IF;
    FOR v_value_ref IN SELECT jsonb_array_elements_text(v_group_entry.value) LOOP
      v_value_id := NULL;
      BEGIN
        v_value_id := v_value_ref::uuid;
      EXCEPTION WHEN invalid_text_representation THEN
        SELECT ov.id INTO v_value_id
        FROM public.product_option_values ov
        JOIN public.product_option_groups og ON og.id = ov.option_group_id
        WHERE og.product_id = v_product_id
          AND (og.code = v_group_entry.key OR og.id::text = v_group_entry.key)
          AND ov.code = v_value_ref;
      END;
      IF v_value_id IS NULL THEN
        RAISE EXCEPTION 'unknown option selection %:%', v_group_entry.key, v_value_ref
          USING errcode = 'foreign_key_violation';
      END IF;
      v_selected_ids := array_append(v_selected_ids, v_value_id);
    END LOOP;
  END LOOP;

  -- COM/COL: the client-supplied fabric is part of what was specified, so it
  -- is validated against the actual selections and hashed with the snapshot.
  v_com_details := NULLIF(p_input->'comDetails', 'null'::jsonb);
  IF v_com_details IS NOT NULL THEN
    IF jsonb_typeof(v_com_details) <> 'object' THEN
      RAISE EXCEPTION 'comDetails must be a JSON object'
        USING errcode = 'invalid_parameter_value';
    END IF;
    IF v_product.configuration_mode = 'standard' THEN
      RAISE EXCEPTION 'comDetails is only valid for variant, configured, or custom products'
        USING errcode = 'invalid_parameter_value';
    END IF;
    IF NULLIF(v_com_details->>'optionValueId', '') IS NOT NULL THEN
      BEGIN
        v_com_value_id := (v_com_details->>'optionValueId')::uuid;
      EXCEPTION WHEN invalid_text_representation THEN
        v_com_value_id := NULL;
      END;
      IF v_com_value_id IS NULL OR NOT (v_com_value_id = ANY(v_selected_ids)) THEN
        RAISE EXCEPTION 'comDetails.optionValueId must name one of the selected option values'
          USING errcode = 'foreign_key_violation';
      END IF;
    END IF;
  END IF;

  v_evaluation := public.evaluate_product_configuration(
    v_product_id,
    NULLIF(p_input->>'variantId', '')::uuid,
    v_selected_ids,
    v_components
  );
  IF NOT COALESCE((v_evaluation->>'valid')::boolean, false) THEN
    RAISE EXCEPTION 'invalid configuration: %', v_evaluation->'violations'
      USING errcode = 'check_violation';
  END IF;
  v_snapshot := v_evaluation->'snapshot';
  IF v_com_details IS NOT NULL THEN
    v_snapshot := v_snapshot || jsonb_build_object('comDetails', v_com_details);
    -- The row stores both; they must be the same snapshot. Readers that go
    -- through the evaluation (quote envelopes, history) would otherwise see a
    -- COM piece with no fabric and a hash that does not match what they read.
    v_evaluation := jsonb_set(v_evaluation, '{snapshot}', v_snapshot);
  END IF;
  v_hash := public._configuration_snapshot_hash(v_snapshot);
  v_variant_id := NULLIF(v_evaluation#>>'{matchedVariant,id}', '')::uuid;

  IF v_project_id IS NOT NULL THEN
    SELECT * INTO v_project FROM public.projects WHERE id = v_project_id FOR SHARE;
    IF NOT FOUND OR NOT public.is_design_studio_comember(v_project.designer_id) THEN
      RAISE EXCEPTION 'project not found or not accessible' USING errcode = 'insufficient_privilege';
    END IF;
    IF v_ffe_item_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.project_ffe_items WHERE id = v_ffe_item_id AND project_id = v_project_id
    ) THEN
      RAISE EXCEPTION 'FFE item does not belong to project' USING errcode = 'check_violation';
    END IF;
  ELSIF v_ffe_item_id IS NOT NULL THEN
    RAISE EXCEPTION 'ffeItemId requires projectId' USING errcode = 'check_violation';
  END IF;

  IF v_old_id IS NOT NULL THEN
    IF NOT public._can_access_product_configuration(v_old_id) THEN
      RAISE EXCEPTION 'configuration not found or not accessible' USING errcode = 'insufficient_privilege';
    END IF;
    SELECT * INTO STRICT v_old FROM public.product_configurations WHERE id = v_old_id FOR UPDATE;
    IF v_old.product_id <> v_product_id THEN
      RAISE EXCEPTION 'configuration belongs to another product' USING errcode = 'check_violation';
    END IF;
    IF v_old.project_id IS DISTINCT FROM v_project_id
       OR v_old.ffe_item_id IS DISTINCT FROM v_ffe_item_id THEN
      RAISE EXCEPTION 'configuration scope cannot change while versioning; instantiate a reusable template for another project'
        USING errcode = 'check_violation';
    END IF;
    IF p_input ? 'expectedVersion'
       AND (p_input->>'expectedVersion')::integer <> v_old.version THEN
      RAISE EXCEPTION 'configuration changed in another session'
        USING errcode = 'serialization_failure';
    END IF;
    v_configuration_key := v_old.configuration_key;
    PERFORM pg_advisory_xact_lock(hashtextextended(v_configuration_key::text, 0));
    SELECT c.id, c.version + 1 INTO v_latest_id, v_version
    FROM public.product_configurations c
    WHERE c.configuration_key = v_configuration_key
    ORDER BY c.version DESC LIMIT 1;
    IF v_latest_id IS DISTINCT FROM v_old.id
       OR (p_input ? 'expectedVersion' AND (p_input->>'expectedVersion')::integer <> v_version - 1) THEN
      RAISE EXCEPTION 'configuration is not the latest version; refresh before saving'
        USING errcode = 'serialization_failure';
    END IF;
    IF v_old.status = 'saved' THEN
      UPDATE public.product_configurations SET status = 'superseded', updated_at = now() WHERE id = v_old.id;
    END IF;
  ELSE
    v_configuration_key := extensions.gen_random_uuid();
    v_version := 1;
  END IF;

  v_studio_id := CASE
    WHEN v_project_id IS NOT NULL THEN
      COALESCE(v_project.studio_id, public._primary_studio_for(v_project.designer_id))
    WHEN v_product.layer = 'studio' THEN v_product.studio_id
    WHEN v_product.layer = 'catalog' THEN public._primary_studio_for(auth.uid())
    ELSE NULL
  END;
  INSERT INTO public.product_configurations (
    configuration_key, product_id, product_variant_id, previous_configuration_id,
    project_id, ffe_item_id, owner_user_id, studio_id, version, schema_revision,
    status, name, notes, custom_brief, com_details, normalized_selection, component_quantities,
    evaluation, snapshot, snapshot_hash, is_complete, is_valid,
    retail_price_cents, trade_price_cents, lead_time_weeks, resolved_dimensions
  ) VALUES (
    v_configuration_key, v_product_id, v_variant_id, v_old_id,
    v_project_id, v_ffe_item_id, auth.uid(), v_studio_id, v_version,
    (v_evaluation->>'schemaRevision')::integer, 'saved',
    NULLIF(btrim(p_input->>'name'), ''), p_input->>'notes', v_custom_brief, v_com_details,
    v_evaluation->'normalizedSelection', v_evaluation->'componentQuantities',
    v_evaluation, v_snapshot, v_hash,
    (v_evaluation->>'complete')::boolean, (v_evaluation->>'valid')::boolean,
    NULLIF(v_evaluation->>'retailPriceCents', '')::integer,
    NULLIF(v_evaluation->>'tradePriceCents', '')::integer,
    NULLIF(v_evaluation->>'leadTimeWeeks', '')::integer,
    NULLIF(v_evaluation->'dimensions', 'null'::jsonb)
  ) RETURNING * INTO v_configuration;

  INSERT INTO public.product_configuration_selections (
    configuration_id, option_group_id, option_value_id, selection_snapshot
  )
  SELECT v_configuration.id, og.id, ov.id, jsonb_build_object(
    'optionGroupId', og.id, 'optionValueId', ov.id,
    'groupCode', og.code, 'valueCode', ov.code,
    'groupName', og.name, 'valueLabel', ov.label,
    'retailPriceDeltaCents', ov.retail_price_delta_cents,
    'tradePriceDeltaCents', ov.trade_price_delta_cents,
    'leadTimeDeltaWeeks', ov.lead_time_delta_weeks
  )
  FROM public.product_option_values ov
  JOIN public.product_option_groups og ON og.id = ov.option_group_id
  WHERE ov.id = ANY(v_selected_ids) AND og.product_id = v_product_id;

  FOR v_component_input IN SELECT value FROM jsonb_array_elements(v_components) LOOP
    INSERT INTO public.product_configuration_components (
      configuration_id, component_id, quantity, handedness, component_snapshot
    )
    SELECT v_configuration.id, c.id, (v_component_input->>'quantity')::integer,
      NULLIF(v_component_input->>'handedness', ''),
      jsonb_build_object(
        'componentId', c.id, 'code', c.code, 'name', c.name,
        'quantity', (v_component_input->>'quantity')::integer,
        'handedness', NULLIF(v_component_input->>'handedness', ''),
        'retailPriceCents', c.retail_price_cents,
        'tradePriceCents', c.trade_price_cents,
        'leadTimeWeeks', c.lead_time_weeks,
        'dimensions', c.dimensions
      )
    FROM public.product_components c
    WHERE c.id = (v_component_input->>'componentId')::uuid AND c.product_id = v_product_id;
  END LOOP;

  IF v_product.configuration_mode = 'custom' THEN
    SELECT r.* INTO v_previous_custom_revision
    FROM public.custom_commission_revisions r
    JOIN public.product_configurations lineage ON lineage.id = r.configuration_id
    WHERE lineage.configuration_key = v_configuration.configuration_key
    ORDER BY r.revision_number DESC LIMIT 1 FOR UPDATE OF r;
    IF FOUND AND v_previous_custom_revision.status IN ('submitted', 'quoted', 'client_review') THEN
      RAISE EXCEPTION 'resolve the active commission revision before saving another version'
        USING errcode = 'object_not_in_prerequisite_state';
    END IF;
    IF FOUND AND v_previous_custom_revision.status = 'draft' THEN
      UPDATE public.custom_commission_revisions
      SET status = 'superseded', updated_at = now()
      WHERE id = v_previous_custom_revision.id;
    END IF;
    INSERT INTO public.custom_commission_revisions (
      configuration_id, revision_number, previous_revision_id, status,
      brief, drawings, provenance, created_by
    ) VALUES (
      v_configuration.id, COALESCE(v_previous_custom_revision.revision_number, 0) + 1,
      v_previous_custom_revision.id, 'draft', v_custom_brief,
      COALESCE(v_custom_brief->'drawings', '[]'::jsonb),
      jsonb_build_object('source', 'configuration-save'), auth.uid()
    ) RETURNING * INTO v_custom_revision;
  END IF;

  RETURN jsonb_build_object(
    'configuration', public._product_configuration_json(v_configuration.id),
    'forkedFromConfigurationId', v_old_id,
    'customRevision', CASE WHEN v_custom_revision.id IS NULL THEN NULL
      ELSE public._custom_commission_revision_json(v_custom_revision.id) END
  );
END;
$$;

-- ── promote_configuration_to_library (live head 00403) ───────────────────
CREATE OR REPLACE FUNCTION public.promote_configuration_to_library(
  p_configuration_id uuid,
  p_name text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_source public.product_configurations;
  v_template public.product_configurations;
  v_product_mode text;
  v_safe_brief jsonb;
  v_safe_snapshot jsonb;
  v_safe_evaluation jsonb;
  v_safe_hash text;
BEGIN
  IF NOT public._can_access_product_configuration(p_configuration_id) THEN
    RAISE EXCEPTION 'configuration not found or not accessible' USING errcode = 'insufficient_privilege';
  END IF;
  SELECT * INTO STRICT v_source
  FROM public.product_configurations WHERE id = p_configuration_id FOR UPDATE;
  IF v_source.status NOT IN ('approved', 'issued') THEN
    RAISE EXCEPTION 'only approved or issued configurations may be promoted'
      USING errcode = 'object_not_in_prerequisite_state';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('configuration-promotion:' || v_source.id::text, 0));
  SELECT configuration_mode INTO STRICT v_product_mode
  FROM public.products WHERE id = v_source.product_id;

  SELECT * INTO v_template
  FROM public.product_configurations
  WHERE previous_configuration_id = v_source.id
    AND is_library_template
    AND project_id IS NULL
    AND owner_user_id = auth.uid()
  ORDER BY created_at DESC LIMIT 1 FOR UPDATE;
  IF FOUND THEN
    UPDATE public.product_configurations
    SET name = COALESCE(NULLIF(btrim(p_name), ''), name), updated_at = now()
    WHERE id = v_template.id;
    RETURN public._product_configuration_json(v_template.id);
  END IF;

  v_safe_brief := v_source.custom_brief;
  -- A library template is knowledge that gets reused; the COM fabric is one
  -- project's specification. Strip it here so nobody inherits another client's
  -- mill, yardage, ship-to, or sidemark. The option values keep their
  -- com_requirements, so "this value is customer's own material, and here is
  -- what the vendor needs" survives promotion intact.
  v_safe_snapshot := v_source.snapshot - 'customCommission' - 'comDetails';
  v_safe_evaluation := v_source.evaluation - 'customCommission';
  IF v_product_mode = 'custom' THEN
    v_safe_brief := jsonb_strip_nulls(jsonb_build_object(
      'summary', v_source.custom_brief->>'summary',
      'intent', v_source.custom_brief->>'intent',
      'requirements', v_source.custom_brief->'requirements',
      'materials', v_source.custom_brief->'materials',
      'finish', v_source.custom_brief->>'finish',
      'priceOnRequest', true
    ));
    v_safe_snapshot := v_safe_snapshot || jsonb_build_object(
      'retailPriceCents', NULL, 'tradePriceCents', NULL,
      'leadTimeWeeks', NULL, 'capturedAt', now()
    );
    v_safe_evaluation := v_safe_evaluation || jsonb_build_object(
      'retailPriceCents', NULL, 'tradePriceCents', NULL,
      'leadTimeWeeks', NULL, 'snapshot', v_safe_snapshot
    );
  END IF;
  -- Whatever the arm above did, the evaluation must describe the snapshot the
  -- template actually carries.
  IF v_safe_evaluation ? 'snapshot' THEN
    v_safe_evaluation := jsonb_set(v_safe_evaluation, '{snapshot}', v_safe_snapshot);
  END IF;
  v_safe_hash := public._configuration_snapshot_hash(v_safe_snapshot);

  INSERT INTO public.product_configurations (
    configuration_key, product_id, product_variant_id, previous_configuration_id,
    project_id, ffe_item_id, owner_user_id, studio_id, version, schema_revision,
    status, name, notes, custom_brief, com_details, normalized_selection, component_quantities,
    evaluation, snapshot, snapshot_hash, is_complete, is_valid,
    retail_price_cents, trade_price_cents, lead_time_weeks, resolved_dimensions,
    is_library_template, promoted_at
  ) VALUES (
    extensions.gen_random_uuid(), v_source.product_id,
    CASE WHEN v_product_mode = 'custom' THEN NULL ELSE v_source.product_variant_id END,
    v_source.id, NULL, NULL, auth.uid(),
    COALESCE(v_source.studio_id, public._primary_studio_for(auth.uid())),
    1, v_source.schema_revision, 'saved',
    COALESCE(NULLIF(btrim(p_name), ''), v_source.name), NULL, v_safe_brief,
    NULL,
    v_source.normalized_selection, v_source.component_quantities,
    v_safe_evaluation, v_safe_snapshot, v_safe_hash,
    v_source.is_complete, v_source.is_valid,
    CASE WHEN v_product_mode = 'custom' THEN NULL ELSE v_source.retail_price_cents END,
    CASE WHEN v_product_mode = 'custom' THEN NULL ELSE v_source.trade_price_cents END,
    CASE WHEN v_product_mode = 'custom' THEN NULL ELSE v_source.lead_time_weeks END,
    v_source.resolved_dimensions, true, now()
  ) RETURNING * INTO v_template;

  INSERT INTO public.product_configuration_selections (
    configuration_id, option_group_id, option_value_id, selection_snapshot
  )
  SELECT v_template.id, option_group_id, option_value_id, selection_snapshot
  FROM public.product_configuration_selections WHERE configuration_id = v_source.id;
  INSERT INTO public.product_configuration_components (
    configuration_id, component_id, quantity, handedness, component_snapshot
  )
  SELECT v_template.id, component_id, quantity, handedness, component_snapshot
  FROM public.product_configuration_components WHERE configuration_id = v_source.id;

  RETURN public._product_configuration_json(v_template.id);
END;
$$;

-- ── create_client_decision (live head 00413) ─────────────────────────────
CREATE OR REPLACE FUNCTION public.create_client_decision(
  p_decision_id uuid,
  p_payload jsonb,
  p_options jsonb DEFAULT '[]'::jsonb,
  p_blocked_ffe_item_ids uuid[] DEFAULT '{}'::uuid[],
  p_blocked_task_ids uuid[] DEFAULT '{}'::uuid[]
)
RETURNS public.client_decisions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_relationship public.designer_clients%ROWTYPE;
  v_decision public.client_decisions%ROWTYPE;
  v_project_id uuid;
  v_status text;
  v_unknown jsonb;
  v_expected_count integer;
  v_matched_count integer;
  v_existing_payload jsonb;
  v_requested_payload jsonb;
  v_existing_options jsonb;
  v_requested_options jsonb;
  v_existing_ffe_ids uuid[];
  v_requested_ffe_ids uuid[];
  v_existing_task_ids uuid[];
  v_requested_task_ids uuid[];
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'create_client_decision requires an authenticated user'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_decision_id IS NULL THEN
    RAISE EXCEPTION 'p_decision_id is required'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;
  IF p_payload IS NULL OR jsonb_typeof(p_payload) <> 'object' THEN
    RAISE EXCEPTION 'p_payload must be a JSON object'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;
  IF jsonb_typeof(COALESCE(p_options, '[]'::jsonb)) <> 'array' THEN
    RAISE EXCEPTION 'p_options must be a JSON array'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  v_unknown := p_payload - ARRAY[
    'designer_client_id', 'project_id', 'title', 'context', 'due_date',
    'linked_phase', 'phase_id', 'room_id', 'section_key', 'decision_type',
    'decision_kind', 'coordination_kind', 'blocking_status', 'blocks_kind',
    'blocks_milestone_id', 'court', 'court_party_id', 'status'
  ];
  IF v_unknown <> '{}'::jsonb THEN
    RAISE EXCEPTION 'unsupported decision payload keys: %', v_unknown
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  IF btrim(COALESCE(p_payload->>'title', '')) = '' THEN
    RAISE EXCEPTION 'decision title is required'
      USING ERRCODE = 'check_violation';
  END IF;
  v_status := COALESCE(NULLIF(p_payload->>'status', ''), 'pending');
  IF v_status NOT IN ('draft', 'pending') THEN
    RAISE EXCEPTION 'new decisions must start draft or pending'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO v_relationship
  FROM public.designer_clients
  WHERE id = NULLIF(p_payload->>'designer_client_id', '')::uuid
  FOR SHARE;
  IF NOT FOUND OR NOT public._can_author_proposal(v_relationship.designer_id) THEN
    RAISE EXCEPTION 'relationship not found or access denied'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF v_status = 'pending' AND v_relationship.client_id IS NULL THEN
    RAISE EXCEPTION 'pending decisions require a registered client recipient'
      USING ERRCODE = 'check_violation';
  END IF;

  v_project_id := NULLIF(p_payload->>'project_id', '')::uuid;

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(COALESCE(p_options, '[]'::jsonb)) AS option(value)
    WHERE jsonb_typeof(option.value) <> 'object'
       OR btrim(COALESCE(option.value->>'name', '')) = ''
       OR COALESCE(NULLIF(option.value->>'quantity', '')::integer, 1) < 1
       OR COALESCE(NULLIF(option.value->>'sort_order', '')::integer, 0) < 0
       OR COALESCE((option.value->>'selected')::boolean, false)
       OR option.value ? 'client_note'
  ) THEN
    RAISE EXCEPTION 'invalid decision option payload'
      USING ERRCODE = 'check_violation';
  END IF;

  -- A reused key is an exact receipt, never permission to overwrite a row.
  SELECT * INTO v_decision
  FROM public.client_decisions
  WHERE id = p_decision_id
  FOR UPDATE;
  IF FOUND THEN
    v_existing_payload := jsonb_build_object(
      'designer_client_id', v_decision.designer_client_id,
      'project_id', v_decision.project_id,
      'title', v_decision.title,
      'context', v_decision.context,
      'due_date', v_decision.due_date,
      'linked_phase', v_decision.linked_phase,
      'phase_id', v_decision.phase_id,
      'room_id', v_decision.room_id,
      'section_key', v_decision.section_key,
      'decision_type', v_decision.decision_type,
      'decision_kind', v_decision.decision_kind,
      'coordination_kind', v_decision.coordination_kind,
      'blocking_status', v_decision.blocking_status,
      'blocks_kind', v_decision.blocks_kind,
      'blocks_milestone_id', v_decision.blocks_milestone_id,
      'court', v_decision.court,
      'court_party_id', v_decision.court_party_id,
      'status', v_decision.status
    );
    v_requested_payload := jsonb_build_object(
      'designer_client_id', v_relationship.id,
      'project_id', v_project_id,
      'title', btrim(p_payload->>'title'),
      'context', p_payload->>'context',
      'due_date', NULLIF(p_payload->>'due_date', '')::timestamptz,
      'linked_phase', p_payload->>'linked_phase',
      'phase_id', NULLIF(p_payload->>'phase_id', '')::uuid,
      'room_id', NULLIF(p_payload->>'room_id', '')::uuid,
      'section_key', p_payload->>'section_key',
      'decision_type', COALESCE(NULLIF(p_payload->>'decision_type', ''), 'product'),
      'decision_kind', COALESCE(NULLIF(p_payload->>'decision_kind', ''), 'choice'),
      'coordination_kind', COALESCE(NULLIF(p_payload->>'coordination_kind', ''), 'selection'),
      'blocking_status', COALESCE(NULLIF(p_payload->>'blocking_status', ''), 'non_blocking'),
      'blocks_kind', COALESCE(NULLIF(p_payload->>'blocks_kind', ''), 'none'),
      'blocks_milestone_id', NULLIF(p_payload->>'blocks_milestone_id', '')::uuid,
      'court', COALESCE(NULLIF(p_payload->>'court', ''), 'client'),
      'court_party_id', NULLIF(p_payload->>'court_party_id', '')::uuid,
      'status', v_status
    );

    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'name', option.name,
      'image_url', option.image_url,
      'designer_note', option.designer_note,
      'is_recommended', COALESCE(option.is_recommended, false),
      'price', option.price,
      'quantity', COALESCE(option.quantity, 1),
      'cost_delta_cents', option.cost_delta_cents,
      'lead_time_days_delta', option.lead_time_days_delta,
      'product_id', option.product_id,
      'approves', COALESCE(option.approves, false),
      'sort_order', COALESCE(option.sort_order, 0)
    ) ORDER BY option.sort_order, option.id), '[]'::jsonb)
    INTO v_existing_options
    FROM public.client_decision_options AS option
    WHERE option.decision_id = p_decision_id;

    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'name', btrim(option.value->>'name'),
      'image_url', option.value->>'image_url',
      'designer_note', option.value->>'designer_note',
      'is_recommended', COALESCE((option.value->>'is_recommended')::boolean, false),
      'price', NULLIF(option.value->>'price', '')::integer,
      'quantity', COALESCE(NULLIF(option.value->>'quantity', '')::integer, 1),
      'cost_delta_cents', NULLIF(option.value->>'cost_delta_cents', '')::integer,
      'lead_time_days_delta', NULLIF(option.value->>'lead_time_days_delta', '')::integer,
      'product_id', NULLIF(option.value->>'product_id', '')::uuid,
      'approves', COALESCE((option.value->>'approves')::boolean, false),
      'sort_order', COALESCE(NULLIF(option.value->>'sort_order', '')::integer,
                             option.ordinality::integer - 1)
    ) ORDER BY COALESCE(NULLIF(option.value->>'sort_order', '')::integer,
                        option.ordinality::integer - 1)), '[]'::jsonb)
    INTO v_requested_options
    FROM jsonb_array_elements(COALESCE(p_options, '[]'::jsonb))
         WITH ORDINALITY AS option(value, ordinality);

    SELECT COALESCE(array_agg(item.id ORDER BY item.id), '{}'::uuid[])
    INTO v_existing_ffe_ids
    FROM public.project_ffe_items AS item
    WHERE item.blocked_by_decision_id = p_decision_id;
    SELECT COALESCE(array_agg(DISTINCT id ORDER BY id), '{}'::uuid[])
    INTO v_requested_ffe_ids
    FROM unnest(COALESCE(p_blocked_ffe_item_ids, '{}'::uuid[])) AS id;
    SELECT COALESCE(array_agg(task.id ORDER BY task.id), '{}'::uuid[])
    INTO v_existing_task_ids
    FROM public.project_tasks AS task
    WHERE task.blocked_by_item_id = p_decision_id;
    SELECT COALESCE(array_agg(DISTINCT id ORDER BY id), '{}'::uuid[])
    INTO v_requested_task_ids
    FROM unnest(COALESCE(p_blocked_task_ids, '{}'::uuid[])) AS id;

    IF NOT public._can_author_proposal(v_decision.designer_id)
       OR v_existing_payload IS DISTINCT FROM v_requested_payload
       OR v_existing_options IS DISTINCT FROM v_requested_options
       OR v_existing_ffe_ids IS DISTINCT FROM v_requested_ffe_ids
       OR v_existing_task_ids IS DISTINCT FROM v_requested_task_ids
    THEN
      RAISE EXCEPTION 'p_decision_id was already used for another decision'
        USING ERRCODE = 'serialization_failure';
    END IF;
    IF v_decision.status = 'pending' THEN
      PERFORM public._enqueue_decision_notification(
        p_decision_id, 'decision_required'
      );
    END IF;
    RETURN v_decision;
  END IF;

  PERFORM public.assert_client_decision_reference_integrity(
    p_decision_id,
    v_relationship.id,
    v_relationship.designer_id,
    v_project_id,
    v_status,
    NULLIF(p_payload->>'phase_id', '')::uuid,
    NULLIF(p_payload->>'room_id', '')::uuid,
    NULLIF(p_payload->>'blocks_milestone_id', '')::uuid,
    NULLIF(p_payload->>'court_party_id', '')::uuid,
    NULL,
    NULL
  );

  IF cardinality(COALESCE(p_blocked_ffe_item_ids, '{}'::uuid[])) > 0 THEN
    PERFORM 1
    FROM public.project_ffe_items AS item
    WHERE item.id = ANY(p_blocked_ffe_item_ids)
    ORDER BY item.id
    FOR UPDATE;
    SELECT count(DISTINCT item.id) INTO v_matched_count
    FROM public.project_ffe_items AS item
    WHERE item.id = ANY(p_blocked_ffe_item_ids)
      AND item.project_id IS NOT DISTINCT FROM v_project_id
      AND (item.blocked_by_decision_id IS NULL
           OR item.blocked_by_decision_id = p_decision_id);
    SELECT count(DISTINCT id) INTO v_expected_count
    FROM unnest(p_blocked_ffe_item_ids) AS id;
    IF v_project_id IS NULL OR v_matched_count <> v_expected_count THEN
      RAISE EXCEPTION 'blocked FF&E items must be available in the decision project'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  IF cardinality(COALESCE(p_blocked_task_ids, '{}'::uuid[])) > 0 THEN
    PERFORM 1
    FROM public.project_tasks AS task
    WHERE task.id = ANY(p_blocked_task_ids)
    ORDER BY task.id
    FOR UPDATE;
    SELECT count(DISTINCT task.id) INTO v_matched_count
    FROM public.project_tasks AS task
    WHERE task.id = ANY(p_blocked_task_ids)
      AND task.project_id IS NOT DISTINCT FROM v_project_id
      AND task.status <> 'done'
      AND (task.blocked_by_item_id IS NULL
           OR task.blocked_by_item_id = p_decision_id);
    SELECT count(DISTINCT id) INTO v_expected_count
    FROM unnest(p_blocked_task_ids) AS id;
    IF v_project_id IS NULL OR v_matched_count <> v_expected_count THEN
      RAISE EXCEPTION 'blocked tasks must be open and available in the decision project'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  INSERT INTO public.client_decisions (
    id, designer_client_id, designer_id, project_id, title, context,
    due_date, linked_phase, phase_id, room_id, section_key, decision_type,
    decision_kind, coordination_kind, blocking_status, blocks_kind,
    blocks_milestone_id, court, court_party_id, status, sent_at
  ) VALUES (
    p_decision_id, v_relationship.id, v_relationship.designer_id, v_project_id,
    btrim(p_payload->>'title'), p_payload->>'context',
    NULLIF(p_payload->>'due_date', '')::timestamptz,
    p_payload->>'linked_phase', NULLIF(p_payload->>'phase_id', '')::uuid,
    NULLIF(p_payload->>'room_id', '')::uuid, p_payload->>'section_key',
    COALESCE(NULLIF(p_payload->>'decision_type', ''), 'product'),
    COALESCE(NULLIF(p_payload->>'decision_kind', ''), 'choice'),
    COALESCE(NULLIF(p_payload->>'coordination_kind', ''), 'selection'),
    COALESCE(NULLIF(p_payload->>'blocking_status', ''), 'non_blocking'),
    COALESCE(NULLIF(p_payload->>'blocks_kind', ''), 'none'),
    NULLIF(p_payload->>'blocks_milestone_id', '')::uuid,
    COALESCE(NULLIF(p_payload->>'court', ''), 'client'),
    NULLIF(p_payload->>'court_party_id', '')::uuid,
    v_status, CASE WHEN v_status = 'pending' THEN now() ELSE NULL END
  ) RETURNING * INTO v_decision;

  INSERT INTO public.client_decision_options (
    decision_id, name, image_url, designer_note, is_recommended,
    price, quantity, cost_delta_cents, lead_time_days_delta,
    product_id, approves, configuration_id, selection_snapshot,
    selected, client_note, sort_order
  )
  SELECT
    p_decision_id, btrim(option.value->>'name'), option.value->>'image_url',
    option.value->>'designer_note',
    COALESCE((option.value->>'is_recommended')::boolean, false),
    NULLIF(option.value->>'price', '')::integer,
    COALESCE(NULLIF(option.value->>'quantity', '')::integer, 1),
    NULLIF(option.value->>'cost_delta_cents', '')::integer,
    NULLIF(option.value->>'lead_time_days_delta', '')::integer,
    NULLIF(option.value->>'product_id', '')::uuid,
    COALESCE((option.value->>'approves')::boolean, false),
    NULLIF(option.value->>'configuration_id', '')::uuid,
    -- Never the caller's array verbatim: the client reads this row.
    public._decision_selection_snapshot_safe(option.value->'selection_snapshot'),
    false, NULL,
    COALESCE(NULLIF(option.value->>'sort_order', '')::integer,
             option.ordinality::integer - 1)
  FROM jsonb_array_elements(COALESCE(p_options, '[]'::jsonb))
       WITH ORDINALITY AS option(value, ordinality);

  UPDATE public.project_ffe_items
  SET blocked = true, blocked_by_decision_id = p_decision_id, updated_at = now()
  WHERE id = ANY(COALESCE(p_blocked_ffe_item_ids, '{}'::uuid[]));

  UPDATE public.project_tasks
  SET status = 'blocked', blocked_by_item_id = p_decision_id, updated_at = now()
  WHERE id = ANY(COALESCE(p_blocked_task_ids, '{}'::uuid[]));

  IF v_status = 'pending' THEN
    PERFORM public._enqueue_decision_notification(
      p_decision_id, 'decision_required'
    );
  END IF;

  SELECT * INTO v_decision FROM public.client_decisions
  WHERE id = p_decision_id;
  RETURN v_decision;
END;
$$;

-- ── update_client_decision (live head 00413) ─────────────────────────────
CREATE OR REPLACE FUNCTION public.update_client_decision(
  p_decision_id uuid,
  p_patch jsonb DEFAULT '{}'::jsonb,
  p_options jsonb DEFAULT NULL,
  p_expected_updated_at timestamptz DEFAULT NULL
)
RETURNS public.client_decisions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_decision public.client_decisions%ROWTYPE;
  v_result public.client_decisions%ROWTYPE;
  v_target_project_id uuid;
  v_target_party_id uuid;
  v_relationship_client_id uuid;
  v_unknown jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'update_client_decision requires an authenticated user'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_patch IS NULL OR jsonb_typeof(p_patch) <> 'object' THEN
    RAISE EXCEPTION 'p_patch must be a JSON object'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  v_unknown := p_patch - ARRAY[
    'title', 'context', 'due_date', 'linked_phase', 'phase_id', 'room_id',
    'section_key', 'project_id', 'decision_type', 'decision_kind',
    'coordination_kind', 'blocking_status', 'blocks_kind',
    'blocks_milestone_id', 'court', 'court_party_id'
  ];
  IF v_unknown <> '{}'::jsonb THEN
    RAISE EXCEPTION 'unsupported decision patch keys: %', v_unknown
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  SELECT * INTO v_decision
  FROM public.client_decisions
  WHERE id = p_decision_id
  FOR UPDATE;

  IF NOT FOUND OR NOT public._can_author_proposal(v_decision.designer_id) THEN
    RAISE EXCEPTION 'decision % not found or access denied', p_decision_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF v_decision.status NOT IN ('draft', 'pending') THEN
    RAISE EXCEPTION 'decision % cannot be edited from status %',
      p_decision_id, v_decision.status
      USING ERRCODE = 'check_violation';
  END IF;
  IF v_decision.linked_proposal_id IS NOT NULL THEN
    RAISE EXCEPTION 'proposal approval decisions are signature-workflow only'
      USING ERRCODE = 'check_violation';
  END IF;
  IF p_expected_updated_at IS NULL THEN
    RAISE EXCEPTION 'p_expected_updated_at is required'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;
  IF v_decision.updated_at IS DISTINCT FROM p_expected_updated_at
  THEN
    RAISE EXCEPTION 'decision % changed since it was loaded', p_decision_id
      USING ERRCODE = 'serialization_failure';
  END IF;

  IF p_patch ? 'title'
     AND btrim(COALESCE(p_patch->>'title', '')) = ''
  THEN
    RAISE EXCEPTION 'decision title is required'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT client_id INTO v_relationship_client_id
  FROM public.designer_clients
  WHERE id = v_decision.designer_client_id;

  v_target_project_id := CASE
    WHEN p_patch ? 'project_id' THEN NULLIF(p_patch->>'project_id', '')::uuid
    ELSE v_decision.project_id
  END;

  -- A decision's dependency web, room/phase references, and notification
  -- history are project-scoped. Moving the parent without atomically moving
  -- every one of those children creates cross-project blockers. Accept an
  -- echoed project_id from edit forms, but make actual project identity
  -- immutable after creation.
  IF v_target_project_id IS DISTINCT FROM v_decision.project_id THEN
    RAISE EXCEPTION 'decision project is immutable after creation'
      USING ERRCODE = 'check_violation';
  END IF;

  IF p_patch ? 'project_id'
     AND v_target_project_id IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM public.projects AS project
       WHERE project.id = v_target_project_id
         AND project.designer_id IS NOT DISTINCT FROM v_decision.designer_id
         AND project.client_id IS NOT DISTINCT FROM v_relationship_client_id
     )
  THEN
    RAISE EXCEPTION
      'decision project must match its exact designer/client relationship'
      USING ERRCODE = 'check_violation';
  END IF;

  v_target_party_id := CASE
    WHEN p_patch ? 'court_party_id'
      THEN NULLIF(p_patch->>'court_party_id', '')::uuid
    ELSE v_decision.court_party_id
  END;
  IF v_target_party_id IS NOT NULL
     AND (
       v_target_project_id IS NULL
       OR NOT EXISTS (
         SELECT 1 FROM public.project_parties AS party
         WHERE party.id = v_target_party_id
           AND party.project_id = v_target_project_id
       )
     )
  THEN
    RAISE EXCEPTION 'court party must belong to the decision project'
      USING ERRCODE = 'check_violation';
  END IF;

  IF p_options IS NOT NULL THEN
    IF jsonb_typeof(p_options) <> 'array' THEN
      RAISE EXCEPTION 'p_options must be a JSON array'
        USING ERRCODE = 'invalid_parameter_value';
    END IF;
    IF EXISTS (
      SELECT 1
      FROM jsonb_array_elements(p_options) AS option(value)
      WHERE jsonb_typeof(option.value) <> 'object'
         OR btrim(COALESCE(option.value->>'name', '')) = ''
    ) THEN
      RAISE EXCEPTION 'every decision option requires a name'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  PERFORM set_config('app.client_decision_write_id', p_decision_id::text, true);

  UPDATE public.client_decisions
  SET title = CASE WHEN p_patch ? 'title' THEN btrim(p_patch->>'title') ELSE title END,
      context = CASE WHEN p_patch ? 'context' THEN p_patch->>'context' ELSE context END,
      due_date = CASE WHEN p_patch ? 'due_date'
        THEN NULLIF(p_patch->>'due_date', '')::timestamptz ELSE due_date END,
      linked_phase = CASE WHEN p_patch ? 'linked_phase'
        THEN p_patch->>'linked_phase' ELSE linked_phase END,
      phase_id = CASE WHEN p_patch ? 'phase_id'
        THEN NULLIF(p_patch->>'phase_id', '')::uuid ELSE phase_id END,
      room_id = CASE WHEN p_patch ? 'room_id'
        THEN NULLIF(p_patch->>'room_id', '')::uuid ELSE room_id END,
      section_key = CASE WHEN p_patch ? 'section_key'
        THEN p_patch->>'section_key' ELSE section_key END,
      project_id = v_target_project_id,
      decision_type = CASE WHEN p_patch ? 'decision_type'
        THEN p_patch->>'decision_type' ELSE decision_type END,
      decision_kind = CASE WHEN p_patch ? 'decision_kind'
        THEN p_patch->>'decision_kind' ELSE decision_kind END,
      coordination_kind = CASE WHEN p_patch ? 'coordination_kind'
        THEN p_patch->>'coordination_kind' ELSE coordination_kind END,
      blocking_status = CASE WHEN p_patch ? 'blocking_status'
        THEN p_patch->>'blocking_status' ELSE blocking_status END,
      blocks_kind = CASE WHEN p_patch ? 'blocks_kind'
        THEN p_patch->>'blocks_kind' ELSE blocks_kind END,
      blocks_milestone_id = CASE WHEN p_patch ? 'blocks_milestone_id'
        THEN NULLIF(p_patch->>'blocks_milestone_id', '')::uuid
        ELSE blocks_milestone_id END,
      court = CASE WHEN p_patch ? 'court' THEN p_patch->>'court' ELSE court END,
      court_party_id = v_target_party_id,
      updated_at = now()
  WHERE id = p_decision_id;

  IF p_options IS NOT NULL THEN
    DELETE FROM public.client_decision_options
    WHERE decision_id = p_decision_id;

    INSERT INTO public.client_decision_options (
      decision_id, name, image_url, designer_note, is_recommended,
      price, quantity, cost_delta_cents, lead_time_days_delta,
      product_id, approves, configuration_id, selection_snapshot,
      selected, client_note, sort_order
    )
    SELECT
      p_decision_id,
      btrim(option.value->>'name'),
      option.value->>'image_url',
      option.value->>'designer_note',
      COALESCE((option.value->>'is_recommended')::boolean, false),
      NULLIF(option.value->>'price', '')::integer,
      COALESCE(NULLIF(option.value->>'quantity', '')::integer, 1),
      NULLIF(option.value->>'cost_delta_cents', '')::integer,
      NULLIF(option.value->>'lead_time_days_delta', '')::integer,
      NULLIF(option.value->>'product_id', '')::uuid,
      COALESCE((option.value->>'approves')::boolean, false),
      NULLIF(option.value->>'configuration_id', '')::uuid,
      -- Never the caller's array verbatim: the client reads this row.
      public._decision_selection_snapshot_safe(option.value->'selection_snapshot'),
      false,
      NULL,
      COALESCE(NULLIF(option.value->>'sort_order', '')::integer,
               option.ordinality::integer - 1)
    FROM jsonb_array_elements(p_options) WITH ORDINALITY AS option(value, ordinality);
  END IF;

  PERFORM set_config('app.client_decision_write_id', '', true);
  SELECT * INTO v_result FROM public.client_decisions WHERE id = p_decision_id;

  PERFORM public.assert_client_decision_reference_integrity(
    v_result.id,
    v_result.designer_client_id,
    v_result.designer_id,
    v_result.project_id,
    v_result.status,
    v_result.phase_id,
    v_result.room_id,
    v_result.blocks_milestone_id,
    v_result.court_party_id,
    v_result.linked_proposal_id,
    v_result.recommended_option_id
  );

  IF v_result.status = 'pending'
     AND (p_patch <> '{}'::jsonb OR p_options IS NOT NULL)
  THEN
    PERFORM public._enqueue_decision_notification(
      p_decision_id, 'decision_updated'
    );
  END IF;
  RETURN v_result;
END;
$$;

-- ── Grants re-asserted exactly as 00403/00399/00413 wrote them ─────────────
-- CREATE OR REPLACE keeps an existing function's ACL, so these are re-asserts,
-- not changes. The new helper follows _configuration_com_color_fabric's
-- posture: internal to the definer RPCs, never a caller-facing entry point.
REVOKE EXECUTE ON FUNCTION public._decision_selection_snapshot_safe(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._decision_selection_snapshot_safe(jsonb) TO service_role;

REVOKE EXECUTE ON FUNCTION public.save_product_configuration(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_product_configuration(jsonb) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.promote_configuration_to_library(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.promote_configuration_to_library(uuid, text) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.create_client_decision(
  uuid, jsonb, jsonb, uuid[], uuid[]
) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.create_client_decision(
  uuid, jsonb, jsonb, uuid[], uuid[]
) TO authenticated;

REVOKE ALL ON FUNCTION public.update_client_decision(uuid, jsonb, jsonb, timestamptz)
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.update_client_decision(uuid, jsonb, jsonb, timestamptz)
  TO authenticated;

COMMENT ON FUNCTION public.promote_configuration_to_library(uuid, text) IS
  'Promotes an approved configuration into a reusable library template. The promoted snapshot is scrubbed of the source project''s custom commission and COM fabric and re-hashed, so a template carries only what is safe to reuse.';
