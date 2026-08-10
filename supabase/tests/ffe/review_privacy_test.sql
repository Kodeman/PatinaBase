-- FF&E immutable review and privacy contract (00433-00435).
BEGIN;
SET LOCAL statement_timeout='30s';
CREATE OR REPLACE FUNCTION pg_temp.assume_review_actor(p_actor uuid) RETURNS void LANGUAGE plpgsql AS $$ BEGIN
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',p_actor,'role','authenticated')::text,true);
  PERFORM set_config('request.jwt.claim.sub',p_actor::text,true);
END; $$;
INSERT INTO auth.users(id,email,encrypted_password,email_confirmed_at,created_at,updated_at,instance_id,aud,role) VALUES
('f6000000-0000-4000-8000-000000000001','review-owner@test.invalid','',now(),now(),now(),'00000000-0000-0000-0000-000000000000','authenticated','authenticated'),
('f6000000-0000-4000-8000-000000000002','review-client@test.invalid','',now(),now(),now(),'00000000-0000-0000-0000-000000000000','authenticated','authenticated');
INSERT INTO public.profiles(id,email,full_name) VALUES
('f6000000-0000-4000-8000-000000000001','review-owner@test.invalid','Review Owner'),
('f6000000-0000-4000-8000-000000000002','review-client@test.invalid','Review Client') ON CONFLICT(id) DO NOTHING;
INSERT INTO public.projects(id,name,designer_id,client_id,created_by) VALUES
('f6100000-0000-4000-8000-000000000001','Review Project','f6000000-0000-4000-8000-000000000001','f6000000-0000-4000-8000-000000000002','f6000000-0000-4000-8000-000000000001');
INSERT INTO public.vendors(id,name) VALUES('f6200000-0000-4000-8000-000000000001','Private Trade Vendor');
INSERT INTO public.products(id,name,price_retail,price_trade,images,vendor_id,captured_by,captured_at,layer,status) VALUES
('f6300000-0000-4000-8000-000000000001','Review Sofa',500000,300000,ARRAY['https://example.invalid/sofa.jpg'],'f6200000-0000-4000-8000-000000000001','f6000000-0000-4000-8000-000000000001',now(),'catalog','published');

DO $$
DECLARE v_selection jsonb; v_first jsonb; v_second jsonb; v_first_id uuid; v_second_id uuid; v_review_item uuid; v_before text; v_bundle jsonb;
BEGIN
  PERFORM pg_temp.assume_review_actor('f6000000-0000-4000-8000-000000000001');
  v_selection:=public.place_product_in_project_v2('{"projectId":"f6100000-0000-4000-8000-000000000001","productId":"f6300000-0000-4000-8000-000000000001","assignmentScope":"throughout","disposition":"selected","duplicateMode":"create","idempotencyKey":"review-selection"}'::jsonb);
  v_first:=public.publish_project_review(jsonb_build_object('projectId','f6100000-0000-4000-8000-000000000001','title','Edition one','clientPriceMode','unit','boardIds','[]'::jsonb,'items',jsonb_build_array(jsonb_build_object('selectionId',v_selection->>'selectionId','clientFields',jsonb_build_object('note','For review')))));
  v_first_id:=(v_first->>'editionId')::uuid;
  SELECT id,content_hash INTO v_review_item,v_before FROM public.project_review_items WHERE edition_id=v_first_id;
  BEGIN UPDATE public.project_review_items SET client_fields='{"tampered":true}' WHERE id=v_review_item; RAISE EXCEPTION 'published item update unexpectedly succeeded'; EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN DELETE FROM public.project_review_items WHERE id=v_review_item; RAISE EXCEPTION 'published item delete unexpectedly succeeded'; EXCEPTION WHEN check_violation THEN NULL; END;
  ASSERT (SELECT content_hash=v_before FROM public.project_review_items WHERE id=v_review_item),'published snapshot hash must remain immutable';

  PERFORM pg_temp.assume_review_actor('f6000000-0000-4000-8000-000000000002');
  v_bundle:=public.get_client_project_review_bundle(v_first_id);
  ASSERT position('trade_price' in v_bundle::text)=0 AND position('tradePrice' in v_bundle::text)=0 AND position('markup' in v_bundle::text)=0,'client bundle must not expose trade cost or markup';
  PERFORM public.record_project_review_feedback(v_review_item,'approved',NULL);
  ASSERT (SELECT design_disposition='selected' AND status='specified' FROM public.project_ffe_items WHERE id=(v_selection->>'selectionId')::uuid),'review verdict must not change design/logistics authority';

  PERFORM pg_temp.assume_review_actor('f6000000-0000-4000-8000-000000000001');
  v_second:=public.publish_project_review(jsonb_build_object('projectId','f6100000-0000-4000-8000-000000000001','title','Edition two','clientPriceMode','hide','boardIds','[]'::jsonb,'items',jsonb_build_array(jsonb_build_object('selectionId',v_selection->>'selectionId'))));
  v_second_id:=(v_second->>'editionId')::uuid;
  ASSERT (SELECT status='superseded' FROM public.project_review_editions WHERE id=v_first_id),'republish must supersede prior edition';
  PERFORM pg_temp.assume_review_actor('f6000000-0000-4000-8000-000000000002');
  BEGIN PERFORM public.record_project_review_feedback(v_review_item,'rejected',NULL); RAISE EXCEPTION 'superseded edition accepted feedback'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  ASSERT (public.get_client_project_review_bundle(v_second_id)->'edition'->>'priceMode')='hide','new edition must freeze its own price choice';
END; $$;

DO $$ BEGIN
  ASSERT (SELECT public=false FROM storage.buckets WHERE id='project-ffe-working'),'working bucket must be private';
  ASSERT (SELECT public=false FROM storage.buckets WHERE id='project-review-media'),'review bucket must be private';
  ASSERT NOT EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='project_ffe_items' AND policyname='Clients can view their project FFE items'),'raw client FF&E policy must be removed';
  ASSERT NOT has_function_privilege('anon','public.get_client_project_review_bundle(uuid)','EXECUTE'),'anonymous review bundle access must be denied';
END; $$;
ROLLBACK;
