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

-- ─── extra fixtures: every leg of room_scans' visibility, in BOTH directions ─
-- Assertion 9 below is an EQUIVALENCE gate, and an equivalence gate is only as
-- good as its fixtures: if every actor is invisible, "mirror agrees with policy"
-- holds vacuously, and if every actor is visible, a mirror that returned a bare
-- `true` would pass. So each of the four legs gets a POSITIVE fixture that must
-- be visible and a NEGATIVE one that must not, and assertion 9 pins the expected
-- direction per actor rather than only comparing the two answers.
--
--   leg                     positive        negative
--   00014 owner             Alice           Bob (holds nothing)
--   00020 designer-client   Carla           Gina  (holds a row for the WRONG client)
--   00020 association       Dana  (active)  Iris  (revoked)
--   00316 studio co-member  Emma  (Carla's  Fiona (active member of a DIFFERENT
--                                  studio)          organization)
--
-- Hank is a fifth actor and a deliberate ODDITY: he holds a designer_clients row
-- for Alice with status 'completed'. He is asserted VISIBLE, because the 00020
-- policy's designer-client leg filters on nothing but (designer_id, client_id)
-- — there is no status predicate on that leg at all (00020:138-156), and the
-- 00316 studio leg is unfiltered the same way. That is a surprising property
-- worth pinning: if someone later narrows the policy to `status = 'active'`
-- without narrowing caller_can_access_room_scan to match, Hank's row is what
-- catches the drift.

INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, instance_id, aud, role)
VALUES
  ('c5555555-5555-4555-8555-555555555555', 'scan-rls-carla@test.invalid', '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('d6666666-6666-4666-8666-666666666666', 'scan-rls-dana@test.invalid',  '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('e7777777-7777-4777-8777-777777777777', 'scan-rls-emma@test.invalid',  '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('f8888888-8888-4888-8888-888888888888', 'scan-rls-fiona@test.invalid', '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('a9999999-9999-4999-8999-999999999999', 'scan-rls-gina@test.invalid',  '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('ba111111-1111-4111-8111-111111111111', 'scan-rls-iris@test.invalid',  '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('cb222222-2222-4222-8222-222222222222', 'scan-rls-hank@test.invalid',  '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');

INSERT INTO profiles (id, email, full_name, created_at, updated_at)
VALUES
  ('c5555555-5555-4555-8555-555555555555', 'scan-rls-carla@test.invalid', 'Scan RLS Carla', NOW(), NOW()),
  ('d6666666-6666-4666-8666-666666666666', 'scan-rls-dana@test.invalid',  'Scan RLS Dana',  NOW(), NOW()),
  ('e7777777-7777-4777-8777-777777777777', 'scan-rls-emma@test.invalid',  'Scan RLS Emma',  NOW(), NOW()),
  ('f8888888-8888-4888-8888-888888888888', 'scan-rls-fiona@test.invalid', 'Scan RLS Fiona', NOW(), NOW()),
  ('a9999999-9999-4999-8999-999999999999', 'scan-rls-gina@test.invalid',  'Scan RLS Gina',  NOW(), NOW()),
  ('ba111111-1111-4111-8111-111111111111', 'scan-rls-iris@test.invalid',  'Scan RLS Iris',  NOW(), NOW()),
  ('cb222222-2222-4222-8222-222222222222', 'scan-rls-hank@test.invalid',  'Scan RLS Hank',  NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

-- 00020 leg 2, positive: Carla holds an active designer_clients row for Alice.
-- Gina, the negative, holds one for BOB — the leg must bind on the SCAN OWNER,
-- not merely on the caller holding some client relationship somewhere.
-- Hank's is 'completed' (see the note above: still visible, deliberately).
INSERT INTO designer_clients (designer_id, client_id, status)
VALUES
  ('c5555555-5555-4555-8555-555555555555', 'a1111111-1111-4111-8111-111111111111', 'active'),
  ('a9999999-9999-4999-8999-999999999999', 'b2222222-2222-4222-8222-222222222222', 'active'),
  ('cb222222-2222-4222-8222-222222222222', 'a1111111-1111-4111-8111-111111111111', 'completed');

-- 00020 leg 3, positive and negative: Dana's association is active, Iris's is
-- revoked. UNIQUE(scan_id, designer_id) is why these are two different actors.
INSERT INTO room_scan_associations (scan_id, consumer_id, designer_id, association_type, status, access_level)
VALUES
  ('c3333333-3333-4333-8333-333333333333', 'a1111111-1111-4111-8111-111111111111',
   'd6666666-6666-4666-8666-666666666666', 'explicit', 'active',  'full'),
  ('c3333333-3333-4333-8333-333333333333', 'a1111111-1111-4111-8111-111111111111',
   'ba111111-1111-4111-8111-111111111111', 'explicit', 'revoked', 'full');

-- 00316 leg: is_studio_comember (00315) requires both users to hold an
-- organization_members row in the SAME organization, both 'active', both with a
-- role other than 'guest'. Emma shares Carla's studio, so she reaches Alice's
-- scan through Carla's client relationship. Fiona is an equally active member of
-- a DIFFERENT organization, which must not reach anything.
INSERT INTO organizations (id, type, name, slug)
VALUES
  ('cc333333-3333-4333-8333-333333333333', 'design_studio', 'Scan RLS Studio', 'scan-rls-studio'),
  ('dd444444-4444-4444-8444-444444444444', 'design_studio', 'Scan RLS Other',  'scan-rls-other');

INSERT INTO organization_members (user_id, organization_id, role, status)
VALUES
  ('c5555555-5555-4555-8555-555555555555', 'cc333333-3333-4333-8333-333333333333', 'owner',  'active'),
  ('e7777777-7777-4777-8777-777777777777', 'cc333333-3333-4333-8333-333333333333', 'member', 'active'),
  ('f8888888-8888-4888-8888-888888888888', 'dd444444-4444-4444-8444-444444444444', 'owner',  'active');

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
--
-- Equivalence ALONE is not enough, and that was the review's finding: a mirror
-- that always returned `false` would satisfy it on an all-invisible fixture set,
-- and a policy that had been widened to `true` would satisfy it on an
-- all-visible one. So each actor carries its EXPECTED direction, asserted
-- against the real policy before the two answers are compared. Every leg of
-- room_scans' visibility is represented in both directions (see the fixture
-- note above), so drift in EITHER direction — a policy that stops granting, or
-- a mirror that starts — trips this gate.

DO $$
DECLARE
  actor        uuid;
  expected     boolean;
  leg          text;
  rls_visible  boolean;
  helper_says  boolean;
  cases        text[][] := ARRAY[
    -- actor                                   expected  leg
    ARRAY['a1111111-1111-4111-8111-111111111111', 'true',  '00014 owner'],
    ARRAY['b2222222-2222-4222-8222-222222222222', 'false', 'unrelated stranger'],
    ARRAY['c5555555-5555-4555-8555-555555555555', 'true',  '00020 designer-client (active)'],
    ARRAY['cb222222-2222-4222-8222-222222222222', 'true',  '00020 designer-client (completed — the leg has no status filter)'],
    ARRAY['a9999999-9999-4999-8999-999999999999', 'false', '00020 designer-client for a DIFFERENT client'],
    ARRAY['d6666666-6666-4666-8666-666666666666', 'true',  '00020 association (active)'],
    ARRAY['ba111111-1111-4111-8111-111111111111', 'false', '00020 association (revoked)'],
    ARRAY['e7777777-7777-4777-8777-777777777777', 'true',  '00316 studio co-member'],
    ARRAY['f8888888-8888-4888-8888-888888888888', 'false', '00316 member of a DIFFERENT organization']
  ];
  i            int;
BEGIN
  FOR i IN 1 .. array_length(cases, 1) LOOP
    actor    := cases[i][1]::uuid;
    expected := cases[i][2]::boolean;
    leg      := cases[i][3];

    -- The REAL answer: what room_scans' own policies return for this caller.
    PERFORM pg_temp.assume_user(actor);
    SELECT EXISTS (SELECT 1 FROM room_scans WHERE id = 'c3333333-3333-4333-8333-333333333333')
      INTO rls_visible;
    PERFORM pg_temp.reset_role();

    -- DIRECTION, asserted against the policy itself. This is what stops the
    -- equivalence below from holding vacuously in either direction.
    ASSERT rls_visible = expected,
      'FAIL 9a: room_scans RLS gives ' || rls_visible || ' for ' || leg
      || ' (' || actor || '), expected ' || expected
      || ' — the fixture or the policy has moved';

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
      'FAIL 9b: caller_can_access_room_scan disagrees with room_scans RLS for '
      || leg || ' (' || actor || ')'
      || ' (policy says ' || rls_visible || ', mirror says ' || helper_says || ')';
  END LOOP;

  RAISE NOTICE 'PASS 9: the mirrored predicate agrees with room_scans RLS, in the expected direction, on all % fixtures across all four legs', array_length(cases, 1);
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

  -- 10f: 00500 — bundleArchive (the Patina client's whole-bundle zip) and
  -- keyframesArchive (Field's keyframes.tar) share the legacy Supabase
  -- Storage `bundle` folder / `scan_bundle_url` column, but must be TWO
  -- DISTINCT kinds here: each is a separate registry key
  -- (`scan_originals/{scanId}/{artifactKind}/{filename}`), and neither
  -- collides with or overwrites the other's slot.
  DECLARE
    bundle_intent    jsonb;
    keyframes_intent jsonb;
  BEGIN
    bundle_intent := public.create_media_upload_intent(
      'c3333333-3333-4333-8333-333333333333', 'bundleArchive', 'bundle.zip',
      'patina-staging-media-originals-us', repeat('a', 64), 2048,
      'application/octet-stream'
    );
    keyframes_intent := public.create_media_upload_intent(
      'c3333333-3333-4333-8333-333333333333', 'keyframesArchive', 'keyframes.tar',
      'patina-staging-media-originals-us', repeat('a', 64), 2048,
      'application/octet-stream'
    );
    ASSERT bundle_intent ->> 'object_key'
      = 'scan_originals/c3333333-3333-4333-8333-333333333333/bundleArchive/bundle.zip',
      'FAIL 10f: unexpected bundleArchive object key ' || (bundle_intent ->> 'object_key');
    ASSERT keyframes_intent ->> 'object_key'
      = 'scan_originals/c3333333-3333-4333-8333-333333333333/keyframesArchive/keyframes.tar',
      'FAIL 10f: unexpected keyframesArchive object key ' || (keyframes_intent ->> 'object_key');
    ASSERT (bundle_intent ->> 'object_id') <> (keyframes_intent ->> 'object_id'),
      'FAIL 10f: bundleArchive and keyframesArchive must not resolve to the same registry row';
    RAISE NOTICE 'PASS 10f: bundleArchive and keyframesArchive are distinct kinds with distinct registry keys';
  END;

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
    PERFORM public.confirm_media_upload(target, repeat('c', 64), '"' || repeat('1', 32) || '"', 999);
    RAISE EXCEPTION 'FAIL 11a: a size mismatch was confirmed';
  EXCEPTION
    WHEN SQLSTATE 'P0412' THEN NULL;
  END;
  SELECT lifecycle_state INTO state FROM media_objects WHERE id = target;
  ASSERT state = 'pending', 'FAIL 11a: a refused confirm must leave the row pending, got ' || state;

  -- 11b: a checksum disagreement, likewise.
  BEGIN
    PERFORM public.confirm_media_upload(target, repeat('d', 64), '"' || repeat('1', 32) || '"', 1024);
    RAISE EXCEPTION 'FAIL 11b: a checksum mismatch was confirmed';
  EXCEPTION
    WHEN SQLSTATE 'P0412' THEN NULL;
  END;
  SELECT lifecycle_state INTO state FROM media_objects WHERE id = target;
  ASSERT state = 'pending', 'FAIL 11b: a refused confirm must leave the row pending, got ' || state;
  RAISE NOTICE 'PASS 11a/11b: a mismatch refuses with P0412 and leaves the row pending';

  -- 11c: a match lands `stored` and records HOW the checksum was established.
  result := public.confirm_media_upload(target, repeat('c', 64), '"' || repeat('2', 32) || '"', 1024);
  ASSERT result ->> 'lifecycle_state' = 'stored',
    'FAIL 11c: a matching confirm must land stored';
  ASSERT (result ->> 'changed')::boolean,
    'FAIL 11c: the first confirm must report a change';
  ASSERT (SELECT provenance ->> 'sha256_verified_by' FROM media_objects WHERE id = target) = 'r2_head',
    'FAIL 11c: an observed checksum must be recorded as r2_head';
  RAISE NOTICE 'PASS 11c: a matching confirm stores the object and records its assurance';

  -- 11d: a retried confirm of the SAME bytes is idempotent, not an error — a
  -- client cannot tell a lost response from a lost upload.
  result := public.confirm_media_upload(target, repeat('c', 64), '"' || repeat('2', 32) || '"', 1024);
  ASSERT result ->> 'lifecycle_state' = 'stored',
    'FAIL 11d: a repeated confirm must stay stored';
  ASSERT NOT (result ->> 'changed')::boolean,
    'FAIL 11d: a repeated confirm must report no change';

  -- But DIFFERENT bytes for an already-stored object is a real conflict.
  BEGIN
    PERFORM public.confirm_media_upload(target, repeat('e', 64), '"' || repeat('3', 32) || '"', 4096);
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
    PERFORM public.confirm_media_upload(target, repeat('c', 64), '"' || repeat('2', 32) || '"', 1024);
    RAISE EXCEPTION 'FAIL 11e: Bob confirmed an upload against Alice''s scan';
  EXCEPTION
    WHEN SQLSTATE 'P0410' THEN NULL;
  END;
  -- ...and an id that does not exist at all raises the SAME errcode.
  BEGIN
    PERFORM public.confirm_media_upload(
      'f7777777-7777-4777-8777-777777777777', repeat('c', 64), '"' || repeat('4', 32) || '"', 1024
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

-- ═══════════════════════════════════════════════════════════════════════════
-- 00499 — W3-A review closure
--
--   13. is_originals_bucket — the one pattern, and its grant surface.
--   14. confirm_media_upload — the originals-bucket pin (finding 12) and the
--       etag shape bound (finding 14).
--   15. register_media_object — the reserved prefix and the un-store refusal
--       (finding 13), INCLUDING the pipeline retry that must still work.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 13: is_originals_bucket ────────────────────────────────────────────────

DO $$
DECLARE
  name text;
BEGIN
  FOREACH name IN ARRAY ARRAY[
    'patina-media-originals-us',
    'patina-staging-media-originals-us'
  ] LOOP
    ASSERT public.is_originals_bucket(name),
      'FAIL 13a: is_originals_bucket must accept the deployed originals bucket ' || name;
  END LOOP;

  -- The artifacts buckets are the ones this must never accept: they are what a
  -- confirm pointed at the wrong row would otherwise reach.
  FOREACH name IN ARRAY ARRAY[
    'patina-media-artifacts-us',
    'patina-staging-media-artifacts-us',
    'patina-staging-media-originals-us-evil',
    'xpatina-staging-media-originals-us',
    ''
  ] LOOP
    ASSERT NOT public.is_originals_bucket(name),
      'FAIL 13a: is_originals_bucket must reject ' || quote_literal(name);
  END LOOP;
  ASSERT NOT public.is_originals_bucket(NULL),
    'FAIL 13a: is_originals_bucket(NULL) must be false, not null';
  RAISE NOTICE 'PASS 13a: is_originals_bucket accepts both originals buckets and nothing else';

  -- It discloses the bucket naming scheme and is only ever called from inside a
  -- definer body, so no request-facing role holds it.
  ASSERT NOT has_function_privilege('authenticated', 'public.is_originals_bucket(text)', 'EXECUTE'),
    'FAIL 13b: authenticated must NOT hold EXECUTE on is_originals_bucket';
  ASSERT NOT has_function_privilege('anon', 'public.is_originals_bucket(text)', 'EXECUTE'),
    'FAIL 13b: anon must NOT hold EXECUTE on is_originals_bucket';
  RAISE NOTICE 'PASS 13b: is_originals_bucket is callable only from inside a definer body';

  -- Finding 16: there must be exactly ONE copy of the pattern. Both callers
  -- must go through the helper, or a bucket rename fixes one and misses the
  -- other.
  ASSERT (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
           WHERE n.nspname = 'public'
             AND p.proname IN ('create_media_upload_intent', 'confirm_media_upload')
             AND p.prosrc LIKE '%media-originals-us%') = 0,
    'FAIL 13c: the originals-bucket pattern is inlined in an RPC — it belongs only in is_originals_bucket';
  ASSERT (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
           WHERE n.nspname = 'public'
             AND p.proname IN ('create_media_upload_intent', 'confirm_media_upload')
             AND p.prosrc LIKE '%is_originals_bucket%') = 2,
    'FAIL 13c: both upload RPCs must pin the bucket through is_originals_bucket';
  RAISE NOTICE 'PASS 13c: exactly one originals-bucket pattern, used by both upload RPCs';
END $$;

-- ─── 14: confirm_media_upload — bucket pin and etag shape ───────────────────
-- Alice owns scan c333…; the artifacts row d444… registered in section 6 names
-- the ARTIFACTS bucket and IS visible to her. That is the finding-12 shape
-- exactly: a row the caller can legitimately see, which confirm must still
-- refuse, because confirming it would have the Worker HEAD a pipeline output
-- with the WRITE credential and stamp a checksum onto it.

DO $$
DECLARE
  sqlstate_got text;
BEGIN
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', 'a1111111-1111-4111-8111-111111111111',
                      'role', 'authenticated')::text,
    true
  );

  BEGIN
    PERFORM public.confirm_media_upload(
      'd4444444-4444-4444-8444-444444444444',
      repeat('a', 64), '"' || repeat('b', 32) || '"', 2048
    );
    RAISE EXCEPTION 'FAIL 14a: confirm accepted an ARTIFACTS-bucket row';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS sqlstate_got = RETURNED_SQLSTATE;
    ASSERT sqlstate_got = 'P0410',
      'FAIL 14a: an artifacts-bucket row must be refused as P0410 (the same 404 an '
      || 'invisible row gets), got ' || sqlstate_got;
  END;
  RAISE NOTICE 'PASS 14a: confirm_media_upload refuses a visible row that is not in an originals bucket';

  PERFORM set_config('request.jwt.claims', NULL, true);
END $$;

-- The etag bound and the now-mandatory observed checksum, on a REAL pending
-- upload-interface row so the refusal is the argument check and not the bucket
-- pin firing first.

DO $$
DECLARE
  intent       jsonb;
  upload_id    uuid;
  sqlstate_got text;
  bad_etag     text;
BEGIN
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', 'a1111111-1111-4111-8111-111111111111',
                      'role', 'authenticated')::text,
    true
  );

  intent := public.create_media_upload_intent(
    'c3333333-3333-4333-8333-333333333333', 'mesh', 'etag-probe.ply',
    'patina-staging-media-originals-us', repeat('c', 64), 4096, 'model/ply'
  );
  upload_id := (intent ->> 'object_id')::uuid;

  FOREACH bad_etag IN ARRAY ARRAY[
    'not-hex-at-all',
    repeat('a', 31),                       -- too short
    repeat('a', 33),                       -- too long
    repeat('a', 32) || '-',                -- multipart suffix with no part count
    repeat('a', 32) || '-123456',          -- part count out of range
    '"' || repeat('a', 32) || '" evil',    -- trailing junk after the quoted form
    repeat('a', 4096)                      -- unbounded blob
  ] LOOP
    BEGIN
      PERFORM public.confirm_media_upload(upload_id, repeat('c', 64), bad_etag, 4096);
      RAISE EXCEPTION 'FAIL 14b: confirm accepted a malformed etag %', quote_literal(bad_etag);
    EXCEPTION WHEN OTHERS THEN
      GET STACKED DIAGNOSTICS sqlstate_got = RETURNED_SQLSTATE;
      ASSERT sqlstate_got = 'P0411',
        'FAIL 14b: a malformed etag must be P0411, got ' || sqlstate_got
        || ' for ' || quote_literal(bad_etag);
    END;
  END LOOP;
  RAISE NOTICE 'PASS 14b: confirm_media_upload bounds the etag shape';

  -- The 2026-08-19 probe showed R2 always reports the digest for an object that
  -- came through the presigned PUT, so a confirm without one is evidence the
  -- bytes did not — 00499 refuses it where 00498 recorded 'put_condition'.
  BEGIN
    PERFORM public.confirm_media_upload(upload_id, NULL, NULL, 4096);
    RAISE EXCEPTION 'FAIL 14c: confirm accepted a NULL observed checksum';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS sqlstate_got = RETURNED_SQLSTATE;
    ASSERT sqlstate_got = 'P0411',
      'FAIL 14c: a NULL observed checksum must be P0411, got ' || sqlstate_got;
  END;
  RAISE NOTICE 'PASS 14c: confirm_media_upload requires the R2-observed checksum';

  -- And the positive: the well-formed quoted-hex etag R2 actually returns still
  -- lands, or 14b would be proving only that the function rejects everything.
  PERFORM public.confirm_media_upload(
    upload_id, repeat('c', 64), '"' || repeat('d', 32) || '"', 4096
  );
  ASSERT (SELECT lifecycle_state FROM public.media_objects WHERE id = upload_id) = 'stored',
    'FAIL 14d: a well-formed confirm must still land the object as stored';
  ASSERT (SELECT provenance ->> 'sha256_verified_by' FROM public.media_objects WHERE id = upload_id)
         = 'r2_head',
    'FAIL 14d: a landed confirm must record sha256_verified_by = r2_head (put_condition is retired)';
  RAISE NOTICE 'PASS 14d: a well-formed confirm lands, and records r2_head provenance';

  PERFORM set_config('request.jwt.claims', NULL, true);
END $$;

-- ─── 15: register_media_object — the pipeline door's two new refusals ───────

DO $$
DECLARE
  sqlstate_got text;
  artifact_id  uuid;
  upload_id    uuid;
BEGIN
  -- 15a: the scan_originals/ namespace belongs to the upload interface.
  BEGIN
    PERFORM public.register_media_object(
      'patina-staging-media-originals-us',
      'scan_originals/c3333333-3333-4333-8333-333333333333/mesh/stolen.ply',
      'authenticated_project'
    );
    RAISE EXCEPTION 'FAIL 15a: register_media_object accepted a scan_originals/ key';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS sqlstate_got = RETURNED_SQLSTATE;
    ASSERT sqlstate_got = 'P0414',
      'FAIL 15a: a scan_originals/ key must be refused as P0414, got ' || sqlstate_got;
  END;
  RAISE NOTICE 'PASS 15a: register_media_object refuses the upload interface''s namespace';

  -- 15b: THE PIPELINE'S RETRY MUST STILL WORK. Its stages are
  -- register -> PUT -> mark(stored) on a deterministic per-version key, so a
  -- retried stage re-registers a row that is already 'stored'. A blanket
  -- downgrade refusal would break that, and this asserts it was not taken.
  artifact_id := public.register_media_object(
    'patina-staging-media-artifacts-us', 'scans/retry-probe/1/splat.spz',
    'authenticated_project', p_scan_id => 'c3333333-3333-4333-8333-333333333333'::uuid
  );
  PERFORM public.mark_media_object_state(artifact_id, 'stored', repeat('e', 64), 'etag', 10);
  PERFORM public.register_media_object(
    'patina-staging-media-artifacts-us', 'scans/retry-probe/1/splat.spz',
    'authenticated_project', p_scan_id => 'c3333333-3333-4333-8333-333333333333'::uuid
  );
  ASSERT (SELECT lifecycle_state FROM public.media_objects WHERE id = artifact_id) = 'pending',
    'FAIL 15b: the pipeline''s register -> PUT -> mark retry must still reset an ARTIFACT to pending';
  RAISE NOTICE 'PASS 15b: the pipeline''s re-register of a stored ARTIFACT still works';

  -- 15c: but a 'verified' row may not be un-said. Nothing in services/scan-modal
  -- ever marks 'verified', so no legitimate caller re-registers over one.
  PERFORM public.mark_media_object_state(artifact_id, 'stored');
  PERFORM public.mark_media_object_state(artifact_id, 'verified');
  BEGIN
    PERFORM public.register_media_object(
      'patina-staging-media-artifacts-us', 'scans/retry-probe/1/splat.spz',
      'authenticated_project', p_scan_id => 'c3333333-3333-4333-8333-333333333333'::uuid
    );
    RAISE EXCEPTION 'FAIL 15c: register_media_object un-said a verified row';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS sqlstate_got = RETURNED_SQLSTATE;
    ASSERT sqlstate_got = 'P0415',
      'FAIL 15c: un-storing a verified row must be P0415, got ' || sqlstate_got;
  END;
  RAISE NOTICE 'PASS 15c: register_media_object cannot reset a verified row to pending';

  -- 15d: and an UPLOAD-INTERFACE row that has landed may not be un-said either,
  -- identified by its PROVENANCE rather than by its key — so the guard survives
  -- a change to the key layout that 15a's prefix check would not.
  SELECT id INTO upload_id FROM public.media_objects
   WHERE provenance ->> 'source' = 'media_upload_intent'
     AND lifecycle_state = 'stored'
   LIMIT 1;
  ASSERT upload_id IS NOT NULL,
    'FAIL 15d: expected the confirmed upload row from section 14 as a fixture';
  UPDATE public.media_objects SET object_key = 'scans/relocated/1/mesh.ply',
                                  bucket = 'patina-staging-media-artifacts-us'
   WHERE id = upload_id;
  BEGIN
    PERFORM public.register_media_object(
      'patina-staging-media-artifacts-us', 'scans/relocated/1/mesh.ply',
      'authenticated_project', p_scan_id => 'c3333333-3333-4333-8333-333333333333'::uuid
    );
    RAISE EXCEPTION 'FAIL 15d: register_media_object un-said a confirmed upload row';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS sqlstate_got = RETURNED_SQLSTATE;
    ASSERT sqlstate_got = 'P0415',
      'FAIL 15d: un-storing a confirmed upload row must be P0415, got ' || sqlstate_got;
  END;
  RAISE NOTICE 'PASS 15d: a confirmed upload row is protected by provenance, not only by its key';
END $$;

-- ─── done — rollback so this file is re-runnable ────────────────────────────
DO $$ BEGIN RAISE NOTICE 'scan_roles_conformance_test.sql: ALL ASSERTIONS PASSED'; END $$;

ROLLBACK;
