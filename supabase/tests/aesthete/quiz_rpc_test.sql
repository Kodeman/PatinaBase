-- ═══════════════════════════════════════════════════════════════════════════
-- Client quiz tests (migration 00243) — submit/claim RPCs, loadings math,
-- versioning, rate limits, vector assembly, RLS fix, FKs, janitor
--
-- Exercises design §5.3 + §5.6 + §7.1 + §7.2 + §4.3 + §12.5:
--   1. Happy-path anon submit returns the full §7.1 shape: all six
--      spectrums + the per-dimension confidence map + archetype
--      (primary/secondary/confidence) + budget + material_affinities +
--      catalyst passthrough.
--   2. Loadings math spot-checks (§7.2): warm_minimal + weathered_oak +
--      heirloom (+ family) → warmth 0.74 > 0, craftsmanship 0.63 > 0,
--      budget 500000–1500000 cents, patina_affinity ≥ 0.4; c_warmth 0.74.
--   3. Validation: missing keys, unknown Q1 option, > 8 KB answers all
--      raise; unknown catalyst is lenient (zero-loading passthrough).
--   4. Resubmit same session_key → version 2, exactly one is_current.
--   5. Session-key rate limit trips at the 4th submit within the hour.
--   6. §4.3 vector assembly: NULL with empty style_centroids; centroid-only
--      fallback once centroids exist (weights renormalized); 50/50 blend
--      when a quiz-image embedding is present.
--   7. Claim flow: binds user_id on profiles + sessions, stamps
--      conversion_event=signup, upserts client_profiles, bridges
--      user_style_signals on the documented mapping; idempotent re-claim;
--      refuses foreign claim + foreign authed resubmit; unknown key raises.
--   8. RLS (§5.6/§12.5): anon reads 0 rows from quiz_sessions /
--      client_style_profiles / quiz_option_loadings and cannot INSERT
--      quiz_sessions; owner sees own rows; assigned designer sees the
--      client's profile; an unrelated authed user sees none.
--   9. FK presence on taste_judgments/taste_corrections.client_profile_id
--      (deferred from 00242, added by 00243).
--  10. Janitor: purges unclaimed anon rows > 90 days + rate rows > 1 day;
--      keeps claimed rows and judgment-referenced anon profiles.
--
-- Uses the seeded dev accounts (supabase/seed/dev-accounts.sql):
--   designer@patina.dev  a0000000-0000-0000-0000-000000000004 (paired with client)
--   client@patina.dev    a0000000-0000-0000-0000-000000000005
--   manufacturer@patina.dev a0000000-0000-0000-0000-000000000006 (unrelated)
-- Run after `supabase db reset` so seeds are present.
--
-- How to run:
--   docker exec -i supabase_db_supabase psql -U postgres -d postgres \
--     -v ON_ERROR_STOP=1 < supabase/tests/aesthete/quiz_rpc_test.sql
--
-- The script wraps everything in a single transaction and ROLLBACKs at the
-- end so it can be re-run without side effects.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─── helpers ───────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION pg_temp.assume_user(p_user_id UUID)
RETURNS VOID AS $$
BEGIN
  PERFORM set_config('role', 'authenticated', true);
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object(
      'sub',  p_user_id::text,
      'role', 'authenticated'
    )::text,
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

-- ─── fixtures ──────────────────────────────────────────────────────────────

-- Cases 2j/6 premise: vector assembly starts from an EMPTY style_centroids.
-- A bare reset satisfies that; a demo-seeded / nightly-refreshed DB may not —
-- pin it inside the transaction (rolled back).
DELETE FROM style_centroids;

-- Products for the janitor's engagement-reference case (a judgment citing an
-- anon profile must protect it from the purge).
INSERT INTO products (id, name, source_url, captured_by, captured_at, layer, patina_managed, status)
VALUES
  ('ae430000-0000-4000-8000-000000000001', 'Quiz test oak shelf',   'http://test.invalid/q1', 'a0000000-0000-0000-0000-000000000004', NOW(), 'catalog', TRUE, 'published'),
  ('ae430000-0000-4000-8000-000000000002', 'Quiz test steel shelf', 'http://test.invalid/q2', 'a0000000-0000-0000-0000-000000000004', NOW(), 'catalog', TRUE, 'published');

-- ─── assertions ────────────────────────────────────────────────────────────

DO $$
DECLARE
  u_designer UUID := 'a0000000-0000-0000-0000-000000000004';
  u_client   UUID := 'a0000000-0000-0000-0000-000000000005';
  u_other    UUID := 'a0000000-0000-0000-0000-000000000006';
  key1 UUID := 'ae430000-aaaa-4000-8000-000000000001';
  key2 UUID := 'ae430000-aaaa-4000-8000-000000000002';
  key3 UUID := 'ae430000-aaaa-4000-8000-000000000003';
  key4 UUID := 'ae430000-aaaa-4000-8000-000000000004';
  key5 UUID := 'ae430000-aaaa-4000-8000-000000000005';
  key_janitor UUID := 'ae430000-aaaa-4000-8000-00000000000a';
  key_engaged UUID := 'ae430000-aaaa-4000-8000-00000000000b';
  p1 UUID := 'ae430000-0000-4000-8000-000000000001';
  p2 UUID := 'ae430000-0000-4000-8000-000000000002';
  combo jsonb := '{"visual_resonance": "warm_minimal", "lifestyle": ["family"], "material": "weathered_oak", "investment": "heirloom", "catalyst": "new_home"}';
  v_json jsonb;
  v_count int;
  v_real real;
  v_dim text;
  v_e1 vector; v_e2 vector; v_e3 vector; v_e4 vector;
  v_wm uuid; v_jp uuid; v_sc uuid;
  v_vec vector;
  v_profile_id uuid;
  v_old_profile uuid;
  v_norm double precision;
BEGIN
  -- Case 0: preconditions — dev accounts, seeded loadings, designer↔client pair.
  SELECT count(*) INTO v_count FROM auth.users WHERE id IN (u_designer, u_client, u_other);
  ASSERT v_count = 3,
    'FAIL 0a: dev accounts seed missing (run supabase db reset), got ' || v_count || ' of 3';
  SELECT count(*) INTO v_count FROM quiz_option_loadings;
  ASSERT v_count = 22,
    'FAIL 0b: expected the 22 seeded loadings rows (4 Q1 + 4 Q2 + 5 Q3 + 4 Q4 + 5 Q5), got ' || v_count;
  SELECT count(*) INTO v_count FROM designer_clients
   WHERE designer_id = u_designer AND client_id = u_client;
  ASSERT v_count >= 1,
    'FAIL 0c: seeded designer↔client pair missing (designer-clients.sql), got ' || v_count;
  SELECT count(*) INTO v_count FROM style_centroids;
  ASSERT v_count = 0,
    'FAIL 0d: style_centroids must be empty here (pinned by the fixture DELETE), got ' || v_count;

  SELECT id INTO v_wm FROM styles WHERE name = 'Warm Modern';
  SELECT id INTO v_jp FROM styles WHERE name = 'Japandi';
  SELECT id INTO v_sc FROM styles WHERE name = 'Scandinavian Minimal';
  ASSERT v_wm IS NOT NULL AND v_jp IS NOT NULL AND v_sc IS NOT NULL,
    'FAIL 0e: 00006 archetype styles missing';

  -- Basis vectors for deterministic §4.3 assembly checks.
  SELECT ('[' || string_agg(CASE WHEN i = 1 THEN '1' ELSE '0' END, ',' ORDER BY i) || ']')::vector
    INTO v_e1 FROM generate_series(1, 768) i;
  SELECT ('[' || string_agg(CASE WHEN i = 2 THEN '1' ELSE '0' END, ',' ORDER BY i) || ']')::vector
    INTO v_e2 FROM generate_series(1, 768) i;
  SELECT ('[' || string_agg(CASE WHEN i = 3 THEN '1' ELSE '0' END, ',' ORDER BY i) || ']')::vector
    INTO v_e3 FROM generate_series(1, 768) i;
  SELECT ('[' || string_agg(CASE WHEN i = 4 THEN '1' ELSE '0' END, ',' ORDER BY i) || ']')::vector
    INTO v_e4 FROM generate_series(1, 768) i;

  -- Case 1: happy-path anon submit → full §7.1 shape.
  PERFORM pg_temp.assume_anon();
  v_json := submit_style_quiz(key1, combo, '{"q1_ms": 4200}', 'web', '{"utm_source": "test"}');
  PERFORM pg_temp.reset_role();

  ASSERT v_json ? 'profile_id' AND v_json ? 'session_key' AND v_json ? 'archetype'
     AND v_json ? 'spectrums' AND v_json ? 'budget' AND v_json ? 'material_affinities'
     AND v_json ? 'catalyst' AND v_json ? 'spectrum_confidence',
    'FAIL 1a: §7.1 response keys missing, got ' || (SELECT string_agg(k, ',') FROM jsonb_object_keys(v_json) k);
  FOREACH v_dim IN ARRAY ARRAY['warmth','complexity','formality','timelessness','boldness','craftsmanship'] LOOP
    ASSERT v_json->'spectrums' ? v_dim,
      'FAIL 1b: spectrum "' || v_dim || '" missing from the response';
    ASSERT v_json->'spectrum_confidence' ? v_dim,
      'FAIL 1c: confidence for "' || v_dim || '" missing from the response';
  END LOOP;
  ASSERT v_json->'archetype'->>'primary' = 'Warm Modern',
    'FAIL 1d: primary archetype should be Warm Modern, got ' || (v_json->'archetype'->>'primary');
  ASSERT v_json->'archetype'->>'secondary' = 'Japandi',
    'FAIL 1e: secondary archetype should be Japandi, got ' || (v_json->'archetype'->>'secondary');
  ASSERT abs((v_json->'archetype'->>'confidence')::real - 0.5) < 0.001,
    'FAIL 1f: archetype confidence should be the primary share 0.5, got ' || (v_json->'archetype'->>'confidence');
  ASSERT v_json->>'catalyst' = 'new_home',
    'FAIL 1g: catalyst should pass through, got ' || (v_json->>'catalyst');

  -- Case 2: §7.2 loadings math spot-checks.
  -- warmth  = 1.0·0.6 + 0.7·0.2            = 0.74
  -- craft   = 1.0·0.3 + 0.7·0.3 + 0.3·0.4  = 0.63
  -- complex = 1.0·(−0.5)                    = −0.5
  -- timeless= 1.0·0.3 + 0.7·0.2 + 0.3·0.3   = 0.53
  -- formality = 1.0·(−0.2) + 0.3·(−0.2)     = −0.26
  ASSERT abs((v_json->'spectrums'->>'warmth')::real - 0.74) < 0.001,
    'FAIL 2a: warmth should be 0.74, got ' || (v_json->'spectrums'->>'warmth');
  ASSERT abs((v_json->'spectrums'->>'craftsmanship')::real - 0.63) < 0.001,
    'FAIL 2b: craftsmanship should be 0.63, got ' || (v_json->'spectrums'->>'craftsmanship');
  ASSERT abs((v_json->'spectrums'->>'complexity')::real - (-0.5)) < 0.001,
    'FAIL 2c: complexity should be −0.5, got ' || (v_json->'spectrums'->>'complexity');
  ASSERT abs((v_json->'spectrums'->>'timelessness')::real - 0.53) < 0.001,
    'FAIL 2d: timelessness should be 0.53, got ' || (v_json->'spectrums'->>'timelessness');
  ASSERT abs((v_json->'spectrums'->>'formality')::real - (-0.26)) < 0.001,
    'FAIL 2e: formality should be −0.26, got ' || (v_json->'spectrums'->>'formality');
  ASSERT (v_json->'budget'->>'min_cents')::int = 500000
     AND (v_json->'budget'->>'max_cents')::int = 1500000
     AND v_json->'budget'->>'label' = 'Heirloom'
     AND abs((v_json->'budget'->>'value_orientation')::real - 0.7) < 0.001,
    'FAIL 2f: heirloom budget should be 500000–1500000 / Heirloom / ω 0.7, got ' || (v_json->'budget')::text;
  ASSERT (v_json->>'patina_affinity')::real >= 0.4,
    'FAIL 2g: weathered_oak should load patina_affinity ≥ 0.4, got ' || (v_json->>'patina_affinity');
  ASSERT abs((v_json->'material_affinities'->>'wood')::real - 0.9) < 0.001,
    'FAIL 2h: wood affinity should be 0.9, got ' || (v_json->'material_affinities'->>'wood');
  -- c_warmth = min(1, 0.6·1.0 + 0.2·0.7) = 0.74
  ASSERT abs((v_json->'spectrum_confidence'->>'warmth')::real - 0.74) < 0.001,
    'FAIL 2i: c_warmth should be 0.74, got ' || (v_json->'spectrum_confidence'->>'warmth');

  -- DB state: quiz_sessions + client_style_profiles rows landed, anon,
  -- v1 current, style_vector NULL (empty style_centroids — §4.3 fallback).
  SELECT count(*) INTO v_count FROM client_style_profiles
   WHERE session_key = key1 AND is_current AND version = 1
     AND user_id IS NULL AND archetype_primary = v_wm AND style_vector IS NULL;
  ASSERT v_count = 1,
    'FAIL 2j: v1 anon current profile with Warm Modern primary + NULL style_vector expected, got ' || v_count;
  SELECT count(*) INTO v_count FROM quiz_sessions q
   JOIN client_style_profiles p ON p.quiz_session_id = q.id
   WHERE p.session_key = key1 AND q.user_id IS NULL
     AND q.responses->'answers'->>'material' = 'weathered_oak'
     AND q.responses->>'source' = 'web';
  ASSERT v_count = 1,
    'FAIL 2k: the quiz_sessions row should carry answers + source, got ' || v_count;

  -- Case 3: validation.
  PERFORM pg_temp.assume_anon();
  BEGIN
    PERFORM submit_style_quiz(key2, '{"visual_resonance": "warm_minimal"}');
    RAISE EXCEPTION 'FAIL 3a: missing answer keys should raise';
  EXCEPTION WHEN raise_exception THEN NULL;
  END;
  BEGIN
    PERFORM submit_style_quiz(key2, jsonb_set(combo, '{visual_resonance}', '"neon_futurist"'));
    RAISE EXCEPTION 'FAIL 3b: unknown visual_resonance option should raise';
  EXCEPTION WHEN raise_exception THEN NULL;
  END;
  BEGIN
    PERFORM submit_style_quiz(key2, combo || jsonb_build_object('padding', repeat('x', 9000)));
    RAISE EXCEPTION 'FAIL 3c: > 8 KB answers should raise';
  EXCEPTION WHEN raise_exception THEN NULL;
  END;
  -- Unknown catalyst is lenient (provisional Q5 vocab): succeeds, passes through.
  v_json := submit_style_quiz(key2, jsonb_set(combo, '{catalyst}', '"word_of_mouth"'));
  ASSERT v_json->>'catalyst' = 'word_of_mouth',
    'FAIL 3d: unknown catalyst should pass through with zero loading, got ' || (v_json->>'catalyst');
  PERFORM pg_temp.reset_role();

  -- Case 4: resubmit same session_key → version 2, exactly one is_current.
  PERFORM pg_temp.assume_anon();
  v_json := submit_style_quiz(key1, combo);
  PERFORM pg_temp.reset_role();
  ASSERT (v_json->>'version')::int = 2,
    'FAIL 4a: resubmit should land version 2, got ' || (v_json->>'version');
  SELECT count(*) INTO v_count FROM client_style_profiles WHERE session_key = key1;
  ASSERT v_count = 2,
    'FAIL 4b: two versions should exist for key1, got ' || v_count;
  SELECT count(*) INTO v_count FROM client_style_profiles WHERE session_key = key1 AND is_current;
  ASSERT v_count = 1,
    'FAIL 4c: exactly one is_current for key1, got ' || v_count;
  SELECT count(*) INTO v_count FROM client_style_profiles
   WHERE session_key = key1 AND is_current AND version = 2;
  ASSERT v_count = 1,
    'FAIL 4d: the current row should be version 2, got ' || v_count;

  -- Case 5: session-key rate limit — 3rd submit passes, 4th trips.
  PERFORM pg_temp.assume_anon();
  v_json := submit_style_quiz(key1, combo);   -- 3rd within the hour
  ASSERT (v_json->>'version')::int = 3,
    'FAIL 5a: third submit should land version 3, got ' || (v_json->>'version');
  BEGIN
    PERFORM submit_style_quiz(key1, combo);   -- 4th trips
    RAISE EXCEPTION 'FAIL 5b: the 4th submit on one session_key within the hour should be rate-limited';
  EXCEPTION WHEN raise_exception THEN NULL;
  END;
  PERFORM pg_temp.reset_role();

  -- Case 5c: IP backstop — a pre-loaded hour window at n=10 trips the 11th.
  INSERT INTO quiz_rate_limits (ip_hash, window_start, n)
  VALUES (md5('203.0.113.9'), date_trunc('hour', now()), 10);
  PERFORM set_config('request.headers', '{"x-forwarded-for": "203.0.113.9, 10.0.0.1"}', true);
  PERFORM pg_temp.assume_anon();
  BEGIN
    PERFORM submit_style_quiz(key3, combo);
    RAISE EXCEPTION 'FAIL 5c: the 11th submission from one IP within the hour should be rate-limited';
  EXCEPTION WHEN raise_exception THEN NULL;
  END;
  PERFORM pg_temp.reset_role();
  PERFORM set_config('request.headers', NULL, true);

  -- Case 6a: §4.3 centroid-only fallback once style_centroids exist.
  INSERT INTO style_centroids (style_id, centroid, n_products)
  VALUES (v_wm, v_e1, 10), (v_jp, v_e2, 10), (v_sc, v_e3, 10);

  PERFORM pg_temp.assume_anon();
  v_json := submit_style_quiz(key3, combo);
  PERFORM pg_temp.reset_role();
  SELECT style_vector INTO v_vec FROM client_style_profiles
   WHERE session_key = key3 AND is_current;
  ASSERT v_vec IS NOT NULL, 'FAIL 6a1: style_vector should assemble once centroids exist';
  v_norm := abs(vector_norm(v_vec) - 1.0);
  ASSERT v_norm < 0.001,
    'FAIL 6a2: style_vector should be unit-norm, |norm−1| = ' || v_norm;
  -- normalize(0.5·e1 + 0.3·e2 + 0.2·e3): component 1 = 0.5/√0.38 ≈ 0.8111
  ASSERT abs((v_vec::real[])[1] - 0.8111) < 0.001,
    'FAIL 6a3: centroid-only vector[1] should be 0.8111, got ' || (v_vec::real[])[1];
  ASSERT abs((v_vec::real[])[2] - 0.4867) < 0.001,
    'FAIL 6a4: centroid-only vector[2] should be 0.4867, got ' || (v_vec::real[])[2];

  -- Case 6b: 50/50 blend once a quiz-image embedding exists.
  UPDATE quiz_option_loadings SET image_embedding = v_e4
   WHERE question_key = 'visual_resonance' AND option_key = 'warm_minimal';
  PERFORM pg_temp.assume_anon();
  v_json := submit_style_quiz(key4, combo);
  PERFORM pg_temp.reset_role();
  SELECT style_vector INTO v_vec FROM client_style_profiles
   WHERE session_key = key4 AND is_current;
  -- normalize(0.5·e4 + 0.5·arch): component 4 = 0.5/√0.5 ≈ 0.7071,
  -- component 1 = 0.5·0.8111/√0.5 ≈ 0.5736.
  ASSERT abs((v_vec::real[])[4] - 0.7071) < 0.001,
    'FAIL 6b1: blended vector[4] should be 0.7071, got ' || (v_vec::real[])[4];
  ASSERT abs((v_vec::real[])[1] - 0.5736) < 0.001,
    'FAIL 6b2: blended vector[1] should be 0.5736, got ' || (v_vec::real[])[1];
  UPDATE quiz_option_loadings SET image_embedding = NULL
   WHERE question_key = 'visual_resonance' AND option_key = 'warm_minimal';

  -- Case 7a: claim binds + stamps + upserts + bridges.
  PERFORM pg_temp.assume_user(u_client);
  v_json := claim_quiz_session(key1);
  PERFORM pg_temp.reset_role();
  ASSERT (v_json->>'claimed_profiles')::int = 3,
    'FAIL 7a1: all 3 key1 versions should bind, got ' || (v_json->>'claimed_profiles');
  ASSERT (v_json->>'claimed_sessions')::int = 3,
    'FAIL 7a2: all 3 key1 quiz_sessions should bind, got ' || (v_json->>'claimed_sessions');
  ASSERT (v_json->>'bridged_style_signals')::boolean,
    'FAIL 7a3: user_style_signals should bridge (profiles row exists for the client)';
  SELECT count(*) INTO v_count FROM client_style_profiles
   WHERE session_key = key1 AND user_id = u_client;
  ASSERT v_count = 3,
    'FAIL 7a4: every key1 version should carry the claiming user, got ' || v_count;
  SELECT count(*) INTO v_count FROM quiz_sessions q
   JOIN client_style_profiles p ON p.quiz_session_id = q.id
   WHERE p.session_key = key1 AND q.user_id = u_client AND q.conversion_event = 'signup';
  ASSERT v_count = 3,
    'FAIL 7a5: claimed sessions should be bound + stamped signup, got ' || v_count;

  -- client_profiles upsert (via the 00243-added user_id key).
  SELECT count(*) INTO v_count FROM client_profiles
   WHERE user_id = u_client AND archetype = 'Warm Modern'
     AND (budget_range->>'min')::int = 5000 AND (budget_range->>'max')::int = 15000
     AND style_preferences[1] = v_wm
     AND quiz_responses->>'material' = 'weathered_oak';
  ASSERT v_count = 1,
    'FAIL 7a6: client_profiles should upsert archetype/budget/style_preferences/quiz_responses, got ' || v_count;

  -- user_style_signals bridge (documented mapping):
  --   warmth (0.74+1)/2 = 0.87 · texture wood-only = 0.7 ·
  --   openness (1−(−0.5))/2 + 0.1 kids_pets = 0.85 · light 0.5 ·
  --   warm / relaxed / minimal.
  SELECT count(*) INTO v_count FROM user_style_signals
   WHERE user_id = u_client
     AND abs(warmth_preference - 0.87) < 0.005
     AND abs(texture_preference - 0.7) < 0.005
     AND abs(openness_preference - 0.85) < 0.005
     AND abs(natural_light_preference - 0.5) < 0.005
     AND color_temperature = 'warm'
     AND formality_level = 'relaxed'
     AND space_density = 'minimal';
  ASSERT v_count = 1,
    'FAIL 7a7: user_style_signals bridge values off — got ' || v_count || ' matching rows';

  -- Case 7b: idempotent re-claim (0 new bindings, no error).
  PERFORM pg_temp.assume_user(u_client);
  v_json := claim_quiz_session(key1);
  ASSERT (v_json->>'claimed_profiles')::int = 0 AND (v_json->>'claimed_sessions')::int = 0,
    'FAIL 7b: re-claim should bind nothing new, got ' || (v_json->>'claimed_profiles') || '/' || (v_json->>'claimed_sessions');
  PERFORM pg_temp.reset_role();

  -- Case 7c: a different user cannot claim the key.
  PERFORM pg_temp.assume_user(u_designer);
  BEGIN
    PERFORM claim_quiz_session(key1);
    RAISE EXCEPTION 'FAIL 7c: claiming a key owned by another user should be refused';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  -- Case 7d: unknown key raises.
  BEGIN
    PERFORM claim_quiz_session(key5);
    RAISE EXCEPTION 'FAIL 7d: claiming an unknown session_key should raise';
  EXCEPTION WHEN raise_exception THEN NULL;
  END;
  PERFORM pg_temp.reset_role();

  -- Case 7e: a different AUTHED user cannot resubmit on a claimed key
  -- (bearer guard). Backdate key1's rows past the hourly window first so
  -- the rate check cannot mask the ownership check.
  UPDATE client_style_profiles SET created_at = created_at - interval '2 hours'
   WHERE session_key = key1;
  PERFORM pg_temp.assume_user(u_designer);
  BEGIN
    PERFORM submit_style_quiz(key1, combo);
    RAISE EXCEPTION 'FAIL 7e: an authed resubmit on someone else''s claimed key should be refused';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  PERFORM pg_temp.reset_role();

  -- Case 7f: the owner CAN resubmit; anon resubmit carries the claimed owner.
  PERFORM pg_temp.assume_user(u_client);
  v_json := submit_style_quiz(key1, combo);
  PERFORM pg_temp.reset_role();
  ASSERT (v_json->>'version')::int = 4,
    'FAIL 7f1: owner resubmit should land version 4, got ' || (v_json->>'version');
  PERFORM pg_temp.assume_anon();
  v_json := submit_style_quiz(key1, combo);
  PERFORM pg_temp.reset_role();
  SELECT count(*) INTO v_count FROM client_style_profiles
   WHERE session_key = key1 AND is_current AND version = 5 AND user_id = u_client;
  ASSERT v_count = 1,
    'FAIL 7f2: anon resubmit on a claimed key should carry the claimed owner forward, got ' || v_count;
  SELECT count(*) INTO v_count FROM client_style_profiles
   WHERE session_key = key1 AND is_current;
  ASSERT v_count = 1,
    'FAIL 7f3: still exactly one is_current for key1, got ' || v_count;

  -- Case 8: RLS (§5.6/§12.5).
  PERFORM pg_temp.assume_anon();
  SELECT count(*) INTO v_count FROM quiz_sessions;
  ASSERT v_count = 0,
    'FAIL 8a: anon must read 0 quiz_sessions rows, got ' || v_count;
  SELECT count(*) INTO v_count FROM client_style_profiles;
  ASSERT v_count = 0,
    'FAIL 8b: anon must read 0 client_style_profiles rows, got ' || v_count;
  SELECT count(*) INTO v_count FROM quiz_option_loadings;
  ASSERT v_count = 0,
    'FAIL 8c: anon must read 0 quiz_option_loadings rows (RPC-only), got ' || v_count;
  BEGIN
    INSERT INTO quiz_sessions (user_id, responses) VALUES (NULL, '{}');
    RAISE EXCEPTION 'FAIL 8d: anon direct INSERT into quiz_sessions should be RLS-denied';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  PERFORM pg_temp.reset_role();

  -- Owner sees own rows; assigned designer sees the client's profiles;
  -- an unrelated authed user sees none.
  PERFORM pg_temp.assume_user(u_client);
  SELECT count(*) INTO v_count FROM client_style_profiles WHERE session_key = key1;
  ASSERT v_count = 5,
    'FAIL 8e: the owner should read all 5 own key1 versions, got ' || v_count;
  SELECT count(*) INTO v_count FROM quiz_sessions WHERE user_id = u_client;
  ASSERT v_count >= 3,
    'FAIL 8f: the owner should read own quiz_sessions, got ' || v_count;
  PERFORM pg_temp.reset_role();

  PERFORM pg_temp.assume_user(u_designer);
  -- (Wave 4C: was an unscoped count of 5, which broke once the demo seed
  -- claimed a profile for the same client — now asserts the property on the
  -- suite's own rows: the assigned designer reads ALL 5 key1 versions.)
  SELECT count(*) INTO v_count FROM client_style_profiles
   WHERE user_id = u_client AND session_key = key1;
  ASSERT v_count = 5,
    'FAIL 8g: the assigned designer should read the client''s profiles, got ' || v_count;
  PERFORM pg_temp.reset_role();

  PERFORM pg_temp.assume_user(u_other);
  SELECT count(*) INTO v_count FROM client_style_profiles;
  ASSERT v_count = 0,
    'FAIL 8h: an unrelated authed user should read 0 profiles, got ' || v_count;
  PERFORM pg_temp.reset_role();

  -- Case 9: FK presence (deferred from 00242, added by 00243).
  SELECT count(*) INTO v_count
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_class ft ON ft.oid = c.confrelid
   WHERE c.contype = 'f'
     AND ft.relname = 'client_style_profiles'
     AND t.relname IN ('taste_judgments', 'taste_corrections');
  ASSERT v_count = 2,
    'FAIL 9: taste_judgments + taste_corrections should each FK client_style_profiles, got ' || v_count;

  -- Case 10: janitor.
  -- An old unclaimed anon profile+session (purged), an old ENGAGED anon
  -- profile (kept — a judgment references it), an old rate row (purged).
  PERFORM pg_temp.assume_anon();
  PERFORM submit_style_quiz(key_janitor, combo);
  PERFORM submit_style_quiz(key_engaged, combo);
  PERFORM pg_temp.reset_role();
  UPDATE client_style_profiles SET created_at = now() - interval '91 days'
   WHERE session_key IN (key_janitor, key_engaged);
  UPDATE quiz_sessions SET created_at = now() - interval '91 days'
   WHERE id IN (SELECT quiz_session_id FROM client_style_profiles
                 WHERE session_key IN (key_janitor, key_engaged));
  SELECT id INTO v_old_profile FROM client_style_profiles WHERE session_key = key_engaged;
  INSERT INTO taste_judgments (designer_id, product_a, product_b, choice, context, client_profile_id)
  VALUES (u_designer, p1, p2, 'a', 'client', v_old_profile);
  INSERT INTO quiz_rate_limits (ip_hash, window_start, n)
  VALUES (md5('198.51.100.7'), now() - interval '2 days', 4);

  v_json := aesthete_quiz_janitor();
  -- (Wave 4C: the janitor's counters are global — a live DB may carry other
  -- purgeable rows. The exactly-these-rows semantics are 10d/10e/10f below;
  -- the totals assert at-least-ours.)
  ASSERT (v_json->>'profiles')::int >= 1,
    'FAIL 10a: the unengaged old anon profile should purge, got ' || (v_json->>'profiles');
  ASSERT (v_json->>'sessions')::int >= 1,
    'FAIL 10b: the unengaged old anon session should purge, got ' || (v_json->>'sessions');
  ASSERT (v_json->>'rate_rows')::int >= 1,
    'FAIL 10c: the stale rate row should purge, got ' || (v_json->>'rate_rows');
  SELECT count(*) INTO v_count FROM client_style_profiles WHERE session_key = key_janitor;
  ASSERT v_count = 0,
    'FAIL 10d: the unclaimed old anon profile should be gone, got ' || v_count;
  SELECT count(*) INTO v_count FROM client_style_profiles WHERE session_key = key_engaged;
  ASSERT v_count = 1,
    'FAIL 10e: the judgment-referenced anon profile must survive the purge, got ' || v_count;
  SELECT count(*) INTO v_count FROM client_style_profiles WHERE session_key = key1;
  ASSERT v_count = 5,
    'FAIL 10f: claimed rows must survive the purge, got ' || v_count;

  RAISE NOTICE 'All client-quiz assertions passed.';
END
$$;

-- ROLLBACK so the test is idempotent.
ROLLBACK;
