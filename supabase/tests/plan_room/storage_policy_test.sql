-- ═══════════════════════════════════════════════════════════════════════════
-- project-documents bucket policies (00170 → 00203 → 00430)
--
-- The regression this pins: an unqualified `name` inside a subquery over
-- public.projects binds to projects.name, not storage.objects.name, and the
-- policy silently denies everything. Every assertion below runs under
-- SET ROLE authenticated with real JWT claims — as postgres the whole file
-- would pass on BYPASSRLS while proving nothing.
--
-- Run:
--   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -X -q \
--     -v ON_ERROR_STOP=1 \
--     -f supabase/tests/plan_room/storage_policy_test.sql
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

SET LOCAL statement_timeout = '60s';

INSERT INTO auth.users (
  id, email, encrypted_password, email_confirmed_at, created_at, updated_at,
  instance_id, aud, role
)
VALUES
  ('6c000000-0000-4000-8000-000000000001', 'stor-owner@test.invalid', '', now(), now(), now(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('6c000000-0000-4000-8000-000000000002', 'stor-outsider@test.invalid', '', now(), now(), now(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('6c000000-0000-4000-8000-000000000003', 'stor-client@test.invalid', '', now(), now(), now(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');

INSERT INTO public.profiles (id, email, full_name, created_at, updated_at)
VALUES
  ('6c000000-0000-4000-8000-000000000001', 'stor-owner@test.invalid', 'Storage Owner', now(), now()),
  ('6c000000-0000-4000-8000-000000000002', 'stor-outsider@test.invalid', 'Storage Outsider', now(), now()),
  ('6c000000-0000-4000-8000-000000000003', 'stor-client@test.invalid', 'Storage Client', now(), now())
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name;

-- The project's NAME is deliberately something storage.foldername() would maul:
-- no slash, so foldername() returns {} and the shadowed reference evaluates
-- NULL. That is exactly the value the broken policies were testing against.
INSERT INTO public.projects (id, name, designer_id, client_id, created_by)
VALUES
  ('6c000000-0000-4000-8000-000000000101', 'Ashford Residence',
   '6c000000-0000-4000-8000-000000000001', '6c000000-0000-4000-8000-000000000003',
   '6c000000-0000-4000-8000-000000000001'),
  ('6c000000-0000-4000-8000-000000000102', 'Foreign Project',
   '6c000000-0000-4000-8000-000000000002', NULL,
   '6c000000-0000-4000-8000-000000000002');

CREATE OR REPLACE FUNCTION pg_temp.assume_user(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', p_user_id::text, 'role', 'authenticated')::text,
    true
  );
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.assume_user_role(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', p_user_id::text, 'role', 'authenticated')::text,
    true
  );
  EXECUTE 'SET LOCAL ROLE authenticated';
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.reset_user_role()
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claims', NULL, true);
END;
$$;

GRANT EXECUTE ON FUNCTION pg_temp.reset_user_role() TO authenticated;

DO $$
DECLARE
  v_project  uuid := '6c000000-0000-4000-8000-000000000101';
  v_owner    uuid := '6c000000-0000-4000-8000-000000000001';
  v_outsider uuid := '6c000000-0000-4000-8000-000000000002';
  v_client   uuid := '6c000000-0000-4000-8000-000000000003';
  v_path     text := '6c000000-0000-4000-8000-000000000101/plans/a-101-a.pdf';
  v_scratch  text := '6c000000-0000-4000-8000-000000000101/plans/scratch.pdf';
  v_sheet    uuid;
  v_pol      record;
  v_count    integer;
  v_raised   boolean;
BEGIN
  -- ── The catalog invariant ─────────────────────────────────────────────
  -- Cheap and exact: on this bucket, storage.foldername() must never be handed
  -- a column belonging to something the subquery joined. This is the assertion
  -- that would have caught 00170 on the day it shipped.
  v_count := 0;
  FOR v_pol IN
    SELECT policyname, COALESCE(qual, '') || ' ' || COALESCE(with_check, '') AS body
    FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND (qual LIKE '%project-documents%' OR with_check LIKE '%project-documents%')
  LOOP
    v_count := v_count + 1;
    ASSERT v_pol.body !~ 'storage\.foldername\((?!objects\.)[a-z_]+\.',
      format('%s applies storage.foldername to a joined table''s column', v_pol.policyname);
    ASSERT v_pol.body !~ 'storage_path = (?!objects\.name)',
      format('%s compares storage_path to something other than objects.name', v_pol.policyname);
  END LOOP;
  ASSERT v_count = 7, 'the project-documents bucket carries seven policies';

  -- ── The designer may put a file in their own project's prefix ─────────
  PERFORM pg_temp.assume_user_role(v_owner);
  INSERT INTO storage.objects (bucket_id, name, owner)
  VALUES ('project-documents', v_path, v_owner);
  ASSERT (SELECT count(*) = 1 FROM storage.objects
          WHERE bucket_id = 'project-documents' AND name = v_path),
    'the owning designer must be able to upload into their project prefix';

  INSERT INTO storage.objects (bucket_id, name, owner)
  VALUES ('project-documents', v_scratch, v_owner);
  PERFORM pg_temp.reset_user_role();

  -- ── Nobody else may ───────────────────────────────────────────────────
  PERFORM pg_temp.assume_user_role(v_outsider);
  v_raised := false;
  BEGIN
    INSERT INTO storage.objects (bucket_id, name, owner)
    VALUES ('project-documents',
            '6c000000-0000-4000-8000-000000000101/plans/intruder.pdf', v_outsider);
  EXCEPTION WHEN insufficient_privilege THEN v_raised := true;
  END;
  ASSERT v_raised, 'an outsider must not upload into another studio''s project prefix';

  SELECT count(*) INTO v_count FROM storage.objects
   WHERE bucket_id = 'project-documents' AND name = v_path;
  ASSERT v_count = 0, 'an outsider must not read another studio''s project objects';
  PERFORM pg_temp.reset_user_role();

  -- ── The designer reads their own ──────────────────────────────────────
  PERFORM pg_temp.assume_user_role(v_owner);
  SELECT count(*) INTO v_count FROM storage.objects
   WHERE bucket_id = 'project-documents' AND name = v_path;
  ASSERT v_count = 1, 'the owning designer must be able to read their project objects';

  UPDATE storage.objects SET metadata = '{"probe":true}'::jsonb
   WHERE bucket_id = 'project-documents' AND name = v_path;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  ASSERT v_count = 1, 'the owning designer must be able to update their project objects';
  PERFORM pg_temp.reset_user_role();

  -- ── The client sees nothing until a print is filed AND shared ─────────
  PERFORM pg_temp.assume_user_role(v_client);
  SELECT count(*) INTO v_count FROM storage.objects
   WHERE bucket_id = 'project-documents' AND name = v_path;
  ASSERT v_count = 0,
    'the client must not reach a project object with no client_visible document';
  PERFORM pg_temp.reset_user_role();

  -- File the object as a plan print and share the sheet, which is what puts a
  -- client_visible project_documents row behind it.
  PERFORM pg_temp.assume_user(v_owner);
  PERFORM public.file_plan_prints(
    v_project, 'stor-batch-1',
    jsonb_build_array(jsonb_build_object(
      'kind', 'new_sheet',
      'sheet', jsonb_build_object('number', 'A-101', 'title', 'Ground Floor Plan'),
      'print', jsonb_build_object(
        'storage_path', v_path, 'sha256', repeat('a', 64), 'size_bytes', 4096))));
  SELECT id INTO v_sheet FROM public.plan_sheets WHERE project_id = v_project;

  PERFORM pg_temp.assume_user_role(v_client);
  SELECT count(*) INTO v_count FROM storage.objects
   WHERE bucket_id = 'project-documents' AND name = v_path;
  ASSERT v_count = 0, 'a filed but unshared print stays out of the client''s reach';
  PERFORM pg_temp.reset_user_role();

  PERFORM pg_temp.assume_user(v_owner);
  PERFORM public.set_plan_sheet_state(v_sheet, 'shared');

  PERFORM pg_temp.assume_user_role(v_client);
  SELECT count(*) INTO v_count FROM storage.objects
   WHERE bucket_id = 'project-documents' AND name = v_path;
  ASSERT v_count = 1,
    'once the sheet is shared the client must be able to read the print''s object';
  SELECT count(*) INTO v_count FROM storage.objects
   WHERE bucket_id = 'project-documents' AND name = v_scratch;
  ASSERT v_count = 0,
    'the client must still not reach a project object nobody shared with them';

  -- The client is a reader here and nothing else.
  v_raised := false;
  BEGIN
    INSERT INTO storage.objects (bucket_id, name, owner)
    VALUES ('project-documents',
            '6c000000-0000-4000-8000-000000000101/plans/client.pdf', v_client);
  EXCEPTION WHEN insufficient_privilege THEN v_raised := true;
  END;
  ASSERT v_raised, 'the client must not upload into the project prefix';
  PERFORM pg_temp.reset_user_role();

  -- ── Deletes follow the same authority ─────────────────────────────────
  -- storage.protect_delete is a BEFORE STATEMENT trigger that refuses every
  -- direct DELETE unless this GUC is set; the row-level authority under test is
  -- still the policy, which is what decides how many rows the statement sees.
  PERFORM set_config('storage.allow_delete_query', 'true', true);

  PERFORM pg_temp.assume_user_role(v_outsider);
  DELETE FROM storage.objects
   WHERE bucket_id = 'project-documents' AND name = v_scratch;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  ASSERT v_count = 0, 'an outsider must not delete another studio''s project objects';
  PERFORM pg_temp.reset_user_role();

  PERFORM pg_temp.assume_user_role(v_owner);
  DELETE FROM storage.objects
   WHERE bucket_id = 'project-documents' AND name = v_scratch;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  ASSERT v_count = 1, 'the owning designer must be able to delete their project objects';
  PERFORM pg_temp.reset_user_role();

  RAISE NOTICE 'project-documents storage policy assertions passed';
END
$$;

ROLLBACK;
