-- ═══════════════════════════════════════════════════════════════════════════
-- 00660 — The FF&E extractor's image branch: a registered photo of a tag is
--         an extraction source, and its batch is stamped `photo`, not `pdf`
-- Lineage (each body copied verbatim from the file named last, delta grafted):
--   get_project_ffe_extract_upload  00437 → here. Delta: the content_type
--     filter accepts the four types register_project_ffe_working_media_source
--     (00455) and the project-ffe-working bucket (00433) allow.
--   stage_project_ffe_document_extraction  00437 → here, under its PUBLIC
--     name. 00661 then renames this body to
--     _stage_project_ffe_document_extraction_00661_impl and wraps it, and
--     00666 replaces that wrapper; neither touches the renamed body, and the
--     wrapper passes every argument through, so source_kind reaches the impl
--     unchanged. Delta: source_kind comes from the upload's content type
--     instead of the 'pdf' literal, and the reuse guard compares against it.
--     The `reused` boolean the 00666 wrapper requires is returned unchanged.
--   _commit_project_ffe_import_00446_impl  00439 (as commit_project_ffe_import;
--     renamed by 00447) → here. Delta: a 'photo' batch places its rows as
--     'document-extraction', the label a 'pdf' batch already gets. Without it
--     a photo row would reach project_ffe_items.added_via as
--     'spreadsheet-import'. CREATE OR REPLACE keeps 00447's REVOKE ALL.
-- Must apply before 00661 and 00666 on every database (it does, by number).
-- It redefines nothing that 00661 or 00666 redefine.
-- Reconciles: none.
--
-- Contract: artifacts/ios27-delivery-plan-2026-09-23/execute/contracts/
--   CONTRACT-A-extractor.md §A.3. Registration of a camera upload as a
--   source_document (Contract B) needs no migration: 00455 already accepts
--   media_kind = 'source_document' and all four content types.
-- ═══════════════════════════════════════════════════════════════════════════

-- 00434 declared the check inline, so its name is whatever Postgres generated
-- on each database. Drop every check on the table that constrains source_kind,
-- then add the widened one under a fixed name.
DO $$
DECLARE
  v_name text;
BEGIN
  FOR v_name IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.project_ffe_import_batches'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) LIKE '%source_kind%'
  LOOP
    EXECUTE format('ALTER TABLE public.project_ffe_import_batches DROP CONSTRAINT %I', v_name);
  END LOOP;
END;
$$;

ALTER TABLE public.project_ffe_import_batches
  ADD CONSTRAINT project_ffe_import_batches_source_kind_check
  CHECK (source_kind IN ('csv', 'xls', 'xlsx', 'pdf', 'photo'));

CREATE OR REPLACE FUNCTION public.get_project_ffe_extract_upload(
  p_project_id uuid,
  p_asset_id uuid,
  p_actor_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_asset public.project_ffe_media_assets%ROWTYPE;
  v_owner_id uuid;
BEGIN
  SELECT asset.*
  INTO v_asset
  FROM public.projects project
  JOIN public.project_ffe_media_assets asset ON asset.project_id = project.id
  WHERE project.id = p_project_id
    AND asset.id = p_asset_id
    AND asset.storage_bucket = 'project-ffe-working'
    AND asset.media_kind = 'source_document'
    AND asset.content_type IN ('application/pdf', 'image/jpeg', 'image/png', 'image/webp');

  IF NOT FOUND THEN
    RAISE EXCEPTION 'PDF extraction upload not found or not accessible'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT designer_id INTO STRICT v_owner_id FROM public.projects WHERE id = p_project_id;
  IF NOT public._ffe_is_studio_actor(v_owner_id, p_actor_id) THEN
    RAISE EXCEPTION 'PDF extraction upload not found or not accessible'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF v_asset.checksum_sha256 IS NULL OR v_asset.size_bytes IS NULL THEN
    RAISE EXCEPTION 'PDF extraction upload must have a checksum and size'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN jsonb_build_object(
    'projectId', p_project_id,
    'actorId', p_actor_id,
    'assetId', v_asset.id,
    'bucket', v_asset.storage_bucket,
    'path', v_asset.storage_path,
    'checksumSha256', v_asset.checksum_sha256,
    'sizeBytes', v_asset.size_bytes,
    'contentType', v_asset.content_type
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.stage_project_ffe_document_extraction(
  p_project_id uuid,
  p_asset_id uuid,
  p_actor_id uuid,
  p_file_hash text,
  p_rows jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_upload jsonb;
  v_hash text := lower(p_file_hash);
  v_batch public.project_ffe_import_batches%ROWTYPE;
  v_row jsonb;
  v_ordinal integer := 0;
  v_room_id uuid;
  v_errors jsonb;
  v_page_text text;
  v_confidence_text text;
  v_quantity integer;
  v_source_kind text;
BEGIN
  v_upload := public.get_project_ffe_extract_upload(p_project_id, p_asset_id, p_actor_id);
  IF v_hash !~ '^[0-9a-f]{64}$'
     OR v_hash IS DISTINCT FROM v_upload->>'checksumSha256'
     OR jsonb_typeof(p_rows) <> 'array'
     OR jsonb_array_length(p_rows) > 5000
  THEN
    RAISE EXCEPTION 'invalid document extraction envelope'
      USING ERRCODE = 'check_violation';
  END IF;
  -- NULL for any other type, which the NOT NULL source_kind column refuses.
  v_source_kind := CASE
    WHEN v_upload->>'contentType' = 'application/pdf' THEN 'pdf'
    WHEN v_upload->>'contentType' IN ('image/jpeg', 'image/png', 'image/webp') THEN 'photo'
  END;

  SELECT * INTO v_batch
  FROM public.project_ffe_import_batches
  WHERE project_id = p_project_id AND file_hash = v_hash
  FOR UPDATE;
  IF FOUND THEN
    IF v_batch.source_kind IS DISTINCT FROM v_source_kind OR v_batch.source_asset_id IS DISTINCT FROM p_asset_id THEN
      RAISE EXCEPTION 'file hash is already staged from another source'
        USING ERRCODE = 'unique_violation';
    END IF;
    RETURN jsonb_build_object(
      'batchId', v_batch.id,
      'status', v_batch.status,
      'rowCount', v_batch.row_count,
      'sourceAssetId', v_batch.source_asset_id,
      'reused', true
    );
  END IF;

  INSERT INTO public.project_ffe_import_batches(
    project_id, source_kind, source_asset_id, file_hash, row_count, staged_by
  ) VALUES (
    p_project_id, v_source_kind, p_asset_id, v_hash, jsonb_array_length(p_rows), p_actor_id
  ) RETURNING * INTO v_batch;

  FOR v_row IN SELECT value FROM jsonb_array_elements(p_rows) LOOP
    v_ordinal := v_ordinal + 1;
    IF jsonb_typeof(v_row) <> 'object' THEN
      RAISE EXCEPTION 'document extraction row % must be an object', v_ordinal
        USING ERRCODE = 'check_violation';
    END IF;

    v_page_text := COALESCE(v_row->>'pageNumber', v_row->'provenance'->>'page');
    v_confidence_text := COALESCE(v_row->>'confidence', v_row->'provenance'->>'confidence');
    IF v_page_text !~ '^[1-9][0-9]*$'
       OR v_confidence_text !~ '^(0(\.[0-9]+)?|1(\.0+)?)$'
    THEN
      RAISE EXCEPTION 'document extraction row % requires page provenance and confidence', v_ordinal
        USING ERRCODE = 'check_violation';
    END IF;

    v_errors := '[]'::jsonb;
    v_room_id := NULL;
    IF EXISTS (
      SELECT 1 FROM jsonb_each_text(v_row) field
      WHERE field.value ~ '^[=+@]' OR field.value ~ '^-[A-Za-z]'
    ) THEN
      v_errors := v_errors || jsonb_build_array('formula_like_value');
    END IF;
    IF NULLIF(btrim(v_row->>'roomName'), '') IS NOT NULL THEN
      SELECT id INTO v_room_id
      FROM public.project_rooms
      WHERE project_id = p_project_id
        AND lower(btrim(name)) = lower(btrim(v_row->>'roomName'))
      ORDER BY sort_order, id
      LIMIT 1;
      IF v_room_id IS NULL THEN
        v_errors := v_errors || jsonb_build_array('unknown_room');
      END IF;
    END IF;
    IF NULLIF(btrim(v_row->>'name'), '') IS NULL
       AND NULLIF(v_row->>'productId', '') IS NULL
    THEN
      v_errors := v_errors || jsonb_build_array('missing_name');
    END IF;
    v_quantity := CASE
      WHEN COALESCE(v_row->>'quantity', '') ~ '^[1-9][0-9]*$'
        THEN (v_row->>'quantity')::integer
      ELSE 1
    END;

    INSERT INTO public.project_ffe_import_rows(
      batch_id, row_ordinal, raw_row, normalized_row, project_room_id,
      assignment_scope, duplicate_mode, imported_approval_text, validation_errors
    ) VALUES (
      v_batch.id,
      v_ordinal,
      v_row,
      jsonb_strip_nulls(jsonb_build_object(
        'name', NULLIF(btrim(v_row->>'name'), ''),
        'category', NULLIF(btrim(v_row->>'category'), ''),
        'productId', NULLIF(v_row->>'productId', ''),
        'quantity', v_quantity,
        'pageNumber', v_page_text::integer,
        'confidence', v_confidence_text::numeric
      )),
      v_room_id,
      CASE WHEN v_room_id IS NOT NULL THEN 'room' ELSE NULL END,
      NULL,
      NULLIF(v_row->>'approved', ''),
      v_errors
    );
  END LOOP;

  RETURN jsonb_build_object(
    'batchId', v_batch.id,
    'status', 'staged',
    'rowCount', v_ordinal,
    'sourceAssetId', p_asset_id,
    'reused', false
  );
END;
$$;

-- 00439 body; 00447 renamed it. Only the placement `source` CASE changes.
CREATE OR REPLACE FUNCTION public._commit_project_ffe_import_00446_impl(p_batch_id uuid,p_decisions jsonb DEFAULT '[]'::jsonb)
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
      'disposition','candidate','source',CASE WHEN v_batch.source_kind IN ('pdf','photo') THEN 'document-extraction' ELSE 'spreadsheet-import' END,
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
