-- Release lineage, duplicate identity, N-1, continuation, and import retry contracts.
BEGIN;
SET LOCAL statement_timeout='30s';
CREATE OR REPLACE FUNCTION pg_temp.assume_lineage_actor(p_actor uuid) RETURNS void LANGUAGE plpgsql AS $$ BEGIN
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',p_actor,'role','authenticated')::text,true);
  PERFORM set_config('request.jwt.claim.sub',p_actor::text,true);
END; $$;
INSERT INTO auth.users(id,email,encrypted_password,email_confirmed_at,created_at,updated_at,instance_id,aud,role) VALUES
('fb000000-0000-4000-8000-000000000001','lineage-owner@test.invalid','',now(),now(),now(),'00000000-0000-0000-0000-000000000000','authenticated','authenticated'),
('fb000000-0000-4000-8000-000000000002','lineage-peer@test.invalid','',now(),now(),now(),'00000000-0000-0000-0000-000000000000','authenticated','authenticated');
INSERT INTO public.profiles(id,email,full_name,is_designer) VALUES
('fb000000-0000-4000-8000-000000000001','lineage-owner@test.invalid','Lineage Owner',true),
('fb000000-0000-4000-8000-000000000002','lineage-peer@test.invalid','Lineage Peer',true) ON CONFLICT DO NOTHING;
INSERT INTO public.organizations(id,type,name,slug) VALUES
('fb010000-0000-4000-8000-000000000001','design_studio','Lineage Studio','lineage-studio');
INSERT INTO public.organization_members(id,user_id,organization_id,role,status,joined_at) VALUES
('fb020000-0000-4000-8000-000000000001','fb000000-0000-4000-8000-000000000001','fb010000-0000-4000-8000-000000000001','owner','active',now()),
('fb020000-0000-4000-8000-000000000002','fb000000-0000-4000-8000-000000000002','fb010000-0000-4000-8000-000000000001','member','active',now());
INSERT INTO public.projects(id,name,designer_id,created_by) VALUES
('fb100000-0000-4000-8000-000000000001','Lineage Project','fb000000-0000-4000-8000-000000000001','fb000000-0000-4000-8000-000000000001');
INSERT INTO public.vendors(id,name) VALUES
('fb200000-0000-4000-8000-000000000001','Lineage Vendor'),
('fb200000-0000-4000-8000-000000000002','Replacement Vendor');
INSERT INTO public.products(id,name,price_retail,price_trade,images,vendor_id,captured_by,captured_at,layer,status) VALUES
('fb300000-0000-4000-8000-000000000001','Lineage Chair',100000,60000,ARRAY[]::text[],'fb200000-0000-4000-8000-000000000001','fb000000-0000-4000-8000-000000000001',now(),'catalog','published');
INSERT INTO public.product_configurations(id,product_id,project_id,owner_user_id,version,schema_revision,evaluation,snapshot,snapshot_hash,is_valid,is_complete) VALUES
('fb400000-0000-4000-8000-000000000001','fb300000-0000-4000-8000-000000000001','fb100000-0000-4000-8000-000000000001','fb000000-0000-4000-8000-000000000001',1,1,'{}','{}',repeat('a',64),true,true),
('fb400000-0000-4000-8000-000000000002','fb300000-0000-4000-8000-000000000001','fb100000-0000-4000-8000-000000000001','fb000000-0000-4000-8000-000000000001',1,1,'{}','{}',repeat('b',64),true,true);

DO $$
DECLARE v_a jsonb; v_a_retry jsonb; v_b jsonb; v_role jsonb; v_config jsonb; v_selected jsonb; v_replacement jsonb;
  v_second_selected jsonb; v_change jsonb; v_po public.purchase_orders; v_second_po public.purchase_orders;
  v_snapshot uuid; v_continued uuid; v_import jsonb; v_batch uuid; v_first_commit jsonb; v_retry_commit jsonb; v_rows jsonb;
  v_need jsonb; v_allowance jsonb; v_receipt jsonb; v_live_board jsonb; v_readiness jsonb;
  v_batch_line_a jsonb; v_batch_line_b jsonb; v_batch_po public.purchase_orders;
  v_partial jsonb; v_retry jsonb; v_damaged jsonb; v_clean jsonb; v_inspection_count integer;
  v_rebuild_line jsonb; v_rebuild_po public.purchase_orders; v_rebuild jsonb; v_twenty_board uuid;
  v_peer_line jsonb; v_peer_po public.purchase_orders; v_reprice jsonb;
BEGIN
  PERFORM pg_temp.assume_lineage_actor('fb000000-0000-4000-8000-000000000001');
  v_a:=public.place_product_in_project('fb100000-0000-4000-8000-000000000001','fb300000-0000-4000-8000-000000000001',NULL,NULL,NULL,'{"captureId":"capture-a"}'::jsonb);
  v_a_retry:=public.place_product_in_project('fb100000-0000-4000-8000-000000000001','fb300000-0000-4000-8000-000000000001',NULL,NULL,NULL,'{"captureId":"capture-a"}'::jsonb);
  v_b:=public.place_product_in_project('fb100000-0000-4000-8000-000000000001','fb300000-0000-4000-8000-000000000001',NULL,NULL,NULL,'{"captureId":"capture-b"}'::jsonb);
  ASSERT v_a->>'selectionId'=v_a_retry->>'selectionId' AND v_a->>'selectionId'<>v_b->>'selectionId',
    'N-1 retries must be idempotent while distinct captures create distinct selections';
  v_role:=public.place_product_in_project_v2('{"projectId":"fb100000-0000-4000-8000-000000000001","productId":"fb300000-0000-4000-8000-000000000001","assignmentScope":"throughout","disposition":"candidate","duplicateMode":"reuse","roleConfigurationIdentity":"accent","configurationId":"fb400000-0000-4000-8000-000000000001","idempotencyKey":"identity-one"}'::jsonb);
  v_config:=public.place_product_in_project_v2('{"projectId":"fb100000-0000-4000-8000-000000000001","productId":"fb300000-0000-4000-8000-000000000001","assignmentScope":"throughout","disposition":"candidate","duplicateMode":"reuse","roleConfigurationIdentity":"accent","configurationId":"fb400000-0000-4000-8000-000000000002","idempotencyKey":"identity-two"}'::jsonb);
  ASSERT v_role->>'outcome'='created' AND v_config->>'outcome'='created' AND v_role->>'selectionId'<>v_config->>'selectionId',
    'configuration identity must prevent duplicate reuse';
  ASSERT v_role->>'roleConfigurationIdentity'='accent' AND NOT(v_role?'roleIdentity'),
    'canonical placement response must expose roleConfigurationIdentity only';
  BEGIN
    PERFORM public.place_product_in_project_v2(jsonb_build_object(
      'projectId','fb100000-0000-4000-8000-000000000001','selectionReferenceId',v_role->>'selectionId',
      'productId','fb300000-0000-4000-8000-000000000001','itemType','allowance','budgetMaxCents','90000',
      'assignmentScope','throughout','disposition','candidate','duplicateMode','reuse',
      'roleConfigurationIdentity','accent','configurationId','fb400000-0000-4000-8000-000000000001',
      'idempotencyKey','unsafe-reference-mutation'));
    RAISE EXCEPTION 'explicit reference changed item type';
  EXCEPTION WHEN integrity_constraint_violation THEN NULL; END;
  ASSERT (SELECT item_type='fixed' FROM public.project_ffe_items WHERE id=(v_role->>'selectionId')::uuid),
    'reused explicit references must not mutate commercial identity';
  BEGIN
    PERFORM public.place_product_in_project_v2('{"projectId":"fb100000-0000-4000-8000-000000000001","productId":"fb300000-0000-4000-8000-000000000001","quantity":"999999999999999999999","assignmentScope":"throughout","disposition":"candidate","duplicateMode":"create","idempotencyKey":"huge-quantity"}'::jsonb);
    RAISE EXCEPTION 'overflow quantity reached a cast';
  EXCEPTION WHEN check_violation THEN NULL; END;
  v_need:=public.create_named_project_need('{"projectId":"fb100000-0000-4000-8000-000000000001","name":"Window-seat placeholder","itemType":"tbd","assignmentScope":"unassigned","disposition":"candidate","idempotencyKey":"named-placeholder"}'::jsonb);
  v_allowance:=public.create_named_project_need('{"projectId":"fb100000-0000-4000-8000-000000000001","name":"Art allowance","itemType":"allowance","budgetMaxCents":"500000","assignmentScope":"throughout","disposition":"candidate","idempotencyKey":"named-allowance"}'::jsonb);
  ASSERT (SELECT item_type='tbd' FROM public.project_ffe_items WHERE id=(v_need->>'selectionId')::uuid)
    AND (SELECT item_type='allowance' AND budget_max_cents=500000 FROM public.project_ffe_items WHERE id=(v_allowance->>'selectionId')::uuid),
    'named needs must persist explicit placeholder and allowance semantics';
  v_selected:=public.place_product_in_project_v2('{"projectId":"fb100000-0000-4000-8000-000000000001","productId":"fb300000-0000-4000-8000-000000000001","assignmentScope":"throughout","disposition":"selected","duplicateMode":"create","idempotencyKey":"lineage-selected"}'::jsonb);
  v_readiness:=public.get_project_ffe_readiness((v_selected->>'selectionId')::uuid);
  ASSERT (v_readiness->>'ready')::boolean AND NOT(v_readiness?'cacheStatus'),
    'readiness must be authoritative and independent of the compatibility cache';
  UPDATE public.project_ffe_items SET blocked=true WHERE id=(v_selected->>'selectionId')::uuid;
  BEGIN
    PERFORM public.create_furnishings_authorization_from_schedule(
      'fb100000-0000-4000-8000-000000000001','Blocked release',ARRAY[(v_selected->>'selectionId')::uuid],NULL);
    RAISE EXCEPTION 'blocked selection reached authorization implementation';
  EXCEPTION WHEN check_violation THEN NULL; END;
  UPDATE public.project_ffe_items SET blocked=false WHERE id=(v_selected->>'selectionId')::uuid;
  v_replacement:=public.supersede_project_selection(jsonb_build_object('selectionId',v_selected->>'selectionId','name','Replacement chair','placementIds','[]'::jsonb));
  ASSERT (SELECT primary_ffe_item_id=(v_replacement->>'selectionId')::uuid FROM public.project_ffe_selection_threads WHERE id=(v_replacement->>'threadId')::uuid),
    'thread primary must follow the selected successor';
  BEGIN
    UPDATE public.project_ffe_items SET supersedes_ffe_item_id=(v_replacement->>'selectionId')::uuid WHERE id=(v_selected->>'selectionId')::uuid;
    RAISE EXCEPTION 'replacement cycle succeeded';
  EXCEPTION WHEN integrity_constraint_violation THEN NULL; END;
  v_po:=public.create_purchase_order('fb100000-0000-4000-8000-000000000001','fb200000-0000-4000-8000-000000000001','full_upfront'::public.purchase_order_payment_pattern,
    ARRAY[(v_replacement->>'selectionId')::uuid]);
  v_change:=public.start_purchase_order_change(jsonb_build_object('purchaseOrderId',v_po.id,'selectionId',v_replacement->>'selectionId',
    'changeKind','cancellation','reason','Client cancelled before send'));
  ASSERT (v_change->>'rebuildable')::boolean AND (SELECT status='cancelled' FROM public.purchase_orders WHERE id=v_po.id)
    AND (SELECT purchase_order_id IS NULL FROM public.project_ffe_items WHERE id=(v_replacement->>'selectionId')::uuid),
    'draft unacknowledged unpaid PO change must cancel and unlink atomically';
  v_second_selected:=public.place_product_in_project_v2('{"projectId":"fb100000-0000-4000-8000-000000000001","productId":"fb300000-0000-4000-8000-000000000001","quantity":"3","assignmentScope":"throughout","disposition":"selected","duplicateMode":"create","idempotencyKey":"second-po-line"}'::jsonb);
  v_second_po:=public.create_purchase_order('fb100000-0000-4000-8000-000000000001','fb200000-0000-4000-8000-000000000001','full_upfront'::public.purchase_order_payment_pattern,
    ARRAY[(v_second_selected->>'selectionId')::uuid]);
  UPDATE public.purchase_orders SET status='confirmed',sent_at=now() WHERE id=v_second_po.id;
  v_receipt:=public.record_project_ffe_receipt((v_second_selected->>'selectionId')::uuid,1,'partial','One of three received','{}');
  ASSERT (v_receipt->>'receivedQuantity')::integer=1
    AND (SELECT received_quantity=1 FROM public.project_ffe_items WHERE id=(v_second_selected->>'selectionId')::uuid),
    'partial receiving must atomically record the inspection and cumulative quantity';
  v_change:=public.start_purchase_order_change(jsonb_build_object('purchaseOrderId',v_second_po.id,'selectionId',v_second_selected->>'selectionId',
    'changeKind','vendor_change','replacementVendorId','fb200000-0000-4000-8000-000000000002','reason','Vendor cannot fulfill order'));
  ASSERT NOT(v_change->>'rebuildable')::boolean AND (v_change->>'requiresImmutableFollowup')::boolean
    AND (SELECT status='confirmed' FROM public.purchase_orders WHERE id=v_second_po.id)
    AND (SELECT purchase_order_id=v_second_po.id FROM public.project_ffe_items WHERE id=(v_second_selected->>'selectionId')::uuid),
    'sent PO change must record immutable follow-up without rewriting the PO or line';
  BEGIN
    UPDATE public.purchase_order_changes SET requested_vendor_id='fb200000-0000-4000-8000-000000000001'
    WHERE id=(v_change->>'changeId')::uuid;
    RAISE EXCEPTION 'requested vendor evidence mutated';
  EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN
    PERFORM public.supersede_project_selection(jsonb_build_object('selectionId',v_second_selected->>'selectionId','placementIds','[]'::jsonb));
    RAISE EXCEPTION 'PO-linked selection superseded directly';
  EXCEPTION WHEN check_violation THEN NULL; END;
  v_batch_line_a:=public.place_product_in_project_v2('{"projectId":"fb100000-0000-4000-8000-000000000001","productId":"fb300000-0000-4000-8000-000000000001","quantity":"2","assignmentScope":"throughout","disposition":"selected","duplicateMode":"create","idempotencyKey":"batch-receipt-a"}'::jsonb);
  v_batch_line_b:=public.place_product_in_project_v2('{"projectId":"fb100000-0000-4000-8000-000000000001","productId":"fb300000-0000-4000-8000-000000000001","quantity":"3","assignmentScope":"throughout","disposition":"selected","duplicateMode":"create","idempotencyKey":"batch-receipt-b"}'::jsonb);
  v_batch_po:=public.create_purchase_order('fb100000-0000-4000-8000-000000000001','fb200000-0000-4000-8000-000000000001','full_upfront'::public.purchase_order_payment_pattern,
    ARRAY[(v_batch_line_a->>'selectionId')::uuid,(v_batch_line_b->>'selectionId')::uuid]);
  UPDATE public.purchase_orders SET status='confirmed',sent_at=now() WHERE id=v_batch_po.id;
  BEGIN
    PERFORM public.record_project_ffe_receipt_batch(v_batch_po.id,jsonb_build_array(
      jsonb_build_object('selectionId',v_batch_line_a->>'selectionId','receivedQuantity',0),
      jsonb_build_object('selectionId',v_batch_line_b->>'selectionId','receivedQuantity',0)
    ),'partial','Unauthorized photo',ARRAY['fb900000-0000-4000-8000-000000000001'::uuid]);
    RAISE EXCEPTION 'unowned receiving photo accepted';
  EXCEPTION WHEN integrity_constraint_violation THEN NULL; END;
  v_partial:=public.record_project_ffe_receipt_batch(v_batch_po.id,jsonb_build_array(
    jsonb_build_object('selectionId',v_batch_line_b->>'selectionId','receivedQuantity',0),
    jsonb_build_object('selectionId',v_batch_line_a->>'selectionId','receivedQuantity',1)
  ),'partial','First delivery','{}');
  v_retry:=public.record_project_ffe_receipt_batch(v_batch_po.id,jsonb_build_array(
    jsonb_build_object('selectionId',v_batch_line_a->>'selectionId','receivedQuantity',1),
    jsonb_build_object('selectionId',v_batch_line_b->>'selectionId','receivedQuantity',0)
  ),'partial','First delivery','{}');
  ASSERT (v_partial->>'inspectionId')=(v_retry->>'inspectionId') AND (v_retry->>'reused')::boolean,
    'normalized batch receipt retry must reuse the exact inspection';
  SELECT count(*) INTO v_inspection_count FROM public.receiving_inspections WHERE purchase_order_id=v_batch_po.id;
  ASSERT v_inspection_count=1,'one batch receipt must create exactly one inspection';
  BEGIN
    PERFORM public.record_project_ffe_receipt_batch(v_batch_po.id,jsonb_build_array(
      jsonb_build_object('selectionId',v_batch_line_a->>'selectionId','receivedQuantity',3),
      jsonb_build_object('selectionId',v_batch_line_b->>'selectionId','receivedQuantity',1)
    ),'damaged','Invalid overage','{}');
    RAISE EXCEPTION 'over-received batch succeeded';
  EXCEPTION WHEN check_violation THEN NULL; END;
  ASSERT (SELECT received_quantity=1 FROM public.project_ffe_items WHERE id=(v_batch_line_a->>'selectionId')::uuid)
    AND (SELECT received_quantity=0 FROM public.project_ffe_items WHERE id=(v_batch_line_b->>'selectionId')::uuid)
    AND (SELECT count(*)=1 FROM public.receiving_inspections WHERE purchase_order_id=v_batch_po.id),
    'invalid batch must roll back every quantity and inspection write';
  BEGIN
    PERFORM public.record_project_ffe_receipt((v_batch_line_a->>'selectionId')::uuid,2,'partial',NULL,'{}');
    RAISE EXCEPTION 'single-line receipt accepted a multi-line PO';
  EXCEPTION WHEN check_violation THEN NULL; END;
  v_damaged:=public.record_project_ffe_receipt_batch(v_batch_po.id,jsonb_build_array(
    jsonb_build_object('selectionId',v_batch_line_a->>'selectionId','receivedQuantity',2),
    jsonb_build_object('selectionId',v_batch_line_b->>'selectionId','receivedQuantity',1)
  ),'damaged','Damaged carton','{}');
  ASSERT (v_damaged->>'outcome')='damaged'
    AND (SELECT count(*)=2 FROM public.receiving_inspections WHERE purchase_order_id=v_batch_po.id),
    'damaged batch must create one additional PO-level inspection';
  v_clean:=public.record_project_ffe_receipt_batch(v_batch_po.id,jsonb_build_array(
    jsonb_build_object('selectionId',v_batch_line_a->>'selectionId','receivedQuantity',2),
    jsonb_build_object('selectionId',v_batch_line_b->>'selectionId','receivedQuantity',3)
  ),'clean','Final delivery','{}');
  ASSERT (v_clean->>'outcome')='clean'
    AND (SELECT bool_and(received_quantity=quantity) FROM public.project_ffe_items WHERE purchase_order_id=v_batch_po.id)
    AND (SELECT count(*)=3 FROM public.receiving_inspections WHERE purchase_order_id=v_batch_po.id),
    'clean batch must fully receive every line with one final inspection';
  v_rebuild_line:=public.place_product_in_project_v2('{"projectId":"fb100000-0000-4000-8000-000000000001","productId":"fb300000-0000-4000-8000-000000000001","assignmentScope":"throughout","disposition":"selected","duplicateMode":"create","idempotencyKey":"draft-rebuild-line"}'::jsonb);
  v_rebuild_po:=public.create_purchase_order('fb100000-0000-4000-8000-000000000001','fb200000-0000-4000-8000-000000000001','full_upfront'::public.purchase_order_payment_pattern,
    ARRAY[(v_rebuild_line->>'selectionId')::uuid]);
  v_rebuild:=public.start_purchase_order_change(jsonb_build_object(
    'purchaseOrderId',v_rebuild_po.id,'selectionId',v_rebuild_line->>'selectionId',
    'changeKind','vendor_change','replacementVendorId','fb200000-0000-4000-8000-000000000002',
    'reason','Draft vendor replacement'));
  ASSERT (v_rebuild->>'replacementPoId') IS NOT NULL
    AND (SELECT status='cancelled' FROM public.purchase_orders WHERE id=v_rebuild_po.id)
    AND (SELECT purchase_order_id=(v_rebuild->>'replacementPoId')::uuid
      AND vendor_id='fb200000-0000-4000-8000-000000000002'
      FROM public.project_ffe_items WHERE id=(v_rebuild_line->>'selectionId')::uuid)
    AND (v_rebuild->>'needsRepricing')::boolean
    AND (SELECT jsonb_array_length(prior_snapshot->'lines')=1
      FROM public.purchase_order_changes WHERE id=(v_rebuild->>'changeId')::uuid),
    'draft vendor change must atomically rebuild and relink a replacement PO';
  ASSERT current_setting('app.po_change_replacement_link',true) IS DISTINCT FROM 'on',
    'one-time replacement linkage capability must not leak past the command';
  BEGIN
    PERFORM public.log_po_acknowledgment((v_rebuild->>'replacementPoId')::uuid,NULL,NULL);
    RAISE EXCEPTION 'incomplete replacement PO was acknowledged';
  EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN
    UPDATE public.purchase_orders SET sent_at=now()
    WHERE id=(v_rebuild->>'replacementPoId')::uuid;
    RAISE EXCEPTION 'incomplete replacement PO bypassed release with sent_at';
  EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN
    PERFORM public.reprice_replacement_purchase_order(
      (v_rebuild->>'replacementPoId')::uuid,
      jsonb_build_array(jsonb_build_object(
        'selectionId',v_rebuild_line->>'selectionId',
        'unitPriceCents','60000','tradePriceCents','70000'
      ))
    );
    RAISE EXCEPTION 'replacement pricing accepted client price below trade cost';
  EXCEPTION WHEN check_violation THEN NULL; END;
  ASSERT (SELECT needs_repricing AND sent_at IS NULL
    FROM public.purchase_orders WHERE id=(v_rebuild->>'replacementPoId')::uuid),
    'failed repricing must retain the release hold atomically';
  v_reprice:=public.reprice_replacement_purchase_order(
    (v_rebuild->>'replacementPoId')::uuid,
    jsonb_build_array(jsonb_build_object(
      'selectionId',v_rebuild_line->>'selectionId',
      'unitPriceCents','110000','tradePriceCents','70000'
    ))
  );
  ASSERT NOT(v_reprice->>'needsRepricing')::boolean
    AND (v_reprice->>'tradeTotalCents')::integer=70000
    AND (SELECT NOT needs_repricing AND total_cents=70000
      FROM public.purchase_orders WHERE id=(v_rebuild->>'replacementPoId')::uuid)
    AND (SELECT unit_price_cents=110000 AND trade_price_cents=70000
      AND line_total_cents=110000 FROM public.project_ffe_items
      WHERE id=(v_rebuild_line->>'selectionId')::uuid)
    AND (SELECT count(*)=1 AND sum(amount_cents)=70000
      FROM public.po_payments WHERE purchase_order_id=(v_rebuild->>'replacementPoId')::uuid),
    'trusted repricing must atomically validate lines, rebuild payments, and clear the hold';
  PERFORM public.log_po_acknowledgment((v_rebuild->>'replacementPoId')::uuid,NULL,NULL);
  ASSERT (SELECT status='confirmed' FROM public.purchase_orders
    WHERE id=(v_rebuild->>'replacementPoId')::uuid),
    'fully repriced replacement PO may proceed through the trusted lifecycle';
  BEGIN
    UPDATE public.purchase_order_changes SET replacement_purchase_order_id=v_rebuild_po.id
    WHERE id=(v_rebuild->>'changeId')::uuid;
    RAISE EXCEPTION 'replacement PO evidence mutated after one-time linkage';
  EXCEPTION WHEN check_violation THEN NULL; END;
  v_peer_line:=public.place_product_in_project_v2('{"projectId":"fb100000-0000-4000-8000-000000000001","productId":"fb300000-0000-4000-8000-000000000001","assignmentScope":"throughout","disposition":"selected","duplicateMode":"create","idempotencyKey":"peer-po-line"}'::jsonb);
  PERFORM pg_temp.assume_lineage_actor('fb000000-0000-4000-8000-000000000002');
  v_peer_po:=public.create_purchase_order('fb100000-0000-4000-8000-000000000001','fb200000-0000-4000-8000-000000000001','full_upfront'::public.purchase_order_payment_pattern,
    ARRAY[(v_peer_line->>'selectionId')::uuid]);
  ASSERT v_peer_po.designer_id='fb000000-0000-4000-8000-000000000001'
    AND v_peer_po.created_by='fb000000-0000-4000-8000-000000000002',
    'studio co-member PO creation must retain owner authority and actor audit';
  PERFORM pg_temp.assume_lineage_actor('fb000000-0000-4000-8000-000000000001');
  INSERT INTO public.project_boards(id,project_id,name,items,sections) VALUES(
    'fb500000-0000-4000-8000-000000000001','fb100000-0000-4000-8000-000000000001','Activated board',
    jsonb_build_array(jsonb_build_object('type','product','product_id','fb300000-0000-4000-8000-000000000001','data','{}'::jsonb,'project_ffe_item_id',v_replacement->>'selectionId')),'[]'::jsonb);
  v_continued:=public.continue_board_in_project('fb500000-0000-4000-8000-000000000001');
  ASSERT (SELECT project_ffe_item_id=(v_replacement->>'selectionId')::uuid AND NOT(data?'project_ffe_item_id')
    FROM public.proposal_board_items WHERE board_id=v_continued),
    'continuation must persist linkage in the typed column only';
  INSERT INTO public.project_ffe_items(id,project_id,product_id,name,quantity,unit_price_cents,line_total_cents,
    vendor_id,vendor_name,design_disposition,assignment_scope,role_identity)
  SELECT (md5('stable-selection-'||ordinal))::uuid,'fb100000-0000-4000-8000-000000000001',
    'fb300000-0000-4000-8000-000000000001','Stable selection '||ordinal,1,100000,100000,
    'fb200000-0000-4000-8000-000000000001','Lineage Vendor','candidate','throughout','default'
  FROM generate_series(1,20) ordinal;
  INSERT INTO public.project_boards(id,project_id,name,items,sections)
  SELECT 'fb500000-0000-4000-8000-000000000020','fb100000-0000-4000-8000-000000000001','Twenty item board',
    jsonb_agg(jsonb_build_object('type','product','x',ordinal*10,'y',0,'width',100,
      'product_id','fb300000-0000-4000-8000-000000000001','project_ffe_item_id',(md5('stable-selection-'||ordinal))::uuid,
      'data',jsonb_build_object('sourceOrdinal',ordinal)) ORDER BY ordinal),'[]'::jsonb
  FROM generate_series(1,20) ordinal;
  v_twenty_board:=public.continue_board_in_project('fb500000-0000-4000-8000-000000000020');
  ASSERT NOT EXISTS(
    SELECT 1 FROM public.proposal_board_items placement
    WHERE placement.board_id=v_twenty_board
      AND placement.project_ffe_item_id IS DISTINCT FROM
        (md5('stable-selection-'||(placement.data->>'sourceOrdinal')))::uuid
  ),'20-item continuation must preserve each source identity without UUID-order shuffling';
  v_live_board:=public.create_project_board('{"projectId":"fb100000-0000-4000-8000-000000000001","name":"Live board"}'::jsonb);
  PERFORM public.apply_board_room_state((v_live_board->>'boardId')::uuid,'project','fb100000-0000-4000-8000-000000000001',
    '{"name":"Live board","canvasWidth":1200,"canvasHeight":800,"backgroundColor":"#FAF8F5","sections":[],"items":[],"coverImageUrl":"fb100000-0000-4000-8000-000000000001/boards/cover.webp"}'::jsonb);
  ASSERT (SELECT cover_image_url='fb100000-0000-4000-8000-000000000001/boards/cover.webp' FROM public.proposal_boards WHERE id=(v_live_board->>'boardId')::uuid),
    'atomic project board state must persist a private working cover';
  BEGIN
    PERFORM public.apply_board_room_state((v_live_board->>'boardId')::uuid,'project','fb100000-0000-4000-8000-000000000001',
      '{"name":"Live board","canvasWidth":1200,"canvasHeight":800,"backgroundColor":"#FAF8F5","sections":[],"items":[],"coverImageUrl":"https://local.test/storage/v1/object/public/proposal-mood-boards/project/cover.webp"}'::jsonb);
    RAISE EXCEPTION 'public proposal bucket accepted as project cover';
  EXCEPTION WHEN check_violation THEN NULL; END;
  v_import:=public.stage_project_ffe_import(jsonb_build_object('projectId','fb100000-0000-4000-8000-000000000001','sourceKind','csv',
    'fileHash',repeat('c',64),'rows',jsonb_build_array(jsonb_build_object('name','Imported chair'))));
  v_batch:=(v_import->>'batchId')::uuid;
  v_first_commit:=public.commit_project_ffe_import(v_batch,'[{"rowOrdinal":1,"assignmentScope":"unassigned","duplicateMode":"create"}]'::jsonb);
  v_retry_commit:=public.commit_project_ffe_import(v_batch,'[]'::jsonb);
  ASSERT v_first_commit=v_retry_commit,'import retry must return the exact stored outcome';
  v_import:=public.stage_project_ffe_import(jsonb_build_object('projectId','fb100000-0000-4000-8000-000000000001','sourceKind','csv',
    'fileHash',repeat('d',64),'rows',jsonb_build_array(jsonb_build_object('name',E' \t=HYPERLINK("x")','quantity','1e3'))));
  ASSERT (SELECT validation_errors @> '["formula_like_value","invalid_quantity"]'::jsonb
    FROM public.project_ffe_import_rows WHERE batch_id=(v_import->>'batchId')::uuid),
    'leading whitespace formula and unsafe numeric cast must be inert';
  BEGIN
    PERFORM public.stage_project_ffe_import(jsonb_build_object('projectId','fb100000-0000-4000-8000-000000000001','sourceKind','csv',
      'fileHash',repeat('9',64),'rows',jsonb_build_array(jsonb_build_object('name','Overflow','quantity',repeat('9',40)))));
    RAISE EXCEPTION 'overflow spreadsheet quantity reached a cast';
  EXCEPTION WHEN check_violation THEN NULL; END;
  SELECT jsonb_agg(jsonb_build_object('name','Generated row '||ordinal)) INTO v_rows FROM generate_series(1,5000) ordinal;
  v_import:=public.stage_project_ffe_import(jsonb_build_object('projectId','fb100000-0000-4000-8000-000000000001','sourceKind','xlsx',
    'fileHash',repeat('e',64),'rows',v_rows));
  ASSERT (v_import->>'rowCount')::integer=5000 AND (SELECT count(*)=5000 FROM public.project_ffe_import_rows WHERE batch_id=(v_import->>'batchId')::uuid),
    '5,000-row import boundary must stage exactly';
  BEGIN
    PERFORM public.stage_project_ffe_document_extraction('fb100000-0000-4000-8000-000000000001',
      'fb700000-0000-4000-8000-000000000001','fb000000-0000-4000-8000-000000000001',repeat('f',64),'[]'::jsonb);
    RAISE EXCEPTION 'missing PDF source staged';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END; $$;

DO $$
DECLARE v_thread uuid; v_selected uuid; v_alternate uuid; v_new_thread uuid;
BEGIN
  INSERT INTO public.project_ffe_selection_threads(id,project_id,created_by) VALUES
    ('fb600000-0000-4000-8000-000000000001','fb100000-0000-4000-8000-000000000001','fb000000-0000-4000-8000-000000000001') RETURNING id INTO v_thread;
  INSERT INTO public.project_ffe_items(project_id,name,quantity,unit_price_cents,line_total_cents,selection_thread_id,design_disposition,assignment_scope)
  VALUES('fb100000-0000-4000-8000-000000000001','Primary',1,0,0,v_thread,'selected','throughout') RETURNING id INTO v_selected;
  INSERT INTO public.project_ffe_items(project_id,name,quantity,unit_price_cents,line_total_cents,selection_thread_id,design_disposition,assignment_scope)
  VALUES('fb100000-0000-4000-8000-000000000001','Alternate',1,0,0,v_thread,'alternate','throughout') RETURNING id INTO v_alternate;
  BEGIN
    UPDATE public.project_ffe_items SET design_disposition='candidate' WHERE id=v_selected;
    SET CONSTRAINTS assert_project_ffe_thread_consistency_trg IMMEDIATE;
    RAISE EXCEPTION 'alternate thread without selected row succeeded';
  EXCEPTION WHEN integrity_constraint_violation THEN NULL; END;
  SET CONSTRAINTS assert_project_ffe_thread_consistency_trg DEFERRED;
  INSERT INTO public.project_ffe_selection_threads(id,project_id,created_by) VALUES
    ('fb600000-0000-4000-8000-000000000002','fb100000-0000-4000-8000-000000000001','fb000000-0000-4000-8000-000000000001') RETURNING id INTO v_new_thread;
  BEGIN
    UPDATE public.project_ffe_items SET selection_thread_id=v_new_thread WHERE id=v_selected;
    SET CONSTRAINTS assert_project_ffe_thread_consistency_trg IMMEDIATE;
    RAISE EXCEPTION 'cross-thread move left the old alternate thread without a selection';
  EXCEPTION WHEN integrity_constraint_violation THEN NULL; END;
  SET CONSTRAINTS assert_project_ffe_thread_consistency_trg DEFERRED;
END; $$;
ROLLBACK;
