BEGIN;
DO $$ BEGIN
  IF current_setting('rc7.e6_stack', true) IS DISTINCT FROM 'patina-rc7-e6' OR NOT EXISTS (
    SELECT 1 FROM public.projects WHERE id='f0180000-0000-4000-8000-000000000010'
      AND designer_id='f0180000-0000-4000-8000-000000000002'
  ) THEN RAISE EXCEPTION 'E6 requires its owned F01 stack'; END IF;
  IF EXISTS (SELECT 1 FROM public.purchase_orders WHERE id='f6110000-0000-4000-8000-000000000101')
     OR EXISTS (SELECT 1 FROM public.notification_log WHERE id='f6110000-0000-4000-8000-000000000102')
     OR EXISTS (SELECT 1 FROM public.vendors WHERE id='f6110000-0000-4000-8000-000000000103')
  THEN RAISE EXCEPTION 'E6 fixture already exists'; END IF;
END $$;
INSERT INTO public.vendors(id,name) VALUES ('f6110000-0000-4000-8000-000000000103','E6 Fictional Maker');
INSERT INTO public.purchase_orders(id,designer_id,project_id,vendor_id,payment_pattern,po_number,status)
VALUES ('f6110000-0000-4000-8000-000000000101',
  'f0180000-0000-4000-8000-000000000002','f0180000-0000-4000-8000-000000000010',
  'f6110000-0000-4000-8000-000000000103',enum_first(NULL::public.purchase_order_payment_pattern),
  'E6-DRAFT','draft');
INSERT INTO public.notification_log(id,user_id,type,channel,status,metadata,created_at)
VALUES ('f6110000-0000-4000-8000-000000000102',
  'f0180000-0000-4000-8000-000000000002','e6_local_notice','in_app','sent',
  jsonb_build_object('title','E6 fictional notice','message','E6 local return fixture',
  'project_id','f0180000-0000-4000-8000-000000000010'),now()-interval '1 hour');
COMMIT;
