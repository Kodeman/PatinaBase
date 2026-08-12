-- ══════════════════════════════════════════════════════════════════════════════════════
-- 00465 — Stage-2 approval notification and reminder traceability
--
-- Stage-2 client-addressed notices resolve the immutable authority snapshot,
-- never the mutable designer/client relationship. Reminder delivery may be
-- stamped by the scheduled Edge worker only through one exact, service-only
-- RPC; direct service-role table updates remain blocked by the 00463 guard.
-- Communication renderers consume the immutable artifact fields carried by
-- project_approval_artifacts. Notifications remain non-authoritative and never
-- confirm review or apply an outcome.
-- ═════════════════════════════════════════════════════════════════════════════════════════

-- Preserve the installed 00399 notification state machine while changing
-- only the recipient authority for Stage-2 client-addressed notices.
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
    DO UPDATE SET user_id = EXCLUDED.user_id
    RETURNING id INTO v_notification_id;
  END IF;

  RETURN v_notification_id;
END;
$$;

REVOKE ALL ON FUNCTION public._enqueue_decision_notification(
  uuid, public.decision_notification_kind
) FROM PUBLIC, anon, authenticated, service_role;

-- Correct already-created Stage-2 client notices without exposing or changing
-- review evidence. Resolved notices remain designer-addressed.
UPDATE public.decision_notifications AS notification
SET user_id = snapshot.decision_lead_id,
    updated_at = now()
FROM public.client_decisions AS decision
JOIN public.project_decision_authority_snapshots AS snapshot
  ON snapshot.decision_id = decision.id
 AND snapshot.project_id = decision.project_id
JOIN public.project_approval_artifacts AS artifact
  ON artifact.decision_id = decision.id
 AND artifact.project_id = decision.project_id
WHERE notification.decision_id = decision.id
  AND decision.approval_contract = 'project_artifact_v1'
  AND notification.kind IN (
    'decision_required', 'decision_overdue', 'decision_updated'
  )
  AND notification.user_id IS DISTINCT FROM snapshot.decision_lead_id;

-- Preserve the installed public signature and manual studio reminder behavior.
-- Stage-2 metadata cites only immutable client-safe artifact evidence.
CREATE OR REPLACE FUNCTION public.stamp_client_decision_reminder(
  p_decision_id uuid
)
RETURNS public.client_decisions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_decision public.client_decisions%ROWTYPE;
  v_client_id uuid;
  v_artifact public.project_approval_artifacts%ROWTYPE;
  v_metadata jsonb;
  v_previous_parent_write text := current_setting(
    'app.project_approval_decision_write_id', true
  );
  v_previous_legacy_write text := current_setting(
    'app.client_decision_write_id', true
  );
BEGIN
  SELECT * INTO v_decision
  FROM public.client_decisions
  WHERE id = p_decision_id
  FOR UPDATE;
  IF NOT FOUND OR NOT public._can_author_proposal(v_decision.designer_id) THEN
    RAISE EXCEPTION 'decision % not found or access denied', p_decision_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF v_decision.status <> 'pending' THEN
    RAISE EXCEPTION 'only pending decisions may be reminded'
      USING ERRCODE = 'check_violation';
  END IF;
  IF v_decision.reminder_sent_at IS NOT NULL
     AND v_decision.reminder_sent_at > now() - interval '1 hour'
  THEN
    RAISE EXCEPTION 'a reminder was sent less than one hour ago'
      USING ERRCODE = 'check_violation';
  END IF;

  IF v_decision.approval_contract = 'project_artifact_v1' THEN
    SELECT snapshot.decision_lead_id INTO v_client_id
    FROM public.project_decision_authority_snapshots AS snapshot
    WHERE snapshot.decision_id = v_decision.id
      AND snapshot.project_id = v_decision.project_id;
    SELECT artifact.* INTO v_artifact
    FROM public.project_approval_artifacts AS artifact
    WHERE artifact.decision_id = v_decision.id
      AND artifact.project_id = v_decision.project_id;
    IF v_client_id IS NULL OR v_artifact.id IS NULL THEN
      RAISE EXCEPTION
        'Stage-2 reminder requires coherent frozen authority and artifact'
        USING ERRCODE = 'check_violation';
    END IF;
  ELSE
    SELECT relationship.client_id INTO v_client_id
    FROM public.designer_clients AS relationship
    WHERE relationship.id = v_decision.designer_client_id;
  END IF;
  IF v_client_id IS NULL THEN
    RAISE EXCEPTION 'decision has no registered client reminder recipient'
      USING ERRCODE = 'check_violation';
  END IF;

  v_metadata := jsonb_build_object(
    'decision_id', p_decision_id,
    'subject', 'Decision reminder',
    'preview', v_decision.title,
    'deep_link', '/decisions/' || p_decision_id::text
  );
  IF v_decision.approval_contract = 'project_artifact_v1' THEN
    v_metadata := v_metadata || jsonb_build_object(
      'artifactKind', v_artifact.source_kind,
      'artifactVersion', v_artifact.source_version,
      'artifactChecksum', v_artifact.artifact_hash,
      'artifactTitle', v_artifact.artifact_title
    );
  END IF;

  INSERT INTO public.notification_log (
    user_id, type, channel, status, template_id, metadata, sent_at
  ) VALUES (
    v_client_id,
    'decision_reminder',
    'in_app',
    'delivered',
    CASE WHEN v_decision.approval_contract = 'project_artifact_v1'
      THEN 'decision_reminder_v2' ELSE 'decision_reminder_v1' END,
    v_metadata,
    now()
  );

  PERFORM set_config(
    'app.client_decision_write_id', p_decision_id::text, true
  );
  IF v_decision.approval_contract = 'project_artifact_v1' THEN
    PERFORM set_config(
      'app.project_approval_decision_write_id', p_decision_id::text, true
    );
  END IF;
  UPDATE public.client_decisions
  SET reminder_sent_at = now(), updated_at = now()
  WHERE id = p_decision_id
  RETURNING * INTO v_decision;
  PERFORM set_config(
    'app.project_approval_decision_write_id',
    COALESCE(v_previous_parent_write, ''), true
  );
  PERFORM set_config(
    'app.client_decision_write_id',
    COALESCE(v_previous_legacy_write, ''), true
  );
  RETURN v_decision;
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config(
    'app.project_approval_decision_write_id',
    COALESCE(v_previous_parent_write, ''), true
  );
  PERFORM set_config(
    'app.client_decision_write_id',
    COALESCE(v_previous_legacy_write, ''), true
  );
  RAISE;
END;
$$;

REVOKE ALL ON FUNCTION public.stamp_client_decision_reminder(uuid)
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.stamp_client_decision_reminder(uuid)
  TO authenticated;

-- Scheduled Stage-2 reminder delivery stamp. It is intentionally not a send
-- or review-confirmation primitive: it records only that the shipped worker's
-- existing delivery path handled this exact frozen lead.
CREATE OR REPLACE FUNCTION public.stamp_project_approval_reminder_delivery(
  p_decision_id uuid,
  p_decision_lead_id uuid
)
RETURNS public.client_decisions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_decision public.client_decisions%ROWTYPE;
  v_frozen_lead_id uuid;
  v_artifact_id uuid;
  v_previous_parent_write text := current_setting(
    'app.project_approval_decision_write_id', true
  );
  v_previous_legacy_write text := current_setting(
    'app.client_decision_write_id', true
  );
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role'
     OR auth.uid() IS NOT NULL
  THEN
    RAISE EXCEPTION 'Stage-2 reminder delivery stamp is service-role only'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT decision.* INTO v_decision
  FROM public.client_decisions AS decision
  WHERE decision.id = p_decision_id
  FOR UPDATE;
  IF NOT FOUND
     OR v_decision.approval_contract IS DISTINCT FROM 'project_artifact_v1'
     OR v_decision.status IS DISTINCT FROM 'pending'
  THEN
    RAISE EXCEPTION 'pending Stage-2 decision not found'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT snapshot.decision_lead_id, artifact.id
  INTO v_frozen_lead_id, v_artifact_id
  FROM public.project_decision_authority_snapshots AS snapshot
  JOIN public.project_approval_artifacts AS artifact
    ON artifact.decision_id = snapshot.decision_id
   AND artifact.project_id = snapshot.project_id
  WHERE snapshot.decision_id = v_decision.id
    AND snapshot.project_id = v_decision.project_id;
  IF NOT FOUND
     OR v_frozen_lead_id IS DISTINCT FROM p_decision_lead_id
     OR v_artifact_id IS NULL
  THEN
    RAISE EXCEPTION
      'reminder delivery recipient does not match frozen Stage-2 evidence'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF v_decision.reminder_sent_at IS NULL THEN
    PERFORM set_config(
      'app.client_decision_write_id', p_decision_id::text, true
    );
    PERFORM set_config(
      'app.project_approval_decision_write_id', p_decision_id::text, true
    );
    UPDATE public.client_decisions
    SET reminder_sent_at = now(), updated_at = now()
    WHERE id = p_decision_id
    RETURNING * INTO v_decision;
  END IF;

  PERFORM set_config(
    'app.project_approval_decision_write_id',
    COALESCE(v_previous_parent_write, ''), true
  );
  PERFORM set_config(
    'app.client_decision_write_id',
    COALESCE(v_previous_legacy_write, ''), true
  );
  RETURN v_decision;
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config(
    'app.project_approval_decision_write_id',
    COALESCE(v_previous_parent_write, ''), true
  );
  PERFORM set_config(
    'app.client_decision_write_id',
    COALESCE(v_previous_legacy_write, ''), true
  );
  RAISE;
END;
$$;

REVOKE ALL ON FUNCTION public.stamp_project_approval_reminder_delivery(
  uuid, uuid
) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.stamp_project_approval_reminder_delivery(
  uuid, uuid
) TO service_role;

COMMENT ON FUNCTION public.stamp_project_approval_reminder_delivery(uuid, uuid)
IS 'Service-only post-delivery stamp for one pending Stage-2 request and its '
   'exact frozen decision lead. It does not send, confirm review, or respond.';

-- Add the non-identifying revision required by confirm_project_decision_review
-- to the installed sanitized projection. All reviewer identities remain private.
CREATE OR REPLACE FUNCTION public.get_project_decision_reviews(
  p_project_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_project public.projects%ROWTYPE;
  v_is_studio boolean := false;
  v_result jsonb;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'project decision reviews require an authenticated actor'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO v_project
  FROM public.projects AS project
  WHERE project.id = p_project_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'project decision reviews not found or access denied'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  v_is_studio := public.is_design_studio_comember(v_project.designer_id);
  IF NOT v_is_studio
     AND NOT EXISTS (
       SELECT 1
       FROM public.project_decision_authority_snapshots AS snapshot
       WHERE snapshot.project_id = p_project_id
         AND snapshot.decision_lead_id = v_actor
     )
  THEN
    RAISE EXCEPTION 'project decision reviews not found or access denied'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT COALESCE(jsonb_agg(review.item ORDER BY review.created_at, review.id),
                  '[]'::jsonb)
  INTO v_result
  FROM (
    SELECT decision.id,
           decision.created_at,
           jsonb_build_object(
             'decisionId', decision.id,
             'projectId', decision.project_id,
             'phaseId', decision.phase_id,
             'sectionKey', decision.section_key,
             'authorityRevision', snapshot.authority_revision,
             'artifactKind', artifact.source_kind,
             'artifactId', artifact.source_id,
             'artifactVersion', artifact.source_version,
             'artifactChecksum', artifact.artifact_hash,
             'artifactTitle', artifact.artifact_title,
             'question', artifact.question,
             'context', artifact.context,
             'dueAt', artifact.due_at,
             'costCentsDelta', artifact.cost_cents_delta,
             'scheduleDaysDelta', artifact.schedule_days_delta,
             'leadTimeDaysDelta', artifact.lead_time_days_delta,
             'lifecycleStatus', decision.status,
             'outcome', selected.approval_outcome,
             'disposition', CASE
               WHEN superseded.successor_decision_id IS NOT NULL THEN 'superseded'
               WHEN withdrawn.id IS NOT NULL THEN 'withdrawn'
               ELSE 'active'
             END,
             'isOverdue',
               decision.status = 'pending'
               AND decision.due_date IS NOT NULL
               AND decision.due_date < now(),
             'completedReviewCount', COALESCE(review_counts.completed_count, 0),
             'requiredReviewCount',
               1 + CASE WHEN snapshot.required_coapprover_id IS NULL THEN 0 ELSE 1 END,
             'predecessorDecisionId', decision.predecessor_decision_id,
             'successorDecisionId', superseded.successor_decision_id,
             'createdAt', decision.created_at,
             'sentAt', decision.sent_at,
             'respondedAt', decision.responded_at,
             'updatedAt', decision.updated_at
           ) AS item
    FROM public.client_decisions AS decision
    JOIN public.project_decision_authority_snapshots AS snapshot
      ON snapshot.decision_id = decision.id
     AND snapshot.project_id = decision.project_id
    JOIN public.project_approval_artifacts AS artifact
      ON artifact.decision_id = decision.id
     AND artifact.project_id = decision.project_id
    LEFT JOIN LATERAL (
      SELECT option.approval_outcome
      FROM public.client_decision_options AS option
      WHERE option.decision_id = decision.id
        AND option.selected
      ORDER BY option.id
      LIMIT 1
    ) AS selected ON true
    LEFT JOIN LATERAL (
      SELECT receipt.id, receipt.successor_decision_id
      FROM public.project_approval_action_receipts AS receipt
      WHERE receipt.decision_id = decision.id
        AND receipt.project_id = decision.project_id
        AND receipt.action_kind = 'superseded'
      ORDER BY receipt.created_at, receipt.id
      LIMIT 1
    ) AS superseded ON true
    LEFT JOIN LATERAL (
      SELECT receipt.id
      FROM public.project_approval_action_receipts AS receipt
      WHERE receipt.decision_id = decision.id
        AND receipt.project_id = decision.project_id
        AND receipt.action_kind = 'withdrawn'
      ORDER BY receipt.created_at, receipt.id
      LIMIT 1
    ) AS withdrawn ON true
    LEFT JOIN LATERAL (
      SELECT count(*)::integer AS completed_count
      FROM public.project_decision_review_confirmations AS confirmation
      WHERE confirmation.decision_id = decision.id
        AND confirmation.project_id = decision.project_id
        AND confirmation.authority_revision = snapshot.authority_revision
        AND confirmation.artifact_hash = artifact.artifact_hash
        AND (
          (
            confirmation.approver_role = 'lead'
            AND confirmation.approver_id = snapshot.decision_lead_id
          )
          OR (
            confirmation.approver_role = 'coapprover'
            AND snapshot.required_coapprover_id IS NOT NULL
            AND confirmation.approver_id
                  IS NOT DISTINCT FROM snapshot.required_coapprover_id
          )
        )
    ) AS review_counts ON true
    WHERE decision.project_id = p_project_id
      AND decision.approval_contract = 'project_artifact_v1'
      AND (v_is_studio OR snapshot.decision_lead_id = v_actor)
  ) AS review;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.get_project_decision_reviews(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_project_decision_reviews(uuid)
  TO authenticated;

COMMENT ON FUNCTION public.get_project_decision_reviews(uuid) IS
  'Sanitized Stage-2 project approval list for studio authors or each exact '
  'frozen decision lead. Returns authority revision, immutable artifact/version/'
  'hash/question, explicit impacts, lifecycle/outcome/disposition, aggregate '
  'review counts, lineage, overdue metadata, and timestamps without reviewer '
  'identities.';

-- Preserve every legacy transition while admitting draft -> expired only for
-- the checked Stage-2 withdrawal RPC. The dedicated transaction-local
-- capability is decision-scoped and still requires the postgres-owned writer;
-- caller-set GUCs under authenticated/service roles cannot widen the edge.
CREATE OR REPLACE FUNCTION public.guard_decision_status_transition()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;

  IF OLD.status = 'draft'
     AND NEW.status = 'expired'
     AND OLD.approval_contract = 'project_artifact_v1'
     AND current_user = 'postgres'
     AND current_setting(
       'app.project_approval_withdraw_decision_id', true
     ) = OLD.id::text
  THEN
    RETURN NEW;
  END IF;

  IF NOT (
       (OLD.status = 'draft'     AND NEW.status = 'pending')
    OR (OLD.status = 'pending'   AND NEW.status IN ('responded', 'expired'))
    OR (OLD.status = 'responded' AND NEW.status = 'pending')
    OR (OLD.status = 'expired'   AND NEW.status = 'pending')
  ) THEN
    RAISE EXCEPTION
      'Invalid decision status transition: % -> % (decision %)',
      OLD.status, NEW.status, OLD.id
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_decision_status_transition()
  FROM PUBLIC, anon, authenticated, service_role;

COMMENT ON FUNCTION public.guard_decision_status_transition() IS
  'BEFORE UPDATE guard on client_decisions. Allows draft->pending, '
  'pending->responded|expired, responded->pending, expired->pending, plus '
  'one exact postgres-owned, decision-scoped Stage-2 draft->expired '
  'withdrawal. Rejects every other status change with a check_violation '
  'exception. No-op updates (status unchanged) always pass.';

-- A mistaken, unpublished request is still an immutable Stage-2 aggregate.
-- Give the studio the same evidenced withdrawal disposition as a pending leaf
-- instead of reopening generic UPDATE/DELETE authority.
CREATE OR REPLACE FUNCTION public.withdraw_project_approval_decision(
  p_decision_id uuid,
  p_expected_updated_at timestamptz,
  p_reason text,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_decision public.client_decisions%ROWTYPE;
  v_receipt public.project_approval_action_receipts%ROWTYPE;
  v_reason text := btrim(COALESCE(p_reason, ''));
  v_key text := btrim(COALESCE(p_idempotency_key, ''));
  v_request_hash text;
  v_result jsonb;
  v_receipt_id uuid := extensions.gen_random_uuid();
  v_previous_parent_write text := current_setting(
    'app.project_approval_decision_write_id', true
  );
  v_previous_legacy_write text := current_setting(
    'app.client_decision_write_id', true
  );
  v_previous_evidence_write text := current_setting(
    'app.project_approval_evidence_decision_id', true
  );
  v_previous_withdraw_write text := current_setting(
    'app.project_approval_withdraw_decision_id', true
  );
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'project approval withdrawal requires an authenticated studio actor'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_expected_updated_at IS NULL THEN
    RAISE EXCEPTION 'p_expected_updated_at is required'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;
  IF char_length(v_reason) NOT BETWEEN 1 AND 500 THEN
    RAISE EXCEPTION 'withdrawal reason must contain 1 to 500 characters'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;
  IF v_key = '' OR char_length(v_key) > 200 THEN
    RAISE EXCEPTION 'idempotency key must contain 1 to 200 characters'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  SELECT * INTO v_decision
  FROM public.client_decisions AS decision
  WHERE decision.id = p_decision_id
    AND decision.approval_contract = 'project_artifact_v1'
  FOR UPDATE;
  IF NOT FOUND OR NOT public._can_author_proposal(v_decision.designer_id) THEN
    RAISE EXCEPTION 'project approval not found or withdrawal denied'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  v_request_hash := public._project_approval_hash(jsonb_build_object(
    'decisionId', p_decision_id,
    'expectedUpdatedAt', p_expected_updated_at,
    'reason', v_reason
  ));
  SELECT * INTO v_receipt
  FROM public.project_approval_action_receipts AS receipt
  WHERE receipt.decision_id = p_decision_id
    AND receipt.action_kind = 'withdrawn'
    AND receipt.idempotency_key = v_key
  FOR UPDATE;
  IF FOUND THEN
    IF v_receipt.request_hash IS DISTINCT FROM v_request_hash
       OR v_receipt.actor_id IS DISTINCT FROM v_actor
    THEN
      RAISE EXCEPTION 'idempotency key was reused with a different withdrawal'
        USING ERRCODE = 'unique_violation';
    END IF;
    RETURN v_receipt.result || jsonb_build_object('idempotent', true);
  END IF;

  IF v_decision.updated_at IS DISTINCT FROM p_expected_updated_at THEN
    RAISE EXCEPTION 'project approval decision changed since it was loaded'
      USING ERRCODE = 'serialization_failure';
  END IF;
  IF v_decision.status NOT IN ('draft', 'pending') THEN
    RAISE EXCEPTION 'only draft or pending Stage-2 decisions may be withdrawn'
      USING ERRCODE = 'check_violation';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.client_decisions AS successor
    WHERE successor.predecessor_decision_id = p_decision_id
  ) THEN
    RAISE EXCEPTION 'only a current Stage-2 leaf may be withdrawn'
      USING ERRCODE = 'check_violation';
  END IF;

  PERFORM set_config(
    'app.project_approval_decision_write_id', p_decision_id::text, true
  );
  PERFORM set_config(
    'app.client_decision_write_id', p_decision_id::text, true
  );
  PERFORM set_config(
    'app.project_approval_withdraw_decision_id', p_decision_id::text, true
  );
  UPDATE public.client_decisions
  SET status = 'expired', updated_at = now()
  WHERE id = p_decision_id
  RETURNING * INTO v_decision;

  v_result := jsonb_build_object(
    'receiptId', v_receipt_id,
    'projectId', v_decision.project_id,
    'decisionId', v_decision.id,
    'status', v_decision.status,
    'disposition', 'withdrawn',
    'reason', v_reason,
    'updatedAt', v_decision.updated_at
  );
  PERFORM set_config(
    'app.project_approval_evidence_decision_id', p_decision_id::text, true
  );
  INSERT INTO public.project_approval_action_receipts (
    id, project_id, decision_id, action_kind, idempotency_key,
    request_hash, actor_id, result
  ) VALUES (
    v_receipt_id, v_decision.project_id, p_decision_id, 'withdrawn', v_key,
    v_request_hash, v_actor, v_result
  );

  PERFORM set_config(
    'app.project_approval_decision_write_id',
    COALESCE(v_previous_parent_write, ''), true
  );
  PERFORM set_config(
    'app.client_decision_write_id', COALESCE(v_previous_legacy_write, ''), true
  );
  PERFORM set_config(
    'app.project_approval_evidence_decision_id',
    COALESCE(v_previous_evidence_write, ''), true
  );
  PERFORM set_config(
    'app.project_approval_withdraw_decision_id',
    COALESCE(v_previous_withdraw_write, ''), true
  );
  RETURN v_result || jsonb_build_object('idempotent', false);
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config(
    'app.project_approval_decision_write_id',
    COALESCE(v_previous_parent_write, ''), true
  );
  PERFORM set_config(
    'app.client_decision_write_id', COALESCE(v_previous_legacy_write, ''), true
  );
  PERFORM set_config(
    'app.project_approval_evidence_decision_id',
    COALESCE(v_previous_evidence_write, ''), true
  );
  PERFORM set_config(
    'app.project_approval_withdraw_decision_id',
    COALESCE(v_previous_withdraw_write, ''), true
  );
  RAISE;
END;
$$;

REVOKE ALL ON FUNCTION public.withdraw_project_approval_decision(
  uuid, timestamptz, text, text
) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.withdraw_project_approval_decision(
  uuid, timestamptz, text, text
) TO authenticated;

-- Studio composer source picker. This exposes only the immutable identity and
-- integrity fields needed to create a request; the private resolver remains the
-- final source-of-truth check inside create_project_approval_decision.
CREATE OR REPLACE FUNCTION public.get_project_approval_artifact_candidates(
  p_project_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_project public.projects%ROWTYPE;
  v_result jsonb;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'artifact candidates require an authenticated studio actor'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT * INTO v_project
  FROM public.projects AS project
  WHERE project.id = p_project_id;
  IF NOT FOUND OR NOT public.is_design_studio_comember(v_project.designer_id) THEN
    RAISE EXCEPTION 'project artifact candidates not found or access denied'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'artifactKind', candidate.source_kind,
        'artifactId', candidate.source_id,
        'artifactVersion', resolved.source_version,
        'artifactChecksum', resolved.artifact_hash,
        'artifactTitle', resolved.artifact_title,
        'issuedAt', candidate.issued_at,
        'publishedAt', candidate.published_at
      )
      ORDER BY candidate.source_timestamp DESC,
               candidate.source_kind,
               resolved.source_version DESC,
               candidate.source_id
    ),
    '[]'::jsonb
  ) INTO v_result
  FROM (
    SELECT
      'plan_issue'::text AS source_kind,
      issue.id AS source_id,
      issue.issued_at,
      NULL::timestamptz AS published_at,
      issue.issued_at AS source_timestamp
    FROM public.plan_issues AS issue
    WHERE issue.project_id = p_project_id

    UNION ALL

    SELECT
      'spec_book_artifact'::text,
      artifact.id,
      revision.issued_at,
      NULL::timestamptz,
      revision.issued_at
    FROM public.spec_book_artifacts AS artifact
    JOIN public.spec_book_revisions AS revision
      ON revision.id = artifact.revision_id
    JOIN public.spec_books AS book ON book.id = revision.spec_book_id
    JOIN public.project_documents AS document
      ON document.id = artifact.project_document_id
    WHERE book.project_id = p_project_id
      AND revision.status = 'issued'
      AND revision.issued_at IS NOT NULL
      AND artifact.audience = 'client'
      AND artifact.format = 'pdf'
      AND artifact.status = 'ready'
      AND artifact.checksum_sha256 IS NOT NULL
      AND artifact.rendered_at IS NOT NULL
      AND document.project_id = p_project_id
      AND document.status = 'ready'
      AND document.storage_path IS NOT DISTINCT FROM artifact.storage_path

    UNION ALL

    SELECT
      'budget_version'::text,
      budget.id,
      NULL::timestamptz,
      checkpoint.published_at,
      checkpoint.published_at
    FROM public.project_budget_versions AS budget
    JOIN public.project_budget_checkpoints AS checkpoint
      ON checkpoint.project_id = budget.project_id
     AND checkpoint.budget_version_id = budget.id
    WHERE budget.project_id = p_project_id
      AND budget.status = 'published'
      AND budget.published_at IS NOT NULL
      AND checkpoint.snapshot_fingerprint IS NOT DISTINCT FROM
          public._budget_version_fingerprint(budget.id)
  ) AS candidate
  CROSS JOIN LATERAL public._resolve_project_approval_artifact(
    p_project_id, candidate.source_kind, candidate.source_id
  ) AS resolved;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.get_project_approval_artifact_candidates(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_project_approval_artifact_candidates(uuid)
  TO authenticated;

COMMENT ON FUNCTION public.get_project_approval_artifact_candidates(uuid) IS
  'Studio-only client-safe candidate list for immutable Stage-2 plan, spec-book, '
  'and budget artifacts. Returns source identity/version/checksum/title and safe '
  'issued/published timestamps without URLs, snapshots, or internal fields.';
