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
-- verdicts it was just given) and, worse, left FOUR RPCs comparing auth.uid()
-- against a NULL designer_id — `auth.uid() <> NULL` is NULL, not true, so the
-- guard never fired: reply, resolve, reopen (00267) and escalate-to-decision
-- (00271). All four are closed here with an owner-agnostic board authority.
--
-- RULED (board-paths, 2026-08-31) — the same fix widens the PROPOSAL leg too:
-- a studio co-member, not only the named designer_id, may resolve / reopen /
-- reply / escalate on a proposal-owned board's verdicts. That is the intended
-- posture, and it matches how the studio already reaches these boards
-- everywhere else — create_board_share, revoke_document_share and the
-- document_shares board policies are all is_design_studio_comember, not
-- designer_id equality. It is covered by the co-member-allowed probe in
-- supabase/tests/mood_boards/project_board_share_test.sql.
--
-- RULED (board-paths, 2026-08-31) — item_feedback.guest_share_id CASCADEs on
-- delete DELIBERATELY. Revoking a link (status='revoked') is the supported way
-- to end it and preserves every reaction; DELETEing the share row is an
-- intentionally destructive act, and a verdict whose only author was that link
-- has no attribution left once it is gone. This also matches the column next to
-- it: client_id already CASCADEs from auth.users.
--
-- Lineage
--   create_board_share             00406 → 00434 → 00462 → 00545 → 00546
--   resolve_board_share            00406 → 00434 → 00462 → 00545 → 00546
--   guard_document_share_…payload  00462 → 00546
--   reply_to_item_feedback         00267 → 00546
--   resolve_item_feedback          00267 → 00546
--   reopen_item_feedback           00267 → 00546
--   notify_item_feedback           00267 → 00546
--   escalate_item_feedback_to_…    00271 → 00546
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
  'Attribution is the SHARE, never a user; client_id is NULL on those rows. '
  'ON DELETE CASCADE is deliberate (00546): revoking a link keeps every '
  'reaction, and DELETEing the share row is an intentionally destructive act '
  'that leaves such a verdict with no author at all.';

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

-- ── 4. Close the NULL-designer fail-open on the four verdict RPCs ──────────
-- Bodies are 00267's / 00271's verbatim; the authorization predicate is the
-- only delta. `auth.uid() <> v_gate.designer_id` yields NULL — not true — when
-- the gate finds no proposal, so the guard never fired for a project-owned
-- board anchor.

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

-- 00271's C4 back-link carries the same NULL predicate. Its second guard (the
-- decision must belong to auth.uid()) narrowed the blast radius but never
-- closed it: a caller who owns any decision could stamp its id onto another
-- studio's project-board verdict and thread a 'replied' event onto it.
CREATE OR REPLACE FUNCTION public.escalate_item_feedback_to_decision(
  p_feedback_id uuid,
  p_decision_id uuid
)
RETURNS public.item_feedback
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_fb           public.item_feedback;
  v_gate         RECORD;
  v_owns_decision boolean;
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
    RAISE EXCEPTION 'only the owning designer may escalate' USING errcode = 'insufficient_privilege';
  END IF;

  -- The decision must belong to the same designer (guards against linking an
  -- arbitrary decision id through the DEFINER context).
  SELECT EXISTS (
    SELECT 1
      FROM public.client_decisions d
      JOIN public.designer_clients dc ON dc.id = d.designer_client_id
     WHERE d.id = p_decision_id
       AND dc.designer_id = auth.uid()
  ) INTO v_owns_decision;
  IF NOT v_owns_decision THEN
    RAISE EXCEPTION 'decision % not found or not owned', p_decision_id USING errcode = 'no_data_found';
  END IF;

  UPDATE public.item_feedback
     SET decision_id = p_decision_id, updated_at = now()
   WHERE id = p_feedback_id
   RETURNING * INTO v_fb;

  INSERT INTO public.item_feedback_events (feedback_id, actor, kind, body)
  VALUES (p_feedback_id, auth.uid(), 'replied', 'Put to the client as a Decision.');

  RETURN v_fb;
END;
$$;

REVOKE ALL ON FUNCTION public.escalate_item_feedback_to_decision(uuid, uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.escalate_item_feedback_to_decision(uuid, uuid)
  TO authenticated;

-- ── 4b. The guest loop has to actually reach the designer ─────────────────
-- 00267's body bailed at `v_gate.designer_id IS NULL`, which is EVERY
-- project-owned board — the exact case this slice ships. Fall back to the
-- board's own owner, and say "a guest" when the verdict came from a link.
-- Still best-effort: the trigger swallows failures so a notification can
-- never block a reaction.

CREATE OR REPLACE FUNCTION public.notify_item_feedback(p_feedback_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_fb          public.item_feedback;
  v_gate        RECORD;
  v_designer_id UUID;
  v_proposal_id UUID;
  v_board_id    UUID;
  v_item_name   TEXT;
  v_actor       TEXT;
  v_verb        TEXT;
  v_headline    TEXT;
  v_preview     TEXT;
  v_link        TEXT;
  v_existing    UUID;
  v_id          UUID;
BEGIN
  SELECT * INTO v_fb FROM public.item_feedback WHERE id = p_feedback_id;
  IF NOT FOUND THEN RETURN NULL; END IF;

  SELECT * INTO v_gate
    FROM public.item_feedback_gate(v_fb.proposal_item_id, v_fb.ffe_item_id, v_fb.board_item_id);
  v_designer_id := v_gate.designer_id;
  v_proposal_id := v_gate.proposal_id;

  IF v_fb.board_item_id IS NOT NULL THEN
    SELECT board.id, COALESCE(proposal.designer_id, project.designer_id),
           COALESCE(NULLIF(btrim(item.data->>'name'), ''), NULLIF(btrim(item.content), ''))
    INTO v_board_id, v_designer_id, v_item_name
    FROM public.proposal_board_items AS item
    JOIN public.proposal_boards AS board ON board.id = item.board_id
    LEFT JOIN public.proposals AS proposal ON proposal.id = board.proposal_id
    LEFT JOIN public.projects AS project ON project.id = board.project_id
    WHERE item.id = v_fb.board_item_id;
    v_designer_id := COALESCE(v_designer_id, v_gate.designer_id);
  ELSE
    SELECT pi.name INTO v_item_name
      FROM public.proposal_items pi WHERE pi.id = v_fb.proposal_item_id;
  END IF;

  IF v_designer_id IS NULL THEN RETURN NULL; END IF;

  -- Idempotency: one in-app row per verdict.
  SELECT id INTO v_existing
    FROM public.notification_log
   WHERE type = 'client_feedback'
     AND channel = 'in_app'
     AND metadata->>'feedbackId' = p_feedback_id::text
   LIMIT 1;
  IF v_existing IS NOT NULL THEN RETURN v_existing; END IF;

  v_item_name := COALESCE(
    NULLIF(btrim(v_item_name), ''),
    CASE WHEN v_fb.board_item_id IS NOT NULL THEN 'a piece' ELSE 'a line' END
  );
  v_actor := CASE WHEN v_fb.guest_share_id IS NOT NULL THEN 'A guest' ELSE 'Client' END;
  v_verb := CASE v_fb.verdict
              WHEN 'approved' THEN 'approved'
              WHEN 'rejected' THEN 'flagged'
              ELSE 'left a note on'
            END;
  v_headline := v_actor || ' ' || v_verb || ' ' || v_item_name;
  v_preview  := NULLIF(btrim(v_fb.body), '');
  -- A project-owned board has no proposal to land on; the room itself is the
  -- destination. (The old body always wrote '/doc/' || proposal_id, which is
  -- literally '/doc/' when there is no proposal.)
  v_link := CASE
    WHEN v_proposal_id IS NOT NULL THEN '/doc/' || v_proposal_id::text
    WHEN v_board_id IS NOT NULL THEN '/board/' || v_board_id::text
    ELSE NULL
  END;

  INSERT INTO public.notification_log (user_id, type, channel, status, template_id, metadata)
  VALUES (
    v_designer_id, 'client_feedback', 'in_app', 'delivered', 'client-feedback',
    jsonb_strip_nulls(jsonb_build_object(
      'feedbackId', p_feedback_id,
      'proposalId', v_proposal_id,
      'boardId',    v_board_id,
      'guestShareId', v_fb.guest_share_id,
      'source',     CASE WHEN v_fb.guest_share_id IS NOT NULL THEN 'guest_link' ELSE 'client' END,
      'verdict',    v_fb.verdict,
      'headline',   v_headline,
      'title',      v_headline,
      'subject',    v_headline,
      'preview',    v_preview,
      'body',       v_preview,
      'deep_link',  v_link,
      'url',        v_link
    ))
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.notify_item_feedback(uuid)
  FROM PUBLIC, anon, authenticated, service_role;

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
    v_hash, v_label,
    -- Kept in step with board_reactions_enabled so the two never disagree: a
    -- reader of `visibility` alone must not conclude a reaction link is mute.
    jsonb_build_object('feedbackEnabled', COALESCE(p_reactions_enabled, false)),
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
  v_share      public.document_shares;
  v_designer   uuid;
  v_verdict    text := btrim(COALESCE(p_verdict, ''));
  v_body       text := NULLIF(btrim(COALESCE(p_body, '')), '');
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

  -- The same ceremony resolve_board_share runs, plus the opt-in, ordered
  -- cheapest-first: the token/status/expiry/opt-in lookup is an index probe,
  -- while board_json_media_references_are_allowed() walks the whole frozen
  -- payload, so an invalid or revoked token never pays for that walk.
  --
  -- Every REFUSAL IN THIS FAMILY — bad token, unknown token, revoked, expired,
  -- not opted in, tampered payload, a pin outside the frozen edition — raises
  -- the same message, so a caller learns nothing about which wall it hit or
  -- whether the link ever existed. (The argument checks above, and the row cap
  -- below, deliberately say what they mean: those tell a legitimate reader
  -- something actionable and reveal nothing about the link.)
  SELECT * INTO v_share
  FROM public.document_shares AS share
  WHERE share.token_hash = v_hash
    AND share.board_id IS NOT NULL
    AND share.status = 'active'
    AND share.board_reactions_enabled
    AND (share.expires_at IS NULL OR share.expires_at > now())
    AND share.board_payload IS NOT NULL
  LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'this link cannot take reactions'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT COALESCE(proposal.designer_id, project.designer_id)
  INTO v_designer
  FROM public.proposal_boards AS board
  LEFT JOIN public.proposals AS proposal ON proposal.id = board.proposal_id
  LEFT JOIN public.projects AS project ON project.id = board.project_id
  WHERE board.id = v_share.board_id;

  IF v_share.board_payload_hash IS DISTINCT FROM encode(
       extensions.digest(convert_to(v_share.board_payload::text, 'UTF8'), 'sha256'),
       'hex'
     )
     OR NOT public.board_json_media_references_are_allowed(
          v_share.board_payload, v_designer
        )
  THEN
    RAISE EXCEPTION 'this link cannot take reactions'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- The pin must be part of the FROZEN EDITION this token captured, not merely
  -- of the board as it stands now. A pin added after the mint is not something
  -- this reader was ever shown, so an old link cannot reach it. The live-board
  -- check stays alongside it: item_feedback.board_item_id is a real FK.
  IF NOT EXISTS (
    SELECT 1
    FROM jsonb_array_elements(
      CASE WHEN jsonb_typeof(v_share.board_payload #> '{board,items}') = 'array'
        THEN v_share.board_payload #> '{board,items}'
        ELSE '[]'::jsonb END
    ) AS frozen_item
    WHERE frozen_item->>'id' = p_board_item_id::text
  ) OR NOT EXISTS (
    SELECT 1 FROM public.proposal_board_items AS item
    WHERE item.id = p_board_item_id AND item.board_id = v_share.board_id
  ) THEN
    RAISE EXCEPTION 'this link cannot take reactions'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- The cap bounds how many DISTINCT pins one link may speak about; changing
  -- your mind about a pin already inside it is always allowed, so the count
  -- only gates a row that does not exist yet.
  IF NOT EXISTS (
    SELECT 1 FROM public.item_feedback
    WHERE guest_share_id = v_share.id AND board_item_id = p_board_item_id
  ) THEN
    SELECT count(*) INTO v_rows
    FROM public.item_feedback
    WHERE guest_share_id = v_share.id;
    IF v_rows >= c_row_cap THEN
      RAISE EXCEPTION 'this link has reached its reaction limit'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  -- One statement, so a double-tap cannot lose the race between the existence
  -- check and the write and surface a raw 23505 with the index name.
  -- DO UPDATE does not fire the AFTER INSERT trigger, which is what we want:
  -- the designer is notified when a link first speaks about a pin, not every
  -- time the reader changes their mind.
  INSERT INTO public.item_feedback (
    board_item_id, client_id, guest_share_id, verdict, body
  ) VALUES (
    p_board_item_id, NULL, v_share.id, v_verdict, v_body
  )
  ON CONFLICT (guest_share_id, board_item_id) WHERE guest_share_id IS NOT NULL
  DO UPDATE SET
    verdict = EXCLUDED.verdict,
    body = EXCLUDED.body,
    updated_at = now();

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
