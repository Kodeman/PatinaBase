-- ═══════════════════════════════════════════════════════════════════════════
-- 00531 grant regression test — extensions.uuid_generate_v5(uuid, text)
--
-- Proves the fix for the prod incident diagnosed in
-- docs/ops/uuid-generate-v5-prod-error-2026-08-25.md: public.margin_items'
-- 'time' branch (rolling 7-day project_time_entries summary, unchanged since
-- 00194) calls extensions.uuid_generate_v5(...) to synthesize a per-day
-- item_id. On prod, `authenticated` lacked EXECUTE on that function, so any
-- /doc/<id> SELECT against margin_items for a project with a qualifying
-- project_time_entries row threw `permission denied for function
-- uuid_generate_v5` (sql_state 42501) as the authenticated caller.
--
-- Covers:
--   1. Grant-state assertions: authenticated has EXECUTE, anon does not.
--   2. A bare SET ROLE authenticated + direct call succeeds.
--   3. The actual toast's query path: SELECT * FROM margin_items WHERE
--      project_id = <seeded project> as authenticated, with a seeded
--      project_time_entries row inside the view's 7-day window, for a
--      designer who owns the project (RLS: "Designers manage their project
--      time entries" — designer_id = auth.uid()). Run AFTER the grant always;
--      run BEFORE the grant too (REVOKE'd first, inside this same
--      rolled-back transaction, to simulate the pre-00531 prod state) when
--      the connecting role has the privilege to do so (see the \if
--      is_superuser gate below) — proving the query path actually flips from
--      42501 to success, not just that the ACL bit is set.
--
-- ⚠ Connecting role: for the FULL before/after proof, run this file as
-- `supabase_admin`, not `postgres`. Locally, `extensions.uuid_generate_v5
-- (uuid, text)` is OWNED by supabase_admin and carries a PUBLIC EXECUTE
-- grant made by supabase_admin (`=X/supabase_admin` in its proacl) — an
-- ordinary Postgres extension-install default that this local stack's
-- `postgres` role is NEITHER the owner of, NOR a member of, NOR superuser
-- over (confirmed: `postgres`.rolsuper = false locally), so `postgres`
-- cannot revoke that PUBLIC grant (only revoke grants it made itself). This
-- is a genuine LOCAL/PROD divergence: on Strata prod,
-- `extensions.uuid_generate_v5(uuid,text)` has NEVER granted PUBLIC or
-- authenticated or anon EXECUTE (only postgres/dashboard_user/supabase_admin
-- — see docs/ops/uuid-generate-v5-prod-error-2026-08-25.md), which is
-- exactly why the bug existed there. `supabase_admin` IS superuser locally
-- (a local-only login role, password `postgres`, same as the `postgres`
-- role), so running as `supabase_admin` lets this test actually revoke
-- PUBLIC and reproduce prod's pre-00531 ACL shape for the duration of this
-- rolled-back transaction, then prove the SELECT flips from 42501 to success
-- across the grant. Run as `postgres` (e.g. via `scripts/run-sql-tests.sh`'s
-- default connection) and section 1's negative-case block self-skips with a
-- NOTICE instead of false-failing — sections 2-4 (the positive query path,
-- direct call, and final ACL assertions) still run and prove the fix.
--
-- Run (full before/after proof):
--   psql "postgresql://supabase_admin:postgres@127.0.0.1:54322/postgres" -X -q \
--     -v ON_ERROR_STOP=1 \
--     -f supabase/tests/security/uuid_generate_v5_grant_test.sql
--
-- Run (positive-path only, e.g. via the bulk runner's default `postgres`):
--   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -X -q \
--     -v ON_ERROR_STOP=1 \
--     -f supabase/tests/security/uuid_generate_v5_grant_test.sql
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

SET LOCAL statement_timeout = '30s';

-- ── Fixture: one designer, one project they own, one qualifying time entry ──
--
-- public.set_project_studio_id() (00511) has a session_user = 'postgres'
-- migration bypass; running the INSERTs under SET SESSION AUTHORIZATION
-- postgres (superuser-only, permitted here because supabase_admin IS
-- superuser locally) takes that path, matching how every other migration
-- test in this repo seeds a project as the plain psql-connecting role. RESET
-- SESSION AUTHORIZATION afterward restores supabase_admin (needed below for
-- the REVOKE/GRANT admin operations) — resetting back to the session's
-- original login is always permitted, unlike setting it in the first place.

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

SET SESSION AUTHORIZATION postgres;

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

RESET SESSION AUTHORIZATION;

-- ── 1. Simulate the pre-00531 prod state: revoke, then prove the toast's
--       exact query path (SELECT * FROM margin_items WHERE project_id = ...,
--       as authenticated) throws permission denied ──────────────────────────
--
-- NOTE on PUBLIC: prod's `extensions.uuid_generate_v5(uuid, text)` has NEVER
-- granted EXECUTE to PUBLIC (confirmed in
-- docs/ops/uuid-generate-v5-prod-error-2026-08-25.md: authenticated=false,
-- anon=false, service_role=false, postgres=true). This LOCAL stack's
-- uuid-ossp install, by contrast, carries the ordinary Postgres
-- extension-install default of `=X/supabase_admin` (PUBLIC EXECUTE) on this
-- function — so revoking only `authenticated` here would not actually block
-- the call locally (PUBLIC would still let it through), and the pre-grant
-- assertion below would falsely pass. Revoking PUBLIC too, inside this
-- rolled-back transaction, reproduces prod's real pre-00531 ACL shape for the
-- duration of this test without touching the persisted local grant.
--
-- NOTE on grantor scoping: Postgres REVOKE only removes the aclitem whose
-- recorded grantor is the CURRENT role executing the REVOKE — even for a
-- superuser (empirically confirmed against this stack: supabase_admin's
-- REVOKE removed the `=X/supabase_admin`-grantor PUBLIC entry but left an
-- `authenticated=X/postgres`-grantor entry, from this session's earlier real
-- `psql -f 00531_....sql` apply as the `postgres` role, untouched). So the
-- PUBLIC revoke runs as supabase_admin (matches that entry's grantor) and the
-- authenticated revoke runs under `SET LOCAL ROLE postgres` (matches that
-- entry's grantor) — self-revoking a grant you made yourself needs no
-- special privilege beyond being that grantor.
--
-- NOTE on the runner: `scripts/run-sql-tests.sh` and the default local-dev
-- connection both use the `postgres` role, which is NOT superuser locally
-- and so cannot perform either revoke above (see the connecting-role note at
-- the top of this file). Gate this whole negative-case block on superuser so
-- a bulk run under `postgres` degrades to a skip (with a NOTICE) instead of
-- a false failure, while `supabase_admin` still gets the full proof.

SELECT (SELECT rolsuper FROM pg_roles WHERE rolname = current_user) AS is_superuser \gset

\if :is_superuser

REVOKE EXECUTE ON FUNCTION extensions.uuid_generate_v5(uuid, text) FROM PUBLIC;

SET LOCAL ROLE postgres;
REVOKE EXECUTE ON FUNCTION extensions.uuid_generate_v5(uuid, text) FROM authenticated;
RESET ROLE;

DO $$
DECLARE
  v_caught boolean := false;
  v_row public.margin_items%ROWTYPE;
BEGIN
  BEGIN
    SET LOCAL ROLE authenticated;
    PERFORM pg_temp.assume_user('00531000-0000-4000-8000-000000000001', 'authenticated');
    -- Must select item_id (or *) — matching PostgREST's actual generated SQL
    -- (`SELECT "public"."margin_items".* FROM ...`, per
    -- docs/ops/uuid-generate-v5-prod-error-2026-08-25.md's captured query
    -- log). A bare `PERFORM 1 FROM margin_items WHERE ...` or `count(*)`
    -- does NOT reproduce the bug: Postgres prunes any output expression no
    -- consumer references, so if item_id (the uuid_generate_v5 call) is
    -- never projected, it's never evaluated and no permission check fires —
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

\else
\echo 'NOTE: skipping pre-grant negative-case proof — current_user is not superuser on this connection, so it cannot revoke the PUBLIC/postgres-grantor ACL entries needed to simulate the pre-00531 state. Re-run this file as supabase_admin for the full before/after proof.'
\endif

-- ── 2. Apply 00531's fix within this same transaction, then prove the exact
--       same query path now succeeds and returns the expected row ──────────

GRANT EXECUTE ON FUNCTION extensions.uuid_generate_v5(uuid, text) TO authenticated;

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

-- ── 3. Direct call proof: a bare SET ROLE authenticated + call succeeds ─────

DO $$
DECLARE
  v_direct uuid;
BEGIN
  SET LOCAL ROLE authenticated;
  SELECT extensions.uuid_generate_v5(extensions.uuid_ns_url(), 'x') INTO v_direct;
  RESET ROLE;
  ASSERT v_direct IS NOT NULL,
    'authenticated must be able to call extensions.uuid_generate_v5(uuid, text) directly post-grant';
END;
$$;

-- ── 4. Final ACL-state assertions (the object-level proof, independent of
--       any specific query path) ────────────────────────────────────────────

DO $$
BEGIN
  ASSERT has_function_privilege(
    'authenticated'::name, 'extensions.uuid_generate_v5(uuid,text)', 'EXECUTE'
  ), 'authenticated must hold EXECUTE on extensions.uuid_generate_v5(uuid,text) after 00531';
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
  ), '00531 must not grant EXECUTE to anon';
END;
$$;
\endif

ROLLBACK;
