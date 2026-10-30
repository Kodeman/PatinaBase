-- ═══════════════════════════════════════════════════════════════════════════
-- 00904 — Deterministic refusals raise PT409 instead of retryable 40001 (K12)
-- ═══════════════════════════════════════════════════════════════════════════
-- PostgREST 14.x re-runs a whole transaction, with no limit and no backoff,
-- whenever the server answers 40001. A deterministic refusal raised as 40001
-- therefore never reaches the caller: the request loops until the gateway's
-- 60 s timeout returns 504 (RC7-e2-2). Kody ruled K12 on 2026-10-29, over
-- docs/design/designer-portal-round8/evidence/rc/rc7-fix2-40001-inventory.md:
--   rows 1–37  deterministic refusals          40001 → PT409 (HTTP 409), message unchanged
--   rows 38–44 post-lock invariants            40001 → XX000 (HTTP 500), message unchanged
--   rows 45–46 transient races                 keep 40001, one-line comment naming the race
--   rows 47–49 found by FIX8, not in the RC-7 inventory: 47–48 stale
--              refusals → PT409, 49 post-lock invariant → XX000
-- Row 35 (_place_product_in_project_v2_00438_impl) is not redefined here: its
-- latest body on this branch (00873:242) no longer carries the raise; the
-- in-progress check moved to place_product_in_project_v2, which raises PT409
-- (00873:120, now 00881:110).
--
-- Graft rule: every body below is copied verbatim from the latest
-- CREATE OR REPLACE on this branch (grep | sort | tail -1, exact name), and
-- its body was checked byte-for-byte against the live prosrc at 00902 before
-- editing. Only the ERRCODE token on the listed lines changed (and, for rows
-- 45–46, one comment line was added). Signatures, SECURITY DEFINER,
-- SET search_path, owner and grants are unchanged; CREATE OR REPLACE keeps
-- owner and ACL. No GRANT/REVOKE, so the legacy-grants seed is unaffected.
-- Rows 47–49 live in renamed impls (00435:432, 00462:2036 ALTER … RENAME):
-- their bodies are the pre-rename CREATE OR REPLACE of the original name,
-- re-emitted under the impl name; header and body otherwise verbatim.
--
-- Pre-flight: function → source file:line of each raise → inventory row → new code
--   _respond_project_approval_checked             00810:674                        rows 1              → PT409
--   _apply_client_decision_authorized             00810:962,1021                   rows 2, 3           → PT409
--   approve_client_signoff                        00564:170                        rows 4              → PT409
--   advance_project_phase                         00464:2494,2682,2706,2720,2763   rows 5, 41, 42, 43, 44 → PT409/XX000
--   _resolve_coordination_item_authorized         00808:2154,2163,2178,2185,2191   rows 6, 7, 8, 9, 10 → PT409
--   apply_phase_template                          00474:132,169                    rows 11, 12         → PT409
--   update_project_phase                          00398:718,803                    rows 13, 38         → PT409/XX000
--   update_proposal_phase                         00399:5871                       rows 14             → PT409
--   remove_proposal_phase                         00399:5975                       rows 15             → PT409
--   publish_client_decision                       00464:928                        rows 16             → PT409
--   extend_and_reopen_client_decision             00464:2010,2019                  rows 17, 18         → PT409
--   update_client_decision                        00415:906                        rows 19             → PT409
--   withdraw_project_approval_decision            00465:666                        rows 20             → PT409
--   supersede_project_approval_decision           00569:891                        rows 21             → PT409
--   field_time_report_decide                      00653:942                        rows 22             → PT409
--   rerate_pending_time_entries                   00797:715                        rows 23             → PT409
--   set_project_operational_status                00399:216                        rows 24             → PT409
--   archive_project                               00399:278                        rows 25             → PT409
--   reassign_project_lead                         00399:340                        rows 26             → PT409
--   create_client_decision                        00415:709                        rows 27             → PT409
--   set_project_decision_authority                00463:1046,1058                  rows 28, 29         → PT409
--   revise_project_ffe_configuration              00810:1972,1991                  rows 30, 31         → PT409
--   approve_product_configuration                 00403:2566                       rows 32             → PT409
--   create_custom_commission_revision             00403:2901                       rows 33             → PT409
--   upsert_product_configuration_schema           00413:287                        rows 34             → PT409
--   _record_project_ffe_receipt_batch_00446_impl  00862:329                        rows 36             → PT409
--   spec_book_bump_spec_version                   00382:24                         rows 37             → PT409
--   delete_project_phase                          00398:963,974                    rows 39, 40         → XX000
--   merge_studio_product                          00830:207                        rows 45             → 40001
--   _spec_book_trade_chapter                      00767:341                        rows 46             → 40001
--   _save_product_configuration_impl              00415:271,282                    rows 47, 48         → PT409  (found by FIX8, not in the RC-7 inventory)
--   _continue_board_in_project_v1_impl            00407:265                        rows 49             → XX000  (found by FIX8, not in the RC-7 inventory)
-- ═══════════════════════════════════════════════════════════════════════════

SET LOCAL lock_timeout = '5s';

-- ───────────────────────────────────────────────────────────────────────────
-- _respond_project_approval_checked — rows 1; grafted from 00810_us37_pricing_approval_log.sql:496
-- ───────────────────────────────────────────────────────────────────────────
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
  -- P-20. The receipt may name a consequence only where one exists, so the
  -- released items are captured BY the same statement that releases them —
  -- the update clears blocked_by_decision_id, so nothing can be read back
  -- afterwards.
  v_released_names text[] := ARRAY[]::text[];
  v_released_count integer := 0;
  v_outcome_word text;
  v_receipt_title text;
  v_receipt_body text;
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

  -- 00810 (SQ-1169 F2, R182): the job label lock comes before the decision
  -- row lock, through an unlocked read of the decision's job. The line
  -- pricing writers take it first too, so an edit lands wholly before or
  -- wholly after the approval this answer may record.
  PERFORM public._ffe_lock_job_labels(decision.project_id)
  FROM public.client_decisions AS decision WHERE decision.id = p_decision_id;

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
      USING ERRCODE = 'PT409';
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
    WITH released AS (
      UPDATE public.project_ffe_items
      SET blocked = false,
          blocked_reason = NULL,
          blocked_by_decision_id = NULL,
          last_status_change_at = now(),
          updated_at = now()
      WHERE blocked_by_decision_id = p_decision_id
        AND project_id = v_decision.project_id
      RETURNING name
    )
    SELECT COALESCE(
             array_agg(btrim(released.name) ORDER BY btrim(released.name)),
             ARRAY[]::text[]
           )
    INTO v_released_names
    FROM released
    WHERE NULLIF(btrim(released.name), '') IS NOT NULL;
    -- 00810: a priced approval records what the client approved.
    IF v_artifact.source_kind IN ('spec_book_artifact', 'budget_version') THEN
      PERFORM public.snapshot_project_pricing(v_decision.project_id, 'project_approval', p_decision_id);
    END IF;
  END IF;
  v_released_count := COALESCE(cardinality(v_released_names), 0);

  v_result := jsonb_build_object(
    'receiptId', v_receipt_id,
    'projectId', v_decision.project_id,
    'decisionId', v_decision.id,
    'optionId', v_option.id,
    'outcome', v_outcome,
    'status', v_decision.status,
    'updatedAt', v_decision.updated_at,
    -- Immutable evidence of what this answer actually let go. The receipt
    -- letter reads it back rather than re-deriving a link the response just
    -- cleared.
    'releasedItemNames', to_jsonb(v_released_names)
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

  -- P-20, the client's half. _enqueue_decision_notification addresses the
  -- DESIGNER (00466: decision_resolved's recipient is designer_id) and writes
  -- one decision_notifications row; the household who just performed the act
  -- heard nothing. notify_client_attention (00534) is the client rail: it
  -- writes the bell row and the push envelope and hands apns-send the push id.
  -- The receipt EMAIL rides decision-resolved-notify, which 00174's trigger
  -- already fires on exactly this transition.
  --
  -- No new notification kind is minted. notify_client_attention derives
  -- notification_log.type from the entity ('decision_attention') and dedupes
  -- the bell row on (user, entity_type, entity_id) while unopened — so the
  -- receipt REPLACES the unread "needs you" line for this same approval
  -- instead of stacking beside it, which is what the record should read.
  -- 'decision_receipt' therefore lives in metadata.kind, where it collides
  -- with no dedupe key.
  v_outcome_word := CASE v_outcome
    WHEN 'approved' THEN 'approved'
    WHEN 'changes_requested' THEN 'returned'
    WHEN 'needs_discussion' THEN 'held'
  END;
  v_receipt_title := 'You ' || v_outcome_word || ' "'
    || v_artifact.artifact_title || '".';
  v_receipt_body := public._project_approval_release_sentence(v_released_names);

  BEGIN
    PERFORM public.notify_client_attention(
      v_snapshot.decision_lead_id,
      'decision',
      p_decision_id,
      v_receipt_title,
      v_receipt_body,
      jsonb_build_object(
        'project_id', v_decision.project_id,
        'kind', 'decision_receipt',
        'outcome', v_outcome,
        'released_item_count', v_released_count
      )
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING '_respond_project_approval_checked: receipt not delivered for %: %',
      p_decision_id, sqlerrm;
  END;

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

-- ───────────────────────────────────────────────────────────────────────────
-- _apply_client_decision_authorized — rows 2, 3; grafted from 00810_us37_pricing_approval_log.sql:896
-- ───────────────────────────────────────────────────────────────────────────
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
  -- 00808 (SQ-1137): the job label lock comes before the decision row lock,
  -- through an unlocked read of the decision's job. It is unconditional: whether
  -- this answer writes an item (status, blocking, the chosen option) is only
  -- settled under the decision row lock.
  PERFORM public._ffe_lock_job_labels(decision.project_id)
  FROM public.client_decisions AS decision WHERE decision.id = p_decision_id;

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
          USING ERRCODE = 'PT409';
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
      USING ERRCODE = 'PT409';
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

    -- 00763 (F18): the scope follows the room. With no room, a 'room' line
    -- becomes 'unassigned'; 'throughout' and 'unassigned' stay as they are.
    UPDATE public.project_ffe_items
    SET product_id = v_option.product_id,
        name = v_option.name,
        project_room_id = v_room_id,
        assignment_scope = CASE
          WHEN v_room_id IS NOT NULL THEN 'room'
          WHEN assignment_scope = 'room' THEN 'unassigned'
          ELSE assignment_scope
        END,
        quantity = COALESCE(v_option.quantity, 1),
        unit_price_cents = COALESCE(v_option.price, 0),
        trade_price_cents = v_trade_price,
        markup_percent = v_markup,
        line_total_cents = COALESCE(v_option.price, 0)
          * COALESCE(v_option.quantity, 1),
        currency = 'USD',
        updated_at = now()
    WHERE source_decision_id = p_decision_id;

    IF NOT FOUND THEN
      INSERT INTO public.project_ffe_items (
        project_id, project_room_id, assignment_scope, product_id, source_decision_id,
        name, item_type, status, quantity, unit_price_cents,
        trade_price_cents, markup_percent, line_total_cents
      ) VALUES (
        v_decision.project_id, v_room_id,
        CASE WHEN v_room_id IS NOT NULL THEN 'room' ELSE 'unassigned' END,
        v_option.product_id, p_decision_id,
        v_option.name, 'fixed', 'specified', COALESCE(v_option.quantity, 1),
        COALESCE(v_option.price, 0), v_trade_price, v_markup,
        COALESCE(v_option.price, 0) * COALESCE(v_option.quantity, 1)
      );
    END IF;
    -- 00810 (SQ-1169 F4): the client approved this one line at the option's price.
    PERFORM public.snapshot_project_pricing(v_decision.project_id, 'client_decision', p_decision_id);

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

-- ───────────────────────────────────────────────────────────────────────────
-- approve_client_signoff — rows 4; grafted from 00564_client_signoff_approval.sql:79
-- ───────────────────────────────────────────────────────────────────────────
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
        USING ERRCODE = 'PT409';
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

-- ───────────────────────────────────────────────────────────────────────────
-- advance_project_phase — rows 5, 41, 42, 43, 44; grafted from 00464_project_approval_lifecycle.sql:2361
-- ───────────────────────────────────────────────────────────────────────────
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
      USING ERRCODE = 'PT409';
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
        USING ERRCODE = 'XX000';
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
        USING ERRCODE = 'XX000';
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
        USING ERRCODE = 'XX000';
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
      USING ERRCODE = 'XX000';
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

-- ───────────────────────────────────────────────────────────────────────────
-- _resolve_coordination_item_authorized — rows 6, 7, 8, 9, 10; grafted from 00808_us37_item_labels.sql:2059
-- ───────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public._resolve_coordination_item_authorized(
  p_item_id uuid,
  p_selected_option_id uuid DEFAULT NULL,
  p_answer text DEFAULT NULL,
  p_revision_id uuid DEFAULT NULL,
  p_next_court text DEFAULT NULL,
  p_actor uuid DEFAULT NULL
)
RETURNS public.client_decisions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_item public.client_decisions%ROWTYPE;
  v_actor uuid := p_actor;
  v_next text;
  v_owner uuid;
  v_client uuid;
  v_authorized_author boolean := false;
  v_retry_authorized boolean := false;
  v_selected_option_id uuid;
  v_approved_revision_id uuid;
  v_revision_status text;
BEGIN
  -- 00808 (SQ-1137): the job label lock comes before the decision row lock.
  PERFORM public._ffe_lock_job_labels(decision.project_id)
  FROM public.client_decisions AS decision WHERE decision.id = p_item_id;

  SELECT * INTO v_item
  FROM public.client_decisions
  WHERE id = p_item_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'coordination item % not found', p_item_id
      USING ERRCODE = 'no_data_found';
  END IF;

  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'coordination resolution requires an actor'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT COALESCE(v_item.designer_id, relationship.designer_id),
         relationship.client_id
  INTO v_owner, v_client
  FROM public.designer_clients AS relationship
  WHERE relationship.id = v_item.designer_client_id;

  v_authorized_author := v_actor = v_owner OR EXISTS (
    SELECT 1
    FROM public.organization_members AS actor_membership
    JOIN public.organization_members AS owner_membership
      ON owner_membership.organization_id = actor_membership.organization_id
    JOIN public.organizations AS organization
      ON organization.id = actor_membership.organization_id
    WHERE actor_membership.user_id = v_actor
      AND actor_membership.status = 'active'
      AND actor_membership.role <> 'guest'
      AND owner_membership.user_id = v_owner
      AND owner_membership.status = 'active'
      AND owner_membership.role <> 'guest'
      AND organization.type = 'design_studio'
      AND organization.status = 'active'
  );

  -- Authorization precedes the idempotent receipt. Otherwise anyone who knew
  -- the UUID of an already-resolved row could use this DEFINER core as a read
  -- bypass after the court had moved.
  v_retry_authorized := v_authorized_author OR v_actor = v_client;

  IF NOT v_retry_authorized THEN
    RAISE EXCEPTION 'not authorized to access coordination item %', p_item_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_next_court IS NOT NULL AND NOT v_authorized_author THEN
    RAISE EXCEPTION 'only an authorized studio author may override next court'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF v_item.status = 'responded' THEN
    IF v_item.coordination_kind = 'selection' THEN
      SELECT option.id INTO v_selected_option_id
      FROM public.client_decision_options AS option
      WHERE option.decision_id = p_item_id AND option.selected = true
      ORDER BY option.id
      LIMIT 1;
      IF p_selected_option_id IS NULL
         OR p_selected_option_id IS DISTINCT FROM v_selected_option_id
         OR p_answer IS NOT NULL
         OR p_revision_id IS NOT NULL
      THEN
        RAISE EXCEPTION 'coordination item % was resolved with another selection',
          p_item_id USING ERRCODE = 'PT409';
      END IF;
    ELSIF v_item.coordination_kind = 'rfi' THEN
      IF btrim(COALESCE(p_answer, '')) = ''
         OR btrim(p_answer) IS DISTINCT FROM btrim(COALESCE(v_item.answer, ''))
         OR p_selected_option_id IS NOT NULL
         OR p_revision_id IS NOT NULL
      THEN
        RAISE EXCEPTION 'coordination item % was resolved with another answer',
          p_item_id USING ERRCODE = 'PT409';
      END IF;
    ELSIF v_item.coordination_kind = 'submittal' THEN
      SELECT revision.id INTO v_approved_revision_id
      FROM public.coordination_item_revisions AS revision
      WHERE revision.decision_id = p_item_id
        AND revision.status = 'approved'
      ORDER BY revision.reviewed_at DESC NULLS LAST, revision.rev_number DESC
      LIMIT 1;
      IF p_revision_id IS NULL
         OR p_revision_id IS DISTINCT FROM v_approved_revision_id
         OR btrim(p_answer) IS DISTINCT FROM btrim(v_item.answer)
         OR p_selected_option_id IS NOT NULL
      THEN
        RAISE EXCEPTION 'coordination item % was resolved with another revision',
          p_item_id USING ERRCODE = 'PT409';
      END IF;
    ELSIF btrim(p_answer) IS DISTINCT FROM btrim(v_item.answer)
          OR p_selected_option_id IS NOT NULL
          OR p_revision_id IS NOT NULL
    THEN
      RAISE EXCEPTION 'coordination item % was resolved with another answer',
        p_item_id USING ERRCODE = 'PT409';
    END IF;
    IF p_next_court IS NOT NULL
       AND p_next_court IS DISTINCT FROM v_item.court
    THEN
      RAISE EXCEPTION 'coordination item % already moved to another court',
        p_item_id USING ERRCODE = 'PT409';
    END IF;
    PERFORM public._enqueue_decision_notification(
      p_item_id, 'decision_resolved'
    );
    RETURN v_item;
  END IF;
  IF v_item.status <> 'pending' THEN
    RAISE EXCEPTION 'coordination item % cannot resolve from status %',
      p_item_id, v_item.status
      USING ERRCODE = 'check_violation';
  END IF;
  IF NOT (
    v_authorized_author
    OR (
      v_actor = v_client
      AND v_item.court = 'client'
      AND v_item.coordination_kind IN ('selection', 'signoff')
    )
  ) THEN
    RAISE EXCEPTION 'not authorized to resolve coordination item %', p_item_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF v_item.coordination_kind = 'selection' THEN
    IF p_selected_option_id IS NULL THEN
      RAISE EXCEPTION 'a selection item requires p_selected_option_id'
        USING ERRCODE = 'check_violation';
    END IF;
    v_item := public._apply_client_decision_authorized(
      p_item_id, p_selected_option_id, v_actor, NULL, NULL, NULL, NULL
    );
  ELSE
    PERFORM set_config('app.client_decision_write_id', p_item_id::text, true);

    IF v_item.coordination_kind = 'rfi' THEN
      IF btrim(COALESCE(p_answer, v_item.answer, '')) = '' THEN
        RAISE EXCEPTION 'an RFI requires a nonblank answer'
          USING ERRCODE = 'check_violation';
      END IF;
      UPDATE public.client_decisions
      SET answer = btrim(COALESCE(p_answer, answer)),
          answered_at = now(),
          answered_by = v_actor,
          status = 'responded',
          responded_at = now(),
          selected_by = v_actor,
          updated_at = now()
      WHERE id = p_item_id;
    ELSIF v_item.coordination_kind = 'submittal' THEN
      IF p_revision_id IS NULL THEN
        RAISE EXCEPTION 'a submittal requires an eligible revision'
          USING ERRCODE = 'check_violation';
      END IF;
      SELECT revision.status INTO v_revision_status
      FROM public.coordination_item_revisions AS revision
      WHERE revision.id = p_revision_id
        AND revision.decision_id = p_item_id
      FOR UPDATE;
      IF NOT FOUND OR v_revision_status NOT IN ('submitted', 'revise_resubmit') THEN
        RAISE EXCEPTION 'revision % is not eligible for submittal %',
          p_revision_id, p_item_id
          USING ERRCODE = 'check_violation';
      END IF;

      UPDATE public.coordination_item_revisions
      SET status = 'approved', reviewed_by = v_actor, reviewed_at = now()
      WHERE id = p_revision_id;

      UPDATE public.client_decisions
      SET answer = COALESCE(p_answer, answer),
          answered_at = now(),
          answered_by = v_actor,
          status = 'responded',
          responded_at = now(),
          selected_by = v_actor,
          updated_at = now()
      WHERE id = p_item_id;
    ELSE
      UPDATE public.client_decisions
      SET answer = COALESCE(p_answer, answer),
          answered_at = CASE WHEN p_answer IS NOT NULL THEN now() ELSE answered_at END,
          answered_by = CASE WHEN p_answer IS NOT NULL THEN v_actor ELSE answered_by END,
          status = 'responded',
          responded_at = now(),
          selected_by = v_actor,
          updated_at = now()
      WHERE id = p_item_id;
    END IF;

    PERFORM set_config('app.client_decision_write_id', '', true);
  END IF;

  UPDATE public.project_ffe_items
  SET blocked = false,
      blocked_reason = NULL,
      blocked_by_decision_id = NULL,
      last_status_change_at = now(),
      updated_at = now()
  WHERE blocked_by_decision_id = p_item_id
    AND project_id = v_item.project_id;

  UPDATE public.project_tasks AS task
  SET status = 'todo', blocked_by_item_id = NULL, updated_at = now()
  WHERE task.blocked_by_item_id = p_item_id
    AND task.status = 'blocked'
    AND (
      task.seq_after_task_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.project_tasks AS predecessor
        WHERE predecessor.id = task.seq_after_task_id
          AND predecessor.status = 'done'
      )
    );

  v_next := COALESCE(p_next_court, public.next_court_for(v_item));
  PERFORM set_config('app.client_decision_write_id', p_item_id::text, true);
  UPDATE public.client_decisions
  SET court = v_next, updated_at = now()
  WHERE id = p_item_id
  RETURNING * INTO v_item;
  PERFORM set_config('app.client_decision_write_id', '', true);

  PERFORM public._enqueue_decision_notification(
    p_item_id, 'decision_resolved'
  );

  RETURN v_item;
END;
$$;

-- ───────────────────────────────────────────────────────────────────────────
-- apply_phase_template — rows 11, 12; grafted from 00474_schedule_template_comember_visibility.sql:22
-- ───────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.apply_phase_template(
  p_proposal_id uuid,
  p_template_slug text,
  p_request_id uuid
)
RETURNS SETOF uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_proposal public.proposals%ROWTYPE;
  v_template public.phase_templates%ROWTYPE;
  v_receipt public.proposal_phase_template_applications%ROWTYPE;
  v_phase_data jsonb;
  v_phase_id uuid;
  v_prev_phase_id uuid;
  v_deliverable jsonb;
  v_gate jsonb;
  v_max_sort integer;
  v_existing_count integer;
  v_prefix_mismatch_count integer;
  v_recovered_prefix_count integer := 0;
  v_existing record;
  v_inserted_phase_ids uuid[] := '{}'::uuid[];
  v_effect_phase_ids uuid[] := '{}'::uuid[];
  v_effective_phases jsonb;
  v_legacy_default_phases jsonb := '[
    {
      "name":"Schematic Design",
      "phase_key":"concept_development",
      "duration_weeks":3,
      "fee_cents":250000,
      "revision_limit":2
    },
    {
      "name":"Design Development",
      "phase_key":"design_refinement",
      "duration_weeks":4,
      "fee_cents":350000,
      "revision_limit":2
    },
    {
      "name":"Procurement Management",
      "phase_key":"procurement",
      "duration_weeks":8,
      "fee_cents":200000,
      "revision_limit":1
    },
    {
      "name":"Installation & Styling",
      "phase_key":"installation",
      "duration_weeks":3,
      "fee_cents":150000,
      "revision_limit":1
    },
    {
      "name":"Completion & Handover",
      "phase_key":"final_walkthrough",
      "duration_weeks":1,
      "fee_cents":50000,
      "revision_limit":0
    }
  ]'::jsonb;
  v_return_id uuid;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'apply_phase_template requires an authenticated user'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_request_id IS NULL THEN
    RAISE EXCEPTION 'p_request_id is required'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  SELECT * INTO v_proposal
  FROM public.proposals
  WHERE id = p_proposal_id
  FOR UPDATE;

  IF NOT FOUND OR NOT public._can_author_proposal(v_proposal.designer_id) THEN
    RAISE EXCEPTION 'proposal % not found or access denied', p_proposal_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO v_receipt
  FROM public.proposal_phase_template_applications
  WHERE proposal_id = p_proposal_id
    AND request_id = p_request_id
  FOR UPDATE;
  IF FOUND THEN
    IF v_receipt.template_slug IS DISTINCT FROM p_template_slug
       OR EXISTS (
         SELECT 1
         FROM unnest(v_receipt.phase_ids) AS receipt_phase(id)
         WHERE NOT EXISTS (
           SELECT 1
           FROM public.proposal_phases AS phase
           WHERE phase.id = receipt_phase.id
             AND phase.proposal_id = p_proposal_id
         )
       )
       OR v_receipt.effect_snapshot IS DISTINCT FROM
            public._proposal_phase_effect_snapshot(
              p_proposal_id, v_receipt.phase_ids
            )
    THEN
      RAISE EXCEPTION 'template request % conflicts with its recorded effect',
        p_request_id
        USING ERRCODE = 'PT409';
    END IF;
    FOREACH v_return_id IN ARRAY v_receipt.phase_ids LOOP
      RETURN NEXT v_return_id;
    END LOOP;
    RETURN;
  END IF;

  -- A named template is one compositional act per proposal, even when two
  -- browser tabs initiate that act with different request UUIDs. The proposal
  -- row lock above serializes both callers. Preserve the later request as an
  -- alias to the first durable effect so its retries remain exact as well.
  SELECT * INTO v_receipt
  FROM public.proposal_phase_template_applications
  WHERE proposal_id = p_proposal_id
    AND template_slug = p_template_slug
  ORDER BY created_at, request_id
  LIMIT 1
  FOR UPDATE;
  IF FOUND THEN
    IF EXISTS (
      SELECT 1
      FROM unnest(v_receipt.phase_ids) AS receipt_phase(id)
      WHERE NOT EXISTS (
        SELECT 1
        FROM public.proposal_phases AS phase
        WHERE phase.id = receipt_phase.id
          AND phase.proposal_id = p_proposal_id
      )
    ) OR v_receipt.effect_snapshot IS DISTINCT FROM
           public._proposal_phase_effect_snapshot(
             p_proposal_id, v_receipt.phase_ids
           )
    THEN
      RAISE EXCEPTION
        'template % was already applied but its recorded effect changed',
        p_template_slug
        USING ERRCODE = 'PT409';
    END IF;

    INSERT INTO public.proposal_phase_template_applications (
      request_id, proposal_id, template_slug, phase_ids,
      effect_snapshot, created_by
    ) VALUES (
      p_request_id, p_proposal_id, p_template_slug,
      v_receipt.phase_ids, v_receipt.effect_snapshot, v_actor
    );

    FOREACH v_return_id IN ARRAY v_receipt.phase_ids LOOP
      RETURN NEXT v_return_id;
    END LOOP;
    RETURN;
  END IF;

  IF v_proposal.status <> 'draft' THEN
    RAISE EXCEPTION 'proposal % is %, so its authored copy is immutable',
      p_proposal_id, v_proposal.status
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO v_template
  FROM public.phase_templates
  WHERE slug = p_template_slug
    AND (is_system OR public._can_author_proposal(designer_id))
  FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'template not found or access denied: %', p_template_slug
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF jsonb_typeof(v_template.phases) <> 'array'
     OR jsonb_array_length(v_template.phases) = 0
  THEN
    RAISE EXCEPTION 'template % has no valid phases', p_template_slug
      USING ERRCODE = 'check_violation';
  END IF;
  v_effective_phases := v_template.phases;

  PERFORM phase.id
  FROM public.proposal_phases AS phase
  WHERE phase.proposal_id = p_proposal_id
  ORDER BY phase.id
  FOR UPDATE;

  SELECT count(*) INTO v_existing_count
  FROM public.proposal_phases
  WHERE proposal_id = p_proposal_id;

  IF p_template_slug = 'patina_six'
     AND v_existing_count BETWEEN 1 AND 5
  THEN
    WITH ordered_existing AS (
      SELECT phase.*,
             row_number() OVER (ORDER BY phase.sort_order, phase.id) AS ordinal,
             lag(phase.id) OVER (
               ORDER BY phase.sort_order, phase.id
             ) AS expected_predecessor_id,
             bool_and(phase.follows_phase_id IS NULL) OVER () AS all_null_legacy
      FROM public.proposal_phases AS phase
      WHERE phase.proposal_id = p_proposal_id
    )
    SELECT count(*) INTO v_prefix_mismatch_count
    FROM ordered_existing AS existing
    JOIN LATERAL (
      SELECT blueprint.value
      FROM jsonb_array_elements(v_legacy_default_phases)
           WITH ORDINALITY AS blueprint(value, ordinal)
      WHERE blueprint.ordinal = existing.ordinal
    ) AS expected ON true
    WHERE existing.lane <> 'main'
       OR (
         NOT existing.all_null_legacy
         AND existing.follows_phase_id
               IS DISTINCT FROM existing.expected_predecessor_id
       )
       OR existing.sort_order <> existing.ordinal - 1
       OR existing.name IS DISTINCT FROM expected.value->>'name'
       OR existing.phase_key IS DISTINCT FROM expected.value->>'phase_key'
       OR existing.duration_weeks IS DISTINCT FROM
            (expected.value->>'duration_weeks')::integer
       OR existing.duration_days IS NOT NULL
       OR existing.fee_cents IS DISTINCT FROM
            (expected.value->>'fee_cents')::integer
       OR existing.revision_limit IS DISTINCT FROM
            (expected.value->>'revision_limit')::integer;

    IF v_prefix_mismatch_count = 0 THEN
      v_prev_phase_id := NULL;
      FOR v_existing IN
        SELECT phase.id
        FROM public.proposal_phases AS phase
        WHERE phase.proposal_id = p_proposal_id
        ORDER BY phase.sort_order, phase.id
      LOOP
        UPDATE public.proposal_phases
        SET follows_phase_id = v_prev_phase_id
        WHERE id = v_existing.id;
        v_prev_phase_id := v_existing.id;
      END LOOP;
      v_recovered_prefix_count := v_existing_count;
      v_effective_phases := v_legacy_default_phases;
    END IF;
  END IF;

  IF v_recovered_prefix_count = 0 THEN
    v_prev_phase_id := public._proposal_phase_main_tail(
      p_proposal_id, 'apply_phase_template precondition'
    );
  ELSE
    PERFORM public._assert_proposal_phase_topology(
      p_proposal_id, 'apply_phase_template recovered prefix'
    );
  END IF;

  SELECT COALESCE(max(sort_order), -1) INTO v_max_sort
  FROM public.proposal_phases
  WHERE proposal_id = p_proposal_id;

  FOR v_phase_data IN
    SELECT blueprint.value
    FROM jsonb_array_elements(v_effective_phases)
         WITH ORDINALITY AS blueprint(value, ordinal)
    WHERE blueprint.ordinal > v_recovered_prefix_count
    ORDER BY blueprint.ordinal
  LOOP
    IF btrim(COALESCE(v_phase_data->>'name', '')) = '' THEN
      RAISE EXCEPTION 'every template phase requires a name'
        USING ERRCODE = 'check_violation';
    END IF;
    v_max_sort := v_max_sort + 1;

    INSERT INTO public.proposal_phases (
      proposal_id, name, phase_key, duration_weeks, duration_days, lane,
      follows_phase_id, fee_cents, revision_limit, sort_order
    ) VALUES (
      p_proposal_id,
      btrim(v_phase_data->>'name'),
      NULLIF(v_phase_data->>'phase_key', ''),
      NULLIF(v_phase_data->>'duration_weeks', '')::integer,
      NULLIF(v_phase_data->>'duration_days', '')::integer,
      COALESCE(NULLIF(v_phase_data->>'lane', ''), 'main'),
      v_prev_phase_id,
      COALESCE(NULLIF(v_phase_data->>'fee_cents', '')::integer, 0),
      COALESCE(NULLIF(v_phase_data->>'revision_limit', '')::integer, 0),
      v_max_sort
    )
    RETURNING id INTO v_phase_id;

    v_inserted_phase_ids := array_append(v_inserted_phase_ids, v_phase_id);
    v_prev_phase_id := v_phase_id;

    IF v_phase_data ? 'deliverables' THEN
      FOR v_deliverable IN
        SELECT value FROM jsonb_array_elements(v_phase_data->'deliverables')
      LOOP
        INSERT INTO public.proposal_phase_deliverables (
          phase_id, label, description, is_required, sort_order
        ) VALUES (
          v_phase_id,
          v_deliverable->>'label',
          v_deliverable->>'description',
          COALESCE((v_deliverable->>'is_required')::boolean, true),
          COALESCE((v_deliverable->>'sort_order')::integer, 0)
        );
      END LOOP;
    END IF;

    IF v_phase_data ? 'default_gates' THEN
      FOR v_gate IN
        SELECT value FROM jsonb_array_elements(v_phase_data->'default_gates')
      LOOP
        INSERT INTO public.proposal_phase_gates (
          phase_id, gate_kind, payload, sort_order
        ) VALUES (
          v_phase_id,
          v_gate->>'gate_kind',
          COALESCE(v_gate->'payload', '{}'::jsonb),
          COALESCE((v_gate->>'sort_order')::integer, 0)
        );
      END LOOP;
    END IF;
  END LOOP;

  PERFORM public._assert_proposal_phase_topology(
    p_proposal_id, 'apply_phase_template result'
  );

  IF v_recovered_prefix_count > 0 THEN
    SELECT COALESCE(
             array_agg(phase.id ORDER BY phase.sort_order, phase.id),
             '{}'::uuid[]
           )
    INTO v_effect_phase_ids
    FROM public.proposal_phases AS phase
    WHERE phase.proposal_id = p_proposal_id;
  ELSE
    v_effect_phase_ids := v_inserted_phase_ids;
  END IF;

  PERFORM public._recompute_proposal_total_locked(p_proposal_id);

  INSERT INTO public.proposal_phase_template_applications (
    request_id, proposal_id, template_slug, phase_ids,
    effect_snapshot, created_by
  ) VALUES (
    p_request_id, p_proposal_id, p_template_slug,
    v_effect_phase_ids,
    public._proposal_phase_effect_snapshot(
      p_proposal_id, v_effect_phase_ids
    ),
    v_actor
  );

  FOREACH v_return_id IN ARRAY v_effect_phase_ids LOOP
    RETURN NEXT v_return_id;
  END LOOP;
END;
$$;

-- ───────────────────────────────────────────────────────────────────────────
-- update_project_phase — rows 13, 38; grafted from 00398_delete_project_phase_atomic_rpc.sql:604
-- ───────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.update_project_phase(
  p_project_id uuid,
  p_phase_id uuid,
  p_expected_updated_at timestamptz,
  p_patch jsonb
)
RETURNS public.project_phases
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_project public.projects%ROWTYPE;
  v_target public.project_phases%ROWTYPE;
  v_updated public.project_phases%ROWTYPE;
  v_follows_phase_id uuid;
  v_guard_prior text;
  v_guard_set boolean := false;
  v_live_main_count integer;
  v_live_main_label text;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'update_project_phase requires an authenticated user'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_expected_updated_at IS NULL THEN
    RAISE EXCEPTION 'update_project_phase: expected_updated_at is required'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  IF p_patch IS NULL
     OR jsonb_typeof(p_patch) <> 'object'
     OR p_patch = '{}'::jsonb THEN
    RAISE EXCEPTION 'update_project_phase: patch must be a non-empty JSON object'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_object_keys(p_patch) AS patch_key(key)
    WHERE patch_key.key NOT IN (
      'name',
      'phase_key',
      'sort_order',
      'duration_days',
      'anchor_date',
      'follows_phase_id',
      'lane'
    )
  ) THEN
    RAISE EXCEPTION 'update_project_phase: patch contains an unsupported field'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  IF p_patch ? 'name'
     AND btrim(COALESCE(p_patch->>'name', '')) = '' THEN
    RAISE EXCEPTION 'update_project_phase: name cannot be blank'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  IF p_patch ? 'phase_key'
     AND jsonb_typeof(p_patch->'phase_key') <> 'null'
     AND btrim(COALESCE(p_patch->>'phase_key', '')) = '' THEN
    RAISE EXCEPTION 'update_project_phase: phase_key cannot be blank'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  IF p_patch ? 'lane'
     AND COALESCE(p_patch->>'lane', '') NOT IN ('main', 'thread') THEN
    RAISE EXCEPTION 'update_project_phase: lane must be main or thread'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  IF p_patch ? 'duration_days'
     AND jsonb_typeof(p_patch->'duration_days') <> 'null'
     AND (p_patch->>'duration_days')::integer <= 0 THEN
    RAISE EXCEPTION 'update_project_phase: duration_days must be positive'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  SELECT * INTO v_project
  FROM public.projects
  WHERE id = p_project_id
  FOR UPDATE;

  IF NOT FOUND OR NOT public._can_author_proposal(v_project.designer_id) THEN
    RAISE EXCEPTION 'update_project_phase: project not found or access denied'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  PERFORM phase.id
  FROM public.project_phases AS phase
  WHERE phase.project_id = p_project_id
  ORDER BY phase.id
  FOR UPDATE;

  SELECT * INTO v_target
  FROM public.project_phases AS phase
  WHERE phase.id = p_phase_id
    AND phase.project_id = p_project_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'update_project_phase: phase does not belong to project'
      USING ERRCODE = 'check_violation';
  END IF;

  -- The caller-observed row timestamp is the compare-and-swap token. Project
  -- locking serializes writers; the loser that wakes after a committed edit
  -- sees a new timestamp and fails instead of silently applying stale intent.
  IF v_target.updated_at IS DISTINCT FROM p_expected_updated_at THEN
    RAISE EXCEPTION
      'update_project_phase: phase changed since it was read'
      USING ERRCODE = 'PT409';
  END IF;

  IF v_target.status <> 'pending'
     AND (
       p_patch ? 'phase_key'
       OR p_patch ? 'lane'
       OR p_patch ? 'follows_phase_id'
     ) THEN
    RAISE EXCEPTION
      'update_project_phase: phase_key, lane, and follows_phase_id are immutable after pending'
      USING ERRCODE = 'check_violation';
  END IF;

  PERFORM public._assert_project_phase_topology(
    p_project_id,
    'update_project_phase'
  );

  v_follows_phase_id := CASE
    WHEN NOT (p_patch ? 'follows_phase_id') THEN v_target.follows_phase_id
    WHEN jsonb_typeof(p_patch->'follows_phase_id') = 'null' THEN NULL
    ELSE (p_patch->>'follows_phase_id')::uuid
  END;

  IF v_follows_phase_id = p_phase_id THEN
    RAISE EXCEPTION 'update_project_phase: a phase cannot follow itself'
      USING ERRCODE = 'check_violation';
  END IF;

  IF v_follows_phase_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.project_phases AS predecessor
    WHERE predecessor.id = v_follows_phase_id
      AND predecessor.project_id = p_project_id
  ) THEN
    RAISE EXCEPTION
      'update_project_phase: predecessor does not belong to project'
      USING ERRCODE = 'check_violation';
  END IF;

  v_guard_prior := current_setting('app.project_phase_topology_token', true);
  PERFORM set_config(
    'app.project_phase_topology_token',
    format('update_project_phase:%s:%s', p_project_id, pg_catalog.txid_current()),
    true
  );
  v_guard_set := true;

  UPDATE public.project_phases AS phase
  SET name = CASE
        WHEN p_patch ? 'name' THEN btrim(p_patch->>'name')
        ELSE phase.name
      END,
      phase_key = CASE
        WHEN NOT (p_patch ? 'phase_key') THEN phase.phase_key
        WHEN jsonb_typeof(p_patch->'phase_key') = 'null' THEN NULL
        ELSE btrim(p_patch->>'phase_key')
      END,
      sort_order = CASE
        WHEN p_patch ? 'sort_order' THEN (p_patch->>'sort_order')::integer
        ELSE phase.sort_order
      END,
      duration_days = CASE
        WHEN NOT (p_patch ? 'duration_days') THEN phase.duration_days
        WHEN jsonb_typeof(p_patch->'duration_days') = 'null' THEN NULL
        ELSE (p_patch->>'duration_days')::integer
      END,
      anchor_date = CASE
        WHEN NOT (p_patch ? 'anchor_date') THEN phase.anchor_date
        WHEN jsonb_typeof(p_patch->'anchor_date') = 'null' THEN NULL
        ELSE (p_patch->>'anchor_date')::date
      END,
      follows_phase_id = v_follows_phase_id,
      lane = CASE
        WHEN p_patch ? 'lane' THEN p_patch->>'lane'
        ELSE phase.lane
      END,
      updated_at = clock_timestamp()
  WHERE phase.id = p_phase_id
    AND phase.project_id = p_project_id
  RETURNING * INTO v_updated;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'update_project_phase: phase changed during update'
      USING ERRCODE = 'XX000';
  END IF;

  PERFORM public._assert_project_phase_topology(
    p_project_id,
    'update_project_phase'
  );

  -- phase_key and lane participate in the live-main projection. Keep the
  -- project pointer transactionally consistent when either one changes.
  IF p_patch ? 'phase_key' OR p_patch ? 'lane' THEN
    SELECT count(*),
           (array_agg(
             COALESCE(NULLIF(phase.phase_key, ''), phase.name)
             ORDER BY phase.id
           ))[1]
    INTO v_live_main_count, v_live_main_label
    FROM public.project_phases AS phase
    WHERE phase.project_id = p_project_id
      AND phase.lane = 'main'
      AND phase.status IN ('in_progress', 'delayed');

    UPDATE public.projects
    SET current_phase = CASE
          WHEN v_live_main_count = 0 THEN NULL
          ELSE v_live_main_label
        END,
        updated_at = now()
    WHERE id = p_project_id;
  END IF;

  PERFORM set_config(
    'app.project_phase_topology_token', COALESCE(v_guard_prior, ''), true
  );
  v_guard_set := false;
  RETURN v_updated;
EXCEPTION WHEN OTHERS THEN
  IF v_guard_set THEN
    PERFORM set_config(
      'app.project_phase_topology_token', COALESCE(v_guard_prior, ''), true
    );
  END IF;
  RAISE;
END;
$$;

-- ───────────────────────────────────────────────────────────────────────────
-- update_proposal_phase — rows 14; grafted from 00399_journey_authority_integrity.sql:5789
-- ───────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.update_proposal_phase(
  p_phase_id uuid,
  p_proposal_id uuid,
  p_patch jsonb,
  p_expected_updated_at timestamptz
)
RETURNS public.proposal_phases
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_proposal public.proposals%ROWTYPE;
  v_phase public.proposal_phases%ROWTYPE;
  v_unknown jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'update_proposal_phase requires an authenticated user'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_patch IS NULL OR jsonb_typeof(p_patch) <> 'object' THEN
    RAISE EXCEPTION 'p_patch must be a JSON object'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;
  IF p_expected_updated_at IS NULL THEN
    RAISE EXCEPTION 'p_expected_updated_at is required'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;
  v_unknown := p_patch - ARRAY[
    'name', 'phase_key', 'duration_weeks', 'fee_cents', 'revision_limit',
    'gate_condition', 'deliverables', 'duration_days', 'anchor_date'
  ];
  IF v_unknown <> '{}'::jsonb THEN
    RAISE EXCEPTION 'unsupported proposal phase patch keys: %', v_unknown
      USING ERRCODE = 'invalid_parameter_value';
  END IF;
  IF p_patch ? 'name'
     AND btrim(COALESCE(p_patch->>'name', '')) = ''
  THEN
    RAISE EXCEPTION 'phase name is required'
      USING ERRCODE = 'check_violation';
  END IF;
  IF p_patch ? 'fee_cents' AND p_patch->>'fee_cents' IS NULL THEN
    RAISE EXCEPTION 'phase fee_cents cannot be null'
      USING ERRCODE = 'check_violation';
  END IF;
  IF p_patch ? 'deliverables'
     AND (
       p_patch->'deliverables' IS NULL
       OR jsonb_typeof(p_patch->'deliverables') <> 'array'
     )
  THEN
    RAISE EXCEPTION 'phase deliverables must be a JSON array'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  SELECT * INTO v_proposal
  FROM public.proposals
  WHERE id = p_proposal_id
  FOR UPDATE;
  IF NOT FOUND OR NOT public._can_author_proposal(v_proposal.designer_id) THEN
    RAISE EXCEPTION 'proposal % not found or access denied', p_proposal_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF v_proposal.status <> 'draft' THEN
    RAISE EXCEPTION 'proposal % is %, so its authored copy is immutable',
      p_proposal_id, v_proposal.status
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO v_phase
  FROM public.proposal_phases
  WHERE id = p_phase_id
    AND proposal_id = p_proposal_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'proposal phase % not found in proposal %',
      p_phase_id, p_proposal_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF v_phase.updated_at IS DISTINCT FROM p_expected_updated_at THEN
    RAISE EXCEPTION 'proposal phase % changed since it was loaded', p_phase_id
      USING ERRCODE = 'PT409';
  END IF;

  UPDATE public.proposal_phases
  SET name = CASE WHEN p_patch ? 'name'
        THEN btrim(p_patch->>'name') ELSE name END,
      phase_key = CASE WHEN p_patch ? 'phase_key'
        THEN NULLIF(btrim(COALESCE(p_patch->>'phase_key', '')), '')
        ELSE phase_key END,
      duration_weeks = CASE WHEN p_patch ? 'duration_weeks'
        THEN NULLIF(p_patch->>'duration_weeks', '')::integer
        ELSE duration_weeks END,
      fee_cents = CASE WHEN p_patch ? 'fee_cents'
        THEN (p_patch->>'fee_cents')::integer ELSE fee_cents END,
      revision_limit = CASE WHEN p_patch ? 'revision_limit'
        THEN NULLIF(p_patch->>'revision_limit', '')::integer
        ELSE revision_limit END,
      gate_condition = CASE WHEN p_patch ? 'gate_condition'
        THEN NULLIF(btrim(COALESCE(p_patch->>'gate_condition', '')), '')
        ELSE gate_condition END,
      deliverables = CASE WHEN p_patch ? 'deliverables'
        THEN p_patch->'deliverables' ELSE deliverables END,
      duration_days = CASE WHEN p_patch ? 'duration_days'
        THEN NULLIF(p_patch->>'duration_days', '')::integer
        ELSE duration_days END,
      anchor_date = CASE WHEN p_patch ? 'anchor_date'
        THEN NULLIF(p_patch->>'anchor_date', '')::date ELSE anchor_date END,
      updated_at = now()
  WHERE id = p_phase_id
    AND proposal_id = p_proposal_id
  RETURNING * INTO v_phase;

  PERFORM public._assert_proposal_phase_topology(
    p_proposal_id, 'update_proposal_phase result'
  );
  PERFORM public._recompute_proposal_total_locked(p_proposal_id);
  RETURN v_phase;
END;
$$;

-- ───────────────────────────────────────────────────────────────────────────
-- remove_proposal_phase — rows 15; grafted from 00399_journey_authority_integrity.sql:5918
-- ───────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.remove_proposal_phase(
  p_phase_id uuid,
  p_proposal_id uuid,
  p_expected_updated_at timestamptz
)
RETURNS public.proposal_phases
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_proposal public.proposals%ROWTYPE;
  v_phase public.proposal_phases%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'remove_proposal_phase requires an authenticated user'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_expected_updated_at IS NULL THEN
    RAISE EXCEPTION 'p_expected_updated_at is required'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  SELECT * INTO v_proposal
  FROM public.proposals
  WHERE id = p_proposal_id
  FOR UPDATE;
  IF NOT FOUND OR NOT public._can_author_proposal(v_proposal.designer_id) THEN
    RAISE EXCEPTION 'proposal % not found or access denied', p_proposal_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF v_proposal.status <> 'draft' THEN
    RAISE EXCEPTION 'proposal % is %, so its authored copy is immutable',
      p_proposal_id, v_proposal.status
      USING ERRCODE = 'check_violation';
  END IF;

  PERFORM phase.id
  FROM public.proposal_phases AS phase
  WHERE phase.proposal_id = p_proposal_id
  ORDER BY phase.id
  FOR UPDATE;
  PERFORM public._assert_proposal_phase_topology(
    p_proposal_id, 'remove_proposal_phase precondition'
  );

  SELECT * INTO v_phase
  FROM public.proposal_phases
  WHERE id = p_phase_id
    AND proposal_id = p_proposal_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'proposal phase % not found in proposal %',
      p_phase_id, p_proposal_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF v_phase.updated_at IS DISTINCT FROM p_expected_updated_at THEN
    RAISE EXCEPTION 'proposal phase % changed since it was loaded', p_phase_id
      USING ERRCODE = 'PT409';
  END IF;

  -- Preserve every direct branch. A main successor takes the deleted phase's
  -- predecessor; thread children are re-anchored to the same predecessor.
  UPDATE public.proposal_phases
  SET follows_phase_id = v_phase.follows_phase_id,
      updated_at = now()
  WHERE proposal_id = p_proposal_id
    AND follows_phase_id = p_phase_id;

  DELETE FROM public.proposal_phases
  WHERE id = p_phase_id
    AND proposal_id = p_proposal_id;

  PERFORM public._assert_proposal_phase_topology(
    p_proposal_id, 'remove_proposal_phase result'
  );
  PERFORM public._recompute_proposal_total_locked(p_proposal_id);
  RETURN v_phase;
END;
$$;

-- ───────────────────────────────────────────────────────────────────────────
-- publish_client_decision — rows 16; grafted from 00464_project_approval_lifecycle.sql:857
-- ───────────────────────────────────────────────────────────────────────────
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
          USING ERRCODE = 'PT409';
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

-- ───────────────────────────────────────────────────────────────────────────
-- extend_and_reopen_client_decision — rows 17, 18; grafted from 00464_project_approval_lifecycle.sql:1958
-- ───────────────────────────────────────────────────────────────────────────
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
      USING ERRCODE = 'PT409';
  END IF;
  IF v_decision.status <> 'expired' THEN
    RAISE EXCEPTION 'decision % cannot extend-and-reopen from status %',
      p_decision_id, v_decision.status
      USING ERRCODE = 'check_violation';
  END IF;
  IF v_decision.updated_at IS DISTINCT FROM p_expected_updated_at THEN
    RAISE EXCEPTION 'decision % changed since it was loaded', p_decision_id
      USING ERRCODE = 'PT409';
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

-- ───────────────────────────────────────────────────────────────────────────
-- update_client_decision — rows 19; grafted from 00415_decision_selection_and_template_privacy.sql:842
-- ───────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.update_client_decision(
  p_decision_id uuid,
  p_patch jsonb DEFAULT '{}'::jsonb,
  p_options jsonb DEFAULT NULL,
  p_expected_updated_at timestamptz DEFAULT NULL
)
RETURNS public.client_decisions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_decision public.client_decisions%ROWTYPE;
  v_result public.client_decisions%ROWTYPE;
  v_target_project_id uuid;
  v_target_party_id uuid;
  v_relationship_client_id uuid;
  v_unknown jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'update_client_decision requires an authenticated user'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_patch IS NULL OR jsonb_typeof(p_patch) <> 'object' THEN
    RAISE EXCEPTION 'p_patch must be a JSON object'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  v_unknown := p_patch - ARRAY[
    'title', 'context', 'due_date', 'linked_phase', 'phase_id', 'room_id',
    'section_key', 'project_id', 'decision_type', 'decision_kind',
    'coordination_kind', 'blocking_status', 'blocks_kind',
    'blocks_milestone_id', 'court', 'court_party_id'
  ];
  IF v_unknown <> '{}'::jsonb THEN
    RAISE EXCEPTION 'unsupported decision patch keys: %', v_unknown
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
  IF v_decision.status NOT IN ('draft', 'pending') THEN
    RAISE EXCEPTION 'decision % cannot be edited from status %',
      p_decision_id, v_decision.status
      USING ERRCODE = 'check_violation';
  END IF;
  IF v_decision.linked_proposal_id IS NOT NULL THEN
    RAISE EXCEPTION 'proposal approval decisions are signature-workflow only'
      USING ERRCODE = 'check_violation';
  END IF;
  IF p_expected_updated_at IS NULL THEN
    RAISE EXCEPTION 'p_expected_updated_at is required'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;
  IF v_decision.updated_at IS DISTINCT FROM p_expected_updated_at
  THEN
    RAISE EXCEPTION 'decision % changed since it was loaded', p_decision_id
      USING ERRCODE = 'PT409';
  END IF;

  IF p_patch ? 'title'
     AND btrim(COALESCE(p_patch->>'title', '')) = ''
  THEN
    RAISE EXCEPTION 'decision title is required'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT client_id INTO v_relationship_client_id
  FROM public.designer_clients
  WHERE id = v_decision.designer_client_id;

  v_target_project_id := CASE
    WHEN p_patch ? 'project_id' THEN NULLIF(p_patch->>'project_id', '')::uuid
    ELSE v_decision.project_id
  END;

  -- A decision's dependency web, room/phase references, and notification
  -- history are project-scoped. Moving the parent without atomically moving
  -- every one of those children creates cross-project blockers. Accept an
  -- echoed project_id from edit forms, but make actual project identity
  -- immutable after creation.
  IF v_target_project_id IS DISTINCT FROM v_decision.project_id THEN
    RAISE EXCEPTION 'decision project is immutable after creation'
      USING ERRCODE = 'check_violation';
  END IF;

  IF p_patch ? 'project_id'
     AND v_target_project_id IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM public.projects AS project
       WHERE project.id = v_target_project_id
         AND project.designer_id IS NOT DISTINCT FROM v_decision.designer_id
         AND project.client_id IS NOT DISTINCT FROM v_relationship_client_id
     )
  THEN
    RAISE EXCEPTION
      'decision project must match its exact designer/client relationship'
      USING ERRCODE = 'check_violation';
  END IF;

  v_target_party_id := CASE
    WHEN p_patch ? 'court_party_id'
      THEN NULLIF(p_patch->>'court_party_id', '')::uuid
    ELSE v_decision.court_party_id
  END;
  IF v_target_party_id IS NOT NULL
     AND (
       v_target_project_id IS NULL
       OR NOT EXISTS (
         SELECT 1 FROM public.project_parties AS party
         WHERE party.id = v_target_party_id
           AND party.project_id = v_target_project_id
       )
     )
  THEN
    RAISE EXCEPTION 'court party must belong to the decision project'
      USING ERRCODE = 'check_violation';
  END IF;

  IF p_options IS NOT NULL THEN
    IF jsonb_typeof(p_options) <> 'array' THEN
      RAISE EXCEPTION 'p_options must be a JSON array'
        USING ERRCODE = 'invalid_parameter_value';
    END IF;
    IF EXISTS (
      SELECT 1
      FROM jsonb_array_elements(p_options) AS option(value)
      WHERE jsonb_typeof(option.value) <> 'object'
         OR btrim(COALESCE(option.value->>'name', '')) = ''
    ) THEN
      RAISE EXCEPTION 'every decision option requires a name'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  PERFORM set_config('app.client_decision_write_id', p_decision_id::text, true);

  UPDATE public.client_decisions
  SET title = CASE WHEN p_patch ? 'title' THEN btrim(p_patch->>'title') ELSE title END,
      context = CASE WHEN p_patch ? 'context' THEN p_patch->>'context' ELSE context END,
      due_date = CASE WHEN p_patch ? 'due_date'
        THEN NULLIF(p_patch->>'due_date', '')::timestamptz ELSE due_date END,
      linked_phase = CASE WHEN p_patch ? 'linked_phase'
        THEN p_patch->>'linked_phase' ELSE linked_phase END,
      phase_id = CASE WHEN p_patch ? 'phase_id'
        THEN NULLIF(p_patch->>'phase_id', '')::uuid ELSE phase_id END,
      room_id = CASE WHEN p_patch ? 'room_id'
        THEN NULLIF(p_patch->>'room_id', '')::uuid ELSE room_id END,
      section_key = CASE WHEN p_patch ? 'section_key'
        THEN p_patch->>'section_key' ELSE section_key END,
      project_id = v_target_project_id,
      decision_type = CASE WHEN p_patch ? 'decision_type'
        THEN p_patch->>'decision_type' ELSE decision_type END,
      decision_kind = CASE WHEN p_patch ? 'decision_kind'
        THEN p_patch->>'decision_kind' ELSE decision_kind END,
      coordination_kind = CASE WHEN p_patch ? 'coordination_kind'
        THEN p_patch->>'coordination_kind' ELSE coordination_kind END,
      blocking_status = CASE WHEN p_patch ? 'blocking_status'
        THEN p_patch->>'blocking_status' ELSE blocking_status END,
      blocks_kind = CASE WHEN p_patch ? 'blocks_kind'
        THEN p_patch->>'blocks_kind' ELSE blocks_kind END,
      blocks_milestone_id = CASE WHEN p_patch ? 'blocks_milestone_id'
        THEN NULLIF(p_patch->>'blocks_milestone_id', '')::uuid
        ELSE blocks_milestone_id END,
      court = CASE WHEN p_patch ? 'court' THEN p_patch->>'court' ELSE court END,
      court_party_id = v_target_party_id,
      updated_at = now()
  WHERE id = p_decision_id;

  IF p_options IS NOT NULL THEN
    DELETE FROM public.client_decision_options
    WHERE decision_id = p_decision_id;

    INSERT INTO public.client_decision_options (
      decision_id, name, image_url, designer_note, is_recommended,
      price, quantity, cost_delta_cents, lead_time_days_delta,
      product_id, approves, configuration_id, selection_snapshot,
      selected, client_note, sort_order
    )
    SELECT
      p_decision_id,
      btrim(option.value->>'name'),
      option.value->>'image_url',
      option.value->>'designer_note',
      COALESCE((option.value->>'is_recommended')::boolean, false),
      NULLIF(option.value->>'price', '')::integer,
      COALESCE(NULLIF(option.value->>'quantity', '')::integer, 1),
      NULLIF(option.value->>'cost_delta_cents', '')::integer,
      NULLIF(option.value->>'lead_time_days_delta', '')::integer,
      NULLIF(option.value->>'product_id', '')::uuid,
      COALESCE((option.value->>'approves')::boolean, false),
      NULLIF(option.value->>'configuration_id', '')::uuid,
      -- Never the caller's array verbatim: the client reads this row.
      public._decision_selection_snapshot_safe(option.value->'selection_snapshot'),
      false,
      NULL,
      COALESCE(NULLIF(option.value->>'sort_order', '')::integer,
               option.ordinality::integer - 1)
    FROM jsonb_array_elements(p_options) WITH ORDINALITY AS option(value, ordinality);
  END IF;

  PERFORM set_config('app.client_decision_write_id', '', true);
  SELECT * INTO v_result FROM public.client_decisions WHERE id = p_decision_id;

  PERFORM public.assert_client_decision_reference_integrity(
    v_result.id,
    v_result.designer_client_id,
    v_result.designer_id,
    v_result.project_id,
    v_result.status,
    v_result.phase_id,
    v_result.room_id,
    v_result.blocks_milestone_id,
    v_result.court_party_id,
    v_result.linked_proposal_id,
    v_result.recommended_option_id
  );

  IF v_result.status = 'pending'
     AND (p_patch <> '{}'::jsonb OR p_options IS NOT NULL)
  THEN
    PERFORM public._enqueue_decision_notification(
      p_decision_id, 'decision_updated'
    );
  END IF;
  RETURN v_result;
END;
$$;

-- ───────────────────────────────────────────────────────────────────────────
-- withdraw_project_approval_decision — rows 20; grafted from 00465_project_approval_notification_traceability.sql:583
-- ───────────────────────────────────────────────────────────────────────────
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
      USING ERRCODE = 'PT409';
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

-- ───────────────────────────────────────────────────────────────────────────
-- supersede_project_approval_decision — rows 21; grafted from 00569_approval_why_viewer_role_and_receipt.sql:763
-- ───────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.supersede_project_approval_decision(
  p_decision_id uuid,
  p_payload jsonb,
  p_expected_updated_at timestamptz,
  p_idempotency_key text,
  p_why text DEFAULT NULL
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
  v_why_given text := NULLIF(btrim(COALESCE(p_why, '')), '');
  v_why text;
  v_why_author_name text;
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

  v_request_hash := public._project_approval_hash(
    jsonb_build_object(
      'decisionId', p_decision_id,
      'payload', p_payload,
      'expectedUpdatedAt', p_expected_updated_at
    )
    -- The why joins the hash only when the composer actually re-asked it.
    -- Adding a null-valued key unconditionally would change the hash of every
    -- supersession minted before this migration, so a key retried across the
    -- deploy would be refused as "reused with a different supersession".
    || CASE
         WHEN v_why_given IS NULL THEN '{}'::jsonb
         ELSE jsonb_build_object('why', v_why_given)
       END
  );
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
      USING ERRCODE = 'PT409';
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
  -- P-13 (r1-B2): a revision is the normal sequel to a RETURNED approval, so
  -- the successor must not lose the line that explained the ask. An explicit
  -- p_why is the designer re-asking in the composer; silence carries the
  -- predecessor's frozen why forward rather than dropping it on the floor.
  v_why := COALESCE(v_why_given, v_old_artifact.why);
  -- An inherited line keeps the name of whoever wrote it; a re-asked line is
  -- the reissuing designer's, so the creator resolves the author afresh.
  v_why_author_name := CASE
    WHEN v_why_given IS NULL THEN v_old_artifact.why_author_name
    ELSE NULL
  END;
  v_create_result := public._create_project_approval_decision_checked(
    v_project_id,
    v_core_payload,
    'supersede-create:' || v_key,
    p_decision_id,
    v_why,
    v_why_author_name
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

-- ───────────────────────────────────────────────────────────────────────────
-- field_time_report_decide — rows 22; grafted from 00653_field_time_reports.sql:870
-- ───────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.field_time_report_decide(
  p_report_id            uuid,
  p_decision             text,
  p_expected_version     integer,
  p_attribute_to_user_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor    uuid := (select auth.uid());
  v_report   public.field_time_reports;
  v_party    text;
  v_minutes  integer;
  v_entry_id uuid;
  v_version  integer;
  v_frozen   integer;
  v_day      date;
  v_now      timestamptz := now();
BEGIN
  IF p_decision IS NULL OR p_decision NOT IN ('accepted', 'rejected') THEN
    RAISE EXCEPTION 'field_time_report_decide: a decision is ''accepted'' or ''rejected'', not %',
      COALESCE(quote_literal(p_decision), 'nothing')
      USING ERRCODE = 'check_violation';
  END IF;

  -- ── Who is asking ──────────────────────────────────────────────────────
  -- SECURITY DEFINER, so RLS is not the gate here and the membership question
  -- is asked out loud. A report this actor cannot read is refused exactly as a
  -- report that does not exist is refused: the error must not become a way to
  -- discover that somebody else's ledger has a row with this id.
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'field_time_report_decide: field_time_report_forbidden — no signed-in actor'
      USING ERRCODE = 'insufficient_privilege',
            DETAIL  = 'field_time_report_forbidden';
  END IF;

  SELECT * INTO v_report FROM public.field_time_reports
   WHERE id = p_report_id FOR UPDATE;

  IF NOT FOUND OR NOT (
    public.is_project_team_member(v_report.project_id)
    OR EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = v_report.project_id
        AND (p.designer_id = v_actor OR public.is_studio_comember(p.designer_id))
    )
  ) THEN
    RAISE EXCEPTION
      'field_time_report_decide: field_time_report_forbidden — % is not on this report''s project', v_actor
      USING ERRCODE = 'insufficient_privilege',
            DETAIL  = 'field_time_report_forbidden';
  END IF;

  -- ── Already settled? ───────────────────────────────────────────────────
  -- Asked BEFORE the version compare-and-swap, because a settled report is
  -- settled whatever version the caller was looking at, and "this one is
  -- already decided" is the more specific thing to be told.
  IF v_report.status <> 'proposed' THEN
    RAISE EXCEPTION
      'field_time_report_decide: field_time_report_decided — report % is already %',
      p_report_id, v_report.status
      USING ERRCODE = 'check_violation',
            DETAIL  = 'field_time_report_decided';
  END IF;

  IF p_expected_version IS DISTINCT FROM v_report.version THEN
    RAISE EXCEPTION
      'field_time_report_decide: field_time_report_stale — expected version %, found %',
      p_expected_version, v_report.version
      USING ERRCODE = 'PT409',
            DETAIL  = 'field_time_report_stale';
  END IF;

  -- ── Attribution, which is the only door to project_time_entries ────────
  IF p_attribute_to_user_id IS NOT NULL THEN
    IF p_decision <> 'accepted' THEN
      RAISE EXCEPTION
        'field_time_report_decide: field_time_report_bad_attribution — only an accepted report can be booked to a teammate'
        USING ERRCODE = 'check_violation',
              DETAIL  = 'field_time_report_bad_attribution';
    END IF;

    -- A member of THIS project: someone on its roster, or the designer whose
    -- project it is. A studio colleague who merely READS the project is not a
    -- booking target — 00177:18 wants the person who worked the hour, and the
    -- portal picks from the project's own people for the same reason.
    IF NOT (
      EXISTS (
        SELECT 1 FROM public.project_team_members tm
        WHERE tm.project_id = v_report.project_id
          AND tm.user_id    = p_attribute_to_user_id
          AND tm.removed_at IS NULL
      )
      OR EXISTS (
        SELECT 1 FROM public.projects p
        WHERE p.id = v_report.project_id
          AND p.designer_id = p_attribute_to_user_id
      )
    ) THEN
      RAISE EXCEPTION
        'field_time_report_decide: field_time_report_bad_attribution — % is not a member of this project',
        p_attribute_to_user_id
        USING ERRCODE = 'check_violation',
              DETAIL  = 'field_time_report_bad_attribution',
              HINT    = 'Hours can only be booked to a profile-backed member of the project the visit belongs to.';
    END IF;

    v_minutes := round(v_report.reported_hours * 60)::integer;
    IF v_minutes < 1 THEN
      -- 00177:20 admits only a positive duration (a NULL one is the desk's one
      -- running-timer slot). A nothing-hours report can be accepted or
      -- rejected; it cannot be booked.
      RAISE EXCEPTION
        'field_time_report_decide: field_time_report_bad_attribution — a report of % hours has no hour to book',
        v_report.reported_hours
        USING ERRCODE = 'check_violation',
              DETAIL  = 'field_time_report_bad_attribution',
              HINT    = 'Accept it as reported, or reject it: project_time_entries holds positive durations only.';
    END IF;

    SELECT pp.display_name INTO v_party
      FROM public.project_parties pp WHERE pp.id = v_report.party_id;

    -- ── WHICH DAY THE HOUR BELONGS TO ──────────────────────────────────────
    -- The VISIT's local day, frozen on the ask at issuance: the daily producer
    -- writes it into sms_prompts.version as YYYYMMDD, which is the identity
    -- this file's daily lock deduplicates on (:156 admits the range;
    -- field-daily/core.ts:1124 passes Number(localToday) for the field zone).
    -- reported_at cannot answer the question on its own: the evening ask rides
    -- the 23:05 UTC tick, so a reply sent after 19:00 CDT (18:00 CST) is
    -- already tomorrow in UTC and would book the hour a calendar day late.
    SELECT sp.version INTO v_frozen
      FROM public.sms_prompts sp WHERE sp.id = v_report.prompt_id;
    IF v_frozen BETWEEN 10000101 AND 99991231 THEN
      v_day := to_date(v_frozen::text, 'YYYYMMDD');
    ELSE
      -- An ask that carries no frozen day (version 1, a direct /field caller's).
      -- The reply's own UTC day is then the only day on offer: HT-13-a declined
      -- a studio timezone column and there still is none (00607:262), so there
      -- is no project zone to read reported_at in.
      v_day := (v_report.reported_at AT TIME ZONE 'UTC')::date;
    END IF;

    -- EXACTLY ONE row, and only the columns a reported day can honestly fill.
    -- started_at is noon UTC of that visit day, which is HT-13-a's ruled
    -- convention for a DATE-ONLY entry (00608:44) — the studio timezone was
    -- declined there, so a day is a day at both offsets a US studio takes.
    -- source is 'field_visit': 00595:65-67 assigns that value to hours a visit
    -- produced ("offered by Patina Field's visit review when a visit closes")
    -- and reserves 'field_manual' for "an hour that is not a visit", which this
    -- hour, bound to the visit's own task, is not.
    -- billable is left at the table's default and no rate is named: pricing is
    -- 00601's classifier's, and payroll and invoicing are not in this story.
    INSERT INTO public.project_time_entries (
      project_id, task_id, user_id, started_at, duration_minutes, notes, source
    )
    VALUES (
      v_report.project_id,
      v_report.task_id,
      p_attribute_to_user_id,
      ((v_day + time '12:00') AT TIME ZONE 'UTC'),
      v_minutes,
      'Reported by text by ' || COALESCE(v_party, 'the trade'),
      'field_visit'
    )
    RETURNING id INTO v_entry_id;
  END IF;

  v_version := v_report.version + 1;

  UPDATE public.field_time_reports
     SET status                   = p_decision,
         decided_by               = v_actor,
         decided_at               = v_now,
         attributed_user_id       = p_attribute_to_user_id,
         attributed_time_entry_id = v_entry_id,
         version                  = v_version
   WHERE id = p_report_id;

  -- Every decision, including the ones that booked nothing.
  INSERT INTO public.field_time_report_decisions (
    report_id, version, decision, decided_by,
    attributed_user_id, attributed_time_entry_id, decided_at
  )
  VALUES (
    p_report_id, v_version, p_decision, v_actor,
    p_attribute_to_user_id, v_entry_id, v_now
  );

  RETURN jsonb_build_object(
    'report_id',                p_report_id,
    'status',                   p_decision,
    'version',                  v_version,
    'decided_by',               v_actor,
    'decided_at',               v_now,
    'reported_hours',           v_report.reported_hours,
    'attributed_user_id',       p_attribute_to_user_id,
    'attributed_time_entry_id', v_entry_id
  );
END;
$$;

-- ───────────────────────────────────────────────────────────────────────────
-- rerate_pending_time_entries — rows 23; grafted from 00797_us36_rerate_pending_hours.sql:675
-- ───────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.rerate_pending_time_entries(
  p_rate_id uuid,
  p_expected_rate_cents integer
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_previous_entry text := current_setting('app.rerate_time_entry_id', true);
  v_previous_rate  text := current_setting('app.rerate_rate_id', true);
  v_refusal  text;
  v_rate     public.studio_member_rates%ROWTYPE;
  v_entry_id uuid;
  v_source   text;
  v_count    integer := 0;
BEGIN
  -- Share-locks the rate row and both seats until this transaction ends.
  v_refusal := public._k8_rate_row_refusal(p_rate_id, auth.uid());
  IF v_refusal = 'superseded' THEN
    RAISE EXCEPTION 'rerate_pending_time_entries: rate % has been superseded and is not this member''s current rate', p_rate_id
      USING ERRCODE = 'check_violation';
  ELSIF v_refusal = 'self_rate' THEN
    RAISE EXCEPTION 'rerate_pending_time_entries: a rate members set for themselves prices their hours only in a studio they own'
      USING ERRCODE = 'insufficient_privilege';
  ELSIF v_refusal IS NOT NULL THEN
    -- An unknown id and another studio's row get the same refusal: the id says
    -- nothing to anyone who does not run the studio it belongs to.
    RAISE EXCEPTION 'rerate_pending_time_entries: only an owner or admin of the studio may price its pending hours'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO v_rate
  FROM public.studio_member_rates
  WHERE id = p_rate_id;
  -- SQ-1079 F2: a same-day correction keeps the row's id, so the id alone does
  -- not say which rate the caller saved.
  IF v_rate.hourly_rate_cents IS DISTINCT FROM p_expected_rate_cents THEN
    RAISE EXCEPTION 'rerate_pending_time_entries: the rate changed since you saved it; save it again to price these hours'
      USING ERRCODE = 'PT409';
  END IF;

  PERFORM set_config('app.rerate_rate_id', v_rate.id::text, true);
  FOR v_entry_id IN
    SELECT entry.id
    FROM public.project_time_entries AS entry
    JOIN public.projects AS project ON project.id = entry.project_id
    WHERE project.studio_id = v_rate.studio_id
      AND entry.user_id     = v_rate.user_id
      AND entry.rate_source = 'none'
      AND entry.invoice_id IS NULL
    ORDER BY entry.started_at, entry.id
    FOR UPDATE OF entry
  LOOP
    PERFORM set_config('app.rerate_time_entry_id', v_entry_id::text, true);
    -- Supplies nothing: hourly_rate_cents is a watched column, so the
    -- classifier re-derives the row under the GUCs above.
    UPDATE public.project_time_entries AS entry
       SET hourly_rate_cents = entry.hourly_rate_cents
     WHERE entry.id = v_entry_id
       AND entry.rate_source = 'none'
       AND entry.invoice_id IS NULL
    RETURNING entry.rate_source INTO v_source;
    -- SQ-1079 F5: counted only if it moved off 'none'. A row the classifier
    -- declined is written unchanged and is not counted.
    IF v_source <> 'none' THEN
      v_count := v_count + 1;
    END IF;
  END LOOP;

  PERFORM set_config('app.rerate_time_entry_id', COALESCE(v_previous_entry, ''), true);
  PERFORM set_config('app.rerate_rate_id', COALESCE(v_previous_rate, ''), true);
  RETURN v_count;
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('app.rerate_time_entry_id', COALESCE(v_previous_entry, ''), true);
  PERFORM set_config('app.rerate_rate_id', COALESCE(v_previous_rate, ''), true);
  RAISE;
END;
$$;

-- ───────────────────────────────────────────────────────────────────────────
-- set_project_operational_status — rows 24; grafted from 00399_journey_authority_integrity.sql:183
-- ───────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.set_project_operational_status(
  p_project_id uuid,
  p_expected_status public.project_status,
  p_status public.project_status
)
RETURNS public.projects
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_project public.projects%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'set_project_operational_status requires an authenticated user'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_status NOT IN ('active', 'on_hold') THEN
    RAISE EXCEPTION 'operational status must be active or on_hold'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  SELECT * INTO v_project
  FROM public.projects
  WHERE id = p_project_id
  FOR UPDATE;

  IF NOT FOUND OR NOT public._can_author_proposal(v_project.designer_id) THEN
    RAISE EXCEPTION 'project % not found or access denied', p_project_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF v_project.status IS DISTINCT FROM p_expected_status THEN
    RAISE EXCEPTION 'project % changed since it was loaded', p_project_id
      USING ERRCODE = 'PT409';
  END IF;
  IF v_project.status = p_status THEN
    RETURN v_project;
  END IF;
  IF (v_project.status, p_status) NOT IN (
    ('active'::public.project_status, 'on_hold'::public.project_status),
    ('on_hold'::public.project_status, 'active'::public.project_status)
  ) THEN
    RAISE EXCEPTION 'project % cannot move from % to %',
      p_project_id, v_project.status, p_status
      USING ERRCODE = 'check_violation';
  END IF;

  PERFORM set_config('app.project_operational_status_id', p_project_id::text, true);
  UPDATE public.projects
  SET status = p_status, updated_at = now()
  WHERE id = p_project_id
  RETURNING * INTO v_project;
  PERFORM set_config('app.project_operational_status_id', '', true);
  RETURN v_project;
END;
$$;

-- ───────────────────────────────────────────────────────────────────────────
-- archive_project — rows 25; grafted from 00399_journey_authority_integrity.sql:247
-- ───────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.archive_project(
  p_project_id uuid,
  p_expected_status public.project_status
)
RETURNS public.projects
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_project public.projects%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'archive_project requires an authenticated user'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO v_project
  FROM public.projects
  WHERE id = p_project_id
  FOR UPDATE;

  IF NOT FOUND OR NOT public._can_author_proposal(v_project.designer_id) THEN
    RAISE EXCEPTION 'project % not found or access denied', p_project_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF v_project.status = 'archived' THEN
    RETURN v_project;
  END IF;
  IF v_project.status IS DISTINCT FROM p_expected_status THEN
    RAISE EXCEPTION 'project % changed since it was loaded', p_project_id
      USING ERRCODE = 'PT409';
  END IF;
  IF v_project.status NOT IN ('active', 'on_hold', 'completed') THEN
    RAISE EXCEPTION 'project % cannot be archived from status %',
      p_project_id, v_project.status
      USING ERRCODE = 'check_violation';
  END IF;

  PERFORM set_config('app.project_archive_id', p_project_id::text, true);
  UPDATE public.projects
  SET status = 'archived', updated_at = now()
  WHERE id = p_project_id
  RETURNING * INTO v_project;
  PERFORM set_config('app.project_archive_id', '', true);
  RETURN v_project;
END;
$$;

-- ───────────────────────────────────────────────────────────────────────────
-- reassign_project_lead — rows 26; grafted from 00399_journey_authority_integrity.sql:301
-- ───────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.reassign_project_lead(
  p_project_id uuid,
  p_expected_designer_id uuid,
  p_new_designer_id uuid
)
RETURNS public.projects
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_project public.projects%ROWTYPE;
  v_old_relationship public.designer_clients%ROWTYPE;
  v_new_relationship_id uuid;
  v_studio_id uuid;
  v_actor_name text;
  v_decision record;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'reassign_project_lead requires an authenticated user'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_new_designer_id IS NULL THEN
    RAISE EXCEPTION 'a new lead designer is required'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  SELECT * INTO v_project
  FROM public.projects
  WHERE id = p_project_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'project % not found or access denied', p_project_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF v_project.designer_id IS DISTINCT FROM p_expected_designer_id THEN
    RAISE EXCEPTION 'project % lead changed since it was loaded', p_project_id
      USING ERRCODE = 'PT409';
  END IF;
  IF v_project.status IN ('completed', 'archived') THEN
    RAISE EXCEPTION 'terminal project lead is immutable'
      USING ERRCODE = 'check_violation';
  END IF;
  SELECT organization.id INTO v_studio_id
    FROM public.organizations AS organization
    JOIN public.organization_members AS old_membership
      ON old_membership.organization_id = organization.id
    JOIN public.organization_members AS new_membership
      ON new_membership.organization_id = organization.id
    WHERE organization.id = v_project.studio_id
      AND old_membership.user_id = v_project.designer_id
      AND old_membership.status = 'active'
      AND old_membership.role <> 'guest'
      AND new_membership.user_id = p_new_designer_id
      AND new_membership.status = 'active'
      AND new_membership.role <> 'guest'
      AND organization.type = 'design_studio'
      AND organization.status = 'active'
      AND (
        v_actor = v_project.designer_id
        OR EXISTS (
          SELECT 1
          FROM public.organization_members AS actor_membership
          WHERE actor_membership.organization_id = organization.id
            AND actor_membership.user_id = v_actor
            AND actor_membership.status = 'active'
            AND actor_membership.role IN ('owner', 'admin')
        )
      )
    ORDER BY organization.id
    LIMIT 1;

  IF v_studio_id IS NULL
     OR NOT EXISTS (
       SELECT 1 FROM public.profiles
       WHERE id = p_new_designer_id AND is_designer IS TRUE
     )
  THEN
    RAISE EXCEPTION
      'lead reassignment requires the current lead or an exact-studio owner/admin and an active designer target'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_new_designer_id = v_project.designer_id THEN
    RETURN v_project;
  END IF;

  SELECT * INTO v_old_relationship
  FROM public.designer_clients
  WHERE (
      v_project.proposal_id IS NOT NULL
      AND id = (
        SELECT proposal.designer_client_id
        FROM public.proposals AS proposal
        WHERE proposal.id = v_project.proposal_id
      )
    ) OR (
      v_project.proposal_id IS NULL
      AND designer_id = v_project.designer_id
      AND client_id = v_project.client_id
    )
  ORDER BY (status <> 'lead') DESC, created_at, id
  LIMIT 1
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'project has no canonical designer-client relationship'
      USING ERRCODE = 'check_violation';
  END IF;

  INSERT INTO public.designer_clients (
    designer_id, client_id, client_name, client_email, nickname,
    status, source, first_project_at, last_project_at
  ) VALUES (
    p_new_designer_id, v_project.client_id,
    v_old_relationship.client_name, v_old_relationship.client_email,
    v_old_relationship.nickname, 'active',
    COALESCE(v_old_relationship.source, 'direct'),
    COALESCE(v_old_relationship.first_project_at, now()), now()
  )
  ON CONFLICT (designer_id, client_id)
    WHERE client_id IS NOT NULL AND status <> 'lead'
  DO UPDATE SET last_project_at = now(), updated_at = now()
  RETURNING id INTO v_new_relationship_id;

  INSERT INTO public.project_team_members (
    project_id, user_id, role, assigned_by, removed_at
  ) VALUES (
    p_project_id, v_project.designer_id, 'previous_lead', v_actor, NULL
  )
  ON CONFLICT (project_id, user_id, role)
  DO UPDATE SET removed_at = NULL, assigned_by = EXCLUDED.assigned_by,
                updated_at = now();

  UPDATE public.project_team_members
  SET removed_at = now(), updated_at = now()
  WHERE project_id = p_project_id
    AND user_id = v_project.designer_id
    AND role = 'lead_designer'
    AND removed_at IS NULL;

  INSERT INTO public.project_team_members (
    project_id, user_id, role, assigned_by, removed_at
  ) VALUES (
    p_project_id, p_new_designer_id, 'lead_designer', v_actor, NULL
  )
  ON CONFLICT (project_id, user_id, role)
  DO UPDATE SET removed_at = NULL, assigned_by = EXCLUDED.assigned_by,
                updated_at = now();

  SELECT full_name INTO v_actor_name
  FROM public.profiles
  WHERE id = v_actor;

  INSERT INTO public.client_activity_log (
    designer_client_id, activity_type, title, metadata, actor_name
  ) VALUES (
    v_old_relationship.id, 'lead_reassigned', 'Lead designer reassigned',
    jsonb_build_object(
      'project_id', p_project_id,
      'old_designer_id', v_project.designer_id,
      'new_designer_id', p_new_designer_id
    ),
    COALESCE(v_actor_name, 'Unknown')
  );

  INSERT INTO public.audit_logs (
    user_id, organization_id, action, resource_type, resource_id,
    old_values, new_values, metadata
  ) VALUES (
    v_actor, v_studio_id, 'project.lead_reassigned', 'project', p_project_id,
    jsonb_build_object('designer_id', v_project.designer_id),
    jsonb_build_object('designer_id', p_new_designer_id),
    jsonb_build_object('via', 'reassign_project_lead')
  );

  PERFORM set_config('app.project_reassignment_id', p_project_id::text, true);
  UPDATE public.projects
  SET designer_id = p_new_designer_id, updated_at = now()
  WHERE id = p_project_id
  RETURNING * INTO v_project;
  PERFORM set_config('app.project_reassignment_id', '', true);

  -- Proposal approvals retain the source proposal relationship as historical
  -- evidence. Other project decisions follow the current lead atomically.
  FOR v_decision IN
    SELECT id
    FROM public.client_decisions
    WHERE project_id = p_project_id
      AND linked_proposal_id IS NULL
    ORDER BY id
    FOR UPDATE
  LOOP
    PERFORM set_config('app.client_decision_write_id', v_decision.id::text, true);
    UPDATE public.client_decisions
    SET designer_id = p_new_designer_id,
        designer_client_id = v_new_relationship_id,
        updated_at = now()
    WHERE id = v_decision.id;
  END LOOP;
  PERFORM set_config('app.client_decision_write_id', '', true);

  RETURN v_project;
END;
$$;

-- ───────────────────────────────────────────────────────────────────────────
-- create_client_decision — rows 27; grafted from 00415_decision_selection_and_template_privacy.sql:507
-- ───────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.create_client_decision(
  p_decision_id uuid,
  p_payload jsonb,
  p_options jsonb DEFAULT '[]'::jsonb,
  p_blocked_ffe_item_ids uuid[] DEFAULT '{}'::uuid[],
  p_blocked_task_ids uuid[] DEFAULT '{}'::uuid[]
)
RETURNS public.client_decisions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_relationship public.designer_clients%ROWTYPE;
  v_decision public.client_decisions%ROWTYPE;
  v_project_id uuid;
  v_status text;
  v_unknown jsonb;
  v_expected_count integer;
  v_matched_count integer;
  v_existing_payload jsonb;
  v_requested_payload jsonb;
  v_existing_options jsonb;
  v_requested_options jsonb;
  v_existing_ffe_ids uuid[];
  v_requested_ffe_ids uuid[];
  v_existing_task_ids uuid[];
  v_requested_task_ids uuid[];
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'create_client_decision requires an authenticated user'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_decision_id IS NULL THEN
    RAISE EXCEPTION 'p_decision_id is required'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;
  IF p_payload IS NULL OR jsonb_typeof(p_payload) <> 'object' THEN
    RAISE EXCEPTION 'p_payload must be a JSON object'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;
  IF jsonb_typeof(COALESCE(p_options, '[]'::jsonb)) <> 'array' THEN
    RAISE EXCEPTION 'p_options must be a JSON array'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  v_unknown := p_payload - ARRAY[
    'designer_client_id', 'project_id', 'title', 'context', 'due_date',
    'linked_phase', 'phase_id', 'room_id', 'section_key', 'decision_type',
    'decision_kind', 'coordination_kind', 'blocking_status', 'blocks_kind',
    'blocks_milestone_id', 'court', 'court_party_id', 'status'
  ];
  IF v_unknown <> '{}'::jsonb THEN
    RAISE EXCEPTION 'unsupported decision payload keys: %', v_unknown
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  IF btrim(COALESCE(p_payload->>'title', '')) = '' THEN
    RAISE EXCEPTION 'decision title is required'
      USING ERRCODE = 'check_violation';
  END IF;
  v_status := COALESCE(NULLIF(p_payload->>'status', ''), 'pending');
  IF v_status NOT IN ('draft', 'pending') THEN
    RAISE EXCEPTION 'new decisions must start draft or pending'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO v_relationship
  FROM public.designer_clients
  WHERE id = NULLIF(p_payload->>'designer_client_id', '')::uuid
  FOR SHARE;
  IF NOT FOUND OR NOT public._can_author_proposal(v_relationship.designer_id) THEN
    RAISE EXCEPTION 'relationship not found or access denied'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF v_status = 'pending' AND v_relationship.client_id IS NULL THEN
    RAISE EXCEPTION 'pending decisions require a registered client recipient'
      USING ERRCODE = 'check_violation';
  END IF;

  v_project_id := NULLIF(p_payload->>'project_id', '')::uuid;

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(COALESCE(p_options, '[]'::jsonb)) AS option(value)
    WHERE jsonb_typeof(option.value) <> 'object'
       OR btrim(COALESCE(option.value->>'name', '')) = ''
       OR COALESCE(NULLIF(option.value->>'quantity', '')::integer, 1) < 1
       OR COALESCE(NULLIF(option.value->>'sort_order', '')::integer, 0) < 0
       OR COALESCE((option.value->>'selected')::boolean, false)
       OR option.value ? 'client_note'
  ) THEN
    RAISE EXCEPTION 'invalid decision option payload'
      USING ERRCODE = 'check_violation';
  END IF;

  -- A reused key is an exact receipt, never permission to overwrite a row.
  SELECT * INTO v_decision
  FROM public.client_decisions
  WHERE id = p_decision_id
  FOR UPDATE;
  IF FOUND THEN
    v_existing_payload := jsonb_build_object(
      'designer_client_id', v_decision.designer_client_id,
      'project_id', v_decision.project_id,
      'title', v_decision.title,
      'context', v_decision.context,
      'due_date', v_decision.due_date,
      'linked_phase', v_decision.linked_phase,
      'phase_id', v_decision.phase_id,
      'room_id', v_decision.room_id,
      'section_key', v_decision.section_key,
      'decision_type', v_decision.decision_type,
      'decision_kind', v_decision.decision_kind,
      'coordination_kind', v_decision.coordination_kind,
      'blocking_status', v_decision.blocking_status,
      'blocks_kind', v_decision.blocks_kind,
      'blocks_milestone_id', v_decision.blocks_milestone_id,
      'court', v_decision.court,
      'court_party_id', v_decision.court_party_id,
      'status', v_decision.status
    );
    v_requested_payload := jsonb_build_object(
      'designer_client_id', v_relationship.id,
      'project_id', v_project_id,
      'title', btrim(p_payload->>'title'),
      'context', p_payload->>'context',
      'due_date', NULLIF(p_payload->>'due_date', '')::timestamptz,
      'linked_phase', p_payload->>'linked_phase',
      'phase_id', NULLIF(p_payload->>'phase_id', '')::uuid,
      'room_id', NULLIF(p_payload->>'room_id', '')::uuid,
      'section_key', p_payload->>'section_key',
      'decision_type', COALESCE(NULLIF(p_payload->>'decision_type', ''), 'product'),
      'decision_kind', COALESCE(NULLIF(p_payload->>'decision_kind', ''), 'choice'),
      'coordination_kind', COALESCE(NULLIF(p_payload->>'coordination_kind', ''), 'selection'),
      'blocking_status', COALESCE(NULLIF(p_payload->>'blocking_status', ''), 'non_blocking'),
      'blocks_kind', COALESCE(NULLIF(p_payload->>'blocks_kind', ''), 'none'),
      'blocks_milestone_id', NULLIF(p_payload->>'blocks_milestone_id', '')::uuid,
      'court', COALESCE(NULLIF(p_payload->>'court', ''), 'client'),
      'court_party_id', NULLIF(p_payload->>'court_party_id', '')::uuid,
      'status', v_status
    );

    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'name', option.name,
      'image_url', option.image_url,
      'designer_note', option.designer_note,
      'is_recommended', COALESCE(option.is_recommended, false),
      'price', option.price,
      'quantity', COALESCE(option.quantity, 1),
      'cost_delta_cents', option.cost_delta_cents,
      'lead_time_days_delta', option.lead_time_days_delta,
      'product_id', option.product_id,
      'approves', COALESCE(option.approves, false),
      'sort_order', COALESCE(option.sort_order, 0)
    ) ORDER BY option.sort_order, option.id), '[]'::jsonb)
    INTO v_existing_options
    FROM public.client_decision_options AS option
    WHERE option.decision_id = p_decision_id;

    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'name', btrim(option.value->>'name'),
      'image_url', option.value->>'image_url',
      'designer_note', option.value->>'designer_note',
      'is_recommended', COALESCE((option.value->>'is_recommended')::boolean, false),
      'price', NULLIF(option.value->>'price', '')::integer,
      'quantity', COALESCE(NULLIF(option.value->>'quantity', '')::integer, 1),
      'cost_delta_cents', NULLIF(option.value->>'cost_delta_cents', '')::integer,
      'lead_time_days_delta', NULLIF(option.value->>'lead_time_days_delta', '')::integer,
      'product_id', NULLIF(option.value->>'product_id', '')::uuid,
      'approves', COALESCE((option.value->>'approves')::boolean, false),
      'sort_order', COALESCE(NULLIF(option.value->>'sort_order', '')::integer,
                             option.ordinality::integer - 1)
    ) ORDER BY COALESCE(NULLIF(option.value->>'sort_order', '')::integer,
                        option.ordinality::integer - 1)), '[]'::jsonb)
    INTO v_requested_options
    FROM jsonb_array_elements(COALESCE(p_options, '[]'::jsonb))
         WITH ORDINALITY AS option(value, ordinality);

    SELECT COALESCE(array_agg(item.id ORDER BY item.id), '{}'::uuid[])
    INTO v_existing_ffe_ids
    FROM public.project_ffe_items AS item
    WHERE item.blocked_by_decision_id = p_decision_id;
    SELECT COALESCE(array_agg(DISTINCT id ORDER BY id), '{}'::uuid[])
    INTO v_requested_ffe_ids
    FROM unnest(COALESCE(p_blocked_ffe_item_ids, '{}'::uuid[])) AS id;
    SELECT COALESCE(array_agg(task.id ORDER BY task.id), '{}'::uuid[])
    INTO v_existing_task_ids
    FROM public.project_tasks AS task
    WHERE task.blocked_by_item_id = p_decision_id;
    SELECT COALESCE(array_agg(DISTINCT id ORDER BY id), '{}'::uuid[])
    INTO v_requested_task_ids
    FROM unnest(COALESCE(p_blocked_task_ids, '{}'::uuid[])) AS id;

    IF NOT public._can_author_proposal(v_decision.designer_id)
       OR v_existing_payload IS DISTINCT FROM v_requested_payload
       OR v_existing_options IS DISTINCT FROM v_requested_options
       OR v_existing_ffe_ids IS DISTINCT FROM v_requested_ffe_ids
       OR v_existing_task_ids IS DISTINCT FROM v_requested_task_ids
    THEN
      RAISE EXCEPTION 'p_decision_id was already used for another decision'
        USING ERRCODE = 'PT409';
    END IF;
    IF v_decision.status = 'pending' THEN
      PERFORM public._enqueue_decision_notification(
        p_decision_id, 'decision_required'
      );
    END IF;
    RETURN v_decision;
  END IF;

  PERFORM public.assert_client_decision_reference_integrity(
    p_decision_id,
    v_relationship.id,
    v_relationship.designer_id,
    v_project_id,
    v_status,
    NULLIF(p_payload->>'phase_id', '')::uuid,
    NULLIF(p_payload->>'room_id', '')::uuid,
    NULLIF(p_payload->>'blocks_milestone_id', '')::uuid,
    NULLIF(p_payload->>'court_party_id', '')::uuid,
    NULL,
    NULL
  );

  IF cardinality(COALESCE(p_blocked_ffe_item_ids, '{}'::uuid[])) > 0 THEN
    PERFORM 1
    FROM public.project_ffe_items AS item
    WHERE item.id = ANY(p_blocked_ffe_item_ids)
    ORDER BY item.id
    FOR UPDATE;
    SELECT count(DISTINCT item.id) INTO v_matched_count
    FROM public.project_ffe_items AS item
    WHERE item.id = ANY(p_blocked_ffe_item_ids)
      AND item.project_id IS NOT DISTINCT FROM v_project_id
      AND (item.blocked_by_decision_id IS NULL
           OR item.blocked_by_decision_id = p_decision_id);
    SELECT count(DISTINCT id) INTO v_expected_count
    FROM unnest(p_blocked_ffe_item_ids) AS id;
    IF v_project_id IS NULL OR v_matched_count <> v_expected_count THEN
      RAISE EXCEPTION 'blocked FF&E items must be available in the decision project'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  IF cardinality(COALESCE(p_blocked_task_ids, '{}'::uuid[])) > 0 THEN
    PERFORM 1
    FROM public.project_tasks AS task
    WHERE task.id = ANY(p_blocked_task_ids)
    ORDER BY task.id
    FOR UPDATE;
    SELECT count(DISTINCT task.id) INTO v_matched_count
    FROM public.project_tasks AS task
    WHERE task.id = ANY(p_blocked_task_ids)
      AND task.project_id IS NOT DISTINCT FROM v_project_id
      AND task.status <> 'done'
      AND (task.blocked_by_item_id IS NULL
           OR task.blocked_by_item_id = p_decision_id);
    SELECT count(DISTINCT id) INTO v_expected_count
    FROM unnest(p_blocked_task_ids) AS id;
    IF v_project_id IS NULL OR v_matched_count <> v_expected_count THEN
      RAISE EXCEPTION 'blocked tasks must be open and available in the decision project'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  INSERT INTO public.client_decisions (
    id, designer_client_id, designer_id, project_id, title, context,
    due_date, linked_phase, phase_id, room_id, section_key, decision_type,
    decision_kind, coordination_kind, blocking_status, blocks_kind,
    blocks_milestone_id, court, court_party_id, status, sent_at
  ) VALUES (
    p_decision_id, v_relationship.id, v_relationship.designer_id, v_project_id,
    btrim(p_payload->>'title'), p_payload->>'context',
    NULLIF(p_payload->>'due_date', '')::timestamptz,
    p_payload->>'linked_phase', NULLIF(p_payload->>'phase_id', '')::uuid,
    NULLIF(p_payload->>'room_id', '')::uuid, p_payload->>'section_key',
    COALESCE(NULLIF(p_payload->>'decision_type', ''), 'product'),
    COALESCE(NULLIF(p_payload->>'decision_kind', ''), 'choice'),
    COALESCE(NULLIF(p_payload->>'coordination_kind', ''), 'selection'),
    COALESCE(NULLIF(p_payload->>'blocking_status', ''), 'non_blocking'),
    COALESCE(NULLIF(p_payload->>'blocks_kind', ''), 'none'),
    NULLIF(p_payload->>'blocks_milestone_id', '')::uuid,
    COALESCE(NULLIF(p_payload->>'court', ''), 'client'),
    NULLIF(p_payload->>'court_party_id', '')::uuid,
    v_status, CASE WHEN v_status = 'pending' THEN now() ELSE NULL END
  ) RETURNING * INTO v_decision;

  INSERT INTO public.client_decision_options (
    decision_id, name, image_url, designer_note, is_recommended,
    price, quantity, cost_delta_cents, lead_time_days_delta,
    product_id, approves, configuration_id, selection_snapshot,
    selected, client_note, sort_order
  )
  SELECT
    p_decision_id, btrim(option.value->>'name'), option.value->>'image_url',
    option.value->>'designer_note',
    COALESCE((option.value->>'is_recommended')::boolean, false),
    NULLIF(option.value->>'price', '')::integer,
    COALESCE(NULLIF(option.value->>'quantity', '')::integer, 1),
    NULLIF(option.value->>'cost_delta_cents', '')::integer,
    NULLIF(option.value->>'lead_time_days_delta', '')::integer,
    NULLIF(option.value->>'product_id', '')::uuid,
    COALESCE((option.value->>'approves')::boolean, false),
    NULLIF(option.value->>'configuration_id', '')::uuid,
    -- Never the caller's array verbatim: the client reads this row.
    public._decision_selection_snapshot_safe(option.value->'selection_snapshot'),
    false, NULL,
    COALESCE(NULLIF(option.value->>'sort_order', '')::integer,
             option.ordinality::integer - 1)
  FROM jsonb_array_elements(COALESCE(p_options, '[]'::jsonb))
       WITH ORDINALITY AS option(value, ordinality);

  UPDATE public.project_ffe_items
  SET blocked = true, blocked_by_decision_id = p_decision_id, updated_at = now()
  WHERE id = ANY(COALESCE(p_blocked_ffe_item_ids, '{}'::uuid[]));

  UPDATE public.project_tasks
  SET status = 'blocked', blocked_by_item_id = p_decision_id, updated_at = now()
  WHERE id = ANY(COALESCE(p_blocked_task_ids, '{}'::uuid[]));

  IF v_status = 'pending' THEN
    PERFORM public._enqueue_decision_notification(
      p_decision_id, 'decision_required'
    );
  END IF;

  SELECT * INTO v_decision FROM public.client_decisions
  WHERE id = p_decision_id;
  RETURN v_decision;
END;
$$;

-- ───────────────────────────────────────────────────────────────────────────
-- set_project_decision_authority — rows 28, 29; grafted from 00463_project_approval_authority_evidence.sql:979
-- ───────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.set_project_decision_authority(
  p_project_id uuid,
  p_decision_lead_id uuid,
  p_required_coapprover_id uuid,
  p_expected_revision integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_project public.projects%ROWTYPE;
  v_authority public.project_decision_authorities%ROWTYPE;
  v_authority_exists boolean;
  v_previous_capability text := current_setting(
    'app.project_decision_authority_project_id', true
  );
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'authority assignment requires an authenticated studio actor'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_expected_revision IS NULL OR p_expected_revision < 0 THEN
    RAISE EXCEPTION 'expected authority revision must be zero or greater'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  SELECT * INTO v_project
  FROM public.projects AS project
  WHERE project.id = p_project_id
  FOR UPDATE;
  IF NOT FOUND OR NOT public.is_design_studio_comember(v_project.designer_id) THEN
    RAISE EXCEPTION 'project not found or authority assignment denied'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF v_project.client_id IS NULL
     OR p_decision_lead_id IS DISTINCT FROM v_project.client_id
  THEN
    RAISE EXCEPTION 'decision lead must be the exact project client'
      USING ERRCODE = 'check_violation';
  END IF;
  IF p_required_coapprover_id IS NOT NULL THEN
    RAISE EXCEPTION 'coapprover requires a durable household-membership source'
      USING ERRCODE = 'check_violation';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles AS profile
    WHERE profile.id = p_decision_lead_id
  ) THEN
    RAISE EXCEPTION 'decision lead profile does not exist'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO v_authority
  FROM public.project_decision_authorities AS authority
  WHERE authority.project_id = p_project_id
  FOR UPDATE;
  v_authority_exists := FOUND;

  PERFORM set_config(
    'app.project_decision_authority_project_id', p_project_id::text, true
  );
  IF NOT v_authority_exists THEN
    IF p_expected_revision <> 0 THEN
      RAISE EXCEPTION 'authority revision conflict: expected 0 for first assignment'
        USING ERRCODE = 'PT409';
    END IF;
    INSERT INTO public.project_decision_authorities (
      project_id, decision_lead_id, required_coapprover_id,
      revision, assigned_by
    ) VALUES (
      p_project_id, p_decision_lead_id, NULL, 1, v_actor
    ) RETURNING * INTO v_authority;
  ELSE
    IF v_authority.revision IS DISTINCT FROM p_expected_revision THEN
      RAISE EXCEPTION 'authority revision conflict: expected %, actual %',
        p_expected_revision, v_authority.revision
        USING ERRCODE = 'PT409';
    END IF;
    UPDATE public.project_decision_authorities
    SET decision_lead_id = p_decision_lead_id,
        required_coapprover_id = NULL,
        revision = v_authority.revision + 1,
        assigned_by = v_actor
    WHERE project_id = p_project_id
    RETURNING * INTO v_authority;
  END IF;
  PERFORM set_config(
    'app.project_decision_authority_project_id',
    COALESCE(v_previous_capability, ''), true
  );

  RETURN jsonb_build_object(
    'projectId', v_authority.project_id,
    'decisionLeadId', v_authority.decision_lead_id,
    'requiredCoapproverId', v_authority.required_coapprover_id,
    'revision', v_authority.revision,
    'assignedBy', v_authority.assigned_by,
    'assignedAt', v_authority.assigned_at,
    'updatedAt', v_authority.updated_at
  );
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config(
    'app.project_decision_authority_project_id',
    COALESCE(v_previous_capability, ''), true
  );
  RAISE;
END;
$$;

-- ───────────────────────────────────────────────────────────────────────────
-- revise_project_ffe_configuration — rows 30, 31; grafted from 00810_us37_pricing_approval_log.sql:1924
-- ───────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.revise_project_ffe_configuration(
  p_project_id uuid,
  p_ffe_item_id uuid,
  p_expected_configuration_id uuid,
  p_expected_configuration_version integer,
  p_expected_snapshot_hash text,
  p_new_configuration_id uuid,
  p_expected_new_version integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_project public.projects;
  v_item public.project_ffe_items;
  v_spec public.project_ffe_specs;
  v_current public.product_configurations;
  v_new public.product_configurations;
  v_new_mode text;
  v_expected_unit integer;
  v_expected_trade integer;
  v_history jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'authentication required' USING errcode = 'insufficient_privilege';
  END IF;
  SELECT * INTO v_project FROM public.projects WHERE id = p_project_id FOR SHARE;
  IF NOT FOUND OR NOT public.can_buy_for_project(v_project.id) THEN
    RAISE EXCEPTION 'project not found or not accessible' USING errcode = 'insufficient_privilege';
  END IF;
  PERFORM public._ffe_lock_job_labels(p_project_id);
  SELECT * INTO v_item FROM public.project_ffe_items
  WHERE id = p_ffe_item_id AND project_id = p_project_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'FF&E line not found in project' USING errcode = 'no_data_found';
  END IF;
  IF v_item.purchase_order_id IS NOT NULL
     OR v_item.status IN ('ordered','production','shipped','delivered','installed') THEN
    RAISE EXCEPTION 'ordered or fulfilled lines require a new FF&E line, not an in-place revision'
      USING errcode = 'object_not_in_prerequisite_state';
  END IF;
  SELECT * INTO v_spec FROM public.project_ffe_specs
  WHERE ffe_item_id = p_ffe_item_id FOR UPDATE;
  IF NOT FOUND OR v_spec.configuration_id IS DISTINCT FROM p_expected_configuration_id
     OR v_spec.configuration_snapshot_hash IS DISTINCT FROM p_expected_snapshot_hash THEN
    RAISE EXCEPTION 'project specification changed in another session'
      USING errcode = 'PT409';
  END IF;
  IF NOT public._can_access_product_configuration(p_expected_configuration_id)
     OR NOT public._can_access_product_configuration(p_new_configuration_id) THEN
    RAISE EXCEPTION 'configuration not found or not accessible' USING errcode = 'insufficient_privilege';
  END IF;
  SELECT * INTO STRICT v_current FROM public.product_configurations
  WHERE id = p_expected_configuration_id FOR SHARE;
  SELECT * INTO STRICT v_new FROM public.product_configurations
  WHERE id = p_new_configuration_id FOR UPDATE;
  SELECT configuration_mode INTO STRICT v_new_mode
  FROM public.products WHERE id = v_new.product_id;
  IF v_new_mode = 'custom' THEN
    RAISE EXCEPTION 'custom commission changes require their approval/issuance lifecycle and a new project line'
      USING errcode = 'object_not_in_prerequisite_state';
  END IF;
  IF v_current.version <> p_expected_configuration_version
     OR v_new.version <> p_expected_new_version THEN
    RAISE EXCEPTION 'configuration version changed in another session'
      USING errcode = 'PT409';
  END IF;
  IF v_spec.configuration_snapshot IS DISTINCT FROM v_current.snapshot
     OR v_current.snapshot_hash IS DISTINCT FROM p_expected_snapshot_hash
     OR v_current.snapshot_hash IS DISTINCT FROM public._configuration_snapshot_hash(v_current.snapshot) THEN
    RAISE EXCEPTION 'current project snapshot does not match its configuration source'
      USING errcode = 'object_not_in_prerequisite_state';
  END IF;
  IF v_new.id = v_current.id OR v_new.status <> 'saved'
     OR v_new.is_library_template
     OR v_new.project_id IS DISTINCT FROM p_project_id
     OR v_new.product_id IS DISTINCT FROM v_item.product_id
     OR (v_new.ffe_item_id IS NOT NULL AND v_new.ffe_item_id <> v_item.id)
     OR NOT v_new.is_valid OR NOT v_new.is_complete
     OR v_new.snapshot_hash IS DISTINCT FROM public._configuration_snapshot_hash(v_new.snapshot) THEN
    RAISE EXCEPTION 'replacement must be a valid, complete saved configuration instantiated for this project and product'
      USING errcode = 'object_not_in_prerequisite_state';
  END IF;

  v_expected_unit := COALESCE(v_new.retail_price_cents, v_new.trade_price_cents);
  v_expected_trade := COALESCE(v_new.trade_price_cents, v_new.retail_price_cents);
  v_history := COALESCE(v_spec.routing_source->'configurationHistory', '[]'::jsonb)
    || jsonb_build_array(jsonb_build_object(
      'fromConfigurationId', v_current.id,
      'fromVersion', v_current.version,
      'fromSnapshotHash', v_current.snapshot_hash,
      'toConfigurationId', v_new.id,
      'toVersion', v_new.version,
      'toSnapshotHash', v_new.snapshot_hash,
      'revisedBy', auth.uid(),
      'revisedAt', now()
    ));
  UPDATE public.product_configurations
  SET ffe_item_id = COALESCE(ffe_item_id, v_item.id), updated_at = now()
  WHERE id = v_new.id;

  PERFORM set_config('patina.configuration_spec_workflow', '00403', true);
  UPDATE public.project_ffe_specs
  SET configuration_id = v_new.id,
      configuration_snapshot = v_new.snapshot,
      configuration_snapshot_hash = v_new.snapshot_hash,
      configuration_locked_at = NULL,
      selected_dimensions = v_new.resolved_dimensions,
      sku = COALESCE(NULLIF(v_new.snapshot#>>'{variant,vendorSku}', ''),
        NULLIF(v_new.snapshot#>>'{variant,sku}', ''), sku),
      material = COALESCE((
        SELECT string_agg(selection->>'valueLabel', ', ' ORDER BY ordinality)
        FROM jsonb_array_elements(COALESCE(v_new.snapshot->'selections', '[]'::jsonb))
             WITH ORDINALITY AS chosen(selection, ordinality)
        WHERE lower(selection->>'groupCode') = 'material'
      ), material),
      finish = COALESCE((
        SELECT string_agg(selection->>'valueLabel', ', ' ORDER BY ordinality)
        FROM jsonb_array_elements(COALESCE(v_new.snapshot->'selections', '[]'::jsonb))
             WITH ORDINALITY AS chosen(selection, ordinality)
        WHERE lower(selection->>'groupCode') = 'finish'
      ), finish),
      color_fabric = COALESCE(NULLIF(public._configuration_com_color_fabric(
        COALESCE(v_new.com_details, v_new.snapshot->'comDetails')), ''), color_fabric),
      routing_source = routing_source || jsonb_build_object('configurationHistory', v_history),
      updated_by = auth.uid(), updated_at = now()
  WHERE id = v_spec.id;
  PERFORM set_config('patina.configuration_spec_workflow', '', true);
  UPDATE public.project_ffe_items
  SET status = 'specified',
      unit_price_cents = v_expected_unit,
      trade_price_cents = v_expected_trade,
      line_total_cents = CASE WHEN v_expected_unit IS NULL THEN NULL
        ELSE quantity * v_expected_unit END,
      updated_at = now()
  WHERE id = v_item.id;

  RETURN jsonb_build_object(
    'projectId', p_project_id,
    'ffeItemId', v_item.id,
    'specId', v_spec.id,
    'configurationId', v_new.id,
    'configurationVersion', v_new.version,
    'configurationSnapshotHash', v_new.snapshot_hash,
    'status', 'specified',
    'requiresApproval', true
  );
END;
$$;

-- ───────────────────────────────────────────────────────────────────────────
-- approve_product_configuration — rows 32; grafted from 00403_product_configuration_foundation.sql:2545
-- ───────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.approve_product_configuration(
  p_configuration_id uuid,
  p_expected_version integer DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_configuration public.product_configurations;
  v_product_mode text;
BEGIN
  IF NOT public._can_access_product_configuration(p_configuration_id) THEN
    RAISE EXCEPTION 'configuration not found or not accessible' USING errcode = 'insufficient_privilege';
  END IF;
  SELECT * INTO STRICT v_configuration
  FROM public.product_configurations WHERE id = p_configuration_id FOR UPDATE;
  SELECT configuration_mode INTO STRICT v_product_mode
  FROM public.products WHERE id = v_configuration.product_id;
  IF p_expected_version IS NOT NULL AND p_expected_version <> v_configuration.version THEN
    RAISE EXCEPTION 'configuration changed in another session' USING errcode = 'PT409';
  END IF;
  IF v_configuration.status <> 'saved' THEN
    RAISE EXCEPTION 'only a saved configuration can be approved' USING errcode = 'object_not_in_prerequisite_state';
  END IF;
  IF v_product_mode = 'custom' THEN
    RAISE EXCEPTION 'custom configurations are approved through the commission approval workflow'
      USING errcode = 'object_not_in_prerequisite_state';
  END IF;
  IF NOT v_configuration.is_valid OR NOT v_configuration.is_complete THEN
    RAISE EXCEPTION 'configuration must be valid and complete before approval'
      USING errcode = 'object_not_in_prerequisite_state';
  END IF;
  UPDATE public.product_configurations
  SET status = 'approved', approved_by = auth.uid(), approved_at = now(), updated_at = now()
  WHERE id = p_configuration_id;
  RETURN public._product_configuration_json(p_configuration_id);
END;
$$;

-- ───────────────────────────────────────────────────────────────────────────
-- create_custom_commission_revision — rows 33; grafted from 00403_product_configuration_foundation.sql:2861
-- ───────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.create_custom_commission_revision(
  p_configuration_id uuid,
  p_input jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_configuration public.product_configurations;
  v_fork public.product_configurations;
  v_previous public.custom_commission_revisions;
  v_revision public.custom_commission_revisions;
  v_brief jsonb;
  v_vendor_id uuid;
  v_latest_configuration_id uuid;
BEGIN
  IF p_input IS NULL OR jsonb_typeof(p_input) <> 'object' THEN
    RAISE EXCEPTION 'revision input must be a JSON object' USING errcode = 'check_violation';
  END IF;
  IF NOT public._can_access_product_configuration(p_configuration_id) THEN
    RAISE EXCEPTION 'configuration not found or not accessible' USING errcode = 'insufficient_privilege';
  END IF;
  SELECT c.* INTO STRICT v_configuration
  FROM public.product_configurations c
  JOIN public.products p ON p.id = c.product_id
  WHERE c.id = p_configuration_id AND p.configuration_mode = 'custom'
  FOR UPDATE OF c;
  IF v_configuration.status <> 'saved' THEN
    RAISE EXCEPTION 'start a new configuration version before revising an approved commission'
      USING errcode = 'object_not_in_prerequisite_state';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(v_configuration.configuration_key::text, 0));
  SELECT c.id INTO v_latest_configuration_id
  FROM public.product_configurations c
  WHERE c.configuration_key = v_configuration.configuration_key
  ORDER BY c.version DESC LIMIT 1 FOR UPDATE;
  IF v_latest_configuration_id IS DISTINCT FROM v_configuration.id THEN
    RAISE EXCEPTION 'configuration is not the latest version; refresh before revising'
      USING errcode = 'PT409';
  END IF;
  v_brief := COALESCE(p_input->'brief', v_configuration.custom_brief);
  IF v_brief IS NULL OR jsonb_typeof(v_brief) <> 'object'
     OR length(btrim(COALESCE(v_brief->>'summary', ''))) = 0 THEN
    RAISE EXCEPTION 'custom commission brief needs a summary' USING errcode = 'check_violation';
  END IF;
  IF v_brief ? 'fabricatorVendorId' THEN
    BEGIN
      v_vendor_id := (v_brief->>'fabricatorVendorId')::uuid;
    EXCEPTION WHEN invalid_text_representation THEN
      RAISE EXCEPTION 'fabricatorVendorId must be a UUID' USING errcode = 'check_violation';
    END;
    IF NOT EXISTS (SELECT 1 FROM public.vendors WHERE id = v_vendor_id) THEN
      RAISE EXCEPTION 'fabricator vendor not found' USING errcode = 'foreign_key_violation';
    END IF;
  END IF;
  SELECT r.* INTO v_previous
  FROM public.custom_commission_revisions r
  JOIN public.product_configurations lineage ON lineage.id = r.configuration_id
  WHERE lineage.configuration_key = v_configuration.configuration_key
  ORDER BY r.revision_number DESC LIMIT 1 FOR UPDATE OF r;
  IF FOUND AND v_previous.status IN ('approved', 'issued') THEN
    RAISE EXCEPTION 'approved or issued commissions must fork through a new saved configuration'
      USING errcode = 'object_not_in_prerequisite_state';
  END IF;
  IF FOUND AND v_previous.status IN ('draft', 'submitted', 'quoted', 'client_review') THEN
    UPDATE public.custom_commission_revisions
    SET status = 'superseded', transition_note = 'Superseded by revision fork', updated_at = now()
    WHERE id = v_previous.id;
  END IF;

  UPDATE public.vendor_quote_requests
  SET status = 'closed', updated_at = now()
  WHERE configuration_id = v_configuration.id AND status = 'draft';

  UPDATE public.product_configurations
  SET status = 'superseded', updated_at = now()
  WHERE id = v_configuration.id;

  INSERT INTO public.product_configurations (
    configuration_key, product_id, product_variant_id, previous_configuration_id,
    project_id, ffe_item_id, owner_user_id, studio_id, version, schema_revision,
    status, name, notes, custom_brief, normalized_selection, component_quantities,
    evaluation, snapshot, snapshot_hash, is_complete, is_valid,
    retail_price_cents, trade_price_cents, lead_time_weeks, resolved_dimensions
  ) VALUES (
    v_configuration.configuration_key, v_configuration.product_id, NULL, v_configuration.id,
    v_configuration.project_id, v_configuration.ffe_item_id, auth.uid(), v_configuration.studio_id,
    v_configuration.version + 1, v_configuration.schema_revision,
    'saved', v_configuration.name, v_configuration.notes, v_brief,
    '{}'::jsonb, '{}'::jsonb, v_configuration.evaluation, v_configuration.snapshot,
    v_configuration.snapshot_hash, v_configuration.is_complete, v_configuration.is_valid,
    v_configuration.retail_price_cents, v_configuration.trade_price_cents,
    v_configuration.lead_time_weeks, v_configuration.resolved_dimensions
  ) RETURNING * INTO v_fork;

  INSERT INTO public.custom_commission_revisions (
    configuration_id, revision_number, previous_revision_id, status,
    brief, drawings, quote, provenance, created_by
  ) VALUES (
    v_fork.id, COALESCE(v_previous.revision_number, 0) + 1,
    v_previous.id, 'draft', v_brief,
    COALESCE(p_input->'drawings', v_brief->'drawings', '[]'::jsonb),
    COALESCE(p_input->'quote', '{}'::jsonb),
    COALESCE(p_input->'provenance', '{}'::jsonb) || jsonb_build_object(
      'forkedFromConfigurationId', v_configuration.id
    ), auth.uid()
  ) RETURNING * INTO v_revision;
  RETURN public._custom_commission_revision_json(v_revision.id);
END;
$$;

-- ───────────────────────────────────────────────────────────────────────────
-- upsert_product_configuration_schema — rows 34; grafted from 00413_configuration_com_and_decision_selection.sql:242
-- ───────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.upsert_product_configuration_schema(
  p_product_id uuid,
  p_input jsonb,
  p_expected_revision integer DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_product public.products;
  v_group jsonb;
  v_value jsonb;
  v_variant jsonb;
  v_component jsonb;
  v_rule jsonb;
  v_group_id uuid;
  v_value_id uuid;
  v_variant_id uuid;
  v_component_id uuid;
  v_rule_id uuid;
  v_ref text;
  v_ref_id uuid;
  v_seen_groups uuid[] := '{}'::uuid[];
  v_seen_values uuid[] := '{}'::uuid[];
  v_seen_variants uuid[] := '{}'::uuid[];
  v_seen_components uuid[] := '{}'::uuid[];
  v_seen_rules uuid[] := '{}'::uuid[];
BEGIN
  IF p_input IS NULL OR jsonb_typeof(p_input) <> 'object' THEN
    RAISE EXCEPTION 'definition input must be a JSON object'
      USING errcode = 'check_violation';
  END IF;
  IF NOT public._can_manage_configurable_product(p_product_id) THEN
    RAISE EXCEPTION 'product not found or not editable'
      USING errcode = 'insufficient_privilege';
  END IF;

  SELECT * INTO STRICT v_product
  FROM public.products WHERE id = p_product_id FOR UPDATE;
  IF p_expected_revision IS NOT NULL
     AND p_expected_revision <> v_product.configuration_revision THEN
    RAISE EXCEPTION 'configuration definition changed in another session (expected %, current %)',
      p_expected_revision, v_product.configuration_revision
      USING errcode = 'PT409';
  END IF;
  IF COALESCE(p_input->>'mode', '') NOT IN ('standard', 'variant', 'configured', 'custom') THEN
    RAISE EXCEPTION 'invalid configuration mode' USING errcode = 'check_violation';
  END IF;
  IF COALESCE(p_input->>'pricingStrategy', 'base_plus_adjustments')
     NOT IN ('base_plus_adjustments', 'component_sum') THEN
    RAISE EXCEPTION 'invalid pricing strategy' USING errcode = 'check_violation';
  END IF;
  IF jsonb_typeof(COALESCE(p_input->'optionGroups', '[]'::jsonb)) <> 'array'
     OR jsonb_typeof(COALESCE(p_input->'variants', '[]'::jsonb)) <> 'array'
     OR jsonb_typeof(COALESCE(p_input->'components', '[]'::jsonb)) <> 'array'
     OR jsonb_typeof(COALESCE(p_input->'rules', '[]'::jsonb)) <> 'array' THEN
    RAISE EXCEPTION 'definition collections must be arrays' USING errcode = 'check_violation';
  END IF;
  IF p_input->>'mode' IN ('standard', 'custom') AND (
       jsonb_array_length(COALESCE(p_input->'optionGroups', '[]'::jsonb)) > 0
       OR jsonb_array_length(COALESCE(p_input->'variants', '[]'::jsonb)) > 0
       OR jsonb_array_length(COALESCE(p_input->'components', '[]'::jsonb)) > 0
       OR jsonb_array_length(COALESCE(p_input->'rules', '[]'::jsonb)) > 0
     ) THEN
    RAISE EXCEPTION '% mode cannot retain option groups, variants, components, or rules', p_input->>'mode'
      USING errcode = 'check_violation';
  END IF;
  IF p_input->>'mode' = 'variant'
     AND jsonb_array_length(COALESCE(p_input->'components', '[]'::jsonb)) > 0 THEN
    RAISE EXCEPTION 'variant mode cannot retain modular components'
      USING errcode = 'check_violation';
  END IF;
  IF p_input->>'mode' = 'configured'
     AND jsonb_array_length(COALESCE(p_input->'variants', '[]'::jsonb)) > 0 THEN
    RAISE EXCEPTION 'configured mode cannot retain exact variants'
      USING errcode = 'check_violation';
  END IF;
  IF COALESCE(p_input->>'pricingStrategy', 'base_plus_adjustments') = 'component_sum'
     AND p_input->>'mode' <> 'configured' THEN
    RAISE EXCEPTION 'component_sum pricing requires configured mode'
      USING errcode = 'check_violation';
  END IF;

  UPDATE public.products
  SET configuration_mode = p_input->>'mode',
      configuration_pricing_strategy = COALESCE(p_input->>'pricingStrategy', 'base_plus_adjustments'),
      configuration_revision = configuration_revision + 1,
      configuration_updated_at = now(),
      updated_at = now()
  WHERE id = p_product_id;

  FOR v_group IN SELECT value FROM jsonb_array_elements(COALESCE(p_input->'optionGroups', '[]'::jsonb)) LOOP
    IF jsonb_typeof(v_group) <> 'object' OR COALESCE(v_group->>'code', '') = '' THEN
      RAISE EXCEPTION 'every option group needs a code' USING errcode = 'check_violation';
    END IF;
    INSERT INTO public.product_option_groups (
      id, product_id, code, name, description, selection_type, required,
      min_selections, max_selections, position
    ) VALUES (
      CASE WHEN COALESCE(v_group->>'id', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        THEN (v_group->>'id')::uuid ELSE extensions.gen_random_uuid() END,
      p_product_id, v_group->>'code', COALESCE(v_group->>'name', v_group->>'code'),
      v_group->>'description', COALESCE(v_group->>'selectionType', 'single'),
      COALESCE((v_group->>'required')::boolean, true),
      COALESCE((v_group->>'minSelections')::integer, CASE WHEN COALESCE((v_group->>'required')::boolean, true) THEN 1 ELSE 0 END),
      COALESCE((v_group->>'maxSelections')::integer, 1),
      COALESCE((v_group->>'position')::integer, 0)
    )
    ON CONFLICT (product_id, code) DO UPDATE SET
      name = EXCLUDED.name,
      description = EXCLUDED.description,
      selection_type = EXCLUDED.selection_type,
      required = EXCLUDED.required,
      min_selections = EXCLUDED.min_selections,
      max_selections = EXCLUDED.max_selections,
      position = EXCLUDED.position,
      updated_at = now()
    RETURNING id INTO v_group_id;
    v_seen_groups := array_append(v_seen_groups, v_group_id);

    IF jsonb_typeof(COALESCE(v_group->'values', '[]'::jsonb)) <> 'array' THEN
      RAISE EXCEPTION 'option group values must be an array' USING errcode = 'check_violation';
    END IF;
    FOR v_value IN SELECT value FROM jsonb_array_elements(COALESCE(v_group->'values', '[]'::jsonb)) LOOP
      INSERT INTO public.product_option_values (
        id, option_group_id, code, label, description, swatch, media,
        retail_price_delta_cents, trade_price_delta_cents, lead_time_delta_weeks,
        allows_com, com_requirements,
        metadata, position, is_active
      ) VALUES (
        CASE WHEN COALESCE(v_value->>'id', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
          THEN (v_value->>'id')::uuid ELSE extensions.gen_random_uuid() END,
        v_group_id, v_value->>'code', COALESCE(v_value->>'label', v_value->>'code'),
        v_value->>'description', v_value->'swatch', COALESCE(v_value->'media', '[]'::jsonb),
        COALESCE((v_value->>'retailPriceDeltaCents')::integer, 0),
        COALESCE((v_value->>'tradePriceDeltaCents')::integer, 0),
        COALESCE((v_value->>'leadTimeDeltaWeeks')::integer, 0),
        COALESCE((v_value->>'allowsCom')::boolean, false),
        COALESCE(v_value->'comRequirements', '{}'::jsonb),
        COALESCE(v_value->'metadata', '{}'::jsonb),
        COALESCE((v_value->>'position')::integer, 0),
        COALESCE((v_value->>'isActive')::boolean, true)
      )
      ON CONFLICT (option_group_id, code) DO UPDATE SET
        label = EXCLUDED.label,
        description = EXCLUDED.description,
        swatch = EXCLUDED.swatch,
        media = EXCLUDED.media,
        retail_price_delta_cents = EXCLUDED.retail_price_delta_cents,
        trade_price_delta_cents = EXCLUDED.trade_price_delta_cents,
        lead_time_delta_weeks = EXCLUDED.lead_time_delta_weeks,
        allows_com = EXCLUDED.allows_com,
        com_requirements = EXCLUDED.com_requirements,
        metadata = EXCLUDED.metadata,
        position = EXCLUDED.position,
        is_active = EXCLUDED.is_active,
        updated_at = now()
      RETURNING id INTO v_value_id;
      v_seen_values := array_append(v_seen_values, v_value_id);
    END LOOP;
  END LOOP;

  IF EXISTS (
    SELECT 1 FROM public.product_option_values ov
    JOIN public.product_option_groups og ON og.id = ov.option_group_id
    WHERE og.product_id = p_product_id
      AND NOT (ov.id = ANY(v_seen_values))
      AND (
        EXISTS (SELECT 1 FROM public.product_configuration_selections s WHERE s.option_value_id = ov.id)
        OR EXISTS (SELECT 1 FROM public.product_variant_values vv WHERE vv.option_value_id = ov.id)
      )
  ) THEN
    RAISE EXCEPTION 'used option values cannot be removed; deactivate them instead'
      USING errcode = 'foreign_key_violation';
  END IF;
  DELETE FROM public.product_option_values ov
  USING public.product_option_groups og
  WHERE ov.option_group_id = og.id AND og.product_id = p_product_id
    AND NOT (ov.id = ANY(v_seen_values));
  DELETE FROM public.product_option_groups
  WHERE product_id = p_product_id AND NOT (id = ANY(v_seen_groups));

  FOR v_variant IN SELECT value FROM jsonb_array_elements(COALESCE(p_input->'variants', '[]'::jsonb)) LOOP
    INSERT INTO public.product_variants (
      id, product_id, code, name, sku, vendor_sku, status,
      retail_price_cents, trade_price_cents, lead_time_weeks,
      dimensions, weight, metadata, is_default
    ) VALUES (
      CASE WHEN COALESCE(v_variant->>'id', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        THEN (v_variant->>'id')::uuid ELSE extensions.gen_random_uuid() END,
      p_product_id, v_variant->>'code', COALESCE(v_variant->>'name', v_variant->>'code'),
      v_variant->>'sku', v_variant->>'vendorSku', COALESCE(v_variant->>'status', 'active'),
      NULLIF(v_variant->>'retailPriceCents', '')::integer,
      NULLIF(v_variant->>'tradePriceCents', '')::integer,
      NULLIF(v_variant->>'leadTimeWeeks', '')::integer,
      v_variant->'dimensions', v_variant->'weight', COALESCE(v_variant->'metadata', '{}'::jsonb),
      COALESCE((v_variant->>'isDefault')::boolean, false)
    )
    ON CONFLICT (product_id, code) DO UPDATE SET
      name = EXCLUDED.name,
      sku = EXCLUDED.sku,
      vendor_sku = EXCLUDED.vendor_sku,
      status = EXCLUDED.status,
      retail_price_cents = EXCLUDED.retail_price_cents,
      trade_price_cents = EXCLUDED.trade_price_cents,
      lead_time_weeks = EXCLUDED.lead_time_weeks,
      dimensions = EXCLUDED.dimensions,
      weight = EXCLUDED.weight,
      metadata = EXCLUDED.metadata,
      is_default = EXCLUDED.is_default,
      updated_at = now()
    RETURNING id INTO v_variant_id;
    v_seen_variants := array_append(v_seen_variants, v_variant_id);

    DELETE FROM public.product_variant_values WHERE variant_id = v_variant_id;
    FOR v_ref IN
      SELECT value #>> '{}'
      FROM jsonb_array_elements(COALESCE(v_variant->'optionValueIds', v_variant->'optionValueCodes', '[]'::jsonb))
    LOOP
      v_ref_id := NULL;
      BEGIN
        v_ref_id := v_ref::uuid;
      EXCEPTION WHEN invalid_text_representation THEN
        SELECT ov.id INTO v_ref_id
        FROM public.product_option_values ov
        JOIN public.product_option_groups og ON og.id = ov.option_group_id
        WHERE og.product_id = p_product_id
          AND (og.code || ':' || ov.code = v_ref OR ov.code = v_ref)
        ORDER BY (og.code || ':' || ov.code = v_ref) DESC
        LIMIT 1;
      END;
      IF v_ref_id IS NULL THEN
        RAISE EXCEPTION 'unknown option value reference % for variant %', v_ref, v_variant->>'code'
          USING errcode = 'foreign_key_violation';
      END IF;
      INSERT INTO public.product_variant_values(variant_id, option_value_id)
      VALUES (v_variant_id, v_ref_id) ON CONFLICT DO NOTHING;
    END LOOP;
  END LOOP;

  IF EXISTS (
    SELECT 1 FROM public.product_variants v
    WHERE v.product_id = p_product_id AND NOT (v.id = ANY(v_seen_variants))
      AND EXISTS (SELECT 1 FROM public.product_configurations c WHERE c.product_variant_id = v.id)
  ) THEN
    RAISE EXCEPTION 'used variants cannot be removed; mark them discontinued instead'
      USING errcode = 'foreign_key_violation';
  END IF;
  DELETE FROM public.product_variants
  WHERE product_id = p_product_id AND NOT (id = ANY(v_seen_variants));

  FOR v_component IN SELECT value FROM jsonb_array_elements(COALESCE(p_input->'components', '[]'::jsonb)) LOOP
    INSERT INTO public.product_components (
      id, product_id, code, name, description, component_type, handedness,
      min_quantity, max_quantity, default_quantity, retail_price_cents,
      trade_price_cents, lead_time_weeks, dimensions, metadata, position, is_active
    ) VALUES (
      CASE WHEN COALESCE(v_component->>'id', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        THEN (v_component->>'id')::uuid ELSE extensions.gen_random_uuid() END,
      p_product_id, v_component->>'code', COALESCE(v_component->>'name', v_component->>'code'),
      v_component->>'description', COALESCE(v_component->>'componentType', 'module'),
      COALESCE(v_component->>'handedness', 'none'),
      COALESCE((v_component->>'minQuantity')::integer, 0),
      NULLIF(v_component->>'maxQuantity', '')::integer,
      COALESCE((v_component->>'defaultQuantity')::integer, 0),
      COALESCE((v_component->>'retailPriceCents')::integer, 0),
      COALESCE((v_component->>'tradePriceCents')::integer, 0),
      COALESCE((v_component->>'leadTimeWeeks')::integer, 0),
      v_component->'dimensions', COALESCE(v_component->'metadata', '{}'::jsonb),
      COALESCE((v_component->>'position')::integer, 0),
      COALESCE((v_component->>'isActive')::boolean, true)
    )
    ON CONFLICT (product_id, code) DO UPDATE SET
      name = EXCLUDED.name,
      description = EXCLUDED.description,
      component_type = EXCLUDED.component_type,
      handedness = EXCLUDED.handedness,
      min_quantity = EXCLUDED.min_quantity,
      max_quantity = EXCLUDED.max_quantity,
      default_quantity = EXCLUDED.default_quantity,
      retail_price_cents = EXCLUDED.retail_price_cents,
      trade_price_cents = EXCLUDED.trade_price_cents,
      lead_time_weeks = EXCLUDED.lead_time_weeks,
      dimensions = EXCLUDED.dimensions,
      metadata = EXCLUDED.metadata,
      position = EXCLUDED.position,
      is_active = EXCLUDED.is_active,
      updated_at = now()
    RETURNING id INTO v_component_id;
    v_seen_components := array_append(v_seen_components, v_component_id);
  END LOOP;
  IF EXISTS (
    SELECT 1 FROM public.product_components c
    WHERE c.product_id = p_product_id AND NOT (c.id = ANY(v_seen_components))
      AND EXISTS (SELECT 1 FROM public.product_configuration_components cc WHERE cc.component_id = c.id)
  ) THEN
    RAISE EXCEPTION 'used components cannot be removed; deactivate them instead'
      USING errcode = 'foreign_key_violation';
  END IF;
  DELETE FROM public.product_components
  WHERE product_id = p_product_id AND NOT (id = ANY(v_seen_components));

  FOR v_rule IN SELECT value FROM jsonb_array_elements(COALESCE(p_input->'rules', '[]'::jsonb)) LOOP
    IF jsonb_typeof(COALESCE(v_rule->'condition', '{}'::jsonb)) <> 'object'
       OR jsonb_typeof(COALESCE(v_rule->'effect', '{}'::jsonb)) <> 'object'
       OR (v_rule->'condition' ? 'selectedOptionValues' AND jsonb_typeof(v_rule->'condition'->'selectedOptionValues') <> 'object')
       OR (v_rule->'condition' ? 'notSelectedOptionValues' AND jsonb_typeof(v_rule->'condition'->'notSelectedOptionValues') <> 'object')
       OR (v_rule->'condition' ? 'components' AND jsonb_typeof(v_rule->'condition'->'components') <> 'object')
       OR (v_rule->'effect' ? 'requiredOptionValues' AND jsonb_typeof(v_rule->'effect'->'requiredOptionValues') <> 'object')
       OR (v_rule->'effect' ? 'requiredComponents' AND jsonb_typeof(v_rule->'effect'->'requiredComponents') <> 'object')
       OR (v_rule->'effect' ? 'dimensions' AND jsonb_typeof(v_rule->'effect'->'dimensions') <> 'object')
       OR (v_rule->'effect' ? 'allowed' AND jsonb_typeof(v_rule->'effect'->'allowed') <> 'boolean')
       OR (v_rule->'effect' ? 'priceOnRequest' AND jsonb_typeof(v_rule->'effect'->'priceOnRequest') <> 'boolean')
       OR (v_rule->'effect' ? 'retailPriceDeltaCents' AND jsonb_typeof(v_rule->'effect'->'retailPriceDeltaCents') <> 'number')
       OR (v_rule->'effect' ? 'tradePriceDeltaCents' AND jsonb_typeof(v_rule->'effect'->'tradePriceDeltaCents') <> 'number')
       OR (v_rule->'effect' ? 'leadTimeDeltaWeeks' AND jsonb_typeof(v_rule->'effect'->'leadTimeDeltaWeeks') <> 'number') THEN
      RAISE EXCEPTION 'rule % has malformed condition/effect JSON', COALESCE(v_rule->>'code', '<unknown>')
        USING errcode = 'check_violation';
    END IF;
    INSERT INTO public.product_configuration_rules (
      id, product_id, code, name, rule_type, condition, effect, message, priority, is_active
    ) VALUES (
      CASE WHEN COALESCE(v_rule->>'id', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        THEN (v_rule->>'id')::uuid ELSE extensions.gen_random_uuid() END,
      p_product_id, v_rule->>'code', COALESCE(v_rule->>'name', v_rule->>'code'),
      v_rule->>'ruleType', COALESCE(v_rule->'condition', '{}'::jsonb),
      COALESCE(v_rule->'effect', '{}'::jsonb), v_rule->>'message',
      COALESCE((v_rule->>'priority')::integer, 0), COALESCE((v_rule->>'isActive')::boolean, true)
    )
    ON CONFLICT (product_id, code) DO UPDATE SET
      name = EXCLUDED.name,
      rule_type = EXCLUDED.rule_type,
      condition = EXCLUDED.condition,
      effect = EXCLUDED.effect,
      message = EXCLUDED.message,
      priority = EXCLUDED.priority,
      is_active = EXCLUDED.is_active,
      updated_at = now()
    RETURNING id INTO v_rule_id;
    v_seen_rules := array_append(v_seen_rules, v_rule_id);
  END LOOP;
  DELETE FROM public.product_configuration_rules
  WHERE product_id = p_product_id AND NOT (id = ANY(v_seen_rules));

  UPDATE public.products p
  SET configuration_summary = jsonb_build_object(
    'mode', p.configuration_mode,
    'pricingStrategy', p.configuration_pricing_strategy,
    'groupCount', (SELECT count(*) FROM public.product_option_groups g WHERE g.product_id = p.id),
    'valueCount', (SELECT count(*) FROM public.product_option_values ov JOIN public.product_option_groups g ON g.id = ov.option_group_id WHERE g.product_id = p.id AND ov.is_active),
    'activeVariantCount', (SELECT count(*) FROM public.product_variants v WHERE v.product_id = p.id AND v.status = 'active'),
    'activeComponentCount', (SELECT count(*) FROM public.product_components c WHERE c.product_id = p.id AND c.is_active),
    'primaryGroupName', (SELECT g.name FROM public.product_option_groups g WHERE g.product_id = p.id ORDER BY g.position, g.name LIMIT 1),
    'primaryGroupValueCount', COALESCE((SELECT count(*) FROM public.product_option_values ov WHERE ov.option_group_id = (SELECT g.id FROM public.product_option_groups g WHERE g.product_id = p.id ORDER BY g.position, g.name LIMIT 1) AND ov.is_active), 0),
    'minRetailPriceCents', CASE WHEN p.configuration_pricing_strategy = 'component_sum' THEN
      (SELECT CASE WHEN COALESCE(sum(c.min_quantity), 0) > 0
        THEN sum(c.retail_price_cents * c.min_quantity)
        ELSE min(c.retail_price_cents) END
       FROM public.product_components c WHERE c.product_id = p.id AND c.is_active)
      ELSE (SELECT min(x) FROM unnest(ARRAY[p.price_retail] || COALESCE((SELECT array_agg(v.retail_price_cents) FROM public.product_variants v WHERE v.product_id = p.id AND v.status = 'active' AND v.retail_price_cents IS NOT NULL), '{}'::integer[])) x) END,
    'maxRetailPriceCents', CASE WHEN p.configuration_pricing_strategy = 'component_sum' THEN
      (SELECT CASE WHEN bool_and(c.max_quantity IS NOT NULL)
        THEN sum(c.retail_price_cents * c.max_quantity) ELSE NULL END
       FROM public.product_components c WHERE c.product_id = p.id AND c.is_active)
      ELSE (SELECT max(x) FROM unnest(ARRAY[p.price_retail] || COALESCE((SELECT array_agg(v.retail_price_cents) FROM public.product_variants v WHERE v.product_id = p.id AND v.status = 'active' AND v.retail_price_cents IS NOT NULL), '{}'::integer[])) x) END,
    'minTradePriceCents', CASE WHEN p.configuration_pricing_strategy = 'component_sum' THEN
      (SELECT CASE WHEN COALESCE(sum(c.min_quantity), 0) > 0
        THEN sum(c.trade_price_cents * c.min_quantity)
        ELSE min(c.trade_price_cents) END
       FROM public.product_components c WHERE c.product_id = p.id AND c.is_active)
      ELSE (SELECT min(x) FROM unnest(ARRAY[p.price_trade] || COALESCE((SELECT array_agg(v.trade_price_cents) FROM public.product_variants v WHERE v.product_id = p.id AND v.status = 'active' AND v.trade_price_cents IS NOT NULL), '{}'::integer[])) x) END,
    'maxTradePriceCents', CASE WHEN p.configuration_pricing_strategy = 'component_sum' THEN
      (SELECT CASE WHEN bool_and(c.max_quantity IS NOT NULL)
        THEN sum(c.trade_price_cents * c.max_quantity) ELSE NULL END
       FROM public.product_components c WHERE c.product_id = p.id AND c.is_active)
      ELSE (SELECT max(x) FROM unnest(ARRAY[p.price_trade] || COALESCE((SELECT array_agg(v.trade_price_cents) FROM public.product_variants v WHERE v.product_id = p.id AND v.status = 'active' AND v.trade_price_cents IS NOT NULL), '{}'::integer[])) x) END,
    'minLeadTimeWeeks', CASE WHEN p.configuration_pricing_strategy = 'component_sum'
      THEN (SELECT min(c.lead_time_weeks) FROM public.product_components c WHERE c.product_id = p.id AND c.is_active)
      ELSE (SELECT min(x) FROM unnest(ARRAY[p.lead_time_weeks] || COALESCE((SELECT array_agg(v.lead_time_weeks) FROM public.product_variants v WHERE v.product_id = p.id AND v.status = 'active' AND v.lead_time_weeks IS NOT NULL), '{}'::integer[])) x) END,
    'maxLeadTimeWeeks', CASE WHEN p.configuration_pricing_strategy = 'component_sum'
      THEN (SELECT max(c.lead_time_weeks) FROM public.product_components c WHERE c.product_id = p.id AND c.is_active)
      ELSE (SELECT max(x) FROM unnest(ARRAY[p.lead_time_weeks] || COALESCE((SELECT array_agg(v.lead_time_weeks) FROM public.product_variants v WHERE v.product_id = p.id AND v.status = 'active' AND v.lead_time_weeks IS NOT NULL), '{}'::integer[])) x) END,
    'priceOnRequest', CASE WHEN p.configuration_pricing_strategy = 'component_sum'
      THEN NOT EXISTS (SELECT 1 FROM public.product_components c WHERE c.product_id = p.id AND c.is_active)
      ELSE p.configuration_mode = 'custom' AND p.price_retail IS NULL
        AND NOT EXISTS (SELECT 1 FROM public.product_variants v WHERE v.product_id = p.id AND v.status = 'active' AND v.retail_price_cents IS NOT NULL) END
  )
  WHERE p.id = p_product_id;

  RETURN public.get_product_configuration_schema(p_product_id);
END;
$$;

-- ───────────────────────────────────────────────────────────────────────────
-- _record_project_ffe_receipt_batch_00446_impl — rows 36; grafted from 00862_receiving_review_repairs.sql:172
-- ───────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public._record_project_ffe_receipt_batch_00446_impl(
  p_purchase_order_id uuid,
  p_lines jsonb,
  p_outcome public.receiving_inspection_outcome,
  p_notes text DEFAULT NULL,
  p_photo_asset_ids uuid[] DEFAULT '{}',
  p_po_shipment_id uuid DEFAULT NULL,
  p_studio_purchase_id uuid DEFAULT NULL,
  p_arrival_method text DEFAULT NULL,
  p_reported_by text DEFAULT NULL,
  p_report_source text DEFAULT NULL,
  p_received_on date DEFAULT NULL,
  p_location_id uuid DEFAULT NULL,
  p_inspection_pending boolean DEFAULT NULL,
  p_inspection_owner_user_id uuid DEFAULT NULL,
  p_receipt_key uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions', 'pg_temp'
AS $$
DECLARE
  v_po public.purchase_orders%ROWTYPE;
  v_project public.projects%ROWTYPE;
  v_normalized_lines jsonb;
  v_request_hash text;
  v_existing jsonb;
  v_inspection_id uuid;
  v_response jsonb;
  v_purchase public.studio_purchases%ROWTYPE;
  v_item_id uuid;
  v_before jsonb;
  v_replay_id uuid;
  v_po_line_count integer;
  v_input_line_count integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'authentication required' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF jsonb_typeof(p_lines) IS DISTINCT FROM 'array'
     OR jsonb_array_length(p_lines) = 0
     OR jsonb_array_length(p_lines) > 1000
     OR EXISTS (
       SELECT 1 FROM jsonb_array_elements(p_lines) entry
       WHERE jsonb_typeof(entry) IS DISTINCT FROM 'object'
          OR jsonb_typeof(entry->'selectionId') IS DISTINCT FROM 'string'
          OR jsonb_typeof(entry->'receivedQuantity') IS DISTINCT FROM 'number'
          OR entry->>'selectionId' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
          OR entry->>'receivedQuantity' !~ '^[0-9]+$'
          OR EXISTS (
            SELECT 1 FROM jsonb_object_keys(entry) key
            WHERE key NOT IN ('selectionId', 'receivedQuantity')
          )
     )
  THEN
    RAISE EXCEPTION 'lines must be a nonempty array of selectionId and receivedQuantity entries'
      USING ERRCODE = 'check_violation';
  END IF;

  IF (p_purchase_order_id IS NULL) = (p_studio_purchase_id IS NULL) THEN
    RAISE EXCEPTION 'exactly one purchase order or studio purchase is required' USING ERRCODE = 'check_violation';
  END IF;
  IF p_purchase_order_id IS NOT NULL THEN
    SELECT * INTO v_po FROM public.purchase_orders WHERE id = p_purchase_order_id;
    PERFORM public._ffe_require_studio_project(v_po.project_id);
    IF NOT public.is_studio_comember(v_po.designer_id) THEN
      RAISE EXCEPTION 'purchase order owner is not accessible' USING ERRCODE = 'insufficient_privilege';
    END IF;
    SELECT * INTO v_po FROM public.purchase_orders WHERE id = p_purchase_order_id FOR UPDATE;
    SELECT * INTO STRICT v_project FROM public.projects WHERE id = v_po.project_id;
  ELSE
    SELECT * INTO v_purchase FROM public.studio_purchases WHERE id = p_studio_purchase_id;
    IF NOT FOUND OR v_purchase.ffe_item_id IS NULL OR NOT public.can_buy_for_project(v_purchase.project_id) THEN
      RAISE EXCEPTION 'studio purchase not found or access denied' USING ERRCODE = 'insufficient_privilege';
    END IF;
    SELECT * INTO v_purchase FROM public.studio_purchases WHERE id = p_studio_purchase_id FOR UPDATE;
    IF v_purchase.status NOT IN ('recorded', 'billed') THEN
      RAISE EXCEPTION 'studio purchase is not receivable' USING ERRCODE = 'check_violation';
    END IF;
    SELECT * INTO STRICT v_project FROM public.projects WHERE id = v_purchase.project_id;
  END IF;

  SELECT jsonb_agg(jsonb_build_object(
    'selectionId', entry->>'selectionId',
    'receivedQuantity', (entry->>'receivedQuantity')::integer
  ) ORDER BY entry->>'selectionId')
  INTO v_normalized_lines
  FROM jsonb_array_elements(p_lines) entry;

  IF (SELECT count(*) FROM jsonb_array_elements(v_normalized_lines)) IS DISTINCT FROM
     (SELECT count(DISTINCT entry->>'selectionId') FROM jsonb_array_elements(v_normalized_lines) entry)
  THEN
    RAISE EXCEPTION 'each purchase-order line must appear exactly once'
      USING ERRCODE = 'check_violation';
  END IF;

  -- The subject lock serializes key lookup, quantity deltas and insertion.
  IF p_receipt_key IS NOT NULL THEN
    SELECT line.inspection_id INTO v_replay_id
    FROM public.receiving_inspection_lines line
    JOIN jsonb_array_elements(v_normalized_lines) entry ON line.ffe_item_id = (entry->>'selectionId')::uuid
    WHERE line.receipt_key = p_receipt_key LIMIT 1;
    IF v_replay_id IS NOT NULL THEN
      IF EXISTS (
        SELECT 1 FROM public.receiving_inspections ri WHERE ri.id = v_replay_id
          AND (ri.purchase_order_id IS DISTINCT FROM p_purchase_order_id
            OR ri.studio_purchase_id IS DISTINCT FROM p_studio_purchase_id)
      ) OR EXISTS (
        SELECT 1 FROM jsonb_array_elements(v_normalized_lines) entry
        FULL JOIN (SELECT * FROM public.receiving_inspection_lines WHERE inspection_id = v_replay_id) line
          ON line.ffe_item_id = (entry->>'selectionId')::uuid
        WHERE entry IS NULL OR line.ffe_item_id IS NULL OR line.receipt_key IS DISTINCT FROM p_receipt_key
           OR line.received_quantity IS DISTINCT FROM (entry->>'receivedQuantity')::integer
      ) OR EXISTS (
        SELECT 1 FROM public.receiving_inspections ri WHERE ri.id = v_replay_id
          AND (ri.receipt_response->>'outcome' IS DISTINCT FROM p_outcome::text
            OR (ri.receipt_response->>'inspectionPending')::boolean IS DISTINCT FROM COALESCE(p_inspection_pending, false))
      ) THEN
        RAISE EXCEPTION 'receipt_key_conflict' USING ERRCODE = 'check_violation';
      END IF;
      SELECT receipt_response INTO v_existing FROM public.receiving_inspections WHERE id = v_replay_id;
      RETURN v_existing || jsonb_build_object('reused', true);
    END IF;
  END IF;
  IF p_purchase_order_id IS NOT NULL AND v_po.status NOT IN ('confirmed', 'in_production', 'shipped', 'delivered') THEN
    RAISE EXCEPTION 'purchase order is not in a receivable state' USING ERRCODE = 'check_violation';
  END IF;
  IF p_outcome IS NULL AND NOT COALESCE(p_inspection_pending, false)
     OR p_outcome IS NOT NULL AND COALESCE(p_inspection_pending, false) THEN
    RAISE EXCEPTION 'pending inspection requires no outcome; completed inspection requires an outcome' USING ERRCODE = 'check_violation';
  END IF;

  v_request_hash := encode(extensions.digest(
    (jsonb_build_object(
      'lines', v_normalized_lines,
      'outcome', p_outcome,
      'notes', NULLIF(btrim(p_notes), ''),
      'photoAssetIds', to_jsonb(COALESCE(p_photo_asset_ids, '{}'))
    ) || CASE WHEN p_po_shipment_id IS NOT NULL OR p_studio_purchase_id IS NOT NULL
      OR p_arrival_method IS NOT NULL OR p_reported_by IS NOT NULL OR p_report_source IS NOT NULL
      OR p_received_on IS NOT NULL OR p_location_id IS NOT NULL OR p_inspection_pending IS NOT NULL
      OR p_inspection_owner_user_id IS NOT NULL OR p_receipt_key IS NOT NULL
      THEN jsonb_build_object('shipment', p_po_shipment_id, 'purchase', p_studio_purchase_id,
        'arrival', p_arrival_method, 'reportedBy', p_reported_by, 'source', p_report_source,
        'receivedOn', p_received_on, 'location', p_location_id, 'pending', p_inspection_pending,
        'owner', p_inspection_owner_user_id, 'key', p_receipt_key) ELSE '{}'::jsonb END)::text,
    'sha256'
  ), 'hex');

  SELECT response INTO v_existing
  FROM public.project_ffe_receipt_commands
  WHERE purchase_order_id = v_po.id AND request_hash = v_request_hash
  FOR UPDATE;
  IF FOUND THEN
    IF v_existing IS NULL THEN
      RAISE EXCEPTION 'receipt command is still in progress'
        USING ERRCODE = 'PT409';
    END IF;
    RETURN v_existing || jsonb_build_object('reused', true);
  END IF;

  PERFORM 1 FROM public.project_ffe_items item
  WHERE (p_purchase_order_id IS NOT NULL AND item.purchase_order_id = v_po.id OR p_studio_purchase_id IS NOT NULL AND item.id = v_purchase.ffe_item_id)
  ORDER BY item.id
  FOR UPDATE;
  SELECT count(*) INTO v_po_line_count
  FROM public.project_ffe_items item
  WHERE (p_purchase_order_id IS NOT NULL AND item.purchase_order_id = v_po.id OR p_studio_purchase_id IS NOT NULL AND item.id = v_purchase.ffe_item_id);
  SELECT count(*) INTO v_input_line_count FROM jsonb_array_elements(v_normalized_lines);
  IF v_po_line_count = 0 OR v_input_line_count <> v_po_line_count
     OR EXISTS (
       SELECT 1
       FROM public.project_ffe_items item
       LEFT JOIN jsonb_array_elements(v_normalized_lines) entry
         ON (entry->>'selectionId')::uuid = item.id
       WHERE (p_purchase_order_id IS NOT NULL AND item.purchase_order_id = v_po.id OR p_studio_purchase_id IS NOT NULL AND item.id = v_purchase.ffe_item_id)
         AND entry IS NULL
     )
     OR EXISTS (
       SELECT 1
       FROM jsonb_array_elements(v_normalized_lines) entry
       LEFT JOIN public.project_ffe_items item
         ON item.id = (entry->>'selectionId')::uuid
        AND (p_purchase_order_id IS NOT NULL AND item.purchase_order_id = v_po.id OR p_studio_purchase_id IS NOT NULL AND item.id = v_purchase.ffe_item_id)
       WHERE item.id IS NULL
     )
  THEN
    RAISE EXCEPTION 'lines must name every purchase-order selection exactly once'
      USING ERRCODE = 'check_violation';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM public.project_ffe_items item
    JOIN jsonb_array_elements(v_normalized_lines) entry
      ON item.id = (entry->>'selectionId')::uuid
    WHERE item.project_id <> v_project.id
       OR (p_purchase_order_id IS NOT NULL AND item.vendor_id IS DISTINCT FROM v_po.vendor_id)
       OR (p_studio_purchase_id IS NOT NULL AND item.purchase_order_id IS NOT NULL)
       OR (entry->>'receivedQuantity')::integer < COALESCE(item.received_quantity, 0)
       OR (entry->>'receivedQuantity')::integer > item.quantity
  ) THEN
    RAISE EXCEPTION 'receipt lines must match project and vendor and advance within ordered quantities'
      USING ERRCODE = 'check_violation';
  END IF;
  IF p_po_shipment_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.po_shipment_lines WHERE shipment_id = p_po_shipment_id
  ) THEN
    -- The expected count belongs to this shipment, not the unshipped order.
    IF p_outcome = 'clean' AND EXISTS (
      SELECT 1 FROM public.po_shipment_lines shipped
      JOIN public.project_ffe_items item ON item.id = shipped.ffe_item_id
      JOIN jsonb_array_elements(v_normalized_lines) entry ON (entry->>'selectionId')::uuid = item.id
      WHERE shipped.shipment_id = p_po_shipment_id
        AND (entry->>'receivedQuantity')::integer - COALESCE(item.received_quantity, 0)
          + COALESCE((SELECT sum(line.quantity_received) FROM public.receiving_inspection_lines line
              JOIN public.receiving_inspections ri ON ri.id = line.inspection_id
              WHERE ri.po_shipment_id = p_po_shipment_id AND line.ffe_item_id = item.id), 0) <> shipped.qty
    ) THEN
      RAISE EXCEPTION 'clean receipt requires every shipment line to be fully received' USING ERRCODE = 'check_violation';
    END IF;
    IF p_outcome = 'partial' AND NOT EXISTS (
      SELECT 1 FROM public.po_shipment_lines shipped
      JOIN public.project_ffe_items item ON item.id = shipped.ffe_item_id
      JOIN jsonb_array_elements(v_normalized_lines) entry ON (entry->>'selectionId')::uuid = item.id
      WHERE shipped.shipment_id = p_po_shipment_id
        AND (entry->>'receivedQuantity')::integer - COALESCE(item.received_quantity, 0)
          + COALESCE((SELECT sum(line.quantity_received) FROM public.receiving_inspection_lines line
              JOIN public.receiving_inspections ri ON ri.id = line.inspection_id
              WHERE ri.po_shipment_id = p_po_shipment_id AND line.ffe_item_id = item.id), 0) < shipped.qty
    ) THEN
      RAISE EXCEPTION 'partial receipt requires at least one short shipment line' USING ERRCODE = 'check_violation';
    END IF;
  ELSE
  IF p_outcome = 'clean' AND EXISTS (
    SELECT 1
    FROM public.project_ffe_items item
    JOIN jsonb_array_elements(v_normalized_lines) entry
      ON item.id = (entry->>'selectionId')::uuid
    WHERE (entry->>'receivedQuantity')::integer <> item.quantity
  ) THEN
    RAISE EXCEPTION 'clean receipt requires every purchase-order line to be fully received'
      USING ERRCODE = 'check_violation';
  END IF;
  IF p_outcome = 'partial' AND NOT EXISTS (
    SELECT 1
    FROM public.project_ffe_items item
    JOIN jsonb_array_elements(v_normalized_lines) entry
      ON item.id = (entry->>'selectionId')::uuid
    WHERE (entry->>'receivedQuantity')::integer < item.quantity
  ) THEN
    RAISE EXCEPTION 'partial receipt requires at least one short purchase-order line'
      USING ERRCODE = 'check_violation';
  END IF;

  END IF;

  SELECT jsonb_object_agg(item.id::text, COALESCE(item.received_quantity, 0)) INTO v_before
  FROM public.project_ffe_items item
  WHERE (p_purchase_order_id IS NOT NULL AND item.purchase_order_id = v_po.id)
     OR (p_studio_purchase_id IS NOT NULL AND item.id = v_purchase.ffe_item_id);
  IF p_po_shipment_id IS NOT NULL THEN
    PERFORM 1 FROM public.po_shipments WHERE id = p_po_shipment_id AND purchase_order_id = v_po.id FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'shipment must belong to the receipt purchase order' USING ERRCODE = 'check_violation';
    END IF;
    IF EXISTS (SELECT 1 FROM public.po_shipment_lines WHERE shipment_id = p_po_shipment_id) AND EXISTS (
      SELECT 1 FROM jsonb_array_elements(v_normalized_lines) entry
      LEFT JOIN public.po_shipment_lines shipped ON shipped.shipment_id = p_po_shipment_id
        AND shipped.ffe_item_id = (entry->>'selectionId')::uuid
      WHERE (entry->>'receivedQuantity')::integer - (v_before->>(entry->>'selectionId'))::integer
        + COALESCE((SELECT sum(line.quantity_received) FROM public.receiving_inspection_lines line
            JOIN public.receiving_inspections ri ON ri.id = line.inspection_id
            WHERE ri.po_shipment_id = p_po_shipment_id AND line.ffe_item_id = (entry->>'selectionId')::uuid), 0)
        > COALESCE(shipped.qty, 0)
    ) THEN
      RAISE EXCEPTION 'received quantity exceeds the shipment line quantity' USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  IF p_purchase_order_id IS NOT NULL THEN
    INSERT INTO public.project_ffe_receipt_commands(purchase_order_id, request_hash) VALUES (v_po.id, v_request_hash);
  END IF;
  PERFORM set_config('app.ffe_mutation_rpc', 'on', true);
  UPDATE public.project_ffe_items item
  SET received_quantity = (entry->>'receivedQuantity')::integer,
      updated_at = now()
  FROM jsonb_array_elements(v_normalized_lines) entry
  WHERE item.id = (entry->>'selectionId')::uuid
    AND (p_purchase_order_id IS NOT NULL AND item.purchase_order_id = v_po.id OR p_studio_purchase_id IS NOT NULL AND item.id = v_purchase.ffe_item_id);

  INSERT INTO public.receiving_inspections(
    purchase_order_id, inspected_by, outcome, notes, photo_asset_ids, studio_purchase_id,
    po_shipment_id, arrival_method, reported_by, report_source, received_on, location_id,
    inspection_pending, inspection_owner_user_id
  ) VALUES (
    p_purchase_order_id, auth.uid(), p_outcome, NULLIF(btrim(p_notes), ''),
    COALESCE(p_photo_asset_ids, '{}'), p_studio_purchase_id, p_po_shipment_id,
    p_arrival_method, COALESCE(p_reported_by, 'studio_member'), NULLIF(btrim(p_report_source), ''),
    p_received_on, p_location_id, COALESCE(p_inspection_pending, false), p_inspection_owner_user_id
  ) RETURNING id INTO v_inspection_id;

  INSERT INTO public.receiving_inspection_lines(inspection_id, ffe_item_id, received_quantity, quantity_received, receipt_key)
  SELECT v_inspection_id, (entry->>'selectionId')::uuid, (entry->>'receivedQuantity')::integer,
    (entry->>'receivedQuantity')::integer - (v_before->>(entry->>'selectionId'))::integer, p_receipt_key
  FROM jsonb_array_elements(v_normalized_lines) entry;

  v_response := jsonb_build_object(
    'purchaseOrderId', p_purchase_order_id,
    'studioPurchaseId', p_studio_purchase_id,
    'poShipmentId', p_po_shipment_id,
    'inspectionPending', COALESCE(p_inspection_pending, false),
    'inspectionOwnerUserId', p_inspection_owner_user_id,
    'arrivalMethod', p_arrival_method, 'reportedBy', COALESCE(p_reported_by, 'studio_member'),
    'reportSource', NULLIF(btrim(p_report_source), ''), 'receivedOn', p_received_on, 'locationId', p_location_id,
    'claim_draft_skipped', CASE WHEN p_studio_purchase_id IS NOT NULL AND p_outcome IN ('damaged', 'partial') THEN 'no_purchase_order' END,
    'inspectionId', v_inspection_id,
    'outcome', p_outcome,
    'reused', false,
    'lines', (
      SELECT jsonb_agg(jsonb_build_object(
        'selectionId', item.id,
        'receivedQuantity', item.received_quantity,
        'orderedQuantity', item.quantity,
        'complete', item.received_quantity = item.quantity
      ) ORDER BY item.id)
      FROM public.project_ffe_items item
      WHERE (p_purchase_order_id IS NOT NULL AND item.purchase_order_id = v_po.id OR p_studio_purchase_id IS NOT NULL AND item.id = v_purchase.ffe_item_id)
    )
  );
  UPDATE public.project_ffe_receipt_commands
  SET inspection_id = v_inspection_id, response = v_response
  WHERE purchase_order_id = v_po.id AND request_hash = v_request_hash;
  UPDATE public.receiving_inspections SET receipt_response = v_response WHERE id = v_inspection_id;
  RETURN v_response;
END;
$$;

-- ───────────────────────────────────────────────────────────────────────────
-- spec_book_bump_spec_version — rows 37; grafted from 00382_spec_book_row_version_compatibility.sql:8
-- ───────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.spec_book_bump_spec_version()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.ffe_item_id IS DISTINCT FROM OLD.ffe_item_id THEN
    RAISE EXCEPTION 'ffe_item_id is immutable' USING errcode = 'object_not_in_prerequisite_state';
  END IF;

  -- Normal clients omit row_version, so NEW carries OLD here. Designer tabs
  -- loaded before the client fix send exactly OLD + 1 while filtering their
  -- UPDATE on OLD. Accept only that legacy shape; arbitrary values still fail.
  IF NEW.row_version IS DISTINCT FROM OLD.row_version
     AND NEW.row_version IS DISTINCT FROM OLD.row_version + 1 THEN
    RAISE EXCEPTION 'row_version is managed by the database'
      USING errcode = 'PT409';
  END IF;

  NEW.row_version := OLD.row_version + 1;
  NEW.updated_at := now();
  NEW.updated_by := COALESCE(auth.uid(), NEW.updated_by, OLD.updated_by);
  RETURN NEW;
END;
$$;

-- ───────────────────────────────────────────────────────────────────────────
-- delete_project_phase — rows 39, 40; grafted from 00398_delete_project_phase_atomic_rpc.sql:864
-- ───────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.delete_project_phase(
  p_project_id uuid,
  p_phase_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_project public.projects%ROWTYPE;
  v_target public.project_phases%ROWTYPE;
  v_predecessor_phase_id uuid;
  v_follower_ids uuid[] := ARRAY[]::uuid[];
  v_follower_count integer := 0;
  v_rows integer := 0;
  v_guard_prior text;
  v_guard_set boolean := false;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'delete_project_phase requires an authenticated user'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Project → complete project phase graph → every direct follower is the
  -- global lock order shared by all 00398 mutation boundaries. The target row
  -- lock conflicts with new FK children, so no follower can appear after the
  -- server derives the complete relink set.
  SELECT * INTO v_project
  FROM public.projects
  WHERE id = p_project_id
  FOR UPDATE;

  IF NOT FOUND OR NOT public._can_author_proposal(v_project.designer_id) THEN
    RAISE EXCEPTION 'delete_project_phase: project not found or access denied'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  PERFORM phase.id
  FROM public.project_phases AS phase
  WHERE phase.project_id = p_project_id
  ORDER BY phase.id
  FOR UPDATE;

  SELECT * INTO v_target
  FROM public.project_phases AS phase
  WHERE phase.id = p_phase_id
    AND phase.project_id = p_project_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'delete_project_phase: phase does not belong to project'
      USING ERRCODE = 'check_violation';
  END IF;

  -- Lock direct followers explicitly, including corrupt foreign followers.
  -- The topology assertion below then fails closed before any mutation.
  PERFORM follower.id
  FROM public.project_phases AS follower
  WHERE follower.follows_phase_id = p_phase_id
  ORDER BY follower.id
  FOR UPDATE;

  PERFORM public._assert_project_phase_topology(
    p_project_id,
    'delete_project_phase'
  );

  IF v_target.status <> 'pending' THEN
    RAISE EXCEPTION 'delete_project_phase: only pending phases may be deleted'
      USING ERRCODE = 'check_violation';
  END IF;

  v_predecessor_phase_id := v_target.follows_phase_id;

  SELECT COALESCE(array_agg(follower.id ORDER BY follower.id), ARRAY[]::uuid[]),
         count(*)
  INTO v_follower_ids, v_follower_count
  FROM public.project_phases AS follower
  WHERE follower.project_id = p_project_id
    AND follower.follows_phase_id = p_phase_id;

  v_guard_prior := current_setting('app.project_phase_topology_token', true);
  PERFORM set_config(
    'app.project_phase_topology_token',
    format('delete_project_phase:%s:%s', p_project_id, pg_catalog.txid_current()),
    true
  );
  v_guard_set := true;

  UPDATE public.project_phases AS follower
  SET follows_phase_id = v_predecessor_phase_id,
      updated_at = clock_timestamp()
  WHERE follower.project_id = p_project_id
    AND follower.follows_phase_id = p_phase_id;
  GET DIAGNOSTICS v_rows = ROW_COUNT;

  IF v_rows <> v_follower_count THEN
    RAISE EXCEPTION 'delete_project_phase: follower set changed during relink'
      USING ERRCODE = 'XX000';
  END IF;

  DELETE FROM public.project_phases AS phase
  WHERE phase.id = p_phase_id
    AND phase.project_id = p_project_id
    AND phase.status = 'pending';
  GET DIAGNOSTICS v_rows = ROW_COUNT;

  IF v_rows <> 1 THEN
    RAISE EXCEPTION 'delete_project_phase: phase changed during delete'
      USING ERRCODE = 'XX000';
  END IF;

  PERFORM public._assert_project_phase_topology(
    p_project_id,
    'delete_project_phase'
  );

  PERFORM set_config(
    'app.project_phase_topology_token', COALESCE(v_guard_prior, ''), true
  );
  v_guard_set := false;

  RETURN jsonb_build_object(
    'deleted_phase_id', p_phase_id,
    'predecessor_phase_id', v_predecessor_phase_id,
    'relinked_phase_ids', v_follower_ids
  );
EXCEPTION WHEN OTHERS THEN
  IF v_guard_set THEN
    PERFORM set_config(
      'app.project_phase_topology_token', COALESCE(v_guard_prior, ''), true
    );
  END IF;
  RAISE;
END;
$$;

-- ───────────────────────────────────────────────────────────────────────────
-- merge_studio_product — rows 45; grafted from 00830_us37_inherited_pricing_lock_order.sql:84
-- ───────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.merge_studio_product(p_from uuid, p_into uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_from public.products%ROWTYPE;
  v_into public.products%ROWTYPE;
  v_project_id uuid;
  v_jobs uuid[];
  v_lines integer := 0;
  v_board_items integer := 0;
  v_project_products integer := 0;
  v_merged_records integer := 0;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'authentication required'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_from IS NULL OR p_into IS NULL THEN
    RAISE EXCEPTION 'Name the duplicate and the product to keep.'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;
  IF p_from = p_into THEN
    RAISE EXCEPTION 'A product cannot merge into itself.'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  -- A board reference can be promoted before its job has any FF&E line.
  -- Lock those jobs too, before products, in the same global id order.
  -- Board-only jobs add lock scope, not a new read/write permission gate.
  SELECT COALESCE(array_agg(job.project_id ORDER BY job.project_id), ARRAY[]::uuid[])
  INTO v_jobs
  FROM (
    SELECT item.project_id
    FROM public.project_ffe_items item
    WHERE item.product_id = p_from
      AND public.can_buy_for_project(item.project_id)
    UNION
    SELECT board.project_id
    FROM public.proposal_board_items item
    JOIN public.proposal_boards board ON board.id = item.board_id
    WHERE item.product_id = p_from AND board.project_id IS NOT NULL
  ) job;
  FOREACH v_project_id IN ARRAY v_jobs LOOP
    PERFORM public._ffe_lock_job_labels(v_project_id);
  END LOOP;

  -- Lock both rows in id order, so two crossed merges cannot deadlock.
  PERFORM 1 FROM public.products
  WHERE id IN (p_from, p_into)
  ORDER BY id
  FOR UPDATE;

  SELECT * INTO v_from FROM public.products WHERE id = p_from;
  SELECT * INTO v_into FROM public.products WHERE id = p_into;

  -- The products_studio_update USING (00152:363), for both rows.
  IF v_from.id IS NULL OR v_into.id IS NULL
     OR v_from.layer IS DISTINCT FROM 'studio'
     OR v_into.layer IS DISTINCT FROM 'studio'
     OR NOT EXISTS (
       SELECT 1 FROM public.organization_members om
       WHERE om.user_id = auth.uid()
         AND om.organization_id = v_from.studio_id
         AND om.status = 'active'
         AND om.role IN ('owner', 'admin', 'member')
     )
  THEN
    RAISE EXCEPTION 'product not found or access denied'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF v_into.studio_id IS DISTINCT FROM v_from.studio_id THEN
    RAISE EXCEPTION 'product not found or access denied'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF v_from.merged_into_id IS NOT NULL OR v_from.deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'This product was already merged or removed.'
      USING ERRCODE = 'check_violation';
  END IF;
  IF v_into.merged_into_id IS NOT NULL OR v_into.deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'The product to keep was merged or removed.'
      USING ERRCODE = 'check_violation';
  END IF;

  -- Every project with a line on the duplicate must be one the caller may buy
  -- for; the merge writes those lines.
  FOR v_project_id IN
    SELECT DISTINCT item.project_id
    FROM public.project_ffe_items item
    WHERE item.product_id = p_from
    ORDER BY item.project_id
  LOOP
    PERFORM public._ffe_require_studio_project(v_project_id);
  END LOOP;

  IF EXISTS (
    SELECT 1
    FROM public.project_ffe_items item
    JOIN public.project_ffe_specs spec ON spec.ffe_item_id = item.id
    WHERE item.product_id = p_from
      AND spec.configuration_id IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'A line uses a configuration of this product, so it cannot merge.'
      USING ERRCODE = 'check_violation';
  END IF;

  -- Product locks close the FK insertion window. A newly visible line or
  -- board reference in an uncensused job must retry, never lock job-after-product.
  IF EXISTS (
    SELECT 1 FROM public.project_ffe_items item
    WHERE item.product_id = p_from
      AND item.project_id <> ALL (v_jobs)
    UNION ALL
    SELECT 1
    FROM public.proposal_board_items item
    JOIN public.proposal_boards board ON board.id = item.board_id
    WHERE item.product_id = p_from AND board.project_id IS NOT NULL
      AND board.project_id <> ALL (v_jobs)
  ) THEN
    -- 40001 on purpose (K12): a reference landed outside the locked census mid-merge; the retry recomputes it, and each further failure needs another concurrent insert.
    RAISE EXCEPTION 'A line or board reference was added to this product while it merged. Try the merge again.'
      USING ERRCODE = 'serialization_failure';
  END IF;

  -- Lines: re-pointed, never un-filled.
  PERFORM set_config('app.ffe_mutation_rpc', 'on', true);
  UPDATE public.project_ffe_items
  SET product_id = p_into
  WHERE product_id = p_from;
  GET DIAGNOSTICS v_lines = ROW_COUNT;
  PERFORM set_config('app.ffe_mutation_rpc', '', true);

  -- Board items, after the lines, so guard_board_selection_ownership sees the
  -- linked line already on p_into. Issued proposal copy is left as it was.
  UPDATE public.proposal_board_items board_item
  SET product_id = p_into
  WHERE board_item.product_id = p_from
    AND NOT EXISTS (
      SELECT 1
      FROM public.proposal_boards board
      JOIN public.proposals proposal ON proposal.id = board.proposal_id
      WHERE board.id = board_item.board_id
        AND proposal.status <> 'draft'
    );
  GET DIAGNOSTICS v_board_items = ROW_COUNT;

  UPDATE public.project_products listed
  SET product_id = p_into
  WHERE listed.product_id = p_from
    AND NOT EXISTS (
      SELECT 1 FROM public.project_products kept
      WHERE kept.project_id = listed.project_id
        AND kept.product_id = p_into
    );
  GET DIAGNOSTICS v_project_products = ROW_COUNT;

  UPDATE public.products
  SET merged_into_id = p_into
  WHERE merged_into_id = p_from;
  GET DIAGNOSTICS v_merged_records = ROW_COUNT;

  UPDATE public.products
  SET merged_into_id = p_into,
      deleted_at = now()
  WHERE id = p_from;

  RETURN jsonb_build_object(
    'fromId', p_from,
    'intoId', p_into,
    'lines', v_lines,
    'boardItems', v_board_items,
    'projectProducts', v_project_products,
    'earlierMerges', v_merged_records
  );
END;
$$;

-- ───────────────────────────────────────────────────────────────────────────
-- _spec_book_trade_chapter — rows 46; grafted from 00767_spec_book_trade_chapters.sql:291
-- ───────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public._spec_book_trade_chapter(
  p_spec_book_id uuid,
  p_category text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_trade text;
  v_title text;
  v_position integer;
  v_chapter_id uuid;
BEGIN
  SELECT t.trade, t.title, t.chapter_position
    INTO v_trade, v_title, v_position
  FROM public.spec_books b
  CROSS JOIN LATERAL public._spec_book_trade_for(b.project_id, p_category) t
  WHERE b.id = p_spec_book_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'spec book not found' USING errcode = 'foreign_key_violation';
  END IF;

  -- Insert, or read the existing chapter under a key-share lock held to
  -- commit, so a concurrent prune (which locks the chapter FOR UPDATE before
  -- its NOT EXISTS check) waits for this transaction's filing and then sees
  -- it. If a prune already removed it between the two statements, the next
  -- pass creates it again. page_template 'trade' marks the chapter as a trade
  -- chapter in every edition it is issued in (see the header).
  FOR v_attempt IN 1..3 LOOP
    INSERT INTO public.spec_book_chapters (spec_book_id, trade, title, position, page_template)
    VALUES (p_spec_book_id, v_trade, v_title, v_position, 'trade')
    ON CONFLICT (spec_book_id, trade) WHERE trade IS NOT NULL DO NOTHING
    RETURNING id INTO v_chapter_id;
    IF v_chapter_id IS NOT NULL THEN
      RETURN v_chapter_id;
    END IF;

    SELECT c.id INTO v_chapter_id
    FROM public.spec_book_chapters c
    WHERE c.spec_book_id = p_spec_book_id AND c.trade = v_trade
    FOR KEY SHARE;
    IF v_chapter_id IS NOT NULL THEN
      RETURN v_chapter_id;
    END IF;
  END LOOP;

  -- 40001 on purpose (K12): three insert/select passes lost to concurrent prunes; the retry starts fresh, and each further failure needs three more concurrent prunes.
  RAISE EXCEPTION 'spec book trade chapter % could not be filed', v_trade
    USING errcode = 'serialization_failure';
END;
$$;

-- ───────────────────────────────────────────────────────────────────────────
-- _save_product_configuration_impl — rows 47, 48 (found by FIX8, not in the RC-7 inventory);
-- grafted from 00415_decision_selection_and_template_privacy.sql:81 (save_product_configuration, renamed to the impl)
-- ───────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public._save_product_configuration_impl(p_input jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_product_id uuid;
  v_old_id uuid;
  v_old public.product_configurations;
  v_product public.products;
  v_project public.projects;
  v_configuration public.product_configurations;
  v_evaluation jsonb;
  v_snapshot jsonb;
  v_hash text;
  v_selected_ids uuid[] := '{}'::uuid[];
  v_group_entry record;
  v_value_ref text;
  v_value_id uuid;
  v_components jsonb;
  v_component_input jsonb;
  v_configuration_key uuid;
  v_version integer;
  v_project_id uuid;
  v_ffe_item_id uuid;
  v_variant_id uuid;
  v_studio_id uuid;
  v_latest_id uuid;
  v_custom_brief jsonb;
  v_com_details jsonb;
  v_com_value_id uuid;
  v_custom_revision public.custom_commission_revisions;
  v_previous_custom_revision public.custom_commission_revisions;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'authentication required' USING errcode = 'insufficient_privilege';
  END IF;
  IF p_input IS NULL OR jsonb_typeof(p_input) <> 'object' THEN
    RAISE EXCEPTION 'configuration input must be an object' USING errcode = 'check_violation';
  END IF;
  v_product_id := NULLIF(p_input->>'productId', '')::uuid;
  v_project_id := NULLIF(p_input->>'projectId', '')::uuid;
  v_ffe_item_id := NULLIF(p_input->>'ffeItemId', '')::uuid;
  v_old_id := NULLIF(p_input->>'configurationId', '')::uuid;
  v_components := COALESCE(p_input->'components', '[]'::jsonb);

  IF NOT public._can_read_configurable_product(v_product_id) THEN
    RAISE EXCEPTION 'product not found or not accessible' USING errcode = 'insufficient_privilege';
  END IF;
  SELECT * INTO STRICT v_product FROM public.products WHERE id = v_product_id;
  v_custom_brief := p_input->'customBrief';
  IF v_product.configuration_mode = 'custom' THEN
    IF v_custom_brief IS NULL OR jsonb_typeof(v_custom_brief) <> 'object'
       OR length(btrim(COALESCE(v_custom_brief->>'summary', ''))) = 0 THEN
      RAISE EXCEPTION 'custom configuration requires a brief summary'
        USING errcode = 'check_violation';
    END IF;
    IF COALESCE(v_custom_brief->>'fabricatorVendorId', '') = '' THEN
      v_custom_brief := v_custom_brief - 'fabricatorVendorId';
    END IF;
  END IF;

  IF jsonb_typeof(COALESCE(p_input->'selections', '{}'::jsonb)) <> 'object' THEN
    RAISE EXCEPTION 'selections must be an object' USING errcode = 'check_violation';
  END IF;
  IF jsonb_typeof(v_components) <> 'array' THEN
    RAISE EXCEPTION 'components must be an array' USING errcode = 'check_violation';
  END IF;
  IF v_product.configuration_mode IN ('standard', 'custom') AND (
       NULLIF(p_input->>'variantId', '') IS NOT NULL
       OR EXISTS (SELECT 1 FROM jsonb_each(COALESCE(p_input->'selections', '{}'::jsonb)))
       OR jsonb_array_length(v_components) > 0
     ) THEN
    RAISE EXCEPTION '% mode cannot save variants, option selections, or components',
      v_product.configuration_mode USING errcode = 'check_violation';
  END IF;
  IF v_product.configuration_mode = 'variant' AND jsonb_array_length(v_components) > 0 THEN
    RAISE EXCEPTION 'variant mode cannot save modular components'
      USING errcode = 'check_violation';
  END IF;
  IF v_product.configuration_mode = 'configured' AND NULLIF(p_input->>'variantId', '') IS NOT NULL THEN
    RAISE EXCEPTION 'configured mode cannot save an exact variant'
      USING errcode = 'check_violation';
  END IF;
  IF v_product.configuration_mode <> 'custom'
     AND p_input ? 'customBrief' AND p_input->'customBrief' <> 'null'::jsonb THEN
    RAISE EXCEPTION 'customBrief is only valid for custom products'
      USING errcode = 'check_violation';
  END IF;
  FOR v_group_entry IN SELECT key, value FROM jsonb_each(COALESCE(p_input->'selections', '{}'::jsonb)) LOOP
    IF jsonb_typeof(v_group_entry.value) <> 'array' THEN
      RAISE EXCEPTION 'each selection value must be an array' USING errcode = 'check_violation';
    END IF;
    FOR v_value_ref IN SELECT jsonb_array_elements_text(v_group_entry.value) LOOP
      v_value_id := NULL;
      BEGIN
        v_value_id := v_value_ref::uuid;
      EXCEPTION WHEN invalid_text_representation THEN
        SELECT ov.id INTO v_value_id
        FROM public.product_option_values ov
        JOIN public.product_option_groups og ON og.id = ov.option_group_id
        WHERE og.product_id = v_product_id
          AND (og.code = v_group_entry.key OR og.id::text = v_group_entry.key)
          AND ov.code = v_value_ref;
      END;
      IF v_value_id IS NULL THEN
        RAISE EXCEPTION 'unknown option selection %:%', v_group_entry.key, v_value_ref
          USING errcode = 'foreign_key_violation';
      END IF;
      v_selected_ids := array_append(v_selected_ids, v_value_id);
    END LOOP;
  END LOOP;

  -- COM/COL: the client-supplied fabric is part of what was specified, so it
  -- is validated against the actual selections and hashed with the snapshot.
  v_com_details := NULLIF(p_input->'comDetails', 'null'::jsonb);
  IF v_com_details IS NOT NULL THEN
    IF jsonb_typeof(v_com_details) <> 'object' THEN
      RAISE EXCEPTION 'comDetails must be a JSON object'
        USING errcode = 'invalid_parameter_value';
    END IF;
    IF v_product.configuration_mode = 'standard' THEN
      RAISE EXCEPTION 'comDetails is only valid for variant, configured, or custom products'
        USING errcode = 'invalid_parameter_value';
    END IF;
    IF NULLIF(v_com_details->>'optionValueId', '') IS NOT NULL THEN
      BEGIN
        v_com_value_id := (v_com_details->>'optionValueId')::uuid;
      EXCEPTION WHEN invalid_text_representation THEN
        v_com_value_id := NULL;
      END;
      IF v_com_value_id IS NULL OR NOT (v_com_value_id = ANY(v_selected_ids)) THEN
        RAISE EXCEPTION 'comDetails.optionValueId must name one of the selected option values'
          USING errcode = 'foreign_key_violation';
      END IF;
    END IF;
  END IF;

  v_evaluation := public.evaluate_product_configuration(
    v_product_id,
    NULLIF(p_input->>'variantId', '')::uuid,
    v_selected_ids,
    v_components
  );
  IF NOT COALESCE((v_evaluation->>'valid')::boolean, false) THEN
    RAISE EXCEPTION 'invalid configuration: %', v_evaluation->'violations'
      USING errcode = 'check_violation';
  END IF;
  v_snapshot := v_evaluation->'snapshot';
  IF v_com_details IS NOT NULL THEN
    v_snapshot := v_snapshot || jsonb_build_object('comDetails', v_com_details);
    -- The row stores both; they must be the same snapshot. Readers that go
    -- through the evaluation (quote envelopes, history) would otherwise see a
    -- COM piece with no fabric and a hash that does not match what they read.
    v_evaluation := jsonb_set(v_evaluation, '{snapshot}', v_snapshot);
  END IF;
  v_hash := public._configuration_snapshot_hash(v_snapshot);
  v_variant_id := NULLIF(v_evaluation#>>'{matchedVariant,id}', '')::uuid;

  IF v_project_id IS NOT NULL THEN
    SELECT * INTO v_project FROM public.projects WHERE id = v_project_id FOR SHARE;
    IF NOT FOUND OR NOT public.is_design_studio_comember(v_project.designer_id) THEN
      RAISE EXCEPTION 'project not found or not accessible' USING errcode = 'insufficient_privilege';
    END IF;
    IF v_ffe_item_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.project_ffe_items WHERE id = v_ffe_item_id AND project_id = v_project_id
    ) THEN
      RAISE EXCEPTION 'FFE item does not belong to project' USING errcode = 'check_violation';
    END IF;
  ELSIF v_ffe_item_id IS NOT NULL THEN
    RAISE EXCEPTION 'ffeItemId requires projectId' USING errcode = 'check_violation';
  END IF;

  IF v_old_id IS NOT NULL THEN
    IF NOT public._can_access_product_configuration(v_old_id) THEN
      RAISE EXCEPTION 'configuration not found or not accessible' USING errcode = 'insufficient_privilege';
    END IF;
    SELECT * INTO STRICT v_old FROM public.product_configurations WHERE id = v_old_id FOR UPDATE;
    IF v_old.product_id <> v_product_id THEN
      RAISE EXCEPTION 'configuration belongs to another product' USING errcode = 'check_violation';
    END IF;
    IF v_old.project_id IS DISTINCT FROM v_project_id
       OR v_old.ffe_item_id IS DISTINCT FROM v_ffe_item_id THEN
      RAISE EXCEPTION 'configuration scope cannot change while versioning; instantiate a reusable template for another project'
        USING errcode = 'check_violation';
    END IF;
    IF p_input ? 'expectedVersion'
       AND (p_input->>'expectedVersion')::integer <> v_old.version THEN
      RAISE EXCEPTION 'configuration changed in another session'
        USING errcode = 'PT409';
    END IF;
    v_configuration_key := v_old.configuration_key;
    PERFORM pg_advisory_xact_lock(hashtextextended(v_configuration_key::text, 0));
    SELECT c.id, c.version + 1 INTO v_latest_id, v_version
    FROM public.product_configurations c
    WHERE c.configuration_key = v_configuration_key
    ORDER BY c.version DESC LIMIT 1;
    IF v_latest_id IS DISTINCT FROM v_old.id
       OR (p_input ? 'expectedVersion' AND (p_input->>'expectedVersion')::integer <> v_version - 1) THEN
      RAISE EXCEPTION 'configuration is not the latest version; refresh before saving'
        USING errcode = 'PT409';
    END IF;
    IF v_old.status = 'saved' THEN
      UPDATE public.product_configurations SET status = 'superseded', updated_at = now() WHERE id = v_old.id;
    END IF;
  ELSE
    v_configuration_key := extensions.gen_random_uuid();
    v_version := 1;
  END IF;

  v_studio_id := CASE
    WHEN v_project_id IS NOT NULL THEN
      COALESCE(v_project.studio_id, public._primary_studio_for(v_project.designer_id))
    WHEN v_product.layer = 'studio' THEN v_product.studio_id
    WHEN v_product.layer = 'catalog' THEN public._primary_studio_for(auth.uid())
    ELSE NULL
  END;
  INSERT INTO public.product_configurations (
    configuration_key, product_id, product_variant_id, previous_configuration_id,
    project_id, ffe_item_id, owner_user_id, studio_id, version, schema_revision,
    status, name, notes, custom_brief, com_details, normalized_selection, component_quantities,
    evaluation, snapshot, snapshot_hash, is_complete, is_valid,
    retail_price_cents, trade_price_cents, lead_time_weeks, resolved_dimensions
  ) VALUES (
    v_configuration_key, v_product_id, v_variant_id, v_old_id,
    v_project_id, v_ffe_item_id, auth.uid(), v_studio_id, v_version,
    (v_evaluation->>'schemaRevision')::integer, 'saved',
    NULLIF(btrim(p_input->>'name'), ''), p_input->>'notes', v_custom_brief, v_com_details,
    v_evaluation->'normalizedSelection', v_evaluation->'componentQuantities',
    v_evaluation, v_snapshot, v_hash,
    (v_evaluation->>'complete')::boolean, (v_evaluation->>'valid')::boolean,
    NULLIF(v_evaluation->>'retailPriceCents', '')::integer,
    NULLIF(v_evaluation->>'tradePriceCents', '')::integer,
    NULLIF(v_evaluation->>'leadTimeWeeks', '')::integer,
    NULLIF(v_evaluation->'dimensions', 'null'::jsonb)
  ) RETURNING * INTO v_configuration;

  INSERT INTO public.product_configuration_selections (
    configuration_id, option_group_id, option_value_id, selection_snapshot
  )
  SELECT v_configuration.id, og.id, ov.id, jsonb_build_object(
    'optionGroupId', og.id, 'optionValueId', ov.id,
    'groupCode', og.code, 'valueCode', ov.code,
    'groupName', og.name, 'valueLabel', ov.label,
    'retailPriceDeltaCents', ov.retail_price_delta_cents,
    'tradePriceDeltaCents', ov.trade_price_delta_cents,
    'leadTimeDeltaWeeks', ov.lead_time_delta_weeks
  )
  FROM public.product_option_values ov
  JOIN public.product_option_groups og ON og.id = ov.option_group_id
  WHERE ov.id = ANY(v_selected_ids) AND og.product_id = v_product_id;

  FOR v_component_input IN SELECT value FROM jsonb_array_elements(v_components) LOOP
    INSERT INTO public.product_configuration_components (
      configuration_id, component_id, quantity, handedness, component_snapshot
    )
    SELECT v_configuration.id, c.id, (v_component_input->>'quantity')::integer,
      NULLIF(v_component_input->>'handedness', ''),
      jsonb_build_object(
        'componentId', c.id, 'code', c.code, 'name', c.name,
        'quantity', (v_component_input->>'quantity')::integer,
        'handedness', NULLIF(v_component_input->>'handedness', ''),
        'retailPriceCents', c.retail_price_cents,
        'tradePriceCents', c.trade_price_cents,
        'leadTimeWeeks', c.lead_time_weeks,
        'dimensions', c.dimensions
      )
    FROM public.product_components c
    WHERE c.id = (v_component_input->>'componentId')::uuid AND c.product_id = v_product_id;
  END LOOP;

  IF v_product.configuration_mode = 'custom' THEN
    SELECT r.* INTO v_previous_custom_revision
    FROM public.custom_commission_revisions r
    JOIN public.product_configurations lineage ON lineage.id = r.configuration_id
    WHERE lineage.configuration_key = v_configuration.configuration_key
    ORDER BY r.revision_number DESC LIMIT 1 FOR UPDATE OF r;
    IF FOUND AND v_previous_custom_revision.status IN ('submitted', 'quoted', 'client_review') THEN
      RAISE EXCEPTION 'resolve the active commission revision before saving another version'
        USING errcode = 'object_not_in_prerequisite_state';
    END IF;
    IF FOUND AND v_previous_custom_revision.status = 'draft' THEN
      UPDATE public.custom_commission_revisions
      SET status = 'superseded', updated_at = now()
      WHERE id = v_previous_custom_revision.id;
    END IF;
    INSERT INTO public.custom_commission_revisions (
      configuration_id, revision_number, previous_revision_id, status,
      brief, drawings, provenance, created_by
    ) VALUES (
      v_configuration.id, COALESCE(v_previous_custom_revision.revision_number, 0) + 1,
      v_previous_custom_revision.id, 'draft', v_custom_brief,
      COALESCE(v_custom_brief->'drawings', '[]'::jsonb),
      jsonb_build_object('source', 'configuration-save'), auth.uid()
    ) RETURNING * INTO v_custom_revision;
  END IF;

  RETURN jsonb_build_object(
    'configuration', public._product_configuration_json(v_configuration.id),
    'forkedFromConfigurationId', v_old_id,
    'customRevision', CASE WHEN v_custom_revision.id IS NULL THEN NULL
      ELSE public._custom_commission_revision_json(v_custom_revision.id) END
  );
END;
$$;

-- ───────────────────────────────────────────────────────────────────────────
-- _continue_board_in_project_v1_impl — rows 49 (found by FIX8, not in the RC-7 inventory);
-- grafted from 00407_project_board_sections_and_lineage.sql:146 (continue_board_in_project, renamed to the impl)
-- ───────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public._continue_board_in_project_v1_impl(
  p_project_board_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_pb public.project_boards%ROWTYPE;
  v_designer_id uuid;
  v_sections jsonb;
  v_new_id uuid;
BEGIN
  -- RLS-filtered read: the caller must participate in the project.
  SELECT * INTO v_pb
  FROM public.project_boards
  WHERE id = p_project_board_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION
      'continue_board_in_project: board % not found or access denied',
      p_project_board_id;
  END IF;

  -- Exact active design-studio peers share authoring authority (00399/00401).
  SELECT project.designer_id INTO v_designer_id
  FROM public.projects AS project
  WHERE project.id = v_pb.project_id;

  IF NOT public.is_design_studio_comember(v_designer_id) THEN
    RAISE EXCEPTION
      'continue_board_in_project: only the project design studio may continue a board'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Fast idempotent retry path.
  SELECT board.id INTO v_new_id
  FROM public.proposal_boards AS board
  WHERE board.source_project_board_id = p_project_board_id
  LIMIT 1;

  IF v_new_id IS NOT NULL THEN
    RETURN v_new_id;
  END IF;

  -- 00407 snapshots named sections directly. Retain 00273's fallbacks for a
  -- legacy/source-deleted row that could not be backfilled.
  v_sections := v_pb.sections;

  IF v_sections IS NULL
     OR jsonb_typeof(v_sections) <> 'array'
     OR jsonb_array_length(v_sections) = 0 THEN
    SELECT board.sections INTO v_sections
    FROM public.proposal_boards AS board
    WHERE board.id = v_pb.source_board_id;
  END IF;

  IF v_sections IS NULL
     OR jsonb_typeof(v_sections) <> 'array'
     OR jsonb_array_length(v_sections) = 0 THEN
    SELECT COALESCE(
      jsonb_agg(
        jsonb_build_object('id', section_id, 'name', 'Section')
        ORDER BY section_id
      ),
      '[]'::jsonb
    )
    INTO v_sections
    FROM (
      SELECT DISTINCT item->'data'->>'section_id' AS section_id
      FROM jsonb_array_elements(COALESCE(v_pb.items, '[]'::jsonb)) AS item
      WHERE item->'data'->>'section_id' IS NOT NULL
        AND btrim(item->'data'->>'section_id') <> ''
    ) AS recovered;
  END IF;

  INSERT INTO public.proposal_boards (
    proposal_id,
    project_id,
    source_project_board_id,
    name,
    scope_room_id,
    cover_image_url,
    canvas_width,
    canvas_height,
    background_color,
    sort_order,
    sections,
    status
  )
  VALUES (
    NULL,
    v_pb.project_id,
    p_project_board_id,
    v_pb.name,
    NULL,
    v_pb.cover_image_url,
    v_pb.canvas_width,
    v_pb.canvas_height,
    v_pb.background_color,
    v_pb.sort_order,
    COALESCE(v_sections, '[]'::jsonb),
    'active'
  )
  ON CONFLICT (source_project_board_id)
    WHERE source_project_board_id IS NOT NULL
  DO NOTHING
  RETURNING id INTO v_new_id;

  -- A concurrent continuation won. Read and return the canonical row without
  -- duplicating its items.
  IF v_new_id IS NULL THEN
    SELECT board.id INTO v_new_id
    FROM public.proposal_boards AS board
    WHERE board.source_project_board_id = p_project_board_id;

    IF v_new_id IS NULL THEN
      RAISE EXCEPTION 'continue_board_in_project: idempotent insert lost lineage'
        USING ERRCODE = 'XX000';
    END IF;

    RETURN v_new_id;
  END IF;

  INSERT INTO public.proposal_board_items (
    board_id,
    type,
    x,
    y,
    width,
    height,
    z_index,
    rotation,
    locked,
    product_id,
    capture_id,
    palette_id,
    image_url,
    content,
    data
  )
  SELECT
    v_new_id,
    COALESCE(item->>'type', 'image'),
    COALESCE((item->>'x')::numeric, 0),
    COALESCE((item->>'y')::numeric, 0),
    COALESCE((item->>'width')::numeric, 240),
    CASE
      WHEN item->>'height' IS NULL THEN NULL
      ELSE (item->>'height')::numeric
    END,
    COALESCE((item->>'z_index')::integer, 0),
    COALESCE((item->>'rotation')::numeric, 0),
    false,
    CASE
      WHEN item->>'product_id' IS NULL OR btrim(item->>'product_id') = ''
        THEN NULL
      ELSE (item->>'product_id')::uuid
    END,
    NULL,
    NULL,
    item->>'image_url',
    item->>'content',
    COALESCE(item->'data', '{}'::jsonb)
  FROM jsonb_array_elements(COALESCE(v_pb.items, '[]'::jsonb)) AS item;

  RETURN v_new_id;
END;
$$;
