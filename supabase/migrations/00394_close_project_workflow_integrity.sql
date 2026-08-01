-- ═══════════════════════════════════════════════════════════════════════════
-- 00394 — close_project workflow-integrity census
--
-- Function-body lineage: 00238 → 00383 → 00387 → 00394
--
-- 00387 made close_project the owner-only, operationally guarded completion
-- authority, but it could still erase unfinished schedule and coordination
-- work. The project row now serializes the close with every child-creating RPC;
-- existing scope changes, client decisions, and phases are then locked in UUID
-- order before the invoice → line → milestone → FF&E dependency chain.
--
-- Terminal vocabulary is explicit:
--   project_phases       completed only
--   client_decisions     responded | expired
--   scope_change_requests declined | cancelled | applied_at IS NOT NULL
-- Draft/pending decisions, every unfinished phase, and every open or approved-
-- but-unapplied amendment therefore fail closed. Review outreach is not part of
-- closeout evidence: the real request action becomes available after close.
-- ═══════════════════════════════════════════════════════════════════════════

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

  -- Parent first. Besides serializing lifecycle acts, FOR UPDATE conflicts
  -- with the FK key-share lock needed by a newly inserted child, so no phase,
  -- decision, amendment, invoice, milestone, or FF&E row can appear after the
  -- locked census begins.
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
         'case_study'
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

  -- 00395's client scope-change creator follows project → scope-change order.
  -- Lock every existing row the same way, then reject any request that still
  -- needs a response or an apply_scope_change act.
  PERFORM scope_change.id
  FROM public.scope_change_requests AS scope_change
  WHERE scope_change.project_id = p_project_id
  ORDER BY scope_change.id
  FOR UPDATE;

  SELECT count(*) INTO v_blocker_count
  FROM public.scope_change_requests AS scope_change
  WHERE scope_change.project_id = p_project_id
    AND scope_change.applied_at IS NULL
    AND scope_change.status IS DISTINCT FROM 'declined'
    AND scope_change.status IS DISTINCT FROM 'cancelled';

  IF v_blocker_count > 0 THEN
    RAISE EXCEPTION
      'project cannot close: % scope change request(s) are unresolved',
      v_blocker_count
      USING ERRCODE = 'check_violation';
  END IF;

  -- Responded and expired are the guarded terminal decision states. Draft and
  -- pending rows remain live runtime coordination even when non-blocking. Lock
  -- decisions before phases to match both advance_project_phase and the
  -- completed-phase decision trigger's decision → phase order.
  PERFORM decision.id
  FROM public.client_decisions AS decision
  WHERE decision.project_id = p_project_id
  ORDER BY decision.id
  FOR UPDATE;

  SELECT count(*) INTO v_blocker_count
  FROM public.client_decisions AS decision
  WHERE decision.project_id = p_project_id
    AND decision.status IS DISTINCT FROM 'responded'
    AND decision.status IS DISTINCT FROM 'expired';

  IF v_blocker_count > 0 THEN
    RAISE EXCEPTION
      'project cannot close: % coordination/decision item(s) are unresolved',
      v_blocker_count
      USING ERRCODE = 'check_violation';
  END IF;

  -- One project-phase state is terminal. Pending, in-progress, and delayed all
  -- represent promised work and must be completed through phase authority.
  PERFORM phase.id
  FROM public.project_phases AS phase
  WHERE phase.project_id = p_project_id
  ORDER BY phase.id
  FOR UPDATE;

  SELECT count(*) INTO v_blocker_count
  FROM public.project_phases AS phase
  WHERE phase.project_id = p_project_id
    AND phase.status IS DISTINCT FROM 'completed';

  IF v_blocker_count > 0 THEN
    RAISE EXCEPTION
      'project cannot close: % project phase(s) are not completed',
      v_blocker_count
      USING ERRCODE = 'check_violation';
  END IF;

  -- Preserve 00383/00387's dependency order after the workflow census:
  -- invoice → line → milestone → FF&E.
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
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.close_project(uuid, jsonb, jsonb)
  TO authenticated;

COMMENT ON FUNCTION public.close_project(uuid, jsonb, jsonb) IS
  'Sole project-completion authority. Exact owner only; locks project, scope '
  'changes, decisions, phases, invoices, lines, milestones, and FF&E; rejects '
  'unfinished workflow or operational balances before the guarded transition. '
  'Review outreach is truthful post-close work, not checklist evidence.';
