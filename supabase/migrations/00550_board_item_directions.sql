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
--
-- RULED (board-paths review, 2026-09-01) — board_item_id CASCADEs on delete
-- DELIBERATELY, and this is a real, undocumented-until-now loss: the room's
-- pin-undo restores a deleted pin by re-inserting a `proposal_board_items` row
-- (a NEW row — undo does not resurrect the old id), so ANY direction thread on
-- the deleted pin is gone for good even when the pin itself comes back. This
-- matches the PRD's verdict-cascade-with-pin semantics (item_feedback's own
-- board_item_id CASCADEs the same way, 00267) and 00549's precedent comment
-- on item_feedback.guest_share_id ("revoking is the supported way to end it;
-- DELETEing is an intentionally destructive act") — a pin delete is the
-- destructive act here, and undo is a NEW pin, not a resurrection of the old
-- one. Proven in board_item_directions_test.sql: delete-then-undo returns the
-- pin but not its thread.
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

COMMENT ON CONSTRAINT board_item_directions_board_item_id_fkey
  ON public.board_item_directions IS
  'CASCADE is deliberate: deleting a pin destroys its direction thread, and
  the room''s pin-undo re-inserts a NEW proposal_board_items row (not the old
  id), so the thread is NOT restored when a deleted pin comes back via undo.
  Matches item_feedback''s own board_item_id CASCADE (00267) and 00549''s
  guest_share_id precedent: the delete is the destructive act, undo makes a
  new pin, not a resurrection. See board_item_directions_test.sql''s
  delete-then-undo case.';

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
DROP POLICY IF EXISTS board_item_directions_studio_select ON public.board_item_directions;
CREATE POLICY board_item_directions_studio_select
  ON public.board_item_directions FOR SELECT
  TO authenticated
  USING (public.can_manage_board_item_feedback(board_item_id));

DROP POLICY IF EXISTS board_item_directions_studio_insert ON public.board_item_directions;
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

-- REVOKE ALL FROM ... authenticated (not just PUBLIC, anon) is required here:
-- the local-stack legacy-grants baseline (seed/00-legacy-grants.sql) restores
-- a blanket GRANT ALL to authenticated at creation time on every public table
-- (Supabase's pre-2026-05-30 default, replayed forward for objects that don't
-- explicitly narrow it — see that seed's own header). Without this explicit
-- REVOKE, authenticated silently keeps UPDATE/DELETE on a fresh local stack
-- even though this migration's own comment says "deliberately no UPDATE or
-- DELETE policy" — the grant would let a co-member's raw UPDATE/DELETE
-- through as a full-table write with no RLS predicate to stop it (SELECT/
-- INSERT are the only FOR clauses with a policy; an UPDATE/DELETE with a
-- grant but no policy is REJECTED by RLS, so this is defense in depth, not
-- the only backstop — but the surviving grant is real ACL drift a reviewer
-- would rightly flag, and prod (no legacy-grants seed) never had the grant to
-- begin with). Probed directly in board_item_directions_test.sql.
REVOKE ALL ON public.board_item_directions FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON public.board_item_directions TO authenticated;

-- ── Resolve / reopen ─────────────────────────────────────────────────────────
-- Bodies mirror resolve_item_feedback / reopen_item_feedback (00267) minus the
-- designer_id branch (there is no client-owned "designer" concept here, only
-- studio co-membership) and minus the events-table write (this table has none).
--
-- A not-found id and a not-authorized id raise the IDENTICAL message and
-- errcode (board-paths review, 2026-09-01) — a caller cannot distinguish
-- "that direction doesn't exist" from "you can't touch it", closing the
-- existence-oracle a two-message version would otherwise open.

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
  IF NOT FOUND OR NOT public.can_manage_board_item_feedback(v_dir.board_item_id) THEN
    RAISE EXCEPTION 'direction not found or not authorized' USING errcode = 'insufficient_privilege';
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
  IF NOT FOUND OR NOT public.can_manage_board_item_feedback(v_dir.board_item_id) THEN
    RAISE EXCEPTION 'direction not found or not authorized' USING errcode = 'insufficient_privilege';
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

-- ═══════════════════════════════════════════════════════════════════════════
-- studio_boards_overview — the bounded, aggregate-only read for the
-- studio-wide boards status view (board-paths W3c, DV8/DV10).
--
-- Board-paths review (2026-09-01) flagged the first cut's PostgREST nested
-- embed (`proposal_board_items(verdicts:item_feedback(...), directions:
-- board_item_directions(...))`) as unbounded: up to p_limit boards, each
-- pulling every pin's every feedback/direction ROW, with no per-item cap
-- PostgREST can express in that shape. This RPC replaces the embed with
-- server-side aggregation — one row out per board, six verdict counts (client/
-- guest × approved/rejected/comment, each already folded to "latest verdict
-- per author" the same way board-verdicts.ts's latestVerdictByAuthor does)
-- plus one unresolved-direction count and one has-active-share flag.
--
-- SECURITY INVOKER (the default — no SECURITY DEFINER here): RLS on
-- proposal_boards / item_feedback / board_item_directions / document_shares
-- still applies as the calling user, exactly as the embed-based read did. A
-- studio co-member sees only the boards/verdicts/directions their own RLS
-- already grants them (C11 in review: confirmed RLS-clean; the co-member-
-- breadth question is pre-existing and out of this slice's scope).
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.studio_boards_overview(p_limit integer DEFAULT 61)
RETURNS TABLE (
  id uuid,
  name text,
  owner_kind text,
  owner_id uuid,
  owner_name text,
  cover_image_url text,
  updated_at timestamptz,
  has_active_share boolean,
  verdict_client_approved bigint,
  verdict_client_rejected bigint,
  verdict_client_comment bigint,
  verdict_guest_approved bigint,
  verdict_guest_rejected bigint,
  verdict_guest_comment bigint,
  unresolved_direction_count bigint
)
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  WITH boards AS (
    SELECT
      pb.id,
      pb.name,
      pb.proposal_id,
      pb.project_id,
      pb.updated_at,
      pb.cover_image_url
    FROM public.proposal_boards AS pb
    WHERE pb.status = 'active'
    ORDER BY pb.updated_at DESC
    LIMIT greatest(1, coalesce(p_limit, 61))
  ),
  latest_verdicts AS (
    -- One row per (board, author) — the latest verdict — mirrors
    -- latestVerdictByAuthor's precedence rule (created_at DESC, id DESC tie-
    -- break) in board-verdicts.ts, so this RPC and the client-side fold never
    -- disagree about which verdict is "current".
    SELECT DISTINCT ON (
      pbi.board_id,
      coalesce(f.client_id::text, 'share:' || f.guest_share_id::text)
    )
      pbi.board_id,
      f.client_id,
      f.guest_share_id,
      f.verdict
    FROM public.item_feedback AS f
    JOIN public.proposal_board_items AS pbi ON pbi.id = f.board_item_id
    WHERE pbi.board_id IN (SELECT boards.id FROM boards)
      AND (f.client_id IS NOT NULL OR f.guest_share_id IS NOT NULL)
    ORDER BY
      pbi.board_id,
      coalesce(f.client_id::text, 'share:' || f.guest_share_id::text),
      f.created_at DESC,
      f.id DESC
  ),
  verdict_counts AS (
    SELECT
      board_id,
      count(*) FILTER (WHERE client_id IS NOT NULL AND verdict = 'approved') AS verdict_client_approved,
      count(*) FILTER (WHERE client_id IS NOT NULL AND verdict = 'rejected') AS verdict_client_rejected,
      count(*) FILTER (WHERE client_id IS NOT NULL AND verdict = 'comment')  AS verdict_client_comment,
      count(*) FILTER (WHERE guest_share_id IS NOT NULL AND verdict = 'approved') AS verdict_guest_approved,
      count(*) FILTER (WHERE guest_share_id IS NOT NULL AND verdict = 'rejected') AS verdict_guest_rejected,
      count(*) FILTER (WHERE guest_share_id IS NOT NULL AND verdict = 'comment')  AS verdict_guest_comment
    FROM latest_verdicts
    GROUP BY board_id
  ),
  direction_counts AS (
    SELECT pbi.board_id, count(*) AS unresolved_direction_count
    FROM public.board_item_directions AS d
    JOIN public.proposal_board_items AS pbi ON pbi.id = d.board_item_id
    WHERE pbi.board_id IN (SELECT boards.id FROM boards)
      AND NOT d.resolved
    GROUP BY pbi.board_id
  ),
  active_shares AS (
    SELECT DISTINCT ds.board_id
    FROM public.document_shares AS ds
    WHERE ds.board_id IN (SELECT boards.id FROM boards)
      AND ds.status = 'active'
  )
  SELECT
    b.id,
    b.name,
    CASE WHEN b.proposal_id IS NOT NULL THEN 'proposal' ELSE 'project' END,
    coalesce(b.proposal_id, b.project_id),
    coalesce(
      NULLIF(btrim(p.title), ''),
      NULLIF(btrim(pr.name), ''),
      CASE WHEN b.proposal_id IS NOT NULL THEN 'Draft proposal' ELSE 'Project' END
    ),
    b.cover_image_url,
    b.updated_at,
    (as1.board_id IS NOT NULL),
    coalesce(vc.verdict_client_approved, 0),
    coalesce(vc.verdict_client_rejected, 0),
    coalesce(vc.verdict_client_comment, 0),
    coalesce(vc.verdict_guest_approved, 0),
    coalesce(vc.verdict_guest_rejected, 0),
    coalesce(vc.verdict_guest_comment, 0),
    coalesce(dc.unresolved_direction_count, 0)
  FROM boards AS b
  LEFT JOIN public.proposals AS p ON p.id = b.proposal_id
  LEFT JOIN public.projects AS pr ON pr.id = b.project_id
  LEFT JOIN verdict_counts AS vc ON vc.board_id = b.id
  LEFT JOIN direction_counts AS dc ON dc.board_id = b.id
  LEFT JOIN active_shares AS as1 ON as1.board_id = b.id
  ORDER BY b.updated_at DESC;
$$;

REVOKE ALL ON FUNCTION public.studio_boards_overview(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.studio_boards_overview(integer) TO authenticated;
