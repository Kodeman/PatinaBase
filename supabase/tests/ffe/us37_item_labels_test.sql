-- ═══════════════════════════════════════════════════════════════════════════
-- 00808 — per-job item labels on doc_code (pgTAP, US-37 #3, SQ-1100)
--
-- Cases:
--   objects     grants on the writer and helpers; the unique index
--   prefix      room initials: Living Room LR, Kitchen KI, Primary Bath and
--               Closet PBC, stop words, apostrophes, no letters
--   roomless    001, 002, 003; max + 1, not a count
--   room        LR-01, LR-02; KI-01; PBC-01; per job
--   concurrent  two rows in one INSERT, three in one INSERT … SELECT: no clash
--   explicit    an explicit code is kept; a taken code on insert is replaced
--   edits       a clashing edit raises 23505 with the plain sentence (RPC and
--               a direct write); free text is trimmed; blank assigns the next
--               label; an outsider and a removed item are refused
--   moves       moving rooms never relabels
--   restore     a restored item whose label was taken gets the next one
--   supersede   the replacement carries its predecessor's label
--   backfill    sort_order, created_at order; existing codes untouched;
--               removed items untouched; a second run changes nothing
--   index       the unique index refuses a clash when the trigger is off
--
-- Run: supabase test db supabase/tests/ffe/us37_item_labels_test.sql
-- Everything is rolled back.
-- ═══════════════════════════════════════════════════════════════════════════
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT plan(41);

-- ── objects ────────────────────────────────────────────────────────────────
SELECT ok(
  has_function_privilege('authenticated', 'public.set_project_ffe_item_label(uuid, text)', 'EXECUTE'),
  'authenticated can call set_project_ffe_item_label'
);
SELECT ok(
  NOT has_function_privilege('anon', 'public.set_project_ffe_item_label(uuid, text)', 'EXECUTE'),
  'anon cannot call set_project_ffe_item_label'
);
SELECT ok(
  NOT has_function_privilege('authenticated', 'public._ffe_next_item_label(uuid, uuid)', 'EXECUTE')
  AND NOT has_function_privilege('authenticated', 'public._ffe_backfill_item_labels()', 'EXECUTE'),
  'authenticated cannot call the label helpers'
);
SELECT ok(
  (SELECT i.indisunique FROM pg_index AS i
   WHERE i.indexrelid = 'public.project_ffe_items_label_unique'::regclass),
  'project_ffe_items_label_unique is a unique index'
);

-- ── prefix ─────────────────────────────────────────────────────────────────
SELECT is(public._ffe_item_label_prefix('Living Room'), 'LR', 'Living Room gives LR');
SELECT is(public._ffe_item_label_prefix('Kitchen'), 'KI', 'a single word gives its first 2 letters');
SELECT is(public._ffe_item_label_prefix('Primary Bath and Closet'), 'PBC', 'Primary Bath and Closet gives PBC');
SELECT is(
  ARRAY[
    public._ffe_item_label_prefix('The Den & Bar'),
    public._ffe_item_label_prefix('Bed & Bath'),
    public._ffe_item_label_prefix('the study'),
    public._ffe_item_label_prefix('Kid''s Room'),
    public._ffe_item_label_prefix('Primary Suite Walk In Closet')
  ],
  ARRAY['DB', 'BB', 'ST', 'KR', 'PSW'],
  'and, & and the are ignored; an apostrophe stays in its word; at most 3 letters'
);
SELECT is(public._ffe_item_label_prefix(' — '), NULL, 'a name with no letters or digits gives no prefix');

-- ── fixtures (as postgres) ─────────────────────────────────────────────────
-- Designer D b8080000-…-01, outsider O b8080000-…-02.
-- P1 the job under test, P2 the backfill job, P3 another job of D.
INSERT INTO auth.users (
  id, email, encrypted_password, email_confirmed_at, created_at, updated_at,
  instance_id, aud, role
) VALUES
  ('b8080000-0000-4000-8000-000000000001', 'labels-designer@test.invalid', '', now(), now(), now(),
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('b8080000-0000-4000-8000-000000000002', 'labels-outsider@test.invalid', '', now(), now(), now(),
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');

INSERT INTO public.profiles (id, email, full_name, is_designer, created_at, updated_at)
VALUES
  ('b8080000-0000-4000-8000-000000000001', 'labels-designer@test.invalid', 'Labels Designer', true, now(), now()),
  ('b8080000-0000-4000-8000-000000000002', 'labels-outsider@test.invalid', 'Labels Outsider', true, now(), now())
ON CONFLICT (id) DO UPDATE
SET email = EXCLUDED.email, full_name = EXCLUDED.full_name, is_designer = EXCLUDED.is_designer;

INSERT INTO public.projects (id, name, designer_id, created_by, status) VALUES
  ('b8081000-0000-4000-8000-000000000001', 'Labels job', 'b8080000-0000-4000-8000-000000000001',
   'b8080000-0000-4000-8000-000000000001', 'active'),
  ('b8081000-0000-4000-8000-000000000002', 'Backfill job', 'b8080000-0000-4000-8000-000000000001',
   'b8080000-0000-4000-8000-000000000001', 'active'),
  ('b8081000-0000-4000-8000-000000000003', 'Other job', 'b8080000-0000-4000-8000-000000000001',
   'b8080000-0000-4000-8000-000000000001', 'active');

INSERT INTO public.project_rooms (id, project_id, name, sort_order) VALUES
  ('b8082000-0000-4000-8000-000000000001', 'b8081000-0000-4000-8000-000000000001', 'Living Room', 0),
  ('b8082000-0000-4000-8000-000000000002', 'b8081000-0000-4000-8000-000000000001', 'Kitchen', 1),
  ('b8082000-0000-4000-8000-000000000003', 'b8081000-0000-4000-8000-000000000001', 'Primary Bath and Closet', 2),
  ('b8082000-0000-4000-8000-000000000004', 'b8081000-0000-4000-8000-000000000003', 'Living Room', 0),
  ('b8082000-0000-4000-8000-000000000005', 'b8081000-0000-4000-8000-000000000002', 'living room', 0);

-- ── roomless: 001, 002, 003; max + 1 ───────────────────────────────────────
INSERT INTO public.project_ffe_items (id, project_id, name, sort_order)
VALUES ('b8083000-0000-4000-8000-000000000001', 'b8081000-0000-4000-8000-000000000001', 'Paint', 1);
INSERT INTO public.project_ffe_items (id, project_id, name, sort_order)
VALUES ('b8083000-0000-4000-8000-000000000002', 'b8081000-0000-4000-8000-000000000001', 'Wallpaper', 2);
INSERT INTO public.project_ffe_items (id, project_id, name, sort_order, doc_code)
VALUES ('b8083000-0000-4000-8000-000000000003', 'b8081000-0000-4000-8000-000000000001', 'Hardware', 3, '  ');
SELECT is(
  ARRAY(SELECT doc_code FROM public.project_ffe_items
        WHERE id IN ('b8083000-0000-4000-8000-000000000001', 'b8083000-0000-4000-8000-000000000002',
                     'b8083000-0000-4000-8000-000000000003')
        ORDER BY sort_order),
  ARRAY['001', '002', '003'],
  'roomless items are labeled 001, 002, 003 (null and blank alike)'
);

INSERT INTO public.project_ffe_items (id, project_id, name, sort_order, doc_code)
VALUES ('b8083000-0000-4000-8000-000000000004', 'b8081000-0000-4000-8000-000000000001', 'Trim', 4, '010');
INSERT INTO public.project_ffe_items (id, project_id, name, sort_order)
VALUES ('b8083000-0000-4000-8000-000000000005', 'b8081000-0000-4000-8000-000000000001', 'Grout', 5);
SELECT is(
  (SELECT doc_code FROM public.project_ffe_items WHERE id = 'b8083000-0000-4000-8000-000000000005'),
  '011',
  'the next roomless label is max + 1 (010 → 011), not a count'
);

-- ── room prefix ────────────────────────────────────────────────────────────
INSERT INTO public.project_ffe_items (id, project_id, project_room_id, assignment_scope, name, sort_order)
VALUES ('b8083000-0000-4000-8000-000000000006', 'b8081000-0000-4000-8000-000000000001',
        'b8082000-0000-4000-8000-000000000001', 'room', 'Sofa', 6);
INSERT INTO public.project_ffe_items (id, project_id, project_room_id, assignment_scope, name, sort_order)
VALUES ('b8083000-0000-4000-8000-000000000007', 'b8081000-0000-4000-8000-000000000001',
        'b8082000-0000-4000-8000-000000000001', 'room', 'Lounge chair', 7);
SELECT is(
  ARRAY(SELECT doc_code FROM public.project_ffe_items
        WHERE id IN ('b8083000-0000-4000-8000-000000000006', 'b8083000-0000-4000-8000-000000000007')
        ORDER BY sort_order),
  ARRAY['LR-01', 'LR-02'],
  'Living Room items are labeled LR-01, LR-02'
);

INSERT INTO public.project_ffe_items (id, project_id, project_room_id, assignment_scope, name, sort_order)
VALUES ('b8083000-0000-4000-8000-000000000008', 'b8081000-0000-4000-8000-000000000001',
        'b8082000-0000-4000-8000-000000000002', 'room', 'Counter stool', 8),
       ('b8083000-0000-4000-8000-000000000009', 'b8081000-0000-4000-8000-000000000001',
        'b8082000-0000-4000-8000-000000000003', 'room', 'Vanity', 9);
SELECT is(
  ARRAY(SELECT doc_code FROM public.project_ffe_items
        WHERE id IN ('b8083000-0000-4000-8000-000000000008', 'b8083000-0000-4000-8000-000000000009')
        ORDER BY sort_order),
  ARRAY['KI-01', 'PBC-01'],
  'Kitchen gives KI-01 and Primary Bath and Closet gives PBC-01'
);

INSERT INTO public.project_ffe_items (id, project_id, project_room_id, assignment_scope, name, sort_order)
VALUES ('b8083000-0000-4000-8000-000000000010', 'b8081000-0000-4000-8000-000000000003',
        'b8082000-0000-4000-8000-000000000004', 'room', 'Other sofa', 0);
SELECT is(
  (SELECT doc_code FROM public.project_ffe_items WHERE id = 'b8083000-0000-4000-8000-000000000010'),
  'LR-01',
  'labels are per job: another job starts its own LR-01'
);

-- ── concurrent-style inserts in one transaction ────────────────────────────
INSERT INTO public.project_ffe_items (id, project_id, project_room_id, assignment_scope, name, sort_order)
VALUES ('b8083000-0000-4000-8000-000000000011', 'b8081000-0000-4000-8000-000000000001',
        'b8082000-0000-4000-8000-000000000001', 'room', 'Side table', 11),
       ('b8083000-0000-4000-8000-000000000012', 'b8081000-0000-4000-8000-000000000001',
        'b8082000-0000-4000-8000-000000000001', 'room', 'Floor lamp', 12);
SELECT is(
  ARRAY(SELECT doc_code FROM public.project_ffe_items
        WHERE id IN ('b8083000-0000-4000-8000-000000000011', 'b8083000-0000-4000-8000-000000000012')
        ORDER BY sort_order),
  ARRAY['LR-03', 'LR-04'],
  'two rows in one INSERT get LR-03 and LR-04, never the same label'
);

INSERT INTO public.project_ffe_items (project_id, name, sort_order)
SELECT 'b8081000-0000-4000-8000-000000000001', 'Batch line ' || n, 20 + n
FROM generate_series(1, 3) AS n;
SELECT is(
  ARRAY(SELECT doc_code FROM public.project_ffe_items
        WHERE project_id = 'b8081000-0000-4000-8000-000000000001' AND name LIKE 'Batch line %'
        ORDER BY sort_order),
  ARRAY['012', '013', '014'],
  'three rows in one INSERT … SELECT get 012, 013, 014'
);
SELECT is(
  (SELECT count(*) - count(DISTINCT lower(btrim(doc_code)))
   FROM public.project_ffe_items WHERE project_id = 'b8081000-0000-4000-8000-000000000001'),
  0::bigint,
  'no two items in the job share a label'
);

-- ── explicit codes ─────────────────────────────────────────────────────────
INSERT INTO public.project_ffe_items (id, project_id, project_room_id, assignment_scope, name, sort_order, doc_code)
VALUES ('b8083000-0000-4000-8000-000000000013', 'b8081000-0000-4000-8000-000000000001',
        'b8082000-0000-4000-8000-000000000001', 'room', 'Armchair', 13, 'CH-07');
SELECT is(
  (SELECT doc_code FROM public.project_ffe_items WHERE id = 'b8083000-0000-4000-8000-000000000013'),
  'CH-07',
  'an explicit code is kept'
);

-- An import or activation carrying a code the job already uses must not fail:
-- the taken code is dropped and the next label assigned.
INSERT INTO public.project_ffe_items (id, project_id, project_room_id, assignment_scope, name, sort_order, doc_code)
VALUES ('b8083000-0000-4000-8000-000000000014', 'b8081000-0000-4000-8000-000000000001',
        'b8082000-0000-4000-8000-000000000001', 'room', 'Imported twin', 14, ' lr-01');
SELECT is(
  (SELECT doc_code FROM public.project_ffe_items WHERE id = 'b8083000-0000-4000-8000-000000000014'),
  'LR-05',
  'an inserted code another item uses (any case, any edge space) is replaced by the next label'
);

-- ── edits through the writer ───────────────────────────────────────────────
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"b8080000-0000-4000-8000-000000000001","role":"authenticated"}';

SELECT throws_ok(
  $$ SELECT public.set_project_ffe_item_label('b8083000-0000-4000-8000-000000000008', 'Lr-02') $$,
  '23505',
  'Another item in this job already uses LR-02.',
  'an edit to a label another item uses raises 23505 with the plain sentence'
);
SELECT is(
  (public.set_project_ffe_item_label('b8083000-0000-4000-8000-000000000008', '  Island stool A  ')).doc_code,
  'Island stool A',
  'an edit is free text, trimmed'
);
SELECT is(
  (public.set_project_ffe_item_label('b8083000-0000-4000-8000-000000000008', 'Island stool A')).doc_code,
  'Island stool A',
  'saving the same label again is not a clash with itself'
);
SELECT is(
  (public.set_project_ffe_item_label('b8083000-0000-4000-8000-000000000013', '')).doc_code,
  'LR-06',
  'a blank edit gives the item the next automatic label'
);
SELECT is(
  (public.set_project_ffe_item_label('b8083000-0000-4000-8000-000000000009', 'PBC-01')).doc_code,
  'PBC-01',
  'an edit back to its own label is kept'
);

SET LOCAL request.jwt.claims = '{"sub":"b8080000-0000-4000-8000-000000000002","role":"authenticated"}';
SELECT throws_ok(
  $$ SELECT public.set_project_ffe_item_label('b8083000-0000-4000-8000-000000000006', 'X-1') $$,
  '42501',
  'project not found or access denied',
  'an outsider cannot label another studio''s item'
);
RESET ROLE;

SELECT is(
  (SELECT doc_code FROM public.project_ffe_items WHERE id = 'b8083000-0000-4000-8000-000000000006'),
  'LR-01',
  'the outsider changed nothing'
);
SELECT throws_ok(
  $$ UPDATE public.project_ffe_items SET doc_code = 'lr-06 '
     WHERE id = 'b8083000-0000-4000-8000-000000000006' $$,
  '23505',
  'Another item in this job already uses LR-06.',
  'a direct write is held to the same rule as the writer'
);

-- ── moving rooms never relabels ────────────────────────────────────────────
UPDATE public.project_ffe_items
SET project_room_id = 'b8082000-0000-4000-8000-000000000002', assignment_scope = 'room'
WHERE id = 'b8083000-0000-4000-8000-000000000006';
SELECT is(
  (SELECT doc_code FROM public.project_ffe_items WHERE id = 'b8083000-0000-4000-8000-000000000006'),
  'LR-01',
  'moving LR-01 to the Kitchen keeps LR-01'
);
UPDATE public.project_ffe_items
SET project_room_id = NULL, assignment_scope = 'unassigned'
WHERE id = 'b8083000-0000-4000-8000-000000000007';
SELECT is(
  (SELECT doc_code FROM public.project_ffe_items WHERE id = 'b8083000-0000-4000-8000-000000000007'),
  'LR-02',
  'taking LR-02 out of its room keeps LR-02'
);

-- ── removed items, restore ─────────────────────────────────────────────────
UPDATE public.project_ffe_items
SET removed_at = now(), removed_by = 'b8080000-0000-4000-8000-000000000001', removal_reason = 'not needed'
WHERE id = 'b8083000-0000-4000-8000-000000000003';

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"b8080000-0000-4000-8000-000000000001","role":"authenticated"}';
SELECT throws_ok(
  $$ SELECT public.set_project_ffe_item_label('b8083000-0000-4000-8000-000000000003', 'H-1') $$,
  '23514',
  'This item was removed from the job.',
  'a removed item cannot be relabeled'
);
SELECT is(
  (public.set_project_ffe_item_label('b8083000-0000-4000-8000-000000000002', '003')).doc_code,
  '003',
  'a removed item''s label is free for a live item'
);
RESET ROLE;

UPDATE public.project_ffe_items
SET removed_at = NULL, removed_by = NULL, removal_reason = NULL
WHERE id = 'b8083000-0000-4000-8000-000000000003';
SELECT is(
  ARRAY(SELECT doc_code FROM public.project_ffe_items
        WHERE id IN ('b8083000-0000-4000-8000-000000000002', 'b8083000-0000-4000-8000-000000000003')
        ORDER BY sort_order),
  ARRAY['003', '015'],
  'a restored item whose label was taken gets the next label; the live item keeps it'
);

-- ── supersede carries the label ────────────────────────────────────────────
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"b8080000-0000-4000-8000-000000000001","role":"authenticated"}';
SELECT lives_ok(
  $$ SELECT public.supersede_project_selection(
       '{"selectionId":"b8083000-0000-4000-8000-000000000012","name":"Floor lamp, brass"}'::jsonb) $$,
  'supersede_project_selection succeeds under the unique label'
);
RESET ROLE;
SELECT is(
  (SELECT doc_code FROM public.project_ffe_items
   WHERE supersedes_ffe_item_id = 'b8083000-0000-4000-8000-000000000012'),
  'LR-04',
  'the replacement carries its predecessor''s label'
);
SELECT is(
  (SELECT doc_code FROM public.project_ffe_items WHERE id = 'b8083000-0000-4000-8000-000000000012'),
  'LR-04',
  'the superseded predecessor keeps its label too'
);

-- ── backfill ───────────────────────────────────────────────────────────────
-- Commit-time checks run now (as a COMMIT would), so the table can be altered.
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE public.project_ffe_items DISABLE TRIGGER zz_ffe_assign_item_label_trg;

INSERT INTO public.project_ffe_items (id, project_id, project_room_id, assignment_scope, name, sort_order, created_at, doc_code) VALUES
  ('b8084000-0000-4000-8000-000000000005', 'b8081000-0000-4000-8000-000000000002', NULL, 'unassigned', 'Existing', 9, '2026-01-01 09:00+00', '002'),
  ('b8084000-0000-4000-8000-000000000001', 'b8081000-0000-4000-8000-000000000002', NULL, 'unassigned', 'First', 0, '2026-01-01 10:00+00', NULL),
  ('b8084000-0000-4000-8000-000000000002', 'b8081000-0000-4000-8000-000000000002', NULL, 'unassigned', 'Later twin', 1, '2026-01-01 12:00+00', NULL),
  ('b8084000-0000-4000-8000-000000000003', 'b8081000-0000-4000-8000-000000000002', NULL, 'unassigned', 'Earlier twin', 1, '2026-01-01 11:00+00', NULL),
  ('b8084000-0000-4000-8000-000000000004', 'b8081000-0000-4000-8000-000000000002', 'b8082000-0000-4000-8000-000000000005', 'room', 'Rug', 2, '2026-01-01 10:00+00', NULL),
  ('b8084000-0000-4000-8000-000000000007', 'b8081000-0000-4000-8000-000000000002', NULL, 'unassigned', 'Blank', 3, '2026-01-01 10:00+00', ' ');
INSERT INTO public.project_ffe_items (id, project_id, name, sort_order, doc_code, removed_at, removed_by, removal_reason)
VALUES ('b8084000-0000-4000-8000-000000000006', 'b8081000-0000-4000-8000-000000000002', 'Removed', 4, NULL,
        now(), 'b8080000-0000-4000-8000-000000000001', 'not needed');

SELECT is(public._ffe_backfill_item_labels(), 5, 'the backfill labels the 5 live items without a label');
SELECT is(
  ARRAY(SELECT COALESCE(doc_code, '<null>') FROM public.project_ffe_items
        WHERE project_id = 'b8081000-0000-4000-8000-000000000002' ORDER BY id),
  ARRAY['003', '005', '004', 'LR-01', '002', '<null>', '006'],
  'backfill follows sort_order then created_at; the existing 002 is untouched; the removed item is left alone'
);
SELECT is(public._ffe_backfill_item_labels(), 0, 'a second backfill labels nothing');
SELECT is(
  ARRAY(SELECT COALESCE(doc_code, '<null>') FROM public.project_ffe_items
        WHERE project_id = 'b8081000-0000-4000-8000-000000000002' ORDER BY id),
  ARRAY['003', '005', '004', 'LR-01', '002', '<null>', '006'],
  'a second backfill changes no label'
);

-- ── the index backstop (trigger still off) ─────────────────────────────────
SELECT throws_ok(
  $$ UPDATE public.project_ffe_items SET doc_code = ' lr-01'
     WHERE id = 'b8084000-0000-4000-8000-000000000001' $$,
  '23505',
  'duplicate key value violates unique constraint "project_ffe_items_label_unique"',
  'the unique index refuses a clash even without the trigger'
);
SELECT lives_ok(
  $$ UPDATE public.project_ffe_items SET doc_code = '006'
     WHERE id = 'b8084000-0000-4000-8000-000000000006' $$,
  'a removed item may hold a label a live item uses'
);

ALTER TABLE public.project_ffe_items ENABLE TRIGGER zz_ffe_assign_item_label_trg;

SELECT * FROM finish();
ROLLBACK;
