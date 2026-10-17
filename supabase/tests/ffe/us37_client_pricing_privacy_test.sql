-- ═══════════════════════════════════════════════════════════════════════════
-- US-37 client pricing privacy (SQ-1107, 00811, contract D6)
--
-- Cost, markup, margin, retail, price_basis and the cost-change flag never
-- reach a client, and never reach anon.
--
--   raw tables   as the job's client: project_ffe_items (and its pricing
--                columns), project_ffe_item_images, project_pricing_settings,
--                designer_pricing_settings, proposal_items (00811 §2) and
--                furnishing_authorization_items return no row
--   cross-org    a client who shares an unrelated organization with the lead
--                (is_studio_comember is true) reads no release snapshot of the
--                lead's studio job (00811 §1, Astra SQ-1150 R3); the job's own
--                teammate and the lead still read it
--   readers      get_client_project_selections, get_client_project_threshold,
--                get_client_commercial_document_bundle, list_client_proposals
--                and get_client_proposal_bundle carry no pricing-private key at
--                any depth (00811 §3: no price_retail at the 'full' tier), and
--                still carry the client's own price
--   anon         every raw table above returns no row or 42501; the readers
--                refuse
--
-- Run: cd supabase && supabase test db tests/ffe/us37_client_pricing_privacy_test.sql
--  or: psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -X -q \
--        -v ON_ERROR_STOP=1 -f supabase/tests/ffe/us37_client_pricing_privacy_test.sql
-- Everything is rolled back.
-- ═══════════════════════════════════════════════════════════════════════════
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT plan(41);

-- ─── helpers ───────────────────────────────────────────────────────────────

-- Rows the CURRENT role sees for a query; -1 when the role may not read it.
CREATE FUNCTION pg_temp.visible_rows(p_sql text)
RETURNS integer
LANGUAGE plpgsql
AS $$
DECLARE
  v_count integer;
BEGIN
  EXECUTE format('SELECT count(*)::integer FROM (%s) AS q', p_sql) INTO v_count;
  RETURN v_count;
EXCEPTION WHEN insufficient_privilege THEN
  RETURN -1;
END;
$$;

-- Every object key, at any depth, that names a pricing-private field.
CREATE FUNCTION pg_temp.private_keys(p_value jsonb)
RETURNS text[]
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT COALESCE(array_agg(DISTINCT k.key ORDER BY k.key), '{}'::text[])
  FROM jsonb_path_query(COALESCE(p_value, 'null'::jsonb), 'strict $.**') AS node(value)
  CROSS JOIN LATERAL jsonb_object_keys(
    CASE WHEN jsonb_typeof(node.value) = 'object' THEN node.value ELSE '{}'::jsonb END
  ) AS k(key)
  WHERE lower(replace(k.key, '_', '')) ~
    '(tradeprice|tradeunitcost|tradecost|pricetrade|unittrade|markup|margin|retail|pricebasis|pendingcost|pendingmarkup|costprev|unitcost|wholesale)'
     OR lower(k.key) = 'unit_price';
$$;

-- ─── fixtures (as postgres) ────────────────────────────────────────────────
-- O leads job P (client C) and job Q (client K), both in studio A; O is also
-- a member of the unrelated org B. T is O's teammate in A. C is a plain
-- client. K shares org B with O and holds no seat in A.

INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, instance_id, aud, role)
VALUES
  ('81100000-0000-4000-8000-0000000000a1', 'us37-privacy-lead@test.invalid',     '', now(), now(), now(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('81100000-0000-4000-8000-0000000000a2', 'us37-privacy-client@test.invalid',   '', now(), now(), now(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('81100000-0000-4000-8000-0000000000a3', 'us37-privacy-teammate@test.invalid', '', now(), now(), now(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('81100000-0000-4000-8000-0000000000a4', 'us37-privacy-crossorg@test.invalid', '', now(), now(), now(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');

INSERT INTO public.profiles (id, email, full_name, is_designer, created_at, updated_at)
VALUES
  ('81100000-0000-4000-8000-0000000000a1', 'us37-privacy-lead@test.invalid',     'Privacy Lead',     true,  now(), now()),
  ('81100000-0000-4000-8000-0000000000a2', 'us37-privacy-client@test.invalid',   'Privacy Client',   false, now(), now()),
  ('81100000-0000-4000-8000-0000000000a3', 'us37-privacy-teammate@test.invalid', 'Privacy Teammate', true,  now(), now()),
  ('81100000-0000-4000-8000-0000000000a4', 'us37-privacy-crossorg@test.invalid', 'Privacy Cross Org', false, now(), now())
ON CONFLICT (id) DO UPDATE
SET email = EXCLUDED.email, full_name = EXCLUDED.full_name, is_designer = EXCLUDED.is_designer;

INSERT INTO public.organizations (id, type, name, slug)
VALUES
  ('81100000-0000-4000-8000-0000000000f1', 'design_studio', 'Privacy Studio A', 'us37-privacy-studio-a-test'),
  ('81100000-0000-4000-8000-0000000000f2', 'design_studio', 'Privacy Org B',    'us37-privacy-org-b-test');

INSERT INTO public.organization_members (id, user_id, organization_id, role, status, joined_at)
VALUES
  ('81100000-0000-4000-8000-0000000000e1', '81100000-0000-4000-8000-0000000000a1', '81100000-0000-4000-8000-0000000000f1', 'owner',  'active', now()),
  ('81100000-0000-4000-8000-0000000000e2', '81100000-0000-4000-8000-0000000000a3', '81100000-0000-4000-8000-0000000000f1', 'member', 'active', now()),
  ('81100000-0000-4000-8000-0000000000e3', '81100000-0000-4000-8000-0000000000a1', '81100000-0000-4000-8000-0000000000f2', 'member', 'active', now()),
  ('81100000-0000-4000-8000-0000000000e4', '81100000-0000-4000-8000-0000000000a4', '81100000-0000-4000-8000-0000000000f2', 'member', 'active', now());

INSERT INTO public.projects (id, name, designer_id, client_id, created_by, studio_id, status)
VALUES
  ('81100000-0000-4000-8000-000000000001', 'Privacy Job P',
   '81100000-0000-4000-8000-0000000000a1', '81100000-0000-4000-8000-0000000000a2',
   '81100000-0000-4000-8000-0000000000a1', '81100000-0000-4000-8000-0000000000f1', 'active'),
  ('81100000-0000-4000-8000-000000000002', 'Privacy Job Q',
   '81100000-0000-4000-8000-0000000000a1', '81100000-0000-4000-8000-0000000000a4',
   '81100000-0000-4000-8000-0000000000a1', '81100000-0000-4000-8000-0000000000f1', 'active');

INSERT INTO public.products (id, name, captured_at, layer, owner_user_id, status, images, price_retail, price_trade)
VALUES ('81100000-0000-4000-8000-000000000021', 'Privacy Lounge chair', now(), 'personal',
        '81100000-0000-4000-8000-0000000000a1', 'draft',
        ARRAY['https://img.test/privacy-a.jpg', 'https://img.test/privacy-b.jpg'], 150000, 70000);

INSERT INTO public.project_pricing_settings (project_id, markup_target_percent, sales_tax_rate)
VALUES ('81100000-0000-4000-8000-000000000001', 40, 0.0825),
       ('81100000-0000-4000-8000-000000000002', 40, 0.0825);
INSERT INTO public.designer_pricing_settings (user_id, default_markup_percent)
VALUES ('81100000-0000-4000-8000-0000000000a1', 45);

-- One priced line per job, every private pricing column populated: cost,
-- markup, retail, basis and a held cost change.
SELECT set_config('app.ffe_mutation_rpc', 'on', true);
SELECT set_config('app.ffe_pricing_writer', 'on', true);
INSERT INTO public.project_ffe_items (
  id, project_id, name, status, item_type, product_id, quantity,
  unit_price_cents, line_total_cents, trade_price_cents, markup_percent,
  retail_unit_cents, price_basis, pending_cost_prev_cents, pending_cost_changed_at,
  pending_markup_held_percent, doc_code, design_disposition, assignment_scope, sort_order
) VALUES
  ('81100000-0000-4000-8000-000000000101', '81100000-0000-4000-8000-000000000001', 'Lounge chair',
   'specified', 'fixed', '81100000-0000-4000-8000-000000000021', 1,
   120000, 120000, 70000, 71.43, 150000, 'markup', 65000, now(), 71.43, 'LR-01',
   'selected', 'unassigned', 0),
  ('81100000-0000-4000-8000-000000000102', '81100000-0000-4000-8000-000000000002', 'Lounge chair',
   'specified', 'fixed', '81100000-0000-4000-8000-000000000021', 1,
   120000, 120000, 70000, 71.43, 150000, 'markup', 65000, now(), 71.43, 'LR-01',
   'selected', 'unassigned', 0);

-- An executed furnishings authorization per job names the line, with its
-- trade cost and markup frozen on the release snapshot.
INSERT INTO public.proposals (id, project_id, designer_id, client_id, title, status, document_kind, commercial_state, total_amount, subtotal)
VALUES
  ('81100000-0000-4000-8000-000000000401', '81100000-0000-4000-8000-000000000001', '81100000-0000-4000-8000-0000000000a1',
   '81100000-0000-4000-8000-0000000000a2', 'Privacy Authorization P', 'accepted', 'furnishings_authorization', 'executed', 120000, 120000),
  ('81100000-0000-4000-8000-000000000501', '81100000-0000-4000-8000-000000000002', '81100000-0000-4000-8000-0000000000a1',
   '81100000-0000-4000-8000-0000000000a4', 'Privacy Authorization Q', 'accepted', 'furnishings_authorization', 'executed', 120000, 120000);
INSERT INTO public.project_commercial_documents (id, project_id, proposal_id, document_kind, wave_name, is_origin, bound_at, executed_at, created_by)
VALUES
  ('81100000-0000-4000-8000-000000000402', '81100000-0000-4000-8000-000000000001', '81100000-0000-4000-8000-000000000401',
   'furnishings_authorization', 'Authorization No. 1', false, now(), now(), '81100000-0000-4000-8000-0000000000a1'),
  ('81100000-0000-4000-8000-000000000502', '81100000-0000-4000-8000-000000000002', '81100000-0000-4000-8000-000000000501',
   'furnishings_authorization', 'Authorization No. 1', false, now(), now(), '81100000-0000-4000-8000-0000000000a1');
INSERT INTO public.furnishing_authorization_items (
  id, commercial_document_id, source_ffe_item_id, product_id, name, room_name, category, item_type,
  quantity, client_unit_price_cents, client_line_total_cents, trade_unit_cost_cents, markup_percent, sort_order
) VALUES
  ('81100000-0000-4000-8000-000000000403', '81100000-0000-4000-8000-000000000402', '81100000-0000-4000-8000-000000000101',
   '81100000-0000-4000-8000-000000000021', 'Lounge chair', 'Living room', 'seating', 'fixed', 1, 120000, 120000, 70000, 71.43, 0),
  ('81100000-0000-4000-8000-000000000503', '81100000-0000-4000-8000-000000000502', '81100000-0000-4000-8000-000000000102',
   '81100000-0000-4000-8000-000000000021', 'Lounge chair', 'Living room', 'seating', 'fixed', 1, 120000, 120000, 70000, 71.43, 0);
UPDATE public.project_ffe_items
   SET source_commercial_document_id = '81100000-0000-4000-8000-000000000402',
       source_authorization_item_id = '81100000-0000-4000-8000-000000000403'
 WHERE id = '81100000-0000-4000-8000-000000000101';
UPDATE public.project_ffe_items
   SET source_commercial_document_id = '81100000-0000-4000-8000-000000000502',
       source_authorization_item_id = '81100000-0000-4000-8000-000000000503'
 WHERE id = '81100000-0000-4000-8000-000000000102';
SELECT set_config('app.ffe_pricing_writer', '', true);
SELECT set_config('app.ffe_mutation_rpc', '', true);

-- A sent 'full'-tier proposal addressed to C, its line carrying trade cost,
-- markup and (through the association snapshot) the piece's retail.
INSERT INTO public.proposals (id, project_id, designer_id, client_id, title, total_amount, status, client_visibility_tier)
VALUES ('81100000-0000-4000-8000-000000000601', '81100000-0000-4000-8000-000000000001', '81100000-0000-4000-8000-0000000000a1',
        '81100000-0000-4000-8000-0000000000a2', 'Privacy Proposal', 120000, 'draft', 'full');
INSERT INTO public.proposal_items (
  id, proposal_id, product_id, name, quantity, unit_price, unit_sell_price, markup_percent,
  line_total_cents, vendor_name, position, item_type
) VALUES ('81100000-0000-4000-8000-000000000602', '81100000-0000-4000-8000-000000000601',
          '81100000-0000-4000-8000-000000000021', 'Lounge chair', 1, 70000, 120000, 71.43,
          120000, 'Privacy Vendor', 0, 'fixed');
SELECT set_config('app.proposal_send_id', '81100000-0000-4000-8000-000000000601', true);
UPDATE public.proposals SET status = 'sent', sent_at = now()
 WHERE id = '81100000-0000-4000-8000-000000000601';
SELECT set_config('app.proposal_send_id', '', true);

-- ─── preconditions: the fixture really carries every private value ─────────

SELECT ok(
  (SELECT trade_price_cents = 70000 AND markup_percent IS NOT NULL AND retail_unit_cents = 150000
          AND price_basis = 'markup' AND pending_cost_prev_cents = 65000
          AND pending_cost_changed_at IS NOT NULL AND pending_markup_held_percent IS NOT NULL
     FROM public.project_ffe_items WHERE id = '81100000-0000-4000-8000-000000000101'),
  'fixture: the line carries cost, markup, retail, basis and a held cost change'
);
SELECT ok(
  (SELECT client_product_snapshot ? 'price_retail' AND markup_percent IS NOT NULL AND unit_price = 70000
     FROM public.proposal_items WHERE id = '81100000-0000-4000-8000-000000000602'),
  'fixture: the sent proposal line carries trade cost, markup and a retail snapshot'
);
SELECT ok(
  (SELECT count(*) = 2 FROM public.project_ffe_item_images WHERE item_id = '81100000-0000-4000-8000-000000000101'),
  'fixture: the line has its pictures'
);

-- ─── the job's client: no raw row ──────────────────────────────────────────

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"81100000-0000-4000-8000-0000000000a2","role":"authenticated"}';

SELECT is(pg_temp.visible_rows($$SELECT 1 FROM public.project_ffe_items WHERE project_id = '81100000-0000-4000-8000-000000000001'$$),
  0, 'client: no project_ffe_items row of her job');
SELECT is(pg_temp.visible_rows($$SELECT trade_price_cents, markup_percent, retail_unit_cents, price_basis,
    pending_cost_prev_cents, pending_cost_changed_at, pending_markup_held_percent FROM public.project_ffe_items$$),
  0, 'client: the cost, markup, retail, basis and cost-change columns return nothing');
SELECT is(pg_temp.visible_rows($$SELECT 1 FROM public.project_ffe_item_images WHERE project_id = '81100000-0000-4000-8000-000000000001'$$),
  0, 'client: no project_ffe_item_images row');
SELECT is(pg_temp.visible_rows($$SELECT markup_target_percent, sales_tax_rate FROM public.project_pricing_settings$$),
  0, 'client: no project_pricing_settings row');
SELECT is(pg_temp.visible_rows($$SELECT default_markup_percent FROM public.designer_pricing_settings$$),
  0, 'client: not the lead''s designer_pricing_settings row');
SELECT is(pg_temp.visible_rows($$SELECT unit_price, markup_percent, client_product_snapshot FROM public.proposal_items
    WHERE proposal_id = '81100000-0000-4000-8000-000000000601'$$),
  0, 'client: no proposal_items row of her sent proposal (00811 §2)');
SELECT is(pg_temp.visible_rows($$SELECT trade_unit_cost_cents, markup_percent FROM public.furnishing_authorization_items$$),
  0, 'client: no furnishing_authorization_items row');

-- ─── the job's client: curated readers carry no private key ────────────────

SELECT is(pg_temp.private_keys(public.get_client_project_selections('81100000-0000-4000-8000-000000000001')),
  '{}'::text[], 'reader: get_client_project_selections carries no pricing-private key');
SELECT is(pg_temp.private_keys(public.get_client_project_threshold('81100000-0000-4000-8000-000000000001')),
  '{}'::text[], 'reader: get_client_project_threshold carries no pricing-private key');
SELECT ok(public.get_client_project_threshold('81100000-0000-4000-8000-000000000001')::text LIKE '%120000%',
  'reader: get_client_project_threshold still carries the client price');
SELECT is(pg_temp.private_keys(public.get_client_commercial_document_bundle('81100000-0000-4000-8000-000000000401')),
  '{}'::text[], 'reader: get_client_commercial_document_bundle carries no pricing-private key');
SELECT ok(public.get_client_commercial_document_bundle('81100000-0000-4000-8000-000000000401')::text LIKE '%"clientUnitPriceCents": 120000%',
  'reader: get_client_commercial_document_bundle still carries the client unit price');
SELECT is(pg_temp.private_keys(public.list_client_proposals()),
  '{}'::text[], 'reader: list_client_proposals carries no pricing-private key');
SELECT is(pg_temp.private_keys(public.get_client_proposal_bundle('81100000-0000-4000-8000-000000000601')),
  '{}'::text[], 'reader: get_client_proposal_bundle carries no pricing-private key at the full tier (00811 §3)');
SELECT ok(public.get_client_proposal_bundle('81100000-0000-4000-8000-000000000601')::text LIKE '%"unit_sell_price": 120000%',
  'reader: get_client_proposal_bundle still carries the client sell price');
SELECT ok(public.get_client_proposal_bundle('81100000-0000-4000-8000-000000000601') #> '{proposal,items,0,client_product_snapshot}' ? 'name',
  'reader: get_client_proposal_bundle still carries the piece snapshot');

-- ─── a client who shares an unrelated organization with the lead ───────────

SET LOCAL request.jwt.claims = '{"sub":"81100000-0000-4000-8000-0000000000a4","role":"authenticated"}';

SELECT ok(public.is_studio_comember('81100000-0000-4000-8000-0000000000a1'),
  'cross-org: the shared organization makes her a co-member of the lead (the R3 edge exists)');
SELECT ok(NOT public.can_buy_for_project('81100000-0000-4000-8000-000000000002'),
  'cross-org: she is not on her job''s team');
SELECT is(pg_temp.visible_rows($$SELECT trade_unit_cost_cents, markup_percent FROM public.furnishing_authorization_items$$),
  0, 'cross-org: no furnishing_authorization_items row of the studio''s job (00811 §1)');
SELECT is(pg_temp.visible_rows($$SELECT 1 FROM public.project_commercial_documents d
    JOIN public.furnishing_authorization_items a ON a.commercial_document_id = d.id$$),
  0, 'cross-org: no release line through the commercial document join either');
SELECT is(pg_temp.visible_rows($$SELECT trade_price_cents FROM public.project_ffe_items$$),
  0, 'cross-org: no project_ffe_items row');
SELECT is(pg_temp.visible_rows($$SELECT markup_target_percent FROM public.project_pricing_settings$$),
  0, 'cross-org: no project_pricing_settings row');
SELECT is(pg_temp.private_keys(public.get_client_commercial_document_bundle('81100000-0000-4000-8000-000000000501')),
  '{}'::text[], 'cross-org: her own job''s commercial bundle carries no pricing-private key');

-- ─── the legitimate team still reads ───────────────────────────────────────

SET LOCAL request.jwt.claims = '{"sub":"81100000-0000-4000-8000-0000000000a3","role":"authenticated"}';

SELECT is(pg_temp.visible_rows($$SELECT trade_unit_cost_cents FROM public.furnishing_authorization_items
    WHERE commercial_document_id IN ('81100000-0000-4000-8000-000000000402', '81100000-0000-4000-8000-000000000502')$$),
  2, 'team: the studio teammate reads both jobs'' release lines');
SELECT is((SELECT trade_price_cents FROM public.project_ffe_items WHERE id = '81100000-0000-4000-8000-000000000101'),
  70000, 'team: the studio teammate reads the line cost');
SELECT is(pg_temp.visible_rows($$SELECT markup_percent FROM public.proposal_items
    WHERE proposal_id = '81100000-0000-4000-8000-000000000601'$$),
  1, 'team: the studio teammate reads the proposal line');

SET LOCAL request.jwt.claims = '{"sub":"81100000-0000-4000-8000-0000000000a1","role":"authenticated"}';

SELECT is(pg_temp.visible_rows($$SELECT trade_unit_cost_cents FROM public.furnishing_authorization_items
    WHERE commercial_document_id = '81100000-0000-4000-8000-000000000502'$$),
  1, 'team: the lead reads her release line');
SELECT is(pg_temp.visible_rows($$SELECT markup_target_percent FROM public.project_pricing_settings$$),
  2, 'team: the lead reads her jobs'' pricing settings');
SELECT is(pg_temp.visible_rows($$SELECT default_markup_percent FROM public.designer_pricing_settings$$),
  1, 'team: the lead reads her own designer pricing settings');

-- ─── anon ──────────────────────────────────────────────────────────────────

RESET ROLE;
SET LOCAL ROLE anon;
SET LOCAL request.jwt.claims = '{"role":"anon"}';

SELECT ok(pg_temp.visible_rows($$SELECT trade_price_cents, markup_percent, retail_unit_cents, price_basis,
    pending_cost_prev_cents, pending_markup_held_percent FROM public.project_ffe_items$$) IN (0, -1),
  'anon: project_ffe_items pricing columns return nothing or 42501');
SELECT ok(pg_temp.visible_rows($$SELECT unit_price, markup_percent FROM public.proposal_items$$) IN (0, -1),
  'anon: proposal_items returns nothing or 42501');
SELECT ok(pg_temp.visible_rows($$SELECT trade_unit_cost_cents FROM public.furnishing_authorization_items$$) IN (0, -1),
  'anon: furnishing_authorization_items returns nothing or 42501');
SELECT ok(pg_temp.visible_rows($$SELECT markup_target_percent FROM public.project_pricing_settings$$) IN (0, -1),
  'anon: project_pricing_settings returns nothing or 42501');
SELECT ok(pg_temp.visible_rows($$SELECT default_markup_percent FROM public.designer_pricing_settings$$) IN (0, -1),
  'anon: designer_pricing_settings returns nothing or 42501');
SELECT ok(pg_temp.visible_rows($$SELECT 1 FROM public.project_ffe_item_images$$) IN (0, -1),
  'anon: project_ffe_item_images returns nothing or 42501');
SELECT throws_ok($$SELECT public.get_client_project_threshold('81100000-0000-4000-8000-000000000001')$$,
  '42501', NULL, 'anon: get_client_project_threshold refuses');
SELECT throws_ok($$SELECT public.get_client_proposal_bundle('81100000-0000-4000-8000-000000000601')$$,
  '42501', NULL, 'anon: get_client_proposal_bundle refuses');
SELECT throws_ok($$SELECT public.get_client_commercial_document_bundle('81100000-0000-4000-8000-000000000401')$$,
  '42501', NULL, 'anon: get_client_commercial_document_bundle refuses');

RESET ROLE;

SELECT * FROM finish();
ROLLBACK;
