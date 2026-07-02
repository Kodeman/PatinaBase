-- ═══════════════════════════════════════════════════════════════════════════
-- Taste foundation tests (migration 00242) — shapes, CHECKs, RLS
--
-- Exercises design §5.4 + §5.6:
--   1. All 00242 tables exist; the provisional house v1 seed is ACTIVE with a
--      normalized taste_vector and mid spectrums.
--   2. Active-house uniqueness (ux_house_active).
--   3. CHECK constraints on judgments/corrections/biases/rules/profiles/
--      confidence (incl. the generated confidence weight).
--   4. RLS matrix: designer sees own profile/snapshots/judgments/biases
--      ONLY; another designer likewise; client sees nothing; lead (admin
--      domain) sees all; anon sees nothing anywhere.
--   5. Append-only: authenticated UPDATE/DELETE on judgments + corrections
--      silently affect 0 rows (no policies exist).
--   6. The redacting view: v_house_taste_public exposes version/status/
--      spectrum coords only (no taste_vector/theta/curated_overrides/
--      computed_from/notes); direct house_taste reads are lead-only; anon
--      cannot read the view at all.
--   7. bias_templates seeded + config-data write rules.
--   8. taste_rules scoping: own rows + house rows visible to all
--      authenticated; house-scope INSERT is lead-only.
--
-- Uses the seeded dev accounts (supabase/seed/dev-accounts.sql):
--   superadmin@patina.dev a0000000-0000-0000-0000-000000000001 (admin domain → lead)
--   studio@patina.dev     a0000000-0000-0000-0000-000000000003 (studio_admin, designer domain)
--   designer@patina.dev   a0000000-0000-0000-0000-000000000004 (designer domain)
--   client@patina.dev     a0000000-0000-0000-0000-000000000005 (client role)
-- Run after `supabase db reset` so seeds are present.
--
-- How to run:
--   docker exec -i supabase_db_supabase psql -U postgres -d postgres \
--     -v ON_ERROR_STOP=1 < supabase/tests/aesthete/taste_foundation_test.sql
--
-- The script wraps everything in a single transaction and ROLLBACKs at the
-- end so it can be re-run without side effects. Identity switching uses the
-- SET LOCAL ROLE + request.jwt.claims idiom from
-- supabase/tests/rls/products_three_layer_test.sql.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─── fixtures ──────────────────────────────────────────────────────────────

-- Two catalog products for judgment rows.
INSERT INTO products (id, name, source_url, captured_by, captured_at, layer, patina_managed)
VALUES
  ('ae4f0000-0000-4000-8000-000000000001', 'Taste test oak chair',   'http://test.invalid/taste1', 'a0000000-0000-0000-0000-000000000004', NOW(), 'catalog', TRUE),
  ('ae4f0000-0000-4000-8000-000000000002', 'Taste test steel chair', 'http://test.invalid/taste2', 'a0000000-0000-0000-0000-000000000004', NOW(), 'catalog', TRUE);

-- Taste profiles for two designers, a snapshot + a bias for the first
-- (inserted as postgres — fixtures bypass RLS by design; production writes
-- come from the nightly job / DEFINER RPCs).
INSERT INTO designer_taste_profiles (designer_id, warmth, reliability, sources)
VALUES
  ('a0000000-0000-0000-0000-000000000004', 0.5,  0.4, '{"judgments": 10}'),
  ('a0000000-0000-0000-0000-000000000003', -0.2, 0.2, '{"judgments": 3}');

INSERT INTO designer_taste_snapshots (designer_id, version, spectrums, reliability)
VALUES ('a0000000-0000-0000-0000-000000000004', 1, '{"warmth": 0.5}', 0.4);

INSERT INTO signature_biases (designer_id, feature_group, direction, learned_strength, name)
VALUES ('a0000000-0000-0000-0000-000000000004', 'warmth', '+', 0.8, 'Warm lean');

-- One judgment each (as postgres).
INSERT INTO taste_judgments (designer_id, product_a, product_b, choice)
VALUES
  ('a0000000-0000-0000-0000-000000000004', 'ae4f0000-0000-4000-8000-000000000001', 'ae4f0000-0000-4000-8000-000000000002', 'a'),
  ('a0000000-0000-0000-0000-000000000003', 'ae4f0000-0000-4000-8000-000000000001', 'ae4f0000-0000-4000-8000-000000000002', 'b');

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
  u_lead     UUID := 'a0000000-0000-0000-0000-000000000001';  -- super_admin → admin domain → lead
  u_mgr      UUID := 'a0000000-0000-0000-0000-000000000003';  -- studio_admin (designer domain)
  u_designer UUID := 'a0000000-0000-0000-0000-000000000004';
  u_client   UUID := 'a0000000-0000-0000-0000-000000000005';
  p_a        UUID := 'ae4f0000-0000-4000-8000-000000000001';
  p_b        UUID := 'ae4f0000-0000-4000-8000-000000000002';
  v_count int;
  v_norm double precision;
  v_text text;
  v_id bigint;
  v_rule uuid;
BEGIN
  -- Case 0a: seeded dev accounts must exist (suite precondition).
  SELECT count(*) INTO v_count FROM auth.users
   WHERE id IN (u_lead, u_mgr, u_designer, u_client);
  ASSERT v_count = 4,
    'FAIL 0a: dev accounts seed missing (run supabase db reset), got ' || v_count || ' of 4';

  -- Case 0b: all 00242 tables exist.
  SELECT count(*) INTO v_count FROM (VALUES
    ('designer_taste_profiles'), ('designer_taste_snapshots'),
    ('designer_style_confidence'), ('taste_judgments'), ('taste_corrections'),
    ('designer_portfolio_items'), ('house_taste'), ('signature_biases'),
    ('bias_templates'), ('taste_rules'), ('style_centroids'), ('taste_probe_queue')
  ) AS t(name) WHERE to_regclass('public.' || t.name) IS NOT NULL;
  ASSERT v_count = 12,
    'FAIL 0b: expected all 12 taste-foundation tables, found ' || v_count;

  -- Case 1a: the provisional house v1 seed is the single ACTIVE row.
  SELECT count(*) INTO v_count FROM house_taste WHERE status = 'active';
  ASSERT v_count = 1,
    'FAIL 1a: exactly one active house_taste row expected, got ' || v_count;
  SELECT count(*) INTO v_count FROM house_taste
   WHERE status = 'active' AND version = 1
     AND computed_from->>'seed' = 'provisional'
     AND warmth = 0 AND complexity = 0 AND formality = 0
     AND timelessness = 0 AND boldness = 0 AND craftsmanship = 0
     AND theta IS NULL;
  ASSERT v_count = 1,
    'FAIL 1b: house v1 should be the flagged provisional seed (mid spectrums, NULL theta), got ' || v_count;

  -- Case 1c: the seed vector is unit-normalized.
  SELECT abs(vector_norm(taste_vector) - 1.0) INTO v_norm
    FROM house_taste WHERE status = 'active';
  ASSERT v_norm < 0.001,
    'FAIL 1c: seed taste_vector should be unit-norm, |norm-1| = ' || v_norm;

  -- Case 2: only one active house may exist (ux_house_active).
  BEGIN
    INSERT INTO house_taste (version, taste_vector, status)
    VALUES (999, vec_normalize(array_fill(1.0::real, ARRAY[768])::vector), 'active');
    RAISE EXCEPTION 'FAIL 2: a second active house_taste row should violate ux_house_active';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;

  -- Case 3a: judgment choice is constrained.
  BEGIN
    INSERT INTO taste_judgments (designer_id, product_a, product_b, choice)
    VALUES (u_designer, p_a, p_b, 'maybe');
    RAISE EXCEPTION 'FAIL 3a: choice = maybe should violate the CHECK';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  -- Case 3b: judgment kind is constrained.
  BEGIN
    INSERT INTO taste_judgments (designer_id, product_a, product_b, choice, kind)
    VALUES (u_designer, p_a, p_b, 'a', 'vibes');
    RAISE EXCEPTION 'FAIL 3b: kind = vibes should violate the CHECK';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  -- Case 3c: correction subject is constrained.
  BEGIN
    INSERT INTO taste_corrections (designer_id, subject)
    VALUES (u_designer, 'vibe');
    RAISE EXCEPTION 'FAIL 3c: subject = vibe should violate the CHECK';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  -- Case 3d: bias direction is constrained.
  BEGIN
    INSERT INTO signature_biases (designer_id, feature_group, direction, name)
    VALUES (u_designer, 'warmth', '~', 'Wobbly lean');
    RAISE EXCEPTION 'FAIL 3d: direction = ~ should violate the CHECK';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  -- Case 3e: taste_rules scope/owner coupling — designer scope needs a
  -- designer_id, house scope forbids one.
  BEGIN
    INSERT INTO taste_rules (owner_scope, predicate, action)
    VALUES ('designer', '{"all":[]}', 'boost');
    RAISE EXCEPTION 'FAIL 3e1: designer-scope rule without designer_id should violate the CHECK';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    INSERT INTO taste_rules (owner_scope, designer_id, predicate, action)
    VALUES ('house', u_designer, '{"all":[]}', 'boost');
    RAISE EXCEPTION 'FAIL 3e2: house-scope rule WITH designer_id should violate the CHECK';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  -- Case 3f: rule magnitude capped at 0.5.
  BEGIN
    INSERT INTO taste_rules (owner_scope, designer_id, predicate, action, magnitude)
    VALUES ('designer', u_designer, '{"all":[]}', 'boost', 0.9);
    RAISE EXCEPTION 'FAIL 3f: magnitude = 0.9 should violate the CHECK (0..0.5)';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  -- Case 3g: reliability bounded 0..1.
  BEGIN
    UPDATE designer_taste_profiles SET reliability = 1.5 WHERE designer_id = u_designer;
    RAISE EXCEPTION 'FAIL 3g: reliability = 1.5 should violate the CHECK';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  -- Case 3h: confidence level enum + generated weight.
  INSERT INTO designer_style_confidence (designer_id, style_id, level)
  SELECT u_designer, id, 'expert' FROM styles WHERE is_archetype LIMIT 1;
  SELECT count(*) INTO v_count FROM designer_style_confidence
   WHERE designer_id = u_designer AND weight = 1.0;
  ASSERT v_count = 1,
    'FAIL 3h1: level = expert should generate weight 1.0, got ' || v_count || ' matching rows';
  BEGIN
    INSERT INTO designer_style_confidence (designer_id, style_id, level)
    SELECT u_mgr, id, 'guru' FROM styles WHERE is_archetype LIMIT 1;
    RAISE EXCEPTION 'FAIL 3h2: level = guru should violate the CHECK';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  -- Case 4a: the designer sees only their own profile/snapshots/judgments/biases.
  PERFORM pg_temp.assume_user(u_designer);
  SELECT count(*) INTO v_count FROM designer_taste_profiles;
  ASSERT v_count = 1,
    'FAIL 4a1: designer should see exactly their own taste profile, got ' || v_count;
  SELECT count(*) INTO v_count FROM designer_taste_profiles WHERE designer_id = u_designer;
  ASSERT v_count = 1,
    'FAIL 4a2: the visible profile should be the designer''s own, got ' || v_count;
  SELECT count(*) INTO v_count FROM designer_taste_snapshots;
  ASSERT v_count = 1,
    'FAIL 4a3: designer should see exactly their own snapshot, got ' || v_count;
  SELECT count(*) INTO v_count FROM taste_judgments;
  ASSERT v_count = 1,
    'FAIL 4a4: designer should see exactly their own judgment, got ' || v_count;
  SELECT count(*) INTO v_count FROM signature_biases;
  ASSERT v_count = 1,
    'FAIL 4a5: designer should see exactly their own bias, got ' || v_count;
  PERFORM pg_temp.reset_role();

  -- Case 4b: the other designer sees only their own rows too.
  PERFORM pg_temp.assume_user(u_mgr);
  SELECT count(*) INTO v_count FROM designer_taste_profiles;
  ASSERT v_count = 1,
    'FAIL 4b1: studio manager should see exactly their own taste profile, got ' || v_count;
  SELECT count(*) INTO v_count FROM taste_judgments WHERE designer_id = u_designer;
  ASSERT v_count = 0,
    'FAIL 4b2: studio manager must NOT see the designer''s judgments, got ' || v_count;
  PERFORM pg_temp.reset_role();

  -- Case 4c: a client-role user sees nothing.
  PERFORM pg_temp.assume_user(u_client);
  SELECT count(*) INTO v_count FROM designer_taste_profiles;
  ASSERT v_count = 0,
    'FAIL 4c1: client must see no taste profiles, got ' || v_count;
  SELECT count(*) INTO v_count FROM taste_judgments;
  ASSERT v_count = 0,
    'FAIL 4c2: client must see no judgments, got ' || v_count;
  PERFORM pg_temp.reset_role();

  -- Case 4d: the lead (admin domain) sees all profiles + judgments and may
  -- read house_taste directly.
  PERFORM pg_temp.assume_user(u_lead);
  SELECT count(*) INTO v_count FROM designer_taste_profiles;
  ASSERT v_count = 2,
    'FAIL 4d1: lead should see both taste profiles, got ' || v_count;
  SELECT count(*) INTO v_count FROM taste_judgments;
  ASSERT v_count = 2,
    'FAIL 4d2: lead (super_admin) should see both judgments, got ' || v_count;
  SELECT count(*) INTO v_count FROM house_taste;
  ASSERT v_count >= 1,
    'FAIL 4d3: lead should read house_taste directly, got ' || v_count;
  PERFORM pg_temp.reset_role();

  -- Case 4e: non-lead designers cannot read house_taste directly, but CAN
  -- read the redacted view.
  PERFORM pg_temp.assume_user(u_designer);
  SELECT count(*) INTO v_count FROM house_taste;
  ASSERT v_count = 0,
    'FAIL 4e1: non-lead must NOT read house_taste directly, got ' || v_count;
  SELECT count(*) INTO v_count FROM v_house_taste_public WHERE status = 'active';
  ASSERT v_count = 1,
    'FAIL 4e2: authenticated should read the active house via v_house_taste_public, got ' || v_count;
  PERFORM pg_temp.reset_role();

  -- Case 4f: anon is denied everywhere (RLS: zero rows; view: no grant).
  PERFORM pg_temp.assume_anon();
  SELECT count(*) INTO v_count FROM designer_taste_profiles;
  ASSERT v_count = 0, 'FAIL 4f1: anon must see no taste profiles, got ' || v_count;
  SELECT count(*) INTO v_count FROM taste_judgments;
  ASSERT v_count = 0, 'FAIL 4f2: anon must see no judgments, got ' || v_count;
  SELECT count(*) INTO v_count FROM house_taste;
  ASSERT v_count = 0, 'FAIL 4f3: anon must see no house_taste rows, got ' || v_count;
  SELECT count(*) INTO v_count FROM bias_templates;
  ASSERT v_count = 0, 'FAIL 4f4: anon must see no bias_templates, got ' || v_count;
  SELECT count(*) INTO v_count FROM style_centroids;
  ASSERT v_count = 0, 'FAIL 4f5: anon must see no style_centroids, got ' || v_count;
  BEGIN
    SELECT count(*) INTO v_count FROM v_house_taste_public;
    RAISE EXCEPTION 'FAIL 4f6: anon SELECT on v_house_taste_public should be permission-denied';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  PERFORM pg_temp.reset_role();

  -- Case 4g: a designer can INSERT their own judgment; not someone else's.
  PERFORM pg_temp.assume_user(u_designer);
  INSERT INTO taste_judgments (designer_id, product_a, product_b, choice)
  VALUES (u_designer, p_b, p_a, 'b');
  BEGIN
    INSERT INTO taste_judgments (designer_id, product_a, product_b, choice)
    VALUES (u_mgr, p_a, p_b, 'a');
    RAISE EXCEPTION 'FAIL 4g: inserting a judgment for another designer should be rejected by RLS';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  PERFORM pg_temp.reset_role();

  -- Case 5a: judgments are append-only — the owner's UPDATE silently
  -- affects 0 rows (no UPDATE policy), the row is unchanged.
  SELECT id INTO v_id FROM taste_judgments
   WHERE designer_id = u_designer ORDER BY id LIMIT 1;
  PERFORM pg_temp.assume_user(u_designer);
  UPDATE taste_judgments SET choice = 'both' WHERE id = v_id;
  PERFORM pg_temp.reset_role();
  SELECT choice INTO v_text FROM taste_judgments WHERE id = v_id;
  ASSERT v_text = 'a',
    'FAIL 5a: judgment choice must be immutable under authenticated, became ' || v_text;

  -- Case 5b: ...and DELETE affects 0 rows.
  PERFORM pg_temp.assume_user(u_designer);
  DELETE FROM taste_judgments WHERE id = v_id;
  PERFORM pg_temp.reset_role();
  SELECT count(*) INTO v_count FROM taste_judgments WHERE id = v_id;
  ASSERT v_count = 1,
    'FAIL 5b: judgment must not be deletable under authenticated, row is gone';

  -- Case 5c: corrections are append-only too.
  PERFORM pg_temp.assume_user(u_designer);
  INSERT INTO taste_corrections (designer_id, subject, direction)
  VALUES (u_designer, 'match', '{"warmth": -0.3}');
  UPDATE taste_corrections SET subject = 'dna' WHERE designer_id = u_designer;
  DELETE FROM taste_corrections WHERE designer_id = u_designer;
  PERFORM pg_temp.reset_role();
  SELECT count(*) INTO v_count FROM taste_corrections
   WHERE designer_id = u_designer AND subject = 'match';
  ASSERT v_count = 1,
    'FAIL 5c: correction must survive owner UPDATE/DELETE unchanged, got ' || v_count;

  -- Case 6: the redacting view carries no vector/learned/curation columns.
  SELECT count(*) INTO v_count
    FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'v_house_taste_public'
     AND column_name IN ('taste_vector', 'theta', 'curated_overrides', 'computed_from', 'notes');
  ASSERT v_count = 0,
    'FAIL 6a: v_house_taste_public must redact vector/theta/curation columns, leaked ' || v_count;
  SELECT count(*) INTO v_count
    FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'v_house_taste_public'
     AND column_name IN ('version', 'status', 'warmth', 'complexity', 'formality',
                         'timelessness', 'boldness', 'craftsmanship');
  ASSERT v_count = 8,
    'FAIL 6b: v_house_taste_public should expose version/status + 6 spectrum coords, got ' || v_count;

  -- Case 7a: bias_templates seeded (§8.5 examples).
  SELECT count(*) INTO v_count FROM bias_templates;
  ASSERT v_count >= 8,
    'FAIL 7a: bias_templates should carry the ~8-row starter seed, got ' || v_count;

  -- Case 7b: config data — authenticated reads; non-admin writes rejected.
  PERFORM pg_temp.assume_user(u_designer);
  SELECT count(*) INTO v_count FROM bias_templates;
  ASSERT v_count >= 8,
    'FAIL 7b1: authenticated should read bias_templates, got ' || v_count;
  BEGIN
    INSERT INTO bias_templates (pattern, name) VALUES ('rogue+', 'Rogue');
    RAISE EXCEPTION 'FAIL 7b2: designer INSERT into bias_templates should be rejected by RLS';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  PERFORM pg_temp.reset_role();

  -- Case 8a: a designer can author their own rule; not a house rule.
  PERFORM pg_temp.assume_user(u_designer);
  INSERT INTO taste_rules (owner_scope, designer_id, predicate, action)
  VALUES ('designer', u_designer, '{"all":[{"attr":"complexity","gte":0.5}]}', 'bury')
  RETURNING id INTO v_rule;
  BEGIN
    INSERT INTO taste_rules (owner_scope, predicate, action)
    VALUES ('house', '{"all":[]}', 'block');
    RAISE EXCEPTION 'FAIL 8a: designer authoring a house rule should be rejected by RLS';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  PERFORM pg_temp.reset_role();

  -- Case 8b: the lead can author a house rule; every authenticated user sees
  -- it, but not the designer's private rule.
  PERFORM pg_temp.assume_user(u_lead);
  INSERT INTO taste_rules (owner_scope, predicate, action)
  VALUES ('house', '{"all":[{"attr":"patina_potential","gte":0.2}]}', 'boost');
  PERFORM pg_temp.reset_role();

  PERFORM pg_temp.assume_user(u_client);
  SELECT count(*) INTO v_count FROM taste_rules WHERE owner_scope = 'house';
  ASSERT v_count = 1,
    'FAIL 8b1: house rules should be visible to all authenticated, got ' || v_count;
  SELECT count(*) INTO v_count FROM taste_rules WHERE id = v_rule;
  ASSERT v_count = 0,
    'FAIL 8b2: another user''s designer-scope rule must be hidden, got ' || v_count;
  PERFORM pg_temp.reset_role();

  RAISE NOTICE 'All taste foundation assertions passed.';
END
$$;

-- ROLLBACK so the test is idempotent.
ROLLBACK;
