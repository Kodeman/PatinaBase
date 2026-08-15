-- Journey authority / decision atomicity regression (00399)
-- Run:
--   psql 'postgresql://postgres:postgres@127.0.0.1:54322/postgres' \
--     -v ON_ERROR_STOP=1 -f supabase/tests/document/journey_authority_integrity_test.sql

CREATE EXTENSION IF NOT EXISTS dblink WITH SCHEMA extensions;

BEGIN;

INSERT INTO auth.users (
  id, email, encrypted_password, email_confirmed_at, created_at, updated_at,
  instance_id, aud, role
)
VALUES
  ('f8000000-0000-4000-8000-000000000001', 'journey-owner@test.invalid', '', now(), now(), now(),
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('f8000000-0000-4000-8000-000000000002', 'journey-client@test.invalid', '', now(), now(), now(),
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('f8000000-0000-4000-8000-000000000003', 'journey-peer@test.invalid', '', now(), now(), now(),
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('f8000000-0000-4000-8000-000000000004', 'journey-foreign@test.invalid', '', now(), now(), now(),
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('f8000000-0000-4000-8000-000000000005', 'journey-contractor@test.invalid', '', now(), now(), now(),
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');

INSERT INTO public.profiles (id, email, full_name, created_at, updated_at)
VALUES
  ('f8000000-0000-4000-8000-000000000001', 'journey-owner@test.invalid', 'Journey Owner', now(), now()),
  ('f8000000-0000-4000-8000-000000000002', 'journey-client@test.invalid', 'Journey Client', now(), now()),
  ('f8000000-0000-4000-8000-000000000003', 'journey-peer@test.invalid', 'Journey Peer', now(), now()),
  ('f8000000-0000-4000-8000-000000000004', 'journey-foreign@test.invalid', 'Journey Foreign', now(), now()),
  ('f8000000-0000-4000-8000-000000000005', 'journey-contractor@test.invalid', 'Journey Contractor', now(), now())
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.organizations (id, type, name, slug, status)
VALUES
  ('f8010000-0000-4000-8000-000000000001', 'design_studio',
   'Journey Authority Studio', 'journey-authority-studio', 'active'),
  ('f8010000-0000-4000-8000-000000000002', 'contractor',
   'Journey Shared Contractor', 'journey-shared-contractor', 'active');

INSERT INTO public.organization_members (
  id, user_id, organization_id, role, status, joined_at
)
VALUES
  ('f8020000-0000-4000-8000-000000000001',
   'f8000000-0000-4000-8000-000000000001',
   'f8010000-0000-4000-8000-000000000001', 'owner', 'active', now()),
  ('f8020000-0000-4000-8000-000000000002',
   'f8000000-0000-4000-8000-000000000003',
   'f8010000-0000-4000-8000-000000000001', 'member', 'active', now()),
  ('f8020000-0000-4000-8000-000000000003',
   'f8000000-0000-4000-8000-000000000001',
   'f8010000-0000-4000-8000-000000000002', 'owner', 'active', now()),
  ('f8020000-0000-4000-8000-000000000004',
   'f8000000-0000-4000-8000-000000000005',
   'f8010000-0000-4000-8000-000000000002', 'member', 'active', now());

INSERT INTO public.designer_clients (
  id, designer_id, client_id, client_name, status, source
)
VALUES
  ('f8030000-0000-4000-8000-000000000001',
   'f8000000-0000-4000-8000-000000000001',
   'f8000000-0000-4000-8000-000000000002',
   'Journey Client', 'active', 'direct'),
  ('f8030000-0000-4000-8000-000000000002',
   'f8000000-0000-4000-8000-000000000001', NULL,
   'Profileless Journey Client', 'proposal', 'direct');

INSERT INTO public.projects (
  id, name, designer_id, created_by, client_id, status
)
VALUES (
  'f8040000-0000-4000-8000-000000000001', 'Journey Project',
  'f8000000-0000-4000-8000-000000000001',
  'f8000000-0000-4000-8000-000000000001',
  'f8000000-0000-4000-8000-000000000002', 'active'
);

INSERT INTO public.products (
  id, name, source_url, captured_by, captured_at
) VALUES (
  'f8050000-0000-4000-8000-000000000001',
  'Journey captured product', 'https://example.invalid/journey-product',
  'f8000000-0000-4000-8000-000000000001', now()
);

INSERT INTO public.proposals (
  id, designer_id, designer_client_id, client_id, title, total_amount, status,
  valid_until
) VALUES (
  'f8600000-0000-4000-8000-000000000001',
  'f8000000-0000-4000-8000-000000000001',
  'f8030000-0000-4000-8000-000000000001',
  'f8000000-0000-4000-8000-000000000002',
  'Exact studio child-policy fixture', 0, 'draft', now() + interval '30 days'
);

INSERT INTO public.proposal_phases (
  id, proposal_id, name, phase_key, fee_cents, sort_order, lane
) VALUES (
  'f8610000-0000-4000-8000-000000000001',
  'f8600000-0000-4000-8000-000000000001',
  'Exact studio policy phase', 'consultation', 0, 0, 'main'
);

-- Trusted fixtures cover every public decision lifecycle act. Runtime calls
-- below run as authenticated/service roles and must use the canonical RPCs.
INSERT INTO public.client_decisions (
  id, designer_client_id, project_id, title, status, sent_at,
  coordination_kind, court, due_date
)
VALUES
  ('f8100000-0000-4000-8000-000000000001',
   'f8030000-0000-4000-8000-000000000001',
   'f8040000-0000-4000-8000-000000000001',
   'Client atomic apply', 'pending', now(), 'selection', 'client', now() + interval '7 days'),
  ('f8100000-0000-4000-8000-000000000002',
   'f8030000-0000-4000-8000-000000000001',
   'f8040000-0000-4000-8000-000000000001',
   'Designer override', 'pending', now(), 'selection', 'client', now() + interval '7 days'),
  ('f8100000-0000-4000-8000-000000000003',
   'f8030000-0000-4000-8000-000000000001',
   'f8040000-0000-4000-8000-000000000001',
   'Editable draft', 'draft', NULL, 'selection', 'client', now() + interval '7 days'),
  ('f8100000-0000-4000-8000-000000000004',
   'f8030000-0000-4000-8000-000000000001',
   'f8040000-0000-4000-8000-000000000001',
   'Expire then reopen', 'expired', now(), 'selection', 'client', now() - interval '8 days'),
  ('f8100000-0000-4000-8000-000000000005',
   'f8030000-0000-4000-8000-000000000001',
   'f8040000-0000-4000-8000-000000000001',
   'Designer-recorded RFI', 'pending', now(), 'rfi', 'designer', now() + interval '7 days'),
  ('f8100000-0000-4000-8000-000000000006',
   'f8030000-0000-4000-8000-000000000001',
   'f8040000-0000-4000-8000-000000000001',
   'Designer-recorded submittal', 'pending', now(), 'submittal', 'designer', now() + interval '7 days'),
  ('f8100000-0000-4000-8000-000000000007',
   'f8030000-0000-4000-8000-000000000001',
   'f8040000-0000-4000-8000-000000000001',
   'Service expiry', 'pending', now(), 'selection', 'client', now() - interval '10 days'),
  ('f8100000-0000-4000-8000-000000000011',
   'f8030000-0000-4000-8000-000000000002', NULL,
   'Profileless override', 'pending', now(), 'selection', 'client', now() + interval '7 days'),
  ('f8100000-0000-4000-8000-000000000012',
   'f8030000-0000-4000-8000-000000000001',
   'f8040000-0000-4000-8000-000000000001',
   'Designer-court selection', 'pending', now(), 'selection', 'designer', now() + interval '7 days'),
  ('f8100000-0000-4000-8000-000000000013',
   'f8030000-0000-4000-8000-000000000001',
   'f8040000-0000-4000-8000-000000000001',
   'Client-court RFI', 'pending', now(), 'rfi', 'client', now() + interval '7 days'),
  ('f8100000-0000-4000-8000-000000000014',
   'f8030000-0000-4000-8000-000000000001',
   'f8040000-0000-4000-8000-000000000001',
   'Selection with unapplied override evidence', 'pending', now(),
   'selection', 'client', now() + interval '7 days'),
  ('f8100000-0000-4000-8000-000000000015',
   'f8030000-0000-4000-8000-000000000001',
   'f8040000-0000-4000-8000-000000000001',
   'Legacy claimed-client override', 'pending', now(),
   'selection', 'client', now() + interval '7 days'),
  ('f8100000-0000-4000-8000-000000000017',
   'f8030000-0000-4000-8000-000000000001',
   'f8040000-0000-4000-8000-000000000001',
   'Historical malformed override receipt', 'pending', now(),
   'selection', 'client', now() + interval '7 days'),
  ('f8100000-0000-4000-8000-000000000019',
   'f8030000-0000-4000-8000-000000000001',
   'f8040000-0000-4000-8000-000000000001',
   'Canonical reopen stale evidence', 'expired', now(),
   'selection', 'client', now() + interval '7 days');

INSERT INTO public.client_decisions (
  id, designer_client_id, project_id, linked_proposal_id, title,
  decision_type, status, coordination_kind, court, due_date
) VALUES (
  'f8100000-0000-4000-8000-000000000016',
  'f8030000-0000-4000-8000-000000000001', NULL,
  'f8600000-0000-4000-8000-000000000001',
  'Linked non-approval draft', 'product', 'draft', 'selection', 'client',
  now() + interval '7 days'
);

-- Trusted stale response evidence exercises the rollback bundle's two-step
-- expired deadline extension + reopen path below.
UPDATE public.client_decisions
SET responded_at = now() - interval '2 days',
    viewed_at = now() - interval '3 days',
    reminder_sent_at = now() - interval '4 days',
    selected_by = 'f8000000-0000-4000-8000-000000000002',
    client_consent_method = 'click_through',
    client_consented_at = now() - interval '2 days'
WHERE id = 'f8100000-0000-4000-8000-000000000004';

UPDATE public.client_decisions
SET due_date = now() - interval '3 days',
    responded_at = now() - interval '2 days',
    viewed_at = now() - interval '3 days',
    reminder_sent_at = now() - interval '4 days',
    selected_by = 'f8000000-0000-4000-8000-000000000002',
    client_consent_method = 'click_through',
    client_consented_at = now() - interval '2 days'
WHERE id = 'f8100000-0000-4000-8000-000000000019';

INSERT INTO public.client_decision_options (
  id, decision_id, name, price, quantity, selected, sort_order
)
VALUES
  ('f8200000-0000-4000-8000-000000000001',
   'f8100000-0000-4000-8000-000000000001', 'Client winner', 12000, 1, false, 0),
  ('f8200000-0000-4000-8000-000000000002',
   'f8100000-0000-4000-8000-000000000001', 'Client alternate', 9000, 1, false, 1),
  ('f8200000-0000-4000-8000-000000000003',
   'f8100000-0000-4000-8000-000000000002', 'Override winner', 10000, 1, false, 0),
  ('f8200000-0000-4000-8000-000000000004',
   'f8100000-0000-4000-8000-000000000003', 'Old draft option', 5000, 1, false, 0),
  ('f8200000-0000-4000-8000-000000000005',
   'f8100000-0000-4000-8000-000000000004', 'Stale expired choice', 6000, 1, true, 0),
  ('f8200000-0000-4000-8000-000000000011',
   'f8100000-0000-4000-8000-000000000011', 'Profileless choice', 6400, 1, false, 0),
  ('f8200000-0000-4000-8000-000000000015',
   'f8100000-0000-4000-8000-000000000012', 'Designer-court option', 6500, 1, false, 0),
  ('f8200000-0000-4000-8000-000000000016',
   'f8100000-0000-4000-8000-000000000013', 'RFI decoy option', 6600, 1, false, 0),
  ('f8200000-0000-4000-8000-000000000017',
   'f8100000-0000-4000-8000-000000000014', 'Client selection option', 6700, 1, false, 0),
  ('f8200000-0000-4000-8000-000000000018',
   'f8100000-0000-4000-8000-000000000015', 'Legacy override option', 6800, 1, false, 0),
  ('f8200000-0000-4000-8000-000000000020',
   'f8100000-0000-4000-8000-000000000017', 'Malformed receipt option', 6900, 1, false, 0),
  ('f8200000-0000-4000-8000-000000000022',
   'f8100000-0000-4000-8000-000000000019', 'Stale reopen option', 7100, 1, true, 0);

UPDATE public.client_decision_options
SET client_note = 'Stale client note'
WHERE id = 'f8200000-0000-4000-8000-000000000005';

UPDATE public.client_decision_options
SET client_note = 'Stale canonical reopen note'
WHERE id = 'f8200000-0000-4000-8000-000000000022';

-- Trusted historical draft evidence exists only to verify that client read
-- policies do not leak unsent documents. Runtime override births below are
-- correctly limited to pending parents.
INSERT INTO public.decision_overrides (
  id, decision_id, option_id, acted_by, consent_method, consent_evidence
) VALUES (
  'f8500000-0000-4000-8000-000000000003',
  'f8100000-0000-4000-8000-000000000003',
  'f8200000-0000-4000-8000-000000000004',
  'f8000000-0000-4000-8000-000000000001',
  'written', 'Historical draft evidence must remain studio-private'
);

INSERT INTO public.decision_overrides (
  id, decision_id, option_id, acted_by, consent_method, consent_evidence
) VALUES (
  'f8500000-0000-4000-8000-000000000011',
  'f8100000-0000-4000-8000-000000000017',
  'f8200000-0000-4000-8000-000000000020',
  'f8000000-0000-4000-8000-000000000001',
  'written', '   '
);

CREATE OR REPLACE FUNCTION pg_temp.assume_journey_actor(
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

GRANT EXECUTE ON FUNCTION pg_temp.assume_journey_actor(uuid, text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION pg_temp.option_matches_client_truth(
  p_option_id uuid,
  p_note text,
  p_quantity integer
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT COALESCE((
    SELECT option.selected
       AND option.client_note IS NOT DISTINCT FROM p_note
       AND option.quantity IS NOT DISTINCT FROM p_quantity
    FROM public.client_decision_options AS option
    WHERE option.id = p_option_id
  ), false);
$$;

GRANT EXECUTE ON FUNCTION pg_temp.option_matches_client_truth(uuid, text, integer) TO authenticated;

CREATE OR REPLACE FUNCTION pg_temp.decision_truth(p_decision_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT to_jsonb(decision)
  FROM public.client_decisions AS decision
  WHERE decision.id = p_decision_id
$$;

GRANT EXECUTE ON FUNCTION pg_temp.decision_truth(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION pg_temp.option_truth(p_option_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT to_jsonb(option)
  FROM public.client_decision_options AS option
  WHERE option.id = p_option_id
$$;

GRANT EXECUTE ON FUNCTION pg_temp.option_truth(uuid) TO authenticated;

DO $$
BEGIN
  ASSERT NOT has_function_privilege(
    'authenticated',
    'public._apply_client_decision_authorized(uuid,uuid,uuid,text,text,text,integer)',
    'EXECUTE'
  ), 'private decision apply core must not be browser-executable';
  ASSERT NOT has_function_privilege(
    'authenticated',
    'public._resolve_coordination_item_authorized(uuid,uuid,text,uuid,text,uuid)',
    'EXECUTE'
  ), 'private coordination resolve core must not be browser-executable';
  ASSERT (
    SELECT prosecdef
    FROM pg_proc
    WHERE oid =
      'public.resolve_coordination_item(uuid,uuid,text,uuid,text,uuid)'::regprocedure
  ), 'coordination wrapper must own its private core call';
  ASSERT NOT has_function_privilege(
    'authenticated', 'public.expire_due_client_decisions(timestamptz)', 'EXECUTE'
  ), 'bulk expiry must be service-role-only';
  ASSERT has_function_privilege(
    'authenticated', 'public.is_design_studio_comember(uuid)', 'EXECUTE'
  ) AND NOT has_function_privilege(
    'anon', 'public.is_design_studio_comember(uuid)', 'EXECUTE'
  ), 'exact design-studio helper must be browser-callable but never anonymous';
  ASSERT NOT has_function_privilege(
    'authenticated', 'public._can_author_proposal(uuid)', 'EXECUTE'
  ), 'private proposal-author helper must remain non-browser-executable';
  ASSERT has_function_privilege(
    'service_role', 'public.expire_due_client_decisions(timestamptz)', 'EXECUTE'
  ), 'expiry worker needs its checked service-role RPC';
  ASSERT NOT has_table_privilege(
    'authenticated', 'public.client_decisions', 'UPDATE'
  ), 'expand phase must not retain table-wide decision UPDATE';
  ASSERT NOT has_table_privilege(
    'authenticated', 'public.client_decision_options', 'UPDATE'
  ), 'expand phase must not retain table-wide option UPDATE';
  ASSERT has_column_privilege(
    'authenticated', 'public.client_decisions', 'viewed_at', 'UPDATE'
  ) AND has_column_privilege(
    'authenticated', 'public.client_decisions', 'title', 'UPDATE'
  ), 'expand phase needs only explicit client/studio decision columns';
  ASSERT has_column_privilege(
    'authenticated', 'public.client_decision_options', 'client_note', 'UPDATE'
  ) AND has_column_privilege(
    'authenticated', 'public.client_decision_options', 'selected', 'UPDATE'
  ), 'option compatibility needs selected only for guarded atomic reopen clearing';
  ASSERT has_table_privilege(
    'authenticated', 'public.decision_overrides', 'INSERT'
  ), 'expand phase must retain rollback override INSERT';
END;
$$;

SET LOCAL ROLE authenticated;
SELECT pg_temp.assume_journey_actor('f8000000-0000-4000-8000-000000000001');

-- Expand phase is explicit and observable: the exact installed-client and
-- rollback-editor paths remain, but hard guards are attached and broad legacy
-- RLS policies stay removed.
DO $$
BEGIN
  ASSERT 3 = (
    SELECT count(*)
    FROM pg_trigger
    WHERE NOT tgisinternal
      AND tgname IN (
        'zz_guard_client_decision_authority_trg',
        'zz_guard_client_decision_option_authority_trg',
        'zz_guard_decision_override_authority_trg'
      )
  ), 'all decision/option/override authority guards must be attached';
  ASSERT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE NOT tgisinternal
      AND tgname = 'y_cleanup_client_decision_draft_delete_trg'
  ), 'draft parent delete must atomically clean its dependent blockers';
  ASSERT NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND policyname IN (
        'Designers can manage their decisions',
        'Clients can respond to their decisions',
        'client_decisions_studio_rw',
        'Designers can manage decision options',
        'Clients can select decision options',
        'client_decision_options_studio_rw'
      )
  ), 'broad legacy decision policies must remain absent';
  ASSERT NOT has_table_privilege(
    'anon', 'public.client_decisions', 'INSERT'
  ) AND NOT has_table_privilege(
    'anon', 'public.client_decisions', 'UPDATE'
  ) AND NOT has_table_privilege(
    'anon', 'public.client_decisions', 'DELETE'
  ) AND NOT has_table_privilege(
    'anon', 'public.client_decision_options', 'INSERT'
  ) AND NOT has_table_privilege(
    'anon', 'public.client_decision_options', 'UPDATE'
  ) AND NOT has_table_privilege(
    'anon', 'public.client_decision_options', 'DELETE'
  ) AND NOT has_table_privilege(
    'anon', 'public.decision_overrides', 'INSERT'
  ) AND NOT has_table_privilege(
    'anon', 'public.decision_overrides', 'UPDATE'
  ) AND NOT has_table_privilege(
    'anon', 'public.decision_overrides', 'DELETE'
  ), 'expand compatibility must never restore anonymous mutations';
  ASSERT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'client_decisions'
      AND policyname = 'client_decisions_studio_legacy_update'
      AND cmd = 'UPDATE'
  ) AND EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'client_decision_options'
      AND policyname = 'client_decision_options_client_compat_update'
      AND cmd = 'UPDATE'
  ), 'narrow rollback/client RLS policies must remain explicit';
END;
$$;

-- Override evidence uses the same active-studio/addressed-client boundary as
-- its parent decision. Studio peers retain the rollback INSERT/read path;
-- clients receive transparent evidence only after the decision is sent.
DO $$
DECLARE
  v_error text;
BEGIN
  PERFORM pg_temp.assume_journey_actor(
    'f8000000-0000-4000-8000-000000000001'
  );
  INSERT INTO public.decision_overrides (
    id, decision_id, option_id, acted_by, consent_method, consent_evidence,
    created_at
  ) VALUES (
     'f8500000-0000-4000-8000-000000000001',
     'f8100000-0000-4000-8000-000000000014',
     'f8200000-0000-4000-8000-000000000017',
     'f8000000-0000-4000-8000-000000000001',
     'verbal', 'Owner recorded preliminary client consent',
     '2000-01-01T00:00:00Z');
  ASSERT (SELECT count(*) = 2
          FROM public.decision_overrides
          WHERE id IN (
            'f8500000-0000-4000-8000-000000000001',
            'f8500000-0000-4000-8000-000000000003'
          )),
    'owner must read its runtime and trusted historical override evidence';
  ASSERT (SELECT created_at > now() - interval '1 minute'
          FROM public.decision_overrides
          WHERE id = 'f8500000-0000-4000-8000-000000000001'),
    'direct owner override birth timestamp must be server-owned';

  v_error := NULL;
  BEGIN
    INSERT INTO public.decision_overrides (
      id, decision_id, option_id, acted_by, consent_method, consent_evidence
    ) VALUES (
      'f8500000-0000-4000-8000-000000000009',
      'f8100000-0000-4000-8000-000000000012',
      'f8200000-0000-4000-8000-000000000015',
      'f8000000-0000-4000-8000-000000000001',
      'verbal', 'Wrong-court direct evidence'
    );
  EXCEPTION WHEN check_violation THEN
    v_error := SQLERRM;
  END;
  ASSERT v_error IS NOT NULL,
    'direct override evidence must reject designer-court selection';

  v_error := NULL;
  BEGIN
    INSERT INTO public.decision_overrides (
      id, decision_id, option_id, acted_by, consent_method, consent_evidence
    ) VALUES (
      'f8500000-0000-4000-8000-000000000010',
      'f8100000-0000-4000-8000-000000000013',
      'f8200000-0000-4000-8000-000000000016',
      'f8000000-0000-4000-8000-000000000001',
      'verbal', 'Non-selection direct evidence'
    );
  EXCEPTION WHEN check_violation THEN
    v_error := SQLERRM;
  END;
  ASSERT v_error IS NOT NULL,
    'direct override evidence must reject non-selection coordination';

  v_error := NULL;
  BEGIN
    INSERT INTO public.decision_overrides (
      id, decision_id, option_id, acted_by, consent_method, consent_evidence
    ) VALUES (
      'f8500000-0000-4000-8000-000000000012',
      'f8100000-0000-4000-8000-000000000014',
      'f8200000-0000-4000-8000-000000000017',
      'f8000000-0000-4000-8000-000000000001',
      'written', '   '
    );
  EXCEPTION WHEN check_violation THEN
    v_error := SQLERRM;
  END;
  ASSERT v_error IS NOT NULL,
    'direct override evidence must reject blank consent evidence';

  v_error := NULL;
  BEGIN
    INSERT INTO public.decision_overrides (
      id, decision_id, option_id, acted_by, consent_method, consent_evidence
    ) VALUES (
      'f8500000-0000-4000-8000-000000000013',
      'f8100000-0000-4000-8000-000000000014',
      'f8200000-0000-4000-8000-000000000015',
      'f8000000-0000-4000-8000-000000000001',
      'written', 'Wrong parent option'
    );
  EXCEPTION WHEN check_violation THEN
    v_error := SQLERRM;
  END;
  ASSERT v_error IS NOT NULL,
    'direct override evidence must bind its option to the same decision';

  PERFORM pg_temp.assume_journey_actor(
    'f8000000-0000-4000-8000-000000000003'
  );
  ASSERT (SELECT count(*) = 2
          FROM public.decision_overrides
          WHERE id IN (
            'f8500000-0000-4000-8000-000000000001',
            'f8500000-0000-4000-8000-000000000003'
          )),
    'active studio peer must read owner-authored override evidence';
  INSERT INTO public.decision_overrides (
    id, decision_id, option_id, acted_by, consent_method, consent_evidence,
    created_at
  ) VALUES (
    'f8500000-0000-4000-8000-000000000002',
    'f8100000-0000-4000-8000-000000000014',
    'f8200000-0000-4000-8000-000000000017',
    'f8000000-0000-4000-8000-000000000003',
    'email_excerpt', 'Peer recorded preliminary client consent',
    '2000-01-01T00:00:00Z'
  );
  ASSERT (SELECT created_at > now() - interval '1 minute'
          FROM public.decision_overrides
          WHERE id = 'f8500000-0000-4000-8000-000000000002'),
    'studio-peer override birth timestamp must be server-owned';

  PERFORM pg_temp.assume_journey_actor(
    'f8000000-0000-4000-8000-000000000002'
  );
  ASSERT (SELECT count(*) = 2
          FROM public.decision_overrides
          WHERE decision_id = 'f8100000-0000-4000-8000-000000000014'),
    'addressed client must read sent override evidence from owner and peer';
  ASSERT NOT public.is_addressed_client_decision(
    'f8100000-0000-4000-8000-000000000003'
  ) AND NOT EXISTS (
    SELECT 1 FROM public.client_decisions
    WHERE id = 'f8100000-0000-4000-8000-000000000003'
  ) AND NOT EXISTS (
    SELECT 1 FROM public.client_decision_options
    WHERE id = 'f8200000-0000-4000-8000-000000000004'
  ) AND NOT EXISTS (
    SELECT 1 FROM public.decision_overrides
    WHERE id = 'f8500000-0000-4000-8000-000000000003'
  ), 'addressed client must not see draft decision, options, or override evidence';

  v_error := NULL;
  BEGIN
    INSERT INTO public.decision_overrides (
      id, decision_id, option_id, acted_by, consent_method, consent_evidence
    ) VALUES (
      'f8500000-0000-4000-8000-000000000004',
      'f8100000-0000-4000-8000-000000000014',
      'f8200000-0000-4000-8000-000000000017',
      'f8000000-0000-4000-8000-000000000002',
      'verbal', 'Client must not forge override evidence'
    );
  EXCEPTION WHEN insufficient_privilege THEN
    v_error := SQLERRM;
  END;
  ASSERT v_error IS NOT NULL,
    'addressed client must not receive override insert authority';

  v_error := NULL;
  PERFORM pg_temp.assume_journey_actor(
    'f8000000-0000-4000-8000-000000000004'
  );
  ASSERT NOT EXISTS (
    SELECT 1 FROM public.decision_overrides
    WHERE decision_id = 'f8100000-0000-4000-8000-000000000014'
  ), 'outsider must not read studio/client override evidence';
  BEGIN
    INSERT INTO public.decision_overrides (
      id, decision_id, option_id, acted_by, consent_method, consent_evidence
    ) VALUES (
      'f8500000-0000-4000-8000-000000000005',
      'f8100000-0000-4000-8000-000000000014',
      'f8200000-0000-4000-8000-000000000017',
      'f8000000-0000-4000-8000-000000000004',
      'verbal', 'Outsider must not forge override evidence'
    );
  EXCEPTION WHEN insufficient_privilege THEN
    v_error := SQLERRM;
  END;
  ASSERT v_error IS NOT NULL,
    'outsider must not receive override insert authority';

  -- The broad historical helper deliberately admits peers in any shared
  -- organization. That must not confer client-document or proposal-copy
  -- authority when the only shared organization is a contractor.
  v_error := NULL;
  PERFORM pg_temp.assume_journey_actor(
    'f8000000-0000-4000-8000-000000000005'
  );
  ASSERT public.is_studio_comember(
           'f8000000-0000-4000-8000-000000000001'
         ) AND NOT public.is_design_studio_comember(
           'f8000000-0000-4000-8000-000000000001'
         ),
    'shared contractor must prove the broad-helper/exact-helper distinction';
  ASSERT NOT EXISTS (
    SELECT 1 FROM public.decision_overrides
    WHERE decision_id = 'f8100000-0000-4000-8000-000000000014'
  ), 'shared contractor must not read override evidence';

  BEGIN
    INSERT INTO public.decision_overrides (
      id, decision_id, option_id, acted_by, consent_method, consent_evidence
    ) VALUES (
      'f8500000-0000-4000-8000-000000000006',
      'f8100000-0000-4000-8000-000000000014',
      'f8200000-0000-4000-8000-000000000017',
      'f8000000-0000-4000-8000-000000000005',
      'verbal', 'Shared contractor must not forge override evidence'
    );
  EXCEPTION WHEN insufficient_privilege THEN
    v_error := SQLERRM;
  END;
  ASSERT v_error IS NOT NULL,
    'shared contractor must not insert client-decision override evidence';

  v_error := NULL;
  BEGIN
    INSERT INTO public.client_decisions (
      id, designer_client_id, project_id, title, status,
      coordination_kind, court
    ) VALUES (
      'f8100000-0000-4000-8000-000000000018',
      'f8030000-0000-4000-8000-000000000001',
      'f8040000-0000-4000-8000-000000000001',
      'Shared contractor forged decision', 'pending', 'selection', 'client'
    );
  EXCEPTION WHEN insufficient_privilege THEN
    v_error := SQLERRM;
  END;
  ASSERT v_error IS NOT NULL,
    'shared contractor must not author a client decision';

  v_error := NULL;
  BEGIN
    PERFORM public.notify_decision_required(
      'f8100000-0000-4000-8000-000000000014'
    );
  EXCEPTION WHEN insufficient_privilege THEN
    v_error := SQLERRM;
  END;
  ASSERT v_error IS NOT NULL,
    'shared contractor must not enqueue a studio decision notification';

  v_error := NULL;
  BEGIN
    INSERT INTO public.proposal_phase_deliverables (
      id, phase_id, label, description, is_required, sort_order
    ) VALUES (
      'f8620000-0000-4000-8000-000000000001',
      'f8610000-0000-4000-8000-000000000001',
      'Shared contractor forged deliverable',
      'Contractor membership is not proposal authorship', true, 0
    );
  EXCEPTION WHEN insufficient_privilege THEN
    v_error := SQLERRM;
  END;
  ASSERT v_error IS NOT NULL,
    'shared contractor must not write a proposal child row';

  PERFORM pg_temp.assume_journey_actor(
    'f8000000-0000-4000-8000-000000000001'
  );
  ASSERT NOT EXISTS (
    SELECT 1 FROM public.decision_overrides
    WHERE id IN (
      'f8500000-0000-4000-8000-000000000004',
      'f8500000-0000-4000-8000-000000000005',
      'f8500000-0000-4000-8000-000000000006'
    )
  ) AND NOT EXISTS (
    SELECT 1 FROM public.client_decisions
    WHERE id = 'f8100000-0000-4000-8000-000000000018'
  ) AND NOT EXISTS (
    SELECT 1 FROM public.proposal_phase_deliverables
    WHERE id = 'f8620000-0000-4000-8000-000000000001'
  ), 'rejected client/outsider/contractor writes must not persist';
END;
$$;

-- Installed extension/web bundles create decisions and options directly.
-- Keep those exact births and draft editor mutations without reopening
-- resolved truth or anonymous writes.
INSERT INTO public.client_decisions (
  id, designer_client_id, project_id, title, context, due_date, status,
  coordination_kind, court, created_at, updated_at, sent_at, viewed_at,
  reminder_sent_at
) VALUES (
  'f8100000-0000-4000-8000-000000000008',
  'f8030000-0000-4000-8000-000000000001',
  'f8040000-0000-4000-8000-000000000001',
  'Extension pending decision', 'Captured in the installed extension',
  now() + interval '9 days', 'pending', 'selection', 'client',
  '2000-01-01T00:00:00Z', '2000-01-01T00:00:00Z',
  '2000-01-01T00:00:00Z', '2000-01-01T00:00:00Z',
  '2000-01-01T00:00:00Z'
);

INSERT INTO public.client_decision_options (
  id, decision_id, name, price, quantity, selected, sort_order, created_at,
  is_recommended, product_id
) VALUES (
  'f8200000-0000-4000-8000-000000000008',
  'f8100000-0000-4000-8000-000000000008',
  'Extension option', 7200, 1, false, 0, '2000-01-01T00:00:00Z',
  true, 'f8050000-0000-4000-8000-000000000001'
);

DO $$
DECLARE
  v_error text;
BEGIN
  BEGIN
    INSERT INTO public.client_decision_options (
      id, decision_id, name, price, quantity, selected, sort_order
    ) VALUES (
      'f8200000-0000-4000-8000-000000000013',
      'f8100000-0000-4000-8000-000000000008',
      'Invalid extension quantity', 7200, 0, false, 1
    );
  EXCEPTION WHEN check_violation THEN
    v_error := SQLERRM;
  END;
  ASSERT v_error IS NOT NULL,
    'extension option insert must reject a non-positive quantity';

  v_error := NULL;
  BEGIN
    INSERT INTO public.client_decision_options (
      id, decision_id, name, price, quantity, selected, sort_order,
      is_recommended, product_id
    ) VALUES (
      'f8200000-0000-4000-8000-000000000021',
      'f8100000-0000-4000-8000-000000000008',
      'Forbidden second pending option', 7300, 1, false, 1,
      false, 'f8050000-0000-4000-8000-000000000001'
    );
  EXCEPTION WHEN check_violation THEN
    v_error := SQLERRM;
  END;
  ASSERT v_error IS NOT NULL
         AND NOT EXISTS (
           SELECT 1 FROM public.client_decision_options
           WHERE id = 'f8200000-0000-4000-8000-000000000021'
         ),
    'pending extension birth must reject every second option';
END;
$$;

UPDATE public.client_decisions
SET due_date = current_date::timestamptz
WHERE id = 'f8100000-0000-4000-8000-000000000008';

INSERT INTO public.client_decisions (
  id, designer_client_id, project_id, title, status,
  coordination_kind, court
) VALUES
  ('f8100000-0000-4000-8000-000000000009',
   'f8030000-0000-4000-8000-000000000001',
   'f8040000-0000-4000-8000-000000000001',
   'Rollback draft editor', 'draft', 'selection', 'client'),
  ('f8100000-0000-4000-8000-000000000010',
   'f8030000-0000-4000-8000-000000000001',
   'f8040000-0000-4000-8000-000000000001',
   'Rollback disposable draft', 'draft', 'selection', 'client');

INSERT INTO public.project_ffe_items (
  id, project_id, name, blocked, blocked_reason, blocked_by_decision_id
) VALUES (
  'f8300000-0000-4000-8000-000000000001',
  'f8040000-0000-4000-8000-000000000001',
  'Disposable draft blocker line', true, 'Waiting on draft decision',
  'f8100000-0000-4000-8000-000000000010'
);

INSERT INTO public.project_tasks (
  id, project_id, title, status, created_by, blocked_by_item_id
) VALUES (
  'f8400000-0000-4000-8000-000000000001',
  'f8040000-0000-4000-8000-000000000001',
  'Disposable draft blocked task', 'blocked',
  'f8000000-0000-4000-8000-000000000001',
  'f8100000-0000-4000-8000-000000000010'
);

INSERT INTO public.client_decision_options (
  id, decision_id, name, price, quantity, selected, is_recommended, sort_order
) VALUES
  ('f8200000-0000-4000-8000-000000000009',
   'f8100000-0000-4000-8000-000000000009',
   'Draft recommended option before replacement', 8100, 1, false, true, 0),
  ('f8200000-0000-4000-8000-000000000014',
   'f8100000-0000-4000-8000-000000000009',
   'Draft non-recommended option before replacement', 8050, 1, false, false, 1),
  ('f8200000-0000-4000-8000-000000000012',
   'f8100000-0000-4000-8000-000000000010',
   'Disposable draft cascade option', 4000, 1, false, false, 0);

UPDATE public.client_decisions
SET title = 'Rollback draft edited',
    context = 'Only historical draft fields changed'
WHERE id = 'f8100000-0000-4000-8000-000000000009';

DO $$
DECLARE
  v_error text;
BEGIN
  BEGIN
    UPDATE public.client_decisions
    SET decision_type = 'approval'
    WHERE id = 'f8100000-0000-4000-8000-000000000016';
  EXCEPTION WHEN check_violation THEN
    v_error := SQLERRM;
  END;
  ASSERT v_error IS NOT NULL
         AND pg_temp.decision_truth(
               'f8100000-0000-4000-8000-000000000016'
             )->>'decision_type' = 'product',
    'draft editor must not escalate a linked proposal into signature authority';
END;
$$;

DELETE FROM public.client_decision_options
WHERE decision_id = 'f8100000-0000-4000-8000-000000000009';

DO $$
BEGIN
  ASSERT pg_temp.decision_truth(
           'f8100000-0000-4000-8000-000000000009'
         )->>'recommended_option_id' IS NULL,
    'deleting the recommended draft option must safely clear its parent mirror';
END;
$$;

INSERT INTO public.client_decision_options (
  id, decision_id, name, price, quantity, selected, is_recommended, sort_order
) VALUES (
  'f8200000-0000-4000-8000-000000000010',
  'f8100000-0000-4000-8000-000000000009',
  'Draft replacement option', 8300, 1, false, true, 0
);

UPDATE public.client_decisions
SET status = 'pending', sent_at = '2000-01-01T00:00:00Z'
WHERE id = 'f8100000-0000-4000-8000-000000000009';

DELETE FROM public.client_decisions
WHERE id = 'f8100000-0000-4000-8000-000000000010';

DO $$
BEGIN
  ASSERT (SELECT designer_id = 'f8000000-0000-4000-8000-000000000001'
          FROM public.client_decisions
          WHERE id = 'f8100000-0000-4000-8000-000000000008'),
    'extension insert must bind the relationship designer server-side';
  ASSERT (SELECT count(*) = 1
          FROM public.client_decision_options
          WHERE id = 'f8200000-0000-4000-8000-000000000008'),
    'extension option insert must survive the attached authority guard';
  ASSERT (SELECT created_at > now() - interval '1 minute'
          FROM public.client_decision_options
          WHERE id = 'f8200000-0000-4000-8000-000000000008'),
    'extension option birth must use a server-owned audit timestamp';
  ASSERT (SELECT created_at > now() - interval '1 minute'
                 AND updated_at > now() - interval '1 minute'
                 AND sent_at > now() - interval '1 minute'
                 AND viewed_at IS NULL
                 AND reminder_sent_at IS NULL
          FROM public.client_decisions
          WHERE id = 'f8100000-0000-4000-8000-000000000008'),
    'pending extension birth must normalize every caller-controlled audit timestamp';
  ASSERT (
    pg_temp.decision_truth(
      'f8100000-0000-4000-8000-000000000008'
    )->>'due_date'
  )::timestamptz > now(),
    'rollback today-date extension must normalize to a future instant';
  ASSERT (SELECT status = 'pending'
                 AND title = 'Rollback draft edited'
                 AND sent_at > now() - interval '1 minute'
          FROM public.client_decisions
          WHERE id = 'f8100000-0000-4000-8000-000000000009'),
    'rollback draft edit/publish must work and use a server-owned sent_at';
  ASSERT NOT EXISTS (
    SELECT 1 FROM public.client_decisions
    WHERE id = 'f8100000-0000-4000-8000-000000000010'
  ), 'rollback draft delete must cascade through its options';
  ASSERT (SELECT NOT blocked
                 AND blocked_reason IS NULL
                 AND blocked_by_decision_id IS NULL
          FROM public.project_ffe_items
          WHERE id = 'f8300000-0000-4000-8000-000000000001'),
    'rollback draft delete must unblock its gated FF&E row';
  ASSERT (SELECT status = 'todo' AND blocked_by_item_id IS NULL
          FROM public.project_tasks
          WHERE id = 'f8400000-0000-4000-8000-000000000001'),
    'rollback draft delete must restore its gated task to todo';
END;
$$;

-- Editable payload + option replacement is one row-locked operation. A stale
-- updated_at becomes a deterministic write conflict.
DO $$
DECLARE
  v_before timestamptz;
  v_error text;
  v_result public.client_decisions;
BEGIN
  SELECT updated_at INTO v_before
  FROM public.client_decisions
  WHERE id = 'f8100000-0000-4000-8000-000000000003';

  v_result := public.update_client_decision(
    'f8100000-0000-4000-8000-000000000003',
    '{"title":"Edited atomically","context":"Checked payload"}'::jsonb,
    '[{"name":"New A","price":7000,"is_recommended":true},
      {"name":"New B","price":8000}]'::jsonb,
    v_before
  );
  ASSERT v_result.title = 'Edited atomically',
    'checked update must return the edited row';
  ASSERT (SELECT count(*) = 2
          FROM public.client_decision_options
          WHERE decision_id = 'f8100000-0000-4000-8000-000000000003'),
    'checked update must replace options atomically';
  ASSERT (SELECT recommended_option_id IS NOT NULL
          FROM public.client_decisions
          WHERE id = 'f8100000-0000-4000-8000-000000000003'),
    'nested recommendation triggers must retain the outer row capability';

  BEGIN
    PERFORM public.update_client_decision(
      'f8100000-0000-4000-8000-000000000003',
      '{"title":"Stale overwrite"}'::jsonb, NULL, v_before
        - interval '1 microsecond'
    );
  EXCEPTION WHEN serialization_failure THEN
    v_error := SQLERRM;
  END;
  ASSERT v_error IS NOT NULL, 'stale expected_updated_at must reject';
  ASSERT (SELECT title = 'Edited atomically'
          FROM public.client_decisions
          WHERE id = 'f8100000-0000-4000-8000-000000000003'),
    'stale edit must not overwrite the winning payload';
END;
$$;

DO $$
DECLARE
  v_row public.client_decisions;
  v_override_count integer;
  v_error text;
BEGIN
  v_row := public.publish_client_decision(
    'f8100000-0000-4000-8000-000000000003'
  );
  ASSERT v_row.status = 'pending' AND v_row.sent_at IS NOT NULL,
    'publish must atomically enter pending';

  UPDATE public.client_decisions
  SET due_date = current_date::timestamptz,
      reminder_sent_at = '2000-01-01T00:00:00Z'
  WHERE id = 'f8100000-0000-4000-8000-000000000004'
  RETURNING * INTO v_row;
  ASSERT v_row.status = 'expired'
         AND v_row.due_date > now()
         AND v_row.reminder_sent_at > now() - interval '1 minute',
    'rollback today-date extension must become future and own its reminder timestamp';

  UPDATE public.client_decisions
  SET status = 'pending'
  WHERE id = 'f8100000-0000-4000-8000-000000000004'
  RETURNING * INTO v_row;
  ASSERT v_row.status = 'pending'
         AND v_row.responded_at IS NULL
         AND v_row.viewed_at IS NULL
         AND v_row.reminder_sent_at IS NULL
         AND v_row.selected_by IS NULL
         AND v_row.client_consent_method IS NULL
         AND v_row.client_consented_at IS NULL,
    'rollback reopen must clear every stale parent response field';
  ASSERT (SELECT NOT selected AND client_note IS NULL
          FROM public.client_decision_options
          WHERE id = 'f8200000-0000-4000-8000-000000000005'),
    'rollback reopen must clear stale option selection atomically';

  v_row := public.reopen_client_decision(
    'f8100000-0000-4000-8000-000000000019'
  );
  ASSERT v_row.status = 'pending'
         AND v_row.due_date IS NULL
         AND v_row.responded_at IS NULL
         AND v_row.viewed_at IS NULL
         AND v_row.reminder_sent_at IS NULL
         AND v_row.selected_by IS NULL
         AND v_row.client_consent_method IS NULL
         AND v_row.client_consented_at IS NULL,
    'canonical reopen must clear stale response/view/reminder and past deadline';
  ASSERT (SELECT NOT selected AND client_note IS NULL
          FROM public.client_decision_options
          WHERE id = 'f8200000-0000-4000-8000-000000000022'),
    'canonical reopen must clear stale option truth atomically';

  v_error := NULL;
  BEGIN
    PERFORM public.apply_decision_override(
      'f8100000-0000-4000-8000-000000000012',
      'f8200000-0000-4000-8000-000000000015',
      'verbal', 'Wrong-court canonical override'
    );
  EXCEPTION WHEN insufficient_privilege THEN
    v_error := SQLERRM;
  END;
  ASSERT v_error =
      'only client-court selection decisions may be overridden through an option',
    format('canonical wrong-court override must reject, got %L', v_error);

  v_error := NULL;
  BEGIN
    PERFORM public.apply_decision_override(
      'f8100000-0000-4000-8000-000000000013',
      'f8200000-0000-4000-8000-000000000016',
      'verbal', 'Non-selection canonical override'
    );
  EXCEPTION WHEN insufficient_privilege THEN
    v_error := SQLERRM;
  END;
  ASSERT v_error =
      'only client-court selection decisions may be overridden through an option',
    format('canonical non-selection override must reject, got %L', v_error);

  v_error := NULL;
  BEGIN
    PERFORM public.apply_decision(
      'f8100000-0000-4000-8000-000000000012',
      'f8200000-0000-4000-8000-000000000015',
      'f8000000-0000-4000-8000-000000000002'
    );
  EXCEPTION WHEN insufficient_privilege THEN
    v_error := SQLERRM;
  END;
  ASSERT v_error =
      'only client-court selection decisions may be overridden through an option',
    format('legacy wrong-court override must reject, got %L', v_error);

  v_error := NULL;
  BEGIN
    PERFORM public.apply_decision(
      'f8100000-0000-4000-8000-000000000013',
      'f8200000-0000-4000-8000-000000000016',
      'f8000000-0000-4000-8000-000000000002'
    );
  EXCEPTION WHEN insufficient_privilege THEN
    v_error := SQLERRM;
  END;
  ASSERT v_error =
      'only client-court selection decisions may be overridden through an option',
    format('legacy non-selection override must reject, got %L', v_error);

  v_error := NULL;
  BEGIN
    PERFORM public.apply_decision(
      'f8100000-0000-4000-8000-000000000017',
      'f8200000-0000-4000-8000-000000000020',
      'f8000000-0000-4000-8000-000000000002'
    );
  EXCEPTION WHEN insufficient_privilege THEN
    v_error := SQLERRM;
  END;
  ASSERT v_error =
      'apply_decision requires the addressed client or an audited studio override'
     AND (SELECT status = 'pending'
          FROM public.client_decisions
          WHERE id = 'f8100000-0000-4000-8000-000000000017'),
    format('legacy apply must reject malformed historical evidence, got %L', v_error);

  v_row := public.apply_decision_override(
    'f8100000-0000-4000-8000-000000000002',
    'f8200000-0000-4000-8000-000000000003',
    'verbal', 'Client confirmed on recorded call'
  );
  ASSERT v_row.status = 'responded'
         AND v_row.selected_by = 'f8000000-0000-4000-8000-000000000001',
    'override must attribute the actual designer caller';
  SELECT count(*) INTO v_override_count
  FROM public.decision_overrides
  WHERE decision_id = 'f8100000-0000-4000-8000-000000000002';
  PERFORM public.apply_decision_override(
    'f8100000-0000-4000-8000-000000000002',
    'f8200000-0000-4000-8000-000000000003',
    'verbal', 'Client confirmed on recorded call'
  );
  ASSERT (SELECT count(*) = v_override_count
          FROM public.decision_overrides
          WHERE decision_id = 'f8100000-0000-4000-8000-000000000002'),
    'same-winner override retry must not duplicate evidence';

  INSERT INTO public.decision_overrides (
    id, decision_id, option_id, acted_by, consent_method, consent_evidence
  ) VALUES (
    'f8500000-0000-4000-8000-000000000007',
    'f8100000-0000-4000-8000-000000000015',
    'f8200000-0000-4000-8000-000000000018',
    'f8000000-0000-4000-8000-000000000001',
    'written', 'Legacy claimed-client override evidence'
  );
  PERFORM public.apply_decision(
    'f8100000-0000-4000-8000-000000000015',
    'f8200000-0000-4000-8000-000000000018',
    'f8000000-0000-4000-8000-000000000002'
  );
  SELECT * INTO STRICT v_row
  FROM public.client_decisions
  WHERE id = 'f8100000-0000-4000-8000-000000000015';
  ASSERT v_row.status = 'responded'
         AND v_row.selected_by = 'f8000000-0000-4000-8000-000000000001',
    'legacy claimed-client override must attribute the authenticated studio actor';

  v_error := NULL;
  BEGIN
    INSERT INTO public.decision_overrides (
      id, decision_id, option_id, acted_by, consent_method, consent_evidence
    ) VALUES (
      'f8500000-0000-4000-8000-000000000008',
      'f8100000-0000-4000-8000-000000000015',
      'f8200000-0000-4000-8000-000000000018',
      'f8000000-0000-4000-8000-000000000001',
      'written', 'Late evidence must reject'
    );
  EXCEPTION WHEN check_violation THEN
    v_error := SQLERRM;
  END;
  ASSERT v_error = 'override evidence requires a pending decision'
         AND NOT EXISTS (
           SELECT 1 FROM public.decision_overrides
           WHERE id = 'f8500000-0000-4000-8000-000000000008'
         ),
    'terminal late override evidence must recheck lifecycle without a receipt';

  v_error := NULL;
  BEGIN
    INSERT INTO public.client_decision_options (
      id, decision_id, name, price, quantity, selected, sort_order
    ) VALUES (
      'f8200000-0000-4000-8000-000000000019',
      'f8100000-0000-4000-8000-000000000015',
      'Late option must reject', 7000, 1, false, 1
    );
  EXCEPTION WHEN insufficient_privilege THEN
    v_error := SQLERRM;
  END;
  ASSERT v_error =
           'not authorized to add an option to decision f8100000-0000-4000-8000-000000000015'
         AND NOT EXISTS (
           SELECT 1 FROM public.client_decision_options
           WHERE id = 'f8200000-0000-4000-8000-000000000019'
         ),
    'terminal direct option INSERT must recheck lifecycle without a child';

  INSERT INTO public.decision_overrides (
    decision_id, option_id, acted_by, consent_method, consent_evidence
  ) VALUES (
    'f8100000-0000-4000-8000-000000000011',
    'f8200000-0000-4000-8000-000000000011',
    'f8000000-0000-4000-8000-000000000001',
    'verbal', 'Profileless client confirmed in person'
  );
  PERFORM public.apply_decision(
    'f8100000-0000-4000-8000-000000000011',
    'f8200000-0000-4000-8000-000000000011',
    'f8000000-0000-4000-8000-000000000001'
  );
  SELECT * INTO STRICT v_row
  FROM public.client_decisions
  WHERE id = 'f8100000-0000-4000-8000-000000000011';
  ASSERT v_row.status = 'responded'
         AND v_row.selected_by = 'f8000000-0000-4000-8000-000000000001',
    'legacy profileless override must attribute the audited studio actor';
END;
$$;

-- Browser attribution ignores the legacy caller-id parameters.
DO $$
DECLARE
  v_item public.client_decisions;
  v_revision public.coordination_item_revisions;
BEGIN
  v_item := public.resolve_coordination_item(
    'f8100000-0000-4000-8000-000000000005', NULL,
    'Verified field answer', NULL, NULL,
    'f8000000-0000-4000-8000-000000000002'
  );
  ASSERT v_item.status = 'responded'
         AND v_item.selected_by = 'f8000000-0000-4000-8000-000000000001'
         AND v_item.answered_by = 'f8000000-0000-4000-8000-000000000001',
    'resolve must store auth.uid(), never p_resolved_by';

  v_revision := public.submit_coordination_revision(
    'f8100000-0000-4000-8000-000000000006', '[]'::jsonb,
    'Vendor resubmittal', 'submitted',
    'f8000000-0000-4000-8000-000000000002'
  );
  ASSERT v_revision.submitted_by = 'f8000000-0000-4000-8000-000000000001',
    'revision must store auth.uid(), never p_submitted_by';
END;
$$;

SELECT pg_temp.assume_journey_actor('f8000000-0000-4000-8000-000000000002');
DO $$
DECLARE
  v_row public.client_decisions;
  v_error text;
  v_rows integer;
BEGIN
  BEGIN
    PERFORM public.apply_decision(
      'f8100000-0000-4000-8000-000000000001',
      'f8200000-0000-4000-8000-000000000001',
      'f8000000-0000-4000-8000-000000000001'
    );
  EXCEPTION WHEN insufficient_privilege THEN
    v_error := SQLERRM;
  END;
  ASSERT v_error = 'p_selected_by must match the authenticated client',
    format('legacy actor spoof must reject, got %L', v_error);

  -- Public option-apply wrappers are deliberately narrower than the general
  -- coordination resolver: only client-court selections may use them. A
  -- designer-court selection and a client-court non-selection both carry
  -- decoy options to prove option existence cannot bypass that boundary.
  v_error := NULL;
  BEGIN
    PERFORM public.apply_client_decision(
      'f8100000-0000-4000-8000-000000000012',
      'f8200000-0000-4000-8000-000000000015'
    );
  EXCEPTION WHEN insufficient_privilege THEN
    v_error := SQLERRM;
  END;
  ASSERT v_error =
      'only client-court selection decisions may be applied by the addressed client',
    format('modern wrong-court apply must reject, got %L', v_error);

  v_error := NULL;
  BEGIN
    PERFORM public.apply_decision(
      'f8100000-0000-4000-8000-000000000012',
      'f8200000-0000-4000-8000-000000000015',
      'f8000000-0000-4000-8000-000000000002'
    );
  EXCEPTION WHEN insufficient_privilege THEN
    v_error := SQLERRM;
  END;
  ASSERT v_error =
      'only client-court selection decisions may be applied by the addressed client',
    format('legacy wrong-court apply must reject, got %L', v_error);

  v_error := NULL;
  BEGIN
    PERFORM public.apply_client_decision(
      'f8100000-0000-4000-8000-000000000013',
      'f8200000-0000-4000-8000-000000000016'
    );
  EXCEPTION WHEN insufficient_privilege THEN
    v_error := SQLERRM;
  END;
  ASSERT v_error =
      'only client-court selection decisions may be applied by the addressed client',
    format('modern non-selection apply must reject, got %L', v_error);

  v_error := NULL;
  BEGIN
    PERFORM public.apply_decision(
      'f8100000-0000-4000-8000-000000000013',
      'f8200000-0000-4000-8000-000000000016',
      'f8000000-0000-4000-8000-000000000002'
    );
  EXCEPTION WHEN insufficient_privilege THEN
    v_error := SQLERRM;
  END;
  ASSERT v_error =
      'only client-court selection decisions may be applied by the addressed client',
    format('legacy non-selection apply must reject, got %L', v_error);
  ASSERT pg_temp.decision_truth(
           'f8100000-0000-4000-8000-000000000012'
         )->>'status' = 'pending'
     AND pg_temp.decision_truth(
           'f8100000-0000-4000-8000-000000000013'
         )->>'status' = 'pending'
     AND NOT (
       pg_temp.option_truth(
         'f8200000-0000-4000-8000-000000000015'
       )->>'selected'
     )::boolean
     AND NOT (
       pg_temp.option_truth(
         'f8200000-0000-4000-8000-000000000016'
       )->>'selected'
     )::boolean,
    'rejected wrong-court/kind applies must preserve pending option truth';

  UPDATE public.client_decision_options
  SET client_note = 'Wrong-court forged note', quantity = 9
  WHERE id = 'f8200000-0000-4000-8000-000000000015';
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  ASSERT v_rows = 0
     AND pg_temp.option_truth(
           'f8200000-0000-4000-8000-000000000015'
         )->>'client_note' IS NULL
     AND (pg_temp.option_truth(
            'f8200000-0000-4000-8000-000000000015'
          )->>'quantity')::integer = 1,
    'client option note/quantity bridge must deny designer-court selection';

  UPDATE public.client_decision_options
  SET client_note = 'Non-selection forged note', quantity = 9
  WHERE id = 'f8200000-0000-4000-8000-000000000016';
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  ASSERT v_rows = 0
     AND pg_temp.option_truth(
           'f8200000-0000-4000-8000-000000000016'
         )->>'client_note' IS NULL
     AND (pg_temp.option_truth(
            'f8200000-0000-4000-8000-000000000016'
          )->>'quantity')::integer = 1,
    'client option note/quantity bridge must deny non-selection rows';

  v_error := NULL;
  BEGIN
    UPDATE public.client_decisions
    SET client_consent_method = 'click_through',
        client_consented_at = '2000-01-01T00:00:00Z'
    WHERE id = 'f8100000-0000-4000-8000-000000000012';
  EXCEPTION WHEN check_violation THEN
    v_error := SQLERRM;
  END;
  ASSERT v_error IS NOT NULL
     AND pg_temp.decision_truth(
           'f8100000-0000-4000-8000-000000000012'
         )->>'client_consent_method' IS NULL,
    'pending consent bridge must deny designer-court selection';

  v_error := NULL;
  BEGIN
    UPDATE public.client_decisions
    SET client_consent_method = 'click_through',
        client_consented_at = '2000-01-01T00:00:00Z'
    WHERE id = 'f8100000-0000-4000-8000-000000000013';
  EXCEPTION WHEN check_violation THEN
    v_error := SQLERRM;
  END;
  ASSERT v_error IS NOT NULL
     AND pg_temp.decision_truth(
           'f8100000-0000-4000-8000-000000000013'
         )->>'client_consent_method' IS NULL,
    'pending consent bridge must deny client-court non-selection';

  -- An actual studio override is studio-attributed, so the addressed client
  -- cannot append client consent after the terminal act.
  v_error := NULL;
  BEGIN
    UPDATE public.client_decisions
    SET client_consent_method = 'click_through',
        client_consented_at = '2000-01-01T00:00:00Z'
    WHERE id = 'f8100000-0000-4000-8000-000000000015';
  EXCEPTION WHEN check_violation THEN
    v_error := SQLERRM;
  END;
  ASSERT v_error IS NOT NULL
     AND pg_temp.decision_truth(
           'f8100000-0000-4000-8000-000000000015'
         )->>'client_consent_method' IS NULL,
    'post-override consent bridge must deny a designer-attributed response';

  v_error := NULL;
  BEGIN
    UPDATE public.client_decisions
    SET client_consent_method = 'click_through',
        client_consented_at = '2000-01-01T00:00:00Z'
    WHERE id = 'f8100000-0000-4000-8000-000000000005';
  EXCEPTION WHEN check_violation THEN
    v_error := SQLERRM;
  END;
  ASSERT v_error IS NOT NULL
     AND pg_temp.decision_truth(
           'f8100000-0000-4000-8000-000000000005'
         )->>'client_consent_method' IS NULL,
    'post-coordination consent bridge must deny a non-selection response';

  -- A failed legacy override can leave a valid pending audit receipt. If the
  -- client later makes the real selection, self-attribution—not receipt
  -- existence—controls the post-apply installed-client consent bridge.
  v_row := public.apply_client_decision(
    'f8100000-0000-4000-8000-000000000014',
    'f8200000-0000-4000-8000-000000000017'
  );
  UPDATE public.client_decisions
  SET client_consent_method = 'click_through',
      client_consented_at = '2000-01-01T00:00:00Z'
  WHERE id = 'f8100000-0000-4000-8000-000000000014';
  ASSERT pg_temp.decision_truth(
           'f8100000-0000-4000-8000-000000000014'
         )->>'selected_by' = 'f8000000-0000-4000-8000-000000000002'
     AND pg_temp.decision_truth(
           'f8100000-0000-4000-8000-000000000014'
         )->>'client_consent_method' = 'click_through'
     AND (
       pg_temp.decision_truth(
         'f8100000-0000-4000-8000-000000000014'
       )->>'client_consented_at'
     )::timestamptz > now() - interval '1 minute',
    'orphan override receipt must not block later self-response consent';

  v_error := NULL;
  BEGIN
    UPDATE public.client_decisions
    SET title = 'Forged by client'
    WHERE id = 'f8100000-0000-4000-8000-000000000001';
  EXCEPTION WHEN OTHERS THEN
    v_error := SQLERRM;
  END;
  ASSERT pg_temp.decision_truth(
           'f8100000-0000-4000-8000-000000000001'
         )->>'title' = 'Client atomic apply',
    format('client must not rewrite designer-owned decision content (error %L)', v_error);

  v_error := NULL;
  BEGIN
    UPDATE public.client_decisions
    SET status = 'responded'
    WHERE id = 'f8100000-0000-4000-8000-000000000001';
  EXCEPTION WHEN OTHERS THEN
    v_error := SQLERRM;
  END;
  ASSERT pg_temp.decision_truth(
           'f8100000-0000-4000-8000-000000000001'
         )->>'status' = 'pending',
    format('client must not forge a lifecycle transition (error %L)', v_error);

  v_error := NULL;
  BEGIN
    UPDATE public.client_decision_options
    SET selected = true
    WHERE id = 'f8200000-0000-4000-8000-000000000001';
  EXCEPTION WHEN OTHERS THEN
    v_error := SQLERRM;
  END;
  ASSERT NOT (
    pg_temp.option_truth(
      'f8200000-0000-4000-8000-000000000001'
    )->>'selected'
  )::boolean,
    format('client must not directly forge selected truth (error %L)', v_error);

  UPDATE public.client_decision_options
  SET client_note = 'Place near the window', quantity = 3
  WHERE id = 'f8200000-0000-4000-8000-000000000001';

  UPDATE public.client_decisions
  SET viewed_at = '2000-01-01T00:00:00Z'
  WHERE id = 'f8100000-0000-4000-8000-000000000001';
  ASSERT (
    pg_temp.decision_truth(
      'f8100000-0000-4000-8000-000000000001'
    )->>'viewed_at'
  )::timestamptz > now() - interval '1 minute',
    'installed-client viewed PATCH must use a server-owned timestamp';

  v_error := NULL;
  BEGIN
    UPDATE public.client_decisions
    SET client_consented_at = now()
    WHERE id = 'f8100000-0000-4000-8000-000000000001';
  EXCEPTION WHEN check_violation THEN
    v_error := SQLERRM;
  END;
  ASSERT v_error IS NOT NULL
         AND pg_temp.decision_truth(
               'f8100000-0000-4000-8000-000000000001'
             )->>'client_consented_at' IS NULL,
    'partial consent timestamp must reject without poisoning the row';

  v_error := NULL;
  BEGIN
    UPDATE public.client_decisions
    SET client_consent_method = 'paper',
        client_consented_at = now()
    WHERE id = 'f8100000-0000-4000-8000-000000000001';
  EXCEPTION WHEN check_violation THEN
    v_error := SQLERRM;
  END;
  ASSERT v_error IS NOT NULL
         AND pg_temp.decision_truth(
               'f8100000-0000-4000-8000-000000000001'
             )->>'client_consent_method' IS NULL,
    'client bridge must reject forged paper consent without poisoning the row';

  v_error := NULL;
  BEGIN
    UPDATE public.client_decisions
    SET client_consent_method = 'electronic_signature',
        client_signature = 'X',
        client_consented_at = now()
    WHERE id = 'f8100000-0000-4000-8000-000000000001';
  EXCEPTION WHEN check_violation THEN
    v_error := SQLERRM;
  END;
  ASSERT v_error IS NOT NULL
         AND pg_temp.decision_truth(
               'f8100000-0000-4000-8000-000000000001'
             )->>'client_consent_method' IS NULL,
    'pre-apply bridge must enforce the web signed-name minimum';

  UPDATE public.client_decisions
  SET client_consent_method = 'electronic_signature',
      client_signature = 'Journey Client',
      client_consented_at = '2000-01-01T00:00:00Z'
  WHERE id = 'f8100000-0000-4000-8000-000000000001';
  ASSERT (
    pg_temp.decision_truth(
      'f8100000-0000-4000-8000-000000000001'
    )->>'client_consented_at'
  )::timestamptz > now() - interval '1 minute',
    'rollback consent PATCH must use a server-owned evidence timestamp';

  PERFORM public.apply_decision(
    'f8100000-0000-4000-8000-000000000001',
    'f8200000-0000-4000-8000-000000000001',
    'f8000000-0000-4000-8000-000000000002'
  );
  SELECT * INTO STRICT v_row
  FROM public.client_decisions
  WHERE id = 'f8100000-0000-4000-8000-000000000001';
  ASSERT v_row.status = 'responded'
         AND v_row.selected_by = 'f8000000-0000-4000-8000-000000000002'
         AND v_row.client_consent_method = 'electronic_signature'
         AND v_row.client_signature = 'Journey Client'
         AND v_row.client_consented_at IS NOT NULL,
    'rollback apply wrapper must preserve prewritten consent under the actual actor';
  ASSERT pg_temp.option_matches_client_truth(
    'f8200000-0000-4000-8000-000000000001', 'Place near the window', 3
  ),
    'winning option note/quantity must be in the same atomic act';

  -- Same winner is a deterministic receipt and cannot mutate terminal truth.
  v_row := public.apply_client_decision(
    'f8100000-0000-4000-8000-000000000001',
    'f8200000-0000-4000-8000-000000000001',
    'click_through', NULL, 'retry overwrite', 9
  );
  ASSERT pg_temp.option_matches_client_truth(
    'f8200000-0000-4000-8000-000000000001', 'Place near the window', 3
  ),
    'same-winner retry must not rewrite terminal option evidence';

  v_row := public.apply_client_decision(
    'f8100000-0000-4000-8000-000000000008',
    'f8200000-0000-4000-8000-000000000008'
  );
  UPDATE public.client_decisions
  SET client_consent_method = 'electronic_signature',
      client_signature = 'Q',
      client_consented_at = '2000-01-01T00:00:00Z'
  WHERE id = 'f8100000-0000-4000-8000-000000000008';
  ASSERT pg_temp.decision_truth(
           'f8100000-0000-4000-8000-000000000008'
         )->>'client_signature' = 'Q'
     AND (
       pg_temp.decision_truth(
         'f8100000-0000-4000-8000-000000000008'
       )->>'client_consented_at'
     )::timestamptz > now() - interval '1 minute',
    'installed iOS post-apply bridge must retain its non-empty signature contract';

  v_error := NULL;
  BEGIN
    PERFORM public.apply_client_decision(
      'f8100000-0000-4000-8000-000000000001',
      'f8200000-0000-4000-8000-000000000002',
      'click_through', NULL, NULL, NULL
    );
  EXCEPTION WHEN serialization_failure THEN
    v_error := SQLERRM;
  END;
  ASSERT v_error IS NOT NULL, 'different-winner retry must be a stale conflict';

  -- The addressed client may receive the already-resolved coordination receipt
  -- even though its court moved; this never bypasses authorization.
  v_row := public.resolve_coordination_item(
    'f8100000-0000-4000-8000-000000000005', NULL,
    'Verified field answer'
  );
  ASSERT v_row.status = 'responded', 'authorized retry should return its receipt';
END;
$$;

SELECT pg_temp.assume_journey_actor('f8000000-0000-4000-8000-000000000004');
DO $$
DECLARE
  v_error text;
BEGIN
  BEGIN
    PERFORM public.apply_client_decision(
      'f8100000-0000-4000-8000-000000000001',
      'f8200000-0000-4000-8000-000000000001'
    );
  EXCEPTION WHEN insufficient_privilege THEN
    v_error := SQLERRM;
  END;
  ASSERT v_error = 'only the addressed client may apply this decision',
    format('foreign client apply should reject, got %L', v_error);

  v_error := NULL;
  BEGIN
    PERFORM public.resolve_coordination_item(
      'f8100000-0000-4000-8000-000000000005'
    );
  EXCEPTION WHEN insufficient_privilege THEN
    v_error := SQLERRM;
  END;
  ASSERT v_error =
    'not authorized to access coordination item f8100000-0000-4000-8000-000000000005',
    format('foreign resolved-row read bypass should reject, got %L', v_error);
END;
$$;

-- The edge worker uses the only bulk-expiry entry point. Its lock/check/token
-- loop remains unavailable to browser roles.
RESET ROLE;
SET LOCAL ROLE service_role;
SELECT pg_temp.assume_journey_actor(
  'f8000000-0000-4000-8000-000000000001', 'service_role'
);
DO $$
DECLARE
  v_count integer;
BEGIN
  SELECT count(*) INTO v_count
  FROM public.expire_due_client_decisions(now() - interval '7 days') AS expired
  WHERE expired.id = 'f8100000-0000-4000-8000-000000000007';
  ASSERT v_count = 1, 'service expiry must return the exact expired receipt';
  ASSERT (SELECT status = 'expired'
          FROM public.client_decisions
          WHERE id = 'f8100000-0000-4000-8000-000000000007'),
    'service expiry must persist the guarded terminal state';
END;
$$;

RESET ROLE;
ROLLBACK;

-- Two-session lock-order proof for the legacy recommended-option DELETE. The
-- RLS helper must wait on the parent before ModifyTable can lock the child;
-- canonical publish retains the same parent -> children order in reverse.
DO $$
DECLARE
  v_conninfo text := format(
    'hostaddr=%s port=%s dbname=postgres user=postgres password=postgres',
    inet_server_addr(), inet_server_port()
  );
  v_busy integer;
  v_delete_status text;
  v_publish_status text;
  v_error text;
  v_state record;
BEGIN
  PERFORM extensions.dblink_connect('journey_setup', v_conninfo);
  PERFORM extensions.dblink_connect('journey_parent', v_conninfo);
  PERFORM extensions.dblink_connect('journey_option', v_conninfo);
  PERFORM extensions.dblink_connect('journey_publish', v_conninfo);

  PERFORM extensions.dblink_exec(
    'journey_setup',
    $setup$
      DELETE FROM public.client_decisions
      WHERE id = 'fd100000-0000-4000-8000-000000000001';
      DELETE FROM public.designer_clients
      WHERE id = 'fd030000-0000-4000-8000-000000000001';
      DELETE FROM public.profiles
      WHERE id IN (
        'fd000000-0000-4000-8000-000000000001',
        'fd000000-0000-4000-8000-000000000002'
      );
      DELETE FROM auth.users
      WHERE id IN (
        'fd000000-0000-4000-8000-000000000001',
        'fd000000-0000-4000-8000-000000000002'
      );
      INSERT INTO auth.users (
        id, email, encrypted_password, email_confirmed_at, created_at,
        updated_at, instance_id, aud, role
      ) VALUES
        ('fd000000-0000-4000-8000-000000000001',
         'journey-race-owner@test.invalid', '', now(), now(), now(),
         '00000000-0000-0000-0000-000000000000',
         'authenticated', 'authenticated'),
        ('fd000000-0000-4000-8000-000000000002',
         'journey-race-client@test.invalid', '', now(), now(), now(),
         '00000000-0000-0000-0000-000000000000',
         'authenticated', 'authenticated');
      INSERT INTO public.profiles (
        id, email, full_name, created_at, updated_at
      ) VALUES
        ('fd000000-0000-4000-8000-000000000001',
         'journey-race-owner@test.invalid', 'Journey Race Owner', now(), now()),
        ('fd000000-0000-4000-8000-000000000002',
         'journey-race-client@test.invalid', 'Journey Race Client', now(), now())
      ON CONFLICT (id) DO UPDATE
      SET email = EXCLUDED.email,
          full_name = EXCLUDED.full_name;
      INSERT INTO public.designer_clients (
        id, designer_id, client_id, client_name, client_email, status, source
      ) VALUES (
        'fd030000-0000-4000-8000-000000000001',
        'fd000000-0000-4000-8000-000000000001',
        'fd000000-0000-4000-8000-000000000002',
        'Journey Race Client', 'journey-race-client@test.invalid',
        'active', 'direct'
      );
      INSERT INTO public.client_decisions (
        id, designer_client_id, title, status, coordination_kind, court,
        due_date
      ) VALUES (
        'fd100000-0000-4000-8000-000000000001',
        'fd030000-0000-4000-8000-000000000001',
        'Recommended option lock race', 'draft', 'selection', 'client',
        now() + interval '7 days'
      );
      INSERT INTO public.client_decision_options (
        id, decision_id, name, price, quantity, selected, is_recommended,
        sort_order
      ) VALUES (
        'fd200000-0000-4000-8000-000000000001',
        'fd100000-0000-4000-8000-000000000001',
        'Recommended race option', 1000, 1, false, true, 0
      );
    $setup$
  );

  PERFORM extensions.dblink_exec(
    'journey_parent',
    'SET lock_timeout = ''5s''; SET statement_timeout = ''20s'''
  );
  PERFORM extensions.dblink_exec(
    'journey_option',
    $session$SET lock_timeout = '5s'; SET statement_timeout = '20s';
      SET ROLE authenticated;
      SET request.jwt.claims = '{"sub":"fd000000-0000-4000-8000-000000000001","role":"authenticated"}'$session$
  );
  PERFORM extensions.dblink_exec(
    'journey_publish',
    $session$SET lock_timeout = '5s'; SET statement_timeout = '20s';
      SET ROLE authenticated;
      SET request.jwt.claims = '{"sub":"fd000000-0000-4000-8000-000000000001","role":"authenticated"}'$session$
  );

  -- Parent wins: the DELETE waits before locking its child. The parent holder
  -- can still NOWAIT-lock that option, publishes, and the stale DELETE wakes
  -- into an RLS no-op against the now-pending parent.
  PERFORM extensions.dblink_exec('journey_parent', 'BEGIN');
  PERFORM locked.id
  FROM extensions.dblink(
    'journey_parent',
    $lock$SELECT id::text
      FROM public.client_decisions
      WHERE id = 'fd100000-0000-4000-8000-000000000001'
      FOR UPDATE$lock$
  ) AS locked(id text);

  PERFORM extensions.dblink_send_query(
    'journey_option',
    $delete$DELETE FROM public.client_decision_options
      WHERE id = 'fd200000-0000-4000-8000-000000000001'$delete$
  );
  PERFORM pg_sleep(0.2);
  SELECT extensions.dblink_is_busy('journey_option') INTO v_busy;
  ASSERT v_busy = 1,
    'option DELETE must wait behind the parent lock during its RLS scan';

  PERFORM locked.id
  FROM extensions.dblink(
    'journey_parent',
    $lock$SELECT id::text
      FROM public.client_decision_options
      WHERE id = 'fd200000-0000-4000-8000-000000000001'
      FOR UPDATE NOWAIT$lock$
  ) AS locked(id text);
  PERFORM extensions.dblink_exec(
    'journey_parent',
    $publish$UPDATE public.client_decisions
      SET status = 'pending', sent_at = now()
      WHERE id = 'fd100000-0000-4000-8000-000000000001'$publish$
  );
  PERFORM extensions.dblink_exec('journey_parent', 'COMMIT');

  SELECT result.status INTO v_delete_status
  FROM extensions.dblink_get_result('journey_option', false)
    AS result(status text);
  v_error := extensions.dblink_error_message('journey_option');
  ASSERT v_error = 'OK' AND v_delete_status = 'DELETE 0',
    format('stale queued DELETE must become a no-op, status=%L error=%L',
           v_delete_status, v_error);
  -- libpq retains an async connection as busy until every PGresult, including
  -- the final empty result, has been consumed.
  PERFORM result.status
  FROM extensions.dblink_get_result('journey_option', false)
    AS result(status text);

  SELECT remote.* INTO STRICT v_state
  FROM extensions.dblink(
    'journey_setup',
    $state$SELECT decision.status,
                    decision.recommended_option_id::text,
                    EXISTS (
                      SELECT 1 FROM public.client_decision_options AS option
                      WHERE option.id = 'fd200000-0000-4000-8000-000000000001'
                    )
      FROM public.client_decisions AS decision
      WHERE decision.id = 'fd100000-0000-4000-8000-000000000001'$state$
  ) AS remote(status text, recommended_option_id text, option_exists boolean);
  ASSERT v_state.status = 'pending'
     AND v_state.recommended_option_id =
           'fd200000-0000-4000-8000-000000000001'
     AND v_state.option_exists,
    format('parent-winning race must preserve sent option truth: %s', v_state);

  -- Child wins: hold the authenticated DELETE transaction after it has locked
  -- parent then child. Canonical publish queues on the parent, then proceeds
  -- after commit without deadlock and observes the coherent child deletion.
  PERFORM extensions.dblink_exec(
    'journey_setup',
    $reset$
      DELETE FROM public.client_decisions
      WHERE id = 'fd100000-0000-4000-8000-000000000001';
      INSERT INTO public.client_decisions (
        id, designer_client_id, title, status, coordination_kind, court,
        due_date
      ) VALUES (
        'fd100000-0000-4000-8000-000000000001',
        'fd030000-0000-4000-8000-000000000001',
        'Recommended option lock race', 'draft', 'selection', 'client',
        now() + interval '7 days'
      );
      INSERT INTO public.client_decision_options (
        id, decision_id, name, price, quantity, selected, is_recommended,
        sort_order
      ) VALUES (
        'fd200000-0000-4000-8000-000000000001',
        'fd100000-0000-4000-8000-000000000001',
        'Recommended race option', 1000, 1, false, true, 0
      );
    $reset$
  );
  PERFORM extensions.dblink_exec('journey_option', 'BEGIN');
  v_delete_status := extensions.dblink_exec(
    'journey_option',
    $delete$DELETE FROM public.client_decision_options
      WHERE id = 'fd200000-0000-4000-8000-000000000001'$delete$
  );
  ASSERT v_delete_status = 'DELETE 1',
    format('child-winning setup must delete one option, got %L', v_delete_status);

  PERFORM extensions.dblink_send_query(
    'journey_publish',
    $publish$SELECT (
      public.publish_client_decision(
        'fd100000-0000-4000-8000-000000000001'
      )
    ).status::text$publish$
  );
  PERFORM pg_sleep(0.2);
  SELECT extensions.dblink_is_busy('journey_publish') INTO v_busy;
  ASSERT v_busy = 1,
    'canonical publish must wait behind the child writer parent lock';

  PERFORM extensions.dblink_exec('journey_option', 'COMMIT');
  SELECT result.status INTO v_publish_status
  FROM extensions.dblink_get_result('journey_publish', false)
    AS result(status text);
  v_error := extensions.dblink_error_message('journey_publish');
  ASSERT v_error = 'OK' AND v_publish_status = 'pending',
    format('queued publish must finish without deadlock, status=%L error=%L',
           v_publish_status, v_error);
  PERFORM result.status
  FROM extensions.dblink_get_result('journey_publish', false)
    AS result(status text);

  SELECT remote.* INTO STRICT v_state
  FROM extensions.dblink(
    'journey_setup',
    $state$SELECT decision.status,
                    decision.recommended_option_id::text,
                    EXISTS (
                      SELECT 1 FROM public.client_decision_options AS option
                      WHERE option.id = 'fd200000-0000-4000-8000-000000000001'
                    )
      FROM public.client_decisions AS decision
      WHERE decision.id = 'fd100000-0000-4000-8000-000000000001'$state$
  ) AS remote(status text, recommended_option_id text, option_exists boolean);
  ASSERT v_state.status = 'pending'
     AND v_state.recommended_option_id IS NULL
     AND NOT v_state.option_exists,
    format('child-winning race must publish one coherent copy: %s', v_state);

  PERFORM extensions.dblink_exec(
    'journey_setup',
    $cleanup$
      DELETE FROM public.client_decisions
      WHERE id = 'fd100000-0000-4000-8000-000000000001';
      DELETE FROM public.designer_clients
      WHERE id = 'fd030000-0000-4000-8000-000000000001';
      DELETE FROM public.profiles
      WHERE id IN (
        'fd000000-0000-4000-8000-000000000001',
        'fd000000-0000-4000-8000-000000000002'
      );
      DELETE FROM auth.users
      WHERE id IN (
        'fd000000-0000-4000-8000-000000000001',
        'fd000000-0000-4000-8000-000000000002'
      );
    $cleanup$
  );

  PERFORM extensions.dblink_disconnect('journey_publish');
  PERFORM extensions.dblink_disconnect('journey_option');
  PERFORM extensions.dblink_disconnect('journey_parent');
  PERFORM extensions.dblink_disconnect('journey_setup');
END;
$$;
