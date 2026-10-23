-- 00861 / SQ-1781 — receipt linkage and standing contract. All fixtures roll back.
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
  SELECT id, id || '@sq1781.test.invalid','',now(),now(),now(),'00000000-0000-0000-0000-000000000000','authenticated','authenticated'
  FROM unnest(ARRAY[actor, outsider, member]) id;
  INSERT INTO public.profiles(id,email,full_name,is_designer)
  SELECT id, id || '@sq1781.test.invalid','Receipt test designer',true FROM unnest(ARRAY[actor, outsider, member]) id
  ON CONFLICT(id) DO UPDATE SET is_designer=true;
  org := public._primary_studio_for(actor);
  INSERT INTO public.organization_members(user_id, organization_id, role, status) VALUES (member, org, 'member', 'active')
  ON CONFLICT DO NOTHING;
  INSERT INTO public.projects(id,name,designer_id,created_by,studio_id,status)
  VALUES (project,'SQ1781 receiving',actor,actor,org,'active');
  INSERT INTO public.vendors(id,name) VALUES (vendor,'SQ1781 maker');
  INSERT INTO public.studio_locations(id,organization_id,kind,label) VALUES (location,org,'receiver','SQ1781 receiver');
  INSERT INTO public.project_ffe_items(id,project_id,name,status,quantity,vendor_id,unit_price_cents,design_disposition)
  VALUES (item,project,'Main line','specified',6,vendor,100,'selected'), (other_item,project,'Other line','specified',2,vendor,100,'selected'),
    (external_item,project,'Antique','specified',1,vendor,100,'selected');
  INSERT INTO public.purchase_orders(id,designer_id,project_id,vendor_id,payment_pattern,total_cents,status,is_patina_catalog)
  VALUES (po,actor,project,vendor,'net_30',600,'confirmed',false),
    (other_po,actor,project,vendor,'net_30',200,'confirmed',false);
  PERFORM set_config('request.jwt.claim.sub',actor::text,true);
  PERFORM set_config('request.jwt.claim.role','authenticated',true);
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated')::text,true);
  UPDATE public.project_ffe_items SET purchase_order_id = po, status='ordered' WHERE id = item;
  UPDATE public.project_ffe_items SET purchase_order_id = other_po, status='ordered' WHERE id = other_item;
  INSERT INTO public.po_shipments(id,purchase_order_id,shipped_on) VALUES (shipment,po,current_date), (other_shipment,other_po,current_date);
  INSERT INTO public.po_shipment_lines(shipment_id,ffe_item_id,qty) VALUES (shipment,item,4), (other_shipment,other_item,2);
  PERFORM set_config('request.jwt.claim.sub',actor::text,true);
  PERFORM set_config('request.jwt.claim.role','authenticated',true);
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated')::text,true);
  SELECT id INTO purchase FROM public.record_studio_purchase(jsonb_build_object('projectId',project,'ffeItemId',external_item,
    'kind','one_off','payeeName','Antiques dealer','amountCents',100,'purchasedOn',current_date));


  -- A full good shipment does not receive the two chairs that have not shipped.
  first_result := public.record_project_ffe_receipt_batch(po,pg_temp.receipt_line(item,4),'clean',
    p_po_shipment_id=>shipment,p_receipt_key=>gen_random_uuid());
  PERFORM pg_temp.receipt_assert(first_result->>'outcome'='clean','shipment four of six accepted clean');
  PERFORM pg_temp.receipt_assert((SELECT received_quantity=4 FROM public.project_ffe_items WHERE id=item),
    'clean shipment preserves two unshipped chairs');
  PERFORM pg_temp.receipt_assert((SELECT status <> 'delivered' FROM public.purchase_orders WHERE id=po),
    'partial order is not delivered by one clean shipment');

  shipment := gen_random_uuid();
  INSERT INTO public.po_shipments(id,purchase_order_id,shipped_on) VALUES (shipment,po,current_date);
  INSERT INTO public.po_shipment_lines(shipment_id,ffe_item_id,qty) VALUES (shipment,item,2);
  replay := public.record_project_ffe_receipt_batch(po,pg_temp.receipt_line(item,6),'clean',
    p_po_shipment_id=>shipment,p_receipt_key=>gen_random_uuid());
  PERFORM pg_temp.receipt_assert((SELECT received_quantity=6 FROM public.project_ffe_items WHERE id=item)
    AND (SELECT status='delivered' FROM public.purchase_orders WHERE id=po),'second shipment closes physically complete PO');

  -- A separate PO supplies a pending short shipment and unchanged-quantity completion.
  UPDATE public.po_shipment_lines SET qty=2 WHERE shipment_id=other_shipment;
  PERFORM pg_temp.receipt_rejected(format('SELECT public.record_project_ffe_receipt_batch(%L,%L,''clean'',p_po_shipment_id=>%L)',
    other_po,pg_temp.receipt_line(other_item,1),other_shipment),'short shipment cannot be clean');
  pending_result := public.record_project_ffe_receipt_batch(other_po,pg_temp.receipt_line(other_item,1),'partial',
    p_po_shipment_id=>other_shipment,p_receipt_key=>gen_random_uuid());
  PERFORM pg_temp.receipt_assert(pending_result->>'outcome'='partial','short shipment accepted partial');
  PERFORM pg_temp.receipt_rejected(format('SELECT public.record_project_ffe_receipt_batch(%L,%L,''clean'')',
    other_po,pg_temp.receipt_line(other_item,1)),'unlinked receipt still requires whole PO for clean');

  pending_result := public.record_project_ffe_receipt_batch(other_po,pg_temp.receipt_line(other_item,2),NULL,
    p_inspection_pending=>true,p_inspection_owner_user_id=>member,p_receipt_key=>gen_random_uuid());
  receipt := (pending_result->>'inspectionId')::uuid;
  PERFORM set_config('request.jwt.claim.sub',outsider::text,true);
  BEGIN
    PERFORM public.complete_receiving_inspection(receipt,'damaged',
      jsonb_build_array(jsonb_build_object('selectionId',other_item,'condition','damaged')));
    RAISE EXCEPTION 'assertion failed: outsider completed inspection';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  PERFORM set_config('request.jwt.claim.sub',actor::text,true);
  PERFORM pg_temp.receipt_rejected(format('SELECT public.complete_receiving_inspection(%L,''clean'',%L)', receipt,
    jsonb_build_array(jsonb_build_object('selectionId',other_item,'condition','damaged'))),'clean rejects damaged line');
  PERFORM pg_temp.receipt_rejected(format('SELECT public.complete_receiving_inspection(%L,''damaged'',%L)', receipt,
    jsonb_build_array(jsonb_build_object('selectionId',other_item,'receivedQuantity',1,'condition','damaged'))),
    'completion cannot revise physical counts');
  EXECUTE 'SET LOCAL ROLE authenticated';
  replay := public.complete_receiving_inspection(receipt,'damaged',
    jsonb_build_array(jsonb_build_object('selectionId',other_item,'receivedQuantity',2,'condition','damaged','notedOnBol',true)),
    'Damage found after unpacking');
  EXECUTE 'RESET ROLE';
  PERFORM pg_temp.receipt_assert(replay->>'outcome'='damaged' AND NOT (replay->>'inspection_pending')::boolean,
    'pending PO inspection completed damaged');
  PERFORM pg_temp.receipt_assert((SELECT received_quantity=2 FROM public.project_ffe_items WHERE id=other_item),
    'completion does not change quantities');
  PERFORM pg_temp.receipt_assert((SELECT condition='damaged' AND noted_on_bol FROM public.receiving_inspection_lines WHERE inspection_id=receipt),
    'completion writes line conditions');
  PERFORM pg_temp.receipt_rejected(format('SELECT public.complete_receiving_inspection(%L,''damaged'',%L)',receipt,
    jsonb_build_array(jsonb_build_object('selectionId',other_item,'condition','damaged'))),'completed inspection cannot repeat');

  pending_result := public.record_project_ffe_receipt_batch(NULL,pg_temp.receipt_line(external_item,1),NULL,
    p_studio_purchase_id=>purchase,p_arrival_method=>'picked_up',p_inspection_pending=>true,
    p_inspection_owner_user_id=>member,p_receipt_key=>gen_random_uuid());
  purchase_receipt := (pending_result->>'inspectionId')::uuid;
  replay := public.complete_receiving_inspection(purchase_receipt,'damaged',
    jsonb_build_array(jsonb_build_object('selectionId',external_item,'receivedQuantity',1,'condition','damaged')));
  PERFORM pg_temp.receipt_assert(replay->>'outcome'='damaged' AND replay->>'studio_purchase_id'=purchase::text,
    'pending purchase inspection completes damaged');
  PERFORM pg_temp.receipt_assert((SELECT received_quantity=1 FROM public.project_ffe_items WHERE id=external_item)
    AND NOT EXISTS (SELECT 1 FROM public.damage_claims WHERE receiving_inspection_id=purchase_receipt),
    'purchase completion preserves quantities and does not introduce SQL claims');
  RAISE NOTICE 'PASS 00861: shipment four of six; short vs clean; legacy whole PO; pending PO/purchase completion; no re-receipt; repeat refused; access';
END;
$receipt_linkage_and_standing_contract$;
ROLLBACK;
