-- set_document_client relationship-spine consistency regression (00385)
-- Run:
--   psql 'postgresql://postgres:postgres@127.0.0.1:54322/postgres' \
--     -v ON_ERROR_STOP=1 -f supabase/tests/document/set_document_client_consistency_test.sql

BEGIN;

INSERT INTO auth.users (
  id, email, encrypted_password, email_confirmed_at, created_at, updated_at,
  instance_id, aud, role
)
VALUES
  (
    'c7000000-0000-4000-8000-000000000001',
    'document-client-owner@test.invalid', '', NOW(), NOW(), NOW(),
    '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'
  ),
  (
    'c7000000-0000-4000-8000-000000000002',
    'new-client@test.invalid', '', NOW(), NOW(), NOW(),
    '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'
  ),
  (
    'c7000000-0000-4000-8000-000000000003',
    'invited-household@test.invalid', '', NOW(), NOW(), NOW(),
    '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'
  ),
  (
    'c7000000-0000-4000-8000-000000000004',
    'other-designer@test.invalid', '', NOW(), NOW(), NOW(),
    '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'
  ),
  (
    'c7000000-0000-4000-8000-000000000005',
    'other-client@test.invalid', '', NOW(), NOW(), NOW(),
    '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'
  );

INSERT INTO public.profiles (id, email, full_name, created_at, updated_at)
VALUES
  ('c7000000-0000-4000-8000-000000000001', 'document-client-owner@test.invalid', 'Document Client Owner', NOW(), NOW()),
  ('c7000000-0000-4000-8000-000000000002', 'new-client@test.invalid', 'New Registered Client', NOW(), NOW()),
  ('c7000000-0000-4000-8000-000000000003', 'invited-household@test.invalid', 'Invited Household', NOW(), NOW()),
  ('c7000000-0000-4000-8000-000000000004', 'other-designer@test.invalid', 'Other Designer', NOW(), NOW()),
  ('c7000000-0000-4000-8000-000000000005', 'other-client@test.invalid', 'Other Client', NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.designer_clients (
  id, designer_id, client_id, client_email, client_name, status, source
)
VALUES
  (
    'c7100000-0000-4000-8000-000000000001',
    'c7000000-0000-4000-8000-000000000001', NULL,
    'old-captured@test.invalid', 'Old Captured Household', 'lead', 'direct'
  ),
  (
    'c7100000-0000-4000-8000-000000000002',
    'c7000000-0000-4000-8000-000000000001',
    'c7000000-0000-4000-8000-000000000002',
    'new-client@test.invalid', 'New Registered Household', 'active', 'direct'
  ),
  (
    'c7100000-0000-4000-8000-000000000003',
    'c7000000-0000-4000-8000-000000000001', NULL,
    'invited-household@test.invalid', 'Captured Same Household', 'lead', 'direct'
  ),
  (
    'c7100000-0000-4000-8000-000000000004',
    'c7000000-0000-4000-8000-000000000001',
    'c7000000-0000-4000-8000-000000000003',
    'historical-household@test.invalid', 'Historical Household Relationship', 'active', 'direct'
  ),
  (
    'c7100000-0000-4000-8000-000000000005',
    'c7000000-0000-4000-8000-000000000004',
    'c7000000-0000-4000-8000-000000000005',
    'other-client@test.invalid', 'Other Client Household', 'active', 'direct'
  );

INSERT INTO public.proposals (
  id, designer_id, designer_client_id, client_id, title, total_amount, status
)
VALUES
  (
    'c7200000-0000-4000-8000-000000000001',
    'c7000000-0000-4000-8000-000000000001',
    'c7100000-0000-4000-8000-000000000001', NULL,
    'Reassign captured household', 100000, 'draft'
  ),
  (
    'c7200000-0000-4000-8000-000000000002',
    'c7000000-0000-4000-8000-000000000001',
    'c7100000-0000-4000-8000-000000000003', NULL,
    'Invite captured household', 100000, 'draft'
  ),
  (
    'c7200000-0000-4000-8000-000000000003',
    'c7000000-0000-4000-8000-000000000004',
    'c7100000-0000-4000-8000-000000000005',
    'c7000000-0000-4000-8000-000000000005',
    'Foreign proposal', 100000, 'draft'
  );

CREATE OR REPLACE FUNCTION pg_temp.assume_document_client_owner()
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object(
      'sub', 'c7000000-0000-4000-8000-000000000001',
      'role', 'authenticated'
    )::text,
    true
  );
END;
$$;

SET LOCAL ROLE authenticated;
SELECT pg_temp.assume_document_client_owner();

-- Reassigning a captured proposal to a different registered client updates
-- both legs of the relationship spine in the same transaction.
SELECT public.set_document_client(
  'proposal',
  'c7200000-0000-4000-8000-000000000001',
  'c7000000-0000-4000-8000-000000000002'
);

DO $$
DECLARE
  v_proposal public.proposals;
  v_document_client_name text;
BEGIN
  SELECT * INTO v_proposal
  FROM public.proposals
  WHERE id = 'c7200000-0000-4000-8000-000000000001';

  ASSERT v_proposal.client_id = 'c7000000-0000-4000-8000-000000000002',
    'proposal client_id should point at the selected registered client';
  ASSERT v_proposal.designer_client_id = 'c7100000-0000-4000-8000-000000000002',
    'proposal designer_client_id must move with client_id atomically';

  SELECT client_name INTO v_document_client_name
  FROM public.document_state
  WHERE engagement_kind = 'proposal'
    AND engagement_id = 'c7200000-0000-4000-8000-000000000001';

  ASSERT v_document_client_name = 'New Registered Household',
    format('document-state letterhead should follow the new relationship, got %L',
      v_document_client_name);
END;
$$;

-- Simulate invite-and-link completing for the proposal's own captured row.
-- Even when a historical canonical row exists for the same profile, the RPC
-- preserves the engagement-specific relationship already on the proposal.
UPDATE public.designer_clients
SET client_id = 'c7000000-0000-4000-8000-000000000003',
    updated_at = NOW()
WHERE id = 'c7100000-0000-4000-8000-000000000003';

SELECT public.set_document_client(
  'proposal',
  'c7200000-0000-4000-8000-000000000002',
  'c7000000-0000-4000-8000-000000000003'
);

DO $$
DECLARE
  v_proposal public.proposals;
BEGIN
  SELECT * INTO v_proposal
  FROM public.proposals
  WHERE id = 'c7200000-0000-4000-8000-000000000002';

  ASSERT v_proposal.client_id = 'c7000000-0000-4000-8000-000000000003',
    'invited profile should attach to the proposal';
  ASSERT v_proposal.designer_client_id = 'c7100000-0000-4000-8000-000000000003',
    'captured-same-household invite must retain its engagement relationship';
END;
$$;

-- Unlinking clears both denormalized identity legs; leaving the captured
-- relationship id behind would keep stale document_state letterhead data.
SELECT public.set_document_client(
  'proposal',
  'c7200000-0000-4000-8000-000000000001',
  NULL
);
DO $$
BEGIN
  ASSERT (SELECT client_id IS NULL AND designer_client_id IS NULL
          FROM public.proposals
          WHERE id = 'c7200000-0000-4000-8000-000000000001'),
    'unlink must clear client_id and designer_client_id together';
END;
$$;

-- A designer cannot attach another designer's client or mutate their proposal.
DO $$
DECLARE
  v_error text;
BEGIN
  BEGIN
    PERFORM public.set_document_client(
      'proposal',
      'c7200000-0000-4000-8000-000000000001',
      'c7000000-0000-4000-8000-000000000005'
    );
  EXCEPTION WHEN insufficient_privilege THEN
    v_error := SQLERRM;
  END;
  ASSERT v_error = 'client c7000000-0000-4000-8000-000000000005 is not one of your clients',
    format('cross-designer client should be rejected, got %L', v_error);

  v_error := NULL;
  BEGIN
    PERFORM public.set_document_client(
      'proposal',
      'c7200000-0000-4000-8000-000000000003',
      NULL
    );
  EXCEPTION WHEN insufficient_privilege THEN
    v_error := SQLERRM;
  END;
  ASSERT v_error = 'no proposal owned by you with id c7200000-0000-4000-8000-000000000003',
    format('foreign proposal should be rejected, got %L', v_error);
END;
$$;

ROLLBACK;
