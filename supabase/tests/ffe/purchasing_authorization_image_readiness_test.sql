-- 00834 — Existing pictures satisfy authorization readiness; all fixtures roll back.
BEGIN;
SET LOCAL statement_timeout = '60s';
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT no_plan();

CREATE FUNCTION pg_temp.image_id(n integer) RETURNS uuid LANGUAGE sql IMMUTABLE AS $$
  SELECT ('83400000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid;
$$;
CREATE FUNCTION pg_temp.image_readiness(n integer) RETURNS jsonb LANGUAGE sql AS $$
  SELECT public.get_project_ffe_readiness(pg_temp.image_id(n));
$$;
CREATE FUNCTION pg_temp.image_release(n integer) RETURNS jsonb LANGUAGE sql AS $$
  SELECT public.create_furnishings_authorization_from_schedule(
    pg_temp.image_id(202), 'Image authorization ' || n, ARRAY[pg_temp.image_id(n)], NULL);
$$;
GRANT EXECUTE ON FUNCTION pg_temp.image_id(integer), pg_temp.image_readiness(integer), pg_temp.image_release(integer) TO authenticated;

INSERT INTO auth.users(id, email, encrypted_password, email_confirmed_at, created_at, updated_at, instance_id, aud, role)
SELECT pg_temp.image_id(n), 'image-' || n || '@test.invalid', '', now(), now(), now(),
       '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'
FROM generate_series(101,103) n;
INSERT INTO public.profiles(id,email,full_name,is_designer)
SELECT pg_temp.image_id(n), 'image-' || n || '@test.invalid', 'Image fixture ' || n, n = 101
FROM generate_series(101,103) n ON CONFLICT (id) DO UPDATE SET is_designer = EXCLUDED.is_designer;
INSERT INTO public.organizations(id,name,slug,type,status)
VALUES (pg_temp.image_id(201),'Image Studio','authorization-image-test','design_studio','active');
INSERT INTO public.organization_members(user_id,organization_id,role,status)
VALUES (pg_temp.image_id(101),pg_temp.image_id(201),'owner','active');
INSERT INTO public.user_roles(user_id,role_id,granted_by)
SELECT pg_temp.image_id(101),id,pg_temp.image_id(101) FROM public.roles WHERE name='studio_owner';
INSERT INTO public.projects(id,name,designer_id,client_id,created_by,studio_id,status)
VALUES (pg_temp.image_id(202),'Image Job',pg_temp.image_id(101),pg_temp.image_id(102),pg_temp.image_id(101),pg_temp.image_id(201),'active');
INSERT INTO public.project_rooms(id,project_id,name,sort_order)
VALUES (pg_temp.image_id(203),pg_temp.image_id(202),'Den',0);
INSERT INTO public.vendors(id,name) VALUES(pg_temp.image_id(204),'Image Vendor');
INSERT INTO public.proposals(id,project_id,designer_id,client_id,title,status,document_kind,commercial_state)
VALUES (pg_temp.image_id(205),pg_temp.image_id(202),pg_temp.image_id(101),pg_temp.image_id(102),'Design services','accepted','design_services','executed');
INSERT INTO public.project_commercial_documents(id,project_id,proposal_id,document_kind,is_origin,bound_at,executed_at,created_by)
VALUES (pg_temp.image_id(206),pg_temp.image_id(202),pg_temp.image_id(205),'design_services',true,now(),now(),pg_temp.image_id(101));
INSERT INTO public.project_budget_versions(id,project_id,version,created_by)
VALUES (pg_temp.image_id(207),pg_temp.image_id(202),1,pg_temp.image_id(101));
INSERT INTO public.project_budget_lines(budget_version_id,project_room_id,room_name,category,low_cents,target_cents,high_cents)
VALUES (pg_temp.image_id(207),pg_temp.image_id(203),'Den','Furnishings',10000,50000,90000);
INSERT INTO public.spec_book_templates(id,template_key,version,name,page_grammar,audience_profiles,required_field_rules,visibility_rules)
VALUES (pg_temp.image_id(208),'authorization-image-test',1,'Image rules','{}','{}',
        '{"fixed":["name","documentCode","room","quantity","image","selection"]}','{}'),
       (pg_temp.image_id(210),'authorization-image-optional-test',1,'Optional image rules','{}','{}',
        '{"fixed":["name","documentCode","room","quantity"]}','{}');
INSERT INTO public.spec_books(id,project_id,title,template_id,created_by)
VALUES (pg_temp.image_id(209),pg_temp.image_id(202),'Image specs',pg_temp.image_id(208),pg_temp.image_id(101));

-- 1 own primary; 2 catalog only; 3/4 spec string/object; 5 absent; 6 blank; 7 labor; 8 invariants.
INSERT INTO public.products(id,name,captured_at,layer,owner_user_id,status,images,vendor_id)
SELECT pg_temp.image_id(300+n),'Image product ' || n,now(),'personal',pg_temp.image_id(101),'draft',
       CASE WHEN n=2 THEN ARRAY['https://img.test/catalog.jpg']
            WHEN n=6 THEN ARRAY['   '] ELSE ARRAY[]::text[] END,pg_temp.image_id(204)
FROM generate_series(1,8) n;
SELECT set_config('app.ffe_mutation_rpc','on',true);
SELECT set_config('app.ffe_pricing_writer','on',true);
INSERT INTO public.project_ffe_items(id,project_id,project_room_id,assignment_scope,name,doc_code,status,item_type,
  product_id,quantity,unit_price_cents,line_total_cents,vendor_id,vendor_name,design_disposition,sort_order)
SELECT pg_temp.image_id(n),pg_temp.image_id(202),pg_temp.image_id(203),'room','Image line ' || n,'IM-' || n,'specified','fixed',
  pg_temp.image_id(300+n),1,12000,12000,pg_temp.image_id(204),'Image Vendor','selected',n
FROM generate_series(1,8) n;
UPDATE public.project_ffe_items SET line_kind='labor',link_kind='labor',parent_ffe_item_id=pg_temp.image_id(1),product_id=NULL
WHERE id=pg_temp.image_id(7);
DELETE FROM public.project_ffe_item_images WHERE project_id=pg_temp.image_id(202);
INSERT INTO public.project_ffe_item_images(item_id,url,source,position,is_primary)
VALUES (pg_temp.image_id(1),'https://img.test/item.jpg','upload',0,true),
       (pg_temp.image_id(8),'https://img.test/other.jpg','upload',0,true);
INSERT INTO public.project_ffe_specs(ffe_item_id,selected_media)
SELECT pg_temp.image_id(n), CASE n WHEN 3 THEN '["https://img.test/chosen.jpg"]'::jsonb
  WHEN 4 THEN '[{"url":"https://img.test/chosen-object.jpg"}]'::jsonb
  WHEN 6 THEN '[{"url":"   "}]'::jsonb ELSE '[]'::jsonb END
FROM generate_series(1,8) n
ON CONFLICT (ffe_item_id) DO UPDATE SET selected_media=EXCLUDED.selected_media;
SELECT set_config('app.ffe_mutation_rpc','',true);
SELECT set_config('app.ffe_pricing_writer','',true);
SET LOCAL request.jwt.claims='{"sub":"83400000-0000-4000-8000-000000000101","role":"authenticated"}';
DO $$ DECLARE published jsonb; BEGIN
  published := public.publish_budget_checkpoint(pg_temp.image_id(202),pg_temp.image_id(207));
  PERFORM public.override_budget_checkpoint((published->>'checkpointId')::uuid,'Proceed on the reviewed fixture budget.');
END $$;

SET LOCAL ROLE authenticated;
SELECT is(pg_temp.image_readiness(1)->'missingFields','[]'::jsonb,'item picture: empty selected_media is ready');
SELECT is(pg_temp.image_readiness(2)->'missingFields','[]'::jsonb,'catalog fallback: no own picture is ready');
SELECT is(pg_temp.image_readiness(3)->'missingFields','[]'::jsonb,'selected string: spec picture is ready');
SELECT is(pg_temp.image_readiness(4)->'missingFields','[]'::jsonb,'selected object: spec picture is ready');
SELECT is(pg_temp.image_readiness(5)->'missingFields','["image"]'::jsonb,'absent pictures: still missing image');
SELECT is(pg_temp.image_readiness(6)->'missingFields','["image"]'::jsonb,'blank pictures: still missing image');
SELECT throws_like('SELECT pg_temp.image_release(5)','%not ready for authorization:%image%', 'release: imageless item refused');
SELECT throws_like('SELECT pg_temp.image_release(6)','%not ready for authorization:%image%', 'release: blank pictures refused');
SELECT throws_like('SELECT public.create_furnishings_authorization_from_schedule(pg_temp.image_id(202),''Empty'',ARRAY[]::uuid[],NULL)',
  '%at least one schedule line%', 'release: empty selection refused');

RESET ROLE;
-- Neither the first selected entry nor catalog whitespace is a picture; later entries do not lead the spec lens.
UPDATE public.project_ffe_specs SET selected_media='["  ","https://img.test/not-first.jpg"]' WHERE ffe_item_id=pg_temp.image_id(6);
SELECT is(pg_temp.image_readiness(6)->'missingFields','["image"]'::jsonb,'blank first selected string: later entry does not satisfy image');
UPDATE public.project_ffe_specs SET selected_media='[{"url":42}]' WHERE ffe_item_id=pg_temp.image_id(6);
SELECT is(pg_temp.image_readiness(6)->'missingFields','["image"]'::jsonb,'non-string selected URL: not a picture');
UPDATE public.project_ffe_specs SET selected_media='[{}]' WHERE ffe_item_id=pg_temp.image_id(6);
SELECT is(pg_temp.image_readiness(6)->'missingFields','["image"]'::jsonb,'selected object without URL: not a picture');
UPDATE public.project_ffe_specs SET selected_media='[null]' WHERE ffe_item_id=pg_temp.image_id(6);
SELECT is(pg_temp.image_readiness(6)->'missingFields','["image"]'::jsonb,'selected null: not a picture');
-- No spec row at all still permits the established item source.
DELETE FROM public.project_ffe_specs WHERE ffe_item_id=pg_temp.image_id(8);
SELECT is(pg_temp.image_readiness(8)->'missingFields','[]'::jsonb,'missing spec row: item picture is ready');

SELECT set_config('app.ffe_mutation_rpc','on',true);
SELECT set_config('app.ffe_pricing_writer','on',true);
UPDATE public.project_ffe_items SET blocked=true WHERE id=pg_temp.image_id(8);
SELECT ok(pg_temp.image_readiness(8)->'missingFields' ? 'releaseBlock','invariants: picture does not bypass release block');
UPDATE public.project_ffe_items SET blocked=false,unit_price_cents=0,line_total_cents=0 WHERE id=pg_temp.image_id(8);
SELECT ok(pg_temp.image_readiness(8)->'missingFields' ? 'clientPrice','invariants: picture does not bypass price');
UPDATE public.project_ffe_items SET unit_price_cents=12000,line_total_cents=12000,vendor_id=NULL WHERE id=pg_temp.image_id(8);
SELECT ok(pg_temp.image_readiness(8)->'missingFields' ? 'vendor','invariants: picture does not bypass vendor');
UPDATE public.project_ffe_items SET vendor_id=pg_temp.image_id(204),design_disposition='candidate' WHERE id=pg_temp.image_id(8);
SELECT ok(pg_temp.image_readiness(8)->'missingFields' ? 'designDisposition','invariants: picture does not bypass selection');
UPDATE public.project_ffe_items SET design_disposition='selected',removed_at=now(),removed_by=pg_temp.image_id(101),removal_reason='Fixture removal' WHERE id=pg_temp.image_id(8);
SELECT ok(pg_temp.image_readiness(8)->'missingFields' ? 'removed','invariants: picture does not bypass removed');
UPDATE public.project_ffe_items SET removed_at=NULL,removed_by=NULL,removal_reason=NULL WHERE id=pg_temp.image_id(8);
SELECT set_config('app.ffe_mutation_rpc','',true);
SELECT set_config('app.ffe_pricing_writer','',true);

-- Keep existing labor/template semantics, not a new image or catalog requirement for optional templates.
UPDATE public.spec_books SET template_id=pg_temp.image_id(210) WHERE id=pg_temp.image_id(209);
SELECT is(pg_temp.image_readiness(7)->'missingFields','[]'::jsonb,'labor: no image or selection required by optional template');
SELECT set_config('app.ffe_mutation_rpc','on',true);
UPDATE public.project_ffe_items SET blocked=true WHERE id=pg_temp.image_id(1);
SELECT ok(pg_temp.image_readiness(7)->'missingFields' ? 'parent_not_ready','labor: unready parent still holds child');
UPDATE public.project_ffe_items SET blocked=false WHERE id=pg_temp.image_id(1);
SELECT set_config('app.ffe_mutation_rpc','',true);
UPDATE public.spec_books SET template_id=pg_temp.image_id(208) WHERE id=pg_temp.image_id(209);
SELECT ok(pg_temp.image_readiness(7)->'missingFields' @> '["image","selection"]'::jsonb,'labor: existing required-template checks retained');

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims='{"sub":"83400000-0000-4000-8000-000000000102","role":"authenticated"}';
SELECT throws_like('SELECT pg_temp.image_readiness(1)','%not found or access denied%', 'permissions: client cannot read studio readiness');
SELECT throws_like('SELECT pg_temp.image_release(2)','%not found or access denied%', 'permissions: client cannot release');
SELECT is((SELECT selection->>'primaryImageUrl' FROM jsonb_array_elements(public.get_client_project_selections(pg_temp.image_id(202))->'selections') selection
  WHERE selection->>'id'=pg_temp.image_id(1)::text),'https://img.test/item.jpg','client reader: supported current item primary is visible');
SET LOCAL request.jwt.claims='{"sub":"83400000-0000-4000-8000-000000000103","role":"authenticated"}';
SELECT throws_like('SELECT pg_temp.image_readiness(1)','%not found or access denied%', 'permissions: outsider cannot read readiness');
SET LOCAL request.jwt.claims='{"sub":"83400000-0000-4000-8000-000000000101","role":"authenticated"}';
SELECT throws_like('SELECT public.create_furnishings_authorization_from_schedule(pg_temp.image_id(202),''Wrong job'',ARRAY[pg_temp.image_id(999)],NULL)',
  '%does not belong to project%', 'release: unknown or other-job selection refused');
RESET ROLE;
-- The labor template hold must block release of its parent, not silently omit labor.
SET LOCAL ROLE authenticated;
SELECT throws_like('SELECT pg_temp.image_release(1)','%not ready for authorization:%image%', 'labor: required child hold prevents parent release');
RESET ROLE;
-- Give labor its existing requirements; this tests the actual public draft creation, not a stub.
UPDATE public.project_ffe_specs SET selected_media='["https://img.test/labor.jpg"]' WHERE ffe_item_id=pg_temp.image_id(7);
SELECT set_config('app.ffe_mutation_rpc','on',true);
UPDATE public.project_ffe_items SET product_id=pg_temp.image_id(307) WHERE id=pg_temp.image_id(7);
SELECT set_config('app.ffe_mutation_rpc','',true);
SET LOCAL ROLE authenticated;
SELECT lives_ok('SELECT pg_temp.image_release(1)','release: existing item picture creates draft with labor');
SELECT lives_ok('SELECT pg_temp.image_release(2)','release: catalog-only picture creates draft');
SELECT lives_ok('SELECT pg_temp.image_release(3)','release: selected-spec string creates draft');
SELECT lives_ok('SELECT pg_temp.image_release(4)','release: selected-spec object creates draft');
RESET ROLE;
SELECT is((SELECT count(*)::integer FROM public.furnishing_authorization_items WHERE source_ffe_item_id IN (pg_temp.image_id(1),pg_temp.image_id(7))),2,
  'release: parent includes labor exactly once');
SELECT is((SELECT snapshot->>'productImageUrl' FROM public.furnishing_authorization_items WHERE source_ffe_item_id=pg_temp.image_id(2)),
  'https://img.test/catalog.jpg','history: frozen catalog image semantics unchanged');
SELECT ok((SELECT bool_and(p.commercial_state='draft' AND p.sent_at IS NULL) FROM public.proposals p
  JOIN public.project_commercial_documents d ON d.proposal_id=p.id WHERE d.project_id=pg_temp.image_id(202) AND NOT d.is_origin),
  'release: all authorizations remain unsent drafts');
SELECT set_config('image_test.unsent_proposal_id', (SELECT proposal_id::text FROM public.project_commercial_documents WHERE project_id=pg_temp.image_id(202) AND NOT is_origin ORDER BY id LIMIT 1),true);
SELECT is((SELECT client_line_total_cents::bigint FROM public.furnishing_authorization_items WHERE source_ffe_item_id=pg_temp.image_id(1)),12000::bigint,
  'money: draft freezes unchanged client cents');
SET LOCAL ROLE authenticated;
SELECT throws_like('SELECT pg_temp.image_release(2)','%already%', 'release: duplicate authorization remains refused');
SET LOCAL request.jwt.claims='{"sub":"83400000-0000-4000-8000-000000000102","role":"authenticated"}';
SELECT throws_like('SELECT public.get_client_commercial_document_bundle(current_setting(''image_test.unsent_proposal_id'')::uuid)',
  '%not found or access denied%', 'permissions: unsent authorization remains hidden from client');
SELECT * FROM finish();
ROLLBACK;
