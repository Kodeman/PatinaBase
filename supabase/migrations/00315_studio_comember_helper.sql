-- ═══════════════════════════════════════════════════════════════════════════
-- 00315 — Studio co-membership helpers (SECURITY DEFINER)
--
-- Foundation for the Designer Studios shared-workspace program (00315–00320).
-- Every widened RLS policy in 00316, both studio_id triggers (00317/00318), the
-- roles guard (00319), and the identity resolver (00320) call these.
--
-- WHY SECURITY DEFINER: organization_members SELECT is own-row + admin-only
-- (00021 "Users can view their org memberships" / 00068 is_org_admin_or_owner).
-- A *plain member* therefore cannot SELECT a co-member's org_members row, so any
-- co-membership predicate that inspects ANOTHER user's membership must bypass
-- org_members RLS. Inlining a double-join (as 00205 margin_notes_studio_read
-- does) is silently empty for non-admin members — the anti-pattern this design
-- replaces (fixed in 00316). These helpers are owned by postgres (migration
-- role), which bypasses RLS, so co-membership resolves for every active member.
--
-- Adds GRANT/REVOKE → regenerate seed/00-legacy-grants.sql after this migration.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── is_studio_comember(p_owner) ─────────────────────────────────────────────
-- True when the calling user shares an active organization membership with the
-- user p_owner (or IS p_owner). NULL-safe: unassigned pool leads carry
-- designer_id IS NULL → returns false, so the studio legs never expose the pool.
-- Guest exclusion: the member_role enum (00021) includes 'guest', and the
-- catalog domain (00152/00154) treats guests as lesser. A guest on EITHER side
-- of the shared membership does NOT confer co-membership — a guest never gains
-- the studio's book, and a co-worker never inherits a guest owner's rows. The
-- self-branch (p_owner = auth.uid()) is unaffected: you always see your own.
CREATE OR REPLACE FUNCTION public.is_studio_comember(p_owner uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p_owner IS NOT NULL AND (
    p_owner = (select auth.uid())
    OR EXISTS (
      SELECT 1
      FROM organization_members me
      JOIN organization_members owner
        ON owner.organization_id = me.organization_id
      WHERE me.user_id    = (select auth.uid())
        AND me.status     = 'active'
        AND me.role       <> 'guest'
        AND owner.user_id = p_owner
        AND owner.status  = 'active'
        AND owner.role    <> 'guest'
    )
  );
$$;

REVOKE ALL ON FUNCTION public.is_studio_comember(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_studio_comember(uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.is_studio_comember(uuid) IS
  'True when the caller shares an active organization membership with p_owner (or is p_owner). NULL-safe (returns false for NULL p_owner → pool leads never leak). SECURITY DEFINER to bypass org_members own-row/admin-only SELECT RLS so plain members resolve co-membership.';

-- ─── _primary_studio_for(p_user) ─────────────────────────────────────────────
-- The user's primary design_studio org: owner-role first, then earliest joined.
-- Reused by the projects trigger, the invoice trigger, both backfills, and the
-- identity read path. authenticated needs EXECUTE because BEFORE INSERT triggers
-- run as the inserting user.
CREATE OR REPLACE FUNCTION public._primary_studio_for(p_user uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT om.organization_id
  FROM organization_members om
  JOIN organizations o ON o.id = om.organization_id
  WHERE om.user_id = p_user
    AND om.status = 'active'
    AND o.type = 'design_studio'
  ORDER BY (om.role = 'owner') DESC, om.joined_at NULLS LAST, om.created_at
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public._primary_studio_for(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public._primary_studio_for(uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public._primary_studio_for(uuid) IS
  'The user''s primary design_studio organization (owner-role first, then earliest joined_at). SECURITY DEFINER; used by studio_id triggers/backfills and the branding resolver.';

-- ─── is_org_owner(org, user) ─────────────────────────────────────────────────
-- Owner-only variant of is_org_admin_or_owner (00068). Used by the 00319 roles
-- guard trigger and transfer_studio_ownership.
CREATE OR REPLACE FUNCTION public.is_org_owner(
  _organization_id uuid,
  _user_id uuid DEFAULT auth.uid()
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM organization_members
    WHERE organization_id = _organization_id
      AND user_id = _user_id
      AND role = 'owner'
      AND status = 'active'
  );
$$;

REVOKE ALL ON FUNCTION public.is_org_owner(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_org_owner(uuid, uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.is_org_owner(uuid, uuid) IS
  'True when _user_id is an active owner of _organization_id. Owner-only sibling of is_org_admin_or_owner (00068); SECURITY DEFINER to bypass org_members RLS.';
