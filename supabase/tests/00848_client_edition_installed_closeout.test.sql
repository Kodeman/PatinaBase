-- ═══════════════════════════════════════════════════════════════════════════
-- 00848 — close-out freezes the edition; client_plate_source_owned fails closed
--
-- Named cases (the dispatcher runs with composition switched off, so no run
-- opens and no function is called):
--   shape       the freeze trigger is on projects; the new helpers are
--               callable by no API role; undo and dispatch keep their grants
--   freeze      closing a job freezes its approved edition and points
--               facts.portfolioSnapshotRef at projects.portfolio_snapshot
--               (sha256, never a copy); other facts stay; a draft awaiting
--               review is not frozen
--   guards      after the close, approve, undo and begin refuse (55000);
--               a closed job with no approved edition refuses with the
--               closed message, and undo of an approved edition that is not
--               frozen refuses too
--   backfill    _client_edition_freeze freezes a completed job's approved
--               edition (present false without a snapshot)
--   dispatcher  a closed job's queued requests end done, close_reason
--               'closed'; a leased one and an open job's are left alone
--   recovery    00847's recompose trigger queues nothing for a closed job's
--               swept draft; an open job's swept draft still gets one
--   ownership   client_plate_source_owned: field_captures and any unknown
--               table are FALSE; the four emitted tables keep the 00843
--               answers (checked against 00843's body, kept here verbatim)
--
-- Run (from supabase/): psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" \
--        -v ON_ERROR_STOP=1 -f tests/00848_client_edition_installed_closeout.test.sql
-- finish(true) raises on any failed assertion, so psql exits non-zero.
-- Everything is rolled back.
-- ═══════════════════════════════════════════════════════════════════════════
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT plan(23);

-- ─── shape ─────────────────────────────────────────────────────────────────

SELECT has_trigger('public', 'projects', 'trg_client_edition_freeze_on_close',
                   'shape: the freeze trigger is on projects');
SELECT ok(NOT has_function_privilege('anon', 'public._client_edition_closed(uuid)', 'EXECUTE')
          AND NOT has_function_privilege('authenticated', 'public._client_edition_closed(uuid)', 'EXECUTE')
          AND NOT has_function_privilege('anon', 'public._client_edition_freeze(uuid)', 'EXECUTE')
          AND NOT has_function_privilege('authenticated', 'public._client_edition_freeze(uuid)', 'EXECUTE')
          AND NOT has_function_privilege('anon', 'public.client_edition_freeze_on_close()', 'EXECUTE')
          AND NOT has_function_privilege('authenticated', 'public.client_edition_freeze_on_close()', 'EXECUTE'),
          'shape: the closed, freeze and trigger functions are callable by no API role');
SELECT ok(has_function_privilege('authenticated', 'public.undo_client_edition(uuid)', 'EXECUTE')
          AND NOT has_function_privilege('anon', 'public.undo_client_edition(uuid)', 'EXECUTE')
          AND has_function_privilege('service_role', 'public.dispatch_client_edition_compose()', 'EXECUTE')
          AND NOT has_function_privilege('authenticated', 'public.dispatch_client_edition_compose()', 'EXECUTE')
          AND has_function_privilege('service_role', 'public.client_plate_source_owned(uuid, text, uuid, text)', 'EXECUTE')
          AND NOT has_function_privilege('authenticated', 'public.client_plate_source_owned(uuid, text, uuid, text)', 'EXECUTE'),
          'shape: undo stays the studio''s, dispatch and the ownership check stay service-only');

-- ─── fixtures (as postgres) ────────────────────────────────────────────────
-- O owner of the studio · C the client. P1 closed with a snapshot and an
-- approved edition · P2 closed, no snapshot, no approved edition · P3 closed
-- with an expired draft · P4 open, a queued change · P5 open, an expired
-- draft · P6/P7 the plate ownership matrix.

INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, instance_id, aud, role)
VALUES
  ('84800000-0000-4000-8000-0000000000a1', 'us49-848-owner@test.invalid',  '', now(), now(), now(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('84800000-0000-4000-8000-0000000000a2', 'us49-848-client@test.invalid', '', now(), now(), now(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');
INSERT INTO public.profiles (id, email, full_name, is_designer, created_at, updated_at)
VALUES
  ('84800000-0000-4000-8000-0000000000a1', 'us49-848-owner@test.invalid',  'US49 848 Owner',  true,  now(), now()),
  ('84800000-0000-4000-8000-0000000000a2', 'us49-848-client@test.invalid', 'US49 848 Client', false, now(), now())
ON CONFLICT (id) DO UPDATE
SET email = EXCLUDED.email, full_name = EXCLUDED.full_name, is_designer = EXCLUDED.is_designer;
INSERT INTO public.organizations (id, type, name, slug, address)
VALUES ('84800000-0000-4000-8000-0000000000f1', 'design_studio', 'US49 848 Studio', 'us49-848-studio-test',
        '{"city": "Hudson"}'::jsonb);
INSERT INTO public.organization_members (id, user_id, organization_id, role, status, joined_at)
VALUES ('84800000-0000-4000-8000-0000000000e1', '84800000-0000-4000-8000-0000000000a1',
        '84800000-0000-4000-8000-0000000000f1', 'owner', 'active', now());
INSERT INTO public.projects (id, name, designer_id, client_id, created_by, studio_id, status, show_makers)
SELECT ('84800000-0000-4000-8000-00000000000' || n)::uuid, 'US49 848 House ' || n,
       '84800000-0000-4000-8000-0000000000a1', '84800000-0000-4000-8000-0000000000a2',
       '84800000-0000-4000-8000-0000000000a1', '84800000-0000-4000-8000-0000000000f1', 'active', false
FROM generate_series(1, 7) AS n;

-- Composition off: the sweep runs, no run opens. Every open request
-- anywhere is answered; this file queues its own.
UPDATE public.llm_feature_controls SET enabled = false WHERE feature = 'client-edition-compose';
UPDATE public.client_edition_requests
   SET status = 'done', lease_token = NULL, lease_expires_at = NULL
 WHERE status IN ('queued', 'leased');

INSERT INTO public.client_editions (id, project_id, seq, status, kind, approved_at, facts, created_at)
VALUES
  ('84800000-0000-4000-8000-000000000911', '84800000-0000-4000-8000-000000000001', 1, 'approved', 'full',
   now() - interval '2 days', '{"keep": 1}'::jsonb, now() - interval '2 days'),
  ('84800000-0000-4000-8000-000000000912', '84800000-0000-4000-8000-000000000001', 2, 'awaiting_review', 'full',
   NULL, '{}'::jsonb, now() - interval '2 days'),
  ('84800000-0000-4000-8000-000000000921', '84800000-0000-4000-8000-000000000002', 1, 'awaiting_review', 'full',
   NULL, '{}'::jsonb, now() - interval '2 days');
INSERT INTO public.client_editions (id, project_id, seq, status, lease_token, lease_expires_at, created_at)
VALUES
  ('84800000-0000-4000-8000-000000000931', '84800000-0000-4000-8000-000000000003', 1, 'drafting',
   '84800000-0000-4000-8000-000000000731', now() - interval '1 minute', now() - interval '2 days'),
  ('84800000-0000-4000-8000-000000000951', '84800000-0000-4000-8000-000000000005', 1, 'drafting',
   '84800000-0000-4000-8000-000000000751', now() - interval '1 minute', now() - interval '2 days');

-- close_project's own transition: the completion GUC around the UPDATE.
CREATE FUNCTION pg_temp.close_job(p_id uuid, p_snapshot jsonb)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('app.project_completion_id', p_id::text, true);
  UPDATE public.projects SET status = 'completed', portfolio_snapshot = p_snapshot WHERE id = p_id;
  PERFORM set_config('app.project_completion_id', '', true);
END;
$$;

SELECT pg_temp.close_job('84800000-0000-4000-8000-000000000001',
                         '{"headline": "Done", "value_cents": 120000}'::jsonb);
SELECT pg_temp.close_job('84800000-0000-4000-8000-000000000002', NULL);
SELECT pg_temp.close_job('84800000-0000-4000-8000-000000000003',
                         '{"headline": "Porch", "value_cents": 5000}'::jsonb);

-- ─── freeze ────────────────────────────────────────────────────────────────

SELECT is(
  (SELECT jsonb_build_object('frozen', edition.frozen_at IS NOT NULL, 'ref', edition.facts -> 'portfolioSnapshotRef')
   FROM public.client_editions AS edition WHERE edition.id = '84800000-0000-4000-8000-000000000911'),
  (SELECT jsonb_build_object('frozen', true, 'ref', jsonb_build_object(
     'table', 'projects', 'column', 'portfolio_snapshot', 'id', project.id, 'present', true,
     'sha256', encode(sha256(convert_to('{"headline": "Done", "value_cents": 120000}'::jsonb::text, 'UTF8')), 'hex'),
     'closedAt', project.completed_at))
   FROM public.projects AS project WHERE project.id = '84800000-0000-4000-8000-000000000001'),
  'freeze: the approved edition is frozen with a pointer and hash of the portfolio snapshot');
SELECT is(
  (SELECT facts -> 'keep' FROM public.client_editions WHERE id = '84800000-0000-4000-8000-000000000911'),
  '1'::jsonb,
  'freeze: the edition''s other facts stay');
SELECT ok(
  (SELECT position('value_cents' IN facts::text) = 0 AND position('120000' IN facts::text) = 0
   FROM public.client_editions WHERE id = '84800000-0000-4000-8000-000000000911'),
  'freeze: the snapshot is pointed at, never copied (no value_cents in facts)');
SELECT is(
  (SELECT frozen_at FROM public.client_editions WHERE id = '84800000-0000-4000-8000-000000000912'),
  NULL::timestamptz,
  'freeze: a draft awaiting review is not frozen');

-- ─── guards ────────────────────────────────────────────────────────────────

INSERT INTO public.client_editions (id, project_id, seq, status, kind, approved_at, facts, created_at)
VALUES ('84800000-0000-4000-8000-000000000922', '84800000-0000-4000-8000-000000000002', 2, 'approved', 'full',
        now() - interval '1 day', '{}'::jsonb, now() - interval '2 days');
INSERT INTO public.client_edition_requests (id, project_id, reason, debounce_key, status, attempts, lease_token, lease_expires_at)
VALUES ('84800000-0000-4000-8000-000000000821', '84800000-0000-4000-8000-000000000002', 'phase',
        '84800000-0000-4000-8000-000000000002:phase', 'leased', 1,
        '84800000-0000-4000-8000-000000000721', now() + interval '10 minutes');

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"84800000-0000-4000-8000-0000000000a1","role":"authenticated"}';
SELECT throws_ok($$SELECT public.approve_client_edition('84800000-0000-4000-8000-000000000912')$$,
                 '55000', 'client_edition_frozen: this job is closed; its editions no longer change',
                 'guards: approve on a closed job is refused');
SELECT throws_ok($$SELECT public.approve_client_edition('84800000-0000-4000-8000-000000000921')$$,
                 '55000', 'client_edition_frozen: this job is closed; its editions no longer change',
                 'guards: approve on a closed job with no approved edition is refused with the closed message');
SELECT throws_ok($$SELECT public.undo_client_edition('84800000-0000-4000-8000-000000000911')$$,
                 '55000', NULL,
                 'guards: undo of the frozen edition is refused');
SELECT throws_ok($$SELECT public.undo_client_edition('84800000-0000-4000-8000-000000000922')$$,
                 '55000', 'client_edition_frozen: this job is closed; its editions no longer change',
                 'guards: undo of an approved edition that is not frozen is refused on a closed job');
RESET ROLE;

SET LOCAL ROLE service_role;
SELECT throws_ok($$SELECT public.begin_client_edition('84800000-0000-4000-8000-000000000821',
                                                      '84800000-0000-4000-8000-000000000721')$$,
                 '55000', 'client_edition_frozen: this job is closed; its editions no longer change',
                 'guards: begin on a closed job is refused');
RESET ROLE;

-- ─── backfill ──────────────────────────────────────────────────────────────

SELECT public._client_edition_freeze('84800000-0000-4000-8000-000000000002');
SELECT is(
  (SELECT jsonb_build_object('frozen', frozen_at IS NOT NULL,
                             'present', facts -> 'portfolioSnapshotRef' -> 'present',
                             'sha256', facts -> 'portfolioSnapshotRef' -> 'sha256')
   FROM public.client_editions WHERE id = '84800000-0000-4000-8000-000000000922'),
  '{"frozen": true, "present": false, "sha256": null}'::jsonb,
  'backfill: a completed job''s approved edition is frozen; no snapshot → present false, no hash');

-- ─── dispatcher + recovery ─────────────────────────────────────────────────
-- P1 and P2 got the 'closed' request 00844 queues on the close; P1 and P4
-- get a change too. P3's requests are answered so the only thing keeping
-- its swept draft from a recovery is the close.

SELECT public._enqueue_client_edition_request('84800000-0000-4000-8000-000000000001', 'phase', interval '0');
SELECT public._enqueue_client_edition_request('84800000-0000-4000-8000-000000000004', 'phase', interval '0');
UPDATE public.client_edition_requests SET status = 'done'
 WHERE project_id = '84800000-0000-4000-8000-000000000003' AND status = 'queued';

SELECT is(public.dispatch_client_edition_compose(), NULL::bigint,
          'dispatcher: composition off → no run');
SELECT is(
  (SELECT jsonb_agg(jsonb_build_object('p', right(project_id::text, 1), 'reason', reason,
                                       'status', status, 'close', close_reason)
                    ORDER BY project_id, reason)
   FROM public.client_edition_requests
   WHERE project_id IN ('84800000-0000-4000-8000-000000000001', '84800000-0000-4000-8000-000000000002')
     AND (status = 'queued' OR close_reason IS NOT NULL)),
  '[{"p": "1", "reason": "closed", "status": "done", "close": "closed"},
    {"p": "1", "reason": "phase",  "status": "done", "close": "closed"},
    {"p": "2", "reason": "closed", "status": "done", "close": "closed"}]'::jsonb,
  'dispatcher: a closed job''s queued requests end done, close_reason closed');
SELECT is(
  (SELECT status FROM public.client_edition_requests WHERE id = '84800000-0000-4000-8000-000000000821'),
  'leased',
  'dispatcher: a closed job''s leased request is left to its lease holder');
SELECT is(
  (SELECT jsonb_agg(jsonb_build_object('reason', reason, 'status', status, 'close', close_reason))
   FROM public.client_edition_requests WHERE project_id = '84800000-0000-4000-8000-000000000004'
     AND (status = 'queued' OR close_reason IS NOT NULL)),
  '[{"reason": "phase", "status": "queued", "close": null}]'::jsonb,
  'dispatcher: an open job''s queued request waits');
SELECT is(
  (SELECT jsonb_build_object(
     'swept', (SELECT status FROM public.client_editions WHERE id = '84800000-0000-4000-8000-000000000931'),
     'recovery', (SELECT count(*) FROM public.client_edition_requests
                  WHERE project_id = '84800000-0000-4000-8000-000000000003'
                    AND reason = 'recompose_after_failed_draft'))),
  '{"swept": "failed", "recovery": 0}'::jsonb,
  'recovery: a closed job''s swept draft queues no recomposition, in any status');
SELECT is(
  (SELECT jsonb_agg(jsonb_build_object('reason', reason, 'status', status))
   FROM public.client_edition_requests WHERE project_id = '84800000-0000-4000-8000-000000000005'
     AND reason = 'recompose_after_failed_draft'),
  '[{"reason": "recompose_after_failed_draft", "status": "queued"}]'::jsonb,
  'recovery: an open job''s swept draft still gets one recomposition');

-- ─── ownership ─────────────────────────────────────────────────────────────

-- 00843's client_plate_source_owned, verbatim, as the oracle for the four
-- emitted tables.
CREATE FUNCTION pg_temp.owned_00843(
  p_project_id uuid, p_table text, p_id uuid, p_source_url text)
RETURNS boolean LANGUAGE sql STABLE SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT CASE
    WHEN COALESCE(p_table, '') NOT IN ('project_rooms', 'room_scan_images', 'project_boards')
      OR target.path ~* '^https?://' THEN true
    WHEN p_project_id IS NULL
      OR target.path ~* '(^|/)(\.|%2e){0,2}(/|$)' THEN false
    WHEN p_table = 'project_rooms' THEN
      target.path ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/.+$'
      AND lower(target.folder[1]) = p_project_id::text
    WHEN p_table = 'room_scan_images' THEN EXISTS (
      SELECT 1
      FROM public.room_scan_images AS still
      JOIN public.room_scans AS scan ON scan.id = still.scan_id
      WHERE still.id = p_id
        AND scan.project_id = p_project_id
        AND scan.user_id::text = target.folder[2]
        AND (scan.id::text = target.folder[3] OR scan.room_id::text = target.folder[3])
    )
    ELSE EXISTS (
      SELECT 1
      FROM public.proposals AS proposal
      WHERE proposal.id::text = target.folder[1]
        AND proposal.project_id = p_project_id
    )
  END
  FROM (
    SELECT address.path, storage.foldername(address.path) AS folder
    FROM (SELECT ltrim(btrim(COALESCE(p_source_url, '')), '/') AS path) AS address
  ) AS target;
$$;

INSERT INTO public.project_rooms (id, project_id, name, sort_order)
VALUES ('84800000-0000-4000-8000-000000000061', '84800000-0000-4000-8000-000000000006', 'Kitchen', 0);
INSERT INTO public.room_scans (id, user_id, name, project_id, project_room_id)
VALUES ('84800000-0000-4000-8000-000000000361', '84800000-0000-4000-8000-0000000000a1', 'Kitchen scan',
        '84800000-0000-4000-8000-000000000006', '84800000-0000-4000-8000-000000000061');
INSERT INTO public.room_scan_images (id, scan_id, role, image_url, captured_at)
VALUES ('84800000-0000-4000-8000-000000000362', '84800000-0000-4000-8000-000000000361', 'still',
        'http://127.0.0.1:54321/storage/v1/object/public/room-scans/photos/84800000-0000-4000-8000-0000000000a1/84800000-0000-4000-8000-000000000361/still-1.jpg', now());
INSERT INTO public.proposals (id, project_id, designer_id, title, status, document_kind, commercial_state, total_amount, subtotal)
VALUES ('84800000-0000-4000-8000-000000000461', '84800000-0000-4000-8000-000000000006', '84800000-0000-4000-8000-0000000000a1',
        'US49 848 Authorization', 'accepted', 'furnishings_authorization', 'executed', 30000, 30000);

CREATE TEMP TABLE owned_matrix ON COMMIT DROP AS
SELECT m.p_table, m.p_project::uuid AS p_project, m.p_id::uuid AS p_id, m.p_url,
       public.client_plate_source_owned(m.p_project::uuid, m.p_table, m.p_id::uuid, m.p_url) AS now_owned,
       pg_temp.owned_00843(m.p_project::uuid, m.p_table, m.p_id::uuid, m.p_url) AS old_owned
FROM (VALUES
  ('project_ffe_item_images', '84800000-0000-4000-8000-000000000006', '84800000-0000-4000-8000-000000000071', 'https://cdn.test/chair.jpg'),
  ('project_ffe_item_images', '84800000-0000-4000-8000-000000000006', '84800000-0000-4000-8000-000000000071', 'item-images/84800000-0000-4000-8000-000000000006/chair.jpg'),
  ('project_ffe_item_images', NULL, '84800000-0000-4000-8000-000000000071', 'item-images/chair.jpg'),
  ('project_rooms', '84800000-0000-4000-8000-000000000006', '84800000-0000-4000-8000-000000000061', '84800000-0000-4000-8000-000000000006/84800000-0000-4000-8000-000000000099/render.png'),
  ('project_rooms', '84800000-0000-4000-8000-000000000007', '84800000-0000-4000-8000-000000000061', '84800000-0000-4000-8000-000000000006/84800000-0000-4000-8000-000000000099/render.png'),
  ('project_rooms', NULL, '84800000-0000-4000-8000-000000000061', '84800000-0000-4000-8000-000000000006/84800000-0000-4000-8000-000000000099/render.png'),
  ('project_rooms', '84800000-0000-4000-8000-000000000006', '84800000-0000-4000-8000-000000000061', '84800000-0000-4000-8000-000000000006/../84800000-0000-4000-8000-000000000099/render.png'),
  ('project_rooms', '84800000-0000-4000-8000-000000000006', '84800000-0000-4000-8000-000000000061', 'https://cdn.test/render.png'),
  ('room_scan_images', '84800000-0000-4000-8000-000000000006', '84800000-0000-4000-8000-000000000362', 'photos/84800000-0000-4000-8000-0000000000a1/84800000-0000-4000-8000-000000000361/still-1.jpg'),
  ('room_scan_images', '84800000-0000-4000-8000-000000000006', '84800000-0000-4000-8000-000000000362', 'photos/84800000-0000-4000-8000-0000000000a2/84800000-0000-4000-8000-000000000361/still-1.jpg'),
  ('room_scan_images', '84800000-0000-4000-8000-000000000007', '84800000-0000-4000-8000-000000000362', 'photos/84800000-0000-4000-8000-0000000000a1/84800000-0000-4000-8000-000000000361/still-1.jpg'),
  ('room_scan_images', '84800000-0000-4000-8000-000000000006', '84800000-0000-4000-8000-000000000362', 'https://cdn.test/still-1.jpg'),
  ('project_boards', '84800000-0000-4000-8000-000000000006', '84800000-0000-4000-8000-000000000401', '84800000-0000-4000-8000-000000000461/boards/b401/cover.jpg'),
  ('project_boards', '84800000-0000-4000-8000-000000000007', '84800000-0000-4000-8000-000000000401', '84800000-0000-4000-8000-000000000461/boards/b401/cover.jpg'),
  ('project_boards', '84800000-0000-4000-8000-000000000006', '84800000-0000-4000-8000-000000000401', 'https://cdn.test/cover.jpg'),
  ('field_captures', '84800000-0000-4000-8000-000000000006', '84800000-0000-4000-8000-000000000081', '84800000-0000-4000-8000-0000000000a1/84800000-0000-4000-8000-000000000081/photo-1.jpg'),
  ('field_captures', '84800000-0000-4000-8000-000000000006', '84800000-0000-4000-8000-000000000081', 'https://cdn.test/photo-1.jpg'),
  ('some_future_table', '84800000-0000-4000-8000-000000000006', '84800000-0000-4000-8000-000000000082', 'anything/at/all.jpg'),
  (NULL, '84800000-0000-4000-8000-000000000006', NULL, 'anything/at/all.jpg')
) AS m(p_table, p_project, p_id, p_url);

SELECT is(
  (SELECT count(*)::int FROM owned_matrix
   WHERE p_table IN ('project_ffe_item_images', 'project_rooms', 'room_scan_images', 'project_boards')
     AND now_owned IS DISTINCT FROM old_owned),
  0,
  'ownership: every emitted table keeps its 00843 answer on every row of the matrix');
SELECT is(
  (SELECT jsonb_object_agg(p_table, n) FROM (
     SELECT p_table, count(*) FILTER (WHERE now_owned) AS n FROM owned_matrix
     WHERE p_table IN ('project_ffe_item_images', 'project_rooms', 'room_scan_images', 'project_boards')
     GROUP BY p_table) AS counts),
  '{"project_ffe_item_images": 3, "project_rooms": 2, "room_scan_images": 2, "project_boards": 2}'::jsonb,
  'ownership: the matrix holds owned rows for every emitted table, not only refusals');
SELECT is(
  (SELECT jsonb_agg(now_owned ORDER BY p_table NULLS LAST, p_url) FROM owned_matrix
   WHERE p_table IS NULL OR p_table NOT IN ('project_ffe_item_images', 'project_rooms', 'room_scan_images', 'project_boards')),
  '[false, false, false, false]'::jsonb,
  'ownership: field_captures (path or URL), an unknown table and no table are FALSE');
SELECT ok(
  (SELECT bool_and(old_owned) FROM owned_matrix
   WHERE p_table IS NULL OR p_table NOT IN ('project_ffe_item_images', 'project_rooms', 'room_scan_images', 'project_boards')),
  'ownership: the same four rows were TRUE under 00843 (the footgun this closes)');

SELECT * FROM finish(true);
ROLLBACK;
