-- ═══════════════════════════════════════════════════════════════════════════
-- 00353 — Back of House: the RPC family + status/queue/client views
--
-- Every mutation flows through a SECURITY DEFINER RPC that (1) SETs the writer
-- GUC to 'rpc', (2) validates, (3) mutates, (4) writes a fulfillment_events row
-- via fulfillment_log_event (before/after + duration_ms, §11), then is locked
-- down (REVOKE public/anon/authenticated, GRANT service_role). Only
-- fulfillment_intake_order is exercised in S0; the rest exist so downstream
-- slices bind to stable signatures. settle_po is a stub (S6); resolve_exception's
-- preview is a placeholder (T5 postings are S6/S7 — do NOT build them here).
--
-- Views: fulfillment_order_status_v + fulfillment_queue_v are security_invoker
-- (base RLS admin/agent_reader-gated). client_order_status_v is a DEFINER view
-- owned by postgres (own-row auth.uid() scope; client-safe columns only) — see
-- its COMMENT; do NOT convert it to invoker.
--
-- ⚠ C1 FIX AMENDMENT (2026-07-17, in-place — unshipped to prod, boh/* branch
-- only, sanctioned escape hatch per patina-parallel-work): fulfillment_confirm
-- _split's side_mark computation changed from `upper(client_name)` to a
-- SURNAME-only mark (R3.5) — see the function body for the parsing rule.
-- Mirrored in @patina/fulfillment/format.ts#formatSideMark; the anti-drift
-- golden in format.test.ts was re-pinned against a live re-run.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 0. Event logging helper ───────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fulfillment_log_event(
  p_event_type text, p_actor text,
  p_order_id uuid, p_po_id uuid, p_order_item_id uuid, p_shipment_id uuid, p_exception_id uuid,
  p_refs jsonb, p_before jsonb, p_after jsonb, p_started timestamptz
) RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_id bigint;
BEGIN
  INSERT INTO public.fulfillment_events(
    event_type, actor, order_id, po_id, order_item_id, shipment_id, exception_id,
    refs, payload, duration_ms)
  VALUES (
    p_event_type, COALESCE(p_actor,'system'), p_order_id, p_po_id, p_order_item_id, p_shipment_id, p_exception_id,
    COALESCE(p_refs,'{}'::jsonb),
    jsonb_build_object('before', p_before, 'after', p_after),
    CASE WHEN p_started IS NULL THEN NULL
         ELSE (EXTRACT(EPOCH FROM (clock_timestamp() - p_started)) * 1000)::int END)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION public.fulfillment_log_event(text,text,uuid,uuid,uuid,uuid,uuid,jsonb,jsonb,jsonb,timestamptz)
  FROM public, anon, authenticated, service_role;

-- ─── 1. fulfillment_intake_order — S0-critical (idempotent; snapshots; T1) ──
CREATE OR REPLACE FUNCTION public.fulfillment_intake_order(p_payload jsonb, p_actor text)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_started  timestamptz := clock_timestamp();
  v_pi       text := p_payload#>>'{payment_intent,id}';
  v_existing uuid;
  v_order    public.fulfillment_orders;
  v_line     jsonb;
  v_idx      int := 0;
  v_prod     public.products;
  v_map      text;
  v_vendor   uuid;
  v_cost     int;
  v_name     text;
  v_evt      bigint;
  v_actor    text := COALESCE(p_actor, 'seed');
BEGIN
  PERFORM set_config('app.fulfillment_writer','rpc',true);

  IF v_pi IS NOT NULL THEN
    SELECT id INTO v_existing FROM public.fulfillment_orders WHERE stripe_payment_intent_id = v_pi;
    IF v_existing IS NOT NULL THEN RETURN v_existing; END IF;   -- idempotent: write nothing
  END IF;

  INSERT INTO public.fulfillment_orders (
    stripe_payment_intent_id, client_name, client_email, ship_to,
    client_profile_id, designer_client_id, designer_profile_id, designer_attribution,
    captured_total_cents, product_subtotal_cents, freight_charged_cents, tax_cents
  ) VALUES (
    v_pi,
    COALESCE(p_payload#>>'{client,name}', 'Unknown Client'),
    p_payload#>>'{client,email}',
    p_payload->'ship_to',
    NULLIF(p_payload#>>'{client,profile_id}','')::uuid,
    NULLIF(p_payload#>>'{designer,designer_client_id}','')::uuid,
    NULLIF(p_payload#>>'{designer,profile_id}','')::uuid,
    p_payload->'designer',
    (p_payload#>>'{totals,captured_total_cents}')::int,
    (p_payload#>>'{totals,product_subtotal_cents}')::int,
    (p_payload#>>'{totals,freight_charged_cents}')::int,
    (p_payload#>>'{totals,tax_cents}')::int
  )
  ON CONFLICT (stripe_payment_intent_id) DO NOTHING
  RETURNING * INTO v_order;

  IF v_order.id IS NULL THEN   -- lost a concurrent race on the same PI
    SELECT id INTO v_existing FROM public.fulfillment_orders WHERE stripe_payment_intent_id = v_pi;
    RETURN v_existing;
  END IF;

  FOR v_line IN SELECT * FROM jsonb_array_elements(COALESCE(p_payload->'lines','[]'::jsonb)) LOOP
    v_idx := v_idx + 1;
    v_prod := NULL; v_map := 'unmapped'; v_vendor := NULL; v_cost := NULL;
    IF (v_line->>'product_id') IS NOT NULL THEN
      SELECT * INTO v_prod FROM public.products WHERE id = (v_line->>'product_id')::uuid;
    END IF;
    IF v_prod.id IS NOT NULL AND v_prod.vendor_id IS NOT NULL AND v_prod.price_trade IS NOT NULL THEN
      v_map := 'mapped'; v_vendor := v_prod.vendor_id; v_cost := v_prod.price_trade;
    END IF;
    v_name := COALESCE(v_line->>'item_name', v_prod.name, 'Item');
    INSERT INTO public.fulfillment_order_items (
      order_id, product_id, item_name, vendor_sku, qty,
      unit_price_cents, unit_cost_cents, vendor_id, mapping_state, line_state, line_index
    ) VALUES (
      v_order.id, v_prod.id, v_name, v_line->>'vendor_sku',
      COALESCE((v_line->>'qty')::int, 1),
      (v_line->>'unit_price_cents')::int, v_cost, v_vendor, v_map, 'intake', v_idx
    );
  END LOOP;

  -- order.intake FIRST so ledger_entries.source_event_id has a row to reference.
  v_evt := public.fulfillment_log_event(
    'order.intake', v_actor, v_order.id, NULL, NULL, NULL, NULL,
    jsonb_build_object('stripe_payment_intent_id', v_pi, 'lines', v_idx),
    NULL, to_jsonb(v_order), v_started);

  PERFORM public.ledger_post_t1_capture(v_order.id, v_evt, v_actor);   -- T1 (only S0 template)

  PERFORM public.fulfillment_log_event('ledger.posted', v_actor, v_order.id, NULL, NULL, NULL, NULL,
    jsonb_build_object('template','T1','source_event_id',v_evt), NULL, NULL, v_started);

  RETURN v_order.id;
END;
$$;
REVOKE ALL ON FUNCTION public.fulfillment_intake_order(jsonb, text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fulfillment_intake_order(jsonb, text) TO service_role;

-- ─── 2. fulfillment_assign_line_vendor ─────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fulfillment_assign_line_vendor(
  p_item_id uuid, p_vendor_id uuid, p_unit_cost_cents int, p_actor text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_started timestamptz := clock_timestamp(); v_order uuid;
BEGIN
  PERFORM set_config('app.fulfillment_writer','rpc',true);
  UPDATE public.fulfillment_order_items
     SET vendor_id = p_vendor_id, unit_cost_cents = p_unit_cost_cents, mapping_state = 'mapped'
   WHERE id = p_item_id
  RETURNING order_id INTO v_order;
  IF v_order IS NULL THEN RAISE EXCEPTION 'fulfillment_assign_line_vendor: item % not found', p_item_id; END IF;
  PERFORM public.fulfillment_log_event('line.vendor_assigned', p_actor, v_order, NULL, p_item_id, NULL, NULL,
    jsonb_build_object('vendor_id', p_vendor_id, 'unit_cost_cents', p_unit_cost_cents), NULL, NULL, v_started);
END;
$$;
REVOKE ALL ON FUNCTION public.fulfillment_assign_line_vendor(uuid,uuid,int,text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fulfillment_assign_line_vendor(uuid,uuid,int,text) TO service_role;

-- ─── 3. fulfillment_move_line (pre-confirm reshuffle; full drag in S2) ──────
CREATE OR REPLACE FUNCTION public.fulfillment_move_line(p_item_id uuid, p_po_id uuid, p_actor text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_started timestamptz := clock_timestamp(); v_order uuid;
BEGIN
  PERFORM set_config('app.fulfillment_writer','rpc',true);
  UPDATE public.fulfillment_vendor_po_lines SET po_id = p_po_id WHERE order_item_id = p_item_id;
  SELECT order_id INTO v_order FROM public.fulfillment_order_items WHERE id = p_item_id;
  PERFORM public.fulfillment_log_event('line.moved', p_actor, v_order, p_po_id, p_item_id, NULL, NULL,
    jsonb_build_object('to_po', p_po_id), NULL, NULL, v_started);
END;
$$;
REVOKE ALL ON FUNCTION public.fulfillment_move_line(uuid,uuid,text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fulfillment_move_line(uuid,uuid,text) TO service_role;

-- ─── 4. fulfillment_confirm_split ──────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fulfillment_confirm_split(p_order_id uuid, p_actor text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_started timestamptz := clock_timestamp();
  o public.fulfillment_orders;
  v_unmapped int;
  v_vendor uuid;
  v_idx int := 0;
  v_po uuid;
  v_po_number text;
  v_side_mark text;
  v_name_parts text[];
  r record;
  v_po_line uuid;
BEGIN
  PERFORM set_config('app.fulfillment_writer','rpc',true);
  SELECT * INTO o FROM public.fulfillment_orders WHERE id = p_order_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'fulfillment_confirm_split: order % not found', p_order_id; END IF;

  SELECT count(*) INTO v_unmapped FROM public.fulfillment_order_items
   WHERE order_id = p_order_id AND mapping_state = 'unmapped' AND line_state <> 'cancelled';
  IF v_unmapped > 0 THEN
    RAISE EXCEPTION 'fulfillment_confirm_split: % unmapped line(s) block confirm', v_unmapped;
  END IF;

  -- side_mark = SURNAME-{order_no} (R3.5, C1 fix — was upper(client_name)):
  -- the last whitespace-separated token of client_name when it has more than
  -- one token, else the full (single-token) name unchanged. Mirrored
  -- byte-for-byte in @patina/fulfillment/format.ts#formatSideMark — the
  -- format.test.ts golden pins this against a live confirm_split run.
  v_name_parts := regexp_split_to_array(btrim(o.client_name), '\s+');
  v_side_mark := upper(
    CASE WHEN array_length(v_name_parts, 1) > 1
         THEN v_name_parts[array_length(v_name_parts, 1)]
         ELSE btrim(o.client_name)
    END
  ) || '-' || o.order_no;

  FOR v_vendor IN
    SELECT DISTINCT vendor_id FROM public.fulfillment_order_items
     WHERE order_id = p_order_id AND line_state = 'intake' AND vendor_id IS NOT NULL
     ORDER BY vendor_id
  LOOP
    v_idx := v_idx + 1;
    v_po_number := 'PO-' || to_char(now(),'YYYY') || '-' || lpad(o.order_no::text, 5, '0') || '-' || chr(64 + v_idx);
    INSERT INTO public.fulfillment_vendor_pos (order_id, vendor_id, po_number, status, terms, side_mark, product_cost_cents)
    SELECT p_order_id, v_vendor, v_po_number, 'draft',
           (SELECT payment_terms FROM public.vendor_profiles WHERE vendor_id = v_vendor),
           v_side_mark,
           COALESCE(SUM(oi.qty * oi.unit_cost_cents), 0)
      FROM public.fulfillment_order_items oi
     WHERE oi.order_id = p_order_id AND oi.vendor_id = v_vendor AND oi.line_state = 'intake'
    RETURNING id INTO v_po;

    FOR r IN
      SELECT id, qty, unit_cost_cents FROM public.fulfillment_order_items
       WHERE order_id = p_order_id AND vendor_id = v_vendor AND line_state = 'intake'
    LOOP
      INSERT INTO public.fulfillment_vendor_po_lines (po_id, order_item_id, qty, unit_cost_cents)
      VALUES (v_po, r.id, r.qty, r.unit_cost_cents) RETURNING id INTO v_po_line;
      UPDATE public.fulfillment_order_items
         SET line_state = 'split', po_line_id = v_po_line
       WHERE id = r.id;
      PERFORM public.fulfillment_log_event('line.state_changed', p_actor, p_order_id, v_po, r.id, NULL, NULL,
        NULL, to_jsonb('intake'::text), to_jsonb('split'::text), v_started);
    END LOOP;

    PERFORM public.fulfillment_log_event('po.created', p_actor, p_order_id, v_po, NULL, NULL, NULL,
      jsonb_build_object('po_number', v_po_number, 'vendor_id', v_vendor), NULL, NULL, v_started);
  END LOOP;

  RETURN jsonb_build_object('pos', v_idx);
END;
$$;
REVOKE ALL ON FUNCTION public.fulfillment_confirm_split(uuid,text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fulfillment_confirm_split(uuid,text) TO service_role;

-- ─── 5. fulfillment_record_transmission ────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fulfillment_record_transmission(
  p_po_id uuid, p_method text, p_ref text, p_pdf_r2_key text, p_actor text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_started timestamptz := clock_timestamp(); v_order uuid;
BEGIN
  PERFORM set_config('app.fulfillment_writer','rpc',true);
  UPDATE public.fulfillment_vendor_pos
     SET status = 'sent', transmitted_at = now(), pdf_r2_key = COALESCE(p_pdf_r2_key, pdf_r2_key)
   WHERE id = p_po_id RETURNING order_id INTO v_order;
  IF v_order IS NULL THEN RAISE EXCEPTION 'fulfillment_record_transmission: po % not found', p_po_id; END IF;
  UPDATE public.fulfillment_order_items i SET line_state = 'transmitted'
    FROM public.fulfillment_vendor_po_lines l
   WHERE l.po_id = p_po_id AND l.order_item_id = i.id AND i.line_state = 'split';
  PERFORM public.fulfillment_log_event('po.transmitted', p_actor, v_order, p_po_id, NULL, NULL, NULL,
    jsonb_build_object('method', p_method, 'ref', p_ref), NULL, NULL, v_started);
END;
$$;
REVOKE ALL ON FUNCTION public.fulfillment_record_transmission(uuid,text,text,text,text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fulfillment_record_transmission(uuid,text,text,text,text) TO service_role;

-- ─── 6. fulfillment_record_ack ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fulfillment_record_ack(
  p_po_id uuid, p_committed_ship date, p_ack_method text, p_ack_ref text, p_actor text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_started timestamptz := clock_timestamp(); v_order uuid;
BEGIN
  PERFORM set_config('app.fulfillment_writer','rpc',true);
  UPDATE public.fulfillment_vendor_pos
     SET status = 'acknowledged', acked_at = now(), committed_ship = p_committed_ship,
         ack_method = p_ack_method, ack_ref = p_ack_ref
   WHERE id = p_po_id RETURNING order_id INTO v_order;
  IF v_order IS NULL THEN RAISE EXCEPTION 'fulfillment_record_ack: po % not found', p_po_id; END IF;
  UPDATE public.fulfillment_order_items i SET line_state = 'acknowledged'
    FROM public.fulfillment_vendor_po_lines l
   WHERE l.po_id = p_po_id AND l.order_item_id = i.id AND i.line_state = 'transmitted';
  PERFORM public.fulfillment_log_event('po.acknowledged', p_actor, v_order, p_po_id, NULL, NULL, NULL,
    jsonb_build_object('committed_ship', p_committed_ship, 'method', p_ack_method, 'ref', p_ack_ref),
    NULL, NULL, v_started);
END;
$$;
REVOKE ALL ON FUNCTION public.fulfillment_record_ack(uuid,date,text,text,text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fulfillment_record_ack(uuid,date,text,text,text) TO service_role;

-- ─── 7. fulfillment_record_shipment (steps PO ack→in_production→shipped) ────
CREATE OR REPLACE FUNCTION public.fulfillment_record_shipment(
  p_po_id uuid, p_mode text, p_carrier text, p_tracking text, p_actor text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_started timestamptz := clock_timestamp();
  v_order uuid; v_vendor uuid; v_window int; v_ship uuid;
BEGIN
  PERFORM set_config('app.fulfillment_writer','rpc',true);
  SELECT order_id, vendor_id INTO v_order, v_vendor FROM public.fulfillment_vendor_pos WHERE id = p_po_id;
  IF v_order IS NULL THEN RAISE EXCEPTION 'fulfillment_record_shipment: po % not found', p_po_id; END IF;

  SELECT COALESCE((vp.inspection_window_days->>p_mode)::int,
                  (SELECT (value->>p_mode)::int FROM public.fulfillment_config WHERE key='inspection_window_days_default'))
    INTO v_window FROM public.vendor_profiles vp WHERE vp.vendor_id = v_vendor;

  INSERT INTO public.fulfillment_shipments (po_id, mode, carrier, tracking, shipped_at, inspection_window_days)
  VALUES (p_po_id, p_mode, p_carrier, p_tracking, now(), v_window)
  RETURNING id INTO v_ship;

  UPDATE public.fulfillment_vendor_pos SET status = 'in_production' WHERE id = p_po_id AND status = 'acknowledged';
  UPDATE public.fulfillment_vendor_pos SET status = 'shipped'       WHERE id = p_po_id AND status = 'in_production';
  UPDATE public.fulfillment_order_items i SET line_state = 'in_production'
    FROM public.fulfillment_vendor_po_lines l
   WHERE l.po_id = p_po_id AND l.order_item_id = i.id AND i.line_state = 'acknowledged';
  UPDATE public.fulfillment_order_items i SET line_state = 'shipped'
    FROM public.fulfillment_vendor_po_lines l
   WHERE l.po_id = p_po_id AND l.order_item_id = i.id AND i.line_state = 'in_production';
  UPDATE public.fulfillment_vendor_po_lines SET shipment_id = v_ship WHERE po_id = p_po_id;

  PERFORM public.fulfillment_log_event('shipment.created', p_actor, v_order, p_po_id, NULL, v_ship, NULL,
    jsonb_build_object('mode', p_mode, 'carrier', p_carrier, 'tracking', p_tracking), NULL, NULL, v_started);
  RETURN v_ship;
END;
$$;
REVOKE ALL ON FUNCTION public.fulfillment_record_shipment(uuid,text,text,text,text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fulfillment_record_shipment(uuid,text,text,text,text) TO service_role;

-- ─── 8. fulfillment_record_delivery ────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fulfillment_record_delivery(
  p_shipment_id uuid, p_pod_r2_key text, p_actor text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_started timestamptz := clock_timestamp(); v_po uuid; v_order uuid; v_window int;
BEGIN
  PERFORM set_config('app.fulfillment_writer','rpc',true);
  SELECT po_id, inspection_window_days INTO v_po, v_window FROM public.fulfillment_shipments WHERE id = p_shipment_id;
  IF v_po IS NULL THEN RAISE EXCEPTION 'fulfillment_record_delivery: shipment % not found', p_shipment_id; END IF;
  SELECT order_id INTO v_order FROM public.fulfillment_vendor_pos WHERE id = v_po;

  UPDATE public.fulfillment_shipments
     SET delivered_at = now(), pod_r2_key = p_pod_r2_key,
         inspection_closes_at = now() + make_interval(days => COALESCE(v_window, 5))
   WHERE id = p_shipment_id;
  UPDATE public.fulfillment_vendor_pos SET status = 'delivered' WHERE id = v_po AND status = 'shipped';
  UPDATE public.fulfillment_order_items i SET line_state = 'delivered'
    FROM public.fulfillment_vendor_po_lines l
   WHERE l.po_id = v_po AND l.order_item_id = i.id AND i.line_state = 'shipped';

  PERFORM public.fulfillment_log_event('shipment.pod_recorded', p_actor, v_order, v_po, NULL, p_shipment_id, NULL,
    jsonb_build_object('pod_r2_key', p_pod_r2_key), NULL, NULL, v_started);
END;
$$;
REVOKE ALL ON FUNCTION public.fulfillment_record_delivery(uuid,text,text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fulfillment_record_delivery(uuid,text,text) TO service_role;

-- ─── 9. fulfillment_open_exception ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fulfillment_open_exception(
  p_type text, p_refs jsonb, p_actor text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_started timestamptz := clock_timestamp(); v_id uuid;
BEGIN
  PERFORM set_config('app.fulfillment_writer','rpc',true);
  INSERT INTO public.fulfillment_exceptions (type, order_id, order_item_id, po_id, shipment_id, clock_due_at)
  VALUES (
    p_type,
    NULLIF(p_refs#>>'{order_id}','')::uuid,
    NULLIF(p_refs#>>'{order_item_id}','')::uuid,
    NULLIF(p_refs#>>'{po_id}','')::uuid,
    NULLIF(p_refs#>>'{shipment_id}','')::uuid,
    NULLIF(p_refs#>>'{clock_due_at}','')::timestamptz
  ) RETURNING id INTO v_id;
  PERFORM public.fulfillment_log_event('exception.opened', p_actor,
    NULLIF(p_refs#>>'{order_id}','')::uuid, NULLIF(p_refs#>>'{po_id}','')::uuid,
    NULLIF(p_refs#>>'{order_item_id}','')::uuid, NULLIF(p_refs#>>'{shipment_id}','')::uuid, v_id,
    jsonb_build_object('type', p_type), NULL, NULL, v_started);
  RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION public.fulfillment_open_exception(text,jsonb,text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fulfillment_open_exception(text,jsonb,text) TO service_role;

-- ─── 10. fulfillment_resolve_exception (preview placeholder; T5 is S6/S7) ───
CREATE OR REPLACE FUNCTION public.fulfillment_resolve_exception(
  p_exception_id uuid, p_resolution_path text, p_cause_code text, p_preview boolean, p_actor text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_started timestamptz := clock_timestamp(); v_order uuid;
BEGIN
  PERFORM set_config('app.fulfillment_writer','rpc',true);
  IF p_preview THEN
    -- S7 MUST replace this placeholder; acceptance test compares preview lines to posted lines
    RETURN jsonb_build_object('lines', '[]'::jsonb, 'note', 'ledger_consequence_deferred_to_S7');
  END IF;
  UPDATE public.fulfillment_exceptions
     SET status = 'resolved', resolved_at = now(), resolution_path = p_resolution_path, cause_code = p_cause_code
   WHERE id = p_exception_id RETURNING order_id INTO v_order;
  IF NOT FOUND THEN RAISE EXCEPTION 'fulfillment_resolve_exception: exception % not found', p_exception_id; END IF;
  PERFORM public.fulfillment_log_event('exception.resolved', p_actor, v_order, NULL, NULL, NULL, p_exception_id,
    jsonb_build_object('resolution_path', p_resolution_path, 'cause_code', p_cause_code), NULL, NULL, v_started);
  RETURN jsonb_build_object('resolved', true);
END;
$$;
REVOKE ALL ON FUNCTION public.fulfillment_resolve_exception(uuid,text,text,boolean,text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fulfillment_resolve_exception(uuid,text,text,boolean,text) TO service_role;

-- ─── 11. fulfillment_settle_po — STUB (S6) ─────────────────────────────────
CREATE OR REPLACE FUNCTION public.fulfillment_settle_po(p_po_id uuid, p_actor text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  RAISE EXCEPTION 'not_implemented_until_S6';
END;
$$;
REVOKE ALL ON FUNCTION public.fulfillment_settle_po(uuid,text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fulfillment_settle_po(uuid,text) TO service_role;

-- ─── 12. fulfillment_record_client_note — dual-phase (D5) ──────────────────
CREATE OR REPLACE FUNCTION public.fulfillment_record_client_note(
  p_note_id uuid, p_order_id uuid, p_transition text, p_channel text, p_template_key text,
  p_drafted_body text, p_sent_body text, p_edit_diff jsonb,
  p_resend_message_id text, p_skipped_reason text, p_actor text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_started timestamptz := clock_timestamp(); v_id uuid; v_order uuid;
BEGIN
  PERFORM set_config('app.fulfillment_writer','rpc',true);
  IF p_note_id IS NULL THEN
    -- draft phase
    INSERT INTO public.fulfillment_client_notifications
      (order_id, transition, channel, template_key, drafted_body)
    VALUES (p_order_id, p_transition, p_channel, p_template_key, p_drafted_body)
    RETURNING id INTO v_id;
    PERFORM public.fulfillment_log_event('notification.drafted', p_actor, p_order_id, NULL, NULL, NULL, NULL,
      jsonb_build_object('transition', p_transition, 'channel', p_channel, 'template_key', p_template_key),
      NULL, NULL, v_started);
    RETURN v_id;
  END IF;
  -- send-stamp phase
  UPDATE public.fulfillment_client_notifications
     SET sent_body = p_sent_body, edit_diff = p_edit_diff,
         resend_message_id = p_resend_message_id, skipped_reason = p_skipped_reason,
         sent_at = CASE WHEN p_skipped_reason IS NULL THEN now() ELSE sent_at END
   WHERE id = p_note_id RETURNING order_id INTO v_order;
  IF v_order IS NULL THEN RAISE EXCEPTION 'fulfillment_record_client_note: note % not found', p_note_id; END IF;
  PERFORM public.fulfillment_log_event(
    CASE WHEN p_skipped_reason IS NOT NULL THEN 'notification.push_skipped' ELSE 'notification.sent' END,
    p_actor, v_order, NULL, NULL, NULL, NULL,
    jsonb_build_object('note_id', p_note_id, 'channel', p_channel, 'skipped_reason', p_skipped_reason),
    NULL, NULL, v_started);
  RETURN p_note_id;
END;
$$;
REVOKE ALL ON FUNCTION public.fulfillment_record_client_note(uuid,uuid,text,text,text,text,text,jsonb,text,text,text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fulfillment_record_client_note(uuid,uuid,text,text,text,text,text,jsonb,text,text,text) TO service_role;

-- ─── 13. fulfillment_update_config ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fulfillment_update_config(p_key text, p_value jsonb, p_actor text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_started timestamptz := clock_timestamp();
BEGIN
  PERFORM set_config('app.fulfillment_writer','rpc',true);
  INSERT INTO public.fulfillment_config (key, value, updated_by, updated_at)
  VALUES (p_key, p_value, p_actor, now())
  ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_by = EXCLUDED.updated_by, updated_at = now();
  PERFORM public.fulfillment_log_event('config.updated', p_actor, NULL, NULL, NULL, NULL, NULL,
    jsonb_build_object('key', p_key), NULL, p_value, v_started);
END;
$$;
REVOKE ALL ON FUNCTION public.fulfillment_update_config(text,jsonb,text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fulfillment_update_config(text,jsonb,text) TO service_role;

-- ─── 14. fulfillment_update_vendor_profile (upsert 1:1 by vendor_id) ────────
CREATE OR REPLACE FUNCTION public.fulfillment_update_vendor_profile(p_vendor_id uuid, p_patch jsonb, p_actor text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_started timestamptz := clock_timestamp();
BEGIN
  PERFORM set_config('app.fulfillment_writer','rpc',true);
  INSERT INTO public.vendor_profiles (
    vendor_id, transmission_type, contacts, po_email, portal_url, csv_column_spec,
    payment_terms, deposit_pct, lead_time_days, change_window_days, blind_ship,
    claims_window_days, inspection_window_days, freight_arrangement, commission_rate)
  VALUES (
    p_vendor_id,
    COALESCE(p_patch->>'transmission_type','email'),
    COALESCE(p_patch->'contacts','[]'::jsonb),
    p_patch->>'po_email', p_patch->>'portal_url', p_patch->'csv_column_spec',
    COALESCE(p_patch->>'payment_terms','net_30'),
    NULLIF(p_patch->>'deposit_pct','')::numeric,
    NULLIF(p_patch->>'lead_time_days','')::int,
    NULLIF(p_patch->>'change_window_days','')::int,
    COALESCE((p_patch->>'blind_ship')::boolean, false),
    NULLIF(p_patch->>'claims_window_days','')::int,
    p_patch->'inspection_window_days',
    p_patch->>'freight_arrangement',
    NULLIF(p_patch->>'commission_rate','')::numeric)
  ON CONFLICT (vendor_id) DO UPDATE SET
    transmission_type      = COALESCE(EXCLUDED.transmission_type, public.vendor_profiles.transmission_type),
    contacts               = COALESCE(EXCLUDED.contacts, public.vendor_profiles.contacts),
    po_email               = COALESCE(EXCLUDED.po_email, public.vendor_profiles.po_email),
    portal_url             = COALESCE(EXCLUDED.portal_url, public.vendor_profiles.portal_url),
    csv_column_spec        = COALESCE(EXCLUDED.csv_column_spec, public.vendor_profiles.csv_column_spec),
    payment_terms          = COALESCE(EXCLUDED.payment_terms, public.vendor_profiles.payment_terms),
    deposit_pct            = COALESCE(EXCLUDED.deposit_pct, public.vendor_profiles.deposit_pct),
    lead_time_days         = COALESCE(EXCLUDED.lead_time_days, public.vendor_profiles.lead_time_days),
    change_window_days     = COALESCE(EXCLUDED.change_window_days, public.vendor_profiles.change_window_days),
    blind_ship             = COALESCE(EXCLUDED.blind_ship, public.vendor_profiles.blind_ship),
    claims_window_days     = COALESCE(EXCLUDED.claims_window_days, public.vendor_profiles.claims_window_days),
    inspection_window_days = COALESCE(EXCLUDED.inspection_window_days, public.vendor_profiles.inspection_window_days),
    freight_arrangement    = COALESCE(EXCLUDED.freight_arrangement, public.vendor_profiles.freight_arrangement),
    commission_rate        = COALESCE(EXCLUDED.commission_rate, public.vendor_profiles.commission_rate),
    updated_at             = now();
  PERFORM public.fulfillment_log_event('config.updated', p_actor, NULL, NULL, NULL, NULL, NULL,
    jsonb_build_object('vendor_id', p_vendor_id, 'kind', 'vendor_profile'), NULL, p_patch, v_started);
END;
$$;
REVOKE ALL ON FUNCTION public.fulfillment_update_vendor_profile(uuid,jsonb,text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fulfillment_update_vendor_profile(uuid,jsonb,text) TO service_role;

-- ─── 15. rule_leah_review ──────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.rule_leah_review(p_review_id uuid, p_status text, p_ruled_by text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_started timestamptz := clock_timestamp(); v_exc uuid;
BEGIN
  IF p_status NOT IN ('approved','rejected') THEN
    RAISE EXCEPTION 'rule_leah_review: p_status must be approved or rejected, got %', p_status;
  END IF;
  PERFORM set_config('app.fulfillment_writer','rpc',true);
  UPDATE public.leah_reviews
     SET status = p_status, ruled_at = now(), ruled_by = p_ruled_by
   WHERE id = p_review_id RETURNING exception_id INTO v_exc;
  IF v_exc IS NULL THEN RAISE EXCEPTION 'rule_leah_review: review % not found', p_review_id; END IF;
  PERFORM public.fulfillment_log_event('exception.resolved', p_ruled_by, NULL, NULL, NULL, NULL, v_exc,
    jsonb_build_object('leah_review', p_review_id, 'status', p_status), NULL, NULL, v_started);
END;
$$;
REVOKE ALL ON FUNCTION public.rule_leah_review(uuid,text,text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rule_leah_review(uuid,text,text) TO service_role;

-- ─── 16. Views ─────────────────────────────────────────────────────────────
-- ⚠ S1 IN-PLACE AMENDMENT (2026-07-16, flagged per patina-parallel-work S1
-- instructions — pack unshipped, exists only on boh/* branches): the S0 cut of
-- these views had no SLA-breach signal and an incomplete band CASE (bare
-- 'intake'/'split' fell through to 'quiet' — no path for a stale unconfirmed
-- order to ever surface, contradicting spec §5.1's zero-invisibility +
-- exception-first intent and the S1 accepts-when's stale-order-breach test).
-- Restructured fulfillment_order_status_v via CTEs (same output contract:
-- order_id/order_no/client_name/intake_at/min_stage_idx/has_unmapped/
-- open_exceptions/derived_status all unchanged) and ADDITIVELY exposes
-- designer_attribution, unmapped_count, vendor_count, stage_entered_at.
-- fulfillment_queue_v now also computes breach + next_action_kind/params +
-- po_stages (for the Queue's stage dots) and fixes the band CASE. Band model
-- (documented for S2+ authors): the ball is in the OPERATOR's court for
-- 'intake' (unconfirmed) and 'split' (confirmed, not yet transmitted) — both
-- are unconditionally Needs Action Now, matching the presentation's "Send 2
-- POs" example. The ball is in a VENDOR/CARRIER's court for 'transmitted'
-- through 'shipped' — Watching, unless the ack-chase SLA is breached (then
-- Needs Action Now, next_action='chase_ack'). 'delivered' is Quiet — nothing
-- to actively do until the inspection window closes or an exception opens
-- (this was already the S0 author's implicit intent: 'delivered' was the one
-- pre-settled state absent from the original watching list). has_unmapped /
-- open_exceptions still override to Needs Action Now regardless of stage.
CREATE OR REPLACE VIEW public.fulfillment_order_status_v
WITH (security_invoker = true) AS
WITH item_stage AS (
  SELECT
    i.order_id,
    i.line_state,
    i.line_state_entered_at,
    array_position(ARRAY['intake','split','transmitted','acknowledged','in_production','shipped','delivered','settled'], i.line_state) AS stage_idx
  FROM public.fulfillment_order_items i
  WHERE i.line_state <> 'cancelled'
),
order_stage AS (
  SELECT order_id, MIN(stage_idx) AS min_stage_idx
  FROM item_stage
  GROUP BY order_id
),
order_stage_entered AS (
  SELECT s.order_id, s.min_stage_idx, MIN(i2.line_state_entered_at) AS stage_entered_at
  FROM order_stage s
  JOIN item_stage i2 ON i2.order_id = s.order_id AND i2.stage_idx = s.min_stage_idx
  GROUP BY s.order_id, s.min_stage_idx
),
order_mapping AS (
  SELECT order_id,
         bool_or(mapping_state = 'unmapped') AS has_unmapped,
         count(*) FILTER (WHERE mapping_state = 'unmapped') AS unmapped_count,
         count(DISTINCT vendor_id) FILTER (WHERE vendor_id IS NOT NULL) AS vendor_count
  FROM public.fulfillment_order_items
  WHERE line_state <> 'cancelled'
  GROUP BY order_id
),
order_exceptions AS (
  SELECT order_id, count(*) AS open_exceptions
  FROM public.fulfillment_exceptions
  WHERE status <> 'resolved'
  GROUP BY order_id
)
SELECT
  o.id AS order_id, o.order_no, o.client_name, o.intake_at, o.designer_attribution,
  ose.min_stage_idx,
  COALESCE(om.has_unmapped, false) AS has_unmapped,
  COALESCE(om.unmapped_count, 0) AS unmapped_count,
  COALESCE(om.vendor_count, 0) AS vendor_count,
  COALESCE(oe.open_exceptions, 0) AS open_exceptions,
  CASE
    WHEN COALESCE(om.has_unmapped, false) THEN 'needs_mapping'
    WHEN COALESCE(oe.open_exceptions, 0) > 0 THEN 'exception'
    ELSE (ARRAY['intake','split','transmitted','acknowledged','in_production','shipped','delivered','settled'])[ose.min_stage_idx]
  END AS derived_status,
  ose.stage_entered_at
FROM public.fulfillment_orders o
JOIN order_stage_entered ose ON ose.order_id = o.id
LEFT JOIN order_mapping om ON om.order_id = o.id
LEFT JOIN order_exceptions oe ON oe.order_id = o.id;

CREATE OR REPLACE VIEW public.fulfillment_queue_v
WITH (security_invoker = true) AS
WITH sent_po AS (
  -- earliest still-unacked PO send per order — the ack-chase clock reference
  SELECT order_id, MIN(transmitted_at) AS oldest_sent_at
  FROM public.fulfillment_vendor_pos
  WHERE status = 'sent'
  GROUP BY order_id
),
po_agg AS (
  SELECT p.order_id,
         jsonb_agg(jsonb_build_object(
           'po_id', p.id, 'po_number', p.po_number, 'vendor_id', p.vendor_id,
           'vendor_name', v.name, 'status', p.status
         ) ORDER BY p.created_at) AS po_stages,
         count(*) AS po_count
  FROM public.fulfillment_vendor_pos p
  JOIN public.vendors v ON v.id = p.vendor_id
  GROUP BY p.order_id
),
sla AS (
  SELECT
    (SELECT (value->>'split_confirm_business_hours')::numeric FROM public.fulfillment_config WHERE key='sla_hours') AS split_confirm_hours,
    (SELECT (value->>'ack_chase_business_days')::numeric FROM public.fulfillment_config WHERE key='sla_hours') AS ack_chase_days
)
SELECT
  s.order_id, s.order_no, s.client_name, s.intake_at, s.designer_attribution,
  s.min_stage_idx, s.has_unmapped, s.unmapped_count, s.vendor_count, s.open_exceptions,
  s.derived_status, s.stage_entered_at,
  COALESCE(pa.po_count, 0) AS po_count,
  COALESCE(pa.po_stages, '[]'::jsonb) AS po_stages,
  CASE
    WHEN s.derived_status = 'intake' THEN
      public.fulfillment_business_hours_between(s.intake_at, now()) > (SELECT split_confirm_hours FROM sla)
    WHEN s.derived_status = 'transmitted' AND sp.oldest_sent_at IS NOT NULL THEN
      public.fulfillment_business_hours_between(sp.oldest_sent_at, now()) > (SELECT ack_chase_days FROM sla) * 8
    ELSE false
  END AS breached,
  GREATEST(public.fulfillment_business_hours_between(s.stage_entered_at, now()), 0) AS stage_age_business_hours,
  CASE
    WHEN s.has_unmapped THEN 'assign_vendor'
    WHEN s.open_exceptions > 0 THEN 'resolve_exception'
    WHEN s.derived_status = 'intake' THEN 'confirm_split'
    WHEN s.derived_status = 'split' THEN 'transmit_pos'
    WHEN s.derived_status = 'transmitted' AND sp.oldest_sent_at IS NOT NULL
         AND public.fulfillment_business_hours_between(sp.oldest_sent_at, now()) > (SELECT ack_chase_days FROM sla) * 8
      THEN 'chase_ack'
    WHEN s.derived_status = 'transmitted' THEN 'awaiting_ack'
    WHEN s.derived_status IN ('acknowledged','in_production') THEN 'in_production'
    WHEN s.derived_status = 'shipped' THEN 'in_transit'
    WHEN s.derived_status = 'delivered' THEN 'awaiting_settlement'
    ELSE 'review'
  END AS next_action_kind,
  jsonb_build_object(
    'unmapped_count', s.unmapped_count,
    'exception_count', s.open_exceptions,
    'po_count', COALESCE(pa.po_count, 0),
    'days_overdue', CASE
      WHEN s.derived_status = 'transmitted' AND sp.oldest_sent_at IS NOT NULL
           AND public.fulfillment_business_hours_between(sp.oldest_sent_at, now()) > (SELECT ack_chase_days FROM sla) * 8
        THEN ceil(public.fulfillment_business_hours_between(sp.oldest_sent_at, now()) / 8.0)
      ELSE NULL
    END
  ) AS next_action_params,
  CASE
    WHEN s.has_unmapped OR s.open_exceptions > 0 THEN 'needs_action_now'
    WHEN s.derived_status IN ('intake','split') THEN 'needs_action_now'
    WHEN s.derived_status = 'transmitted' AND sp.oldest_sent_at IS NOT NULL
         AND public.fulfillment_business_hours_between(sp.oldest_sent_at, now()) > (SELECT ack_chase_days FROM sla) * 8
      THEN 'needs_action_now'
    WHEN s.derived_status IN ('transmitted','acknowledged','in_production','shipped') THEN 'watching'
    ELSE 'quiet'
  END AS band
FROM public.fulfillment_order_status_v s
LEFT JOIN sent_po sp ON sp.order_id = s.order_id
LEFT JOIN po_agg pa ON pa.order_id = s.order_id
WHERE s.derived_status IS DISTINCT FROM 'settled';

-- client_order_status_v — DEFINER view (owner postgres). See D4.
CREATE OR REPLACE VIEW public.client_order_status_v
WITH (security_invoker = false) AS
SELECT
  o.id AS order_id, o.order_no, o.intake_at,
  CASE s.derived_status
    WHEN 'intake' THEN 'confirmed' WHEN 'split' THEN 'confirmed'
    WHEN 'transmitted' THEN 'confirmed' WHEN 'acknowledged' THEN 'in_production'
    WHEN 'in_production' THEN 'in_production' WHEN 'shipped' THEN 'shipped'
    WHEN 'delivered' THEN 'delivered' WHEN 'exception' THEN 'delayed'
    ELSE 'confirmed'
  END AS client_status
FROM public.fulfillment_orders o
JOIN public.fulfillment_order_status_v s ON s.order_id = o.id
WHERE o.client_profile_id = auth.uid();
COMMENT ON VIEW public.client_order_status_v IS
  'BOH (00353): client-safe order status. DEFINER view (owner postgres) by design (D4) — '
  'bypasses admin-only base RLS; the own-row auth.uid() scope is the boundary. Do NOT switch '
  'to security_invoker (would zero out client reads). Client-safe columns only — no vendor/po/cost.';

GRANT SELECT ON public.fulfillment_order_status_v, public.fulfillment_queue_v TO authenticated, agent_reader, service_role;
REVOKE ALL ON public.client_order_status_v FROM public, anon;
GRANT SELECT ON public.client_order_status_v TO authenticated, service_role;
