-- Immutable proposal-send outbox regression (00388).
-- Run only against local Supabase after 00387–00391.

BEGIN;

CREATE TEMP TABLE reviewed_send_snapshot (
  proposal_updated_at timestamptz,
  proposal_total_amount integer,
  schedule_fingerprint text
) ON COMMIT DROP;

CREATE TEMP TABLE committed_send (
  proposal_id uuid,
  sent_at timestamptz,
  dispatch_id uuid
) ON COMMIT DROP;

CREATE TEMP TABLE whitespace_cc_send (
  proposal_id uuid,
  sent_at timestamptz,
  dispatch_id uuid
) ON COMMIT DROP;

GRANT SELECT, INSERT ON reviewed_send_snapshot, committed_send,
  whitespace_cc_send
  TO authenticated, service_role;

INSERT INTO auth.users (
  id, email, encrypted_password, email_confirmed_at, created_at, updated_at,
  instance_id, aud, role
)
VALUES
  ('c8000000-0000-4000-8000-000000000001', 'dispatch-owner@test.invalid', '', now(), now(), now(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('c8000000-0000-4000-8000-000000000002', 'dispatch-client@test.invalid', '', now(), now(), now(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('c8000000-0000-4000-8000-000000000003', 'dispatch-member@test.invalid', '', now(), now(), now(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('c8000000-0000-4000-8000-000000000004', 'dispatch-foreign@test.invalid', '', now(), now(), now(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');

INSERT INTO public.profiles (
  id, email, full_name, business_name, is_designer, created_at, updated_at
)
VALUES
  ('c8000000-0000-4000-8000-000000000001', 'dispatch-owner@test.invalid', 'Original Designer', 'Original Studio', true, now(), now()),
  ('c8000000-0000-4000-8000-000000000002', 'dispatch-client@test.invalid', 'Original Client', NULL, false, now(), now()),
  ('c8000000-0000-4000-8000-000000000003', 'dispatch-member@test.invalid', 'Studio Member', NULL, true, now(), now()),
  ('c8000000-0000-4000-8000-000000000004', 'dispatch-foreign@test.invalid', 'Foreign Designer', NULL, true, now(), now())
ON CONFLICT (id) DO UPDATE SET
  email = EXCLUDED.email,
  full_name = EXCLUDED.full_name,
  business_name = EXCLUDED.business_name,
  is_designer = EXCLUDED.is_designer;

INSERT INTO public.organizations (id, type, name, slug, status)
VALUES
  ('c8100000-0000-4000-8000-000000000001', 'design_studio', 'Original Studio', 'dispatch-studio-test', 'active'),
  ('c8100000-0000-4000-8000-000000000002', 'contractor', 'Shared Contractor', 'dispatch-contractor-test', 'active');

INSERT INTO public.organization_members (
  id, user_id, organization_id, role, status, joined_at
)
VALUES
  ('c8200000-0000-4000-8000-000000000001', 'c8000000-0000-4000-8000-000000000001', 'c8100000-0000-4000-8000-000000000001', 'owner', 'active', now()),
  ('c8200000-0000-4000-8000-000000000002', 'c8000000-0000-4000-8000-000000000003', 'c8100000-0000-4000-8000-000000000001', 'member', 'active', now()),
  ('c8200000-0000-4000-8000-000000000003', 'c8000000-0000-4000-8000-000000000001', 'c8100000-0000-4000-8000-000000000002', 'owner', 'active', now()),
  ('c8200000-0000-4000-8000-000000000004', 'c8000000-0000-4000-8000-000000000004', 'c8100000-0000-4000-8000-000000000002', 'member', 'active', now());

INSERT INTO public.designer_clients (
  id, designer_id, client_id, status, source, created_at, updated_at
)
VALUES (
  'c8250000-0000-4000-8000-000000000001',
  'c8000000-0000-4000-8000-000000000001',
  'c8000000-0000-4000-8000-000000000002',
  'active',
  'direct',
  now(),
  now()
);

INSERT INTO public.proposals (
  id, designer_id, client_id, designer_client_id, title, total_amount,
  status, sent_at, updated_at
)
VALUES
  (
    'c8300000-0000-4000-8000-000000000001',
    'c8000000-0000-4000-8000-000000000001',
    'c8000000-0000-4000-8000-000000000002',
    'c8250000-0000-4000-8000-000000000001',
    'Immutable Walker Residence',
    1320000,
    'draft',
    NULL,
    '2026-07-31T12:00:00Z'
  ),
  (
    'c8300000-0000-4000-8000-000000000002',
    'c8000000-0000-4000-8000-000000000001',
    'c8000000-0000-4000-8000-000000000002',
    'c8250000-0000-4000-8000-000000000001',
    'Whitespace CC Residence',
    10000,
    'draft',
    NULL,
    '2026-07-31T12:00:00Z'
  );

INSERT INTO public.proposal_payment_milestones (
  id, proposal_id, label, percentage, amount_cents, sort_order
)
VALUES
  (
    'c8350000-0000-4000-8000-000000000001',
    'c8300000-0000-4000-8000-000000000001',
    'Project deposit',
    100,
    1320000,
    0
  ),
  (
    'c8350000-0000-4000-8000-000000000002',
    'c8300000-0000-4000-8000-000000000002',
    'Project deposit',
    100,
    10000,
    0
  );

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
GRANT EXECUTE ON FUNCTION pg_temp.assume_authenticated(uuid) TO PUBLIC;

-- Test-only inspectors keep assertions honest after the production ledger's
-- direct SELECT privilege is revoked from every API role.
CREATE OR REPLACE FUNCTION pg_temp.dispatch_count(p_proposal_id uuid)
RETURNS bigint
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT count(*)
  FROM public.proposal_send_dispatches AS dispatch
  WHERE dispatch.proposal_id = p_proposal_id
$$;

CREATE OR REPLACE FUNCTION pg_temp.inspect_dispatch(p_dispatch_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT jsonb_build_object(
    'cc_email', dispatch.cc_email,
    'state', dispatch.state,
    'claim_token', dispatch.claim_token,
    'claimed_from_state', dispatch.claimed_from_state,
    'email_log_status', log.status
  )
  FROM public.proposal_send_dispatches AS dispatch
  LEFT JOIN public.notification_log AS log ON log.id = dispatch.email_log_id
  WHERE dispatch.id = p_dispatch_id
$$;

GRANT EXECUTE ON FUNCTION pg_temp.dispatch_count(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION pg_temp.inspect_dispatch(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION pg_temp.inspect_dispatch(uuid) TO service_role;

-- Object posture: API roles never read/write the ledger or invoke its service
-- functions; authenticated callers receive only the public send + narrow
-- active-design-studio authorization predicate.
DO $$
BEGIN
  ASSERT EXISTS (
    SELECT 1
    FROM pg_enum AS enum_value
    JOIN pg_type AS enum_type ON enum_type.oid = enum_value.enumtypid
    JOIN pg_namespace AS enum_schema ON enum_schema.oid = enum_type.typnamespace
    WHERE enum_schema.nspname = 'public'
      AND enum_type.typname = 'notification_status'
      AND enum_value.enumlabel = 'unconfirmed'
  ), '00391 must commit unconfirmed before dispatch reconciliation executes';
  ASSERT (
    SELECT relrowsecurity
    FROM pg_class
    WHERE oid = 'public.proposal_send_dispatches'::regclass
  ), 'proposal_send_dispatches must have RLS enabled';
  ASSERT NOT has_table_privilege(
    'authenticated', 'public.proposal_send_dispatches', 'SELECT'
  ), 'authenticated must not read the immutable outbox';
  ASSERT NOT has_table_privilege(
    'service_role', 'public.proposal_send_dispatches', 'SELECT'
  ), 'service_role must use guarded RPCs rather than direct table access';
  ASSERT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.proposals'::regclass
      AND conname = 'proposals_send_dispatch_exact_fk'
      AND contype = 'f'
      AND condeferrable
  ), 'proposal link must have an exact-row composite foreign key';
  ASSERT NOT has_function_privilege(
    'authenticated',
    'public._commit_proposal_send(uuid,timestamptz,integer,text,text,text,timestamptz)',
    'EXECUTE'
  ), 'the canonical transition helper must be private';
  ASSERT has_function_privilege(
    'authenticated',
    'public.send_proposal(uuid,timestamptz,integer,text,text,text,timestamptz)',
    'EXECUTE'
  ), 'authenticated needs the wrapped send boundary';
  ASSERT NOT has_function_privilege(
    'authenticated',
    'public.claim_proposal_send_dispatch(uuid,uuid,timestamptz,integer)',
    'EXECUTE'
  ), 'authenticated must not claim provider work';
  ASSERT has_function_privilege(
    'service_role',
    'public.claim_proposal_send_dispatch(uuid,uuid,timestamptz,integer)',
    'EXECUTE'
  ), 'service role needs exact-instance claim RPC';
  ASSERT has_function_privilege(
    'authenticated',
    'public.get_proposal_send_dispatch_status(uuid,uuid,timestamptz)',
    'EXECUTE'
  ), 'authenticated needs the narrow exact-tuple status RPC';
  ASSERT NOT has_function_privilege(
    'anon',
    'public.get_proposal_send_dispatch_status(uuid,uuid,timestamptz)',
    'EXECUTE'
  ), 'anon must not poll proposal delivery status';
  ASSERT NOT has_function_privilege(
    'service_role',
    'public.get_proposal_send_dispatch_status(uuid,uuid,timestamptz)',
    'EXECUTE'
  ), 'service role must not receive the authenticated status surface';
  ASSERT NOT has_function_privilege(
    'authenticated',
    'public._sync_proposal_send_email_log(uuid)',
    'EXECUTE'
  ), 'authenticated must not invoke the private log reconciler';
END;
$$;

SET LOCAL ROLE authenticated;
SELECT pg_temp.assume_authenticated('c8000000-0000-4000-8000-000000000001');

INSERT INTO reviewed_send_snapshot
SELECT *
FROM public.get_proposal_send_snapshot(
  'c8300000-0000-4000-8000-000000000001'
);

-- CC is normalized and rejected before the private lifecycle transition. Both
-- invalid attempts must leave the reviewed draft and outbox completely intact.
DO $$
DECLARE
  v_rejected boolean;
BEGIN
  v_rejected := false;
  BEGIN
    PERFORM public.send_proposal(
      'c8300000-0000-4000-8000-000000000001',
      (SELECT proposal_updated_at FROM reviewed_send_snapshot),
      (SELECT proposal_total_amount FROM reviewed_send_snapshot),
      (SELECT schedule_fingerprint FROM reviewed_send_snapshot),
      'Original personal note',
      'not-an-email',
      '2026-08-31T00:00:00Z'
    );
  EXCEPTION WHEN check_violation THEN
    v_rejected := true;
  END;
  ASSERT v_rejected, 'malformed proposal CC must fail closed';
  ASSERT (
    SELECT status = 'draft' AND proposal_send_dispatch_id IS NULL
    FROM public.proposals
    WHERE id = 'c8300000-0000-4000-8000-000000000001'
  ), 'malformed CC must not commit the business send';
  ASSERT pg_temp.dispatch_count(
           'c8300000-0000-4000-8000-000000000001'
         ) = 0,
    'malformed CC must not create dispatch work';

  v_rejected := false;
  BEGIN
    PERFORM public.send_proposal(
      'c8300000-0000-4000-8000-000000000001',
      (SELECT proposal_updated_at FROM reviewed_send_snapshot),
      (SELECT proposal_total_amount FROM reviewed_send_snapshot),
      (SELECT schedule_fingerprint FROM reviewed_send_snapshot),
      'Original personal note',
      repeat('a', 245) || '@example.com',
      '2026-08-31T00:00:00Z'
    );
  EXCEPTION WHEN check_violation THEN
    v_rejected := true;
  END;
  ASSERT v_rejected, 'overlong proposal CC must fail closed';
  ASSERT (
    SELECT status = 'draft' AND proposal_send_dispatch_id IS NULL
    FROM public.proposals
    WHERE id = 'c8300000-0000-4000-8000-000000000001'
  ), 'overlong CC must not commit the business send';
  ASSERT pg_temp.dispatch_count(
           'c8300000-0000-4000-8000-000000000001'
         ) = 0,
    'overlong CC must not create dispatch work';
END;
$$;

INSERT INTO committed_send
SELECT sent.id, sent.sent_at, sent.proposal_send_dispatch_id
FROM public.send_proposal(
  'c8300000-0000-4000-8000-000000000001',
  (SELECT proposal_updated_at FROM reviewed_send_snapshot),
  (SELECT proposal_total_amount FROM reviewed_send_snapshot),
  (SELECT schedule_fingerprint FROM reviewed_send_snapshot),
  'Original personal note',
  '  finance@example.com  ',
  '2026-08-31T00:00:00Z'
) AS sent;

-- Whitespace-only optional CC canonicalizes to NULL in both the proposal and
-- immutable outbox snapshot.
DO $$
DECLARE
  v_snapshot record;
  v_sent public.proposals%ROWTYPE;
BEGIN
  SELECT * INTO v_snapshot
  FROM public.get_proposal_send_snapshot(
    'c8300000-0000-4000-8000-000000000002'
  );
  SELECT sent.* INTO v_sent
  FROM public.send_proposal(
    'c8300000-0000-4000-8000-000000000002',
    v_snapshot.proposal_updated_at,
    v_snapshot.proposal_total_amount,
    v_snapshot.schedule_fingerprint,
    NULL,
    '   ',
    NULL
  ) AS sent;
  INSERT INTO whitespace_cc_send
  VALUES (v_sent.id, v_sent.sent_at, v_sent.proposal_send_dispatch_id);

  ASSERT v_sent.cc_email IS NULL,
    'whitespace-only CC must normalize to NULL on proposal';
  ASSERT pg_temp.inspect_dispatch(
           v_sent.proposal_send_dispatch_id
         )->>'cc_email' IS NULL,
    'whitespace-only CC must normalize to NULL in outbox';
END;
$$;

-- No direct proposal write may replace or clear the linked nonce, even when RLS
-- otherwise permits the owner to edit the proposal.
DO $$
DECLARE
  v_rejected boolean := false;
BEGIN
  BEGIN
    UPDATE public.proposals
    SET proposal_send_dispatch_id = gen_random_uuid()
    WHERE id = 'c8300000-0000-4000-8000-000000000001';
  EXCEPTION WHEN check_violation THEN
    v_rejected := true;
  END;
  ASSERT v_rejected, 'proposal outbox link must be immutable at table boundary';
END;
$$;

-- Narrow authorization stays active-design-studio only.
DO $$
DECLARE
  v_status jsonb;
BEGIN
  ASSERT public.can_dispatch_proposal_send(
    'c8000000-0000-4000-8000-000000000001'
  ), 'owner must be authorized';
  v_status := public.get_proposal_send_dispatch_status(
    'c8300000-0000-4000-8000-000000000001',
    (SELECT dispatch_id FROM committed_send),
    (SELECT sent_at FROM committed_send)
  );
  ASSERT v_status->>'delivery_state' = 'pending',
    'owner must read the exact dispatch status';
  ASSERT (
    SELECT array_agg(key ORDER BY key)
    FROM jsonb_object_keys(v_status) AS status_keys(key)
  ) = ARRAY[
    'attempt_count', 'delivery_state', 'last_error', 'retry_exhausted',
    'retryable'
  ], 'status RPC must expose exactly five delivery fields';
END;
$$;

SELECT pg_temp.assume_authenticated('c8000000-0000-4000-8000-000000000003');
DO $$
DECLARE
  v_status jsonb;
BEGIN
  ASSERT public.can_dispatch_proposal_send(
    'c8000000-0000-4000-8000-000000000001'
  ), 'active design-studio co-member must be authorized';
  v_status := public.get_proposal_send_dispatch_status(
    'c8300000-0000-4000-8000-000000000001',
    (SELECT dispatch_id FROM committed_send),
    (SELECT sent_at FROM committed_send)
  );
  ASSERT v_status->>'delivery_state' = 'pending',
    'active design-studio peer must read exact dispatch status';
END;
$$;

SELECT pg_temp.assume_authenticated('c8000000-0000-4000-8000-000000000004');
DO $$
DECLARE
  v_rejected boolean := false;
BEGIN
  ASSERT NOT public.can_dispatch_proposal_send(
    'c8000000-0000-4000-8000-000000000001'
  ), 'shared contractor membership must not confer dispatch authority';
  BEGIN
    PERFORM public.get_proposal_send_dispatch_status(
      'c8300000-0000-4000-8000-000000000001',
      (SELECT dispatch_id FROM committed_send),
      (SELECT sent_at FROM committed_send)
    );
  EXCEPTION WHEN insufficient_privilege THEN
    v_rejected := true;
  END;
  ASSERT v_rejected,
    'foreign shared-contractor member must not read status';
END;
$$;

SELECT pg_temp.assume_authenticated('c8000000-0000-4000-8000-000000000002');
DO $$
DECLARE
  v_rejected boolean := false;
BEGIN
  BEGIN
    PERFORM public.get_proposal_send_dispatch_status(
      'c8300000-0000-4000-8000-000000000001',
      (SELECT dispatch_id FROM committed_send),
      (SELECT sent_at FROM committed_send)
    );
  EXCEPTION WHEN insufficient_privilege THEN
    v_rejected := true;
  END;
  ASSERT v_rejected, 'proposal client must not read designer delivery status';
END;
$$;

SELECT pg_temp.assume_authenticated('c8000000-0000-4000-8000-000000000001');
DO $$
DECLARE
  v_rejected boolean := false;
BEGIN
  BEGIN
    PERFORM public.get_proposal_send_dispatch_status(
      'c8300000-0000-4000-8000-000000000001',
      (SELECT dispatch_id FROM committed_send),
      (SELECT sent_at FROM committed_send) - interval '1 microsecond'
    );
  EXCEPTION WHEN insufficient_privilege THEN
    v_rejected := true;
  END;
  ASSERT v_rejected, 'status nonce/timestamp mismatch must fail closed';
END;
$$;

RESET ROLE;

-- The wrapped send created and linked exactly one nonce in the same transaction,
-- with every mutable render input captured before the edge function exists.
DO $$
DECLARE
  v_dispatch public.proposal_send_dispatches%ROWTYPE;
BEGIN
  ASSERT (SELECT count(*) FROM committed_send) = 1,
    'send_proposal must return exactly one row';
  ASSERT (SELECT dispatch_id IS NOT NULL FROM committed_send),
    'send_proposal must return a nonce';
  ASSERT (
    SELECT count(*) = 1
    FROM public.proposal_send_dispatches
    WHERE proposal_id = 'c8300000-0000-4000-8000-000000000001'
  ), 'send_proposal must create exactly one outbox row';

  SELECT * INTO v_dispatch
  FROM public.proposal_send_dispatches
  WHERE id = (SELECT dispatch_id FROM committed_send);

  ASSERT v_dispatch.sent_at = (SELECT sent_at FROM committed_send),
    'outbox timestamp and returned proposal timestamp must match';
  ASSERT v_dispatch.recipient_email = 'dispatch-client@test.invalid',
    'recipient email must be captured at business send';
  ASSERT v_dispatch.recipient_name = 'Original Client',
    'recipient name must be captured at business send';
  ASSERT v_dispatch.designer_name = 'Original Designer',
    'designer prose identity must be captured at business send';
  ASSERT v_dispatch.sender_name = 'Original Studio',
    'studio sender identity must be captured at business send';
  ASSERT v_dispatch.studio_name = 'Original Studio',
    'co-brand identity must be captured at business send';
  ASSERT v_dispatch.proposal_title = 'Immutable Walker Residence'
    AND v_dispatch.personal_message = 'Original personal note',
    'proposal content must be captured at business send';
  ASSERT v_dispatch.cc_email = 'finance@example.com',
    'outbox CC must store the trimmed canonical address';
  ASSERT (
    SELECT cc_email = 'finance@example.com'
    FROM public.proposals
    WHERE id = v_dispatch.proposal_id
  ), 'proposal CC must store the same trimmed canonical address';
END;
$$;

UPDATE public.profiles
SET email = CASE id
      WHEN 'c8000000-0000-4000-8000-000000000002'::uuid
        THEN 'changed-client@test.invalid'
      ELSE email
    END,
    full_name = 'Changed after send',
    business_name = CASE
      WHEN id = 'c8000000-0000-4000-8000-000000000001'::uuid
        THEN 'Changed Studio'
      ELSE business_name
    END
WHERE id IN (
  'c8000000-0000-4000-8000-000000000001',
  'c8000000-0000-4000-8000-000000000002'
);
UPDATE public.organizations
SET name = 'Changed Organization', logo_url = 'https://changed.invalid/logo.png'
WHERE id = 'c8100000-0000-4000-8000-000000000001';
DO $$
DECLARE
  v_rejected boolean := false;
BEGIN
  BEGIN
    UPDATE public.proposals
    SET title = 'Changed proposal title'
    WHERE id = 'c8300000-0000-4000-8000-000000000001';
  EXCEPTION WHEN check_violation THEN
    v_rejected := true;
  END;
  ASSERT v_rejected,
    'issued proposal title must remain immutable after send';
END;
$$;

DO $$
DECLARE
  v_dispatch public.proposal_send_dispatches%ROWTYPE;
BEGIN
  SELECT * INTO v_dispatch
  FROM public.proposal_send_dispatches
  WHERE id = (SELECT dispatch_id FROM committed_send);
  ASSERT v_dispatch.recipient_email = 'dispatch-client@test.invalid'
    AND v_dispatch.recipient_name = 'Original Client'
    AND v_dispatch.designer_name = 'Original Designer'
    AND v_dispatch.sender_name = 'Original Studio'
    AND v_dispatch.studio_name = 'Original Studio'
    AND v_dispatch.proposal_title = 'Immutable Walker Residence',
    'profile/studio edits and a rejected proposal edit must not mutate the render snapshot';
END;
$$;

SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);
SET LOCAL ROLE service_role;

-- Exact tuple read/claim never creates a row for stale or mismatched input.
DO $$
DECLARE
  v_rejected boolean := false;
BEGIN
  BEGIN
    PERFORM public.read_proposal_send_dispatch(
      (SELECT dispatch_id FROM committed_send),
      'c8300000-0000-4000-8000-000000000001',
      (SELECT sent_at FROM committed_send) - interval '1 microsecond'
    );
  EXCEPTION WHEN check_violation THEN
    v_rejected := true;
  END;
  ASSERT v_rejected, 'nonce/timestamp mismatch must fail closed';
END;
$$;

DO $$
DECLARE
  v_claim jsonb;
  v_duplicate jsonb;
  v_request jsonb;
  v_dispatch_id uuid := (SELECT dispatch_id FROM committed_send);
  v_sent_at timestamptz := (SELECT sent_at FROM committed_send);
BEGIN
  v_claim := public.claim_proposal_send_dispatch(
    v_dispatch_id,
    'c8300000-0000-4000-8000-000000000001',
    v_sent_at,
    30
  );
  ASSERT (v_claim->>'claimed')::boolean, 'pending row must be claimed';
  ASSERT v_claim->>'claim_token' IS NOT NULL, 'claim needs a lease token';
  ASSERT v_claim->'dispatch'->>'recipient_email' = 'dispatch-client@test.invalid',
    'claim must return immutable snapshot, not changed profile data';

  v_request := public.persist_proposal_send_request(
    v_dispatch_id,
    (v_claim->>'claim_token')::uuid,
    '{"from":"Original Studio","to":["dispatch-client@test.invalid"],"cc":["finance@example.com"],"subject":"Exact","html":"<p>exact</p>"}',
    'Original Studio <hello@patina.cloud>',
    ARRAY['dispatch-client@test.invalid'],
    ARRAY['finance@example.com'],
    'Exact provider subject',
    false
  );
  ASSERT v_request->>'idempotency_key' = 'proposal-send/' || v_dispatch_id::text,
    'provider key must derive only from immutable nonce';
  ASSERT v_request->'cc' = '["finance@example.com"]'::jsonb,
    'persisted provider request must retain normalized CC exactly';

  -- Equality proof is allowed; mutation is not.
  PERFORM public.persist_proposal_send_request(
    v_dispatch_id,
    (v_claim->>'claim_token')::uuid,
    v_request->>'body',
    v_request->>'from',
    ARRAY['dispatch-client@test.invalid'],
    ARRAY['finance@example.com'],
    v_request->>'subject',
    false
  );

  BEGIN
    PERFORM public.persist_proposal_send_request(
      v_dispatch_id,
      (v_claim->>'claim_token')::uuid,
      '{"changed":true}',
      v_request->>'from',
      ARRAY['dispatch-client@test.invalid'],
      ARRAY['finance@example.com'],
      v_request->>'subject',
      false
    );
    RAISE EXCEPTION 'expected immutable request rejection';
  EXCEPTION WHEN check_violation THEN
    NULL;
  END;

  v_duplicate := public.claim_proposal_send_dispatch(
    v_dispatch_id,
    'c8300000-0000-4000-8000-000000000001',
    v_sent_at,
    30
  );
  ASSERT NOT (v_duplicate->>'claimed')::boolean
    AND v_duplicate->>'delivery_state' = 'in_flight',
    'live concurrent invocation must not acquire the lease';

  PERFORM public.begin_proposal_send_provider_attempt(
    v_dispatch_id, (v_claim->>'claim_token')::uuid
  );
  PERFORM public.complete_proposal_send_dispatch(
    v_dispatch_id,
    (v_claim->>'claim_token')::uuid,
    'failed',
    NULL,
    'Resend API 503'
  );
END;
$$;

-- A definitive failure can be explicitly retried, but every retry sees the
-- exact stored bytes/key. Ambiguous attempt three terminalizes as unconfirmed
-- and never claims again.
DO $$
DECLARE
  v_claim jsonb;
  v_terminal jsonb;
  v_dispatch_id uuid := (SELECT dispatch_id FROM committed_send);
  v_sent_at timestamptz := (SELECT sent_at FROM committed_send);
BEGIN
  v_claim := public.claim_proposal_send_dispatch(
    v_dispatch_id,
    'c8300000-0000-4000-8000-000000000001',
    v_sent_at,
    30
  );
  ASSERT (v_claim->>'claimed')::boolean,
    'failed attempt inside retention must be explicitly retryable';
  ASSERT v_claim->>'provider_request_body' LIKE '%"Exact"%',
    'retry must return persisted exact request bytes';
  ASSERT (v_claim->>'attempt_count')::integer = 1,
    'claim itself must not count as a provider attempt';

  PERFORM public.begin_proposal_send_provider_attempt(
    v_dispatch_id, (v_claim->>'claim_token')::uuid
  );
  PERFORM public.begin_proposal_send_provider_attempt(
    v_dispatch_id, (v_claim->>'claim_token')::uuid
  );
  PERFORM public.complete_proposal_send_dispatch(
    v_dispatch_id,
    (v_claim->>'claim_token')::uuid,
    'ambiguous',
    NULL,
    'three timeouts'
  );

  v_terminal := public.claim_proposal_send_dispatch(
    v_dispatch_id,
    'c8300000-0000-4000-8000-000000000001',
    v_sent_at,
    30
  );
  ASSERT NOT (v_terminal->>'claimed')::boolean
    AND v_terminal->>'delivery_state' = 'unconfirmed'
    AND (v_terminal->>'retry_exhausted')::boolean,
    'attempt ceiling must fail closed without a fourth upload';
  ASSERT pg_temp.inspect_dispatch(v_dispatch_id)->>'email_log_status'
           = 'unconfirmed',
    'terminal ambiguity must never remain logged as sending';
END;
$$;

RESET ROLE;

-- Delivered state dedupes permanently and deterministic log synchronization
-- produces exactly one logical row per channel across repeated invocations.
UPDATE public.proposal_send_dispatches
SET state = 'delivered',
    provider_id = 'provider-1',
    delivered_at = clock_timestamp(),
    last_error = NULL
WHERE id = (SELECT dispatch_id FROM committed_send);

SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);
SET LOCAL ROLE service_role;
SELECT public.sync_proposal_send_email_log(
  (SELECT dispatch_id FROM committed_send)
);
SELECT public.sync_proposal_send_email_log(
  (SELECT dispatch_id FROM committed_send)
);
SELECT public.sync_proposal_send_in_app_log(
  (SELECT dispatch_id FROM committed_send)
);
SELECT public.sync_proposal_send_in_app_log(
  (SELECT dispatch_id FROM committed_send)
);

DO $$
DECLARE
  v_claim jsonb;
BEGIN
  v_claim := public.claim_proposal_send_dispatch(
    (SELECT dispatch_id FROM committed_send),
    'c8300000-0000-4000-8000-000000000001',
    (SELECT sent_at FROM committed_send),
    30
  );
  ASSERT NOT (v_claim->>'claimed')::boolean
    AND v_claim->>'delivery_state' = 'delivered',
    'delivered nonce must dedupe permanently';
END;
$$;

RESET ROLE;
DO $$
DECLARE
  v_dispatch public.proposal_send_dispatches%ROWTYPE;
BEGIN
  SELECT * INTO v_dispatch
  FROM public.proposal_send_dispatches
  WHERE id = (SELECT dispatch_id FROM committed_send);
  ASSERT (
    SELECT count(*) = 1
    FROM public.notification_log
    WHERE id = v_dispatch.email_log_id AND channel = 'email'
  ), 'email synchronization must keep one deterministic row';
  ASSERT (
    SELECT count(*) = 1
    FROM public.notification_log
    WHERE id = v_dispatch.in_app_log_id AND channel = 'in_app'
  ), 'in-app synchronization must keep one deterministic row';
END;
$$;

-- Even below the attempt ceiling, expiry of the provider idempotency retention
-- prevents automatic or explicit replay.
UPDATE public.proposal_send_dispatches
SET state = 'failed',
    provider_attempt_count = 1,
    retry_deadline = clock_timestamp() - interval '1 second',
    provider_id = NULL,
    delivered_at = NULL,
    last_error = 'retention expired'
WHERE id = (SELECT dispatch_id FROM committed_send);

SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);
SET LOCAL ROLE service_role;
DO $$
DECLARE
  v_claim jsonb;
BEGIN
  v_claim := public.claim_proposal_send_dispatch(
    (SELECT dispatch_id FROM committed_send),
    'c8300000-0000-4000-8000-000000000001',
    (SELECT sent_at FROM committed_send),
    30
  );
  ASSERT NOT (v_claim->>'claimed')::boolean
    AND v_claim->>'delivery_state' = 'failed'
    AND (v_claim->>'retry_exhausted')::boolean,
    'expired definitive failure must stay failed and never reacquire a lease';
END;
$$;

RESET ROLE;

-- Authenticated status observation repairs stale leases instead of leaving a
-- reopened send sheet permanently in-flight. A pre-provider lease restores its
-- previous failed state.
UPDATE public.proposal_send_dispatches
SET state = 'in_flight',
    claim_token = 'c8400000-0000-4000-8000-000000000001',
    lease_expires_at = clock_timestamp() - interval '1 second',
    claimed_from_state = 'failed',
    provider_started_at = NULL,
    provider_attempt_count = 1,
    retry_deadline = clock_timestamp() + interval '1 hour',
    last_error = 'prior definitive failure'
WHERE id = (SELECT dispatch_id FROM committed_send);

SELECT pg_temp.assume_authenticated('c8000000-0000-4000-8000-000000000001');
SET LOCAL ROLE authenticated;
DO $$
DECLARE
  v_status jsonb;
BEGIN
  v_status := public.get_proposal_send_dispatch_status(
    'c8300000-0000-4000-8000-000000000001',
    (SELECT dispatch_id FROM committed_send),
    (SELECT sent_at FROM committed_send)
  );
  ASSERT v_status->>'delivery_state' = 'failed'
    AND (v_status->>'retryable')::boolean,
    'stale pre-provider status must restore its prior retryable state';
  ASSERT pg_temp.inspect_dispatch(
           (SELECT dispatch_id FROM committed_send)
         )->>'state' <> 'in_flight'
     AND pg_temp.inspect_dispatch(
           (SELECT dispatch_id FROM committed_send)
         )->>'claim_token' IS NULL
     AND pg_temp.inspect_dispatch(
           (SELECT dispatch_id FROM committed_send)
         )->>'claimed_from_state' IS NULL,
    'status must clear a stale pre-provider lease atomically';
END;
$$;

RESET ROLE;

-- A stale lease after provider start is ambiguous, not failed or pending.
UPDATE public.proposal_send_dispatches
SET state = 'in_flight',
    claim_token = 'c8400000-0000-4000-8000-000000000002',
    lease_expires_at = clock_timestamp() - interval '1 second',
    claimed_from_state = 'failed',
    provider_started_at = clock_timestamp() - interval '2 seconds',
    provider_attempt_count = 1,
    retry_deadline = clock_timestamp() + interval '1 hour',
    last_error = NULL
WHERE id = (SELECT dispatch_id FROM committed_send);

SELECT pg_temp.assume_authenticated('c8000000-0000-4000-8000-000000000001');
SET LOCAL ROLE authenticated;
DO $$
DECLARE
  v_status jsonb;
BEGIN
  v_status := public.get_proposal_send_dispatch_status(
    'c8300000-0000-4000-8000-000000000001',
    (SELECT dispatch_id FROM committed_send),
    (SELECT sent_at FROM committed_send)
  );
  ASSERT v_status->>'delivery_state' = 'ambiguous'
    AND (v_status->>'retryable')::boolean,
    'stale started-provider lease must become retryable ambiguity';
END;
$$;

RESET ROLE;

-- Newly recorded bounce/complaint suppression after an ambiguous attempt may
-- stop replay, but can never rewrite uncertainty as definitive suppression.
SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);
SET LOCAL ROLE service_role;
DO $$
DECLARE
  v_claim jsonb;
  v_completed jsonb;
  v_suppress_rejected boolean := false;
BEGIN
  v_claim := public.claim_proposal_send_dispatch(
    (SELECT dispatch_id FROM committed_send),
    'c8300000-0000-4000-8000-000000000001',
    (SELECT sent_at FROM committed_send),
    30
  );
  ASSERT (v_claim->>'claimed')::boolean
    AND v_claim->>'previous_delivery_state' = 'ambiguous',
    'ambiguous retry must retain its semantic origin';

  BEGIN
    PERFORM public.suppress_proposal_send_dispatch(
      (SELECT dispatch_id FROM committed_send),
      (v_claim->>'claim_token')::uuid,
      'email_suppressed'
    );
  EXCEPTION WHEN object_not_in_prerequisite_state THEN
    v_suppress_rejected := true;
  END;
  ASSERT v_suppress_rejected,
    'prior ambiguity must never be rewritten as suppressed';

  v_completed := public.complete_proposal_send_dispatch(
    (SELECT dispatch_id FROM committed_send),
    (v_claim->>'claim_token')::uuid,
    'unconfirmed',
    NULL,
    'email_suppressed_after_ambiguous_delivery'
  );
  ASSERT v_completed->>'delivery_state' = 'unconfirmed'
    AND (v_completed->>'retry_exhausted')::boolean,
    'suppressed replay after ambiguity must be durable unconfirmed';
  ASSERT pg_temp.inspect_dispatch(
           (SELECT dispatch_id FROM committed_send)
         )->>'email_log_status' = 'unconfirmed',
    'suppressed ambiguous replay must terminalize its email log';
END;
$$;

RESET ROLE;

-- An ambiguous row can also age out without another edge invocation; the
-- authorized status observer terminalizes and syncs it before returning.
UPDATE public.proposal_send_dispatches
SET state = 'ambiguous',
    claim_token = NULL,
    lease_expires_at = NULL,
    claimed_from_state = NULL,
    provider_attempt_count = 1,
    provider_started_at = clock_timestamp() - interval '2 hours',
    retry_deadline = clock_timestamp() - interval '1 second',
    last_error = 'provider response lost'
WHERE id = (SELECT dispatch_id FROM committed_send);

SELECT pg_temp.assume_authenticated('c8000000-0000-4000-8000-000000000001');
SET LOCAL ROLE authenticated;
DO $$
DECLARE
  v_status jsonb;
BEGIN
  v_status := public.get_proposal_send_dispatch_status(
    'c8300000-0000-4000-8000-000000000001',
    (SELECT dispatch_id FROM committed_send),
    (SELECT sent_at FROM committed_send)
  );
  ASSERT v_status->>'delivery_state' = 'unconfirmed'
    AND NOT (v_status->>'retryable')::boolean
    AND (v_status->>'retry_exhausted')::boolean,
    'expired observed ambiguity must return terminal unconfirmed';
  ASSERT pg_temp.inspect_dispatch(
           (SELECT dispatch_id FROM committed_send)
         )->>'email_log_status' = 'unconfirmed',
    'expired observed ambiguity must atomically sync the email log';
END;
$$;

RESET ROLE;

-- A definitive third-attempt provider response remains failed, is exhausted,
-- and can never be claimed as ambiguous/unconfirmed.
UPDATE public.proposal_send_dispatches
SET state = 'in_flight',
    claim_token = 'c8400000-0000-4000-8000-000000000003',
    lease_expires_at = clock_timestamp() + interval '30 seconds',
    claimed_from_state = 'failed',
    provider_attempt_count = 3,
    provider_started_at = clock_timestamp(),
    retry_deadline = clock_timestamp() + interval '1 hour',
    last_error = NULL
WHERE id = (SELECT dispatch_id FROM committed_send);

SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);
SET LOCAL ROLE service_role;
DO $$
DECLARE
  v_completed jsonb;
  v_claim jsonb;
BEGIN
  v_completed := public.complete_proposal_send_dispatch(
    (SELECT dispatch_id FROM committed_send),
    'c8400000-0000-4000-8000-000000000003',
    'failed',
    NULL,
    'Resend API 422'
  );
  ASSERT v_completed->>'delivery_state' = 'failed'
    AND (v_completed->>'retry_exhausted')::boolean,
    'definitive exhausted provider response must stay failed';

  v_claim := public.claim_proposal_send_dispatch(
    (SELECT dispatch_id FROM committed_send),
    'c8300000-0000-4000-8000-000000000001',
    (SELECT sent_at FROM committed_send),
    30
  );
  ASSERT NOT (v_claim->>'claimed')::boolean
    AND v_claim->>'delivery_state' = 'failed'
    AND (v_claim->>'retry_exhausted')::boolean,
    'definitive exhausted failure must never retry';
  PERFORM public.sync_proposal_send_email_log(
    (SELECT dispatch_id FROM committed_send)
  );
  ASSERT pg_temp.inspect_dispatch(
           (SELECT dispatch_id FROM committed_send)
         )->>'email_log_status' = 'failed',
    'definitive exhausted failure must remain logged failed';
END;
$$;

ROLLBACK;

SELECT 'proposal_send_dispatch_guard_test: all assertions passed' AS result;
