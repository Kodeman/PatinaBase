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
  ('4c000000-0000-4000-8000-000000000002', 'config-outsider@test.invalid', '', now(), now(), now(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');

INSERT INTO public.profiles (id, email, full_name, created_at, updated_at)
VALUES
  ('4c000000-0000-4000-8000-000000000001', 'config-owner@test.invalid', 'Configuration Owner', now(), now()),
  ('4c000000-0000-4000-8000-000000000002', 'config-outsider@test.invalid', 'Configuration Outsider', now(), now())
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

INSERT INTO public.products (
  id, name, source_url, captured_by, captured_at, layer, owner_user_id,
  status, price_retail, price_trade, lead_time_weeks, dimensions, vendor_id
) VALUES
  ('4c000000-0000-4000-8000-000000000101', 'Finite Bed', 'https://example.invalid/bed', '4c000000-0000-4000-8000-000000000001', now(), 'personal', '4c000000-0000-4000-8000-000000000001', 'draft', NULL, NULL, 6, '{"unit":"in"}'::jsonb, '4c000000-0000-4000-8000-000000000020'),
  ('4c000000-0000-4000-8000-000000000102', 'Modular Sectional', 'https://example.invalid/sectional', '4c000000-0000-4000-8000-000000000001', now(), 'personal', '4c000000-0000-4000-8000-000000000001', 'draft', 999999, 888888, 10, NULL, '4c000000-0000-4000-8000-000000000020'),
  ('4c000000-0000-4000-8000-000000000103', 'Material Table', 'https://example.invalid/table', '4c000000-0000-4000-8000-000000000001', now(), 'personal', '4c000000-0000-4000-8000-000000000001', 'draft', 50000, 35000, 8, '{"width":72,"unit":"in"}'::jsonb, '4c000000-0000-4000-8000-000000000020'),
  ('4c000000-0000-4000-8000-000000000104', 'Custom Cabinetry', 'https://example.invalid/cabinet', '4c000000-0000-4000-8000-000000000001', now(), 'personal', '4c000000-0000-4000-8000-000000000001', 'draft', NULL, NULL, NULL, NULL, '4c000000-0000-4000-8000-000000000020');

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

DO $$
DECLARE
  v_schema jsonb;
  v_eval jsonb;
  v_saved jsonb;
  v_approved jsonb;
  v_place jsonb;
  v_rfq jsonb;
  v_history jsonb;
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
  v_revision_id uuid;
  v_item_id uuid;
  v_po_id uuid;
  v_raised boolean;
  v_count integer;
BEGIN
  PERFORM pg_temp.assume_user('4c000000-0000-4000-8000-000000000001');

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
        {"id":"draft-queen-variant","code":"queen","name":"Queen","sku":"BED-Q","status":"active","retailPriceCents":100000,"tradePriceCents":70000,"leadTimeWeeks":6,"metadata":{},"isDefault":true,"optionValueCodes":["size:queen"]},
        {"id":"draft-king-variant","code":"king","name":"King","sku":"BED-K","status":"active","retailPriceCents":120000,"tradePriceCents":84000,"leadTimeWeeks":7,"metadata":{},"isDefault":false,"optionValueCodes":["size:king"]}
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

  -- 4. Cabinetry: custom brief → draft RFQ → quote → both approvals → issued spec.
  v_schema := public.upsert_product_configuration_schema(
    '4c000000-0000-4000-8000-000000000104',
    '{"mode":"custom","pricingStrategy":"base_plus_adjustments","optionGroups":[],"variants":[],"components":[],"rules":[]}'::jsonb,
    1
  );
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
  PERFORM public.transition_custom_commission_revision(v_revision_id, 'approved', 'Designer and client approved',
    '{"approval":{"designerApproved":true,"clientApproved":true}}');
  ASSERT (SELECT status = 'approved' AND retail_price_cents = 300000 AND trade_price_cents = 200000
          FROM public.product_configurations WHERE id = v_custom_config_id),
    'custom approval must atomically enrich and approve the configuration';
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

  INSERT INTO public.purchase_orders (
    id, designer_id, project_id, vendor_id, payment_pattern, total_cents, status
  ) VALUES (
    '4c000000-0000-4000-8000-000000000040',
    '4c000000-0000-4000-8000-000000000001',
    '4c000000-0000-4000-8000-000000000030',
    '4c000000-0000-4000-8000-000000000020', 'net_30', 300000, 'draft'
  ) RETURNING id INTO v_po_id;
  UPDATE public.project_ffe_items SET purchase_order_id = v_po_id WHERE id = v_item_id;
  ASSERT (SELECT configuration_locked_at IS NOT NULL FROM public.project_ffe_specs WHERE ffe_item_id = v_item_id),
    'PO linkage must preserve/establish the approved lock';

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
  v_history := public.list_custom_commission_revisions(v_custom_config_v2);
  ASSERT jsonb_array_length(v_history) = 2,
    'revision ledger must traverse all configuration versions in the key chain';

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

  PERFORM pg_temp.reset_user();
  RAISE NOTICE 'All furniture configuration assertions passed.';
END;
$$;

ROLLBACK;
