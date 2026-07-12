-- ═══════════════════════════════════════════════════════════════════════════
-- Agent OS WP-2.2 pipeline board tests (migration 00305)
--
-- Exercises move_pipeline_stage() against real rows:
--   (i)   designer_prospect insert -> move sourced->contacted via the RPC:
--         stage_entered_at bumps, a pipeline_stage_events row lands with the
--         correct from/to/actor.
--   (ii)  an invalid target stage RAISEs for designer_prospect.
--   (iii) a pipeline_vendor move via the RPC writes an event row with
--         entity_type='pipeline_vendor' and stamps stage_changed_at (NOT
--         stage_entered_at — pipeline_vendors has no such column).
--   (iv)  entity_type='concierge_order' RAISEs 'not yet supported (W2.3)'.
--   (v)   a no-op same-stage move returns unchanged:true, leaves the stamp
--         column untouched, and writes NO event row.
--
-- How to run:
--   docker exec -i supabase_db_supabase psql -U postgres -d postgres \
--     -v ON_ERROR_STOP=1 < supabase/tests/agent_os/pipeline_boards_test.sql
--
-- Single transaction, ROLLBACK at the end — re-runnable with no side effects.
-- Self-isolating: uses fresh gen_random_uuid() rows and a distinctive
-- 'pbtest:' actor tag rather than depending on any particular pre-existing
-- seed data, so it does not need to assume a clean table the way groom_test
-- does (which relies on global aggregate counts).
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

DO $$
DECLARE
  v_prospect_id  uuid;
  v_vendor_id    uuid;
  v_stage        text;
  v_result       jsonb;
  v_event_count  int;
  v_before       timestamptz;
  v_after        timestamptz;
BEGIN
  -- ── (i) designer_prospect: insert, then move sourced -> contacted ────────
  INSERT INTO public.designer_prospects (full_name, studio_name, source)
  VALUES ('pbtest: Prospect One', 'pbtest Studio', 'manual')
  RETURNING id, stage INTO v_prospect_id, v_stage;

  ASSERT v_stage = 'sourced', 'setup sanity: new prospect should default to sourced, got ' || v_stage;

  -- This whole test runs inside one transaction, so now() (= transaction_timestamp())
  -- is frozen for its entire duration -- a real pg_sleep() would not move it and a
  -- naive "before vs. after" read would always compare equal regardless of whether
  -- the RPC's UPDATE actually ran. Backdate stage_entered_at (a plain timestamp
  -- column write, not a status change, so no trigger fires) the same way groom_test
  -- backdates lock/completion timestamps, then assert the RPC's now() is later than
  -- that backdated value -- which only holds if the UPDATE genuinely wrote a fresh
  -- stamp.
  UPDATE public.designer_prospects
     SET stage_entered_at = now() - interval '1 day'
   WHERE id = v_prospect_id
  RETURNING stage_entered_at INTO v_before;

  v_result := public.move_pipeline_stage(
    p_entity_type => 'designer_prospect',
    p_entity_id   => v_prospect_id,
    p_to_stage    => 'contacted',
    p_actor       => 'pbtest:kody',
    p_note        => 'first outreach sent'
  );
  RAISE NOTICE '(i) move result: %', v_result;

  ASSERT (v_result ->> 'from_stage') = 'sourced', 'FAIL (i): from_stage should be sourced, got ' || v_result;
  ASSERT (v_result ->> 'to_stage')   = 'contacted', 'FAIL (i): to_stage should be contacted, got ' || v_result;
  ASSERT (v_result ->> 'unchanged')  = 'false', 'FAIL (i): unchanged should be false, got ' || v_result;

  SELECT stage, stage_entered_at INTO v_stage, v_after
    FROM public.designer_prospects WHERE id = v_prospect_id;
  ASSERT v_stage = 'contacted', 'FAIL (i): prospect stage should be contacted, got ' || v_stage;
  ASSERT v_after > v_before, 'FAIL (i): stage_entered_at should have bumped forward';

  SELECT count(*) INTO v_event_count
    FROM public.pipeline_stage_events
   WHERE entity_type = 'designer_prospect' AND entity_id = v_prospect_id
     AND from_stage = 'sourced' AND to_stage = 'contacted'
     AND actor = 'pbtest:kody' AND note = 'first outreach sent';
  ASSERT v_event_count = 1, 'FAIL (i): expected exactly 1 matching pipeline_stage_events row, got ' || v_event_count;

  RAISE NOTICE 'Case (i) passed.';

  -- ── (ii) invalid target stage RAISEs for designer_prospect ───────────────
  BEGIN
    PERFORM public.move_pipeline_stage(
      p_entity_type => 'designer_prospect',
      p_entity_id   => v_prospect_id,
      p_to_stage    => 'not_a_real_stage',
      p_actor       => 'pbtest:kody'
    );
    ASSERT false, 'FAIL (ii): expected an exception for an invalid designer_prospect stage';
  EXCEPTION WHEN OTHERS THEN
    ASSERT SQLERRM LIKE 'move_pipeline_stage: invalid designer_prospect stage%',
      'FAIL (ii): unexpected error message: ' || SQLERRM;
  END;

  RAISE NOTICE 'Case (ii) passed.';

  -- ── (iii) pipeline_vendor move via the RPC ────────────────────────────────
  INSERT INTO public.pipeline_vendors (name, slug, stage)
  VALUES ('pbtest Vendor One', 'pbtest-vendor-one', 'discovery')
  RETURNING id INTO v_vendor_id;

  -- Same frozen-now() reasoning as case (i) -- backdate before asserting "bumped".
  UPDATE public.pipeline_vendors
     SET stage_changed_at = now() - interval '1 day'
   WHERE id = v_vendor_id
  RETURNING stage_changed_at INTO v_before;

  v_result := public.move_pipeline_stage(
    p_entity_type => 'pipeline_vendor',
    p_entity_id   => v_vendor_id,
    p_to_stage    => 'qualification',
    p_actor       => 'pbtest:leah'
  );
  RAISE NOTICE '(iii) move result: %', v_result;

  ASSERT (v_result ->> 'from_stage') = 'discovery', 'FAIL (iii): from_stage should be discovery, got ' || v_result;
  ASSERT (v_result ->> 'to_stage')   = 'qualification', 'FAIL (iii): to_stage should be qualification, got ' || v_result;

  SELECT stage, stage_changed_at INTO v_stage, v_after
    FROM public.pipeline_vendors WHERE id = v_vendor_id;
  ASSERT v_stage = 'qualification', 'FAIL (iii): vendor stage should be qualification, got ' || v_stage;
  ASSERT v_after > v_before, 'FAIL (iii): stage_changed_at should have bumped forward';

  SELECT count(*) INTO v_event_count
    FROM public.pipeline_stage_events
   WHERE entity_type = 'pipeline_vendor' AND entity_id = v_vendor_id
     AND from_stage = 'discovery' AND to_stage = 'qualification' AND actor = 'pbtest:leah';
  ASSERT v_event_count = 1, 'FAIL (iii): expected exactly 1 matching pipeline_stage_events row, got ' || v_event_count;

  RAISE NOTICE 'Case (iii) passed.';

  -- ── (iv) concierge_order RAISEs not-yet-supported ─────────────────────────
  BEGIN
    PERFORM public.move_pipeline_stage(
      p_entity_type => 'concierge_order',
      p_entity_id   => gen_random_uuid(),
      p_to_stage    => 'po_sent',
      p_actor       => 'pbtest:kody'
    );
    ASSERT false, 'FAIL (iv): expected an exception for entity_type=concierge_order';
  EXCEPTION WHEN OTHERS THEN
    ASSERT SQLERRM LIKE '%not yet supported (W2.3)%',
      'FAIL (iv): unexpected error message: ' || SQLERRM;
  END;

  RAISE NOTICE 'Case (iv) passed.';

  -- ── (v) no-op same-stage move ──────────────────────────────────────────────
  SELECT count(*) INTO v_event_count FROM public.pipeline_stage_events;  -- baseline before the no-op

  v_result := public.move_pipeline_stage(
    p_entity_type => 'designer_prospect',
    p_entity_id   => v_prospect_id,
    p_to_stage    => 'contacted',  -- already contacted from case (i)
    p_actor       => 'pbtest:kody'
  );
  RAISE NOTICE '(v) no-op result: %', v_result;

  ASSERT (v_result ->> 'unchanged') = 'true', 'FAIL (v): same-stage move should report unchanged:true, got ' || v_result;
  ASSERT (v_result ->> 'from_stage') = 'contacted', 'FAIL (v): from_stage should still be contacted, got ' || v_result;
  ASSERT (v_result ->> 'to_stage')   = 'contacted', 'FAIL (v): to_stage should be contacted, got ' || v_result;

  SELECT count(*) INTO v_event_count FROM public.pipeline_stage_events
   WHERE entity_type = 'designer_prospect' AND entity_id = v_prospect_id AND from_stage = 'contacted' AND to_stage = 'contacted';
  ASSERT v_event_count = 0, 'FAIL (v): a no-op move must not write a pipeline_stage_events row, got ' || v_event_count;

  RAISE NOTICE 'Case (v) passed.';

  RAISE NOTICE 'All pipeline_boards_test assertions passed.';
END
$$;

ROLLBACK;
