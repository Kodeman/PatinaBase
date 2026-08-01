-- ═══════════════════════════════════════════════════════════════════════════
-- 00383 — close_project operational-truth guard
--
-- 00382 is owned by f8d2d44b (spec_book_row_version_compatibility); this
-- migration intentionally follows it without copying or changing that work.
-- Function-body lineage: 00238 → 00383 (whole body reproduced below).
--
-- A checked UI list cannot make unfinished procurement or an outstanding
-- receivable true. close_project now locks the project and its current
-- operational children, validates the complete seven-item workflow evidence,
-- and refuses completion until installation, FF&E billing, milestones,
-- invoice balances, and positive contract collection all agree. Projects with
-- no operational rows and no positive contract remain valid (for example, a
-- nonbillable consultation).
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

  -- Lock the operational rows before evaluating them. The project FOR UPDATE
  -- lock also conflicts with FK key-share locks for new children, so the set
  -- cannot gain a new milestone/invoice/FF&E row beneath this closeout.
  PERFORM 1
  FROM public.project_ffe_items
  WHERE project_id = p_project_id
  ORDER BY id
  FOR UPDATE;

  PERFORM 1
  FROM public.project_payment_milestones
  WHERE project_id = p_project_id
  ORDER BY id
  FOR UPDATE;

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
    AND NOT EXISTS (
      SELECT 1
      FROM public.invoice_line_items AS line
      JOIN public.invoices AS invoice ON invoice.id = line.invoice_id
      WHERE line.ffe_item_id = ffe.id
        AND invoice.project_id = p_project_id
        AND invoice.status = 'paid'
        AND invoice.amount_paid_cents >= invoice.total_cents
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

  SELECT count(*) INTO v_blocker_count
  FROM public.invoices
  WHERE project_id = p_project_id
    AND status <> 'void'
    AND total_cents > amount_paid_cents;

  IF v_blocker_count > 0 THEN
    RAISE EXCEPTION
      'project cannot close: % invoice(s) still carry a balance', v_blocker_count
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT COALESCE(sum(LEAST(total_cents, amount_paid_cents)), 0)
  INTO v_collected_cents
  FROM public.invoices
  WHERE project_id = p_project_id
    AND status <> 'void';

  IF COALESCE(v_project.total_amount_cents, 0) > v_collected_cents THEN
    RAISE EXCEPTION
      'project cannot close: contract total is not fully collected'
      USING ERRCODE = 'check_violation';
  END IF;

  -- One transaction: status → completed (completed_at stamps via the 00095
  -- trigger), the checklist + snapshot settle onto the row. Re-closing an
  -- already-completed project refreshes the words only while truth still holds.
  UPDATE public.projects
  SET status             = 'completed',
      closure_checklist  = v_effective_closure,
      portfolio_snapshot = COALESCE(p_snapshot, portfolio_snapshot),
      updated_at         = now()
  WHERE id = p_project_id
  RETURNING * INTO v_project;

  RETURN v_project;
END;
$$;

REVOKE ALL ON FUNCTION public.close_project(uuid, jsonb, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.close_project(uuid, jsonb, jsonb) TO authenticated;

COMMENT ON FUNCTION public.close_project(uuid, jsonb, jsonb) IS
  'R80 closeout transaction, guarded by the complete workflow checklist and '
  'authoritative installation/billing/milestone/collection state. Empty '
  'operational sets are allowed only when no positive contract remains.';
