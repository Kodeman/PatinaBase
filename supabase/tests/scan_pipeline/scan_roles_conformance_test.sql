-- ═══════════════════════════════════════════════════════════════════════════
-- scan_roles_conformance_test.sql — ACL conformance for scan_worker/scan_reader
-- (Rendered Room v2 · 00489/00490)
--
-- Modelled on the edge_api conformance gate
-- (`git show origin/phase1-close/staging-ready:supabase/tests/edge_api/catalog_roles_test.sql`),
-- at a scope proportionate to this program's W0 kernel: no out-of-band LOGIN
-- roles exist yet (00490's header documents them; they are provisioned per
-- environment, never in a migration), so this gate works entirely through
-- catalog introspection plus SET LOCAL ROLE against the NOLOGIN group roles —
-- it never needs a real login credential to prove the grant surface.
--
-- Asserts, keyed on EXPLICIT grantee (never PUBLIC's implicit default —
-- aclexplode(NULL) yields zero rows, so an object that was never customized
-- cannot masquerade as "granted to scan_worker"):
--   1. scan_worker holds EXECUTE on exactly its six wrapper/kernel functions.
--   2. scan_worker holds ZERO table/view-level grants (no table grants, per
--      plan §2 R2).
--   3. scan_reader holds SELECT on exactly the scan_media_read view.
--   4. scan_reader holds ZERO function-level grants.
--   5. Negative probe: a forbidden grant to scan_worker, added inside a
--      SAVEPOINT, makes assertion (1) FAIL — proving the gate is not vacuous —
--      then the savepoint is rolled back and assertion (1) passes again.
--   6. Caller-binding negative test for media_objects RLS — the mood-board bug
--      class: a second, unrelated user must get ZERO rows for another owner's
--      scan media, not merely "the scan exists" (00337-shape delegation).
--   7. media_objects GRANT surface, asserted in the catalog per privilege:
--      anon holds nothing, authenticated holds SELECT and only SELECT. This
--      replaces an earlier anon row-count probe, which could not discriminate
--      — RLS returns zero rows for anon whether or not the GRANT exists.
--
-- How to run (after `pnpm supabase:reset`):
--   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" \
--     -X -v ON_ERROR_STOP=1 -f supabase/tests/scan_pipeline/scan_roles_conformance_test.sql
--
-- Whole file is one transaction; ROLLBACK at the end makes it re-runnable.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─── helpers (pg_temp — session-local, gone at ROLLBACK) ────────────────────

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

-- Supabase's 2026-05-30 grant-default flip dropped PUBLIC's implicit EXECUTE on
-- newly created functions — pg_temp ones included. `reset_role` is called from
-- inside a DO block AFTER `SET LOCAL ROLE authenticated`, i.e. as a role that
-- now holds nothing on it, so without this the RLS section dies on
-- "permission denied for function reset_role" against a fresh `supabase:reset`.
-- (The same latent break sits in supabase/tests/rls/products_three_layer_test.sql
-- and every other pg_temp-helper test in the repo; fixing those is not this
-- lane's to do, but the cause is identical.)
GRANT EXECUTE ON FUNCTION pg_temp.assume_user(uuid) TO PUBLIC;
GRANT EXECUTE ON FUNCTION pg_temp.reset_role() TO PUBLIC;

-- Exact-set assertions, key on EXPLICIT grantee (never PUBLIC's implicit
-- default). Both raise a stable, greppable message on mismatch so the
-- negative probe below can assert on the message shape, not just "it threw."
CREATE OR REPLACE FUNCTION pg_temp.assert_exact_function_grants(p_role text, p_expected text[])
RETURNS VOID AS $$
DECLARE
  v_actual text[];
  v_missing text[];
  v_extra text[];
BEGIN
  SELECT coalesce(array_agg(DISTINCT p.proname ORDER BY p.proname), ARRAY[]::text[])
    INTO v_actual
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    JOIN LATERAL aclexplode(p.proacl) a ON true
    JOIN pg_roles r ON r.oid = a.grantee
   WHERE n.nspname = 'public'
     AND r.rolname = p_role
     AND a.privilege_type = 'EXECUTE';

  SELECT coalesce(array_agg(x ORDER BY x), ARRAY[]::text[]) INTO v_missing
    FROM unnest(p_expected) x WHERE NOT (x = ANY (v_actual));
  SELECT coalesce(array_agg(x ORDER BY x), ARRAY[]::text[]) INTO v_extra
    FROM unnest(v_actual) x WHERE NOT (x = ANY (p_expected));

  IF array_length(v_missing, 1) IS NOT NULL OR array_length(v_extra, 1) IS NOT NULL THEN
    RAISE EXCEPTION '% function grant mismatch — missing: %, extra: %', p_role, v_missing, v_extra;
  END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION pg_temp.assert_exact_relation_grants(p_role text, p_expected text[])
RETURNS VOID AS $$
DECLARE
  v_actual text[];
  v_missing text[];
  v_extra text[];
BEGIN
  SELECT coalesce(array_agg(DISTINCT c.relname ORDER BY c.relname), ARRAY[]::text[])
    INTO v_actual
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN LATERAL aclexplode(c.relacl) a ON true
    JOIN pg_roles r ON r.oid = a.grantee
   WHERE n.nspname = 'public'
     AND r.rolname = p_role;

  SELECT coalesce(array_agg(x ORDER BY x), ARRAY[]::text[]) INTO v_missing
    FROM unnest(p_expected) x WHERE NOT (x = ANY (v_actual));
  SELECT coalesce(array_agg(x ORDER BY x), ARRAY[]::text[]) INTO v_extra
    FROM unnest(v_actual) x WHERE NOT (x = ANY (p_expected));

  IF array_length(v_missing, 1) IS NOT NULL OR array_length(v_extra, 1) IS NOT NULL THEN
    RAISE EXCEPTION '% relation grant mismatch — missing: %, extra: %', p_role, v_missing, v_extra;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- ─── 1/2/3/4: baseline exact-set assertions ──────────────────────────────────

DO $$
BEGIN
  PERFORM pg_temp.assert_exact_function_grants('scan_worker', ARRAY[
    'mark_media_object_state',
    'register_media_object',
    'scan_worker_append_event',
    'scan_worker_complete_task',
    'scan_worker_fail_task',
    'scan_worker_update_room_file'
  ]);
  RAISE NOTICE 'PASS 1: scan_worker holds EXACTLY its six granted functions';

  PERFORM pg_temp.assert_exact_relation_grants('scan_worker', ARRAY[]::text[]);
  RAISE NOTICE 'PASS 2: scan_worker holds ZERO table/view grants';

  PERFORM pg_temp.assert_exact_relation_grants('scan_reader', ARRAY['scan_media_read']);
  RAISE NOTICE 'PASS 3: scan_reader holds EXACTLY scan_media_read';

  PERFORM pg_temp.assert_exact_function_grants('scan_reader', ARRAY[]::text[]);
  RAISE NOTICE 'PASS 4: scan_reader holds ZERO function grants';
END $$;

-- ─── 5: negative probe — the gate must not be vacuous ────────────────────────

SAVEPOINT before_negative_probe;

-- Grant scan_worker something it must NEVER have. agent_queue_stats() is an
-- arbitrary, unrelated, already-existing service_role-only RPC (00297) —
-- picked precisely because it has nothing to do with the scan pipeline.
GRANT EXECUTE ON FUNCTION public.agent_queue_stats() TO scan_worker;

DO $$
BEGIN
  BEGIN
    PERFORM pg_temp.assert_exact_function_grants('scan_worker', ARRAY[
      'mark_media_object_state',
      'register_media_object',
      'scan_worker_append_event',
      'scan_worker_complete_task',
      'scan_worker_fail_task',
      'scan_worker_update_room_file'
    ]);
    RAISE EXCEPTION 'GATE IS VACUOUS: exact-set assertion passed despite an injected forbidden grant';
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM LIKE 'scan_worker function grant mismatch%agent_queue_stats%' THEN
        RAISE NOTICE 'PASS 5a: negative probe correctly tripped the gate (%)', SQLERRM;
      ELSE
        RAISE;
      END IF;
  END;
END $$;

ROLLBACK TO SAVEPOINT before_negative_probe;

DO $$
BEGIN
  PERFORM pg_temp.assert_exact_function_grants('scan_worker', ARRAY[
    'mark_media_object_state',
    'register_media_object',
    'scan_worker_append_event',
    'scan_worker_complete_task',
    'scan_worker_fail_task',
    'scan_worker_update_room_file'
  ]);
  RAISE NOTICE 'PASS 5b: rollback undid the forbidden grant — gate is clean again';
END $$;

-- ─── 6: media_objects RLS caller-binding negative test (mood-board bug class) ─
-- The predicate must prove the CALLER can see the scan, not merely that the
-- scan exists (00337-shape delegation to room_scans' own RLS).

INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, instance_id, aud, role)
VALUES
  ('a1111111-1111-4111-8111-111111111111', 'scan-rls-alice@test.invalid', '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('b2222222-2222-4222-8222-222222222222', 'scan-rls-bob@test.invalid',   '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');

INSERT INTO profiles (id, email, full_name, created_at, updated_at)
VALUES
  ('a1111111-1111-4111-8111-111111111111', 'scan-rls-alice@test.invalid', 'Scan RLS Alice', NOW(), NOW()),
  ('b2222222-2222-4222-8222-222222222222', 'scan-rls-bob@test.invalid',   'Scan RLS Bob',   NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

INSERT INTO room_scans (id, user_id, name, status)
VALUES ('c3333333-3333-4333-8333-333333333333', 'a1111111-1111-4111-8111-111111111111', 'Alice''s scan', 'ready');

-- Fixed literal id (not fetched via \gset) so it can be referenced directly
-- inside the dollar-quoted DO block below — psql's client-side :'var'
-- substitution does not reach inside $$ ... $$ bodies (by design, so a
-- literal ':' in plpgsql text is never misread as a psql variable), so this
-- test follows the same fixed-literal-UUID idiom as
-- supabase/tests/rls/products_three_layer_test.sql rather than \gset.
INSERT INTO media_objects (id, bucket, object_key, access_class, lifecycle_state, scan_id)
VALUES (
  'd4444444-4444-4444-8444-444444444444',
  'patina-staging-media-artifacts-us', 'scans/rls-test/1/mesh.glb',
  'authenticated_project', 'stored', 'c3333333-3333-4333-8333-333333333333'
);

DO $$
DECLARE
  visible_count INTEGER;
BEGIN
  -- Case 6a: Alice (scan owner) sees her own media object.
  PERFORM pg_temp.assume_user('a1111111-1111-4111-8111-111111111111');
  SELECT COUNT(*) INTO visible_count FROM media_objects WHERE id = 'd4444444-4444-4444-8444-444444444444';
  ASSERT visible_count = 1, 'FAIL 6a: Alice should see her own scan''s media object, got ' || visible_count;
  PERFORM pg_temp.reset_role();

  -- Case 6b (the mood-board bug class): Bob is an unrelated authenticated
  -- user with NO association to Alice's scan. The media_objects policy
  -- delegates to room_scans' RLS, which must actually bind the CALLER — not
  -- merely prove the scan row exists. Bob must get ZERO rows.
  PERFORM pg_temp.assume_user('b2222222-2222-4222-8222-222222222222');
  SELECT COUNT(*) INTO visible_count FROM media_objects WHERE id = 'd4444444-4444-4444-8444-444444444444';
  ASSERT visible_count = 0, 'FAIL 6b: Bob must NOT see Alice''s scan media object (mood-board bug class), got ' || visible_count;
  PERFORM pg_temp.reset_role();

  RAISE NOTICE 'PASS 6: media_objects RLS correctly binds the caller, not merely the scan''s existence';
END $$;

-- ─── 7: media_objects grant surface (00489 negative space) ───────────────────
-- A row-count probe as anon proves almost nothing: RLS alone returns zero rows
-- for anon whether or not anon holds SELECT, so the probe passes identically on
-- a table anon can read and one it cannot. The grant surface is the real
-- boundary — assert it in the catalog instead, per privilege, in both
-- directions: anon holds NOTHING, authenticated holds SELECT and ONLY SELECT.

DO $$
DECLARE
  priv text;
BEGIN
  FOREACH priv IN ARRAY ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER'] LOOP
    ASSERT NOT has_table_privilege('anon', 'public.media_objects', priv),
      'FAIL 7a: anon must hold NO privilege on media_objects, holds ' || priv;
  END LOOP;
  RAISE NOTICE 'PASS 7a: anon holds zero privileges on media_objects';

  ASSERT has_table_privilege('authenticated', 'public.media_objects', 'SELECT'),
    'FAIL 7b: authenticated must hold SELECT on media_objects';
  FOREACH priv IN ARRAY ARRAY['INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER'] LOOP
    ASSERT NOT has_table_privilege('authenticated', 'public.media_objects', priv),
      'FAIL 7b: authenticated must hold SELECT only on media_objects, also holds ' || priv;
  END LOOP;
  RAISE NOTICE 'PASS 7b: authenticated holds SELECT and only SELECT on media_objects';
END $$;

-- ─── done — rollback so this file is re-runnable ────────────────────────────
DO $$ BEGIN RAISE NOTICE 'scan_roles_conformance_test.sql: ALL ASSERTIONS PASSED'; END $$;

ROLLBACK;
