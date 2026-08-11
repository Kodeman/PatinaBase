-- ═══════════════════════════════════════════════════════════════════════════
-- 00436 — Project approval lifecycle, compatibility, and phase authority
--
-- Stage-2 decisions retain the installed client_decisions wire vocabulary.
-- Immutable receipts carry withdraw/supersede dispositions, overdue remains a
-- derived condition, and every phase gate consumer shares one fail-closed
-- predicate. Legacy/proposal lifecycle branches are preserved from their
-- latest authoritative migrations.
--
-- Adds GRANT/REVOKE → regenerate seed/00-legacy-grants.sql.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.project_approval_action_receipts
  DROP CONSTRAINT IF EXISTS project_approval_receipts_successor_action_check,
  ADD CONSTRAINT project_approval_receipts_successor_action_check CHECK (
    (action_kind = 'superseded') = (successor_decision_id IS NOT NULL)
  );

-- One exact predicate is the authority for all phase-completion surfaces. A
-- malformed Stage-2 row blocks. Withdrawn/superseded history clears only when
-- its immutable receipt and successor lineage are coherent.
CREATE OR REPLACE FUNCTION public._client_decision_blocks_phase(
  p_decision public.client_decisions
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_artifact_count integer;
  v_snapshot_count integer;
  v_option_count integer;
  v_total_option_count integer;
  v_selected_count integer;
  v_selected_outcome text;
  v_selected_option_id uuid;
  v_response_count integer;
  v_coherent_response_count integer;
  v_withdraw_count integer;
  v_supersede_count integer;
  v_successor_count integer;
BEGIN
  IF p_decision.approval_contract IS DISTINCT FROM 'project_artifact_v1' THEN
    RETURN p_decision.status = 'pending'
      AND (
        p_decision.blocks_kind = 'phase'
        OR p_decision.blocking_status = 'blocks_phase'
      );
  END IF;

  IF p_decision.project_id IS NULL
     OR p_decision.phase_id IS NULL
     OR p_decision.linked_proposal_id IS NOT NULL
     OR p_decision.decision_type IS DISTINCT FROM 'approval'
     OR p_decision.decision_kind IS DISTINCT FROM 'approval'
     OR p_decision.coordination_kind IS DISTINCT FROM 'signoff'
     OR p_decision.court IS DISTINCT FROM 'client'
     OR p_decision.blocks_kind IS DISTINCT FROM 'phase'
     OR p_decision.blocking_status IS DISTINCT FROM 'blocks_phase'
  THEN
    RETURN true;
  END IF;

  SELECT count(*) INTO v_artifact_count
  FROM public.project_approval_artifacts AS artifact
  WHERE artifact.decision_id = p_decision.id
    AND artifact.project_id = p_decision.project_id
    AND artifact.phase_id = p_decision.phase_id
    AND artifact.due_at IS NOT DISTINCT FROM p_decision.due_date
    AND artifact.context IS NOT DISTINCT FROM p_decision.context;

  SELECT count(*) INTO v_snapshot_count
  FROM public.project_decision_authority_snapshots AS snapshot
  WHERE snapshot.decision_id = p_decision.id
    AND snapshot.project_id = p_decision.project_id;

  SELECT count(*) INTO v_total_option_count
  FROM public.client_decision_options AS option
  WHERE option.decision_id = p_decision.id;

  SELECT count(*),
         count(*) FILTER (WHERE option.selected),
         min(option.approval_outcome) FILTER (WHERE option.selected),
         (array_agg(option.id ORDER BY option.id)
           FILTER (WHERE option.selected))[1]
  INTO v_option_count, v_selected_count, v_selected_outcome,
       v_selected_option_id
  FROM public.client_decision_options AS option
  JOIN public.project_approval_artifacts AS artifact
    ON artifact.decision_id = option.decision_id
  WHERE option.decision_id = p_decision.id
    AND option.approval_outcome IN (
      'approved', 'changes_requested', 'needs_discussion'
    )
    AND option.cost_cents_delta IS NOT NULL
    AND option.schedule_days_delta IS NOT NULL
    AND option.lead_time_days_delta IS NOT NULL
    AND option.cost_cents_delta = artifact.cost_cents_delta
    AND option.schedule_days_delta = artifact.schedule_days_delta
    AND option.lead_time_days_delta = artifact.lead_time_days_delta
    AND option.approves IS NOT DISTINCT FROM
        (option.approval_outcome = 'approved');

  IF v_artifact_count <> 1
     OR v_snapshot_count <> 1
     OR v_total_option_count <> 3
     OR v_option_count <> 3
     OR EXISTS (
       SELECT 1
       FROM (
         VALUES ('approved'), ('changes_requested'), ('needs_discussion')
       ) AS required(outcome)
       WHERE NOT EXISTS (
         SELECT 1
         FROM public.client_decision_options AS option
         WHERE option.decision_id = p_decision.id
           AND option.approval_outcome = required.outcome
       )
     )
  THEN
    RETURN true;
  END IF;

  SELECT count(*) INTO v_withdraw_count
  FROM public.project_approval_action_receipts AS receipt
  WHERE receipt.decision_id = p_decision.id
    AND receipt.project_id = p_decision.project_id
    AND receipt.action_kind = 'withdrawn'
    AND receipt.successor_decision_id IS NULL;

  SELECT count(*) INTO v_response_count
  FROM public.project_approval_action_receipts AS receipt
  WHERE receipt.decision_id = p_decision.id
    AND receipt.project_id = p_decision.project_id
    AND receipt.action_kind = 'responded'
    AND receipt.successor_decision_id IS NULL;

  SELECT count(*) INTO v_coherent_response_count
  FROM public.project_approval_action_receipts AS receipt
  JOIN public.project_decision_authority_snapshots AS snapshot
    ON snapshot.decision_id = p_decision.id
   AND snapshot.project_id = p_decision.project_id
  WHERE receipt.decision_id = p_decision.id
    AND receipt.project_id = p_decision.project_id
    AND receipt.action_kind = 'responded'
    AND receipt.successor_decision_id IS NULL
    AND receipt.actor_id = snapshot.decision_lead_id
    AND receipt.result->>'decisionId' = p_decision.id::text
    AND receipt.result->>'projectId' = p_decision.project_id::text
    AND receipt.result->>'optionId' = v_selected_option_id::text
    AND receipt.result->>'outcome' = v_selected_outcome;

  SELECT count(*) INTO v_supersede_count
  FROM public.project_approval_action_receipts AS receipt
  JOIN public.client_decisions AS successor
    ON successor.id = receipt.successor_decision_id
   AND successor.project_id = p_decision.project_id
   AND successor.predecessor_decision_id = p_decision.id
   AND successor.approval_contract = 'project_artifact_v1'
   AND successor.phase_id IS NOT DISTINCT FROM p_decision.phase_id
   AND successor.section_key IS NOT DISTINCT FROM p_decision.section_key
   AND successor.blocks_kind = 'phase'
   AND successor.blocking_status = 'blocks_phase'
  WHERE receipt.decision_id = p_decision.id
    AND receipt.project_id = p_decision.project_id
    AND receipt.action_kind = 'superseded';

  SELECT count(*) INTO v_successor_count
  FROM public.client_decisions AS successor
  WHERE successor.predecessor_decision_id = p_decision.id
    AND successor.project_id = p_decision.project_id
    AND successor.approval_contract = 'project_artifact_v1';

  IF v_withdraw_count > 1
     OR v_supersede_count > 1
     OR v_response_count > 1
     OR v_coherent_response_count > 1
     OR (v_withdraw_count > 0 AND v_supersede_count > 0)
     OR v_successor_count <> v_supersede_count
  THEN
    RETURN true;
  END IF;

  IF v_withdraw_count = 1 THEN
    RETURN p_decision.status IS DISTINCT FROM 'expired';
  END IF;
  IF v_supersede_count = 1 THEN
    RETURN p_decision.status NOT IN ('expired', 'responded')
      OR (
        p_decision.status = 'responded'
        AND (
          v_response_count <> 1
          OR v_coherent_response_count <> 1
          OR v_selected_count <> 1
        )
      );
  END IF;

  IF p_decision.status IN ('draft', 'pending') THEN
    RETURN true;
  END IF;
  IF p_decision.status = 'responded' THEN
    RETURN v_response_count <> 1
      OR v_coherent_response_count <> 1
      OR v_selected_count <> 1
      OR v_selected_outcome IS DISTINCT FROM 'approved';
  END IF;

  RETURN true;
EXCEPTION
  -- Transient lock conflicts are retryable, not evidence of an unresolved
  -- blocker; laundering them into the fail-closed answer would surface a
  -- permanent-looking phase rejection. Every other failure still fails closed.
  WHEN serialization_failure OR deadlock_detected THEN
    RAISE;
  WHEN OTHERS THEN
    RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public._client_decision_blocks_phase(
  public.client_decisions
) FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.guard_client_decision_completed_phase_gate()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_phase_status text;
BEGIN
  -- Separate statements, not one OR expression: SQL does not guarantee OR
  -- short-circuits, so the combined form could reach the predicate with a
  -- NULL phase_id.
  IF NEW.phase_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NOT public._client_decision_blocks_phase(NEW) THEN
    RETURN NEW;
  END IF;

  SELECT phase.status INTO v_phase_status
  FROM public.project_phases AS phase
  WHERE phase.id = NEW.phase_id
  FOR UPDATE;

  IF v_phase_status = 'completed' THEN
    RAISE EXCEPTION
      'client_decisions cannot add an unresolved blocker to a completed phase'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_client_decision_completed_phase_gate()
  FROM PUBLIC, anon, authenticated, service_role;

-- Restate the Stage-2 table edges so a lifecycle capability cannot drift any
-- frozen request or option fields. Only lifecycle evidence on the parent and
-- the selected bit on canonical options can change after creation.
CREATE OR REPLACE FUNCTION public.guard_stage2_client_decision_edge()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_is_old_stage2 boolean := CASE
    WHEN TG_OP IN ('UPDATE', 'DELETE')
      THEN OLD.approval_contract IS NOT DISTINCT FROM 'project_artifact_v1'
    ELSE false
  END;
  v_is_new_stage2 boolean := CASE
    WHEN TG_OP IN ('INSERT', 'UPDATE')
      THEN NEW.approval_contract IS NOT DISTINCT FROM 'project_artifact_v1'
    ELSE false
  END;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF v_is_old_stage2 THEN
      RAISE EXCEPTION 'Stage-2 project approval decisions are immutable evidence'
        USING ERRCODE = 'check_violation';
    END IF;
    RETURN OLD;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NOT v_is_new_stage2 THEN
      IF NEW.predecessor_decision_id IS NOT NULL THEN
        RAISE EXCEPTION 'legacy decisions cannot carry Stage-2 lineage'
          USING ERRCODE = 'check_violation';
      END IF;
      RETURN NEW;
    END IF;

    IF current_user IS DISTINCT FROM 'postgres'
       OR current_setting(
            'app.project_approval_decision_insert_id', true
          ) IS DISTINCT FROM NEW.id::text
    THEN
      RAISE EXCEPTION 'Stage-2 decisions are inserted only by canonical authority'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF NEW.status <> 'draft'
       OR NEW.project_id IS NULL
       OR NEW.linked_proposal_id IS NOT NULL
       OR NEW.recommended_option_id IS NOT NULL
       OR NEW.sent_at IS NOT NULL
       OR NEW.responded_at IS NOT NULL
       OR NEW.selected_by IS NOT NULL
       OR NEW.client_consent_method IS NOT NULL
       OR NEW.client_consented_at IS NOT NULL
       OR NEW.client_signature IS NOT NULL
       OR NEW.answer IS NOT NULL
       OR NEW.answered_at IS NOT NULL
       OR NEW.answered_by IS NOT NULL
    THEN
      RAISE EXCEPTION 'new Stage-2 decisions must be unevidenced drafts'
        USING ERRCODE = 'check_violation';
    END IF;
    IF auth.uid() IS NULL
       OR NOT EXISTS (
         SELECT 1
         FROM public.projects AS project
         JOIN public.project_phases AS phase
           ON phase.id = NEW.phase_id
          AND phase.project_id = project.id
         JOIN public.designer_clients AS relationship
           ON relationship.id = NEW.designer_client_id
          AND relationship.designer_id = project.designer_id
          AND relationship.client_id = project.client_id
          AND relationship.status = 'active'
         WHERE project.id = NEW.project_id
           AND NEW.designer_id = project.designer_id
           AND public.is_design_studio_comember(project.designer_id)
       )
    THEN
      RAISE EXCEPTION 'Stage-2 project, phase, actor, and relationship are not coherent'
        USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.predecessor_decision_id IS NOT NULL
       AND NOT EXISTS (
         SELECT 1 FROM public.client_decisions AS predecessor
         WHERE predecessor.id = NEW.predecessor_decision_id
           AND predecessor.project_id = NEW.project_id
           AND predecessor.approval_contract = 'project_artifact_v1'
       )
    THEN
      RAISE EXCEPTION 'Stage-2 predecessor must belong to the same project'
        USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;

  IF v_is_old_stage2 OR v_is_new_stage2 THEN
    IF NOT (v_is_old_stage2 AND v_is_new_stage2)
       OR current_user IS DISTINCT FROM 'postgres'
       OR current_setting(
            'app.project_approval_decision_write_id', true
          ) IS DISTINCT FROM NEW.id::text
    THEN
      RAISE EXCEPTION 'Stage-2 decision changes require the Stage-2 lifecycle rail'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF (
      to_jsonb(NEW) - ARRAY[
        'status', 'sent_at', 'responded_at', 'selected_by',
        'client_consent_method', 'client_consented_at', 'client_signature',
        'answer', 'answered_at', 'answered_by', 'viewed_at',
        'reminder_sent_at', 'updated_at'
      ]
    ) IS DISTINCT FROM (
      to_jsonb(OLD) - ARRAY[
        'status', 'sent_at', 'responded_at', 'selected_by',
        'client_consent_method', 'client_consented_at', 'client_signature',
        'answer', 'answered_at', 'answered_by', 'viewed_at',
        'reminder_sent_at', 'updated_at'
      ]
    ) THEN
      RAISE EXCEPTION 'Stage-2 request identity and frozen question are immutable'
        USING ERRCODE = 'check_violation';
    END IF;
  ELSIF NEW.approval_contract IS NOT NULL
        OR NEW.predecessor_decision_id IS NOT NULL
  THEN
    RAISE EXCEPTION 'legacy decisions cannot be reclassified as Stage-2'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_stage2_client_decision_edge()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.guard_stage2_client_decision_option_edge()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_decision_id uuid := CASE WHEN TG_OP = 'DELETE' THEN OLD.decision_id
                             ELSE NEW.decision_id END;
  v_contract text;
BEGIN
  SELECT decision.approval_contract INTO v_contract
  FROM public.client_decisions AS decision
  WHERE decision.id = v_decision_id;

  IF v_contract IS DISTINCT FROM 'project_artifact_v1' THEN
    IF TG_OP <> 'DELETE'
       AND (
         NEW.approval_outcome IS NOT NULL
         OR NEW.cost_cents_delta IS NOT NULL
         OR NEW.schedule_days_delta IS NOT NULL
       )
    THEN
      RAISE EXCEPTION 'legacy decision options cannot carry Stage-2 evidence'
        USING ERRCODE = 'check_violation';
    END IF;
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Stage-2 canonical outcomes cannot be deleted'
      USING ERRCODE = 'check_violation';
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF current_user IS DISTINCT FROM 'postgres'
       OR current_setting(
            'app.project_approval_option_decision_id', true
          ) IS DISTINCT FROM NEW.decision_id::text
    THEN
      RAISE EXCEPTION 'Stage-2 outcomes are inserted only by canonical authority'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF NEW.approval_outcome NOT IN (
         'approved', 'changes_requested', 'needs_discussion'
       )
       OR NEW.cost_cents_delta IS NULL
       OR NEW.schedule_days_delta IS NULL
       OR NEW.lead_time_days_delta IS NULL
       OR NEW.approves IS DISTINCT FROM (NEW.approval_outcome = 'approved')
       OR COALESCE(NEW.selected, false)
       OR NEW.client_note IS NOT NULL
       OR NEW.quantity IS DISTINCT FROM 1
       OR NEW.image_url IS NOT NULL
       OR NEW.designer_note IS NOT NULL
       OR COALESCE(NEW.is_recommended, false)
       OR NEW.price IS NOT NULL
       OR NEW.product_id IS NOT NULL
       OR NEW.configuration_id IS NOT NULL
       OR NEW.selection_snapshot IS NOT NULL
       OR NEW.sort_order IS DISTINCT FROM (CASE NEW.approval_outcome
         WHEN 'approved' THEN 0
         WHEN 'changes_requested' THEN 1
         WHEN 'needs_discussion' THEN 2
       END)
    THEN
      RAISE EXCEPTION 'invalid canonical Stage-2 outcome evidence'
        USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;

  IF current_user IS DISTINCT FROM 'postgres'
     OR current_setting(
          'app.project_approval_decision_write_id', true
        ) IS DISTINCT FROM NEW.decision_id::text
  THEN
    RAISE EXCEPTION 'Stage-2 outcome changes require the Stage-2 lifecycle rail'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF (to_jsonb(NEW) - 'selected')
       IS DISTINCT FROM (to_jsonb(OLD) - 'selected')
     OR NEW.client_note IS NOT NULL
  THEN
    RAISE EXCEPTION 'Stage-2 outcome identity and impact evidence are immutable'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_stage2_client_decision_option_edge()
  FROM PUBLIC, anon, authenticated, service_role;

-- ── Canonical Stage-2 response rail ───────────────────────────────────────

CREATE OR REPLACE FUNCTION public._respond_project_approval_checked(
  p_decision_id uuid,
  p_outcome text,
  p_option_id uuid,
  p_expected_updated_at timestamptz,
  p_idempotency_key text,
  p_client_consent_method text,
  p_client_signature text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_decision public.client_decisions%ROWTYPE;
  v_snapshot public.project_decision_authority_snapshots%ROWTYPE;
  v_artifact public.project_approval_artifacts%ROWTYPE;
  v_option public.client_decision_options%ROWTYPE;
  v_receipt public.project_approval_action_receipts%ROWTYPE;
  v_outcome text := NULLIF(btrim(COALESCE(p_outcome, '')), '');
  v_key text := btrim(COALESCE(p_idempotency_key, ''));
  v_request jsonb;
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
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'project approval response requires an authenticated reviewer'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF (v_outcome IS NULL) = (p_option_id IS NULL) THEN
    RAISE EXCEPTION 'supply exactly one canonical outcome or option id'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;
  IF p_expected_updated_at IS NULL THEN
    RAISE EXCEPTION 'p_expected_updated_at is required'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;
  IF v_key = '' OR char_length(v_key) > 200 THEN
    RAISE EXCEPTION 'idempotency key must contain 1 to 200 characters'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;
  IF p_client_consent_method IS NOT NULL
     AND p_client_consent_method NOT IN (
       'electronic_signature', 'click_through'
     )
  THEN
    RAISE EXCEPTION 'invalid client consent method %', p_client_consent_method
      USING ERRCODE = 'check_violation';
  END IF;
  IF p_client_consent_method = 'electronic_signature'
     AND char_length(btrim(COALESCE(p_client_signature, ''))) < 2
  THEN
    RAISE EXCEPTION 'an electronic signature of at least 2 characters is required'
      USING ERRCODE = 'check_violation';
  END IF;
  IF p_client_consent_method IS NULL
     AND NULLIF(btrim(COALESCE(p_client_signature, '')), '') IS NOT NULL
  THEN
    RAISE EXCEPTION 'a Stage-2 signature requires a consent method'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO v_decision
  FROM public.client_decisions AS decision
  WHERE decision.id = p_decision_id
    AND decision.approval_contract = 'project_artifact_v1'
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'project approval decision not found'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO v_snapshot
  FROM public.project_decision_authority_snapshots AS snapshot
  WHERE snapshot.decision_id = p_decision_id;
  SELECT * INTO v_artifact
  FROM public.project_approval_artifacts AS artifact
  WHERE artifact.decision_id = p_decision_id;
  IF v_snapshot.id IS NULL
     OR v_artifact.id IS NULL
     OR v_snapshot.project_id IS DISTINCT FROM v_decision.project_id
     OR v_artifact.project_id IS DISTINCT FROM v_decision.project_id
     OR v_artifact.phase_id IS DISTINCT FROM v_decision.phase_id
  THEN
    RAISE EXCEPTION 'project approval evidence is incomplete or malformed'
      USING ERRCODE = 'check_violation';
  END IF;
  IF v_actor IS DISTINCT FROM v_snapshot.decision_lead_id THEN
    RAISE EXCEPTION 'only the frozen household decision lead may respond'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_option_id IS NOT NULL THEN
    SELECT * INTO v_option
    FROM public.client_decision_options AS option
    WHERE option.id = p_option_id
      AND option.decision_id = p_decision_id
      AND option.approval_outcome IN (
        'approved', 'changes_requested', 'needs_discussion'
      );
    IF NOT FOUND THEN
      RAISE EXCEPTION 'canonical approval option not found for decision'
        USING ERRCODE = 'check_violation';
    END IF;
    v_outcome := v_option.approval_outcome;
  ELSE
    IF v_outcome NOT IN (
      'approved', 'changes_requested', 'needs_discussion'
    ) THEN
      RAISE EXCEPTION 'unsupported project approval outcome %', v_outcome
        USING ERRCODE = 'invalid_parameter_value';
    END IF;
    SELECT * INTO v_option
    FROM public.client_decision_options AS option
    WHERE option.decision_id = p_decision_id
      AND option.approval_outcome = v_outcome;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'canonical approval outcome is missing'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  v_request := jsonb_build_object(
    'decisionId', p_decision_id,
    'outcome', v_outcome,
    'optionId', v_option.id,
    'expectedUpdatedAt', p_expected_updated_at,
    'clientConsentMethod', p_client_consent_method,
    'clientSignature', NULLIF(btrim(COALESCE(p_client_signature, '')), '')
  );
  v_request_hash := public._project_approval_hash(v_request);

  SELECT * INTO v_receipt
  FROM public.project_approval_action_receipts AS receipt
  WHERE receipt.decision_id = p_decision_id
    AND receipt.action_kind = 'responded'
    AND receipt.idempotency_key = v_key
  FOR UPDATE;
  IF FOUND THEN
    IF v_receipt.request_hash IS DISTINCT FROM v_request_hash
       OR v_receipt.actor_id IS DISTINCT FROM v_actor
    THEN
      RAISE EXCEPTION 'idempotency key was reused with a different response'
        USING ERRCODE = 'unique_violation';
    END IF;
    RETURN v_receipt.result || jsonb_build_object('idempotent', true);
  END IF;

  IF v_decision.updated_at IS DISTINCT FROM p_expected_updated_at THEN
    RAISE EXCEPTION 'project approval decision changed since it was loaded'
      USING ERRCODE = 'serialization_failure';
  END IF;
  IF v_decision.status <> 'pending' THEN
    RAISE EXCEPTION 'project approval cannot respond from status %',
      v_decision.status
      USING ERRCODE = 'check_violation';
  END IF;
  IF NOT EXISTS (
       SELECT 1
       FROM public.project_approval_action_receipts AS published
       WHERE published.decision_id = p_decision_id
         AND published.action_kind = 'published'
     )
     OR NOT EXISTS (
       SELECT 1
       FROM public.project_decision_review_confirmations AS confirmation
       WHERE confirmation.decision_id = p_decision_id
         AND confirmation.approver_role = 'lead'
         AND confirmation.approver_id = v_snapshot.decision_lead_id
         AND confirmation.authority_revision = v_snapshot.authority_revision
         AND confirmation.artifact_hash = v_artifact.artifact_hash
     )
     OR (
       v_snapshot.required_coapprover_id IS NOT NULL
       AND NOT EXISTS (
         SELECT 1
         FROM public.project_decision_review_confirmations AS confirmation
         WHERE confirmation.decision_id = p_decision_id
           AND confirmation.approver_role = 'coapprover'
           AND confirmation.approver_id = v_snapshot.required_coapprover_id
           AND confirmation.authority_revision = v_snapshot.authority_revision
           AND confirmation.artifact_hash = v_artifact.artifact_hash
       )
     )
  THEN
    RAISE EXCEPTION 'project approval is not fully reviewed and published'
      USING ERRCODE = 'check_violation';
  END IF;
  IF (
       SELECT count(*)
       FROM public.client_decision_options AS option
       WHERE option.decision_id = p_decision_id
         AND option.approval_outcome IN (
           'approved', 'changes_requested', 'needs_discussion'
         )
         AND option.cost_cents_delta = v_artifact.cost_cents_delta
         AND option.schedule_days_delta = v_artifact.schedule_days_delta
         AND option.lead_time_days_delta = v_artifact.lead_time_days_delta
         AND option.approves IS NOT DISTINCT FROM
             (option.approval_outcome = 'approved')
     ) <> 3
     OR (
       SELECT count(*)
       FROM public.client_decision_options AS option
       WHERE option.decision_id = p_decision_id
     ) <> 3
  THEN
    RAISE EXCEPTION 'canonical approval outcomes are malformed'
      USING ERRCODE = 'check_violation';
  END IF;

  PERFORM set_config(
    'app.project_approval_decision_write_id', p_decision_id::text, true
  );
  PERFORM set_config(
    'app.client_decision_write_id', p_decision_id::text, true
  );
  UPDATE public.client_decision_options AS option
  SET selected = option.id = v_option.id
  WHERE option.decision_id = p_decision_id;

  UPDATE public.client_decisions
  SET status = 'responded',
      responded_at = now(),
      selected_by = v_actor,
      answer = v_outcome,
      answered_at = now(),
      answered_by = v_actor,
      client_consent_method = p_client_consent_method,
      client_signature = CASE WHEN p_client_consent_method IS NULL
        THEN NULL ELSE NULLIF(btrim(COALESCE(p_client_signature, '')), '') END,
      client_consented_at = CASE WHEN p_client_consent_method IS NULL
        THEN NULL ELSE now() END,
      updated_at = now()
  WHERE id = p_decision_id
  RETURNING * INTO v_decision;

  IF v_outcome = 'approved' THEN
    UPDATE public.project_ffe_items
    SET blocked = false,
        blocked_reason = NULL,
        blocked_by_decision_id = NULL,
        last_status_change_at = now(),
        updated_at = now()
    WHERE blocked_by_decision_id = p_decision_id
      AND project_id = v_decision.project_id;
  END IF;

  v_result := jsonb_build_object(
    'receiptId', v_receipt_id,
    'projectId', v_decision.project_id,
    'decisionId', v_decision.id,
    'optionId', v_option.id,
    'outcome', v_outcome,
    'status', v_decision.status,
    'updatedAt', v_decision.updated_at
  );
  PERFORM set_config(
    'app.project_approval_evidence_decision_id', p_decision_id::text, true
  );
  INSERT INTO public.project_approval_action_receipts (
    id, project_id, decision_id, action_kind, idempotency_key,
    request_hash, actor_id, result
  ) VALUES (
    v_receipt_id, v_decision.project_id, p_decision_id, 'responded', v_key,
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
  PERFORM public._enqueue_decision_notification(
    p_decision_id, 'decision_resolved'
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
  RAISE;
END;
$$;

REVOKE ALL ON FUNCTION public._respond_project_approval_checked(
  uuid, text, uuid, timestamptz, text, text, text
) FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.respond_project_approval(
  p_decision_id uuid,
  p_payload jsonb,
  p_expected_updated_at timestamptz,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_unknown jsonb;
  v_outcome text;
  v_option_id uuid;
BEGIN
  IF p_payload IS NULL OR jsonb_typeof(p_payload) <> 'object' THEN
    RAISE EXCEPTION 'p_payload must be a JSON object'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;
  v_unknown := p_payload - ARRAY['outcome', 'optionId'];
  IF v_unknown <> '{}'::jsonb THEN
    RAISE EXCEPTION 'unsupported project response payload keys: %', v_unknown
      USING ERRCODE = 'invalid_parameter_value';
  END IF;
  v_outcome := NULLIF(btrim(COALESCE(p_payload->>'outcome', '')), '');
  v_option_id := NULLIF(p_payload->>'optionId', '')::uuid;
  IF (v_outcome IS NULL) = (v_option_id IS NULL) THEN
    RAISE EXCEPTION 'supply exactly one canonical outcome or optionId'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;
  RETURN public._respond_project_approval_checked(
    p_decision_id, v_outcome, v_option_id,
    p_expected_updated_at, p_idempotency_key, NULL, NULL
  );
END;
$$;

REVOKE ALL ON FUNCTION public.respond_project_approval(
  uuid, jsonb, timestamptz, text
) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.respond_project_approval(
  uuid, jsonb, timestamptz, text
) TO authenticated;

-- 00399 public body preserved verbatim in the non-Stage-2 branch.
CREATE OR REPLACE FUNCTION public.publish_client_decision(p_decision_id uuid)
RETURNS public.client_decisions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_decision public.client_decisions%ROWTYPE;
  v_snapshot public.project_decision_authority_snapshots%ROWTYPE;
  v_artifact public.project_approval_artifacts%ROWTYPE;
  v_receipt public.project_approval_action_receipts%ROWTYPE;
  v_actor uuid := auth.uid();
  v_key text := 'publish-v1:' || p_decision_id::text;
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
BEGIN
  SELECT * INTO v_decision
  FROM public.client_decisions
  WHERE id = p_decision_id
  FOR UPDATE;

  IF v_decision.approval_contract = 'project_artifact_v1' THEN
    IF NOT FOUND OR v_actor IS NULL
       OR NOT public._can_author_proposal(v_decision.designer_id)
    THEN
      RAISE EXCEPTION 'decision % not found or access denied', p_decision_id
        USING ERRCODE = 'insufficient_privilege';
    END IF;

    SELECT * INTO v_snapshot
    FROM public.project_decision_authority_snapshots AS snapshot
    WHERE snapshot.decision_id = p_decision_id;
    SELECT * INTO v_artifact
    FROM public.project_approval_artifacts AS artifact
    WHERE artifact.decision_id = p_decision_id;
    IF v_snapshot.id IS NULL
       OR v_artifact.id IS NULL
       OR v_snapshot.project_id IS DISTINCT FROM v_decision.project_id
       OR v_artifact.project_id IS DISTINCT FROM v_decision.project_id
       OR v_artifact.phase_id IS DISTINCT FROM v_decision.phase_id
    THEN
      RAISE EXCEPTION 'project approval evidence is incomplete or malformed'
        USING ERRCODE = 'check_violation';
    END IF;

    v_request_hash := public._project_approval_hash(jsonb_build_object(
      'decisionId', p_decision_id,
      'artifactHash', v_artifact.artifact_hash,
      'authorityRevision', v_snapshot.authority_revision
    ));
    SELECT * INTO v_receipt
    FROM public.project_approval_action_receipts AS receipt
    WHERE receipt.decision_id = p_decision_id
      AND receipt.action_kind = 'published'
      AND receipt.idempotency_key = v_key
    FOR UPDATE;
    IF FOUND THEN
      IF v_receipt.request_hash IS DISTINCT FROM v_request_hash
         OR v_receipt.actor_id IS DISTINCT FROM v_actor
      THEN
        RAISE EXCEPTION 'publish receipt conflicts with the current request'
          USING ERRCODE = 'serialization_failure';
      END IF;
      RETURN v_decision;
    END IF;

    IF v_decision.status <> 'draft' THEN
      RAISE EXCEPTION 'decision % cannot publish from status %',
        p_decision_id, v_decision.status
        USING ERRCODE = 'check_violation';
    END IF;
    IF NOT EXISTS (
         SELECT 1
         FROM public.project_decision_review_confirmations AS confirmation
         WHERE confirmation.decision_id = p_decision_id
           AND confirmation.approver_role = 'lead'
           AND confirmation.approver_id = v_snapshot.decision_lead_id
           AND confirmation.authority_revision = v_snapshot.authority_revision
           AND confirmation.artifact_hash = v_artifact.artifact_hash
       )
       OR (
         v_snapshot.required_coapprover_id IS NOT NULL
         AND NOT EXISTS (
           SELECT 1
           FROM public.project_decision_review_confirmations AS confirmation
           WHERE confirmation.decision_id = p_decision_id
             AND confirmation.approver_role = 'coapprover'
             AND confirmation.approver_id = v_snapshot.required_coapprover_id
             AND confirmation.authority_revision = v_snapshot.authority_revision
             AND confirmation.artifact_hash = v_artifact.artifact_hash
         )
       )
    THEN
      RAISE EXCEPTION 'every frozen required reviewer must confirm before publish'
        USING ERRCODE = 'check_violation';
    END IF;
    IF (
         SELECT count(*)
         FROM public.client_decision_options AS option
         WHERE option.decision_id = p_decision_id
           AND option.approval_outcome IN (
             'approved', 'changes_requested', 'needs_discussion'
           )
           AND option.cost_cents_delta = v_artifact.cost_cents_delta
           AND option.schedule_days_delta = v_artifact.schedule_days_delta
           AND option.lead_time_days_delta = v_artifact.lead_time_days_delta
           AND option.approves IS NOT DISTINCT FROM
               (option.approval_outcome = 'approved')
       ) <> 3
       OR (
         SELECT count(*) FROM public.client_decision_options AS option
         WHERE option.decision_id = p_decision_id
       ) <> 3
    THEN
      RAISE EXCEPTION 'canonical approval outcomes are malformed'
        USING ERRCODE = 'check_violation';
    END IF;

    PERFORM 1
    FROM public.client_decision_options AS option
    WHERE option.decision_id = p_decision_id
    ORDER BY option.id
    FOR UPDATE;

    PERFORM set_config(
      'app.project_approval_decision_write_id', p_decision_id::text, true
    );
    PERFORM set_config(
      'app.client_decision_write_id', p_decision_id::text, true
    );
    UPDATE public.client_decisions
    SET status = 'pending', sent_at = COALESCE(sent_at, now()), updated_at = now()
    WHERE id = p_decision_id
    RETURNING * INTO v_decision;

    v_result := jsonb_build_object(
      'receiptId', v_receipt_id,
      'projectId', v_decision.project_id,
      'decisionId', v_decision.id,
      'status', v_decision.status,
      'updatedAt', v_decision.updated_at
    );
    PERFORM set_config(
      'app.project_approval_evidence_decision_id', p_decision_id::text, true
    );
    INSERT INTO public.project_approval_action_receipts (
      id, project_id, decision_id, action_kind, idempotency_key,
      request_hash, actor_id, result
    ) VALUES (
      v_receipt_id, v_decision.project_id, p_decision_id, 'published', v_key,
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
    PERFORM public._enqueue_decision_notification(
      p_decision_id, 'decision_required'
    );
    RETURN v_decision;
  END IF;

  IF NOT FOUND OR NOT public._can_author_proposal(v_decision.designer_id) THEN
    RAISE EXCEPTION 'decision % not found or access denied', p_decision_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF v_decision.status = 'pending' THEN
    PERFORM public._enqueue_decision_notification(
      p_decision_id, 'decision_required'
    );
    RETURN v_decision;
  END IF;
  IF v_decision.status <> 'draft' THEN
    RAISE EXCEPTION 'decision % cannot publish from status %',
      p_decision_id, v_decision.status
      USING ERRCODE = 'check_violation';
  END IF;

  PERFORM 1
  FROM public.client_decision_options AS option
  WHERE option.decision_id = p_decision_id
  ORDER BY option.id
  FOR UPDATE;

  PERFORM set_config('app.client_decision_write_id', p_decision_id::text, true);
  UPDATE public.client_decisions
  SET status = 'pending', sent_at = COALESCE(sent_at, now()), updated_at = now()
  WHERE id = p_decision_id
  RETURNING * INTO v_decision;
  PERFORM set_config('app.client_decision_write_id', '', true);
  PERFORM public._enqueue_decision_notification(
    p_decision_id, 'decision_required'
  );
  RETURN v_decision;
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
  RAISE;
END;
$$;

REVOKE ALL ON FUNCTION public.publish_client_decision(uuid)
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.publish_client_decision(uuid) TO authenticated;

-- ── Studio-only immutable dispositions ───────────────────────────────────

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
  IF v_decision.status <> 'pending' THEN
    RAISE EXCEPTION 'only pending Stage-2 decisions may be withdrawn'
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
  RAISE;
END;
$$;

REVOKE ALL ON FUNCTION public.withdraw_project_approval_decision(
  uuid, timestamptz, text, text
) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.withdraw_project_approval_decision(
  uuid, timestamptz, text, text
) TO authenticated;

CREATE OR REPLACE FUNCTION public.supersede_project_approval_decision(
  p_decision_id uuid,
  p_payload jsonb,
  p_expected_updated_at timestamptz,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_project_id uuid;
  v_project public.projects%ROWTYPE;
  v_decision public.client_decisions%ROWTYPE;
  v_old_artifact public.project_approval_artifacts%ROWTYPE;
  v_new_source record;
  v_successor public.client_decisions%ROWTYPE;
  v_receipt public.project_approval_action_receipts%ROWTYPE;
  v_unknown jsonb;
  v_key text := btrim(COALESCE(p_idempotency_key, ''));
  v_source_kind text;
  v_source_id uuid;
  v_core_payload jsonb;
  v_create_result jsonb;
  v_successor_id uuid;
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
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'project approval supersession requires an authenticated studio actor'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_payload IS NULL OR jsonb_typeof(p_payload) <> 'object' THEN
    RAISE EXCEPTION 'p_payload must be a JSON object'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;
  IF p_expected_updated_at IS NULL THEN
    RAISE EXCEPTION 'p_expected_updated_at is required'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;
  IF v_key = '' OR char_length(v_key) > 160 THEN
    RAISE EXCEPTION 'idempotency key must contain 1 to 160 characters'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;
  v_unknown := p_payload - ARRAY[
    'title', 'question', 'context', 'dueAt', 'artifactKind', 'artifactId',
    'costCentsDelta', 'scheduleDaysDelta', 'leadTimeDaysDelta'
  ];
  IF v_unknown <> '{}'::jsonb THEN
    RAISE EXCEPTION 'unsupported project supersede payload keys: %', v_unknown
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  SELECT decision.project_id INTO v_project_id
  FROM public.client_decisions AS decision
  WHERE decision.id = p_decision_id
    AND decision.approval_contract = 'project_artifact_v1';
  IF v_project_id IS NULL THEN
    RAISE EXCEPTION 'project approval not found or supersession denied'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Project → predecessor matches advance_project_phase lock order. The exact
  -- predecessor lock serializes competing successor creation.
  SELECT * INTO v_project
  FROM public.projects AS project
  WHERE project.id = v_project_id
  FOR UPDATE;
  SELECT * INTO v_decision
  FROM public.client_decisions AS decision
  WHERE decision.id = p_decision_id
    AND decision.project_id = v_project_id
    AND decision.approval_contract = 'project_artifact_v1'
  FOR UPDATE;
  IF NOT FOUND OR NOT public._can_author_proposal(v_decision.designer_id) THEN
    RAISE EXCEPTION 'project approval not found or supersession denied'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  v_request_hash := public._project_approval_hash(jsonb_build_object(
    'decisionId', p_decision_id,
    'payload', p_payload,
    'expectedUpdatedAt', p_expected_updated_at
  ));
  SELECT * INTO v_receipt
  FROM public.project_approval_action_receipts AS receipt
  WHERE receipt.decision_id = p_decision_id
    AND receipt.action_kind = 'superseded'
    AND receipt.idempotency_key = v_key
  FOR UPDATE;
  IF FOUND THEN
    IF v_receipt.request_hash IS DISTINCT FROM v_request_hash
       OR v_receipt.actor_id IS DISTINCT FROM v_actor
    THEN
      RAISE EXCEPTION 'idempotency key was reused with a different supersession'
        USING ERRCODE = 'unique_violation';
    END IF;
    RETURN v_receipt.result || jsonb_build_object('idempotent', true);
  END IF;

  IF v_decision.updated_at IS DISTINCT FROM p_expected_updated_at THEN
    RAISE EXCEPTION 'project approval decision changed since it was loaded'
      USING ERRCODE = 'serialization_failure';
  END IF;
  IF v_decision.status NOT IN ('pending', 'responded') THEN
    RAISE EXCEPTION 'only pending or responded Stage-2 decisions may be superseded'
      USING ERRCODE = 'check_violation';
  END IF;
  IF EXISTS (
       SELECT 1 FROM public.client_decisions AS successor
       WHERE successor.predecessor_decision_id = p_decision_id
     )
     OR EXISTS (
       SELECT 1 FROM public.project_approval_action_receipts AS prior
       WHERE prior.decision_id = p_decision_id
         AND prior.action_kind IN ('withdrawn', 'superseded')
     )
  THEN
    RAISE EXCEPTION 'only the exact current Stage-2 leaf may be superseded'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO v_old_artifact
  FROM public.project_approval_artifacts AS artifact
  WHERE artifact.decision_id = p_decision_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'predecessor artifact evidence is missing'
      USING ERRCODE = 'check_violation';
  END IF;

  v_source_kind := NULLIF(p_payload->>'artifactKind', '');
  v_source_id := NULLIF(p_payload->>'artifactId', '')::uuid;
  SELECT * INTO v_new_source
  FROM public._resolve_project_approval_artifact(
    v_project_id, v_source_kind, v_source_id
  );
  IF v_source_kind IS NOT DISTINCT FROM v_old_artifact.source_kind
     AND v_source_id IS NOT DISTINCT FROM v_old_artifact.source_id
     OR v_new_source.artifact_hash IS NOT DISTINCT FROM v_old_artifact.artifact_hash
  THEN
    RAISE EXCEPTION 'supersession requires a genuinely new immutable artifact'
      USING ERRCODE = 'check_violation';
  END IF;

  v_core_payload := p_payload || jsonb_build_object(
    'phaseId', v_decision.phase_id,
    'sectionKey', v_decision.section_key
  );
  v_create_result := public._create_project_approval_decision_checked(
    v_project_id,
    v_core_payload,
    'supersede-create:' || v_key,
    p_decision_id
  );
  v_successor_id := (v_create_result->>'decisionId')::uuid;

  SELECT * INTO v_successor
  FROM public.client_decisions AS successor
  WHERE successor.id = v_successor_id
  FOR UPDATE;
  IF NOT FOUND
     OR v_successor.predecessor_decision_id IS DISTINCT FROM p_decision_id
     OR v_successor.project_id IS DISTINCT FROM v_decision.project_id
     OR v_successor.phase_id IS DISTINCT FROM v_decision.phase_id
     OR v_successor.section_key IS DISTINCT FROM v_decision.section_key
     OR v_successor.blocks_kind IS DISTINCT FROM v_decision.blocks_kind
     OR v_successor.blocking_status IS DISTINCT FROM v_decision.blocking_status
     OR v_successor.blocks_kind IS DISTINCT FROM 'phase'
     OR v_successor.blocking_status IS DISTINCT FROM 'blocks_phase'
  THEN
    RAISE EXCEPTION 'successor project, phase, section, or gate lineage drifted'
      USING ERRCODE = 'check_violation';
  END IF;

  IF v_decision.status = 'pending' THEN
    PERFORM set_config(
      'app.project_approval_decision_write_id', p_decision_id::text, true
    );
    PERFORM set_config(
      'app.client_decision_write_id', p_decision_id::text, true
    );
    UPDATE public.client_decisions
    SET status = 'expired', updated_at = now()
    WHERE id = p_decision_id
    RETURNING * INTO v_decision;
  END IF;

  v_result := jsonb_build_object(
    'receiptId', v_receipt_id,
    'projectId', v_decision.project_id,
    'decisionId', v_decision.id,
    'successorDecisionId', v_successor.id,
    'status', v_decision.status,
    'disposition', 'superseded',
    'successorStatus', v_successor.status,
    'updatedAt', v_decision.updated_at
  );
  PERFORM set_config(
    'app.project_approval_evidence_decision_id', p_decision_id::text, true
  );
  INSERT INTO public.project_approval_action_receipts (
    id, project_id, decision_id, action_kind, idempotency_key,
    request_hash, actor_id, result, successor_decision_id
  ) VALUES (
    v_receipt_id, v_decision.project_id, p_decision_id, 'superseded', v_key,
    v_request_hash, v_actor, v_result, v_successor.id
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
  RAISE;
END;
$$;

REVOKE ALL ON FUNCTION public.supersede_project_approval_decision(
  uuid, jsonb, timestamptz, text
) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.supersede_project_approval_decision(
  uuid, jsonb, timestamptz, text
) TO authenticated;

-- 00399 installed-client wrapper with one additive Stage-2 option branch.
CREATE OR REPLACE FUNCTION public.apply_client_decision(
  p_decision_id uuid,
  p_selected_option_id uuid,
  p_client_consent_method text DEFAULT NULL,
  p_client_signature text DEFAULT NULL,
  p_client_note text DEFAULT NULL,
  p_quantity integer DEFAULT NULL
)
RETURNS public.client_decisions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_client_id uuid;
  v_coordination_kind text;
  v_court text;
  v_approval_contract text;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'apply_client_decision requires an authenticated user'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT relationship.client_id, decision.coordination_kind, decision.court,
         decision.approval_contract
  INTO v_client_id, v_coordination_kind, v_court, v_approval_contract
  FROM public.client_decisions AS decision
  JOIN public.designer_clients AS relationship
    ON relationship.id = decision.designer_client_id
  WHERE decision.id = p_decision_id
  FOR UPDATE OF decision
  FOR SHARE OF relationship;

  IF v_client_id IS DISTINCT FROM v_actor THEN
    RAISE EXCEPTION 'only the addressed client may apply this decision'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF v_approval_contract = 'project_artifact_v1' THEN
    IF v_court IS DISTINCT FROM 'client' THEN
      RAISE EXCEPTION
        'only client-court decisions may be applied by the addressed client'
        USING ERRCODE = 'insufficient_privilege';
    END IF;

    RETURN public._apply_client_decision_authorized(
      p_decision_id, p_selected_option_id, v_actor,
      p_client_consent_method, p_client_signature, p_client_note, p_quantity
    );
  END IF;

  IF v_coordination_kind IS DISTINCT FROM 'selection'
     OR v_court IS DISTINCT FROM 'client'
  THEN
    RAISE EXCEPTION
      'only client-court selection decisions may be applied by the addressed client'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN public._apply_client_decision_authorized(
    p_decision_id, p_selected_option_id, v_actor,
    p_client_consent_method, p_client_signature, p_client_note, p_quantity
  );
END;
$$;

REVOKE ALL ON FUNCTION public.apply_client_decision(
  uuid, uuid, text, text, text, integer
) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.apply_client_decision(
  uuid, uuid, text, text, text, integer
) TO authenticated;

-- 00413 private apply body preserved after the Stage-2 routing branch.
CREATE OR REPLACE FUNCTION public._apply_client_decision_authorized(
  p_decision_id uuid,
  p_selected_option_id uuid,
  p_actor uuid,
  p_client_consent_method text DEFAULT NULL,
  p_client_signature text DEFAULT NULL,
  p_client_note text DEFAULT NULL,
  p_quantity integer DEFAULT NULL
)
RETURNS public.client_decisions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_decision public.client_decisions%ROWTYPE;
  v_option public.client_decision_options%ROWTYPE;
  v_receipt public.project_approval_action_receipts%ROWTYPE;
  v_selected_option_id uuid;
  v_selected_outcome text;
  v_requested_signature text := NULLIF(
    btrim(COALESCE(p_client_signature, '')), ''
  );
  v_stored_signature text;
  v_room_id uuid;
  v_trade_price integer;
  v_markup numeric(5,2);
BEGIN
  SELECT * INTO v_decision
  FROM public.client_decisions
  WHERE id = p_decision_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'decision % not found', p_decision_id
      USING ERRCODE = 'no_data_found';
  END IF;

  IF v_decision.approval_contract = 'project_artifact_v1' THEN
    IF p_actor IS DISTINCT FROM auth.uid()
       OR p_client_note IS NOT NULL
       OR (p_quantity IS NOT NULL AND p_quantity <> 1)
    THEN
      RAISE EXCEPTION
        'Stage-2 installed option response cannot carry comment or quantity evidence'
        USING ERRCODE = 'check_violation';
    END IF;

    IF v_decision.status = 'responded' THEN
      SELECT option.id, option.approval_outcome
      INTO v_selected_option_id, v_selected_outcome
      FROM public.client_decision_options AS option
      WHERE option.decision_id = p_decision_id
        AND option.selected
      ORDER BY option.id
      LIMIT 1;
      IF v_selected_option_id IS DISTINCT FROM p_selected_option_id THEN
        RAISE EXCEPTION 'decision % was already resolved with another option',
          p_decision_id
          USING ERRCODE = 'serialization_failure';
      END IF;

      SELECT * INTO v_receipt
      FROM public.project_approval_action_receipts AS receipt
      WHERE receipt.decision_id = p_decision_id
        AND receipt.action_kind = 'responded'
        AND receipt.idempotency_key =
            'installed-option:' || p_selected_option_id::text;
      v_stored_signature := NULLIF(
        btrim(COALESCE(v_decision.client_signature, '')), ''
      );
      IF v_receipt.id IS NULL
         OR v_receipt.actor_id IS DISTINCT FROM p_actor
         OR v_receipt.project_id IS DISTINCT FROM v_decision.project_id
         OR v_receipt.result->>'decisionId' IS DISTINCT FROM p_decision_id::text
         OR v_receipt.result->>'projectId' IS DISTINCT FROM v_decision.project_id::text
         OR v_receipt.result->>'optionId' IS DISTINCT FROM p_selected_option_id::text
         OR v_receipt.result->>'outcome' IS DISTINCT FROM v_selected_outcome
         OR v_decision.selected_by IS DISTINCT FROM p_actor
         OR v_decision.answered_by IS DISTINCT FROM p_actor
         OR v_decision.answer IS DISTINCT FROM v_selected_outcome
         OR p_client_consent_method IS DISTINCT FROM
            v_decision.client_consent_method
         OR v_requested_signature IS DISTINCT FROM v_stored_signature
      THEN
        RAISE EXCEPTION
          'installed Stage-2 response replay conflicts with immutable evidence'
          USING ERRCODE = 'unique_violation';
      END IF;
      RETURN v_decision;
    END IF;

    PERFORM public._respond_project_approval_checked(
      p_decision_id, NULL, p_selected_option_id, v_decision.updated_at,
      'installed-option:' || p_selected_option_id::text,
      p_client_consent_method, p_client_signature
    );
    SELECT * INTO STRICT v_decision
    FROM public.client_decisions
    WHERE id = p_decision_id;
    RETURN v_decision;
  END IF;

  -- Deterministic replay: repeating the same winning option returns the same
  -- terminal row; trying to overwrite a different winner is a stale conflict.
  IF v_decision.status = 'responded' THEN
    SELECT id INTO v_selected_option_id
    FROM public.client_decision_options
    WHERE decision_id = p_decision_id AND selected = true
    ORDER BY id
    LIMIT 1;
    IF v_selected_option_id IS NOT DISTINCT FROM p_selected_option_id THEN
      PERFORM public._enqueue_decision_notification(
        p_decision_id, 'decision_resolved'
      );
      RETURN v_decision;
    END IF;
    RAISE EXCEPTION 'decision % was already resolved with another option', p_decision_id
      USING ERRCODE = 'serialization_failure';
  END IF;

  IF v_decision.status <> 'pending' THEN
    RAISE EXCEPTION 'decision % cannot be applied from status %',
      p_decision_id, v_decision.status
      USING ERRCODE = 'check_violation';
  END IF;

  PERFORM 1
  FROM public.client_decision_options
  WHERE decision_id = p_decision_id
  ORDER BY id
  FOR UPDATE;

  SELECT * INTO v_option
  FROM public.client_decision_options
  WHERE id = p_selected_option_id
    AND decision_id = p_decision_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'option % does not belong to decision %',
      p_selected_option_id, p_decision_id
      USING ERRCODE = 'check_violation';
  END IF;

  IF p_quantity IS NOT NULL AND p_quantity < 1 THEN
    RAISE EXCEPTION 'decision option quantity must be at least 1'
      USING ERRCODE = 'check_violation';
  END IF;
  IF p_client_consent_method IS NOT NULL
     AND p_client_consent_method NOT IN ('electronic_signature', 'click_through')
  THEN
    RAISE EXCEPTION 'invalid client consent method %', p_client_consent_method
      USING ERRCODE = 'check_violation';
  END IF;
  IF p_client_consent_method = 'electronic_signature'
     AND char_length(btrim(COALESCE(p_client_signature, ''))) < 2
  THEN
    RAISE EXCEPTION 'an electronic signature of at least 2 characters is required'
      USING ERRCODE = 'check_violation';
  END IF;

  PERFORM set_config('app.client_decision_write_id', p_decision_id::text, true);

  UPDATE public.client_decision_options
  SET selected = (id = p_selected_option_id),
      client_note = CASE WHEN id = p_selected_option_id
        THEN COALESCE(p_client_note, client_note) ELSE client_note END,
      quantity = CASE WHEN id = p_selected_option_id
        THEN COALESCE(p_quantity, quantity) ELSE quantity END
  WHERE decision_id = p_decision_id;

  SELECT * INTO v_option
  FROM public.client_decision_options
  WHERE id = p_selected_option_id;

  UPDATE public.client_decisions
  SET status = 'responded',
      responded_at = now(),
      selected_by = p_actor,
      client_consent_method = p_client_consent_method,
      client_signature = CASE WHEN p_client_consent_method IS NULL
        THEN NULL ELSE NULLIF(btrim(COALESCE(p_client_signature, '')), '') END,
      client_consented_at = CASE WHEN p_client_consent_method IS NULL
        THEN NULL ELSE now() END,
      updated_at = now()
  WHERE id = p_decision_id
  RETURNING * INTO v_decision;

  UPDATE public.project_ffe_items
  SET blocked = false,
      blocked_reason = NULL,
      blocked_by_decision_id = NULL,
      last_status_change_at = now(),
      updated_at = now()
  WHERE blocked_by_decision_id = p_decision_id
    AND project_id = v_decision.project_id;

  -- Preserve 00175/00185's one-line-per-decision dual-pricing feed-through.
  IF v_decision.project_id IS NOT NULL
     AND v_option.product_id IS NOT NULL
     AND v_decision.blocking_status = 'non_blocking'
  THEN
    v_room_id := (
      SELECT room.id
      FROM public.project_rooms AS room
      WHERE room.id = v_decision.room_id
        AND room.project_id = v_decision.project_id
    );

    SELECT product.price_trade INTO v_trade_price
    FROM public.products AS product
    WHERE product.id = v_option.product_id;

    IF v_trade_price IS NULL OR v_trade_price < 0 THEN
      v_trade_price := GREATEST(COALESCE(v_option.price, 0), 0);
      v_markup := 0;
    ELSIF v_trade_price > 0
          AND COALESCE(v_option.price, 0) > v_trade_price
    THEN
      v_markup := LEAST(
        round(((COALESCE(v_option.price, 0)::numeric / v_trade_price) - 1) * 100, 2),
        999.99
      );
    ELSE
      v_markup := 0;
    END IF;

    UPDATE public.project_ffe_items
    SET product_id = v_option.product_id,
        name = v_option.name,
        project_room_id = v_room_id,
        quantity = COALESCE(v_option.quantity, 1),
        unit_price_cents = COALESCE(v_option.price, 0),
        trade_price_cents = v_trade_price,
        markup_percent = v_markup,
        line_total_cents = COALESCE(v_option.price, 0)
          * COALESCE(v_option.quantity, 1),
        updated_at = now()
    WHERE source_decision_id = p_decision_id;

    IF NOT FOUND THEN
      INSERT INTO public.project_ffe_items (
        project_id, project_room_id, product_id, source_decision_id,
        name, item_type, status, quantity, unit_price_cents,
        trade_price_cents, markup_percent, line_total_cents
      ) VALUES (
        v_decision.project_id, v_room_id, v_option.product_id, p_decision_id,
        v_option.name, 'fixed', 'specified', COALESCE(v_option.quantity, 1),
        COALESCE(v_option.price, 0), v_trade_price, v_markup,
        COALESCE(v_option.price, 0) * COALESCE(v_option.quantity, 1)
      );
    END IF;

    IF jsonb_typeof(v_option.selection_snapshot) = 'array'
       AND jsonb_array_length(v_option.selection_snapshot) > 0
    THEN
      UPDATE public.project_ffe_specs AS spec
      SET material = COALESCE((
            SELECT string_agg(chosen.selection->>'valueLabel', ', '
                              ORDER BY chosen.ordinality)
            FROM jsonb_array_elements(v_option.selection_snapshot)
                 WITH ORDINALITY AS chosen(selection, ordinality)
            WHERE lower(chosen.selection->>'groupCode') = 'material'
          ), spec.material),
          finish = COALESCE((
            SELECT string_agg(chosen.selection->>'valueLabel', ', '
                              ORDER BY chosen.ordinality)
            FROM jsonb_array_elements(v_option.selection_snapshot)
                 WITH ORDINALITY AS chosen(selection, ordinality)
            WHERE lower(chosen.selection->>'groupCode') = 'finish'
          ), spec.finish),
          color_fabric = COALESCE((
            SELECT string_agg(chosen.selection->>'valueLabel', ', '
                              ORDER BY chosen.ordinality)
            FROM jsonb_array_elements(v_option.selection_snapshot)
                 WITH ORDINALITY AS chosen(selection, ordinality)
            WHERE lower(chosen.selection->>'groupCode')
                  IN ('color', 'colour', 'fabric', 'color_fabric', 'upholstery')
          ), spec.color_fabric),
          updated_at = now()
      WHERE spec.ffe_item_id IN (
              SELECT item.id
              FROM public.project_ffe_items AS item
              WHERE item.source_decision_id = p_decision_id
                AND item.project_id = v_decision.project_id
            )
        AND spec.configuration_locked_at IS NULL;
    END IF;
  END IF;

  PERFORM set_config('app.client_decision_write_id', '', true);
  PERFORM public._enqueue_decision_notification(
    p_decision_id, 'decision_resolved'
  );
  RETURN v_decision;
END;
$$;

REVOKE ALL ON FUNCTION public._apply_client_decision_authorized(
  uuid, uuid, uuid, text, text, text, integer
) FROM PUBLIC, anon, authenticated, service_role;

-- ── Generic lifecycle compatibility with explicit Stage-2 exclusion ──────

CREATE OR REPLACE FUNCTION public.reopen_client_decision(p_decision_id uuid)
RETURNS public.client_decisions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_decision public.client_decisions%ROWTYPE;
BEGIN
  SELECT * INTO v_decision
  FROM public.client_decisions
  WHERE id = p_decision_id
  FOR UPDATE;

  IF NOT FOUND OR NOT public._can_author_proposal(v_decision.designer_id) THEN
    RAISE EXCEPTION 'decision % not found or access denied', p_decision_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF v_decision.approval_contract = 'project_artifact_v1' THEN
    RAISE EXCEPTION 'Stage-2 project approvals cannot use generic reopen'
      USING ERRCODE = 'check_violation';
  END IF;
  IF v_decision.status = 'pending' THEN
    RETURN v_decision;
  END IF;
  IF v_decision.status NOT IN ('responded', 'expired') THEN
    RAISE EXCEPTION 'decision % cannot reopen from status %',
      p_decision_id, v_decision.status
      USING ERRCODE = 'check_violation';
  END IF;
  IF v_decision.linked_proposal_id IS NOT NULL THEN
    RAISE EXCEPTION 'proposal approval decisions are terminal'
      USING ERRCODE = 'check_violation';
  END IF;

  PERFORM set_config('app.client_decision_write_id', p_decision_id::text, true);
  UPDATE public.client_decision_options
  SET selected = false, client_note = NULL
  WHERE decision_id = p_decision_id;

  UPDATE public.client_decisions
  SET status = 'pending',
      due_date = CASE
        WHEN due_date IS NULL OR due_date > now() THEN due_date
        ELSE NULL
      END,
      responded_at = NULL,
      viewed_at = NULL,
      reminder_sent_at = NULL,
      selected_by = NULL,
      answer = NULL,
      answered_at = NULL,
      answered_by = NULL,
      client_consent_method = NULL,
      client_consented_at = NULL,
      client_signature = NULL,
      updated_at = now()
  WHERE id = p_decision_id
  RETURNING * INTO v_decision;
  PERFORM set_config('app.client_decision_write_id', '', true);
  PERFORM public._enqueue_decision_notification(
    p_decision_id, 'decision_required'
  );
  RETURN v_decision;
END;
$$;

REVOKE ALL ON FUNCTION public.reopen_client_decision(uuid)
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.reopen_client_decision(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.extend_and_reopen_client_decision(
  p_decision_id uuid,
  p_due_date timestamptz,
  p_expected_updated_at timestamptz
)
RETURNS public.client_decisions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_decision public.client_decisions%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION
      'extend_and_reopen_client_decision requires an authenticated user'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_due_date IS NULL THEN
    RAISE EXCEPTION 'p_due_date is required'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;
  IF p_expected_updated_at IS NULL THEN
    RAISE EXCEPTION 'p_expected_updated_at is required'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  SELECT * INTO v_decision
  FROM public.client_decisions
  WHERE id = p_decision_id
  FOR UPDATE;

  IF NOT FOUND OR NOT public._can_author_proposal(v_decision.designer_id) THEN
    RAISE EXCEPTION 'decision % not found or access denied', p_decision_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF v_decision.approval_contract = 'project_artifact_v1' THEN
    RAISE EXCEPTION 'Stage-2 project approvals cannot use generic extend/reopen'
      USING ERRCODE = 'check_violation';
  END IF;
  IF v_decision.linked_proposal_id IS NOT NULL THEN
    RAISE EXCEPTION 'proposal approval decisions are terminal'
      USING ERRCODE = 'check_violation';
  END IF;

  IF v_decision.status = 'pending' THEN
    IF v_decision.due_date IS NOT DISTINCT FROM p_due_date THEN
      RETURN v_decision;
    END IF;
    RAISE EXCEPTION
      'decision % already reflects a different extend-and-reopen effect',
      p_decision_id
      USING ERRCODE = 'serialization_failure';
  END IF;
  IF v_decision.status <> 'expired' THEN
    RAISE EXCEPTION 'decision % cannot extend-and-reopen from status %',
      p_decision_id, v_decision.status
      USING ERRCODE = 'check_violation';
  END IF;
  IF v_decision.updated_at IS DISTINCT FROM p_expected_updated_at THEN
    RAISE EXCEPTION 'decision % changed since it was loaded', p_decision_id
      USING ERRCODE = 'serialization_failure';
  END IF;
  IF p_due_date <= now() THEN
    RAISE EXCEPTION 'an extended due date must be in the future'
      USING ERRCODE = 'check_violation';
  END IF;

  PERFORM set_config('app.client_decision_write_id', p_decision_id::text, true);
  UPDATE public.client_decision_options
  SET selected = false, client_note = NULL
  WHERE decision_id = p_decision_id;

  UPDATE public.client_decisions
  SET status = 'pending',
      due_date = p_due_date,
      responded_at = NULL,
      viewed_at = NULL,
      reminder_sent_at = NULL,
      selected_by = NULL,
      answer = NULL,
      answered_at = NULL,
      answered_by = NULL,
      client_consent_method = NULL,
      client_consented_at = NULL,
      client_signature = NULL,
      updated_at = now()
  WHERE id = p_decision_id
  RETURNING * INTO v_decision;
  PERFORM set_config('app.client_decision_write_id', '', true);

  PERFORM public._enqueue_decision_notification(
    p_decision_id, 'decision_required'
  );
  RETURN v_decision;
END;
$$;

REVOKE ALL ON FUNCTION public.extend_and_reopen_client_decision(
  uuid, timestamptz, timestamptz
) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.extend_and_reopen_client_decision(
  uuid, timestamptz, timestamptz
) TO authenticated;

CREATE OR REPLACE FUNCTION public.expire_client_decision(p_decision_id uuid)
RETURNS public.client_decisions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_decision public.client_decisions%ROWTYPE;
BEGIN
  SELECT * INTO v_decision
  FROM public.client_decisions
  WHERE id = p_decision_id
  FOR UPDATE;

  IF NOT FOUND OR NOT public._can_author_proposal(v_decision.designer_id) THEN
    RAISE EXCEPTION 'decision % not found or access denied', p_decision_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF v_decision.approval_contract = 'project_artifact_v1' THEN
    RAISE EXCEPTION 'Stage-2 project approvals require checked withdraw/supersede'
      USING ERRCODE = 'check_violation';
  END IF;
  IF v_decision.status = 'expired' THEN
    RETURN v_decision;
  END IF;
  IF v_decision.status <> 'pending' THEN
    RAISE EXCEPTION 'decision % cannot expire from status %',
      p_decision_id, v_decision.status
      USING ERRCODE = 'check_violation';
  END IF;

  PERFORM set_config('app.client_decision_write_id', p_decision_id::text, true);
  UPDATE public.client_decisions
  SET status = 'expired', updated_at = now()
  WHERE id = p_decision_id
  RETURNING * INTO v_decision;
  PERFORM set_config('app.client_decision_write_id', '', true);
  RETURN v_decision;
END;
$$;

REVOKE ALL ON FUNCTION public.expire_client_decision(uuid)
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.expire_client_decision(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.expire_due_client_decisions(
  p_cutoff timestamptz
)
RETURNS TABLE(id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'expire_due_client_decisions is service-role only'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_cutoff IS NULL THEN
    RAISE EXCEPTION 'p_cutoff is required'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  FOR v_id IN
    SELECT decision.id
    FROM public.client_decisions AS decision
    WHERE decision.status = 'pending'
      AND decision.approval_contract IS NULL
      AND decision.due_date IS NOT NULL
      AND decision.due_date < p_cutoff
    ORDER BY decision.id
    FOR UPDATE SKIP LOCKED
  LOOP
    PERFORM set_config('app.client_decision_write_id', v_id::text, true);
    UPDATE public.client_decisions AS decision
    SET status = 'expired', updated_at = now()
    WHERE decision.id = v_id
      AND decision.status = 'pending'
      AND decision.approval_contract IS NULL;
    PERFORM set_config('app.client_decision_write_id', '', true);
    id := v_id;
    RETURN NEXT;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.expire_due_client_decisions(timestamptz)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.expire_due_client_decisions(timestamptz)
  TO service_role;

-- 00399 view/reminder compatibility with the additive Stage-2 write rail.
CREATE OR REPLACE FUNCTION public.mark_client_decision_viewed(
  p_decision_id uuid
)
RETURNS public.client_decisions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_decision public.client_decisions%ROWTYPE;
  v_previous_parent_write text := current_setting(
    'app.project_approval_decision_write_id', true
  );
  v_previous_legacy_write text := current_setting(
    'app.client_decision_write_id', true
  );
BEGIN
  SELECT decision.* INTO v_decision
  FROM public.client_decisions AS decision
  WHERE decision.id = p_decision_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'decision % not found or not addressed to you', p_decision_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF v_decision.approval_contract = 'project_artifact_v1' THEN
    IF v_actor IS NULL OR NOT EXISTS (
      SELECT 1
      FROM public.project_decision_authority_snapshots AS snapshot
      WHERE snapshot.decision_id = v_decision.id
        AND snapshot.project_id = v_decision.project_id
        AND snapshot.decision_lead_id = v_actor
    ) THEN
      RAISE EXCEPTION 'decision % not found or not addressed to you', p_decision_id
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  ELSIF v_actor IS NULL OR NOT EXISTS (
    SELECT 1
    FROM public.designer_clients AS relationship
    WHERE relationship.id = v_decision.designer_client_id
      AND relationship.client_id = v_actor
  ) THEN
    RAISE EXCEPTION 'decision % not found or not addressed to you', p_decision_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF v_decision.status <> 'pending' THEN
    RAISE EXCEPTION 'only pending decisions may be marked viewed'
      USING ERRCODE = 'check_violation';
  END IF;

  IF v_decision.viewed_at IS NULL THEN
    PERFORM set_config(
      'app.client_decision_write_id', p_decision_id::text, true
    );
    IF v_decision.approval_contract = 'project_artifact_v1' THEN
      PERFORM set_config(
        'app.project_approval_decision_write_id', p_decision_id::text, true
      );
    END IF;
    UPDATE public.client_decisions
    SET viewed_at = now(), updated_at = now()
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
  END IF;
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

REVOKE ALL ON FUNCTION public.mark_client_decision_viewed(uuid)
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.mark_client_decision_viewed(uuid)
  TO authenticated;

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
  ELSE
    SELECT relationship.client_id INTO v_client_id
    FROM public.designer_clients AS relationship
    WHERE relationship.id = v_decision.designer_client_id;
  END IF;
  IF v_client_id IS NULL THEN
    RAISE EXCEPTION 'decision has no registered client reminder recipient'
      USING ERRCODE = 'check_violation';
  END IF;

  INSERT INTO public.notification_log (
    user_id, type, channel, status, template_id, metadata, sent_at
  ) VALUES (
    v_client_id,
    'decision_reminder',
    'in_app',
    'delivered',
    'decision_reminder_v1',
    jsonb_build_object(
      'decision_id', p_decision_id,
      'subject', 'Decision reminder',
      'preview', v_decision.title,
      'deep_link', '/decisions/' || p_decision_id::text
    ),
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

-- 00393 atomic phase authority, with only its blocker predicate replaced.
CREATE OR REPLACE FUNCTION public.advance_project_phase(
  p_project_id      uuid,
  p_phase_id        uuid,
  p_expected_status text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor                 uuid := auth.uid();
  v_project               public.projects%ROWTYPE;
  v_target                public.project_phases%ROWTYPE;
  v_live_main             public.project_phases%ROWTYPE;
  v_blocker_count         integer := 0;
  v_rows                  integer := 0;
  v_component_ids         uuid[] := ARRAY[]::uuid[];
  v_component_count       integer := 0;
  v_component_edge_count  integer := 0;
  v_component_has_main    boolean := false;
  v_ancestor_ids          uuid[] := ARRAY[]::uuid[];
  v_descendant_ids        uuid[] := ARRAY[]::uuid[];
  v_direct_child_ids      uuid[] := ARRAY[]::uuid[];
  v_direct_child_count    integer := 0;
  v_direct_main_count     integer := 0;
  v_live_main_count       integer := 0;
  v_live_main_id          uuid;
  v_component_terminal    boolean := false;
  v_guard_prior           text;
  v_guard_token           text;
  v_guard_set             boolean := false;
  v_receipt               jsonb;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'advance_project_phase requires an authenticated user'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_expected_status NOT IN ('in_progress', 'delayed') THEN
    RAISE EXCEPTION
      'advance_project_phase expected status must be in_progress or delayed'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  -- Parent first serializes lifecycle calls for one project. It also conflicts
  -- with FK key-share locks taken by a concurrent project_phases INSERT.
  SELECT * INTO v_project
  FROM public.projects
  WHERE id = p_project_id
  FOR UPDATE;

  -- Project-authoring authority is intentionally narrower than the general
  -- is_studio_comember helper: exact designer, or two active non-guest members
  -- of the same active design_studio. Contractor/manufacturer organizations do
  -- not confer project lifecycle authority.
  IF NOT FOUND OR NOT (
    v_project.designer_id = v_actor
    OR EXISTS (
      SELECT 1
      FROM public.organization_members AS actor_membership
      JOIN public.organization_members AS owner_membership
        ON owner_membership.organization_id = actor_membership.organization_id
      JOIN public.organizations AS organization
        ON organization.id = actor_membership.organization_id
      WHERE actor_membership.user_id = v_actor
        AND actor_membership.status = 'active'
        AND actor_membership.role <> 'guest'
        AND owner_membership.user_id = v_project.designer_id
        AND owner_membership.status = 'active'
        AND owner_membership.role <> 'guest'
        AND organization.type = 'design_studio'
        AND organization.status = 'active'
    )
  ) THEN
    RAISE EXCEPTION 'advance_project_phase: project not found or access denied'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF v_project.status::text <> 'active' THEN
    RAISE EXCEPTION 'advance_project_phase: project is not active'
      USING ERRCODE = 'check_violation';
  END IF;

  -- Reject a cross-project phase id before taking locks in a foreign project.
  -- The row is selected again from the locked set below, so a concurrent move
  -- cannot pass the eventual project-scoped CAS.
  IF NOT EXISTS (
    SELECT 1
    FROM public.project_phases AS phase
    WHERE phase.id = p_phase_id
      AND phase.project_id = p_project_id
  ) THEN
    RAISE EXCEPTION 'advance_project_phase: phase does not belong to project'
      USING ERRCODE = 'check_violation';
  END IF;

  -- Gate updates lock their decision row before the completed-phase guard locks
  -- its phase. Match that order here, then rescan after the phase locks. The
  -- second pass captures a decision inserted/moved into the phase while this
  -- call was waiting and prevents decision→phase / phase→decision deadlocks.
  IF p_expected_status = 'in_progress' THEN
    PERFORM decision.id
    FROM public.client_decisions AS decision
    WHERE decision.phase_id = p_phase_id
    ORDER BY decision.id
    FOR UPDATE;
  END IF;

  -- Freeze the complete project graph in deterministic UUID order. New child
  -- edges block on these row locks/FK key-share conflicts until this call ends.
  PERFORM phase.id
  FROM public.project_phases AS phase
  WHERE phase.project_id = p_project_id
  ORDER BY phase.id
  FOR UPDATE;

  SELECT * INTO v_target
  FROM public.project_phases
  WHERE id = p_phase_id
    AND project_id = p_project_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'advance_project_phase: phase does not belong to project'
      USING ERRCODE = 'check_violation';
  END IF;

  -- The caller's observed status is the compare-and-swap token. A retry or a
  -- second tab that wakes after the project lock must fail, never replay.
  IF v_target.status IS DISTINCT FROM p_expected_status THEN
    RAISE EXCEPTION
      'advance_project_phase: phase status changed (expected %, found %)',
      p_expected_status, v_target.status
      USING ERRCODE = 'serialization_failure';
  END IF;

  -- Cross-project edges are possible under the legacy self-FK. Check both an
  -- outbound edge from this project and an inbound foreign child before any
  -- graph inference. Cross-lane edges are intentional overlap/handoff edges.
  IF EXISTS (
    SELECT 1
    FROM public.project_phases AS child
    JOIN public.project_phases AS parent
      ON parent.id = child.follows_phase_id
    WHERE (child.project_id = p_project_id OR parent.project_id = p_project_id)
      AND child.project_id IS DISTINCT FROM parent.project_id
  ) THEN
    RAISE EXCEPTION 'advance_project_phase: cross-project handoff is unsupported'
      USING ERRCODE = 'check_violation';
  END IF;

  -- Find the target's exact project-scoped connected component by walking
  -- follows edges in both directions, regardless of render lane. UNION (not
  -- UNION ALL) terminates a legacy cycle so it can be rejected explicitly.
  WITH RECURSIVE component(id) AS (
    SELECT v_target.id
    UNION
    SELECT neighbor.id
    FROM component AS component_row
    JOIN public.project_phases AS current_phase
      ON current_phase.id = component_row.id
    JOIN public.project_phases AS neighbor
      ON neighbor.project_id = p_project_id
     AND (
       neighbor.id = current_phase.follows_phase_id
       OR neighbor.follows_phase_id = current_phase.id
     )
  )
  SELECT COALESCE(array_agg(component.id ORDER BY component.id), ARRAY[]::uuid[]),
         count(*),
         COALESCE(bool_or(phase.lane = 'main'), false)
  INTO v_component_ids, v_component_count, v_component_has_main
  FROM component
  JOIN public.project_phases AS phase ON phase.id = component.id;

  SELECT count(*) INTO v_component_edge_count
  FROM public.project_phases AS phase
  WHERE phase.id = ANY(v_component_ids)
    AND phase.follows_phase_id = ANY(v_component_ids);

  IF v_component_edge_count >= v_component_count THEN
    RAISE EXCEPTION 'advance_project_phase: canonical successor chain is cyclic'
      USING ERRCODE = 'check_violation';
  END IF;

  -- A main-containing component owns every unfinished main row. This rejects
  -- legacy pre-chain multiple-main roots without inferring or rewriting edges.
  -- Independent thread-only components remain legal, and completed disconnected
  -- main history is inert.
  IF v_component_has_main AND EXISTS (
    SELECT 1
    FROM public.project_phases AS phase
    WHERE phase.project_id = p_project_id
      AND phase.lane = 'main'
      AND phase.status IN ('pending', 'in_progress', 'delayed')
      AND NOT (phase.id = ANY(v_component_ids))
  ) THEN
    RAISE EXCEPTION 'advance_project_phase: canonical successor is missing'
      USING ERRCODE = 'check_violation';
  END IF;

  -- A phase has one predecessor, so its ancestor path is unique even when an
  -- ancestor has multiple followers. Sibling branches are deliberately absent.
  WITH RECURSIVE ancestors(id) AS (
    SELECT v_target.follows_phase_id
    WHERE v_target.follows_phase_id IS NOT NULL
    UNION
    SELECT parent.follows_phase_id
    FROM ancestors AS ancestor
    JOIN public.project_phases AS parent ON parent.id = ancestor.id
    WHERE parent.project_id = p_project_id
      AND parent.follows_phase_id IS NOT NULL
  )
  SELECT COALESCE(array_agg(id ORDER BY id), ARRAY[]::uuid[])
  INTO v_ancestor_ids
  FROM ancestors;

  -- Walk every directed follower branch. All descendants must still be pending,
  -- but only direct followers are activated by this transition.
  WITH RECURSIVE descendants(id) AS (
    SELECT child.id
    FROM public.project_phases AS child
    WHERE child.project_id = p_project_id
      AND child.follows_phase_id = v_target.id
    UNION
    SELECT child.id
    FROM descendants AS descendant
    JOIN public.project_phases AS child
      ON child.project_id = p_project_id
     AND child.follows_phase_id = descendant.id
  )
  SELECT COALESCE(array_agg(id ORDER BY id), ARRAY[]::uuid[])
  INTO v_descendant_ids
  FROM descendants;

  SELECT COALESCE(array_agg(child.id ORDER BY child.id), ARRAY[]::uuid[]),
         count(*),
         count(*) FILTER (WHERE child.lane = 'main')
  INTO v_direct_child_ids, v_direct_child_count, v_direct_main_count
  FROM public.project_phases AS child
  WHERE child.project_id = p_project_id
    AND child.follows_phase_id = v_target.id;

  IF v_direct_main_count > 1 THEN
    RAISE EXCEPTION 'advance_project_phase: canonical main successor is ambiguous'
      USING ERRCODE = 'check_violation';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.project_phases AS phase
    WHERE phase.id = ANY(v_ancestor_ids)
      AND phase.status <> 'completed'
  ) THEN
    RAISE EXCEPTION 'advance_project_phase: predecessor phases must be completed'
      USING ERRCODE = 'check_violation';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.project_phases AS phase
    WHERE phase.id = ANY(v_descendant_ids)
      AND phase.status <> 'pending'
  ) THEN
    RAISE EXCEPTION 'advance_project_phase: successor phases must be pending'
      USING ERRCODE = 'check_violation';
  END IF;

  v_component_terminal := v_direct_child_count = 0;

  -- Rescan and lock every exact-phase coordination row after the phase locks.
  -- The shared predicate decides: a legacy row rejects only while pending and
  -- phase-blocking, while a Stage-2 row rejects whenever its artifact, option,
  -- snapshot, and receipt evidence is incoherent with its status — so even a
  -- withdrawn/superseded/responded Stage-2 row can still block. A Stage-2 row
  -- still draft or pending blocks unconditionally, coherent or not; under
  -- 00393 a draft never blocked.
  -- New/updated late gates serialize through the companion trigger.
  IF p_expected_status = 'in_progress' THEN
    PERFORM decision.id
    FROM public.client_decisions AS decision
    WHERE decision.phase_id = p_phase_id
    ORDER BY decision.id
    FOR UPDATE;

    SELECT count(*) INTO v_blocker_count
    FROM public.client_decisions AS decision
    WHERE decision.phase_id = p_phase_id
      AND public._client_decision_blocks_phase(decision);

    IF v_blocker_count > 0 THEN
      RAISE EXCEPTION
        'advance_project_phase: % unresolved phase blocker(s)', v_blocker_count
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  -- The lifecycle guard requires both the current function owner and this
  -- project+transaction token. The previous transaction-local value is restored
  -- before returning; the exception handler also restores it on every failure.
  v_guard_prior := current_setting('app.advance_project_phase_token', true);
  v_guard_token := format(
    'advance_project_phase:%s:%s',
    p_project_id,
    pg_catalog.txid_current()
  );
  PERFORM set_config('app.advance_project_phase_token', v_guard_token, true);
  v_guard_set := true;

  IF p_expected_status = 'delayed' THEN
    UPDATE public.project_phases
    SET status = 'in_progress',
        completed_at = NULL,
        updated_at = now()
    WHERE id = p_phase_id
      AND project_id = p_project_id
      AND status = 'delayed'
    RETURNING * INTO v_target;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'advance_project_phase: delayed phase changed during resume'
        USING ERRCODE = 'serialization_failure';
    END IF;

    v_receipt := jsonb_build_object(
      'completed_phase_id', NULL,
      'next_phase_ids', ARRAY[v_target.id]::uuid[],
      'terminal', v_component_terminal
    );
  ELSE
    -- Exact-ID CAS writes. A duplicate or NULL phase_key can never widen either
    -- UPDATE. Every direct follower is activated in the same transaction; deep
    -- descendants and sibling branches remain untouched.
    UPDATE public.project_phases
    SET status = 'completed',
        progress = 100,
        completed_at = now(),
        updated_at = now()
    WHERE id = p_phase_id
      AND project_id = p_project_id
      AND status = 'in_progress'
    RETURNING * INTO v_target;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'advance_project_phase: phase changed during completion'
        USING ERRCODE = 'serialization_failure';
    END IF;

    UPDATE public.project_phases
    SET status = 'in_progress',
        completed_at = NULL,
        updated_at = now()
    WHERE id = ANY(v_direct_child_ids)
      AND project_id = p_project_id
      AND status = 'pending';
    GET DIAGNOSTICS v_rows = ROW_COUNT;

    IF v_rows <> v_direct_child_count THEN
      RAISE EXCEPTION 'advance_project_phase: successor changed during activation'
        USING ERRCODE = 'serialization_failure';
    END IF;

    v_receipt := jsonb_build_object(
      'completed_phase_id', v_target.id,
      'next_phase_ids', v_direct_child_ids,
      'terminal', v_component_terminal
    );
  END IF;

  -- projects.current_phase is a projection of locked lifecycle truth, never a
  -- transition input. Delayed counts as live. Exactly one live main phase names
  -- the pointer; none clears it; multiple live main rows make the whole phase
  -- mutation roll back rather than publishing an arbitrary/sort-derived value.
  SELECT count(*), (array_agg(phase.id ORDER BY phase.id))[1]
  INTO v_live_main_count, v_live_main_id
  FROM public.project_phases AS phase
  WHERE phase.project_id = p_project_id
    AND phase.lane = 'main'
    AND phase.status IN ('in_progress', 'delayed');

  IF v_live_main_count > 1 THEN
    RAISE EXCEPTION 'advance_project_phase: multiple live main phases are unsupported'
      USING ERRCODE = 'check_violation';
  END IF;

  IF v_live_main_count = 1 THEN
    SELECT * INTO STRICT v_live_main
    FROM public.project_phases
    WHERE id = v_live_main_id
      AND project_id = p_project_id;
  END IF;

  UPDATE public.projects
  SET current_phase = CASE
        WHEN v_live_main_count = 0 THEN NULL
        ELSE COALESCE(NULLIF(v_live_main.phase_key, ''), v_live_main.name)
      END,
      updated_at = now()
  WHERE id = p_project_id;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 1 THEN
    RAISE EXCEPTION 'advance_project_phase: project pointer update failed'
      USING ERRCODE = 'serialization_failure';
  END IF;

  PERFORM set_config(
    'app.advance_project_phase_token', COALESCE(v_guard_prior, ''), true
  );
  v_guard_set := false;
  RETURN v_receipt;
EXCEPTION WHEN OTHERS THEN
  IF v_guard_set THEN
    PERFORM set_config(
      'app.advance_project_phase_token', COALESCE(v_guard_prior, ''), true
    );
  END IF;
  RAISE;
END;
$$;

REVOKE ALL ON FUNCTION public.advance_project_phase(uuid, uuid, text)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.advance_project_phase(uuid, uuid, text)
  TO authenticated;

COMMENT ON FUNCTION public.advance_project_phase(uuid, uuid, text) IS
  'Authenticated project/studio-author phase CAS over the exact branching '
  'follows forest. Completes/resumes one target, atomically activates every '
  'direct follower on completion, and derives current_phase from locked live '
  'main truth. Returns only {completed_phase_id,next_phase_ids,terminal}; '
  'terminal is target-branch '
  'terminal, never project closeout.';

-- 00433 workflow read model, with the exact shared blocker predicate.
CREATE OR REPLACE FUNCTION public.get_project_workflow(p_project_id uuid)
RETURNS TABLE (
  phase_id uuid,
  source_proposal_phase_id uuid,
  sort_order integer,
  phase_key text,
  canonical_stage_key text,
  workflow_track text,
  phase_name text,
  phase_status text,
  progress integer,
  lane text,
  follows_phase_id uuid,
  start_date date,
  target_end_date date,
  completed_at timestamptz,
  gate_note text,
  deliverables jsonb,
  template_provenance jsonb,
  advance_blocker_count integer,
  blocks_advance boolean,
  current_blockers jsonb
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_project public.projects%ROWTYPE;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION
      'get_project_workflow requires an authenticated designer'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO v_project
  FROM public.projects
  WHERE id = p_project_id;

  IF NOT FOUND OR NOT public._can_author_proposal(v_project.designer_id) THEN
    RAISE EXCEPTION
      'get_project_workflow: project not found or access denied'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN QUERY
  SELECT phase.id,
         phase.source_proposal_phase_id,
         phase.sort_order,
         phase.phase_key,
         phase.canonical_stage_key,
         phase.workflow_track,
         phase.name,
         phase.status,
         COALESCE(phase.progress, 0),
         phase.lane,
         phase.follows_phase_id,
         phase.start_date,
         phase.target_end_date,
         phase.completed_at,
         phase.gate_condition,
         COALESCE(deliverable_rollup.items, phase.deliverables, '[]'::jsonb),
         CASE
           WHEN phase.source_template_slug IS NULL THEN '{}'::jsonb
           ELSE jsonb_build_object(
             'slug', phase.source_template_slug,
             'version', phase.source_template_version
           )
         END,
         jsonb_array_length(blocker_rollup.phase_items),
         jsonb_array_length(blocker_rollup.phase_items) > 0,
         jsonb_build_object(
           'count',
             jsonb_array_length(blocker_rollup.phase_items)
             + jsonb_array_length(blocker_rollup.task_items)
             + jsonb_array_length(blocker_rollup.ffe_items),
           'phase', blocker_rollup.phase_items,
           'tasks', blocker_rollup.task_items,
           'ffe', blocker_rollup.ffe_items
         )
  FROM public.project_phases AS phase
  LEFT JOIN LATERAL (
    SELECT jsonb_agg(
             jsonb_build_object(
               'sourceDeliverableId', deliverable.id,
               'label', deliverable.label,
               'description', deliverable.description,
               'isRequired', deliverable.is_required,
               'sortOrder', deliverable.sort_order,
               'completedAt', deliverable.completed_at
             )
             ORDER BY deliverable.sort_order, deliverable.id
           ) AS items
    FROM public.proposal_phase_deliverables AS deliverable
    WHERE deliverable.phase_id = phase.source_proposal_phase_id
  ) AS deliverable_rollup ON true
  CROSS JOIN LATERAL (
    SELECT
      COALESCE((
        SELECT jsonb_agg(
                 jsonb_build_object(
                   'id', decision.id,
                   'kind', 'coordination',
                   'title', decision.title,
                   'status', decision.status,
                   'approvalOutcome', (
                     SELECT option.approval_outcome
                     FROM public.client_decision_options AS option
                     WHERE option.decision_id = decision.id
                       AND option.selected
                     ORDER BY option.id
                     LIMIT 1
                   ),
                   'coordinationKind', decision.coordination_kind,
                   'court', decision.court,
                   'dueDate', decision.due_date,
                   'isOverdue',
                     decision.status = 'pending'
                     AND decision.due_date IS NOT NULL
                     AND decision.due_date < now()
                 )
                 ORDER BY decision.due_date NULLS LAST,
                          decision.created_at, decision.id
               )
        FROM public.client_decisions AS decision
        WHERE decision.project_id = phase.project_id
          AND decision.phase_id = phase.id
          AND public._client_decision_blocks_phase(decision)
      ), '[]'::jsonb) AS phase_items,
      COALESCE((
        SELECT jsonb_agg(
                 jsonb_build_object(
                   'id', task.id,
                   'kind', 'task',
                   'title', task.title,
                   'status', task.status,
                   'owner', task.owner,
                   'dueDate', task.due_date,
                   'isOverdue',
                     task.due_date IS NOT NULL
                     AND task.due_date < CURRENT_DATE,
                   'blockedByCoordinationId', task.blocked_by_item_id
                 )
                 ORDER BY task.due_date NULLS LAST,
                          task.sort_order, task.id
               )
        FROM public.project_tasks AS task
        WHERE task.project_id = phase.project_id
          AND task.status = 'blocked'
          AND (
            (
              phase.phase_key IS NOT NULL
              AND task.phase_key = phase.phase_key
              AND (
                SELECT count(*)
                FROM public.project_phases AS same_key
                WHERE same_key.project_id = phase.project_id
                  AND same_key.phase_key = phase.phase_key
              ) = 1
            )
            OR EXISTS (
              SELECT 1
              FROM public.client_decisions AS blocker
              WHERE blocker.id = task.blocked_by_item_id
                AND blocker.project_id = phase.project_id
                AND blocker.phase_id = phase.id
            )
          )
      ), '[]'::jsonb) AS task_items,
      COALESCE((
        SELECT jsonb_agg(
                 jsonb_build_object(
                   'id', item.id,
                   'kind', 'ffe',
                   'title', item.name,
                   'status', item.status,
                   'eta', item.eta,
                   'isOverdue',
                     item.eta IS NOT NULL AND item.eta < CURRENT_DATE,
                   'reason', item.blocked_reason,
                   'blockedByCoordinationId', item.blocked_by_decision_id
                 )
                 ORDER BY item.eta NULLS LAST, item.sort_order, item.id
               )
        FROM public.project_ffe_items AS item
        JOIN public.client_decisions AS blocker
          ON blocker.id = item.blocked_by_decision_id
         AND blocker.project_id = phase.project_id
         AND blocker.phase_id = phase.id
        WHERE item.project_id = phase.project_id
          AND item.blocked
      ), '[]'::jsonb) AS ffe_items
  ) AS blocker_rollup
  WHERE phase.project_id = v_project.id
  ORDER BY phase.sort_order, phase.id;
END;
$$;

REVOKE ALL ON FUNCTION public.get_project_workflow(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_project_workflow(uuid)
  TO authenticated;

COMMENT ON FUNCTION public.get_project_workflow(uuid) IS
  'Designer-authorized ordered project workflow read model. Returns the '
  'existing project_phases lifecycle, configured gate note, deliverables, '
  'template provenance, exact pending phase-decision advancement blockers, '
  'and informational task/FF&E work buckets. Duplicate or NULL phase keys '
  'never attribute a task without an exact linked decision. Overdue is '
  'metadata only and never changes phase state.';

-- ── Sanitized studio/frozen-lead read model ───────────────────────────────

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
            AND confirmation.approver_id = snapshot.required_coapprover_id
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
  'frozen decision lead. Returns immutable artifact/version/hash/question, '
  'explicit impacts, lifecycle/outcome/disposition, aggregate review counts, '
  'lineage, overdue metadata, and timestamps without reviewer identities.';
