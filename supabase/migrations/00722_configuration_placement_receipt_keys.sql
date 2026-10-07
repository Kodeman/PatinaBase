-- ═══════════════════════════════════════════════════════════════════════════
-- 00722 — Configured placement reads the v2 placement receipt (SQ-457, US-17)
--
-- Regression: 00439 re-pointed the N-1 public.place_product_in_project at
-- place_product_in_project_v2, whose receipt is {outcome, selectionId, ...}.
-- The configured-placement body (00413, renamed to
-- _place_product_configuration_in_project_impl by 00462) still read
-- v_place->>'ffeItemId' and v_place->>'specId', both now NULL. So since 00439 a
-- configured placement left product_configurations.ffe_item_id NULL, never
-- priced the FF&E line, and never bound or locked the approved snapshot on the
-- project_ffe_specs row, while still marking a custom revision and its
-- configuration 'issued'. Caught by supabase/tests/library/
-- product_configuration_test.sql ("issued cabinetry must lock the exact
-- approved snapshot on the FF&E spec").
--
-- Lineage: 00403 → 00413 → 00462 (rename only) → this file. Body copied
-- verbatim from 00413 (identical to the live prosrc); only the two receipt
-- reads change: item id falls back to selectionId, spec id falls back to the
-- line's one spec row (project_ffe_specs_ffe_item_id_key).
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

CREATE OR REPLACE FUNCTION public._place_product_configuration_in_project_impl(
  p_project_id uuid,
  p_configuration_id uuid,
  p_room_id uuid DEFAULT NULL,
  p_slot_id uuid DEFAULT NULL,
  p_category text DEFAULT NULL,
  p_source jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_configuration public.product_configurations;
  v_product public.products;
  v_project public.projects;
  v_source_configuration_id uuid;
  v_custom_revision public.custom_commission_revisions;
  v_place jsonb;
  v_instantiation jsonb;
  v_item_id uuid;
  v_spec_id uuid;
BEGIN
  IF NOT public._can_access_product_configuration(p_configuration_id) THEN
    RAISE EXCEPTION 'configuration not found or not accessible' USING errcode = 'insufficient_privilege';
  END IF;
  SELECT * INTO STRICT v_configuration
  FROM public.product_configurations WHERE id = p_configuration_id FOR UPDATE;
  SELECT * INTO STRICT v_product FROM public.products WHERE id = v_configuration.product_id;
  IF v_configuration.project_id IS NULL THEN
    v_source_configuration_id := v_configuration.id;
    IF v_configuration.is_library_template THEN
      v_instantiation := public.instantiate_product_configuration_template(
        v_configuration.id, p_project_id, v_configuration.name
      );
      SELECT * INTO STRICT v_configuration
      FROM public.product_configurations
      WHERE id = (v_instantiation#>>'{configuration,id}')::uuid
      FOR UPDATE;
    ELSE
      IF v_product.configuration_mode = 'custom' THEN
        RAISE EXCEPTION 'projectless custom configurations must be promoted and explicitly instantiated before approval'
          USING errcode = 'object_not_in_prerequisite_state';
      END IF;
      SELECT * INTO v_project FROM public.projects WHERE id = p_project_id FOR SHARE;
      IF NOT FOUND OR NOT public.is_design_studio_comember(v_project.designer_id) THEN
        RAISE EXCEPTION 'project not found or not accessible' USING errcode = 'insufficient_privilege';
      END IF;
      INSERT INTO public.product_configurations (
        configuration_key, product_id, product_variant_id, previous_configuration_id,
        project_id, owner_user_id, studio_id, version, schema_revision,
        status, name, notes, custom_brief, normalized_selection, component_quantities,
        evaluation, snapshot, snapshot_hash, is_complete, is_valid,
        retail_price_cents, trade_price_cents, lead_time_weeks, resolved_dimensions
      ) VALUES (
        extensions.gen_random_uuid(), v_configuration.product_id,
        v_configuration.product_variant_id, v_source_configuration_id,
        p_project_id, auth.uid(),
        COALESCE(v_project.studio_id, public._primary_studio_for(v_project.designer_id)),
        1, v_configuration.schema_revision, 'saved', v_configuration.name,
        v_configuration.notes, NULL, v_configuration.normalized_selection,
        v_configuration.component_quantities, v_configuration.evaluation,
        v_configuration.snapshot, v_configuration.snapshot_hash,
        v_configuration.is_complete, v_configuration.is_valid,
        v_configuration.retail_price_cents, v_configuration.trade_price_cents,
        v_configuration.lead_time_weeks, v_configuration.resolved_dimensions
      ) RETURNING * INTO v_configuration;
      INSERT INTO public.product_configuration_selections (
        configuration_id, option_group_id, option_value_id, selection_snapshot
      )
      SELECT v_configuration.id, option_group_id, option_value_id, selection_snapshot
      FROM public.product_configuration_selections
      WHERE configuration_id = v_source_configuration_id;
      INSERT INTO public.product_configuration_components (
        configuration_id, component_id, quantity, handedness, component_snapshot
      )
      SELECT v_configuration.id, component_id, quantity, handedness, component_snapshot
      FROM public.product_configuration_components
      WHERE configuration_id = v_source_configuration_id;
    END IF;
  END IF;
  IF NOT v_configuration.is_valid OR NOT v_configuration.is_complete THEN
    RAISE EXCEPTION 'configuration must be valid and complete before placement'
      USING errcode = 'object_not_in_prerequisite_state';
  END IF;
  IF v_configuration.project_id IS NOT NULL AND v_configuration.project_id <> p_project_id THEN
    RAISE EXCEPTION 'configuration belongs to another project' USING errcode = 'check_violation';
  END IF;

  IF v_product.configuration_mode = 'custom' THEN
    IF v_configuration.status <> 'approved' THEN
      RAISE EXCEPTION 'custom configuration must be approved before placement'
        USING errcode = 'object_not_in_prerequisite_state';
    END IF;
    SELECT * INTO v_custom_revision
    FROM public.custom_commission_revisions
    WHERE configuration_id = v_configuration.id
    ORDER BY revision_number DESC LIMIT 1 FOR UPDATE;
    IF NOT FOUND OR v_custom_revision.status <> 'approved'
       OR v_custom_revision.brief#>>'{designerApproval,status}' <> 'approved'
       OR v_custom_revision.brief#>>'{clientApproval,status}' <> 'approved' THEN
      RAISE EXCEPTION 'latest custom commission revision needs designer and client approval'
        USING errcode = 'object_not_in_prerequisite_state';
    END IF;
  END IF;

  v_place := public.place_product_in_project(
    p_project_id, v_configuration.product_id, p_room_id, p_slot_id, p_category,
    COALESCE(p_source, '{}'::jsonb) || jsonb_build_object(
      'configurationId', v_configuration.id,
      'configurationVersion', v_configuration.version,
      'configurationSnapshotHash', v_configuration.snapshot_hash
    )
  );
  -- 00722: since 00439 place_product_in_project returns the v2 receipt
  -- ({outcome, selectionId}); ffeItemId/specId no longer exist.
  v_item_id := COALESCE(v_place->>'ffeItemId', v_place->>'selectionId')::uuid;
  v_spec_id := COALESCE((v_place->>'specId')::uuid, (
    SELECT spec.id FROM public.project_ffe_specs AS spec WHERE spec.ffe_item_id = v_item_id
  ));

  UPDATE public.product_configurations
  SET ffe_item_id = v_item_id, updated_at = now()
  WHERE id = v_configuration.id
    AND (ffe_item_id IS NULL OR ffe_item_id = v_item_id)
  RETURNING * INTO v_configuration;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'configuration is already bound to another FF&E line'
      USING errcode = 'object_not_in_prerequisite_state';
  END IF;

  UPDATE public.project_ffe_items
  SET trade_price_cents = COALESCE(v_configuration.trade_price_cents,
        v_configuration.retail_price_cents, trade_price_cents),
      unit_price_cents = COALESCE(v_configuration.retail_price_cents,
        v_configuration.trade_price_cents, unit_price_cents),
      line_total_cents = quantity * COALESCE(v_configuration.retail_price_cents,
        v_configuration.trade_price_cents, unit_price_cents, 0),
      updated_at = now()
  WHERE id = v_item_id;

  PERFORM set_config('patina.configuration_spec_workflow', '00403', true);
  UPDATE public.project_ffe_specs
  SET configuration_id = v_configuration.id,
      configuration_snapshot = v_configuration.snapshot,
      configuration_snapshot_hash = v_configuration.snapshot_hash,
      configuration_locked_at = CASE
        WHEN v_configuration.status IN ('approved', 'issued')
          OR v_product.configuration_mode = 'custom' THEN now()
        ELSE NULL
      END,
      selected_dimensions = v_configuration.resolved_dimensions,
      sku = COALESCE(NULLIF(v_configuration.snapshot#>>'{variant,vendorSku}', ''),
        NULLIF(v_configuration.snapshot#>>'{variant,sku}', ''), sku),
      material = COALESCE((
        SELECT string_agg(selection->>'valueLabel', ', ' ORDER BY ordinality)
        FROM jsonb_array_elements(COALESCE(v_configuration.snapshot->'selections', '[]'::jsonb))
             WITH ORDINALITY AS chosen(selection, ordinality)
        WHERE lower(selection->>'groupCode') = 'material'
      ), material),
      finish = COALESCE((
        SELECT string_agg(selection->>'valueLabel', ', ' ORDER BY ordinality)
        FROM jsonb_array_elements(COALESCE(v_configuration.snapshot->'selections', '[]'::jsonb))
             WITH ORDINALITY AS chosen(selection, ordinality)
        WHERE lower(selection->>'groupCode') = 'finish'
      ), finish),
      color_fabric = COALESCE(NULLIF(public._configuration_com_color_fabric(
        COALESCE(v_configuration.com_details, v_configuration.snapshot->'comDetails')), ''), color_fabric),
      routing_source = routing_source || jsonb_build_object(
        'configurationVersion', v_configuration.version,
        'configurationSnapshotHash', v_configuration.snapshot_hash
      ),
      updated_by = auth.uid(),
      updated_at = now()
  WHERE id = v_spec_id;
  PERFORM set_config('patina.configuration_spec_workflow', '', true);

  IF v_product.configuration_mode = 'custom' THEN
    UPDATE public.custom_commission_revisions
    SET status = 'issued', issued_at = now(), transition_note = 'Issued with project specification', updated_at = now()
    WHERE id = v_custom_revision.id;
    UPDATE public.product_configurations
    SET status = 'issued', issued_at = now(), updated_at = now()
    WHERE id = v_configuration.id;
  END IF;

  RETURN v_place || jsonb_build_object(
    'productId', v_configuration.product_id,
    'configurationId', v_configuration.id,
    'configurationVersion', v_configuration.version,
    'configurationSnapshotHash', v_configuration.snapshot_hash,
    'configurationLockedAt', (SELECT configuration_locked_at FROM public.project_ffe_specs WHERE id = v_spec_id)
  );
END;
$$;

-- Unchanged from 00462: the impl stays private behind the public wrapper.
REVOKE ALL ON FUNCTION public._place_product_configuration_in_project_impl(uuid, uuid, uuid, uuid, text, jsonb)
  FROM PUBLIC, anon, authenticated, service_role;

COMMIT;
