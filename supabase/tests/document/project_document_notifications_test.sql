-- 00431 project-document notification integration test.
-- Runner: plain psql against a locally reset Supabase database.

BEGIN;

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

INSERT INTO auth.users (
  id, email, encrypted_password, email_confirmed_at, created_at, updated_at,
  instance_id, aud, role
) VALUES
  ('fd000000-0000-4000-8000-000000000001', 'file-owner@test.invalid', '', now(), now(), now(),
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('fd000000-0000-4000-8000-000000000002', 'file-client@test.invalid', '', now(), now(), now(),
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('fd000000-0000-4000-8000-000000000003', 'file-team@test.invalid', '', now(), now(), now(),
   '00000000-0000-0000-8000-000000000000', 'authenticated', 'authenticated'),
  ('fd000000-0000-4000-8000-000000000004', 'file-outsider@test.invalid', '', now(), now(), now(),
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');

INSERT INTO public.profiles (id, email, full_name, is_designer, created_at, updated_at)
VALUES
  ('fd000000-0000-4000-8000-000000000001', 'file-owner@test.invalid', 'File Owner', true, now(), now()),
  ('fd000000-0000-4000-8000-000000000002', 'file-client@test.invalid', 'File Client', false, now(), now()),
  ('fd000000-0000-4000-8000-000000000003', 'file-team@test.invalid', 'File Teammate', true, now(), now()),
  ('fd000000-0000-4000-8000-000000000004', 'file-outsider@test.invalid', 'File Outsider', false, now(), now())
ON CONFLICT (id) DO UPDATE
SET email = EXCLUDED.email, full_name = EXCLUDED.full_name;

SELECT pg_temp.assume_user('fd000000-0000-4000-8000-000000000001', 'service_role');

INSERT INTO public.projects (
  id, name, created_by, designer_id, client_id
) VALUES (
  'fd100000-0000-4000-8000-000000000001',
  'File notification project',
  'fd000000-0000-4000-8000-000000000001',
  'fd000000-0000-4000-8000-000000000001',
  'fd000000-0000-4000-8000-000000000002'
);

INSERT INTO public.project_team_members (
  id, project_id, user_id, role, assigned_by
) VALUES (
  'fd200000-0000-4000-8000-000000000001',
  'fd100000-0000-4000-8000-000000000001',
  'fd000000-0000-4000-8000-000000000003',
  'support_designer',
  'fd000000-0000-4000-8000-000000000001'
);

SELECT pg_temp.assume_user('fd000000-0000-4000-8000-000000000001', 'authenticated');

INSERT INTO public.project_documents (
  id, project_id, title, doc_type, storage_path, client_visible, uploaded_by,
  created_at
) VALUES (
  'fd300000-0000-4000-8000-000000000001',
  'fd100000-0000-4000-8000-000000000001',
  'Site measurements.pdf',
  'pdf',
  'fd100000-0000-4000-8000-000000000001/site-measurements.pdf',
  false,
  'fd000000-0000-4000-8000-000000000001',
  '2026-08-07 12:00:00+00'
);

DO $$
DECLARE
  v_metadata jsonb;
BEGIN
  ASSERT (
    SELECT count(*) = 1
    FROM public.notification_log
    WHERE type = 'project_file_changed'
      AND metadata ->> 'file_id' = 'fd300000-0000-4000-8000-000000000001'
  ), 'a private upload must notify only the non-actor internal teammate';

  ASSERT EXISTS (
    SELECT 1 FROM public.notification_log
    WHERE user_id = 'fd000000-0000-4000-8000-000000000003'
      AND type = 'project_file_changed'
  ), 'the active teammate must receive the file notice';

  ASSERT NOT EXISTS (
    SELECT 1 FROM public.notification_log
    WHERE user_id IN (
      'fd000000-0000-4000-8000-000000000001',
      'fd000000-0000-4000-8000-000000000002',
      'fd000000-0000-4000-8000-000000000004'
    )
      AND metadata ->> 'file_id' = 'fd300000-0000-4000-8000-000000000001'
  ), 'the actor, unshared client, and outsider must not receive the notice';

  SELECT metadata INTO v_metadata
  FROM public.notification_log
  WHERE user_id = 'fd000000-0000-4000-8000-000000000003'
    AND type = 'project_file_changed';

  ASSERT v_metadata ->> 'event_key' =
      'project-document:fd300000-0000-4000-8000-000000000001:2026-08-07 12:00:00+00',
    'event key must identify the immutable inserted revision';
  ASSERT v_metadata ->> 'project_id' = 'fd100000-0000-4000-8000-000000000001'
     AND v_metadata ->> 'file_name' = 'Site measurements.pdf'
     AND v_metadata ->> 'actor_name' = 'File Owner'
     AND v_metadata ->> 'deep_link' = '/doc/fd100000-0000-4000-8000-000000000001',
    'the notice must preserve its project, file, actor, and document address';
END;
$$;

SELECT pg_temp.assume_user('fd000000-0000-4000-8000-000000000003', 'service_role');

INSERT INTO public.project_documents (
  id, project_id, title, doc_type, storage_path, client_visible, uploaded_by,
  version_of, created_at
) VALUES (
  'fd300000-0000-4000-8000-000000000002',
  'fd100000-0000-4000-8000-000000000001',
  'Site measurements.pdf',
  'pdf',
  'fd100000-0000-4000-8000-000000000001/site-measurements-v2.pdf',
  true,
  'fd000000-0000-4000-8000-000000000003',
  'fd300000-0000-4000-8000-000000000001',
  '2026-08-07 13:00:00+00'
);

DO $$
BEGIN
  ASSERT (
    SELECT count(*) = 2
    FROM public.notification_log
    WHERE metadata ->> 'file_id' = 'fd300000-0000-4000-8000-000000000002'
  ), 'a shared revision must notify its owner and client, excluding its actor';

  ASSERT EXISTS (
    SELECT 1 FROM public.notification_log
    WHERE user_id = 'fd000000-0000-4000-8000-000000000001'
      AND metadata ->> 'subject' = 'New version: Site measurements.pdf'
  ), 'the project owner must receive the revision notice';

  ASSERT EXISTS (
    SELECT 1 FROM public.notification_log
    WHERE user_id = 'fd000000-0000-4000-8000-000000000002'
      AND metadata ->> 'file_id' = 'fd300000-0000-4000-8000-000000000002'
  ), 'the client must receive only a client-visible revision';

  ASSERT NOT has_function_privilege(
    'authenticated',
    'public.notify_project_document_change()',
    'EXECUTE'
  ), 'authenticated users must not invoke the definer trigger function directly';
END;
$$;

ROLLBACK;
