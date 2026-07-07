-- ═══════════════════════════════════════════════════════════════════════════
-- 00267 — Per-line client verdicts  (Schedule & Boards Wave 2 · C3 + C6)
--
-- The lightweight loop: a client says approve / flag / note on a single line of
-- a proposal. Decisions stay the consequential instrument (00060+); a verdict
-- NEVER mutates the line it is about — it is commentary with a state chip and a
-- short thread. (The Schedule & Boards plan, 2026-07-07.)
--
-- Two tables, modeled on the feedback layer (00255): a note row + an append-only
-- event log written only by SECURITY DEFINER RPCs / triggers. Plus:
--   · proposals.feedback_enabled — the per-proposal gate (default on).
--   · item_feedback_gate(...) — resolves any anchor to its proposal context, so
--     RLS never has to reason about three anchor kinds inline.
--   · a designer notification into notification_log (channel='in_app') so the
--     verdict surfaces in the designer's Post automatically (the Post reads
--     notification_log; the decision_notifications table is never read).
--
-- Anchors: exactly one of proposal_item_id / ffe_item_id / board_item_id. v1
-- wires the CLIENT loop to proposal_item_id (the proposal document lines) and
-- board_item_id (also proposal-anchored). ffe_item_id is a project surface with
-- no proposal anchor — schema-provisioned, not client-writable this wave.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── The per-proposal gate ────────────────────────────────────────────────────
ALTER TABLE public.proposals
  ADD COLUMN IF NOT EXISTS feedback_enabled BOOLEAN NOT NULL DEFAULT true;

COMMENT ON COLUMN public.proposals.feedback_enabled IS
  'Whether the per-line client verdict loop (00267) is offered on this proposal. '
  'Default on. A guest share render forces feedback off regardless.';

-- ── item_feedback ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.item_feedback (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Exactly one anchor (CHECK below).
  proposal_item_id UUID REFERENCES public.proposal_items(id)       ON DELETE CASCADE,
  ffe_item_id      UUID REFERENCES public.project_ffe_items(id)    ON DELETE CASCADE,
  board_item_id    UUID REFERENCES public.proposal_board_items(id) ON DELETE CASCADE,
  -- The client author. Pinned to auth.uid() by the INSERT policy.
  client_id        UUID NOT NULL DEFAULT auth.uid()
                     REFERENCES auth.users(id) ON DELETE CASCADE,
  verdict          TEXT NOT NULL CHECK (verdict IN ('approved', 'rejected', 'comment')),
  -- Required (non-empty) for a 'comment'; optional for approve / reject.
  body             TEXT,
  -- Designer act: mark a rejection handled. Never touches the anchored line.
  resolved_at      TIMESTAMPTZ,
  resolved_by      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT item_feedback_one_anchor CHECK (
    (proposal_item_id IS NOT NULL)::int
  + (ffe_item_id      IS NOT NULL)::int
  + (board_item_id    IS NOT NULL)::int = 1
  ),
  CONSTRAINT item_feedback_comment_needs_body CHECK (
    verdict <> 'comment' OR (body IS NOT NULL AND length(btrim(body)) > 0)
  )
);

COMMENT ON TABLE public.item_feedback IS
  'Per-line client verdicts (approve/flag/note) on a proposal line, board item, '
  'or (reserved) FF&E line. Append-only history: the latest row per (anchor, '
  'client) is the current verdict. NEVER mutates the anchored line.';

CREATE INDEX IF NOT EXISTS idx_item_feedback_proposal_item
  ON public.item_feedback(proposal_item_id) WHERE proposal_item_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_item_feedback_board_item
  ON public.item_feedback(board_item_id) WHERE board_item_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_item_feedback_client
  ON public.item_feedback(client_id, created_at DESC);
-- The Desk aggregate ("N lines flagged"): unresolved rejections per proposal line.
CREATE INDEX IF NOT EXISTS idx_item_feedback_unresolved_reject
  ON public.item_feedback(proposal_item_id)
  WHERE verdict = 'rejected' AND resolved_at IS NULL AND proposal_item_id IS NOT NULL;

DROP TRIGGER IF EXISTS set_updated_at_item_feedback ON public.item_feedback;
CREATE TRIGGER set_updated_at_item_feedback
  BEFORE UPDATE ON public.item_feedback
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ── item_feedback_events (the thread) ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.item_feedback_events (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  feedback_id UUID NOT NULL REFERENCES public.item_feedback(id) ON DELETE CASCADE,
  actor       UUID NOT NULL DEFAULT auth.uid()
                REFERENCES auth.users(id) ON DELETE SET NULL,
  kind        TEXT NOT NULL CHECK (kind IN ('created', 'replied', 'resolved', 'reopened')),
  body        TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.item_feedback_events IS
  'Append-only thread on a verdict: created | replied | resolved | reopened. '
  'Written only by the item_feedback trigger / RPCs, never by direct INSERT.';

CREATE INDEX IF NOT EXISTS idx_item_feedback_events_feedback
  ON public.item_feedback_events(feedback_id, created_at);

-- ═══════════════════════════════════════════════════════════════════════════
-- item_feedback_gate — resolve any anchor to its proposal context. SECURITY
-- DEFINER + STABLE so RLS policies can call it without RLS-within-RLS on the
-- anchor tables. Returns only routing info (ids + status + gate), never content.
-- ffe_item_id has no proposal anchor in v1 → no row (client cannot write it).
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.item_feedback_gate(
  p_proposal_item_id UUID,
  p_ffe_item_id      UUID,
  p_board_item_id    UUID
)
RETURNS TABLE (proposal_id UUID, client_id UUID, designer_id UUID, status TEXT, feedback_enabled BOOLEAN)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT p.id, p.client_id, p.designer_id, p.status, p.feedback_enabled
  FROM public.proposals p
  WHERE p.id = COALESCE(
    (SELECT pi.proposal_id FROM public.proposal_items pi WHERE pi.id = p_proposal_item_id),
    (SELECT pb.proposal_id
       FROM public.proposal_boards pb
       JOIN public.proposal_board_items pbi ON pbi.board_id = pb.id
      WHERE pbi.id = p_board_item_id)
  );
$$;

GRANT EXECUTE ON FUNCTION public.item_feedback_gate(UUID, UUID, UUID) TO authenticated, service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- RLS
-- ═══════════════════════════════════════════════════════════════════════════
ALTER TABLE public.item_feedback        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.item_feedback_events ENABLE ROW LEVEL SECURITY;

-- Client inserts her OWN verdict on a line she is the client of, only while the
-- proposal is non-draft AND the proposal-level gate is on.
DROP POLICY IF EXISTS item_feedback_client_insert ON public.item_feedback;
CREATE POLICY item_feedback_client_insert
  ON public.item_feedback FOR INSERT
  TO authenticated
  WITH CHECK (
    client_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.item_feedback_gate(proposal_item_id, ffe_item_id, board_item_id) g
      WHERE g.client_id = auth.uid()
        AND g.status <> 'draft'
        AND g.feedback_enabled
    )
  );

-- Client reads her own verdicts.
DROP POLICY IF EXISTS item_feedback_client_select ON public.item_feedback;
CREATE POLICY item_feedback_client_select
  ON public.item_feedback FOR SELECT
  TO authenticated
  USING (client_id = auth.uid());

-- Designer reads every verdict on their documents.
DROP POLICY IF EXISTS item_feedback_designer_select ON public.item_feedback;
CREATE POLICY item_feedback_designer_select
  ON public.item_feedback FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.item_feedback_gate(proposal_item_id, ffe_item_id, board_item_id) g
      WHERE g.designer_id = auth.uid()
    )
  );

-- No direct UPDATE/DELETE policy — resolution / reopen / replies go through the
-- SECURITY DEFINER RPCs below (which own the thread-event writes).

-- Events: readable when the parent verdict is readable by the caller.
DROP POLICY IF EXISTS item_feedback_events_select ON public.item_feedback_events;
CREATE POLICY item_feedback_events_select
  ON public.item_feedback_events FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.item_feedback f
      LEFT JOIN LATERAL public.item_feedback_gate(f.proposal_item_id, f.ffe_item_id, f.board_item_id) g ON true
      WHERE f.id = item_feedback_events.feedback_id
        AND (f.client_id = auth.uid() OR g.designer_id = auth.uid())
    )
  );

GRANT SELECT, INSERT ON public.item_feedback        TO authenticated;
GRANT SELECT         ON public.item_feedback_events TO authenticated;
GRANT ALL            ON public.item_feedback        TO service_role;
GRANT ALL            ON public.item_feedback_events TO service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- notify_item_feedback — surface a verdict in the designer's Post. Writes an
-- in_app notification_log row (the table the Post reads), idempotent per
-- verdict (replies collapse — one row per feedback id). Best-effort; the caller
-- (trigger) swallows failures so a notification can never block a verdict.
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.notify_item_feedback(p_feedback_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_fb        public.item_feedback;
  v_gate      RECORD;
  v_item_name TEXT;
  v_verb      TEXT;
  v_headline  TEXT;
  v_preview   TEXT;
  v_existing  UUID;
  v_id        UUID;
BEGIN
  SELECT * INTO v_fb FROM public.item_feedback WHERE id = p_feedback_id;
  IF NOT FOUND THEN RETURN NULL; END IF;

  SELECT * INTO v_gate
    FROM public.item_feedback_gate(v_fb.proposal_item_id, v_fb.ffe_item_id, v_fb.board_item_id);
  IF v_gate.designer_id IS NULL THEN RETURN NULL; END IF;

  -- Idempotency: one in-app row per verdict.
  SELECT id INTO v_existing
    FROM public.notification_log
   WHERE type = 'client_feedback'
     AND channel = 'in_app'
     AND metadata->>'feedbackId' = p_feedback_id::text
   LIMIT 1;
  IF v_existing IS NOT NULL THEN RETURN v_existing; END IF;

  SELECT pi.name INTO v_item_name
    FROM public.proposal_items pi WHERE pi.id = v_fb.proposal_item_id;
  v_item_name := COALESCE(NULLIF(btrim(v_item_name), ''), 'a line');

  v_verb := CASE v_fb.verdict
              WHEN 'approved' THEN 'approved'
              WHEN 'rejected' THEN 'flagged'
              ELSE 'left a note on'
            END;
  v_headline := 'Client ' || v_verb || ' ' || v_item_name;
  v_preview  := NULLIF(btrim(v_fb.body), '');

  INSERT INTO public.notification_log (user_id, type, channel, status, template_id, metadata)
  VALUES (
    v_gate.designer_id, 'client_feedback', 'in_app', 'delivered', 'client-feedback',
    jsonb_build_object(
      'feedbackId', p_feedback_id,
      'proposalId', v_gate.proposal_id,
      'verdict',    v_fb.verdict,
      'headline',   v_headline,
      'title',      v_headline,
      'subject',    v_headline,
      'preview',    v_preview,
      'body',       v_preview,
      'deep_link',  '/doc/' || v_gate.proposal_id::text,
      'url',        '/doc/' || v_gate.proposal_id::text
    )
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.notify_item_feedback(UUID) TO authenticated, service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- AFTER INSERT trigger — write the 'created' thread event, then fire the
-- (best-effort) designer notification. The event write is core data and stays
-- fatal; the notification is swallowed so it can never roll back a verdict.
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.item_feedback_after_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  INSERT INTO public.item_feedback_events (feedback_id, actor, kind, body)
  VALUES (NEW.id, NEW.client_id, 'created', NULLIF(btrim(NEW.body), ''));

  BEGIN
    PERFORM public.notify_item_feedback(NEW.id);
  EXCEPTION WHEN OTHERS THEN
    -- Notification is best-effort; never block the client's verdict.
    NULL;
  END;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS item_feedback_created_trg ON public.item_feedback;
CREATE TRIGGER item_feedback_created_trg
  AFTER INSERT ON public.item_feedback
  FOR EACH ROW EXECUTE FUNCTION public.item_feedback_after_insert();

-- ═══════════════════════════════════════════════════════════════════════════
-- reply_to_item_feedback — either party (client author or the owning designer)
-- adds a reply. Writes a 'replied' event.
-- ═══════════════════════════════════════════════════════════════════════════
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

  IF NOT (auth.uid() = v_fb.client_id OR auth.uid() = v_gate.designer_id) THEN
    RAISE EXCEPTION 'not authorized to reply' USING errcode = 'insufficient_privilege';
  END IF;

  INSERT INTO public.item_feedback_events (feedback_id, actor, kind, body)
  VALUES (p_feedback_id, auth.uid(), 'replied', v_text)
  RETURNING * INTO v_event;

  UPDATE public.item_feedback SET updated_at = now() WHERE id = p_feedback_id;
  RETURN v_event;
END;
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- resolve_item_feedback / reopen_item_feedback — designer marks a flag handled
-- (or undoes it). Writes a 'resolved' / 'reopened' event. Never touches the line.
-- ═══════════════════════════════════════════════════════════════════════════
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
  IF auth.uid() <> v_gate.designer_id THEN
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
  IF auth.uid() <> v_gate.designer_id THEN
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

GRANT EXECUTE ON FUNCTION public.reply_to_item_feedback(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_item_feedback(UUID)        TO authenticated;
GRANT EXECUTE ON FUNCTION public.reopen_item_feedback(UUID)         TO authenticated;

-- ── Least privilege (Wave-2 gate): functions get EXECUTE via PUBLIC by
-- default — revoke PUBLIC; the in-function auth guards remain the second wall.
REVOKE ALL ON FUNCTION public.item_feedback_after_insert() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.item_feedback_gate(p_proposal_item_id uuid, p_ffe_item_id uuid, p_board_item_id uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.notify_item_feedback(p_feedback_id uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.reopen_item_feedback(p_feedback_id uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.reply_to_item_feedback(p_feedback_id uuid, p_body text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.resolve_item_feedback(p_feedback_id uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.item_feedback_gate(uuid, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reply_to_item_feedback(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_item_feedback(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reopen_item_feedback(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.notify_item_feedback(uuid) TO authenticated;
