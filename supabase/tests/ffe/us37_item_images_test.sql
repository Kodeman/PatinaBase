-- ═══════════════════════════════════════════════════════════════════════════
-- 00807 — a project item's own pictures (pgTAP; US-37 #1 + #2, SQ-1099)
--
-- Named cases:
--   snapshot    a line added from a piece with three pictures (and one blank
--               entry) gets three rows in array order, positions 0..2, the
--               first primary, source library; a placeholder filled in place
--               (UPDATE of product_id) is snapshotted too; an update that
--               leaves product_id alone never re-seeds an emptied line
--   backfill    an item from before 00807 gets its pictures; a second run
--               writes nothing and never duplicates rows
--   one primary a second primary on one item is refused (23505); project_id
--               is always the item's own
--   refusals    an outsider gets 42501 with the plain sentence on each of the
--               four acts, the client on add; neither reads a row directly
--   acts        add appends; set primary; reorder; unlink of the primary
--               promotes the first remaining picture and leaves the stored
--               file; add on an item with no pictures makes it primary
--   readers     get_client_project_selections and get_client_project_threshold
--               return the primary and the ordered list to the client; the
--               designer's computed field returns the primary
-- SQ-1128 (Astra SQ-1127 repair):
--   reader gate F1  a stranger on a job with no client gets 42501 from both
--               readers (00755's gate let NOT(NULL OR false) through)
--   reader gate F2  a caller who shares only studio A with a lead whose job is
--               in studio B gets 42501 from both; the job's own studio
--               teammate, the job's client and the lead of a studio-less
--               legacy job still read
--   lock order F3   the picture gate locks the job before the item
--   spec book F4    an upload-only line's snapshot (what an issue freezes)
--               carries its upload; after the primary changes it leads with
--               the new primary, not the live piece's first image
--   rpc-only F5     a team member's direct INSERT, UPDATE and DELETE get
--               42501; her SELECT still reads
-- SQ-1143 (Astra SQ-1141 repair):
--   no parent keys  project_id and source_product_id have no foreign key
--               (R1/R2 lock cycles); the item cascade is kept; an insert takes
--               the item's job even over a job that does not exist; add still
--               refuses an unknown library piece (23503)
--   move        an item moved to another job takes every picture with it,
--               an upload stored under the old job included, and the new
--               job's studio reads them
--
-- Run: cd supabase && supabase test db tests/ffe/us37_item_images_test.sql
--  or: psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -X -q \
--        -v ON_ERROR_STOP=1 -f supabase/tests/ffe/us37_item_images_test.sql
-- Everything is rolled back.
-- ═══════════════════════════════════════════════════════════════════════════
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT plan(62);

-- ─── fixtures (as postgres) ────────────────────────────────────────────────
-- O owner of studio A (job P) · C the client · X owner of studio B (job Q,
-- no client) · L a lead seated in A and B (job R in B, client C) · Z a
-- stranger with no seat · D a lead with no seat (job S, no studio, no client)

INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, instance_id, aud, role)
VALUES
  ('80700000-0000-4000-8000-0000000000a1', 'us37-owner@test.invalid',    '', now(), now(), now(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('80700000-0000-4000-8000-0000000000a2', 'us37-client@test.invalid',   '', now(), now(), now(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('80700000-0000-4000-8000-0000000000a5', 'us37-outsider@test.invalid', '', now(), now(), now(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('80700000-0000-4000-8000-0000000000a6', 'us37-two-studios@test.invalid', '', now(), now(), now(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('80700000-0000-4000-8000-0000000000a7', 'us37-stranger@test.invalid', '', now(), now(), now(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('80700000-0000-4000-8000-0000000000a8', 'us37-solo-lead@test.invalid', '', now(), now(), now(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');

INSERT INTO public.profiles (id, email, full_name, is_designer, created_at, updated_at)
VALUES
  ('80700000-0000-4000-8000-0000000000a1', 'us37-owner@test.invalid',    'US37 Owner',    true,  now(), now()),
  ('80700000-0000-4000-8000-0000000000a2', 'us37-client@test.invalid',   'US37 Client',   false, now(), now()),
  ('80700000-0000-4000-8000-0000000000a5', 'us37-outsider@test.invalid', 'US37 Outsider', true,  now(), now()),
  ('80700000-0000-4000-8000-0000000000a6', 'us37-two-studios@test.invalid', 'US37 Two Studios', true, now(), now()),
  ('80700000-0000-4000-8000-0000000000a7', 'us37-stranger@test.invalid', 'US37 Stranger', false, now(), now()),
  ('80700000-0000-4000-8000-0000000000a8', 'us37-solo-lead@test.invalid', 'US37 Solo Lead', true, now(), now())
ON CONFLICT (id) DO UPDATE
SET email = EXCLUDED.email, full_name = EXCLUDED.full_name, is_designer = EXCLUDED.is_designer;

INSERT INTO public.organizations (id, type, name, slug)
VALUES
  ('80700000-0000-4000-8000-0000000000f1', 'design_studio', 'US37 Studio A', 'us37-studio-a-test'),
  ('80700000-0000-4000-8000-0000000000f2', 'design_studio', 'US37 Studio B', 'us37-studio-b-test');

INSERT INTO public.organization_members (id, user_id, organization_id, role, status, joined_at)
VALUES
  ('80700000-0000-4000-8000-0000000000e1', '80700000-0000-4000-8000-0000000000a1', '80700000-0000-4000-8000-0000000000f1', 'owner', 'active', now()),
  ('80700000-0000-4000-8000-0000000000e5', '80700000-0000-4000-8000-0000000000a5', '80700000-0000-4000-8000-0000000000f2', 'owner', 'active', now()),
  ('80700000-0000-4000-8000-0000000000e6', '80700000-0000-4000-8000-0000000000a6', '80700000-0000-4000-8000-0000000000f1', 'member', 'active', now()),
  ('80700000-0000-4000-8000-0000000000e7', '80700000-0000-4000-8000-0000000000a6', '80700000-0000-4000-8000-0000000000f2', 'member', 'active', now());

INSERT INTO public.projects (id, name, designer_id, client_id, created_by, studio_id, status)
VALUES
  ('80700000-0000-4000-8000-000000000001', 'US37 Whole Home',
   '80700000-0000-4000-8000-0000000000a1', '80700000-0000-4000-8000-0000000000a2',
   '80700000-0000-4000-8000-0000000000a1', '80700000-0000-4000-8000-0000000000f1', 'active'),
  ('80700000-0000-4000-8000-000000000002', 'US37 Other Job',
   '80700000-0000-4000-8000-0000000000a5', NULL,
   '80700000-0000-4000-8000-0000000000a5', '80700000-0000-4000-8000-0000000000f2', 'active'),
  ('80700000-0000-4000-8000-000000000003', 'US37 Studio B Job',
   '80700000-0000-4000-8000-0000000000a6', '80700000-0000-4000-8000-0000000000a2',
   '80700000-0000-4000-8000-0000000000a6', '80700000-0000-4000-8000-0000000000f2', 'active'),
  ('80700000-0000-4000-8000-000000000004', 'US37 Legacy Job',
   '80700000-0000-4000-8000-0000000000a8', NULL,
   '80700000-0000-4000-8000-0000000000a8', NULL, 'active');

-- Three pictures and a blank entry; two pictures.
INSERT INTO public.products (id, name, captured_at, layer, owner_user_id, status, images) VALUES
  ('80700000-0000-4000-8000-000000000021', 'US37 Lounge chair', now(), 'personal',
   '80700000-0000-4000-8000-0000000000a1', 'draft',
   ARRAY['https://img.test/a.jpg', '  ', 'https://img.test/b.jpg', 'https://img.test/c.jpg']),
  ('80700000-0000-4000-8000-000000000022', 'US37 Side table', now(), 'personal',
   '80700000-0000-4000-8000-0000000000a1', 'draft',
   ARRAY['https://img.test/d.jpg', 'https://img.test/e.jpg']);

-- I1 the chair · I2 the table · I3 a placeholder with no piece yet.
SELECT set_config('app.ffe_mutation_rpc', 'on', true);
INSERT INTO public.project_ffe_items (
  id, project_id, name, status, item_type, product_id, quantity,
  unit_price_cents, line_total_cents, design_disposition, assignment_scope, sort_order
) VALUES
  ('80700000-0000-4000-8000-000000000101', '80700000-0000-4000-8000-000000000001', 'Lounge chair',
   'specified', 'fixed', '80700000-0000-4000-8000-000000000021', 1, 120000, 120000, 'selected', 'unassigned', 0),
  ('80700000-0000-4000-8000-000000000102', '80700000-0000-4000-8000-000000000001', 'Side table',
   'specified', 'fixed', '80700000-0000-4000-8000-000000000022', 1, 40000, 40000, 'selected', 'unassigned', 1),
  ('80700000-0000-4000-8000-000000000103', '80700000-0000-4000-8000-000000000001', 'Hall table',
   'specified', 'tbd', NULL, 1, 0, 0, 'selected', 'unassigned', 2);

-- Authorization No. 1 (executed) names the chair, so the threshold reader shows it.
INSERT INTO public.proposals (id, project_id, designer_id, title, status, document_kind, commercial_state, total_amount, subtotal)
VALUES ('80700000-0000-4000-8000-000000000401', '80700000-0000-4000-8000-000000000001', '80700000-0000-4000-8000-0000000000a1',
        'US37 Authorization No. 1', 'accepted', 'furnishings_authorization', 'executed', 120000, 120000);
INSERT INTO public.project_commercial_documents (id, project_id, proposal_id, document_kind, wave_name, is_origin, bound_at, executed_at, created_by)
VALUES ('80700000-0000-4000-8000-000000000402', '80700000-0000-4000-8000-000000000001', '80700000-0000-4000-8000-000000000401',
        'furnishings_authorization', 'Authorization No. 1', false, now(), now(), '80700000-0000-4000-8000-0000000000a1');
INSERT INTO public.furnishing_authorization_items (
  id, commercial_document_id, source_ffe_item_id, product_id, name, room_name, category, item_type,
  quantity, client_unit_price_cents, client_line_total_cents, trade_unit_cost_cents, markup_percent, sort_order
) VALUES ('80700000-0000-4000-8000-000000000403', '80700000-0000-4000-8000-000000000402', '80700000-0000-4000-8000-000000000101',
          '80700000-0000-4000-8000-000000000021', 'Lounge chair', 'Throughout', 'seating', 'fixed', 1, 120000, 120000, 70000, 71.43, 0);
UPDATE public.project_ffe_items
   SET source_commercial_document_id = '80700000-0000-4000-8000-000000000402',
       source_authorization_item_id = '80700000-0000-4000-8000-000000000403'
 WHERE id = '80700000-0000-4000-8000-000000000101';
SELECT set_config('app.ffe_mutation_rpc', '', true);

-- ─── grants ────────────────────────────────────────────────────────────────

SELECT ok(
  NOT has_function_privilege('anon', 'public.add_ffe_item_image(uuid, text, text, text, uuid)', 'EXECUTE'),
  'grants: anon cannot call add_ffe_item_image'
);
SELECT ok(
  has_function_privilege('authenticated', 'public.unlink_ffe_item_image(uuid)', 'EXECUTE'),
  'grants: authenticated can call unlink_ffe_item_image'
);

-- ─── lock order (SQ-1128 F3) ───────────────────────────────────────────────
-- Every picture act passes this gate; it must take the job's projects row
-- before the item row, as 00808's job label lock does.
SELECT ok(
  (SELECT strpos(prosrc, 'FROM public.projects WHERE id = v_project_id FOR KEY SHARE') > 0
      AND strpos(prosrc, 'FROM public.projects WHERE id = v_project_id FOR KEY SHARE')
          < strpos(prosrc, 'FOR NO KEY UPDATE')
   FROM pg_proc WHERE oid = 'public._ffe_item_images_require_team(uuid)'::regprocedure),
  'lock order: the picture gate locks the job (FOR KEY SHARE) before the item'
);

-- ─── reader gate (SQ-1128 F1: null-safe) ───────────────────────────────────
-- Q has no client. 00755's gate read NOT(NULL = Z OR false), which is NULL, and
-- let the stranger through.

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"80700000-0000-4000-8000-0000000000a7","role":"authenticated"}';
SELECT throws_ok(
  $$SELECT public.get_client_project_selections('80700000-0000-4000-8000-000000000002')$$,
  '42501', 'project not found or not accessible',
  'reader gate: a stranger on a job with no client is refused by get_client_project_selections'
);
SELECT throws_ok(
  $$SELECT public.get_client_project_threshold('80700000-0000-4000-8000-000000000002')$$,
  '42501', 'project not found or not accessible',
  'reader gate: a stranger on a job with no client is refused by get_client_project_threshold'
);

-- ─── reader gate (SQ-1128 F2: the job's own studio) ────────────────────────
-- R's lead L sits in studios A and B; R is B's. O sits only in A: she shares
-- a studio with the lead (00755's is_studio_comember) but not with the job.

SET LOCAL request.jwt.claims = '{"sub":"80700000-0000-4000-8000-0000000000a1","role":"authenticated"}';
SELECT throws_ok(
  $$SELECT public.get_client_project_selections('80700000-0000-4000-8000-000000000003')$$,
  '42501', 'project not found or not accessible',
  'reader gate: a teammate of the lead in another studio is refused by get_client_project_selections'
);
SELECT throws_ok(
  $$SELECT public.get_client_project_threshold('80700000-0000-4000-8000-000000000003')$$,
  '42501', 'project not found or not accessible',
  'reader gate: a teammate of the lead in another studio is refused by get_client_project_threshold'
);

SET LOCAL request.jwt.claims = '{"sub":"80700000-0000-4000-8000-0000000000a5","role":"authenticated"}';
SELECT lives_ok(
  $$SELECT public.get_client_project_selections('80700000-0000-4000-8000-000000000003')$$,
  'reader gate: the job''s own studio teammate reads get_client_project_selections'
);
SELECT lives_ok(
  $$SELECT public.get_client_project_threshold('80700000-0000-4000-8000-000000000003')$$,
  'reader gate: the job''s own studio teammate reads get_client_project_threshold'
);

SET LOCAL request.jwt.claims = '{"sub":"80700000-0000-4000-8000-0000000000a2","role":"authenticated"}';
SELECT lives_ok(
  $$SELECT public.get_client_project_selections('80700000-0000-4000-8000-000000000003')$$,
  'reader gate: the job''s client reads get_client_project_selections'
);
SELECT lives_ok(
  $$SELECT public.get_client_project_threshold('80700000-0000-4000-8000-000000000003')$$,
  'reader gate: the job''s client reads get_client_project_threshold'
);
RESET ROLE;

SELECT is(
  (SELECT studio_id FROM public.projects WHERE id = '80700000-0000-4000-8000-000000000004'),
  NULL::uuid,
  'reader gate: the legacy job has no studio'
);
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"80700000-0000-4000-8000-0000000000a8","role":"authenticated"}';
SELECT lives_ok(
  $$SELECT public.get_client_project_selections('80700000-0000-4000-8000-000000000004')$$,
  'reader gate: the lead of a studio-less legacy job reads get_client_project_selections'
);
SELECT lives_ok(
  $$SELECT public.get_client_project_threshold('80700000-0000-4000-8000-000000000004')$$,
  'reader gate: the lead of a studio-less legacy job reads get_client_project_threshold'
);
RESET ROLE;

-- ─── snapshot ──────────────────────────────────────────────────────────────

SELECT is(
  (SELECT array_agg(url ORDER BY position) FROM public.project_ffe_item_images
   WHERE item_id = '80700000-0000-4000-8000-000000000101'),
  ARRAY['https://img.test/a.jpg', 'https://img.test/b.jpg', 'https://img.test/c.jpg'],
  'snapshot: three rows in the piece''s array order, the blank entry skipped'
);
SELECT is(
  (SELECT array_agg(position ORDER BY position) FROM public.project_ffe_item_images
   WHERE item_id = '80700000-0000-4000-8000-000000000101'),
  ARRAY[0, 1, 2],
  'snapshot: positions start at 0'
);
SELECT is(
  (SELECT array_agg(is_primary ORDER BY position) FROM public.project_ffe_item_images
   WHERE item_id = '80700000-0000-4000-8000-000000000101'),
  ARRAY[true, false, false],
  'snapshot: the first picture is the primary'
);
SELECT is(
  (SELECT count(*)::integer FROM public.project_ffe_item_images
   WHERE item_id = '80700000-0000-4000-8000-000000000101'
     AND source = 'library'
     AND source_product_id = '80700000-0000-4000-8000-000000000021'
     AND project_id = '80700000-0000-4000-8000-000000000001'),
  3,
  'snapshot: source library, the piece, the job'
);

SELECT set_config('app.ffe_mutation_rpc', 'on', true);
UPDATE public.project_ffe_items SET product_id = '80700000-0000-4000-8000-000000000022'
 WHERE id = '80700000-0000-4000-8000-000000000103';
SELECT set_config('app.ffe_mutation_rpc', '', true);
SELECT is(
  (SELECT array_agg(url ORDER BY position) FROM public.project_ffe_item_images
   WHERE item_id = '80700000-0000-4000-8000-000000000103'),
  ARRAY['https://img.test/d.jpg', 'https://img.test/e.jpg'],
  'snapshot: a placeholder filled in place gets the piece''s pictures'
);

DELETE FROM public.project_ffe_item_images WHERE item_id = '80700000-0000-4000-8000-000000000103';
SELECT set_config('app.ffe_mutation_rpc', 'on', true);
UPDATE public.project_ffe_items SET product_id = product_id, name = 'Hall table, walnut'
 WHERE id = '80700000-0000-4000-8000-000000000103';
SELECT set_config('app.ffe_mutation_rpc', '', true);
SELECT is(
  (SELECT count(*)::integer FROM public.project_ffe_item_images
   WHERE item_id = '80700000-0000-4000-8000-000000000103'),
  0,
  'snapshot: an update that leaves product_id alone never re-seeds an emptied line'
);

-- ─── backfill ──────────────────────────────────────────────────────────────
-- I2 stands in for a line from before 00807: a piece, no picture rows.

DELETE FROM public.project_ffe_item_images WHERE item_id = '80700000-0000-4000-8000-000000000102';
SELECT ok(
  public._backfill_ffe_item_library_images() >= 4,
  'backfill: writes the missing rows (I2 and the emptied I3)'
);
SELECT is(
  (SELECT array_agg(url ORDER BY position) FROM public.project_ffe_item_images
   WHERE item_id = '80700000-0000-4000-8000-000000000102'),
  ARRAY['https://img.test/d.jpg', 'https://img.test/e.jpg'],
  'backfill: an older line gets its piece''s pictures in order'
);
SELECT is(
  public._backfill_ffe_item_library_images(),
  0,
  'backfill: a second run writes nothing'
);
SELECT is(
  (SELECT count(*)::integer FROM public.project_ffe_item_images
   WHERE item_id = '80700000-0000-4000-8000-000000000101'),
  3,
  'backfill: never duplicates the rows a line already has'
);

-- ─── one primary; the job is the item's own ────────────────────────────────

SELECT throws_ok(
  $$INSERT INTO public.project_ffe_item_images (item_id, project_id, url, source, position, is_primary)
    VALUES ('80700000-0000-4000-8000-000000000101', '80700000-0000-4000-8000-000000000001',
            'https://img.test/second-primary.jpg', 'upload', 9, true)$$,
  '23505',
  NULL,
  'one primary: a second primary on one item is refused'
);

INSERT INTO public.project_ffe_item_images (item_id, project_id, url, source, position)
VALUES ('80700000-0000-4000-8000-000000000101', '80700000-0000-4000-8000-000000000002',
        'https://img.test/claims-other-job.jpg', 'upload', 9);
SELECT is(
  (SELECT project_id FROM public.project_ffe_item_images WHERE url = 'https://img.test/claims-other-job.jpg'),
  '80700000-0000-4000-8000-000000000001'::uuid,
  'one primary: project_id is always the item''s job, whatever the row claims'
);
DELETE FROM public.project_ffe_item_images WHERE url = 'https://img.test/claims-other-job.jpg';

-- ─── refusals ──────────────────────────────────────────────────────────────

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"80700000-0000-4000-8000-0000000000a5","role":"authenticated"}';
SELECT throws_ok(
  $$SELECT public.add_ffe_item_image('80700000-0000-4000-8000-000000000101', 'https://img.test/x.jpg', NULL, 'upload', NULL)$$,
  '42501', 'Only the studio on this job can change this piece''s pictures.',
  'refusals: an outsider cannot add a picture'
);
RESET ROLE;
-- The outsider names real picture ids (read as postgres, before the role switch).
SELECT set_config('us37.image_b', (SELECT id::text FROM public.project_ffe_item_images WHERE url = 'https://img.test/b.jpg'), true);
SET LOCAL ROLE authenticated;
SELECT throws_ok(
  format('SELECT public.set_ffe_item_primary_image(%L)', current_setting('us37.image_b')),
  '42501', 'Only the studio on this job can change this piece''s pictures.',
  'refusals: an outsider cannot set the primary'
);
SELECT throws_ok(
  format('SELECT * FROM public.reorder_ffe_item_images(%L, ARRAY[%L]::uuid[])',
         '80700000-0000-4000-8000-000000000101', current_setting('us37.image_b')),
  '42501', 'Only the studio on this job can change this piece''s pictures.',
  'refusals: an outsider cannot reorder'
);
SELECT throws_ok(
  format('SELECT public.unlink_ffe_item_image(%L)', current_setting('us37.image_b')),
  '42501', 'Only the studio on this job can change this piece''s pictures.',
  'refusals: an outsider cannot unlink'
);
SELECT is(
  (SELECT count(*)::integer FROM public.project_ffe_item_images
   WHERE item_id = '80700000-0000-4000-8000-000000000101'),
  0,
  'refusals: the outsider reads no picture rows'
);

SET LOCAL request.jwt.claims = '{"sub":"80700000-0000-4000-8000-0000000000a2","role":"authenticated"}';
SELECT throws_ok(
  $$SELECT public.add_ffe_item_image('80700000-0000-4000-8000-000000000101', 'https://img.test/x.jpg', NULL, 'upload', NULL)$$,
  '42501', 'Only the studio on this job can change this piece''s pictures.',
  'refusals: the client cannot add a picture'
);
SELECT is(
  (SELECT count(*)::integer FROM public.project_ffe_item_images
   WHERE item_id = '80700000-0000-4000-8000-000000000101'),
  0,
  'refusals: the client reads no picture rows directly'
);
RESET ROLE;

-- ─── acts ──────────────────────────────────────────────────────────────────
-- U is an upload with a stored file.

INSERT INTO storage.objects (bucket_id, name)
VALUES ('project-item-images',
        '80700000-0000-4000-8000-000000000001/80700000-0000-4000-8000-000000000101/u.jpg');

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"80700000-0000-4000-8000-0000000000a1","role":"authenticated"}';
SELECT is(
  (SELECT (image.position, image.is_primary, image.source)::text
   FROM public.add_ffe_item_image(
     '80700000-0000-4000-8000-000000000101',
     'https://storage.test/project-item-images/u.jpg',
     '80700000-0000-4000-8000-000000000001/80700000-0000-4000-8000-000000000101/u.jpg',
     'upload', NULL) AS image),
  '(3,f,upload)',
  'acts: add appends at the end and is not primary while one exists'
);
SELECT is(
  (SELECT image.url FROM public.set_ffe_item_primary_image(
     (SELECT id FROM public.project_ffe_item_images WHERE url = 'https://storage.test/project-item-images/u.jpg')) AS image
   WHERE image.is_primary),
  'https://storage.test/project-item-images/u.jpg',
  'acts: set primary returns the new primary'
);
SELECT is(
  (SELECT array_agg(url) FROM public.project_ffe_item_images
   WHERE item_id = '80700000-0000-4000-8000-000000000101' AND is_primary),
  ARRAY['https://storage.test/project-item-images/u.jpg'],
  'acts: exactly one primary after set primary'
);
SELECT is(
  (SELECT array_agg(image.url ORDER BY image.position)
   FROM public.reorder_ffe_item_images(
     '80700000-0000-4000-8000-000000000101',
     ARRAY[
       (SELECT id FROM public.project_ffe_item_images WHERE url = 'https://storage.test/project-item-images/u.jpg'),
       (SELECT id FROM public.project_ffe_item_images WHERE url = 'https://img.test/a.jpg'),
       (SELECT id FROM public.project_ffe_item_images WHERE url = 'https://img.test/b.jpg'),
       (SELECT id FROM public.project_ffe_item_images WHERE url = 'https://img.test/c.jpg')
     ]) AS image),
  ARRAY['https://storage.test/project-item-images/u.jpg', 'https://img.test/a.jpg',
        'https://img.test/b.jpg', 'https://img.test/c.jpg'],
  'acts: reorder returns the pictures in the new order'
);
SELECT throws_ok(
  format('SELECT * FROM public.reorder_ffe_item_images(%L, ARRAY[%L]::uuid[])',
         '80700000-0000-4000-8000-000000000101', current_setting('us37.image_b')),
  '22023', 'The new order must name every picture on this piece once.',
  'acts: a reorder that leaves pictures out is refused'
);
SELECT public.unlink_ffe_item_image(
  (SELECT id FROM public.project_ffe_item_images WHERE url = 'https://storage.test/project-item-images/u.jpg'));
SELECT is(
  (SELECT array_agg(url) FROM public.project_ffe_item_images
   WHERE item_id = '80700000-0000-4000-8000-000000000101' AND is_primary),
  ARRAY['https://img.test/a.jpg'],
  'acts: unlinking the primary promotes the first remaining picture'
);
SELECT is(
  (SELECT count(*)::integer FROM public.project_ffe_item_images
   WHERE url = 'https://storage.test/project-item-images/u.jpg'),
  0,
  'acts: unlink deletes the link row'
);
RESET ROLE;
SELECT is(
  (SELECT count(*)::integer FROM storage.objects
   WHERE bucket_id = 'project-item-images'
     AND name = '80700000-0000-4000-8000-000000000001/80700000-0000-4000-8000-000000000101/u.jpg'),
  1,
  'acts: unlink leaves the stored file'
);

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"80700000-0000-4000-8000-0000000000a1","role":"authenticated"}';
SELECT public.unlink_ffe_item_image(id) FROM public.project_ffe_item_images
 WHERE item_id = '80700000-0000-4000-8000-000000000102';
SELECT is(
  (SELECT (image.position, image.is_primary)::text
   FROM public.add_ffe_item_image('80700000-0000-4000-8000-000000000102', 'https://img.test/new.jpg',
                                  NULL, 'library', '80700000-0000-4000-8000-000000000022') AS image),
  '(0,t)',
  'acts: the first picture on an item with none is its primary'
);

-- ─── readers ───────────────────────────────────────────────────────────────
-- B becomes the primary, so the primary differs from the piece's first image (A)
-- and from the first picture by position (A).

SELECT public.set_ffe_item_primary_image(
  (SELECT id FROM public.project_ffe_item_images WHERE url = 'https://img.test/b.jpg'));
SELECT is(
  (SELECT public.primary_image_url(item) FROM public.project_ffe_items AS item
   WHERE item.id = '80700000-0000-4000-8000-000000000101'),
  'https://img.test/b.jpg',
  'readers: the designer''s computed field returns the primary'
);

SET LOCAL request.jwt.claims = '{"sub":"80700000-0000-4000-8000-0000000000a2","role":"authenticated"}';
SELECT is(
  (SELECT selection->>'primaryImageUrl'
   FROM jsonb_array_elements(public.get_client_project_selections('80700000-0000-4000-8000-000000000001')->'selections') AS selection
   WHERE selection->>'id' = '80700000-0000-4000-8000-000000000101'),
  'https://img.test/b.jpg',
  'readers: get_client_project_selections returns the primary'
);
SELECT is(
  (SELECT selection->'imageUrls'
   FROM jsonb_array_elements(public.get_client_project_selections('80700000-0000-4000-8000-000000000001')->'selections') AS selection
   WHERE selection->>'id' = '80700000-0000-4000-8000-000000000101'),
  '["https://img.test/a.jpg", "https://img.test/b.jpg", "https://img.test/c.jpg"]'::jsonb,
  'readers: get_client_project_selections returns the pictures in order'
);
SELECT is(
  (SELECT selection->>'primaryImageUrl'
   FROM jsonb_array_elements(public.get_client_project_threshold('80700000-0000-4000-8000-000000000001')->'selections') AS selection
   WHERE selection->>'id' = '80700000-0000-4000-8000-000000000101'),
  'https://img.test/b.jpg',
  'readers: get_client_project_threshold returns the primary'
);
SELECT is(
  (SELECT selection->>'imageUrl'
   FROM jsonb_array_elements(public.get_client_project_threshold('80700000-0000-4000-8000-000000000001')->'selections') AS selection
   WHERE selection->>'id' = '80700000-0000-4000-8000-000000000101'),
  'https://img.test/b.jpg',
  'readers: the threshold''s imageUrl is the item''s primary, not the live piece''s first image'
);
SELECT is(
  (SELECT selection->'imageUrls'
   FROM jsonb_array_elements(public.get_client_project_threshold('80700000-0000-4000-8000-000000000001')->'selections') AS selection
   WHERE selection->>'id' = '80700000-0000-4000-8000-000000000101'),
  '["https://img.test/a.jpg", "https://img.test/b.jpg", "https://img.test/c.jpg"]'::jsonb,
  'readers: get_client_project_threshold returns the pictures in order'
);
RESET ROLE;

-- ─── spec book (SQ-1128 F4) ────────────────────────────────────────────────
-- prepare_spec_book_issue freezes _spec_book_current_item_snapshots'
-- item_snapshot into spec_book_revision_items, so this is the published
-- picture. I4 is a line with no piece and one upload.

INSERT INTO public.spec_books (id, project_id, title, template_id, created_by)
VALUES ('80700000-0000-4000-8000-000000000501', '80700000-0000-4000-8000-000000000001',
        'US37 Whole Home — Spec Book', '8f6e2600-6f25-4f20-a63d-d68d49c35a01',
        '80700000-0000-4000-8000-0000000000a1');
INSERT INTO public.spec_book_item_settings (spec_book_id, ffe_item_id, chapter_id, position)
VALUES ('80700000-0000-4000-8000-000000000501', '80700000-0000-4000-8000-000000000101', NULL, 0)
ON CONFLICT (spec_book_id, ffe_item_id) DO NOTHING;
SELECT set_config('app.ffe_mutation_rpc', 'on', true);
INSERT INTO public.project_ffe_items (
  id, project_id, name, status, item_type, product_id, quantity,
  unit_price_cents, line_total_cents, design_disposition, assignment_scope, sort_order
) VALUES
  ('80700000-0000-4000-8000-000000000104', '80700000-0000-4000-8000-000000000001', 'Found mirror',
   'specified', 'tbd', NULL, 1, 0, 0, 'selected', 'unassigned', 3);
SELECT set_config('app.ffe_mutation_rpc', '', true);
INSERT INTO public.spec_book_item_settings (spec_book_id, ffe_item_id, chapter_id, position)
VALUES ('80700000-0000-4000-8000-000000000501', '80700000-0000-4000-8000-000000000104', NULL, 1)
ON CONFLICT (spec_book_id, ffe_item_id) DO NOTHING;

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"80700000-0000-4000-8000-0000000000a1","role":"authenticated"}';
SELECT public.add_ffe_item_image(
  '80700000-0000-4000-8000-000000000104',
  'https://storage.test/project-item-images/mirror.jpg',
  '80700000-0000-4000-8000-000000000001/80700000-0000-4000-8000-000000000104/mirror.jpg',
  'upload', NULL);
SELECT public.set_ffe_item_primary_image(
  (SELECT id FROM public.project_ffe_item_images WHERE url = 'https://img.test/c.jpg'));
RESET ROLE;

SELECT is(
  (SELECT item_snapshot->'selectedMedia'->>0
   FROM public._spec_book_current_item_snapshots('80700000-0000-4000-8000-000000000501')
   WHERE ffe_item_id = '80700000-0000-4000-8000-000000000104'),
  'https://storage.test/project-item-images/mirror.jpg',
  'spec book: an upload-only line publishes its uploaded picture'
);
SELECT is(
  (SELECT item_snapshot->'selectedMedia'->>0
   FROM public._spec_book_current_item_snapshots('80700000-0000-4000-8000-000000000501')
   WHERE ffe_item_id = '80700000-0000-4000-8000-000000000101'),
  'https://img.test/c.jpg',
  'spec book: after the primary changes, the published picture is the new primary, not the piece''s first image'
);

-- ─── rpc-only writes (SQ-1128 F5) ──────────────────────────────────────────
-- O is on the job's studio leg; she may read pictures but write only through
-- the four RPCs.

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"80700000-0000-4000-8000-0000000000a1","role":"authenticated"}';
SELECT throws_ok(
  $$INSERT INTO public.project_ffe_item_images (item_id, project_id, url, source, position)
    VALUES ('80700000-0000-4000-8000-000000000101', '80700000-0000-4000-8000-000000000001',
            'https://img.test/direct.jpg', 'upload', 50)$$,
  '42501', NULL,
  'rpc-only: a team member''s direct INSERT is refused'
);
SELECT throws_ok(
  $$UPDATE public.project_ffe_item_images SET is_primary = false
    WHERE item_id = '80700000-0000-4000-8000-000000000101'$$,
  '42501', NULL,
  'rpc-only: a team member''s direct UPDATE is refused'
);
SELECT throws_ok(
  $$DELETE FROM public.project_ffe_item_images
    WHERE item_id = '80700000-0000-4000-8000-000000000101'$$,
  '42501', NULL,
  'rpc-only: a team member''s direct DELETE is refused'
);
SELECT is(
  (SELECT count(*)::integer FROM public.project_ffe_item_images
   WHERE item_id = '80700000-0000-4000-8000-000000000101' AND is_primary),
  1,
  'rpc-only: a team member still reads the pictures, one primary'
);
RESET ROLE;

-- ─── no parent foreign keys (SQ-1143, Astra SQ-1141 R1/R2) ────────────────
-- A picture written under an item lock must take no projects or products
-- lock after it: furnishings execution locks the job first (00578), and
-- merge_studio_product locks the piece first (00753).

SELECT ok(
  NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.project_ffe_item_images'::regclass
      AND contype = 'f'
      AND confrelid = 'public.projects'::regclass),
  'no parent keys: project_id has no foreign key to projects (R1)'
);
SELECT ok(
  NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.project_ffe_item_images'::regclass
      AND contype = 'f'
      AND confrelid = 'public.products'::regclass),
  'no parent keys: source_product_id has no foreign key to products (R2)'
);
SELECT is(
  (SELECT string_agg(parent.relname::text || ':' || constraint_row.confdeltype::text, ',' ORDER BY parent.relname)
   FROM pg_constraint AS constraint_row
   JOIN pg_class AS parent ON parent.oid = constraint_row.confrelid
   WHERE constraint_row.conrelid = 'public.project_ffe_item_images'::regclass
     AND constraint_row.contype = 'f'),
  'profiles:n,project_ffe_items:c',
  'no parent keys: the item cascade (and created_by) are the only foreign keys left'
);

-- A row that claims a job that does not exist still gets the item's job.
INSERT INTO public.project_ffe_item_images (item_id, project_id, url, source, position)
VALUES ('80700000-0000-4000-8000-000000000102', '80700000-0000-4000-8000-0000000000ff',
        'https://img.test/claims-no-job.jpg', 'upload', 9);
SELECT is(
  (SELECT project_id FROM public.project_ffe_item_images WHERE url = 'https://img.test/claims-no-job.jpg'),
  '80700000-0000-4000-8000-000000000001'::uuid,
  'no parent keys: an insert copies project_id from the item, even over a job that does not exist'
);
DELETE FROM public.project_ffe_item_images WHERE url = 'https://img.test/claims-no-job.jpg';

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"80700000-0000-4000-8000-0000000000a1","role":"authenticated"}';
SELECT throws_ok(
  $$SELECT public.add_ffe_item_image(
      '80700000-0000-4000-8000-000000000102', 'https://img.test/ghost.jpg', NULL,
      'library', '80700000-0000-4000-8000-0000000000fe')$$,
  '23503',
  'That library piece no longer exists.',
  'no parent keys: add still refuses a library piece that does not exist'
);
RESET ROLE;

-- ─── an item moves to another job (SQ-1143) ───────────────────────────────
-- I5 has two library pictures and an upload stored under P's folder.
SELECT set_config('app.ffe_mutation_rpc', 'on', true);
INSERT INTO public.project_ffe_items (
  id, project_id, name, status, item_type, product_id, quantity,
  unit_price_cents, line_total_cents, design_disposition, assignment_scope, sort_order
) VALUES
  ('80700000-0000-4000-8000-000000000105', '80700000-0000-4000-8000-000000000001', 'Nesting tables',
   'specified', 'fixed', '80700000-0000-4000-8000-000000000022', 1, 30000, 30000, 'selected', 'unassigned', 4);
SELECT set_config('app.ffe_mutation_rpc', '', true);
INSERT INTO public.project_ffe_item_images (item_id, url, storage_path, source, position)
VALUES ('80700000-0000-4000-8000-000000000105', 'https://storage.test/project-item-images/nest.jpg',
        '80700000-0000-4000-8000-000000000001/80700000-0000-4000-8000-000000000105/nest.jpg',
        'upload', 2);

SELECT set_config('app.ffe_mutation_rpc', 'on', true);
SELECT lives_ok(
  -- A NULL thread gets a new one in the new job (00438's selection guard).
  $$UPDATE public.project_ffe_items
       SET project_id = '80700000-0000-4000-8000-000000000002', selection_thread_id = NULL
     WHERE id = '80700000-0000-4000-8000-000000000105'$$,
  'move: an item whose upload is stored under its old job still moves'
);
SELECT set_config('app.ffe_mutation_rpc', '', true);
SELECT is(
  (SELECT string_agg(project_id::text || ':' || count::text, ',')
   FROM (SELECT project_id, count(*) FROM public.project_ffe_item_images
         WHERE item_id = '80700000-0000-4000-8000-000000000105'
         GROUP BY project_id) AS by_job),
  '80700000-0000-4000-8000-000000000002:3',
  'move: every picture follows the item to its new job'
);

-- The read policy asks the row's project_id, so the new job's studio sees them.
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"80700000-0000-4000-8000-0000000000a5","role":"authenticated"}';
SELECT is(
  (SELECT count(*)::integer FROM public.project_ffe_item_images
   WHERE item_id = '80700000-0000-4000-8000-000000000105'),
  3,
  'move: the new job''s studio reads the moved pictures'
);
RESET ROLE;

SELECT * FROM finish();
ROLLBACK;
