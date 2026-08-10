-- 00452 — Return the persisted replacement repricing state.

ALTER FUNCTION public.start_purchase_order_change(jsonb)
  RENAME TO _start_purchase_order_change_00451_impl;
REVOKE ALL ON FUNCTION public._start_purchase_order_change_00451_impl(jsonb)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.start_purchase_order_change(p_request jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $$
DECLARE v_result jsonb; v_replacement_id uuid; v_needs_repricing boolean := false;
BEGIN
  v_result := public._start_purchase_order_change_00451_impl(p_request);
  v_replacement_id := NULLIF(v_result->>'replacementPoId', '')::uuid;
  IF v_replacement_id IS NOT NULL THEN
    SELECT needs_repricing INTO STRICT v_needs_repricing
    FROM public.purchase_orders WHERE id = v_replacement_id;
  END IF;
  RETURN v_result || jsonb_build_object('needsRepricing', v_needs_repricing);
END;
$$;

REVOKE ALL ON FUNCTION public.start_purchase_order_change(jsonb)
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.start_purchase_order_change(jsonb)
  TO authenticated;
