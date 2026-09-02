-- ═══════════════════════════════════════════════════════════════════════════
-- 00556 — Admin studio management (status enforcement, read model, admin RPCs)
--
-- The admin portal can see and manage users but has no path into STUDIOS
-- (organizations WHERE type = 'design_studio'). Two gaps this closes:
--
--   1. `organizations.status` was decorative. Nothing read it, so suspending a
--      studio changed nothing. Enforcement lands in the two UNPINNED co-member
--      helpers every studio RLS policy already routes through, so ~79 policy
--      references inherit it with zero policy edits.
--   2. Platform admins had no authorized write path. Admin writes now go
--      through service_role-only SECURITY DEFINER `admin_*` RPCs so the
--      ownership invariants live next to the data — service_role bypasses
--      guard_org_membership_changes (00484:385, keyed on current_setting('role')),
--      so a portal writing raw rows would silently defeat them.
--
-- Lineage (redefined bodies, copied verbatim + delta):
--   public.is_studio_comember(uuid)   00315 → 00556  (+ org.status = 'active')
--   public.is_active_org_member(uuid) 00321 → 00556  (+ org.status = 'active')
--
-- NOT redefined (hash-pinned by supabase/tests/edge_api/
-- public_rpc_authorization_contract_test.sql): _provision_studio,
-- _primary_studio_for, is_org_owner, is_org_admin_or_owner,
-- guard_org_membership_changes, transfer_studio_ownership,
-- generate_unique_org_slug, create_studio_workspace, user_has_role.
-- Deliberately untouched: is_org_admin_or_owner (a suspended studio's own
-- admins keep managing their roster) and resolve_studio_identity (anon
-- letterhead keeps rendering — deactivation is not deletion).
--
-- Pre-apply census — RUN THIS ON THE TARGET BEFORE `supabase db push`:
--   select type, status, count(*) from organizations group by 1,2;
-- The reworked is_studio_comember / is_active_org_member withdraw co-member
-- shared access from EVERY organization whose status is not 'active': a
-- pending_approval, suspended or deactivated org loses the shared workspace the
-- moment this applies. Reactivate the rows that must keep it, or accept the
-- withdrawal per row, before pushing.
--
-- Adds GRANT/REVOKE → regenerate seed/00-legacy-grants.sql
-- (python3 scripts/generate-legacy-grants.py) after this migration.
-- ═══════════════════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. STATUS ENFORCEMENT
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── is_studio_comember(p_owner) ─────────────────────────────────────────────
-- 00315 body, verbatim, plus the organization-status join on the EXISTS leg.
-- The self-branch (p_owner = auth.uid()) is untouched on purpose: a suspended
-- studio's members keep seeing their OWN designer_id = auth.uid() rows; what
-- suspension withdraws is the shared workspace.
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
      JOIN organizations org
        ON org.id = me.organization_id
       AND org.status = 'active'
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
  'True when the caller shares an ACTIVE organization''s active non-guest membership with p_owner (or is p_owner). NULL-safe (returns false for NULL p_owner → pool leads never leak). A suspended/deactivated organization confers no co-membership (00556); the self-branch is unaffected. SECURITY DEFINER to bypass org_members own-row/admin-only SELECT RLS so plain members resolve co-membership.';

-- ─── is_active_org_member(p_org_id) ──────────────────────────────────────────
-- 00321 body, verbatim, plus the organization-status guard.
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
  ) AND EXISTS (
    SELECT 1
    FROM organizations o
    WHERE o.id = p_org_id
      AND o.status = 'active'
  );
$$;

REVOKE ALL ON FUNCTION public.is_active_org_member(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_active_org_member(uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.is_active_org_member(uuid) IS
  'True when the caller is an active, non-guest member of p_org_id AND that organization''s status is active (00556). SECURITY DEFINER to bypass organization_members own-row/admin-only SELECT RLS so a co-member roster policy does not recurse (the 00068 problem). Backs the "Active members can view co-members" SELECT policy and useStudioHasTeam.';

-- ─── guard_organization_admin_columns() ──────────────────────────────────────
-- 00021's "Org admins can update organization" policy is USING-only (no WITH
-- CHECK), so a studio owner could UPDATE organizations SET status = 'active'
-- and undo their own suspension. This trigger is the WITH CHECK that policy
-- never had: the platform-controlled columns move only under service_role.
CREATE OR REPLACE FUNCTION public.guard_organization_admin_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  -- service_role is the admin write path; a NULL auth.uid() is a migration,
  -- psql/postgres or pg_cron context (same idiom as 00317's studio-id guard).
  IF current_setting('role', true) = 'service_role' OR (select auth.uid()) IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status
     OR NEW.type IS DISTINCT FROM OLD.type
     OR NEW.subscription_tier IS DISTINCT FROM OLD.subscription_tier
     OR NEW.subscription_expires_at IS DISTINCT FROM OLD.subscription_expires_at
     OR NEW.business_verified IS DISTINCT FROM OLD.business_verified
     OR NEW.business_verified_at IS DISTINCT FROM OLD.business_verified_at THEN
    RAISE EXCEPTION 'organization_admin_column_protected';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.guard_organization_admin_columns() FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.guard_organization_admin_columns() IS
  'BEFORE UPDATE guard on organizations: status, type, subscription_tier, subscription_expires_at and the business_verified pair are platform-controlled and move only under the service_role database role (admin_* RPCs / portal service routes) or in a NULL-auth.uid() context (migrations, psql, pg_cron). Closes the self-reactivation hole left by 00021''s USING-only "Org admins can update organization" policy. Profile-field edits (name, slug, logo, contact, address, settings) are unaffected.';

DROP TRIGGER IF EXISTS guard_organization_admin_columns ON public.organizations;
CREATE TRIGGER guard_organization_admin_columns
  BEFORE UPDATE ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION public.guard_organization_admin_columns();

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. READ MODEL — admin_studio_overview
-- ═══════════════════════════════════════════════════════════════════════════

DROP VIEW IF EXISTS public.admin_studio_overview;
CREATE VIEW public.admin_studio_overview AS
SELECT
  o.id,
  o.type,
  o.name,
  o.slug,
  o.logo_url,
  o.website,
  o.description,
  o.email,
  o.phone,
  o.address,
  o.settings,
  o.subscription_tier,
  o.subscription_expires_at,
  o.business_verified,
  o.business_verified_at,
  o.tax_id,
  o.status,
  o.rolodex_seed_skipped_at,
  o.created_at,
  o.updated_at,
  studio_owner.user_id AS owner_user_id,
  member_counts.active_member_count,
  member_counts.invited_count,
  project_counts.project_count
FROM public.organizations o
LEFT JOIN LATERAL (
  SELECT m.user_id
  FROM public.organization_members m
  WHERE m.organization_id = o.id
    AND m.role = 'owner'
    AND m.status = 'active'
  ORDER BY m.joined_at NULLS LAST, m.created_at
  LIMIT 1
) AS studio_owner ON true
LEFT JOIN LATERAL (
  SELECT
    count(*) FILTER (WHERE m.status = 'active')  AS active_member_count,
    count(*) FILTER (WHERE m.status = 'invited') AS invited_count
  FROM public.organization_members m
  WHERE m.organization_id = o.id
) AS member_counts ON true
LEFT JOIN LATERAL (
  SELECT count(*) AS project_count
  FROM public.projects p
  WHERE p.studio_id = o.id
) AS project_counts ON true
WHERE o.type = 'design_studio';

REVOKE ALL ON public.admin_studio_overview FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.admin_studio_overview TO service_role;

COMMENT ON VIEW public.admin_studio_overview IS
  'Admin-portal read model for design studios: every organizations column plus the first active owner and active/invited/project counts. Definer-rights view (no security_invoker) so it bypasses RLS — service_role only, never granted to anon/authenticated.';

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. PRIVATE HELPERS (definer-internal, like _provision_studio)
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public._assert_admin_actor(p_actor uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  IF current_setting('role', true) IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'service_role_only'
      USING DETAIL = 'admin_* RPCs are reachable only under the service_role database role';
  END IF;

  IF p_actor IS NULL OR NOT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    JOIN public.roles r ON r.id = ur.role_id
    WHERE ur.user_id = p_actor
      AND r.domain = 'admin'
  ) THEN
    RAISE EXCEPTION 'actor_not_platform_admin'
      USING DETAIL = 'p_actor holds no admin-domain role';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public._assert_admin_actor(uuid) FROM PUBLIC, anon, authenticated, service_role;

COMMENT ON FUNCTION public._assert_admin_actor(uuid) IS
  'Internal helper: every admin_* studio RPC begins here. Raises service_role_only unless the active database role is service_role (the trusted server-side path), then actor_not_platform_admin unless p_actor carries a roles.domain = ''admin'' grant. Not for direct callers.';

CREATE OR REPLACE FUNCTION public._lock_studio(p_org_id uuid)
RETURNS public.organizations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_org public.organizations;
BEGIN
  SELECT * INTO v_org
  FROM public.organizations
  WHERE id = p_org_id
    AND type = 'design_studio'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'studio_not_found';
  END IF;

  RETURN v_org;
END;
$$;

REVOKE ALL ON FUNCTION public._lock_studio(uuid) FROM PUBLIC, anon, authenticated, service_role;

COMMENT ON FUNCTION public._lock_studio(uuid) IS
  'Internal helper: SELECT ... FOR UPDATE the design_studio organization, serializing every roster/ownership mutation on the org row exactly as transfer_studio_ownership (00484) does. Raises studio_not_found. Not for direct callers.';

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. ADMIN RPCs (service_role only; p_actor is the platform admin)
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── admin_create_studio_for_user ────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_create_studio_for_user(
  p_actor uuid,
  p_owner_user_id uuid,
  p_name text,
  p_subscription_tier subscription_tier DEFAULT 'free',
  p_grant_designer_role boolean DEFAULT true
)
RETURNS public.organizations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_name text;
  v_org  public.organizations;
  v_role_id uuid;
BEGIN
  PERFORM public._assert_admin_actor(p_actor);

  IF p_owner_user_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = p_owner_user_id
  ) THEN
    RAISE EXCEPTION 'user_not_found';
  END IF;

  v_name := NULLIF(trim(coalesce(p_name, '')), '');
  IF v_name IS NULL THEN
    RAISE EXCEPTION 'invalid_name';
  END IF;

  -- _provision_studio inserts the org AND the active owner membership. The
  -- membership must exist BEFORE any is_designer flip below, or 00295's
  -- provision_studio_on_designer trigger mints a second, spurious studio.
  v_org := public._provision_studio(p_owner_user_id, v_name);

  IF p_subscription_tier IS DISTINCT FROM 'free'::subscription_tier THEN
    UPDATE public.organizations
    SET subscription_tier = p_subscription_tier,
        updated_at = now()
    WHERE id = v_org.id
    RETURNING * INTO v_org;
  END IF;

  IF p_grant_designer_role THEN
    SELECT id INTO v_role_id FROM public.roles WHERE name = 'studio_owner';
    IF v_role_id IS NOT NULL THEN
      INSERT INTO public.user_roles (user_id, role_id, granted_by)
      VALUES (p_owner_user_id, v_role_id, p_actor)
      ON CONFLICT (user_id, role_id) DO NOTHING;
    END IF;

    UPDATE public.profiles
    SET is_designer = true
    WHERE id = p_owner_user_id
      AND is_designer IS DISTINCT FROM true;
  END IF;

  RETURN v_org;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_create_studio_for_user(uuid, uuid, text, subscription_tier, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_create_studio_for_user(uuid, uuid, text, subscription_tier, boolean) TO service_role;

COMMENT ON FUNCTION public.admin_create_studio_for_user(uuid, uuid, text, subscription_tier, boolean) IS
  'Platform admin creates a design_studio for p_owner_user_id (org + active owner membership via _provision_studio), optionally sets the tier, then — only after the membership exists — grants studio_owner and flips profiles.is_designer. Errors: service_role_only, actor_not_platform_admin, user_not_found, invalid_name. A user who already owns a studio simply gains a second one.';

-- ─── admin_add_studio_member ─────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_add_studio_member(
  p_actor uuid,
  p_org_id uuid,
  p_user_id uuid,
  p_role member_role DEFAULT 'member',
  p_teammate_type text DEFAULT 'member',
  p_job_title text DEFAULT NULL,
  p_staff_role text DEFAULT NULL
)
RETURNS public.organization_members
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_org        public.organizations;
  v_member     public.organization_members;
  v_job_title  text;
  v_staff_role text;
  v_role_id    uuid;
BEGIN
  PERFORM public._assert_admin_actor(p_actor);

  IF p_role IS NULL THEN
    RAISE EXCEPTION 'invalid_role';
  END IF;

  v_org := public._lock_studio(p_org_id);
  IF v_org.status <> 'active' THEN
    RAISE EXCEPTION 'organization_not_active';
  END IF;

  IF p_role = 'owner' THEN
    RAISE EXCEPTION 'use_transfer_ownership';
  END IF;

  IF p_user_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = p_user_id
  ) THEN
    RAISE EXCEPTION 'user_not_found';
  END IF;

  v_job_title  := NULLIF(trim(coalesce(p_job_title, '')), '');
  v_staff_role := NULLIF(trim(coalesce(p_staff_role, '')), '');
  IF length(coalesce(v_job_title, '')) > 120
     OR length(coalesce(v_staff_role, '')) > 120 THEN
    RAISE EXCEPTION 'job_title_too_long';
  END IF;

  SELECT * INTO v_member
  FROM public.organization_members
  WHERE organization_id = p_org_id
    AND user_id = p_user_id
  FOR UPDATE;

  IF FOUND THEN
    IF v_member.status = 'active' THEN
      RAISE EXCEPTION 'already_member';
    END IF;

    UPDATE public.organization_members
    SET role = p_role,
        status = 'active',
        invitation_token = NULL,
        invitation_expires_at = NULL,
        invited_by = p_actor,
        joined_at = COALESCE(joined_at, now()),
        job_title = COALESCE(v_job_title, job_title),
        staff_role = COALESCE(v_staff_role, staff_role),
        updated_at = now()
    WHERE id = v_member.id
    RETURNING * INTO v_member;
  ELSE
    INSERT INTO public.organization_members (
      user_id, organization_id, role, status, invited_by, joined_at,
      job_title, staff_role
    )
    VALUES (
      p_user_id, p_org_id, p_role, 'active', p_actor, now(),
      v_job_title, v_staff_role
    )
    RETURNING * INTO v_member;
  END IF;

  -- Designer teammate → studio_designer + is_designer. Mirrors the
  -- workspace-member-invite edge function; the membership row above already
  -- suppresses 00295's personal-studio trigger.
  IF p_teammate_type = 'designer' THEN
    SELECT id INTO v_role_id FROM public.roles WHERE name = 'studio_designer';
    IF v_role_id IS NOT NULL THEN
      INSERT INTO public.user_roles (user_id, role_id, granted_by)
      VALUES (p_user_id, v_role_id, p_actor)
      ON CONFLICT (user_id, role_id) DO NOTHING;
    END IF;

    UPDATE public.profiles
    SET is_designer = true
    WHERE id = p_user_id
      AND is_designer IS DISTINCT FROM true;
  END IF;

  RETURN v_member;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_add_studio_member(uuid, uuid, uuid, member_role, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_add_studio_member(uuid, uuid, uuid, member_role, text, text, text) TO service_role;

COMMENT ON FUNCTION public.admin_add_studio_member(uuid, uuid, uuid, member_role, text, text, text) IS
  'Platform admin adds an EXISTING user to a studio roster as an active member. A prior invited/removed/suspended row is revived in place (token/expiry cleared, joined_at preserved). p_teammate_type = ''designer'' also grants studio_designer and flips is_designer — after the membership exists, so 00295''s trigger cannot mint a spurious personal studio. Errors: service_role_only, actor_not_platform_admin, studio_not_found, organization_not_active, use_transfer_ownership (p_role = owner), user_not_found, job_title_too_long, already_member.';

-- ─── admin_set_studio_member_role ────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_set_studio_member_role(
  p_actor uuid,
  p_org_id uuid,
  p_user_id uuid,
  p_role member_role
)
RETURNS public.organization_members
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_member public.organization_members;
BEGIN
  PERFORM public._assert_admin_actor(p_actor);

  IF p_role IS NULL THEN
    RAISE EXCEPTION 'invalid_role';
  END IF;

  PERFORM public._lock_studio(p_org_id);

  SELECT * INTO v_member
  FROM public.organization_members
  WHERE organization_id = p_org_id
    AND user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND OR v_member.status <> 'active' THEN
    RAISE EXCEPTION 'target_not_active_member';
  END IF;

  IF v_member.role = 'owner' OR p_role = 'owner' THEN
    RAISE EXCEPTION 'use_transfer_ownership';
  END IF;

  UPDATE public.organization_members
  SET role = p_role,
      updated_at = now()
  WHERE id = v_member.id
  RETURNING * INTO v_member;

  RETURN v_member;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_set_studio_member_role(uuid, uuid, uuid, member_role) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_studio_member_role(uuid, uuid, uuid, member_role) TO service_role;

COMMENT ON FUNCTION public.admin_set_studio_member_role(uuid, uuid, uuid, member_role) IS
  'Platform admin changes an active roster member''s member_role. Ownership never moves through this path — either side being ''owner'' raises use_transfer_ownership. Errors: service_role_only, actor_not_platform_admin, studio_not_found, target_not_active_member, use_transfer_ownership.';

-- ─── admin_remove_studio_member ──────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_remove_studio_member(
  p_actor uuid,
  p_org_id uuid,
  p_user_id uuid,
  p_hard_delete boolean DEFAULT false
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_member public.organization_members;
BEGIN
  PERFORM public._assert_admin_actor(p_actor);
  PERFORM public._lock_studio(p_org_id);

  SELECT * INTO v_member
  FROM public.organization_members
  WHERE organization_id = p_org_id
    AND user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'member_not_found';
  END IF;

  IF v_member.role = 'owner' AND v_member.status = 'active' THEN
    RAISE EXCEPTION 'owner_remove_requires_transfer';
  END IF;

  IF p_hard_delete THEN
    DELETE FROM public.organization_members WHERE id = v_member.id;
  ELSE
    UPDATE public.organization_members
    SET status = 'removed',
        invitation_token = NULL,
        invitation_expires_at = NULL,
        updated_at = now()
    WHERE id = v_member.id;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_remove_studio_member(uuid, uuid, uuid, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_remove_studio_member(uuid, uuid, uuid, boolean) TO service_role;

COMMENT ON FUNCTION public.admin_remove_studio_member(uuid, uuid, uuid, boolean) IS
  'Platform admin removes a roster member, or cancels a pending invite (the same row, status = invited). Soft by default: status = ''removed'' with the token/expiry cleared — the terminal state 00553''s expiry sweep also lands on. p_hard_delete deletes the row outright. Does NOT revoke studio_designer or clear profiles.is_designer: the user may still belong to other studios, so role revocation is a separate, deliberate admin action. Errors: service_role_only, actor_not_platform_admin, studio_not_found, member_not_found, owner_remove_requires_transfer.';

-- ─── admin_transfer_studio_ownership ─────────────────────────────────────────
-- Mirrors 00484's transfer_studio_ownership invariants (serialize on the org,
-- promote first and assert exactly one row, then demote) minus the auth.uid()
-- identity — here the acting owner is the platform, not a member.
CREATE OR REPLACE FUNCTION public.admin_transfer_studio_ownership(
  p_actor uuid,
  p_org_id uuid,
  p_new_owner uuid,
  p_demoted_role member_role DEFAULT 'admin'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_target        public.organization_members;
  v_affected_rows integer;
  v_active_owners integer;
BEGIN
  PERFORM public._assert_admin_actor(p_actor);

  IF p_demoted_role IS NULL THEN
    RAISE EXCEPTION 'invalid_role';
  END IF;

  PERFORM public._lock_studio(p_org_id);

  IF p_demoted_role = 'owner' THEN
    RAISE EXCEPTION 'invalid_role';
  END IF;

  SELECT * INTO v_target
  FROM public.organization_members
  WHERE organization_id = p_org_id
    AND user_id = p_new_owner
    AND status = 'active'
  FOR UPDATE;

  IF NOT FOUND OR v_target.role = 'guest' THEN
    RAISE EXCEPTION 'target_not_active_member';
  END IF;

  IF v_target.role = 'owner' THEN
    -- Already an owner. With exactly one active owner there is nothing to move,
    -- so this is a caller error. With two or more the org is in the very state
    -- this RPC exists to repair: skip the promote and fall through to the
    -- demote, which collapses the roster back to this single owner.
    SELECT count(*) INTO v_active_owners
    FROM public.organization_members
    WHERE organization_id = p_org_id
      AND status = 'active'
      AND role = 'owner';

    IF v_active_owners = 1 THEN
      RAISE EXCEPTION 'already_owner';
    END IF;
  ELSE
    UPDATE public.organization_members
    SET role = 'owner',
        updated_at = now()
    WHERE id = v_target.id
      AND organization_id = p_org_id
      AND user_id = p_new_owner
      AND status = 'active';

    GET DIAGNOSTICS v_affected_rows = ROW_COUNT;
    IF v_affected_rows <> 1 THEN
      RAISE EXCEPTION 'target_not_active_member';
    END IF;
  END IF;

  UPDATE public.organization_members
  SET role = p_demoted_role,
      updated_at = now()
  WHERE organization_id = p_org_id
    AND status = 'active'
    AND role = 'owner'
    AND id <> v_target.id;

  GET DIAGNOSTICS v_affected_rows = ROW_COUNT;
  -- On the repair path the demote IS the transfer: at least one co-owner must
  -- have moved, or the count read above was stale.
  IF v_target.role = 'owner' AND v_affected_rows < 1 THEN
    RAISE EXCEPTION 'target_not_active_member';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_transfer_studio_ownership(uuid, uuid, uuid, member_role) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_transfer_studio_ownership(uuid, uuid, uuid, member_role) TO service_role;

COMMENT ON FUNCTION public.admin_transfer_studio_ownership(uuid, uuid, uuid, member_role) IS
  'Platform-admin ownership transfer: serialize on the organization, promote the named active non-guest member to owner (asserting a one-row promotion), then demote every other active owner to p_demoted_role. Leaves exactly one active owner. A target who is ALREADY an active owner raises already_owner only when it is the SOLE active owner; with two or more the promote is skipped and the demote repairs the roster down to that one owner. Errors: service_role_only, actor_not_platform_admin, studio_not_found, invalid_role (p_demoted_role NULL or owner), target_not_active_member, already_owner.';

-- ─── admin_set_studio_status ─────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_set_studio_status(
  p_actor uuid,
  p_org_id uuid,
  p_status organization_status
)
RETURNS public.organizations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_org public.organizations;
BEGIN
  PERFORM public._assert_admin_actor(p_actor);

  IF p_status IS NULL THEN
    RAISE EXCEPTION 'invalid_status_transition';
  END IF;

  v_org := public._lock_studio(p_org_id);

  IF v_org.status = p_status THEN
    RETURN v_org;
  END IF;

  IF NOT (
    (v_org.status = 'active'           AND p_status IN ('suspended', 'deactivated'))
    OR (v_org.status = 'suspended'        AND p_status IN ('active', 'deactivated'))
    OR (v_org.status = 'deactivated'      AND p_status = 'active')
    OR (v_org.status = 'pending_approval' AND p_status IN ('active', 'deactivated'))
  ) THEN
    RAISE EXCEPTION 'invalid_status_transition';
  END IF;

  UPDATE public.organizations
  SET status = p_status,
      updated_at = now()
  WHERE id = p_org_id
  RETURNING * INTO v_org;

  RETURN v_org;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_set_studio_status(uuid, uuid, organization_status) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_studio_status(uuid, uuid, organization_status) TO service_role;

COMMENT ON FUNCTION public.admin_set_studio_status(uuid, uuid, organization_status) IS
  'Platform admin suspends, reactivates or deactivates a studio. Legal transitions: active→suspended|deactivated, suspended→active|deactivated, deactivated→active, pending_approval→active|deactivated; a no-op repeat returns the row unchanged, anything else raises invalid_status_transition. The reason for the change is the caller''s to record in audit_logs.metadata. Suspension/deactivation is enforced through is_studio_comember and is_active_org_member (00556). Errors: service_role_only, actor_not_platform_admin, studio_not_found, invalid_status_transition.';
