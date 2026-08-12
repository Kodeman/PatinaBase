-- Mood-board storage + third-target share regressions (00406)
-- Run after a fresh reset:
--   psql 'postgresql://postgres:postgres@127.0.0.1:54322/postgres' \
--     -v ON_ERROR_STOP=1 \
--     -f supabase/tests/mood_boards/share_security_test.sql

BEGIN;

SET LOCAL statement_timeout = '20s';

CREATE OR REPLACE FUNCTION pg_temp.assume_mood_board_actor(
  p_actor uuid,
  p_role text DEFAULT 'authenticated'
)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM set_config(
    'request.jwt.claims',
    jsonb_strip_nulls(jsonb_build_object(
      'sub', p_actor,
      'role', p_role
    ))::text,
    true
  );
  PERFORM set_config(
    'request.jwt.claim.sub',
    COALESCE(p_actor::text, ''),
    true
  );
  PERFORM set_config('request.jwt.claim.role', p_role, true);
END;
$$;

-- A mutable draft board gives the share resolver both safe and deliberately
-- unsafe item data to project.
INSERT INTO public.proposal_boards (
  id,
  proposal_id,
  name,
  canvas_width,
  canvas_height,
  background_color,
  sections,
  status,
  sort_order
)
VALUES (
  'c4061000-0000-4000-8000-000000000001',
  'b3900000-0000-4000-8000-000000000001',
  'Share security board',
  1440,
  960,
  '#F4EFE8',
  '[{"id":"hero","name":"Hero","color":"#C8A27A"}]'::jsonb,
  'active',
  0
);

INSERT INTO public.proposal_board_items (
  id,
  board_id,
  type,
  x,
  y,
  width,
  height,
  z_index,
  image_url,
  content,
  data
)
VALUES (
  'c4061100-0000-4000-8000-000000000001',
  'c4061000-0000-4000-8000-000000000001',
  'image',
  12,
  24,
  320,
  180,
  1,
  'https://example.invalid/public-board-image.webp',
  'Guest-safe caption',
  '{
    "name":"Reference image",
    "section_id":"hero",
    "vendor_name":"Visible vendor",
    "price_cents":12500,
    "cost_cents":7000,
    "internal_note":"never expose this",
    "proposal_id":"b3900000-0000-4000-8000-000000000001"
  }'::jsonb
);

-- A separately owned live board exercises the project authorization branch.
-- It deliberately has no proposal_id; sharing this fixture cannot pass through
-- the already-covered proposal ownership leg by accident.
INSERT INTO public.proposal_boards (
  id,
  project_id,
  name,
  canvas_width,
  canvas_height,
  background_color,
  sections,
  status,
  sort_order
)
VALUES (
  'c4061000-0000-4000-8000-000000000002',
  'b0000000-0000-0000-0000-0000000000d1',
  'Project-owned share security board',
  1200,
  800,
  '#FAF8F5',
  '[{"id":"project-zone","name":"Project zone"}]'::jsonb,
  'active',
  1
);

INSERT INTO public.proposal_board_items (
  id,
  board_id,
  type,
  x,
  y,
  width,
  height,
  z_index,
  content,
  data
)
VALUES (
  'c4061100-0000-4000-8000-000000000002',
  'c4061000-0000-4000-8000-000000000002',
  'note',
  36,
  48,
  240,
  120,
  1,
  'Project-only guest-safe note',
  '{"section_id":"project-zone","internal_note":"must stay private"}'::jsonb
);

DO $$
DECLARE
  v_result text;
BEGIN
  ASSERT EXISTS (
    SELECT 1
    FROM storage.buckets AS bucket
    WHERE bucket.id = 'proposal-mood-boards'
      AND NOT bucket.public
      AND 'image/gif' = ANY (bucket.allowed_mime_types)
  ), 'proposal-mood-boards must stay private and accept GIF uploads';

  ASSERT NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'document_shares'
      AND column_name = 'scope'
  ), 'document_shares must derive target kind from FKs, not a scope column';

  v_result := pg_get_function_result(
    'public.create_document_share(uuid,text,jsonb,timestamp with time zone)'::regprocedure
  );
  ASSERT v_result = 'TABLE(id uuid, token text)',
    format('proposal share mint signature drifted: %s', v_result);

  v_result := pg_get_function_result(
    'public.resolve_document_share(text)'::regprocedure
  );
  ASSERT v_result = 'TABLE(proposal_id uuid, visibility jsonb, label text, studio_name text)',
    format('proposal share resolver signature drifted: %s', v_result);

  v_result := pg_get_function_result(
    'public.resolve_spec_book_share(text)'::regprocedure
  );
  ASSERT v_result = 'jsonb',
    format('spec-book resolver signature drifted: %s', v_result);

  ASSERT has_function_privilege(
    'authenticated',
    'public.create_board_share(uuid,text,timestamp with time zone)',
    'EXECUTE'
  ), 'authenticated must be able to mint board shares';
  ASSERT NOT has_function_privilege(
    'anon',
    'public.create_board_share(uuid,text,timestamp with time zone)',
    'EXECUTE'
  ), 'anon must not mint board shares';

  BEGIN
    INSERT INTO public.document_shares (
      id, token_hash, visibility, status, created_by
    ) VALUES (
      'c4061200-0000-4000-8000-000000000001',
      repeat('1', 64),
      '{}',
      'active',
      'a0000000-0000-0000-0000-000000000004'
    );
    RAISE EXCEPTION 'targetless share unexpectedly inserted';
  EXCEPTION WHEN check_violation THEN
    NULL;
  END;

  BEGIN
    INSERT INTO public.document_shares (
      id,
      proposal_id,
      board_id,
      token_hash,
      visibility,
      status,
      created_by
    ) VALUES (
      'c4061200-0000-4000-8000-000000000002',
      'b3900000-0000-4000-8000-000000000001',
      'c4061000-0000-4000-8000-000000000001',
      repeat('2', 64),
      '{}',
      'active',
      'a0000000-0000-0000-0000-000000000004'
    );
    RAISE EXCEPTION 'multi-target share unexpectedly inserted';
  EXCEPTION WHEN check_violation THEN
    NULL;
  END;
END;
$$;

-- An exact design-studio co-member (not the proposal's designer) can manage
-- the shared bucket path. A client cannot.
SET LOCAL ROLE authenticated;
SELECT pg_temp.assume_mood_board_actor(
  'a0000000-0000-0000-0000-000000000003'
);

INSERT INTO storage.objects(bucket_id, name, metadata)
VALUES (
  'proposal-mood-boards',
  'b3900000-0000-4000-8000-000000000001/boards/c4061000-0000-4000-8000-000000000001/co-member.gif',
  '{"mimetype":"image/gif"}'::jsonb
);

RESET ROLE;
SET LOCAL ROLE anon;
DO $$
BEGIN
  ASSERT NOT EXISTS (
    SELECT 1
    FROM storage.objects
    WHERE bucket_id = 'proposal-mood-boards'
      AND name = 'b3900000-0000-4000-8000-000000000001/boards/c4061000-0000-4000-8000-000000000001/co-member.gif'
  ), 'private working object must not be anonymously readable';
END;
$$;

RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT pg_temp.assume_mood_board_actor(
  'a0000000-0000-0000-0000-000000000005'
);

DO $$
BEGIN
  BEGIN
    INSERT INTO storage.objects(bucket_id, name, metadata)
    VALUES (
      'proposal-mood-boards',
      'b3900000-0000-4000-8000-000000000001/boards/c4061000-0000-4000-8000-000000000001/client-denied.gif',
      '{"mimetype":"image/gif"}'::jsonb
    );
    RAISE EXCEPTION 'client unexpectedly inserted a proposal board asset';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
END;
$$;

RESET ROLE;

DO $$
DECLARE
  v_board_share_id uuid;
  v_board_token text;
  v_proposal_share_id uuid;
  v_proposal_token text;
  v_resolved_proposal_id uuid;
  v_payload jsonb;
  v_data jsonb;
  v_nonboard_matches integer;
  v_count integer;
  v_project_board_share_id uuid;
  v_project_board_token text;
  v_project_payload jsonb;
BEGIN
  -- Preserve the established proposal-token path as a live compatibility
  -- check, not merely a catalog-signature assertion.
  PERFORM pg_temp.assume_mood_board_actor(
    'a0000000-0000-0000-0000-000000000004'
  );

  SELECT share.id, share.token
  INTO v_proposal_share_id, v_proposal_token
  FROM public.create_document_share(
    'b3900000-0000-4000-8000-000000000001',
    'Proposal compatibility',
    '{"feedbackEnabled":false}'::jsonb,
    now() + interval '1 day'
  ) AS share;

  SELECT resolved.proposal_id
  INTO v_resolved_proposal_id
  FROM public.resolve_document_share(v_proposal_token) AS resolved;

  ASSERT v_resolved_proposal_id = 'b3900000-0000-4000-8000-000000000001'::uuid,
    'proposal tokens must continue resolving through resolve_document_share';

  -- Co-member minting is the intentional authorization expansion.
  PERFORM pg_temp.assume_mood_board_actor(
    'a0000000-0000-0000-0000-000000000003'
  );

  SELECT share.id, share.token
  INTO v_board_share_id, v_board_token
  FROM public.create_board_share(
    'c4061000-0000-4000-8000-000000000001',
    'Board guest link',
    now() + interval '1 day'
  ) AS share;

  ASSERT length(v_board_token) = 64
     AND v_board_token ~ '^[0-9a-f]{64}$',
    'board share token must contain 32 random bytes encoded as lowercase hex';

  ASSERT EXISTS (
    SELECT 1
    FROM public.document_shares AS share
    WHERE share.id = v_board_share_id
      AND share.proposal_id IS NULL
      AND share.spec_book_artifact_id IS NULL
      AND share.board_id = 'c4061000-0000-4000-8000-000000000001'::uuid
      AND share.token_hash = encode(
        extensions.digest(v_board_token, 'sha256'),
        'hex'
      )
      AND share.token_hash <> v_board_token
      AND share.visibility = '{"feedbackEnabled":false}'::jsonb
  ), 'board share must persist only the token hash and one board target';

  SELECT count(*) INTO v_nonboard_matches
  FROM public.resolve_document_share(v_board_token);
  ASSERT v_nonboard_matches = 0,
    'board tokens must not resolve through the proposal-token API';

  ASSERT public.resolve_spec_book_share(v_board_token) IS NULL,
    'board tokens must not resolve through the spec-book-token API';

  ASSERT public.resolve_board_share('not-a-token') IS NULL,
    'malformed tokens must fail closed';

  v_payload := public.resolve_board_share(v_board_token);
  ASSERT v_payload IS NOT NULL, 'active board token must resolve';
  ASSERT NOT (v_payload ? 'proposal_id')
     AND NOT (v_payload ? 'project_id')
     AND NOT ((v_payload->'board') ? 'proposal_id')
     AND NOT ((v_payload->'board') ? 'project_id'),
    'board share payload must not reveal a parent proposal or project id';
  ASSERT v_payload #> '{board,sections}' =
    '[{"id":"hero","name":"Hero","color":"#C8A27A"}]'::jsonb,
    'board section definitions must survive the guest projection';

  v_data := v_payload #> '{board,items,0,data}';
  ASSERT v_data->>'section_id' = 'hero'
     AND v_data->>'name' = 'Reference image',
    'explicit client-safe visual board data must remain available';
  ASSERT NOT (v_data ? 'cost_cents')
     AND NOT (v_data ? 'vendor_name')
     AND NOT (v_data ? 'price_cents')
     AND NOT (v_data ? 'internal_note')
     AND NOT (v_data ? 'proposal_id'),
    'arbitrary/internal item data must not escape the resolver allowlist';

  SELECT view_count INTO v_count
  FROM public.document_shares
  WHERE id = v_board_share_id;
  ASSERT v_count = 1, 'one successful board resolution must count one view';

  ASSERT public.revoke_document_share(v_board_share_id),
    'studio co-member must be able to revoke the board share';
  ASSERT public.resolve_board_share(v_board_token) IS NULL,
    'revoked board share must fail closed';

  SELECT view_count INTO v_count
  FROM public.document_shares
  WHERE id = v_board_share_id;
  ASSERT v_count = 1,
    'failed/revoked resolutions must not increment view_count';

  -- AC2.16: mint, resolve, and revoke a genuinely project-owned board. The
  -- explicit owner-shape assertion prevents this from becoming a duplicate of
  -- the proposal fixture if future seed/schema changes drift.
  ASSERT EXISTS (
    SELECT 1
    FROM public.proposal_boards AS board
    WHERE board.id = 'c4061000-0000-4000-8000-000000000002'::uuid
      AND board.proposal_id IS NULL
      AND board.project_id = 'b0000000-0000-0000-0000-0000000000d1'::uuid
  ), 'AC2.16 fixture must be project-owned with no proposal';

  PERFORM pg_temp.assume_mood_board_actor(
    'a0000000-0000-0000-0000-000000000005'
  );
  BEGIN
    PERFORM public.create_board_share(
      'c4061000-0000-4000-8000-000000000002',
      'Outsider project share',
      now() + interval '1 day'
    );
    RAISE EXCEPTION 'client unexpectedly shared a project-owned board';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;

  PERFORM pg_temp.assume_mood_board_actor(
    'a0000000-0000-0000-0000-000000000003'
  );
  SELECT share.id, share.token
  INTO v_project_board_share_id, v_project_board_token
  FROM public.create_board_share(
    'c4061000-0000-4000-8000-000000000002',
    'Project board guest link',
    now() + interval '1 day'
  ) AS share;

  ASSERT EXISTS (
    SELECT 1
    FROM public.document_shares AS share
    WHERE share.id = v_project_board_share_id
      AND share.board_id = 'c4061000-0000-4000-8000-000000000002'::uuid
      AND share.proposal_id IS NULL
      AND share.spec_book_artifact_id IS NULL
  ), 'project board share must persist as the sole document-share target';

  v_project_payload := public.resolve_board_share(v_project_board_token);
  ASSERT v_project_payload #>> '{board,id}' =
      'c4061000-0000-4000-8000-000000000002'
     AND v_project_payload #>> '{board,items,0,content}' =
      'Project-only guest-safe note',
    format('project-owned board share must resolve its composition: %s', v_project_payload);
  ASSERT NOT (v_project_payload ? 'project_id')
     AND NOT ((v_project_payload->'board') ? 'project_id')
     AND NOT ((v_project_payload #> '{board,items,0,data}') ? 'internal_note'),
    'project share projection must hide parent identity and private item data';

  ASSERT public.revoke_document_share(v_project_board_share_id),
    'studio co-member must revoke a project-owned board share';
  ASSERT public.resolve_board_share(v_project_board_token) IS NULL,
    'revoked project-owned board share must fail closed';
END;
$$;

ROLLBACK;
