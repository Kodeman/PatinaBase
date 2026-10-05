-- Board cover save when the cover's review derivative is REUSED (SQ-385, 00689).
--
-- prepare_project_review_media_asset dedups derivatives by content (00546): a
-- second byte-identical cover upload under a fresh working path gets the FIRST
-- upload's derivative back, whose source_asset_id still names the first
-- working row. apply_board_room_state must accept that pair. Before 00689 the
-- outer wrapper (00546) accepted it, but the inner layer
-- _apply_board_room_state_00456_impl (the 00454 wrapper, renamed by 00457)
-- still demanded source_asset_id identity and raised 23000 'board cover
-- derivative does not match its stable working path'.
BEGIN;
SET LOCAL statement_timeout='30s';
CREATE OR REPLACE FUNCTION pg_temp.assume_cover_actor(p_actor uuid) RETURNS void LANGUAGE plpgsql AS $$ BEGIN
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',p_actor,'role','authenticated')::text,true);
  PERFORM set_config('request.jwt.claim.sub',p_actor::text,true);
END; $$;
GRANT EXECUTE ON FUNCTION pg_temp.assume_cover_actor(uuid) TO PUBLIC;

INSERT INTO auth.users(id,email,encrypted_password,email_confirmed_at,created_at,updated_at,instance_id,aud,role) VALUES
('fc000000-0000-4000-8000-000000000001','cover-reuse-owner@test.invalid','',now(),now(),now(),'00000000-0000-0000-0000-000000000000','authenticated','authenticated');
INSERT INTO public.profiles(id,email,full_name) VALUES
('fc000000-0000-4000-8000-000000000001','cover-reuse-owner@test.invalid','Cover Reuse Owner') ON CONFLICT DO NOTHING;
INSERT INTO public.organizations(id,name,slug,type,status) VALUES
('fc400000-0000-4000-8000-000000000001','Cover Reuse Studio','cover-reuse-studio','design_studio','active');
INSERT INTO public.organization_members(user_id,organization_id,role,status) VALUES
('fc000000-0000-4000-8000-000000000001','fc400000-0000-4000-8000-000000000001','owner','active');
INSERT INTO public.user_roles(user_id,role_id,granted_by)
SELECT 'fc000000-0000-4000-8000-000000000001',role.id,'fc000000-0000-4000-8000-000000000001'
FROM public.roles AS role WHERE role.name='studio_owner';
INSERT INTO public.projects(id,name,designer_id,created_by,studio_id) VALUES
('fc100000-0000-4000-8000-000000000001','Cover Reuse Project','fc000000-0000-4000-8000-000000000001','fc000000-0000-4000-8000-000000000001','fc400000-0000-4000-8000-000000000001');

-- Two cover uploads with identical bytes (first / second), one with other bytes.
INSERT INTO public.project_ffe_media_assets(id,project_id,storage_path,media_kind,checksum_sha256,size_bytes,content_type,created_by) VALUES
('fc200000-0000-4000-8000-000000000001','fc100000-0000-4000-8000-000000000001','fc100000-0000-4000-8000-000000000001/mood-boards/covers/cover-first.png','board_reference',repeat('c',64),4000,'image/png','fc000000-0000-4000-8000-000000000001'),
('fc200000-0000-4000-8000-000000000002','fc100000-0000-4000-8000-000000000001','fc100000-0000-4000-8000-000000000001/mood-boards/covers/cover-second.png','board_reference',repeat('c',64),4000,'image/png','fc000000-0000-4000-8000-000000000001'),
('fc200000-0000-4000-8000-000000000003','fc100000-0000-4000-8000-000000000001','fc100000-0000-4000-8000-000000000001/mood-boards/covers/cover-other.png','board_reference',repeat('e',64),4100,'image/png','fc000000-0000-4000-8000-000000000001');
-- The content-addressed derivative, first prepared from the FIRST upload.
INSERT INTO public.project_review_media_assets(id,project_id,source_asset_id,storage_path,derivative_kind,checksum_sha256,size_bytes,content_type,width,height,prepared_by) VALUES
('fc300000-0000-4000-8000-000000000001','fc100000-0000-4000-8000-000000000001','fc200000-0000-4000-8000-000000000001','fc100000-0000-4000-8000-000000000001/prepared/display/'||repeat('c',64)||'.png','display',repeat('c',64),4000,'image/png',1200,800,'fc000000-0000-4000-8000-000000000001');

DO $$
DECLARE v_board jsonb; v_board_id uuid;
BEGIN
  PERFORM pg_temp.assume_cover_actor('fc000000-0000-4000-8000-000000000001');
  v_board:=public.create_project_board('{"projectId":"fc100000-0000-4000-8000-000000000001","name":"Cover reuse"}'::jsonb);
  v_board_id:=(v_board->>'boardId')::uuid;

  -- The cover write after a reuse: SECOND path + the shared derivative, carrying
  -- the whole room (a section and a pin) the way board-room-shell sends it.
  PERFORM public.apply_board_room_state(v_board_id,'project','fc100000-0000-4000-8000-000000000001',jsonb_build_object(
    'name','Cover reuse','canvasWidth',1200,'canvasHeight',800,'backgroundColor','#FAF8F5',
    'coverImageUrl','fc100000-0000-4000-8000-000000000001/mood-boards/covers/cover-second.png',
    'coverReviewMediaAssetId','fc300000-0000-4000-8000-000000000001',
    'sections',jsonb_build_array(jsonb_build_object('id','fc-section','name','Living')),
    'items',jsonb_build_array(jsonb_build_object('id','fc500000-0000-4000-8000-000000000001','type','note','x',10,'y',10,'width',200,
      'content','Keep the oak','data',jsonb_build_object('section_id','fc-section')))));
  ASSERT (SELECT cover_image_url='fc100000-0000-4000-8000-000000000001/mood-boards/covers/cover-second.png'
    AND cover_review_media_asset_id='fc300000-0000-4000-8000-000000000001'
    FROM public.proposal_boards WHERE id=v_board_id),
    'a byte-identical cover under a fresh path must save with the reused derivative';
  ASSERT (SELECT count(*)=1 FROM public.proposal_board_items WHERE board_id=v_board_id),
    'the cover save must persist the pin it carried';
  ASSERT (SELECT jsonb_array_length(sections)=1 FROM public.proposal_boards WHERE id=v_board_id),
    'the cover save must persist the section it carried';

  -- Ordinary autosave (no cover keys) re-validates the stored pair and keeps it.
  PERFORM public.apply_board_room_state(v_board_id,'project','fc100000-0000-4000-8000-000000000001',jsonb_build_object(
    'name','Cover reuse','canvasWidth',1400,'canvasHeight',900,'backgroundColor','#FAF8F5','sections','[]'::jsonb,'items','[]'::jsonb));
  ASSERT (SELECT cover_image_url='fc100000-0000-4000-8000-000000000001/mood-boards/covers/cover-second.png'
    AND cover_review_media_asset_id='fc300000-0000-4000-8000-000000000001' AND canvas_width=1400
    FROM public.proposal_boards WHERE id=v_board_id),
    'a layout autosave must keep a reused cover pair';

  -- A path whose bytes differ from the derivative is still refused.
  BEGIN
    PERFORM public.apply_board_room_state(v_board_id,'project','fc100000-0000-4000-8000-000000000001',jsonb_build_object(
      'name','Cover reuse','canvasWidth',1400,'canvasHeight',900,'backgroundColor','#FAF8F5','sections','[]'::jsonb,'items','[]'::jsonb,
      'coverImageUrl','fc100000-0000-4000-8000-000000000001/mood-boards/covers/cover-other.png',
      'coverReviewMediaAssetId','fc300000-0000-4000-8000-000000000001'));
    RAISE EXCEPTION 'cover with mismatched bytes was accepted';
  EXCEPTION WHEN integrity_constraint_violation THEN NULL; END;
  -- So is a path that is not a registered working asset at all.
  BEGIN
    PERFORM public.apply_board_room_state(v_board_id,'project','fc100000-0000-4000-8000-000000000001',jsonb_build_object(
      'name','Cover reuse','canvasWidth',1400,'canvasHeight',900,'backgroundColor','#FAF8F5','sections','[]'::jsonb,'items','[]'::jsonb,
      'coverImageUrl','fc100000-0000-4000-8000-000000000001/mood-boards/covers/unregistered.png',
      'coverReviewMediaAssetId','fc300000-0000-4000-8000-000000000001'));
    RAISE EXCEPTION 'cover with an unregistered path was accepted';
  EXCEPTION WHEN integrity_constraint_violation THEN NULL; END;
END; $$;
ROLLBACK;
