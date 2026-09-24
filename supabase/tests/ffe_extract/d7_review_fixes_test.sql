-- 00666: SQ-208's review findings on 00661 (F1, F3, F4, F5, F6, F8). Each
-- block reproduces its finding: on the 00661 bodies its assertion fails, and
-- with 00666 applied it passes. The file runs in one transaction and rolls back.
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

-- A designer's commercial decision for one row.
CREATE OR REPLACE FUNCTION pg_temp.decision(
  p_ordinal integer, p_price integer, p_currency text, p_basis text
) RETURNS jsonb LANGUAGE sql AS $$
  SELECT jsonb_build_object(
    'rowOrdinal', p_ordinal, 'assignmentScope', 'unassigned', 'duplicateMode', 'create',
    'commercial', jsonb_build_object('maker', NULL, 'sku', NULL, 'unitPriceMinor', p_price,
                                     'currency', p_currency, 'priceBasis', p_basis));
$$;

INSERT INTO auth.users(id,email,encrypted_password,email_confirmed_at,created_at,updated_at,instance_id,aud,role) VALUES
('d8000000-0000-4000-8000-000000000001','d8-owner@test.invalid','',now(),now(),now(),'00000000-0000-0000-0000-000000000000','authenticated','authenticated'),
('d8000000-0000-4000-8000-000000000002','d8-client@test.invalid','',now(),now(),now(),'00000000-0000-0000-0000-000000000000','authenticated','authenticated');
INSERT INTO public.profiles(id,email,full_name) VALUES
('d8000000-0000-4000-8000-000000000001','d8-owner@test.invalid','D8 Owner'),
('d8000000-0000-4000-8000-000000000002','d8-client@test.invalid','D8 Client')
ON CONFLICT(id) DO NOTHING;
INSERT INTO public.organizations(id,name,slug,type,status) VALUES
('d8400000-0000-4000-8000-000000000001','D8 Studio','d8-studio','design_studio','active');
INSERT INTO public.organization_members(user_id,organization_id,role,status) VALUES
('d8000000-0000-4000-8000-000000000001','d8400000-0000-4000-8000-000000000001','owner','active');
INSERT INTO public.user_roles(user_id,role_id,granted_by)
SELECT 'd8000000-0000-4000-8000-000000000001',role.id,'d8000000-0000-4000-8000-000000000001'
FROM public.roles AS role WHERE role.name='studio_owner';
INSERT INTO public.projects(id,name,designer_id,client_id,created_by,studio_id) VALUES
('d8100000-0000-4000-8000-000000000001','D8 Project','d8000000-0000-4000-8000-000000000001',
 'd8000000-0000-4000-8000-000000000002','d8000000-0000-4000-8000-000000000001','d8400000-0000-4000-8000-000000000001');
INSERT INTO public.vendors(id,name) VALUES('d8200000-0000-4000-8000-000000000001','D8 Vendor');
-- A catalog product priced in USD: 100000 retail, 60000 trade.
INSERT INTO public.products(id,name,price_retail,price_trade,images,vendor_id,captured_by,captured_at,layer,status) VALUES
('d8300000-0000-4000-8000-000000000001','D8 Catalog Chair',100000,60000,ARRAY[]::text[],
 'd8200000-0000-4000-8000-000000000001','d8000000-0000-4000-8000-000000000001',now(),'catalog','published');
-- One registered source document per staged batch: the batch key is the file hash.
INSERT INTO public.project_ffe_media_assets(
  id,project_id,storage_path,media_kind,checksum_sha256,size_bytes,content_type,created_by
)
SELECT ('d8500000-0000-4000-8000-00000000000' || n)::uuid,
       'd8100000-0000-4000-8000-000000000001',
       'd8100000-0000-4000-8000-000000000001/documents/tag-' || n || '.pdf',
       'source_document', repeat(n::text, 64), 4096, 'application/pdf',
       'd8000000-0000-4000-8000-000000000001'
FROM generate_series(1, 5) AS n;

CREATE OR REPLACE FUNCTION pg_temp.stage(p_n integer, p_rows jsonb)
RETURNS jsonb LANGUAGE sql AS $$
  SELECT public.stage_project_ffe_document_extraction(
    'd8100000-0000-4000-8000-000000000001',
    ('d8500000-0000-4000-8000-00000000000' || p_n)::uuid,
    'd8000000-0000-4000-8000-000000000001',
    repeat(p_n::text, 64), p_rows);
$$;

-- The committed selection of one import row.
CREATE OR REPLACE FUNCTION pg_temp.item_of(p_batch uuid, p_ordinal integer)
RETURNS public.project_ffe_items LANGUAGE sql AS $$
  SELECT item.* FROM public.project_ffe_items item
  JOIN public.project_ffe_import_rows row ON row.committed_ffe_item_id = item.id
  WHERE row.batch_id = p_batch AND row.row_ordinal = p_ordinal;
$$;

-- ── F5: staging fails closed when the impl does not report `reused` ────────
-- The impl is swapped for one that drops the key (00660 rewrites the impl).
ALTER FUNCTION public._stage_project_ffe_document_extraction_00661_impl(uuid, uuid, uuid, text, jsonb)
  RENAME TO _d8_stage_impl;
CREATE FUNCTION public._stage_project_ffe_document_extraction_00661_impl(
  p_project_id uuid, p_asset_id uuid, p_actor_id uuid, p_file_hash text, p_rows jsonb
) RETURNS jsonb LANGUAGE sql AS $$
  SELECT public._d8_stage_impl(p_project_id, p_asset_id, p_actor_id, p_file_hash, p_rows) - 'reused';
$$;
DO $$
BEGIN
  BEGIN
    PERFORM pg_temp.stage(5, jsonb_build_array(pg_temp.v2_row('Priced chair', 1, NULL, NULL, 184000, 'EUR')));
    RAISE EXCEPTION 'F5: staging without a reused key returned, so its commercial reading went unflagged';
  EXCEPTION WHEN raise_exception THEN
    ASSERT SQLERRM = 'document extraction staging did not report whether the batch was reused', SQLERRM;
  END;
  ASSERT NOT EXISTS (SELECT 1 FROM public.project_ffe_import_batches WHERE file_hash = repeat('5', 64)),
    'F5: a refused staging call writes nothing';
END;
$$;
DROP FUNCTION public._stage_project_ffe_document_extraction_00661_impl(uuid, uuid, uuid, text, jsonb);
ALTER FUNCTION public._d8_stage_impl(uuid, uuid, uuid, text, jsonb)
  RENAME TO _stage_project_ffe_document_extraction_00661_impl;

-- ── F6: the formula guard's gaps are closed; plain numbers stay legal ──────
DO $$
DECLARE
  v_staged jsonb;
  v_flagged integer[];
BEGIN
  v_staged := pg_temp.stage(2, jsonb_build_array(
    pg_temp.v2_row('Tab maker', 1, E'\t=HYPERLINK("x")', NULL, NULL, NULL),
    pg_temp.v2_row('CR sku', 1, NULL, E'\r+SUM(A1)', NULL, NULL),
    pg_temp.v2_row('Space maker', 1, ' @SUM(A1)', NULL, NULL, NULL),
    pg_temp.v2_row('Minus digit maker', 1, '-2+3+cmd|x', NULL, NULL, NULL),
    pg_temp.v2_row('Key', 1, NULL, NULL, NULL, NULL) || jsonb_build_object('=cmd', 1),
    jsonb_set(pg_temp.v2_row('Nested key', 1, NULL, NULL, NULL, NULL), '{provenance,@cmd}', 'true'),
    pg_temp.v2_row('-12', 1, NULL, '-12.50', NULL, NULL)
  ));
  SELECT array_agg(row_ordinal ORDER BY row_ordinal) INTO v_flagged
  FROM public.project_ffe_import_rows
  WHERE batch_id = (v_staged->>'batchId')::uuid AND validation_errors ? 'formula_like_value';
  ASSERT v_flagged IS NOT DISTINCT FROM ARRAY[1, 2, 3, 4, 5, 6],
    'F6: tab, CR, leading space, -<digit> and object keys are flagged; plain negative numbers are not: '
    || COALESCE(v_flagged::text, '{}');
  ASSERT NOT public._ffe_has_formula_like_text('{"quantity": -2, "unitPriceMinor": {"value": -500}}'),
    'F6: JSON numbers are never inspected';

  BEGIN
    PERFORM public._ffe_import_commercial_decision(
      '{"maker":"-2+3+cmd|x","sku":null,"unitPriceMinor":null,"currency":null,"priceBasis":null}', 1);
    RAISE EXCEPTION 'F6: the decision validator accepted a -<digit> formula';
  EXCEPTION WHEN check_violation THEN
    ASSERT SQLERRM LIKE 'import row 1 maker and sku must be plain text%', SQLERRM;
  END;
  ASSERT public._ffe_import_commercial_decision(
    '{"maker":null,"sku":"-12","unitPriceMinor":null,"currency":null,"priceBasis":null}', 1) ->> 'sku' = '-12',
    'F6: a plain negative number is not a formula';
END;
$$;

-- ── Fixture: three committed extraction rows, two EUR and one USD ─────────
DO $$
DECLARE
  v_staged jsonb;
BEGIN
  PERFORM pg_temp.act_as('d8000000-0000-4000-8000-000000000001');
  v_staged := pg_temp.stage(1, jsonb_build_array(
    pg_temp.v2_row('EUR sofa', 1, NULL, NULL, 250000, 'EUR'),
    pg_temp.v2_row('EUR lamp', 2, NULL, NULL, 40000, 'EUR'),
    pg_temp.v2_row('USD table', 1, NULL, NULL, 90000, 'USD')
  ));
  PERFORM public.commit_project_ffe_import((v_staged->>'batchId')::uuid, jsonb_build_array(
    pg_temp.decision(1, 250000, 'EUR', 'client'),
    pg_temp.decision(2, 40000, 'EUR', 'client'),
    pg_temp.decision(3, 90000, 'USD', 'client')));
  ASSERT (pg_temp.item_of((v_staged->>'batchId')::uuid, 1)).currency = 'EUR';
  ASSERT (pg_temp.item_of((v_staged->>'batchId')::uuid, 2)).currency = 'EUR';
  ASSERT (pg_temp.item_of((v_staged->>'batchId')::uuid, 3)).currency = 'USD';
  -- Kept for the blocks below, some of which run as authenticated.
  PERFORM set_config('d8.eur_sofa', (pg_temp.item_of((v_staged->>'batchId')::uuid, 1)).id::text, true);
  PERFORM set_config('d8.eur_lamp', (pg_temp.item_of((v_staged->>'batchId')::uuid, 2)).id::text, true);
  PERFORM set_config('d8.usd_table', (pg_temp.item_of((v_staged->>'batchId')::uuid, 3)).id::text, true);
END;
$$;

-- ── F1: an invoice refuses a non-USD selection on every writer ─────────────
SET LOCAL ROLE authenticated;
DO $$
DECLARE
  v_eur uuid := current_setting('d8.eur_sofa')::uuid;
  v_usd uuid := current_setting('d8.usd_table')::uuid;
  v_invoice public.invoices%ROWTYPE;
BEGIN
  BEGIN
    PERFORM public.create_draft_invoice(
      'd8100000-0000-4000-8000-000000000001', 'd8000000-0000-4000-8000-000000000001',
      'd8000000-0000-4000-8000-000000000002', 'd8400000-0000-4000-8000-000000000001',
      0, 15, NULL, NULL, jsonb_build_array(jsonb_build_object(
        'kind', 'ffe', 'ffe_item_id', v_eur, 'description', 'EUR sofa', 'quantity', 1,
        'unit_amount_cents', 250000, 'metadata', '{}'::jsonb, 'sort_order', 0)));
    RAISE EXCEPTION 'F1: create_draft_invoice billed a EUR selection on a USD invoice';
  EXCEPTION WHEN check_violation THEN
    ASSERT SQLERRM LIKE 'invoices are denominated in USD%', SQLERRM;
  END;

  -- A USD selection still bills.
  v_invoice := public.create_draft_invoice(
    'd8100000-0000-4000-8000-000000000001', 'd8000000-0000-4000-8000-000000000001',
    'd8000000-0000-4000-8000-000000000002', 'd8400000-0000-4000-8000-000000000001',
    0, 15, NULL, NULL, jsonb_build_array(jsonb_build_object(
      'kind', 'ffe', 'ffe_item_id', v_usd, 'description', 'USD table', 'quantity', 1,
      'unit_amount_cents', 90000, 'metadata', '{}'::jsonb, 'sort_order', 0)));
  ASSERT v_invoice.total_cents = 90000 AND v_invoice.currency = 'USD', row_to_json(v_invoice)::text;
END;
$$;
RESET ROLE;
DO $$
DECLARE
  v_eur uuid := current_setting('d8.eur_sofa')::uuid;
  v_usd uuid := current_setting('d8.usd_table')::uuid;
  v_invoice uuid := (SELECT invoice_id FROM public.invoice_line_items WHERE ffe_item_id = v_usd);
BEGIN
  -- A direct line insert (the draft-invoice RLS policies allow designers one).
  BEGIN
    INSERT INTO public.invoice_line_items(invoice_id, kind, ffe_item_id, description, quantity,
                                          unit_amount_cents, amount_cents, sort_order)
    VALUES (v_invoice, 'ffe', v_eur, 'EUR sofa', 1, 250000, 250000, 1);
    RAISE EXCEPTION 'F1: a direct invoice line billed a EUR selection';
  EXCEPTION WHEN check_violation THEN
    ASSERT SQLERRM LIKE 'invoices are denominated in USD%', SQLERRM;
  END;
  -- Repointing an existing line.
  BEGIN
    UPDATE public.invoice_line_items SET ffe_item_id = v_eur WHERE ffe_item_id = v_usd;
    RAISE EXCEPTION 'F1: an invoice line was repointed at a EUR selection';
  EXCEPTION WHEN check_violation THEN
    ASSERT SQLERRM LIKE 'invoices are denominated in USD%', SQLERRM;
  END;
END;
$$;

-- ── F3: a catalog-priced row is never relabelled to another currency ───────
DO $$
DECLARE
  v_staged jsonb;
  v_item public.project_ffe_items%ROWTYPE;
BEGIN
  PERFORM pg_temp.act_as('d8000000-0000-4000-8000-000000000001');
  v_staged := public.stage_project_ffe_import(jsonb_build_object(
    'projectId', 'd8100000-0000-4000-8000-000000000001', 'fileHash', repeat('a', 64), 'sourceKind', 'csv',
    'rows', jsonb_build_array(jsonb_build_object(
      'name', 'Catalog chair', 'productId', 'd8300000-0000-4000-8000-000000000001', 'quantity', 2))));
  BEGIN
    PERFORM public.commit_project_ffe_import((v_staged->>'batchId')::uuid,
      jsonb_build_array(pg_temp.decision(1, 90000, 'EUR', 'client')));
    v_item := pg_temp.item_of((v_staged->>'batchId')::uuid, 1);
    RAISE EXCEPTION 'F3: a EUR confirmation committed onto a catalog row: currency %, unit %, trade %',
      v_item.currency, v_item.unit_price_cents, v_item.trade_price_cents;
  EXCEPTION WHEN check_violation THEN
    ASSERT SQLERRM = 'import row 1 is priced from a catalog product in USD; a confirmed price in EUR is refused', SQLERRM;
  END;
  ASSERT (SELECT status = 'staged' FROM public.project_ffe_import_batches WHERE id = (v_staged->>'batchId')::uuid);

  -- A USD confirmation on a catalog row still commits.
  v_staged := public.stage_project_ffe_import(jsonb_build_object(
    'projectId', 'd8100000-0000-4000-8000-000000000001', 'fileHash', repeat('b', 64), 'sourceKind', 'csv',
    'rows', jsonb_build_array(jsonb_build_object(
      'name', 'Catalog chair', 'productId', 'd8300000-0000-4000-8000-000000000001', 'quantity', 2))));
  PERFORM public.commit_project_ffe_import((v_staged->>'batchId')::uuid,
    jsonb_build_array(pg_temp.decision(1, 95000, 'USD', 'client')));
  v_item := pg_temp.item_of((v_staged->>'batchId')::uuid, 1);
  ASSERT v_item.currency = 'USD' AND v_item.unit_price_cents = 95000 AND v_item.trade_price_cents = 60000,
    row_to_json(v_item)::text;
END;
$$;

-- ── F4: catalog repricing resets the currency label to USD ────────────────
-- (a) Filling a EUR placeholder with a catalog product.
DO $$
DECLARE
  v_placeholder uuid := current_setting('d8.eur_lamp')::uuid;
  v_placed jsonb;
  v_item public.project_ffe_items%ROWTYPE;
BEGIN
  PERFORM pg_temp.act_as('d8000000-0000-4000-8000-000000000001');
  v_placed := public.place_product_in_project_v2(jsonb_build_object(
    'projectId', 'd8100000-0000-4000-8000-000000000001',
    'productId', 'd8300000-0000-4000-8000-000000000001',
    'placeholderSelectionId', v_placeholder,
    'assignmentScope', 'unassigned', 'idempotencyKey', 'd8-fill'));
  ASSERT v_placed->>'outcome' = 'filled', v_placed::text;
  SELECT * INTO v_item FROM public.project_ffe_items WHERE id = v_placeholder;
  ASSERT v_item.currency = 'USD' AND v_item.unit_price_cents = 100000 AND v_item.trade_price_cents = 60000,
    'F4: a filled placeholder carries catalog USD prices under ' || v_item.currency;
END;
$$;

-- (b) A client decision feeding a catalog option into a EUR selection.
INSERT INTO public.designer_clients(id, designer_id, client_id, client_name, status, source) VALUES
('d8600000-0000-4000-8000-000000000001','d8000000-0000-4000-8000-000000000001',
 'd8000000-0000-4000-8000-000000000002','D8 Client','active','direct');
INSERT INTO public.client_decisions(id, designer_client_id, project_id, title, status, coordination_kind, court, sent_at) VALUES
('d8700000-0000-4000-8000-000000000001','d8600000-0000-4000-8000-000000000001',
 'd8100000-0000-4000-8000-000000000001','D8 Sofa choice','pending','selection','client',now());
INSERT INTO public.client_decision_options(id, decision_id, name, price, quantity, product_id, selected, sort_order) VALUES
('d8800000-0000-4000-8000-000000000001','d8700000-0000-4000-8000-000000000001',
 'D8 Catalog Chair',100000,1,'d8300000-0000-4000-8000-000000000001',false,0);
INSERT INTO public.project_ffe_items(project_id, name, source_decision_id, unit_price_cents, line_total_cents, currency) VALUES
('d8100000-0000-4000-8000-000000000001','EUR decision slot','d8700000-0000-4000-8000-000000000001',30000,30000,'EUR');
DO $$
DECLARE
  v_item public.project_ffe_items%ROWTYPE;
BEGIN
  PERFORM public._apply_client_decision_authorized(
    'd8700000-0000-4000-8000-000000000001', 'd8800000-0000-4000-8000-000000000001',
    'd8000000-0000-4000-8000-000000000002');
  SELECT * INTO v_item FROM public.project_ffe_items
  WHERE source_decision_id = 'd8700000-0000-4000-8000-000000000001';
  ASSERT v_item.unit_price_cents = 100000 AND v_item.trade_price_cents = 60000, row_to_json(v_item)::text;
  ASSERT v_item.currency = 'USD',
    'F4: a decided selection carries catalog USD prices under ' || v_item.currency;
END;
$$;

-- ── F8: a replayed placement key is refused as a reused selection ──────────
DO $$
DECLARE
  v_staged jsonb;
  v_row public.project_ffe_import_rows%ROWTYPE;
  v_placed jsonb;
  v_before public.project_ffe_items%ROWTYPE;
  v_after public.project_ffe_items%ROWTYPE;
BEGIN
  PERFORM pg_temp.act_as('d8000000-0000-4000-8000-000000000001');
  v_staged := pg_temp.stage(3, jsonb_build_array(pg_temp.v2_row('Replay chair', 1, NULL, NULL, 184000, 'EUR')));
  SELECT * INTO v_row FROM public.project_ffe_import_rows
  WHERE batch_id = (v_staged->>'batchId')::uuid AND row_ordinal = 1;
  -- The same actor first places the exact request the commit will send (00439).
  v_placed := public.place_product_in_project_v2(jsonb_strip_nulls(jsonb_build_object(
    'projectId', 'd8100000-0000-4000-8000-000000000001', 'productId', v_row.normalized_row->>'productId',
    'name', v_row.normalized_row->>'name', 'category', v_row.normalized_row->>'category',
    'quantity', v_row.normalized_row->>'quantity', 'roomId', NULL, 'assignmentScope', 'unassigned',
    'duplicateMode', 'create', 'disposition', 'candidate', 'source', 'document-extraction',
    'sourceMetadata', jsonb_build_object('batchId', v_row.batch_id, 'rowOrdinal', 1,
      'importedApprovalText', v_row.imported_approval_text,
      'sourceAssetId', 'd8500000-0000-4000-8000-000000000003'),
    'idempotencyKey', 'import:' || v_row.batch_id::text || ':1')));
  ASSERT v_placed->>'outcome' = 'created', v_placed::text;
  SELECT * INTO v_before FROM public.project_ffe_items WHERE id = (v_placed->>'selectionId')::uuid;
  ASSERT v_before.currency = 'USD' AND v_before.unit_price_cents = 0;

  BEGIN
    PERFORM public.commit_project_ffe_import(v_row.batch_id,
      jsonb_build_array(pg_temp.decision(1, 184000, 'EUR', 'client')));
    SELECT * INTO v_after FROM public.project_ffe_items WHERE id = v_before.id;
    RAISE EXCEPTION 'F8: the commit replayed an existing selection and wrote % % onto it',
      v_after.unit_price_cents, v_after.currency;
  EXCEPTION WHEN check_violation THEN
    ASSERT SQLERRM = 'import row 1 confirmed commercial values would overwrite an existing selection', SQLERRM;
  END;
  SELECT * INTO v_after FROM public.project_ffe_items WHERE id = v_before.id;
  ASSERT v_after.currency = 'USD' AND v_after.unit_price_cents = 0, 'F8: the existing selection is untouched';
END;
$$;

-- ── ACL: the new trigger function is private ─────────────────────────────
DO $$
BEGIN
  ASSERT NOT has_function_privilege('authenticated', 'public._ffe_guard_usd_invoice_line()', 'EXECUTE');
  ASSERT NOT has_function_privilege('service_role', 'public._ffe_guard_usd_invoice_line()', 'EXECUTE');
  ASSERT NOT has_function_privilege('anon', 'public._ffe_guard_usd_invoice_line()', 'EXECUTE');
  ASSERT has_function_privilege('authenticated', 'public.commit_project_ffe_import(uuid,jsonb)', 'EXECUTE');
  ASSERT NOT has_function_privilege('authenticated', 'public._place_product_in_project_v2_00438_impl(jsonb)', 'EXECUTE');
  ASSERT NOT has_function_privilege('authenticated', 'public._apply_client_decision_authorized(uuid,uuid,uuid,text,text,text,integer)', 'EXECUTE');
END;
$$;

ROLLBACK;
