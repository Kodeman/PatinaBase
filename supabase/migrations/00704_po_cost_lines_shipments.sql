-- ═══════════════════════════════════════════════════════════════════════════
-- 00704 — PO cost lines and shipments (US-16 Phase 2, C-26; SQ-418)
-- ═══════════════════════════════════════════════════════════════════════════
-- d2 §M6. The studio PO carries total_cents only: no freight, crating,
-- receiving or storage, and no record of a shipment. useUpdatePurchaseOrderStatus
-- has no callers, so nothing records "shipped" from the shipment itself.
--
-- ── WHAT THIS ADDS ──────────────────────────────────────────────────────────
-- po_cost_lines
--   Freight, crating, liftgate, residential surcharge, white-glove,
--   receiving, storage, handling, restocking (or other) on a PO, as an
--   estimate then an actual. The payee may be a different party than the
--   vendor (the carrier, the receiver): payee_vendor_id or payee_contact_id,
--   never both. billable_to_client defaults to true; billing_rule defaults to
--   at_cost (R-PB7; whether cost_plus is shown is the R1 ruling);
--   invoice_line_id is stamped by the billing path. Written by
--   upsert_po_cost_line (create, or patch the keys present); a billed line is
--   fixed. Allowed after send: actual freight arrives after the paper.
--
-- po_shipments + po_shipment_lines
--   A shipment: mode (parcel | ltl | white_glove | studio_pickup), carrier,
--   tracking (PRO or tracking number), BOL document, shipped_on, delivered_on,
--   current_eta with eta_history (00698's {eta, note, at, by} shape), and
--   inspection_closes_at. Its lines say which pieces and how many travelled,
--   so a PO can ship in parts: the quantity across a PO's shipments never
--   exceeds the line's quantity.
--
-- record_po_shipment(p_po_id, p_request jsonb, p_local_date)
--   Records or patches a shipment. A recorded shipment is shipped (shipped_on
--   defaults to deliveredOn, else the studio's day) and advances a confirmed
--   or in-production PO to 'shipped' by calling advance_purchase_order_status
--   (00698): the same gate, the same 00184 cascade, the same po_payments
--   re-dating. The PO's shipped_on takes the first shipment's date. Partial
--   shipments advance the whole PO, as the spec says; the 00184 cascade then
--   marks every linked line 'shipped' and po_shipment_lines keeps which pieces
--   actually travelled. A draft or cancelled PO is refused; a delivered PO
--   keeps its status. Delivered is not set on the PO here (receiving records
--   it, 00698). deliveredOn sets inspection_closes_at = deliveredOn + the
--   studio vendor account's claims window from procurement_claim_deadline
--   (00700, R-PB9 default 3 days); NULL when that has no answer.
--
-- delivery_events (00150) — the Week's data
--   event_date reads the next undelivered shipment's current_eta when present,
--   falling back to confirmed_eta; current_eta and confirmed_eta are appended
--   as columns. Also fixed while redefining it: the view ran as its owner
--   (postgres, BYPASSRLS) and anon held SELECT, so any anon caller read every
--   studio's deliveries. It is now security_invoker (each base table's RLS
--   applies to the caller) and anon loses access. resolve_field_link (00283)
--   is SECURITY DEFINER and keeps reading it as its owner.
--
-- Adds GRANT/REVOKE → supabase/seed/00-legacy-grants.sql regenerated.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 1. po_cost_lines ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.po_cost_lines (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   uuid        REFERENCES public.organizations(id),
  purchase_order_id uuid        NOT NULL REFERENCES public.purchase_orders(id) ON DELETE CASCADE,
  kind              text        NOT NULL,
  payee_vendor_id   uuid        REFERENCES public.vendors(id) ON DELETE SET NULL,
  payee_contact_id  uuid        REFERENCES public.studio_contacts(id) ON DELETE SET NULL,
  estimate_cents    integer,
  actual_cents      integer,
  billable_to_client boolean    NOT NULL DEFAULT true,
  billing_rule      text        NOT NULL DEFAULT 'at_cost',
  invoice_line_id   uuid        REFERENCES public.invoice_line_items(id) ON DELETE SET NULL,
  note              text,
  created_by        uuid,
  updated_by        uuid,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT po_cost_lines_kind_ck CHECK (kind IN (
    'freight', 'crating', 'liftgate', 'residential', 'white_glove', 'receiving',
    'storage', 'handling', 'restocking', 'other')),
  CONSTRAINT po_cost_lines_one_payee_ck
    CHECK (payee_vendor_id IS NULL OR payee_contact_id IS NULL),
  CONSTRAINT po_cost_lines_money_ck
    CHECK ((estimate_cents IS NULL OR estimate_cents >= 0) AND (actual_cents IS NULL OR actual_cents >= 0)),
  CONSTRAINT po_cost_lines_billing_rule_ck CHECK (billing_rule IN ('at_cost', 'cost_plus')),
  CONSTRAINT po_cost_lines_note_ck CHECK (note IS NULL OR char_length(note) <= 1000)
);

CREATE INDEX IF NOT EXISTS idx_po_cost_lines_po
  ON public.po_cost_lines (purchase_order_id, created_at);

DROP TRIGGER IF EXISTS set_updated_at_po_cost_lines ON public.po_cost_lines;
CREATE TRIGGER set_updated_at_po_cost_lines
  BEFORE UPDATE ON public.po_cost_lines
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

COMMENT ON TABLE public.po_cost_lines IS
  'Freight, crating, receiving, storage and other costs on a PO, estimate then actual, payable to the '
  'vendor or another party (00704, C-26, d2 §M6). Read: can_send_purchase_order. Written only through '
  'upsert_po_cost_line.';
COMMENT ON COLUMN public.po_cost_lines.billing_rule IS
  'at_cost (default, R-PB7) | cost_plus. Whether the client ever sees a cost-plus add-on is the R1 ruling.';

ALTER TABLE public.po_cost_lines ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS po_cost_lines_studio_select ON public.po_cost_lines;
CREATE POLICY po_cost_lines_studio_select ON public.po_cost_lines
  FOR SELECT TO authenticated
  USING (public.can_send_purchase_order(purchase_order_id));

REVOKE ALL ON TABLE public.po_cost_lines FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.po_cost_lines TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.po_cost_lines TO service_role;

-- ─── 2. po_shipments + po_shipment_lines ────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.po_shipments (
  id                   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id      uuid        REFERENCES public.organizations(id),
  purchase_order_id    uuid        NOT NULL REFERENCES public.purchase_orders(id) ON DELETE CASCADE,
  mode                 text,
  carrier              text,
  tracking             text,
  bol_document_path    text,
  shipped_on           date        NOT NULL,
  delivered_on         date,
  current_eta          date,
  eta_history          jsonb       NOT NULL DEFAULT '[]'::jsonb,
  -- The deadline day for written notice to the vendor (delivered_on + the
  -- account's claims window); a date like procurement_claim_deadline's.
  inspection_closes_at date,
  created_by           uuid,
  updated_by           uuid,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT po_shipments_mode_ck
    CHECK (mode IS NULL OR mode IN ('parcel', 'ltl', 'white_glove', 'studio_pickup')),
  CONSTRAINT po_shipments_text_ck
    CHECK ((carrier IS NULL OR char_length(carrier) <= 120)
       AND (tracking IS NULL OR char_length(tracking) <= 200)
       AND (bol_document_path IS NULL OR char_length(bol_document_path) <= 1024)),
  CONSTRAINT po_shipments_dates_ck
    CHECK (delivered_on IS NULL OR delivered_on >= shipped_on),
  CONSTRAINT po_shipments_eta_history_ck CHECK (jsonb_typeof(eta_history) = 'array')
);

CREATE INDEX IF NOT EXISTS idx_po_shipments_po
  ON public.po_shipments (purchase_order_id, shipped_on);
CREATE INDEX IF NOT EXISTS idx_po_shipments_open_eta
  ON public.po_shipments (purchase_order_id, current_eta)
  WHERE delivered_on IS NULL AND current_eta IS NOT NULL;

DROP TRIGGER IF EXISTS set_updated_at_po_shipments ON public.po_shipments;
CREATE TRIGGER set_updated_at_po_shipments
  BEFORE UPDATE ON public.po_shipments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

COMMENT ON TABLE public.po_shipments IS
  'A shipment on a studio PO (00704, C-26, d2 §M6): mode, carrier, tracking, BOL, shipped/delivered '
  'days, current ETA with history, inspection clock. Read: can_send_purchase_order. Written only '
  'through record_po_shipment, which advances the PO to shipped.';

CREATE TABLE IF NOT EXISTS public.po_shipment_lines (
  shipment_id uuid    NOT NULL REFERENCES public.po_shipments(id) ON DELETE CASCADE,
  ffe_item_id uuid    NOT NULL REFERENCES public.project_ffe_items(id) ON DELETE CASCADE,
  qty         integer NOT NULL,
  PRIMARY KEY (shipment_id, ffe_item_id),
  CONSTRAINT po_shipment_lines_qty_ck CHECK (qty > 0)
);

CREATE INDEX IF NOT EXISTS idx_po_shipment_lines_item
  ON public.po_shipment_lines (ffe_item_id);

COMMENT ON TABLE public.po_shipment_lines IS
  'Which pieces, and how many, travelled on a shipment (00704, C-26): partial shipments. Read through '
  'the shipment''s PO (can_send_purchase_order). Written only through record_po_shipment.';

ALTER TABLE public.po_shipments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.po_shipment_lines ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS po_shipments_studio_select ON public.po_shipments;
CREATE POLICY po_shipments_studio_select ON public.po_shipments
  FOR SELECT TO authenticated
  USING (public.can_send_purchase_order(purchase_order_id));

DROP POLICY IF EXISTS po_shipment_lines_studio_select ON public.po_shipment_lines;
CREATE POLICY po_shipment_lines_studio_select ON public.po_shipment_lines
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.po_shipments shipment
     WHERE shipment.id = po_shipment_lines.shipment_id
       AND public.can_send_purchase_order(shipment.purchase_order_id)
  ));

REVOKE ALL ON TABLE public.po_shipments FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.po_shipment_lines FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.po_shipments TO authenticated;
GRANT SELECT ON TABLE public.po_shipment_lines TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.po_shipments TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.po_shipment_lines TO service_role;

-- ─── 3. upsert_po_cost_line ─────────────────────────────────────────────────
-- p_request (camelCase): id?, kind, payeeVendorId, payeeContactId,
-- estimateCents, actualCents, billableToClient, billingRule, note. Without id
-- it creates (kind required); with id it patches the keys present (JSON null
-- clears; billableToClient and billingRule fall back to their defaults).

CREATE OR REPLACE FUNCTION public.upsert_po_cost_line(p_po_id uuid, p_request jsonb)
RETURNS public.po_cost_lines
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_req jsonb := COALESCE(p_request, '{}'::jsonb);
  v_keys constant text[] := ARRAY['id', 'kind', 'payeeVendorId', 'payeeContactId', 'estimateCents',
    'actualCents', 'billableToClient', 'billingRule', 'note'];
  v_po public.purchase_orders%ROWTYPE;
  v_row public.po_cost_lines%ROWTYPE;
  v_studio uuid;
  v_id uuid;
  v_vendor_id uuid;
  v_contact_id uuid;
  v_kind text := NULLIF(btrim(COALESCE(v_req->>'kind', '')), '');
  v_rule text := COALESCE(NULLIF(btrim(COALESCE(v_req->>'billingRule', '')), ''), 'at_cost');
  v_note text := NULLIF(btrim(COALESCE(v_req->>'note', '')), '');
  v_estimate numeric;
  v_actual numeric;
  v_key text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'upsert_po_cost_line: not authenticated' USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT * INTO v_po FROM public.purchase_orders WHERE id = p_po_id FOR UPDATE;
  IF NOT FOUND OR NOT public.can_send_purchase_order(p_po_id) THEN
    RAISE EXCEPTION 'upsert_po_cost_line: purchase order % not found or access denied', p_po_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF jsonb_typeof(v_req) <> 'object' THEN
    RAISE EXCEPTION 'upsert_po_cost_line: request must be an object' USING ERRCODE = 'check_violation';
  END IF;
  IF (v_req - v_keys) <> '{}'::jsonb THEN
    RAISE EXCEPTION 'upsert_po_cost_line: unknown keys %',
      (SELECT string_agg(key, ', ') FROM jsonb_object_keys(v_req - v_keys) AS key)
      USING ERRCODE = 'check_violation';
  END IF;
  FOR v_key IN SELECT key FROM jsonb_object_keys(v_req) AS key LOOP
    IF jsonb_typeof(v_req->v_key) <> 'null' AND jsonb_typeof(v_req->v_key) <> (CASE
         WHEN v_key IN ('estimateCents', 'actualCents') THEN 'number'
         WHEN v_key = 'billableToClient' THEN 'boolean'
         ELSE 'string' END) THEN
      RAISE EXCEPTION 'upsert_po_cost_line: % has the wrong type', v_key
        USING ERRCODE = 'check_violation';
    END IF;
  END LOOP;
  IF v_po.status = 'cancelled' THEN
    RAISE EXCEPTION 'upsert_po_cost_line: purchase order % is cancelled', p_po_id
      USING ERRCODE = 'check_violation';
  END IF;
  v_estimate := (v_req->>'estimateCents')::numeric;
  v_actual := (v_req->>'actualCents')::numeric;

  BEGIN
    v_id := NULLIF(btrim(COALESCE(v_req->>'id', '')), '')::uuid;
    v_vendor_id := NULLIF(btrim(COALESCE(v_req->>'payeeVendorId', '')), '')::uuid;
    v_contact_id := NULLIF(btrim(COALESCE(v_req->>'payeeContactId', '')), '')::uuid;
  EXCEPTION WHEN invalid_text_representation THEN
    RAISE EXCEPTION 'upsert_po_cost_line: id, payeeVendorId and payeeContactId must be ids'
      USING ERRCODE = 'check_violation';
  END;

  IF v_id IS NOT NULL THEN
    SELECT * INTO v_row FROM public.po_cost_lines
     WHERE id = v_id AND purchase_order_id = p_po_id FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'upsert_po_cost_line: cost line % is not on purchase order %', v_id, p_po_id
        USING ERRCODE = 'check_violation';
    END IF;
    IF v_row.invoice_line_id IS NOT NULL THEN
      RAISE EXCEPTION 'upsert_po_cost_line: cost line % was billed to the client; it is fixed', v_id
        USING ERRCODE = 'check_violation';
    END IF;
    IF NOT (v_req ? 'kind') THEN
      v_kind := v_row.kind;
    END IF;
  END IF;

  IF v_kind IS NULL OR v_kind NOT IN ('freight', 'crating', 'liftgate', 'residential', 'white_glove',
                                      'receiving', 'storage', 'handling', 'restocking', 'other') THEN
    RAISE EXCEPTION 'upsert_po_cost_line: kind must be freight, crating, liftgate, residential, white_glove, receiving, storage, handling, restocking or other'
      USING ERRCODE = 'check_violation';
  END IF;
  IF (v_estimate IS NOT NULL AND (v_estimate < 0 OR v_estimate <> trunc(v_estimate) OR v_estimate > 2147483647))
     OR (v_actual IS NOT NULL AND (v_actual < 0 OR v_actual <> trunc(v_actual) OR v_actual > 2147483647)) THEN
    RAISE EXCEPTION 'upsert_po_cost_line: estimateCents and actualCents are whole, non-negative cents'
      USING ERRCODE = 'check_violation';
  END IF;
  IF v_rule NOT IN ('at_cost', 'cost_plus') THEN
    RAISE EXCEPTION 'upsert_po_cost_line: billingRule must be at_cost or cost_plus'
      USING ERRCODE = 'check_violation';
  END IF;
  IF char_length(v_note) > 1000 THEN
    RAISE EXCEPTION 'upsert_po_cost_line: note is longer than 1000 characters'
      USING ERRCODE = 'check_violation';
  END IF;

  v_studio := public.purchase_order_studio_id(p_po_id);
  IF v_vendor_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.vendors WHERE id = v_vendor_id) THEN
    RAISE EXCEPTION 'upsert_po_cost_line: vendor % not found', v_vendor_id
      USING ERRCODE = 'check_violation';
  END IF;
  IF v_contact_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.studio_contacts
     WHERE id = v_contact_id AND v_studio IS NOT NULL AND organization_id = v_studio
  ) THEN
    RAISE EXCEPTION 'upsert_po_cost_line: payeeContactId must be a card in this studio''s rolodex'
      USING ERRCODE = 'check_violation';
  END IF;

  IF v_id IS NULL THEN
    IF v_vendor_id IS NOT NULL AND v_contact_id IS NOT NULL THEN
      RAISE EXCEPTION 'upsert_po_cost_line: a cost line has one payee: payeeVendorId or payeeContactId'
        USING ERRCODE = 'check_violation';
    END IF;
    INSERT INTO public.po_cost_lines (
      organization_id, purchase_order_id, kind, payee_vendor_id, payee_contact_id,
      estimate_cents, actual_cents, billable_to_client, billing_rule, note, created_by, updated_by
    ) VALUES (
      v_studio, p_po_id, v_kind, v_vendor_id, v_contact_id,
      v_estimate::integer, v_actual::integer,
      COALESCE((v_req->>'billableToClient')::boolean, true), v_rule, v_note, v_uid, v_uid
    )
    RETURNING * INTO v_row;
  ELSE
    IF (CASE WHEN v_req ? 'payeeVendorId' THEN v_vendor_id ELSE v_row.payee_vendor_id END) IS NOT NULL
       AND (CASE WHEN v_req ? 'payeeContactId' THEN v_contact_id ELSE v_row.payee_contact_id END) IS NOT NULL THEN
      RAISE EXCEPTION 'upsert_po_cost_line: a cost line has one payee: payeeVendorId or payeeContactId'
        USING ERRCODE = 'check_violation';
    END IF;
    UPDATE public.po_cost_lines SET
      kind = v_kind,
      payee_vendor_id = CASE WHEN v_req ? 'payeeVendorId' THEN v_vendor_id ELSE payee_vendor_id END,
      payee_contact_id = CASE WHEN v_req ? 'payeeContactId' THEN v_contact_id ELSE payee_contact_id END,
      estimate_cents = CASE WHEN v_req ? 'estimateCents' THEN v_estimate::integer ELSE estimate_cents END,
      actual_cents = CASE WHEN v_req ? 'actualCents' THEN v_actual::integer ELSE actual_cents END,
      billable_to_client = CASE WHEN v_req ? 'billableToClient'
        THEN COALESCE((v_req->>'billableToClient')::boolean, true) ELSE billable_to_client END,
      billing_rule = CASE WHEN v_req ? 'billingRule' THEN v_rule ELSE billing_rule END,
      note = CASE WHEN v_req ? 'note' THEN v_note ELSE note END,
      updated_by = v_uid
    WHERE id = v_id
    RETURNING * INTO v_row;
  END IF;
  RETURN v_row;
END;
$$;

COMMENT ON FUNCTION public.upsert_po_cost_line(uuid, jsonb) IS
  'Creates or patches a PO cost line (00704, C-26): kind, payee (vendor or rolodex card, never both), '
  'estimate and actual cents, billable_to_client (default true), billing_rule (default at_cost, R-PB7), '
  'note. Refused on a cancelled PO and on a billed line. Gate: can_send_purchase_order.';

REVOKE ALL ON FUNCTION public.upsert_po_cost_line(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.upsert_po_cost_line(uuid, jsonb) TO authenticated;

-- ─── 4. record_po_shipment ──────────────────────────────────────────────────
-- p_request (camelCase): id?, mode, carrier, tracking, bolDocumentPath,
-- shippedOn, deliveredOn, currentEta, etaNote, lines [{ffeItemId, qty}].
-- Without id it records a new shipment; with id it patches the keys present
-- (lines, when present, replace the shipment's lines). p_local_date is the
-- studio's day, as advance_purchase_order_status takes it.

CREATE OR REPLACE FUNCTION public.record_po_shipment(
  p_po_id uuid, p_request jsonb, p_local_date date DEFAULT NULL
)
RETURNS public.po_shipments
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_req jsonb := COALESCE(p_request, '{}'::jsonb);
  v_keys constant text[] := ARRAY['id', 'mode', 'carrier', 'tracking', 'bolDocumentPath', 'shippedOn',
    'deliveredOn', 'currentEta', 'etaNote', 'lines'];
  v_utc_day date := (now() AT TIME ZONE 'UTC')::date;
  v_day date := COALESCE(p_local_date, v_utc_day);
  v_po public.purchase_orders%ROWTYPE;
  v_row public.po_shipments%ROWTYPE;
  v_id uuid;
  v_mode text := NULLIF(btrim(COALESCE(v_req->>'mode', '')), '');
  v_carrier text := NULLIF(btrim(COALESCE(v_req->>'carrier', '')), '');
  v_tracking text := NULLIF(btrim(COALESCE(v_req->>'tracking', '')), '');
  v_bol text := NULLIF(btrim(COALESCE(v_req->>'bolDocumentPath', '')), '');
  v_eta_note text := NULLIF(btrim(COALESCE(v_req->>'etaNote', '')), '');
  v_shipped date;
  v_delivered date;
  v_eta date;
  v_claims_days integer;
  v_lines jsonb;
  v_bad text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'record_po_shipment: not authenticated' USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT * INTO v_po FROM public.purchase_orders WHERE id = p_po_id FOR UPDATE;
  IF NOT FOUND OR NOT public.can_send_purchase_order(p_po_id) THEN
    RAISE EXCEPTION 'record_po_shipment: purchase order % not found or access denied', p_po_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF v_day NOT BETWEEN v_utc_day - 1 AND v_utc_day + 1 THEN
    RAISE EXCEPTION 'record_po_shipment: local date % is more than a day from today (UTC %)', v_day, v_utc_day
      USING ERRCODE = 'check_violation';
  END IF;
  IF jsonb_typeof(v_req) <> 'object' THEN
    RAISE EXCEPTION 'record_po_shipment: request must be an object' USING ERRCODE = 'check_violation';
  END IF;
  IF (v_req - v_keys) <> '{}'::jsonb THEN
    RAISE EXCEPTION 'record_po_shipment: unknown keys %',
      (SELECT string_agg(key, ', ') FROM jsonb_object_keys(v_req - v_keys) AS key)
      USING ERRCODE = 'check_violation';
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_each(v_req - 'lines') AS entry
    WHERE jsonb_typeof(entry.value) NOT IN ('string', 'null')
  ) OR jsonb_typeof(COALESCE(v_req->'lines', 'null'::jsonb)) NOT IN ('array', 'null') THEN
    RAISE EXCEPTION 'record_po_shipment: lines must be an array; every other value a string or null'
      USING ERRCODE = 'check_violation';
  END IF;
  IF v_po.status IN ('draft', 'cancelled') THEN
    RAISE EXCEPTION 'record_po_shipment: purchase order % is %; a shipment is recorded once the vendor confirmed', p_po_id, v_po.status
      USING ERRCODE = 'check_violation';
  END IF;

  BEGIN
    v_id := NULLIF(btrim(COALESCE(v_req->>'id', '')), '')::uuid;
  EXCEPTION WHEN invalid_text_representation THEN
    RAISE EXCEPTION 'record_po_shipment: id must be an id' USING ERRCODE = 'check_violation';
  END;
  BEGIN
    v_shipped := NULLIF(btrim(COALESCE(v_req->>'shippedOn', '')), '')::date;
    v_delivered := NULLIF(btrim(COALESCE(v_req->>'deliveredOn', '')), '')::date;
    v_eta := NULLIF(btrim(COALESCE(v_req->>'currentEta', '')), '')::date;
  EXCEPTION WHEN invalid_datetime_format OR datetime_field_overflow THEN
    RAISE EXCEPTION 'record_po_shipment: shippedOn, deliveredOn and currentEta must be dates (YYYY-MM-DD)'
      USING ERRCODE = 'check_violation';
  END;

  IF v_mode IS NOT NULL AND v_mode NOT IN ('parcel', 'ltl', 'white_glove', 'studio_pickup') THEN
    RAISE EXCEPTION 'record_po_shipment: mode must be parcel, ltl, white_glove or studio_pickup'
      USING ERRCODE = 'check_violation';
  END IF;
  IF char_length(v_carrier) > 120 OR char_length(v_tracking) > 200 OR char_length(v_bol) > 1024
     OR char_length(v_eta_note) > 500 THEN
    RAISE EXCEPTION 'record_po_shipment: carrier is at most 120 characters, tracking 200, bolDocumentPath 1024, etaNote 500'
      USING ERRCODE = 'check_violation';
  END IF;

  IF v_id IS NOT NULL THEN
    SELECT * INTO v_row FROM public.po_shipments
     WHERE id = v_id AND purchase_order_id = p_po_id FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'record_po_shipment: shipment % is not on purchase order %', v_id, p_po_id
        USING ERRCODE = 'check_violation';
    END IF;
    IF v_req ? 'shippedOn' AND v_shipped IS NULL THEN
      RAISE EXCEPTION 'record_po_shipment: a recorded shipment keeps its ship date'
        USING ERRCODE = 'check_violation';
    END IF;
    v_shipped := CASE WHEN v_req ? 'shippedOn' THEN v_shipped ELSE v_row.shipped_on END;
    v_delivered := CASE WHEN v_req ? 'deliveredOn' THEN v_delivered ELSE v_row.delivered_on END;
  ELSE
    v_shipped := COALESCE(v_shipped, v_delivered, v_day);
  END IF;
  IF v_shipped > v_utc_day + 1 OR v_delivered > v_utc_day + 1 THEN
    RAISE EXCEPTION 'record_po_shipment: shippedOn and deliveredOn cannot be in the future'
      USING ERRCODE = 'check_violation';
  END IF;
  IF v_delivered < v_shipped THEN
    RAISE EXCEPTION 'record_po_shipment: deliveredOn % is before shippedOn %', v_delivered, v_shipped
      USING ERRCODE = 'check_violation';
  END IF;

  -- Lines: pieces on this PO; across the PO's shipments a line never ships
  -- more than its quantity.
  IF v_req ? 'lines' THEN
    v_lines := COALESCE(v_req->'lines', '[]'::jsonb);
    IF EXISTS (
      SELECT 1 FROM jsonb_array_elements(v_lines) AS element
      WHERE jsonb_typeof(element) <> 'object'
         OR (element - ARRAY['ffeItemId', 'qty']) <> '{}'::jsonb
         OR jsonb_typeof(element->'ffeItemId') IS DISTINCT FROM 'string'
         OR (element->>'ffeItemId') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
         OR jsonb_typeof(element->'qty') IS DISTINCT FROM 'number'
         OR (element->>'qty')::numeric <= 0
         OR (element->>'qty')::numeric <> trunc((element->>'qty')::numeric)
         OR (element->>'qty')::numeric > 100000
    ) THEN
      RAISE EXCEPTION 'record_po_shipment: each line is {ffeItemId, qty} with a positive whole qty'
        USING ERRCODE = 'check_violation';
    END IF;
    IF (SELECT count(*) <> count(DISTINCT element->>'ffeItemId') FROM jsonb_array_elements(v_lines) AS element) THEN
      RAISE EXCEPTION 'record_po_shipment: a line appears twice'
        USING ERRCODE = 'check_violation';
    END IF;
    PERFORM 1 FROM public.project_ffe_items
     WHERE purchase_order_id = p_po_id ORDER BY id FOR UPDATE;
    IF EXISTS (
      SELECT 1 FROM jsonb_array_elements(v_lines) AS element
      WHERE NOT EXISTS (
        SELECT 1 FROM public.project_ffe_items item
         WHERE item.id = (element->>'ffeItemId')::uuid AND item.purchase_order_id = p_po_id
      )
    ) THEN
      RAISE EXCEPTION 'record_po_shipment: every line must be a piece on purchase order %', p_po_id
        USING ERRCODE = 'check_violation';
    END IF;
    SELECT string_agg(format('%s (%s of %s)', item.name, shipped.total, COALESCE(item.quantity, 1)), ', ')
      INTO v_bad
      FROM (
        SELECT (element->>'ffeItemId')::uuid AS ffe_item_id, (element->>'qty')::integer AS qty
          FROM jsonb_array_elements(v_lines) AS element
      ) wanted
      JOIN public.project_ffe_items item ON item.id = wanted.ffe_item_id
      CROSS JOIN LATERAL (
        SELECT wanted.qty + COALESCE(sum(line.qty), 0) AS total
          FROM public.po_shipment_lines line
          JOIN public.po_shipments shipment ON shipment.id = line.shipment_id
         WHERE line.ffe_item_id = wanted.ffe_item_id
           AND shipment.purchase_order_id = p_po_id
           AND shipment.id IS DISTINCT FROM v_id
      ) shipped
     WHERE shipped.total > COALESCE(item.quantity, 1);
    IF v_bad IS NOT NULL THEN
      RAISE EXCEPTION 'record_po_shipment: more pieces than ordered would ship: %', v_bad
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  IF v_delivered IS NOT NULL THEN
    SELECT deadline.claims_window_days INTO v_claims_days
      FROM public.procurement_claim_deadline(p_po_id) AS deadline;
  END IF;

  IF v_id IS NULL THEN
    INSERT INTO public.po_shipments (
      organization_id, purchase_order_id, mode, carrier, tracking, bol_document_path,
      shipped_on, delivered_on, current_eta, eta_history, inspection_closes_at, created_by, updated_by
    ) VALUES (
      public.purchase_order_studio_id(p_po_id), p_po_id, v_mode, v_carrier, v_tracking, v_bol,
      v_shipped, v_delivered, v_eta,
      CASE WHEN v_eta IS NULL THEN '[]'::jsonb ELSE jsonb_build_array(jsonb_build_object(
        'eta', v_eta, 'note', v_eta_note, 'at', now(), 'by', v_uid)) END,
      v_delivered + v_claims_days, v_uid, v_uid
    )
    RETURNING * INTO v_row;
  ELSE
    UPDATE public.po_shipments SET
      mode = CASE WHEN v_req ? 'mode' THEN v_mode ELSE mode END,
      carrier = CASE WHEN v_req ? 'carrier' THEN v_carrier ELSE carrier END,
      tracking = CASE WHEN v_req ? 'tracking' THEN v_tracking ELSE tracking END,
      bol_document_path = CASE WHEN v_req ? 'bolDocumentPath' THEN v_bol ELSE bol_document_path END,
      shipped_on = v_shipped,
      delivered_on = v_delivered,
      inspection_closes_at = CASE WHEN v_req ? 'deliveredOn' THEN v_delivered + v_claims_days
                                  ELSE inspection_closes_at END,
      current_eta = CASE WHEN v_req ? 'currentEta' THEN v_eta ELSE current_eta END,
      eta_history = CASE
        WHEN v_req ? 'currentEta' AND v_eta IS DISTINCT FROM current_eta THEN
          eta_history || jsonb_build_array(jsonb_build_object(
            'eta', v_eta, 'note', v_eta_note, 'at', now(), 'by', v_uid))
        ELSE eta_history END,
      updated_by = v_uid
    WHERE id = v_id
    RETURNING * INTO v_row;
  END IF;

  IF v_req ? 'lines' THEN
    DELETE FROM public.po_shipment_lines WHERE shipment_id = v_row.id;
    INSERT INTO public.po_shipment_lines (shipment_id, ffe_item_id, qty)
    SELECT v_row.id, (element->>'ffeItemId')::uuid, (element->>'qty')::integer
      FROM jsonb_array_elements(v_lines) AS element;
  END IF;

  -- Shipped: the PO moves through advance_purchase_order_status (same gate,
  -- same 00184 cascade, same po_payments re-dating). The first shipment's
  -- date becomes the PO's ship date.
  IF v_po.status IN ('confirmed', 'in_production') THEN
    IF v_po.shipped_on IS NULL THEN
      PERFORM set_config('app.ffe_mutation_rpc', 'on', true);
      UPDATE public.purchase_orders SET shipped_on = v_row.shipped_on WHERE id = p_po_id;
    END IF;
    PERFORM public.advance_purchase_order_status(p_po_id, 'shipped', NULL, v_day);
  END IF;

  RETURN v_row;
END;
$$;

COMMENT ON FUNCTION public.record_po_shipment(uuid, jsonb, date) IS
  'Records or patches a PO shipment (00704, C-26). Advances a confirmed or in-production PO to '
  'shipped through advance_purchase_order_status; partial shipments carry per-line quantities that '
  'never exceed the line. deliveredOn sets inspection_closes_at from procurement_claim_deadline''s '
  'claims window. Refused on draft and cancelled POs. Gate: can_send_purchase_order.';

REVOKE ALL ON FUNCTION public.record_po_shipment(uuid, jsonb, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_po_shipment(uuid, jsonb, date) TO authenticated;

-- ─── 5. delivery_events: current_eta, then confirmed_eta (the Week) ─────────
-- 00150 body, columns kept in order; event_date reads the next undelivered
-- shipment's current_eta first; current_eta and confirmed_eta appended.

CREATE OR REPLACE VIEW public.delivery_events
  WITH (security_invoker = true) AS
SELECT
  po.id                                         AS event_id,
  po.project_id,
  p.name                                        AS project_name,
  po.id                                         AS purchase_order_id,
  po.vendor_id,
  v.name                                        AS vendor_name,
  COALESCE(next_shipment.current_eta, po.confirmed_eta) AS event_date,
  'delivery_expected'::text                     AS event_type,
  po.status                                     AS po_status,
  po.delivered_date,
  count(fi.id)                                  AS ffe_item_count,
  sum(fi.line_total_cents)                      AS line_total_cents,
  latest_inspection.id                          AS inspection_id,
  latest_inspection.outcome                     AS inspection_outcome,
  NULL::text                                    AS phase_key,
  next_shipment.current_eta                     AS current_eta,
  po.confirmed_eta                              AS confirmed_eta
FROM public.purchase_orders po
JOIN public.projects p ON p.id = po.project_id
JOIN public.vendors v ON v.id = po.vendor_id
LEFT JOIN public.project_ffe_items fi ON fi.purchase_order_id = po.id
LEFT JOIN LATERAL (
  SELECT min(shipment.current_eta) AS current_eta
    FROM public.po_shipments shipment
   WHERE shipment.purchase_order_id = po.id
     AND shipment.delivered_on IS NULL
     AND shipment.current_eta IS NOT NULL
) next_shipment ON true
LEFT JOIN LATERAL (
  SELECT ri.id, ri.outcome
    FROM public.receiving_inspections ri
   WHERE ri.purchase_order_id = po.id
   ORDER BY ri.inspected_at DESC
   LIMIT 1
) latest_inspection ON true
WHERE COALESCE(next_shipment.current_eta, po.confirmed_eta) IS NOT NULL
  AND po.status <> 'cancelled'
GROUP BY po.id, p.id, p.name, v.id, v.name, next_shipment.current_eta,
         latest_inspection.id, latest_inspection.outcome

UNION ALL

SELECT
  ph.id                       AS event_id,
  ph.project_id,
  p.name                      AS project_name,
  NULL::uuid                  AS purchase_order_id,
  NULL::uuid                  AS vendor_id,
  NULL::text                  AS vendor_name,
  ph.target_end_date          AS event_date,
  'install_milestone'::text   AS event_type,
  NULL::text                  AS po_status,
  NULL::date                  AS delivered_date,
  NULL::bigint                AS ffe_item_count,
  NULL::bigint                AS line_total_cents,
  NULL::uuid                  AS inspection_id,
  NULL::public.receiving_inspection_outcome AS inspection_outcome,
  ph.phase_key,
  NULL::date                  AS current_eta,
  NULL::date                  AS confirmed_eta
FROM public.project_phases ph
JOIN public.projects p ON p.id = ph.project_id
WHERE ph.phase_key ILIKE '%install%'
  AND ph.target_end_date IS NOT NULL
  AND ph.status <> 'completed';

COMMENT ON VIEW public.delivery_events IS
  'Unified delivery calendar (00150; 00704): PO deliveries dated by the next undelivered shipment''s '
  'current_eta, else confirmed_eta (both exposed), plus install milestones. security_invoker since '
  '00704: each base table''s RLS applies to the caller.';

REVOKE ALL ON TABLE public.delivery_events FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.delivery_events TO authenticated, service_role;
