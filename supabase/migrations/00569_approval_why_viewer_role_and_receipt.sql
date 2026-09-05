-- ═══════════════════════════════════════════════════════════════════════════
-- 00569 — The designer's why, the viewer's chair, and the client's receipt
--
-- Program: "The Decision, Delivered" · Wave 2 · P-13 (data half), P-20, and
-- the Wave-1 carry iosb3-M2.
--
-- Three things, one transaction:
--
--   1. P-13 — `project_approval_artifacts.why`. The composer's first field:
--      one line in the designer's own register, frozen into the immutable
--      artifact beside the question it explains. Additive and nullable, with
--      no backfill: an approval created before this migration simply has no
--      why, and every renderer already treats it as absent. ≤ 200 characters,
--      enforced by CHECK on the column AND by the creating RPC, so a direct
--      writer and an RPC caller are refused by the same rule. Supersession
--      carries it too: a revision either re-asks the why or inherits the
--      predecessor's, and never loses it. `why_author_name` freezes WHO wrote
--      the line beside the line itself, so a later rename cannot rewrite what
--      the homeowner already read.
--
--   2. iosb3-M2 — `viewerRole` on the sanitized projection. Wave 1 shipped
--      `list_my_project_decision_reviews` returning every Stage-2 approval in
--      every project a studio co-member co-authors, with no field on the row
--      naming the frozen lead. A studio person signed into the CLIENT app
--      therefore saw studio-wide approvals drawn as "waiting on you". The
--      projection now says which chair the caller is sitting in for each row
--      — lead | studio | household — and the clients stop guessing.
--      Ruled at Wave-1 close: "the viewer-role field is a Wave 2 migration
--      item."
--
--   3. P-20 — the approval receipt. `_enqueue_decision_notification` addresses
--      the DESIGNER on `decision_resolved` (00466); the homeowner who just
--      performed the largest act in the product heard nothing back (defect
--      D9). `_respond_project_approval_checked` now also calls
--      `notify_client_attention` (00534) — the client rail that writes the
--      bell row and the push envelope — and freezes the names of the FF&E
--      items the answer actually released into the immutable `responded`
--      receipt, so the letter can name the real consequence (R9) instead of
--      inventing one. The receipt email rides `decision-resolved-notify`,
--      which 00174's trigger already fires on this exact transition.
--
--   4. P-18/R1 — the public `respond_project_approval` wrapper accepts
--      `clientConsentMethod` + `clientSignature` and passes them to the
--      checked responder, which has taken and validated the pair since 00464
--      but could never be handed it from a client surface. Folded in from the
--      web lane's 00570 by the mid-Wave-2 ruling that Wave 2 mints exactly one
--      migration; that file is deleted at integration.
--
-- No new notification kind is minted: notify_client_attention derives
-- notification_log.type from the entity and dedupes the bell row on
-- (user, entity_type, entity_id) while unopened, so the receipt replaces the
-- unread "needs you" line for the same approval rather than stacking beside
-- it. 'decision_receipt' lives in metadata.kind, colliding with no dedupe key.
--
-- Every redefined body is grafted from its latest prior definition:
--   _create_project_approval_decision_checked / create_project_approval_decision
--     ← 00463 (unchanged since)
--   supersede_project_approval_decision         ← 00464 (unchanged since)
--   get_project_decision_reviews                ← 00465
--   _respond_project_approval_checked           ← 00464 (unchanged since)
--
-- The two creating RPCs and the superseding one each gain a defaulted trailing
-- parameter, which would make a call at the old arity ambiguous against the
-- installed signature — so the old signature is DROPped first (the 00400 /
-- 00475 precedent). Nothing else in the tree references them by exact
-- signature except their own REVOKE/GRANT.
--
-- Adds GRANT/REVOKE → regenerate seed/00-legacy-grants.sql.
--
-- Lineage: 00463 (authority + immutable artifact) → 00464 (lifecycle, respond,
-- FF&E release) → 00465 (projection + traceability) → 00466 (enqueue requeue)
-- → 00467 (client access) → 00534 (notify_client_attention, the client rail)
-- → 00174 (decision_dispatch_resolved_email, the receipt's producer trigger)
-- → 00568 (first notice) → 00569.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── P-13. The frozen one-line why ──────────────────────────────────────────

ALTER TABLE public.project_approval_artifacts
  ADD COLUMN IF NOT EXISTS why text;

ALTER TABLE public.project_approval_artifacts
  ADD COLUMN IF NOT EXISTS why_author_name text;

ALTER TABLE public.project_approval_artifacts
  DROP CONSTRAINT IF EXISTS project_approval_artifacts_why_check,
  ADD CONSTRAINT project_approval_artifacts_why_check CHECK (
    why IS NULL OR char_length(btrim(why)) BETWEEN 1 AND 200
  );

-- The attribution is frozen WITH the sentence and never without it: a name
-- under no line attributes nothing, and would render as a bare "— Leah".
ALTER TABLE public.project_approval_artifacts
  DROP CONSTRAINT IF EXISTS project_approval_artifacts_why_author_check,
  ADD CONSTRAINT project_approval_artifacts_why_author_check CHECK (
    (why_author_name IS NULL OR char_length(btrim(why_author_name)) BETWEEN 1 AND 120)
    AND (why IS NOT NULL OR why_author_name IS NULL)
  );

COMMENT ON COLUMN public.project_approval_artifacts.why IS
  'P-13: the designer''s one-line why, composed as the first field of the ask '
  'and frozen here with the rest of the evidence. NULL on every artifact '
  'created before 00569 and on every ask whose author left it empty.';

COMMENT ON COLUMN public.project_approval_artifacts.why_author_name IS
  'P-13: who wrote the why, frozen beside it at compose time — the composing '
  'designer''s given name (profiles.full_name''s first word, else '
  'display_name), taken from the caller. Frozen rather than joined so a later '
  'rename does not rewrite what the homeowner already read; NULL whenever the '
  'why is NULL, and NULL when the author had no name on file (an attribution '
  'is dropped, never invented).';

-- ── P-20. One sentence for what an answer let go ───────────────────────────
--
-- The receipt names the real consequence or claims none (R9). Words instead of
-- numbers where words will do; past twenty, the count stops being a word worth
-- reading and the sentence names the fact without it. Kept as its own function
-- so the bell, the push and the SQL tests all read the identical sentence; the
-- email renderer mirrors it in _shared/decision-notify.ts.
CREATE OR REPLACE FUNCTION public._project_approval_release_sentence(
  p_names text[]
)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT CASE COALESCE(cardinality(p_names), 0)
    WHEN 0 THEN 'Your answer is on the record.'
    WHEN 1 THEN 'It releases ' || p_names[1] || '.'
    WHEN 2 THEN 'It releases ' || p_names[1] || ' and ' || p_names[2] || '.'
    ELSE 'It releases ' || COALESCE(
      (ARRAY[
        'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten',
        'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen',
        'seventeen', 'eighteen', 'nineteen', 'twenty'
      ])[cardinality(p_names) - 2],
      'the'
    ) || ' pieces that were waiting on it.'
  END;
$$;

REVOKE ALL ON FUNCTION public._project_approval_release_sentence(text[])
  FROM PUBLIC, anon, authenticated, service_role;

COMMENT ON FUNCTION public._project_approval_release_sentence(text[]) IS
  'P-20/R9: the receipt''s consequence clause. Names the released pieces when '
  'there are one or two, counts them in words up to twenty, and claims nothing '
  'at all when the answer released nothing.';

-- ── P-13. The creating RPCs learn the why ──────────────────────────────────

DROP FUNCTION IF EXISTS public.create_project_approval_decision(uuid, jsonb, text);
DROP FUNCTION IF EXISTS public._create_project_approval_decision_checked(
  uuid, jsonb, text, uuid
);

-- `p_why_author_name` is private, defaulted, and passed by exactly one caller:
-- `supersede_project_approval_decision`, when the successor INHERITS its
-- predecessor's line. Everyone else leaves it absent and the author resolves
-- from the caller, which is the same person who just typed the sentence.
CREATE OR REPLACE FUNCTION public._create_project_approval_decision_checked(
  p_project_id uuid,
  p_payload jsonb,
  p_idempotency_key text,
  p_predecessor_decision_id uuid,
  p_why text DEFAULT NULL,
  p_why_author_name text DEFAULT NULL
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
  v_why text := NULLIF(btrim(COALESCE(p_why, '')), '');
  v_why_author_name text := NULLIF(btrim(COALESCE(p_why_author_name, '')), '');
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
  IF v_why IS NOT NULL AND char_length(v_why) > 200 THEN
    RAISE EXCEPTION 'approval why must contain at most 200 characters'
      USING ERRCODE = 'check_violation';
  END IF;

  -- P-13: who said it, frozen with what was said. Resolved from the caller's
  -- own profile unless a predecessor's attribution was handed in with an
  -- inherited line. A name long enough to break the column is TRUNCATED, never
  -- raised on: a person's name is not a reason to refuse an approval.
  IF v_why IS NULL THEN
    v_why_author_name := NULL;
  ELSIF v_why_author_name IS NULL THEN
    -- The same rule `_shared/branded-email.ts`'s givenName() applies to the
    -- sign-off: the first whitespace-separated token, everything after it
    -- being the studio's business rather than the greeting's.
    SELECT COALESCE(
             NULLIF(
               split_part(
                 regexp_replace(btrim(COALESCE(author.full_name, '')),
                                '\s+', ' ', 'g'),
                 ' ', 1
               ), ''
             ),
             NULLIF(btrim(COALESCE(author.display_name, '')), '')
           )
    INTO v_why_author_name
    FROM public.profiles AS author
    WHERE author.id = v_actor;
  END IF;
  v_why_author_name := NULLIF(btrim(left(COALESCE(v_why_author_name, ''), 120)), '');

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
  -- The why joins the hashed request only when there IS one. Adding a
  -- null-valued key unconditionally would change the hash of every
  -- why-less create, so an idempotency key minted before this migration and
  -- retried after it would be rejected as "reused with a different request".
  IF v_why IS NOT NULL THEN
    v_request := v_request || jsonb_build_object('why', v_why);
  END IF;
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
    artifact_hash, artifact_title, question, context, why, why_author_name,
    due_at, phase_id,
    cost_cents_delta, schedule_days_delta, lead_time_days_delta,
    source_snapshot
  ) VALUES (
    v_artifact_id, v_decision_id, p_project_id, v_source_kind, v_source_id,
    v_source.source_version, v_source.artifact_hash, v_source.artifact_title,
    v_question, v_context, v_why, v_why_author_name, v_due_at, v_phase_id,
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
  uuid, jsonb, text, uuid, text, text
)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.create_project_approval_decision(
  p_project_id uuid,
  p_payload jsonb,
  p_idempotency_key text,
  p_why text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT public._create_project_approval_decision_checked(
    p_project_id, p_payload, p_idempotency_key, NULL, p_why
  );
$$;

REVOKE ALL ON FUNCTION public.create_project_approval_decision(uuid, jsonb, text, text)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.create_project_approval_decision(uuid, jsonb, text, text)
  TO authenticated;

COMMENT ON FUNCTION public.create_project_approval_decision(uuid, jsonb, text, text) IS
  'Atomically creates one Stage-2 draft, authority snapshot, client-safe '
  'immutable artifact, three canonical outcomes with one explicit signed '
  'impact triplet, and one idempotency receipt. The public entry point always '
  'creates an original request with no predecessor. p_why freezes the '
  'designer''s one-line note into the immutable artifact row, alongside the '
  'caller''s own given name as why_author_name (P-13).';


-- ── P-13. The revision keeps the why (r1-B2) ───────────────────────────────
--
-- `supersede_project_approval_decision` builds the successor by calling the
-- creator, so until now a reissued approval could carry no why at all: the
-- call passed four arguments, and `why` is a parameter rather than a payload
-- key, so the composer had no way to send one and the predecessor's line
-- vanished on every revision. Since revision is the normal sequel to a
-- RETURNED approval (P-16), that emptied the composer's first field exactly
-- when the homeowner had already asked once for more.
--
-- The RPC gains the same defaulted trailing `p_why` the creator got, which
-- makes a 4-argument call ambiguous against the installed signature — so the
-- old signature is DROPped first, as this migration already does for the two
-- creating RPCs (the 00400 / 00475 precedent).
--
-- Body grafted from 00464 (unchanged since); four edits, all marked.

DROP FUNCTION IF EXISTS public.supersede_project_approval_decision(
  uuid, jsonb, timestamptz, text
);

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

REVOKE ALL ON FUNCTION public.supersede_project_approval_decision(
  uuid, jsonb, timestamptz, text, text
) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.supersede_project_approval_decision(
  uuid, jsonb, timestamptz, text, text
) TO authenticated;

COMMENT ON FUNCTION public.supersede_project_approval_decision(
  uuid, jsonb, timestamptz, text, text
) IS
  'Replaces one Stage-2 leaf with a genuinely new immutable artifact, under '
  'the caller''s expected updated_at and one idempotency receipt. p_why '
  'freezes the designer''s one-line note onto the successor (P-13); when it '
  'is absent the predecessor''s why carries forward — with its author''s '
  'name, so an inherited line is never re-attributed to whoever reissued it — '
  'and a revision never silently drops the line that explained the ask.';


-- ── iosb3-M2 + P-13. The sanitized projection ──────────────────────────────

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
             -- P-13: the designer's one-line why, frozen into the artifact at
             -- compose time. NULL for every approval created before 00569.
             'why', artifact.why,
             -- P-13, ruled mid-Wave-2: the why is attributed to its author.
             -- The name was frozen beside the sentence at compose time, so a
             -- rename does not rewrite what she already read. Emitted only
             -- with a why — a name under no line attributes nothing — which
             -- the column CHECK guarantees and this CASE states at the read
             -- site so no future writer has to go and find the constraint.
             'whyAuthorName', CASE
               WHEN artifact.why IS NOT NULL THEN artifact.why_author_name
             END,
             -- Wave-1 carry (iosb3-M2): which chair the CALLER is sitting in
             -- for THIS row. A studio co-member reading the client app used to
             -- receive every approval in the studio with nothing on the row to
             -- say she does not answer it. 'lead' is the frozen decision lead —
             -- the one person respond_project_approval accepts; 'studio' is a
             -- design-studio co-member; 'household' is the project's client on
             -- a row whose frozen lead is somebody else (reachable only after
             -- a lead reassignment). Order matters: lead first, because the
             -- lead is the only role that answers.
             'viewerRole', CASE
               WHEN snapshot.decision_lead_id = v_actor THEN 'lead'
               WHEN v_is_studio THEN 'studio'
               ELSE 'household'
             END,
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
  'identities. Since 00569 it also carries the frozen one-line why and the '
  'name of whoever wrote it (P-13), and viewerRole — lead | studio | '
  'household — so a caller can tell a row it answers from a row it only '
  'watches.';


-- ── P-20. The response writes the household its receipt ────────────────────

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

-- ── P-18/R1. The typed name reaches the response it was typed for ──────────
--
-- Folded in from the web lane's 00570 by the mid-Wave-2 ruling "one migration
-- for Wave 2": the same wrapper is redefined twice here otherwise.
--
-- R1 rules that Approve carries a typed legal name on every surface, and the
-- reasoning ran "the response RPC already writes client_signature and
-- client_consent_method, so the field drops in without a migration". Half of
-- that is true. `_respond_project_approval_checked` does take the pair,
-- validates it — a method must be 'electronic_signature' or 'click_through',
-- an electronic signature must be at least two characters, a signature with no
-- method is refused — and writes all three 00117 consent columns. The PUBLIC
-- wrapper allowlisted exactly 'outcome' and 'optionId' and then passed
-- NULL, NULL, so a signature could not reach it and a caller that tried was
-- refused outright.
--
-- Blast radius: the allowlist grows by two keys and the two nulls become the
-- values read out of the payload. Both stay optional, so `{"outcome":
-- "approved"}` produces exactly the call it produced before and every existing
-- response row keeps its NULL consent — which is what Return and Hold keep
-- sending, since a name to say "needs discussion" is theatre (mid-Wave-2
-- ruling: signature only on Approve). No rule is added or relaxed here; all
-- validation stays in the checked function.
--
-- Not touched: the review-confirmation leg. `confirm_project_decision_review`
-- keeps reviewMethod 'portal_clickthrough' — a press and hold is still a
-- click-through (R1) — and asks for no signature.
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
  v_consent_method text;
  v_signature text;
BEGIN
  IF p_payload IS NULL OR jsonb_typeof(p_payload) <> 'object' THEN
    RAISE EXCEPTION 'p_payload must be a JSON object'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;
  v_unknown := p_payload - ARRAY[
    'outcome', 'optionId', 'clientConsentMethod', 'clientSignature'
  ];
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
  v_consent_method := NULLIF(
    btrim(COALESCE(p_payload->>'clientConsentMethod', '')), ''
  );
  v_signature := NULLIF(btrim(COALESCE(p_payload->>'clientSignature', '')), '');
  RETURN public._respond_project_approval_checked(
    p_decision_id, v_outcome, v_option_id,
    p_expected_updated_at, p_idempotency_key, v_consent_method, v_signature
  );
END;
$$;

REVOKE ALL ON FUNCTION public.respond_project_approval(
  uuid, jsonb, timestamptz, text
) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.respond_project_approval(
  uuid, jsonb, timestamptz, text
) TO authenticated;
