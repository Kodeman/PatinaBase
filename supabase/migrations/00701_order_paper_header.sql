-- ═══════════════════════════════════════════════════════════════════════════
-- 00701 — The order paper's header fields (US-16 Phase 2, C-23; SQ-418)
-- ═══════════════════════════════════════════════════════════════════════════
-- d1 D1-05 (the order paper) and d2 §M6 (freight terms, requested ship date).
-- The paper is the PO: sidemark, requested ship, ship-to, bill-to, freight,
-- lines, riders, terms, note to the vendor. Ship-to has its own writers
-- (set_purchase_order_ship_to 00690, set_purchase_order_ship_to_location
-- 00697/00716); riders are po_cost_lines (00704). This adds the rest.
--
-- ── WHAT THIS ADDS ──────────────────────────────────────────────────────────
-- purchase_orders columns
--   sidemark           already on the table since 00186 (create_purchase_order
--                      writes it); listed here only so the header RPC owns it.
--   requested_ship_on  the ship date the studio asks for.
--   bill_to            who the vendor invoices: {name, street, city, state,
--                      zip, country}, every value a string (the
--                      studio_locations address shape plus a name).
--   freight_terms      prepaid | collect | prepaid_add | fob_origin |
--                      fob_destination.
--   vendor_note        the note printed to the vendor.
--
-- set_purchase_order_header(p_po_id, p_request jsonb)
--   Patch semantics over sidemark, requestedShipOn, billTo, freightTerms and
--   vendorNote (00698's rule): a key that is absent leaves the column alone,
--   a key sent as null or blank clears it, an unknown key is refused. Gate:
--   can_send_purchase_order (00690). Refused once the PO was sent (sent_at is
--   set): the paper the vendor got is the paper the studio confirmed, so a
--   change after send is void-to-edit, then a change order (R8). Refused on a
--   cancelled PO.
--
-- Adds GRANT/REVOKE → supabase/seed/00-legacy-grants.sql regenerated.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 1. Columns ─────────────────────────────────────────────────────────────

ALTER TABLE public.purchase_orders
  ADD COLUMN IF NOT EXISTS sidemark text,
  ADD COLUMN IF NOT EXISTS requested_ship_on date,
  ADD COLUMN IF NOT EXISTS bill_to jsonb,
  ADD COLUMN IF NOT EXISTS freight_terms text,
  ADD COLUMN IF NOT EXISTS vendor_note text;

ALTER TABLE public.purchase_orders
  DROP CONSTRAINT IF EXISTS purchase_orders_order_paper_ck;
ALTER TABLE public.purchase_orders
  ADD CONSTRAINT purchase_orders_order_paper_ck CHECK (
    (freight_terms IS NULL
      OR freight_terms IN ('prepaid', 'collect', 'prepaid_add', 'fob_origin', 'fob_destination'))
    AND (bill_to IS NULL OR (
      jsonb_typeof(bill_to) = 'object'
      AND (bill_to - ARRAY['name', 'street', 'city', 'state', 'zip', 'country']) = '{}'::jsonb
      AND NOT jsonb_path_exists(bill_to, '$.* ? (@.type() != "string")')
    ))
    AND (vendor_note IS NULL OR char_length(vendor_note) <= 4000)
  );

COMMENT ON COLUMN public.purchase_orders.requested_ship_on IS
  'The ship date the studio asks the vendor for (00701, C-23). Written by set_purchase_order_header.';
COMMENT ON COLUMN public.purchase_orders.bill_to IS
  'Who the vendor invoices: {name, street, city, state, zip, country}, strings only (00701, C-23). '
  'Written by set_purchase_order_header.';
COMMENT ON COLUMN public.purchase_orders.freight_terms IS
  'prepaid | collect | prepaid_add | fob_origin | fob_destination (00701, C-23, d2 §M6). Written by '
  'set_purchase_order_header.';
COMMENT ON COLUMN public.purchase_orders.vendor_note IS
  'The note to the vendor printed on the order paper (00701, C-23). Written by set_purchase_order_header.';

-- ─── 2. set_purchase_order_header ───────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.set_purchase_order_header(
  p_po_id uuid, p_request jsonb
)
RETURNS public.purchase_orders
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $$
DECLARE
  v_po public.purchase_orders%ROWTYPE;
  v_req jsonb := COALESCE(p_request, '{}'::jsonb);
  v_keys constant text[] := ARRAY['sidemark', 'requestedShipOn', 'billTo', 'freightTerms', 'vendorNote'];
  v_sidemark text;
  v_requested date;
  v_bill_to jsonb;
  v_freight text;
  v_note text;
BEGIN
  SELECT * INTO v_po FROM public.purchase_orders WHERE id = p_po_id FOR UPDATE;
  IF NOT FOUND OR NOT public.can_send_purchase_order(p_po_id) THEN
    RAISE EXCEPTION 'set_purchase_order_header: purchase order % not found or access denied', p_po_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF jsonb_typeof(v_req) <> 'object' THEN
    RAISE EXCEPTION 'set_purchase_order_header: request must be an object'
      USING ERRCODE = 'check_violation';
  END IF;
  IF (v_req - v_keys) <> '{}'::jsonb THEN
    RAISE EXCEPTION 'set_purchase_order_header: unknown keys %',
      (SELECT string_agg(key, ', ') FROM jsonb_object_keys(v_req - v_keys) AS key)
      USING ERRCODE = 'check_violation';
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_each(v_req - 'billTo') AS entry
    WHERE jsonb_typeof(entry.value) NOT IN ('string', 'null')
  ) OR jsonb_typeof(COALESCE(v_req->'billTo', 'null'::jsonb)) NOT IN ('object', 'null') THEN
    RAISE EXCEPTION 'set_purchase_order_header: billTo must be an object or null; every other value a string or null'
      USING ERRCODE = 'check_violation';
  END IF;
  IF v_po.status = 'cancelled' THEN
    RAISE EXCEPTION 'set_purchase_order_header: purchase order % is cancelled', p_po_id
      USING ERRCODE = 'check_violation';
  END IF;
  -- R8: the paper the vendor got is fixed; void-to-edit, then a change order.
  IF v_po.sent_at IS NOT NULL THEN
    RAISE EXCEPTION 'set_purchase_order_header: purchase order % was already sent; the order paper is fixed', p_po_id
      USING ERRCODE = 'check_violation';
  END IF;

  v_sidemark := NULLIF(btrim(COALESCE(v_req->>'sidemark', '')), '');
  IF char_length(v_sidemark) > 200 THEN
    RAISE EXCEPTION 'set_purchase_order_header: sidemark is longer than 200 characters'
      USING ERRCODE = 'check_violation';
  END IF;

  IF NULLIF(btrim(COALESCE(v_req->>'requestedShipOn', '')), '') IS NOT NULL THEN
    BEGIN
      v_requested := (v_req->>'requestedShipOn')::date;
    EXCEPTION WHEN invalid_datetime_format OR datetime_field_overflow THEN
      RAISE EXCEPTION 'set_purchase_order_header: requestedShipOn must be a date (YYYY-MM-DD)'
        USING ERRCODE = 'check_violation';
    END;
  END IF;

  v_freight := NULLIF(btrim(COALESCE(v_req->>'freightTerms', '')), '');
  IF v_freight IS NOT NULL
     AND v_freight NOT IN ('prepaid', 'collect', 'prepaid_add', 'fob_origin', 'fob_destination') THEN
    RAISE EXCEPTION 'set_purchase_order_header: freightTerms must be prepaid, collect, prepaid_add, fob_origin or fob_destination'
      USING ERRCODE = 'check_violation';
  END IF;

  v_note := NULLIF(btrim(COALESCE(v_req->>'vendorNote', '')), '');
  IF char_length(v_note) > 4000 THEN
    RAISE EXCEPTION 'set_purchase_order_header: vendorNote is longer than 4000 characters'
      USING ERRCODE = 'check_violation';
  END IF;

  IF jsonb_typeof(v_req->'billTo') = 'object' THEN
    IF ((v_req->'billTo') - ARRAY['name', 'street', 'city', 'state', 'zip', 'country']) <> '{}'::jsonb
       OR jsonb_path_exists(v_req->'billTo', '$.* ? (@.type() != "string")') THEN
      RAISE EXCEPTION 'set_purchase_order_header: billTo takes name, street, city, state, zip and country, all strings'
        USING ERRCODE = 'check_violation';
    END IF;
    -- Blank parts are dropped; an empty address clears the column.
    SELECT NULLIF(jsonb_object_agg(key, btrim(value)), '{}'::jsonb) INTO v_bill_to
    FROM jsonb_each_text(v_req->'billTo')
    WHERE btrim(value) <> '';
  END IF;

  PERFORM set_config('app.ffe_mutation_rpc', 'on', true);
  UPDATE public.purchase_orders SET
    sidemark = CASE WHEN v_req ? 'sidemark' THEN v_sidemark ELSE sidemark END,
    requested_ship_on = CASE WHEN v_req ? 'requestedShipOn' THEN v_requested ELSE requested_ship_on END,
    bill_to = CASE WHEN v_req ? 'billTo' THEN v_bill_to ELSE bill_to END,
    freight_terms = CASE WHEN v_req ? 'freightTerms' THEN v_freight ELSE freight_terms END,
    vendor_note = CASE WHEN v_req ? 'vendorNote' THEN v_note ELSE vendor_note END
  WHERE id = p_po_id
  RETURNING * INTO v_po;
  RETURN v_po;
END;
$$;

COMMENT ON FUNCTION public.set_purchase_order_header(uuid, jsonb) IS
  'Writes the order paper''s header (00701, C-23): sidemark, requestedShipOn, billTo, freightTerms, '
  'vendorNote. Patch semantics (absent = unchanged, null/blank = cleared, unknown key refused). Gate: '
  'can_send_purchase_order. Refused after send (R8) and on a cancelled PO.';

REVOKE ALL ON FUNCTION public.set_purchase_order_header(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_purchase_order_header(uuid, jsonb) TO authenticated;
