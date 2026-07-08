-- apply_invoice_payment_effects refund reversal — BEGIN/ROLLBACK assertion
-- script (00268). Mirrors direct_order_rpc.assert.sql: exercises the trigger
-- against the SHARED local DB inside a transaction that is ROLLED BACK, so
-- nothing persists and no `db reset` is ever needed.
--
-- Run (after applying 00268):
--   docker exec -i supabase_db_supabase psql -U postgres -d postgres \
--     -f - < supabase/functions/tests/refund_reconciliation.assert.sql
-- or from a host with psql:
--   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" \
--     -f supabase/functions/tests/refund_reconciliation.assert.sql
--
-- Every case prints "R# PASS" / "R# FAIL". A clean run is all PASS. Run BEFORE
-- 00268 to see it go red (the reverses_invoice_payment_id column is absent).

BEGIN;

DO $$
DECLARE
  v_designer UUID;
  v_proj     UUID;
  -- group 1 (1-of-1)
  v_inv1     UUID := gen_random_uuid();
  v_m1       UUID := gen_random_uuid();
  v_pay1     UUID := gen_random_uuid();
  -- group 2 (1-of-2)
  v_inv2     UUID := gen_random_uuid();
  v_m2       UUID := gen_random_uuid();
  v_pay2a    UUID := gen_random_uuid();
  v_pay2b    UUID := gen_random_uuid();
  -- group 3 (void)
  v_inv3     UUID := gen_random_uuid();
  v_pay3     UUID := gen_random_uuid();
  -- scratch
  v_status   TEXT;
  v_paid     INTEGER;
  v_paidat   TIMESTAMPTZ;
  v_mstatus  TEXT;
  v_mpaidat  TIMESTAMPTZ;
  v_sum      BIGINT;
  v_cnt      INTEGER;
  v_net      BIGINT;
BEGIN
  SELECT id INTO v_designer FROM public.profiles LIMIT 1;
  IF v_designer IS NULL THEN
    RAISE EXCEPTION 'no profile available to act as designer — seed the local DB first';
  END IF;

  v_proj := gen_random_uuid();
  INSERT INTO public.projects (id, name, created_by, designer_id, client_id)
    VALUES (v_proj, 'RRA_ASSERT project', v_designer, v_designer, v_designer);

  -- ════════════════════════════════════════════════════════════════════════
  -- GROUP 1 — full refund of the sole payment (1-of-1)
  -- ════════════════════════════════════════════════════════════════════════
  INSERT INTO public.project_payment_milestones (id, project_id, label, percentage, amount_cents, status)
    VALUES (v_m1, v_proj, 'RRA M1', 100, 8000, 'outstanding');

  INSERT INTO public.invoices (id, project_id, designer_id, client_id, invoice_number, status, currency, total_cents, amount_paid_cents)
    VALUES (v_inv1, v_proj, v_designer, v_designer, 'INV-RRA-1', 'sent', 'USD', 8000, 0);

  INSERT INTO public.invoice_line_items (invoice_id, kind, milestone_id, description, quantity, unit_amount_cents, amount_cents)
    VALUES (v_inv1, 'milestone', v_m1, 'RRA milestone line', 1, 8000, 8000);

  -- Settle: succeeded payment fires the AFTER trigger → paid.
  INSERT INTO public.invoice_payments (id, invoice_id, amount_cents, method, status, received_at, stripe_payment_intent_id)
    VALUES (v_pay1, v_inv1, 8000, 'stripe', 'succeeded', NOW(), 'pi_rra_1');

  SELECT status, amount_paid_cents, paid_at INTO v_status, v_paid, v_paidat FROM public.invoices WHERE id = v_inv1;
  IF v_status = 'paid' AND v_paid = 8000 AND v_paidat IS NOT NULL
    THEN RAISE NOTICE 'R1 PASS: settle → invoice paid, amount_paid=%', v_paid;
    ELSE RAISE NOTICE 'R1 FAIL: status=% paid=% paid_at=%', v_status, v_paid, v_paidat;
  END IF;

  SELECT status INTO v_mstatus FROM public.project_payment_milestones WHERE id = v_m1;
  IF v_mstatus = 'paid'
    THEN RAISE NOTICE 'R2 PASS: settle → milestone paid';
    ELSE RAISE NOTICE 'R2 FAIL: milestone status=%', v_mstatus;
  END IF;

  SELECT count(*), COALESCE(SUM(net_amount),0) INTO v_cnt, v_net
    FROM public.designer_earnings WHERE invoice_payment_id = v_pay1;
  IF v_cnt = 1 AND v_net = 8000
    THEN RAISE NOTICE 'R3 PASS: settle → 1 earnings credit net=%', v_net;
    ELSE RAISE NOTICE 'R3 FAIL: cnt=% net=%', v_cnt, v_net;
  END IF;

  -- Refund: succeeded → refunded fires the AFTER trigger.
  UPDATE public.invoice_payments SET status = 'refunded' WHERE id = v_pay1;

  SELECT status, amount_paid_cents, paid_at INTO v_status, v_paid, v_paidat FROM public.invoices WHERE id = v_inv1;
  IF v_status = 'sent' AND v_paid = 0 AND v_paidat IS NULL
    THEN RAISE NOTICE 'R4 PASS: full refund → invoice sent, amount_paid=0, paid_at cleared';
    ELSE RAISE NOTICE 'R4 FAIL: status=% paid=% paid_at=%', v_status, v_paid, v_paidat;
  END IF;

  SELECT status, paid_at INTO v_mstatus, v_mpaidat FROM public.project_payment_milestones WHERE id = v_m1;
  IF v_mstatus = 'outstanding' AND v_mpaidat IS NULL
    THEN RAISE NOTICE 'R5 PASS: full refund → milestone back to outstanding, paid_at cleared';
    ELSE RAISE NOTICE 'R5 FAIL: milestone status=% paid_at=%', v_mstatus, v_mpaidat;
  END IF;

  SELECT count(*), COALESCE(SUM(net_amount),0) INTO v_cnt, v_net
    FROM public.designer_earnings WHERE reverses_invoice_payment_id = v_pay1;
  SELECT COALESCE(SUM(net_amount),0) INTO v_sum FROM public.designer_earnings WHERE invoice_id = v_inv1;
  IF v_cnt = 1 AND v_net = -8000 AND v_sum = 0
    THEN RAISE NOTICE 'R6 PASS: full refund → 1 contra row net=%, invoice earnings net to 0', v_net;
    ELSE RAISE NOTICE 'R6 FAIL: contra_cnt=% contra_net=% invoice_sum=%', v_cnt, v_net, v_sum;
  END IF;

  -- ════════════════════════════════════════════════════════════════════════
  -- GROUP 2 — refund ONE of two payments (invoice stays partially_paid)
  -- ════════════════════════════════════════════════════════════════════════
  INSERT INTO public.project_payment_milestones (id, project_id, label, percentage, amount_cents, status)
    VALUES (v_m2, v_proj, 'RRA M2', 100, 8000, 'outstanding');

  INSERT INTO public.invoices (id, project_id, designer_id, client_id, invoice_number, status, currency, total_cents, amount_paid_cents)
    VALUES (v_inv2, v_proj, v_designer, v_designer, 'INV-RRA-2', 'sent', 'USD', 8000, 0);

  INSERT INTO public.invoice_line_items (invoice_id, kind, milestone_id, description, quantity, unit_amount_cents, amount_cents)
    VALUES (v_inv2, 'milestone', v_m2, 'RRA milestone line 2', 1, 8000, 8000);

  INSERT INTO public.invoice_payments (id, invoice_id, amount_cents, method, status, received_at, stripe_payment_intent_id)
    VALUES (v_pay2a, v_inv2, 4000, 'stripe', 'succeeded', NOW(), 'pi_rra_2a');
  INSERT INTO public.invoice_payments (id, invoice_id, amount_cents, method, status, received_at, stripe_payment_intent_id)
    VALUES (v_pay2b, v_inv2, 4000, 'stripe', 'succeeded', NOW(), 'pi_rra_2b');

  SELECT status INTO v_status FROM public.invoices WHERE id = v_inv2;
  IF v_status = 'paid'
    THEN RAISE NOTICE 'R7 PASS: two 4000 payments → invoice paid';
    ELSE RAISE NOTICE 'R7 FAIL: status=%', v_status;
  END IF;

  UPDATE public.invoice_payments SET status = 'refunded' WHERE id = v_pay2a;

  SELECT status, amount_paid_cents INTO v_status, v_paid FROM public.invoices WHERE id = v_inv2;
  IF v_status = 'partially_paid' AND v_paid = 4000
    THEN RAISE NOTICE 'R8 PASS: refund 1 of 2 → partially_paid, amount_paid=4000';
    ELSE RAISE NOTICE 'R8 FAIL: status=% paid=%', v_status, v_paid;
  END IF;

  SELECT status INTO v_mstatus FROM public.project_payment_milestones WHERE id = v_m2;
  IF v_mstatus = 'outstanding'
    THEN RAISE NOTICE 'R9 PASS: refund 1 of 2 (below paid) → milestone outstanding';
    ELSE RAISE NOTICE 'R9 FAIL: milestone status=%', v_mstatus;
  END IF;

  SELECT COALESCE(SUM(net_amount),0) INTO v_sum FROM public.designer_earnings WHERE invoice_id = v_inv2;
  SELECT count(*) INTO v_cnt FROM public.designer_earnings WHERE reverses_invoice_payment_id = v_pay2a;
  SELECT count(*) INTO v_net FROM public.designer_earnings WHERE reverses_invoice_payment_id = v_pay2b;
  IF v_sum = 4000 AND v_cnt = 1 AND v_net = 0
    THEN RAISE NOTICE 'R10 PASS: refund 1 of 2 → earnings net=4000, only refunded payment reversed';
    ELSE RAISE NOTICE 'R10 FAIL: sum=% rev_2a=% rev_2b=%', v_sum, v_cnt, v_net;
  END IF;

  -- ════════════════════════════════════════════════════════════════════════
  -- GROUP 3 — a void invoice is NEVER resurrected by a refund
  -- ════════════════════════════════════════════════════════════════════════
  INSERT INTO public.invoices (id, project_id, designer_id, client_id, invoice_number, status, currency, total_cents, amount_paid_cents, voided_at, void_reason)
    VALUES (v_inv3, v_proj, v_designer, v_designer, 'INV-RRA-3', 'void', 'USD', 8000, 0, NOW(), 'RRA void');

  INSERT INTO public.invoice_payments (id, invoice_id, amount_cents, method, status, received_at, stripe_payment_intent_id)
    VALUES (v_pay3, v_inv3, 8000, 'stripe', 'succeeded', NOW(), 'pi_rra_3');
  SELECT status INTO v_status FROM public.invoices WHERE id = v_inv3;
  IF v_status = 'void' THEN RAISE NOTICE 'R11 PASS: void invoice stays void on settle';
                       ELSE RAISE NOTICE 'R11 FAIL: void invoice became %', v_status;
  END IF;

  UPDATE public.invoice_payments SET status = 'refunded' WHERE id = v_pay3;
  SELECT status INTO v_status FROM public.invoices WHERE id = v_inv3;
  IF v_status = 'void' THEN RAISE NOTICE 'R12 PASS: void invoice stays void on refund (not resurrected)';
                       ELSE RAISE NOTICE 'R12 FAIL: void invoice became %', v_status;
  END IF;

  -- ════════════════════════════════════════════════════════════════════════
  -- GROUP 4 — SQL-level replay idempotency (distinct-event re-fire)
  -- Re-run the effects fn against the already-refunded invoice twice more.
  -- ════════════════════════════════════════════════════════════════════════
  PERFORM public.apply_invoice_payment_effects(v_inv1);
  PERFORM public.apply_invoice_payment_effects(v_inv1);

  SELECT count(*) INTO v_cnt FROM public.designer_earnings WHERE reverses_invoice_payment_id = v_pay1;
  SELECT COALESCE(SUM(net_amount),0) INTO v_sum FROM public.designer_earnings WHERE invoice_id = v_inv1;
  SELECT status INTO v_status FROM public.invoices WHERE id = v_inv1;
  SELECT status INTO v_mstatus FROM public.project_payment_milestones WHERE id = v_m1;
  IF v_cnt = 1 AND v_sum = 0 AND v_status = 'sent' AND v_mstatus = 'outstanding'
    THEN RAISE NOTICE 'R13 PASS: replay ×2 → no double reversal (contra_cnt=1, net=0, invoice sent, milestone outstanding)';
    ELSE RAISE NOTICE 'R13 FAIL: contra_cnt=% net=% status=% milestone=%', v_cnt, v_sum, v_status, v_mstatus;
  END IF;
END $$;

ROLLBACK;
