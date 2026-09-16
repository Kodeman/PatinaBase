\set ON_ERROR_STOP on
DELETE FROM public.trade_rfq_tokens  WHERE id='ad700000-0000-4000-8000-000000000001';
DELETE FROM public.trade_rfq_requests WHERE id='ad800000-0000-4000-8000-000000000001';
DELETE FROM public.plan_transmittal_tokens WHERE id='ad500000-0000-4000-8000-000000000001';
DELETE FROM public.plan_transmittals WHERE id='ad400000-0000-4000-8000-000000000001';
DELETE FROM public.plan_issues WHERE id='ad600000-0000-4000-8000-000000000001';
DELETE FROM public.invoice_links WHERE id='ad300000-0000-4000-8000-000000000001';
DELETE FROM public.organization_members WHERE organization_id='ad200000-0000-4000-8000-000000000001';
DELETE FROM public.organizations WHERE id='ad200000-0000-4000-8000-000000000001';
DELETE FROM public.profiles WHERE id='ad100000-0000-4000-8000-000000000001';
DELETE FROM auth.users WHERE id='ad100000-0000-4000-8000-000000000001';
SELECT 'fixture torn down' AS ok,
       (SELECT count(*) FROM public.invoice_links) inv,
       (SELECT count(*) FROM public.trade_rfq_tokens) rfq,
       (SELECT count(*) FROM public.plan_transmittal_tokens) plan,
       (SELECT count(*) FROM public.organizations) orgs;
