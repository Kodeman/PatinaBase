-- send_proposal payment + reviewed-copy authority regression (00384, 00387)
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
  ),
  (
    'b7000000-0000-4000-8000-000000000003',
    'send-proposal-studio-peer@test.invalid', '', NOW(), NOW(), NOW(),
    '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'
  ),
  (
    'b7000000-0000-4000-8000-000000000004',
    'send-proposal-contractor-peer@test.invalid', '', NOW(), NOW(), NOW(),
    '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'
  ),
  (
    'b7000000-0000-4000-8000-000000000005',
    'send-proposal-manufacturer-peer@test.invalid', '', NOW(), NOW(), NOW(),
    '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'
  ),
  (
    'b7000000-0000-4000-8000-000000000006',
    'send-proposal-studio-guest@test.invalid', '', NOW(), NOW(), NOW(),
    '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'
  ),
  (
    'b7000000-0000-4000-8000-000000000007',
    'send-proposal-inactive-org@test.invalid', '', NOW(), NOW(), NOW(),
    '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'
  ),
  (
    'b7000000-0000-4000-8000-000000000008',
    'send-proposal-inactive-member@test.invalid', '', NOW(), NOW(), NOW(),
    '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'
  ),
  (
    'b7000000-0000-4000-8000-000000000009',
    'send-proposal-unrelated@test.invalid', '', NOW(), NOW(), NOW(),
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
  ),
  (
    'b7000000-0000-4000-8000-000000000003',
    'send-proposal-studio-peer@test.invalid', 'Studio Peer', NOW(), NOW()
  ),
  (
    'b7000000-0000-4000-8000-000000000004',
    'send-proposal-contractor-peer@test.invalid', 'Contractor Peer', NOW(), NOW()
  ),
  (
    'b7000000-0000-4000-8000-000000000005',
    'send-proposal-manufacturer-peer@test.invalid', 'Manufacturer Peer', NOW(), NOW()
  ),
  (
    'b7000000-0000-4000-8000-000000000006',
    'send-proposal-studio-guest@test.invalid', 'Studio Guest', NOW(), NOW()
  ),
  (
    'b7000000-0000-4000-8000-000000000007',
    'send-proposal-inactive-org@test.invalid', 'Inactive Org Peer', NOW(), NOW()
  ),
  (
    'b7000000-0000-4000-8000-000000000008',
    'send-proposal-inactive-member@test.invalid', 'Inactive Member', NOW(), NOW()
  ),
  (
    'b7000000-0000-4000-8000-000000000009',
    'send-proposal-unrelated@test.invalid', 'Unrelated Actor', NOW(), NOW()
  )
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.organizations (id, type, name, slug, status)
VALUES
  (
    'b7600000-0000-4000-8000-000000000001', 'design_studio',
    'Active Send Studio', 'send-active-studio', 'active'
  ),
  (
    'b7600000-0000-4000-8000-000000000002', 'contractor',
    'Shared Contractor', 'send-shared-contractor', 'active'
  ),
  (
    'b7600000-0000-4000-8000-000000000003', 'manufacturer',
    'Shared Manufacturer', 'send-shared-manufacturer', 'active'
  ),
  (
    'b7600000-0000-4000-8000-000000000004', 'design_studio',
    'Suspended Send Studio', 'send-suspended-studio', 'suspended'
  ),
  (
    'b7600000-0000-4000-8000-000000000005', 'design_studio',
    'Inactive Member Studio', 'send-inactive-member-studio', 'active'
  );

INSERT INTO public.organization_members (
  user_id, organization_id, role, status, joined_at
)
VALUES
  ('b7000000-0000-4000-8000-000000000001', 'b7600000-0000-4000-8000-000000000001', 'owner', 'active', NOW()),
  ('b7000000-0000-4000-8000-000000000003', 'b7600000-0000-4000-8000-000000000001', 'member', 'active', NOW()),
  ('b7000000-0000-4000-8000-000000000006', 'b7600000-0000-4000-8000-000000000001', 'guest', 'active', NOW()),
  ('b7000000-0000-4000-8000-000000000001', 'b7600000-0000-4000-8000-000000000002', 'owner', 'active', NOW()),
  ('b7000000-0000-4000-8000-000000000004', 'b7600000-0000-4000-8000-000000000002', 'member', 'active', NOW()),
  ('b7000000-0000-4000-8000-000000000001', 'b7600000-0000-4000-8000-000000000003', 'owner', 'active', NOW()),
  ('b7000000-0000-4000-8000-000000000005', 'b7600000-0000-4000-8000-000000000003', 'member', 'active', NOW()),
  ('b7000000-0000-4000-8000-000000000001', 'b7600000-0000-4000-8000-000000000004', 'owner', 'active', NOW()),
  ('b7000000-0000-4000-8000-000000000007', 'b7600000-0000-4000-8000-000000000004', 'member', 'active', NOW()),
  ('b7000000-0000-4000-8000-000000000001', 'b7600000-0000-4000-8000-000000000005', 'owner', 'active', NOW()),
  ('b7000000-0000-4000-8000-000000000008', 'b7600000-0000-4000-8000-000000000005', 'member', 'suspended', NOW());

INSERT INTO public.designer_clients (
  id, designer_id, client_id, client_name, status, source
)
VALUES
  ('b7050000-0000-4000-8000-000000000001',
   'b7000000-0000-4000-8000-000000000001',
   'b7000000-0000-4000-8000-000000000002',
   'Send Test Client', 'active', 'direct'),
  ('b7050000-0000-4000-8000-000000000002',
   'b7000000-0000-4000-8000-000000000002',
   'b7000000-0000-4000-8000-000000000001',
   'Foreign Test Client', 'active', 'direct');

INSERT INTO public.proposals (
  id, designer_id, designer_client_id, client_id, title, total_amount, status
)
VALUES
  ('b7100000-0000-4000-8000-000000000001', 'b7000000-0000-4000-8000-000000000001', 'b7050000-0000-4000-8000-000000000001', 'b7000000-0000-4000-8000-000000000002', 'Stale amount', 1320000, 'draft'),
  ('b7100000-0000-4000-8000-000000000002', 'b7000000-0000-4000-8000-000000000001', 'b7050000-0000-4000-8000-000000000001', 'b7000000-0000-4000-8000-000000000002', 'Zero total', 0, 'draft'),
  ('b7100000-0000-4000-8000-000000000003', 'b7000000-0000-4000-8000-000000000001', 'b7050000-0000-4000-8000-000000000001', 'b7000000-0000-4000-8000-000000000002', 'No schedule', 100000, 'draft'),
  ('b7100000-0000-4000-8000-000000000004', 'b7000000-0000-4000-8000-000000000001', 'b7050000-0000-4000-8000-000000000001', 'b7000000-0000-4000-8000-000000000002', 'Blank label', 100000, 'draft'),
  ('b7100000-0000-4000-8000-000000000005', 'b7000000-0000-4000-8000-000000000001', 'b7050000-0000-4000-8000-000000000001', 'b7000000-0000-4000-8000-000000000002', 'Zero percent', 100000, 'draft'),
  ('b7100000-0000-4000-8000-000000000006', 'b7000000-0000-4000-8000-000000000001', 'b7050000-0000-4000-8000-000000000001', 'b7000000-0000-4000-8000-000000000002', 'Percent shortfall', 100000, 'draft'),
  ('b7100000-0000-4000-8000-000000000007', 'b7000000-0000-4000-8000-000000000001', 'b7050000-0000-4000-8000-000000000001', 'b7000000-0000-4000-8000-000000000002', 'Rounding', 101, 'draft'),
  ('b7100000-0000-4000-8000-000000000008', 'b7000000-0000-4000-8000-000000000001', 'b7050000-0000-4000-8000-000000000001', 'b7000000-0000-4000-8000-000000000002', 'Nonpositive child', 1, 'draft'),
  ('b7100000-0000-4000-8000-000000000009', 'b7000000-0000-4000-8000-000000000001', 'b7050000-0000-4000-8000-000000000001', 'b7000000-0000-4000-8000-000000000002', 'Concurrent schedule edit', 100000, 'draft'),
  ('b7100000-0000-4000-8000-000000000010', 'b7000000-0000-4000-8000-000000000001', 'b7050000-0000-4000-8000-000000000001', 'b7000000-0000-4000-8000-000000000002', 'Concurrent total edit', 100000, 'draft'),
  ('b7100000-0000-4000-8000-000000000011', 'b7000000-0000-4000-8000-000000000002', 'b7050000-0000-4000-8000-000000000002', 'b7000000-0000-4000-8000-000000000001', 'RLS-hidden proposal', 100000, 'draft'),
  ('b7100000-0000-4000-8000-000000000012', 'b7000000-0000-4000-8000-000000000001', 'b7050000-0000-4000-8000-000000000001', 'b7000000-0000-4000-8000-000000000002', 'Already sent', 100000, 'sent'),
  ('b7100000-0000-4000-8000-000000000013', 'b7000000-0000-4000-8000-000000000001', 'b7050000-0000-4000-8000-000000000001', 'b7000000-0000-4000-8000-000000000002', 'Already viewed', 100000, 'viewed'),
  ('b7100000-0000-4000-8000-000000000014', 'b7000000-0000-4000-8000-000000000001', 'b7050000-0000-4000-8000-000000000001', 'b7000000-0000-4000-8000-000000000002', 'Already accepted', 100000, 'accepted'),
  ('b7100000-0000-4000-8000-000000000015', 'b7000000-0000-4000-8000-000000000001', 'b7050000-0000-4000-8000-000000000001', 'b7000000-0000-4000-8000-000000000002', 'Already declined', 100000, 'declined'),
  ('b7100000-0000-4000-8000-000000000016', 'b7000000-0000-4000-8000-000000000001', NULL, NULL, 'Unlinked draft', 100000, 'draft'),
  ('b7100000-0000-4000-8000-000000000017', 'b7000000-0000-4000-8000-000000000001', 'b7050000-0000-4000-8000-000000000001', 'b7000000-0000-4000-8000-000000000002', 'Studio peer authority', 100000, 'draft');

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
  ('b7200000-0000-4000-8000-000000000101', 'b7100000-0000-4000-8000-000000000010', 'On approval', 100, 100000, 0),
  ('b7200000-0000-4000-8000-000000000121', 'b7100000-0000-4000-8000-000000000012', 'Final', 100, 100000, 0),
  ('b7200000-0000-4000-8000-000000000131', 'b7100000-0000-4000-8000-000000000013', 'Final', 100, 100000, 0),
  ('b7200000-0000-4000-8000-000000000141', 'b7100000-0000-4000-8000-000000000014', 'Final', 100, 100000, 0),
  ('b7200000-0000-4000-8000-000000000151', 'b7100000-0000-4000-8000-000000000015', 'Final', 100, 100000, 0),
  ('b7200000-0000-4000-8000-000000000161', 'b7100000-0000-4000-8000-000000000016', 'Final', 100, 100000, 0),
  ('b7200000-0000-4000-8000-000000000171', 'b7100000-0000-4000-8000-000000000017', 'Final', 100, 100000, 0);

INSERT INTO public.proposal_scope_rooms (
  id, proposal_id, name, room_type, budget_cents, sort_order
)
VALUES (
  'b7300000-0000-4000-8000-000000000009',
  'b7100000-0000-4000-8000-000000000009',
  'Living room', 'living_room', 100000, 0
);

INSERT INTO public.proposal_palettes (id, proposal_id, name, sort_order)
VALUES (
  'b7400000-0000-4000-8000-000000000010',
  'b7100000-0000-4000-8000-000000000010',
  'Warm neutrals', 0
);

INSERT INTO public.palette_swatches (
  id, palette_id, hex, name, sort_order
)
VALUES (
  'b7500000-0000-4000-8000-000000000010',
  'b7400000-0000-4000-8000-000000000010',
  '#D8C8B8', 'Linen', 0
);

CREATE OR REPLACE FUNCTION pg_temp.assume_proposal_actor(p_actor uuid)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object(
      'sub', p_actor,
      'role', 'authenticated'
    )::text,
    true
  );
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.assume_proposal_owner()
RETURNS void
LANGUAGE sql
AS $$
  SELECT pg_temp.assume_proposal_actor(
    'b7000000-0000-4000-8000-000000000001'
  );
$$;

CREATE OR REPLACE FUNCTION pg_temp.expect_proposal_author_denied(
  p_actor uuid,
  p_label text
)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_error text;
BEGIN
  PERFORM pg_temp.assume_proposal_actor(p_actor);

  ASSERT (
    SELECT count(*) = 0
    FROM public.get_proposal_send_snapshot(
      'b7100000-0000-4000-8000-000000000003'
    )
  ), format('%s must not receive a reviewed snapshot', p_label);

  BEGIN
    PERFORM public.send_proposal(
      'b7100000-0000-4000-8000-000000000003',
      now(), 100000, repeat('0', 32)
    );
  EXCEPTION WHEN insufficient_privilege THEN
    v_error := SQLERRM;
  END;

  ASSERT v_error =
    'send_proposal: proposal b7100000-0000-4000-8000-000000000003 not found or access denied',
    format('%s send authority should be denied, got %L', p_label, v_error);
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

-- Authoring authority is intentionally narrower than shared-workspace RLS:
-- owner access remains available to a solo designer, while peer access exists
-- only through an active design_studio and active non-guest memberships on
-- both sides. Contractor/manufacturer co-membership must never authorize a
-- client-facing send.
DO $$
DECLARE
  v_snapshot record;
  v_sent public.proposals;
BEGIN
  ASSERT (
    SELECT count(*) = 1
    FROM public.get_proposal_send_snapshot(
      'b7100000-0000-4000-8000-000000000003'
    )
  ), 'the exact proposal designer must retain snapshot authority';

  PERFORM pg_temp.assume_proposal_actor(
    'b7000000-0000-4000-8000-000000000003'
  );
  SELECT * INTO STRICT v_snapshot
  FROM public.get_proposal_send_snapshot(
    'b7100000-0000-4000-8000-000000000017'
  );
  v_sent := public.send_proposal(
    'b7100000-0000-4000-8000-000000000017',
    v_snapshot.proposal_updated_at,
    v_snapshot.proposal_total_amount,
    v_snapshot.schedule_fingerprint
  );
  ASSERT v_sent.status = 'sent',
    'an active non-guest design_studio peer must retain send authority';
END;
$$;

SELECT pg_temp.expect_proposal_author_denied(
  'b7000000-0000-4000-8000-000000000004', 'contractor co-member'
);
SELECT pg_temp.expect_proposal_author_denied(
  'b7000000-0000-4000-8000-000000000005', 'manufacturer co-member'
);
SELECT pg_temp.expect_proposal_author_denied(
  'b7000000-0000-4000-8000-000000000006', 'design_studio guest'
);
SELECT pg_temp.expect_proposal_author_denied(
  'b7000000-0000-4000-8000-000000000007', 'suspended design_studio peer'
);
SELECT pg_temp.expect_proposal_author_denied(
  'b7000000-0000-4000-8000-000000000008', 'suspended studio membership'
);
SELECT pg_temp.expect_proposal_author_denied(
  'b7000000-0000-4000-8000-000000000009', 'unrelated actor'
);

SELECT pg_temp.assume_proposal_owner();

-- RLS ownership plus a forged row GUC is still not send authority: the table
-- trigger also requires the SECURITY DEFINER current_user.
DO $$
DECLARE
  v_error text;
BEGIN
  PERFORM set_config(
    'app.proposal_send_id',
    'b7100000-0000-4000-8000-000000000003',
    true
  );
  BEGIN
    UPDATE public.proposals
    SET status = 'sent'
    WHERE id = 'b7100000-0000-4000-8000-000000000003';
  EXCEPTION WHEN check_violation THEN
    v_error := SQLERRM;
  END;
  PERFORM set_config('app.proposal_send_id', '', true);

  ASSERT v_error = 'proposals may only enter sent through send_proposal',
    format('direct sent transition should reject despite forged GUC, got %L', v_error);
  ASSERT (SELECT status = 'draft' FROM public.proposals
          WHERE id = 'b7100000-0000-4000-8000-000000000003'),
    'direct sent bypass must preserve draft';
END;
$$;

-- The canonical helper must enumerate every child used by the client-facing
-- proposal mirror. It remains internal: only the two checked definer RPCs call it.
DO $$
DECLARE
  v_source text := pg_get_functiondef(
    'public._proposal_review_fingerprint(uuid)'::regprocedure
  );
  v_table text;
BEGIN
  FOREACH v_table IN ARRAY ARRAY[
    'proposal_scope_rooms', 'proposal_items', 'proposal_palettes',
    'palette_swatches', 'proposal_boards', 'proposal_board_items',
    'proposal_phases', 'proposal_exclusions',
    'proposal_change_order_terms', 'proposal_payment_milestones'
  ] LOOP
    ASSERT position(v_table IN v_source) > 0,
      format('review fingerprint is missing %s', v_table);
  END LOOP;

  ASSERT NOT has_function_privilege(
    'authenticated', 'public._proposal_review_fingerprint(uuid)', 'EXECUTE'
  ), 'internal fingerprint helper must not be directly API-callable';
  ASSERT NOT has_function_privilege(
    'authenticated', 'public._can_author_proposal(uuid)', 'EXECUTE'
  ), 'private proposal-authority helper must not be directly API-callable';
  ASSERT has_function_privilege(
    'authenticated', 'public.get_proposal_send_snapshot(uuid)', 'EXECUTE'
  ), 'authenticated must execute the authorized snapshot';
  ASSERT has_function_privilege(
    'authenticated',
    'public.send_proposal(uuid,timestamptz,integer,text,text,text,timestamptz)',
    'EXECUTE'
  ), 'authenticated must execute the guarded send RPC';
  ASSERT NOT has_function_privilege(
    'anon',
    'public.send_proposal(uuid,timestamptz,integer,text,text,text,timestamptz)',
    'EXECUTE'
  ), 'anon must not execute send_proposal';
END;
$$;

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
DECLARE
  v_error text;
BEGIN
  ASSERT (
    SELECT count(*) = 0
    FROM public.get_proposal_send_snapshot(
      'b7100000-0000-4000-8000-000000000011'
    )
  ), 'snapshot RPC must preserve proposal RLS for a non-owner';

  BEGIN
    PERFORM public.send_proposal(
      'b7100000-0000-4000-8000-000000000011',
      now(), 100000, repeat('0', 32)
    );
  EXCEPTION WHEN insufficient_privilege THEN
    v_error := SQLERRM;
  END;
  ASSERT v_error =
    'send_proposal: proposal b7100000-0000-4000-8000-000000000011 not found or access denied',
    format('foreign send should be explicitly denied, got %L', v_error);
END;
$$;

-- Non-payment child changes also invalidate review even though their table
-- triggers do not touch proposals.updated_at. Scope is representative of a
-- top-level mirror child.
DO $$
DECLARE
  v_before record;
  v_after record;
  v_header_before timestamptz;
  v_error text;
BEGIN
  SELECT * INTO STRICT v_before
  FROM public.get_proposal_send_snapshot(
    'b7100000-0000-4000-8000-000000000009'
  );
  v_header_before := v_before.proposal_updated_at;

  UPDATE public.proposal_scope_rooms
  SET name = 'Client-reviewed great room'
  WHERE id = 'b7300000-0000-4000-8000-000000000009';

  SELECT * INTO STRICT v_after
  FROM public.get_proposal_send_snapshot(
    'b7100000-0000-4000-8000-000000000009'
  );
  ASSERT v_after.proposal_updated_at = v_header_before,
    'scope edit fixture must prove child changes do not bump proposal.updated_at';
  ASSERT v_after.schedule_fingerprint <> v_before.schedule_fingerprint,
    'scope room client-copy edit must change the reviewed token';

  BEGIN
    PERFORM public.send_proposal(
      'b7100000-0000-4000-8000-000000000009',
      v_before.proposal_updated_at,
      v_before.proposal_total_amount,
      v_before.schedule_fingerprint
    );
  EXCEPTION WHEN check_violation THEN
    v_error := SQLERRM;
  END;
  ASSERT v_error = 'proposal changed after send review; refresh and review again',
    format('scope mutation should reject stale reviewed token, got %L', v_error);
END;
$$;

-- A nested palette swatch is representative of children whose FK reaches the
-- proposal through another mirror row. The same canonical token catches it.
DO $$
DECLARE
  v_before record;
  v_after record;
  v_error text;
BEGIN
  SELECT * INTO STRICT v_before
  FROM public.get_proposal_send_snapshot(
    'b7100000-0000-4000-8000-000000000010'
  );

  UPDATE public.palette_swatches
  SET hex = '#C9B8A7'
  WHERE id = 'b7500000-0000-4000-8000-000000000010';

  SELECT * INTO STRICT v_after
  FROM public.get_proposal_send_snapshot(
    'b7100000-0000-4000-8000-000000000010'
  );
  ASSERT v_after.proposal_updated_at = v_before.proposal_updated_at,
    'swatch edit must leave proposal.updated_at unchanged in this fixture';
  ASSERT v_after.schedule_fingerprint <> v_before.schedule_fingerprint,
    'nested swatch client-copy edit must change the reviewed token';

  BEGIN
    PERFORM public.send_proposal(
      'b7100000-0000-4000-8000-000000000010',
      v_before.proposal_updated_at,
      v_before.proposal_total_amount,
      v_before.schedule_fingerprint
    );
  EXCEPTION WHEN check_violation THEN
    v_error := SQLERRM;
  END;
  ASSERT v_error = 'proposal changed after send review; refresh and review again',
    format('swatch mutation should reject stale reviewed token, got %L', v_error);
END;
$$;

-- Only draft is sendable. Retrying sent, or attempting to regress a viewed /
-- accepted / declined proposal back to sent, must fail before any child writes.
DO $$
DECLARE
  v_id uuid;
  v_before text;
  v_after text;
  v_error text;
  v_snapshot record;
BEGIN
  FOREACH v_id IN ARRAY ARRAY[
    'b7100000-0000-4000-8000-000000000012'::uuid,
    'b7100000-0000-4000-8000-000000000013'::uuid,
    'b7100000-0000-4000-8000-000000000014'::uuid,
    'b7100000-0000-4000-8000-000000000015'::uuid
  ] LOOP
    SELECT status INTO v_before FROM public.proposals WHERE id = v_id;
    SELECT * INTO STRICT v_snapshot
    FROM public.get_proposal_send_snapshot(v_id);
    v_error := NULL;
    BEGIN
      PERFORM public.send_proposal(
        v_id,
        v_snapshot.proposal_updated_at,
        v_snapshot.proposal_total_amount,
        v_snapshot.schedule_fingerprint
      );
    EXCEPTION WHEN check_violation THEN
      v_error := SQLERRM;
    END;
    SELECT status INTO v_after FROM public.proposals WHERE id = v_id;
    ASSERT v_error = 'proposal must be in draft status before sending',
      format('non-draft % should reject send, got %L', v_before, v_error);
    ASSERT v_after = v_before,
      format('send attempt regressed % to %', v_before, v_after);
  END LOOP;
END;
$$;

SELECT pg_temp.expect_send_failure(
  'b7100000-0000-4000-8000-000000000016',
  'proposal must be linked to a matching client relationship before sending'
);

-- Persisted amount is stale; percentage + proposal total are authoritative.
DO $$
DECLARE
  v_proposal public.proposals;
  v_amount integer;
  v_snapshot record;
BEGIN
  SELECT * INTO STRICT v_snapshot
  FROM public.get_proposal_send_snapshot(
    'b7100000-0000-4000-8000-000000000001'
  );
  ASSERT v_snapshot.schedule_fingerprint ~ '^[0-9a-f]{32}$',
    'snapshot must return an opaque deterministic md5 token';

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
