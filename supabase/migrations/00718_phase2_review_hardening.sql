-- ═══════════════════════════════════════════════════════════════════════════
-- 00718 — Phase 2 review hardening (US-16 P2-19; SQ-447, the SQ-434 findings)
-- ═══════════════════════════════════════════════════════════════════════════
-- Each redefined function is its live head's body, verbatim, with only the
-- change named here. CREATE OR REPLACE keeps every existing ACL; the new
-- functions get explicit REVOKE/GRANTs.
--
-- R1  An acknowledgment moved an unreleased draft to confirmed, past the
--     release gate. log_po_acknowledgment_v2 (00705) and its v1 twin
--     log_po_acknowledgment (00451, still called by the Order cell) refuse a
--     draft that po_is_sendable's rule (_po_release_cleared, 00710) holds,
--     with the gate's own held_for_release refusal.
-- M1  void_vendor_payment (00695) refused nothing after refunds: voiding a
--     vendor payment may not leave the PO's vendor net paid below zero.
-- M2  vendor_payments.payee: vendor | carrier | receiver | other (default
--     vendor). record_vendor_payment (00716) takes payee for an unscheduled
--     payment (a rider owed to a carrier or receiver, C-26). Vendor money
--     checks count payee = 'vendor' only: the refund cap
--     (record_vendor_refund, 00708), the void floor (M1), and the
--     resolve_ack_line unit_price "payment recorded" block (00705), which
--     also ignores refund and credit rows (M2c).
--     Backfill: none. A rider payment carries no rider id, and its reference
--     is free text the member may edit, so no existing row can be told apart
--     from an unscheduled vendor payment. Existing rows stay 'vendor'.
-- S1  purchase_orders_studio_read (00447) and receiving_inspections_studio_rw
--     (00584) read can_send_purchase_order, as 00717 did for four others.
--     Owners keep their own policies (00148/00150); field links read through
--     SECURITY DEFINER functions; the client portal reads no purchase_orders.
--     delivery_events (security_invoker, 00704) inherits the scoping.
-- M4  add_invoice_billing_lines (00709): a deposit never exceeds what the
--     line's live deposit and balance slots leave of its client price (the
--     price itself on a fresh line, the price less the balance on a re-add);
--     a balance never exceeds the price less the live deposits.
-- M5  Accepting the ack's freight sets the latest unbilled freight line to
--     the vendor's total less the other freight lines, floored at 0.
-- R8-1 Accepting sku, finish or fabric on a client_signed or executed line
--     refuses change_order_required (Kody's ruling: a signed spec change is a
--     client-facing change).
-- S2  record_vendor_quote (00707): a linked request on a project needs
--     can_buy_for_project there; a request with no project links only to a
--     project of the requester's own studio.
-- S3  snapshot_purchase_order_spec (00711) refuses held and cancelled POs.
-- S4  advance_purchase_order_status → shipped (00698) composes the receiver's
--     inbound notice when the PO ships to a receiver and has no shipment row
--     (record_po_shipment inserts its row first, and its caller composes).
--     compose_receiver_inbound_draft's body moves into an internal composer
--     both share. The draft lands awaiting_review; nothing sends.
-- C1  request_substitution_approval (00708): the client copy follows the
--     line's open exception: a price change says the price changed, a
--     backorder says so; otherwise "no longer available as specified". No
--     date promises (R7).
-- D1  procurement_drafts gains status 'sending'. claim_procurement_draft_for_send
--     moves awaiting_review → sending as the caller, under the draft read
--     predicate, and records the claimer in sent_by;
--     release_procurement_draft_claim puts a failed send back;
--     mark_procurement_draft_sent accepts only a claimed draft, sent by its
--     claimer. Edit and discard already refuse anything but awaiting_review.
--     Deploy procurement-draft-send right after this migration: the old
--     function marks without claiming and would be refused.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── M2. vendor_payments.payee ──────────────────────────────────────────────

ALTER TABLE public.vendor_payments
  ADD COLUMN IF NOT EXISTS payee text NOT NULL DEFAULT 'vendor';

ALTER TABLE public.vendor_payments DROP CONSTRAINT IF EXISTS vendor_payments_payee_ck;
ALTER TABLE public.vendor_payments
  ADD CONSTRAINT vendor_payments_payee_ck CHECK (payee IN ('vendor', 'carrier', 'receiver', 'other'));

COMMENT ON COLUMN public.vendor_payments.payee IS
  'Who the money went to (00718): vendor (the PO''s vendor; every scheduled row, refund and credit), or '
  'carrier / receiver / other for a rider owed elsewhere (C-26). Vendor money checks count vendor only.';

-- ─── R1. log_po_acknowledgment (v1, 00451 body) ─────────────────────────────

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
  -- 00718 (R1): an acknowledgment confirms a draft, so a draft the release
  -- gate holds back takes none (po_is_sendable's rule).
  IF v_po.status = 'draft' AND NOT public._po_release_cleared(
       v_po.status, v_po.sent_at, public.purchase_order_studio_id(p_po_id), v_po.total_cents,
       v_po.released_at, v_po.released_total_cents) THEN
    RAISE EXCEPTION 'held_for_release: purchase order % waits for an owner or admin to release it', p_po_id
      USING ERRCODE = 'check_violation';
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

-- ─── R1. log_po_acknowledgment_v2 (00705 body) ──────────────────────────────

CREATE OR REPLACE FUNCTION public.log_po_acknowledgment_v2(
  p_po_id uuid,
  p_ack jsonb DEFAULT '{}'::jsonb,
  p_lines jsonb DEFAULT '[]'::jsonb
)
RETURNS public.po_acknowledgments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_uid        uuid := auth.uid();
  v_req        jsonb := COALESCE(p_ack, '{}'::jsonb);
  v_lines      jsonb := COALESCE(p_lines, '[]'::jsonb);
  v_ack_keys   constant text[] := ARRAY['receivedOn', 'receivedVia', 'vendorOrderRef', 'documentPath',
                                        'shipDate', 'freightCents', 'depositRequestedCents', 'confirmedEta'];
  v_line_keys  constant text[] := ARRAY['ffeItemId', 'field', 'ackValue', 'note'];
  v_utc_day    date := (now() AT TIME ZONE 'UTC')::date;
  v_po         public.purchase_orders%ROWTYPE;
  v_prev_id    uuid;
  v_ack        public.po_acknowledgments%ROWTYPE;
  v_key        text;
  v_entry      jsonb;
  v_received   date;
  v_via        text;
  v_ref        text;
  v_doc        text;
  v_ship       date;
  v_eta        date;
  v_freight    numeric;
  v_deposit    numeric;
  v_po_freight bigint;
  v_item_id    uuid;
  v_field      text;
  v_ack_value  text;
  v_po_value   text;
  v_note       text;
  v_item       record;
  v_verdict    text;
  v_mismatches integer;
  v_exception  uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'log_po_acknowledgment_v2: not authenticated' USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT * INTO v_po FROM public.purchase_orders WHERE id = p_po_id FOR UPDATE;
  IF NOT FOUND OR NOT public.can_send_purchase_order(p_po_id) THEN
    RAISE EXCEPTION 'log_po_acknowledgment_v2: purchase order % not found or access denied', p_po_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  -- v1's rules (00451).
  IF v_po.needs_repricing THEN
    RAISE EXCEPTION 'replacement purchase order must be repriced before acknowledgment'
      USING ERRCODE = 'check_violation';
  END IF;
  IF v_po.status NOT IN ('draft', 'confirmed', 'in_production', 'shipped', 'delivered') THEN
    RAISE EXCEPTION 'log_po_acknowledgment_v2: purchase order % is %, cancelled orders cannot be acknowledged',
      p_po_id, v_po.status USING ERRCODE = 'check_violation';
  END IF;
  -- 00718 (R1): an acknowledgment confirms a draft, so a draft the release
  -- gate holds back takes none (po_is_sendable's rule).
  IF v_po.status = 'draft' AND NOT public._po_release_cleared(
       v_po.status, v_po.sent_at, public.purchase_order_studio_id(p_po_id), v_po.total_cents,
       v_po.released_at, v_po.released_total_cents) THEN
    RAISE EXCEPTION 'held_for_release: purchase order % waits for an owner or admin to release it', p_po_id
      USING ERRCODE = 'check_violation';
  END IF;

  IF jsonb_typeof(v_req) <> 'object' THEN
    RAISE EXCEPTION 'log_po_acknowledgment_v2: the acknowledgment must be an object' USING ERRCODE = 'check_violation';
  END IF;
  IF (v_req - v_ack_keys) <> '{}'::jsonb THEN
    RAISE EXCEPTION 'log_po_acknowledgment_v2: unknown keys %',
      (SELECT string_agg(key, ', ') FROM jsonb_object_keys(v_req - v_ack_keys) AS key)
      USING ERRCODE = 'check_violation';
  END IF;
  FOR v_key IN SELECT key FROM jsonb_object_keys(v_req) AS key LOOP
    IF jsonb_typeof(v_req->v_key) <> 'null' AND jsonb_typeof(v_req->v_key) <> (CASE
         WHEN v_key IN ('freightCents', 'depositRequestedCents') THEN 'number' ELSE 'string' END) THEN
      RAISE EXCEPTION 'log_po_acknowledgment_v2: % has the wrong type', v_key USING ERRCODE = 'check_violation';
    END IF;
  END LOOP;
  IF jsonb_typeof(v_lines) <> 'array' OR jsonb_array_length(v_lines) > 200 THEN
    RAISE EXCEPTION 'log_po_acknowledgment_v2: lines must be an array of at most 200 entries'
      USING ERRCODE = 'check_violation';
  END IF;

  BEGIN
    v_received := COALESCE(NULLIF(btrim(COALESCE(v_req->>'receivedOn', '')), '')::date, v_utc_day);
    v_ship := NULLIF(btrim(COALESCE(v_req->>'shipDate', '')), '')::date;
    v_eta := NULLIF(btrim(COALESCE(v_req->>'confirmedEta', '')), '')::date;
  EXCEPTION WHEN invalid_datetime_format OR datetime_field_overflow THEN
    RAISE EXCEPTION 'log_po_acknowledgment_v2: receivedOn, shipDate and confirmedEta must be dates (YYYY-MM-DD)'
      USING ERRCODE = 'check_violation';
  END;
  IF v_received > v_utc_day + 1 THEN
    RAISE EXCEPTION 'log_po_acknowledgment_v2: receivedOn % is in the future', v_received
      USING ERRCODE = 'check_violation';
  END IF;
  v_via := COALESCE(NULLIF(btrim(COALESCE(v_req->>'receivedVia', '')), ''), 'email');
  IF v_via NOT IN ('email', 'portal', 'phone', 'pdf') THEN
    RAISE EXCEPTION 'log_po_acknowledgment_v2: receivedVia must be email, portal, phone or pdf'
      USING ERRCODE = 'check_violation';
  END IF;
  v_ref := NULLIF(btrim(COALESCE(v_req->>'vendorOrderRef', '')), '');
  v_doc := NULLIF(btrim(COALESCE(v_req->>'documentPath', '')), '');
  IF char_length(v_ref) > 100 OR char_length(v_doc) > 1024 THEN
    RAISE EXCEPTION 'log_po_acknowledgment_v2: vendorOrderRef is at most 100 characters, documentPath 1024'
      USING ERRCODE = 'check_violation';
  END IF;
  v_freight := (v_req->>'freightCents')::numeric;
  v_deposit := (v_req->>'depositRequestedCents')::numeric;
  IF (v_freight IS NOT NULL AND (v_freight < 0 OR v_freight <> trunc(v_freight) OR v_freight > 2147483647))
     OR (v_deposit IS NOT NULL AND (v_deposit < 0 OR v_deposit <> trunc(v_deposit) OR v_deposit > 2147483647)) THEN
    RAISE EXCEPTION 'log_po_acknowledgment_v2: freightCents and depositRequestedCents are whole, non-negative cents'
      USING ERRCODE = 'check_violation';
  END IF;

  -- The previous head of the chain, superseded by this ack.
  SELECT ack.id INTO v_prev_id
  FROM public.po_acknowledgments AS ack
  WHERE ack.purchase_order_id = p_po_id
    AND NOT EXISTS (SELECT 1 FROM public.po_acknowledgments AS newer WHERE newer.supersedes_ack_id = ack.id)
  ORDER BY ack.created_at DESC, ack.id DESC
  LIMIT 1;

  INSERT INTO public.po_acknowledgments (
    organization_id, purchase_order_id, received_on, received_via, vendor_order_ref, document_path,
    ack_ship_date, ack_freight_cents, ack_deposit_requested_cents, recorded_by, supersedes_ack_id
  ) VALUES (
    public.purchase_order_studio_id(p_po_id), p_po_id, v_received, v_via, v_ref, v_doc,
    v_ship, v_freight::integer, v_deposit::integer, v_uid, v_prev_id
  )
  RETURNING * INTO v_ack;

  -- Header lines. Nothing asked for means nothing to differ from.
  IF v_ship IS NOT NULL THEN
    INSERT INTO public.po_ack_lines (ack_id, field, po_value, ack_value, verdict)
    VALUES (v_ack.id, 'ship_date', v_po.requested_ship_on::text, v_ship::text,
            CASE WHEN v_po.requested_ship_on IS NULL OR v_po.requested_ship_on = v_ship
                 THEN 'match' ELSE 'mismatch' END);
  END IF;
  IF v_freight IS NOT NULL THEN
    SELECT sum(estimate_cents) INTO v_po_freight
    FROM public.po_cost_lines WHERE purchase_order_id = p_po_id AND kind = 'freight';
    INSERT INTO public.po_ack_lines (ack_id, field, po_value, ack_value, verdict)
    VALUES (v_ack.id, 'freight', v_po_freight::text, v_freight::bigint::text,
            CASE WHEN v_po_freight IS NULL OR v_po_freight = v_freight THEN 'match' ELSE 'mismatch' END);
  END IF;

  FOR v_entry IN SELECT value FROM jsonb_array_elements(v_lines) LOOP
    IF jsonb_typeof(v_entry) <> 'object' OR (v_entry - v_line_keys) <> '{}'::jsonb
       OR jsonb_typeof(COALESCE(v_entry->'ffeItemId', 'null')) NOT IN ('string', 'null')
       OR jsonb_typeof(COALESCE(v_entry->'field', 'null')) <> 'string'
       OR jsonb_typeof(COALESCE(v_entry->'ackValue', 'null')) NOT IN ('string', 'number')
       OR jsonb_typeof(COALESCE(v_entry->'note', 'null')) NOT IN ('string', 'null') THEN
      RAISE EXCEPTION 'log_po_acknowledgment_v2: each line is {ffeItemId, field, ackValue, note}'
        USING ERRCODE = 'check_violation';
    END IF;
    v_field := btrim(v_entry->>'field');
    IF v_field NOT IN ('unit_price', 'qty', 'sku', 'finish', 'fabric', 'dimensions', 'other') THEN
      RAISE EXCEPTION 'log_po_acknowledgment_v2: field must be unit_price, qty, sku, finish, fabric, dimensions or other (ship date and freight go on the acknowledgment)'
        USING ERRCODE = 'check_violation';
    END IF;
    v_ack_value := NULLIF(btrim(v_entry->>'ackValue'), '');
    v_note := NULLIF(btrim(COALESCE(v_entry->>'note', '')), '');
    IF v_ack_value IS NULL OR char_length(v_ack_value) > 500 OR char_length(v_note) > 1000 THEN
      RAISE EXCEPTION 'log_po_acknowledgment_v2: ackValue is required (at most 500 characters); note is at most 1000'
        USING ERRCODE = 'check_violation';
    END IF;
    IF v_field IN ('unit_price', 'qty') THEN
      IF v_ack_value !~ '^(0|[1-9][0-9]{0,9})$' OR v_ack_value::bigint > 2147483647
         OR (v_field = 'qty' AND v_ack_value::bigint = 0) THEN
        RAISE EXCEPTION 'log_po_acknowledgment_v2: % takes a whole number (cents for unit_price)', v_field
          USING ERRCODE = 'check_violation';
      END IF;
      v_ack_value := v_ack_value::bigint::text;
    END IF;

    BEGIN
      v_item_id := NULLIF(btrim(COALESCE(v_entry->>'ffeItemId', '')), '')::uuid;
    EXCEPTION WHEN invalid_text_representation THEN
      RAISE EXCEPTION 'log_po_acknowledgment_v2: ffeItemId must be an id' USING ERRCODE = 'check_violation';
    END;

    IF v_item_id IS NOT NULL THEN
      -- The values po-send prints: spec first, the product master as fallback.
      SELECT item.id, item.quantity,
             COALESCE(item.trade_price_cents, item.unit_price_cents) AS trade_cents,
             COALESCE(NULLIF(btrim(spec.sku), ''), NULLIF(btrim(product.sku), '')) AS sku,
             COALESCE(NULLIF(btrim(spec.finish), ''), NULLIF(btrim(product.finish), '')) AS finish,
             NULLIF(btrim(spec.color_fabric), '') AS fabric,
             spec.selected_dimensions::text AS dimensions
        INTO v_item
      FROM public.project_ffe_items AS item
      LEFT JOIN public.project_ffe_specs AS spec ON spec.ffe_item_id = item.id
      LEFT JOIN public.products AS product ON product.id = item.product_id
      WHERE item.id = v_item_id AND item.purchase_order_id = p_po_id;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'log_po_acknowledgment_v2: line % is not on purchase order %', v_item_id, p_po_id
          USING ERRCODE = 'check_violation';
      END IF;
      v_po_value := CASE v_field
        WHEN 'unit_price' THEN v_item.trade_cents::text
        WHEN 'qty' THEN v_item.quantity::text
        WHEN 'sku' THEN v_item.sku
        WHEN 'finish' THEN v_item.finish
        WHEN 'fabric' THEN v_item.fabric
        WHEN 'dimensions' THEN v_item.dimensions
        ELSE NULL
      END;
    ELSIF v_field <> 'other' THEN
      RAISE EXCEPTION 'log_po_acknowledgment_v2: % needs the ffeItemId of a line on the purchase order', v_field
        USING ERRCODE = 'check_violation';
    ELSE
      v_po_value := NULL;
    END IF;

    IF v_field <> 'other' AND EXISTS (
      SELECT 1 FROM public.po_ack_lines
      WHERE ack_id = v_ack.id AND field = v_field AND ffe_item_id IS NOT DISTINCT FROM v_item_id
    ) THEN
      RAISE EXCEPTION 'log_po_acknowledgment_v2: % is listed twice for the same line', v_field
        USING ERRCODE = 'check_violation';
    END IF;

    -- 'other' is the buyer flagging something: always a difference.
    v_verdict := CASE
      WHEN v_field = 'other' THEN 'mismatch'
      WHEN v_field IN ('unit_price', 'qty') THEN
        CASE WHEN v_po_value IS NOT NULL AND v_po_value::bigint = v_ack_value::bigint THEN 'match' ELSE 'mismatch' END
      WHEN public._po_ack_norm(v_po_value) IS NOT DISTINCT FROM public._po_ack_norm(v_ack_value) THEN 'match'
      ELSE 'mismatch'
    END;

    INSERT INTO public.po_ack_lines (ack_id, ffe_item_id, field, po_value, ack_value, verdict, note)
    VALUES (v_ack.id, v_item_id, v_field, v_po_value, v_ack_value, v_verdict, v_note);
  END LOOP;

  -- What the previous ack disputed and this one no longer does, the vendor
  -- corrected (the form pre-fills the PO, so an absent field agrees).
  IF v_prev_id IS NOT NULL THEN
    UPDATE public.po_ack_lines AS old SET
      verdict = 'vendor_corrected',
      resolved_by = v_uid,
      resolved_at = now(),
      note = COALESCE(old.note, format('Corrected on the acknowledgment received %s', v_received))
    WHERE old.ack_id = v_prev_id
      AND old.verdict IN ('mismatch', 'disputed')
      AND NOT EXISTS (
        SELECT 1 FROM public.po_ack_lines AS cur
        WHERE cur.ack_id = v_ack.id AND cur.verdict = 'mismatch'
          AND cur.field = old.field AND cur.ffe_item_id IS NOT DISTINCT FROM old.ffe_item_id
      );
  END IF;

  -- v1's stamps.
  PERFORM set_config('app.ffe_mutation_rpc', 'on', true);
  UPDATE public.purchase_orders SET
    acknowledged_at = COALESCE(acknowledged_at, now()),
    status = CASE WHEN status = 'draft' THEN 'confirmed' ELSE status END,
    vendor_po_number = COALESCE(v_ref, vendor_po_number)
  WHERE id = p_po_id
  RETURNING * INTO v_po;
  IF v_eta IS NOT NULL AND v_po.confirmed_eta IS DISTINCT FROM v_eta THEN
    PERFORM public.set_purchase_order_eta(p_po_id, v_eta, 'Vendor acknowledgment', NULL);
  END IF;

  SELECT count(*) INTO v_mismatches
  FROM public.po_ack_lines WHERE ack_id = v_ack.id AND verdict = 'mismatch';

  IF v_mismatches > 0 THEN
    SELECT id INTO v_exception
    FROM public.procurement_exceptions
    WHERE purchase_order_id = p_po_id AND type = 'ack_discrepancy' AND status <> 'resolved'
    FOR UPDATE;
    IF FOUND THEN
      UPDATE public.procurement_exceptions
      SET acknowledgment_id = v_ack.id, status = 'open'
      WHERE id = v_exception;
    ELSE
      -- d2 §M7: the studio default, 2 business days to answer the vendor.
      INSERT INTO public.procurement_exceptions (
        organization_id, project_id, type, purchase_order_id, acknowledgment_id, status, opened_by,
        clock_due_on, clock_basis
      ) VALUES (
        v_ack.organization_id, v_po.project_id, 'ack_discrepancy', p_po_id, v_ack.id, 'open', v_uid,
        v_received + CASE extract(isodow FROM v_received)::integer
                       WHEN 4 THEN 4 WHEN 5 THEN 4 WHEN 6 THEN 3 ELSE 2 END,
        'Answer the vendor within 2 business days of the acknowledgment, before production starts.'
      );
    END IF;
    PERFORM public.compose_ack_discrepancy_draft(v_ack.id);
  ELSE
    UPDATE public.procurement_exceptions SET
      status = 'resolved', resolved_at = now(), resolved_by = v_uid,
      resolution_path = 'vendor_corrected', acknowledgment_id = v_ack.id
    WHERE purchase_order_id = p_po_id AND type = 'ack_discrepancy' AND status <> 'resolved';
  END IF;

  RETURN v_ack;
END;
$$;

COMMENT ON FUNCTION public.log_po_acknowledgment_v2(uuid, jsonb, jsonb) IS
  'Records a vendor acknowledgment and checks it line by line against the PO (00705, C-27, d2 §M3). '
  'PO values and verdicts are computed server-side. Any mismatch opens the PO''s ack_discrepancy '
  'exception and composes a reply draft (awaiting_review); a clean ack resolves it. Stamps as v1 '
  '(log_po_acknowledgment). A draft the release gate holds back is refused held_for_release (00718). '
  'Gate: can_send_purchase_order.';

-- ─── M2 / M5 / R8-1. resolve_ack_line (00705 body) ──────────────────────────

CREATE OR REPLACE FUNCTION public.resolve_ack_line(
  p_line_id uuid,
  p_verdict text,
  p_note text DEFAULT NULL
)
RETURNS public.po_ack_lines
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_uid       uuid := auth.uid();
  v_line      public.po_ack_lines%ROWTYPE;
  v_ack       public.po_acknowledgments%ROWTYPE;
  v_po        public.purchase_orders%ROWTYPE;
  v_item      public.project_ffe_items%ROWTYPE;
  v_verdict   text := btrim(COALESCE(p_verdict, ''));
  v_note      text := NULLIF(btrim(COALESCE(p_note, '')), '');
  v_state     text;
  v_cents     integer;
  v_unit      integer;
  v_freight   uuid;
  v_other     bigint;
  v_estimate  bigint;
  v_open      integer;
  v_disputed  integer;
  v_path      text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'resolve_ack_line: not authenticated' USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT * INTO v_line FROM public.po_ack_lines WHERE id = p_line_id FOR UPDATE;
  IF FOUND THEN
    SELECT * INTO v_ack FROM public.po_acknowledgments WHERE id = v_line.ack_id;
    SELECT * INTO v_po FROM public.purchase_orders WHERE id = v_ack.purchase_order_id FOR UPDATE;
  END IF;
  IF v_po.id IS NULL OR NOT public.can_send_purchase_order(v_po.id) THEN
    RAISE EXCEPTION 'resolve_ack_line: acknowledgment line % not found or access denied', p_line_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF v_verdict NOT IN ('accepted', 'disputed', 'vendor_corrected') THEN
    RAISE EXCEPTION 'resolve_ack_line: verdict must be accepted, disputed or vendor_corrected'
      USING ERRCODE = 'check_violation';
  END IF;
  IF char_length(v_note) > 1000 THEN
    RAISE EXCEPTION 'resolve_ack_line: note is longer than 1000 characters' USING ERRCODE = 'check_violation';
  END IF;
  IF v_po.status = 'cancelled' THEN
    RAISE EXCEPTION 'resolve_ack_line: purchase order % is cancelled', v_po.id USING ERRCODE = 'check_violation';
  END IF;
  IF EXISTS (SELECT 1 FROM public.po_acknowledgments WHERE supersedes_ack_id = v_ack.id) THEN
    RAISE EXCEPTION 'resolve_ack_line: a newer acknowledgment supersedes this one; resolve its lines'
      USING ERRCODE = 'check_violation';
  END IF;
  IF v_line.verdict NOT IN ('mismatch', 'disputed') OR v_line.verdict = v_verdict THEN
    RAISE EXCEPTION 'resolve_ack_line: line % is already %', p_line_id, v_line.verdict
      USING ERRCODE = 'check_violation';
  END IF;

  IF v_verdict = 'accepted' THEN
    IF v_line.field IN ('unit_price', 'qty', 'sku', 'finish', 'fabric') THEN
      SELECT * INTO v_item FROM public.project_ffe_items
      WHERE id = v_line.ffe_item_id AND purchase_order_id = v_po.id FOR UPDATE;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'resolve_ack_line: the line is no longer on purchase order %', v_po.id
          USING ERRCODE = 'check_violation';
      END IF;
    END IF;

    IF v_line.field = 'qty' THEN
      RAISE EXCEPTION 'change_order_required: a quantity change goes through a purchase order change order'
        USING ERRCODE = 'check_violation';
    ELSIF v_line.field = 'unit_price' THEN
      -- R8: editable until it is on a sent authorization.
      v_state := public.ffe_line_authorization_state(v_item.id);
      IF v_state IS NOT NULL THEN
        RAISE EXCEPTION 'change_order_required: the line sits on a % authorization; %', v_state,
          CASE WHEN v_state = 'sent' THEN 'void the authorization to edit it'
               ELSE 'a price change is a change order the client re-approves' END
          USING ERRCODE = 'check_violation';
      END IF;
      IF v_po.is_patina_catalog THEN
        RAISE EXCEPTION 'resolve_ack_line: purchase order % is on the Patina catalog lane; its price follows Stripe', v_po.id
          USING ERRCODE = 'check_violation';
      END IF;
      -- 00718 (M2): a payment to the vendor; a rider paid to a carrier or a
      -- receiver, and a refund or credit, are not.
      IF EXISTS (SELECT 1 FROM public.vendor_payments
                 WHERE purchase_order_id = v_po.id AND voided_at IS NULL
                   AND kind = 'payment' AND payee = 'vendor') THEN
        RAISE EXCEPTION 'change_order_required: a payment is already recorded on purchase order %; a price change goes through a change order', v_po.id
          USING ERRCODE = 'check_violation';
      END IF;
      v_cents := v_line.ack_value::integer;
      v_unit := COALESCE(v_item.unit_price_cents, 0);
      PERFORM set_config('app.ffe_mutation_rpc', 'on', true);
      UPDATE public.project_ffe_items SET
        trade_price_cents = v_cents,
        -- 00692's markup formula.
        markup_percent = CASE WHEN v_cents > 0 AND v_unit > v_cents
          THEN LEAST(round(((v_unit::numeric / v_cents::numeric) - 1) * 100, 2), 999.99) ELSE 0 END,
        updated_at = now()
      WHERE id = v_item.id;
      -- The PO total is the line-derived trade total po-send checks.
      UPDATE public.purchase_orders SET total_cents = (
        SELECT COALESCE(sum(COALESCE(i.trade_price_cents, i.unit_price_cents, 0)::bigint * COALESCE(i.quantity, 1)), 0)
        FROM public.project_ffe_items AS i WHERE i.purchase_order_id = v_po.id
      )::integer
      WHERE id = v_po.id;
    ELSIF v_line.field IN ('sku', 'finish', 'fabric') THEN
      -- 00718 (R8-1): a signed spec is client-facing; changing it is a
      -- change order the client re-approves.
      v_state := public.ffe_line_authorization_state(v_item.id);
      IF v_state IN ('client_signed', 'executed') THEN
        RAISE EXCEPTION 'change_order_required: the line sits on a % authorization; a spec change is a change order the client re-approves', v_state
          USING ERRCODE = 'check_violation';
      END IF;
      -- A locked configuration refuses here (guard_project_configuration_snapshot).
      UPDATE public.project_ffe_specs SET
        sku = CASE WHEN v_line.field = 'sku' THEN v_line.ack_value ELSE sku END,
        finish = CASE WHEN v_line.field = 'finish' THEN v_line.ack_value ELSE finish END,
        color_fabric = CASE WHEN v_line.field = 'fabric' THEN v_line.ack_value ELSE color_fabric END,
        updated_by = v_uid,
        updated_at = now()
      WHERE ffe_item_id = v_item.id;
      IF NOT FOUND THEN
        INSERT INTO public.project_ffe_specs (ffe_item_id, sku, finish, color_fabric, updated_by)
        VALUES (v_item.id,
                CASE WHEN v_line.field = 'sku' THEN v_line.ack_value END,
                CASE WHEN v_line.field = 'finish' THEN v_line.ack_value END,
                CASE WHEN v_line.field = 'fabric' THEN v_line.ack_value END,
                v_uid);
      END IF;
    ELSIF v_line.field = 'freight' THEN
      SELECT id INTO v_freight FROM public.po_cost_lines
      WHERE purchase_order_id = v_po.id AND kind = 'freight' AND invoice_line_id IS NULL
      ORDER BY created_at DESC, id DESC
      LIMIT 1;
      -- 00718 (M5): the vendor's figure is the PO's freight total, which the
      -- comparison sums over every freight line; this line carries the rest.
      SELECT COALESCE(sum(estimate_cents), 0) INTO v_other
      FROM public.po_cost_lines
      WHERE purchase_order_id = v_po.id AND kind = 'freight' AND id IS DISTINCT FROM v_freight;
      v_estimate := GREATEST(v_line.ack_value::bigint - v_other, 0);
      IF v_freight IS NOT NULL OR v_estimate > 0 THEN
        PERFORM public.upsert_po_cost_line(v_po.id, CASE
          WHEN v_freight IS NULL THEN jsonb_build_object(
            'kind', 'freight', 'estimateCents', v_estimate,
            'payeeVendorId', v_po.vendor_id::text, 'note', 'From the vendor acknowledgment')
          ELSE jsonb_build_object('id', v_freight::text, 'estimateCents', v_estimate)
        END);
      END IF;
    END IF;
    -- ship_date, dimensions, other: the acknowledgment is the record.
  END IF;

  UPDATE public.po_ack_lines SET
    verdict = v_verdict,
    resolved_by = v_uid,
    resolved_at = now(),
    note = COALESCE(v_note, note)
  WHERE id = p_line_id
  RETURNING * INTO v_line;

  -- The PO's ack_discrepancy exception follows the latest ack's open lines.
  SELECT count(*) FILTER (WHERE verdict = 'mismatch'),
         count(*) FILTER (WHERE verdict = 'disputed'),
         CASE WHEN bool_and(verdict IN ('match', 'accepted')) THEN 'accept'
              WHEN bool_and(verdict IN ('match', 'vendor_corrected')) THEN 'vendor_corrected'
              ELSE 'reconciled' END
    INTO v_open, v_disputed, v_path
  FROM public.po_ack_lines WHERE ack_id = v_ack.id;

  UPDATE public.procurement_exceptions SET
    status = CASE WHEN v_open + v_disputed = 0 THEN 'resolved'
                  WHEN v_open = 0 THEN 'awaiting_vendor' ELSE 'open' END,
    resolved_at = CASE WHEN v_open + v_disputed = 0 THEN now() END,
    resolved_by = CASE WHEN v_open + v_disputed = 0 THEN v_uid END,
    resolution_path = CASE WHEN v_open + v_disputed = 0 THEN v_path END
  WHERE purchase_order_id = v_po.id AND type = 'ack_discrepancy' AND status <> 'resolved';

  RETURN v_line;
END;
$$;

COMMENT ON FUNCTION public.resolve_ack_line(uuid, text, text) IS
  'Resolves an open line of the latest acknowledgment (00705, C-27): accepted writes the vendor''s '
  'value through (trade price + PO total, spec sku/finish/fabric, the freight remainder on the latest '
  'unbilled freight line); qty, any price change on an authorized line or a PO with a vendor payment, '
  'and a spec change on a client_signed or executed line refuse with change_order_required (R8, 00718). '
  'disputed leaves the exception awaiting_vendor; no open line left resolves it. Gate: can_send_purchase_order.';

-- ─── M2. record_vendor_payment (00716 body) ─────────────────────────────────

CREATE OR REPLACE FUNCTION public.record_vendor_payment(p_po_id uuid, p_request jsonb)
RETURNS public.vendor_payments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_uid       uuid := auth.uid();
  v_req       jsonb := COALESCE(p_request, '{}'::jsonb);
  v_allowed   text[] := ARRAY['poPaymentId', 'amountCents', 'paidOn', 'method', 'paymentMethodId',
                              'reference', 'receiptDocumentPath', 'currencyCode', 'payee'];
  v_utc_day   date := (now() AT TIME ZONE 'UTC')::date;
  v_po        public.purchase_orders%ROWTYPE;
  v_studio    uuid;
  v_sched     public.po_payments%ROWTYPE;
  v_sched_id  uuid;
  v_amount    numeric;
  v_paid      bigint;
  v_paid_on   date;
  v_pm        public.studio_payment_methods%ROWTYPE;
  v_pm_id     uuid;
  v_method    text;
  v_payee     text;
  v_row       public.vendor_payments%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'record_vendor_payment: not authenticated'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF jsonb_typeof(v_req) <> 'object' THEN
    RAISE EXCEPTION 'record_vendor_payment: request must be a JSON object'
      USING ERRCODE = 'check_violation';
  END IF;
  IF (v_req - v_allowed) <> '{}'::jsonb THEN
    RAISE EXCEPTION 'record_vendor_payment: unknown keys %',
      (SELECT string_agg(k, ', ') FROM jsonb_object_keys(v_req - v_allowed) k)
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO v_po FROM public.purchase_orders WHERE id = p_po_id FOR UPDATE;
  IF NOT FOUND OR NOT public.can_send_purchase_order(p_po_id) THEN
    RAISE EXCEPTION 'record_vendor_payment: purchase order % not found or access denied', p_po_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Lane guard, PO level.
  IF v_po.is_patina_catalog THEN
    RAISE EXCEPTION 'record_vendor_payment: purchase order % is on the Patina catalog lane; it settles through Stripe only', p_po_id
      USING ERRCODE = 'check_violation';
  END IF;

  v_sched_id := NULLIF(v_req->>'poPaymentId', '')::uuid;
  IF v_sched_id IS NOT NULL THEN
    SELECT * INTO v_sched FROM public.po_payments
     WHERE id = v_sched_id AND purchase_order_id = p_po_id
       FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'record_vendor_payment: payment row % is not on purchase order %', v_sched_id, p_po_id
        USING ERRCODE = 'check_violation';
    END IF;
    -- Lane guard, row level.
    IF v_sched.stripe_checkout_session_id IS NOT NULL OR v_sched.stripe_payment_intent_id IS NOT NULL THEN
      RAISE EXCEPTION 'record_vendor_payment: payment row % is on the Stripe rail; it settles through Stripe only', v_sched_id
        USING ERRCODE = 'check_violation';
    END IF;
    -- 00716: a refunded row takes no further payment.
    IF v_sched.state = 'refunded' THEN
      RAISE EXCEPTION 'record_vendor_payment: payment row % is already refunded', v_sched_id
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  -- 00718 (M2): who the money went to. A scheduled row is the vendor's.
  IF jsonb_typeof(COALESCE(v_req->'payee', 'null'::jsonb)) NOT IN ('string', 'null') THEN
    RAISE EXCEPTION 'record_vendor_payment: payee must be vendor, carrier, receiver or other'
      USING ERRCODE = 'check_violation';
  END IF;
  v_payee := COALESCE(NULLIF(btrim(COALESCE(v_req->>'payee', '')), ''), 'vendor');
  IF v_payee NOT IN ('vendor', 'carrier', 'receiver', 'other') THEN
    RAISE EXCEPTION 'record_vendor_payment: payee must be vendor, carrier, receiver or other'
      USING ERRCODE = 'check_violation';
  END IF;
  IF v_payee <> 'vendor' AND v_sched_id IS NOT NULL THEN
    RAISE EXCEPTION 'record_vendor_payment: a scheduled payment row is paid to the vendor, not the %', v_payee
      USING ERRCODE = 'check_violation';
  END IF;

  IF v_req ? 'amountCents' THEN
    IF jsonb_typeof(v_req->'amountCents') <> 'number' THEN
      RAISE EXCEPTION 'record_vendor_payment: amountCents must be a number of cents'
        USING ERRCODE = 'check_violation';
    END IF;
    v_amount := (v_req->>'amountCents')::numeric;
    IF v_amount <= 0 OR v_amount <> trunc(v_amount) OR v_amount > 2147483647 THEN
      RAISE EXCEPTION 'record_vendor_payment: amountCents must be a positive whole number of cents'
        USING ERRCODE = 'check_violation';
    END IF;
  ELSIF v_sched_id IS NOT NULL THEN
    SELECT COALESCE(sum(amount_cents), 0) INTO v_paid
      FROM public.vendor_payments
     WHERE po_payment_id = v_sched_id AND voided_at IS NULL;
    v_amount := v_sched.amount_cents - v_paid;
    IF v_amount <= 0 THEN
      RAISE EXCEPTION 'record_vendor_payment: payment row % is already paid in full; pass amountCents to record more', v_sched_id
        USING ERRCODE = 'check_violation';
    END IF;
  ELSE
    RAISE EXCEPTION 'record_vendor_payment: amountCents is required for a payment not tied to a scheduled row'
      USING ERRCODE = 'check_violation';
  END IF;

  v_paid_on := COALESCE(NULLIF(v_req->>'paidOn', '')::date, v_utc_day);
  IF v_paid_on > v_utc_day + 1 THEN
    RAISE EXCEPTION 'record_vendor_payment: paidOn % is in the future', v_paid_on
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT studio_id INTO v_studio FROM public.projects WHERE id = v_po.project_id;

  v_pm_id := NULLIF(v_req->>'paymentMethodId', '')::uuid;
  IF v_pm_id IS NOT NULL THEN
    SELECT * INTO v_pm FROM public.studio_payment_methods WHERE id = v_pm_id;
    IF NOT FOUND OR NOT public.is_active_org_member(v_pm.organization_id) THEN
      RAISE EXCEPTION 'record_vendor_payment: payment method % not found or access denied', v_pm_id
        USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF v_pm.archived_at IS NOT NULL THEN
      RAISE EXCEPTION 'record_vendor_payment: payment method % is archived', v_pm_id
        USING ERRCODE = 'check_violation';
    END IF;
    IF v_studio IS NOT NULL AND v_pm.organization_id <> v_studio THEN
      RAISE EXCEPTION 'record_vendor_payment: payment method % belongs to another studio', v_pm_id
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  v_method := COALESCE(NULLIF(btrim(v_req->>'method'), ''), v_pm.kind, 'other');
  IF v_method NOT IN ('card', 'ach', 'check', 'wire', 'cash', 'other') THEN
    RAISE EXCEPTION 'record_vendor_payment: method must be one of card, ach, check, wire, cash, other'
      USING ERRCODE = 'check_violation';
  END IF;

  INSERT INTO public.vendor_payments (
    organization_id, purchase_order_id, po_payment_id, paid_on, amount_cents,
    currency_code, method, payment_method_id, reference, receipt_document_path, recorded_by, payee
  )
  VALUES (
    COALESCE(v_studio, v_pm.organization_id), p_po_id, v_sched_id, v_paid_on, v_amount::integer,
    upper(COALESCE(NULLIF(btrim(v_req->>'currencyCode'), ''), 'USD')), v_method, v_pm_id,
    NULLIF(btrim(v_req->>'reference'), ''), NULLIF(btrim(v_req->>'receiptDocumentPath'), ''), v_uid, v_payee
  )
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

-- ─── M1. void_vendor_payment (00695 body) ───────────────────────────────────

CREATE OR REPLACE FUNCTION public.void_vendor_payment(p_payment_id uuid, p_reason text)
RETURNS public.vendor_payments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_uid    uuid := auth.uid();
  v_reason text := NULLIF(btrim(COALESCE(p_reason, '')), '');
  v_po_id  uuid;
  v_row    public.vendor_payments%ROWTYPE;
  v_net    bigint;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'void_vendor_payment: not authenticated'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT purchase_order_id INTO v_po_id FROM public.vendor_payments WHERE id = p_payment_id;
  IF NOT FOUND OR NOT public.can_send_purchase_order(v_po_id) THEN
    RAISE EXCEPTION 'void_vendor_payment: payment % not found or access denied', p_payment_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF v_reason IS NULL THEN
    RAISE EXCEPTION 'void_vendor_payment: a reason is required'
      USING ERRCODE = 'check_violation';
  END IF;
  IF length(v_reason) > 500 THEN
    RAISE EXCEPTION 'void_vendor_payment: the reason is longer than 500 characters'
      USING ERRCODE = 'check_violation';
  END IF;

  -- Same lock order as record_vendor_payment: the PO, then the ledger row.
  PERFORM 1 FROM public.purchase_orders WHERE id = v_po_id FOR UPDATE;
  SELECT * INTO v_row FROM public.vendor_payments WHERE id = p_payment_id FOR UPDATE;
  IF v_row.voided_at IS NOT NULL THEN
    RAISE EXCEPTION 'void_vendor_payment: payment % is already void', p_payment_id
      USING ERRCODE = 'check_violation';
  END IF;

  -- 00718 (M1): never more back from the vendor than went out. Net paid is the
  -- vendor's non-void payments less refunds and credits, without this row.
  IF v_row.payee = 'vendor' AND v_row.amount_cents > 0 THEN
    SELECT COALESCE(sum(amount_cents), 0) INTO v_net
      FROM public.vendor_payments
     WHERE purchase_order_id = v_po_id AND voided_at IS NULL AND payee = 'vendor' AND id <> p_payment_id;
    IF v_net < 0 THEN
      RAISE EXCEPTION 'void_vendor_payment: voiding payment % would leave % cents net paid on purchase order %; void the refund or credit first',
        p_payment_id, v_net, v_po_id USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  UPDATE public.vendor_payments
     SET voided_at = now(), void_reason = v_reason, voided_by = v_uid
   WHERE id = p_payment_id
  RETURNING * INTO v_row;
  RETURN v_row;
END;
$$;

-- ─── M2. record_vendor_refund (00708 body) ──────────────────────────────────

CREATE OR REPLACE FUNCTION public.record_vendor_refund(p_po_id uuid, p_request jsonb)
RETURNS public.vendor_payments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_uid      uuid := auth.uid();
  v_req      jsonb := COALESCE(p_request, '{}'::jsonb);
  v_allowed  constant text[] := ARRAY['kind', 'amountCents', 'paidOn', 'method', 'paymentMethodId',
                                      'reference', 'receiptDocumentPath', 'currencyCode'];
  v_utc_day  date := (now() AT TIME ZONE 'UTC')::date;
  v_po       public.purchase_orders%ROWTYPE;
  v_studio   uuid;
  v_kind     text := NULLIF(btrim(COALESCE(v_req->>'kind', '')), '');
  v_amount   numeric;
  v_net_paid bigint;
  v_on       date;
  v_pm       public.studio_payment_methods%ROWTYPE;
  v_pm_id    uuid;
  v_method   text;
  v_row      public.vendor_payments%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'record_vendor_refund: not authenticated' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF jsonb_typeof(v_req) <> 'object' THEN
    RAISE EXCEPTION 'record_vendor_refund: request must be a JSON object' USING ERRCODE = 'check_violation';
  END IF;
  IF (v_req - v_allowed) <> '{}'::jsonb THEN
    RAISE EXCEPTION 'record_vendor_refund: unknown keys %',
      (SELECT string_agg(k, ', ') FROM jsonb_object_keys(v_req - v_allowed) k)
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO v_po FROM public.purchase_orders WHERE id = p_po_id FOR UPDATE;
  IF NOT FOUND OR NOT public.can_send_purchase_order(p_po_id) THEN
    RAISE EXCEPTION 'record_vendor_refund: purchase order % not found or access denied', p_po_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  -- record_vendor_payment's lane guard.
  IF v_po.is_patina_catalog THEN
    RAISE EXCEPTION 'record_vendor_refund: purchase order % is on the Patina catalog lane; it settles through Stripe only', p_po_id
      USING ERRCODE = 'check_violation';
  END IF;
  IF v_kind IS NULL OR v_kind NOT IN ('refund', 'credit') THEN
    RAISE EXCEPTION 'record_vendor_refund: kind must be refund or credit' USING ERRCODE = 'check_violation';
  END IF;
  IF jsonb_typeof(v_req->'amountCents') IS DISTINCT FROM 'number' THEN
    RAISE EXCEPTION 'record_vendor_refund: amountCents is required, a number of cents' USING ERRCODE = 'check_violation';
  END IF;
  v_amount := (v_req->>'amountCents')::numeric;
  IF v_amount <= 0 OR v_amount <> trunc(v_amount) OR v_amount > 2147483647 THEN
    RAISE EXCEPTION 'record_vendor_refund: amountCents is a positive whole number of cents (it is stored negative)'
      USING ERRCODE = 'check_violation';
  END IF;
  -- Never more back than went out — to the vendor (00718: a rider paid to a
  -- carrier or a receiver is not the vendor's money).
  SELECT COALESCE(sum(amount_cents), 0) INTO v_net_paid
  FROM public.vendor_payments WHERE purchase_order_id = p_po_id AND voided_at IS NULL AND payee = 'vendor';
  IF v_amount > v_net_paid THEN
    RAISE EXCEPTION 'record_vendor_refund: % cents is more than the % cents net paid on purchase order %',
      v_amount, v_net_paid, p_po_id USING ERRCODE = 'check_violation';
  END IF;

  BEGIN
    v_on := COALESCE(NULLIF(btrim(COALESCE(v_req->>'paidOn', '')), '')::date, v_utc_day);
  EXCEPTION WHEN invalid_datetime_format OR datetime_field_overflow THEN
    RAISE EXCEPTION 'record_vendor_refund: paidOn must be a date (YYYY-MM-DD)' USING ERRCODE = 'check_violation';
  END;
  IF v_on > v_utc_day + 1 THEN
    RAISE EXCEPTION 'record_vendor_refund: paidOn % is in the future', v_on USING ERRCODE = 'check_violation';
  END IF;

  SELECT studio_id INTO v_studio FROM public.projects WHERE id = v_po.project_id;
  BEGIN
    v_pm_id := NULLIF(btrim(COALESCE(v_req->>'paymentMethodId', '')), '')::uuid;
  EXCEPTION WHEN invalid_text_representation THEN
    RAISE EXCEPTION 'record_vendor_refund: paymentMethodId must be an id' USING ERRCODE = 'check_violation';
  END;
  IF v_pm_id IS NOT NULL THEN
    SELECT * INTO v_pm FROM public.studio_payment_methods WHERE id = v_pm_id;
    IF NOT FOUND OR NOT public.is_active_org_member(v_pm.organization_id) THEN
      RAISE EXCEPTION 'record_vendor_refund: payment method % not found or access denied', v_pm_id
        USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF v_pm.archived_at IS NOT NULL THEN
      RAISE EXCEPTION 'record_vendor_refund: payment method % is archived', v_pm_id
        USING ERRCODE = 'check_violation';
    END IF;
    IF v_studio IS NOT NULL AND v_pm.organization_id <> v_studio THEN
      RAISE EXCEPTION 'record_vendor_refund: payment method % belongs to another studio', v_pm_id
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  v_method := COALESCE(NULLIF(btrim(v_req->>'method'), ''), v_pm.kind, 'other');
  IF v_method NOT IN ('card', 'ach', 'check', 'wire', 'cash', 'other') THEN
    RAISE EXCEPTION 'record_vendor_refund: method must be one of card, ach, check, wire, cash, other'
      USING ERRCODE = 'check_violation';
  END IF;

  INSERT INTO public.vendor_payments (
    organization_id, purchase_order_id, po_payment_id, kind, paid_on, amount_cents,
    currency_code, method, payment_method_id, reference, receipt_document_path, recorded_by
  ) VALUES (
    COALESCE(v_studio, v_pm.organization_id, public.purchase_order_studio_id(p_po_id)), p_po_id, NULL, v_kind, v_on,
    -(v_amount::integer),
    upper(COALESCE(NULLIF(btrim(v_req->>'currencyCode'), ''), 'USD')), v_method, v_pm_id,
    NULLIF(btrim(v_req->>'reference'), ''), NULLIF(btrim(v_req->>'receiptDocumentPath'), ''), v_uid
  )
  RETURNING * INTO v_row;
  RETURN v_row;
END;
$$;

COMMENT ON FUNCTION public.record_vendor_refund(uuid, jsonb) IS
  'Records a vendor refund or credit as a negative vendor_payments row (00708, C-30, d2 §M7 step 4): '
  'amountCents entered positive, at most the PO''s net paid to the vendor (payee vendor, 00718); never '
  'on a schedule row; Patina catalog lane refused. Void with void_vendor_payment. Gate: '
  'can_send_purchase_order.';

-- ─── S1. purchase_orders and receiving_inspections reads ────────────────────

DROP POLICY IF EXISTS purchase_orders_studio_read ON public.purchase_orders;
CREATE POLICY purchase_orders_studio_read ON public.purchase_orders
  FOR SELECT TO authenticated
  USING (public.can_send_purchase_order(id));

COMMENT ON POLICY purchase_orders_studio_read ON public.purchase_orders IS
  'A member of the PO''s project studio (can_send_purchase_order: owner, or an active non-guest member '
  'of projects.studio_id, else a co-member of the owner) reads the PO (00718, replacing 00447''s owner '
  'co-membership test). delivery_events (security_invoker) follows.';

DROP POLICY IF EXISTS receiving_inspections_studio_rw ON public.receiving_inspections;
CREATE POLICY receiving_inspections_studio_rw ON public.receiving_inspections
  FOR ALL TO authenticated
  USING (public.can_send_purchase_order(purchase_order_id))
  WITH CHECK (public.can_send_purchase_order(purchase_order_id));

-- ─── M4. add_invoice_billing_lines (00709 body) ─────────────────────────────

CREATE OR REPLACE FUNCTION public.add_invoice_billing_lines(p_invoice_id uuid, p_lines jsonb)
RETURNS SETOF public.invoice_line_items
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_uid       uuid := auth.uid();
  v_keys      constant text[] := ARRAY['purchaseId', 'costLineId', 'ffeItemId', 'stage', 'depositPct',
                                       'amountCents', 'description', 'sortOrder'];
  v_invoice   public.invoices%ROWTYPE;
  v_purchase  public.studio_purchases%ROWTYPE;
  v_rider     public.po_cost_lines%ROWTYPE;
  v_item      public.project_ffe_items%ROWTYPE;
  v_line      public.invoice_line_items%ROWTYPE;
  v_el        jsonb;
  v_ids       uuid[] := '{}';
  v_subject   uuid;
  v_override  bigint;
  v_cost      bigint;
  v_amount    bigint;
  v_price     bigint;
  v_deposited bigint;
  v_staged    bigint;
  v_pct       numeric;
  v_stage     text;
  v_desc      text;
  v_sort      integer;
  v_next_sort integer;
  v_po_project uuid;
  v_subtotal  bigint;
  v_tax       bigint;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'add_invoice_billing_lines: not authenticated' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO v_invoice FROM public.invoices WHERE id = p_invoice_id FOR UPDATE;
  IF NOT FOUND OR NOT public._can_manage_invoice_owner(v_invoice.designer_id) THEN
    RAISE EXCEPTION 'add_invoice_billing_lines: invoice % not found or access denied', p_invoice_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF v_invoice.status <> 'draft' THEN
    RAISE EXCEPTION 'add_invoice_billing_lines: invoice % is %, not a draft', p_invoice_id, v_invoice.status
      USING ERRCODE = 'check_violation';
  END IF;
  IF v_invoice.project_id IS NULL THEN
    RAISE EXCEPTION 'add_invoice_billing_lines: a studio invoice has no project to bill from'
      USING ERRCODE = 'check_violation';
  END IF;
  IF p_lines IS NULL OR jsonb_typeof(p_lines) <> 'array'
     OR jsonb_array_length(p_lines) = 0 OR jsonb_array_length(p_lines) > 200 THEN
    RAISE EXCEPTION 'add_invoice_billing_lines: lines must be an array of 1 to 200 objects'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT COALESCE(max(sort_order), -1) INTO v_next_sort
    FROM public.invoice_line_items WHERE invoice_id = p_invoice_id;

  FOR v_el IN SELECT value FROM jsonb_array_elements(p_lines) LOOP
    IF jsonb_typeof(v_el) <> 'object' OR (v_el - v_keys) <> '{}'::jsonb THEN
      RAISE EXCEPTION 'add_invoice_billing_lines: each line is an object with keys %', array_to_string(v_keys, ', ')
        USING ERRCODE = 'check_violation';
    END IF;
    IF (CASE WHEN v_el ? 'purchaseId' THEN 1 ELSE 0 END)
       + (CASE WHEN v_el ? 'costLineId' THEN 1 ELSE 0 END)
       + (CASE WHEN v_el ? 'ffeItemId' THEN 1 ELSE 0 END) <> 1 THEN
      RAISE EXCEPTION 'add_invoice_billing_lines: each line names exactly one of purchaseId, costLineId, ffeItemId'
        USING ERRCODE = 'check_violation';
    END IF;

    -- amountCents: the R-PB7 override, a whole number of cents.
    v_override := NULL;
    IF v_el ? 'amountCents' AND jsonb_typeof(v_el->'amountCents') <> 'null' THEN
      IF jsonb_typeof(v_el->'amountCents') <> 'number' THEN
        RAISE EXCEPTION 'add_invoice_billing_lines: amountCents must be whole cents from 0 to 1000000000'
          USING ERRCODE = 'check_violation';
      END IF;
      IF (v_el->>'amountCents')::numeric <> trunc((v_el->>'amountCents')::numeric)
         OR (v_el->>'amountCents')::numeric < 0
         OR (v_el->>'amountCents')::numeric > 1000000000 THEN
        RAISE EXCEPTION 'add_invoice_billing_lines: amountCents must be whole cents from 0 to 1000000000'
          USING ERRCODE = 'check_violation';
      END IF;
      v_override := (v_el->>'amountCents')::numeric::bigint;
    END IF;

    IF jsonb_typeof(COALESCE(v_el->'description', 'null'::jsonb)) NOT IN ('string', 'null') THEN
      RAISE EXCEPTION 'add_invoice_billing_lines: description must be a string'
        USING ERRCODE = 'check_violation';
    END IF;
    v_desc := NULLIF(btrim(COALESCE(v_el->>'description', '')), '');
    IF char_length(v_desc) > 2000 THEN
      RAISE EXCEPTION 'add_invoice_billing_lines: description is at most 2000 characters'
        USING ERRCODE = 'check_violation';
    END IF;

    IF v_el ? 'sortOrder' AND jsonb_typeof(v_el->'sortOrder') <> 'null' THEN
      IF jsonb_typeof(v_el->'sortOrder') <> 'number' THEN
        RAISE EXCEPTION 'add_invoice_billing_lines: sortOrder must be a whole number from 0 to 1000000'
          USING ERRCODE = 'check_violation';
      END IF;
      IF (v_el->>'sortOrder')::numeric <> trunc((v_el->>'sortOrder')::numeric)
         OR (v_el->>'sortOrder')::numeric < 0
         OR (v_el->>'sortOrder')::numeric > 1000000 THEN
        RAISE EXCEPTION 'add_invoice_billing_lines: sortOrder must be a whole number from 0 to 1000000'
          USING ERRCODE = 'check_violation';
      END IF;
      v_sort := (v_el->>'sortOrder')::numeric::integer;
    ELSE
      v_next_sort := v_next_sort + 1;
      v_sort := v_next_sort;
    END IF;

    BEGIN
      v_subject := NULLIF(btrim(COALESCE(v_el->>'purchaseId', v_el->>'costLineId', v_el->>'ffeItemId', '')), '')::uuid;
    EXCEPTION WHEN invalid_text_representation THEN
      RAISE EXCEPTION 'add_invoice_billing_lines: purchaseId, costLineId and ffeItemId must be ids'
        USING ERRCODE = 'check_violation';
    END;
    IF v_subject IS NULL THEN
      RAISE EXCEPTION 'add_invoice_billing_lines: purchaseId, costLineId and ffeItemId must be ids'
        USING ERRCODE = 'check_violation';
    END IF;

    IF v_el ? 'purchaseId' THEN
      -- ── A studio purchase, at cost on its own line ──
      IF v_el ? 'stage' OR v_el ? 'depositPct' THEN
        RAISE EXCEPTION 'add_invoice_billing_lines: stage and depositPct belong to an ffeItemId line'
          USING ERRCODE = 'check_violation';
      END IF;
      SELECT * INTO v_purchase FROM public.studio_purchases WHERE id = v_subject FOR UPDATE;
      IF NOT FOUND OR v_purchase.project_id IS NULL OR NOT public.can_buy_for_project(v_purchase.project_id) THEN
        RAISE EXCEPTION 'add_invoice_billing_lines: purchase % not found or access denied', v_subject
          USING ERRCODE = 'insufficient_privilege';
      END IF;
      IF v_purchase.project_id <> v_invoice.project_id THEN
        RAISE EXCEPTION 'add_invoice_billing_lines: purchase % is on another project', v_subject
          USING ERRCODE = 'check_violation';
      END IF;
      IF v_purchase.status = 'void' THEN
        RAISE EXCEPTION 'add_invoice_billing_lines: purchase % was voided', v_subject
          USING ERRCODE = 'check_violation';
      END IF;
      IF v_purchase.invoice_line_id IS NOT NULL OR v_purchase.status = 'billed' THEN
        RAISE EXCEPTION 'add_invoice_billing_lines: purchase % is already billed', v_subject
          USING ERRCODE = 'check_violation';
      END IF;
      IF v_purchase.status <> 'recorded' THEN
        RAISE EXCEPTION 'add_invoice_billing_lines: purchase % was %', v_subject, v_purchase.status
          USING ERRCODE = 'check_violation';
      END IF;
      IF NOT v_purchase.billable_to_client THEN
        RAISE EXCEPTION 'add_invoice_billing_lines: purchase % is not billable to the client', v_subject
          USING ERRCODE = 'check_violation';
      END IF;
      IF v_purchase.currency_code <> v_invoice.currency THEN
        RAISE EXCEPTION 'add_invoice_billing_lines: purchase % is in %, the invoice in %',
          v_subject, v_purchase.currency_code, v_invoice.currency
          USING ERRCODE = 'check_violation';
      END IF;

      v_cost := v_purchase.amount_cents::bigint + v_purchase.tax_cents
              + v_purchase.buyer_premium_cents + v_purchase.shipping_cents;
      v_amount := COALESCE(v_override, v_cost);
      IF v_amount > 1000000000 THEN
        RAISE EXCEPTION 'add_invoice_billing_lines: purchase % is over the line limit', v_subject
          USING ERRCODE = 'check_violation';
      END IF;

      INSERT INTO public.invoice_line_items (
        invoice_id, kind, description, quantity, unit_amount_cents, amount_cents, metadata, sort_order
      ) VALUES (
        p_invoice_id, 'adhoc',
        COALESCE(v_desc, left(COALESCE(NULLIF(btrim(v_purchase.description), ''), v_purchase.payee_name), 2000)),
        1, v_amount, v_amount,
        jsonb_build_object('studioPurchaseId', v_purchase.id, 'billingRule', v_purchase.billing_rule,
                           'costCents', v_cost),
        v_sort
      )
      RETURNING * INTO v_line;

      UPDATE public.studio_purchases
         SET invoice_line_id = v_line.id, status = 'billed'
       WHERE id = v_purchase.id;

    ELSIF v_el ? 'costLineId' THEN
      -- ── A PO rider, at cost on its own line ──
      IF v_el ? 'stage' OR v_el ? 'depositPct' THEN
        RAISE EXCEPTION 'add_invoice_billing_lines: stage and depositPct belong to an ffeItemId line'
          USING ERRCODE = 'check_violation';
      END IF;
      SELECT * INTO v_rider FROM public.po_cost_lines WHERE id = v_subject FOR UPDATE;
      IF NOT FOUND OR NOT public.can_send_purchase_order(v_rider.purchase_order_id) THEN
        RAISE EXCEPTION 'add_invoice_billing_lines: rider % not found or access denied', v_subject
          USING ERRCODE = 'insufficient_privilege';
      END IF;
      SELECT project_id INTO v_po_project FROM public.purchase_orders WHERE id = v_rider.purchase_order_id;
      IF v_po_project IS DISTINCT FROM v_invoice.project_id THEN
        RAISE EXCEPTION 'add_invoice_billing_lines: rider % is on another project', v_subject
          USING ERRCODE = 'check_violation';
      END IF;
      IF v_rider.invoice_line_id IS NOT NULL THEN
        RAISE EXCEPTION 'add_invoice_billing_lines: rider % is already billed', v_subject
          USING ERRCODE = 'check_violation';
      END IF;
      IF NOT v_rider.billable_to_client THEN
        RAISE EXCEPTION 'add_invoice_billing_lines: rider % is not billable to the client', v_subject
          USING ERRCODE = 'check_violation';
      END IF;

      v_cost := COALESCE(v_rider.actual_cents, v_rider.estimate_cents);
      IF v_cost IS NULL AND v_override IS NULL THEN
        RAISE EXCEPTION 'add_invoice_billing_lines: rider % has no estimate or actual; enter amountCents', v_subject
          USING ERRCODE = 'check_violation';
      END IF;
      v_amount := COALESCE(v_override, v_cost);
      IF v_amount < 0 OR v_amount > 1000000000 THEN
        RAISE EXCEPTION 'add_invoice_billing_lines: rider % amount is outside 0 to 1000000000', v_subject
          USING ERRCODE = 'check_violation';
      END IF;

      INSERT INTO public.invoice_line_items (
        invoice_id, kind, description, quantity, unit_amount_cents, amount_cents, metadata, sort_order
      ) VALUES (
        p_invoice_id, 'adhoc',
        COALESCE(v_desc, left(initcap(replace(v_rider.kind, '_', ' '))
                              || COALESCE(' · ' || NULLIF(btrim(v_rider.note), ''), ''), 2000)),
        1, v_amount, v_amount,
        jsonb_build_object('poCostLineId', v_rider.id, 'purchaseOrderId', v_rider.purchase_order_id,
                           'riderKind', v_rider.kind, 'billingRule', v_rider.billing_rule,
                           'costCents', v_cost),
        v_sort
      )
      RETURNING * INTO v_line;

      UPDATE public.po_cost_lines SET invoice_line_id = v_line.id WHERE id = v_rider.id;

    ELSE
      -- ── A deposit or balance slot on an FF&E line ──
      v_stage := v_el->>'stage';
      IF v_stage IS NULL OR v_stage NOT IN ('deposit', 'balance') THEN
        RAISE EXCEPTION 'add_invoice_billing_lines: stage must be deposit or balance (a full bill goes through create_draft_invoice)'
          USING ERRCODE = 'check_violation';
      END IF;
      SELECT * INTO v_item FROM public.project_ffe_items WHERE id = v_subject FOR SHARE;
      IF NOT FOUND OR v_item.project_id <> v_invoice.project_id THEN
        RAISE EXCEPTION 'add_invoice_billing_lines: line % is not on this invoice''s project', v_subject
          USING ERRCODE = 'check_violation';
      END IF;
      IF v_item.removed_at IS NOT NULL THEN
        RAISE EXCEPTION 'add_invoice_billing_lines: line % was removed', v_subject
          USING ERRCODE = 'check_violation';
      END IF;
      v_price := v_item.quantity::bigint * v_item.unit_price_cents;

      v_pct := NULL;
      IF v_stage = 'deposit' THEN
        IF jsonb_typeof(COALESCE(v_el->'depositPct', 'null'::jsonb)) <> 'number' THEN
          RAISE EXCEPTION 'add_invoice_billing_lines: a deposit needs depositPct above 0 and at most 100'
            USING ERRCODE = 'check_violation';
        END IF;
        v_pct := (v_el->>'depositPct')::numeric;
        IF v_pct <= 0 OR v_pct > 100 OR v_pct <> round(v_pct, 2) THEN
          RAISE EXCEPTION 'add_invoice_billing_lines: a deposit needs depositPct above 0 and at most 100, to two places'
            USING ERRCODE = 'check_violation';
        END IF;
        IF v_price IS NULL AND v_override IS NULL THEN
          RAISE EXCEPTION 'add_invoice_billing_lines: line % has no client price; enter amountCents', v_subject
            USING ERRCODE = 'check_violation';
        END IF;
        v_amount := COALESCE(v_override, round(v_price * v_pct / 100)::bigint);
        -- 00718 (M4): deposit and balance sum to the price at most. A deposit
        -- re-added after its balance was computed fits in what is left.
        IF v_price IS NOT NULL THEN
          SELECT COALESCE(sum(li.amount_cents), 0) INTO v_staged
            FROM public.invoice_line_items AS li
            JOIN public.invoices AS i ON i.id = li.invoice_id AND i.status <> 'void'
           WHERE li.ffe_item_id = v_item.id AND li.billing_stage IN ('deposit', 'balance');
          IF v_amount > v_price - v_staged THEN
            RAISE EXCEPTION 'add_invoice_billing_lines: a deposit of % cents is more than the % cents left to bill on line %',
              v_amount, GREATEST(v_price - v_staged, 0), v_subject
              USING ERRCODE = 'check_violation';
          END IF;
        END IF;
        v_desc := COALESCE(v_desc, left('Deposit (' || rtrim(to_char(v_pct, 'FM990.99'), '.') || '%) · ' || v_item.name, 2000));
      ELSE
        IF v_el ? 'depositPct' THEN
          RAISE EXCEPTION 'add_invoice_billing_lines: depositPct belongs to a deposit'
            USING ERRCODE = 'check_violation';
        END IF;
        SELECT sum(li.amount_cents) INTO v_deposited
          FROM public.invoice_line_items AS li
          JOIN public.invoices AS i ON i.id = li.invoice_id AND i.status <> 'void'
         WHERE li.ffe_item_id = v_item.id AND li.billing_stage = 'deposit';
        IF v_deposited IS NULL THEN
          RAISE EXCEPTION 'add_invoice_billing_lines: line % has no deposit billed; bill it in full instead', v_subject
            USING ERRCODE = 'check_violation';
        END IF;
        IF v_price IS NULL AND v_override IS NULL THEN
          RAISE EXCEPTION 'add_invoice_billing_lines: line % has no client price; enter amountCents', v_subject
            USING ERRCODE = 'check_violation';
        END IF;
        v_amount := COALESCE(v_override, v_price - v_deposited);
        IF v_amount <= 0 AND v_override IS NULL THEN
          RAISE EXCEPTION 'add_invoice_billing_lines: line % has nothing left to bill after its deposit', v_subject
            USING ERRCODE = 'check_violation';
        END IF;
        -- 00718 (M4): a balance is at most the price less the live deposits.
        IF v_price IS NOT NULL AND v_amount > v_price - v_deposited THEN
          RAISE EXCEPTION 'add_invoice_billing_lines: a balance of % cents is more than the % cents left on line % after its deposit',
            v_amount, GREATEST(v_price - v_deposited, 0), v_subject
            USING ERRCODE = 'check_violation';
        END IF;
        v_desc := COALESCE(v_desc, left('Balance · ' || v_item.name, 2000));
      END IF;
      IF v_amount > 1000000000 THEN
        RAISE EXCEPTION 'add_invoice_billing_lines: line % is over the line limit', v_subject
          USING ERRCODE = 'check_violation';
      END IF;

      INSERT INTO public.invoice_line_items (
        invoice_id, kind, ffe_item_id, billing_stage, billing_stage_pct, description,
        quantity, unit_amount_cents, amount_cents, metadata, sort_order
      ) VALUES (
        p_invoice_id, 'ffe', v_item.id, v_stage, v_pct, v_desc,
        1, v_amount, v_amount, jsonb_build_object('billingStage', v_stage), v_sort
      )
      RETURNING * INTO v_line;
    END IF;

    v_ids := v_ids || v_line.id;
  END LOOP;

  -- Totals, the way create_draft_invoice computes them; tax stays the rate the
  -- studio entered.
  SELECT COALESCE(sum(amount_cents), 0) INTO v_subtotal
    FROM public.invoice_line_items WHERE invoice_id = p_invoice_id;
  v_tax := round(v_subtotal * v_invoice.tax_rate)::bigint;
  UPDATE public.invoices
     SET subtotal_cents = v_subtotal, tax_cents = v_tax, total_cents = v_subtotal + v_tax
   WHERE id = p_invoice_id;

  RETURN QUERY
    SELECT * FROM public.invoice_line_items WHERE id = ANY (v_ids) ORDER BY sort_order, created_at, id;
END;
$$;

COMMENT ON FUNCTION public.add_invoice_billing_lines(uuid, jsonb) IS
  'The billing writer (00709, C-31, R-PB7): adds lines to a draft invoice the caller can manage. '
  '{purchaseId} bills a recorded, client-billable studio purchase at cost and stamps it billed; '
  '{costLineId} bills a client-billable PO rider at cost and stamps it; {ffeItemId, stage} bills a '
  'deposit (depositPct) or the balance. amountCents overrides, but a deposit plus its balance never '
  'exceeds the line''s client price (00718). A stamped, voided or returned purchase and a stamped rider '
  'are refused, so nothing bills twice. Recomputes the draft''s totals.';

-- ─── S2. record_vendor_quote (00707 body) ───────────────────────────────────

CREATE OR REPLACE FUNCTION public.record_vendor_quote(p_request jsonb)
RETURNS public.vendor_quotes
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_uid       uuid := auth.uid();
  v_req       jsonb := COALESCE(p_request, '{}'::jsonb);
  v_keys      constant text[] := ARRAY['requestId', 'vendorId', 'projectId', 'receivedOn', 'quoteRef',
    'validUntil', 'cratingCents', 'freightEstimateCents', 'paymentPattern', 'depositPct', 'documentPath',
    'supersedesQuoteId', 'lines'];
  v_line_keys constant text[] := ARRAY['ffeItemId', 'unitTradeCents', 'qty', 'leadTimeWeeks', 'note'];
  v_utc_day   date := (now() AT TIME ZONE 'UTC')::date;
  v_key       text;
  v_request   public.vendor_quote_requests%ROWTYPE;
  v_project   public.projects%ROWTYPE;
  v_old       public.vendor_quotes%ROWTYPE;
  v_quote     public.vendor_quotes%ROWTYPE;
  v_request_id uuid;
  v_vendor_id uuid;
  v_project_id uuid;
  v_old_id    uuid;
  v_item_id   uuid;
  v_received  date;
  v_valid     date;
  v_crating   numeric;
  v_freight   numeric;
  v_deposit   numeric;
  v_pattern   public.purchase_order_payment_pattern;
  v_ref       text;
  v_doc       text;
  v_lines     jsonb;
  v_entry     jsonb;
  v_trade     numeric;
  v_qty       numeric;
  v_weeks     numeric;
  v_note      text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'record_vendor_quote: not authenticated' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF jsonb_typeof(v_req) <> 'object' THEN
    RAISE EXCEPTION 'record_vendor_quote: request must be an object' USING ERRCODE = 'check_violation';
  END IF;
  IF (v_req - v_keys) <> '{}'::jsonb THEN
    RAISE EXCEPTION 'record_vendor_quote: unknown keys %',
      (SELECT string_agg(key, ', ') FROM jsonb_object_keys(v_req - v_keys) AS key)
      USING ERRCODE = 'check_violation';
  END IF;
  FOR v_key IN SELECT key FROM jsonb_object_keys(v_req) AS key LOOP
    IF jsonb_typeof(v_req->v_key) <> 'null' AND jsonb_typeof(v_req->v_key) <> (CASE
         WHEN v_key IN ('cratingCents', 'freightEstimateCents', 'depositPct') THEN 'number'
         WHEN v_key = 'lines' THEN 'array'
         ELSE 'string' END) THEN
      RAISE EXCEPTION 'record_vendor_quote: % has the wrong type', v_key USING ERRCODE = 'check_violation';
    END IF;
  END LOOP;

  BEGIN
    v_request_id := NULLIF(btrim(COALESCE(v_req->>'requestId', '')), '')::uuid;
    v_vendor_id := NULLIF(btrim(COALESCE(v_req->>'vendorId', '')), '')::uuid;
    v_project_id := NULLIF(btrim(COALESCE(v_req->>'projectId', '')), '')::uuid;
    v_old_id := NULLIF(btrim(COALESCE(v_req->>'supersedesQuoteId', '')), '')::uuid;
  EXCEPTION WHEN invalid_text_representation THEN
    RAISE EXCEPTION 'record_vendor_quote: requestId, vendorId, projectId and supersedesQuoteId must be ids'
      USING ERRCODE = 'check_violation';
  END;

  IF v_request_id IS NOT NULL THEN
    SELECT * INTO v_request FROM public.vendor_quote_requests WHERE id = v_request_id FOR UPDATE;
    -- 00718 (S2): a request on a project is that project's studio's.
    IF NOT FOUND OR NOT public.is_studio_comember(v_request.designer_id)
       OR (v_request.project_id IS NOT NULL AND NOT public.can_buy_for_project(v_request.project_id)) THEN
      RAISE EXCEPTION 'record_vendor_quote: quote request % not found or access denied', v_request_id
        USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF (v_vendor_id IS NOT NULL AND v_vendor_id <> v_request.vendor_id)
       OR (v_project_id IS NOT NULL AND v_request.project_id IS NOT NULL AND v_project_id <> v_request.project_id) THEN
      RAISE EXCEPTION 'record_vendor_quote: vendorId and projectId must match quote request %', v_request_id
        USING ERRCODE = 'check_violation';
    END IF;
    v_vendor_id := v_request.vendor_id;
    v_project_id := COALESCE(v_project_id, v_request.project_id);
  END IF;

  IF v_project_id IS NULL THEN
    RAISE EXCEPTION 'record_vendor_quote: projectId is required' USING ERRCODE = 'check_violation';
  END IF;
  SELECT * INTO v_project FROM public.projects WHERE id = v_project_id;
  IF NOT FOUND OR NOT public.can_buy_for_project(v_project_id) THEN
    RAISE EXCEPTION 'record_vendor_quote: project % not found or access denied', v_project_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  -- 00718 (S2): a request with no project links only to a project its
  -- requester could buy for (can_buy_for_project's shape, for the requester):
  -- the owner, a non-guest member of the project's studio, or on a project
  -- with no studio a non-guest co-member of its owner.
  IF v_request_id IS NOT NULL AND v_request.project_id IS NULL AND NOT (
       v_request.designer_id = v_project.designer_id
       OR (v_project.studio_id IS NOT NULL AND EXISTS (
             SELECT 1 FROM public.organization_members AS member
             JOIN public.organizations AS org ON org.id = member.organization_id
             WHERE member.organization_id = v_project.studio_id AND member.user_id = v_request.designer_id
               AND member.status = 'active' AND member.role <> 'guest' AND org.status = 'active'))
       OR (v_project.studio_id IS NULL AND EXISTS (
             SELECT 1 FROM public.organization_members AS mine
             JOIN public.organization_members AS theirs ON theirs.organization_id = mine.organization_id
             JOIN public.organizations AS org ON org.id = mine.organization_id
             WHERE mine.user_id = v_request.designer_id AND theirs.user_id = v_project.designer_id
               AND mine.status = 'active' AND mine.role <> 'guest'
               AND theirs.status = 'active' AND theirs.role <> 'guest' AND org.status = 'active'))
     ) THEN
    RAISE EXCEPTION 'record_vendor_quote: quote request % not found or access denied', v_request_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF v_vendor_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.vendors WHERE id = v_vendor_id) THEN
    RAISE EXCEPTION 'record_vendor_quote: vendorId must be a vendor' USING ERRCODE = 'check_violation';
  END IF;

  BEGIN
    v_received := COALESCE(NULLIF(btrim(COALESCE(v_req->>'receivedOn', '')), '')::date, v_utc_day);
    v_valid := NULLIF(btrim(COALESCE(v_req->>'validUntil', '')), '')::date;
  EXCEPTION WHEN invalid_datetime_format OR datetime_field_overflow THEN
    RAISE EXCEPTION 'record_vendor_quote: receivedOn and validUntil must be dates (YYYY-MM-DD)'
      USING ERRCODE = 'check_violation';
  END;
  IF v_received > v_utc_day + 1 OR (v_valid IS NOT NULL AND v_valid < v_received) THEN
    RAISE EXCEPTION 'record_vendor_quote: receivedOn cannot be in the future, and validUntil cannot precede it'
      USING ERRCODE = 'check_violation';
  END IF;
  v_crating := (v_req->>'cratingCents')::numeric;
  v_freight := (v_req->>'freightEstimateCents')::numeric;
  v_deposit := (v_req->>'depositPct')::numeric;
  IF (v_crating IS NOT NULL AND (v_crating < 0 OR v_crating <> trunc(v_crating) OR v_crating > 2147483647))
     OR (v_freight IS NOT NULL AND (v_freight < 0 OR v_freight <> trunc(v_freight) OR v_freight > 2147483647))
     OR (v_deposit IS NOT NULL AND (v_deposit < 0 OR v_deposit > 100)) THEN
    RAISE EXCEPTION 'record_vendor_quote: cratingCents and freightEstimateCents are whole, non-negative cents; depositPct is 0–100'
      USING ERRCODE = 'check_violation';
  END IF;
  BEGIN
    v_pattern := NULLIF(btrim(COALESCE(v_req->>'paymentPattern', '')), '')::public.purchase_order_payment_pattern;
  EXCEPTION WHEN invalid_text_representation THEN
    RAISE EXCEPTION 'record_vendor_quote: paymentPattern must be fifty_fifty, thirty_seventy, full_upfront, net_30 or custom_milestones'
      USING ERRCODE = 'check_violation';
  END;
  v_ref := NULLIF(btrim(COALESCE(v_req->>'quoteRef', '')), '');
  v_doc := NULLIF(btrim(COALESCE(v_req->>'documentPath', '')), '');
  IF char_length(v_ref) > 100 OR char_length(v_doc) > 1024 THEN
    RAISE EXCEPTION 'record_vendor_quote: quoteRef is at most 100 characters, documentPath 1024'
      USING ERRCODE = 'check_violation';
  END IF;

  IF v_old_id IS NOT NULL THEN
    SELECT * INTO v_old FROM public.vendor_quotes WHERE id = v_old_id FOR UPDATE;
    IF NOT FOUND OR NOT public.can_buy_for_project(v_old.project_id) THEN
      RAISE EXCEPTION 'record_vendor_quote: quote % not found or access denied', v_old_id
        USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF v_old.project_id <> v_project_id OR v_old.vendor_id <> v_vendor_id OR v_old.superseded_by IS NOT NULL THEN
      RAISE EXCEPTION 'record_vendor_quote: quote % is for another project or vendor, or already superseded', v_old_id
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  v_lines := COALESCE(v_req->'lines', '[]'::jsonb);
  IF jsonb_typeof(v_lines) <> 'array' OR jsonb_array_length(v_lines) > 200 THEN
    RAISE EXCEPTION 'record_vendor_quote: lines must be an array of at most 200 entries'
      USING ERRCODE = 'check_violation';
  END IF;

  INSERT INTO public.vendor_quotes (
    organization_id, request_id, vendor_id, project_id, received_on, quote_ref, valid_until,
    crating_cents, freight_estimate_cents, payment_pattern, deposit_pct, document_path, recorded_by
  ) VALUES (
    COALESCE(v_project.studio_id, public._primary_studio_for(v_project.designer_id)),
    v_request_id, v_vendor_id, v_project_id, v_received, v_ref, v_valid,
    v_crating::integer, v_freight::integer, v_pattern, v_deposit, v_doc, v_uid
  )
  RETURNING * INTO v_quote;

  FOR v_entry IN SELECT value FROM jsonb_array_elements(v_lines) LOOP
    IF jsonb_typeof(v_entry) <> 'object' OR (v_entry - v_line_keys) <> '{}'::jsonb
       OR jsonb_typeof(COALESCE(v_entry->'ffeItemId', 'null')) <> 'string'
       OR jsonb_typeof(COALESCE(v_entry->'unitTradeCents', 'null')) <> 'number'
       OR jsonb_typeof(COALESCE(v_entry->'qty', 'null')) NOT IN ('number', 'null')
       OR jsonb_typeof(COALESCE(v_entry->'leadTimeWeeks', 'null')) NOT IN ('number', 'null')
       OR jsonb_typeof(COALESCE(v_entry->'note', 'null')) NOT IN ('string', 'null') THEN
      RAISE EXCEPTION 'record_vendor_quote: each line is {ffeItemId, unitTradeCents, qty?, leadTimeWeeks?, note?}'
        USING ERRCODE = 'check_violation';
    END IF;
    BEGIN
      v_item_id := (v_entry->>'ffeItemId')::uuid;
    EXCEPTION WHEN invalid_text_representation THEN
      RAISE EXCEPTION 'record_vendor_quote: ffeItemId must be an id' USING ERRCODE = 'check_violation';
    END;
    IF NOT EXISTS (
      SELECT 1 FROM public.project_ffe_items
      WHERE id = v_item_id AND project_id = v_project_id AND removed_at IS NULL
    ) THEN
      RAISE EXCEPTION 'record_vendor_quote: line % is not a live line of project %', v_item_id, v_project_id
        USING ERRCODE = 'check_violation';
    END IF;
    v_trade := (v_entry->>'unitTradeCents')::numeric;
    v_qty := (v_entry->>'qty')::numeric;
    v_weeks := (v_entry->>'leadTimeWeeks')::numeric;
    v_note := NULLIF(btrim(COALESCE(v_entry->>'note', '')), '');
    IF v_trade < 0 OR v_trade <> trunc(v_trade) OR v_trade > 2147483647
       OR (v_qty IS NOT NULL AND (v_qty < 1 OR v_qty <> trunc(v_qty) OR v_qty > 100000))
       OR (v_weeks IS NOT NULL AND (v_weeks < 0 OR v_weeks <> trunc(v_weeks) OR v_weeks > 260))
       OR char_length(v_note) > 1000 THEN
      RAISE EXCEPTION 'record_vendor_quote: unitTradeCents is whole, non-negative cents; qty a whole number from 1; leadTimeWeeks 0–260; note at most 1000 characters'
        USING ERRCODE = 'check_violation';
    END IF;
    IF EXISTS (SELECT 1 FROM public.vendor_quote_lines WHERE quote_id = v_quote.id AND ffe_item_id = v_item_id) THEN
      RAISE EXCEPTION 'record_vendor_quote: line % is listed twice', v_item_id USING ERRCODE = 'check_violation';
    END IF;
    INSERT INTO public.vendor_quote_lines (quote_id, ffe_item_id, unit_trade_cents, qty, lead_time_weeks, note)
    VALUES (v_quote.id, v_item_id, v_trade::integer, v_qty::integer, v_weeks::integer, v_note);
  END LOOP;

  IF v_old_id IS NOT NULL THEN
    UPDATE public.vendor_quotes SET superseded_by = v_quote.id WHERE id = v_old_id;
  END IF;
  IF v_request_id IS NOT NULL AND v_request.status = 'sent' THEN
    UPDATE public.vendor_quote_requests SET status = 'responded' WHERE id = v_request_id;
  END IF;

  RETURN v_quote;
END;
$$;

COMMENT ON FUNCTION public.record_vendor_quote(jsonb) IS
  'Records a returned vendor quote and its lines (00707, C-29, d2 §M2). Studio-entered (R-PB8). A '
  'linked request supplies vendor and project and moves sent → responded; it needs can_buy_for_project '
  'on its own project, and a request with no project links only to a project its requester could buy '
  'for (00718). supersedesQuoteId marks the older quote. Gate: can_buy_for_project.';

-- ─── S3. snapshot_purchase_order_spec (00711 body) ──────────────────────────

CREATE OR REPLACE FUNCTION public.snapshot_purchase_order_spec(p_po_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_uid      uuid := auth.uid();
  v_po       public.purchase_orders%ROWTYPE;
  v_latest   integer;
  v_current  text;
  v_previous text;
  v_lines    jsonb;
BEGIN
  SELECT * INTO v_po FROM public.purchase_orders WHERE id = p_po_id FOR UPDATE;
  IF NOT FOUND OR (v_uid IS NOT NULL AND NOT public.can_send_purchase_order(p_po_id)) THEN
    RAISE EXCEPTION 'snapshot_purchase_order_spec: purchase order % not found or access denied', p_po_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  -- 00718 (S3): a revision is what the vendor is sent; a held or cancelled
  -- order is not sent.
  IF v_po.status IN ('held_for_release', 'cancelled') THEN
    RAISE EXCEPTION 'snapshot_purchase_order_spec: purchase order % is %; it takes no spec revision', p_po_id, v_po.status
      USING ERRCODE = 'check_violation';
  END IF;

  -- Values only, so a touched-but-unchanged line hashes the same.
  SELECT jsonb_agg(jsonb_build_object('ffeItemId', line.ffe_item_id, 'spec', line.spec,
                                      'hash', md5(line.spec::text))
                   ORDER BY line.ffe_item_id::text)
    INTO v_lines
    FROM (
      SELECT i.id AS ffe_item_id,
             jsonb_build_object(
               'name', i.name,
               'quantity', i.quantity,
               'unitTradeCents', i.trade_price_cents,
               'sku', public._spec_book_resolve_field(
                 to_jsonb(sp.sku), i.custom_fields->'sku', to_jsonb(p.sku),
                 p.capture_provenance#>'{studioCustom,sku}', sp.na_declarations->'sku',
                 sp.updated_at, i.updated_at, p.updated_at,
                 NULLIF(sp.source_verifications->>'sku', '')::timestamptz,
                 sp.field_provenance->>'sku')->'value',
               'finish', public._spec_book_resolve_field(
                 to_jsonb(sp.finish), i.custom_fields->'finish', to_jsonb(p.finish),
                 p.capture_provenance#>'{studioCustom,finish}', sp.na_declarations->'finish',
                 sp.updated_at, i.updated_at, p.updated_at,
                 NULLIF(sp.source_verifications->>'finish', '')::timestamptz,
                 sp.field_provenance->>'finish')->'value',
               'material', public._spec_book_resolve_field(
                 to_jsonb(sp.material), i.custom_fields->'material', to_jsonb(p.materials),
                 p.capture_provenance#>'{studioCustom,material}', sp.na_declarations->'material',
                 sp.updated_at, i.updated_at, p.updated_at,
                 NULLIF(sp.source_verifications->>'material', '')::timestamptz,
                 sp.field_provenance->>'material')->'value',
               'colorFabric', public._spec_book_resolve_field(
                 to_jsonb(sp.color_fabric), i.custom_fields->'colorFabric', to_jsonb(p.colors),
                 p.capture_provenance#>'{studioCustom,colorFabric}', sp.na_declarations->'colorFabric',
                 sp.updated_at, i.updated_at, p.updated_at,
                 NULLIF(sp.source_verifications->>'colorFabric', '')::timestamptz,
                 sp.field_provenance->>'colorFabric')->'value',
               'dimensions', public._spec_book_resolve_field(
                 sp.selected_dimensions, i.custom_fields->'dimensions', p.dimensions,
                 p.capture_provenance#>'{studioCustom,dimensions}', sp.na_declarations->'dimensions',
                 sp.updated_at, i.updated_at, p.updated_at,
                 NULLIF(sp.source_verifications->>'dimensions', '')::timestamptz,
                 sp.field_provenance->>'dimensions')->'value',
               'comSpec', sp.com_spec,
               'tradeNotes', sp.trade_notes
             ) AS spec
        FROM public.project_ffe_items AS i
        LEFT JOIN public.project_ffe_specs AS sp ON sp.ffe_item_id = i.id
        LEFT JOIN public.products AS p ON p.id = i.product_id
       WHERE i.purchase_order_id = p_po_id
         AND i.removed_at IS NULL
    ) AS line;

  IF v_lines IS NULL THEN
    RETURN 0;
  END IF;

  SELECT max(revision) INTO v_latest FROM public.po_spec_snapshots WHERE purchase_order_id = p_po_id;

  SELECT string_agg((line->>'ffeItemId') || ':' || (line->>'hash'), ',' ORDER BY line->>'ffeItemId')
    INTO v_current FROM jsonb_array_elements(v_lines) AS line;
  IF v_latest IS NOT NULL THEN
    SELECT string_agg(COALESCE(ffe_item_id::text, '') || ':' || content_hash, ',' ORDER BY ffe_item_id::text)
      INTO v_previous
      FROM public.po_spec_snapshots
     WHERE purchase_order_id = p_po_id AND revision = v_latest;
    IF v_previous = v_current THEN
      RETURN v_latest;
    END IF;
  END IF;

  INSERT INTO public.po_spec_snapshots (
    organization_id, purchase_order_id, revision, ffe_item_id, spec, content_hash, created_by
  )
  SELECT public.purchase_order_studio_id(p_po_id), p_po_id, COALESCE(v_latest, 0) + 1,
         (line->>'ffeItemId')::uuid, line->'spec', line->>'hash', v_uid
    FROM jsonb_array_elements(v_lines) AS line;

  RETURN COALESCE(v_latest, 0) + 1;
END;
$$;

COMMENT ON FUNCTION public.snapshot_purchase_order_spec(uuid) IS
  'Snapshots the resolved spec of each live line on a PO (00711, C-34): a new revision only when the line '
  'set or a line''s values changed since the latest; returns the revision (0 for a PO with no lines). '
  'po-send calls it on send (SQ-432). Held and cancelled POs are refused (00718). service_role, or a '
  'co-member (can_send_purchase_order).';

-- ─── S4. The receiver's inbound notice, shared by shipment and advance ──────

-- Internal: composes the notice for a PO that ships to a receiver. No caller
-- check; callers gate on can_send_purchase_order.
CREATE OR REPLACE FUNCTION public._compose_receiver_inbound_draft(
  p_po_id uuid,
  p_shipment_id uuid,
  p_shipped_on date,
  p_eta date,
  p_carrier text,
  p_tracking text
)
RETURNS public.procurement_drafts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_po       public.purchase_orders%ROWTYPE;
  v_location public.studio_locations%ROWTYPE;
  v_contact  public.studio_contacts%ROWTYPE;
  v_vendor   text;
  v_label    text;
  v_sidemark text;
  v_pieces   text;
  v_draft    public.procurement_drafts%ROWTYPE;
BEGIN
  SELECT * INTO v_po FROM public.purchase_orders WHERE id = p_po_id;
  SELECT * INTO v_location FROM public.studio_locations WHERE id = v_po.ship_to_location_id;
  IF v_location.studio_contact_id IS NOT NULL THEN
    SELECT * INTO v_contact FROM public.studio_contacts WHERE id = v_location.studio_contact_id;
  END IF;
  SELECT name INTO v_vendor FROM public.vendors WHERE id = v_po.vendor_id;
  v_label := public._procurement_po_label(v_po);
  v_sidemark := COALESCE(NULLIF(btrim(v_po.sidemark), ''), v_label);
  SELECT string_agg(format('- %s × %s', item.quantity, item.name), E'\n' ORDER BY item.sort_order, item.name)
    INTO v_pieces
  FROM public.project_ffe_items AS item
  WHERE item.purchase_order_id = v_po.id AND item.removed_at IS NULL;

  INSERT INTO public.procurement_drafts (
    organization_id, project_id, kind, purchase_order_id, shipment_id, to_contact_id, to_email, subject, body
  ) VALUES (
    v_location.organization_id, v_po.project_id, 'receiver_inbound_notice', v_po.id, p_shipment_id,
    v_contact.id, NULLIF(btrim(v_contact.email), ''),
    format('Inbound: %s, sidemark %s', COALESCE(v_vendor, 'a vendor shipment'), v_sidemark),
    format(E'Hello %s,\n\nA shipment from %s is on its way to %s, sidemark %s.\n\n%s%s%s\n\nPieces:\n%s\n\nPlease inspect on arrival and note any damage on the delivery receipt.\n\nThank you,\n%s',
      COALESCE(NULLIF(btrim(v_contact.full_name), ''), 'there'),
      COALESCE(v_vendor, 'our vendor'), COALESCE(v_location.label, 'you'), v_sidemark,
      format('Shipped %s', to_char(p_shipped_on, 'FMMonth FMDD, YYYY')),
      CASE WHEN p_eta IS NOT NULL
           THEN format(', expected %s', to_char(p_eta, 'FMMonth FMDD, YYYY')) ELSE '' END,
      CASE WHEN p_carrier IS NOT NULL OR p_tracking IS NOT NULL
           THEN format(E'.\nCarrier: %s%s', COALESCE(p_carrier, 'not given'),
                       CASE WHEN p_tracking IS NOT NULL THEN ', tracking ' || p_tracking ELSE '' END)
           ELSE '.' END,
      COALESCE(v_pieces, '- (see the packing list)'),
      public._procurement_signoff(v_location.organization_id, v_po.project_id))
  )
  RETURNING * INTO v_draft;
  RETURN v_draft;
END;
$$;

REVOKE ALL ON FUNCTION public._compose_receiver_inbound_draft(uuid, uuid, date, date, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._compose_receiver_inbound_draft(uuid, uuid, date, date, text, text)
  TO service_role;

-- 00706 body: the gate, then the shared composer with the shipment's facts.
CREATE OR REPLACE FUNCTION public.compose_receiver_inbound_draft(p_shipment_id uuid)
RETURNS public.procurement_drafts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_shipment public.po_shipments%ROWTYPE;
  v_po       public.purchase_orders%ROWTYPE;
BEGIN
  SELECT * INTO v_shipment FROM public.po_shipments WHERE id = p_shipment_id;
  IF FOUND THEN
    SELECT * INTO v_po FROM public.purchase_orders WHERE id = v_shipment.purchase_order_id;
  END IF;
  IF v_po.id IS NULL OR NOT public.can_send_purchase_order(v_po.id) THEN
    RAISE EXCEPTION 'compose_receiver_inbound_draft: shipment % not found or access denied', p_shipment_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF v_po.ship_to_location_id IS NULL THEN
    RAISE EXCEPTION 'compose_receiver_inbound_draft: purchase order % does not ship to a receiver', v_po.id
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN public._compose_receiver_inbound_draft(
    v_po.id, v_shipment.id, v_shipment.shipped_on, v_shipment.current_eta, v_shipment.carrier, v_shipment.tracking);
END;
$$;

-- advance_purchase_order_status (00698 body).
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

  -- 00718 (S4): shipped with no shipment row still tells the receiver what is
  -- coming (C-26/C-28); record_po_shipment inserts its row first and its
  -- caller composes from it. Lands awaiting_review; nothing sends.
  IF p_to = 'shipped' AND v_po.ship_to_location_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.po_shipments WHERE purchase_order_id = p_po_id) THEN
    PERFORM public._compose_receiver_inbound_draft(
      p_po_id, NULL, v_po.shipped_on, v_po.confirmed_eta, v_po.carrier, v_po.tracking_number);
  END IF;
  RETURN v_po;
END;
$$;

-- ─── C1. request_substitution_approval (00708 body) ─────────────────────────

CREATE OR REPLACE FUNCTION public.request_substitution_approval(p_item_id uuid, p_alternate_ids uuid[])
RETURNS public.client_decisions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_uid          uuid := auth.uid();
  v_item         public.project_ffe_items%ROWTYPE;
  v_project      public.projects%ROWTYPE;
  v_relationship uuid;
  v_decision_id  uuid := gen_random_uuid();
  v_options      jsonb;
  v_decision     public.client_decisions%ROWTYPE;
  v_exception_id uuid;
  v_exception    text;
  v_note         text;
  v_context      text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'request_substitution_approval: not authenticated' USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT * INTO v_item FROM public.project_ffe_items WHERE id = p_item_id FOR UPDATE;
  IF NOT FOUND OR NOT public.can_buy_for_project(v_item.project_id) THEN
    RAISE EXCEPTION 'request_substitution_approval: line % not found or access denied', p_item_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF v_item.removed_at IS NOT NULL OR v_item.design_disposition <> 'selected' THEN
    RAISE EXCEPTION 'request_substitution_approval: only a live, selected line can be substituted'
      USING ERRCODE = 'check_violation';
  END IF;
  IF v_item.blocked_by_decision_id IS NOT NULL THEN
    RAISE EXCEPTION 'request_substitution_approval: line % already waits on a client decision', p_item_id
      USING ERRCODE = 'check_violation';
  END IF;
  IF p_alternate_ids IS NULL OR cardinality(p_alternate_ids) NOT BETWEEN 1 AND 10
     OR (SELECT count(DISTINCT id) FROM unnest(p_alternate_ids) AS id) <> cardinality(p_alternate_ids)
     OR p_item_id = ANY(p_alternate_ids)
     OR EXISTS (
       SELECT 1 FROM unnest(p_alternate_ids) AS wanted(id)
       WHERE NOT EXISTS (
         SELECT 1 FROM public.project_ffe_items AS alt
         WHERE alt.id = wanted.id AND alt.project_id = v_item.project_id
           AND alt.removed_at IS NULL AND alt.design_disposition = 'alternate'
       )
     ) THEN
    RAISE EXCEPTION 'request_substitution_approval: alternates are 1–10 distinct live alternate lines of the same project'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO v_project FROM public.projects WHERE id = v_item.project_id;
  -- 00463's relationship lookup.
  SELECT id INTO v_relationship
  FROM public.designer_clients
  WHERE designer_id = v_project.designer_id AND client_id = v_project.client_id AND status = 'active'
  ORDER BY created_at, id
  LIMIT 1;
  IF v_relationship IS NULL THEN
    RAISE EXCEPTION 'request_substitution_approval: project % has no active client to ask', v_project.id
      USING ERRCODE = 'check_violation';
  END IF;

  -- 00718 (C1): the line's open exception says why the client is asked. No
  -- date promises (R7).
  SELECT id, type INTO v_exception_id, v_exception
  FROM public.procurement_exceptions
  WHERE ffe_item_id = p_item_id AND type IN ('backorder', 'discontinued', 'price_change')
    AND status <> 'resolved'
  ORDER BY opened_at DESC, id DESC
  LIMIT 1;
  v_note := CASE v_exception
    WHEN 'price_change' THEN 'The price has changed'
    WHEN 'backorder' THEN 'On backorder with the maker'
    ELSE 'No longer available as specified' END;
  v_context := CASE v_exception
    WHEN 'price_change' THEN format('The price of %s has changed. Please choose one of the options below.', v_item.name)
    WHEN 'backorder' THEN format('%s is on backorder with the maker. Please choose one of the options below.', v_item.name)
    ELSE format('%s is no longer available as specified. Please choose one of the options below.', v_item.name) END;

  -- The original first, then each alternate at its client price.
  SELECT jsonb_build_array(jsonb_build_object(
           'name', v_item.name, 'designer_note', v_note,
           'quantity', COALESCE(v_item.quantity, 1), 'sort_order', 0))
         || COALESCE(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
           'name', alt.name, 'price', alt.unit_price_cents, 'quantity', COALESCE(alt.quantity, 1),
           'product_id', alt.product_id, 'sort_order', wanted.ord)) ORDER BY wanted.ord), '[]'::jsonb)
    INTO v_options
  FROM unnest(p_alternate_ids) WITH ORDINALITY AS wanted(id, ord)
  JOIN public.project_ffe_items AS alt ON alt.id = wanted.id;

  -- The existing rail: a draft the studio releases (publish_client_decision).
  v_decision := public.create_client_decision(
    v_decision_id,
    jsonb_build_object(
      'designer_client_id', v_relationship,
      'project_id', v_item.project_id,
      'title', format('A replacement for %s', v_item.name),
      'context', v_context,
      'decision_type', 'product',
      'decision_kind', 'choice',
      'coordination_kind', 'selection',
      'blocking_status', 'blocks_procurement',
      'blocks_kind', 'ffe',
      'status', 'draft'
    ),
    v_options,
    ARRAY[p_item_id]::uuid[],
    '{}'::uuid[]
  );

  UPDATE public.procurement_exceptions SET client_decision_id = v_decision.id, status = 'awaiting_client'
  WHERE id = v_exception_id;

  RETURN v_decision;
END;
$$;

COMMENT ON FUNCTION public.request_substitution_approval(uuid, uuid[]) IS
  'Composes a client_decisions draft through create_client_decision (00708, C-30): the original and each '
  'alternate line at its client price; blocks procurement on the line. The copy follows the line''s open '
  'exception: a price change, a backorder, else no longer available as specified (00718; no dates, R7). '
  'The studio releases it with publish_client_decision. Links that backorder / discontinued / '
  'price_change exception (awaiting_client). Gate: can_buy_for_project, then the rail''s '
  '_can_author_proposal.';

-- ─── D1. Claim a draft before it is sent ────────────────────────────────────

ALTER TABLE public.procurement_drafts DROP CONSTRAINT IF EXISTS procurement_drafts_status_ck;
ALTER TABLE public.procurement_drafts
  ADD CONSTRAINT procurement_drafts_status_ck
    CHECK (status IN ('awaiting_review', 'sending', 'sent', 'discarded'));

COMMENT ON COLUMN public.procurement_drafts.sent_by IS
  'The member who sent the draft; while status is sending (00718), the member who claimed it.';

CREATE OR REPLACE FUNCTION public.claim_procurement_draft_for_send(p_draft_id uuid)
RETURNS public.procurement_drafts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_uid   uuid := auth.uid();
  v_draft public.procurement_drafts%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'claim_procurement_draft_for_send: not authenticated' USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT * INTO v_draft FROM public.procurement_drafts WHERE id = p_draft_id FOR UPDATE;
  IF NOT FOUND OR NOT public._can_read_procurement_draft(v_draft) THEN
    RAISE EXCEPTION 'claim_procurement_draft_for_send: draft % not found or access denied', p_draft_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF v_draft.status <> 'awaiting_review' THEN
    RAISE EXCEPTION 'draft_not_awaiting_review: draft % is %', p_draft_id, v_draft.status
      USING ERRCODE = 'check_violation';
  END IF;
  UPDATE public.procurement_drafts SET status = 'sending', sent_by = v_uid
  WHERE id = p_draft_id
  RETURNING * INTO v_draft;
  RETURN v_draft;
END;
$$;

COMMENT ON FUNCTION public.claim_procurement_draft_for_send(uuid) IS
  'awaiting_review → sending as the caller (00718, D1), under the draft read predicate '
  '(can_buy_for_project / is_active_org_member); sent_by records the claimer. Refuses '
  'draft_not_awaiting_review (23514) otherwise. procurement-draft-send claims before it sends.';

REVOKE ALL ON FUNCTION public.claim_procurement_draft_for_send(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_procurement_draft_for_send(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.release_procurement_draft_claim(p_draft_id uuid)
RETURNS public.procurement_drafts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_uid   uuid := auth.uid();
  v_draft public.procurement_drafts%ROWTYPE;
BEGIN
  SELECT * INTO v_draft FROM public.procurement_drafts WHERE id = p_draft_id FOR UPDATE;
  -- Only the claimer (or the service path) puts a claim back.
  IF NOT FOUND OR (v_uid IS NOT NULL AND v_draft.sent_by IS DISTINCT FROM v_uid) THEN
    RAISE EXCEPTION 'release_procurement_draft_claim: draft % not found or access denied', p_draft_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF v_draft.status <> 'sending' THEN
    RAISE EXCEPTION 'release_procurement_draft_claim: draft % is %, not sending', p_draft_id, v_draft.status
      USING ERRCODE = 'check_violation';
  END IF;
  UPDATE public.procurement_drafts SET status = 'awaiting_review', sent_by = NULL
  WHERE id = p_draft_id
  RETURNING * INTO v_draft;
  RETURN v_draft;
END;
$$;

COMMENT ON FUNCTION public.release_procurement_draft_claim(uuid) IS
  'sending → awaiting_review when the email did not go (00718, D1). The claimer, or service_role.';

REVOKE ALL ON FUNCTION public.release_procurement_draft_claim(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.release_procurement_draft_claim(uuid) TO authenticated, service_role;

-- 00706 body: accepts only a claimed draft, sent by its claimer.
CREATE OR REPLACE FUNCTION public.mark_procurement_draft_sent(
  p_draft_id uuid,
  p_sent_by uuid,
  p_message_id text DEFAULT NULL
)
RETURNS public.procurement_drafts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_draft   public.procurement_drafts%ROWTYPE;
  v_project public.projects%ROWTYPE;
  v_org     uuid;
BEGIN
  SELECT * INTO v_draft FROM public.procurement_drafts WHERE id = p_draft_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'mark_procurement_draft_sent: draft % not found', p_draft_id USING ERRCODE = 'no_data_found';
  END IF;
  IF v_draft.status IN ('sent', 'discarded') THEN
    RAISE EXCEPTION 'mark_procurement_draft_sent: draft % is already %', p_draft_id, v_draft.status
      USING ERRCODE = 'check_violation';
  END IF;
  IF v_draft.status <> 'sending' THEN
    RAISE EXCEPTION 'mark_procurement_draft_sent: draft % is %; claim it for sending first', p_draft_id, v_draft.status
      USING ERRCODE = 'check_violation';
  END IF;
  IF v_draft.to_email IS NULL THEN
    RAISE EXCEPTION 'mark_procurement_draft_sent: draft % has no recipient', p_draft_id
      USING ERRCODE = 'check_violation';
  END IF;
  -- The sender is a member who can buy for the draft (can_buy_for_project's
  -- shape, evaluated for p_sent_by rather than auth.uid()) and, 00718 (D1),
  -- the member who claimed it.
  SELECT * INTO v_project FROM public.projects WHERE id = v_draft.project_id;
  v_org := COALESCE(v_project.studio_id, v_draft.organization_id);
  IF p_sent_by IS NULL OR v_draft.sent_by IS DISTINCT FROM p_sent_by OR NOT (
    p_sent_by = v_project.designer_id
    OR EXISTS (
      SELECT 1 FROM public.organization_members AS member
      JOIN public.organizations AS org ON org.id = member.organization_id
      WHERE member.organization_id = v_org AND member.user_id = p_sent_by
        AND member.status = 'active' AND member.role <> 'guest' AND org.status = 'active'
    )
  ) THEN
    RAISE EXCEPTION 'mark_procurement_draft_sent: % cannot send draft %', p_sent_by, p_draft_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  UPDATE public.procurement_drafts SET
    status = 'sent', sent_by = p_sent_by, sent_at = now(),
    message_id = NULLIF(btrim(COALESCE(p_message_id, '')), '')
  WHERE id = p_draft_id
  RETURNING * INTO v_draft;
  RETURN v_draft;
END;
$$;

COMMENT ON FUNCTION public.mark_procurement_draft_sent(uuid, uuid, text) IS
  'sending → sent (00706, C-28; 00718 D1): only a draft claimed by p_sent_by. service_role only: called '
  'by the procurement-draft-send edge function after the provider accepted the message.';
