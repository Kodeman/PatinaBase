-- send_proposal authoritative payment schedule regression (00384)
-- Run:
--   psql 'postgresql://postgres:postgres@127.0.0.1:54322/postgres' \
--     -v ON_ERROR_STOP=1 -f supabase/tests/proposals/send_proposal_schedule_guard_test.sql

BEGIN;

INSERT INTO auth.users (
  id, email, encrypted_password, email_confirmed_at, created_at, updated_at,
  instance_id, aud, role
)
VALUES
  (
    'b7000000-0000-4000-8000-000000000001',
    'send-proposal-owner@test.invalid', '', NOW(), NOW(), NOW(),
    '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'
  ),
  (
    'b7000000-0000-4000-8000-000000000002',
    'send-proposal-foreign@test.invalid', '', NOW(), NOW(), NOW(),
    '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'
  );

INSERT INTO public.profiles (id, email, full_name, created_at, updated_at)
VALUES
  (
    'b7000000-0000-4000-8000-000000000001',
    'send-proposal-owner@test.invalid', 'Send Proposal Owner', NOW(), NOW()
  ),
  (
    'b7000000-0000-4000-8000-000000000002',
    'send-proposal-foreign@test.invalid', 'Foreign Proposal Owner', NOW(), NOW()
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
  ('b7100000-0000-4000-8000-000000000008', 'b7000000-0000-4000-8000-000000000001', 'Nonpositive child', 1, 'draft'),
  ('b7100000-0000-4000-8000-000000000009', 'b7000000-0000-4000-8000-000000000001', 'Concurrent schedule edit', 100000, 'draft'),
  ('b7100000-0000-4000-8000-000000000010', 'b7000000-0000-4000-8000-000000000001', 'Concurrent total edit', 100000, 'draft'),
  ('b7100000-0000-4000-8000-000000000011', 'b7000000-0000-4000-8000-000000000002', 'RLS-hidden proposal', 100000, 'draft');

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
  ('b7200000-0000-4000-8000-000000000082', 'b7100000-0000-4000-8000-000000000008', 'Final', 50, 1, 1),
  ('b7200000-0000-4000-8000-000000000091', 'b7100000-0000-4000-8000-000000000009', 'On approval', 100, 100000, 0),
  ('b7200000-0000-4000-8000-000000000101', 'b7100000-0000-4000-8000-000000000010', 'On approval', 100, 100000, 0);

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
  v_snapshot record;
BEGIN
  SELECT * INTO STRICT v_snapshot
  FROM public.get_proposal_send_snapshot(p_proposal_id);

  BEGIN
    PERFORM public.send_proposal(
      p_proposal_id,
      v_snapshot.proposal_updated_at,
      v_snapshot.proposal_total_amount,
      v_snapshot.schedule_fingerprint
    );
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

-- There is no authenticated compatibility bypass: every send must carry the
-- exact snapshot the designer reviewed.
DO $$
BEGIN
  ASSERT to_regprocedure(
    'public.send_proposal(uuid,text,text,timestamptz)'
  ) IS NULL,
    'unsafe four-argument send_proposal overload must be dropped';
END;
$$;

DO $$
BEGIN
  ASSERT (
    SELECT count(*) = 0
    FROM public.get_proposal_send_snapshot(
      'b7100000-0000-4000-8000-000000000011'
    )
  ), 'snapshot RPC must preserve proposal RLS for a non-owner';
END;
$$;

-- Persisted amount is stale; percentage + proposal total are authoritative.
DO $$
DECLARE
  v_proposal public.proposals;
  v_amount integer;
  v_snapshot record;
  v_expected_fingerprint text;
BEGIN
  SELECT * INTO STRICT v_snapshot
  FROM public.get_proposal_send_snapshot(
    'b7100000-0000-4000-8000-000000000001'
  );
  SELECT md5(
    COALESCE(
      jsonb_agg(
        jsonb_build_array(
          id::text,
          sort_order,
          label,
          percentage::text,
          trigger_condition
        ) ORDER BY sort_order, id
      )::text,
      '[]'
    )
  )
  INTO v_expected_fingerprint
  FROM public.proposal_payment_milestones
  WHERE proposal_id = 'b7100000-0000-4000-8000-000000000001';

  ASSERT v_snapshot.schedule_fingerprint = v_expected_fingerprint,
    'snapshot must use the documented deterministic schedule serialization';

  v_proposal := public.send_proposal(
    'b7100000-0000-4000-8000-000000000001',
    v_snapshot.proposal_updated_at,
    v_snapshot.proposal_total_amount,
    v_snapshot.schedule_fingerprint,
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

-- The updated_at token is required independently of total/fingerprint.
DO $$
DECLARE
  v_snapshot record;
  v_error text;
BEGIN
  SELECT * INTO STRICT v_snapshot
  FROM public.get_proposal_send_snapshot(
    'b7100000-0000-4000-8000-000000000010'
  );

  BEGIN
    PERFORM public.send_proposal(
      'b7100000-0000-4000-8000-000000000010',
      v_snapshot.proposal_updated_at - interval '1 second',
      v_snapshot.proposal_total_amount,
      v_snapshot.schedule_fingerprint
    );
  EXCEPTION WHEN check_violation THEN
    v_error := SQLERRM;
  END;

  ASSERT v_error = 'proposal changed after send review; refresh and review again',
    format('stale proposal updated_at should reject reviewed snapshot, got %L', v_error);
END;
$$;

-- A milestone edit after the reviewed snapshot is rejected even though the
-- edited schedule remains mathematically valid. This is the optimistic-
-- concurrency seam between browser review and the RPC's locked write.
DO $$
DECLARE
  v_snapshot record;
  v_error text;
BEGIN
  SELECT * INTO STRICT v_snapshot
  FROM public.get_proposal_send_snapshot(
    'b7100000-0000-4000-8000-000000000009'
  );

  UPDATE public.proposal_payment_milestones
  SET trigger_condition = 'After written approval'
  WHERE id = 'b7200000-0000-4000-8000-000000000091';

  BEGIN
    PERFORM public.send_proposal(
      'b7100000-0000-4000-8000-000000000009',
      v_snapshot.proposal_updated_at,
      v_snapshot.proposal_total_amount,
      v_snapshot.schedule_fingerprint
    );
  EXCEPTION WHEN check_violation THEN
    v_error := SQLERRM;
  END;

  ASSERT v_error = 'proposal changed after send review; refresh and review again',
    format('concurrent schedule edit should reject reviewed snapshot, got %L', v_error);
  ASSERT (SELECT status = 'draft' FROM public.proposals
          WHERE id = 'b7100000-0000-4000-8000-000000000009'),
    'snapshot mismatch must leave the proposal in draft';
END;
$$;

-- Proposal header tokens are independently enforced. Pass the current
-- updated_at/fingerprint with the stale reviewed total to isolate the total
-- comparison from the timestamp comparison.
DO $$
DECLARE
  v_snapshot record;
  v_current record;
  v_error text;
BEGIN
  SELECT * INTO STRICT v_snapshot
  FROM public.get_proposal_send_snapshot(
    'b7100000-0000-4000-8000-000000000010'
  );

  UPDATE public.proposals
  SET total_amount = 200000
  WHERE id = 'b7100000-0000-4000-8000-000000000010';

  SELECT * INTO STRICT v_current
  FROM public.get_proposal_send_snapshot(
    'b7100000-0000-4000-8000-000000000010'
  );

  BEGIN
    PERFORM public.send_proposal(
      'b7100000-0000-4000-8000-000000000010',
      v_current.proposal_updated_at,
      v_snapshot.proposal_total_amount,
      v_current.schedule_fingerprint
    );
  EXCEPTION WHEN check_violation THEN
    v_error := SQLERRM;
  END;

  ASSERT v_error = 'proposal changed after send review; refresh and review again',
    format('stale proposal total should reject reviewed snapshot, got %L', v_error);
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
  v_snapshot record;
BEGIN
  SELECT * INTO STRICT v_snapshot
  FROM public.get_proposal_send_snapshot(
    'b7100000-0000-4000-8000-000000000007'
  );
  v_proposal := public.send_proposal(
    'b7100000-0000-4000-8000-000000000007',
    v_snapshot.proposal_updated_at,
    v_snapshot.proposal_total_amount,
    v_snapshot.schedule_fingerprint
  );
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
