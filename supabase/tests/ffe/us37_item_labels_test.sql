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
--   lock order  the job label lock first in each item path (SQ-1121) and at
--               the outermost caller (SQ-1137): configuration placement, board
--               promotion, an SMS selection batch, every decision answer; a
--               missing decision raises no_data_found; a dblink interleave
--               shows a lone answer waits on the job lock, not the decision
--   backfill    sort_order, created_at order; existing codes untouched, but
--               a later twin of a shared label gets the next one, so the
--               index builds; removed items untouched; a second run changes
--               nothing
--   index       the unique index refuses a clash when the trigger is off
--
-- Run: supabase test db supabase/tests/ffe/us37_item_labels_test.sql
-- Everything is rolled back.
-- ═══════════════════════════════════════════════════════════════════════════
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT plan(58);

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

-- ── lock order: the job label lock first (SQ-1121) ─────────────────────────
SELECT ok(
  NOT has_function_privilege('authenticated', 'public._ffe_lock_job_labels(uuid)', 'EXECUTE')
  AND NOT has_function_privilege('anon', 'public._ffe_lock_job_labels(uuid)', 'EXECUTE')
  AND NOT has_function_privilege('public', 'public._ffe_lock_job_labels(uuid)', 'EXECUTE'),
  'authenticated, anon and PUBLIC cannot call the job label lock'
);
-- Each path that row-locks an item or a selection thread and then writes an
-- item takes the job label lock before its first item or thread row lock.
SELECT is(
  ARRAY(
    SELECT f.name
    FROM (VALUES
      ('restore_project_selection', 'FOR UPDATE'),
      ('supersede_project_selection', 'FOR UPDATE'),
      ('add_labor_line', 'FOR UPDATE'),
      ('place_product_in_project_v2', 'FOR UPDATE'),
      ('triage_project_ffe_items', 'FOR UPDATE'),
      ('set_project_ffe_item_label', 'FOR UPDATE'),
      ('_apply_client_decision_authorized', 'FOR UPDATE')
    ) AS f(name, first_row_lock)
    LEFT JOIN pg_proc AS p ON p.proname = f.name AND p.pronamespace = 'public'::regnamespace
    WHERE p.oid IS NULL
       OR strpos(p.prosrc, 'public._ffe_lock_job_labels(') = 0
       OR strpos(p.prosrc, 'public._ffe_lock_job_labels(') > strpos(p.prosrc, f.first_row_lock)
    ORDER BY f.name
  ),
  ARRAY[]::text[],
  'restore, supersede, add labor, place, triage, the label writer and a client decision take the job label lock before any item or thread row lock'
);
SELECT ok(
  (SELECT strpos(p.prosrc, 'public._ffe_lock_job_labels(NEW.project_id)') > 0
          AND strpos(p.prosrc, 'pg_advisory_xact_lock') = 0
   FROM pg_proc AS p
   WHERE p.oid = 'public.ffe_assign_item_label()'::regprocedure),
  'the label trigger takes the same job label lock'
);
-- Outermost (SQ-1137): a caller that locks a row and then reaches one of the
-- paths above takes the job label lock itself, before that row. The first
-- row lock is the first FOR UPDATE/SHARE, except: configuration placement
-- locks the configuration inside its impl; a client SMS reply locks its own
-- prompt first (no job label lock holder writes prompts), then the batch.
SELECT is(
  ARRAY(
    SELECT f.name
    FROM (VALUES
      ('place_product_configuration_in_project', '_place_product_configuration_in_project_impl\('),
      ('promote_board_reference_to_selection', '\mFOR\s+(NO\s+KEY\s+UPDATE|UPDATE|KEY\s+SHARE|SHARE)\M'),
      ('apply_client_effect', 'FROM public\.client_decision_batches'),
      ('apply_client_decision', '\mFOR\s+(NO\s+KEY\s+UPDATE|UPDATE|KEY\s+SHARE|SHARE)\M'),
      ('apply_decision', '\mFOR\s+(NO\s+KEY\s+UPDATE|UPDATE|KEY\s+SHARE|SHARE)\M'),
      ('apply_decision_override', '\mFOR\s+(NO\s+KEY\s+UPDATE|UPDATE|KEY\s+SHARE|SHARE)\M'),
      ('_resolve_coordination_item_authorized', '\mFOR\s+(NO\s+KEY\s+UPDATE|UPDATE|KEY\s+SHARE|SHARE)\M'),
      ('_apply_client_decision_authorized', '\mFOR\s+(NO\s+KEY\s+UPDATE|UPDATE|KEY\s+SHARE|SHARE)\M')
    ) AS f(name, first_row_lock)
    LEFT JOIN pg_proc AS p ON p.proname = f.name AND p.pronamespace = 'public'::regnamespace
    WHERE p.oid IS NULL
       OR strpos(p.prosrc, 'public._ffe_lock_job_labels(') = 0
       OR regexp_instr(p.prosrc, f.first_row_lock) = 0
       OR strpos(p.prosrc, 'public._ffe_lock_job_labels(') > regexp_instr(p.prosrc, f.first_row_lock)
    ORDER BY f.name
  ),
  ARRAY[]::text[],
  'configuration placement, board promotion, a client SMS batch, and every decision answer take the job label lock before their first row lock'
);
-- F2 (SQ-1137): the FOUND check reads the decision's own locked read.
SELECT throws_ok(
  $$SELECT public._apply_client_decision_authorized(
      'b8089999-0000-4000-8000-000000000001', 'b8089999-0000-4000-8000-000000000002',
      'b8080000-0000-4000-8000-000000000001')$$,
  'P0002',
  'decision b8089999-0000-4000-8000-000000000001 not found',
  'a decision that does not exist still raises no_data_found, not an option error'
);

-- F3 two-session interleave (SQ-1137, dblink). Session A holds the job label
-- lock, as a selection batch now does before its loop. Session B answers one
-- decision of that job alone. B must wait for the job label lock before it
-- locks the decision, so A can still lock the decision without waiting.
-- The fixture is committed through a third session and removed after.
CREATE EXTENSION IF NOT EXISTS dblink WITH SCHEMA extensions;
CREATE TEMP TABLE us37_interleave (result text);
DO $us37_interleave$
DECLARE
  v_dsn text := format(
    'host=%s port=54322 dbname=%s user=postgres password=postgres connect_timeout=5',
    host(network(set_masklen(inet_server_addr(), 16)) + 1), current_database());
  v_cleanup text := $c$
    DELETE FROM public.client_decisions WHERE id = 'b8089300-0000-4000-8000-000000000001';
    DELETE FROM public.projects WHERE id = 'b8089200-0000-4000-8000-000000000001';
    DELETE FROM public.designer_clients WHERE id = 'b8089100-0000-4000-8000-000000000001';
    DELETE FROM public.profiles WHERE id IN ('b8089000-0000-4000-8000-000000000001', 'b8089000-0000-4000-8000-000000000002');
    DELETE FROM auth.users WHERE id IN ('b8089000-0000-4000-8000-000000000001', 'b8089000-0000-4000-8000-000000000002');
  $c$;
  v_b_pid integer;
  v_waiting boolean := false;
  v_result text;
  v_conn text;
BEGIN
  PERFORM extensions.dblink_connect('us37_setup', v_dsn);
  PERFORM extensions.dblink_connect('us37_a', v_dsn);
  PERFORM extensions.dblink_connect('us37_b', v_dsn);
  BEGIN
    PERFORM extensions.dblink_exec('us37_setup', v_cleanup);
    PERFORM extensions.dblink_exec('us37_setup', $f$
      INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, instance_id, aud, role) VALUES
        ('b8089000-0000-4000-8000-000000000001', 'labels-interleave-designer@test.invalid', '', now(), now(), now(),
         '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
        ('b8089000-0000-4000-8000-000000000002', 'labels-interleave-client@test.invalid', '', now(), now(), now(),
         '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');
      INSERT INTO public.profiles (id, email, full_name, is_designer, created_at, updated_at) VALUES
        ('b8089000-0000-4000-8000-000000000001', 'labels-interleave-designer@test.invalid', 'Interleave Designer', true, now(), now()),
        ('b8089000-0000-4000-8000-000000000002', 'labels-interleave-client@test.invalid', 'Interleave Client', false, now(), now())
      ON CONFLICT (id) DO NOTHING;
      INSERT INTO public.designer_clients (id, designer_id, client_id, status) VALUES
        ('b8089100-0000-4000-8000-000000000001', 'b8089000-0000-4000-8000-000000000001',
         'b8089000-0000-4000-8000-000000000002', 'proposal');
      INSERT INTO public.projects (id, name, designer_id, created_by, status) VALUES
        ('b8089200-0000-4000-8000-000000000001', 'Interleave job', 'b8089000-0000-4000-8000-000000000001',
         'b8089000-0000-4000-8000-000000000001', 'active');
      INSERT INTO public.client_decisions (id, designer_client_id, designer_id, project_id, title, sent_at) VALUES
        ('b8089300-0000-4000-8000-000000000001', 'b8089100-0000-4000-8000-000000000001',
         'b8089000-0000-4000-8000-000000000001', 'b8089200-0000-4000-8000-000000000001', 'Interleave sofa', now());
    $f$);

    PERFORM extensions.dblink_exec('us37_a', 'BEGIN');
    PERFORM extensions.dblink_exec('us37_a',
      $q$SELECT public._ffe_lock_job_labels('b8089200-0000-4000-8000-000000000001')$q$);
    SELECT pid INTO v_b_pid FROM extensions.dblink('us37_b', 'SELECT pg_backend_pid()') AS r(pid integer);
    PERFORM extensions.dblink_send_query('us37_b', $q$SELECT public._apply_client_decision_authorized(
      'b8089300-0000-4000-8000-000000000001', 'b8089999-0000-4000-8000-000000000003',
      'b8089000-0000-4000-8000-000000000002')::text$q$);
    FOR i IN 1..50 LOOP
      SELECT waiting INTO v_waiting FROM extensions.dblink('us37_setup', format(
        $q$SELECT EXISTS (SELECT 1 FROM pg_stat_activity WHERE pid = %s AND wait_event_type = 'Lock')$q$, v_b_pid))
        AS r(waiting boolean);
      EXIT WHEN v_waiting;
      PERFORM pg_sleep(0.1);
    END LOOP;

    IF NOT v_waiting THEN
      v_result := 'B never waited for the job label lock';
    ELSE
      BEGIN
        PERFORM extensions.dblink_exec('us37_a', $q$SELECT 1 FROM public.client_decisions
          WHERE id = 'b8089300-0000-4000-8000-000000000001' FOR UPDATE NOWAIT$q$);
        v_result := 'decision free';
      EXCEPTION WHEN OTHERS THEN
        v_result := 'decision held by B: ' || SQLERRM;
      END;
    END IF;
    PERFORM extensions.dblink_exec('us37_a', 'ROLLBACK');
    -- B goes on and refuses (the option is not the decision's); nothing commits.
    PERFORM * FROM extensions.dblink_get_result('us37_b', false) AS r(x text);
    PERFORM * FROM extensions.dblink_get_result('us37_b', false) AS r(x text);
  EXCEPTION WHEN OTHERS THEN
    v_result := COALESCE(v_result, 'interleave error: ' || SQLERRM);
  END;
  BEGIN
    PERFORM extensions.dblink_exec('us37_setup', v_cleanup);
  EXCEPTION WHEN OTHERS THEN
    v_result := COALESCE(v_result, '') || ' / cleanup error: ' || SQLERRM;
  END;
  FOREACH v_conn IN ARRAY COALESCE(extensions.dblink_get_connections(), ARRAY[]::text[]) LOOP
    IF v_conn LIKE 'us37_%' THEN PERFORM extensions.dblink_disconnect(v_conn); END IF;
  END LOOP;
  INSERT INTO us37_interleave VALUES (v_result);
END
$us37_interleave$;
SELECT is(
  (SELECT result FROM us37_interleave),
  'decision free',
  'a lone decision answer waits for the job label lock before it locks the decision (dblink interleave)'
);

-- P4: a job no item has entered yet, so this transaction holds no label lock on it.
INSERT INTO public.projects (id, name, designer_id, created_by, status) VALUES
  ('b8081000-0000-4000-8000-000000000004', 'Lock job', 'b8080000-0000-4000-8000-000000000001',
   'b8080000-0000-4000-8000-000000000001', 'active');
CREATE TEMP VIEW us37_p4_label_lock AS
SELECT EXISTS (
  SELECT 1 FROM pg_locks AS l
  WHERE l.locktype = 'advisory' AND l.pid = pg_backend_pid() AND l.granted AND l.objsubid = 1
    AND l.classid::bigint = ((hashtext('ffe_label:b8081000-0000-4000-8000-000000000004')::bigint >> 32) & 4294967295)
    AND l.objid::bigint = (hashtext('ffe_label:b8081000-0000-4000-8000-000000000004')::bigint & 4294967295)
) AS held;
SELECT ok(NOT (SELECT held FROM us37_p4_label_lock), 'no label lock is held on a job nothing has entered');
SELECT public._ffe_lock_job_labels('b8081000-0000-4000-8000-000000000004');
SELECT ok(
  (SELECT held FROM us37_p4_label_lock),
  'the job label lock is the advisory lock on hashtext(''ffe_label:'' || job)'
);

INSERT INTO public.project_ffe_items (id, project_id, name, sort_order, doc_code) VALUES
  ('b8083000-0000-4000-8000-0000000000a1', 'b8081000-0000-4000-8000-000000000004', 'Sofa', 1, 'Sofa A');
INSERT INTO public.project_ffe_items (id, project_id, name, sort_order, doc_code) VALUES
  ('b8083000-0000-4000-8000-0000000000a2', 'b8081000-0000-4000-8000-000000000004', 'Bench', 2, E'Bench\r\nB');
INSERT INTO public.project_ffe_items (id, project_id, name, sort_order, doc_code) VALUES
  ('b8083000-0000-4000-8000-0000000000a3', 'b8081000-0000-4000-8000-000000000004', 'Sofa twin', 3, E'sofa\u2029a');
INSERT INTO public.project_ffe_items (id, project_id, name, sort_order) VALUES
  ('b8083000-0000-4000-8000-0000000000a4', 'b8081000-0000-4000-8000-000000000004', 'Rug', 4);
UPDATE public.project_ffe_items
SET removed_at = now(), removed_by = 'b8080000-0000-4000-8000-000000000001', removal_reason = 'not needed'
WHERE id = 'b8083000-0000-4000-8000-0000000000a4';

-- ── line breaks inside a label (SQ-1121) ───────────────────────────────────
SELECT is(
  (SELECT doc_code FROM public.project_ffe_items WHERE id = 'b8083000-0000-4000-8000-0000000000a2'),
  'Bench B',
  'an item entering with a line break in its label keeps it on one line'
);
SELECT is(
  (SELECT doc_code FROM public.project_ffe_items WHERE id = 'b8083000-0000-4000-8000-0000000000a3'),
  '001',
  'an entering label that is a taken one across a line break gets the next label'
);

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"b8080000-0000-4000-8000-000000000001","role":"authenticated"}';
SELECT throws_ok(
  $$ SELECT public.set_project_ffe_item_label('b8083000-0000-4000-8000-0000000000a2', E'Sofa\nA') $$,
  '23505',
  'Another item in this job already uses Sofa A.',
  'an edit to a taken label across a line break is refused'
);
SELECT is(
  (public.set_project_ffe_item_label('b8083000-0000-4000-8000-0000000000a2', E'Bench\u2028\r\nC\n')).doc_code,
  'Bench C',
  'the writer makes a run of line breaks one space and trims'
);
SELECT is(
  (public.set_project_ffe_item_label('b8083000-0000-4000-8000-0000000000a2', E'\r\n\u2028')).doc_code,
  '003',
  'a label of line breaks alone is blank, so it gets the next automatic label (the removed 002 still counts)'
);

SELECT lives_ok(
  $$ SELECT public.restore_project_selection('b8083000-0000-4000-8000-0000000000a4') $$,
  'restore_project_selection restores under the job label lock'
);
RESET ROLE;
SELECT is(
  (SELECT doc_code FROM public.project_ffe_items
   WHERE id = 'b8083000-0000-4000-8000-0000000000a4' AND removed_at IS NULL),
  '002',
  'the restored item keeps its label'
);

-- ── backfill ───────────────────────────────────────────────────────────────
-- Commit-time checks run now (as a COMMIT would), which leaves no pending
-- trigger events, so the table can be altered. Then back to deferred: the
-- thread-primary AFTER trigger must run before the deferred consistency check.
-- The ROLLBACK at the end turns the trigger back on.
SET CONSTRAINTS ALL IMMEDIATE;
SET CONSTRAINTS ALL DEFERRED;
ALTER TABLE public.project_ffe_items DISABLE TRIGGER zz_ffe_assign_item_label_trg;
-- A job from before 00808 can hold twin labels (proposal twins carried by
-- activation). The index is set aside to stage them, then rebuilt from its
-- own definition.
CREATE TEMP TABLE label_index AS
  SELECT pg_get_indexdef('public.project_ffe_items_label_unique'::regclass) AS def;
DROP INDEX public.project_ffe_items_label_unique;

INSERT INTO public.project_ffe_items (id, project_id, project_room_id, assignment_scope, name, sort_order, created_at, doc_code) VALUES
  ('b8084000-0000-4000-8000-000000000005', 'b8081000-0000-4000-8000-000000000002', NULL, 'unassigned', 'Existing', 9, '2026-01-01 09:00+00', '002'),
  ('b8084000-0000-4000-8000-000000000001', 'b8081000-0000-4000-8000-000000000002', NULL, 'unassigned', 'First', 0, '2026-01-01 10:00+00', NULL),
  ('b8084000-0000-4000-8000-000000000002', 'b8081000-0000-4000-8000-000000000002', NULL, 'unassigned', 'Later twin', 1, '2026-01-01 12:00+00', NULL),
  ('b8084000-0000-4000-8000-000000000003', 'b8081000-0000-4000-8000-000000000002', NULL, 'unassigned', 'Earlier twin', 1, '2026-01-01 11:00+00', NULL),
  ('b8084000-0000-4000-8000-000000000004', 'b8081000-0000-4000-8000-000000000002', 'b8082000-0000-4000-8000-000000000005', 'room', 'Rug', 2, '2026-01-01 10:00+00', NULL),
  ('b8084000-0000-4000-8000-000000000007', 'b8081000-0000-4000-8000-000000000002', NULL, 'unassigned', 'Blank', 3, '2026-01-01 10:00+00', ' '),
  ('b8084000-0000-4000-8000-000000000008', 'b8081000-0000-4000-8000-000000000002', 'b8082000-0000-4000-8000-000000000005', 'room', 'Sofa', 5, '2026-01-01 10:00+00', 'LR-04'),
  ('b8084000-0000-4000-8000-000000000009', 'b8081000-0000-4000-8000-000000000002', 'b8082000-0000-4000-8000-000000000005', 'room', 'Sofa, same label', 5, '2026-01-01 11:00+00', ' lr-04'),
  ('b8084000-0000-4000-8000-000000000010', 'b8081000-0000-4000-8000-000000000002', NULL, 'unassigned', 'Existing, same label', 10, '2026-01-01 10:00+00', '002');
INSERT INTO public.project_ffe_items (id, project_id, name, sort_order, doc_code, removed_at, removed_by, removal_reason)
VALUES ('b8084000-0000-4000-8000-000000000006', 'b8081000-0000-4000-8000-000000000002', 'Removed', 4, NULL,
        now(), 'b8080000-0000-4000-8000-000000000001', 'not needed');

-- Building an index needs no pending trigger events either.
SET CONSTRAINTS ALL IMMEDIATE;
SET CONSTRAINTS ALL DEFERRED;
SELECT throws_ok(
  (SELECT def FROM label_index),
  '23505',
  'could not create unique index "project_ffe_items_label_unique"',
  'the unique index cannot build over twin labels'
);
SELECT is(public._ffe_backfill_item_labels(), 7,
  'the backfill labels the 5 live items without a label and the 2 later twins');
SELECT is(
  ARRAY(SELECT COALESCE(doc_code, '<null>') FROM public.project_ffe_items
        WHERE project_id = 'b8081000-0000-4000-8000-000000000002' ORDER BY id),
  ARRAY['003', '005', '004', 'LR-05', '002', '<null>', '006', 'LR-04', 'LR-06', '007'],
  'backfill follows sort_order then created_at; the existing 002 and LR-04 stay with their first holder, the later twins get the next label; the removed item is left alone'
);
SELECT is(public._ffe_backfill_item_labels(), 0, 'a second backfill labels nothing');
SELECT is(
  ARRAY(SELECT COALESCE(doc_code, '<null>') FROM public.project_ffe_items
        WHERE project_id = 'b8081000-0000-4000-8000-000000000002' ORDER BY id),
  ARRAY['003', '005', '004', 'LR-05', '002', '<null>', '006', 'LR-04', 'LR-06', '007'],
  'a second backfill changes no label'
);
SET CONSTRAINTS ALL IMMEDIATE;
SET CONSTRAINTS ALL DEFERRED;
SELECT lives_ok((SELECT def FROM label_index), 'the unique index builds over the backfilled job');

-- ── the index backstop (trigger still off) ─────────────────────────────────
SELECT throws_ok(
  $$ UPDATE public.project_ffe_items SET doc_code = ' lr-05'
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

SELECT * FROM finish();
ROLLBACK;
