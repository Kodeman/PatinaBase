-- ═══════════════════════════════════════════════════════════════════════════
-- Taste RPC tests (migration 00242) — judgments, probes, biases, export/
-- retire, house consensus + activation, centroids
--
-- Exercises design §8.3 + §8.5 + §9.1 + §12.5 + §18:
--   1. submit_taste_judgment: inserts (kind=judgment), bumps the
--      sources.judgments counter (creating the profile shell), validates
--      pair/choice/context; anon has no EXECUTE.
--   2. Probe mechanics (§8.3): with aesthete.probe_rate forced to 1 the
--      submit enqueues a reversed repeat due ~14 days out; once due, the
--      matching pair answers as kind=probe and closes the queue row.
--   3. submit_taste_correction inserts + bumps sources.corrections.
--   4. update_my_biases edits ONLY the override layer (status/displayed/
--      name/description), rejects learned fields outright, and cannot touch
--      another designer's rows.
--   5. export_designer_taste returns all five sections for the owner,
--      refuses non-admin others, allows admin.
--   6. compute_house_taste_draft: graceful NULL with no eligible designers;
--      lead-gated; with two eligible designers produces a draft with
--      reliability-proportional weights, element-wise weighted theta, and a
--      normalized blended vector.
--   7. activate_house_taste: lead-gated; applies PIN/NUDGE/PROTECT curated
--      overrides; retires the previous active row (exactly one active).
--   8. refresh_style_centroids: builds per-archetype centroids from
--      designer-confirmed published catalog vectors only; skips archetypes
--      with no vectors.
--   9. retire_designer_taste: tombstones the profile + snapshots,
--      hard-deletes judgments/corrections/biases/probes, and excludes the
--      designer from the next consensus draft.
--
-- Uses the seeded dev accounts (supabase/seed/dev-accounts.sql):
--   superadmin@patina.dev a0000000-0000-0000-0000-000000000001 (admin domain → lead)
--   studio@patina.dev     a0000000-0000-0000-0000-000000000003 (studio_admin, designer domain)
--   designer@patina.dev   a0000000-0000-0000-0000-000000000004 (designer domain)
-- Run after `supabase db reset` so seeds are present.
--
-- How to run:
--   docker exec -i supabase_db_supabase psql -U postgres -d postgres \
--     -v ON_ERROR_STOP=1 < supabase/tests/aesthete/taste_rpcs_test.sql
--
-- The script wraps everything in a single transaction and ROLLBACKs at the
-- end so it can be re-run without side effects. aesthete.probe_rate is set
-- transaction-locally to make the 4% probe lottery deterministic.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─── fixtures ──────────────────────────────────────────────────────────────

-- (Wave 4C) Premise pin: this suite exercises first-judgment profile-shell
-- creation and deterministic consensus/RLS math over the fixture designers.
-- A live DB may already carry learned taste state for them (demo judgments,
-- a nightly refit's profiles/snapshots/confidence rows). Clear the fixture
-- designers' taste state INSIDE the transaction (rolled back) so the suite
-- is exact on ANY baseline — bare reset, demo-seeded, or post-nightly.
DELETE FROM taste_probe_queue
 WHERE designer_id IN ('a0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000004');
DELETE FROM taste_judgments
 WHERE designer_id IN ('a0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000004');
DELETE FROM taste_corrections
 WHERE designer_id IN ('a0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000004');
DELETE FROM signature_biases
 WHERE designer_id IN ('a0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000004');
DELETE FROM designer_style_confidence
 WHERE designer_id IN ('a0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000004');
DELETE FROM designer_taste_snapshots
 WHERE designer_id IN ('a0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000004');
DELETE FROM designer_taste_profiles
 WHERE designer_id IN ('a0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000004');

-- Catalog products for judgments + one for the centroid recompute.
INSERT INTO products (id, name, source_url, captured_by, captured_at, layer, patina_managed, status)
VALUES
  ('ae5c0000-0000-4000-8000-000000000001', 'RPC test oak bench',    'http://test.invalid/rpc1', 'a0000000-0000-0000-0000-000000000004', NOW(), 'catalog', TRUE, 'published'),
  ('ae5c0000-0000-4000-8000-000000000002', 'RPC test steel bench',  'http://test.invalid/rpc2', 'a0000000-0000-0000-0000-000000000004', NOW(), 'catalog', TRUE, 'published'),
  ('ae5c0000-0000-4000-8000-000000000003', 'RPC test walnut stool', 'http://test.invalid/rpc3', 'a0000000-0000-0000-0000-000000000004', NOW(), 'catalog', TRUE, 'published');

-- A pre-existing snapshot so the export has a non-empty snapshots section
-- (and the retire test can prove the tombstone).
INSERT INTO designer_taste_snapshots (designer_id, version, taste_vector, theta, spectrums, reliability)
VALUES ('a0000000-0000-0000-0000-000000000004', 1,
        vec_normalize(array_fill(1.0::real, ARRAY[768])::vector),
        ARRAY[0.1, 0.2]::real[], '{"warmth": 0.5}', 0.4);

-- Signature biases: one for the designer (the override-layer target), one
-- for the studio manager (the cannot-touch-foreign-rows target).
INSERT INTO signature_biases (id, designer_id, feature_group, direction, learned_strength, name, status)
VALUES
  ('ae5cb000-0000-4000-8000-000000000001', 'a0000000-0000-0000-0000-000000000004', 'warmth', '+', 0.8, 'Warm lean', 'proposed'),
  ('ae5cb000-0000-4000-8000-000000000002', 'a0000000-0000-0000-0000-000000000003', 'boldness', '+', 0.6, 'Bold strokes', 'proposed');

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

-- ─── assertions ────────────────────────────────────────────────────────────

DO $$
DECLARE
  u_lead     UUID := 'a0000000-0000-0000-0000-000000000001';
  u_mgr      UUID := 'a0000000-0000-0000-0000-000000000003';
  u_designer UUID := 'a0000000-0000-0000-0000-000000000004';
  p1         UUID := 'ae5c0000-0000-4000-8000-000000000001';
  p2         UUID := 'ae5c0000-0000-4000-8000-000000000002';
  pc1        UUID := 'ae5c0000-0000-4000-8000-000000000003';
  b_own      UUID := 'ae5cb000-0000-4000-8000-000000000001';
  b_foreign  UUID := 'ae5cb000-0000-4000-8000-000000000002';
  v_e1 vector;
  v_e2 vector;
  v_json jsonb;
  v_count int;
  v_real real;
  v_arr real[];
  v_uuid uuid;
  v_style uuid;
  v_norm double precision;
  v_ver int;
  v_expected int;
  v_house_before int;
  v_prev_active_ver int;
  v_prev_formality real;
BEGIN
  -- Case 0: preconditions.
  SELECT count(*) INTO v_count FROM auth.users WHERE id IN (u_lead, u_mgr, u_designer);
  ASSERT v_count = 3,
    'FAIL 0: dev accounts seed missing (run supabase db reset), got ' || v_count || ' of 3';

  -- Basis vectors for deterministic consensus math.
  SELECT ('[' || string_agg(CASE WHEN i = 1 THEN '1' ELSE '0' END, ',' ORDER BY i) || ']')::vector
    INTO v_e1 FROM generate_series(1, 768) i;
  SELECT ('[' || string_agg(CASE WHEN i = 2 THEN '1' ELSE '0' END, ',' ORDER BY i) || ']')::vector
    INTO v_e2 FROM generate_series(1, 768) i;

  -- Case 1a: anon has no EXECUTE on the submit RPC.
  PERFORM pg_temp.assume_anon();
  BEGIN
    PERFORM submit_taste_judgment(jsonb_build_object('a', p1, 'b', p2), 'a');
    RAISE EXCEPTION 'FAIL 1a: anon executing submit_taste_judgment should be permission-denied';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  PERFORM pg_temp.reset_role();

  -- Case 1b: a designer's first judgment inserts kind=judgment and creates
  -- the profile shell with sources.judgments = 1. (Probe lottery pinned off.)
  PERFORM set_config('aesthete.probe_rate', '0', true);
  PERFORM pg_temp.assume_user(u_designer);
  v_json := submit_taste_judgment(jsonb_build_object('a', p1, 'b', p2), 'a', 'self', NULL, 850);
  ASSERT v_json->>'kind' = 'judgment',
    'FAIL 1b1: first submit should record kind=judgment, got ' || (v_json->>'kind');
  ASSERT (v_json->'sources'->>'judgments')::int = 1,
    'FAIL 1b2: sources.judgments should be 1 after first submit, got ' || (v_json->'sources'->>'judgments');
  v_json := submit_taste_judgment(jsonb_build_object('a', p2, 'b', p1), 'b');
  ASSERT (v_json->'sources'->>'judgments')::int = 2,
    'FAIL 1b3: sources.judgments should be 2 after second submit, got ' || (v_json->'sources'->>'judgments');
  PERFORM pg_temp.reset_role();

  -- (Wave 4C: scoped to the fixture pair — a demo-seeded DB carries other
  -- judgments/probes for the same designer.)
  SELECT count(*) INTO v_count FROM taste_judgments
   WHERE designer_id = u_designer AND kind = 'judgment'
     AND product_a IN (p1, p2) AND product_b IN (p1, p2);
  ASSERT v_count = 2,
    'FAIL 1b4: two judgment rows expected, got ' || v_count;
  SELECT count(*) INTO v_count FROM taste_judgments
   WHERE designer_id = u_designer AND product_a = p1 AND product_b = p2
     AND latency_ms = 850;
  ASSERT v_count = 1,
    'FAIL 1b5: latency_ms should persist, got ' || v_count || ' rows carrying it';
  SELECT count(*) INTO v_count FROM taste_probe_queue
   WHERE product_a IN (p1, p2) AND product_b IN (p1, p2);
  ASSERT v_count = 0,
    'FAIL 1b6: probe lottery pinned to 0 must enqueue nothing, got ' || v_count;

  -- Case 1c: validation — bad choice, identical pair, missing keys.
  PERFORM pg_temp.assume_user(u_designer);
  BEGIN
    PERFORM submit_taste_judgment(jsonb_build_object('a', p1, 'b', p2), 'maybe');
    RAISE EXCEPTION 'FAIL 1c1: choice=maybe should raise';
  EXCEPTION WHEN raise_exception THEN NULL;
  END;
  BEGIN
    PERFORM submit_taste_judgment(jsonb_build_object('a', p1, 'b', p1), 'a');
    RAISE EXCEPTION 'FAIL 1c2: identical products should raise';
  EXCEPTION WHEN raise_exception THEN NULL;
  END;
  BEGIN
    PERFORM submit_taste_judgment(jsonb_build_object('x', p1), 'a');
    RAISE EXCEPTION 'FAIL 1c3: a pair without a/b keys should raise';
  EXCEPTION WHEN raise_exception THEN NULL;
  END;
  PERFORM pg_temp.reset_role();

  -- Case 2a: probe enqueue (§8.3) — rate pinned to 1: the submit enqueues a
  -- REVERSED repeat due ~14 days out.
  PERFORM set_config('aesthete.probe_rate', '1', true);
  PERFORM pg_temp.assume_user(u_designer);
  v_json := submit_taste_judgment(jsonb_build_object('a', p1, 'b', p2), 'a');
  PERFORM pg_temp.reset_role();
  SELECT count(*) INTO v_count FROM taste_probe_queue
   WHERE designer_id = u_designer AND status = 'pending'
     AND product_a = p2 AND product_b = p1
     AND due_at > now() + interval '13 days';
  ASSERT v_count = 1,
    'FAIL 2a: rate=1 submit should enqueue one reversed probe due ~14 days out, got ' || v_count;

  -- Case 2b: a due probe pair is answered as kind=probe and closed.
  UPDATE taste_probe_queue SET due_at = now() - interval '1 minute'
   WHERE designer_id = u_designer AND status = 'pending'
     AND product_a = p2 AND product_b = p1;
  PERFORM set_config('aesthete.probe_rate', '0', true);
  PERFORM pg_temp.assume_user(u_designer);
  v_json := submit_taste_judgment(jsonb_build_object('a', p2, 'b', p1), 'neither');
  ASSERT v_json->>'kind' = 'probe',
    'FAIL 2b1: answering a due reversed pair should record kind=probe, got ' || (v_json->>'kind');
  PERFORM pg_temp.reset_role();
  SELECT count(*) INTO v_count FROM taste_probe_queue
   WHERE designer_id = u_designer AND status = 'answered'
     AND answered_judgment_id = (v_json->>'judgment_id')::bigint;
  ASSERT v_count = 1,
    'FAIL 2b2: the probe row should be answered + linked, got ' || v_count;
  SELECT count(*) INTO v_count FROM taste_judgments
   WHERE designer_id = u_designer AND kind = 'probe'
     AND product_a IN (p1, p2) AND product_b IN (p1, p2);
  ASSERT v_count = 1,
    'FAIL 2b3: exactly one probe-kind judgment expected, got ' || v_count;

  -- Case 3: corrections insert + bump sources.corrections.
  PERFORM pg_temp.assume_user(u_designer);
  v_json := submit_taste_correction('match', p1, p2, NULL, '{"warmth": -0.3}', 'too cold for them', 'teaching');
  ASSERT (v_json->'sources'->>'corrections')::int = 1,
    'FAIL 3a: sources.corrections should be 1, got ' || (v_json->'sources'->>'corrections');
  BEGIN
    PERFORM submit_taste_correction('vibe');
    RAISE EXCEPTION 'FAIL 3b: subject=vibe should raise';
  EXCEPTION WHEN raise_exception THEN NULL;
  END;
  PERFORM pg_temp.reset_role();
  SELECT count(*) INTO v_count FROM taste_corrections
   WHERE designer_id = u_designer AND subject = 'match'
     AND replacement_product_id = p2 AND surface = 'teaching';
  ASSERT v_count = 1,
    'FAIL 3c: the correction row should persist with its fields, got ' || v_count;

  -- Case 4a: update_my_biases edits the override layer only.
  PERFORM pg_temp.assume_user(u_designer);
  v_json := update_my_biases(jsonb_build_array(
    jsonb_build_object('id', b_own, 'status', 'muted', 'displayed_strength', 0.4)));
  ASSERT (v_json->>'updated')::int = 1,
    'FAIL 4a1: one bias should be updated, got ' || (v_json->>'updated');
  PERFORM pg_temp.reset_role();
  SELECT count(*) INTO v_count FROM signature_biases
   WHERE id = b_own AND status = 'muted'
     AND abs(displayed_strength - 0.4) < 0.000001
     AND abs(learned_strength - 0.8) < 0.000001
     AND version = 2;
  ASSERT v_count = 1,
    'FAIL 4a2: override applied, learned_strength untouched, version bumped — got ' || v_count || ' matching rows';

  -- Case 4b: learned fields are rejected outright.
  PERFORM pg_temp.assume_user(u_designer);
  BEGIN
    PERFORM update_my_biases(jsonb_build_array(
      jsonb_build_object('id', b_own, 'learned_strength', 0)));
    RAISE EXCEPTION 'FAIL 4b: learned_strength in an override should raise';
  EXCEPTION WHEN raise_exception THEN NULL;
  END;

  -- Case 4c: another designer's bias is untouchable (updated = 0).
  v_json := update_my_biases(jsonb_build_array(
    jsonb_build_object('id', b_foreign, 'status', 'muted')));
  ASSERT (v_json->>'updated')::int = 0,
    'FAIL 4c1: foreign bias rows must not update, got ' || (v_json->>'updated');
  PERFORM pg_temp.reset_role();
  SELECT count(*) INTO v_count FROM signature_biases
   WHERE id = b_foreign AND status = 'proposed' AND version = 1;
  ASSERT v_count = 1,
    'FAIL 4c2: the foreign bias must be unchanged, got ' || v_count;

  -- Case 5a: export returns all five sections for the owner.
  PERFORM pg_temp.assume_user(u_designer);
  v_json := export_designer_taste(u_designer);
  ASSERT v_json ? 'profile' AND v_json ? 'snapshots' AND v_json ? 'judgments'
     AND v_json ? 'corrections' AND v_json ? 'biases',
    'FAIL 5a1: export must carry profile/snapshots/judgments/corrections/biases';
  -- (Wave 4C: "all rows" is the property — the absolute totals differ on a
  -- demo-seeded DB. The fixture floor keeps the assertions non-vacuous.)
  SELECT count(*) INTO v_count FROM taste_judgments WHERE designer_id = u_designer;
  ASSERT jsonb_array_length(v_json->'judgments') = v_count AND v_count >= 4,
    'FAIL 5a2: export should carry ALL ' || v_count || ' judgments, got ' || jsonb_array_length(v_json->'judgments');
  SELECT count(*) INTO v_count FROM designer_taste_snapshots WHERE designer_id = u_designer;
  ASSERT jsonb_array_length(v_json->'snapshots') = v_count AND v_count >= 1,
    'FAIL 5a3: export should carry ALL ' || v_count || ' snapshots, got ' || jsonb_array_length(v_json->'snapshots');
  SELECT count(*) INTO v_count FROM taste_corrections WHERE designer_id = u_designer;
  ASSERT jsonb_array_length(v_json->'corrections') = v_count AND v_count >= 1,
    'FAIL 5a4: export should carry ALL ' || v_count || ' corrections, got ' || jsonb_array_length(v_json->'corrections');
  SELECT count(*) INTO v_count FROM signature_biases WHERE designer_id = u_designer;
  ASSERT jsonb_array_length(v_json->'biases') = v_count AND v_count >= 1,
    'FAIL 5a5: export should carry ALL ' || v_count || ' biases, got ' || jsonb_array_length(v_json->'biases');
  ASSERT (v_json->'profile') IS NOT NULL AND jsonb_typeof(v_json->'profile') = 'object',
    'FAIL 5a6: export profile section should be the profile row';

  -- Case 5b: a non-admin other user is refused.
  PERFORM pg_temp.assume_user(u_mgr);
  BEGIN
    PERFORM export_designer_taste(u_designer);
    RAISE EXCEPTION 'FAIL 5b: another designer exporting someone''s taste should be refused';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  PERFORM pg_temp.reset_role();

  -- Case 5c: an admin may export on the designer's behalf.
  PERFORM pg_temp.assume_user(u_lead);
  v_json := export_designer_taste(u_designer);
  ASSERT v_json->>'designer_id' = u_designer::text,
    'FAIL 5c: admin export should target the designer, got ' || (v_json->>'designer_id');
  PERFORM pg_temp.reset_role();

  -- Case 6a: compute_house_taste_draft is lead-gated.
  PERFORM pg_temp.assume_user(u_designer);
  BEGIN
    PERFORM compute_house_taste_draft();
    RAISE EXCEPTION 'FAIL 6a: non-lead compute_house_taste_draft should be refused';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  PERFORM pg_temp.reset_role();

  -- (Wave 4C) Consensus scope pin: compute_house_taste_draft is global —
  -- on a baseline where OTHER designers carry eligible learned profiles
  -- (e.g. after a nightly refit) the fixture weight math below would shift.
  -- Retire everyone but the two fixture designers INSIDE the transaction.
  UPDATE designer_taste_profiles SET retired_at = now()
   WHERE designer_id NOT IN (u_designer, u_mgr) AND retired_at IS NULL;

  -- Case 6b: with no eligible designers it no-ops gracefully (NULL, no row).
  -- (The designer's profile exists from the submits but sits at the default
  -- reliability 0.15 with 4 judgments — ineligible on both counts.)
  SELECT count(*) INTO v_house_before FROM house_taste;
  PERFORM pg_temp.assume_user(u_lead);
  v_uuid := compute_house_taste_draft();
  ASSERT v_uuid IS NULL,
    'FAIL 6b1: no eligible designers should return NULL, got ' || COALESCE(v_uuid::text, 'NULL');
  PERFORM pg_temp.reset_role();
  SELECT count(*) INTO v_count FROM house_taste;
  ASSERT v_count = v_house_before,
    'FAIL 6b2: no draft row should be created, house_taste count went ' || v_house_before || ' -> ' || v_count;

  -- Case 6c: two eligible designers → deterministic consensus draft.
  -- designer: reliability .9, theta [1,0,.5], vector e1, warmth .5
  -- manager:  reliability .6, theta [0,1,.5], vector e2, warmth -.5
  -- weights → .6/.4 (cap skipped below 3 designers, by design).
  UPDATE designer_taste_profiles
     SET reliability = 0.9, theta = ARRAY[1, 0, 0.5]::real[],
         taste_vector = v_e1, warmth = 0.5, boldness = 0.2,
         formality = 0.3, craftsmanship = 0.4,
         sources = '{"judgments": 100}'::jsonb
   WHERE designer_id = u_designer;
  INSERT INTO designer_taste_profiles
    (designer_id, reliability, theta, taste_vector, warmth, boldness, formality, craftsmanship, sources)
  VALUES
    (u_mgr, 0.6, ARRAY[0, 1, 0.5]::real[], v_e2, -0.5, 0.2, 0.3, 0.4, '{"judgments": 60}'::jsonb);

  SELECT COALESCE(max(version), 0) + 1 INTO v_ver FROM house_taste;
  PERFORM pg_temp.assume_user(u_lead);
  v_uuid := compute_house_taste_draft();
  ASSERT v_uuid IS NOT NULL, 'FAIL 6c1: two eligible designers should produce a draft';
  PERFORM pg_temp.reset_role();

  SELECT count(*) INTO v_count FROM house_taste
   WHERE id = v_uuid AND version = v_ver AND status = 'draft';
  ASSERT v_count = 1,
    'FAIL 6c2: the draft should land as version ' || v_ver || ' / status draft, got ' || v_count;
  SELECT count(*) INTO v_count FROM house_taste h
   WHERE h.id = v_uuid
     AND h.computed_from ? u_designer::text
     AND h.computed_from ? u_mgr::text;
  ASSERT v_count = 1,
    'FAIL 6c3: computed_from should snapshot both designers'' weights, got ' || v_count;

  SELECT theta INTO v_arr FROM house_taste WHERE id = v_uuid;
  ASSERT abs(v_arr[1] - 0.6) < 0.001 AND abs(v_arr[2] - 0.4) < 0.001 AND abs(v_arr[3] - 0.5) < 0.001,
    'FAIL 6c4: theta should be the .6/.4 weighted mean [0.6,0.4,0.5], got ' || v_arr::text;

  SELECT warmth INTO v_real FROM house_taste WHERE id = v_uuid;
  ASSERT abs(v_real - 0.1) < 0.001,
    'FAIL 6c5: warmth should blend to 0.1, got ' || v_real;

  SELECT abs(vector_norm(taste_vector) - 1.0),
         abs((taste_vector::real[])[1] - 0.83205)
    INTO v_norm, v_real
    FROM house_taste WHERE id = v_uuid;
  ASSERT v_norm < 0.001,
    'FAIL 6c6: the blended vector should be unit-norm, |norm-1| = ' || v_norm;
  ASSERT v_real < 0.001,
    'FAIL 6c7: blended vector[1] should be 0.6/|0.6e1+0.4e2| = 0.83205, off by ' || v_real;

  -- Case 7a: activation is lead-gated.
  PERFORM pg_temp.assume_user(u_designer);
  BEGIN
    PERFORM activate_house_taste(v_ver);
    RAISE EXCEPTION 'FAIL 7a: non-lead activate_house_taste should be refused';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  PERFORM pg_temp.reset_role();

  -- Case 7b: curated overrides — PIN warmth 0.55, NUDGE boldness −0.1,
  -- PROTECT formality (keeps the previously-ACTIVE coordinate — captured
  -- below rather than assumed to be v1's 0, Wave 4C).
  UPDATE house_taste
     SET curated_overrides = '{
       "warmth":    {"op": "pin",     "value": 0.55},
       "boldness":  {"op": "nudge",   "delta": -0.1},
       "formality": {"op": "protect"}
     }'::jsonb
   WHERE id = v_uuid;

  SELECT version, COALESCE(formality, 0) INTO v_prev_active_ver, v_prev_formality
    FROM house_taste WHERE status = 'active';

  PERFORM pg_temp.assume_user(u_lead);
  PERFORM activate_house_taste(v_ver);
  PERFORM pg_temp.reset_role();

  SELECT count(*) INTO v_count FROM house_taste WHERE status = 'active';
  ASSERT v_count = 1,
    'FAIL 7b1: exactly one active house after activation, got ' || v_count;
  SELECT count(*) INTO v_count FROM house_taste
   WHERE version = v_prev_active_ver AND status = 'retired';
  ASSERT v_count = 1,
    'FAIL 7b2: the previously-active version should be retired by the activation, got ' || v_count;
  SELECT count(*) INTO v_count FROM house_taste
   WHERE version = v_ver AND status = 'active'
     AND abs(warmth - 0.55) < 0.001                          -- PIN
     AND abs(boldness - 0.1) < 0.001                         -- 0.2 NUDGEd by −0.1
     AND abs(COALESCE(formality, 0) - v_prev_formality) < 0.001  -- PROTECTed
     AND abs(craftsmanship - 0.4) < 0.001;                   -- untouched consensus value
  ASSERT v_count = 1,
    'FAIL 7b3: PIN/NUDGE/PROTECT should land exactly (warmth .55, boldness .1, formality protected, craftsmanship .4), got ' || v_count;

  -- Case 8: refresh_style_centroids — designer-confirmed published catalog
  -- vectors only; archetypes without vectors are skipped. (Wave 4C: the
  -- fixture targets an archetype with NO qualifying products, and totals are
  -- computed against the fn's own predicate — exact on any baseline.)
  SELECT s.id INTO v_style FROM styles s
   WHERE s.is_archetype = TRUE
     AND NOT EXISTS (
       SELECT 1 FROM product_styles ps
         JOIN products p ON p.id = ps.product_id
        WHERE ps.style_id = s.id
          AND ps.source IN ('manual', 'validated')
          AND p.layer = 'catalog' AND p.status = 'published'
          AND p.aesthete_vector IS NOT NULL)
   ORDER BY s.name LIMIT 1;
  ASSERT v_style IS NOT NULL,
    'FAIL 8a: no qualifying-vector-free archetype style available (00006 missing?)';
  UPDATE products SET aesthete_vector = v_e1 WHERE id = pc1;
  INSERT INTO product_styles (product_id, style_id, assigned_by, source)
  VALUES (pc1, v_style, u_designer, 'validated');

  SELECT count(DISTINCT s.id) INTO v_expected
    FROM styles s
    JOIN product_styles ps ON ps.style_id = s.id AND ps.source IN ('manual', 'validated')
    JOIN products p ON p.id = ps.product_id
   WHERE s.is_archetype = TRUE
     AND p.layer = 'catalog' AND p.status = 'published'
     AND p.aesthete_vector IS NOT NULL;

  v_count := refresh_style_centroids();
  ASSERT v_count = v_expected,
    'FAIL 8b: refresh should write one row per qualifying archetype (' || v_expected || '), wrote ' || v_count;
  SELECT count(*) INTO v_count FROM style_centroids;
  ASSERT v_count = v_expected,
    'FAIL 8c: style_centroids should hold exactly the qualifying archetypes, got ' || v_count;
  SELECT abs(vector_norm(centroid) - 1.0), n_products INTO v_norm, v_count
    FROM style_centroids WHERE style_id = v_style;
  ASSERT v_norm < 0.001 AND v_count = 1,
    'FAIL 8d: our archetype''s centroid should be unit-norm over exactly the fixture product, |norm-1|=' || v_norm || ' n=' || v_count;

  -- Case 9a: retire is owner/admin — another designer is refused.
  PERFORM pg_temp.assume_user(u_mgr);
  BEGIN
    PERFORM retire_designer_taste(u_designer);
    RAISE EXCEPTION 'FAIL 9a: another designer retiring someone''s taste should be refused';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  PERFORM pg_temp.reset_role();

  -- Case 9b: the owner retires — tombstones + hard deletes.
  PERFORM pg_temp.assume_user(u_designer);
  PERFORM retire_designer_taste(u_designer);
  PERFORM pg_temp.reset_role();

  SELECT count(*) INTO v_count FROM designer_taste_profiles
   WHERE designer_id = u_designer AND retired_at IS NOT NULL
     AND taste_vector IS NULL AND theta IS NULL AND reliability = 0;
  ASSERT v_count = 1,
    'FAIL 9b1: the profile should be tombstoned (retired_at set, learned state NULL), got ' || v_count;
  SELECT count(*) INTO v_count FROM taste_judgments WHERE designer_id = u_designer;
  ASSERT v_count = 0,
    'FAIL 9b2: judgments hard-delete on retire, got ' || v_count;
  SELECT count(*) INTO v_count FROM taste_corrections WHERE designer_id = u_designer;
  ASSERT v_count = 0,
    'FAIL 9b3: corrections hard-delete on retire, got ' || v_count;
  SELECT count(*) INTO v_count FROM signature_biases WHERE designer_id = u_designer;
  ASSERT v_count = 0,
    'FAIL 9b4: biases delete on retire, got ' || v_count;
  SELECT count(*) INTO v_count FROM taste_probe_queue WHERE designer_id = u_designer;
  ASSERT v_count = 0,
    'FAIL 9b5: probe rows delete on retire, got ' || v_count;
  SELECT count(*) INTO v_count FROM designer_taste_snapshots
   WHERE designer_id = u_designer AND (taste_vector IS NOT NULL OR theta IS NOT NULL);
  ASSERT v_count = 0,
    'FAIL 9b6a: every surviving snapshot payload must be tombstoned, ' || v_count || ' still carry state';
  SELECT count(*) INTO v_count FROM designer_taste_snapshots
   WHERE designer_id = u_designer;
  ASSERT v_count >= 1,
    'FAIL 9b6b: snapshot rows must survive the retire (audit trail), got ' || v_count;

  -- Case 9c: the retired designer is excluded from the next consensus.
  PERFORM pg_temp.assume_user(u_lead);
  v_uuid := compute_house_taste_draft();
  ASSERT v_uuid IS NOT NULL,
    'FAIL 9c1: the manager alone should still produce a draft';
  PERFORM pg_temp.reset_role();
  SELECT count(*) INTO v_count FROM house_taste h
   WHERE h.id = v_uuid
     AND h.computed_from ? u_mgr::text
     AND NOT (h.computed_from ? u_designer::text);
  ASSERT v_count = 1,
    'FAIL 9c2: the retired designer must be excluded from computed_from, got ' || v_count;

  RAISE NOTICE 'All taste RPC assertions passed.';
END
$$;

-- ROLLBACK so the test is idempotent.
ROLLBACK;
