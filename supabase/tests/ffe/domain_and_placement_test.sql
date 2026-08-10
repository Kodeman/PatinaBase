-- FF&E GA selection, placement, import, and ownership contract (00434-00435).
BEGIN;
SET LOCAL statement_timeout='30s';

CREATE OR REPLACE FUNCTION pg_temp.assume_ffe_actor(p_actor uuid)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',p_actor,'role','authenticated')::text,true);
  PERFORM set_config('request.jwt.claim.sub',p_actor::text,true);
  PERFORM set_config('request.jwt.claim.role','authenticated',true);
END; $$;

INSERT INTO auth.users(id,email,encrypted_password,email_confirmed_at,created_at,updated_at,instance_id,aud,role) VALUES
('f5000000-0000-4000-8000-000000000001','ffe-owner@test.invalid','',now(),now(),now(),'00000000-0000-0000-0000-000000000000','authenticated','authenticated'),
('f5000000-0000-4000-8000-000000000002','ffe-client@test.invalid','',now(),now(),now(),'00000000-0000-0000-0000-000000000000','authenticated','authenticated'),
('f5000000-0000-4000-8000-000000000003','ffe-other@test.invalid','',now(),now(),now(),'00000000-0000-0000-0000-000000000000','authenticated','authenticated');
INSERT INTO public.profiles(id,email,full_name) VALUES
('f5000000-0000-4000-8000-000000000001','ffe-owner@test.invalid','FFE Owner'),
('f5000000-0000-4000-8000-000000000002','ffe-client@test.invalid','FFE Client'),
('f5000000-0000-4000-8000-000000000003','ffe-other@test.invalid','FFE Other')
ON CONFLICT(id) DO UPDATE SET email=excluded.email;
INSERT INTO public.projects(id,name,designer_id,client_id,created_by) VALUES
('f5100000-0000-4000-8000-000000000001','FFE Project','f5000000-0000-4000-8000-000000000001','f5000000-0000-4000-8000-000000000002','f5000000-0000-4000-8000-000000000001'),
('f5100000-0000-4000-8000-000000000002','Other Project','f5000000-0000-4000-8000-000000000003',NULL,'f5000000-0000-4000-8000-000000000003');
INSERT INTO public.project_rooms(id,project_id,name,sort_order) VALUES
('f5200000-0000-4000-8000-000000000001','f5100000-0000-4000-8000-000000000001','Living Room',0),
('f5200000-0000-4000-8000-000000000002','f5100000-0000-4000-8000-000000000002','Foreign Room',0);
INSERT INTO public.vendors(id,name) VALUES('f5300000-0000-4000-8000-000000000001','FFE Vendor');
INSERT INTO public.products(id,name,price_retail,price_trade,images,vendor_id,captured_by,captured_at,layer,status) VALUES
('f5400000-0000-4000-8000-000000000001','FFE Chair',120000,80000,ARRAY['https://example.invalid/chair.jpg'],'f5300000-0000-4000-8000-000000000001','f5000000-0000-4000-8000-000000000001',now(),'catalog','published');

DO $$
DECLARE v_board1 uuid; v_board2 uuid; v_other_board uuid; v_first jsonb; v_second jsonb; v_duplicate jsonb; v_import jsonb; v_batch uuid;
BEGIN
  PERFORM pg_temp.assume_ffe_actor('f5000000-0000-4000-8000-000000000001');
  v_board1:=(public.create_project_board('{"projectId":"f5100000-0000-4000-8000-000000000001","roomId":"f5200000-0000-4000-8000-000000000001","name":"Room board"}'::jsonb)->>'boardId')::uuid;
  v_board2:=(public.create_project_board('{"projectId":"f5100000-0000-4000-8000-000000000001","name":"Project board"}'::jsonb)->>'boardId')::uuid;
  PERFORM pg_temp.assume_ffe_actor('f5000000-0000-4000-8000-000000000003');
  v_other_board:=(public.create_project_board('{"projectId":"f5100000-0000-4000-8000-000000000002","name":"Foreign"}'::jsonb)->>'boardId')::uuid;
  PERFORM pg_temp.assume_ffe_actor('f5000000-0000-4000-8000-000000000001');

  v_first:=public.place_product_in_project_v2(jsonb_build_object(
    'projectId','f5100000-0000-4000-8000-000000000001','productId','f5400000-0000-4000-8000-000000000001',
    'roomId','f5200000-0000-4000-8000-000000000001','assignmentScope','room','boardId',v_board1,
    'disposition','selected','duplicateMode','create','idempotencyKey','ffe-place-first'
  ));
  v_second:=public.place_product_in_project_v2(jsonb_build_object(
    'projectId','f5100000-0000-4000-8000-000000000001','productId','f5400000-0000-4000-8000-000000000001',
    'selectionReferenceId',v_first->>'selectionId','assignmentScope','room','roomId','f5200000-0000-4000-8000-000000000001',
    'boardId',v_board2,'disposition','selected','duplicateMode','reuse','idempotencyKey','ffe-place-second-board'
  ));
  ASSERT v_first->>'outcome'='created' AND v_second->>'outcome'='reused','placement outcomes must be exact';
  ASSERT (SELECT count(*)=1 FROM public.project_ffe_items WHERE project_id='f5100000-0000-4000-8000-000000000001'),'one selection must serve multiple boards';
  ASSERT (SELECT count(*)=2 FROM public.proposal_board_items WHERE project_ffe_item_id=(v_first->>'selectionId')::uuid),'both placements must link the same selection';

  BEGIN
    PERFORM public.place_product_in_project_v2(jsonb_build_object(
      'projectId','f5100000-0000-4000-8000-000000000001','productId','f5400000-0000-4000-8000-000000000001',
      'selectionReferenceId',v_first->>'selectionId','assignmentScope','room','roomId','f5200000-0000-4000-8000-000000000001',
      'boardId',v_other_board,'disposition','selected','duplicateMode','reuse','idempotencyKey','ffe-cross-project-board'
    ));
    RAISE EXCEPTION 'cross-project placement unexpectedly succeeded';
  EXCEPTION WHEN integrity_constraint_violation OR insufficient_privilege THEN NULL; END;

  v_duplicate:=public.place_product_in_project_v2(jsonb_build_object(
    'projectId','f5100000-0000-4000-8000-000000000001','productId','f5400000-0000-4000-8000-000000000001',
    'assignmentScope','throughout','disposition','candidate','duplicateMode','create','idempotencyKey','ffe-legitimate-duplicate'
  ));
  ASSERT v_duplicate->>'outcome'='created' AND v_duplicate->>'selectionId'<>v_first->>'selectionId','explicit duplicate must create an independent selection';

  v_import:=public.stage_project_ffe_import('{"projectId":"f5100000-0000-4000-8000-000000000001","sourceKind":"csv","fileHash":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","rows":[{"name":"Imported table","roomName":"Unknown","approved":"approved"}]}'::jsonb);
  v_batch:=(v_import->>'batchId')::uuid;
  BEGIN
    PERFORM public.commit_project_ffe_import(v_batch,'[]'::jsonb);
    RAISE EXCEPTION 'unresolved import unexpectedly committed';
  EXCEPTION WHEN check_violation THEN NULL; END;
  PERFORM public.commit_project_ffe_import(v_batch,'[{"rowOrdinal":1,"assignmentScope":"unassigned","duplicateMode":"create"}]'::jsonb);
  ASSERT (SELECT design_disposition='candidate' AND assignment_scope='unassigned' FROM public.project_ffe_items WHERE id=(SELECT committed_ffe_item_id FROM public.project_ffe_import_rows WHERE batch_id=v_batch AND row_ordinal=1)),'imported approved text must remain nonauthoritative provenance';
END; $$;

DO $$
BEGIN
  ASSERT NOT has_function_privilege('anon','public.place_product_in_project_v2(jsonb)','EXECUTE'),'anon must not execute placement';
  ASSERT (SELECT count(*)=2 FROM public.project_ffe_items WHERE project_id='f5100000-0000-4000-8000-000000000001' AND design_disposition='selected') IS FALSE,'at most one selected row per independent thread is not a global-project constraint';
  ASSERT NOT EXISTS(
    SELECT 1 FROM public.project_ffe_items child JOIN public.project_ffe_items parent ON parent.id=child.supersedes_ffe_item_id
    WHERE child.project_id<>parent.project_id OR child.selection_thread_id<>parent.selection_thread_id
  ),'replacement lineage must stay within project/thread';
END; $$;

SET LOCAL ROLE authenticated;
SELECT pg_temp.assume_ffe_actor('f5000000-0000-4000-8000-000000000002');
DO $$ BEGIN
  ASSERT (SELECT count(*)=0 FROM public.project_ffe_items WHERE project_id='f5100000-0000-4000-8000-000000000001'),'client raw FF&E read must fail closed';
  ASSERT jsonb_array_length(public.get_client_project_selections('f5100000-0000-4000-8000-000000000001')->'selections')>0,'curated client reader must remain available';
END; $$;
RESET ROLE;
ROLLBACK;
