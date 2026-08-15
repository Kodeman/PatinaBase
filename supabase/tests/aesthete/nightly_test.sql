-- ═══════════════════════════════════════════════════════════════════════════
-- Nightly plumbing tests (migration 00248) — refit payload/apply, online
-- preview, reliability/stats writers, starvation decay, cron registration
--
-- Exercises design §8.2 + §8.3 + §8.4 + §12.2 + §14.4:
--   1. cron 'aesthete-nightly' registered at 02:30 (guarded idiom).
--   2. Grants: the nightly RPCs are service-role-only; preview_taste_update
--      is the single authenticated entry (owner-gated in the body).
--   3. get_taste_refit_designers / get_taste_refit_payload: worklist +
--      payload shape — φ arrays are 94-d (00244's _aesthete_phi is the ONLY
--      φ implementation — ordering parity is by construction), corrections
--      with replacement ride along at weight 2.0, watermark = newest fuel,
--      theta_prior mirrors the active house.
--   4. preview_taste_update (§8.2 online preview): bounded step
--      (‖Δθ‖ ≤ 0.25), sets sources.theta_preview, no version bump / no
--      snapshot; neither/both rows are no-ops; foreign judgments refused.
--   5. apply_taste_refit: θ written verbatim (preview OVERWRITTEN), version++
--      with an append-only snapshot carrying the refit diagnostics, v_D EMA
--      from judgment winners' vectors, watermark advances → the designer
--      leaves the worklist (the "watermark holds" idempotency guard).
--   6. refresh_designer_teaching_stats (§12.2 stats_writer): accuracy =
--      confirm share of others' validations on taught products;
--      match_impact_count counts citing match_events; rerun = same values.
--   7. apply_designer_reliability: recompute-overwrite (rerun = same state);
--      bad levels refused.
--   8. apply_starvation_decay (§8.4): after 90 idle days c_D×0.95 with label
--      re-derivation, deviation shrink exp(−1/12) toward θ_H (zeros when the
--      house has no θ), month-marker gates re-application.
--
-- Seed-robustness: assertions are scoped per-designer / per-fixture (no
-- absolute global counts), so the suite passes on the bare reset baseline
-- AND on a demo-seeded DB (G3 barrier ruling).
--
-- Uses the seeded dev accounts (supabase/seed/dev-accounts.sql):
--   superadmin@patina.dev a0000000-0000-0000-0000-000000000001 (idle-decay fixture)
--   studio@patina.dev     a0000000-0000-0000-0000-000000000003 (refit designer)
--   designer@patina.dev   a0000000-0000-0000-0000-000000000004 (stats fixture)
-- Run after `supabase db reset` so seeds are present.
--
-- How to run:
--   docker exec -i supabase_db_supabase psql -U postgres -d postgres \
--     -v ON_ERROR_STOP=1 < supabase/tests/aesthete/nightly_test.sql
--
-- Single transaction; plpgsql ASSERTs; final ROLLBACK — re-runnable with no
-- side effects. aesthete.probe_rate is pinned to 0 for determinism.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─── fixtures ──────────────────────────────────────────────────────────────

-- Products for judgments; two carry unit basis vectors so the v_D EMA path
-- is real (§4.3), and two carry an archetype so style_group resolves.
INSERT INTO products (id, name, source_url, captured_by, captured_at, layer, patina_managed, status)
VALUES
  ('ae480000-0000-4000-8000-000000000001', 'Nightly test oak bench',   'http://test.invalid/n1', 'a0000000-0000-0000-0000-000000000003', NOW(), 'catalog', TRUE, 'published'),
  ('ae480000-0000-4000-8000-000000000002', 'Nightly test steel bench', 'http://test.invalid/n2', 'a0000000-0000-0000-0000-000000000003', NOW(), 'catalog', TRUE, 'published'),
  ('ae480000-0000-4000-8000-000000000003', 'Nightly test taught lamp', 'http://test.invalid/n3', 'a0000000-0000-0000-0000-000000000004', NOW(), 'catalog', TRUE, 'published');

UPDATE products
   SET aesthete_vector = (SELECT ('[' || string_agg(CASE WHEN i = 1 THEN '1' ELSE '0' END, ',' ORDER BY i) || ']')::vector
                            FROM generate_series(1, 768) i)
 WHERE id = 'ae480000-0000-4000-8000-000000000001';
UPDATE products
   SET aesthete_vector = (SELECT ('[' || string_agg(CASE WHEN i = 2 THEN '1' ELSE '0' END, ',' ORDER BY i) || ']')::vector
                            FROM generate_series(1, 768) i)
 WHERE id = 'ae480000-0000-4000-8000-000000000002';

-- ─── helpers ───────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION pg_temp.assume_user(p_user_id UUID)
RETURNS VOID AS $$
BEGIN
  PERFORM set_config('role', 'authenticated', true);
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', p_user_id::text, 'role', 'authenticated')::text,
    true
  );
  EXECUTE 'SET LOCAL ROLE authenticated';
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION pg_temp.reset_role()
RETURNS VOID AS $$
BEGIN
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claims', NULL, true);
END;
$$ LANGUAGE plpgsql;

GRANT EXECUTE ON FUNCTION pg_temp.reset_role() TO authenticated;

-- ─── assertions ────────────────────────────────────────────────────────────

DO $$
DECLARE
  u_idle     UUID := 'a0000000-0000-0000-0000-000000000001';  -- superadmin (decay fixture)
  u_mgr      UUID := 'a0000000-0000-0000-0000-000000000003';  -- studio (refit designer)
  u_designer UUID := 'a0000000-0000-0000-0000-000000000004';  -- designer (stats fixture)
  p1         UUID := 'ae480000-0000-4000-8000-000000000001';
  p2         UUID := 'ae480000-0000-4000-8000-000000000002';
  p3         UUID := 'ae480000-0000-4000-8000-000000000003';
  v_style    uuid;
  v_style2   uuid;
  v_count    int;
  v_json     jsonb;
  v_payload  jsonb;
  v_item     jsonb;
  v_theta    real[];
  v_theta2   real[];
  v_before   designer_taste_profiles;
  v_after    designer_taste_profiles;
  v_j1       bigint;
  v_j2       bigint;
  v_j3       bigint;
  v_c1       bigint;
  v_wm       timestamptz;
  v_acc1     real;
  v_acc2     real;
  v_imp1     int;
  v_imp2     int;
  v_norm     double precision;
BEGIN
  PERFORM set_config('aesthete.probe_rate', '0', true);

  -- Case 0: preconditions.
  SELECT count(*) INTO v_count FROM auth.users WHERE id IN (u_idle, u_mgr, u_designer);
  ASSERT v_count = 3,
    'FAIL 0: dev accounts seed missing (run supabase db reset), got ' || v_count || ' of 3';
  SELECT id INTO v_style FROM styles WHERE is_archetype ORDER BY display_order NULLS LAST, name LIMIT 1;
  SELECT id INTO v_style2 FROM styles WHERE is_archetype ORDER BY display_order NULLS LAST, name OFFSET 1 LIMIT 1;
  ASSERT v_style IS NOT NULL AND v_style2 IS NOT NULL, 'FAIL 0: archetype styles missing';

  -- Winner products carry a primary archetype so style_group resolves.
  INSERT INTO product_styles (product_id, style_id, confidence, assigned_by)
  VALUES (p1, v_style, 0.9, u_mgr), (p2, v_style2, 0.9, u_mgr)
  ON CONFLICT (product_id, style_id) DO NOTHING;

  -- ── Case 1: the cron is registered at 02:30 ──────────────────────────────
  SELECT count(*) INTO v_count FROM cron.job
   WHERE jobname = 'aesthete-nightly' AND schedule = '30 2 * * *';
  ASSERT v_count = 1, 'FAIL 1: aesthete-nightly cron not registered at 30 2 * * *';

  -- ── Case 2: grants — nightly RPCs are service-role-only ──────────────────
  ASSERT NOT has_function_privilege('authenticated', 'get_taste_refit_designers()', 'EXECUTE'),
    'FAIL 2a: get_taste_refit_designers must not be authenticated-executable';
  ASSERT NOT has_function_privilege('authenticated', 'get_taste_refit_payload(uuid)', 'EXECUTE'),
    'FAIL 2b: get_taste_refit_payload must not be authenticated-executable';
  ASSERT NOT has_function_privilege('authenticated', 'apply_taste_refit(uuid, real[], timestamptz, jsonb)', 'EXECUTE'),
    'FAIL 2c: apply_taste_refit must not be authenticated-executable';
  ASSERT NOT has_function_privilege('authenticated', 'apply_designer_reliability(uuid, real, jsonb, jsonb)', 'EXECUTE'),
    'FAIL 2d: apply_designer_reliability must not be authenticated-executable';
  ASSERT NOT has_function_privilege('authenticated', 'refresh_designer_teaching_stats()', 'EXECUTE'),
    'FAIL 2e: refresh_designer_teaching_stats must not be authenticated-executable';
  ASSERT NOT has_function_privilege('authenticated', 'apply_starvation_decay()', 'EXECUTE'),
    'FAIL 2f: apply_starvation_decay must not be authenticated-executable';
  ASSERT NOT has_function_privilege('anon', 'preview_taste_update(bigint)', 'EXECUTE'),
    'FAIL 2g: preview_taste_update must not be anon-executable';
  ASSERT has_function_privilege('authenticated', 'preview_taste_update(bigint)', 'EXECUTE'),
    'FAIL 2h: preview_taste_update must be authenticated-executable (the §8.2 online preview)';
  ASSERT has_function_privilege('service_role', 'apply_taste_refit(uuid, real[], timestamptz, jsonb)', 'EXECUTE'),
    'FAIL 2i: apply_taste_refit must be service_role-executable';

  -- ── Case 3: fuel as the studio designer ──────────────────────────────────
  PERFORM pg_temp.assume_user(u_mgr);
  SELECT (submit_taste_judgment(jsonb_build_object('a', p1, 'b', p2), 'a')->>'judgment_id')::bigint INTO v_j1;
  SELECT (submit_taste_judgment(jsonb_build_object('a', p1, 'b', p2), 'b')->>'judgment_id')::bigint INTO v_j2;
  SELECT (submit_taste_judgment(jsonb_build_object('a', p2, 'b', p1), 'neither')->>'judgment_id')::bigint INTO v_j3;
  PERFORM submit_taste_correction('match', p2, p1, NULL, '{"warmth": 0.2}'::jsonb, 'nightly suite correction', 'library');
  SELECT id INTO v_c1 FROM taste_corrections
   WHERE designer_id = u_mgr AND free_text = 'nightly suite correction';
  PERFORM pg_temp.reset_role();

  -- ── Case 4: worklist lists the designer with unprocessed fuel ────────────
  SELECT count(*) INTO v_count FROM get_taste_refit_designers() d WHERE d.designer_id = u_mgr;
  ASSERT v_count = 1, 'FAIL 4: studio designer missing from the refit worklist';
  SELECT d.n_unprocessed::int INTO v_count FROM get_taste_refit_designers() d WHERE d.designer_id = u_mgr;
  ASSERT v_count >= 4, 'FAIL 4b: expected >= 4 unprocessed fuel rows, got ' || v_count;

  -- ── Case 5: payload shape (φ = 94-d, correction at weight 2, watermark) ──
  SELECT get_taste_refit_payload(u_mgr) INTO v_payload;
  ASSERT jsonb_array_length(v_payload->'judgments') >= 4,
    'FAIL 5a: payload should carry >= 4 pair rows';
  ASSERT jsonb_array_length(v_payload->'judgments'->0->'phi_a') = 94,
    'FAIL 5b: phi_a must be the 94-d basis (00244 _aesthete_phi), got '
    || jsonb_array_length(v_payload->'judgments'->0->'phi_a');
  ASSERT jsonb_typeof(v_payload->'theta_prior') IN ('null', 'array'),
    'FAIL 5c: theta_prior must be null or an array';
  -- (SQL NULL house theta serializes as JSON null in the payload)
  ASSERT v_payload->'theta_prior' IS NOT DISTINCT FROM
         COALESCE(to_jsonb((SELECT theta FROM house_taste WHERE status = 'active')), 'null'::jsonb),
    'FAIL 5d: theta_prior must mirror the active house theta';
  -- the correction rides as (replacement ≻ rejected) at weight 2.0
  SELECT j INTO v_item FROM jsonb_array_elements(v_payload->'judgments') j
   WHERE j->>'source' = 'correction' AND (j->>'id')::bigint = v_c1;
  ASSERT v_item IS NOT NULL, 'FAIL 5e: correction-with-replacement missing from the payload';
  ASSERT (v_item->>'weight')::real = 2.0, 'FAIL 5f: correction weight must be 2.0 (§8.2)';
  ASSERT v_item->>'choice' = 'a', 'FAIL 5g: correction pair must be replacement-wins';
  -- style_group = winner''s primary archetype
  SELECT j INTO v_item FROM jsonb_array_elements(v_payload->'judgments') j
   WHERE (j->>'id')::bigint = v_j1 AND j->>'source' = 'judgment:judgment';
  ASSERT (v_item->>'style_group')::uuid = v_style,
    'FAIL 5h: style_group must be the winner''s primary archetype';
  -- neither-row carries NULL style_group and rides through (worker skips it)
  SELECT j INTO v_item FROM jsonb_array_elements(v_payload->'judgments') j
   WHERE (j->>'id')::bigint = v_j3;
  ASSERT v_item->>'style_group' IS NULL, 'FAIL 5i: neither-choice must carry NULL style_group';
  -- watermark = the newest fuel row
  SELECT greatest((SELECT max(created_at) FROM taste_judgments WHERE designer_id = u_mgr),
                  (SELECT max(created_at) FROM taste_corrections WHERE designer_id = u_mgr))
    INTO v_wm;
  ASSERT (v_payload->>'watermark')::timestamptz = v_wm, 'FAIL 5j: watermark must equal the newest fuel';

  -- ── Case 6: the §8.2 online preview ──────────────────────────────────────
  SELECT * INTO v_before FROM designer_taste_profiles WHERE designer_id = u_mgr;
  SELECT count(*) INTO v_count FROM designer_taste_snapshots WHERE designer_id = u_mgr;

  PERFORM pg_temp.assume_user(u_mgr);
  SELECT preview_taste_update(v_j1) INTO v_json;
  PERFORM pg_temp.reset_role();

  ASSERT (v_json->>'applied')::boolean, 'FAIL 6a: preview must apply on an a/b judgment';
  ASSERT (v_json->>'step_norm')::numeric <= 0.25 + 1e-9,
    'FAIL 6b: preview step must be bounded at 0.25, got ' || (v_json->>'step_norm');
  SELECT * INTO v_after FROM designer_taste_profiles WHERE designer_id = u_mgr;
  ASSERT v_after.theta IS NOT NULL AND array_length(v_after.theta, 1) = 94,
    'FAIL 6c: preview must write a 94-d theta';
  ASSERT (v_after.sources->>'theta_preview')::boolean, 'FAIL 6d: preview flag must be set';
  ASSERT v_after.version = v_before.version, 'FAIL 6e: preview must not bump the version';
  ASSERT (SELECT count(*) FROM designer_taste_snapshots WHERE designer_id = u_mgr) = v_count,
    'FAIL 6f: preview must not write snapshots';

  -- neither/both rows are preference-free no-ops
  PERFORM pg_temp.assume_user(u_mgr);
  SELECT preview_taste_update(v_j3) INTO v_json;
  PERFORM pg_temp.reset_role();
  ASSERT NOT (v_json->>'applied')::boolean AND v_json->>'reason' = 'no_pairwise_preference',
    'FAIL 6g: neither-choice preview must be a no-op';

  -- foreign judgments are refused for JWT callers
  BEGIN
    PERFORM pg_temp.assume_user(u_designer);
    PERFORM preview_taste_update(v_j1);
    RAISE EXCEPTION 'FAIL 6h: preview on another designer''s judgment must be refused';
  EXCEPTION WHEN insufficient_privilege THEN
    PERFORM pg_temp.reset_role();
  END;

  -- ── Case 7: apply_taste_refit — the preview is OVERWRITTEN ───────────────
  SELECT array_agg((0.01 * i)::real) INTO v_theta FROM generate_series(1, 94) i;
  SELECT * INTO v_before FROM designer_taste_profiles WHERE designer_id = u_mgr;

  SELECT apply_taste_refit(u_mgr, v_theta, (v_payload->>'watermark')::timestamptz,
           '{"backtest": {"auc_mean": 0.8}, "dial": {"high_stop_unlocked": false}, "drift": false}'::jsonb)
    INTO v_json;

  SELECT * INTO v_after FROM designer_taste_profiles WHERE designer_id = u_mgr;
  ASSERT v_after.theta = v_theta, 'FAIL 7a: refit must write theta verbatim (preview overwritten)';
  ASSERT NOT (v_after.sources ? 'theta_preview'), 'FAIL 7b: refit must strip the preview flag';
  ASSERT v_after.version = v_before.version + 1, 'FAIL 7c: refit must bump the profile version';
  ASSERT v_after.judgments_processed_at = (v_payload->>'watermark')::timestamptz,
    'FAIL 7d: refit must advance the watermark';
  ASSERT v_after.drift_flag = false, 'FAIL 7e: diagnostics.drift=false must land on the profile';
  -- v_D EMA landed from the winners'' vectors (p1/p2 carry basis vectors)
  ASSERT v_after.taste_vector IS NOT NULL, 'FAIL 7f: v_D EMA must land when winners carry vectors';
  SELECT vector_norm(v_after.taste_vector) INTO v_norm;
  ASSERT abs(v_norm - 1.0) < 1e-4, 'FAIL 7g: v_D must be unit-normalized, norm=' || v_norm;
  -- snapshot at the new version carries the diagnostics
  SELECT count(*) INTO v_count FROM designer_taste_snapshots
   WHERE designer_id = u_mgr AND version = v_after.version
     AND theta = v_theta
     AND (sources->'refit'->'backtest'->>'auc_mean')::numeric = 0.8;
  ASSERT v_count = 1, 'FAIL 7h: snapshot v' || v_after.version || ' with refit diagnostics missing';
  -- the watermark holds: the designer left the worklist (run-twice idempotency)
  SELECT count(*) INTO v_count FROM get_taste_refit_designers() d WHERE d.designer_id = u_mgr;
  ASSERT v_count = 0, 'FAIL 7i: refit designer must leave the worklist (watermark holds)';
  -- wrong basis length is refused
  BEGIN
    PERFORM apply_taste_refit(u_mgr, ARRAY[1, 2, 3]::real[], now(), '{}'::jsonb);
    RAISE EXCEPTION 'FAIL 7j: apply_taste_refit must refuse a non-94-d theta';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM LIKE 'FAIL%' THEN RAISE; END IF;
  END;

  -- ── Case 8: §12.2 stats writers — idempotent recompute ───────────────────
  INSERT INTO product_style_spectrum (product_id, warmth, complexity, formality, timelessness, boldness, craftsmanship, assigned_by)
  VALUES (p3, 0.5, 0.1, -0.2, 0.4, 0.0, 0.6, u_designer)
  ON CONFLICT (product_id) DO NOTHING;
  INSERT INTO teaching_validations (product_id, validator_id, vote)
  VALUES (p3, u_mgr, 'confirm'), (p3, u_idle, 'flag')
  ON CONFLICT (product_id, validator_id) DO NOTHING;
  INSERT INTO match_events (source, results)
  VALUES ('quiz', jsonb_build_array(jsonb_build_object('product_id', p3, 'score', 0.9)));

  PERFORM refresh_designer_teaching_stats();
  SELECT accuracy_score, match_impact_count INTO v_acc1, v_imp1
    FROM designer_teaching_stats WHERE designer_id = u_designer;
  PERFORM refresh_designer_teaching_stats();
  SELECT accuracy_score, match_impact_count INTO v_acc2, v_imp2
    FROM designer_teaching_stats WHERE designer_id = u_designer;

  ASSERT v_acc1 = 0.5, 'FAIL 8a: accuracy = confirm share (1 confirm / 2 votes), got ' || v_acc1;
  ASSERT v_imp1 >= 1, 'FAIL 8b: match_impact_count must count citing match_events, got ' || v_imp1;
  ASSERT v_acc1 = v_acc2 AND v_imp1 = v_imp2,
    'FAIL 8c: stats writer must be idempotent (rerun = same values)';

  -- ── Case 9: reliability writer — recompute-overwrite ─────────────────────
  SELECT apply_designer_reliability(u_mgr, 0.37,
           jsonb_build_object(v_style::text, jsonb_build_object('score', 0.5, 'n', 12, 'label', 'advanced'),
                              '_dial', jsonb_build_object('high_stop_unlocked', false)),
           jsonb_build_array(
             jsonb_build_object('style_id', v_style,  'level', 'advanced', 'judgment_count', 12),
             jsonb_build_object('style_id', v_style2, 'level', 'learning', 'judgment_count', 2)))
    INTO v_json;
  ASSERT (v_json->>'style_rows')::int = 2, 'FAIL 9a: expected 2 style confidence rows';
  SELECT apply_designer_reliability(u_mgr, 0.37,
           jsonb_build_object(v_style::text, jsonb_build_object('score', 0.5, 'n', 12, 'label', 'advanced'),
                              '_dial', jsonb_build_object('high_stop_unlocked', false)),
           jsonb_build_array(
             jsonb_build_object('style_id', v_style,  'level', 'advanced', 'judgment_count', 12),
             jsonb_build_object('style_id', v_style2, 'level', 'learning', 'judgment_count', 2)))
    INTO v_json;
  SELECT count(*) INTO v_count FROM designer_style_confidence WHERE designer_id = u_mgr;
  ASSERT v_count = 2, 'FAIL 9b: rerun must leave exactly the same 2 rows, got ' || v_count;
  SELECT reliability INTO v_acc1 FROM designer_taste_profiles WHERE designer_id = u_mgr;
  ASSERT v_acc1 = 0.37::real, 'FAIL 9c: reliability must be written verbatim';
  ASSERT (SELECT confidence_map->'_dial'->>'high_stop_unlocked'
            FROM designer_taste_profiles WHERE designer_id = u_mgr) = 'false',
    'FAIL 9d: the §14.4 dial verdict must land in confidence_map._dial';
  BEGIN
    PERFORM apply_designer_reliability(u_mgr, 0.5, '{}'::jsonb,
      jsonb_build_array(jsonb_build_object('style_id', v_style, 'level', 'wizard', 'judgment_count', 1)));
    RAISE EXCEPTION 'FAIL 9e: invalid confidence level must be refused';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM LIKE 'FAIL%' THEN RAISE; END IF;
  END;

  -- ── Case 10: starvation decay (§8.4) ─────────────────────────────────────
  -- The idle designer: judgments 120 days old, learned theta, confidence in
  -- two styles straddling the advanced/learning boundary.
  INSERT INTO taste_judgments (designer_id, product_a, product_b, choice, context, kind, created_at)
  VALUES (u_idle, p1, p2, 'a', 'self', 'judgment', now() - interval '120 days');
  SELECT array_agg(1.0::real) INTO v_theta FROM generate_series(1, 94);
  INSERT INTO designer_taste_profiles (designer_id, theta, confidence_map, sources)
  VALUES (u_idle, v_theta,
          jsonb_build_object(
            v_style::text,  jsonb_build_object('score', 0.80, 'n', 30, 'label', 'expert'),
            v_style2::text, jsonb_build_object('score', 0.41, 'n', 8,  'label', 'advanced'),
            '_dial', jsonb_build_object('high_stop_unlocked', true)),
          '{}'::jsonb)
  ON CONFLICT (designer_id) DO UPDATE
    SET theta = EXCLUDED.theta, confidence_map = EXCLUDED.confidence_map,
        sources = EXCLUDED.sources, retired_at = NULL;
  INSERT INTO designer_style_confidence (designer_id, style_id, level, judgment_count)
  VALUES (u_idle, v_style, 'expert', 30), (u_idle, v_style2, 'advanced', 8)
  ON CONFLICT (designer_id, style_id) DO UPDATE SET level = EXCLUDED.level;

  SELECT apply_starvation_decay() INTO v_json;
  ASSERT (v_json->>'decayed')::int >= 1, 'FAIL 10a: the idle designer must decay';

  SELECT * INTO v_after FROM designer_taste_profiles WHERE designer_id = u_idle;
  -- deviation shrink toward θ_H (NULL house theta → zeros): 1.0 → exp(−1/12)
  ASSERT abs(v_after.theta[1] - exp(-1.0/12.0)) < 1e-6,
    'FAIL 10b: theta must shrink by exp(-1/12), got ' || v_after.theta[1];
  ASSERT (v_after.confidence_map->(v_style::text)->>'score')::numeric = 0.76,
    'FAIL 10c: c_D must decay 0.80 -> 0.76';
  ASSERT v_after.confidence_map->(v_style::text)->>'label' = 'expert',
    'FAIL 10d: 0.76 stays expert';
  ASSERT (v_after.confidence_map->(v_style2::text)->>'score')::numeric = 0.3895,
    'FAIL 10e: c_D must decay 0.41 -> 0.3895';
  ASSERT v_after.confidence_map->(v_style2::text)->>'label' = 'learning',
    'FAIL 10f: 0.3895 crosses down to learning';
  ASSERT (SELECT level FROM designer_style_confidence
           WHERE designer_id = u_idle AND style_id = v_style2) = 'learning',
    'FAIL 10g: designer_style_confidence level must follow the decayed score';
  ASSERT v_after.confidence_map ? '_dial', 'FAIL 10h: _diagnostic keys must survive the decay';
  ASSERT v_after.sources ? 'starvation_decayed_at', 'FAIL 10i: the month marker must be set';

  -- the month marker gates re-application
  v_theta2 := v_after.theta;
  SELECT apply_starvation_decay() INTO v_json;
  SELECT * INTO v_after FROM designer_taste_profiles WHERE designer_id = u_idle;
  ASSERT v_after.theta = v_theta2,
    'FAIL 10j: a second run within the month must not decay again';

  RAISE NOTICE 'nightly_test: ALL ASSERTIONS PASSED';
END $$;

ROLLBACK;
