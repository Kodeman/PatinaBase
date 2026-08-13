-- ═══════════════════════════════════════════════════════════════════════════
-- 00473 — Board-cover privacy guard recognizes prepared FF&E review derivatives
-- Lineage: public.board_media_reference_has_live_source — 00462 → 00473
-- Reconciles: 00462 × 00457. 00462's allow-list only knows the proposal-lane
--   shapes `<owner>/boards/<board_id>/…` and `<owner>/palettes/<proposal_id>/…`,
--   while 00457 lets a project board cover point at an FF&E working asset
--   (`<project>/source/…`) that has a prepared review derivative. Both are live
--   on prod, so every legitimate FF&E cover currently raises
--   'board cover references private media outside its design studio'.
--   The branch below re-states in the guard the same pairing 00457 validates in
--   apply_board_room_state: the path must BE a project_ffe_media_assets row that
--   a project_review_media_assets row of the same project derives from, and that
--   project's designer must share the target's studio. Anything else still fails
--   closed through the unchanged branches.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.board_media_reference_has_live_source(
  p_reference text,
  p_target_designer uuid DEFAULT NULL,
  p_target_studio uuid DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, storage, pg_temp
AS $$
DECLARE
  v_path text := public.board_storage_reference_path(p_reference);
  v_parts text[];
BEGIN
  -- Empty and external HTTPS media never crosses this private bucket boundary.
  IF v_path IS NULL THEN
    RETURN true;
  END IF;
  IF num_nonnulls(p_target_designer, p_target_studio) <> 1 THEN
    RETURN false;
  END IF;

  -- FF&E lane (00457): a project board cover names the working source asset,
  -- never the derivative. Its folder shape is `<project_id>/…`, which carries no
  -- 'boards'/'palettes' segment, so it is settled before the segment branches.
  IF EXISTS (
    SELECT 1
    FROM public.project_ffe_media_assets AS ffe_source
    JOIN public.project_review_media_assets AS derivative
      ON derivative.source_asset_id = ffe_source.id
     AND derivative.project_id = ffe_source.project_id
    JOIN public.projects AS source_project
      ON source_project.id = ffe_source.project_id
    WHERE ffe_source.storage_path = v_path
      AND public.board_media_owners_share_studio(
        source_project.designer_id, p_target_designer, p_target_studio
      )
  ) THEN
    RETURN true;
  END IF;

  v_parts := storage.foldername(v_path);
  IF array_length(v_parts, 1) < 3 THEN
    RETURN false;
  END IF;

  IF v_parts[2] = 'boards' AND EXISTS (
    SELECT 1
    FROM public.proposal_boards AS source_board
    LEFT JOIN public.proposals AS source_proposal
      ON source_proposal.id = source_board.proposal_id
    LEFT JOIN public.projects AS source_project
      ON source_project.id = source_board.project_id
    LEFT JOIN public.profiles AS media_owner
      ON media_owner.id::text = v_parts[1]
    WHERE source_board.id::text = v_parts[3]
      AND (
        v_parts[1] = COALESCE(
          source_board.proposal_id, source_board.project_id
        )::text
        OR public.board_media_owners_share_studio(
          media_owner.id,
          COALESCE(source_proposal.designer_id, source_project.designer_id),
          NULL
        )
      )
      AND public.board_media_owners_share_studio(
        COALESCE(source_proposal.designer_id, source_project.designer_id),
        p_target_designer,
        p_target_studio
      )
  ) THEN
    RETURN true;
  END IF;

  IF v_parts[2] = 'palettes' AND EXISTS (
    SELECT 1
    FROM public.proposals AS source_proposal
    WHERE source_proposal.id::text = v_parts[1]
      AND public.board_media_owners_share_studio(
        source_proposal.designer_id, p_target_designer, p_target_studio
      )
  ) THEN
    RETURN true;
  END IF;

  RETURN false;
END;
$$;

-- Same lockdown 00462 applied: reachable only through the definer guards.
REVOKE ALL ON FUNCTION public.board_media_reference_has_live_source(text, uuid, uuid)
  FROM PUBLIC, anon, authenticated, service_role;
