-- =====================================================================================
-- 00675 — arrival_anchors: the arrival engine's write-only per-user visit anchor
--         (US-14, arrival v3 → production, W2-A)
--
-- Design of record: artifacts/arrival-production-2026-09-27/design/CONTRACT.md §2 D3,
-- §3 "Fire-and-forget RPC", §5 W2-A; artifacts/arrival-production-2026-09-27/research/
-- briefing-data.md §3 (table + function draft). D3 ruling: F2 / the "since" line is
-- OMITTED from v1 — this table and RPC exist only so rows accrue for a future reader.
-- The card never prints "First visit" or any since-fact in v1; nothing reads this table
-- through the portal yet.
--
-- What this adds, all new objects; nothing installed is redefined:
--   1. `public.arrival_anchors` (user_id → auth.users ON DELETE CASCADE, scope 'desk' |
--      'document', engagement_id nullable uuid, seen_at, previous_seen_at). RLS on;
--      authenticated holds SELECT on its own rows only. There is no INSERT, UPDATE or
--      DELETE policy and no such grant: every write goes through mark_arrival below,
--      which runs as its owner and pins auth.uid().
--   2. `public.mark_arrival(p_scope text, p_engagement_id uuid DEFAULT NULL) RETURNS
--      timestamptz`, SECURITY DEFINER, pinned to auth.uid(). Upserts the caller's own
--      anchor row for (scope, engagement_id) and returns the PRIOR seen_at (NULL on a
--      first visit) for a future reader to diff against. A call within 30 minutes of
--      the last one is treated as the same visit (arrival.js VISIT window): the prior
--      previous_seen_at is kept rather than collapsed, so a reload never says "since
--      earlier today". EXECUTE to authenticated only — this is a fire-and-forget RPC
--      the arrival host calls after settle/decline (CONTRACT §3), never a useMutation.
--
-- engagement_id union key (no FK, deliberately; briefing-data.md §3 "No FK on
-- engagement_id"): it spans four source tables (projects/proposals/designer_clients/
-- leads) with no single owning relation. The caller is expected to pass
-- document_state.engagement_id (00590) verbatim: for a project (Shape A) that is
-- projects.id (00590_engagement_subject.sql:61); for a still-open proposal chain
-- (Shape B) it is proposals.chain_root_id, NOT proposals.id (00590_engagement_subject.
-- sql:224) — the chain's root stays stable across proposal revisions. briefing-data.md
-- §3 does not specify any further resolution (no chain-following join, no proposal→
-- project bridge) inside this function, so none is added here: p_engagement_id is
-- stored exactly as given. KNOWN GAP, not invented around: because a proposal's
-- document_state.engagement_id (chain_root_id) and its post-activation project's
-- document_state.engagement_id (projects.id) are different uuids, an anchor set while
-- an engagement was still a proposal will NOT be found again once it activates into a
-- project — the anchor silently restarts as a "first visit" at that transition. Since
-- v1 never reads this table (D3), the gap has no visible effect yet; a v2 reader must
-- either accept the reset at activation or add an explicit chain-follow.
--
-- Revert (unapplied-on-prod remediation only; after prod apply, fix forward):
--   DROP FUNCTION public.mark_arrival(text, uuid);
--   DROP TABLE public.arrival_anchors;
-- =====================================================================================

-- ── 1. The table ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.arrival_anchors (
  user_id          uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  scope            text NOT NULL CHECK (scope IN ('desk', 'document')),
  engagement_id    uuid,          -- document_state.engagement_id (any shape); NULL for 'desk'
  seen_at          timestamptz NOT NULL DEFAULT now(),
  previous_seen_at timestamptz,   -- the anchor "since" a future reader diffs against; NULL = first visit
  CONSTRAINT arrival_anchors_shape CHECK ((scope = 'desk') = (engagement_id IS NULL)),
  CONSTRAINT arrival_anchors_key UNIQUE NULLS NOT DISTINCT (user_id, scope, engagement_id)
);

ALTER TABLE public.arrival_anchors ENABLE ROW LEVEL SECURITY;

-- Own rows only, for SELECT. There is no INSERT, UPDATE or DELETE policy: the table
-- grant below withholds all three, so mark_arrival is the only writer.
DROP POLICY IF EXISTS arrival_anchors_select_own ON public.arrival_anchors;
CREATE POLICY arrival_anchors_select_own ON public.arrival_anchors
  FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));

-- Post-flip, the policy above only bites with a matching table grant. authenticated
-- gets SELECT only; INSERT, UPDATE and DELETE are withheld so every write is forced
-- through mark_arrival's own-row upsert and 30-minute visit rule. anon gets nothing.
REVOKE ALL ON public.arrival_anchors FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.arrival_anchors TO authenticated;
GRANT ALL ON public.arrival_anchors TO service_role;

COMMENT ON TABLE public.arrival_anchors IS
  'Write-only per-user, per-surface visit anchor for the arrival engine (00675, US-14, '
  'CONTRACT.md D3). scope=''desk'' rows carry engagement_id NULL (one studio-wide row '
  'per user); scope=''document'' rows key on document_state.engagement_id. Own row SELECT '
  'only; every write goes through mark_arrival(). No reader consumes this table in v1 — '
  'rows accrue for a future "since your last visit" feature.';

-- ── 2. The writer ───────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.mark_arrival(p_scope text, p_engagement_id uuid DEFAULT NULL)
RETURNS timestamptz
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid  uuid := (SELECT auth.uid());
  v_prev timestamptz;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'mark_arrival: authentication required' USING ERRCODE = '42501';
  END IF;

  IF p_scope NOT IN ('desk', 'document')
     OR (p_scope = 'desk') <> (p_engagement_id IS NULL)
  THEN
    RAISE EXCEPTION 'mark_arrival: bad scope' USING ERRCODE = '22023';
  END IF;

  -- A call within 30 minutes of the caller's own last seen_at is the same visit
  -- (arrival.js VISIT window): previous_seen_at is kept, not collapsed, so a reload
  -- never turns "since your last visit" into "since earlier today".
  INSERT INTO public.arrival_anchors AS a (user_id, scope, engagement_id)
  VALUES (v_uid, p_scope, p_engagement_id)
  ON CONFLICT ON CONSTRAINT arrival_anchors_key DO UPDATE
    SET previous_seen_at = CASE WHEN now() - a.seen_at >= interval '30 minutes'
                                THEN a.seen_at ELSE a.previous_seen_at END,
        seen_at = now()
  RETURNING previous_seen_at INTO v_prev;

  RETURN v_prev;
END
$$;

COMMENT ON FUNCTION public.mark_arrival(text, uuid) IS
  'Fire-and-forget arrival-visit anchor (00675, US-14, CONTRACT.md §3). Upserts the '
  'caller''s own arrival_anchors row for (scope, p_engagement_id) and returns the prior '
  'seen_at (NULL on a first visit). A call within 30 minutes of the caller''s own last '
  'call is the same visit: previous_seen_at is kept rather than advanced. scope must be '
  'desk (p_engagement_id NULL) or document (p_engagement_id required); any other shape '
  'raises 22023. Unauthenticated raises 42501. p_engagement_id is stored exactly as '
  'given — no chain-following resolution is performed (see the migration header).';

REVOKE ALL ON FUNCTION public.mark_arrival(text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_arrival(text, uuid) TO authenticated;
