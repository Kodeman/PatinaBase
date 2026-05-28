-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 00160: set_nomination_status (admin RPC)
--
-- Patina-admin entry point for driving nominations through the state
-- machine. The trigger from migration 00158 is the validator —
-- this function authorizes the caller, records who made the change,
-- and writes the status. The trigger's auto-stamps + the
-- vendors.nomination_status denormalization run as part of the same
-- transaction.
--
-- SECURITY DEFINER + manual super_admin check so the admin tool can
-- write through `authenticated` JWTs without depending on table-level
-- INSERT/UPDATE policies being permissive.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

CREATE OR REPLACE FUNCTION set_nomination_status(
  p_nomination_id          UUID,
  p_to_status              TEXT,
  p_decline_reason         TEXT DEFAULT NULL,
  p_patina_outreach_summary TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor   UUID := auth.uid();
  v_row     vendor_nominations%ROWTYPE;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'set_nomination_status: unauthenticated';
  END IF;

  IF NOT user_has_role(v_actor, 'super_admin') THEN
    RAISE EXCEPTION 'set_nomination_status: super_admin only';
  END IF;

  SELECT * INTO v_row FROM vendor_nominations WHERE id = p_nomination_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'set_nomination_status: nomination % not found', p_nomination_id;
  END IF;

  -- The state-machine trigger enforces transition legality. We just
  -- write the new state + the optional context fields. The trigger
  -- fills status_updated_at + status_updated_by when blank, but we
  -- set them explicitly here so the admin tool is the recorded actor.
  UPDATE vendor_nominations
     SET status                   = p_to_status,
         status_updated_at        = NOW(),
         status_updated_by        = v_actor,
         decline_reason           = COALESCE(p_decline_reason, decline_reason),
         patina_outreach_summary  = COALESCE(p_patina_outreach_summary, patina_outreach_summary)
   WHERE id = p_nomination_id;

  RETURN p_nomination_id;
END;
$$;

REVOKE ALL    ON FUNCTION set_nomination_status FROM PUBLIC;
GRANT EXECUTE ON FUNCTION set_nomination_status TO authenticated;

COMMENT ON FUNCTION set_nomination_status IS
  'Admin-only entry point for driving vendor_nominations through the state machine. Super_admin-gated; the state-machine trigger from 00158 validates transition legality.';

COMMIT;
