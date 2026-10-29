-- E5 A12: legacy-origin authenticated PO grouping and sequential duplicate retry.
-- Rolled back; no Stripe/payment call or external send.
\set ON_ERROR_STOP on
SELECT :'HOST' = '127.0.0.1' AND :'PORT' = '55122' AS owned_stack \gset
\if :owned_stack
\else
DO $$ BEGIN RAISE EXCEPTION 'E5 order retry requires the owned 127.0.0.1:55122 stack'; END $$;
\quit
\endif
BEGIN;
DO $$ BEGIN
  IF current_database() <> 'postgres' OR EXISTS (
    SELECT 1 FROM public.projects WHERE id='e5120000-0000-4000-8000-000000000001'
  ) THEN RAISE EXCEPTION 'E5 fixture collision'; END IF;
END $$;
INSERT INTO auth.users(id,email,encrypted_password,email_confirmed_at,created_at,updated_at,instance_id,aud,role)
VALUES ('e5120000-0000-4000-8000-000000000002','e5-order-owner@test.invalid','',now(),now(),now(),
 '00000000-0000-0000-0000-000000000000','authenticated','authenticated');
INSERT INTO public.profiles(id,email,full_name,is_designer)
VALUES ('e5120000-0000-4000-8000-000000000002','e5-order-owner@test.invalid','E5 order owner',true)
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.organizations(id,type,name,slug,status)
VALUES ('e5120000-0000-4000-8000-000000000003','design_studio','E5 fictional ordering studio','e5-ordering-studio','active');
INSERT INTO public.organization_members(user_id,organization_id,role,status,joined_at)
VALUES ('e5120000-0000-4000-8000-000000000002','e5120000-0000-4000-8000-000000000003','owner','active',now());
INSERT INTO public.projects(id,name,designer_id,created_by,studio_id)
VALUES ('e5120000-0000-4000-8000-000000000001','E5 fictional ordering job',
 'e5120000-0000-4000-8000-000000000002','e5120000-0000-4000-8000-000000000002',
 'e5120000-0000-4000-8000-000000000003');
INSERT INTO public.vendors(id,name) VALUES
 ('e5120000-0000-4000-8000-000000000004','E5 fictional maker A'),
 ('e5120000-0000-4000-8000-000000000005','E5 fictional maker B');
INSERT INTO public.project_ffe_items(id,project_id,name,status,quantity,vendor_id,unit_price_cents,trade_price_cents,design_disposition)
VALUES
 ('e5120000-0000-4000-8000-000000000011','e5120000-0000-4000-8000-000000000001','E5 chair','approved',2,'e5120000-0000-4000-8000-000000000004',15000,10000,'selected'),
 ('e5120000-0000-4000-8000-000000000012','e5120000-0000-4000-8000-000000000001','E5 table','approved',1,'e5120000-0000-4000-8000-000000000004',12000,8000,'selected'),
 ('e5120000-0000-4000-8000-000000000013','e5120000-0000-4000-8000-000000000001','E5 lamp','approved',1,'e5120000-0000-4000-8000-000000000005',6000,5000,'selected');
SET LOCAL ROLE authenticated;
DO $e5$
DECLARE
  first_po uuid;
  second_po uuid;
  refusal text;
BEGIN
  PERFORM set_config('request.jwt.claims','{"sub":"e5120000-0000-4000-8000-000000000002","role":"authenticated"}',true);
  SELECT id INTO first_po FROM public.create_purchase_order(
    'e5120000-0000-4000-8000-000000000001','e5120000-0000-4000-8000-000000000004','net_30',
    ARRAY['e5120000-0000-4000-8000-000000000011','e5120000-0000-4000-8000-000000000012']::uuid[]);
  IF (SELECT count(*) FROM public.project_ffe_items WHERE purchase_order_id=first_po)<>2
    OR (SELECT total_cents FROM public.purchase_orders WHERE id=first_po)<>28000 THEN
    RAISE EXCEPTION 'E5 A12 first grouped maker PO did not link both lines at trade total'; END IF;
  RAISE NOTICE 'E5 A12 first maker: one PO, two linked lines, total 28000';
  BEGIN
    PERFORM public.create_purchase_order(
      'e5120000-0000-4000-8000-000000000001','e5120000-0000-4000-8000-000000000004','net_30',
      ARRAY['e5120000-0000-4000-8000-000000000011','e5120000-0000-4000-8000-000000000012']::uuid[]);
  EXCEPTION WHEN OTHERS THEN refusal:=SQLSTATE||':'||SQLERRM; END;
  IF refusal IS NULL OR refusal NOT LIKE 'P0001:create_purchase_order: %already linked%'
    OR (SELECT count(*) FROM public.purchase_orders WHERE project_id='e5120000-0000-4000-8000-000000000001')<>1 THEN
    RAISE EXCEPTION 'E5 A12 duplicate attempt was not refused as already linked'; END IF;
  RAISE NOTICE 'E5 A12 duplicate retry: refused %, PO count 1',refusal;
  SELECT id INTO second_po FROM public.create_purchase_order(
    'e5120000-0000-4000-8000-000000000001','e5120000-0000-4000-8000-000000000005','net_30',
    ARRAY['e5120000-0000-4000-8000-000000000013']::uuid[]);
  IF first_po=second_po OR (SELECT count(*) FROM public.purchase_orders WHERE project_id='e5120000-0000-4000-8000-000000000001')<>2
    OR (SELECT sum(total_cents) FROM public.purchase_orders WHERE project_id='e5120000-0000-4000-8000-000000000001')<>33000
    OR (SELECT count(DISTINCT vendor_id) FROM public.purchase_orders WHERE project_id='e5120000-0000-4000-8000-000000000001')<>2 THEN
    RAISE EXCEPTION 'E5 A12 studio/job ordering totals do not reconcile'; END IF;
  RAISE NOTICE 'E5 A12 job/studio: two exact PO IDs %, %, two makers, total 33000',first_po,second_po;
END $e5$;
ROLLBACK;
