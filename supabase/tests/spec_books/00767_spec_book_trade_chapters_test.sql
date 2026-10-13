-- ═══════════════════════════════════════════════════════════════════════════
-- 00767 — spec book chapters by trade (US-28 S7c, SQ-841, V20 U-Q18)
--
-- Needs a LOCAL database with 00767 applied. Runs in one transaction and
-- rolls back, so it is safe on the shared local stack.
--
-- Run:
--   psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 \
--     -f supabase/tests/spec_books/00767_spec_book_trade_chapters_test.sql
--
-- Covers:
--   1. a new book gets trade chapters in taxonomy order, and no room chapters;
--   2. lines file by category (system slug, label, a studio category and its
--      child, an unknown category); an uncategorised line goes to Unsorted;
--      a line added later files by trade; the room stays a fact on the line;
--   3. a category change refiles the line; Unsorted exists only while it holds
--      lines;
--   4. the re-file of a legacy room-chapter book, run twice, is idempotent;
--      an excluded room chapter's exclusion carries onto its lines;
--   5. an issued snapshot is unchanged and keeps its room grouping;
--   6. a studio's own chapters survive, with the line the studio put there;
--   7. cross-studio isolation is unchanged.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─── Fixture ────────────────────────────────────────────────────────────────
-- A = Leah's studio (owner ...0001). B = another studio (owner ...0002).

INSERT INTO auth.users (
  id, email, encrypted_password, email_confirmed_at, created_at, updated_at,
  instance_id, aud, role
)
VALUES
  ('76700000-0000-4000-8000-000000000001', 'trade-a@test.invalid', '', now(), now(), now(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('76700000-0000-4000-8000-000000000002', 'trade-b@test.invalid', '', now(), now(), now(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');

INSERT INTO public.profiles (id, email, full_name, created_at, updated_at)
VALUES
  ('76700000-0000-4000-8000-000000000001', 'trade-a@test.invalid', 'Leah Trade', now(), now()),
  ('76700000-0000-4000-8000-000000000002', 'trade-b@test.invalid', 'Jordan Other', now(), now())
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name;

INSERT INTO public.organizations (id, type, name, slug)
VALUES
  ('76700000-0000-4000-8000-0000000000a1', 'design_studio', 'Trade Studio A', 'trade-studio-a-00767'),
  ('76700000-0000-4000-8000-0000000000a2', 'design_studio', 'Trade Studio B', 'trade-studio-b-00767');
INSERT INTO public.organization_members (user_id, organization_id, role, status, joined_at)
VALUES
  ('76700000-0000-4000-8000-000000000001', '76700000-0000-4000-8000-0000000000a1', 'owner', 'active', now()),
  ('76700000-0000-4000-8000-000000000002', '76700000-0000-4000-8000-0000000000a2', 'owner', 'active', now());

-- P1 = new book (A). P2 = legacy room-chapter book (A). P3 = B's project.
INSERT INTO public.projects (id, name, designer_id, client_id, created_by)
VALUES
  ('76700000-0000-4000-8000-000000000101', 'Trade New Book', '76700000-0000-4000-8000-000000000001', NULL, '76700000-0000-4000-8000-000000000001'),
  ('76700000-0000-4000-8000-000000000102', 'Trade Legacy Book', '76700000-0000-4000-8000-000000000001', NULL, '76700000-0000-4000-8000-000000000001'),
  ('76700000-0000-4000-8000-000000000103', 'Trade Other Studio', '76700000-0000-4000-8000-000000000002', NULL, '76700000-0000-4000-8000-000000000002');
UPDATE public.projects SET studio_id = '76700000-0000-4000-8000-0000000000a1'
WHERE id IN ('76700000-0000-4000-8000-000000000101', '76700000-0000-4000-8000-000000000102');
UPDATE public.projects SET studio_id = '76700000-0000-4000-8000-0000000000a2'
WHERE id = '76700000-0000-4000-8000-000000000103';

INSERT INTO public.project_rooms (id, project_id, name, sort_order)
VALUES
  ('76700000-0000-4000-8000-000000000201', '76700000-0000-4000-8000-000000000101', 'Living Room', 0),
  ('76700000-0000-4000-8000-000000000202', '76700000-0000-4000-8000-000000000101', 'Bedroom', 1),
  ('76700000-0000-4000-8000-000000000203', '76700000-0000-4000-8000-000000000102', 'Hall', 0),
  ('76700000-0000-4000-8000-000000000204', '76700000-0000-4000-8000-000000000102', 'Garage', 1),
  ('76700000-0000-4000-8000-000000000205', '76700000-0000-4000-8000-000000000103', 'Other Room', 0);

-- Studio categories: A's own top-level category and a child of system
-- Lighting; B's private category, whose label A must never read.
INSERT INTO public.ffe_categories (id, slug, label, is_system, designer_id, parent_id, sort_order)
VALUES
  ('76700000-0000-4000-8000-000000000301', 'custom_built_ins', 'Custom Built-Ins', false, '76700000-0000-4000-8000-000000000001', NULL, 0),
  ('76700000-0000-4000-8000-000000000302', 'task_lamps', 'Task Lamps', false, '76700000-0000-4000-8000-000000000001',
    (SELECT id FROM public.ffe_categories WHERE is_system AND slug = 'lighting'), 0),
  ('76700000-0000-4000-8000-000000000303', 'b_secret', 'B Secret Label', false, '76700000-0000-4000-8000-000000000002', NULL, 0);

-- P1 lines, before its book exists.
INSERT INTO public.project_ffe_items (
  id, project_id, project_room_id, assignment_scope, name, doc_code, status,
  quantity, sort_order, ffe_category
)
VALUES
  ('76700000-0000-4000-8000-000000000501', '76700000-0000-4000-8000-000000000101', '76700000-0000-4000-8000-000000000201', 'room', 'Pendant',      'T-01', 'specified', 1, 0, 'lighting'),
  ('76700000-0000-4000-8000-000000000502', '76700000-0000-4000-8000-000000000101', '76700000-0000-4000-8000-000000000202', 'room', 'Lounge chair', 'T-02', 'specified', 1, 1, 'seating'),
  ('76700000-0000-4000-8000-000000000503', '76700000-0000-4000-8000-000000000101', '76700000-0000-4000-8000-000000000201', 'room', 'Print',        'T-03', 'specified', 1, 2, ' Art '),
  ('76700000-0000-4000-8000-000000000504', '76700000-0000-4000-8000-000000000101', '76700000-0000-4000-8000-000000000202', 'room', 'Reading lamp', 'T-04', 'specified', 1, 3, 'task_lamps'),
  ('76700000-0000-4000-8000-000000000505', '76700000-0000-4000-8000-000000000101', '76700000-0000-4000-8000-000000000201', 'room', 'Banquette',    'T-05', 'specified', 1, 4, 'custom_built_ins'),
  ('76700000-0000-4000-8000-000000000506', '76700000-0000-4000-8000-000000000101', '76700000-0000-4000-8000-000000000201', 'room', 'Shelving',     'T-06', 'specified', 1, 5, 'millwork'),
  ('76700000-0000-4000-8000-000000000507', '76700000-0000-4000-8000-000000000101', '76700000-0000-4000-8000-000000000202', 'room', 'Side piece',   'T-07', 'specified', 1, 6, 'b_secret'),
  ('76700000-0000-4000-8000-000000000508', '76700000-0000-4000-8000-000000000101', '76700000-0000-4000-8000-000000000201', 'room', 'Mystery A',    'T-08', 'specified', 1, 7, NULL),
  ('76700000-0000-4000-8000-000000000509', '76700000-0000-4000-8000-000000000101', '76700000-0000-4000-8000-000000000202', 'room', 'Mystery B',    'T-09', 'specified', 1, 8, '   ');

-- P2 lines (legacy book, built below by hand as 00380 would have).
INSERT INTO public.project_ffe_items (
  id, project_id, project_room_id, assignment_scope, name, doc_code, status,
  quantity, sort_order, ffe_category
)
VALUES
  ('76700000-0000-4000-8000-000000000511', '76700000-0000-4000-8000-000000000102', '76700000-0000-4000-8000-000000000203', 'room', 'Hall pendant',  'L-01', 'specified', 1, 0, 'lighting'),
  ('76700000-0000-4000-8000-000000000512', '76700000-0000-4000-8000-000000000102', '76700000-0000-4000-8000-000000000203', 'room', 'Hall unknown',  'L-02', 'specified', 1, 1, NULL),
  ('76700000-0000-4000-8000-000000000513', '76700000-0000-4000-8000-000000000102', '76700000-0000-4000-8000-000000000204', 'room', 'Garage bench',  'L-03', 'specified', 1, 0, 'seating'),
  ('76700000-0000-4000-8000-000000000514', '76700000-0000-4000-8000-000000000102', '76700000-0000-4000-8000-000000000203', 'room', 'Hall runner',   'L-04', 'specified', 1, 2, 'rugs'),
  ('76700000-0000-4000-8000-000000000515', '76700000-0000-4000-8000-000000000102', '76700000-0000-4000-8000-000000000203', 'room', 'Hall console',  'L-05', 'specified', 1, 3, 'tables');

-- P3 line (B).
INSERT INTO public.project_ffe_items (
  id, project_id, project_room_id, assignment_scope, name, doc_code, status,
  quantity, sort_order, ffe_category
)
VALUES
  ('76700000-0000-4000-8000-000000000521', '76700000-0000-4000-8000-000000000103', '76700000-0000-4000-8000-000000000205', 'room', 'Other chair', 'O-01', 'specified', 1, 0, 'seating');

-- The legacy book: two room chapters (Garage excluded by the studio), a
-- studio chapter holding one line the studio put there, and an empty studio
-- chapter. One line has no chapter.
INSERT INTO public.spec_books (id, project_id, title, template_id, created_by)
VALUES (
  '76700000-0000-4000-8000-000000000602',
  '76700000-0000-4000-8000-000000000102',
  'Trade Legacy Book — Spec Book',
  '8f6e2600-6f25-4f20-a63d-d68d49c35a01',
  '76700000-0000-4000-8000-000000000001'
);
INSERT INTO public.spec_book_chapters (id, spec_book_id, project_room_id, title, position, included)
VALUES
  ('76700000-0000-4000-8000-000000000701', '76700000-0000-4000-8000-000000000602', '76700000-0000-4000-8000-000000000203', 'Hall', 0, true),
  ('76700000-0000-4000-8000-000000000702', '76700000-0000-4000-8000-000000000602', '76700000-0000-4000-8000-000000000204', 'Garage', 1, false),
  ('76700000-0000-4000-8000-000000000703', '76700000-0000-4000-8000-000000000602', NULL, 'Owner''s selections', 5, true),
  ('76700000-0000-4000-8000-000000000704', '76700000-0000-4000-8000-000000000602', NULL, 'Notes', 6, true);
-- The book was inserted after its lines, so no trigger made settings: these
-- are the 00380 room filings, plus the studio's move and one unfiled line.
INSERT INTO public.spec_book_item_settings (spec_book_id, ffe_item_id, chapter_id, position)
VALUES
  ('76700000-0000-4000-8000-000000000602', '76700000-0000-4000-8000-000000000511', '76700000-0000-4000-8000-000000000701', 0),
  ('76700000-0000-4000-8000-000000000602', '76700000-0000-4000-8000-000000000512', '76700000-0000-4000-8000-000000000701', 1),
  ('76700000-0000-4000-8000-000000000602', '76700000-0000-4000-8000-000000000513', '76700000-0000-4000-8000-000000000702', 0),
  ('76700000-0000-4000-8000-000000000602', '76700000-0000-4000-8000-000000000514', '76700000-0000-4000-8000-000000000703', 2),
  ('76700000-0000-4000-8000-000000000602', '76700000-0000-4000-8000-000000000515', NULL, 3);

-- An issued edition, frozen with the room grouping.
INSERT INTO public.spec_book_revisions (
  id, spec_book_id, revision_number, idempotency_key, issue_type, status,
  requested_audiences, template_snapshot, render_snapshot, snapshot_checksum,
  created_by, issued_at
)
VALUES (
  '76700000-0000-4000-8000-000000000801',
  '76700000-0000-4000-8000-000000000602',
  1,
  'trade-legacy-1',
  'full',
  'issued',
  ARRAY['client']::text[],
  '{"id":"8f6e2600-6f25-4f20-a63d-d68d49c35a01"}'::jsonb,
  jsonb_build_object(
    'contractVersion', 1,
    'chapters', jsonb_build_array(
      jsonb_build_object('id', '76700000-0000-4000-8000-000000000701',
        'projectRoomId', '76700000-0000-4000-8000-000000000203', 'title', 'Hall', 'position', 0),
      jsonb_build_object('id', '76700000-0000-4000-8000-000000000703',
        'projectRoomId', NULL, 'title', 'Owner''s selections', 'position', 5)
    ),
    'items', jsonb_build_array(jsonb_build_object(
      'ffeItemId', '76700000-0000-4000-8000-000000000511', 'name', 'Hall pendant',
      'room', jsonb_build_object('id', '76700000-0000-4000-8000-000000000203', 'name', 'Hall')
    ))
  ),
  repeat('c', 64),
  '76700000-0000-4000-8000-000000000001',
  now()
);
INSERT INTO public.spec_book_revision_items (
  revision_id, ffe_item_id, item_type, document_code, chapter_position,
  item_position, item_snapshot, content_hash
)
VALUES (
  '76700000-0000-4000-8000-000000000801',
  '76700000-0000-4000-8000-000000000511',
  'fixed', 'L-01', 0, 0,
  '{"ffeItemId":"76700000-0000-4000-8000-000000000511","name":"Hall pendant","room":{"name":"Hall"}}'::jsonb,
  repeat('d', 64)
);

-- B's book exists already.
INSERT INTO public.spec_books (id, project_id, title, template_id, created_by)
VALUES (
  '76700000-0000-4000-8000-000000000603',
  '76700000-0000-4000-8000-000000000103',
  'Trade Other Studio — Spec Book',
  '8f6e2600-6f25-4f20-a63d-d68d49c35a01',
  '76700000-0000-4000-8000-000000000002'
);
SELECT public._spec_book_refile('76700000-0000-4000-8000-000000000603', NULL);
INSERT INTO public.spec_book_item_settings (spec_book_id, ffe_item_id, chapter_id, position)
VALUES (
  '76700000-0000-4000-8000-000000000603',
  '76700000-0000-4000-8000-000000000521',
  public._spec_book_trade_chapter('76700000-0000-4000-8000-000000000603', 'seating'),
  0
);

CREATE OR REPLACE FUNCTION pg_temp.as_user(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', p_user_id::text, 'role', 'authenticated')::text,
    true
  );
  EXECUTE 'SET LOCAL ROLE authenticated';
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.as_postgres()
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claims', NULL, true);
END;
$$;
GRANT EXECUTE ON FUNCTION pg_temp.as_postgres() TO PUBLIC;

-- The trade chapter a line is filed in ('-' when it has none, '!studio' for
-- a chapter with neither room nor trade).
CREATE OR REPLACE FUNCTION pg_temp.line_trade(p_ffe_item_id uuid)
RETURNS text
LANGUAGE sql
AS $$
  SELECT COALESCE(c.trade, CASE WHEN c.id IS NULL THEN '-' WHEN c.project_room_id IS NULL THEN '!studio' ELSE '!room' END)
  FROM public.spec_book_item_settings s
  LEFT JOIN public.spec_book_chapters c ON c.id = s.chapter_id
  WHERE s.ffe_item_id = p_ffe_item_id;
$$;

-- ─── 1 + 2. A new book: trade chapters in taxonomy order; lines file by trade
DO $$
DECLARE
  v_book public.spec_books;
  v_titles text[];
  v_trades text[];
  v_count integer;
BEGIN
  PERFORM pg_temp.as_user('76700000-0000-4000-8000-000000000001');
  v_book := public.ensure_project_spec_book('76700000-0000-4000-8000-000000000101');

  -- Leah reads her chapters, trade key included, through RLS.
  SELECT array_agg(title ORDER BY position, title), array_agg(trade ORDER BY position, title)
    INTO v_titles, v_trades
  FROM public.spec_book_chapters
  WHERE spec_book_id = v_book.id;
  PERFORM pg_temp.as_postgres();

  ASSERT v_titles = ARRAY['Seating','Lighting','Art','B Secret','Custom Built-Ins','Millwork','Unsorted'],
    format('1: chapters in taxonomy order, Unsorted last; got %s', v_titles);
  ASSERT v_trades = ARRAY['seating','lighting','art','b_secret','custom_built_ins','millwork','unsorted'],
    format('1: trade keys; got %s', v_trades);
  ASSERT (
    SELECT array_agg(position ORDER BY position, title) = ARRAY[10,30,80,1000,1000,1000,2147483647]
    FROM public.spec_book_chapters WHERE spec_book_id = v_book.id
  ), '1: system trades take their taxonomy sort_order; others 1000; Unsorted 2147483647';
  ASSERT NOT EXISTS (
    SELECT 1 FROM public.spec_book_chapters
    WHERE spec_book_id = v_book.id AND project_room_id IS NOT NULL
  ), '1: a new book makes no room chapters, though the project has rooms';

  ASSERT pg_temp.line_trade('76700000-0000-4000-8000-000000000501') = 'lighting', '2: system slug';
  ASSERT pg_temp.line_trade('76700000-0000-4000-8000-000000000502') = 'seating', '2: system slug';
  ASSERT pg_temp.line_trade('76700000-0000-4000-8000-000000000503') = 'art', '2: label match, trimmed and case-folded';
  ASSERT pg_temp.line_trade('76700000-0000-4000-8000-000000000504') = 'lighting',
    '2: a studio child category files under its top-level system trade';
  ASSERT pg_temp.line_trade('76700000-0000-4000-8000-000000000505') = 'custom_built_ins',
    '2: a studio top-level category is its own trade';
  ASSERT pg_temp.line_trade('76700000-0000-4000-8000-000000000506') = 'millwork',
    '2: a category outside the taxonomy keeps a chapter of its own';
  ASSERT pg_temp.line_trade('76700000-0000-4000-8000-000000000508') = 'unsorted', '2: NULL category goes to Unsorted';
  ASSERT pg_temp.line_trade('76700000-0000-4000-8000-000000000509') = 'unsorted', '2: blank category goes to Unsorted';
  ASSERT (
    SELECT title FROM public.spec_book_chapters
    WHERE spec_book_id = v_book.id AND trade = 'custom_built_ins'
  ) = 'Custom Built-Ins', '2: a studio category chapter takes its label';

  -- The room stays a fact on the line, in the working row and the snapshot;
  -- the snapshot names the line's chapter and its hash excludes it.
  ASSERT (
    SELECT project_room_id FROM public.project_ffe_items
    WHERE id = '76700000-0000-4000-8000-000000000502'
  ) = '76700000-0000-4000-8000-000000000202', '2: project_room_id unchanged';
  ASSERT (
    SELECT bool_and(
      cur.item_snapshot#>>'{room,name}' = r.name
      AND (cur.item_snapshot->>'chapterId')::uuid = s.chapter_id
      AND cur.content_hash = encode(extensions.digest(
        public._spec_book_canonical_json(cur.item_snapshot - 'chapterId'), 'sha256'), 'hex')
    ) AND count(*) = 9
    FROM public._spec_book_current_item_snapshots(v_book.id) cur
    JOIN public.project_ffe_items i ON i.id = cur.ffe_item_id
    JOIN public.project_rooms r ON r.id = i.project_room_id
    JOIN public.spec_book_item_settings s ON s.ffe_item_id = cur.ffe_item_id
  ), '2: snapshot carries room and chapterId; content_hash excludes chapterId';
  ASSERT (
    SELECT array_agg(chapter_position ORDER BY chapter_position, item_position, ffe_item_id)
      = ARRAY[10,30,30,80,1000,1000,1000,2147483647,2147483647]
    FROM public._spec_book_current_item_snapshots(v_book.id)
  ), '2: snapshot orders by trade chapter position';

  -- ensure again: nothing new.
  SELECT count(*) INTO v_count FROM public.spec_book_chapters WHERE spec_book_id = v_book.id;
  PERFORM pg_temp.as_user('76700000-0000-4000-8000-000000000001');
  PERFORM public.ensure_project_spec_book('76700000-0000-4000-8000-000000000101');
  PERFORM pg_temp.as_postgres();
  ASSERT (SELECT count(*) FROM public.spec_book_chapters WHERE spec_book_id = v_book.id) = v_count,
    '1: ensure is idempotent';

  -- A line added once the book exists files by trade through the trigger.
  INSERT INTO public.project_ffe_items (
    id, project_id, project_room_id, assignment_scope, name, doc_code, status,
    quantity, sort_order, ffe_category
  )
  VALUES (
    '76700000-0000-4000-8000-000000000510', '76700000-0000-4000-8000-000000000101',
    '76700000-0000-4000-8000-000000000201', 'room', 'Runner', 'T-10', 'specified', 1, 9, 'rugs'
  );
  ASSERT pg_temp.line_trade('76700000-0000-4000-8000-000000000510') = 'rugs', '2: a new line files by trade';
  ASSERT (
    SELECT position FROM public.spec_book_chapters WHERE spec_book_id = v_book.id AND trade = 'rugs'
  ) = 70, '2: a trade chapter made on demand takes its taxonomy position';
END;
$$;

-- ─── 3. A category change refiles the line; Unsorted only while it holds lines
DO $$
DECLARE
  v_book_id uuid := (SELECT id FROM public.spec_books WHERE project_id = '76700000-0000-4000-8000-000000000101');
  v_unsorted uuid;
BEGIN
  UPDATE public.project_ffe_items SET ffe_category = 'seating'
  WHERE id = '76700000-0000-4000-8000-000000000501';
  ASSERT pg_temp.line_trade('76700000-0000-4000-8000-000000000501') = 'seating',
    '3: lighting -> seating refiles the line';
  ASSERT EXISTS (
    SELECT 1 FROM public.spec_book_chapters WHERE spec_book_id = v_book_id AND trade = 'lighting'
  ), '3: a trade chapter stays when a line leaves it';

  SELECT id INTO v_unsorted FROM public.spec_book_chapters
  WHERE spec_book_id = v_book_id AND trade = 'unsorted';
  UPDATE public.project_ffe_items SET ffe_category = 'tables'
  WHERE id = '76700000-0000-4000-8000-000000000508';
  ASSERT pg_temp.line_trade('76700000-0000-4000-8000-000000000508') = 'tables', '3: NULL -> tables refiles';
  ASSERT EXISTS (SELECT 1 FROM public.spec_book_chapters WHERE id = v_unsorted),
    '3: Unsorted stays while it still holds a line';

  UPDATE public.project_ffe_items SET ffe_category = 'Storage'
  WHERE id = '76700000-0000-4000-8000-000000000509';
  ASSERT pg_temp.line_trade('76700000-0000-4000-8000-000000000509') = 'storage', '3: blank -> Storage refiles';
  ASSERT NOT EXISTS (SELECT 1 FROM public.spec_book_chapters WHERE id = v_unsorted),
    '3: Unsorted goes once it holds no line';

  UPDATE public.project_ffe_items SET ffe_category = NULL
  WHERE id = '76700000-0000-4000-8000-000000000506';
  ASSERT pg_temp.line_trade('76700000-0000-4000-8000-000000000506') = 'unsorted',
    '3: clearing the category returns the line to a new Unsorted chapter';

  -- A line leaving the book removes its setting (by cascade when the line is
  -- deleted); the same delete trigger fires either way.
  DELETE FROM public.spec_book_item_settings
  WHERE spec_book_id = v_book_id AND ffe_item_id = '76700000-0000-4000-8000-000000000506';
  ASSERT NOT EXISTS (
    SELECT 1 FROM public.spec_book_chapters WHERE spec_book_id = v_book_id AND trade = 'unsorted'
  ), '3: removing the last Unsorted line removes Unsorted';

  -- An unrelated edit does not refile.
  UPDATE public.spec_book_item_settings s
     SET chapter_id = (SELECT id FROM public.spec_book_chapters WHERE spec_book_id = v_book_id AND trade = 'art')
   WHERE s.ffe_item_id = '76700000-0000-4000-8000-000000000502';
  UPDATE public.project_ffe_items SET name = 'Lounge chair, oak'
  WHERE id = '76700000-0000-4000-8000-000000000502';
  ASSERT pg_temp.line_trade('76700000-0000-4000-8000-000000000502') = 'art',
    '3: a non-category edit leaves a studio''s move between trade chapters alone';
END;
$$;

-- ─── 4 + 5 + 6. The legacy book re-files, idempotently; issued edition intact
DO $$
DECLARE
  v_book_id uuid := '76700000-0000-4000-8000-000000000602';
  v_revision_before text;
  v_items_before text;
  v_hash_before text;
  v_working_before text;
  v_moved integer;
BEGIN
  SELECT md5(r::text) INTO v_revision_before
  FROM public.spec_book_revisions r WHERE r.id = '76700000-0000-4000-8000-000000000801';
  SELECT md5(string_agg(ri::text, '|' ORDER BY ri.id)) INTO v_items_before
  FROM public.spec_book_revision_items ri WHERE ri.revision_id = '76700000-0000-4000-8000-000000000801';
  SELECT content_hash INTO v_hash_before
  FROM public._spec_book_current_item_snapshots(v_book_id)
  WHERE ffe_item_id = '76700000-0000-4000-8000-000000000511';

  v_moved := public._spec_book_refile(v_book_id, NULL);
  ASSERT v_moved = 4, format('4: four room/unfiled lines re-filed; got %s', v_moved);

  ASSERT pg_temp.line_trade('76700000-0000-4000-8000-000000000511') = 'lighting', '4: Hall pendant -> Lighting';
  ASSERT pg_temp.line_trade('76700000-0000-4000-8000-000000000512') = 'unsorted', '4: uncategorised -> Unsorted';
  ASSERT pg_temp.line_trade('76700000-0000-4000-8000-000000000513') = 'seating', '4: Garage bench -> Seating';
  ASSERT pg_temp.line_trade('76700000-0000-4000-8000-000000000515') = 'tables', '4: unfiled line -> Tables';
  ASSERT (
    SELECT NOT included FROM public.spec_book_item_settings
    WHERE ffe_item_id = '76700000-0000-4000-8000-000000000513'
  ), '4: a line from the excluded Garage chapter stays out of the book';
  ASSERT (
    SELECT included FROM public.spec_book_item_settings
    WHERE ffe_item_id = '76700000-0000-4000-8000-000000000511'
  ), '4: a line from an included room chapter stays in';
  ASSERT NOT EXISTS (
    SELECT 1 FROM public._spec_book_current_item_snapshots(v_book_id)
    WHERE ffe_item_id = '76700000-0000-4000-8000-000000000513'
  ), '4: the next edition still leaves the Garage line out';
  ASSERT NOT EXISTS (
    SELECT 1 FROM public.spec_book_chapters
    WHERE spec_book_id = v_book_id AND project_room_id IS NOT NULL
  ), '4: empty room chapters are removed';

  -- 6. The studio's chapters survive, the filled one with its line.
  ASSERT pg_temp.line_trade('76700000-0000-4000-8000-000000000514') = '!studio',
    '6: the line the studio placed stays in its chapter';
  ASSERT (
    SELECT count(*) FROM public.spec_book_chapters
    WHERE id IN ('76700000-0000-4000-8000-000000000703', '76700000-0000-4000-8000-000000000704')
  ) = 2, '6: both studio chapters survive, the empty one included';

  -- 5. The issued edition is byte-identical and keeps its room grouping.
  ASSERT (
    SELECT md5(r::text) FROM public.spec_book_revisions r
    WHERE r.id = '76700000-0000-4000-8000-000000000801'
  ) = v_revision_before, '5: issued revision row unchanged';
  ASSERT (
    SELECT md5(string_agg(ri::text, '|' ORDER BY ri.id)) FROM public.spec_book_revision_items ri
    WHERE ri.revision_id = '76700000-0000-4000-8000-000000000801'
  ) = v_items_before, '5: issued revision items unchanged';
  ASSERT (
    SELECT render_snapshot#>>'{chapters,0,projectRoomId}' FROM public.spec_book_revisions
    WHERE id = '76700000-0000-4000-8000-000000000801'
  ) = '76700000-0000-4000-8000-000000000203', '5: the past edition still groups by its room';
  ASSERT (
    SELECT content_hash FROM public._spec_book_current_item_snapshots(v_book_id)
    WHERE ffe_item_id = '76700000-0000-4000-8000-000000000511'
  ) = v_hash_before, '5: re-filing alone does not change a line''s content hash';

  -- 4. Run twice: nothing moves and nothing changes.
  SELECT md5(
    (SELECT string_agg(c::text, '|' ORDER BY c.id) FROM public.spec_book_chapters c WHERE c.spec_book_id = v_book_id)
    || '#' ||
    (SELECT string_agg(s::text, '|' ORDER BY s.id) FROM public.spec_book_item_settings s WHERE s.spec_book_id = v_book_id)
  ) INTO v_working_before;
  v_moved := public._spec_book_refile(v_book_id, NULL);
  ASSERT v_moved = 0, format('4: second re-file moves nothing; got %s', v_moved);
  PERFORM pg_temp.as_user('76700000-0000-4000-8000-000000000001');
  PERFORM public.ensure_project_spec_book('76700000-0000-4000-8000-000000000102');
  PERFORM pg_temp.as_postgres();
  ASSERT md5(
    (SELECT string_agg(c::text, '|' ORDER BY c.id) FROM public.spec_book_chapters c WHERE c.spec_book_id = v_book_id)
    || '#' ||
    (SELECT string_agg(s::text, '|' ORDER BY s.id) FROM public.spec_book_item_settings s WHERE s.spec_book_id = v_book_id)
  ) = v_working_before, '4: a second re-file and an ensure leave chapters and settings unchanged';

  -- 6. A category change does not pull a line out of a studio chapter.
  UPDATE public.project_ffe_items SET ffe_category = 'art'
  WHERE id = '76700000-0000-4000-8000-000000000514';
  ASSERT pg_temp.line_trade('76700000-0000-4000-8000-000000000514') = '!studio',
    '6: a category change leaves a line in a studio chapter';

  -- A room chapter and a trade key cannot share a row.
  BEGIN
    INSERT INTO public.spec_book_chapters (spec_book_id, project_room_id, trade, title)
    VALUES (v_book_id, '76700000-0000-4000-8000-000000000203', 'lighting_x', 'Mixed');
    RAISE EXCEPTION 'mixed room/trade chapter was accepted';
  EXCEPTION WHEN check_violation THEN
    NULL;
  END;
END;
$$;

-- ─── 7. Cross-studio isolation is unchanged ─────────────────────────────────
DO $$
DECLARE
  v_book_a uuid := (SELECT id FROM public.spec_books WHERE project_id = '76700000-0000-4000-8000-000000000101');
  v_raised boolean;
  v_rows integer;
BEGIN
  -- Leah's line in B's private category never reads B's label.
  ASSERT (
    SELECT title FROM public.spec_book_chapters WHERE spec_book_id = v_book_a AND trade = 'b_secret'
  ) = 'B Secret', '7: another studio''s category label never titles a chapter';

  PERFORM pg_temp.as_user('76700000-0000-4000-8000-000000000002');
  ASSERT (SELECT count(*) FROM public.spec_book_chapters WHERE spec_book_id = v_book_a) = 0,
    '7: B reads none of A''s chapters';
  ASSERT (SELECT count(*) FROM public.spec_book_item_settings WHERE spec_book_id = v_book_a) = 0,
    '7: B reads none of A''s settings';
  UPDATE public.spec_book_chapters SET trade = 'hijack' WHERE spec_book_id = v_book_a;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  ASSERT v_rows = 0, '7: B cannot write A''s chapters';
  ASSERT (SELECT count(*) FROM public.spec_book_chapters
          WHERE spec_book_id = '76700000-0000-4000-8000-000000000603') = 1,
    '7: B reads its own trade chapter';

  v_raised := false;
  BEGIN
    PERFORM public.ensure_project_spec_book('76700000-0000-4000-8000-000000000101');
  EXCEPTION WHEN insufficient_privilege THEN
    v_raised := true;
  END;
  ASSERT v_raised, '7: B cannot ensure A''s book';

  v_raised := false;
  BEGIN
    PERFORM public._spec_book_refile(v_book_a, NULL);
  EXCEPTION WHEN insufficient_privilege THEN
    v_raised := true;
  END;
  ASSERT v_raised, '7: _spec_book_refile is not callable by authenticated';

  v_raised := false;
  BEGIN
    PERFORM public._spec_book_trade_chapter(v_book_a, 'hijack');
  EXCEPTION WHEN insufficient_privilege THEN
    v_raised := true;
  END;
  ASSERT v_raised, '7: _spec_book_trade_chapter is not callable by authenticated';

  v_raised := false;
  BEGIN
    PERFORM * FROM public._spec_book_trade_for('76700000-0000-4000-8000-000000000101', 'b_secret');
  EXCEPTION WHEN insufficient_privilege THEN
    v_raised := true;
  END;
  ASSERT v_raised, '7: _spec_book_trade_for is not callable by authenticated';
  PERFORM pg_temp.as_postgres();

  PERFORM pg_temp.as_user('76700000-0000-4000-8000-000000000001');
  v_raised := false;
  BEGIN
    PERFORM public.ensure_project_spec_book('76700000-0000-4000-8000-000000000103');
  EXCEPTION WHEN insufficient_privilege THEN
    v_raised := true;
  END;
  ASSERT v_raised, '7: A cannot ensure B''s book';
  ASSERT (SELECT count(*) FROM public.spec_book_chapters
          WHERE spec_book_id = '76700000-0000-4000-8000-000000000603') = 0,
    '7: A reads none of B''s chapters';
  PERFORM pg_temp.as_postgres();

  ASSERT NOT has_function_privilege('anon', 'public._spec_book_refile(uuid,uuid[])', 'EXECUTE')
     AND NOT has_function_privilege('anon', 'public._spec_book_trade_chapter(uuid,text)', 'EXECUTE')
     AND NOT has_function_privilege('anon', 'public._spec_book_trade_for(uuid,text)', 'EXECUTE')
     AND NOT has_function_privilege('authenticated', 'public.spec_book_refile_ffe_line()', 'EXECUTE')
     AND NOT has_function_privilege('authenticated', 'public.spec_book_prune_unsorted_chapter()', 'EXECUTE'),
    '7: helpers and trigger functions are closed to anon and authenticated';
END;
$$;

\echo '00767_spec_book_trade_chapters_test: trade chapters in taxonomy order; filing, refiling and Unsorted; idempotent re-file; issued edition unchanged; studio chapters kept; studios isolated'
ROLLBACK;
