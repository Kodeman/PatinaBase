-- ═══════════════════════════════════════════════════════════════════════════
-- 00692 — Vendor and trade cost on a project FF&E line (US-16 C-05; SQ-391)
--
-- A designer had no way to name the vendor or enter the trade cost on a
-- project line after placement: the table is RPC-only (00435/00438) and the
-- two browser hooks for it (useBulkReassignFfeVendor, useUpdateFFEItemPricing)
-- throw "RPC-only". The only post-placement price writers are approval,
-- activation and repricing. That leaves off-catalog lines unorderable
-- (create_purchase_order needs vendor_id) and with no trade cost.
--
-- set_project_ffe_line_commercials(p_item_id, p_request jsonb) accepts:
--   vendorId         uuid of an existing vendors row; vendor_name is copied
--                    from vendors.name so the denormalized name stays in
--                    lockstep (00148).
--   tradePriceCents  integer >= 0 (the vendor's unit cost).
-- Any other key is refused. Only on active lines with purchase_order_id IS
-- NULL: a line on a PO changes through the PO change workflow.
--
-- markup_percent is recomputed from the stored client unit price and the new
-- trade cost with the 00456 derivation (round((unit / trade − 1) × 100, 2)),
-- bounded the way 00666 bounds it: 0 when trade is 0 or the client price does
-- not exceed trade (the column CHECK forbids a negative markup), capped at
-- 999.99 (numeric(5,2)).
--
-- unit_price_cents and line_total_cents are never written: the client price
-- is out of scope here (R1, R5, R8). Nothing a client sees changes.
--
-- Adds GRANT/REVOKE → regenerate supabase/seed/00-legacy-grants.sql.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.set_project_ffe_line_commercials(
  p_item_id uuid, p_request jsonb
)
RETURNS public.project_ffe_items
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $$
DECLARE
  v_item public.project_ffe_items%ROWTYPE;
  v_has_vendor boolean;
  v_has_trade boolean;
  v_vendor_id uuid;
  v_vendor_name text;
  v_trade integer;
  v_unit integer;
  v_markup numeric(5,2);
BEGIN
  IF p_request IS NULL OR jsonb_typeof(p_request) <> 'object' THEN
    RAISE EXCEPTION 'set_project_ffe_line_commercials: request must be a JSON object'
      USING ERRCODE = 'check_violation';
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_object_keys(p_request) AS k
    WHERE k NOT IN ('vendorId', 'tradePriceCents')
  ) THEN
    RAISE EXCEPTION 'set_project_ffe_line_commercials: only vendorId and tradePriceCents can be set here'
      USING ERRCODE = 'check_violation';
  END IF;
  v_has_vendor := p_request ? 'vendorId';
  v_has_trade := p_request ? 'tradePriceCents';
  IF NOT v_has_vendor AND NOT v_has_trade THEN
    RAISE EXCEPTION 'set_project_ffe_line_commercials: nothing to set'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO v_item FROM public.project_ffe_items WHERE id = p_item_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'project not found or access denied'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  PERFORM public._ffe_require_studio_project(v_item.project_id);
  IF v_item.removed_at IS NOT NULL THEN
    RAISE EXCEPTION 'set_project_ffe_line_commercials: line was removed'
      USING ERRCODE = 'check_violation';
  END IF;
  IF v_item.purchase_order_id IS NOT NULL THEN
    RAISE EXCEPTION 'set_project_ffe_line_commercials: line is on a purchase order; change it through the purchase order'
      USING ERRCODE = 'check_violation';
  END IF;

  v_vendor_id := v_item.vendor_id;
  v_vendor_name := v_item.vendor_name;
  IF v_has_vendor THEN
    IF jsonb_typeof(p_request->'vendorId') <> 'string'
       OR (p_request->>'vendorId') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    THEN
      RAISE EXCEPTION 'set_project_ffe_line_commercials: vendorId must be a vendor id'
        USING ERRCODE = 'check_violation';
    END IF;
    SELECT id, name INTO v_vendor_id, v_vendor_name
    FROM public.vendors WHERE id = (p_request->>'vendorId')::uuid;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'set_project_ffe_line_commercials: vendor % does not exist', p_request->>'vendorId'
        USING ERRCODE = 'foreign_key_violation';
    END IF;
  END IF;

  v_trade := v_item.trade_price_cents;
  v_markup := v_item.markup_percent;
  IF v_has_trade THEN
    IF jsonb_typeof(p_request->'tradePriceCents') <> 'number'
       OR (p_request->>'tradePriceCents') !~ '^(0|[1-9][0-9]{0,9})$'
       OR (p_request->>'tradePriceCents')::bigint > 2147483647
    THEN
      RAISE EXCEPTION 'set_project_ffe_line_commercials: tradePriceCents must be a whole number of cents, 0 or more'
        USING ERRCODE = 'check_violation';
    END IF;
    v_trade := (p_request->>'tradePriceCents')::integer;
    v_unit := COALESCE(v_item.unit_price_cents, 0);
    IF v_trade > 0 AND v_unit > v_trade THEN
      v_markup := LEAST(round(((v_unit::numeric / v_trade::numeric) - 1) * 100, 2), 999.99);
    ELSE
      v_markup := 0;
    END IF;
  END IF;

  PERFORM set_config('app.ffe_mutation_rpc', 'on', true);
  UPDATE public.project_ffe_items SET
    vendor_id = v_vendor_id,
    vendor_name = v_vendor_name,
    trade_price_cents = v_trade,
    markup_percent = v_markup,
    updated_at = now()
  WHERE id = p_item_id
  RETURNING * INTO v_item;
  RETURN v_item;
END;
$$;

REVOKE ALL ON FUNCTION public.set_project_ffe_line_commercials(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_project_ffe_line_commercials(uuid, jsonb) TO authenticated;
