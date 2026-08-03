-- ═══════════════════════════════════════════════════════════════════════════
-- 00406 — Mood-board storage compatibility and board-scoped shares
--
-- Storage lineage: 00131 (public bucket + proposal-owner policies) → 00272
-- (project-owner policies) → 00406 (GIF + exact design-studio co-members).
-- Public reads are intentionally preserved: the bucket stays public and the
-- storage.objects SELECT policy remains available to PUBLIC.
--
-- document_shares lineage: 00266 → 00380 (proposal/spec-book exactly-one)
-- → 00390 (current proposal-edition token resolver) → 00401 (exact
-- design-studio SELECT + RPC-only mutations) → 00406 (third target: board).
-- There is deliberately NO scope discriminator. Target kind is derived from
-- exactly one non-null FK, so existing proposal/spec-book rows and every
-- existing token/RPC signature keep their current contract.
--
-- Function grafts:
--   • revoke_document_share(uuid) starts from the latest 00401 body; the only
--     delta is the board authorization leg.
--   • create_document_share/resolve_document_share remain the latest 00390
--     bodies, byte-for-byte untouched.
--   • create_spec_book_share remains the latest 00401 body and
--     resolve_spec_book_share remains the latest 00380 body, both untouched.
-- ═════════════════════════════════════════════════════════════════════════════

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- ── 1. Bucket MIME/public-read compatibility ───────────────────────────────

UPDATE storage.buckets AS bucket
SET public = true,
    allowed_mime_types = (
      SELECT ARRAY(
        SELECT DISTINCT mime
        FROM unnest(
          COALESCE(bucket.allowed_mime_types, ARRAY[]::text[])
          || ARRAY[
            'image/jpeg',
            'image/png',
            'image/webp',
            'image/avif',
            'image/gif'
          ]::text[]
        ) AS mime
        ORDER BY mime
      )
    )
WHERE bucket.id = 'proposal-mood-boards';

DROP POLICY IF EXISTS "Proposal mood boards are publicly readable"
  ON storage.objects;
CREATE POLICY "Proposal mood boards are publicly readable"
  ON storage.objects FOR SELECT
  TO PUBLIC
  USING (bucket_id = 'proposal-mood-boards');

-- Replace the historical exact-owner policies with the exact design-studio
-- helper from 00399. The helper is SECURITY DEFINER because plain members
-- cannot otherwise inspect a co-member's organization_members row.
DROP POLICY IF EXISTS "Designers can upload proposal mood boards"
  ON storage.objects;
CREATE POLICY "Designers can upload proposal mood boards"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'proposal-mood-boards'
    AND EXISTS (
      SELECT 1
      FROM public.proposals AS proposal
      WHERE proposal.id::text = (storage.foldername(name))[1]
        AND public.is_design_studio_comember(proposal.designer_id)
    )
  );

DROP POLICY IF EXISTS "Designers can replace their proposal mood boards"
  ON storage.objects;
CREATE POLICY "Designers can replace their proposal mood boards"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'proposal-mood-boards'
    AND EXISTS (
      SELECT 1
      FROM public.proposals AS proposal
      WHERE proposal.id::text = (storage.foldername(name))[1]
        AND public.is_design_studio_comember(proposal.designer_id)
    )
  )
  WITH CHECK (
    bucket_id = 'proposal-mood-boards'
    AND EXISTS (
      SELECT 1
      FROM public.proposals AS proposal
      WHERE proposal.id::text = (storage.foldername(name))[1]
        AND public.is_design_studio_comember(proposal.designer_id)
    )
  );

DROP POLICY IF EXISTS "Designers can delete their proposal mood boards"
  ON storage.objects;
CREATE POLICY "Designers can delete their proposal mood boards"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'proposal-mood-boards'
    AND EXISTS (
      SELECT 1
      FROM public.proposals AS proposal
      WHERE proposal.id::text = (storage.foldername(name))[1]
        AND public.is_design_studio_comember(proposal.designer_id)
    )
  );

DROP POLICY IF EXISTS "Designers can upload project board images"
  ON storage.objects;
CREATE POLICY "Designers can upload project board images"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'proposal-mood-boards'
    AND EXISTS (
      SELECT 1
      FROM public.projects AS project
      WHERE project.id::text = (storage.foldername(name))[1]
        AND public.is_design_studio_comember(project.designer_id)
    )
  );

DROP POLICY IF EXISTS "Designers can replace project board images"
  ON storage.objects;
CREATE POLICY "Designers can replace project board images"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'proposal-mood-boards'
    AND EXISTS (
      SELECT 1
      FROM public.projects AS project
      WHERE project.id::text = (storage.foldername(name))[1]
        AND public.is_design_studio_comember(project.designer_id)
    )
  )
  WITH CHECK (
    bucket_id = 'proposal-mood-boards'
    AND EXISTS (
      SELECT 1
      FROM public.projects AS project
      WHERE project.id::text = (storage.foldername(name))[1]
        AND public.is_design_studio_comember(project.designer_id)
    )
  );

DROP POLICY IF EXISTS "Designers can delete project board images"
  ON storage.objects;
CREATE POLICY "Designers can delete project board images"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'proposal-mood-boards'
    AND EXISTS (
      SELECT 1
      FROM public.projects AS project
      WHERE project.id::text = (storage.foldername(name))[1]
        AND public.is_design_studio_comember(project.designer_id)
    )
  );

-- ── 2. Third exactly-one document target ───────────────────────────────────

ALTER TABLE public.document_shares
  ADD COLUMN IF NOT EXISTS board_id uuid
    REFERENCES public.proposal_boards(id) ON DELETE CASCADE;

ALTER TABLE public.document_shares
  DROP CONSTRAINT IF EXISTS document_shares_exactly_one_target;
ALTER TABLE public.document_shares
  ADD CONSTRAINT document_shares_exactly_one_target
  CHECK (num_nonnulls(proposal_id, spec_book_artifact_id, board_id) = 1);

CREATE INDEX IF NOT EXISTS idx_document_shares_board
  ON public.document_shares(board_id, created_at DESC)
  WHERE board_id IS NOT NULL;

COMMENT ON COLUMN public.document_shares.board_id IS
  'Optional board-share target. Exactly one of proposal_id, '
  'spec_book_artifact_id, or board_id is non-null; there is no duplicate scope '
  'discriminator.';

-- 00401's general reparent trigger watches the two historical target columns.
-- Keep it untouched and add the third immutable leg independently.
CREATE OR REPLACE FUNCTION public.guard_document_share_board_retarget()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.board_id IS DISTINCT FROM OLD.board_id THEN
    RAISE EXCEPTION 'document shares cannot be directly retargeted'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_document_share_board_retarget()
  FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS a_guard_document_share_board_retarget_trg
  ON public.document_shares;
CREATE TRIGGER a_guard_document_share_board_retarget_trg
BEFORE UPDATE OF board_id ON public.document_shares
FOR EACH ROW EXECUTE FUNCTION public.guard_document_share_board_retarget();

-- 00401 policy, grafted with a third SELECT leg. Mutations stay RPC-only.
DROP POLICY IF EXISTS document_shares_design_studio_select
  ON public.document_shares;
CREATE POLICY document_shares_design_studio_select
ON public.document_shares FOR SELECT TO authenticated
USING (
  (
    proposal_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.proposals AS proposal
      WHERE proposal.id = document_shares.proposal_id
        AND public.is_design_studio_comember(proposal.designer_id)
    )
  )
  OR (
    spec_book_artifact_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.spec_book_artifacts AS artifact
      JOIN public.spec_book_revisions AS revision
        ON revision.id = artifact.revision_id
      JOIN public.spec_books AS book ON book.id = revision.spec_book_id
      JOIN public.projects AS project ON project.id = book.project_id
      WHERE artifact.id = document_shares.spec_book_artifact_id
        AND public.is_design_studio_comember(project.designer_id)
    )
  )
  OR (
    board_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.proposal_boards AS board
      LEFT JOIN public.proposals AS proposal ON proposal.id = board.proposal_id
      LEFT JOIN public.projects AS project ON project.id = board.project_id
      WHERE board.id = document_shares.board_id
        AND (
          (
            board.proposal_id IS NOT NULL
            AND public.is_design_studio_comember(proposal.designer_id)
          )
          OR (
            board.project_id IS NOT NULL
            AND public.is_design_studio_comember(project.designer_id)
          )
        )
    )
  )
);

GRANT SELECT ON TABLE public.document_shares TO authenticated;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.document_shares
  FROM anon, authenticated;

-- ── 3. Board share mint ────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.create_board_share(
  p_board_id uuid,
  p_label text DEFAULT NULL,
  p_expires_at timestamptz DEFAULT NULL
)
RETURNS TABLE (id uuid, token text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_token text;
  v_hash text;
  v_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'authentication required'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_expires_at IS NOT NULL AND p_expires_at <= now() THEN
    RAISE EXCEPTION 'expiry must be in the future'
      USING ERRCODE = 'check_violation';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.proposal_boards AS board
    LEFT JOIN public.proposals AS proposal ON proposal.id = board.proposal_id
    LEFT JOIN public.projects AS project ON project.id = board.project_id
    WHERE board.id = p_board_id
      AND board.status = 'active'
      AND (
        (
          board.proposal_id IS NOT NULL
          AND proposal.status IN (
            'draft', 'sent', 'viewed', 'accepted', 'declined', 'expired'
          )
          AND public.is_design_studio_comember(proposal.designer_id)
        )
        OR (
          board.project_id IS NOT NULL
          AND public.is_design_studio_comember(project.designer_id)
        )
      )
  ) THEN
    RAISE EXCEPTION 'board not found or not accessible'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  v_hash := encode(extensions.digest(v_token, 'sha256'), 'hex');

  INSERT INTO public.document_shares (
    proposal_id,
    spec_book_artifact_id,
    board_id,
    token_hash,
    label,
    visibility,
    status,
    expires_at,
    created_by
  )
  VALUES (
    NULL,
    NULL,
    p_board_id,
    v_hash,
    NULLIF(btrim(p_label), ''),
    jsonb_build_object('feedbackEnabled', false),
    'active',
    p_expires_at,
    auth.uid()
  )
  RETURNING document_shares.id INTO v_id;

  RETURN QUERY SELECT v_id, v_token;
END;
$$;

COMMENT ON FUNCTION public.create_board_share(uuid, text, timestamptz) IS
  'Mints a view-only board token for an active proposal- or project-owned '
  'board. Returns the raw 64-character token exactly once; only its SHA-256 '
  'hash is persisted.';

-- ── 4. Board-only guest resolver ──────────────────────────────────────────────
-- A distinct resolver preserves resolve_document_share(text)'s TABLE signature
-- and resolve_spec_book_share(text)'s JSON contract. It returns no proposal or
-- project identifiers and uses an explicit client-safe item projection.

CREATE OR REPLACE FUNCTION public.resolve_board_share(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_hash text;
  v_share public.document_shares;
  v_payload jsonb;
BEGIN
  IF p_token IS NULL OR p_token !~ '^[0-9A-Fa-f]{64}$' THEN
    RETURN NULL;
  END IF;

  v_hash := encode(extensions.digest(p_token, 'sha256'), 'hex');

  SELECT share.* INTO v_share
  FROM public.document_shares AS share
  JOIN public.proposal_boards AS board ON board.id = share.board_id
  LEFT JOIN public.proposals AS proposal ON proposal.id = board.proposal_id
  LEFT JOIN public.projects AS project ON project.id = board.project_id
  WHERE share.token_hash = v_hash
    AND share.board_id IS NOT NULL
    AND share.status = 'active'
    AND (share.expires_at IS NULL OR share.expires_at > now())
    AND board.status = 'active'
    AND (
      (
        board.proposal_id IS NOT NULL
        AND proposal.status IN (
          'draft', 'sent', 'viewed', 'accepted', 'declined', 'expired'
        )
      )
      OR board.project_id IS NOT NULL
    )
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  SELECT jsonb_build_object(
    'shareId', v_share.id,
    'label', v_share.label,
    'shareExpiresAt', v_share.expires_at,
    'studioName', COALESCE(profile.full_name, profile.email, 'the studio'),
    'board', jsonb_build_object(
      'id', board.id,
      'name', board.name,
      'cover_image_url', board.cover_image_url,
      'canvas_width', board.canvas_width,
      'canvas_height', board.canvas_height,
      'background_color', board.background_color,
      'sections', CASE
        WHEN jsonb_typeof(board.sections) = 'array' THEN board.sections
        ELSE '[]'::jsonb
      END,
      'items', COALESCE((
        SELECT jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
          'id', board_item.id,
          'type', board_item.type,
          'x', board_item.x,
          'y', board_item.y,
          'width', board_item.width,
          'height', board_item.height,
          'z_index', board_item.z_index,
          'rotation', board_item.rotation,
          'locked', board_item.locked,
          'image_url', board_item.image_url,
          'content', board_item.content,
          'data', jsonb_strip_nulls(jsonb_build_object(
            'name', board_item.data->'name',
            'text', board_item.data->'text',
            'image_url', board_item.data->'image_url',
            'thumbnail_url', board_item.data->'thumbnail_url',
            'original_image_url', board_item.data->'original_image_url',
            'room_type', board_item.data->'room_type',
            'swatches', board_item.data->'swatches',
            'price_cents', board_item.data->'price_cents',
            'vendor_name', board_item.data->'vendor_name',
            'source_url', board_item.data->'source_url',
            'lead_time_weeks', board_item.data->'lead_time_weeks',
            'section_id', board_item.data->'section_id'
          ))
        )) ORDER BY board_item.z_index, board_item.created_at, board_item.id)
        FROM public.proposal_board_items AS board_item
        WHERE board_item.board_id = board.id
      ), '[]'::jsonb)
    )
  )
  INTO v_payload
  FROM public.proposal_boards AS board
  LEFT JOIN public.proposals AS proposal ON proposal.id = board.proposal_id
  LEFT JOIN public.projects AS project ON project.id = board.project_id
  LEFT JOIN public.profiles AS profile
    ON profile.id = COALESCE(proposal.designer_id, project.designer_id)
  WHERE board.id = v_share.board_id;

  IF v_payload IS NULL THEN
    RETURN NULL;
  END IF;

  UPDATE public.document_shares
  SET view_count = view_count + 1,
      last_viewed_at = now()
  WHERE id = v_share.id;

  RETURN v_payload;
END;
$$;

COMMENT ON FUNCTION public.resolve_board_share(text) IS
  'Board-only hashed-token resolver. Returns one explicit client-safe board '
  'composition and no parent proposal/project data; invalid, expired, revoked, '
  'superseded, archived, and non-board tokens all return NULL without bumping '
  'view statistics.';

-- ── 5. 00401 revoke body + board authorization leg ───────────────────────

CREATE OR REPLACE FUNCTION public.revoke_document_share(p_share_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_n integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'authentication required'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  UPDATE public.document_shares AS share
  SET status = 'revoked'
  WHERE share.id = p_share_id
    AND (
      (
        share.proposal_id IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM public.proposals AS proposal
          WHERE proposal.id = share.proposal_id
            AND public.is_design_studio_comember(proposal.designer_id)
        )
      )
      OR (
        share.spec_book_artifact_id IS NOT NULL
        AND EXISTS (
          SELECT 1
          FROM public.spec_book_artifacts AS artifact
          JOIN public.spec_book_revisions AS revision
            ON revision.id = artifact.revision_id
          JOIN public.spec_books AS book ON book.id = revision.spec_book_id
          JOIN public.projects AS project ON project.id = book.project_id
          WHERE artifact.id = share.spec_book_artifact_id
            AND public.is_design_studio_comember(project.designer_id)
        )
      )
      OR (
        share.board_id IS NOT NULL
        AND EXISTS (
          SELECT 1
          FROM public.proposal_boards AS board
          LEFT JOIN public.proposals AS proposal
            ON proposal.id = board.proposal_id
          LEFT JOIN public.projects AS project
            ON project.id = board.project_id
          WHERE board.id = share.board_id
            AND (
              (
                board.proposal_id IS NOT NULL
                AND public.is_design_studio_comember(proposal.designer_id)
              )
              OR (
                board.project_id IS NOT NULL
                AND public.is_design_studio_comember(project.designer_id)
              )
            )
        )
      )
    );

  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n = 0 THEN
    RAISE EXCEPTION 'share not found or not owned'
      USING ERRCODE = 'no_data_found';
  END IF;
  RETURN true;
END;
$$;

-- Default function privileges vary across stacks; name every caller.
REVOKE ALL ON FUNCTION public.create_board_share(uuid, text, timestamptz)
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.resolve_board_share(text)
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.revoke_document_share(uuid)
  FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.create_board_share(uuid, text, timestamptz)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_board_share(text)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.revoke_document_share(uuid)
  TO authenticated;
