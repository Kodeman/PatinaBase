-- proposal builder atomic RPC regression (00389)
-- Run:
--   scripts/run-supabase-sql-test.sh supabase/tests/proposals/proposal_builder_atomicity_test.sql

BEGIN;

INSERT INTO auth.users (
  id, email, encrypted_password, email_confirmed_at, created_at, updated_at,
  instance_id, aud, role
)
VALUES
  ('f8900000-0000-4000-8000-000000000001', 'atomic-owner@test.invalid', '', NOW(), NOW(), NOW(),
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('f8900000-0000-4000-8000-000000000002', 'atomic-client@test.invalid', '', NOW(), NOW(), NOW(),
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('f8900000-0000-4000-8000-000000000003', 'atomic-peer@test.invalid', '', NOW(), NOW(), NOW(),
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('f8900000-0000-4000-8000-000000000004', 'atomic-guest@test.invalid', '', NOW(), NOW(), NOW(),
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('f8900000-0000-4000-8000-000000000005', 'atomic-foreign@test.invalid', '', NOW(), NOW(), NOW(),
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');

INSERT INTO public.profiles (id, email, full_name, created_at, updated_at)
VALUES
  ('f8900000-0000-4000-8000-000000000001', 'atomic-owner@test.invalid', 'Atomic Owner', NOW(), NOW()),
  ('f8900000-0000-4000-8000-000000000002', 'atomic-client@test.invalid', 'Atomic Client', NOW(), NOW()),
  ('f8900000-0000-4000-8000-000000000003', 'atomic-peer@test.invalid', 'Atomic Peer', NOW(), NOW()),
  ('f8900000-0000-4000-8000-000000000004', 'atomic-guest@test.invalid', 'Atomic Guest', NOW(), NOW()),
  ('f8900000-0000-4000-8000-000000000005', 'atomic-foreign@test.invalid', 'Atomic Foreign', NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.organizations (id, type, name, slug, status)
VALUES (
  'f8910000-0000-4000-8000-000000000001',
  'design_studio', 'Atomic Studio', 'atomic-builder-studio', 'active'
);

INSERT INTO public.organization_members (
  id, user_id, organization_id, role, status, joined_at
)
VALUES
  ('f8920000-0000-4000-8000-000000000001',
   'f8900000-0000-4000-8000-000000000001',
   'f8910000-0000-4000-8000-000000000001', 'owner', 'active', NOW()),
  ('f8920000-0000-4000-8000-000000000002',
   'f8900000-0000-4000-8000-000000000003',
   'f8910000-0000-4000-8000-000000000001', 'member', 'active', NOW()),
  ('f8920000-0000-4000-8000-000000000003',
   'f8900000-0000-4000-8000-000000000004',
   'f8910000-0000-4000-8000-000000000001', 'guest', 'active', NOW());

INSERT INTO public.proposals (
  id, designer_id, client_id, title, total_amount, status
)
VALUES
  ('f8930000-0000-4000-8000-000000000001',
   'f8900000-0000-4000-8000-000000000001',
   'f8900000-0000-4000-8000-000000000002',
   'Atomic owner proposal', 100000, 'draft'),
  ('f8930000-0000-4000-8000-000000000002',
   'f8900000-0000-4000-8000-000000000005',
   'f8900000-0000-4000-8000-000000000002',
   'Foreign proposal', 100000, 'draft');

INSERT INTO public.proposal_scope_rooms (id, proposal_id, name, sort_order)
VALUES
  ('f8940000-0000-4000-8000-000000000001',
   'f8930000-0000-4000-8000-000000000001', 'Owner room', 0),
  ('f8940000-0000-4000-8000-000000000002',
   'f8930000-0000-4000-8000-000000000002', 'Foreign room', 0);

INSERT INTO public.proposal_palettes (
  id, proposal_id, name, is_primary, sort_order
)
VALUES
  ('f8950000-0000-4000-8000-000000000001',
   'f8930000-0000-4000-8000-000000000001', 'Owner palette', true, 0),
  ('f8950000-0000-4000-8000-000000000002',
   'f8930000-0000-4000-8000-000000000001', 'Empty palette', false, 1),
  ('f8950000-0000-4000-8000-000000000003',
   'f8930000-0000-4000-8000-000000000002', 'Foreign palette', true, 0);

INSERT INTO public.palette_swatches (
  id, palette_id, hex, name, sort_order
)
VALUES
  ('f8960000-0000-4000-8000-000000000001',
   'f8950000-0000-4000-8000-000000000001', '#111111', 'One', 0),
  ('f8960000-0000-4000-8000-000000000002',
   'f8950000-0000-4000-8000-000000000001', '#222222', 'Two', 1),
  ('f8960000-0000-4000-8000-000000000003',
   'f8950000-0000-4000-8000-000000000001', '#333333', 'Three', 2),
  ('f8960000-0000-4000-8000-000000000004',
   'f8950000-0000-4000-8000-000000000003', '#444444', 'Foreign', 0);

INSERT INTO public.proposal_captures (
  id, designer_id, proposal_id, scope_room_id, source_url, raw_payload, status
)
VALUES
  ('f8970000-0000-4000-8000-000000000001',
   'f8900000-0000-4000-8000-000000000001',
   'f8930000-0000-4000-8000-000000000001',
   'f8940000-0000-4000-8000-000000000001',
   'https://example.invalid/owner', '{}'::jsonb, 'assigned'),
  ('f8970000-0000-4000-8000-000000000002',
   'f8900000-0000-4000-8000-000000000005',
   'f8930000-0000-4000-8000-000000000002',
   'f8940000-0000-4000-8000-000000000002',
   'https://example.invalid/foreign', '{}'::jsonb, 'assigned');

INSERT INTO public.proposal_boards (
  id, proposal_id, name, scope_room_id, sort_order, sections, status
)
VALUES
  ('f8980000-0000-4000-8000-000000000001',
   'f8930000-0000-4000-8000-000000000001', 'Source board',
   'f8940000-0000-4000-8000-000000000001', 0,
   '[{"id":"section-a","name":"Seating"}]'::jsonb, 'active'),
  ('f8980000-0000-4000-8000-000000000002',
   'f8930000-0000-4000-8000-000000000001', 'Invalid room board',
   'f8940000-0000-4000-8000-000000000002', 1, '[]'::jsonb, 'active'),
  ('f8980000-0000-4000-8000-000000000003',
   'f8930000-0000-4000-8000-000000000001', 'Invalid palette board',
   NULL, 2, '[]'::jsonb, 'active'),
  ('f8980000-0000-4000-8000-000000000004',
   'f8930000-0000-4000-8000-000000000001', 'Invalid capture board',
   NULL, 3, '[]'::jsonb, 'active'),
  ('f8980000-0000-4000-8000-000000000005',
   'f8930000-0000-4000-8000-000000000001', 'Injected failure board',
   NULL, 4, '[]'::jsonb, 'active'),
  ('f8980000-0000-4000-8000-000000000006',
   'f8930000-0000-4000-8000-000000000002', 'Foreign board',
   'f8940000-0000-4000-8000-000000000002', 0, '[]'::jsonb, 'active');

INSERT INTO public.proposal_board_items (
  id, board_id, type, x, y, width, height, z_index, rotation, locked,
  palette_id, capture_id, content, data
)
VALUES
  ('f8990000-0000-4000-8000-000000000001',
   'f8980000-0000-4000-8000-000000000001', 'note', 10, 20, 220, 80, 0, 5, false,
   NULL, NULL, 'Preserve me', '{"section_id":"section-a"}'::jsonb),
  ('f8990000-0000-4000-8000-000000000002',
   'f8980000-0000-4000-8000-000000000001', 'palette', 40, 50, 240, 160, 1, 0, true,
   'f8950000-0000-4000-8000-000000000001', NULL, NULL, '{}'::jsonb),
  ('f8990000-0000-4000-8000-000000000003',
   'f8980000-0000-4000-8000-000000000001', 'capture', 70, 80, 260, NULL, 2, 0, false,
   NULL, 'f8970000-0000-4000-8000-000000000001', NULL, '{}'::jsonb),
  ('f8990000-0000-4000-8000-000000000004',
   'f8980000-0000-4000-8000-000000000003', 'palette', 0, 0, 240, NULL, 0, 0, false,
   'f8950000-0000-4000-8000-000000000003', NULL, NULL, '{}'::jsonb),
  ('f8990000-0000-4000-8000-000000000005',
   'f8980000-0000-4000-8000-000000000004', 'capture', 0, 0, 240, NULL, 0, 0, false,
   NULL, 'f8970000-0000-4000-8000-000000000002', NULL, '{}'::jsonb),
  ('f8990000-0000-4000-8000-000000000006',
   'f8980000-0000-4000-8000-000000000005', 'note', 0, 0, 240, NULL, 0, 0, false,
   NULL, NULL, 'force-copy-failure', '{}'::jsonb);

CREATE OR REPLACE FUNCTION pg_temp.assume_atomic_actor(
  p_actor uuid,
  p_role text DEFAULT 'authenticated'
)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM set_config(
    'request.jwt.claims',
    CASE
      WHEN p_actor IS NULL THEN json_build_object('role', p_role)::text
      ELSE json_build_object('sub', p_actor, 'role', p_role)::text
    END,
    true
  );
END;
$$;

-- ACL contract: browser callers are authenticated only. PUBLIC grants would
-- make anon true too, so the anon assertion also proves PUBLIC is absent.
DO $$
BEGIN
  ASSERT has_function_privilege(
    'authenticated',
    'public.duplicate_proposal_board(uuid,uuid)',
    'EXECUTE'
  ), 'authenticated must execute duplicate_proposal_board';
  ASSERT NOT has_function_privilege(
    'anon',
    'public.duplicate_proposal_board(uuid,uuid)',
    'EXECUTE'
  ), 'anon must not execute duplicate_proposal_board';
  ASSERT NOT has_function_privilege(
    'service_role',
    'public.duplicate_proposal_board(uuid,uuid)',
    'EXECUTE'
  ), 'service_role must not execute duplicate_proposal_board';

  ASSERT has_function_privilege(
    'authenticated',
    'public.reorder_palette_swatches(uuid,uuid,uuid[])',
    'EXECUTE'
  ), 'authenticated must execute reorder_palette_swatches';
  ASSERT NOT has_function_privilege(
    'anon',
    'public.reorder_palette_swatches(uuid,uuid,uuid[])',
    'EXECUTE'
  ), 'anon must not execute reorder_palette_swatches';
  ASSERT NOT has_function_privilege(
    'service_role',
    'public.reorder_palette_swatches(uuid,uuid,uuid[])',
    'EXECUTE'
  ), 'service_role must not execute reorder_palette_swatches';
END;
$$;

-- A database role named authenticated without a user subject still fails the
-- function's explicit auth check (independent of ACLs).
SET LOCAL ROLE authenticated;
SELECT pg_temp.assume_atomic_actor(NULL);
DO $$
DECLARE
  v_denied boolean := false;
BEGIN
  BEGIN
    PERFORM public.duplicate_proposal_board(
      'f8930000-0000-4000-8000-000000000001',
      'f8980000-0000-4000-8000-000000000001'
    );
  EXCEPTION WHEN insufficient_privilege THEN
    v_denied := true;
  END;
  ASSERT v_denied, 'authenticated role without auth.uid must be denied';
END;
$$;
RESET ROLE;

-- Exact owner duplicates the complete board graph. New ids/timestamps are
-- fresh, while every client-facing snapshot field and relationship is copied.
SET LOCAL ROLE authenticated;
SELECT pg_temp.assume_atomic_actor('f8900000-0000-4000-8000-000000000001');
DO $$
DECLARE
  v_before integer;
  v_expected_sort integer;
  v_copy public.proposal_boards%ROWTYPE;
BEGIN
  SELECT count(*), max(sort_order) + 1
  INTO v_before, v_expected_sort
  FROM public.proposal_boards
  WHERE proposal_id = 'f8930000-0000-4000-8000-000000000001';

  SELECT * INTO v_copy
  FROM public.duplicate_proposal_board(
    'f8930000-0000-4000-8000-000000000001',
    'f8980000-0000-4000-8000-000000000001'
  );

  ASSERT v_copy.id <> 'f8980000-0000-4000-8000-000000000001',
    'duplicate must have a fresh board id';
  ASSERT v_copy.proposal_id = 'f8930000-0000-4000-8000-000000000001',
    'duplicate must retain the proposal owner';
  ASSERT v_copy.project_id IS NULL, 'duplicate must never become project-owned';
  ASSERT v_copy.name = 'Source board (Copy)', 'duplicate name must carry Copy suffix';
  ASSERT v_copy.scope_room_id = 'f8940000-0000-4000-8000-000000000001',
    'duplicate must preserve the validated scope room';
  ASSERT v_copy.sections = '[{"id":"section-a","name":"Seating"}]'::jsonb,
    'duplicate must preserve sections';
  ASSERT v_copy.status = 'active', 'duplicate must be active';
  ASSERT v_copy.sort_order = v_expected_sort, 'duplicate must land after siblings';

  ASSERT (SELECT count(*) FROM public.proposal_boards
          WHERE proposal_id = 'f8930000-0000-4000-8000-000000000001') = v_before + 1,
    'successful duplicate must add exactly one board';
  ASSERT (SELECT count(*) FROM public.proposal_board_items
          WHERE board_id = v_copy.id) = 3,
    'successful duplicate must copy every item';
  ASSERT NOT EXISTS (
    SELECT 1
    FROM public.proposal_board_items AS copy_item
    JOIN public.proposal_board_items AS source_item
      ON source_item.id = copy_item.id
    WHERE copy_item.board_id = v_copy.id
      AND source_item.board_id = 'f8980000-0000-4000-8000-000000000001'
  ), 'copied items must have fresh ids';
  ASSERT EXISTS (
    SELECT 1 FROM public.proposal_board_items
    WHERE board_id = v_copy.id
      AND content = 'Preserve me'
      AND data = '{"section_id":"section-a"}'::jsonb
  ), 'copied item content/data must survive';
  ASSERT EXISTS (
    SELECT 1 FROM public.proposal_board_items
    WHERE board_id = v_copy.id
      AND palette_id = 'f8950000-0000-4000-8000-000000000001'
  ), 'copied palette relationship must survive';
  ASSERT EXISTS (
    SELECT 1 FROM public.proposal_board_items
    WHERE board_id = v_copy.id
      AND capture_id = 'f8970000-0000-4000-8000-000000000001'
  ), 'copied capture relationship must survive';
END;
$$;
RESET ROLE;

-- Active non-guest design-studio peers share draft-authoring authority. Direct
-- child-row writes and the checked multi-row RPC must agree on that boundary.
SET LOCAL ROLE authenticated;
SELECT pg_temp.assume_atomic_actor('f8900000-0000-4000-8000-000000000003');
DO $$
DECLARE
  v_direct_rows integer;
  v_copy public.proposal_boards%ROWTYPE;
BEGIN
  UPDATE public.palette_swatches
  SET sort_order = 99
  WHERE id = 'f8960000-0000-4000-8000-000000000001';
  GET DIAGNOSTICS v_direct_rows = ROW_COUNT;
  ASSERT v_direct_rows = 1,
    'active design-studio peer must be able to edit a draft swatch';

  PERFORM public.reorder_palette_swatches(
    'f8930000-0000-4000-8000-000000000001',
    'f8950000-0000-4000-8000-000000000001',
    ARRAY[
      'f8960000-0000-4000-8000-000000000003',
      'f8960000-0000-4000-8000-000000000001',
      'f8960000-0000-4000-8000-000000000002'
    ]::uuid[]
  );

  SELECT * INTO v_copy
  FROM public.duplicate_proposal_board(
    'f8930000-0000-4000-8000-000000000001',
    'f8980000-0000-4000-8000-000000000001'
  );
  ASSERT v_copy.id IS NOT NULL,
    'active design-studio peer must duplicate through the RPC';
END;
$$;
RESET ROLE;

DO $$
BEGIN
  ASSERT (SELECT sort_order FROM public.palette_swatches
          WHERE id = 'f8960000-0000-4000-8000-000000000003') = 0,
    'peer RPC must set first order';
  ASSERT (SELECT sort_order FROM public.palette_swatches
          WHERE id = 'f8960000-0000-4000-8000-000000000001') = 1,
    'peer RPC must set second order';
  ASSERT (SELECT sort_order FROM public.palette_swatches
          WHERE id = 'f8960000-0000-4000-8000-000000000002') = 2,
    'peer RPC must set third order';
END;
$$;

-- Client, studio guest, and unrelated designer all fail closed. Counts/order
-- remain unchanged after every rejected call.
DO $$
DECLARE
  v_actor uuid;
  v_denied boolean;
  v_board_count integer;
  v_orders integer[];
BEGIN
  SELECT count(*) INTO v_board_count
  FROM public.proposal_boards
  WHERE proposal_id = 'f8930000-0000-4000-8000-000000000001';

  SELECT array_agg(sort_order ORDER BY id) INTO v_orders
  FROM public.palette_swatches
  WHERE palette_id = 'f8950000-0000-4000-8000-000000000001';

  FOREACH v_actor IN ARRAY ARRAY[
    'f8900000-0000-4000-8000-000000000002'::uuid,
    'f8900000-0000-4000-8000-000000000004'::uuid,
    'f8900000-0000-4000-8000-000000000005'::uuid
  ] LOOP
    EXECUTE 'SET LOCAL ROLE authenticated';
    PERFORM pg_temp.assume_atomic_actor(v_actor);

    v_denied := false;
    BEGIN
      PERFORM public.duplicate_proposal_board(
        'f8930000-0000-4000-8000-000000000001',
        'f8980000-0000-4000-8000-000000000001'
      );
    EXCEPTION WHEN insufficient_privilege THEN
      v_denied := true;
    END;
    ASSERT v_denied, format('actor %s must not duplicate owner board', v_actor);

    v_denied := false;
    BEGIN
      PERFORM public.reorder_palette_swatches(
        'f8930000-0000-4000-8000-000000000001',
        'f8950000-0000-4000-8000-000000000001',
        ARRAY[
          'f8960000-0000-4000-8000-000000000001',
          'f8960000-0000-4000-8000-000000000002',
          'f8960000-0000-4000-8000-000000000003'
        ]::uuid[]
      );
    EXCEPTION WHEN insufficient_privilege THEN
      v_denied := true;
    END;
    ASSERT v_denied, format('actor %s must not reorder owner palette', v_actor);

    EXECUTE 'RESET ROLE';
  END LOOP;

  ASSERT (SELECT count(*) FROM public.proposal_boards
          WHERE proposal_id = 'f8930000-0000-4000-8000-000000000001') = v_board_count,
    'denied duplicates must add no board';
  ASSERT (SELECT array_agg(sort_order ORDER BY id)
          FROM public.palette_swatches
          WHERE palette_id = 'f8950000-0000-4000-8000-000000000001') = v_orders,
    'denied reorders must change no row';
END;
$$;

-- Board relationship validation: missing/foreign board, cross-proposal room,
-- palette, and capture all reject without creating a copy.
SET LOCAL ROLE authenticated;
SELECT pg_temp.assume_atomic_actor('f8900000-0000-4000-8000-000000000001');
DO $$
DECLARE
  v_board uuid;
  v_rejected boolean;
  v_before integer;
BEGIN
  SELECT count(*) INTO v_before
  FROM public.proposal_boards
  WHERE proposal_id = 'f8930000-0000-4000-8000-000000000001';

  FOREACH v_board IN ARRAY ARRAY[
    'f8980000-0000-4000-8000-000000000006'::uuid,
    'f8980000-0000-4000-8000-000000000002'::uuid,
    'f8980000-0000-4000-8000-000000000003'::uuid,
    'f8980000-0000-4000-8000-000000000004'::uuid,
    'f8980000-0000-4000-8000-000000000099'::uuid
  ] LOOP
    v_rejected := false;
    BEGIN
      PERFORM public.duplicate_proposal_board(
        'f8930000-0000-4000-8000-000000000001', v_board
      );
    EXCEPTION WHEN check_violation THEN
      v_rejected := true;
    END;
    ASSERT v_rejected, format('invalid board relationship %s must reject', v_board);
  END LOOP;

  ASSERT (SELECT count(*) FROM public.proposal_boards
          WHERE proposal_id = 'f8930000-0000-4000-8000-000000000001') = v_before,
    'relationship validation failures must leave no copies';
END;
$$;
RESET ROLE;

-- Force the old second leg (item insert) to fail. The caught RPC exception must
-- roll its already-attempted board insert back: no ghost header survives.
CREATE OR REPLACE FUNCTION pg_temp.reject_forced_board_item_copy()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.content = 'force-copy-failure' THEN
    RAISE EXCEPTION 'forced copied-item insert failure';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_test_reject_forced_board_item_copy
  BEFORE INSERT ON public.proposal_board_items
  FOR EACH ROW EXECUTE FUNCTION pg_temp.reject_forced_board_item_copy();

SET LOCAL ROLE authenticated;
SELECT pg_temp.assume_atomic_actor('f8900000-0000-4000-8000-000000000001');
DO $$
DECLARE
  v_before integer;
  v_failed boolean := false;
BEGIN
  SELECT count(*) INTO v_before
  FROM public.proposal_boards
  WHERE proposal_id = 'f8930000-0000-4000-8000-000000000001';

  BEGIN
    PERFORM public.duplicate_proposal_board(
      'f8930000-0000-4000-8000-000000000001',
      'f8980000-0000-4000-8000-000000000005'
    );
  EXCEPTION WHEN OTHERS THEN
    v_failed := SQLERRM = 'forced copied-item insert failure';
  END;

  ASSERT v_failed, 'trigger-injected item copy must surface the forced failure';
  ASSERT (SELECT count(*) FROM public.proposal_boards
          WHERE proposal_id = 'f8930000-0000-4000-8000-000000000001') = v_before,
    'failed copied-item insert must roll back the new board header';
  ASSERT NOT EXISTS (
    SELECT 1 FROM public.proposal_boards
    WHERE proposal_id = 'f8930000-0000-4000-8000-000000000001'
      AND name = 'Injected failure board (Copy)'
  ), 'no ghost copy may survive a second-leg failure';
END;
$$;
RESET ROLE;

-- Exact-set validation rejects duplicate, null, missing, extra, foreign, and
-- proposal/palette mismatch inputs; each rejected statement preserves all
-- existing orders. Empty is valid only for the truly empty palette.
SET LOCAL ROLE authenticated;
SELECT pg_temp.assume_atomic_actor('f8900000-0000-4000-8000-000000000001');
DO $$
DECLARE
  v_case uuid[];
  v_case_json jsonb;
  v_rejected boolean;
  v_before integer[];
BEGIN
  SELECT array_agg(sort_order ORDER BY id) INTO v_before
  FROM public.palette_swatches
  WHERE palette_id = 'f8950000-0000-4000-8000-000000000001';

  FOR v_case_json IN
    SELECT value
    FROM jsonb_array_elements(
      '[
        ["f8960000-0000-4000-8000-000000000001", "f8960000-0000-4000-8000-000000000001", "f8960000-0000-4000-8000-000000000003"],
        ["f8960000-0000-4000-8000-000000000001", "f8960000-0000-4000-8000-000000000002"],
        ["f8960000-0000-4000-8000-000000000001", "f8960000-0000-4000-8000-000000000002", "f8960000-0000-4000-8000-000000000004"],
        ["f8960000-0000-4000-8000-000000000001", "f8960000-0000-4000-8000-000000000002", "f8960000-0000-4000-8000-000000000003", "f8960000-0000-4000-8000-000000000004"],
        ["f8960000-0000-4000-8000-000000000001", null, "f8960000-0000-4000-8000-000000000003"],
        []
      ]'::jsonb
    )
  LOOP
    SELECT COALESCE(array_agg(value::uuid), ARRAY[]::uuid[])
    INTO v_case
    FROM jsonb_array_elements_text(v_case_json);

    v_rejected := false;
    BEGIN
      PERFORM public.reorder_palette_swatches(
        'f8930000-0000-4000-8000-000000000001',
        'f8950000-0000-4000-8000-000000000001',
        v_case
      );
    EXCEPTION WHEN check_violation THEN
      v_rejected := true;
    END;
    ASSERT v_rejected, format('invalid exact-set input %s must reject', v_case);
    ASSERT (SELECT array_agg(sort_order ORDER BY id)
            FROM public.palette_swatches
            WHERE palette_id = 'f8950000-0000-4000-8000-000000000001') = v_before,
      'rejected exact-set input must change no sort order';
  END LOOP;

  PERFORM public.reorder_palette_swatches(
    'f8930000-0000-4000-8000-000000000001',
    'f8950000-0000-4000-8000-000000000002',
    ARRAY[]::uuid[]
  );

  v_rejected := false;
  BEGIN
    PERFORM public.reorder_palette_swatches(
      'f8930000-0000-4000-8000-000000000001',
      'f8950000-0000-4000-8000-000000000003',
      ARRAY['f8960000-0000-4000-8000-000000000004']::uuid[]
    );
  EXCEPTION WHEN check_violation THEN
    v_rejected := true;
  END;
  ASSERT v_rejected, 'palette/proposal mismatch must reject';

  v_rejected := false;
  BEGIN
    PERFORM public.reorder_palette_swatches(
      'f8930000-0000-4000-8000-000000000001',
      'f8950000-0000-4000-8000-000000000099',
      ARRAY[]::uuid[]
    );
  EXCEPTION WHEN check_violation THEN
    v_rejected := true;
  END;
  ASSERT v_rejected, 'missing palette must reject';
END;
$$;
RESET ROLE;

-- Normalize the order, then inject a failure on one swatch. Even if PostgreSQL
-- has already visited other rows in the set, the single UPDATE statement and
-- enclosing RPC transaction must roll every changed row back.
SET LOCAL ROLE authenticated;
SELECT pg_temp.assume_atomic_actor('f8900000-0000-4000-8000-000000000001');
SELECT public.reorder_palette_swatches(
  'f8930000-0000-4000-8000-000000000001',
  'f8950000-0000-4000-8000-000000000001',
  ARRAY[
    'f8960000-0000-4000-8000-000000000001',
    'f8960000-0000-4000-8000-000000000002',
    'f8960000-0000-4000-8000-000000000003'
  ]::uuid[]
);
RESET ROLE;

CREATE OR REPLACE FUNCTION pg_temp.reject_forced_swatch_update()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.id = 'f8960000-0000-4000-8000-000000000002'
     AND NEW.sort_order IS DISTINCT FROM OLD.sort_order
  THEN
    RAISE EXCEPTION 'forced kth-row swatch failure';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_test_reject_forced_swatch_update
  BEFORE UPDATE ON public.palette_swatches
  FOR EACH ROW EXECUTE FUNCTION pg_temp.reject_forced_swatch_update();

SET LOCAL ROLE authenticated;
SELECT pg_temp.assume_atomic_actor('f8900000-0000-4000-8000-000000000001');
DO $$
DECLARE
  v_failed boolean := false;
BEGIN
  BEGIN
    PERFORM public.reorder_palette_swatches(
      'f8930000-0000-4000-8000-000000000001',
      'f8950000-0000-4000-8000-000000000001',
      ARRAY[
        'f8960000-0000-4000-8000-000000000003',
        'f8960000-0000-4000-8000-000000000001',
        'f8960000-0000-4000-8000-000000000002'
      ]::uuid[]
    );
  EXCEPTION WHEN OTHERS THEN
    v_failed := SQLERRM = 'forced kth-row swatch failure';
  END;
  ASSERT v_failed, 'trigger-injected kth-row update must surface the failure';
END;
$$;
RESET ROLE;

DO $$
BEGIN
  ASSERT (SELECT sort_order FROM public.palette_swatches
          WHERE id = 'f8960000-0000-4000-8000-000000000001') = 0,
    'kth-row failure must roll back the first swatch';
  ASSERT (SELECT sort_order FROM public.palette_swatches
          WHERE id = 'f8960000-0000-4000-8000-000000000002') = 1,
    'kth-row failure must preserve the rejected swatch';
  ASSERT (SELECT sort_order FROM public.palette_swatches
          WHERE id = 'f8960000-0000-4000-8000-000000000003') = 2,
    'kth-row failure must roll back the third swatch';
END;
$$;

ROLLBACK;

SELECT 'proposal builder atomicity tests passed' AS result;
