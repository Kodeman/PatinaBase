-- ═══════════════════════════════════════════════════════════════════════════
-- 00844 — client_editions, client_edition_images, client_edition_requests
--         and the change triggers (US-49 W3)
--
-- Named cases:
--   lockdown    RLS on all three tables; no API role but service_role reads
--               them
--   one approved  a second approved edition of a project is refused; seq is
--               unique per project
--   supersession edges  superseded_by is refused for the edition itself, an
--               earlier edition and another project's edition; a later
--               edition of the same project is accepted; a target never
--               moves to another project or behind its predecessor, so
--               the 904 → 905 → 904 cycle cannot be built (SQ-1644 R1)
--   enqueue    each listed change queues one request for its reason, 30
--               minutes out, keyed <project>:<reason>: item image insert,
--               primary picture change, item delivered, project phase,
--               project closed, concept render set, palette change,
--               authorization signed (insert and update)
--   debounce    a repeat change of a queued reason moves its row on (now +
--               30 minutes) and adds none; a change after the row is done
--               queues a new one
--   quiet       an unrelated edit (project name, item status to ordered)
--               queues nothing
--   backfill    every project that had a plate when 00844 ran has one
--               'backfill' request, available at once
--
-- Run (from supabase/): psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" \
--        -v ON_ERROR_STOP=1 -f tests/00844_client_editions.test.sql
-- Everything is rolled back.
-- ═══════════════════════════════════════════════════════════════════════════
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT plan(33);

-- ─── lockdown ──────────────────────────────────────────────────────────────

SELECT ok((SELECT bool_and(relrowsecurity) FROM pg_class
           WHERE oid IN ('public.client_editions'::regclass, 'public.client_edition_images'::regclass,
                         'public.client_edition_requests'::regclass)),
          'lockdown: RLS is enabled on all three tables');
SELECT ok(NOT has_table_privilege('authenticated', 'public.client_editions', 'SELECT')
          AND NOT has_table_privilege('authenticated', 'public.client_edition_images', 'SELECT')
          AND NOT has_table_privilege('authenticated', 'public.client_edition_requests', 'SELECT'),
          'lockdown: authenticated has no table privilege');
SELECT ok(NOT has_table_privilege('anon', 'public.client_editions', 'SELECT')
          AND NOT has_table_privilege('anon', 'public.client_edition_requests', 'SELECT'),
          'lockdown: anon has no table privilege');
SELECT ok(has_table_privilege('service_role', 'public.client_editions', 'SELECT,INSERT,UPDATE')
          AND has_table_privilege('service_role', 'public.client_edition_requests', 'SELECT,UPDATE'),
          'lockdown: service_role reads and writes');
SELECT has_trigger('public', 'client_editions', 'set_updated_at',
                   'lockdown: client_editions keeps updated_at');

-- ─── fixtures (as postgres) ────────────────────────────────────────────────

INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, instance_id, aud, role)
VALUES ('84400000-0000-4000-8000-0000000000a1', 'us49-844-owner@test.invalid', '', now(), now(), now(),
        '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');
INSERT INTO public.profiles (id, email, full_name, is_designer, created_at, updated_at)
VALUES ('84400000-0000-4000-8000-0000000000a1', 'us49-844-owner@test.invalid', 'US49 844 Owner', true, now(), now())
ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email, full_name = EXCLUDED.full_name;

INSERT INTO public.projects (id, name, designer_id, created_by, status, current_phase)
VALUES ('84400000-0000-4000-8000-000000000001', 'US49 844 House',
        '84400000-0000-4000-8000-0000000000a1', '84400000-0000-4000-8000-0000000000a1', 'active', 'design');
INSERT INTO public.project_rooms (id, project_id, name, sort_order)
VALUES ('84400000-0000-4000-8000-000000000011', '84400000-0000-4000-8000-000000000001', 'Kitchen', 0);

SELECT set_config('app.ffe_mutation_rpc', 'on', true);
INSERT INTO public.project_ffe_items (
  id, project_id, project_room_id, name, status, item_type, ffe_category,
  quantity, unit_price_cents, line_total_cents, design_disposition, assignment_scope, sort_order
) VALUES ('84400000-0000-4000-8000-000000000101', '84400000-0000-4000-8000-000000000001',
          '84400000-0000-4000-8000-000000000011', 'Counter stool', 'specified', 'fixed', 'seating',
          2, 40000, 80000, 'selected', 'room', 0);

-- ─── backfill: 00844 run again over a project with a plate ─────────────────
-- Seeds load after migrations, so the reset-time backfill had nothing to
-- see; the migration is idempotent, so it runs again here (twice).

INSERT INTO public.client_plate_assets (id, project_id, sha256, source_kind, source_ref, original_key, width, height)
VALUES ('84400000-0000-4000-8000-000000000501', '84400000-0000-4000-8000-000000000001', repeat('4', 64), 'upload',
        '{"table": "project_ffe_item_images", "id": "84400000-0000-4000-8000-000000000299"}'::jsonb,
        'plates/84400000/original.jpg', 1600, 1200);
DELETE FROM public.client_edition_requests WHERE project_id = '84400000-0000-4000-8000-000000000001';
SET CONSTRAINTS ALL IMMEDIATE;
\ir ../migrations/00844_client_editions.sql
\ir ../migrations/00844_client_editions.sql

SELECT is(
  (SELECT row(count(*), min(available_at), min(debounce_key), min(status))::text
   FROM public.client_edition_requests
   WHERE project_id = '84400000-0000-4000-8000-000000000001' AND reason = 'backfill'),
  row(1::bigint, now(), '84400000-0000-4000-8000-000000000001:backfill', 'queued')::text,
  'backfill: one request per project with a plate, available at once, run twice');
SELECT is(
  (SELECT count(*) FROM (SELECT DISTINCT asset.project_id FROM public.client_plate_assets AS asset) AS planted
   WHERE NOT EXISTS (
     SELECT 1 FROM public.client_edition_requests AS request
     WHERE request.project_id = planted.project_id AND request.reason = 'backfill')),
  0::bigint,
  'backfill: every project with a plate has its backfill request');

-- Start from an empty inbox for this project (the line itself may queue).
DELETE FROM public.client_edition_requests WHERE project_id = '84400000-0000-4000-8000-000000000001';

-- ─── one approved ──────────────────────────────────────────────────────────

INSERT INTO public.client_editions (id, project_id, seq, status, approved_at)
VALUES ('84400000-0000-4000-8000-000000000901', '84400000-0000-4000-8000-000000000001', 1, 'approved', now());
SELECT throws_ok(
  $$INSERT INTO public.client_editions (project_id, seq, status, approved_at)
    VALUES ('84400000-0000-4000-8000-000000000001', 2, 'approved', now())$$,
  '23505', NULL, 'one approved: a second approved edition is refused');
SELECT throws_ok(
  $$INSERT INTO public.client_editions (project_id, seq, status)
    VALUES ('84400000-0000-4000-8000-000000000001', 1, 'awaiting_review')$$,
  '23505', NULL, 'one approved: seq is unique per project');

-- ─── supersession edges ────────────────────────────────────────────────────

INSERT INTO public.projects (id, name, designer_id, created_by, status, current_phase)
VALUES ('84400000-0000-4000-8000-000000000002', 'US49 844 Other House',
        '84400000-0000-4000-8000-0000000000a1', '84400000-0000-4000-8000-0000000000a1', 'active', 'design');
INSERT INTO public.client_editions (id, project_id, seq, status)
VALUES ('84400000-0000-4000-8000-000000000902', '84400000-0000-4000-8000-000000000001', 2, 'awaiting_review'),
       ('84400000-0000-4000-8000-000000000903', '84400000-0000-4000-8000-000000000002', 3, 'awaiting_review');
SELECT throws_ok(
  $$UPDATE public.client_editions SET superseded_by = id
    WHERE id = '84400000-0000-4000-8000-000000000902'$$,
  '23514', NULL, 'supersession edges: an edition never supersedes itself');
SELECT throws_ok(
  $$UPDATE public.client_editions SET superseded_by = '84400000-0000-4000-8000-000000000901'
    WHERE id = '84400000-0000-4000-8000-000000000902'$$,
  '23514', NULL, 'supersession edges: never by an earlier edition');
SELECT throws_ok(
  $$UPDATE public.client_editions SET superseded_by = '84400000-0000-4000-8000-000000000903'
    WHERE id = '84400000-0000-4000-8000-000000000901'$$,
  '23514', NULL, 'supersession edges: never by another project''s edition');
SELECT lives_ok(
  $$UPDATE public.client_editions SET superseded_by = '84400000-0000-4000-8000-000000000902'
    WHERE id = '84400000-0000-4000-8000-000000000901'$$,
  'supersession edges: a later edition of the same project supersedes');
-- An edge into a row stays true after later writes: its target keeps its
-- project and seq (SQ-1644 R1).
SELECT throws_ok(
  $$UPDATE public.client_editions SET project_id = '84400000-0000-4000-8000-000000000002'
    WHERE id = '84400000-0000-4000-8000-000000000902'$$,
  '23514', NULL, 'supersession edges: a superseded-by target never moves to another project');
INSERT INTO public.client_editions (id, project_id, seq, status)
VALUES ('84400000-0000-4000-8000-000000000904', '84400000-0000-4000-8000-000000000001', 4, 'superseded'),
       ('84400000-0000-4000-8000-000000000905', '84400000-0000-4000-8000-000000000001', 5, 'awaiting_review');
UPDATE public.client_editions SET superseded_by = '84400000-0000-4000-8000-000000000905'
WHERE id = '84400000-0000-4000-8000-000000000904';
SELECT throws_ok(
  $$UPDATE public.client_editions SET seq = 3 WHERE id = '84400000-0000-4000-8000-000000000905'$$,
  '23514', NULL, 'supersession edges: a target''s seq never moves behind the edition it superseded');
SELECT throws_ok(
  $sql$DO $cycle$ BEGIN
    UPDATE public.client_editions SET seq = 3 WHERE id = '84400000-0000-4000-8000-000000000905';
    UPDATE public.client_editions SET superseded_by = '84400000-0000-4000-8000-000000000904'
    WHERE id = '84400000-0000-4000-8000-000000000905';
  END $cycle$
  $sql$,
  '23514', NULL, 'supersession edges: the 904 → 905 → 904 cycle cannot be built');
UPDATE public.client_editions SET superseded_by = NULL WHERE id = '84400000-0000-4000-8000-000000000901';
DELETE FROM public.client_editions
WHERE id IN ('84400000-0000-4000-8000-000000000902', '84400000-0000-4000-8000-000000000903',
             '84400000-0000-4000-8000-000000000904', '84400000-0000-4000-8000-000000000905');

-- ─── enqueue ───────────────────────────────────────────────────────────────

INSERT INTO public.project_ffe_item_images (id, item_id, project_id, url, source, position, is_primary)
VALUES ('84400000-0000-4000-8000-000000000201', '84400000-0000-4000-8000-000000000101',
        '84400000-0000-4000-8000-000000000001', 'https://img.test/us49-844-stool-a.jpg', 'library', 0, true);

SELECT is(
  (SELECT row(count(*), min(available_at), min(debounce_key), min(status))::text
   FROM public.client_edition_requests
   WHERE project_id = '84400000-0000-4000-8000-000000000001' AND reason = 'item_image'),
  row(1::bigint, now() + interval '30 minutes',
      '84400000-0000-4000-8000-000000000001:item_image', 'queued')::text,
  'enqueue: an item picture queues item_image 30 minutes out');

-- debounce: the queued row is moved on, not duplicated.
UPDATE public.client_edition_requests SET available_at = now() - interval '1 hour'
 WHERE project_id = '84400000-0000-4000-8000-000000000001' AND reason = 'item_image';
INSERT INTO public.project_ffe_item_images (id, item_id, project_id, url, source, position, is_primary)
VALUES ('84400000-0000-4000-8000-000000000202', '84400000-0000-4000-8000-000000000101',
        '84400000-0000-4000-8000-000000000001', 'https://img.test/us49-844-stool-b.jpg', 'library', 1, false);
SELECT is(
  (SELECT row(count(*), min(available_at))::text
   FROM public.client_edition_requests
   WHERE project_id = '84400000-0000-4000-8000-000000000001' AND reason = 'item_image'),
  row(1::bigint, now() + interval '30 minutes')::text,
  'debounce: a repeat change moves the queued row to now + 30 minutes, adds none');

-- primary change, after the queued row was answered.
UPDATE public.client_edition_requests SET status = 'done'
 WHERE project_id = '84400000-0000-4000-8000-000000000001' AND reason = 'item_image';
UPDATE public.project_ffe_item_images SET is_primary = false WHERE id = '84400000-0000-4000-8000-000000000201';
UPDATE public.project_ffe_item_images SET is_primary = true WHERE id = '84400000-0000-4000-8000-000000000202';
SELECT is(
  (SELECT row(count(*) FILTER (WHERE status = 'queued'), count(*))::text
   FROM public.client_edition_requests
   WHERE project_id = '84400000-0000-4000-8000-000000000001' AND reason = 'item_image'),
  row(1::bigint, 2::bigint)::text,
  'enqueue: a primary picture change after the row is done queues a new one');

-- quiet: an item moving to ordered, a project rename.
UPDATE public.project_ffe_items SET status = 'ordered' WHERE id = '84400000-0000-4000-8000-000000000101';
UPDATE public.projects SET name = 'US49 844 House, renamed' WHERE id = '84400000-0000-4000-8000-000000000001';
SELECT is(
  (SELECT count(*) FROM public.client_edition_requests
   WHERE project_id = '84400000-0000-4000-8000-000000000001' AND reason NOT IN ('item_image')),
  0::bigint,
  'quiet: ordered and a rename queue nothing');

UPDATE public.project_ffe_items SET status = 'delivered' WHERE id = '84400000-0000-4000-8000-000000000101';
SELECT is(
  (SELECT count(*) FROM public.client_edition_requests
   WHERE project_id = '84400000-0000-4000-8000-000000000001' AND reason = 'item_status'
     AND status = 'queued' AND available_at = now() + interval '30 minutes'),
  1::bigint,
  'enqueue: an item delivered queues item_status');
UPDATE public.project_ffe_items SET status = 'installed' WHERE id = '84400000-0000-4000-8000-000000000101';
SELECT is(
  (SELECT count(*) FROM public.client_edition_requests
   WHERE project_id = '84400000-0000-4000-8000-000000000001' AND reason = 'item_status'),
  1::bigint,
  'debounce: delivered then installed keeps one item_status row');
SELECT set_config('app.ffe_mutation_rpc', '', true);

UPDATE public.projects SET current_phase = 'install' WHERE id = '84400000-0000-4000-8000-000000000001';
SELECT is(
  (SELECT count(*) FROM public.client_edition_requests
   WHERE project_id = '84400000-0000-4000-8000-000000000001' AND reason = 'phase' AND status = 'queued'),
  1::bigint,
  'enqueue: a phase change queues phase');

UPDATE public.project_rooms SET concept_render_url = 'https://img.test/us49-844-kitchen.jpg'
 WHERE id = '84400000-0000-4000-8000-000000000011';
SELECT is(
  (SELECT count(*) FROM public.client_edition_requests
   WHERE project_id = '84400000-0000-4000-8000-000000000001' AND reason = 'concept_render' AND status = 'queued'),
  1::bigint,
  'enqueue: a concept render set queues concept_render');

INSERT INTO public.project_palettes (id, project_id, name, is_primary, swatches)
VALUES ('84400000-0000-4000-8000-000000000301', '84400000-0000-4000-8000-000000000001', 'Kitchen', true,
        '[{"hex": "#d9d2c5", "name": "Plaster"}]'::jsonb);
SELECT is(
  (SELECT count(*) FROM public.client_edition_requests
   WHERE project_id = '84400000-0000-4000-8000-000000000001' AND reason = 'palette' AND status = 'queued'),
  1::bigint,
  'enqueue: a palette added queues palette');
UPDATE public.client_edition_requests SET status = 'done'
 WHERE project_id = '84400000-0000-4000-8000-000000000001' AND reason = 'palette';
UPDATE public.project_palettes SET swatches = '[{"hex": "#2f3b2f", "name": "Forest"}]'::jsonb
 WHERE id = '84400000-0000-4000-8000-000000000301';
SELECT is(
  (SELECT count(*) FROM public.client_edition_requests
   WHERE project_id = '84400000-0000-4000-8000-000000000001' AND reason = 'palette' AND status = 'queued'),
  1::bigint,
  'enqueue: palette swatches changed queues palette');

-- authorization signed: inserted already executed, and executed later.
INSERT INTO public.proposals (id, project_id, designer_id, title, status, document_kind, commercial_state, total_amount, subtotal)
VALUES ('84400000-0000-4000-8000-000000000401', '84400000-0000-4000-8000-000000000001', '84400000-0000-4000-8000-0000000000a1',
        'US49 844 Authorization', 'accepted', 'furnishings_authorization', 'executed', 80000, 80000);
INSERT INTO public.project_commercial_documents (id, project_id, proposal_id, document_kind, wave_name, is_origin, bound_at, executed_at, created_by)
VALUES ('84400000-0000-4000-8000-000000000402', '84400000-0000-4000-8000-000000000001', '84400000-0000-4000-8000-000000000401',
        'furnishings_authorization', 'Authorization No. 1', false, now(), NULL, '84400000-0000-4000-8000-0000000000a1');
SELECT is(
  (SELECT count(*) FROM public.client_edition_requests
   WHERE project_id = '84400000-0000-4000-8000-000000000001' AND reason = 'authorization_signed'),
  0::bigint,
  'quiet: an unsigned authorization queues nothing');
UPDATE public.project_commercial_documents SET executed_at = now() WHERE id = '84400000-0000-4000-8000-000000000402';
SELECT is(
  (SELECT count(*) FROM public.client_edition_requests
   WHERE project_id = '84400000-0000-4000-8000-000000000001' AND reason = 'authorization_signed' AND status = 'queued'),
  1::bigint,
  'enqueue: an authorization executed queues authorization_signed');
UPDATE public.client_edition_requests SET status = 'done'
 WHERE project_id = '84400000-0000-4000-8000-000000000001' AND reason = 'authorization_signed';
INSERT INTO public.proposals (id, project_id, designer_id, title, status, document_kind, commercial_state, total_amount, subtotal)
VALUES ('84400000-0000-4000-8000-000000000411', '84400000-0000-4000-8000-000000000001', '84400000-0000-4000-8000-0000000000a1',
        'US49 844 Authorization 2', 'accepted', 'furnishings_authorization', 'executed', 1000, 1000);
INSERT INTO public.project_commercial_documents (id, project_id, proposal_id, document_kind, wave_name, is_origin, bound_at, executed_at, created_by)
VALUES ('84400000-0000-4000-8000-000000000412', '84400000-0000-4000-8000-000000000001', '84400000-0000-4000-8000-000000000411',
        'furnishings_authorization', 'Authorization No. 2', false, now(), now(), '84400000-0000-4000-8000-0000000000a1');
SELECT is(
  (SELECT count(*) FROM public.client_edition_requests
   WHERE project_id = '84400000-0000-4000-8000-000000000001' AND reason = 'authorization_signed' AND status = 'queued'),
  1::bigint,
  'enqueue: an authorization inserted executed queues authorization_signed');

SELECT set_config('app.project_completion_id', '84400000-0000-4000-8000-000000000001', true);
UPDATE public.projects SET status = 'completed' WHERE id = '84400000-0000-4000-8000-000000000001';
SELECT is(
  (SELECT count(*) FROM public.client_edition_requests
   WHERE project_id = '84400000-0000-4000-8000-000000000001' AND reason = 'closed' AND status = 'queued'),
  1::bigint,
  'enqueue: a project closed queues closed');

SELECT is(
  (SELECT count(*) FROM public.client_edition_requests
   WHERE project_id = '84400000-0000-4000-8000-000000000001'
     AND debounce_key IS DISTINCT FROM project_id::text || ':' || reason),
  0::bigint,
  'enqueue: every key is <project>:<reason>');
SELECT is(
  (SELECT count(*) FROM public.client_edition_requests
   WHERE project_id = '84400000-0000-4000-8000-000000000001' AND status = 'queued'
     AND available_at <> now() + interval '30 minutes'),
  0::bigint,
  'enqueue: every queued change waits 30 minutes');
SELECT is(
  (SELECT count(*) FROM (
     SELECT debounce_key FROM public.client_edition_requests
     WHERE project_id = '84400000-0000-4000-8000-000000000001' AND status = 'queued'
     GROUP BY debounce_key HAVING count(*) > 1) AS dup),
  0::bigint,
  'debounce: never two queued rows for one key');

SELECT * FROM finish();
ROLLBACK;
