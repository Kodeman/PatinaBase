-- ════════════════════════════════════════════════════════════════════════
-- 00387 — authoritative project completion, proposal send, and identity
--
-- RLS answers who may edit a row; it cannot prove that an irreversible state
-- transition passed its domain checks. These guards require two independent
-- facts for protected updates:
--   1. current_user is postgres (the owner executing the SECURITY DEFINER RPC);
--   2. that RPC set a transaction-local, row-scoped authority GUC.
-- Authenticated callers can forge a custom GUC, but cannot become postgres.
-- The trigger functions remain SECURITY INVOKER so current_user is meaningful.
--
-- Function-body lineage:
--   close_project:       00238 → 00383 → 00387
--   send_proposal:       00176 → 00384 → 00387
--   set_document_client: 00225 → 00385 → 00387
-- ══════════════════════════════════════════════════════════════════════

-- ── Project completion authority ───────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.guard_project_completion_authority()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.status = 'completed'
     AND OLD.status IS DISTINCT FROM 'completed'
     AND (
       current_user IS DISTINCT FROM 'postgres'
       OR current_setting('app.project_completion_id', true)
          IS DISTINCT FROM NEW.id::text
     )
  THEN
    RAISE EXCEPTION
      'projects may only enter completed through close_project'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_project_completion_authority()
  FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS guard_project_completion_authority_trg
  ON public.projects;
CREATE TRIGGER guard_project_completion_authority_trg
BEFORE UPDATE OF status ON public.projects
FOR EACH ROW
EXECUTE FUNCTION public.guard_project_completion_authority();

CREATE OR REPLACE FUNCTION public.close_project(
  p_project_id uuid,
  p_closure    jsonb DEFAULT NULL,
  p_snapshot   jsonb DEFAULT NULL
)
RETURNS public.projects
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_designer           uuid := auth.uid();
  v_project            public.projects;
  v_effective_closure  jsonb;
  v_blocker_count      integer;
  v_collected_cents    bigint;
BEGIN
  IF v_designer IS NULL THEN
    RAISE EXCEPTION 'close_project requires an authenticated user'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO v_project
  FROM public.projects
  WHERE id = p_project_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'project % not found', p_project_id
      USING ERRCODE = 'no_data_found';
  END IF;

  IF v_project.designer_id IS DISTINCT FROM v_designer THEN
    RAISE EXCEPTION 'project % may only be closed by its designer', p_project_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  v_effective_closure := COALESCE(p_closure, v_project.closure_checklist);
  IF v_effective_closure IS NULL
     OR jsonb_typeof(v_effective_closure) <> 'array'
     OR EXISTS (
       SELECT 1
       FROM unnest(ARRAY[
         'walkthrough', 'punch_list', 'payment', 'photography', 'photos',
         'case_study', 'review'
       ]) AS required(key)
       WHERE NOT EXISTS (
         SELECT 1
         FROM jsonb_array_elements(v_effective_closure) AS item(value)
         WHERE item.value->>'key' = required.key
           AND item.value->'completed' = 'true'::jsonb
       )
     )
  THEN
    RAISE EXCEPTION
      'project closeout checklist must include every required item as completed'
      USING ERRCODE = 'check_violation';
  END IF;

  -- Preserve 00383's dependency order: invoice → line → milestone → FF&E.
  PERFORM 1
  FROM public.invoices
  WHERE project_id = p_project_id
  ORDER BY id
  FOR UPDATE;

  PERFORM 1
  FROM public.invoice_line_items AS line
  JOIN public.invoices AS invoice ON invoice.id = line.invoice_id
  WHERE invoice.project_id = p_project_id
  ORDER BY line.id
  FOR UPDATE OF line;

  PERFORM 1
  FROM public.project_payment_milestones
  WHERE project_id = p_project_id
  ORDER BY id
  FOR UPDATE;

  PERFORM 1
  FROM public.project_ffe_items
  WHERE project_id = p_project_id
  ORDER BY id
  FOR UPDATE;

  SELECT count(*) INTO v_blocker_count
  FROM public.project_ffe_items
  WHERE project_id = p_project_id
    AND status <> 'installed';

  IF v_blocker_count > 0 THEN
    RAISE EXCEPTION
      'project cannot close: % FF&E item(s) are not installed', v_blocker_count
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT count(*) INTO v_blocker_count
  FROM public.project_ffe_items AS ffe
  WHERE ffe.project_id = p_project_id
    AND GREATEST(
      0::bigint,
      COALESCE(
        ffe.line_total_cents::bigint,
        COALESCE(ffe.quantity, 0)::bigint
          * COALESCE(ffe.unit_price_cents, 0)::bigint,
        0::bigint
      )
    ) > 0
    AND NOT EXISTS (
      SELECT 1
      FROM public.invoice_line_items AS line
      JOIN public.invoices AS invoice ON invoice.id = line.invoice_id
      WHERE line.ffe_item_id = ffe.id
        AND invoice.project_id = p_project_id
        AND invoice.status = 'paid'
        AND invoice.amount_paid_cents >= invoice.total_cents
        AND line.amount_cents::bigint >= GREATEST(
          0::bigint,
          COALESCE(
            ffe.line_total_cents::bigint,
            COALESCE(ffe.quantity, 0)::bigint
              * COALESCE(ffe.unit_price_cents, 0)::bigint,
            0::bigint
          )
        )
    );

  IF v_blocker_count > 0 THEN
    RAISE EXCEPTION
      'project cannot close: % FF&E item(s) are not fully invoiced and paid',
      v_blocker_count
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT count(*) INTO v_blocker_count
  FROM public.project_payment_milestones
  WHERE project_id = p_project_id
    AND amount_cents > 0
    AND status <> 'paid';

  IF v_blocker_count > 0 THEN
    RAISE EXCEPTION
      'project cannot close: % positive payment milestone(s) are not paid',
      v_blocker_count
      USING ERRCODE = 'check_violation';
  END IF;

  -- Invoice headers are advisory until issue_invoice recomputes them. A draft
  -- can therefore carry real positive lines while total_cents is still zero.
  -- Canonical balance truth comes from lines (+ stored tax rate) whenever any
  -- line exists; only genuinely line-less legacy invoices fall back to header.
  SELECT count(*) INTO v_blocker_count
  FROM (
    SELECT
      invoice.id,
      invoice.status,
      invoice.amount_paid_cents,
      CASE
        WHEN count(line.id) > 0 THEN
          COALESCE(sum(line.amount_cents), 0)
          + round(COALESCE(sum(line.amount_cents), 0) * invoice.tax_rate)::bigint
        ELSE invoice.total_cents::bigint
      END AS canonical_total_cents
    FROM public.invoices AS invoice
    LEFT JOIN public.invoice_line_items AS line ON line.invoice_id = invoice.id
    WHERE invoice.project_id = p_project_id
    GROUP BY invoice.id
  ) AS invoice_truth
  WHERE invoice_truth.status <> 'void'
    AND invoice_truth.canonical_total_cents > invoice_truth.amount_paid_cents;

  IF v_blocker_count > 0 THEN
    RAISE EXCEPTION
      'project cannot close: % invoice(s) still carry a balance', v_blocker_count
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT COALESCE(sum(LEAST(
    invoice_truth.canonical_total_cents,
    invoice_truth.amount_paid_cents::bigint
  )), 0)
  INTO v_collected_cents
  FROM (
    SELECT
      invoice.id,
      invoice.status,
      invoice.amount_paid_cents,
      CASE
        WHEN count(line.id) > 0 THEN
          COALESCE(sum(line.amount_cents), 0)
          + round(COALESCE(sum(line.amount_cents), 0) * invoice.tax_rate)::bigint
        ELSE invoice.total_cents::bigint
      END AS canonical_total_cents
    FROM public.invoices AS invoice
    LEFT JOIN public.invoice_line_items AS line ON line.invoice_id = invoice.id
    WHERE invoice.project_id = p_project_id
    GROUP BY invoice.id
  ) AS invoice_truth
  WHERE invoice_truth.status <> 'void';

  IF COALESCE(v_project.total_amount_cents, 0) > v_collected_cents THEN
    RAISE EXCEPTION
      'project cannot close: contract total is not fully collected'
      USING ERRCODE = 'check_violation';
  END IF;

  -- The trigger accepts this update only while both the definer identity and
  -- this exact row id are present. Clear immediately after the protected act.
  PERFORM set_config('app.project_completion_id', p_project_id::text, true);
  UPDATE public.projects
  SET status             = 'completed',
      closure_checklist  = v_effective_closure,
      portfolio_snapshot = COALESCE(p_snapshot, portfolio_snapshot),
      updated_at         = now()
  WHERE id = p_project_id
  RETURNING * INTO v_project;
  PERFORM set_config('app.project_completion_id', '', true);

  RETURN v_project;
END;
$$;

REVOKE ALL ON FUNCTION public.close_project(uuid, jsonb, jsonb)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.close_project(uuid, jsonb, jsonb)
  TO authenticated;

COMMENT ON FUNCTION public.close_project(uuid, jsonb, jsonb) IS
  'Sole project-completion authority. Owner-authenticated, operationally '
  'guarded, and row-locked; sets app.project_completion_id only around the '
  'completed transition so direct/RLS/service-role table updates cannot bypass '
  'readiness.';

-- Install gate approval still settles/drafts its milestone, but it no longer
-- claims that the entire project is operationally ready. Care begins only via
-- close_project after its installation, billing, and collection census.
CREATE OR REPLACE FUNCTION public.settle_section_on_gate_approval()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_approved boolean;
  v_m record;
BEGIN
  IF NEW.decision_kind <> 'approval'
     OR NEW.section_key IS NULL
     OR NEW.project_id IS NULL
     OR NEW.status <> 'responded'
     OR OLD.status = 'responded' THEN
    RETURN NEW;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.client_decision_options AS option
    WHERE option.decision_id = NEW.id
      AND option.selected
      AND option.approves
  ) INTO v_approved;

  IF NOT v_approved THEN
    RETURN NEW;
  END IF;

  IF NEW.section_key = 'project' THEN
    UPDATE public.projects
    SET current_phase = 'installation', updated_at = now()
    WHERE id = NEW.project_id
      AND current_phase IS DISTINCT FROM 'installation'
      AND current_phase IS DISTINCT FROM 'final_walkthrough'
      AND status NOT IN ('completed', 'archived');
  END IF;

  FOR v_m IN
    SELECT id
    FROM public.project_payment_milestones AS milestone
    WHERE milestone.project_id = NEW.project_id
      AND milestone.trigger_kind = 'on_section_settled'
      AND milestone.trigger_section_key = NEW.section_key
      AND milestone.invoice_id IS NULL
  LOOP
    PERFORM public.draft_invoice_from_milestone(v_m.id);
  END LOOP;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.settle_section_on_gate_approval() IS
  'An approved section gate advances project→installation and drafts matching '
  'milestones. Install approval no longer completes the project; close_project '
  'is the sole completion authority.';

-- ── Proposal reviewed-copy fingerprint ──────────────────────────────────────

-- Internal canonical serializer. It is deliberately not callable by API
-- roles; get_proposal_send_snapshot and send_proposal call it while executing
-- as postgres after explicit actor/document authorization. Volatile timestamps,
-- proposal-item internal_notes/cost markup, and derived milestone amount_cents
-- are absent. IDs/order are present, so add/delete/reorder all change the token.
CREATE OR REPLACE FUNCTION public._proposal_review_fingerprint(
  p_proposal_id uuid
)
RETURNS text
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  SELECT md5(jsonb_build_object(
    'scope_rooms', COALESCE((
      SELECT jsonb_agg(jsonb_build_array(
        room.id, room.name, room.room_type, room.dimensions,
        room.floor_area_sqft, room.budget_cents, room.ffe_categories,
        room.notes, room.sort_order
      ) ORDER BY room.sort_order, room.id)
      FROM public.proposal_scope_rooms AS room
      WHERE room.proposal_id = p_proposal_id
    ), '[]'::jsonb),
    'items', COALESCE((
      SELECT jsonb_agg(jsonb_build_array(
        item.id, item.name, item.description, item.image_url, item.room,
        item.category, item.quantity, item.unit_price, item.line_total_cents,
        item.vendor_name, item.lead_time_weeks, item.notes, item.position,
        item.item_type, item.scope_room_id, item.budget_min_cents,
        item.budget_max_cents, item.ffe_category, item.doc_code,
        item.custom_fields
      ) ORDER BY item.position, item.id)
      FROM public.proposal_items AS item
      WHERE item.proposal_id = p_proposal_id
    ), '[]'::jsonb),
    'palettes', COALESCE((
      SELECT jsonb_agg(jsonb_build_array(
        palette.id, palette.name, palette.scope_room_id, palette.is_primary,
        palette.source_image_url, palette.notes, palette.sort_order
      ) ORDER BY palette.sort_order, palette.id)
      FROM public.proposal_palettes AS palette
      WHERE palette.proposal_id = p_proposal_id
    ), '[]'::jsonb),
    'palette_swatches', COALESCE((
      SELECT jsonb_agg(jsonb_build_array(
        swatch.id, swatch.palette_id, swatch.hex, swatch.name, swatch.role,
        swatch.paint_color_id, swatch.brand, swatch.brand_code,
        swatch.source_pixel, swatch.sort_order
      ) ORDER BY palette.sort_order, palette.id, swatch.sort_order, swatch.id)
      FROM public.palette_swatches AS swatch
      JOIN public.proposal_palettes AS palette ON palette.id = swatch.palette_id
      WHERE palette.proposal_id = p_proposal_id
    ), '[]'::jsonb),
    'boards', COALESCE((
      SELECT jsonb_agg(jsonb_build_array(
        board.id, board.name, board.scope_room_id, board.cover_image_url,
        board.canvas_width, board.canvas_height, board.background_color,
        board.sort_order, board.sections, board.status
      ) ORDER BY board.sort_order, board.id)
      FROM public.proposal_boards AS board
      WHERE board.proposal_id = p_proposal_id
    ), '[]'::jsonb),
    'board_items', COALESCE((
      SELECT jsonb_agg(jsonb_build_array(
        board_item.id, board_item.board_id, board_item.type, board_item.x,
        board_item.y, board_item.width, board_item.height, board_item.z_index,
        board_item.rotation, board_item.locked, board_item.product_id,
        board_item.capture_id, board_item.palette_id, board_item.image_url,
        board_item.content, board_item.data
      ) ORDER BY board.sort_order, board.id, board_item.z_index, board_item.id)
      FROM public.proposal_board_items AS board_item
      JOIN public.proposal_boards AS board ON board.id = board_item.board_id
      WHERE board.proposal_id = p_proposal_id
    ), '[]'::jsonb),
    'phases', COALESCE((
      SELECT jsonb_agg(jsonb_build_array(
        phase.id, phase.name, phase.phase_key, phase.duration_weeks,
        phase.fee_cents, phase.revision_limit, phase.gate_condition,
        phase.deliverables, phase.sort_order, phase.duration_days,
        phase.follows_phase_id, phase.anchor_date, phase.lane
      ) ORDER BY phase.sort_order, phase.id)
      FROM public.proposal_phases AS phase
      WHERE phase.proposal_id = p_proposal_id
    ), '[]'::jsonb),
    'exclusions', COALESCE((
      SELECT jsonb_agg(jsonb_build_array(
        exclusion.id, exclusion.description, exclusion.category,
        exclusion.sort_order
      ) ORDER BY exclusion.sort_order, exclusion.id)
      FROM public.proposal_exclusions AS exclusion
      WHERE exclusion.proposal_id = p_proposal_id
    ), '[]'::jsonb),
    'change_order_terms', COALESCE((
      SELECT jsonb_agg(jsonb_build_array(
        terms.id, terms.process_description, terms.hourly_rate_cents,
        terms.minimum_fee_cents, terms.approval_required
      ) ORDER BY terms.id)
      FROM public.proposal_change_order_terms AS terms
      WHERE terms.proposal_id = p_proposal_id
    ), '[]'::jsonb),
    'payment_milestones', COALESCE((
      SELECT jsonb_agg(jsonb_build_array(
        milestone.id, milestone.phase_id, milestone.label,
        milestone.percentage, milestone.trigger_condition,
        milestone.sort_order
      ) ORDER BY milestone.sort_order, milestone.id)
      FROM public.proposal_payment_milestones AS milestone
      WHERE milestone.proposal_id = p_proposal_id
    ), '[]'::jsonb)
  )::text);
$$;

REVOKE ALL ON FUNCTION public._proposal_review_fingerprint(uuid)
  FROM PUBLIC, anon, authenticated, service_role;

-- Authorization for a proposal's irreversible authoring acts is narrower than
-- the shared-workspace RLS helper. is_studio_comember intentionally treats any
-- shared organization (including contractor/manufacturer organizations) as a
-- co-membership. Sending a client document instead requires either its exact
-- designer or two active, non-guest memberships in the same active
-- design_studio organization.
CREATE OR REPLACE FUNCTION public._can_author_proposal(p_owner uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT p_owner IS NOT NULL AND (
    p_owner = (SELECT auth.uid())
    OR EXISTS (
      SELECT 1
      FROM public.organization_members AS actor_membership
      JOIN public.organization_members AS owner_membership
        ON owner_membership.organization_id = actor_membership.organization_id
      JOIN public.organizations AS organization
        ON organization.id = actor_membership.organization_id
      WHERE actor_membership.user_id = (SELECT auth.uid())
        AND actor_membership.status = 'active'
        AND actor_membership.role <> 'guest'
        AND owner_membership.user_id = p_owner
        AND owner_membership.status = 'active'
        AND owner_membership.role <> 'guest'
        AND organization.type = 'design_studio'
        AND organization.status = 'active'
    )
  );
$$;

REVOKE ALL ON FUNCTION public._can_author_proposal(uuid)
  FROM PUBLIC, anon, authenticated, service_role;

COMMENT ON FUNCTION public._can_author_proposal(uuid) IS
  'Private proposal-authoring authority: the exact designer, or an active '
  'non-guest peer sharing an active design_studio with that designer. Other '
  'organization types never confer client-document send authority.';

CREATE OR REPLACE FUNCTION public.get_proposal_send_snapshot(
  p_proposal_id uuid
)
RETURNS TABLE (
  proposal_updated_at timestamptz,
  proposal_total_amount integer,
  schedule_fingerprint text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_proposal public.proposals%ROWTYPE;
BEGIN
  IF v_actor IS NULL THEN
    RETURN;
  END IF;

  SELECT * INTO v_proposal
  FROM public.proposals
  WHERE id = p_proposal_id;

  -- Preserve the prior RLS-shaped result: a foreign proposal returns no row.
  -- The explicit check is required because the function now runs as definer so
  -- studio co-members see the same complete child token as the send boundary.
  IF NOT FOUND OR NOT public._can_author_proposal(v_proposal.designer_id) THEN
    RETURN;
  END IF;

  RETURN QUERY SELECT
    v_proposal.updated_at,
    v_proposal.total_amount,
    public._proposal_review_fingerprint(v_proposal.id);
END;
$$;

REVOKE ALL ON FUNCTION public.get_proposal_send_snapshot(uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_proposal_send_snapshot(uuid)
  TO authenticated;

COMMENT ON FUNCTION public.get_proposal_send_snapshot(uuid) IS
  'Explicitly studio-authorized reviewed-copy token. Fingerprints scope rooms, '
  'proposal items, palettes/swatches, boards/items, phases, exclusions, change '
  'order terms, and payment milestones; amount_cents remains derived at send.';

-- ── Proposal table authority guard ─────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.guard_proposal_authority()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.status = 'sent'
     AND OLD.status IS DISTINCT FROM 'sent'
     AND (
       current_user IS DISTINCT FROM 'postgres'
       OR current_setting('app.proposal_send_id', true)
          IS DISTINCT FROM NEW.id::text
     )
  THEN
    RAISE EXCEPTION 'proposals may only enter sent through send_proposal'
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.client_id IS DISTINCT FROM OLD.client_id
     OR NEW.designer_client_id IS DISTINCT FROM OLD.designer_client_id
  THEN
    IF current_user IS DISTINCT FROM 'postgres'
       OR current_setting('app.proposal_identity_id', true)
          IS DISTINCT FROM NEW.id::text
    THEN
      RAISE EXCEPTION
        'proposal client identity may only change through set_document_client'
        USING ERRCODE = 'check_violation';
    END IF;

    IF (NEW.client_id IS NULL) <> (NEW.designer_client_id IS NULL) THEN
      RAISE EXCEPTION
        'proposal client_id and designer_client_id must be linked or cleared together'
        USING ERRCODE = 'check_violation';
    END IF;

    IF NEW.client_id IS NOT NULL AND NOT EXISTS (
      SELECT 1
      FROM public.designer_clients AS relationship
      WHERE relationship.id = NEW.designer_client_id
        AND relationship.designer_id = NEW.designer_id
        AND relationship.client_id = NEW.client_id
    ) THEN
      RAISE EXCEPTION
        'proposal client identity does not match its designer relationship'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_proposal_authority()
  FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS guard_proposal_authority_trg ON public.proposals;
CREATE TRIGGER guard_proposal_authority_trg
BEFORE UPDATE OF status, client_id, designer_client_id ON public.proposals
FOR EACH ROW
EXECUTE FUNCTION public.guard_proposal_authority();

-- ── Authoritative send ─────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.send_proposal(
  p_proposal_id uuid,
  p_expected_updated_at timestamptz,
  p_expected_total_amount integer,
  p_expected_schedule_fingerprint text,
  p_personal_message text DEFAULT NULL,
  p_cc_email text DEFAULT NULL,
  p_valid_until timestamptz DEFAULT NULL
)
RETURNS public.proposals
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_target public.proposals%ROWTYPE;
  v_root_id uuid;
  v_milestone record;
  v_milestone_count integer;
  v_percent_sum numeric;
  v_running_cents bigint := 0;
  v_canonical_cents bigint;
  v_persisted_cents bigint;
  v_review_fingerprint text;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'send_proposal requires an authenticated user'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO v_target
  FROM public.proposals
  WHERE id = p_proposal_id
  FOR UPDATE;

  IF NOT FOUND OR NOT public._can_author_proposal(v_target.designer_id) THEN
    RAISE EXCEPTION
      'send_proposal: proposal % not found or access denied', p_proposal_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF v_target.status <> 'draft' THEN
    RAISE EXCEPTION 'proposal must be in draft status before sending'
      USING ERRCODE = 'check_violation';
  END IF;

  IF v_target.client_id IS NULL
     OR v_target.designer_client_id IS NULL
     OR NOT EXISTS (
       SELECT 1
       FROM public.designer_clients AS relationship
       WHERE relationship.id = v_target.designer_client_id
         AND relationship.designer_id = v_target.designer_id
         AND relationship.client_id = v_target.client_id
     )
  THEN
    RAISE EXCEPTION
      'proposal must be linked to a matching client relationship before sending'
      USING ERRCODE = 'check_violation';
  END IF;

  IF p_expected_updated_at IS NULL
     OR p_expected_total_amount IS NULL
     OR p_expected_schedule_fingerprint IS NULL
     OR v_target.updated_at IS DISTINCT FROM p_expected_updated_at
     OR v_target.total_amount IS DISTINCT FROM p_expected_total_amount
  THEN
    RAISE EXCEPTION
      'proposal changed after send review; refresh and review again'
      USING ERRCODE = 'check_violation';
  END IF;

  IF COALESCE(v_target.total_amount, 0) <= 0 THEN
    RAISE EXCEPTION
      'proposal total must be greater than zero before sending'
      USING ERRCODE = 'check_violation';
  END IF;

  -- Lock every client-copy row before recomputing the canonical token. The
  -- proposal parent lock blocks new top-level FK children. Nested leaves are
  -- locked before their palette/board parents; once the parents lock, new
  -- nested inserts cannot acquire their FK key-share locks.
  PERFORM 1
  FROM public.palette_swatches AS swatch
  JOIN public.proposal_palettes AS palette ON palette.id = swatch.palette_id
  WHERE palette.proposal_id = p_proposal_id
  ORDER BY swatch.id
  FOR UPDATE OF swatch;

  PERFORM 1
  FROM public.proposal_board_items AS board_item
  JOIN public.proposal_boards AS board ON board.id = board_item.board_id
  WHERE board.proposal_id = p_proposal_id
  ORDER BY board_item.id
  FOR UPDATE OF board_item;

  PERFORM 1 FROM public.proposal_items
  WHERE proposal_id = p_proposal_id ORDER BY id FOR UPDATE;

  PERFORM 1 FROM public.proposal_payment_milestones
  WHERE proposal_id = p_proposal_id ORDER BY id FOR UPDATE;

  PERFORM 1 FROM public.proposal_exclusions
  WHERE proposal_id = p_proposal_id ORDER BY id FOR UPDATE;

  PERFORM 1 FROM public.proposal_change_order_terms
  WHERE proposal_id = p_proposal_id ORDER BY id FOR UPDATE;

  PERFORM 1 FROM public.proposal_boards
  WHERE proposal_id = p_proposal_id ORDER BY id FOR UPDATE;

  PERFORM 1 FROM public.proposal_palettes
  WHERE proposal_id = p_proposal_id ORDER BY id FOR UPDATE;

  PERFORM 1 FROM public.proposal_phases
  WHERE proposal_id = p_proposal_id ORDER BY id FOR UPDATE;

  PERFORM 1 FROM public.proposal_scope_rooms
  WHERE proposal_id = p_proposal_id ORDER BY id FOR UPDATE;

  v_review_fingerprint := public._proposal_review_fingerprint(p_proposal_id);
  IF v_review_fingerprint IS DISTINCT FROM p_expected_schedule_fingerprint THEN
    RAISE EXCEPTION
      'proposal changed after send review; refresh and review again'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT count(*), COALESCE(sum(percentage), 0)
  INTO v_milestone_count, v_percent_sum
  FROM public.proposal_payment_milestones
  WHERE proposal_id = p_proposal_id;

  IF v_milestone_count = 0 THEN
    RAISE EXCEPTION
      'proposal payment schedule is required before sending'
      USING ERRCODE = 'check_violation';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.proposal_payment_milestones
    WHERE proposal_id = p_proposal_id
      AND btrim(label) = ''
  ) THEN
    RAISE EXCEPTION
      'proposal payment milestone labels cannot be blank'
      USING ERRCODE = 'check_violation';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.proposal_payment_milestones
    WHERE proposal_id = p_proposal_id
      AND percentage <= 0
  ) THEN
    RAISE EXCEPTION
      'proposal payment percentages must all be greater than zero'
      USING ERRCODE = 'check_violation';
  END IF;

  IF v_percent_sum <> 100 THEN
    RAISE EXCEPTION
      'proposal payment percentages must total 100'
      USING ERRCODE = 'check_violation';
  END IF;

  FOR v_milestone IN
    SELECT
      id,
      percentage,
      row_number() OVER (ORDER BY sort_order, id) AS row_number
    FROM public.proposal_payment_milestones
    WHERE proposal_id = p_proposal_id
    ORDER BY sort_order, id
  LOOP
    IF v_milestone.row_number < v_milestone_count THEN
      v_canonical_cents := round(
        v_target.total_amount::numeric * v_milestone.percentage / 100
      )::bigint;
    ELSE
      v_canonical_cents := v_target.total_amount - v_running_cents;
    END IF;

    IF v_canonical_cents <= 0 THEN
      RAISE EXCEPTION
        'proposal payment milestones must each resolve to a positive amount'
        USING ERRCODE = 'check_violation';
    END IF;

    UPDATE public.proposal_payment_milestones
    SET amount_cents = v_canonical_cents::integer
    WHERE id = v_milestone.id;

    v_running_cents := v_running_cents + v_canonical_cents;
  END LOOP;

  SELECT COALESCE(sum(amount_cents), 0)
  INTO v_persisted_cents
  FROM public.proposal_payment_milestones
  WHERE proposal_id = p_proposal_id;

  IF v_persisted_cents <> v_target.total_amount THEN
    RAISE EXCEPTION
      'proposal payment amounts must reconcile to proposal total'
      USING ERRCODE = 'check_violation';
  END IF;

  v_root_id := COALESCE(v_target.parent_proposal_id, v_target.id);

  PERFORM set_config('app.proposal_send_id', p_proposal_id::text, true);
  UPDATE public.proposals
  SET status           = 'sent',
      sent_at          = now(),
      personal_message = COALESCE(p_personal_message, personal_message),
      cc_email         = COALESCE(p_cc_email, cc_email),
      valid_until      = COALESCE(p_valid_until, valid_until),
      updated_at       = now()
  WHERE id = p_proposal_id
  RETURNING * INTO v_target;
  PERFORM set_config('app.proposal_send_id', '', true);

  UPDATE public.proposals
  SET status = 'revised', updated_at = now()
  WHERE (id = v_root_id OR parent_proposal_id = v_root_id)
    AND id <> p_proposal_id
    AND status IN ('sent', 'viewed', 'revised');

  RETURN v_target;
END;
$$;

REVOKE ALL ON FUNCTION public.send_proposal(
  uuid, timestamptz, integer, text, text, text, timestamptz
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.send_proposal(
  uuid, timestamptz, integer, text, text, text, timestamptz
) TO authenticated;

COMMENT ON FUNCTION public.send_proposal(
  uuid, timestamptz, integer, text, text, text, timestamptz
) IS
  'Sole proposal-send authority. Explicitly studio-authorized, draft-only, '
  'requires matching client/profile relationship legs, locks and compares the '
  'complete reviewed client-copy fingerprint, reconciles payment cents, and '
  'sets app.proposal_send_id only around the sent transition.';

-- ── Authoritative proposal identity ─────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.set_document_client(
  p_engagement_kind text,
  p_target_id uuid,
  p_client_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_designer uuid := auth.uid();
  v_target_designer uuid;
  v_current_designer_client_id uuid;
  v_proposal_status text;
  v_relationship public.designer_clients%ROWTYPE;
BEGIN
  IF v_designer IS NULL THEN
    RAISE EXCEPTION 'set_document_client requires an authenticated user'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_engagement_kind NOT IN ('project', 'proposal') THEN
    RAISE EXCEPTION 'unknown engagement kind %', p_engagement_kind
      USING ERRCODE = 'check_violation';
  END IF;

  IF p_engagement_kind = 'project' THEN
    SELECT designer_id
    INTO v_target_designer
    FROM public.projects
    WHERE id = p_target_id
    FOR UPDATE;
  ELSE
    -- Status and both identity legs share this one row lock. No sent/accepted
    -- proposal can be reassigned between the validation and protected update.
    SELECT designer_id, designer_client_id, status
    INTO v_target_designer, v_current_designer_client_id, v_proposal_status
    FROM public.proposals
    WHERE id = p_target_id
    FOR UPDATE;
  END IF;

  IF NOT FOUND OR v_target_designer IS DISTINCT FROM v_designer THEN
    RAISE EXCEPTION 'no % owned by you with id %', p_engagement_kind, p_target_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_engagement_kind = 'proposal' AND v_proposal_status <> 'draft' THEN
    RAISE EXCEPTION 'proposal client identity may only change while draft'
      USING ERRCODE = 'check_violation';
  END IF;

  IF p_client_id IS NOT NULL THEN
    SELECT relationship.*
    INTO v_relationship
    FROM public.designer_clients AS relationship
    WHERE relationship.designer_id = v_designer
      AND relationship.client_id = p_client_id
    ORDER BY
      COALESCE(relationship.id = v_current_designer_client_id, false) DESC,
      (relationship.status <> 'lead') DESC,
      relationship.updated_at DESC,
      relationship.created_at DESC,
      relationship.id
    LIMIT 1
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'client % is not one of your clients', p_client_id
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  ELSE
    v_relationship := NULL;
  END IF;

  IF p_engagement_kind = 'project' THEN
    UPDATE public.projects
    SET client_id = p_client_id, updated_at = now()
    WHERE id = p_target_id;
  ELSE
    PERFORM set_config('app.proposal_identity_id', p_target_id::text, true);
    UPDATE public.proposals
    SET client_id = p_client_id,
        designer_client_id = CASE
          WHEN p_client_id IS NULL THEN NULL
          ELSE v_relationship.id
        END,
        updated_at = now()
    WHERE id = p_target_id;
    PERFORM set_config('app.proposal_identity_id', '', true);
  END IF;

  IF p_client_id IS NOT NULL THEN
    IF p_engagement_kind = 'project'
       AND v_relationship.status IN ('lead', 'proposal')
    THEN
      UPDATE public.designer_clients
      SET status = 'active', updated_at = now()
      WHERE id = v_relationship.id;
    ELSIF p_engagement_kind = 'proposal'
          AND v_relationship.status = 'lead'
          AND NOT EXISTS (
            SELECT 1
            FROM public.designer_clients AS canonical
            WHERE canonical.designer_id = v_designer
              AND canonical.client_id = p_client_id
              AND canonical.id <> v_relationship.id
              AND canonical.status <> 'lead'
          )
    THEN
      UPDATE public.designer_clients
      SET status = 'proposal', updated_at = now()
      WHERE id = v_relationship.id;
    END IF;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.set_document_client(text, uuid, uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_document_client(text, uuid, uuid)
  TO authenticated;

COMMENT ON FUNCTION public.set_document_client(text, uuid, uuid) IS
  'Owner-scoped document attachment. Proposal identity may change only while '
  'draft and only as matching client_id/designer_client_id legs under the same '
  'proposal row lock; app.proposal_identity_id authorizes that exact update.';
