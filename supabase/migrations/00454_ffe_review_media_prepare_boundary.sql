-- Materialized 2026-08-12 from Strata's migration ledger (applied out-of-band; git had no source file). Do not re-run manually.

-- 00454 — Register verified working bytes and prepared private review derivatives.

CREATE OR REPLACE FUNCTION public.authorize_project_review_media_source(
  p_project_id uuid,
  p_actor_id uuid,
  p_source_bucket text,
  p_source_path text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE v_project public.projects%ROWTYPE; v_source public.project_ffe_media_assets%ROWTYPE;
BEGIN
  SELECT * INTO v_project FROM public.projects WHERE id = p_project_id;
  IF NOT FOUND OR NOT public._ffe_is_studio_actor(v_project.designer_id, p_actor_id)
     OR p_source_bucket <> 'project-ffe-working'
     OR p_source_path NOT LIKE p_project_id::text || '/%'
     OR p_source_path LIKE '%..%' OR p_source_path LIKE '%\%' THEN
    RAISE EXCEPTION 'project review media source is not authorized'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT * INTO v_source FROM public.project_ffe_media_assets
  WHERE project_id = p_project_id AND storage_bucket = p_source_bucket
    AND storage_path = p_source_path;
  IF NOT FOUND OR v_source.checksum_sha256 IS NULL OR v_source.size_bytes IS NULL
     OR v_source.content_type IS NULL THEN
    RAISE EXCEPTION 'verified project review media source is not registered'
      USING ERRCODE = 'no_data_found';
  END IF;
  RETURN jsonb_build_object(
    'sourceAssetId', v_source.id, 'projectId', p_project_id, 'actorId', p_actor_id,
    'bucket', v_source.storage_bucket, 'path', v_source.storage_path,
    'checksumSha256', v_source.checksum_sha256, 'sizeBytes', v_source.size_bytes,
    'contentType', v_source.content_type, 'width', NULL, 'height', NULL
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.prepare_project_review_media_asset(
  p_project_id uuid,
  p_actor_id uuid,
  p_source_bucket text,
  p_source_path text,
  p_source_checksum text,
  p_source_size bigint,
  p_content_type text,
  p_derivative_bucket text,
  p_derivative_path text,
  p_derivative_checksum text,
  p_derivative_size bigint,
  p_derivative_kind text,
  p_width integer,
  p_height integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_project public.projects%ROWTYPE;
  v_source public.project_ffe_media_assets%ROWTYPE;
  v_asset public.project_review_media_assets%ROWTYPE;
  v_derivative_content_type text;
  v_inserted integer;
  v_reused boolean := false;
BEGIN
  SELECT * INTO v_project FROM public.projects WHERE id = p_project_id FOR SHARE;
  IF NOT FOUND OR NOT public._ffe_is_studio_actor(v_project.designer_id, p_actor_id) THEN
    RAISE EXCEPTION 'project review media actor is not authorized'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_source_bucket <> 'project-ffe-working'
     OR p_derivative_bucket <> 'project-review-media'
     OR p_source_path NOT LIKE p_project_id::text || '/%'
     OR p_derivative_path NOT LIKE p_project_id::text || '/%'
     OR p_source_path LIKE '%..%' OR p_derivative_path LIKE '%..%'
     OR p_source_path LIKE '%\%' OR p_derivative_path LIKE '%\%'
     OR p_source_checksum !~ '^[0-9a-f]{64}$'
     OR p_derivative_checksum !~ '^[0-9a-f]{64}$'
     OR position(p_derivative_checksum IN p_derivative_path) = 0
     OR p_source_size < 0 OR p_derivative_size <= 0
     OR p_content_type NOT IN ('application/pdf','image/jpeg','image/png','image/webp')
     OR p_derivative_kind NOT IN ('thumbnail','display','print')
     OR p_width IS NULL OR p_width <= 0 OR p_height IS NULL OR p_height <= 0
  THEN
    RAISE EXCEPTION 'invalid project review media registration envelope'
      USING ERRCODE = 'check_violation';
  END IF;
  v_derivative_content_type := CASE
    WHEN lower(p_derivative_path) LIKE '%.webp' THEN 'image/webp'
    WHEN lower(p_derivative_path) LIKE '%.png' THEN 'image/png'
    WHEN lower(p_derivative_path) LIKE '%.jpg' OR lower(p_derivative_path) LIKE '%.jpeg' THEN 'image/jpeg'
  END;
  IF v_derivative_content_type IS NULL THEN
    RAISE EXCEPTION 'review derivative path must end in webp, png, jpg, or jpeg'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO v_source FROM public.project_ffe_media_assets
  WHERE storage_bucket = p_source_bucket AND storage_path = p_source_path FOR UPDATE;
  IF NOT FOUND OR v_source.project_id IS DISTINCT FROM p_project_id
     OR v_source.checksum_sha256 IS DISTINCT FROM p_source_checksum
     OR v_source.size_bytes IS DISTINCT FROM p_source_size
     OR v_source.content_type IS DISTINCT FROM p_content_type THEN
    RAISE EXCEPTION 'working media registration does not match verified stored bytes'
      USING ERRCODE = 'data_exception';
  END IF;

  INSERT INTO public.project_review_media_assets(
    project_id, source_asset_id, storage_bucket, storage_path, derivative_kind,
    checksum_sha256, size_bytes, content_type, width, height, prepared_by
  ) VALUES (
    p_project_id, v_source.id, p_derivative_bucket, p_derivative_path, p_derivative_kind,
    p_derivative_checksum, p_derivative_size, v_derivative_content_type,
    p_width, p_height, p_actor_id
  ) ON CONFLICT (storage_bucket, storage_path) DO NOTHING
  RETURNING * INTO v_asset;
  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  IF v_inserted = 0 THEN
    v_reused := true;
    SELECT * INTO STRICT v_asset FROM public.project_review_media_assets
    WHERE storage_bucket = p_derivative_bucket AND storage_path = p_derivative_path FOR UPDATE;
    IF v_asset.project_id IS DISTINCT FROM p_project_id
       OR v_asset.source_asset_id IS DISTINCT FROM v_source.id
       OR v_asset.derivative_kind IS DISTINCT FROM p_derivative_kind
       OR v_asset.checksum_sha256 IS DISTINCT FROM p_derivative_checksum
       OR v_asset.size_bytes IS DISTINCT FROM p_derivative_size
       OR v_asset.content_type IS DISTINCT FROM v_derivative_content_type
       OR v_asset.width IS DISTINCT FROM p_width OR v_asset.height IS DISTINCT FROM p_height THEN
      RAISE EXCEPTION 'review derivative registration does not match verified stored bytes'
        USING ERRCODE = 'data_exception';
    END IF;
  END IF;
  RETURN jsonb_build_object(
    'assetId', v_asset.id, 'sourceAssetId', v_source.id, 'projectId', p_project_id,
    'bucket', v_asset.storage_bucket, 'path', v_asset.storage_path,
    'checksumSha256', v_asset.checksum_sha256, 'sizeBytes', v_asset.size_bytes,
    'contentType', v_asset.content_type, 'derivativeKind', v_asset.derivative_kind,
    'width', v_asset.width, 'height', v_asset.height, 'reused', v_reused
  );
END;
$$;

ALTER FUNCTION public.apply_board_room_state(uuid, text, uuid, jsonb)
  RENAME TO _apply_board_room_state_00453_impl;

REVOKE ALL ON FUNCTION public._apply_board_room_state_00453_impl(uuid, text, uuid, jsonb)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.apply_board_room_state(
  p_board_id uuid, p_owner_kind text, p_owner_id uuid, p_state jsonb
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $$
DECLARE
  v_cover_path text := NULLIF(btrim(p_state->>'coverImageUrl'), '');
  v_cover_asset uuid := CASE WHEN p_state->>'coverReviewMediaAssetId' ~* '^[0-9a-f-]{36}$'
    THEN (p_state->>'coverReviewMediaAssetId')::uuid END;
BEGIN
  IF p_owner_kind = 'project' AND v_cover_path IS NOT NULL AND (
    v_cover_path NOT LIKE p_owner_id::text || '/%'
    OR v_cover_path LIKE '%://%' OR v_cover_path LIKE '%?%'
    OR v_cover_path LIKE '%..%' OR v_cover_path LIKE '%\%'
  ) THEN
    RAISE EXCEPTION 'project board cover must persist a stable private project path'
      USING ERRCODE = 'check_violation';
  END IF;
  IF p_owner_kind = 'project' AND v_cover_asset IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.project_review_media_assets derivative
    JOIN public.project_ffe_media_assets source ON source.id = derivative.source_asset_id
    WHERE derivative.id = v_cover_asset AND derivative.project_id = p_owner_id
      AND source.project_id = p_owner_id AND source.storage_path = v_cover_path
  ) THEN
    RAISE EXCEPTION 'board cover derivative does not match its stable working path'
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  PERFORM public._apply_board_room_state_00453_impl(p_board_id, p_owner_kind, p_owner_id, p_state);
END;
$$;

REVOKE ALL ON FUNCTION public.authorize_project_review_media_source(uuid, uuid, text, text),
  public.prepare_project_review_media_asset(
  uuid, uuid, text, text, text, bigint, text, text, text, text,
  bigint, text, integer, integer
) FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.authorize_project_review_media_source(uuid, uuid, text, text),
  public.prepare_project_review_media_asset(
  uuid, uuid, text, text, text, bigint, text, text, text, text,
  bigint, text, integer, integer
) TO service_role;

REVOKE ALL ON FUNCTION public.apply_board_room_state(uuid, text, uuid, jsonb)
  FROM PUBLIC, anon, service_role;

GRANT EXECUTE ON FUNCTION public.apply_board_room_state(uuid, text, uuid, jsonb)
  TO authenticated;
