-- ═══════════════════════════════════════════════════════════════════════════
-- 00800 — US-36: transfer_studio_ownership locks both seats in user_id order
--         (SQ-1086 F6, SQ-1087)
--
-- Number reserved in the US-36 execution contract (00796–00805). One redefined
-- function body (latest: 00484); signature, refusals, error texts, owner,
-- SECURITY DEFINER, search_path and grants are unchanged. CREATE OR REPLACE
-- keeps the ACL, so there is no GRANT/REVOKE here and the grants seed does not
-- move.
--
-- Seat readers lock both seats they judge, FOR SHARE, in ascending
-- (user_id, id) order: 00563's project studio trigger, set_document_client
-- (00796) and _k8_rate_row_refusal (00797). The 00484 body locked the target's
-- seat first and the outgoing owner's seat only at the demote. When the owner
-- held the lower user_id, a reader holding her seat and waiting for the
-- target's could wait on a transfer holding the target's seat and waiting for
-- hers: 40P01. Now, after the same organization lock and checks, both seats
-- are taken FOR UPDATE in one statement in that same order, before the
-- promotion or the demotion writes either one.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

CREATE OR REPLACE FUNCTION public.transfer_studio_ownership(
  p_org_id uuid,
  p_new_owner uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_target_member_id uuid;
  v_affected_rows integer;
BEGIN
  PERFORM 1
  FROM public.organizations AS organization
  WHERE organization.id = p_org_id
  FOR UPDATE;

  IF NOT FOUND OR NOT public.is_org_owner(p_org_id, v_actor) THEN
    RAISE EXCEPTION 'not_owner';
  END IF;

  IF p_new_owner IS NOT DISTINCT FROM v_actor THEN
    RAISE EXCEPTION 'target_not_active_member';
  END IF;

  -- The seat readers' order (00563, 00796, 00797), before either seat is
  -- written.
  PERFORM 1
  FROM public.organization_members AS membership
  WHERE membership.organization_id = p_org_id
    AND membership.user_id = ANY(ARRAY[v_actor, p_new_owner]::uuid[])
  ORDER BY membership.user_id, membership.id
  FOR UPDATE;

  SELECT membership.id
  INTO v_target_member_id
    FROM public.organization_members AS membership
    WHERE membership.organization_id = p_org_id
      AND membership.user_id = p_new_owner
      AND membership.status = 'active'
    FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'target_not_active_member';
  END IF;

  UPDATE public.organization_members
  SET role = 'owner',
      updated_at = now()
  WHERE id = v_target_member_id
    AND organization_id = p_org_id
    AND user_id = p_new_owner
    AND status = 'active';

  GET DIAGNOSTICS v_affected_rows = ROW_COUNT;
  IF v_affected_rows <> 1 OR NOT EXISTS (
    SELECT 1
    FROM public.organization_members AS membership
    WHERE membership.id = v_target_member_id
      AND membership.organization_id = p_org_id
      AND membership.user_id = p_new_owner
      AND membership.role = 'owner'
      AND membership.status = 'active'
  ) THEN
    RAISE EXCEPTION 'target_not_active_member';
  END IF;

  UPDATE public.organization_members
  SET role = 'admin',
      updated_at = now()
  WHERE organization_id = p_org_id
    AND user_id = v_actor
    AND status = 'active'
    AND role = 'owner';

  GET DIAGNOSTICS v_affected_rows = ROW_COUNT;
  IF v_affected_rows <> 1 THEN
    RAISE EXCEPTION 'not_owner';
  END IF;
END;
$$;

COMMENT ON FUNCTION public.transfer_studio_ownership(uuid, uuid) IS
  'Owner-only serialized ownership transfer. Locks the organization, then both seats in ascending user_id order (the seat readers'' order), verifies a one-row promotion of the exact active target membership, then demotes auth.uid().';

COMMIT;
