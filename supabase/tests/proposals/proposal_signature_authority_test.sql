-- proposal signature input, evidence, retry, and rollback authority (00400)
-- Integration prerequisite: 00399 journey authority includes
-- reassign_project_lead(uuid,uuid,uuid).
-- Run:
--   psql 'postgresql://postgres:postgres@127.0.0.1:54322/postgres' \
--     -v ON_ERROR_STOP=1 \
--     -f supabase/tests/proposals/proposal_signature_authority_test.sql

BEGIN;

INSERT INTO auth.users (
  id, email, encrypted_password, email_confirmed_at, created_at, updated_at,
  instance_id, aud, role
)
VALUES
  ('fa000000-0000-4000-8000-000000000001', 'signature-owner@test.invalid', '', now(), now(), now(),
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('fa000000-0000-4000-8000-000000000002', 'signature-client@test.invalid', '', now(), now(), now(),
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('fa000000-0000-4000-8000-000000000003', 'signature-new-lead@test.invalid', '', now(), now(), now(),
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('fa000000-0000-4000-8000-000000000004', 'signature-outsider@test.invalid', '', now(), now(), now(),
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');

INSERT INTO public.profiles (
  id, email, full_name, is_designer, created_at, updated_at
)
VALUES
  ('fa000000-0000-4000-8000-000000000001', 'signature-owner@test.invalid', 'Signature Owner', true, now(), now()),
  ('fa000000-0000-4000-8000-000000000002', 'signature-client@test.invalid', 'Signature Client', false, now(), now()),
  ('fa000000-0000-4000-8000-000000000003', 'signature-new-lead@test.invalid', 'Signature New Lead', true, now(), now()),
  ('fa000000-0000-4000-8000-000000000004', 'signature-outsider@test.invalid', 'Signature Outsider', false, now(), now())
ON CONFLICT (id) DO UPDATE
SET email = EXCLUDED.email,
    full_name = EXCLUDED.full_name,
    is_designer = EXCLUDED.is_designer,
    updated_at = EXCLUDED.updated_at;

INSERT INTO public.organizations (id, type, name, slug, status)
VALUES
  ('fa100000-0000-4000-8000-000000000001',
   'design_studio', 'Signature Studio', 'signature-authority-studio', 'active'),
  ('fa100000-0000-4000-8000-000000000002',
   'design_studio', 'Foreign Signature Studio',
   'foreign-signature-authority-studio', 'active');

-- Seed the fixture's original + backup owners through the same service-role
-- bypass used by trusted provisioning. The backup lets the lifecycle test
-- model the historical author's departure without violating last-owner truth.
SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);
INSERT INTO public.organization_members (
  id, user_id, organization_id, role, status, joined_at
)
VALUES
  ('fa110000-0000-4000-8000-000000000001',
   'fa000000-0000-4000-8000-000000000001',
   'fa100000-0000-4000-8000-000000000001', 'owner', 'active',
   now() - interval '1 day'),
  ('fa110000-0000-4000-8000-000000000002',
   'fa000000-0000-4000-8000-000000000003',
   'fa100000-0000-4000-8000-000000000001', 'member', 'active', now()),
  ('fa110000-0000-4000-8000-000000000003',
   'fa000000-0000-4000-8000-000000000004',
   'fa100000-0000-4000-8000-000000000001', 'owner', 'active', now());
SELECT set_config('request.jwt.claims', '{}', true);

INSERT INTO public.designer_clients (
  id, designer_id, client_id, client_name, status, source
)
VALUES (
  'fa200000-0000-4000-8000-000000000001',
  'fa000000-0000-4000-8000-000000000001',
  'fa000000-0000-4000-8000-000000000002',
  'Signature Client', 'proposal', 'direct'
);

INSERT INTO public.proposals (
  id, designer_id, designer_client_id, client_id, title, total_amount,
  status, sent_at, valid_until, accepted_at, signed_at, signed_by_name,
  signed_ip
)
VALUES
  ('fa300000-0000-4000-8000-000000000001',
   'fa000000-0000-4000-8000-000000000001',
   'fa200000-0000-4000-8000-000000000001',
   'fa000000-0000-4000-8000-000000000002',
   'Browser signature', 100000, 'sent', now(), now() + interval '30 days',
   NULL, NULL, NULL, NULL),
  ('fa300000-0000-4000-8000-000000000002',
   'fa000000-0000-4000-8000-000000000001',
   'fa200000-0000-4000-8000-000000000001',
   'fa000000-0000-4000-8000-000000000002',
   'Trusted route signature', 100000, 'sent', now(), now() + interval '30 days',
   NULL, NULL, NULL, NULL),
  ('fa300000-0000-4000-8000-000000000003',
   'fa000000-0000-4000-8000-000000000001',
   'fa200000-0000-4000-8000-000000000001',
   'fa000000-0000-4000-8000-000000000002',
   'Accepted repair', 100000, 'accepted', now() - interval '10 days',
   now() - interval '1 day', now() - interval '1 day',
   now() - interval '1 day', 'Original Accepted Name', '192.0.2.17'),
  ('fa300000-0000-4000-8000-000000000004',
   'fa000000-0000-4000-8000-000000000001',
   'fa200000-0000-4000-8000-000000000001',
   'fa000000-0000-4000-8000-000000000002',
   'Wrong actor', 100000, 'sent', now(), now() + interval '30 days',
   NULL, NULL, NULL, NULL),
  ('fa300000-0000-4000-8000-000000000005',
   'fa000000-0000-4000-8000-000000000001',
   'fa200000-0000-4000-8000-000000000001',
   'fa000000-0000-4000-8000-000000000002',
   'Rollback on topology failure', 100000, 'draft', NULL, now() + interval '30 days',
   NULL, NULL, NULL, NULL),
  ('fa300000-0000-4000-8000-000000000006',
   'fa000000-0000-4000-8000-000000000001',
   'fa200000-0000-4000-8000-000000000001',
   'fa000000-0000-4000-8000-000000000002',
   'Foreign studio detached project', 100000, 'accepted',
   now() - interval '10 days', now() - interval '1 day',
   now() - interval '1 day', now() - interval '1 day',
   'Foreign Studio Evidence', '192.0.2.18');

-- Materialize the historical consent that makes the accepted/no-project row a
-- safe repair candidate. The installed decision guard requires its exact row
-- capability even for trusted fixtures.
SELECT set_config(
  'app.client_decision_insert_id',
  'fa400000-0000-4000-8000-000000000003',
  true
);
INSERT INTO public.client_decisions (
  id, designer_client_id, designer_id, linked_proposal_id, title,
  decision_type, blocking_status, status, client_consent_method,
  client_signature, client_consented_at, sent_at, responded_at, selected_by
)
VALUES (
  'fa400000-0000-4000-8000-000000000003',
  'fa200000-0000-4000-8000-000000000001',
  'fa000000-0000-4000-8000-000000000001',
  'fa300000-0000-4000-8000-000000000003',
  'Proposal approval', 'approval', 'non_blocking', 'responded',
  'electronic_signature', 'Original Accepted Name', now() - interval '1 day',
  now() - interval '10 days', now() - interval '1 day',
  'fa000000-0000-4000-8000-000000000002'
);
SELECT set_config('app.client_decision_insert_id', '', true);

SELECT set_config(
  'app.client_decision_insert_id',
  'fa400000-0000-4000-8000-000000000006',
  true
);
INSERT INTO public.client_decisions (
  id, designer_client_id, designer_id, linked_proposal_id, title,
  decision_type, blocking_status, status, client_consent_method,
  client_signature, client_consented_at, sent_at, responded_at, selected_by
)
VALUES (
  'fa400000-0000-4000-8000-000000000006',
  'fa200000-0000-4000-8000-000000000001',
  'fa000000-0000-4000-8000-000000000001',
  'fa300000-0000-4000-8000-000000000006',
  'Proposal approval', 'approval', 'non_blocking', 'responded',
  'electronic_signature', 'Foreign Studio Evidence', now() - interval '1 day',
  now() - interval '1 day', now() - interval '1 day',
  'fa000000-0000-4000-8000-000000000002'
);
SELECT set_config('app.client_decision_insert_id', '', true);

-- Accepted repair recognizes only the durable engagement receipt written by
-- the same canonical signing transaction. These trusted fixtures use the same
-- exact-row capability enforced for the real online/offline signing paths.
SELECT set_config(
  'app.proposal_signature_engagement_id',
  'fa700000-0000-4000-8000-000000000003',
  true
);
INSERT INTO public.proposal_engagement (
  id, proposal_id, viewer_id, event_type, metadata, created_at
)
VALUES (
  'fa700000-0000-4000-8000-000000000003',
  'fa300000-0000-4000-8000-000000000003',
  'fa000000-0000-4000-8000-000000000002',
  'signed',
  jsonb_build_object(
    'via', 'sign_proposal',
    'signed_by_name', 'Original Accepted Name',
    'signed_ip', '192.0.2.17'
  ),
  now() - interval '1 day'
);
SELECT set_config('app.proposal_signature_engagement_id', '', true);

SELECT set_config(
  'app.proposal_signature_engagement_id',
  'fa700000-0000-4000-8000-000000000006',
  true
);
INSERT INTO public.proposal_engagement (
  id, proposal_id, viewer_id, event_type, metadata, created_at
)
VALUES (
  'fa700000-0000-4000-8000-000000000006',
  'fa300000-0000-4000-8000-000000000006',
  'fa000000-0000-4000-8000-000000000002',
  'signed',
  jsonb_build_object(
    'via', 'sign_proposal',
    'signed_by_name', 'Foreign Studio Evidence',
    'signed_ip', '192.0.2.18'
  ),
  now() - interval '1 day'
);
SELECT set_config('app.proposal_signature_engagement_id', '', true);

-- A trusted fixture can reproduce a legacy detached project whose proposal and
-- client match but whose studio has no relationship to the immutable proposal
-- author. The retry authority must reject this as non-canonical provenance.
SELECT set_config(
  'app.proposal_activation_id',
  'fa300000-0000-4000-8000-000000000006',
  true
);
INSERT INTO public.projects (
  id, proposal_id, designer_id, client_id, studio_id, name, status, created_by
)
VALUES (
  'fa600000-0000-4000-8000-000000000006',
  'fa300000-0000-4000-8000-000000000006',
  'fa000000-0000-4000-8000-000000000001',
  'fa000000-0000-4000-8000-000000000002',
  'fa100000-0000-4000-8000-000000000002',
  'Foreign detached project', 'active',
  'fa000000-0000-4000-8000-000000000001'
);
SELECT set_config('app.proposal_activation_id', '', true);
SELECT set_config('app.project_phase_batch_token', '', true);

-- A two-node cycle makes the activation bridge's final topology assertion fail.
-- The signing statement must roll back its proposal, consent, engagement, and
-- partial project writes together.
INSERT INTO public.proposal_phases (
  id, proposal_id, name, phase_key, duration_days, lane, sort_order
)
VALUES
  ('fa500000-0000-4000-8000-000000000001',
   'fa300000-0000-4000-8000-000000000005',
   'Cycle A', 'cycle-a', 7, 'main', 0),
  ('fa500000-0000-4000-8000-000000000002',
   'fa300000-0000-4000-8000-000000000005',
   'Cycle B', 'cycle-b', 7, 'main', 1);
UPDATE public.proposal_phases
SET follows_phase_id = CASE id
  WHEN 'fa500000-0000-4000-8000-000000000001'::uuid
    THEN 'fa500000-0000-4000-8000-000000000002'::uuid
  ELSE 'fa500000-0000-4000-8000-000000000001'::uuid
END
WHERE proposal_id = 'fa300000-0000-4000-8000-000000000005';

-- Child-copy guards only permit authoring while draft. Move the deliberately
-- invalid authored topology into the signable state through the same exact row
-- capability the canonical send path owns; the later signature must reach the
-- activation assertion rather than aborting during fixture setup.
SELECT set_config(
  'app.proposal_send_id',
  'fa300000-0000-4000-8000-000000000005',
  true
);
UPDATE public.proposals
SET status = 'sent', sent_at = now(), updated_at = now()
WHERE id = 'fa300000-0000-4000-8000-000000000005';
SELECT set_config('app.proposal_send_id', '', true);

CREATE OR REPLACE FUNCTION pg_temp.assume_signature_actor(
  p_actor uuid,
  p_role text DEFAULT 'authenticated'
)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM set_config(
    'request.jwt.claims',
    jsonb_strip_nulls(
      jsonb_build_object('sub', p_actor, 'role', p_role)
    )::text,
    true
  );
END;
$$;

-- Exact callable surface: the legacy caller-controlled overload is absent,
-- browser execution is authenticated-only, trusted IP is service-only, and the
-- shared implementation remains private to every API role.
DO $$
DECLARE
  v_role text;
BEGIN
  ASSERT to_regprocedure(
           'public.sign_proposal(uuid,text,text,boolean,date)'
         ) IS NULL,
    'legacy signature overload must be removed';
  ASSERT has_function_privilege(
           'authenticated', 'public.sign_proposal(uuid,text)', 'EXECUTE'
         ),
    'authenticated client requires minimal signature RPC';
  ASSERT NOT has_function_privilege(
           'anon', 'public.sign_proposal(uuid,text)', 'EXECUTE'
         )
     AND NOT has_function_privilege(
           'service_role', 'public.sign_proposal(uuid,text)', 'EXECUTE'
         ),
    'minimal client signature RPC must not leak to anon or service_role';
  ASSERT has_function_privilege(
           'service_role',
           'public.sign_proposal_with_trusted_ip(uuid,text,uuid,text)',
           'EXECUTE'
         ),
    'trusted IP wrapper requires service_role execute';
  ASSERT NOT has_function_privilege(
           'anon',
           'public.sign_proposal_with_trusted_ip(uuid,text,uuid,text)',
           'EXECUTE'
         )
     AND NOT has_function_privilege(
           'authenticated',
           'public.sign_proposal_with_trusted_ip(uuid,text,uuid,text)',
           'EXECUTE'
         ),
    'trusted IP wrapper must be service-role only';

  FOREACH v_role IN ARRAY ARRAY['anon', 'authenticated', 'service_role'] LOOP
    ASSERT NOT has_function_privilege(
      v_role,
      'public._sign_proposal_authorized_00400(uuid,text,uuid,text)',
      'EXECUTE'
    ), format('%s must not execute private signature core', v_role);
  END LOOP;
END;
$$;

CREATE TEMP TABLE signature_receipts (
  proposal_id uuid PRIMARY KEY,
  project_id uuid NOT NULL,
  signed_at timestamptz NOT NULL,
  accepted_at timestamptz NOT NULL
) ON COMMIT DROP;
GRANT SELECT, INSERT ON TABLE signature_receipts TO authenticated;

-- The browser path accepts only id + name, writes no IP evidence, always opens
-- the project, and chooses the schedule anchor on the server.
SET LOCAL ROLE authenticated;
SELECT pg_temp.assume_signature_actor(
  'fa000000-0000-4000-8000-000000000002'
);
DO $$
DECLARE
  v_receipt jsonb;
BEGIN
  v_receipt := public.sign_proposal(
    'fa300000-0000-4000-8000-000000000001',
    'Browser Client'
  );
  ASSERT v_receipt->>'status' = 'accepted'
         AND v_receipt->>'project_id' IS NOT NULL
         AND v_receipt->>'newly_signed' = 'true',
    format('browser signature must activate: %s', v_receipt);

  INSERT INTO signature_receipts (
    proposal_id, project_id, signed_at, accepted_at
  ) VALUES (
    'fa300000-0000-4000-8000-000000000001',
    (v_receipt->>'project_id')::uuid,
    (v_receipt->>'signed_at')::timestamptz,
    (v_receipt->>'accepted_at')::timestamptz
  );
END;
$$;

RESET ROLE;
SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);
DELETE FROM public.organization_members
WHERE id = 'fa110000-0000-4000-8000-000000000001';
UPDATE public.organization_members
SET status = 'suspended'
WHERE id = 'fa110000-0000-4000-8000-000000000002';
UPDATE public.organizations
SET status = 'suspended'
WHERE id = 'fa100000-0000-4000-8000-000000000001';
SELECT set_config('request.jwt.claims', '{}', true);

SET LOCAL ROLE authenticated;
SELECT pg_temp.assume_signature_actor(
  'fa000000-0000-4000-8000-000000000002'
);
DO $$
DECLARE
  v_retry jsonb;
BEGIN
  v_retry := public.sign_proposal(
    'fa300000-0000-4000-8000-000000000001',
    'Immutable Link Retry'
  );
  ASSERT (v_retry->>'project_id')::uuid = (
           SELECT project_id FROM signature_receipts
           WHERE proposal_id = 'fa300000-0000-4000-8000-000000000001'
         ) AND v_retry->>'newly_signed' = 'false',
    'linked accepted retry must not depend on mutable studio membership state';
END;
$$;

RESET ROLE;
UPDATE public.organizations
SET status = 'active'
WHERE id = 'fa100000-0000-4000-8000-000000000001';
UPDATE public.organization_members
SET status = 'active'
WHERE id = 'fa110000-0000-4000-8000-000000000002';
INSERT INTO public.organization_members (
  id, user_id, organization_id, role, status, joined_at
)
VALUES (
  'fa110000-0000-4000-8000-000000000001',
  'fa000000-0000-4000-8000-000000000001',
  'fa100000-0000-4000-8000-000000000001',
  'member', 'active', now()
);

DO $$
BEGIN
  ASSERT (SELECT signed_by_name = 'Browser Client'
                 AND signed_ip IS NULL
                 AND project_id IS NOT NULL
          FROM public.proposals
          WHERE id = 'fa300000-0000-4000-8000-000000000001'),
    'browser sign must preserve legal name without accepting caller IP';
  ASSERT (SELECT start_date = current_date
          FROM public.projects
          WHERE proposal_id = 'fa300000-0000-4000-8000-000000000001'),
    'browser sign must use server-owned current_date project anchor';
END;
$$;

-- Reassign the current project lead through the exact studio RPC. Proposal
-- authorship remains historical; a client retry must still validate reciprocity
-- and return the same project without replacing signature evidence.
SET LOCAL ROLE authenticated;
SELECT pg_temp.assume_signature_actor(
  'fa000000-0000-4000-8000-000000000001'
);
SELECT public.reassign_project_lead(
  (SELECT project_id FROM signature_receipts
   WHERE proposal_id = 'fa300000-0000-4000-8000-000000000001'),
  'fa000000-0000-4000-8000-000000000001',
  'fa000000-0000-4000-8000-000000000003'
);

-- Historical authorship remains valid provenance after a checked handoff even
-- if the original designer later leaves the studio. The membership row records
-- the studio relationship; only the current lead must still be active.
RESET ROLE;
UPDATE public.organization_members
SET status = 'suspended'
WHERE id = 'fa110000-0000-4000-8000-000000000001';

SET LOCAL ROLE authenticated;
SELECT pg_temp.assume_signature_actor(
  'fa000000-0000-4000-8000-000000000002'
);
DO $$
DECLARE
  v_retry jsonb;
BEGIN
  v_retry := public.sign_proposal(
    'fa300000-0000-4000-8000-000000000001',
    'Replacement Retry Name'
  );
  ASSERT (v_retry->>'project_id')::uuid = (
           SELECT project_id FROM signature_receipts
           WHERE proposal_id = 'fa300000-0000-4000-8000-000000000001'
         ) AND v_retry->>'newly_signed' = 'false',
    format('reassigned-lead retry must return original project: %s', v_retry);
END;
$$;

RESET ROLE;
DO $$
BEGIN
  ASSERT (SELECT proposal.designer_id =
                   'fa000000-0000-4000-8000-000000000001'
                 AND project.designer_id =
                   'fa000000-0000-4000-8000-000000000003'
                 AND historical_membership.status = 'suspended'
                 AND proposal.project_id = project.id
                 AND project.client_id = proposal.client_id
          FROM public.proposals AS proposal
          JOIN public.projects AS project ON project.id = proposal.project_id
          JOIN public.organization_members AS historical_membership
            ON historical_membership.user_id = proposal.designer_id
           AND historical_membership.organization_id = project.studio_id
          WHERE proposal.id = 'fa300000-0000-4000-8000-000000000001'),
    'lead reassignment must preserve historical proposal author and exact client';
  ASSERT (SELECT proposal.signed_by_name = 'Browser Client'
                 AND proposal.signed_at = receipt.signed_at
                 AND proposal.accepted_at = receipt.accepted_at
          FROM public.proposals AS proposal
          JOIN signature_receipts AS receipt ON receipt.proposal_id = proposal.id
          WHERE proposal.id = 'fa300000-0000-4000-8000-000000000001'),
    'accepted retry must preserve original signature evidence';
  ASSERT (SELECT count(*) = 1
          FROM public.client_decisions
          WHERE linked_proposal_id = 'fa300000-0000-4000-8000-000000000001'
            AND decision_type = 'approval'),
    'accepted retry must not duplicate approval consent';
  ASSERT (SELECT count(*) = 1
          FROM public.proposal_engagement
          WHERE proposal_id = 'fa300000-0000-4000-8000-000000000001'
            AND event_type = 'signed'),
    'accepted retry must not duplicate signed engagement';
END;
$$;

-- Restore the fixture studio for the independent first-sign/repair scenarios
-- below; the suspended-author retry was proven above.
UPDATE public.organization_members
SET status = 'active'
WHERE id = 'fa110000-0000-4000-8000-000000000001';

-- The production-only wrapper stores edge-derived IP while still binding the
-- explicit actor to proposals.client_id and retaining server-owned activation.
SET LOCAL ROLE service_role;
SELECT pg_temp.assume_signature_actor(NULL, 'service_role');
DO $$
DECLARE
  v_receipt jsonb;
  v_error text;
BEGIN
  v_receipt := public.sign_proposal_with_trusted_ip(
    'fa300000-0000-4000-8000-000000000002',
    'Trusted Route Client',
    'fa000000-0000-4000-8000-000000000002',
    '203.0.113.7'
  );
  ASSERT v_receipt->>'project_id' IS NOT NULL,
    format('trusted route must activate: %s', v_receipt);
  ASSERT v_receipt->>'newly_signed' = 'true',
    format('trusted first signature must own confirmation: %s', v_receipt);
  ASSERT auth.role() = 'service_role' AND auth.uid() IS NULL,
    'trusted wrapper must restore the service claim after delegated activation';

  BEGIN
    PERFORM public.sign_proposal_with_trusted_ip(
      'fa300000-0000-4000-8000-000000000004',
      'Wrong Actor',
      'fa000000-0000-4000-8000-000000000004',
      '198.51.100.9'
    );
  EXCEPTION WHEN insufficient_privilege THEN
    v_error := SQLERRM;
  END;
  ASSERT v_error =
    'proposal fa300000-0000-4000-8000-000000000004 may only be signed by its client',
    format('service actor mismatch must fail exact ownership: %L', v_error);
  ASSERT auth.role() = 'service_role' AND auth.uid() IS NULL,
    'trusted wrapper must restore the service claim after an exception';
END;
$$;

RESET ROLE;
DO $$
BEGIN
  ASSERT (SELECT signed_ip = '203.0.113.7'
                 AND project_id IS NOT NULL
          FROM public.proposals
          WHERE id = 'fa300000-0000-4000-8000-000000000002'),
    'trusted route must persist its server-derived IP evidence';
  ASSERT (SELECT start_date = current_date
          FROM public.projects
          WHERE proposal_id = 'fa300000-0000-4000-8000-000000000002'),
    'trusted route must retain server-owned project anchor';
  ASSERT (SELECT revision.actor = 'fa000000-0000-4000-8000-000000000002'
          FROM public.schedule_revisions AS revision
          JOIN public.projects AS project ON project.id = revision.project_id
          WHERE project.proposal_id = 'fa300000-0000-4000-8000-000000000002'
            AND revision.v = 1),
    'trusted route must attribute the baseline revision to the verified client';
  ASSERT (SELECT status = 'sent' AND signed_at IS NULL
                 AND signed_by_name IS NULL AND signed_ip IS NULL
                 AND project_id IS NULL
          FROM public.proposals
          WHERE id = 'fa300000-0000-4000-8000-000000000004'),
    'service actor mismatch must leave proposal truth untouched';
END;
$$;

-- An accepted row is not a repair capability by itself. The approval must bind
-- the exact client actor, recognized consent method, and signing transaction
-- timestamps. Each forged variant must fail before activation and leave the
-- proposal/project relationship untouched.
SELECT set_config(
  'app.client_decision_write_id',
  'fa400000-0000-4000-8000-000000000003',
  true
);
UPDATE public.client_decisions
SET selected_by = 'fa000000-0000-4000-8000-000000000004'
WHERE id = 'fa400000-0000-4000-8000-000000000003';
SELECT set_config('app.client_decision_write_id', '', true);

SET LOCAL ROLE authenticated;
SELECT pg_temp.assume_signature_actor(
  'fa000000-0000-4000-8000-000000000002'
);
DO $$
DECLARE
  v_error text;
BEGIN
  BEGIN
    PERFORM public.sign_proposal(
      'fa300000-0000-4000-8000-000000000003',
      'Forged Actor Retry'
    );
  EXCEPTION WHEN check_violation THEN
    v_error := SQLERRM;
  END;
  ASSERT v_error =
    'proposal approval evidence conflicts with proposal identity',
    format('forged consent actor must fail closed: %L', v_error);
END;
$$;
RESET ROLE;

SELECT set_config(
  'app.client_decision_write_id',
  'fa400000-0000-4000-8000-000000000003',
  true
);
UPDATE public.client_decisions
SET selected_by = 'fa000000-0000-4000-8000-000000000002',
    client_consent_method = 'paper'
WHERE id = 'fa400000-0000-4000-8000-000000000003';
SELECT set_config('app.client_decision_write_id', '', true);

SET LOCAL ROLE authenticated;
SELECT pg_temp.assume_signature_actor(
  'fa000000-0000-4000-8000-000000000002'
);
DO $$
DECLARE
  v_error text;
BEGIN
  BEGIN
    PERFORM public.sign_proposal(
      'fa300000-0000-4000-8000-000000000003',
      'Forged Method Retry'
    );
  EXCEPTION WHEN check_violation THEN
    v_error := SQLERRM;
  END;
  ASSERT v_error =
    'proposal approval evidence conflicts with proposal identity',
    format('forged consent method must fail closed: %L', v_error);
END;
$$;
RESET ROLE;

SELECT set_config(
  'app.client_decision_write_id',
  'fa400000-0000-4000-8000-000000000003',
  true
);
UPDATE public.client_decisions
SET client_consent_method = 'electronic_signature',
    client_consented_at = client_consented_at - interval '1 minute'
WHERE id = 'fa400000-0000-4000-8000-000000000003';
SELECT set_config('app.client_decision_write_id', '', true);

SET LOCAL ROLE authenticated;
SELECT pg_temp.assume_signature_actor(
  'fa000000-0000-4000-8000-000000000002'
);
DO $$
DECLARE
  v_error text;
BEGIN
  BEGIN
    PERFORM public.sign_proposal(
      'fa300000-0000-4000-8000-000000000003',
      'Forged Time Retry'
    );
  EXCEPTION WHEN check_violation THEN
    v_error := SQLERRM;
  END;
  ASSERT v_error =
    'proposal approval evidence conflicts with proposal identity',
    format('forged consent time must fail closed: %L', v_error);
END;
$$;
RESET ROLE;

SELECT set_config(
  'app.client_decision_write_id',
  'fa400000-0000-4000-8000-000000000003',
  true
);
UPDATE public.client_decisions AS approval
SET client_consented_at = proposal.signed_at,
    sent_at = proposal.signed_at,
    responded_at = proposal.accepted_at
FROM public.proposals AS proposal
WHERE approval.id = 'fa400000-0000-4000-8000-000000000003'
  AND proposal.id = approval.linked_proposal_id;
SELECT set_config('app.client_decision_write_id', '', true);

DO $$
BEGIN
  ASSERT (SELECT project_id IS NULL
          FROM public.proposals
          WHERE id = 'fa300000-0000-4000-8000-000000000003'),
    'forged accepted retries must not activate a project';
END;
$$;

-- A historically accepted/no-project row with exact consent is repairable.
-- Retry input cannot replace its old name/IP/timestamps and does not fabricate a
-- second signature event.
SET LOCAL ROLE authenticated;
SELECT pg_temp.assume_signature_actor(
  'fa000000-0000-4000-8000-000000000002'
);
DO $$
DECLARE
  v_receipt jsonb;
BEGIN
  v_receipt := public.sign_proposal(
    'fa300000-0000-4000-8000-000000000003',
    'Attempted Replacement'
  );
  ASSERT v_receipt->>'project_id' IS NOT NULL,
    format('accepted/no-project retry must repair activation: %s', v_receipt);
  ASSERT v_receipt->>'newly_signed' = 'false',
    format('accepted repair must not own confirmation: %s', v_receipt);
END;
$$;

RESET ROLE;
DO $$
BEGIN
  ASSERT (SELECT signed_by_name = 'Original Accepted Name'
                 AND signed_ip = '192.0.2.17'
                 AND project_id IS NOT NULL
          FROM public.proposals
          WHERE id = 'fa300000-0000-4000-8000-000000000003'),
    'accepted repair must preserve original legal/audit evidence';
  ASSERT (SELECT count(*) = 1
    FROM public.proposal_engagement
    WHERE proposal_id = 'fa300000-0000-4000-8000-000000000003'
      AND event_type = 'signed'
  ), 'accepted repair must preserve exactly one historical signature event';
END;
$$;

-- Matching proposal/client columns are insufficient detached provenance. The
-- foreign studio is unrelated to the historical proposal author, so repair
-- must fail without linking or rewriting the accepted evidence.
SET LOCAL ROLE authenticated;
SELECT pg_temp.assume_signature_actor(
  'fa000000-0000-4000-8000-000000000002'
);
DO $$
DECLARE
  v_error text;
BEGIN
  BEGIN
    PERFORM public.sign_proposal(
      'fa300000-0000-4000-8000-000000000006',
      'Attempted Foreign Repair'
    );
  EXCEPTION WHEN check_violation THEN
    v_error := SQLERRM;
  END;
  ASSERT v_error =
    'proposal fa300000-0000-4000-8000-000000000006 has a conflicting detached project',
    format('foreign-studio detached repair must fail closed: %L', v_error);
END;
$$;

RESET ROLE;
DO $$
BEGIN
  ASSERT (SELECT project_id IS NULL
                 AND signed_by_name = 'Foreign Studio Evidence'
                 AND signed_ip = '192.0.2.18'
          FROM public.proposals
          WHERE id = 'fa300000-0000-4000-8000-000000000006'),
    'foreign-studio rejection must preserve proposal evidence and null link';
  ASSERT (SELECT proposal_id = 'fa300000-0000-4000-8000-000000000006'
                 AND studio_id = 'fa100000-0000-4000-8000-000000000002'
          FROM public.projects
          WHERE id = 'fa600000-0000-4000-8000-000000000006'),
    'foreign-studio rejection must not rewrite the detached fixture';
END;
$$;

-- The activation assertion fails after proposal/decision/event writes begin;
-- one RPC statement must roll every partial effect back.
SET LOCAL ROLE authenticated;
SELECT pg_temp.assume_signature_actor(
  'fa000000-0000-4000-8000-000000000002'
);
DO $$
DECLARE
  v_error text;
BEGIN
  BEGIN
    PERFORM public.sign_proposal(
      'fa300000-0000-4000-8000-000000000005',
      'Rollback Client'
    );
  EXCEPTION WHEN OTHERS THEN
    v_error := SQLERRM;
  END;
  ASSERT v_error IS NOT NULL,
    'invalid activation topology must fail the signature transaction';
END;
$$;

RESET ROLE;
DO $$
BEGIN
  ASSERT (SELECT status = 'sent' AND accepted_at IS NULL
                 AND signed_at IS NULL AND signed_by_name IS NULL
                 AND signed_ip IS NULL AND project_id IS NULL
          FROM public.proposals
          WHERE id = 'fa300000-0000-4000-8000-000000000005'),
    'failed activation must roll proposal signature truth back';
  ASSERT NOT EXISTS (
    SELECT 1 FROM public.client_decisions
    WHERE linked_proposal_id = 'fa300000-0000-4000-8000-000000000005'
  ), 'failed activation must roll approval decision back';
  ASSERT NOT EXISTS (
    SELECT 1 FROM public.proposal_engagement
    WHERE proposal_id = 'fa300000-0000-4000-8000-000000000005'
  ), 'failed activation must roll engagement back';
  ASSERT NOT EXISTS (
    SELECT 1 FROM public.projects
    WHERE proposal_id = 'fa300000-0000-4000-8000-000000000005'
  ), 'failed activation must roll partial project back';
END;
$$;

ROLLBACK;
