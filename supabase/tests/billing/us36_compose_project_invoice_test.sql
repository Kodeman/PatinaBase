-- 00821 / K13: one-call invoice composition; transaction-wrapped fixture.
-- Run with psql -X -v ON_ERROR_STOP=1 -f supabase/tests/billing/us36_compose_project_invoice_test.sql.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT plan(25);

INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, instance_id, aud, role)
VALUES
 ('82100000-0000-4000-8000-000000000001', 'compose-owner@test.invalid', '', now(), now(), now(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
 ('82100000-0000-4000-8000-000000000002', 'compose-peer@test.invalid', '', now(), now(), now(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
 ('82100000-0000-4000-8000-000000000003', 'compose-client@test.invalid', '', now(), now(), now(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');
INSERT INTO public.profiles (id, email, full_name, is_designer, created_at, updated_at)
VALUES
 ('82100000-0000-4000-8000-000000000001', 'compose-owner@test.invalid', 'Compose Owner', true, now(), now()),
 ('82100000-0000-4000-8000-000000000002', 'compose-peer@test.invalid', 'Compose Peer', true, now(), now()),
 ('82100000-0000-4000-8000-000000000003', 'compose-client@test.invalid', 'Compose Client', false, now(), now())
ON CONFLICT (id) DO UPDATE SET is_designer = EXCLUDED.is_designer, full_name = EXCLUDED.full_name;
INSERT INTO public.organizations (id, type, name, slug, status)
VALUES ('82100000-0000-4000-8000-000000000010', 'design_studio', 'Compose Studio', 'compose-821-test', 'active');
INSERT INTO public.organization_members (user_id, organization_id, role, status, joined_at)
VALUES
 ('82100000-0000-4000-8000-000000000001', '82100000-0000-4000-8000-000000000010', 'owner', 'active', now()),
 ('82100000-0000-4000-8000-000000000002', '82100000-0000-4000-8000-000000000010', 'member', 'active', now());
INSERT INTO public.user_roles (user_id, role_id, granted_by)
SELECT '82100000-0000-4000-8000-000000000001', id, '82100000-0000-4000-8000-000000000001'
FROM public.roles WHERE name = 'studio_owner';
INSERT INTO public.user_roles (user_id, role_id, granted_by)
SELECT '82100000-0000-4000-8000-000000000002', id, '82100000-0000-4000-8000-000000000001'
FROM public.roles WHERE name = 'studio_designer';
INSERT INTO public.projects (id, name, designer_id, created_by, client_id, studio_id, status)
VALUES ('82100000-0000-4000-8000-000000000020', 'Compose Job', '82100000-0000-4000-8000-000000000001',
 '82100000-0000-4000-8000-000000000001', '82100000-0000-4000-8000-000000000003',
 '82100000-0000-4000-8000-000000000010', 'active');
INSERT INTO public.projects (id, name, designer_id, created_by, client_id, studio_id, status)
VALUES ('82100000-0000-4000-8000-000000000021', 'Member Lead Job', '82100000-0000-4000-8000-000000000002',
 '82100000-0000-4000-8000-000000000002', '82100000-0000-4000-8000-000000000003',
 '82100000-0000-4000-8000-000000000010', 'active');
INSERT INTO public.studio_member_rates (studio_id, user_id, hourly_rate_cents, effective_from)
VALUES ('82100000-0000-4000-8000-000000000010', '82100000-0000-4000-8000-000000000001', 20000, DATE '2020-01-01');
INSERT INTO public.project_time_entries (id, project_id, user_id, started_at, duration_minutes, billable, hourly_rate_cents, source)
VALUES
 ('82100000-0000-4000-8000-000000000031', '82100000-0000-4000-8000-000000000020', '82100000-0000-4000-8000-000000000001', now() - interval '2 days', 60, true, 20000, 'manual_entry'),
 ('82100000-0000-4000-8000-000000000032', '82100000-0000-4000-8000-000000000020', '82100000-0000-4000-8000-000000000001', now() - interval '1 day', 30, true, 20000, 'manual_entry'),
 ('82100000-0000-4000-8000-000000000033', '82100000-0000-4000-8000-000000000020', '82100000-0000-4000-8000-000000000001', now() - interval '3 days', 30, true, 20000, 'manual_entry'),
 ('82100000-0000-4000-8000-000000000034', '82100000-0000-4000-8000-000000000021', '82100000-0000-4000-8000-000000000001', now() - interval '1 day', 30, true, 20000, 'manual_entry');
INSERT INTO public.studio_purchases (id, organization_id, project_id, kind, payee_name, purchased_on, amount_cents)
VALUES ('82100000-0000-4000-8000-000000000040', '82100000-0000-4000-8000-000000000010',
 '82100000-0000-4000-8000-000000000020', 'expense', 'Composition expense', current_date, 5000);

-- The wrapper catches a refused statement so its subtransaction rolls back and
-- the caller can inspect both the error and database state in this test.
CREATE FUNCTION pg_temp.try_compose(p_memo text, p_entries uuid[], p_billing jsonb,
  p_expected_designer_id uuid DEFAULT '82100000-0000-4000-8000-000000000001',
  p_project_id uuid DEFAULT '82100000-0000-4000-8000-000000000020')
RETURNS text LANGUAGE plpgsql AS $$
BEGIN
  PERFORM public.compose_project_invoice(
    p_project_id,
    p_expected_designer_id,
    '82100000-0000-4000-8000-000000000003',
    '82100000-0000-4000-8000-000000000010',
    0, 15, p_memo, NULL,
    '[{"kind":"adhoc","description":"Design","quantity":1,"unit_amount_cents":10000,"sort_order":0}]'::jsonb,
    p_entries, p_billing);
  RETURN 'success';
EXCEPTION WHEN OTHERS THEN
  RETURN SQLSTATE || ' ' || SQLERRM;
END;
$$;
GRANT EXECUTE ON FUNCTION pg_temp.try_compose(text,uuid[],jsonb,uuid,uuid) TO authenticated;

SELECT ok(has_function_privilege('authenticated', 'public.compose_project_invoice(uuid,uuid,uuid,uuid,numeric,integer,text,text,jsonb,uuid[],jsonb)', 'EXECUTE'), 'authenticated can call composer');
SELECT ok(NOT has_function_privilege('anon', 'public.compose_project_invoice(uuid,uuid,uuid,uuid,numeric,integer,text,text,jsonb,uuid[],jsonb)', 'EXECUTE'), 'anon cannot call composer');
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"82100000-0000-4000-8000-000000000001","role":"authenticated"}';
SELECT is(pg_temp.try_compose('happy', ARRAY['82100000-0000-4000-8000-000000000031']::uuid[],
 '[{"purchaseId":"82100000-0000-4000-8000-000000000040"}]'::jsonb), 'success', 'draft, claim, and purchase billing succeed together');
RESET ROLE;
SELECT is((SELECT count(*)::integer FROM public.invoices WHERE memo = 'happy'), 1, 'happy draft persists');
SELECT is((SELECT count(*)::integer FROM public.invoice_line_items l JOIN public.invoices i ON i.id = l.invoice_id WHERE i.memo = 'happy'), 2, 'initial and purchase lines both persist');
SELECT ok((SELECT invoice_id IS NOT NULL FROM public.project_time_entries WHERE id = '82100000-0000-4000-8000-000000000031'), 'happy claim persists');
SELECT is((SELECT status FROM public.studio_purchases WHERE id = '82100000-0000-4000-8000-000000000040'), 'billed', 'purchase was billed');

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"82100000-0000-4000-8000-000000000001","role":"authenticated"}';
SELECT ok(starts_with(pg_temp.try_compose('partial', ARRAY['82100000-0000-4000-8000-000000000032','82100000-0000-4000-8000-000000000031']::uuid[], '[]'::jsonb),
 '23514 compose_project_invoice: claim_short'), 'partial claim refuses atomically');
RESET ROLE;
SELECT is((SELECT count(*)::integer FROM public.invoices WHERE memo = 'partial'), 0, 'partial claim leaves no header or initial lines');
SELECT ok((SELECT invoice_id IS NULL FROM public.project_time_entries WHERE id = '82100000-0000-4000-8000-000000000032'), 'partial claim leaves free hour unclaimed');
SELECT ok((SELECT invoice_id = (SELECT id FROM public.invoices WHERE memo = 'happy') FROM public.project_time_entries WHERE id = '82100000-0000-4000-8000-000000000031'), 'partial claim never detaches existing hour');

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"82100000-0000-4000-8000-000000000001","role":"authenticated"}';
SELECT ok(starts_with(pg_temp.try_compose('bad-lines', ARRAY['82100000-0000-4000-8000-000000000032']::uuid[], '[{"purchaseId":"not-a-uuid"}]'::jsonb),
 '23514 compose_project_invoice: lines: add_invoice_billing_lines:'), 'billing refusal carries lines stage');
RESET ROLE;
SELECT is((SELECT count(*)::integer FROM public.invoices WHERE memo = 'bad-lines'), 0, 'billing refusal removes the whole draft');
SELECT ok((SELECT invoice_id IS NULL FROM public.project_time_entries WHERE id = '82100000-0000-4000-8000-000000000032'), 'billing refusal rolls claim back');
SELECT is((SELECT count(*)::integer FROM public.invoice_line_items l JOIN public.invoices i ON i.id = l.invoice_id WHERE i.memo = 'bad-lines'), 0, 'billing refusal leaves no lines');

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"82100000-0000-4000-8000-000000000002","role":"authenticated"}';
SELECT ok(starts_with(pg_temp.try_compose('unauthorized-hour', ARRAY['82100000-0000-4000-8000-000000000032']::uuid[], '[]'::jsonb),
 '23514 compose_project_invoice: claim_short'), 'studio peer cannot claim another member hour');
RESET ROLE;
SELECT is((SELECT count(*)::integer FROM public.invoices WHERE memo = 'unauthorized-hour'), 0, 'unauthorized claim leaves no draft');
SELECT ok((SELECT invoice_id IS NULL FROM public.project_time_entries WHERE id = '82100000-0000-4000-8000-000000000032'), 'unauthorized claim leaves hour unclaimed');

SELECT ok((SELECT role = 'member' FROM public.organization_members
  WHERE user_id = '82100000-0000-4000-8000-000000000002'
    AND organization_id = '82100000-0000-4000-8000-000000000010'),
  'project lead has only a plain member seat');
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"82100000-0000-4000-8000-000000000002","role":"authenticated"}';
SELECT is(pg_temp.try_compose('member-lead-colleague-hour',
  ARRAY['82100000-0000-4000-8000-000000000034']::uuid[], '[]'::jsonb,
  '82100000-0000-4000-8000-000000000002',
  '82100000-0000-4000-8000-000000000021'), 'success',
  'plain member project lead composes with colleague hour');
RESET ROLE;
SELECT is((SELECT count(*)::integer FROM public.invoices WHERE memo = 'member-lead-colleague-hour'), 1,
  'plain member lead draft persists');
SELECT ok((SELECT invoice_id = (SELECT id FROM public.invoices WHERE memo = 'member-lead-colleague-hour')
  FROM public.project_time_entries WHERE id = '82100000-0000-4000-8000-000000000034'),
  'plain member lead claimed colleague hour');

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"82100000-0000-4000-8000-000000000001","role":"authenticated"}';
SELECT ok(starts_with(pg_temp.try_compose('claimed-again', ARRAY['82100000-0000-4000-8000-000000000031']::uuid[], '[]'::jsonb),
 '23514 compose_project_invoice: claim_short'), 'already-claimed hour refuses as claim_short');
RESET ROLE;
SELECT is((SELECT count(*)::integer FROM public.invoices WHERE memo = 'claimed-again'), 0, 'already-claimed hour leaves no new draft');
SELECT ok((SELECT invoice_id = (SELECT id FROM public.invoices WHERE memo = 'happy') FROM public.project_time_entries WHERE id = '82100000-0000-4000-8000-000000000031'), 'existing claim remains unchanged');
-- psql does not parse TAP; turn any failed pgtap assertion into a nonzero exit.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM finish()) THEN
    RAISE EXCEPTION 'compose_project_invoice regression failed';
  END IF;
END $$;
ROLLBACK;
