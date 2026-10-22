-- ═══════════════════════════════════════════════════════════════════════════
-- 00845 — edition RPCs, compose dispatcher, feature row (US-49 W3)
--
-- Named cases:
--   grants      service RPCs: service_role only; studio RPCs: authenticated
--               only; feature row 'client-edition-compose' enabled at $5;
--               the every-minute dispatch job is scheduled
--   claim       only available rows, one per project; never a project with a
--               compose in flight or two editions today
--   begin       wrong lease refused (55000); a drafting row with the next seq
--               holding the lease; the request and every due change of the
--               project done; an awaiting_review draft superseded by it; a
--               third edition in a day refused (54000,
--               client_edition_daily_limit)
--   close       a claimed request ends without an edition only under its
--               lease, with its reason
--   finish      refusals (status, approved full, a stranger's plate, not
--               drafting); full → awaiting_review with images and the
--               composition's sourceHash; plates_only approved →
--               auto_published, previous approved superseded by it, its
--               words carried; changed prose → awaiting_review with
--               autoPublishRefused; failed keeps the error in facts
--   studio      a stranger and the client are refused every act (42501);
--               hold keeps awaiting_review with facts.held; approve
--               validates overrides, refuses a concept hero, merges,
--               records the reviewer, refuses twice; list shows the rows;
--               undo restores the approved edition it superseded and is
--               refused on a frozen edition
--   perception  model writes box/focal/flags/version (origin model); bad
--               flags and boxes refused; a designer focal is kept by later
--               perception; set_plate_focal re-queues the source and the
--               plate stays in the facts while it re-crops
--   facts       get_project_editorial_facts adds studio id, perception
--               version and focal origin
--   dispatch    kill switch off: no run; expired drafts fail, expired leases
--               return to the queue; the run cost lands from p_detail
--   before/after  get_client_project_editorial is byte-identical under the
--               00842 body and the 00845 shared builder for every project
--               with a client, makers on and off (00842 re-run from its file)
--
-- Run (from supabase/): psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" \
--        -v ON_ERROR_STOP=1 -f tests/00845_client_edition_rpcs.test.sql
-- Everything is rolled back.
-- ═══════════════════════════════════════════════════════════════════════════
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT plan(85);

-- ─── grants ────────────────────────────────────────────────────────────────

SELECT ok(NOT has_function_privilege('authenticated', 'public.claim_client_edition_requests(int)', 'EXECUTE')
          AND NOT has_function_privilege('anon', 'public.claim_client_edition_requests(int)', 'EXECUTE')
          AND has_function_privilege('service_role', 'public.claim_client_edition_requests(int)', 'EXECUTE'),
          'grants: claim is service_role only');
SELECT ok(NOT has_function_privilege('authenticated', 'public.begin_client_edition(uuid, uuid)', 'EXECUTE')
          AND has_function_privilege('service_role', 'public.begin_client_edition(uuid, uuid)', 'EXECUTE'),
          'grants: begin is service_role only');
SELECT ok(NOT has_function_privilege('authenticated', 'public.close_client_edition_request(uuid, text, text)', 'EXECUTE')
          AND has_function_privilege('service_role', 'public.close_client_edition_request(uuid, text, text)', 'EXECUTE'),
          'grants: close is service_role only');
SELECT ok(NOT has_function_privilege('authenticated', 'public.finish_client_edition(uuid, uuid, text, text, jsonb, jsonb, jsonb, text, text, numeric, text)', 'EXECUTE')
          AND has_function_privilege('service_role', 'public.finish_client_edition(uuid, uuid, text, text, jsonb, jsonb, jsonb, text, text, numeric, text)', 'EXECUTE'),
          'grants: finish is service_role only');
SELECT ok(NOT has_function_privilege('authenticated', 'public.record_plate_perception(uuid, numeric[], numeric[], text[], text, text)', 'EXECUTE')
          AND has_function_privilege('service_role', 'public.record_plate_perception(uuid, numeric[], numeric[], text[], text, text)', 'EXECUTE'),
          'grants: record_plate_perception is service_role only');
SELECT ok(NOT has_function_privilege('authenticated', 'public.get_project_editorial_facts(uuid)', 'EXECUTE')
          AND NOT has_function_privilege('anon', 'public.get_project_editorial_facts(uuid)', 'EXECUTE')
          AND has_function_privilege('service_role', 'public.get_project_editorial_facts(uuid)', 'EXECUTE'),
          'grants: get_project_editorial_facts is service_role only');
SELECT ok(NOT has_function_privilege('authenticated', 'public._build_project_editorial(uuid)', 'EXECUTE')
          AND NOT has_function_privilege('service_role', 'public._build_project_editorial(uuid)', 'EXECUTE'),
          'grants: the shared builder is callable by no API role');
SELECT ok(has_function_privilege('authenticated', 'public.get_client_project_editorial(uuid)', 'EXECUTE')
          AND NOT has_function_privilege('anon', 'public.get_client_project_editorial(uuid)', 'EXECUTE'),
          'grants: the Phase 1 reader keeps its grants');
SELECT ok(has_function_privilege('authenticated', 'public.approve_client_edition(uuid, jsonb)', 'EXECUTE')
          AND has_function_privilege('authenticated', 'public.hold_client_edition(uuid)', 'EXECUTE')
          AND has_function_privilege('authenticated', 'public.undo_client_edition(uuid)', 'EXECUTE')
          AND has_function_privilege('authenticated', 'public.set_plate_focal(uuid, numeric[], numeric[])', 'EXECUTE')
          AND has_function_privilege('authenticated', 'public.list_client_editions(uuid)', 'EXECUTE'),
          'grants: authenticated may call the studio RPCs');
SELECT ok(NOT has_function_privilege('anon', 'public.approve_client_edition(uuid, jsonb)', 'EXECUTE')
          AND NOT has_function_privilege('anon', 'public.undo_client_edition(uuid)', 'EXECUTE')
          AND NOT has_function_privilege('anon', 'public.list_client_editions(uuid)', 'EXECUTE')
          AND NOT has_function_privilege('anon', 'public.set_plate_focal(uuid, numeric[], numeric[])', 'EXECUTE'),
          'grants: anon may call no studio RPC');
SELECT ok(NOT has_function_privilege('authenticated', 'public.dispatch_client_edition_compose()', 'EXECUTE')
          AND has_function_privilege('service_role', 'public.finish_client_edition_compose_run(bigint, text, jsonb, text, numeric)', 'EXECUTE'),
          'grants: the dispatcher and run RPCs are service-side');
SELECT is(
  (SELECT row(enabled, daily_cap_usd)::text FROM public.llm_feature_controls WHERE feature = 'client-edition-compose'),
  row(true, 5::numeric(12,6))::text,
  'grants: feature row client-edition-compose present, enabled, $5 a day');
SELECT is(
  (SELECT schedule FROM cron.job WHERE jobname = 'client-edition-compose-dispatch'),
  '* * * * *',
  'grants: the dispatch job runs every minute');
SELECT col_type_is('public', 'client_plate_assets', 'focal_origin', 'text',
                   'grants: client_plate_assets.focal_origin exists');

-- ─── fixtures (as postgres) ────────────────────────────────────────────────
-- O owner of the studio · C the client · Z a stranger

INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, instance_id, aud, role)
VALUES
  ('84500000-0000-4000-8000-0000000000a1', 'us49-845-owner@test.invalid',    '', now(), now(), now(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('84500000-0000-4000-8000-0000000000a2', 'us49-845-client@test.invalid',   '', now(), now(), now(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('84500000-0000-4000-8000-0000000000a3', 'us49-845-stranger@test.invalid', '', now(), now(), now(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');
INSERT INTO public.profiles (id, email, full_name, is_designer, created_at, updated_at)
VALUES
  ('84500000-0000-4000-8000-0000000000a1', 'us49-845-owner@test.invalid',    'US49 845 Owner',    true,  now(), now()),
  ('84500000-0000-4000-8000-0000000000a2', 'us49-845-client@test.invalid',   'US49 845 Client',   false, now(), now()),
  ('84500000-0000-4000-8000-0000000000a3', 'us49-845-stranger@test.invalid', 'US49 845 Stranger', false, now(), now())
ON CONFLICT (id) DO UPDATE
SET email = EXCLUDED.email, full_name = EXCLUDED.full_name, is_designer = EXCLUDED.is_designer;

INSERT INTO public.organizations (id, type, name, slug, address)
VALUES ('84500000-0000-4000-8000-0000000000f1', 'design_studio', 'US49 845 Studio', 'us49-845-studio-test',
        '{"city": "Hudson"}'::jsonb);
INSERT INTO public.organization_members (id, user_id, organization_id, role, status, joined_at)
VALUES ('84500000-0000-4000-8000-0000000000e1', '84500000-0000-4000-8000-0000000000a1',
        '84500000-0000-4000-8000-0000000000f1', 'owner', 'active', now());
INSERT INTO public.vendors (id, name, made_in)
VALUES ('84500000-0000-4000-8000-000000000031', 'Atelier Nord', 'Portugal');

INSERT INTO public.projects (id, name, designer_id, client_id, created_by, studio_id, status)
VALUES ('84500000-0000-4000-8000-000000000001', 'US49 845 Whole Home',
        '84500000-0000-4000-8000-0000000000a1', '84500000-0000-4000-8000-0000000000a2',
        '84500000-0000-4000-8000-0000000000a1', '84500000-0000-4000-8000-0000000000f1', 'active');
INSERT INTO public.project_rooms (id, project_id, name, sort_order)
VALUES ('84500000-0000-4000-8000-000000000011', '84500000-0000-4000-8000-000000000001', 'Living room', 0);
INSERT INTO public.products (id, name, captured_at, layer, owner_user_id, status, images) VALUES
  ('84500000-0000-4000-8000-000000000021', 'US49 845 Lounge chair', now(), 'personal',
   '84500000-0000-4000-8000-0000000000a1', 'draft', ARRAY['https://img.test/us49-845-chair.jpg']);

SELECT set_config('app.ffe_mutation_rpc', 'on', true);
INSERT INTO public.project_ffe_items (
  id, project_id, project_room_id, name, status, item_type, product_id, vendor_id, ffe_category,
  quantity, unit_price_cents, line_total_cents, design_disposition, assignment_scope, sort_order
) VALUES ('84500000-0000-4000-8000-000000000101', '84500000-0000-4000-8000-000000000001',
          '84500000-0000-4000-8000-000000000011', 'Lounge chair', 'specified', 'fixed',
          '84500000-0000-4000-8000-000000000021', '84500000-0000-4000-8000-000000000031', 'seating',
          1, 120000, 120000, 'selected', 'room', 0);
INSERT INTO public.proposals (id, project_id, designer_id, title, status, document_kind, commercial_state, total_amount, subtotal)
VALUES ('84500000-0000-4000-8000-000000000401', '84500000-0000-4000-8000-000000000001', '84500000-0000-4000-8000-0000000000a1',
        'US49 845 Authorization', 'accepted', 'furnishings_authorization', 'executed', 120000, 120000);
INSERT INTO public.project_commercial_documents (id, project_id, proposal_id, document_kind, wave_name, is_origin, bound_at, executed_at, created_by)
VALUES ('84500000-0000-4000-8000-000000000402', '84500000-0000-4000-8000-000000000001', '84500000-0000-4000-8000-000000000401',
        'furnishings_authorization', 'Authorization No. 1', false, now(), now(), '84500000-0000-4000-8000-0000000000a1');
INSERT INTO public.furnishing_authorization_items (
  id, commercial_document_id, source_ffe_item_id, product_id, name, room_name, category, item_type,
  quantity, client_unit_price_cents, client_line_total_cents, trade_unit_cost_cents, markup_percent, sort_order, snapshot
) VALUES ('84500000-0000-4000-8000-000000000403', '84500000-0000-4000-8000-000000000402', '84500000-0000-4000-8000-000000000101',
          '84500000-0000-4000-8000-000000000021', 'Lounge chair', 'Living room', 'seating', 'fixed', 1, 120000, 120000, 70000, 71.43, 0,
          '{"clientName": "Lounge chair"}'::jsonb);
UPDATE public.project_ffe_items
   SET source_commercial_document_id = '84500000-0000-4000-8000-000000000402',
       source_authorization_item_id = '84500000-0000-4000-8000-000000000403'
 WHERE id = '84500000-0000-4000-8000-000000000101';
SELECT set_config('app.ffe_mutation_rpc', '', true);

-- A1 the chair's plate (maker, copied) · A2 an upload with no shown source ·
-- A3 the room's concept render.
INSERT INTO public.client_plate_assets
  (id, project_id, sha256, source_kind, source_ref, original_key, width, height, ground, dominant_hex, lqip, crops)
SELECT '84500000-0000-4000-8000-000000000501', picture.project_id, repeat('b', 64), 'maker',
       jsonb_build_object('table', 'project_ffe_item_images', 'id', picture.id),
       'plates/845/' || repeat('b', 64) || '/original.jpg', 1600, 1200, 'white', '#efe9e0', 'data:image/webp;base64,AAAA',
       '{"wide": {"rect": [0, 0, 1600, 900], "widths": [800, 1600]}}'::jsonb
FROM public.project_ffe_item_images AS picture
WHERE picture.item_id = '84500000-0000-4000-8000-000000000101';
UPDATE public.client_plate_requests AS request
   SET status = 'done', asset_id = '84500000-0000-4000-8000-000000000501', updated_at = now() - interval '1 hour'
  FROM public.project_ffe_item_images AS picture
 WHERE picture.item_id = '84500000-0000-4000-8000-000000000101'
   AND request.source_ref = jsonb_build_object('table', 'project_ffe_item_images', 'id', picture.id);
INSERT INTO public.client_plate_assets (id, project_id, sha256, source_kind, source_ref, original_key, width, height)
VALUES ('84500000-0000-4000-8000-000000000502', '84500000-0000-4000-8000-000000000001', repeat('d', 64), 'upload',
        '{"table": "project_ffe_item_images", "id": "84500000-0000-4000-8000-000000000299"}'::jsonb,
        'plates/845/d/original.jpg', 1600, 1200),
       ('84500000-0000-4000-8000-000000000503', '84500000-0000-4000-8000-000000000001', repeat('c', 64), 'concept',
        '{"table": "project_rooms", "id": "84500000-0000-4000-8000-000000000011"}'::jsonb,
        'plates/845/c/original.jpg', 1600, 1200);
UPDATE public.client_plate_assets SET concept_seen = true WHERE id = '84500000-0000-4000-8000-000000000503';

-- Every queued change anywhere is answered; this file queues its own.
UPDATE public.client_edition_requests SET status = 'done' WHERE status = 'queued';
INSERT INTO public.client_edition_requests (id, project_id, reason, debounce_key, available_at) VALUES
  ('84500000-0000-4000-8000-000000000601', '84500000-0000-4000-8000-000000000001', 'phase',
   '84500000-0000-4000-8000-000000000001:phase', now() - interval '2 minutes'),
  ('84500000-0000-4000-8000-000000000602', '84500000-0000-4000-8000-000000000001', 'palette',
   '84500000-0000-4000-8000-000000000001:palette', now() - interval '1 minute'),
  ('84500000-0000-4000-8000-000000000603', '84500000-0000-4000-8000-000000000001', 'item_image',
   '84500000-0000-4000-8000-000000000001:item_image', now() + interval '30 minutes');

SELECT set_config('us49.comp1', $j${"sourceHash": "h1", "voice": "model",
  "hero": {"assetId": "84500000-0000-4000-8000-000000000501", "why": "the strongest picture"},
  "held": ["84500000-0000-4000-8000-000000000502"],
  "chapters": [{"key": "cover", "headline": "The house, so far", "standing": "Two rooms are set."}],
  "doorstep": {"standing": "Nothing waits on you."}, "notice": null}$j$, true);
SELECT set_config('us49.images1', $j$[
  {"asset_id": "84500000-0000-4000-8000-000000000501", "plate_role": "hero", "crop_key": "none", "rank": 1,
   "chapter_key": "cover", "alt": "Lounge chair", "caption_what": "Lounge chair",
   "caption_whose": "US49 845 Studio", "caption_when": "21 October 2026"},
  {"asset_id": "84500000-0000-4000-8000-000000000502", "plate_role": "held", "crop_key": "none", "rank": 2,
   "chapter_key": "cover", "alt": "Kitchen", "caption_what": "Kitchen",
   "caption_whose": "US49 845 Studio", "caption_when": "21 October 2026"}]$j$, true);

-- ─── claim + begin (service role) ──────────────────────────────────────────

SET LOCAL ROLE service_role;
SELECT 'claimed' AS us49 FROM (SELECT set_config('us49.claim1',
  (SELECT COALESCE(jsonb_agg(to_jsonb(claimed)), '[]'::jsonb) FROM public.claim_client_edition_requests(5) AS claimed)::text,
  true)) AS stash;
SELECT is(
  (SELECT jsonb_agg(entry ->> 'id') FROM jsonb_array_elements(current_setting('us49.claim1')::jsonb) AS entry),
  '["84500000-0000-4000-8000-000000000601"]'::jsonb,
  'claim: one available request per project, the earliest; the future one waits');
SELECT is(
  (SELECT row(status, attempts, lease_expires_at)::text FROM public.client_edition_requests
   WHERE id = '84500000-0000-4000-8000-000000000601'),
  row('leased', 1, now() + interval '10 minutes')::text,
  'claim: leased for ten minutes, attempts counted');
SELECT throws_ok(
  $$SELECT public.begin_client_edition('84500000-0000-4000-8000-000000000601', extensions.gen_random_uuid())$$,
  '55000', NULL, 'begin: a wrong lease token is refused');
SELECT 'begun' AS us49 FROM (SELECT set_config('us49.e1',
  public.begin_client_edition('84500000-0000-4000-8000-000000000601',
    (current_setting('us49.claim1')::jsonb -> 0 ->> 'lease_token')::uuid)::text, true)) AS stash;
SELECT is(
  (SELECT row(seq, status, lease_token::text)::text FROM public.client_editions
   WHERE id = current_setting('us49.e1')::uuid),
  row(1, 'drafting', current_setting('us49.claim1')::jsonb -> 0 ->> 'lease_token')::text,
  'begin: a drafting edition, seq 1, holding the request lease');
SELECT is(
  (SELECT jsonb_object_agg(id, status) FROM public.client_edition_requests
   WHERE project_id = '84500000-0000-4000-8000-000000000001' AND id::text LIKE '84500000-%'),
  jsonb_build_object('84500000-0000-4000-8000-000000000601', 'done',
                     '84500000-0000-4000-8000-000000000602', 'done',
                     '84500000-0000-4000-8000-000000000603', 'queued'),
  'begin: the request and every due change are done; the future one stays queued');

-- ─── finish refusals, then a full edition ──────────────────────────────────

SELECT throws_ok(
  format($$SELECT public.finish_client_edition(%L, %L, 'published', 'full', '{}', '{}', '[]', 'e1', 'm', 0, NULL)$$,
         current_setting('us49.e1'), current_setting('us49.claim1')::jsonb -> 0 ->> 'lease_token'),
  '23514', NULL, 'finish: an unknown status is refused');
SELECT throws_ok(
  format($$SELECT public.finish_client_edition(%L, %L, 'approved', 'full', '{}', '{}', '[]', 'e1', 'm', 0, NULL)$$,
         current_setting('us49.e1'), current_setting('us49.claim1')::jsonb -> 0 ->> 'lease_token'),
  '23514', NULL, 'finish: a full edition never publishes itself');
SELECT throws_ok(
  format($$SELECT public.finish_client_edition(%L, %L, 'awaiting_review', 'full', '{}', '{}',
           '[{"asset_id": "84500000-0000-4000-8000-0000000005ff", "plate_role": "hero"}]', 'e1', 'm', 0, NULL)$$,
         current_setting('us49.e1'), current_setting('us49.claim1')::jsonb -> 0 ->> 'lease_token'),
  '23514', NULL, 'finish: an image naming no plate of the project is refused');
SELECT is(
  public.finish_client_edition(current_setting('us49.e1')::uuid,
    (current_setting('us49.claim1')::jsonb -> 0 ->> 'lease_token')::uuid,
    'awaiting_review', 'full', current_setting('us49.comp1')::jsonb, '{"project": {"name": "US49 845 Whole Home"}}'::jsonb,
    current_setting('us49.images1')::jsonb, 'e1', 'claude-test', 0.0123, NULL),
  'awaiting_review',
  'finish: a full edition lands awaiting_review');
SELECT is(
  (SELECT row(status, kind, source_hash, prompt_version, model, cost_usd, lease_token IS NULL, facts ->> 'project')::text
   FROM public.client_editions WHERE id = current_setting('us49.e1')::uuid),
  row('awaiting_review', 'full', 'h1', 'e1', 'claude-test', 0.0123, true, '{"name": "US49 845 Whole Home"}')::text,
  'finish: kind, sourceHash → source_hash, version, model, cost and facts recorded; lease cleared');
SELECT is(
  (SELECT jsonb_agg(jsonb_build_array(plate_role, crop_key, rank, chapter_key, alt, caption_what, caption_whose, caption_when)
                    ORDER BY rank)
   FROM public.client_edition_images WHERE edition_id = current_setting('us49.e1')::uuid),
  '[["hero", "none", 1, "cover", "Lounge chair", "Lounge chair", "US49 845 Studio", "21 October 2026"],
    ["held", "none", 2, "cover", "Kitchen", "Kitchen", "US49 845 Studio", "21 October 2026"]]'::jsonb,
  'finish: the snake_case image rows land as edition images');
SELECT throws_ok(
  format($$SELECT public.finish_client_edition(%L, %L, 'awaiting_review', 'full', '{}', '{}', '[]', 'e1', 'm', 0, NULL)$$,
         current_setting('us49.e1'), current_setting('us49.claim1')::jsonb -> 0 ->> 'lease_token'),
  '55000', NULL, 'finish: an edition no longer drafting is refused');
RESET ROLE;

-- ─── the studio's acts: refusals ───────────────────────────────────────────

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"84500000-0000-4000-8000-0000000000a3","role":"authenticated"}';
SELECT throws_ok(format('SELECT public.approve_client_edition(%L)', current_setting('us49.e1')),
                 '42501', 'project not found or not accessible', 'studio: a stranger cannot approve');
SELECT throws_ok(format('SELECT public.hold_client_edition(%L)', current_setting('us49.e1')),
                 '42501', NULL, 'studio: a stranger cannot hold');
SELECT throws_ok(format('SELECT public.undo_client_edition(%L)', current_setting('us49.e1')),
                 '42501', NULL, 'studio: a stranger cannot undo');
SELECT throws_ok($$SELECT public.list_client_editions('84500000-0000-4000-8000-000000000001')$$,
                 '42501', NULL, 'studio: a stranger cannot list');
SELECT throws_ok($$SELECT public.set_plate_focal('84500000-0000-4000-8000-000000000501', '{0.1,0.1,0.5,0.5}', '{0.3,0.3}')$$,
                 '42501', NULL, 'studio: a stranger cannot set a focal point');
SELECT throws_ok(format('SELECT public.approve_client_edition(%L)', extensions.gen_random_uuid()),
                 '42501', 'project not found or not accessible', 'studio: an unknown edition reads as not accessible');
SET LOCAL request.jwt.claims = '{"sub":"84500000-0000-4000-8000-0000000000a2","role":"authenticated"}';
SELECT throws_ok(format('SELECT public.approve_client_edition(%L)', current_setting('us49.e1')),
                 '42501', NULL, 'studio: the client cannot approve');
SELECT throws_ok($$SELECT public.list_client_editions('84500000-0000-4000-8000-000000000001')$$,
                 '42501', NULL, 'studio: the client cannot list');

-- ─── hold, approve, list (the owner) ───────────────────────────────────────

SET LOCAL request.jwt.claims = '{"sub":"84500000-0000-4000-8000-0000000000a1","role":"authenticated"}';
SELECT lives_ok(format('SELECT public.hold_client_edition(%L)', current_setting('us49.e1')),
                'studio: the owner holds the draft');
SELECT throws_ok(format($$SELECT public.approve_client_edition(%L, '{"title": "x"}')$$, current_setting('us49.e1')),
                 '23514', NULL, 'studio: an unknown override key is refused');
SELECT throws_ok(format($$SELECT public.approve_client_edition(%L, '{"chapters": {"cover": {"headline": %s}}}')$$,
                        current_setting('us49.e1'), to_jsonb(repeat('x', 61))),
                 '23514', NULL, 'studio: a headline over 60 characters is refused');
SELECT throws_ok(format($$SELECT public.approve_client_edition(%L, '{"heroAssetId": "84500000-0000-4000-8000-000000000503"}')$$,
                        current_setting('us49.e1')),
                 '23514', NULL, 'studio: a concept render is never the hero');
SELECT lives_ok(format($$SELECT public.approve_client_edition(%L,
  '{"chapters": {"cover": {"headline": "The house, in October"}},
    "captions": {"84500000-0000-4000-8000-000000000501": {"when": "Autumn 2026"}}}')$$, current_setting('us49.e1')),
  'studio: the owner approves with overrides');
SELECT throws_ok(format('SELECT public.approve_client_edition(%L)', current_setting('us49.e1')),
                 '55000', NULL, 'studio: an approved edition cannot be approved again');
SELECT throws_ok(format('SELECT public.hold_client_edition(%L)', current_setting('us49.e1')),
                 '55000', NULL, 'studio: only a draft awaiting review is held');
SELECT 'listed' AS us49 FROM (SELECT set_config('us49.list1',
  public.list_client_editions('84500000-0000-4000-8000-000000000001')::text, true)) AS stash;
RESET ROLE;

SELECT is(
  (SELECT row(status, auto_published, reviewed_by, approved_at IS NOT NULL, reviewed_at IS NOT NULL,
              facts -> 'held', overrides -> 'chapters' -> 'cover' ->> 'headline',
              overrides -> 'captions' -> '84500000-0000-4000-8000-000000000501' ->> 'when')::text
   FROM public.client_editions WHERE id = current_setting('us49.e1')::uuid),
  row('approved', false, '84500000-0000-4000-8000-0000000000a1'::uuid, true, true, 'true'::jsonb,
      'The house, in October', 'Autumn 2026')::text,
  'studio: held then approved by the owner, overrides kept, not auto-published');
SELECT is(
  (SELECT jsonb_build_array(
     list -> 'showMakers', jsonb_array_length(list -> 'editions'),
     list -> 'editions' -> 0 -> 'status', list -> 'editions' -> 0 -> 'held',
     list -> 'editions' -> 0 -> 'reviewedBy' -> 'name', list -> 'editions' -> 0 -> 'headlines',
     list -> 'editions' -> 0 -> 'hero' -> 'assetId', jsonb_array_length(list -> 'editions' -> 0 -> 'images'),
     list -> 'editions' -> 0 -> 'images' -> 0 -> 'sourceKind', list -> 'editions' -> 0 -> 'images' -> 1 -> 'sourceKind',
     list -> 'editions' -> 0 -> 'images' -> 0 -> 'sourceUrl' IS NOT NULL)
   FROM (SELECT current_setting('us49.list1')::jsonb AS list) AS listed),
  '[false, 1, "approved", true, "US49 845 Owner", [{"key": "cover", "headline": "The house, so far"}],
    "84500000-0000-4000-8000-000000000501", 2, "maker", "upload", true]'::jsonb,
  'studio: list shows the edition, its reviewer, headlines, hero and plates');

-- ─── a second edition today supersedes an unreviewed draft ─────────────────

UPDATE public.client_edition_requests SET available_at = now() - interval '1 minute'
 WHERE id = '84500000-0000-4000-8000-000000000603';
SET LOCAL ROLE service_role;
SELECT 'claimed' AS us49 FROM (SELECT set_config('us49.claim2',
  (SELECT COALESCE(jsonb_agg(to_jsonb(claimed)), '[]'::jsonb) FROM public.claim_client_edition_requests(5) AS claimed)::text,
  true)) AS stash;
SELECT 'begun' AS us49 FROM (SELECT set_config('us49.e2',
  public.begin_client_edition('84500000-0000-4000-8000-000000000603',
    (current_setting('us49.claim2')::jsonb -> 0 ->> 'lease_token')::uuid)::text, true)) AS stash;
SELECT is(
  public.finish_client_edition(current_setting('us49.e2')::uuid,
    (current_setting('us49.claim2')::jsonb -> 0 ->> 'lease_token')::uuid,
    'awaiting_review', 'full',
    jsonb_set(current_setting('us49.comp1')::jsonb, '{sourceHash}', '"h2"'), '{}'::jsonb, '[]'::jsonb,
    'e1', 'claude-test', 0.01, NULL),
  'awaiting_review',
  'begin: a second edition the same day is drafted and finished');

-- A leased request (as the composer would hold it) meets the daily limit.
INSERT INTO public.client_edition_requests (id, project_id, reason, debounce_key, status, lease_token, lease_expires_at, attempts)
VALUES ('84500000-0000-4000-8000-000000000604', '84500000-0000-4000-8000-000000000001', 'phase',
        '84500000-0000-4000-8000-000000000001:phase', 'leased',
        '84500000-0000-4000-8000-0000000007a4', now() + interval '10 minutes', 1);
SELECT throws_ok(
  $$SELECT public.begin_client_edition('84500000-0000-4000-8000-000000000604', '84500000-0000-4000-8000-0000000007a4')$$,
  '54000', NULL, 'begin: a third edition in a day is refused (54000)');
SELECT throws_like(
  $$SELECT public.begin_client_edition('84500000-0000-4000-8000-000000000604', '84500000-0000-4000-8000-0000000007a4')$$,
  'client_edition_daily_limit%', 'begin: the refusal carries the client_edition_daily_limit token');
SELECT throws_ok(
  $$SELECT public.close_client_edition_request('84500000-0000-4000-8000-000000000604', '84500000-0000-4000-8000-0000000007ff', 'daily limit')$$,
  '55000', NULL, 'close: a wrong lease token is refused');
SELECT lives_ok(
  $$SELECT public.close_client_edition_request('84500000-0000-4000-8000-000000000604', '84500000-0000-4000-8000-0000000007A4', 'daily limit')$$,
  'close: the lease holder closes the request');
SELECT is(
  (SELECT row(status, close_reason, lease_token IS NULL)::text FROM public.client_edition_requests
   WHERE id = '84500000-0000-4000-8000-000000000604'),
  row('done', 'daily limit', true)::text,
  'close: done with its reason, lease cleared');
SELECT throws_ok(
  $$SELECT public.close_client_edition_request('84500000-0000-4000-8000-000000000604', '84500000-0000-4000-8000-0000000007a4', 'again')$$,
  '55000', NULL, 'close: a closed request cannot be closed again');

INSERT INTO public.client_edition_requests (id, project_id, reason, debounce_key, available_at)
VALUES ('84500000-0000-4000-8000-000000000605', '84500000-0000-4000-8000-000000000001', 'palette',
        '84500000-0000-4000-8000-000000000001:palette', now() - interval '1 minute');
SELECT is(
  (SELECT count(*) FROM public.claim_client_edition_requests(5)),
  0::bigint,
  'claim: a project with two editions today is not claimed');
RESET ROLE;

-- A new day: the third edition supersedes the unreviewed second.
UPDATE public.client_editions SET created_at = created_at - interval '1 day'
 WHERE project_id = '84500000-0000-4000-8000-000000000001';
SET LOCAL ROLE service_role;
SELECT 'claimed' AS us49 FROM (SELECT set_config('us49.claim3',
  (SELECT COALESCE(jsonb_agg(to_jsonb(claimed)), '[]'::jsonb) FROM public.claim_client_edition_requests(5) AS claimed)::text,
  true)) AS stash;
SELECT 'begun' AS us49 FROM (SELECT set_config('us49.e3',
  public.begin_client_edition('84500000-0000-4000-8000-000000000605',
    (current_setting('us49.claim3')::jsonb -> 0 ->> 'lease_token')::uuid)::text, true)) AS stash;
SELECT is(
  (SELECT jsonb_object_agg(seq, jsonb_build_array(status, superseded_by = current_setting('us49.e3')::uuid))
   FROM public.client_editions WHERE project_id = '84500000-0000-4000-8000-000000000001'),
  '{"1": ["approved", null], "2": ["superseded", true], "3": ["drafting", null]}'::jsonb,
  'begin: an awaiting_review draft is superseded by the new one; the approved edition stays');

-- ─── plates only, same words: published at once ────────────────────────────

SELECT is(
  public.finish_client_edition(current_setting('us49.e3')::uuid,
    (current_setting('us49.claim3')::jsonb -> 0 ->> 'lease_token')::uuid,
    'approved', 'plates_only',
    jsonb_set(jsonb_set(current_setting('us49.comp1')::jsonb, '{sourceHash}', '"h3"'),
              '{hero}', '{"assetId": "84500000-0000-4000-8000-000000000502", "why": "a new photograph"}'),
    '{}'::jsonb,
    '[{"asset_id": "84500000-0000-4000-8000-000000000502", "plate_role": "hero", "rank": 1, "chapter_key": "cover"}]'::jsonb,
    'e1', 'claude-test', 0.002, NULL),
  'approved',
  'finish: a plates-only edition with the same words publishes itself');
RESET ROLE;
SELECT is(
  (SELECT jsonb_object_agg(seq, jsonb_build_array(status, auto_published, approved_at IS NOT NULL,
                                                  superseded_by = current_setting('us49.e3')::uuid))
   FROM public.client_editions WHERE project_id = '84500000-0000-4000-8000-000000000001'),
  '{"1": ["superseded", false, true, true], "2": ["superseded", false, false, true], "3": ["approved", true, true, null]}'::jsonb,
  'finish: auto_published and approved now; the previous approved edition superseded by it');
SELECT is(
  (SELECT row(source_hash, overrides -> 'chapters' -> 'cover' ->> 'headline', overrides ? 'heroAssetId',
              (SELECT crop_key FROM public.client_edition_images WHERE edition_id = edition.id))::text
   FROM public.client_editions AS edition WHERE id = current_setting('us49.e3')::uuid),
  row('h3', 'The house, in October', false, 'none')::text,
  'finish: the studio''s words carry over; crop key defaults to none');

-- ─── undo ──────────────────────────────────────────────────────────────────

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"84500000-0000-4000-8000-0000000000a1","role":"authenticated"}';
SELECT throws_ok(format('SELECT public.undo_client_edition(%L)', current_setting('us49.e2')),
                 '55000', NULL, 'undo: only an approved edition is undone');
SELECT lives_ok(format('SELECT public.undo_client_edition(%L)', current_setting('us49.e3')),
                'undo: the owner undoes the auto-published edition');
RESET ROLE;
SELECT is(
  (SELECT jsonb_object_agg(seq, jsonb_build_array(status, superseded_by IS NULL))
   FROM public.client_editions WHERE project_id = '84500000-0000-4000-8000-000000000001'),
  '{"1": ["approved", true], "2": ["superseded", false], "3": ["superseded", true]}'::jsonb,
  'undo: the edition it superseded is approved again');

UPDATE public.client_editions SET frozen_at = now()
 WHERE project_id = '84500000-0000-4000-8000-000000000001' AND seq = 1;
SET LOCAL ROLE authenticated;
SELECT throws_ok(format('SELECT public.undo_client_edition(%L)', current_setting('us49.e1')),
                 '55000', NULL, 'undo: a frozen edition is refused');
RESET ROLE;

-- ─── plates only, changed words: held for review ───────────────────────────

INSERT INTO public.client_edition_requests (id, project_id, reason, debounce_key, status, lease_token, lease_expires_at, attempts)
VALUES ('84500000-0000-4000-8000-000000000606', '84500000-0000-4000-8000-000000000001', 'item_image',
        '84500000-0000-4000-8000-000000000001:item_image', 'leased',
        '84500000-0000-4000-8000-0000000007a6', now() + interval '10 minutes', 1);
SET LOCAL ROLE service_role;
SELECT 'begun' AS us49 FROM (SELECT set_config('us49.e4',
  public.begin_client_edition('84500000-0000-4000-8000-000000000606', '84500000-0000-4000-8000-0000000007a6')::text,
  true)) AS stash;
SELECT is(
  public.finish_client_edition(current_setting('us49.e4')::uuid, '84500000-0000-4000-8000-0000000007a6',
    'approved', 'plates_only',
    jsonb_set(current_setting('us49.comp1')::jsonb, '{chapters}',
              '[{"key": "cover", "headline": "A new headline", "standing": "Two rooms are set."}]'),
    '{}'::jsonb, '[]'::jsonb, 'e1', 'claude-test', 0.001, NULL),
  'awaiting_review',
  'finish: a plates-only edition whose words changed waits for review');
RESET ROLE;
SELECT is(
  (SELECT row(status, kind, auto_published, facts ->> 'autoPublishRefused')::text
   FROM public.client_editions WHERE id = current_setting('us49.e4')::uuid),
  row('awaiting_review', 'plates_only', false, 'prose changed')::text,
  'finish: it says why it was not published');

-- ─── failed ────────────────────────────────────────────────────────────────

UPDATE public.client_editions SET created_at = created_at - interval '1 day'
 WHERE project_id = '84500000-0000-4000-8000-000000000001';
INSERT INTO public.client_edition_requests (id, project_id, reason, debounce_key, status, lease_token, lease_expires_at, attempts)
VALUES ('84500000-0000-4000-8000-000000000607', '84500000-0000-4000-8000-000000000001', 'closed',
        '84500000-0000-4000-8000-000000000001:closed', 'leased',
        '84500000-0000-4000-8000-0000000007a7', now() + interval '10 minutes', 1);
SET LOCAL ROLE service_role;
SELECT 'begun' AS us49 FROM (SELECT set_config('us49.e5',
  public.begin_client_edition('84500000-0000-4000-8000-000000000607', '84500000-0000-4000-8000-0000000007a7')::text,
  true)) AS stash;
SELECT is(
  public.finish_client_edition(current_setting('us49.e5')::uuid, '84500000-0000-4000-8000-0000000007a7',
    'failed', NULL, NULL, NULL, NULL, 'e1', 'claude-test', 0.0005, 'model timed out'),
  'failed',
  'finish: a failed compose returns failed');
RESET ROLE;
SELECT is(
  (SELECT row(status, facts ->> 'error', lease_token IS NULL)::text
   FROM public.client_editions WHERE id = current_setting('us49.e5')::uuid),
  row('failed', 'model timed out', true)::text,
  'finish: failed keeps the error in facts.error');
SELECT is(
  (SELECT status FROM public.client_editions WHERE id = current_setting('us49.e4')::uuid),
  'superseded',
  'begin: the held-back plates-only draft was superseded by the next draft');

-- ─── perception and the designer's focal point ─────────────────────────────

SET LOCAL ROLE service_role;
SELECT lives_ok(
  $$SELECT public.record_plate_perception('84500000-0000-4000-8000-000000000502', '{0.1,0.1,0.5,0.5}', '{0.3,0.3}',
                                          '{people}', 'A kitchen', 'e1')$$,
  'perception: the model records a plate');
SELECT is(
  (SELECT row(subject_box, focal, flags, perceived_prompt_version, focal_origin)::text
   FROM public.client_plate_assets WHERE id = '84500000-0000-4000-8000-000000000502'),
  row('{0.1,0.1,0.5,0.5}'::numeric[], '{0.3,0.3}'::numeric[], '{people}'::text[], 'e1', 'model')::text,
  'perception: box, focal, flags and version land; origin model');
SELECT throws_ok(
  $$SELECT public.record_plate_perception('84500000-0000-4000-8000-000000000502', NULL, NULL, '{face}', NULL, 'e1')$$,
  '23514', NULL, 'perception: an unknown flag is refused');
SELECT throws_ok(
  $$SELECT public.record_plate_perception('84500000-0000-4000-8000-000000000502', '{0.6,0,0.5,1}', '{0.5,0.5}', '{}', NULL, 'e1')$$,
  '23514', NULL, 'perception: a box outside the frame is refused');
RESET ROLE;

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"84500000-0000-4000-8000-0000000000a1","role":"authenticated"}';
SELECT throws_ok(
  $$SELECT public.set_plate_focal('84500000-0000-4000-8000-000000000501', '{0.2,0.2,0.4,0.4}', '{1.2,0.5}')$$,
  '23514', NULL, 'focal: a focal point outside 0-1 is refused');
SELECT lives_ok(
  $$SELECT public.set_plate_focal('84500000-0000-4000-8000-000000000501', '{0.2,0.2,0.4,0.4}', '{0.9,0.9}')$$,
  'focal: the owner sets a focal point (outside the box is accepted)');
RESET ROLE;
SELECT is(
  (SELECT row(subject_box, focal, focal_origin)::text
   FROM public.client_plate_assets WHERE id = '84500000-0000-4000-8000-000000000501'),
  row('{0.2,0.2,0.4,0.4}'::numeric[], '{0.9,0.9}'::numeric[], 'designer')::text,
  'focal: written with origin designer');
SELECT is(
  (SELECT row(count(*), min(status), min(attempts), bool_and(asset_id = '84500000-0000-4000-8000-000000000501'))::text
   FROM public.client_plate_requests WHERE asset_id = '84500000-0000-4000-8000-000000000501'),
  row(1::bigint, 'queued', 0, true)::text,
  'focal: the asset''s source is queued again and keeps its asset');

SET LOCAL ROLE service_role;
SELECT 'read' AS us49 FROM (SELECT set_config('us49.facts',
  public.get_project_editorial_facts('84500000-0000-4000-8000-000000000001')::text, true)) AS stash;
SELECT lives_ok(
  $$SELECT public.record_plate_perception('84500000-0000-4000-8000-000000000501', '{0,0,1,1}', '{0.5,0.5}',
                                          '{watermark}', NULL, 'e2')$$,
  'perception: the model perceives a plate with a designer focal');
RESET ROLE;
SELECT is(
  (SELECT row(subject_box, focal, focal_origin, flags, perceived_prompt_version)::text
   FROM public.client_plate_assets WHERE id = '84500000-0000-4000-8000-000000000501'),
  row('{0.2,0.2,0.4,0.4}'::numeric[], '{0.9,0.9}'::numeric[], 'designer', '{watermark}'::text[], 'e2')::text,
  'perception: a designer focal is never overwritten; flags and version still land');

-- ─── facts (read while the re-crop was queued) ─────────────────────────────

SELECT is(
  (SELECT facts -> 'project' -> 'studio' -> 'id' FROM (SELECT current_setting('us49.facts')::jsonb AS facts) AS read),
  '"84500000-0000-4000-8000-0000000000f1"'::jsonb,
  'facts: project.studio.id names the studio');
SELECT is(
  (SELECT jsonb_build_array(asset -> 'focalOrigin', asset ? 'perceivedPromptVersion', asset -> 'sourceKind')
   FROM (SELECT current_setting('us49.facts')::jsonb AS facts) AS read,
        jsonb_array_elements(facts -> 'assets') AS asset
   WHERE asset ->> 'id' = '84500000-0000-4000-8000-000000000501'),
  '["designer", true, "maker"]'::jsonb,
  'facts: the plate stays while its re-crop is queued, with focal origin and perception version');
SELECT is(
  (SELECT (facts - 'project') - 'assets'
   FROM (SELECT current_setting('us49.facts')::jsonb AS facts) AS read),
  (SELECT (envelope - 'project') - 'assets'
   FROM (SELECT public._build_project_editorial('84500000-0000-4000-8000-000000000001') AS envelope) AS built),
  'facts: rooms, palette, boards and sheets are the client envelope''s');
SELECT is(public.get_project_editorial_facts('84500000-0000-4000-8000-0000000000ff'), NULL,
          'facts: an unknown project reads NULL');

-- ─── dispatch: kill switch, expiry; run cost from p_detail ─────────────────

UPDATE public.llm_feature_controls SET enabled = false WHERE feature = 'client-edition-compose';
INSERT INTO public.client_editions (id, project_id, seq, status, lease_token, lease_expires_at)
VALUES ('84500000-0000-4000-8000-000000000909', '84500000-0000-4000-8000-000000000001', 9, 'drafting',
        '84500000-0000-4000-8000-0000000007a9', now() - interval '1 minute');
INSERT INTO public.client_edition_requests (id, project_id, reason, debounce_key, status, lease_token, lease_expires_at, attempts)
VALUES ('84500000-0000-4000-8000-000000000608', '84500000-0000-4000-8000-000000000001', 'concept_render',
        '84500000-0000-4000-8000-000000000001:concept_render', 'leased',
        '84500000-0000-4000-8000-0000000007a8', now() - interval '1 minute', 1);
SELECT is(public.dispatch_client_edition_compose(), NULL,
          'dispatch: composition switched off opens no run');
SELECT is(
  (SELECT row(edition.status, edition.facts ->> 'error', request.status, request.lease_token IS NULL)::text
   FROM public.client_editions AS edition, public.client_edition_requests AS request
   WHERE edition.id = '84500000-0000-4000-8000-000000000909'
     AND request.id = '84500000-0000-4000-8000-000000000608'),
  row('failed', 'lease expired', 'queued', true)::text,
  'dispatch: an expired draft fails, an expired lease returns to the queue');

SET LOCAL ROLE service_role;
SELECT 'run' AS us49 FROM (SELECT set_config('us49.run', public.begin_client_edition_compose_run()::text, true)) AS stash;
SELECT lives_ok(
  format($$SELECT public.finish_client_edition_compose_run(%s, 'succeeded', '{"cost_usd": 0.123456, "editions": 1}')$$,
         current_setting('us49.run')),
  'dispatch: the composer finishes its run with its cost in p_detail');
RESET ROLE;
SELECT is(
  (SELECT row(status, cost_usd, detail ->> 'cost_usd_exact', detail ->> 'editions')::text
   FROM public.job_runs WHERE id = current_setting('us49.run')::bigint),
  row('succeeded', 0.12::numeric(8,2), '0.123456', '1')::text,
  'dispatch: the run records its cost (rounded column, exact in detail)');

-- ─── before/after: the Phase 1 reader, 00842 body against 00845 builder ────
-- The re-crop is put back to done (the one state 00842 reads), then every
-- project with a client is read as its client under the 00845 body, 00842
-- is run again from its file, and every project is read again.

UPDATE public.client_plate_requests SET status = 'done'
 WHERE asset_id = '84500000-0000-4000-8000-000000000501';

CREATE TEMP TABLE us49_editorial (
  project_id uuid,
  show_makers boolean,
  after_text text,
  before_text text,
  PRIMARY KEY (project_id, show_makers)
);
CREATE FUNCTION pg_temp.us49_read(p_project_id uuid, p_client_id uuid)
RETURNS text
LANGUAGE plpgsql
AS $f$
BEGIN
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', p_client_id, 'role', 'authenticated')::text, true);
  RETURN public.get_client_project_editorial(p_project_id)::text;
END;
$f$;

INSERT INTO us49_editorial (project_id, show_makers, after_text)
SELECT project.id, project.show_makers, pg_temp.us49_read(project.id, project.client_id)
FROM public.projects AS project WHERE project.client_id IS NOT NULL;
UPDATE public.projects SET show_makers = true WHERE id = '84500000-0000-4000-8000-000000000001';
INSERT INTO us49_editorial (project_id, show_makers, after_text)
SELECT project.id, true, pg_temp.us49_read(project.id, project.client_id)
FROM public.projects AS project WHERE project.id = '84500000-0000-4000-8000-000000000001';

SET CONSTRAINTS ALL IMMEDIATE;
\ir ../migrations/00842_client_editorial_reader.sql

UPDATE us49_editorial AS read
   SET before_text = pg_temp.us49_read(project.id, project.client_id)
  FROM public.projects AS project
 WHERE project.id = read.project_id AND read.show_makers = project.show_makers;
UPDATE public.projects SET show_makers = false WHERE id = '84500000-0000-4000-8000-000000000001';
UPDATE us49_editorial AS read
   SET before_text = pg_temp.us49_read(project.id, project.client_id)
  FROM public.projects AS project
 WHERE project.id = read.project_id AND read.show_makers = project.show_makers AND read.before_text IS NULL;

SELECT is(
  (SELECT count(*) FROM us49_editorial WHERE before_text IS DISTINCT FROM after_text OR after_text IS NULL),
  0::bigint,
  'before/after: every envelope is byte-identical under the 00842 body and the shared builder');
SELECT is(
  (SELECT count(*) FROM us49_editorial),
  (SELECT count(*) + 1 FROM public.projects WHERE client_id IS NOT NULL),
  'before/after: the comparison covered the fixture both ways and every project with a client');
SELECT ok(
  (SELECT after_text::jsonb -> 'rooms' -> 0 -> 'items' -> 0 ->> 'makerName' = 'Atelier Nord'
          AND jsonb_array_length(after_text::jsonb -> 'assets') >= 1
   FROM us49_editorial
   WHERE project_id = '84500000-0000-4000-8000-000000000001' AND show_makers),
  'before/after: the fixture envelope is a real one (signed line, maker, plate)');

SELECT * FROM finish();
ROLLBACK;
