-- ═══════════════════════════════════════════════════════════════════════════
-- 00766 — studio_need_state_facts(): teammates' acted need states, facts only
-- (US-28 S5b, U-Q4)
-- V20 U-Q4: the studio scope sees a teammate's acted state, facts only
-- (uplift.md (d) change 8). This file serves those facts through a projection
-- and leaves the table own-row only.
--
-- Why not a table policy (SQ-832, review in
-- artifacts/portal-uplift-2026-10-12/build-review/rls-review.md):
--   * F2 — a studio-wide SELECT policy shares whole rows: the free-text
--     waiting_on and set_aside_reason, the deferral and set-aside dates, and
--     rows never acted on. That is more than facts.
--   * F1 — the deployed useNeedStates keys table rows by need_key alone, so a
--     teammate's row read through the table would settle or hide the viewer's
--     own line. Keeping the table own-row only keeps every deployed bundle
--     correct in any rollout order.
--
-- So this file:
--   * drops studio_need_states_select_studio, the table policy an earlier draft
--     of this same file added (never applied on Strata); 00765's own-row
--     SELECT policy, grants and set_need_state writer are unchanged;
--   * adds public.studio_need_state_facts(): a teammate's acted row
--     (acted_at IS NOT NULL, not the caller's own) filed under a studio where
--     the caller holds an active non-guest seat in an active organization
--     (public.is_active_org_member, 00556), as user_id, organization_id,
--     project_id, need_key and acted_at, and nothing else;
--   * restores 00765's table comment.
--
-- Revert (unapplied-on-prod remediation only; after prod apply, fix forward):
--   DROP FUNCTION public.studio_need_state_facts();
-- ═══════════════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS studio_need_states_select_studio ON public.studio_need_states;

CREATE OR REPLACE FUNCTION public.studio_need_state_facts()
RETURNS TABLE (
  user_id uuid,
  organization_id uuid,
  project_id uuid,
  need_key text,
  acted_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT s.user_id, s.organization_id, s.project_id, s.need_key, s.acted_at
  FROM public.studio_need_states s
  WHERE s.acted_at IS NOT NULL
    AND s.user_id <> (SELECT auth.uid())
    AND public.is_active_org_member(s.organization_id);
$$;

REVOKE ALL ON FUNCTION public.studio_need_state_facts() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.studio_need_state_facts() TO authenticated;

COMMENT ON FUNCTION public.studio_need_state_facts() IS
  'Teammates'' acted Day Sheet need states in the caller''s active studios, facts only: who, studio, project, need and when. No free text, dates or unacted rows; never the caller''s own rows.';

COMMENT ON TABLE public.studio_need_states IS
  'Per-user state for a studio Day Sheet need. Authenticated users can select only their own rows; all writes use set_need_state.';
