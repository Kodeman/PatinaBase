-- ═══════════════════════════════════════════════════════════════════════════
-- project-documents bucket read policy (00170 → 00203 → 00430 → 00510)
--
-- The regression this pins: "Project members can read documents" applied
-- TO PUBLIC while its predicate calls public.is_project_team_member(uuid,uuid),
-- on which `anon` holds no EXECUTE. Postgres resolves a policy's function
-- EXECUTE permissions at executor-init for every policy that applies to the
-- caller's role, BEFORE any bucket_id conjunct can short-circuit — so an anon
-- SELECT against storage.objects raised
--   ERROR: permission denied for function is_project_team_member  (42501)
-- for EVERY bucket, not just this one. 00510 rebinds the policy TO
-- authenticated with the predicate byte-identical.
--
-- The DENY/ERROR discriminator is section (5): it puts the pre-00510 shape back
-- inside a savepoint and proves the anon probe errors again. Without it a suite
-- that only checked "anon sees no rows" would be green against the broken
-- policy too, because a raw permission error and an empty result are easy to
-- conflate.
--
-- Run:
--   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -X -q \
--     -v ON_ERROR_STOP=1 \
--     -f supabase/tests/storage/project_documents_caller_binding_test.sql
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

SET LOCAL statement_timeout = '60s';

-- ── Actors ────────────────────────────────────────────────────────────────
-- Designer leads the project. Teammate is an active project_team_members row.
-- Client is the project's named client. Stranger is signed in and unrelated.
INSERT INTO auth.users (
  id, email, encrypted_password, email_confirmed_at, created_at, updated_at,
  instance_id, aud, role
) VALUES
  ('51000000-0000-4000-8000-000000000001', 'pd-designer@test.invalid', '', now(), now(), now(),
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('51000000-0000-4000-8000-000000000002', 'pd-teammate@test.invalid', '', now(), now(), now(),
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('51000000-0000-4000-8000-000000000003', 'pd-client@test.invalid', '', now(), now(), now(),
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('51000000-0000-4000-8000-000000000004', 'pd-stranger@test.invalid', '', now(), now(), now(),
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');

INSERT INTO public.profiles (id, email, full_name, is_designer, created_at, updated_at)
VALUES
  ('51000000-0000-4000-8000-000000000001', 'pd-designer@test.invalid', 'PD Designer', true, now(), now()),
  ('51000000-0000-4000-8000-000000000002', 'pd-teammate@test.invalid', 'PD Teammate', true, now(), now()),
  ('51000000-0000-4000-8000-000000000003', 'pd-client@test.invalid', 'PD Client', false, now(), now()),
  ('51000000-0000-4000-8000-000000000004', 'pd-stranger@test.invalid', 'PD Stranger', false, now(), now())
ON CONFLICT (id) DO UPDATE
SET email = EXCLUDED.email,
    full_name = EXCLUDED.full_name,
    is_designer = EXCLUDED.is_designer;

INSERT INTO public.projects (id, name, designer_id, client_id, created_by, status)
VALUES (
  '51100000-0000-4000-8000-000000000001', 'Caller binding project',
  '51000000-0000-4000-8000-000000000001',
  '51000000-0000-4000-8000-000000000003',
  '51000000-0000-4000-8000-000000000001', 'active'
);

INSERT INTO public.project_team_members (project_id, user_id, role)
VALUES (
  '51100000-0000-4000-8000-000000000001',
  '51000000-0000-4000-8000-000000000002',
  'support_designer'
);

-- Two objects under the project prefix: one client-visible, one studio-only.
-- Canonical shape is {projectId}/{filename}; foldername()[1] is the project id.
INSERT INTO storage.objects (bucket_id, name, owner)
VALUES
  ('project-documents',
   '51100000-0000-4000-8000-000000000001/shared-plan.pdf',
   '51000000-0000-4000-8000-000000000001'),
  ('project-documents',
   '51100000-0000-4000-8000-000000000001/studio-only.pdf',
   '51000000-0000-4000-8000-000000000001');

INSERT INTO public.project_documents (
  id, project_id, title, doc_type, storage_path, client_visible, uploaded_by
) VALUES
  ('51200000-0000-4000-8000-000000000001',
   '51100000-0000-4000-8000-000000000001', 'Shared plan', 'pdf',
   '51100000-0000-4000-8000-000000000001/shared-plan.pdf', true,
   '51000000-0000-4000-8000-000000000001'),
  ('51200000-0000-4000-8000-000000000002',
   '51100000-0000-4000-8000-000000000001', 'Studio only', 'pdf',
   '51100000-0000-4000-8000-000000000001/studio-only.pdf', false,
   '51000000-0000-4000-8000-000000000001');

-- ── Probes ────────────────────────────────────────────────────────────────
-- SECURITY INVOKER on purpose: storage RLS must be evaluated as the assumed
-- caller. The probe returns a tagged string rather than raising, so an
-- ACL-layer error and a row count are distinguishable — conflating them is
-- exactly how this defect survived.
CREATE OR REPLACE FUNCTION pg_temp.probe_bucket()
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  v_count integer;
BEGIN
  SELECT count(*) INTO v_count
  FROM storage.objects
  WHERE bucket_id = 'project-documents';
  RETURN 'ok:' || v_count;
EXCEPTION WHEN OTHERS THEN
  RETURN 'err:' || SQLSTATE;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.probe_object(p_name text)
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  v_count integer;
BEGIN
  SELECT count(*) INTO v_count
  FROM storage.objects
  WHERE bucket_id = 'project-documents' AND name = p_name;
  RETURN 'ok:' || v_count;
EXCEPTION WHEN OTHERS THEN
  RETURN 'err:' || SQLSTATE;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.assume(p_actor uuid, p_role text)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM set_config(
    'request.jwt.claims',
    CASE WHEN p_actor IS NULL
      THEN json_build_object('role', p_role)::text
      ELSE json_build_object('sub', p_actor::text, 'role', p_role)::text
    END,
    true
  );
  PERFORM set_config('request.jwt.claim.sub', COALESCE(p_actor::text, ''), true);
  PERFORM set_config('request.jwt.claim.role', p_role, true);
END;
$$;

-- 00483 strips PUBLIC EXECUTE from routines created after it, pg_temp included.
GRANT EXECUTE ON FUNCTION pg_temp.probe_bucket() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION pg_temp.probe_object(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION pg_temp.assume(uuid, text) TO anon, authenticated;

-- ── (1) The policy is caller-bound in the catalog ─────────────────────────
DO $$
DECLARE
  v_roles oid[];
BEGIN
  SELECT policy.polroles INTO v_roles
  FROM pg_policy AS policy
  WHERE policy.polrelid = 'storage.objects'::regclass
    AND policy.polname = 'Project members can read documents';

  ASSERT v_roles IS NOT NULL,
    'the project-documents read policy is missing';
  ASSERT v_roles = ARRAY['authenticated'::regrole::oid],
    'the project-documents read policy must apply TO authenticated, not PUBLIC';

  ASSERT NOT EXISTS (
    SELECT 1 FROM pg_policy AS policy
    WHERE policy.polrelid = 'storage.objects'::regclass
      AND 0 = ANY(policy.polroles)
      AND pg_get_expr(policy.polqual, policy.polrelid) ILIKE '%is_project_team_member%'
  ), 'no PUBLIC storage.objects policy may call is_project_team_member';

  ASSERT NOT has_function_privilege(
    'anon', 'public.is_project_team_member(uuid,uuid)', 'EXECUTE'
  ), 'anon must NOT be granted EXECUTE on is_project_team_member — the fix is the role bind, not a wider grant';
END $$;

-- ── (2) anon reads storage.objects cleanly ────────────────────────────────
DO $$
DECLARE
  v_probe text;
BEGIN
  PERFORM pg_temp.assume(NULL, 'anon');
  SET LOCAL ROLE anon;
  v_probe := pg_temp.probe_bucket();
  RESET ROLE;

  ASSERT v_probe NOT LIKE 'err:%',
    format('an anon SELECT on storage.objects must not raise; got %L', v_probe);
  ASSERT v_probe = 'ok:0',
    format('anon must see no project-documents objects; got %L', v_probe);
END $$;

-- ── (3) The authenticated legs still read ─────────────────────────────────
DO $$
DECLARE
  v_shared text := '51100000-0000-4000-8000-000000000001/shared-plan.pdf';
  v_private text := '51100000-0000-4000-8000-000000000001/studio-only.pdf';
  v_probe text;
BEGIN
  -- Lead designer: both files.
  PERFORM pg_temp.assume('51000000-0000-4000-8000-000000000001', 'authenticated');
  SET LOCAL ROLE authenticated;
  v_probe := pg_temp.probe_bucket();
  RESET ROLE;
  ASSERT v_probe = 'ok:2', format('lead designer must read both files; got %L', v_probe);

  -- Active project team member: both files. This is the is_project_team_member
  -- leg — the exact conjunct whose EXECUTE check broke anon.
  PERFORM pg_temp.assume('51000000-0000-4000-8000-000000000002', 'authenticated');
  SET LOCAL ROLE authenticated;
  v_probe := pg_temp.probe_bucket();
  RESET ROLE;
  ASSERT v_probe = 'ok:2', format('project team member must read both files; got %L', v_probe);

  -- Client: the client_visible file only (the 00203 narrowing).
  PERFORM pg_temp.assume('51000000-0000-4000-8000-000000000003', 'authenticated');
  SET LOCAL ROLE authenticated;
  v_probe := pg_temp.probe_object(v_shared);
  RESET ROLE;
  ASSERT v_probe = 'ok:1', format('client must read the client_visible file; got %L', v_probe);

  PERFORM pg_temp.assume('51000000-0000-4000-8000-000000000003', 'authenticated');
  SET LOCAL ROLE authenticated;
  v_probe := pg_temp.probe_object(v_private);
  RESET ROLE;
  ASSERT v_probe = 'ok:0', format('client must NOT read the studio-only file; got %L', v_probe);

  -- Signed-in stranger: nothing.
  PERFORM pg_temp.assume('51000000-0000-4000-8000-000000000004', 'authenticated');
  SET LOCAL ROLE authenticated;
  v_probe := pg_temp.probe_bucket();
  RESET ROLE;
  ASSERT v_probe = 'ok:0', format('an unrelated signed-in user must read nothing; got %L', v_probe);
END $$;

-- ── (4) A removed team member loses the read ──────────────────────────────
DO $$
DECLARE
  v_probe text;
BEGIN
  UPDATE public.project_team_members
  SET removed_at = now()
  WHERE project_id = '51100000-0000-4000-8000-000000000001'
    AND user_id = '51000000-0000-4000-8000-000000000002';

  PERFORM pg_temp.assume('51000000-0000-4000-8000-000000000002', 'authenticated');
  SET LOCAL ROLE authenticated;
  v_probe := pg_temp.probe_bucket();
  RESET ROLE;
  ASSERT v_probe = 'ok:0',
    format('a removed team member must lose the read; got %L', v_probe);

  UPDATE public.project_team_members
  SET removed_at = NULL
  WHERE project_id = '51100000-0000-4000-8000-000000000001'
    AND user_id = '51000000-0000-4000-8000-000000000002';
END $$;

-- ── (5) ANTI-VACUITY: the pre-00510 shape errors for anon ─────────────────
-- Put the policy back TO PUBLIC with the identical predicate and prove the
-- anon probe stops returning rows and starts raising 42501. If this section
-- passed, section (2) would be proving nothing.
SAVEPOINT pre_00510_shape;

DO $$
DECLARE
  v_qual  text;
  v_probe text;
BEGIN
  SELECT pg_get_expr(policy.polqual, policy.polrelid) INTO v_qual
  FROM pg_policy AS policy
  WHERE policy.polrelid = 'storage.objects'::regclass
    AND policy.polname = 'Project members can read documents';

  EXECUTE 'DROP POLICY "Project members can read documents" ON storage.objects';
  EXECUTE format(
    'CREATE POLICY "Project members can read documents" ON storage.objects '
    'FOR SELECT TO PUBLIC USING (%s)', v_qual);

  PERFORM pg_temp.assume(NULL, 'anon');
  SET LOCAL ROLE anon;
  v_probe := pg_temp.probe_bucket();
  RESET ROLE;

  ASSERT v_probe = 'err:42501',
    format('the pre-00510 TO PUBLIC shape must deny anon at the ACL layer (42501); got %L — '
           'if this is ok:0 the defect cannot be detected by this suite', v_probe);
END $$;

ROLLBACK TO SAVEPOINT pre_00510_shape;

-- The rollback must have restored the fixed policy.
DO $$
DECLARE
  v_roles oid[];
BEGIN
  SELECT policy.polroles INTO v_roles
  FROM pg_policy AS policy
  WHERE policy.polrelid = 'storage.objects'::regclass
    AND policy.polname = 'Project members can read documents';
  ASSERT v_roles = ARRAY['authenticated'::regrole::oid],
    'the savepoint rollback must have restored the caller-bound policy';
END $$;

ROLLBACK;
