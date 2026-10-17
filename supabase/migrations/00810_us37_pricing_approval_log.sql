-- ═══════════════════════════════════════════════════════════════════════════
-- 00810 · US-37 #4 server: the approved pricing snapshot and the
--         post-approval change log (SQ-1106)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- When a client approves a priced artifact, the job's FF&E client pricing is
-- copied as "the approved snapshot". From then on, every change to a line's
-- price fields is logged: who changed it, when, which field, the old value and
-- the new value. That lets the studio see what moved since the client said
-- yes. Designer team only: no client role can read any of it (D6).
--
-- ── The approval event (evidence) ─────────────────────────────────────────
-- The snapshot is taken in exactly one place,
-- _respond_project_approval_checked (latest body 00569:1250-1631, re-grafted
-- in §7). It fires on outcome 'approved', and only when the decision's
-- artifact is a spec_book_artifact or a budget_version:
--   * This is where a CLIENT approves a project artifact. Both entry points
--     reach it: respond_project_approval (00569, from the web approval-ask and
--     iOS ProjectApprovals) and apply_client_decision's project_artifact_v1
--     branch (00808).
--   * Those two kinds carry FF&E money. The client spec book prints each
--     line's client price (spec-book-render/render-model.ts). A budget_version
--     is a published money schedule pinned by a checkpoint fingerprint
--     (00422, 00463).
-- These events are deliberately left out:
--   * plan_issue approvals. Drawings carry no money; re-baselining on one
--     would silently accept price changes the client never saw.
--   * Furnishings authorization execution (00578). The signed prices are
--     already frozen in furnishing_authorization_items, which is the client's
--     authority. 00809 locks those lines afterwards ("Released lines change
--     through Record a change."). An authorization also names one wave, so a
--     job-wide snapshot would mark lines it never named as approved.
--   * Legacy proposal accept and activation. Client signing is retired (the
--     sign route answers 410), activation is a designer act (00763), and the
--     client approved proposal_items, not FF&E lines.
-- The snapshot copies the lines' live values at the moment of approval, not
-- values frozen when the edition was issued.
--
-- ── Locks ─────────────────────────────────────────────────────────────────
-- snapshot_project_pricing only reads project_ffe_items; it takes no row
-- locks. ffe_pricing_approvals has no FK to projects, and
-- ffe_pricing_approval_lines has no FK to items, so a snapshot takes no KEY
-- SHARE on a job or an item. It does not call _ffe_lock_job_labels:
-- respond_project_approval holds the decision and the released items by then,
-- and taking the job lock after them would invert R182.
-- The log trigger inserts under the item row lock its own UPDATE already
-- holds. Its FK item_id -> project_ffe_items takes KEY SHARE on that same row,
-- which adds no new edge. ffe_pricing_events.project_id, approved_by and actor
-- have no FK, so a missing profile can never refuse an edit.
-- Approval rows outlive a hard-deleted job, the same tradeoff as story #21.
--
-- ── The change log ────────────────────────────────────────────────────────
-- ffe_pricing_events is written by an AFTER UPDATE trigger, so it catches
-- every writer: set_ffe_line_pricing, the line editors, the 00809 resets,
-- configuration placement and raw service writes. Because the trigger fires
-- AFTER, it sees the final values, including markup_percent as
-- zzz_ffe_markup_truth_trg recomputed it. It logs nothing until the job has a
-- snapshot. 00809's _ffe_pricing_audit (audit_logs) stays as it is.
--
-- ── API ───────────────────────────────────────────────────────────────────
--   get_project_pricing_approval(p_project_id uuid) -> jsonb | null
--     Team only (_ffe_require_studio_project, 42501 otherwise). NULL when the
--     job has no approval. Otherwise {approvalId, approvalSource,
--     approvalRef, approvedAt, approvedBy, approvedTotalCents,
--     lines:[{itemId, approvedUnitClientPriceCents, approvedQuantity,
--     approvedLineTotalCents, differs}]}.
--     differs is true when the line's unit price, quantity or line total is
--     now different from the snapshot, or when the line has left the job's
--     live set (removed, not selected, superseded, moved or deleted).
--   get_ffe_pricing_events(p_project_id uuid, p_item_id uuid DEFAULT NULL)
--     -> jsonb array, newest first: [{id, itemId, field, oldValue, newValue,
--     actorId, actorName, at}]. Team only (42501 otherwise).
--   snapshot_project_pricing(p_project_id uuid, p_source text, p_ref uuid)
--     -> uuid. Internal: no grant to authenticated.
--
-- Adds GRANT/REVOKE -> supabase/seed/00-legacy-grants.sql regenerated.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─── 1. ffe_pricing_approvals ───────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.ffe_pricing_approvals (
  id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  project_id uuid NOT NULL,
  approval_source text NOT NULL
    CONSTRAINT ffe_pricing_approvals_source_ck CHECK (approval_source IN ('project_approval')),
  approval_ref uuid NOT NULL,
  approved_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  approved_by uuid
);

CREATE INDEX IF NOT EXISTS ffe_pricing_approvals_project_latest_idx
  ON public.ffe_pricing_approvals (project_id, approved_at DESC, id DESC);

COMMENT ON TABLE public.ffe_pricing_approvals IS
  'One row per client approval that snapshotted a job''s FF&E client pricing (00810). The latest row '
  'per project_id (approved_at, then id) is the approved snapshot. approval_ref is the approved '
  'client_decisions id for approval_source project_approval. No FK to projects or profiles (lock '
  'order, 00810 header). Designer team read only.';

-- ─── 2. ffe_pricing_approval_lines ──────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.ffe_pricing_approval_lines (
  approval_id uuid NOT NULL
    REFERENCES public.ffe_pricing_approvals(id) ON DELETE CASCADE,
  item_id uuid NOT NULL,
  unit_client_cents integer,
  quantity integer NOT NULL,
  line_total_cents integer,
  PRIMARY KEY (approval_id, item_id)
);

COMMENT ON TABLE public.ffe_pricing_approval_lines IS
  'The FF&E lines as the client approved them (00810): unit client price, quantity and line total of '
  'every live line (not removed, not not_selected, not superseded) at the approval. item_id has no FK, '
  'so a snapshot takes no lock on an item. Designer team read only.';

-- ─── 3. ffe_pricing_events ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.ffe_pricing_events (
  id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  item_id uuid NOT NULL
    REFERENCES public.project_ffe_items(id) ON DELETE CASCADE,
  project_id uuid NOT NULL,
  actor uuid,
  at timestamptz NOT NULL DEFAULT clock_timestamp(),
  field text NOT NULL
    CONSTRAINT ffe_pricing_events_field_ck CHECK (field IN (
      'unit_price_cents', 'quantity', 'line_total_cents',
      'markup_percent', 'trade_price_cents', 'line_kind'
    )),
  old_value text,
  new_value text
);

CREATE INDEX IF NOT EXISTS ffe_pricing_events_project_at_idx
  ON public.ffe_pricing_events (project_id, at DESC, id DESC);
CREATE INDEX IF NOT EXISTS ffe_pricing_events_item_idx
  ON public.ffe_pricing_events (item_id);

COMMENT ON TABLE public.ffe_pricing_events IS
  'Post-approval FF&E pricing change log (00810): one row per changed field per line update, written '
  'by ffe_pricing_events_log_trg only while the job has an ffe_pricing_approvals row. actor is '
  'auth.uid() of the writer (NULL for a server writer). Designer team read only.';

-- ─── 4. Team read, no client access ─────────────────────────────────────────

ALTER TABLE public.ffe_pricing_approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ffe_pricing_approval_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ffe_pricing_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ffe_pricing_approvals_team_select ON public.ffe_pricing_approvals;
CREATE POLICY ffe_pricing_approvals_team_select ON public.ffe_pricing_approvals
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.projects AS project
      WHERE project.id = ffe_pricing_approvals.project_id
        AND project.designer_id = (SELECT auth.uid())
    )
    OR public.can_buy_for_project(project_id)
  );

DROP POLICY IF EXISTS ffe_pricing_approval_lines_team_select ON public.ffe_pricing_approval_lines;
CREATE POLICY ffe_pricing_approval_lines_team_select ON public.ffe_pricing_approval_lines
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.ffe_pricing_approvals AS approval
      WHERE approval.id = ffe_pricing_approval_lines.approval_id
        AND (
          EXISTS (
            SELECT 1 FROM public.projects AS project
            WHERE project.id = approval.project_id
              AND project.designer_id = (SELECT auth.uid())
          )
          OR public.can_buy_for_project(approval.project_id)
        )
    )
  );

DROP POLICY IF EXISTS ffe_pricing_events_team_select ON public.ffe_pricing_events;
CREATE POLICY ffe_pricing_events_team_select ON public.ffe_pricing_events
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.projects AS project
      WHERE project.id = ffe_pricing_events.project_id
        AND project.designer_id = (SELECT auth.uid())
    )
    OR public.can_buy_for_project(project_id)
  );

REVOKE ALL ON public.ffe_pricing_approvals FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.ffe_pricing_approvals TO authenticated;
GRANT ALL ON public.ffe_pricing_approvals TO service_role;
REVOKE ALL ON public.ffe_pricing_approval_lines FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.ffe_pricing_approval_lines TO authenticated;
GRANT ALL ON public.ffe_pricing_approval_lines TO service_role;
REVOKE ALL ON public.ffe_pricing_events FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.ffe_pricing_events TO authenticated;
GRANT ALL ON public.ffe_pricing_events TO service_role;

-- ─── 5. snapshot_project_pricing ────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.snapshot_project_pricing(
  p_project_id uuid,
  p_source text,
  p_ref uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_approval_id uuid;
BEGIN
  INSERT INTO public.ffe_pricing_approvals (project_id, approval_source, approval_ref, approved_by)
  VALUES (p_project_id, p_source, p_ref, auth.uid())
  RETURNING id INTO v_approval_id;

  INSERT INTO public.ffe_pricing_approval_lines (
    approval_id, item_id, unit_client_cents, quantity, line_total_cents
  )
  SELECT v_approval_id, item.id, item.unit_price_cents, item.quantity, item.line_total_cents
  FROM public.project_ffe_items AS item
  WHERE item.project_id = p_project_id
    AND item.removed_at IS NULL
    AND item.design_disposition NOT IN ('not_selected', 'superseded');

  RETURN v_approval_id;
END;
$$;

COMMENT ON FUNCTION public.snapshot_project_pricing(uuid, text, uuid) IS
  'Records the job''s approved FF&E pricing (00810): an ffe_pricing_approvals row (approved_by = '
  'auth.uid()) and an ffe_pricing_approval_lines row per live line. Reads items without locking them. '
  'Internal: called by _respond_project_approval_checked on a priced approval.';

REVOKE ALL ON FUNCTION public.snapshot_project_pricing(uuid, text, uuid) FROM PUBLIC, anon, authenticated;

-- ─── 6. The change log trigger ──────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.ffe_pricing_events_log()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.ffe_pricing_approvals AS approval
    WHERE approval.project_id = NEW.project_id
  ) THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.ffe_pricing_events (item_id, project_id, actor, field, old_value, new_value)
  SELECT NEW.id, NEW.project_id, auth.uid(), change.field, change.old_value, change.new_value
  FROM (VALUES
    (1, 'unit_price_cents', OLD.unit_price_cents::text, NEW.unit_price_cents::text,
      OLD.unit_price_cents IS DISTINCT FROM NEW.unit_price_cents),
    (2, 'quantity', OLD.quantity::text, NEW.quantity::text,
      OLD.quantity IS DISTINCT FROM NEW.quantity),
    (3, 'line_total_cents', OLD.line_total_cents::text, NEW.line_total_cents::text,
      OLD.line_total_cents IS DISTINCT FROM NEW.line_total_cents),
    (4, 'markup_percent', OLD.markup_percent::text, NEW.markup_percent::text,
      OLD.markup_percent IS DISTINCT FROM NEW.markup_percent),
    (5, 'trade_price_cents', OLD.trade_price_cents::text, NEW.trade_price_cents::text,
      OLD.trade_price_cents IS DISTINCT FROM NEW.trade_price_cents),
    (6, 'line_kind', OLD.line_kind::text, NEW.line_kind::text,
      OLD.line_kind IS DISTINCT FROM NEW.line_kind)
  ) AS change(ord, field, old_value, new_value, changed)
  WHERE change.changed
  ORDER BY change.ord;

  RETURN NULL;
END;
$$;

COMMENT ON FUNCTION public.ffe_pricing_events_log() IS
  'AFTER UPDATE on project_ffe_items (00810): when the job has an approved pricing snapshot, writes one '
  'ffe_pricing_events row per changed unit_price_cents, quantity, line_total_cents, markup_percent, '
  'trade_price_cents or line_kind, with auth.uid() as actor. Logs nothing before the first approval.';

REVOKE ALL ON FUNCTION public.ffe_pricing_events_log() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS ffe_pricing_events_log_trg ON public.project_ffe_items;
CREATE TRIGGER ffe_pricing_events_log_trg
  AFTER UPDATE ON public.project_ffe_items
  FOR EACH ROW
  WHEN (
    OLD.unit_price_cents IS DISTINCT FROM NEW.unit_price_cents
    OR OLD.quantity IS DISTINCT FROM NEW.quantity
    OR OLD.line_total_cents IS DISTINCT FROM NEW.line_total_cents
    OR OLD.markup_percent IS DISTINCT FROM NEW.markup_percent
    OR OLD.trade_price_cents IS DISTINCT FROM NEW.trade_price_cents
    OR OLD.line_kind IS DISTINCT FROM NEW.line_kind
  )
  EXECUTE FUNCTION public.ffe_pricing_events_log();

-- ─── 7. The approval path takes the snapshot ────────────────────────────────
-- Re-grafted from the latest body (00569:1250-1631). The only change is the
-- gated PERFORM inside the approved block, after the released items.

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
    -- 00810: a priced approval records the job's approved FF&E pricing.
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

REVOKE ALL ON FUNCTION public._respond_project_approval_checked(
  uuid, text, uuid, timestamptz, text, text, text
) FROM PUBLIC, anon, authenticated, service_role;

-- ─── 8. Readers ─────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_project_pricing_approval(p_project_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_approval public.ffe_pricing_approvals%ROWTYPE;
  v_lines jsonb;
  v_total bigint;
BEGIN
  PERFORM public._ffe_require_studio_project(p_project_id);

  SELECT * INTO v_approval
  FROM public.ffe_pricing_approvals AS approval
  WHERE approval.project_id = p_project_id
  ORDER BY approval.approved_at DESC, approval.id DESC
  LIMIT 1;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  SELECT
    COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'itemId', line.item_id,
          'approvedUnitClientPriceCents', line.unit_client_cents,
          'approvedQuantity', line.quantity,
          'approvedLineTotalCents', line.line_total_cents,
          'differs', (
            item.id IS NULL
            OR item.project_id IS DISTINCT FROM v_approval.project_id
            OR item.removed_at IS NOT NULL
            OR item.design_disposition IN ('not_selected', 'superseded')
            OR item.unit_price_cents IS DISTINCT FROM line.unit_client_cents
            OR item.quantity IS DISTINCT FROM line.quantity
            OR item.line_total_cents IS DISTINCT FROM line.line_total_cents
          )
        )
        ORDER BY line.item_id
      ),
      '[]'::jsonb
    ),
    COALESCE(sum(line.line_total_cents::bigint), 0)
  INTO v_lines, v_total
  FROM public.ffe_pricing_approval_lines AS line
  LEFT JOIN public.project_ffe_items AS item ON item.id = line.item_id
  WHERE line.approval_id = v_approval.id;

  RETURN jsonb_build_object(
    'approvalId', v_approval.id,
    'approvalSource', v_approval.approval_source,
    'approvalRef', v_approval.approval_ref,
    'approvedAt', v_approval.approved_at,
    'approvedBy', v_approval.approved_by,
    'approvedTotalCents', v_total,
    'lines', v_lines
  );
END;
$$;

COMMENT ON FUNCTION public.get_project_pricing_approval(uuid) IS
  'The job''s approved FF&E pricing snapshot (00810), for the designer team only (42501 otherwise): NULL '
  'before any approval; else {approvalId, approvalSource, approvalRef, approvedAt, approvedBy, '
  'approvedTotalCents, lines:[{itemId, approvedUnitClientPriceCents, approvedQuantity, '
  'approvedLineTotalCents, differs}]}. differs is true when the live line''s unit price, quantity or '
  'total no longer equals the snapshot, or the line left the job''s live set.';

CREATE OR REPLACE FUNCTION public.get_ffe_pricing_events(
  p_project_id uuid,
  p_item_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  PERFORM public._ffe_require_studio_project(p_project_id);

  RETURN COALESCE(
    (
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', event.id,
          'itemId', event.item_id,
          'field', event.field,
          'oldValue', event.old_value,
          'newValue', event.new_value,
          'actorId', event.actor,
          'actorName', COALESCE(
            NULLIF(btrim(profile.full_name), ''),
            NULLIF(btrim(profile.display_name), '')
          ),
          'at', event.at
        )
        ORDER BY event.at DESC, event.id DESC
      )
      FROM public.ffe_pricing_events AS event
      LEFT JOIN public.profiles AS profile ON profile.id = event.actor
      WHERE event.project_id = p_project_id
        AND (p_item_id IS NULL OR event.item_id = p_item_id)
    ),
    '[]'::jsonb
  );
END;
$$;

COMMENT ON FUNCTION public.get_ffe_pricing_events(uuid, uuid) IS
  'The job''s post-approval FF&E pricing changes (00810), newest first, optionally for one line, for '
  'the designer team only (42501 otherwise): [{id, itemId, field, oldValue, newValue, actorId, '
  'actorName, at}].';

-- ─── 9. Grants ──────────────────────────────────────────────────────────────

REVOKE ALL ON FUNCTION public.get_project_pricing_approval(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_project_pricing_approval(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.get_ffe_pricing_events(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_ffe_pricing_events(uuid, uuid) TO authenticated;

COMMIT;
