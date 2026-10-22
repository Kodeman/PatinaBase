-- D1: only explicitly filed context photos cross the private Field boundary.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT plan(25);

INSERT INTO auth.users(id,email,encrypted_password,email_confirmed_at,created_at,updated_at,instance_id,aud,role)
VALUES
 ('85200000-0000-4000-8000-0000000000a1','us49-852-owner@test.invalid','',now(),now(),now(),'00000000-0000-0000-0000-000000000000','authenticated','authenticated'),
 ('85200000-0000-4000-8000-0000000000a2','us49-852-other@test.invalid','',now(),now(),now(),'00000000-0000-0000-0000-000000000000','authenticated','authenticated');
INSERT INTO public.profiles(id,email,full_name,is_designer)
VALUES
 ('85200000-0000-4000-8000-0000000000a1','us49-852-owner@test.invalid','Installed Owner',true),
 ('85200000-0000-4000-8000-0000000000a2','us49-852-other@test.invalid','Installed Other',true)
ON CONFLICT(id) DO UPDATE SET is_designer=true;
INSERT INTO public.organizations(id,type,name,slug)
VALUES
 ('85200000-0000-4000-8000-0000000000f1','design_studio','Middle Studio','us49-852-middle'),
 ('85200000-0000-4000-8000-0000000000f2','design_studio','Other Studio','us49-852-other');
INSERT INTO public.organization_members(user_id,organization_id,role,status)
VALUES
 ('85200000-0000-4000-8000-0000000000a1','85200000-0000-4000-8000-0000000000f1','owner','active'),
 ('85200000-0000-4000-8000-0000000000a2','85200000-0000-4000-8000-0000000000f2','owner','active');
-- A legacy project can name a designer who is not in its owning studio.
INSERT INTO public.projects(id,name,designer_id,created_by,studio_id,status)
VALUES
 ('85200000-0000-4000-8000-000000000001','Whole home','85200000-0000-4000-8000-0000000000a1','85200000-0000-4000-8000-0000000000a1','85200000-0000-4000-8000-0000000000f1','active'),
 ('85200000-0000-4000-8000-000000000002','Other home','85200000-0000-4000-8000-0000000000a1','85200000-0000-4000-8000-0000000000a1','85200000-0000-4000-8000-0000000000f2','active');
INSERT INTO public.project_rooms(id,project_id,name,sort_order)
VALUES ('85200000-0000-4000-8000-000000000011','85200000-0000-4000-8000-000000000001','Living room',0);

INSERT INTO public.field_captures(id,client_capture_id,designer_id,capture_kind,project_id,project_room_id,primary_photo_path,captured_at)
VALUES
 ('85200000-0000-4000-8000-000000000101','85200000-0000-4000-8000-000000000101','85200000-0000-4000-8000-0000000000a1','context','85200000-0000-4000-8000-000000000001','85200000-0000-4000-8000-000000000011','85200000-0000-4000-8000-0000000000a1/85200000-0000-4000-8000-000000000101/photo.jpg','2026-08-02 12:00:00+00'),
 ('85200000-0000-4000-8000-000000000102','85200000-0000-4000-8000-000000000102','85200000-0000-4000-8000-0000000000a1','specimen','85200000-0000-4000-8000-000000000001',NULL,'85200000-0000-4000-8000-0000000000a1/85200000-0000-4000-8000-000000000102/photo.jpg',now()),
 ('85200000-0000-4000-8000-000000000103','85200000-0000-4000-8000-000000000103','85200000-0000-4000-8000-0000000000a1','context',NULL,NULL,'85200000-0000-4000-8000-0000000000a1/85200000-0000-4000-8000-000000000103/photo.jpg',now()),
 ('85200000-0000-4000-8000-000000000104','85200000-0000-4000-8000-000000000104','85200000-0000-4000-8000-0000000000a1','context','85200000-0000-4000-8000-000000000002',NULL,'85200000-0000-4000-8000-0000000000a1/85200000-0000-4000-8000-000000000104/photo.jpg',now()),
 ('85200000-0000-4000-8000-000000000105','85200000-0000-4000-8000-000000000105','85200000-0000-4000-8000-0000000000a1','context','85200000-0000-4000-8000-000000000001',NULL,NULL,now()),
 ('85200000-0000-4000-8000-000000000106','85200000-0000-4000-8000-000000000106','85200000-0000-4000-8000-0000000000a1','note','85200000-0000-4000-8000-000000000001',NULL,'85200000-0000-4000-8000-0000000000a1/85200000-0000-4000-8000-000000000106/photo.jpg',now());

CREATE TEMP VIEW installed_requests AS
SELECT * FROM public.client_plate_requests
WHERE source_kind='installed' AND source_ref->>'id' LIKE '85200000-%';
SELECT is((SELECT count(*) FROM installed_requests),1::bigint,'enqueue: only a filed context photo owned by the studio enqueues');
SELECT is((SELECT status FROM installed_requests),'queued','enqueue: owned context photo enters the existing inbox');
SELECT ok(NOT EXISTS(SELECT 1 FROM installed_requests WHERE source_ref->>'id' IN
 ('85200000-0000-4000-8000-000000000102','85200000-0000-4000-8000-000000000103','85200000-0000-4000-8000-000000000104','85200000-0000-4000-8000-000000000105','85200000-0000-4000-8000-000000000106')),
 'enqueue: specimen, unfiled, other-studio, empty and note captures do not enqueue');
SELECT ok(public.client_plate_source_owned(project_id,'field_captures',id,primary_photo_path),
 'ownership: the exact context photo belongs to its project') FROM public.field_captures WHERE id='85200000-0000-4000-8000-000000000101';
SELECT ok(NOT public.client_plate_source_owned('85200000-0000-4000-8000-000000000002','field_captures',id,primary_photo_path),
 'ownership: another project cannot sign the capture') FROM public.field_captures WHERE id='85200000-0000-4000-8000-000000000101';
SELECT ok(NOT public.client_plate_source_owned(project_id,'field_captures',id,primary_photo_path),
 'ownership: a specimen is not a homeowner source') FROM public.field_captures WHERE id='85200000-0000-4000-8000-000000000102';
SELECT ok(NOT public.client_plate_source_owned(project_id,'field_captures',id,primary_photo_path),
 'ownership: routing alone does not grant owning-studio membership') FROM public.field_captures WHERE id='85200000-0000-4000-8000-000000000104';
SELECT ok(bool_and(NOT public.client_plate_source_owned('85200000-0000-4000-8000-000000000001','field_captures','85200000-0000-4000-8000-000000000101',path)),
 'ownership: URL, foreign owner, foreign capture, unlisted file and traversal all fail closed')
FROM (VALUES ('https://cdn.test/photo.jpg'),
 ('85200000-0000-4000-8000-0000000000a2/85200000-0000-4000-8000-000000000101/photo.jpg'),
 ('85200000-0000-4000-8000-0000000000a1/85200000-0000-4000-8000-000000000102/photo.jpg'),
 ('85200000-0000-4000-8000-0000000000a1/85200000-0000-4000-8000-000000000101/private-audio.m4a'),
 ('85200000-0000-4000-8000-0000000000a1/85200000-0000-4000-8000-000000000101/%2e%2e/photo.jpg')) AS paths(path);
SELECT ok(NOT public.client_plate_source_owned('85200000-0000-4000-8000-000000000001','unknown',gen_random_uuid(),'photo.jpg')
 AND NOT public.client_plate_source_owned(NULL,NULL,NULL,NULL),'ownership: unknown and missing sources stay fail closed');

-- Later filing and delayed media sync reuse the same trigger and debounce key.
UPDATE public.field_captures SET project_id='85200000-0000-4000-8000-000000000001'
WHERE id='85200000-0000-4000-8000-000000000103';
SELECT is((SELECT count(*) FROM installed_requests),2::bigint,'enqueue: routing a context photo later enqueues');
UPDATE public.field_captures SET notes='private note never enters the caption'
WHERE id='85200000-0000-4000-8000-000000000101';
SELECT is((SELECT count(*) FROM installed_requests),2::bigint,'enqueue: unrelated updates debounce instead of duplicating');
UPDATE public.field_captures SET photos='[{"path":"85200000-0000-4000-8000-0000000000a1/85200000-0000-4000-8000-000000000105/photo.jpg"}]'
WHERE id='85200000-0000-4000-8000-000000000105';
SELECT is((SELECT count(*) FROM installed_requests),3::bigint,'enqueue: a stored photos path works without a primary path');

INSERT INTO public.client_plate_assets(id,project_id,sha256,source_kind,source_ref,original_key,width,height)
VALUES
 ('85200000-0000-4000-8000-000000000201','85200000-0000-4000-8000-000000000001',repeat('a',64),'installed','{"table":"field_captures","id":"85200000-0000-4000-8000-000000000101"}','plates/test/a.jpg',2400,1600),
 ('85200000-0000-4000-8000-000000000202','85200000-0000-4000-8000-000000000001',repeat('b',64),'scan','{}','plates/test/b.jpg',2400,1600);
UPDATE public.client_plate_requests SET status='done',asset_id='85200000-0000-4000-8000-000000000201'
WHERE source_ref='{"table":"field_captures","id":"85200000-0000-4000-8000-000000000101"}' AND project_id='85200000-0000-4000-8000-000000000001';
INSERT INTO public.room_scans(id,user_id,project_id,project_room_id,name,status)
VALUES ('85200000-0000-4000-8000-000000000301','85200000-0000-4000-8000-0000000000a1','85200000-0000-4000-8000-000000000001','85200000-0000-4000-8000-000000000011','Scan','ready');
INSERT INTO public.room_scan_images(id,scan_id,role,image_url,captured_at,created_at)
VALUES ('85200000-0000-4000-8000-000000000302','85200000-0000-4000-8000-000000000301','hero','photos/owner/scan/photo.jpg','2026-08-02 12:00:00+00','2026-08-02 12:00:00+00');
UPDATE public.client_plate_requests SET status='done',asset_id='85200000-0000-4000-8000-000000000202'
WHERE source_ref='{"table":"room_scan_images","id":"85200000-0000-4000-8000-000000000302"}';
CREATE TEMP VIEW envelope AS SELECT public._build_project_editorial('85200000-0000-4000-8000-000000000001') AS body;
SELECT is((SELECT body#>>'{assets,0,sourceKind}' FROM envelope),'installed','builder: installed plate precedes scan');
SELECT is((SELECT body#>'{assets,0,caption}' FROM envelope),
 '{"what":"Living room","whose":"Middle Studio","when":"photographed 2 August 2026"}'::jsonb,
 'builder: installed caption uses the room, studio and photographed date');
SELECT is((SELECT body#>>'{assets,1,caption,when}' FROM envelope),'2 August 2026','caption: a 2 August date has no leading zero for existing sources');
SELECT is((SELECT body#>'{rooms,0,scanAssetIds}' FROM envelope),
 '["85200000-0000-4000-8000-000000000201","85200000-0000-4000-8000-000000000202"]'::jsonb,
 'builder: installed photo leads its existing room-photo slot');
UPDATE public.field_captures SET project_room_id=NULL WHERE id='85200000-0000-4000-8000-000000000101';
SELECT is((SELECT body#>>'{assets,0,caption,what}' FROM envelope),'Whole home','builder: a project-filed context photo needs no guessed room');
UPDATE public.field_captures SET capture_kind='specimen' WHERE id='85200000-0000-4000-8000-000000000101';
SELECT ok(NOT EXISTS(SELECT 1 FROM envelope,jsonb_array_elements(body->'assets') AS asset WHERE asset->>'sourceKind'='installed'),
 'builder: stale inbox links cannot expose a specimen');
UPDATE public.field_captures SET capture_kind='context' WHERE id='85200000-0000-4000-8000-000000000101';
UPDATE public.client_plate_assets SET concept_seen=true WHERE id='85200000-0000-4000-8000-000000000201';
SELECT ok(EXISTS(SELECT 1 FROM envelope,jsonb_array_elements(body->'assets') AS asset
 WHERE asset->>'id'='85200000-0000-4000-8000-000000000201' AND asset->>'sourceKind'='concept'),
 'builder: shared installed bytes never undo concept-never-hero provenance');
SELECT ok(NOT (SELECT body::text LIKE '%private note%' FROM envelope),'builder: private Field notes never enter the envelope');
UPDATE public.organization_members SET status='suspended'
WHERE user_id='85200000-0000-4000-8000-0000000000a1' AND organization_id='85200000-0000-4000-8000-0000000000f1';
SELECT ok(NOT EXISTS(SELECT 1 FROM envelope,jsonb_array_elements(body->'assets') AS asset
 WHERE asset->>'id'='85200000-0000-4000-8000-000000000201'),'builder: inactive studio membership excludes the installed source');
UPDATE public.organization_members SET status='active'
WHERE user_id='85200000-0000-4000-8000-0000000000a1' AND organization_id='85200000-0000-4000-8000-0000000000f1';
UPDATE public.projects SET status='completed' WHERE id='85200000-0000-4000-8000-000000000001';
UPDATE public.field_captures SET primary_photo_path='85200000-0000-4000-8000-0000000000a1/85200000-0000-4000-8000-000000000105/new.jpg'
WHERE id='85200000-0000-4000-8000-000000000105';
SELECT ok(NOT EXISTS(SELECT 1 FROM installed_requests WHERE source_url LIKE '%new.jpg'),'freeze: a closed job gets no new installed copy');
SELECT ok(NOT has_function_privilege('anon','public.client_plate_enqueue_installed_capture()','EXECUTE')
 AND NOT has_function_privilege('authenticated','public.client_plate_enqueue_installed_capture()','EXECUTE'),
 'permissions: API roles cannot call the enqueue trigger');
SELECT ok(has_function_privilege('service_role','public.client_plate_source_owned(uuid,text,uuid,text)','EXECUTE')
 AND NOT has_function_privilege('authenticated','public.client_plate_source_owned(uuid,text,uuid,text)','EXECUTE'),
 'permissions: ownership check stays service-only');
SELECT has_trigger('public','field_captures','trg_client_plate_installed_capture','shape: Field insert and update enqueue trigger exists');

SELECT * FROM finish(true);
ROLLBACK;
