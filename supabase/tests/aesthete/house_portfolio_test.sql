-- ═══════════════════════════════════════════════════════════════════════════
-- House + portfolio + biases + designer-matching tests (migration 00249)
--
-- Exercises design §4.3 / §8.5 / §9.1 / §9.3 / §18:
--   1. portfolio-items bucket exists, private, with the four owner-pathed
--      policies (capture-media precedent).
--   2. Portfolio INSERT (as the owner) enqueues a portfolio_embed job;
--      a done job resurrects on storage_path change (00241 dedupe idiom).
--   3. _aesthete_geometric_median math: known collinear 3-point case
--      (median = middle point, ≠ mean), 2-point mean fallback, empty input.
--   4. recompute_portfolio_centroid: unit centroid written; taste_vector
--      seeded ONLY when NULL (the §4.3 seed flip); sources bumped; gate
--      (foreign designer 42501); retired tombstone respected.
--   5. seed_house_from_validated_catalog: DRAFT row over published catalog
--      products carrying vector + canonical spectrum; active house
--      untouched; non-lead 42501.
--   6. derive_signature_biases: deviation candidates (|d|≥1σ + sign-stable
--      snapshots) minted as 'proposed' with template names + evidence;
--      unstable dims filtered; correction-minted path (≥3 same-direction);
--      THE EDIT INVARIANT — confirmed/muted rows byte-untouched; stale
--      proposed rows pruned.
--   7. match_designers_for_client: sim = ½(1+cos) endpoints (1.0 / 0.0);
--      portfolio_centroid fallback; retired excluded; confidence jsonb
--      {score, n, label}; owner/lead access; foreign claimed key 42501;
--      unknown key P0002; anon EXECUTE denied.
--   8. aesthete_house_portfolio_nightly: recomputes stale centroids +
--      derives for fresh-snapshot designers; cron registered.
--
-- Seed-robust by construction (G3 decision ①): fixtures use the ae4b0000-…
-- prefix; pre-existing designer thetas are neutralized in-transaction; a
-- known house version is activated in-transaction; assertions are
-- property-based where global state could interfere. Everything ROLLBACKs.
--
-- Uses the seeded dev accounts (supabase/seed/dev-accounts.sql):
--   superadmin@patina.dev a0000000-0000-0000-0000-000000000001 (admin → lead)
--   studio@patina.dev     a0000000-0000-0000-0000-000000000003
--   designer@patina.dev   a0000000-0000-0000-0000-000000000004
--   client@patina.dev     a0000000-0000-0000-0000-000000000005
-- Run after `supabase db reset` so seeds are present.
--
-- How to run:
--   docker exec -i supabase_db_supabase psql -U postgres -d postgres \
--     -v ON_ERROR_STOP=1 < supabase/tests/aesthete/house_portfolio_test.sql
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─── helpers (products_three_layer_test.sql idiom) ──────────────────────────

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

-- Unit basis vector along dim 1..768 scaled by k.
CREATE OR REPLACE FUNCTION pg_temp.axis_vec(p_dim int, p_k real)
RETURNS vector AS $$
DECLARE v real[] := array_fill(0::real, ARRAY[768]);
BEGIN
  v[p_dim] := p_k;
  RETURN v::vector;
END;
$$ LANGUAGE plpgsql;

-- ─── fixtures ────────────────────────────────────────────────────────────────

DO $fix$
DECLARE
  v_theta_d real[];
  v_theta_zero real[] := array_fill(0::real, ARRAY[94]);
  v_house_v int;
BEGIN
  -- Neutralize pre-existing state (seed-robustness, G3 decision ①): the σ
  -- roster, correction counts, exemplar winners, and bias rows must be
  -- exactly the fixtures below. All rolled back.
  UPDATE designer_taste_profiles SET theta = NULL WHERE theta IS NOT NULL;
  UPDATE designer_taste_profiles SET retired_at = NULL WHERE retired_at IS NOT NULL;
  DELETE FROM taste_corrections WHERE designer_id = 'a0000000-0000-0000-0000-000000000004';
  DELETE FROM taste_probe_queue WHERE designer_id = 'a0000000-0000-0000-0000-000000000004';
  DELETE FROM taste_judgments   WHERE designer_id = 'a0000000-0000-0000-0000-000000000004';
  DELETE FROM signature_biases  WHERE designer_id = 'a0000000-0000-0000-0000-000000000004';

  -- A known ACTIVE house with θ_H = zeros (94) so d_k is deterministic
  -- regardless of what is active outside this transaction.
  SELECT COALESCE(max(version), 0) + 1000 INTO v_house_v FROM house_taste;
  INSERT INTO house_taste (version, taste_vector, theta,
                           warmth, complexity, formality, timelessness, boldness, craftsmanship,
                           status, notes, computed_from)
  VALUES (v_house_v, vec_normalize(array_fill(1.0::real, ARRAY[768])::vector), v_theta_zero,
          0, 0, 0, 0, 0, 0, 'draft', 'house_portfolio_test fixture', '{"seed":"test"}'::jsonb);
  UPDATE house_taste SET status = 'retired' WHERE status = 'active';
  UPDATE house_taste SET status = 'active' WHERE version = v_house_v;

  -- Catalog fixture products (published, vectors + canonical spectrums) for
  -- the house fallback + judgment exemplars.
  INSERT INTO products (id, name, source_url, captured_by, captured_at, layer, patina_managed,
                        status, category, materials, aesthete_vector)
  VALUES
    ('ae4b0000-0000-4000-8000-000000000001', 'HP test warm oak chair',   'http://test.invalid/hp1',
     'a0000000-0000-0000-0000-000000000004', NOW(), 'catalog', TRUE, 'published', 'chair',
     ARRAY['White oak'], pg_temp.axis_vec(1, 1.0)),
    ('ae4b0000-0000-4000-8000-000000000002', 'HP test cool steel chair', 'http://test.invalid/hp2',
     'a0000000-0000-0000-0000-000000000004', NOW(), 'catalog', TRUE, 'published', 'chair',
     ARRAY['Steel'], pg_temp.axis_vec(1, -1.0)),
    ('ae4b0000-0000-4000-8000-000000000003', 'HP test walnut table',     'http://test.invalid/hp3',
     'a0000000-0000-0000-0000-000000000004', NOW(), 'catalog', TRUE, 'published', 'table',
     ARRAY['Walnut'], pg_temp.axis_vec(2, 1.0)),
    ('ae4b0000-0000-4000-8000-000000000004', 'HP test linen sofa',       'http://test.invalid/hp4',
     'a0000000-0000-0000-0000-000000000004', NOW(), 'catalog', TRUE, 'published', 'sofa',
     ARRAY['Linen'], pg_temp.axis_vec(3, 1.0));

  INSERT INTO product_style_spectrum (product_id, warmth, complexity, formality, timelessness,
                                      boldness, craftsmanship, assigned_by, source, confidence)
  VALUES
    ('ae4b0000-0000-4000-8000-000000000001',  0.8, -0.2, 0.0, 0.5, 0.1, 0.7,
     'a0000000-0000-0000-0000-000000000004', 'manual', '{"warmth": 1.0}'),
    ('ae4b0000-0000-4000-8000-000000000002', -0.6,  0.3, 0.2, 0.1, 0.4, 0.2,
     'a0000000-0000-0000-0000-000000000004', 'manual', '{"warmth": 1.0}'),
    ('ae4b0000-0000-4000-8000-000000000003',  0.4,  0.0, 0.0, 0.6, 0.0, 0.8,
     'a0000000-0000-0000-0000-000000000004', 'validated', '{}'),
    ('ae4b0000-0000-4000-8000-000000000004',  0.2, -0.4, -0.2, 0.3, -0.1, 0.5,
     'a0000000-0000-0000-0000-000000000004', 'manual', '{}')
  ON CONFLICT (product_id) DO NOTHING;

  -- σ roster: three fitted profiles. Designer …04 carries the deviations
  -- under test; …01/…03 sit at zero → per-dim std is small → the 0.10 floor
  -- rules (documented small-roster behavior).
  --   dim 1 warmth        = 0.8  → d =  8.0  (candidate, stable)
  --   dim 4 timelessness  = 0.9  → d =  9.0  (candidate, sign-UNSTABLE below)
  --   dim 5 boldness      = 0.9  → d =  9.0  (candidate; pre-CONFIRMED row)
  --   dim 2 complexity    = -0.9 → d = -9.0  (candidate; pre-MUTED row)
  v_theta_d := v_theta_zero;
  v_theta_d[1] := 0.8; v_theta_d[4] := 0.9; v_theta_d[5] := 0.9; v_theta_d[2] := -0.9;

  INSERT INTO designer_taste_profiles (designer_id, theta, taste_vector, reliability, sources)
  VALUES
    ('a0000000-0000-0000-0000-000000000004', v_theta_d, pg_temp.axis_vec(1, 1.0), 0.5,
     '{"judgments": 30, "portfolio_items": 0, "corrections": 0, "rules": 0}'),
    ('a0000000-0000-0000-0000-000000000003', v_theta_zero, pg_temp.axis_vec(1, -1.0), 0.2, '{"judgments": 5}'),
    ('a0000000-0000-0000-0000-000000000001', v_theta_zero, NULL, 0.15, '{}')
  ON CONFLICT (designer_id) DO UPDATE
    SET theta = EXCLUDED.theta, taste_vector = EXCLUDED.taste_vector,
        reliability = EXCLUDED.reliability, sources = EXCLUDED.sources,
        retired_at = NULL;

  -- Two consistent snapshots for stability — except dim 4 flips sign.
  -- Delete ALL of the designer's snapshots (rolled back): pre-existing demo
  -- rows would enter the last-5 stability window and defeat determinism.
  DELETE FROM designer_taste_snapshots
   WHERE designer_id = 'a0000000-0000-0000-0000-000000000004';
  INSERT INTO designer_taste_snapshots (designer_id, version, theta, reliability)
  SELECT 'a0000000-0000-0000-0000-000000000004', v, s.th, 0.5
    FROM (VALUES
      (9001, (SELECT t FROM (SELECT v_theta_d AS t) x)),
      (9002, (SELECT t FROM (SELECT v_theta_d AS t) x))
    ) s(v, th);
  -- flip dim 4 in the OLDER snapshot → agreement 0.5 < 0.8 for timelessness
  UPDATE designer_taste_snapshots
     SET theta[4] = -0.5
   WHERE designer_id = 'a0000000-0000-0000-0000-000000000004' AND version = 9001;

  -- Judgment winners for exemplar evidence (warm chair wins twice).
  INSERT INTO taste_judgments (designer_id, product_a, product_b, choice)
  VALUES
    ('a0000000-0000-0000-0000-000000000004', 'ae4b0000-0000-4000-8000-000000000001', 'ae4b0000-0000-4000-8000-000000000002', 'a'),
    ('a0000000-0000-0000-0000-000000000004', 'ae4b0000-0000-4000-8000-000000000002', 'ae4b0000-0000-4000-8000-000000000001', 'b');

  -- Pre-existing human-owned bias rows (THE EDIT INVARIANT).
  INSERT INTO signature_biases (id, designer_id, feature_group, direction, learned_strength,
                                displayed_strength, name, description, status, evidence)
  VALUES
    ('ae4b0000-0000-4000-8000-00000000b001', 'a0000000-0000-0000-0000-000000000004',
     'boldness', '+', 0.42, 0.9, 'My bold streak', 'Hand-confirmed by the designer.', 'confirmed',
     '{"source": "deviation", "d": 1.2}'),
    ('ae4b0000-0000-4000-8000-00000000b002', 'a0000000-0000-0000-0000-000000000004',
     'complexity', '-', 0.3, NULL, 'Quiet lines', 'Muted — do not show.', 'muted',
     '{"source": "deviation"}');

  -- Corrections: 3 same-direction on formality (the mint threshold),
  -- 2 on craftsmanship (below threshold → no mint).
  INSERT INTO taste_corrections (designer_id, subject, direction, free_text)
  VALUES
    ('a0000000-0000-0000-0000-000000000004', 'match', '{"formality": -0.3}', '[hp-test] too formal 1'),
    ('a0000000-0000-0000-0000-000000000004', 'match', '{"formality": -0.2}', '[hp-test] too formal 2'),
    ('a0000000-0000-0000-0000-000000000004', 'spectrum', '{"formality": -0.4}', '[hp-test] too formal 3'),
    ('a0000000-0000-0000-0000-000000000004', 'match', '{"craftsmanship": 0.2}', '[hp-test] more craft 1'),
    ('a0000000-0000-0000-0000-000000000004', 'match', '{"craftsmanship": 0.1}', '[hp-test] more craft 2');

  -- Client profile with a style_vector aligned to designer …04's taste
  -- vector (axis 1) — sim endpoints become exact.
  INSERT INTO client_style_profiles (id, user_id, session_key, source, style_vector,
                                     warmth, confidence, is_current, version)
  VALUES
    ('ae4b0000-0000-4000-8000-00000000c001', 'a0000000-0000-0000-0000-000000000005',
     'ae4b0000-0000-4000-8000-00000000ce01', 'quiz', pg_temp.axis_vec(1, 1.0), 0.5, 0.7, true, 1),
    ('ae4b0000-0000-4000-8000-00000000c002', NULL,
     'ae4b0000-0000-4000-8000-00000000ce02', 'quiz', pg_temp.axis_vec(1, 1.0), 0.5, 0.7, true, 1),
    ('ae4b0000-0000-4000-8000-00000000c003', 'a0000000-0000-0000-0000-000000000005',
     'ae4b0000-0000-4000-8000-00000000ce03', 'quiz', NULL, 0.5, 0.7, true, 1);
END $fix$;

-- ─── assertions ──────────────────────────────────────────────────────────────

DO $test$
DECLARE
  u_lead     UUID := 'a0000000-0000-0000-0000-000000000001';
  u_mgr      UUID := 'a0000000-0000-0000-0000-000000000003';
  u_designer UUID := 'a0000000-0000-0000-0000-000000000004';
  u_client   UUID := 'a0000000-0000-0000-0000-000000000005';
  v_count int;
  v_med record;
  v_res jsonb;
  v_row record;
  v_bias signature_biases;
  v_before signature_biases;
  v_id uuid;
  v_house house_taste;
  v_active_before int;
  v_item1 uuid := 'ae4b0000-0000-4000-8000-00000000f101';
  v_item2 uuid := 'ae4b0000-0000-4000-8000-00000000f102';
  v_item3 uuid := 'ae4b0000-0000-4000-8000-00000000f103';
  v_vec vector;
  v_norm double precision;
  v_caught boolean;
  v_n int;
BEGIN
  -- Case 0: preconditions — dev accounts + bucket + policies.
  SELECT count(*) INTO v_count FROM auth.users
   WHERE id IN (u_lead, u_mgr, u_designer, u_client);
  ASSERT v_count = 4, 'seeded dev accounts missing — run supabase db reset first';

  SELECT count(*) INTO v_count FROM storage.buckets
   WHERE id = 'portfolio-items' AND public = false;
  ASSERT v_count = 1, 'portfolio-items bucket must exist and be PRIVATE';

  SELECT count(*) INTO v_count FROM pg_policies
   WHERE schemaname = 'storage' AND tablename = 'objects'
     AND policyname IN ('Portfolio items owner read', 'Portfolio items owner upload',
                        'Portfolio items owner update', 'Portfolio items owner delete');
  ASSERT v_count = 4, format('expected 4 owner-pathed portfolio policies, got %s', v_count);
  RAISE NOTICE 'Case 0 ok: bucket + policies';

  -- Case 1: portfolio INSERT (as owner) enqueues a portfolio_embed job.
  PERFORM pg_temp.assume_user(u_designer);
  INSERT INTO designer_portfolio_items (id, designer_id, storage_path, caption)
  VALUES (v_item1, u_designer, u_designer || '/hp-test-01.jpg', 'HP test 1');
  PERFORM pg_temp.reset_role();

  SELECT count(*) INTO v_count FROM aesthete_jobs
   WHERE kind = 'portfolio_embed' AND status = 'pending'
     AND dedupe_key = v_item1 || ':portfolio_embed:r1'
     AND payload->>'portfolio_item_id' = v_item1::text
     AND payload->>'designer_id' = u_designer::text;
  ASSERT v_count = 1, 'portfolio INSERT must enqueue a pending portfolio_embed job';

  -- done → storage_path change resurrects (00241 dedupe idiom).
  UPDATE aesthete_jobs SET status = 'done', completed_at = now()
   WHERE dedupe_key = v_item1 || ':portfolio_embed:r1';
  PERFORM pg_temp.assume_user(u_designer);
  UPDATE designer_portfolio_items SET storage_path = u_designer || '/hp-test-01b.jpg'
   WHERE id = v_item1;
  PERFORM pg_temp.reset_role();
  SELECT count(*) INTO v_count FROM aesthete_jobs
   WHERE dedupe_key = v_item1 || ':portfolio_embed:r1' AND status = 'pending' AND attempts = 0;
  ASSERT v_count = 1, 'done portfolio job must resurrect to pending on storage_path change';
  RAISE NOTICE 'Case 1 ok: enqueue trigger + resurrect';

  -- Case 2: geometric-median math.
  -- 2a. collinear {0, 1, 4} on dim 1 → median = middle point (1), NOT the
  --     mean (5/3) — the §4.3 "median, not mean" property.
  SELECT * INTO v_med FROM _aesthete_geometric_median(ARRAY[
    pg_temp.axis_vec(1, 0.0), pg_temp.axis_vec(1, 1.0), pg_temp.axis_vec(1, 4.0)]);
  ASSERT v_med.method = 'weiszfeld', 'n=3 must run Weiszfeld';
  ASSERT v_med.converged, 'known 3-point case must converge inside the cap';
  ASSERT abs((v_med.median::real[])[1] - 1.0) < 0.01,
    format('collinear median must be ~1.0 (middle point), got %s', (v_med.median::real[])[1]);
  ASSERT abs((v_med.median::real[])[1] - 5.0/3.0) > 0.5,
    'median must be distinguishable from the mean (5/3)';

  -- 2b. n = 2 → mean fallback.
  SELECT * INTO v_med FROM _aesthete_geometric_median(ARRAY[
    pg_temp.axis_vec(1, 1.0), pg_temp.axis_vec(1, 3.0)]);
  ASSERT v_med.method = 'mean', 'n<3 must fall back to the mean';
  ASSERT abs((v_med.median::real[])[1] - 2.0) < 1e-6, '2-point mean must be the midpoint';

  -- 2c. empty input.
  SELECT * INTO v_med FROM _aesthete_geometric_median('{}'::vector[]);
  ASSERT v_med.method = 'empty' AND v_med.median IS NULL, 'empty input → NULL median';
  RAISE NOTICE 'Case 2 ok: Weiszfeld math (collinear median 1.0 ≠ mean 1.67), mean fallback, empty';

  -- Case 3: recompute_portfolio_centroid.
  -- Three embedded items on axis 1 at {0, 1, 4} → centroid = normalize(dim1
  -- median 1.0) = e1. taste_vector for u_mgr starts NULL → seed flip.
  INSERT INTO designer_portfolio_items (id, designer_id, storage_path, status, embedding)
  VALUES
    (v_item2, u_mgr, u_mgr || '/hp-a.jpg', 'embedded', pg_temp.axis_vec(1, 0.0)),
    (v_item3, u_mgr, u_mgr || '/hp-b.jpg', 'embedded', pg_temp.axis_vec(1, 1.0)),
    ('ae4b0000-0000-4000-8000-00000000f104', u_mgr, u_mgr || '/hp-c.jpg', 'embedded', pg_temp.axis_vec(1, 4.0));
  UPDATE designer_taste_profiles SET taste_vector = NULL, portfolio_centroid = NULL
   WHERE designer_id = u_mgr;

  v_res := recompute_portfolio_centroid(u_mgr);
  ASSERT (v_res->>'updated')::boolean, 'recompute must report updated=true';
  ASSERT (v_res->>'n_items')::int = 3, 'recompute must count 3 embedded items';
  ASSERT v_res->>'method' = 'weiszfeld', 'n=3 recompute must use Weiszfeld';

  SELECT portfolio_centroid, taste_vector, sources INTO v_row
    FROM designer_taste_profiles WHERE designer_id = u_mgr;
  ASSERT v_row.portfolio_centroid IS NOT NULL, 'portfolio_centroid must land';
  v_norm := vector_norm(v_row.portfolio_centroid);
  ASSERT abs(v_norm - 1.0) < 1e-4, format('stored centroid must be unit (§4.1), norm=%s', v_norm);
  ASSERT abs(((v_row.portfolio_centroid::real[])[1]) - 1.0) < 0.01,
    'centroid direction must be the collinear median (e1)';
  ASSERT v_row.taste_vector = v_row.portfolio_centroid,
    'NULL taste_vector must be seeded from the centroid (§4.3)';
  ASSERT (v_row.sources->>'portfolio_items')::int = 3, 'sources.portfolio_items must be 3';

  -- Existing taste_vector is NEVER overwritten by a recompute.
  UPDATE designer_taste_profiles SET taste_vector = pg_temp.axis_vec(2, 1.0)
   WHERE designer_id = u_mgr;
  v_res := recompute_portfolio_centroid(u_mgr);
  SELECT taste_vector INTO v_vec FROM designer_taste_profiles WHERE designer_id = u_mgr;
  ASSERT v_vec = pg_temp.axis_vec(2, 1.0),
    'recompute must not overwrite an existing taste_vector';

  -- Gate: a foreign designer may not recompute someone else's centroid.
  v_caught := false;
  PERFORM pg_temp.assume_user(u_designer);
  BEGIN
    PERFORM recompute_portfolio_centroid(u_mgr);
  EXCEPTION WHEN insufficient_privilege THEN v_caught := true;
  END;
  PERFORM pg_temp.reset_role();
  ASSERT v_caught, 'foreign recompute must raise 42501';

  -- Retired tombstone: recompute refuses.
  UPDATE designer_taste_profiles SET retired_at = now() WHERE designer_id = u_mgr;
  v_res := recompute_portfolio_centroid(u_mgr);
  ASSERT NOT (v_res->>'updated')::boolean AND v_res->>'reason' = 'retired',
    'retired profiles must be skipped';
  UPDATE designer_taste_profiles SET retired_at = NULL WHERE designer_id = u_mgr;
  RAISE NOTICE 'Case 3 ok: centroid recompute + seed flip + gates';

  -- Case 4: seed_house_from_validated_catalog.
  SELECT version INTO v_active_before FROM house_taste WHERE status = 'active';

  -- Non-lead call → 42501.
  v_caught := false;
  PERFORM pg_temp.assume_user(u_designer);
  BEGIN
    v_id := seed_house_from_validated_catalog();
  EXCEPTION WHEN insufficient_privilege THEN v_caught := true;
  END;
  PERFORM pg_temp.reset_role();
  ASSERT v_caught, 'non-lead seed_house_from_validated_catalog must raise 42501';

  -- As lead: a draft lands; the active house is untouched.
  PERFORM pg_temp.assume_user(u_lead);
  v_id := seed_house_from_validated_catalog();
  PERFORM pg_temp.reset_role();
  ASSERT v_id IS NOT NULL, 'lead call must create a draft';

  SELECT * INTO v_house FROM house_taste WHERE id = v_id;
  ASSERT v_house.status = 'draft', 'fallback house must land as DRAFT (activation stays human)';
  ASSERT v_house.taste_vector IS NOT NULL, 'draft must carry v_H';
  v_norm := vector_norm(v_house.taste_vector);
  ASSERT abs(v_norm - 1.0) < 1e-4, 'v_H must be unit';
  ASSERT v_house.computed_from->>'collection' = 'validated-catalog', 'computed_from must say so';
  ASSERT (v_house.computed_from->>'n_products')::int >= 4, 'must cover at least the 4 fixtures';
  ASSERT v_house.warmth IS NOT NULL AND v_house.warmth BETWEEN -1 AND 1, 's_H warmth in range';
  ASSERT array_length(v_house.theta, 1) = 94, 'θ_H must be 94-d';
  ASSERT abs(v_house.theta[1] - v_house.warmth) < 1e-6,
    'θ_H dims 1..6 must be the spectrum coords (§9.1 spectrum-aligned reading)';
  ASSERT v_house.theta[7] = 0, 'θ_H beyond the spectrums must be zero deviation';

  SELECT version INTO v_count FROM house_taste WHERE status = 'active';
  ASSERT v_count = v_active_before, 'active house must be untouched by the fallback seed';

  -- When only the fixtures qualify, the confidence-weighted warmth mean is
  -- exactly (.8·1 + −.6·1 + .4·.5 + .2·.5)/(1+1+.5+.5) = 0.5/3 ≈ 0.16667
  -- (exact check only when global state doesn't add qualifying products).
  SELECT count(*) INTO v_n
    FROM products p JOIN product_style_spectrum pss ON pss.product_id = p.id
   WHERE p.layer = 'catalog' AND p.status = 'published' AND p.aesthete_vector IS NOT NULL;
  IF v_n = 4 THEN
    ASSERT abs(v_house.warmth - 0.5/3.0) < 0.001,
      format('confidence-weighted warmth mean must be 0.5/3, got %s', v_house.warmth);
    RAISE NOTICE 'Case 4 ok: house fallback draft (exact weighted-mean check ran)';
  ELSE
    RAISE NOTICE 'Case 4 ok: house fallback draft (property checks; % qualifying products)', v_n;
  END IF;

  -- Case 5: derive_signature_biases.
  SELECT * INTO v_before FROM signature_biases WHERE id = 'ae4b0000-0000-4000-8000-00000000b001';

  v_res := derive_signature_biases(u_designer);
  ASSERT (v_res->>'candidates')::int >= 3,
    format('warmth+/boldness+/complexity-/formality- expected among candidates, got %s', v_res);

  -- 5a. warmth+ minted as proposed, named by the template, evidence carries
  --     d/σ/agreement + exemplars from judgment winners.
  SELECT * INTO v_bias FROM signature_biases
   WHERE designer_id = u_designer AND feature_group = 'warmth' AND direction = '+';
  ASSERT FOUND, 'warmth+ must be minted';
  ASSERT v_bias.status = 'proposed', 'derivation writes proposed ONLY';
  ASSERT v_bias.name = 'Warm lean', 'warmth+ must take its bias_templates name';
  ASSERT v_bias.evidence->>'source' = 'deviation', 'deviation evidence expected';
  ASSERT (v_bias.evidence->>'agreement')::real >= 0.8, 'stability agreement recorded';
  ASSERT jsonb_array_length(v_bias.evidence->'exemplar_product_ids') >= 1,
    'exemplar product ids from judgment winners expected';
  ASSERT (v_bias.evidence->'exemplar_product_ids'->>0)::uuid = 'ae4b0000-0000-4000-8000-000000000001',
    'the warm chair (twice a winner, warmth .8·conf 1.0) must lead the warmth+ exemplars';

  -- 5b. timelessness+ is |d|≥1 but sign-UNSTABLE (older snapshot flipped) →
  --     filtered.
  SELECT count(*) INTO v_count FROM signature_biases
   WHERE designer_id = u_designer AND feature_group = 'timelessness';
  ASSERT v_count = 0, 'sign-unstable dims must not mint (the noise filter)';

  -- 5c. THE EDIT INVARIANT: the confirmed boldness+ row is byte-untouched.
  SELECT * INTO v_bias FROM signature_biases WHERE id = 'ae4b0000-0000-4000-8000-00000000b001';
  ASSERT v_bias.status = 'confirmed' AND v_bias.name = 'My bold streak'
     AND v_bias.learned_strength = v_before.learned_strength
     AND v_bias.displayed_strength = v_before.displayed_strength
     AND v_bias.version = v_before.version
     AND v_bias.evidence = v_before.evidence,
    'confirmed rows must NEVER be touched by derivation (§8.5 edit invariant)';
  ASSERT (v_res->>'skipped_locked')::int >= 2, 'confirmed + muted rows must be skipped';

  -- muted complexity- row untouched too.
  SELECT * INTO v_bias FROM signature_biases WHERE id = 'ae4b0000-0000-4000-8000-00000000b002';
  ASSERT v_bias.status = 'muted' AND v_bias.name = 'Quiet lines',
    'muted rows must never be touched';

  -- 5d. correction-minted: 3× same-direction formality- → proposed with
  --     citations; 2× craftsmanship+ stays below threshold.
  SELECT * INTO v_bias FROM signature_biases
   WHERE designer_id = u_designer AND feature_group = 'formality' AND direction = '-';
  ASSERT FOUND, 'formality- must be correction-minted at ≥3 same-direction';
  ASSERT v_bias.status = 'proposed' AND v_bias.evidence->>'source' = 'corrections'
     AND (v_bias.evidence->>'count')::int = 3
     AND jsonb_array_length(v_bias.evidence->'correction_ids') = 3,
    'correction evidence must cite the 3 correction ids';
  ASSERT v_bias.name = 'At-ease rooms', 'formality- takes its template name';

  SELECT count(*) INTO v_count FROM signature_biases
   WHERE designer_id = u_designer AND feature_group = 'craftsmanship';
  ASSERT v_count = 0, '2 corrections are below the ≥3 mint threshold';

  -- 5e. idempotent re-run: updates in place, no duplicates.
  v_res := derive_signature_biases(u_designer);
  SELECT count(*) INTO v_count FROM signature_biases
   WHERE designer_id = u_designer AND feature_group = 'warmth' AND direction = '+';
  ASSERT v_count = 1, 're-derivation must update in place, not duplicate';
  ASSERT (v_res->>'minted')::int = 0 AND (v_res->>'updated')::int >= 2,
    format('second run must update, not re-mint: %s', v_res);

  -- 5f. stale pruning: drop the warmth deviation → its proposal is pruned;
  --     human-owned rows survive.
  UPDATE designer_taste_profiles
     SET theta[1] = 0 WHERE designer_id = u_designer;
  UPDATE designer_taste_snapshots
     SET theta[1] = 0 WHERE designer_id = u_designer AND version IN (9001, 9002);
  v_res := derive_signature_biases(u_designer);
  SELECT count(*) INTO v_count FROM signature_biases
   WHERE designer_id = u_designer AND feature_group = 'warmth';
  ASSERT v_count = 0, 'stale proposed rows must be pruned when the deviation dissolves';
  ASSERT (v_res->>'deleted_stale')::int >= 1, 'pruning must be reported';
  SELECT count(*) INTO v_count FROM signature_biases
   WHERE id IN ('ae4b0000-0000-4000-8000-00000000b001', 'ae4b0000-0000-4000-8000-00000000b002');
  ASSERT v_count = 2, 'human-owned rows survive pruning, always';

  -- 5g. gate: a foreign non-lead may not derive for someone else.
  v_caught := false;
  PERFORM pg_temp.assume_user(u_mgr);
  BEGIN
    v_res := derive_signature_biases(u_designer);
  EXCEPTION WHEN insufficient_privilege THEN v_caught := true;
  END;
  PERFORM pg_temp.reset_role();
  ASSERT v_caught, 'foreign derive must raise 42501';
  RAISE NOTICE 'Case 5 ok: bias derivation (mint/stability/invariant/corrections/prune)';

  -- Case 6: match_designers_for_client.
  -- u_designer taste_vector = e1 (set in fixtures; recompute for u_mgr set
  -- taste_vector to e2 → cos 0 → sim 0.5). Give u_lead a portfolio-only
  -- profile at −e1 → sim 0.0 via the centroid fallback.
  UPDATE designer_taste_profiles
     SET taste_vector = NULL, portfolio_centroid = pg_temp.axis_vec(1, -1.0)
   WHERE designer_id = u_lead;

  PERFORM pg_temp.assume_user(u_client);
  SELECT count(*) INTO v_count
    FROM match_designers_for_client('ae4b0000-0000-4000-8000-00000000ce01');
  ASSERT v_count >= 3, format('expected ≥3 designers in the ranking, got %s', v_count);

  SELECT * INTO v_row
    FROM match_designers_for_client('ae4b0000-0000-4000-8000-00000000ce01') m
   WHERE m.designer_id = u_designer;
  ASSERT abs(v_row.similarity - 1.0) < 1e-4,
    format('aligned vectors must read sim=1.0 (½(1+cos)), got %s', v_row.similarity);
  ASSERT v_row.confidence ? 'score' AND v_row.confidence ? 'n' AND v_row.confidence ? 'label',
    'confidence must carry {score, n, label} — never a bare number (§9.3)';
  ASSERT (v_row.confidence->>'n')::int = 30, 'n must be the judgments count';
  ASSERT v_row.confidence->>'label' IN ('early read', 'good', 'strong'), 'label must be a §10.6 band';

  SELECT * INTO v_row
    FROM match_designers_for_client('ae4b0000-0000-4000-8000-00000000ce01') m
   WHERE m.designer_id = u_lead;
  ASSERT FOUND, 'portfolio-only designers must rank via the centroid fallback';
  ASSERT abs(v_row.similarity - 0.0) < 1e-4,
    format('opposed vectors must read sim=0.0, got %s', v_row.similarity);

  -- ordering: aligned first.
  SELECT m.designer_id INTO v_id
    FROM match_designers_for_client('ae4b0000-0000-4000-8000-00000000ce01') m
   LIMIT 1;
  ASSERT v_id = u_designer, 'ranking must be similarity-desc';

  -- unclaimed profile: any authenticated holder of the key may call.
  SELECT count(*) INTO v_count
    FROM match_designers_for_client('ae4b0000-0000-4000-8000-00000000ce02');
  ASSERT v_count >= 3, 'unclaimed session_key is a bearer capability';

  -- NULL style_vector → empty set, not an error.
  PERFORM pg_temp.reset_role();
  PERFORM pg_temp.assume_user(u_client);
  SELECT count(*) INTO v_count
    FROM match_designers_for_client('ae4b0000-0000-4000-8000-00000000ce03');
  ASSERT v_count = 0, 'profiles without a style_vector return an empty set (00243 law)';

  -- foreign claimed key → 42501.
  PERFORM pg_temp.reset_role();
  PERFORM pg_temp.assume_user(u_mgr);
  v_caught := false;
  BEGIN
    SELECT count(*) INTO v_count
      FROM match_designers_for_client('ae4b0000-0000-4000-8000-00000000ce01');
  EXCEPTION WHEN insufficient_privilege THEN v_caught := true;
  END;
  ASSERT v_caught, 'a claimed session_key must be owner-only (or lead)';

  -- unknown key → P0002.
  v_caught := false;
  BEGIN
    SELECT count(*) INTO v_count
      FROM match_designers_for_client('ae4b0000-0000-4000-8000-00000000dead');
  EXCEPTION WHEN no_data_found THEN v_caught := true;
  END;
  ASSERT v_caught, 'unknown session_key must raise P0002';
  PERFORM pg_temp.reset_role();

  -- anon: EXECUTE denied outright.
  PERFORM pg_temp.assume_anon();
  v_caught := false;
  BEGIN
    SELECT count(*) INTO v_count
      FROM match_designers_for_client('ae4b0000-0000-4000-8000-00000000ce01');
  EXCEPTION WHEN insufficient_privilege THEN v_caught := true;
  END;
  ASSERT v_caught, 'anon must have no EXECUTE on match_designers_for_client';
  PERFORM pg_temp.reset_role();

  -- retired designers never rank: retire u_lead and re-check.
  UPDATE designer_taste_profiles SET retired_at = now() WHERE designer_id = u_lead;
  PERFORM pg_temp.assume_user(u_client);
  SELECT count(*) INTO v_count
    FROM match_designers_for_client('ae4b0000-0000-4000-8000-00000000ce01') m
   WHERE m.designer_id = u_lead;
  ASSERT v_count = 0, 'retired designers must be excluded from matching';
  PERFORM pg_temp.reset_role();
  UPDATE designer_taste_profiles SET retired_at = NULL WHERE designer_id = u_lead;
  RAISE NOTICE 'Case 6 ok: match_designers_for_client (endpoints, fallback, confidence shape, access)';

  -- Case 7: nightly wrapper + cron registration.
  -- u_mgr's items are embedded; deleting the profile makes it stale by
  -- construction → phase 1 recreates it. u_designer has fresh snapshots →
  -- phase 2 derives.
  DELETE FROM designer_taste_profiles WHERE designer_id = u_mgr;
  v_res := aesthete_house_portfolio_nightly();
  ASSERT (v_res->>'centroids_recomputed')::int >= 1,
    format('nightly must recompute at least the stale fixture designer: %s', v_res);
  ASSERT (v_res->>'biases_derived_for')::int >= 1,
    format('nightly must derive for the fresh-snapshot designer: %s', v_res);
  SELECT count(*) INTO v_count FROM designer_taste_profiles
   WHERE designer_id = u_mgr AND portfolio_centroid IS NOT NULL;
  ASSERT v_count = 1, 'nightly phase 1 must land the missing centroid/profile';

  SELECT count(*) INTO v_count FROM cron.job WHERE jobname = 'aesthete-house-portfolio';
  ASSERT v_count = 1, 'the 03:15 cron must be registered';
  RAISE NOTICE 'Case 7 ok: nightly wrapper + cron';

  RAISE NOTICE '── house_portfolio_test: ALL CASES PASSED ──';
END $test$;

ROLLBACK;
