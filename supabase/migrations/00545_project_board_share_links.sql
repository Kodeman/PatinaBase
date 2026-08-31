-- ═══════════════════════════════════════════════════════════════════════════
-- 00545 — Board share links work on project-owned boards
--
-- 00462 closed token sharing to proposal-owned boards only ("Project-board
-- token sharing kept closed per 2026-08-12 ruling"), which is why the room's
-- Share control was hidden on the project surface. The project surface is now
-- the canonical place a designer keeps a board (board-paths program, 2026-08-31),
-- so the mint and resolve legs are reopened for project-owned boards.
--
-- Nothing else about the edition is relaxed. The insert trigger
-- (guard_document_share_board_payload) still demands
-- board_media_projection_is_allowed(board.id), and resolve still demands
-- board_json_media_references_are_allowed(payload, designer) — so a project
-- board whose pins point at private project working media still cannot mint or
-- resolve a guest link. Only the blanket owner-kind exclusion goes.
--
-- Bodies below are 00462's verbatim, with the two owner-kind clauses replaced
-- by an owner-agnostic studio co-membership check.
-- ═══════════════════════════════════════════════════════════════════════════

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
  v_id uuid := extensions.gen_random_uuid();
  v_label text := NULLIF(btrim(p_label), '');
  v_payload jsonb;
  v_previous_capability text := current_setting(
    'app.board_share_capability', true
  );
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
          AND proposal.status IN ('draft','sent','viewed','accepted','declined','expired')
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

  v_payload := public.build_board_share_payload(
    p_board_id, v_id, v_label, p_expires_at
  );
  IF v_payload IS NULL THEN
    RAISE EXCEPTION 'board payload could not be captured'
      USING ERRCODE = 'check_violation';
  END IF;
  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  v_hash := encode(extensions.digest(v_token, 'sha256'), 'hex');

  PERFORM set_config(
    'app.board_share_capability',
    format('board_share:%s:%s', v_id, pg_catalog.txid_current()),
    true
  );

  INSERT INTO public.document_shares (
    id, proposal_id, spec_book_artifact_id, board_id,
    token_hash, label, visibility, status, expires_at, created_by,
    board_payload, board_payload_hash
  ) VALUES (
    v_id, NULL, NULL, p_board_id,
    v_hash, v_label, jsonb_build_object('feedbackEnabled', false),
    'active', p_expires_at, auth.uid(),
    v_payload,
    encode(extensions.digest(convert_to(v_payload::text, 'UTF8'), 'sha256'), 'hex')
  );
  PERFORM set_config(
    'app.board_share_capability', COALESCE(v_previous_capability, ''), true
  );
  RETURN QUERY SELECT v_id, v_token;
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config(
    'app.board_share_capability', COALESCE(v_previous_capability, ''), true
  );
  RAISE;
END;
$$;

CREATE OR REPLACE FUNCTION public.resolve_board_share(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_hash text;
  v_share_id uuid;
  v_payload jsonb;
BEGIN
  IF p_token IS NULL OR p_token !~ '^[0-9A-Fa-f]{64}$' THEN
    RETURN NULL;
  END IF;
  v_hash := encode(extensions.digest(p_token, 'sha256'), 'hex');
  SELECT share.id, share.board_payload
  INTO v_share_id, v_payload
  FROM public.document_shares AS share
  JOIN public.proposal_boards AS board ON board.id = share.board_id
  LEFT JOIN public.proposals AS proposal ON proposal.id = board.proposal_id
  LEFT JOIN public.projects AS project ON project.id = board.project_id
  WHERE share.token_hash = v_hash
    AND share.board_id IS NOT NULL
    AND share.status = 'active'
    AND (share.expires_at IS NULL OR share.expires_at > now())
    AND share.board_payload IS NOT NULL
    AND share.board_payload_hash = encode(
      extensions.digest(convert_to(share.board_payload::text, 'UTF8'), 'sha256'),
      'hex'
    )
    AND public.board_json_media_references_are_allowed(
      share.board_payload,
      COALESCE(proposal.designer_id, project.designer_id)
    )
  LIMIT 1;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;
  UPDATE public.document_shares
  SET view_count = view_count + 1,
      last_viewed_at = now()
  WHERE id = v_share_id;
  RETURN v_payload;
END;
$$;

REVOKE ALL ON FUNCTION public.create_board_share(uuid, text, timestamptz)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_board_share(uuid, text, timestamptz)
  TO authenticated;
REVOKE ALL ON FUNCTION public.resolve_board_share(text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.resolve_board_share(text)
  TO authenticated, service_role;
-- Share links work unauthenticated (2026-08-12 ruling); the function fails
-- closed on a bad, expired, revoked, or tampered token.
GRANT EXECUTE ON FUNCTION public.resolve_board_share(text) TO anon;
