-- 00830 — Serialize inherited configured-purchase voids and board-only merges.
-- SQ-1255 / US-37: forward-only grafts from void_studio_purchase (00703)
-- and merge_studio_product (00753 → 00810). Existing signatures, ACLs,
-- authority checks and immutable-paper exclusions are retained.
-- Void: job → line → purchase, before status→approved restores configuration money.
-- Merge: sorted union of line/board jobs → sorted products → lines/boards;
-- retry a late uncensused reference rather than invert that order.
-- PO-cancellation's canonical writer detaches first (00449/00453); no live
-- attached-item cancellation writer was established. Its raw cascade is unchanged.
-- No new public object/signature or GRANT/REVOKE; no generated types/ACL delta.

CREATE OR REPLACE FUNCTION public.void_studio_purchase(p_purchase_id uuid, p_reason text)
RETURNS public.studio_purchases
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_reason text := NULLIF(btrim(COALESCE(p_reason, '')), '');
  v_row public.studio_purchases%ROWTYPE;
  v_project_id uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'void_studio_purchase: not authenticated' USING ERRCODE = 'insufficient_privilege';
  END IF;
  -- The status rollback can restore configured money: serialize with the
  -- first pricing approval before taking either the line or purchase lock.
  SELECT item.project_id INTO v_project_id
  FROM public.project_ffe_items item
  JOIN public.studio_purchases purchase ON purchase.ffe_item_id = item.id
  WHERE purchase.id = p_purchase_id;
  IF v_project_id IS NOT NULL THEN
    PERFORM public._ffe_require_studio_project(v_project_id);
    PERFORM public._ffe_lock_job_labels(v_project_id);
  END IF;
  -- Preserve the line-before-purchase order shared with record_studio_purchase.
  PERFORM 1 FROM public.project_ffe_items
   WHERE id = (SELECT ffe_item_id FROM public.studio_purchases WHERE id = p_purchase_id)
     FOR UPDATE;
  SELECT * INTO v_row FROM public.studio_purchases WHERE id = p_purchase_id FOR UPDATE;
  IF NOT FOUND OR NOT (CASE
       WHEN v_row.project_id IS NOT NULL THEN public.can_buy_for_project(v_row.project_id)
       ELSE public.is_active_org_member(v_row.organization_id)
     END) THEN
    RAISE EXCEPTION 'void_studio_purchase: purchase % not found or access denied', p_purchase_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF v_reason IS NULL OR char_length(v_reason) > 500 THEN
    RAISE EXCEPTION 'void_studio_purchase: a reason is required (at most 500 characters)'
      USING ERRCODE = 'check_violation';
  END IF;
  IF v_row.status = 'void' THEN
    RAISE EXCEPTION 'void_studio_purchase: purchase % is already void', p_purchase_id
      USING ERRCODE = 'check_violation';
  END IF;
  IF v_row.status = 'billed' OR v_row.invoice_line_id IS NOT NULL THEN
    RAISE EXCEPTION 'void_studio_purchase: purchase % was billed to the client; take it off the invoice first', p_purchase_id
      USING ERRCODE = 'check_violation';
  END IF;

  UPDATE public.studio_purchases
     SET status = 'void', voided_at = now(), voided_by = v_uid, void_reason = v_reason
   WHERE id = p_purchase_id
  RETURNING * INTO v_row;

  -- The line this purchase advanced goes back, as a cancelled PO's lines do
  -- (00184): only from 'ordered', with no PO and no other live purchase.
  IF v_row.ffe_item_id IS NOT NULL THEN
    PERFORM public._ffe_require_studio_project(v_row.project_id);
    PERFORM set_config('app.ffe_mutation_rpc', 'on', true);
    UPDATE public.project_ffe_items item
       SET status = 'approved', updated_at = now()
     WHERE item.id = v_row.ffe_item_id
       AND item.status = 'ordered'
       AND item.purchase_order_id IS NULL
       AND NOT EXISTS (
         SELECT 1 FROM public.studio_purchases other
          WHERE other.ffe_item_id = item.id AND other.status IN ('recorded', 'billed')
       );
  END IF;

  RETURN v_row;
END;
$$;

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
