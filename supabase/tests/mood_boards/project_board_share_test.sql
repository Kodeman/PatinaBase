-- Project-owned board share links (00545): mint, resolve, revoke.
-- Guest reactions on an opted-in link (00546): opt-in, write, refusals, cap.
-- Run after a fresh reset:
--   psql 'postgresql://postgres:postgres@127.0.0.1:54322/postgres' \
--     -v ON_ERROR_STOP=1 \
--     -f supabase/tests/mood_boards/project_board_share_test.sql

BEGIN;

SET LOCAL statement_timeout = '20s';

CREATE OR REPLACE FUNCTION pg_temp.assume_share_actor(p_actor uuid)
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

INSERT INTO auth.users (
  id, email, encrypted_password, email_confirmed_at, created_at, updated_at,
  instance_id, aud, role
)
VALUES
  ('a5430000-0000-4000-8000-000000000001', 'share-owner@test.invalid', '', NOW(), NOW(), NOW(),
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('a5430000-0000-4000-8000-000000000002', 'share-client@test.invalid', '', NOW(), NOW(), NOW(),
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('a5430000-0000-4000-8000-000000000003', 'share-foreign@test.invalid', '', NOW(), NOW(), NOW(),
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');

INSERT INTO public.profiles (id, email, full_name, created_at, updated_at)
VALUES
  ('a5430000-0000-4000-8000-000000000001', 'share-owner@test.invalid', 'Share Owner', NOW(), NOW()),
  ('a5430000-0000-4000-8000-000000000002', 'share-client@test.invalid', 'Share Client', NOW(), NOW()),
  ('a5430000-0000-4000-8000-000000000003', 'share-foreign@test.invalid', 'Foreign Designer', NOW(), NOW())
ON CONFLICT (id) DO UPDATE
SET email = EXCLUDED.email, full_name = EXCLUDED.full_name;

INSERT INTO public.projects (id, designer_id, client_id, created_by, name, status)
VALUES (
  'a5431000-0000-4000-8000-000000000001',
  'a5430000-0000-4000-8000-000000000001',
  'a5430000-0000-4000-8000-000000000002',
  'a5430000-0000-4000-8000-000000000001',
  'Share leg project',
  'active'
);

INSERT INTO public.proposal_boards (
  id, proposal_id, project_id, name, canvas_width, canvas_height,
  background_color, sections, status, sort_order
) VALUES (
  'a5432000-0000-4000-8000-000000000001',
  NULL,
  'a5431000-0000-4000-8000-000000000001',
  'Project share board', 1200, 800, '#FAF8F5', '[]'::jsonb, 'active', 0
);

INSERT INTO public.proposal_board_items (
  id, board_id, type, x, y, width, height, z_index, rotation, content, data
) VALUES (
  'a5433000-0000-4000-8000-000000000001',
  'a5432000-0000-4000-8000-000000000001',
  'note', 40, 60, 220, 120, 0, 0, 'Shared note', '{}'::jsonb
);

-- ── The designer mints a link on a PROJECT-owned board ─────────────────────
DO $$
DECLARE
  v_share record;
  v_payload jsonb;
BEGIN
  PERFORM pg_temp.assume_share_actor('a5430000-0000-4000-8000-000000000001');

  -- Minting as `authenticated` keeps the caller out of
  -- guard_document_share_board_payload's postgres-superuser bypass, so the
  -- edition-mint ceremony and its media-projection guard actually run.
  SET LOCAL ROLE authenticated;
  SELECT * INTO v_share
  FROM public.create_board_share(
    'a5432000-0000-4000-8000-000000000001', 'Client preview', NULL
  );
  RESET ROLE;
  ASSERT v_share.id IS NOT NULL, 'a project board must mint a share id';
  ASSERT v_share.token ~ '^[0-9a-f]{64}$', 'a project board must mint a raw token';

  ASSERT (
    SELECT board_id FROM public.document_shares WHERE id = v_share.id
  ) = 'a5432000-0000-4000-8000-000000000001'::uuid,
    'the share row must point at the project board';

  -- Resolve as the guest (anon) leg.
  PERFORM set_config('request.jwt.claims', NULL, true);
  PERFORM set_config('request.jwt.claim.sub', '', true);
  v_payload := public.resolve_board_share(v_share.token);
  ASSERT v_payload IS NOT NULL, 'a project board share must resolve';
  ASSERT v_payload->'board'->>'name' = 'Project share board',
    'the resolved payload must carry the project board';
  ASSERT jsonb_array_length(v_payload->'board'->'items') = 1,
    'the resolved payload must carry the board items';
  ASSERT (
    SELECT view_count FROM public.document_shares WHERE id = v_share.id
  ) = 1, 'resolving must count the view';

  -- Revoke, then the same token must stop resolving.
  PERFORM pg_temp.assume_share_actor('a5430000-0000-4000-8000-000000000001');
  PERFORM public.revoke_document_share(v_share.id);
  ASSERT (
    SELECT status FROM public.document_shares WHERE id = v_share.id
  ) = 'revoked', 'revoke must mark the share revoked';

  PERFORM set_config('request.jwt.claims', NULL, true);
  ASSERT public.resolve_board_share(v_share.token) IS NULL,
    'a revoked project board share must stop resolving';
END;
$$;

-- ── Private/foreign working media stays unshareable on a project board ─────
-- The shared guards (board_media_projection_is_allowed at mint,
-- board_json_media_references_are_allowed at resolve) were only ever proven on
-- the proposal leg. A second board carries a reference the studio does not own.
-- The row is written with the item-media guard disabled, which is exactly the
-- legacy shape those two guards exist to catch.
INSERT INTO public.proposal_boards (
  id, proposal_id, project_id, name, canvas_width, canvas_height,
  background_color, sections, status, sort_order
) VALUES (
  'a5432000-0000-4000-8000-000000000002',
  NULL,
  'a5431000-0000-4000-8000-000000000001',
  'Project board with foreign media', 1200, 800, '#FAF8F5', '[]'::jsonb, 'active', 1
);

ALTER TABLE public.proposal_board_items DISABLE TRIGGER USER;
INSERT INTO public.proposal_board_items (
  id, board_id, type, x, y, width, height, z_index, rotation, image_url, data
) VALUES (
  'a5433000-0000-4000-8000-000000000002',
  'a5432000-0000-4000-8000-000000000002',
  'image', 40, 60, 220, 120, 0, 0,
  'proposal-mood-boards/a5430000-0000-4000-8000-000000000003/private-elevation.png',
  '{}'::jsonb
);
ALTER TABLE public.proposal_board_items ENABLE TRIGGER USER;

DO $$
DECLARE
  v_failed boolean := false;
  v_share_id uuid := 'a5434000-0000-4000-8000-000000000001';
  v_token text := repeat('a', 64);
BEGIN
  ASSERT NOT public.board_media_projection_is_allowed(
    'a5432000-0000-4000-8000-000000000002'
  ), 'a foreign private reference must fail the projection guard';

  PERFORM pg_temp.assume_share_actor('a5430000-0000-4000-8000-000000000001');
  BEGIN
    SET LOCAL ROLE authenticated;
    PERFORM public.create_board_share(
      'a5432000-0000-4000-8000-000000000002', 'Leaky link', NULL
    );
  EXCEPTION WHEN OTHERS THEN
    v_failed := true;
  END;
  RESET ROLE;
  ASSERT v_failed,
    'minting must refuse a project board that references media outside its studio';

  -- Resolve is guarded independently of mint, so it gets its own probe: the
  -- share row is written straight in (the trigger's postgres bypass) with a
  -- payload that carries the same foreign reference.
  PERFORM set_config('request.jwt.claims', NULL, true);
  INSERT INTO public.document_shares (
    id, proposal_id, spec_book_artifact_id, board_id,
    token_hash, label, visibility, status, expires_at, created_by,
    board_payload, board_payload_hash
  )
  SELECT
    v_share_id, NULL, NULL, 'a5432000-0000-4000-8000-000000000002',
    encode(extensions.digest(v_token, 'sha256'), 'hex'),
    'Legacy leaky link', jsonb_build_object('feedbackEnabled', false),
    'active', NULL, 'a5430000-0000-4000-8000-000000000001',
    payload.value,
    encode(extensions.digest(convert_to(payload.value::text, 'UTF8'), 'sha256'), 'hex')
  FROM (
    SELECT public.build_board_share_payload(
      'a5432000-0000-4000-8000-000000000002', v_share_id, 'Legacy leaky link', NULL
    ) AS value
  ) AS payload;

  ASSERT (
    SELECT board_payload::text LIKE '%private-elevation.png%'
    FROM public.document_shares WHERE id = v_share_id
  ), 'the probe payload must actually carry the foreign reference';

  ASSERT public.resolve_board_share(v_token) IS NULL,
    'resolving must refuse a payload referencing media outside the studio';
END;
$$;

-- ── A designer outside the studio may not mint one ─────────────────────────
DO $$
DECLARE v_failed boolean := false;
BEGIN
  PERFORM pg_temp.assume_share_actor('a5430000-0000-4000-8000-000000000003');
  BEGIN
    SET LOCAL ROLE authenticated;
    PERFORM public.create_board_share(
      'a5432000-0000-4000-8000-000000000001', 'Stolen', NULL
    );
  EXCEPTION WHEN OTHERS THEN
    v_failed := true;
  END;
  RESET ROLE;
  ASSERT v_failed, 'a foreign designer must not mint a project board share';
END;
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- Guest reactions (00546)
-- ═══════════════════════════════════════════════════════════════════════════

INSERT INTO public.proposal_boards (
  id, proposal_id, project_id, name, canvas_width, canvas_height,
  background_color, sections, status, sort_order
) VALUES (
  'a5432000-0000-4000-8000-000000000003',
  NULL,
  'a5431000-0000-4000-8000-000000000001',
  'Reaction board', 1200, 800, '#FAF8F5', '[]'::jsonb, 'active', 2
);

INSERT INTO public.proposal_board_items (
  id, board_id, type, x, y, width, height, z_index, rotation, content, data
) VALUES
  ('a5433000-0000-4000-8000-000000000011',
   'a5432000-0000-4000-8000-000000000003',
   'note', 40, 60, 220, 120, 0, 0, 'Reactable note', '{}'::jsonb),
  ('a5433000-0000-4000-8000-000000000012',
   'a5432000-0000-4000-8000-000000000003',
   'note', 300, 60, 220, 120, 1, 0, 'Second reactable note', '{}'::jsonb);

-- ── A link minted WITHOUT the opt-in is structurally non-interactive ───────
DO $$
DECLARE
  v_share record;
  v_payload jsonb;
  v_failed boolean := false;
BEGIN
  PERFORM pg_temp.assume_share_actor('a5430000-0000-4000-8000-000000000001');
  SET LOCAL ROLE authenticated;
  SELECT * INTO v_share
  FROM public.create_board_share(
    'a5432000-0000-4000-8000-000000000003', 'View only', NULL
  );
  RESET ROLE;

  ASSERT NOT (
    SELECT board_reactions_enabled
    FROM public.document_shares WHERE id = v_share.id
  ), 'the opt-in must default to off';

  PERFORM set_config('request.jwt.claims', NULL, true);
  PERFORM set_config('request.jwt.claim.sub', '', true);
  v_payload := public.resolve_board_share(v_share.token);
  ASSERT v_payload IS NOT NULL, 'a view-only link must still resolve';
  ASSERT (v_payload->>'reactionsEnabled') = 'false',
    'a view-only link must declare the capability off';
  ASSERT NOT (v_payload ? 'reactions'),
    'a view-only resolve payload must not even carry a reactions key';

  BEGIN
    SET LOCAL ROLE anon;
    PERFORM public.submit_board_share_reaction(
      v_share.token, 'a5433000-0000-4000-8000-000000000011', 'approved', NULL
    );
  EXCEPTION WHEN OTHERS THEN
    v_failed := true;
  END;
  RESET ROLE;
  ASSERT v_failed, 'a link without the opt-in must refuse a guest reaction';
  ASSERT (SELECT count(*) FROM public.item_feedback WHERE guest_share_id = v_share.id) = 0,
    'a refused reaction must write nothing';
END;
$$;

-- ── An opted-in link takes reactions, once per pin, and shows them back ────
DO $$
DECLARE
  v_share record;
  v_payload jsonb;
  v_row public.item_feedback;
  v_failed boolean := false;
BEGIN
  PERFORM pg_temp.assume_share_actor('a5430000-0000-4000-8000-000000000001');
  SET LOCAL ROLE authenticated;
  SELECT * INTO v_share
  FROM public.create_board_share(
    'a5432000-0000-4000-8000-000000000003', 'Client reactions', NULL, true
  );
  RESET ROLE;

  ASSERT (
    SELECT board_reactions_enabled
    FROM public.document_shares WHERE id = v_share.id
  ), 'the opt-in must persist on the share row';

  PERFORM set_config('request.jwt.claims', NULL, true);
  PERFORM set_config('request.jwt.claim.sub', '', true);
  v_payload := public.resolve_board_share(v_share.token);
  ASSERT (v_payload->>'reactionsEnabled') = 'true',
    'an opted-in link must declare the capability on';
  ASSERT jsonb_array_length(v_payload->'reactions') = 0,
    'an untouched opted-in link must resolve with no reactions yet';
  -- Money never crosses the guest boundary, reactions or not.
  ASSERT v_payload::text NOT ILIKE '%price_cents%'
     AND v_payload::text NOT ILIKE '%trade_price%'
     AND v_payload::text NOT ILIKE '%wholesale%',
    'a guest payload must carry no pricing of any kind';

  SET LOCAL ROLE anon;
  PERFORM public.submit_board_share_reaction(
    v_share.token, 'a5433000-0000-4000-8000-000000000011', 'approved', 'Love this one'
  );
  RESET ROLE;

  SELECT * INTO v_row
  FROM public.item_feedback
  WHERE guest_share_id = v_share.id
    AND board_item_id = 'a5433000-0000-4000-8000-000000000011';
  ASSERT FOUND, 'an opted-in link must write the guest verdict';
  ASSERT v_row.client_id IS NULL,
    'a guest verdict attributes to the share, never to a user';
  ASSERT v_row.verdict = 'approved' AND v_row.body = 'Love this one',
    'the guest verdict must carry its tap and note';

  -- The write does not open a read. `anon` holds table-level SELECT on these
  -- (legacy grant posture), so RLS is the only wall — and it must hold, or a
  -- guest could read every share's token_hash and every link's reactions.
  SET LOCAL ROLE anon;
  ASSERT (SELECT count(*) FROM public.item_feedback) = 0
     AND (SELECT count(*) FROM public.document_shares) = 0
     AND (SELECT count(*) FROM public.item_feedback_events) = 0,
    'a guest must read nothing directly from the share or feedback tables';
  RESET ROLE;

  -- Idempotency: the same pin re-tapped updates in place.
  SET LOCAL ROLE anon;
  PERFORM public.submit_board_share_reaction(
    v_share.token, 'a5433000-0000-4000-8000-000000000011', 'rejected', NULL
  );
  RESET ROLE;
  ASSERT (
    SELECT count(*) FROM public.item_feedback
    WHERE guest_share_id = v_share.id
      AND board_item_id = 'a5433000-0000-4000-8000-000000000011'
  ) = 1, 're-tapping must update the row, never stack a second one';
  ASSERT (
    SELECT verdict FROM public.item_feedback
    WHERE guest_share_id = v_share.id
      AND board_item_id = 'a5433000-0000-4000-8000-000000000011'
  ) = 'rejected', 're-tapping must record the new verdict';

  -- A pin on another board is not this token's business.
  BEGIN
    SET LOCAL ROLE anon;
    PERFORM public.submit_board_share_reaction(
      v_share.token, 'a5433000-0000-4000-8000-000000000001', 'approved', NULL
    );
  EXCEPTION WHEN OTHERS THEN
    v_failed := true;
  END;
  RESET ROLE;
  ASSERT v_failed, 'a guest must not react to a pin outside the shared board';

  -- An over-long note is refused rather than silently truncated.
  v_failed := false;
  BEGIN
    SET LOCAL ROLE anon;
    PERFORM public.submit_board_share_reaction(
      v_share.token, 'a5433000-0000-4000-8000-000000000012', 'approved',
      repeat('x', 281)
    );
  EXCEPTION WHEN OTHERS THEN
    v_failed := true;
  END;
  RESET ROLE;
  ASSERT v_failed, 'an over-long guest note must be refused';

  -- The studio reads its own board's guest verdicts (project-owned board:
  -- the proposal-anchored gate returns nothing, so this proves the 00546
  -- board authority, not the 00267 one).
  PERFORM pg_temp.assume_share_actor('a5430000-0000-4000-8000-000000000001');
  SET LOCAL ROLE authenticated;
  ASSERT (
    SELECT count(*) FROM public.item_feedback
    WHERE board_item_id = 'a5433000-0000-4000-8000-000000000011'
  ) = 1, 'the owning studio must read the guest verdict on its project board';
  RESET ROLE;

  PERFORM pg_temp.assume_share_actor('a5430000-0000-4000-8000-000000000003');
  SET LOCAL ROLE authenticated;
  ASSERT (
    SELECT count(*) FROM public.item_feedback
    WHERE board_item_id = 'a5433000-0000-4000-8000-000000000011'
  ) = 0, 'a designer outside the studio must not read the guest verdict';
  RESET ROLE;

  -- The resolve payload reflects what the link has said so far.
  PERFORM set_config('request.jwt.claims', NULL, true);
  v_payload := public.resolve_board_share(v_share.token);
  ASSERT jsonb_array_length(v_payload->'reactions') = 1
     AND (v_payload #>> '{reactions,0,verdict}') = 'rejected',
    'an opted-in resolve must play the link its own reactions back';

  -- Revocation kills read AND write in the same act.
  PERFORM pg_temp.assume_share_actor('a5430000-0000-4000-8000-000000000001');
  PERFORM public.revoke_document_share(v_share.id);
  PERFORM set_config('request.jwt.claims', NULL, true);
  ASSERT public.resolve_board_share(v_share.token) IS NULL,
    'a revoked reaction link must stop resolving';

  v_failed := false;
  BEGIN
    SET LOCAL ROLE anon;
    PERFORM public.submit_board_share_reaction(
      v_share.token, 'a5433000-0000-4000-8000-000000000012', 'approved', NULL
    );
  EXCEPTION WHEN OTHERS THEN
    v_failed := true;
  END;
  RESET ROLE;
  ASSERT v_failed, 'a revoked reaction link must stop writing';
END;
$$;

-- ── The opt-in cannot be turned on (or off) after the mint ────────────────
DO $$
DECLARE
  v_share record;
  v_failed boolean := false;
BEGIN
  PERFORM pg_temp.assume_share_actor('a5430000-0000-4000-8000-000000000001');
  SET LOCAL ROLE authenticated;
  SELECT * INTO v_share
  FROM public.create_board_share(
    'a5432000-0000-4000-8000-000000000003', 'Still view only', NULL, false
  );
  RESET ROLE;

  BEGIN
    UPDATE public.document_shares
       SET board_reactions_enabled = true
     WHERE id = v_share.id;
  EXCEPTION WHEN OTHERS THEN
    v_failed := true;
  END;
  ASSERT v_failed,
    'a live board link must not gain the reaction capability after mint';
END;
$$;

-- ── The per-share row cap bounds a scripted caller ────────────────────────
DO $$
DECLARE
  v_share record;
  v_failed boolean := false;
  v_overflow_pin uuid := 'a5433000-0000-4000-8000-000000000fff';
BEGIN
  INSERT INTO public.proposal_board_items (
    id, board_id, type, x, y, width, height, z_index, rotation, content, data
  )
  SELECT
    ('a5435000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
    'a5432000-0000-4000-8000-000000000003',
    'note', 0, 0, 100, 100, n, 0, 'cap pin ' || n, '{}'::jsonb
  FROM generate_series(1, 200) AS n;

  INSERT INTO public.proposal_board_items (
    id, board_id, type, x, y, width, height, z_index, rotation, content, data
  ) VALUES (
    v_overflow_pin, 'a5432000-0000-4000-8000-000000000003',
    'note', 0, 0, 100, 100, 900, 0, 'overflow pin', '{}'::jsonb
  );

  PERFORM pg_temp.assume_share_actor('a5430000-0000-4000-8000-000000000001');
  SET LOCAL ROLE authenticated;
  SELECT * INTO v_share
  FROM public.create_board_share(
    'a5432000-0000-4000-8000-000000000003', 'Cap probe', NULL, true
  );
  RESET ROLE;

  INSERT INTO public.item_feedback (board_item_id, client_id, guest_share_id, verdict)
  SELECT
    ('a5435000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
    NULL, v_share.id, 'approved'
  FROM generate_series(1, 200) AS n;

  PERFORM set_config('request.jwt.claims', NULL, true);
  BEGIN
    SET LOCAL ROLE anon;
    PERFORM public.submit_board_share_reaction(
      v_share.token, v_overflow_pin, 'approved', NULL
    );
  EXCEPTION WHEN OTHERS THEN
    v_failed := true;
  END;
  RESET ROLE;
  ASSERT v_failed, 'a link past its row cap must refuse a new pin';

  -- A pin already inside the cap is still updatable — the cap bounds growth,
  -- not a guest changing their mind.
  SET LOCAL ROLE anon;
  PERFORM public.submit_board_share_reaction(
    v_share.token, 'a5435000-0000-4000-8000-000000000001'::uuid, 'rejected', NULL
  );
  RESET ROLE;
  ASSERT (
    SELECT count(*) FROM public.item_feedback WHERE guest_share_id = v_share.id
  ) = 200, 'the cap must not be crossed by an update';
END;
$$;

ROLLBACK;
