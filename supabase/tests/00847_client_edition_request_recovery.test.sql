-- ═══════════════════════════════════════════════════════════════════════════
-- 00847 — one recomposition after a swept draft; the reader's what trim
--
-- Named cases (the sweep is dispatch_client_edition_compose with composition
-- switched off, so no run opens and no function is called):
--   shape       the trigger is on client_editions; its function is callable
--               by no API role
--   recover     an expired drafting edition is swept → exactly one request,
--               reason recompose_after_failed_draft, queued through the
--               30-minute debounce with no lease and no attempts; a second
--               sweep adds nothing; the request is claimed and begun like any
--               other (attempts 1, ten-minute lease, the next seq)
--   capped      the recovery's own draft is swept too (N = 2) → nothing is
--               queued; a new organic change still queues as before
--   daily cap   the swept draft is the second edition today → the recovery
--               is queued but not claimed; once the day turns it is
--   newer       a queued change, or a request in flight, already composes the
--               project → no recovery
--   frozen      a closed-out job gets no recovery
--   streak      a previous edition the composer recorded failed does not cap
--   what trim   (SQ-1687 C2) makers off: en dashes and slashes trim from a
--               stripped what's ends; a what with no letter or digit left is
--               the line's category, else the kind words; inner punctuation
--               stays
--
-- Run (from supabase/): psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" \
--        -v ON_ERROR_STOP=1 -f tests/00847_client_edition_request_recovery.test.sql
-- finish(true) raises on any failed assertion, so psql exits non-zero.
-- Everything is rolled back.
-- ═══════════════════════════════════════════════════════════════════════════
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT plan(20);

-- ─── shape ─────────────────────────────────────────────────────────────────

SELECT has_trigger('public', 'client_editions', 'trg_client_editions_recompose_failed_draft',
                   'shape: the recovery trigger is on client_editions');
SELECT ok(NOT has_function_privilege('anon', 'public.client_edition_recompose_failed_draft()', 'EXECUTE')
          AND NOT has_function_privilege('authenticated', 'public.client_edition_recompose_failed_draft()', 'EXECUTE'),
          'shape: the trigger function is callable by no API role');

-- ─── fixtures (as postgres) ────────────────────────────────────────────────
-- O owner of the studio · C the client. P1 recover → capped · P2 daily cap ·
-- P3 a queued change · P4 a request in flight · P5 frozen · P6 a composer
-- failure before · P7 the what trim (makers off).

INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, instance_id, aud, role)
VALUES
  ('84700000-0000-4000-8000-0000000000a1', 'us49-847-owner@test.invalid',  '', now(), now(), now(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('84700000-0000-4000-8000-0000000000a2', 'us49-847-client@test.invalid', '', now(), now(), now(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');
INSERT INTO public.profiles (id, email, full_name, is_designer, created_at, updated_at)
VALUES
  ('84700000-0000-4000-8000-0000000000a1', 'us49-847-owner@test.invalid',  'US49 847 Owner',  true,  now(), now()),
  ('84700000-0000-4000-8000-0000000000a2', 'us49-847-client@test.invalid', 'US49 847 Client', false, now(), now())
ON CONFLICT (id) DO UPDATE
SET email = EXCLUDED.email, full_name = EXCLUDED.full_name, is_designer = EXCLUDED.is_designer;
INSERT INTO public.organizations (id, type, name, slug, address)
VALUES ('84700000-0000-4000-8000-0000000000f1', 'design_studio', 'US49 847 Studio', 'us49-847-studio-test',
        '{"city": "Hudson"}'::jsonb);
INSERT INTO public.organization_members (id, user_id, organization_id, role, status, joined_at)
VALUES ('84700000-0000-4000-8000-0000000000e1', '84700000-0000-4000-8000-0000000000a1',
        '84700000-0000-4000-8000-0000000000f1', 'owner', 'active', now());
INSERT INTO public.projects (id, name, designer_id, client_id, created_by, studio_id, status, show_makers)
SELECT ('84700000-0000-4000-8000-00000000000' || n)::uuid, 'US49 847 House ' || n,
       '84700000-0000-4000-8000-0000000000a1', '84700000-0000-4000-8000-0000000000a2',
       '84700000-0000-4000-8000-0000000000a1', '84700000-0000-4000-8000-0000000000f1', 'active', false
FROM generate_series(1, 7) AS n;

-- Composition off: the sweep runs, no run opens. Every open request
-- anywhere is answered; this file queues its own.
UPDATE public.llm_feature_controls SET enabled = false WHERE feature = 'client-edition-compose';
UPDATE public.client_edition_requests
   SET status = 'done', lease_token = NULL, lease_expires_at = NULL
 WHERE status IN ('queued', 'leased');

-- Editions. "today" rows take the default created_at (now()); a draft's
-- lease ran out a minute ago. P1/P2/P5 have an approved edition, P6 a draft
-- the composer recorded failed; P2's approved edition is from today.
INSERT INTO public.client_editions (id, project_id, seq, status, kind, approved_at, frozen_at, facts, created_at)
VALUES
  ('84700000-0000-4000-8000-000000000911', '84700000-0000-4000-8000-000000000001', 1, 'approved', 'full',
   now() - interval '1 day', NULL, '{}'::jsonb, now() - interval '1 day'),
  ('84700000-0000-4000-8000-000000000921', '84700000-0000-4000-8000-000000000002', 1, 'approved', 'full',
   now(), NULL, '{}'::jsonb, now()),
  ('84700000-0000-4000-8000-000000000951', '84700000-0000-4000-8000-000000000005', 1, 'approved', 'full',
   now() - interval '1 day', now(), '{}'::jsonb, now() - interval '1 day'),
  ('84700000-0000-4000-8000-000000000961', '84700000-0000-4000-8000-000000000006', 1, 'failed', 'full',
   NULL, NULL, '{"error": "compose failed"}'::jsonb, now() - interval '1 day');
INSERT INTO public.client_editions (id, project_id, seq, status, lease_token, lease_expires_at)
VALUES
  ('84700000-0000-4000-8000-000000000912', '84700000-0000-4000-8000-000000000001', 2, 'drafting',
   '84700000-0000-4000-8000-000000000712', now() - interval '1 minute'),
  ('84700000-0000-4000-8000-000000000922', '84700000-0000-4000-8000-000000000002', 2, 'drafting',
   '84700000-0000-4000-8000-000000000722', now() - interval '1 minute'),
  ('84700000-0000-4000-8000-000000000931', '84700000-0000-4000-8000-000000000003', 1, 'drafting',
   '84700000-0000-4000-8000-000000000731', now() - interval '1 minute'),
  ('84700000-0000-4000-8000-000000000941', '84700000-0000-4000-8000-000000000004', 1, 'drafting',
   '84700000-0000-4000-8000-000000000741', now() - interval '1 minute'),
  ('84700000-0000-4000-8000-000000000952', '84700000-0000-4000-8000-000000000005', 2, 'drafting',
   '84700000-0000-4000-8000-000000000752', now() - interval '1 minute'),
  ('84700000-0000-4000-8000-000000000962', '84700000-0000-4000-8000-000000000006', 2, 'drafting',
   '84700000-0000-4000-8000-000000000762', now() - interval '1 minute');

-- The requests the drafts consumed (done by begin), a change P3 queued
-- since, and P4's request in flight.
INSERT INTO public.client_edition_requests (id, project_id, reason, debounce_key, status, attempts, available_at,
                                            lease_token, lease_expires_at)
VALUES
  ('84700000-0000-4000-8000-000000000611', '84700000-0000-4000-8000-000000000001', 'phase',
   '84700000-0000-4000-8000-000000000001:phase', 'done', 1, now() - interval '45 minutes', NULL, NULL),
  ('84700000-0000-4000-8000-000000000631', '84700000-0000-4000-8000-000000000003', 'item_image',
   '84700000-0000-4000-8000-000000000003:item_image', 'queued', 0, now() + interval '20 minutes', NULL, NULL),
  ('84700000-0000-4000-8000-000000000641', '84700000-0000-4000-8000-000000000004', 'palette',
   '84700000-0000-4000-8000-000000000004:palette', 'leased', 1, now() - interval '5 minutes',
   '84700000-0000-4000-8000-000000000841', now() + interval '5 minutes');

-- ─── the sweep ─────────────────────────────────────────────────────────────

SELECT is(public.dispatch_client_edition_compose(), NULL,
          'recover: the sweep runs with composition off and opens no run');

-- ─── recover ───────────────────────────────────────────────────────────────

SELECT is(
  (SELECT jsonb_build_object(
            'draft', (SELECT row(status, facts ->> 'error', lease_token IS NULL)::text
                      FROM public.client_editions WHERE id = '84700000-0000-4000-8000-000000000912'),
            'open', jsonb_agg(jsonb_build_object(
                      'reason', request.reason, 'debounce_key', request.debounce_key, 'status', request.status,
                      'attempts', request.attempts, 'leased', request.lease_token IS NOT NULL,
                      'available_in', request.available_at - now())))
   FROM public.client_edition_requests AS request
   WHERE request.project_id = '84700000-0000-4000-8000-000000000001'
     AND request.status IN ('queued', 'leased')),
  jsonb_build_object(
    'draft', row('failed', 'lease expired', true)::text,
    'open', jsonb_build_array(jsonb_build_object(
      'reason', 'recompose_after_failed_draft',
      'debounce_key', '84700000-0000-4000-8000-000000000001:recompose_after_failed_draft',
      'status', 'queued', 'attempts', 0, 'leased', false, 'available_in', interval '30 minutes'))),
  'recover: the swept draft fails and exactly one request is queued, debounced 30 minutes, no lease, no attempts');

SELECT is(public.dispatch_client_edition_compose(), NULL, 'recover: a second sweep runs');
SELECT is(
  (SELECT count(*) FROM public.client_edition_requests
   WHERE project_id = '84700000-0000-4000-8000-000000000001' AND reason = 'recompose_after_failed_draft'),
  1::bigint,
  'recover: a second sweep queues nothing more');

-- The recovery comes due; the compose lane takes it like any request.
UPDATE public.client_edition_requests SET available_at = now() - interval '1 minute'
 WHERE project_id = '84700000-0000-4000-8000-000000000001' AND reason = 'recompose_after_failed_draft';
SET LOCAL ROLE service_role;
-- Nothing claimed stashes {} and begins nothing, so the assertions below
-- fail rather than the file erroring.
SELECT 'claimed' AS us49 FROM (SELECT set_config('us49.claim_p1',
  COALESCE((SELECT to_jsonb(claimed) FROM public.claim_client_edition_requests(20) AS claimed
            WHERE claimed.project_id = '84700000-0000-4000-8000-000000000001'), '{}'::jsonb)::text,
  true)) AS stash;
SELECT 'begun' AS us49 FROM (SELECT set_config('us49.draft_p1',
  CASE WHEN claim ? 'id'
       THEN public.begin_client_edition((claim ->> 'id')::uuid, (claim ->> 'lease_token')::uuid)::text
       ELSE '' END, true)
  FROM (SELECT current_setting('us49.claim_p1')::jsonb AS claim) AS read) AS stash;
RESET ROLE;
SELECT is(
  jsonb_build_object(
    'claimed', (SELECT jsonb_build_object('reason', claim ->> 'reason', 'attempts', claim -> 'attempts',
                                          'lease', (claim ->> 'lease_expires_at')::timestamptz - now())
                FROM (SELECT current_setting('us49.claim_p1')::jsonb AS claim) AS read),
    'draft', (SELECT row(seq, status)::text FROM public.client_editions
              WHERE id = NULLIF(current_setting('us49.draft_p1'), '')::uuid),
    'request', (SELECT status FROM public.client_edition_requests
                WHERE id = (current_setting('us49.claim_p1')::jsonb ->> 'id')::uuid)),
  jsonb_build_object(
    'claimed', jsonb_build_object('reason', 'recompose_after_failed_draft', 'attempts', 1,
                                  'lease', interval '10 minutes'),
    'draft', row(3, 'drafting')::text,
    'request', 'done'),
  'recover: claimed (attempts 1, ten-minute lease) and begun as seq 3 like any request');

-- ─── capped (N = 2) ────────────────────────────────────────────────────────

UPDATE public.client_editions SET lease_expires_at = now() - interval '1 minute'
 WHERE id = NULLIF(current_setting('us49.draft_p1'), '')::uuid;
SELECT is(public.dispatch_client_edition_compose(), NULL, 'capped: the sweep runs over the recovery''s draft');
SELECT is(
  (SELECT jsonb_build_object(
            'draft', (SELECT status FROM public.client_editions WHERE id = NULLIF(current_setting('us49.draft_p1'), '')::uuid),
            'open', (SELECT count(*) FROM public.client_edition_requests
                     WHERE project_id = '84700000-0000-4000-8000-000000000001'
                       AND status IN ('queued', 'leased')),
            'recoveries', (SELECT count(*) FROM public.client_edition_requests
                           WHERE project_id = '84700000-0000-4000-8000-000000000001'
                             AND reason = 'recompose_after_failed_draft'))),
  '{"draft": "failed", "open": 0, "recoveries": 1}'::jsonb,
  'capped: the last two drafts both swept (N = 2) → nothing queued, the one recovery stays the only one');
SELECT public._enqueue_client_edition_request('84700000-0000-4000-8000-000000000001', 'phase');
SELECT is(
  (SELECT jsonb_agg(row(reason, status)::text) FROM public.client_edition_requests
   WHERE project_id = '84700000-0000-4000-8000-000000000001' AND status IN ('queued', 'leased')),
  jsonb_build_array(row('phase', 'queued')::text),
  'capped: a new organic change still queues, and is what composes the project next');

-- ─── daily cap ─────────────────────────────────────────────────────────────

UPDATE public.client_edition_requests SET available_at = now() - interval '1 minute'
 WHERE project_id = '84700000-0000-4000-8000-000000000002' AND reason = 'recompose_after_failed_draft';
SET LOCAL ROLE service_role;
SELECT is(
  (SELECT count(*) FROM public.claim_client_edition_requests(20) AS claimed
   WHERE claimed.project_id = '84700000-0000-4000-8000-000000000002'),
  0::bigint,
  'daily cap: the swept draft is the second edition today → claim leases nothing for the project');
RESET ROLE;
SELECT is(
  (SELECT jsonb_agg(row(reason, status, attempts)::text) FROM public.client_edition_requests
   WHERE project_id = '84700000-0000-4000-8000-000000000002' AND status IN ('queued', 'leased')),
  jsonb_build_array(row('recompose_after_failed_draft', 'queued', 0)::text),
  'daily cap: the recovery is queued once and waits, unclaimed');
UPDATE public.client_editions SET created_at = now() - interval '1 day'
 WHERE project_id = '84700000-0000-4000-8000-000000000002';
SET LOCAL ROLE service_role;
SELECT is(
  (SELECT row(claimed.reason, claimed.status, claimed.attempts)::text
   FROM public.claim_client_edition_requests(20) AS claimed
   WHERE claimed.project_id = '84700000-0000-4000-8000-000000000002'),
  row('recompose_after_failed_draft', 'leased', 1)::text,
  'daily cap: once the day turns the recovery is claimed');
RESET ROLE;

-- ─── newer request, frozen, streak ────────────────────────────────────────

SELECT is(
  (SELECT jsonb_agg(row(reason, status)::text ORDER BY reason) FROM public.client_edition_requests
   WHERE project_id = '84700000-0000-4000-8000-000000000003' AND status IN ('queued', 'leased')),
  jsonb_build_array(row('item_image', 'queued')::text),
  'newer: a change queued since the draft began composes the project → no recovery');
SELECT is(
  (SELECT jsonb_agg(row(id, status, lease_token)::text) FROM public.client_edition_requests
   WHERE project_id = '84700000-0000-4000-8000-000000000004' AND status IN ('queued', 'leased')),
  jsonb_build_array(row('84700000-0000-4000-8000-000000000641'::uuid, 'leased',
                        '84700000-0000-4000-8000-000000000841'::uuid)::text),
  'newer: a request in flight composes the project → no recovery, its lease untouched');
SELECT is(
  (SELECT jsonb_build_object(
            'draft', (SELECT status FROM public.client_editions WHERE id = '84700000-0000-4000-8000-000000000952'),
            'requests', (SELECT count(*) FROM public.client_edition_requests
                         WHERE project_id = '84700000-0000-4000-8000-000000000005'))),
  '{"draft": "failed", "requests": 0}'::jsonb,
  'frozen: a closed-out job''s swept draft queues nothing');
SELECT is(
  (SELECT jsonb_agg(row(reason, status)::text) FROM public.client_edition_requests
   WHERE project_id = '84700000-0000-4000-8000-000000000006' AND status IN ('queued', 'leased')),
  jsonb_build_array(row('recompose_after_failed_draft', 'queued')::text),
  'streak: a previous edition the composer recorded failed is no sweep → the recovery is queued');

-- ─── what trim (SQ-1687 C2), makers off ───────────────────────────────────
-- W1 a sideboard picture whose what is the maker and an en dash; W2 a board
-- whose what is the maker between a slash and an en dash; W3 a console
-- whose what keeps an inner slash.

INSERT INTO public.client_plate_assets (id, project_id, sha256, source_kind, source_ref, original_key, width, height)
VALUES
  ('84700000-0000-4000-8000-000000000571', '84700000-0000-4000-8000-000000000007', repeat('a', 64), 'maker',
   '{"table": "project_ffe_item_images", "id": "84700000-0000-4000-8000-000000000591"}'::jsonb,
   'plates/847/a/original.jpg', 2400, 1600),
  ('84700000-0000-4000-8000-000000000572', '84700000-0000-4000-8000-000000000007', repeat('b', 64), 'board',
   '{"table": "project_boards", "id": "84700000-0000-4000-8000-000000000592"}'::jsonb,
   'plates/847/b/original.jpg', 1600, 1000),
  ('84700000-0000-4000-8000-000000000573', '84700000-0000-4000-8000-000000000007', repeat('c', 64), 'maker',
   '{"table": "project_ffe_item_images", "id": "84700000-0000-4000-8000-000000000593"}'::jsonb,
   'plates/847/c/original.jpg', 2400, 1600);
INSERT INTO public.client_editions (id, project_id, seq, status, kind, composition, facts, overrides,
                                    auto_published, approved_at, source_hash)
VALUES
  ('84700000-0000-4000-8000-000000000971', '84700000-0000-4000-8000-000000000007', 1, 'approved', 'full',
   '{"sourceHash": "h71", "voice": "model", "hero": null, "held": [], "chapters": [], "doorstep": null,
     "notice": null}'::jsonb,
   $j${"project": {"id": "84700000-0000-4000-8000-000000000007", "name": "US49 847 House 7", "phase": "install",
                   "targetDate": null, "showMakers": true,
                   "studio": {"id": "84700000-0000-4000-8000-0000000000f1", "name": "US49 847 Studio", "town": "Hudson"}},
       "rooms": [{"id": "84700000-0000-4000-8000-000000000071", "name": "Hall",
                  "anchor": "room-84700000-0000-4000-8000-000000000071", "conceptAssetId": null, "scanAssetIds": [],
                  "items": [{"id": "84700000-0000-4000-8000-000000000171", "nameAsSigned": "Walnut sideboard",
                             "category": "Storage", "status": "ordered", "makerName": "Harmon Bench Works",
                             "assetIds": ["84700000-0000-4000-8000-000000000571"], "silhouetteKind": "case"},
                            {"id": "84700000-0000-4000-8000-000000000172", "nameAsSigned": "Console",
                             "category": "Storage", "status": "ordered", "makerName": "Harmon Bench Works",
                             "assetIds": ["84700000-0000-4000-8000-000000000573"], "silhouetteKind": "case"}]}],
       "assets": [{"id": "84700000-0000-4000-8000-000000000571", "sourceKind": "maker",
                   "caption": {"what": "Harmon Bench Works – ", "whose": "Harmon Bench Works",
                               "when": "4 October 2026"},
                   "alt": "Harmon Bench Works – · Harmon Bench Works · product photograph"},
                  {"id": "84700000-0000-4000-8000-000000000572", "sourceKind": "board",
                   "caption": {"what": "/ Harmon Bench Works –", "whose": "US49 847 Studio",
                               "when": "4 October 2026"},
                   "alt": "Hall board · US49 847 Studio · studio board"},
                  {"id": "84700000-0000-4000-8000-000000000573", "sourceKind": "maker",
                   "caption": {"what": "Harmon Bench Works – oak / walnut", "whose": "Harmon Bench Works",
                               "when": "4 October 2026"},
                   "alt": "Harmon Bench Works console · Harmon Bench Works · product photograph"}],
       "palette": [], "boards": [], "sheets": []}$j$::jsonb,
   '{}'::jsonb, false, now(), 'h71');

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"84700000-0000-4000-8000-0000000000a2","role":"authenticated"}';
SELECT 'read' AS us49 FROM (SELECT set_config('us49.trim_off',
  public.get_client_project_edition('84700000-0000-4000-8000-000000000007')::text, true)) AS stash;
RESET ROLE;

SELECT is(
  (SELECT asset -> 'caption' ->> 'what'
   FROM jsonb_array_elements(current_setting('us49.trim_off')::jsonb -> 'assets') AS asset
   WHERE asset ->> 'id' = '84700000-0000-4000-8000-000000000571'),
  'Storage',
  'what trim: "Harmon Bench Works – " leaves no letter or digit → the line''s category, not "–"');
SELECT is(
  (SELECT asset -> 'caption' ->> 'what'
   FROM jsonb_array_elements(current_setting('us49.trim_off')::jsonb -> 'assets') AS asset
   WHERE asset ->> 'id' = '84700000-0000-4000-8000-000000000572'),
  public._client_plate_alt(NULL, NULL, 'board'),
  'what trim: "/ Harmon Bench Works –" on a board with no line → the kind words, not "/ –"');
SELECT is(
  (SELECT asset -> 'caption' ->> 'what'
   FROM jsonb_array_elements(current_setting('us49.trim_off')::jsonb -> 'assets') AS asset
   WHERE asset ->> 'id' = '84700000-0000-4000-8000-000000000573'),
  'oak / walnut',
  'what trim: "Harmon Bench Works – oak / walnut" → "oak / walnut", the edge dash trimmed, the inner slash kept');

SELECT * FROM finish(true);
ROLLBACK;
