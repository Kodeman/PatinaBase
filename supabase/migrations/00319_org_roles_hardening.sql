-- ═══════════════════════════════════════════════════════════════════════════
-- 00319 — Organization roles hardening (last-owner guard + ownership transfer)
--
-- Two gaps today:
--   1. Last-owner protection is UI-only (00295 "Members can leave" has no DB
--      guard) → the last owner can leave a studio ownerless.
--   2. The 00068/00021 "Org admins can update members" policy has NO WITH CHECK
--      → any admin can UPDATE a member row to any role: self-promote to owner or
--      demote the real owner (privilege escalation).
--
-- Close both with one BEFORE UPDATE OR DELETE trigger on organization_members
-- (INSERT stays governed by the existing insert policies + provisioning). Add a
-- transfer_studio_ownership RPC so the last owner still has a clean exit path.
--
-- service_role BYPASS: edge functions (workspace-member-invite) and provisioning
-- run as service_role and must not trip the guard. accept/decline invitation run
-- as the authenticated invitee but never mutate owner rows, so they pass anyway.
--
-- Adds function re-grants → regenerate seed/00-legacy-grants.sql after this file.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── Guard trigger ───────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.guard_org_membership_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor     uuid := auth.uid();
  v_remaining int;
BEGIN
  -- Edge functions / provisioning run as service_role → bypass entirely.
  IF (auth.jwt() ->> 'role') = 'service_role' THEN
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;

  -- Demoting or removing an existing ACTIVE owner.
  IF OLD.role = 'owner' AND OLD.status = 'active'
     AND (TG_OP = 'DELETE' OR NEW.role <> 'owner' OR NEW.status <> 'active') THEN
    SELECT count(*) INTO v_remaining
    FROM organization_members
    WHERE organization_id = OLD.organization_id
      AND role = 'owner'
      AND status = 'active'
      AND id <> OLD.id;
    IF v_remaining = 0 THEN
      RAISE EXCEPTION 'last_owner_protected';
    END IF;
    IF NOT public.is_org_owner(OLD.organization_id, v_actor) THEN
      RAISE EXCEPTION 'owner_change_requires_owner';
    END IF;
  END IF;

  -- Promoting a non-owner to owner requires the actor to be an owner.
  IF TG_OP = 'UPDATE' AND NEW.role = 'owner' AND OLD.role <> 'owner'
     AND NOT public.is_org_owner(NEW.organization_id, v_actor) THEN
    RAISE EXCEPTION 'owner_promotion_requires_owner';
  END IF;

  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_org_membership_changes() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.guard_org_membership_changes() TO authenticated, service_role;

DROP TRIGGER IF EXISTS guard_org_membership_changes ON public.organization_members;
CREATE TRIGGER guard_org_membership_changes
  BEFORE UPDATE OR DELETE ON public.organization_members
  FOR EACH ROW EXECUTE FUNCTION public.guard_org_membership_changes();

COMMENT ON FUNCTION public.guard_org_membership_changes() IS
  'DB-side last-owner protection + owner-mutation authorization (closes the 00068 no-WITH-CHECK admin self-promotion). service_role bypasses so invite/provisioning still work.';

-- ─── transfer_studio_ownership(p_org_id, p_new_owner) ────────────────────────
-- Promote-then-demote ordering: the new owner satisfies the last-owner guard
-- before the caller demotes themselves, so the self-demotion never trips it.
CREATE OR REPLACE FUNCTION public.transfer_studio_ownership(
  p_org_id uuid,
  p_new_owner uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
BEGIN
  IF NOT public.is_org_owner(p_org_id, v_actor) THEN
    RAISE EXCEPTION 'not_owner';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM organization_members
    WHERE organization_id = p_org_id AND user_id = p_new_owner AND status = 'active'
  ) THEN
    RAISE EXCEPTION 'target_not_active_member';
  END IF;

  -- Promote target FIRST.
  UPDATE organization_members
  SET role = 'owner', updated_at = now()
  WHERE organization_id = p_org_id AND user_id = p_new_owner;

  -- Then demote self.
  UPDATE organization_members
  SET role = 'admin', updated_at = now()
  WHERE organization_id = p_org_id AND user_id = v_actor AND role = 'owner';
END;
$$;

REVOKE ALL ON FUNCTION public.transfer_studio_ownership(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.transfer_studio_ownership(uuid, uuid) TO authenticated;

COMMENT ON FUNCTION public.transfer_studio_ownership(uuid, uuid) IS
  'Owner-only: promote p_new_owner to owner then demote the caller to admin (promote-then-demote so the last-owner guard never trips). Lets the last owner exit cleanly.';
