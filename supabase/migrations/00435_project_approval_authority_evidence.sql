-- ═══════════════════════════════════════════════════════════════════════════
-- 00435 — Project approval authority and immutable review evidence
--
-- Extends the installed client_decisions aggregate without redefining any
-- existing public RPC. Stage-2 creation owns one explicit household authority
-- snapshot, one immutable/versioned artifact, three canonical outcome options,
-- and one idempotency receipt in one transaction. Review confirmation is a
-- separate authenticated click-through act bound to that exact snapshot.
--
-- 00436 intentionally owns publish/respond/withdraw/supersede routing and the
-- sanitized client list/detail projection. Until that migration supplies its
-- dedicated capability, generic draft compatibility cannot mutate Stage-2.
--
-- Adds GRANT/REVOKE → regenerate seed/00-legacy-grants.sql.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- ── Additive aggregate classifier and projection-ready option evidence ─────

ALTER TABLE public.client_decisions
  ADD COLUMN IF NOT EXISTS approval_contract text,
  ADD COLUMN IF NOT EXISTS predecessor_decision_id uuid;

ALTER TABLE public.client_decisions
  DROP CONSTRAINT IF EXISTS client_decisions_approval_contract_check,
  ADD CONSTRAINT client_decisions_approval_contract_check CHECK (
    approval_contract IS NULL OR approval_contract = 'project_artifact_v1'
  ),
  DROP CONSTRAINT IF EXISTS client_decisions_stage2_predecessor_fkey,
  ADD CONSTRAINT client_decisions_stage2_predecessor_fkey
    FOREIGN KEY (predecessor_decision_id)
    REFERENCES public.client_decisions(id) ON DELETE RESTRICT,
  DROP CONSTRAINT IF EXISTS client_decisions_stage2_shape_check,
  ADD CONSTRAINT client_decisions_stage2_shape_check CHECK (
    (approval_contract IS NULL AND predecessor_decision_id IS NULL)
    OR (
      approval_contract = 'project_artifact_v1'
      AND project_id IS NOT NULL
      AND linked_proposal_id IS NULL
      AND decision_type = 'approval'
      AND decision_kind = 'approval'
      AND coordination_kind = 'signoff'
      AND court = 'client'
      AND phase_id IS NOT NULL
      AND blocking_status = 'blocks_phase'
      AND blocks_kind = 'phase'
    )
  );

CREATE UNIQUE INDEX IF NOT EXISTS
  uq_client_decisions_stage2_predecessor
  ON public.client_decisions(predecessor_decision_id)
  WHERE predecessor_decision_id IS NOT NULL;

ALTER TABLE public.client_decision_options
  ADD COLUMN IF NOT EXISTS approval_outcome text,
  ADD COLUMN IF NOT EXISTS cost_cents_delta integer,
  ADD COLUMN IF NOT EXISTS schedule_days_delta integer,
  ADD COLUMN IF NOT EXISTS lead_time_days_delta integer;

ALTER TABLE public.client_decision_options
  DROP CONSTRAINT IF EXISTS client_decision_options_stage2_evidence_check,
  ADD CONSTRAINT client_decision_options_stage2_evidence_check CHECK (
    (
      approval_outcome IS NULL
      AND cost_cents_delta IS NULL
      AND schedule_days_delta IS NULL
    )
    OR (
      approval_outcome IN (
        'approved', 'changes_requested', 'needs_discussion'
      )
      AND cost_cents_delta IS NOT NULL
      AND schedule_days_delta IS NOT NULL
      AND lead_time_days_delta IS NOT NULL
    )
  );

CREATE UNIQUE INDEX IF NOT EXISTS
  uq_client_decision_options_stage2_outcome
  ON public.client_decision_options(decision_id, approval_outcome)
  WHERE approval_outcome IS NOT NULL;

-- ── Authority assignment, frozen evidence, and action receipts ─────────────

CREATE TABLE IF NOT EXISTS public.project_decision_authorities (
  project_id uuid PRIMARY KEY
    REFERENCES public.projects(id) ON DELETE RESTRICT,
  decision_lead_id uuid NOT NULL
    REFERENCES public.profiles(id) ON DELETE RESTRICT,
  required_coapprover_id uuid
    REFERENCES public.profiles(id) ON DELETE RESTRICT,
  revision integer NOT NULL CHECK (revision > 0),
  assigned_by uuid NOT NULL
    REFERENCES public.profiles(id) ON DELETE RESTRICT,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (
    required_coapprover_id IS NULL
    OR required_coapprover_id <> decision_lead_id
  )
);

CREATE TABLE IF NOT EXISTS public.project_decision_authority_snapshots (
  id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  decision_id uuid NOT NULL UNIQUE
    REFERENCES public.client_decisions(id) ON DELETE RESTRICT,
  project_id uuid NOT NULL
    REFERENCES public.projects(id) ON DELETE RESTRICT,
  decision_lead_id uuid NOT NULL
    REFERENCES public.profiles(id) ON DELETE RESTRICT,
  required_coapprover_id uuid
    REFERENCES public.profiles(id) ON DELETE RESTRICT,
  authority_revision integer NOT NULL CHECK (authority_revision > 0),
  assigned_by uuid NOT NULL
    REFERENCES public.profiles(id) ON DELETE RESTRICT,
  snapshotted_at timestamptz NOT NULL DEFAULT now(),
  CHECK (
    required_coapprover_id IS NULL
    OR required_coapprover_id <> decision_lead_id
  )
);

CREATE INDEX IF NOT EXISTS idx_project_decision_authority_snapshots_project
  ON public.project_decision_authority_snapshots(project_id, snapshotted_at DESC);

CREATE TABLE IF NOT EXISTS public.project_approval_artifacts (
  id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  decision_id uuid NOT NULL UNIQUE
    REFERENCES public.client_decisions(id) ON DELETE RESTRICT,
  project_id uuid NOT NULL
    REFERENCES public.projects(id) ON DELETE RESTRICT,
  source_kind text NOT NULL CHECK (
    source_kind IN ('plan_issue', 'spec_book_artifact', 'budget_version')
  ),
  source_id uuid NOT NULL,
  source_version integer NOT NULL CHECK (source_version > 0),
  artifact_hash text NOT NULL CHECK (artifact_hash ~ '^[0-9a-f]{64}$'),
  artifact_title text NOT NULL
    CHECK (char_length(btrim(artifact_title)) BETWEEN 1 AND 240),
  question text NOT NULL
    CHECK (char_length(btrim(question)) BETWEEN 1 AND 500),
  context text,
  due_at timestamptz NOT NULL,
  phase_id uuid NOT NULL
    REFERENCES public.project_phases(id) ON DELETE RESTRICT,
  cost_cents_delta integer NOT NULL,
  schedule_days_delta integer NOT NULL,
  lead_time_days_delta integer NOT NULL,
  source_snapshot jsonb NOT NULL
    CHECK (jsonb_typeof(source_snapshot) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, source_kind, source_id, decision_id)
);

CREATE INDEX IF NOT EXISTS idx_project_approval_artifacts_project
  ON public.project_approval_artifacts(project_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.project_decision_review_confirmations (
  id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  decision_id uuid NOT NULL
    REFERENCES public.client_decisions(id) ON DELETE RESTRICT,
  project_id uuid NOT NULL
    REFERENCES public.projects(id) ON DELETE RESTRICT,
  authority_revision integer NOT NULL CHECK (authority_revision > 0),
  approver_id uuid NOT NULL
    REFERENCES public.profiles(id) ON DELETE RESTRICT,
  approver_role text NOT NULL CHECK (approver_role IN ('lead', 'coapprover')),
  artifact_hash text NOT NULL CHECK (artifact_hash ~ '^[0-9a-f]{64}$'),
  review_method text NOT NULL CHECK (review_method = 'portal_clickthrough'),
  confirmed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (decision_id, approver_id),
  UNIQUE (decision_id, approver_role)
);

CREATE INDEX IF NOT EXISTS idx_project_decision_confirmations_project
  ON public.project_decision_review_confirmations(project_id, confirmed_at DESC);

CREATE TABLE IF NOT EXISTS public.project_approval_action_receipts (
  id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  project_id uuid NOT NULL
    REFERENCES public.projects(id) ON DELETE RESTRICT,
  decision_id uuid NOT NULL
    REFERENCES public.client_decisions(id) ON DELETE RESTRICT,
  action_kind text NOT NULL CHECK (
    action_kind IN (
      'created', 'review_confirmed', 'published', 'responded',
      'withdrawn', 'superseded'
    )
  ),
  idempotency_key text NOT NULL
    CHECK (char_length(btrim(idempotency_key)) BETWEEN 1 AND 200),
  request_hash text NOT NULL CHECK (request_hash ~ '^[0-9a-f]{64}$'),
  actor_id uuid NOT NULL
    REFERENCES public.profiles(id) ON DELETE RESTRICT,
  result jsonb NOT NULL CHECK (jsonb_typeof(result) = 'object'),
  successor_decision_id uuid
    REFERENCES public.client_decisions(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, action_kind, idempotency_key),
  UNIQUE (decision_id, action_kind, idempotency_key)
);

CREATE UNIQUE INDEX IF NOT EXISTS
  uq_project_approval_receipts_successor
  ON public.project_approval_action_receipts(successor_decision_id)
  WHERE successor_decision_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_project_approval_receipts_decision
  ON public.project_approval_action_receipts(decision_id, created_at DESC);

-- ── One private immutable-source resolver, shared by RPC and table guard ───

CREATE OR REPLACE FUNCTION public._project_approval_hash(p_value jsonb)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public, extensions
AS $$
  SELECT encode(
    extensions.digest(convert_to(p_value::text, 'UTF8'), 'sha256'),
    'hex'
  );
$$;

REVOKE ALL ON FUNCTION public._project_approval_hash(jsonb)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public._resolve_project_approval_artifact(
  p_project_id uuid,
  p_source_kind text,
  p_source_id uuid
)
RETURNS TABLE (
  source_version integer,
  artifact_hash text,
  artifact_title text,
  safe_snapshot jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_budget public.project_budget_versions%ROWTYPE;
  v_checkpoint public.project_budget_checkpoints%ROWTYPE;
BEGIN
  IF p_source_kind = 'plan_issue' THEN
    RETURN QUERY
    SELECT
      issue.issue_number,
      issue.set_checksum,
      issue.name,
      jsonb_build_object(
        'kind', 'plan_issue',
        'id', issue.id,
        'version', issue.issue_number,
        'checksum', issue.set_checksum,
        'title', issue.name,
        'issuedAt', issue.issued_at,
        'sheetCount', issue.sheet_count
      )
    FROM public.plan_issues AS issue
    WHERE issue.id = p_source_id
      AND issue.project_id = p_project_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'issued plan set not found for project'
        USING ERRCODE = 'check_violation';
    END IF;
    RETURN;
  ELSIF p_source_kind = 'spec_book_artifact' THEN
    RETURN QUERY
    SELECT
      revision.revision_number,
      artifact.checksum_sha256,
      book.title,
      jsonb_build_object(
        'kind', 'spec_book_artifact',
        'id', artifact.id,
        'version', revision.revision_number,
        'checksum', artifact.checksum_sha256,
        'title', book.title,
        'audience', artifact.audience,
        'issuedAt', revision.issued_at,
        'sizeBytes', artifact.size_bytes,
        'projectDocumentId', artifact.project_document_id
      )
    FROM public.spec_book_artifacts AS artifact
    JOIN public.spec_book_revisions AS revision
      ON revision.id = artifact.revision_id
    JOIN public.spec_books AS book ON book.id = revision.spec_book_id
    JOIN public.project_documents AS document
      ON document.id = artifact.project_document_id
    WHERE artifact.id = p_source_id
      AND book.project_id = p_project_id
      AND revision.status = 'issued'
      AND revision.issued_at IS NOT NULL
      AND artifact.audience = 'client'
      AND artifact.format = 'pdf'
      AND artifact.status = 'ready'
      AND artifact.checksum_sha256 IS NOT NULL
      AND artifact.rendered_at IS NOT NULL
      AND document.project_id = p_project_id
      AND document.status = 'ready'
      AND document.storage_path IS NOT DISTINCT FROM artifact.storage_path;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'issued ready client specification artifact not found for project'
        USING ERRCODE = 'check_violation';
    END IF;
    RETURN;
  ELSIF p_source_kind = 'budget_version' THEN
    SELECT * INTO v_budget
    FROM public.project_budget_versions AS budget
    WHERE budget.id = p_source_id
      AND budget.project_id = p_project_id
      AND budget.status = 'published';
    IF NOT FOUND OR v_budget.published_at IS NULL THEN
      RAISE EXCEPTION 'published budget version not found for project'
        USING ERRCODE = 'check_violation';
    END IF;

    SELECT * INTO v_checkpoint
    FROM public.project_budget_checkpoints AS checkpoint
    WHERE checkpoint.project_id = p_project_id
      AND checkpoint.budget_version_id = v_budget.id;
    IF NOT FOUND
       OR v_checkpoint.snapshot_fingerprint IS DISTINCT FROM
          public._budget_version_fingerprint(v_budget.id)
    THEN
      RAISE EXCEPTION 'published budget checkpoint fingerprint is missing or stale'
        USING ERRCODE = 'check_violation';
    END IF;

    source_version := v_budget.version;
    artifact_hash := v_checkpoint.snapshot_fingerprint;
    artifact_title := 'Budget checkpoint ' || v_checkpoint.checkpoint_code;
    safe_snapshot := jsonb_build_object(
      'kind', 'budget_version',
      'id', v_budget.id,
      'version', v_budget.version,
      'checksum', v_checkpoint.snapshot_fingerprint,
      'title', artifact_title,
      'checkpointCode', v_checkpoint.checkpoint_code,
      'publishedAt', v_checkpoint.published_at,
      'lowTotalCents', v_budget.low_total_cents,
      'targetTotalCents', v_budget.target_total_cents,
      'highTotalCents', v_budget.high_total_cents
    );
    RETURN NEXT;
    RETURN;
  ELSE
    RAISE EXCEPTION 'unsupported approval artifact kind %', p_source_kind
      USING ERRCODE = 'invalid_parameter_value';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public._resolve_project_approval_artifact(uuid, text, uuid)
  FROM PUBLIC, anon, authenticated, service_role;

-- ── Table-edge authority and immutability guards ───────────────────────────

CREATE OR REPLACE FUNCTION public.guard_project_decision_authority_edge()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_project public.projects%ROWTYPE;
  v_capability text := current_setting(
    'app.project_decision_authority_project_id', true
  );
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'project decision authority assignments cannot be deleted'
      USING ERRCODE = 'check_violation';
  END IF;
  IF current_user IS DISTINCT FROM 'postgres'
     OR v_capability IS DISTINCT FROM NEW.project_id::text
  THEN
    RAISE EXCEPTION 'project decision authority changes require the checked RPC'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO v_project
  FROM public.projects WHERE id = NEW.project_id;
  IF NOT FOUND
     OR auth.uid() IS NULL
     OR NOT public.is_design_studio_comember(v_project.designer_id)
     OR v_project.client_id IS NULL
     OR NEW.decision_lead_id IS DISTINCT FROM v_project.client_id
     OR NEW.required_coapprover_id IS NOT NULL
     OR NEW.assigned_by IS DISTINCT FROM auth.uid()
  THEN
    RAISE EXCEPTION 'project decision authority identity is not coherent'
      USING ERRCODE = 'check_violation';
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.revision <> 1 THEN
      RAISE EXCEPTION 'first authority revision must be 1'
        USING ERRCODE = 'check_violation';
    END IF;
    NEW.assigned_at := now();
    NEW.updated_at := NEW.assigned_at;
    RETURN NEW;
  END IF;

  IF NEW.project_id IS DISTINCT FROM OLD.project_id
     OR NEW.revision IS DISTINCT FROM OLD.revision + 1
     OR NEW.assigned_at IS DISTINCT FROM OLD.assigned_at
  THEN
    RAISE EXCEPTION 'authority updates must advance one immutable project revision'
      USING ERRCODE = 'check_violation';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_project_decision_authority_edge()
  FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS a_guard_project_decision_authority_edge_trg
  ON public.project_decision_authorities;
CREATE TRIGGER a_guard_project_decision_authority_edge_trg
BEFORE INSERT OR UPDATE OR DELETE ON public.project_decision_authorities
FOR EACH ROW EXECUTE FUNCTION public.guard_project_decision_authority_edge();

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
       OR NEW.sent_at IS NOT NULL
       OR NEW.responded_at IS NOT NULL
       OR NEW.selected_by IS NOT NULL
       OR NEW.client_consent_method IS NOT NULL
       OR NEW.client_consented_at IS NOT NULL
       OR NEW.client_signature IS NOT NULL
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
    IF NEW.id IS DISTINCT FROM OLD.id
       OR NEW.designer_client_id IS DISTINCT FROM OLD.designer_client_id
       OR NEW.designer_id IS DISTINCT FROM OLD.designer_id
       OR NEW.project_id IS DISTINCT FROM OLD.project_id
       OR NEW.linked_proposal_id IS DISTINCT FROM OLD.linked_proposal_id
       OR NEW.title IS DISTINCT FROM OLD.title
       OR NEW.context IS DISTINCT FROM OLD.context
       OR NEW.due_date IS DISTINCT FROM OLD.due_date
       OR NEW.linked_phase IS DISTINCT FROM OLD.linked_phase
       OR NEW.phase_id IS DISTINCT FROM OLD.phase_id
       OR NEW.room_id IS DISTINCT FROM OLD.room_id
       OR NEW.section_key IS DISTINCT FROM OLD.section_key
       OR NEW.decision_type IS DISTINCT FROM OLD.decision_type
       OR NEW.decision_kind IS DISTINCT FROM OLD.decision_kind
       OR NEW.coordination_kind IS DISTINCT FROM OLD.coordination_kind
       OR NEW.blocking_status IS DISTINCT FROM OLD.blocking_status
       OR NEW.blocks_kind IS DISTINCT FROM OLD.blocks_kind
       OR NEW.blocks_milestone_id IS DISTINCT FROM OLD.blocks_milestone_id
       OR NEW.court IS DISTINCT FROM OLD.court
       OR NEW.court_party_id IS DISTINCT FROM OLD.court_party_id
       OR NEW.approval_contract IS DISTINCT FROM OLD.approval_contract
       OR NEW.predecessor_decision_id IS DISTINCT FROM OLD.predecessor_decision_id
       OR NEW.created_at IS DISTINCT FROM OLD.created_at
    THEN
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

DROP TRIGGER IF EXISTS a_guard_stage2_client_decision_edge_trg
  ON public.client_decisions;
CREATE TRIGGER a_guard_stage2_client_decision_edge_trg
BEFORE INSERT OR UPDATE OR DELETE ON public.client_decisions
FOR EACH ROW EXECUTE FUNCTION public.guard_stage2_client_decision_edge();

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
  IF NEW.decision_id IS DISTINCT FROM OLD.decision_id
     OR NEW.name IS DISTINCT FROM OLD.name
     OR NEW.sort_order IS DISTINCT FROM OLD.sort_order
     OR NEW.approves IS DISTINCT FROM OLD.approves
     OR NEW.approval_outcome IS DISTINCT FROM OLD.approval_outcome
     OR NEW.cost_cents_delta IS DISTINCT FROM OLD.cost_cents_delta
     OR NEW.schedule_days_delta IS DISTINCT FROM OLD.schedule_days_delta
     OR NEW.lead_time_days_delta IS DISTINCT FROM OLD.lead_time_days_delta
     OR NEW.cost_delta_cents IS DISTINCT FROM OLD.cost_delta_cents
  THEN
    RAISE EXCEPTION 'Stage-2 outcome identity and impact evidence are immutable'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_stage2_client_decision_option_edge()
  FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS a_guard_stage2_client_decision_option_edge_trg
  ON public.client_decision_options;
CREATE TRIGGER a_guard_stage2_client_decision_option_edge_trg
BEFORE INSERT OR UPDATE OR DELETE ON public.client_decision_options
FOR EACH ROW EXECUTE FUNCTION public.guard_stage2_client_decision_option_edge();

CREATE OR REPLACE FUNCTION public.guard_project_approval_evidence_edge()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_decision public.client_decisions%ROWTYPE;
  v_authority public.project_decision_authorities%ROWTYPE;
  v_snapshot public.project_decision_authority_snapshots%ROWTYPE;
  v_artifact public.project_approval_artifacts%ROWTYPE;
  v_source record;
  v_decision_id uuid := CASE WHEN TG_OP = 'DELETE' THEN OLD.decision_id
                             ELSE NEW.decision_id END;
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    RAISE EXCEPTION 'project approval evidence is immutable'
      USING ERRCODE = 'check_violation';
  END IF;
  IF current_user IS DISTINCT FROM 'postgres'
     OR current_setting(
       'app.project_approval_evidence_decision_id', true
     ) IS DISTINCT FROM NEW.decision_id::text
  THEN
    RAISE EXCEPTION 'project approval evidence requires canonical authority'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO v_decision
  FROM public.client_decisions AS decision
  WHERE decision.id = v_decision_id
    AND decision.approval_contract = 'project_artifact_v1';
  IF NOT FOUND OR NEW.project_id IS DISTINCT FROM v_decision.project_id THEN
    RAISE EXCEPTION 'approval evidence parent is not coherent'
      USING ERRCODE = 'check_violation';
  END IF;

  IF TG_TABLE_NAME = 'project_decision_authority_snapshots' THEN
    IF auth.uid() IS NULL
       OR NOT public.is_design_studio_comember(v_decision.designer_id)
    THEN
      RAISE EXCEPTION 'authority snapshot requires the authenticated studio writer'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
    SELECT * INTO v_authority
    FROM public.project_decision_authorities AS authority
    WHERE authority.project_id = v_decision.project_id;
    IF NOT FOUND
       OR NEW.decision_lead_id IS DISTINCT FROM v_authority.decision_lead_id
       OR NEW.required_coapprover_id
            IS DISTINCT FROM v_authority.required_coapprover_id
       OR NEW.authority_revision IS DISTINCT FROM v_authority.revision
       OR NEW.assigned_by IS DISTINCT FROM v_authority.assigned_by
    THEN
      RAISE EXCEPTION 'authority snapshot does not match the locked assignment'
        USING ERRCODE = 'check_violation';
    END IF;
    NEW.snapshotted_at := now();
    RETURN NEW;
  ELSIF TG_TABLE_NAME = 'project_approval_artifacts' THEN
    IF auth.uid() IS NULL
       OR NOT public.is_design_studio_comember(v_decision.designer_id)
       OR NEW.context IS DISTINCT FROM v_decision.context
       OR NEW.due_at IS DISTINCT FROM v_decision.due_date
       OR NEW.phase_id IS DISTINCT FROM v_decision.phase_id
       OR (
         SELECT count(*)
         FROM public.client_decision_options AS option
         WHERE option.decision_id = v_decision.id
           AND option.approval_outcome IS NOT NULL
       ) <> 3
       OR EXISTS (
         SELECT 1
         FROM public.client_decision_options AS option
         WHERE option.decision_id = v_decision.id
           AND (
             option.cost_cents_delta IS DISTINCT FROM NEW.cost_cents_delta
             OR option.schedule_days_delta
                  IS DISTINCT FROM NEW.schedule_days_delta
             OR option.lead_time_days_delta
                  IS DISTINCT FROM NEW.lead_time_days_delta
           )
       )
    THEN
      RAISE EXCEPTION 'artifact question, due date, phase, or impacts are incoherent'
        USING ERRCODE = 'check_violation';
    END IF;

    SELECT * INTO v_source
    FROM public._resolve_project_approval_artifact(
      NEW.project_id, NEW.source_kind, NEW.source_id
    );
    IF NOT FOUND
       OR NEW.source_version IS DISTINCT FROM v_source.source_version
       OR NEW.artifact_hash IS DISTINCT FROM v_source.artifact_hash
       OR NEW.artifact_title IS DISTINCT FROM v_source.artifact_title
       OR NEW.source_snapshot IS DISTINCT FROM v_source.safe_snapshot
    THEN
      RAISE EXCEPTION 'artifact evidence does not match its immutable source'
        USING ERRCODE = 'check_violation';
    END IF;
    NEW.created_at := now();
    RETURN NEW;
  ELSIF TG_TABLE_NAME = 'project_decision_review_confirmations' THEN
    SELECT * INTO v_snapshot
    FROM public.project_decision_authority_snapshots AS snapshot
    WHERE snapshot.decision_id = NEW.decision_id;
    SELECT * INTO v_artifact
    FROM public.project_approval_artifacts AS artifact
    WHERE artifact.decision_id = NEW.decision_id;
    IF auth.uid() IS NULL
       OR NEW.approver_id IS DISTINCT FROM auth.uid()
       OR v_snapshot.id IS NULL
       OR v_artifact.id IS NULL
       OR NEW.authority_revision IS DISTINCT FROM v_snapshot.authority_revision
       OR NEW.artifact_hash IS DISTINCT FROM v_artifact.artifact_hash
       OR NEW.review_method <> 'portal_clickthrough'
       OR NOT (
         (
           NEW.approver_role = 'lead'
           AND NEW.approver_id IS NOT DISTINCT FROM v_snapshot.decision_lead_id
         )
         OR (
           NEW.approver_role = 'coapprover'
           AND v_snapshot.required_coapprover_id IS NOT NULL
           AND NEW.approver_id
                 IS NOT DISTINCT FROM v_snapshot.required_coapprover_id
         )
       )
    THEN
      RAISE EXCEPTION 'review confirmation does not match frozen authority/artifact'
        USING ERRCODE = 'check_violation';
    END IF;
    NEW.confirmed_at := now();
    RETURN NEW;
  ELSIF TG_TABLE_NAME = 'project_approval_action_receipts' THEN
    IF NEW.actor_id IS DISTINCT FROM auth.uid()
       OR NEW.request_hash !~ '^[0-9a-f]{64}$'
       OR jsonb_typeof(NEW.result) <> 'object'
       OR (
         NEW.successor_decision_id IS NOT NULL
         AND NOT EXISTS (
           SELECT 1 FROM public.client_decisions AS successor
           WHERE successor.id = NEW.successor_decision_id
             AND successor.project_id = NEW.project_id
             AND successor.predecessor_decision_id = NEW.decision_id
             AND successor.approval_contract = 'project_artifact_v1'
         )
       )
    THEN
      RAISE EXCEPTION 'approval action receipt is not coherent'
        USING ERRCODE = 'check_violation';
    END IF;
    NEW.created_at := now();
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'unsupported project approval evidence table %', TG_TABLE_NAME
    USING ERRCODE = 'check_violation';
END;
$$;

REVOKE ALL ON FUNCTION public.guard_project_approval_evidence_edge()
  FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS a_guard_project_authority_snapshot_edge_trg
  ON public.project_decision_authority_snapshots;
CREATE TRIGGER a_guard_project_authority_snapshot_edge_trg
BEFORE INSERT OR UPDATE OR DELETE
ON public.project_decision_authority_snapshots
FOR EACH ROW EXECUTE FUNCTION public.guard_project_approval_evidence_edge();

DROP TRIGGER IF EXISTS a_guard_project_approval_artifact_edge_trg
  ON public.project_approval_artifacts;
CREATE TRIGGER a_guard_project_approval_artifact_edge_trg
BEFORE INSERT OR UPDATE OR DELETE ON public.project_approval_artifacts
FOR EACH ROW EXECUTE FUNCTION public.guard_project_approval_evidence_edge();

DROP TRIGGER IF EXISTS a_guard_project_review_confirmation_edge_trg
  ON public.project_decision_review_confirmations;
CREATE TRIGGER a_guard_project_review_confirmation_edge_trg
BEFORE INSERT OR UPDATE OR DELETE
ON public.project_decision_review_confirmations
FOR EACH ROW EXECUTE FUNCTION public.guard_project_approval_evidence_edge();

DROP TRIGGER IF EXISTS a_guard_project_approval_receipt_edge_trg
  ON public.project_approval_action_receipts;
CREATE TRIGGER a_guard_project_approval_receipt_edge_trg
BEFORE INSERT OR UPDATE OR DELETE ON public.project_approval_action_receipts
FOR EACH ROW EXECUTE FUNCTION public.guard_project_approval_evidence_edge();

-- Narrow reviewer boolean used by the artifact RLS policy while the private
-- authority snapshot itself remains unreadable to clients.
CREATE OR REPLACE FUNCTION public.is_project_approval_reviewer(
  p_decision_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.project_decision_authority_snapshots AS snapshot
      JOIN public.client_decisions AS decision ON decision.id = snapshot.decision_id
      WHERE snapshot.decision_id = p_decision_id
        AND decision.approval_contract = 'project_artifact_v1'
        AND auth.uid() IN (
          snapshot.decision_lead_id,
          snapshot.required_coapprover_id
        )
    );
$$;

REVOKE ALL ON FUNCTION public.is_project_approval_reviewer(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_project_approval_reviewer(uuid)
  TO authenticated;

-- ── RLS and explicit ACLs ──────────────────────────────────────────────────

ALTER TABLE public.project_decision_authorities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_decision_authority_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_approval_artifacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_decision_review_confirmations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_approval_action_receipts ENABLE ROW LEVEL SECURITY;

CREATE POLICY project_decision_authorities_studio_select
ON public.project_decision_authorities FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.projects AS project
    WHERE project.id = project_decision_authorities.project_id
      AND public.is_design_studio_comember(project.designer_id)
  )
);

CREATE POLICY project_authority_snapshots_studio_select
ON public.project_decision_authority_snapshots FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.projects AS project
    WHERE project.id = project_decision_authority_snapshots.project_id
      AND public.is_design_studio_comember(project.designer_id)
  )
);

CREATE POLICY project_approval_artifacts_studio_select
ON public.project_approval_artifacts FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.projects AS project
    WHERE project.id = project_approval_artifacts.project_id
      AND public.is_design_studio_comember(project.designer_id)
  )
);

CREATE POLICY project_approval_artifacts_reviewer_select
ON public.project_approval_artifacts FOR SELECT TO authenticated
USING (public.is_project_approval_reviewer(decision_id));

CREATE POLICY project_review_confirmations_studio_select
ON public.project_decision_review_confirmations FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.projects AS project
    WHERE project.id = project_decision_review_confirmations.project_id
      AND public.is_design_studio_comember(project.designer_id)
  )
);

CREATE POLICY project_approval_receipts_studio_select
ON public.project_approval_action_receipts FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.projects AS project
    WHERE project.id = project_approval_action_receipts.project_id
      AND public.is_design_studio_comember(project.designer_id)
  )
);

REVOKE ALL ON TABLE public.project_decision_authorities
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public.project_decision_authority_snapshots
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public.project_approval_artifacts
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public.project_decision_review_confirmations
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public.project_approval_action_receipts
  FROM PUBLIC, anon, authenticated, service_role;

GRANT SELECT ON TABLE public.project_decision_authorities
  TO authenticated, service_role;
GRANT SELECT ON TABLE public.project_decision_authority_snapshots
  TO authenticated, service_role;
GRANT SELECT ON TABLE public.project_approval_artifacts
  TO authenticated, service_role;
GRANT SELECT ON TABLE public.project_decision_review_confirmations
  TO authenticated, service_role;
GRANT SELECT ON TABLE public.project_approval_action_receipts
  TO authenticated, service_role;

-- ── Checked authority assignment ───────────────────────────────────────────

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
        USING ERRCODE = 'serialization_failure';
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
        USING ERRCODE = 'serialization_failure';
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

REVOKE ALL ON FUNCTION public.set_project_decision_authority(
  uuid, uuid, uuid, integer
) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.set_project_decision_authority(
  uuid, uuid, uuid, integer
) TO authenticated;

COMMENT ON FUNCTION public.set_project_decision_authority(
  uuid, uuid, uuid, integer
) IS
  'Assigns one explicit household decision lead under optimistic revision. At '
  '00435 the lead must equal projects.client_id and coapprover must remain NULL.';

-- ── Atomic Stage-2 draft creation ──────────────────────────────────────────

CREATE OR REPLACE FUNCTION public._create_project_approval_decision_checked(
  p_project_id uuid,
  p_payload jsonb,
  p_idempotency_key text,
  p_predecessor_decision_id uuid
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
  v_relationship public.designer_clients%ROWTYPE;
  v_receipt public.project_approval_action_receipts%ROWTYPE;
  v_source record;
  v_unknown jsonb;
  v_title text;
  v_question text;
  v_context text;
  v_due_at timestamptz;
  v_phase_id uuid;
  v_section_key text;
  v_source_kind text;
  v_source_id uuid;
  v_cost_delta integer;
  v_schedule_delta integer;
  v_lead_delta integer;
  v_key text := btrim(COALESCE(p_idempotency_key, ''));
  v_request jsonb;
  v_request_hash text;
  v_decision_id uuid := extensions.gen_random_uuid();
  v_snapshot_id uuid := extensions.gen_random_uuid();
  v_artifact_id uuid := extensions.gen_random_uuid();
  v_receipt_id uuid := extensions.gen_random_uuid();
  v_decision_updated_at timestamptz;
  v_result jsonb;
  v_previous_decision_insert text := current_setting(
    'app.project_approval_decision_insert_id', true
  );
  v_previous_option_insert text := current_setting(
    'app.project_approval_option_decision_id', true
  );
  v_previous_evidence_insert text := current_setting(
    'app.project_approval_evidence_decision_id', true
  );
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'project approval creation requires an authenticated studio actor'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_payload IS NULL OR jsonb_typeof(p_payload) <> 'object' THEN
    RAISE EXCEPTION 'p_payload must be a JSON object'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;
  IF v_key = '' OR char_length(v_key) > 200 THEN
    RAISE EXCEPTION 'idempotency key must contain 1 to 200 characters'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  v_unknown := p_payload - ARRAY[
    'title', 'question', 'context', 'dueAt', 'phaseId', 'sectionKey',
    'artifactKind', 'artifactId', 'costCentsDelta',
    'scheduleDaysDelta', 'leadTimeDaysDelta'
  ];
  IF v_unknown <> '{}'::jsonb THEN
    RAISE EXCEPTION 'unsupported project approval payload keys: %', v_unknown
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  v_title := btrim(COALESCE(p_payload->>'title', ''));
  v_question := btrim(COALESCE(p_payload->>'question', ''));
  v_context := NULLIF(btrim(COALESCE(p_payload->>'context', '')), '');
  IF char_length(v_title) NOT BETWEEN 1 AND 240 THEN
    RAISE EXCEPTION 'approval title must contain 1 to 240 characters'
      USING ERRCODE = 'check_violation';
  END IF;
  IF char_length(v_question) NOT BETWEEN 1 AND 500 THEN
    RAISE EXCEPTION 'approval question must contain 1 to 500 characters'
      USING ERRCODE = 'check_violation';
  END IF;
  IF NOT (p_payload ? 'dueAt')
     OR NULLIF(p_payload->>'dueAt', '') IS NULL
  THEN
    RAISE EXCEPTION 'approval dueAt is required'
      USING ERRCODE = 'check_violation';
  END IF;
  v_due_at := (p_payload->>'dueAt')::timestamptz;

  IF NOT (p_payload ? 'phaseId')
     OR NULLIF(p_payload->>'phaseId', '') IS NULL
  THEN
    RAISE EXCEPTION 'approval phaseId is required'
      USING ERRCODE = 'check_violation';
  END IF;
  v_phase_id := (p_payload->>'phaseId')::uuid;
  v_section_key := NULLIF(p_payload->>'sectionKey', '');
  v_source_kind := NULLIF(p_payload->>'artifactKind', '');
  v_source_id := NULLIF(p_payload->>'artifactId', '')::uuid;
  IF v_source_kind IS NULL OR v_source_id IS NULL THEN
    RAISE EXCEPTION 'one artifactKind and artifactId are required'
      USING ERRCODE = 'check_violation';
  END IF;

  IF NOT (p_payload ?& ARRAY[
       'costCentsDelta', 'scheduleDaysDelta', 'leadTimeDaysDelta'
     ])
     OR jsonb_typeof(p_payload->'costCentsDelta') <> 'number'
     OR jsonb_typeof(p_payload->'scheduleDaysDelta') <> 'number'
     OR jsonb_typeof(p_payload->'leadTimeDaysDelta') <> 'number'
     OR p_payload->>'costCentsDelta' !~ '^-?[0-9]+$'
     OR p_payload->>'scheduleDaysDelta' !~ '^-?[0-9]+$'
     OR p_payload->>'leadTimeDaysDelta' !~ '^-?[0-9]+$'
  THEN
    RAISE EXCEPTION 'all three signed integer impact deltas are required'
      USING ERRCODE = 'check_violation';
  END IF;
  BEGIN
    v_cost_delta := (p_payload->>'costCentsDelta')::integer;
    v_schedule_delta := (p_payload->>'scheduleDaysDelta')::integer;
    v_lead_delta := (p_payload->>'leadTimeDaysDelta')::integer;
  EXCEPTION WHEN numeric_value_out_of_range THEN
    RAISE EXCEPTION 'impact deltas must fit signed int32'
      USING ERRCODE = 'numeric_value_out_of_range';
  END;

  v_request := jsonb_build_object(
    'projectId', p_project_id,
    'predecessorDecisionId', p_predecessor_decision_id,
    'title', v_title,
    'question', v_question,
    'context', v_context,
    'dueAt', v_due_at,
    'phaseId', v_phase_id,
    'sectionKey', v_section_key,
    'artifactKind', v_source_kind,
    'artifactId', v_source_id,
    'costCentsDelta', v_cost_delta,
    'scheduleDaysDelta', v_schedule_delta,
    'leadTimeDaysDelta', v_lead_delta
  );
  v_request_hash := public._project_approval_hash(v_request);

  SELECT * INTO v_project
  FROM public.projects AS project
  WHERE project.id = p_project_id
  FOR UPDATE;
  IF NOT FOUND OR NOT public.is_design_studio_comember(v_project.designer_id) THEN
    RAISE EXCEPTION 'project not found or approval creation denied'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO v_receipt
  FROM public.project_approval_action_receipts AS receipt
  WHERE receipt.project_id = p_project_id
    AND receipt.action_kind = 'created'
    AND receipt.idempotency_key = v_key
  FOR UPDATE;
  IF FOUND THEN
    IF v_receipt.request_hash IS DISTINCT FROM v_request_hash
       OR v_receipt.actor_id IS DISTINCT FROM v_actor
    THEN
      RAISE EXCEPTION 'idempotency key was reused with a different create request'
        USING ERRCODE = 'unique_violation';
    END IF;
    RETURN v_receipt.result || jsonb_build_object('idempotent', true);
  END IF;
  IF v_due_at <= now() THEN
    RAISE EXCEPTION 'approval dueAt must be in the future'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO v_authority
  FROM public.project_decision_authorities AS authority
  WHERE authority.project_id = p_project_id
  FOR SHARE;
  IF NOT FOUND
     OR v_project.client_id IS NULL
     OR v_authority.decision_lead_id IS DISTINCT FROM v_project.client_id
     OR v_authority.required_coapprover_id IS NOT NULL
  THEN
    RAISE EXCEPTION 'project has no valid explicit household approval authority'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO v_relationship
  FROM public.designer_clients AS relationship
  WHERE relationship.designer_id = v_project.designer_id
    AND relationship.client_id = v_project.client_id
    AND relationship.status = 'active'
  ORDER BY relationship.created_at, relationship.id
  LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'project has no exact active designer-client relationship'
      USING ERRCODE = 'check_violation';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.project_phases AS phase
    WHERE phase.id = v_phase_id AND phase.project_id = p_project_id
  ) THEN
    RAISE EXCEPTION 'approval phase must belong to the project'
      USING ERRCODE = 'check_violation';
  END IF;
  IF p_predecessor_decision_id IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM public.client_decisions AS predecessor
       WHERE predecessor.id = p_predecessor_decision_id
         AND predecessor.project_id = p_project_id
         AND predecessor.approval_contract = 'project_artifact_v1'
     )
  THEN
    RAISE EXCEPTION 'Stage-2 predecessor must belong to the same project'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO v_source
  FROM public._resolve_project_approval_artifact(
    p_project_id, v_source_kind, v_source_id
  );

  PERFORM set_config(
    'app.project_approval_decision_insert_id', v_decision_id::text, true
  );
  INSERT INTO public.client_decisions (
    id, designer_client_id, project_id, title, context, due_date,
    status, decision_type, decision_kind, coordination_kind,
    blocking_status, blocks_kind, court, designer_id, phase_id,
    section_key, approval_contract, predecessor_decision_id
  ) VALUES (
    v_decision_id, v_relationship.id, p_project_id, v_title, v_context, v_due_at,
    'draft', 'approval', 'approval', 'signoff',
    'blocks_phase', 'phase',
    'client', v_project.designer_id, v_phase_id, v_section_key,
    'project_artifact_v1', p_predecessor_decision_id
  ) RETURNING updated_at INTO v_decision_updated_at;
  PERFORM set_config(
    'app.project_approval_decision_insert_id',
    COALESCE(v_previous_decision_insert, ''), true
  );

  PERFORM set_config(
    'app.project_approval_evidence_decision_id', v_decision_id::text, true
  );
  INSERT INTO public.project_decision_authority_snapshots (
    id, decision_id, project_id, decision_lead_id,
    required_coapprover_id, authority_revision, assigned_by
  ) VALUES (
    v_snapshot_id, v_decision_id, p_project_id,
    v_authority.decision_lead_id, v_authority.required_coapprover_id,
    v_authority.revision, v_authority.assigned_by
  );

  PERFORM set_config(
    'app.project_approval_option_decision_id', v_decision_id::text, true
  );
  INSERT INTO public.client_decision_options (
    decision_id, name, designer_note, quantity, cost_delta_cents,
    lead_time_days_delta, approves, selected, sort_order,
    approval_outcome, cost_cents_delta, schedule_days_delta
  ) VALUES
    (v_decision_id, 'Approved', NULL, 1, v_cost_delta,
     v_lead_delta, true, false, 0, 'approved', v_cost_delta, v_schedule_delta),
    (v_decision_id, 'Changes requested', NULL, 1, v_cost_delta,
     v_lead_delta, false, false, 1, 'changes_requested', v_cost_delta, v_schedule_delta),
    (v_decision_id, 'Needs discussion', NULL, 1, v_cost_delta,
     v_lead_delta, false, false, 2, 'needs_discussion', v_cost_delta, v_schedule_delta);
  PERFORM set_config(
    'app.project_approval_option_decision_id',
    COALESCE(v_previous_option_insert, ''), true
  );

  INSERT INTO public.project_approval_artifacts (
    id, decision_id, project_id, source_kind, source_id, source_version,
    artifact_hash, artifact_title, question, context, due_at, phase_id,
    cost_cents_delta, schedule_days_delta, lead_time_days_delta,
    source_snapshot
  ) VALUES (
    v_artifact_id, v_decision_id, p_project_id, v_source_kind, v_source_id,
    v_source.source_version, v_source.artifact_hash, v_source.artifact_title,
    v_question, v_context, v_due_at, v_phase_id,
    v_cost_delta, v_schedule_delta, v_lead_delta, v_source.safe_snapshot
  );

  v_result := jsonb_build_object(
    'receiptId', v_receipt_id,
    'projectId', p_project_id,
    'decisionId', v_decision_id,
    'authoritySnapshotId', v_snapshot_id,
    'artifactId', v_artifact_id,
    'artifactHash', v_source.artifact_hash,
    'authorityRevision', v_authority.revision,
    'predecessorDecisionId', p_predecessor_decision_id,
    'updatedAt', v_decision_updated_at,
    'status', 'draft'
  );
  INSERT INTO public.project_approval_action_receipts (
    id, project_id, decision_id, action_kind, idempotency_key,
    request_hash, actor_id, result
  ) VALUES (
    v_receipt_id, p_project_id, v_decision_id, 'created', v_key,
    v_request_hash, v_actor, v_result
  );
  PERFORM set_config(
    'app.project_approval_evidence_decision_id',
    COALESCE(v_previous_evidence_insert, ''), true
  );

  RETURN v_result || jsonb_build_object('idempotent', false);
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config(
    'app.project_approval_decision_insert_id',
    COALESCE(v_previous_decision_insert, ''), true
  );
  PERFORM set_config(
    'app.project_approval_option_decision_id',
    COALESCE(v_previous_option_insert, ''), true
  );
  PERFORM set_config(
    'app.project_approval_evidence_decision_id',
    COALESCE(v_previous_evidence_insert, ''), true
  );
  RAISE;
END;
$$;

REVOKE ALL ON FUNCTION public._create_project_approval_decision_checked(
  uuid, jsonb, text, uuid
)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.create_project_approval_decision(
  p_project_id uuid,
  p_payload jsonb,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT public._create_project_approval_decision_checked(
    p_project_id, p_payload, p_idempotency_key, NULL
  );
$$;

REVOKE ALL ON FUNCTION public.create_project_approval_decision(uuid, jsonb, text)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.create_project_approval_decision(uuid, jsonb, text)
  TO authenticated;

COMMENT ON FUNCTION public.create_project_approval_decision(uuid, jsonb, text) IS
  'Atomically creates one Stage-2 draft, authority snapshot, client-safe '
  'immutable artifact, three canonical outcomes with one explicit signed '
  'impact triplet, and one idempotency receipt. The public entry point always '
  'creates an original request with no predecessor.';

-- ── Authenticated, artifact-bound review confirmation ─────────────────────

CREATE OR REPLACE FUNCTION public.confirm_project_decision_review(
  p_decision_id uuid,
  p_payload jsonb,
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
  v_snapshot public.project_decision_authority_snapshots%ROWTYPE;
  v_artifact public.project_approval_artifacts%ROWTYPE;
  v_receipt public.project_approval_action_receipts%ROWTYPE;
  v_confirmation public.project_decision_review_confirmations%ROWTYPE;
  v_unknown jsonb;
  v_authority_revision integer;
  v_artifact_hash text;
  v_review_method text;
  v_approver_role text;
  v_key text := btrim(COALESCE(p_idempotency_key, ''));
  v_request jsonb;
  v_request_hash text;
  v_confirmation_id uuid := extensions.gen_random_uuid();
  v_receipt_id uuid := extensions.gen_random_uuid();
  v_result jsonb;
  v_previous_evidence_insert text := current_setting(
    'app.project_approval_evidence_decision_id', true
  );
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'project approval review requires an authenticated reviewer'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_decision_id IS NULL THEN
    RAISE EXCEPTION 'decision id is required'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;
  IF p_payload IS NULL OR jsonb_typeof(p_payload) <> 'object' THEN
    RAISE EXCEPTION 'p_payload must be a JSON object'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;
  IF v_key = '' OR char_length(v_key) > 200 THEN
    RAISE EXCEPTION 'idempotency key must contain 1 to 200 characters'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  v_unknown := p_payload - ARRAY[
    'authorityRevision', 'artifactHash', 'reviewMethod'
  ];
  IF v_unknown <> '{}'::jsonb THEN
    RAISE EXCEPTION 'unsupported project review payload keys: %', v_unknown
      USING ERRCODE = 'invalid_parameter_value';
  END IF;
  IF jsonb_typeof(p_payload->'authorityRevision') <> 'number'
     OR p_payload->>'authorityRevision' !~ '^[0-9]+$'
  THEN
    RAISE EXCEPTION 'authorityRevision must be a positive integer'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;
  BEGIN
    v_authority_revision := (p_payload->>'authorityRevision')::integer;
  EXCEPTION WHEN numeric_value_out_of_range THEN
    RAISE EXCEPTION 'authorityRevision must fit signed int32'
      USING ERRCODE = 'numeric_value_out_of_range';
  END;
  IF v_authority_revision <= 0 THEN
    RAISE EXCEPTION 'authorityRevision must be positive'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;
  v_artifact_hash := COALESCE(p_payload->>'artifactHash', '');
  IF v_artifact_hash !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'artifactHash must be a lowercase SHA-256 digest'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;
  v_review_method := COALESCE(p_payload->>'reviewMethod', '');
  IF v_review_method <> 'portal_clickthrough' THEN
    RAISE EXCEPTION 'reviewMethod must be portal_clickthrough'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  v_request := jsonb_build_object(
    'decisionId', p_decision_id,
    'authorityRevision', v_authority_revision,
    'artifactHash', v_artifact_hash,
    'reviewMethod', v_review_method
  );
  v_request_hash := public._project_approval_hash(v_request);

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
  IF v_snapshot.id IS NULL OR v_artifact.id IS NULL THEN
    RAISE EXCEPTION 'project approval evidence is incomplete'
      USING ERRCODE = 'check_violation';
  END IF;
  IF v_actor = v_snapshot.decision_lead_id THEN
    v_approver_role := 'lead';
  ELSIF v_snapshot.required_coapprover_id IS NOT NULL
        AND v_actor = v_snapshot.required_coapprover_id
  THEN
    v_approver_role := 'coapprover';
  ELSE
    RAISE EXCEPTION 'actor is not a reviewer in the frozen authority snapshot'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO v_receipt
  FROM public.project_approval_action_receipts AS receipt
  WHERE receipt.decision_id = p_decision_id
    AND receipt.action_kind = 'review_confirmed'
    AND receipt.idempotency_key = v_key
  FOR UPDATE;
  IF FOUND THEN
    IF v_receipt.request_hash IS DISTINCT FROM v_request_hash
       OR v_receipt.actor_id IS DISTINCT FROM v_actor
    THEN
      RAISE EXCEPTION 'idempotency key was reused with a different review request'
        USING ERRCODE = 'unique_violation';
    END IF;
    RETURN v_receipt.result || jsonb_build_object('idempotent', true);
  END IF;

  IF v_decision.status <> 'draft'
     OR v_authority_revision IS DISTINCT FROM v_snapshot.authority_revision
     OR v_artifact_hash IS DISTINCT FROM v_artifact.artifact_hash
  THEN
    RAISE EXCEPTION 'review does not match the current draft authority and artifact'
      USING ERRCODE = 'check_violation';
  END IF;

  PERFORM set_config(
    'app.project_approval_evidence_decision_id', p_decision_id::text, true
  );
  INSERT INTO public.project_decision_review_confirmations (
    id, decision_id, project_id, authority_revision, approver_id,
    approver_role, artifact_hash, review_method
  ) VALUES (
    v_confirmation_id, p_decision_id, v_decision.project_id,
    v_authority_revision, v_actor, v_approver_role,
    v_artifact_hash, v_review_method
  ) RETURNING * INTO v_confirmation;

  v_result := jsonb_build_object(
    'receiptId', v_receipt_id,
    'projectId', v_decision.project_id,
    'decisionId', p_decision_id,
    'confirmationId', v_confirmation.id,
    'authorityRevision', v_confirmation.authority_revision,
    'artifactHash', v_confirmation.artifact_hash,
    'reviewMethod', v_confirmation.review_method,
    'confirmedAt', v_confirmation.confirmed_at
  );
  INSERT INTO public.project_approval_action_receipts (
    id, project_id, decision_id, action_kind, idempotency_key,
    request_hash, actor_id, result
  ) VALUES (
    v_receipt_id, v_decision.project_id, p_decision_id,
    'review_confirmed', v_key, v_request_hash, v_actor, v_result
  );
  PERFORM set_config(
    'app.project_approval_evidence_decision_id',
    COALESCE(v_previous_evidence_insert, ''), true
  );

  RETURN v_result || jsonb_build_object('idempotent', false);
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config(
    'app.project_approval_evidence_decision_id',
    COALESCE(v_previous_evidence_insert, ''), true
  );
  RAISE;
END;
$$;

REVOKE ALL ON FUNCTION public.confirm_project_decision_review(uuid, jsonb, text)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.confirm_project_decision_review(uuid, jsonb, text)
  TO authenticated;

COMMENT ON FUNCTION public.confirm_project_decision_review(uuid, jsonb, text) IS
  'Records server-time portal click-through evidence from an exact frozen '
  'reviewer, bound to the immutable artifact hash and authority revision.';
