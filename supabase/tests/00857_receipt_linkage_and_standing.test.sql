-- 00857 / SQ-1770 — receipt linkage and standing contract. All fixtures roll back.
BEGIN;
SET LOCAL statement_timeout = '60s';
SET LOCAL lock_timeout = '5s';
CREATE FUNCTION pg_temp.receipt_assert(ok boolean, label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'assertion failed: %', label; END IF; END;
$$;
CREATE FUNCTION pg_temp.receipt_rejected(command text, label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  BEGIN EXECUTE command;
  EXCEPTION WHEN check_violation THEN RETURN; END;
  RAISE EXCEPTION 'assertion failed: % was accepted', label;
END;
$$;
CREATE FUNCTION pg_temp.receipt_line(item uuid, quantity integer) RETURNS jsonb LANGUAGE sql AS $$
  SELECT jsonb_build_array(jsonb_build_object('selectionId', item, 'receivedQuantity', quantity));
$$;
GRANT EXECUTE ON FUNCTION pg_temp.receipt_assert(boolean, text) TO authenticated;
DO $receipt_linkage_and_standing_contract$
DECLARE
  actor uuid := gen_random_uuid(); outsider uuid := gen_random_uuid(); member uuid := gen_random_uuid();
  org uuid; project uuid := gen_random_uuid(); vendor uuid := gen_random_uuid();
  po uuid := gen_random_uuid(); other_po uuid := gen_random_uuid();
  item uuid := gen_random_uuid(); other_item uuid := gen_random_uuid(); external_item uuid := gen_random_uuid();
  shipment uuid := gen_random_uuid(); other_shipment uuid := gen_random_uuid();
  purchase uuid; location uuid := gen_random_uuid(); receipt uuid; purchase_receipt uuid; key uuid := gen_random_uuid();
  first_result jsonb; replay jsonb; pending_result jsonb; legacy_result jsonb;
  inspection_count integer; line_count integer;
BEGIN
  INSERT INTO auth.users(id,email,encrypted_password,email_confirmed_at,created_at,updated_at,instance_id,aud,role)
  SELECT id, id || '@sq1770.test.invalid','',now(),now(),now(),'00000000-0000-0000-0000-000000000000','authenticated','authenticated'
  FROM unnest(ARRAY[actor, outsider, member]) id;
  INSERT INTO public.profiles(id,email,full_name,is_designer)
  SELECT id, id || '@sq1770.test.invalid','Receipt test designer',true FROM unnest(ARRAY[actor, outsider, member]) id
  ON CONFLICT(id) DO UPDATE SET is_designer=true;
  org := public._primary_studio_for(actor);
  INSERT INTO public.organization_members(user_id, organization_id, role, status) VALUES (member, org, 'member', 'active')
  ON CONFLICT DO NOTHING;
  INSERT INTO public.projects(id,name,designer_id,created_by,studio_id,status)
  VALUES (project,'SQ1770 receiving',actor,actor,org,'active');
  INSERT INTO public.vendors(id,name) VALUES (vendor,'SQ1770 maker');
  INSERT INTO public.studio_locations(id,organization_id,kind,label) VALUES (location,org,'receiver','SQ1770 receiver');
  INSERT INTO public.project_ffe_items(id,project_id,name,status,quantity,vendor_id,unit_price_cents,design_disposition)
  VALUES (item,project,'Main line','specified',5,vendor,100,'selected'), (other_item,project,'Other line','specified',2,vendor,100,'selected'),
    (external_item,project,'Antique','specified',1,vendor,100,'selected');
  INSERT INTO public.purchase_orders(id,designer_id,project_id,vendor_id,payment_pattern,total_cents,status,is_patina_catalog)
  VALUES (po,actor,project,vendor,'net_30',500,'confirmed',false),
    (other_po,actor,project,vendor,'net_30',200,'confirmed',false);
  PERFORM set_config('request.jwt.claim.sub',actor::text,true);
  PERFORM set_config('request.jwt.claim.role','authenticated',true);
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated')::text,true);
  UPDATE public.project_ffe_items SET purchase_order_id = po, status='ordered' WHERE id = item;
  UPDATE public.project_ffe_items SET purchase_order_id = other_po, status='ordered' WHERE id = other_item;
  INSERT INTO public.po_shipments(id,purchase_order_id,shipped_on) VALUES (shipment,po,current_date), (other_shipment,other_po,current_date);
  INSERT INTO public.po_shipment_lines(shipment_id,ffe_item_id,qty) VALUES (shipment,item,3), (other_shipment,other_item,2);
  PERFORM set_config('request.jwt.claim.sub',actor::text,true);
  PERFORM set_config('request.jwt.claim.role','authenticated',true);
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated')::text,true);
  SELECT id INTO purchase FROM public.record_studio_purchase(jsonb_build_object('projectId',project,'ffeItemId',external_item,
    'kind','one_off','payeeName','Antiques dealer','amountCents',100,'purchasedOn',current_date));

  PERFORM pg_temp.receipt_rejected(format('SELECT public.record_project_ffe_receipt_batch(%L,%L,NULL,p_inspection_pending=>true,p_po_shipment_id=>%L)',
    po,pg_temp.receipt_line(item,1),other_shipment),'another PO shipment');
  PERFORM pg_temp.receipt_rejected(format('SELECT public.record_project_ffe_receipt_batch(%L,%L,NULL,p_inspection_pending=>true,p_po_shipment_id=>%L)',
    po,pg_temp.receipt_line(item,4),shipment),'shipment quantity ceiling');
  PERFORM pg_temp.receipt_rejected(format('SELECT public.record_project_ffe_receipt_batch(%L,%L,NULL,p_inspection_pending=>true,p_inspection_owner_user_id=>%L)',
    po,pg_temp.receipt_line(item,1),outsider),'foreign inspection owner');
  PERFORM pg_temp.receipt_rejected(format('SELECT public.record_project_ffe_receipt_batch(%L,%L,''clean'',p_inspection_pending=>true)',
    po,pg_temp.receipt_line(item,5)),'pending is not clean');

  first_result := public.record_project_ffe_receipt_batch(po,pg_temp.receipt_line(item,2),NULL,
    p_po_shipment_id=>shipment,p_inspection_pending=>true,p_inspection_owner_user_id=>member,
    p_receipt_key=>key,p_received_on=>current_date-4,p_location_id=>location,
    p_reported_by=>'receiver_report',p_report_source=>'Warehouse receiving report',p_arrival_method=>'delivered');
  receipt := (first_result->>'inspectionId')::uuid;
  PERFORM pg_temp.receipt_assert(EXISTS(SELECT 1 FROM public.receiving_inspections ri WHERE ri.id=receipt
    AND ri.inspection_pending AND ri.outcome IS NULL AND ri.inspection_owner_user_id=member
    AND ri.po_shipment_id=shipment AND ri.location_id=location AND ri.received_on=current_date-4
    AND ri.reported_by='receiver_report' AND ri.report_source='Warehouse receiving report'),'pending + owner and source facts round-trip');
  PERFORM pg_temp.receipt_assert((SELECT status <> 'delivered' AND delivered_date=current_date-4 FROM public.purchase_orders WHERE id=po),
    'pending stamps actual arrival but does not mark PO delivered');
  PERFORM pg_temp.receipt_assert((SELECT received_quantity=2 FROM public.project_ffe_items WHERE id=item),'pending records physical quantity');
  replay := public.record_project_ffe_receipt_batch(po,pg_temp.receipt_line(item,2),NULL,
    p_po_shipment_id=>shipment,p_inspection_pending=>true,p_receipt_key=>key,p_notes=>'follow-up photo retry');
  PERFORM pg_temp.receipt_assert(replay->>'inspectionId'=receipt::text AND (replay->>'reused')::boolean
    AND (SELECT count(*)=1 FROM public.receiving_inspection_lines WHERE ffe_item_id=item AND receipt_key=key), 'receipt key replay has no duplicate');
  PERFORM pg_temp.receipt_rejected(format('SELECT public.record_project_ffe_receipt_batch(%L,%L,NULL,p_inspection_pending=>true,p_po_shipment_id=>%L)',
    po,pg_temp.receipt_line(item,4),shipment),'aggregate shipment quantity ceiling');
  pending_result := public.record_project_ffe_receipt_batch(po,pg_temp.receipt_line(item,3),NULL,
    p_po_shipment_id=>shipment,p_inspection_pending=>true,p_receipt_key=>gen_random_uuid());
  PERFORM pg_temp.receipt_assert((SELECT sum(line.quantity_received)=3 FROM public.receiving_inspection_lines line
    JOIN public.receiving_inspections ri ON ri.id=line.inspection_id WHERE ri.po_shipment_id=shipment),'shipment uses incremental rather than cumulative quantities');
  replay := public.record_project_ffe_receipt_batch(po,pg_temp.receipt_line(item,2),NULL,p_inspection_pending=>true,p_receipt_key=>key);
  PERFORM pg_temp.receipt_assert(replay->>'inspectionId'=receipt::text,'old key replay after a later arrival');
  legacy_result := public.record_project_ffe_receipt_batch(other_po,pg_temp.receipt_line(other_item,2),'clean');
  PERFORM pg_temp.receipt_assert(legacy_result->>'outcome'='clean' AND (SELECT status='delivered' FROM public.purchase_orders WHERE id=other_po),
    'legacy three-argument calls retain clean side effects');
  replay := public.record_project_ffe_inspection(other_po,
    jsonb_build_array(jsonb_build_object('selectionId',other_item,'receivedQuantity',2,'condition','good')),'clean',p_notes=>'per-line legacy call');
  PERFORM pg_temp.receipt_assert((SELECT condition='good' FROM public.receiving_inspection_lines WHERE inspection_id=(replay->>'inspectionId')::uuid),
    'legacy per-line wrapper still records conditions');

  first_result := public.record_project_ffe_receipt_batch(NULL,pg_temp.receipt_line(external_item,1),'damaged',
    p_studio_purchase_id=>purchase,p_arrival_method=>'picked_up',p_received_on=>current_date,p_receipt_key=>gen_random_uuid());
  purchase_receipt := (first_result->>'inspectionId')::uuid;
  PERFORM pg_temp.receipt_assert(first_result->>'claim_draft_skipped'='no_purchase_order'
    AND EXISTS(SELECT 1 FROM public.receiving_inspections ri WHERE ri.id=purchase_receipt
      AND ri.studio_purchase_id=purchase AND ri.purchase_order_id IS NULL AND ri.outcome='damaged' AND ri.arrival_method='picked_up')
    AND NOT EXISTS(SELECT 1 FROM public.damage_claims WHERE receiving_inspection_id=purchase_receipt),'purchase damage records fact and skips PO-only claim draft');
  PERFORM pg_temp.receipt_rejected(format('SELECT public.record_project_ffe_receipt_batch(NULL,%L,''clean'',p_studio_purchase_id=>%L)',
    pg_temp.receipt_line(other_item,2),purchase),'purchase item consistency');
  PERFORM pg_temp.receipt_rejected(format('INSERT INTO public.receiving_inspections(purchase_order_id,studio_purchase_id,inspected_by,outcome) VALUES (%L,%L,%L,''damaged'')',
    po,purchase,actor),'exactly one receipt subject CHECK');
  PERFORM pg_temp.receipt_rejected(format('INSERT INTO public.receiving_inspections(inspected_by,outcome) VALUES (%L,''damaged'')',actor),
    'missing receipt subject CHECK');

  -- Exercise real RLS, not the postgres fixture owner's bypass.
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM pg_temp.receipt_assert((SELECT count(*)=2 FROM public.receiving_inspections WHERE id IN (receipt,purchase_receipt)),
    'owner reads both receipt subjects');
  PERFORM set_config('request.jwt.claim.sub',member::text,true);
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',member,'role','authenticated')::text,true);
  PERFORM pg_temp.receipt_assert((SELECT count(*)=2 FROM public.receiving_inspections WHERE id IN (receipt,purchase_receipt)),
    'project studio member reads both receipt subjects');
  PERFORM set_config('request.jwt.claim.sub',outsider::text,true);
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',outsider,'role','authenticated')::text,true);
  PERFORM pg_temp.receipt_assert((SELECT count(*)=0 FROM public.receiving_inspections WHERE id IN (receipt,purchase_receipt)),
    'outsider reads neither receipt subject');
  PERFORM pg_temp.receipt_assert((SELECT count(*)=0 FROM public.receiving_inspection_lines WHERE inspection_id IN (receipt,purchase_receipt)),
    'outsider reads neither receipt line');
  EXECUTE 'RESET ROLE';
  RAISE NOTICE 'PASS receipt linkage and standing contract: shipment ceiling, replay, pending, purchase, legacy, CHECK and RLS assertions';
END;
$receipt_linkage_and_standing_contract$;
ROLLBACK;
