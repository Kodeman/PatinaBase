-- =====================================================================================
-- 00466 — Stage-2 approval notification requeue and delivery reconciliation
--
-- Service re-enqueue rearms an idempotent decision notification for unread /
-- digest delivery while preserving its stable identity. Authenticated studio
-- compatibility calls retain the existing read/timestamp state. Edge delivery
-- reconciliation remains evidence-bound through 00465's checked service RPC.
-- =====================================================================================

CREATE OR REPLACE FUNCTION public._enqueue_decision_notification(
  p_decision_id uuid,
  p_kind public.decision_notification_kind
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_decision public.client_decisions%ROWTYPE;
  v_client_id uuid;
  v_recipient_id uuid;
  v_notification_id uuid;
  -- auth.role() reads the CALLER's JWT, not the definer, so the re-arm is
  -- deliberately asymmetric: a service_role requeue (cron) clears read state
  -- and restamps, while an interactive designer republish leaves the
  -- recipient's read_at intact.
  v_rearm_existing boolean := COALESCE(auth.role(), '') = 'service_role';
BEGIN
  SELECT decision.*
  INTO v_decision
  FROM public.client_decisions AS decision
  WHERE decision.id = p_decision_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'decision % not found', p_decision_id
      USING ERRCODE = 'no_data_found';
  END IF;

  IF v_decision.approval_contract = 'project_artifact_v1' THEN
    SELECT snapshot.decision_lead_id
    INTO v_client_id
    FROM public.project_decision_authority_snapshots AS snapshot
    JOIN public.project_approval_artifacts AS artifact
      ON artifact.decision_id = snapshot.decision_id
     AND artifact.project_id = snapshot.project_id
    WHERE snapshot.decision_id = v_decision.id
      AND snapshot.project_id = v_decision.project_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION
        'Stage-2 notification requires coherent frozen authority and artifact'
        USING ERRCODE = 'check_violation';
    END IF;
  ELSE
    SELECT relationship.client_id INTO v_client_id
    FROM public.designer_clients AS relationship
    WHERE relationship.id = v_decision.designer_client_id;
  END IF;

  IF p_kind IN ('decision_required', 'decision_updated') THEN
    IF v_decision.status <> 'pending' THEN
      RAISE EXCEPTION '% requires a pending decision', p_kind
        USING ERRCODE = 'check_violation';
    END IF;
    v_recipient_id := v_client_id;
  ELSIF p_kind = 'decision_overdue' THEN
    IF v_decision.status <> 'pending'
       OR v_decision.due_date IS NULL
       OR v_decision.due_date >= now()
    THEN
      RAISE EXCEPTION 'decision_overdue requires an overdue pending decision'
        USING ERRCODE = 'check_violation';
    END IF;
    v_recipient_id := v_client_id;
  ELSIF p_kind = 'decision_resolved' THEN
    IF v_decision.status <> 'responded' THEN
      RAISE EXCEPTION 'decision_resolved requires a responded decision'
        USING ERRCODE = 'check_violation';
    END IF;
    v_recipient_id := v_decision.designer_id;
  ELSE
    RAISE EXCEPTION 'unsupported decision notification kind %', p_kind
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  IF v_recipient_id IS NULL THEN
    RAISE EXCEPTION 'decision % has no notification recipient', p_decision_id
      USING ERRCODE = 'check_violation';
  END IF;

  IF p_kind = 'decision_updated' THEN
    INSERT INTO public.decision_notifications (user_id, decision_id, kind)
    VALUES (v_recipient_id, p_decision_id, p_kind)
    RETURNING id INTO v_notification_id;
  ELSE
    INSERT INTO public.decision_notifications (user_id, decision_id, kind)
    VALUES (v_recipient_id, p_decision_id, p_kind)
    ON CONFLICT (decision_id, kind)
      WHERE kind <> 'decision_updated'
    DO UPDATE
    SET user_id = EXCLUDED.user_id,
        read_at = CASE WHEN v_rearm_existing
          THEN NULL ELSE decision_notifications.read_at END,
        created_at = CASE WHEN v_rearm_existing
          THEN EXCLUDED.created_at ELSE decision_notifications.created_at END,
        updated_at = CASE WHEN v_rearm_existing
          THEN EXCLUDED.updated_at ELSE decision_notifications.updated_at END
    RETURNING id INTO v_notification_id;
  END IF;

  RETURN v_notification_id;
END;
$$;

REVOKE ALL ON FUNCTION public._enqueue_decision_notification(
  uuid, public.decision_notification_kind
) FROM PUBLIC, anon, authenticated, service_role;
