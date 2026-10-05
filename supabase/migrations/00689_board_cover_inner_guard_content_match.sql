-- ═══════════════════════════════════════════════════════════════════════════
-- 00689 — Board cover save accepts a reused review derivative (SQ-385)
-- Lineage: public._apply_board_room_state_00456_impl — the 00454 wrapper,
--          renamed by 00457 → 00689 (this file)
--
-- THE BUG. A project board's cover save failed with SQLSTATE 23000 'board
-- cover derivative does not match its stable working path' (seen during the
-- SQ-364 deck lay-out e2e). It happens on any project board, not only on deck
-- import.
--
-- prepare_project_review_media_asset dedups derivatives by content (00546). A
-- cover whose rendered bytes equal an earlier cover in the same project gets
-- the earlier derivative back. That derivative's source_asset_id names the
-- earlier working upload, not the fresh path the client then saves as
-- coverImageUrl. 00546 restated the cover guard on content identity in the
-- outer apply_board_room_state wrapper, but 00457 had renamed the 00454
-- wrapper to _apply_board_room_state_00456_impl, and that inner layer still
-- ran the old guard on source_asset_id identity. The outer check passed and
-- the inner one raised. Because the client renders each retry to a new path,
-- every retry also reused the derivative and failed the same way.
--
-- THE FIX. The inner guard uses the same content match as 00546's outer
-- guard: the cover path must be a working asset of this project whose
-- checksum equals the named derivative's checksum. The path-shape check and
-- the call into _apply_board_room_state_00453_impl do not change. The inner
-- guard also runs when an ordinary autosave re-sends the stored cover pair,
-- so a cover saved after a reuse survives later layout saves.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public._apply_board_room_state_00456_impl(
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
    JOIN public.project_ffe_media_assets source
      ON source.project_id = derivative.project_id
     AND source.checksum_sha256 = derivative.checksum_sha256
    WHERE derivative.id = v_cover_asset AND derivative.project_id = p_owner_id
      AND source.project_id = p_owner_id AND source.storage_path = v_cover_path
  ) THEN
    RAISE EXCEPTION 'board cover derivative does not match its stable working path'
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  PERFORM public._apply_board_room_state_00453_impl(p_board_id, p_owner_kind, p_owner_id, p_state);
END;
$$;

-- Grants are unchanged (CREATE OR REPLACE keeps them); restated as in 00457.
REVOKE ALL ON FUNCTION public._apply_board_room_state_00456_impl(uuid, text, uuid, jsonb)
  FROM PUBLIC, anon, authenticated, service_role;
