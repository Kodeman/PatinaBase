-- =====================================================================================
-- 00441 — Project contextual handoff read model
--
-- One designer-studio-only projection unifies active Stage-2 approval responsibility
-- and Field Site Request responsibility. It is deliberately read-only and redacted:
-- immutable/frozen evidence informs semantic routing, while actor ids, reviewer ids,
-- contact details, raw snapshots, payloads, storage paths, and access tokens stay private.
-- =====================================================================================

CREATE OR REPLACE FUNCTION public.get_project_contextual_handoffs(
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
  v_result jsonb;
BEGIN
  -- Existence-safe for every authenticated non-studio actor. The ACL is also
  -- explicit so anonymous and service callers have no direct PostgREST rail.
  IF v_actor IS NULL OR NOT EXISTS (
    SELECT 1
    FROM public.projects AS project
    WHERE project.id = p_project_id
      AND public.is_design_studio_comember(project.designer_id)
  ) THEN
    RETURN '[]'::jsonb;
  END IF;

  WITH approval_rows AS (
    SELECT
      decision.id AS source_id,
      decision.project_id,
      decision.phase_id,
      phase.canonical_stage_key,
      phase.workflow_track,
      CASE
        WHEN decision.status = 'draft'
             AND confirmations.completed_count < confirmations.required_count
          THEN 'review_required'
        WHEN decision.status = 'draft'
          THEN 'ready_to_publish'
        WHEN decision.status = 'pending'
          THEN 'response_required'
        ELSE selected.approval_outcome
      END AS source_state,
      CASE
        WHEN decision.status = 'draft'
             AND confirmations.completed_count < confirmations.required_count
          THEN 'confirm_artifact_review'
        WHEN decision.status = 'draft'
          THEN 'publish_confirmed_approval'
        WHEN decision.status = 'pending'
          THEN 'select_approval_outcome'
        WHEN selected.approval_outcome = 'changes_requested'
          THEN 'revise_and_resubmit'
        ELSE 'resolve_client_discussion'
      END AS expected_response,
      CASE
        WHEN decision.status = 'draft'
             AND confirmations.completed_count < confirmations.required_count
          THEN 'open_approval_review'
        WHEN decision.status = 'draft'
          THEN 'publish_approval_request'
        WHEN decision.status = 'pending'
          THEN 'open_approval_response'
        WHEN selected.approval_outcome = 'changes_requested'
          THEN 'supersede_approval_request'
        ELSE 'open_approval_discussion'
      END AS action_kind,
      CASE
        WHEN decision.status = 'pending'
          OR (
            decision.status = 'draft'
            AND confirmations.completed_count < confirmations.required_count
          )
          THEN 'studio'
        ELSE 'client'
      END AS sender,
      CASE
        WHEN decision.status = 'pending'
          OR (
            decision.status = 'draft'
            AND confirmations.completed_count < confirmations.required_count
          )
          THEN 'client'
        ELSE 'studio'
      END AS recipient,
      CASE
        WHEN decision.status = 'pending'
          OR (
            decision.status = 'draft'
            AND confirmations.completed_count < confirmations.required_count
          )
          THEN 'client'
        ELSE 'studio'
      END
        AS current_owner,
      artifact.due_at,
      COALESCE(
        decision.status = 'pending' AND artifact.due_at < now(), false
      ) AS is_overdue,
      jsonb_build_object(
        'kind', artifact.source_kind,
        'version', artifact.source_version,
        'checksum', artifact.artifact_hash,
        'title', artifact.artifact_title
      ) AS artifact,
      decision.updated_at
    FROM public.client_decisions AS decision
    JOIN public.project_decision_authority_snapshots AS authority
      ON authority.decision_id = decision.id
     AND authority.project_id = decision.project_id
    JOIN public.project_approval_artifacts AS artifact
      ON artifact.decision_id = decision.id
     AND artifact.project_id = decision.project_id
     AND artifact.phase_id = decision.phase_id
     AND artifact.due_at IS NOT DISTINCT FROM decision.due_date
    JOIN public.project_phases AS phase
      ON phase.id = decision.phase_id
     AND phase.project_id = decision.project_id
    JOIN LATERAL (
      SELECT
        count(*)::integer AS total_count,
        count(*) FILTER (
          WHERE option.approval_outcome IN (
            'approved', 'changes_requested', 'needs_discussion'
          )
            AND option.cost_cents_delta = artifact.cost_cents_delta
            AND option.schedule_days_delta = artifact.schedule_days_delta
            AND option.lead_time_days_delta = artifact.lead_time_days_delta
            AND option.approves IS NOT DISTINCT FROM
                (option.approval_outcome = 'approved')
        )::integer AS canonical_count,
        count(*) FILTER (WHERE option.selected)::integer AS selected_count
      FROM public.client_decision_options AS option
      WHERE option.decision_id = decision.id
    ) AS option_counts ON true
    LEFT JOIN LATERAL (
      SELECT option.id, option.approval_outcome
      FROM public.client_decision_options AS option
      WHERE option.decision_id = decision.id
        AND option.selected
      ORDER BY option.id
      LIMIT 1
    ) AS selected ON true
    JOIN LATERAL (
      SELECT
        count(*) FILTER (
          WHERE confirmation.authority_revision = authority.authority_revision
            AND confirmation.artifact_hash = artifact.artifact_hash
            AND (
              (
                confirmation.approver_role = 'lead'
                AND confirmation.approver_id = authority.decision_lead_id
              )
              OR (
                confirmation.approver_role = 'coapprover'
                AND authority.required_coapprover_id IS NOT NULL
                AND confirmation.approver_id = authority.required_coapprover_id
              )
            )
        )::integer AS completed_count,
        (1 + CASE WHEN authority.required_coapprover_id IS NULL
                  THEN 0 ELSE 1 END)::integer AS required_count
      FROM public.project_decision_review_confirmations AS confirmation
      WHERE confirmation.decision_id = decision.id
        AND confirmation.project_id = decision.project_id
    ) AS confirmations ON true
    JOIN LATERAL (
      SELECT count(*)::integer AS receipt_count
      FROM public.project_approval_action_receipts AS receipt
      WHERE receipt.decision_id = decision.id
        AND receipt.project_id = decision.project_id
        AND receipt.action_kind = 'created'
        AND receipt.actor_id IS NOT NULL
    ) AS created_receipt ON created_receipt.receipt_count = 1
    JOIN LATERAL (
      SELECT count(*)::integer AS receipt_count
      FROM public.project_approval_action_receipts AS receipt
      WHERE receipt.decision_id = decision.id
        AND receipt.project_id = decision.project_id
        AND receipt.action_kind = 'published'
        AND receipt.successor_decision_id IS NULL
    ) AS published_receipt ON true
    LEFT JOIN LATERAL (
      SELECT count(*)::integer AS receipt_count
      FROM public.project_approval_action_receipts AS receipt
      WHERE receipt.decision_id = decision.id
        AND receipt.project_id = decision.project_id
        AND receipt.action_kind = 'responded'
        AND receipt.successor_decision_id IS NULL
        AND receipt.actor_id = authority.decision_lead_id
        AND receipt.result->>'decisionId' = decision.id::text
        AND receipt.result->>'projectId' = decision.project_id::text
        AND receipt.result->>'optionId' = selected.id::text
        AND receipt.result->>'outcome' = selected.approval_outcome
    ) AS response_receipt ON true
    WHERE decision.project_id = p_project_id
      AND decision.approval_contract = 'project_artifact_v1'
      AND decision.status IN ('draft', 'pending', 'responded')
      AND option_counts.total_count = 3
      AND option_counts.canonical_count = 3
      AND (
        (
          decision.status = 'draft'
          AND option_counts.selected_count = 0
          AND published_receipt.receipt_count = 0
        )
        OR (
          decision.status = 'pending'
          AND option_counts.selected_count = 0
          AND published_receipt.receipt_count = 1
          AND confirmations.completed_count = confirmations.required_count
        )
        OR (
          decision.status = 'responded'
          AND option_counts.selected_count = 1
          AND published_receipt.receipt_count = 1
          AND selected.approval_outcome IN (
            'changes_requested', 'needs_discussion'
          )
          AND response_receipt.receipt_count = 1
        )
      )
      AND NOT EXISTS (
        SELECT 1
        FROM public.project_approval_action_receipts AS terminal_receipt
        WHERE terminal_receipt.decision_id = decision.id
          AND terminal_receipt.project_id = decision.project_id
          AND terminal_receipt.action_kind IN ('withdrawn', 'superseded')
      )
  ),
  site_rows AS (
    SELECT
      request.id AS source_id,
      request.project_id,
      request.status AS source_state,
      CASE request.status
        WHEN 'sent' THEN 'acknowledge_and_begin'
        WHEN 'in_progress' THEN 'deliver_current_item_versions'
        WHEN 'delivered' THEN 'review_delivered_items'
        ELSE 'close_completed_request'
      END AS expected_response,
      CASE request.status
        WHEN 'sent' THEN 'open_site_request'
        WHEN 'in_progress' THEN 'continue_site_request'
        WHEN 'delivered' THEN 'review_site_request'
        ELSE 'close_site_request'
      END AS action_kind,
      CASE WHEN request.status IN ('sent', 'in_progress')
           THEN 'site_party' ELSE 'studio' END AS current_owner,
      CASE WHEN request.status IN ('sent', 'in_progress')
           THEN 'studio' ELSE 'site_party' END AS sender,
      CASE WHEN request.status IN ('sent', 'in_progress')
           THEN 'site_party' ELSE 'studio' END AS recipient,
      request.assignee_name_snapshot,
      request.due_at,
      COALESCE(
        request.status IN ('sent', 'in_progress', 'delivered')
          AND request.due_at < now(), false
      ) AS is_overdue,
      jsonb_build_object(
        'nudgeSent', request.last_nudged_at IS NOT NULL,
        'dueReminderSent', request.due_reminder_sent_at IS NOT NULL
      ) AS escalation,
      jsonb_build_object(
        'kind', 'site_request_item_set',
        'dueContext', request.due_context,
        'itemCount', item_evidence.item_count,
        'items', item_evidence.items
      ) AS artifact,
      request.updated_at
    FROM public.site_requests AS request
    JOIN public.project_parties AS party
      ON party.id = request.assignee_party_id
     AND party.project_id = request.project_id
    JOIN LATERAL (
      SELECT
        count(item.id)::integer AS item_count,
        COALESCE(
          jsonb_agg(
            jsonb_build_object(
              'title', version.title,
              'kitCode', version.kit_code,
              'version', version.version_number,
              'status', item.status,
              'hasDeliveredEvidence', EXISTS (
                SELECT 1
                FROM public.site_deliverables AS deliverable
                WHERE deliverable.request_id = request.id
                  AND deliverable.item_id = item.id
                  AND deliverable.item_version_id = version.id
                  AND deliverable.status = 'delivered'
              ),
              'hasApprovedEvidence', EXISTS (
                SELECT 1
                FROM public.site_binder_entries AS binder
                WHERE binder.project_id = request.project_id
                  AND binder.request_id = request.id
                  AND binder.item_id = item.id
                  AND binder.item_version_id = version.id
              )
            ) ORDER BY item.sort_order, item.id
          ) FILTER (WHERE item.id IS NOT NULL),
          '[]'::jsonb
        ) AS items
      FROM public.site_request_items AS item
      JOIN public.site_request_item_versions AS version
        ON version.id = item.current_version_id
       AND version.item_id = item.id
       AND version.version_number = item.current_version_number
      WHERE item.request_id = request.id
    ) AS item_evidence ON true
    WHERE request.project_id = p_project_id
      AND request.status IN ('sent', 'in_progress', 'delivered', 'completed')
      AND request.created_by IS NOT NULL
  ),
  handoffs AS (
    SELECT
      approval.source_id,
      approval.due_at,
      'project_approval'::text AS source_kind,
      jsonb_build_object(
        'sourceKind', 'project_approval',
        'sourceId', approval.source_id,
        'projectId', approval.project_id,
        'phaseId', approval.phase_id,
        'canonicalStageKey', approval.canonical_stage_key,
        'workflowTrack', approval.workflow_track,
        'stageAttribution', 'exact_project_phase',
        'sourceState', approval.source_state,
        'responsibility', jsonb_build_object(
          'sender', jsonb_build_object('kind', approval.sender),
          'recipient', jsonb_build_object(
            'kind', approval.recipient, 'label', NULL
          ),
          'currentOwner', jsonb_build_object('kind', approval.current_owner)
        ),
        'expectedResponse', approval.expected_response,
        'dueAt', approval.due_at,
        'isOverdue', approval.is_overdue,
        'escalation', NULL,
        'artifact', approval.artifact,
        'actionKind', approval.action_kind,
        'updatedAt', approval.updated_at
      ) AS item
    FROM approval_rows AS approval

    UNION ALL

    SELECT
      site.source_id,
      site.due_at,
      'site_request'::text AS source_kind,
      jsonb_build_object(
        'sourceKind', 'site_request',
        'sourceId', site.source_id,
        'projectId', site.project_id,
        'phaseId', NULL,
        'canonicalStageKey', 'contract_administration',
        'workflowTrack', NULL,
        'stageAttribution', 'source_domain',
        'sourceState', site.source_state,
        'responsibility', jsonb_build_object(
          'sender', jsonb_build_object(
            'kind', site.sender,
            'label', CASE WHEN site.sender = 'site_party'
                          THEN site.assignee_name_snapshot ELSE NULL END
          ),
          'recipient', jsonb_build_object(
            'kind', site.recipient,
            'label', CASE WHEN site.recipient = 'site_party'
                          THEN site.assignee_name_snapshot ELSE NULL END
          ),
          'currentOwner', jsonb_build_object('kind', site.current_owner)
        ),
        'expectedResponse', site.expected_response,
        'dueAt', site.due_at,
        'isOverdue', site.is_overdue,
        'escalation', site.escalation,
        'artifact', site.artifact,
        'actionKind', site.action_kind,
        'updatedAt', site.updated_at
      ) AS item
    FROM site_rows AS site
  )
  SELECT COALESCE(
    jsonb_agg(handoff.item ORDER BY handoff.due_at, handoff.source_kind,
                                      handoff.source_id),
    '[]'::jsonb
  )
  INTO v_result
  FROM handoffs AS handoff;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.get_project_contextual_handoffs(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_project_contextual_handoffs(uuid)
  TO authenticated;

COMMENT ON FUNCTION public.get_project_contextual_handoffs(uuid) IS
  'Read-only, redacted responsibility handoffs for exact studio-authored '
  'Stage-2 approvals and active Field Site Requests. Returns [] when the '
  'authenticated actor lacks exact project studio authority.';
