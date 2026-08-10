-- 00451 — Preserve acknowledgment error compatibility after co-member widening.

CREATE OR REPLACE FUNCTION public.log_po_acknowledgment(
  p_po_id uuid, p_vendor_po_number text DEFAULT NULL, p_confirmed_eta date DEFAULT NULL
)
RETURNS public.purchase_orders
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $$
DECLARE v_po public.purchase_orders%ROWTYPE;
BEGIN
  SELECT * INTO v_po FROM public.purchase_orders WHERE id = p_po_id FOR UPDATE;
  IF NOT FOUND OR NOT public.is_studio_comember(v_po.designer_id) THEN
    RAISE EXCEPTION 'log_po_acknowledgment: purchase order % not found or access denied', p_po_id;
  END IF;
  IF v_po.needs_repricing THEN
    RAISE EXCEPTION 'replacement purchase order must be repriced before acknowledgment'
      USING ERRCODE = 'check_violation';
  END IF;
  IF v_po.status NOT IN ('draft','confirmed','in_production','shipped','delivered') THEN
    RAISE EXCEPTION 'log_po_acknowledgment: purchase order % is %, cancelled orders cannot be acknowledged',
      p_po_id, v_po.status USING ERRCODE = 'check_violation';
  END IF;
  PERFORM set_config('app.ffe_mutation_rpc', 'on', true);
  UPDATE public.purchase_orders SET
    acknowledged_at = COALESCE(acknowledged_at, now()),
    status = CASE WHEN status = 'draft' THEN 'confirmed' ELSE status END,
    vendor_po_number = COALESCE(p_vendor_po_number, vendor_po_number),
    confirmed_eta = COALESCE(p_confirmed_eta, confirmed_eta)
  WHERE id = p_po_id RETURNING * INTO v_po;
  RETURN v_po;
END;
$$;

REVOKE ALL ON FUNCTION public.log_po_acknowledgment(uuid, text, date)
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.log_po_acknowledgment(uuid, text, date)
  TO authenticated;
