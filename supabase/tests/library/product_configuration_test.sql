-- ═══════════════════════════════════════════════════════════════════════════
-- Furniture configuration: four archetypes, invariants, snapshot handoff
-- Run: psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1
--        -f supabase/tests/library/product_configuration_test.sql
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

INSERT INTO auth.users (
  id, email, encrypted_password, email_confirmed_at, created_at, updated_at,
  instance_id, aud, role
) VALUES
  ('4c000000-0000-4000-8000-000000000001', 'config-owner@test.invalid', '', now(), now(), now(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('4c000000-0000-4000-8000-000000000002', 'config-outsider@test.invalid', '', now(), now(), now(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('4c000000-0000-4000-8000-000000000003', 'config-client@test.invalid', '', now(), now(), now(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');

INSERT INTO public.profiles (id, email, full_name, created_at, updated_at)
VALUES
  ('4c000000-0000-4000-8000-000000000001', 'config-owner@test.invalid', 'Configuration Owner', now(), now()),
  ('4c000000-0000-4000-8000-000000000002', 'config-outsider@test.invalid', 'Configuration Outsider', now(), now()),
  ('4c000000-0000-4000-8000-000000000003', 'config-client@test.invalid', 'Configuration Client', now(), now())
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name;

INSERT INTO public.organizations (id, type, name, slug, status, created_at, updated_at)
VALUES
  ('4c000000-0000-4000-8000-000000000010', 'design_studio', 'Configuration Studio', 'configuration-studio-test', 'active', now(), now()),
  ('4c000000-0000-4000-8000-000000000011', 'design_studio', 'Other Studio', 'configuration-other-test', 'active', now(), now());

INSERT INTO public.organization_members (
  user_id, organization_id, role, status, joined_at, created_at, updated_at
) VALUES
  ('4c000000-0000-4000-8000-000000000001', '4c000000-0000-4000-8000-000000000010', 'owner', 'active', now(), now(), now()),
  ('4c000000-0000-4000-8000-000000000002', '4c000000-0000-4000-8000-000000000011', 'owner', 'active', now(), now(), now());

INSERT INTO public.vendors (id, name)
VALUES ('4c000000-0000-4000-8000-000000000020', 'Configuration Fabricator');

INSERT INTO public.projects (id, name, designer_id, created_by)
VALUES ('4c000000-0000-4000-8000-000000000030', 'Configuration Project',
  '4c000000-0000-4000-8000-000000000001', '4c000000-0000-4000-8000-000000000001');

-- A claimed relationship + its project: client decisions need a registered
-- recipient before they can be published and answered.
INSERT INTO public.designer_clients (id, designer_id, client_id, status)
VALUES ('4c000000-0000-4000-8000-000000000040',
  '4c000000-0000-4000-8000-000000000001', '4c000000-0000-4000-8000-000000000003', 'active');

INSERT INTO public.projects (id, name, designer_id, client_id, created_by)
VALUES ('4c000000-0000-4000-8000-000000000031', 'Decision Project',
  '4c000000-0000-4000-8000-000000000001', '4c000000-0000-4000-8000-000000000003',
  '4c000000-0000-4000-8000-000000000001');

INSERT INTO public.products (
  id, name, source_url, captured_by, captured_at, layer, owner_user_id,
  status, price_retail, price_trade, lead_time_weeks, dimensions, vendor_id
) VALUES
  ('4c000000-0000-4000-8000-000000000101', 'Finite Bed', 'https://example.invalid/bed', '4c000000-0000-4000-8000-000000000001', now(), 'personal', '4c000000-0000-4000-8000-000000000001', 'draft', NULL, NULL, 6, '{"unit":"in"}'::jsonb, '4c000000-0000-4000-8000-000000000020'),
  ('4c000000-0000-4000-8000-000000000102', 'Modular Sectional', 'https://example.invalid/sectional', '4c000000-0000-4000-8000-000000000001', now(), 'personal', '4c000000-0000-4000-8000-000000000001', 'draft', 999999, 888888, 10, NULL, '4c000000-0000-4000-8000-000000000020'),
  ('4c000000-0000-4000-8000-000000000103', 'Material Table', 'https://example.invalid/table', '4c000000-0000-4000-8000-000000000001', now(), 'personal', '4c000000-0000-4000-8000-000000000001', 'draft', 50000, 35000, 8, '{"width":72,"unit":"in"}'::jsonb, '4c000000-0000-4000-8000-000000000020'),
  ('4c000000-0000-4000-8000-000000000104', 'Custom Cabinetry', 'https://example.invalid/cabinet', '4c000000-0000-4000-8000-000000000001', now(), 'personal', '4c000000-0000-4000-8000-000000000001', 'draft', NULL, NULL, NULL, NULL, '4c000000-0000-4000-8000-000000000020'),
  ('4c000000-0000-4000-8000-000000000105', 'COM Sofa', 'https://example.invalid/sofa', '4c000000-0000-4000-8000-000000000001', now(), 'personal', '4c000000-0000-4000-8000-000000000001', 'draft', 200000, 140000, 8, NULL, '4c000000-0000-4000-8000-000000000020'),
  ('4c000000-0000-4000-8000-000000000106', 'Plain Floor Lamp', 'https://example.invalid/lamp', '4c000000-0000-4000-8000-000000000001', now(), 'personal', '4c000000-0000-4000-8000-000000000001', 'draft', 40000, 28000, 3, NULL, '4c000000-0000-4000-8000-000000000020');

CREATE OR REPLACE FUNCTION pg_temp.assume_user(p_user_id uuid)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub', p_user_id::text, 'role', 'authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.reset_user()
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claims', NULL, true);
END;
$$;

GRANT EXECUTE ON FUNCTION pg_temp.reset_user() TO authenticated;

CREATE OR REPLACE FUNCTION pg_temp.configuration_snapshot_hash(p_snapshot jsonb)
RETURNS text
LANGUAGE sql
IMMUTABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
  SELECT encode(extensions.digest(
    convert_to((COALESCE(p_snapshot, '{}'::jsonb) - 'capturedAt')::text, 'UTF8'),
    'sha256'
  ), 'hex');
$$;

GRANT EXECUTE ON FUNCTION pg_temp.configuration_snapshot_hash(jsonb) TO authenticated;

DO $$
DECLARE
  v_schema jsonb;
  v_eval jsonb;
  v_saved jsonb;
  v_approved jsonb;
  v_place jsonb;
  v_rfq jsonb;
  v_history jsonb;
  v_template jsonb;
  v_instance jsonb;
  v_milestone jsonb;
  v_milestones jsonb;
  v_queen uuid;
  v_king_variant uuid;
  v_walnut uuid;
  v_natural uuid;
  v_painted uuid;
  v_left uuid;
  v_right uuid;
  v_armless uuid;
  v_config_id uuid;
  v_custom_config_id uuid;
  v_custom_config_v2 uuid;
  v_custom_config_v3 uuid;
  v_custom_config_v4 uuid;
  v_custom_config_v5 uuid;
  v_custom_config_v6 uuid;
  v_revision_id uuid;
  v_revision_v2 uuid;
  v_revision_v3 uuid;
  v_revision_v4 uuid;
  v_revision_v5 uuid;
  v_revision_v6 uuid;
  v_item_id uuid;
  v_bed_template_id uuid;
  v_bed_project_config_id uuid;
  v_bed_project_config_v2 uuid;
  v_reuse_config_a uuid;
  v_reuse_config_b uuid;
  v_bed_item_id uuid;
  v_bed_spec_id uuid;
  v_custom_template_id uuid;
  v_custom_instance_id uuid;
  v_spec_book_id uuid;
  v_rfq_id uuid;
  v_draft_rfq_id uuid;
  v_po_id uuid;
  v_po public.purchase_orders;
  v_snapshot_hash text;
  v_content_hash text;
  v_item_snapshot jsonb;
  v_raised boolean;
  v_count integer;
  v_com_oak uuid;
  v_com_walnut uuid;
  v_com_natural uuid;
  v_com_ebonized uuid;
  v_com_house_linen uuid;
  v_com_value uuid;
  v_locked_config_id uuid;
  v_other_selections jsonb;
  v_com_config_a uuid;
  v_com_config_b uuid;
  v_com_hash_a text;
  v_com_hash_b text;
  v_com_item_id uuid;
  v_com_spec_id uuid;
  v_selections jsonb;
  v_decision_id uuid;
  v_decision_option_id uuid;
  v_locked_decision_id uuid;
  v_locked_option_id uuid;
  v_locked_item_id uuid;
  v_dirty_selections jsonb;
  v_dirty_decision_id uuid;
  v_dirty_option_id uuid;
  v_dirty_updated_at timestamptz;
  v_stored_snapshot jsonb;
  v_com_template_id uuid;
  v_com_template_instance uuid;
BEGIN
  PERFORM pg_temp.assume_user('4c000000-0000-4000-8000-000000000001');

  -- Mode/schema invariants are enforced before any definition rows mutate.
  v_raised := false;
  BEGIN
    PERFORM public.upsert_product_configuration_schema(
      '4c000000-0000-4000-8000-000000000101',
      '{"mode":"variant","pricingStrategy":"base_plus_adjustments","optionGroups":[],"variants":[],"components":[{}],"rules":[]}',
      1
    );
  EXCEPTION WHEN check_violation THEN v_raised := true;
  END;
  ASSERT v_raised, 'variant definitions cannot retain modular components';

  v_raised := false;
  BEGIN
    PERFORM public.upsert_product_configuration_schema(
      '4c000000-0000-4000-8000-000000000103',
      '{"mode":"configured","pricingStrategy":"base_plus_adjustments","optionGroups":[],"variants":[{}],"components":[],"rules":[]}',
      1
    );
  EXCEPTION WHEN check_violation THEN v_raised := true;
  END;
  ASSERT v_raised, 'configured definitions cannot retain exact variants';

  v_raised := false;
  BEGIN
    PERFORM public.upsert_product_configuration_schema(
      '4c000000-0000-4000-8000-000000000104',
      '{"mode":"custom","pricingStrategy":"base_plus_adjustments","optionGroups":[{}],"variants":[],"components":[],"rules":[]}',
      1
    );
  EXCEPTION WHEN check_violation THEN v_raised := true;
  END;
  ASSERT v_raised, 'custom definitions cannot retain product option machinery';

  -- 1. Bed: finite exact variants and explicit-variant mismatch protection.
  v_schema := public.upsert_product_configuration_schema(
    '4c000000-0000-4000-8000-000000000101',
    '{
      "mode":"variant","pricingStrategy":"base_plus_adjustments",
      "optionGroups":[{"id":"draft-size","code":"size","name":"Size","selectionType":"single","required":true,"minSelections":1,"maxSelections":1,"position":0,
        "values":[
          {"id":"draft-queen","code":"queen","label":"Queen","retailPriceDeltaCents":0,"tradePriceDeltaCents":0,"leadTimeDeltaWeeks":0,"metadata":{},"position":0,"isActive":true},
          {"id":"draft-king","code":"king","label":"King","retailPriceDeltaCents":0,"tradePriceDeltaCents":0,"leadTimeDeltaWeeks":1,"metadata":{},"position":1,"isActive":true}
        ]}],
      "variants":[
        {"id":"draft-queen-variant","code":"queen","name":"Queen","sku":"BED-Q","status":"active","retailPriceCents":100000,"tradePriceCents":70000,"leadTimeWeeks":6,"metadata":{},"isDefault":true,"optionValueIds":["size:queen"]},
        {"id":"draft-king-variant","code":"king","name":"King","sku":"BED-K","status":"active","retailPriceCents":120000,"tradePriceCents":84000,"leadTimeWeeks":7,"metadata":{},"isDefault":false,"optionValueIds":["size:king"]}
      ],"components":[],"rules":[]
    }'::jsonb,
    1
  );
  SELECT (value->>'id')::uuid INTO v_queen
  FROM jsonb_array_elements(v_schema#>'{optionGroups,0,values}') WHERE value->>'code' = 'queen';
  SELECT (value->>'id')::uuid INTO v_king_variant
  FROM jsonb_array_elements(v_schema->'variants') WHERE value->>'code' = 'king';

  v_eval := public.evaluate_product_configuration(
    '4c000000-0000-4000-8000-000000000101', v_king_variant, ARRAY[v_queen], '[]'::jsonb
  );
  ASSERT NOT (v_eval->>'valid')::boolean,
    'explicit King variant must not price Queen option selections';

  v_eval := public.evaluate_product_configuration(
    '4c000000-0000-4000-8000-000000000101', NULL, ARRAY[v_queen], '[]'::jsonb
  );
  ASSERT (v_eval->>'valid')::boolean AND (v_eval->>'complete')::boolean,
    'Queen bed must be a valid complete exact variant';
  ASSERT (v_eval->>'retailPriceCents')::integer = 100000,
    'Queen exact retail price must be 100000 cents';

  v_saved := public.save_product_configuration(jsonb_build_object(
    'productId', '4c000000-0000-4000-8000-000000000101',
    'name', 'Guest Queen Bed',
    'selections', jsonb_build_object('size', jsonb_build_array(v_queen)),
    'components', '[]'::jsonb
  ));
  v_config_id := (v_saved#>>'{configuration,id}')::uuid;
  ASSERT v_saved->'customRevision' = 'null'::jsonb,
    'non-custom save must not create a custom revision';
  v_approved := public.approve_product_configuration(v_config_id, 1);
  ASSERT v_approved->>'status' = 'approved', 'complete bed must approve';

  v_raised := false;
  BEGIN
    PERFORM public.upsert_product_configuration_schema(
      '4c000000-0000-4000-8000-000000000101',
      '{"mode":"variant","pricingStrategy":"base_plus_adjustments","optionGroups":[],"variants":[],"components":[],"rules":[]}'::jsonb,
      2
    );
  EXCEPTION WHEN foreign_key_violation THEN v_raised := true;
  END;
  ASSERT v_raised, 'used option values cannot be removed';

  -- 2. Sectional: component-sum pricing, handedness, empty/duplicate guards.
  v_schema := public.upsert_product_configuration_schema(
    '4c000000-0000-4000-8000-000000000102',
    '{
      "mode":"configured","pricingStrategy":"component_sum","optionGroups":[],"variants":[],
      "components":[
        {"id":"draft-left","code":"left-arm","name":"Left Arm","componentType":"module","handedness":"left","minQuantity":0,"maxQuantity":1,"defaultQuantity":0,"retailPriceCents":40000,"tradePriceCents":28000,"leadTimeWeeks":10,"metadata":{},"position":0,"isActive":true},
        {"id":"draft-armless","code":"armless","name":"Armless Seat","componentType":"module","handedness":"none","minQuantity":0,"maxQuantity":6,"defaultQuantity":0,"retailPriceCents":50000,"tradePriceCents":35000,"leadTimeWeeks":11,"metadata":{},"position":1,"isActive":true},
        {"id":"draft-right","code":"right-arm","name":"Right Arm","componentType":"module","handedness":"right","minQuantity":0,"maxQuantity":1,"defaultQuantity":0,"retailPriceCents":40000,"tradePriceCents":28000,"leadTimeWeeks":10,"metadata":{},"position":2,"isActive":true}
      ],"rules":[]
    }'::jsonb,
    1
  );
  SELECT (value->>'id')::uuid INTO v_left FROM jsonb_array_elements(v_schema->'components') WHERE value->>'code' = 'left-arm';
  SELECT (value->>'id')::uuid INTO v_armless FROM jsonb_array_elements(v_schema->'components') WHERE value->>'code' = 'armless';
  SELECT (value->>'id')::uuid INTO v_right FROM jsonb_array_elements(v_schema->'components') WHERE value->>'code' = 'right-arm';
  ASSERT v_schema#>>'{summary,minRetailPriceCents}' = '40000',
    'component-sum summary must use cheapest buildable module, not family base';

  v_eval := public.evaluate_product_configuration('4c000000-0000-4000-8000-000000000102', NULL, '{}', '[]');
  ASSERT NOT (v_eval->>'complete')::boolean, 'empty sectional cannot be approved as a $0 configuration';
  v_eval := public.evaluate_product_configuration(
    '4c000000-0000-4000-8000-000000000102', NULL, '{}',
    jsonb_build_array(
      jsonb_build_object('componentId', v_armless, 'quantity', 1),
      jsonb_build_object('componentId', v_armless, 'quantity', 1)
    )
  );
  ASSERT NOT (v_eval->>'valid')::boolean, 'duplicate modular component IDs must be invalid';
  v_eval := public.evaluate_product_configuration(
    '4c000000-0000-4000-8000-000000000102', NULL, '{}',
    jsonb_build_array(
      jsonb_build_object('componentId', v_left, 'quantity', 1, 'handedness', 'left'),
      jsonb_build_object('componentId', v_armless, 'quantity', 2),
      jsonb_build_object('componentId', v_right, 'quantity', 1, 'handedness', 'right')
    )
  );
  ASSERT (v_eval->>'valid')::boolean AND (v_eval->>'complete')::boolean,
    'handed sectional with seats must be complete';
  ASSERT (v_eval->>'retailPriceCents')::integer = 180000,
    'component-sum pricing must ignore the flat family base';
  ASSERT (v_eval#>>ARRAY['componentQuantities', v_armless::text])::integer = 2,
    'component quantities must round-trip by stable component UUID';

  v_raised := false;
  BEGIN
    PERFORM public.save_product_configuration(jsonb_build_object(
      'productId', '4c000000-0000-4000-8000-000000000101',
      'selections', jsonb_build_object('size', jsonb_build_array(v_queen)),
      'components', jsonb_build_array(jsonb_build_object('componentId', v_armless, 'quantity', 1))
    ));
  EXCEPTION WHEN check_violation THEN v_raised := true;
  END;
  ASSERT v_raised, 'variant saves cannot smuggle configured components';

  -- 3. Table: material/finish compatibility and lead-time adjustments.
  v_schema := public.upsert_product_configuration_schema(
    '4c000000-0000-4000-8000-000000000103',
    '{
      "mode":"configured","pricingStrategy":"base_plus_adjustments",
      "optionGroups":[
        {"id":"draft-material","code":"material","name":"Material","selectionType":"single","required":true,"minSelections":1,"maxSelections":1,"position":0,"values":[
          {"id":"draft-walnut","code":"walnut","label":"Walnut","retailPriceDeltaCents":10000,"tradePriceDeltaCents":7000,"leadTimeDeltaWeeks":2,"metadata":{},"position":0,"isActive":true},
          {"id":"draft-oak","code":"oak","label":"Oak","retailPriceDeltaCents":0,"tradePriceDeltaCents":0,"leadTimeDeltaWeeks":0,"metadata":{},"position":1,"isActive":true}]},
        {"id":"draft-finish","code":"finish","name":"Finish","selectionType":"single","required":true,"minSelections":1,"maxSelections":1,"position":1,"values":[
          {"id":"draft-natural","code":"natural","label":"Natural","retailPriceDeltaCents":0,"tradePriceDeltaCents":0,"leadTimeDeltaWeeks":0,"metadata":{},"position":0,"isActive":true},
          {"id":"draft-painted","code":"painted","label":"Painted","retailPriceDeltaCents":5000,"tradePriceDeltaCents":3500,"leadTimeDeltaWeeks":1,"metadata":{},"position":1,"isActive":true}]}
      ],"variants":[],"components":[],
      "rules":[{"id":"draft-rule","code":"walnut-painted","name":"Walnut cannot be painted","ruleType":"exclusion","condition":{"selectedOptionValues":{"material":["walnut"],"finish":["painted"]}},"effect":{"allowed":false},"message":"Walnut is only available in a natural finish.","priority":0,"isActive":true}]
    }'::jsonb,
    1
  );
  SELECT (value->>'id')::uuid INTO v_walnut FROM jsonb_array_elements(v_schema#>'{optionGroups,0,values}') WHERE value->>'code' = 'walnut';
  SELECT (value->>'id')::uuid INTO v_natural FROM jsonb_array_elements(v_schema#>'{optionGroups,1,values}') WHERE value->>'code' = 'natural';
  SELECT (value->>'id')::uuid INTO v_painted FROM jsonb_array_elements(v_schema#>'{optionGroups,1,values}') WHERE value->>'code' = 'painted';
  v_eval := public.evaluate_product_configuration('4c000000-0000-4000-8000-000000000103', NULL, ARRAY[v_walnut,v_painted], '[]');
  ASSERT NOT (v_eval->>'valid')::boolean, 'walnut + painted must violate compatibility';
  v_eval := public.evaluate_product_configuration('4c000000-0000-4000-8000-000000000103', NULL, ARRAY[v_walnut,v_natural], '[]');
  ASSERT (v_eval->>'valid')::boolean AND (v_eval->>'retailPriceCents')::integer = 60000,
    'walnut + natural must price base plus material';
  ASSERT (v_eval->>'leadTimeWeeks')::integer = 10, 'material lead delta must resolve';

  v_raised := false;
  BEGIN
    PERFORM public.save_product_configuration(jsonb_build_object(
      'productId', '4c000000-0000-4000-8000-000000000103',
      'variantId', v_king_variant,
      'selections', '{}'::jsonb,
      'components', '[]'::jsonb
    ));
  EXCEPTION WHEN check_violation THEN v_raised := true;
  END;
  ASSERT v_raised, 'configured saves cannot smuggle an exact variant';

  -- 4. Cabinetry: custom brief → draft RFQ → quote → both approvals → issued spec.
  v_schema := public.upsert_product_configuration_schema(
    '4c000000-0000-4000-8000-000000000104',
    '{"mode":"custom","pricingStrategy":"base_plus_adjustments","optionGroups":[],"variants":[],"components":[],"rules":[]}'::jsonb,
    1
  );
  v_raised := false;
  BEGIN
    PERFORM public.save_product_configuration(jsonb_build_object(
      'productId', '4c000000-0000-4000-8000-000000000104',
      'projectId', '4c000000-0000-4000-8000-000000000030',
      'selections', jsonb_build_object('finish', jsonb_build_array('painted')),
      'components', '[]'::jsonb,
      'customBrief', jsonb_build_object('summary', 'Invalid selected custom brief')
    ));
  EXCEPTION WHEN check_violation THEN v_raised := true;
  END;
  ASSERT v_raised, 'custom saves cannot retain option selections';
  v_saved := public.save_product_configuration(jsonb_build_object(
    'productId', '4c000000-0000-4000-8000-000000000104',
    'projectId', '4c000000-0000-4000-8000-000000000030',
    'name', 'Library Wall Cabinet',
    'selections', '{}'::jsonb,
    'components', '[]'::jsonb,
    'customBrief', jsonb_build_object(
      'summary', 'Wall-to-wall cabinetry with field-verified dimensions',
      'fabricatorVendorId', '4c000000-0000-4000-8000-000000000020',
      'priceOnRequest', true,
      'measurements', jsonb_build_array(jsonb_build_object('label','width','value',144,'unit','in')),
      'drawings', jsonb_build_array(jsonb_build_object('name','Elevation A','url','https://example.invalid/elevation-a.pdf')),
      'designerApproval', jsonb_build_object('status','pending'),
      'clientApproval', jsonb_build_object('status','pending')
    )
  ));
  v_custom_config_id := (v_saved#>>'{configuration,id}')::uuid;
  v_revision_id := (v_saved#>>'{customRevision,id}')::uuid;
  ASSERT v_revision_id IS NOT NULL, 'custom save must atomically return exactly one revision';
  ASSERT (v_saved#>>'{configuration,retailPriceCents}') IS NULL,
    'price-on-request custom work must remain nullable, never $0';
  ASSERT (SELECT studio_id = '4c000000-0000-4000-8000-000000000010'
          FROM public.product_configurations WHERE id = v_custom_config_id),
    'project studio must own the collaboration scope even for a personal product';

  v_rfq := public.prepare_configuration_quote_request(
    v_custom_config_id, '4c000000-0000-4000-8000-000000000020',
    'Fabricate cabinetry', '12 weeks', 'Draft for review'
  );
  ASSERT v_rfq->>'status' = 'draft', 'configuration RFQ must never auto-send';
  ASSERT v_rfq#>'{configurationSnapshot,customCommission,brief,measurements}' IS NOT NULL,
    'RFQ snapshot must carry custom measurements/drawings';
  ASSERT (SELECT sent_at IS NULL FROM public.vendor_quote_requests WHERE id = (v_rfq->>'id')::uuid),
    'draft RFQ must never set sent_at';
  ASSERT v_rfq->>'configurationSnapshotHash'
      = pg_temp.configuration_snapshot_hash(v_rfq->'configurationSnapshot'),
    'RFQ hash must be recomputed from the authoritative snapshot';
  UPDATE public.vendor_quote_requests
  SET configuration_snapshot_hash = 'caller-supplied-corrupt-hash'
  WHERE id = (v_rfq->>'id')::uuid;
  ASSERT (SELECT configuration_snapshot_hash = pg_temp.configuration_snapshot_hash(configuration_snapshot)
          FROM public.vendor_quote_requests WHERE id = (v_rfq->>'id')::uuid),
    'RFQ guard must ignore caller-supplied hashes and recompute them';
  v_raised := false;
  BEGIN
    UPDATE public.vendor_quote_requests
    SET configuration_snapshot = configuration_snapshot || '{"tampered":true}'::jsonb
    WHERE id = (v_rfq->>'id')::uuid;
  EXCEPTION WHEN object_not_in_prerequisite_state THEN v_raised := true;
  END;
  ASSERT v_raised, 'draft RFQ cannot diverge from the authoritative configuration/revision snapshot';

  PERFORM public.transition_custom_commission_revision(v_revision_id, 'submitted', 'Ready for fabricator', '{}');
  BEGIN
    PERFORM public.transition_custom_commission_revision(v_revision_id, 'quoted', 'Incomplete quote',
      '{"quote":{"currency":"USD","receivedAt":"2026-08-02T00:00:00Z"}}');
    RAISE EXCEPTION 'price-free custom quote unexpectedly accepted';
  EXCEPTION WHEN check_violation THEN
    NULL;
  END;
  ASSERT (SELECT status = 'submitted' FROM public.custom_commission_revisions WHERE id = v_revision_id),
    'rejected price-free quote must leave the commission submitted';
  BEGIN
    PERFORM public.transition_custom_commission_revision(v_revision_id, 'quoted', 'Invalid quote',
      '{"quote":{"tradePriceCents":-1,"leadTimeWeeks":-2}}');
    RAISE EXCEPTION 'negative custom quote unexpectedly accepted';
  EXCEPTION WHEN check_violation THEN
    NULL;
  END;
  PERFORM public.transition_custom_commission_revision(v_revision_id, 'quoted', 'Quote received',
    '{"quote":{"quoteNumber":"Q-100","retailPriceCents":300000,"tradePriceCents":200000,"leadTimeWeeks":12}}');
  PERFORM public.transition_custom_commission_revision(v_revision_id, 'client_review', 'Ready for approvals', '{}');
  PERFORM pg_temp.reset_user();
  UPDATE public.product_configurations SET is_valid = false, is_complete = false
  WHERE id = v_custom_config_id;
  PERFORM pg_temp.assume_user('4c000000-0000-4000-8000-000000000001');
  v_raised := false;
  BEGIN
    PERFORM public.transition_custom_commission_revision(v_revision_id, 'approved', 'Premature approval',
      '{"approval":{"designerApproved":true,"clientApproved":true}}');
  EXCEPTION WHEN object_not_in_prerequisite_state THEN v_raised := true;
  END;
  ASSERT v_raised, 'custom approval cannot fabricate completeness';
  ASSERT (SELECT status = 'client_review' FROM public.custom_commission_revisions WHERE id = v_revision_id),
    'failed custom approval must leave its revision in client review';
  PERFORM pg_temp.reset_user();
  UPDATE public.product_configurations SET is_valid = true, is_complete = true
  WHERE id = v_custom_config_id;
  PERFORM pg_temp.assume_user('4c000000-0000-4000-8000-000000000001');
  PERFORM public.transition_custom_commission_revision(v_revision_id, 'approved', 'Designer and client approved',
    '{"approval":{"designerApproved":true,"clientApproved":true}}');
  ASSERT (SELECT status = 'approved' AND retail_price_cents = 300000 AND trade_price_cents = 200000
            AND is_valid AND is_complete
          FROM public.product_configurations WHERE id = v_custom_config_id),
    'custom approval must atomically enrich and approve without rewriting validity/completeness';
  ASSERT (SELECT snapshot#>>'{customCommission,quote,quoteNumber}' = 'Q-100'
          FROM public.product_configurations WHERE id = v_custom_config_id),
    'approved snapshot must include the quote revision';

  v_place := public.place_product_configuration_in_project(
    '4c000000-0000-4000-8000-000000000030', v_custom_config_id,
    NULL, NULL, 'casework', '{"client":"test"}'
  );
  v_item_id := (v_place->>'ffeItemId')::uuid;
  ASSERT (SELECT configuration_locked_at IS NOT NULL
            AND configuration_snapshot_hash = (SELECT snapshot_hash FROM public.product_configurations WHERE id = v_custom_config_id)
          FROM public.project_ffe_specs WHERE ffe_item_id = v_item_id),
    'issued cabinetry must lock the exact approved snapshot on the FF&E spec';
  ASSERT (SELECT status = 'issued' FROM public.custom_commission_revisions WHERE id = v_revision_id),
    'custom revision issuance must be atomic with placement';
  ASSERT (SELECT unit_price_cents = 300000 AND trade_price_cents = 200000
          FROM public.project_ffe_items WHERE id = v_item_id),
    'approved quote prices must flow to procurement line money';

  v_po := public.create_purchase_order(
    '4c000000-0000-4000-8000-000000000030',
    '4c000000-0000-4000-8000-000000000020',
    'net_30', ARRAY[v_item_id]::uuid[]
  );
  v_po_id := v_po.id;
  ASSERT v_po.total_cents = 200000,
    'real PO creation must use the immutable configuration trade snapshot';
  v_history := public.get_product_configuration(v_custom_config_id);
  ASSERT (v_history->>'ffeItemId')::uuid = v_item_id
      AND v_history->>'status' = 'issued'
      AND (SELECT purchase_order_id = v_po_id FROM public.project_ffe_items WHERE id = v_item_id),
    'exact issued configuration must retain its PO-linked FF&E item for fulfillment readiness';
  ASSERT (SELECT configuration_locked_at IS NOT NULL FROM public.project_ffe_specs WHERE ffe_item_id = v_item_id),
    'PO linkage must preserve/establish the approved lock';

  -- Fulfillment facts append evidence without rewriting commercial/spec truth.
  SELECT configuration_snapshot_hash INTO v_snapshot_hash
  FROM public.project_ffe_specs WHERE ffe_item_id = v_item_id;
  v_raised := false;
  BEGIN
    PERFORM public.record_custom_commission_milestone(
      v_custom_config_id, 'receiving', 'received', '{"packingSlip":"early"}', '[]', 'Out of order'
    );
  EXCEPTION WHEN object_not_in_prerequisite_state THEN v_raised := true;
  END;
  ASSERT v_raised, 'receiving cannot precede an approved submittal';

  PERFORM public.record_custom_commission_milestone(
    v_custom_config_id, 'submittal', 'pending', '{}', '[]', 'Submittal opened'
  );
  PERFORM public.record_custom_commission_milestone(
    v_custom_config_id, 'submittal', 'rejected', '{"reason":"Revise hinge detail"}', '[]', 'Revise and resubmit'
  );
  v_milestone := public.record_custom_commission_milestone(
    v_custom_config_id, 'submittal', 'approved', '{"drawing":"A-301 rev B"}', '[]', 'Corrected submittal approved'
  );
  ASSERT jsonb_array_length(v_milestone->'events') = 3
      AND v_milestone#>>'{events,2,fromStatus}' = 'rejected',
    'a rejected milestone must accept corrected evidence while preserving all events';
  PERFORM public.record_custom_commission_milestone(
    v_custom_config_id, 'receiving', 'received', '{"packingSlip":"PS-100"}', '[]', 'Received in full'
  );
  PERFORM public.record_custom_commission_milestone(
    v_custom_config_id, 'installed', 'installed', '{"sitePhoto":"install-100"}', '[]', 'Installed and verified'
  );
  v_milestones := public.list_custom_commission_milestones(v_custom_config_id);
  ASSERT jsonb_array_length(v_milestones) = 3,
    'submittal, receiving, and installed truth must be queryable as a single ledger';
  ASSERT (SELECT status = 'installed' FROM public.project_ffe_items WHERE id = v_item_id),
    'installed milestone must advance the project FF&E line';
  ASSERT (SELECT configuration_snapshot_hash = v_snapshot_hash
            AND configuration_snapshot_hash = pg_temp.configuration_snapshot_hash(configuration_snapshot)
          FROM public.project_ffe_specs WHERE ffe_item_id = v_item_id),
    'fulfillment events cannot rewrite the locked configuration snapshot';

  v_raised := false;
  BEGIN
    UPDATE public.project_ffe_items SET trade_price_cents = 1 WHERE id = v_item_id;
  EXCEPTION WHEN object_not_in_prerequisite_state THEN v_raised := true;
  END;
  ASSERT v_raised, 'locked custom line commercial values are immutable';
  v_raised := false;
  BEGIN
    DELETE FROM public.project_ffe_specs WHERE ffe_item_id = v_item_id;
  EXCEPTION WHEN object_not_in_prerequisite_state THEN v_raised := true;
  END;
  ASSERT v_raised, 'locked configuration specifications cannot be deleted';

  -- Approved/issued history cannot be edited or deleted, and a fork keeps it.
  PERFORM pg_temp.reset_user();
  v_raised := false;
  BEGIN
    DELETE FROM public.product_configurations WHERE id = v_custom_config_id;
  EXCEPTION WHEN object_not_in_prerequisite_state THEN v_raised := true;
  END;
  ASSERT v_raised, 'issued configuration cannot be deleted';
  PERFORM pg_temp.assume_user('4c000000-0000-4000-8000-000000000001');

  v_saved := public.save_product_configuration(jsonb_build_object(
    'productId', '4c000000-0000-4000-8000-000000000104',
    'configurationId', v_custom_config_id,
    'expectedVersion', 1,
    'projectId', '4c000000-0000-4000-8000-000000000030',
    'ffeItemId', v_item_id,
    'name', 'Library Wall Cabinet Rev 2',
    'selections', '{}'::jsonb,
    'components', '[]'::jsonb,
    'customBrief', jsonb_build_object(
      'summary', 'Revised wall-to-wall cabinetry',
      'fabricatorVendorId', '4c000000-0000-4000-8000-000000000020',
      'priceOnRequest', true
    )
  ));
  v_custom_config_v2 := (v_saved#>>'{configuration,id}')::uuid;
  ASSERT (v_saved#>>'{customRevision,revisionNumber}')::integer = 2,
    'forked configuration must continue the commission revision number';
  ASSERT (v_saved#>>'{customRevision,previousRevisionId}')::uuid = v_revision_id,
    'forked revision must link to the prior immutable revision';
  v_revision_v2 := (v_saved#>>'{customRevision,id}')::uuid;
  v_history := public.list_custom_commission_revisions(v_custom_config_v2);
  ASSERT jsonb_array_length(v_history) = 2,
    'revision ledger must traverse all configuration versions in the key chain';

  -- Sent RFQs freeze; an active commission revision can atomically supersede/fork.
  v_rfq := public.prepare_configuration_quote_request(
    v_custom_config_v2, '4c000000-0000-4000-8000-000000000020',
    'Revision 2 cabinetry', '12 weeks', 'Review revision 2'
  );
  v_rfq_id := (v_rfq->>'id')::uuid;
  UPDATE public.vendor_quote_requests SET status = 'sent', sent_at = now() WHERE id = v_rfq_id;
  v_raised := false;
  BEGIN
    UPDATE public.vendor_quote_requests SET status = 'draft' WHERE id = v_rfq_id;
  EXCEPTION WHEN check_violation THEN v_raised := true;
  END;
  ASSERT v_raised, 'sent RFQs cannot regress to draft';
  v_raised := false;
  BEGIN
    UPDATE public.vendor_quote_requests
    SET configuration_snapshot = configuration_snapshot || '{"tampered":true}'::jsonb
    WHERE id = v_rfq_id;
  EXCEPTION WHEN object_not_in_prerequisite_state THEN v_raised := true;
  END;
  ASSERT v_raised, 'sent RFQ snapshots are immutable';
  v_raised := false;
  BEGIN
    DELETE FROM public.vendor_quote_requests WHERE id = v_rfq_id;
  EXCEPTION WHEN object_not_in_prerequisite_state THEN v_raised := true;
  END;
  ASSERT v_raised, 'sent linked RFQs cannot be deleted';

  v_rfq := public.prepare_configuration_quote_request(
    v_custom_config_v2, '4c000000-0000-4000-8000-000000000020',
    'Revision 2 follow-up', '12 weeks', 'Draft follow-up'
  );
  v_draft_rfq_id := (v_rfq->>'id')::uuid;
  v_history := public.create_custom_commission_revision(
    v_custom_config_v2,
    '{"brief":{"summary":"Revision 3 draft","fabricatorVendorId":"4c000000-0000-4000-8000-000000000020","priceOnRequest":true}}'
  );
  v_revision_v3 := (v_history->>'id')::uuid;
  v_custom_config_v3 := (v_history->>'configurationId')::uuid;
  ASSERT (SELECT status = 'superseded' FROM public.custom_commission_revisions WHERE id = v_revision_v2)
      AND (SELECT status = 'superseded' FROM public.product_configurations WHERE id = v_custom_config_v2),
    'draft revision and saved configuration must supersede atomically';
  ASSERT (SELECT status = 'closed' FROM public.vendor_quote_requests WHERE id = v_draft_rfq_id)
      AND (SELECT status = 'sent' FROM public.vendor_quote_requests WHERE id = v_rfq_id),
    'revision fork closes only draft RFQs while preserving sent history';

  PERFORM public.transition_custom_commission_revision(v_revision_v3, 'submitted', 'Submitted revision 3', '{}');
  v_history := public.create_custom_commission_revision(
    v_custom_config_v3,
    '{"brief":{"summary":"Revision 4 draft","fabricatorVendorId":"4c000000-0000-4000-8000-000000000020","priceOnRequest":true}}'
  );
  v_revision_v4 := (v_history->>'id')::uuid;
  v_custom_config_v4 := (v_history->>'configurationId')::uuid;
  ASSERT (SELECT status = 'superseded' FROM public.custom_commission_revisions WHERE id = v_revision_v3),
    'submitted custom revision can be superseded by an atomic fork';

  PERFORM public.transition_custom_commission_revision(v_revision_v4, 'submitted', 'Submitted revision 4', '{}');
  PERFORM public.transition_custom_commission_revision(v_revision_v4, 'quoted', 'Quote revision 4',
    '{"quote":{"retailPriceCents":310000,"tradePriceCents":210000,"leadTimeWeeks":13}}');
  v_history := public.create_custom_commission_revision(
    v_custom_config_v4,
    '{"brief":{"summary":"Revision 5 draft","fabricatorVendorId":"4c000000-0000-4000-8000-000000000020","priceOnRequest":true}}'
  );
  v_revision_v5 := (v_history->>'id')::uuid;
  v_custom_config_v5 := (v_history->>'configurationId')::uuid;
  ASSERT (SELECT status = 'superseded' FROM public.custom_commission_revisions WHERE id = v_revision_v4),
    'quoted custom revision can be superseded by an atomic fork';

  PERFORM public.transition_custom_commission_revision(v_revision_v5, 'submitted', 'Submitted revision 5', '{}');
  PERFORM public.transition_custom_commission_revision(v_revision_v5, 'quoted', 'Quote revision 5',
    '{"quote":{"retailPriceCents":320000,"tradePriceCents":220000,"leadTimeWeeks":14}}');
  PERFORM public.transition_custom_commission_revision(v_revision_v5, 'client_review', 'Review revision 5', '{}');
  v_history := public.create_custom_commission_revision(
    v_custom_config_v5,
    '{"brief":{"summary":"Revision 6 draft","fabricatorVendorId":"4c000000-0000-4000-8000-000000000020","priceOnRequest":true}}'
  );
  v_revision_v6 := (v_history->>'id')::uuid;
  v_custom_config_v6 := (v_history->>'configurationId')::uuid;
  ASSERT (SELECT status = 'superseded' FROM public.custom_commission_revisions WHERE id = v_revision_v5),
    'client-review custom revision can be superseded by an atomic fork';
  PERFORM public.transition_custom_commission_revision(v_revision_v6, 'submitted', 'Submitted revision 6', '{}');
  PERFORM public.transition_custom_commission_revision(v_revision_v6, 'quoted', 'Quote revision 6',
    '{"quote":{"retailPriceCents":330000,"tradePriceCents":230000,"leadTimeWeeks":15}}');
  PERFORM public.transition_custom_commission_revision(v_revision_v6, 'client_review', 'Review revision 6', '{}');
  PERFORM public.transition_custom_commission_revision(v_revision_v6, 'rejected', 'Client requested another direction',
    '{"approval":{"designerApproved":false,"clientApproved":false}}');
  ASSERT (SELECT status = 'rejected' FROM public.custom_commission_revisions WHERE id = v_revision_v6),
    'client review exposes an explicit auditable rejection path';
  v_history := public.list_custom_commission_revisions(v_custom_config_v6);
  ASSERT jsonb_array_length(v_history) = 6,
    'revision ledger must include every immutable configuration version';

  -- Promotion creates a sanitized, project-agnostic template; instantiation
  -- creates a fresh project key and custom workflow instead of reusing truth.
  v_template := public.promote_configuration_to_library(v_custom_config_id, 'Reusable Cabinet Intent');
  v_custom_template_id := (v_template->>'id')::uuid;
  ASSERT v_template->>'projectId' IS NULL
      AND (v_template->>'previousConfigurationId')::uuid = v_custom_config_id
      AND (v_template->>'configurationKey')::uuid
        <> (SELECT configuration_key FROM public.product_configurations WHERE id = v_custom_config_id),
    'promoted custom template must be project-agnostic with a fresh key';
  ASSERT NOT (v_template->'customBrief' ? 'measurements')
      AND NOT (v_template->'customBrief' ? 'fabricatorVendorId')
      AND NOT (v_template->'snapshot' ? 'customCommission')
      AND v_template#>>'{snapshot,retailPriceCents}' IS NULL
      AND v_template#>>'{snapshot,tradePriceCents}' IS NULL,
    'promoted custom templates must strip project/vendor/drawing/quote/commercial facts';
  v_instance := public.instantiate_product_configuration_template(
    v_custom_template_id, '4c000000-0000-4000-8000-000000000030', 'Cabinet Intent Instance'
  );
  v_custom_instance_id := (v_instance#>>'{configuration,id}')::uuid;
  ASSERT (v_instance#>>'{configuration,projectId}')::uuid = '4c000000-0000-4000-8000-000000000030'
      AND (v_instance#>>'{configuration,previousConfigurationId}')::uuid = v_custom_template_id
      AND v_instance#>>'{customRevision,status}' = 'draft',
    'template instantiation must create a project-scoped saved config and draft commission';
  SELECT count(*) INTO v_count FROM public.product_configurations
  WHERE previous_configuration_id = v_custom_template_id;
  v_raised := false;
  BEGIN
    PERFORM public.place_product_configuration_in_project(
      '4c000000-0000-4000-8000-000000000030', v_custom_template_id,
      NULL, NULL, 'casework', '{}'
    );
  EXCEPTION WHEN object_not_in_prerequisite_state THEN v_raised := true;
  END;
  ASSERT v_raised AND v_count = (
      SELECT count(*) FROM public.product_configurations
      WHERE previous_configuration_id = v_custom_template_id
    ),
    'generic placement cannot bypass custom approval or leave an orphan template instance';

  -- Project approval owns locking and commercial materialization. Replacement
  -- is an optimistic atomic revision that deliberately requires reapproval.
  v_place := public.place_product_configuration_in_project(
    '4c000000-0000-4000-8000-000000000030', v_config_id,
    NULL, NULL, 'bed', '{"placement":"ordinary-a"}'
  );
  v_reuse_config_a := (v_place->>'configurationId')::uuid;
  v_place := public.place_product_configuration_in_project(
    '4c000000-0000-4000-8000-000000000030', v_config_id,
    NULL, NULL, 'bed', '{"placement":"ordinary-b"}'
  );
  v_reuse_config_b := (v_place->>'configurationId')::uuid;
  ASSERT v_reuse_config_a <> v_config_id
      AND v_reuse_config_b <> v_config_id
      AND v_reuse_config_a <> v_reuse_config_b
      AND (SELECT project_id IS NULL AND status = 'approved' AND ffe_item_id IS NULL
           FROM public.product_configurations WHERE id = v_config_id)
      AND (SELECT bool_and(project_id = '4c000000-0000-4000-8000-000000000030'
               AND status = 'saved' AND ffe_item_id IS NOT NULL
               AND previous_configuration_id = v_config_id)
           FROM public.product_configurations
           WHERE id IN (v_reuse_config_a, v_reuse_config_b)),
    'each placement of an ordinary projectless configuration must create an independent project copy';

  v_template := public.promote_configuration_to_library(v_config_id, 'Queen Bed Template');
  v_bed_template_id := (v_template->>'id')::uuid;
  v_place := public.place_product_configuration_in_project(
    '4c000000-0000-4000-8000-000000000030', v_bed_template_id,
    NULL, NULL, 'bed', '{"client":"configuration-test"}'
  );
  v_bed_project_config_id := (v_place->>'configurationId')::uuid;
  v_bed_item_id := (v_place->>'ffeItemId')::uuid;
  v_bed_spec_id := (v_place->>'specId')::uuid;
  ASSERT v_bed_project_config_id <> v_bed_template_id
      AND (SELECT project_id IS NULL AND is_library_template AND status = 'saved'
           FROM public.product_configurations WHERE id = v_bed_template_id)
      AND (SELECT project_id = '4c000000-0000-4000-8000-000000000030'
             AND NOT is_library_template AND previous_configuration_id = v_bed_template_id
             AND ffe_item_id = v_bed_item_id
           FROM public.product_configurations WHERE id = v_bed_project_config_id),
    'placing a reusable template must atomically instantiate an independent project configuration';
  ASSERT (SELECT configuration_locked_at IS NULL FROM public.project_ffe_specs WHERE id = v_bed_spec_id),
    'saved noncustom project configuration starts unlocked';
  UPDATE public.project_ffe_items SET status = 'approved' WHERE id = v_bed_item_id;
  ASSERT (SELECT status = 'approved' FROM public.product_configurations WHERE id = v_bed_project_config_id)
      AND (SELECT configuration_locked_at IS NOT NULL FROM public.project_ffe_specs WHERE id = v_bed_spec_id)
      AND (SELECT unit_price_cents = 100000 AND trade_price_cents = 70000
           FROM public.project_ffe_items WHERE id = v_bed_item_id),
    'project FF&E approval atomically approves, prices, and locks a complete noncustom configuration';
  v_raised := false;
  BEGIN
    UPDATE public.project_ffe_items SET quantity = quantity + 1 WHERE id = v_bed_item_id;
  EXCEPTION WHEN object_not_in_prerequisite_state THEN v_raised := true;
  END;
  ASSERT v_raised, 'locked configured line quantity cannot drift from its commercial snapshot';
  v_raised := false;
  BEGIN
    UPDATE public.project_ffe_specs SET selected_dimensions = '{"width":1}' WHERE id = v_bed_spec_id;
  EXCEPTION WHEN object_not_in_prerequisite_state THEN v_raised := true;
  END;
  ASSERT v_raised, 'locked configuration-derived spec descriptors are immutable';
  UPDATE public.project_ffe_specs SET client_notes = 'Ordinary audience note remains editable' WHERE id = v_bed_spec_id;

  v_saved := public.save_product_configuration(jsonb_build_object(
    'productId', '4c000000-0000-4000-8000-000000000101',
    'configurationId', v_bed_project_config_id,
    'expectedVersion', 1,
    'projectId', '4c000000-0000-4000-8000-000000000030',
    'ffeItemId', v_bed_item_id,
    'name', 'Guest Queen Project Bed Rev 2',
    'selections', jsonb_build_object('size', jsonb_build_array(v_queen)),
    'components', '[]'::jsonb
  ));
  v_bed_project_config_v2 := (v_saved#>>'{configuration,id}')::uuid;
  v_history := public.get_product_configuration(v_bed_project_config_id);
  ASSERT (v_history->>'id')::uuid = v_bed_project_config_id
      AND (v_history->>'version')::integer = 1
      AND v_history->>'status' = 'approved',
    'exact configuration lookup must return a superseded/pinned historical version';
  v_template := public.list_product_configurations(
    '4c000000-0000-4000-8000-000000000101',
    '4c000000-0000-4000-8000-000000000030'
  );
  ASSERT NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(v_template) entry
      WHERE (entry->>'id')::uuid = v_bed_project_config_id
    ) AND EXISTS (
      SELECT 1 FROM jsonb_array_elements(v_template) entry
      WHERE (entry->>'id')::uuid = v_bed_project_config_v2
    ),
    'latest-lineage listing may omit the pinned version while exact lookup remains available';
  SELECT configuration_snapshot_hash INTO v_snapshot_hash
  FROM public.project_ffe_specs WHERE id = v_bed_spec_id;
  v_raised := false;
  BEGIN
    PERFORM public.revise_project_ffe_configuration(
      '4c000000-0000-4000-8000-000000000030', v_bed_item_id,
      v_bed_project_config_id, 1, v_snapshot_hash, v_custom_instance_id, 1
    );
  EXCEPTION WHEN object_not_in_prerequisite_state THEN v_raised := true;
  END;
  ASSERT v_raised,
    'in-place project replacement must reject custom mode and preserve the commission lifecycle';
  PERFORM public.revise_project_ffe_configuration(
    '4c000000-0000-4000-8000-000000000030', v_bed_item_id,
    v_bed_project_config_id, 1, v_snapshot_hash, v_bed_project_config_v2, 2
  );
  ASSERT (SELECT configuration_id = v_bed_project_config_v2
            AND configuration_locked_at IS NULL
            AND jsonb_array_length(routing_source->'configurationHistory') = 1
          FROM public.project_ffe_specs WHERE id = v_bed_spec_id)
      AND (SELECT status = 'specified' FROM public.project_ffe_items WHERE id = v_bed_item_id),
    'atomic configuration replacement records history, unlocks, and requires reapproval';
  UPDATE public.project_ffe_items SET status = 'approved' WHERE id = v_bed_item_id;
  ASSERT (SELECT status = 'approved' FROM public.product_configurations WHERE id = v_bed_project_config_v2)
      AND (SELECT configuration_locked_at IS NOT NULL FROM public.project_ffe_specs WHERE id = v_bed_spec_id),
    'replacement configuration must pass project approval before it relocks';

  -- The spec-book materializer includes locked configuration identity/snapshot
  -- in its canonical hash; only the design studio can reach publication RPCs.
  SELECT id INTO v_spec_book_id
  FROM public.ensure_project_spec_book('4c000000-0000-4000-8000-000000000030');
  INSERT INTO public.spec_book_item_settings (spec_book_id, ffe_item_id, included, position)
  VALUES (v_spec_book_id, v_bed_item_id, true, 1)
  ON CONFLICT (spec_book_id, ffe_item_id)
  DO UPDATE SET included = true, position = EXCLUDED.position;
  PERFORM pg_temp.reset_user();
  SELECT item_snapshot, content_hash INTO v_item_snapshot, v_content_hash
  FROM public._spec_book_current_item_snapshots(v_spec_book_id)
  WHERE ffe_item_id = v_bed_item_id;
  ASSERT (v_item_snapshot#>>'{configuration,id}')::uuid = v_bed_project_config_v2
      AND v_item_snapshot#>>'{configuration,snapshotHash}'
        = (SELECT snapshot_hash FROM public.product_configurations WHERE id = v_bed_project_config_v2)
      AND v_item_snapshot#>>'{configuration,lockedAt}' IS NOT NULL,
    'spec publication materializer must carry exact configuration identity, snapshot hash, and lock time';
  ASSERT v_content_hash = encode(extensions.digest(
      public._spec_book_canonical_json(v_item_snapshot), 'sha256'), 'hex'),
    'configuration envelope must participate in canonical revision content hashing';
  ASSERT NOT has_function_privilege('authenticated',
      'public._spec_book_current_item_snapshots(uuid)', 'EXECUTE'),
    'raw spec materializer must remain inaccessible to authenticated audiences';
  PERFORM pg_temp.assume_user('4c000000-0000-4000-8000-000000000002');
  v_raised := false;
  BEGIN
    PERFORM public.prepare_spec_book_issue(
      v_spec_book_id, ARRAY['client'], 'initial', 'unauthorized probe', NULL,
      'configuration-privacy-probe', '[]'
    );
  EXCEPTION WHEN insufficient_privilege THEN v_raised := true;
  END;
  ASSERT v_raised, 'non-studio actors cannot prepare raw commercial spec revisions';
  PERFORM pg_temp.reset_user();
  PERFORM pg_temp.assume_user('4c000000-0000-4000-8000-000000000001');

  -- A same-lineage row outside the caller's owner/studio/project boundary is
  -- filtered row-by-row instead of leaking through an accessible key.
  PERFORM pg_temp.reset_user();
  INSERT INTO public.product_configurations
  SELECT (jsonb_populate_record(NULL::public.product_configurations,
    to_jsonb(c) || jsonb_build_object(
      'id', '4c000000-0000-4000-8000-000000000199',
      'previous_configuration_id', v_custom_config_v6,
      'project_id', NULL,
      'ffe_item_id', NULL,
      'owner_user_id', '4c000000-0000-4000-8000-000000000002',
      'studio_id', '4c000000-0000-4000-8000-000000000011',
      'version', 999,
      'status', 'saved',
      'is_library_template', false,
      'approved_by', NULL,
      'approved_at', NULL,
      'issued_at', NULL
    ))).* FROM public.product_configurations c WHERE c.id = v_custom_config_v6;
  INSERT INTO public.custom_commission_revisions
  SELECT (jsonb_populate_record(NULL::public.custom_commission_revisions,
    to_jsonb(r) || jsonb_build_object(
      'id', '4c000000-0000-4000-8000-000000000198',
      'configuration_id', '4c000000-0000-4000-8000-000000000199',
      'revision_number', 999,
      'previous_revision_id', v_revision_v6,
      'status', 'draft',
      'created_by', '4c000000-0000-4000-8000-000000000002',
      'submitted_at', NULL,
      'quoted_at', NULL,
      'approved_at', NULL,
      'issued_at', NULL
    ))).* FROM public.custom_commission_revisions r WHERE r.id = v_revision_v6;
  PERFORM pg_temp.assume_user('4c000000-0000-4000-8000-000000000001');
  v_history := public.list_custom_commission_revisions(v_custom_config_v6);
  ASSERT jsonb_array_length(v_history) = 6,
    'lineage list must filter every revision row through configuration access';

  PERFORM pg_temp.reset_user();
  UPDATE public.products SET configuration_revision = configuration_revision + 1
  WHERE id = '4c000000-0000-4000-8000-000000000104';
  PERFORM pg_temp.assume_user('4c000000-0000-4000-8000-000000000001');
  v_milestones := public.list_custom_commission_milestones(v_custom_config_id);
  ASSERT (v_milestones#>>'{0,sourceChanged}')::boolean
      AND (v_milestones#>>'{0,currentSchemaRevision}')::integer
        > (SELECT schema_revision FROM public.product_configurations WHERE id = v_custom_config_id),
    'fulfillment reads must signal that their product source definition changed';

  -- Cross-studio reader cannot see or load a personal product definition.
  PERFORM pg_temp.reset_user();
  PERFORM pg_temp.assume_user('4c000000-0000-4000-8000-000000000002');
  SELECT count(*) INTO v_count
  FROM public.product_option_groups WHERE product_id = '4c000000-0000-4000-8000-000000000101';
  ASSERT v_count = 0, 'personal option definitions must not leak across studios';
  v_raised := false;
  BEGIN
    PERFORM public.get_product_configuration_schema('4c000000-0000-4000-8000-000000000101');
  EXCEPTION WHEN insufficient_privilege THEN v_raised := true;
  END;
  ASSERT v_raised, 'schema RPC must enforce the Product layer boundary';
  v_raised := false;
  BEGIN
    PERFORM public.get_product_configuration(v_config_id);
  EXCEPTION WHEN insufficient_privilege THEN v_raised := true;
  END;
  ASSERT v_raised, 'exact configuration lookup must enforce the owner/studio/project boundary';

  -- ═════════════════════════════════════════════════════════════════════════
  -- 00413 — COM/COL and decision-carried selections
  -- ═════════════════════════════════════════════════════════════════════════
  PERFORM pg_temp.reset_user();
  PERFORM pg_temp.assume_user('4c000000-0000-4000-8000-000000000001');

  -- COM is authored on the option value and survives the definition round-trip.
  v_schema := public.upsert_product_configuration_schema(
    '4c000000-0000-4000-8000-000000000105',
    '{
      "mode":"configured","pricingStrategy":"base_plus_adjustments",
      "optionGroups":[
        {"code":"material","name":"Frame Material","selectionType":"single","required":true,"minSelections":1,"maxSelections":1,"position":0,"values":[
          {"code":"oak","label":"Oak","position":0},
          {"code":"walnut","label":"Walnut","retailPriceDeltaCents":20000,"tradePriceDeltaCents":14000,"position":1}]},
        {"code":"finish","name":"Finish","selectionType":"single","required":true,"minSelections":1,"maxSelections":1,"position":1,"values":[
          {"code":"natural","label":"Natural","position":0},
          {"code":"ebonized","label":"Ebonized","position":1}]},
        {"code":"fabric","name":"Fabric","selectionType":"single","required":true,"minSelections":1,"maxSelections":1,"position":2,"values":[
          {"code":"house-linen","label":"House Linen","position":0},
          {"code":"com","label":"Customer''s Own Material","allowsCom":true,"comRequirements":{"yardageMinimum":14,"railroaded":true},"position":1}]}
      ],"variants":[],"components":[],"rules":[]
    }'::jsonb,
    1
  );
  ASSERT (SELECT (value->>'allowsCom')::boolean
            AND value#>>'{comRequirements,yardageMinimum}' = '14'
          FROM jsonb_array_elements(v_schema#>'{optionGroups,2,values}')
          WHERE value->>'code' = 'com'),
    'COM flag and vendor requirements must round-trip through the definition RPCs';
  ASSERT (SELECT NOT (value->>'allowsCom')::boolean AND value->'comRequirements' = '{}'::jsonb
          FROM jsonb_array_elements(v_schema#>'{optionGroups,2,values}')
          WHERE value->>'code' = 'house-linen'),
    'option values default to non-COM with empty requirements';

  -- Re-authoring the same definition takes the DO UPDATE arm, not an insert.
  v_schema := public.upsert_product_configuration_schema(
    '4c000000-0000-4000-8000-000000000105',
    '{
      "mode":"configured","pricingStrategy":"base_plus_adjustments",
      "optionGroups":[
        {"code":"material","name":"Frame Material","selectionType":"single","required":true,"minSelections":1,"maxSelections":1,"position":0,"values":[
          {"code":"oak","label":"Oak","position":0},
          {"code":"walnut","label":"Walnut","retailPriceDeltaCents":20000,"tradePriceDeltaCents":14000,"position":1}]},
        {"code":"finish","name":"Finish","selectionType":"single","required":true,"minSelections":1,"maxSelections":1,"position":1,"values":[
          {"code":"natural","label":"Natural","position":0},
          {"code":"ebonized","label":"Ebonized","position":1}]},
        {"code":"fabric","name":"Fabric","selectionType":"single","required":true,"minSelections":1,"maxSelections":1,"position":2,"values":[
          {"code":"house-linen","label":"House Linen","position":0},
          {"code":"com","label":"Customer''s Own Material","allowsCom":true,"comRequirements":{"yardageMinimum":18,"railroaded":false,"shipTo":"Fabricator dock"},"position":1}]}
      ],"variants":[],"components":[],"rules":[]
    }'::jsonb,
    2
  );
  ASSERT (SELECT value#>>'{comRequirements,yardageMinimum}' = '18'
            AND value#>>'{comRequirements,shipTo}' = 'Fabricator dock'
          FROM jsonb_array_elements(v_schema#>'{optionGroups,2,values}')
          WHERE value->>'code' = 'com'),
    'edited COM requirements must update in place, not orphan the option value';

  SELECT (value->>'id')::uuid INTO v_com_oak
  FROM jsonb_array_elements(v_schema#>'{optionGroups,0,values}') WHERE value->>'code' = 'oak';
  SELECT (value->>'id')::uuid INTO v_com_walnut
  FROM jsonb_array_elements(v_schema#>'{optionGroups,0,values}') WHERE value->>'code' = 'walnut';
  SELECT (value->>'id')::uuid INTO v_com_natural
  FROM jsonb_array_elements(v_schema#>'{optionGroups,1,values}') WHERE value->>'code' = 'natural';
  SELECT (value->>'id')::uuid INTO v_com_ebonized
  FROM jsonb_array_elements(v_schema#>'{optionGroups,1,values}') WHERE value->>'code' = 'ebonized';
  SELECT (value->>'id')::uuid INTO v_com_house_linen
  FROM jsonb_array_elements(v_schema#>'{optionGroups,2,values}') WHERE value->>'code' = 'house-linen';
  SELECT (value->>'id')::uuid INTO v_com_value
  FROM jsonb_array_elements(v_schema#>'{optionGroups,2,values}') WHERE value->>'code' = 'com';

  -- Evaluation carries the COM flag into the selection snapshot for the PO.
  v_eval := public.evaluate_product_configuration(
    '4c000000-0000-4000-8000-000000000105', NULL,
    ARRAY[v_com_oak, v_com_natural, v_com_value], '[]'::jsonb
  );
  ASSERT (v_eval->>'valid')::boolean AND (v_eval->>'complete')::boolean,
    'a fully chosen COM sofa must evaluate valid and complete';
  ASSERT (SELECT (selection->>'allowsCom')::boolean
          FROM jsonb_array_elements(v_eval#>'{snapshot,selections}') AS chosen(selection)
          WHERE selection->>'groupCode' = 'fabric'),
    'the selection snapshot must say the fabric is customer-supplied';

  -- Saving records the fabric and hashes it with the rest of the snapshot.
  v_saved := public.save_product_configuration(jsonb_build_object(
    'productId', '4c000000-0000-4000-8000-000000000105',
    'name', 'COM Sofa in Belgian Linen',
    'selections', jsonb_build_object(
      'material', jsonb_build_array(v_com_oak),
      'finish', jsonb_build_array(v_com_natural),
      'fabric', jsonb_build_array(v_com_value)),
    'components', '[]'::jsonb,
    'comDetails', jsonb_build_object(
      'optionValueId', v_com_value, 'fabricName', 'Belgian Linen',
      'mill', 'Rogers & Goffigon', 'pattern', 'Kalahari',
      'yardage', 18, 'railroaded', true, 'sidemark', 'HAYES / LIVING')
  ));
  v_com_config_a := (v_saved#>>'{configuration,id}')::uuid;
  SELECT snapshot_hash INTO v_com_hash_a
  FROM public.product_configurations WHERE id = v_com_config_a;
  ASSERT (SELECT com_details->>'fabricName' = 'Belgian Linen'
            AND snapshot#>>'{comDetails,mill}' = 'Rogers & Goffigon'
            AND snapshot_hash = pg_temp.configuration_snapshot_hash(snapshot)
          FROM public.product_configurations WHERE id = v_com_config_a),
    'COM details must persist and be hashed as part of the immutable snapshot';

  v_raised := false;
  BEGIN
    PERFORM public.save_product_configuration(jsonb_build_object(
      'productId', '4c000000-0000-4000-8000-000000000105',
      'selections', jsonb_build_object(
        'material', jsonb_build_array(v_com_oak),
        'finish', jsonb_build_array(v_com_natural),
        'fabric', jsonb_build_array(v_com_house_linen)),
      'components', '[]'::jsonb,
      'comDetails', jsonb_build_object('optionValueId', v_com_value, 'fabricName', 'Unchosen')
    ));
  EXCEPTION WHEN foreign_key_violation THEN v_raised := true;
  END;
  ASSERT v_raised, 'COM details cannot name an option value the configuration did not select';

  v_raised := false;
  BEGIN
    PERFORM public.save_product_configuration(jsonb_build_object(
      'productId', '4c000000-0000-4000-8000-000000000106',
      'selections', '{}'::jsonb, 'components', '[]'::jsonb,
      'comDetails', jsonb_build_object('fabricName', 'Not for a plain piece')
    ));
  EXCEPTION WHEN invalid_parameter_value THEN v_raised := true;
  END;
  ASSERT v_raised, 'standard products must reject COM details outright';

  -- A different fabric is a different specification, so a different hash.
  v_saved := public.save_product_configuration(jsonb_build_object(
    'productId', '4c000000-0000-4000-8000-000000000105',
    'configurationId', v_com_config_a,
    'expectedVersion', 1,
    'name', 'COM Sofa in Mohair Velvet',
    'selections', jsonb_build_object(
      'material', jsonb_build_array(v_com_oak),
      'finish', jsonb_build_array(v_com_natural),
      'fabric', jsonb_build_array(v_com_value)),
    'components', '[]'::jsonb,
    'comDetails', jsonb_build_object(
      'optionValueId', v_com_value, 'fabricName', 'Mohair Velvet', 'mill', 'Pierre Frey')
  ));
  v_com_config_b := (v_saved#>>'{configuration,id}')::uuid;
  SELECT snapshot_hash INTO v_com_hash_b
  FROM public.product_configurations WHERE id = v_com_config_b;
  ASSERT v_com_hash_b IS DISTINCT FROM v_com_hash_a,
    'changing only the COM fabric must change the configuration hash';

  -- One row, one snapshot. The evaluation must describe what was hashed, or a
  -- reader that goes through the evaluation sees a COM piece with no fabric.
  ASSERT (SELECT bool_and(evaluation->'snapshot' = snapshot
                          AND snapshot ? 'comDetails')
          FROM public.product_configurations
          WHERE id IN (v_com_config_a, v_com_config_b)),
    'a saved COM configuration must not store two snapshots that disagree';

  -- Placement denormalizes a vendor-readable fabric line onto the spec, from
  -- the snapshot the project copy carries.
  v_place := public.place_product_configuration_in_project(
    '4c000000-0000-4000-8000-000000000030', v_com_config_b,
    NULL, NULL, 'seating', '{"placement":"com-sofa"}'
  );
  v_com_item_id := (v_place->>'ffeItemId')::uuid;
  v_com_spec_id := (v_place->>'specId')::uuid;
  ASSERT (SELECT color_fabric = 'Mohair Velvet — Pierre Frey'
            AND material = 'Oak' AND finish = 'Natural'
          FROM public.project_ffe_specs WHERE id = v_com_spec_id),
    'placement must denormalize the COM fabric alongside material and finish';
  UPDATE public.project_ffe_items SET status = 'approved' WHERE id = v_com_item_id;
  ASSERT (SELECT configuration_locked_at IS NOT NULL
            AND color_fabric = 'Mohair Velvet — Pierre Frey'
          FROM public.project_ffe_specs WHERE id = v_com_spec_id),
    'project approval must keep the COM fabric line while it locks the spec';

  -- Decision options carry a real configuration selection, not a typed delta.
  SELECT snapshot->'selections' INTO v_selections
  FROM public.product_configurations WHERE id = v_com_config_b;
  PERFORM pg_temp.reset_user();
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', '4c000000-0000-4000-8000-000000000001',
                      'role', 'authenticated')::text, true);

  v_decision_id := '4c000000-0000-4000-8000-000000000050';
  PERFORM public.create_client_decision(
    v_decision_id,
    jsonb_build_object(
      'designer_client_id', '4c000000-0000-4000-8000-000000000040',
      'project_id', '4c000000-0000-4000-8000-000000000031',
      'title', 'Living room sofa fabric',
      'status', 'pending',
      'blocking_status', 'non_blocking'),
    jsonb_build_array(jsonb_build_object(
      'name', 'COM Sofa in Mohair Velvet',
      'price', 240000,
      'quantity', 1,
      'product_id', '4c000000-0000-4000-8000-000000000105',
      'configuration_id', v_com_config_b,
      'selection_snapshot', v_selections,
      'sort_order', 0))
  );
  SELECT id INTO v_decision_option_id
  FROM public.client_decision_options WHERE decision_id = v_decision_id;
  ASSERT (SELECT configuration_id = v_com_config_b
            AND jsonb_typeof(selection_snapshot) = 'array'
            AND jsonb_array_length(selection_snapshot) = 3
          FROM public.client_decision_options WHERE id = v_decision_option_id),
    'decision options must carry configuration provenance and its selections';

  -- The fixture has to carry the leak for this to prove anything.
  ASSERT (SELECT COALESCE(bool_or(entry ? 'tradePriceDeltaCents'
                                  OR entry ? 'retailPriceDeltaCents'), false)
          FROM jsonb_array_elements(v_selections) AS chosen(entry)),
    'a configuration snapshot must carry price deltas, or this test is vacuous';
  -- The client reads this row. The trade side of the book does not go in it.
  ASSERT (SELECT COALESCE(bool_or(entry ? 'tradePriceDeltaCents'
                                  OR entry ? 'retailPriceDeltaCents'), false) = false
          FROM public.client_decision_options AS option,
               jsonb_array_elements(option.selection_snapshot) AS chosen(entry)
          WHERE option.id = v_decision_option_id),
    'a stored decision option must never carry trade or retail price deltas';

  -- Winning writes those selections onto the auto-created specification.
  PERFORM public._apply_client_decision_authorized(
    v_decision_id, v_decision_option_id,
    '4c000000-0000-4000-8000-000000000001', NULL, NULL, NULL, NULL
  );
  ASSERT (SELECT spec.material = 'Oak' AND spec.finish = 'Natural'
            AND spec.color_fabric = 'Customer''s Own Material'
          FROM public.project_ffe_specs AS spec
          JOIN public.project_ffe_items AS item ON item.id = spec.ffe_item_id
          WHERE item.source_decision_id = v_decision_id),
    'a winning option with selections must specify its FF&E line, not just price it';

  -- Replaying the same winner stays idempotent with the selection write in place.
  PERFORM public._apply_client_decision_authorized(
    v_decision_id, v_decision_option_id,
    '4c000000-0000-4000-8000-000000000001', NULL, NULL, NULL, NULL
  );
  ASSERT (SELECT count(*) = 1 FROM public.project_ffe_items
          WHERE source_decision_id = v_decision_id),
    'replaying the same winning option must not duplicate the FF&E line';

  -- A specification already locked to its own configuration is never
  -- rewritten by a later decision, even one the line answers.
  v_eval := public.evaluate_product_configuration(
    '4c000000-0000-4000-8000-000000000105', NULL,
    ARRAY[v_com_walnut, v_com_ebonized, v_com_value], '[]'::jsonb
  );
  v_other_selections := v_eval#>'{snapshot,selections}';
  v_locked_decision_id := '4c000000-0000-4000-8000-000000000051';
  PERFORM public.create_client_decision(
    v_locked_decision_id,
    jsonb_build_object(
      'designer_client_id', '4c000000-0000-4000-8000-000000000040',
      'project_id', '4c000000-0000-4000-8000-000000000031',
      'title', 'Already-specified sofa',
      'status', 'pending',
      'blocking_status', 'non_blocking'),
    jsonb_build_array(jsonb_build_object(
      'name', 'COM Sofa in Walnut and Ebonized',
      'price', 200000,
      'quantity', 1,
      'product_id', '4c000000-0000-4000-8000-000000000105',
      'configuration_id', v_com_config_b,
      'selection_snapshot', v_other_selections,
      'sort_order', 0))
  );
  SELECT id INTO v_locked_option_id
  FROM public.client_decision_options WHERE decision_id = v_locked_decision_id;

  v_saved := public.save_product_configuration(jsonb_build_object(
    'productId', '4c000000-0000-4000-8000-000000000105',
    'name', 'House Linen Sofa',
    'selections', jsonb_build_object(
      'material', jsonb_build_array(v_com_oak),
      'finish', jsonb_build_array(v_com_natural),
      'fabric', jsonb_build_array(v_com_house_linen)),
    'components', '[]'::jsonb
  ));
  v_locked_config_id := (v_saved#>>'{configuration,id}')::uuid;
  v_place := public.place_product_configuration_in_project(
    '4c000000-0000-4000-8000-000000000031', v_locked_config_id,
    NULL, NULL, 'seating', '{"placement":"already-specified"}'
  );
  v_locked_item_id := (v_place->>'ffeItemId')::uuid;
  UPDATE public.project_ffe_items SET status = 'approved' WHERE id = v_locked_item_id;
  UPDATE public.project_ffe_items
  SET source_decision_id = v_locked_decision_id WHERE id = v_locked_item_id;
  ASSERT (SELECT configuration_locked_at IS NOT NULL
            AND material = 'Oak' AND finish = 'Natural' AND color_fabric IS NULL
          FROM public.project_ffe_specs WHERE ffe_item_id = v_locked_item_id),
    'the locked fixture must start as an Oak/Natural configured line with no COM fabric';

  PERFORM public._apply_client_decision_authorized(
    v_locked_decision_id, v_locked_option_id,
    '4c000000-0000-4000-8000-000000000001', NULL, NULL, NULL, NULL
  );
  ASSERT (SELECT material = 'Oak' AND finish = 'Natural' AND color_fabric IS NULL
          FROM public.project_ffe_specs WHERE ffe_item_id = v_locked_item_id),
    'a locked specification must survive the decision feed-through untouched';

  -- Sanitizing is an allowlist rebuild, not a denylist filter: a snapshot key
  -- invented tomorrow cannot reach the client by being forgotten here.
  SELECT COALESCE(jsonb_agg(chosen.entry || jsonb_build_object(
           'internalMargin', 4200,
           'privateVendorNote', 'do not show the client')
         ORDER BY chosen.ord), '[]'::jsonb)
  INTO v_dirty_selections
  FROM jsonb_array_elements(v_selections) WITH ORDINALITY AS chosen(entry, ord);

  v_dirty_decision_id := '4c000000-0000-4000-8000-000000000052';
  PERFORM public.create_client_decision(
    v_dirty_decision_id,
    jsonb_build_object(
      'designer_client_id', '4c000000-0000-4000-8000-000000000040',
      'project_id', '4c000000-0000-4000-8000-000000000031',
      'title', 'Sofa fabric, second pass',
      'status', 'pending',
      'blocking_status', 'non_blocking'),
    jsonb_build_array(jsonb_build_object(
      'name', 'COM Sofa alternative',
      'price', 210000,
      'quantity', 1,
      'product_id', '4c000000-0000-4000-8000-000000000105',
      'selection_snapshot', v_dirty_selections,
      'sort_order', 0))
  );
  SELECT id, selection_snapshot INTO v_dirty_option_id, v_stored_snapshot
  FROM public.client_decision_options WHERE decision_id = v_dirty_decision_id;
  ASSERT jsonb_array_length(v_stored_snapshot)
         = jsonb_array_length(v_dirty_selections),
    'sanitizing must keep every selection entry, in order';
  ASSERT (SELECT COALESCE(bool_or(
            entry ? 'tradePriceDeltaCents' OR entry ? 'retailPriceDeltaCents'
            OR entry ? 'internalMargin' OR entry ? 'privateVendorNote'), false) = false
          FROM jsonb_array_elements(v_stored_snapshot) AS chosen(entry)),
    'create_client_decision must rebuild selection entries from the allowlist';
  ASSERT (SELECT bool_and(entry ? 'groupCode' AND entry ? 'valueLabel'
                          AND entry ? 'optionValueId')
          FROM jsonb_array_elements(v_stored_snapshot) AS chosen(entry)),
    'sanitizing must keep the vocabulary the specification feed-through reads';

  SELECT updated_at INTO v_dirty_updated_at
  FROM public.client_decisions WHERE id = v_dirty_decision_id;
  PERFORM public.update_client_decision(
    v_dirty_decision_id,
    '{}'::jsonb,
    jsonb_build_array(jsonb_build_object(
      'name', 'COM Sofa alternative, revised',
      'price', 215000,
      'quantity', 1,
      'product_id', '4c000000-0000-4000-8000-000000000105',
      'selection_snapshot', v_dirty_selections,
      'sort_order', 0)),
    v_dirty_updated_at
  );
  SELECT selection_snapshot INTO v_stored_snapshot
  FROM public.client_decision_options WHERE decision_id = v_dirty_decision_id;
  ASSERT (SELECT COALESCE(bool_or(
            entry ? 'tradePriceDeltaCents' OR entry ? 'retailPriceDeltaCents'
            OR entry ? 'internalMargin' OR entry ? 'privateVendorNote'), false) = false
          FROM jsonb_array_elements(v_stored_snapshot) AS chosen(entry)),
    'update_client_decision must sanitize on its delete-and-reinsert path too';

  -- A library template is knowledge worth reusing; the fabric one project
  -- specified is not. Promotion scrubs it and re-hashes what is left.
  PERFORM public.approve_product_configuration(v_com_config_b, 2);
  v_template := public.promote_configuration_to_library(
    v_com_config_b, 'COM Sofa Template'
  );
  v_com_template_id := (v_template->>'id')::uuid;
  ASSERT (SELECT snapshot ? 'comDetails' AND com_details IS NOT NULL
          FROM public.product_configurations WHERE id = v_com_config_b),
    'the promotion source must keep the COM fabric it specified';
  ASSERT (SELECT NOT (snapshot ? 'comDetails')
            AND com_details IS NULL
            AND NOT ((evaluation->'snapshot') ? 'comDetails')
            AND snapshot_hash IS DISTINCT FROM v_com_hash_b
            AND snapshot_hash = pg_temp.configuration_snapshot_hash(snapshot)
          FROM public.product_configurations WHERE id = v_com_template_id),
    'a promoted template must carry no COM fabric and be re-hashed without it';

  v_instance := public.instantiate_product_configuration_template(
    v_com_template_id, '4c000000-0000-4000-8000-000000000031',
    'COM Sofa from Template'
  );
  v_com_template_instance := (v_instance#>>'{configuration,id}')::uuid;
  ASSERT (SELECT NOT (snapshot ? 'comDetails') AND com_details IS NULL
          FROM public.product_configurations WHERE id = v_com_template_instance),
    'instantiating a scrubbed template must not resurrect the source fabric';

  PERFORM set_config('request.jwt.claims', NULL, true);
  PERFORM pg_temp.reset_user();
  RAISE NOTICE 'All furniture configuration assertions passed.';
END;
$$;

ROLLBACK;
