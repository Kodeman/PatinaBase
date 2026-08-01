-- create_client_scope_change_request authority/closure regression (00395)
-- Run after 00394 + 00395 land:
--   psql 'postgresql://postgres:postgres@127.0.0.1:54322/postgres' \
--     -v ON_ERROR_STOP=1 -f supabase/tests/document/client_scope_change_request_test.sql

BEGIN;

INSERT INTO auth.users (
  id, email, encrypted_password, email_confirmed_at, created_at, updated_at,
  instance_id, aud, role
)
VALUES
  ('c9500000-0000-4000-8000-000000000001', 'scope-designer@test.invalid', '', NOW(), NOW(), NOW(),
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('c9500000-0000-4000-8000-000000000002', 'scope-client@test.invalid', '', NOW(), NOW(), NOW(),
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('c9500000-0000-4000-8000-000000000003', 'scope-outsider@test.invalid', '', NOW(), NOW(), NOW(),
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');

INSERT INTO public.profiles (id, email, full_name, created_at, updated_at)
VALUES
  ('c9500000-0000-4000-8000-000000000001', 'scope-designer@test.invalid', 'Scope Designer', NOW(), NOW()),
  ('c9500000-0000-4000-8000-000000000002', 'scope-client@test.invalid', 'Scope Client', NOW(), NOW()),
  ('c9500000-0000-4000-8000-000000000003', 'scope-outsider@test.invalid', 'Scope Outsider', NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.designer_clients (
  id, designer_id, client_id, client_name, status, source
)
VALUES (
  'c9510000-0000-4000-8000-000000000001',
  'c9500000-0000-4000-8000-000000000001',
  'c9500000-0000-4000-8000-000000000002',
  'Scope Client', 'active', 'direct'
);

INSERT INTO public.projects (
  id, name, designer_id, client_id, created_by, status
)
VALUES
  ('c9520000-0000-4000-8000-000000000001', 'Open scope project',
   'c9500000-0000-4000-8000-000000000001', 'c9500000-0000-4000-8000-000000000002',
   'c9500000-0000-4000-8000-000000000001', 'active'),
  ('c9520000-0000-4000-8000-000000000002', 'Completed scope project',
   'c9500000-0000-4000-8000-000000000001', 'c9500000-0000-4000-8000-000000000002',
   'c9500000-0000-4000-8000-000000000001', 'completed'),
  ('c9520000-0000-4000-8000-000000000003', 'Archived scope project',
   'c9500000-0000-4000-8000-000000000001', 'c9500000-0000-4000-8000-000000000002',
   'c9500000-0000-4000-8000-000000000001', 'archived');

DO $$
BEGIN
  ASSERT NOT has_function_privilege(
    'anon',
    'public.create_client_scope_change_request(uuid,text,text)',
    'EXECUTE'
  ), 'anon must not execute client scope-change capture';
  ASSERT has_function_privilege(
    'authenticated',
    'public.create_client_scope_change_request(uuid,text,text)',
    'EXECUTE'
  ), 'authenticated must execute client scope-change capture';
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.assume_scope_actor(p_actor uuid)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', p_actor, 'role', 'authenticated')::text,
    true
  );
END;
$$;

SET LOCAL ROLE authenticated;
SELECT pg_temp.assume_scope_actor('c9500000-0000-4000-8000-000000000002');

-- The old direct insert path stays unavailable under client RLS.
DO $$
DECLARE
  v_denied boolean := false;
BEGIN
  BEGIN
    INSERT INTO public.scope_change_requests (
      project_id, requested_by, title, description, status, sent_at
    )
    VALUES (
      'c9520000-0000-4000-8000-000000000001',
      'c9500000-0000-4000-8000-000000000002',
      'Direct insert', 'Must remain denied', 'sent', now()
    );
  EXCEPTION WHEN insufficient_privilege THEN
    v_denied := true;
  END;
  ASSERT v_denied, 'client direct INSERT must remain denied';
END;
$$;

DO $$
DECLARE
  v_receipt jsonb;
  v_request_id uuid;
BEGIN
  v_receipt := public.create_client_scope_change_request(
    'c9520000-0000-4000-8000-000000000001',
    '  Add reading lights  ',
    '  Please add one beside each chair.  '
  );
  v_request_id := (v_receipt->>'id')::uuid;

  ASSERT jsonb_object_length(v_receipt) = 4
     AND v_receipt ?& ARRAY['id', 'project_id', 'status', 'sent_at'],
    format('receipt must expose only safe exact keys, got %s', v_receipt);
  ASSERT v_receipt->>'project_id' = 'c9520000-0000-4000-8000-000000000001'
     AND v_receipt->>'status' = 'sent',
    format('receipt project/status mismatch: %s', v_receipt);
  ASSERT (
    SELECT title = 'Add reading lights'
       AND description = 'Please add one beside each chair.'
       AND requested_by = 'c9500000-0000-4000-8000-000000000002'
       AND status = 'sent'
       AND sent_at IS NOT NULL
    FROM public.scope_change_requests
    WHERE id = v_request_id
  ), 'RPC must trim and persist one sent request for its authenticated client';
  ASSERT (
    SELECT count(*) = 1
    FROM public.client_activity_log
    WHERE designer_client_id = 'c9510000-0000-4000-8000-000000000001'
      AND activity_type = 'scope_change_requested'
      AND metadata->>'change_id' = v_request_id::text
  ), 'request and designer activity must land together';
END;
$$;

-- Closed projects reject at the locked authority boundary.
DO $$
DECLARE
  v_completed_denied boolean := false;
  v_archived_denied boolean := false;
BEGIN
  BEGIN
    PERFORM public.create_client_scope_change_request(
      'c9520000-0000-4000-8000-000000000002', 'Late change', 'Too late'
    );
  EXCEPTION WHEN check_violation THEN
    v_completed_denied := SQLERRM =
      'create_client_scope_change_request: completed_project';
  END;

  BEGIN
    PERFORM public.create_client_scope_change_request(
      'c9520000-0000-4000-8000-000000000003', 'Archived change', 'Too late'
    );
  EXCEPTION WHEN check_violation THEN
    v_archived_denied := SQLERRM =
      'create_client_scope_change_request: completed_project';
  END;

  ASSERT v_completed_denied, 'completed project must reject a client request';
  ASSERT v_archived_denied, 'archived project must reject a client request';
  ASSERT (
    SELECT count(*) = 0
    FROM public.scope_change_requests
    WHERE project_id IN (
      'c9520000-0000-4000-8000-000000000002',
      'c9520000-0000-4000-8000-000000000003'
    )
  ), 'closed-project rejection must leave no request row';
END;
$$;

-- An authenticated client cannot target another household's project.
SELECT pg_temp.assume_scope_actor('c9500000-0000-4000-8000-000000000003');
DO $$
DECLARE
  v_denied boolean := false;
BEGIN
  BEGIN
    PERFORM public.create_client_scope_change_request(
      'c9520000-0000-4000-8000-000000000001', 'Foreign change', 'Not my work'
    );
  EXCEPTION WHEN insufficient_privilege THEN
    v_denied := true;
  END;
  ASSERT v_denied, 'foreign client must be denied';
END;
$$;

ROLLBACK;
