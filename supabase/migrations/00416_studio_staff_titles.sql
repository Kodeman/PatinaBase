-- ═══════════════════════════════════════════════════════════════════════════
-- 00416 — Studio staff titles (Call Sheet Wave 1)
--
-- The Call Sheet program (docs/design/studio-rosters/) starts by letting a
-- studio member carry a human job title ("Lead Designer", "Studio Manager") and
-- a coarse staff-role tier alongside the existing owner/admin/member `role`.
-- Both are free TEXT, not enums: the vocab lives code-side in
-- packages/types/src/studio-config.ts (StaffRole ~9 values + labels) and is
-- validated in the UI, not the DB — the same idiom 00281 used for
-- project_parties.trade, so the vocab can grow without a migration.
--
-- Own-row title writes go through set_my_member_title(), NOT a direct UPDATE
-- policy. See the comment block below the table alter for why.
-- ═══════════════════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. organization_members — job_title / staff_role
-- ═══════════════════════════════════════════════════════════════════════════
ALTER TABLE public.organization_members
  ADD COLUMN IF NOT EXISTS job_title TEXT,
  ADD COLUMN IF NOT EXISTS staff_role TEXT;

COMMENT ON COLUMN public.organization_members.job_title IS
  'Call Sheet: the member''s human job title ("Lead Designer", "Studio '
  'Manager", …). Free TEXT — the vocab is code-resident in '
  'packages/types/src/studio-config.ts (StaffRole labels feed the title picker''s '
  'suggestions) and UI-validated, deliberately NO CHECK constraint, mirroring '
  'the project_parties.trade idiom from 00281. NULL = no title set. Own-row '
  'writes go through set_my_member_title() below, never a direct UPDATE.';
COMMENT ON COLUMN public.organization_members.staff_role IS
  'Call Sheet: coarse staff-role tier (StaffRole in '
  'packages/types/src/studio-config.ts, ~9 values e.g. lead_designer, '
  'studio_manager, bookkeeper, trades). Free TEXT, no CHECK — same posture as '
  'job_title. Distinct from the `role` column (owner/admin/member permission '
  'tier): staff_role is descriptive, not authorizing. Admin-writable via the '
  'existing 00068 admin UPDATE policy; there is no self-service RPC for it in '
  'this migration (Wave 1 only ships own-row title writes).';

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. set_my_member_title(p_organization_id, p_job_title) — own-row title RPC
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.set_my_member_title(
  p_organization_id uuid,
  p_job_title text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF length(p_job_title) > 120 THEN
    RAISE EXCEPTION 'job_title_too_long';
  END IF;

  UPDATE organization_members
  SET job_title = NULLIF(trim(p_job_title), ''),
      updated_at = now()
  WHERE organization_id = p_organization_id
    AND user_id = auth.uid()
    AND status = 'active';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'not_an_active_member';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.set_my_member_title(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_my_member_title(uuid, text) TO authenticated, service_role;

COMMENT ON FUNCTION public.set_my_member_title(uuid, text) IS
  'Call Sheet (U4): lets the calling user set their OWN job_title on an active '
  'membership row in p_organization_id. Rejects a title over 120 chars '
  '(job_title_too_long) and any call where the caller has no active membership '
  'in that org (not_an_active_member). SECURITY DEFINER so a plain member can '
  'write their own title without an own-row UPDATE policy on '
  'organization_members (see the comment above the guard-trigger note in this '
  'migration''s header for why that policy is deliberately absent).';

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. Why there is NO own-row UPDATE policy on organization_members
-- ═══════════════════════════════════════════════════════════════════════════
-- organization_members today has exactly one UPDATE policy: 00068's
-- "Org admins can update members", gated on is_org_admin_or_owner(organization_id)
-- with no per-column restriction (USING only, no WITH CHECK — that gap is what
-- 00319's guard_org_membership_changes trigger closes for role/status mutations).
-- There is deliberately NO additional "members can update their own row" UPDATE
-- policy, because org_members.role lives on the SAME row as job_title: an
-- own-row UPDATE policy scoped to `user_id = auth.uid()` would let a plain
-- member UPDATE their own role from 'member' to 'admin' in the same statement
-- (RLS can restrict WHICH rows a member may touch, but not which COLUMNS,
-- without a column-privilege GRANT this schema doesn't use). The 00319 guard
-- trigger does NOT close this gap for a member: its role-mutation checks
-- (owner_promotion_requires_owner, etc.) only fire on role='owner' transitions
-- and DELETE — a member->admin UPDATE by the row's own user_id is not owner
-- territory and would sail through the trigger untouched if RLS allowed the
-- UPDATE at all. Two writers are correct instead:
--   * Admin writes (job_title OR staff_role on a co-member's row) ride the
--     existing 00068 admin UPDATE policy — an admin/owner already has
--     unrestricted UPDATE on member rows in their org, so no new grant needed.
--   * Own-row title writes go ONLY through set_my_member_title() above: a
--     SECURITY DEFINER RPC that touches job_title and nothing else, so a
--     member physically cannot smuggle a role change through it.
-- A member's plain `UPDATE organization_members SET role = 'admin' WHERE
-- user_id = auth.uid()` therefore updates 0 rows today (no UPDATE policy
-- admits a non-admin caller at all) — regression-tested in
-- supabase/tests/rls/studio_titles_test.sql case (d).
