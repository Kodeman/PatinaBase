-- fulfillment_transmission.assert.sql — BOH S3 (PO Composer & Transmission Log).
--
-- Asserts the transmission-slice invariants against a freshly reset + seeded +
-- fixtured DB (same precondition as the S0/S1 audits that run before this in
-- test:boh-audit — seed:fulfillment + scripts/seed-fulfillment-fixtures.sql).
--   T1  the log is append-only — UPDATE on a po.* event is DENIED
--   T2  the CHASE fixture surfaces "Chase Vandermeer — day 2", business-hours-aware
--   T3  weekend-boundary chase math (a Fri→Tue span skips Sat/Sun)
--   T4  a correction (a re-send) APPENDS a second SENT line; the original is immutable
--   T5  ack re-dates the client ETA (committed_ship) + drafts the client note
-- T4/T5 set up their own throwaway order via the real RPCs inside a transaction
-- that is ROLLED BACK, so the assert is idempotent and leaves no residue.

\set ON_ERROR_STOP on

-- ── T1: append-only — UPDATE on a po.transmitted event is denied ─────────────
DO $$
DECLARE v_evt bigint; v_denied boolean := false;
BEGIN
  SELECT id INTO v_evt FROM public.fulfillment_events WHERE event_type = 'po.transmitted' LIMIT 1;
  IF v_evt IS NULL THEN
    RAISE EXCEPTION 'T1 SETUP: no po.transmitted event present (run seed:fulfillment + fixtures first)';
  END IF;
  BEGIN
    UPDATE public.fulfillment_events SET actor = 'tamper' WHERE id = v_evt;
  EXCEPTION WHEN OTHERS THEN v_denied := true;
  END;
  IF NOT v_denied THEN
    RAISE EXCEPTION 'T1 FAIL: UPDATE on a po.transmitted event was NOT denied (append-only broken)';
  END IF;
  RAISE NOTICE 'T1 PASS: transmission log is append-only (UPDATE on a po.* event denied)';
END $$;

-- ── T2: the CHASE fixture surfaces day 2 / chase_ack / needs_action_now ──────
DO $$
DECLARE r record;
BEGIN
  SELECT band, next_action_kind, breached,
         (next_action_params->>'days_overdue')::int AS day,
         next_action_params->>'client_surname'      AS surname
    INTO r
    FROM public.fulfillment_queue_v
   WHERE client_name = 'Camille Vandermeer';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'T2 SETUP: chase fixture (Camille Vandermeer) missing — run the fixtures script';
  END IF;
  IF r.band <> 'needs_action_now' OR r.next_action_kind <> 'chase_ack'
     OR r.day <> 2 OR NOT r.breached OR r.surname <> 'Vandermeer' THEN
    RAISE EXCEPTION 'T2 FAIL: chase fixture band=% kind=% day=% breached=% surname=%',
      r.band, r.next_action_kind, r.day, r.breached, r.surname;
  END IF;
  RAISE NOTICE 'T2 PASS: chase fixture → needs_action_now / chase_ack / day 2 / Vandermeer';
END $$;

-- ── T3: weekend-boundary chase math (Fri→Tue skips Sat/Sun) ──────────────────
DO $$
DECLARE
  v_mon date := date_trunc('week', DATE '2026-07-13')::date; -- a Monday
  v_fri_10 timestamptz := ((v_mon + 4) + time '10:00') AT TIME ZONE 'America/Chicago';
  v_tue_10 timestamptz := ((v_mon + 8) + time '10:00') AT TIME ZONE 'America/Chicago';
  v_bh numeric;
BEGIN
  v_bh := public.fulfillment_business_hours_between(v_fri_10, v_tue_10);
  -- Fri 10-17 (7) + [Sat/Sun skipped] + Mon 9-17 (8) + Tue 9-10 (1) = 16 business
  -- hours across a ~96 wall-clock-hour span. floor(16/8) = 2 → "day 2".
  IF round(v_bh) <> 16 THEN
    RAISE EXCEPTION 'T3 FAIL: Fri→Tue = % business hours (expected 16 — weekend not skipped?)', v_bh;
  END IF;
  IF floor(v_bh / 8.0) <> 2 THEN
    RAISE EXCEPTION 'T3 FAIL: chase day = % (expected 2)', floor(v_bh / 8.0);
  END IF;
  RAISE NOTICE 'T3 PASS: weekend-boundary chase math — Fri→Tue = % business hours → day 2 (Sat/Sun skipped)', round(v_bh, 2);
END $$;

-- ── T4 + T5: correction appends + ack re-dates ETA + drafts note (rolled back) ─
BEGIN;
DO $$
DECLARE
  v_order uuid; v_po uuid;
  v_evt_first bigint; v_first_created timestamptz; v_first_now timestamptz;
  v_sent_count int; v_committed date; v_note uuid; v_note_evt int;
BEGIN
  v_order := public.fulfillment_intake_order(
    jsonb_build_object(
      'payment_intent', jsonb_build_object('id', 'pi_boh_s3_assert_tx'),
      'client', jsonb_build_object('name', 'Assert Client'),
      'totals', jsonb_build_object('captured_total_cents', 100000, 'product_subtotal_cents', 90000,
                                   'freight_charged_cents', 5000, 'tax_cents', 5000),
      'lines', jsonb_build_array(jsonb_build_object(
        'product_id', 'a0000000-0000-0000-0000-000000000002',
        'item_name', 'Walnut Credenza', 'qty', 1, 'unit_price_cents', 90000))
    ), 'boh_s3_assert');
  PERFORM public.fulfillment_confirm_split(v_order, 'boh_s3_assert');
  SELECT id INTO v_po FROM public.fulfillment_vendor_pos WHERE order_id = v_order LIMIT 1;

  -- SENT #1
  PERFORM public.fulfillment_record_transmission(v_po, 'email', 'msg-first', 'fulfillment/po/assert.pdf', 'boh_s3_assert');
  SELECT id, created_at INTO v_evt_first, v_first_created
    FROM public.fulfillment_events WHERE po_id = v_po AND event_type = 'po.transmitted' ORDER BY id LIMIT 1;

  -- SENT #2 — a correction / re-send: it APPENDS, never edits the first.
  PERFORM public.fulfillment_record_transmission(v_po, 'email', 'msg-resend', 'fulfillment/po/assert.pdf', 'boh_s3_assert');
  SELECT count(*) INTO v_sent_count
    FROM public.fulfillment_events WHERE po_id = v_po AND event_type = 'po.transmitted';
  IF v_sent_count <> 2 THEN
    RAISE EXCEPTION 'T4 FAIL: correction did not append (po.transmitted count=% expected 2)', v_sent_count;
  END IF;
  SELECT created_at INTO v_first_now FROM public.fulfillment_events WHERE id = v_evt_first;
  IF v_first_now <> v_first_created THEN
    RAISE EXCEPTION 'T4 FAIL: the original po.transmitted event was mutated';
  END IF;
  RAISE NOTICE 'T4 PASS: correction appends (2 po.transmitted events; original immutable)';

  -- T5: ack re-dates committed_ship (client ETA basis) + drafts the client note.
  PERFORM public.fulfillment_record_ack(v_po, DATE '2026-09-01', 'phone', 'ACK-ASSERT', 'boh_s3_assert');
  SELECT committed_ship INTO v_committed FROM public.fulfillment_vendor_pos WHERE id = v_po;
  IF v_committed <> DATE '2026-09-01' THEN
    RAISE EXCEPTION 'T5 FAIL: committed_ship not re-dated (got %)', v_committed;
  END IF;
  v_note := public.fulfillment_record_client_note(
    NULL, v_order, 'eta_change', 'email', 'eta_change',
    'Your order ETA has changed.', NULL, NULL, NULL, NULL, 'boh_s3_assert');
  IF NOT EXISTS (
    SELECT 1 FROM public.fulfillment_client_notifications
     WHERE id = v_note AND order_id = v_order AND drafted_body IS NOT NULL AND sent_at IS NULL
  ) THEN
    RAISE EXCEPTION 'T5 FAIL: drafted client-note row missing or already sent';
  END IF;
  SELECT count(*) INTO v_note_evt
    FROM public.fulfillment_events WHERE order_id = v_order AND event_type = 'notification.drafted';
  IF v_note_evt < 1 THEN
    RAISE EXCEPTION 'T5 FAIL: notification.drafted event missing';
  END IF;
  RAISE NOTICE 'T5 PASS: ack re-dates client ETA (2026-09-01) + drafted note row + notification.drafted event';
END $$;
ROLLBACK;

\echo '── fulfillment_transmission.assert.sql: ALL PASS (T1-T5) ──'
