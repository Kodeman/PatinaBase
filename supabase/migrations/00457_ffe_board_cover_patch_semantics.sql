-- 00457 — Preserve prepared project board covers across ordinary state autosaves.

ALTER FUNCTION public.apply_board_room_state(uuid, text, uuid, jsonb)
  RENAME TO _apply_board_room_state_00456_impl;
REVOKE ALL ON FUNCTION public._apply_board_room_state_00456_impl(uuid, text, uuid, jsonb)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.apply_board_room_state(
  p_board_id uuid,
  p_owner_kind text,
  p_owner_id uuid,
  p_state jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_state jsonb := COALESCE(p_state, '{}'::jsonb);
  v_has_cover_path boolean := v_state ? 'coverImageUrl';
  v_has_cover_asset boolean := v_state ? 'coverReviewMediaAssetId';
  v_cover_path text;
  v_cover_asset uuid;
  v_existing_path text;
  v_existing_asset uuid;
BEGIN
  IF p_owner_kind = 'project' THEN
    PERFORM public._ffe_require_studio_project(p_owner_id);
    SELECT cover_image_url, cover_review_media_asset_id
    INTO v_existing_path, v_existing_asset
    FROM public.proposal_boards
    WHERE id = p_board_id AND project_id = p_owner_id AND proposal_id IS NULL
    FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'project board unavailable'
        USING ERRCODE = 'insufficient_privilege';
    END IF;

    IF NOT v_has_cover_path AND NOT v_has_cover_asset THEN
      v_state := v_state || jsonb_build_object(
        'coverImageUrl', v_existing_path,
        'coverReviewMediaAssetId', v_existing_asset
      );
    ELSIF NOT v_has_cover_path THEN
      RAISE EXCEPTION 'cover derivative cannot change without coverImageUrl'
        USING ERRCODE = 'check_violation';
    ELSE
      v_cover_path := NULLIF(btrim(v_state->>'coverImageUrl'), '');
      IF v_cover_path IS NULL THEN
        v_state := v_state || jsonb_build_object(
          'coverImageUrl', NULL,
          'coverReviewMediaAssetId', NULL
        );
      ELSE
        IF NOT v_has_cover_asset
           OR v_state->>'coverReviewMediaAssetId' !~* '^[0-9a-f-]{36}$' THEN
          RAISE EXCEPTION 'project board cover requires its prepared review derivative'
            USING ERRCODE = 'check_violation';
        END IF;
        v_cover_asset := (v_state->>'coverReviewMediaAssetId')::uuid;
        IF NOT EXISTS (
          SELECT 1 FROM public.project_review_media_assets derivative
          JOIN public.project_ffe_media_assets source ON source.id = derivative.source_asset_id
          WHERE derivative.id = v_cover_asset AND derivative.project_id = p_owner_id
            AND source.project_id = p_owner_id AND source.storage_path = v_cover_path
        ) THEN
          RAISE EXCEPTION 'board cover derivative does not match its stable working path'
            USING ERRCODE = 'integrity_constraint_violation';
        END IF;
      END IF;
    END IF;
  END IF;

  PERFORM public._apply_board_room_state_00456_impl(
    p_board_id, p_owner_kind, p_owner_id, v_state
  );
END;
$$;

REVOKE ALL ON FUNCTION public.apply_board_room_state(uuid, text, uuid, jsonb)
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.apply_board_room_state(uuid, text, uuid, jsonb)
  TO authenticated;
