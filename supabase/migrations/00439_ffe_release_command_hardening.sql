-- 00439 — Hardened FF&E commands and compatibility wrappers.

ALTER TABLE public.purchase_order_changes
  ADD COLUMN IF NOT EXISTS requested_vendor_id uuid REFERENCES public.vendors(id) ON DELETE RESTRICT;

CREATE OR REPLACE FUNCTION public._ffe_strict_client_fields(p_fields jsonb)
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SET search_path TO 'public','pg_temp' AS $$
DECLARE v_key text; v_value jsonb;
BEGIN
  IF p_fields IS NULL THEN RETURN '{}'::jsonb; END IF;
  IF jsonb_typeof(p_fields) <> 'object' THEN
    RAISE EXCEPTION 'clientFields must be an object' USING ERRCODE='check_violation';
  END IF;
  FOR v_key,v_value IN SELECT key,value FROM jsonb_each(p_fields) LOOP
    IF v_key NOT IN ('note','description','dimensions','finish','material','color','leadTime','care')
       OR jsonb_typeof(v_value) NOT IN ('string','number','boolean','null') THEN
      RAISE EXCEPTION 'clientFields contains a non-public field'
        USING ERRCODE='check_violation';
    END IF;
  END LOOP;
  RETURN p_fields;
END;
$$;

CREATE OR REPLACE FUNCTION public.publish_project_review(p_request jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','extensions','pg_temp' AS $$
DECLARE
  v_project_id uuid:=NULLIF(p_request->>'projectId','')::uuid;
  v_edition public.project_review_editions%ROWTYPE;
  v_project public.projects%ROWTYPE;
  v_entry jsonb; v_item public.project_ffe_items%ROWTYPE;
  v_item_snapshot jsonb; v_room_snapshot jsonb; v_media jsonb; v_client_fields jsonb;
  v_content_hash text; v_item_ids uuid[]:='{}'; v_number integer; v_hash text;
BEGIN
  v_project:=public._ffe_require_studio_project(v_project_id);
  IF jsonb_typeof(p_request->'items') <> 'array' OR jsonb_array_length(p_request->'items')=0
     OR COALESCE(p_request->>'clientPriceMode','hide') NOT IN ('hide','unit','line_total')
     OR jsonb_typeof(COALESCE(p_request->'boardIds','[]'::jsonb)) <> 'array' THEN
    RAISE EXCEPTION 'review publication requires items, board IDs, and a valid price mode'
      USING ERRCODE='check_violation';
  END IF;
  PERFORM set_config('app.project_review_publish','on',true);
  UPDATE public.project_review_editions
  SET status='superseded',superseded_at=now(),updated_at=now()
  WHERE project_id=v_project_id AND status='published';
  SELECT COALESCE(max(edition_number),0)+1 INTO v_number
  FROM public.project_review_editions WHERE project_id=v_project_id;
  INSERT INTO public.project_review_editions(
    project_id,edition_number,title,client_price_mode,room_snapshot,board_snapshot,created_by
  ) VALUES(
    v_project_id,v_number,COALESCE(NULLIF(btrim(p_request->>'title'),''),'Selections review '||v_number),
    COALESCE(p_request->>'clientPriceMode','hide'),
    COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'id',room.id,'name',room.name,'sortOrder',room.sort_order
    ) ORDER BY room.sort_order,room.id) FROM public.project_rooms room WHERE room.project_id=v_project_id),'[]'::jsonb),
    COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'id',board.id,'name',board.name,'roomId',board.project_room_id,
      'canvasWidth',board.canvas_width,'canvasHeight',board.canvas_height,
      'backgroundColor',board.background_color,'sections',board.sections,
      'items',COALESCE((SELECT jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
        'id',placement.id,'selectionId',placement.project_ffe_item_id,
        'x',placement.x,'y',placement.y,'width',placement.width,'height',placement.height,
        'zIndex',placement.z_index,'rotation',placement.rotation
      )) ORDER BY placement.z_index,placement.id)
      FROM public.proposal_board_items placement
      WHERE placement.board_id=board.id AND placement.project_ffe_item_id IS NOT NULL),'[]'::jsonb)
    ) ORDER BY board.sort_order,board.id)
    FROM public.proposal_boards board
    WHERE board.project_id=v_project_id
      AND board.id IN (SELECT value::uuid FROM jsonb_array_elements_text(COALESCE(p_request->'boardIds','[]'::jsonb)))),'[]'::jsonb),
    auth.uid()
  ) RETURNING * INTO v_edition;

  FOR v_entry IN SELECT value FROM jsonb_array_elements(p_request->'items') LOOP
    IF jsonb_typeof(v_entry) <> 'object' OR COALESCE(v_entry->>'selectionId','') !~* '^[0-9a-f-]{36}$' THEN
      RAISE EXCEPTION 'invalid review item' USING ERRCODE='check_violation';
    END IF;
    v_client_fields:=public._ffe_strict_client_fields(COALESCE(v_entry->'clientFields','{}'::jsonb));
    SELECT * INTO v_item FROM public.project_ffe_items
    WHERE id=(v_entry->>'selectionId')::uuid AND project_id=v_project_id
      AND removed_at IS NULL AND design_disposition='selected';
    IF NOT FOUND THEN RAISE EXCEPTION 'review item is not an active selected line'
      USING ERRCODE='integrity_constraint_violation'; END IF;
    IF v_item.id=ANY(v_item_ids) THEN RAISE EXCEPTION 'review cannot contain duplicate selections'
      USING ERRCODE='unique_violation'; END IF;
    v_item_ids:=array_append(v_item_ids,v_item.id);
    IF jsonb_typeof(COALESCE(v_entry->'mediaAssetIds','[]'::jsonb)) <> 'array' THEN
      RAISE EXCEPTION 'mediaAssetIds must be an array' USING ERRCODE='check_violation';
    END IF;
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'id',asset.id,'kind',asset.derivative_kind,'bucket',asset.storage_bucket,
      'path',asset.storage_path,'checksumSha256',asset.checksum_sha256,
      'sizeBytes',asset.size_bytes,'contentType',asset.content_type
    ) ORDER BY asset.derivative_kind,asset.id),'[]'::jsonb)
    INTO v_media FROM public.project_review_media_assets asset
    WHERE asset.project_id=v_project_id
      AND asset.id IN (SELECT value::uuid FROM jsonb_array_elements_text(COALESCE(v_entry->'mediaAssetIds','[]'::jsonb)));
    IF jsonb_array_length(v_media) <> jsonb_array_length(COALESCE(v_entry->'mediaAssetIds','[]'::jsonb)) THEN
      RAISE EXCEPTION 'review media is not prepared for this project'
        USING ERRCODE='integrity_constraint_violation';
    END IF;
    SELECT jsonb_build_object('id',room.id,'name',room.name) INTO v_room_snapshot
    FROM public.project_rooms room WHERE room.id=v_item.project_room_id;
    v_room_snapshot:=COALESCE(v_room_snapshot,jsonb_build_object('scope',v_item.assignment_scope));
    v_item_snapshot:=jsonb_strip_nulls(jsonb_build_object(
      'selectionId',v_item.id,'threadId',v_item.selection_thread_id,'productId',v_item.product_id,
      'name',v_item.name,'category',v_item.ffe_category,'quantity',v_item.quantity,
      'assignmentScope',v_item.assignment_scope,'room',v_room_snapshot,
      'clientFields',v_client_fields,'media',v_media,
      'clientUnitPriceCents',CASE WHEN v_edition.client_price_mode='unit' THEN v_item.unit_price_cents END,
      'clientLineTotalCents',CASE WHEN v_edition.client_price_mode='line_total' THEN v_item.line_total_cents END
    ));
    v_content_hash:=encode(extensions.digest(v_item_snapshot::text,'sha256'),'hex');
    INSERT INTO public.project_review_items(
      edition_id,source_ffe_item_id,selection_thread_id,product_id,project_room_id,
      item_snapshot,room_snapshot,client_fields,client_unit_price_cents,
      client_line_total_cents,media_manifest,content_hash,sort_order
    ) VALUES(
      v_edition.id,v_item.id,v_item.selection_thread_id,v_item.product_id,v_item.project_room_id,
      v_item_snapshot,v_room_snapshot,v_client_fields,
      CASE WHEN v_edition.client_price_mode='unit' THEN v_item.unit_price_cents END,
      CASE WHEN v_edition.client_price_mode='line_total' THEN v_item.line_total_cents END,
      v_media,v_content_hash,COALESCE(NULLIF(v_entry->>'sortOrder','')::integer,cardinality(v_item_ids)-1)
    );
  END LOOP;
  SELECT encode(extensions.digest(jsonb_build_object(
    'editionId',v_edition.id,'rooms',v_edition.room_snapshot,'boards',v_edition.board_snapshot,
    'items',(SELECT jsonb_agg(jsonb_build_object('id',id,'hash',content_hash) ORDER BY sort_order,id)
             FROM public.project_review_items WHERE edition_id=v_edition.id)
  )::text,'sha256'),'hex') INTO v_hash;
  UPDATE public.project_review_editions
  SET status='published',snapshot_hash=v_hash,published_at=now(),published_by=auth.uid(),updated_at=now()
  WHERE id=v_edition.id RETURNING * INTO v_edition;
  IF v_project.client_id IS NOT NULL THEN
    INSERT INTO public.project_review_access(edition_id,actor_id,expires_at)
    VALUES(v_edition.id,v_project.client_id,NULLIF(p_request->>'expiresAt','')::timestamptz)
    ON CONFLICT(edition_id,actor_id) DO NOTHING;
  END IF;
  RETURN jsonb_build_object('editionId',v_edition.id,'editionNumber',v_edition.edition_number,
    'status','published','snapshotHash',v_hash,'itemCount',cardinality(v_item_ids));
END;
$$;

CREATE OR REPLACE FUNCTION public.get_client_project_selections(p_project_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp' AS $$
DECLARE v_actor uuid:=auth.uid(); v_project public.projects%ROWTYPE;
BEGIN
  IF v_actor IS NULL THEN RAISE EXCEPTION 'authentication required' USING ERRCODE='insufficient_privilege'; END IF;
  SELECT * INTO v_project FROM public.projects WHERE id=p_project_id;
  IF NOT FOUND OR NOT(v_project.client_id=v_actor OR public.is_studio_comember(v_project.designer_id)) THEN
    RAISE EXCEPTION 'project not found or not accessible' USING ERRCODE='insufficient_privilege';
  END IF;
  RETURN jsonb_build_object('projectId',v_project.id,'projectName',v_project.name,'selections',COALESCE((
    SELECT jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
      'id',item.id,'threadId',item.selection_thread_id,'name',item.name,
      'category',item.ffe_category,'assignmentScope',item.assignment_scope,
      'roomId',item.project_room_id,'roomName',room.name,'quantity',item.quantity,
      'productId',item.product_id
    )) ORDER BY room.sort_order NULLS FIRST,item.sort_order,item.created_at,item.id)
    FROM public.project_ffe_items item
    LEFT JOIN public.project_rooms room ON room.id=item.project_room_id
    WHERE item.project_id=p_project_id AND item.removed_at IS NULL
      AND item.design_disposition='selected'
  ),'[]'::jsonb));
END;
$$;

CREATE OR REPLACE FUNCTION public.get_project_review_media_manifest(p_edition_id uuid,p_client_id uuid)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path TO 'public','pg_temp' AS $$
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'assetId',asset.id,'bucket',asset.storage_bucket,'path',asset.storage_path,
    'checksumSha256',asset.checksum_sha256,'sizeBytes',asset.size_bytes,'contentType',asset.content_type
  ) ORDER BY asset.id),'[]'::jsonb)
  FROM public.project_review_editions edition
  JOIN public.project_review_access access ON access.edition_id=edition.id AND access.actor_id=p_client_id
  JOIN public.project_review_items item ON item.edition_id=edition.id
  CROSS JOIN LATERAL jsonb_array_elements(item.media_manifest) media
  JOIN public.project_review_media_assets asset
    ON asset.id=(media->>'id')::uuid AND asset.project_id=edition.project_id
   AND asset.storage_bucket=media->>'bucket' AND asset.storage_path=media->>'path'
   AND asset.checksum_sha256=media->>'checksumSha256'
   AND asset.size_bytes=(media->>'sizeBytes')::bigint AND asset.content_type=media->>'contentType'
  WHERE edition.id=p_edition_id AND edition.status IN ('published','superseded','finalized')
    AND access.status='active' AND (access.expires_at IS NULL OR access.expires_at>now());
$$;

CREATE OR REPLACE FUNCTION public.authorize_project_review_media(p_edition_id uuid,p_actor_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp' AS $$
DECLARE v_edition public.project_review_editions%ROWTYPE; v_project_id uuid; v_expected integer; v_media jsonb;
BEGIN
  SELECT edition.* INTO v_edition
  FROM public.project_review_editions edition
  JOIN public.project_review_access access ON access.edition_id=edition.id AND access.actor_id=p_actor_id
  WHERE edition.id=p_edition_id AND edition.status IN ('published','superseded','finalized')
    AND access.status='active' AND (access.expires_at IS NULL OR access.expires_at>now());
  IF NOT FOUND THEN RAISE EXCEPTION 'review media not accessible' USING ERRCODE='insufficient_privilege'; END IF;
  v_project_id:=v_edition.project_id;
  SELECT count(*) INTO v_expected FROM public.project_review_items item
  CROSS JOIN LATERAL jsonb_array_elements(item.media_manifest) media WHERE item.edition_id=p_edition_id;
  v_media:=public.get_project_review_media_manifest(p_edition_id,p_actor_id);
  IF jsonb_array_length(v_media)<>v_expected THEN
    RAISE EXCEPTION 'published review media no longer matches its frozen manifest'
      USING ERRCODE='data_exception';
  END IF;
  RETURN jsonb_build_object('editionId',p_edition_id,'projectId',v_project_id,'actorId',p_actor_id,'media',v_media);
END;
$$;

CREATE OR REPLACE FUNCTION public.get_client_project_review_bundle(p_edition_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp' AS $$
DECLARE v_actor uuid:=auth.uid(); v_edition public.project_review_editions%ROWTYPE; v_project public.projects%ROWTYPE; v_studio boolean;
BEGIN
  IF v_actor IS NULL THEN RAISE EXCEPTION 'authentication required' USING ERRCODE='insufficient_privilege'; END IF;
  SELECT * INTO v_edition FROM public.project_review_editions
  WHERE id=p_edition_id AND status IN ('published','superseded','finalized');
  IF NOT FOUND THEN RAISE EXCEPTION 'published review not found' USING ERRCODE='no_data_found'; END IF;
  SELECT * INTO STRICT v_project FROM public.projects WHERE id=v_edition.project_id;
  v_studio:=public.is_studio_comember(v_project.designer_id);
  IF NOT v_studio AND NOT EXISTS(
    SELECT 1 FROM public.project_review_access access
    WHERE access.edition_id=v_edition.id AND access.actor_id=v_actor AND access.status='active'
      AND (access.expires_at IS NULL OR access.expires_at>now())
  ) THEN RAISE EXCEPTION 'review not accessible' USING ERRCODE='insufficient_privilege'; END IF;
  RETURN jsonb_build_object(
    'edition',jsonb_build_object('id',v_edition.id,'number',v_edition.edition_number,
      'title',v_edition.title,'status',v_edition.status,'publishedAt',v_edition.published_at,
      'priceMode',v_edition.client_price_mode,'snapshotHash',v_edition.snapshot_hash),
    'project',jsonb_build_object('id',v_project.id,'name',v_project.name),
    'rooms',v_edition.room_snapshot,'boards',v_edition.board_snapshot,
    'items',COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'id',item.id,'selectionId',item.source_ffe_item_id,'threadId',item.selection_thread_id,
      'snapshot',item.item_snapshot,'contentHash',item.content_hash,
      'feedback',COALESCE((SELECT jsonb_agg(jsonb_build_object(
        'id',feedback.id,'verdict',feedback.verdict,'body',feedback.body,'createdAt',feedback.created_at
      ) ORDER BY feedback.created_at) FROM public.item_feedback feedback
      WHERE feedback.project_review_item_id=item.id
        AND (v_studio OR feedback.client_id=v_actor)),'[]'::jsonb)
    ) ORDER BY item.sort_order,item.id) FROM public.project_review_items item
    WHERE item.edition_id=v_edition.id),'[]'::jsonb)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.record_project_review_feedback(p_review_item_id uuid,p_verdict text,p_body text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp' AS $$
DECLARE v_actor uuid:=auth.uid(); v_feedback_id uuid;
BEGIN
  IF v_actor IS NULL OR p_verdict NOT IN ('approved','rejected','comment')
     OR (p_verdict='comment' AND btrim(COALESCE(p_body,''))='') THEN
    RAISE EXCEPTION 'invalid review feedback' USING ERRCODE='check_violation';
  END IF;
  IF NOT EXISTS(
    SELECT 1 FROM public.project_review_items item
    JOIN public.project_review_editions edition ON edition.id=item.edition_id
    JOIN public.project_review_access access ON access.edition_id=edition.id AND access.actor_id=v_actor
    WHERE item.id=p_review_item_id AND edition.status='published' AND access.status='active'
      AND (access.expires_at IS NULL OR access.expires_at>now())
  ) THEN RAISE EXCEPTION 'published review item not found or not accessible'
    USING ERRCODE='insufficient_privilege'; END IF;
  INSERT INTO public.item_feedback(project_review_item_id,client_id,verdict,body)
  VALUES(p_review_item_id,v_actor,p_verdict,NULLIF(btrim(p_body),'')) RETURNING id INTO v_feedback_id;
  RETURN jsonb_build_object('feedbackId',v_feedback_id,'reviewItemId',p_review_item_id,'verdict',p_verdict);
END;
$$;

CREATE OR REPLACE FUNCTION public.revoke_project_review_access(p_edition_id uuid,p_reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp' AS $$
DECLARE v_project_id uuid; v_count integer;
BEGIN
  SELECT project_id INTO v_project_id FROM public.project_review_editions WHERE id=p_edition_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'review edition not found' USING ERRCODE='no_data_found'; END IF;
  PERFORM public._ffe_require_studio_project(v_project_id);
  IF char_length(btrim(COALESCE(p_reason,'')))<5 THEN RAISE EXCEPTION 'revocation reason is required' USING ERRCODE='check_violation'; END IF;
  UPDATE public.project_review_access SET status='revoked',revoked_at=now(),revoked_by=auth.uid(),
    revoke_reason=btrim(p_reason) WHERE edition_id=p_edition_id AND status='active';
  GET DIAGNOSTICS v_count=ROW_COUNT;
  RETURN jsonb_build_object('editionId',p_edition_id,'revokedCount',v_count);
END;
$$;

ALTER FUNCTION public.place_product_in_project_v2(jsonb) RENAME TO _place_product_in_project_v2_00438_impl;
REVOKE ALL ON FUNCTION public._place_product_in_project_v2_00438_impl(jsonb)
FROM PUBLIC,anon,authenticated,service_role;
CREATE OR REPLACE FUNCTION public.place_product_in_project_v2(p_request jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp' AS $$
DECLARE v_request jsonb:=p_request; v_project uuid:=NULLIF(p_request->>'projectId','')::uuid;
  v_product uuid:=NULLIF(p_request->>'productId','')::uuid; v_room uuid:=NULLIF(p_request->>'roomId','')::uuid;
  v_configuration uuid:=NULLIF(p_request->>'configurationId','')::uuid;
  v_role text:=COALESCE(NULLIF(p_request->>'roleIdentity',''),'default'); v_match uuid; v_result jsonb;
BEGIN
  IF v_role !~ '^[a-z0-9][a-z0-9_.:-]{0,79}$' THEN RAISE EXCEPTION 'invalid role identity' USING ERRCODE='check_violation'; END IF;
  IF COALESCE(p_request->>'duplicateMode','reuse')='reuse' AND v_product IS NOT NULL
     AND NULLIF(p_request->>'selectionReferenceId','') IS NULL
     AND NULLIF(p_request->>'placeholderSelectionId','') IS NULL THEN
    SELECT item.id INTO v_match FROM public.project_ffe_items item
    LEFT JOIN public.project_ffe_specs spec ON spec.ffe_item_id=item.id
    WHERE item.project_id=v_project AND item.product_id=v_product AND item.removed_at IS NULL
      AND item.design_disposition NOT IN ('not_selected','superseded')
      AND item.assignment_scope=COALESCE(NULLIF(p_request->>'assignmentScope',''),'unassigned')
      AND item.project_room_id IS NOT DISTINCT FROM v_room
      AND item.role_identity=v_role AND spec.configuration_id IS NOT DISTINCT FROM v_configuration
    ORDER BY item.created_at,item.id LIMIT 1 FOR UPDATE OF item;
    IF v_match IS NULL THEN v_request:=jsonb_set(v_request,'{duplicateMode}','"create"'::jsonb,true);
    ELSE v_request:=v_request||jsonb_build_object('selectionReferenceId',v_match); END IF;
  END IF;
  v_result:=public._place_product_in_project_v2_00438_impl(v_request);
  IF v_result->>'outcome' IN ('created','filled') THEN
    UPDATE public.project_ffe_items SET role_identity=v_role WHERE id=(v_result->>'selectionId')::uuid;
  END IF;
  RETURN v_result||jsonb_build_object('roleIdentity',v_role,'configurationId',v_configuration);
END;
$$;

CREATE OR REPLACE FUNCTION public.place_product_in_project(
  p_project_id uuid,p_product_id uuid,p_room_id uuid DEFAULT NULL,p_slot_id uuid DEFAULT NULL,
  p_category text DEFAULT NULL,p_source jsonb DEFAULT '{}'::jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path TO 'public','extensions','pg_temp' AS $$
DECLARE v_key text;
BEGIN
  v_key:=NULLIF(p_source->>'idempotencyKey','');
  IF v_key IS NULL AND NULLIF(p_source->>'captureId','') IS NOT NULL THEN
    v_key:='n1:capture:'||p_source->>'captureId'||':'||p_project_id::text||':'||COALESCE(p_room_id::text,'unsorted')||':'||COALESCE(p_slot_id::text,'new');
  ELSIF v_key IS NULL THEN v_key:='n1:request:'||extensions.gen_random_uuid()::text; END IF;
  RETURN public.place_product_in_project_v2(jsonb_strip_nulls(jsonb_build_object(
    'projectId',p_project_id,'productId',p_product_id,'roomId',p_room_id,
    'assignmentScope',CASE WHEN p_room_id IS NULL THEN 'unassigned' ELSE 'room' END,
    'placeholderSelectionId',p_slot_id,'category',p_category,
    'duplicateMode',CASE WHEN p_slot_id IS NULL THEN 'create' ELSE 'reuse' END,
    'disposition','candidate','source',COALESCE(NULLIF(p_source->>'client',''),NULLIF(p_source->>'source',''),'chrome-n-1'),
    'sourceMetadata',p_source,'captureId',p_source->>'captureId','idempotencyKey',v_key
  )));
END;
$$;

CREATE OR REPLACE FUNCTION public.supersede_project_selection(p_request jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp' AS $$
DECLARE v_old_id uuid:=NULLIF(p_request->>'selectionId','')::uuid; v_old public.project_ffe_items%ROWTYPE;
  v_new public.project_ffe_items%ROWTYPE; v_new_product uuid:=NULLIF(p_request->>'productId','')::uuid;
  v_placements uuid[]; v_expected integer; v_updated integer;
BEGIN
  SELECT * INTO v_old FROM public.project_ffe_items WHERE id=v_old_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'selection not found' USING ERRCODE='no_data_found'; END IF;
  PERFORM public._ffe_require_studio_project(v_old.project_id);
  IF v_old.purchase_order_id IS NOT NULL OR v_old.status IN ('delivered','installed') THEN
    RAISE EXCEPTION 'ordered, delivered, or installed selections require the PO change command'
      USING ERRCODE='check_violation';
  END IF;
  IF EXISTS(SELECT 1 FROM public.furnishing_authorization_items line
    JOIN public.project_commercial_documents document ON document.id=line.commercial_document_id
    JOIN public.proposals proposal ON proposal.id=document.proposal_id
    WHERE line.source_ffe_item_id=v_old.id AND proposal.commercial_state IN ('draft','sent','executed')) THEN
    RAISE EXCEPTION 'authorized selections require void or commercial change authority'
      USING ERRCODE='check_violation';
  END IF;
  IF v_old.design_disposition='superseded' OR v_old.removed_at IS NOT NULL THEN
    RAISE EXCEPTION 'selection is already inactive' USING ERRCODE='check_violation';
  END IF;
  IF v_new_product IS NOT NULL AND NOT public._can_read_configurable_product(v_new_product) THEN
    RAISE EXCEPTION 'replacement product not found or not accessible' USING ERRCODE='insufficient_privilege';
  END IF;
  SELECT array_agg(DISTINCT value::uuid) INTO v_placements
  FROM jsonb_array_elements_text(COALESCE(p_request->'placementIds','[]'::jsonb));
  v_expected:=COALESCE(cardinality(v_placements),0);
  IF v_expected <> jsonb_array_length(COALESCE(p_request->'placementIds','[]'::jsonb)) OR (
    SELECT count(*) FROM public.proposal_board_items placement
    JOIN public.proposal_boards board ON board.id=placement.board_id
    WHERE placement.id=ANY(COALESCE(v_placements,'{}'::uuid[]))
      AND board.project_id=v_old.project_id AND placement.project_ffe_item_id=v_old.id
  ) <> v_expected THEN RAISE EXCEPTION 'chosen placements must be distinct links to the predecessor'
    USING ERRCODE='integrity_constraint_violation'; END IF;
  UPDATE public.project_ffe_items SET design_disposition='superseded',updated_at=now() WHERE id=v_old.id;
  INSERT INTO public.project_ffe_items(
    project_id,project_room_id,product_id,name,ffe_category,item_type,status,quantity,
    unit_price_cents,line_total_cents,budget_min_cents,budget_max_cents,vendor_name,vendor_id,
    blocked,notes,sort_order,trade_price_cents,markup_percent,added_via,doc_code,custom_fields,
    selection_thread_id,supersedes_ffe_item_id,design_disposition,assignment_scope,role_identity
  ) SELECT project_id,project_room_id,COALESCE(v_new_product,product_id),
    COALESCE(NULLIF(btrim(p_request->>'name'),''),name),ffe_category,item_type,'specified',quantity,
    CASE WHEN v_new_product IS NULL THEN unit_price_cents ELSE COALESCE((SELECT price_retail FROM public.products WHERE id=v_new_product),0) END,
    quantity*CASE WHEN v_new_product IS NULL THEN COALESCE(unit_price_cents,0) ELSE COALESCE((SELECT price_retail FROM public.products WHERE id=v_new_product),0) END,
    budget_min_cents,budget_max_cents,
    CASE WHEN v_new_product IS NULL THEN vendor_name ELSE (SELECT vendor.name FROM public.products product LEFT JOIN public.vendors vendor ON vendor.id=product.vendor_id WHERE product.id=v_new_product) END,
    CASE WHEN v_new_product IS NULL THEN vendor_id ELSE (SELECT vendor_id FROM public.products WHERE id=v_new_product) END,
    false,NULL,sort_order,
    CASE WHEN v_new_product IS NULL THEN trade_price_cents ELSE COALESCE((SELECT price_trade FROM public.products WHERE id=v_new_product),(SELECT price_retail FROM public.products WHERE id=v_new_product),0) END,
    markup_percent,'replacement',doc_code,custom_fields,selection_thread_id,id,'selected',assignment_scope,role_identity
  FROM public.project_ffe_items WHERE id=v_old.id RETURNING * INTO v_new;
  INSERT INTO public.project_ffe_specs(ffe_item_id,routing_source,updated_by)
  VALUES(v_new.id,jsonb_build_object('supersedesSelectionId',v_old.id),auth.uid()) ON CONFLICT DO NOTHING;
  IF v_expected>0 THEN
    UPDATE public.proposal_board_items SET project_ffe_item_id=v_new.id,product_id=v_new.product_id
    WHERE id=ANY(v_placements) AND project_ffe_item_id=v_old.id;
    GET DIAGNOSTICS v_updated=ROW_COUNT;
    IF v_updated<>v_expected THEN RAISE EXCEPTION 'not every chosen placement was repointed'
      USING ERRCODE='integrity_constraint_violation'; END IF;
  END IF;
  RETURN jsonb_build_object('predecessorSelectionId',v_old.id,'selectionId',v_new.id,
    'threadId',v_new.selection_thread_id,'repointedPlacementIds',to_jsonb(COALESCE(v_placements,'{}'::uuid[])));
END;
$$;

CREATE OR REPLACE FUNCTION public.start_purchase_order_change(p_request jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp' AS $$
DECLARE v_po_id uuid:=NULLIF(p_request->>'purchaseOrderId','')::uuid; v_item_id uuid:=NULLIF(p_request->>'selectionId','')::uuid;
  v_vendor_id uuid:=NULLIF(p_request->>'replacementVendorId','')::uuid; v_kind text:=p_request->>'changeKind';
  v_reason text:=btrim(COALESCE(p_request->>'reason','')); v_po public.purchase_orders%ROWTYPE;
  v_item public.project_ffe_items%ROWTYPE; v_change public.purchase_order_changes%ROWTYPE; v_rebuildable boolean;
BEGIN
  SELECT * INTO v_po FROM public.purchase_orders WHERE id=v_po_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'purchase order not found' USING ERRCODE='no_data_found'; END IF;
  PERFORM public._ffe_require_studio_project(v_po.project_id);
  IF v_kind NOT IN ('vendor_change','cancellation','credit','claim','remedy','new_scope') OR char_length(v_reason)<5 THEN
    RAISE EXCEPTION 'invalid purchase order change' USING ERRCODE='check_violation'; END IF;
  IF v_kind='vendor_change' AND (v_vendor_id IS NULL OR v_vendor_id=v_po.vendor_id OR NOT EXISTS(SELECT 1 FROM public.vendors WHERE id=v_vendor_id)) THEN
    RAISE EXCEPTION 'vendor change requires a different valid vendor' USING ERRCODE='check_violation'; END IF;
  IF v_item_id IS NOT NULL THEN
    SELECT * INTO v_item FROM public.project_ffe_items
    WHERE id=v_item_id AND project_id=v_po.project_id AND purchase_order_id=v_po.id FOR UPDATE;
    IF NOT FOUND OR v_item.vendor_id IS DISTINCT FROM v_po.vendor_id THEN
      RAISE EXCEPTION 'selection is not a vendor-matched line on the purchase order'
        USING ERRCODE='integrity_constraint_violation'; END IF;
  END IF;
  IF v_item.status IN ('delivered','installed') AND v_kind NOT IN ('claim','remedy','new_scope') THEN
    RAISE EXCEPTION 'delivered or installed selections require claim, remedy, or new scope'
      USING ERRCODE='check_violation'; END IF;
  v_rebuildable:=v_po.status='draft' AND v_po.sent_at IS NULL AND v_po.acknowledged_at IS NULL
    AND NOT EXISTS(SELECT 1 FROM public.po_payments payment WHERE payment.purchase_order_id=v_po.id AND payment.state='paid');
  INSERT INTO public.purchase_order_changes(
    project_id,purchase_order_id,project_ffe_item_id,change_kind,reason,prior_snapshot,requested_vendor_id,created_by
  ) VALUES(v_po.project_id,v_po.id,v_item_id,v_kind,v_reason,
    jsonb_build_object('purchaseOrder',to_jsonb(v_po),'selection',CASE WHEN v_item_id IS NULL THEN NULL ELSE to_jsonb(v_item) END),
    v_vendor_id,auth.uid()) RETURNING * INTO v_change;
  IF v_rebuildable AND v_kind IN ('vendor_change','cancellation') THEN
    UPDATE public.project_ffe_items SET purchase_order_id=NULL,updated_at=now() WHERE purchase_order_id=v_po.id;
    UPDATE public.purchase_orders SET status='cancelled',updated_at=now() WHERE id=v_po.id;
  END IF;
  RETURN jsonb_build_object('changeId',v_change.id,'purchaseOrderId',v_po.id,'rebuildable',v_rebuildable,
    'requiresImmutableFollowup',NOT v_rebuildable,'replacementVendorId',v_vendor_id);
END;
$$;

CREATE OR REPLACE FUNCTION public._reconcile_activated_ffe_placements(p_project_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp' AS $$
BEGIN
  UPDATE public.project_boards board SET items=COALESCE((
    SELECT jsonb_agg(CASE WHEN element->'data'->>'proposalItemId' ~* '^[0-9a-f-]{36}$' AND selection.id IS NOT NULL
      THEN element||jsonb_build_object('project_ffe_item_id',selection.id) ELSE element END ORDER BY ordinal)
    FROM jsonb_array_elements(board.items) WITH ORDINALITY entry(element,ordinal)
    LEFT JOIN public.project_ffe_items selection ON selection.project_id=p_project_id
      AND selection.source_proposal_item_id=CASE WHEN element->'data'->>'proposalItemId' ~* '^[0-9a-f-]{36}$'
        THEN (element->'data'->>'proposalItemId')::uuid END
  ),'[]'::jsonb) WHERE board.project_id=p_project_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.continue_board_in_project(p_project_board_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp' AS $$
DECLARE v_source public.project_boards%ROWTYPE; v_new_id uuid; v_expected integer; v_updated integer;
BEGIN
  SELECT * INTO v_source FROM public.project_boards WHERE id=p_project_board_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'board not found or not accessible' USING ERRCODE='insufficient_privilege'; END IF;
  PERFORM public._ffe_require_studio_project(v_source.project_id);
  v_new_id:=public._continue_board_in_project_v1_impl(p_project_board_id);
  UPDATE public.proposal_boards SET project_room_id=v_source.project_room_id WHERE id=v_new_id;
  WITH source_items AS (
    SELECT ordinality,CASE WHEN value->>'project_ffe_item_id' ~* '^[0-9a-f-]{36}$'
      THEN (value->>'project_ffe_item_id')::uuid END AS selection_id
    FROM jsonb_array_elements(v_source.items) WITH ORDINALITY entry(value,ordinality)
  ), target_items AS (
    SELECT id,row_number() OVER(ORDER BY created_at,id) AS ordinality
    FROM public.proposal_board_items WHERE board_id=v_new_id
  )
  UPDATE public.proposal_board_items target SET project_ffe_item_id=source.selection_id,
    data=target.data-'project_ffe_item_id'
  FROM target_items mapped JOIN source_items source USING(ordinality)
  WHERE target.id=mapped.id AND source.selection_id IS NOT NULL;
  GET DIAGNOSTICS v_updated=ROW_COUNT;
  SELECT count(*) INTO v_expected FROM jsonb_array_elements(v_source.items) value
  WHERE value->>'project_ffe_item_id' ~* '^[0-9a-f-]{36}$';
  IF v_updated<>v_expected THEN RAISE EXCEPTION 'continued board selection linkage is incomplete'
    USING ERRCODE='integrity_constraint_violation'; END IF;
  RETURN v_new_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.stage_project_ffe_import(p_request jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp' AS $$
DECLARE v_project_id uuid:=NULLIF(p_request->>'projectId','')::uuid; v_hash text:=lower(p_request->>'fileHash');
  v_kind text:=lower(p_request->>'sourceKind'); v_rows jsonb:=p_request->'rows'; v_batch public.project_ffe_import_batches%ROWTYPE;
  v_row jsonb; v_ordinal integer:=0; v_room_id uuid; v_errors jsonb; v_quantity integer;
BEGIN
  PERFORM public._ffe_require_studio_project(v_project_id);
  IF v_hash !~ '^[0-9a-f]{64}$' OR v_kind NOT IN ('csv','xls','xlsx') OR jsonb_typeof(v_rows)<>'array'
     OR jsonb_array_length(v_rows)>5000 THEN RAISE EXCEPTION 'invalid import envelope' USING ERRCODE='check_violation'; END IF;
  SELECT * INTO v_batch FROM public.project_ffe_import_batches WHERE project_id=v_project_id AND file_hash=v_hash FOR UPDATE;
  IF FOUND THEN RETURN jsonb_build_object('batchId',v_batch.id,'status',v_batch.status,'rowCount',v_batch.row_count,'reused',true); END IF;
  INSERT INTO public.project_ffe_import_batches(project_id,source_kind,file_hash,row_count,staged_by)
  VALUES(v_project_id,v_kind,v_hash,jsonb_array_length(v_rows),auth.uid()) RETURNING * INTO v_batch;
  FOR v_row IN SELECT value FROM jsonb_array_elements(v_rows) LOOP
    v_ordinal:=v_ordinal+1; v_errors:='[]'::jsonb; v_room_id:=NULL;
    IF jsonb_typeof(v_row)<>'object' THEN RAISE EXCEPTION 'import row % must be an object',v_ordinal USING ERRCODE='check_violation'; END IF;
    IF EXISTS(SELECT 1 FROM jsonb_each_text(v_row) field WHERE field.value ~ '^[[:space:][:cntrl:]]*(=|\+|@|-[A-Za-z])') THEN
      v_errors:=v_errors||jsonb_build_array('formula_like_value'); END IF;
    IF NULLIF(btrim(v_row->>'roomName'),'') IS NOT NULL THEN
      SELECT id INTO v_room_id FROM public.project_rooms WHERE project_id=v_project_id
        AND lower(btrim(name))=lower(btrim(v_row->>'roomName')) ORDER BY sort_order,id LIMIT 1;
      IF v_room_id IS NULL THEN v_errors:=v_errors||jsonb_build_array('unknown_room'); END IF;
    END IF;
    IF NULLIF(btrim(v_row->>'name'),'') IS NULL AND NULLIF(v_row->>'productId','') IS NULL THEN
      v_errors:=v_errors||jsonb_build_array('missing_name'); END IF;
    IF NULLIF(v_row->>'productId','') IS NOT NULL AND v_row->>'productId' !~* '^[0-9a-f-]{36}$' THEN
      v_errors:=v_errors||jsonb_build_array('invalid_product_id'); END IF;
    IF NULLIF(v_row->>'quantity','') IS NOT NULL AND v_row->>'quantity' !~ '^[1-9][0-9]*$' THEN
      v_errors:=v_errors||jsonb_build_array('invalid_quantity'); END IF;
    v_quantity:=CASE WHEN COALESCE(v_row->>'quantity','') ~ '^[1-9][0-9]*$' THEN (v_row->>'quantity')::integer ELSE 1 END;
    INSERT INTO public.project_ffe_import_rows(batch_id,row_ordinal,raw_row,normalized_row,project_room_id,
      assignment_scope,duplicate_mode,imported_approval_text,validation_errors)
    VALUES(v_batch.id,v_ordinal,v_row,jsonb_strip_nulls(jsonb_build_object(
      'name',NULLIF(btrim(v_row->>'name'),''),'category',NULLIF(btrim(v_row->>'category'),''),
      'productId',NULLIF(v_row->>'productId',''),'quantity',v_quantity)),v_room_id,
      CASE WHEN v_room_id IS NOT NULL THEN 'room' END,NULL,NULLIF(v_row->>'approved',''),v_errors);
  END LOOP;
  RETURN jsonb_build_object('batchId',v_batch.id,'status','staged','rowCount',v_ordinal,'reused',false);
END;
$$;

CREATE OR REPLACE FUNCTION public.commit_project_ffe_import(p_batch_id uuid,p_decisions jsonb DEFAULT '[]'::jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp' AS $$
DECLARE v_batch public.project_ffe_import_batches%ROWTYPE; v_decision jsonb; v_row public.project_ffe_import_rows%ROWTYPE;
  v_result jsonb; v_results jsonb:='[]'::jsonb; v_response jsonb; v_count integer:=0;
BEGIN
  SELECT * INTO v_batch FROM public.project_ffe_import_batches WHERE id=p_batch_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'import batch not found' USING ERRCODE='no_data_found'; END IF;
  PERFORM public._ffe_require_studio_project(v_batch.project_id);
  IF v_batch.status='committed' THEN RETURN COALESCE(v_batch.commit_response,
    jsonb_build_object('batchId',v_batch.id,'status','committed','committedCount',v_batch.row_count,'results','[]'::jsonb)); END IF;
  IF v_batch.status<>'staged' OR jsonb_typeof(p_decisions)<>'array' THEN RAISE EXCEPTION 'import batch is not committable' USING ERRCODE='check_violation'; END IF;
  FOR v_decision IN SELECT value FROM jsonb_array_elements(p_decisions) LOOP
    IF v_decision->>'rowOrdinal' !~ '^[1-9][0-9]*$' OR (NULLIF(v_decision->>'roomId','') IS NOT NULL AND v_decision->>'roomId' !~* '^[0-9a-f-]{36}$') THEN
      RAISE EXCEPTION 'invalid import decision' USING ERRCODE='check_violation'; END IF;
    UPDATE public.project_ffe_import_rows SET project_room_id=NULLIF(v_decision->>'roomId','')::uuid,
      assignment_scope=v_decision->>'assignmentScope',duplicate_mode=v_decision->>'duplicateMode',
      validation_errors=CASE WHEN v_decision ? 'roomId' OR v_decision->>'assignmentScope' IN ('throughout','unassigned')
        THEN COALESCE((SELECT jsonb_agg(error) FROM jsonb_array_elements(validation_errors) error
          WHERE error#>>'{}'<>'unknown_room'),'[]'::jsonb) ELSE validation_errors END
    WHERE batch_id=v_batch.id AND row_ordinal=(v_decision->>'rowOrdinal')::integer;
  END LOOP;
  IF EXISTS(SELECT 1 FROM public.project_ffe_import_rows row WHERE row.batch_id=v_batch.id AND (
    jsonb_array_length(row.validation_errors)>0 OR row.assignment_scope IS NULL OR row.duplicate_mode IS NULL
    OR (row.assignment_scope='room' AND (row.project_room_id IS NULL OR NOT EXISTS(
      SELECT 1 FROM public.project_rooms room WHERE room.id=row.project_room_id AND room.project_id=v_batch.project_id)))
    OR (row.assignment_scope<>'room' AND row.project_room_id IS NOT NULL)
  )) THEN RAISE EXCEPTION 'every import row requires valid room and duplicate decisions' USING ERRCODE='check_violation'; END IF;
  FOR v_row IN SELECT * FROM public.project_ffe_import_rows WHERE batch_id=v_batch.id ORDER BY row_ordinal LOOP
    v_result:=public.place_product_in_project_v2(jsonb_strip_nulls(jsonb_build_object(
      'projectId',v_batch.project_id,'productId',v_row.normalized_row->>'productId','name',v_row.normalized_row->>'name',
      'category',v_row.normalized_row->>'category','quantity',v_row.normalized_row->>'quantity',
      'roomId',v_row.project_room_id,'assignmentScope',v_row.assignment_scope,'duplicateMode',v_row.duplicate_mode,
      'disposition','candidate','source',CASE WHEN v_batch.source_kind='pdf' THEN 'document-extraction' ELSE 'spreadsheet-import' END,
      'sourceMetadata',jsonb_build_object('batchId',v_batch.id,'rowOrdinal',v_row.row_ordinal,
        'importedApprovalText',v_row.imported_approval_text,'sourceAssetId',v_batch.source_asset_id),
      'idempotencyKey','import:'||v_batch.id::text||':'||v_row.row_ordinal::text
    )));
    UPDATE public.project_ffe_import_rows SET committed_ffe_item_id=(v_result->>'selectionId')::uuid WHERE id=v_row.id;
    v_results:=v_results||jsonb_build_array(v_result||jsonb_build_object('rowOrdinal',v_row.row_ordinal)); v_count:=v_count+1;
  END LOOP;
  v_response:=jsonb_build_object('batchId',v_batch.id,'status','committed','committedCount',v_count,'results',v_results);
  UPDATE public.project_ffe_import_batches SET status='committed',committed_at=now(),updated_at=now(),commit_response=v_response WHERE id=v_batch.id;
  RETURN v_response;
END;
$$;

REVOKE ALL ON FUNCTION public._ffe_strict_client_fields(jsonb),
  public._place_product_in_project_v2_00438_impl(jsonb)
FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.revoke_project_review_access(uuid,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.revoke_project_review_access(uuid,text) TO authenticated;
REVOKE ALL ON FUNCTION public.place_product_in_project_v2(jsonb),
  public.place_product_in_project(uuid,uuid,uuid,uuid,text,jsonb),
  public.publish_project_review(jsonb),public.get_client_project_selections(uuid),
  public.get_client_project_review_bundle(uuid),public.record_project_review_feedback(uuid,text,text),
  public.supersede_project_selection(jsonb),public.start_purchase_order_change(jsonb),
  public.continue_board_in_project(uuid),public.stage_project_ffe_import(jsonb),
  public.commit_project_ffe_import(uuid,jsonb)
FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.place_product_in_project_v2(jsonb),
  public.place_product_in_project(uuid,uuid,uuid,uuid,text,jsonb),
  public.publish_project_review(jsonb),public.get_client_project_selections(uuid),
  public.get_client_project_review_bundle(uuid),public.record_project_review_feedback(uuid,text,text),
  public.supersede_project_selection(jsonb),public.start_purchase_order_change(jsonb),
  public.continue_board_in_project(uuid),public.stage_project_ffe_import(jsonb),
  public.commit_project_ffe_import(uuid,jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_client_project_selections(uuid),
  public.get_client_project_review_bundle(uuid) TO service_role;
