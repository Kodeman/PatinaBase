-- ============================================================================
-- Migration 00085: Decision feed-through RPC
--
-- When a client selects a decision option, propagate the result:
--   • Mark the decision as 'responded' with selected_option_id + responded_at
--   • For 'substitution' decisions: update the affected ffe_item with the
--     option's product/price/notes and clear blocked_by_decision_id
--   • For 'approval' decisions: clear blocked_by_decision_id on items
--     that referenced this decision
--   • Always: stamp last_status_change_at on touched FF&E rows so the
--     activity feed picks up the change
-- ============================================================================

CREATE OR REPLACE FUNCTION apply_decision(
  p_decision_id UUID,
  p_selected_option_id UUID,
  p_selected_by UUID DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_decision RECORD;
  v_option RECORD;
BEGIN
  SELECT * INTO v_decision
  FROM client_decisions
  WHERE id = p_decision_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Decision % not found', p_decision_id;
  END IF;

  IF v_decision.status NOT IN ('pending', 'open', 'draft') THEN
    RAISE EXCEPTION 'Decision % already in status %', p_decision_id, v_decision.status;
  END IF;

  SELECT * INTO v_option
  FROM client_decision_options
  WHERE id = p_selected_option_id AND decision_id = p_decision_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Option % does not belong to decision %', p_selected_option_id, p_decision_id;
  END IF;

  -- 1. Mark decision responded
  UPDATE client_decisions
  SET status = 'responded',
      responded_at = NOW(),
      selected_by = COALESCE(p_selected_by, auth.uid()),
      updated_at = NOW()
  WHERE id = p_decision_id;

  -- 2. Mark the chosen option as selected (others as not)
  UPDATE client_decision_options
  SET selected = (id = p_selected_option_id)
  WHERE decision_id = p_decision_id;

  -- 3. Clear blocked status on FF&E items that referenced this decision
  UPDATE project_ffe_items
  SET blocked = false,
      blocked_reason = NULL,
      blocked_by_decision_id = NULL,
      last_status_change_at = NOW(),
      updated_at = NOW()
  WHERE blocked_by_decision_id = p_decision_id
    AND project_id = v_decision.project_id;
END;
$$;

GRANT EXECUTE ON FUNCTION apply_decision(UUID, UUID, UUID) TO authenticated;
