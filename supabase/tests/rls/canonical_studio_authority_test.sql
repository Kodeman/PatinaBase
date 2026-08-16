-- Canonical studio authority closure regression (00488).
--
-- Covers paired multi-studio read/author authority, exact workspace RPCs,
-- immutable/nullable snapshots, foreign-owner and parent mismatch denial,
-- role/membership/studio revocation, custom-template workspace binding, and
-- the absence of an extra permissive legacy-helper leg.  The final dblink
-- block is a bounded two-session proof that authoring locks serialize role,
-- membership, and organization revocation, that the next request observes
-- each committed revocation, and that target-first direct snapshot DML fails
-- immediately rather than deadlocking a canonical root-first writer.
--
-- Run only against a disposable local database after 00488. Transaction-
-- wrapped fixtures are rolled back; the dblink block cleans its committed
-- probe fixture explicitly.

BEGIN;

SET LOCAL search_path = pg_catalog, public;
SET LOCAL standard_conforming_strings = on;
SET LOCAL quote_all_identifiers = off;
SET LOCAL statement_timeout = '30s';
CREATE EXTENSION IF NOT EXISTS dblink WITH SCHEMA extensions;

INSERT INTO auth.users (
  id, email, encrypted_password, email_confirmed_at, created_at, updated_at,
  instance_id, aud, role
)
SELECT id, email, '', now(), now(), now(),
       '00000000-0000-0000-0000-000000000000',
       'authenticated', 'authenticated'
FROM (VALUES
  ('a4880000-0000-4000-8000-000000000001'::uuid, 'csa-owner@test.invalid'),
  ('a4880000-0000-4000-8000-000000000002'::uuid, 'csa-member@test.invalid'),
  ('a4880000-0000-4000-8000-000000000003'::uuid, 'csa-foreign@test.invalid'),
  ('a4880000-0000-4000-8000-000000000004'::uuid, 'csa-guest@test.invalid'),
  ('a4880000-0000-4000-8000-000000000005'::uuid, 'csa-inactive@test.invalid'),
  ('a4880000-0000-4000-8000-000000000006'::uuid, 'csa-profile-only@test.invalid'),
  ('a4880000-0000-4000-8000-000000000007'::uuid, 'csa-client@test.invalid'),
  ('a4880000-0000-4000-8000-000000000008'::uuid, 'csa-legacy-client@test.invalid')
) AS fixture(id, email);

INSERT INTO public.profiles (
  id, email, full_name, role, is_designer, created_at, updated_at
)
SELECT id, email, full_name, role, is_designer, now(), now()
FROM (VALUES
  ('a4880000-0000-4000-8000-000000000001'::uuid,
   'csa-owner@test.invalid', 'CSA Owner', 'designer', false),
  ('a4880000-0000-4000-8000-000000000002'::uuid,
   'csa-member@test.invalid', 'CSA Member', 'designer', false),
  ('a4880000-0000-4000-8000-000000000003'::uuid,
   'csa-foreign@test.invalid', 'CSA Foreign', 'designer', false),
  ('a4880000-0000-4000-8000-000000000004'::uuid,
   'csa-guest@test.invalid', 'CSA Guest', 'designer', false),
  ('a4880000-0000-4000-8000-000000000005'::uuid,
   'csa-inactive@test.invalid', 'CSA Inactive', 'designer', false),
  ('a4880000-0000-4000-8000-000000000006'::uuid,
   'csa-profile-only@test.invalid', 'CSA Profile Flag Only', 'designer', false),
  ('a4880000-0000-4000-8000-000000000007'::uuid,
   'csa-client@test.invalid', 'CSA Client', 'homeowner', false),
  ('a4880000-0000-4000-8000-000000000008'::uuid,
   'csa-legacy-client@test.invalid', 'CSA Legacy Client', 'homeowner', false)
) AS fixture(id, email, full_name, role, is_designer)
ON CONFLICT (id) DO UPDATE SET
  role = EXCLUDED.role,
  is_designer = EXCLUDED.is_designer;

INSERT INTO public.organizations (id, type, name, slug, status)
VALUES
  ('a4881000-0000-4000-8000-000000000001', 'design_studio',
   'CSA Studio A', 'csa-studio-a', 'active'),
  ('a4881000-0000-4000-8000-000000000002', 'design_studio',
   'CSA Studio B', 'csa-studio-b', 'active'),
  ('a4881000-0000-4000-8000-000000000003', 'design_studio',
   'CSA Suspended Studio', 'csa-suspended-studio', 'suspended');

-- Canonical designer identity comes only from the live roles/user_roles
-- domain, never profiles.role or profiles.is_designer.
DELETE FROM public.user_roles
WHERE user_id IN (
  'a4880000-0000-4000-8000-000000000001',
  'a4880000-0000-4000-8000-000000000002',
  'a4880000-0000-4000-8000-000000000003',
  'a4880000-0000-4000-8000-000000000004',
  'a4880000-0000-4000-8000-000000000005',
  'a4880000-0000-4000-8000-000000000006'
);

INSERT INTO public.organization_members (
  id, user_id, organization_id, role, status, joined_at
)
VALUES
  ('a4882000-0000-4000-8000-000000000001',
   'a4880000-0000-4000-8000-000000000001',
   'a4881000-0000-4000-8000-000000000001', 'admin', 'active', now()),
  ('a4882000-0000-4000-8000-000000000002',
   'a4880000-0000-4000-8000-000000000001',
   'a4881000-0000-4000-8000-000000000002', 'owner', 'active', now()),
  ('a4882000-0000-4000-8000-000000000003',
   'a4880000-0000-4000-8000-000000000001',
   'a4881000-0000-4000-8000-000000000003', 'owner', 'active', now()),
  ('a4882000-0000-4000-8000-000000000004',
   'a4880000-0000-4000-8000-000000000002',
   'a4881000-0000-4000-8000-000000000001', 'member', 'active', now()),
  ('a4882000-0000-4000-8000-000000000005',
   'a4880000-0000-4000-8000-000000000003',
   'a4881000-0000-4000-8000-000000000002', 'owner', 'active', now()),
  ('a4882000-0000-4000-8000-000000000006',
   'a4880000-0000-4000-8000-000000000004',
   'a4881000-0000-4000-8000-000000000001', 'guest', 'active', now()),
  ('a4882000-0000-4000-8000-000000000007',
   'a4880000-0000-4000-8000-000000000005',
   'a4881000-0000-4000-8000-000000000001', 'member', 'suspended', now()),
  ('a4882000-0000-4000-8000-000000000008',
   'a4880000-0000-4000-8000-000000000006',
   'a4881000-0000-4000-8000-000000000001', 'member', 'active', now());

-- Membership precedes designer-role activation so the production provisioning
-- trigger cannot create an unrelated personal studio for these fixtures.
INSERT INTO public.user_roles (user_id, role_id)
SELECT actor.id, role_row.id
FROM (VALUES
  ('a4880000-0000-4000-8000-000000000001'::uuid),
  ('a4880000-0000-4000-8000-000000000002'::uuid),
  ('a4880000-0000-4000-8000-000000000003'::uuid),
  ('a4880000-0000-4000-8000-000000000004'::uuid),
  ('a4880000-0000-4000-8000-000000000005'::uuid)
) AS actor(id)
CROSS JOIN public.roles AS role_row
WHERE role_row.name = 'independent_designer';

UPDATE public.profiles
SET is_designer = true
WHERE id = 'a4880000-0000-4000-8000-000000000006';

INSERT INTO public.designer_clients (
  id, designer_id, client_id, client_name, status, source, studio_id
)
VALUES
  ('a4883000-0000-4000-8000-000000000001',
   'a4880000-0000-4000-8000-000000000001',
   'a4880000-0000-4000-8000-000000000007',
   'CSA Client', 'active', 'direct',
   'a4881000-0000-4000-8000-000000000001'),
  ('a4883000-0000-4000-8000-000000000002',
   'a4880000-0000-4000-8000-000000000001',
   'a4880000-0000-4000-8000-000000000007',
   'CSA Client', 'active', 'direct',
   'a4881000-0000-4000-8000-000000000002'),
  ('a4883000-0000-4000-8000-000000000003',
   'a4880000-0000-4000-8000-000000000001',
   'a4880000-0000-4000-8000-000000000008',
   'CSA Legacy Client', 'active', 'direct', NULL);

INSERT INTO public.projects (
  id, name, status, designer_id, client_id, created_by, studio_id
)
VALUES
  ('a4884000-0000-4000-8000-000000000001', 'CSA Project A', 'active',
   'a4880000-0000-4000-8000-000000000001',
   'a4880000-0000-4000-8000-000000000007',
   'a4880000-0000-4000-8000-000000000001',
   'a4881000-0000-4000-8000-000000000001'),
  ('a4884000-0000-4000-8000-000000000002', 'CSA Project B', 'active',
   'a4880000-0000-4000-8000-000000000001',
   'a4880000-0000-4000-8000-000000000007',
   'a4880000-0000-4000-8000-000000000001',
   'a4881000-0000-4000-8000-000000000002');

INSERT INTO public.proposals (
  id, project_id, designer_id, designer_client_id, client_id, studio_id,
  title, total_amount, status
)
VALUES
  ('a4885000-0000-4000-8000-000000000001',
   'a4884000-0000-4000-8000-000000000001',
   'a4880000-0000-4000-8000-000000000001',
   'a4883000-0000-4000-8000-000000000001',
   'a4880000-0000-4000-8000-000000000007',
   'a4881000-0000-4000-8000-000000000001',
   'CSA Proposal A', 0, 'draft'),
  ('a4885000-0000-4000-8000-000000000002',
   'a4884000-0000-4000-8000-000000000002',
   'a4880000-0000-4000-8000-000000000001',
   'a4883000-0000-4000-8000-000000000002',
   'a4880000-0000-4000-8000-000000000007',
   'a4881000-0000-4000-8000-000000000002',
   'CSA Proposal B', 0, 'draft');

INSERT INTO public.phase_templates (
  id, slug, label, is_system, designer_id, studio_id, phases
)
VALUES
  ('a4886000-0000-4000-8000-000000000001',
   'csa-studio-a-template', 'CSA Studio A Template', false,
   'a4880000-0000-4000-8000-000000000001',
   'a4881000-0000-4000-8000-000000000001',
   '[{
      "name":"CSA Concept",
      "phase_key":"csa_concept",
      "canonical_stage_key":"concept_schematic",
      "workflow_track":"core",
      "duration_days":1,
      "fee_cents":0,
      "revision_limit":0,
      "sort_order":0,
      "deliverables":[],
      "default_gates":[]
    }]'::jsonb),
  ('a4886000-0000-4000-8000-000000000002',
   'csa-legacy-null-template', 'CSA Legacy NULL Template', false,
   'a4880000-0000-4000-8000-000000000001', NULL,
   '[{
      "name":"CSA Legacy",
      "phase_key":"csa_legacy",
      "canonical_stage_key":"concept_schematic",
      "workflow_track":"core",
      "duration_days":1,
      "fee_cents":0,
      "revision_limit":0,
      "sort_order":0,
      "deliverables":[],
      "default_gates":[]
    }]'::jsonb);

CREATE OR REPLACE FUNCTION pg_temp.assume_csa_actor(p_actor uuid)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  EXECUTE 'RESET ROLE';
  PERFORM pg_catalog.set_config(
    'request.jwt.claims',
    pg_catalog.json_build_object(
      'sub', p_actor::text, 'role', 'authenticated'
    )::text,
    true
  );
  EXECUTE 'SET LOCAL ROLE authenticated';
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.reset_csa_actor()
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  EXECUTE 'RESET ROLE';
  PERFORM pg_catalog.set_config('request.jwt.claims', '', true);
END;
$$;

-- Exact read authority is active, non-guest membership in an active design
-- studio. Author authority additionally requires a live designer-domain role.
DO $paired_authority$
BEGIN
  PERFORM pg_temp.assume_csa_actor(
    'a4880000-0000-4000-8000-000000000001'
  );
  ASSERT public._can_read_studio_snapshot(
    'a4881000-0000-4000-8000-000000000001', NULL
  ) AND public._can_read_studio_snapshot(
    'a4881000-0000-4000-8000-000000000002', NULL
  ), 'two-workspace owner must read both exact studios';
  ASSERT public._can_author_studio_snapshot(
    'a4881000-0000-4000-8000-000000000001',
    'a4880000-0000-4000-8000-000000000001'
  ) AND public._can_author_studio_snapshot(
    'a4881000-0000-4000-8000-000000000002',
    'a4880000-0000-4000-8000-000000000001'
  ), 'two-workspace owner must author in both selected studios';

  PERFORM pg_temp.assume_csa_actor(
    'a4880000-0000-4000-8000-000000000002'
  );
  ASSERT public._can_read_studio_snapshot(
    'a4881000-0000-4000-8000-000000000001', NULL
  ), 'active member must read its exact studio';
  ASSERT NOT public._can_read_studio_snapshot(
    'a4881000-0000-4000-8000-000000000002', NULL
  ), 'unrelated studio must not be readable';
  ASSERT public._can_author_studio_snapshot(
    'a4881000-0000-4000-8000-000000000001', NULL
  ), 'live designer member must author in its exact studio';
  ASSERT NOT public._can_author_studio_snapshot(
    'a4881000-0000-4000-8000-000000000002', NULL
  ), 'forged unrelated-studio authoring must fail';

  PERFORM pg_temp.assume_csa_actor(
    'a4880000-0000-4000-8000-000000000004'
  );
  ASSERT NOT public._can_read_studio_snapshot(
    'a4881000-0000-4000-8000-000000000001', NULL
  ) AND NOT public._can_author_studio_snapshot(
    'a4881000-0000-4000-8000-000000000001', NULL
  ), 'guest membership must confer no studio authority';

  PERFORM pg_temp.assume_csa_actor(
    'a4880000-0000-4000-8000-000000000005'
  );
  ASSERT NOT public._can_read_studio_snapshot(
    'a4881000-0000-4000-8000-000000000001', NULL
  ) AND NOT public._can_author_studio_snapshot(
    'a4881000-0000-4000-8000-000000000001', NULL
  ), 'inactive membership must confer no studio authority';

  PERFORM pg_temp.assume_csa_actor(
    'a4880000-0000-4000-8000-000000000006'
  );
  ASSERT public._can_read_studio_snapshot(
    'a4881000-0000-4000-8000-000000000001', NULL
  ), 'active non-guest membership is sufficient for studio read';
  ASSERT NOT public._can_author_studio_snapshot(
    'a4881000-0000-4000-8000-000000000001', NULL
  ), 'profiles.is_designer without a live domain role must not author';

  PERFORM pg_temp.assume_csa_actor(
    'a4880000-0000-4000-8000-000000000001'
  );
  ASSERT NOT public._can_read_studio_snapshot(
    'a4881000-0000-4000-8000-000000000003', NULL
  ) AND NOT public._can_author_studio_snapshot(
    'a4881000-0000-4000-8000-000000000003', NULL
  ), 'suspended organization must confer no read or author authority';
  PERFORM pg_temp.reset_csa_actor();
END;
$paired_authority$;

-- A historical NULL snapshot remains exact-owner-only even when the owner's
-- memberships move. Current membership never becomes creation-time evidence.
DO $legacy_null_owner_only$
DECLARE
  affected_count integer;
BEGIN
  PERFORM pg_temp.assume_csa_actor(
    'a4880000-0000-4000-8000-000000000001'
  );
  ASSERT public._can_read_studio_snapshot(
    NULL, 'a4880000-0000-4000-8000-000000000001'
  ), 'legacy NULL owner must retain exact-owner read';
  ASSERT public._can_author_studio_snapshot(
    NULL, 'a4880000-0000-4000-8000-000000000001'
  ), 'legacy NULL owner with a live designer role must retain exact-owner authoring';
  ASSERT EXISTS (
    SELECT 1 FROM public.phase_templates
    WHERE id = 'a4886000-0000-4000-8000-000000000002'
  ), 'legacy NULL template must be visible to its exact owner';
  UPDATE public.phase_templates
  SET label = 'CSA Legacy NULL Template Owner Probe'
  WHERE id = 'a4886000-0000-4000-8000-000000000002';
  GET DIAGNOSTICS affected_count = ROW_COUNT;
  ASSERT affected_count = 1,
    'legacy NULL owner must author its exact row before membership moves';

  PERFORM pg_temp.assume_csa_actor(
    'a4880000-0000-4000-8000-000000000002'
  );
  ASSERT NOT public._can_read_studio_snapshot(
    NULL, 'a4880000-0000-4000-8000-000000000001'
  ), 'same-studio member must not inherit legacy NULL authority';
  ASSERT NOT public._can_author_studio_snapshot(
    NULL, 'a4880000-0000-4000-8000-000000000001'
  ), 'same-studio member must not inherit legacy NULL author authority';
  ASSERT NOT EXISTS (
    SELECT 1 FROM public.phase_templates
    WHERE id = 'a4886000-0000-4000-8000-000000000002'
  ), 'legacy NULL template must stay hidden from a current comember';

  PERFORM pg_temp.reset_csa_actor();
  UPDATE public.organization_members
  SET status = 'removed'
  WHERE id = 'a4882000-0000-4000-8000-000000000001';

  PERFORM pg_temp.assume_csa_actor(
    'a4880000-0000-4000-8000-000000000001'
  );
  ASSERT public._can_read_studio_snapshot(
    NULL, 'a4880000-0000-4000-8000-000000000001'
  ) AND EXISTS (
    SELECT 1 FROM public.phase_templates
    WHERE id = 'a4886000-0000-4000-8000-000000000002'
  ), 'legacy NULL row must remain owner-only after membership moves';
  ASSERT public._can_author_studio_snapshot(
    NULL, 'a4880000-0000-4000-8000-000000000001'
  ), 'legacy NULL owner authoring must not be rebound to current membership';
  UPDATE public.phase_templates
  SET label = 'CSA Legacy NULL Template After Membership Move'
  WHERE id = 'a4886000-0000-4000-8000-000000000002';
  GET DIAGNOSTICS affected_count = ROW_COUNT;
  ASSERT affected_count = 1,
    'legacy NULL owner must author its exact row after membership moves';

  PERFORM pg_temp.assume_csa_actor(
    'a4880000-0000-4000-8000-000000000002'
  );
  ASSERT NOT public._can_read_studio_snapshot(
    NULL, 'a4880000-0000-4000-8000-000000000001'
  ), 'membership movement must not turn a legacy NULL into studio authority';
  ASSERT NOT public._can_author_studio_snapshot(
    NULL, 'a4880000-0000-4000-8000-000000000001'
  ), 'membership movement must not turn a legacy NULL into studio author authority';

  PERFORM pg_temp.reset_csa_actor();
  UPDATE public.organization_members
  SET status = 'active'
  WHERE id = 'a4882000-0000-4000-8000-000000000001';
END;
$legacy_null_owner_only$;

-- Browser and service writers must supply a canonical studio, and neither a
-- same-studio actor nor service-without-uid may stamp an ineligible owner.
DO $snapshot_writer_guards$
DECLARE
  denied boolean;
BEGIN
  PERFORM pg_temp.assume_csa_actor(
    'a4880000-0000-4000-8000-000000000001'
  );
  denied := false;
  BEGIN
    INSERT INTO public.phase_templates (
      id, slug, label, is_system, designer_id, studio_id, phases
    ) VALUES (
      'a4886000-0000-4000-8000-000000000010',
      'csa-missing-studio', 'CSA Missing Studio', false,
      'a4880000-0000-4000-8000-000000000001', NULL,
      '[{"name":"Missing","phase_key":"missing"}]'::jsonb
    );
  EXCEPTION WHEN check_violation THEN
    denied := SQLERRM = 'studio_snapshot_required';
  END;
  ASSERT denied, 'browser custom-template INSERT without studio must fail';

  INSERT INTO public.phase_templates (
    id, slug, label, is_system, designer_id, studio_id, phases
  ) VALUES (
    'a4886000-0000-4000-8000-000000000011',
    'csa-browser-exact', 'CSA Browser Exact', false,
    'a4880000-0000-4000-8000-000000000001',
    'a4881000-0000-4000-8000-000000000001',
    '[{
       "name":"Exact","phase_key":"exact",
       "canonical_stage_key":"concept_schematic",
       "workflow_track":"core"
     }]'::jsonb
  );
  ASSERT EXISTS (
    SELECT 1 FROM public.phase_templates
    WHERE id = 'a4886000-0000-4000-8000-000000000011'
      AND studio_id = 'a4881000-0000-4000-8000-000000000001'
  ), 'browser exact-studio writer must persist the selected snapshot';

  -- Same-studio actor is valid, stamped foreign owner is not.
  PERFORM pg_temp.assume_csa_actor(
    'a4880000-0000-4000-8000-000000000002'
  );
  denied := false;
  BEGIN
    INSERT INTO public.proposals (
      id, designer_id, client_id, studio_id, title, total_amount, status
    ) VALUES (
      'a4885000-0000-4000-8000-000000000010',
      'a4880000-0000-4000-8000-000000000003',
      'a4880000-0000-4000-8000-000000000007',
      'a4881000-0000-4000-8000-000000000001',
      'CSA Foreign Owner Forgery', 0, 'draft'
    );
  EXCEPTION WHEN insufficient_privilege THEN
    denied := SQLERRM = 'studio_snapshot_not_authorized';
  END;
  ASSERT denied, 'same-studio actor must not stamp an ineligible foreign owner';

  PERFORM pg_temp.reset_csa_actor();
  EXECUTE 'SET LOCAL ROLE service_role';
  PERFORM pg_catalog.set_config('request.jwt.claims', '', true);
  denied := false;
  BEGIN
    INSERT INTO public.phase_templates (
      id, slug, label, is_system, designer_id, studio_id, phases
    ) VALUES (
      'a4886000-0000-4000-8000-000000000012',
      'csa-service-foreign-owner', 'CSA Service Foreign Owner', false,
      'a4880000-0000-4000-8000-000000000003',
      'a4881000-0000-4000-8000-000000000001',
      '[{"name":"Foreign","phase_key":"foreign"}]'::jsonb
    );
  EXCEPTION WHEN insufficient_privilege THEN
    denied := SQLERRM = 'studio_snapshot_not_authorized';
  END;
  ASSERT denied, 'service/no-uid must not make an invalid owner/studio tuple valid';

  INSERT INTO public.phase_templates (
    id, slug, label, is_system, designer_id, studio_id, phases
  ) VALUES (
    'a4886000-0000-4000-8000-000000000013',
    'csa-service-exact-owner', 'CSA Service Exact Owner', false,
    'a4880000-0000-4000-8000-000000000001',
    'a4881000-0000-4000-8000-000000000001',
    '[{
       "name":"Service Exact","phase_key":"service_exact",
       "canonical_stage_key":"concept_schematic",
       "workflow_track":"core"
     }]'::jsonb
  );
  ASSERT EXISTS (
    SELECT 1 FROM public.phase_templates
    WHERE id = 'a4886000-0000-4000-8000-000000000013'
      AND studio_id = 'a4881000-0000-4000-8000-000000000001'
  ), 'service writer may persist only a target owner eligible in that studio';
  PERFORM pg_temp.reset_csa_actor();
END;
$snapshot_writer_guards$;

-- Exact immutable parents win over caller-supplied snapshots. A conflicting
-- non-NULL value is rejected; it is never silently rewritten.
DO $snapshot_parent_mismatch$
DECLARE
  denied boolean;
BEGIN
  PERFORM pg_temp.reset_csa_actor();
  EXECUTE 'SET LOCAL ROLE service_role';
  PERFORM pg_catalog.set_config('request.jwt.claims', '', true);

  denied := false;
  BEGIN
    INSERT INTO public.proposals (
      id, project_id, designer_id, designer_client_id, client_id, studio_id,
      title, total_amount, status
    ) VALUES (
      'a4885000-0000-4000-8000-000000000020',
      'a4884000-0000-4000-8000-000000000001',
      'a4880000-0000-4000-8000-000000000001',
      'a4883000-0000-4000-8000-000000000001',
      'a4880000-0000-4000-8000-000000000007',
      'a4881000-0000-4000-8000-000000000002',
      'CSA Project Snapshot Mismatch', 0, 'draft'
    );
  EXCEPTION WHEN check_violation THEN
    denied := SQLERRM = 'studio_snapshot_parent_mismatch';
  END;
  ASSERT denied, 'proposal/project snapshot mismatch must fail closed';

  denied := false;
  BEGIN
    INSERT INTO public.client_decisions (
      id, designer_client_id, designer_id, project_id, studio_id,
      title, status
    ) VALUES (
      'a4887000-0000-4000-8000-000000000001',
      'a4883000-0000-4000-8000-000000000002',
      'a4880000-0000-4000-8000-000000000001',
      'a4884000-0000-4000-8000-000000000001',
      'a4881000-0000-4000-8000-000000000001',
      'CSA Relationship Snapshot Mismatch', 'draft'
    );
  EXCEPTION WHEN check_violation THEN
    denied := SQLERRM = 'studio_snapshot_parent_mismatch';
  END;
  ASSERT denied, 'decision project/relationship mismatch must fail closed';

  denied := false;
  BEGIN
    UPDATE public.proposals
    SET studio_id = 'a4881000-0000-4000-8000-000000000002'
    WHERE id = 'a4885000-0000-4000-8000-000000000001';
  EXCEPTION WHEN check_violation THEN
    denied := SQLERRM = 'studio_snapshot_immutable';
  END;
  ASSERT denied, 'persisted canonical snapshot must be immutable';
  PERFORM pg_temp.reset_csa_actor();
END;
$snapshot_parent_mismatch$;

-- One client has one exact relationship in each selected studio. The RPC
-- must use the caller-selected relationship, and an idempotent retry cannot
-- be rebound to another workspace.
DO $open_project_workspace$
DECLARE
  project_a uuid;
  project_b uuid;
  denied boolean;
BEGIN
  PERFORM pg_temp.assume_csa_actor(
    'a4880000-0000-4000-8000-000000000001'
  );
  project_a := public.open_project_direct(
    p_title => 'CSA Direct A',
    p_studio_id => 'a4881000-0000-4000-8000-000000000001',
    p_designer_client_id => 'a4883000-0000-4000-8000-000000000001',
    p_id => 'a4884000-0000-4000-8000-000000000010'
  );
  project_b := public.open_project_direct(
    p_title => 'CSA Direct B',
    p_studio_id => 'a4881000-0000-4000-8000-000000000002',
    p_designer_client_id => 'a4883000-0000-4000-8000-000000000002',
    p_id => 'a4884000-0000-4000-8000-000000000011'
  );
  ASSERT project_a = 'a4884000-0000-4000-8000-000000000010'
     AND project_b = 'a4884000-0000-4000-8000-000000000011',
    'paired workspace calls must create their explicit project ids';
  ASSERT (
    SELECT studio_id = 'a4881000-0000-4000-8000-000000000001'
       AND client_id = 'a4880000-0000-4000-8000-000000000007'
    FROM public.projects WHERE id = project_a
  ) AND (
    SELECT studio_id = 'a4881000-0000-4000-8000-000000000002'
       AND client_id = 'a4880000-0000-4000-8000-000000000007'
    FROM public.projects WHERE id = project_b
  ), 'direct projects must bind the selected workspace relationship';

  denied := false;
  BEGIN
    PERFORM public.open_project_direct(
      p_title => 'CSA Forged Pair',
      p_studio_id => 'a4881000-0000-4000-8000-000000000001',
      p_designer_client_id => 'a4883000-0000-4000-8000-000000000002',
      p_id => 'a4884000-0000-4000-8000-000000000012'
    );
  EXCEPTION WHEN insufficient_privilege THEN
    denied := SQLERRM = 'open_project_not_authorized';
  END;
  ASSERT denied, 'relationship from another selected studio must be denied';

  denied := false;
  BEGIN
    PERFORM public.open_project_direct(
      p_title => 'CSA Cross-Studio Retry',
      p_studio_id => 'a4881000-0000-4000-8000-000000000002',
      p_designer_client_id => 'a4883000-0000-4000-8000-000000000002',
      p_id => project_a
    );
  EXCEPTION WHEN insufficient_privilege THEN
    denied := SQLERRM = 'open_project_not_authorized';
  END;
  ASSERT denied, 'idempotent retry must not rebind an existing project studio';

  ASSERT public.open_project_direct(
    p_title => 'CSA Direct A',
    p_studio_id => 'a4881000-0000-4000-8000-000000000001',
    p_designer_client_id => 'a4883000-0000-4000-8000-000000000001',
    p_id => project_a
  ) = project_a, 'same-workspace idempotent retry must return the bound project';
  ASSERT (
    SELECT count(*) = 1
    FROM public.projects
    WHERE id = project_a
      AND studio_id = 'a4881000-0000-4000-8000-000000000001'
  ), 'same-workspace retry must neither duplicate nor rebind the project';
  PERFORM pg_temp.reset_csa_actor();
END;
$open_project_workspace$;

-- A custom template can materialize only into a proposal with the identical
-- studio snapshot. The same two-studio actor cannot cross that boundary.
DO $phase_template_workspace$
DECLARE
  denied boolean;
BEGIN
  PERFORM pg_temp.assume_csa_actor(
    'a4880000-0000-4000-8000-000000000001'
  );
  PERFORM public.apply_phase_template(
    'a4885000-0000-4000-8000-000000000001',
    'csa-studio-a-template',
    'a4886100-0000-4000-8000-000000000001'
  );
  ASSERT EXISTS (
    SELECT 1 FROM public.proposal_phases
    WHERE proposal_id = 'a4885000-0000-4000-8000-000000000001'
  ), 'custom template must apply within its exact proposal studio';

  denied := false;
  BEGIN
    PERFORM public.apply_phase_template(
      'a4885000-0000-4000-8000-000000000002',
      'csa-studio-a-template',
      'a4886100-0000-4000-8000-000000000002'
    );
  EXCEPTION WHEN insufficient_privilege THEN
    denied := SQLERRM LIKE 'template not found or access denied:%';
  END;
  ASSERT denied, 'custom template must not cross proposal studio snapshots';
  ASSERT NOT EXISTS (
    SELECT 1 FROM public.proposal_phases
    WHERE proposal_id = 'a4885000-0000-4000-8000-000000000002'
  ), 'denied cross-studio template act must have no phase side effects';
  PERFORM pg_temp.reset_csa_actor();
END;
$phase_template_workspace$;

-- Revocation is visible on the next request. Read authority intentionally
-- survives a role-only revocation; author authority does not.
DO $next_request_revocation$
DECLARE
  affected_count integer;
BEGIN
  PERFORM pg_temp.reset_csa_actor();
  DELETE FROM public.user_roles AS user_role
  USING public.roles AS role_row
  WHERE user_role.role_id = role_row.id
    AND user_role.user_id = 'a4880000-0000-4000-8000-000000000001'
    AND role_row.domain = 'designer';

  PERFORM pg_temp.assume_csa_actor(
    'a4880000-0000-4000-8000-000000000001'
  );
  ASSERT public._can_read_studio_snapshot(
    'a4881000-0000-4000-8000-000000000001', NULL
  ), 'role removal alone must not remove exact active-member read';
  ASSERT NOT public._can_author_studio_snapshot(
    'a4881000-0000-4000-8000-000000000001', NULL
  ), 'designer-domain role removal must deny the next author request';

  UPDATE public.proposals
  SET title = title
  WHERE id = 'a4885000-0000-4000-8000-000000000001';
  GET DIAGNOSTICS affected_count = ROW_COUNT;
  ASSERT affected_count = 0,
    'role-removed owner must not pass a permissive proposal mutation leg';

  UPDATE public.phase_templates
  SET label = label
  WHERE id = 'a4886000-0000-4000-8000-000000000001';
  GET DIAGNOSTICS affected_count = ROW_COUNT;
  ASSERT affected_count = 0,
    'role-removed owner must be denied by representative snapshot author DML';

  UPDATE public.projects
  SET name = name
  WHERE id = 'a4884000-0000-4000-8000-000000000001';
  GET DIAGNOSTICS affected_count = ROW_COUNT;
  ASSERT affected_count = 0,
    'role-removed owner must not update an untriggered project field';

  DELETE FROM public.phase_templates
  WHERE id = 'a4886000-0000-4000-8000-000000000001';
  GET DIAGNOSTICS affected_count = ROW_COUNT;
  ASSERT affected_count = 0,
    'role-removed owner must not pass the template DELETE owner leg';

  DELETE FROM public.projects
  WHERE id = 'a4884000-0000-4000-8000-000000000001';
  GET DIAGNOSTICS affected_count = ROW_COUNT;
  ASSERT affected_count = 0,
    'role-removed owner must not pass the project DELETE owner leg';

  PERFORM pg_temp.reset_csa_actor();
  INSERT INTO public.user_roles (user_id, role_id)
  SELECT 'a4880000-0000-4000-8000-000000000001', role_row.id
  FROM public.roles AS role_row
  WHERE role_row.name = 'independent_designer';
END;
$next_request_revocation$;

-- No second permissive owner/comember leg may bypass the canonical policy.
DO $policy_anti_extra$
DECLARE
  visible_count integer;
BEGIN
  ASSERT NOT EXISTS (
    WITH expected(table_name) AS (VALUES
      ('client_decisions'),('designer_clients'),('leads'),
      ('phase_templates'),('projects'),('proposals'),('saved_vendors')
    )
    SELECT 1
    FROM expected
    LEFT JOIN pg_catalog.pg_class AS relation
      ON relation.oid = pg_catalog.to_regclass(
        'public.' || expected.table_name
      )
    WHERE relation.oid IS NULL
       OR NOT relation.relrowsecurity
       OR relation.relforcerowsecurity
  ), 'snapshot/root policy relations must keep exact RLS enforcement';

  ASSERT NOT EXISTS (
    WITH expected(table_name, policy_name) AS (VALUES
      ('client_decisions','Clients can view their decisions'),
      ('client_decisions','client_decisions_client_compat_update'),
      ('client_decisions','client_decisions_studio_insert'),
      ('client_decisions','client_decisions_studio_legacy_draft_delete'),
      ('client_decisions','client_decisions_studio_legacy_update'),
      ('client_decisions','client_decisions_studio_select'),
      ('client_decisions','coordination_party_decisions_select'),
      ('client_decisions','csa_author_delete_client_decisions'),
      ('client_decisions','csa_author_update_client_decisions'),
      ('designer_clients','Designers can manage their clients'),
      ('designer_clients','csa_author_delete_designer_clients'),
      ('designer_clients','csa_author_update_designer_clients'),
      ('designer_clients','csa_delete_guard_c1bea74e3d9cb3ac'),
      ('designer_clients','designer_clients_studio_rw'),
      ('leads','csa_author_delete_leads'),
      ('leads','csa_author_update_leads'),
      ('leads','Designers can create leads'),
      ('leads','Designers can update their leads'),
      ('leads','Designers can view their leads'),
      ('leads','Homeowners can create leads'),
      ('leads','Homeowners can view their leads'),
      ('leads','leads_studio_select'),
      ('leads','leads_studio_update'),
      ('projects','Lead designer can create projects'),
      ('projects','Lead designer can delete projects'),
      ('projects','Lead designer can update projects'),
      ('projects','Project participants can view projects'),
      ('projects','Service role full access to projects'),
      ('projects','csa_author_delete_projects'),
      ('projects','csa_author_update_projects'),
      ('projects','projects_studio_select'),
      ('projects','projects_studio_update'),
      ('proposals','csa_author_delete_proposals'),
      ('proposals','csa_author_update_proposals'),
      ('proposals','proposals_design_studio_delete'),
      ('proposals','proposals_design_studio_insert'),
      ('proposals','proposals_design_studio_select'),
      ('proposals','proposals_design_studio_update'),
      ('proposals','proposals_legacy_ios_client_select'),
      ('saved_vendors','csa_author_delete_saved_vendors'),
      ('saved_vendors','csa_author_update_saved_vendors'),
      ('saved_vendors','Designers can manage their saved vendors'),
      ('saved_vendors','saved_vendors_studio_comember_select'),
      ('phase_templates','csa_author_delete_phase_templates'),
      ('phase_templates','csa_author_update_phase_templates'),
      ('phase_templates','phase_templates_designer_delete'),
      ('phase_templates','phase_templates_designer_update'),
      ('phase_templates','phase_templates_designer_writes'),
      ('phase_templates','phase_templates_select_all')
    ), actual AS (
      SELECT relation.relname AS table_name, policy.polname AS policy_name
      FROM pg_catalog.pg_policy AS policy
      JOIN pg_catalog.pg_class AS relation ON relation.oid = policy.polrelid
      JOIN pg_catalog.pg_namespace AS namespace
        ON namespace.oid = relation.relnamespace
      WHERE namespace.nspname = 'public'
        AND relation.relname IN (
          'client_decisions','designer_clients','leads','projects',
          'proposals','saved_vendors','phase_templates'
        )
    )
    (SELECT * FROM expected EXCEPT SELECT * FROM actual)
    UNION ALL
    (SELECT * FROM actual EXCEPT SELECT * FROM expected)
  ), 'snapshot-table permissive policy name universe has an extra or omission';

  PERFORM pg_temp.assume_csa_actor(
    'a4880000-0000-4000-8000-000000000002'
  );
  SELECT count(*) INTO visible_count
  FROM public.proposals
  WHERE id IN (
    'a4885000-0000-4000-8000-000000000001',
    'a4885000-0000-4000-8000-000000000002'
  );
  ASSERT visible_count = 1,
    'permissive policy composition exposed an unrelated-studio proposal';
  PERFORM pg_temp.reset_csa_actor();

  ASSERT NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_policy AS policy
    JOIN pg_catalog.pg_class AS relation ON relation.oid = policy.polrelid
    JOIN pg_catalog.pg_namespace AS namespace
      ON namespace.oid = relation.relnamespace
    WHERE namespace.nspname <> 'storage'
      AND (
        COALESCE(pg_catalog.pg_get_expr(policy.polqual, policy.polrelid), '')
        || ' '
        || COALESCE(
             pg_catalog.pg_get_expr(policy.polwithcheck, policy.polrelid), ''
           )
      ) ~ '(_can_manage_invoice_owner|_can_author_proposal|is_active_studio_member|is_design_studio_comember|is_studio_comember)[[:space:]]*\('
  ), 'ordinary policy retained a forbidden permissive helper leg';

  ASSERT NOT EXISTS (
    WITH expected(
      table_name, policy_name, command, permissive, roles, fingerprint
    ) AS (VALUES
      ('client_decisions','client_decisions_studio_insert','INSERT',
       true,ARRAY['authenticated']::text[],
       'aa7e2ca777a9dc3acf085f1f758102d8233163c0cda8bd2f510cdb31df4dc6fe'),
      ('client_decisions','client_decisions_studio_legacy_draft_delete','DELETE',
       true,ARRAY['authenticated']::text[],
       'b0229bdd8a8f8b4255bdccd95434443686ae41db8c5400bea0d6f815859d98fc'),
      ('client_decisions','client_decisions_studio_legacy_update','UPDATE',
       true,ARRAY['authenticated']::text[],
       '05c635a9ceca1b8cac91a6b3de701a705ac382d8c12eb8655706fcca66977759'),
      ('client_decisions','client_decisions_studio_select','SELECT',
       true,ARRAY['authenticated']::text[],
       'a5829bd9d4385b8ed3f1a596e89c98ccd3ccef4e6e51e6eb3260aba3abbf3ab3'),
      ('designer_clients','designer_clients_studio_rw','ALL',
       true,ARRAY['authenticated']::text[],
       'fcc7dd08d60a2bae543fc51972cab3d95506e10c12736e17c9669d1ac84b933e'),
      ('leads','leads_studio_select','SELECT',
       true,ARRAY['authenticated']::text[],
       'a5829bd9d4385b8ed3f1a596e89c98ccd3ccef4e6e51e6eb3260aba3abbf3ab3'),
      ('leads','leads_studio_update','UPDATE',
       true,ARRAY['authenticated']::text[],
       '88c209fbc6d7c931bc54fc82ab6d148321eceb7046122cd4014da2ec5d8b8033'),
      ('projects','projects_studio_select','SELECT',
       true,ARRAY['authenticated']::text[],
       'a5829bd9d4385b8ed3f1a596e89c98ccd3ccef4e6e51e6eb3260aba3abbf3ab3'),
      ('projects','projects_studio_update','UPDATE',
       true,ARRAY['authenticated']::text[],
       '88c209fbc6d7c931bc54fc82ab6d148321eceb7046122cd4014da2ec5d8b8033'),
      ('proposals','proposals_design_studio_delete','DELETE',
       true,ARRAY['authenticated']::text[],
       'a40fc410942810c6c0b841dae476cb378648e5b3e90902a99ca8bc22500524e7'),
      ('proposals','proposals_design_studio_insert','INSERT',
       true,ARRAY['authenticated']::text[],
       'aa7e2ca777a9dc3acf085f1f758102d8233163c0cda8bd2f510cdb31df4dc6fe'),
      ('proposals','proposals_design_studio_select','SELECT',
       true,ARRAY['authenticated']::text[],
       'a5829bd9d4385b8ed3f1a596e89c98ccd3ccef4e6e51e6eb3260aba3abbf3ab3'),
      ('proposals','proposals_design_studio_update','UPDATE',
       true,ARRAY['authenticated']::text[],
       '88c209fbc6d7c931bc54fc82ab6d148321eceb7046122cd4014da2ec5d8b8033'),
      ('saved_vendors','saved_vendors_studio_comember_select','SELECT',
       true,ARRAY['authenticated']::text[],
       'a5829bd9d4385b8ed3f1a596e89c98ccd3ccef4e6e51e6eb3260aba3abbf3ab3'),
      ('client_decisions','Clients can view their decisions','SELECT',
       true,ARRAY['authenticated']::text[],
       '9c2a352384cea47c4825c9087dfd6dfdaf3aa7d97d32d8cdd15f0a8495c4b084'),
      ('client_decisions','client_decisions_client_compat_update','UPDATE',
       true,ARRAY['authenticated']::text[],
       'e54e83054a6973c69fdb5ae49e1e4946fd9ffedcabac4de5803233c60ed6392d'),
      ('client_decisions','coordination_party_decisions_select','SELECT',
       true,ARRAY['authenticated']::text[],
       '1d23f2937cf617dfab5ac69b01c91af20d20e7b809bf31390663ce7cc6328d65'),
      ('designer_clients','Designers can manage their clients','ALL',
       true,ARRAY['public']::text[],
       '37de7c6ab86bb7603d3ce6add55205d5f2929cb0f8f4b3d519702d3a5ccec53d'),
      ('leads','Designers can create leads','INSERT',
       true,ARRAY['public']::text[],
       '88059531e26a07f1667e16d7ecd165ccda3cf6350874fb3173cab5b33a7b2d08'),
      ('leads','Designers can update their leads','UPDATE',
       true,ARRAY['public']::text[],
       '37de7c6ab86bb7603d3ce6add55205d5f2929cb0f8f4b3d519702d3a5ccec53d'),
      ('leads','Designers can view their leads','SELECT',
       true,ARRAY['public']::text[],
       '37de7c6ab86bb7603d3ce6add55205d5f2929cb0f8f4b3d519702d3a5ccec53d'),
      ('leads','Homeowners can create leads','INSERT',
       true,ARRAY['public']::text[],
       'f9a91c42c9fcd0133f6d51dfda16ece313442974124fcb96afbe0dc3a9335c82'),
      ('leads','Homeowners can view their leads','SELECT',
       true,ARRAY['public']::text[],
       'e4d795739f880c7744feb72e59deaf2e56b6a94090bd0743ad2fc317feadc9b4'),
      ('phase_templates','phase_templates_designer_delete','DELETE',
       true,ARRAY['public']::text[],
       'c6d9941b732f597d4f323ec312bca55597cf67351f981a48b1ab353140d26c57'),
      ('phase_templates','phase_templates_designer_update','UPDATE',
       true,ARRAY['public']::text[],
       'c8ac4784e452739bfd6affacfa42266d62695371b20e253f05ce6eafcbd724ea'),
      ('phase_templates','phase_templates_designer_writes','INSERT',
       true,ARRAY['public']::text[],
       'c2500902949f2da4863025516e0884c00035099ef69859916359659f7a16d395'),
      ('phase_templates','phase_templates_select_all','SELECT',
       true,ARRAY['public']::text[],
       '4aee75891425d899cbd202e177902ca9590b60c8fbd3b8df4118bb43afd499f7'),
      ('projects','Lead designer can create projects','INSERT',
       true,ARRAY['public']::text[],
       '4913f5e18ca782bf6efa566ab2c548b94fb05dcbc6ef8de090653e9216d939c9'),
      ('projects','Lead designer can delete projects','DELETE',
       true,ARRAY['public']::text[],
       '29fa295fad6557990709dc2e5f329ce293b4ceb5259ad6771fa8d471d3b7c34c'),
      ('projects','Lead designer can update projects','UPDATE',
       true,ARRAY['public']::text[],
       'b6fe3324f537b0765708d1293911651afe773dba52253df1158cbaa8e0f8e5dc'),
      ('projects','Project participants can view projects','SELECT',
       true,ARRAY['public']::text[],
       '53f7cfdfd1f5262f05da705be196790070827adf2fc00a63c23906af9c21bcfc'),
      ('projects','Service role full access to projects','ALL',
       true,ARRAY['public']::text[],
       'f86f73f218dc579ceb87d07964404c47053ecfb854d0dcbf438f1c1c98d22d6f'),
      ('proposals','proposals_legacy_ios_client_select','SELECT',
       true,ARRAY['authenticated']::text[],
       'e5e8ce9838993175d233a652ef41fa0858b0bf764664359a57ee362288d82908'),
      ('saved_vendors','Designers can manage their saved vendors','ALL',
       true,ARRAY['authenticated']::text[],
       'b6fe3324f537b0765708d1293911651afe773dba52253df1158cbaa8e0f8e5dc'),
      ('designer_clients','csa_delete_guard_c1bea74e3d9cb3ac','DELETE',
       false,ARRAY['authenticated']::text[],
       'a40fc410942810c6c0b841dae476cb378648e5b3e90902a99ca8bc22500524e7'),
      ('proposals','csa_author_update_proposals','UPDATE',
       false,ARRAY['public']::text[],
       '88c209fbc6d7c931bc54fc82ab6d148321eceb7046122cd4014da2ec5d8b8033'),
      ('proposals','csa_author_delete_proposals','DELETE',
       false,ARRAY['public']::text[],
       'a40fc410942810c6c0b841dae476cb378648e5b3e90902a99ca8bc22500524e7'),
      ('designer_clients','csa_author_update_designer_clients','UPDATE',
       false,ARRAY['public']::text[],
       '88c209fbc6d7c931bc54fc82ab6d148321eceb7046122cd4014da2ec5d8b8033'),
      ('designer_clients','csa_author_delete_designer_clients','DELETE',
       false,ARRAY['public']::text[],
       'a40fc410942810c6c0b841dae476cb378648e5b3e90902a99ca8bc22500524e7'),
      ('leads','csa_author_update_leads','UPDATE',
       false,ARRAY['public']::text[],
       '88c209fbc6d7c931bc54fc82ab6d148321eceb7046122cd4014da2ec5d8b8033'),
      ('leads','csa_author_delete_leads','DELETE',
       false,ARRAY['public']::text[],
       'a40fc410942810c6c0b841dae476cb378648e5b3e90902a99ca8bc22500524e7'),
      ('client_decisions','csa_author_update_client_decisions','UPDATE',
       false,ARRAY['public']::text[],
       '88c209fbc6d7c931bc54fc82ab6d148321eceb7046122cd4014da2ec5d8b8033'),
      ('client_decisions','csa_author_delete_client_decisions','DELETE',
       false,ARRAY['public']::text[],
       'a40fc410942810c6c0b841dae476cb378648e5b3e90902a99ca8bc22500524e7'),
      ('saved_vendors','csa_author_update_saved_vendors','UPDATE',
       false,ARRAY['public']::text[],
       '88c209fbc6d7c931bc54fc82ab6d148321eceb7046122cd4014da2ec5d8b8033'),
      ('saved_vendors','csa_author_delete_saved_vendors','DELETE',
       false,ARRAY['public']::text[],
       'a40fc410942810c6c0b841dae476cb378648e5b3e90902a99ca8bc22500524e7'),
      ('phase_templates','csa_author_update_phase_templates','UPDATE',
       false,ARRAY['public']::text[],
       '88c209fbc6d7c931bc54fc82ab6d148321eceb7046122cd4014da2ec5d8b8033'),
      ('phase_templates','csa_author_delete_phase_templates','DELETE',
       false,ARRAY['public']::text[],
       'a40fc410942810c6c0b841dae476cb378648e5b3e90902a99ca8bc22500524e7'),
      ('projects','csa_author_update_projects','UPDATE',
       false,ARRAY['public']::text[],
       '88c209fbc6d7c931bc54fc82ab6d148321eceb7046122cd4014da2ec5d8b8033'),
      ('projects','csa_author_delete_projects','DELETE',
       false,ARRAY['public']::text[],
       'a40fc410942810c6c0b841dae476cb378648e5b3e90902a99ca8bc22500524e7')
    ), actual AS (
      SELECT relation.relname AS table_name,
             policy.polname AS policy_name,
             CASE policy.polcmd
               WHEN '*' THEN 'ALL' WHEN 'r' THEN 'SELECT'
               WHEN 'a' THEN 'INSERT' WHEN 'w' THEN 'UPDATE'
               WHEN 'd' THEN 'DELETE'
             END AS command,
             policy.polpermissive AS permissive,
             ARRAY(
               SELECT CASE WHEN role_oid.oid = 0 THEN 'public'::text
                           ELSE role_row.rolname::text END
               FROM pg_catalog.unnest(policy.polroles) AS role_oid(oid)
               LEFT JOIN pg_catalog.pg_roles AS role_row
                 ON role_row.oid = role_oid.oid
               ORDER BY CASE WHEN role_oid.oid = 0 THEN 'public'::text
                             ELSE role_row.rolname::text END
             ) AS roles,
             pg_catalog.encode(extensions.digest(
               pg_catalog.convert_to('patina-csa-policy-v1', 'UTF8')
               || pg_catalog.decode('00', 'hex')
               || CASE WHEN policy.polqual IS NULL
                  THEN pg_catalog.decode('00', 'hex')
                  ELSE pg_catalog.decode('01', 'hex')
                    || pg_catalog.int8send(pg_catalog.octet_length(
                         pg_catalog.pg_get_expr(
                           policy.polqual, policy.polrelid
                         )
                       )::bigint)
                    || pg_catalog.convert_to(
                         pg_catalog.pg_get_expr(
                           policy.polqual, policy.polrelid
                         ), 'UTF8'
                       )
                  END
               || CASE WHEN policy.polwithcheck IS NULL
                  THEN pg_catalog.decode('00', 'hex')
                  ELSE pg_catalog.decode('01', 'hex')
                    || pg_catalog.int8send(pg_catalog.octet_length(
                         pg_catalog.pg_get_expr(
                           policy.polwithcheck, policy.polrelid
                         )
                       )::bigint)
                    || pg_catalog.convert_to(
                         pg_catalog.pg_get_expr(
                           policy.polwithcheck, policy.polrelid
                         ), 'UTF8'
                       )
                  END,
               'sha256'
             ), 'hex') AS fingerprint
      FROM pg_catalog.pg_policy AS policy
      JOIN pg_catalog.pg_class AS relation ON relation.oid = policy.polrelid
      JOIN pg_catalog.pg_namespace AS namespace
        ON namespace.oid = relation.relnamespace
      WHERE namespace.nspname = 'public'
        AND relation.relname IN (
          'client_decisions','designer_clients','leads','projects',
          'proposals','saved_vendors','phase_templates'
        )
        AND EXISTS (
          SELECT 1 FROM expected
          WHERE expected.table_name = relation.relname
            AND expected.policy_name = policy.polname
        )
    )
    (SELECT * FROM expected EXCEPT SELECT * FROM actual)
    UNION ALL
    (SELECT * FROM actual EXCEPT SELECT * FROM expected)
  ), 'snapshot-table permissive policy universe has an extra or omission';

  ASSERT pg_catalog.to_regprocedure(
    'public.open_project_direct(text,uuid,integer,integer,date,uuid)'
  ) IS NULL, 'heuristic open-project signature must be retired';
  ASSERT pg_catalog.to_regprocedure(
    'public.open_project_direct(text,uuid,uuid,integer,integer,date,uuid)'
  ) IS NOT NULL, 'explicit open-project workspace signature is missing';
  ASSERT NOT pg_catalog.has_function_privilege(
    'service_role',
    'public.open_project_direct(text,uuid,uuid,integer,integer,date,uuid)',
    'EXECUTE'
  ), 'service_role must not receive unreviewed open-project EXECUTE';
  ASSERT pg_catalog.pg_get_function_arguments(
    'public.can_dispatch_proposal_send(uuid)'::pg_catalog.regprocedure
  ) = 'p_proposal_id uuid',
    'PostgREST dispatch argument must name the exact proposal resource';
END;
$policy_anti_extra$;

-- Bounded two-session revocation proof. The remote fixture is committed so
-- both dblink sessions can see it; every mutation is cleaned explicitly.
CREATE OR REPLACE FUNCTION pg_temp.assert_csa_revocation_wait(
  p_revocation_sql text,
  p_expected_status text,
  p_label text
)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  writer_pid integer;
  revoker_pid integer;
  attempt integer;
  waiting boolean := false;
  result_status text;
  allowed boolean;
  sent integer;
BEGIN
  PERFORM extensions.dblink_exec('csa_writer', 'BEGIN');
  SELECT remote.status = 'UPDATE 1' INTO allowed
  FROM extensions.dblink(
    'csa_writer',
    $remote$
      UPDATE public.phase_templates
      SET label = label
      WHERE id = 'a4896000-0000-4000-8000-000000000001'
      RETURNING 'UPDATE 1'::text
    $remote$
  ) AS remote(status text);
  ASSERT allowed, p_label || ': representative author DML precondition is false';

  SELECT remote.pid INTO writer_pid
  FROM extensions.dblink(
    'csa_writer', 'SELECT pg_backend_pid()'
  ) AS remote(pid integer);
  SELECT remote.pid INTO revoker_pid
  FROM extensions.dblink(
    'csa_revoker', 'SELECT pg_backend_pid()'
  ) AS remote(pid integer);
  sent := extensions.dblink_send_query('csa_revoker', p_revocation_sql);
  ASSERT sent = 1, p_label || ': revocation async query was not accepted';

  FOR attempt IN 1..100 LOOP
    SELECT writer_pid = ANY(pg_catalog.pg_blocking_pids(revoker_pid))
    INTO waiting;
    EXIT WHEN COALESCE(waiting, false);
    PERFORM pg_catalog.pg_sleep(0.02);
  END LOOP;
  ASSERT COALESCE(waiting, false),
    p_label || ': revocation was not blocked by the exact author transaction';

  PERFORM extensions.dblink_exec('csa_writer', 'COMMIT');
  SELECT result.status INTO result_status
  FROM extensions.dblink_get_result('csa_revoker', false)
       AS result(status text);
  ASSERT result_status = p_expected_status,
    pg_catalog.format(
      '%s: revocation status %s, expected %s',
      p_label, result_status, p_expected_status
    );
  -- libpq stays busy until the final empty PGresult is consumed.
  PERFORM result.status
  FROM extensions.dblink_get_result('csa_revoker', false)
       AS result(status text);

  SELECT remote.allowed INTO allowed
  FROM extensions.dblink(
    'csa_writer',
    $remote$
      SELECT public._can_author_studio_snapshot(
        'a4891000-0000-4000-8000-000000000001',
        'a4890000-0000-4000-8000-000000000001'
      )
    $remote$
  ) AS remote(allowed boolean);
  ASSERT NOT allowed,
    p_label || ': next request did not observe committed revocation';
END;
$$;

DO $bounded_revocation_races$
DECLARE
  connection_info text := pg_catalog.format(
    'hostaddr=%s port=%s dbname=postgres user=postgres password=postgres',
    pg_catalog.inet_server_addr(), pg_catalog.inet_server_port()
  );
  bounded_outcome text;
  locked_proposal_id uuid;
BEGIN
  PERFORM extensions.dblink_connect('csa_setup', connection_info);
  PERFORM extensions.dblink_connect('csa_writer', connection_info);
  PERFORM extensions.dblink_connect('csa_revoker', connection_info);

  -- Idempotent cleanup makes a rerun safe after an interrupted prior probe.
  PERFORM extensions.dblink_exec(
    'csa_setup',
    $cleanup$DELETE FROM public.proposals
      WHERE id = 'a4895000-0000-4000-8000-000000000001'$cleanup$
  );
  PERFORM extensions.dblink_exec(
    'csa_setup',
    $cleanup$DELETE FROM public.projects
      WHERE id = 'a4894000-0000-4000-8000-000000000001'$cleanup$
  );
  PERFORM extensions.dblink_exec(
    'csa_setup',
    $cleanup$DELETE FROM public.designer_clients
      WHERE id = 'a4893000-0000-4000-8000-000000000001'$cleanup$
  );
  PERFORM extensions.dblink_exec(
    'csa_setup',
    $cleanup$DELETE FROM public.phase_templates
      WHERE id = 'a4896000-0000-4000-8000-000000000001'$cleanup$
  );
  PERFORM extensions.dblink_exec(
    'csa_setup',
    $cleanup$DELETE FROM public.organization_members
      WHERE id = 'a4892000-0000-4000-8000-000000000001'$cleanup$
  );
  PERFORM extensions.dblink_exec(
    'csa_setup',
    $cleanup$DELETE FROM public.user_roles
      WHERE user_id = 'a4890000-0000-4000-8000-000000000001'$cleanup$
  );
  PERFORM extensions.dblink_exec(
    'csa_setup',
    $cleanup$DELETE FROM public.organizations
      WHERE id = 'a4891000-0000-4000-8000-000000000001'$cleanup$
  );
  PERFORM extensions.dblink_exec(
    'csa_setup',
    $cleanup$DELETE FROM public.profiles
      WHERE id = 'a4890000-0000-4000-8000-000000000001'$cleanup$
  );
  PERFORM extensions.dblink_exec(
    'csa_setup',
    $cleanup$DELETE FROM auth.users
      WHERE id = 'a4890000-0000-4000-8000-000000000001'$cleanup$
  );

  PERFORM extensions.dblink_exec(
    'csa_setup',
    $setup$
      INSERT INTO auth.users (
        id, email, encrypted_password, email_confirmed_at, created_at,
        updated_at, instance_id, aud, role
      ) VALUES (
        'a4890000-0000-4000-8000-000000000001',
        'csa-race-owner@test.invalid', '', now(), now(), now(),
        '00000000-0000-0000-0000-000000000000',
        'authenticated', 'authenticated'
      )
    $setup$
  );
  PERFORM extensions.dblink_exec(
    'csa_setup',
    $setup$
      INSERT INTO public.profiles (
        id, email, full_name, role, is_designer, created_at, updated_at
      ) VALUES (
        'a4890000-0000-4000-8000-000000000001',
        'csa-race-owner@test.invalid', 'CSA Race Owner',
        'designer', false, now(), now()
      )
      ON CONFLICT (id) DO UPDATE SET
        role = EXCLUDED.role,
        is_designer = EXCLUDED.is_designer
    $setup$
  );
  PERFORM extensions.dblink_exec(
    'csa_setup',
    $setup$
      INSERT INTO public.organizations (id, type, name, slug, status)
      VALUES (
        'a4891000-0000-4000-8000-000000000001', 'design_studio',
        'CSA Race Studio', 'csa-race-studio', 'active'
      )
    $setup$
  );
  PERFORM extensions.dblink_exec(
    'csa_setup',
    $setup$
      DELETE FROM public.user_roles
      WHERE user_id = 'a4890000-0000-4000-8000-000000000001'
    $setup$
  );
  PERFORM extensions.dblink_exec(
    'csa_setup',
    $setup$
      INSERT INTO public.organization_members (
        id, user_id, organization_id, role, status, joined_at
      ) VALUES (
        'a4892000-0000-4000-8000-000000000001',
        'a4890000-0000-4000-8000-000000000001',
        'a4891000-0000-4000-8000-000000000001',
        'member', 'active', now()
      )
    $setup$
  );
  PERFORM extensions.dblink_exec(
    'csa_setup',
    $setup$
      INSERT INTO public.user_roles (user_id, role_id)
      SELECT 'a4890000-0000-4000-8000-000000000001', role_row.id
      FROM public.roles AS role_row
      WHERE role_row.name = 'independent_designer'
    $setup$
  );
  PERFORM extensions.dblink_exec(
    'csa_setup',
    $setup$
      INSERT INTO public.phase_templates (
        id, slug, label, is_system, designer_id, studio_id, phases
      ) VALUES (
        'a4896000-0000-4000-8000-000000000001',
        'csa-race-template', 'CSA Race Template', false,
        'a4890000-0000-4000-8000-000000000001',
        'a4891000-0000-4000-8000-000000000001', '[]'::jsonb
      )
    $setup$
  );
  PERFORM extensions.dblink_exec(
    'csa_setup',
    $setup$
      INSERT INTO public.designer_clients (
        id, designer_id, client_id, client_name, status, source, studio_id
      ) VALUES (
        'a4893000-0000-4000-8000-000000000001',
        'a4890000-0000-4000-8000-000000000001',
        'a4890000-0000-4000-8000-000000000001',
        'CSA Race Client', 'active', 'direct',
        'a4891000-0000-4000-8000-000000000001'
      )
    $setup$
  );
  PERFORM extensions.dblink_exec(
    'csa_setup',
    $setup$
      INSERT INTO public.projects (
        id, name, status, designer_id, client_id, created_by, studio_id
      ) VALUES (
        'a4894000-0000-4000-8000-000000000001',
        'CSA Race Project', 'active',
        'a4890000-0000-4000-8000-000000000001',
        'a4890000-0000-4000-8000-000000000001',
        'a4890000-0000-4000-8000-000000000001',
        'a4891000-0000-4000-8000-000000000001'
      )
    $setup$
  );
  PERFORM extensions.dblink_exec(
    'csa_setup',
    $setup$
      INSERT INTO public.proposals (
        id, project_id, designer_id, designer_client_id, client_id,
        studio_id, title, total_amount, status
      ) VALUES (
        'a4895000-0000-4000-8000-000000000001',
        'a4894000-0000-4000-8000-000000000001',
        'a4890000-0000-4000-8000-000000000001',
        'a4893000-0000-4000-8000-000000000001',
        'a4890000-0000-4000-8000-000000000001',
        'a4891000-0000-4000-8000-000000000001',
        'CSA Race Proposal', 0, 'draft'
      )
    $setup$
  );
  PERFORM extensions.dblink_exec(
    'csa_revoker',
    $create$
      CREATE OR REPLACE FUNCTION pg_temp.try_csa_snapshot_update()
      RETURNS text
      LANGUAGE plpgsql
      SECURITY DEFINER
      SET search_path = pg_catalog, public, pg_temp
      AS $function$
      BEGIN
        UPDATE public.proposals
        SET title = title
        WHERE id = 'a4895000-0000-4000-8000-000000000001';
        RETURN 'updated';
      EXCEPTION WHEN lock_not_available THEN
        RETURN SQLSTATE;
      END;
      $function$
    $create$
  );

  PERFORM extensions.dblink_exec(
    'csa_writer', $timeout$SET statement_timeout = '10s'$timeout$
  );
  PERFORM extensions.dblink_exec(
    'csa_writer', $timeout$SET lock_timeout = '5s'$timeout$
  );
  PERFORM extensions.dblink_exec('csa_writer', 'SET ROLE authenticated');
  PERFORM extensions.dblink_exec(
    'csa_writer',
    $claims$SET request.jwt.claims =
      '{"sub":"a4890000-0000-4000-8000-000000000001","role":"authenticated"}'$claims$
  );
  PERFORM extensions.dblink_exec(
    'csa_revoker', $timeout$SET statement_timeout = '10s'$timeout$
  );
  PERFORM extensions.dblink_exec(
    'csa_revoker', $timeout$SET lock_timeout = '5s'$timeout$
  );

  PERFORM pg_temp.assert_csa_revocation_wait(
    $revoke$DELETE FROM public.user_roles AS user_role
      USING public.roles AS role_row
      WHERE user_role.role_id = role_row.id
        AND user_role.user_id = 'a4890000-0000-4000-8000-000000000001'
        AND role_row.domain = 'designer'$revoke$,
    'DELETE 1',
    'designer-role revocation'
  );
  PERFORM extensions.dblink_exec(
    'csa_setup',
    $restore$INSERT INTO public.user_roles (user_id, role_id)
      SELECT 'a4890000-0000-4000-8000-000000000001', role_row.id
      FROM public.roles AS role_row
      WHERE role_row.name = 'independent_designer'$restore$
  );

  PERFORM pg_temp.assert_csa_revocation_wait(
    $revoke$UPDATE public.organization_members
      SET status = 'suspended'
      WHERE id = 'a4892000-0000-4000-8000-000000000001'$revoke$,
    'UPDATE 1',
    'membership revocation'
  );
  PERFORM extensions.dblink_exec(
    'csa_setup',
    $restore$UPDATE public.organization_members
      SET status = 'active'
      WHERE id = 'a4892000-0000-4000-8000-000000000001'$restore$
  );

  PERFORM pg_temp.assert_csa_revocation_wait(
    $revoke$UPDATE public.organizations
      SET status = 'suspended'
      WHERE id = 'a4891000-0000-4000-8000-000000000001'$revoke$,
    'UPDATE 1',
    'organization revocation'
  );
  PERFORM extensions.dblink_exec(
    'csa_setup',
    $restore$UPDATE public.organizations
      SET status = 'active'
      WHERE id = 'a4891000-0000-4000-8000-000000000001'$restore$
  );

  -- Direct proposal UPDATE owns the proposal before its row guard reads the
  -- project. A canonical workflow owns the project first. SHARE NOWAIT on the
  -- guard's parent read makes the direct writer fail bounded and release the
  -- proposal instead of forming proposal -> project / project -> proposal.
  PERFORM extensions.dblink_exec('csa_writer', 'BEGIN');
  PERFORM remote.id
  FROM extensions.dblink(
    'csa_writer',
    $lock$SELECT id FROM public.projects
      WHERE id = 'a4894000-0000-4000-8000-000000000001'
      FOR UPDATE$lock$
  ) AS remote(id uuid);
  PERFORM extensions.dblink_exec('csa_revoker', 'SET ROLE authenticated');
  PERFORM extensions.dblink_exec(
    'csa_revoker',
    $claims$SET request.jwt.claims =
      '{"sub":"a4890000-0000-4000-8000-000000000001","role":"authenticated"}'$claims$
  );
  SELECT remote.outcome INTO bounded_outcome
  FROM extensions.dblink(
    'csa_revoker', 'SELECT pg_temp.try_csa_snapshot_update()'
  ) AS remote(outcome text);
  ASSERT bounded_outcome = '55P03',
    'target-first snapshot DML must fail bounded on a locked parent';
  SELECT remote.id INTO locked_proposal_id
  FROM extensions.dblink(
    'csa_writer',
    $lock$SELECT id FROM public.proposals
      WHERE id = 'a4895000-0000-4000-8000-000000000001'
      FOR UPDATE NOWAIT$lock$
  ) AS remote(id uuid);
  ASSERT locked_proposal_id = 'a4895000-0000-4000-8000-000000000001',
    'bounded direct DML failure must release its snapshot target lock';
  PERFORM extensions.dblink_exec('csa_writer', 'COMMIT');
  PERFORM extensions.dblink_exec('csa_revoker', 'RESET ROLE');
  PERFORM extensions.dblink_exec(
    'csa_revoker', $claims$RESET request.jwt.claims$claims$
  );

  PERFORM extensions.dblink_exec('csa_writer', 'RESET ROLE');
  PERFORM extensions.dblink_exec(
    'csa_setup',
    $cleanup$DELETE FROM public.proposals
      WHERE id = 'a4895000-0000-4000-8000-000000000001'$cleanup$
  );
  PERFORM extensions.dblink_exec(
    'csa_setup',
    $cleanup$DELETE FROM public.projects
      WHERE id = 'a4894000-0000-4000-8000-000000000001'$cleanup$
  );
  PERFORM extensions.dblink_exec(
    'csa_setup',
    $cleanup$DELETE FROM public.designer_clients
      WHERE id = 'a4893000-0000-4000-8000-000000000001'$cleanup$
  );
  PERFORM extensions.dblink_exec(
    'csa_setup',
    $cleanup$DELETE FROM public.phase_templates
      WHERE id = 'a4896000-0000-4000-8000-000000000001'$cleanup$
  );
  PERFORM extensions.dblink_exec(
    'csa_setup',
    $cleanup$DELETE FROM public.organization_members
      WHERE id = 'a4892000-0000-4000-8000-000000000001'$cleanup$
  );
  PERFORM extensions.dblink_exec(
    'csa_setup',
    $cleanup$DELETE FROM public.user_roles
      WHERE user_id = 'a4890000-0000-4000-8000-000000000001'$cleanup$
  );
  PERFORM extensions.dblink_exec(
    'csa_setup',
    $cleanup$DELETE FROM public.organizations
      WHERE id = 'a4891000-0000-4000-8000-000000000001'$cleanup$
  );
  PERFORM extensions.dblink_exec(
    'csa_setup',
    $cleanup$DELETE FROM public.profiles
      WHERE id = 'a4890000-0000-4000-8000-000000000001'$cleanup$
  );
  PERFORM extensions.dblink_exec(
    'csa_setup',
    $cleanup$DELETE FROM auth.users
      WHERE id = 'a4890000-0000-4000-8000-000000000001'$cleanup$
  );
  PERFORM extensions.dblink_disconnect('csa_revoker');
  PERFORM extensions.dblink_disconnect('csa_writer');
  PERFORM extensions.dblink_disconnect('csa_setup');
END;
$bounded_revocation_races$;

ROLLBACK;
