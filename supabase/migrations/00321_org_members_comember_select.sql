-- ═══════════════════════════════════════════════════════════════════════════
-- 00321 — Co-member SELECT on organization_members (roster + owner bylines)
--
-- Final fix wave of the Designer Studios program (00315–00320): co-member
-- roster visibility.
--
-- THE GAP: organization_members SELECT RLS is own-row only
-- ("Users can view their org memberships", 00021) plus admin-view-all
-- ("Org admins can view all members", 00068 → is_org_admin_or_owner). A plain
-- 'member' of a studio therefore cannot SELECT a teammate's org_members row.
-- Two consequences for exactly the non-admin members who need the shared
-- workspace:
--   (a) the Studio tab roster renders empty for non-admin members — a
--       pre-existing hole in the shipped studio-workspaces feature; and
--   (b) useStudioHasTeam() (Wave 5) counts co-members via this same table, so
--       it returns false for plain members → owner-attribution bylines never
--       render for them.
-- The locked product decision is a FULL SHARED WORKSPACE — teammates must see
-- each other — so we add co-member visibility rather than gate it behind admin.
--
-- WHY SECURITY DEFINER (MANDATORY): a SELECT policy on organization_members
-- whose predicate itself queries organization_members recurses infinitely —
-- this is the exact failure 00068 fixed for the admin-view-all leg
-- (is_org_admin_or_owner). is_active_org_member() is owned by postgres (the
-- migration role, which bypasses RLS), so the co-membership probe resolves
-- without re-triggering the SELECT policies.
--
-- GUEST EXCLUSION: matches is_studio_comember's posture (00315) — a 'guest'
-- membership does NOT confer roster visibility as a viewer. An active guest
-- still sees their OWN row via the untouched own-row policy; they simply do not
-- gain the co-member leg. member_role enum (00021) = owner|admin|member|guest.
--
-- ADDITIVE ONLY: nothing is dropped. The own-row (00021), admin-view-all
-- (00068), INSERT/UPDATE/DELETE (00068), and the 00319 last-owner guard trigger
-- are all untouched. RLS SELECT is a UNION of policies, so this leg only widens
-- read visibility for active non-guest members.
--
-- Adds GRANT/REVOKE → regenerate seed/00-legacy-grants.sql after this file.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── is_active_org_member(p_org_id) ──────────────────────────────────────────
-- True when the calling user is an ACTIVE, non-guest member of p_org_id.
-- SECURITY DEFINER to bypass organization_members' own-row/admin-only SELECT
-- RLS (a policy on that table querying that table would otherwise recurse — the
-- 00068 problem). (select auth.uid()) is hoisted so the planner evaluates the
-- uid once per query rather than per row.
CREATE OR REPLACE FUNCTION public.is_active_org_member(p_org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM organization_members
    WHERE organization_id = p_org_id
      AND user_id = (select auth.uid())
      AND status  = 'active'
      AND role    <> 'guest'
  );
$$;

REVOKE ALL ON FUNCTION public.is_active_org_member(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_active_org_member(uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.is_active_org_member(uuid) IS
  'True when the caller is an active, non-guest member of p_org_id. SECURITY DEFINER to bypass organization_members own-row/admin-only SELECT RLS so a co-member roster policy does not recurse (the 00068 problem). Backs the "Active members can view co-members" SELECT policy and useStudioHasTeam.';

-- ─── Additive co-member SELECT policy ────────────────────────────────────────
-- Lets an active non-guest member of an org see every row for that org — the
-- full-shared-workspace roster. UNIONs with own-row (00021) and admin-view-all
-- (00068); drops nothing. DROP IF EXISTS first so replay is idempotent.
DROP POLICY IF EXISTS "Active members can view co-members" ON public.organization_members;
CREATE POLICY "Active members can view co-members" ON public.organization_members
  FOR SELECT USING (public.is_active_org_member(organization_id));
