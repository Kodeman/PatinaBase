-- Proposal phase authoring / signature engagement regression (00399)
-- Run:
--   psql 'postgresql://postgres:postgres@127.0.0.1:54322/postgres' \
--     -v ON_ERROR_STOP=1 \
--     -f supabase/tests/document/proposal_phase_authority_atomicity_test.sql

BEGIN;

INSERT INTO auth.users (
  id, email, encrypted_password, email_confirmed_at, created_at, updated_at,
  instance_id, aud, role
)
SELECT id, email, '', now(), now(), now(),
       '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'
FROM (VALUES
  ('fb000000-0000-4000-8000-000000000001'::uuid, 'phase-owner@test.invalid'),
  ('fb000000-0000-4000-8000-000000000002'::uuid, 'phase-peer@test.invalid'),
  ('fb000000-0000-4000-8000-000000000003'::uuid, 'phase-guest@test.invalid'),
  ('fb000000-0000-4000-8000-000000000004'::uuid, 'phase-contractor@test.invalid'),
  ('fb000000-0000-4000-8000-000000000005'::uuid, 'phase-outsider@test.invalid'),
  ('fb000000-0000-4000-8000-000000000006'::uuid, 'phase-client@test.invalid')
) AS fixture(id, email);

INSERT INTO public.profiles (
  id, email, full_name, is_designer, created_at, updated_at
)
SELECT id, email, name, is_designer, now(), now()
FROM (VALUES
  ('fb000000-0000-4000-8000-000000000001'::uuid, 'phase-owner@test.invalid', 'Phase Owner', true),
  ('fb000000-0000-4000-8000-000000000002'::uuid, 'phase-peer@test.invalid', 'Phase Peer', true),
  ('fb000000-0000-4000-8000-000000000003'::uuid, 'phase-guest@test.invalid', 'Phase Guest', true),
  ('fb000000-0000-4000-8000-000000000004'::uuid, 'phase-contractor@test.invalid', 'Phase Contractor', false),
  ('fb000000-0000-4000-8000-000000000005'::uuid, 'phase-outsider@test.invalid', 'Phase Outsider', true),
  ('fb000000-0000-4000-8000-000000000006'::uuid, 'phase-client@test.invalid', 'Phase Client', false)
) AS fixture(id, email, name, is_designer)
ON CONFLICT (id) DO UPDATE SET is_designer = EXCLUDED.is_designer;

INSERT INTO public.organizations (id, type, name, slug, status)
VALUES
  ('fb010000-0000-4000-8000-000000000001', 'design_studio', 'Phase Studio', 'phase-authority-studio', 'active'),
  ('fb010000-0000-4000-8000-000000000002', 'contractor', 'Phase Contractor Org', 'phase-authority-contractor', 'active');

INSERT INTO public.organization_members (
  id, user_id, organization_id, role, status, joined_at
)
VALUES
  ('fb020000-0000-4000-8000-000000000001', 'fb000000-0000-4000-8000-000000000001', 'fb010000-0000-4000-8000-000000000001', 'owner', 'active', now()),
  ('fb020000-0000-4000-8000-000000000002', 'fb000000-0000-4000-8000-000000000002', 'fb010000-0000-4000-8000-000000000001', 'member', 'active', now()),
  ('fb020000-0000-4000-8000-000000000003', 'fb000000-0000-4000-8000-000000000003', 'fb010000-0000-4000-8000-000000000001', 'guest', 'active', now()),
  ('fb020000-0000-4000-8000-000000000004', 'fb000000-0000-4000-8000-000000000001', 'fb010000-0000-4000-8000-000000000002', 'owner', 'active', now()),
  ('fb020000-0000-4000-8000-000000000005', 'fb000000-0000-4000-8000-000000000004', 'fb010000-0000-4000-8000-000000000002', 'member', 'active', now());

INSERT INTO public.designer_clients (
  id, designer_id, client_id, client_name, client_email, status, source
) VALUES (
  'fb030000-0000-4000-8000-000000000001',
  'fb000000-0000-4000-8000-000000000001',
  'fb000000-0000-4000-8000-000000000006',
  'Phase Client', 'phase-client@test.invalid', 'active', 'direct'
);

INSERT INTO public.proposals (
  id, designer_id, designer_client_id, client_id, title, total_amount, status,
  valid_until
)
VALUES
  ('fb040000-0000-4000-8000-000000000001', 'fb000000-0000-4000-8000-000000000001', 'fb030000-0000-4000-8000-000000000001', 'fb000000-0000-4000-8000-000000000006', 'Serialized Template', 0, 'draft', now() + interval '30 days'),
  ('fb040000-0000-4000-8000-000000000002', 'fb000000-0000-4000-8000-000000000001', 'fb030000-0000-4000-8000-000000000001', 'fb000000-0000-4000-8000-000000000006', 'Legacy Partial Prefix', 0, 'draft', now() + interval '30 days'),
  ('fb040000-0000-4000-8000-000000000003', 'fb000000-0000-4000-8000-000000000001', 'fb030000-0000-4000-8000-000000000001', 'fb000000-0000-4000-8000-000000000006', 'Signature Activation', 0, 'draft', now() + interval '30 days'),
  ('fb040000-0000-4000-8000-000000000004', 'fb000000-0000-4000-8000-000000000001', 'fb030000-0000-4000-8000-000000000001', 'fb000000-0000-4000-8000-000000000006', 'Engagement Boundary', 0, 'sent', now() + interval '30 days'),
  ('fb040000-0000-4000-8000-000000000005', 'fb000000-0000-4000-8000-000000000001', 'fb030000-0000-4000-8000-000000000001', 'fb000000-0000-4000-8000-000000000006', 'Denial Target', 0, 'draft', now() + interval '30 days'),
  ('fb040000-0000-4000-8000-000000000006', 'fb000000-0000-4000-8000-000000000001', 'fb030000-0000-4000-8000-000000000001', 'fb000000-0000-4000-8000-000000000006', 'Edit Remove Target', 1500, 'draft', now() + interval '30 days'),
  ('fb040000-0000-4000-8000-000000000007', 'fb000000-0000-4000-8000-000000000001', 'fb030000-0000-4000-8000-000000000001', 'fb000000-0000-4000-8000-000000000006', 'Copy Target', 0, 'draft', now() + interval '30 days'),
  ('fb040000-0000-4000-8000-000000000008', 'fb000000-0000-4000-8000-000000000001', 'fb030000-0000-4000-8000-000000000001', 'fb000000-0000-4000-8000-000000000006', 'Copy Denial Target', 0, 'draft', now() + interval '30 days'),
  ('fb040000-0000-4000-8000-000000000009', 'fb000000-0000-4000-8000-000000000001', 'fb030000-0000-4000-8000-000000000001', 'fb000000-0000-4000-8000-000000000006', 'Legacy Full Prefix', 0, 'draft', now() + interval '30 days'),
  ('fb040000-0000-4000-8000-000000000010', 'fb000000-0000-4000-8000-000000000001', 'fb030000-0000-4000-8000-000000000001', 'fb000000-0000-4000-8000-000000000006', 'Issued Legacy Schedule', 600, 'draft', now() + interval '30 days');

INSERT INTO public.projects (
  id, name, designer_id, created_by, client_id, studio_id, status
) VALUES (
  'fb070000-0000-4000-8000-000000000001', 'As-built Source',
  'fb000000-0000-4000-8000-000000000001',
  'fb000000-0000-4000-8000-000000000001',
  'fb000000-0000-4000-8000-000000000006',
  'fb010000-0000-4000-8000-000000000001', 'active'
);

INSERT INTO public.project_phases (
  id, project_id, name, phase_key, status, sort_order, duration_days,
  follows_phase_id, lane
) VALUES
  ('fb071000-0000-4000-8000-000000000001', 'fb070000-0000-4000-8000-000000000001', 'As-built one', 'consultation', 'completed', 0, 9, NULL, 'main'),
  ('fb071000-0000-4000-8000-000000000002', 'fb070000-0000-4000-8000-000000000001', 'As-built two', 'concept_development', 'completed', 1, 17, 'fb071000-0000-4000-8000-000000000001', 'main');

INSERT INTO public.proposal_phases (
  id, proposal_id, name, phase_key, fee_cents, sort_order,
  follows_phase_id, lane, duration_days, anchor_date
) VALUES
  ('fb052000-0000-4000-8000-000000000001', 'fb040000-0000-4000-8000-000000000006', 'Main A', 'consultation', 100, 0, NULL, 'main', 10, '2027-01-05'),
  ('fb052000-0000-4000-8000-000000000002', 'fb040000-0000-4000-8000-000000000006', 'Main B', 'concept_development', 200, 1, 'fb052000-0000-4000-8000-000000000001', 'main', 14, NULL),
  ('fb052000-0000-4000-8000-000000000003', 'fb040000-0000-4000-8000-000000000006', 'Thread A', 'procurement', 300, 2, 'fb052000-0000-4000-8000-000000000001', 'thread', 8, NULL),
  ('fb052000-0000-4000-8000-000000000004', 'fb040000-0000-4000-8000-000000000006', 'Thread B', 'procurement', 400, 3, 'fb052000-0000-4000-8000-000000000003', 'thread', 20, '2027-02-01'),
  ('fb052000-0000-4000-8000-000000000005', 'fb040000-0000-4000-8000-000000000006', 'Main C', 'design_refinement', 500, 4, 'fb052000-0000-4000-8000-000000000002', 'main', 21, NULL);

INSERT INTO public.proposal_phase_deliverables (
  id, phase_id, label, description, is_required, sort_order
) VALUES (
  'fb053000-0000-4000-8000-000000000001',
  'fb052000-0000-4000-8000-000000000001',
  'Measured plan', 'Exact clone proof', true, 0
);

INSERT INTO public.proposal_phase_gates (
  id, phase_id, gate_kind, payload, sort_order
) VALUES (
  'fb054000-0000-4000-8000-000000000001',
  'fb052000-0000-4000-8000-000000000004',
  'client_signature', '{"label":"Thread approval"}', 0
);

INSERT INTO public.proposal_schedule_milestones (
  id, phase_id, name, kind, anchor_date, sort_order
) VALUES (
  'fb055000-0000-4000-8000-000000000001',
  'fb052000-0000-4000-8000-000000000001',
  'Survey complete', 'event', '2027-01-15', 0
);

INSERT INTO public.proposal_payment_milestones (
  id, proposal_id, phase_id, label, percentage, amount_cents,
  trigger_condition, sort_order
) VALUES (
  'fb056000-0000-4000-8000-000000000001',
  'fb040000-0000-4000-8000-000000000006',
  'fb052000-0000-4000-8000-000000000004',
  'Thread completion', 100, 500, 'completion', 0
);

INSERT INTO public.proposal_palettes (
  id, proposal_id, name, is_primary, notes, sort_order
) VALUES (
  'fb058000-0000-4000-8000-000000000001',
  'fb040000-0000-4000-8000-000000000006',
  'Clone palette', true, 'Owner palette', 0
);

INSERT INTO public.palette_swatches (
  id, palette_id, hex, name, role, sort_order
) VALUES (
  'fb059000-0000-4000-8000-000000000001',
  'fb058000-0000-4000-8000-000000000001',
  '#AABBCC', 'Clone swatch', 'accent', 0
);

INSERT INTO public.proposal_team_members (
  id, proposal_id, user_id, role, permissions, sort_order
) VALUES (
  'fb05a000-0000-4000-8000-000000000001',
  'fb040000-0000-4000-8000-000000000006',
  'fb000000-0000-4000-8000-000000000002',
  'support_designer', '{"schedule":true}', 0
);

INSERT INTO public.spec_field_defs (
  id, proposal_id, field_key, name, kind, sort_order
) VALUES (
  'fb05b000-0000-4000-8000-000000000001',
  'fb040000-0000-4000-8000-000000000006',
  'finish_code', 'Finish code', 'text', 0
);

-- Arbitrary pre-00324 issued shape: all main, all null predecessors, unique
-- stable order. The migration repair is intentionally broader than the old
-- Add Defaults names and fees.
INSERT INTO public.proposal_phases (
  id, proposal_id, name, phase_key, fee_cents, sort_order,
  follows_phase_id, lane
) VALUES
  ('fb057000-0000-4000-8000-000000000001', 'fb040000-0000-4000-8000-000000000010', 'Legacy survey', 'consultation', 100, 10, NULL, 'main'),
  ('fb057000-0000-4000-8000-000000000002', 'fb040000-0000-4000-8000-000000000010', 'Legacy drawings', 'design_refinement', 200, 20, NULL, 'main'),
  ('fb057000-0000-4000-8000-000000000003', 'fb040000-0000-4000-8000-000000000010', 'Legacy install', 'installation', 300, 30, NULL, 'main');

SELECT set_config(
  'app.proposal_send_id',
  'fb040000-0000-4000-8000-000000000010', true
);
UPDATE public.proposals
SET status = 'sent', sent_at = now(), updated_at = now()
WHERE id = 'fb040000-0000-4000-8000-000000000010';
SELECT set_config('app.proposal_send_id', '', true);

-- Exact historical Add Defaults prefixes: correct old names/fees/revisions,
-- but every predecessor is null. Only this strict signature is eligible for
-- the narrow in-RPC repair.
INSERT INTO public.proposal_phases (
  id, proposal_id, name, phase_key, duration_weeks, duration_days,
  fee_cents, revision_limit, sort_order, follows_phase_id, lane
)
SELECT
  ('fb050000-0000-4000-8000-' || lpad(blueprint.ordinal::text, 12, '0'))::uuid,
  'fb040000-0000-4000-8000-000000000002',
  blueprint.name, blueprint.phase_key, blueprint.duration_weeks, NULL,
  blueprint.fee_cents, blueprint.revision_limit,
  blueprint.ordinal - 1, NULL, 'main'
FROM (VALUES
  (1, 'Schematic Design', 'concept_development', 3, 250000, 2),
  (2, 'Design Development', 'design_refinement', 4, 350000, 2),
  (3, 'Procurement Management', 'procurement', 8, 200000, 1)
) AS blueprint(
  ordinal, name, phase_key, duration_weeks, fee_cents, revision_limit
);

INSERT INTO public.proposal_phases (
  id, proposal_id, name, phase_key, duration_weeks, duration_days,
  fee_cents, revision_limit, sort_order, follows_phase_id, lane
)
SELECT
  ('fb051000-0000-4000-8000-' || lpad(blueprint.ordinal::text, 12, '0'))::uuid,
  'fb040000-0000-4000-8000-000000000009',
  blueprint.name, blueprint.phase_key, blueprint.duration_weeks, NULL,
  blueprint.fee_cents, blueprint.revision_limit,
  blueprint.ordinal - 1, NULL, 'main'
FROM (VALUES
  (1, 'Schematic Design', 'concept_development', 3, 250000, 2),
  (2, 'Design Development', 'design_refinement', 4, 350000, 2),
  (3, 'Procurement Management', 'procurement', 8, 200000, 1),
  (4, 'Installation & Styling', 'installation', 3, 150000, 1),
  (5, 'Completion & Handover', 'final_walkthrough', 1, 50000, 0)
) AS blueprint(
  ordinal, name, phase_key, duration_weeks, fee_cents, revision_limit
);

CREATE OR REPLACE FUNCTION pg_temp.assume_phase_actor(p_actor uuid)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', p_actor, 'role', 'authenticated')::text,
    true
  );
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.phase_count(p_proposal_id uuid)
RETURNS bigint
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT count(*) FROM public.proposal_phases
  WHERE proposal_id = p_proposal_id
$$;

CREATE OR REPLACE FUNCTION pg_temp.proposal_count()
RETURNS bigint
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT count(*) FROM public.proposals
$$;

CREATE OR REPLACE FUNCTION pg_temp.proposal_state(p_proposal_id uuid)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT jsonb_build_object(
    'status', status,
    'total_amount', total_amount
  )
  FROM public.proposals
  WHERE id = p_proposal_id
$$;

CREATE OR REPLACE FUNCTION pg_temp.proposal_phase_child_counts(
  p_proposal_id uuid
)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT jsonb_build_object(
    'deliverables', (
      SELECT count(*)
      FROM public.proposal_phase_deliverables AS child
      JOIN public.proposal_phases AS phase ON phase.id = child.phase_id
      WHERE phase.proposal_id = p_proposal_id
    ),
    'gates', (
      SELECT count(*)
      FROM public.proposal_phase_gates AS child
      JOIN public.proposal_phases AS phase ON phase.id = child.phase_id
      WHERE phase.proposal_id = p_proposal_id
    ),
    'schedule_milestones', (
      SELECT count(*)
      FROM public.proposal_schedule_milestones AS child
      JOIN public.proposal_phases AS phase ON phase.id = child.phase_id
      WHERE phase.proposal_id = p_proposal_id
    ),
    'payment_milestones', (
      SELECT count(*)
      FROM public.proposal_payment_milestones
      WHERE proposal_id = p_proposal_id
    ),
    'linked_payment_milestones', (
      SELECT count(*)
      FROM public.proposal_payment_milestones AS milestone
      JOIN public.proposal_phases AS phase ON phase.id = milestone.phase_id
      WHERE milestone.proposal_id = p_proposal_id
        AND phase.proposal_id = p_proposal_id
    ),
    'palettes', (
      SELECT count(*) FROM public.proposal_palettes
      WHERE proposal_id = p_proposal_id
    ),
    'swatches', (
      SELECT count(*)
      FROM public.palette_swatches AS swatch
      JOIN public.proposal_palettes AS palette
        ON palette.id = swatch.palette_id
      WHERE palette.proposal_id = p_proposal_id
    ),
    'team_members', (
      SELECT count(*) FROM public.proposal_team_members
      WHERE proposal_id = p_proposal_id
    ),
    'spec_fields', (
      SELECT count(*) FROM public.spec_field_defs
      WHERE proposal_id = p_proposal_id
    )
  )
$$;

CREATE OR REPLACE FUNCTION pg_temp.signature_engagement_count(
  p_proposal_id uuid
)
RETURNS bigint
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT count(*) FROM public.proposal_engagement
  WHERE proposal_id = p_proposal_id
    AND event_type IN ('signed', 'signed_offline')
$$;

CREATE OR REPLACE FUNCTION pg_temp.sign_proposal_compat(
  p_proposal_id uuid,
  p_signed_name text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  v_receipt jsonb;
BEGIN
  IF to_regprocedure('public.sign_proposal(uuid,text)') IS NOT NULL THEN
    EXECUTE 'SELECT public.sign_proposal($1, $2)'
    INTO v_receipt
    USING p_proposal_id, p_signed_name;
  ELSE
    EXECUTE
      'SELECT public.sign_proposal($1, $2, $3, $4, $5)'
    INTO v_receipt
    USING p_proposal_id, p_signed_name, '203.0.113.41', true, current_date;
  END IF;
  RETURN v_receipt;
END;
$$;

-- Reproduce the migration-only issued-copy normalization window. The guard is
-- restored before any authenticated exercise below.
ALTER TABLE public.proposal_phases
  DISABLE TRIGGER z_guard_proposal_copy_draft_only_trg;
SELECT public._repair_legacy_proposal_phase_topology(
  'fb040000-0000-4000-8000-000000000010'
);
ALTER TABLE public.proposal_phases
  ENABLE TRIGGER z_guard_proposal_copy_draft_only_trg;
SELECT public._repair_legacy_proposal_phase_topology(
  'fb040000-0000-4000-8000-000000000009'
);

DO $$
BEGIN
  ASSERT (SELECT count(*) = 1
          FROM public.proposal_phases
          WHERE proposal_id = 'fb040000-0000-4000-8000-000000000010'
            AND follows_phase_id IS NULL),
    'migration normalization must leave one root on an issued legacy proposal';
  ASSERT NOT EXISTS (
    SELECT follows_phase_id
    FROM public.proposal_phases
    WHERE proposal_id = 'fb040000-0000-4000-8000-000000000010'
      AND follows_phase_id IS NOT NULL
    GROUP BY follows_phase_id HAVING count(*) > 1
  ), 'migration normalization must produce one unambiguous issued chain';
END;
$$;

SET LOCAL ROLE authenticated;
SELECT pg_temp.assume_phase_actor('fb000000-0000-4000-8000-000000000001');

DO $$
BEGIN
  ASSERT has_function_privilege(
    'authenticated',
    'public.create_proposal_phase(uuid,text,text,integer,integer,integer,text,jsonb,integer,date,text)',
    'EXECUTE'
  ), 'authenticated authors need the checked phase-create RPC';
  ASSERT has_function_privilege(
    'authenticated',
    'public.update_proposal_phase(uuid,uuid,jsonb,timestamptz)', 'EXECUTE'
  ), 'authenticated authors need the checked phase-update RPC';
  ASSERT has_function_privilege(
    'authenticated',
    'public.remove_proposal_phase(uuid,uuid,timestamptz)', 'EXECUTE'
  ), 'authenticated authors need the checked phase-remove RPC';
  ASSERT has_function_privilege(
    'authenticated', 'public.apply_phase_template(uuid,text,uuid)', 'EXECUTE'
  ), 'authenticated authors need the checked template RPC';
  ASSERT NOT has_function_privilege(
    'authenticated', 'public._assert_proposal_phase_topology(uuid,text)',
    'EXECUTE'
  ), 'proposal topology assertion must remain private';
  ASSERT NOT has_table_privilege(
    'authenticated', 'public.proposal_phases', 'INSERT'
  ), 'authenticated direct proposal phase INSERT must remain revoked';
  ASSERT NOT has_table_privilege(
    'authenticated', 'public.proposal_phases', 'UPDATE'
  ), 'authenticated direct proposal phase UPDATE must remain revoked';
  ASSERT NOT has_table_privilege(
    'authenticated', 'public.proposal_phases', 'DELETE'
  ), 'authenticated direct proposal phase DELETE must remain revoked';
  ASSERT NOT has_table_privilege(
    'authenticated', 'public.proposal_phase_template_applications', 'SELECT'
  ), 'authenticated callers must not read private template receipts';
  ASSERT NOT has_table_privilege(
    'authenticated', 'public.proposal_phase_template_applications', 'INSERT'
  ), 'authenticated callers must not forge template receipts';
  ASSERT has_table_privilege(
    'service_role', 'public.proposal_phase_template_applications', 'SELECT'
  ) AND NOT has_table_privilege(
    'service_role', 'public.proposal_phase_template_applications', 'INSERT'
  ) AND NOT has_table_privilege(
    'service_role', 'public.proposal_phase_template_applications', 'UPDATE'
  ) AND NOT has_table_privilege(
    'service_role', 'public.proposal_phase_template_applications', 'DELETE'
  ), 'service role must observe but never forge private template receipts';
  ASSERT has_table_privilege(
    'service_role', 'public.proposal_phase_topology_diagnostics', 'SELECT'
  ) AND NOT has_table_privilege(
    'service_role', 'public.proposal_phase_topology_diagnostics', 'INSERT'
  ) AND NOT has_table_privilege(
    'service_role', 'public.proposal_phase_topology_diagnostics', 'UPDATE'
  ) AND NOT has_table_privilege(
    'service_role', 'public.proposal_phase_topology_diagnostics', 'DELETE'
  ), 'service role must observe but never rewrite topology diagnostics';
  ASSERT has_function_privilege(
    'authenticated',
    'public._can_record_proposal_engagement(uuid,uuid,text)', 'EXECUTE'
  ), 'authenticated telemetry needs only the narrow checked helper';
  ASSERT NOT has_function_privilege(
    'authenticated', 'public.guard_proposal_signature_engagement()', 'EXECUTE'
  ), 'the signature evidence trigger must remain private';
  ASSERT NOT has_function_privilege(
    'authenticated',
    'public._repair_legacy_proposal_phase_topology(uuid)', 'EXECUTE'
  ), 'legacy topology normalization must remain migration-private';
  ASSERT NOT has_function_privilege(
    'authenticated',
    'public._proposal_phase_effect_snapshot(uuid,uuid[])', 'EXECUTE'
  ), 'template effect snapshots must remain receipt-private';
  ASSERT NOT has_function_privilege(
    'authenticated',
    'public._clone_proposal_legacy_00399(uuid,text,text)', 'EXECUTE'
  ), 'the pre-topology clone implementation must remain private';
  ASSERT has_function_privilege(
    'authenticated', 'public.clone_proposal(uuid,text,text)', 'EXECUTE'
  ), 'authenticated authors need the checked deep-copy RPC';
  ASSERT position(
    'FOR UPDATE' IN pg_get_functiondef(
      'public.apply_phase_template(uuid,text,uuid)'::regprocedure
    )
  ) > 0, 'template apply must visibly lock its proposal/phase set';
  ASSERT position(
    'FOR UPDATE' IN pg_get_functiondef(
      'public.create_proposal_phase(uuid,text,text,integer,integer,integer,text,jsonb,integer,date,text)'::regprocedure
    )
  ) > 0, 'custom phase create must visibly lock its proposal/phase set';
END;
$$;

-- Direct browser fee/delete writes cannot bypass CAS, topology repair, or the
-- atomic total recomputation.
DO $$
DECLARE v_error text;
BEGIN
  BEGIN
    UPDATE public.proposal_phases
    SET fee_cents = 999999
    WHERE id = 'fb052000-0000-4000-8000-000000000001';
  EXCEPTION WHEN insufficient_privilege THEN v_error := SQLERRM;
  END;
  ASSERT v_error IS NOT NULL, 'direct proposal phase UPDATE must reject';

  v_error := NULL;
  BEGIN
    DELETE FROM public.proposal_phases
    WHERE id = 'fb052000-0000-4000-8000-000000000005';
  EXCEPTION WHEN insufficient_privilege THEN v_error := SQLERRM;
  END;
  ASSERT v_error IS NOT NULL, 'direct proposal phase DELETE must reject';
END;
$$;

-- Checked edit/remove paths preserve CAS, totals, and every main/thread edge.
SELECT pg_temp.assume_phase_actor('fb000000-0000-4000-8000-000000000002');
DO $$
DECLARE
  v_phase public.proposal_phases;
  v_expected timestamptz;
  v_error text;
BEGIN
  SELECT updated_at INTO v_expected FROM public.proposal_phases
  WHERE id = 'fb052000-0000-4000-8000-000000000003';
  v_phase := public.update_proposal_phase(
    'fb052000-0000-4000-8000-000000000003',
    'fb040000-0000-4000-8000-000000000006',
    '{"name":"Thread A revised","fee_cents":333}'::jsonb,
    v_expected
  );
  ASSERT v_phase.name = 'Thread A revised' AND v_phase.fee_cents = 333,
    'checked phase edit must persist its exact patch';
  ASSERT (SELECT total_amount = 1533 FROM public.proposals
          WHERE id = 'fb040000-0000-4000-8000-000000000006'),
    'phase fee edit must atomically recompute the proposal total';

  BEGIN
    PERFORM public.update_proposal_phase(
      v_phase.id, v_phase.proposal_id, '{"fee_cents":444}'::jsonb,
      v_expected - interval '1 microsecond'
    );
  EXCEPTION WHEN serialization_failure THEN v_error := SQLERRM;
  END;
  ASSERT v_error IS NOT NULL, 'stale phase edit CAS must reject';
  ASSERT (SELECT total_amount = 1533 FROM public.proposals
          WHERE id = 'fb040000-0000-4000-8000-000000000006'),
    'stale phase edit must preserve the canonical total';

  v_error := NULL;
  BEGIN
    PERFORM public.update_proposal_phase(
      v_phase.id, v_phase.proposal_id,
      '{"follows_phase_id":null}'::jsonb, v_phase.updated_at
    );
  EXCEPTION WHEN invalid_parameter_value THEN v_error := SQLERRM;
  END;
  ASSERT v_error IS NOT NULL, 'generic phase edit cannot rewrite topology';

  SELECT updated_at INTO v_expected FROM public.proposal_phases
  WHERE id = 'fb052000-0000-4000-8000-000000000002';
  PERFORM public.remove_proposal_phase(
    'fb052000-0000-4000-8000-000000000002',
    'fb040000-0000-4000-8000-000000000006', v_expected
  );
  ASSERT (SELECT follows_phase_id = 'fb052000-0000-4000-8000-000000000001'
          FROM public.proposal_phases
          WHERE id = 'fb052000-0000-4000-8000-000000000005'),
    'removing a non-tail main phase must reconnect its main successor';
  ASSERT (SELECT total_amount = 1333 FROM public.proposals
          WHERE id = 'fb040000-0000-4000-8000-000000000006'),
    'non-tail removal must atomically remove its fee';

  SELECT updated_at INTO v_expected FROM public.proposal_phases
  WHERE id = 'fb052000-0000-4000-8000-000000000003';
  PERFORM public.remove_proposal_phase(
    'fb052000-0000-4000-8000-000000000003',
    'fb040000-0000-4000-8000-000000000006', v_expected
  );
  ASSERT (SELECT follows_phase_id = 'fb052000-0000-4000-8000-000000000001'
          FROM public.proposal_phases
          WHERE id = 'fb052000-0000-4000-8000-000000000004'),
    'removing a thread phase must reconnect its thread child';
  ASSERT (SELECT total_amount = 1000 FROM public.proposals
          WHERE id = 'fb040000-0000-4000-8000-000000000006'),
    'thread removal must atomically remove its fee';

  SELECT updated_at INTO v_expected FROM public.proposal_phases
  WHERE id = 'fb052000-0000-4000-8000-000000000005';
  PERFORM public.remove_proposal_phase(
    'fb052000-0000-4000-8000-000000000005',
    'fb040000-0000-4000-8000-000000000006', v_expected
  );
  ASSERT NOT EXISTS (SELECT 1 FROM public.proposal_phases
                     WHERE id = 'fb052000-0000-4000-8000-000000000005'),
    'tail removal must delete the exact phase';
  ASSERT (SELECT total_amount = 500 FROM public.proposals
          WHERE id = 'fb040000-0000-4000-8000-000000000006'),
    'tail removal must atomically remove its fee';

  SELECT updated_at INTO v_expected FROM public.proposal_phases
  WHERE id = 'fb052000-0000-4000-8000-000000000001';
  v_error := NULL;
  BEGIN
    PERFORM public.remove_proposal_phase(
      'fb052000-0000-4000-8000-000000000001',
      'fb040000-0000-4000-8000-000000000006',
      v_expected - interval '1 microsecond'
    );
  EXCEPTION WHEN serialization_failure THEN v_error := SQLERRM;
  END;
  ASSERT v_error IS NOT NULL, 'stale phase removal CAS must reject';
  ASSERT (SELECT total_amount = 500 FROM public.proposals
          WHERE id = 'fb040000-0000-4000-8000-000000000006'),
    'stale removal must preserve phase fees';
END;
$$;

-- Revision and duplicate are full checked schedule births. A same-studio peer
-- receives fresh phase ids but the exact source topology, fields, children,
-- and canonical fee total.
DO $$
DECLARE
  v_mode text;
  v_clone_id uuid;
  v_root_id uuid;
  v_thread public.proposal_phases;
BEGIN
  UPDATE public.proposal_phase_deliverables
  SET description = 'Peer edited deliverable'
  WHERE id = 'fb053000-0000-4000-8000-000000000001';
  UPDATE public.proposal_phase_gates
  SET payload = '{"label":"Peer edited gate"}'::jsonb
  WHERE id = 'fb054000-0000-4000-8000-000000000001';
  UPDATE public.proposal_schedule_milestones
  SET name = 'Peer edited survey'
  WHERE id = 'fb055000-0000-4000-8000-000000000001';
  UPDATE public.proposal_palettes
  SET notes = 'Peer edited palette'
  WHERE id = 'fb058000-0000-4000-8000-000000000001';
  UPDATE public.palette_swatches
  SET name = 'Peer edited swatch'
  WHERE id = 'fb059000-0000-4000-8000-000000000001';
  UPDATE public.proposal_team_members
  SET permissions = '{"schedule":true,"peer_edit":true}'::jsonb
  WHERE id = 'fb05a000-0000-4000-8000-000000000001';
  UPDATE public.spec_field_defs
  SET name = 'Peer edited finish code'
  WHERE id = 'fb05b000-0000-4000-8000-000000000001';

  ASSERT (SELECT count(*) = 1
          FROM public.proposal_phase_deliverables
          WHERE id = 'fb053000-0000-4000-8000-000000000001'
            AND description = 'Peer edited deliverable'),
    'active studio peer must see and edit phase deliverables';
  ASSERT (SELECT count(*) = 1 FROM public.proposal_phase_gates
          WHERE id = 'fb054000-0000-4000-8000-000000000001'),
    'active studio peer must see phase gates';
  ASSERT (SELECT count(*) = 1 FROM public.proposal_schedule_milestones
          WHERE id = 'fb055000-0000-4000-8000-000000000001'),
    'active studio peer must see phase schedule milestones';
  ASSERT (SELECT count(*) = 1 FROM public.proposal_palettes
          WHERE id = 'fb058000-0000-4000-8000-000000000001'),
    'active studio peer must see proposal palettes';
  ASSERT (SELECT count(*) = 1 FROM public.palette_swatches
          WHERE id = 'fb059000-0000-4000-8000-000000000001'),
    'active studio peer must see proposal palette swatches';
  ASSERT (SELECT count(*) = 1 FROM public.proposal_team_members
          WHERE id = 'fb05a000-0000-4000-8000-000000000001'),
    'active studio peer must see proposal team rows';
  ASSERT (SELECT count(*) = 1 FROM public.spec_field_defs
          WHERE id = 'fb05b000-0000-4000-8000-000000000001'),
    'active studio peer must see proposal custom field definitions';

  ASSERT (
    pg_temp.proposal_phase_child_counts(
      'fb040000-0000-4000-8000-000000000006'
    )->>'deliverables'
  )::integer = 1,
    'source deliverable must survive the preceding checked removals';
  FOREACH v_mode IN ARRAY ARRAY['revision', 'duplicate'] LOOP
    v_clone_id := public.clone_proposal(
      'fb040000-0000-4000-8000-000000000006', v_mode,
      CASE WHEN v_mode = 'revision' THEN 'Topology-safe revision' ELSE NULL END
    );

    ASSERT (SELECT status = 'draft'
                   AND designer_id = 'fb000000-0000-4000-8000-000000000001'
                   AND total_amount = 500
            FROM public.proposals WHERE id = v_clone_id),
      format('%s clone must be a canonical draft with recomputed total', v_mode);
    ASSERT (SELECT count(*) = 2 FROM public.proposal_phases
            WHERE proposal_id = v_clone_id),
      format('%s clone must preserve every remaining phase', v_mode);

    SELECT id INTO v_root_id
    FROM public.proposal_phases
    WHERE proposal_id = v_clone_id AND name = 'Main A';
    SELECT * INTO STRICT v_thread
    FROM public.proposal_phases
    WHERE proposal_id = v_clone_id AND name = 'Thread B';
    ASSERT v_thread.follows_phase_id = v_root_id
           AND v_thread.lane = 'thread'
           AND v_thread.duration_days = 20
           AND v_thread.anchor_date = '2027-02-01'::date,
      format('%s clone must remap predecessor and preserve chain fields', v_mode);
    ASSERT (SELECT duration_days = 10
                   AND anchor_date = '2027-01-05'::date
            FROM public.proposal_phases WHERE id = v_root_id),
      format('%s clone must preserve root schedule fields', v_mode);
    ASSERT (pg_temp.proposal_phase_child_counts(v_clone_id)
            ->>'deliverables')::integer = 1,
      format('%s clone must remap phase deliverables', v_mode);
    ASSERT (pg_temp.proposal_phase_child_counts(v_clone_id)
            ->>'gates')::integer = 1,
      format('%s clone must remap phase gates', v_mode);
    ASSERT (pg_temp.proposal_phase_child_counts(v_clone_id)
            ->>'schedule_milestones')::integer = 1,
      format('%s clone must carry schedule milestones', v_mode);
    ASSERT (pg_temp.proposal_phase_child_counts(v_clone_id)
            ->>'payment_milestones')::integer = 1
           AND (pg_temp.proposal_phase_child_counts(v_clone_id)
                ->>'linked_payment_milestones')::integer = 1,
      format('%s clone must remap payment milestones', v_mode);
    ASSERT (SELECT count(*) = 1 FROM public.proposal_palettes
            WHERE proposal_id = v_clone_id)
           AND (pg_temp.proposal_phase_child_counts(v_clone_id)
                ->>'palettes')::integer = 1,
      format('%s clone palette must be peer-visible and physically present', v_mode);
    ASSERT (SELECT count(*) = 1
            FROM public.palette_swatches AS swatch
            JOIN public.proposal_palettes AS palette
              ON palette.id = swatch.palette_id
            WHERE palette.proposal_id = v_clone_id)
           AND (pg_temp.proposal_phase_child_counts(v_clone_id)
                ->>'swatches')::integer = 1,
      format('%s clone swatch must be peer-visible and physically present', v_mode);
    ASSERT (SELECT count(*) = 1 FROM public.proposal_team_members
            WHERE proposal_id = v_clone_id)
           AND (pg_temp.proposal_phase_child_counts(v_clone_id)
                ->>'team_members')::integer = 1,
      format('%s clone team must be peer-visible and physically present', v_mode);
    ASSERT (SELECT count(*) = 1 FROM public.spec_field_defs
            WHERE proposal_id = v_clone_id)
           AND (pg_temp.proposal_phase_child_counts(v_clone_id)
                ->>'spec_fields')::integer = 1,
      format('%s clone fields must be peer-visible and physically present', v_mode);

    IF v_mode = 'revision' THEN
      ASSERT (SELECT parent_proposal_id =
                     'fb040000-0000-4000-8000-000000000006'
                     AND version = 2
              FROM public.proposals WHERE id = v_clone_id),
        'revision clone must retain revision lineage';
    ELSE
      ASSERT (SELECT parent_proposal_id IS NULL AND version = 1
              FROM public.proposals WHERE id = v_clone_id),
        'duplicate clone must start an independent lineage';
    END IF;
  END LOOP;
END;
$$;

-- As-built proposal birth uses canonical studio authority. The exact existing
-- result is a retry receipt, while guests cannot create the first row.
DO $$
DECLARE
  v_first uuid[];
  v_retry uuid[];
  v_error text;
BEGIN
  SELECT array_agg(result.phase_id ORDER BY result.phase_id) INTO v_first
  FROM public.copy_schedule_as_built(
    'fb070000-0000-4000-8000-000000000001',
    'fb040000-0000-4000-8000-000000000007', NULL
  ) AS result(phase_id);
  SELECT array_agg(result.phase_id ORDER BY result.phase_id) INTO v_retry
  FROM public.copy_schedule_as_built(
    'fb070000-0000-4000-8000-000000000001',
    'fb040000-0000-4000-8000-000000000007', NULL
  ) AS result(phase_id);
  ASSERT v_first = v_retry AND cardinality(v_first) = 2,
    'exact as-built retry must return the existing phase receipt';
  ASSERT pg_temp.phase_count('fb040000-0000-4000-8000-000000000007') = 2,
    'exact as-built retry must not duplicate phases';
  ASSERT (SELECT count(*) = 1 FROM public.proposal_phases
          WHERE proposal_id = 'fb040000-0000-4000-8000-000000000007'
            AND follows_phase_id IS NULL),
    'as-built proposal copy must create one connected root';

  PERFORM pg_temp.assume_phase_actor('fb000000-0000-4000-8000-000000000003');
  BEGIN
    PERFORM public.copy_schedule_as_built(
      'fb070000-0000-4000-8000-000000000001',
      'fb040000-0000-4000-8000-000000000008', NULL
    );
  EXCEPTION WHEN insufficient_privilege THEN v_error := SQLERRM;
  END;
  ASSERT v_error IS NOT NULL, 'guest cannot copy an as-built schedule';
  ASSERT pg_temp.phase_count('fb040000-0000-4000-8000-000000000008') = 0,
    'denied as-built copy must leave an empty target';
END;
$$;

-- Owner and active exact-studio peer can append. The second call represents a
-- stale second tab: neither client supplies a tail/order, so the server links
-- the second row to the row committed by the first.
SELECT pg_temp.assume_phase_actor('fb000000-0000-4000-8000-000000000001');
DO $$
DECLARE
  v_first public.proposal_phases;
  v_second public.proposal_phases;
BEGIN
  v_first := public.create_proposal_phase(
    'fb040000-0000-4000-8000-000000000001', 'Owner root',
    'consultation', 1, 1200, 2, NULL, '[]', 7, NULL, 'main'
  );
  ASSERT (SELECT total_amount = 1200 FROM public.proposals
          WHERE id = 'fb040000-0000-4000-8000-000000000001'),
    'phase create and its fee contribution must commit atomically';
  PERFORM pg_temp.assume_phase_actor('fb000000-0000-4000-8000-000000000002');
  v_second := public.create_proposal_phase(
    'fb040000-0000-4000-8000-000000000001', 'Peer append',
    'concept_development', 2, 2300, 2, NULL, '[]', 14, NULL, 'main'
  );
  ASSERT v_first.follows_phase_id IS NULL,
    'first checked phase create must make the sole root';
  ASSERT v_second.follows_phase_id = v_first.id
         AND v_second.sort_order = v_first.sort_order + 1,
    'second-tab create must derive the committed server tail/order';
  ASSERT (SELECT total_amount = 3500 FROM public.proposals
          WHERE id = 'fb040000-0000-4000-8000-000000000001'),
    'serialized peer create must preserve every committed phase fee';
END;
$$;

-- Same-studio peer execution reaches the SECURITY DEFINER body (rather than
-- failing on private helper EXECUTE). A lost response retries the durable
-- request receipt; a deliberate different-template request still appends.
SELECT pg_temp.assume_phase_actor('fb000000-0000-4000-8000-000000000002');
DO $$
DECLARE
  v_before bigint;
  v_first uuid[];
  v_retry uuid[];
  v_second_tab uuid[];
  v_error text;
BEGIN
  v_before := pg_temp.phase_count('fb040000-0000-4000-8000-000000000001');
  PERFORM pg_temp.assume_phase_actor('fb000000-0000-4000-8000-000000000001');
  SELECT array_agg(result.phase_id ORDER BY result.phase_id) INTO v_first
  FROM public.apply_phase_template(
    'fb040000-0000-4000-8000-000000000001', 'patina_six',
    'fb080000-0000-4000-8000-000000000001'
  ) AS result(phase_id);
  ASSERT pg_temp.phase_count('fb040000-0000-4000-8000-000000000001')
         = v_before + 6,
    'active studio peer must append the complete template';

  PERFORM pg_temp.assume_phase_actor('fb000000-0000-4000-8000-000000000002');
  SELECT array_agg(result.phase_id ORDER BY result.phase_id) INTO v_retry
  FROM public.apply_phase_template(
    'fb040000-0000-4000-8000-000000000001', 'patina_six',
    'fb080000-0000-4000-8000-000000000001'
  ) AS result(phase_id);
  ASSERT v_retry = v_first,
    'an authorized collaborator retry must return the exact original phase ids';
  ASSERT pg_temp.phase_count('fb040000-0000-4000-8000-000000000001')
         = v_before + 6,
    'a lost-response retry must return its receipt without duplicate scope';

  SELECT array_agg(result.phase_id ORDER BY result.phase_id) INTO v_second_tab
  FROM public.apply_phase_template(
    'fb040000-0000-4000-8000-000000000001', 'patina_six',
    'fb080000-0000-4000-8000-000000000006'
  ) AS result(phase_id);
  ASSERT v_second_tab = v_first,
    'a second-tab request id for the same template must return the first effect';
  ASSERT pg_temp.phase_count('fb040000-0000-4000-8000-000000000001')
         = v_before + 6,
    'a second-tab request id must not apply the same template twice';

  BEGIN
    PERFORM public.apply_phase_template(
      'fb040000-0000-4000-8000-000000000001', 'design_only',
      'fb080000-0000-4000-8000-000000000001'
    );
  EXCEPTION WHEN serialization_failure THEN v_error := SQLERRM;
  END;
  ASSERT v_error IS NOT NULL,
    'reusing a proposal-scoped request id for a different template must reject';
  ASSERT pg_temp.phase_count('fb040000-0000-4000-8000-000000000001')
         = v_before + 6,
    'a conflicting request id must leave the schedule unchanged';

  PERFORM public.apply_phase_template(
    'fb040000-0000-4000-8000-000000000001', 'design_only',
    'fb080000-0000-4000-8000-000000000002'
  );
  ASSERT pg_temp.phase_count('fb040000-0000-4000-8000-000000000001')
         = v_before + 9,
    'a deliberate different-template request must append its own phases';
  ASSERT (SELECT count(*) = 1
          FROM public.proposal_phases
          WHERE proposal_id = 'fb040000-0000-4000-8000-000000000001'
            AND lane = 'main' AND follows_phase_id IS NULL),
    'nonempty and duplicate template applies must retain one main root';
  ASSERT NOT EXISTS (
    SELECT follows_phase_id
    FROM public.proposal_phases
    WHERE proposal_id = 'fb040000-0000-4000-8000-000000000001'
      AND lane = 'main' AND follows_phase_id IS NOT NULL
    GROUP BY follows_phase_id HAVING count(*) > 1
  ), 'serialized template applies must not create sibling main successors';
END;
$$;

-- Guest, shared non-design contractor, and outsider have no schedule-author
-- authority. Every denied create/apply is side-effect free.
DO $$
DECLARE
  v_actor uuid;
  v_error text;
  v_before bigint := pg_temp.phase_count(
    'fb040000-0000-4000-8000-000000000005'
  );
  v_proposal_before bigint := pg_temp.proposal_count();
BEGIN
  FOREACH v_actor IN ARRAY ARRAY[
    'fb000000-0000-4000-8000-000000000003'::uuid,
    'fb000000-0000-4000-8000-000000000004'::uuid,
    'fb000000-0000-4000-8000-000000000005'::uuid
  ] LOOP
    PERFORM pg_temp.assume_phase_actor(v_actor);
    v_error := NULL;
    BEGIN
      PERFORM public.create_proposal_phase(
        'fb040000-0000-4000-8000-000000000005', 'forged'
      );
    EXCEPTION WHEN insufficient_privilege THEN v_error := SQLERRM;
    END;
    ASSERT v_error IS NOT NULL,
      format('actor %s must not create a proposal phase', v_actor);

    v_error := NULL;
    BEGIN
      PERFORM public.apply_phase_template(
        'fb040000-0000-4000-8000-000000000005', 'patina_six',
        gen_random_uuid()
      );
    EXCEPTION WHEN insufficient_privilege THEN v_error := SQLERRM;
    END;
    ASSERT v_error IS NOT NULL,
      format('actor %s must not apply a proposal template', v_actor);
    ASSERT pg_temp.phase_count('fb040000-0000-4000-8000-000000000005')
           = v_before,
      'denied schedule calls must leave no phase effects';

    v_error := NULL;
    BEGIN
      PERFORM public.clone_proposal(
        'fb040000-0000-4000-8000-000000000006', 'duplicate', NULL
      );
    EXCEPTION WHEN insufficient_privilege THEN v_error := SQLERRM;
    END;
    ASSERT v_error IS NOT NULL,
      format('actor %s must not clone another author proposal', v_actor);
    ASSERT pg_temp.proposal_count() = v_proposal_before,
      'denied clone must leave no draft/header effects';
  END LOOP;
END;
$$;

-- Strict historical prefix repair: link the three exact old rows and append
-- only old-default phases 4..5. A complete five-row legacy set only links.
SELECT pg_temp.assume_phase_actor('fb000000-0000-4000-8000-000000000001');
DO $$
DECLARE
  v_partial_first uuid[];
  v_partial_retry uuid[];
  v_full_first uuid[];
  v_full_retry uuid[];
  v_tail_id uuid;
  v_expected timestamptz;
  v_error text;
BEGIN
  SELECT array_agg(result.phase_id) INTO v_partial_first
  FROM public.apply_phase_template(
    'fb040000-0000-4000-8000-000000000002', 'patina_six',
    'fb080000-0000-4000-8000-000000000003'
  ) AS result(phase_id);
  SELECT array_agg(result.phase_id) INTO v_partial_retry
  FROM public.apply_phase_template(
    'fb040000-0000-4000-8000-000000000002', 'patina_six',
    'fb080000-0000-4000-8000-000000000003'
  ) AS result(phase_id);
  ASSERT cardinality(v_partial_first) = 5
         AND v_partial_retry = v_partial_first,
    'partial legacy recovery receipt must include and replay the full chain';
  ASSERT pg_temp.phase_count('fb040000-0000-4000-8000-000000000002') = 5,
    'known three-row prefix must receive only the missing two-row suffix';
  ASSERT (SELECT total_amount = 1000000 FROM public.proposals
          WHERE id = 'fb040000-0000-4000-8000-000000000002'),
    'legacy recovery must preserve exact historical phase fees';
  ASSERT (SELECT count(*) = 1
          FROM public.proposal_phases
          WHERE proposal_id = 'fb040000-0000-4000-8000-000000000002'
            AND follows_phase_id IS NULL),
    'known prefix recovery must leave exactly one root';
  ASSERT NOT EXISTS (
    SELECT follows_phase_id
    FROM public.proposal_phases
    WHERE proposal_id = 'fb040000-0000-4000-8000-000000000002'
      AND follows_phase_id IS NOT NULL
    GROUP BY follows_phase_id HAVING count(*) > 1
  ), 'known prefix recovery must produce a linear suffix';

  SELECT array_agg(result.phase_id) INTO v_full_first
  FROM public.apply_phase_template(
    'fb040000-0000-4000-8000-000000000009', 'patina_six',
    'fb080000-0000-4000-8000-000000000004'
  ) AS result(phase_id);
  SELECT array_agg(result.phase_id) INTO v_full_retry
  FROM public.apply_phase_template(
    'fb040000-0000-4000-8000-000000000009', 'patina_six',
    'fb080000-0000-4000-8000-000000000004'
  ) AS result(phase_id);
  ASSERT cardinality(v_full_first) = 5 AND v_full_retry = v_full_first,
    'full repaired legacy receipt must include and replay every existing row';
  ASSERT pg_temp.phase_count('fb040000-0000-4000-8000-000000000009') = 5,
    'complete legacy defaults must be linked without any appended rows';
  ASSERT (SELECT count(*) = 1
          FROM public.proposal_phases
          WHERE proposal_id = 'fb040000-0000-4000-8000-000000000009'
            AND follows_phase_id IS NULL),
    'complete legacy defaults must become one connected chain';

  SELECT id, updated_at INTO v_tail_id, v_expected
  FROM public.proposal_phases
  WHERE proposal_id = 'fb040000-0000-4000-8000-000000000002'
  ORDER BY sort_order DESC, id DESC LIMIT 1;
  PERFORM public.update_proposal_phase(
    v_tail_id, 'fb040000-0000-4000-8000-000000000002',
    '{"name":"Changed after recovery"}'::jsonb, v_expected
  );
  BEGIN
    PERFORM public.apply_phase_template(
      'fb040000-0000-4000-8000-000000000002', 'patina_six',
      'fb080000-0000-4000-8000-000000000003'
    );
  EXCEPTION WHEN serialization_failure THEN v_error := SQLERRM;
  END;
  ASSERT v_error IS NOT NULL,
    'partial recovery retry must detect a changed recorded phase';

  SELECT updated_at INTO v_expected
  FROM public.proposal_phases WHERE id = v_tail_id;
  PERFORM public.remove_proposal_phase(
    v_tail_id, 'fb040000-0000-4000-8000-000000000002', v_expected
  );
  v_error := NULL;
  BEGIN
    PERFORM public.apply_phase_template(
      'fb040000-0000-4000-8000-000000000002', 'patina_six',
      'fb080000-0000-4000-8000-000000000003'
    );
  EXCEPTION WHEN serialization_failure THEN v_error := SQLERRM;
  END;
  ASSERT v_error IS NOT NULL,
    'partial recovery retry must detect a missing recorded prefix/suffix row';

  SELECT id, updated_at INTO v_tail_id, v_expected
  FROM public.proposal_phases
  WHERE proposal_id = 'fb040000-0000-4000-8000-000000000009'
  ORDER BY sort_order DESC, id DESC LIMIT 1;
  PERFORM public.remove_proposal_phase(
    v_tail_id, 'fb040000-0000-4000-8000-000000000009', v_expected
  );
  v_error := NULL;
  BEGIN
    PERFORM public.apply_phase_template(
      'fb040000-0000-4000-8000-000000000009', 'patina_six',
      'fb080000-0000-4000-8000-000000000004'
    );
  EXCEPTION WHEN serialization_failure THEN v_error := SQLERRM;
  END;
  ASSERT v_error IS NOT NULL,
    'full recovery retry must detect a missing recorded legacy row';
END;
$$;

-- Client telemetry remains available, but clients cannot mint signature
-- evidence even with a forged timestamp and the exact custom GUC value.
SELECT pg_temp.assume_phase_actor('fb000000-0000-4000-8000-000000000006');
DO $$
DECLARE
  v_error text;
BEGIN
  INSERT INTO public.proposal_engagement (
    id, proposal_id, viewer_id, event_type, created_at
  ) VALUES (
    'fb060000-0000-4000-8000-000000000001',
    'fb040000-0000-4000-8000-000000000004',
    'fb000000-0000-4000-8000-000000000006', 'opened',
    '1999-01-01T00:00:00Z'
  );

  PERFORM set_config(
    'app.proposal_signature_engagement_id',
    'fb060000-0000-4000-8000-000000000002', true
  );
  BEGIN
    INSERT INTO public.proposal_engagement (
      id, proposal_id, viewer_id, event_type, created_at
    ) VALUES (
      'fb060000-0000-4000-8000-000000000002',
      'fb040000-0000-4000-8000-000000000004',
      'fb000000-0000-4000-8000-000000000006', 'signed',
      '1999-01-01T00:00:00Z'
    );
  EXCEPTION WHEN check_violation THEN v_error := SQLERRM;
  END;
  ASSERT v_error IS NOT NULL,
    'client cannot forge signed evidence even with the exact row token';

  v_error := NULL;
  BEGIN
    INSERT INTO public.proposal_engagement (
      id, proposal_id, viewer_id, event_type, created_at
    ) VALUES (
      'fb060000-0000-4000-8000-000000000003',
      'fb040000-0000-4000-8000-000000000004',
      'fb000000-0000-4000-8000-000000000006', 'signed_offline',
      '1999-01-01T00:00:00Z'
    );
  EXCEPTION WHEN check_violation THEN v_error := SQLERRM;
  END;
  ASSERT v_error IS NOT NULL, 'client cannot forge signed_offline evidence';
  ASSERT pg_temp.signature_engagement_count(
    'fb040000-0000-4000-8000-000000000004'
  ) = 0, 'rejected signature forgeries must leave no evidence rows';
END;
$$;

-- A real client can sign the arbitrary issued legacy proposal after the
-- migration normalization; activation receives the same connected chain.
DO $$
DECLARE
  v_receipt jsonb;
  v_project_id uuid;
BEGIN
  v_receipt := pg_temp.sign_proposal_compat(
    'fb040000-0000-4000-8000-000000000010', 'Phase Client'
  );
  v_project_id := (v_receipt->>'project_id')::uuid;
  ASSERT v_project_id IS NOT NULL,
    'normalized issued legacy proposal must activate on signature';
  ASSERT pg_temp.proposal_state(
    'fb040000-0000-4000-8000-000000000010'
  ) = '{"status":"accepted","total_amount":600}'::jsonb,
    format(
      'legacy signature must preserve amount/acceptance, got %s',
      pg_temp.proposal_state('fb040000-0000-4000-8000-000000000010')
    );
  ASSERT (SELECT count(*) = 3 FROM public.project_phases
          WHERE project_id = v_project_id),
    'legacy activation must copy all three phases';
  ASSERT (SELECT count(*) = 1 FROM public.project_phases
          WHERE project_id = v_project_id AND follows_phase_id IS NULL),
    'legacy activation must retain one project root';
  ASSERT NOT EXISTS (
    SELECT follows_phase_id
    FROM public.project_phases
    WHERE project_id = v_project_id AND follows_phase_id IS NOT NULL
    GROUP BY follows_phase_id HAVING count(*) > 1
  ), 'legacy activation must retain one linear successor chain';
  ASSERT pg_temp.signature_engagement_count(
    'fb040000-0000-4000-8000-000000000010'
  ) = 1, 'legacy signature must mint one canonical evidence row';
END;
$$;

-- Apply while draft, then use the real client signature path. Activation must
-- carry the exact connected proposal topology into one connected project.
RESET ROLE;
SELECT set_config('request.jwt.claims', '{}', true);
UPDATE public.proposals
SET status = 'draft', sent_at = NULL
WHERE id = 'fb040000-0000-4000-8000-000000000003';
SET LOCAL ROLE authenticated;
SELECT pg_temp.assume_phase_actor('fb000000-0000-4000-8000-000000000001');
SELECT public.apply_phase_template(
  'fb040000-0000-4000-8000-000000000003', 'patina_six',
  'fb080000-0000-4000-8000-000000000005'
);

RESET ROLE;
SELECT set_config('request.jwt.claims', '{}', true);
SELECT set_config(
  'app.proposal_send_id',
  'fb040000-0000-4000-8000-000000000003', true
);
UPDATE public.proposals
SET status = 'sent', sent_at = now(), updated_at = now()
WHERE id = 'fb040000-0000-4000-8000-000000000003';
SELECT set_config('app.proposal_send_id', '', true);
SET LOCAL ROLE authenticated;
SELECT pg_temp.assume_phase_actor('fb000000-0000-4000-8000-000000000006');
DO $$
DECLARE
  v_receipt jsonb;
  v_project_id uuid;
BEGIN
  v_receipt := pg_temp.sign_proposal_compat(
    'fb040000-0000-4000-8000-000000000003', 'Phase Client'
  );
  v_project_id := (v_receipt->>'project_id')::uuid;
  ASSERT v_project_id IS NOT NULL, 'signature must activate its proposal';
  ASSERT (SELECT count(*) = 6 FROM public.project_phases
          WHERE project_id = v_project_id),
    'signature activation must copy all composed phases';
  ASSERT (SELECT count(*) = 1 FROM public.project_phases
          WHERE project_id = v_project_id AND follows_phase_id IS NULL),
    'signature activation must retain one project root';
  ASSERT NOT EXISTS (
    SELECT follows_phase_id
    FROM public.project_phases
    WHERE project_id = v_project_id AND follows_phase_id IS NOT NULL
    GROUP BY follows_phase_id HAVING count(*) > 1
  ), 'signature activation must retain a linear main chain';
  ASSERT pg_temp.signature_engagement_count(
    'fb040000-0000-4000-8000-000000000003'
  ) = 1, 'canonical signature must mint one reserved engagement row';
END;
$$;

-- Reserved signature evidence cannot be rewritten or removed, including by
-- direct database maintenance; a correction must be a new audited fact.
RESET ROLE;
SELECT set_config('request.jwt.claims', '{}', true);
DO $$
DECLARE
  v_engagement_id uuid;
  v_error text;
BEGIN
  SELECT id INTO v_engagement_id
  FROM public.proposal_engagement
  WHERE proposal_id = 'fb040000-0000-4000-8000-000000000003'
    AND event_type = 'signed';

  BEGIN
    UPDATE public.proposal_engagement
    SET created_at = now() - interval '100 years'
    WHERE id = v_engagement_id;
  EXCEPTION WHEN check_violation THEN v_error := SQLERRM;
  END;
  ASSERT v_error = 'signature engagement evidence is immutable',
    'reserved signature update must reject';

  v_error := NULL;
  BEGIN
    DELETE FROM public.proposal_engagement WHERE id = v_engagement_id;
  EXCEPTION WHEN check_violation THEN v_error := SQLERRM;
  END;
  ASSERT v_error = 'signature engagement evidence is immutable',
    'reserved signature delete must reject';
END;
$$;

ROLLBACK;
