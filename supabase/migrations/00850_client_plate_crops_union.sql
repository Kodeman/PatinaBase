-- ═══════════════════════════════════════════════════════════════════════════
-- 00850 — retain crop unions across out-of-order plate settlements (SQ-1745)
-- Lineage: 00843 → 00848. The 00848 body is unchanged except for the crop
-- merge and optional framing snapshot. Flat crop names and their rev stamps
-- stay intact. Current-framing responses replace carried names; stale and
-- pre-upgrade responses add only absent names. Missing names are never lost.
-- The caller snapshots the exact framing it sent, not geometry read later.
-- Closed-job preservation, concept_seen promotion and lock order stay intact.
-- Drop the old signature so PostgREST's optional argument is unambiguous.
-- ═══════════════════════════════════════════════════════════════════════════
DROP FUNCTION IF EXISTS public.record_client_plate_asset(uuid, uuid, jsonb);

CREATE OR REPLACE FUNCTION public.record_client_plate_asset(
  p_request_id uuid,
  p_lease_token uuid,
  p_asset jsonb,
  p_framing jsonb DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_request public.client_plate_requests%ROWTYPE;
  v_sha256 text := p_asset ->> 'sha256';
  v_asset_id uuid;
  v_kept boolean := false;
BEGIN
  -- The project first, then the request (00843 header: lock order). Key
  -- share conflicts with the FOR UPDATE close_project and archive_project
  -- take, so the closed check below sees a close that won.
  PERFORM 1 FROM public.projects AS project
  WHERE project.id = (SELECT request.project_id FROM public.client_plate_requests AS request
                      WHERE request.id = p_request_id)
  FOR KEY SHARE;

  SELECT * INTO v_request
  FROM public.client_plate_requests
  WHERE id = p_request_id
  FOR UPDATE;
  IF NOT FOUND
     OR v_request.status <> 'leased'
     OR v_request.lease_token IS DISTINCT FROM p_lease_token
     OR v_request.lease_expires_at <= now() THEN
    RAISE EXCEPTION 'plate request % is not leased to this token', p_request_id
      USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;

  IF p_asset IS NULL OR jsonb_typeof(p_asset) <> 'object' THEN
    RAISE EXCEPTION 'plate asset must be an object' USING ERRCODE = 'check_violation';
  END IF;
  IF (p_asset ? 'source_kind' AND p_asset ->> 'source_kind' IS DISTINCT FROM v_request.source_kind)
     OR (p_asset ? 'source_ref' AND p_asset -> 'source_ref' IS DISTINCT FROM v_request.source_ref) THEN
    RAISE EXCEPTION 'plate asset names a different source than request %', p_request_id
      USING ERRCODE = 'check_violation';
  END IF;
  IF v_sha256 IS NULL
     OR NOT (COALESCE(p_asset ->> 'originalKey', '')
             LIKE 'plates/' || v_request.project_id::text || '/' || v_sha256 || '/%') THEN
    RAISE EXCEPTION 'plate original must sit under plates/<project>/<sha256>/'
      USING ERRCODE = 'check_violation';
  END IF;
  IF p_asset ? 'crops' AND jsonb_typeof(p_asset -> 'crops') <> 'object' THEN
    RAISE EXCEPTION 'plate crops must be an object' USING ERRCODE = 'check_violation';
  END IF;

  IF public._client_edition_closed(v_request.project_id) THEN
    SELECT asset.id INTO v_asset_id
    FROM public.client_plate_assets AS asset
    WHERE asset.project_id = v_request.project_id
      AND asset.sha256 = v_sha256
    FOR UPDATE;
    v_kept := FOUND;
  END IF;

  IF v_kept THEN
    -- Deliberate exception (R142): concept_seen only rises, even on a closed job's kept asset.
    UPDATE public.client_plate_assets
    SET concept_seen = true,
        updated_at = now()
    WHERE id = v_asset_id
      AND v_request.source_kind = 'concept'
      AND NOT concept_seen;
  ELSE
    INSERT INTO public.client_plate_assets AS asset (
      project_id, sha256, source_kind, source_ref, concept_seen, original_key,
      width, height, ground, dominant_hex, lqip, crops
    ) VALUES (
      v_request.project_id, v_sha256, v_request.source_kind, v_request.source_ref,
      v_request.source_kind = 'concept',
      p_asset ->> 'originalKey',
      (p_asset ->> 'width')::int, (p_asset ->> 'height')::int,
      p_asset ->> 'ground', p_asset ->> 'dominantHex', p_asset ->> 'lqip',
      COALESCE(p_asset -> 'crops', '{}'::jsonb)
    )
    ON CONFLICT (project_id, sha256) DO UPDATE
    SET concept_seen = asset.concept_seen OR EXCLUDED.concept_seen,
        original_key = EXCLUDED.original_key,
        width = EXCLUDED.width,
        height = EXCLUDED.height,
        ground = EXCLUDED.ground,
        dominant_hex = EXCLUDED.dominant_hex,
        lqip = EXCLUDED.lqip,
        -- Old edge versions send no snapshot: add-only during rollout.
        -- The upsert locks this row, so compare against its current framing.
        crops = asset.crops || COALESCE((
          SELECT jsonb_object_agg(incoming.key, incoming.value)
          FROM jsonb_each(EXCLUDED.crops) AS incoming
          WHERE NOT (asset.crops ? incoming.key)
             OR p_framing = jsonb_build_object('focal', to_jsonb(asset.focal),
                                               'subjectBox', to_jsonb(asset.subject_box))
        ), '{}'::jsonb),
        updated_at = now()
    RETURNING asset.id INTO v_asset_id;
  END IF;

  UPDATE public.client_plate_requests
  SET status = 'done',
      lease_token = NULL,
      lease_expires_at = NULL,
      last_error = NULL,
      asset_id = v_asset_id,
      close_reason = CASE WHEN v_kept THEN 'closed' END,
      updated_at = now()
  WHERE id = p_request_id;

  RETURN v_asset_id;
END;
$$;

REVOKE ALL ON FUNCTION public.record_client_plate_asset(uuid, uuid, jsonb, jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_client_plate_asset(uuid, uuid, jsonb, jsonb) TO service_role;
