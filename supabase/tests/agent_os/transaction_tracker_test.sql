-- ═══════════════════════════════════════════════════════════════════════════
-- Agent OS WP-2.3 Transaction Tracker tests (migration 00308)
--
-- Exercises the concierge order lifecycle + payment-discrepancy detector +
-- damage subflow against real rows:
--   (1)  create order -> BEFORE INSERT trigger seeds po_draft checklist.
--   (2)  advance po_draft->po_sent BLOCKED while a required po_draft item is
--        undone (checklist gate RAISEs).
--   (3)  mark the required items done (toggle_concierge_checklist_item) ->
--        advance succeeds: pipeline_stage_events row (entity_type=
--        concierge_order), stage_entered_at bumped, po_sent checklist seeded.
--   (4)  force-advance with a note bypasses the gate; force WITHOUT a note
--        RAISEs.
--   (5)  full walk to reconciled; advancing a terminal order RAISEs; a
--        non-adjacent forward jump RAISEs.
--   (6)  cancel from mid-stage -> stage=cancelled + event row.
--   (7)  a delivered order whose po_payments(paid) sum < PO total ->
--        check_concierge_payment_discrepancies() sets payment_flag='mismatch'
--        and enqueues EXACTLY ONE payment_discrepancy task; a second run keeps
--        it at exactly one (idempotency).
--   (8)  a matching delivered order -> payment_flag='ok', no task.
--   (9)  damage: enter_concierge_damage_mode seeds photo_checklist + deadline;
--        a claim with deadline <7 days out -> exactly ONE damage_claim_escalation.
--   (10) move_pipeline_stage STILL RAISEs for concierge_order (single-path).
--
-- How to run:
--   docker exec -i supabase_db_supabase psql -U postgres -d postgres \
--     -v ON_ERROR_STOP=1 < supabase/tests/agent_os/transaction_tracker_test.sql
--
-- Single transaction, ROLLBACK at the end -- re-runnable, no side effects.
-- Self-isolating: fresh gen_random_uuid() rows, a 'ttest:' actor/title tag,
-- and every task/event/flag assertion scoped by the specific order id so it
-- never depends on (or disturbs) other concierge_orders. FK targets are seed
-- rows present on every fresh local stack.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

DO $$
DECLARE
  v_user      uuid := 'a0000000-0000-0000-0000-000000000001';  -- seed auth user + profile
  v_vendor    uuid := '11111111-1111-1111-1111-111111111104';   -- seed vendor
  v_project   uuid := 'b0000000-0000-0000-0000-0000000000d1';    -- seed project
  v_order     uuid;
  v_order2    uuid;
  v_po        uuid;
  v_result    jsonb;
  v_stage     text;
  v_flag      text;
  v_before    timestamptz;
  v_after     timestamptz;
  v_cnt       int;
  v_raised    boolean;
  v_damage    jsonb;
BEGIN
  -- ── (1) create -> po_draft checklist seeded ─────────────────────────────
  INSERT INTO public.concierge_orders (title, vendor_id, project_id)
  VALUES ('ttest: Lifecycle Order', v_vendor, v_project)
  RETURNING id, stage INTO v_order, v_stage;

  ASSERT v_stage = 'po_draft', 'FAIL (1): default stage should be po_draft, got ' || v_stage;
  SELECT jsonb_array_length(checklists -> 'po_draft') INTO v_cnt
    FROM public.concierge_orders WHERE id = v_order;
  ASSERT v_cnt = 9, 'FAIL (1): po_draft checklist should seed 9 items, got ' || coalesce(v_cnt, -1);
  RAISE NOTICE 'Case (1) passed: order created, po_draft checklist seeded (% items).', v_cnt;

  -- ── (2) advance blocked while a required po_draft item is undone ─────────
  v_raised := false;
  BEGIN
    PERFORM public.advance_concierge_order(v_order, 'po_sent', 'ttest:kody');
  EXCEPTION WHEN OTHERS THEN
    v_raised := true;
    ASSERT SQLERRM LIKE '%checklist incomplete%', 'FAIL (2): wrong error: ' || SQLERRM;
  END;
  ASSERT v_raised, 'FAIL (2): advance should have been blocked by the checklist gate';
  SELECT stage INTO v_stage FROM public.concierge_orders WHERE id = v_order;
  ASSERT v_stage = 'po_draft', 'FAIL (2): stage should still be po_draft after blocked advance, got ' || v_stage;
  RAISE NOTICE 'Case (2) passed: checklist gate blocked the advance.';

  -- ── (3) mark all required po_draft items done -> advance succeeds ────────
  PERFORM public.toggle_concierge_checklist_item(v_order, 'po_draft', item ->> 'key', true, 'ttest:kody')
    FROM jsonb_array_elements(
      (SELECT checklists -> 'po_draft' FROM public.concierge_orders WHERE id = v_order)
    ) item
   WHERE (item ->> 'required')::boolean;

  -- backdate stage_entered_at so the RPC's fresh now() is provably later
  UPDATE public.concierge_orders SET stage_entered_at = now() - interval '1 day'
   WHERE id = v_order RETURNING stage_entered_at INTO v_before;

  v_result := public.advance_concierge_order(v_order, 'po_sent', 'ttest:kody', false, 'items confirmed');
  ASSERT (v_result ->> 'from_stage') = 'po_draft', 'FAIL (3): from_stage, got ' || v_result;
  ASSERT (v_result ->> 'to_stage')   = 'po_sent',  'FAIL (3): to_stage, got ' || v_result;

  SELECT stage, stage_entered_at INTO v_stage, v_after
    FROM public.concierge_orders WHERE id = v_order;
  ASSERT v_stage = 'po_sent', 'FAIL (3): stage should be po_sent, got ' || v_stage;
  ASSERT v_after > v_before, 'FAIL (3): stage_entered_at should have bumped forward';

  SELECT jsonb_array_length(checklists -> 'po_sent') INTO v_cnt
    FROM public.concierge_orders WHERE id = v_order;
  ASSERT v_cnt = 3, 'FAIL (3): po_sent checklist should seed 3 items, got ' || coalesce(v_cnt, -1);

  SELECT count(*) INTO v_cnt FROM public.pipeline_stage_events
   WHERE entity_type = 'concierge_order' AND entity_id = v_order
     AND from_stage = 'po_draft' AND to_stage = 'po_sent' AND actor = 'ttest:kody';
  ASSERT v_cnt = 1, 'FAIL (3): expected 1 concierge_order stage event, got ' || v_cnt;
  RAISE NOTICE 'Case (3) passed: gated advance succeeded, event written, next checklist seeded.';

  -- ── (4) force-advance bypasses the gate; force w/o note RAISEs ───────────
  v_raised := false;
  BEGIN
    PERFORM public.advance_concierge_order(v_order, 'freight_booked', 'ttest:kody', true, NULL);
  EXCEPTION WHEN OTHERS THEN
    v_raised := true;
    ASSERT SQLERRM LIKE '%requires a non-empty p_note%', 'FAIL (4): wrong error: ' || SQLERRM;
  END;
  ASSERT v_raised, 'FAIL (4): force without a note should RAISE';

  -- po_sent required items are still undone; force with a note must bypass the gate
  v_result := public.advance_concierge_order(v_order, 'freight_booked', 'ttest:kody', true, 'expedited — skip acks');
  ASSERT (v_result ->> 'to_stage') = 'freight_booked', 'FAIL (4): force-advance to_stage, got ' || v_result;
  RAISE NOTICE 'Case (4) passed: force needs a note; force-with-note bypassed the gate.';

  -- ── (5) full walk to reconciled; terminal + non-adjacent RAISE ──────────
  PERFORM public.advance_concierge_order(v_order, 'in_transit', 'ttest:kody', true, 'walk');
  PERFORM public.advance_concierge_order(v_order, 'delivered',  'ttest:kody', true, 'walk');
  PERFORM public.advance_concierge_order(v_order, 'reconciled', 'ttest:kody', true, 'walk');
  SELECT stage INTO v_stage FROM public.concierge_orders WHERE id = v_order;
  ASSERT v_stage = 'reconciled', 'FAIL (5): should have reached reconciled, got ' || v_stage;

  v_raised := false;
  BEGIN
    PERFORM public.advance_concierge_order(v_order, 'cancelled', 'ttest:kody', true, 'noop');
  EXCEPTION WHEN OTHERS THEN v_raised := true;
    ASSERT SQLERRM LIKE '%terminal%', 'FAIL (5): terminal error text, got ' || SQLERRM;
  END;
  ASSERT v_raised, 'FAIL (5): advancing a reconciled (terminal) order should RAISE';

  -- non-adjacent forward jump on a fresh order
  INSERT INTO public.concierge_orders (title) VALUES ('ttest: Jump Order') RETURNING id INTO v_order2;
  v_raised := false;
  BEGIN
    PERFORM public.advance_concierge_order(v_order2, 'delivered', 'ttest:kody', true, 'jump');
  EXCEPTION WHEN OTHERS THEN v_raised := true;
    ASSERT SQLERRM LIKE '%not a forward step%', 'FAIL (5): forward-step error text, got ' || SQLERRM;
  END;
  ASSERT v_raised, 'FAIL (5): a non-adjacent forward jump should RAISE';
  RAISE NOTICE 'Case (5) passed: full walk to reconciled; terminal + non-adjacent jumps RAISE.';

  -- ── (6) cancel from mid-stage ───────────────────────────────────────────
  v_result := public.advance_concierge_order(v_order2, 'cancelled', 'ttest:kody', false, 'client backed out');
  ASSERT (v_result ->> 'to_stage') = 'cancelled', 'FAIL (6): cancel to_stage, got ' || v_result;
  SELECT stage INTO v_stage FROM public.concierge_orders WHERE id = v_order2;
  ASSERT v_stage = 'cancelled', 'FAIL (6): stage should be cancelled, got ' || v_stage;
  SELECT count(*) INTO v_cnt FROM public.pipeline_stage_events
   WHERE entity_type = 'concierge_order' AND entity_id = v_order2 AND to_stage = 'cancelled';
  ASSERT v_cnt = 1, 'FAIL (6): expected 1 cancel event, got ' || v_cnt;
  RAISE NOTICE 'Case (6) passed: cancel from mid-stage wrote the event.';

  -- ── (7) payment mismatch: paid sum < PO total -> flag + exactly ONE task ─
  INSERT INTO public.purchase_orders (designer_id, project_id, vendor_id, payment_pattern, total_cents, status)
  VALUES (v_user, v_project, v_vendor, 'full_upfront', 100000, 'delivered')
  RETURNING id INTO v_po;
  INSERT INTO public.po_payments (purchase_order_id, kind, amount_cents, state, paid_date)
  VALUES (v_po, 'deposit', 60000, 'paid', current_date);   -- 60k paid of 100k

  INSERT INTO public.concierge_orders (title, purchase_order_id, vendor_id, stage)
  VALUES ('ttest: Mismatch Order', v_po, v_vendor, 'delivered')
  RETURNING id INTO v_order;

  PERFORM public.check_concierge_payment_discrepancies();

  SELECT payment_flag INTO v_flag FROM public.concierge_orders WHERE id = v_order;
  ASSERT v_flag = 'mismatch', 'FAIL (7): payment_flag should be mismatch, got ' || v_flag;

  SELECT count(*) INTO v_cnt FROM public.agent_tasks
   WHERE task_type = 'payment_discrepancy' AND entity_id = v_order;
  ASSERT v_cnt = 1, 'FAIL (7): expected exactly 1 payment_discrepancy task, got ' || v_cnt;

  -- payload must NOT carry event_type (so the processor passthrough handles it)
  SELECT count(*) INTO v_cnt FROM public.agent_tasks
   WHERE task_type = 'payment_discrepancy' AND entity_id = v_order
     AND (payload ? 'event_type') = false AND (payload -> 'checks') IS NOT NULL;
  ASSERT v_cnt = 1, 'FAIL (7): task payload should have checks and no event_type';

  -- idempotency: second run keeps it at exactly one
  PERFORM public.check_concierge_payment_discrepancies();
  SELECT count(*) INTO v_cnt FROM public.agent_tasks
   WHERE task_type = 'payment_discrepancy' AND entity_id = v_order;
  ASSERT v_cnt = 1, 'FAIL (7): after a second run still exactly 1 task, got ' || v_cnt;

  -- order should carry the task id in linked_task_ids
  SELECT array_length(linked_task_ids, 1) INTO v_cnt FROM public.concierge_orders WHERE id = v_order;
  ASSERT v_cnt = 1, 'FAIL (7): linked_task_ids should carry the one task, got ' || coalesce(v_cnt, -1);
  RAISE NOTICE 'Case (7) passed: mismatch flagged, exactly-once task, idempotent, linked.';

  -- ── (8) matching order -> ok, no task ───────────────────────────────────
  INSERT INTO public.purchase_orders (designer_id, project_id, vendor_id, payment_pattern, total_cents, status)
  VALUES (v_user, v_project, v_vendor, 'full_upfront', 80000, 'delivered')
  RETURNING id INTO v_po;
  INSERT INTO public.po_payments (purchase_order_id, kind, amount_cents, state, paid_date)
  VALUES (v_po, 'balance', 80000, 'paid', current_date);   -- 80k paid of 80k

  INSERT INTO public.concierge_orders (title, purchase_order_id, vendor_id, stage)
  VALUES ('ttest: Matching Order', v_po, v_vendor, 'delivered')
  RETURNING id INTO v_order2;

  PERFORM public.check_concierge_payment_discrepancies();
  SELECT payment_flag INTO v_flag FROM public.concierge_orders WHERE id = v_order2;
  ASSERT v_flag = 'ok', 'FAIL (8): payment_flag should be ok, got ' || v_flag;
  SELECT count(*) INTO v_cnt FROM public.agent_tasks
   WHERE task_type = 'payment_discrepancy' AND entity_id = v_order2;
  ASSERT v_cnt = 0, 'FAIL (8): matching order should enqueue no task, got ' || v_cnt;
  RAISE NOTICE 'Case (8) passed: matching order -> ok, no task.';

  -- ── (9) damage subflow: seed checklist + deadline; <7d -> one escalation ─
  INSERT INTO public.concierge_orders (title, vendor_id, stage)
  VALUES ('ttest: Damage Order', v_vendor, 'delivered')
  RETURNING id INTO v_order;

  v_damage := public.enter_concierge_damage_mode(v_order, 'ttest:kody');
  ASSERT jsonb_array_length(v_damage -> 'photo_checklist') = 7,
    'FAIL (9): photo_checklist should seed 7 items, got ' || jsonb_array_length(v_damage -> 'photo_checklist');
  ASSERT (v_damage ->> 'carrier_deadline') IS NOT NULL, 'FAIL (9): carrier_deadline should be set';
  ASSERT (v_damage ->> 'state') = 'open', 'FAIL (9): damage state should be open';

  -- re-enter with a deadline <7 days out, then run the escalation scan
  PERFORM public.enter_concierge_damage_mode(v_order, 'ttest:kody', (current_date + 3)::date);
  PERFORM public.check_concierge_payment_discrepancies();

  SELECT count(*) INTO v_cnt FROM public.agent_tasks
   WHERE task_type = 'damage_claim_escalation' AND entity_id = v_order;
  ASSERT v_cnt = 1, 'FAIL (9): expected exactly 1 damage_claim_escalation task, got ' || v_cnt;

  -- second run stays at one (idempotency: dmg:<claim_id>:escalation)
  PERFORM public.check_concierge_payment_discrepancies();
  SELECT count(*) INTO v_cnt FROM public.agent_tasks
   WHERE task_type = 'damage_claim_escalation' AND entity_id = v_order;
  ASSERT v_cnt = 1, 'FAIL (9): damage escalation should stay exactly 1, got ' || v_cnt;
  RAISE NOTICE 'Case (9) passed: damage checklist seeded, deadline countdown, one escalation (idempotent).';

  -- ── (10) single-path invariant: move_pipeline_stage RAISEs for concierge ─
  v_raised := false;
  BEGIN
    PERFORM public.move_pipeline_stage('concierge_order', v_order, 'po_sent', 'ttest:kody', NULL);
  EXCEPTION WHEN OTHERS THEN v_raised := true;
    ASSERT SQLERRM LIKE '%not yet supported%', 'FAIL (10): expected the W2.3 guard text, got ' || SQLERRM;
  END;
  ASSERT v_raised, 'FAIL (10): move_pipeline_stage must still RAISE for concierge_order';
  RAISE NOTICE 'Case (10) passed: move_pipeline_stage still RAISEs for concierge_order (single write path).';

  RAISE NOTICE 'ALL TRANSACTION TRACKER TESTS PASSED.';
END $$;

ROLLBACK;
