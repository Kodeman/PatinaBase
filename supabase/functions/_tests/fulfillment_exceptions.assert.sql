-- ═══════════════════════════════════════════════════════════════════════════
-- fulfillment_exceptions.assert.sql — S7 Exception Desk & Settlement (E1–E17)
--
-- Proves the S7 fence (I2): fulfillment_resolve_exception's preview lines ==
-- posted lines byte-for-byte on account+amount, for EACH damage path and the
-- refund path; that preview writes nothing; that every close records cause_code
-- + (financial paths) financial_outcome_entry_id; the substitution round-trip
-- through leah_reviews; the delay ETA re-date; settlement preview == posted; the
-- tokenized evidence flow; and the exit-#5 guard (zero resolved exceptions
-- missing cause/financial outcome).
--
-- Idiom mirrors fulfillment_ledger_walk.assert.sql: one BEGIN…ROLLBACK (zero
-- residue), DO $$ … $$ blocks, `IF NOT <cond> THEN RAISE EXCEPTION 'E# FAIL…'`
-- + `RAISE NOTICE 'E# PASS…'`, expected-failure paths invert with a caught
-- EXCEPTION. Requires the seed + S1 fixtures (delivered PO for damage/settle,
-- an intake order for backorder). Run with -v ON_ERROR_STOP=1.
-- ═══════════════════════════════════════════════════════════════════════════
\set ON_ERROR_STOP on
BEGIN;
-- Balance trigger stays DEFERRED during posting (entry + its lines insert in
-- separate statements inside ledger_post); a final SET CONSTRAINTS ALL IMMEDIATE
-- before ROLLBACK (E18) sweeps every entry created here for Σdebit=Σcredit.

-- Canonical "account:debit:credit|…" fingerprint of a jsonb lines[] array.
CREATE OR REPLACE FUNCTION pg_temp.fp_jsonb(p jsonb) RETURNS text LANGUAGE sql AS $$
  SELECT COALESCE(string_agg(
    (l->>'account_code')||':'||COALESCE((l->>'debit_cents')::int,0)||':'||COALESCE((l->>'credit_cents')::int,0),
    '|' ORDER BY (l->>'account_code'), COALESCE((l->>'debit_cents')::int,0), COALESCE((l->>'credit_cents')::int,0)),
    '')
  FROM jsonb_array_elements(COALESCE(p,'[]'::jsonb)) l;
$$;
-- Same fingerprint over an entry's posted ledger_lines.
CREATE OR REPLACE FUNCTION pg_temp.fp_entry(p_entry uuid) RETURNS text LANGUAGE sql AS $$
  SELECT COALESCE(string_agg(account_code||':'||debit_cents||':'||credit_cents, '|'
                             ORDER BY account_code, debit_cents, credit_cents), '')
  FROM public.ledger_lines WHERE entry_id = p_entry;
$$;

-- ─── Damage paths: preview == posted, each path (E1–E3) ─────────────────────
DO $$
DECLARE
  v_po uuid; v_order uuid; v_ship uuid; v_item uuid;
  v_exc uuid; v_prev jsonb; v_res jsonb; v_entry uuid;
  v_pfp text; v_efp text;
  paths text[] := ARRAY['damage_vendor_claim','damage_client_credit','damage_recovery'];
  labels text[] := ARRAY['E1','E2','E3'];
  i int;
  v_amount int := 118000;   -- $1,180.00 (the presentation's claim figure)
BEGIN
  PERFORM set_config('app.fulfillment_writer','rpc',true);
  SELECT p.id, p.order_id, s.id, oi.id INTO v_po, v_order, v_ship, v_item
    FROM public.fulfillment_vendor_pos p
    JOIN public.fulfillment_shipments s ON s.po_id = p.id
    JOIN public.fulfillment_vendor_po_lines l ON l.po_id = p.id
    JOIN public.fulfillment_order_items oi ON oi.id = l.order_item_id
   WHERE p.status = 'delivered' LIMIT 1;
  IF v_po IS NULL THEN RAISE EXCEPTION 'E1 FAIL: no delivered PO fixture (run seed + fixtures)'; END IF;

  FOR i IN 1..3 LOOP
    v_exc := public.fulfillment_open_exception('damage',
      jsonb_build_object('order_id',v_order,'order_item_id',v_item,'po_id',v_po,'shipment_id',v_ship), 'boh_s7_assert');

    -- preview
    v_prev := public.fulfillment_resolve_exception(v_exc, paths[i],
      jsonb_build_object('amount_cents',v_amount,'cause_code','concealed_damage'), true, 'boh_s7_assert');
    v_pfp := pg_temp.fp_jsonb(v_prev->'lines');
    IF (v_prev->>'preview')::boolean IS NOT TRUE THEN RAISE EXCEPTION '% FAIL: preview flag missing', labels[i]; END IF;

    -- commit (same params)
    v_res := public.fulfillment_resolve_exception(v_exc, paths[i],
      jsonb_build_object('amount_cents',v_amount,'cause_code','concealed_damage','outcome_memo','claimed'), false, 'boh_s7_assert');
    v_entry := (v_res->>'financial_outcome_entry_id')::uuid;
    IF v_entry IS NULL THEN RAISE EXCEPTION '% FAIL: no financial_outcome_entry_id on commit', labels[i]; END IF;
    v_efp := pg_temp.fp_entry(v_entry);

    IF v_pfp <> v_efp THEN
      RAISE EXCEPTION '% FAIL (%): preview lines [%] <> posted lines [%]', labels[i], paths[i], v_pfp, v_efp;
    END IF;
    RAISE NOTICE '% PASS: % preview==posted (%)', labels[i], paths[i], v_pfp;
  END LOOP;
END $$;

-- ─── E4: preview causes NO state change at all ──────────────────────────────
DO $$
DECLARE
  v_po uuid; v_order uuid; v_item uuid; v_exc uuid;
  c_exc_before int; c_exc_after int; c_led_before int; c_led_after int; v_status text;
BEGIN
  PERFORM set_config('app.fulfillment_writer','rpc',true);
  SELECT p.id, p.order_id, l.order_item_id INTO v_po, v_order, v_item
    FROM public.fulfillment_vendor_pos p JOIN public.fulfillment_vendor_po_lines l ON l.po_id = p.id
   WHERE p.status='delivered' LIMIT 1;
  v_exc := public.fulfillment_open_exception('damage',
    jsonb_build_object('order_id',v_order,'order_item_id',v_item,'po_id',v_po), 'boh_s7_assert');

  SELECT count(*) INTO c_led_before FROM public.ledger_lines;
  SELECT count(*) INTO c_exc_before FROM public.fulfillment_exceptions WHERE status='resolved';
  PERFORM public.fulfillment_resolve_exception(v_exc, 'damage_vendor_claim',
    jsonb_build_object('amount_cents',50000,'cause_code','concealed_damage'), true, 'boh_s7_assert');
  SELECT count(*) INTO c_led_after FROM public.ledger_lines;
  SELECT count(*) INTO c_exc_after FROM public.fulfillment_exceptions WHERE status='resolved';
  SELECT status INTO v_status FROM public.fulfillment_exceptions WHERE id = v_exc;

  IF c_led_before <> c_led_after OR c_exc_before <> c_exc_after OR v_status <> 'open' THEN
    RAISE EXCEPTION 'E4 FAIL: preview mutated state (ledger %→%, resolved %→%, exc status %)',
      c_led_before, c_led_after, c_exc_before, c_exc_after, v_status;
  END IF;
  RAISE NOTICE 'E4 PASS: preview wrote nothing (ledger + resolved counts unchanged, exception still open)';
END $$;

-- ─── E5: cause_code required on commit ──────────────────────────────────────
DO $$
DECLARE v_po uuid; v_order uuid; v_item uuid; v_exc uuid; v_raised boolean := false;
BEGIN
  PERFORM set_config('app.fulfillment_writer','rpc',true);
  SELECT p.id, p.order_id, l.order_item_id INTO v_po, v_order, v_item
    FROM public.fulfillment_vendor_pos p JOIN public.fulfillment_vendor_po_lines l ON l.po_id = p.id
   WHERE p.status='delivered' LIMIT 1;
  v_exc := public.fulfillment_open_exception('damage',
    jsonb_build_object('order_id',v_order,'order_item_id',v_item,'po_id',v_po), 'boh_s7_assert');
  BEGIN
    PERFORM public.fulfillment_resolve_exception(v_exc, 'damage_client_credit',
      jsonb_build_object('amount_cents',10000), false, 'boh_s7_assert');   -- no cause_code
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE '%cause_code is required%' THEN v_raised := true; ELSE RAISE; END IF;
  END;
  IF NOT v_raised THEN RAISE EXCEPTION 'E5 FAIL: commit without cause_code did not raise'; END IF;
  RAISE NOTICE 'E5 PASS: cause_code required on commit (raised)';
END $$;

-- ─── E6: commit records the full close (status/resolved_at/cause/entry/memo) ─
DO $$
DECLARE v_po uuid; v_order uuid; v_item uuid; v_ship uuid; v_exc uuid; e public.fulfillment_exceptions;
BEGIN
  PERFORM set_config('app.fulfillment_writer','rpc',true);
  SELECT p.id, p.order_id, s.id, l.order_item_id INTO v_po, v_order, v_ship, v_item
    FROM public.fulfillment_vendor_pos p JOIN public.fulfillment_shipments s ON s.po_id=p.id
    JOIN public.fulfillment_vendor_po_lines l ON l.po_id = p.id WHERE p.status='delivered' LIMIT 1;
  v_exc := public.fulfillment_open_exception('damage',
    jsonb_build_object('order_id',v_order,'order_item_id',v_item,'po_id',v_po,'shipment_id',v_ship), 'boh_s7_assert');
  PERFORM public.fulfillment_resolve_exception(v_exc, 'damage_client_credit',
    jsonb_build_object('amount_cents',34000,'cause_code','concealed_damage','outcome_memo','$340 credit to client'),
    false, 'boh_s7_assert');
  SELECT * INTO e FROM public.fulfillment_exceptions WHERE id = v_exc;
  IF e.status <> 'resolved' OR e.resolved_at IS NULL OR e.cause_code IS NULL
     OR e.financial_outcome_entry_id IS NULL OR e.outcome_memo IS NULL THEN
    RAISE EXCEPTION 'E6 FAIL: close incomplete (status=%, resolved_at=%, cause=%, entry=%, memo=%)',
      e.status, e.resolved_at, e.cause_code, e.financial_outcome_entry_id, e.outcome_memo;
  END IF;
  RAISE NOTICE 'E6 PASS: close records status/resolved_at/cause_code/entry/outcome_memo';
END $$;

-- ─── E7/E8: substitution round-trip (route → Leah → approve / reject) ───────
DO $$
DECLARE
  v_order uuid; v_item uuid; v_exc uuid; v_res jsonb; v_review uuid;
  v_estatus text; v_rstatus text; v_cause text; v_fin uuid;
BEGIN
  PERFORM set_config('app.fulfillment_writer','rpc',true);
  SELECT id, order_id INTO v_item, v_order FROM public.fulfillment_order_items
   WHERE line_state NOT IN ('shipped','delivered','settled','cancelled') LIMIT 1;

  -- route to Leah
  v_exc := public.fulfillment_open_exception('substitution',
    jsonb_build_object('order_id',v_order,'order_item_id',v_item), 'boh_s7_assert');
  v_res := public.fulfillment_resolve_exception(v_exc, 'substitution_review',
    jsonb_build_object('cause_code','vendor_substitution',
      'comparison', jsonb_build_object('specified','Bouclé lot 44','proposed','Bouclé lot 47',
        'difference','warmer undertone','price_delta_cents',0,'lead_delta_days',0)),
    false, 'boh_s7_assert');
  v_review := (v_res->>'review_id')::uuid;
  SELECT status INTO v_estatus FROM public.fulfillment_exceptions WHERE id = v_exc;
  SELECT status INTO v_rstatus FROM public.leah_reviews WHERE id = v_review;
  IF v_estatus <> 'pending_leah' OR v_rstatus <> 'pending' OR v_review IS NULL THEN
    RAISE EXCEPTION 'E7 FAIL: route (exc=%, review=%, review_status=%)', v_estatus, v_review, v_rstatus;
  END IF;

  -- approve → exception resolves, cause_code present, non-financial (entry null OK)
  PERFORM public.rule_leah_review(v_review, 'approved', 'leah');
  SELECT status, cause_code, financial_outcome_entry_id INTO v_estatus, v_cause, v_fin
    FROM public.fulfillment_exceptions WHERE id = v_exc;
  IF v_estatus <> 'resolved' OR v_cause IS NULL THEN
    RAISE EXCEPTION 'E7 FAIL: approve (status=%, cause=%)', v_estatus, v_cause;
  END IF;
  RAISE NOTICE 'E7 PASS: substitution route→pending_leah→approve→resolved (cause=%, entry=% non-financial)', v_cause, v_fin;

  -- fresh review, reject → exception back to open
  v_exc := public.fulfillment_open_exception('substitution',
    jsonb_build_object('order_id',v_order,'order_item_id',v_item), 'boh_s7_assert');
  v_res := public.fulfillment_resolve_exception(v_exc, 'substitution_review',
    jsonb_build_object('cause_code','vendor_substitution','comparison', jsonb_build_object('specified','A','proposed','B')),
    false, 'boh_s7_assert');
  v_review := (v_res->>'review_id')::uuid;
  PERFORM public.rule_leah_review(v_review, 'rejected', 'leah');
  SELECT status INTO v_estatus FROM public.fulfillment_exceptions WHERE id = v_exc;
  IF v_estatus <> 'open' THEN RAISE EXCEPTION 'E8 FAIL: reject did not reopen (status=%)', v_estatus; END IF;
  RAISE NOTICE 'E8 PASS: substitution reject → exception back to open';
END $$;

-- ─── E9: backorder_cancel with refund → line cancelled + T4 (preview==posted) ─
DO $$
DECLARE v_order uuid; v_item uuid; v_exc uuid; v_prev jsonb; v_res jsonb; v_entry uuid;
        v_pfp text; v_efp text; v_line_state text;
BEGIN
  PERFORM set_config('app.fulfillment_writer','rpc',true);
  SELECT id, order_id INTO v_item, v_order FROM public.fulfillment_order_items
   WHERE line_state IN ('intake','split','transmitted','acknowledged') LIMIT 1;
  v_exc := public.fulfillment_open_exception('backorder',
    jsonb_build_object('order_id',v_order,'order_item_id',v_item), 'boh_s7_assert');
  v_prev := public.fulfillment_resolve_exception(v_exc, 'backorder_cancel',
    jsonb_build_object('refund_cents',215000,'tax_reversal_cents',12000,'cause_code','backorder_vendor'), true, 'boh_s7_assert');
  v_pfp := pg_temp.fp_jsonb(v_prev->'lines');
  v_res := public.fulfillment_resolve_exception(v_exc, 'backorder_cancel',
    jsonb_build_object('refund_cents',215000,'tax_reversal_cents',12000,'cause_code','backorder_vendor','outcome_memo','cancelled + refunded'), false, 'boh_s7_assert');
  v_entry := (v_res->>'financial_outcome_entry_id')::uuid;
  v_efp := pg_temp.fp_entry(v_entry);
  SELECT line_state INTO v_line_state FROM public.fulfillment_order_items WHERE id = v_item;
  IF v_pfp <> v_efp THEN RAISE EXCEPTION 'E9 FAIL: T4 preview [%] <> posted [%]', v_pfp, v_efp; END IF;
  IF v_line_state <> 'cancelled' THEN RAISE EXCEPTION 'E9 FAIL: line not cancelled (%)', v_line_state; END IF;
  RAISE NOTICE 'E9 PASS: backorder cancel → line cancelled + T4 refund preview==posted (%)', v_pfp;
END $$;

-- ─── E10: delay_redate → no ledger, ETA moved, resolved ────────────────────
DO $$
DECLARE v_po uuid; v_order uuid; v_ship uuid; v_exc uuid; v_res jsonb; v_eta date; v_entry uuid;
BEGIN
  PERFORM set_config('app.fulfillment_writer','rpc',true);
  SELECT p.id, p.order_id, s.id INTO v_po, v_order, v_ship
    FROM public.fulfillment_vendor_pos p JOIN public.fulfillment_shipments s ON s.po_id=p.id LIMIT 1;
  v_exc := public.fulfillment_open_exception('delay',
    jsonb_build_object('order_id',v_order,'po_id',v_po,'shipment_id',v_ship), 'boh_s7_assert');
  v_res := public.fulfillment_resolve_exception(v_exc, 'delay_redate',
    jsonb_build_object('new_eta','2026-09-14','cause_code','vendor_delay','outcome_memo','+11 days'), false, 'boh_s7_assert');
  SELECT current_eta INTO v_eta FROM public.fulfillment_shipments WHERE id = v_ship;
  v_entry := (v_res->>'financial_outcome_entry_id')::uuid;
  IF v_eta <> '2026-09-14'::date OR v_entry IS NOT NULL THEN
    RAISE EXCEPTION 'E10 FAIL: delay (eta=%, entry=% should be null)', v_eta, v_entry;
  END IF;
  RAISE NOTICE 'E10 PASS: delay_redate moved ETA to %, no ledger entry', v_eta;
END $$;

-- ─── E11: settlement preview == posted ($34-style, auto-accept) ─────────────
DO $$
DECLARE
  v_po uuid; v_expected int; v_invoice int; v_prev jsonb; v_settle jsonb;
  v_evt bigint; v_pfp text; v_efp text;
BEGIN
  PERFORM set_config('app.fulfillment_writer','rpc',true);
  -- the settle-ready fixture PO (expected >= $1700 so $34 sits in tolerance)
  SELECT id, product_cost_cents + freight_cost_cents INTO v_po, v_expected
    FROM public.fulfillment_vendor_pos
   WHERE status='delivered' AND (product_cost_cents + freight_cost_cents) >= 170000
   ORDER BY (product_cost_cents + freight_cost_cents) DESC LIMIT 1;
  IF v_po IS NULL THEN RAISE EXCEPTION 'E11 FAIL: no settle-ready delivered PO (run seed-fulfillment-exceptions.sql)'; END IF;
  v_invoice := v_expected + 3400;   -- +$34 freight variance (auto-accept)

  v_prev := public.fulfillment_settle_po_preview(v_po, v_invoice);
  v_pfp := pg_temp.fp_jsonb(v_prev->'lines');
  IF (v_prev->>'auto_accepted')::boolean IS NOT TRUE THEN
    RAISE EXCEPTION 'E11 FAIL: $34 variance not auto-accepted (tol=%)', v_prev->>'tolerance_cents';
  END IF;

  v_settle := public.fulfillment_settle_po(v_po, v_invoice, NULL, 'boh_s7_assert');
  SELECT max(id) INTO v_evt FROM public.fulfillment_events WHERE po_id=v_po AND event_type='po.settled';
  -- fingerprint the union of every line posted under this settlement event
  SELECT COALESCE(string_agg(account_code||':'||debit_cents||':'||credit_cents, '|'
                             ORDER BY account_code, debit_cents, credit_cents), '')
    INTO v_efp
    FROM public.ledger_lines ll JOIN public.ledger_entries le ON le.id = ll.entry_id
   WHERE le.source_event_id = v_evt;
  IF v_pfp <> v_efp THEN RAISE EXCEPTION 'E11 FAIL: settle preview [%] <> posted [%]', v_pfp, v_efp; END IF;
  RAISE NOTICE 'E11 PASS: settlement preview==posted, $34 auto-accepted (%)', v_pfp;
END $$;

-- ─── E12: settlement beyond tolerance demands a typed reason ────────────────
DO $$
DECLARE v_po uuid; v_expected int; v_prev jsonb; v_raised boolean := false;
BEGIN
  PERFORM set_config('app.fulfillment_writer','rpc',true);
  -- any still-delivered PO (E11 settled the large fixture one within this txn)
  SELECT id, product_cost_cents + freight_cost_cents INTO v_po, v_expected
    FROM public.fulfillment_vendor_pos WHERE status='delivered' LIMIT 1;
  v_prev := public.fulfillment_settle_po_preview(v_po, v_expected + 500000);   -- way over tolerance
  IF (v_prev->>'requires_reason')::boolean IS NOT TRUE THEN
    RAISE EXCEPTION 'E12 FAIL: preview did not flag requires_reason beyond tolerance';
  END IF;
  BEGIN
    PERFORM public.fulfillment_settle_po(v_po, v_expected + 500000, NULL, 'boh_s7_assert');
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE '%typed reason is required%' THEN v_raised := true; ELSE RAISE; END IF;
  END;
  IF NOT v_raised THEN RAISE EXCEPTION 'E12 FAIL: beyond-tolerance settle without reason did not raise'; END IF;
  RAISE NOTICE 'E12 PASS: beyond-tolerance preview flags requires_reason + commit raises without one';
END $$;

-- ─── E13/E14: tokenized evidence flow (mint → context → append → reflect) ───
DO $$
DECLARE
  v_order uuid; v_item uuid; v_exc uuid; v_mint jsonb; v_token text; v_ctx jsonb; v_app jsonb;
  v_keys text[]; v_before int; v_after int;
BEGIN
  PERFORM set_config('app.fulfillment_writer','rpc',true);
  SELECT id, order_id INTO v_item, v_order FROM public.fulfillment_order_items LIMIT 1;
  v_exc := public.fulfillment_open_exception('damage',
    jsonb_build_object('order_id',v_order,'order_item_id',v_item), 'boh_s7_assert');

  v_mint := public.fulfillment_mint_evidence_token(v_exc, 72, 'admin');
  v_token := v_mint->>'token';
  IF v_token !~ '^[0-9a-f]{64}$' THEN RAISE EXCEPTION 'E13 FAIL: token shape % is not 64-hex', v_token; END IF;

  v_ctx := public.fulfillment_evidence_token_context(v_token);
  IF (v_ctx->>'valid')::boolean IS NOT TRUE THEN RAISE EXCEPTION 'E13 FAIL: fresh token not valid'; END IF;
  RAISE NOTICE 'E13 PASS: mint → valid token (order #%, %)', v_ctx->>'order_no', v_ctx->>'exception_type';

  SELECT COALESCE(array_length(evidence_r2_keys,1),0) INTO v_before FROM public.fulfillment_exceptions WHERE id=v_exc;
  v_app := public.fulfillment_append_evidence(v_token,
    ARRAY['fulfillment/evidence/'||v_exc||'/img01.jpg','fulfillment/evidence/'||v_exc||'/img02.jpg'], 'client');
  SELECT COALESCE(array_length(evidence_r2_keys,1),0) INTO v_after FROM public.fulfillment_exceptions WHERE id=v_exc;
  IF v_after <> v_before + 2 THEN RAISE EXCEPTION 'E14 FAIL: evidence not appended (%→%)', v_before, v_after; END IF;
  RAISE NOTICE 'E14 PASS: token append added 2 evidence keys (%→%)', v_before, v_after;

  -- expired token rejected
  PERFORM set_config('app.fulfillment_writer','migration',true);
  UPDATE public.fulfillment_evidence_upload_tokens SET expires_at = now() - interval '1 hour' WHERE token = v_token;
  PERFORM set_config('app.fulfillment_writer','rpc',true);
  v_ctx := public.fulfillment_evidence_token_context(v_token);
  IF (v_ctx->>'valid')::boolean IS NOT FALSE THEN RAISE EXCEPTION 'E15 FAIL: expired token still valid'; END IF;
  RAISE NOTICE 'E15 PASS: expired token rejected';
END $$;

-- ─── E16: expired-token append is refused ───────────────────────────────────
DO $$
DECLARE v_order uuid; v_item uuid; v_exc uuid; v_mint jsonb; v_token text; v_raised boolean := false;
BEGIN
  PERFORM set_config('app.fulfillment_writer','rpc',true);
  SELECT id, order_id INTO v_item, v_order FROM public.fulfillment_order_items LIMIT 1;
  v_exc := public.fulfillment_open_exception('damage', jsonb_build_object('order_id',v_order,'order_item_id',v_item), 'boh_s7_assert');
  v_mint := public.fulfillment_mint_evidence_token(v_exc, 72, 'admin');
  v_token := v_mint->>'token';
  PERFORM set_config('app.fulfillment_writer','migration',true);
  UPDATE public.fulfillment_evidence_upload_tokens SET revoked = true WHERE token = v_token;
  PERFORM set_config('app.fulfillment_writer','rpc',true);
  BEGIN
    PERFORM public.fulfillment_append_evidence(v_token, ARRAY['x/y.jpg'], 'client');
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE '%invalid or expired token%' THEN v_raised := true; ELSE RAISE; END IF;
  END;
  IF NOT v_raised THEN RAISE EXCEPTION 'E16 FAIL: revoked-token append did not raise'; END IF;
  RAISE NOTICE 'E16 PASS: revoked-token append refused';
END $$;

-- ─── E17: exit-#5 guard — zero resolved exceptions lacking cause/outcome ────
-- After every mutation above, no resolved exception may miss its cause_code, and
-- no resolved FINANCIAL-path exception may miss its financial_outcome_entry_id.
DO $$
DECLARE v_bad int;
BEGIN
  SELECT count(*) INTO v_bad FROM public.fulfillment_exceptions
   WHERE status = 'resolved'
     AND ( cause_code IS NULL
        OR ( resolution_path IN ('damage_vendor_claim','damage_client_credit','damage_recovery','refund')
             AND financial_outcome_entry_id IS NULL ) );
  IF v_bad <> 0 THEN RAISE EXCEPTION 'E17 FAIL: % resolved exception(s) missing cause_code or financial outcome', v_bad; END IF;
  RAISE NOTICE 'E17 PASS: every resolved exception carries cause_code + (financial paths) a ledger entry';
END $$;

-- ─── E18: every ledger entry posted above is balanced (DB trigger sweep) ─────
DO $$
BEGIN
  SET CONSTRAINTS ALL IMMEDIATE;   -- forces the deferred Σdebit=Σcredit / ≥2-line trigger
  RAISE NOTICE 'E18 PASS: all ledger entries posted in this run are balanced (deferred trigger swept clean)';
END $$;

ROLLBACK;
