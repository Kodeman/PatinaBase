-- Journey authority / decision atomicity regression (00399)
-- Run:
--   psql 'postgresql://postgres:postgres@127.0.0.1:54322/postgres' \
--     -v ON_ERROR_STOP=1 -f supabase/tests/document/journey_authority_integrity_test.sql

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
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');

INSERT INTO public.profiles (id, email, full_name, created_at, updated_at)
VALUES
  ('f8000000-0000-4000-8000-000000000001', 'journey-owner@test.invalid', 'Journey Owner', now(), now()),
  ('f8000000-0000-4000-8000-000000000002', 'journey-client@test.invalid', 'Journey Client', now(), now()),
  ('f8000000-0000-4000-8000-000000000003', 'journey-peer@test.invalid', 'Journey Peer', now(), now()),
  ('f8000000-0000-4000-8000-000000000004', 'journey-foreign@test.invalid', 'Journey Foreign', now(), now())
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.organizations (id, type, name, slug)
VALUES (
  'f8010000-0000-4000-8000-000000000001', 'design_studio',
  'Journey Authority Studio', 'journey-authority-studio'
);

INSERT INTO public.organization_members (
  id, user_id, organization_id, role, status, joined_at
)
VALUES
  ('f8020000-0000-4000-8000-000000000001',
   'f8000000-0000-4000-8000-000000000001',
   'f8010000-0000-4000-8000-000000000001', 'owner', 'active', now()),
  ('f8020000-0000-4000-8000-000000000002',
   'f8000000-0000-4000-8000-000000000003',
   'f8010000-0000-4000-8000-000000000001', 'member', 'active', now());

INSERT INTO public.designer_clients (
  id, designer_id, client_id, client_name, status, source
)
VALUES (
  'f8030000-0000-4000-8000-000000000001',
  'f8000000-0000-4000-8000-000000000001',
  'f8000000-0000-4000-8000-000000000002',
  'Journey Client', 'active', 'direct'
);

INSERT INTO public.projects (
  id, name, designer_id, created_by, client_id, status
)
VALUES (
  'f8040000-0000-4000-8000-000000000001', 'Journey Project',
  'f8000000-0000-4000-8000-000000000001',
  'f8000000-0000-4000-8000-000000000001',
  'f8000000-0000-4000-8000-000000000002', 'active'
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
   'Expire then reopen', 'pending', now(), 'selection', 'client', now() - interval '8 days'),
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
   'Service expiry', 'pending', now(), 'selection', 'client', now() - interval '10 days');

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
   'f8100000-0000-4000-8000-000000000003', 'Old draft option', 5000, 1, false, 0);

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
    'service_role', 'public.expire_due_client_decisions(timestamptz)', 'EXECUTE'
  ), 'expiry worker needs its checked service-role RPC';
  ASSERT has_table_privilege(
    'authenticated', 'public.client_decisions', 'UPDATE'
  ), 'expand phase must retain rollback decision UPDATE';
  ASSERT has_table_privilege(
    'authenticated', 'public.client_decision_options', 'UPDATE'
  ), 'expand phase must retain rollback option UPDATE';
  ASSERT has_table_privilege(
    'authenticated', 'public.decision_overrides', 'INSERT'
  ), 'expand phase must retain rollback override INSERT';
END;
$$;

SET LOCAL ROLE authenticated;
SELECT pg_temp.assume_journey_actor('f8000000-0000-4000-8000-000000000001');

-- Expand phase is explicit and observable: authenticated legacy paths remain
-- under their existing RLS policies, while anonymous writes and the new hard
-- guard triggers stay off until client-version adoption is measured.
DO $$
BEGIN
  ASSERT NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE NOT tgisinternal
      AND tgname IN (
        'zz_guard_client_decision_authority_trg',
        'zz_guard_client_decision_option_authority_trg'
      )
  ), 'decision hardening triggers must remain unattached in expand phase';
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
      AND policyname = 'client_decisions_studio_rw'
      AND cmd = 'ALL'
  ) AND EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'client_decision_options'
      AND policyname = 'client_decision_options_studio_rw'
      AND cmd = 'ALL'
  ), 'rollback studio RLS policies must remain explicit';
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
BEGIN
  v_row := public.publish_client_decision(
    'f8100000-0000-4000-8000-000000000003'
  );
  ASSERT v_row.status = 'pending' AND v_row.sent_at IS NOT NULL,
    'publish must atomically enter pending';

  v_row := public.expire_client_decision(
    'f8100000-0000-4000-8000-000000000004'
  );
  ASSERT v_row.status = 'expired', 'expire must enter the checked terminal state';
  v_row := public.reopen_client_decision(
    'f8100000-0000-4000-8000-000000000004'
  );
  ASSERT v_row.status = 'pending'
         AND v_row.responded_at IS NULL
         AND v_row.selected_by IS NULL,
    'reopen must clear stale response evidence';

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

  v_row := public.apply_client_decision(
    'f8100000-0000-4000-8000-000000000001',
    'f8200000-0000-4000-8000-000000000001',
    'electronic_signature', 'Journey Client', 'Place near the window', 3
  );
  ASSERT v_row.status = 'responded'
         AND v_row.selected_by = 'f8000000-0000-4000-8000-000000000002'
         AND v_row.client_consent_method = 'electronic_signature'
         AND v_row.client_signature = 'Journey Client'
         AND v_row.client_consented_at IS NOT NULL,
    'client selection and consent must commit atomically under actual actor';
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
