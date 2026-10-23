-- 00862 / SQ-1787 — review regressions; every fixture rolls back.
BEGIN;
SET LOCAL statement_timeout = '60s';
SET LOCAL lock_timeout = '5s';
CREATE TEMP TABLE repair_results(label text, passed boolean);
CREATE FUNCTION pg_temp.check_repair(ok boolean, label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO repair_results VALUES (label, ok IS TRUE);
  RAISE NOTICE '%: %', CASE WHEN ok IS TRUE THEN 'PASS' ELSE 'FAIL' END, label;
END;
$$;
CREATE FUNCTION pg_temp.rejected(command text, label text, message text DEFAULT NULL) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  BEGIN
    EXECUTE command;
    RAISE EXCEPTION 'unexpected acceptance' USING ERRCODE = 'PZ001';
  EXCEPTION WHEN check_violation THEN
    PERFORM pg_temp.check_repair(message IS NULL OR SQLERRM = message, label);
  WHEN SQLSTATE 'PZ001' THEN
    PERFORM pg_temp.check_repair(false,label);
  END;
END;
$$;
CREATE FUNCTION pg_temp.accepted(command text, label text) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE result jsonb;
BEGIN
  EXECUTE command INTO result;
  PERFORM pg_temp.check_repair(true,label); RETURN result;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Unexpected error for %: %', label, SQLERRM;
  PERFORM pg_temp.check_repair(false,label); RETURN NULL;
END;
$$;
CREATE FUNCTION pg_temp.lines(item uuid, quantity integer, condition text DEFAULT 'good') RETURNS jsonb LANGUAGE sql AS $$
  SELECT jsonb_build_array(jsonb_build_object('selectionId',item,'receivedQuantity',quantity,'condition',condition));
$$;
DO $repairs$
DECLARE
  actor uuid := gen_random_uuid(); member uuid := gen_random_uuid(); outsider uuid := gen_random_uuid();
  org uuid; project uuid := gen_random_uuid(); target uuid := gen_random_uuid(); vendor uuid := gen_random_uuid();
  po uuid := gen_random_uuid(); linked_po uuid := gen_random_uuid(); lineless_po uuid := gen_random_uuid();
  item uuid := gen_random_uuid(); linked_item uuid := gen_random_uuid(); lineless_item uuid := gen_random_uuid();
  external_item uuid := gen_random_uuid(); moving_item uuid := gen_random_uuid();
  shipment uuid := gen_random_uuid(); lineless uuid := gen_random_uuid(); location uuid := gen_random_uuid();
  room uuid := gen_random_uuid(); placement uuid := gen_random_uuid(); purchase uuid;
  receipt uuid; receipt2 uuid; linked_receipt uuid; lineless_receipt uuid;
  key uuid := gen_random_uuid(); result jsonb; cmd text; clock record;
BEGIN
  INSERT INTO auth.users(id,email,encrypted_password,email_confirmed_at,created_at,updated_at,instance_id,aud,role)
  SELECT id,id||'@sq1787.test.invalid','',now(),now(),now(),'00000000-0000-0000-0000-000000000000','authenticated','authenticated'
  FROM unnest(ARRAY[actor,member,outsider]) id;
  INSERT INTO public.profiles(id,email,full_name,is_designer)
  SELECT id,id||'@sq1787.test.invalid','Receiving repairs',true FROM unnest(ARRAY[actor,member,outsider]) id
  ON CONFLICT(id) DO UPDATE SET is_designer=true;
  org := public._primary_studio_for(actor);
  INSERT INTO public.organization_members(user_id,organization_id,role,status) VALUES(member,org,'member','active') ON CONFLICT DO NOTHING;
  INSERT INTO public.projects(id,name,designer_id,created_by,studio_id,status)
  VALUES(project,'SQ1787 source',actor,actor,org,'active'),(target,'SQ1787 target',actor,actor,org,'active');
  INSERT INTO public.vendors(id,name) VALUES(vendor,'SQ1787 maker');
  INSERT INTO public.studio_locations(id,organization_id,kind,label) VALUES(location,org,'receiver','SQ1787 receiver');
  INSERT INTO public.project_ffe_items(id,project_id,name,status,quantity,vendor_id,unit_price_cents,design_disposition)
  VALUES(item,project,'Whole order','approved',6,vendor,100,'selected'),
    (linked_item,project,'Shipment order','approved',6,vendor,100,'selected'),
    (lineless_item,project,'Tracking order','approved',6,vendor,100,'selected'),
    (external_item,project,'External purchase','approved',4,vendor,100,'selected'),
    (moving_item,project,'Moving line','approved',1,vendor,100,'selected');
  INSERT INTO public.purchase_orders(id,designer_id,project_id,vendor_id,payment_pattern,total_cents,status,is_patina_catalog)
  VALUES(po,actor,project,vendor,'net_30',600,'confirmed',false),
    (linked_po,actor,project,vendor,'net_30',600,'draft',false),
    (lineless_po,actor,project,vendor,'net_30',600,'confirmed',false);
  PERFORM set_config('request.jwt.claim.sub',actor::text,true);
  PERFORM set_config('request.jwt.claim.role','authenticated',true);
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated')::text,true);
  UPDATE public.project_ffe_items SET purchase_order_id=po WHERE id=item;
  PERFORM pg_temp.check_repair((SELECT status='ordered' FROM public.project_ffe_items WHERE id=item),'confirmed unsent link counts as ordered');
  UPDATE public.project_ffe_items SET purchase_order_id=linked_po WHERE id=linked_item;
  PERFORM pg_temp.check_repair((SELECT status='approved' FROM public.project_ffe_items WHERE id=linked_item),'unsent draft stays approved');
  UPDATE public.purchase_orders SET status='confirmed' WHERE id=linked_po;
  PERFORM pg_temp.check_repair((SELECT status='ordered' FROM public.project_ffe_items WHERE id=linked_item),'confirmed unsent cascade counts as ordered');
  UPDATE public.project_ffe_items SET purchase_order_id=lineless_po WHERE id=lineless_item;
  INSERT INTO public.po_shipments(id,purchase_order_id,shipped_on) VALUES(shipment,linked_po,current_date),(lineless,lineless_po,current_date);
  INSERT INTO public.po_shipment_lines(shipment_id,ffe_item_id,qty) VALUES(shipment,linked_item,4);

  result := public.record_project_ffe_inspection(po,pg_temp.lines(item,2),NULL,
    p_inspection_pending=>true,p_inspection_owner_user_id=>member,p_receipt_key=>key,p_received_on=>current_date-20,p_location_id=>location);
  receipt := (result->>'inspectionId')::uuid;
  cmd := format('SELECT public.record_project_ffe_inspection(%L,%L,NULL,p_inspection_pending=>true,p_inspection_owner_user_id=>%L,p_receipt_key=>%L,p_received_on=>current_date-20,p_location_id=>%L)',po,pg_temp.lines(item,2),member,key,location);
  result := public.record_project_ffe_inspection(po,pg_temp.lines(item,2),NULL,
    p_inspection_pending=>true,p_inspection_owner_user_id=>member,p_receipt_key=>key,p_received_on=>current_date-20,p_location_id=>location);
  PERFORM pg_temp.check_repair((result->>'reused')::boolean AND result->>'inspectionId'=receipt::text,'identical keyed replay returns stored receipt');
  PERFORM pg_temp.rejected(format('SELECT public.record_project_ffe_inspection(%L,%L,''damaged'',p_receipt_key=>%L)',po,pg_temp.lines(item,2,'damaged'),key),'keyed outcome and pending conflict','receipt_key_conflict');
  PERFORM pg_temp.rejected(format('SELECT public.record_project_ffe_inspection(%L,%L,NULL,p_inspection_pending=>true,p_receipt_key=>%L)',po,pg_temp.lines(item,3),key),'keyed quantity conflict','receipt_key_conflict');
  PERFORM pg_temp.rejected(format('SELECT public.record_project_ffe_inspection(%L,%L,NULL,p_inspection_pending=>false,p_receipt_key=>%L)',po,pg_temp.lines(item,2),key),'keyed pending flag conflict','receipt_key_conflict');
  PERFORM pg_temp.rejected(format('SELECT public.complete_receiving_inspection(%L,''clean'',%L)',receipt,pg_temp.lines(item,2)),
    'short whole PO cannot complete clean','clean receipt requires every purchase-order line to be fully received');
  DELETE FROM public.organization_members WHERE organization_id=org AND user_id=member;
  result := pg_temp.accepted(format('SELECT public.complete_receiving_inspection(%L,''damaged'',%L)',receipt,pg_temp.lines(item,2,'damaged')),'completion after inspection owner leaves');

  result := public.record_project_ffe_inspection(linked_po,pg_temp.lines(linked_item,3),NULL,p_po_shipment_id=>shipment,p_inspection_pending=>true,p_receipt_key=>gen_random_uuid());
  linked_receipt := (result->>'inspectionId')::uuid;
  PERFORM pg_temp.rejected(format('SELECT public.complete_receiving_inspection(%L,''clean'',%L)',linked_receipt,pg_temp.lines(linked_item,3)),
    'short shipment cannot complete clean','clean receipt requires every shipment line to be fully received');
  result := pg_temp.accepted(format('SELECT public.complete_receiving_inspection(%L,''partial'',%L)',linked_receipt,pg_temp.lines(linked_item,3,'short')),'short shipment completes partial');
  result := public.record_project_ffe_inspection(linked_po,pg_temp.lines(linked_item,4),NULL,p_po_shipment_id=>shipment,p_inspection_pending=>true,p_receipt_key=>gen_random_uuid());
  linked_receipt := (result->>'inspectionId')::uuid;
  PERFORM pg_temp.rejected(format('SELECT public.complete_receiving_inspection(%L,''partial'',%L)',linked_receipt,pg_temp.lines(linked_item,4,'short')),
    'fully received shipment cannot complete partial','partial receipt requires at least one short shipment line');
  result := pg_temp.accepted(format('SELECT public.complete_receiving_inspection(%L,''clean'',%L)',linked_receipt,pg_temp.lines(linked_item,4)),'full shipment of short PO completes clean');
  PERFORM pg_temp.check_repair((SELECT received_quantity=4 FROM public.project_ffe_items WHERE id=linked_item),'completion never changes physical counts');

  result := pg_temp.accepted(format('SELECT public.record_project_ffe_inspection(%L,%L,NULL,p_po_shipment_id=>%L,p_inspection_pending=>true,p_receipt_key=>%L)',lineless_po,pg_temp.lines(lineless_item,2),lineless,gen_random_uuid()),'lineless shipment accepts physical counts');
  lineless_receipt := (result->>'inspectionId')::uuid;
  IF lineless_receipt IS NOT NULL THEN
    PERFORM pg_temp.rejected(format('SELECT public.complete_receiving_inspection(%L,''clean'',%L)',lineless_receipt,pg_temp.lines(lineless_item,2)),
      'lineless shipment completion uses whole PO rule','clean receipt requires every purchase-order line to be fully received');
  END IF;
  PERFORM pg_temp.rejected(format('SELECT public.record_project_ffe_inspection(%L,%L,''clean'',p_po_shipment_id=>%L,p_receipt_key=>%L)',lineless_po,pg_temp.lines(lineless_item,3),lineless,gen_random_uuid()),
    'lineless shipment batch clean uses whole PO rule','clean receipt requires every purchase-order line to be fully received');
  result := pg_temp.accepted(format('SELECT public.record_project_ffe_inspection(%L,%L,''partial'',p_po_shipment_id=>%L,p_receipt_key=>%L)',lineless_po,pg_temp.lines(lineless_item,3,'short'),lineless,gen_random_uuid()),'lineless shipment batch partial uses whole PO rule');
  result := pg_temp.accepted(format('SELECT public.record_project_ffe_inspection(%L,%L,NULL,p_po_shipment_id=>%L,p_inspection_pending=>true,p_receipt_key=>%L)',lineless_po,pg_temp.lines(lineless_item,6),lineless,gen_random_uuid()),'lineless shipment full pending receipt');
  lineless_receipt := (result->>'inspectionId')::uuid;
  IF lineless_receipt IS NOT NULL THEN
    PERFORM pg_temp.rejected(format('SELECT public.complete_receiving_inspection(%L,''partial'',%L)',lineless_receipt,pg_temp.lines(lineless_item,6,'short')),
      'full whole PO cannot complete partial','partial receipt requires at least one short purchase-order line');
  END IF;

  PERFORM set_config('request.jwt.claim.sub',outsider::text,true);
  BEGIN
    PERFORM public.complete_receiving_inspection(linked_receipt,'damaged',pg_temp.lines(linked_item,4,'damaged'));
    PERFORM pg_temp.check_repair(false,'foreign completion denied');
  EXCEPTION WHEN insufficient_privilege THEN PERFORM pg_temp.check_repair(true,'foreign completion denied'); END;
  PERFORM set_config('request.jwt.claim.sub',actor::text,true);
  result := public.record_project_ffe_inspection(linked_po,pg_temp.lines(linked_item,4),NULL,p_inspection_pending=>true,p_receipt_key=>gen_random_uuid());
  linked_receipt := (result->>'inspectionId')::uuid;
  UPDATE public.purchase_orders SET status='cancelled' WHERE id=linked_po;
  PERFORM pg_temp.rejected(format('SELECT public.complete_receiving_inspection(%L,''damaged'',%L)',linked_receipt,pg_temp.lines(linked_item,4,'damaged')),
    'cancelled PO completion refused','purchase order is not in a receivable state');

  SELECT id INTO purchase FROM public.record_studio_purchase(jsonb_build_object('projectId',project,'ffeItemId',external_item,'kind','one_off','payeeName','Dealer','amountCents',400,'purchasedOn',current_date));
  INSERT INTO public.project_rooms(id,project_id,name) VALUES(room,project,'Receiving room');
  INSERT INTO public.project_ffe_placements(id,project_id,project_room_id,ffe_item_id,quantity) VALUES(placement,project,room,external_item,4);
  result := public.record_project_ffe_inspection(NULL,
    jsonb_build_array(jsonb_build_object('selectionId',external_item,'receivedQuantity',1,'placements',jsonb_build_array(jsonb_build_object('placementId',placement,'quantity',1)))),
    NULL,p_studio_purchase_id=>purchase,p_inspection_pending=>true,p_receipt_key=>gen_random_uuid());
  result := pg_temp.accepted(format('SELECT public.record_project_ffe_inspection(NULL,%L,NULL,p_studio_purchase_id=>%L,p_inspection_pending=>true,p_receipt_key=>%L)',
    jsonb_build_array(jsonb_build_object('selectionId',external_item,'receivedQuantity',2,'placements',jsonb_build_array(jsonb_build_object('placementId',placement,'quantity',1)))),purchase,gen_random_uuid()),'second studio purchase receipt places only its delivery delta');
  PERFORM pg_temp.check_repair((SELECT sum(quantity)=2 FROM public.project_ffe_placement_receipts WHERE placement_id=placement),'two studio purchase receipts preserve room quantities');

  INSERT INTO public.project_destination_locations(project_id,location_id) VALUES(project,location);
  UPDATE public.project_ffe_items SET planned_destination_location_id=location WHERE id=moving_item;
  BEGIN
    UPDATE public.project_ffe_items SET project_id=target,selection_thread_id=NULL WHERE id=moving_item;
    PERFORM pg_temp.check_repair((SELECT planned_destination_location_id IS NULL FROM public.project_ffe_items WHERE id=moving_item),'moved line clears unavailable destination');
  EXCEPTION WHEN foreign_key_violation THEN PERFORM pg_temp.check_repair(false,'moved line clears unavailable destination'); END;
  INSERT INTO public.project_destination_locations(project_id,location_id) VALUES(target,location);
  UPDATE public.project_ffe_items SET planned_destination_location_id=location WHERE id=moving_item;
  UPDATE public.project_ffe_items SET project_id=CASE WHEN project_id=project THEN target ELSE project END,selection_thread_id=NULL WHERE id=moving_item;
  PERFORM pg_temp.check_repair((SELECT planned_destination_location_id=location FROM public.project_ffe_items WHERE id=moving_item),'moved line keeps shared destination');

  -- A second delivery arrives much later than the first; the PO clock is intentionally unchanged.
  result := public.record_project_ffe_inspection(po,pg_temp.lines(item,6,'damaged'),'damaged',p_receipt_key=>gen_random_uuid(),p_received_on=>current_date-2);
  receipt2 := (result->>'inspectionId')::uuid;
  INSERT INTO public.damage_claims(receiving_inspection_id,state) VALUES(receipt2,'drafted');
  INSERT INTO public.studio_vendor_accounts(organization_id,vendor_id,claims_window_days,inspection_window_days)
  VALUES(org,vendor,3,'{"concealed_carrier":5}') ON CONFLICT(organization_id,vendor_id) DO UPDATE SET claims_window_days=3,inspection_window_days='{"concealed_carrier":5}';
  PERFORM pg_temp.check_repair(to_regprocedure('public.procurement_receipt_claim_deadline(uuid)') IS NOT NULL,'receipt scoped claim deadline exists');
  IF to_regprocedure('public.procurement_receipt_claim_deadline(uuid)') IS NOT NULL THEN
    SELECT * INTO clock FROM public.procurement_receipt_claim_deadline(receipt2);
    PERFORM pg_temp.check_repair(clock.delivered_on=current_date-2 AND clock.vendor_deadline=current_date+1 AND clock.carrier_deadline=current_date+3,'receipt two claim deadline starts at receipt two');
    PERFORM pg_temp.check_repair((SELECT delivered_on=current_date-20 FROM public.procurement_claim_deadline(po)),'PO level clock remains first arrival');
    PERFORM public.sweep_procurement_clocks();
    PERFORM pg_temp.check_repair(EXISTS(SELECT 1 FROM public.procurement_notifications WHERE subject_purchase_order_id=po AND kind='claim_window_closing'),'sweep notices receipt two deadline despite old first delivery');
    UPDATE public.receiving_inspections SET received_on=NULL,inspected_local_date=current_date-1 WHERE id=receipt2;
    PERFORM pg_temp.check_repair((SELECT delivered_on=current_date-1 FROM public.procurement_receipt_claim_deadline(receipt2)),'claim date falls back to inspected local date');
    UPDATE public.receiving_inspections SET inspected_local_date=NULL WHERE id=receipt2;
    PERFORM pg_temp.check_repair((SELECT delivered_on=ri.inspected_at::date FROM public.procurement_receipt_claim_deadline(receipt2),public.receiving_inspections ri WHERE ri.id=receipt2),'claim date falls back to inspected timestamp');
    UPDATE public.studio_vendor_accounts SET claims_window_days=NULL,inspection_window_days=NULL WHERE organization_id=org AND vendor_id=vendor;
    PERFORM pg_temp.check_repair((SELECT claims_window_days IS NULL AND vendor_deadline IS NULL FROM public.procurement_receipt_claim_deadline(receipt2)),'unknown receipt claim window has no invented deadline');
    PERFORM set_config('request.jwt.claim.sub',outsider::text,true);
    PERFORM pg_temp.check_repair(NOT EXISTS(SELECT 1 FROM public.procurement_receipt_claim_deadline(receipt2)),'receipt claim deadline denies foreign studio');
  END IF;
END;
$repairs$;
DO $$ BEGIN
  IF EXISTS(SELECT 1 FROM repair_results WHERE NOT passed) THEN
    RAISE EXCEPTION 'assertion failed: % receiving review regressions', (SELECT count(*) FROM repair_results WHERE NOT passed);
  END IF;
  RAISE NOTICE 'PASS 00862: % assertions', (SELECT count(*) FROM repair_results);
END $$;
ROLLBACK;
