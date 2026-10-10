-- ═══════════════════════════════════════════════════════════════════════════
-- Line groups: a heading inside a room, the shower (00751; US-21 T-45, SQ-651)
--
-- CONTRACT §2 "00751"; direction.md D6 and Q9; scenario S3, the shower.
-- Anchors: project_line_groups, project_ffe_items.line_group_id and
-- set_line_group (00751); _spec_book_current_item_snapshots (00751, base
-- 00737:1047); ffe_line_stage (00736); can_buy_for_project (00702:60);
-- _ffe_require_studio_project (00717:75).
--
-- Named cases, each one DO block:
--   shower       a group "Primary bath shower" with 6 placeholder lines; the
--                lines keep their money, quantity, status, disposition and
--                stage; the group table has no money, stage or act column
--   hash         ungrouped lines keep their content_hash when a neighbour is
--                grouped; a grouped line prints lineGroup and its hash
--                changes; ungrouping restores the original hash
--   moves        {groupId} adds a line; moving a group's last lines elsewhere
--                deletes it; null ungroups and deletes the emptied group;
--                deleting a group ungroups its lines, never deletes them
--   refusals     another room, a removed line, another project's group, a
--                blank name, lines across projects, an empty list
--   rls          a client JWT reads 0 groups and cannot group; the studio
--                reads its groups and cannot write the table directly
--
-- Run:
--   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -X -q \
--     -v ON_ERROR_STOP=1 -f supabase/tests/ffe/pieces_line_groups_test.sql
-- The file runs in one transaction and rolls back.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

SET LOCAL statement_timeout = '60s';

-- ── Actors, projects, rooms, lines ────────────────────────────────────────
INSERT INTO auth.users (
  id, email, encrypted_password, email_confirmed_at, created_at, updated_at,
  instance_id, aud, role
) VALUES
  ('75100000-0000-4000-8000-000000000001', 'lg-designer@test.invalid', '', now(), now(), now(),
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('75100000-0000-4000-8000-000000000002', 'lg-client@test.invalid', '', now(), now(), now(),
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');

INSERT INTO public.profiles (id, email, full_name, is_designer, created_at, updated_at)
VALUES
  ('75100000-0000-4000-8000-000000000001', 'lg-designer@test.invalid', 'LG Designer', true, now(), now()),
  ('75100000-0000-4000-8000-000000000002', 'lg-client@test.invalid', 'LG Client', false, now(), now())
ON CONFLICT (id) DO UPDATE
SET email = EXCLUDED.email, full_name = EXCLUDED.full_name, is_designer = EXCLUDED.is_designer;

INSERT INTO public.projects (id, name, designer_id, client_id, created_by, status)
VALUES
  ('75110000-0000-4000-8000-000000000001', 'Line groups project',
   '75100000-0000-4000-8000-000000000001', '75100000-0000-4000-8000-000000000002',
   '75100000-0000-4000-8000-000000000001', 'active'),
  ('75110000-0000-4000-8000-000000000002', 'Other project',
   '75100000-0000-4000-8000-000000000001', NULL,
   '75100000-0000-4000-8000-000000000001', 'active');

INSERT INTO public.project_rooms (id, project_id, name, sort_order) VALUES
  ('75120000-0000-4000-8000-000000000001', '75110000-0000-4000-8000-000000000001', 'Primary Bath', 0),
  ('75120000-0000-4000-8000-000000000002', '75110000-0000-4000-8000-000000000001', 'Powder Room', 1),
  ('75120000-0000-4000-8000-000000000009', '75110000-0000-4000-8000-000000000002', 'Elsewhere', 0);

INSERT INTO public.vendors (id, name)
VALUES ('75130000-0000-4000-8000-000000000001', 'LG Plumbing Supply');

-- 01–06: the shower's six placeholder components (S3): no product, no maker,
-- no price. 07: the glass, a seventh placeholder added later. 08: the vanity,
-- a specced and priced line in the same room that stays ungrouped. 09: a
-- powder-room line. 10: a removed line. 11: a line in the other project.
INSERT INTO public.project_ffe_items (
  id, project_id, project_room_id, assignment_scope, name, doc_code, status, quantity,
  sort_order, unit_price_cents, vendor_id, currency
) VALUES
  ('75140000-0000-4000-8000-000000000001', '75110000-0000-4000-8000-000000000001',
   '75120000-0000-4000-8000-000000000001', 'room', 'Valve', 'PL-01', 'specified', 1, 0, NULL, NULL, 'USD'),
  ('75140000-0000-4000-8000-000000000002', '75110000-0000-4000-8000-000000000001',
   '75120000-0000-4000-8000-000000000001', 'room', 'Trim kit', 'PL-02', 'specified', 1, 1, NULL, NULL, 'USD'),
  ('75140000-0000-4000-8000-000000000003', '75110000-0000-4000-8000-000000000001',
   '75120000-0000-4000-8000-000000000001', 'room', 'Shower head', 'PL-03', 'specified', 1, 2, NULL, NULL, 'USD'),
  ('75140000-0000-4000-8000-000000000004', '75110000-0000-4000-8000-000000000001',
   '75120000-0000-4000-8000-000000000001', 'room', 'Hand shower', 'PL-04', 'specified', 1, 3, NULL, NULL, 'USD'),
  ('75140000-0000-4000-8000-000000000005', '75110000-0000-4000-8000-000000000001',
   '75120000-0000-4000-8000-000000000001', 'room', 'Drain', 'PL-05', 'specified', 1, 4, NULL, NULL, 'USD'),
  ('75140000-0000-4000-8000-000000000006', '75110000-0000-4000-8000-000000000001',
   '75120000-0000-4000-8000-000000000001', 'room', 'Niche tile', 'TL-01', 'specified', 1, 5, NULL, NULL, 'USD'),
  ('75140000-0000-4000-8000-000000000007', '75110000-0000-4000-8000-000000000001',
   '75120000-0000-4000-8000-000000000001', 'room', 'Glass', 'GL-01', 'specified', 1, 6, NULL, NULL, 'USD'),
  ('75140000-0000-4000-8000-000000000008', '75110000-0000-4000-8000-000000000001',
   '75120000-0000-4000-8000-000000000001', 'room', 'Vanity', 'VN-01', 'specified', 1, 7, 480000,
   '75130000-0000-4000-8000-000000000001', 'USD'),
  ('75140000-0000-4000-8000-000000000009', '75110000-0000-4000-8000-000000000001',
   '75120000-0000-4000-8000-000000000002', 'room', 'Powder faucet', 'PL-06', 'specified', 1, 8, NULL, NULL, 'USD'),
  ('75140000-0000-4000-8000-000000000010', '75110000-0000-4000-8000-000000000001',
   '75120000-0000-4000-8000-000000000001', 'room', 'Old towel bar', 'AC-01', 'specified', 1, 9, NULL, NULL, 'USD'),
  ('75140000-0000-4000-8000-000000000011', '75110000-0000-4000-8000-000000000002',
   '75120000-0000-4000-8000-000000000009', 'room', 'Elsewhere lamp', 'LT-01', 'specified', 1, 0, NULL, NULL, 'USD');

DO $setup$
BEGIN
  PERFORM set_config('app.ffe_mutation_rpc', 'on', true);
  UPDATE public.project_ffe_items
  SET removed_at = now(),
      removed_by = '75100000-0000-4000-8000-000000000001',
      removal_reason = 'removed while building'
  WHERE id = '75140000-0000-4000-8000-000000000010';
  PERFORM set_config('app.ffe_mutation_rpc', 'off', true);
END
$setup$;

-- The project's spec book, and a hash baseline taken while nothing is grouped.
CREATE TEMP TABLE lg_book ON COMMIT DROP AS SELECT NULL::uuid AS id;
CREATE TEMP TABLE lg_hash_before ON COMMIT DROP AS
  SELECT NULL::uuid AS ffe_item_id, NULL::text AS content_hash, NULL::jsonb AS item_snapshot LIMIT 0;
-- Money, quantity, status, disposition and stage of every fixture line,
-- before any grouping.
CREATE TEMP TABLE lg_lines_before ON COMMIT DROP AS
  SELECT i.id, i.quantity, i.unit, i.unit_price_cents, i.line_total_cents, i.budget_max_cents,
         i.rough_cents, i.status, i.design_disposition, i.item_type, public.ffe_line_stage(i) AS stage
  FROM public.project_ffe_items i
  WHERE i.project_id = '75110000-0000-4000-8000-000000000001';

DO $book$
DECLARE
  v_book public.spec_books;
BEGIN
  PERFORM set_config('request.jwt.claims',
    '{"sub":"75100000-0000-4000-8000-000000000001","role":"authenticated"}', true);
  PERFORM set_config('request.jwt.claim.sub', '75100000-0000-4000-8000-000000000001', true);
  v_book := public.ensure_project_spec_book('75110000-0000-4000-8000-000000000001');
  UPDATE lg_book SET id = v_book.id;
  INSERT INTO lg_hash_before
    SELECT s.ffe_item_id, s.content_hash, s.item_snapshot
    FROM public._spec_book_current_item_snapshots(v_book.id) s;
END
$book$;

DO $setup_check$
BEGIN
  IF (SELECT id FROM lg_book) IS NULL THEN
    RAISE EXCEPTION 'SETUP: ensure_project_spec_book returned no book';
  END IF;
  IF (SELECT count(*) FROM lg_hash_before) <> 9 THEN
    RAISE EXCEPTION 'SETUP: expected 9 live lines in the spec book, got %', (SELECT count(*) FROM lg_hash_before);
  END IF;
  IF EXISTS (SELECT 1 FROM lg_hash_before WHERE item_snapshot ? 'lineGroup') THEN
    RAISE EXCEPTION 'SETUP: an ungrouped line printed lineGroup';
  END IF;
  IF (SELECT count(*) FROM lg_lines_before
      WHERE id IN ('75140000-0000-4000-8000-000000000001', '75140000-0000-4000-8000-000000000002',
                   '75140000-0000-4000-8000-000000000003', '75140000-0000-4000-8000-000000000004',
                   '75140000-0000-4000-8000-000000000005', '75140000-0000-4000-8000-000000000006')
        AND stage = 'placeholder') <> 6 THEN
    RAISE EXCEPTION 'SETUP: the six shower components must be placeholders';
  END IF;
END
$setup_check$;

-- ── shower: a group with 6 placeholder lines ──────────────────────────────
SET LOCAL "request.jwt.claim.sub" TO '75100000-0000-4000-8000-000000000001';
SET LOCAL "request.jwt.claim.role" TO 'authenticated';
SET LOCAL "request.jwt.claims" TO '{"sub":"75100000-0000-4000-8000-000000000001","role":"authenticated"}';

CREATE TEMP TABLE lg_shower ON COMMIT DROP AS SELECT NULL::uuid AS id;

DO $shower$
DECLARE
  v_result jsonb;
  v_group  public.project_line_groups%ROWTYPE;
  v_n      integer;
  v_cols   text[];
BEGIN
  v_result := public.set_line_group(ARRAY[
    '75140000-0000-4000-8000-000000000001', '75140000-0000-4000-8000-000000000002',
    '75140000-0000-4000-8000-000000000003', '75140000-0000-4000-8000-000000000004',
    '75140000-0000-4000-8000-000000000005', '75140000-0000-4000-8000-000000000006',
    '75140000-0000-4000-8000-000000000006'  -- a repeat is harmless
  ]::uuid[], '{"name":"  Primary bath shower ","roomId":"75120000-0000-4000-8000-000000000001"}'::jsonb);

  IF v_result ->> 'groupId' IS NULL
     OR jsonb_array_length(v_result -> 'ffeItemIds') <> 6
     OR v_result -> 'deletedGroupIds' <> '[]'::jsonb THEN
    RAISE EXCEPTION 'shower: unexpected result %', v_result;
  END IF;
  UPDATE lg_shower SET id = (v_result ->> 'groupId')::uuid;

  SELECT * INTO v_group FROM public.project_line_groups WHERE id = (v_result ->> 'groupId')::uuid;
  IF v_group.name <> 'Primary bath shower'
     OR v_group.project_id <> '75110000-0000-4000-8000-000000000001'
     OR v_group.project_room_id IS DISTINCT FROM '75120000-0000-4000-8000-000000000001'
     OR v_group.sort_order <> 0 THEN
    RAISE EXCEPTION 'shower: group row wrong: %', to_jsonb(v_group);
  END IF;

  SELECT count(*) INTO v_n FROM public.project_ffe_items
  WHERE line_group_id = v_group.id;
  IF v_n <> 6 THEN
    RAISE EXCEPTION 'shower: expected 6 lines in the group, got %', v_n;
  END IF;
  IF EXISTS (SELECT 1 FROM public.project_ffe_items
             WHERE line_group_id = v_group.id
               AND id NOT IN ('75140000-0000-4000-8000-000000000001', '75140000-0000-4000-8000-000000000002',
                              '75140000-0000-4000-8000-000000000003', '75140000-0000-4000-8000-000000000004',
                              '75140000-0000-4000-8000-000000000005', '75140000-0000-4000-8000-000000000006')) THEN
    RAISE EXCEPTION 'shower: a line outside the six was grouped';
  END IF;

  -- Groups carry no money: every line keeps its money, quantity, status,
  -- disposition and stage; the six are still placeholders.
  SELECT count(*) INTO v_n
  FROM lg_lines_before b
  JOIN public.project_ffe_items i ON i.id = b.id
  WHERE (b.quantity, b.unit, b.unit_price_cents, b.line_total_cents, b.budget_max_cents,
         b.rough_cents, b.status, b.design_disposition, b.item_type, b.stage)
        IS DISTINCT FROM
        (i.quantity, i.unit, i.unit_price_cents, i.line_total_cents, i.budget_max_cents,
         i.rough_cents, i.status, i.design_disposition, i.item_type, public.ffe_line_stage(i));
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'shower: grouping changed money, quantity, status, disposition or stage on % line(s)', v_n;
  END IF;

  -- The group table is a heading only: no money, stage or act column.
  SELECT array_agg(column_name::text ORDER BY column_name::text) INTO v_cols
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'project_line_groups';
  IF v_cols <> ARRAY['created_at','id','name','project_id','project_room_id','sort_order'] THEN
    RAISE EXCEPTION 'shower: project_line_groups must carry only its heading columns, has %', v_cols;
  END IF;

  -- A second group in the same room sorts after the first.
  v_result := public.set_line_group(ARRAY['75140000-0000-4000-8000-000000000007']::uuid[],
    '{"name":"Shower enclosure","roomId":"75120000-0000-4000-8000-000000000001"}'::jsonb);
  IF (SELECT sort_order FROM public.project_line_groups WHERE id = (v_result ->> 'groupId')::uuid) <> 1 THEN
    RAISE EXCEPTION 'shower: a second group in the room must sort after the first';
  END IF;
  -- Move the glass into the shower: the enclosure is left empty and deleted.
  v_result := public.set_line_group(ARRAY['75140000-0000-4000-8000-000000000007']::uuid[],
    jsonb_build_object('groupId', v_group.id));
  IF (v_result ->> 'groupId')::uuid <> v_group.id
     OR jsonb_array_length(v_result -> 'deletedGroupIds') <> 1
     OR EXISTS (SELECT 1 FROM public.project_line_groups WHERE name = 'Shower enclosure') THEN
    RAISE EXCEPTION 'moves: the emptied enclosure group must be deleted, got %', v_result;
  END IF;
  IF (SELECT count(*) FROM public.project_ffe_items WHERE line_group_id = v_group.id) <> 7 THEN
    RAISE EXCEPTION 'moves: {groupId} must add the glass to the shower';
  END IF;
  -- And back out to ungrouped: the shower keeps its six.
  v_result := public.set_line_group(ARRAY['75140000-0000-4000-8000-000000000007']::uuid[], NULL);
  IF v_result -> 'groupId' <> 'null'::jsonb
     OR v_result -> 'deletedGroupIds' <> '[]'::jsonb
     OR (SELECT line_group_id FROM public.project_ffe_items WHERE id = '75140000-0000-4000-8000-000000000007') IS NOT NULL
     OR (SELECT count(*) FROM public.project_ffe_items WHERE line_group_id = v_group.id) <> 6 THEN
    RAISE EXCEPTION 'moves: null must ungroup the glass and keep the shower, got %', v_result;
  END IF;
END
$shower$;

-- ── hash: stable for ungrouped lines ──────────────────────────────────────
DO $hash$
DECLARE
  v_book  uuid := (SELECT id FROM lg_book);
  v_group uuid := (SELECT id FROM lg_shower);
  v_n     integer;
  v_snap  jsonb;
  v_hash  text;
BEGIN
  -- Every ungrouped line hashes exactly as before anything was grouped, and
  -- prints no lineGroup.
  SELECT count(*) INTO v_n
  FROM lg_hash_before b
  JOIN public._spec_book_current_item_snapshots(v_book) n ON n.ffe_item_id = b.ffe_item_id
  JOIN public.project_ffe_items i ON i.id = b.ffe_item_id
  WHERE i.line_group_id IS NULL
    AND (n.content_hash IS DISTINCT FROM b.content_hash OR n.item_snapshot ? 'lineGroup');
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'hash: % ungrouped line(s) changed hash or printed lineGroup', v_n;
  END IF;
  SELECT count(*) INTO v_n
  FROM public._spec_book_current_item_snapshots(v_book) n
  JOIN public.project_ffe_items i ON i.id = n.ffe_item_id
  WHERE i.line_group_id IS NULL;
  IF v_n <> 3 THEN  -- glass, vanity, powder faucet
    RAISE EXCEPTION 'hash: expected 3 ungrouped lines in the book, got %', v_n;
  END IF;

  -- A grouped line prints its heading and its hash changes.
  SELECT n.item_snapshot, n.content_hash INTO v_snap, v_hash
  FROM public._spec_book_current_item_snapshots(v_book) n
  WHERE n.ffe_item_id = '75140000-0000-4000-8000-000000000003';
  IF v_snap -> 'lineGroup' IS DISTINCT FROM
     jsonb_build_object('id', v_group, 'name', 'Primary bath shower') THEN
    RAISE EXCEPTION 'hash: a grouped line must print lineGroup {id, name}, got %', v_snap -> 'lineGroup';
  END IF;
  IF v_hash = (SELECT content_hash FROM lg_hash_before
               WHERE ffe_item_id = '75140000-0000-4000-8000-000000000003') THEN
    RAISE EXCEPTION 'hash: a grouped line''s hash did not change';
  END IF;
  IF (SELECT count(*) FROM public._spec_book_current_item_snapshots(v_book) n
      WHERE n.item_snapshot ? 'lineGroup') <> 6 THEN
    RAISE EXCEPTION 'hash: exactly the six shower lines must print lineGroup';
  END IF;

  -- Across every spec book in the database, no line outside a group prints
  -- lineGroup.
  SELECT count(*) INTO v_n
  FROM public.spec_books b
  CROSS JOIN LATERAL public._spec_book_current_item_snapshots(b.id) n
  JOIN public.project_ffe_items i ON i.id = n.ffe_item_id
  WHERE i.line_group_id IS NULL AND n.item_snapshot ? 'lineGroup';
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'hash: % ungrouped line(s) across all spec books print lineGroup', v_n;
  END IF;
END
$hash$;

-- ── moves: ungroup everything, the group goes; deleting a group ungroups ──
DO $moves$
DECLARE
  v_book   uuid := (SELECT id FROM lg_book);
  v_group  uuid := (SELECT id FROM lg_shower);
  v_result jsonb;
  v_n      integer;
BEGIN
  v_result := public.set_line_group(ARRAY[
    '75140000-0000-4000-8000-000000000001', '75140000-0000-4000-8000-000000000002',
    '75140000-0000-4000-8000-000000000003', '75140000-0000-4000-8000-000000000004',
    '75140000-0000-4000-8000-000000000005', '75140000-0000-4000-8000-000000000006'
  ]::uuid[], 'null'::jsonb);
  IF v_result -> 'deletedGroupIds' <> jsonb_build_array(v_group)
     OR EXISTS (SELECT 1 FROM public.project_line_groups WHERE id = v_group) THEN
    RAISE EXCEPTION 'moves: ungrouping all six must delete the shower group, got %', v_result;
  END IF;

  -- Ungrouped again, every line hashes as it did before grouping.
  SELECT count(*) INTO v_n
  FROM lg_hash_before b
  JOIN public._spec_book_current_item_snapshots(v_book) n ON n.ffe_item_id = b.ffe_item_id
  WHERE n.content_hash IS DISTINCT FROM b.content_hash;
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'moves: % line(s) did not return to their ungrouped hash', v_n;
  END IF;

  -- Deleting a group (as postgres would on a room or project cascade)
  -- ungroups its lines and never deletes them.
  v_result := public.set_line_group(ARRAY[
    '75140000-0000-4000-8000-000000000001', '75140000-0000-4000-8000-000000000002'
  ]::uuid[], '{"name":"Shower","roomId":"75120000-0000-4000-8000-000000000001"}'::jsonb);
  DELETE FROM public.project_line_groups WHERE id = (v_result ->> 'groupId')::uuid;
  IF (SELECT count(*) FROM public.project_ffe_items
      WHERE id IN ('75140000-0000-4000-8000-000000000001', '75140000-0000-4000-8000-000000000002')
        AND line_group_id IS NULL) <> 2 THEN
    RAISE EXCEPTION 'moves: deleting a group must ungroup its lines and keep them';
  END IF;

  -- The unassigned pile is a room of its own: {name, roomId:null}.
  PERFORM set_config('app.ffe_mutation_rpc', 'on', true);
  UPDATE public.project_ffe_items SET project_room_id = NULL, assignment_scope = 'unassigned'
  WHERE id = '75140000-0000-4000-8000-000000000009';
  PERFORM set_config('app.ffe_mutation_rpc', 'off', true);
  v_result := public.set_line_group(ARRAY['75140000-0000-4000-8000-000000000009']::uuid[],
    '{"name":"Hardware","roomId":null}'::jsonb);
  IF (SELECT project_room_id FROM public.project_line_groups WHERE id = (v_result ->> 'groupId')::uuid) IS NOT NULL THEN
    RAISE EXCEPTION 'moves: {name, roomId:null} must create an unassigned group';
  END IF;
END
$moves$;

-- ── refusals ──────────────────────────────────────────────────────────────
DO $refusals$
DECLARE
  v_msg   text;
  v_other uuid;
BEGIN
  -- A line in another room than the group's.
  BEGIN
    PERFORM public.set_line_group(ARRAY[
      '75140000-0000-4000-8000-000000000003', '75140000-0000-4000-8000-000000000008'
    ]::uuid[], '{"name":"Mixed","roomId":"75120000-0000-4000-8000-000000000002"}'::jsonb);
    RAISE EXCEPTION 'refusals: a line from another room was grouped';
  EXCEPTION WHEN check_violation THEN
    GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
    IF v_msg <> 'A group sits inside one room; a line is in another.' THEN RAISE; END IF;
  END;

  -- A removed line.
  BEGIN
    PERFORM public.set_line_group(ARRAY['75140000-0000-4000-8000-000000000010']::uuid[],
      '{"name":"Towels","roomId":"75120000-0000-4000-8000-000000000001"}'::jsonb);
    RAISE EXCEPTION 'refusals: a removed line was grouped';
  EXCEPTION WHEN check_violation THEN
    GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
    IF v_msg <> 'This line was removed.' THEN RAISE; END IF;
  END;

  -- Another project's group.
  INSERT INTO public.project_line_groups (project_id, project_room_id, name)
  VALUES ('75110000-0000-4000-8000-000000000002', '75120000-0000-4000-8000-000000000009', 'Theirs')
  RETURNING id INTO v_other;
  BEGIN
    PERFORM public.set_line_group(ARRAY['75140000-0000-4000-8000-000000000003']::uuid[],
      jsonb_build_object('groupId', v_other));
    RAISE EXCEPTION 'refusals: another project''s group was accepted';
  EXCEPTION WHEN check_violation THEN
    GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
    IF v_msg <> 'That group is not in this project.' THEN RAISE; END IF;
  END;

  -- A room from another project.
  BEGIN
    PERFORM public.set_line_group(ARRAY['75140000-0000-4000-8000-000000000003']::uuid[],
      '{"name":"Shower","roomId":"75120000-0000-4000-8000-000000000009"}'::jsonb);
    RAISE EXCEPTION 'refusals: a room from another project was accepted';
  EXCEPTION WHEN check_violation THEN
    GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
    IF v_msg <> 'That room is not in this project.' THEN RAISE; END IF;
  END;

  -- A blank name.
  BEGIN
    PERFORM public.set_line_group(ARRAY['75140000-0000-4000-8000-000000000003']::uuid[],
      '{"name":"   ","roomId":"75120000-0000-4000-8000-000000000001"}'::jsonb);
    RAISE EXCEPTION 'refusals: a blank group name was accepted';
  EXCEPTION WHEN check_violation THEN
    GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
    IF v_msg <> 'A group needs a name.' THEN RAISE; END IF;
  END;

  -- Lines across projects.
  BEGIN
    PERFORM public.set_line_group(ARRAY[
      '75140000-0000-4000-8000-000000000003', '75140000-0000-4000-8000-000000000011'
    ]::uuid[], NULL);
    RAISE EXCEPTION 'refusals: lines across projects were accepted';
  EXCEPTION WHEN check_violation THEN
    GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
    IF v_msg <> 'The lines are in different projects.' THEN RAISE; END IF;
  END;

  -- An empty list, and an unknown line.
  BEGIN
    PERFORM public.set_line_group(ARRAY[]::uuid[], NULL);
    RAISE EXCEPTION 'refusals: an empty list was accepted';
  EXCEPTION WHEN invalid_parameter_value THEN
    NULL;
  END;
  BEGIN
    PERFORM public.set_line_group(ARRAY['75140000-0000-4000-8000-0000000000ff']::uuid[], NULL);
    RAISE EXCEPTION 'refusals: an unknown line was accepted';
  -- 00758 (F16): an unknown line reads like an unreachable one.
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;

  -- A malformed group.
  BEGIN
    PERFORM public.set_line_group(ARRAY['75140000-0000-4000-8000-000000000003']::uuid[], '"Shower"'::jsonb);
    RAISE EXCEPTION 'refusals: a string group was accepted';
  EXCEPTION WHEN invalid_parameter_value THEN
    NULL;
  END;
END
$refusals$;

-- ── rls: a client JWT reads 0 groups; the studio reads its own ────────────
-- One studio group for the RLS checks.
DO $rls_setup$
BEGIN
  PERFORM public.set_line_group(ARRAY['75140000-0000-4000-8000-000000000004']::uuid[],
    '{"name":"Primary bath shower","roomId":"75120000-0000-4000-8000-000000000001"}'::jsonb);
END
$rls_setup$;

SET LOCAL "request.jwt.claim.sub" TO '75100000-0000-4000-8000-000000000002';
SET LOCAL "request.jwt.claims" TO '{"sub":"75100000-0000-4000-8000-000000000002","role":"authenticated"}';
SET LOCAL ROLE authenticated;

DO $rls_client$
DECLARE
  v_msg text;
BEGIN
  IF (SELECT count(*) FROM public.project_line_groups
      WHERE project_id = '75110000-0000-4000-8000-000000000001') <> 0 THEN
    RAISE EXCEPTION 'rls: a client JWT must read 0 groups';
  END IF;

  BEGIN
    PERFORM public.set_line_group(ARRAY['75140000-0000-4000-8000-000000000005']::uuid[],
      '{"name":"Mine","roomId":"75120000-0000-4000-8000-000000000001"}'::jsonb);
    RAISE EXCEPTION 'rls: the client was allowed to group lines';
  EXCEPTION WHEN insufficient_privilege THEN
    GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
    IF v_msg <> 'project not found or access denied' THEN RAISE; END IF;
  END;
END
$rls_client$;

RESET ROLE;

SET LOCAL "request.jwt.claim.sub" TO '75100000-0000-4000-8000-000000000001';
SET LOCAL "request.jwt.claims" TO '{"sub":"75100000-0000-4000-8000-000000000001","role":"authenticated"}';
SET LOCAL ROLE authenticated;

DO $rls_studio$
BEGIN
  IF (SELECT count(*) FROM public.project_line_groups
      WHERE project_id = '75110000-0000-4000-8000-000000000001') <> 2 THEN  -- Hardware + shower
    RAISE EXCEPTION 'rls: the studio must read its 2 groups';
  END IF;
  IF (SELECT count(*) FROM public.project_ffe_items
      WHERE id = '75140000-0000-4000-8000-000000000004' AND line_group_id IS NOT NULL) <> 1 THEN
    RAISE EXCEPTION 'rls: the studio must read line_group_id on its line';
  END IF;

  BEGIN
    INSERT INTO public.project_line_groups (project_id, name)
    VALUES ('75110000-0000-4000-8000-000000000001', 'Direct');
    RAISE EXCEPTION 'rls: a direct insert was allowed';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
  BEGIN
    UPDATE public.project_line_groups SET name = 'Renamed'
    WHERE project_id = '75110000-0000-4000-8000-000000000001';
    RAISE EXCEPTION 'rls: a direct update was allowed';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
  BEGIN
    DELETE FROM public.project_line_groups
    WHERE project_id = '75110000-0000-4000-8000-000000000001';
    RAISE EXCEPTION 'rls: a direct delete was allowed';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
END
$rls_studio$;

RESET ROLE;

\echo 'pieces_line_groups_test: the shower groups 6 placeholders with no money moved; ungrouped hashes stable; moves, refusals and RLS hold'
ROLLBACK;
