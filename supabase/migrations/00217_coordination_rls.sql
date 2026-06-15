-- ═══════════════════════════════════════════════════════════════════════════
-- 00217 — coordination party-scoped RLS (Track 5, R46/R47/R48)
--
-- R46 parties are LOGIN-LESS in v1 — the designer records their moves. But the
-- table is built so a later login is a flag flip (set project_parties.profile_id),
-- not a migration. These policies grant a party WITH a real login READ access to
-- the coordination surface on its project, so the day a GC/vendor logs in they
-- can SEE what's in their court — without any new policy work.
--
-- A "party on this project for this user" is: a project_parties row whose
-- profile_id = auth.uid(). When that holds, the user may READ:
--   · client_decisions on that project (the open items),
--   · coordination_item_revisions of those items (submittal history),
--   · project_parties on that project (already covered by the self-select policy
--     in 00212; re-asserted here idempotently for completeness).
--
-- Deliberately NO party INSERT/UPDATE on client_decisions: every coordination
-- ACT (answer an RFI, approve a submittal, resolve a sign-off, record a punch
-- fix) funnels through the SECURITY DEFINER resolve_coordination_item RPC (00218)
-- — the same posture as sign_proposal (00210). A party never writes the table
-- directly. These are ADDITIVE SELECT policies; PostgreSQL ORs them with the
-- existing designer/client policies (00064), so no existing access narrows.
--
-- Additive only (D7): new SELECT policies only. is_coordination_party() is a
-- SECURITY DEFINER helper (bypasses RLS to avoid recursion, like
-- is_project_team_member, 00087).
-- ═══════════════════════════════════════════════════════════════════════════

-- ── Helper: is auth.uid() a logged-in party on this project? ─────────────────
CREATE OR REPLACE FUNCTION public.is_coordination_party(
  _project_id UUID,
  _user_id    UUID DEFAULT auth.uid()
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.project_parties pp
    WHERE pp.project_id = _project_id
      AND pp.profile_id = _user_id
  );
$$;

COMMENT ON FUNCTION public.is_coordination_party(UUID, UUID) IS
  'Track 5 RLS helper: true when the user is a logged-in project_parties row on '
  'the project (profile_id = user). SECURITY DEFINER to avoid RLS recursion '
  '(mirrors is_project_team_member, 00087). Read-only — parties never write '
  'client_decisions; acts go through resolve_coordination_item.';

GRANT EXECUTE ON FUNCTION public.is_coordination_party(UUID, UUID) TO authenticated;

-- ── client_decisions: a logged-in party READS its project's open items ───────
DROP POLICY IF EXISTS coordination_party_decisions_select ON public.client_decisions;
CREATE POLICY coordination_party_decisions_select
  ON public.client_decisions FOR SELECT
  TO authenticated
  USING (
    project_id IS NOT NULL
    AND public.is_coordination_party(project_id)
  );

-- ── coordination_item_revisions: a party READS its items' submittal history ──
DROP POLICY IF EXISTS coordination_party_revisions_select
  ON public.coordination_item_revisions;
CREATE POLICY coordination_party_revisions_select
  ON public.coordination_item_revisions FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.client_decisions cd
      WHERE cd.id = coordination_item_revisions.decision_id
        AND cd.project_id IS NOT NULL
        AND public.is_coordination_party(cd.project_id)
    )
  );

-- ── project_parties: a party READS its project's parties (its co-courts) ─────
-- 00212 already grants this via project_parties_self_select; re-assert
-- idempotently through the helper so the party read-scope is fully expressed
-- in one place. (DROP-then-CREATE keeps it a single canonical policy.)
DROP POLICY IF EXISTS coordination_party_parties_select ON public.project_parties;
CREATE POLICY coordination_party_parties_select
  ON public.project_parties FOR SELECT
  TO authenticated
  USING (public.is_coordination_party(project_id));
