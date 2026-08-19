-- ═══════════════════════════════════════════════════════════════════════════
-- media_registry RLS — subject-arm dispatch (migration 00494)
--
-- Covers:
--   (a) the project subject-arm: the project's own designer sees a row bound
--       to their project; an UNRELATED designer (cross-tenant) does not —
--       the classic "the row exists but the caller can't see the domain
--       object" case, proven through the CALLER's own projects RLS, not a
--       bare EXISTS.
--   (b) the product subject-arm: a catalog/published product's media is
--       visible to ANY authenticated caller (not owner-scoped); a
--       catalog/draft product's media is not (status arm fails); a
--       personal/published product's media is not (layer arm fails) even
--       though its owner IS the caller.
--   (c) both-NULL subject_type/subject_id → invisible, even to the row's own
--       creator context.
--   (d) an unrecognized subject_type ('vendor') pointing at a REAL, caller-
--       visible project → still invisible. Proves the dispatch keys on
--       subject_type, not merely "does a matching domain row exist and can
--       the caller see it under some other type".
--   (e) anon: zero table privilege AND zero rows either way (grant surface,
--       not merely policy).
--   (f) ANTI-VACUITY — the policy is temporarily widened to USING (true) to
--       prove these assertions can actually fail (i.e. are not vacuously
--       true because of a missing GRANT or a broken fixture), then the real
--       policy is restored and re-asserted.
--
-- Run:
--   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -X -q \
--     -v ON_ERROR_STOP=1 \
--     -f supabase/tests/media_registry/media_registry_rls_test.sql
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

SET LOCAL statement_timeout = '30s';

-- ─── fixtures ────────────────────────────────────────────────────────────────
-- A = owns project_a and one of the product fixtures (irrelevant to the
--     product arm, which never checks ownership). B = an unrelated designer
--     with no relationship to project_a at all.
INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, instance_id, aud, role)
VALUES
  ('be000000-0000-4000-8000-000000000001', 'mr-owner-a@test.invalid', '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('be000000-0000-4000-8000-000000000002', 'mr-unrelated-b@test.invalid', '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');

INSERT INTO profiles (id, email, full_name, created_at, updated_at)
VALUES
  ('be000000-0000-4000-8000-000000000001', 'mr-owner-a@test.invalid', 'MR Owner A', NOW(), NOW()),
  ('be000000-0000-4000-8000-000000000002', 'mr-unrelated-b@test.invalid', 'MR Unrelated B', NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

INSERT INTO projects (id, name, designer_id, created_by)
VALUES ('be000000-0000-4000-8000-0000000000e1', 'MR Test Project', 'be000000-0000-4000-8000-000000000001', 'be000000-0000-4000-8000-000000000001');

INSERT INTO products (id, name, captured_at, layer, status, patina_managed)
VALUES ('be000000-0000-4000-8000-0000000000d1', 'MR Catalog Published Product', NOW(), 'catalog', 'published', true);

INSERT INTO products (id, name, captured_at, layer, status, patina_managed)
VALUES ('be000000-0000-4000-8000-0000000000d2', 'MR Catalog Draft Product', NOW(), 'catalog', 'draft', true);

INSERT INTO products (id, name, captured_at, layer, status, owner_user_id)
VALUES ('be000000-0000-4000-8000-0000000000d3', 'MR Personal Published Product', NOW(), 'personal', 'published', 'be000000-0000-4000-8000-000000000001');

-- media_registry rows, inserted DIRECTLY with fixed ids as the connecting
-- superuser (superuser bypasses RLS on INSERT, same as it bypasses grants —
-- this is fixture setup, not the thing under test). Fixed ids, not a
-- lookup-by-object_key helper, so the visibility assertions below never run
-- their own id resolution through the RLS policy under test — that lookup
-- would otherwise mask a fixture bug as a false "invisible" pass.
INSERT INTO public.media_registry (id, bucket, bucket_class, object_key, access_class, subject_type, subject_id)
VALUES
  ('be000000-0000-4000-8000-0000000000f1', 'patina-processed', 'artifacts', 'mr-test/project-bound.jpg',
   'authenticated_project', 'project', 'be000000-0000-4000-8000-0000000000e1'),
  ('be000000-0000-4000-8000-0000000000f2', 'patina-processed', 'artifacts', 'mr-test/catalog-published.jpg',
   'public_catalog', 'product', 'be000000-0000-4000-8000-0000000000d1'),
  ('be000000-0000-4000-8000-0000000000f3', 'patina-processed', 'artifacts', 'mr-test/catalog-draft.jpg',
   'public_catalog', 'product', 'be000000-0000-4000-8000-0000000000d2'),
  ('be000000-0000-4000-8000-0000000000f4', 'patina-processed', 'artifacts', 'mr-test/personal-published.jpg',
   'authenticated_project', 'product', 'be000000-0000-4000-8000-0000000000d3'),
  ('be000000-0000-4000-8000-0000000000f5', 'patina-processed', 'artifacts', 'mr-test/both-null.jpg',
   'authenticated_project', NULL, NULL),
  ('be000000-0000-4000-8000-0000000000f6', 'patina-processed', 'artifacts', 'mr-test/unknown-type.jpg',
   'authenticated_project', 'vendor', 'be000000-0000-4000-8000-0000000000e1');
   -- f6's subject_id points at a REAL project A can see — the arm must still refuse.

-- ─── helpers ─────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION pg_temp.assume_user(p_user_id UUID)
RETURNS VOID AS $$
BEGIN
  PERFORM set_config('role', 'authenticated', true);
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', p_user_id::text, 'role', 'authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION pg_temp.assume_user(UUID) TO PUBLIC;

CREATE OR REPLACE FUNCTION pg_temp.reset_role()
RETURNS VOID AS $$
BEGIN
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claims', NULL, true);
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION pg_temp.reset_role() TO PUBLIC;

-- ─── (a) project arm: owner sees it, unrelated designer does not ───────────
DO $$
DECLARE v_count int;
BEGIN
  PERFORM pg_temp.assume_user('be000000-0000-4000-8000-000000000001');  -- A, owns project_a
  SELECT count(*) INTO v_count FROM public.media_registry
   WHERE id = 'be000000-0000-4000-8000-0000000000f1';
  ASSERT v_count = 1, 'FAIL a1: project owner must see the project-bound row, got ' || v_count;
  PERFORM pg_temp.reset_role();

  PERFORM pg_temp.assume_user('be000000-0000-4000-8000-000000000002');  -- B, unrelated
  SELECT count(*) INTO v_count FROM public.media_registry
   WHERE id = 'be000000-0000-4000-8000-0000000000f1';
  ASSERT v_count = 0, 'FAIL a2 (CROSS-TENANT): an unrelated designer must not see another designer''s project-bound row, got ' || v_count;
  PERFORM pg_temp.reset_role();

  RAISE NOTICE 'media_registry_rls: case (a) passed.';
END $$;

-- ─── (b) product arm: catalog+published visible to anyone; wrong status or
--         wrong layer invisible to EVERYONE, including the product's owner ──
DO $$
DECLARE v_count int;
BEGIN
  PERFORM pg_temp.assume_user('be000000-0000-4000-8000-000000000002');  -- B, unrelated to A entirely
  SELECT count(*) INTO v_count FROM public.media_registry
   WHERE id = 'be000000-0000-4000-8000-0000000000f2';
  ASSERT v_count = 1, 'FAIL b1: catalog+published product media must be visible to ANY authenticated caller, got ' || v_count;

  SELECT count(*) INTO v_count FROM public.media_registry
   WHERE id = 'be000000-0000-4000-8000-0000000000f3';
  ASSERT v_count = 0, 'FAIL b2: catalog+draft product media must be invisible (status arm), got ' || v_count;
  PERFORM pg_temp.reset_role();

  -- Even A, who OWNS the personal/published product, cannot see its media —
  -- the product arm has no ownership branch, only layer=catalog+published.
  PERFORM pg_temp.assume_user('be000000-0000-4000-8000-000000000001');
  SELECT count(*) INTO v_count FROM public.media_registry
   WHERE id = 'be000000-0000-4000-8000-0000000000f4';
  ASSERT v_count = 0, 'FAIL b3: personal-layer product media must be invisible regardless of ownership (layer arm), got ' || v_count;
  PERFORM pg_temp.reset_role();

  RAISE NOTICE 'media_registry_rls: case (b) passed.';
END $$;

-- ─── (c) both-NULL invisible, even to the creating context ──────────────────
DO $$
DECLARE v_count int;
BEGIN
  PERFORM pg_temp.assume_user('be000000-0000-4000-8000-000000000001');
  SELECT count(*) INTO v_count FROM public.media_registry
   WHERE id = 'be000000-0000-4000-8000-0000000000f5';
  ASSERT v_count = 0, 'FAIL c1 (BOTH-NULL): a row with NULL subject_type/subject_id must be invisible, got ' || v_count;
  PERFORM pg_temp.reset_role();
  RAISE NOTICE 'media_registry_rls: case (c) passed.';
END $$;

-- ─── (d) unknown subject_type invisible even against a caller-visible subject ─
DO $$
DECLARE v_count int;
BEGIN
  PERFORM pg_temp.assume_user('be000000-0000-4000-8000-000000000001');  -- can see project_a directly
  SELECT count(*) INTO v_count FROM public.media_registry
   WHERE id = 'be000000-0000-4000-8000-0000000000f6';
  ASSERT v_count = 0, 'FAIL d1 (UNKNOWN SUBJECT_TYPE): subject_type=''vendor'' must be invisible even though subject_id resolves to a project this caller can see, got ' || v_count;
  PERFORM pg_temp.reset_role();
  RAISE NOTICE 'media_registry_rls: case (d) passed.';
END $$;

-- ─── (e) anon: zero grant, zero rows ────────────────────────────────────────
DO $$
DECLARE v_raised boolean := false;
BEGIN
  ASSERT NOT has_table_privilege('anon'::name, 'public.media_registry'::regclass, 'SELECT'),
    'FAIL e1: anon must not hold SELECT privilege on media_registry at all';

  BEGIN
    EXECUTE 'SET LOCAL ROLE anon';
    PERFORM 1 FROM public.media_registry LIMIT 1;
  EXCEPTION WHEN insufficient_privilege THEN v_raised := true;
  END;
  RESET ROLE;
  ASSERT v_raised, 'FAIL e2: anon querying media_registry must raise insufficient_privilege, not merely return zero rows';

  RAISE NOTICE 'media_registry_rls: case (e) passed.';
END $$;

-- ─── (f) ANTI-VACUITY — prove the assertions above can actually fail ────────
-- Widen the SELECT policy to USING (true), confirm a previously-invisible row
-- (both-NULL, from case c) becomes visible to A, then restore the EXACT
-- policy 00494 ships and confirm invisibility returns. If this block did not
-- exist, cases (a)-(d) could pass vacuously for reasons unrelated to the
-- policy actually working (e.g. a fixture bug making every row invisible).
DO $$
DECLARE v_count int;
BEGIN
  DROP POLICY IF EXISTS media_registry_select ON public.media_registry;
  CREATE POLICY media_registry_select ON public.media_registry
    FOR SELECT TO authenticated
    USING (true);

  PERFORM pg_temp.assume_user('be000000-0000-4000-8000-000000000001');
  SELECT count(*) INTO v_count FROM public.media_registry
   WHERE id = 'be000000-0000-4000-8000-0000000000f5';
  ASSERT v_count = 1,
    'FAIL f1 (ANTI-VACUITY SETUP BROKEN): widening the policy to USING (true) must make the both-NULL row visible — if it does not, case (c) above is not a meaningful assertion, got ' || v_count;
  PERFORM pg_temp.reset_role();

  -- Restore the real policy verbatim from 00494_media_registry.sql.
  DROP POLICY IF EXISTS media_registry_select ON public.media_registry;
  CREATE POLICY media_registry_select ON public.media_registry
    FOR SELECT TO authenticated
    USING (
      (
        subject_type = 'project'
        AND subject_id IS NOT NULL
        AND EXISTS (SELECT 1 FROM public.projects p WHERE p.id = media_registry.subject_id)
      )
      OR (
        subject_type = 'product'
        AND subject_id IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM public.products p
           WHERE p.id = media_registry.subject_id
             AND p.layer = 'catalog'
             AND p.status = 'published'
        )
      )
    );

  PERFORM pg_temp.assume_user('be000000-0000-4000-8000-000000000001');
  SELECT count(*) INTO v_count FROM public.media_registry
   WHERE id = 'be000000-0000-4000-8000-0000000000f5';
  ASSERT v_count = 0,
    'FAIL f2: after restoring the real policy the both-NULL row must be invisible again, got ' || v_count;
  PERFORM pg_temp.reset_role();

  RAISE NOTICE 'media_registry_rls: case (f) ANTI-VACUITY passed — assertions above are load-bearing.';
END $$;

ROLLBACK;
