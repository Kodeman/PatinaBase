-- RC-7 lane E8 (X04): a studio photographic cover for F01's job. One active
-- project board whose cover is a private project-ffe-working key in the
-- board's own folder (<project>/boards/<board>/…, the only bare key
-- guard_proposal_board_media_reference accepts for a project board), so the
-- studio's commission plate goes through the product's signing path
-- (use-commission-plates → signProjectWorkingBoardRow). The spec uploads the
-- frozen reference cover photograph (assets/room.png) to that key first.
-- Owned stack only: the caller prefixes rc7OwnedStackSql(), which refuses
-- unless rc7_owned.stack names RC7_OWNED_STACK. F01's global
-- teardown removes the board with the job (ON DELETE CASCADE).
BEGIN;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.projects WHERE id = 'f0180000-0000-4000-8000-000000000010'
                 AND designer_id = 'f0180000-0000-4000-8000-000000000002') THEN
    RAISE EXCEPTION 'rc7-e8 cover fixture needs the round8 F01 job';
  END IF;
END $$;
DELETE FROM public.proposal_boards WHERE id = 'e8e80000-0000-4000-8000-000000000001';
INSERT INTO public.proposal_boards(id, project_id, name, cover_image_url, status)
VALUES ('e8e80000-0000-4000-8000-000000000001', 'f0180000-0000-4000-8000-000000000010',
        'RC7-E8 living room concept', 'f0180000-0000-4000-8000-000000000010/boards/e8e80000-0000-4000-8000-000000000001/room.png', 'active');
COMMIT;
