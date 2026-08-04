-- ═══════════════════════════════════════════════════════════════════════════
-- 00413 — COM/COL support and decision-carried selections
--
-- Two additions to the 00403 furniture-configuration domain, plus the bridge
-- that lets a client decision carry a real configuration selection instead of
-- a hand-typed price delta.
--
-- P1-4 COM/COL: an option value may declare itself customer's-own-material
-- (allows_com) with vendor requirements (com_requirements); one saved
-- configuration records the fabric that was actually specified
-- (product_configurations.com_details). COM is merged into the configuration
-- snapshot BEFORE hashing, so the immutable snapshot/hash — and therefore the
-- PO, the RFQ, and the issued spec book — cover the fabric too. The three
-- specification writers each denormalize a vendor-readable fabric line onto
-- project_ffe_specs.color_fabric, which no writer set before.
--
-- P1-6 decisions bridge: client_decision_options gains configuration_id
-- (provenance) and selection_snapshot (an array of snapshot-vocabulary
-- selection entries). When a winning option carries selections, the existing
-- FF&E feed-through also lands material/finish/color_fabric on the auto-created
-- specification row — never on a locked one, and never touching the gated
-- configuration_* columns.
--
-- Function lineage (whole bodies copied verbatim from the live heads, then
-- edited — see the RPC head-body discipline in patina-db-migrations):
--   00403 → 00413  get_product_configuration_schema
--   00403 → 00413  upsert_product_configuration_schema
--   00403 → 00413  evaluate_product_configuration
--   00403 → 00413  save_product_configuration
--   00403 → 00413  place_product_configuration_in_project
--   00403 → 00413  guard_project_ffe_configuration_integrity
--   00403 → 00413  revise_project_ffe_configuration
--   00399 → 00413  create_client_decision
--   00399 → 00413  update_client_decision
--   00399 → 00413  _apply_client_decision_authorized
--
-- Snapshot-shape note: evaluate now emits `allowsCom` on every selection, so
-- newly evaluated snapshots hash differently than pre-00413 ones. Stored
-- snapshots and their stored hashes are untouched, and every integrity check
-- recomputes from the stored snapshot, so no existing configuration breaks.
--
-- Adds GRANT/REVOKE → regenerate seed/00-legacy-grants.sql.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── P1-4 COM/COL columns ───────────────────────────────────────────────────
ALTER TABLE public.product_option_values
  ADD COLUMN IF NOT EXISTS allows_com boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS com_requirements jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.product_option_values
  DROP CONSTRAINT IF EXISTS product_option_values_com_requirements_check;
ALTER TABLE public.product_option_values
  ADD CONSTRAINT product_option_values_com_requirements_check
  CHECK (jsonb_typeof(com_requirements) = 'object');

COMMENT ON COLUMN public.product_option_values.allows_com IS
  'True when choosing this option value means the client supplies the material (COM/COL). Carried into every configuration selection snapshot so the PO and RFQ can say so.';
COMMENT ON COLUMN public.product_option_values.com_requirements IS
  'Vendor requirements for a COM/COL value — yardage, railroading, ship-to, sidemark expectations. Authoring surface only; the specified fabric lives on product_configurations.com_details.';

ALTER TABLE public.product_configurations
  ADD COLUMN IF NOT EXISTS com_details jsonb;

ALTER TABLE public.product_configurations
  DROP CONSTRAINT IF EXISTS product_configurations_com_details_check;
ALTER TABLE public.product_configurations
  ADD CONSTRAINT product_configurations_com_details_check
  CHECK (com_details IS NULL OR jsonb_typeof(com_details) = 'object');

COMMENT ON COLUMN public.product_configurations.com_details IS
  'The customer''s-own-material fabric actually specified on this configuration version: {optionValueId, fabricName, mill, pattern, yardage, railroaded, shipTo, sidemark, secondLeadTimeWeeks, notes}. Merged into the snapshot before hashing, so it is part of the immutable commercial truth.';

-- ── P1-6 decision-carried selection columns ────────────────────────────────
ALTER TABLE public.client_decision_options
  ADD COLUMN IF NOT EXISTS configuration_id uuid
    REFERENCES public.product_configurations(id) ON DELETE SET NULL;
ALTER TABLE public.client_decision_options
  ADD COLUMN IF NOT EXISTS selection_snapshot jsonb;

ALTER TABLE public.client_decision_options
  DROP CONSTRAINT IF EXISTS client_decision_options_selection_snapshot_check;
ALTER TABLE public.client_decision_options
  ADD CONSTRAINT client_decision_options_selection_snapshot_check
  CHECK (selection_snapshot IS NULL OR jsonb_typeof(selection_snapshot) = 'array');

COMMENT ON COLUMN public.client_decision_options.configuration_id IS
  'Provenance link to the saved product configuration this decision option was generated from. SET NULL on configuration deletion; never a commercial dependency.';
COMMENT ON COLUMN public.client_decision_options.selection_snapshot IS
  'Array of snapshot-vocabulary selection entries ({optionGroupId, optionValueId, groupCode, valueCode, groupName, valueLabel, ...}) describing what winning this option actually specifies. Applied to the FF&E specification flat fields when the option wins.';

-- ── COM composite used by all three specification writers ──────────────────
CREATE OR REPLACE FUNCTION public._configuration_com_color_fabric(p_com_details jsonb)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN NULLIF(btrim(COALESCE(p_com_details->>'fabricName', '')), '') IS NULL THEN NULL
    ELSE btrim(p_com_details->>'fabricName')
      || COALESCE(' — ' || NULLIF(concat_ws(' · ',
           NULLIF(btrim(COALESCE(p_com_details->>'mill', '')), ''),
           NULLIF(btrim(COALESCE(p_com_details->>'pattern', '')), '')
         ), ''), '')
  END
$$;

COMMENT ON FUNCTION public._configuration_com_color_fabric(jsonb) IS
  'Vendor-readable COM fabric line for project_ffe_specs.color_fabric: fabric name, then " — mill · pattern" when those are known. NULL when no fabric was named.';

-- ── Definition authoring: COM flags round-trip through the schema RPCs ────
CREATE OR REPLACE FUNCTION public.get_product_configuration_schema(p_product_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_product public.products;
BEGIN
  IF NOT public._can_read_configurable_product(p_product_id) THEN
    RAISE EXCEPTION 'product not found or not accessible'
      USING errcode = 'insufficient_privilege';
  END IF;
  SELECT * INTO STRICT v_product FROM public.products WHERE id = p_product_id;

  RETURN jsonb_build_object(
    'productId', v_product.id,
    'productName', v_product.name,
    'mode', v_product.configuration_mode,
    'pricingStrategy', v_product.configuration_pricing_strategy,
    'revision', v_product.configuration_revision,
    'baseRetailPriceCents', v_product.price_retail,
    'baseTradePriceCents', v_product.price_trade,
    'baseLeadTimeWeeks', v_product.lead_time_weeks,
    'baseDimensions', v_product.dimensions,
    'summary', v_product.configuration_summary,
    'optionGroups', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', g.id,
          'productId', g.product_id,
          'code', g.code,
          'name', g.name,
          'description', g.description,
          'selectionType', g.selection_type,
          'required', g.required,
          'minSelections', g.min_selections,
          'maxSelections', g.max_selections,
          'position', g.position,
          'values', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
              'id', v.id,
              'groupId', v.option_group_id,
              'code', v.code,
              'label', v.label,
              'description', v.description,
              'swatch', v.swatch,
              'media', v.media,
              'retailPriceDeltaCents', v.retail_price_delta_cents,
              'tradePriceDeltaCents', v.trade_price_delta_cents,
              'leadTimeDeltaWeeks', v.lead_time_delta_weeks,
              'allowsCom', v.allows_com,
              'comRequirements', v.com_requirements,
              'metadata', v.metadata,
              'position', v.position,
              'isActive', v.is_active
            ) ORDER BY v.position, v.label)
            FROM public.product_option_values v
            WHERE v.option_group_id = g.id
          ), '[]'::jsonb)
        ) ORDER BY g.position, g.name
      )
      FROM public.product_option_groups g
      WHERE g.product_id = p_product_id
    ), '[]'::jsonb),
    'variants', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', v.id,
        'productId', v.product_id,
        'code', v.code,
        'name', v.name,
        'sku', v.sku,
        'vendorSku', v.vendor_sku,
        'status', v.status,
        'retailPriceCents', v.retail_price_cents,
        'tradePriceCents', v.trade_price_cents,
        'leadTimeWeeks', v.lead_time_weeks,
        'dimensions', v.dimensions,
        'weight', v.weight,
        'metadata', v.metadata,
        'isDefault', v.is_default,
        'optionValueIds', COALESCE((
          SELECT jsonb_agg(vv.option_value_id ORDER BY vv.option_value_id)
          FROM public.product_variant_values vv WHERE vv.variant_id = v.id
        ), '[]'::jsonb)
      ) ORDER BY v.name)
      FROM public.product_variants v WHERE v.product_id = p_product_id
    ), '[]'::jsonb),
    'components', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', c.id,
        'productId', c.product_id,
        'code', c.code,
        'name', c.name,
        'description', c.description,
        'componentType', c.component_type,
        'handedness', c.handedness,
        'minQuantity', c.min_quantity,
        'maxQuantity', c.max_quantity,
        'defaultQuantity', c.default_quantity,
        'retailPriceCents', c.retail_price_cents,
        'tradePriceCents', c.trade_price_cents,
        'leadTimeWeeks', c.lead_time_weeks,
        'dimensions', c.dimensions,
        'metadata', c.metadata,
        'position', c.position,
        'isActive', c.is_active
      ) ORDER BY c.position, c.name)
      FROM public.product_components c WHERE c.product_id = p_product_id
    ), '[]'::jsonb),
    'rules', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', r.id,
        'productId', r.product_id,
        'code', r.code,
        'name', r.name,
        'ruleType', r.rule_type,
        'condition', r.condition,
        'effect', r.effect,
        'message', r.message,
        'priority', r.priority,
        'isActive', r.is_active
      ) ORDER BY r.priority, r.code)
      FROM public.product_configuration_rules r WHERE r.product_id = p_product_id
    ), '[]'::jsonb)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.upsert_product_configuration_schema(
  p_product_id uuid,
  p_input jsonb,
  p_expected_revision integer DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_product public.products;
  v_group jsonb;
  v_value jsonb;
  v_variant jsonb;
  v_component jsonb;
  v_rule jsonb;
  v_group_id uuid;
  v_value_id uuid;
  v_variant_id uuid;
  v_component_id uuid;
  v_rule_id uuid;
  v_ref text;
  v_ref_id uuid;
  v_seen_groups uuid[] := '{}'::uuid[];
  v_seen_values uuid[] := '{}'::uuid[];
  v_seen_variants uuid[] := '{}'::uuid[];
  v_seen_components uuid[] := '{}'::uuid[];
  v_seen_rules uuid[] := '{}'::uuid[];
BEGIN
  IF p_input IS NULL OR jsonb_typeof(p_input) <> 'object' THEN
    RAISE EXCEPTION 'definition input must be a JSON object'
      USING errcode = 'check_violation';
  END IF;
  IF NOT public._can_manage_configurable_product(p_product_id) THEN
    RAISE EXCEPTION 'product not found or not editable'
      USING errcode = 'insufficient_privilege';
  END IF;

  SELECT * INTO STRICT v_product
  FROM public.products WHERE id = p_product_id FOR UPDATE;
  IF p_expected_revision IS NOT NULL
     AND p_expected_revision <> v_product.configuration_revision THEN
    RAISE EXCEPTION 'configuration definition changed in another session (expected %, current %)',
      p_expected_revision, v_product.configuration_revision
      USING errcode = 'serialization_failure';
  END IF;
  IF COALESCE(p_input->>'mode', '') NOT IN ('standard', 'variant', 'configured', 'custom') THEN
    RAISE EXCEPTION 'invalid configuration mode' USING errcode = 'check_violation';
  END IF;
  IF COALESCE(p_input->>'pricingStrategy', 'base_plus_adjustments')
     NOT IN ('base_plus_adjustments', 'component_sum') THEN
    RAISE EXCEPTION 'invalid pricing strategy' USING errcode = 'check_violation';
  END IF;
  IF jsonb_typeof(COALESCE(p_input->'optionGroups', '[]'::jsonb)) <> 'array'
     OR jsonb_typeof(COALESCE(p_input->'variants', '[]'::jsonb)) <> 'array'
     OR jsonb_typeof(COALESCE(p_input->'components', '[]'::jsonb)) <> 'array'
     OR jsonb_typeof(COALESCE(p_input->'rules', '[]'::jsonb)) <> 'array' THEN
    RAISE EXCEPTION 'definition collections must be arrays' USING errcode = 'check_violation';
  END IF;
  IF p_input->>'mode' IN ('standard', 'custom') AND (
       jsonb_array_length(COALESCE(p_input->'optionGroups', '[]'::jsonb)) > 0
       OR jsonb_array_length(COALESCE(p_input->'variants', '[]'::jsonb)) > 0
       OR jsonb_array_length(COALESCE(p_input->'components', '[]'::jsonb)) > 0
       OR jsonb_array_length(COALESCE(p_input->'rules', '[]'::jsonb)) > 0
     ) THEN
    RAISE EXCEPTION '% mode cannot retain option groups, variants, components, or rules', p_input->>'mode'
      USING errcode = 'check_violation';
  END IF;
  IF p_input->>'mode' = 'variant'
     AND jsonb_array_length(COALESCE(p_input->'components', '[]'::jsonb)) > 0 THEN
    RAISE EXCEPTION 'variant mode cannot retain modular components'
      USING errcode = 'check_violation';
  END IF;
  IF p_input->>'mode' = 'configured'
     AND jsonb_array_length(COALESCE(p_input->'variants', '[]'::jsonb)) > 0 THEN
    RAISE EXCEPTION 'configured mode cannot retain exact variants'
      USING errcode = 'check_violation';
  END IF;
  IF COALESCE(p_input->>'pricingStrategy', 'base_plus_adjustments') = 'component_sum'
     AND p_input->>'mode' <> 'configured' THEN
    RAISE EXCEPTION 'component_sum pricing requires configured mode'
      USING errcode = 'check_violation';
  END IF;

  UPDATE public.products
  SET configuration_mode = p_input->>'mode',
      configuration_pricing_strategy = COALESCE(p_input->>'pricingStrategy', 'base_plus_adjustments'),
      configuration_revision = configuration_revision + 1,
      configuration_updated_at = now(),
      updated_at = now()
  WHERE id = p_product_id;

  FOR v_group IN SELECT value FROM jsonb_array_elements(COALESCE(p_input->'optionGroups', '[]'::jsonb)) LOOP
    IF jsonb_typeof(v_group) <> 'object' OR COALESCE(v_group->>'code', '') = '' THEN
      RAISE EXCEPTION 'every option group needs a code' USING errcode = 'check_violation';
    END IF;
    INSERT INTO public.product_option_groups (
      id, product_id, code, name, description, selection_type, required,
      min_selections, max_selections, position
    ) VALUES (
      CASE WHEN COALESCE(v_group->>'id', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        THEN (v_group->>'id')::uuid ELSE extensions.gen_random_uuid() END,
      p_product_id, v_group->>'code', COALESCE(v_group->>'name', v_group->>'code'),
      v_group->>'description', COALESCE(v_group->>'selectionType', 'single'),
      COALESCE((v_group->>'required')::boolean, true),
      COALESCE((v_group->>'minSelections')::integer, CASE WHEN COALESCE((v_group->>'required')::boolean, true) THEN 1 ELSE 0 END),
      COALESCE((v_group->>'maxSelections')::integer, 1),
      COALESCE((v_group->>'position')::integer, 0)
    )
    ON CONFLICT (product_id, code) DO UPDATE SET
      name = EXCLUDED.name,
      description = EXCLUDED.description,
      selection_type = EXCLUDED.selection_type,
      required = EXCLUDED.required,
      min_selections = EXCLUDED.min_selections,
      max_selections = EXCLUDED.max_selections,
      position = EXCLUDED.position,
      updated_at = now()
    RETURNING id INTO v_group_id;
    v_seen_groups := array_append(v_seen_groups, v_group_id);

    IF jsonb_typeof(COALESCE(v_group->'values', '[]'::jsonb)) <> 'array' THEN
      RAISE EXCEPTION 'option group values must be an array' USING errcode = 'check_violation';
    END IF;
    FOR v_value IN SELECT value FROM jsonb_array_elements(COALESCE(v_group->'values', '[]'::jsonb)) LOOP
      INSERT INTO public.product_option_values (
        id, option_group_id, code, label, description, swatch, media,
        retail_price_delta_cents, trade_price_delta_cents, lead_time_delta_weeks,
        allows_com, com_requirements,
        metadata, position, is_active
      ) VALUES (
        CASE WHEN COALESCE(v_value->>'id', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
          THEN (v_value->>'id')::uuid ELSE extensions.gen_random_uuid() END,
        v_group_id, v_value->>'code', COALESCE(v_value->>'label', v_value->>'code'),
        v_value->>'description', v_value->'swatch', COALESCE(v_value->'media', '[]'::jsonb),
        COALESCE((v_value->>'retailPriceDeltaCents')::integer, 0),
        COALESCE((v_value->>'tradePriceDeltaCents')::integer, 0),
        COALESCE((v_value->>'leadTimeDeltaWeeks')::integer, 0),
        COALESCE((v_value->>'allowsCom')::boolean, false),
        COALESCE(v_value->'comRequirements', '{}'::jsonb),
        COALESCE(v_value->'metadata', '{}'::jsonb),
        COALESCE((v_value->>'position')::integer, 0),
        COALESCE((v_value->>'isActive')::boolean, true)
      )
      ON CONFLICT (option_group_id, code) DO UPDATE SET
        label = EXCLUDED.label,
        description = EXCLUDED.description,
        swatch = EXCLUDED.swatch,
        media = EXCLUDED.media,
        retail_price_delta_cents = EXCLUDED.retail_price_delta_cents,
        trade_price_delta_cents = EXCLUDED.trade_price_delta_cents,
        lead_time_delta_weeks = EXCLUDED.lead_time_delta_weeks,
        allows_com = EXCLUDED.allows_com,
        com_requirements = EXCLUDED.com_requirements,
        metadata = EXCLUDED.metadata,
        position = EXCLUDED.position,
        is_active = EXCLUDED.is_active,
        updated_at = now()
      RETURNING id INTO v_value_id;
      v_seen_values := array_append(v_seen_values, v_value_id);
    END LOOP;
  END LOOP;

  IF EXISTS (
    SELECT 1 FROM public.product_option_values ov
    JOIN public.product_option_groups og ON og.id = ov.option_group_id
    WHERE og.product_id = p_product_id
      AND NOT (ov.id = ANY(v_seen_values))
      AND (
        EXISTS (SELECT 1 FROM public.product_configuration_selections s WHERE s.option_value_id = ov.id)
        OR EXISTS (SELECT 1 FROM public.product_variant_values vv WHERE vv.option_value_id = ov.id)
      )
  ) THEN
    RAISE EXCEPTION 'used option values cannot be removed; deactivate them instead'
      USING errcode = 'foreign_key_violation';
  END IF;
  DELETE FROM public.product_option_values ov
  USING public.product_option_groups og
  WHERE ov.option_group_id = og.id AND og.product_id = p_product_id
    AND NOT (ov.id = ANY(v_seen_values));
  DELETE FROM public.product_option_groups
  WHERE product_id = p_product_id AND NOT (id = ANY(v_seen_groups));

  FOR v_variant IN SELECT value FROM jsonb_array_elements(COALESCE(p_input->'variants', '[]'::jsonb)) LOOP
    INSERT INTO public.product_variants (
      id, product_id, code, name, sku, vendor_sku, status,
      retail_price_cents, trade_price_cents, lead_time_weeks,
      dimensions, weight, metadata, is_default
    ) VALUES (
      CASE WHEN COALESCE(v_variant->>'id', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        THEN (v_variant->>'id')::uuid ELSE extensions.gen_random_uuid() END,
      p_product_id, v_variant->>'code', COALESCE(v_variant->>'name', v_variant->>'code'),
      v_variant->>'sku', v_variant->>'vendorSku', COALESCE(v_variant->>'status', 'active'),
      NULLIF(v_variant->>'retailPriceCents', '')::integer,
      NULLIF(v_variant->>'tradePriceCents', '')::integer,
      NULLIF(v_variant->>'leadTimeWeeks', '')::integer,
      v_variant->'dimensions', v_variant->'weight', COALESCE(v_variant->'metadata', '{}'::jsonb),
      COALESCE((v_variant->>'isDefault')::boolean, false)
    )
    ON CONFLICT (product_id, code) DO UPDATE SET
      name = EXCLUDED.name,
      sku = EXCLUDED.sku,
      vendor_sku = EXCLUDED.vendor_sku,
      status = EXCLUDED.status,
      retail_price_cents = EXCLUDED.retail_price_cents,
      trade_price_cents = EXCLUDED.trade_price_cents,
      lead_time_weeks = EXCLUDED.lead_time_weeks,
      dimensions = EXCLUDED.dimensions,
      weight = EXCLUDED.weight,
      metadata = EXCLUDED.metadata,
      is_default = EXCLUDED.is_default,
      updated_at = now()
    RETURNING id INTO v_variant_id;
    v_seen_variants := array_append(v_seen_variants, v_variant_id);

    DELETE FROM public.product_variant_values WHERE variant_id = v_variant_id;
    FOR v_ref IN
      SELECT value #>> '{}'
      FROM jsonb_array_elements(COALESCE(v_variant->'optionValueIds', v_variant->'optionValueCodes', '[]'::jsonb))
    LOOP
      v_ref_id := NULL;
      BEGIN
        v_ref_id := v_ref::uuid;
      EXCEPTION WHEN invalid_text_representation THEN
        SELECT ov.id INTO v_ref_id
        FROM public.product_option_values ov
        JOIN public.product_option_groups og ON og.id = ov.option_group_id
        WHERE og.product_id = p_product_id
          AND (og.code || ':' || ov.code = v_ref OR ov.code = v_ref)
        ORDER BY (og.code || ':' || ov.code = v_ref) DESC
        LIMIT 1;
      END;
      IF v_ref_id IS NULL THEN
        RAISE EXCEPTION 'unknown option value reference % for variant %', v_ref, v_variant->>'code'
          USING errcode = 'foreign_key_violation';
      END IF;
      INSERT INTO public.product_variant_values(variant_id, option_value_id)
      VALUES (v_variant_id, v_ref_id) ON CONFLICT DO NOTHING;
    END LOOP;
  END LOOP;

  IF EXISTS (
    SELECT 1 FROM public.product_variants v
    WHERE v.product_id = p_product_id AND NOT (v.id = ANY(v_seen_variants))
      AND EXISTS (SELECT 1 FROM public.product_configurations c WHERE c.product_variant_id = v.id)
  ) THEN
    RAISE EXCEPTION 'used variants cannot be removed; mark them discontinued instead'
      USING errcode = 'foreign_key_violation';
  END IF;
  DELETE FROM public.product_variants
  WHERE product_id = p_product_id AND NOT (id = ANY(v_seen_variants));

  FOR v_component IN SELECT value FROM jsonb_array_elements(COALESCE(p_input->'components', '[]'::jsonb)) LOOP
    INSERT INTO public.product_components (
      id, product_id, code, name, description, component_type, handedness,
      min_quantity, max_quantity, default_quantity, retail_price_cents,
      trade_price_cents, lead_time_weeks, dimensions, metadata, position, is_active
    ) VALUES (
      CASE WHEN COALESCE(v_component->>'id', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        THEN (v_component->>'id')::uuid ELSE extensions.gen_random_uuid() END,
      p_product_id, v_component->>'code', COALESCE(v_component->>'name', v_component->>'code'),
      v_component->>'description', COALESCE(v_component->>'componentType', 'module'),
      COALESCE(v_component->>'handedness', 'none'),
      COALESCE((v_component->>'minQuantity')::integer, 0),
      NULLIF(v_component->>'maxQuantity', '')::integer,
      COALESCE((v_component->>'defaultQuantity')::integer, 0),
      COALESCE((v_component->>'retailPriceCents')::integer, 0),
      COALESCE((v_component->>'tradePriceCents')::integer, 0),
      COALESCE((v_component->>'leadTimeWeeks')::integer, 0),
      v_component->'dimensions', COALESCE(v_component->'metadata', '{}'::jsonb),
      COALESCE((v_component->>'position')::integer, 0),
      COALESCE((v_component->>'isActive')::boolean, true)
    )
    ON CONFLICT (product_id, code) DO UPDATE SET
      name = EXCLUDED.name,
      description = EXCLUDED.description,
      component_type = EXCLUDED.component_type,
      handedness = EXCLUDED.handedness,
      min_quantity = EXCLUDED.min_quantity,
      max_quantity = EXCLUDED.max_quantity,
      default_quantity = EXCLUDED.default_quantity,
      retail_price_cents = EXCLUDED.retail_price_cents,
      trade_price_cents = EXCLUDED.trade_price_cents,
      lead_time_weeks = EXCLUDED.lead_time_weeks,
      dimensions = EXCLUDED.dimensions,
      metadata = EXCLUDED.metadata,
      position = EXCLUDED.position,
      is_active = EXCLUDED.is_active,
      updated_at = now()
    RETURNING id INTO v_component_id;
    v_seen_components := array_append(v_seen_components, v_component_id);
  END LOOP;
  IF EXISTS (
    SELECT 1 FROM public.product_components c
    WHERE c.product_id = p_product_id AND NOT (c.id = ANY(v_seen_components))
      AND EXISTS (SELECT 1 FROM public.product_configuration_components cc WHERE cc.component_id = c.id)
  ) THEN
    RAISE EXCEPTION 'used components cannot be removed; deactivate them instead'
      USING errcode = 'foreign_key_violation';
  END IF;
  DELETE FROM public.product_components
  WHERE product_id = p_product_id AND NOT (id = ANY(v_seen_components));

  FOR v_rule IN SELECT value FROM jsonb_array_elements(COALESCE(p_input->'rules', '[]'::jsonb)) LOOP
    IF jsonb_typeof(COALESCE(v_rule->'condition', '{}'::jsonb)) <> 'object'
       OR jsonb_typeof(COALESCE(v_rule->'effect', '{}'::jsonb)) <> 'object'
       OR (v_rule->'condition' ? 'selectedOptionValues' AND jsonb_typeof(v_rule->'condition'->'selectedOptionValues') <> 'object')
       OR (v_rule->'condition' ? 'notSelectedOptionValues' AND jsonb_typeof(v_rule->'condition'->'notSelectedOptionValues') <> 'object')
       OR (v_rule->'condition' ? 'components' AND jsonb_typeof(v_rule->'condition'->'components') <> 'object')
       OR (v_rule->'effect' ? 'requiredOptionValues' AND jsonb_typeof(v_rule->'effect'->'requiredOptionValues') <> 'object')
       OR (v_rule->'effect' ? 'requiredComponents' AND jsonb_typeof(v_rule->'effect'->'requiredComponents') <> 'object')
       OR (v_rule->'effect' ? 'dimensions' AND jsonb_typeof(v_rule->'effect'->'dimensions') <> 'object')
       OR (v_rule->'effect' ? 'allowed' AND jsonb_typeof(v_rule->'effect'->'allowed') <> 'boolean')
       OR (v_rule->'effect' ? 'priceOnRequest' AND jsonb_typeof(v_rule->'effect'->'priceOnRequest') <> 'boolean')
       OR (v_rule->'effect' ? 'retailPriceDeltaCents' AND jsonb_typeof(v_rule->'effect'->'retailPriceDeltaCents') <> 'number')
       OR (v_rule->'effect' ? 'tradePriceDeltaCents' AND jsonb_typeof(v_rule->'effect'->'tradePriceDeltaCents') <> 'number')
       OR (v_rule->'effect' ? 'leadTimeDeltaWeeks' AND jsonb_typeof(v_rule->'effect'->'leadTimeDeltaWeeks') <> 'number') THEN
      RAISE EXCEPTION 'rule % has malformed condition/effect JSON', COALESCE(v_rule->>'code', '<unknown>')
        USING errcode = 'check_violation';
    END IF;
    INSERT INTO public.product_configuration_rules (
      id, product_id, code, name, rule_type, condition, effect, message, priority, is_active
    ) VALUES (
      CASE WHEN COALESCE(v_rule->>'id', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        THEN (v_rule->>'id')::uuid ELSE extensions.gen_random_uuid() END,
      p_product_id, v_rule->>'code', COALESCE(v_rule->>'name', v_rule->>'code'),
      v_rule->>'ruleType', COALESCE(v_rule->'condition', '{}'::jsonb),
      COALESCE(v_rule->'effect', '{}'::jsonb), v_rule->>'message',
      COALESCE((v_rule->>'priority')::integer, 0), COALESCE((v_rule->>'isActive')::boolean, true)
    )
    ON CONFLICT (product_id, code) DO UPDATE SET
      name = EXCLUDED.name,
      rule_type = EXCLUDED.rule_type,
      condition = EXCLUDED.condition,
      effect = EXCLUDED.effect,
      message = EXCLUDED.message,
      priority = EXCLUDED.priority,
      is_active = EXCLUDED.is_active,
      updated_at = now()
    RETURNING id INTO v_rule_id;
    v_seen_rules := array_append(v_seen_rules, v_rule_id);
  END LOOP;
  DELETE FROM public.product_configuration_rules
  WHERE product_id = p_product_id AND NOT (id = ANY(v_seen_rules));

  UPDATE public.products p
  SET configuration_summary = jsonb_build_object(
    'mode', p.configuration_mode,
    'pricingStrategy', p.configuration_pricing_strategy,
    'groupCount', (SELECT count(*) FROM public.product_option_groups g WHERE g.product_id = p.id),
    'valueCount', (SELECT count(*) FROM public.product_option_values ov JOIN public.product_option_groups g ON g.id = ov.option_group_id WHERE g.product_id = p.id AND ov.is_active),
    'activeVariantCount', (SELECT count(*) FROM public.product_variants v WHERE v.product_id = p.id AND v.status = 'active'),
    'activeComponentCount', (SELECT count(*) FROM public.product_components c WHERE c.product_id = p.id AND c.is_active),
    'primaryGroupName', (SELECT g.name FROM public.product_option_groups g WHERE g.product_id = p.id ORDER BY g.position, g.name LIMIT 1),
    'primaryGroupValueCount', COALESCE((SELECT count(*) FROM public.product_option_values ov WHERE ov.option_group_id = (SELECT g.id FROM public.product_option_groups g WHERE g.product_id = p.id ORDER BY g.position, g.name LIMIT 1) AND ov.is_active), 0),
    'minRetailPriceCents', CASE WHEN p.configuration_pricing_strategy = 'component_sum' THEN
      (SELECT CASE WHEN COALESCE(sum(c.min_quantity), 0) > 0
        THEN sum(c.retail_price_cents * c.min_quantity)
        ELSE min(c.retail_price_cents) END
       FROM public.product_components c WHERE c.product_id = p.id AND c.is_active)
      ELSE (SELECT min(x) FROM unnest(ARRAY[p.price_retail] || COALESCE((SELECT array_agg(v.retail_price_cents) FROM public.product_variants v WHERE v.product_id = p.id AND v.status = 'active' AND v.retail_price_cents IS NOT NULL), '{}'::integer[])) x) END,
    'maxRetailPriceCents', CASE WHEN p.configuration_pricing_strategy = 'component_sum' THEN
      (SELECT CASE WHEN bool_and(c.max_quantity IS NOT NULL)
        THEN sum(c.retail_price_cents * c.max_quantity) ELSE NULL END
       FROM public.product_components c WHERE c.product_id = p.id AND c.is_active)
      ELSE (SELECT max(x) FROM unnest(ARRAY[p.price_retail] || COALESCE((SELECT array_agg(v.retail_price_cents) FROM public.product_variants v WHERE v.product_id = p.id AND v.status = 'active' AND v.retail_price_cents IS NOT NULL), '{}'::integer[])) x) END,
    'minTradePriceCents', CASE WHEN p.configuration_pricing_strategy = 'component_sum' THEN
      (SELECT CASE WHEN COALESCE(sum(c.min_quantity), 0) > 0
        THEN sum(c.trade_price_cents * c.min_quantity)
        ELSE min(c.trade_price_cents) END
       FROM public.product_components c WHERE c.product_id = p.id AND c.is_active)
      ELSE (SELECT min(x) FROM unnest(ARRAY[p.price_trade] || COALESCE((SELECT array_agg(v.trade_price_cents) FROM public.product_variants v WHERE v.product_id = p.id AND v.status = 'active' AND v.trade_price_cents IS NOT NULL), '{}'::integer[])) x) END,
    'maxTradePriceCents', CASE WHEN p.configuration_pricing_strategy = 'component_sum' THEN
      (SELECT CASE WHEN bool_and(c.max_quantity IS NOT NULL)
        THEN sum(c.trade_price_cents * c.max_quantity) ELSE NULL END
       FROM public.product_components c WHERE c.product_id = p.id AND c.is_active)
      ELSE (SELECT max(x) FROM unnest(ARRAY[p.price_trade] || COALESCE((SELECT array_agg(v.trade_price_cents) FROM public.product_variants v WHERE v.product_id = p.id AND v.status = 'active' AND v.trade_price_cents IS NOT NULL), '{}'::integer[])) x) END,
    'minLeadTimeWeeks', CASE WHEN p.configuration_pricing_strategy = 'component_sum'
      THEN (SELECT min(c.lead_time_weeks) FROM public.product_components c WHERE c.product_id = p.id AND c.is_active)
      ELSE (SELECT min(x) FROM unnest(ARRAY[p.lead_time_weeks] || COALESCE((SELECT array_agg(v.lead_time_weeks) FROM public.product_variants v WHERE v.product_id = p.id AND v.status = 'active' AND v.lead_time_weeks IS NOT NULL), '{}'::integer[])) x) END,
    'maxLeadTimeWeeks', CASE WHEN p.configuration_pricing_strategy = 'component_sum'
      THEN (SELECT max(c.lead_time_weeks) FROM public.product_components c WHERE c.product_id = p.id AND c.is_active)
      ELSE (SELECT max(x) FROM unnest(ARRAY[p.lead_time_weeks] || COALESCE((SELECT array_agg(v.lead_time_weeks) FROM public.product_variants v WHERE v.product_id = p.id AND v.status = 'active' AND v.lead_time_weeks IS NOT NULL), '{}'::integer[])) x) END,
    'priceOnRequest', CASE WHEN p.configuration_pricing_strategy = 'component_sum'
      THEN NOT EXISTS (SELECT 1 FROM public.product_components c WHERE c.product_id = p.id AND c.is_active)
      ELSE p.configuration_mode = 'custom' AND p.price_retail IS NULL
        AND NOT EXISTS (SELECT 1 FROM public.product_variants v WHERE v.product_id = p.id AND v.status = 'active' AND v.retail_price_cents IS NOT NULL) END
  )
  WHERE p.id = p_product_id;

  RETURN public.get_product_configuration_schema(p_product_id);
END;
$$;

-- ── Evaluation carries COM into every selection snapshot entry ────────────
CREATE OR REPLACE FUNCTION public.evaluate_product_configuration(
  p_product_id uuid,
  p_variant_id uuid DEFAULT NULL,
  p_option_value_ids uuid[] DEFAULT '{}'::uuid[],
  p_components jsonb DEFAULT '[]'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_product public.products;
  v_variant public.product_variants;
  v_group public.product_option_groups;
  v_component public.product_components;
  v_component_input jsonb;
  v_rule public.product_configuration_rules;
  v_required record;
  v_required_code text;
  v_quantity integer;
  v_handedness text;
  v_selected_count integer;
  v_unknown_count integer;
  v_retail integer;
  v_trade integer;
  v_retail_delta integer := 0;
  v_trade_delta integer := 0;
  v_lead integer;
  v_lead_delta integer := 0;
  v_component_lead integer := 0;
  v_dimensions jsonb;
  v_selection jsonb := '{}'::jsonb;
  v_component_state jsonb := '{}'::jsonb;
  v_component_quantities jsonb := '{}'::jsonb;
  v_selection_snapshot jsonb := '[]'::jsonb;
  v_component_snapshot jsonb := '[]'::jsonb;
  v_matched_variant jsonb := NULL;
  v_violations jsonb := '[]'::jsonb;
  v_warnings jsonb := '[]'::jsonb;
  v_complete boolean := true;
  v_valid boolean := true;
  v_snapshot jsonb;
  v_rule_match boolean;
BEGIN
  IF NOT public._can_read_configurable_product(p_product_id) THEN
    RAISE EXCEPTION 'product not found or not accessible'
      USING errcode = 'insufficient_privilege';
  END IF;
  IF p_components IS NULL OR jsonb_typeof(p_components) <> 'array' THEN
    RAISE EXCEPTION 'components must be a JSON array' USING errcode = 'check_violation';
  END IF;
  SELECT * INTO STRICT v_product FROM public.products WHERE id = p_product_id;
  p_option_value_ids := COALESCE(p_option_value_ids, '{}'::uuid[]);

  SELECT count(*) INTO v_unknown_count
  FROM unnest(p_option_value_ids) selected(id)
  LEFT JOIN public.product_option_values ov ON ov.id = selected.id AND ov.is_active
  LEFT JOIN public.product_option_groups og ON og.id = ov.option_group_id AND og.product_id = p_product_id
  WHERE og.id IS NULL;
  IF v_unknown_count > 0 THEN
    v_valid := false;
    v_violations := v_violations || jsonb_build_array('One or more option values are unavailable for this product.');
  END IF;

  SELECT COALESCE(jsonb_object_agg(group_code, value_codes), '{}'::jsonb)
  INTO v_selection
  FROM (
    SELECT og.code AS group_code, jsonb_agg(ov.code ORDER BY ov.position, ov.code) AS value_codes
    FROM public.product_option_values ov
    JOIN public.product_option_groups og ON og.id = ov.option_group_id
    WHERE og.product_id = p_product_id AND ov.id = ANY(p_option_value_ids)
    GROUP BY og.code
  ) selected_groups;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'optionGroupId', og.id,
    'optionValueId', ov.id,
    'groupCode', og.code,
    'valueCode', ov.code,
    'groupName', og.name,
    'valueLabel', ov.label,
    'retailPriceDeltaCents', ov.retail_price_delta_cents,
    'tradePriceDeltaCents', ov.trade_price_delta_cents,
    'leadTimeDeltaWeeks', ov.lead_time_delta_weeks,
    'allowsCom', ov.allows_com
  ) ORDER BY og.position, ov.position), '[]'::jsonb),
  COALESCE(sum(ov.retail_price_delta_cents), 0),
  COALESCE(sum(ov.trade_price_delta_cents), 0),
  COALESCE(max(ov.lead_time_delta_weeks), 0)
  INTO v_selection_snapshot, v_retail_delta, v_trade_delta, v_lead_delta
  FROM public.product_option_values ov
  JOIN public.product_option_groups og ON og.id = ov.option_group_id
  WHERE og.product_id = p_product_id AND ov.id = ANY(p_option_value_ids);

  FOR v_group IN
    SELECT * FROM public.product_option_groups WHERE product_id = p_product_id ORDER BY position, code
  LOOP
    SELECT count(*) INTO v_selected_count
    FROM public.product_option_values ov
    WHERE ov.option_group_id = v_group.id AND ov.id = ANY(p_option_value_ids);
    IF v_selected_count < v_group.min_selections THEN
      v_complete := false;
      v_violations := v_violations || jsonb_build_array(
        format('%s needs %s selection%s.', v_group.name, v_group.min_selections,
          CASE WHEN v_group.min_selections = 1 THEN '' ELSE 's' END)
      );
    END IF;
    IF v_selected_count > v_group.max_selections THEN
      v_valid := false;
      v_violations := v_violations || jsonb_build_array(
        format('%s allows at most %s selection%s.', v_group.name, v_group.max_selections,
          CASE WHEN v_group.max_selections = 1 THEN '' ELSE 's' END)
      );
    END IF;
  END LOOP;

  IF p_variant_id IS NOT NULL THEN
    SELECT * INTO v_variant
    FROM public.product_variants
    WHERE id = p_variant_id AND product_id = p_product_id AND status = 'active';
    IF NOT FOUND THEN
      v_valid := false;
      v_violations := v_violations || jsonb_build_array('The selected sellable variant is unavailable.');
    END IF;
  ELSIF v_product.configuration_mode = 'variant' THEN
    SELECT v.* INTO v_variant
    FROM public.product_variants v
    WHERE v.product_id = p_product_id AND v.status = 'active'
      AND NOT EXISTS (
        SELECT 1 FROM public.product_variant_values vv
        WHERE vv.variant_id = v.id AND NOT (vv.option_value_id = ANY(p_option_value_ids))
      )
      AND NOT EXISTS (
        SELECT 1 FROM unnest(p_option_value_ids) selected(id)
        JOIN public.product_option_values ov ON ov.id = selected.id
        JOIN public.product_option_groups og ON og.id = ov.option_group_id
        WHERE og.product_id = p_product_id
          AND NOT EXISTS (
            SELECT 1 FROM public.product_variant_values vv
            WHERE vv.variant_id = v.id AND vv.option_value_id = selected.id
          )
      )
    ORDER BY v.is_default DESC, v.created_at
    LIMIT 1;
    IF NOT FOUND THEN
      v_valid := false;
      v_complete := false;
      v_violations := v_violations || jsonb_build_array('This option combination does not match an active sellable variant.');
    END IF;
  END IF;

  IF v_variant.id IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM public.product_variant_values vv
      WHERE vv.variant_id = v_variant.id AND NOT (vv.option_value_id = ANY(p_option_value_ids))
    ) OR EXISTS (
      SELECT 1 FROM unnest(p_option_value_ids) selected(id)
      JOIN public.product_option_values ov ON ov.id = selected.id
      JOIN public.product_option_groups og ON og.id = ov.option_group_id
      WHERE og.product_id = p_product_id
        AND NOT EXISTS (
          SELECT 1 FROM public.product_variant_values vv
          WHERE vv.variant_id = v_variant.id AND vv.option_value_id = selected.id
        )
    ) THEN
      v_valid := false;
      v_violations := v_violations || jsonb_build_array('The selected variant does not match the chosen options.');
    END IF;
    v_matched_variant := jsonb_build_object(
      'id', v_variant.id,
      'productId', v_variant.product_id,
      'code', v_variant.code,
      'name', v_variant.name,
      'sku', v_variant.sku,
      'vendorSku', v_variant.vendor_sku,
      'status', v_variant.status,
      'retailPriceCents', v_variant.retail_price_cents,
      'tradePriceCents', v_variant.trade_price_cents,
      'leadTimeWeeks', v_variant.lead_time_weeks,
      'dimensions', v_variant.dimensions,
      'weight', v_variant.weight,
      'metadata', v_variant.metadata,
      'isDefault', v_variant.is_default,
      'optionValueIds', COALESCE((SELECT jsonb_agg(option_value_id) FROM public.product_variant_values WHERE variant_id = v_variant.id), '[]'::jsonb)
    );
  END IF;

  IF v_product.configuration_pricing_strategy = 'component_sum' THEN
    v_retail := 0;
    v_trade := 0;
  ELSE
    v_retail := COALESCE(v_variant.retail_price_cents, v_product.price_retail);
    v_trade := COALESCE(v_variant.trade_price_cents, v_product.price_trade);
  END IF;
  v_lead := COALESCE(v_variant.lead_time_weeks, v_product.lead_time_weeks);
  v_dimensions := COALESCE(v_variant.dimensions, v_product.dimensions);

  IF (SELECT count(*) FROM jsonb_array_elements(p_components))
     <> (SELECT count(DISTINCT value->>'componentId') FROM jsonb_array_elements(p_components)) THEN
    v_valid := false;
    v_violations := v_violations || jsonb_build_array('A modular component cannot be selected more than once.');
  END IF;

  IF v_product.configuration_pricing_strategy = 'component_sum'
     AND EXISTS (SELECT 1 FROM public.product_components WHERE product_id = p_product_id AND is_active)
     AND jsonb_array_length(p_components) = 0 THEN
    v_complete := false;
    v_violations := v_violations || jsonb_build_array('Choose at least one modular component.');
  END IF;

  FOR v_component_input IN SELECT value FROM jsonb_array_elements(p_components) LOOP
    BEGIN
      SELECT * INTO v_component
      FROM public.product_components
      WHERE id = (v_component_input->>'componentId')::uuid
        AND product_id = p_product_id AND is_active;
    EXCEPTION WHEN invalid_text_representation THEN
      v_component.id := NULL;
    END;
    IF v_component.id IS NULL THEN
      v_valid := false;
      v_violations := v_violations || jsonb_build_array('One or more modular components are unavailable.');
      CONTINUE;
    END IF;
    v_quantity := COALESCE((v_component_input->>'quantity')::integer, 0);
    v_handedness := NULLIF(v_component_input->>'handedness', '');
    IF v_quantity < v_component.min_quantity
       OR (v_component.max_quantity IS NOT NULL AND v_quantity > v_component.max_quantity)
       OR v_quantity <= 0 THEN
      v_valid := false;
      v_violations := v_violations || jsonb_build_array(
        format('%s quantity must be between %s and %s.', v_component.name,
          greatest(v_component.min_quantity, 1), COALESCE(v_component.max_quantity::text, 'any'))
      );
      CONTINUE;
    END IF;
    IF v_component.handedness = 'either' AND v_handedness NOT IN ('left', 'right') THEN
      v_complete := false;
      v_violations := v_violations || jsonb_build_array(format('%s needs left or right handedness.', v_component.name));
    ELSIF v_component.handedness IN ('left', 'right') THEN
      IF v_handedness IS NOT NULL AND v_handedness <> v_component.handedness THEN
        v_valid := false;
        v_violations := v_violations || jsonb_build_array(format('%s has fixed %s handedness.', v_component.name, v_component.handedness));
      END IF;
      v_handedness := v_component.handedness;
    ELSIF v_component.handedness = 'none' AND v_handedness IS NOT NULL THEN
      v_valid := false;
      v_violations := v_violations || jsonb_build_array(format('%s is not handed.', v_component.name));
    END IF;
    v_component_state := jsonb_set(v_component_state, ARRAY[v_component.code], jsonb_build_object(
      'quantity', v_quantity, 'handedness', v_handedness
    ), true);
    v_component_quantities := jsonb_set(v_component_quantities, ARRAY[v_component.id::text], to_jsonb(v_quantity), true);
    v_component_snapshot := v_component_snapshot || jsonb_build_array(jsonb_build_object(
      'componentId', v_component.id,
      'code', v_component.code,
      'name', v_component.name,
      'quantity', v_quantity,
      'handedness', v_handedness,
      'retailPriceCents', v_component.retail_price_cents,
      'tradePriceCents', v_component.trade_price_cents,
      'leadTimeWeeks', v_component.lead_time_weeks,
      'dimensions', v_component.dimensions
    ));
    IF v_retail IS NOT NULL THEN v_retail := v_retail + (v_component.retail_price_cents * v_quantity); END IF;
    IF v_trade IS NOT NULL THEN v_trade := v_trade + (v_component.trade_price_cents * v_quantity); END IF;
    v_component_lead := greatest(v_component_lead, v_component.lead_time_weeks);
  END LOOP;

  -- Components declared mandatory by their own definition are checked even if absent.
  FOR v_component IN SELECT * FROM public.product_components WHERE product_id = p_product_id AND is_active AND min_quantity > 0 LOOP
    IF NOT (v_component_state ? v_component.code) THEN
      v_complete := false;
      v_violations := v_violations || jsonb_build_array(format('%s is required.', v_component.name));
    END IF;
  END LOOP;

  IF v_variant.id IS NULL OR v_variant.retail_price_cents IS NULL THEN
    IF v_retail IS NOT NULL THEN v_retail := v_retail + v_retail_delta; END IF;
  END IF;
  IF v_variant.id IS NULL OR v_variant.trade_price_cents IS NULL THEN
    IF v_trade IS NOT NULL THEN v_trade := v_trade + v_trade_delta; END IF;
  END IF;
  IF v_lead IS NOT NULL THEN v_lead := v_lead + greatest(v_lead_delta, v_component_lead); END IF;

  FOR v_rule IN
    SELECT * FROM public.product_configuration_rules
    WHERE product_id = p_product_id AND is_active ORDER BY priority, code
  LOOP
    v_rule_match := public._product_configuration_condition_matches(v_rule.condition, v_selection, v_component_state);
    IF NOT v_rule_match THEN CONTINUE; END IF;
    IF v_rule.rule_type IN ('exclusion', 'compatibility')
       AND COALESCE((v_rule.effect->>'allowed')::boolean, false) = false THEN
      v_valid := false;
      v_violations := v_violations || jsonb_build_array(COALESCE(v_rule.message, v_rule.name));
    ELSIF v_rule.rule_type = 'requirement' THEN
      FOR v_required IN SELECT key, value FROM jsonb_each(COALESCE(v_rule.effect->'requiredOptionValues', '{}'::jsonb)) LOOP
        FOR v_required_code IN SELECT jsonb_array_elements_text(v_required.value) LOOP
          IF NOT COALESCE(v_selection->v_required.key, '[]'::jsonb) @> jsonb_build_array(v_required_code) THEN
            v_complete := false;
            v_violations := v_violations || jsonb_build_array(COALESCE(v_rule.message, v_rule.name));
          END IF;
        END LOOP;
      END LOOP;
      FOR v_required IN SELECT key, value FROM jsonb_each(COALESCE(v_rule.effect->'requiredComponents', '{}'::jsonb)) LOOP
        IF COALESCE((v_component_state->v_required.key->>'quantity')::integer, 0)
           < COALESCE((v_required.value->>'min')::integer, 1) THEN
          v_complete := false;
          v_violations := v_violations || jsonb_build_array(COALESCE(v_rule.message, v_rule.name));
        END IF;
      END LOOP;
    ELSIF v_rule.rule_type = 'pricing' THEN
      IF COALESCE((v_rule.effect->>'priceOnRequest')::boolean, false) THEN
        v_retail := NULL;
        v_trade := NULL;
      ELSE
        IF v_retail IS NOT NULL THEN v_retail := v_retail + COALESCE((v_rule.effect->>'retailPriceDeltaCents')::integer, 0); END IF;
        IF v_trade IS NOT NULL THEN v_trade := v_trade + COALESCE((v_rule.effect->>'tradePriceDeltaCents')::integer, 0); END IF;
      END IF;
    ELSIF v_rule.rule_type = 'lead_time' AND v_lead IS NOT NULL THEN
      v_lead := v_lead + COALESCE((v_rule.effect->>'leadTimeDeltaWeeks')::integer, 0);
    ELSIF v_rule.rule_type = 'dimension' AND jsonb_typeof(v_rule.effect->'dimensions') = 'object' THEN
      v_dimensions := COALESCE(v_dimensions, '{}'::jsonb) || (v_rule.effect->'dimensions');
    END IF;
  END LOOP;

  IF v_product.configuration_mode = 'custom' AND v_retail IS NULL THEN
    v_warnings := v_warnings || jsonb_build_array('Price on request until a fabricator quote is approved.');
  END IF;

  v_snapshot := jsonb_build_object(
    'productId', v_product.id,
    'productName', v_product.name,
    'configurationMode', v_product.configuration_mode,
    'pricingStrategy', v_product.configuration_pricing_strategy,
    'schemaRevision', v_product.configuration_revision,
    'variant', v_matched_variant,
    'selections', v_selection_snapshot,
    'components', v_component_snapshot,
    'retailPriceCents', v_retail,
    'tradePriceCents', v_trade,
    'leadTimeWeeks', v_lead,
    'dimensions', v_dimensions,
    'capturedAt', now()
  );

  RETURN jsonb_build_object(
    'valid', v_valid,
    'complete', v_complete,
    'violations', v_violations,
    'warnings', v_warnings,
    'normalizedSelection', v_selection,
    'componentQuantities', v_component_quantities,
    'componentState', v_component_state,
    'matchedVariant', v_matched_variant,
    'retailPriceCents', v_retail,
    'tradePriceCents', v_trade,
    'leadTimeWeeks', v_lead,
    'dimensions', v_dimensions,
    'schemaRevision', v_product.configuration_revision,
    'snapshot', v_snapshot
  );
END;
$$;

-- ── Saving records the specified fabric and hashes it with the snapshot ───
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

-- ── The three specification writers denormalize the COM fabric line ───────
CREATE OR REPLACE FUNCTION public.place_product_configuration_in_project(
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
  v_item_id := (v_place->>'ffeItemId')::uuid;
  v_spec_id := (v_place->>'specId')::uuid;

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

CREATE OR REPLACE FUNCTION public.guard_project_ffe_configuration_integrity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_spec public.project_ffe_specs;
  v_configuration public.product_configurations;
  v_project public.projects;
  v_mode text;
  v_expected_unit integer;
  v_expected_trade integer;
  v_snapshot_retail integer;
  v_snapshot_trade integer;
  v_sku text;
  v_material text;
  v_finish text;
BEGIN
  SELECT * INTO v_spec
  FROM public.project_ffe_specs WHERE ffe_item_id = OLD.id FOR UPDATE;
  IF NOT FOUND OR v_spec.configuration_id IS NULL THEN
    RETURN NEW;
  END IF;
  IF v_spec.configuration_locked_at IS NOT NULL AND (
    NEW.project_id IS DISTINCT FROM OLD.project_id
    OR NEW.product_id IS DISTINCT FROM OLD.product_id
    OR NEW.quantity IS DISTINCT FROM OLD.quantity
    OR NEW.unit_price_cents IS DISTINCT FROM OLD.unit_price_cents
    OR NEW.trade_price_cents IS DISTINCT FROM OLD.trade_price_cents
    OR NEW.line_total_cents IS DISTINCT FROM OLD.line_total_cents
  ) THEN
    RAISE EXCEPTION 'configuration-derived project line fields are locked; create a configuration revision'
      USING errcode = 'object_not_in_prerequisite_state';
  END IF;
  IF NOT (OLD.status IS DISTINCT FROM NEW.status AND NEW.status = 'approved') THEN
    RETURN NEW;
  END IF;
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'authentication required to approve a configured project line'
      USING errcode = 'insufficient_privilege';
  END IF;
  SELECT * INTO v_project FROM public.projects WHERE id = NEW.project_id FOR SHARE;
  IF NOT FOUND OR NOT public.is_design_studio_comember(v_project.designer_id) THEN
    RAISE EXCEPTION 'project not found or not accessible' USING errcode = 'insufficient_privilege';
  END IF;
  IF NOT public._can_access_product_configuration(v_spec.configuration_id) THEN
    RAISE EXCEPTION 'configuration not found or not accessible' USING errcode = 'insufficient_privilege';
  END IF;
  SELECT c.*
  INTO v_configuration
  FROM public.product_configurations c
  WHERE c.id = v_spec.configuration_id
  FOR UPDATE OF c;
  SELECT configuration_mode INTO v_mode
  FROM public.products WHERE id = v_configuration.product_id;
  IF v_configuration.product_id IS DISTINCT FROM NEW.product_id
     OR (v_configuration.project_id IS NOT NULL AND v_configuration.project_id <> NEW.project_id)
     OR (v_configuration.ffe_item_id IS NOT NULL AND v_configuration.ffe_item_id <> NEW.id) THEN
    RAISE EXCEPTION 'configuration, project, product, and FF&E line do not agree'
      USING errcode = 'check_violation';
  END IF;
  IF NOT v_configuration.is_valid OR NOT v_configuration.is_complete THEN
    RAISE EXCEPTION 'configuration must be valid and complete before project approval'
      USING errcode = 'object_not_in_prerequisite_state';
  END IF;
  IF v_spec.configuration_snapshot IS DISTINCT FROM v_configuration.snapshot
     OR v_spec.configuration_snapshot_hash IS DISTINCT FROM v_configuration.snapshot_hash
     OR v_configuration.snapshot_hash IS DISTINCT FROM public._configuration_snapshot_hash(v_configuration.snapshot) THEN
    RAISE EXCEPTION 'configuration snapshot or hash does not match its approved source'
      USING errcode = 'object_not_in_prerequisite_state';
  END IF;
  v_snapshot_retail := NULLIF(v_configuration.snapshot->>'retailPriceCents', '')::integer;
  v_snapshot_trade := NULLIF(v_configuration.snapshot->>'tradePriceCents', '')::integer;
  IF v_snapshot_retail IS DISTINCT FROM v_configuration.retail_price_cents
     OR v_snapshot_trade IS DISTINCT FROM v_configuration.trade_price_cents THEN
    RAISE EXCEPTION 'configuration commercial columns diverge from the immutable snapshot'
      USING errcode = 'object_not_in_prerequisite_state';
  END IF;
  IF v_mode = 'custom' THEN
    IF v_configuration.status NOT IN ('approved', 'issued') THEN
      RAISE EXCEPTION 'custom commission must complete its approval workflow first'
        USING errcode = 'object_not_in_prerequisite_state';
    END IF;
  ELSIF v_configuration.status = 'saved' THEN
    UPDATE public.product_configurations
    SET status = 'approved', approved_by = auth.uid(), approved_at = now(), updated_at = now()
    WHERE id = v_configuration.id;
  ELSIF v_configuration.status NOT IN ('approved', 'issued') THEN
    RAISE EXCEPTION 'configuration cannot be approved from status %', v_configuration.status
      USING errcode = 'object_not_in_prerequisite_state';
  END IF;

  v_expected_unit := COALESCE(v_snapshot_retail, v_snapshot_trade);
  v_expected_trade := COALESCE(v_snapshot_trade, v_snapshot_retail);
  NEW.unit_price_cents := v_expected_unit;
  NEW.trade_price_cents := v_expected_trade;
  NEW.line_total_cents := CASE WHEN v_expected_unit IS NULL THEN NULL
    ELSE NEW.quantity * v_expected_unit END;
  v_sku := COALESCE(NULLIF(v_configuration.snapshot#>>'{variant,vendorSku}', ''),
    NULLIF(v_configuration.snapshot#>>'{variant,sku}', ''));
  SELECT string_agg(selection->>'valueLabel', ', ' ORDER BY ordinality)
  INTO v_material
  FROM jsonb_array_elements(COALESCE(v_configuration.snapshot->'selections', '[]'::jsonb))
       WITH ORDINALITY AS chosen(selection, ordinality)
  WHERE lower(selection->>'groupCode') = 'material';
  SELECT string_agg(selection->>'valueLabel', ', ' ORDER BY ordinality)
  INTO v_finish
  FROM jsonb_array_elements(COALESCE(v_configuration.snapshot->'selections', '[]'::jsonb))
       WITH ORDINALITY AS chosen(selection, ordinality)
  WHERE lower(selection->>'groupCode') = 'finish';
  PERFORM set_config('patina.configuration_spec_workflow', '00403', true);
  UPDATE public.project_ffe_specs
  SET configuration_locked_at = COALESCE(configuration_locked_at, now()),
      selected_dimensions = v_configuration.resolved_dimensions,
      sku = COALESCE(v_sku, sku),
      material = COALESCE(v_material, material),
      finish = COALESCE(v_finish, finish),
      color_fabric = COALESCE(NULLIF(public._configuration_com_color_fabric(
        COALESCE(v_configuration.com_details, v_configuration.snapshot->'comDetails')), ''), color_fabric),
      updated_by = auth.uid(), updated_at = now()
  WHERE id = v_spec.id;
  PERFORM set_config('patina.configuration_spec_workflow', '', true);
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.revise_project_ffe_configuration(
  p_project_id uuid,
  p_ffe_item_id uuid,
  p_expected_configuration_id uuid,
  p_expected_configuration_version integer,
  p_expected_snapshot_hash text,
  p_new_configuration_id uuid,
  p_expected_new_version integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_project public.projects;
  v_item public.project_ffe_items;
  v_spec public.project_ffe_specs;
  v_current public.product_configurations;
  v_new public.product_configurations;
  v_new_mode text;
  v_expected_unit integer;
  v_expected_trade integer;
  v_history jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'authentication required' USING errcode = 'insufficient_privilege';
  END IF;
  SELECT * INTO v_project FROM public.projects WHERE id = p_project_id FOR SHARE;
  IF NOT FOUND OR NOT public.is_design_studio_comember(v_project.designer_id) THEN
    RAISE EXCEPTION 'project not found or not accessible' USING errcode = 'insufficient_privilege';
  END IF;
  SELECT * INTO v_item FROM public.project_ffe_items
  WHERE id = p_ffe_item_id AND project_id = p_project_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'FF&E line not found in project' USING errcode = 'no_data_found';
  END IF;
  IF v_item.purchase_order_id IS NOT NULL
     OR v_item.status IN ('ordered','production','shipped','delivered','installed') THEN
    RAISE EXCEPTION 'ordered or fulfilled lines require a new FF&E line, not an in-place revision'
      USING errcode = 'object_not_in_prerequisite_state';
  END IF;
  SELECT * INTO v_spec FROM public.project_ffe_specs
  WHERE ffe_item_id = p_ffe_item_id FOR UPDATE;
  IF NOT FOUND OR v_spec.configuration_id IS DISTINCT FROM p_expected_configuration_id
     OR v_spec.configuration_snapshot_hash IS DISTINCT FROM p_expected_snapshot_hash THEN
    RAISE EXCEPTION 'project specification changed in another session'
      USING errcode = 'serialization_failure';
  END IF;
  IF NOT public._can_access_product_configuration(p_expected_configuration_id)
     OR NOT public._can_access_product_configuration(p_new_configuration_id) THEN
    RAISE EXCEPTION 'configuration not found or not accessible' USING errcode = 'insufficient_privilege';
  END IF;
  SELECT * INTO STRICT v_current FROM public.product_configurations
  WHERE id = p_expected_configuration_id FOR SHARE;
  SELECT * INTO STRICT v_new FROM public.product_configurations
  WHERE id = p_new_configuration_id FOR UPDATE;
  SELECT configuration_mode INTO STRICT v_new_mode
  FROM public.products WHERE id = v_new.product_id;
  IF v_new_mode = 'custom' THEN
    RAISE EXCEPTION 'custom commission changes require their approval/issuance lifecycle and a new project line'
      USING errcode = 'object_not_in_prerequisite_state';
  END IF;
  IF v_current.version <> p_expected_configuration_version
     OR v_new.version <> p_expected_new_version THEN
    RAISE EXCEPTION 'configuration version changed in another session'
      USING errcode = 'serialization_failure';
  END IF;
  IF v_spec.configuration_snapshot IS DISTINCT FROM v_current.snapshot
     OR v_current.snapshot_hash IS DISTINCT FROM p_expected_snapshot_hash
     OR v_current.snapshot_hash IS DISTINCT FROM public._configuration_snapshot_hash(v_current.snapshot) THEN
    RAISE EXCEPTION 'current project snapshot does not match its configuration source'
      USING errcode = 'object_not_in_prerequisite_state';
  END IF;
  IF v_new.id = v_current.id OR v_new.status <> 'saved'
     OR v_new.is_library_template
     OR v_new.project_id IS DISTINCT FROM p_project_id
     OR v_new.product_id IS DISTINCT FROM v_item.product_id
     OR (v_new.ffe_item_id IS NOT NULL AND v_new.ffe_item_id <> v_item.id)
     OR NOT v_new.is_valid OR NOT v_new.is_complete
     OR v_new.snapshot_hash IS DISTINCT FROM public._configuration_snapshot_hash(v_new.snapshot) THEN
    RAISE EXCEPTION 'replacement must be a valid, complete saved configuration instantiated for this project and product'
      USING errcode = 'object_not_in_prerequisite_state';
  END IF;

  v_expected_unit := COALESCE(v_new.retail_price_cents, v_new.trade_price_cents);
  v_expected_trade := COALESCE(v_new.trade_price_cents, v_new.retail_price_cents);
  v_history := COALESCE(v_spec.routing_source->'configurationHistory', '[]'::jsonb)
    || jsonb_build_array(jsonb_build_object(
      'fromConfigurationId', v_current.id,
      'fromVersion', v_current.version,
      'fromSnapshotHash', v_current.snapshot_hash,
      'toConfigurationId', v_new.id,
      'toVersion', v_new.version,
      'toSnapshotHash', v_new.snapshot_hash,
      'revisedBy', auth.uid(),
      'revisedAt', now()
    ));
  UPDATE public.product_configurations
  SET ffe_item_id = COALESCE(ffe_item_id, v_item.id), updated_at = now()
  WHERE id = v_new.id;

  PERFORM set_config('patina.configuration_spec_workflow', '00403', true);
  UPDATE public.project_ffe_specs
  SET configuration_id = v_new.id,
      configuration_snapshot = v_new.snapshot,
      configuration_snapshot_hash = v_new.snapshot_hash,
      configuration_locked_at = NULL,
      selected_dimensions = v_new.resolved_dimensions,
      sku = COALESCE(NULLIF(v_new.snapshot#>>'{variant,vendorSku}', ''),
        NULLIF(v_new.snapshot#>>'{variant,sku}', ''), sku),
      material = COALESCE((
        SELECT string_agg(selection->>'valueLabel', ', ' ORDER BY ordinality)
        FROM jsonb_array_elements(COALESCE(v_new.snapshot->'selections', '[]'::jsonb))
             WITH ORDINALITY AS chosen(selection, ordinality)
        WHERE lower(selection->>'groupCode') = 'material'
      ), material),
      finish = COALESCE((
        SELECT string_agg(selection->>'valueLabel', ', ' ORDER BY ordinality)
        FROM jsonb_array_elements(COALESCE(v_new.snapshot->'selections', '[]'::jsonb))
             WITH ORDINALITY AS chosen(selection, ordinality)
        WHERE lower(selection->>'groupCode') = 'finish'
      ), finish),
      color_fabric = COALESCE(NULLIF(public._configuration_com_color_fabric(
        COALESCE(v_new.com_details, v_new.snapshot->'comDetails')), ''), color_fabric),
      routing_source = routing_source || jsonb_build_object('configurationHistory', v_history),
      updated_by = auth.uid(), updated_at = now()
  WHERE id = v_spec.id;
  PERFORM set_config('patina.configuration_spec_workflow', '', true);
  UPDATE public.project_ffe_items
  SET status = 'specified',
      unit_price_cents = v_expected_unit,
      trade_price_cents = v_expected_trade,
      line_total_cents = CASE WHEN v_expected_unit IS NULL THEN NULL
        ELSE quantity * v_expected_unit END,
      updated_at = now()
  WHERE id = v_item.id;

  RETURN jsonb_build_object(
    'projectId', p_project_id,
    'ffeItemId', v_item.id,
    'specId', v_spec.id,
    'configurationId', v_new.id,
    'configurationVersion', v_new.version,
    'configurationSnapshotHash', v_new.snapshot_hash,
    'status', 'specified',
    'requiresApproval', true
  );
END;
$$;

-- ── Decisions carry a real configuration selection ────────────────────────
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
    CASE WHEN jsonb_typeof(option.value->'selection_snapshot') = 'array'
      THEN option.value->'selection_snapshot' END,
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
      CASE WHEN jsonb_typeof(option.value->'selection_snapshot') = 'array'
        THEN option.value->'selection_snapshot' END,
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

CREATE OR REPLACE FUNCTION public._apply_client_decision_authorized(
  p_decision_id uuid,
  p_selected_option_id uuid,
  p_actor uuid,
  p_client_consent_method text DEFAULT NULL,
  p_client_signature text DEFAULT NULL,
  p_client_note text DEFAULT NULL,
  p_quantity integer DEFAULT NULL
)
RETURNS public.client_decisions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_decision public.client_decisions%ROWTYPE;
  v_option public.client_decision_options%ROWTYPE;
  v_selected_option_id uuid;
  v_room_id uuid;
  v_trade_price integer;
  v_markup numeric(5,2);
BEGIN
  SELECT * INTO v_decision
  FROM public.client_decisions
  WHERE id = p_decision_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'decision % not found', p_decision_id
      USING ERRCODE = 'no_data_found';
  END IF;

  -- Deterministic replay: repeating the same winning option returns the same
  -- terminal row; trying to overwrite a different winner is a stale conflict.
  IF v_decision.status = 'responded' THEN
    SELECT id INTO v_selected_option_id
    FROM public.client_decision_options
    WHERE decision_id = p_decision_id AND selected = true
    ORDER BY id
    LIMIT 1;
    IF v_selected_option_id IS NOT DISTINCT FROM p_selected_option_id THEN
      PERFORM public._enqueue_decision_notification(
        p_decision_id, 'decision_resolved'
      );
      RETURN v_decision;
    END IF;
    RAISE EXCEPTION 'decision % was already resolved with another option', p_decision_id
      USING ERRCODE = 'serialization_failure';
  END IF;

  IF v_decision.status <> 'pending' THEN
    RAISE EXCEPTION 'decision % cannot be applied from status %',
      p_decision_id, v_decision.status
      USING ERRCODE = 'check_violation';
  END IF;

  PERFORM 1
  FROM public.client_decision_options
  WHERE decision_id = p_decision_id
  ORDER BY id
  FOR UPDATE;

  SELECT * INTO v_option
  FROM public.client_decision_options
  WHERE id = p_selected_option_id
    AND decision_id = p_decision_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'option % does not belong to decision %',
      p_selected_option_id, p_decision_id
      USING ERRCODE = 'check_violation';
  END IF;

  IF p_quantity IS NOT NULL AND p_quantity < 1 THEN
    RAISE EXCEPTION 'decision option quantity must be at least 1'
      USING ERRCODE = 'check_violation';
  END IF;
  IF p_client_consent_method IS NOT NULL
     AND p_client_consent_method NOT IN ('electronic_signature', 'click_through')
  THEN
    RAISE EXCEPTION 'invalid client consent method %', p_client_consent_method
      USING ERRCODE = 'check_violation';
  END IF;
  IF p_client_consent_method = 'electronic_signature'
     AND char_length(btrim(COALESCE(p_client_signature, ''))) < 2
  THEN
    RAISE EXCEPTION 'an electronic signature of at least 2 characters is required'
      USING ERRCODE = 'check_violation';
  END IF;

  PERFORM set_config('app.client_decision_write_id', p_decision_id::text, true);

  UPDATE public.client_decision_options
  SET selected = (id = p_selected_option_id),
      client_note = CASE WHEN id = p_selected_option_id
        THEN COALESCE(p_client_note, client_note) ELSE client_note END,
      quantity = CASE WHEN id = p_selected_option_id
        THEN COALESCE(p_quantity, quantity) ELSE quantity END
  WHERE decision_id = p_decision_id;

  SELECT * INTO v_option
  FROM public.client_decision_options
  WHERE id = p_selected_option_id;

  UPDATE public.client_decisions
  SET status = 'responded',
      responded_at = now(),
      selected_by = p_actor,
      client_consent_method = p_client_consent_method,
      client_signature = CASE WHEN p_client_consent_method IS NULL
        THEN NULL ELSE NULLIF(btrim(COALESCE(p_client_signature, '')), '') END,
      client_consented_at = CASE WHEN p_client_consent_method IS NULL
        THEN NULL ELSE now() END,
      updated_at = now()
  WHERE id = p_decision_id
  RETURNING * INTO v_decision;

  UPDATE public.project_ffe_items
  SET blocked = false,
      blocked_reason = NULL,
      blocked_by_decision_id = NULL,
      last_status_change_at = now(),
      updated_at = now()
  WHERE blocked_by_decision_id = p_decision_id
    AND project_id = v_decision.project_id;

  -- Preserve 00175/00185's one-line-per-decision dual-pricing feed-through.
  IF v_decision.project_id IS NOT NULL
     AND v_option.product_id IS NOT NULL
     AND v_decision.blocking_status = 'non_blocking'
  THEN
    v_room_id := (
      SELECT room.id
      FROM public.project_rooms AS room
      WHERE room.id = v_decision.room_id
        AND room.project_id = v_decision.project_id
    );

    SELECT product.price_trade INTO v_trade_price
    FROM public.products AS product
    WHERE product.id = v_option.product_id;

    IF v_trade_price IS NULL OR v_trade_price < 0 THEN
      v_trade_price := GREATEST(COALESCE(v_option.price, 0), 0);
      v_markup := 0;
    ELSIF v_trade_price > 0
          AND COALESCE(v_option.price, 0) > v_trade_price
    THEN
      v_markup := LEAST(
        round(((COALESCE(v_option.price, 0)::numeric / v_trade_price) - 1) * 100, 2),
        999.99
      );
    ELSE
      v_markup := 0;
    END IF;

    UPDATE public.project_ffe_items
    SET product_id = v_option.product_id,
        name = v_option.name,
        project_room_id = v_room_id,
        quantity = COALESCE(v_option.quantity, 1),
        unit_price_cents = COALESCE(v_option.price, 0),
        trade_price_cents = v_trade_price,
        markup_percent = v_markup,
        line_total_cents = COALESCE(v_option.price, 0)
          * COALESCE(v_option.quantity, 1),
        updated_at = now()
    WHERE source_decision_id = p_decision_id;

    IF NOT FOUND THEN
      INSERT INTO public.project_ffe_items (
        project_id, project_room_id, product_id, source_decision_id,
        name, item_type, status, quantity, unit_price_cents,
        trade_price_cents, markup_percent, line_total_cents
      ) VALUES (
        v_decision.project_id, v_room_id, v_option.product_id, p_decision_id,
        v_option.name, 'fixed', 'specified', COALESCE(v_option.quantity, 1),
        COALESCE(v_option.price, 0), v_trade_price, v_markup,
        COALESCE(v_option.price, 0) * COALESCE(v_option.quantity, 1)
      );
    END IF;

    -- A winning option that carried a real configuration selection specifies
    -- the line, not just prices it. Flat descriptors only: the gated
    -- configuration_* columns stay the configuration workflow's alone, and a
    -- locked specification is never overwritten.
    IF jsonb_typeof(v_option.selection_snapshot) = 'array'
       AND jsonb_array_length(v_option.selection_snapshot) > 0
    THEN
      UPDATE public.project_ffe_specs AS spec
      SET material = COALESCE((
            SELECT string_agg(chosen.selection->>'valueLabel', ', '
                              ORDER BY chosen.ordinality)
            FROM jsonb_array_elements(v_option.selection_snapshot)
                 WITH ORDINALITY AS chosen(selection, ordinality)
            WHERE lower(chosen.selection->>'groupCode') = 'material'
          ), spec.material),
          finish = COALESCE((
            SELECT string_agg(chosen.selection->>'valueLabel', ', '
                              ORDER BY chosen.ordinality)
            FROM jsonb_array_elements(v_option.selection_snapshot)
                 WITH ORDINALITY AS chosen(selection, ordinality)
            WHERE lower(chosen.selection->>'groupCode') = 'finish'
          ), spec.finish),
          color_fabric = COALESCE((
            SELECT string_agg(chosen.selection->>'valueLabel', ', '
                              ORDER BY chosen.ordinality)
            FROM jsonb_array_elements(v_option.selection_snapshot)
                 WITH ORDINALITY AS chosen(selection, ordinality)
            WHERE lower(chosen.selection->>'groupCode')
                  IN ('color', 'colour', 'fabric', 'color_fabric', 'upholstery')
          ), spec.color_fabric),
          updated_at = now()
      WHERE spec.ffe_item_id IN (
              SELECT item.id
              FROM public.project_ffe_items AS item
              WHERE item.source_decision_id = p_decision_id
                AND item.project_id = v_decision.project_id
            )
        AND spec.configuration_locked_at IS NULL;
    END IF;
  END IF;

  PERFORM set_config('app.client_decision_write_id', '', true);
  PERFORM public._enqueue_decision_notification(
    p_decision_id, 'decision_resolved'
  );
  RETURN v_decision;
END;
$$;

-- ── Grants re-asserted exactly as 00403/00399 wrote them ──────────────────
REVOKE EXECUTE ON FUNCTION public._configuration_com_color_fabric(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._configuration_com_color_fabric(jsonb) TO service_role;

REVOKE EXECUTE ON FUNCTION public.guard_project_ffe_configuration_integrity() FROM PUBLIC, anon, authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.get_product_configuration_schema(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.upsert_product_configuration_schema(uuid, jsonb, integer) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.evaluate_product_configuration(uuid, uuid, uuid[], jsonb) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.save_product_configuration(jsonb) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.place_product_configuration_in_project(uuid, uuid, uuid, uuid, text, jsonb) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.revise_project_ffe_configuration(uuid, uuid, uuid, integer, text, uuid, integer) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.get_product_configuration_schema(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.upsert_product_configuration_schema(uuid, jsonb, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.evaluate_product_configuration(uuid, uuid, uuid[], jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.save_product_configuration(jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.place_product_configuration_in_project(uuid, uuid, uuid, uuid, text, jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.revise_project_ffe_configuration(uuid, uuid, uuid, integer, text, uuid, integer) TO authenticated, service_role;

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

REVOKE ALL ON FUNCTION public._apply_client_decision_authorized(
  uuid, uuid, uuid, text, text, text, integer
) FROM PUBLIC, anon, authenticated, service_role;

COMMENT ON FUNCTION public.save_product_configuration(jsonb) IS
  'Saves one immutable configuration version. comDetails (COM/COL) is validated against the actual selections and merged into the snapshot before hashing, so the fabric is part of the commercial truth.';
