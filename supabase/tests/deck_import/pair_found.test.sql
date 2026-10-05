-- Bring in a Deck — a link pairs onto a picture already found (00688, SQ-384).
--   0  pairable: an unkept picture found by words or look is listed with its
--      state, caption and slide picture count; kept, reference and
--      link-found pictures are not
--   1  a notes link onto a words-found unkept picture: paired, found_by link,
--      the link's evidence present, the words candidate kept after it, the
--      link row gone
--   2  a kept or reference picture: refused, nothing changes
--   3  re-run: the same pair again is refused and changes nothing
--   4  never lower a band: a strong look candidate stays first
--   5  a link with no candidate never displaces the words result
--   6  lock order: the import row, then the pieces (as 00687)
-- Run after a fresh reset:
--   psql 'postgresql://postgres:postgres@127.0.0.1:54322/postgres' \
--     -v ON_ERROR_STOP=1 -f supabase/tests/deck_import/pair_found.test.sql

BEGIN;

SET LOCAL statement_timeout = '30s';

-- ── Fixtures ────────────────────────────────────────────────────────────────

INSERT INTO auth.users (
  id, email, encrypted_password, email_confirmed_at, created_at, updated_at,
  instance_id, aud, role
)
VALUES
  ('d6880000-0000-4000-8000-000000000001', 'pair-found@test.invalid', '', now(), now(), now(),
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');

INSERT INTO public.profiles (id, email, full_name, created_at, updated_at)
VALUES
  ('d6880000-0000-4000-8000-000000000001', 'pair-found@test.invalid', 'Pair Found', now(), now())
ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email, full_name = EXCLUDED.full_name;

INSERT INTO public.projects (id, designer_id, client_id, created_by, name, status, studio_id)
VALUES
  ('d6882000-0000-4000-8000-000000000001', 'd6880000-0000-4000-8000-000000000001', NULL,
   'd6880000-0000-4000-8000-000000000001', 'Pair found P', 'active', NULL);

INSERT INTO public.proposal_boards (
  id, proposal_id, project_id, name, canvas_width, canvas_height,
  background_color, sections, status, sort_order
) VALUES
  ('d6883000-0000-4000-8000-000000000001', NULL, 'd6882000-0000-4000-8000-000000000001',
   'Pair found board', 1200, 800, '#FAF8F5', '[]'::jsonb, 'active', 0);

-- The crops point at a storage path no live board owns; the media-reference
-- guard (not under test here) is bypassed for these fixture rows only.
SET LOCAL session_replication_role = replica;
INSERT INTO public.proposal_board_items (
  id, board_id, type, x, y, width, height, z_index, rotation, content, data, image_url
)
SELECT ('d6884000-0000-4000-8000-00000000000' || n)::uuid, 'd6883000-0000-4000-8000-000000000001',
       'image', 10 * n, 10, 200, 200, n, 0, NULL, '{}'::jsonb,
       'https://example.supabase.co/storage/v1/object/public/proposal-mood-boards/x/boards/y/crop' || n || '.jpg'
FROM generate_series(1, 6) AS n;
SET LOCAL session_replication_role = origin;

INSERT INTO public.board_deck_imports (id, board_id, created_by, source_format, file_sha256, file_name, links, status)
VALUES
  ('d6887000-0000-4000-8000-000000000001', 'd6883000-0000-4000-8000-000000000001',
   'd6880000-0000-4000-8000-000000000001', 'deck', repeat('e1', 32), 'PairFound.pptx', '{}'::jsonb, 'resolving');

-- One picture per slide (slides 0..5) and one notes link row per slide.
--   P1 found by words · P2 kept · P3 reference · P4 found by look (strong)
--   P5 found by words, its link did not resolve · P6 already found by a link
INSERT INTO public.board_deck_import_items (
  id, import_id, element_key, board_item_id, slide_index, role, extracted, state, found_by, candidates
) VALUES
  ('d6888000-0000-4000-8000-0000000000a1', 'd6887000-0000-4000-8000-000000000001', 's0:pic',
   'd6884000-0000-4000-8000-000000000001', 0, 'product',
   '{"caption":{"name":"Reading Chair","text":"Reading Chair"}}'::jsonb, 'found', 'words',
   '[{"source":"words","product_id":"d6886000-0000-4000-8000-000000000001","band":"likely","rank":1,"evidence":{"score":0.8}}]'::jsonb),
  ('d6888000-0000-4000-8000-0000000000a2', 'd6887000-0000-4000-8000-000000000001', 's1:pic',
   'd6884000-0000-4000-8000-000000000002', 1, 'product', '{}'::jsonb, 'kept', 'words',
   '[{"source":"words","product_id":"d6886000-0000-4000-8000-000000000002","band":"likely","rank":1,"evidence":{}}]'::jsonb),
  ('d6888000-0000-4000-8000-0000000000a3', 'd6887000-0000-4000-8000-000000000001', 's2:pic',
   'd6884000-0000-4000-8000-000000000003', 2, 'product', '{}'::jsonb, 'reference', NULL, '[]'::jsonb),
  ('d6888000-0000-4000-8000-0000000000a4', 'd6887000-0000-4000-8000-000000000001', 's3:pic',
   'd6884000-0000-4000-8000-000000000004', 3, 'product', '{}'::jsonb, 'found', 'look',
   '[{"source":"look","product_id":"d6886000-0000-4000-8000-000000000004","band":"strong","rank":1,"evidence":{}}]'::jsonb),
  ('d6888000-0000-4000-8000-0000000000a5', 'd6887000-0000-4000-8000-000000000001', 's4:pic',
   'd6884000-0000-4000-8000-000000000005', 4, 'product', '{}'::jsonb, 'found', 'words',
   '[{"source":"words","product_id":"d6886000-0000-4000-8000-000000000005","band":"likely","rank":1,"evidence":{}}]'::jsonb),
  ('d6888000-0000-4000-8000-0000000000a6', 'd6887000-0000-4000-8000-000000000001', 's5:pic',
   'd6884000-0000-4000-8000-000000000006', 5, 'product', '{}'::jsonb, 'found', 'link',
   '[{"source":"link","band":"likely","rank":1,"extracted":{"name":"Earlier","source_url":"https://shop.example/earlier"},"evidence":{}}]'::jsonb);

INSERT INTO public.board_deck_import_items (
  id, import_id, element_key, board_item_id, slide_index, role, extracted, state, found_by, candidates
)
SELECT ('d6888000-0000-4000-8000-0000000000b' || n)::uuid, 'd6887000-0000-4000-8000-000000000001',
       'link:' || md5('https://shop.example/p/' || n), NULL, n - 1, 'product',
       jsonb_build_object('links', jsonb_build_array(jsonb_build_object(
         'url', 'https://shop.example/p/' || n, 'source', 'notes', 'on_picture', false)),
         'unpaired', true, 'deck_level', false),
       CASE WHEN n = 5 THEN 'not_found' ELSE 'found' END,
       CASE WHEN n = 5 THEN NULL ELSE 'link' END,
       CASE WHEN n = 5 THEN '[]'::jsonb ELSE jsonb_build_array(jsonb_build_object(
         'source', 'link', 'band', 'likely', 'rank', 1,
         'extracted', jsonb_build_object('name', 'Reading Chair', 'source_url', 'https://shop.example/p/' || n),
         'evidence', jsonb_build_object('page_read', true))) END
FROM generate_series(1, 6) AS n;

-- What the resolver sends: the link row's candidates plus its pairing evidence.
CREATE TEMP TABLE pair_ctx (k text PRIMARY KEY, payload jsonb) ON COMMIT DROP;
INSERT INTO pair_ctx (k, payload)
SELECT 'link' || n, jsonb_build_array(jsonb_build_object(
  'source', 'link', 'band', 'likely', 'rank', 1,
  'extracted', jsonb_build_object('name', 'Reading Chair', 'source_url', 'https://shop.example/p/' || n),
  'evidence', jsonb_build_object('page_read', true, 'paired_by', 'sole_picture')))
FROM generate_series(1, 6) AS n;

-- ── 0. Pairable pictures ────────────────────────────────────────────────────
DO $$
DECLARE
  pics jsonb;
  ids text[];
  p1 jsonb;
BEGIN
  pics := public.board_deck_import_pairable_pictures('d6887000-0000-4000-8000-000000000001');
  SELECT array_agg(value->>'item_id' ORDER BY value->>'item_id') INTO ids FROM jsonb_array_elements(pics);
  ASSERT ids = ARRAY['d6888000-0000-4000-8000-0000000000a1', 'd6888000-0000-4000-8000-0000000000a4',
                     'd6888000-0000-4000-8000-0000000000a5'],
    format('0: unkept words/look pictures are pairable; kept, reference, link-found are not: %s', ids);
  SELECT value INTO p1 FROM jsonb_array_elements(pics) WHERE value->>'item_id' = 'd6888000-0000-4000-8000-0000000000a1';
  ASSERT p1->>'state' = 'found', format('0: state returned: %s', p1);
  ASSERT (p1->>'slide_pictures')::int = 1, format('0: slide picture count: %s', p1);
  ASSERT p1->'caption'->'caption'->>'name' = 'Reading Chair', format('0: caption returned: %s', p1);
END $$;

-- ── 1. A notes link onto a words-found unkept picture ───────────────────────
DO $$
DECLARE
  v public.board_deck_import_items%ROWTYPE;
BEGIN
  ASSERT public.pair_board_deck_import_link('d6888000-0000-4000-8000-0000000000b1',
    'd6888000-0000-4000-8000-0000000000a1', (SELECT payload FROM pair_ctx WHERE k = 'link1')),
    '1: the pair is applied';
  SELECT * INTO v FROM public.board_deck_import_items WHERE id = 'd6888000-0000-4000-8000-0000000000a1';
  ASSERT v.state = 'found' AND v.found_by = 'link', format('1: found by link (got %s/%s)', v.state, v.found_by);
  ASSERT v.candidates->0->>'source' = 'link' AND (v.candidates->0->>'rank')::int = 1,
    format('1: the link candidate leads: %s', v.candidates);
  ASSERT v.candidates->0->'evidence'->>'paired_by' = 'sole_picture'
     AND v.candidates->0->'extracted'->>'source_url' = 'https://shop.example/p/1',
    format('1: the link evidence is present: %s', v.candidates);
  ASSERT v.candidates->1->>'source' = 'words'
     AND v.candidates->1->>'product_id' = 'd6886000-0000-4000-8000-000000000001'
     AND (v.candidates->1->>'rank')::int = 2 AND v.candidates->1->>'band' = 'likely',
    format('1: the words candidate stays, after the link, band unchanged: %s', v.candidates);
  ASSERT NOT EXISTS (SELECT 1 FROM public.board_deck_import_items WHERE id = 'd6888000-0000-4000-8000-0000000000b1'),
    '1: the link row is gone';
  INSERT INTO pair_ctx (k, payload) VALUES ('p1_after', to_jsonb(v));
END $$;

-- ── 2. Kept and reference pictures are refused ──────────────────────────────
DO $$
BEGIN
  ASSERT NOT public.pair_board_deck_import_link('d6888000-0000-4000-8000-0000000000b2',
    'd6888000-0000-4000-8000-0000000000a2', (SELECT payload FROM pair_ctx WHERE k = 'link2')),
    '2: a kept picture is refused';
  ASSERT (SELECT state || '/' || found_by || '/' || (candidates->0->>'source')
          FROM public.board_deck_import_items WHERE id = 'd6888000-0000-4000-8000-0000000000a2') = 'kept/words/words',
    '2: the kept picture is unchanged';
  ASSERT EXISTS (SELECT 1 FROM public.board_deck_import_items WHERE id = 'd6888000-0000-4000-8000-0000000000b2'),
    '2: the link row stays';
  ASSERT NOT public.pair_board_deck_import_link('d6888000-0000-4000-8000-0000000000b3',
    'd6888000-0000-4000-8000-0000000000a3', (SELECT payload FROM pair_ctx WHERE k = 'link3')),
    '2: a reference picture is refused';
  ASSERT (SELECT state FROM public.board_deck_import_items WHERE id = 'd6888000-0000-4000-8000-0000000000a3') = 'reference',
    '2: the reference picture is unchanged';
  ASSERT NOT public.pair_board_deck_import_link('d6888000-0000-4000-8000-0000000000b6',
    'd6888000-0000-4000-8000-0000000000a6', (SELECT payload FROM pair_ctx WHERE k = 'link6')),
    '2: a picture already found by a link keeps it';
END $$;

-- ── 3. Re-run changes nothing ───────────────────────────────────────────────
DO $$
DECLARE
  before jsonb := (SELECT payload FROM pair_ctx WHERE k = 'p1_after');
  after jsonb;
BEGIN
  ASSERT NOT public.pair_board_deck_import_link('d6888000-0000-4000-8000-0000000000b1',
    'd6888000-0000-4000-8000-0000000000a1', (SELECT payload FROM pair_ctx WHERE k = 'link1')),
    '3: the same pair again is refused';
  SELECT to_jsonb(item) INTO after FROM public.board_deck_import_items AS item
  WHERE id = 'd6888000-0000-4000-8000-0000000000a1';
  ASSERT after = before, format('3: the picture is unchanged: %s vs %s', after, before);
  ASSERT NOT (public.board_deck_import_pairable_pictures('d6887000-0000-4000-8000-000000000001')
    @> '[{"item_id":"d6888000-0000-4000-8000-0000000000a1"}]'), '3: the paired picture is no longer pairable';
END $$;

-- ── 4. A strong look candidate is never lowered or displaced ────────────────
DO $$
DECLARE
  v public.board_deck_import_items%ROWTYPE;
BEGIN
  ASSERT public.pair_board_deck_import_link('d6888000-0000-4000-8000-0000000000b4',
    'd6888000-0000-4000-8000-0000000000a4', (SELECT payload FROM pair_ctx WHERE k = 'link4')),
    '4: the pair is applied';
  SELECT * INTO v FROM public.board_deck_import_items WHERE id = 'd6888000-0000-4000-8000-0000000000a4';
  ASSERT v.candidates->0->>'source' = 'look' AND v.candidates->0->>'band' = 'strong'
     AND v.candidates->1->>'source' = 'link' AND (v.candidates->1->>'rank')::int = 2,
    format('4: strong look first, the link after it: %s', v.candidates);
  ASSERT v.found_by = 'look', format('4: found_by follows the top candidate (got %s)', v.found_by);
END $$;

-- ── 5. An unresolved link never displaces the words result ──────────────────
DO $$
BEGIN
  ASSERT NOT public.pair_board_deck_import_link('d6888000-0000-4000-8000-0000000000b5',
    'd6888000-0000-4000-8000-0000000000a5', '[]'::jsonb),
    '5: a pair with no link candidate is refused';
  ASSERT (SELECT found_by || '/' || jsonb_array_length(candidates)
          FROM public.board_deck_import_items WHERE id = 'd6888000-0000-4000-8000-0000000000a5') = 'words/1',
    '5: the words result stands';
  BEGIN
    PERFORM public.pair_board_deck_import_link('d6888000-0000-4000-8000-0000000000b5',
      'd6888000-0000-4000-8000-0000000000a5', '{}'::jsonb);
    RAISE EXCEPTION '5: non-array candidates must be refused';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
END $$;

-- ── 6. Lock order (00687): the import row, then the pieces ──────────────────
DO $$
DECLARE v_def text;
BEGIN
  v_def := pg_get_functiondef('public.pair_board_deck_import_link(uuid, uuid, jsonb)'::regprocedure);
  ASSERT v_def ~ 'board_deck_imports WHERE id = v_import_id FOR UPDATE;.*WHERE id = p_link_item_id FOR UPDATE;.*WHERE id = p_picture_item_id FOR UPDATE',
    '6: pair_board_deck_import_link locks import, then link, then picture';
END $$;

ROLLBACK;
