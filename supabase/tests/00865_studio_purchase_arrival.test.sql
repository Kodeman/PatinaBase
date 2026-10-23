-- 00865 / SQ-1797 — dealer arrivals follow the PO clean-inspection movement rule.
-- All fixtures and receipts roll back; no shared database reset is needed.
BEGIN;
SET LOCAL statement_timeout = '60s';
SET LOCAL lock_timeout = '5s';
CREATE TEMP TABLE purchase_arrival_results(label text, passed boolean);
CREATE FUNCTION pg_temp.check_arrival(ok boolean, label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO purchase_arrival_results VALUES(label, ok IS TRUE);
  RAISE NOTICE '%: %', CASE WHEN ok IS TRUE THEN 'PASS' ELSE 'FAIL' END, label;
END;
$$;
DO $purchase_arrivals$
DECLARE
  actor uuid := gen_random_uuid(); outsider uuid := gen_random_uuid(); org uuid;
  project uuid := gen_random_uuid(); vendor uuid := gen_random_uuid();
  item uuid; po_item uuid; po uuid; purchase uuid; receipt uuid; key uuid;
  response jsonb; replay jsonb; lines jsonb;
  purchase_state text; method text; outcome text; condition text; mode text;
  expected_status text; received integer;
BEGIN
  INSERT INTO auth.users(id,email,encrypted_password,email_confirmed_at,created_at,updated_at,instance_id,aud,role)
  SELECT id,id||'@sq1797.test.invalid','',now(),now(),now(),'00000000-0000-0000-0000-000000000000','authenticated','authenticated'
  FROM unnest(ARRAY[actor,outsider]) id;
  INSERT INTO public.profiles(id,email,full_name,is_designer)
  SELECT id,id||'@sq1797.test.invalid','Purchase arrival designer',true FROM unnest(ARRAY[actor,outsider]) id
  ON CONFLICT(id) DO UPDATE SET is_designer=true;
  org := public._primary_studio_for(actor);
  INSERT INTO public.projects(id,name,designer_id,created_by,studio_id,status)
  VALUES(project,'SQ1797 dealer arrivals',actor,actor,org,'active');
  INSERT INTO public.vendors(id,name) VALUES(vendor,'SQ1797 dealer');
  PERFORM set_config('request.jwt.claim.sub',actor::text,true);
  PERFORM set_config('request.jwt.claim.role','authenticated',true);
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated')::text,true);

  -- Native PO receipts are the baseline: pending/damaged/partial do NOT move
  -- the item, even at full count. Only a clean receipt moves it to delivered.
  FOREACH mode IN ARRAY ARRAY['insert','complete'] LOOP
    FOREACH outcome IN ARRAY ARRAY['clean','damaged','partial'] LOOP
      po_item := gen_random_uuid(); po := gen_random_uuid();
      item := gen_random_uuid();
      received := CASE WHEN outcome='partial' THEN 1 ELSE 2 END;
      condition := CASE outcome WHEN 'clean' THEN 'good' WHEN 'partial' THEN 'short' ELSE 'damaged' END;
      expected_status := CASE WHEN outcome='clean' THEN 'delivered' ELSE 'ordered' END;
      INSERT INTO public.project_ffe_items(id,project_id,name,status,quantity,vendor_id,unit_price_cents,design_disposition)
      VALUES(po_item,project,'PO baseline','approved',2,vendor,100,'selected'),
        (item,project,'Dealer mirror','approved',2,vendor,100,'selected');
      INSERT INTO public.purchase_orders(id,designer_id,project_id,vendor_id,payment_pattern,total_cents,status,is_patina_catalog)
      VALUES(po,actor,project,vendor,'net_30',200,'confirmed',false);
      UPDATE public.project_ffe_items SET purchase_order_id=po WHERE id=po_item;
      SELECT id INTO purchase FROM public.record_studio_purchase(jsonb_build_object(
        'projectId',project,'ffeItemId',item,'kind','antique_auction','payeeName','Dealer','amountCents',200,'purchasedOn',current_date));
      lines := jsonb_build_array(jsonb_build_object('selectionId',item,'receivedQuantity',received,'condition',condition));
      response := public.record_project_ffe_inspection(po,
        jsonb_build_array(jsonb_build_object('selectionId',po_item,'receivedQuantity',received,'condition',condition)),
        CASE WHEN mode='insert' THEN outcome::public.receiving_inspection_outcome ELSE NULL END,
        p_inspection_pending=>(mode='complete'),p_received_on=>current_date-2,p_receipt_key=>gen_random_uuid());
      IF mode='complete' THEN
        PERFORM pg_temp.check_arrival((SELECT status='ordered' FROM public.project_ffe_items WHERE id=po_item),
          'PO pending '||outcome||' stays ordered');
        PERFORM public.complete_receiving_inspection((response->>'inspectionId')::uuid,outcome,
          jsonb_build_array(jsonb_build_object('selectionId',po_item,'receivedQuantity',received,'condition',condition)));
      END IF;
      SET LOCAL ROLE authenticated;
      response := public.record_project_ffe_inspection(NULL,lines,
        CASE WHEN mode='insert' THEN outcome::public.receiving_inspection_outcome ELSE NULL END,
        p_studio_purchase_id=>purchase,p_arrival_method=>'picked_up',p_inspection_pending=>(mode='complete'),p_receipt_key=>gen_random_uuid());
      RESET ROLE;
      receipt := (response->>'inspectionId')::uuid;
      IF mode='complete' THEN
        PERFORM pg_temp.check_arrival((SELECT status='ordered' FROM public.project_ffe_items WHERE id=item),
          'purchase pending '||outcome||' stays ordered like PO');
        SET LOCAL ROLE authenticated;
        PERFORM public.complete_receiving_inspection(receipt,outcome,lines);
        RESET ROLE;
      END IF;
      PERFORM pg_temp.check_arrival((SELECT status=expected_status FROM public.project_ffe_items WHERE id=po_item),
        'PO '||mode||' '||outcome||' baseline movement');
      PERFORM pg_temp.check_arrival((SELECT status=expected_status FROM public.project_ffe_items WHERE id=item),
        'purchase '||mode||' '||outcome||' mirrors PO movement');
      PERFORM pg_temp.check_arrival((SELECT received_quantity=received FROM public.project_ffe_items WHERE id=item)
        AND (SELECT received_quantity=received AND quantity_received=received FROM public.receiving_inspection_lines WHERE inspection_id=receipt),
        'purchase '||mode||' '||outcome||' preserves receipt counts');
      PERFORM pg_temp.check_arrival((SELECT purchase_order_id IS NULL AND studio_purchase_id=purchase
        AND arrival_method='picked_up'
        AND ri.outcome::text=CASE condition WHEN 'good' THEN 'clean' WHEN 'short' THEN 'partial' ELSE 'damaged' END
        AND NOT inspection_pending FROM public.receiving_inspections ri WHERE id=receipt), 'purchase '||mode||' '||outcome||' retains receipt facts');
      PERFORM pg_temp.check_arrival((SELECT delivered_date=current_date-2 FROM public.purchase_orders WHERE id=po),
        'PO '||mode||' '||outcome||' keeps first-arrival date');
      PERFORM pg_temp.check_arrival(NOT EXISTS(SELECT 1 FROM public.damage_claims WHERE receiving_inspection_id=receipt),
        'purchase '||mode||' '||outcome||' does not create SQL claims');
    END LOOP;
  END LOOP;

  -- Both arrival methods and both receivable purchase states use the same
  -- authority; a replay never re-receives or creates another inspection.
  FOREACH purchase_state IN ARRAY ARRAY['recorded','billed'] LOOP
    FOREACH method IN ARRAY ARRAY['picked_up','delivered'] LOOP
      item := gen_random_uuid(); key := gen_random_uuid();
      INSERT INTO public.project_ffe_items(id,project_id,name,status,quantity,vendor_id,unit_price_cents,design_disposition)
      VALUES(item,project,'Clean antique','approved',2,vendor,100,'selected');
      SELECT id INTO purchase FROM public.record_studio_purchase(jsonb_build_object(
        'projectId',project,'ffeItemId',item,'kind','one_off','payeeName','Dealer','amountCents',200,'purchasedOn',current_date));
      UPDATE public.studio_purchases SET status=purchase_state WHERE id=purchase;
      lines := jsonb_build_array(jsonb_build_object('selectionId',item,'receivedQuantity',2,'condition','good'));
      response := public.record_project_ffe_inspection(NULL,lines,'clean',
        p_studio_purchase_id=>purchase,p_arrival_method=>method,p_receipt_key=>key);
      receipt := (response->>'inspectionId')::uuid;
      replay := public.record_project_ffe_inspection(NULL,lines,'clean',
        p_studio_purchase_id=>purchase,p_arrival_method=>method,p_receipt_key=>key);
      PERFORM pg_temp.check_arrival((SELECT status='delivered' AND received_quantity=2 FROM public.project_ffe_items WHERE id=item),
        purchase_state||' '||method||' clean arrival advances to delivered');
      PERFORM pg_temp.check_arrival(replay->>'inspectionId'=receipt::text
        AND (SELECT count(*)=1 FROM public.receiving_inspections WHERE studio_purchase_id=purchase),
        purchase_state||' '||method||' replay preserves one receipt');
      PERFORM pg_temp.check_arrival((SELECT status=purchase_state AND amount_cents=200 FROM public.studio_purchases WHERE id=purchase),
        purchase_state||' '||method||' keeps purchase and money facts');
    END LOOP;
  END LOOP;

  -- A manual installation is beyond delivered and must never ratchet back,
  -- whether the clean inspection is immediate or completed later.
  FOREACH mode IN ARRAY ARRAY['insert','complete'] LOOP
    item := gen_random_uuid();
    INSERT INTO public.project_ffe_items(id,project_id,name,status,quantity,vendor_id,unit_price_cents,design_disposition)
    VALUES(item,project,'Already installed','approved',1,vendor,100,'selected');
    SELECT id INTO purchase FROM public.record_studio_purchase(jsonb_build_object(
      'projectId',project,'ffeItemId',item,'kind','one_off','payeeName','Dealer','amountCents',100,'purchasedOn',current_date));
    UPDATE public.project_ffe_items SET status='installed' WHERE id=item;
    response := public.record_project_ffe_inspection(NULL,
      jsonb_build_array(jsonb_build_object('selectionId',item,'receivedQuantity',1,'condition','good')),
      CASE WHEN mode='insert' THEN 'clean'::public.receiving_inspection_outcome ELSE NULL END,
      p_studio_purchase_id=>purchase,p_inspection_pending=>(mode='complete'),p_receipt_key=>gen_random_uuid());
    IF mode='complete' THEN
      PERFORM public.complete_receiving_inspection((response->>'inspectionId')::uuid,'clean',
        jsonb_build_array(jsonb_build_object('selectionId',item,'condition','good')));
    END IF;
    PERFORM pg_temp.check_arrival((SELECT status='installed' AND received_quantity=1 FROM public.project_ffe_items WHERE id=item),
      'purchase '||mode||' clean preserves installed ratchet');
  END LOOP;

  -- L2 remains authoritative: neither a returned/void purchase nor another
  -- studio's actor may complete a pending receipt and advance the line.
  item := gen_random_uuid();
  INSERT INTO public.project_ffe_items(id,project_id,name,status,quantity,vendor_id,unit_price_cents,design_disposition)
  VALUES(item,project,'Pending restrictions','approved',1,vendor,100,'selected');
  SELECT id INTO purchase FROM public.record_studio_purchase(jsonb_build_object(
    'projectId',project,'ffeItemId',item,'kind','one_off','payeeName','Dealer','amountCents',100,'purchasedOn',current_date));
  lines := jsonb_build_array(jsonb_build_object('selectionId',item,'receivedQuantity',1,'condition','good'));
  response := public.record_project_ffe_inspection(NULL,lines,NULL,
    p_studio_purchase_id=>purchase,p_inspection_pending=>true,p_receipt_key=>gen_random_uuid());
  receipt := (response->>'inspectionId')::uuid;
  PERFORM set_config('request.jwt.claim.sub',outsider::text,true);
  BEGIN
    PERFORM public.complete_receiving_inspection(receipt,'clean',lines);
    PERFORM pg_temp.check_arrival(false,'outsider completion refused');
  EXCEPTION WHEN insufficient_privilege THEN PERFORM pg_temp.check_arrival(true,'outsider completion refused'); END;
  PERFORM set_config('request.jwt.claim.sub',actor::text,true);
  FOREACH purchase_state IN ARRAY ARRAY['returned','void'] LOOP
    UPDATE public.studio_purchases SET status=purchase_state,returnable=true,returned_on=current_date,
      voided_at=CASE WHEN purchase_state='void' THEN now() END,
      void_reason=CASE WHEN purchase_state='void' THEN 'Arrival regression' END WHERE id=purchase;
    BEGIN
      PERFORM public.complete_receiving_inspection(receipt,'clean',lines);
      PERFORM pg_temp.check_arrival(false,purchase_state||' completion refused');
    EXCEPTION WHEN check_violation THEN
      PERFORM pg_temp.check_arrival(SQLERRM='studio purchase is not receivable',purchase_state||' completion refused');
    END;
    BEGIN
      PERFORM public.record_project_ffe_inspection(NULL,lines,'clean',p_studio_purchase_id=>purchase,p_receipt_key=>gen_random_uuid());
      PERFORM pg_temp.check_arrival(false,purchase_state||' arrival refused');
    EXCEPTION WHEN check_violation THEN
      PERFORM pg_temp.check_arrival(SQLERRM='studio purchase is not receivable',purchase_state||' arrival refused');
    END;
  END LOOP;
  PERFORM pg_temp.check_arrival((SELECT status='ordered' FROM public.project_ffe_items WHERE id=item)
    AND (SELECT inspection_pending FROM public.receiving_inspections WHERE id=receipt),'refused completion does not move line');
END;
$purchase_arrivals$;
DO $$ BEGIN
  IF EXISTS(SELECT 1 FROM purchase_arrival_results WHERE NOT passed) THEN
    RAISE EXCEPTION 'assertion failed: % purchase arrival regressions',(SELECT count(*) FROM purchase_arrival_results WHERE NOT passed);
  END IF;
  RAISE NOTICE 'PASS 00865: % assertions',(SELECT count(*) FROM purchase_arrival_results);
END $$;
ROLLBACK;
