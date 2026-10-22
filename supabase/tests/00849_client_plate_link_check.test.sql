-- 00849: fail with SQL exceptions, not just TAP text (psql is the oracle).
BEGIN;
INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, instance_id, aud, role)
VALUES
  ('84900000-0000-4000-8000-0000000000a1', 'us49-849-owner@test.invalid',    '', now(), now(), now(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('84900000-0000-4000-8000-0000000000a2', 'us49-849-client@test.invalid',   '', now(), now(), now(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('84900000-0000-4000-8000-0000000000a3', 'us49-849-stranger@test.invalid', '', now(), now(), now(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');
INSERT INTO public.profiles (id, email, full_name, is_designer, created_at, updated_at)
VALUES
  ('84900000-0000-4000-8000-0000000000a1', 'us49-849-owner@test.invalid',    'US49 849 Owner',    true,  now(), now()),
  ('84900000-0000-4000-8000-0000000000a2', 'us49-849-client@test.invalid',   'US49 849 Client',   false, now(), now()),
  ('84900000-0000-4000-8000-0000000000a3', 'us49-849-stranger@test.invalid', 'US49 849 Stranger', false, now(), now())
ON CONFLICT (id) DO UPDATE
SET email = EXCLUDED.email, full_name = EXCLUDED.full_name, is_designer = EXCLUDED.is_designer;

INSERT INTO public.organizations (id, type, name, slug, address)
VALUES ('84900000-0000-4000-8000-0000000000f1', 'design_studio', 'US49 849 Studio', 'us49-849-studio-test',
        '{"city": "Hudson"}'::jsonb);
INSERT INTO public.organization_members (id, user_id, organization_id, role, status, joined_at)
VALUES ('84900000-0000-4000-8000-0000000000e1', '84900000-0000-4000-8000-0000000000a1',
        '84900000-0000-4000-8000-0000000000f1', 'owner', 'active', now());
INSERT INTO public.vendors (id, name, made_in)
VALUES ('84900000-0000-4000-8000-000000000031', 'Atelier Nord', 'Portugal');

INSERT INTO public.projects (id, name, designer_id, client_id, created_by, studio_id, status)
VALUES ('84900000-0000-4000-8000-000000000001', 'US49 849 Whole Home',
        '84900000-0000-4000-8000-0000000000a1', '84900000-0000-4000-8000-0000000000a2',
        '84900000-0000-4000-8000-0000000000a1', '84900000-0000-4000-8000-0000000000f1', 'active');
INSERT INTO public.project_rooms (id, project_id, name, sort_order)
VALUES ('84900000-0000-4000-8000-000000000011', '84900000-0000-4000-8000-000000000001', 'Living room', 0);
INSERT INTO public.products (id, name, captured_at, layer, owner_user_id, status, images) VALUES
  ('84900000-0000-4000-8000-000000000021', 'US49 849 Lounge chair', now(), 'personal',
   '84900000-0000-4000-8000-0000000000a1', 'draft', ARRAY['https://img.test/us49-849-chair.jpg']);

SELECT set_config('app.ffe_mutation_rpc', 'on', true);
INSERT INTO public.project_ffe_items (
  id, project_id, project_room_id, name, status, item_type, product_id, vendor_id, ffe_category,
  quantity, unit_price_cents, line_total_cents, design_disposition, assignment_scope, sort_order
) VALUES ('84900000-0000-4000-8000-000000000101', '84900000-0000-4000-8000-000000000001',
          '84900000-0000-4000-8000-000000000011', 'Lounge chair', 'specified', 'fixed',
          '84900000-0000-4000-8000-000000000021', '84900000-0000-4000-8000-000000000031', 'seating',
          1, 120000, 120000, 'selected', 'room', 0);
INSERT INTO public.proposals (id, project_id, designer_id, title, status, document_kind, commercial_state, total_amount, subtotal)
VALUES ('84900000-0000-4000-8000-000000000401', '84900000-0000-4000-8000-000000000001', '84900000-0000-4000-8000-0000000000a1',
        'US49 849 Authorization', 'accepted', 'furnishings_authorization', 'executed', 120000, 120000);
INSERT INTO public.project_commercial_documents (id, project_id, proposal_id, document_kind, wave_name, is_origin, bound_at, executed_at, created_by)
VALUES ('84900000-0000-4000-8000-000000000402', '84900000-0000-4000-8000-000000000001', '84900000-0000-4000-8000-000000000401',
        'furnishings_authorization', 'Authorization No. 1', false, now(), now(), '84900000-0000-4000-8000-0000000000a1');
INSERT INTO public.furnishing_authorization_items (
  id, commercial_document_id, source_ffe_item_id, product_id, name, room_name, category, item_type,
  quantity, client_unit_price_cents, client_line_total_cents, trade_unit_cost_cents, markup_percent, sort_order, snapshot
) VALUES ('84900000-0000-4000-8000-000000000403', '84900000-0000-4000-8000-000000000402', '84900000-0000-4000-8000-000000000101',
          '84900000-0000-4000-8000-000000000021', 'Lounge chair', 'Living room', 'seating', 'fixed', 1, 120000, 120000, 70000, 71.43, 0,
          '{"clientName": "Lounge chair"}'::jsonb);
UPDATE public.project_ffe_items
   SET source_commercial_document_id = '84900000-0000-4000-8000-000000000402',
       source_authorization_item_id = '84900000-0000-4000-8000-000000000403'
 WHERE id = '84900000-0000-4000-8000-000000000101';
SELECT set_config('app.ffe_mutation_rpc', '', true);


CREATE FUNCTION pg_temp.assert_true(value boolean, label text) RETURNS void
LANGUAGE plpgsql AS $$ BEGIN
  IF value IS DISTINCT FROM true THEN RAISE EXCEPTION 'assertion: %', label; END IF;
  RAISE NOTICE 'ok: %', label;
END $$;
SELECT pg_temp.assert_true(
  NOT has_function_privilege('anon', 'public.list_uncopied_library_images(int)', 'EXECUTE')
  AND NOT has_function_privilege('authenticated', 'public.record_library_link_check(uuid,boolean)', 'EXECUTE')
  AND has_function_privilege('service_role', 'public.record_library_link_check(uuid,boolean)', 'EXECUTE'),
  'link RPCs are service-role only');
SELECT pg_temp.assert_true((SELECT schedule = '20 3 * * *' FROM cron.job WHERE jobname = 'client-plate-link-check'), 'nightly cron scheduled');
SELECT pg_temp.assert_true(EXISTS(SELECT 1 FROM public.list_uncopied_library_images(200) WHERE project_id = '84900000-0000-4000-8000-000000000001'), 'uncopied library image is due');
SELECT pg_temp.assert_true(NOT EXISTS(SELECT 1 FROM public.list_uncopied_library_images(0)), 'zero limit returns no rows');
SELECT public.record_library_link_check(id, true) FROM public.project_ffe_item_images WHERE item_id = '84900000-0000-4000-8000-000000000101';
SELECT pg_temp.assert_true((SELECT bool_and(link_dead AND link_checked_at = now()) FROM public.project_ffe_item_images WHERE item_id = '84900000-0000-4000-8000-000000000101'), 'record marks dead and checked');
SELECT pg_temp.assert_true(NOT EXISTS(SELECT 1 FROM public.list_uncopied_library_images(200) WHERE project_id = '84900000-0000-4000-8000-000000000001'), 'recent check waits seven days');
UPDATE public.project_ffe_item_images SET link_checked_at = now() - interval '8 days' WHERE item_id = '84900000-0000-4000-8000-000000000101';
SELECT pg_temp.assert_true(EXISTS(SELECT 1 FROM public.list_uncopied_library_images(200) WHERE project_id = '84900000-0000-4000-8000-000000000001'), 'old dead link is retried');
SELECT public.record_library_link_check(id, false) FROM public.project_ffe_item_images WHERE item_id = '84900000-0000-4000-8000-000000000101';
SELECT pg_temp.assert_true((SELECT bool_and(NOT link_dead) FROM public.project_ffe_item_images WHERE item_id = '84900000-0000-4000-8000-000000000101'), 'recovered links are live again');

-- Inconclusive answers rotate without inventing or erasing definitive evidence.
CREATE FUNCTION pg_temp.record_inconclusive() RETURNS boolean LANGUAGE plpgsql AS $$
BEGIN
  PERFORM public.record_library_link_check(id, NULL)
  FROM public.project_ffe_item_images
  WHERE item_id = '84900000-0000-4000-8000-000000000101';
  RETURN true;
EXCEPTION WHEN not_null_violation THEN RETURN false;
END $$;
UPDATE public.project_ffe_item_images SET link_checked_at = NULL
WHERE item_id = '84900000-0000-4000-8000-000000000101';
SELECT pg_temp.assert_true(pg_temp.record_inconclusive(), 'inconclusive check accepts NULL');
SELECT pg_temp.assert_true((SELECT bool_and(NOT link_dead AND link_checked_at = now()) FROM public.project_ffe_item_images WHERE item_id = '84900000-0000-4000-8000-000000000101'), 'inconclusive check stamps and preserves live state');
SELECT pg_temp.assert_true(NOT EXISTS(SELECT 1 FROM public.list_uncopied_library_images(200) WHERE project_id = '84900000-0000-4000-8000-000000000001'), 'inconclusive check rotates behind unchecked work for seven days');
UPDATE public.project_ffe_item_images SET link_dead = true, link_checked_at = NULL
WHERE item_id = '84900000-0000-4000-8000-000000000101';
SELECT pg_temp.assert_true(pg_temp.record_inconclusive(), 'dead inconclusive check accepts NULL');
SELECT pg_temp.assert_true((SELECT bool_and(link_dead AND link_checked_at = now()) FROM public.project_ffe_item_images WHERE item_id = '84900000-0000-4000-8000-000000000101'), 'inconclusive check preserves dead state');
SELECT public.record_library_link_check(id, false) FROM public.project_ffe_item_images WHERE item_id = '84900000-0000-4000-8000-000000000101';
SELECT pg_temp.assert_true((SELECT bool_and(NOT link_dead) FROM public.project_ffe_item_images WHERE item_id = '84900000-0000-4000-8000-000000000101'), 'live answer clears dead after inconclusive check');

INSERT INTO public.client_plate_assets (id, project_id, sha256, source_kind, source_ref, original_key, width, height)
VALUES ('84900000-0000-4000-8000-000000000501', '84900000-0000-4000-8000-000000000001', repeat('a',64), 'maker',
        '{"table":"project_ffe_item_images","id":"84900000-0000-4000-8000-000000000999"}', 'plates/test/a.jpg',1600,1200);
UPDATE public.client_plate_requests AS request SET status='done', asset_id='84900000-0000-4000-8000-000000000501'
FROM public.project_ffe_item_images AS picture
WHERE picture.item_id='84900000-0000-4000-8000-000000000101'
AND request.source_ref=jsonb_build_object('table','project_ffe_item_images','id',picture.id::text);
UPDATE public.project_ffe_item_images SET link_checked_at=NULL WHERE item_id='84900000-0000-4000-8000-000000000101';
SELECT pg_temp.assert_true(NOT EXISTS(SELECT 1 FROM public.list_uncopied_library_images(200) WHERE project_id = '84900000-0000-4000-8000-000000000001'), 'deduplicated source request counts as copied');
SELECT pg_temp.assert_true(public._build_project_editorial('84900000-0000-4000-8000-000000000001')->'rooms'->0->'items'->0->'assetIds' = '["84900000-0000-4000-8000-000000000501"]', 'live source exposes its copied plate');
SELECT public.record_library_link_check(id,true) FROM public.project_ffe_item_images WHERE item_id='84900000-0000-4000-8000-000000000101';
SELECT pg_temp.assert_true(public._build_project_editorial('84900000-0000-4000-8000-000000000001')->'rooms'->0->'items'->0->'assetIds' = '["84900000-0000-4000-8000-000000000501"]', 'dead source keeps copied assetIds');
SELECT pg_temp.assert_true(EXISTS(SELECT 1 FROM jsonb_array_elements(public._build_project_editorial('84900000-0000-4000-8000-000000000001')->'assets') AS asset WHERE asset->>'id'='84900000-0000-4000-8000-000000000501'), 'dead source keeps copied envelope asset');
SELECT pg_temp.assert_true(public._build_project_editorial('84900000-0000-4000-8000-000000000001')->'rooms'->0->'items'->0->>'silhouetteKind' = 'seating', 'dead source retains silhouetteKind');

INSERT INTO public.room_scans(id,user_id,project_id,project_room_id,name,status)
VALUES ('84900000-0000-4000-8000-000000000701','84900000-0000-4000-8000-0000000000a1','84900000-0000-4000-8000-000000000001','84900000-0000-4000-8000-000000000011','Filed scan','ready');
INSERT INTO public.room_scan_images(id,scan_id,role,image_url,captured_at)
VALUES ('84900000-0000-4000-8000-000000000702','84900000-0000-4000-8000-000000000701','hero','coverage/owner/scan/still.heic',now());
INSERT INTO public.client_plate_assets(id,project_id,sha256,source_kind,source_ref,original_key,width,height)
VALUES ('84900000-0000-4000-8000-000000000703','84900000-0000-4000-8000-000000000001',repeat('b',64),'scan','{"table":"room_scan_images","id":"84900000-0000-4000-8000-000000000702"}','plates/test/b.jpg',1600,1200);
INSERT INTO public.client_plate_requests(project_id,source_kind,source_ref,source_url,status,asset_id)
VALUES ('84900000-0000-4000-8000-000000000001','scan','{"table":"room_scan_images","id":"84900000-0000-4000-8000-000000000702"}','coverage/owner/scan/still.heic','done','84900000-0000-4000-8000-000000000703')
ON CONFLICT(project_id,source_kind,source_ref) DO UPDATE SET status='done',asset_id=EXCLUDED.asset_id;
SELECT pg_temp.assert_true(public._build_project_editorial('84900000-0000-4000-8000-000000000001')->'rooms'->0->'scanAssetIds' = '["84900000-0000-4000-8000-000000000703"]', 'filed scan appears in room scanAssetIds');
SELECT pg_temp.assert_true(EXISTS(SELECT 1 FROM jsonb_array_elements(public._build_project_editorial('84900000-0000-4000-8000-000000000001')->'assets') AS asset WHERE asset->>'id'='84900000-0000-4000-8000-000000000703' AND asset->>'sourceKind'='scan'), 'filed scan appears as scan asset');
UPDATE public.room_scans SET project_room_id=NULL WHERE id='84900000-0000-4000-8000-000000000701';
SELECT pg_temp.assert_true(public._build_project_editorial('84900000-0000-4000-8000-000000000001')->'rooms'->0->'scanAssetIds' = '[]', 'unfiled scan excluded from room scanAssetIds');
SELECT pg_temp.assert_true(NOT EXISTS(SELECT 1 FROM jsonb_array_elements(public._build_project_editorial('84900000-0000-4000-8000-000000000001')->'assets') AS asset WHERE asset->>'id'='84900000-0000-4000-8000-000000000703'), 'unfiled scan excluded from envelope assets');
SELECT pg_temp.assert_true(
  NOT has_function_privilege('anon', 'public.begin_client_plate_check_run()', 'EXECUTE')
  AND NOT has_function_privilege('authenticated', 'public.finish_client_plate_check_run(bigint,text,jsonb,text)', 'EXECUTE')
  AND has_function_privilege('service_role', 'public.begin_client_plate_check_run()', 'EXECUTE'),
  'run RPCs are service-role only');
DO $$ DECLARE run_id bigint; BEGIN
  run_id := public.begin_client_plate_check_run();
  PERFORM pg_temp.assert_true(EXISTS(SELECT 1 FROM public.job_runs WHERE id=run_id AND job_name='client-plate-check' AND status='running'), 'run begins in job_runs');
  PERFORM public.finish_client_plate_check_run(run_id, 'succeeded', '{"checked":3,"dead":1,"alive":2,"skipped":4,"errors":0}');
  PERFORM pg_temp.assert_true(EXISTS(SELECT 1 FROM public.job_runs WHERE id=run_id AND status='succeeded' AND finished_at IS NOT NULL AND detail @> '{"checked":3,"dead":1,"alive":2,"skipped":4,"errors":0}'), 'run finishes with all classification counts');
  BEGIN
    PERFORM public.finish_client_plate_check_run(run_id, 'failed', '{}', 'late');
    RAISE EXCEPTION 'assertion: terminal run accepted a second finish';
  EXCEPTION WHEN no_data_found THEN NULL; END;
END $$;
-- Cleanup runs even with composition disabled, leaving future open work alone.
INSERT INTO public.projects (id, name, designer_id, client_id, created_by, studio_id, status)
SELECT id, 'Cleanup ' || status, '84900000-0000-4000-8000-0000000000a1'::uuid,
       '84900000-0000-4000-8000-0000000000a2'::uuid, '84900000-0000-4000-8000-0000000000a1'::uuid,
       '84900000-0000-4000-8000-0000000000f1'::uuid, status::public.project_status
FROM (VALUES ('84900000-0000-4000-8000-000000000801'::uuid, 'completed'),
             ('84900000-0000-4000-8000-000000000802'::uuid, 'archived')) AS jobs(id, status);
INSERT INTO public.client_edition_requests (project_id, reason, debounce_key, available_at)
SELECT id, 'cleanup_test', id::text || ':cleanup_test', now() + interval '1 day'
FROM public.projects WHERE id IN ('84900000-0000-4000-8000-000000000801', '84900000-0000-4000-8000-000000000802', '84900000-0000-4000-8000-000000000001');
UPDATE public.llm_feature_controls SET enabled = false WHERE feature = 'client-edition-compose';
SELECT pg_temp.assert_true(public.dispatch_client_edition_compose() IS NULL, 'disabled dispatcher still performs cleanup');
SELECT pg_temp.assert_true((SELECT count(*) = 2 AND bool_and(status = 'done' AND close_reason = 'closed') FROM public.client_edition_requests WHERE reason = 'cleanup_test' AND project_id IN ('84900000-0000-4000-8000-000000000801', '84900000-0000-4000-8000-000000000802')), 'set-based cleanup closes completed and archived requests');
SELECT pg_temp.assert_true((SELECT status = 'queued' FROM public.client_edition_requests WHERE reason = 'cleanup_test' AND project_id = '84900000-0000-4000-8000-000000000001'), 'set-based cleanup preserves open future request');
SELECT pg_temp.assert_true(position('FROM public.projects AS project' in pg_get_functiondef('public.dispatch_client_edition_compose()'::regprocedure)) > 0 AND position('_client_edition_closed(request.project_id)' in pg_get_functiondef('public.dispatch_client_edition_compose()'::regprocedure)) = 0, 'cleanup joins projects instead of per-request definer lookup');
ROLLBACK;
