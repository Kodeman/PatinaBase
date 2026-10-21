-- ═══════════════════════════════════════════════════════════════════════════
-- 00843 — plate copies, their copy queue, and the plate check (US-49 W1)
--
-- Named cases:
--   lockdown    RLS on both tables with no policy; authenticated reads neither
--               and calls none of the copy-lane functions; anon cannot call
--               client_can_read_plate, authenticated can
--   cron        client-plate-copy-dispatch runs every minute
--   enqueue     a library picture, an upload, a concept render, a scan still
--               and two board covers each queue one request with
--               source_ref {table,id} and the address the copy is fetched from
--   claim       claim leases the oldest queued requests with a token each and
--               counts the attempt; a second claim skips the leased ones
--   record      a wrong token or an expired lease is refused (55000); the
--               right one writes the asset, closes the request and names the
--               asset on it; a second source with the same bytes gets the same
--               asset; an original outside plates/<project>/<sha256>/ is
--               refused (23514); a closed request cannot be recorded again
--   fail        a wrong token is refused; the right one re-queues with the
--               error; the third attempt stays failed
--   re-queue    the same address queued again changes nothing; a replaced
--               concept render re-queues with attempts 0 and no asset
--   dispatch    an expired lease goes back to the queue; a queued request
--               opens one job_runs row (trigger cron); with nothing queued no
--               row is opened; begin/finish close a run, and a bad status or
--               a closed run is refused
--   plate check the client gets the project id for a plate the project
--               holds; a stranger and an unknown sha256 get NULL
--
-- Run (from supabase/): psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" \
--        -v ON_ERROR_STOP=1 -f tests/00843_client_plate_assets.test.sql
-- Everything is rolled back.
-- ═══════════════════════════════════════════════════════════════════════════
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT plan(50);

-- ─── lockdown ──────────────────────────────────────────────────────────────

SELECT ok((SELECT relrowsecurity FROM pg_class WHERE oid = 'public.client_plate_assets'::regclass),
          'lockdown: RLS is on for client_plate_assets');
SELECT ok((SELECT relrowsecurity FROM pg_class WHERE oid = 'public.client_plate_requests'::regclass),
          'lockdown: RLS is on for client_plate_requests');
SELECT is((SELECT count(*)::int FROM pg_policies
           WHERE schemaname = 'public' AND tablename IN ('client_plate_assets', 'client_plate_requests')),
          0, 'lockdown: neither table has a policy');
SELECT ok(NOT has_table_privilege('authenticated', 'public.client_plate_assets', 'SELECT'),
          'lockdown: authenticated cannot read client_plate_assets');
SELECT ok(NOT has_table_privilege('authenticated', 'public.client_plate_requests', 'SELECT'),
          'lockdown: authenticated cannot read client_plate_requests');
SELECT ok(NOT has_function_privilege('authenticated', 'public.claim_client_plate_requests(integer)', 'EXECUTE'),
          'lockdown: authenticated cannot claim');
SELECT ok(NOT has_function_privilege('authenticated', 'public.record_client_plate_asset(uuid, uuid, jsonb)', 'EXECUTE'),
          'lockdown: authenticated cannot record');
SELECT ok(NOT has_function_privilege('authenticated', 'public.fail_client_plate_request(uuid, uuid, text)', 'EXECUTE'),
          'lockdown: authenticated cannot fail a request');
SELECT ok(NOT has_function_privilege('authenticated', 'public.dispatch_client_plate_copy()', 'EXECUTE'),
          'lockdown: authenticated cannot dispatch');
SELECT ok(NOT has_function_privilege('anon', 'public.client_can_read_plate(uuid, text)', 'EXECUTE'),
          'lockdown: anon cannot call client_can_read_plate');
SELECT ok(has_function_privilege('authenticated', 'public.client_can_read_plate(uuid, text)', 'EXECUTE'),
          'lockdown: authenticated can call client_can_read_plate');

SELECT is(
  (SELECT schedule || ' ' || command FROM cron.job WHERE jobname = 'client-plate-copy-dispatch'),
  '* * * * * SELECT public.dispatch_client_plate_copy();',
  'cron: client-plate-copy-dispatch runs every minute'
);

-- ─── fixtures (as postgres) ────────────────────────────────────────────────
-- O owner of the studio · C the client · Z a stranger with no seat

INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, instance_id, aud, role)
VALUES
  ('84300000-0000-4000-8000-0000000000a1', 'us49-plate-owner@test.invalid',    '', now(), now(), now(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('84300000-0000-4000-8000-0000000000a2', 'us49-plate-client@test.invalid',   '', now(), now(), now(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('84300000-0000-4000-8000-0000000000a3', 'us49-plate-stranger@test.invalid', '', now(), now(), now(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');

INSERT INTO public.profiles (id, email, full_name, is_designer, created_at, updated_at)
VALUES
  ('84300000-0000-4000-8000-0000000000a1', 'us49-plate-owner@test.invalid',    'US49 Plate Owner',    true,  now(), now()),
  ('84300000-0000-4000-8000-0000000000a2', 'us49-plate-client@test.invalid',   'US49 Plate Client',   false, now(), now()),
  ('84300000-0000-4000-8000-0000000000a3', 'us49-plate-stranger@test.invalid', 'US49 Plate Stranger', false, now(), now())
ON CONFLICT (id) DO UPDATE
SET email = EXCLUDED.email, full_name = EXCLUDED.full_name, is_designer = EXCLUDED.is_designer;

INSERT INTO public.organizations (id, type, name, slug)
VALUES ('84300000-0000-4000-8000-0000000000f1', 'design_studio', 'US49 Plate Studio', 'us49-plate-studio-test');

INSERT INTO public.organization_members (id, user_id, organization_id, role, status, joined_at)
VALUES ('84300000-0000-4000-8000-0000000000e1', '84300000-0000-4000-8000-0000000000a1',
        '84300000-0000-4000-8000-0000000000f1', 'owner', 'active', now());

INSERT INTO public.projects (id, name, designer_id, client_id, created_by, studio_id, status)
VALUES ('84300000-0000-4000-8000-000000000001', 'US49 Plate Home',
        '84300000-0000-4000-8000-0000000000a1', '84300000-0000-4000-8000-0000000000a2',
        '84300000-0000-4000-8000-0000000000a1', '84300000-0000-4000-8000-0000000000f1', 'active');

INSERT INTO public.project_rooms (id, project_id, name, sort_order)
VALUES ('84300000-0000-4000-8000-000000000011', '84300000-0000-4000-8000-000000000001', 'Kitchen', 0);

-- Requests already in the queue belong to other jobs; park them so the
-- claims below see only this job's.
UPDATE public.client_plate_requests
   SET status = 'failed', lease_token = NULL, lease_expires_at = NULL
 WHERE status IN ('queued', 'leased');

INSERT INTO public.products (id, name, captured_at, layer, owner_user_id, status, images) VALUES
  ('84300000-0000-4000-8000-000000000021', 'US49 Stool', now(), 'personal',
   '84300000-0000-4000-8000-0000000000a1', 'draft', ARRAY['https://img.test/us49-stool.jpg']);

SELECT set_config('app.ffe_mutation_rpc', 'on', true);
INSERT INTO public.project_ffe_items (
  id, project_id, name, status, item_type, product_id, quantity,
  unit_price_cents, line_total_cents, design_disposition, assignment_scope, sort_order
) VALUES ('84300000-0000-4000-8000-000000000101', '84300000-0000-4000-8000-000000000001', 'Stool',
          'specified', 'fixed', '84300000-0000-4000-8000-000000000021', 1, 30000, 30000, 'selected', 'unassigned', 0);
SELECT set_config('app.ffe_mutation_rpc', '', true);

INSERT INTO public.project_ffe_item_images (id, item_id, url, storage_path, source, position, is_primary)
VALUES ('84300000-0000-4000-8000-000000000201', '84300000-0000-4000-8000-000000000101',
        'http://127.0.0.1:54321/storage/v1/object/public/project-item-images/84300000-0000-4000-8000-000000000001/upload-1.jpg',
        '84300000-0000-4000-8000-000000000001/upload-1.jpg', 'upload', 1, false);

INSERT INTO public.room_scans (id, user_id, name, project_id, project_room_id)
VALUES ('84300000-0000-4000-8000-000000000301', '84300000-0000-4000-8000-0000000000a1', 'Kitchen scan',
        '84300000-0000-4000-8000-000000000001', '84300000-0000-4000-8000-000000000011');
INSERT INTO public.room_scan_images (id, scan_id, role, image_url, captured_at)
VALUES ('84300000-0000-4000-8000-000000000302', '84300000-0000-4000-8000-000000000301', 'still',
        'http://127.0.0.1:54321/storage/v1/object/public/room-scans/scan-301/still-1.jpg?v=1', now());

INSERT INTO public.project_boards (id, project_id, name, cover_image_url, sort_order)
VALUES
  ('84300000-0000-4000-8000-000000000401', '84300000-0000-4000-8000-000000000001', 'Kitchen board',
   'http://127.0.0.1:54321/storage/v1/object/public/proposal-mood-boards/board-401/cover.jpg', 0),
  ('84300000-0000-4000-8000-000000000402', '84300000-0000-4000-8000-000000000001', 'Pinned board',
   'https://img.test/us49-board-cover.jpg', 1);

-- ─── enqueue ───────────────────────────────────────────────────────────────

SELECT is(
  (SELECT source_kind || ' ' || source_url || ' ' || status
     FROM public.client_plate_requests AS request
     JOIN public.project_ffe_item_images AS picture
       ON request.source_ref = jsonb_build_object('table', 'project_ffe_item_images', 'id', picture.id)
    WHERE picture.item_id = '84300000-0000-4000-8000-000000000101' AND picture.source = 'library'),
  'maker https://img.test/us49-stool.jpg queued',
  'enqueue: the library picture snapshotted onto a new line queues its hotlink'
);
SELECT is(
  (SELECT source_kind || ' ' || source_url FROM public.client_plate_requests
    WHERE source_ref = '{"table": "project_ffe_item_images", "id": "84300000-0000-4000-8000-000000000201"}'),
  'upload 84300000-0000-4000-8000-000000000001/upload-1.jpg',
  'enqueue: an upload queues its storage path'
);
SELECT is(
  (SELECT source_kind || ' ' || source_url FROM public.client_plate_requests
    WHERE source_ref = '{"table": "room_scan_images", "id": "84300000-0000-4000-8000-000000000302"}'),
  'scan scan-301/still-1.jpg',
  'enqueue: a scan still queues its room-scans key'
);
SELECT is(
  (SELECT source_kind || ' ' || source_url FROM public.client_plate_requests
    WHERE source_ref = '{"table": "project_boards", "id": "84300000-0000-4000-8000-000000000401"}'),
  'board board-401/cover.jpg',
  'enqueue: a stored board cover queues its proposal-mood-boards path'
);
SELECT is(
  (SELECT source_url FROM public.client_plate_requests
    WHERE source_ref = '{"table": "project_boards", "id": "84300000-0000-4000-8000-000000000402"}'),
  'https://img.test/us49-board-cover.jpg',
  'enqueue: an outside board cover queues its address as it is'
);
SELECT is(
  (SELECT count(*)::int FROM public.client_plate_requests
    WHERE project_id = '84300000-0000-4000-8000-000000000001' AND status = 'queued' AND attempts = 0),
  5,
  'enqueue: five sources, five queued requests'
);

-- ─── claim ─────────────────────────────────────────────────────────────────

CREATE TEMP TABLE first_claim ON COMMIT DROP AS
SELECT * FROM public.claim_client_plate_requests(2);
CREATE TEMP TABLE second_claim ON COMMIT DROP AS
SELECT * FROM public.claim_client_plate_requests(10);

SELECT ok(
  (SELECT count(*) = 2
      AND bool_and(status = 'leased' AND attempts = 1 AND lease_expires_at > now())
      AND count(DISTINCT lease_token) = 2
     FROM first_claim),
  'claim: two requests leased, a token each, the attempt counted'
);
SELECT is(
  (SELECT count(*)::int FROM second_claim WHERE id IN (SELECT id FROM first_claim)),
  0,
  'claim: a second claim skips the leased requests'
);
SELECT is((SELECT count(*)::int FROM second_claim), 3, 'claim: the second claim takes the other three');

-- ─── record ────────────────────────────────────────────────────────────────

SELECT throws_ok(
  format($$SELECT public.record_client_plate_asset(%L, %L, %L::jsonb)$$,
    (SELECT id FROM first_claim ORDER BY id LIMIT 1),
    extensions.gen_random_uuid(),
    jsonb_build_object('sha256', repeat('b', 64), 'width', 1200, 'height', 800,
      'originalKey', 'plates/84300000-0000-4000-8000-000000000001/' || repeat('b', 64) || '/original.jpg')),
  '55000', NULL,
  'record: a wrong lease token is refused'
);

SELECT 'recorded' AS first_asset
FROM (SELECT set_config('us49.first_asset', public.record_client_plate_asset(
  (SELECT id FROM first_claim ORDER BY id LIMIT 1),
  (SELECT lease_token FROM first_claim ORDER BY id LIMIT 1),
  jsonb_build_object('sha256', repeat('b', 64), 'width', 1200, 'height', 800, 'format', 'jpeg',
    'ground', 'scene', 'dominantHex', '#334455', 'lqip', 'data:image/webp;base64,AAAA',
    'originalKey', 'plates/84300000-0000-4000-8000-000000000001/' || repeat('b', 64) || '/original.jpg',
    'crops', '{"wide": {"rect": [0, 0, 1200, 675], "widths": [800]}}'::jsonb,
    'source_kind', (SELECT source_kind FROM first_claim ORDER BY id LIMIT 1),
    'source_ref', (SELECT source_ref FROM first_claim ORDER BY id LIMIT 1)))::text, true)) AS stash;

SELECT is(
  (SELECT status || ' ' || asset_id::text || ' ' || (lease_token IS NULL)::text
     FROM public.client_plate_requests WHERE id = (SELECT id FROM first_claim ORDER BY id LIMIT 1)),
  'done ' || current_setting('us49.first_asset') || ' true',
  'record: the request is done and names its asset'
);
SELECT is(
  (SELECT width || 'x' || height || ' ' || ground || ' ' || dominant_hex || ' ' || (crops ? 'wide')::text
     FROM public.client_plate_assets WHERE id = current_setting('us49.first_asset')::uuid),
  '1200x800 scene #334455 true',
  'record: the asset carries the code-computed facts'
);
SELECT ok(
  (SELECT asset.source_kind = claim.source_kind AND asset.source_ref = claim.source_ref
            AND asset.project_id = '84300000-0000-4000-8000-000000000001'
     FROM public.client_plate_assets AS asset, (SELECT * FROM first_claim ORDER BY id LIMIT 1) AS claim
    WHERE asset.id = current_setting('us49.first_asset')::uuid),
  'record: the asset takes its project and source from the request'
);
SELECT throws_ok(
  format($$SELECT public.record_client_plate_asset(%L, %L, %L::jsonb)$$,
    (SELECT id FROM first_claim ORDER BY id LIMIT 1),
    (SELECT lease_token FROM first_claim ORDER BY id LIMIT 1),
    jsonb_build_object('sha256', repeat('b', 64), 'width', 1200, 'height', 800,
      'originalKey', 'plates/84300000-0000-4000-8000-000000000001/' || repeat('b', 64) || '/original.jpg')),
  '55000', NULL,
  'record: a closed request cannot be recorded again'
);
SELECT is(
  public.record_client_plate_asset(
    (SELECT id FROM first_claim ORDER BY id DESC LIMIT 1),
    (SELECT lease_token FROM first_claim ORDER BY id DESC LIMIT 1),
    jsonb_build_object('sha256', repeat('b', 64), 'width', 1200, 'height', 800,
      'originalKey', 'plates/84300000-0000-4000-8000-000000000001/' || repeat('b', 64) || '/original.jpg')),
  current_setting('us49.first_asset')::uuid,
  'record: a second source with the same bytes gets the same asset'
);
SELECT is(
  (SELECT count(*)::int FROM public.client_plate_assets WHERE project_id = '84300000-0000-4000-8000-000000000001'),
  1,
  'record: one asset for the shared bytes'
);
SELECT throws_ok(
  format($$SELECT public.record_client_plate_asset(%L, %L, %L::jsonb)$$,
    (SELECT id FROM second_claim ORDER BY id LIMIT 1),
    (SELECT lease_token FROM second_claim ORDER BY id LIMIT 1),
    jsonb_build_object('sha256', repeat('c', 64), 'width', 1200, 'height', 800,
      'originalKey', 'plates/84300000-0000-4000-8000-000000000999/' || repeat('c', 64) || '/original.jpg')),
  '23514', NULL,
  'record: an original outside plates/<project>/<sha256>/ is refused'
);
SELECT throws_ok(
  format($$SELECT public.record_client_plate_asset(%L, %L, %L::jsonb)$$,
    (SELECT id FROM second_claim ORDER BY id LIMIT 1),
    (SELECT lease_token FROM second_claim ORDER BY id LIMIT 1),
    jsonb_build_object('sha256', repeat('c', 64), 'width', 1200, 'height', 800,
      'source_ref', '{"table": "project_rooms", "id": "84300000-0000-4000-8000-000000000999"}'::jsonb,
      'originalKey', 'plates/84300000-0000-4000-8000-000000000001/' || repeat('c', 64) || '/original.jpg')),
  '23514', NULL,
  'record: a payload naming another source is refused'
);

-- ─── fail ──────────────────────────────────────────────────────────────────

SELECT throws_ok(
  format($$SELECT public.fail_client_plate_request(%L, %L, 'fetch 404')$$,
    (SELECT id FROM second_claim ORDER BY id OFFSET 1 LIMIT 1), extensions.gen_random_uuid()),
  '55000', NULL,
  'fail: a wrong lease token is refused'
);
SELECT lives_ok(
  format($$SELECT public.fail_client_plate_request(%L, %L, 'fetch 404')$$,
    (SELECT id FROM second_claim ORDER BY id OFFSET 1 LIMIT 1),
    (SELECT lease_token FROM second_claim ORDER BY id OFFSET 1 LIMIT 1)),
  'fail: the right lease token is accepted'
);
SELECT is(
  (SELECT status || ' ' || attempts || ' ' || last_error || ' ' || (lease_token IS NULL)::text
     FROM public.client_plate_requests WHERE id = (SELECT id FROM second_claim ORDER BY id OFFSET 1 LIMIT 1)),
  'queued 1 fetch 404 true',
  'fail: an early attempt goes back to the queue with its error'
);

UPDATE public.client_plate_requests SET attempts = 3
 WHERE id = (SELECT id FROM second_claim ORDER BY id OFFSET 2 LIMIT 1);
SELECT public.fail_client_plate_request(
  (SELECT id FROM second_claim ORDER BY id OFFSET 2 LIMIT 1),
  (SELECT lease_token FROM second_claim ORDER BY id OFFSET 2 LIMIT 1),
  'ingest 422');
SELECT is(
  (SELECT status FROM public.client_plate_requests WHERE id = (SELECT id FROM second_claim ORDER BY id OFFSET 2 LIMIT 1)),
  'failed',
  'fail: the third attempt stays failed'
);

-- ─── re-queue ──────────────────────────────────────────────────────────────

UPDATE public.project_rooms
   SET concept_render_url = '84300000-0000-4000-8000-000000000001/kitchen-v1.png'
 WHERE id = '84300000-0000-4000-8000-000000000011';
SELECT is(
  (SELECT source_kind || ' ' || source_url || ' ' || status FROM public.client_plate_requests
    WHERE source_ref = '{"table": "project_rooms", "id": "84300000-0000-4000-8000-000000000011"}'),
  'concept 84300000-0000-4000-8000-000000000001/kitchen-v1.png queued',
  'enqueue: a concept render queues its room-renders path'
);

-- The concept render's copy landed.
UPDATE public.client_plate_requests
   SET status = 'done', lease_token = NULL, lease_expires_at = NULL,
       asset_id = current_setting('us49.first_asset')::uuid
 WHERE source_ref = '{"table": "project_rooms", "id": "84300000-0000-4000-8000-000000000011"}';

SELECT public._enqueue_client_plate_request(
  '84300000-0000-4000-8000-000000000001', 'concept', 'project_rooms',
  '84300000-0000-4000-8000-000000000011', '84300000-0000-4000-8000-000000000001/kitchen-v1.png');
SELECT is(
  (SELECT status || ' ' || (asset_id IS NOT NULL)::text FROM public.client_plate_requests
    WHERE source_ref = '{"table": "project_rooms", "id": "84300000-0000-4000-8000-000000000011"}'),
  'done true',
  're-queue: the same address queued again changes nothing'
);

UPDATE public.project_rooms
   SET concept_render_url = '84300000-0000-4000-8000-000000000001/kitchen-v2.png'
 WHERE id = '84300000-0000-4000-8000-000000000011';
SELECT is(
  (SELECT status || ' ' || attempts || ' ' || (asset_id IS NULL)::text || ' ' || source_url
     FROM public.client_plate_requests
    WHERE source_ref = '{"table": "project_rooms", "id": "84300000-0000-4000-8000-000000000011"}'),
  'queued 0 true 84300000-0000-4000-8000-000000000001/kitchen-v2.png',
  're-queue: a replaced concept render is queued again from scratch'
);

-- ─── dispatch ──────────────────────────────────────────────────────────────

-- The request whose record was refused above is still leased; its lease runs out.
UPDATE public.client_plate_requests
   SET lease_expires_at = now() - interval '1 minute'
 WHERE id = (SELECT id FROM second_claim ORDER BY id LIMIT 1)
   AND status = 'leased';
SELECT throws_ok(
  format($$SELECT public.record_client_plate_asset(%L, %L, %L::jsonb)$$,
    (SELECT id FROM second_claim ORDER BY id LIMIT 1),
    (SELECT lease_token FROM second_claim ORDER BY id LIMIT 1),
    jsonb_build_object('sha256', repeat('d', 64), 'width', 10, 'height', 10,
      'originalKey', 'plates/84300000-0000-4000-8000-000000000001/' || repeat('d', 64) || '/original.jpg')),
  '55000', NULL,
  'record: an expired lease is refused'
);

SELECT 'dispatched' AS first_run
FROM (SELECT set_config('us49.first_run', COALESCE(public.dispatch_client_plate_copy()::text, ''), true)) AS stash;

SELECT is(
  (SELECT status || ' ' || last_error || ' ' || (lease_token IS NULL)::text
     FROM public.client_plate_requests WHERE id = (SELECT id FROM second_claim ORDER BY id LIMIT 1)),
  'queued lease expired true',
  'dispatch: an expired lease goes back to the queue'
);
SELECT isnt(current_setting('us49.first_run'), '', 'dispatch: a queued request opens a run');
SELECT is(
  (SELECT job_name || ' ' || (detail ->> 'trigger') FROM public.job_runs
    WHERE id = NULLIF(current_setting('us49.first_run'), '')::bigint),
  'client-plate-copy cron',
  'dispatch: the run is a client-plate-copy cron run'
);

UPDATE public.client_plate_requests SET status = 'failed', lease_token = NULL, lease_expires_at = NULL
 WHERE status IN ('queued', 'leased');
SELECT is(public.dispatch_client_plate_copy(), NULL::bigint, 'dispatch: nothing queued, no run');
SELECT is(
  (SELECT count(*)::int FROM public.job_runs WHERE job_name = 'client-plate-copy'
      AND started_at = now() AND id <> NULLIF(current_setting('us49.first_run'), '')::bigint),
  0,
  'dispatch: nothing queued opens no job_runs row'
);

SELECT 'begun' AS manual_run
FROM (SELECT set_config('us49.manual_run', public.begin_client_plate_copy_run()::text, true)) AS stash;
SELECT is(
  (SELECT status || ' ' || (detail ->> 'trigger') FROM public.job_runs
    WHERE id = current_setting('us49.manual_run')::bigint),
  'running manual',
  'dispatch: begin opens a manual running run'
);
SELECT throws_ok(
  format($$SELECT public.finish_client_plate_copy_run(%s, 'done', '{}'::jsonb, NULL)$$,
    current_setting('us49.manual_run')),
  '23514', NULL,
  'dispatch: finish refuses a status that is not terminal'
);
SELECT public.finish_client_plate_copy_run(
  current_setting('us49.manual_run')::bigint, 'succeeded', '{"claimed": 0}'::jsonb, NULL);
SELECT is(
  (SELECT status || ' ' || (detail ->> 'claimed') || ' ' || (finished_at IS NOT NULL)::text FROM public.job_runs
    WHERE id = current_setting('us49.manual_run')::bigint),
  'succeeded 0 true',
  'dispatch: finish closes the run with its counts'
);
SELECT throws_ok(
  format($$SELECT public.finish_client_plate_copy_run(%s, 'failed', '{}'::jsonb, 'late')$$,
    current_setting('us49.manual_run')),
  'P0002', NULL,
  'dispatch: a closed run cannot be finished again'
);

-- ─── plate check ───────────────────────────────────────────────────────────

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"84300000-0000-4000-8000-0000000000a2","role":"authenticated"}';
SELECT is(
  public.client_can_read_plate('84300000-0000-4000-8000-000000000001', repeat('b', 64)),
  '84300000-0000-4000-8000-000000000001'::uuid,
  'plate check: the client gets the project id for its plate'
);
SELECT is(
  public.client_can_read_plate('84300000-0000-4000-8000-000000000001', repeat('e', 64)),
  NULL::uuid,
  'plate check: an unknown sha256 gets NULL'
);

SET LOCAL request.jwt.claims = '{"sub":"84300000-0000-4000-8000-0000000000a3","role":"authenticated"}';
SELECT is(
  public.client_can_read_plate('84300000-0000-4000-8000-000000000001', repeat('b', 64)),
  NULL::uuid,
  'plate check: a stranger gets NULL'
);
RESET ROLE;

SELECT * FROM finish(true);
ROLLBACK;
