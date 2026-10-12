-- ═══════════════════════════════════════════════════════════════════════════
-- 00766 — studio_need_states: studio members read teammates' need states (US-28 S5, U-Q4)
-- V20 U-Q4: the studio scope sees a teammate's acted state, facts only
-- (uplift.md (d) change 8). An active non-guest member of a studio may now
-- SELECT every need-state row filed under that studio, a teammate's included.
--
-- Additive only. 00765's own-row SELECT policy, its grants and the
-- set_need_state writer are unchanged: authenticated still holds SELECT and
-- nothing else, no write policy exists, and set_need_state writes only the
-- caller's own rows, so a teammate can read a row but never change it.
-- A row filed under another studio stays hidden unless it is the reader's own.
-- Helper: public.is_active_org_member(uuid) (00556), the active non-guest seat
-- in an active organization; organization_id is the studio the row is filed under.
--
-- Consumer note: useNeedStates (packages/supabase) keys rows by need_key alone.
-- Once this policy is live it must select user_id and split own rows from
-- teammates' (US-28 S3/S5), or a teammate's state reads as the viewer's own.
--
-- Revert (unapplied-on-prod remediation only; after prod apply, fix forward):
--   DROP POLICY studio_need_states_select_studio ON public.studio_need_states;
-- ═══════════════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS studio_need_states_select_studio ON public.studio_need_states;
CREATE POLICY studio_need_states_select_studio ON public.studio_need_states
  FOR SELECT TO authenticated
  USING (public.is_active_org_member(organization_id));

COMMENT ON TABLE public.studio_need_states IS
  'Per-user state for a studio Day Sheet need. Authenticated users can select their own rows and, as active non-guest members, every row filed under their studio (00766); all writes use set_need_state.';
