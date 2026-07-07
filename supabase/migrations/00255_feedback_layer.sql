-- ═══════════════════════════════════════════════════════════════════════════
-- 00255 — Feedback layer (feedback + feedback_events)
--
-- The Designer Portal's first daily user (Leah) needs a persistent, screen-
-- agnostic way to leave a note about the product from anywhere, and for those
-- notes to be triaged and closed out without leaving the portal. See
-- docs/ledger/patina-feedback-layer-prd.md. This migration is the whole backing
-- store: a note table and its short-thread event log.
--
-- Two tables (PRD §9):
--   · feedback         — one row per note: bucket + text + auto-context + a
--                        status lifecycle (noted → building → shipped, with
--                        archived terminal).
--   · feedback_events  — the note's thread: status changes, replies, reactions.
--                        Written only by the RPCs below, never by direct client
--                        INSERT, so the "status is a builder-only transition"
--                        rule is enforceable (RLS can't do column-level writes).
--
-- Attribution + access (PRD Q5/Q6): the PRD schema hedged author as free text;
-- we use created_by uuid = auth.uid() instead — real RLS attribution today,
-- multi-designer-ready tomorrow with no migration. RLS: an author reads/writes
-- her OWN notes; a super_admin (Kody, the builder) reads ALL and owns the status
-- lifecycle. The super_admin gate reuses user_has_role(uid,'super_admin')
-- (00021), the same gate the tightened policies use (00058).
--
-- Privileged transitions go through SECURITY DEFINER RPCs (the same one-act
-- grammar as resolve_coordination_item / record_offline_signature): the RPC
-- owns the authorization check and writes the matching thread event atomically.
--
-- Additive only (D7): CREATE TABLE IF NOT EXISTS, CREATE INDEX IF NOT EXISTS,
-- DROP POLICY IF EXISTS + CREATE. Nothing existing is touched.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── feedback ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.feedback (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- The author. Defaults to the caller so the client never sends it; the INSERT
  -- RLS check pins it to auth.uid() regardless.
  created_by     UUID NOT NULL DEFAULT auth.uid()
                   REFERENCES public.profiles(id) ON DELETE CASCADE,
  bucket         TEXT NOT NULL
                   CHECK (bucket IN ('working', 'not_working', 'missing', 'change')),
  -- Optional: a one-tap "Working" with no words is still valid signal (R7.2.2).
  note           TEXT,
  weight         TEXT CHECK (weight IN ('low', 'med', 'high')),
  -- Auto-captured context (§8) — the user never types where she is.
  screen_name    TEXT,
  route          TEXT,
  app_version    TEXT,
  viewport       TEXT,
  element        TEXT,
  -- Storage path in the private feedback-screenshots bucket (00256); signed on
  -- read. NULL when the screenshot toggle was off (R7.2.4).
  screenshot_path TEXT,
  status         TEXT NOT NULL DEFAULT 'noted'
                   CHECK (status IN ('noted', 'building', 'shipped', 'archived')),
  -- The builder's "what changed", quoted on the shipped card (R7.6.1). Set when
  -- a note is moved to 'shipped'.
  resolution     TEXT,
  -- Drives the capture-button badge (R7.1.7): NULL while a shipped note is
  -- unseen; stamped when the author opens the loop card. Reset to NULL on every
  -- (re-)entry into 'shipped' so a reopened-then-reshipped note badges again.
  shipped_seen_at TIMESTAMPTZ
);

COMMENT ON TABLE public.feedback IS
  'In-portal feedback notes (PRD docs/ledger/patina-feedback-layer-prd.md). One '
  'row per note: four buckets, optional text, auto-captured context, and a '
  'noted→building→shipped(→archived) lifecycle. Author = created_by; status '
  'transitions go through set_feedback_status (builder-owned).';

CREATE INDEX IF NOT EXISTS idx_feedback_created_by ON public.feedback(created_by);
CREATE INDEX IF NOT EXISTS idx_feedback_status     ON public.feedback(status);
CREATE INDEX IF NOT EXISTS idx_feedback_created_at ON public.feedback(created_at DESC);
-- Partial index for the badge query (own shipped-and-unseen notes).
CREATE INDEX IF NOT EXISTS idx_feedback_unseen_shipped
  ON public.feedback(created_by)
  WHERE status = 'shipped' AND shipped_seen_at IS NULL;

DROP TRIGGER IF EXISTS set_updated_at_feedback ON public.feedback;
CREATE TRIGGER set_updated_at_feedback
  BEFORE UPDATE ON public.feedback
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ── feedback_events ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.feedback_events (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  feedback_id  UUID NOT NULL REFERENCES public.feedback(id) ON DELETE CASCADE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  actor        UUID NOT NULL DEFAULT auth.uid()
                 REFERENCES public.profiles(id) ON DELETE SET NULL,
  kind         TEXT NOT NULL
                 CHECK (kind IN ('status_change', 'reply', 'reaction')),
  payload      JSONB NOT NULL DEFAULT '{}'::jsonb
);

COMMENT ON TABLE public.feedback_events IS
  'The thread on a feedback note: status_change {from,to,note} | reply {text} | '
  'reaction {emoji}. Written only by the feedback RPCs (SECURITY DEFINER), never '
  'by direct client INSERT — so status stays a builder-only act.';

CREATE INDEX IF NOT EXISTS idx_feedback_events_feedback
  ON public.feedback_events(feedback_id, created_at);

-- ═══════════════════════════════════════════════════════════════════════════
-- RLS
-- ═══════════════════════════════════════════════════════════════════════════
ALTER TABLE public.feedback        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feedback_events ENABLE ROW LEVEL SECURITY;

-- feedback: the author inserts her own notes (created_by pinned to auth.uid()).
DROP POLICY IF EXISTS feedback_insert_own ON public.feedback;
CREATE POLICY feedback_insert_own
  ON public.feedback FOR INSERT
  TO authenticated
  WITH CHECK (created_by = auth.uid());

-- feedback: the author reads her own; the builder (super_admin) reads all.
DROP POLICY IF EXISTS feedback_select_own_or_admin ON public.feedback;
CREATE POLICY feedback_select_own_or_admin
  ON public.feedback FOR SELECT
  TO authenticated
  USING (
    created_by = auth.uid()
    OR public.user_has_role(auth.uid(), 'super_admin')
  );

-- No direct UPDATE/DELETE policy: every mutation past INSERT flows through a
-- SECURITY DEFINER RPC (below), which enforces its own authorization.

-- feedback_events: readable when the parent note is readable. Insert is
-- RPC-only, so no INSERT policy is granted.
DROP POLICY IF EXISTS feedback_events_select_visible ON public.feedback_events;
CREATE POLICY feedback_events_select_visible
  ON public.feedback_events FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.feedback f
      WHERE f.id = feedback_events.feedback_id
        AND (
          f.created_by = auth.uid()
          OR public.user_has_role(auth.uid(), 'super_admin')
        )
    )
  );

GRANT SELECT, INSERT ON public.feedback        TO authenticated;
GRANT SELECT          ON public.feedback_events TO authenticated;
GRANT ALL             ON public.feedback        TO service_role;
GRANT ALL             ON public.feedback_events TO service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- set_feedback_status — the status lifecycle (builder-owned, author may reopen)
--
-- super_admin may make any transition. The author may ONLY reopen her own note
-- (shipped → building, "not quite", R7.6.2). Every real change writes a
-- status_change event {from,to,note}; entering 'shipped' stores p_note as the
-- resolution and clears shipped_seen_at so the note badges as unseen.
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.set_feedback_status(
  p_id     UUID,
  p_status TEXT,
  p_note   TEXT DEFAULT NULL
)
RETURNS public.feedback
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_row      public.feedback;
  v_from     TEXT;
  v_is_admin BOOLEAN := public.user_has_role(auth.uid(), 'super_admin');
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'set_feedback_status requires an authenticated user'
      USING errcode = 'insufficient_privilege';
  END IF;

  IF p_status NOT IN ('noted', 'building', 'shipped', 'archived') THEN
    RAISE EXCEPTION 'invalid status %', p_status USING errcode = 'check_violation';
  END IF;

  SELECT * INTO v_row FROM public.feedback WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'feedback % not found', p_id USING errcode = 'no_data_found';
  END IF;

  -- Authorization: builder any transition; author only her own shipped→building.
  IF NOT (
    v_is_admin
    OR (v_row.created_by = auth.uid() AND v_row.status = 'shipped' AND p_status = 'building')
  ) THEN
    RAISE EXCEPTION 'not authorized to set status % on feedback %', p_status, p_id
      USING errcode = 'insufficient_privilege';
  END IF;

  -- No-op transition: return unchanged, log nothing.
  IF p_status = v_row.status THEN
    RETURN v_row;
  END IF;

  v_from := v_row.status;

  UPDATE public.feedback
  SET status          = p_status,
      resolution      = CASE WHEN p_status = 'shipped'
                             THEN COALESCE(p_note, resolution) ELSE resolution END,
      shipped_seen_at  = CASE WHEN p_status = 'shipped' THEN NULL ELSE shipped_seen_at END
  WHERE id = p_id
  RETURNING * INTO v_row;

  INSERT INTO public.feedback_events (feedback_id, actor, kind, payload)
  VALUES (p_id, auth.uid(), 'status_change',
          jsonb_build_object('from', v_from, 'to', p_status, 'note', p_note));

  RETURN v_row;
END;
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- react_to_feedback — the author's low-effort ack on a shipped note (👍/🎉)
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.react_to_feedback(
  p_id    UUID,
  p_emoji TEXT
)
RETURNS public.feedback_events
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_event public.feedback_events;
  v_row   public.feedback;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'react_to_feedback requires an authenticated user'
      USING errcode = 'insufficient_privilege';
  END IF;

  IF btrim(COALESCE(p_emoji, '')) = '' THEN
    RAISE EXCEPTION 'a reaction is required' USING errcode = 'check_violation';
  END IF;

  SELECT * INTO v_row FROM public.feedback WHERE id = p_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'feedback % not found', p_id USING errcode = 'no_data_found';
  END IF;

  IF NOT (v_row.created_by = auth.uid()
          OR public.user_has_role(auth.uid(), 'super_admin')) THEN
    RAISE EXCEPTION 'not authorized to react to feedback %', p_id
      USING errcode = 'insufficient_privilege';
  END IF;

  INSERT INTO public.feedback_events (feedback_id, actor, kind, payload)
  VALUES (p_id, auth.uid(), 'reaction', jsonb_build_object('emoji', btrim(p_emoji)))
  RETURNING * INTO v_event;

  RETURN v_event;
END;
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- reply_to_feedback — a note becomes a short thread (Kody replies; author too)
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.reply_to_feedback(
  p_id   UUID,
  p_text TEXT
)
RETURNS public.feedback_events
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_event public.feedback_events;
  v_row   public.feedback;
  v_text  TEXT := btrim(COALESCE(p_text, ''));
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'reply_to_feedback requires an authenticated user'
      USING errcode = 'insufficient_privilege';
  END IF;

  IF v_text = '' THEN
    RAISE EXCEPTION 'a reply is required' USING errcode = 'check_violation';
  END IF;

  SELECT * INTO v_row FROM public.feedback WHERE id = p_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'feedback % not found', p_id USING errcode = 'no_data_found';
  END IF;

  IF NOT (v_row.created_by = auth.uid()
          OR public.user_has_role(auth.uid(), 'super_admin')) THEN
    RAISE EXCEPTION 'not authorized to reply to feedback %', p_id
      USING errcode = 'insufficient_privilege';
  END IF;

  INSERT INTO public.feedback_events (feedback_id, actor, kind, payload)
  VALUES (p_id, auth.uid(), 'reply', jsonb_build_object('text', v_text))
  RETURNING * INTO v_event;

  RETURN v_event;
END;
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- mark_feedback_seen — the author has seen the shipped card; clear the badge
-- Idempotent: only stamps an own, shipped, still-unseen note.
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.mark_feedback_seen(p_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'mark_feedback_seen requires an authenticated user'
      USING errcode = 'insufficient_privilege';
  END IF;

  UPDATE public.feedback
  SET shipped_seen_at = now()
  WHERE id = p_id
    AND created_by = auth.uid()
    AND status = 'shipped'
    AND shipped_seen_at IS NULL;
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_feedback_status(UUID, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.react_to_feedback(UUID, TEXT)         TO authenticated;
GRANT EXECUTE ON FUNCTION public.reply_to_feedback(UUID, TEXT)         TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_feedback_seen(UUID)              TO authenticated;
