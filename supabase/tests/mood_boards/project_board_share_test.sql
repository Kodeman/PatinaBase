-- Project-owned board share links (00548): mint, resolve, revoke.
-- Guest reactions on an opted-in link (00549): opt-in, write, refusals, cap.
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
-- Guest reactions (00549)
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
  -- The two columns that describe the same capability must never disagree.
  ASSERT (
    SELECT visibility = '{"feedbackEnabled":true}'::jsonb
    FROM public.document_shares WHERE id = v_share.id
  ), 'visibility must agree with board_reactions_enabled';

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
  -- the proposal-anchored gate returns nothing, so this proves the 00549
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

-- ── A pin added after the mint is outside the frozen edition ───────────────
DO $$
DECLARE
  v_share record;
  v_late_pin uuid := 'a5436000-0000-4000-8000-000000000001';
  v_err text := '';
BEGIN
  INSERT INTO public.proposal_boards (
    id, proposal_id, project_id, name, canvas_width, canvas_height,
    background_color, sections, status, sort_order
  ) VALUES (
    'a5432000-0000-4000-8000-000000000004', NULL,
    'a5431000-0000-4000-8000-000000000001',
    'Edition board', 1200, 800, '#FAF8F5', '[]'::jsonb, 'active', 3
  );
  INSERT INTO public.proposal_board_items (
    id, board_id, type, x, y, width, height, z_index, rotation, content, data
  ) VALUES (
    'a5436000-0000-4000-8000-000000000000',
    'a5432000-0000-4000-8000-000000000004',
    'note', 10, 10, 200, 100, 0, 0, 'Present at mint', '{}'::jsonb
  );

  PERFORM pg_temp.assume_share_actor('a5430000-0000-4000-8000-000000000001');
  SET LOCAL ROLE authenticated;
  SELECT * INTO v_share
  FROM public.create_board_share(
    'a5432000-0000-4000-8000-000000000004', 'Edition probe', NULL, true
  );
  RESET ROLE;

  -- Added AFTER the token froze its edition.
  INSERT INTO public.proposal_board_items (
    id, board_id, type, x, y, width, height, z_index, rotation, content, data
  ) VALUES (
    v_late_pin, 'a5432000-0000-4000-8000-000000000004',
    'note', 300, 10, 200, 100, 1, 0, 'Added later', '{}'::jsonb
  );

  PERFORM set_config('request.jwt.claims', NULL, true);
  PERFORM set_config('request.jwt.claim.sub', '', true);
  SET LOCAL ROLE anon;
  BEGIN
    PERFORM public.submit_board_share_reaction(
      v_share.token, v_late_pin, 'approved', NULL
    );
  EXCEPTION WHEN OTHERS THEN
    v_err := SQLERRM;
  END;
  ASSERT v_err = 'this link cannot take reactions',
    format('a pin outside the frozen edition must be refused, got: %s', v_err);

  -- A pin that WAS in the edition still works on the same token.
  PERFORM public.submit_board_share_reaction(
    v_share.token, 'a5436000-0000-4000-8000-000000000000', 'approved', NULL
  );
  RESET ROLE;
  ASSERT (
    SELECT count(*) FROM public.item_feedback WHERE guest_share_id = v_share.id
  ) = 1, 'the frozen-edition check must not block a pin the reader was shown';

  -- 'comment' is not a guest reaction — approve or pass, nothing else.
  v_err := '';
  SET LOCAL ROLE anon;
  BEGIN
    PERFORM public.submit_board_share_reaction(
      v_share.token, 'a5436000-0000-4000-8000-000000000000', 'comment', 'note only'
    );
  EXCEPTION WHEN OTHERS THEN
    v_err := SQLERRM;
  END;
  RESET ROLE;
  ASSERT v_err = 'a reaction is approved or rejected',
    format('a comment-only verdict must be refused, got: %s', v_err);

  -- An expired link is as dead as a revoked one, for read AND write.
  UPDATE public.document_shares
     SET expires_at = now() - interval '1 hour'
   WHERE id = v_share.id;
  PERFORM set_config('request.jwt.claims', NULL, true);
  ASSERT public.resolve_board_share(v_share.token) IS NULL,
    'an expired reaction link must stop resolving';
  v_err := '';
  SET LOCAL ROLE anon;
  BEGIN
    PERFORM public.submit_board_share_reaction(
      v_share.token, 'a5436000-0000-4000-8000-000000000000', 'rejected', NULL
    );
  EXCEPTION WHEN OTHERS THEN
    v_err := SQLERRM;
  END;
  RESET ROLE;
  ASSERT v_err = 'this link cannot take reactions',
    format('an expired reaction link must stop writing, got: %s', v_err);
END;
$$;

-- ── A row names exactly one author ─────────────────────────────────────────
DO $$
DECLARE
  v_share_id uuid;
  v_err text := '';
BEGIN
  SELECT id INTO v_share_id FROM public.document_shares
  WHERE board_id = 'a5432000-0000-4000-8000-000000000004' LIMIT 1;

  BEGIN
    INSERT INTO public.item_feedback (
      board_item_id, client_id, guest_share_id, verdict
    ) VALUES (
      'a5436000-0000-4000-8000-000000000000',
      'a5430000-0000-4000-8000-000000000002',
      v_share_id, 'approved'
    );
  EXCEPTION WHEN OTHERS THEN
    v_err := SQLERRM;
  END;
  ASSERT v_err LIKE '%item_feedback_one_author%',
    format('a verdict may not name both a client and a share, got: %s', v_err);

  v_err := '';
  BEGIN
    INSERT INTO public.item_feedback (board_item_id, client_id, verdict)
    VALUES ('a5436000-0000-4000-8000-000000000000', NULL, 'approved');
  EXCEPTION WHEN OTHERS THEN
    v_err := SQLERRM;
  END;
  ASSERT v_err LIKE '%item_feedback_one_author%',
    format('a verdict must name an author at all, got: %s', v_err);
END;
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- The four verdict RPCs: cross-studio refused, studio co-member allowed —
-- on BOTH owner kinds. (RULED: the proposal-leg widening from designer_id
-- equality to studio co-membership is the intended posture.)
-- ═══════════════════════════════════════════════════════════════════════════

INSERT INTO auth.users (
  id, email, encrypted_password, email_confirmed_at, created_at, updated_at,
  instance_id, aud, role
) VALUES (
  'a5430000-0000-4000-8000-000000000004', 'share-comember@test.invalid', '', NOW(), NOW(), NOW(),
  '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'
);

INSERT INTO public.profiles (id, email, full_name, created_at, updated_at)
VALUES ('a5430000-0000-4000-8000-000000000004', 'share-comember@test.invalid', 'Studio Co-member', NOW(), NOW())
ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email;

INSERT INTO public.organizations (id, type, name, slug, status)
VALUES (
  'a5437000-0000-4000-8000-000000000001',
  'design_studio', 'Share Test Studio', 'share-test-studio', 'active'
);

INSERT INTO public.organization_members (organization_id, user_id, role, status)
VALUES
  ('a5437000-0000-4000-8000-000000000001', 'a5430000-0000-4000-8000-000000000001', 'owner', 'active'),
  ('a5437000-0000-4000-8000-000000000001', 'a5430000-0000-4000-8000-000000000004', 'member', 'active');

-- A PROPOSAL-owned board, so the widening is exercised on the leg that always
-- had a designer_id to compare against.
-- A proposal that is already 'sent' (the state the client verdict gate wants).
-- Its children are written under session_replication_role='replica' because
-- guard_proposal_child_draft_only() refuses children on a sent proposal and
-- guard_proposal_authority() reserves the sent transition for send_proposal();
-- the whole dispatch rail is beside the point for a verdict-authority fixture.
INSERT INTO public.proposals (id, designer_id, client_id, title, status)
VALUES (
  'a5438000-0000-4000-8000-000000000001',
  'a5430000-0000-4000-8000-000000000001',
  'a5430000-0000-4000-8000-000000000002',
  'Share leg proposal', 'sent'
);

SET LOCAL session_replication_role = 'replica';

INSERT INTO public.proposal_items (
  id, proposal_id, name, unit_price, unit_sell_price, line_total_cents
) VALUES (
  'a5439000-0000-4000-8000-000000000001',
  'a5438000-0000-4000-8000-000000000001',
  'A proposal line', 0, 0, 0
);

INSERT INTO public.proposal_boards (
  id, proposal_id, project_id, name, canvas_width, canvas_height,
  background_color, sections, status, sort_order
) VALUES (
  'a5432000-0000-4000-8000-000000000005',
  'a5438000-0000-4000-8000-000000000001', NULL,
  'Proposal share board', 1200, 800, '#FAF8F5', '[]'::jsonb, 'active', 0
);

INSERT INTO public.proposal_board_items (
  id, board_id, type, x, y, width, height, z_index, rotation, content, data
) VALUES (
  'a5433000-0000-4000-8000-000000000021',
  'a5432000-0000-4000-8000-000000000005',
  'note', 40, 60, 220, 120, 0, 0, 'Proposal board note', '{}'::jsonb
);

SET LOCAL session_replication_role = 'origin';

DO $$
DECLARE
  v_project_fb uuid;
  v_proposal_fb uuid;
  v_err text := '';
BEGIN
  INSERT INTO public.item_feedback (board_item_id, client_id, verdict, body)
  VALUES (
    'a5433000-0000-4000-8000-000000000011',
    'a5430000-0000-4000-8000-000000000002', 'rejected', 'please revisit'
  ) RETURNING id INTO v_project_fb;

  INSERT INTO public.item_feedback (board_item_id, client_id, verdict, body)
  VALUES (
    'a5433000-0000-4000-8000-000000000021',
    'a5430000-0000-4000-8000-000000000002', 'rejected', 'please revisit'
  ) RETURNING id INTO v_proposal_fb;

  -- ── A designer outside the studio: refused on every RPC, both owner kinds.
  PERFORM pg_temp.assume_share_actor('a5430000-0000-4000-8000-000000000003');
  SET LOCAL ROLE authenticated;

  FOR v_err IN
    SELECT unnest(ARRAY[v_project_fb::text, v_proposal_fb::text])
  LOOP
    DECLARE
      v_target uuid := v_err::uuid;
      v_caught text;
    BEGIN
      v_caught := '';
      BEGIN PERFORM public.resolve_item_feedback(v_target);
      EXCEPTION WHEN OTHERS THEN v_caught := SQLERRM; END;
      ASSERT v_caught = 'only the owning designer may resolve',
        format('outside designer must not resolve (%s): %s', v_target, v_caught);

      v_caught := '';
      BEGIN PERFORM public.reopen_item_feedback(v_target);
      EXCEPTION WHEN OTHERS THEN v_caught := SQLERRM; END;
      ASSERT v_caught = 'only the owning designer may reopen',
        format('outside designer must not reopen (%s): %s', v_target, v_caught);

      v_caught := '';
      BEGIN PERFORM public.reply_to_item_feedback(v_target, 'sneaking in');
      EXCEPTION WHEN OTHERS THEN v_caught := SQLERRM; END;
      ASSERT v_caught = 'not authorized to reply',
        format('outside designer must not reply (%s): %s', v_target, v_caught);

      v_caught := '';
      BEGIN
        PERFORM public.escalate_item_feedback_to_decision(
          v_target, 'a543a000-0000-4000-8000-000000000001'
        );
      EXCEPTION WHEN OTHERS THEN v_caught := SQLERRM; END;
      ASSERT v_caught = 'only the owning designer may escalate',
        format('outside designer must not escalate (%s): %s', v_target, v_caught);
    END;
  END LOOP;
  RESET ROLE;

  ASSERT (
    SELECT count(*) FROM public.item_feedback
    WHERE id IN (v_project_fb, v_proposal_fb) AND resolved_at IS NOT NULL
  ) = 0, 'a refused resolve must not have landed';
  ASSERT (
    SELECT count(*) FROM public.item_feedback_events
    WHERE feedback_id IN (v_project_fb, v_proposal_fb) AND kind = 'replied'
  ) = 0, 'a refused reply must not have threaded an event';
  ASSERT (
    SELECT count(*) FROM public.item_feedback
    WHERE id IN (v_project_fb, v_proposal_fb) AND decision_id IS NOT NULL
  ) = 0, 'a refused escalation must not have stamped a decision';

  -- ── A studio co-member: allowed on both owner kinds.
  PERFORM pg_temp.assume_share_actor('a5430000-0000-4000-8000-000000000004');
  SET LOCAL ROLE authenticated;

  PERFORM public.resolve_item_feedback(v_project_fb);
  PERFORM public.resolve_item_feedback(v_proposal_fb);
  PERFORM public.reopen_item_feedback(v_project_fb);
  PERFORM public.reply_to_item_feedback(v_proposal_fb, 'On it.');

  -- Escalation clears the authority guard and stops at the decision-ownership
  -- one, which is the wall that stays regardless of studio membership.
  v_err := '';
  BEGIN
    PERFORM public.escalate_item_feedback_to_decision(
      v_proposal_fb, 'a543a000-0000-4000-8000-000000000001'
    );
  EXCEPTION WHEN OTHERS THEN v_err := SQLERRM; END;
  ASSERT v_err LIKE 'decision % not found or not owned',
    format('a co-member must clear the escalate authority guard, got: %s', v_err);
  RESET ROLE;

  ASSERT (
    SELECT resolved_at IS NOT NULL FROM public.item_feedback WHERE id = v_proposal_fb
  ), 'a studio co-member must resolve a proposal-board verdict';
  ASSERT (
    SELECT resolved_at IS NULL FROM public.item_feedback WHERE id = v_project_fb
  ), 'a studio co-member must reopen a project-board verdict';
  ASSERT (
    SELECT count(*) FROM public.item_feedback_events
    WHERE feedback_id = v_proposal_fb AND kind = 'replied'
  ) = 1, 'a studio co-member must reply on a proposal-board verdict';
END;
$$;

-- ── The signed-in client still writes her own verdicts (client_id nullable) ─
DO $$
DECLARE v_id uuid;
BEGIN
  PERFORM pg_temp.assume_share_actor('a5430000-0000-4000-8000-000000000002');
  SET LOCAL ROLE authenticated;
  INSERT INTO public.item_feedback (proposal_item_id, verdict, body)
  VALUES ('a5439000-0000-4000-8000-000000000001', 'approved', 'happy with this')
  RETURNING id INTO v_id;
  ASSERT (
    SELECT client_id FROM public.item_feedback WHERE id = v_id
  ) = 'a5430000-0000-4000-8000-000000000002'::uuid,
    'the client_id default must still pin a signed-in verdict to its author';
  RESET ROLE;
END;
$$;

-- ── The guest loop actually reaches the designer ───────────────────────────
DO $$
DECLARE
  v_share record;
  v_meta jsonb;
BEGIN
  PERFORM pg_temp.assume_share_actor('a5430000-0000-4000-8000-000000000001');
  SET LOCAL ROLE authenticated;
  SELECT * INTO v_share
  FROM public.create_board_share(
    'a5432000-0000-4000-8000-000000000005', 'Notify probe', NULL, true
  );
  RESET ROLE;

  PERFORM set_config('request.jwt.claims', NULL, true);
  PERFORM set_config('request.jwt.claim.sub', '', true);
  SET LOCAL ROLE anon;
  PERFORM public.submit_board_share_reaction(
    v_share.token, 'a5433000-0000-4000-8000-000000000021', 'approved', NULL
  );
  RESET ROLE;

  SELECT metadata INTO v_meta
  FROM public.notification_log
  WHERE type = 'client_feedback'
    AND user_id = 'a5430000-0000-4000-8000-000000000001'
    AND metadata->>'source' = 'guest_link'
  ORDER BY created_at DESC LIMIT 1;
  ASSERT v_meta IS NOT NULL,
    'a guest reaction must notify the owning designer';
  ASSERT v_meta->>'headline' = 'A guest approved Proposal board note',
    format('the headline must read as a guest''s, got: %s', v_meta->>'headline');
END;
$$;

-- The same, on a PROJECT-owned board — the case that never notified at all
-- before 00549, because the proposal-anchored gate returns no designer there.
DO $$
DECLARE
  v_share record;
  v_meta jsonb;
BEGIN
  PERFORM pg_temp.assume_share_actor('a5430000-0000-4000-8000-000000000001');
  SET LOCAL ROLE authenticated;
  SELECT * INTO v_share
  FROM public.create_board_share(
    'a5432000-0000-4000-8000-000000000001', 'Project notify probe', NULL, true
  );
  RESET ROLE;

  PERFORM set_config('request.jwt.claims', NULL, true);
  PERFORM set_config('request.jwt.claim.sub', '', true);
  SET LOCAL ROLE anon;
  PERFORM public.submit_board_share_reaction(
    v_share.token, 'a5433000-0000-4000-8000-000000000001', 'rejected', NULL
  );
  RESET ROLE;

  SELECT metadata INTO v_meta
  FROM public.notification_log
  WHERE type = 'client_feedback'
    AND user_id = 'a5430000-0000-4000-8000-000000000001'
    AND metadata->>'boardId' = 'a5432000-0000-4000-8000-000000000001'
  ORDER BY created_at DESC LIMIT 1;
  ASSERT v_meta IS NOT NULL,
    'a project-owned board must notify its own designer';
  ASSERT v_meta->>'headline' = 'A guest flagged Shared note',
    format('the project-board headline drifted: %s', v_meta->>'headline');
  ASSERT v_meta->>'deep_link' = '/board/a5432000-0000-4000-8000-000000000001',
    format('a project-board notification must land in the room: %s', v_meta->>'deep_link');
END;
$$;

ROLLBACK;
