-- ═══════════════════════════════════════════════════════════════════════════
-- 00474 — Schedule template visibility follows studio comembership (R105 residual)
-- Lineage of apply_phase_template(uuid, text, uuid):
--   00135 → 00324 → 00399 → 00461 → 00474
-- Reconciles: the last narrow guard of the R105 comember-widening pass. Every
--   other schedule authoring path (project_phases RLS 00316, schedule_milestones
--   and schedule_revisions 00323, commit_schedule_edit / cut_schedule_revision
--   00326, proposal_schedule_milestones 00401, copy_schedule_as_built 00399, and
--   this function's own proposal guard below) already resolves authority through
--   a studio-comember predicate. Only the phase_templates SELECT still demanded
--   personal ownership (`designer_id = v_actor`), so a comember who may author
--   the proposal could not apply a studio-mate's private template.
--   Body is 00461's verbatim; the single delta is at that one guard site.
--   The two-argument bridge overload (00399) is untouched — it delegates here.
-- No new grants: CREATE OR REPLACE preserves 00461's ACL, so
--   scripts/generate-legacy-grants.py is not re-run.
-- ═══════════════════════════════════════════════════════════════════════════

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
        USING ERRCODE = 'serialization_failure';
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
        USING ERRCODE = 'serialization_failure';
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
