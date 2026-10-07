-- ═══════════════════════════════════════════════════════════════════════════
-- 00721 — Studio-scope stragglers (US-17 T5, G9; SQ-453)
-- ═══════════════════════════════════════════════════════════════════════════
-- 00717 moved _ffe_require_studio_project onto can_buy_for_project (00702):
-- with projects.studio_id set, the owner or an active non-guest member of
-- that studio; otherwise a non-guest active co-member of the owner. Three
-- places still asked is_studio_comember(owner) and ignored studio_id:
--
-- P1  The studio legs of project_rooms, project_ffe_items, project_phases and
--     project_payment_milestones (00316:148-166). Recreated with the same
--     names, command and roles; only the co-member predicate changes. The
--     owner ("Designers manage their project …") and client read policies
--     are separate and untouched. The predicate calls can_buy_for_project on
--     the row's project_id directly rather than inside an EXISTS over
--     projects: that EXISTS would run under projects' own RLS
--     (projects_studio_select is still is_studio_comember), which hides a
--     studio project from a studio member who is not the owner's co-member.
--     can_buy_for_project is SECURITY DEFINER and false for a NULL or missing
--     project, so rows with no project still degrade to the owner policy.
-- P2  log_po_acknowledgment (v1, 00718 body) gates on can_send_purchase_order,
--     as log_po_acknowledgment_v2 does.
-- P3  record_vendor_quote (00718 body): a request on a project is decided by
--     can_buy_for_project alone. A request with no project has no project to
--     ask, so it keeps the co-member check on its requester.
--
-- Each redefined function is its live head's body, verbatim, with only the
-- change named here. CREATE OR REPLACE keeps every existing ACL; no grants
-- change.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── P1. projects-parented studio legs ──────────────────────────────────────

DROP POLICY IF EXISTS "project_rooms_studio_rw" ON public.project_rooms;
CREATE POLICY "project_rooms_studio_rw" ON public.project_rooms
  FOR ALL TO authenticated
  USING (public.can_buy_for_project(project_rooms.project_id))
  WITH CHECK (public.can_buy_for_project(project_rooms.project_id));

DROP POLICY IF EXISTS "project_ffe_items_studio_rw" ON public.project_ffe_items;
CREATE POLICY "project_ffe_items_studio_rw" ON public.project_ffe_items
  FOR ALL TO authenticated
  USING (public.can_buy_for_project(project_ffe_items.project_id))
  WITH CHECK (public.can_buy_for_project(project_ffe_items.project_id));

DROP POLICY IF EXISTS "project_phases_studio_rw" ON public.project_phases;
CREATE POLICY "project_phases_studio_rw" ON public.project_phases
  FOR ALL TO authenticated
  USING (public.can_buy_for_project(project_phases.project_id))
  WITH CHECK (public.can_buy_for_project(project_phases.project_id));

DROP POLICY IF EXISTS "project_payment_milestones_studio_rw" ON public.project_payment_milestones;
CREATE POLICY "project_payment_milestones_studio_rw" ON public.project_payment_milestones
  FOR ALL TO authenticated
  USING (public.can_buy_for_project(project_payment_milestones.project_id))
  WITH CHECK (public.can_buy_for_project(project_payment_milestones.project_id));

-- ─── P2. log_po_acknowledgment (v1, 00718 body) ─────────────────────────────

CREATE OR REPLACE FUNCTION public.log_po_acknowledgment(
  p_po_id uuid, p_vendor_po_number text DEFAULT NULL, p_confirmed_eta date DEFAULT NULL
)
RETURNS public.purchase_orders
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $$
DECLARE v_po public.purchase_orders%ROWTYPE;
BEGIN
  SELECT * INTO v_po FROM public.purchase_orders WHERE id = p_po_id FOR UPDATE;
  -- 00721 (P2): the PO's project's studio decides, as in _v2.
  IF NOT FOUND OR NOT public.can_send_purchase_order(v_po.id) THEN
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

-- ─── P3. record_vendor_quote (00718 body) ───────────────────────────────────

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
    -- 00721 (P3): can_buy_for_project alone decides a request on a project;
    -- a request with no project keeps the co-member check on its requester.
    IF NOT FOUND
       OR (v_request.project_id IS NOT NULL AND NOT public.can_buy_for_project(v_request.project_id))
       OR (v_request.project_id IS NULL AND NOT public.is_studio_comember(v_request.designer_id)) THEN
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
  'linked request supplies vendor and project and moves sent → responded; a request on a project needs '
  'can_buy_for_project there and nothing else (00721), and a request with no project needs a co-member '
  'of its requester and links only to a project its requester could buy for (00718). supersedesQuoteId '
  'marks the older quote. Gate: can_buy_for_project.';
