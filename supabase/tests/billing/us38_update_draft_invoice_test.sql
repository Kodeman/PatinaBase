-- 00824 / US-38: atomic draft editing. All assertions fail psql ON_ERROR_STOP.
\set ON_ERROR_STOP on
BEGIN;
SET LOCAL plpgsql.check_asserts = on;
INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, instance_id, aud, role)
VALUES
 ('82400000-0000-4000-8000-000000000001', 'edit-owner@test.invalid', '', now(), now(), now(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
 ('82400000-0000-4000-8000-000000000002', 'edit-peer@test.invalid', '', now(), now(), now(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
 ('82400000-0000-4000-8000-000000000003', 'edit-client@test.invalid', '', now(), now(), now(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');
INSERT INTO public.profiles (id, email, full_name, is_designer, created_at, updated_at)
VALUES
 ('82400000-0000-4000-8000-000000000001', 'edit-owner@test.invalid', 'Compose Owner', true, now(), now()),
 ('82400000-0000-4000-8000-000000000002', 'edit-peer@test.invalid', 'Compose Peer', true, now(), now()),
 ('82400000-0000-4000-8000-000000000003', 'edit-client@test.invalid', 'Compose Client', false, now(), now())
ON CONFLICT (id) DO UPDATE SET is_designer = EXCLUDED.is_designer, full_name = EXCLUDED.full_name;
INSERT INTO public.organizations (id, type, name, slug, status)
VALUES ('82400000-0000-4000-8000-000000000010', 'design_studio', 'Compose Studio', 'edit-821-test', 'active');
INSERT INTO public.organization_members (user_id, organization_id, role, status, joined_at)
VALUES
 ('82400000-0000-4000-8000-000000000001', '82400000-0000-4000-8000-000000000010', 'owner', 'active', now()),
 ('82400000-0000-4000-8000-000000000002', '82400000-0000-4000-8000-000000000010', 'member', 'active', now());
INSERT INTO public.user_roles (user_id, role_id, granted_by)
SELECT '82400000-0000-4000-8000-000000000001', id, '82400000-0000-4000-8000-000000000001'
FROM public.roles WHERE name = 'studio_owner';
INSERT INTO public.user_roles (user_id, role_id, granted_by)
SELECT '82400000-0000-4000-8000-000000000002', id, '82400000-0000-4000-8000-000000000001'
FROM public.roles WHERE name = 'studio_designer';
INSERT INTO public.projects (id, name, designer_id, created_by, client_id, studio_id, status)
VALUES ('82400000-0000-4000-8000-000000000020', 'Compose Job', '82400000-0000-4000-8000-000000000001',
 '82400000-0000-4000-8000-000000000001', '82400000-0000-4000-8000-000000000003',
 '82400000-0000-4000-8000-000000000010', 'active');
INSERT INTO public.projects (id, name, designer_id, created_by, client_id, studio_id, status)
VALUES ('82400000-0000-4000-8000-000000000021', 'Member Lead Job', '82400000-0000-4000-8000-000000000002',
 '82400000-0000-4000-8000-000000000002', '82400000-0000-4000-8000-000000000003',
 '82400000-0000-4000-8000-000000000010', 'active');
INSERT INTO public.studio_member_rates (studio_id, user_id, hourly_rate_cents, effective_from)
VALUES ('82400000-0000-4000-8000-000000000010', '82400000-0000-4000-8000-000000000001', 20000, DATE '2020-01-01');
INSERT INTO public.project_time_entries (id, project_id, user_id, started_at, duration_minutes, billable, hourly_rate_cents, source)
VALUES
 ('82400000-0000-4000-8000-000000000031', '82400000-0000-4000-8000-000000000020', '82400000-0000-4000-8000-000000000001', now() - interval '2 days', 60, true, 20000, 'manual_entry'),
 ('82400000-0000-4000-8000-000000000032', '82400000-0000-4000-8000-000000000020', '82400000-0000-4000-8000-000000000001', now() - interval '1 day', 30, true, 20000, 'manual_entry'),
 ('82400000-0000-4000-8000-000000000033', '82400000-0000-4000-8000-000000000020', '82400000-0000-4000-8000-000000000001', now() - interval '3 days', 30, true, 20000, 'manual_entry'),
 ('82400000-0000-4000-8000-000000000034', '82400000-0000-4000-8000-000000000021', '82400000-0000-4000-8000-000000000001', now() - interval '1 day', 30, true, 20000, 'manual_entry');
INSERT INTO public.studio_purchases (id, organization_id, project_id, kind, payee_name, purchased_on, amount_cents)
VALUES ('82400000-0000-4000-8000-000000000040', '82400000-0000-4000-8000-000000000010',
 '82400000-0000-4000-8000-000000000020', 'expense', 'Composition expense', current_date, 5000);


INSERT INTO public.designer_clients (designer_id, client_id, status)
VALUES ('82400000-0000-4000-8000-000000000001', '82400000-0000-4000-8000-000000000003', 'active');
INSERT INTO public.project_payment_milestones (id, project_id, label, percentage, amount_cents, status, sort_order)
VALUES
 ('82400000-0000-4000-8000-000000000051', '82400000-0000-4000-8000-000000000020', 'Old milestone', 10, 10000, 'pending', 1),
 ('82400000-0000-4000-8000-000000000052', '82400000-0000-4000-8000-000000000020', 'New milestone', 20, 20000, 'pending', 2);
INSERT INTO public.project_ffe_items (id, project_id, name, quantity, unit_price_cents)
VALUES
 ('82400000-0000-4000-8000-000000000061', '82400000-0000-4000-8000-000000000020', 'Old chair', 1, 12000),
 ('82400000-0000-4000-8000-000000000062', '82400000-0000-4000-8000-000000000020', 'New chair', 1, 18000);
INSERT INTO public.vendors (id, name) VALUES ('82400000-0000-4000-8000-000000000070', 'Edit vendor');
INSERT INTO public.purchase_orders (id, designer_id, project_id, vendor_id, payment_pattern)
VALUES ('82400000-0000-4000-8000-000000000071', '82400000-0000-4000-8000-000000000001',
 '82400000-0000-4000-8000-000000000020', '82400000-0000-4000-8000-000000000070', 'net_30');
INSERT INTO public.po_cost_lines (id, organization_id, purchase_order_id, kind, estimate_cents)
VALUES ('82400000-0000-4000-8000-000000000072', '82400000-0000-4000-8000-000000000010',
 '82400000-0000-4000-8000-000000000071', 'freight', 4200);

CREATE FUNCTION pg_temp.check_true(p_ok boolean, p_name text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  ASSERT p_ok IS TRUE, p_name;
  RAISE NOTICE 'PASS: %', p_name;
END $$;
CREATE FUNCTION pg_temp.hand_lines() RETURNS jsonb LANGUAGE sql AS $$
 SELECT '[{"kind":"adhoc","description":"Edited design","quantity":1.25,"unit_amount_cents":10001,"sort_order":0}]'::jsonb
$$;
CREATE FUNCTION pg_temp.link_lines(p_new boolean) RETURNS jsonb LANGUAGE sql AS $$
 SELECT pg_temp.hand_lines() || jsonb_build_array(
   jsonb_build_object('kind','milestone','milestone_id', CASE WHEN p_new THEN '82400000-0000-4000-8000-000000000052' ELSE '82400000-0000-4000-8000-000000000051' END,
     'description','Milestone','quantity',1,'unit_amount_cents', CASE WHEN p_new THEN 20000 ELSE 10000 END,'sort_order',1),
   jsonb_build_object('kind','ffe','ffe_item_id', CASE WHEN p_new THEN '82400000-0000-4000-8000-000000000062' ELSE '82400000-0000-4000-8000-000000000061' END,
     'description','Chair','quantity',1,'unit_amount_cents', CASE WHEN p_new THEN 18000 ELSE 12000 END,'sort_order',2))
$$;
CREATE FUNCTION pg_temp.try_update(p_id uuid, p_lines jsonb DEFAULT pg_temp.hand_lines(),
 p_entries uuid[] DEFAULT '{}', p_billing jsonb DEFAULT '[]', p_expected timestamptz DEFAULT NULL)
RETURNS text LANGUAGE plpgsql AS $$
BEGIN
  PERFORM public.update_draft_invoice(p_id, COALESCE(p_expected, (SELECT updated_at FROM public.invoices WHERE id = p_id)),
    0.075, 30, 'Edited memo', 'Private note', p_lines, p_entries, p_billing);
  RETURN 'success';
EXCEPTION WHEN OTHERS THEN RETURN SQLSTATE || ' ' || SQLERRM;
END $$;
CREATE FUNCTION pg_temp.snapshot(p_id uuid) RETURNS jsonb LANGUAGE sql AS $$
 SELECT jsonb_build_object(
  'header', (SELECT to_jsonb(i) FROM public.invoices i WHERE id = p_id),
  'lines', (SELECT jsonb_agg(to_jsonb(l) ORDER BY id) FROM public.invoice_line_items l WHERE invoice_id = p_id),
  'internals', (SELECT jsonb_agg(to_jsonb(m) ORDER BY line_item_id) FROM public.invoice_line_item_internals m
    JOIN public.invoice_line_items l ON l.id = m.line_item_id WHERE l.invoice_id = p_id),
  'hours', (SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM public.project_time_entries t WHERE project_id = '82400000-0000-4000-8000-000000000020'),
  'milestones', (SELECT jsonb_agg(to_jsonb(m) ORDER BY id) FROM public.project_payment_milestones m WHERE project_id = '82400000-0000-4000-8000-000000000020'),
  'purchases', (SELECT jsonb_agg(to_jsonb(p) ORDER BY id) FROM public.studio_purchases p WHERE project_id = '82400000-0000-4000-8000-000000000020'),
  'riders', (SELECT jsonb_agg(to_jsonb(r) ORDER BY id) FROM public.po_cost_lines r WHERE purchase_order_id = '82400000-0000-4000-8000-000000000071'))
$$;

GRANT EXECUTE ON FUNCTION pg_temp.check_true(boolean,text), pg_temp.hand_lines(), pg_temp.link_lines(boolean),
 pg_temp.try_update(uuid,jsonb,uuid[],jsonb,timestamptz) TO authenticated;
SELECT pg_temp.check_true(has_function_privilege('authenticated', 'public.update_draft_invoice(uuid,timestamptz,numeric,integer,text,text,jsonb,uuid[],jsonb)', 'EXECUTE'), 'authenticated can edit');
SELECT pg_temp.check_true(NOT has_function_privilege('anon', 'public.update_draft_invoice(uuid,timestamptz,numeric,integer,text,text,jsonb,uuid[],jsonb)', 'EXECUTE'), 'anon cannot edit');
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"82400000-0000-4000-8000-000000000001","role":"authenticated"}';
SELECT id AS draft_id, created_at AS draft_created FROM public.compose_project_invoice(
 '82400000-0000-4000-8000-000000000020', '82400000-0000-4000-8000-000000000001',
 '82400000-0000-4000-8000-000000000003', '82400000-0000-4000-8000-000000000010',
 0, 15, 'Original', NULL, pg_temp.link_lines(false),
 ARRAY['82400000-0000-4000-8000-000000000031','82400000-0000-4000-8000-000000000032']::uuid[],
 '[{"purchaseId":"82400000-0000-4000-8000-000000000040"},{"costLineId":"82400000-0000-4000-8000-000000000072"}]') \gset
SELECT pg_temp.check_true(pg_temp.try_update(:'draft_id', pg_temp.link_lines(true),
 ARRAY['82400000-0000-4000-8000-000000000031','82400000-0000-4000-8000-000000000033']::uuid[]) = 'success',
 'edit hand lines, swap sources, keep/drop/add hours succeeds');
RESET ROLE;
SELECT pg_temp.check_true((SELECT subtotal_cents = 50501 AND tax_cents = 3788 AND total_cents = 54289
 AND tax_rate = 0.075 AND payment_terms_days = 30 AND memo = 'Edited memo' AND internal_notes = 'Private note'
 AND created_at = :'draft_created'::timestamptz AND invoice_number IS NULL FROM public.invoices WHERE id = :'draft_id'),
 'hand totals use per-line rounding then subtotal tax; identity and creation preserved');
SELECT pg_temp.check_true((SELECT count(*) = 3 FROM public.invoice_line_items WHERE invoice_id = :'draft_id'), 'hand lines replaced, not appended');
SELECT pg_temp.check_true((SELECT invoice_id = :'draft_id'::uuid FROM public.project_time_entries WHERE id = '82400000-0000-4000-8000-000000000031'), 'kept hour stays claimed');
SELECT pg_temp.check_true((SELECT invoice_id IS NULL FROM public.project_time_entries WHERE id = '82400000-0000-4000-8000-000000000032'), 'dropped hour released');
SELECT pg_temp.check_true((SELECT invoice_id = :'draft_id'::uuid FROM public.project_time_entries WHERE id = '82400000-0000-4000-8000-000000000033'), 'new hour claimed');
SELECT pg_temp.check_true((SELECT invoice_id IS NULL AND status = 'pending' AND due_date IS NULL FROM public.project_payment_milestones WHERE id = '82400000-0000-4000-8000-000000000051'), 'old milestone returns to pending');
SELECT pg_temp.check_true((SELECT invoice_id = :'draft_id'::uuid FROM public.project_payment_milestones WHERE id = '82400000-0000-4000-8000-000000000052'), 'new milestone latched');
SELECT pg_temp.check_true(NOT EXISTS(SELECT 1 FROM public.invoice_line_items WHERE ffe_item_id = '82400000-0000-4000-8000-000000000061')
 AND EXISTS(SELECT 1 FROM public.invoice_line_items WHERE invoice_id = :'draft_id' AND ffe_item_id = '82400000-0000-4000-8000-000000000062'), 'FF&E line swapped');
SELECT pg_temp.check_true((SELECT invoice_line_id IS NULL AND status = 'recorded' FROM public.studio_purchases WHERE id = '82400000-0000-4000-8000-000000000040'), 'dropped purchase stamp released');
SELECT pg_temp.check_true((SELECT invoice_line_id IS NULL FROM public.po_cost_lines WHERE id = '82400000-0000-4000-8000-000000000072'), 'dropped rider stamp released');

-- Reattach a previously billed purchase/rider, not a fresh untested stamp.
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"82400000-0000-4000-8000-000000000001","role":"authenticated"}';
SELECT pg_temp.check_true(pg_temp.try_update(:'draft_id', pg_temp.link_lines(true),
 ARRAY['82400000-0000-4000-8000-000000000031','82400000-0000-4000-8000-000000000033']::uuid[],
 '[{"purchaseId":"82400000-0000-4000-8000-000000000040"},{"costLineId":"82400000-0000-4000-8000-000000000072"}]') = 'success', 'kept sources release and reattach');
RESET ROLE;
SELECT pg_temp.snapshot(:'draft_id')::text AS before_refusal \gset
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"82400000-0000-4000-8000-000000000001","role":"authenticated"}';
SELECT pg_temp.check_true(starts_with(pg_temp.try_update(:'draft_id', pg_temp.hand_lines(),
 ARRAY['82400000-0000-4000-8000-000000000032']::uuid[],
 '[{"purchaseId":"82400000-0000-4000-8000-000000000040"},{"purchaseId":"not-a-uuid"}]'),
 '23514 update_draft_invoice: lines:'), 'mid-edit billing refusal names lines stage');
RESET ROLE;
SELECT pg_temp.check_true(pg_temp.snapshot(:'draft_id') = :'before_refusal'::jsonb,
 'mid-edit refusal restores byte-identical header, lines, internals, claims, milestones and stamps');

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"82400000-0000-4000-8000-000000000001","role":"authenticated"}';
SELECT pg_temp.check_true(starts_with(pg_temp.try_update(:'draft_id', p_expected => '2000-01-01'::timestamptz), '23514 update_draft_invoice: stale'), 'stale updated_at refused');
SELECT pg_temp.check_true(starts_with(pg_temp.try_update(:'draft_id',
 '[{"kind":"adhoc","description":"Bad","quantity":-1,"unit_amount_cents":20,"sort_order":0}]'), '23514 update_draft_invoice: draft:'), 'invalid hand line names draft stage');
SELECT id AS other_id FROM public.compose_project_invoice(
 '82400000-0000-4000-8000-000000000020', '82400000-0000-4000-8000-000000000001',
 '82400000-0000-4000-8000-000000000003', '82400000-0000-4000-8000-000000000010',
 0, 15, 'Another draft', NULL, pg_temp.hand_lines(), ARRAY['82400000-0000-4000-8000-000000000032']::uuid[], '[]') \gset
SELECT pg_temp.check_true(starts_with(pg_temp.try_update(:'draft_id', p_entries => ARRAY['82400000-0000-4000-8000-000000000032']::uuid[]), '23514 update_draft_invoice: claim_short'), 'hour claimed by another invoice refused');
SET LOCAL request.jwt.claims = '{"sub":"82400000-0000-4000-8000-000000000003","role":"authenticated"}';
SELECT pg_temp.check_true(starts_with(pg_temp.try_update(:'draft_id'), '42501 update_draft_invoice: invoice not found or access denied'), 'non-manager refused');
RESET ROLE;
SELECT pg_temp.check_true(pg_temp.snapshot(:'draft_id')->'header' = :'before_refusal'::jsonb->'header', 'refusals preserve header');
UPDATE public.invoices SET status = 'sent', invoice_number = 'EDIT-824-SENT' WHERE id = :'other_id';
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"82400000-0000-4000-8000-000000000001","role":"authenticated"}';
SELECT pg_temp.check_true(starts_with(pg_temp.try_update(:'other_id'), '23514 update_draft_invoice: not_draft'), 'non-draft invoice refused');
SELECT public.create_draft_studio_invoice('82400000-0000-4000-8000-000000000003',
 '82400000-0000-4000-8000-000000000010', 'Studio regarding', 0, 15, 'Original studio', pg_temp.hand_lines()) AS studio_id \gset
SELECT pg_temp.check_true(pg_temp.try_update(:'studio_id') = 'success', 'studio draft edit succeeds');
SELECT pg_temp.check_true(starts_with(pg_temp.try_update(:'studio_id', p_entries => ARRAY['82400000-0000-4000-8000-000000000034']::uuid[]), '23514 update_draft_invoice: claim_short'), 'studio draft refuses hours');
SELECT pg_temp.check_true(starts_with(pg_temp.try_update(:'studio_id', p_billing => '[{"purchaseId":"82400000-0000-4000-8000-000000000040"}]'), '23514 update_draft_invoice: draft:'), 'studio draft refuses project billing');
SELECT pg_temp.check_true(starts_with(pg_temp.try_update(:'studio_id', p_lines => pg_temp.link_lines(false)), '23514 update_draft_invoice: draft:'), 'studio draft refuses project lines');
RESET ROLE;
SELECT pg_temp.check_true((SELECT project_id IS NULL AND title = 'Studio regarding' AND total_cents = 13439
 AND internal_notes = 'Private note' FROM public.invoices WHERE id = :'studio_id'), 'studio edit preserves target and recomputes totals');
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"82400000-0000-4000-8000-000000000001","role":"authenticated"}';
SELECT public.void_invoice(:'draft_id', 'Edit regression cleanup');
RESET ROLE;
SELECT pg_temp.check_true(NOT EXISTS(SELECT 1 FROM public.project_time_entries WHERE invoice_id = :'draft_id'), 'entry-first void still releases edited hours');
SELECT pg_temp.check_true((SELECT status = 'pending' AND invoice_id IS NULL FROM public.project_payment_milestones WHERE id = '82400000-0000-4000-8000-000000000052'), 'entry-first void still releases edited milestone');

-- A memo edit keeps its deposit snapshot even when another draft owns balance.
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"82400000-0000-4000-8000-000000000001","role":"authenticated"}';
SELECT id AS deposit_id FROM public.compose_project_invoice(
 '82400000-0000-4000-8000-000000000020', '82400000-0000-4000-8000-000000000001',
 '82400000-0000-4000-8000-000000000003', '82400000-0000-4000-8000-000000000010',
 0, 15, 'Deposit snapshot', NULL, '[]', '{}',
 '[{"ffeItemId":"82400000-0000-4000-8000-000000000061","stage":"deposit","depositPct":25,"amountCents":3000,"description":"Original deposit"}]') \gset
SELECT id AS balance_id FROM public.compose_project_invoice(
 '82400000-0000-4000-8000-000000000020', '82400000-0000-4000-8000-000000000001',
 '82400000-0000-4000-8000-000000000003', '82400000-0000-4000-8000-000000000010',
 0, 15, 'Balance snapshot', NULL, pg_temp.hand_lines(), '{}', '[]') \gset
SELECT * FROM public.add_invoice_billing_lines(:'balance_id',
 '[{"ffeItemId":"82400000-0000-4000-8000-000000000061","stage":"balance","amountCents":9000}]');
SELECT pg_temp.check_true(pg_temp.try_update(:'deposit_id',
 '[{"kind":"adhoc","description":"Included consultation","quantity":1,"unit_amount_cents":0,"sort_order":0}]', '{}',
 '[{"ffeItemId":"82400000-0000-4000-8000-000000000061","stage":"deposit","depositPct":25,"amountCents":3000,"description":"Original deposit"}]') = 'success', 'deposit snapshot survives another invoice balance');
SELECT pg_temp.check_true((SELECT description = 'Original deposit' AND amount_cents = 3000 AND billing_stage_pct = 25
 FROM public.invoice_line_items WHERE invoice_id = :'deposit_id' AND billing_stage = 'deposit'), 'retained percent amount and description survive');
SELECT pg_temp.check_true(EXISTS(SELECT 1 FROM public.invoice_line_items WHERE invoice_id = :'deposit_id' AND description = 'Included consultation' AND amount_cents = 0), 'zero-dollar persisted hand line is legal');
SELECT pg_temp.check_true(EXISTS(SELECT 1 FROM pg_locks WHERE locktype = 'advisory' AND pid = pg_backend_pid()
 AND classid = ((hashtextextended('invoice-edit:' || :'balance_id', 0) >> 32) & 4294967295)::oid
 AND objid = (hashtextextended('invoice-edit:' || :'balance_id', 0) & 4294967295)::oid AND objsubid = 1 AND granted), 'direct billing add holds the shared invoice advisory lock');
-- Release the other invoice's balance, then put both stages on this draft.
SELECT public.void_invoice(:'balance_id', 'Dependency order fixture');
SELECT * FROM public.add_invoice_billing_lines(:'deposit_id',
 '[{"ffeItemId":"82400000-0000-4000-8000-000000000061","stage":"balance","amountCents":9000,"sortOrder":0}]');
SELECT pg_temp.check_true(pg_temp.try_update(:'deposit_id', pg_temp.hand_lines(), '{}',
 '[{"ffeItemId":"82400000-0000-4000-8000-000000000061","stage":"balance","amountCents":9000,"sortOrder":0},{"ffeItemId":"82400000-0000-4000-8000-000000000061","stage":"deposit","depositPct":25,"amountCents":3000,"sortOrder":1}]') = 'success', 'balance-first display round trips in deposit dependency order');
SELECT pg_temp.check_true((SELECT count(*) = 2 AND bool_and(sort_order = CASE WHEN billing_stage = 'balance' THEN 0 ELSE 1 END)
 FROM public.invoice_line_items WHERE invoice_id = :'deposit_id' AND ffe_item_id IS NOT NULL), 'dependency restore preserves each display sort order');
RESET ROLE;
SELECT pg_temp.check_true(NOT has_function_privilege('authenticated', 'public._invoice_billing_prelock(uuid[],uuid[],uuid[],uuid[])', 'EXECUTE')
 AND NOT has_function_privilege('anon', 'public._invoice_billing_prelock(uuid[],uuid[],uuid[],uuid[])', 'EXECUTE'), 'billing prelock is internal only');
-- Native UUID input spellings accepted by the writers are also prelocked.
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"82400000-0000-4000-8000-000000000001","role":"authenticated"}';
SELECT id AS native_id FROM public.create_draft_invoice(
 '82400000-0000-4000-8000-000000000020','82400000-0000-4000-8000-000000000001',
 '82400000-0000-4000-8000-000000000003','82400000-0000-4000-8000-000000000010',0,15,NULL,NULL,
 '[{"kind":"ffe","ffe_item_id":"{82400000000040008000000000000062}","description":"Native UUID","quantity":1,"unit_amount_cents":18000,"sort_order":0}]') \gset
SELECT pg_temp.check_true(EXISTS(SELECT 1 FROM public.invoice_line_items WHERE invoice_id=:'native_id' AND ffe_item_id='82400000-0000-4000-8000-000000000062'), 'direct create accepts native noncanonical UUID spelling');
SELECT public.void_invoice(:'native_id','Native UUID fixture');
SELECT id AS padded_id FROM public.create_draft_invoice(
 '82400000-0000-4000-8000-000000000020','82400000-0000-4000-8000-000000000001',
 '82400000-0000-4000-8000-000000000003','82400000-0000-4000-8000-000000000010',0,15,NULL,NULL,pg_temp.hand_lines()) \gset
SELECT * FROM public.add_invoice_billing_lines(:'padded_id','[{"ffeItemId":" 82400000-0000-4000-8000-000000000062 ","stage":"deposit","depositPct":25}]');
SELECT pg_temp.check_true(pg_temp.try_update(:'padded_id',pg_temp.hand_lines(),'{}','[{"ffeItemId":" {82400000000040008000000000000062} ","stage":"deposit","depositPct":25}]')='success', 'edit and direct add accept trimmed native UUID spellings');
RESET ROLE;
SELECT pg_temp.snapshot(:'padded_id') AS padded_snapshot \gset
SET LOCAL ROLE authenticated;
SELECT pg_temp.check_true(starts_with(pg_temp.try_update(:'padded_id',p_billing=>'[{"ffeItemId":"not-a-uuid","stage":"deposit","depositPct":25}]'),'22023 update_draft_invoice: lines:') OR starts_with(pg_temp.try_update(:'padded_id',p_billing=>'[{"ffeItemId":"not-a-uuid","stage":"deposit","depositPct":25}]'),'23514 update_draft_invoice: lines:'), 'invalid UUID remains a billing writer refusal');
RESET ROLE;
SELECT pg_temp.check_true(pg_temp.snapshot(:'padded_id')=:'padded_snapshot'::jsonb,'invalid UUID refusal preserves the draft snapshot');
ROLLBACK;
