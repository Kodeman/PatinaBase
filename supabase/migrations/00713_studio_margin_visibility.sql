-- ═══════════════════════════════════════════════════════════════════════════
-- 00713 — Who sees a studio's margin, and the studio_owner role kept in step
--         with the owner seat (C-36; R1, R-PB6)
-- ═══════════════════════════════════════════════════════════════════════════
-- US-16 Phase 1 (SQ-402). rulings R1 and R-PB6, r5 §3.
--
-- Two role systems disagree (r5 §3). System A, user_roles.studio_owner, gates
-- the Financial lens by exact name (use-permissions.ts:425-454), and no path
-- grants it to a second person: transfer_studio_ownership (00484:463-538)
-- flips only organization_members.role. System B, the organization_members
-- seat, is what R-PB6 rules should gate margin and release.
--
-- ── WHAT THIS ADDS ──────────────────────────────────────────────────────────
-- organizations.margin_visibility   'everyone' (default, R1) | 'owners_admins'.
--                                   A typed column rather than a key in
--                                   organizations.settings: useUpdateOrganization
--                                   writes settings whole, which would drop it.
--                                   Members already cannot UPDATE organizations
--                                   (00021: owner/admin only), so the column
--                                   needs no extra guard.
-- set_studio_margin_visibility(p_org, p_visibility)
--                                   owner/admin seat only (is_org_admin_or_owner).
-- can_see_studio_margin(p_org)      true for an active non-guest member when
--                                   the studio shows margin to everyone, and
--                                   for an owner/admin seat always. Guests and
--                                   outsiders: false. 00696 gates
--                                   studio_vendor_accounts.trade_discount_pct
--                                   on it.
--
-- ── studio_owner FOLLOWS THE OWNER SEAT (R-PB6) ─────────────────────────────
-- A deferred constraint trigger on organization_members re-derives System A,
-- at commit, whenever an existing row moves into or out of an owner seat:
-- transfer_studio_ownership, admin_transfer_studio_ownership, a promotion or
-- demotion by role change, a status change on an owner seat, or a deleted
-- owner seat. It redefines none of them.
-- A freshly INSERTed owner seat is deliberately not a sync event.
-- provision_studio_on_designer seats every newly granted designer as owner
-- of a studio of their own. Putting those users on studio_owner would leave
-- them a designer-domain role after their designer role is removed, and the
-- reassignment/role-removal race in public_sd_hardening_contract_test pins
-- that a removed lead holds none. A studio created through
-- admin_create_studio already carries its own designer-role choice
-- (p_grant_designer_role).
-- On a sync event the user:
--   holds an active owner seat in a design studio → studio_owner granted.
--   holds none any more → studio_owner revoked, but only while the user keeps
--     another designer- or admin-domain role. The designer portal admits a
--     user on that domain alone (apps/designer-portal/src/middleware.ts), so
--     dropping someone's only designer role would lock a demoted owner out of
--     the portal. Such a user keeps studio_owner until P1-14 moves the UI gate
--     to the seat (can_see_studio_margin).
-- Backfill: every current active owner of a design studio gets studio_owner
-- (Strata 2026-10-06: 5 active owner seats, 2 studio_owner grants). The
-- backfill grants only; it revokes nothing.
--
-- Adds GRANT/REVOKE → supabase/seed/00-legacy-grants.sql regenerated.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 1. organizations.margin_visibility ─────────────────────────────────────

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS margin_visibility text NOT NULL DEFAULT 'everyone';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'organizations_margin_visibility_ck'
      AND conrelid = 'public.organizations'::regclass
  ) THEN
    ALTER TABLE public.organizations
      ADD CONSTRAINT organizations_margin_visibility_ck
      CHECK (margin_visibility IN ('everyone', 'owners_admins'));
  END IF;
END;
$$;

COMMENT ON COLUMN public.organizations.margin_visibility IS
  'Who in the studio sees margin and trade discount (R1, 00713): everyone (default) or '
  'owners_admins. Changed by an owner/admin seat through set_studio_margin_visibility; read '
  'through can_see_studio_margin.';

-- ─── 2. can_see_studio_margin ───────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.can_see_studio_margin(p_org uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.organization_members AS membership
    JOIN public.organizations AS org ON org.id = membership.organization_id
    WHERE membership.organization_id = p_org
      AND membership.user_id = (select auth.uid())
      AND membership.status = 'active'
      AND membership.role <> 'guest'
      AND (org.margin_visibility = 'everyone' OR membership.role IN ('owner', 'admin'))
  );
$$;

COMMENT ON FUNCTION public.can_see_studio_margin(uuid) IS
  'R1 + R-PB6 (00713): true when the caller holds an active non-guest seat in p_org and the '
  'studio shows margin to everyone, or holds an owner/admin seat. False for guests, outsiders '
  'and a NULL org. SECURITY DEFINER so a plain member can resolve their own seat.';

REVOKE ALL ON FUNCTION public.can_see_studio_margin(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_see_studio_margin(uuid) TO authenticated, service_role;

-- ─── 3. set_studio_margin_visibility ────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.set_studio_margin_visibility(p_org uuid, p_visibility text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'set_studio_margin_visibility: not authenticated'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_visibility IS NULL OR p_visibility NOT IN ('everyone', 'owners_admins') THEN
    RAISE EXCEPTION 'set_studio_margin_visibility: visibility must be everyone or owners_admins'
      USING ERRCODE = 'check_violation';
  END IF;

  PERFORM 1 FROM public.organizations WHERE id = p_org FOR UPDATE;
  IF NOT FOUND OR NOT public.is_org_admin_or_owner(p_org) THEN
    RAISE EXCEPTION 'set_studio_margin_visibility: only an owner or admin of this studio can change who sees margin'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  UPDATE public.organizations
     SET margin_visibility = p_visibility,
         updated_at = now()
   WHERE id = p_org
     AND margin_visibility IS DISTINCT FROM p_visibility;
  RETURN p_visibility;
END;
$$;

COMMENT ON FUNCTION public.set_studio_margin_visibility(uuid, text) IS
  'Set organizations.margin_visibility (everyone | owners_admins) (00713, R1). Owner/admin seat '
  'of p_org only (R-PB6). Returns the value now in force.';

REVOKE ALL ON FUNCTION public.set_studio_margin_visibility(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_studio_margin_visibility(uuid, text) TO authenticated;

-- ─── 4. studio_owner follows the owner seat ─────────────────────────────────

CREATE OR REPLACE FUNCTION public._sync_studio_owner_role(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_role_id uuid;
BEGIN
  SELECT id INTO v_role_id FROM public.roles WHERE name = 'studio_owner';
  IF v_role_id IS NULL OR p_user_id IS NULL THEN
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.organization_members AS membership
    JOIN public.organizations AS org ON org.id = membership.organization_id
    WHERE membership.user_id = p_user_id
      AND membership.role = 'owner'
      AND membership.status = 'active'
      AND org.type = 'design_studio'
  ) THEN
    -- The profile check keeps a cascading profile delete from re-inserting
    -- a grant for a row that is going away.
    INSERT INTO public.user_roles (user_id, role_id)
    SELECT p_user_id, v_role_id
    WHERE EXISTS (SELECT 1 FROM public.profiles WHERE id = p_user_id)
    ON CONFLICT (user_id, role_id) DO NOTHING;
  ELSIF EXISTS (
    SELECT 1
    FROM public.user_roles AS grant_row
    JOIN public.roles AS role ON role.id = grant_row.role_id
    WHERE grant_row.user_id = p_user_id
      AND grant_row.role_id <> v_role_id
      AND role.domain IN ('designer', 'admin')
  ) THEN
    DELETE FROM public.user_roles
    WHERE user_id = p_user_id AND role_id = v_role_id;
  END IF;
END;
$$;

COMMENT ON FUNCTION public._sync_studio_owner_role(uuid) IS
  'Internal (00713, R-PB6): when an owner seat moves (transfer, promotion, demotion, status change, '
  'delete), the user is put on user_roles.studio_owner if they hold an active owner seat in a design '
  'studio; it is removed once they hold none, unless it is their only designer- or admin-domain role '
  '(the designer portal admits on that domain). A new owner seat is not a sync event.';

REVOKE ALL ON FUNCTION public._sync_studio_owner_role(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.sync_studio_owner_role_from_seat()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  -- UPDATE and DELETE only: a new owner seat is not a sync event (banner).
  -- The helper re-derives from current state, so one call per affected user.
  IF OLD.role = 'owner' THEN
    PERFORM public._sync_studio_owner_role(OLD.user_id);
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.role = 'owner'
     AND (OLD.role <> 'owner' OR NEW.user_id IS DISTINCT FROM OLD.user_id) THEN
    PERFORM public._sync_studio_owner_role(NEW.user_id);
  END IF;
  RETURN NULL;
END;
$$;

COMMENT ON FUNCTION public.sync_studio_owner_role_from_seat() IS
  'Deferred constraint trigger on organization_members (00713): at commit, re-derives '
  'user_roles.studio_owner for the users on an existing row that moved into or out of an owner seat '
  '(update or delete; a new owner seat is not a sync event).';

REVOKE ALL ON FUNCTION public.sync_studio_owner_role_from_seat() FROM PUBLIC, anon, authenticated;

-- Deferred to commit: a transaction that moves an owner seat and then grants
-- studio_owner itself with a plain INSERT (admin flows, SQL test fixtures)
-- would otherwise hit user_roles' unique key, and
-- mid-transaction role changes would move project studio derivation
-- (set_project_studio_id reads has_designer_domain_role) under the caller.
DROP TRIGGER IF EXISTS sync_studio_owner_role_from_seat ON public.organization_members;
CREATE CONSTRAINT TRIGGER sync_studio_owner_role_from_seat
  AFTER DELETE OR UPDATE OF role, status, user_id, organization_id
  ON public.organization_members
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION public.sync_studio_owner_role_from_seat();

-- Backfill: current owners. Grants only.
INSERT INTO public.user_roles (user_id, role_id)
SELECT DISTINCT membership.user_id, role.id
FROM public.organization_members AS membership
JOIN public.organizations AS org ON org.id = membership.organization_id
JOIN public.profiles AS profile ON profile.id = membership.user_id
JOIN public.roles AS role ON role.name = 'studio_owner'
WHERE membership.role = 'owner'
  AND membership.status = 'active'
  AND org.type = 'design_studio'
ON CONFLICT (user_id, role_id) DO NOTHING;
