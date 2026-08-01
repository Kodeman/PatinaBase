-- send_proposal authoritative payment schedule regression (00384)
-- Run:
--   psql 'postgresql://postgres:postgres@127.0.0.1:54322/postgres' \
--     -v ON_ERROR_STOP=1 -f supabase/tests/proposals/send_proposal_schedule_guard_test.sql

BEGIN;

INSERT INTO auth.users (
  id, email, encrypted_password, email_confirmed_at, created_at, updated_at,
  instance_id, aud, role
)
VALUES (
  'b7000000-0000-4000-8000-000000000001',
  'send-proposal-owner@test.invalid', '', NOW(), NOW(), NOW(),
  '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'
);

INSERT INTO public.profiles (id, email, full_name, created_at, updated_at)
VALUES (
  'b7000000-0000-4000-8000-000000000001',
  'send-proposal-owner@test.invalid', 'Send Proposal Owner', NOW(), NOW()
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.proposals (id, designer_id, title, total_amount, status)
VALUES
  ('b7100000-0000-4000-8000-000000000001', 'b7000000-0000-4000-8000-000000000001', 'Stale amount', 1320000, 'draft'),
  ('b7100000-0000-4000-8000-000000000002', 'b7000000-0000-4000-8000-000000000001', 'Zero total', 0, 'draft'),
  ('b7100000-0000-4000-8000-000000000003', 'b7000000-0000-4000-8000-000000000001', 'No schedule', 100000, 'draft'),
  ('b7100000-0000-4000-8000-000000000004', 'b7000000-0000-4000-8000-000000000001', 'Blank label', 100000, 'draft'),
  ('b7100000-0000-4000-8000-000000000005', 'b7000000-0000-4000-8000-000000000001', 'Zero percent', 100000, 'draft'),
  ('b7100000-0000-4000-8000-000000000006', 'b7000000-0000-4000-8000-000000000001', 'Percent shortfall', 100000, 'draft'),
  ('b7100000-0000-4000-8000-000000000007', 'b7000000-0000-4000-8000-000000000001', 'Rounding', 101, 'draft'),
  ('b7100000-0000-4000-8000-000000000008', 'b7000000-0000-4000-8000-000000000001', 'Nonpositive child', 1, 'draft');

INSERT INTO public.proposal_payment_milestones (
  id, proposal_id, label, percentage, amount_cents, sort_order
)
VALUES
  ('b7200000-0000-4000-8000-000000000001', 'b7100000-0000-4000-8000-000000000001', 'Final', 100, 320000, 0),
  ('b7200000-0000-4000-8000-000000000002', 'b7100000-0000-4000-8000-000000000002', 'Final', 100, 0, 0),
  ('b7200000-0000-4000-8000-000000000004', 'b7100000-0000-4000-8000-000000000004', '', 100, 100000, 0),
  ('b7200000-0000-4000-8000-000000000005', 'b7100000-0000-4000-8000-000000000005', 'Nothing', 0, 0, 0),
  ('b7200000-0000-4000-8000-000000000006', 'b7100000-0000-4000-8000-000000000006', 'Short', 90, 90000, 0),
  ('b7200000-0000-4000-8000-000000000071', 'b7100000-0000-4000-8000-000000000007', 'First', 33.33, 1, 0),
  ('b7200000-0000-4000-8000-000000000072', 'b7100000-0000-4000-8000-000000000007', 'Second', 33.33, 1, 1),
  ('b7200000-0000-4000-8000-000000000073', 'b7100000-0000-4000-8000-000000000007', 'Final', 33.34, 99, 2),
  ('b7200000-0000-4000-8000-000000000081', 'b7100000-0000-4000-8000-000000000008', 'First', 50, 1, 0),
  ('b7200000-0000-4000-8000-000000000082', 'b7100000-0000-4000-8000-000000000008', 'Final', 50, 1, 1);

CREATE OR REPLACE FUNCTION pg_temp.assume_proposal_owner()
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object(
      'sub', 'b7000000-0000-4000-8000-000000000001',
      'role', 'authenticated'
    )::text,
    true
  );
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.expect_send_failure(
  p_proposal_id uuid,
  p_expected text
)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_error text;
BEGIN
  BEGIN
    PERFORM public.send_proposal(p_proposal_id);
  EXCEPTION WHEN check_violation THEN
    v_error := SQLERRM;
  END;

  ASSERT v_error = p_expected,
    format('expected send_proposal error %L, got %L', p_expected, v_error);
  ASSERT (SELECT status = 'draft' FROM public.proposals WHERE id = p_proposal_id),
    'a rejected schedule must leave its proposal in draft';
END;
$$;

-- Exercise the real INVOKER/RLS/grant path, not postgres' RLS bypass.
SET LOCAL ROLE authenticated;
SELECT pg_temp.assume_proposal_owner();

-- Persisted amount is stale; percentage + proposal total are authoritative.
DO $$
DECLARE
  v_proposal public.proposals;
  v_amount integer;
BEGIN
  v_proposal := public.send_proposal(
    'b7100000-0000-4000-8000-000000000001',
    'Please review',
    'copy@test.invalid',
    '2026-12-31T00:00:00Z'
  );
  SELECT amount_cents INTO v_amount
  FROM public.proposal_payment_milestones
  WHERE id = 'b7200000-0000-4000-8000-000000000001';

  ASSERT v_proposal.status = 'sent', 'valid schedule should send';
  ASSERT v_proposal.personal_message = 'Please review',
    'send metadata should retain its existing behavior';
  ASSERT v_amount = 1320000,
    format('100%% milestone should reconcile to 1320000, got %s', v_amount);
END;
$$;

SELECT pg_temp.expect_send_failure(
  'b7100000-0000-4000-8000-000000000002',
  'proposal total must be greater than zero before sending'
);
SELECT pg_temp.expect_send_failure(
  'b7100000-0000-4000-8000-000000000003',
  'proposal payment schedule is required before sending'
);
SELECT pg_temp.expect_send_failure(
  'b7100000-0000-4000-8000-000000000004',
  'proposal payment milestone labels cannot be blank'
);
SELECT pg_temp.expect_send_failure(
  'b7100000-0000-4000-8000-000000000005',
  'proposal payment percentages must all be greater than zero'
);
SELECT pg_temp.expect_send_failure(
  'b7100000-0000-4000-8000-000000000006',
  'proposal payment percentages must total 100'
);
SELECT pg_temp.expect_send_failure(
  'b7100000-0000-4000-8000-000000000008',
  'proposal payment milestones must each resolve to a positive amount'
);

-- The last positive row absorbs the rounding delta deterministically.
DO $$
DECLARE
  v_proposal public.proposals;
  v_amounts integer[];
BEGIN
  v_proposal := public.send_proposal('b7100000-0000-4000-8000-000000000007');
  SELECT array_agg(amount_cents ORDER BY sort_order, id)
  INTO v_amounts
  FROM public.proposal_payment_milestones
  WHERE proposal_id = 'b7100000-0000-4000-8000-000000000007';

  ASSERT v_proposal.status = 'sent', 'rounded valid schedule should send';
  ASSERT v_amounts = ARRAY[34, 34, 33],
    format('expected deterministic [34,34,33], got %s', v_amounts);
  ASSERT (SELECT sum(amount_cents) = 101
          FROM public.proposal_payment_milestones
          WHERE proposal_id = 'b7100000-0000-4000-8000-000000000007'),
    'reconciled child amounts must exactly equal the proposal total';
END;
$$;

ROLLBACK;
