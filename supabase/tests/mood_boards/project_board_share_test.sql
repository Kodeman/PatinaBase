-- Project-owned board share links (00548): mint, resolve, revoke.
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

ROLLBACK;
