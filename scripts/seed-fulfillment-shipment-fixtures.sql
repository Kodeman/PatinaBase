-- scripts/seed-fulfillment-shipment-fixtures.sql — BOH S5 Shipment Board fixtures.
--
-- The package S5 accepts-when needs four shipment states the S0-S4 fixtures
-- never produce (S1's own fixtures stop at 'shipped'/'delivered' PO status —
-- none of them create a distinguishable fulfillment_shipments row with the
-- mode/appointment/POD/slip combinations the board needs to demonstrate):
--   (a) PARCEL IN TRANSIT     — shipped, not delivered, no appointment
--                                concept applies (parcel never gates on one).
--   (b) LTL AWAITING APPOINTMENT — shipped, not delivered,
--                                appointment_confirmed_at IS NULL. Deliver
--                                MUST be blocked (the negative case).
--   (c) LTL POD RECORDED, OPEN WINDOW ~2 DAYS OUT — delivered with a POD,
--                                inspection_closes_at close enough to trip
--                                the DeadlineClock's terracotta threshold.
--   (d) SLIPPED CURRENT ETA (+7d vs promised) — shipped, not delivered, the
--                                board's "SEP 10 · +7" slip figure.
--
-- Every mutation goes through a real fulfillment_* RPC EXCEPT three cases,
-- each a SCHEMA GAP this slice found and reported (I10, apps/admin-portal's
-- shipments route.ts headers carry the full writeup) rather than worked
-- around with a migration (S6 is the sole migration writer this wave):
--
--   1. Confirming (c)'s delivery appointment before recording its POD — no
--      RPC writes appointment_confirmed_at. Uses the sanctioned
--      app.fulfillment_writer='migration' side door (the same escape hatch
--      S0/S1's own seeds use) to model the CORRECT real-world order of
--      operations (appointment confirmed, THEN delivered) even though the
--      RPC layer would not itself have stopped a delivery recorded first.
--   2. Precisely dialing (c)'s inspection_closes_at to ~2 days out — the RPC
--      derives it from the vendor's/config's inspection_window_days (3 for
--      this vendor), which would land ~3 days out on whatever day this
--      script runs; adjusted directly (same side door) for a deterministic
--      terracotta countdown regardless of run date, mirroring S3's fixture
--      (d) CHASE's precise business-hours backdating for the same reason.
--   3. (d)'s current_eta/eta_history — NO RPC writes these columns at all in
--      any circumstance (00350 defines them, nothing in 00353 sets them).
--      Set directly via the same side door; this is fixture-only until a
--      later slice adds the RPC an operator would actually use.
--
-- Idempotent by intent, matching scripts/seed-fulfillment-fixtures.sql's
-- contract: fulfillment_intake_order no-ops on a repeat
-- stripe_payment_intent_id, and each advancement step is guarded by the
-- order/PO's current state so re-running this script is safe.
--
-- Run (after `supabase db reset` -> `pnpm seed:fulfillment` ->
-- `psql -f scripts/seed-fulfillment-fixtures.sql`, all already through the
-- intake fn per the S0/S1 runbooks):
--   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" \
--     -v ON_ERROR_STOP=1 -f scripts/seed-fulfillment-shipment-fixtures.sql

\set ON_ERROR_STOP on

-- ═══════════════════════════════════════════════════════════════════════════
-- (a) PARCEL IN TRANSIT — Room & Board (email), no appointment concept
-- ═══════════════════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_order_id uuid;
  v_po_id    uuid;
BEGIN
  SELECT public.fulfillment_intake_order(
    jsonb_build_object(
      'payment_intent', jsonb_build_object('id', 'pi_boh_s5_fixture_parcel'),
      'client', jsonb_build_object('name', 'Soren Delacroix', 'email', 'soren.delacroix@example.com'),
      'ship_to', jsonb_build_object('line1', '212 Larkspur Way', 'city', 'Burlington', 'state', 'VT', 'postal_code', '05401'),
      'designer', jsonb_build_object('attribution', jsonb_build_object('kind', 'self_directed')),
      'totals', jsonb_build_object(
        'captured_total_cents', 322000,
        'product_subtotal_cents', 289000,
        'freight_charged_cents', 12000,
        'tax_cents', 21000
      ),
      'lines', jsonb_build_array(
        jsonb_build_object(
          'product_id', 'a0000000-0000-0000-0000-000000000001',
          'item_name', 'Heirloom Oak Dining Table',
          'qty', 1,
          'unit_price_cents', 289000
        )
      )
    ),
    'boh_s5_fixture'
  ) INTO v_order_id;

  IF (SELECT line_state FROM public.fulfillment_order_items WHERE order_id = v_order_id LIMIT 1) = 'intake' THEN
    PERFORM public.fulfillment_confirm_split(v_order_id, 'boh_s5_fixture');
  END IF;

  SELECT id INTO v_po_id FROM public.fulfillment_vendor_pos WHERE order_id = v_order_id LIMIT 1;

  IF (SELECT status FROM public.fulfillment_vendor_pos WHERE id = v_po_id) = 'draft' THEN
    PERFORM public.fulfillment_record_transmission(v_po_id, 'email', 'fixture-tx-parcel', NULL, 'boh_s5_fixture');
  END IF;

  IF (SELECT status FROM public.fulfillment_vendor_pos WHERE id = v_po_id) = 'sent' THEN
    PERFORM public.fulfillment_record_ack(v_po_id, (now() + interval '10 days')::date, 'email', 'fixture-ack-parcel', 'boh_s5_fixture');
  END IF;

  IF (SELECT status FROM public.fulfillment_vendor_pos WHERE id = v_po_id) = 'acknowledged' THEN
    PERFORM public.fulfillment_record_shipment(v_po_id, 'parcel', 'UPS', '1Z999AA10987654321', 'boh_s5_fixture');
  END IF;

  RAISE NOTICE 'FIXTURE PARCEL: order_id=%, order_no=%, po_status=%',
    v_order_id,
    (SELECT order_no FROM public.fulfillment_orders WHERE id = v_order_id),
    (SELECT status FROM public.fulfillment_vendor_pos WHERE id = v_po_id);
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- (b) LTL AWAITING APPOINTMENT — Lee Industries (portal); Deliver MUST block
-- ═══════════════════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_order_id uuid;
  v_po_id    uuid;
BEGIN
  SELECT public.fulfillment_intake_order(
    jsonb_build_object(
      'payment_intent', jsonb_build_object('id', 'pi_boh_s5_fixture_ltl_awaiting'),
      'client', jsonb_build_object('name', 'Imogen Farrow', 'email', 'imogen.farrow@example.com'),
      'ship_to', jsonb_build_object('line1', '77 Hollow Brook Rd', 'city', 'Hudson', 'state', 'NY', 'postal_code', '12534'),
      'designer', jsonb_build_object('attribution', jsonb_build_object('kind', 'self_directed')),
      'totals', jsonb_build_object(
        'captured_total_cents', 231000,
        'product_subtotal_cents', 210000,
        'freight_charged_cents', 9000,
        'tax_cents', 12000
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
    'boh_s5_fixture'
  ) INTO v_order_id;

  IF (SELECT line_state FROM public.fulfillment_order_items WHERE order_id = v_order_id LIMIT 1) = 'intake' THEN
    PERFORM public.fulfillment_confirm_split(v_order_id, 'boh_s5_fixture');
  END IF;

  SELECT id INTO v_po_id FROM public.fulfillment_vendor_pos WHERE order_id = v_order_id LIMIT 1;

  IF (SELECT status FROM public.fulfillment_vendor_pos WHERE id = v_po_id) = 'draft' THEN
    PERFORM public.fulfillment_record_transmission(v_po_id, 'portal', 'fixture-tx-ltl-await', NULL, 'boh_s5_fixture');
  END IF;

  IF (SELECT status FROM public.fulfillment_vendor_pos WHERE id = v_po_id) = 'sent' THEN
    PERFORM public.fulfillment_record_ack(v_po_id, (now() + interval '18 days')::date, 'portal', 'fixture-ack-ltl-await', 'boh_s5_fixture');
  END IF;

  IF (SELECT status FROM public.fulfillment_vendor_pos WHERE id = v_po_id) = 'acknowledged' THEN
    PERFORM public.fulfillment_record_shipment(v_po_id, 'ltl', 'XPO Logistics', 'XPO-88213377', 'boh_s5_fixture');
  END IF;

  -- Deliberately NO appointment confirmation and NO delivery — this is the
  -- board's negative fixture: Deliver/Upload POD render disabled with a
  -- visible reason, and the API 409s (application-layer gate, I10).

  RAISE NOTICE 'FIXTURE LTL AWAITING APPOINTMENT: order_id=%, order_no=%, po_status=%, shipment_id=%',
    v_order_id,
    (SELECT order_no FROM public.fulfillment_orders WHERE id = v_order_id),
    (SELECT status FROM public.fulfillment_vendor_pos WHERE id = v_po_id),
    (SELECT id FROM public.fulfillment_shipments WHERE po_id = v_po_id LIMIT 1);
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- (c) LTL POD RECORDED, OPEN WINDOW ~2 DAYS OUT — Mitchell Gold + Bob
--     Williams (email); appointment confirmed via the GUC side door (gap 1),
--     inspection_closes_at dialed to exactly +2 days (gap 2) for a
--     deterministic terracotta DeadlineClock regardless of run date.
-- ═══════════════════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_order_id uuid;
  v_po_id    uuid;
  v_ship_id  uuid;
BEGIN
  SELECT public.fulfillment_intake_order(
    jsonb_build_object(
      'payment_intent', jsonb_build_object('id', 'pi_boh_s5_fixture_ltl_pod'),
      'client', jsonb_build_object('name', 'Baxter Linden', 'email', 'baxter.linden@example.com'),
      'ship_to', jsonb_build_object('line1', '4 Cinder Block Ln', 'city', 'Richmond', 'state', 'VA', 'postal_code', '23220'),
      'designer', jsonb_build_object('attribution', jsonb_build_object('kind', 'self_directed')),
      'totals', jsonb_build_object(
        'captured_total_cents', 96000,
        'product_subtotal_cents', 89000,
        'freight_charged_cents', 4000,
        'tax_cents', 3000
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
    'boh_s5_fixture'
  ) INTO v_order_id;

  IF (SELECT line_state FROM public.fulfillment_order_items WHERE order_id = v_order_id LIMIT 1) = 'intake' THEN
    PERFORM public.fulfillment_confirm_split(v_order_id, 'boh_s5_fixture');
  END IF;

  SELECT id INTO v_po_id FROM public.fulfillment_vendor_pos WHERE order_id = v_order_id LIMIT 1;

  IF (SELECT status FROM public.fulfillment_vendor_pos WHERE id = v_po_id) = 'draft' THEN
    PERFORM public.fulfillment_record_transmission(v_po_id, 'email', 'fixture-tx-ltl-pod', NULL, 'boh_s5_fixture');
  END IF;

  IF (SELECT status FROM public.fulfillment_vendor_pos WHERE id = v_po_id) = 'sent' THEN
    PERFORM public.fulfillment_record_ack(v_po_id, (now() + interval '5 days')::date, 'email', 'fixture-ack-ltl-pod', 'boh_s5_fixture');
  END IF;

  IF (SELECT status FROM public.fulfillment_vendor_pos WHERE id = v_po_id) = 'acknowledged' THEN
    PERFORM public.fulfillment_record_shipment(v_po_id, 'ltl', 'Estes Express', 'EST-4471209', 'boh_s5_fixture');
  END IF;

  SELECT id INTO v_ship_id FROM public.fulfillment_shipments WHERE po_id = v_po_id LIMIT 1;

  -- Gap 1: confirm the appointment via the sanctioned side door (no RPC
  -- exists — see the header note and BOH-DECISIONS I10).
  IF v_ship_id IS NOT NULL AND (SELECT appointment_confirmed_at FROM public.fulfillment_shipments WHERE id = v_ship_id) IS NULL THEN
    PERFORM set_config('app.fulfillment_writer', 'migration', true);
    UPDATE public.fulfillment_shipments SET appointment_confirmed_at = now() - interval '1 day' WHERE id = v_ship_id;
  END IF;

  IF v_ship_id IS NOT NULL AND (SELECT delivered_at FROM public.fulfillment_shipments WHERE id = v_ship_id) IS NULL THEN
    PERFORM public.fulfillment_record_delivery(v_ship_id, 'fulfillment/pod/' || v_ship_id || '/fixture-pod.jpg', 'boh_s5_fixture');
  END IF;

  -- Gap 2: dial the window to exactly +2 days from now, deterministic
  -- regardless of the vendor's configured inspection_window_days or the day
  -- this script runs (mirrors S3 fixture (d) CHASE's precise backdating).
  PERFORM set_config('app.fulfillment_writer', 'migration', true);
  UPDATE public.fulfillment_shipments
     SET inspection_closes_at = now() + interval '2 days'
   WHERE id = v_ship_id;

  RAISE NOTICE 'FIXTURE LTL POD (open window ~2d): order_id=%, order_no=%, shipment_id=%, inspection_closes_at=%',
    v_order_id,
    (SELECT order_no FROM public.fulfillment_orders WHERE id = v_order_id),
    v_ship_id,
    (SELECT inspection_closes_at FROM public.fulfillment_shipments WHERE id = v_ship_id);
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- (d) SLIPPED CURRENT ETA (+7d vs promised) — Blu Dot (csv). current_eta/
--     eta_history set via the GUC side door (gap 3 — no RPC writes these
--     columns at all today).
-- ═══════════════════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_order_id uuid;
  v_po_id    uuid;
  v_ship_id  uuid;
  v_promised date;
  v_slipped  date;
BEGIN
  SELECT public.fulfillment_intake_order(
    jsonb_build_object(
      'payment_intent', jsonb_build_object('id', 'pi_boh_s5_fixture_slip'),
      'client', jsonb_build_object('name', 'Odette Marchetti', 'email', 'odette.marchetti@example.com'),
      'ship_to', jsonb_build_object('line1', '9 Foundry St', 'city', 'Providence', 'state', 'RI', 'postal_code', '02903'),
      'designer', jsonb_build_object('attribution', jsonb_build_object('kind', 'self_directed')),
      'totals', jsonb_build_object(
        'captured_total_cents', 82000,
        'product_subtotal_cents', 75000,
        'freight_charged_cents', 4000,
        'tax_cents', 3000
      ),
      'lines', jsonb_build_array(
        jsonb_build_object(
          'product_id', 'a0000000-0000-0000-0000-000000000013',
          'item_name', 'Marble Side Table',
          'qty', 1,
          'unit_price_cents', 75000
        )
      )
    ),
    'boh_s5_fixture'
  ) INTO v_order_id;

  IF (SELECT line_state FROM public.fulfillment_order_items WHERE order_id = v_order_id LIMIT 1) = 'intake' THEN
    PERFORM public.fulfillment_confirm_split(v_order_id, 'boh_s5_fixture');
  END IF;

  SELECT id INTO v_po_id FROM public.fulfillment_vendor_pos WHERE order_id = v_order_id LIMIT 1;

  IF (SELECT status FROM public.fulfillment_vendor_pos WHERE id = v_po_id) = 'draft' THEN
    PERFORM public.fulfillment_record_transmission(v_po_id, 'csv', 'fixture-tx-slip', NULL, 'boh_s5_fixture');
  END IF;

  IF (SELECT status FROM public.fulfillment_vendor_pos WHERE id = v_po_id) = 'sent' THEN
    PERFORM public.fulfillment_record_ack(v_po_id, (now() + interval '3 days')::date, 'csv', 'fixture-ack-slip', 'boh_s5_fixture');
  END IF;

  IF (SELECT status FROM public.fulfillment_vendor_pos WHERE id = v_po_id) = 'acknowledged' THEN
    PERFORM public.fulfillment_record_shipment(v_po_id, 'parcel', 'FedEx Freight', 'FDXF-3391882', 'boh_s5_fixture');
  END IF;

  SELECT id INTO v_ship_id FROM public.fulfillment_shipments WHERE po_id = v_po_id LIMIT 1;
  SELECT committed_ship INTO v_promised FROM public.fulfillment_vendor_pos WHERE id = v_po_id;
  v_slipped := v_promised + interval '7 days';

  -- Gap 3: no RPC writes current_eta/eta_history in any circumstance today.
  PERFORM set_config('app.fulfillment_writer', 'migration', true);
  UPDATE public.fulfillment_shipments
     SET current_eta = v_slipped,
         eta_history = eta_history || jsonb_build_object(
           'at', now(), 'from', v_promised, 'to', v_slipped, 'reason', 'carrier delay (fixture)'
         )
   WHERE id = v_ship_id;

  RAISE NOTICE 'FIXTURE SLIPPED ETA: order_id=%, order_no=%, promised=%, current_eta=%',
    v_order_id,
    (SELECT order_no FROM public.fulfillment_orders WHERE id = v_order_id),
    v_promised,
    v_slipped;
END $$;

-- ─── Summary ─────────────────────────────────────────────────────────────
SELECT
  o.order_no,
  o.client_name,
  sh.mode,
  sh.carrier,
  sh.tracking,
  sh.appointment_confirmed_at IS NOT NULL AS appointment_confirmed,
  sh.delivered_at IS NOT NULL            AS delivered,
  sh.pod_r2_key IS NOT NULL              AS pod_recorded,
  sh.inspection_closes_at,
  p.committed_ship                       AS promised_eta,
  sh.current_eta
FROM public.fulfillment_shipments sh
JOIN public.fulfillment_vendor_pos p ON p.id = sh.po_id
JOIN public.fulfillment_orders o     ON o.id = p.order_id
WHERE p.order_id IN (
  SELECT id FROM public.fulfillment_orders
   WHERE stripe_payment_intent_id IN (
     'pi_boh_s5_fixture_parcel', 'pi_boh_s5_fixture_ltl_awaiting',
     'pi_boh_s5_fixture_ltl_pod', 'pi_boh_s5_fixture_slip'
   )
)
ORDER BY o.order_no;
