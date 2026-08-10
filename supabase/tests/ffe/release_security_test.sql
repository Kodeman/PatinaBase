-- Release security: RPC-only authoring, curated projections, frozen media, access revocation.
BEGIN;
SET LOCAL statement_timeout='30s';
CREATE OR REPLACE FUNCTION pg_temp.assume_release_actor(p_actor uuid) RETURNS void LANGUAGE plpgsql AS $$ BEGIN
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',p_actor,'role','authenticated')::text,true);
  PERFORM set_config('request.jwt.claim.sub',p_actor::text,true);
END; $$;

INSERT INTO auth.users(id,email,encrypted_password,email_confirmed_at,created_at,updated_at,instance_id,aud,role) VALUES
('fa000000-0000-4000-8000-000000000001','release-owner@test.invalid','',now(),now(),now(),'00000000-0000-0000-0000-000000000000','authenticated','authenticated'),
('fa000000-0000-4000-8000-000000000002','release-client@test.invalid','',now(),now(),now(),'00000000-0000-0000-0000-000000000000','authenticated','authenticated');
INSERT INTO public.profiles(id,email,full_name) VALUES
('fa000000-0000-4000-8000-000000000001','release-owner@test.invalid','Release Owner'),
('fa000000-0000-4000-8000-000000000002','release-client@test.invalid','Release Client') ON CONFLICT DO NOTHING;
INSERT INTO public.projects(id,name,designer_id,client_id,created_by) VALUES
('fa100000-0000-4000-8000-000000000001','Release Project','fa000000-0000-4000-8000-000000000001','fa000000-0000-4000-8000-000000000002','fa000000-0000-4000-8000-000000000001');
INSERT INTO public.vendors(id,name) VALUES('fa200000-0000-4000-8000-000000000001','Release Vendor');
INSERT INTO public.products(id,name,price_retail,price_trade,images,vendor_id,captured_by,captured_at,layer,status) VALUES
('fa300000-0000-4000-8000-000000000001','Release Chair',150000,90000,ARRAY['https://example.invalid/release.jpg'],'fa200000-0000-4000-8000-000000000001','fa000000-0000-4000-8000-000000000001',now(),'catalog','published');
INSERT INTO public.project_ffe_media_assets(id,project_id,storage_path,media_kind,checksum_sha256,size_bytes,content_type,created_by) VALUES
('fa400000-0000-4000-8000-000000000001','fa100000-0000-4000-8000-000000000001','fa100000-0000-4000-8000-000000000001/source/chair.pdf','source_document',repeat('d',64),1000,'application/pdf','fa000000-0000-4000-8000-000000000001');
INSERT INTO public.project_review_media_assets(id,project_id,source_asset_id,storage_path,derivative_kind,checksum_sha256,size_bytes,content_type,prepared_by) VALUES
('fa500000-0000-4000-8000-000000000001','fa100000-0000-4000-8000-000000000001','fa400000-0000-4000-8000-000000000001','fa100000-0000-4000-8000-000000000001/review/chair.webp','display',repeat('e',64),2000,'image/webp','fa000000-0000-4000-8000-000000000001');

DO $$
DECLARE v_selected jsonb; v_candidate jsonb; v_review jsonb; v_edition uuid; v_review_item uuid; v_projection jsonb; v_manifest jsonb;
BEGIN
  PERFORM pg_temp.assume_release_actor('fa000000-0000-4000-8000-000000000001');
  v_selected:=public.place_product_in_project_v2('{"projectId":"fa100000-0000-4000-8000-000000000001","productId":"fa300000-0000-4000-8000-000000000001","assignmentScope":"throughout","disposition":"selected","duplicateMode":"create","idempotencyKey":"release-selected"}'::jsonb);
  v_candidate:=public.place_product_in_project_v2('{"projectId":"fa100000-0000-4000-8000-000000000001","productId":"fa300000-0000-4000-8000-000000000001","assignmentScope":"unassigned","disposition":"candidate","duplicateMode":"create","idempotencyKey":"release-candidate"}'::jsonb);
  BEGIN
    PERFORM public.publish_project_review(jsonb_build_object('projectId','fa100000-0000-4000-8000-000000000001','title','Unsafe','clientPriceMode','hide','boardIds','[]'::jsonb,
      'items',jsonb_build_array(jsonb_build_object('selectionId',v_selected->>'selectionId','clientFields',jsonb_build_object('tradeNotes','secret')))));
    RAISE EXCEPTION 'unsafe client field was published';
  EXCEPTION WHEN check_violation THEN NULL; END;
  v_review:=public.publish_project_review(jsonb_build_object('projectId','fa100000-0000-4000-8000-000000000001','title','Safe','clientPriceMode','hide','boardIds','[]'::jsonb,
    'items',jsonb_build_array(jsonb_build_object('selectionId',v_selected->>'selectionId','clientFields',jsonb_build_object('note','Client-safe'),'mediaAssetIds',jsonb_build_array('fa500000-0000-4000-8000-000000000001')))));
  v_edition:=(v_review->>'editionId')::uuid;
  SELECT id INTO v_review_item FROM public.project_review_items WHERE edition_id=v_edition;
  ASSERT (SELECT media_manifest->0->>'path'='fa100000-0000-4000-8000-000000000001/review/chair.webp'
    AND (media_manifest->0->>'sizeBytes')::integer=2000 FROM public.project_review_items WHERE id=v_review_item),
    'published item must freeze exact media path and size';
  BEGIN UPDATE public.project_review_media_assets SET storage_path='fa100000-0000-4000-8000-000000000001/review/drift.webp' WHERE id='fa500000-0000-4000-8000-000000000001';
    RAISE EXCEPTION 'published media mutation succeeded'; EXCEPTION WHEN check_violation THEN NULL; END;
  ALTER TABLE public.project_review_media_assets DISABLE TRIGGER guard_published_review_media_asset_trg;
  BEGIN
    UPDATE public.project_review_media_assets SET storage_path='fa100000-0000-4000-8000-000000000001/review/drift.webp' WHERE id='fa500000-0000-4000-8000-000000000001';
    PERFORM public.authorize_project_review_media(v_edition,'fa000000-0000-4000-8000-000000000002');
    RAISE EXCEPTION 'resolver accepted drifted media';
  EXCEPTION WHEN data_exception THEN NULL; END;
  ALTER TABLE public.project_review_media_assets ENABLE TRIGGER guard_published_review_media_asset_trg;
  v_manifest:=public.authorize_project_review_media(v_edition,'fa000000-0000-4000-8000-000000000002');
  ASSERT v_manifest->'media'->0->>'checksumSha256'=repeat('e',64);
  PERFORM pg_temp.assume_release_actor('fa000000-0000-4000-8000-000000000002');
  ASSERT position('/review/chair.webp' in public.get_client_project_review_bundle(v_edition)::text)=0,
    'client bundle must not expose private derivative paths';
  v_projection:=public.get_client_project_selections('fa100000-0000-4000-8000-000000000001');
  ASSERT jsonb_array_length(v_projection->'selections')=1,'curated projection must expose selected lines only';
  ASSERT position('price' in lower(v_projection::text))=0
    AND v_projection->'selections'->0 ? 'logisticsStatus',
    'curated selection projection must omit price and retain allowlisted logistics state';
  PERFORM public.record_project_review_feedback(v_review_item,'comment','Please confirm the finish');
  PERFORM pg_temp.assume_release_actor('fa000000-0000-4000-8000-000000000001');
  PERFORM public.revoke_project_review_access(v_edition,'Client access withdrawn');
  PERFORM pg_temp.assume_release_actor('fa000000-0000-4000-8000-000000000002');
  BEGIN PERFORM public.get_client_project_review_bundle(v_edition); RAISE EXCEPTION 'revoked review remained readable';
    EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END; $$;

DO $$ BEGIN
  ASSERT NOT has_table_privilege('authenticated','public.project_review_editions','INSERT');
  ASSERT NOT has_table_privilege('authenticated','public.project_review_items','UPDATE');
  ASSERT NOT has_table_privilege('authenticated','public.project_review_media_assets','DELETE');
  ASSERT NOT has_table_privilege('authenticated','public.project_ffe_import_batches','INSERT');
  ASSERT NOT has_table_privilege('authenticated','public.purchase_order_changes','UPDATE');
  ASSERT NOT has_table_privilege('authenticated','public.project_ffe_selection_threads','UPDATE');
  ASSERT (SELECT public=false FROM storage.buckets WHERE id='proposal-mood-boards');
  ASSERT NOT EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects'
    AND policyname='Proposal mood boards are publicly readable');
  ASSERT NOT EXISTS(SELECT 1 FROM public.project_boards WHERE items::text LIKE '%proposal-mood-boards%' OR cover_image_url LIKE '%proposal-mood-boards%');
END; $$;

SET LOCAL ROLE authenticated;
SELECT pg_temp.assume_release_actor('fa000000-0000-4000-8000-000000000001');
DO $$ BEGIN
  ASSERT (SELECT count(*)=1 FROM public.item_feedback feedback WHERE feedback.project_review_item_id IS NOT NULL),
    'studio must read review feedback through RLS';
  BEGIN INSERT INTO public.project_review_editions(project_id,edition_number,title) VALUES('fa100000-0000-4000-8000-000000000001',99,'Bypass');
    RAISE EXCEPTION 'direct review edition insert succeeded'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END; $$;
RESET ROLE;
ROLLBACK;
