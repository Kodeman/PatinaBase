-- Release lineage, duplicate identity, N-1, continuation, and import retry contracts.
BEGIN;
SET LOCAL statement_timeout='30s';
CREATE OR REPLACE FUNCTION pg_temp.assume_lineage_actor(p_actor uuid) RETURNS void LANGUAGE plpgsql AS $$ BEGIN
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',p_actor,'role','authenticated')::text,true);
  PERFORM set_config('request.jwt.claim.sub',p_actor::text,true);
END; $$;
INSERT INTO auth.users(id,email,encrypted_password,email_confirmed_at,created_at,updated_at,instance_id,aud,role) VALUES
('fb000000-0000-4000-8000-000000000001','lineage-owner@test.invalid','',now(),now(),now(),'00000000-0000-0000-0000-000000000000','authenticated','authenticated');
INSERT INTO public.profiles(id,email,full_name,is_designer) VALUES
('fb000000-0000-4000-8000-000000000001','lineage-owner@test.invalid','Lineage Owner',true) ON CONFLICT DO NOTHING;
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
    PERFORM public.supersede_project_selection(jsonb_build_object('selectionId',v_second_selected->>'selectionId','placementIds','[]'::jsonb));
    RAISE EXCEPTION 'PO-linked selection superseded directly';
  EXCEPTION WHEN check_violation THEN NULL; END;
  INSERT INTO public.project_boards(id,project_id,name,items,sections) VALUES(
    'fb500000-0000-4000-8000-000000000001','fb100000-0000-4000-8000-000000000001','Activated board',
    jsonb_build_array(jsonb_build_object('type','product','product_id','fb300000-0000-4000-8000-000000000001','data','{}'::jsonb,'project_ffe_item_id',v_replacement->>'selectionId')),'[]'::jsonb);
  v_continued:=public.continue_board_in_project('fb500000-0000-4000-8000-000000000001');
  ASSERT (SELECT project_ffe_item_id=(v_replacement->>'selectionId')::uuid AND NOT(data?'project_ffe_item_id')
    FROM public.proposal_board_items WHERE board_id=v_continued),
    'continuation must persist linkage in the typed column only';
  v_live_board:=public.create_project_board('{"projectId":"fb100000-0000-4000-8000-000000000001","name":"Live board"}'::jsonb);
  PERFORM public.apply_board_room_state((v_live_board->>'boardId')::uuid,'project','fb100000-0000-4000-8000-000000000001',
    '{"name":"Live board","canvasWidth":1200,"canvasHeight":800,"backgroundColor":"#FAF8F5","sections":[],"items":[],"coverImageUrl":"https://local.test/storage/v1/object/sign/project-ffe-working/fb100000-0000-4000-8000-000000000001/cover.webp"}'::jsonb);
  ASSERT (SELECT cover_image_url LIKE '%project-ffe-working/%' FROM public.proposal_boards WHERE id=(v_live_board->>'boardId')::uuid),
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
DECLARE v_thread uuid; v_selected uuid; v_alternate uuid;
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
END; $$;
ROLLBACK;
