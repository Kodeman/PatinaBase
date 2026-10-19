-- 00831 — Freeze per-job item labels in future client review editions only.
-- Lineage: 00435 → 00439 snapshot builder → 00447 rename to
-- _publish_project_review_00446_impl. 00449's board wrapper was superseded
-- by 00511's hardened public publish_project_review; both wrapper layers stay
-- untouched. Re-graft the existing private snapshot core, adding only docCode.
-- Existing editions are never rewritten. The INSERT sanitizer still computes
-- the content hash from the client-safe snapshot, including its frozen label.
-- CREATE OR REPLACE retains the private core's existing ACL and signature.

CREATE OR REPLACE FUNCTION public._publish_project_review_00446_impl(p_request jsonb)
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
      'name',v_item.name,'docCode',v_item.doc_code,'category',v_item.ffe_category,'quantity',v_item.quantity,
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
