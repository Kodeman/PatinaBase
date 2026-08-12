-- Materialized 2026-08-12 from Strata's migration ledger (applied out-of-band; git had no source file). Do not re-run manually.

-- 00456 — Prevent replacement PO release-by-timestamp and clear repricing holds atomically.

CREATE OR REPLACE FUNCTION public.guard_purchase_order_repricing()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public', 'pg_temp' AS $$
BEGIN
  IF (OLD.needs_repricing OR NEW.needs_repricing) AND (
    (OLD.sent_at IS NULL AND NEW.sent_at IS NOT NULL)
    OR NEW.status NOT IN ('draft', 'cancelled')
  ) THEN
    RAISE EXCEPTION 'replacement purchase order must be repriced before release'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_purchase_order_repricing_trg ON public.purchase_orders;

CREATE TRIGGER guard_purchase_order_repricing_trg
BEFORE UPDATE OF status, sent_at ON public.purchase_orders
FOR EACH ROW EXECUTE FUNCTION public.guard_purchase_order_repricing();

CREATE OR REPLACE FUNCTION public.reprice_replacement_purchase_order(
  p_purchase_order_id uuid,
  p_lines jsonb,
  p_custom_payments jsonb DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_po public.purchase_orders%ROWTYPE;
  v_line record;
  v_line_count integer;
  v_total bigint := 0;
  v_client_total bigint := 0;
  v_deposit integer;
  v_due_date date;
BEGIN
  SELECT * INTO v_po FROM public.purchase_orders
  WHERE id = p_purchase_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'purchase order not found' USING ERRCODE = 'no_data_found';
  END IF;
  PERFORM public._ffe_require_studio_project(v_po.project_id);
  IF NOT v_po.needs_repricing OR v_po.status <> 'draft'
     OR v_po.sent_at IS NOT NULL OR v_po.acknowledged_at IS NOT NULL THEN
    RAISE EXCEPTION 'purchase order is not an unreleased replacement awaiting repricing'
      USING ERRCODE = 'check_violation';
  END IF;
  IF jsonb_typeof(p_lines) <> 'array' OR jsonb_array_length(p_lines) = 0 THEN
    RAISE EXCEPTION 'replacement pricing requires every purchase order line'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT count(*) INTO v_line_count FROM public.project_ffe_items
  WHERE purchase_order_id = p_purchase_order_id;
  IF v_line_count <> jsonb_array_length(p_lines)
     OR EXISTS (
       SELECT 1 FROM jsonb_array_elements(p_lines) entry
       GROUP BY entry->>'selectionId' HAVING count(*) <> 1
     )
     OR EXISTS (
       SELECT 1 FROM jsonb_array_elements(p_lines) entry
       WHERE entry->>'selectionId' !~* '^[0-9a-f-]{36}$'
         OR NOT EXISTS (
           SELECT 1 FROM public.project_ffe_items item
           WHERE item.id = (entry->>'selectionId')::uuid
             AND item.purchase_order_id = p_purchase_order_id
             AND item.project_id = v_po.project_id
             AND item.vendor_id = v_po.vendor_id
             AND item.removed_at IS NULL
             AND item.design_disposition = 'selected'
         )
     )
  THEN
    RAISE EXCEPTION 'replacement pricing must contain each active PO line exactly once'
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;

  FOR v_line IN
    SELECT item.id, item.quantity, entry->>'unitPriceCents' AS unit_text,
      entry->>'tradePriceCents' AS trade_text
    FROM jsonb_array_elements(p_lines) entry
    JOIN public.project_ffe_items item ON item.id = (entry->>'selectionId')::uuid
    ORDER BY item.id FOR UPDATE OF item
  LOOP
    IF v_line.quantity IS NULL OR v_line.quantity <= 0
       OR v_line.unit_text !~ '^[1-9][0-9]{0,9}$'
       OR v_line.trade_text !~ '^[1-9][0-9]{0,9}$'
       OR v_line.unit_text::bigint > 2147483647
       OR v_line.trade_text::bigint > 2147483647
       OR v_line.unit_text::bigint < v_line.trade_text::bigint
       OR v_line.quantity::bigint * v_line.unit_text::bigint > 2147483647
       OR v_line.quantity::bigint * v_line.trade_text::bigint > 2147483647
    THEN
      RAISE EXCEPTION 'replacement line pricing is incomplete or outside supported bounds'
        USING ERRCODE = 'check_violation';
    END IF;
    v_total := v_total + v_line.quantity::bigint * v_line.trade_text::bigint;
    v_client_total := v_client_total + v_line.quantity::bigint * v_line.unit_text::bigint;
    IF v_total > 2147483647 OR v_client_total > 2147483647 THEN
      RAISE EXCEPTION 'replacement purchase order totals exceed supported bounds'
        USING ERRCODE = 'check_violation';
    END IF;
    PERFORM set_config('app.ffe_mutation_rpc', 'on', true);
    UPDATE public.project_ffe_items SET
      unit_price_cents = v_line.unit_text::integer,
      trade_price_cents = v_line.trade_text::integer,
      markup_percent = round(((v_line.unit_text::numeric / v_line.trade_text::numeric) - 1) * 100, 2),
      line_total_cents = v_line.quantity * v_line.unit_text::integer,
      updated_at = now()
    WHERE id = v_line.id;
  END LOOP;

  SELECT min(due_date) INTO v_due_date FROM public.po_payments
  WHERE purchase_order_id = p_purchase_order_id;
  DELETE FROM public.po_payments WHERE purchase_order_id = p_purchase_order_id;
  IF v_po.payment_pattern = 'fifty_fifty' THEN
    v_deposit := v_total::integer / 2;
    INSERT INTO public.po_payments(purchase_order_id,kind,amount_cents,due_date,state,sort_order)
    VALUES (v_po.id,'deposit',v_deposit,v_due_date,'pending',0),
      (v_po.id,'balance',v_total::integer-v_deposit,NULL,'pending',1);
  ELSIF v_po.payment_pattern = 'thirty_seventy' THEN
    v_deposit := floor(v_total * 0.3)::integer;
    INSERT INTO public.po_payments(purchase_order_id,kind,amount_cents,due_date,state,sort_order)
    VALUES (v_po.id,'deposit',v_deposit,v_due_date,'pending',0),
      (v_po.id,'balance',v_total::integer-v_deposit,NULL,'pending',1);
  ELSIF v_po.payment_pattern = 'full_upfront' THEN
    INSERT INTO public.po_payments(purchase_order_id,kind,amount_cents,due_date,state,sort_order)
    VALUES (v_po.id,'deposit',v_total::integer,v_due_date,'pending',0);
  ELSIF v_po.payment_pattern = 'net_30' THEN
    INSERT INTO public.po_payments(purchase_order_id,kind,amount_cents,due_date,state,sort_order)
    VALUES (v_po.id,'balance',v_total::integer,NULL,'pending',0);
  ELSE
    IF jsonb_typeof(p_custom_payments) <> 'array'
       OR jsonb_array_length(p_custom_payments) = 0
       OR EXISTS (
         SELECT 1 FROM jsonb_array_elements(p_custom_payments) payment
         WHERE payment->>'amountCents' !~ '^[1-9][0-9]{0,9}$'
           OR (payment->>'amountCents')::bigint > 2147483647
       )
       OR (SELECT sum((payment->>'amountCents')::bigint)
           FROM jsonb_array_elements(p_custom_payments) payment) <> v_total
    THEN
      RAISE EXCEPTION 'custom replacement payments must be positive and equal the trade total'
        USING ERRCODE = 'check_violation';
    END IF;
    INSERT INTO public.po_payments(
      purchase_order_id,kind,amount_cents,due_date,state,label,sort_order
    ) SELECT v_po.id,'milestone',(payment->>'amountCents')::integer,
      CASE WHEN payment->>'dueDate' ~ '^\d{4}-\d{2}-\d{2}$'
        THEN (payment->>'dueDate')::date END,
      'pending',NULLIF(btrim(payment->>'label'),''),ordinality-1
    FROM jsonb_array_elements(p_custom_payments) WITH ORDINALITY AS rows(payment,ordinality);
  END IF;

  PERFORM set_config('app.ffe_mutation_rpc', 'on', true);
  UPDATE public.purchase_orders SET total_cents = v_total::integer,
    needs_repricing = false, updated_at = now()
  WHERE id = v_po.id;
  RETURN jsonb_build_object(
    'purchaseOrderId',v_po.id,'needsRepricing',false,
    'tradeTotalCents',v_total,'clientTotalCents',v_client_total,
    'lineCount',v_line_count
  );
END;
$$;

REVOKE ALL ON FUNCTION public.reprice_replacement_purchase_order(uuid,jsonb,jsonb)
  FROM PUBLIC, anon, service_role;

GRANT EXECUTE ON FUNCTION public.reprice_replacement_purchase_order(uuid,jsonb,jsonb)
  TO authenticated;
