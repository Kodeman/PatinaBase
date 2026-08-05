-- invoice_surcharge.assert.sql — 00428 payment-method chooser + surcharge rail.
--
-- Proves the money contract the whole feature rests on, against the SHARED local
-- DB without persisting anything: every fixture is created inside a transaction
-- that is ROLLED BACK at the end, so there is nothing to clean up and no
-- `db reset` is ever needed. auth.uid() is simulated by setting the
-- request.jwt.claims GUC (transaction-local) exactly as the Supabase gateway
-- would.
--
-- What is asserted:
--   S1  the formula itself — card half-up, ACH 80 bps, the $5 ACH cap,
--       the exact half-cent boundary, NULL/legacy = 0, and the bigint guard
--       (an int4 product would overflow above ~$71.6k)
--   S2  claim with 'card' → surcharge on the attempt AND the pending payment,
--       amount_cents left as the pure balance
--   S3  re-claim with 'us_bank_account' supersedes the card attempt with
--       failure_reason 'payment_method_changed' and hands back its session id
--   S4  legacy claim (no method) → NULL method, zero surcharge
--   S5  settlement's GROSS amount contract: amount+surcharge settles, the
--       net-only amount is forced to requires_refund
--   S6  get_invoice_payment_options — client sees the studio's real bps,
--       designer sees it, a stranger gets invoice_not_found, and a studio with
--       no settings row falls back to {300, null}
--   S7  the payment_discrepancy agent task raised by a requires_refund charge
--       reports the GROSS Stripe holds, with the fee broken out
--
-- Run:
--   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" \
--     -v ON_ERROR_STOP=1 -f supabase/functions/_tests/invoice_surcharge.assert.sql
--
-- Every case prints "S#.# PASS"; any failure RAISEs (ON_ERROR_STOP kills the run).

\set ON_ERROR_STOP on

BEGIN;

DO $$
DECLARE
  v_studio     uuid := gen_random_uuid();
  v_bare       uuid := gen_random_uuid();   -- studio with NO billing settings row
  v_designer   uuid;
  v_client     uuid;
  v_stranger   uuid;
  v_project    uuid := gen_random_uuid();
  v_inv_a      uuid := gen_random_uuid();   -- $1,000.00 — the main walk
  v_inv_b      uuid := gen_random_uuid();   -- $1,000.00 — settlement mismatch
  v_inv_big    uuid := gen_random_uuid();   -- $100,000.00 — bigint guard
  v_inv_bare   uuid := gen_random_uuid();   -- on the settings-less studio
  v_cus        text := 'cus_invoice_surcharge_assert';
  v_claim      jsonb;
  v_settle     jsonb;
  v_opts       jsonb;
  v_att        public.invoice_checkout_attempts%ROWTYPE;
  v_pay        public.invoice_payments%ROWTYPE;
  v_old_att    uuid;
  v_refund_pay uuid;                        -- the payment forced to requires_refund (S5.1 → S7)
  v_task       public.agent_tasks%ROWTYPE;
  v_n          integer;
  v_raised     boolean;
BEGIN
  -- ═══ Fixtures (auth.uid() NULL → service/migration context) ═══════════════
  PERFORM set_config('request.jwt.claims', '', true);

  SELECT id INTO v_designer FROM public.profiles WHERE id = 'a0000000-0000-0000-0000-000000000004';
  SELECT id INTO v_client   FROM public.profiles WHERE id = 'a0000000-0000-0000-0000-000000000005';
  SELECT id INTO v_stranger FROM public.profiles WHERE id = 'a0000000-0000-0000-0000-000000000001';
  IF v_designer IS NULL OR v_client IS NULL OR v_stranger IS NULL THEN
    RAISE EXCEPTION 'seed profiles missing — run `supabase db reset` first';
  END IF;

  INSERT INTO public.organizations (id, type, name, slug) VALUES
    (v_studio, 'design_studio', 'Surcharge Assert Studio', 'surcharge-assert-studio-' || left(v_studio::text, 8)),
    (v_bare,   'design_studio', 'Bare Assert Studio',      'bare-assert-studio-'      || left(v_bare::text, 8));

  INSERT INTO public.organization_members (user_id, organization_id, role, status)
  VALUES (v_designer, v_studio, 'owner', 'active'),
         (v_designer, v_bare,   'owner', 'active');

  UPDATE public.profiles SET stripe_customer_id = v_cus WHERE id = v_client;

  INSERT INTO public.projects (id, name, created_by, client_id, studio_id)
  VALUES (v_project, 'Surcharge Assert Project', v_designer, v_client, v_studio);

  INSERT INTO public.invoices
    (id, project_id, designer_id, client_id, studio_id, invoice_number, status,
     currency, subtotal_cents, tax_cents, total_cents, amount_paid_cents)
  VALUES
    (v_inv_a,    v_project, v_designer, v_client, v_studio, 'SA-0001', 'sent', 'USD',   100000, 0,   100000, 0),
    (v_inv_b,    v_project, v_designer, v_client, v_studio, 'SA-0002', 'sent', 'USD',   100000, 0,   100000, 0),
    (v_inv_big,  v_project, v_designer, v_client, v_studio, 'SA-0003', 'sent', 'USD', 10000000, 0, 10000000, 0),
    (v_inv_bare, v_project, v_designer, v_client, v_bare,   'SA-0004', 'sent', 'USD',   100000, 0,   100000, 0);

  -- The studio charges 2.5% on cards (not the 3% platform default).
  INSERT INTO public.studio_billing_settings (studio_id, card_surcharge_bps, check_remit_to)
  VALUES (v_studio, 250, E'Surcharge Assert Studio\n123 Elm Street\nDes Moines, IA 50309');

  -- ═══ S1 — the formula is the only home of the arithmetic ═════════════════

  -- S1.1 card, 2.5% of $1,000.00 = $25.00
  IF public.invoice_payment_surcharge_cents(100000, 'card', 250) <> 2500 THEN
    RAISE EXCEPTION 'S1.1 FAIL: card 250bps on 100000 = %, expected 2500',
      public.invoice_payment_surcharge_cents(100000, 'card', 250);
  END IF;
  RAISE NOTICE 'S1.1 PASS: card 250bps on $1,000.00 = 2500¢';

  -- S1.2 exact half-cent rounds UP (100020 * 250 = 2500.5¢ → 2501¢)
  IF public.invoice_payment_surcharge_cents(100020, 'card', 250) <> 2501 THEN
    RAISE EXCEPTION 'S1.2 FAIL: half-cent boundary = %, expected 2501 (half-up)',
      public.invoice_payment_surcharge_cents(100020, 'card', 250);
  END IF;
  -- and one cent below the boundary still rounds down
  IF public.invoice_payment_surcharge_cents(100019, 'card', 250) <> 2500 THEN
    RAISE EXCEPTION 'S1.2 FAIL: 100019 @250bps = %, expected 2500',
      public.invoice_payment_surcharge_cents(100019, 'card', 250);
  END IF;
  RAISE NOTICE 'S1.2 PASS: exact half-cent rounds up (2500.5→2501), 2500.475→2500';

  -- S1.3 ACH is 0.8% below the cap
  IF public.invoice_payment_surcharge_cents(10000, 'us_bank_account', 250) <> 80 THEN
    RAISE EXCEPTION 'S1.3 FAIL: ACH on 10000 = %, expected 80',
      public.invoice_payment_surcharge_cents(10000, 'us_bank_account', 250);
  END IF;
  RAISE NOTICE 'S1.3 PASS: ACH 80bps on $100.00 = 80¢ (card bps ignored)';

  -- S1.4 ACH caps at exactly $5.00 the moment the balance reaches $625.00
  IF public.invoice_payment_surcharge_cents(62499, 'us_bank_account', 250) <> 500
     OR public.invoice_payment_surcharge_cents(62500, 'us_bank_account', 250) <> 500
     OR public.invoice_payment_surcharge_cents(10000000, 'us_bank_account', 250) <> 500 THEN
    RAISE EXCEPTION 'S1.4 FAIL: ACH cap broken (62499=%, 62500=%, 10000000=%)',
      public.invoice_payment_surcharge_cents(62499, 'us_bank_account', 250),
      public.invoice_payment_surcharge_cents(62500, 'us_bank_account', 250),
      public.invoice_payment_surcharge_cents(10000000, 'us_bank_account', 250);
  END IF;
  RAISE NOTICE 'S1.4 PASS: ACH capped at 500¢ from $625.00 upward';

  -- S1.5 NULL / unknown method and non-positive amounts are free
  IF public.invoice_payment_surcharge_cents(100000, NULL, 250) <> 0
     OR public.invoice_payment_surcharge_cents(100000, 'check', 250) <> 0
     OR public.invoice_payment_surcharge_cents(0, 'card', 250) <> 0
     OR public.invoice_payment_surcharge_cents(NULL, 'card', 250) <> 0 THEN
    RAISE EXCEPTION 'S1.5 FAIL: legacy/no-method path is not free';
  END IF;
  RAISE NOTICE 'S1.5 PASS: NULL method, unknown method, zero and NULL amounts all = 0¢';

  -- S1.6 bigint guard — 10,000,000¢ × 300 = 3.0e9, which OVERFLOWS int4
  IF public.invoice_payment_surcharge_cents(10000000, 'card', 300) <> 300000 THEN
    RAISE EXCEPTION 'S1.6 FAIL: $100k @300bps = %, expected 300000',
      public.invoice_payment_surcharge_cents(10000000, 'card', 300);
  END IF;
  -- and the int4-overflow threshold itself (~$71.6k at 300 bps)
  IF public.invoice_payment_surcharge_cents(7158279, 'card', 300) <> 214748 THEN
    RAISE EXCEPTION 'S1.6 FAIL: overflow-threshold amount = %, expected 214748',
      public.invoice_payment_surcharge_cents(7158279, 'card', 300);
  END IF;
  RAISE NOTICE 'S1.6 PASS: bigint product survives $100,000.00 @300bps (=300000¢)';

  -- ═══ S2 — claim 'card' puts the fee beside the balance, never inside it ══

  v_claim := public.claim_invoice_checkout_attempt(v_inv_a, v_client, v_cus, false, 'card');

  IF (v_claim->>'amount_cents')::int <> 100000
     OR (v_claim->>'surcharge_cents')::int <> 2500
     OR v_claim->>'payment_method' <> 'card'
     OR v_claim->>'superseded_session_id' IS NOT NULL THEN
    RAISE EXCEPTION 'S2.1 FAIL: claim returned %', v_claim;
  END IF;
  RAISE NOTICE 'S2.1 PASS: card claim → amount 100000¢ + surcharge 2500¢ (studio 250bps)';

  SELECT * INTO v_att FROM public.invoice_checkout_attempts
   WHERE id = (v_claim->>'attempt_id')::uuid;
  SELECT * INTO v_pay FROM public.invoice_payments
   WHERE id = (v_claim->>'payment_id')::uuid;

  IF v_att.amount_cents <> 100000 OR v_att.surcharge_cents <> 2500
     OR v_att.payment_method <> 'card' THEN
    RAISE EXCEPTION 'S2.2 FAIL: attempt row amount=% surcharge=% method=%',
      v_att.amount_cents, v_att.surcharge_cents, v_att.payment_method;
  END IF;
  IF v_pay.amount_cents <> 100000 OR v_pay.surcharge_cents <> 2500
     OR v_pay.method <> 'stripe' OR v_pay.status <> 'pending'
     OR v_pay.stripe_payment_method_type IS NOT NULL THEN
    RAISE EXCEPTION 'S2.2 FAIL: payment row amount=% surcharge=% method=% status=% pmtype=%',
      v_pay.amount_cents, v_pay.surcharge_cents, v_pay.method, v_pay.status,
      v_pay.stripe_payment_method_type;
  END IF;
  RAISE NOTICE 'S2.2 PASS: attempt + pending payment both carry the fee; amount_cents stays the pure balance';

  -- S2.3 a bad method is rejected by name (the edge function maps this to 400)
  v_raised := false;
  BEGIN
    PERFORM public.claim_invoice_checkout_attempt(v_inv_a, v_client, v_cus, false, 'paypal');
  EXCEPTION WHEN OTHERS THEN
    v_raised := (SQLERRM LIKE 'invoice_checkout_bad_payment_method%');
  END;
  IF NOT v_raised THEN RAISE EXCEPTION 'S2.3 FAIL: bad payment method was accepted'; END IF;
  RAISE NOTICE 'S2.3 PASS: unknown payment method raises invoice_checkout_bad_payment_method';

  -- ═══ S3 — switching rails supersedes the live attempt ════════════════════

  -- Pretend Stripe had already issued a session for the card attempt.
  v_old_att := v_att.id;
  UPDATE public.invoice_checkout_attempts
     SET stripe_checkout_session_id = 'cs_test_surcharge_card', state = 'session_created'
   WHERE id = v_old_att;
  UPDATE public.invoices SET stripe_checkout_session_id = 'cs_test_surcharge_card'
   WHERE id = v_inv_a;

  v_claim := public.claim_invoice_checkout_attempt(v_inv_a, v_client, v_cus, false, 'us_bank_account');

  IF (v_claim->>'attempt_id')::uuid = v_old_att THEN
    RAISE EXCEPTION 'S3.1 FAIL: rail switch reused the card attempt';
  END IF;
  IF v_claim->>'superseded_session_id' <> 'cs_test_surcharge_card' THEN
    RAISE EXCEPTION 'S3.1 FAIL: superseded_session_id = %, expected cs_test_surcharge_card',
      v_claim->>'superseded_session_id';
  END IF;
  RAISE NOTICE 'S3.1 PASS: rail switch minted a new attempt and handed back the stale session id';

  SELECT * INTO v_att FROM public.invoice_checkout_attempts WHERE id = v_old_att;
  IF v_att.state <> 'superseded' OR v_att.failure_reason <> 'payment_method_changed' THEN
    RAISE EXCEPTION 'S3.2 FAIL: old attempt state=% reason=%', v_att.state, v_att.failure_reason;
  END IF;
  SELECT count(*) INTO v_n FROM public.invoice_payments
   WHERE checkout_attempt_id = v_old_att AND status = 'failed';
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'S3.2 FAIL: superseded attempt left % failed payments, expected 1', v_n;
  END IF;
  RAISE NOTICE 'S3.2 PASS: old attempt superseded (payment_method_changed) + its payment failed';

  -- S3.3 the ACH surcharge on a $1,000.00 balance is the $5.00 cap, not 0.8%
  IF (v_claim->>'surcharge_cents')::int <> 500
     OR (v_claim->>'amount_cents')::int <> 100000
     OR v_claim->>'payment_method' <> 'us_bank_account' THEN
    RAISE EXCEPTION 'S3.3 FAIL: ACH claim returned %', v_claim;
  END IF;
  RAISE NOTICE 'S3.3 PASS: ACH claim on $1,000.00 → 500¢ (capped, not 800¢)';

  -- S3.4 re-claiming the SAME rail is idempotent — no churn
  v_old_att := (v_claim->>'attempt_id')::uuid;
  v_claim := public.claim_invoice_checkout_attempt(v_inv_a, v_client, v_cus, false, 'us_bank_account');
  IF (v_claim->>'attempt_id')::uuid <> v_old_att
     OR (v_claim->>'surcharge_cents')::int <> 500
     OR v_claim->>'superseded_session_id' IS NOT NULL THEN
    RAISE EXCEPTION 'S3.4 FAIL: identical re-claim churned the attempt: %', v_claim;
  END IF;
  RAISE NOTICE 'S3.4 PASS: identical re-claim returns the same attempt, supersedes nothing';

  -- ═══ S4 — the legacy (no method) path is untouched ═══════════════════════

  v_claim := public.claim_invoice_checkout_attempt(v_inv_big, v_client, v_cus);
  IF (v_claim->>'amount_cents')::int <> 10000000
     OR (v_claim->>'surcharge_cents')::int <> 0
     OR v_claim->>'payment_method' IS NOT NULL THEN
    RAISE EXCEPTION 'S4.1 FAIL: legacy 3-arg claim returned %', v_claim;
  END IF;
  RAISE NOTICE 'S4.1 PASS: legacy claim (no p_payment_method) → NULL rail, 0¢ surcharge';

  -- S4.2 the same $100,000.00 invoice claimed on card exercises the bigint path
  --      end to end (10,000,000 × 250 = 2.5e9 — an int4 product would overflow)
  v_claim := public.claim_invoice_checkout_attempt(v_inv_big, v_client, v_cus, false, 'card');
  IF (v_claim->>'surcharge_cents')::int <> 250000
     OR (v_claim->>'amount_cents')::int <> 10000000 THEN
    RAISE EXCEPTION 'S4.2 FAIL: $100k card claim returned %', v_claim;
  END IF;
  RAISE NOTICE 'S4.2 PASS: $100,000.00 card claim → 250000¢ surcharge, no int4 overflow';

  -- ═══ S5 — settlement's amount contract is GROSS ══════════════════════════

  v_claim := public.claim_invoice_checkout_attempt(v_inv_b, v_client, v_cus, false, 'card');

  -- Walk the real rail: Stripe issues the session, finalize persists it. This
  -- also proves finalize's surcharge invariant (attempt and payment must agree)
  -- and that it echoes the fee back to the caller.
  v_claim := public.finalize_invoice_checkout_attempt(
    (v_claim->>'attempt_id')::uuid, v_client, v_cus, 'cs_test_surcharge_net'
  );
  IF (v_claim->>'surcharge_cents')::int <> 2500
     OR v_claim->>'payment_method' <> 'card' THEN
    RAISE EXCEPTION 'S5.0 FAIL: finalize returned %', v_claim;
  END IF;
  RAISE NOTICE 'S5.0 PASS: finalize echoes the fee and the rail';

  -- S5.1 the net-only amount (what Stripe would report WITHOUT the fee line)
  --      must be rejected — this is the mismatch that protects the invoice.
  v_refund_pay := (v_claim->>'payment_id')::uuid;
  v_settle := public.settle_invoice_checkout_payment(
    v_refund_pay, 'evt_surcharge_net', 'pi_surcharge_net', 100000, 'card'
  );
  IF v_settle->>'outcome' <> 'requires_refund' THEN
    RAISE EXCEPTION 'S5.1 FAIL: net-only amount settled as %', v_settle->>'outcome';
  END IF;
  RAISE NOTICE 'S5.1 PASS: Stripe reporting the NET amount → requires_refund';

  -- S5.2 the gross amount settles cleanly and stamps the rail
  v_claim := public.claim_invoice_checkout_attempt(v_inv_a, v_client, v_cus, false, 'card');
  PERFORM public.finalize_invoice_checkout_attempt(
    (v_claim->>'attempt_id')::uuid, v_client, v_cus, 'cs_test_surcharge_gross'
  );
  v_settle := public.settle_invoice_checkout_payment(
    (v_claim->>'payment_id')::uuid, 'evt_surcharge_gross', 'pi_surcharge_gross', 102500, 'card'
  );
  IF v_settle->>'outcome' <> 'succeeded'
     OR (v_settle->>'amount_cents')::int <> 100000
     OR (v_settle->>'surcharge_cents')::int <> 2500
     OR v_settle->>'stripe_payment_method_type' <> 'card' THEN
    RAISE EXCEPTION 'S5.2 FAIL: gross settlement returned %', v_settle;
  END IF;
  RAISE NOTICE 'S5.2 PASS: gross amount (100000+2500) settles succeeded, rail stamped card';

  -- S5.3 only the NET amount touched the invoice balance
  SELECT amount_paid_cents INTO v_n FROM public.invoices WHERE id = v_inv_a;
  IF v_n <> 100000 THEN
    RAISE EXCEPTION 'S5.3 FAIL: invoice amount_paid_cents = %, expected 100000 (fee must not apply)', v_n;
  END IF;
  RAISE NOTICE 'S5.3 PASS: the fee never entered the invoice balance (amount_paid_cents = 100000¢)';

  -- ═══ S6 — get_invoice_payment_options: who may see the fee ══════════════

  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_client, 'role', 'authenticated')::text, true);
  v_opts := public.get_invoice_payment_options(v_inv_b);
  IF (v_opts->>'card_surcharge_bps')::int <> 250
     OR v_opts->>'check_remit_to' NOT LIKE 'Surcharge Assert Studio%' THEN
    RAISE EXCEPTION 'S6.1 FAIL: client got %', v_opts;
  END IF;
  RAISE NOTICE 'S6.1 PASS: client reads the studio''s real 250bps + remit-to';

  -- S6.2 the studio with no settings row falls back to the platform default
  v_opts := public.get_invoice_payment_options(v_inv_bare);
  IF (v_opts->>'card_surcharge_bps')::int <> 300
     OR v_opts->>'check_remit_to' IS NOT NULL THEN
    RAISE EXCEPTION 'S6.2 FAIL: settings-less studio got %', v_opts;
  END IF;
  RAISE NOTICE 'S6.2 PASS: studio with no settings row → {300, null}';

  -- S6.3 the designer (and any active studio member) may read it too
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_designer, 'role', 'authenticated')::text, true);
  v_opts := public.get_invoice_payment_options(v_inv_b);
  IF (v_opts->>'card_surcharge_bps')::int <> 250 THEN
    RAISE EXCEPTION 'S6.3 FAIL: designer got %', v_opts;
  END IF;
  RAISE NOTICE 'S6.3 PASS: designer reads the same options';

  -- S6.4 a stranger is told the invoice does not exist — never that it does
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_stranger, 'role', 'authenticated')::text, true);
  v_raised := false;
  BEGIN
    PERFORM public.get_invoice_payment_options(v_inv_b);
  EXCEPTION WHEN OTHERS THEN
    v_raised := (SQLERRM = 'invoice_not_found');
  END;
  IF NOT v_raised THEN RAISE EXCEPTION 'S6.4 FAIL: stranger was served payment options'; END IF;
  RAISE NOTICE 'S6.4 PASS: stranger raises invoice_not_found (existence never confirmed)';

  -- S6.5 anonymous callers get the same non-answer
  PERFORM set_config('request.jwt.claims', '', true);
  v_raised := false;
  BEGIN
    PERFORM public.get_invoice_payment_options(v_inv_b);
  EXCEPTION WHEN OTHERS THEN
    v_raised := (SQLERRM = 'invoice_not_found');
  END;
  IF NOT v_raised THEN RAISE EXCEPTION 'S6.5 FAIL: anonymous caller was served payment options'; END IF;
  RAISE NOTICE 'S6.5 PASS: anonymous caller raises invoice_not_found';

  -- ═══ S7 — the discrepancy task an operator refunds from ══════════════════
  --
  -- S5.1's mismatched settle drove that payment to requires_refund, which fires
  -- sync_invoice_checkout_attempt's fan-out. The operator reads charged_cents
  -- to know how much Stripe is holding — since 00428 that is the GROSS, and
  -- the fee is broken out beside it.

  PERFORM set_config('request.jwt.claims', '', true);

  SELECT * INTO v_task FROM public.agent_tasks
   WHERE task_type = 'payment_discrepancy'
     AND entity_type = 'invoice_payment'
     AND entity_id = v_refund_pay;
  IF v_task.id IS NULL THEN
    RAISE EXCEPTION 'S7.1 FAIL: requires_refund raised no payment_discrepancy task for payment %',
      v_refund_pay;
  END IF;
  RAISE NOTICE 'S7.1 PASS: requires_refund enqueued a payment_discrepancy task';

  IF (v_task.payload->>'charged_cents')::int <> 102500 THEN
    RAISE EXCEPTION 'S7.2 FAIL: charged_cents = %, expected 102500 (gross = 100000 net + 2500 fee)',
      v_task.payload->>'charged_cents';
  END IF;
  IF (v_task.payload->>'surcharge_cents')::int <> 2500 THEN
    RAISE EXCEPTION 'S7.2 FAIL: surcharge_cents = %, expected 2500',
      v_task.payload->>'surcharge_cents';
  END IF;
  IF (v_task.payload->>'invoice_payment_id')::uuid <> v_refund_pay
     OR (v_task.payload->>'invoice_id')::uuid <> v_inv_b
     OR v_task.payload->>'required_action' <> 'refund_and_reconcile'
     OR v_task.status <> 'awaiting_review' THEN
    RAISE EXCEPTION 'S7.2 FAIL: task payload/status wrong: % (status %)', v_task.payload, v_task.status;
  END IF;
  RAISE NOTICE 'S7.2 PASS: task reports charged_cents 102500 GROSS + surcharge_cents 2500';

  RAISE NOTICE '── invoice_surcharge.assert.sql: ALL PASS ──';
END;
$$;

ROLLBACK;
