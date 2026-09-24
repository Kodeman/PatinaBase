-- 00660 + Contract B: a camera upload registers as a source_document once, no
-- matter how often it is retried; its batch is stamped `photo`; and a committed
-- photo row is placed as a document extraction. Needs every migration through
-- 00666 (the replayed order: 00660 → 00661 → 00666). The file runs in one
-- transaction and rolls back.
BEGIN;
SET LOCAL statement_timeout = '30s';

CREATE OR REPLACE FUNCTION pg_temp.act_as(p_actor uuid)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', p_actor, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', p_actor::text, true);
END;
$$;

-- The registration call project-ffe-document-extract makes (Contract B §B.2):
-- the caller's own id as actor, a sniffed type, NULL selection.
CREATE OR REPLACE FUNCTION pg_temp.register(p_actor uuid, p_path text, p_checksum text, p_content_type text)
RETURNS jsonb LANGUAGE sql AS $$
  SELECT public.register_project_ffe_working_media_source(
    'e6100000-0000-4000-8000-000000000001', p_actor, 'project-ffe-working', p_path,
    p_checksum, 4096, p_content_type, 'source_document', NULL);
$$;

-- A photo row as the v2 extractor emits it: page 1, no commercial reading.
CREATE OR REPLACE FUNCTION pg_temp.photo_row(p_name text) RETURNS jsonb LANGUAGE sql AS $$
  SELECT jsonb_build_object(
    'pageNumber', 1,
    'provenance', jsonb_build_object('page', 1, 'confidence', 0.9, 'sourceKind', 'photo'),
    'name', p_name, 'quantity', 1, 'roomName', NULL, 'category', NULL,
    'maker', NULL, 'sku', NULL, 'unitPriceMinor', NULL, 'currency', NULL, 'priceBasis', 'unknown');
$$;

INSERT INTO auth.users(id,email,encrypted_password,email_confirmed_at,created_at,updated_at,instance_id,aud,role) VALUES
('e6000000-0000-4000-8000-000000000001','e6-owner@test.invalid','',now(),now(),now(),'00000000-0000-0000-0000-000000000000','authenticated','authenticated'),
('e6000000-0000-4000-8000-000000000002','e6-client@test.invalid','',now(),now(),now(),'00000000-0000-0000-0000-000000000000','authenticated','authenticated'),
('e6000000-0000-4000-8000-000000000003','e6-outsider@test.invalid','',now(),now(),now(),'00000000-0000-0000-0000-000000000000','authenticated','authenticated');
INSERT INTO public.profiles(id,email,full_name) VALUES
('e6000000-0000-4000-8000-000000000001','e6-owner@test.invalid','E6 Owner'),
('e6000000-0000-4000-8000-000000000002','e6-client@test.invalid','E6 Client'),
('e6000000-0000-4000-8000-000000000003','e6-outsider@test.invalid','E6 Outsider')
ON CONFLICT(id) DO NOTHING;
INSERT INTO public.organizations(id,name,slug,type,status) VALUES
('e6400000-0000-4000-8000-000000000001','E6 Studio','e6-studio','design_studio','active');
INSERT INTO public.organization_members(user_id,organization_id,role,status) VALUES
('e6000000-0000-4000-8000-000000000001','e6400000-0000-4000-8000-000000000001','owner','active');
INSERT INTO public.user_roles(user_id,role_id,granted_by)
SELECT 'e6000000-0000-4000-8000-000000000001',role.id,'e6000000-0000-4000-8000-000000000001'
FROM public.roles AS role WHERE role.name='studio_owner';
INSERT INTO public.projects(id,name,designer_id,client_id,created_by,studio_id) VALUES
('e6100000-0000-4000-8000-000000000001','E6 Project','e6000000-0000-4000-8000-000000000001',
 'e6000000-0000-4000-8000-000000000002','e6000000-0000-4000-8000-000000000001','e6400000-0000-4000-8000-000000000001');

-- ── Replay order: 00660's bodies are the live ones under 00661 and 00666 ────
DO $$
BEGIN
  ASSERT (SELECT count(*) = 1 FROM pg_constraint
          WHERE conrelid = 'public.project_ffe_import_batches'::regclass AND contype = 'c'
            AND pg_get_constraintdef(oid) LIKE '%source_kind%'),
    'exactly one source_kind check';
  ASSERT pg_get_constraintdef((SELECT oid FROM pg_constraint
          WHERE conname = 'project_ffe_import_batches_source_kind_check'
            AND conrelid = 'public.project_ffe_import_batches'::regclass)) LIKE '%''photo''%',
    'source_kind accepts photo';
  ASSERT pg_get_functiondef('public._stage_project_ffe_document_extraction_00661_impl(uuid,uuid,uuid,text,jsonb)'::regprocedure)
         LIKE '%v_source_kind%',
    '00661 wrapped the 00660 staging body';
  ASSERT pg_get_functiondef('public._commit_project_ffe_import_00446_impl(uuid,jsonb)'::regprocedure)
         LIKE '%source_kind IN (''pdf'',''photo'') THEN ''document-extraction''%',
    'the commit impl labels photo rows as document extraction';
  ASSERT NOT has_function_privilege('authenticated', 'public._commit_project_ffe_import_00446_impl(uuid,jsonb)', 'EXECUTE');
  ASSERT NOT has_function_privilege('service_role', 'public._commit_project_ffe_import_00446_impl(uuid,jsonb)', 'EXECUTE');
  ASSERT has_function_privilege('service_role', 'public.get_project_ffe_extract_upload(uuid,uuid,uuid)', 'EXECUTE');
  ASSERT NOT has_function_privilege('authenticated', 'public.get_project_ffe_extract_upload(uuid,uuid,uuid)', 'EXECUTE');
  ASSERT has_function_privilege('service_role', 'public.register_project_ffe_working_media_source(uuid,uuid,text,text,text,bigint,text,text,uuid)', 'EXECUTE');
  ASSERT NOT has_function_privilege('authenticated', 'public.register_project_ffe_working_media_source(uuid,uuid,text,text,text,bigint,text,text,uuid)', 'EXECUTE');
END;
$$;

-- ── Registering the same upload twice is idempotent (Contract B §B.6) ──────
DO $$
DECLARE
  v_path text := 'e6100000-0000-4000-8000-000000000001/source-documents/' || repeat('a', 64) || '.jpg';
  v_first jsonb;
  v_second jsonb;
BEGIN
  v_first := pg_temp.register('e6000000-0000-4000-8000-000000000001', v_path, repeat('a', 64), 'image/jpeg');
  v_second := pg_temp.register('e6000000-0000-4000-8000-000000000001', v_path, repeat('a', 64), 'image/jpeg');
  ASSERT (v_first->>'reused')::boolean = false, 'first registration creates the asset';
  ASSERT (v_second->>'reused')::boolean = true, 'a retry reuses it';
  ASSERT v_second->>'sourceAssetId' = v_first->>'sourceAssetId', 'a retry returns the same asset';
  ASSERT v_first->>'mediaKind' = 'source_document' AND v_first->>'contentType' = 'image/jpeg';
  ASSERT (SELECT count(*) = 1 FROM public.project_ffe_media_assets WHERE storage_path = v_path);

  -- The same path now holding different bytes is refused, never re-pointed.
  BEGIN
    PERFORM pg_temp.register('e6000000-0000-4000-8000-000000000001', v_path, repeat('b', 64), 'image/jpeg');
    RAISE EXCEPTION 'a changed checksum re-registered the path';
  EXCEPTION WHEN data_exception THEN NULL; END;
  -- A caller outside the studio cannot register (source_not_authorized).
  BEGIN
    PERFORM pg_temp.register('e6000000-0000-4000-8000-000000000003',
      'e6100000-0000-4000-8000-000000000001/source-documents/' || repeat('c', 64) || '.png', repeat('c', 64), 'image/png');
    RAISE EXCEPTION 'an outsider registered a source document';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  ASSERT NOT EXISTS (SELECT 1 FROM public.project_ffe_media_assets WHERE checksum_sha256 = repeat('c', 64));
END;
$$;

-- ── An image upload extracts: its batch is a photo batch ──────────────────
DO $$
DECLARE
  v_image jsonb;
  v_pdf jsonb;
  v_upload jsonb;
  v_staged jsonb;
  v_again jsonb;
  v_pdf_staged jsonb;
  v_committed jsonb;
BEGIN
  v_image := pg_temp.register('e6000000-0000-4000-8000-000000000001',
    'e6100000-0000-4000-8000-000000000001/source-documents/' || repeat('d', 64) || '.webp', repeat('d', 64), 'image/webp');
  v_upload := public.get_project_ffe_extract_upload('e6100000-0000-4000-8000-000000000001',
    (v_image->>'sourceAssetId')::uuid, 'e6000000-0000-4000-8000-000000000001');
  ASSERT v_upload->>'contentType' = 'image/webp', 'an image source_document is an extraction upload';
  BEGIN
    PERFORM public.get_project_ffe_extract_upload('e6100000-0000-4000-8000-000000000001',
      (v_image->>'sourceAssetId')::uuid, 'e6000000-0000-4000-8000-000000000003');
    RAISE EXCEPTION 'an outsider read an image extraction upload';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;

  v_staged := public.stage_project_ffe_document_extraction('e6100000-0000-4000-8000-000000000001',
    (v_image->>'sourceAssetId')::uuid, 'e6000000-0000-4000-8000-000000000001', repeat('d', 64),
    jsonb_build_array(pg_temp.photo_row('Tagged lamp')));
  ASSERT jsonb_typeof(v_staged->'reused') = 'boolean' AND NOT (v_staged->>'reused')::boolean;
  ASSERT (v_staged->>'unconfirmedCommercialRows')::integer = 0, '00666 wrapper ran over the 00660 body';
  ASSERT (SELECT source_kind FROM public.project_ffe_import_batches WHERE id = (v_staged->>'batchId')::uuid) = 'photo',
    'an image upload stages a photo batch, not a pdf one';

  v_again := public.stage_project_ffe_document_extraction('e6100000-0000-4000-8000-000000000001',
    (v_image->>'sourceAssetId')::uuid, 'e6000000-0000-4000-8000-000000000001', repeat('d', 64),
    jsonb_build_array(pg_temp.photo_row('Tagged lamp')));
  ASSERT (v_again->>'reused')::boolean AND v_again->>'batchId' = v_staged->>'batchId',
    'restaging the same photo reuses its batch';

  -- A PDF source still stages as pdf.
  v_pdf := pg_temp.register('e6000000-0000-4000-8000-000000000001',
    'e6100000-0000-4000-8000-000000000001/source-documents/' || repeat('e', 64) || '.pdf', repeat('e', 64), 'application/pdf');
  v_pdf_staged := public.stage_project_ffe_document_extraction('e6100000-0000-4000-8000-000000000001',
    (v_pdf->>'sourceAssetId')::uuid, 'e6000000-0000-4000-8000-000000000001', repeat('e', 64),
    '[{"name":"Spec sofa","pageNumber":3,"confidence":0.9}]'::jsonb);
  ASSERT (SELECT source_kind FROM public.project_ffe_import_batches WHERE id = (v_pdf_staged->>'batchId')::uuid) = 'pdf';

  -- A committed photo row is placed as a document extraction.
  PERFORM pg_temp.act_as('e6000000-0000-4000-8000-000000000001');
  v_committed := public.commit_project_ffe_import((v_staged->>'batchId')::uuid, jsonb_build_array(jsonb_build_object(
    'rowOrdinal', 1, 'assignmentScope', 'unassigned', 'duplicateMode', 'create')));
  ASSERT v_committed->>'status' = 'committed';
  ASSERT (SELECT item.added_via FROM public.project_ffe_items item
          JOIN public.project_ffe_import_rows row ON row.committed_ffe_item_id = item.id
          WHERE row.batch_id = (v_staged->>'batchId')::uuid AND row.row_ordinal = 1) = 'document-extraction',
    'a committed photo row lands with added_via = document-extraction';
END;
$$;

ROLLBACK;
