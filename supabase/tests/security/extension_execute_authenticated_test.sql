-- ═══════════════════════════════════════════════════════════════════════════
-- 00531 grant regression test — extensions.{uuid_generate_v5,digest,gen_random_uuid}
--
-- Proves the fix for docs/ops/uuid-generate-v5-prod-error-2026-08-25.md and
-- the Phase 3 lane audit (2026-08-25) that widened it: Strata revokes PUBLIC
-- EXECUTE on `extensions.*` utility functions, and any SECURITY INVOKER
-- function or security_invoker view that calls one of them runs the call as
-- the CALLING role (authenticated, via PostgREST). Four functions across
-- four INVOKER-path callers were confirmed missing EXECUTE for authenticated
-- on prod:
--
--   extensions.uuid_generate_v5(uuid, text)  <- public.margin_items 'time' branch (00194)
--   extensions.digest(bytea, text)           <- commit_field_capture (00516) — CONFIRMED broken
--   extensions.digest(text, text)            <- (same digest family; not currently reached by an
--                                                 audited caller with a text,text overload, but
--                                                 revoked identically to bytea,text on prod, so
--                                                 granted identically here)
--   extensions.gen_random_uuid()             <- place_product_in_project (00441/00447)
--
-- Covers:
--   1. Grant-state assertions: authenticated has EXECUTE on all four
--      signatures, anon does not.
--   2. Bare SET ROLE authenticated + direct calls succeed, for all four.
--   3. Three real query-path proofs, each fail-before / succeed-after in the
--      SAME rolled-back transaction (REVOKE'd first to simulate pre-00531
--      prod, only under the \if is_superuser gate below):
--        a. public.margin_items 'time' branch (uuid_generate_v5)
--        b. commit_field_capture(..., 'inbox', ...) (digest(bytea,text))
--        c. place_product_in_project(...) with no idempotencyKey/captureId,
--           which is the only branch that reaches gen_random_uuid()
--           (gen_random_uuid())
--
-- ⚠ Connecting role: for the FULL before/after proof, run this file as
-- `supabase_admin`, not `postgres`. Locally, all four `extensions.*`
-- functions above are OWNED by supabase_admin and carry a PUBLIC EXECUTE
-- grant made by supabase_admin (`=X/supabase_admin` in their proacl) — an
-- ordinary Postgres extension-install default that this local stack's
-- `postgres` role is NEITHER the owner of, NOR a member of, NOR superuser
-- over (confirmed: `postgres`.rolsuper = false locally), so `postgres`
-- cannot revoke that PUBLIC grant (only revoke grants it made itself). This
-- is a genuine LOCAL/PROD divergence: on Strata prod, none of these four
-- functions has ever granted PUBLIC, authenticated, or anon EXECUTE (only
-- postgres/dashboard_user — see the 00531 migration header for the full
-- prod probe), which is exactly why the bug existed there. `supabase_admin`
-- IS superuser locally (a local-only login role, password `postgres`, same
-- as the `postgres` role), so running as `supabase_admin` lets this test
-- actually revoke PUBLIC and reproduce prod's pre-00531 ACL shape for the
-- duration of this rolled-back transaction, then prove each query flips
-- from 42501 to success across the grant. Run as `postgres` (e.g. via
-- `scripts/run-sql-tests.sh`'s default connection) and every negative-case
-- block self-skips with a NOTICE instead of false-failing — the positive
-- query paths, direct calls, and final ACL assertions still run and prove
-- the fix.
--
-- Run (full before/after proof):
--   psql "postgresql://supabase_admin:postgres@127.0.0.1:54322/postgres" -X -q \
--     -v ON_ERROR_STOP=1 \
--     -f supabase/tests/security/extension_execute_authenticated_test.sql
--
-- Run (positive-path only, e.g. via the bulk runner's default `postgres`):
--   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -X -q \
--     -v ON_ERROR_STOP=1 \
--     -f supabase/tests/security/extension_execute_authenticated_test.sql
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

SET LOCAL statement_timeout = '30s';

CREATE OR REPLACE FUNCTION pg_temp.assume_user(
  p_user_id uuid,
  p_role text DEFAULT 'authenticated'
)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', p_user_id, 'role', p_role)::text,
    true
  );
END;
$$;
GRANT EXECUTE ON FUNCTION pg_temp.assume_user(uuid, text) TO PUBLIC;

-- ═══════════════════════════════════════════════════════════════════════════
-- ── Fixtures ──────────────────────────────────────────────────────────────
-- ═══════════════════════════════════════════════════════════════════════════

INSERT INTO auth.users (
  id, email, encrypted_password, email_confirmed_at, created_at, updated_at,
  instance_id, aud, role
) VALUES
  ('00531000-0000-4000-8000-000000000001', 'uuidv5-designer@test.invalid', '', now(), now(), now(),
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('00531000-0000-4000-8000-000000000002', 'uuidv5-client@test.invalid', '', now(), now(), now(),
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');

INSERT INTO public.profiles (id, email, full_name, is_designer, created_at, updated_at)
VALUES
  ('00531000-0000-4000-8000-000000000001', 'uuidv5-designer@test.invalid', 'UUIDv5 Designer', true, now(), now()),
  ('00531000-0000-4000-8000-000000000002', 'uuidv5-client@test.invalid', 'UUIDv5 Client', false, now(), now())
ON CONFLICT (id) DO UPDATE
SET email = EXCLUDED.email, full_name = EXCLUDED.full_name;

SELECT pg_temp.assume_user('00531000-0000-4000-8000-000000000001', 'service_role');

-- public.set_project_studio_id() (00511) has a session_user = 'postgres'
-- migration bypass; running the project INSERTs under SET SESSION
-- AUTHORIZATION postgres (superuser-only, permitted here because
-- supabase_admin IS superuser locally) takes that path, matching how every
-- other migration test in this repo seeds a project as the plain
-- psql-connecting role. RESET SESSION AUTHORIZATION afterward restores
-- supabase_admin (needed below for the REVOKE/GRANT admin operations) —
-- resetting back to the session's original login is always permitted,
-- unlike setting it in the first place.
SET SESSION AUTHORIZATION postgres;

-- ── (a) margin_items fixture: project + a qualifying time entry ────────────
INSERT INTO public.projects (
  id, name, created_by, designer_id, client_id
) VALUES (
  '00531001-0000-4000-8000-000000000001',
  'uuid_generate_v5 grant regression project',
  '00531000-0000-4000-8000-000000000001',
  '00531000-0000-4000-8000-000000000001',
  '00531000-0000-4000-8000-000000000002'
);

-- A completed entry inside margin_items' 7-day window (duration_minutes NOT
-- NULL, started_at > now() - 7 days) is what makes the view's 'time' branch
-- project a row and evaluate uuid_generate_v5 for this project.
INSERT INTO public.project_time_entries (
  id, project_id, user_id, started_at, duration_minutes, notes, billable
) VALUES (
  '00531002-0000-4000-8000-000000000001',
  '00531001-0000-4000-8000-000000000001',
  '00531000-0000-4000-8000-000000000001',
  now() - interval '1 day',
  60,
  'uuid_generate_v5 grant regression fixture',
  true
);

-- ── (c) place_product_in_project fixture: a second project + product ───────
-- No project_rooms row needed: p_room_id NULL drives assignmentScope
-- 'unassigned', which place_product_in_project_v2's underlying impl accepts
-- without a board/room (confirmed locally against this exact fixture shape).
INSERT INTO public.projects (
  id, name, created_by, designer_id, client_id
) VALUES (
  '00531001-0000-4000-8000-000000000002',
  'place_product_in_project grant regression project',
  '00531000-0000-4000-8000-000000000001',
  '00531000-0000-4000-8000-000000000001',
  '00531000-0000-4000-8000-000000000002'
);

RESET SESSION AUTHORIZATION;

INSERT INTO public.vendors (id, name)
VALUES ('00531003-0000-4000-8000-000000000001', 'uuidv5 grant regression vendor');

INSERT INTO public.products (
  id, name, price_retail, price_trade, images, vendor_id, captured_by, captured_at, layer, status
) VALUES (
  '00531004-0000-4000-8000-000000000001',
  'uuidv5 grant regression chair',
  120000, 80000,
  ARRAY['https://example.invalid/chair.jpg'],
  '00531003-0000-4000-8000-000000000001',
  '00531000-0000-4000-8000-000000000001',
  now(), 'catalog', 'published'
);

-- ── (b) commit_field_capture fixture ────────────────────────────────────────
-- No project/organization routing needed: the 'inbox' destination inserts
-- the field_captures row and returns without touching project_id/
-- organization_id at all (both left NULL, which the table permits).

-- ═══════════════════════════════════════════════════════════════════════════
-- ── 1. Simulate the pre-00531 prod state: revoke all four signatures, then
--       prove all three real query paths throw permission denied ──────────
-- ═══════════════════════════════════════════════════════════════════════════
--
-- NOTE on PUBLIC: prod's four extensions.* functions have NEVER granted
-- EXECUTE to PUBLIC (see the 00531 migration header). This LOCAL stack's
-- uuid-ossp/pgcrypto install, by contrast, carries the ordinary Postgres
-- extension-install default of `=X/supabase_admin` (PUBLIC EXECUTE) on all
-- four — so revoking only `authenticated` here would not actually block the
-- calls locally (PUBLIC would still let them through), and the pre-grant
-- assertions below would falsely pass. Revoking PUBLIC too, inside this
-- rolled-back transaction, reproduces prod's real pre-00531 ACL shape for
-- the duration of this test without touching the persisted local grant.
--
-- NOTE on grantor scoping: Postgres REVOKE only removes the aclitem whose
-- recorded grantor is the CURRENT role executing the REVOKE — even for a
-- superuser (empirically confirmed against this stack). So the PUBLIC
-- revoke runs as supabase_admin (matches the `=X/supabase_admin` entry's
-- grantor) and the authenticated revoke runs under `SET LOCAL ROLE
-- postgres` (matches the `authenticated=X/postgres` entry left behind by
-- this session's earlier real `psql -f 00531_....sql` apply as the
-- `postgres` role) — self-revoking a grant you made yourself needs no
-- special privilege beyond being that grantor.
--
-- NOTE on the runner: `scripts/run-sql-tests.sh` and the default local-dev
-- connection both use the `postgres` role, which is NOT superuser locally
-- and so cannot perform either revoke above. Gate this whole negative-case
-- block on superuser so a bulk run under `postgres` degrades to a skip
-- (with a NOTICE) instead of a false failure, while `supabase_admin` still
-- gets the full proof.

SELECT (SELECT rolsuper FROM pg_roles WHERE rolname = current_user) AS is_superuser \gset

\if :is_superuser

REVOKE EXECUTE ON FUNCTION extensions.uuid_generate_v5(uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION extensions.digest(bytea, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION extensions.digest(text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION extensions.gen_random_uuid() FROM PUBLIC;

SET LOCAL ROLE postgres;
REVOKE EXECUTE ON FUNCTION extensions.uuid_generate_v5(uuid, text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION extensions.digest(bytea, text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION extensions.digest(text, text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION extensions.gen_random_uuid() FROM authenticated;
RESET ROLE;

-- ── (a) margin_items 'time' branch: the toast's exact query path ───────────
DO $$
DECLARE
  v_caught boolean := false;
  v_row public.margin_items%ROWTYPE;
BEGIN
  BEGIN
    SET LOCAL ROLE authenticated;
    PERFORM pg_temp.assume_user('00531000-0000-4000-8000-000000000001', 'authenticated');
    -- Must select item_id (or *) — matching PostgREST's actual generated SQL
    -- (`SELECT "public"."margin_items".* FROM ...`). A bare
    -- `PERFORM 1 FROM margin_items WHERE ...` or `count(*)` does NOT
    -- reproduce the bug: Postgres prunes any output expression no consumer
    -- references, so if item_id (the uuid_generate_v5 call) is never
    -- projected, it's never evaluated and no permission check fires —
    -- empirically confirmed against this stack while diagnosing this test.
    SELECT * INTO v_row FROM public.margin_items
    WHERE project_id = '00531001-0000-4000-8000-000000000001'
      AND kind = 'time';
  EXCEPTION WHEN insufficient_privilege THEN
    v_caught := true;
  END;
  RESET ROLE;
  ASSERT v_caught,
    'pre-grant: SELECT margin_items for a project with a qualifying time entry must raise insufficient_privilege (42501) as authenticated, matching the prod incident';
END;
$$;

-- ── (b) commit_field_capture(..., 'inbox', ...): the real intake path ──────
DO $$
DECLARE
  v_caught boolean := false;
  v_result jsonb;
BEGIN
  BEGIN
    SET LOCAL ROLE authenticated;
    PERFORM pg_temp.assume_user('00531000-0000-4000-8000-000000000001', 'authenticated');
    v_result := public.commit_field_capture(
      '00531005-0000-4000-8000-000000000001'::uuid,
      'inbox',
      '{"title":"uuidv5 grant regression capture","notes":"pre-grant"}'::jsonb,
      NULL, NULL, NULL, NULL
    );
  EXCEPTION WHEN insufficient_privilege THEN
    v_caught := true;
  END;
  RESET ROLE;
  ASSERT v_caught,
    'pre-grant: commit_field_capture(..., ''inbox'', ...) must raise insufficient_privilege (42501) as authenticated — its digest(bytea,text) call to hash the content revision runs under the SECURITY INVOKER caller';
END;
$$;

-- ── (c) place_product_in_project(...) with no idempotencyKey/captureId ─────
-- This is the ONLY call shape that reaches extensions.gen_random_uuid():
-- p_source = '{}'::jsonb has neither 'idempotencyKey' nor 'captureId', so
-- v_key falls through to 'n1:request:' || extensions.gen_random_uuid()::text
-- (00441), evaluated under the SECURITY INVOKER caller before the function
-- ever reaches its SECURITY DEFINER v2 chain.
DO $$
DECLARE
  v_caught boolean := false;
  v_result jsonb;
BEGIN
  BEGIN
    SET LOCAL ROLE authenticated;
    PERFORM pg_temp.assume_user('00531000-0000-4000-8000-000000000001', 'authenticated');
    v_result := public.place_product_in_project(
      '00531001-0000-4000-8000-000000000002'::uuid,
      '00531004-0000-4000-8000-000000000001'::uuid,
      NULL, NULL, NULL, '{}'::jsonb
    );
  EXCEPTION WHEN insufficient_privilege THEN
    v_caught := true;
  END;
  RESET ROLE;
  ASSERT v_caught,
    'pre-grant: place_product_in_project(...) with no idempotencyKey/captureId must raise insufficient_privilege (42501) as authenticated — its gen_random_uuid() fallback runs under the SECURITY INVOKER caller';
END;
$$;

\else
\echo 'NOTE: skipping pre-grant negative-case proofs — current_user is not superuser on this connection, so it cannot revoke the PUBLIC/postgres-grantor ACL entries needed to simulate the pre-00531 state. Re-run this file as supabase_admin for the full before/after proof.'
\endif

-- ═══════════════════════════════════════════════════════════════════════════
-- ── 2. Apply 00531's fix within this same transaction, then prove all three
--       query paths now succeed ────────────────────────────────────────────
-- ═══════════════════════════════════════════════════════════════════════════

GRANT EXECUTE ON FUNCTION extensions.uuid_generate_v5(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION extensions.digest(bytea, text) TO authenticated;
GRANT EXECUTE ON FUNCTION extensions.digest(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION extensions.gen_random_uuid() TO authenticated;

-- ── (a) margin_items ─────────────────────────────────────────────────────
DO $$
DECLARE
  v_item_id uuid;
  v_expected_id uuid;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM pg_temp.assume_user('00531000-0000-4000-8000-000000000001', 'authenticated');

  SELECT item_id INTO v_item_id
  FROM public.margin_items
  WHERE project_id = '00531001-0000-4000-8000-000000000001'
    AND kind = 'time';

  RESET ROLE;

  ASSERT v_item_id IS NOT NULL,
    'post-grant: SELECT margin_items must return the time-branch row for the seeded project, not error or come back empty';

  v_expected_id := extensions.uuid_generate_v5(
    'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11'::uuid,
    '00531001-0000-4000-8000-000000000001' || date(now() - interval '1 day')::text
  );
  ASSERT v_item_id = v_expected_id,
    format('post-grant: margin_items time-branch item_id must match the view''s own uuid_generate_v5 derivation (got %s, expected %s)', v_item_id, v_expected_id);
END;
$$;

-- ── (b) commit_field_capture ─────────────────────────────────────────────
DO $$
DECLARE
  v_result jsonb;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM pg_temp.assume_user('00531000-0000-4000-8000-000000000001', 'authenticated');
  v_result := public.commit_field_capture(
    '00531005-0000-4000-8000-000000000001'::uuid,
    'inbox',
    '{"title":"uuidv5 grant regression capture","notes":"post-grant"}'::jsonb,
    NULL, NULL, NULL, NULL
  );
  RESET ROLE;

  ASSERT v_result->>'status' = 'inbox',
    format('post-grant: commit_field_capture(..., ''inbox'', ...) must land the capture in inbox status, got %s', v_result);
  ASSERT EXISTS (
    SELECT 1 FROM public.field_captures
    WHERE client_capture_id = '00531005-0000-4000-8000-000000000001'
      AND designer_id = '00531000-0000-4000-8000-000000000001'
      AND status = 'inbox'
  ), 'post-grant: commit_field_capture must have written a field_captures row owned by the calling designer';
END;
$$;

-- ── (c) place_product_in_project ─────────────────────────────────────────
DO $$
DECLARE
  v_result jsonb;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM pg_temp.assume_user('00531000-0000-4000-8000-000000000001', 'authenticated');
  v_result := public.place_product_in_project(
    '00531001-0000-4000-8000-000000000002'::uuid,
    '00531004-0000-4000-8000-000000000001'::uuid,
    NULL, NULL, NULL, '{}'::jsonb
  );
  RESET ROLE;

  ASSERT v_result->>'outcome' = 'created',
    format('post-grant: place_product_in_project(...) must create a new selection, got %s', v_result);
  ASSERT (v_result->>'selectionId') IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.project_ffe_items
      WHERE id = (v_result->>'selectionId')::uuid
        AND project_id = '00531001-0000-4000-8000-000000000002'
        AND product_id = '00531004-0000-4000-8000-000000000001'
    ), 'post-grant: place_product_in_project must have written a project_ffe_items row for the seeded project/product';
END;
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- ── 3. Direct call proofs: a bare SET ROLE authenticated + call succeeds,
--       for all four signatures ────────────────────────────────────────────
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_uuidv5 uuid;
  v_digest_bytea bytea;
  v_digest_text bytea;
  v_gen_random uuid;
BEGIN
  SET LOCAL ROLE authenticated;
  SELECT extensions.uuid_generate_v5(extensions.uuid_ns_url(), 'x') INTO v_uuidv5;
  SELECT extensions.digest('x'::bytea, 'sha256') INTO v_digest_bytea;
  SELECT extensions.digest('x'::text, 'sha256') INTO v_digest_text;
  SELECT extensions.gen_random_uuid() INTO v_gen_random;
  RESET ROLE;
  ASSERT v_uuidv5 IS NOT NULL,
    'authenticated must be able to call extensions.uuid_generate_v5(uuid, text) directly post-grant';
  ASSERT v_digest_bytea IS NOT NULL,
    'authenticated must be able to call extensions.digest(bytea, text) directly post-grant';
  ASSERT v_digest_text IS NOT NULL,
    'authenticated must be able to call extensions.digest(text, text) directly post-grant';
  ASSERT v_gen_random IS NOT NULL,
    'authenticated must be able to call extensions.gen_random_uuid() directly post-grant';
END;
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- ── 4. Final ACL-state assertions (the object-level proof, independent of
--       any specific query path) ────────────────────────────────────────────
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
BEGIN
  ASSERT has_function_privilege(
    'authenticated'::name, 'extensions.uuid_generate_v5(uuid,text)', 'EXECUTE'
  ), 'authenticated must hold EXECUTE on extensions.uuid_generate_v5(uuid,text) after 00531';
  ASSERT has_function_privilege(
    'authenticated'::name, 'extensions.digest(bytea,text)', 'EXECUTE'
  ), 'authenticated must hold EXECUTE on extensions.digest(bytea,text) after 00531';
  ASSERT has_function_privilege(
    'authenticated'::name, 'extensions.digest(text,text)', 'EXECUTE'
  ), 'authenticated must hold EXECUTE on extensions.digest(text,text) after 00531';
  ASSERT has_function_privilege(
    'authenticated'::name, 'extensions.gen_random_uuid()', 'EXECUTE'
  ), 'authenticated must hold EXECUTE on extensions.gen_random_uuid() after 00531';
END;
$$;

-- 00531's own statement never mentions anon/PUBLIC (verified by code review
-- of the migration file itself), but proving "anon still lacks EXECUTE" by
-- has_function_privilege is only meaningful once this local stack's
-- pre-existing PUBLIC grant noise has been cleared — i.e. only in the
-- superuser branch above, which already revoked it. Under `postgres`, anon
-- would show EXECUTE=true via that untouched local-only PUBLIC grant, which
-- would be a false failure, not evidence 00531 granted anon anything.
\if :is_superuser
DO $$
BEGIN
  ASSERT NOT has_function_privilege(
    'anon'::name, 'extensions.uuid_generate_v5(uuid,text)', 'EXECUTE'
  ), '00531 must not grant EXECUTE to anon on uuid_generate_v5(uuid,text)';
  ASSERT NOT has_function_privilege(
    'anon'::name, 'extensions.digest(bytea,text)', 'EXECUTE'
  ), '00531 must not grant EXECUTE to anon on digest(bytea,text)';
  ASSERT NOT has_function_privilege(
    'anon'::name, 'extensions.digest(text,text)', 'EXECUTE'
  ), '00531 must not grant EXECUTE to anon on digest(text,text)';
  ASSERT NOT has_function_privilege(
    'anon'::name, 'extensions.gen_random_uuid()', 'EXECUTE'
  ), '00531 must not grant EXECUTE to anon on gen_random_uuid()';
END;
$$;
\endif

ROLLBACK;
