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
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('c9500000-0000-4000-8000-000000000004', 'scope-peer@test.invalid', '', NOW(), NOW(), NOW(),
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('c9500000-0000-4000-8000-000000000005', 'scope-replacement@test.invalid', '', NOW(), NOW(), NOW(),
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');

INSERT INTO public.profiles (id, email, full_name, created_at, updated_at)
VALUES
  ('c9500000-0000-4000-8000-000000000001', 'scope-designer@test.invalid', 'Scope Designer', NOW(), NOW()),
  ('c9500000-0000-4000-8000-000000000002', 'scope-client@test.invalid', 'Scope Client', NOW(), NOW()),
  ('c9500000-0000-4000-8000-000000000003', 'scope-outsider@test.invalid', 'Scope Outsider', NOW(), NOW()),
  ('c9500000-0000-4000-8000-000000000004', 'scope-peer@test.invalid', 'Scope Studio Peer', NOW(), NOW()),
  ('c9500000-0000-4000-8000-000000000005', 'scope-replacement@test.invalid', 'Scope Replacement', NOW(), NOW())
ON CONFLICT (id) DO UPDATE
SET email = EXCLUDED.email,
    full_name = EXCLUDED.full_name,
    updated_at = EXCLUDED.updated_at;

INSERT INTO public.organizations (id, type, name, slug, status)
VALUES
  ('c9540000-0000-4000-8000-000000000001',
   'design_studio', 'Scope Integrity Studio', 'scope-integrity-studio', 'active'),
  ('c9540000-0000-4000-8000-000000000002',
   'contractor', 'Scope Shared Contractor', 'scope-shared-contractor', 'active');

INSERT INTO public.organization_members (
  id, user_id, organization_id, role, status, joined_at
)
VALUES
  ('c9541000-0000-4000-8000-000000000001',
   'c9500000-0000-4000-8000-000000000001',
   'c9540000-0000-4000-8000-000000000001', 'owner', 'active', NOW()),
  ('c9541000-0000-4000-8000-000000000002',
   'c9500000-0000-4000-8000-000000000004',
   'c9540000-0000-4000-8000-000000000001', 'member', 'active', NOW()),
  -- This relationship satisfies broad is_studio_comember but must confer no
  -- scope-transition authority because the shared org is a contractor.
  ('c9541000-0000-4000-8000-000000000003',
   'c9500000-0000-4000-8000-000000000001',
   'c9540000-0000-4000-8000-000000000002', 'member', 'active', NOW()),
  ('c9541000-0000-4000-8000-000000000004',
   'c9500000-0000-4000-8000-000000000003',
   'c9540000-0000-4000-8000-000000000002', 'member', 'active', NOW());

INSERT INTO public.designer_clients (
  id, designer_id, client_id, client_name, status, source
)
VALUES
  ('c9510000-0000-4000-8000-000000000001',
   'c9500000-0000-4000-8000-000000000001',
   'c9500000-0000-4000-8000-000000000002',
   'Scope Client', 'active', 'direct'),
  ('c9510000-0000-4000-8000-000000000002',
   'c9500000-0000-4000-8000-000000000001',
   'c9500000-0000-4000-8000-000000000005',
   'Scope Replacement', 'active', 'direct');

-- 00511 requires a project lead to hold a designer-domain role and belong to
-- exactly one active design studio for the trigger to derive/keep its studio.
-- Grant the studio's designer members their role with triggers suppressed: a
-- role grant flips is_designer and auto-provisions a personal studio (00295),
-- which would make the lead multi-studio and defeat single-studio derivation.
-- The explicit Scope Integrity Studio stays their sole studio.
SET LOCAL session_replication_role = replica;
INSERT INTO public.user_roles (user_id, role_id, granted_by)
SELECT member_id, role.id, member_id
FROM (VALUES
  ('c9500000-0000-4000-8000-000000000001'::uuid),
  ('c9500000-0000-4000-8000-000000000004'::uuid)
) AS designer(member_id)
CROSS JOIN public.roles AS role
WHERE role.name = 'studio_owner';
SET LOCAL session_replication_role = origin;

INSERT INTO public.projects (
  id, name, designer_id, client_id, created_by, status,
  budget_cents, design_fee_cents, target_end_date
)
VALUES
  ('c9520000-0000-4000-8000-000000000001', 'Open scope project',
   'c9500000-0000-4000-8000-000000000001', 'c9500000-0000-4000-8000-000000000002',
   'c9500000-0000-4000-8000-000000000001', 'active', 10000, 1000, DATE '2026-08-31'),
  ('c9520000-0000-4000-8000-000000000002', 'Completed scope project',
   'c9500000-0000-4000-8000-000000000001', 'c9500000-0000-4000-8000-000000000002',
   'c9500000-0000-4000-8000-000000000001', 'completed', 0, 0, NULL),
  ('c9520000-0000-4000-8000-000000000003', 'Archived scope project',
   'c9500000-0000-4000-8000-000000000001', 'c9500000-0000-4000-8000-000000000002',
   'c9500000-0000-4000-8000-000000000001', 'archived', 0, 0, NULL),
  ('c9520000-0000-4000-8000-000000000004', 'Apply scope project',
   'c9500000-0000-4000-8000-000000000001', 'c9500000-0000-4000-8000-000000000002',
   'c9500000-0000-4000-8000-000000000001', 'active', 10000, 1000, DATE '2026-08-31'),
  ('c9520000-0000-4000-8000-000000000005', 'Canonical apply project',
   'c9500000-0000-4000-8000-000000000001', 'c9500000-0000-4000-8000-000000000002',
   'c9500000-0000-4000-8000-000000000001', 'active', 20000, 2000, DATE '2026-09-30');

-- Trusted setup materializes source states. Untrusted direct INSERT/UPDATE
-- assertions below run through the installed 00395 guard and ACLs.
INSERT INTO public.scope_change_requests (
  id, project_id, requested_by, request_origin, title, description, status, sent_at,
  additional_ffe_budget_cents, additional_design_fee_cents,
  timeline_impact_weeks, new_rooms, new_ffe_items
)
VALUES
  ('c9530000-0000-4000-8000-000000000010',
   'c9520000-0000-4000-8000-000000000001',
   'c9500000-0000-4000-8000-000000000004',
   'designer_amendment',
   'Studio send', 'Studio peer sends this draft.', 'draft', NULL, 0, 0, 0,
   '[]'::jsonb, '[]'::jsonb),
  ('c9530000-0000-4000-8000-000000000011',
   'c9520000-0000-4000-8000-000000000001',
   'c9500000-0000-4000-8000-000000000001',
   'designer_amendment',
   'Client approve', 'Client approves this sent change.', 'sent', NOW(), 0, 0, 0,
   '[]'::jsonb, '[]'::jsonb),
  ('c9530000-0000-4000-8000-000000000012',
   'c9520000-0000-4000-8000-000000000001',
   'c9500000-0000-4000-8000-000000000001',
   'designer_amendment',
   'Client decline', 'Client declines this sent change.', 'sent', NOW(), 0, 0, 0,
   '[]'::jsonb, '[]'::jsonb),
  ('c9530000-0000-4000-8000-000000000013',
   'c9520000-0000-4000-8000-000000000001',
   'c9500000-0000-4000-8000-000000000002',
   'client_request',
   'Client cancel', 'Client cancels their own request.', 'sent', NOW(), 0, 0, 0,
   '[]'::jsonb, '[]'::jsonb),
  ('c9530000-0000-4000-8000-000000000014',
   'c9520000-0000-4000-8000-000000000004',
   'c9500000-0000-4000-8000-000000000001',
   'designer_amendment',
   'Studio apply', 'Studio peer applies this approved request.',
   'approved', NOW(), 500, 200, 1,
   '[{"name":"Reading Nook","roomType":"living","budgetCents":800,"ffeCategories":["lighting"]}]'::jsonb,
   '[{"roomName":"Reading Nook","name":"Floor Lamp","ffeCategory":"lighting","itemType":"allowance","quantity":2,"unitPriceCents":15000}]'::jsonb),
  ('c9530000-0000-4000-8000-000000000015',
   'c9520000-0000-4000-8000-000000000001',
   'c9500000-0000-4000-8000-000000000001',
   'designer_amendment',
   'Illegal approval source', 'A draft cannot be approved.', 'draft', NULL, 0, 0, 0,
   '[]'::jsonb, '[]'::jsonb),
  ('c9530000-0000-4000-8000-000000000016',
   'c9520000-0000-4000-8000-000000000001',
   'c9500000-0000-4000-8000-000000000001',
   'designer_amendment',
   'Wrong row token', 'A sibling token cannot send this row.', 'draft', NULL, 0, 0, 0,
   '[]'::jsonb, '[]'::jsonb),
  ('c9530000-0000-4000-8000-000000000018',
   'c9520000-0000-4000-8000-000000000001',
   'c9500000-0000-4000-8000-000000000002',
   'client_request',
   'Self approval forbidden', 'Client-authored requests are not approvals.',
   'sent', NOW(), 0, 0, 0, '[]'::jsonb, '[]'::jsonb),
  ('c9530000-0000-4000-8000-000000000019',
   'c9520000-0000-4000-8000-000000000005',
   'c9500000-0000-4000-8000-000000000001',
   'designer_amendment',
   'Canonical apply', 'Canonical snake case remains supported.',
   'approved', NOW(), 700, 300, 2,
   '[{"name":"Library","room_type":"library","budget_cents":1200,"ffe_categories":["seating"],"notes":"Quiet room"}]'::jsonb,
   '[{"room_name":"Library","name":"Reading Chair","ffe_category":"seating","item_type":"fixed","quantity":1,"unit_price_cents":25000,"line_total_cents":25000,"vendor_name":"Chair Co"}]'::jsonb),
  ('c9530000-0000-4000-8000-000000000022',
   'c9520000-0000-4000-8000-000000000001',
   'c9500000-0000-4000-8000-000000000003',
   'designer_amendment',
   'Contractor-authored draft', 'A shared contractor org is not a design studio.',
   'draft', NULL, 0, 0, 0, '[]'::jsonb, '[]'::jsonb),
  ('c9530000-0000-4000-8000-000000000025',
   'c9520000-0000-4000-8000-000000000002',
   'c9500000-0000-4000-8000-000000000001',
   'designer_amendment',
   'Closed apply', 'Even approved work cannot mutate a completed project.',
   'approved', NOW(), 900, 100, 1, '[]'::jsonb, '[]'::jsonb);

DO $$
BEGIN
  ASSERT NOT has_function_privilege(
    'anon',
    'public.create_client_scope_change_request(uuid,uuid,text,text)',
    'EXECUTE'
  ), 'anon must not execute client scope-change capture';
  ASSERT has_function_privilege(
    'authenticated',
    'public.create_client_scope_change_request(uuid,uuid,text,text)',
    'EXECUTE'
  ), 'authenticated must execute client scope-change capture';
  ASSERT to_regprocedure(
    'public.create_client_scope_change_request(uuid,text,text)'
  ) IS NULL, 'the non-idempotent three-argument overload must not survive';
  ASSERT NOT has_table_privilege(
    'authenticated', 'public.scope_change_requests', 'UPDATE'
  ), 'authenticated must not update scope-change rows directly';
  ASSERT NOT has_table_privilege(
    'authenticated', 'public.scope_change_requests', 'DELETE'
  ), 'authenticated must not delete scope-change rows directly';
  ASSERT NOT has_table_privilege(
    'service_role', 'public.scope_change_requests', 'UPDATE'
  ), 'service_role must use checked scope-change update RPCs';
  ASSERT NOT has_table_privilege(
    'service_role', 'public.scope_change_requests', 'DELETE'
  ), 'service_role must not delete scope-change evidence directly';
  ASSERT has_function_privilege(
    'authenticated', 'public.send_scope_change_request(uuid,uuid)', 'EXECUTE'
  ), 'authenticated must execute checked send';
  ASSERT has_function_privilege(
    'authenticated',
    'public.approve_scope_change_request(uuid,uuid,text,text)', 'EXECUTE'
  ), 'authenticated must execute checked approve';
  ASSERT has_function_privilege(
    'authenticated',
    'public.accept_client_scope_change_request(uuid,uuid)', 'EXECUTE'
  ), 'authenticated must execute checked designer acceptance';
  ASSERT has_function_privilege(
    'authenticated',
    'public.decline_scope_change_request(uuid,uuid,text)', 'EXECUTE'
  ), 'authenticated must execute checked decline';
  ASSERT has_function_privilege(
    'authenticated', 'public.cancel_scope_change_request(uuid,uuid)', 'EXECUTE'
  ), 'authenticated must execute checked cancel';
  ASSERT has_function_privilege(
    'authenticated', 'public.apply_scope_change(uuid)', 'EXECUTE'
  ), 'authenticated must execute checked apply';
  ASSERT NOT has_function_privilege(
    'anon', 'public.apply_scope_change(uuid)', 'EXECUTE'
  ), 'anon must not execute apply';
  ASSERT NOT has_function_privilege(
    'authenticated',
    'public.guard_scope_change_request_integrity()', 'EXECUTE'
  ), 'authenticated must not call the table guard directly';
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
-- 00483 strips PUBLIC EXECUTE from routines created after it, pg_temp included,
-- and every call below runs under SET LOCAL ROLE authenticated.
GRANT EXECUTE ON FUNCTION pg_temp.assume_scope_actor(uuid) TO PUBLIC;

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
  v_retry_receipt jsonb;
  v_request_id uuid;
  v_conflict_denied boolean := false;
BEGIN
  v_receipt := public.create_client_scope_change_request(
    'c9520000-0000-4000-8000-000000000001',
    'c9530000-0000-4000-8000-000000000001',
    '  Add reading lights  ',
    '  Please add one beside each chair.  '
  );
  v_request_id := (v_receipt->>'id')::uuid;

  ASSERT (SELECT count(*) FROM jsonb_object_keys(v_receipt)) = 4
     AND v_receipt ?& ARRAY['id', 'project_id', 'status', 'sent_at'],
    format('receipt must expose only safe exact keys, got %s', v_receipt);
  ASSERT v_receipt->>'project_id' = 'c9520000-0000-4000-8000-000000000001'
     AND v_receipt->>'status' = 'sent'
     AND v_request_id = 'c9530000-0000-4000-8000-000000000001',
    format('receipt project/status mismatch: %s', v_receipt);
  ASSERT (
    SELECT title = 'Add reading lights'
       AND description = 'Please add one beside each chair.'
       AND requested_by = 'c9500000-0000-4000-8000-000000000002'
       AND request_origin = 'client_request'
       AND status = 'sent'
       AND sent_at IS NOT NULL
    FROM public.scope_change_requests
    WHERE id = v_request_id
  ), 'RPC must trim and persist one sent request for its authenticated client';

  -- A transport retry reuses its caller-owned UUID and receives byte-for-byte
  -- equivalent JSON, including the original sent_at timestamp.
  v_retry_receipt := public.create_client_scope_change_request(
    'c9520000-0000-4000-8000-000000000001',
    'c9530000-0000-4000-8000-000000000001',
    'Add reading lights',
    'Please add one beside each chair.'
  );
  ASSERT v_retry_receipt = v_receipt,
    format('same-key retry must return the exact receipt: %s <> %s',
      v_retry_receipt, v_receipt);
  ASSERT (
    SELECT count(*) = 1
    FROM public.scope_change_requests
    WHERE id = 'c9530000-0000-4000-8000-000000000001'
  ), 'same-key retry must leave exactly one request';

  BEGIN
    PERFORM public.create_client_scope_change_request(
      'c9520000-0000-4000-8000-000000000001',
      'c9530000-0000-4000-8000-000000000001',
      'Different intent',
      'The same UUID must not be reusable for different input.'
    );
  EXCEPTION WHEN unique_violation THEN
    v_conflict_denied := SQLERRM =
      'create_client_scope_change_request: idempotency_conflict';
  END;
  ASSERT v_conflict_denied,
    'same-key request with changed input must fail as an idempotency conflict';
END;
$$;

-- The client cannot read the designer's private activity log, so verify the
-- atomic side effect as the migration owner before restoring client context.
RESET ROLE;
DO $$
BEGIN
  ASSERT (
    SELECT count(*) = 1
    FROM public.client_activity_log
    WHERE designer_client_id = 'c9510000-0000-4000-8000-000000000001'
      AND activity_type = 'scope_change_requested'
      AND metadata->>'change_id' IN (
        SELECT request.id::text
        FROM public.scope_change_requests AS request
        WHERE request.project_id = 'c9520000-0000-4000-8000-000000000001'
      )
  ), 'request and designer activity must land together';
END;
$$;
SET LOCAL ROLE authenticated;
SELECT pg_temp.assume_scope_actor('c9500000-0000-4000-8000-000000000002');

-- Client resolution authorities prove the URL project, exact client
-- relationship, designer-origin request, and legal source state.
DO $$
DECLARE
  v_wrong_project_denied boolean := false;
  v_own_request_denied boolean := false;
  v_draft_denied boolean := false;
  v_accept_denied boolean := false;
BEGIN
  BEGIN
    PERFORM public.approve_scope_change_request(
      'c9530000-0000-4000-8000-000000000011',
      'c9520000-0000-4000-8000-000000000002',
      'Scope Client',
      NULL
    );
  EXCEPTION WHEN check_violation THEN
    v_wrong_project_denied := true;
  END;
  ASSERT v_wrong_project_denied,
    'approval must bind the request to the exact project argument';

  PERFORM public.approve_scope_change_request(
    'c9530000-0000-4000-8000-000000000011',
    'c9520000-0000-4000-8000-000000000001',
    '  Scope Client  ',
    '203.0.113.8'
  );
  ASSERT (
    SELECT status = 'approved'
       AND approved_at IS NOT NULL
       AND approved_by = 'c9500000-0000-4000-8000-000000000002'
       AND approved_by_name = 'Scope Client'
       AND approved_ip = '203.0.113.8'
    FROM public.scope_change_requests
    WHERE id = 'c9530000-0000-4000-8000-000000000011'
  ), 'checked approval must stamp only client approval evidence';
  ASSERT current_setting('app.scope_change_transition', true) = '',
    'approve authority token must be cleared after its row update';

  PERFORM public.decline_scope_change_request(
    'c9530000-0000-4000-8000-000000000012',
    'c9520000-0000-4000-8000-000000000001',
    '  Not needed now  '
  );
  ASSERT (
    SELECT status = 'declined'
       AND declined_at IS NOT NULL
       AND decline_reason = 'Not needed now'
    FROM public.scope_change_requests
    WHERE id = 'c9530000-0000-4000-8000-000000000012'
  ), 'checked decline must stamp the legal client response';

  PERFORM public.cancel_scope_change_request(
    'c9530000-0000-4000-8000-000000000013',
    'c9520000-0000-4000-8000-000000000001'
  );
  ASSERT (
    SELECT status = 'cancelled'
    FROM public.scope_change_requests
    WHERE id = 'c9530000-0000-4000-8000-000000000013'
  ), 'client requester must be able to cancel their still-open request';

  BEGIN
    PERFORM public.approve_scope_change_request(
      'c9530000-0000-4000-8000-000000000018',
      'c9520000-0000-4000-8000-000000000001',
      'Scope Client',
      NULL
    );
  EXCEPTION WHEN check_violation THEN
    v_own_request_denied := true;
  END;
  ASSERT v_own_request_denied,
    'client-authored requests cannot be self-approved';

  BEGIN
    PERFORM public.accept_client_scope_change_request(
      'c9530000-0000-4000-8000-000000000001',
      'c9520000-0000-4000-8000-000000000001'
    );
  EXCEPTION WHEN insufficient_privilege THEN
    v_accept_denied := true;
  END;
  ASSERT v_accept_denied,
    'project clients cannot invoke the designer acceptance authority';

  BEGIN
    PERFORM public.approve_scope_change_request(
      'c9530000-0000-4000-8000-000000000015',
      'c9520000-0000-4000-8000-000000000001',
      'Scope Client',
      NULL
    );
  EXCEPTION WHEN check_violation THEN
    v_draft_denied := true;
  END;
  ASSERT v_draft_denied, 'draft requests cannot skip the sent/viewed source state';
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
      'c9520000-0000-4000-8000-000000000002',
      'c9530000-0000-4000-8000-000000000002',
      'Late change',
      'Too late'
    );
  EXCEPTION WHEN check_violation THEN
    v_completed_denied := SQLERRM =
      'create_client_scope_change_request: completed_project';
  END;

  BEGIN
    PERFORM public.create_client_scope_change_request(
      'c9520000-0000-4000-8000-000000000003',
      'c9530000-0000-4000-8000-000000000003',
      'Archived change',
      'Too late'
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
    WHERE id IN (
      'c9530000-0000-4000-8000-000000000002',
      'c9530000-0000-4000-8000-000000000003'
    )
  ), 'closed-project rejection must leave no request row';
END;
$$;

-- An authenticated client cannot target another household's project.
SELECT pg_temp.assume_scope_actor('c9500000-0000-4000-8000-000000000003');
DO $$
DECLARE
  v_denied boolean := false;
  v_send_denied boolean := false;
  v_apply_denied boolean := false;
  v_accept_denied boolean := false;
  v_cancel_denied boolean := false;
  v_direct_draft_denied boolean := false;
BEGIN
  BEGIN
    PERFORM public.create_client_scope_change_request(
      'c9520000-0000-4000-8000-000000000001',
      'c9530000-0000-4000-8000-000000000004',
      'Foreign change',
      'Not my work'
    );
  EXCEPTION WHEN insufficient_privilege THEN
    v_denied := true;
  END;
  ASSERT v_denied, 'foreign client must be denied';

  BEGIN
    INSERT INTO public.scope_change_requests (
      id, project_id, requested_by, title, description
    ) VALUES (
      'c9530000-0000-4000-8000-000000000023',
      'c9520000-0000-4000-8000-000000000001',
      'c9500000-0000-4000-8000-000000000003',
      'Contractor browser draft', 'Only an exact project studio may compose.'
    );
  EXCEPTION WHEN insufficient_privilege THEN
    v_direct_draft_denied := true;
  END;
  ASSERT v_direct_draft_denied,
    'a contractor co-member cannot use the retained browser draft path';

  BEGIN
    PERFORM public.send_scope_change_request(
      'c9530000-0000-4000-8000-000000000010',
      'c9520000-0000-4000-8000-000000000001'
    );
  EXCEPTION WHEN insufficient_privilege THEN
    v_send_denied := true;
  END;
  ASSERT v_send_denied, 'outsider cannot send a studio request';

  BEGIN
    PERFORM public.apply_scope_change(
      'c9530000-0000-4000-8000-000000000014'
    );
  EXCEPTION WHEN insufficient_privilege THEN
    v_apply_denied := true;
  END;
  ASSERT v_apply_denied, 'outsider cannot apply another studio scope change';

  BEGIN
    PERFORM public.accept_client_scope_change_request(
      'c9530000-0000-4000-8000-000000000001',
      'c9520000-0000-4000-8000-000000000001'
    );
  EXCEPTION WHEN insufficient_privilege THEN
    v_accept_denied := true;
  END;
  ASSERT v_accept_denied,
    'a contractor co-member cannot accept a design-studio client request';

  BEGIN
    PERFORM public.cancel_scope_change_request(
      'c9530000-0000-4000-8000-000000000022',
      'c9520000-0000-4000-8000-000000000001'
    );
  EXCEPTION WHEN insufficient_privilege THEN
    v_cancel_denied := true;
  END;
  ASSERT v_cancel_denied,
    'a contractor relationship cannot authorize cancellation in the project studio';
END;
$$;

-- A designer/studio browser may compose a clean draft, but cannot fabricate
-- lifecycle evidence, rewrite a row, or delete the business record directly.
SELECT pg_temp.assume_scope_actor('c9500000-0000-4000-8000-000000000001');
DO $$
DECLARE
  v_fabricated_insert_denied boolean := false;
  v_direct_update_denied boolean := false;
  v_direct_delete_denied boolean := false;
  v_wrong_org_requester_denied boolean := false;
BEGIN
  INSERT INTO public.scope_change_requests (
    id, project_id, requested_by, title, description
  ) VALUES (
    'c9530000-0000-4000-8000-000000000017',
    'c9520000-0000-4000-8000-000000000001',
    'c9500000-0000-4000-8000-000000000001',
    'Clean direct draft', 'Designer draft insert remains supported.'
  );

  BEGIN
    INSERT INTO public.scope_change_requests (
      id, project_id, requested_by, title, description, status, sent_at
    ) VALUES (
      'c9530000-0000-4000-8000-000000000020',
      'c9520000-0000-4000-8000-000000000001',
      'c9500000-0000-4000-8000-000000000001',
      'Fabricated sent row', 'Must use checked send.', 'sent', now()
    );
  EXCEPTION WHEN check_violation THEN
    v_fabricated_insert_denied := SQLERRM =
      'scope_change_request_direct_inserts_must_be_clean_drafts';
  END;
  ASSERT v_fabricated_insert_denied,
    'authenticated inserts must begin as clean drafts';

  BEGIN
    UPDATE public.scope_change_requests
    SET status = 'sent', sent_at = now()
    WHERE id = 'c9530000-0000-4000-8000-000000000017';
  EXCEPTION WHEN insufficient_privilege THEN
    v_direct_update_denied := true;
  END;
  ASSERT v_direct_update_denied,
    'authenticated direct UPDATE must be denied at the table ACL';

  BEGIN
    DELETE FROM public.scope_change_requests
    WHERE id = 'c9530000-0000-4000-8000-000000000017';
  EXCEPTION WHEN insufficient_privilege THEN
    v_direct_delete_denied := true;
  END;
  ASSERT v_direct_delete_denied,
    'authenticated direct DELETE must be denied at the table ACL';

  BEGIN
    PERFORM public.send_scope_change_request(
      'c9530000-0000-4000-8000-000000000022',
      'c9520000-0000-4000-8000-000000000001'
    );
  EXCEPTION WHEN check_violation THEN
    v_wrong_org_requester_denied := true;
  END;
  ASSERT v_wrong_org_requester_denied,
    'a designer cannot legitimize a draft authored through only a contractor org';
END;
$$;

-- Temporarily expose UPDATE inside this rolled-back test transaction so the
-- trigger itself is exercised against forged GUCs and whole-row rewrites.
RESET ROLE;
GRANT UPDATE ON TABLE public.scope_change_requests TO authenticated;
SET LOCAL ROLE authenticated;
SELECT pg_temp.assume_scope_actor('c9500000-0000-4000-8000-000000000001');
DO $$
DECLARE
  v_forged_guc_denied boolean := false;
  v_business_rewrite_denied boolean := false;
  v_origin_rewrite_denied boolean := false;
BEGIN
  PERFORM set_config(
    'app.scope_change_transition',
    format(
      'send:%s:%s',
      'c9530000-0000-4000-8000-000000000017',
      pg_catalog.txid_current()
    ),
    true
  );
  BEGIN
    UPDATE public.scope_change_requests
    SET status = 'sent', sent_at = now()
    WHERE id = 'c9530000-0000-4000-8000-000000000017';
  EXCEPTION WHEN insufficient_privilege THEN
    v_forged_guc_denied := SQLERRM =
      'scope_change_request_transition_requires_checked_authority';
  END;
  PERFORM set_config('app.scope_change_transition', '', true);
  ASSERT v_forged_guc_denied,
    'an authenticated caller cannot forge even an exact-looking row token';

  BEGIN
    UPDATE public.scope_change_requests
    SET title = 'Rewritten evidence'
    WHERE id = 'c9530000-0000-4000-8000-000000000017';
  EXCEPTION WHEN check_violation THEN
    v_business_rewrite_denied := SQLERRM =
      'scope_change_request_business_fields_immutable';
  END;
  ASSERT v_business_rewrite_denied,
    'scope-change identity/business fields must be immutable after insert';

  BEGIN
    UPDATE public.scope_change_requests
    SET request_origin = 'client_request'
    WHERE id = 'c9530000-0000-4000-8000-000000000017';
  EXCEPTION WHEN check_violation THEN
    v_origin_rewrite_denied := SQLERRM =
      'scope_change_request_business_fields_immutable';
  END;
  ASSERT v_origin_rewrite_denied,
    'the persisted request origin must be immutable after insert';
END;
$$;
RESET ROLE;
REVOKE UPDATE ON TABLE public.scope_change_requests FROM authenticated;

-- A row-scoped owner token cannot bleed into a sibling update in the same
-- transaction (the accidental nested SECURITY DEFINER case).
DO $$
DECLARE
  v_wrong_row_denied boolean := false;
BEGIN
  PERFORM set_config(
    'app.scope_change_transition',
    format(
      'send:%s:%s',
      'c9530000-0000-4000-8000-000000000017',
      pg_catalog.txid_current()
    ),
    true
  );
  BEGIN
    UPDATE public.scope_change_requests
    SET status = 'sent', sent_at = now()
    WHERE id = 'c9530000-0000-4000-8000-000000000016';
  EXCEPTION WHEN insufficient_privilege THEN
    v_wrong_row_denied := SQLERRM =
      'scope_change_request_transition_requires_row_scoped_authority';
  END;
  PERFORM set_config('app.scope_change_transition', '', true);
  ASSERT v_wrong_row_denied,
    'a transition token must authorize only its exact request row';
END;
$$;

-- service_role also uses RPCs: direct workflow insert/update/delete is not a
-- bypass. A temporary INSERT grant reaches the clean-draft trigger assertion.
GRANT INSERT ON TABLE public.scope_change_requests TO service_role;
SET LOCAL ROLE service_role;
SELECT pg_temp.assume_scope_actor('c9500000-0000-4000-8000-000000000001');
DO $$
DECLARE
  v_insert_denied boolean := false;
  v_update_denied boolean := false;
  v_delete_denied boolean := false;
BEGIN
  BEGIN
    INSERT INTO public.scope_change_requests (
      id, project_id, requested_by, title, description, status, applied_at
    ) VALUES (
      'c9530000-0000-4000-8000-000000000021',
      'c9520000-0000-4000-8000-000000000001',
      'c9500000-0000-4000-8000-000000000001',
      'Service fabricated apply', 'Must remain RPC-only.', 'approved', now()
    );
  EXCEPTION WHEN check_violation THEN
    v_insert_denied := SQLERRM =
      'scope_change_request_direct_inserts_must_be_clean_drafts';
  END;

  BEGIN
    UPDATE public.scope_change_requests
    SET status = 'sent', sent_at = now()
    WHERE id = 'c9530000-0000-4000-8000-000000000017';
  EXCEPTION WHEN insufficient_privilege THEN
    v_update_denied := true;
  END;

  BEGIN
    DELETE FROM public.scope_change_requests
    WHERE id = 'c9530000-0000-4000-8000-000000000017';
  EXCEPTION WHEN insufficient_privilege THEN
    v_delete_denied := true;
  END;

  ASSERT v_insert_denied, 'service direct inserts cannot fabricate lifecycle state';
  ASSERT v_update_denied, 'service direct UPDATE must use a checked RPC';
  ASSERT v_delete_denied, 'service direct DELETE must stay unavailable';
END;
$$;
RESET ROLE;
REVOKE INSERT ON TABLE public.scope_change_requests FROM service_role;

-- Active studio co-members retain the legitimate shared-workspace send/apply
-- flows. Both historical camelCase and canonical snake_case payloads apply in
-- one transaction, including room-name linkage for newly created FF&E.
SET LOCAL ROLE authenticated;
SELECT pg_temp.assume_scope_actor('c9500000-0000-4000-8000-000000000004');
DO $$
DECLARE
  v_double_apply_denied boolean := false;
  v_closed_apply_denied boolean := false;
  v_origin_forge_denied boolean := false;
  v_retry_receipt jsonb;
  v_original_sent_at timestamptz;
BEGIN
  BEGIN
    INSERT INTO public.scope_change_requests (
      id, project_id, requested_by, request_origin, title, description
    ) VALUES (
      'c9530000-0000-4000-8000-000000000027',
      'c9520000-0000-4000-8000-000000000001',
      'c9500000-0000-4000-8000-000000000004',
      'client_request',
      'Forged client origin', 'Only the checked client RPC may set this origin.'
    );
  EXCEPTION WHEN insufficient_privilege THEN
    v_origin_forge_denied := SQLERRM =
      'scope_change_request_direct_insert_origin_forbidden';
  END;
  ASSERT v_origin_forge_denied,
    'browser-composed studio drafts cannot forge client-request provenance';

  INSERT INTO public.scope_change_requests (
    id, project_id, requested_by, title, description
  ) VALUES (
    'c9530000-0000-4000-8000-000000000024',
    'c9520000-0000-4000-8000-000000000001',
    'c9500000-0000-4000-8000-000000000004',
    'Peer browser draft', 'Exact design-studio peers retain draft composition.'
  );
  ASSERT (
    SELECT status = 'draft'
       AND sent_at IS NULL
       AND request_origin = 'designer_amendment'
    FROM public.scope_change_requests
    WHERE id = 'c9530000-0000-4000-8000-000000000024'
  ), 'an exact active design-studio peer may compose a clean browser draft';

  PERFORM public.send_scope_change_request(
    'c9530000-0000-4000-8000-000000000010',
    'c9520000-0000-4000-8000-000000000001'
  );
  ASSERT (
    SELECT status = 'sent' AND sent_at IS NOT NULL
    FROM public.scope_change_requests
    WHERE id = 'c9530000-0000-4000-8000-000000000010'
  ), 'studio co-member must be able to send an authored draft';
  ASSERT current_setting('app.scope_change_transition', true) = '',
    'send authority token must be cleared after its exact update';

  BEGIN
    PERFORM public.apply_scope_change('c9530000-0000-4000-8000-000000000025');
  EXCEPTION WHEN check_violation THEN
    v_closed_apply_denied := SQLERRM = 'apply_scope_change: completed_project';
  END;
  ASSERT v_closed_apply_denied,
    'an approved request cannot mutate a completed or archived project';
  ASSERT (
    SELECT budget_cents = 0 AND design_fee_cents = 0
    FROM public.projects
    WHERE id = 'c9520000-0000-4000-8000-000000000002'
  ), 'closed-project apply rejection must leave its money unchanged';

  PERFORM public.accept_client_scope_change_request(
    'c9530000-0000-4000-8000-000000000001',
    'c9520000-0000-4000-8000-000000000001'
  );
  ASSERT (
    SELECT status = 'approved'
       AND approved_at IS NOT NULL
       AND approved_by = 'c9500000-0000-4000-8000-000000000004'
       AND approved_by_name = 'Scope Studio Peer'
    FROM public.scope_change_requests
    WHERE id = 'c9530000-0000-4000-8000-000000000001'
  ), 'an exact active design-studio peer must accept a client-origin request';

  PERFORM public.apply_scope_change('c9530000-0000-4000-8000-000000000001');
  SELECT sent_at INTO v_original_sent_at
  FROM public.scope_change_requests
  WHERE id = 'c9530000-0000-4000-8000-000000000001';
  ASSERT (
    SELECT status = 'approved' AND applied_at IS NOT NULL
    FROM public.scope_change_requests
    WHERE id = 'c9530000-0000-4000-8000-000000000001'
  ), 'accepted client-origin work must close through the atomic apply authority';

  -- A delayed transport retry after acceptance and fulfillment remains the
  -- original create receipt, rather than exposing the later workflow state.
  PERFORM pg_temp.assume_scope_actor('c9500000-0000-4000-8000-000000000002');
  v_retry_receipt := public.create_client_scope_change_request(
    'c9520000-0000-4000-8000-000000000001',
    'c9530000-0000-4000-8000-000000000001',
    'Add reading lights',
    'Please add one beside each chair.'
  );
  ASSERT v_retry_receipt = jsonb_build_object(
    'id', 'c9530000-0000-4000-8000-000000000001'::uuid,
    'project_id', 'c9520000-0000-4000-8000-000000000001'::uuid,
    'status', 'sent',
    'sent_at', v_original_sent_at
  ), format('late retry must return the original create receipt, got %s', v_retry_receipt);
  PERFORM pg_temp.assume_scope_actor('c9500000-0000-4000-8000-000000000004');

  PERFORM public.apply_scope_change('c9530000-0000-4000-8000-000000000014');
  ASSERT (
    SELECT applied_at IS NOT NULL
    FROM public.scope_change_requests
    WHERE id = 'c9530000-0000-4000-8000-000000000014'
  ), 'studio co-member must be able to atomically apply an approved request';
  ASSERT (
    SELECT budget_cents = 10500
       AND design_fee_cents = 1200
       AND target_end_date = DATE '2026-09-07'
    FROM public.projects
    WHERE id = 'c9520000-0000-4000-8000-000000000004'
  ), 'camelCase apply must update project totals/timeline once';
  ASSERT EXISTS (
    SELECT 1
    FROM public.project_rooms AS room
    JOIN public.project_ffe_items AS item
      ON item.project_room_id = room.id
    WHERE room.project_id = 'c9520000-0000-4000-8000-000000000004'
      AND room.name = 'Reading Nook'
      AND room.room_type = 'living'
      AND room.budget_cents = 800
      AND room.ffe_categories = ARRAY['lighting']::text[]
      AND item.name = 'Floor Lamp'
      AND item.ffe_category = 'lighting'
      AND item.item_type = 'allowance'
      AND item.quantity = 2
      AND item.unit_price_cents = 15000
      AND item.line_total_cents = 30000
  ), 'camelCase roomName item must link to its newly inserted room';

  BEGIN
    PERFORM public.apply_scope_change('c9530000-0000-4000-8000-000000000014');
  EXCEPTION WHEN OTHERS THEN
    v_double_apply_denied := SQLERRM LIKE 'Scope change % already applied at %';
  END;
  ASSERT v_double_apply_denied, 'a retry cannot materialize an applied request twice';
  ASSERT (
    SELECT budget_cents = 10500 AND design_fee_cents = 1200
    FROM public.projects
    WHERE id = 'c9520000-0000-4000-8000-000000000004'
  ), 'rejected double apply must not charge the project again';

  PERFORM public.apply_scope_change('c9530000-0000-4000-8000-000000000019');
  ASSERT (
    SELECT budget_cents = 20700
       AND design_fee_cents = 2300
       AND target_end_date = DATE '2026-10-14'
    FROM public.projects
    WHERE id = 'c9520000-0000-4000-8000-000000000005'
  ), 'canonical snake_case apply must retain project effects';
  ASSERT EXISTS (
    SELECT 1
    FROM public.project_rooms AS room
    JOIN public.project_ffe_items AS item
      ON item.project_room_id = room.id
    WHERE room.project_id = 'c9520000-0000-4000-8000-000000000005'
      AND room.name = 'Library'
      AND room.room_type = 'library'
      AND room.budget_cents = 1200
      AND room.ffe_categories = ARRAY['seating']::text[]
      AND room.notes = 'Quiet room'
      AND item.name = 'Reading Chair'
      AND item.ffe_category = 'seating'
      AND item.item_type = 'fixed'
      AND item.unit_price_cents = 25000
      AND item.line_total_cents = 25000
      AND item.vendor_name = 'Chair Co'
  ), 'canonical snake_case payload and room_name linkage must remain supported';
  ASSERT current_setting('app.scope_change_transition', true) = '',
    'apply authority token must be cleared after its exact update';
END;
$$;

RESET ROLE;
DO $$
BEGIN
  ASSERT (
    SELECT count(*) = 1
    FROM public.client_activity_log
    WHERE designer_client_id = 'c9510000-0000-4000-8000-000000000001'
      AND activity_type = 'scope_change_requested'
      AND metadata->>'change_id' = 'c9530000-0000-4000-8000-000000000001'
  ), 'immediate and post-fulfillment retries must leave one activity record';
END;
$$;

-- Origin is historical evidence, not a comparison to the project's current
-- client. A supported client reassignment must not turn the prior client's
-- request into a designer-authored authorization for the replacement client.
SET LOCAL ROLE authenticated;
SELECT pg_temp.assume_scope_actor('c9500000-0000-4000-8000-000000000002');
DO $$
BEGIN
  PERFORM public.create_client_scope_change_request(
    'c9520000-0000-4000-8000-000000000001',
    'c9530000-0000-4000-8000-000000000026',
    'Keep the reading lights',
    'This request must retain its client origin after reassignment.'
  );
END;
$$;

SELECT pg_temp.assume_scope_actor('c9500000-0000-4000-8000-000000000001');
SELECT public.set_document_client(
  'project',
  'c9520000-0000-4000-8000-000000000001',
  'c9500000-0000-4000-8000-000000000005'
);

SELECT pg_temp.assume_scope_actor('c9500000-0000-4000-8000-000000000005');
DO $$
DECLARE
  v_approve_denied boolean := false;
  v_decline_denied boolean := false;
  v_cancel_denied boolean := false;
BEGIN
  ASSERT (
    SELECT request_origin = 'client_request'
       AND requested_by = 'c9500000-0000-4000-8000-000000000002'
    FROM public.scope_change_requests
    WHERE id = 'c9530000-0000-4000-8000-000000000026'
  ), 'replacement client must read the immutable client-request origin';

  BEGIN
    PERFORM public.approve_scope_change_request(
      'c9530000-0000-4000-8000-000000000026',
      'c9520000-0000-4000-8000-000000000001',
      'Scope Replacement',
      NULL
    );
  EXCEPTION WHEN check_violation THEN
    v_approve_denied := true;
  END;
  ASSERT v_approve_denied,
    'replacement client cannot authorize a historical client-origin request';

  BEGIN
    PERFORM public.decline_scope_change_request(
      'c9530000-0000-4000-8000-000000000026',
      'c9520000-0000-4000-8000-000000000001',
      'A replacement client cannot resolve the prior client request.'
    );
  EXCEPTION WHEN check_violation THEN
    v_decline_denied := true;
  END;
  ASSERT v_decline_denied,
    'replacement client cannot decline a historical client-origin request';

  BEGIN
    PERFORM public.cancel_scope_change_request(
      'c9530000-0000-4000-8000-000000000026',
      'c9520000-0000-4000-8000-000000000001'
    );
  EXCEPTION WHEN insufficient_privilege THEN
    v_cancel_denied := true;
  END;
  ASSERT v_cancel_denied,
    'replacement client cannot cancel a request authored by the prior client';
END;
$$;

ROLLBACK;
