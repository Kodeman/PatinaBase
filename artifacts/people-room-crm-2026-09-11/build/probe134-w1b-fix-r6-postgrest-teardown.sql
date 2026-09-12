\set ON_ERROR_STOP on
DELETE FROM public.trade_rfq_tokens   WHERE id='af700000-0000-4000-8000-000000000001';
DELETE FROM public.trade_rfq_requests WHERE id='af800000-0000-4000-8000-000000000001';
-- plan_transmittals/plan_issues rows are immutable by trigger
-- (_plan_room_immutable_row), so the teardown drops to replica role for those
-- two deletes only. Local stack, sole owner.
SET session_replication_role = replica;
DELETE FROM public.plan_transmittal_tokens WHERE id='af500000-0000-4000-8000-000000000001';
DELETE FROM public.plan_transmittals  WHERE id='af400000-0000-4000-8000-000000000001';
DELETE FROM public.plan_issues        WHERE id='af600000-0000-4000-8000-000000000001';
DELETE FROM public.invoice_links      WHERE id='af300000-0000-4000-8000-000000000001';
DELETE FROM public.organization_members WHERE organization_id IN
  ('af200000-0000-4000-8000-000000000001','af200000-0000-4000-8000-000000000002');
DELETE FROM public.organizations WHERE id IN
  ('af200000-0000-4000-8000-000000000001','af200000-0000-4000-8000-000000000002');
DELETE FROM public.profiles WHERE id IN
  ('af100000-0000-4000-8000-000000000001','af100000-0000-4000-8000-000000000002');
DELETE FROM auth.users WHERE id IN
  ('af100000-0000-4000-8000-000000000001','af100000-0000-4000-8000-000000000002');
SET session_replication_role = origin;
SELECT 'fixture torn down' AS ok,
       (SELECT count(*) FROM public.invoice_links) inv,
       (SELECT count(*) FROM public.trade_rfq_tokens) rfq,
       (SELECT count(*) FROM public.plan_transmittal_tokens) plan,
       (SELECT count(*) FROM public.organizations) orgs;
