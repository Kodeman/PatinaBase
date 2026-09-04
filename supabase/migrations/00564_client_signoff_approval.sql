-- ═══════════════════════════════════════════════════════════════════════════
-- 00564 — a client-court sign-off is a decision the client can actually make
--
-- Lineage: apply_client_decision 00413 → 00464 → (this, alongside).
-- Nothing in 00464 is replaced. This adds the one act it has no shape for.
--
-- THE DEFECT (First Flight finding W1-B-03, promoted out of W1's walk B).
-- The seeded client's overdue decision reads, on glass:
--
--   "Design Development sign-off — drawing set B"
--   badge Approval · Overdue Aug 30
--   "Drawing set B needs your sign-off before Procurement can release the
--    long-lead casegoods"
--
-- and offers "Not yet", "Neither of these" and "Discuss this with your
-- designer" — none of which resolve it — at both text sizes (walk B shots 56,
-- 80, 20, 21). The sibling Product decision renders two option cards with
-- "Choose this" (58), because the screen drew its primary action from the
-- option list and this row has no options.
--
-- The surface half closed on the W1 tip (`a9cb4ceb4`): the screen now says
-- "There is nothing to choose here yet — your designer has not added the
-- options." What stayed open is the product gap the walker named — a round-one
-- tester cannot unblock Procurement — and it is a backend gap, not a screen
-- one. Measured on the local stack:
--
--   id b0000000-…-00000005c301
--   status pending | decision_type approval
--   coordination_kind signoff | court client | approval_contract ␀
--
-- `apply_client_decision` takes `p_selected_option_id`, and for a row whose
-- `approval_contract` is null it raises `insufficient_privilege` unless
-- `coordination_kind = 'selection'`. Below it, `_apply_client_decision_
-- authorized` raises `check_violation` when the option does not belong to the
-- decision. There is no argument list that resolves an option-less sign-off:
-- the act does not exist, so the screen was right to draw nothing.
--
-- THE FIX, and its exact blast radius.
-- One new function, beside the existing one rather than inside it, because the
-- two acts have different shapes: choosing takes an option and feeds the choice
-- through to FF&E specs and dual pricing; approving takes nothing but consent.
-- Sharing an entry point would mean a nullable `p_selected_option_id` on the
-- canonical selection RPC, and a null there is currently a `check_violation` —
-- a fail-closed answer that is worth keeping exactly as it is.
--
-- `approve_client_signoff` accepts a decision only when ALL of:
--   · the caller is authenticated and is `designer_clients.client_id` for the
--     decision's relationship — the same authority test as the neighbour;
--   · `approval_contract IS NULL` — a Stage-2 artifact decision keeps its own
--     path through `_respond_project_approval_checked` and is refused here;
--   · `coordination_kind = 'signoff'` AND `court = 'client'`;
--   · the decision carries NO options — a decision with options is answered by
--     choosing one, and two ways to resolve the same row is how a client and a
--     designer end up reading different answers;
--   · `status = 'pending'`, or `status = 'responded'` for a replay by the same
--     actor, which returns the terminal row.
--
-- A `selection` row, a `designer`-court row, a Stage-2 artifact row, a row with
-- options, a stranger, and an anonymous caller are each refused, and no
-- existing path changes behaviour.
--
-- What the approval does is the tail of `_apply_client_decision_authorized`
-- minus everything about options: `status='responded'`, `responded_at`,
-- `selected_by`, the 00117 consent columns, the `project_ffe_items` unblock
-- keyed on `blocked_by_decision_id`, and `_enqueue_decision_notification(…,
-- 'decision_resolved')` so the designer hears about it the same way. The
-- write is bracketed by `app.client_decision_write_id`, which is what
-- `guard_client_decision_authority` (00399) requires of any protected change —
-- SECURITY DEFINER makes `current_user` postgres, and the capability names the
-- row.
--
-- Grants mirror `apply_client_decision`: REVOKE from PUBLIC/anon/service_role,
-- GRANT EXECUTE to authenticated. service_role is deliberately excluded — the
-- function reads `auth.uid()` and would resolve nobody.
--
-- Test: supabase/tests/rls/00564_client_signoff_approval.test.sql
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.approve_client_signoff(
  p_decision_id uuid,
  p_client_consent_method text DEFAULT NULL,
  p_client_signature text DEFAULT NULL
)
RETURNS public.client_decisions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_client_id uuid;
  v_decision public.client_decisions%ROWTYPE;
  v_requested_signature text := NULLIF(
    btrim(COALESCE(p_client_signature, '')), ''
  );
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'approve_client_signoff requires an authenticated user'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT decision.* INTO v_decision
  FROM public.client_decisions AS decision
  WHERE decision.id = p_decision_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'decision % not found', p_decision_id
      USING ERRCODE = 'no_data_found';
  END IF;

  SELECT relationship.client_id INTO v_client_id
  FROM public.designer_clients AS relationship
  WHERE relationship.id = v_decision.designer_client_id
  FOR SHARE;

  IF v_client_id IS DISTINCT FROM v_actor THEN
    RAISE EXCEPTION 'only the addressed client may approve this decision'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Stage-2 artifact decisions carry frozen authority and an evidence receipt;
  -- they are answered through `apply_client_decision`'s artifact branch and
  -- never here.
  IF v_decision.approval_contract IS NOT NULL THEN
    RAISE EXCEPTION
      'an approval-contract decision is answered through its own path'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF v_decision.coordination_kind IS DISTINCT FROM 'signoff'
     OR v_decision.court IS DISTINCT FROM 'client'
  THEN
    RAISE EXCEPTION
      'only client-court sign-off decisions may be approved by the addressed client'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- A decision with options is answered by choosing one. Two ways to resolve
  -- one row is how a client and a designer come to read different answers.
  IF EXISTS (
    SELECT 1
    FROM public.client_decision_options AS option
    WHERE option.decision_id = p_decision_id
  ) THEN
    RAISE EXCEPTION
      'decision % carries options and is resolved by selecting one', p_decision_id
      USING ERRCODE = 'check_violation';
  END IF;

  IF p_client_consent_method IS NOT NULL
     AND p_client_consent_method NOT IN ('electronic_signature', 'click_through')
  THEN
    RAISE EXCEPTION 'invalid client consent method %', p_client_consent_method
      USING ERRCODE = 'check_violation';
  END IF;
  IF p_client_consent_method = 'electronic_signature'
     AND char_length(COALESCE(v_requested_signature, '')) < 2
  THEN
    RAISE EXCEPTION 'an electronic signature of at least 2 characters is required'
      USING ERRCODE = 'check_violation';
  END IF;

  -- Deterministic replay: the same client approving twice reads the same
  -- terminal row; anybody else's resolution is a stale conflict.
  IF v_decision.status = 'responded' THEN
    IF v_decision.selected_by IS DISTINCT FROM v_actor THEN
      RAISE EXCEPTION 'decision % was already resolved by another actor',
        p_decision_id
        USING ERRCODE = 'serialization_failure';
    END IF;
    PERFORM public._enqueue_decision_notification(
      p_decision_id, 'decision_resolved'
    );
    RETURN v_decision;
  END IF;

  IF v_decision.status <> 'pending' THEN
    RAISE EXCEPTION 'decision % cannot be approved from status %',
      p_decision_id, v_decision.status
      USING ERRCODE = 'check_violation';
  END IF;

  PERFORM set_config('app.client_decision_write_id', p_decision_id::text, true);

  UPDATE public.client_decisions
  SET status = 'responded',
      responded_at = now(),
      selected_by = v_actor,
      client_consent_method = p_client_consent_method,
      client_signature = CASE WHEN p_client_consent_method IS NULL
        THEN NULL ELSE v_requested_signature END,
      client_consented_at = CASE WHEN p_client_consent_method IS NULL
        THEN NULL ELSE now() END,
      updated_at = now()
  WHERE id = p_decision_id
  RETURNING * INTO v_decision;

  -- The whole point of the row: Procurement is waiting on it.
  UPDATE public.project_ffe_items
  SET blocked = false,
      blocked_reason = NULL,
      blocked_by_decision_id = NULL,
      last_status_change_at = now(),
      updated_at = now()
  WHERE blocked_by_decision_id = p_decision_id
    AND project_id = v_decision.project_id;

  PERFORM set_config('app.client_decision_write_id', '', true);
  PERFORM public._enqueue_decision_notification(
    p_decision_id, 'decision_resolved'
  );
  RETURN v_decision;
END;
$$;

REVOKE ALL ON FUNCTION public.approve_client_signoff(uuid, text, text)
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.approve_client_signoff(uuid, text, text)
  TO authenticated;

COMMENT ON FUNCTION public.approve_client_signoff(uuid, text, text) IS
  'W1-B-03: the addressed client approves a client-court, option-less sign-off '
  'decision, unblocking the FF&E items gated on it. Choosing between options '
  'stays apply_client_decision''s; this is the act that had no shape.';
