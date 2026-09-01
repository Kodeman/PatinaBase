-- ═══════════════════════════════════════════════════════════════════════════
-- 00550 — Internal direction layer for board pins (board-paths W3c, DV6)
--
-- A studio lead directing a junior on a specific pin has nowhere to leave that
-- note today — the only per-pin thread on a board pin is item_feedback (00267),
-- and that loop is the CLIENT verdict channel (approve/reject/comment), read
-- by the whole studio but written by the client. Direction is the opposite
-- shape: studio-only, never client-visible, never guest-visible.
--
-- board_item_directions is a single flat table, not the two-table
-- note+events split item_feedback uses — there is no cross-party reply
-- ceremony to audit here, just a per-pin thread of studio notes each carrying
-- its own resolved flag (a to-do list on the pin, not a verdict-plus-thread).
--
-- Authority: can_manage_board_item_feedback(board_item_id) (00549) is exactly
-- the "studio co-member of the board's owner" predicate this needs — reused
-- verbatim rather than re-deriving co-membership. Clients and guests are
-- structurally excluded: no RLS policy names anon or a client-facing role,
-- and no grant is issued to anon at all (contrast item_feedback + 00549's
-- guest-verdict RPCs, which exist precisely to open a narrow guest path —
-- no such path is opened here, on purpose).
--
-- Writes: a co-member INSERTs a note directly (RLS: can_manage + author_id =
-- auth.uid()). Resolve/reopen go through two SECURITY DEFINER RPCs — mirrors
-- resolve_item_feedback / reopen_item_feedback (00267) — rather than a raw
-- UPDATE policy, so resolved_at/resolved_by are always server-set and a
-- co-member can't backdate or misattribute a resolution. Editing a note's
-- body after creation is out of scope (not asked for; add a new note instead).
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.board_item_directions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  board_item_id uuid NOT NULL REFERENCES public.proposal_board_items(id) ON DELETE CASCADE,
  author_id     uuid NOT NULL DEFAULT auth.uid()
                  REFERENCES auth.users(id) ON DELETE CASCADE,
  body          text NOT NULL,
  resolved      boolean NOT NULL DEFAULT false,
  resolved_at   timestamptz,
  resolved_by   uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT board_item_directions_body_not_blank CHECK (length(btrim(body)) > 0),
  CONSTRAINT board_item_directions_resolution_consistent CHECK (
    (resolved AND resolved_at IS NOT NULL)
    OR (NOT resolved AND resolved_at IS NULL AND resolved_by IS NULL)
  )
);

COMMENT ON TABLE public.board_item_directions IS
  'Internal studio-only direction thread on a board pin (board-paths W3c, '
  'DV6) — a lead directing a junior on specific pin work. Distinct from '
  'item_feedback (00267), which is the client verdict loop. Never readable '
  'by a client or a guest share link: no policy or grant names anon or a '
  'client-facing role.';

CREATE INDEX IF NOT EXISTS idx_board_item_directions_item
  ON public.board_item_directions(board_item_id, created_at);

-- The pin indicator ("this pin carries unresolved direction") is a per-item
-- unresolved count/existence check — index the exact predicate it filters on.
CREATE INDEX IF NOT EXISTS idx_board_item_directions_unresolved
  ON public.board_item_directions(board_item_id)
  WHERE NOT resolved;

DROP TRIGGER IF EXISTS set_updated_at_board_item_directions ON public.board_item_directions;
CREATE TRIGGER set_updated_at_board_item_directions
  BEFORE UPDATE ON public.board_item_directions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.board_item_directions ENABLE ROW LEVEL SECURITY;

-- No SELECT/INSERT/UPDATE policy anywhere names anon, service_role, or a
-- client identity — a co-member of the board owner's studio is the only
-- reader/writer this table ever grants to.
CREATE POLICY board_item_directions_studio_select
  ON public.board_item_directions FOR SELECT
  TO authenticated
  USING (public.can_manage_board_item_feedback(board_item_id));

CREATE POLICY board_item_directions_studio_insert
  ON public.board_item_directions FOR INSERT
  TO authenticated
  WITH CHECK (
    public.can_manage_board_item_feedback(board_item_id)
    AND author_id = auth.uid()
  );

-- Deliberately no UPDATE or DELETE policy: resolve/reopen go through the
-- SECURITY DEFINER RPCs below (server-set resolved_at/resolved_by); editing
-- or deleting a note's body is out of this slice's scope.

REVOKE ALL ON public.board_item_directions FROM PUBLIC, anon;
GRANT SELECT, INSERT ON public.board_item_directions TO authenticated;

-- ── Resolve / reopen ─────────────────────────────────────────────────────────
-- Bodies mirror resolve_item_feedback / reopen_item_feedback (00267) minus the
-- designer_id branch (there is no client-owned "designer" concept here, only
-- studio co-membership) and minus the events-table write (this table has none).

CREATE OR REPLACE FUNCTION public.resolve_board_item_direction(p_direction_id uuid)
RETURNS public.board_item_directions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_dir public.board_item_directions;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'authentication required' USING errcode = 'insufficient_privilege';
  END IF;

  SELECT * INTO v_dir FROM public.board_item_directions WHERE id = p_direction_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'direction % not found', p_direction_id USING errcode = 'no_data_found';
  END IF;

  IF NOT public.can_manage_board_item_feedback(v_dir.board_item_id) THEN
    RAISE EXCEPTION 'only a studio co-member may resolve direction' USING errcode = 'insufficient_privilege';
  END IF;

  IF v_dir.resolved THEN
    RETURN v_dir;  -- idempotent
  END IF;

  UPDATE public.board_item_directions
     SET resolved = true, resolved_at = now(), resolved_by = auth.uid(), updated_at = now()
   WHERE id = p_direction_id
   RETURNING * INTO v_dir;

  RETURN v_dir;
END;
$$;

CREATE OR REPLACE FUNCTION public.reopen_board_item_direction(p_direction_id uuid)
RETURNS public.board_item_directions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_dir public.board_item_directions;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'authentication required' USING errcode = 'insufficient_privilege';
  END IF;

  SELECT * INTO v_dir FROM public.board_item_directions WHERE id = p_direction_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'direction % not found', p_direction_id USING errcode = 'no_data_found';
  END IF;

  IF NOT public.can_manage_board_item_feedback(v_dir.board_item_id) THEN
    RAISE EXCEPTION 'only a studio co-member may reopen direction' USING errcode = 'insufficient_privilege';
  END IF;

  IF NOT v_dir.resolved THEN
    RETURN v_dir;  -- idempotent
  END IF;

  UPDATE public.board_item_directions
     SET resolved = false, resolved_at = NULL, resolved_by = NULL, updated_at = now()
   WHERE id = p_direction_id
   RETURNING * INTO v_dir;

  RETURN v_dir;
END;
$$;

REVOKE ALL ON FUNCTION public.resolve_board_item_direction(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.reopen_board_item_direction(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.resolve_board_item_direction(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reopen_board_item_direction(uuid) TO authenticated;
