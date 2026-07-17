-- ═══════════════════════════════════════════════════════════════════════════
-- seed-fulfillment-exceptions.sql — S7 Exception Desk & Settlement fixtures
--
-- Adds, on top of the S0 seed + S1 fixtures, the state the S7 surfaces and the
-- Drop-3 screenshots need:
--   • a DELIVERED, settle-ready PO sized so a $34 freight variance auto-accepts
--     (Heirloom Oak Dining Table, Room & Board net_30 — no deposit; product
--     $2730 + freight est $240 ⇒ tolerance $59.40, $34 in-tolerance)
--   • a DAMAGE exception on the S1 delivered order (#8, Wren Castellano) with a
--     carrier-claim clock + evidence keys — the case-file screenshot
--   • a SUBSTITUTION exception routed to Leah with a Bouclé comparison card —
--     the Leah deck screenshot (leah_reviews pending)
--
-- Every mutation flows through a real fulfillment_* RPC EXCEPT: (a) the PO
-- freight estimate + backdated timestamps, and (b) the damage evidence keys +
-- clock, which use the one sanctioned test-fixture side door (writer GUC set to
-- 'migration', the same escape S0's seed migrations use). Run AFTER reset +
-- `pnpm seed:fulfillment` + scripts/seed-fulfillment-fixtures.sql:
--   psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f scripts/seed-fulfillment-exceptions.sql
-- ═══════════════════════════════════════════════════════════════════════════
\set ON_ERROR_STOP on

-- ─── 1. Settle-ready delivered order (Rowan Calloway) ───────────────────────
DO $$
DECLARE v_order uuid; v_po uuid; v_ship uuid;
BEGIN
  IF EXISTS (SELECT 1 FROM public.fulfillment_orders WHERE stripe_payment_intent_id = 'pi_boh_s7_settle') THEN
    RAISE NOTICE 'settle fixture already present — skipping'; RETURN;
  END IF;

  SELECT public.fulfillment_intake_order(
    jsonb_build_object(
      'payment_intent', jsonb_build_object('id','pi_boh_s7_settle'),
      'client', jsonb_build_object('name','Rowan Calloway','email','rowan.calloway@example.com'),
      'ship_to', jsonb_build_object('line1','88 Cedar Hollow','city','Madison','state','WI','postal_code','53703'),
      'designer', jsonb_build_object('attribution', jsonb_build_object('kind','self_directed')),
      'totals', jsonb_build_object('captured_total_cents',462000,'product_subtotal_cents',420000,
                                   'freight_charged_cents',24000,'tax_cents',18000),
      'lines', jsonb_build_array(jsonb_build_object(
        'product_id','a0000000-0000-0000-0000-000000000001','item_name','Heirloom Oak Dining Table',
        'qty',1,'unit_price_cents',420000))
    ), 'boh_s7_fixture') INTO v_order;

  PERFORM public.fulfillment_confirm_split(v_order, 'boh_s7_fixture');
  SELECT id INTO v_po FROM public.fulfillment_vendor_pos WHERE order_id = v_order LIMIT 1;

  -- sanctioned side door: seed the PO freight ESTIMATE ($240) so the three-way
  -- match shows a freight line and the +$34 reads as a freight overage.
  PERFORM set_config('app.fulfillment_writer','migration',true);
  UPDATE public.fulfillment_vendor_pos SET freight_cost_cents = 24000 WHERE id = v_po;
  PERFORM set_config('app.fulfillment_writer','rpc',true);

  PERFORM public.fulfillment_record_transmission(v_po, 'email', 'msg_s7_settle', NULL, 'boh_s7_fixture');
  PERFORM public.fulfillment_record_ack(v_po, (now() + interval '35 days')::date, 'email', 'ack_s7_settle', 'boh_s7_fixture');
  SELECT public.fulfillment_record_shipment(v_po, 'parcel', 'FedEx', '7788990011', 'boh_s7_fixture') INTO v_ship;
  PERFORM public.fulfillment_record_delivery(v_ship, 'fulfillment/pod/s7-settle.pdf', 'boh_s7_fixture');
  RAISE NOTICE 'settle fixture: order % PO % delivered (settle-ready, $34 in tolerance)', v_order, v_po;
END $$;

-- ─── 2. Damage exception on its OWN delivered LTL order (Brooks) ────────────
-- A dedicated order (NOT the S1 delivered fixture, which the zero-invisibility
-- Q5 assert pins to the Quiet band — an open exception would flip it). Brooks ·
-- LTL · concealed damage matches the presentation's DMG-0031 case file.
DO $$
DECLARE v_order uuid; v_po uuid; v_ship uuid; v_item uuid; v_exc uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.fulfillment_orders WHERE stripe_payment_intent_id = 'pi_boh_s7_damage') THEN
    SELECT public.fulfillment_intake_order(
      jsonb_build_object(
        'payment_intent', jsonb_build_object('id','pi_boh_s7_damage'),
        'client', jsonb_build_object('name','Amara Brooks','email','amara.brooks@example.com'),
        'ship_to', jsonb_build_object('line1','210 Ridgeline Dr','city','Boulder','state','CO','postal_code','80302'),
        'designer', jsonb_build_object('attribution', jsonb_build_object('kind','self_directed')),
        'totals', jsonb_build_object('captured_total_cents',252000,'product_subtotal_cents',225000,
                                     'freight_charged_cents',12000,'tax_cents',15000),
        'lines', jsonb_build_array(jsonb_build_object(
          'product_id','a0000000-0000-0000-0000-000000000003','item_name','Live-Edge Coffee Table',
          'qty',1,'unit_price_cents',225000))
      ), 'boh_s7_fixture') INTO v_order;
    PERFORM public.fulfillment_confirm_split(v_order, 'boh_s7_fixture');
    SELECT id INTO v_po FROM public.fulfillment_vendor_pos WHERE order_id = v_order LIMIT 1;
    PERFORM public.fulfillment_record_transmission(v_po, 'email', 'msg_s7_damage', NULL, 'boh_s7_fixture');
    PERFORM public.fulfillment_record_ack(v_po, (now() + interval '30 days')::date, 'email', 'ack_s7_damage', 'boh_s7_fixture');
    SELECT public.fulfillment_record_shipment(v_po, 'ltl', 'Old Dominion', 'ODFL-88231', 'boh_s7_fixture') INTO v_ship;
    PERFORM public.fulfillment_confirm_appointment(v_ship, 'boh_s7_fixture');   -- LTL deliver gate
    PERFORM public.fulfillment_record_delivery(v_ship, 'fulfillment/pod/s7-damage.pdf', 'boh_s7_fixture');
  ELSE
    SELECT id INTO v_order FROM public.fulfillment_orders WHERE stripe_payment_intent_id = 'pi_boh_s7_damage';
  END IF;

  SELECT p.id, s.id, l.order_item_id INTO v_po, v_ship, v_item
    FROM public.fulfillment_vendor_pos p
    JOIN public.fulfillment_shipments s ON s.po_id = p.id
    JOIN public.fulfillment_vendor_po_lines l ON l.po_id = p.id
   WHERE p.order_id = v_order LIMIT 1;

  IF EXISTS (SELECT 1 FROM public.fulfillment_exceptions WHERE order_id=v_order AND type='damage' AND status<>'resolved') THEN
    RAISE NOTICE 'damage exception already present — skipping'; RETURN;
  END IF;

  SELECT public.fulfillment_open_exception('damage',
    jsonb_build_object('order_id',v_order,'order_item_id',v_item,'po_id',v_po,'shipment_id',v_ship,
      'clock_due_at', (now() + interval '4 days')), 'boh_s7_fixture') INTO v_exc;

  -- sanctioned side door: seed evidence keys (case-file grid) — no files needed;
  -- the grid renders labelled placeholders when a signed URL 404s.
  PERFORM set_config('app.fulfillment_writer','migration',true);
  UPDATE public.fulfillment_exceptions
     SET evidence_r2_keys = ARRAY[
       'fulfillment/evidence/'||v_exc||'/img01.jpg',
       'fulfillment/evidence/'||v_exc||'/img02.jpg',
       'fulfillment/evidence/'||v_exc||'/img03.jpg']
   WHERE id = v_exc;
  PERFORM set_config('app.fulfillment_writer','rpc',true);
  RAISE NOTICE 'damage exception % opened on order % (clock 4d, 3 evidence keys)', v_exc, v_order;
END $$;

-- ─── 3. Substitution exception routed to Leah (Elena Whitfield) ─────────────
DO $$
DECLARE v_order uuid; v_item uuid; v_exc uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.fulfillment_orders WHERE stripe_payment_intent_id = 'pi_boh_s7_substitution') THEN
    SELECT public.fulfillment_intake_order(
      jsonb_build_object(
        'payment_intent', jsonb_build_object('id','pi_boh_s7_substitution'),
        'client', jsonb_build_object('name','Elena Whitfield','email','elena.whitfield@example.com'),
        'ship_to', jsonb_build_object('line1','4 Prospect Ln','city','Evanston','state','IL','postal_code','60201'),
        'designer', jsonb_build_object('attribution', jsonb_build_object('kind','self_directed')),
        'totals', jsonb_build_object('captured_total_cents',148500,'product_subtotal_cents',135000,
                                     'freight_charged_cents',6000,'tax_cents',7500),
        'lines', jsonb_build_array(jsonb_build_object(
          'product_id','a0000000-0000-0000-0000-000000000012','item_name','Velvet Club Chair',
          'qty',1,'unit_price_cents',135000))
      ), 'boh_s7_fixture') INTO v_order;
  ELSE
    SELECT id INTO v_order FROM public.fulfillment_orders WHERE stripe_payment_intent_id = 'pi_boh_s7_substitution';
  END IF;

  IF EXISTS (SELECT 1 FROM public.fulfillment_exceptions WHERE order_id=v_order AND type='substitution' AND status<>'resolved') THEN
    RAISE NOTICE 'substitution exception already present — skipping'; RETURN;
  END IF;

  SELECT id INTO v_item FROM public.fulfillment_order_items WHERE order_id = v_order LIMIT 1;
  SELECT public.fulfillment_open_exception('substitution',
    jsonb_build_object('order_id',v_order,'order_item_id',v_item), 'boh_s7_fixture') INTO v_exc;

  -- route to Leah through the real RPC (creates the pending leah_reviews card)
  PERFORM public.fulfillment_resolve_exception(v_exc, 'substitution_review',
    jsonb_build_object('cause_code','vendor_substitution',
      'outcome_memo','Holly Hunt proposed a bouclé lot change on the club chair.',
      'comparison', jsonb_build_object(
        'title','Bouclé lot 44 → lot 47',
        'specified','Bouclé lot 44',
        'proposed','Bouclé lot 47',
        'difference','warmer undertone',
        'specified_swatch','#E9E2D4',
        'proposed_swatch','#EADFCB',
        'price_delta_cents',0,
        'lead_delta_days',0,
        'client_name','Whitfield')),
    false, 'boh_s7_fixture');
  RAISE NOTICE 'substitution exception % routed to Leah on order %', v_exc, v_order;
END $$;
