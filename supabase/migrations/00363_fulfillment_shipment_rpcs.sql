-- ═══════════════════════════════════════════════════════════════════════════
-- 00363 — Back of House: Shipment Board RPC gaps (S5 → sole migration writer)
--
-- S5 (Shipment Board UI) built against 00350/00353 and surfaced three RPC-layer
-- gaps that belong in a migration (S6 is the wave's sole migration writer). All
-- three are additive / fix-forward — 00350–00358 are on origin/main, so
-- fulfillment_record_delivery is redefined by CREATE OR REPLACE grafted from its
-- verbatim 00353 body (never edited in place).
--
--   1. fulfillment_confirm_appointment — S5's appointment route already calls
--      this exact name (catching 42883 → honest 501 until it lands).
--   2. an appointment GATE inside fulfillment_record_delivery — defense-in-depth
--      for spec §5.4 ("an LTL shipment cannot reach 'delivered' without a
--      confirmed appointment"); S5 also enforces it app-side (canDeliverShipment
--      + 409 pre-RPC).
--   3. fulfillment_update_shipment_eta — nothing wrote current_eta/eta_history
--      post-creation (columns exist since 00350); S5's slip rendering depended on
--      the sanctioned GUC side door. Manual v1, webhook-ready later (§5.4).
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 1. fulfillment_confirm_appointment ─────────────────────────────────────
-- Stamps appointment_confirmed_at + writes shipment.appointment_confirmed.
-- PARCEL is ALLOWED (flagged): a parcel needs no appointment, so confirming one
-- is a trivial (idempotent) stamp — the delivery gate below never requires it
-- for parcel, so this only matters for ltl/white_glove. Keeping parcel allowed
-- (rather than raising) means a mis-routed UI call can't 500.
CREATE OR REPLACE FUNCTION public.fulfillment_confirm_appointment(
  p_shipment_id uuid, p_actor text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_started timestamptz := clock_timestamp(); v_po uuid; v_order uuid; v_mode text;
BEGIN
  PERFORM set_config('app.fulfillment_writer','rpc',true);
  SELECT po_id, mode INTO v_po, v_mode FROM public.fulfillment_shipments WHERE id = p_shipment_id;
  IF v_po IS NULL THEN RAISE EXCEPTION 'fulfillment_confirm_appointment: shipment % not found', p_shipment_id; END IF;
  SELECT order_id INTO v_order FROM public.fulfillment_vendor_pos WHERE id = v_po;

  UPDATE public.fulfillment_shipments SET appointment_confirmed_at = now() WHERE id = p_shipment_id;

  PERFORM public.fulfillment_log_event('shipment.appointment_confirmed', p_actor, v_order, v_po, NULL, p_shipment_id, NULL,
    jsonb_build_object('mode', v_mode), NULL, NULL, v_started);
END;
$$;
REVOKE ALL ON FUNCTION public.fulfillment_confirm_appointment(uuid,text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fulfillment_confirm_appointment(uuid,text) TO service_role;

-- ─── 2. fulfillment_record_delivery — + appointment gate (graft of 00353) ───
-- Everything is the verbatim 00353 body EXCEPT: the shipment SELECT also reads
-- mode + appointment_confirmed_at, and an ltl/white_glove delivery RAISES unless
-- the appointment was confirmed (spec §5.4). Parcel is unaffected.
CREATE OR REPLACE FUNCTION public.fulfillment_record_delivery(
  p_shipment_id uuid, p_pod_r2_key text, p_actor text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_started timestamptz := clock_timestamp();
  v_po uuid; v_order uuid; v_window int; v_mode text; v_appt timestamptz;
BEGIN
  PERFORM set_config('app.fulfillment_writer','rpc',true);
  SELECT po_id, inspection_window_days, mode, appointment_confirmed_at
    INTO v_po, v_window, v_mode, v_appt
    FROM public.fulfillment_shipments WHERE id = p_shipment_id;
  IF v_po IS NULL THEN RAISE EXCEPTION 'fulfillment_record_delivery: shipment % not found', p_shipment_id; END IF;

  -- Appointment gate (spec §5.4): ltl/white_glove cannot be delivered without a
  -- confirmed appointment. Parcel needs none.
  IF v_mode IN ('ltl','white_glove') AND v_appt IS NULL THEN
    RAISE EXCEPTION 'fulfillment_record_delivery: % shipment % requires a confirmed appointment before delivery',
      v_mode, p_shipment_id USING ERRCODE = 'invalid_parameter_value';
  END IF;

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

-- ─── 3. fulfillment_update_shipment_eta ─────────────────────────────────────
-- Sets current_eta, appends {at, from, to, reason} to eta_history, writes
-- shipment.eta_changed. Manual v1 (spec §5.4 — the slip rendering reads
-- current_eta; the board shows the history). Webhook-ready: a carrier feed can
-- call the same RPC later.
CREATE OR REPLACE FUNCTION public.fulfillment_update_shipment_eta(
  p_shipment_id uuid, p_current_eta date, p_reason text, p_actor text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_started timestamptz := clock_timestamp(); v_po uuid; v_order uuid; v_prev date;
BEGIN
  PERFORM set_config('app.fulfillment_writer','rpc',true);
  SELECT po_id, current_eta INTO v_po, v_prev FROM public.fulfillment_shipments WHERE id = p_shipment_id;
  IF v_po IS NULL THEN RAISE EXCEPTION 'fulfillment_update_shipment_eta: shipment % not found', p_shipment_id; END IF;
  SELECT order_id INTO v_order FROM public.fulfillment_vendor_pos WHERE id = v_po;

  UPDATE public.fulfillment_shipments
     SET current_eta = p_current_eta,
         eta_history = eta_history || jsonb_build_object(
           'at', now(), 'from', v_prev, 'to', p_current_eta, 'reason', p_reason)
   WHERE id = p_shipment_id;

  PERFORM public.fulfillment_log_event('shipment.eta_changed', p_actor, v_order, v_po, NULL, p_shipment_id, NULL,
    jsonb_build_object('from', v_prev, 'to', p_current_eta, 'reason', p_reason), NULL, NULL, v_started);
END;
$$;
REVOKE ALL ON FUNCTION public.fulfillment_update_shipment_eta(uuid,date,text,text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fulfillment_update_shipment_eta(uuid,date,text,text) TO service_role;
