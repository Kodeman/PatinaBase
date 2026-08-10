-- 00455 — Register verified private working media through an actor-bound service boundary.

CREATE OR REPLACE FUNCTION public.register_project_ffe_working_media_source(
  p_project_id uuid,
  p_actor_id uuid,
  p_bucket text,
  p_path text,
  p_checksum_sha256 text,
  p_size_bytes bigint,
  p_content_type text,
  p_media_kind text,
  p_ffe_item_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_project public.projects%ROWTYPE;
  v_asset public.project_ffe_media_assets%ROWTYPE;
  v_inserted integer;
  v_reused boolean := false;
BEGIN
  SELECT * INTO v_project FROM public.projects WHERE id = p_project_id FOR SHARE;
  IF NOT FOUND OR NOT public._ffe_is_studio_actor(v_project.designer_id, p_actor_id) THEN
    RAISE EXCEPTION 'working media actor is not authorized'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_bucket <> 'project-ffe-working'
     OR p_path NOT LIKE p_project_id::text || '/%'
     OR p_path LIKE '%://%' OR p_path LIKE '%?%'
     OR p_path LIKE '%..%' OR p_path LIKE '%\%'
     OR p_checksum_sha256 !~ '^[0-9a-f]{64}$'
     OR p_size_bytes <= 0
     OR p_content_type NOT IN ('application/pdf','image/jpeg','image/png','image/webp')
     OR p_media_kind NOT IN ('working','source_document','board_reference')
  THEN
    RAISE EXCEPTION 'invalid working media registration envelope'
      USING ERRCODE = 'check_violation';
  END IF;
  IF p_ffe_item_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.project_ffe_items item
    WHERE item.id = p_ffe_item_id AND item.project_id = p_project_id
  ) THEN
    RAISE EXCEPTION 'working media selection does not belong to project'
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;

  INSERT INTO public.project_ffe_media_assets(
    project_id, ffe_item_id, storage_bucket, storage_path, media_kind,
    checksum_sha256, size_bytes, content_type, created_by
  ) VALUES (
    p_project_id, p_ffe_item_id, p_bucket, p_path, p_media_kind,
    p_checksum_sha256, p_size_bytes, p_content_type, p_actor_id
  ) ON CONFLICT (storage_bucket, storage_path) DO NOTHING
  RETURNING * INTO v_asset;
  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  IF v_inserted = 0 THEN
    v_reused := true;
    SELECT * INTO STRICT v_asset FROM public.project_ffe_media_assets
    WHERE storage_bucket = p_bucket AND storage_path = p_path FOR UPDATE;
    IF v_asset.project_id IS DISTINCT FROM p_project_id
       OR v_asset.ffe_item_id IS DISTINCT FROM p_ffe_item_id
       OR v_asset.media_kind IS DISTINCT FROM p_media_kind
       OR v_asset.checksum_sha256 IS DISTINCT FROM p_checksum_sha256
       OR v_asset.size_bytes IS DISTINCT FROM p_size_bytes
       OR v_asset.content_type IS DISTINCT FROM p_content_type THEN
      RAISE EXCEPTION 'working media registration does not match verified stored bytes'
        USING ERRCODE = 'data_exception';
    END IF;
  END IF;
  RETURN jsonb_build_object(
    'sourceAssetId', v_asset.id, 'projectId', p_project_id, 'actorId', p_actor_id,
    'ffeItemId', v_asset.ffe_item_id, 'bucket', v_asset.storage_bucket,
    'path', v_asset.storage_path, 'checksumSha256', v_asset.checksum_sha256,
    'sizeBytes', v_asset.size_bytes, 'contentType', v_asset.content_type,
    'mediaKind', v_asset.media_kind, 'reused', v_reused
  );
END;
$$;

REVOKE ALL ON FUNCTION public.register_project_ffe_working_media_source(
  uuid, uuid, text, text, text, bigint, text, text, uuid
) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.register_project_ffe_working_media_source(
  uuid, uuid, text, text, text, bigint, text, text, uuid
) TO service_role;
