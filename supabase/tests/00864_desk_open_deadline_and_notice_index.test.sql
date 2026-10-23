-- 00864 / SQ-1792 — receipt notice identity, Desk clocks and purchase completion.
BEGIN;
SET LOCAL statement_timeout = '60s';
SET LOCAL lock_timeout = '5s';
CREATE TEMP TABLE receipt_notice_results(label text, passed boolean);
CREATE FUNCTION pg_temp.check_notice(ok boolean, label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO receipt_notice_results VALUES(label,ok IS TRUE);
  RAISE NOTICE '%: %', CASE WHEN ok IS TRUE THEN 'PASS' ELSE 'FAIL' END,label;
END;
$$;
DO $regressions$
DECLARE
  actor uuid := gen_random_uuid(); org uuid; project uuid := gen_random_uuid(); vendor uuid := gen_random_uuid();
  po uuid := gen_random_uuid(); item uuid := gen_random_uuid(); external_item uuid := gen_random_uuid();
  receipt1 uuid; receipt2 uuid; purchase uuid; pending uuid; pending2 uuid; pending3 uuid;
  response jsonb; payload jsonb; actual date; before_count integer;
BEGIN
  INSERT INTO auth.users(id,email,encrypted_password,email_confirmed_at,created_at,updated_at,instance_id,aud,role)
  VALUES(actor,actor||'@sq1790.test.invalid','',now(),now(),now(),'00000000-0000-0000-0000-000000000000','authenticated','authenticated');
  INSERT INTO public.profiles(id,email,full_name,is_designer)
  VALUES(actor,actor||'@sq1790.test.invalid','Receipt notice designer',true) ON CONFLICT(id) DO UPDATE SET is_designer=true;
  org := public._primary_studio_for(actor);
  INSERT INTO public.projects(id,name,designer_id,created_by,studio_id,status)
  VALUES(project,'SQ1790 receiving',actor,actor,org,'active');
  INSERT INTO public.vendors(id,name) VALUES(vendor,'SQ1790 maker');
  INSERT INTO public.project_ffe_items(id,project_id,name,status,quantity,vendor_id,unit_price_cents,design_disposition)
  VALUES(item,project,'Split delivery','approved',6,vendor,100,'selected'),
    (external_item,project,'External delivery','approved',3,vendor,100,'selected');
  INSERT INTO public.purchase_orders(id,designer_id,project_id,vendor_id,payment_pattern,total_cents,status,is_patina_catalog)
  VALUES(po,actor,project,vendor,'net_30',600,'confirmed',false);
  PERFORM set_config('request.jwt.claim.sub',actor::text,true);
  PERFORM set_config('request.jwt.claim.role','authenticated',true);
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated')::text,true);
  UPDATE public.project_ffe_items SET purchase_order_id=po WHERE id=item;
  INSERT INTO public.studio_vendor_accounts(organization_id,vendor_id,claims_window_days)
  VALUES(org,vendor,3) ON CONFLICT(organization_id,vendor_id) DO UPDATE SET claims_window_days=3;

  response := public.record_project_ffe_inspection(po,
    jsonb_build_array(jsonb_build_object('selectionId',item,'receivedQuantity',2,'condition','damaged')),
    'damaged',p_receipt_key=>gen_random_uuid(),p_received_on=>current_date-2);
  receipt1 := (response->>'inspectionId')::uuid;
  INSERT INTO public.damage_claims(receiving_inspection_id,state) VALUES(receipt1,'drafted'),(receipt1,'drafted');
  PERFORM public.sweep_procurement_clocks();
  PERFORM pg_temp.check_notice((SELECT count(*)=1 FROM public.procurement_notifications
    WHERE subject_inspection_id=receipt1 AND kind='claim_window_closing' AND user_id=actor),
    'first receipt gets one notice despite two drafted claims');
  -- Its notice remains after this older receipt's clock has expired.
  UPDATE public.receiving_inspections SET received_on=current_date-20 WHERE id=receipt1;
  response := public.record_project_ffe_inspection(po,
    jsonb_build_array(jsonb_build_object('selectionId',item,'receivedQuantity',4,'condition','damaged')),
    'damaged',p_receipt_key=>gen_random_uuid(),p_received_on=>current_date-2);
  receipt2 := (response->>'inspectionId')::uuid;
  INSERT INTO public.damage_claims(receiving_inspection_id,state) VALUES(receipt2,'drafted');
  PERFORM public.sweep_procurement_clocks();
  PERFORM pg_temp.check_notice((SELECT count(*)=1 FROM public.procurement_notifications
    WHERE subject_inspection_id=receipt2 AND kind='claim_window_closing' AND user_id=actor),
    'second receipt gets its own notice after first receipt notice');
  SELECT count(*) INTO before_count FROM public.procurement_notifications WHERE subject_purchase_order_id=po AND kind='claim_window_closing';
  PERFORM public.sweep_procurement_clocks();
  PERFORM pg_temp.check_notice((SELECT count(*)=before_count FROM public.procurement_notifications WHERE subject_purchase_order_id=po AND kind='claim_window_closing'),
    'repeat sweep dedupes each receipt and recipient');

  -- Exercise the actual SECURITY INVOKER projection with the designer's RLS.
  -- The first arrival is intentionally older than every receipt clock.
  UPDATE public.purchase_orders SET delivered_date=current_date-30 WHERE id=po;
  UPDATE public.damage_claims SET state='resolved',resolved_at=now() WHERE receiving_inspection_id=receipt1;
  SET LOCAL ROLE authenticated;
  payload := public.desk_read(NULL);
  RESET ROLE;
  SELECT (entry->>'vendor_deadline')::date INTO actual FROM jsonb_array_elements(payload->'claim_deadlines') entry
    WHERE entry->>'purchase_order_id'=po::text;
  PERFORM pg_temp.check_notice(actual=current_date+1,'Desk clock uses second receipt instead of PO first arrival');

  UPDATE public.damage_claims SET state='drafted',resolved_at=NULL WHERE receiving_inspection_id=receipt1;
  -- Receipt A is expired; receipt B is still open. Two claims on A must not duplicate the result.
  SET LOCAL ROLE authenticated;
  payload := public.desk_read(NULL);
  RESET ROLE;
  SELECT (entry->>'vendor_deadline')::date INTO actual FROM jsonb_array_elements(payload->'claim_deadlines') entry
    WHERE entry->>'purchase_order_id'=po::text;
  PERFORM pg_temp.check_notice(actual=current_date+1,'Desk prefers open receipt deadline over expired receipt');
  UPDATE public.receiving_inspections SET received_on=current_date-6 WHERE id=receipt2;
  SET LOCAL ROLE authenticated;
  payload := public.desk_read(NULL);
  RESET ROLE;
  SELECT (entry->>'vendor_deadline')::date INTO actual FROM jsonb_array_elements(payload->'claim_deadlines') entry
    WHERE entry->>'purchase_order_id'=po::text;
  PERFORM pg_temp.check_notice(actual=current_date-3,'Desk chooses latest past deadline when all receipts expired');
  PERFORM pg_temp.check_notice((SELECT count(*)=1 FROM jsonb_array_elements(payload->'claim_deadlines') entry
    WHERE entry->>'purchase_order_id'=po::text),'Desk emits one deadline despite multiple claims per receipt');
  UPDATE public.studio_vendor_accounts SET claims_window_days=NULL WHERE organization_id=org AND vendor_id=vendor;
  SET LOCAL ROLE authenticated;
  payload := public.desk_read(NULL);
  RESET ROLE;
  PERFORM pg_temp.check_notice(EXISTS(SELECT 1 FROM jsonb_array_elements(payload->'claim_deadlines') entry
    WHERE entry->>'purchase_order_id'=po::text AND entry->'vendor_deadline'='null'::jsonb),'Desk preserves unknown receipt deadline');
  PERFORM pg_temp.check_notice((SELECT NOT prosecdef FROM pg_proc WHERE oid='public.desk_read(uuid)'::regprocedure),'Desk stays SECURITY INVOKER');

END;
$regressions$;
DO $$ BEGIN
  IF EXISTS(SELECT 1 FROM receipt_notice_results WHERE NOT passed) THEN
    RAISE EXCEPTION 'assertion failed: % desk deadline regressions',(SELECT count(*) FROM receipt_notice_results WHERE NOT passed);
  END IF;
  RAISE NOTICE 'PASS 00864: % assertions',(SELECT count(*) FROM receipt_notice_results);
END $$;
ROLLBACK;
