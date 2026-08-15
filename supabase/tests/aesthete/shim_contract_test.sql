-- ═══════════════════════════════════════════════════════════════════════════
-- Frozen-contract shim tests (migration 00246) — iOS byte-compatibility
--
-- Exercises design §10.7 (+ §18 grants) against the 00067 contracts:
--   1. Signature freeze: pg_get_function_arguments / pg_get_function_result
--      for BOTH shims equal the 00067 strings exactly (column set, types,
--      order, defaults).
--   2. process_style_quiz (authed): returns EXACTLY the legacy 14-key
--      response with legacy types/vocabularies (0..1 signals, dollar
--      budgets, legacy budget labels); still writes quiz_sessions AND
--      upserts user_style_signals (the legacy side-effects).
--   3. get_recommendations (authed, no engine profile): bridges legacy
--      user_style_signals → a source='derived' client_style_profiles row,
--      returns rows with 0–100 int scores and the full column set non-null
--      where 00067 guaranteed it.
--   4. get_recommendations (anon): still granted + serving (shared neutral
--      profile at the fixed session key, get-or-created).
--   5. match_events attribution: shim calls log source='ios'.
--
-- Uses the seeded dev accounts + the 00244 demo seed (invoked here inside
-- the transaction; rolled back).
--
-- How to run:
--   scripts/run-supabase-sql-test.sh supabase/tests/aesthete/shim_contract_test.sql
--
-- Single transaction; ROLLBACK at the end.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─── helpers ───────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION pg_temp.assume_user(p_user_id UUID)
RETURNS VOID AS $$
BEGIN
  PERFORM set_config('role', 'authenticated', true);
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', p_user_id::text, 'role', 'authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
END;
$$ LANGUAGE plpgsql;

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

GRANT EXECUTE ON FUNCTION pg_temp.reset_role() TO anon, authenticated;

-- Demo catalog (spectrums/DNA) so the shims have matchable products.
SELECT public.aesthete_dev_demo_seed();

-- ─── assertions ─────────────────────────────────────────────────────────────

DO $$
DECLARE
  u_client uuid := 'a0000000-0000-0000-0000-000000000005';  -- client@patina.dev
  combo jsonb := '{"visual_resonance": "warm_minimal", "lifestyle": ["family"], "material": "weathered_oak", "investment": "heirloom", "catalyst": "new_home"}';
  v_json jsonb;
  v_count int;
  v_row record;
  v_key text;
  v_expected_keys text[] := ARRAY[
    'primary_style', 'primary_material', 'palette_warmth', 'budget_label',
    'budget_min', 'budget_max', 'confidence', 'warmth', 'openness', 'texture',
    'natural_light', 'formality', 'color_temperature', 'space_density'];
  v_neutral uuid := 'ae460000-0000-4000-8000-00000000e057';
BEGIN
  -- ── 1. the FROZEN signatures (00067, byte-for-byte) ──
  ASSERT pg_get_function_arguments('process_style_quiz(jsonb,jsonb)'::regprocedure)
       = 'quiz_answers jsonb, timings jsonb DEFAULT ''{}''::jsonb',
    'process_style_quiz arguments drifted from 00067';
  ASSERT pg_get_function_result('process_style_quiz(jsonb,jsonb)'::regprocedure) = 'jsonb',
    'process_style_quiz must return jsonb';
  ASSERT pg_get_function_arguments('get_recommendations(uuid,text,int,int)'::regprocedure)
       = 'p_room_id uuid DEFAULT NULL::uuid, p_category text DEFAULT NULL::text, p_limit integer DEFAULT 20, p_offset integer DEFAULT 0',
    'get_recommendations arguments drifted from 00067';
  ASSERT pg_get_function_result('get_recommendations(uuid,text,int,int)'::regprocedure)
       = 'TABLE(id text, name text, price_cents integer, match_score integer, maker_name text, maker_location text, maker_story text, image_url text, usdz_url text, style_tags text[], material_tags text[], badges text[], category text, tier text)',
    'get_recommendations RETURNS TABLE drifted from 00067';

  -- grants frozen: authenticated on both; anon additionally on get_recommendations
  ASSERT has_function_privilege('authenticated', 'process_style_quiz(jsonb,jsonb)', 'EXECUTE'),
    'process_style_quiz must stay granted to authenticated';
  ASSERT has_function_privilege('anon', 'get_recommendations(uuid,text,int,int)', 'EXECUTE'),
    'get_recommendations must stay granted to anon';
  ASSERT has_function_privilege('authenticated', 'get_recommendations(uuid,text,int,int)', 'EXECUTE'),
    'get_recommendations must stay granted to authenticated';

  -- ── 2. process_style_quiz: legacy shape + side-effects ──
  PERFORM pg_temp.assume_user(u_client);
  v_json := process_style_quiz(combo, '{"q1_ms": 4200}'::jsonb);

  FOREACH v_key IN ARRAY v_expected_keys LOOP
    ASSERT v_json ? v_key, 'legacy response key missing: ' || v_key;
  END LOOP;
  ASSERT jsonb_typeof(v_json->'warmth') = 'number'
     AND (v_json->>'warmth')::real BETWEEN 0 AND 1,
    'legacy warmth must be a 0..1 number';
  ASSERT jsonb_typeof(v_json->'openness') = 'number'
     AND (v_json->>'openness')::real BETWEEN 0 AND 1, 'legacy openness must be 0..1';
  ASSERT jsonb_typeof(v_json->'texture') = 'number'
     AND (v_json->>'texture')::real BETWEEN 0 AND 1, 'legacy texture must be 0..1';
  ASSERT jsonb_typeof(v_json->'natural_light') = 'number'
     AND (v_json->>'natural_light')::real BETWEEN 0 AND 1, 'legacy natural_light must be 0..1';
  ASSERT (v_json->>'budget_label') = '$5K+', 'heirloom must keep the legacy $5K+ label';
  ASSERT (v_json->>'budget_min')::int = 5000 AND (v_json->>'budget_max')::int = 15000,
    'legacy budgets are DOLLARS (5000/15000 for heirloom)';
  ASSERT (v_json->>'formality') IN ('structured', 'relaxed', 'balanced'), 'legacy formality vocab';
  ASSERT (v_json->>'color_temperature') IN ('warm', 'cool', 'neutral'), 'legacy color_temperature vocab';
  ASSERT (v_json->>'space_density') IN ('light', 'balanced', 'curated'), 'legacy space_density vocab';
  ASSERT (v_json->>'color_temperature') = 'warm', 'warm_minimal + oak must read warm';
  ASSERT (v_json->>'space_density') = 'curated', 'heirloom must keep the legacy curated density';
  ASSERT (v_json->>'primary_style') IS NOT NULL AND length(v_json->>'primary_style') > 0,
    'primary_style must be populated (archetype name or Style Explorer)';

  PERFORM pg_temp.reset_role();
  SELECT count(*) INTO v_count FROM quiz_sessions q
   WHERE q.user_id = u_client AND q.responses->'answers' = combo;
  ASSERT v_count >= 1, 'process_style_quiz must still write quiz_sessions';

  SELECT uss.warmth_preference, uss.formality_level, uss.space_density INTO v_row
    FROM user_style_signals uss WHERE uss.user_id = u_client;
  ASSERT FOUND, 'process_style_quiz must still upsert user_style_signals';
  ASSERT v_row.warmth_preference BETWEEN 0.6 AND 1.0,
    'bridged warmth_preference should read warm (got ' || v_row.warmth_preference || ')';
  ASSERT v_row.space_density = 'curated', 'user_style_signals keeps legacy investment density';

  -- ── 3. get_recommendations (authed): signals-bridge + 0–100 scores ──
  -- The bridge premise is "no CURRENT engine profile for this user"
  -- (process_style_quiz does not create one). A demo-seeded DB gives
  -- client@patina.dev a claimed quiz profile, so the premise is pinned
  -- INSIDE the transaction (rolled back): retire any current profiles —
  -- the shim must then bridge user_style_signals to 'derived'.
  UPDATE client_style_profiles SET is_current = false WHERE user_id = u_client;
  PERFORM pg_temp.assume_user(u_client);
  SELECT count(*) INTO v_count FROM get_recommendations(p_limit := 8);
  ASSERT v_count > 0, 'get_recommendations must return rows for the bridged profile';

  FOR v_row IN SELECT * FROM get_recommendations(p_limit := 8) LOOP
    ASSERT v_row.match_score BETWEEN 0 AND 100, 'match_score must be 0–100, got ' || v_row.match_score;
    ASSERT v_row.id IS NOT NULL AND v_row.name IS NOT NULL, 'id/name must be non-null';
    ASSERT v_row.maker_name IS NOT NULL, 'maker_name falls back to Unknown Maker';
    ASSERT v_row.category IS NOT NULL, 'category falls back to decor';
    ASSERT v_row.tier IN ('designer_selection', 'style_match', 'new_arrival'), 'legacy tier vocab';
    ASSERT v_row.style_tags IS NOT NULL AND v_row.material_tags IS NOT NULL AND v_row.badges IS NOT NULL,
      'array columns must be non-null (00067 COALESCE behavior)';
  END LOOP;

  PERFORM pg_temp.reset_role();
  SELECT count(*) INTO v_count FROM client_style_profiles csp
   WHERE csp.user_id = u_client AND csp.source = 'derived' AND csp.is_current;
  ASSERT v_count = 1, 'the shim must have bridged user_style_signals into ONE derived profile';

  -- ── 4. get_recommendations (anon): neutral shared profile ──
  PERFORM pg_temp.assume_anon();
  SELECT count(*) INTO v_count FROM get_recommendations(p_limit := 5);
  ASSERT v_count > 0, 'anon get_recommendations must serve via the neutral profile';
  PERFORM pg_temp.reset_role();
  ASSERT EXISTS (SELECT 1 FROM client_style_profiles csp
                  WHERE csp.session_key = v_neutral AND csp.is_current),
    'the fixed neutral profile must exist after an anon call';

  -- ── 5. match_events attribution ──
  ASSERT EXISTS (SELECT 1 FROM match_events me WHERE me.source = 'ios'),
    'shim calls must log match_events with source=ios';

  RAISE NOTICE 'shim_contract_test: ALL ASSERTIONS PASSED';
END $$;

ROLLBACK;
