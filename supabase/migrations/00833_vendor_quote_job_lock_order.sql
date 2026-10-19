-- 00833 — Vendor quote apply takes the job label lock before its items.
-- Lineage: 00707 → 00833; commercial helper job prelock introduced in 00810.
-- Reconciles the native quote/item → commercial/job deadlock (SQ-1414).
-- CREATE OR REPLACE preserves the existing authenticated/service ACLs.

CREATE OR REPLACE FUNCTION public.apply_vendor_quote_to_lines(
  p_quote_id uuid,
  p_ffe_item_ids uuid[] DEFAULT NULL
)
RETURNS SETOF public.vendor_quote_lines
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_uid   uuid := auth.uid();
  v_quote public.vendor_quotes%ROWTYPE;
  v_line  record;
  v_state text;
  v_count integer := 0;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'apply_vendor_quote_to_lines: not authenticated' USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT * INTO v_quote FROM public.vendor_quotes WHERE id = p_quote_id;
  IF NOT FOUND OR NOT public.can_buy_for_project(v_quote.project_id) THEN
    RAISE EXCEPTION 'apply_vendor_quote_to_lines: quote % not found or access denied', p_quote_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF v_quote.superseded_by IS NOT NULL THEN
    RAISE EXCEPTION 'apply_vendor_quote_to_lines: quote % was superseded by a newer quote', p_quote_id
      USING ERRCODE = 'check_violation';
  END IF;
  IF p_ffe_item_ids IS NOT NULL AND (
    cardinality(p_ffe_item_ids) = 0
    OR EXISTS (
      SELECT 1 FROM unnest(p_ffe_item_ids) AS wanted(id)
      WHERE NOT EXISTS (
        SELECT 1 FROM public.vendor_quote_lines AS ql WHERE ql.quote_id = p_quote_id AND ql.ffe_item_id = wanted.id
      )
    )
  ) THEN
    RAISE EXCEPTION 'apply_vendor_quote_to_lines: every chosen line must be on quote %', p_quote_id
      USING ERRCODE = 'check_violation';
  END IF;

  -- Match the commercial writer: job labels before any quoted item.
  PERFORM public._ffe_lock_job_labels(v_quote.project_id);

  FOR v_line IN
    SELECT ql.id AS quote_line_id, ql.unit_trade_cents, item.id AS item_id, item.purchase_order_id
    FROM public.vendor_quote_lines AS ql
    JOIN public.project_ffe_items AS item ON item.id = ql.ffe_item_id
    WHERE ql.quote_id = p_quote_id
      AND (p_ffe_item_ids IS NULL OR ql.ffe_item_id = ANY(p_ffe_item_ids))
    ORDER BY item.id
    FOR UPDATE OF item
  LOOP
    IF v_line.purchase_order_id IS NOT NULL THEN
      RAISE EXCEPTION 'apply_vendor_quote_to_lines: line % is on a purchase order; change it through the purchase order', v_line.item_id
        USING ERRCODE = 'check_violation';
    END IF;
    -- R8: editable until it is on a sent authorization.
    v_state := public.ffe_line_authorization_state(v_line.item_id);
    IF v_state IS NOT NULL THEN
      RAISE EXCEPTION 'change_order_required: line % sits on a % authorization; %', v_line.item_id, v_state,
        CASE WHEN v_state = 'sent' THEN 'void the authorization to edit it'
             ELSE 'a price change is a change order the client re-approves' END
        USING ERRCODE = 'check_violation';
    END IF;
    -- Trade only; the client price stays (R1/R2).
    PERFORM public.set_project_ffe_line_commercials(
      v_line.item_id, jsonb_build_object('tradePriceCents', v_line.unit_trade_cents));
    UPDATE public.vendor_quote_lines SET applied_at = now(), applied_by = v_uid WHERE id = v_line.quote_line_id;
    v_count := v_count + 1;
  END LOOP;
  IF v_count = 0 THEN
    RAISE EXCEPTION 'apply_vendor_quote_to_lines: quote % has no lines to apply', p_quote_id
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN QUERY
    SELECT ql.* FROM public.vendor_quote_lines AS ql
    WHERE ql.quote_id = p_quote_id
      AND (p_ffe_item_ids IS NULL OR ql.ffe_item_id = ANY(p_ffe_item_ids))
    ORDER BY ql.ffe_item_id;
END;
$$;

