-- FF&E service-role extraction, media authorization, and delivery boundaries.
BEGIN;
SET LOCAL statement_timeout = '30s';

CREATE OR REPLACE FUNCTION pg_temp.assume_service_actor(p_actor uuid)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', p_actor, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', p_actor::text, true);
END;
$$;

INSERT INTO auth.users(id,email,encrypted_password,email_confirmed_at,created_at,updated_at,instance_id,aud,role) VALUES
('f7000000-0000-4000-8000-000000000001','boundary-owner@test.invalid','',now(),now(),now(),'00000000-0000-0000-0000-000000000000','authenticated','authenticated'),
('f7000000-0000-4000-8000-000000000002','boundary-client@test.invalid','',now(),now(),now(),'00000000-0000-0000-0000-000000000000','authenticated','authenticated'),
('f7000000-0000-4000-8000-000000000003','boundary-other@test.invalid','',now(),now(),now(),'00000000-0000-0000-0000-000000000000','authenticated','authenticated');
INSERT INTO public.profiles(id,email,full_name) VALUES
('f7000000-0000-4000-8000-000000000001','boundary-owner@test.invalid','Boundary Owner'),
('f7000000-0000-4000-8000-000000000002','boundary-client@test.invalid','Boundary Client'),
('f7000000-0000-4000-8000-000000000003','boundary-other@test.invalid','Boundary Other')
ON CONFLICT(id) DO NOTHING;
-- 00511 makes the design studio the canonical authority for every project:
-- a studio-less project is no longer a reachable state (prod holds none), and
-- the designer must be an active non-guest member of an active design_studio
-- and hold a designer-domain role. Give the fixture that shape.
INSERT INTO public.organizations(id,name,slug,type,status) VALUES
('f7400000-0000-4000-8000-000000000001','Boundary Studio','boundary-studio','design_studio','active');
INSERT INTO public.organization_members(user_id,organization_id,role,status) VALUES
('f7000000-0000-4000-8000-000000000001','f7400000-0000-4000-8000-000000000001','owner','active');
INSERT INTO public.user_roles(user_id,role_id,granted_by)
SELECT 'f7000000-0000-4000-8000-000000000001',role.id,'f7000000-0000-4000-8000-000000000001'
FROM public.roles AS role WHERE role.name='studio_owner';
INSERT INTO public.projects(id,name,designer_id,client_id,created_by,studio_id) VALUES
('f7100000-0000-4000-8000-000000000001','Boundary Project','f7000000-0000-4000-8000-000000000001','f7000000-0000-4000-8000-000000000002','f7000000-0000-4000-8000-000000000001','f7400000-0000-4000-8000-000000000001');
INSERT INTO public.vendors(id,name) VALUES('f7200000-0000-4000-8000-000000000001','Boundary Vendor');
INSERT INTO public.products(id,name,price_retail,price_trade,images,vendor_id,captured_by,captured_at,layer,status) VALUES
('f7300000-0000-4000-8000-000000000001','Boundary Chair',140000,90000,ARRAY['https://example.invalid/boundary.jpg'],'f7200000-0000-4000-8000-000000000001','f7000000-0000-4000-8000-000000000001',now(),'catalog','published');
INSERT INTO public.project_ffe_media_assets(
  id,project_id,storage_path,media_kind,checksum_sha256,size_bytes,content_type,created_by
) VALUES (
  'f7400000-0000-4000-8000-000000000001','f7100000-0000-4000-8000-000000000001',
  'f7100000-0000-4000-8000-000000000001/specifications/source.pdf','source_document',
  repeat('b',64),4096,'application/pdf','f7000000-0000-4000-8000-000000000001'
);
INSERT INTO public.project_review_media_assets(
  id,project_id,source_asset_id,storage_path,derivative_kind,checksum_sha256,
  size_bytes,content_type,width,height,prepared_by
) VALUES (
  'f7500000-0000-4000-8000-000000000001','f7100000-0000-4000-8000-000000000001',
  'f7400000-0000-4000-8000-000000000001','f7100000-0000-4000-8000-000000000001/reviews/chair.webp',
  'display',repeat('c',64),2048,'image/webp',800,600,'f7000000-0000-4000-8000-000000000001'
);

DO $$
DECLARE
  v_selection jsonb;
  v_first jsonb;
  v_second jsonb;
  v_first_id uuid;
  v_second_id uuid;
  v_upload jsonb;
  v_staged jsonb;
  v_media jsonb;
  v_bundle jsonb;
  v_delivery jsonb;
  v_retry jsonb;
  v_source_auth jsonb;
  v_registered jsonb;
  v_registered_retry jsonb;
  v_prepared jsonb;
  v_prepared_retry jsonb;
  v_attempt_id uuid;
BEGIN
  PERFORM pg_temp.assume_service_actor('f7000000-0000-4000-8000-000000000001');
  v_registered := public.register_project_ffe_working_media_source(
    'f7100000-0000-4000-8000-000000000001',
    'f7000000-0000-4000-8000-000000000001',
    'project-ffe-working',
    'f7100000-0000-4000-8000-000000000001/boards/new-reference.png',
    repeat('a',64),1024,'image/png','board_reference',NULL
  );
  v_registered_retry := public.register_project_ffe_working_media_source(
    'f7100000-0000-4000-8000-000000000001',
    'f7000000-0000-4000-8000-000000000001',
    'project-ffe-working',
    'f7100000-0000-4000-8000-000000000001/boards/new-reference.png',
    repeat('a',64),1024,'image/png','board_reference',NULL
  );
  ASSERT v_registered->>'sourceAssetId' = v_registered_retry->>'sourceAssetId';
  ASSERT NOT (v_registered->>'reused')::boolean AND (v_registered_retry->>'reused')::boolean;
  BEGIN
    PERFORM public.register_project_ffe_working_media_source(
      'f7100000-0000-4000-8000-000000000001',
      'f7000000-0000-4000-8000-000000000003',
      'project-ffe-working',
      'f7100000-0000-4000-8000-000000000001/boards/unauthorized.png',
      repeat('a',64),1024,'image/png','board_reference',NULL
    );
    RAISE EXCEPTION 'unrelated actor registered working media';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;

  v_source_auth := public.authorize_project_review_media_source(
    'f7100000-0000-4000-8000-000000000001',
    'f7000000-0000-4000-8000-000000000001',
    'project-ffe-working',
    'f7100000-0000-4000-8000-000000000001/specifications/source.pdf'
  );
  ASSERT v_source_auth->>'checksumSha256' = repeat('b',64);
  ASSERT (v_source_auth->>'sizeBytes')::integer = 4096;
  ASSERT v_source_auth->>'contentType' = 'application/pdf';
  BEGIN
    PERFORM public.authorize_project_review_media_source(
      'f7100000-0000-4000-8000-000000000001',
      'f7000000-0000-4000-8000-000000000003',
      'project-ffe-working',
      'f7100000-0000-4000-8000-000000000001/specifications/source.pdf'
    );
    RAISE EXCEPTION 'unrelated actor authorized review media source';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;

  v_prepared := public.prepare_project_review_media_asset(
    'f7100000-0000-4000-8000-000000000001',
    'f7000000-0000-4000-8000-000000000001',
    'project-ffe-working',
    'f7100000-0000-4000-8000-000000000001/specifications/source.pdf',
    repeat('b',64),4096,'application/pdf',
    'project-review-media',
    'f7100000-0000-4000-8000-000000000001/reviews/' || repeat('d',64) || '.webp',
    repeat('d',64),3072,'display',1200,900
  );
  v_prepared_retry := public.prepare_project_review_media_asset(
    'f7100000-0000-4000-8000-000000000001',
    'f7000000-0000-4000-8000-000000000001',
    'project-ffe-working',
    'f7100000-0000-4000-8000-000000000001/specifications/source.pdf',
    repeat('b',64),4096,'application/pdf',
    'project-review-media',
    'f7100000-0000-4000-8000-000000000001/reviews/' || repeat('d',64) || '.webp',
    repeat('d',64),3072,'display',1200,900
  );
  ASSERT v_prepared->>'assetId' = v_prepared_retry->>'assetId';
  ASSERT NOT (v_prepared->>'reused')::boolean AND (v_prepared_retry->>'reused')::boolean;
  ASSERT v_prepared->>'contentType' = 'image/webp';
  BEGIN
    PERFORM public.prepare_project_review_media_asset(
      'f7100000-0000-4000-8000-000000000001',
      'f7000000-0000-4000-8000-000000000001',
      'project-ffe-working',
      'f7100000-0000-4000-8000-000000000001/specifications/source.pdf',
      repeat('b',64),4096,'application/pdf',
      'project-review-media',
      'f7100000-0000-4000-8000-000000000001/reviews/' || repeat('d',64) || '.webp',
      repeat('e',64),3072,'display',1200,900
    );
    RAISE EXCEPTION 'mismatched derivative checksum was accepted';
  EXCEPTION WHEN check_violation THEN NULL; END;

  v_selection := public.place_product_in_project_v2(jsonb_build_object(
    'projectId','f7100000-0000-4000-8000-000000000001',
    'productId','f7300000-0000-4000-8000-000000000001',
    'assignmentScope','throughout','disposition','selected','duplicateMode','create',
    'idempotencyKey','boundary-selection'
  ));
  v_first := public.publish_project_review(jsonb_build_object(
    'projectId','f7100000-0000-4000-8000-000000000001','title','Boundary review one',
    'clientPriceMode','hide','boardIds','[]'::jsonb,
    'items',jsonb_build_array(jsonb_build_object(
      'selectionId',v_selection->>'selectionId',
      'mediaAssetIds',jsonb_build_array('f7500000-0000-4000-8000-000000000001')
    ))
  ));
  v_first_id := (v_first->>'editionId')::uuid;
  v_second := public.publish_project_review(jsonb_build_object(
    'projectId','f7100000-0000-4000-8000-000000000001','title','Boundary review two',
    'clientPriceMode','hide','boardIds','[]'::jsonb,
    'items',jsonb_build_array(jsonb_build_object('selectionId',v_selection->>'selectionId'))
  ));
  v_second_id := (v_second->>'editionId')::uuid;

  PERFORM pg_temp.assume_service_actor('f7000000-0000-4000-8000-000000000002');
  v_bundle := public.get_client_project_review_bundle(v_first_id);
  ASSERT v_bundle->'edition'->>'status' = 'superseded',
    'superseded review must remain readable but immutable';
  PERFORM pg_temp.assume_service_actor('f7000000-0000-4000-8000-000000000001');

  v_media := public.authorize_project_review_media(v_first_id,'f7000000-0000-4000-8000-000000000002');
  ASSERT v_media->>'editionId' = v_first_id::text;
  ASSERT v_media->'media'->0->>'path' = 'f7100000-0000-4000-8000-000000000001/reviews/chair.webp';
  ASSERT (v_media->'media'->0->>'sizeBytes')::integer = 2048;
  ASSERT v_media->'media'->0->>'contentType' = 'image/webp';
  BEGIN
    PERFORM public.authorize_project_review_media(v_first_id,'f7000000-0000-4000-8000-000000000003');
    RAISE EXCEPTION 'unrelated actor authorized review media';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;

  v_upload := public.get_project_ffe_extract_upload(
    'f7100000-0000-4000-8000-000000000001',
    'f7400000-0000-4000-8000-000000000001',
    'f7000000-0000-4000-8000-000000000001'
  );
  ASSERT v_upload->>'bucket' = 'project-ffe-working';
  ASSERT v_upload->>'contentType' = 'application/pdf';
  ASSERT (v_upload->>'sizeBytes')::integer = 4096;
  BEGIN
    PERFORM public.get_project_ffe_extract_upload(
      'f7100000-0000-4000-8000-000000000001',
      'f7400000-0000-4000-8000-000000000001',
      'f7000000-0000-4000-8000-000000000003'
    );
    RAISE EXCEPTION 'unrelated actor authorized extraction upload';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;

  v_staged := public.stage_project_ffe_document_extraction(
    'f7100000-0000-4000-8000-000000000001',
    'f7400000-0000-4000-8000-000000000001',
    'f7000000-0000-4000-8000-000000000001',repeat('b',64),
    '[{"name":"Extracted chair","pageNumber":3,"confidence":0.92}]'::jsonb
  );
  ASSERT v_staged->>'status' = 'staged' AND (v_staged->>'rowCount')::integer = 1;
  ASSERT (SELECT source_kind = 'pdf' AND source_asset_id = 'f7400000-0000-4000-8000-000000000001'
          FROM public.project_ffe_import_batches WHERE id = (v_staged->>'batchId')::uuid);
  ASSERT (SELECT count(*) = 1 FROM public.project_ffe_items
          WHERE project_id = 'f7100000-0000-4000-8000-000000000001'),
    'document extraction staging must not create live selections';

  v_delivery := public.prepare_project_review_delivery(v_second_id,'f7000000-0000-4000-8000-000000000001','delivery-boundary');
  ASSERT v_delivery->>'outcome' = 'claimed' AND (v_delivery->>'claimed')::boolean;
  ASSERT v_delivery->'recipient'->>'email' = 'boundary-client@test.invalid';
  ASSERT v_delivery->'review'->>'reviewPath' = '/projects/f7100000-0000-4000-8000-000000000001/reviews/' || v_second_id::text;
  v_attempt_id := (v_delivery->>'attemptId')::uuid;
  v_delivery := public.prepare_project_review_delivery(v_second_id,'f7000000-0000-4000-8000-000000000001','delivery-boundary');
  ASSERT v_delivery->>'outcome' = 'in_progress' AND NOT (v_delivery->>'claimed')::boolean;
  PERFORM public.mark_project_review_delivery_sent(v_attempt_id,'f7000000-0000-4000-8000-000000000001',NULL,'provider_timeout');
  v_retry := public.prepare_project_review_delivery(v_second_id,'f7000000-0000-4000-8000-000000000001','delivery-boundary');
  ASSERT v_retry->>'outcome' = 'claimed' AND (v_retry->>'attemptId')::uuid = v_attempt_id;
  PERFORM public.mark_project_review_delivery_sent(v_attempt_id,'f7000000-0000-4000-8000-000000000001','provider-message-1',NULL);
  v_delivery := public.prepare_project_review_delivery(v_second_id,'f7000000-0000-4000-8000-000000000001','delivery-boundary');
  ASSERT v_delivery->>'outcome' = 'already_sent' AND v_delivery->>'status' = 'sent';
END;
$$;

DO $$
BEGIN
  ASSERT has_function_privilege('service_role','public.register_project_ffe_working_media_source(uuid,uuid,text,text,text,bigint,text,text,uuid)','EXECUTE');
  ASSERT NOT has_function_privilege('authenticated','public.register_project_ffe_working_media_source(uuid,uuid,text,text,text,bigint,text,text,uuid)','EXECUTE');
  ASSERT has_function_privilege('service_role','public.authorize_project_review_media_source(uuid,uuid,text,text)','EXECUTE');
  ASSERT NOT has_function_privilege('authenticated','public.authorize_project_review_media_source(uuid,uuid,text,text)','EXECUTE');
  ASSERT has_function_privilege('service_role','public.prepare_project_review_media_asset(uuid,uuid,text,text,text,bigint,text,text,text,text,bigint,text,integer,integer)','EXECUTE');
  ASSERT NOT has_function_privilege('authenticated','public.prepare_project_review_media_asset(uuid,uuid,text,text,text,bigint,text,text,text,text,bigint,text,integer,integer)','EXECUTE');
  ASSERT has_function_privilege('service_role','public.authorize_project_review_media(uuid,uuid)','EXECUTE');
  ASSERT NOT has_function_privilege('authenticated','public.authorize_project_review_media(uuid,uuid)','EXECUTE');
  ASSERT NOT has_function_privilege('anon','public.get_project_ffe_extract_upload(uuid,uuid,uuid)','EXECUTE');
  ASSERT NOT has_function_privilege('authenticated','public.prepare_project_review_delivery(uuid,uuid,text)','EXECUTE');
  ASSERT NOT has_function_privilege('authenticated','public.mark_project_review_delivery_sent(uuid,uuid,text,text)','EXECUTE');
END;
$$;

ROLLBACK;
