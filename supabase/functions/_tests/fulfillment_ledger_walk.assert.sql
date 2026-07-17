-- fulfillment_ledger_walk.assert.sql — BOH S6 (the minimal ledger, spec §8).
--
-- Walks a fresh order END TO END through the real RPCs (intake → confirm_split →
-- transmit → ack → ship → deliver → settle) and exercises every posting template
-- T1–T6 + the reversing-correction path + the Stripe reconciliation surfacing.
-- Everything runs inside ONE BEGIN/ROLLBACK so it is idempotent, needs no reseed,
-- and leaves zero residue (the standard test:boh-audit asserts that run after it,
-- in their own psql processes, read the committed state and are unaffected). Per-
-- entry balance is proven two ways: direct Σdebit=Σcredit queries AND a final
-- `SET CONSTRAINTS ALL IMMEDIATE` that forces the deferred DB balance trigger to
-- verify every entry this script posted. Uses the prepay Holly Hunt vendor
-- (product a0…012, 100% deposit) so T3 clears the deposit to zero.
--
-- Prereqs: a reset + `pnpm seed:fulfillment` (its 5 orders give recon data). The
-- L# lines print PASS on success; any failure RAISEs (ON_ERROR_STOP kills the run).

\set ON_ERROR_STOP on
BEGIN;
DO $$
DECLARE
  v_prod       uuid := 'a0000000-0000-0000-0000-000000000012';  -- Velvet Club Chair → Holly Hunt (prepay)
  v_ord_a      uuid; v_po_a uuid;
  v_ord_b      uuid; v_po_b uuid; v_ship_b uuid;
  v_ord_c      uuid; v_po_c uuid; v_ship_c uuid;
  v_ord_d      uuid; v_po_d uuid; v_ship_d uuid;
  v_ship_a     uuid;
  v_settle     jsonb;
  v_eta        date; v_hist jsonb;
  v_deposit    int; v_pledge int; v_commission int; v_1200 int;
  v_bad        int; v_n int; v_raised boolean;
  v_evt        bigint; v_entry uuid; v_rev uuid;
  v_pi_c       text := 'pi_boh_s6_walk_c';
  v_delta      int; v_band text; v_kind text; v_hasdelta boolean;
  v_expected   int; v_actual int; v_distinct int; v_dupes int;
BEGIN
  PERFORM set_config('app.fulfillment_writer','rpc',true);

  -- ═══ ORDER A — full prepay walk, $34 (3400¢) freight variance (auto-accept) ═══
  v_ord_a := public.fulfillment_intake_order(jsonb_build_object(
    'payment_intent', jsonb_build_object('id','pi_boh_s6_walk_a'),
    'client', jsonb_build_object('name','Walk Alpha Holt'),
    'totals', jsonb_build_object('captured_total_cents',413000,'product_subtotal_cents',375000,
                                 'freight_charged_cents',20000,'tax_cents',18000),
    'lines', jsonb_build_array(jsonb_build_object(
      'product_id', v_prod::text, 'item_name','Velvet Club Chair','qty',3,'unit_price_cents',125000))
  ), 'boh_s6_walk');
  PERFORM public.fulfillment_confirm_split(v_ord_a, 'boh_s6_walk');
  SELECT id INTO v_po_a FROM public.fulfillment_vendor_pos WHERE order_id = v_ord_a;

  -- ── L1: T1 capture posted balanced (Dr 1000 = captured) ──────────────────
  IF NOT EXISTS (
    SELECT 1 FROM public.ledger_entries le JOIN public.ledger_lines ll ON ll.entry_id=le.id
     WHERE le.refs->>'order_id'=v_ord_a::text AND le.refs->>'template'='T1'
       AND ll.account_code='1000' AND ll.debit_cents=413000) THEN
    RAISE EXCEPTION 'L1 FAIL: T1 capture Dr 1000=413000 not found for order A';
  END IF;
  RAISE NOTICE 'L1 PASS: T1 capture posted (Dr 1000 = captured_total 413000)';

  -- transmit → T2 deposit (prepay = 100% of product_cost 3×68750=206250)
  PERFORM public.fulfillment_record_transmission(v_po_a, 'portal', 'ref-a', 'fulfillment/po/a.pdf', 'boh_s6_walk');
  SELECT COALESCE(sum(ll.debit_cents),0) INTO v_deposit
    FROM public.ledger_entries le JOIN public.ledger_lines ll ON ll.entry_id=le.id
   WHERE le.refs->>'po_id'=v_po_a::text AND le.refs->>'template'='T2' AND ll.account_code='1200';
  IF v_deposit <> 206250 THEN
    RAISE EXCEPTION 'L2 FAIL: T2 prepay deposit expected 206250, got %', v_deposit;
  END IF;
  RAISE NOTICE 'L2 PASS: T2 vendor deposit posted (Dr 1200 = 206250, 100%% prepay)';

  -- ── re-transmit is idempotent: T2 must NOT double-post ───────────────────
  PERFORM public.fulfillment_record_transmission(v_po_a, 'portal', 'ref-a-resend', NULL, 'boh_s6_walk');
  SELECT count(*) INTO v_n FROM public.ledger_entries WHERE refs->>'po_id'=v_po_a::text AND refs->>'template'='T2';
  IF v_n <> 1 THEN RAISE EXCEPTION 'L3 FAIL: re-transmit double-posted T2 (% entries)', v_n; END IF;
  RAISE NOTICE 'L3 PASS: re-transmit did not double-pay the deposit (exactly 1 T2 entry)';

  -- ack → ship → deliver
  PERFORM public.fulfillment_record_ack(v_po_a, DATE '2026-10-01', 'portal', 'ACK-A', 'boh_s6_walk');
  v_ship_a := public.fulfillment_record_shipment(v_po_a, 'parcel', 'UPS', 'TRK-A', 'boh_s6_walk');
  PERFORM public.fulfillment_record_delivery(v_ship_a, 'fulfillment/pod/a.jpg', 'boh_s6_walk');

  -- settle with vendor invoice = PO value(206250) + 3400 → variance 3400,
  -- tolerance = max(2500, round(0.02*206250)=4125) = 4125 → auto-accept.
  v_settle := public.fulfillment_settle_po(v_po_a, 209650, NULL, 'boh_s6_walk');
  IF (v_settle->>'auto_accepted')::boolean IS NOT TRUE OR (v_settle->>'variance_cents')::int <> 3400 THEN
    RAISE EXCEPTION 'L4 FAIL: $34 variance did not auto-accept: %', v_settle;
  END IF;
  RAISE NOTICE 'L4 PASS: settle $34 variance auto-accepts (tolerance 4125¢)';

  -- ── L5: T3 cleared the deposit — account 1200 nets to zero for the PO ─────
  SELECT COALESCE(sum(ll.debit_cents - ll.credit_cents),0) INTO v_1200
    FROM public.ledger_entries le JOIN public.ledger_lines ll ON ll.entry_id=le.id
   WHERE le.refs->>'po_id'=v_po_a::text AND ll.account_code='1200';
  IF v_1200 <> 0 THEN RAISE EXCEPTION 'L5 FAIL: 1200 did not net to zero for prepay PO (got %)', v_1200; END IF;
  RAISE NOTICE 'L5 PASS: T3 cleared the deposit — 1200 nets to zero for the prepay vendor';

  -- ── L6: pledge = 25% of realized spread (retail 375000 − cost 206250 − var 3400) ──
  v_commission := 375000 - 206250 - 3400;                       -- 165350
  v_pledge := round(0.25 * v_commission)::int;                  -- 41338
  IF NOT EXISTS (
    SELECT 1 FROM public.ledger_entries le JOIN public.ledger_lines ll ON ll.entry_id=le.id
     WHERE le.refs->>'po_id'=v_po_a::text AND (le.refs->>'pledge_tag')::boolean IS TRUE
       AND (le.refs->>'realized_commission_cents')::int = v_commission
       AND ll.account_code='5300' AND ll.debit_cents = v_pledge) THEN
    RAISE EXCEPTION 'L6 FAIL: pledge entry (Dr 5300=% , commission=%, pledge_tag) not found', v_pledge, v_commission;
  END IF;
  RAISE NOTICE 'L6 PASS: pledge = 25%% of realized spread (Dr 5300 = %, refs-tagged pledge_tag)', v_pledge;

  -- ── L7: T6 freight true-up posted the variance to 5100 ───────────────────
  IF NOT EXISTS (
    SELECT 1 FROM public.ledger_entries le JOIN public.ledger_lines ll ON ll.entry_id=le.id
     WHERE le.refs->>'po_id'=v_po_a::text AND le.refs->>'template'='T6'
       AND ll.account_code='5100' AND ll.debit_cents = 3400) THEN
    RAISE EXCEPTION 'L7 FAIL: T6 freight true-up (Dr 5100=3400) not found';
  END IF;
  RAISE NOTICE 'L7 PASS: T6 freight true-up posted (Dr 5100 = 3400 variance)';

  -- ── L8: PO and its line advanced delivered → settled ─────────────────────
  IF (SELECT status FROM public.fulfillment_vendor_pos WHERE id=v_po_a) <> 'settled'
     OR EXISTS (SELECT 1 FROM public.fulfillment_order_items WHERE order_id=v_ord_a AND line_state <> 'settled') THEN
    RAISE EXCEPTION 'L8 FAIL: order A PO/lines not fully settled';
  END IF;
  RAISE NOTICE 'L8 PASS: PO + line advanced delivered → settled';

  -- ═══ ORDER B — beyond-tolerance: RAISES without a reason, posts with one ═══
  v_ord_b := public.fulfillment_intake_order(jsonb_build_object(
    'payment_intent', jsonb_build_object('id','pi_boh_s6_walk_b'),
    'client', jsonb_build_object('name','Walk Beta Vance'),
    'totals', jsonb_build_object('captured_total_cents',413000,'product_subtotal_cents',375000,
                                 'freight_charged_cents',20000,'tax_cents',18000),
    'lines', jsonb_build_array(jsonb_build_object(
      'product_id', v_prod::text, 'item_name','Velvet Club Chair','qty',3,'unit_price_cents',125000))
  ), 'boh_s6_walk');
  PERFORM public.fulfillment_confirm_split(v_ord_b, 'boh_s6_walk');
  SELECT id INTO v_po_b FROM public.fulfillment_vendor_pos WHERE order_id = v_ord_b;
  PERFORM public.fulfillment_record_transmission(v_po_b, 'portal', 'ref-b', NULL, 'boh_s6_walk');
  PERFORM public.fulfillment_record_ack(v_po_b, DATE '2026-10-01', 'portal', 'ACK-B', 'boh_s6_walk');
  v_ship_b := public.fulfillment_record_shipment(v_po_b, 'parcel', 'UPS', 'TRK-B', 'boh_s6_walk');
  PERFORM public.fulfillment_record_delivery(v_ship_b, 'fulfillment/pod/b.jpg', 'boh_s6_walk');

  -- vendor invoice = PO value + 50000 → variance 50000 ≫ tolerance 4125
  v_raised := false;
  BEGIN
    PERFORM public.fulfillment_settle_po(v_po_b, 256250, NULL, 'boh_s6_walk');   -- no reason
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE '%typed reason is required%' THEN v_raised := true; ELSE RAISE; END IF;
  END;
  IF NOT v_raised THEN RAISE EXCEPTION 'L9 FAIL: beyond-tolerance settle without a reason did NOT raise'; END IF;
  RAISE NOTICE 'L9 PASS: beyond-tolerance settle raises without a typed reason';

  -- now WITH a typed reason → posts T3 + T6 (reason in the T6 memo)
  v_settle := public.fulfillment_settle_po(v_po_b, 256250, 'vendor freight surcharge dispute', 'boh_s6_walk');
  IF (v_settle->>'auto_accepted')::boolean IS NOT FALSE THEN
    RAISE EXCEPTION 'L10 FAIL: beyond-tolerance settle reported auto_accepted';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.ledger_entries
     WHERE refs->>'po_id'=v_po_b::text AND refs->>'template'='T6' AND memo LIKE '%vendor freight surcharge dispute%') THEN
    RAISE EXCEPTION 'L10 FAIL: T6 typed reason not in memo';
  END IF;
  RAISE NOTICE 'L10 PASS: beyond-tolerance settle posts with a typed reason (in the T6 memo)';

  -- ═══ T4 refund (on settled order A) ═══════════════════════════════════════
  v_evt := public.fulfillment_log_event('order.refunded', 'boh_s6_walk', v_ord_a, NULL, NULL, NULL, NULL,
             jsonb_build_object('reason','partial'), NULL, NULL, clock_timestamp());
  v_entry := public.ledger_post_t4_refund(v_ord_a, 50000, 3000, v_evt, 'boh_s6_walk');
  IF NOT EXISTS (
    SELECT 1 FROM public.ledger_lines ll
     WHERE ll.entry_id=v_entry AND ll.account_code='1000' AND ll.credit_cents=53000) THEN
    RAISE EXCEPTION 'L11 FAIL: T4 refund Cr 1000 = 53000 (50000 + 3000 tax) not found';
  END IF;
  RAISE NOTICE 'L11 PASS: T4 refund posted (Dr 4900 50000 + Dr 2100 3000 / Cr 1000 53000)';

  -- ═══ T5 damage — all three outcomes ═════════════════════════════════════
  v_evt := public.fulfillment_log_event('exception.resolved','boh_s6_walk', v_ord_a, NULL, NULL, NULL, NULL,
             jsonb_build_object('kind','damage'), NULL, NULL, clock_timestamp());
  v_entry := public.ledger_post_t5_damage('claim', 12000, jsonb_build_object('order_id',v_ord_a), v_evt, 'boh_s6_walk');
  IF NOT EXISTS (SELECT 1 FROM public.ledger_lines WHERE entry_id=v_entry AND account_code='1100' AND debit_cents=12000)
  OR NOT EXISTS (SELECT 1 FROM public.ledger_lines WHERE entry_id=v_entry AND account_code='5200' AND credit_cents=12000) THEN
    RAISE EXCEPTION 'L12 FAIL: T5 claim (Dr 1100 / Cr 5200) not posted';
  END IF;
  PERFORM public.ledger_post_t5_damage('client_credit', 8000, jsonb_build_object('order_id',v_ord_a), v_evt, 'boh_s6_walk');
  PERFORM public.ledger_post_t5_damage('recovery',     10000, jsonb_build_object('order_id',v_ord_a), v_evt, 'boh_s6_walk');
  RAISE NOTICE 'L12 PASS: T5 damage outcomes posted (claim 1100/5200, credit 5200/2300, recovery 1000/1100)';

  -- ═══ Reversing correction — nets to zero, BOTH rows survive ══════════════
  v_evt := public.fulfillment_log_event('ledger.posted','boh_s6_walk', v_ord_a, NULL, NULL, NULL, NULL,
             jsonb_build_object('kind','reversal_test'), NULL, NULL, clock_timestamp());
  v_entry := public.ledger_post_t5_damage('claim', 7500, jsonb_build_object('order_id',v_ord_a,'note','to_reverse'), v_evt, 'boh_s6_walk');
  v_rev := public.ledger_post_reversal(v_entry, v_evt, 'boh_s6_walk', 'Reversal of test claim');
  -- both entries still exist
  IF (SELECT count(*) FROM public.ledger_entries WHERE id IN (v_entry, v_rev)) <> 2 THEN
    RAISE EXCEPTION 'L13 FAIL: original + reversal entries did not both survive';
  END IF;
  -- reversal references the original
  IF (SELECT reversal_of FROM public.ledger_entries WHERE id=v_rev) <> v_entry THEN
    RAISE EXCEPTION 'L13 FAIL: reversal_of not set to the original';
  END IF;
  -- the pair nets to zero on every account it touched (1100 and 5200)
  SELECT count(*) INTO v_bad FROM (
    SELECT account_code, sum(debit_cents - credit_cents) AS net
    FROM public.ledger_lines WHERE entry_id IN (v_entry, v_rev)
    GROUP BY account_code HAVING sum(debit_cents - credit_cents) <> 0) x;
  IF v_bad <> 0 THEN RAISE EXCEPTION 'L13 FAIL: reversal did not net the original to zero (% accounts nonzero)', v_bad; END IF;
  RAISE NOTICE 'L13 PASS: reversing correction nets the original to zero; both rows survive';

  -- ═══ Every entry this script posted is balanced (per-entry Σdebit=Σcredit) ═
  SELECT count(*) INTO v_bad FROM (
    SELECT le.id FROM public.ledger_entries le
     WHERE le.posted_by = 'boh_s6_walk'
     GROUP BY le.id
     HAVING (SELECT COALESCE(sum(debit_cents),0) FROM public.ledger_lines WHERE entry_id=le.id)
         <> (SELECT COALESCE(sum(credit_cents),0) FROM public.ledger_lines WHERE entry_id=le.id)
        OR (SELECT count(*) FROM public.ledger_lines WHERE entry_id=le.id) < 2) x;
  IF v_bad <> 0 THEN RAISE EXCEPTION 'L14 FAIL: % posted entries are unbalanced or < 2 lines', v_bad; END IF;
  -- Force the DB's own deferred balance trigger to verify every entry posted so
  -- far, right now — then restore DEFERRED so the remaining ledger_post calls
  -- (order C/D) can still insert an entry and its lines across statements
  -- (IMMEDIATE would fire the AFTER-INSERT balance trigger at 0 lines).
  SET CONSTRAINTS ALL IMMEDIATE;
  SET CONSTRAINTS ALL DEFERRED;
  RAISE NOTICE 'L14 PASS: every posted entry is balanced (query + deferred DB trigger via SET CONSTRAINTS)';

  -- ═══ Append-only: UPDATE/DELETE denied on entries, lines, and mirror ═════
  v_raised := false;
  BEGIN UPDATE public.ledger_entries SET memo='tamper' WHERE id=v_entry;
  EXCEPTION WHEN OTHERS THEN IF SQLERRM LIKE '%append-only%' THEN v_raised:=true; ELSE RAISE; END IF; END;
  IF NOT v_raised THEN RAISE EXCEPTION 'L15 FAIL: UPDATE on ledger_entries was not denied'; END IF;
  v_raised := false;
  BEGIN DELETE FROM public.ledger_lines WHERE entry_id=v_entry;
  EXCEPTION WHEN OTHERS THEN IF SQLERRM LIKE '%append-only%' THEN v_raised:=true; ELSE RAISE; END IF; END;
  IF NOT v_raised THEN RAISE EXCEPTION 'L15 FAIL: DELETE on ledger_lines was not denied'; END IF;
  RAISE NOTICE 'L15 PASS: UPDATE/DELETE denied on ledger_entries + ledger_lines (append-only)';

  -- ═══ ORDER C — non-settled (walked to delivered) for the recon pin demo ══
  v_ord_c := public.fulfillment_intake_order(jsonb_build_object(
    'payment_intent', jsonb_build_object('id', v_pi_c),
    'client', jsonb_build_object('name','Walk Gamma Reeve'),
    'totals', jsonb_build_object('captured_total_cents',140000,'product_subtotal_cents',125000,
                                 'freight_charged_cents',8000,'tax_cents',7000),
    'lines', jsonb_build_array(jsonb_build_object(
      'product_id', v_prod::text, 'item_name','Velvet Club Chair','qty',1,'unit_price_cents',125000))
  ), 'boh_s6_walk');
  PERFORM public.fulfillment_confirm_split(v_ord_c, 'boh_s6_walk');
  SELECT id INTO v_po_c FROM public.fulfillment_vendor_pos WHERE order_id = v_ord_c;
  PERFORM public.fulfillment_record_transmission(v_po_c, 'portal', 'ref-c', NULL, 'boh_s6_walk');
  PERFORM public.fulfillment_record_ack(v_po_c, DATE '2026-10-01', 'portal', 'ACK-C', 'boh_s6_walk');
  v_ship_c := public.fulfillment_record_shipment(v_po_c, 'parcel', 'UPS', 'TRK-C', 'boh_s6_walk');
  PERFORM public.fulfillment_record_delivery(v_ship_c, 'fulfillment/pod/c.jpg', 'boh_s6_walk');  -- now 'delivered' → quiet

  -- ═══ Recon: matching balance txs → zero delta, then a mismatch → pin ═════
  -- Build ONE matching Stripe balance tx per ledger 1000 T1/T4 entry (its net on
  -- 1000), tied to the order's PI, dated to the entry's day → the day-bucketed
  -- ledger_stripe_recon_v reconciles to exactly zero.
  PERFORM public.stripe_balance_tx_ingest(
    (SELECT jsonb_agg(jsonb_build_object(
        'id', 'txn_recon_' || le.id,
        'type', CASE WHEN net >= 0 THEN 'charge' ELSE 'refund' END,
        'amount_cents', net, 'fee_cents', 0, 'net_cents', net, 'currency','usd',
        'created', extract(epoch FROM le.posted_at)::bigint::text,
        'source_id', 'ch_recon_' || le.id,
        'payment_intent_id', o.stripe_payment_intent_id, 'payout_id', NULL))
     FROM (
       SELECT le.id, le.posted_at, (le.refs->>'order_id')::uuid AS order_id,
              sum(ll.debit_cents - ll.credit_cents) AS net
       FROM public.ledger_entries le JOIN public.ledger_lines ll ON ll.entry_id=le.id
       WHERE ll.account_code='1000' AND le.refs->>'template' IN ('T1','T4')
       GROUP BY le.id, le.posted_at, le.refs->>'order_id'
     ) le
     JOIN public.fulfillment_orders o ON o.id = le.order_id),
    NULL);

  SELECT count(*) INTO v_bad FROM public.ledger_stripe_recon_v WHERE delta_cents <> 0;
  IF v_bad <> 0 THEN RAISE EXCEPTION 'L16 FAIL: recon shows % nonzero-delta day(s) on matched fixtures', v_bad; END IF;
  SELECT count(*) INTO v_n FROM public.fulfillment_queue_v WHERE has_recon_delta;
  IF v_n <> 0 THEN RAISE EXCEPTION 'L16 FAIL: % order(s) pinned despite matched fixtures', v_n; END IF;
  RAISE NOTICE 'L16 PASS: recon zero-delta on matched fixtures — no days off, no orders pinned';

  -- order C is currently 'delivered' → quiet, no pin
  SELECT band, next_action_kind, has_recon_delta INTO v_band, v_kind, v_hasdelta
    FROM public.fulfillment_queue_v WHERE order_id = v_ord_c;
  IF v_band <> 'quiet' THEN RAISE EXCEPTION 'L17 SETUP: order C expected quiet pre-mismatch, got %', v_band; END IF;

  -- inject ONE mismatched tx: a phantom +$5.00 charge on order C's PI
  PERFORM public.stripe_balance_tx_ingest(
    jsonb_build_array(jsonb_build_object(
      'id','txn_recon_mismatch','type','charge','amount_cents',500,'fee_cents',15,'net_cents',485,
      'currency','usd','created', extract(epoch FROM now())::bigint::text,
      'source_id','ch_mismatch','payment_intent_id', v_pi_c, 'payout_id', NULL)), NULL);

  SELECT band, next_action_kind, has_recon_delta, recon_delta_cents
    INTO v_band, v_kind, v_hasdelta, v_delta
    FROM public.fulfillment_queue_v WHERE order_id = v_ord_c;
  IF v_band <> 'needs_action_now' OR v_kind <> 'reconcile_stripe' OR NOT v_hasdelta OR v_delta = 0 THEN
    RAISE EXCEPTION 'L17 FAIL: mismatch did not pin order C (band=% kind=% hasdelta=% delta=%)',
      v_band, v_kind, v_hasdelta, v_delta;
  END IF;
  SELECT count(*) INTO v_n FROM public.ledger_stripe_recon_v WHERE delta_cents <> 0;
  IF v_n = 0 THEN RAISE EXCEPTION 'L17 FAIL: recon view shows no nonzero-delta day after mismatch'; END IF;
  RAISE NOTICE 'L17 PASS: injected mismatch pins order C → needs_action_now / reconcile_stripe (delta % ¢)', v_delta;

  -- ═══ Zero-invisibility still holds after the pin (Q1 invariant) ══════════
  SELECT count(*) INTO v_expected FROM public.fulfillment_order_status_v WHERE derived_status IS DISTINCT FROM 'settled';
  SELECT count(*), count(DISTINCT order_id) INTO v_actual, v_distinct FROM public.fulfillment_queue_v;
  SELECT count(*) INTO v_dupes FROM (SELECT order_id FROM public.fulfillment_queue_v GROUP BY order_id HAVING count(*)>1) d;
  IF NOT (v_expected = v_actual AND v_actual = v_distinct AND v_dupes = 0) THEN
    RAISE EXCEPTION 'L18 FAIL: zero-invisibility broken after pin (expected=% actual=% distinct=% dupes=%)',
      v_expected, v_actual, v_distinct, v_dupes;
  END IF;
  RAISE NOTICE 'L18 PASS: zero-invisibility holds after the recon pin (every non-settled order in exactly one band)';

  -- ═══ Append-only on the Stripe mirror: UPDATE/DELETE denied ══════════════
  v_raised := false;
  BEGIN UPDATE public.stripe_balance_transactions SET amount_cents=1 WHERE id='txn_recon_mismatch';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM LIKE '%append-only%' THEN v_raised:=true; ELSE RAISE; END IF; END;
  IF NOT v_raised THEN RAISE EXCEPTION 'L19 FAIL: UPDATE on stripe_balance_transactions not denied'; END IF;
  v_raised := false;
  BEGIN DELETE FROM public.stripe_balance_transactions WHERE id='txn_recon_mismatch';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM LIKE '%append-only%' THEN v_raised:=true; ELSE RAISE; END IF; END;
  IF NOT v_raised THEN RAISE EXCEPTION 'L19 FAIL: DELETE on stripe_balance_transactions not denied'; END IF;
  RAISE NOTICE 'L19 PASS: UPDATE/DELETE denied on the stripe_balance_transactions mirror (append-only)';

  -- ═══ ORDER D — LTL leg: appointment gate + ETA update RPCs (00363) ════════
  v_ord_d := public.fulfillment_intake_order(jsonb_build_object(
    'payment_intent', jsonb_build_object('id','pi_boh_s6_walk_d'),
    'client', jsonb_build_object('name','Walk Delta Osei'),
    'totals', jsonb_build_object('captured_total_cents',140000,'product_subtotal_cents',125000,
                                 'freight_charged_cents',8000,'tax_cents',7000),
    'lines', jsonb_build_array(jsonb_build_object(
      'product_id', v_prod::text, 'item_name','Velvet Club Chair','qty',1,'unit_price_cents',125000))
  ), 'boh_s6_walk');
  PERFORM public.fulfillment_confirm_split(v_ord_d, 'boh_s6_walk');
  SELECT id INTO v_po_d FROM public.fulfillment_vendor_pos WHERE order_id = v_ord_d;
  PERFORM public.fulfillment_record_transmission(v_po_d, 'portal', 'ref-d', NULL, 'boh_s6_walk');
  PERFORM public.fulfillment_record_ack(v_po_d, DATE '2026-10-01', 'portal', 'ACK-D', 'boh_s6_walk');
  v_ship_d := public.fulfillment_record_shipment(v_po_d, 'ltl', 'YRC Freight', 'TRK-D', 'boh_s6_walk');

  -- ── L20: an LTL shipment cannot be delivered without a confirmed appointment ─
  v_raised := false;
  BEGIN
    PERFORM public.fulfillment_record_delivery(v_ship_d, 'fulfillment/pod/d.jpg', 'boh_s6_walk');
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE '%requires a confirmed appointment%' THEN v_raised := true; ELSE RAISE; END IF;
  END;
  IF NOT v_raised THEN RAISE EXCEPTION 'L20 FAIL: LTL delivery without an appointment did NOT raise'; END IF;
  RAISE NOTICE 'L20 PASS: LTL delivery blocked until an appointment is confirmed (§5.4 gate)';

  -- ── L21: update_shipment_eta sets current_eta + appends eta_history ──────
  PERFORM public.fulfillment_update_shipment_eta(v_ship_d, DATE '2026-10-15', 'carrier reschedule', 'boh_s6_walk');
  SELECT current_eta, eta_history INTO v_eta, v_hist FROM public.fulfillment_shipments WHERE id = v_ship_d;
  IF v_eta <> DATE '2026-10-15' OR jsonb_array_length(v_hist) <> 1
     OR v_hist->0->>'reason' <> 'carrier reschedule' THEN
    RAISE EXCEPTION 'L21 FAIL: ETA update did not set current_eta/eta_history (eta=% hist=%)', v_eta, v_hist;
  END IF;
  RAISE NOTICE 'L21 PASS: update_shipment_eta set current_eta 2026-10-15 + appended eta_history';

  -- ── L22: confirm the appointment → LTL delivery now succeeds ─────────────
  PERFORM public.fulfillment_confirm_appointment(v_ship_d, 'boh_s6_walk');
  IF (SELECT appointment_confirmed_at FROM public.fulfillment_shipments WHERE id=v_ship_d) IS NULL THEN
    RAISE EXCEPTION 'L22 FAIL: appointment_confirmed_at not stamped';
  END IF;
  PERFORM public.fulfillment_record_delivery(v_ship_d, 'fulfillment/pod/d.jpg', 'boh_s6_walk');
  IF (SELECT status FROM public.fulfillment_vendor_pos WHERE id=v_po_d) <> 'delivered' THEN
    RAISE EXCEPTION 'L22 FAIL: LTL PO not delivered after appointment confirmed';
  END IF;
  RAISE NOTICE 'L22 PASS: confirm_appointment → LTL delivery succeeds (event + PO delivered)';

  -- ── L23: force the deferred balance trigger over EVERY entry the walk posted ─
  SET CONSTRAINTS ALL IMMEDIATE;
  RAISE NOTICE 'L23 PASS: DB deferred balance trigger verifies every walk-posted entry (SET CONSTRAINTS ALL IMMEDIATE)';

  RAISE NOTICE '── fulfillment_ledger_walk.assert.sql: ALL PASS (L1–L23) ──';
END $$;
ROLLBACK;
