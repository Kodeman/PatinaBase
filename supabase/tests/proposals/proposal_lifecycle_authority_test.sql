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
VALUES
  (
    'e7200000-0000-4000-8000-000000000001',
    'e7000000-0000-4000-8000-000000000001',
    'e7000000-0000-4000-8000-000000000002',
    'Lifecycle Client', 'proposal', 'direct'
  ),
  (
    -- Same pair, different engagement. Its lower id reproduces the old
    -- arbitrary ORDER BY created_at,id lookup choosing the wrong relation.
    'e7190000-0000-4000-8000-000000000001',
    'e7000000-0000-4000-8000-000000000001',
    'e7000000-0000-4000-8000-000000000002',
    'Lifecycle Client Duplicate', 'lead', 'direct'
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
GRANT EXECUTE ON FUNCTION pg_temp.assume_proposal_lifecycle_actor(uuid, text) TO PUBLIC;

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

-- Feedback and reminder metadata have their own exact row capabilities. An
-- authenticated proposal writer cannot forge those capabilities directly;
-- the row-locked reminder RPC remains functional and enforces cooldown.
DO $$
DECLARE
  v_error text;
  v_stamp timestamptz;
BEGIN
  PERFORM set_config(
    'app.proposal_feedback_id',
    'e7300000-0000-4000-8000-000000000001', true
  );
  BEGIN
    UPDATE public.proposals
    SET client_feedback = 'forged feedback'
    WHERE id = 'e7300000-0000-4000-8000-000000000001';
  EXCEPTION WHEN check_violation THEN
    v_error := SQLERRM;
  END;
  PERFORM set_config('app.proposal_feedback_id', '', true);
  ASSERT v_error =
    'proposal client feedback may only change through request_proposal_change',
    format('direct feedback metadata should reject, got %L', v_error);

  v_error := NULL;
  PERFORM set_config(
    'app.proposal_nudge_id',
    'e7300000-0000-4000-8000-000000000007', true
  );
  BEGIN
    UPDATE public.proposals
    SET last_nudged_at = now(), nudge_count = 99
    WHERE id = 'e7300000-0000-4000-8000-000000000007';
  EXCEPTION WHEN check_violation THEN
    v_error := SQLERRM;
  END;
  PERFORM set_config('app.proposal_nudge_id', '', true);
  ASSERT v_error = 'proposal nudge state may only change through nudge_proposal',
    format('direct nudge metadata should reject, got %L', v_error);

  v_stamp := public.nudge_proposal(
    'e7300000-0000-4000-8000-000000000007'
  );
  ASSERT v_stamp IS NOT NULL, 'canonical nudge must return its timestamp receipt';
  v_error := NULL;
  BEGIN
    PERFORM public.nudge_proposal(
      'e7300000-0000-4000-8000-000000000007'
    );
  EXCEPTION WHEN check_violation THEN
    v_error := SQLERRM;
  END;
  ASSERT v_error LIKE 'nudge_proposal: proposal % wait before nudging again',
    format('nudge cooldown should reject the retry, got %L', v_error);
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

-- The legacy client UPDATE RLS policy is gone. A client-forged lifecycle write
-- now sees zero writable rows even when it also forges the private row token.
SELECT pg_temp.assume_proposal_lifecycle_actor(
  'e7000000-0000-4000-8000-000000000002'
);
DO $$
DECLARE
  v_error text;
  v_rows integer;
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
    GET DIAGNOSTICS v_rows = ROW_COUNT;
  EXCEPTION WHEN check_violation THEN
    v_error := SQLERRM;
  END;
  PERFORM set_config('app.proposal_decline_id', '', true);
  ASSERT v_error IS NULL,
    format('client-forged decline should be filtered by RLS, got %L', v_error);
  ASSERT v_rows = 0,
    format('client-forged decline should affect zero rows, got %s', v_rows);
  ASSERT public.get_client_proposal_bundle(
           'e7300000-0000-4000-8000-000000000009'
         ) #>> '{proposal,status}' = 'sent',
    'client-forged decline must preserve the issued client-safe copy';
END;
$$;

-- Canonical client view, decline, and electronic signature remain functional.
DO $$
DECLARE
  v_viewed jsonb;
  v_viewed_at timestamptz;
  v_declined jsonb;
  v_signed jsonb;
  v_forbidden text;
BEGIN
  v_viewed := public.mark_proposal_viewed(
    'e7300000-0000-4000-8000-000000000002'
  );
  v_viewed_at := (v_viewed->>'viewed_at')::timestamptz;
  ASSERT v_viewed->>'status' = 'viewed' AND v_viewed_at IS NOT NULL,
    'canonical client view must stamp viewed status/time';
  v_viewed := public.mark_proposal_viewed(
    'e7300000-0000-4000-8000-000000000002'
  );
  ASSERT (v_viewed->>'viewed_at')::timestamptz = v_viewed_at,
    'canonical view retry must preserve the first viewed_at';

  v_declined := public.decline_proposal(
    'e7300000-0000-4000-8000-000000000003', '  Not the right fit  '
  );
  ASSERT v_declined->>'status' = 'declined'
         AND v_declined->>'declined_at' IS NOT NULL,
    'canonical decline must atomically stamp decline state';

  PERFORM public.request_proposal_change(
    'e7300000-0000-4000-8000-000000000009',
    '  Please revise the install allowance  '
  );

  v_signed := public.sign_proposal(
    'e7300000-0000-4000-8000-000000000004',
    'Lifecycle Client'
  );
  ASSERT v_signed->>'status' = 'accepted'
         AND v_signed->>'accepted_at' IS NOT NULL
         AND v_signed->>'signed_at' IS NOT NULL
         AND v_signed->>'project_id' IS NOT NULL,
    'canonical electronic signature must return safe accepted state';

  FOREACH v_forbidden IN ARRAY ARRAY[
    'client_id', 'designer_id', 'cc_email', 'signed_by_name', 'signed_ip',
    'decline_reason', 'proposal_send_dispatch_id'
  ] LOOP
    ASSERT NOT (v_viewed ? v_forbidden),
      format('mark_proposal_viewed leaked %s: %s', v_forbidden, v_viewed);
    ASSERT NOT (v_declined ? v_forbidden),
      format('decline_proposal leaked %s: %s', v_forbidden, v_declined);
    ASSERT NOT (v_signed ? v_forbidden),
      format('sign_proposal leaked %s: %s', v_forbidden, v_signed);
  END LOOP;
END;
$$;

-- A service-role table writer is still not postgres and cannot turn a forged
-- exact expiry token into terminal-state authority.
RESET ROLE;
DO $$
BEGIN
  ASSERT (SELECT decline_reason = 'Not the right fit'
                 AND declined_at IS NOT NULL
          FROM public.proposals
          WHERE id = 'e7300000-0000-4000-8000-000000000003'),
    'canonical decline must persist its normalized reason internally';
  ASSERT (SELECT signed_by_name = 'Lifecycle Client'
                 AND signed_ip IS NULL
                 AND signed_at IS NOT NULL
                 AND accepted_at IS NOT NULL
          FROM public.proposals
          WHERE id = 'e7300000-0000-4000-8000-000000000004'),
    'canonical signature must persist legal/audit fields internally';
  ASSERT (SELECT client_feedback = 'Please revise the install allowance'
          FROM public.proposals
          WHERE id = 'e7300000-0000-4000-8000-000000000009'),
    'canonical change request must persist normalized client feedback';
  ASSERT (SELECT last_nudged_at IS NOT NULL AND nudge_count = 1
          FROM public.proposals
          WHERE id = 'e7300000-0000-4000-8000-000000000007'),
    'canonical nudge must persist exactly one reminder stamp';
  ASSERT (SELECT designer_client_id =
                 'e7200000-0000-4000-8000-000000000001'
          FROM public.client_decisions
          WHERE linked_proposal_id = 'e7300000-0000-4000-8000-000000000004'
            AND decision_type = 'approval'),
    'electronic signature must bind the proposal exact relationship';
END;
$$;
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
  ASSERT (SELECT designer_client_id =
                 'e7200000-0000-4000-8000-000000000001'
          FROM public.client_decisions
          WHERE linked_proposal_id = 'e7300000-0000-4000-8000-000000000005'
            AND decision_type = 'approval'),
    'paper signature must bind the proposal exact relationship';
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
    'authenticated', 'public.sign_proposal(uuid,text)', 'EXECUTE'
  ), 'authenticated must execute sign_proposal';
  ASSERT pg_get_function_result(
           'public.mark_proposal_viewed(uuid)'::regprocedure
         ) = 'jsonb'
     AND pg_get_function_result(
           'public.decline_proposal(uuid,text)'::regprocedure
         ) = 'jsonb'
     AND pg_get_function_result(
           'public.sign_proposal(uuid,text)'::regprocedure
         ) = 'jsonb',
    'client lifecycle authorities must never return raw proposal composites';
  ASSERT to_regprocedure(
           'public.sign_proposal(uuid,text,text,boolean,date)'
         ) IS NULL,
    'legacy caller-controlled signature overload must not exist';
  ASSERT has_function_privilege(
           'service_role',
           'public.sign_proposal_with_trusted_ip(uuid,text,uuid,text)',
           'EXECUTE'
         )
     AND NOT has_function_privilege(
           'authenticated',
           'public.sign_proposal_with_trusted_ip(uuid,text,uuid,text)',
           'EXECUTE'
         ),
    'trusted signature evidence path must be service-role only';
  ASSERT NOT has_function_privilege(
    'authenticated', 'public._mark_proposal_viewed_impl(uuid)', 'EXECUTE'
  ), 'authenticated must not execute the raw view implementation';
  ASSERT NOT has_function_privilege(
    'authenticated', 'public._decline_proposal_impl(uuid,text)', 'EXECUTE'
  ), 'authenticated must not execute the raw decline implementation';
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
