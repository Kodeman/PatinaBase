-- ═══════════════════════════════════════════════════════════════════════════
-- Drift-audit + jobs-janitor tests (migration 00250) — §13 checks, stale-
-- running requeue, ask-embed cache purge, claimed_at stamping
--
-- Exercises design §12.2 (janitor row) + §12.3 (cache TTL) + §13 (guardrails):
--   1. claim_aesthete_jobs stamps claimed_at (the 00241 gap).
--   2. aesthete_jobs_janitor: fresh running jobs untouched; stale running
--      (> 15 min past claim) → attempts+1, pending, 1 min backoff; stale
--      running with attempts ≥ 5 → parked terminal 'failed'; expired
--      ask_embed_cache rows purged, live ones kept.
--   3. run_aesthete_drift_audit — each §13 check both ways, on a
--      fixture-only substrate (windowed match_events are cleared inside the
--      transaction so the suite is exact on ANY baseline — bare reset or
--      demo-seeded; everything rolls back):
--        house_capture:     pre-consensus trivial pass · < 3 designers
--                           trivial pass · ≥ 3 with max ≤ 0.35 pass ·
--                           ≥ 3 with max > 0.35 FAIL.
--        budget_dignity:    lower tier served ≥ higher-tier craftsmanship −
--                           0.15 pass · systematic degradation FAIL ·
--                           thin tiers (< 10 items) excluded.
--        exploration_floor: floor met pass · under-served FAIL · all-
--                           candidates-served events exempt (pool headroom).
--        why_coverage:      every result carries ≥ 1 term pass · a termless
--                           result FAIL · engine_ask rows excluded.
--   4. Upsert keying: re-running the audit for the same week updates in
--      place (no duplicate (week, check_name) rows).
--   5. Grants: anon/authenticated cannot EXECUTE the janitor or the audit.
--
-- How to run:
--   scripts/run-supabase-sql-test.sh supabase/tests/aesthete/drift_audit_test.sql
--
-- Single transaction, ROLLBACK at the end — safe on a live/seeded DB.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─── helpers ───────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION pg_temp.assume_anon()
RETURNS VOID AS $$
BEGIN
  PERFORM set_config('request.jwt.claims', '{}', true);
  EXECUTE 'SET LOCAL ROLE anon';
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION pg_temp.reset_role()
RETURNS VOID AS $$
BEGIN
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claims', NULL, true);
END;
$$ LANGUAGE plpgsql;

-- Rebuild the audit substrate deterministically INSIDE the transaction:
-- the audit RPC is global by design (it reads a whole trailing window), so
-- the suite clears windowed rows and owns exactly what the checks see.
DELETE FROM match_events;
DELETE FROM aesthete_audit;

-- Fixture products with known craftsmanship tiers (product_dna 1:1).
INSERT INTO products (id, name, source_url, captured_by, captured_at, layer, patina_managed, status)
VALUES
  ('ae4c0000-0000-4000-8000-000000000001', 'Audit low-craft stool',  'http://test.invalid/audit1', 'a0000000-0000-0000-0000-000000000004', NOW(), 'catalog', TRUE, 'published'),
  ('ae4c0000-0000-4000-8000-000000000002', 'Audit high-craft chair', 'http://test.invalid/audit2', 'a0000000-0000-0000-0000-000000000004', NOW(), 'catalog', TRUE, 'published');

-- (fresh fixture products — no pre-existing DNA rows possible)
INSERT INTO product_dna (product_id, craftsmanship_tier)
VALUES
  ('ae4c0000-0000-4000-8000-000000000001', 0.20),
  ('ae4c0000-0000-4000-8000-000000000002', 0.90);

-- Two quiz profiles in different budget tiers (session_key is the join key).
INSERT INTO client_style_profiles (id, session_key, source, budget, spectrum_confidence, confidence, is_current, version)
VALUES
  ('ae4c0000-0000-4000-8000-00000000c001', 'ae4c0000-0000-4000-8000-00000000a001', 'quiz',
   '{"label": "Starter", "min_cents": 50000, "max_cents": 200000}', '{}', 0.5, true, 1),
  ('ae4c0000-0000-4000-8000-00000000c002', 'ae4c0000-0000-4000-8000-00000000a002', 'quiz',
   '{"label": "Heirloom", "min_cents": 500000, "max_cents": 1500000}', '{}', 0.5, true, 1);

-- ─── assertions ────────────────────────────────────────────────────────────

DO $$
DECLARE
  p_low  uuid := 'ae4c0000-0000-4000-8000-000000000001';
  p_high uuid := 'ae4c0000-0000-4000-8000-000000000002';
  sk_starter  uuid := 'ae4c0000-0000-4000-8000-00000000a001';
  sk_heirloom uuid := 'ae4c0000-0000-4000-8000-00000000a002';
  v_now timestamptz := now();
  v_week date := date_trunc('week', now())::date;
  v_job_fresh bigint;
  v_job_stale bigint;
  v_job_spent bigint;
  v_json jsonb;
  v_count int;
  v_row record;
  v_detail jsonb;
  v_prev_cf jsonb;

  -- results payloads (00244 shape: [{product_id, score, terms, is_exploration}])
  r_low_ok  jsonb;
  r_high_ok jsonb;
  r_termless jsonb;
BEGIN
  r_low_ok := jsonb_build_array(
    jsonb_build_object('product_id', p_low,  'score', 0.8, 'terms', jsonb_build_object('spectrum', 0.4), 'is_exploration', false),
    jsonb_build_object('product_id', p_low,  'score', 0.7, 'terms', jsonb_build_object('budget', 0.3),   'is_exploration', true));
  r_high_ok := jsonb_build_array(
    jsonb_build_object('product_id', p_high, 'score', 0.8, 'terms', jsonb_build_object('spectrum', 0.4), 'is_exploration', false),
    jsonb_build_object('product_id', p_high, 'score', 0.7, 'terms', jsonb_build_object('budget', 0.3),   'is_exploration', true));
  r_termless := jsonb_build_array(
    jsonb_build_object('product_id', p_high, 'score', 0.8, 'terms', '{}'::jsonb, 'is_exploration', false),
    jsonb_build_object('product_id', p_low,  'score', 0.7, 'terms', jsonb_build_object('budget', 0.3), 'is_exploration', true));

  -- ══ 1. claim stamps claimed_at ══
  INSERT INTO aesthete_jobs (kind, dedupe_key) VALUES ('centroid', 'ae4c:jan:fresh')
  RETURNING id INTO v_job_fresh;
  PERFORM claim_aesthete_jobs('centroid', 5);
  SELECT * INTO v_row FROM aesthete_jobs WHERE id = v_job_fresh;
  ASSERT v_row.status = 'running' AND v_row.claimed_at IS NOT NULL,
    'FAIL 1: claim must flip to running and stamp claimed_at, got ' || v_row.status || '/' || COALESCE(v_row.claimed_at::text, 'NULL');

  -- ══ 2. janitor semantics ══
  -- A stale running job (claimed 20 min ago, attempts 1) and a spent one
  -- (attempts 5). The fresh one from case 1 must be untouched.
  INSERT INTO aesthete_jobs (kind, dedupe_key, status, attempts, claimed_at)
  VALUES ('centroid', 'ae4c:jan:stale', 'running', 1, now() - interval '20 minutes')
  RETURNING id INTO v_job_stale;
  INSERT INTO aesthete_jobs (kind, dedupe_key, status, attempts, claimed_at)
  VALUES ('centroid', 'ae4c:jan:spent', 'running', 5, now() - interval '20 minutes')
  RETURNING id INTO v_job_spent;

  -- Cache rows: one expired, one live.
  INSERT INTO ask_embed_cache (cache_key, embedding, model_version, expires_at)
  VALUES ('ae4c-expired', '[0.1,0.2]', 'test-model', now() - interval '1 hour'),
         ('ae4c-live',    '[0.3,0.4]', 'test-model', now() + interval '6 days');

  v_json := aesthete_jobs_janitor();

  ASSERT (v_json->>'requeued')::int = 1,
    'FAIL 2a: exactly the one stale unspent job should requeue, got ' || (v_json->>'requeued');
  ASSERT (v_json->>'parked')::int = 1,
    'FAIL 2b: exactly the one spent stale job should park, got ' || (v_json->>'parked');
  ASSERT (v_json->>'cache_purged')::int = 1,
    'FAIL 2c: exactly the expired cache row should purge, got ' || (v_json->>'cache_purged');

  SELECT * INTO v_row FROM aesthete_jobs WHERE id = v_job_stale;
  ASSERT v_row.status = 'pending' AND v_row.attempts = 2
     AND v_row.run_after > now() AND v_row.run_after <= now() + interval '2 minutes'
     AND v_row.last_error LIKE 'janitor:%',
    'FAIL 2d: stale job should be pending, attempts 2, ~1 min backoff — got '
      || v_row.status || '/' || v_row.attempts || '/' || v_row.run_after;
  SELECT * INTO v_row FROM aesthete_jobs WHERE id = v_job_spent;
  ASSERT v_row.status = 'failed' AND v_row.completed_at IS NOT NULL,
    'FAIL 2e: spent stale job should park terminal failed, got ' || v_row.status;
  SELECT * INTO v_row FROM aesthete_jobs WHERE id = v_job_fresh;
  ASSERT v_row.status = 'running' AND v_row.attempts = 1,
    'FAIL 2f: the freshly-claimed job must be untouched, got ' || v_row.status || '/' || v_row.attempts;
  SELECT count(*) INTO v_count FROM ask_embed_cache WHERE cache_key = 'ae4c-live';
  ASSERT v_count = 1, 'FAIL 2g: the live cache row must survive the purge';

  -- Idempotent: a second run finds nothing new (the requeued job is pending,
  -- the parked one failed).
  v_json := aesthete_jobs_janitor();
  ASSERT (v_json->>'requeued')::int = 0 AND (v_json->>'parked')::int = 0,
    'FAIL 2h: second janitor pass should be a no-op, got ' || v_json::text;

  -- ══ 3. the §13 checks ══
  -- Substrate: 2 events per budget tier serving that tier's product twice
  -- (n ≥ 10 per tier via 6 events × 2 rows... use 5 events × 2 = 10 rows).
  INSERT INTO match_events (session_key, source, context, results, created_at)
  SELECT sk_starter, 'quiz',
         jsonb_build_object('limit', 10, 'candidates', 40, 'explore_ratio', 0.2),
         r_low_ok, now() - interval '1 day'
    FROM generate_series(1, 5);
  INSERT INTO match_events (session_key, source, context, results, created_at)
  SELECT sk_heirloom, 'quiz',
         jsonb_build_object('limit', 10, 'candidates', 40, 'explore_ratio', 0.2),
         r_high_ok, now() - interval '1 day'
    FROM generate_series(1, 5);

  -- 3a. Baseline: house pre-consensus trivial pass; budget FAIL (Starter mean
  -- 0.20 < Heirloom 0.90 − 0.15 — systematic degradation); exploration pass
  -- (each event: floor = LEAST(GREATEST(1, floor(.2·2)), 1, headroom) = 1,
  -- served 1); why pass. The active house is pinned to the pre-consensus
  -- shape inside the transaction so the case is exact on ANY baseline.
  SELECT h.computed_from INTO v_prev_cf FROM house_taste h WHERE h.status = 'active';
  UPDATE house_taste SET computed_from = '{"seed": "provisional"}'::jsonb WHERE status = 'active';

  ASSERT (SELECT r.passed FROM run_aesthete_drift_audit() r WHERE r.check_name = 'house_capture'),
    'FAIL 3a1: pre-consensus active house must trivially pass house_capture';

  ASSERT NOT (SELECT r.passed FROM run_aesthete_drift_audit() r WHERE r.check_name = 'budget_dignity'),
    'FAIL 3a2: Starter mean 0.20 vs Heirloom 0.90 must FAIL budget_dignity';

  ASSERT (SELECT r.passed FROM run_aesthete_drift_audit() r WHERE r.check_name = 'exploration_floor'),
    'FAIL 3a3: one explore slot per 2-row event meets the floor';

  ASSERT (SELECT r.passed FROM run_aesthete_drift_audit() r WHERE r.check_name = 'why_coverage'),
    'FAIL 3a4: every fixture result carries a term — why_coverage must pass';

  -- 3b. Budget dignity passes once low tiers get comparable craftsmanship:
  -- give the Starter tier high-craft servings too (mean rises to 0.55 ≥
  -- 0.90 − 0.15 boundary... use 6 more high-craft rows → mean (10·0.2 +
  -- 12·0.9)/22 ≈ 0.58 < 0.75. Serve enough: replace with high-only rows).
  DELETE FROM match_events WHERE session_key = sk_starter;
  INSERT INTO match_events (session_key, source, context, results, created_at)
  SELECT sk_starter, 'quiz',
         jsonb_build_object('limit', 10, 'candidates', 40, 'explore_ratio', 0.2),
         r_high_ok, now() - interval '1 day'
    FROM generate_series(1, 5);
  SELECT CASE WHEN r.passed THEN 1 ELSE 0 END INTO v_count
    FROM run_aesthete_drift_audit() r WHERE r.check_name = 'budget_dignity';
  ASSERT v_count = 1,
    'FAIL 3b1: equal craftsmanship across tiers must PASS budget_dignity';

  -- 3c. Thin tiers are excluded: shrink Starter below 10 items → trivial pass.
  DELETE FROM match_events WHERE session_key = sk_starter;
  INSERT INTO match_events (session_key, source, context, results, created_at)
  VALUES (sk_starter, 'quiz',
          jsonb_build_object('limit', 10, 'candidates', 40, 'explore_ratio', 0.2),
          r_low_ok, now() - interval '1 day');
  SELECT r.detail INTO v_detail
    FROM run_aesthete_drift_audit() r WHERE r.check_name = 'budget_dignity';
  ASSERT (v_detail->>'trivial')::boolean,
    'FAIL 3c1: a tier with < 10 served items must not be compared (trivial), detail: ' || v_detail::text;

  -- 3d. Exploration under-serving FAILS — 10-row events with zero explore
  -- slots and plenty of candidate headroom.
  DELETE FROM match_events;
  INSERT INTO match_events (session_key, source, context, results, created_at)
  SELECT sk_heirloom, 'quiz',
         jsonb_build_object('limit', 10, 'candidates', 40, 'explore_ratio', 0.2),
         (SELECT jsonb_agg(jsonb_build_object(
            'product_id', p_high, 'score', 0.8,
            'terms', jsonb_build_object('spectrum', 0.4), 'is_exploration', false))
            FROM generate_series(1, 10)),
         now() - interval '1 day'
    FROM generate_series(1, 3);
  SELECT CASE WHEN r.passed THEN 1 ELSE 0 END INTO v_count
    FROM run_aesthete_drift_audit() r WHERE r.check_name = 'exploration_floor';
  ASSERT v_count = 0,
    'FAIL 3d1: zero explore slots on 10-row events with headroom must FAIL';

  -- 3e. …but all-candidates-served events are exempt (no pool to stretch into).
  DELETE FROM match_events;
  INSERT INTO match_events (session_key, source, context, results, created_at)
  VALUES (sk_heirloom, 'quiz',
          jsonb_build_object('limit', 10, 'candidates', 2, 'explore_ratio', 0.2),
          (SELECT jsonb_agg(jsonb_build_object(
             'product_id', p_high, 'score', 0.8,
             'terms', jsonb_build_object('spectrum', 0.4), 'is_exploration', false))
             FROM generate_series(1, 2)),
          now() - interval '1 day');
  SELECT CASE WHEN r.passed THEN 1 ELSE 0 END INTO v_count
    FROM run_aesthete_drift_audit() r WHERE r.check_name = 'exploration_floor';
  ASSERT v_count = 1,
    'FAIL 3e1: an event that served its whole candidate pool is floor-exempt';

  -- 3f. why_coverage FAILS on a termless result; engine_ask rows excluded.
  DELETE FROM match_events;
  INSERT INTO match_events (session_key, source, context, results, created_at)
  VALUES (sk_heirloom, 'quiz', '{"limit": 10, "candidates": 40}', r_termless,
          now() - interval '1 day');
  INSERT INTO match_events (user_id, source, context, results, created_at)
  VALUES (NULL, 'engine_ask', '{"result_count": 1}',
          jsonb_build_array(jsonb_build_object('product_id', p_high, 'score', 0.01, 'matched_on', jsonb_build_array('fts'))),
          now() - interval '1 day');
  SELECT r.detail INTO v_detail
    FROM run_aesthete_drift_audit() r WHERE r.check_name = 'why_coverage';
  ASSERT NOT (SELECT r.passed FROM run_aesthete_drift_audit() r WHERE r.check_name = 'why_coverage'),
    'FAIL 3f1: a termless result must FAIL why_coverage';
  ASSERT (v_detail->>'violations')::int = 1,
    'FAIL 3f2: exactly the one termless result should violate, got ' || (v_detail->>'violations');
  ASSERT (v_detail->>'engine_ask_rows_excluded')::int = 1,
    'FAIL 3f3: the engine_ask row must be excluded (matched_on ≠ terms), got ' || (v_detail->>'engine_ask_rows_excluded');

  -- 3g. house_capture both ways on a consensus-shaped computed_from.
  UPDATE house_taste SET computed_from = jsonb_build_object(
    'a0000000-0000-0000-0000-000000000001', jsonb_build_object('weight', 0.40),
    'a0000000-0000-0000-0000-000000000003', jsonb_build_object('weight', 0.35),
    'a0000000-0000-0000-0000-000000000004', jsonb_build_object('weight', 0.25))
   WHERE status = 'active';
  ASSERT NOT (SELECT r.passed FROM run_aesthete_drift_audit() r WHERE r.check_name = 'house_capture'),
    'FAIL 3g1: max share 0.40 over 3 designers must FAIL house_capture';

  UPDATE house_taste SET computed_from = jsonb_build_object(
    'a0000000-0000-0000-0000-000000000001', jsonb_build_object('weight', 0.35),
    'a0000000-0000-0000-0000-000000000003', jsonb_build_object('weight', 0.35),
    'a0000000-0000-0000-0000-000000000004', jsonb_build_object('weight', 0.30))
   WHERE status = 'active';
  ASSERT (SELECT r.passed FROM run_aesthete_drift_audit() r WHERE r.check_name = 'house_capture'),
    'FAIL 3g2: max share 0.35 must PASS (≤ cap)';

  -- Two designers over cap: infeasible-below-3 → trivial pass (00242 skips
  -- the cap there by design).
  UPDATE house_taste SET computed_from = jsonb_build_object(
    'a0000000-0000-0000-0000-000000000001', jsonb_build_object('weight', 0.60),
    'a0000000-0000-0000-0000-000000000003', jsonb_build_object('weight', 0.40))
   WHERE status = 'active';
  SELECT r.detail INTO v_detail
    FROM run_aesthete_drift_audit() r WHERE r.check_name = 'house_capture';
  ASSERT (SELECT r.passed FROM run_aesthete_drift_audit() r WHERE r.check_name = 'house_capture')
     AND (v_detail->>'trivial')::boolean,
    'FAIL 3g3: 2-designer consensus must trivially pass (cap infeasible < 3), detail: ' || v_detail::text;

  -- restore (belt and braces — the ROLLBACK undoes it anyway)
  UPDATE house_taste SET computed_from = v_prev_cf WHERE status = 'active';

  -- ══ 4. upsert keying: one row per (week, check) no matter how many runs ══
  SELECT count(*) INTO v_count FROM aesthete_audit WHERE week = v_week;
  ASSERT v_count = 4,
    'FAIL 4: repeated runs must upsert in place — expected 4 rows for the week, got ' || v_count;

  -- ══ 5. grants ══
  PERFORM pg_temp.assume_anon();
  BEGIN
    PERFORM aesthete_jobs_janitor();
    RAISE EXCEPTION 'FAIL 5a: anon executing aesthete_jobs_janitor should be permission-denied';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM count(*) FROM run_aesthete_drift_audit();
    RAISE EXCEPTION 'FAIL 5b: anon executing run_aesthete_drift_audit should be permission-denied';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM count(*) FROM ask_embed_cache;
    RAISE EXCEPTION 'FAIL 5c: anon reading ask_embed_cache should be permission-denied';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  PERFORM pg_temp.reset_role();

  RAISE NOTICE 'All drift-audit + janitor assertions passed.';
END
$$;

-- ROLLBACK so the test is idempotent and leaves the live DB untouched.
ROLLBACK;
