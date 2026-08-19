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

-- ═══════════════════════════════════════════════════════════════════════════
-- 00498 — the upload interface (W3-A)
--
--   8.  Grant surface of the three new functions.
--   9.  EQUIVALENCE: caller_can_access_room_scan vs the REAL RLS on room_scans.
--   10. create_media_upload_intent — caller binding, key shape, idempotency.
--   11. confirm_media_upload — mismatch, match, double-confirm, invisibility.
--   12. The per-scan advisory lock, on both sides.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── extra fixtures: a designer-client, an association, and a stranger ───────
-- Carla holds a designer_clients row for Alice (00020 leg 2). Dana holds an
-- ACTIVE room_scan_associations row (00020 leg 3). Bob (above) holds nothing.

INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, instance_id, aud, role)
VALUES
  ('c5555555-5555-4555-8555-555555555555', 'scan-rls-carla@test.invalid', '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('d6666666-6666-4666-8666-666666666666', 'scan-rls-dana@test.invalid',  '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');

INSERT INTO profiles (id, email, full_name, created_at, updated_at)
VALUES
  ('c5555555-5555-4555-8555-555555555555', 'scan-rls-carla@test.invalid', 'Scan RLS Carla', NOW(), NOW()),
  ('d6666666-6666-4666-8666-666666666666', 'scan-rls-dana@test.invalid',  'Scan RLS Dana',  NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

INSERT INTO designer_clients (designer_id, client_id, status)
VALUES (
  'c5555555-5555-4555-8555-555555555555',
  'a1111111-1111-4111-8111-111111111111',
  'active'
);

INSERT INTO room_scan_associations (scan_id, consumer_id, designer_id, association_type, status, access_level)
VALUES (
  'c3333333-3333-4333-8333-333333333333',
  'a1111111-1111-4111-8111-111111111111',
  'd6666666-6666-4666-8666-666666666666',
  'explicit', 'active', 'full'
);

-- ─── 8: grant surface of the 00498 functions ────────────────────────────────
-- The two route RPCs are reachable by `authenticated` and by nobody else. The
-- visibility helper is reachable by NO role at all — it is only ever called
-- from inside a definer body, where the owner's privilege applies.

DO $$
DECLARE
  fn text;
BEGIN
  FOREACH fn IN ARRAY ARRAY[
    'public.create_media_upload_intent(uuid, text, text, text, text, bigint, text)',
    'public.confirm_media_upload(uuid, text, text, bigint)'
  ] LOOP
    ASSERT has_function_privilege('authenticated', fn, 'EXECUTE'),
      'FAIL 8a: authenticated must hold EXECUTE on ' || fn;
    ASSERT NOT has_function_privilege('anon', fn, 'EXECUTE'),
      'FAIL 8b: anon must NOT hold EXECUTE on ' || fn;
  END LOOP;
  RAISE NOTICE 'PASS 8a/8b: the two upload RPCs are authenticated-only';

  ASSERT NOT has_function_privilege('authenticated', 'public.caller_can_access_room_scan(uuid)', 'EXECUTE'),
    'FAIL 8c: caller_can_access_room_scan must not be directly callable by authenticated';
  ASSERT NOT has_function_privilege('anon', 'public.caller_can_access_room_scan(uuid)', 'EXECUTE'),
    'FAIL 8c: caller_can_access_room_scan must not be directly callable by anon';
  RAISE NOTICE 'PASS 8c: the visibility helper is callable only from inside a definer body';

  -- Both RPCs are SECURITY DEFINER with a pinned search_path — the 00490
  -- discipline. Asserted from the catalog rather than read from the file.
  ASSERT (SELECT bool_and(p.prosecdef AND p.proconfig @> ARRAY['search_path=public'])
            FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
           WHERE n.nspname = 'public'
             AND p.proname IN ('create_media_upload_intent', 'confirm_media_upload',
                               'caller_can_access_room_scan', 'room_files_scan_version_lock')),
    'FAIL 8d: every 00498 function must be SECURITY DEFINER with search_path pinned to public';
  RAISE NOTICE 'PASS 8d: all four 00498 functions are SECURITY DEFINER with a pinned search_path';
END $$;

-- ─── 9: EQUIVALENCE — the mirror must agree with the real policy ────────────
-- 00498's header explains why the mirror exists (a definer body cannot re-run
-- the caller's RLS). This is the gate that keeps it honest: for every fixture,
-- the helper's answer must equal what the REAL policies return under
-- `SET LOCAL ROLE authenticated` for that same user. A policy change this
-- mirror does not track fails HERE rather than opening a hole quietly.

DO $$
DECLARE
  actor        uuid;
  actors       uuid[] := ARRAY[
    'a1111111-1111-4111-8111-111111111111',  -- owner
    'b2222222-2222-4222-8222-222222222222',  -- stranger
    'c5555555-5555-4555-8555-555555555555',  -- designer-client
    'd6666666-6666-4666-8666-666666666666'   -- active association
  ]::uuid[];
  rls_visible  boolean;
  helper_says  boolean;
BEGIN
  FOREACH actor IN ARRAY actors LOOP
    -- The REAL answer: what room_scans' own policies return for this caller.
    PERFORM pg_temp.assume_user(actor);
    SELECT EXISTS (SELECT 1 FROM room_scans WHERE id = 'c3333333-3333-4333-8333-333333333333')
      INTO rls_visible;
    PERFORM pg_temp.reset_role();

    -- The MIRROR's answer, evaluated with the same claims but as the owner
    -- role (which is how a SECURITY DEFINER body sees it).
    PERFORM set_config(
      'request.jwt.claims',
      json_build_object('sub', actor::text, 'role', 'authenticated')::text,
      true
    );
    SELECT public.caller_can_access_room_scan('c3333333-3333-4333-8333-333333333333')
      INTO helper_says;
    PERFORM set_config('request.jwt.claims', NULL, true);

    ASSERT helper_says = rls_visible,
      'FAIL 9: caller_can_access_room_scan disagrees with room_scans RLS for ' || actor
      || ' (policy says ' || rls_visible || ', mirror says ' || helper_says || ')';
  END LOOP;

  -- And the shape the loop cannot prove on its own: the fixtures must not all
  -- be visible, or the equivalence above would hold vacuously.
  PERFORM pg_temp.assume_user('b2222222-2222-4222-8222-222222222222');
  ASSERT NOT EXISTS (SELECT 1 FROM room_scans WHERE id = 'c3333333-3333-4333-8333-333333333333'),
    'FAIL 9: the stranger fixture must NOT see the scan, or assertion 9 is vacuous';
  PERFORM pg_temp.reset_role();

  RAISE NOTICE 'PASS 9: the mirrored predicate agrees with room_scans RLS on all four fixtures';
END $$;

-- ─── 10: create_media_upload_intent ─────────────────────────────────────────

DO $$
DECLARE
  intent    jsonb;
  again     jsonb;
  regen     jsonb;
  bad       text;
  bad_args  text[] := ARRAY[
    'splat',            -- an ARTIFACT kind, not one of the bundle's originals
    'mesh/../escape'    -- traversal in the kind
  ];
BEGIN
  -- 10a: caller binding. Bob cannot see Alice's scan, so he cannot mint an
  -- intent against it — and the refusal is P0410, the errcode the Worker turns
  -- into a 404 rather than a 403.
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', 'b2222222-2222-4222-8222-222222222222', 'role', 'authenticated')::text,
    true
  );
  BEGIN
    PERFORM public.create_media_upload_intent(
      'c3333333-3333-4333-8333-333333333333', 'mesh', 'mesh.ply',
      'patina-staging-media-originals-us', repeat('a', 64), 2048,
      'application/octet-stream'
    );
    RAISE EXCEPTION 'FAIL 10a: Bob minted an upload intent against Alice''s scan';
  EXCEPTION
    WHEN SQLSTATE 'P0410' THEN
      RAISE NOTICE 'PASS 10a: a caller who cannot see the scan cannot mint an intent';
  END;

  -- 10b: the owner can, and the key is registry-keyed — no userId/roomId
  -- segment anywhere in it.
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', 'a1111111-1111-4111-8111-111111111111', 'role', 'authenticated')::text,
    true
  );
  intent := public.create_media_upload_intent(
    'c3333333-3333-4333-8333-333333333333', 'mesh', 'mesh.ply',
    'patina-staging-media-originals-us', repeat('a', 64), 2048,
    'application/octet-stream'
  );
  ASSERT intent ->> 'object_key'
    = 'scan_originals/c3333333-3333-4333-8333-333333333333/mesh/mesh.ply',
    'FAIL 10b: unexpected object key ' || (intent ->> 'object_key');
  ASSERT intent ->> 'lifecycle_state' = 'pending',
    'FAIL 10b: a fresh intent must be pending';
  ASSERT (intent ->> 'created')::boolean,
    'FAIL 10b: a fresh intent must report created';
  ASSERT (intent ->> 'object_key') NOT LIKE '%a1111111%',
    'FAIL 10b: the key must not carry the owner id — the registry carries authorization';
  RAISE NOTICE 'PASS 10b: the owner mints a pending, registry-keyed intent';

  -- 10c: idempotency. The same scan/kind/filename/checksum returns the SAME
  -- registry id while pending.
  again := public.create_media_upload_intent(
    'c3333333-3333-4333-8333-333333333333', 'mesh', 'mesh.ply',
    'patina-staging-media-originals-us', repeat('a', 64), 2048,
    'application/octet-stream'
  );
  ASSERT (again ->> 'object_id') = (intent ->> 'object_id'),
    'FAIL 10c: a repeated intent must return the same registry id';
  ASSERT NOT (again ->> 'created')::boolean,
    'FAIL 10c: a repeated intent must not report created';
  ASSERT (again ->> 'version')::int = (intent ->> 'version')::int,
    'FAIL 10c: a repeated intent must not bump the version';
  RAISE NOTICE 'PASS 10c: the intent is idempotent on the declared checksum';

  -- 10d: a DIFFERENT declared checksum for the same key is a new generation of
  -- that slot, not a second slot.
  regen := public.create_media_upload_intent(
    'c3333333-3333-4333-8333-333333333333', 'mesh', 'mesh.ply',
    'patina-staging-media-originals-us', repeat('b', 64), 4096,
    'application/octet-stream'
  );
  ASSERT (regen ->> 'object_id') = (intent ->> 'object_id'),
    'FAIL 10d: a re-declared intent must reuse the slot';
  ASSERT (regen ->> 'version')::int = (intent ->> 'version')::int + 1,
    'FAIL 10d: a re-declared intent must bump the version';
  RAISE NOTICE 'PASS 10d: a new declared checksum is a new generation of the same slot';

  -- 10e: argument rejection is P0411 — the Worker's 400, never a 404 or a row.
  FOREACH bad IN ARRAY bad_args LOOP
    BEGIN
      PERFORM public.create_media_upload_intent(
        'c3333333-3333-4333-8333-333333333333', bad, 'mesh.ply',
        'patina-staging-media-originals-us', repeat('a', 64), 2048,
        'application/octet-stream'
      );
      RAISE EXCEPTION 'FAIL 10e: artifact kind % was accepted', bad;
    EXCEPTION
      WHEN SQLSTATE 'P0411' THEN NULL;
    END;
  END LOOP;

  -- A nested filename would move the object out of its slot.
  BEGIN
    PERFORM public.create_media_upload_intent(
      'c3333333-3333-4333-8333-333333333333', 'mesh', 'nested/mesh.ply',
      'patina-staging-media-originals-us', repeat('a', 64), 2048,
      'application/octet-stream'
    );
    RAISE EXCEPTION 'FAIL 10e: a nested filename was accepted';
  EXCEPTION
    WHEN SQLSTATE 'P0411' THEN NULL;
  END;

  -- The ARTIFACTS bucket must be unreachable from this RPC: a caller who
  -- reached it directly could otherwise register a row that shadows a
  -- pipeline output.
  BEGIN
    PERFORM public.create_media_upload_intent(
      'c3333333-3333-4333-8333-333333333333', 'mesh', 'mesh.ply',
      'patina-staging-media-artifacts-us', repeat('a', 64), 2048,
      'application/octet-stream'
    );
    RAISE EXCEPTION 'FAIL 10e: the artifacts bucket was accepted by the upload intent';
  EXCEPTION
    WHEN SQLSTATE 'P0411' THEN NULL;
  END;
  RAISE NOTICE 'PASS 10e: malformed kinds, nested filenames, and the artifacts bucket are all refused';

  PERFORM set_config('request.jwt.claims', NULL, true);
END $$;

-- ─── 11: confirm_media_upload ───────────────────────────────────────────────

DO $$
DECLARE
  intent   jsonb;
  target   uuid;
  result   jsonb;
  state    text;
BEGIN
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', 'a1111111-1111-4111-8111-111111111111', 'role', 'authenticated')::text,
    true
  );
  intent := public.create_media_upload_intent(
    'c3333333-3333-4333-8333-333333333333', 'usdz', 'room.usdz',
    'patina-staging-media-originals-us', repeat('c', 64), 1024,
    'model/vnd.usdz+zip'
  );
  target := (intent ->> 'object_id')::uuid;

  -- 11a: a size disagreement is P0412 and leaves the row PENDING — the object
  -- stays unservable and the client can simply re-PUT.
  BEGIN
    PERFORM public.confirm_media_upload(target, repeat('c', 64), '"etag"', 999);
    RAISE EXCEPTION 'FAIL 11a: a size mismatch was confirmed';
  EXCEPTION
    WHEN SQLSTATE 'P0412' THEN NULL;
  END;
  SELECT lifecycle_state INTO state FROM media_objects WHERE id = target;
  ASSERT state = 'pending', 'FAIL 11a: a refused confirm must leave the row pending, got ' || state;

  -- 11b: a checksum disagreement, likewise.
  BEGIN
    PERFORM public.confirm_media_upload(target, repeat('d', 64), '"etag"', 1024);
    RAISE EXCEPTION 'FAIL 11b: a checksum mismatch was confirmed';
  EXCEPTION
    WHEN SQLSTATE 'P0412' THEN NULL;
  END;
  SELECT lifecycle_state INTO state FROM media_objects WHERE id = target;
  ASSERT state = 'pending', 'FAIL 11b: a refused confirm must leave the row pending, got ' || state;
  RAISE NOTICE 'PASS 11a/11b: a mismatch refuses with P0412 and leaves the row pending';

  -- 11c: a match lands `stored` and records HOW the checksum was established.
  result := public.confirm_media_upload(target, repeat('c', 64), '"real-etag"', 1024);
  ASSERT result ->> 'lifecycle_state' = 'stored',
    'FAIL 11c: a matching confirm must land stored';
  ASSERT (result ->> 'changed')::boolean,
    'FAIL 11c: the first confirm must report a change';
  ASSERT (SELECT provenance ->> 'sha256_verified_by' FROM media_objects WHERE id = target) = 'r2_head',
    'FAIL 11c: an observed checksum must be recorded as r2_head';
  RAISE NOTICE 'PASS 11c: a matching confirm stores the object and records its assurance';

  -- 11d: a retried confirm of the SAME bytes is idempotent, not an error — a
  -- client cannot tell a lost response from a lost upload.
  result := public.confirm_media_upload(target, repeat('c', 64), '"real-etag"', 1024);
  ASSERT result ->> 'lifecycle_state' = 'stored',
    'FAIL 11d: a repeated confirm must stay stored';
  ASSERT NOT (result ->> 'changed')::boolean,
    'FAIL 11d: a repeated confirm must report no change';

  -- But DIFFERENT bytes for an already-stored object is a real conflict.
  BEGIN
    PERFORM public.confirm_media_upload(target, repeat('e', 64), '"other"', 4096);
    RAISE EXCEPTION 'FAIL 11d: a stored object was re-confirmed with different bytes';
  EXCEPTION
    WHEN SQLSTATE 'P0413' THEN NULL;
  END;
  RAISE NOTICE 'PASS 11d: a repeated confirm is idempotent; different bytes are refused';

  -- 11e: the mood-board bug class on the confirm leg. Bob cannot confirm an
  -- object he cannot see, and the refusal is the same P0410 an absent object
  -- gets — nothing tells him the row exists.
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', 'b2222222-2222-4222-8222-222222222222', 'role', 'authenticated')::text,
    true
  );
  BEGIN
    PERFORM public.confirm_media_upload(target, repeat('c', 64), '"real-etag"', 1024);
    RAISE EXCEPTION 'FAIL 11e: Bob confirmed an upload against Alice''s scan';
  EXCEPTION
    WHEN SQLSTATE 'P0410' THEN NULL;
  END;
  -- ...and an id that does not exist at all raises the SAME errcode.
  BEGIN
    PERFORM public.confirm_media_upload(
      'f7777777-7777-4777-8777-777777777777', repeat('c', 64), '"x"', 1024
    );
    RAISE EXCEPTION 'FAIL 11e: a nonexistent object did not raise P0410';
  EXCEPTION
    WHEN SQLSTATE 'P0410' THEN NULL;
  END;
  RAISE NOTICE 'PASS 11e: invisible and absent are the same refusal on the confirm leg';

  PERFORM set_config('request.jwt.claims', NULL, true);
END $$;

-- ─── 12: the per-scan advisory lock, on BOTH sides ──────────────────────────
-- 00492 documented an insert-side residual it could not close from the merge
-- side alone. Closing it means both paths taking the same lock, so both are
-- asserted — a fix present on only one side is no fix at all.

DO $$
DECLARE
  merge_body text;
  lock_body  text;
BEGIN
  ASSERT EXISTS (
    SELECT 1 FROM pg_trigger t
     JOIN pg_class c ON c.oid = t.tgrelid
     JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'room_files'
      AND t.tgname = 'trg_room_files_scan_version_lock'
      AND NOT t.tgisinternal
  ), 'FAIL 12a: the BEFORE INSERT lock trigger is missing from room_files';

  SELECT pg_get_functiondef(p.oid) INTO lock_body
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'room_files_scan_version_lock';
  ASSERT lock_body LIKE '%pg_advisory_xact_lock(498%',
    'FAIL 12a: the insert-side trigger does not take the per-scan advisory lock';

  SELECT pg_get_functiondef(p.oid) INTO merge_body
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'scan_worker_update_room_file';
  ASSERT merge_body LIKE '%pg_advisory_xact_lock(498%',
    'FAIL 12b: the merge side does not take the per-scan advisory lock';
  -- The lock must be taken BEFORE the max(version) read, or it serializes
  -- nothing that matters.
  ASSERT position('pg_advisory_xact_lock(498' in merge_body)
       < position('max(rf.version)' in merge_body),
    'FAIL 12b: the merge side takes the lock AFTER reading max(version)';
  -- And 00492's gate itself must still be there — this migration replaced that
  -- body, so its refusal is restated here rather than assumed.
  ASSERT merge_body LIKE '%P0404%',
    'FAIL 12b: 00492''s stale-version refusal was lost in the 00498 replace';
  ASSERT merge_body LIKE '%P0403%',
    'FAIL 12b: 00490''s lease refusal was lost in the 00498 replace';

  RAISE NOTICE 'PASS 12: both the insert and merge paths take pg_advisory_xact_lock(498, hashtext(scan_id))';
END $$;

-- ─── done — rollback so this file is re-runnable ────────────────────────────
DO $$ BEGIN RAISE NOTICE 'scan_roles_conformance_test.sql: ALL ASSERTIONS PASSED'; END $$;

ROLLBACK;
