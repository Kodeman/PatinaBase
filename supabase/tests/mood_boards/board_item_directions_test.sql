-- Internal direction layer on board pins (00550, board-paths W3c, DV6).
-- Co-member read/write/resolve/reopen; non-member authenticated refused;
-- anon refused; the guest-share token path (00548/00549) cannot reach
-- directions at all — no grant, no policy, no data in the resolved payload.
-- Run after a fresh reset:
--   psql 'postgresql://postgres:postgres@127.0.0.1:54322/postgres' \
--     -v ON_ERROR_STOP=1 \
--     -f supabase/tests/mood_boards/board_item_directions_test.sql

BEGIN;

SET LOCAL statement_timeout = '20s';

CREATE OR REPLACE FUNCTION pg_temp.assume_direction_actor(p_actor uuid)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', p_actor, 'role', 'authenticated')::text,
    true
  );
  PERFORM set_config('request.jwt.claim.sub', COALESCE(p_actor::text, ''), true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
END;
$$;
GRANT EXECUTE ON FUNCTION pg_temp.assume_direction_actor(uuid) TO PUBLIC;

CREATE OR REPLACE FUNCTION pg_temp.assume_anon()
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM set_config('request.jwt.claims', NULL, true);
  PERFORM set_config('request.jwt.claim.sub', '', true);
  PERFORM set_config('request.jwt.claim.role', 'anon', true);
END;
$$;
GRANT EXECUTE ON FUNCTION pg_temp.assume_anon() TO PUBLIC;

-- ── Fixtures ────────────────────────────────────────────────────────────────
-- 01 = lead designer (project owner, org owner). 02 = junior co-member (same
-- design_studio org). 03 = foreign designer (own, unrelated design_studio
-- org) — proves the RLS predicate is org-scoped, not "any authenticated
-- designer". 04 = client on the project (never a studio co-member).

INSERT INTO auth.users (
  id, email, encrypted_password, email_confirmed_at, created_at, updated_at,
  instance_id, aud, role
)
VALUES
  ('d5500000-0000-4000-8000-000000000001', 'direction-lead@test.invalid', '', NOW(), NOW(), NOW(),
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('d5500000-0000-4000-8000-000000000002', 'direction-junior@test.invalid', '', NOW(), NOW(), NOW(),
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('d5500000-0000-4000-8000-000000000003', 'direction-foreign@test.invalid', '', NOW(), NOW(), NOW(),
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('d5500000-0000-4000-8000-000000000004', 'direction-client@test.invalid', '', NOW(), NOW(), NOW(),
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');

INSERT INTO public.profiles (id, email, full_name, created_at, updated_at)
VALUES
  ('d5500000-0000-4000-8000-000000000001', 'direction-lead@test.invalid', 'Direction Lead', NOW(), NOW()),
  ('d5500000-0000-4000-8000-000000000002', 'direction-junior@test.invalid', 'Direction Junior', NOW(), NOW()),
  ('d5500000-0000-4000-8000-000000000003', 'direction-foreign@test.invalid', 'Foreign Designer', NOW(), NOW()),
  ('d5500000-0000-4000-8000-000000000004', 'direction-client@test.invalid', 'Direction Client', NOW(), NOW())
ON CONFLICT (id) DO UPDATE
SET email = EXCLUDED.email, full_name = EXCLUDED.full_name;

-- The lead's studio, with the junior enrolled as an active non-guest member.
INSERT INTO public.organizations (id, type, name, slug, status)
VALUES ('d5501000-0000-4000-8000-000000000001', 'design_studio', 'Direction Studio', 'direction-studio-test', 'active');

INSERT INTO public.organization_members (user_id, organization_id, role, status, joined_at)
VALUES
  ('d5500000-0000-4000-8000-000000000001', 'd5501000-0000-4000-8000-000000000001', 'owner', 'active', now()),
  ('d5500000-0000-4000-8000-000000000002', 'd5501000-0000-4000-8000-000000000001', 'member', 'active', now());

-- The foreign designer's own, unrelated studio — proves org-scoping, not
-- "any authenticated designer can manage any board's directions".
INSERT INTO public.organizations (id, type, name, slug, status)
VALUES ('d5501000-0000-4000-8000-000000000002', 'design_studio', 'Foreign Studio', 'foreign-studio-test', 'active');

INSERT INTO public.organization_members (user_id, organization_id, role, status, joined_at)
VALUES ('d5500000-0000-4000-8000-000000000003', 'd5501000-0000-4000-8000-000000000002', 'owner', 'active', now());

INSERT INTO public.projects (id, designer_id, client_id, created_by, name, status)
VALUES (
  'd5502000-0000-4000-8000-000000000001',
  'd5500000-0000-4000-8000-000000000001',
  'd5500000-0000-4000-8000-000000000004',
  'd5500000-0000-4000-8000-000000000001',
  'Direction layer project',
  'active'
);

INSERT INTO public.proposal_boards (
  id, proposal_id, project_id, name, canvas_width, canvas_height,
  background_color, sections, status, sort_order
) VALUES (
  'd5503000-0000-4000-8000-000000000001',
  NULL,
  'd5502000-0000-4000-8000-000000000001',
  'Direction layer board', 1200, 800, '#FAF8F5', '[]'::jsonb, 'active', 0
);

INSERT INTO public.proposal_board_items (
  id, board_id, type, x, y, width, height, z_index, rotation, content, data
) VALUES (
  'd5504000-0000-4000-8000-000000000001',
  'd5503000-0000-4000-8000-000000000001',
  'product', 40, 60, 220, 120, 0, 0, 'Sconce reference',
  '{"name":"Sconce reference"}'::jsonb
);

-- ── 1. Co-member (owner) inserts a direction note ──────────────────────────
SET LOCAL ROLE authenticated;
SELECT pg_temp.assume_direction_actor('d5500000-0000-4000-8000-000000000001');

INSERT INTO public.board_item_directions (id, board_item_id, body)
VALUES (
  'd5505000-0000-4000-8000-000000000001',
  'd5504000-0000-4000-8000-000000000001',
  'Swap this sconce for the brass one from the palette board.'
);

DO $$
BEGIN
  ASSERT (
    SELECT author_id FROM public.board_item_directions
    WHERE id = 'd5505000-0000-4000-8000-000000000001'
  ) = 'd5500000-0000-4000-8000-000000000001'::uuid,
    'author_id must default to the inserting user';
  ASSERT (
    SELECT resolved FROM public.board_item_directions
    WHERE id = 'd5505000-0000-4000-8000-000000000001'
  ) = false, 'a new direction note must start unresolved';
END;
$$;

-- ── 2. Co-member (junior) can read and add to the same thread ─────────────
SELECT pg_temp.assume_direction_actor('d5500000-0000-4000-8000-000000000002');

DO $$
BEGIN
  ASSERT (
    SELECT count(*) FROM public.board_item_directions
    WHERE board_item_id = 'd5504000-0000-4000-8000-000000000001'
  ) = 1, 'a studio co-member must read the lead''s direction note';
END;
$$;

INSERT INTO public.board_item_directions (id, board_item_id, body)
VALUES (
  'd5505000-0000-4000-8000-000000000002',
  'd5504000-0000-4000-8000-000000000001',
  'Done — swapped, see updated pin.'
);

DO $$
BEGIN
  ASSERT (
    SELECT author_id FROM public.board_item_directions
    WHERE id = 'd5505000-0000-4000-8000-000000000002'
  ) = 'd5500000-0000-4000-8000-000000000002'::uuid,
    'the junior''s own note must be attributed to the junior, not the lead';
END;
$$;

-- A co-member cannot author a note under someone else's name.
DO $$
BEGIN
  BEGIN
    INSERT INTO public.board_item_directions (id, board_item_id, author_id, body)
    VALUES (
      'd5505000-0000-4000-8000-000000000099',
      'd5504000-0000-4000-8000-000000000001',
      'd5500000-0000-4000-8000-000000000001',
      'Impersonation attempt'
    );
    RAISE EXCEPTION 'a co-member unexpectedly authored a note as another user';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
END;
$$;

-- ── 3. Resolve / reopen via the SECURITY DEFINER RPCs ──────────────────────
-- The junior resolves the lead's note (any co-member may resolve/reopen any
-- note in the thread — this is a shared studio to-do list, not per-author).
DO $$
DECLARE
  v_row public.board_item_directions;
BEGIN
  SELECT * INTO v_row FROM public.resolve_board_item_direction(
    'd5505000-0000-4000-8000-000000000001'
  );
  ASSERT v_row.resolved = true, 'resolve must flip resolved true';
  ASSERT v_row.resolved_at IS NOT NULL, 'resolve must stamp resolved_at';
  ASSERT v_row.resolved_by = 'd5500000-0000-4000-8000-000000000002'::uuid,
    'resolved_by must be the resolving user, server-set';

  -- Idempotent: resolving an already-resolved row is a no-op, not an error.
  SELECT * INTO v_row FROM public.resolve_board_item_direction(
    'd5505000-0000-4000-8000-000000000001'
  );
  ASSERT v_row.resolved = true, 'resolving twice must stay resolved';
END;
$$;

DO $$
BEGIN
  ASSERT (
    SELECT count(*) FROM public.board_item_directions
    WHERE board_item_id = 'd5504000-0000-4000-8000-000000000001' AND NOT resolved
  ) = 1, 'exactly one note (the junior''s reply) should remain unresolved';
END;
$$;

-- The lead reopens it.
SELECT pg_temp.assume_direction_actor('d5500000-0000-4000-8000-000000000001');

DO $$
DECLARE
  v_row public.board_item_directions;
BEGIN
  SELECT * INTO v_row FROM public.reopen_board_item_direction(
    'd5505000-0000-4000-8000-000000000001'
  );
  ASSERT v_row.resolved = false, 'reopen must flip resolved false';
  ASSERT v_row.resolved_at IS NULL, 'reopen must clear resolved_at';
  ASSERT v_row.resolved_by IS NULL, 'reopen must clear resolved_by';
END;
$$;

DO $$
BEGIN
  ASSERT (
    SELECT count(*) FROM public.board_item_directions
    WHERE board_item_id = 'd5504000-0000-4000-8000-000000000001' AND NOT resolved
  ) = 2, 'both notes should be unresolved again after reopen';
END;
$$;

-- ── 3b. A co-member's raw UPDATE/DELETE is refused at the grant (C6) ──────
-- can_manage_board_item_feedback would authorize this actor under RLS, but
-- there is no UPDATE/DELETE policy AND (as of the 00550 fix) no UPDATE/DELETE
-- grant on the table either — 00550 REVOKEs ALL from authenticated, not just
-- PUBLIC/anon, closing the local-stack legacy-grants blanket baseline that
-- would otherwise leave a real UPDATE/DELETE grant sitting underneath the
-- migration's "deliberately no UPDATE or DELETE policy" comment. Resolve/
-- reopen MUST go through the SECURITY DEFINER RPCs, never a direct write.
-- Still acting as the lead (a genuine co-member) from the block above.
DO $$
BEGIN
  BEGIN
    UPDATE public.board_item_directions
       SET resolved = true, resolved_at = now(), resolved_by = auth.uid()
     WHERE id = 'd5505000-0000-4000-8000-000000000002';
    RAISE EXCEPTION 'a studio co-member unexpectedly UPDATEd board_item_directions directly';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;

  BEGIN
    DELETE FROM public.board_item_directions
     WHERE id = 'd5505000-0000-4000-8000-000000000002';
    RAISE EXCEPTION 'a studio co-member unexpectedly DELETEd a board_item_directions row directly';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
END;
$$;

DO $$
BEGIN
  ASSERT (
    SELECT resolved FROM public.board_item_directions
    WHERE id = 'd5505000-0000-4000-8000-000000000002'
  ) = false, 'the denied raw UPDATE must not have taken effect';
  ASSERT EXISTS (
    SELECT 1 FROM public.board_item_directions
    WHERE id = 'd5505000-0000-4000-8000-000000000002'
  ), 'the denied raw DELETE must not have taken effect';
END;
$$;

RESET ROLE;

-- ── 4. Non-member authenticated (foreign designer): refused ───────────────
SET LOCAL ROLE authenticated;
SELECT pg_temp.assume_direction_actor('d5500000-0000-4000-8000-000000000003');

DO $$
BEGIN
  ASSERT (
    SELECT count(*) FROM public.board_item_directions
    WHERE board_item_id = 'd5504000-0000-4000-8000-000000000001'
  ) = 0, 'a non-member authenticated designer must read zero direction rows';
END;
$$;

DO $$
BEGIN
  BEGIN
    INSERT INTO public.board_item_directions (id, board_item_id, body)
    VALUES (
      'd5505000-0000-4000-8000-000000000003',
      'd5504000-0000-4000-8000-000000000001',
      'Outsider attempts to direct someone else''s studio'
    );
    RAISE EXCEPTION 'a non-member authenticated user unexpectedly inserted a direction note';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
END;
$$;

DO $$
BEGIN
  BEGIN
    PERFORM public.resolve_board_item_direction('d5505000-0000-4000-8000-000000000001');
    RAISE EXCEPTION 'a non-member authenticated user unexpectedly resolved a direction note';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
END;
$$;

-- C8: a not-found id and a not-authorized (but real) id must be
-- INDISTINGUISHABLE to the caller — same message, same errcode — or the RPC
-- becomes an existence oracle a non-member could probe ids against.
DO $$
DECLARE
  v_message_real  text;
  v_sqlstate_real text;
  v_message_fake  text;
  v_sqlstate_fake text;
BEGIN
  BEGIN
    PERFORM public.resolve_board_item_direction('d5505000-0000-4000-8000-000000000001');
  EXCEPTION WHEN insufficient_privilege THEN
    GET STACKED DIAGNOSTICS v_message_real = MESSAGE_TEXT, v_sqlstate_real = RETURNED_SQLSTATE;
  END;

  BEGIN
    PERFORM public.resolve_board_item_direction('00000000-0000-0000-0000-000000000000');
  EXCEPTION WHEN insufficient_privilege THEN
    GET STACKED DIAGNOSTICS v_message_fake = MESSAGE_TEXT, v_sqlstate_fake = RETURNED_SQLSTATE;
  END;

  ASSERT v_message_real IS NOT NULL AND v_message_fake IS NOT NULL,
    'both calls must raise (not silently succeed)';
  ASSERT v_message_real = v_message_fake,
    format('a real-but-unauthorized id and a nonexistent id must raise the SAME message: %L vs %L',
      v_message_real, v_message_fake);
  ASSERT v_sqlstate_real = v_sqlstate_fake,
    'a real-but-unauthorized id and a nonexistent id must raise the SAME errcode';
END;
$$;

-- A client on the very same project is likewise not a studio co-member.
SELECT pg_temp.assume_direction_actor('d5500000-0000-4000-8000-000000000004');

DO $$
BEGIN
  ASSERT (
    SELECT count(*) FROM public.board_item_directions
    WHERE board_item_id = 'd5504000-0000-4000-8000-000000000001'
  ) = 0, 'the project''s own client must read zero direction rows';

  BEGIN
    INSERT INTO public.board_item_directions (id, board_item_id, body)
    VALUES (
      'd5505000-0000-4000-8000-000000000004',
      'd5504000-0000-4000-8000-000000000001',
      'A client is never a studio co-member'
    );
    RAISE EXCEPTION 'the client unexpectedly inserted a direction note';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
END;
$$;

RESET ROLE;

-- ── 5. anon: refused at the grant, not merely the RLS predicate ───────────
SET LOCAL ROLE anon;
SELECT pg_temp.assume_anon();

DO $$
BEGIN
  BEGIN
    PERFORM count(*) FROM public.board_item_directions;
    RAISE EXCEPTION 'anon unexpectedly has table-level SELECT on board_item_directions';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
END;
$$;

DO $$
BEGIN
  BEGIN
    INSERT INTO public.board_item_directions (id, board_item_id, body)
    VALUES (
      'd5505000-0000-4000-8000-000000000005',
      'd5504000-0000-4000-8000-000000000001',
      'Anon attempts to write a direction note'
    );
    RAISE EXCEPTION 'anon unexpectedly has table-level INSERT on board_item_directions';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
END;
$$;

DO $$
BEGIN
  BEGIN
    PERFORM public.resolve_board_item_direction('d5505000-0000-4000-8000-000000000001');
    RAISE EXCEPTION 'anon unexpectedly has EXECUTE on resolve_board_item_direction';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
END;
$$;

RESET ROLE;

-- ── 5b. CASCADE + pin-undo (C2 ruling) ─────────────────────────────────────
-- Deleting a pin CASCADE-deletes its direction thread; the room's pin-undo
-- restores the PIN by re-inserting a proposal_board_items row (here modeled
-- with the SAME id, which is MORE generous to "undo" than the room's real
-- undo — it never reuses the old id at all) and the thread does NOT come
-- back either way. See the migration header + the FK constraint comment for
-- the ruling this proves.
INSERT INTO public.proposal_board_items (
  id, board_id, type, x, y, width, height, z_index, rotation, content, data
) VALUES (
  'd5504000-0000-4000-8000-000000000002',
  'd5503000-0000-4000-8000-000000000001',
  'note', 200, 200, 160, 90, 1, 0, 'Cascade probe pin', '{}'::jsonb
);

INSERT INTO public.board_item_directions (id, board_item_id, author_id, body)
VALUES (
  'd5505000-0000-4000-8000-000000000006',
  'd5504000-0000-4000-8000-000000000002',
  'd5500000-0000-4000-8000-000000000001',
  'Direction on the soon-to-be-deleted pin'
);

DELETE FROM public.proposal_board_items
 WHERE id = 'd5504000-0000-4000-8000-000000000002';

DO $$
BEGIN
  ASSERT NOT EXISTS (
    SELECT 1 FROM public.board_item_directions
    WHERE id = 'd5505000-0000-4000-8000-000000000006'
  ), 'deleting the pin must CASCADE-delete its direction thread';
END;
$$;

-- "Undo": the pin comes back (even at the identical id, the most generous
-- case) — the thread stays gone.
INSERT INTO public.proposal_board_items (
  id, board_id, type, x, y, width, height, z_index, rotation, content, data
) VALUES (
  'd5504000-0000-4000-8000-000000000002',
  'd5503000-0000-4000-8000-000000000001',
  'note', 200, 200, 160, 90, 1, 0, 'Cascade probe pin', '{}'::jsonb
);

DO $$
BEGIN
  ASSERT EXISTS (
    SELECT 1 FROM public.proposal_board_items
    WHERE id = 'd5504000-0000-4000-8000-000000000002'
  ), 'undo must restore the pin itself';
  ASSERT (
    SELECT count(*) FROM public.board_item_directions
    WHERE board_item_id = 'd5504000-0000-4000-8000-000000000002'
  ) = 0, 'undo restoring the pin must NOT resurrect its direction thread (00550 ruling)';
END;
$$;

-- ── 6. The guest-share token path cannot reach directions at all ──────────
-- Mint an opted-in reaction share on the same board (00548/00549's own
-- verdict channel), then prove: (a) the resolved guest payload never carries
-- direction data, (b) a guest reaction write never touches
-- board_item_directions, and (c) anon still cannot see the table underneath
-- a "valid" share context — there is no RPC bridging the two at all.
DO $$
DECLARE
  v_share record;
  v_payload jsonb;
  v_reaction jsonb;
BEGIN
  PERFORM pg_temp.assume_direction_actor('d5500000-0000-4000-8000-000000000001');
  SET LOCAL ROLE authenticated;
  SELECT * INTO v_share
  FROM public.create_board_share(
    'd5503000-0000-4000-8000-000000000001',
    'Guest preview with reactions',
    NULL,
    true
  );
  RESET ROLE;
  ASSERT v_share.token IS NOT NULL, 'the opted-in board share must mint a token';

  SET LOCAL ROLE anon;
  PERFORM pg_temp.assume_anon();

  v_payload := public.resolve_board_share(v_share.token);
  ASSERT v_payload IS NOT NULL, 'the opted-in board share must resolve for a guest';
  ASSERT NOT (v_payload ? 'directions')
     AND NOT (v_payload ? 'board_item_directions')
     AND NOT ((v_payload->'board') ? 'directions'),
    'the guest resolve payload must never carry a directions key';
  ASSERT position('Swap this sconce' in v_payload::text) = 0
     AND position('Done — swapped' in v_payload::text) = 0,
    'internal direction note bodies must never leak into the guest payload';

  v_reaction := public.submit_board_share_reaction(
    v_share.token,
    'd5504000-0000-4000-8000-000000000001',
    'approved',
    NULL
  );
  ASSERT v_reaction IS NOT NULL, 'the opted-in guest reaction must be accepted';

  -- Still no table-level access for anon, even mid a live, valid guest
  -- session on this exact board/pin.
  BEGIN
    PERFORM count(*) FROM public.board_item_directions
    WHERE board_item_id = 'd5504000-0000-4000-8000-000000000001';
    RAISE EXCEPTION 'anon unexpectedly reached board_item_directions during a live guest session';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;

  RESET ROLE;

  -- The guest reaction landed in item_feedback (its own channel), never in
  -- board_item_directions, and the direction thread is untouched.
  PERFORM pg_temp.assume_direction_actor('d5500000-0000-4000-8000-000000000001');
  SET LOCAL ROLE authenticated;
  ASSERT EXISTS (
    SELECT 1 FROM public.item_feedback
    WHERE board_item_id = 'd5504000-0000-4000-8000-000000000001'
      AND guest_share_id = v_share.id
      AND verdict = 'approved'
  ), 'the guest reaction must land in item_feedback, attributed to the share';
  ASSERT (
    SELECT count(*) FROM public.board_item_directions
    WHERE board_item_id = 'd5504000-0000-4000-8000-000000000001'
  ) = 2, 'the direction thread must be unchanged by the guest reaction';
  RESET ROLE;
END;
$$;

-- ── 7. studio_boards_overview: aggregate counts, RLS-scoped, no anon ───────
-- Replaces the first cut's unbounded PostgREST nested embed (board-paths
-- review, 2026-09-01) with server-side aggregation. SECURITY INVOKER — RLS
-- on proposal_boards/item_feedback/board_item_directions/document_shares
-- still applies as the calling user.
SET LOCAL ROLE authenticated;
SELECT pg_temp.assume_direction_actor('d5500000-0000-4000-8000-000000000001');

DO $$
DECLARE
  v_row record;
BEGIN
  SELECT * INTO v_row
  FROM public.studio_boards_overview(10) AS overview
  WHERE overview.id = 'd5503000-0000-4000-8000-000000000001';

  ASSERT FOUND, 'the lead (board owner) must see the board in the overview';
  ASSERT v_row.owner_kind = 'project', 'a project-owned board must report owner_kind=project';
  ASSERT v_row.owner_id = 'd5502000-0000-4000-8000-000000000001'::uuid,
    'owner_id must be the project id for a project-owned board';
  ASSERT v_row.owner_name = 'Direction layer project', 'owner_name must be the project name';
  ASSERT v_row.has_active_share = true, 'the still-active opted-in share must be reported';
  ASSERT v_row.verdict_guest_approved = 1,
    format('the one guest approval must be counted on the guest side: got %s', v_row.verdict_guest_approved);
  ASSERT v_row.verdict_client_approved = 0, 'no client (signed-in) verdicts exist on this board';
  ASSERT v_row.unresolved_direction_count = 2,
    format('both surviving direction notes are unresolved: got %s', v_row.unresolved_direction_count);
END;
$$;

-- A non-member authenticated designer's RLS-scoped read simply omits the board.
SELECT pg_temp.assume_direction_actor('d5500000-0000-4000-8000-000000000003');

DO $$
BEGIN
  ASSERT (
    SELECT count(*) FROM public.studio_boards_overview(10) AS overview
    WHERE overview.id = 'd5503000-0000-4000-8000-000000000001'
  ) = 0, 'a non-member must not see this board in the studio overview';
END;
$$;

RESET ROLE;

-- anon has no EXECUTE on the overview RPC at all.
SET LOCAL ROLE anon;
SELECT pg_temp.assume_anon();

DO $$
BEGIN
  BEGIN
    PERFORM public.studio_boards_overview(10);
    RAISE EXCEPTION 'anon unexpectedly has EXECUTE on studio_boards_overview';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
END;
$$;

RESET ROLE;

ROLLBACK;
