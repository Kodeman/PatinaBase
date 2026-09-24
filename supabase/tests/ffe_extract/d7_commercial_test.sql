-- 00661 / ruling D7 + D7a: the extractor's maker/SKU/price/currency readings
-- stage as unconfirmed envelopes, the existing validation_errors gate refuses
-- them until a per-row designer decision supplies each value, and a confirmed
-- currency persists on project_ffe_items.
BEGIN;
SET LOCAL statement_timeout = '30s';

CREATE OR REPLACE FUNCTION pg_temp.act_as(p_actor uuid)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', p_actor, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', p_actor::text, true);
END;
$$;

-- An extracted v2 row. Commercial arguments are the envelope's value or NULL.
CREATE OR REPLACE FUNCTION pg_temp.v2_row(
  p_name text, p_quantity integer, p_maker text, p_sku text, p_price integer, p_currency text
) RETURNS jsonb LANGUAGE sql AS $$
  SELECT jsonb_build_object(
    'pageNumber', 1,
    'provenance', jsonb_build_object('page', 1, 'confidence', 0.9, 'sourceKind', 'pdf'),
    'name', p_name, 'quantity', p_quantity, 'roomName', NULL, 'category', NULL,
    'maker', CASE WHEN p_maker IS NULL THEN 'null'::jsonb
      ELSE jsonb_build_object('value', p_maker, 'confidence', 0.8, 'state', 'unconfirmed') END,
    'sku', CASE WHEN p_sku IS NULL THEN 'null'::jsonb
      ELSE jsonb_build_object('value', p_sku, 'confidence', 0.7, 'state', 'unconfirmed') END,
    'unitPriceMinor', CASE WHEN p_price IS NULL THEN 'null'::jsonb
      ELSE jsonb_build_object('value', p_price, 'confidence', 0.6, 'state', 'unconfirmed') END,
    'currency', CASE WHEN p_currency IS NULL THEN 'null'::jsonb
      ELSE jsonb_build_object('value', p_currency, 'confidence', 0.6, 'state', 'unconfirmed') END,
    'priceBasis', 'unknown'
  );
$$;

INSERT INTO auth.users(id,email,encrypted_password,email_confirmed_at,created_at,updated_at,instance_id,aud,role) VALUES
('d7000000-0000-4000-8000-000000000001','d7-owner@test.invalid','',now(),now(),now(),'00000000-0000-0000-0000-000000000000','authenticated','authenticated'),
('d7000000-0000-4000-8000-000000000002','d7-client@test.invalid','',now(),now(),now(),'00000000-0000-0000-0000-000000000000','authenticated','authenticated');
INSERT INTO public.profiles(id,email,full_name) VALUES
('d7000000-0000-4000-8000-000000000001','d7-owner@test.invalid','D7 Owner'),
('d7000000-0000-4000-8000-000000000002','d7-client@test.invalid','D7 Client')
ON CONFLICT(id) DO NOTHING;
INSERT INTO public.organizations(id,name,slug,type,status) VALUES
('d7400000-0000-4000-8000-000000000001','D7 Studio','d7-studio','design_studio','active');
INSERT INTO public.organization_members(user_id,organization_id,role,status) VALUES
('d7000000-0000-4000-8000-000000000001','d7400000-0000-4000-8000-000000000001','owner','active');
INSERT INTO public.user_roles(user_id,role_id,granted_by)
SELECT 'd7000000-0000-4000-8000-000000000001',role.id,'d7000000-0000-4000-8000-000000000001'
FROM public.roles AS role WHERE role.name='studio_owner';
INSERT INTO public.projects(id,name,designer_id,client_id,created_by,studio_id) VALUES
('d7100000-0000-4000-8000-000000000001','D7 Project','d7000000-0000-4000-8000-000000000001',
 'd7000000-0000-4000-8000-000000000002','d7000000-0000-4000-8000-000000000001','d7400000-0000-4000-8000-000000000001');
INSERT INTO public.vendors(id,name) VALUES('d7200000-0000-4000-8000-000000000001','D7 Vendor');
-- One registered source document per staged batch: the batch key is the file hash.
INSERT INTO public.project_ffe_media_assets(
  id,project_id,storage_path,media_kind,checksum_sha256,size_bytes,content_type,created_by
)
SELECT ('d7500000-0000-4000-8000-00000000000' || n)::uuid,
       'd7100000-0000-4000-8000-000000000001',
       'd7100000-0000-4000-8000-000000000001/documents/tag-' || n || '.pdf',
       'source_document', repeat(n::text, 64), 4096, 'application/pdf',
       'd7000000-0000-4000-8000-000000000001'
FROM generate_series(1, 6) AS n;

CREATE OR REPLACE FUNCTION pg_temp.stage(p_n integer, p_rows jsonb)
RETURNS jsonb LANGUAGE sql AS $$
  SELECT public.stage_project_ffe_document_extraction(
    'd7100000-0000-4000-8000-000000000001',
    ('d7500000-0000-4000-8000-00000000000' || p_n)::uuid,
    'd7000000-0000-4000-8000-000000000001',
    repeat(p_n::text, 64), p_rows);
$$;

-- ── Schema: the currency column (D7a) ─────────────────────────────────────
DO $$
BEGIN
  ASSERT (SELECT is_nullable = 'NO' AND column_default LIKE '''USD''%'
          FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'project_ffe_items' AND column_name = 'currency'),
    'project_ffe_items.currency must be NOT NULL DEFAULT USD';
  ASSERT NOT EXISTS (SELECT 1 FROM public.project_ffe_items WHERE currency <> 'USD'),
    'every existing selection reads as USD';
  BEGIN
    INSERT INTO public.project_ffe_items(project_id, name, currency)
    VALUES ('d7100000-0000-4000-8000-000000000001', 'Lowercase currency', 'usd');
    RAISE EXCEPTION 'currency CHECK accepted a lowercase code';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
END;
$$;

-- ── Staging: envelopes stage as unconfirmed; bare or confirmed values refuse ─
DO $$
DECLARE
  v_staged jsonb;
  v_row public.project_ffe_import_rows%ROWTYPE;
BEGIN
  v_staged := pg_temp.stage(1, jsonb_build_array(
    pg_temp.v2_row('Lounge chair', 2, 'Vaughan', 'TM0064', 184000, 'EUR'),
    pg_temp.v2_row('Side table', 1, NULL, NULL, NULL, NULL),
    pg_temp.v2_row('Floor lamp', 3, NULL, NULL, 50000, 'USD'),
    pg_temp.v2_row('Rug', 1, 'Beni', NULL, NULL, NULL)
  ));
  ASSERT v_staged->>'status' = 'staged' AND (v_staged->>'rowCount')::integer = 4, v_staged::text;
  ASSERT (v_staged->>'unconfirmedCommercialRows')::integer = 3,
    'three rows carry an unconfirmed commercial reading: ' || v_staged::text;

  SELECT * INTO v_row FROM public.project_ffe_import_rows
  WHERE batch_id = (v_staged->>'batchId')::uuid AND row_ordinal = 1;
  ASSERT v_row.validation_errors ? 'unconfirmed_commercial_value', v_row.validation_errors::text;
  ASSERT v_row.normalized_row #>> '{commercial,unitPriceMinor,value}' = '184000';
  ASSERT v_row.normalized_row #>> '{commercial,currency,state}' = 'unconfirmed';
  ASSERT NOT v_row.normalized_row ?| ARRAY['maker', 'sku', 'unitPriceMinor', 'currency', 'priceBasis'],
    'extracted values must not land in flat normalized_row keys';
  ASSERT v_row.raw_row -> 'maker' = jsonb_build_object('value', 'Vaughan', 'confidence', 0.8, 'state', 'unconfirmed'),
    'raw_row keeps the reading verbatim';
  ASSERT v_row.commercial_decision IS NULL;
  ASSERT (SELECT validation_errors = '[]'::jsonb AND NOT normalized_row ? 'commercial'
          FROM public.project_ffe_import_rows
          WHERE batch_id = (v_staged->>'batchId')::uuid AND row_ordinal = 2),
    'a row with no commercial reading stages clean';
  ASSERT NOT EXISTS (SELECT 1 FROM public.project_ffe_items WHERE project_id = 'd7100000-0000-4000-8000-000000000001'),
    'staging must not create selections';

  v_staged := pg_temp.stage(1, jsonb_build_array(pg_temp.v2_row('Lounge chair', 2, NULL, NULL, NULL, NULL)));
  ASSERT (v_staged->>'reused')::boolean AND (v_staged->>'unconfirmedCommercialRows')::integer = 3,
    'a retry of the same bytes reuses the batch and reports its staged count: ' || v_staged::text;

  BEGIN
    PERFORM pg_temp.stage(5, jsonb_build_array(
      pg_temp.v2_row('Bare', 1, NULL, NULL, NULL, NULL) || jsonb_build_object('maker', 'Vaughan')));
    RAISE EXCEPTION 'a bare scalar maker staged';
  EXCEPTION WHEN check_violation THEN ASSERT SQLERRM LIKE '%malformed commercial value', SQLERRM;
  END;
  BEGIN
    PERFORM pg_temp.stage(5, jsonb_build_array(
      pg_temp.v2_row('Minted', 1, NULL, NULL, NULL, NULL)
      || jsonb_build_object('sku', jsonb_build_object('value', 'X1', 'confidence', 0.9, 'state', 'confirmed'))));
    RAISE EXCEPTION 'a model-confirmed value staged';
  EXCEPTION WHEN check_violation THEN ASSERT SQLERRM LIKE '%malformed commercial value', SQLERRM;
  END;
  BEGIN
    PERFORM pg_temp.stage(5, jsonb_build_array(
      pg_temp.v2_row('Classified', 1, NULL, NULL, 1000, 'USD') || jsonb_build_object('priceBasis', 'trade')));
    RAISE EXCEPTION 'a model-classified price basis staged';
  EXCEPTION WHEN check_violation THEN ASSERT SQLERRM LIKE '%classified its price basis', SQLERRM;
  END;
  BEGIN
    PERFORM pg_temp.stage(5, jsonb_build_array(
      pg_temp.v2_row('No basis', 1, NULL, NULL, 1000, 'USD') - 'priceBasis'));
    RAISE EXCEPTION 'a priced row without priceBasis staged';
  EXCEPTION WHEN check_violation THEN ASSERT SQLERRM LIKE '%requires priceBasis', SQLERRM;
  END;
  ASSERT NOT EXISTS (SELECT 1 FROM public.project_ffe_import_batches WHERE file_hash = repeat('5', 64)),
    'a refused staging call writes nothing';
END;
$$;

-- ── Injection guard: =, + and @ inside an envelope are flagged (00437 fix) ──
DO $$
DECLARE
  v_staged jsonb;
BEGIN
  v_staged := pg_temp.stage(2, jsonb_build_array(
    pg_temp.v2_row('Formula maker', 1, '=HYPERLINK("http://x")', NULL, NULL, NULL),
    pg_temp.v2_row('Formula sku', 1, NULL, '+SUM(A1)', NULL, NULL),
    pg_temp.v2_row('Formula currency', 1, NULL, NULL, 100, '@EUR'),
    pg_temp.v2_row('Flag maker', 1, '-Rcmd', NULL, NULL, NULL),
    pg_temp.v2_row('Plain', 1, 'Vaughan', NULL, NULL, NULL)
  ));
  ASSERT (SELECT array_agg(row_ordinal ORDER BY row_ordinal) = ARRAY[1, 2, 3, 4]
          FROM public.project_ffe_import_rows
          WHERE batch_id = (v_staged->>'batchId')::uuid AND validation_errors ? 'formula_like_value'),
    'every formula-like value inside an envelope must be flagged';

  PERFORM pg_temp.act_as('d7000000-0000-4000-8000-000000000001');
  BEGIN
    PERFORM public.commit_project_ffe_import((v_staged->>'batchId')::uuid, (
      SELECT jsonb_agg(jsonb_build_object(
        'rowOrdinal', n, 'assignmentScope', 'unassigned', 'duplicateMode', 'create',
        'commercial', jsonb_build_object('maker', 'Vaughan', 'sku', NULL, 'unitPriceMinor', NULL,
                                         'currency', NULL, 'priceBasis', NULL)))
      FROM generate_series(1, 5) AS n));
    RAISE EXCEPTION 'a batch with a formula-like reading committed';
  EXCEPTION WHEN check_violation THEN ASSERT SQLERRM LIKE 'every import row requires%', SQLERRM;
  END;
END;
$$;

-- ── Decision validation: each value must be the designer's, well formed ─────
DO $$
DECLARE
  v_batch uuid := (SELECT id FROM public.project_ffe_import_batches WHERE file_hash = repeat('1', 64));
  v_bad jsonb;
BEGIN
  PERFORM pg_temp.act_as('d7000000-0000-4000-8000-000000000001');
  FOREACH v_bad IN ARRAY ARRAY[
    '{"maker":"Vaughan","sku":null,"unitPriceMinor":null,"currency":null}',
    '{"maker":null,"sku":null,"unitPriceMinor":184000,"currency":null,"priceBasis":"trade"}',
    '{"maker":null,"sku":null,"unitPriceMinor":184000,"currency":"EUR","priceBasis":null}',
    '{"maker":null,"sku":null,"unitPriceMinor":184000,"currency":"EUR","priceBasis":"unknown"}',
    '{"maker":null,"sku":null,"unitPriceMinor":184000,"currency":"eur","priceBasis":"trade"}',
    '{"maker":null,"sku":null,"unitPriceMinor":1840.5,"currency":"EUR","priceBasis":"trade"}',
    '{"maker":null,"sku":null,"unitPriceMinor":100000001,"currency":"EUR","priceBasis":"trade"}',
    '{"maker":"=cmd","sku":null,"unitPriceMinor":null,"currency":null,"priceBasis":null}',
    '{"maker":{"value":"Vaughan","confidence":0.8,"state":"unconfirmed"},"sku":null,"unitPriceMinor":null,"currency":null,"priceBasis":null}'
  ]::jsonb[] LOOP
    BEGIN
      PERFORM public._ffe_import_commercial_decision(v_bad, 1);
      RAISE EXCEPTION 'invalid commercial decision accepted: %', v_bad;
    EXCEPTION WHEN check_violation THEN ASSERT SQLERRM LIKE 'import row 1 %', SQLERRM;
    END;
  END LOOP;
  -- The same validator guards the commit entry point.
  BEGIN
    PERFORM public.commit_project_ffe_import(v_batch, jsonb_build_array(jsonb_build_object(
      'rowOrdinal', 1, 'assignmentScope', 'unassigned', 'duplicateMode', 'create',
      'commercial', jsonb_build_object('maker', NULL, 'sku', NULL, 'unitPriceMinor', 184000,
                                       'currency', 'EUR', 'priceBasis', NULL))));
    RAISE EXCEPTION 'commit accepted a price without a basis';
  EXCEPTION WHEN check_violation THEN
    ASSERT SQLERRM LIKE 'import row 1 a confirmed price needs priceBasis%', SQLERRM;
  END;
  ASSERT public._ffe_import_commercial_decision(
    '{"maker":" Vaughan ","sku":"","unitPriceMinor":0,"currency":"EUR","priceBasis":"client"}', 1)
    = '{"maker":"Vaughan","sku":null,"unitPriceMinor":0,"currency":"EUR","priceBasis":"client"}'::jsonb,
    'a valid decision normalizes to trimmed scalars';
END;
$$;

-- ── Commit gate: unconfirmed refuses, confirmed commits and persists ────────
DO $$
DECLARE
  v_batch uuid := (SELECT id FROM public.project_ffe_import_batches WHERE file_hash = repeat('1', 64));
  v_placement jsonb := '{"assignmentScope":"unassigned","duplicateMode":"create"}';
  v_committed jsonb;
  v_item public.project_ffe_items%ROWTYPE;
BEGIN
  PERFORM pg_temp.act_as('d7000000-0000-4000-8000-000000000001');

  -- Placement decisions for every row, but no commercial confirmation.
  BEGIN
    PERFORM public.commit_project_ffe_import(v_batch, (
      SELECT jsonb_agg(v_placement || jsonb_build_object('rowOrdinal', n)) FROM generate_series(1, 4) AS n));
    RAISE EXCEPTION 'an unconfirmed price committed';
  EXCEPTION WHEN check_violation THEN ASSERT SQLERRM LIKE 'every import row requires%', SQLERRM;
  END;
  -- Confirming only row 1 still leaves rows 3 and 4 unconfirmed: no bulk accept.
  BEGIN
    PERFORM public.commit_project_ffe_import(v_batch, (
      SELECT jsonb_agg(v_placement || jsonb_build_object('rowOrdinal', n)
        || CASE WHEN n = 1 THEN jsonb_build_object('commercial', jsonb_build_object(
             'maker', 'Vaughan', 'sku', 'TM0064', 'unitPriceMinor', 184000, 'currency', 'EUR', 'priceBasis', 'trade'))
           ELSE '{}'::jsonb END)
      FROM generate_series(1, 4) AS n));
    RAISE EXCEPTION 'a partly confirmed batch committed';
  EXCEPTION WHEN check_violation THEN ASSERT SQLERRM LIKE 'every import row requires%', SQLERRM;
  END;
  ASSERT (SELECT status = 'staged' FROM public.project_ffe_import_batches WHERE id = v_batch);
  ASSERT NOT EXISTS (SELECT 1 FROM public.project_ffe_items WHERE project_id = 'd7100000-0000-4000-8000-000000000001');

  v_committed := public.commit_project_ffe_import(v_batch, jsonb_build_array(
    v_placement || jsonb_build_object('rowOrdinal', 1, 'commercial', jsonb_build_object(
      'maker', 'Vaughan', 'sku', 'TM0064', 'unitPriceMinor', 184000, 'currency', 'EUR', 'priceBasis', 'trade')),
    v_placement || jsonb_build_object('rowOrdinal', 2),
    v_placement || jsonb_build_object('rowOrdinal', 3, 'commercial', jsonb_build_object(
      'maker', NULL, 'sku', NULL, 'unitPriceMinor', 52000, 'currency', 'USD', 'priceBasis', 'client')),
    v_placement || jsonb_build_object('rowOrdinal', 4, 'commercial', jsonb_build_object(
      'maker', NULL, 'sku', NULL, 'unitPriceMinor', NULL, 'currency', NULL, 'priceBasis', NULL))
  ));
  ASSERT v_committed->>'status' = 'committed' AND (v_committed->>'committedCount')::integer = 4, v_committed::text;

  SELECT item.* INTO v_item FROM public.project_ffe_items item
  JOIN public.project_ffe_import_rows row ON row.committed_ffe_item_id = item.id
  WHERE row.batch_id = v_batch AND row.row_ordinal = 1;
  ASSERT v_item.currency = 'EUR', 'a confirmed currency persists: ' || v_item.currency;
  ASSERT v_item.trade_price_cents = 184000 AND v_item.unit_price_cents = 0,
    'a trade-basis price lands in trade_price_cents only';
  ASSERT v_item.vendor_name = 'Vaughan';
  ASSERT (SELECT sku = 'TM0064' FROM public.project_ffe_specs WHERE ffe_item_id = v_item.id);

  SELECT item.* INTO v_item FROM public.project_ffe_items item
  JOIN public.project_ffe_import_rows row ON row.committed_ffe_item_id = item.id
  WHERE row.batch_id = v_batch AND row.row_ordinal = 3;
  ASSERT v_item.currency = 'USD' AND v_item.unit_price_cents = 52000 AND v_item.line_total_cents = 156000,
    'a client-basis price sets unit and line total from the DESIGNER value, not the 50000 reading';

  SELECT item.* INTO v_item FROM public.project_ffe_items item
  JOIN public.project_ffe_import_rows row ON row.committed_ffe_item_id = item.id
  WHERE row.batch_id = v_batch AND row.row_ordinal = 4;
  ASSERT v_item.vendor_name IS NULL AND v_item.currency = 'USD',
    'a discarded reading (null decision) never reaches the selection';

  SELECT item.* INTO v_item FROM public.project_ffe_items item
  JOIN public.project_ffe_import_rows row ON row.committed_ffe_item_id = item.id
  WHERE row.batch_id = v_batch AND row.row_ordinal = 2;
  ASSERT v_item.currency = 'USD' AND v_item.trade_price_cents IS NULL;

  ASSERT (SELECT commercial_decision ->> 'priceBasis' = 'trade' AND raw_row #>> '{priceBasis}' = 'unknown'
          FROM public.project_ffe_import_rows WHERE batch_id = v_batch AND row_ordinal = 1),
    'the designer decision and the model reading stay in separate columns';

  v_committed := public.commit_project_ffe_import(v_batch, '[]'::jsonb);
  ASSERT v_committed->>'status' = 'committed', 'a replay returns the stored response';

  -- A superseded selection carries its currency with its carried prices.
  SELECT item.* INTO v_item FROM public.project_ffe_items item
  JOIN public.project_ffe_import_rows row ON row.committed_ffe_item_id = item.id
  WHERE row.batch_id = v_batch AND row.row_ordinal = 1;
  v_committed := public.supersede_project_selection(jsonb_build_object('selectionId', v_item.id));
  ASSERT (SELECT currency = 'EUR' AND trade_price_cents = 184000 FROM public.project_ffe_items
          WHERE id = (v_committed->>'selectionId')::uuid),
    'supersede keeps the predecessor''s currency with its carried price';

  -- Purchase orders carry no currency and are read as USD downstream, so a
  -- EUR line is refused rather than summed into a USD total.
  UPDATE public.project_ffe_items SET vendor_id = 'd7200000-0000-4000-8000-000000000001'
  WHERE id = (v_committed->>'selectionId')::uuid;
  BEGIN
    PERFORM public.create_purchase_order('d7100000-0000-4000-8000-000000000001',
      'd7200000-0000-4000-8000-000000000001', 'full_upfront'::public.purchase_order_payment_pattern,
      ARRAY[(v_committed->>'selectionId')::uuid]);
    RAISE EXCEPTION 'a EUR line was ordered on a USD purchase order';
  EXCEPTION WHEN check_violation THEN
    ASSERT SQLERRM LIKE '%purchase orders are denominated in USD%', SQLERRM;
  END;
  -- USD lines still order: supabase/tests/ffe/release_lineage_compat_test.sql.

  -- A commercial document (furnishings authorization / trade scope) line is
  -- refused at insert, before any other constraint is checked.
  BEGIN
    INSERT INTO public.furnishing_authorization_items(source_ffe_item_id)
    VALUES ((v_committed->>'selectionId')::uuid);
    RAISE EXCEPTION 'a EUR selection entered a USD commercial document';
  EXCEPTION WHEN check_violation THEN
    ASSERT SQLERRM LIKE '%commercial documents are denominated in USD%', SQLERRM;
  END;

  -- The working budget refuses a EUR line total. Deriving needs an executed
  -- design-services origin this fixture lacks, so the rollup guard is called
  -- directly and both wrappers are checked to call it after their impl; the
  -- USD path through the wrappers runs in supabase/tests/commercial/.
  PERFORM public._ffe_require_usd_budget_rollup('d7100000-0000-4000-8000-000000000001');
  UPDATE public.project_ffe_items SET item_type = 'fixed', line_total_cents = 184000
  WHERE id = (v_committed->>'selectionId')::uuid;
  BEGIN
    PERFORM public._ffe_require_usd_budget_rollup('d7100000-0000-4000-8000-000000000001');
    RAISE EXCEPTION 'a EUR line total was added into the USD working budget';
  EXCEPTION WHEN check_violation THEN
    ASSERT SQLERRM LIKE '%working budget is denominated in USD%', SQLERRM;
  END;
  ASSERT pg_get_functiondef('public.derive_working_budget_draft(uuid)'::regprocedure)
         ~ '_derive_working_budget_draft_00661_impl\(p_project_id\);\s+PERFORM public\._ffe_require_usd_budget_rollup',
    'derive_working_budget_draft refuses after its impl';
  ASSERT pg_get_functiondef('public.publish_budget_checkpoint(uuid,uuid)'::regprocedure)
         ~ '_publish_budget_checkpoint_00661_impl\(p_project_id, p_version_id\);\s+PERFORM public\._ffe_require_usd_budget_rollup',
    'publish_budget_checkpoint refuses after its impl';
END;
$$;

-- ── Held rows place nothing; a reused selection is refused, not repriced ────
DO $$
DECLARE
  v_staged jsonb;
BEGIN
  PERFORM pg_temp.act_as('d7000000-0000-4000-8000-000000000001');
  v_staged := pg_temp.stage(3, jsonb_build_array(pg_temp.v2_row('Held chair', 1, NULL, NULL, 9900, 'GBP')));
  PERFORM public.commit_project_ffe_import((v_staged->>'batchId')::uuid, jsonb_build_array(jsonb_build_object(
    'rowOrdinal', 1, 'assignmentScope', 'unassigned', 'duplicateMode', 'hold',
    'commercial', jsonb_build_object('maker', NULL, 'sku', NULL, 'unitPriceMinor', 9900, 'currency', 'GBP', 'priceBasis', 'client'))));
  ASSERT NOT EXISTS (SELECT 1 FROM public.project_ffe_items WHERE name = 'Held chair'
                     AND project_id = 'd7100000-0000-4000-8000-000000000001');
  ASSERT NOT EXISTS (SELECT 1 FROM public.project_ffe_items WHERE currency = 'GBP'
                     AND project_id = 'd7100000-0000-4000-8000-000000000001');
END;
$$;

-- ── ACL: service-only staging, authenticated commit, private helpers ────────
DO $$
BEGIN
  ASSERT has_function_privilege('service_role', 'public.stage_project_ffe_document_extraction(uuid,uuid,uuid,text,jsonb)', 'EXECUTE');
  ASSERT NOT has_function_privilege('authenticated', 'public.stage_project_ffe_document_extraction(uuid,uuid,uuid,text,jsonb)', 'EXECUTE');
  ASSERT NOT has_function_privilege('anon', 'public.stage_project_ffe_document_extraction(uuid,uuid,uuid,text,jsonb)', 'EXECUTE');
  ASSERT NOT has_function_privilege('service_role', 'public._stage_project_ffe_document_extraction_00661_impl(uuid,uuid,uuid,text,jsonb)', 'EXECUTE');
  ASSERT NOT has_function_privilege('authenticated', 'public._stage_project_ffe_document_extraction_00661_impl(uuid,uuid,uuid,text,jsonb)', 'EXECUTE');
  ASSERT has_function_privilege('authenticated', 'public.commit_project_ffe_import(uuid,jsonb)', 'EXECUTE');
  ASSERT NOT has_function_privilege('anon', 'public.commit_project_ffe_import(uuid,jsonb)', 'EXECUTE');
  ASSERT NOT has_function_privilege('authenticated', 'public._ffe_import_commercial_decision(jsonb,integer)', 'EXECUTE');
  ASSERT NOT has_function_privilege('authenticated', 'public._ffe_extracted_commercial(jsonb,integer)', 'EXECUTE');
  ASSERT NOT has_function_privilege('authenticated', 'public._ffe_has_formula_like_text(jsonb)', 'EXECUTE');
  ASSERT has_function_privilege('authenticated', 'public.derive_working_budget_draft(uuid)', 'EXECUTE');
  ASSERT NOT has_function_privilege('anon', 'public.derive_working_budget_draft(uuid)', 'EXECUTE');
  ASSERT has_function_privilege('authenticated', 'public.publish_budget_checkpoint(uuid,uuid)', 'EXECUTE');
  ASSERT NOT has_function_privilege('anon', 'public.publish_budget_checkpoint(uuid,uuid)', 'EXECUTE');
  ASSERT NOT has_function_privilege('authenticated', 'public._derive_working_budget_draft_00661_impl(uuid)', 'EXECUTE');
  ASSERT NOT has_function_privilege('authenticated', 'public._publish_budget_checkpoint_00661_impl(uuid,uuid)', 'EXECUTE');
  ASSERT NOT has_function_privilege('authenticated', 'public._ffe_require_usd_budget_rollup(uuid)', 'EXECUTE');
END;
$$;

ROLLBACK;
