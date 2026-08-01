-- proposal-send authorization, exact-instance claim, ACL, and retry regression
-- (00388)
--
-- Run against the local Supabase database only:
--   psql 'postgresql://postgres:postgres@127.0.0.1:54322/postgres' \
--     -v ON_ERROR_STOP=1 \
--     -f supabase/tests/proposals/proposal_send_dispatch_guard_test.sql

BEGIN;

INSERT INTO auth.users (
  id, email, encrypted_password, email_confirmed_at, created_at, updated_at,
  instance_id, aud, role
)
VALUES
  ('c8000000-0000-4000-8000-000000000001', 'dispatch-owner@test.invalid', '', now(), now(), now(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('c8000000-0000-4000-8000-000000000002', 'dispatch-member@test.invalid', '', now(), now(), now(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('c8000000-0000-4000-8000-000000000003', 'dispatch-guest@test.invalid', '', now(), now(), now(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('c8000000-0000-4000-8000-000000000004', 'dispatch-foreign@test.invalid', '', now(), now(), now(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('c8000000-0000-4000-8000-000000000005', 'dispatch-client@test.invalid', '', now(), now(), now(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('c8000000-0000-4000-8000-000000000006', 'dispatch-suspended-member@test.invalid', '', now(), now(), now(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');

INSERT INTO public.profiles (id, email, full_name, created_at, updated_at)
VALUES
  ('c8000000-0000-4000-8000-000000000001', 'dispatch-owner@test.invalid', 'Dispatch Owner', now(), now()),
  ('c8000000-0000-4000-8000-000000000002', 'dispatch-member@test.invalid', 'Dispatch Member', now(), now()),
  ('c8000000-0000-4000-8000-000000000003', 'dispatch-guest@test.invalid', 'Dispatch Guest', now(), now()),
  ('c8000000-0000-4000-8000-000000000004', 'dispatch-foreign@test.invalid', 'Dispatch Foreign', now(), now()),
  ('c8000000-0000-4000-8000-000000000005', 'dispatch-client@test.invalid', 'Dispatch Client', now(), now()),
  ('c8000000-0000-4000-8000-000000000006', 'dispatch-suspended-member@test.invalid', 'Dispatch Suspended Member', now(), now())
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name;

INSERT INTO public.organizations (id, type, name, slug, status)
VALUES
  ('c8100000-0000-4000-8000-000000000001', 'design_studio', 'Dispatch Studio', 'dispatch-studio-test', 'active'),
  ('c8100000-0000-4000-8000-000000000002', 'contractor', 'Shared Contractor', 'dispatch-contractor-test', 'active'),
  ('c8100000-0000-4000-8000-000000000003', 'design_studio', 'Suspended Studio', 'dispatch-suspended-test', 'suspended');

INSERT INTO public.organization_members (
  id, user_id, organization_id, role, status, joined_at
)
VALUES
  ('c8200000-0000-4000-8000-000000000001', 'c8000000-0000-4000-8000-000000000001', 'c8100000-0000-4000-8000-000000000001', 'owner', 'active', now()),
  ('c8200000-0000-4000-8000-000000000002', 'c8000000-0000-4000-8000-000000000002', 'c8100000-0000-4000-8000-000000000001', 'member', 'active', now()),
  ('c8200000-0000-4000-8000-000000000003', 'c8000000-0000-4000-8000-000000000003', 'c8100000-0000-4000-8000-000000000001', 'guest', 'active', now()),
  ('c8200000-0000-4000-8000-000000000004', 'c8000000-0000-4000-8000-000000000001', 'c8100000-0000-4000-8000-000000000002', 'owner', 'active', now()),
  ('c8200000-0000-4000-8000-000000000005', 'c8000000-0000-4000-8000-000000000004', 'c8100000-0000-4000-8000-000000000002', 'member', 'active', now()),
  ('c8200000-0000-4000-8000-000000000006', 'c8000000-0000-4000-8000-000000000001', 'c8100000-0000-4000-8000-000000000003', 'owner', 'active', now()),
  ('c8200000-0000-4000-8000-000000000007', 'c8000000-0000-4000-8000-000000000006', 'c8100000-0000-4000-8000-000000000003', 'member', 'active', now());

INSERT INTO public.proposals (
  id, designer_id, client_id, title, status, sent_at, updated_at
)
VALUES
  ('c8300000-0000-4000-8000-000000000001', 'c8000000-0000-4000-8000-000000000001', 'c8000000-0000-4000-8000-000000000005', 'Exact sent instance', 'sent', '2026-07-31T12:00:00Z', '2026-07-31T12:00:00Z'),
  ('c8300000-0000-4000-8000-000000000002', 'c8000000-0000-4000-8000-000000000001', 'c8000000-0000-4000-8000-000000000005', 'Failed retry', 'sent', '2026-07-31T12:01:00Z', '2026-07-31T12:01:00Z'),
  ('c8300000-0000-4000-8000-000000000003', 'c8000000-0000-4000-8000-000000000001', 'c8000000-0000-4000-8000-000000000005', 'Stale lease', 'sent', '2026-07-31T12:02:00Z', '2026-07-31T12:02:00Z'),
  ('c8300000-0000-4000-8000-000000000004', 'c8000000-0000-4000-8000-000000000001', 'c8000000-0000-4000-8000-000000000005', 'Draft', 'draft', NULL, '2026-07-31T12:03:00Z'),
  ('c8300000-0000-4000-8000-000000000005', 'c8000000-0000-4000-8000-000000000001', 'c8000000-0000-4000-8000-000000000005', 'Accepted', 'accepted', '2026-07-31T12:04:00Z', '2026-07-31T12:04:00Z'),
  ('c8300000-0000-4000-8000-000000000006', 'c8000000-0000-4000-8000-000000000001', 'c8000000-0000-4000-8000-000000000005', 'Edited after send', 'sent', '2026-07-31T12:05:00Z', '2026-07-31T12:06:00Z');

CREATE OR REPLACE FUNCTION pg_temp.assume_authenticated(p_user_id uuid)
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

CREATE OR REPLACE FUNCTION pg_temp.expect_claim_state_rejection(
  p_proposal_id uuid,
  p_sent_at timestamptz
)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_rejected boolean := false;
BEGIN
  BEGIN
    PERFORM public.claim_proposal_send_dispatch(p_proposal_id, p_sent_at);
  EXCEPTION WHEN check_violation THEN
    v_rejected := true;
  END;
  ASSERT v_rejected,
    format('claim should reject proposal %s at sent_at %s', p_proposal_id, p_sent_at);
END;
$$;

-- Object ACL and RLS posture: the ledger is service-only and has no policy
-- path for a user JWT. The caller-facing authorization predicate is the only
-- new authenticated RPC.
DO $$
BEGIN
  ASSERT (
    SELECT relrowsecurity
    FROM pg_class
    WHERE oid = 'public.proposal_send_dispatches'::regclass
  ), 'proposal_send_dispatches must have RLS enabled';
  ASSERT NOT has_table_privilege(
    'authenticated', 'public.proposal_send_dispatches', 'SELECT'
  ), 'authenticated must not read the dispatch ledger';
  ASSERT NOT has_table_privilege(
    'anon', 'public.proposal_send_dispatches', 'SELECT'
  ), 'anon must not read the dispatch ledger';
  ASSERT has_table_privilege(
    'service_role', 'public.proposal_send_dispatches', 'SELECT'
  ) AND has_table_privilege(
    'service_role', 'public.proposal_send_dispatches', 'INSERT'
  ) AND has_table_privilege(
    'service_role', 'public.proposal_send_dispatches', 'UPDATE'
  ) AND has_table_privilege(
    'service_role', 'public.proposal_send_dispatches', 'DELETE'
  ), 'service_role needs explicit dispatch-ledger privileges';
  ASSERT has_function_privilege(
    'authenticated', 'public.can_dispatch_proposal_send(uuid)', 'EXECUTE'
  ), 'authenticated needs the caller authorization predicate';
  ASSERT NOT has_function_privilege(
    'anon', 'public.can_dispatch_proposal_send(uuid)', 'EXECUTE'
  ), 'anon must not execute the caller authorization predicate';
  ASSERT NOT has_function_privilege(
    'authenticated',
    'public.claim_proposal_send_dispatch(uuid,timestamptz,integer)',
    'EXECUTE'
  ), 'authenticated must not mint dispatch claims';
  ASSERT has_function_privilege(
    'service_role',
    'public.claim_proposal_send_dispatch(uuid,timestamptz,integer)',
    'EXECUTE'
  ), 'service_role needs explicit claim execute';
END;
$$;

SET LOCAL ROLE authenticated;

SELECT pg_temp.assume_authenticated('c8000000-0000-4000-8000-000000000001');
DO $$
BEGIN
  ASSERT public.can_dispatch_proposal_send(
    'c8000000-0000-4000-8000-000000000001'
  ), 'exact owner must be authorized';
END;
$$;

SELECT pg_temp.assume_authenticated('c8000000-0000-4000-8000-000000000002');
DO $$
BEGIN
  ASSERT public.can_dispatch_proposal_send(
    'c8000000-0000-4000-8000-000000000001'
  ), 'active non-guest design-studio member must be authorized';
END;
$$;

SELECT pg_temp.assume_authenticated('c8000000-0000-4000-8000-000000000003');
DO $$
BEGIN
  ASSERT NOT public.can_dispatch_proposal_send(
    'c8000000-0000-4000-8000-000000000001'
  ), 'guest studio member must not be authorized';
END;
$$;

SELECT pg_temp.assume_authenticated('c8000000-0000-4000-8000-000000000004');
DO $$
BEGIN
  ASSERT NOT public.can_dispatch_proposal_send(
    'c8000000-0000-4000-8000-000000000001'
  ), 'a shared non-studio organization must not confer proposal send authority';
END;
$$;

SELECT pg_temp.assume_authenticated('c8000000-0000-4000-8000-000000000005');
DO $$
BEGIN
  ASSERT NOT public.can_dispatch_proposal_send(
    'c8000000-0000-4000-8000-000000000001'
  ), 'proposal client must not be authorized';
END;
$$;

SELECT pg_temp.assume_authenticated('c8000000-0000-4000-8000-000000000006');
DO $$
BEGIN
  ASSERT NOT public.can_dispatch_proposal_send(
    'c8000000-0000-4000-8000-000000000001'
  ), 'membership in a suspended studio must not confer authority';
END;
$$;

-- Even an owner cannot bypass the edge boundary and invoke service-only claims.
SELECT pg_temp.assume_authenticated('c8000000-0000-4000-8000-000000000001');
DO $$
DECLARE
  v_denied boolean := false;
BEGIN
  BEGIN
    PERFORM public.claim_proposal_send_dispatch(
      'c8300000-0000-4000-8000-000000000001',
      '2026-07-31T12:00:00Z'
    );
  EXCEPTION WHEN insufficient_privilege THEN
    v_denied := true;
  END;
  ASSERT v_denied, 'authenticated owner must not execute the service-only claim RPC';
END;
$$;

RESET ROLE;
SELECT set_config(
  'request.jwt.claims',
  '{"role":"service_role"}',
  true
);
SET LOCAL ROLE service_role;

-- One exact sent instance gets one durable claim, notification id, and provider
-- completion. A concurrent duplicate is in-flight; a delivered duplicate is
-- permanently deduped.
DO $$
DECLARE
  v_first jsonb;
  v_in_flight jsonb;
  v_delivered jsonb;
BEGIN
  v_first := public.claim_proposal_send_dispatch(
    'c8300000-0000-4000-8000-000000000001',
    '2026-07-31T12:00:00Z'
  );
  ASSERT (v_first->>'claimed')::boolean, 'first invocation must acquire claim';
  ASSERT (v_first->>'attempt_count')::integer = 1,
    'first invocation must be attempt one';

  v_in_flight := public.claim_proposal_send_dispatch(
    'c8300000-0000-4000-8000-000000000001',
    '2026-07-31T12:00:00Z'
  );
  ASSERT NOT (v_in_flight->>'claimed')::boolean,
    'concurrent duplicate must not acquire claim';
  ASSERT (v_in_flight->>'in_flight')::boolean,
    'concurrent duplicate must report in-flight';
  ASSERT v_in_flight->>'notification_log_id' = v_first->>'notification_log_id',
    'notification id must remain stable while in flight';

  PERFORM public.complete_proposal_send_dispatch(
    'c8300000-0000-4000-8000-000000000001',
    '2026-07-31T12:00:00Z',
    (v_first->>'claim_token')::uuid,
    true,
    'provider-1'
  );

  v_delivered := public.claim_proposal_send_dispatch(
    'c8300000-0000-4000-8000-000000000001',
    '2026-07-31T12:00:00Z'
  );
  ASSERT NOT (v_delivered->>'claimed')::boolean,
    'delivered duplicate must not reacquire claim';
  ASSERT (v_delivered->>'duplicate')::boolean,
    'delivered duplicate must be identified';
  ASSERT NOT (v_delivered->>'in_flight')::boolean,
    'delivered duplicate is not in flight';
  ASSERT v_delivered->>'notification_log_id' = v_first->>'notification_log_id',
    'notification id must remain stable after delivery';
END;
$$;

-- A known pre-provider failure releases immediately. The next attempt gets a
-- new token but the same stable notification id.
DO $$
DECLARE
  v_first jsonb;
  v_retry jsonb;
BEGIN
  v_first := public.claim_proposal_send_dispatch(
    'c8300000-0000-4000-8000-000000000002',
    '2026-07-31T12:01:00Z'
  );
  PERFORM public.complete_proposal_send_dispatch(
    'c8300000-0000-4000-8000-000000000002',
    '2026-07-31T12:01:00Z',
    (v_first->>'claim_token')::uuid,
    false,
    NULL,
    'studio identity unavailable'
  );

  v_retry := public.claim_proposal_send_dispatch(
    'c8300000-0000-4000-8000-000000000002',
    '2026-07-31T12:01:00Z'
  );
  ASSERT (v_retry->>'claimed')::boolean,
    'failed dispatch must be immediately retryable';
  ASSERT (v_retry->>'attempt_count')::integer = 2,
    'retry must increment attempt count';
  ASSERT v_retry->>'claim_token' <> v_first->>'claim_token',
    'retry must receive a fresh lease token';
  ASSERT v_retry->>'notification_log_id' = v_first->>'notification_log_id',
    'retry must retain the stable notification id';
END;
$$;

-- An abandoned claim cannot block forever: only a genuinely stale lease can
-- be taken over, with a fresh token and incremented attempt count.
DO $$
DECLARE
  v_first jsonb;
  v_retry jsonb;
BEGIN
  v_first := public.claim_proposal_send_dispatch(
    'c8300000-0000-4000-8000-000000000003',
    '2026-07-31T12:02:00Z'
  );
  UPDATE public.proposal_send_dispatches
  SET claimed_at = now() - interval '10 minutes'
  WHERE proposal_id = 'c8300000-0000-4000-8000-000000000003'
    AND sent_at = '2026-07-31T12:02:00Z';

  v_retry := public.claim_proposal_send_dispatch(
    'c8300000-0000-4000-8000-000000000003',
    '2026-07-31T12:02:00Z',
    300
  );
  ASSERT (v_retry->>'claimed')::boolean,
    'stale lease must be recoverable';
  ASSERT (v_retry->>'attempt_count')::integer = 2,
    'stale-lease takeover must increment attempt count';
  ASSERT v_retry->>'claim_token' <> v_first->>'claim_token',
    'stale-lease takeover must mint a fresh token';
END;
$$;

-- State and timestamp are authoritative inside the service-only claim RPC.
SELECT pg_temp.expect_claim_state_rejection(
  'c8300000-0000-4000-8000-000000000004',
  '2026-07-31T12:03:00Z'
);
SELECT pg_temp.expect_claim_state_rejection(
  'c8300000-0000-4000-8000-000000000005',
  '2026-07-31T12:04:00Z'
);
SELECT pg_temp.expect_claim_state_rejection(
  'c8300000-0000-4000-8000-000000000001',
  '2026-07-31T11:59:00Z'
);
SELECT pg_temp.expect_claim_state_rejection(
  'c8300000-0000-4000-8000-000000000006',
  '2026-07-31T12:05:00Z'
);

ROLLBACK;

SELECT 'proposal_send_dispatch_guard_test: all assertions passed' AS result;
