-- ═══════════════════════════════════════════════════════════════════════════
-- 00546 — Verdict-capable guest board share links
--
-- Ruling (board-paths program, 2026-08-31): a board share link MAY carry
-- lightweight per-pin reactions, as an OPT-IN chosen at mint time. Ruling #2's
-- "a guest never offers verdicts" boundary stands for every link that did not
-- opt in — and stands STRUCTURALLY, not by UI omission:
--
--   · document_shares.board_reactions_enabled is written once, by the mint, and
--     is immutable afterwards (guard_document_share_board_payload's UPDATE leg).
--     A live link's power never changes; a new link is cheap.
--   · resolve_board_share() returns `reactions` ONLY on an opted-in share. A
--     non-opted link's resolve DTO does not carry the capability at all — the
--     same shape as resolve_document_share() forcing feedbackEnabled=false.
--   · submit_board_share_reaction() re-proves the whole ceremony server-side
--     from the raw token: hash match, board target, active status, expiry,
--     payload integrity, opt-in flag, and pin-belongs-to-the-shared-board. It
--     is the only write path; there is no client-side privileged key.
--
-- Guest rows land in the existing item_feedback machinery so designer-side
-- verdict summaries and the room's feedback rail read them with no new tables:
-- attribution moves from "a user" to "a user OR a share" (client_id nullable,
-- guest_share_id added, exactly one of the two).
--
-- Board-anchored feedback on a PROJECT-owned board had no reader and no
-- authority: _item_feedback_gate_impl resolves a board anchor only through
-- proposal_boards.proposal_id, so on a project board it returns NO row. That
-- made can_access_item_feedback_anchor() false (the studio could not read the
-- verdicts it was just given) and, worse, left resolve/reopen/reply comparing
-- auth.uid() against a NULL designer_id — a NULL predicate that fails OPEN.
-- Both are closed here with an owner-agnostic board authority.
--
-- Lineage
--   create_board_share            00406 → 00434 → 00462 → 00545 → 00546
--   resolve_board_share           00406 → 00434 → 00462 → 00545 → 00546
--   guard_document_share_…payload 00462 → 00546
--   reply_to_item_feedback        00267 → 00546
--   resolve_item_feedback         00267 → 00546
--   reopen_item_feedback          00267 → 00546
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. The per-share opt-in ────────────────────────────────────────────────

ALTER TABLE public.document_shares
  ADD COLUMN IF NOT EXISTS board_reactions_enabled boolean NOT NULL DEFAULT false;

ALTER TABLE public.document_shares
  DROP CONSTRAINT IF EXISTS document_shares_reactions_need_board;
ALTER TABLE public.document_shares
  ADD CONSTRAINT document_shares_reactions_need_board CHECK (
    NOT board_reactions_enabled OR board_id IS NOT NULL
  );

COMMENT ON COLUMN public.document_shares.board_reactions_enabled IS
  'Opt-in chosen at mint: may guests of this board link tap per-pin reactions? '
  'Immutable after insert (guard_document_share_board_payload). Default false.';

-- ── 2. item_feedback learns share attribution ──────────────────────────────

ALTER TABLE public.item_feedback
  ALTER COLUMN client_id DROP NOT NULL;

ALTER TABLE public.item_feedback
  ADD COLUMN IF NOT EXISTS guest_share_id uuid
    REFERENCES public.document_shares(id) ON DELETE CASCADE;

ALTER TABLE public.item_feedback
  DROP CONSTRAINT IF EXISTS item_feedback_one_author;
ALTER TABLE public.item_feedback
  ADD CONSTRAINT item_feedback_one_author CHECK (
    num_nonnulls(client_id, guest_share_id) = 1
  );

-- A share can only speak about the board it froze, so guest rows are always
-- board-anchored. This keeps every other anchor kind (proposal line, FF&E,
-- project review item) a signed-in-only surface, exactly as before.
ALTER TABLE public.item_feedback
  DROP CONSTRAINT IF EXISTS item_feedback_guest_is_board_anchored;
ALTER TABLE public.item_feedback
  ADD CONSTRAINT item_feedback_guest_is_board_anchored CHECK (
    guest_share_id IS NULL OR board_item_id IS NOT NULL
  );

-- Re-tapping updates; it never stacks a second row for the same link and pin.
CREATE UNIQUE INDEX IF NOT EXISTS uq_item_feedback_guest_share_pin
  ON public.item_feedback(guest_share_id, board_item_id)
  WHERE guest_share_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_item_feedback_guest_share
  ON public.item_feedback(guest_share_id)
  WHERE guest_share_id IS NOT NULL;

COMMENT ON COLUMN public.item_feedback.guest_share_id IS
  'Set when the verdict came from a guest on an opted-in board share link. '
  'Attribution is the SHARE, never a user; client_id is NULL on those rows.';

-- The thread event a guest verdict writes has no auth.users actor. (The column
-- already declared ON DELETE SET NULL, which NOT NULL made unreachable.)
ALTER TABLE public.item_feedback_events
  ALTER COLUMN actor DROP NOT NULL;

-- ── 3. Owner-agnostic board authority ──────────────────────────────────────

CREATE OR REPLACE FUNCTION public.can_manage_board_item_feedback(
  p_board_item_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT p_board_item_id IS NOT NULL
    AND auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.proposal_board_items AS item
      JOIN public.proposal_boards AS board ON board.id = item.board_id
      LEFT JOIN public.proposals AS proposal ON proposal.id = board.proposal_id
      LEFT JOIN public.projects AS project ON project.id = board.project_id
      WHERE item.id = p_board_item_id
        AND public.is_design_studio_comember(
          COALESCE(proposal.designer_id, project.designer_id)
        )
    );
$$;

REVOKE ALL ON FUNCTION public.can_manage_board_item_feedback(uuid)
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.can_manage_board_item_feedback(uuid)
  TO authenticated;

-- The studio reads every verdict on a board it owns, whichever document owns
-- the board. Sibling shape: item_feedback_studio_review_read (00438).
DROP POLICY IF EXISTS item_feedback_studio_board_read ON public.item_feedback;
CREATE POLICY item_feedback_studio_board_read
  ON public.item_feedback FOR SELECT
  TO authenticated
  USING (
    board_item_id IS NOT NULL
    AND public.can_manage_board_item_feedback(board_item_id)
  );

DROP POLICY IF EXISTS item_feedback_events_studio_board_read
  ON public.item_feedback_events;
CREATE POLICY item_feedback_events_studio_board_read
  ON public.item_feedback_events FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.item_feedback AS feedback
      WHERE feedback.id = item_feedback_events.feedback_id
        AND feedback.board_item_id IS NOT NULL
        AND public.can_manage_board_item_feedback(feedback.board_item_id)
    )
  );

-- ── 4. Close the NULL-designer fail-open on the three verdict RPCs ─────────
-- Bodies are 00267's verbatim; the authorization predicate is the only delta.
-- `auth.uid() <> v_gate.designer_id` yields NULL — not true — when the gate
-- finds no proposal, so the guard never fired for a project-owned board anchor.

CREATE OR REPLACE FUNCTION public.reply_to_item_feedback(p_feedback_id UUID, p_body TEXT)
RETURNS public.item_feedback_events
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_fb    public.item_feedback;
  v_gate  RECORD;
  v_event public.item_feedback_events;
  v_text  TEXT := btrim(COALESCE(p_body, ''));
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'authentication required' USING errcode = 'insufficient_privilege';
  END IF;
  IF v_text = '' THEN
    RAISE EXCEPTION 'a reply is required' USING errcode = 'check_violation';
  END IF;

  SELECT * INTO v_fb FROM public.item_feedback WHERE id = p_feedback_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'feedback % not found', p_feedback_id USING errcode = 'no_data_found';
  END IF;

  SELECT * INTO v_gate
    FROM public.item_feedback_gate(v_fb.proposal_item_id, v_fb.ffe_item_id, v_fb.board_item_id);

  IF NOT COALESCE(
       auth.uid() = v_fb.client_id
       OR auth.uid() = v_gate.designer_id
       OR public.can_manage_board_item_feedback(v_fb.board_item_id),
       false
     )
  THEN
    RAISE EXCEPTION 'not authorized to reply' USING errcode = 'insufficient_privilege';
  END IF;

  INSERT INTO public.item_feedback_events (feedback_id, actor, kind, body)
  VALUES (p_feedback_id, auth.uid(), 'replied', v_text)
  RETURNING * INTO v_event;

  UPDATE public.item_feedback SET updated_at = now() WHERE id = p_feedback_id;
  RETURN v_event;
END;
$$;

CREATE OR REPLACE FUNCTION public.resolve_item_feedback(p_feedback_id UUID)
RETURNS public.item_feedback
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_fb   public.item_feedback;
  v_gate RECORD;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'authentication required' USING errcode = 'insufficient_privilege';
  END IF;

  SELECT * INTO v_fb FROM public.item_feedback WHERE id = p_feedback_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'feedback % not found', p_feedback_id USING errcode = 'no_data_found';
  END IF;

  SELECT * INTO v_gate
    FROM public.item_feedback_gate(v_fb.proposal_item_id, v_fb.ffe_item_id, v_fb.board_item_id);
  IF NOT COALESCE(
       auth.uid() = v_gate.designer_id
       OR public.can_manage_board_item_feedback(v_fb.board_item_id),
       false
     )
  THEN
    RAISE EXCEPTION 'only the owning designer may resolve' USING errcode = 'insufficient_privilege';
  END IF;

  IF v_fb.resolved_at IS NOT NULL THEN
    RETURN v_fb;  -- idempotent
  END IF;

  UPDATE public.item_feedback
     SET resolved_at = now(), resolved_by = auth.uid(), updated_at = now()
   WHERE id = p_feedback_id
   RETURNING * INTO v_fb;

  INSERT INTO public.item_feedback_events (feedback_id, actor, kind)
  VALUES (p_feedback_id, auth.uid(), 'resolved');

  RETURN v_fb;
END;
$$;

CREATE OR REPLACE FUNCTION public.reopen_item_feedback(p_feedback_id UUID)
RETURNS public.item_feedback
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_fb   public.item_feedback;
  v_gate RECORD;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'authentication required' USING errcode = 'insufficient_privilege';
  END IF;

  SELECT * INTO v_fb FROM public.item_feedback WHERE id = p_feedback_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'feedback % not found', p_feedback_id USING errcode = 'no_data_found';
  END IF;

  SELECT * INTO v_gate
    FROM public.item_feedback_gate(v_fb.proposal_item_id, v_fb.ffe_item_id, v_fb.board_item_id);
  IF NOT COALESCE(
       auth.uid() = v_gate.designer_id
       OR public.can_manage_board_item_feedback(v_fb.board_item_id),
       false
     )
  THEN
    RAISE EXCEPTION 'only the owning designer may reopen' USING errcode = 'insufficient_privilege';
  END IF;

  IF v_fb.resolved_at IS NULL THEN
    RETURN v_fb;  -- idempotent
  END IF;

  UPDATE public.item_feedback
     SET resolved_at = NULL, resolved_by = NULL, updated_at = now()
   WHERE id = p_feedback_id
   RETURNING * INTO v_fb;

  INSERT INTO public.item_feedback_events (feedback_id, actor, kind)
  VALUES (p_feedback_id, auth.uid(), 'reopened');

  RETURN v_fb;
END;
$$;

-- ── 5. The edition guard also freezes the opt-in ───────────────────────────
-- 00462's body verbatim; board_reactions_enabled joins the UPDATE-immutability
-- list. The INSERT leg is unchanged: the capability-token ceremony already
-- means only create_board_share can write a board share row at all.

CREATE OR REPLACE FUNCTION public.guard_document_share_board_payload()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_expected_payload jsonb;
  v_expected_capability text;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.board_id IS DISTINCT FROM OLD.board_id
       OR NEW.board_payload IS DISTINCT FROM OLD.board_payload
       OR NEW.board_payload_hash IS DISTINCT FROM OLD.board_payload_hash
       OR NEW.board_reactions_enabled IS DISTINCT FROM OLD.board_reactions_enabled
       OR (
         OLD.board_id IS NOT NULL
         AND NEW.token_hash IS DISTINCT FROM OLD.token_hash
       )
    THEN
      RAISE EXCEPTION 'board share editions are immutable'
        USING ERRCODE = 'object_not_in_prerequisite_state';
    END IF;
    RETURN NEW;
  END IF;

  -- Generic document shares retain their existing writers. Only board shares
  -- are an edition-minting authority and therefore require this ceremony.
  IF NEW.board_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF current_user = 'postgres'
     AND session_user = 'postgres'
     AND COALESCE(current_setting('role', true), 'none') = 'none'
  THEN
    RETURN NEW;
  END IF;

  v_expected_capability := format(
    'board_share:%s:%s', NEW.id, pg_catalog.txid_current()
  );
  v_expected_payload := public.build_board_share_payload(
    NEW.board_id, NEW.id, NEW.label, NEW.expires_at
  );
  IF current_user IS DISTINCT FROM 'postgres'
     OR auth.uid() IS NULL
     OR NEW.created_by IS DISTINCT FROM auth.uid()
     OR current_setting('app.board_share_capability', true)
          IS DISTINCT FROM v_expected_capability
     OR v_expected_payload IS NULL
     OR NEW.board_payload IS DISTINCT FROM v_expected_payload
     OR NEW.board_payload_hash IS DISTINCT FROM encode(
       extensions.digest(convert_to(v_expected_payload::text, 'UTF8'), 'sha256'),
       'hex'
     )
     OR NEW.proposal_id IS NOT NULL
     OR NEW.spec_book_artifact_id IS NOT NULL
     OR NEW.status IS DISTINCT FROM 'active'
     OR NOT EXISTS (
       SELECT 1
       FROM public.proposal_boards AS board
       LEFT JOIN public.proposals AS proposal ON proposal.id = board.proposal_id
       LEFT JOIN public.projects AS project ON project.id = board.project_id
       WHERE board.id = NEW.board_id
         AND board.status = 'active'
         AND public.board_media_projection_is_allowed(board.id)
         AND (
           (board.proposal_id IS NOT NULL
             AND public.is_design_studio_comember(proposal.designer_id))
           OR (board.project_id IS NOT NULL
             AND public.is_design_studio_comember(project.designer_id))
         )
     )
  THEN
    RAISE EXCEPTION 'board shares are inserted only by the canonical edition mint'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_document_share_board_payload()
  FROM PUBLIC, anon, authenticated, service_role;

-- ── 6. Mint takes the opt-in ───────────────────────────────────────────────
-- The 3-argument signature is retired rather than overloaded: two mints would
-- be two places to keep the edition ceremony correct. PostgREST fills the new
-- argument from its DEFAULT for any caller that still sends three.

DROP FUNCTION IF EXISTS public.create_board_share(uuid, text, timestamptz);

CREATE OR REPLACE FUNCTION public.create_board_share(
  p_board_id uuid,
  p_label text DEFAULT NULL,
  p_expires_at timestamptz DEFAULT NULL,
  p_reactions_enabled boolean DEFAULT false
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
    board_payload, board_payload_hash, board_reactions_enabled
  ) VALUES (
    v_id, NULL, NULL, p_board_id,
    v_hash, v_label, jsonb_build_object('feedbackEnabled', false),
    'active', p_expires_at, auth.uid(),
    v_payload,
    encode(extensions.digest(convert_to(v_payload::text, 'UTF8'), 'sha256'), 'hex'),
    COALESCE(p_reactions_enabled, false)
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

-- ── 7. Resolve offers the capability only when it was minted ───────────────
-- 00545's body verbatim, plus two computed keys. `reactions` is ABSENT — not
-- empty — on a link that did not opt in, so a guest render has nothing to hang
-- an affordance on. The frozen payload itself is untouched (its hash still
-- guards it); the capability is derived per request from the share row.

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
  v_reactions_enabled boolean;
BEGIN
  IF p_token IS NULL OR p_token !~ '^[0-9A-Fa-f]{64}$' THEN
    RETURN NULL;
  END IF;
  v_hash := encode(extensions.digest(p_token, 'sha256'), 'hex');
  SELECT share.id, share.board_payload, share.board_reactions_enabled
  INTO v_share_id, v_payload, v_reactions_enabled
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

  v_payload := v_payload || jsonb_build_object(
    'reactionsEnabled', COALESCE(v_reactions_enabled, false)
  );
  IF COALESCE(v_reactions_enabled, false) THEN
    v_payload := v_payload || jsonb_build_object(
      'reactions',
      COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'boardItemId', feedback.board_item_id,
          'verdict', feedback.verdict,
          'body', feedback.body
        ) ORDER BY feedback.board_item_id)
        FROM public.item_feedback AS feedback
        WHERE feedback.guest_share_id = v_share_id
      ), '[]'::jsonb)
    );
  END IF;
  RETURN v_payload;
END;
$$;

-- ── 8. The only guest write path ───────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.submit_board_share_reaction(
  p_token text,
  p_board_item_id uuid,
  p_verdict text,
  p_body text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  -- One link cannot file more distinct reactions than this. A board holds far
  -- fewer pins than the cap; the cap exists to bound a scripted caller.
  c_row_cap    constant integer := 200;
  c_body_limit constant integer := 280;
  v_hash       text;
  v_share_id   uuid;
  v_board_id   uuid;
  v_verdict    text := btrim(COALESCE(p_verdict, ''));
  v_body       text := NULLIF(btrim(COALESCE(p_body, '')), '');
  v_existing   uuid;
  v_rows       integer;
BEGIN
  IF v_verdict NOT IN ('approved', 'rejected') THEN
    RAISE EXCEPTION 'a reaction is approved or rejected'
      USING ERRCODE = 'check_violation';
  END IF;
  IF v_body IS NOT NULL AND char_length(v_body) > c_body_limit THEN
    RAISE EXCEPTION 'a note is at most % characters', c_body_limit
      USING ERRCODE = 'check_violation';
  END IF;
  IF p_token IS NULL OR p_token !~ '^[0-9A-Fa-f]{64}$' THEN
    RAISE EXCEPTION 'this link cannot take reactions'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  v_hash := encode(extensions.digest(p_token, 'sha256'), 'hex');

  -- The same ceremony resolve_board_share runs, plus the opt-in. Every refusal
  -- class raises the SAME message: a caller learns nothing about which wall
  -- it hit, or whether the link ever existed.
  SELECT share.id, share.board_id
  INTO v_share_id, v_board_id
  FROM public.document_shares AS share
  JOIN public.proposal_boards AS board ON board.id = share.board_id
  LEFT JOIN public.proposals AS proposal ON proposal.id = board.proposal_id
  LEFT JOIN public.projects AS project ON project.id = board.project_id
  WHERE share.token_hash = v_hash
    AND share.board_id IS NOT NULL
    AND share.status = 'active'
    AND share.board_reactions_enabled
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
    RAISE EXCEPTION 'this link cannot take reactions'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- The pin must belong to the board this token shared.
  IF NOT EXISTS (
    SELECT 1 FROM public.proposal_board_items AS item
    WHERE item.id = p_board_item_id AND item.board_id = v_board_id
  ) THEN
    RAISE EXCEPTION 'this link cannot take reactions'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT id INTO v_existing
  FROM public.item_feedback
  WHERE guest_share_id = v_share_id AND board_item_id = p_board_item_id;

  IF v_existing IS NULL THEN
    SELECT count(*) INTO v_rows
    FROM public.item_feedback
    WHERE guest_share_id = v_share_id;
    IF v_rows >= c_row_cap THEN
      RAISE EXCEPTION 'this link has reached its reaction limit'
        USING ERRCODE = 'check_violation';
    END IF;

    INSERT INTO public.item_feedback (
      board_item_id, client_id, guest_share_id, verdict, body
    ) VALUES (
      p_board_item_id, NULL, v_share_id, v_verdict, v_body
    );
  ELSE
    UPDATE public.item_feedback
       SET verdict = v_verdict, body = v_body, updated_at = now()
     WHERE id = v_existing;
  END IF;

  RETURN jsonb_build_object(
    'boardItemId', p_board_item_id,
    'verdict', v_verdict,
    'body', v_body
  );
END;
$$;

REVOKE ALL ON FUNCTION public.submit_board_share_reaction(text, uuid, text, text)
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_board_share_reaction(text, uuid, text, text)
  TO authenticated, service_role;
-- Guest links work unauthenticated (2026-08-12 ruling); the function proves the
-- token, the opt-in, and the pin's board before it writes anything.
GRANT EXECUTE ON FUNCTION public.submit_board_share_reaction(text, uuid, text, text)
  TO anon;

REVOKE ALL ON FUNCTION public.create_board_share(uuid, text, timestamptz, boolean)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_board_share(uuid, text, timestamptz, boolean)
  TO authenticated;
REVOKE ALL ON FUNCTION public.resolve_board_share(text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.resolve_board_share(text)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.resolve_board_share(text) TO anon;
