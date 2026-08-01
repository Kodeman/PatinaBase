-- proposal lifecycle table-authority regression (00387)
-- Run:
--   psql 'postgresql://postgres:postgres@127.0.0.1:54322/postgres' \
--     -v ON_ERROR_STOP=1 -f supabase/tests/proposals/proposal_lifecycle_authority_test.sql

BEGIN;

INSERT INTO auth.users (
  id, email, encrypted_password, email_confirmed_at, created_at, updated_at,
  instance_id, aud, role
)
VALUES
  ('e7000000-0000-4000-8000-000000000001', 'lifecycle-owner@test.invalid', '', NOW(), NOW(), NOW(),
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('e7000000-0000-4000-8000-000000000002', 'lifecycle-client@test.invalid', '', NOW(), NOW(), NOW(),
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('e7000000-0000-4000-8000-000000000003', 'lifecycle-peer@test.invalid', '', NOW(), NOW(), NOW(),
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');

INSERT INTO public.profiles (id, email, full_name, created_at, updated_at)
VALUES
  ('e7000000-0000-4000-8000-000000000001', 'lifecycle-owner@test.invalid', 'Lifecycle Owner', NOW(), NOW()),
  ('e7000000-0000-4000-8000-000000000002', 'lifecycle-client@test.invalid', 'Lifecycle Client', NOW(), NOW()),
  ('e7000000-0000-4000-8000-000000000003', 'lifecycle-peer@test.invalid', 'Lifecycle Peer', NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.organizations (id, type, name, slug)
VALUES (
  'e7100000-0000-4000-8000-000000000001',
  'design_studio', 'Lifecycle Studio', 'lifecycle-studio'
);

INSERT INTO public.organization_members (
  id, user_id, organization_id, role, status, joined_at
)
VALUES
  ('e7110000-0000-4000-8000-000000000001',
   'e7000000-0000-4000-8000-000000000001',
   'e7100000-0000-4000-8000-000000000001', 'owner', 'active', NOW()),
  ('e7110000-0000-4000-8000-000000000002',
   'e7000000-0000-4000-8000-000000000003',
   'e7100000-0000-4000-8000-000000000001', 'member', 'active', NOW());

INSERT INTO public.designer_clients (
  id, designer_id, client_id, client_name, status, source
)
VALUES (
  'e7200000-0000-4000-8000-000000000001',
  'e7000000-0000-4000-8000-000000000001',
  'e7000000-0000-4000-8000-000000000002',
  'Lifecycle Client', 'proposal', 'direct'
);

-- Trusted fixture setup may materialize historical lifecycle states; every
-- untrusted UPDATE below still passes through the installed table guard.
INSERT INTO public.proposals (
  id, designer_id, designer_client_id, client_id, title, total_amount,
  status, sent_at, valid_until
)
VALUES
  ('e7300000-0000-4000-8000-000000000001',
   'e7000000-0000-4000-8000-000000000001',
   'e7200000-0000-4000-8000-000000000001',
   'e7000000-0000-4000-8000-000000000002',
   'Draft forgery target', 100000, 'draft', NULL, now() + interval '30 days'),
  ('e7300000-0000-4000-8000-000000000002',
   'e7000000-0000-4000-8000-000000000001',
   'e7200000-0000-4000-8000-000000000001',
   'e7000000-0000-4000-8000-000000000002',
   'Client view target', 100000, 'sent', now(), now() + interval '30 days'),
  ('e7300000-0000-4000-8000-000000000003',
   'e7000000-0000-4000-8000-000000000001',
   'e7200000-0000-4000-8000-000000000001',
   'e7000000-0000-4000-8000-000000000002',
   'Client decline target', 100000, 'sent', now(), now() + interval '30 days'),
  ('e7300000-0000-4000-8000-000000000004',
   'e7000000-0000-4000-8000-000000000001',
   'e7200000-0000-4000-8000-000000000001',
   'e7000000-0000-4000-8000-000000000002',
   'Client sign target', 100000, 'sent', now(), now() + interval '30 days'),
  ('e7300000-0000-4000-8000-000000000005',
   'e7000000-0000-4000-8000-000000000001',
   'e7200000-0000-4000-8000-000000000001',
   'e7000000-0000-4000-8000-000000000002',
   'Offline sign target', 100000, 'expired', now() - interval '60 days', now() - interval '30 days'),
  ('e7300000-0000-4000-8000-000000000006',
   'e7000000-0000-4000-8000-000000000001',
   'e7200000-0000-4000-8000-000000000001',
   'e7000000-0000-4000-8000-000000000002',
   'Due expiry target', 100000, 'sent', now() - interval '60 days', now() - interval '1 day'),
  ('e7300000-0000-4000-8000-000000000007',
   'e7000000-0000-4000-8000-000000000001',
   'e7200000-0000-4000-8000-000000000001',
   'e7000000-0000-4000-8000-000000000002',
   'Future expiry target', 100000, 'sent', now(), now() + interval '30 days'),
  ('e7300000-0000-4000-8000-000000000008',
   'e7000000-0000-4000-8000-000000000001',
   'e7200000-0000-4000-8000-000000000001',
   'e7000000-0000-4000-8000-000000000002',
   'Revision target', 100000, 'viewed', now(), now() + interval '30 days'),
  ('e7300000-0000-4000-8000-000000000009',
   'e7000000-0000-4000-8000-000000000001',
   'e7200000-0000-4000-8000-000000000001',
   'e7000000-0000-4000-8000-000000000002',
   'Client forged decline target', 100000, 'sent', now(), now() + interval '30 days');

CREATE OR REPLACE FUNCTION pg_temp.assume_proposal_lifecycle_actor(
  p_actor uuid,
  p_role text DEFAULT 'authenticated'
)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', p_actor, 'role', p_role)::text,
    true
  );
END;
$$;

SET LOCAL ROLE authenticated;
SELECT pg_temp.assume_proposal_lifecycle_actor(
  'e7000000-0000-4000-8000-000000000001'
);

-- Lifecycle fields cannot be preloaded onto an otherwise valid authenticated
-- draft insert.
DO $$
DECLARE
  v_error text;
BEGIN
  BEGIN
    INSERT INTO public.proposals (
      id, designer_id, designer_client_id, client_id, title, total_amount,
      status, accepted_at
    ) VALUES (
      'e7300000-0000-4000-8000-000000000010',
      'e7000000-0000-4000-8000-000000000001',
      'e7200000-0000-4000-8000-000000000001',
      'e7000000-0000-4000-8000-000000000002',
      'Pre-stamped draft', 100000, 'draft', now()
    );
  EXCEPTION WHEN check_violation THEN
    v_error := SQLERRM;
  END;
  ASSERT v_error = 'proposal inserts must start as draft without lifecycle state',
    format('pre-stamped authenticated draft should reject, got %L', v_error);
  ASSERT NOT EXISTS (
    SELECT 1 FROM public.proposals
    WHERE id = 'e7300000-0000-4000-8000-000000000010'
  ), 'rejected pre-stamped draft insert must leave no row';
END;
$$;

-- Protect each lifecycle stamp independently of a status transition; otherwise
-- a writer could fabricate terminal evidence while leaving the row draft.
DO $$
DECLARE
  v_error text;
BEGIN
  BEGIN
    UPDATE public.proposals SET accepted_at = now()
    WHERE id = 'e7300000-0000-4000-8000-000000000001';
  EXCEPTION WHEN check_violation THEN
    v_error := SQLERRM;
  END;
  ASSERT v_error =
    'proposal acceptance state may only change through canonical signature authority',
    format('direct accepted_at stamp should reject, got %L', v_error);

  v_error := NULL;
  BEGIN
    UPDATE public.proposals SET viewed_at = now()
    WHERE id = 'e7300000-0000-4000-8000-000000000001';
  EXCEPTION WHEN check_violation THEN
    v_error := SQLERRM;
  END;
  ASSERT v_error =
    'proposal viewed_at may only change through mark_proposal_viewed',
    format('direct viewed_at stamp should reject, got %L', v_error);

  v_error := NULL;
  BEGIN
    UPDATE public.proposals SET declined_at = now()
    WHERE id = 'e7300000-0000-4000-8000-000000000001';
  EXCEPTION WHEN check_violation THEN
    v_error := SQLERRM;
  END;
  ASSERT v_error = 'proposal decline state may only change through decline_proposal',
    format('direct declined_at stamp should reject, got %L', v_error);
END;
$$;

-- A forged accepted state must fail at the table, remain draft, and therefore
-- remain unusable as the precondition for activate_proposal_as_project.
DO $$
DECLARE
  v_error text;
BEGIN
  BEGIN
    UPDATE public.proposals
    SET status = 'accepted', accepted_at = now(), signed_at = now()
    WHERE id = 'e7300000-0000-4000-8000-000000000001';
  EXCEPTION WHEN check_violation THEN
    v_error := SQLERRM;
  END;
  ASSERT v_error =
    'proposal status may only change through its canonical lifecycle authority',
    format('direct draft→accepted should reject, got %L', v_error);
  ASSERT (SELECT status = 'draft' AND accepted_at IS NULL AND signed_at IS NULL
          FROM public.proposals
          WHERE id = 'e7300000-0000-4000-8000-000000000001'),
    'rejected acceptance forgery must preserve inert draft state';

  v_error := NULL;
  BEGIN
    PERFORM public.activate_proposal_as_project(
      'e7300000-0000-4000-8000-000000000001', current_date
    );
  EXCEPTION WHEN OTHERS THEN
    v_error := SQLERRM;
  END;
  ASSERT v_error =
    'Proposal e7300000-0000-4000-8000-000000000001 not found or not in accepted status',
    format('forged draft must not satisfy activation, got %L', v_error);
  ASSERT NOT EXISTS (
    SELECT 1 FROM public.projects
    WHERE proposal_id = 'e7300000-0000-4000-8000-000000000001'
  ), 'failed forged activation must leave no project';
END;
$$;

-- A studio peer remains authenticated at the invoker guard. The exact accept
-- token cannot be used to seize lifecycle authority.
SELECT pg_temp.assume_proposal_lifecycle_actor(
  'e7000000-0000-4000-8000-000000000003'
);
DO $$
DECLARE
  v_error text;
BEGIN
  PERFORM set_config(
    'app.proposal_accept_id',
    'e7300000-0000-4000-8000-000000000001',
    true
  );
  BEGIN
    UPDATE public.proposals
    SET status = 'accepted', accepted_at = now()
    WHERE id = 'e7300000-0000-4000-8000-000000000001';
  EXCEPTION WHEN check_violation THEN
    v_error := SQLERRM;
  END;
  PERFORM set_config('app.proposal_accept_id', '', true);
  ASSERT v_error =
    'proposal status may only change through its canonical lifecycle authority',
    format('studio forged accept token should reject, got %L', v_error);
END;
$$;

-- The legacy client UPDATE RLS policy no longer confers lifecycle authority.
SELECT pg_temp.assume_proposal_lifecycle_actor(
  'e7000000-0000-4000-8000-000000000002'
);
DO $$
DECLARE
  v_error text;
BEGIN
  PERFORM set_config(
    'app.proposal_decline_id',
    'e7300000-0000-4000-8000-000000000009',
    true
  );
  BEGIN
    UPDATE public.proposals
    SET status = 'declined', declined_at = now(), decline_reason = 'forged'
    WHERE id = 'e7300000-0000-4000-8000-000000000009';
  EXCEPTION WHEN check_violation THEN
    v_error := SQLERRM;
  END;
  PERFORM set_config('app.proposal_decline_id', '', true);
  ASSERT v_error =
    'proposal status may only change through its canonical lifecycle authority',
    format('client forged decline token should reject, got %L', v_error);
END;
$$;

-- Canonical client view, decline, and electronic signature remain functional.
DO $$
DECLARE
  v_viewed public.proposals;
  v_viewed_at timestamptz;
  v_declined public.proposals;
  v_signed public.proposals;
BEGIN
  v_viewed := public.mark_proposal_viewed(
    'e7300000-0000-4000-8000-000000000002'
  );
  v_viewed_at := v_viewed.viewed_at;
  ASSERT v_viewed.status = 'viewed' AND v_viewed_at IS NOT NULL,
    'canonical client view must stamp viewed status/time';
  v_viewed := public.mark_proposal_viewed(
    'e7300000-0000-4000-8000-000000000002'
  );
  ASSERT v_viewed.viewed_at = v_viewed_at,
    'canonical view retry must preserve the first viewed_at';

  v_declined := public.decline_proposal(
    'e7300000-0000-4000-8000-000000000003', '  Not the right fit  '
  );
  ASSERT v_declined.status = 'declined'
         AND v_declined.declined_at IS NOT NULL
         AND v_declined.decline_reason = 'Not the right fit',
    'canonical decline must atomically stamp normalized decline state';

  v_signed := public.sign_proposal(
    'e7300000-0000-4000-8000-000000000004',
    'Lifecycle Client', '203.0.113.42', false, current_date
  );
  ASSERT v_signed.status = 'accepted'
         AND v_signed.accepted_at IS NOT NULL
         AND v_signed.signed_at IS NOT NULL
         AND v_signed.signed_by_name = 'Lifecycle Client'
         AND v_signed.signed_ip = '203.0.113.42',
    'canonical electronic signature must retain accepted/signature state';
END;
$$;

-- A service-role table writer is still not postgres and cannot turn a forged
-- exact expiry token into terminal-state authority.
RESET ROLE;
SET LOCAL ROLE service_role;
SELECT pg_temp.assume_proposal_lifecycle_actor(NULL, 'service_role');
DO $$
DECLARE
  v_error text;
BEGIN
  PERFORM set_config(
    'app.proposal_expire_id',
    'e7300000-0000-4000-8000-000000000007',
    true
  );
  BEGIN
    UPDATE public.proposals
    SET status = 'expired'
    WHERE id = 'e7300000-0000-4000-8000-000000000007';
  EXCEPTION WHEN check_violation THEN
    v_error := SQLERRM;
  END;
  PERFORM set_config('app.proposal_expire_id', '', true);
  ASSERT v_error =
    'proposal status may only change through its canonical lifecycle authority',
    format('service forged expiry token should reject, got %L', v_error);
END;
$$;

-- The private system authority expires due rows one-by-one with their exact ids.
RESET ROLE;
DO $$
DECLARE
  v_count integer;
BEGIN
  v_count := public.expire_proposals();
  ASSERT v_count >= 1, 'expiry authority must report at least the due fixture';
  ASSERT (SELECT status = 'expired' FROM public.proposals
          WHERE id = 'e7300000-0000-4000-8000-000000000006'),
    'due proposal must expire through the private system authority';
  ASSERT (SELECT status = 'sent' FROM public.proposals
          WHERE id = 'e7300000-0000-4000-8000-000000000007'),
    'future proposal must remain sent';
END;
$$;

-- Paper acceptance and studio-authorized revision remain canonical flows.
SET LOCAL ROLE authenticated;
SELECT pg_temp.assume_proposal_lifecycle_actor(
  'e7000000-0000-4000-8000-000000000001'
);
DO $$
BEGIN
  PERFORM public.record_offline_signature(
    'e7300000-0000-4000-8000-000000000005',
    'Paper Client', false, current_date
  );
  ASSERT (SELECT status = 'accepted'
                 AND accepted_at IS NOT NULL
                 AND signed_at IS NOT NULL
                 AND signed_by_name = 'Paper Client'
          FROM public.proposals
          WHERE id = 'e7300000-0000-4000-8000-000000000005'),
    'canonical offline signature must retain accepted/signature state';
END;
$$;

SELECT pg_temp.assume_proposal_lifecycle_actor(
  'e7000000-0000-4000-8000-000000000003'
);
DO $$
DECLARE
  v_revised public.proposals;
BEGIN
  v_revised := public.begin_proposal_revision(
    'e7300000-0000-4000-8000-000000000008'
  );
  ASSERT v_revised.status = 'revised',
    'active studio peer must retain canonical revision authority';
END;
$$;

DO $$
BEGIN
  ASSERT has_function_privilege(
    'authenticated', 'public.mark_proposal_viewed(uuid)', 'EXECUTE'
  ), 'authenticated must execute mark_proposal_viewed';
  ASSERT has_function_privilege(
    'authenticated', 'public.decline_proposal(uuid,text)', 'EXECUTE'
  ), 'authenticated must execute decline_proposal';
  ASSERT has_function_privilege(
    'authenticated', 'public.begin_proposal_revision(uuid)', 'EXECUTE'
  ), 'authenticated must execute begin_proposal_revision';
  ASSERT NOT has_function_privilege(
    'anon', 'public.mark_proposal_viewed(uuid)', 'EXECUTE'
  ), 'anon must not execute mark_proposal_viewed';
  ASSERT NOT has_function_privilege(
    'public', 'public.decline_proposal(uuid,text)', 'EXECUTE'
  ), 'PUBLIC must not execute decline_proposal';
  ASSERT NOT has_function_privilege(
    'authenticated', 'public.expire_proposals()', 'EXECUTE'
  ), 'authenticated must not execute private expiry authority';
  ASSERT NOT has_function_privilege(
    'service_role', 'public.expire_proposals()', 'EXECUTE'
  ), 'service_role must not execute private expiry authority';
END;
$$;

ROLLBACK;
