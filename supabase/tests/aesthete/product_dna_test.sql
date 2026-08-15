-- ═══════════════════════════════════════════════════════════════════════════
-- Product DNA tests (migration 00240)
--
-- Exercises design §5.2 + §5.6:
--   1. CHECK constraints reject out-of-range scoring axes.
--   2. RLS SELECT follows product visibility transitively: anon sees
--      catalog-layer DNA only; the owner sees their own personal-layer DNA;
--      another user does not.
--   3. Writes are designer/admin: a designer can INSERT DNA on a product
--      they can see; a client-role user cannot write or delete.
--   4. product_style_spectrum additive columns: defaults, the
--      ('manual','validated') CHECK.
--   5. dna_vocab: seeded, PK enforced, authenticated-only reads.
--   6. product_dna_drafts: UNIQUE (product_id, prompt_version); SELECT is
--      designer/admin-only; clients cannot INSERT.
--
-- Uses the seeded dev accounts (supabase/seed/dev-accounts.sql):
--   designer@patina.dev a0000000-0000-0000-0000-000000000004 (designer domain)
--   client@patina.dev   a0000000-0000-0000-0000-000000000005 (client role)
-- Run after `supabase db reset` so seeds are present.
--
-- How to run:
--   scripts/run-supabase-sql-test.sh supabase/tests/aesthete/product_dna_test.sql
--
-- The script wraps everything in a single transaction and ROLLBACKs at the
-- end so it can be re-run without side effects. Identity switching uses the
-- SET LOCAL ROLE + request.jwt.claims idiom from
-- supabase/tests/rls/products_three_layer_test.sql.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─── fixtures ──────────────────────────────────────────────────────────────

-- Three products: two personal (owned by the dev designer), one catalog.
INSERT INTO products (id, name, source_url, captured_by, captured_at, layer, owner_user_id)
VALUES
  ('ae2d0000-0000-4000-8000-000000000001', 'DNA test personal chair', 'http://test.invalid/dna1', 'a0000000-0000-0000-0000-000000000004', NOW(), 'personal', 'a0000000-0000-0000-0000-000000000004'),
  ('ae2d0000-0000-4000-8000-000000000002', 'DNA test personal bench', 'http://test.invalid/dna2', 'a0000000-0000-0000-0000-000000000004', NOW(), 'personal', 'a0000000-0000-0000-0000-000000000004');

INSERT INTO products (id, name, source_url, captured_by, captured_at, layer, patina_managed)
VALUES
  ('ae2d0000-0000-4000-8000-000000000003', 'DNA test catalog credenza', 'http://test.invalid/dna3', 'a0000000-0000-0000-0000-000000000004', NOW(), 'catalog', TRUE);

-- Canonical DNA rows for the personal chair + catalog credenza (inserted as
-- postgres — fixtures bypass RLS by design).
INSERT INTO product_dna (product_id, line_quality, patina_potential, leg_style)
VALUES
  ('ae2d0000-0000-4000-8000-000000000001', -0.4, 0.8, 'tapered'),
  ('ae2d0000-0000-4000-8000-000000000003',  0.6, 0.9, 'turned');

-- A draft for the catalog product (job-pipeline output; fixtures as postgres).
INSERT INTO product_dna_drafts (product_id, draft, model, prompt_version, overall_confidence)
VALUES
  ('ae2d0000-0000-4000-8000-000000000003', '{"style":{"primary_archetype":"warm_modern"}}', 'claude-haiku-4-5', 'p1', 0.72);

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

GRANT EXECUTE ON FUNCTION pg_temp.reset_role() TO anon, authenticated;

-- ─── assertions ────────────────────────────────────────────────────────────

DO $$
DECLARE
  u_designer UUID := 'a0000000-0000-0000-0000-000000000004';
  u_client   UUID := 'a0000000-0000-0000-0000-000000000005';
  p_personal UUID := 'ae2d0000-0000-4000-8000-000000000001';
  p_spare    UUID := 'ae2d0000-0000-4000-8000-000000000002';
  p_catalog  UUID := 'ae2d0000-0000-4000-8000-000000000003';
  v_count int;
  v_text text;
BEGIN
  -- Case 0: seeded dev accounts must exist (suite precondition).
  SELECT count(*) INTO v_count FROM auth.users WHERE id IN (u_designer, u_client);
  ASSERT v_count = 2,
    'FAIL 0: dev accounts seed missing (run supabase db reset with the config.toml sql_paths), got ' || v_count || ' of 2';

  -- Case 1: CHECK constraints reject out-of-range scoring axes.
  BEGIN
    INSERT INTO product_dna (product_id, line_quality) VALUES (p_spare, 1.5);
    RAISE EXCEPTION 'FAIL 1a: line_quality = 1.5 should violate CHECK (-1..1)';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  BEGIN
    INSERT INTO product_dna (product_id, craftsmanship_tier) VALUES (p_spare, 1.2);
    RAISE EXCEPTION 'FAIL 1b: craftsmanship_tier = 1.2 should violate CHECK (0..1)';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  BEGIN
    INSERT INTO product_dna (product_id, color_saturation) VALUES (p_spare, -0.1);
    RAISE EXCEPTION 'FAIL 1c: color_saturation = -0.1 should violate CHECK (0..1)';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  -- Case 2a: anon sees catalog-visible DNA only. (Wave 2A: was an absolute
  -- count of 1, which broke once 00244's demo seed gave the dev catalog DNA
  -- rows — now asserts the actual transitive-visibility property: every DNA
  -- row anon can read belongs to a product anon can see, i.e. catalog.)
  PERFORM pg_temp.assume_anon();
  SELECT count(*) INTO v_count
    FROM product_dna d
   WHERE NOT EXISTS (SELECT 1 FROM products p
                      WHERE p.id = d.product_id AND p.layer = 'catalog');
  ASSERT v_count = 0,
    'FAIL 2a: anon must only see catalog-layer DNA rows; ' || v_count || ' leaked';
  SELECT count(*) INTO v_count FROM product_dna WHERE product_id = p_catalog;
  ASSERT v_count = 1,
    'FAIL 2b: anon should see the catalog product''s DNA, got ' || v_count;
  PERFORM pg_temp.reset_role();

  -- Case 2c: the owner sees their own personal-layer DNA.
  PERFORM pg_temp.assume_user(u_designer);
  SELECT count(*) INTO v_count FROM product_dna WHERE product_id = p_personal;
  ASSERT v_count = 1,
    'FAIL 2c: the designer should see DNA on their own personal product, got ' || v_count;
  PERFORM pg_temp.reset_role();

  -- Case 2d: another user does NOT see the designer's personal-layer DNA,
  -- but does see catalog DNA (visibility is transitive through products).
  PERFORM pg_temp.assume_user(u_client);
  SELECT count(*) INTO v_count FROM product_dna WHERE product_id = p_personal;
  ASSERT v_count = 0,
    'FAIL 2d: the client must NOT see DNA on the designer''s personal product, got ' || v_count;
  SELECT count(*) INTO v_count FROM product_dna WHERE product_id = p_catalog;
  ASSERT v_count = 1,
    'FAIL 2e: the client (authenticated) should see catalog DNA, got ' || v_count;
  PERFORM pg_temp.reset_role();

  -- Case 3a: a designer-domain user can INSERT DNA on a product they can see.
  PERFORM pg_temp.assume_user(u_designer);
  INSERT INTO product_dna (product_id, line_quality, leg_style)
  VALUES (p_spare, 0.2, 'plinth');
  SELECT count(*) INTO v_count FROM product_dna WHERE product_id = p_spare;
  ASSERT v_count = 1,
    'FAIL 3a: the designer should INSERT DNA on their own product, got ' || v_count;
  PERFORM pg_temp.reset_role();

  -- Case 3b: a client-role user (no designer-domain role) cannot INSERT DNA,
  -- even on a catalog product they can see.
  PERFORM pg_temp.assume_user(u_client);
  BEGIN
    INSERT INTO product_dna (product_id, line_quality) VALUES (p_catalog, 0.1);
    RAISE EXCEPTION 'FAIL 3b: client INSERT into product_dna should be rejected by RLS';
  EXCEPTION
    WHEN insufficient_privilege THEN NULL;
    WHEN unique_violation THEN
      RAISE EXCEPTION 'FAIL 3b: client INSERT hit the PK — the RLS WITH CHECK did not fire first';
  END;
  PERFORM pg_temp.reset_role();

  -- Case 3c: a client UPDATE silently affects 0 rows (RLS hides them).
  PERFORM pg_temp.assume_user(u_client);
  UPDATE product_dna SET leg_style = 'hijacked' WHERE product_id = p_catalog;
  PERFORM pg_temp.reset_role();
  SELECT leg_style INTO v_text FROM product_dna WHERE product_id = p_catalog;
  ASSERT v_text = 'turned',
    'FAIL 3c: client must NOT update catalog DNA, leg_style became ' || v_text;

  -- Case 3d: DELETE is admin-only — even the designer cannot delete DNA.
  PERFORM pg_temp.assume_user(u_designer);
  DELETE FROM product_dna WHERE product_id = p_personal;
  PERFORM pg_temp.reset_role();
  SELECT count(*) INTO v_count FROM product_dna WHERE product_id = p_personal;
  ASSERT v_count = 1,
    'FAIL 3d: non-admin DELETE should affect 0 rows, row is gone';

  -- Case 4a: spectrum additive columns default to source='manual',
  -- confidence='{}'.
  INSERT INTO product_style_spectrum (product_id, warmth, complexity, assigned_by)
  VALUES (p_spare, 0.6, -0.4, u_designer);
  SELECT count(*) INTO v_count FROM product_style_spectrum
   WHERE product_id = p_spare AND source = 'manual' AND confidence = '{}'::jsonb;
  ASSERT v_count = 1,
    'FAIL 4a: spectrum row should default source=manual, confidence={}, got ' || v_count;

  -- Case 4b: validation upgrade path is legal.
  UPDATE product_style_spectrum
     SET source = 'validated', confidence = '{"warmth": 0.95}'::jsonb
   WHERE product_id = p_spare;
  SELECT count(*) INTO v_count FROM product_style_spectrum
   WHERE product_id = p_spare AND source = 'validated';
  ASSERT v_count = 1,
    'FAIL 4b: spectrum source should upgrade to validated, got ' || v_count;

  -- Case 4c: only ('manual','validated') are legal sources — ML never writes
  -- this table (§5.2), so no ml value exists to write.
  BEGIN
    UPDATE product_style_spectrum SET source = 'ml_predicted' WHERE product_id = p_spare;
    RAISE EXCEPTION 'FAIL 4c: source = ml_predicted should violate the CHECK';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  -- Case 5a: dna_vocab starter seed landed for all four attributes.
  SELECT count(*) INTO v_count FROM dna_vocab;
  ASSERT v_count >= 25,
    'FAIL 5a: dna_vocab starter seed should have ~30 rows, got ' || v_count;
  SELECT count(DISTINCT attribute) INTO v_count
    FROM dna_vocab
   WHERE attribute IN ('leg_style', 'arm_profile', 'finish', 'palette_family');
  ASSERT v_count = 4,
    'FAIL 5b: dna_vocab should cover leg_style/arm_profile/finish/palette_family, got ' || v_count;

  -- Case 5c: (attribute, value) is the PK.
  BEGIN
    INSERT INTO dna_vocab (family, attribute, value) VALUES ('form', 'leg_style', 'tapered');
    RAISE EXCEPTION 'FAIL 5c: duplicate (attribute, value) should violate the PK';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;

  -- Case 5d: vocab is config data — authenticated reads it, anon does not.
  PERFORM pg_temp.assume_user(u_client);
  SELECT count(*) INTO v_count FROM dna_vocab;
  ASSERT v_count >= 25,
    'FAIL 5d: authenticated should read dna_vocab, got ' || v_count;
  PERFORM pg_temp.reset_role();

  PERFORM pg_temp.assume_anon();
  SELECT count(*) INTO v_count FROM dna_vocab;
  ASSERT v_count = 0,
    'FAIL 5e: anon must NOT read dna_vocab, got ' || v_count;
  PERFORM pg_temp.reset_role();

  -- Case 5f: config writes are admin-only — a designer cannot add vocab.
  PERFORM pg_temp.assume_user(u_designer);
  BEGIN
    INSERT INTO dna_vocab (family, attribute, value) VALUES ('form', 'leg_style', 'rogue');
    RAISE EXCEPTION 'FAIL 5f: designer INSERT into dna_vocab should be rejected by RLS';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  PERFORM pg_temp.reset_role();

  -- Case 6a: one draft per (product_id, prompt_version).
  BEGIN
    INSERT INTO product_dna_drafts (product_id, draft, model, prompt_version)
    VALUES (p_catalog, '{}', 'claude-haiku-4-5', 'p1');
    RAISE EXCEPTION 'FAIL 6a: duplicate (product_id, prompt_version) draft should be rejected';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;

  -- Case 6b: drafts are designer/admin-visible; client-role users see none.
  PERFORM pg_temp.assume_user(u_designer);
  SELECT count(*) INTO v_count FROM product_dna_drafts WHERE product_id = p_catalog;
  ASSERT v_count = 1,
    'FAIL 6b: the designer should see the catalog product''s draft, got ' || v_count;
  PERFORM pg_temp.reset_role();

  PERFORM pg_temp.assume_user(u_client);
  SELECT count(*) INTO v_count FROM product_dna_drafts;
  ASSERT v_count = 0,
    'FAIL 6c: a client-role user must NOT see DNA drafts, got ' || v_count;
  PERFORM pg_temp.reset_role();

  -- Case 6d: no client role may INSERT drafts (job pipeline only).
  PERFORM pg_temp.assume_user(u_designer);
  BEGIN
    INSERT INTO product_dna_drafts (product_id, draft, model, prompt_version)
    VALUES (p_catalog, '{}', 'claude-haiku-4-5', 'p2');
    RAISE EXCEPTION 'FAIL 6d: even designers must not INSERT drafts (service-role job only)';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  PERFORM pg_temp.reset_role();

  RAISE NOTICE 'All product DNA assertions passed.';
END
$$;

-- ROLLBACK so the test is idempotent.
ROLLBACK;
