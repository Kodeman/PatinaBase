-- Canonical workflow spine contract / authorization regression (00461)
-- Run:
--   psql 'postgresql://postgres:postgres@127.0.0.1:54322/postgres' \
--     -v ON_ERROR_STOP=1 \
--     -f supabase/tests/workflow/canonical_workflow_spine_test.sql

BEGIN;

SET LOCAL statement_timeout = '20s';
CREATE EXTENSION IF NOT EXISTS dblink WITH SCHEMA extensions;

INSERT INTO auth.users (
  id, email, encrypted_password, email_confirmed_at, created_at, updated_at,
  instance_id, aud, role
)
VALUES
  ('ed000000-0000-4000-8000-000000000001',
   'workflow-owner@test.invalid', '', now(), now(), now(),
   '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated'),
  ('ed000000-0000-4000-8000-000000000002',
   'workflow-client@test.invalid', '', now(), now(), now(),
   '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated'),
  ('ed000000-0000-4000-8000-000000000003',
   'workflow-outsider@test.invalid', '', now(), now(), now(),
   '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated'),
  ('ed000000-0000-4000-8000-000000000004',
   'workflow-other-designer@test.invalid', '', now(), now(), now(),
   '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated');

INSERT INTO public.profiles (id, email, full_name, created_at, updated_at)
VALUES
  ('ed000000-0000-4000-8000-000000000001',
   'workflow-owner@test.invalid', 'Workflow Owner', now(), now()),
  ('ed000000-0000-4000-8000-000000000002',
   'workflow-client@test.invalid', 'Workflow Client', now(), now()),
  ('ed000000-0000-4000-8000-000000000003',
   'workflow-outsider@test.invalid', 'Workflow Outsider', now(), now()),
  ('ed000000-0000-4000-8000-000000000004',
   'workflow-other-designer@test.invalid', 'Other Designer', now(), now())
ON CONFLICT (id) DO UPDATE
SET email = EXCLUDED.email,
    full_name = EXCLUDED.full_name,
    updated_at = EXCLUDED.updated_at;

INSERT INTO public.designer_clients (
  id, designer_id, client_id, client_name, status, source
)
VALUES (
  'ed100000-0000-4000-8000-000000000001',
  'ed000000-0000-4000-8000-000000000001',
  'ed000000-0000-4000-8000-000000000002',
  'Workflow Client', 'proposal', 'direct'
);

INSERT INTO public.proposals (
  id, designer_id, designer_client_id, client_id, title, total_amount,
  status, valid_until
)
VALUES (
  'ed200000-0000-4000-8000-000000000001',
  'ed000000-0000-4000-8000-000000000001',
  'ed100000-0000-4000-8000-000000000001',
  'ed000000-0000-4000-8000-000000000002',
  'Workflow spine fixture', 0, 'draft', now() + interval '30 days'
);

CREATE OR REPLACE FUNCTION pg_temp.assume_workflow_actor(p_actor uuid)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', p_actor, 'role', 'authenticated')::text,
    true
  );
END;
$$;
GRANT EXECUTE ON FUNCTION pg_temp.assume_workflow_actor(uuid) TO PUBLIC;

CREATE TEMP TABLE workflow_test_result (
  project_id uuid,
  primary_phase_id uuid,
  custom_phase_id uuid,
  duplicate_phase_id uuid,
  null_phase_id uuid
) ON COMMIT DROP;
GRANT SELECT, INSERT, UPDATE ON workflow_test_result TO authenticated;

-- A designer-owned template proves server versioning and receipt provenance.
SET LOCAL ROLE authenticated;
SELECT pg_temp.assume_workflow_actor(
  'ed000000-0000-4000-8000-000000000001'
);

DO $$
DECLARE
  v_state text;
BEGIN
  BEGIN
    INSERT INTO public.phase_templates (
      id, slug, label, is_system, designer_id, phases
    ) VALUES (
      'ed300000-0000-4000-8000-000000000010',
      'workflow-partial-classification',
      'Invalid partial classification',
      false,
      'ed000000-0000-4000-8000-000000000001',
      '[{
        "name":"Partial",
        "phase_key":"partial",
        "canonical_stage_key":"concept_schematic"
      }]'::jsonb
    );
  EXCEPTION WHEN check_violation THEN
    v_state := SQLSTATE;
  END;
  ASSERT v_state = '23514',
    'custom templates must reject partial stage/track classification';

  v_state := NULL;
  BEGIN
    INSERT INTO public.phase_templates (
      id, slug, label, is_system, designer_id, phases
    ) VALUES (
      'ed300000-0000-4000-8000-000000000011',
      'workflow-invalid-capability',
      'Invalid stage/track capability',
      false,
      'ed000000-0000-4000-8000-000000000001',
      '[{
        "name":"Invalid construction concept",
        "phase_key":"invalid_concept",
        "canonical_stage_key":"concept_schematic",
        "workflow_track":"construction"
      }]'::jsonb
    );
  EXCEPTION WHEN check_violation THEN
    v_state := SQLSTATE;
  END;
  ASSERT v_state = '23514',
    'custom templates must reject stage/track pairs outside the ledger';
END;
$$;

INSERT INTO public.phase_templates (
  id, slug, label, is_system, designer_id, phases, version
)
VALUES (
  'ed300000-0000-4000-8000-000000000001',
  'workflow-spine-contract',
  'Workflow Spine Contract',
  false,
  'ed000000-0000-4000-8000-000000000001',
  '[{
    "name":"Construction Administration",
    "phase_key":"construction_admin",
    "canonical_stage_key":"contract_administration",
    "workflow_track":"construction",
    "duration_weeks":2,
    "duration_days":14,
    "fee_cents":100000,
    "revision_limit":1,
    "sort_order":0,
    "deliverables":[{
      "label":"Site visit log",
      "description":"Weekly field record",
      "is_required":true,
      "sort_order":0
    }],
    "default_gates":[]
  }]'::jsonb,
  99
);

DO $$
BEGIN
  ASSERT (
    SELECT version = 1
    FROM public.phase_templates
    WHERE slug = 'workflow-spine-contract'
  ), 'template INSERT version must be server-owned and start at one';
END;
$$;

SELECT public.apply_phase_template(
  'ed200000-0000-4000-8000-000000000001',
  'workflow-spine-contract',
  'ed310000-0000-4000-8000-000000000001'
);

UPDATE public.proposal_phases
SET gate_condition = 'Release after weekly field review'
WHERE proposal_id = 'ed200000-0000-4000-8000-000000000001'
  AND phase_key = 'construction_admin';

DO $$
BEGIN
  ASSERT (
    SELECT canonical_stage_key = 'contract_administration'
       AND workflow_track = 'construction'
       AND source_template_slug = 'workflow-spine-contract'
       AND source_template_version = 1
    FROM public.proposal_phases
    WHERE proposal_id = 'ed200000-0000-4000-8000-000000000001'
      AND phase_key = 'construction_admin'
  ), 'template application must snapshot stage, track, and version provenance';
END;
$$;

-- A concurrent template writer must conflict at the authoritative template
-- read before any phase or receipt can be materialized. The system template is
-- committed fixture data, so the remote dblink session can lock it while this
-- transaction's proposal remains visible to the local caller.
DO $$
DECLARE
  v_conninfo text := format(
    'hostaddr=%s port=%s dbname=postgres user=postgres password=postgres',
    inet_server_addr(), inet_server_port()
  );
  v_state text;
BEGIN
  PERFORM extensions.dblink_connect('workflow_template_locker', v_conninfo);
  PERFORM extensions.dblink_exec('workflow_template_locker', 'BEGIN');
  PERFORM locked.id
  FROM extensions.dblink(
    'workflow_template_locker',
    $remote$
      SELECT id::text
      FROM public.phase_templates
      WHERE slug = 'classic_5_phase'
      FOR UPDATE
    $remote$
  ) AS locked(id text);

  PERFORM set_config('lock_timeout', '250ms', true);
  BEGIN
    PERFORM public.apply_phase_template(
      'ed200000-0000-4000-8000-000000000001',
      'classic_5_phase',
      'ed310000-0000-4000-8000-000000000009'
    );
  EXCEPTION WHEN lock_not_available THEN
    v_state := SQLSTATE;
  END;
  PERFORM set_config('lock_timeout', '5s', true);

  ASSERT v_state = '55P03',
    'apply_phase_template must wait on a concurrent template content writer';

  PERFORM extensions.dblink_exec('workflow_template_locker', 'ROLLBACK');
  PERFORM extensions.dblink_disconnect('workflow_template_locker');
END;
$$;

RESET ROLE;
DO $$
BEGIN
  ASSERT NOT EXISTS (
    SELECT 1
    FROM public.proposal_phase_template_applications
    WHERE proposal_id = 'ed200000-0000-4000-8000-000000000001'
      AND request_id = 'ed310000-0000-4000-8000-000000000009'
  ), 'a lock-conflicted template application must leave no receipt';
END;
$$;
SET LOCAL ROLE authenticated;
SELECT pg_temp.assume_workflow_actor(
  'ed000000-0000-4000-8000-000000000001'
);

-- Presentation-only edits do not bump content version; blueprint edits do.
UPDATE public.phase_templates
SET label = 'Workflow Spine Contract — renamed'
WHERE slug = 'workflow-spine-contract';

DO $$
BEGIN
  ASSERT (
    SELECT version = 1
    FROM public.phase_templates
    WHERE slug = 'workflow-spine-contract'
  ), 'template label edits must not change the content version';
END;
$$;

UPDATE public.phase_templates
SET phases = jsonb_set(phases, '{0,duration_days}', '21'::jsonb)
WHERE slug = 'workflow-spine-contract';

DO $$
BEGIN
  ASSERT (
    SELECT version = 2
    FROM public.phase_templates
    WHERE slug = 'workflow-spine-contract'
  ), 'template blueprint edits must increment the content version';

  ASSERT (
    SELECT source_template_version = 1
    FROM public.proposal_phases
    WHERE proposal_id = 'ed200000-0000-4000-8000-000000000001'
      AND phase_key = 'construction_admin'
  ), 'already-materialized phases must retain their original template version';
END;
$$;

RESET ROLE;

DO $$
BEGIN
  ASSERT (
    SELECT template_version = 1
    FROM public.proposal_phase_template_applications
    WHERE proposal_id = 'ed200000-0000-4000-8000-000000000001'
      AND request_id = 'ed310000-0000-4000-8000-000000000001'
  ), 'application receipt must retain the applied template version';
END;
$$;

SET LOCAL ROLE authenticated;
SELECT pg_temp.assume_workflow_actor(
  'ed000000-0000-4000-8000-000000000004'
);
INSERT INTO public.phase_templates (
  id, slug, label, is_system, designer_id, phases
) VALUES (
  'ed300000-0000-4000-8000-000000000004',
  'workflow-other-private',
  'Other designer private template',
  false,
  'ed000000-0000-4000-8000-000000000004',
  '[{
    "name":"Private discovery",
    "phase_key":"private_discovery",
    "canonical_stage_key":"discovery_programming",
    "workflow_track":"core",
    "duration_days":2
  }]'::jsonb
);
RESET ROLE;

-- 00511 makes the design studio the canonical authority for every project:
-- a studio-less project is no longer reachable (prod holds none), and the lead
-- must be an active non-guest member of an active design_studio holding a
-- designer-domain role.
INSERT INTO public.organizations (id, name, slug, type, status)
VALUES ('ed350000-0000-4000-8000-000000000001',
        'Workflow Studio', 'workflow-studio', 'design_studio', 'active');
INSERT INTO public.organization_members (user_id, organization_id, role, status)
VALUES ('ed000000-0000-4000-8000-000000000001',
        'ed350000-0000-4000-8000-000000000001', 'owner', 'active');
INSERT INTO public.user_roles (user_id, role_id, granted_by)
SELECT 'ed000000-0000-4000-8000-000000000001', role.id,
       'ed000000-0000-4000-8000-000000000001'
FROM public.roles AS role WHERE role.name = 'studio_owner';

INSERT INTO public.projects (
  id, name, created_by, designer_id, client_id, studio_id
)
VALUES
  (
    'ed340000-0000-4000-8000-000000000001',
    'Direct template seed fixture',
    'ed000000-0000-4000-8000-000000000001',
    'ed000000-0000-4000-8000-000000000001',
    'ed000000-0000-4000-8000-000000000002',
    'ed350000-0000-4000-8000-000000000001'
  ),
  (
    'ed340000-0000-4000-8000-000000000002',
    'Private template isolation fixture',
    'ed000000-0000-4000-8000-000000000001',
    'ed000000-0000-4000-8000-000000000001',
    'ed000000-0000-4000-8000-000000000002',
    'ed350000-0000-4000-8000-000000000001'
  );

SET LOCAL ROLE authenticated;
SELECT pg_temp.assume_workflow_actor(
  'ed000000-0000-4000-8000-000000000001'
);
DO $$
DECLARE
  v_state text;
BEGIN
  BEGIN
    PERFORM public.seed_project_schedule_from_template(
      'ed340000-0000-4000-8000-000000000002',
      'workflow-other-private'
    );
  EXCEPTION WHEN insufficient_privilege THEN
    v_state := SQLSTATE;
  END;
  ASSERT v_state = '42501',
    'direct project seeding must hide another designer private template';
  ASSERT NOT EXISTS (
    SELECT 1
    FROM public.project_phases
    WHERE project_id = 'ed340000-0000-4000-8000-000000000002'
  ), 'a guessed private template slug must not materialize project phases';
END;
$$;

SELECT public.seed_project_schedule_from_template(
  'ed340000-0000-4000-8000-000000000001',
  'workflow-spine-contract'
);

DO $$
BEGIN
  ASSERT (
    SELECT canonical_stage_key = 'contract_administration'
       AND workflow_track = 'construction'
       AND source_template_slug = 'workflow-spine-contract'
       AND source_template_version = 2
    FROM public.project_phases
    WHERE project_id = 'ed340000-0000-4000-8000-000000000001'
  ), 'direct project template seeding must snapshot the current template version';
END;
$$;

DO $$
DECLARE
  v_state text;
BEGIN
  -- A caller-controlled custom GUC must not turn direct DML into a trusted
  -- definer path; the column ACL and trigger capability both fail closed.
  PERFORM set_config(
    'app.phase_workflow_metadata_token',
    format(
      'phase_workflow_metadata:project_phases:%s:%s',
      'ed340000-0000-4000-8000-000000000001',
      pg_catalog.txid_current()
    ),
    true
  );

  BEGIN
    UPDATE public.project_phases
    SET canonical_stage_key = 'contract_administration',
        workflow_track = 'ffe'
    WHERE project_id = 'ed340000-0000-4000-8000-000000000001';
  EXCEPTION WHEN insufficient_privilege THEN
    v_state := SQLSTATE;
  END;
  ASSERT v_state = '42501',
    'authenticated project phase metadata UPDATE forgery must be denied';

  v_state := NULL;
  BEGIN
    INSERT INTO public.project_phases (
      id, project_id, name, phase_key, sort_order,
      canonical_stage_key, workflow_track
    ) VALUES (
      'ed350000-0000-4000-8000-000000000001',
      'ed340000-0000-4000-8000-000000000001',
      'Forged project phase', 'forged_project', 9,
      'concept_schematic', 'core'
    );
  EXCEPTION WHEN insufficient_privilege THEN
    v_state := SQLSTATE;
  END;
  ASSERT v_state = '42501',
    'authenticated project phase metadata INSERT forgery must be denied';

  v_state := NULL;
  BEGIN
    UPDATE public.proposal_phases
    SET canonical_stage_key = 'contract_administration',
        workflow_track = 'ffe'
    WHERE proposal_id = 'ed200000-0000-4000-8000-000000000001';
  EXCEPTION WHEN insufficient_privilege THEN
    v_state := SQLSTATE;
  END;
  ASSERT v_state = '42501',
    'authenticated proposal phase metadata UPDATE forgery must be denied';

  v_state := NULL;
  BEGIN
    INSERT INTO public.proposal_phases (
      id, proposal_id, name, phase_key, sort_order,
      canonical_stage_key, workflow_track
    ) VALUES (
      'ed350000-0000-4000-8000-000000000002',
      'ed200000-0000-4000-8000-000000000001',
      'Forged proposal phase', 'forged_proposal', 9,
      'concept_schematic', 'core'
    );
  EXCEPTION WHEN insufficient_privilege THEN
    v_state := SQLSTATE;
  END;
  ASSERT v_state = '42501',
    'authenticated proposal phase metadata INSERT forgery must be denied';
END;
$$;
RESET ROLE;

SET LOCAL ROLE service_role;
DO $$
DECLARE
  v_state text;
BEGIN
  BEGIN
    UPDATE public.project_phases
    SET source_template_slug = 'forged', source_template_version = 1
    WHERE project_id = 'ed340000-0000-4000-8000-000000000001';
  EXCEPTION WHEN insufficient_privilege THEN
    v_state := SQLSTATE;
  END;
  ASSERT v_state = '42501',
    'service_role project phase metadata UPDATE forgery must be denied';

  v_state := NULL;
  BEGIN
    INSERT INTO public.project_phases (
      id, project_id, name, sort_order,
      canonical_stage_key, workflow_track
    ) VALUES (
      'ed350000-0000-4000-8000-000000000003',
      'ed340000-0000-4000-8000-000000000001',
      'Service forged project phase', 10,
      'concept_schematic', 'core'
    );
  EXCEPTION WHEN insufficient_privilege THEN
    v_state := SQLSTATE;
  END;
  ASSERT v_state = '42501',
    'service_role project phase metadata INSERT forgery must be denied';

  v_state := NULL;
  BEGIN
    UPDATE public.proposal_phases
    SET source_template_slug = 'forged', source_template_version = 1
    WHERE proposal_id = 'ed200000-0000-4000-8000-000000000001';
  EXCEPTION WHEN insufficient_privilege THEN
    v_state := SQLSTATE;
  END;
  ASSERT v_state = '42501',
    'service_role proposal phase metadata UPDATE forgery must be denied';

  v_state := NULL;
  BEGIN
    INSERT INTO public.proposal_phases (
      id, proposal_id, name, sort_order,
      canonical_stage_key, workflow_track
    ) VALUES (
      'ed350000-0000-4000-8000-000000000004',
      'ed200000-0000-4000-8000-000000000001',
      'Service forged proposal phase', 10,
      'concept_schematic', 'core'
    );
  EXCEPTION WHEN insufficient_privilege THEN
    v_state := SQLSTATE;
  END;
  ASSERT v_state = '42501',
    'service_role proposal phase metadata INSERT forgery must be denied';
END;
$$;
RESET ROLE;

-- A genuinely custom phase stays nullable. It is linked into the same existing
-- topology so activation exercises both classified and unclassified rows.
SET LOCAL ROLE authenticated;
SELECT pg_temp.assume_workflow_actor(
  'ed000000-0000-4000-8000-000000000001'
);
WITH predecessor AS (
  SELECT id
  FROM public.proposal_phases
  WHERE proposal_id = 'ed200000-0000-4000-8000-000000000001'
    AND phase_key = 'construction_admin'
)
INSERT INTO public.proposal_phases (
  id, proposal_id, name, phase_key, duration_days, lane,
  follows_phase_id, fee_cents, revision_limit, sort_order
)
SELECT
  'ed320000-0000-4000-8000-000000000001',
  'ed200000-0000-4000-8000-000000000001',
  'Owner-authored specialist review', 'specialist_review', 3, 'main',
  predecessor.id, 0, 0, 1
FROM predecessor;
RESET ROLE;

DO $$
DECLARE
  v_error text;
BEGIN
  ASSERT (
    SELECT canonical_stage_key IS NULL
       AND workflow_track IS NULL
       AND source_template_slug IS NULL
       AND source_template_version IS NULL
    FROM public.proposal_phases
    WHERE id = 'ed320000-0000-4000-8000-000000000001'
  ), 'ambiguous custom phases must remain nullable';

  BEGIN
    UPDATE public.proposal_phases
    SET workflow_track = 'decor'
    WHERE id = 'ed320000-0000-4000-8000-000000000001';
  EXCEPTION WHEN check_violation THEN
    v_error := SQLERRM;
  END;
  ASSERT v_error IS NOT NULL,
    'workflow_track must reject values outside core|ffe|construction';

  v_error := NULL;
  BEGIN
    UPDATE public.proposal_phases
    SET canonical_stage_key = 'concept_schematic'
    WHERE id = 'ed320000-0000-4000-8000-000000000001';
  EXCEPTION WHEN check_violation THEN
    v_error := SQLERRM;
  END;
  ASSERT v_error IS NOT NULL,
    'proposal phase classification must reject a partial stage/track pair';

  v_error := NULL;
  BEGIN
    UPDATE public.proposal_phases
    SET canonical_stage_key = 'concept_schematic',
        workflow_track = 'construction'
    WHERE id = 'ed320000-0000-4000-8000-000000000001';
  EXCEPTION WHEN check_violation THEN
    v_error := SQLERRM;
  END;
  ASSERT v_error IS NOT NULL,
    'proposal phase classification must enforce the capability ledger';

  v_error := NULL;
  BEGIN
    UPDATE public.proposal_phases
    SET source_template_slug = 'orphaned-version'
    WHERE id = 'ed320000-0000-4000-8000-000000000001';
  EXCEPTION WHEN check_violation THEN
    v_error := SQLERRM;
  END;
  ASSERT v_error IS NOT NULL,
    'template slug and version provenance must be paired';

  v_error := NULL;
  BEGIN
    UPDATE public.project_phases
    SET workflow_track = NULL
    WHERE project_id = 'ed340000-0000-4000-8000-000000000001';
  EXCEPTION WHEN check_violation THEN
    v_error := SQLERRM;
  END;
  ASSERT v_error IS NOT NULL,
    'direct-seeded project phases must reject partial classification';

  v_error := NULL;
  BEGIN
    UPDATE public.project_phases
    SET canonical_stage_key = 'delivery_installation',
        workflow_track = 'construction'
    WHERE project_id = 'ed340000-0000-4000-8000-000000000001';
  EXCEPTION WHEN check_violation THEN
    v_error := SQLERRM;
  END;
  ASSERT v_error IS NOT NULL,
    'direct-seeded project phases must enforce the capability ledger';
END;
$$;

INSERT INTO public.proposal_payment_milestones (
  id, proposal_id, phase_id, label, percentage, amount_cents,
  trigger_condition, sort_order
)
SELECT
  'ed330000-0000-4000-8000-000000000001',
  phase.proposal_id,
  phase.id,
  'Design services', 100.00, 100000,
  'Due on acceptance', 0
FROM public.proposal_phases AS phase
WHERE phase.proposal_id = 'ed200000-0000-4000-8000-000000000001'
  AND phase.phase_key = 'construction_admin';

-- Send, accept without auto-activation, then cross the current public legacy
-- activation boundary. The 00461 trigger carries metadata without replacing
-- that authoritative RPC implementation.
SET LOCAL ROLE authenticated;
SELECT pg_temp.assume_workflow_actor(
  'ed000000-0000-4000-8000-000000000001'
);

SELECT public.send_proposal(
  'ed200000-0000-4000-8000-000000000001',
  snapshot.proposal_updated_at,
  snapshot.proposal_total_amount,
  snapshot.schedule_fingerprint,
  NULL, NULL, now() + interval '30 days'
)
FROM public.get_proposal_send_snapshot(
  'ed200000-0000-4000-8000-000000000001'
) AS snapshot;

SELECT public.record_offline_signature(
  'ed200000-0000-4000-8000-000000000001',
  'Workflow Client', false, current_date
);

INSERT INTO workflow_test_result(project_id)
SELECT public.activate_proposal_as_project(
  'ed200000-0000-4000-8000-000000000001', current_date
);

UPDATE workflow_test_result AS result
SET primary_phase_id = phase.id
FROM public.project_phases AS phase
WHERE phase.project_id = result.project_id
  AND phase.phase_key = 'construction_admin';

UPDATE workflow_test_result AS result
SET custom_phase_id = phase.id
FROM public.project_phases AS phase
WHERE phase.project_id = result.project_id
  AND phase.phase_key = 'specialist_review';

DO $$
BEGIN
  ASSERT (
    SELECT project_phase.canonical_stage_key = 'contract_administration'
       AND project_phase.workflow_track = 'construction'
       AND project_phase.source_template_slug = 'workflow-spine-contract'
       AND project_phase.source_template_version = 1
    FROM workflow_test_result AS result
    JOIN public.project_phases AS project_phase
      ON project_phase.id = result.primary_phase_id
  ), 'proposal activation must carry canonical metadata and provenance';

  ASSERT (
    SELECT project_phase.canonical_stage_key IS NULL
       AND project_phase.workflow_track IS NULL
       AND project_phase.source_template_slug IS NULL
       AND project_phase.source_template_version IS NULL
    FROM workflow_test_result AS result
    JOIN public.project_phases AS project_phase
      ON project_phase.id = result.custom_phase_id
  ), 'activation must preserve an ambiguous phase as nullable';
END;
$$;

DO $$
DECLARE
  v_result workflow_test_result%ROWTYPE;
  v_created public.project_phases%ROWTYPE;
BEGIN
  SELECT * INTO STRICT v_result FROM workflow_test_result;
  SELECT * INTO STRICT v_created
  FROM public.create_project_phase(
    p_project_id => v_result.project_id,
    p_phase_key => 'construction_admin',
    p_name => 'Duplicate local phase key',
    p_sort_order => 2,
    p_duration_days => 1,
    p_follows_phase_id => v_result.custom_phase_id,
    p_lane => 'main'
  );
  UPDATE workflow_test_result
  SET duplicate_phase_id = v_created.id;

  SELECT * INTO STRICT v_result FROM workflow_test_result;
  SELECT * INTO STRICT v_created
  FROM public.create_project_phase(
    p_project_id => v_result.project_id,
    p_phase_key => NULL,
    p_name => 'No local phase key',
    p_sort_order => 3,
    p_duration_days => 1,
    p_follows_phase_id => v_result.duplicate_phase_id,
    p_lane => 'main'
  );
  UPDATE workflow_test_result
  SET null_phase_id = v_created.id;
END;
$$;

DO $$
BEGIN
  ASSERT (
    SELECT duplicate_phase.canonical_stage_key IS NULL
       AND duplicate_phase.workflow_track IS NULL
       AND duplicate_phase.source_template_slug IS NULL
       AND duplicate_phase.source_template_version IS NULL
       AND null_phase.phase_key IS NULL
       AND null_phase.canonical_stage_key IS NULL
       AND null_phase.workflow_track IS NULL
    FROM workflow_test_result AS result
    JOIN public.project_phases AS duplicate_phase
      ON duplicate_phase.id = result.duplicate_phase_id
    JOIN public.project_phases AS null_phase
      ON null_phase.id = result.null_phase_id
  ), 'checked project phase creation must preserve honest NULL metadata';
END;
$$;

RESET ROLE;

-- Existing coordination truth supplies blockers. Due dates are read metadata;
-- they never mutate the project phase lifecycle state.
INSERT INTO public.client_decisions (
  id, designer_client_id, designer_id, project_id, phase_id,
  title, due_date, status, decision_type, blocking_status,
  coordination_kind, court, blocks_kind
)
SELECT
  'ed400000-0000-4000-8000-000000000001',
  'ed100000-0000-4000-8000-000000000001',
  'ed000000-0000-4000-8000-000000000001',
  result.project_id,
  result.primary_phase_id,
  'Release weekly field report',
  now() - interval '2 days',
  'pending', 'approval', 'blocks_phase',
  'signoff', 'client', 'phase'
FROM workflow_test_result AS result;

INSERT INTO public.project_tasks (
  id, project_id, phase_key, title, status, due_date,
  sort_order, blocked_by_item_id
)
SELECT
  'ed410000-0000-4000-8000-000000000001',
  result.project_id,
  'construction_admin',
  'Issue site report',
  'blocked', current_date - 1, 0,
  'ed400000-0000-4000-8000-000000000001'
FROM workflow_test_result AS result;

INSERT INTO public.project_tasks (
  id, project_id, phase_key, title, status, due_date, sort_order
)
SELECT
  task.id,
  result.project_id,
  task.phase_key,
  task.title,
  'blocked',
  current_date - 1,
  task.sort_order
FROM workflow_test_result AS result
CROSS JOIN (
  VALUES
    (
      'ed410000-0000-4000-8000-000000000002'::uuid,
      'construction_admin'::text,
      'Ambiguous duplicate-key task'::text,
      1
    ),
    (
      'ed410000-0000-4000-8000-000000000003'::uuid,
      'specialist_review'::text,
      'Unique-key informational task'::text,
      2
    ),
    (
      'ed410000-0000-4000-8000-000000000004'::uuid,
      NULL::text,
      'Null-key informational task'::text,
      3
    )
) AS task(id, phase_key, title, sort_order);

SET LOCAL ROLE authenticated;
SELECT pg_temp.assume_workflow_actor(
  'ed000000-0000-4000-8000-000000000001'
);

DO $$
DECLARE
  v_primary record;
  v_custom record;
  v_duplicate record;
  v_null record;
BEGIN
  SELECT * INTO STRICT v_primary
  FROM public.get_project_workflow(
    (SELECT project_id FROM workflow_test_result)
  )
  WHERE phase_id = (SELECT primary_phase_id FROM workflow_test_result);

  SELECT * INTO STRICT v_custom
  FROM public.get_project_workflow(
    (SELECT project_id FROM workflow_test_result)
  )
  WHERE phase_id = (SELECT custom_phase_id FROM workflow_test_result);

  SELECT * INTO STRICT v_duplicate
  FROM public.get_project_workflow(
    (SELECT project_id FROM workflow_test_result)
  )
  WHERE phase_id = (SELECT duplicate_phase_id FROM workflow_test_result);

  SELECT * INTO STRICT v_null
  FROM public.get_project_workflow(
    (SELECT project_id FROM workflow_test_result)
  )
  WHERE phase_id = (SELECT null_phase_id FROM workflow_test_result);

  ASSERT v_primary.phase_status = 'in_progress',
    'overdue blocker metadata must not alter project phase state';
  ASSERT v_primary.gate_note = 'Release after weekly field review',
    'workflow read must return the configured phase gate note';
  ASSERT jsonb_array_length(v_primary.deliverables) = 1
     AND v_primary.deliverables->0->>'label' = 'Site visit log',
    'workflow read must normalize first-class proposal deliverables';
  ASSERT v_primary.template_provenance =
    '{"slug":"workflow-spine-contract","version":1}'::jsonb,
    'workflow read must return stable template provenance';
  ASSERT v_primary.advance_blocker_count = 1
     AND v_primary.blocks_advance,
    'only exact pending phase decisions may block phase advancement';
  ASSERT v_primary.current_blockers->>'count' = '2'
     AND jsonb_array_length(v_primary.current_blockers->'phase') = 1
     AND jsonb_array_length(v_primary.current_blockers->'tasks') = 1
     AND v_primary.current_blockers->'ffe' = '[]'::jsonb
     AND (v_primary.current_blockers->'phase'->0->>'isOverdue')::boolean,
    'workflow read must project current blockers with overdue metadata';

  ASSERT v_custom.advance_blocker_count = 0
     AND NOT v_custom.blocks_advance
     AND v_custom.template_provenance = '{}'::jsonb
     AND v_custom.deliverables = '[]'::jsonb
     AND v_custom.current_blockers->'phase' = '[]'::jsonb
     AND jsonb_array_length(v_custom.current_blockers->'tasks') = 1
     AND v_custom.current_blockers->'ffe' = '[]'::jsonb,
    'unique-key tasks are informational and must not block advancement';

  ASSERT v_duplicate.advance_blocker_count = 0
     AND NOT v_duplicate.blocks_advance
     AND v_duplicate.current_blockers->'phase' = '[]'::jsonb
     AND v_duplicate.current_blockers->'tasks' = '[]'::jsonb
     AND v_duplicate.current_blockers->'ffe' = '[]'::jsonb,
    'duplicate phase keys must not attribute an unlinked task';

  ASSERT v_null.advance_blocker_count = 0
     AND NOT v_null.blocks_advance
     AND v_null.current_blockers->'phase' = '[]'::jsonb
     AND v_null.current_blockers->'tasks' = '[]'::jsonb
     AND v_null.current_blockers->'ffe' = '[]'::jsonb,
    'NULL phase keys must not attribute an unlinked NULL-key task';

  ASSERT NOT EXISTS (
    SELECT 1
    FROM public.get_project_workflow(
      (SELECT project_id FROM workflow_test_result)
    ) AS workflow
    CROSS JOIN LATERAL jsonb_array_elements(
      workflow.current_blockers->'tasks'
    ) AS task(item)
    WHERE task.item->>'id' IN (
      'ed410000-0000-4000-8000-000000000002',
      'ed410000-0000-4000-8000-000000000004'
    )
  ), 'ambiguous and NULL-key tasks must remain unattributed';
END;
$$;

-- An authenticated outsider can resolve the RPC name but not read the project.
SELECT pg_temp.assume_workflow_actor(
  'ed000000-0000-4000-8000-000000000003'
);
DO $$
DECLARE
  v_state text;
BEGIN
  BEGIN
    PERFORM public.get_project_workflow(
      (SELECT project_id FROM workflow_test_result)
    );
  EXCEPTION WHEN insufficient_privilege THEN
    v_state := SQLSTATE;
  END;
  ASSERT v_state = '42501',
    'non-studio authenticated users must be rejected by the checked read RPC';
END;
$$;

RESET ROLE;

DO $$
BEGIN
  ASSERT has_function_privilege(
    'authenticated', 'public.get_project_workflow(uuid)', 'EXECUTE'
  ), 'authenticated designers must execute get_project_workflow';
  ASSERT NOT has_function_privilege(
    'anon', 'public.get_project_workflow(uuid)', 'EXECUTE'
  ), 'anon must not execute get_project_workflow';
  ASSERT NOT has_function_privilege(
    'service_role', 'public.get_project_workflow(uuid)', 'EXECUTE'
  ), 'service_role must not bypass designer authorization';
  ASSERT NOT has_function_privilege(
    'public', 'public.get_project_workflow(uuid)', 'EXECUTE'
  ), 'PUBLIC must not execute get_project_workflow';

  ASSERT EXISTS (
    SELECT 1
    FROM pg_proc AS procedure
    WHERE procedure.oid = 'public.get_project_workflow(uuid)'::regprocedure
      AND procedure.prosecdef
      AND procedure.proconfig @> ARRAY['search_path=public, pg_temp']
  ), 'workflow read RPC must be SECURITY DEFINER with a pinned search_path';

  ASSERT position(
    'FOR SHARE' IN pg_get_functiondef(
      'public.apply_phase_template(uuid,text,uuid)'::regprocedure
    )
  ) > 0,
    'authoritative template application must lock template content FOR SHARE';

  ASSERT NOT has_column_privilege(
    'authenticated', 'public.proposal_phases',
    'canonical_stage_key', 'UPDATE'
  ) AND NOT has_column_privilege(
    'service_role', 'public.proposal_phases',
    'source_template_version', 'INSERT, UPDATE'
  ) AND NOT has_column_privilege(
    'authenticated', 'public.project_phases',
    'workflow_track', 'INSERT, UPDATE'
  ) AND NOT has_column_privilege(
    'service_role', 'public.project_phases',
    'source_template_slug', 'INSERT, UPDATE'
  ), 'phase classification and provenance columns must not be directly writable';

  ASSERT has_column_privilege(
    'authenticated', 'public.proposal_phases', 'name', 'INSERT, UPDATE'
  ) AND has_column_privilege(
    'authenticated', 'public.project_phases', 'name', 'INSERT, UPDATE'
  ), 'pre-00461 authored phase columns must retain their installed privileges';

  ASSERT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'proposal_phases_workflow_classification_pair_check'
      AND convalidated
  ) AND EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'project_phases_workflow_capability_check'
      AND convalidated
  ), 'paired classification and capability-ledger constraints must be active';

  ASSERT EXISTS (
    SELECT 1
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND indexname = 'idx_project_phases_workflow_stage'
  ), 'project workflow stage index must exist';

  ASSERT (
    SELECT is_nullable = 'YES'
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'project_phases'
      AND column_name = 'canonical_stage_key'
  ), 'canonical stage classification must remain nullable';
END;
$$;

ROLLBACK;
