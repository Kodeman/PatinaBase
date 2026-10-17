-- ═══════════════════════════════════════════════════════════════════════════
-- 00816 — US-37 D6: a proposal's studio stamp never reads a job its writer is
-- not on (SQ-1258; Astra SQ-1256 F1/F2 on 00813, R189 addendum)
--
-- 00813 (R189, SQ-1244) stamps proposals.studio_id, and a job a signed-in
-- drafter names counts only when can_buy_for_project admits her
-- (stamp_proposal_studio). Two writers still read a job past that rule. Each
-- disclosed a studio id, never a line, cost or markup, and both are
-- inherited from 00813.
--
-- F1. clone_proposal (00813:590–597) restamped every copy with its source
--     job's studio under definer rights. Z, seated only in B, names studio-A
--     job S on her draft (00813 stamps it B, her only seat), duplicates it,
--     and the copy carried S's A, which she reads on the copy's header. The
--     source job's studio now counts only when can_buy_for_project admits
--     the caller, the rule stamp_proposal_studio applies to a direct draft.
--     Otherwise the override falls through to its next step, the source's
--     own stamp. A caller who may clone a proposal already reads its header
--     (clone_proposal's _can_author_proposal gate is within 00401's
--     co-member reach), so a copy shows no studio its source does not.
--
-- F2. create_trade_scope and create_service_addendum admitted their caller
--     through _can_author_proposal (00387:533–559): the job's lead, or anyone
--     sharing ANY active design studio with the lead. Each then named the job
--     for the stamp (app.proposal_stamp_project_id), whose binding step trusts
--     that the writer authorized the caller for that job. Lead O sits in A
--     and B, Z only in B, and job W is A's: Z opened a trade scope or an
--     addendum on W, stamped A, and read its header. Each writer now also
--     requires can_buy_for_project(p_project_id), the job-team gate of every
--     FF&E writer and of the furnishings release (00445,
--     _ffe_require_studio_project). _can_author_proposal stays as a further
--     check, as R190 kept _can_access_product_configuration. Each keeps its
--     own refusal: create_trade_scope answers 42501 'project % not found or
--     access denied'; create_service_addendum folds access into its origin
--     lookup and answers 23514 'project % has no executed design-services
--     authority', as it already does for a caller outside the lead's studios.
--     Gating the binding step on can_buy_for_project instead is fewer lines,
--     but it does not hold the job's studio. With the binding refused, Z's
--     paper takes its lead's own records: the agreement's household studio,
--     or the parent agreement's stamp (B on the 00813 fixture). A paper bound
--     to studio-A job W would then read its lines to the lead's studio-B
--     co-members (proposal_items_design_studio_select, 00813 §2c), and Z
--     would still write it.
--     Narrowing (R189 addendum): a co-member of the lead from another studio
--     no longer opens a trade scope or service addendum on the lead's job,
--     and neither does the client of a studio-less job who shares a design
--     studio with the lead. The lead and the job's team keep both: an active
--     non-guest member of projects.studio_id, or on a studio-less job the
--     lead's design-studio co-members other than its client.
--     create_furnishings_authorization_from_schedule is unchanged: its 00445
--     wrapper already requires the job's team.
--
-- Callers. create_trade_scope: use-commercial-documents.ts (designer
-- portal, a job's Document) and pgTAP. create_service_addendum:
-- use-commercial-documents.ts, project-services-addendum-action.tsx and
-- addendum-from-parts-sheet.tsx (designer portal) and pgTAP. Every pgTAP
-- caller is the job's lead or, here, its team. clone_proposal: the designer
-- portal's revise/duplicate actions; its result shape is unchanged.
--
-- Lineage (each from its latest body, 00813, verbatim plus one delta):
--   clone_proposal           00813:523–706 (the copy's stamp)
--   create_trade_scope       00813:800–888 (the access gate)
--   create_service_addendum  00813:890–977 (the origin lookup)
-- CREATE OR REPLACE keeps each one's signature, ACL, SECURITY DEFINER and
-- search_path. No GRANT/REVOKE, so supabase/seed/00-legacy-grants.sql is
-- unchanged. The new checks take no lock and no function here locks FF&E
-- rows, so R182 does not apply. A later clone_proposal, create_trade_scope
-- or create_service_addendum must graft from this body.
-- Measured by supabase/tests/ffe/us37_inherited_pricing_paths_test.sql.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── F1. clone_proposal: the source job counts only for its team ────────────

CREATE OR REPLACE FUNCTION public.clone_proposal(
  p_source_id uuid,
  p_mode text DEFAULT 'revision',
  p_revision_summary text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_source public.proposals%ROWTYPE;
  v_target public.proposals%ROWTYPE;
  v_new_id uuid;
  v_new_phase_id uuid;
  v_phase_map jsonb := '{}'::jsonb;
  v_phase record;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'clone_proposal requires an authenticated user'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_mode NOT IN ('revision', 'duplicate') THEN
    RAISE EXCEPTION
      'clone_proposal: invalid mode %, expected revision|duplicate', p_mode
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  SELECT * INTO v_source
  FROM public.proposals
  WHERE id = p_source_id
  FOR UPDATE;
  IF NOT FOUND OR NOT public._can_author_proposal(v_source.designer_id) THEN
    RAISE EXCEPTION
      'clone_proposal: proposal % not found or access denied', p_source_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  PERFORM phase.id
  FROM public.proposal_phases AS phase
  WHERE phase.proposal_id = p_source_id
  ORDER BY phase.id
  FOR UPDATE;
  PERFORM public._assert_proposal_phase_topology(
    p_source_id, 'clone_proposal source'
  );

  v_new_id := public._clone_proposal_legacy_00399(
    p_source_id, p_mode, p_revision_summary
  );

  SELECT * INTO STRICT v_target
  FROM public.proposals
  WHERE id = v_new_id
  FOR UPDATE;
  IF v_target.status <> 'draft'
     OR v_target.designer_id IS DISTINCT FROM v_source.designer_id
  THEN
    RAISE EXCEPTION 'clone_proposal produced an invalid target draft'
      USING ERRCODE = 'check_violation';
  END IF;

  -- 00813 (US-37 D6): the copy starts with no job (a duplicate with no
  -- parent either), so its insert stamp did not know the source. It stays
  -- with the source's studio: the source job's studio, else the source's
  -- own stamp; NULL leaves the copy's lines to its designer.
  -- 00816 (SQ-1258, Astra SQ-1256 F1): the source job's studio counts only
  -- when can_buy_for_project admits the caller (stamp_proposal_studio's rule
  -- for a direct draft); otherwise the copy takes the source's own stamp.
  UPDATE public.proposals AS target
     SET studio_id = COALESCE(
           (SELECT project.studio_id
              FROM public.projects AS project
             WHERE project.id = v_source.project_id
               AND public.can_buy_for_project(project.id)),
           v_source.studio_id
         )
   WHERE target.id = v_new_id;

  -- The frozen implementation created pre-linkage phase rows and copied their
  -- dependent deliverables/gates/payment milestones. Remove only that target
  -- schedule material, then rebuild it from the locked source with every
  -- current chain field. Other deep-copy children remain exactly as 00327.
  DELETE FROM public.proposal_schedule_milestones AS milestone
  USING public.proposal_phases AS phase
  WHERE milestone.phase_id = phase.id
    AND phase.proposal_id = v_new_id;
  DELETE FROM public.proposal_payment_milestones
  WHERE proposal_id = v_new_id;
  DELETE FROM public.proposal_phases
  WHERE proposal_id = v_new_id;

  FOR v_phase IN
    SELECT *
    FROM public.proposal_phases
    WHERE proposal_id = p_source_id
    ORDER BY sort_order, id
  LOOP
    INSERT INTO public.proposal_phases (
      proposal_id, name, phase_key, duration_weeks, duration_days,
      fee_cents, revision_limit, gate_condition, deliverables,
      sort_order, follows_phase_id, anchor_date, lane
    ) VALUES (
      v_new_id, v_phase.name, v_phase.phase_key, v_phase.duration_weeks,
      v_phase.duration_days, v_phase.fee_cents, v_phase.revision_limit,
      v_phase.gate_condition, v_phase.deliverables, v_phase.sort_order,
      NULL, v_phase.anchor_date, v_phase.lane
    )
    RETURNING id INTO v_new_phase_id;
    v_phase_map := v_phase_map || jsonb_build_object(
      v_phase.id::text, v_new_phase_id::text
    );
  END LOOP;

  FOR v_phase IN
    SELECT id, follows_phase_id
    FROM public.proposal_phases
    WHERE proposal_id = p_source_id
    ORDER BY sort_order, id
  LOOP
    UPDATE public.proposal_phases
    SET follows_phase_id = CASE
      WHEN v_phase.follows_phase_id IS NULL THEN NULL
      ELSE (v_phase_map ->> v_phase.follows_phase_id::text)::uuid
    END
    WHERE id = (v_phase_map ->> v_phase.id::text)::uuid;
  END LOOP;

  INSERT INTO public.proposal_phase_deliverables (
    phase_id, label, description, is_required,
    completed_at, completed_by, sort_order
  )
  SELECT
    (v_phase_map ->> deliverable.phase_id::text)::uuid,
    deliverable.label, deliverable.description, deliverable.is_required,
    NULL, NULL, deliverable.sort_order
  FROM public.proposal_phase_deliverables AS deliverable
  JOIN public.proposal_phases AS phase ON phase.id = deliverable.phase_id
  WHERE phase.proposal_id = p_source_id
    AND v_phase_map ? deliverable.phase_id::text;

  INSERT INTO public.proposal_phase_gates (
    phase_id, gate_kind, payload, satisfied_at, satisfied_by,
    override_reason, sort_order
  )
  SELECT
    (v_phase_map ->> gate.phase_id::text)::uuid,
    gate.gate_kind, gate.payload, NULL, NULL, NULL, gate.sort_order
  FROM public.proposal_phase_gates AS gate
  JOIN public.proposal_phases AS phase ON phase.id = gate.phase_id
  WHERE phase.proposal_id = p_source_id
    AND v_phase_map ? gate.phase_id::text;

  INSERT INTO public.proposal_payment_milestones (
    proposal_id, phase_id, label, percentage, amount_cents,
    trigger_condition, sort_order
  )
  SELECT
    v_new_id,
    CASE
      WHEN milestone.phase_id IS NULL THEN NULL
      ELSE (v_phase_map ->> milestone.phase_id::text)::uuid
    END,
    milestone.label, milestone.percentage, milestone.amount_cents,
    milestone.trigger_condition, milestone.sort_order
  FROM public.proposal_payment_milestones AS milestone
  WHERE milestone.proposal_id = p_source_id;

  INSERT INTO public.proposal_schedule_milestones (
    phase_id, name, kind, anchor_date, sort_order
  )
  SELECT
    (v_phase_map ->> milestone.phase_id::text)::uuid,
    milestone.name, milestone.kind, milestone.anchor_date,
    milestone.sort_order
  FROM public.proposal_schedule_milestones AS milestone
  JOIN public.proposal_phases AS phase ON phase.id = milestone.phase_id
  WHERE phase.proposal_id = p_source_id
    AND v_phase_map ? milestone.phase_id::text;

  PERFORM public._assert_proposal_phase_topology(
    v_new_id, 'clone_proposal target'
  );
  PERFORM public._recompute_proposal_total_locked(v_new_id);
  RETURN v_new_id;
END;
$$;

-- ── F2. create_trade_scope and create_service_addendum: the job's team ───

CREATE OR REPLACE FUNCTION public.create_trade_scope(
  p_project_id uuid,
  p_title text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_project public.projects%ROWTYPE;
  v_origin public.proposals%ROWTYPE;
  v_title text := btrim(COALESCE(p_title, ''));
  v_proposal_id uuid := extensions.gen_random_uuid();
  v_document_id uuid;
BEGIN
  IF v_actor IS NULL OR char_length(v_title) < 2 THEN
    RAISE EXCEPTION 'a trade scope requires an authenticated author and a title'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO v_project FROM public.projects WHERE id = p_project_id FOR SHARE;
  -- 00816 (SQ-1258, Astra SQ-1256 F2): the job's team, not any studio the
  -- caller shares with its lead.
  IF NOT FOUND OR NOT public._can_author_proposal(v_project.designer_id)
     OR NOT public.can_buy_for_project(p_project_id) THEN
    RAISE EXCEPTION 'project % not found or access denied', p_project_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- The same origin proof the furnishings rail requires, byte-for-byte. A trade
  -- scope is an exercise of commercial authority; a project with no executed
  -- design-services agreement has none to exercise.
  IF NOT EXISTS (
    SELECT 1 FROM public.project_commercial_documents d
    JOIN public.proposals p ON p.id = d.proposal_id
    WHERE d.project_id = p_project_id AND d.is_origin
      AND d.document_kind IN ('design_services', 'design_build') AND p.commercial_state = 'executed'
  ) THEN
    RAISE EXCEPTION 'project % has no executed design-services origin', p_project_id
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT origin_proposal.* INTO v_origin
  FROM public.project_commercial_documents origin
  JOIN public.proposals origin_proposal ON origin_proposal.id = origin.proposal_id
  WHERE origin.project_id = p_project_id AND origin.is_origin
    AND origin.document_kind IN ('design_services', 'design_build')
    AND origin_proposal.commercial_state = 'executed'
  LIMIT 1;

  -- 00813 (SQ-1244, F1): this paper is bound to p_project_id below; its
  -- stamp reads that job (stamp_proposal_studio).
  PERFORM set_config('app.proposal_stamp_project_id', p_project_id::text, true);
  INSERT INTO public.proposals (
    id, designer_id, client_id, designer_client_id, title, description,
    subtotal, discount_amount, discount_percent, tax_rate, tax_amount,
    total_amount, deposit_percent, status, version, project_address,
    client_visibility_tier, feedback_enabled, document_kind, commercial_state
  ) VALUES (
    v_proposal_id, v_project.designer_id, v_project.client_id,
    v_origin.designer_client_id, v_title,
    'Trade work priced as a scope against a named party.',
    0, 0, 0, 0, 0, 0, 0, 'draft', 1,
    v_origin.project_address, 'full', v_origin.feedback_enabled,
    'trade_scope', 'draft'
  );
  PERFORM set_config('app.proposal_stamp_project_id', '', true);

  -- The skeleton. Price and party arrive through the studio's editing surface
  -- and set_trade_scope_party / select_trade_bid; what matters here is that the
  -- row EXISTS, so every later read has one shape to answer with.
  INSERT INTO public.trade_scope_terms (proposal_id) VALUES (v_proposal_id);

  INSERT INTO public.project_commercial_documents (
    project_id, proposal_id, document_kind, created_by
  ) VALUES (
    p_project_id, v_proposal_id, 'trade_scope', v_actor
  ) RETURNING id INTO v_document_id;

  RETURN jsonb_build_object(
    'proposalId', v_proposal_id,
    'documentId', v_document_id,
    'projectId', p_project_id,
    'title', v_title,
    'commercialState', 'draft',
    'progressState', 'none',
    'documentFingerprint', public._commercial_document_fingerprint(v_proposal_id)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.create_service_addendum(
  p_project_id uuid,
  p_title text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_origin public.proposals%ROWTYPE;
  v_source_proposal_id uuid;
  v_proposal_id uuid := extensions.gen_random_uuid();
  v_document_id uuid;
  v_title text := btrim(COALESCE(p_title, ''));
BEGIN
  IF v_actor IS NULL OR char_length(v_title) < 2 THEN
    RAISE EXCEPTION 'service addendum requires an authenticated author and title'
      USING ERRCODE = 'check_violation';
  END IF;
  SELECT origin_proposal.*
  INTO v_origin
  FROM public.project_commercial_documents origin
  JOIN public.proposals origin_proposal ON origin_proposal.id = origin.proposal_id
  WHERE origin.project_id = p_project_id AND origin.is_origin
    AND origin_proposal.commercial_state = 'executed'
    AND public._can_author_proposal(origin_proposal.designer_id)
    -- 00816 (SQ-1258, Astra SQ-1256 F2): the job's team, not any studio the
    -- caller shares with the lead.
    AND public.can_buy_for_project(p_project_id)
  LIMIT 1;
  IF v_origin.id IS NULL THEN
    RAISE EXCEPTION 'project % has no executed design-services authority', p_project_id
      USING ERRCODE = 'check_violation';
  END IF;
  SELECT authority.source_proposal_id
  INTO v_source_proposal_id
  FROM public.project_billing_authorities authority
  WHERE authority.project_id = p_project_id AND authority.status = 'active'
  ORDER BY authority.effective_at DESC
  LIMIT 1;
  IF v_source_proposal_id IS NULL THEN
    RAISE EXCEPTION 'project % has no active billing authority', p_project_id
      USING ERRCODE = 'check_violation';
  END IF;

  -- 00813 (SQ-1244, F1): this paper is bound to p_project_id below; its
  -- stamp reads that job (stamp_proposal_studio).
  PERFORM set_config('app.proposal_stamp_project_id', p_project_id::text, true);
  INSERT INTO public.proposals (
    id, designer_id, client_id, designer_client_id, title, description,
    total_amount, status, version, parent_proposal_id, project_address,
    client_visibility_tier, feedback_enabled, document_kind, commercial_state
  ) VALUES (
    v_proposal_id, v_origin.designer_id, v_origin.client_id,
    v_origin.designer_client_id, v_title, 'Additional design-services authority',
    0, 'draft', 1, v_source_proposal_id, v_origin.project_address,
    v_origin.client_visibility_tier, v_origin.feedback_enabled,
    'service_addendum', 'draft'
  );
  PERFORM set_config('app.proposal_stamp_project_id', '', true);
  INSERT INTO public.proposal_service_terms (
    proposal_id, scope, deliverables, exclusions, billing_ceiling_cents,
    retainer_amount_cents, retainer_activation_policy, billing_cadence,
    currency, terms, current_rate_version, furnishings_deposit_percent
  ) SELECT
    v_proposal_id, t.scope, t.deliverables, t.exclusions,
    t.billing_ceiling_cents, 0, 'immediate', t.billing_cadence,
    t.currency, t.terms, t.current_rate_version, t.furnishings_deposit_percent
  FROM public.proposal_service_terms t WHERE t.proposal_id = v_source_proposal_id;
  INSERT INTO public.proposal_service_rates (
    proposal_id, version, role_name, hourly_rate_cents, sort_order, effective_at
  ) SELECT v_proposal_id, r.version + 1, r.role_name, r.hourly_rate_cents,
      r.sort_order, now()
  FROM public.proposal_service_rates r WHERE r.proposal_id = v_source_proposal_id;
  UPDATE public.proposal_service_terms SET current_rate_version = current_rate_version + 1
  WHERE proposal_id = v_proposal_id;
  INSERT INTO public.project_commercial_documents (
    project_id, proposal_id, document_kind, source_proposal_id, created_by
  ) VALUES (
    p_project_id, v_proposal_id, 'service_addendum', v_source_proposal_id, v_actor
  ) RETURNING id INTO v_document_id;

  RETURN jsonb_build_object(
    'proposalId', v_proposal_id, 'documentId', v_document_id,
    'projectId', p_project_id, 'documentKind', 'service_addendum',
    'commercialState', 'draft'
  );
END;
$$;
