-- scripts/seed-fulfillment-fixtures.sql — BOH S1 band-coverage fixtures.
--
-- S0's 5 seeded orders (`pnpm seed:fulfillment`) are all fresh-intake — none
-- has been split, transmitted, acknowledged, shipped, or delivered, and none
-- is SLA-stale. S1's accepts-when needs a stale order (Needs Action Now with
-- a terracotta age) and an in-transit order (Watching, the action test) — and
-- the Queue screenshot needs all THREE bands populated, which additionally
-- needs a Quiet-band row. Since `fulfillment_queue_v` deliberately excludes
-- 'settled' orders (spec §5.1's zero-invisibility invariant is scoped to
-- non-settled orders) and settlement itself is an S6 stub, the only reachable
-- Quiet-band state in this slice is 'delivered' — so this script creates
-- THREE fixture orders, not the two the S1 brief names literally:
--   (a) STALE    — intake only, backdated past the 4-business-hour
--                   split-confirm SLA -> Needs Action Now, terracotta age.
--   (b) INTRANSIT — walked intake -> split -> transmitted -> acknowledged ->
--                   shipped via the real RPCs -> Watching.
--   (c) DELIVERED — same walk as (b) plus fulfillment_record_delivery ->
--                   Quiet (nothing to actively do until the inspection
--                   window closes / S6 settlement exists).
-- (c) is this script's own addition beyond the S1 brief's literal (a)/(b) —
-- flagged in the S1 report — because without it the Quiet band is
-- structurally unreachable by any seed this slice can produce, and the S1
-- exit evidence asks for a screenshot with all three bands populated.
--
-- Every mutation goes through a real fulfillment_* RPC (§12 "no side doors")
-- EXCEPT the backdating step in (a), which uses the one sanctioned side door
-- documented in the S1 brief: a psql session with
-- `app.fulfillment_writer = 'migration'` directly editing timestamps. That
-- GUC value is the same escape hatch S0's own seed migrations use (00351's
-- config-defaults INSERT) — it is test-fixture-only, never used by the app.
--
-- Idempotent by intent: fulfillment_intake_order no-ops on a repeat
-- stripe_payment_intent_id (ON CONFLICT DO NOTHING), and each advancement
-- step below is guarded by the order's current derived stage so re-running
-- this script is safe (matches scripts/seed-fulfillment-orders.ts's own
-- idempotency contract).
--
-- Run (after `supabase db reset` + `pnpm seed:fulfillment`, both already
-- through the intake fn — see scripts/seed-fulfillment-orders.ts's runbook):
--   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" \
--     -v ON_ERROR_STOP=1 -f scripts/seed-fulfillment-fixtures.sql

\set ON_ERROR_STOP on

-- ═══════════════════════════════════════════════════════════════════════════
-- (a) STALE — intake only, backdated past the split-confirm SLA
-- ═══════════════════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_order_id uuid;
BEGIN
  SELECT public.fulfillment_intake_order(
    jsonb_build_object(
      'payment_intent', jsonb_build_object('id', 'pi_boh_s1_fixture_stale'),
      'client', jsonb_build_object('name', 'Talia Bloom', 'email', 'talia.bloom@example.com'),
      'ship_to', jsonb_build_object('line1', '19 Quarry Rd', 'city', 'Asheville', 'state', 'NC', 'postal_code', '28801'),
      'designer', jsonb_build_object('attribution', jsonb_build_object('kind', 'self_directed')),
      'totals', jsonb_build_object(
        'captured_total_cents', 98000,
        'product_subtotal_cents', 89000,
        'freight_charged_cents', 5000,
        'tax_cents', 4000
      ),
      'lines', jsonb_build_array(
        jsonb_build_object(
          'product_id', 'a0000000-0000-0000-0000-000000000011',
          'item_name', 'Brass Arc Floor Lamp',
          'qty', 1,
          'unit_price_cents', 89000
        )
      )
    ),
    'boh_s1_fixture'
  ) INTO v_order_id;

  -- Backdate intake_at + the line's line_state_entered_at past the 4-business-
  -- hour split-confirm SLA (fulfillment_config key 'sla_hours'). 3 calendar
  -- days back guarantees > 4 BUSINESS hours elapsed regardless of what day
  -- `now()` falls on. The sanctioned test-fixture side door (S1 brief):
  PERFORM set_config('app.fulfillment_writer', 'migration', true);
  UPDATE public.fulfillment_orders
     SET intake_at = now() - interval '3 days'
   WHERE id = v_order_id;
  UPDATE public.fulfillment_order_items
     SET line_state_entered_at = now() - interval '3 days'
   WHERE order_id = v_order_id;

  RAISE NOTICE 'FIXTURE STALE: order_id=%, order_no=%',
    v_order_id, (SELECT order_no FROM public.fulfillment_orders WHERE id = v_order_id);
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- (b) INTRANSIT — intake -> split -> transmitted -> acknowledged -> shipped
-- ═══════════════════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_order_id uuid;
  v_po_id    uuid;
  v_line_state text;
BEGIN
  SELECT public.fulfillment_intake_order(
    jsonb_build_object(
      'payment_intent', jsonb_build_object('id', 'pi_boh_s1_fixture_intransit'),
      'client', jsonb_build_object('name', 'Dorian Ashford', 'email', 'dorian.ashford@example.com'),
      'ship_to', jsonb_build_object('line1', '640 Millrace Ave', 'city', 'Providence', 'state', 'RI', 'postal_code', '02903'),
      'designer', jsonb_build_object('attribution', jsonb_build_object('kind', 'self_directed')),
      'totals', jsonb_build_object(
        'captured_total_cents', 402000,
        'product_subtotal_cents', 360000,
        'freight_charged_cents', 15000,
        'tax_cents', 27000
      ),
      'lines', jsonb_build_array(
        jsonb_build_object(
          'product_id', 'a0000000-0000-0000-0000-000000000002',
          'item_name', 'Walnut Credenza',
          'qty', 1,
          'unit_price_cents', 360000
        )
      )
    ),
    'boh_s1_fixture'
  ) INTO v_order_id;

  SELECT line_state INTO v_line_state
    FROM public.fulfillment_order_items WHERE order_id = v_order_id LIMIT 1;

  IF v_line_state = 'intake' THEN
    PERFORM public.fulfillment_confirm_split(v_order_id, 'boh_s1_fixture');
  END IF;

  SELECT id INTO v_po_id FROM public.fulfillment_vendor_pos WHERE order_id = v_order_id LIMIT 1;

  IF (SELECT status FROM public.fulfillment_vendor_pos WHERE id = v_po_id) = 'draft' THEN
    PERFORM public.fulfillment_record_transmission(v_po_id, 'email', 'fixture-tx-ref', NULL, 'boh_s1_fixture');
  END IF;

  IF (SELECT status FROM public.fulfillment_vendor_pos WHERE id = v_po_id) = 'sent' THEN
    PERFORM public.fulfillment_record_ack(v_po_id, (now() + interval '21 days')::date, 'email', 'fixture-ack-ref', 'boh_s1_fixture');
  END IF;

  IF (SELECT status FROM public.fulfillment_vendor_pos WHERE id = v_po_id) = 'acknowledged' THEN
    PERFORM public.fulfillment_record_shipment(v_po_id, 'parcel', 'UPS', '1Z999AA10123456784', 'boh_s1_fixture');
  END IF;

  RAISE NOTICE 'FIXTURE INTRANSIT: order_id=%, order_no=%, po_status=%',
    v_order_id,
    (SELECT order_no FROM public.fulfillment_orders WHERE id = v_order_id),
    (SELECT status FROM public.fulfillment_vendor_pos WHERE id = v_po_id);
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- (c) DELIVERED — same walk as (b) + fulfillment_record_delivery -> Quiet
-- ═══════════════════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_order_id   uuid;
  v_po_id      uuid;
  v_ship_id    uuid;
  v_line_state text;
BEGIN
  SELECT public.fulfillment_intake_order(
    jsonb_build_object(
      'payment_intent', jsonb_build_object('id', 'pi_boh_s1_fixture_delivered'),
      'client', jsonb_build_object('name', 'Wren Castellano', 'email', 'wren.castellano@example.com'),
      'ship_to', jsonb_build_object('line1', '5 Cobble Ct', 'city', 'Savannah', 'state', 'GA', 'postal_code', '31401'),
      'designer', jsonb_build_object('attribution', jsonb_build_object('kind', 'self_directed')),
      'totals', jsonb_build_object(
        'captured_total_cents', 234000,
        'product_subtotal_cents', 210000,
        'freight_charged_cents', 9000,
        'tax_cents', 15000
      ),
      'lines', jsonb_build_array(
        jsonb_build_object(
          'product_id', 'a0000000-0000-0000-0000-000000000003',
          'item_name', 'Live-Edge Coffee Table',
          'qty', 1,
          'unit_price_cents', 210000
        )
      )
    ),
    'boh_s1_fixture'
  ) INTO v_order_id;

  SELECT line_state INTO v_line_state
    FROM public.fulfillment_order_items WHERE order_id = v_order_id LIMIT 1;

  IF v_line_state = 'intake' THEN
    PERFORM public.fulfillment_confirm_split(v_order_id, 'boh_s1_fixture');
  END IF;

  SELECT id INTO v_po_id FROM public.fulfillment_vendor_pos WHERE order_id = v_order_id LIMIT 1;

  IF (SELECT status FROM public.fulfillment_vendor_pos WHERE id = v_po_id) = 'draft' THEN
    PERFORM public.fulfillment_record_transmission(v_po_id, 'portal', 'fixture-tx-ref-2', NULL, 'boh_s1_fixture');
  END IF;

  IF (SELECT status FROM public.fulfillment_vendor_pos WHERE id = v_po_id) = 'sent' THEN
    PERFORM public.fulfillment_record_ack(v_po_id, (now() + interval '14 days')::date, 'portal', 'fixture-ack-ref-2', 'boh_s1_fixture');
  END IF;

  IF (SELECT status FROM public.fulfillment_vendor_pos WHERE id = v_po_id) = 'acknowledged' THEN
    SELECT public.fulfillment_record_shipment(v_po_id, 'parcel', 'FedEx', '7712884590341', 'boh_s1_fixture') INTO v_ship_id;
  END IF;

  SELECT id INTO v_ship_id FROM public.fulfillment_shipments WHERE po_id = v_po_id LIMIT 1;

  IF v_ship_id IS NOT NULL AND (SELECT delivered_at FROM public.fulfillment_shipments WHERE id = v_ship_id) IS NULL THEN
    PERFORM public.fulfillment_record_delivery(v_ship_id, NULL, 'boh_s1_fixture');
  END IF;

  RAISE NOTICE 'FIXTURE DELIVERED: order_id=%, order_no=%, po_status=%',
    v_order_id,
    (SELECT order_no FROM public.fulfillment_orders WHERE id = v_order_id),
    (SELECT status FROM public.fulfillment_vendor_pos WHERE id = v_po_id);
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- (d) CHASE — intake -> split -> transmitted, then UNACKED with the send
--     backdated ~2 business days -> Needs Action Now, "Chase Vandermeer — day 2"
--     (S3, spec §5.3 / §2). The multi-token client name exercises the surname
--     verb (matches the presentation's "Chase Vandermeer — day 3").
-- ═══════════════════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_order_id uuid;
  v_po_id    uuid;
  v_t        timestamptz := now();
BEGIN
  SELECT public.fulfillment_intake_order(
    jsonb_build_object(
      'payment_intent', jsonb_build_object('id', 'pi_boh_s3_fixture_chase'),
      'client', jsonb_build_object('name', 'Camille Vandermeer', 'email', 'camille.vandermeer@example.com'),
      'ship_to', jsonb_build_object('line1', '88 Harbor View Ln', 'city', 'Portland', 'state', 'ME', 'postal_code', '04101'),
      'designer', jsonb_build_object('attribution', jsonb_build_object('kind', 'self_directed')),
      'totals', jsonb_build_object(
        'captured_total_cents', 402000,
        'product_subtotal_cents', 360000,
        'freight_charged_cents', 15000,
        'tax_cents', 27000
      ),
      'lines', jsonb_build_array(
        jsonb_build_object(
          'product_id', 'a0000000-0000-0000-0000-000000000002',
          'item_name', 'Walnut Credenza',
          'qty', 1,
          'unit_price_cents', 360000
        )
      )
    ),
    'boh_s3_fixture'
  ) INTO v_order_id;

  IF (SELECT line_state FROM public.fulfillment_order_items WHERE order_id = v_order_id LIMIT 1) = 'intake' THEN
    PERFORM public.fulfillment_confirm_split(v_order_id, 'boh_s3_fixture');
  END IF;

  SELECT id INTO v_po_id FROM public.fulfillment_vendor_pos WHERE order_id = v_order_id LIMIT 1;

  IF (SELECT status FROM public.fulfillment_vendor_pos WHERE id = v_po_id) = 'draft' THEN
    PERFORM public.fulfillment_record_transmission(v_po_id, 'email', 'resend-fixture-chase', 'fulfillment/po/fixture-chase.pdf', 'boh_s3_fixture');
  END IF;

  -- Walk back to ~2 business days (18 business hours) before now(), weekend-
  -- aware (fulfillment_business_hours_between skips Sat/Sun), so floor(bh/8) = 2
  -- => "day 2" regardless of the weekday the reseed runs. Sanctioned side door.
  WHILE public.fulfillment_business_hours_between(v_t, now()) < 18 LOOP
    v_t := v_t - interval '1 hour';
  END LOOP;
  PERFORM set_config('app.fulfillment_writer', 'migration', true);
  UPDATE public.fulfillment_vendor_pos
     SET transmitted_at = v_t, status_entered_at = v_t
   WHERE id = v_po_id;
  UPDATE public.fulfillment_order_items
     SET line_state_entered_at = v_t
   WHERE order_id = v_order_id;

  RAISE NOTICE 'FIXTURE CHASE: order_id=%, order_no=%, po_status=%, business_hours=%',
    v_order_id,
    (SELECT order_no FROM public.fulfillment_orders WHERE id = v_order_id),
    (SELECT status FROM public.fulfillment_vendor_pos WHERE id = v_po_id),
    round(public.fulfillment_business_hours_between(v_t, now()), 2);
END $$;

-- ─── Summary ─────────────────────────────────────────────────────────────
SELECT order_no, client_name, derived_status, band, breached, next_action_kind,
       next_action_params->>'days_overdue' AS day, next_action_params->>'client_surname' AS surname
  FROM public.fulfillment_queue_v
 ORDER BY order_no;
