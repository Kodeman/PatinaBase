-- ═══════════════════════════════════════════════════════════════════════════
-- 00832 — Platform ownership transfer takes target/current owners in seat order
--         (SQ-1147 F3 only, SQ-1400)
-- Lineage: 00556 admin_transfer_studio_ownership; ordered-seat pattern: 00800.
--
-- K8 and other seat readers take SHARE locks in (user_id, id) order. Locking
-- the target first can hold a higher seat while waiting for a lower owner
-- held by a reader, completing the seat/seat cycle. Prelock the target and
-- every active owner in the readers' order before promotion or demotion.
--
-- The 00556 body is otherwise unchanged: authorization, organization lock,
-- refusals, promote/demote and multi-owner repair stay intact. F1 org/seat
-- and F2 role/seat ordering remain outside this repair. CREATE OR REPLACE
-- preserves signature, owner, ACLs and comment; no grants or seed changes.
-- Role synchronization remains in the existing deferred trigger, and the
-- admin route still owns its audit log.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

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

  -- Match the seat readers' (user_id, id) order before touching the target
  -- or any active owner, including all co-owners on the repair path.
  PERFORM 1
  FROM public.organization_members AS membership
  WHERE membership.organization_id = p_org_id
    AND (membership.user_id = p_new_owner
      OR (membership.status = 'active' AND membership.role = 'owner'))
  ORDER BY membership.user_id, membership.id
  FOR UPDATE;

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

COMMIT;
