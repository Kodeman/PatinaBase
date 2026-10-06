-- ═══════════════════════════════════════════════════════════════════════════
-- 00698 — Tracking on purchase orders: carrier, tracking number, BOL, shipped
--         date, ETA history (US-16 Phase 1, C-18; SQ-403)
-- ═══════════════════════════════════════════════════════════════════════════
-- d2 §M6 (shipments part) and d1 D1-07. Phase 1 keeps tracking on the PO
-- header; po_shipments (partial shipments, one row per truck) arrives in
-- Phase 2 (00704) in the same words.
--
-- ── WHAT THIS ADDS ──────────────────────────────────────────────────────────
-- purchase_orders columns
--   carrier            who moves it ("Estes", "UPS", "their truck").
--   tracking_number    PRO or parcel tracking number.
--   bol_document_path  storage path of the bill of lading.
--   shipped_on         the day it left the vendor.
--   eta_history        append-only list of ETA changes, oldest first:
--                      [{eta, note, at, by}]. Written only by
--                      set_purchase_order_eta. The Movement cell shows the last
--                      change in grey; the Ledger unfold shows the list.
--
-- set_purchase_order_tracking(p_po_id, p_request jsonb)
--   Patch semantics over carrier, trackingNumber, bolDocumentPath and
--   shippedOn: a key that is absent leaves the column alone, a key sent as
--   null or blank clears it, an unknown key is refused. Gate:
--   can_send_purchase_order (00690). Never moves status: "Save as shipped" is
--   this call followed by advance_purchase_order_status(…, 'shipped'), which
--   keeps a shippedOn already entered.
--
-- ── REDEFINED (same signatures; CREATE OR REPLACE keeps each ACL) ──────────
--   set_purchase_order_eta(uuid, date, text, date)
--       Lineage: 00690 → 00698. Body copied verbatim from 00690. Delta: an
--       ETA that actually changes appends {eta, note, at, by} to eta_history.
--       Re-entering the same date appends nothing (the notes audit line still
--       records a note).
--   advance_purchase_order_status(uuid, text, text, date)
--       Lineage: 00690 → 00698. Body copied verbatim from 00690. Delta: the
--       move to 'shipped' stamps shipped_on with the studio's day when it is
--       still NULL.
--
-- Adds GRANT/REVOKE → supabase/seed/00-legacy-grants.sql regenerated.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 1. Columns ─────────────────────────────────────────────────────────────

ALTER TABLE public.purchase_orders
  ADD COLUMN IF NOT EXISTS carrier text,
  ADD COLUMN IF NOT EXISTS tracking_number text,
  ADD COLUMN IF NOT EXISTS bol_document_path text,
  ADD COLUMN IF NOT EXISTS shipped_on date,
  ADD COLUMN IF NOT EXISTS eta_history jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.purchase_orders
  DROP CONSTRAINT IF EXISTS purchase_orders_tracking_ck;
ALTER TABLE public.purchase_orders
  ADD CONSTRAINT purchase_orders_tracking_ck CHECK (
    (carrier IS NULL OR char_length(carrier) <= 120)
    AND (tracking_number IS NULL OR char_length(tracking_number) <= 120)
    AND (bol_document_path IS NULL OR char_length(bol_document_path) <= 1024)
    AND jsonb_typeof(eta_history) = 'array'
  );

COMMENT ON COLUMN public.purchase_orders.carrier IS
  'Who moves the shipment (00698, C-18). Written by set_purchase_order_tracking.';
COMMENT ON COLUMN public.purchase_orders.tracking_number IS
  'PRO or parcel tracking number (00698, C-18). Written by set_purchase_order_tracking.';
COMMENT ON COLUMN public.purchase_orders.bol_document_path IS
  'Storage path of the bill of lading (00698, C-18). Written by set_purchase_order_tracking.';
COMMENT ON COLUMN public.purchase_orders.shipped_on IS
  'The day the shipment left the vendor (00698, C-18). Set by set_purchase_order_tracking, or '
  'stamped with the studio''s day by advance_purchase_order_status(…, ''shipped'') when NULL.';
COMMENT ON COLUMN public.purchase_orders.eta_history IS
  'Append-only ETA changes, oldest first: [{eta, note, at, by}] (00698, C-18). Written only by '
  'set_purchase_order_eta, one entry per change of confirmed_eta.';

-- ─── 2. set_purchase_order_tracking ─────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.set_purchase_order_tracking(
  p_po_id uuid, p_request jsonb
)
RETURNS public.purchase_orders
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $$
DECLARE
  v_po public.purchase_orders%ROWTYPE;
  v_req jsonb := COALESCE(p_request, '{}'::jsonb);
  v_utc_day date := (now() AT TIME ZONE 'UTC')::date;
  v_shipped_on date;
BEGIN
  SELECT * INTO v_po FROM public.purchase_orders WHERE id = p_po_id FOR UPDATE;
  IF NOT FOUND OR NOT public.can_send_purchase_order(p_po_id) THEN
    RAISE EXCEPTION 'set_purchase_order_tracking: purchase order % not found or access denied', p_po_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF jsonb_typeof(v_req) <> 'object' THEN
    RAISE EXCEPTION 'set_purchase_order_tracking: request must be an object'
      USING ERRCODE = 'check_violation';
  END IF;
  IF (v_req - ARRAY['carrier', 'trackingNumber', 'bolDocumentPath', 'shippedOn']) <> '{}'::jsonb THEN
    RAISE EXCEPTION 'set_purchase_order_tracking: unknown keys %',
      (SELECT string_agg(key, ', ') FROM jsonb_object_keys(
         v_req - ARRAY['carrier', 'trackingNumber', 'bolDocumentPath', 'shippedOn']) AS key)
      USING ERRCODE = 'check_violation';
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_each(v_req) AS entry
    WHERE jsonb_typeof(entry.value) NOT IN ('string', 'null')
  ) THEN
    RAISE EXCEPTION 'set_purchase_order_tracking: every value must be a string or null'
      USING ERRCODE = 'check_violation';
  END IF;
  IF v_po.status = 'cancelled' THEN
    RAISE EXCEPTION 'set_purchase_order_tracking: purchase order % is cancelled', p_po_id
      USING ERRCODE = 'check_violation';
  END IF;

  IF v_req ? 'shippedOn' AND NULLIF(btrim(COALESCE(v_req->>'shippedOn', '')), '') IS NOT NULL THEN
    BEGIN
      v_shipped_on := (v_req->>'shippedOn')::date;
    EXCEPTION WHEN invalid_datetime_format OR datetime_field_overflow THEN
      RAISE EXCEPTION 'set_purchase_order_tracking: shippedOn must be a date (YYYY-MM-DD)'
        USING ERRCODE = 'check_violation';
    END;
    -- The studio's day may run one ahead of UTC (the 00665 bound).
    IF v_shipped_on > v_utc_day + 1 THEN
      RAISE EXCEPTION 'set_purchase_order_tracking: shippedOn % is in the future', v_shipped_on
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  PERFORM set_config('app.ffe_mutation_rpc', 'on', true);
  UPDATE public.purchase_orders SET
    carrier = CASE WHEN v_req ? 'carrier'
                   THEN NULLIF(btrim(COALESCE(v_req->>'carrier', '')), '') ELSE carrier END,
    tracking_number = CASE WHEN v_req ? 'trackingNumber'
                   THEN NULLIF(btrim(COALESCE(v_req->>'trackingNumber', '')), '') ELSE tracking_number END,
    bol_document_path = CASE WHEN v_req ? 'bolDocumentPath'
                   THEN NULLIF(btrim(COALESCE(v_req->>'bolDocumentPath', '')), '') ELSE bol_document_path END,
    shipped_on = CASE WHEN v_req ? 'shippedOn' THEN v_shipped_on ELSE shipped_on END
  WHERE id = p_po_id
  RETURNING * INTO v_po;
  RETURN v_po;
END;
$$;

COMMENT ON FUNCTION public.set_purchase_order_tracking(uuid, jsonb) IS
  'Records how a purchase order ships (00698, C-18): carrier, trackingNumber, bolDocumentPath, '
  'shippedOn. Patch semantics (absent = unchanged, null/blank = cleared, unknown key refused). '
  'Gate: can_send_purchase_order. Never moves status; refuses cancelled POs and a future shippedOn.';

REVOKE ALL ON FUNCTION public.set_purchase_order_tracking(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_purchase_order_tracking(uuid, jsonb) TO authenticated;

-- ─── 3. set_purchase_order_eta (00690 body + eta_history append) ───────────

CREATE OR REPLACE FUNCTION public.set_purchase_order_eta(
  p_po_id uuid, p_eta date, p_note text DEFAULT NULL, p_local_date date DEFAULT NULL
)
RETURNS public.purchase_orders
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $$
DECLARE
  v_po public.purchase_orders%ROWTYPE;
  v_note text := NULLIF(btrim(COALESCE(p_note, '')), '');
  v_utc_day date := (now() AT TIME ZONE 'UTC')::date;
  v_day date := COALESCE(p_local_date, v_utc_day);
BEGIN
  SELECT * INTO v_po FROM public.purchase_orders WHERE id = p_po_id FOR UPDATE;
  IF NOT FOUND OR NOT public.can_send_purchase_order(p_po_id) THEN
    RAISE EXCEPTION 'set_purchase_order_eta: purchase order % not found or access denied', p_po_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF v_day NOT BETWEEN v_utc_day - 1 AND v_utc_day + 1 THEN
    RAISE EXCEPTION 'set_purchase_order_eta: local date % is more than a day from today (UTC %)', v_day, v_utc_day
      USING ERRCODE = 'check_violation';
  END IF;
  IF p_eta IS NULL THEN
    RAISE EXCEPTION 'set_purchase_order_eta: an ETA date is required'
      USING ERRCODE = 'check_violation';
  END IF;
  IF v_po.status = 'cancelled' THEN
    RAISE EXCEPTION 'set_purchase_order_eta: purchase order % is cancelled', p_po_id
      USING ERRCODE = 'check_violation';
  END IF;

  PERFORM set_config('app.ffe_mutation_rpc', 'on', true);
  UPDATE public.purchase_orders SET
    confirmed_eta = p_eta,
    -- Same audit-line format the browser hook appended before 00690.
    notes = CASE
      WHEN v_note IS NULL THEN notes
      WHEN COALESCE(notes, '') = '' THEN format('[%s ETA update]: %s', v_day, v_note)
      ELSE notes || E'\n' || format('[%s ETA update]: %s', v_day, v_note)
    END,
    -- 00698: one history entry per change of date ("why it moved").
    eta_history = CASE
      WHEN confirmed_eta IS NOT DISTINCT FROM p_eta THEN eta_history
      ELSE eta_history || jsonb_build_array(jsonb_build_object(
        'eta', p_eta,
        'note', v_note,
        'at', now(),
        'by', (select auth.uid())
      ))
    END
  WHERE id = p_po_id
  RETURNING * INTO v_po;
  RETURN v_po;
END;
$$;

-- ─── 4. advance_purchase_order_status (00690 body + shipped_on stamp) ──────

CREATE OR REPLACE FUNCTION public.advance_purchase_order_status(
  p_po_id uuid, p_to text, p_note text DEFAULT NULL, p_local_date date DEFAULT NULL
)
RETURNS public.purchase_orders
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $$
DECLARE
  v_po public.purchase_orders%ROWTYPE;
  v_note text := NULLIF(btrim(COALESCE(p_note, '')), '');
  v_from_rank integer;
  v_to_rank integer;
  v_utc_day date := (now() AT TIME ZONE 'UTC')::date;
  v_day date := COALESCE(p_local_date, v_utc_day);
  v_undated_balances uuid[];
BEGIN
  SELECT * INTO v_po FROM public.purchase_orders WHERE id = p_po_id FOR UPDATE;
  IF NOT FOUND OR NOT public.can_send_purchase_order(p_po_id) THEN
    RAISE EXCEPTION 'advance_purchase_order_status: purchase order % not found or access denied', p_po_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF v_day NOT BETWEEN v_utc_day - 1 AND v_utc_day + 1 THEN
    RAISE EXCEPTION 'advance_purchase_order_status: local date % is more than a day from today (UTC %)', v_day, v_utc_day
      USING ERRCODE = 'check_violation';
  END IF;

  v_from_rank := CASE v_po.status
    WHEN 'confirmed' THEN 1 WHEN 'in_production' THEN 2 WHEN 'shipped' THEN 3 END;
  v_to_rank := CASE p_to
    WHEN 'in_production' THEN 2 WHEN 'shipped' THEN 3 END;

  -- Re-recording the current status is a no-op (a double tap must not error
  -- or duplicate the audit line).
  IF v_to_rank IS NOT NULL AND v_po.status = p_to THEN
    RETURN v_po;
  END IF;
  IF v_from_rank IS NULL OR v_to_rank IS NULL OR v_to_rank <= v_from_rank THEN
    RAISE EXCEPTION 'advance_purchase_order_status: % → % is not allowed; only confirmed → in_production → shipped (delivered is recorded by receiving)',
      v_po.status, COALESCE(p_to, 'null')
      USING ERRCODE = 'check_violation';
  END IF;

  -- The pending balances the 00184 cascade may flip to due (with the UTC
  -- CURRENT_DATE) on this status change.
  v_undated_balances := ARRAY(
    SELECT id FROM public.po_payments
     WHERE purchase_order_id = p_po_id
       AND kind = 'balance' AND state = 'pending' AND due_date IS NULL
  );

  PERFORM set_config('app.ffe_mutation_rpc', 'on', true);
  UPDATE public.purchase_orders SET
    status = p_to,
    notes = CASE
      WHEN v_note IS NULL THEN notes
      WHEN COALESCE(notes, '') = '' THEN format('[%s %s]: %s', v_day, p_to, v_note)
      ELSE notes || E'\n' || format('[%s %s]: %s', v_day, p_to, v_note)
    END,
    -- 00698: shipping stamps the studio's day unless a ship date was entered.
    shipped_on = CASE WHEN p_to = 'shipped' THEN COALESCE(shipped_on, v_day) ELSE shipped_on END
  WHERE id = p_po_id
  RETURNING * INTO v_po;

  -- Re-date only the balances that flip just made due: they fall due on the
  -- studio's day, not the UTC day.
  UPDATE public.po_payments
     SET due_date = v_day
   WHERE id = ANY (v_undated_balances)
     AND state = 'due'
     AND due_date IS DISTINCT FROM v_day;
  RETURN v_po;
END;
$$;
