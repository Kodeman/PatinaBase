-- ═══════════════════════════════════════════════════════════════════════════
-- 00707 — Quote capture: vendor_quotes + lines, requests linked to the job
--         (US-16 Phase 2, C-29; SQ-419)
-- ═══════════════════════════════════════════════════════════════════════════
-- d2 §M2. vendor_quote_requests (00162) is free text with no lines, and no
-- returned quote is ever recorded. A request now links to the job's lines, and
-- what came back is recorded in under a minute: the PDF, the quote ref,
-- valid-until, per-line unit trade and lead time, crating, a freight estimate,
-- terms. The studio enters it (R-PB8: no vendor write-in in v1).
--
-- ── WHAT THIS ADDS ──────────────────────────────────────────────────────────
-- vendor_quote_requests + ffe_item_ids uuid[] (default {}), due_on.
--   project_id already exists (00403). The table stays directly writable by
--   its existing policies; a trigger keeps ffe_item_ids inside project_id's
--   live lines and, when a signed-in caller names lines, project_id inside
--   the projects the caller can buy for. A request without lines behaves as
--   before.
-- vendor_quotes        organization_id, request_id (NULL: a quote can arrive
--                      unrequested), vendor_id, project_id, received_on,
--                      quote_ref, valid_until, crating_cents,
--                      freight_estimate_cents, payment_pattern, deposit_pct,
--                      document_path, recorded_by, superseded_by.
-- vendor_quote_lines   quote_id, ffe_item_id, unit_trade_cents, qty,
--                      lead_time_weeks, note, applied_at, applied_by.
-- procurement_notifications.subject_quote_id → vendor_quotes, for the
--   quote_expiring notice (00708's sweep).
-- Read: can_buy_for_project(project_id). No direct writes.
--
-- record_vendor_quote(p_request jsonb)
--   Keys: requestId, vendorId, projectId, receivedOn, quoteRef, validUntil,
--   cratingCents, freightEstimateCents, paymentPattern, depositPct,
--   documentPath, supersedesQuoteId, lines [{ffeItemId, unitTradeCents, qty,
--   leadTimeWeeks, note}]. A linked request supplies the vendor and project
--   and moves sent → responded. supersedesQuoteId stamps the older quote's
--   superseded_by (same project and vendor, not already superseded).
--
-- apply_vendor_quote_to_lines(p_quote_id, p_ffe_item_ids uuid[] DEFAULT NULL)
--   Writes the quoted unit trade onto the lines — trade only, through
--   set_project_ffe_line_commercials (00692); the client price is R1/R2 and
--   stays as it is. Atomic: every chosen line or none. Refused on a superseded
--   quote, on a line on a purchase order, and with change_order_required on a
--   line on a sent (or signed or executed) authorization (R8). R6 is open, so
--   valid_until is shown, never enforced.
--
-- Adds GRANT/REVOKE → supabase/seed/00-legacy-grants.sql regenerated.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 1. vendor_quote_requests: the job and its lines ────────────────────────

ALTER TABLE public.vendor_quote_requests
  ADD COLUMN IF NOT EXISTS project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS ffe_item_ids uuid[] NOT NULL DEFAULT '{}'::uuid[],
  ADD COLUMN IF NOT EXISTS due_on date;

ALTER TABLE public.vendor_quote_requests
  DROP CONSTRAINT IF EXISTS vendor_quote_requests_lines_need_project_ck;
ALTER TABLE public.vendor_quote_requests
  ADD CONSTRAINT vendor_quote_requests_lines_need_project_ck
  CHECK (cardinality(ffe_item_ids) = 0 OR project_id IS NOT NULL);

CREATE OR REPLACE FUNCTION public.guard_vendor_quote_request_lines()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  -- Only the new surface: naming lines needs the project's buying access.
  IF cardinality(NEW.ffe_item_ids) > 0 AND auth.uid() IS NOT NULL
     AND (TG_OP = 'INSERT' OR NEW.project_id IS DISTINCT FROM OLD.project_id
          OR NEW.ffe_item_ids IS DISTINCT FROM OLD.ffe_item_ids)
     AND NOT public.can_buy_for_project(NEW.project_id) THEN
    RAISE EXCEPTION 'vendor_quote_requests: project % not found or access denied', NEW.project_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF cardinality(NEW.ffe_item_ids) > 0 AND (
    cardinality(NEW.ffe_item_ids) > 200
    OR (SELECT count(DISTINCT id) FROM unnest(NEW.ffe_item_ids) AS id) <> cardinality(NEW.ffe_item_ids)
    OR EXISTS (
      SELECT 1 FROM unnest(NEW.ffe_item_ids) AS wanted(id)
      WHERE NOT EXISTS (
        SELECT 1 FROM public.project_ffe_items AS item
        WHERE item.id = wanted.id AND item.project_id = NEW.project_id AND item.removed_at IS NULL
      )
    )
  ) THEN
    RAISE EXCEPTION 'vendor_quote_requests: ffe_item_ids must be distinct live lines of the request''s project'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_vendor_quote_request_lines() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS guard_vendor_quote_request_lines_trg ON public.vendor_quote_requests;
CREATE TRIGGER guard_vendor_quote_request_lines_trg
  BEFORE INSERT OR UPDATE OF project_id, ffe_item_ids ON public.vendor_quote_requests
  FOR EACH ROW EXECUTE FUNCTION public.guard_vendor_quote_request_lines();

COMMENT ON COLUMN public.vendor_quote_requests.ffe_item_ids IS
  'The job''s lines this request asks about (00707, C-29): distinct, live, in project_id.';
COMMENT ON COLUMN public.vendor_quote_requests.due_on IS
  'When the studio wants the quote back (00707, C-29).';

-- ─── 2. vendor_quotes + vendor_quote_lines ──────────────────────────────────

CREATE TABLE IF NOT EXISTS public.vendor_quotes (
  id                     uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id        uuid        REFERENCES public.organizations(id),
  request_id             uuid        REFERENCES public.vendor_quote_requests(id) ON DELETE SET NULL,
  vendor_id              uuid        NOT NULL REFERENCES public.vendors(id),
  project_id             uuid        NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  received_on            date        NOT NULL,
  quote_ref              text,
  valid_until            date,
  crating_cents          integer,
  freight_estimate_cents integer,
  payment_pattern        public.purchase_order_payment_pattern,
  deposit_pct            numeric(5,2),
  document_path          text,
  recorded_by            uuid,
  superseded_by          uuid        REFERENCES public.vendor_quotes(id) ON DELETE SET NULL,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT vendor_quotes_money_ck
    CHECK ((crating_cents IS NULL OR crating_cents >= 0)
       AND (freight_estimate_cents IS NULL OR freight_estimate_cents >= 0)
       AND (deposit_pct IS NULL OR deposit_pct BETWEEN 0 AND 100)),
  CONSTRAINT vendor_quotes_text_ck
    CHECK ((quote_ref IS NULL OR char_length(quote_ref) <= 100)
       AND (document_path IS NULL OR char_length(document_path) <= 1024)),
  CONSTRAINT vendor_quotes_dates_ck
    CHECK (valid_until IS NULL OR valid_until >= received_on),
  CONSTRAINT vendor_quotes_not_self_ck
    CHECK (superseded_by IS NULL OR superseded_by <> id)
);

CREATE INDEX IF NOT EXISTS idx_vendor_quotes_project
  ON public.vendor_quotes (project_id, received_on DESC);
CREATE INDEX IF NOT EXISTS idx_vendor_quotes_live_valid_until
  ON public.vendor_quotes (valid_until)
  WHERE superseded_by IS NULL AND valid_until IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_vendor_quotes_request
  ON public.vendor_quotes (request_id) WHERE request_id IS NOT NULL;

DROP TRIGGER IF EXISTS set_updated_at_vendor_quotes ON public.vendor_quotes;
CREATE TRIGGER set_updated_at_vendor_quotes
  BEFORE UPDATE ON public.vendor_quotes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.vendor_quote_lines (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id         uuid        NOT NULL REFERENCES public.vendor_quotes(id) ON DELETE CASCADE,
  ffe_item_id      uuid        NOT NULL REFERENCES public.project_ffe_items(id) ON DELETE CASCADE,
  unit_trade_cents integer     NOT NULL,
  qty              integer,
  lead_time_weeks  integer,
  note             text,
  applied_at       timestamptz,
  applied_by       uuid,
  created_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT vendor_quote_lines_one_per_line UNIQUE (quote_id, ffe_item_id),
  CONSTRAINT vendor_quote_lines_values_ck
    CHECK (unit_trade_cents >= 0
       AND (qty IS NULL OR qty >= 1)
       AND (lead_time_weeks IS NULL OR lead_time_weeks BETWEEN 0 AND 260)
       AND (note IS NULL OR char_length(note) <= 1000))
);

CREATE INDEX IF NOT EXISTS idx_vendor_quote_lines_item ON public.vendor_quote_lines (ffe_item_id);

ALTER TABLE public.vendor_quotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vendor_quote_lines ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS vendor_quotes_studio_select ON public.vendor_quotes;
CREATE POLICY vendor_quotes_studio_select ON public.vendor_quotes
  FOR SELECT TO authenticated
  USING (public.can_buy_for_project(project_id));

DROP POLICY IF EXISTS vendor_quote_lines_studio_select ON public.vendor_quote_lines;
CREATE POLICY vendor_quote_lines_studio_select ON public.vendor_quote_lines
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.vendor_quotes AS quote
    WHERE quote.id = vendor_quote_lines.quote_id AND public.can_buy_for_project(quote.project_id)
  ));

REVOKE ALL ON TABLE public.vendor_quotes FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.vendor_quotes TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.vendor_quotes TO service_role;

REVOKE ALL ON TABLE public.vendor_quote_lines FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.vendor_quote_lines TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.vendor_quote_lines TO service_role;

-- ─── 3. procurement_notifications.subject_quote_id ──────────────────────────

ALTER TABLE public.procurement_notifications
  ADD COLUMN IF NOT EXISTS subject_quote_id uuid REFERENCES public.vendor_quotes(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_procurement_notifications_quote_kind
  ON public.procurement_notifications (subject_quote_id, kind)
  WHERE subject_quote_id IS NOT NULL;

-- ─── 4. record_vendor_quote ─────────────────────────────────────────────────

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
    IF NOT FOUND OR NOT public.is_studio_comember(v_request.designer_id) THEN
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
  'linked request supplies vendor and project and moves sent → responded; supersedesQuoteId marks '
  'the older quote. Gate: can_buy_for_project.';

REVOKE ALL ON FUNCTION public.record_vendor_quote(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_vendor_quote(jsonb) TO authenticated;

-- ─── 5. apply_vendor_quote_to_lines ─────────────────────────────────────────

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

COMMENT ON FUNCTION public.apply_vendor_quote_to_lines(uuid, uuid[]) IS
  'Writes a quote''s unit trade onto its lines through set_project_ffe_line_commercials (00707, C-29): '
  'trade only, atomic. Refused on a superseded quote, on a line on a PO, and with '
  'change_order_required on a line on a sent, signed or executed authorization (R8). Gate: '
  'can_buy_for_project.';

REVOKE ALL ON FUNCTION public.apply_vendor_quote_to_lines(uuid, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.apply_vendor_quote_to_lines(uuid, uuid[]) TO authenticated;
