-- ═══════════════════════════════════════════════════════════════════════════
-- 00360 — Back of House: ledger posting templates T2–T6 + real settlement (S6)
--
-- S0 (00352) shipped the minimal double-entry ledger with ONLY template T1
-- (capture) and left the rest as the fenced deferrals of I2:
--   • fulfillment_settle_po → a stub raising `not_implemented_until_S6`
--   • T2–T6 posting templates → unbuilt
--   • no explicit CHECK asserting captured_total = subtotal+freight+tax (I2 flag)
-- This migration replaces all three fences with the real thing (spec §8, R1.3,
-- R3.1). Same posture as T1 (00352): the ledger_post_t* templates are INTERNAL
-- SQL fns — EXECUTE revoked from every portal-facing role INCLUDING service_role;
-- only the SECURITY DEFINER fulfillment_* RPCs (owned by postgres) reach them.
-- Every template calls public.ledger_post (00352), which skips all-zero lines
-- (D12) and lets the deferred balance trigger verify Σdebit=Σcredit at commit.
-- Every entry is sourced to a fulfillment_events row (§11).
--
-- FIX-FORWARD, not in-place: 00350–00354 + 00358 are on origin/main, so the two
-- RPCs this touches (fulfillment_record_transmission, fulfillment_settle_po) are
-- redefined here by CREATE OR REPLACE grafted from their verbatim 00353 bodies —
-- never edited in the applied migrations (patina-db-migrations discipline).
--
-- The chart lines each template hits (00352 seed):
--   T2 deposit    Dr 1200 Vendor Deposits            / Cr 1000 Cash-Stripe Clearing
--   T3 settle     Dr 5000 COGS, 5100 Freight Expense / Cr 1200 (clear deposit), 2000 Vendor Payables
--                 + pledge (separate, tagged) Dr 5300 Pledge Expense / Cr 2200 Pledge Liability
--   T4 refund     Dr 4900 Refunds (+2100 tax rev.)   / Cr 1000 Cash-Stripe Clearing
--   T5 damage     claim   Dr 1100 / Cr 5200 · credit Dr 5200 / Cr 2300 · recovery Dr 1000 / Cr 1100
--   T6 freight    variance to 5100 (Cr/Dr 2000), typed reason in the memo
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 1. T2 — vendor deposit at PO (terms-dependent) ─────────────────────────
-- prepay=100% · fifty_fifty=50% · net_30=0% of the PO trade value (product_cost;
-- freight is unknown at PO time, so the deposit is on product cost only). A zero
-- deposit (net_30) posts NOTHING and returns NULL — the caller skips logging.
-- Idempotency lives in the caller (record_transmission guards on an existing T2).
CREATE OR REPLACE FUNCTION public.ledger_post_t2_deposit(
  p_po_id uuid, p_source_event_id bigint, p_posted_by text
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  po      public.fulfillment_vendor_pos;
  v_pct   numeric;
  v_dep   int;
BEGIN
  SELECT * INTO po FROM public.fulfillment_vendor_pos WHERE id = p_po_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'ledger_post_t2_deposit: po % not found', p_po_id; END IF;
  v_pct := CASE po.terms
             WHEN 'prepay'      THEN 1.0
             WHEN 'fifty_fifty' THEN 0.5
             ELSE 0.0                       -- net_30 (or NULL terms) → no deposit
           END;
  v_dep := round(v_pct * po.product_cost_cents)::int;
  IF v_dep <= 0 THEN RETURN NULL; END IF;    -- nothing to post (keeps the entry ≥2 lines)
  RETURN public.ledger_post(
    'T2 vendor deposit — PO ' || COALESCE(po.po_number, po.id::text),
    p_source_event_id, p_posted_by,
    jsonb_build_object('po_id', po.id, 'order_id', po.order_id, 'template', 'T2',
                       'terms', po.terms, 'deposit_cents', v_dep),
    jsonb_build_array(
      jsonb_build_object('account_code','1200','debit_cents',  v_dep),
      jsonb_build_object('account_code','1000','credit_cents', v_dep)
    )
  );
END;
$$;
REVOKE ALL ON FUNCTION public.ledger_post_t2_deposit(uuid, bigint, text) FROM public, anon, authenticated, service_role;

-- ─── 2. T3 — settle (COGS + freight + clear deposit + payable) + pledge ─────
-- Posts at PO VALUES (COGS = product_cost, Freight = the PO's freight estimate),
-- clearing the T2 deposit already sitting in 1200 first (so 1200 nets to zero
-- for a prepay vendor), the residual owed to 2000 Vendor Payables. The freight
-- VARIANCE is trued up separately by T6 (§8) — p_freight_variance_cents is passed
-- here only to size the pledge basis (R3.1). The pledge accrual is a SEPARATE,
-- tagged entry (O2 — tagged, never legally characterized):
--   realized commission (R3.1) = PO line retail − trade cost − freight variance
--     = Σ(qty·unit_price) − product_cost − variance   [freight nets to zero at
--       variance=0, matching @patina/fulfillment/money.ts's strip exactly]
--   pledge = round(pledge_rate · realized_commission), only when commission > 0.
CREATE OR REPLACE FUNCTION public.ledger_post_t3_settle(
  p_po_id uuid, p_freight_variance_cents int, p_source_event_id bigint, p_posted_by text
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  po           public.fulfillment_vendor_pos;
  v_deposit    int;
  v_payable    int;
  v_retail     int;
  v_commission int;
  v_rate       numeric;
  v_pledge     int;
  v_entry      uuid;
BEGIN
  SELECT * INTO po FROM public.fulfillment_vendor_pos WHERE id = p_po_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'ledger_post_t3_settle: po % not found', p_po_id; END IF;

  -- deposit already posted for this PO (T2 Dr 1200); 0 if none (net_30)
  SELECT COALESCE(sum(ll.debit_cents), 0) INTO v_deposit
    FROM public.ledger_entries le
    JOIN public.ledger_lines   ll ON ll.entry_id = le.id
   WHERE le.refs->>'po_id' = p_po_id::text AND le.refs->>'template' = 'T2'
     AND ll.account_code = '1200';

  -- residual owed to the vendor after the deposit is cleared, at PO estimate
  v_payable := (po.product_cost_cents + po.freight_cost_cents) - v_deposit;

  v_entry := public.ledger_post(
    'T3 settle — PO ' || COALESCE(po.po_number, po.id::text),
    p_source_event_id, p_posted_by,
    jsonb_build_object('po_id', po.id, 'order_id', po.order_id, 'template', 'T3',
                       'deposit_cleared_cents', v_deposit, 'payable_cents', v_payable),
    jsonb_build_array(
      jsonb_build_object('account_code','5000','debit_cents',  po.product_cost_cents),  -- COGS
      jsonb_build_object('account_code','5100','debit_cents',  po.freight_cost_cents),  -- freight est (skip if 0)
      jsonb_build_object('account_code','1200','credit_cents', v_deposit),              -- clear deposit (skip if 0)
      jsonb_build_object('account_code','2000','credit_cents', v_payable)               -- residual payable (skip if 0)
    )
  );

  -- Pledge accrual — separate, tagged entry (O2). realized commission per R3.1.
  SELECT COALESCE(sum(oi.qty * oi.unit_price_cents), 0) INTO v_retail
    FROM public.fulfillment_vendor_po_lines l
    JOIN public.fulfillment_order_items oi ON oi.id = l.order_item_id
   WHERE l.po_id = p_po_id;
  v_commission := v_retail - po.product_cost_cents - COALESCE(p_freight_variance_cents, 0);
  SELECT COALESCE((value->>'rate')::numeric, 0.25) INTO v_rate
    FROM public.fulfillment_config WHERE key = 'pledge_accrual';
  v_pledge := CASE WHEN v_commission > 0 THEN round(v_rate * v_commission)::int ELSE 0 END;

  IF v_pledge > 0 THEN
    PERFORM public.ledger_post(
      'T3 pledge accrual — PO ' || COALESCE(po.po_number, po.id::text),
      p_source_event_id, p_posted_by,
      -- pledge_tag: teaching-royalties accrual, tagged NOT legally characterized (O2)
      jsonb_build_object('po_id', po.id, 'order_id', po.order_id, 'template', 'T3',
                         'kind', 'pledge_accrual', 'pledge_tag', true,
                         'realized_commission_cents', v_commission, 'pledge_rate', v_rate),
      jsonb_build_array(
        jsonb_build_object('account_code','5300','debit_cents',  v_pledge),
        jsonb_build_object('account_code','2200','credit_cents', v_pledge)
      )
    );
  END IF;

  RETURN v_entry;
END;
$$;
REVOKE ALL ON FUNCTION public.ledger_post_t3_settle(uuid, int, bigint, text) FROM public, anon, authenticated, service_role;

-- ─── 3. T4 — refund (Dr 4900 [+2100 tax reversal] / Cr 1000) ────────────────
-- p_refund_cents = the product+freight (revenue) portion refunded to the client;
-- p_tax_reversal_cents = the sales-tax portion reversed (0 → line skipped). Cr
-- 1000 = the total cash returned. Credits 1000 — this is the ONLY non-capture
-- 1000 movement the Stripe reconciliation (00361) mirrors, alongside T1 debits.
CREATE OR REPLACE FUNCTION public.ledger_post_t4_refund(
  p_order_id uuid, p_refund_cents int, p_tax_reversal_cents int,
  p_source_event_id bigint, p_posted_by text
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  o     public.fulfillment_orders;
  v_tax int := COALESCE(p_tax_reversal_cents, 0);
BEGIN
  SELECT * INTO o FROM public.fulfillment_orders WHERE id = p_order_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'ledger_post_t4_refund: order % not found', p_order_id; END IF;
  IF COALESCE(p_refund_cents,0) + v_tax <= 0 THEN
    RAISE EXCEPTION 'ledger_post_t4_refund: refund amount must be > 0';
  END IF;
  RETURN public.ledger_post(
    'T4 refund — order ' || o.order_no,
    p_source_event_id, p_posted_by,
    jsonb_build_object('order_id', o.id, 'template', 'T4',
                       'refund_cents', COALESCE(p_refund_cents,0), 'tax_reversal_cents', v_tax),
    jsonb_build_array(
      jsonb_build_object('account_code','4900','debit_cents',  COALESCE(p_refund_cents,0)),  -- contra-revenue
      jsonb_build_object('account_code','2100','debit_cents',  v_tax),                        -- tax reversal (skip if 0)
      jsonb_build_object('account_code','1000','credit_cents', COALESCE(p_refund_cents,0) + v_tax)
    )
  );
END;
$$;
REVOKE ALL ON FUNCTION public.ledger_post_t4_refund(uuid, int, int, bigint, text) FROM public, anon, authenticated, service_role;

-- ─── 4. T5 — damage outcomes (one fn, outcome param) ────────────────────────
-- claim: Dr 1100 Claims Receivable / Cr 5200 Damage & Claims
-- client_credit: Dr 5200 / Cr 2300 Client Credits Payable
-- recovery: Dr 1000 / Cr 1100  (a claim recovery lands in 1000 but is NOT a
--   Stripe movement — the recon in 00361 filters to T1/T4 so it never counts it)
-- S6 builds these so S7's exception desk can call them; S6 exercises them in the
-- ledger walk assert. p_refs threads exception/order/shipment ids for the trail.
CREATE OR REPLACE FUNCTION public.ledger_post_t5_damage(
  p_outcome text, p_amount_cents int, p_refs jsonb,
  p_source_event_id bigint, p_posted_by text
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_dr text; v_cr text;
BEGIN
  IF COALESCE(p_amount_cents,0) <= 0 THEN
    RAISE EXCEPTION 'ledger_post_t5_damage: amount must be > 0';
  END IF;
  CASE p_outcome
    WHEN 'claim'         THEN v_dr := '1100'; v_cr := '5200';
    WHEN 'client_credit' THEN v_dr := '5200'; v_cr := '2300';
    WHEN 'recovery'      THEN v_dr := '1000'; v_cr := '1100';
    ELSE RAISE EXCEPTION 'ledger_post_t5_damage: unknown outcome % (claim|client_credit|recovery)', p_outcome;
  END CASE;
  RETURN public.ledger_post(
    'T5 damage — ' || p_outcome,
    p_source_event_id, p_posted_by,
    COALESCE(p_refs,'{}'::jsonb) || jsonb_build_object('template','T5','outcome',p_outcome,'amount_cents',p_amount_cents),
    jsonb_build_array(
      jsonb_build_object('account_code', v_dr, 'debit_cents',  p_amount_cents),
      jsonb_build_object('account_code', v_cr, 'credit_cents', p_amount_cents)
    )
  );
END;
$$;
REVOKE ALL ON FUNCTION public.ledger_post_t5_damage(text, int, jsonb, bigint, text) FROM public, anon, authenticated, service_role;

-- ─── 5. T6 — freight true-up (variance to 5100, typed reason in the memo) ───
-- variance > 0 (actual over estimate, we owe more): Dr 5100 / Cr 2000
-- variance < 0 (actual under estimate, we owe less): Dr 2000 / Cr 5100
-- zero variance posts nothing (returns NULL). After T3+T6, 5100 totals the
-- ACTUAL freight and 2000 totals (vendor_invoice − deposit).
CREATE OR REPLACE FUNCTION public.ledger_post_t6_freight_trueup(
  p_po_id uuid, p_variance_cents int, p_reason text,
  p_source_event_id bigint, p_posted_by text
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  po      public.fulfillment_vendor_pos;
  v_lines jsonb;
  v_mag   int := abs(COALESCE(p_variance_cents,0));
BEGIN
  IF v_mag = 0 THEN RETURN NULL; END IF;
  SELECT * INTO po FROM public.fulfillment_vendor_pos WHERE id = p_po_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'ledger_post_t6_freight_trueup: po % not found', p_po_id; END IF;
  IF p_variance_cents > 0 THEN
    v_lines := jsonb_build_array(
      jsonb_build_object('account_code','5100','debit_cents',  v_mag),
      jsonb_build_object('account_code','2000','credit_cents', v_mag));
  ELSE
    v_lines := jsonb_build_array(
      jsonb_build_object('account_code','2000','debit_cents',  v_mag),
      jsonb_build_object('account_code','5100','credit_cents', v_mag));
  END IF;
  RETURN public.ledger_post(
    'T6 freight true-up — PO ' || COALESCE(po.po_number, po.id::text) || ' — ' || COALESCE(p_reason,'(no reason)'),
    p_source_event_id, p_posted_by,
    jsonb_build_object('po_id', po.id, 'order_id', po.order_id, 'template', 'T6',
                       'variance_cents', p_variance_cents, 'reason', p_reason),
    v_lines);
END;
$$;
REVOKE ALL ON FUNCTION public.ledger_post_t6_freight_trueup(uuid, int, text, bigint, text) FROM public, anon, authenticated, service_role;

-- ─── 6. Reversing correction (§8 — append-only corrections) ─────────────────
-- The ledger is append-only (00352): a correction is a NEW entry that mirrors an
-- original's lines (debit↔credit swapped) with reversal_of set. ledger_post
-- cannot set reversal_of, so this writes the entry+lines directly (internal fn,
-- still writer-guarded via the GUC the calling RPC sets). Both rows survive; the
-- pair nets to zero on every account it touched.
CREATE OR REPLACE FUNCTION public.ledger_post_reversal(
  p_entry_id uuid, p_source_event_id bigint, p_posted_by text, p_memo text
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  orig  public.ledger_entries;
  v_new uuid;
  ln    record;
BEGIN
  SELECT * INTO orig FROM public.ledger_entries WHERE id = p_entry_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'ledger_post_reversal: entry % not found', p_entry_id; END IF;

  INSERT INTO public.ledger_entries (memo, source_event_id, reversal_of, refs, posted_by)
  VALUES (
    COALESCE(p_memo, 'Reversal of ' || orig.memo),
    p_source_event_id, orig.id,
    COALESCE(orig.refs,'{}'::jsonb) || jsonb_build_object('reversal_of', orig.id, 'template', 'reversal'),
    p_posted_by
  ) RETURNING id INTO v_new;

  FOR ln IN SELECT account_code, debit_cents, credit_cents FROM public.ledger_lines WHERE entry_id = orig.id LOOP
    INSERT INTO public.ledger_lines (entry_id, account_code, debit_cents, credit_cents)
    VALUES (v_new, ln.account_code, ln.credit_cents, ln.debit_cents);  -- swap
  END LOOP;

  RETURN v_new;   -- balance verified at COMMIT by the deferred constraint trigger
END;
$$;
REVOKE ALL ON FUNCTION public.ledger_post_reversal(uuid, bigint, text, text) FROM public, anon, authenticated, service_role;

-- ─── 7. Wire T2 into transmission (graft onto the verbatim 00353 body) ──────
-- The ONLY delta from 00353's fulfillment_record_transmission: capture the
-- po.transmitted event id, then post the T2 deposit the FIRST time this PO is
-- transmitted. Idempotent on re-send (a correction/re-send must not double-pay):
-- guarded on an existing T2 entry for the PO. Everything above the T2 block is
-- byte-for-byte the 00353 body.
CREATE OR REPLACE FUNCTION public.fulfillment_record_transmission(
  p_po_id uuid, p_method text, p_ref text, p_pdf_r2_key text, p_actor text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_started timestamptz := clock_timestamp(); v_order uuid; v_evt bigint; v_dep uuid;
BEGIN
  PERFORM set_config('app.fulfillment_writer','rpc',true);
  UPDATE public.fulfillment_vendor_pos
     SET status = 'sent', transmitted_at = now(), pdf_r2_key = COALESCE(p_pdf_r2_key, pdf_r2_key)
   WHERE id = p_po_id RETURNING order_id INTO v_order;
  IF v_order IS NULL THEN RAISE EXCEPTION 'fulfillment_record_transmission: po % not found', p_po_id; END IF;
  UPDATE public.fulfillment_order_items i SET line_state = 'transmitted'
    FROM public.fulfillment_vendor_po_lines l
   WHERE l.po_id = p_po_id AND l.order_item_id = i.id AND i.line_state = 'split';
  v_evt := public.fulfillment_log_event('po.transmitted', p_actor, v_order, p_po_id, NULL, NULL, NULL,
    jsonb_build_object('method', p_method, 'ref', p_ref), NULL, NULL, v_started);

  -- T2 vendor deposit at PO (S6, §8) — post once, on the first transmission.
  IF NOT EXISTS (SELECT 1 FROM public.ledger_entries
                  WHERE refs->>'po_id' = p_po_id::text AND refs->>'template' = 'T2') THEN
    v_dep := public.ledger_post_t2_deposit(p_po_id, v_evt, p_actor);
    IF v_dep IS NOT NULL THEN
      PERFORM public.fulfillment_log_event('ledger.posted', p_actor, v_order, p_po_id, NULL, NULL, NULL,
        jsonb_build_object('template','T2','entry_id',v_dep,'source_event_id',v_evt), NULL, NULL, v_started);
    END IF;
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.fulfillment_record_transmission(uuid,text,text,text,text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fulfillment_record_transmission(uuid,text,text,text,text) TO service_role;

-- ─── 8. fulfillment_settle_po — the real settlement RPC (replaces the stub) ──
-- Three-way match: PO expected value (product_cost + freight estimate) · vendor
-- invoice amount (param) · variance vs the config tolerance (greater of $25 or
-- 2% of PO value, R1.12). In tolerance → auto-accept. Beyond tolerance → a
-- non-empty typed reason is REQUIRED (raise otherwise). Posts T3 (+ pledge) and,
-- when the freight variance is nonzero, T6 (typed reason in its memo). Advances
-- the PO and its non-cancelled lines delivered → settled (state machine permits).
-- The signature GAINS p_vendor_invoice_cents + p_variance_reason — the (uuid,text)
-- stub is dropped (no TS caller exists; grep-confirmed 2026-07-17).
DROP FUNCTION IF EXISTS public.fulfillment_settle_po(uuid, text);
CREATE OR REPLACE FUNCTION public.fulfillment_settle_po(
  p_po_id uuid, p_vendor_invoice_cents int, p_variance_reason text, p_actor text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_started  timestamptz := clock_timestamp();
  po         public.fulfillment_vendor_pos;
  v_expected int; v_variance int; v_tol int; v_cfg jsonb;
  v_reason   text := btrim(COALESCE(p_variance_reason,''));
  v_evt      bigint;
  v_t3       uuid; v_t6 uuid;
  v_accepted boolean;
BEGIN
  PERFORM set_config('app.fulfillment_writer','rpc',true);
  SELECT * INTO po FROM public.fulfillment_vendor_pos WHERE id = p_po_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'fulfillment_settle_po: po % not found', p_po_id; END IF;
  IF po.status <> 'delivered' THEN
    RAISE EXCEPTION 'fulfillment_settle_po: po % must be delivered to settle (is %)', p_po_id, po.status;
  END IF;
  IF p_vendor_invoice_cents IS NULL OR p_vendor_invoice_cents < 0 THEN
    RAISE EXCEPTION 'fulfillment_settle_po: vendor invoice cents required (>= 0)';
  END IF;

  v_expected := po.product_cost_cents + po.freight_cost_cents;      -- PO value (three-way leg 1)
  v_variance := p_vendor_invoice_cents - v_expected;               -- invoice − PO value (leg 3)

  SELECT value INTO v_cfg FROM public.fulfillment_config WHERE key = 'settlement_variance_tolerance';
  v_tol := GREATEST(
    COALESCE((v_cfg->>'abs_cents')::int, 2500),
    round(COALESCE((v_cfg->>'pct_of_po')::numeric, 0.02) * v_expected)::int);

  v_accepted := abs(v_variance) <= v_tol;
  IF NOT v_accepted AND v_reason = '' THEN
    RAISE EXCEPTION 'fulfillment_settle_po: variance % exceeds tolerance % — a typed reason is required',
      v_variance, v_tol USING ERRCODE = 'check_violation';
  END IF;

  -- one settlement event; the T3/T6 entries source to it (§11)
  v_evt := public.fulfillment_log_event('po.settled', p_actor, po.order_id, p_po_id, NULL, NULL, NULL,
    jsonb_build_object('vendor_invoice_cents', p_vendor_invoice_cents, 'expected_cents', v_expected,
                       'variance_cents', v_variance, 'tolerance_cents', v_tol,
                       'auto_accepted', v_accepted, 'reason', NULLIF(v_reason,'')),
    NULL, NULL, v_started);

  v_t3 := public.ledger_post_t3_settle(p_po_id, v_variance, v_evt, p_actor);
  PERFORM public.fulfillment_log_event('ledger.posted', p_actor, po.order_id, p_po_id, NULL, NULL, NULL,
    jsonb_build_object('template','T3','entry_id',v_t3), NULL, NULL, v_started);

  IF v_variance <> 0 THEN
    v_t6 := public.ledger_post_t6_freight_trueup(
      p_po_id, v_variance,
      COALESCE(NULLIF(v_reason,''),
               CASE WHEN v_variance > 0 THEN 'freight over estimate (within tolerance)'
                    ELSE 'freight under estimate (within tolerance)' END),
      v_evt, p_actor);
    PERFORM public.fulfillment_log_event('ledger.posted', p_actor, po.order_id, p_po_id, NULL, NULL, NULL,
      jsonb_build_object('template','T6','entry_id',v_t6,'variance_cents',v_variance), NULL, NULL, v_started);
  END IF;

  -- advance PO + its non-cancelled lines delivered → settled
  UPDATE public.fulfillment_vendor_pos SET status = 'settled' WHERE id = p_po_id AND status = 'delivered';
  UPDATE public.fulfillment_order_items i SET line_state = 'settled'
    FROM public.fulfillment_vendor_po_lines l
   WHERE l.po_id = p_po_id AND l.order_item_id = i.id AND i.line_state = 'delivered';
  PERFORM public.fulfillment_log_event('po.state_changed', p_actor, po.order_id, p_po_id, NULL, NULL, NULL,
    NULL, to_jsonb('delivered'::text), to_jsonb('settled'::text), v_started);

  RETURN jsonb_build_object(
    'po_id', p_po_id, 'vendor_invoice_cents', p_vendor_invoice_cents, 'expected_cents', v_expected,
    'variance_cents', v_variance, 'tolerance_cents', v_tol, 'auto_accepted', v_accepted,
    't3_entry', v_t3, 't6_entry', v_t6);
END;
$$;
REVOKE ALL ON FUNCTION public.fulfillment_settle_po(uuid, int, text, text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fulfillment_settle_po(uuid, int, text, text) TO service_role;

-- ─── 9. I2 hardening — explicit capture-identity guard (flagged, opt-in) ────
-- I2 left this a transitive guarantee (an out-of-balance capture fails the T1
-- ledger balance trigger and aborts intake). Harden it into an explicit table
-- CHECK so an out-of-identity order can never exist regardless of the ledger.
-- Validates cleanly: at migration time the table is empty; every intake (RPC-
-- enforced) already satisfies it (all 9 current fixtures verified 2026-07-17).
ALTER TABLE public.fulfillment_orders DROP CONSTRAINT IF EXISTS chk_fulfillment_captured_identity;
ALTER TABLE public.fulfillment_orders
  ADD CONSTRAINT chk_fulfillment_captured_identity
  CHECK (captured_total_cents = product_subtotal_cents + freight_charged_cents + tax_cents);
