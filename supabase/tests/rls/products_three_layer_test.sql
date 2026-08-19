-- ═══════════════════════════════════════════════════════════════════════════
-- RLS verification tests for the three-layer product catalog (migration 00152)
--
-- Exercises the PRD §12.3 acceptance criteria:
--   1. Personal: only the owner can SELECT.
--   2. Studio: only active studio members can SELECT.
--   3. Catalog: any authenticated user can SELECT.
--   4. Studio UPDATE: only non-guest members (owner/admin/member).
--   5. Catalog UPDATE: only super_admin.
--
-- How to run:
--   docker exec -i supabase_db_supabase psql -U postgres -d postgres \
--     < supabase/tests/rls/products_three_layer_test.sql
--
-- The script:
--   • Wraps everything in a single transaction and ROLLBACKs at the end so it
--     can be re-run without side effects.
--   • Uses SET LOCAL ROLE authenticated + request.jwt.claims to switch
--     identity — this is the same mechanism Supabase uses for RLS in prod.
--   • Each assertion uses ASSERT inside a DO block; failures raise EXCEPTION
--     with a descriptive message.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─── fixtures ──────────────────────────────────────────────────────────────

-- Two test auth users + matching profiles.
INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, instance_id, aud, role)
VALUES
  ('11111111-1111-4111-8111-111111111111', 'rls-alice@test.invalid', '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('22222222-2222-4222-8222-222222222222', 'rls-bob@test.invalid',   '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('33333333-3333-4333-8333-333333333333', 'rls-carol@test.invalid', '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');

-- profiles rows may already exist if an auth.users trigger auto-creates them
-- (Patina has one). ON CONFLICT keeps this test agnostic.
INSERT INTO profiles (id, email, full_name, created_at, updated_at)
VALUES
  ('11111111-1111-4111-8111-111111111111', 'rls-alice@test.invalid', 'Alice',  NOW(), NOW()),
  ('22222222-2222-4222-8222-222222222222', 'rls-bob@test.invalid',   'Bob',    NOW(), NOW()),
  ('33333333-3333-4333-8333-333333333333', 'rls-carol@test.invalid', 'Carol',  NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

-- Two studios. Alice owns Studio Alpha; Bob owns Studio Beta. Carol is an
-- unaffiliated authenticated user.
INSERT INTO organizations (id, type, name, slug, status, created_at, updated_at)
VALUES
  ('aaaa1111-1111-4111-8111-aaaaaaaaaaaa', 'design_studio', 'Studio Alpha', 'rls-studio-alpha', 'active', NOW(), NOW()),
  ('bbbb2222-2222-4222-8222-bbbbbbbbbbbb', 'design_studio', 'Studio Beta',  'rls-studio-beta',  'active', NOW(), NOW());

INSERT INTO organization_members (user_id, organization_id, role, status, joined_at, created_at, updated_at)
VALUES
  ('11111111-1111-4111-8111-111111111111', 'aaaa1111-1111-4111-8111-aaaaaaaaaaaa', 'owner',  'active', NOW(), NOW(), NOW()),
  ('22222222-2222-4222-8222-222222222222', 'bbbb2222-2222-4222-8222-bbbbbbbbbbbb', 'owner',  'active', NOW(), NOW(), NOW());

-- One product per layer. The trigger normalizes the layer-specific fields.
INSERT INTO products (id, name, source_url, captured_by, captured_at, layer, owner_user_id)
VALUES
  ('cccc1111-1111-4111-8111-cccccccccccc', 'Alice''s personal lamp', 'http://test.invalid/p1', '11111111-1111-4111-8111-111111111111', NOW(), 'personal', '11111111-1111-4111-8111-111111111111');

INSERT INTO products (
  id, name, source_url, captured_by, captured_at,
  layer, studio_id, vendor_contact, lead_time_weeks, payment_terms, category, usage_notes
)
VALUES
  ('cccc2222-2222-4222-8222-cccccccccccc', 'Studio Alpha sofa', 'http://test.invalid/p2', '11111111-1111-4111-8111-111111111111', NOW(),
   'studio', 'aaaa1111-1111-4111-8111-aaaaaaaaaaaa', '{"name": "rep", "email": "rep@vendor.test"}'::jsonb, 8, 'net_30', 'sofa', 'studio go-to');

INSERT INTO products (id, name, source_url, captured_by, captured_at, layer, patina_managed)
VALUES
  ('cccc3333-3333-4333-8333-cccccccccccc', 'Catalog chair', 'http://test.invalid/p3', '11111111-1111-4111-8111-111111111111', NOW(), 'catalog', TRUE);

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
GRANT EXECUTE ON FUNCTION pg_temp.assume_user(UUID) TO PUBLIC;

CREATE OR REPLACE FUNCTION pg_temp.assume_anon()
RETURNS VOID AS $$
BEGIN
  PERFORM set_config('request.jwt.claims', '{}', true);
  EXECUTE 'SET LOCAL ROLE anon';
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION pg_temp.assume_anon() TO PUBLIC;

CREATE OR REPLACE FUNCTION pg_temp.reset_role()
RETURNS VOID AS $$
BEGIN
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claims', NULL, true);
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION pg_temp.reset_role() TO PUBLIC;

-- ─── assertions ────────────────────────────────────────────────────────────

DO $$
DECLARE
  visible_count INTEGER;
BEGIN
  -- Case 1a: Alice can see her own Personal item.
  PERFORM pg_temp.assume_user('11111111-1111-4111-8111-111111111111');
  SELECT COUNT(*) INTO visible_count FROM products WHERE id = 'cccc1111-1111-4111-8111-cccccccccccc';
  ASSERT visible_count = 1, 'FAIL 1a: Alice should see her own personal item, got ' || visible_count;
  PERFORM pg_temp.reset_role();

  -- Case 1b: Bob cannot see Alice's Personal item.
  PERFORM pg_temp.assume_user('22222222-2222-4222-8222-222222222222');
  SELECT COUNT(*) INTO visible_count FROM products WHERE id = 'cccc1111-1111-4111-8111-cccccccccccc';
  ASSERT visible_count = 0, 'FAIL 1b: Bob must NOT see Alice''s personal item, got ' || visible_count;
  PERFORM pg_temp.reset_role();

  -- Case 2a: Alice (Studio Alpha member) sees Studio Alpha items.
  PERFORM pg_temp.assume_user('11111111-1111-4111-8111-111111111111');
  SELECT COUNT(*) INTO visible_count FROM products WHERE id = 'cccc2222-2222-4222-8222-cccccccccccc';
  ASSERT visible_count = 1, 'FAIL 2a: Alice should see Studio Alpha item, got ' || visible_count;
  PERFORM pg_temp.reset_role();

  -- Case 2b: Bob (Studio Beta member) does NOT see Studio Alpha items.
  PERFORM pg_temp.assume_user('22222222-2222-4222-8222-222222222222');
  SELECT COUNT(*) INTO visible_count FROM products WHERE id = 'cccc2222-2222-4222-8222-cccccccccccc';
  ASSERT visible_count = 0, 'FAIL 2b: Bob must NOT see Studio Alpha item, got ' || visible_count;
  PERFORM pg_temp.reset_role();

  -- Case 2c: Carol (no studio) does NOT see any studio item.
  PERFORM pg_temp.assume_user('33333333-3333-4333-8333-333333333333');
  SELECT COUNT(*) INTO visible_count FROM products WHERE layer = 'studio';
  ASSERT visible_count = 0, 'FAIL 2c: Carol must NOT see any studio item, got ' || visible_count;
  PERFORM pg_temp.reset_role();

  -- Case 3a: All authenticated users see the catalog item.
  PERFORM pg_temp.assume_user('22222222-2222-4222-8222-222222222222');
  SELECT COUNT(*) INTO visible_count FROM products WHERE id = 'cccc3333-3333-4333-8333-cccccccccccc';
  ASSERT visible_count = 1, 'FAIL 3a: Bob (authenticated) should see catalog item, got ' || visible_count;
  PERFORM pg_temp.reset_role();

  PERFORM pg_temp.assume_user('33333333-3333-4333-8333-333333333333');
  SELECT COUNT(*) INTO visible_count FROM products WHERE id = 'cccc3333-3333-4333-8333-cccccccccccc';
  ASSERT visible_count = 1, 'FAIL 3b: Carol (authenticated) should see catalog item, got ' || visible_count;
  PERFORM pg_temp.reset_role();

  -- Case 3c: Anonymous role sees catalog item.
  PERFORM pg_temp.assume_anon();
  SELECT COUNT(*) INTO visible_count FROM products WHERE id = 'cccc3333-3333-4333-8333-cccccccccccc';
  ASSERT visible_count = 1, 'FAIL 3c: Anon should see catalog item, got ' || visible_count;

  -- Case 3d: Anonymous role does NOT see personal or studio items.
  SELECT COUNT(*) INTO visible_count FROM products WHERE id IN (
    'cccc1111-1111-4111-8111-cccccccccccc',
    'cccc2222-2222-4222-8222-cccccccccccc'
  );
  ASSERT visible_count = 0, 'FAIL 3d: Anon must NOT see personal/studio items, got ' || visible_count;
  PERFORM pg_temp.reset_role();

  -- Case 4a: Alice (studio owner) can UPDATE the studio item.
  PERFORM pg_temp.assume_user('11111111-1111-4111-8111-111111111111');
  UPDATE products SET usage_notes = 'edited by owner'
   WHERE id = 'cccc2222-2222-4222-8222-cccccccccccc';
  SELECT COUNT(*) INTO visible_count FROM products
   WHERE id = 'cccc2222-2222-4222-8222-cccccccccccc' AND usage_notes = 'edited by owner';
  ASSERT visible_count = 1, 'FAIL 4a: Alice should UPDATE her studio item, got ' || visible_count;
  PERFORM pg_temp.reset_role();

  -- Case 4b: Bob (different studio) cannot UPDATE Studio Alpha item.
  -- The UPDATE silently affects 0 rows because RLS hides the row.
  PERFORM pg_temp.assume_user('22222222-2222-4222-8222-222222222222');
  UPDATE products SET usage_notes = 'edited by outsider'
   WHERE id = 'cccc2222-2222-4222-8222-cccccccccccc';
  PERFORM pg_temp.reset_role();

  SELECT COUNT(*) INTO visible_count FROM products
   WHERE id = 'cccc2222-2222-4222-8222-cccccccccccc' AND usage_notes = 'edited by outsider';
  ASSERT visible_count = 0, 'FAIL 4b: Bob must NOT UPDATE Studio Alpha item, got ' || visible_count;

  -- Case 5a: Non-super_admin authenticated user cannot UPDATE catalog.
  PERFORM pg_temp.assume_user('22222222-2222-4222-8222-222222222222');
  UPDATE products SET name = 'hijacked'
   WHERE id = 'cccc3333-3333-4333-8333-cccccccccccc';
  PERFORM pg_temp.reset_role();

  SELECT COUNT(*) INTO visible_count FROM products
   WHERE id = 'cccc3333-3333-4333-8333-cccccccccccc' AND name = 'hijacked';
  ASSERT visible_count = 0, 'FAIL 5a: Non-admin must NOT UPDATE catalog item, got ' || visible_count;

  RAISE NOTICE 'All RLS assertions passed.';
END
$$;

-- ROLLBACK so the test is idempotent.
ROLLBACK;
