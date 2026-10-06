-- ═══════════════════════════════════════════════════════════════════════════
-- 00705 — The acknowledgment check: po_acknowledgments + po_ack_lines
--         (US-16 Phase 2, C-27; SQ-419)
-- ═══════════════════════════════════════════════════════════════════════════
-- d2 §M3. Today log_po_acknowledgment (00451) records a vendor PO number and an
-- ETA and stamps acknowledged_at; nothing compares the ack to the PO, so a bad
-- ack is accepted by silence. An ack becomes a document, received once or
-- several times, checked line by line against the PO. The check is
-- deterministic and studio-entered: the form pre-fills every PO value and the
-- buyer enters only what the vendor wrote differently. No extraction in v1.
--
-- ── WHAT THIS ADDS ──────────────────────────────────────────────────────────
-- po_acknowledgments   one row per ack received: received_on / received_via,
--                      the vendor's order ref, the PDF, the ship date, freight
--                      and deposit the vendor quoted. supersedes_ack_id chains
--                      a newer ack to the one before it; the head of the chain
--                      is the latest ack.
-- po_ack_lines         one row per compared field: ffe_item_id (NULL for
--                      header fields), field, po_value, ack_value, verdict
--                      match | mismatch | accepted | disputed | vendor_corrected.
-- purchase_orders.ack_state  none | clean | discrepancy | resolved, derived by
--                      trigger from the latest ack (po_ack_state_for):
--                      no ack → none; any mismatch or disputed line →
--                      discrepancy; any accepted or vendor_corrected line →
--                      resolved; else clean. acknowledged_at stays as it is.
-- ffe_line_authorization_state(item)  internal R8 helper: the strongest live
--                      authorization state the line sits on (executed >
--                      client_signed > sent), else NULL. Joined both ways
--                      (furnishing_authorization_items.source_ffe_item_id and
--                      project_ffe_items.source_authorization_item_id).
--
-- log_po_acknowledgment_v2(p_po_id, p_ack jsonb, p_lines jsonb)
--   Gate can_send_purchase_order; v1's rules (no needs_repricing, status
--   draft..delivered). p_ack keys: receivedOn, receivedVia, vendorOrderRef,
--   documentPath, shipDate, freightCents, depositRequestedCents, confirmedEta.
--   p_lines: [{ffeItemId, field, ackValue, note}] for unit_price, qty, sku,
--   finish, fabric, dimensions, other (ship date and freight come from the
--   header). The PO value and the verdict are computed here, never sent: PO
--   values are the fields po-send prints (trade price, quantity, spec sku /
--   finish / color_fabric / selected_dimensions, product sku / finish as the
--   fallback). Stamps acknowledged_at, draft → confirmed and vendor_po_number
--   as v1 does; confirmedEta goes through set_purchase_order_eta (00698
--   history). Lines of the previous ack that the new ack no longer disputes
--   become vendor_corrected. Any mismatch opens (or re-points) the PO's one
--   open ack_discrepancy exception (00708) and composes a reply draft
--   (compose_ack_discrepancy_draft, 00706); a clean ack resolves it.
--   v1 log_po_acknowledgment is untouched and keeps working.
--
-- resolve_ack_line(p_line_id, p_verdict, p_note)
--   accepted | disputed | vendor_corrected, on an open line (mismatch or
--   disputed) of the latest ack. accepted writes the vendor's value through
--   the existing paths:
--     unit_price  line trade_price_cents (+ markup, the 00692 formula) and the
--                 PO total re-derived from its lines. Refused with
--                 change_order_required when the line sits on a sent, signed or
--                 executed authorization (R8) or a vendor payment is already
--                 recorded (the schedule then changes through a change order,
--                 update_po_payment_schedule's rule); refused on the Patina
--                 catalog lane. po_payments are left to the schedule editor.
--     qty         always change_order_required: quantity moves through the PO
--                 change order.
--     sku, finish, fabric  project_ffe_specs (sku / finish / color_fabric); a
--                 locked configuration refuses (00403 guard).
--     freight     upsert_po_cost_line (00704): the latest unbilled freight
--                 line's estimate, else a new freight line.
--     ship_date, dimensions, other  recorded; the ack is the record.
--   disputed leaves the exception awaiting_vendor; when no open line remains
--   on the latest ack the exception is resolved.
--
-- Forward references (plpgsql resolves them at run time; all four migrations
-- land together): procurement_exceptions (00708), compose_ack_discrepancy_draft
-- (00706).
--
-- Adds GRANT/REVOKE → supabase/seed/00-legacy-grants.sql regenerated.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 1. R8 helper ───────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.ffe_line_authorization_state(p_item_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT proposal.commercial_state
  FROM public.project_ffe_items AS item
  JOIN public.furnishing_authorization_items AS auth_item
    ON auth_item.source_ffe_item_id = item.id
    OR auth_item.id = item.source_authorization_item_id
  JOIN public.project_commercial_documents AS document ON document.id = auth_item.commercial_document_id
  JOIN public.proposals AS proposal ON proposal.id = document.proposal_id
  WHERE item.id = p_item_id
    AND proposal.commercial_state IN ('sent', 'client_signed', 'executed')
  ORDER BY CASE proposal.commercial_state
             WHEN 'executed' THEN 1 WHEN 'client_signed' THEN 2 ELSE 3 END
  LIMIT 1;
$$;

COMMENT ON FUNCTION public.ffe_line_authorization_state(uuid) IS
  'R8 (00705): the strongest live authorization state a line sits on — executed, client_signed or '
  'sent — else NULL. A line is editable until it is on a sent authorization; after that a price '
  'change is change_order_required. Internal: called by definer RPCs only.';

REVOKE ALL ON FUNCTION public.ffe_line_authorization_state(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ffe_line_authorization_state(uuid) TO service_role;

-- ─── 2. Tables ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.po_acknowledgments (
  id                          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id             uuid        REFERENCES public.organizations(id),
  purchase_order_id           uuid        NOT NULL REFERENCES public.purchase_orders(id) ON DELETE CASCADE,
  received_on                 date        NOT NULL,
  received_via                text        NOT NULL DEFAULT 'email',
  vendor_order_ref            text,
  document_path               text,
  ack_ship_date               date,
  ack_freight_cents           integer,
  ack_deposit_requested_cents integer,
  recorded_by                 uuid,
  supersedes_ack_id           uuid        REFERENCES public.po_acknowledgments(id) ON DELETE SET NULL,
  created_at                  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT po_acknowledgments_via_ck
    CHECK (received_via IN ('email', 'portal', 'phone', 'pdf')),
  CONSTRAINT po_acknowledgments_text_ck
    CHECK ((vendor_order_ref IS NULL OR char_length(vendor_order_ref) <= 100)
       AND (document_path IS NULL OR char_length(document_path) <= 1024)),
  CONSTRAINT po_acknowledgments_money_ck
    CHECK ((ack_freight_cents IS NULL OR ack_freight_cents >= 0)
       AND (ack_deposit_requested_cents IS NULL OR ack_deposit_requested_cents >= 0))
);

-- An ack is superseded once: the chain has one head.
CREATE UNIQUE INDEX IF NOT EXISTS po_acknowledgments_supersedes_once
  ON public.po_acknowledgments (supersedes_ack_id)
  WHERE supersedes_ack_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_po_acknowledgments_po
  ON public.po_acknowledgments (purchase_order_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.po_ack_lines (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  ack_id       uuid        NOT NULL REFERENCES public.po_acknowledgments(id) ON DELETE CASCADE,
  ffe_item_id  uuid        REFERENCES public.project_ffe_items(id) ON DELETE SET NULL,
  field        text        NOT NULL,
  po_value     text,
  ack_value    text,
  verdict      text        NOT NULL,
  resolved_by  uuid,
  resolved_at  timestamptz,
  note         text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT po_ack_lines_field_ck
    CHECK (field IN ('unit_price', 'qty', 'sku', 'finish', 'fabric', 'dimensions',
                     'ship_date', 'freight', 'other')),
  CONSTRAINT po_ack_lines_verdict_ck
    CHECK (verdict IN ('match', 'mismatch', 'accepted', 'disputed', 'vendor_corrected')),
  CONSTRAINT po_ack_lines_resolved_ck
    CHECK ((verdict IN ('match', 'mismatch')) = (resolved_at IS NULL)),
  CONSTRAINT po_ack_lines_text_ck
    CHECK ((po_value IS NULL OR char_length(po_value) <= 2000)
       AND (ack_value IS NULL OR char_length(ack_value) <= 500)
       AND (note IS NULL OR char_length(note) <= 1000))
);

CREATE UNIQUE INDEX IF NOT EXISTS po_ack_lines_one_per_field
  ON public.po_ack_lines (ack_id, field, COALESCE(ffe_item_id, '00000000-0000-0000-0000-000000000000'::uuid))
  WHERE field <> 'other';
CREATE INDEX IF NOT EXISTS idx_po_ack_lines_ack ON public.po_ack_lines (ack_id);
CREATE INDEX IF NOT EXISTS idx_po_ack_lines_item
  ON public.po_ack_lines (ffe_item_id) WHERE ffe_item_id IS NOT NULL;

-- ─── 3. purchase_orders.ack_state ───────────────────────────────────────────

ALTER TABLE public.purchase_orders
  ADD COLUMN IF NOT EXISTS ack_state text NOT NULL DEFAULT 'none';

ALTER TABLE public.purchase_orders
  DROP CONSTRAINT IF EXISTS purchase_orders_ack_state_ck;
ALTER TABLE public.purchase_orders
  ADD CONSTRAINT purchase_orders_ack_state_ck
  CHECK (ack_state IN ('none', 'clean', 'discrepancy', 'resolved'));

COMMENT ON COLUMN public.purchase_orders.ack_state IS
  'none | clean | discrepancy | resolved (00705, C-27), derived by trigger from the latest '
  'po_acknowledgments row (po_ack_state_for). acknowledged_at is unchanged and still set by v1.';

CREATE OR REPLACE FUNCTION public.po_ack_state_for(p_po_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SET search_path TO 'public', 'pg_temp'
AS $$
  WITH head AS (
    SELECT ack.id
    FROM public.po_acknowledgments AS ack
    WHERE ack.purchase_order_id = p_po_id
      AND NOT EXISTS (
        SELECT 1 FROM public.po_acknowledgments AS newer WHERE newer.supersedes_ack_id = ack.id
      )
    ORDER BY ack.created_at DESC, ack.id DESC
    LIMIT 1
  )
  SELECT CASE
    WHEN NOT EXISTS (SELECT 1 FROM head) THEN 'none'
    WHEN EXISTS (SELECT 1 FROM public.po_ack_lines AS line JOIN head ON head.id = line.ack_id
                 WHERE line.verdict IN ('mismatch', 'disputed')) THEN 'discrepancy'
    WHEN EXISTS (SELECT 1 FROM public.po_ack_lines AS line JOIN head ON head.id = line.ack_id
                 WHERE line.verdict IN ('accepted', 'vendor_corrected')) THEN 'resolved'
    ELSE 'clean'
  END;
$$;

REVOKE ALL ON FUNCTION public.po_ack_state_for(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.po_ack_state_for(uuid) TO service_role;

-- SECURITY DEFINER: the PO is RPC-only (guard_purchase_order_rpc_mutation
-- passes the definer's role).
CREATE OR REPLACE FUNCTION public.po_ack_state_sync()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_po uuid;
  v_state text;
BEGIN
  IF TG_TABLE_NAME = 'po_acknowledgments' THEN
    v_po := COALESCE(NEW.purchase_order_id, OLD.purchase_order_id);
  ELSE
    SELECT purchase_order_id INTO v_po
    FROM public.po_acknowledgments WHERE id = COALESCE(NEW.ack_id, OLD.ack_id);
  END IF;
  IF v_po IS NULL THEN
    RETURN NULL;
  END IF;
  v_state := public.po_ack_state_for(v_po);
  UPDATE public.purchase_orders SET ack_state = v_state
  WHERE id = v_po AND ack_state IS DISTINCT FROM v_state;
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.po_ack_state_sync() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS po_acknowledgments_ack_state_sync ON public.po_acknowledgments;
CREATE TRIGGER po_acknowledgments_ack_state_sync
  AFTER INSERT OR DELETE OR UPDATE OF supersedes_ack_id ON public.po_acknowledgments
  FOR EACH ROW EXECUTE FUNCTION public.po_ack_state_sync();

DROP TRIGGER IF EXISTS po_ack_lines_ack_state_sync ON public.po_ack_lines;
CREATE TRIGGER po_ack_lines_ack_state_sync
  AFTER INSERT OR DELETE OR UPDATE OF verdict ON public.po_ack_lines
  FOR EACH ROW EXECUTE FUNCTION public.po_ack_state_sync();

-- ─── 4. RLS and grants ──────────────────────────────────────────────────────

ALTER TABLE public.po_acknowledgments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.po_ack_lines ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS po_acknowledgments_studio_select ON public.po_acknowledgments;
CREATE POLICY po_acknowledgments_studio_select ON public.po_acknowledgments
  FOR SELECT TO authenticated
  USING (public.can_send_purchase_order(purchase_order_id));

DROP POLICY IF EXISTS po_ack_lines_studio_select ON public.po_ack_lines;
CREATE POLICY po_ack_lines_studio_select ON public.po_ack_lines
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.po_acknowledgments AS ack
    WHERE ack.id = po_ack_lines.ack_id
      AND public.can_send_purchase_order(ack.purchase_order_id)
  ));

REVOKE ALL ON TABLE public.po_acknowledgments FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.po_acknowledgments TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.po_acknowledgments TO service_role;

REVOKE ALL ON TABLE public.po_ack_lines FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.po_ack_lines TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.po_ack_lines TO service_role;

-- ─── 5. log_po_acknowledgment_v2 ────────────────────────────────────────────

-- Comparison form for free text: trimmed, single-spaced, case-folded.
CREATE OR REPLACE FUNCTION public._po_ack_norm(p_value text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT NULLIF(lower(btrim(regexp_replace(COALESCE(p_value, ''), '\s+', ' ', 'g'))), '');
$$;

REVOKE ALL ON FUNCTION public._po_ack_norm(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._po_ack_norm(text) TO service_role;

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
  '(log_po_acknowledgment, unchanged). Gate: can_send_purchase_order.';

REVOKE ALL ON FUNCTION public.log_po_acknowledgment_v2(uuid, jsonb, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.log_po_acknowledgment_v2(uuid, jsonb, jsonb) TO authenticated;

-- ─── 6. resolve_ack_line ────────────────────────────────────────────────────

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
      IF EXISTS (SELECT 1 FROM public.vendor_payments WHERE purchase_order_id = v_po.id AND voided_at IS NULL) THEN
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
      PERFORM public.upsert_po_cost_line(v_po.id, CASE
        WHEN v_freight IS NULL THEN jsonb_build_object(
          'kind', 'freight', 'estimateCents', v_line.ack_value::integer,
          'payeeVendorId', v_po.vendor_id::text, 'note', 'From the vendor acknowledgment')
        ELSE jsonb_build_object('id', v_freight::text, 'estimateCents', v_line.ack_value::integer)
      END);
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
  'value through (trade price + PO total, spec sku/finish/fabric, freight cost line); qty and any '
  'price change on an authorized or paid line refuse with change_order_required (R8). disputed '
  'leaves the exception awaiting_vendor; no open line left resolves it. Gate: can_send_purchase_order.';

REVOKE ALL ON FUNCTION public.resolve_ack_line(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.resolve_ack_line(uuid, text, text) TO authenticated;
