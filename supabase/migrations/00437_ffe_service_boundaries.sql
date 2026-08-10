-- 00437 — Authenticated edge-function boundaries for extraction, review media,
-- and explicit review delivery.

ALTER TABLE public.project_ffe_import_batches
  ADD COLUMN IF NOT EXISTS source_asset_id uuid
    REFERENCES public.project_ffe_media_assets(id) ON DELETE RESTRICT;

ALTER TABLE public.project_review_delivery_attempts
  ADD COLUMN IF NOT EXISTS requested_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS provider_message_id text;

CREATE OR REPLACE FUNCTION public._ffe_is_studio_actor(
  p_owner_id uuid,
  p_actor_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT p_owner_id IS NOT NULL AND p_actor_id IS NOT NULL AND (
    p_owner_id = p_actor_id
    OR EXISTS (
      SELECT 1
      FROM public.organization_members actor_membership
      JOIN public.organization_members owner_membership
        ON owner_membership.organization_id = actor_membership.organization_id
      JOIN public.organizations studio
        ON studio.id = actor_membership.organization_id
      WHERE actor_membership.user_id = p_actor_id
        AND actor_membership.status = 'active'
        AND actor_membership.role <> 'guest'
        AND owner_membership.user_id = p_owner_id
        AND owner_membership.status = 'active'
        AND owner_membership.role <> 'guest'
        AND studio.type = 'design_studio'
        AND studio.status = 'active'
    )
  );
$$;

CREATE OR REPLACE FUNCTION public.get_project_review_media_manifest(
  p_edition_id uuid,
  p_client_id uuid
)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT COALESCE(jsonb_agg(DISTINCT jsonb_build_object(
    'assetId', asset.id,
    'bucket', asset.storage_bucket,
    'path', asset.storage_path,
    'checksumSha256', asset.checksum_sha256,
    'sizeBytes', asset.size_bytes,
    'contentType', asset.content_type
  )), '[]'::jsonb)
  FROM public.project_review_editions edition
  JOIN public.projects project ON project.id = edition.project_id
  JOIN public.project_review_items item ON item.edition_id = edition.id
  CROSS JOIN LATERAL jsonb_array_elements(item.media_manifest) media
  JOIN public.project_review_media_assets asset ON asset.id = (media->>'id')::uuid
  WHERE edition.id = p_edition_id
    AND edition.status IN ('published', 'superseded', 'finalized')
    AND project.client_id = p_client_id
    AND asset.project_id = edition.project_id;
$$;

CREATE OR REPLACE FUNCTION public.authorize_project_review_media(
  p_edition_id uuid,
  p_actor_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_edition public.project_review_editions%ROWTYPE;
  v_project public.projects%ROWTYPE;
BEGIN
  SELECT * INTO v_edition
  FROM public.project_review_editions
  WHERE id = p_edition_id
    AND status IN ('published', 'superseded', 'finalized');
  IF NOT FOUND THEN
    RAISE EXCEPTION 'published review not found'
      USING ERRCODE = 'no_data_found';
  END IF;

  SELECT * INTO STRICT v_project
  FROM public.projects
  WHERE id = v_edition.project_id;
  IF p_actor_id IS NULL OR v_project.client_id IS DISTINCT FROM p_actor_id THEN
    RAISE EXCEPTION 'review media not accessible'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN jsonb_build_object(
    'editionId', v_edition.id,
    'projectId', v_project.id,
    'actorId', p_actor_id,
    'media', public.get_project_review_media_manifest(v_edition.id, p_actor_id)
  );
END;
$$;

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
    AND asset.content_type = 'application/pdf';

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

  SELECT * INTO v_batch
  FROM public.project_ffe_import_batches
  WHERE project_id = p_project_id AND file_hash = v_hash
  FOR UPDATE;
  IF FOUND THEN
    IF v_batch.source_kind <> 'pdf' OR v_batch.source_asset_id IS DISTINCT FROM p_asset_id THEN
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
    p_project_id, 'pdf', p_asset_id, v_hash, jsonb_array_length(p_rows), p_actor_id
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

CREATE OR REPLACE FUNCTION public.prepare_project_review_delivery(
  p_edition_id uuid,
  p_actor_id uuid,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_edition public.project_review_editions%ROWTYPE;
  v_project public.projects%ROWTYPE;
  v_attempt public.project_review_delivery_attempts%ROWTYPE;
  v_client_email text;
  v_inserted integer;
  v_claimed boolean := false;
  v_outcome text;
BEGIN
  IF p_actor_id IS NULL
     OR NULLIF(btrim(p_idempotency_key), '') IS NULL
     OR char_length(p_idempotency_key) > 200
  THEN
    RAISE EXCEPTION 'delivery actor and idempotency key are required'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO v_edition
  FROM public.project_review_editions
  WHERE id = p_edition_id
  FOR UPDATE;
  IF NOT FOUND OR v_edition.status <> 'published' THEN
    RAISE EXCEPTION 'published review not found'
      USING ERRCODE = 'no_data_found';
  END IF;
  SELECT * INTO STRICT v_project FROM public.projects WHERE id = v_edition.project_id;
  IF NOT public._ffe_is_studio_actor(v_project.designer_id, p_actor_id) THEN
    RAISE EXCEPTION 'review delivery not accessible'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT profile.email INTO v_client_email
  FROM public.profiles profile
  WHERE profile.id = v_project.client_id;
  IF NULLIF(btrim(v_client_email), '') IS NULL THEN
    RAISE EXCEPTION 'project client has no delivery email'
      USING ERRCODE = 'check_violation';
  END IF;

  INSERT INTO public.project_review_delivery_attempts(
    edition_id, idempotency_key, status, requested_by
  ) VALUES (
    v_edition.id, btrim(p_idempotency_key), 'pending', p_actor_id
  )
  ON CONFLICT (edition_id, idempotency_key) DO NOTHING
  RETURNING * INTO v_attempt;
  GET DIAGNOSTICS v_inserted = ROW_COUNT;

  IF v_inserted = 1 THEN
    v_claimed := true;
    v_outcome := 'claimed';
  ELSE
    SELECT * INTO STRICT v_attempt
    FROM public.project_review_delivery_attempts
    WHERE edition_id = v_edition.id
      AND idempotency_key = btrim(p_idempotency_key)
    FOR UPDATE;
    IF v_attempt.status = 'failed'
       OR (v_attempt.status = 'pending' AND v_attempt.attempted_at < now() - interval '10 minutes')
    THEN
      UPDATE public.project_review_delivery_attempts
      SET status = 'pending', error_code = NULL, completed_at = NULL,
          attempted_at = now(), requested_by = p_actor_id
      WHERE id = v_attempt.id
      RETURNING * INTO v_attempt;
      v_claimed := true;
      v_outcome := 'claimed';
    ELSIF v_attempt.status = 'sent' THEN
      v_outcome := 'already_sent';
    ELSE
      v_outcome := 'in_progress';
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'attemptId', v_attempt.id,
    'editionId', v_edition.id,
    'projectId', v_project.id,
    'status', v_attempt.status,
    'outcome', v_outcome,
    'claimed', v_claimed,
    'recipient', jsonb_build_object('clientId', v_project.client_id, 'email', v_client_email),
    'review', jsonb_build_object(
      'title', v_edition.title,
      'editionNumber', v_edition.edition_number,
      'reviewPath', '/projects/' || v_project.id::text || '/reviews/' || v_edition.id::text
    )
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_project_review_delivery_sent(
  p_attempt_id uuid,
  p_actor_id uuid,
  p_error_code text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_attempt public.project_review_delivery_attempts%ROWTYPE;
  v_owner_id uuid;
  v_status text;
BEGIN
  SELECT attempt.*
  INTO v_attempt
  FROM public.project_review_delivery_attempts attempt
  JOIN public.project_review_editions edition ON edition.id = attempt.edition_id
  JOIN public.projects project ON project.id = edition.project_id
  WHERE attempt.id = p_attempt_id
  FOR UPDATE OF attempt;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'review delivery attempt not found or not accessible'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT project.designer_id INTO STRICT v_owner_id
  FROM public.project_review_editions edition
  JOIN public.projects project ON project.id = edition.project_id
  WHERE edition.id = v_attempt.edition_id;
  IF NOT public._ffe_is_studio_actor(v_owner_id, p_actor_id) THEN
    RAISE EXCEPTION 'review delivery attempt not found or not accessible'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF v_attempt.status = 'sent' THEN
    IF p_error_code IS NOT NULL THEN
      RAISE EXCEPTION 'a sent delivery cannot be marked failed'
        USING ERRCODE = 'check_violation';
    END IF;
    RETURN jsonb_build_object('attemptId', v_attempt.id, 'status', 'sent', 'reused', true);
  END IF;
  IF v_attempt.status <> 'pending' THEN
    RAISE EXCEPTION 'delivery attempt must be claimed before completion'
      USING ERRCODE = 'check_violation';
  END IF;

  v_status := CASE WHEN NULLIF(btrim(p_error_code), '') IS NULL THEN 'sent' ELSE 'failed' END;
  UPDATE public.project_review_delivery_attempts
  SET status = v_status,
      error_code = CASE WHEN v_status = 'failed' THEN left(btrim(p_error_code), 120) END,
      completed_at = now()
  WHERE id = v_attempt.id;
  RETURN jsonb_build_object('attemptId', v_attempt.id, 'status', v_status, 'reused', false);
END;
$$;

CREATE OR REPLACE FUNCTION public.get_client_project_review_bundle(p_edition_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_edition public.project_review_editions%ROWTYPE;
  v_project public.projects%ROWTYPE;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'authentication required' USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT * INTO v_edition
  FROM public.project_review_editions
  WHERE id = p_edition_id AND status IN ('published', 'superseded', 'finalized');
  IF NOT FOUND THEN
    RAISE EXCEPTION 'published review not found' USING ERRCODE = 'no_data_found';
  END IF;
  SELECT * INTO STRICT v_project FROM public.projects WHERE id = v_edition.project_id;
  IF NOT (v_project.client_id = v_actor OR public.is_studio_comember(v_project.designer_id)) THEN
    RAISE EXCEPTION 'review not accessible' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN jsonb_build_object(
    'edition', jsonb_build_object(
      'id', v_edition.id, 'number', v_edition.edition_number,
      'title', v_edition.title, 'status', v_edition.status,
      'publishedAt', v_edition.published_at,
      'priceMode', v_edition.client_price_mode,
      'snapshotHash', v_edition.snapshot_hash
    ),
    'project', jsonb_build_object('id', v_project.id, 'name', v_project.name),
    'rooms', v_edition.room_snapshot,
    'boards', v_edition.board_snapshot,
    'items', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', item.id,
        'selectionId', item.source_ffe_item_id,
        'threadId', item.selection_thread_id,
        'snapshot', item.item_snapshot,
        'contentHash', item.content_hash,
        'feedback', COALESCE((
          SELECT jsonb_agg(jsonb_build_object(
            'id', feedback.id, 'verdict', feedback.verdict,
            'body', feedback.body, 'createdAt', feedback.created_at
          ) ORDER BY feedback.created_at)
          FROM public.item_feedback feedback
          WHERE feedback.project_review_item_id = item.id
            AND feedback.client_id = v_actor
        ), '[]'::jsonb)
      ) ORDER BY item.sort_order, item.id)
      FROM public.project_review_items item
      WHERE item.edition_id = v_edition.id
    ), '[]'::jsonb)
  );
END;
$$;

REVOKE ALL ON FUNCTION public._ffe_is_studio_actor(uuid, uuid),
  public.authorize_project_review_media(uuid, uuid),
  public.get_project_ffe_extract_upload(uuid, uuid, uuid),
  public.stage_project_ffe_document_extraction(uuid, uuid, uuid, text, jsonb),
  public.prepare_project_review_delivery(uuid, uuid, text),
  public.mark_project_review_delivery_sent(uuid, uuid, text)
FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.authorize_project_review_media(uuid, uuid),
  public.get_project_ffe_extract_upload(uuid, uuid, uuid),
  public.stage_project_ffe_document_extraction(uuid, uuid, uuid, text, jsonb),
  public.prepare_project_review_delivery(uuid, uuid, text),
  public.mark_project_review_delivery_sent(uuid, uuid, text)
TO service_role;

REVOKE ALL ON FUNCTION public.get_project_review_media_manifest(uuid, uuid)
FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_project_review_media_manifest(uuid, uuid)
TO service_role;
