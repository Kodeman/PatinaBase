-- RC-2 consumer journey (SQ-2329): FICTIONAL local-only service-acceptance job.
-- Builds on f01-fixture.sql (F01 studio + designer, applied first below) and
-- follows supabase/tests/round8/service_acceptance_body.psql's origin path:
-- a design-services agreement drafted, sent, signed by the client and
-- countersigned by the designer mints the job's active scope edition, whose
-- signer policy names two REQUIRED signers (client + household partner).
--
-- Run with psql -f and the owned stack's host port, e.g.
--   psql -X -v ON_ERROR_STOP=1 -v expected_port=56322 \
--     postgresql://postgres:postgres@127.0.0.1:56322/postgres -f consumer-journey-fixture.sql
-- It refuses any host but 127.0.0.1 and any port but :expected_port.
--
-- Re-runnable: actors, household and seats are upserted; every application
-- composes a FRESH job (new proposal -> new project), so a re-run never edits
-- or deletes acceptance, response, outbound or completion rows (append-only
-- by design). Specs read the newest job of the RC2 client.
--
-- Stable IDs (password123, the existing local e2e password):
-- client   c2c20000-0000-4000-8000-000000000005 rc2-client@patina.test (profiles.email)
-- partner  c2c20000-0000-4000-8000-000000000006 rc2-partner@patina.test
-- admin    c2c20000-0000-4000-8000-000000000007 rc2-admin@test.invalid (F01 studio admin;
--          paper review needs an owner/admin who did not record the paper)
-- studio   f0180000-0000-4000-8000-000000000001 (F01)   designer f0180000-...-000000000002 (F01)
-- household c2c27000-0000-4000-8000-000000000001; cards c2c26000-...-01 (client) / -02 (partner)
--
-- Nothing here writes to_address, request lifecycle, responses or completions:
-- those are produced only by the journey (UI -> RPC -> V22 send).
\set ON_ERROR_STOP on
\if :{?expected_port}
\else
\echo REFUSED: pass -v expected_port=<owned local host port>
DO $$ BEGIN RAISE EXCEPTION 'consumer-journey fixture refused: expected_port not given'; END $$;
\quit
\endif
SELECT :'HOST' = '127.0.0.1' AND :'PORT' = :'expected_port' AS local_stack \gset
\if :local_stack
\else
\echo REFUSED: consumer-journey fixture needs 127.0.0.1 port :expected_port, got :HOST port :PORT
DO $$ BEGIN RAISE EXCEPTION 'consumer-journey fixture refused: not the expected local stack'; END $$;
\quit
\endif

\ir f01-fixture.sql

BEGIN;
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '60s';

-- ── Actors ─────────────────────────────────────────────────────────────────
INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change
)
SELECT '00000000-0000-0000-0000-000000000000', id, 'authenticated', 'authenticated',
       email, extensions.crypt('password123', extensions.gen_salt('bf')), now(),
       '{"provider":"email","providers":["email"]}'::jsonb,
       jsonb_build_object('full_name', name, 'role', role), now(), now(), '', '', '', ''
FROM (VALUES
  ('c2c20000-0000-4000-8000-000000000005'::uuid, 'rc2-client@patina.test', 'RC2 Fictional Client', 'homeowner'),
  ('c2c20000-0000-4000-8000-000000000006'::uuid, 'rc2-partner@patina.test', 'RC2 Fictional Partner', 'homeowner'),
  ('c2c20000-0000-4000-8000-000000000007'::uuid, 'rc2-admin@test.invalid', 'RC2 Fictional Studio Admin', 'designer')
) AS actors(id, email, name, role)
ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email, encrypted_password = EXCLUDED.encrypted_password,
  email_confirmed_at = EXCLUDED.email_confirmed_at;

INSERT INTO auth.identities (id, user_id, provider_id, identity_data, provider, created_at, updated_at)
SELECT id, id, id::text, jsonb_build_object('sub', id, 'email', email), 'email', now(), now()
FROM auth.users WHERE id::text LIKE 'c2c20000-%'
ON CONFLICT (provider_id, provider) DO UPDATE SET identity_data = EXCLUDED.identity_data;

-- 00890 reads the V22 address from profiles.email of projects.client_id.
INSERT INTO public.profiles (id, email, full_name, display_name, role, is_designer)
SELECT id, email, raw_user_meta_data->>'full_name', raw_user_meta_data->>'full_name',
       raw_user_meta_data->>'role', raw_user_meta_data->>'role' = 'designer'
FROM auth.users WHERE id::text LIKE 'c2c20000-%'
ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email, full_name = EXCLUDED.full_name,
  display_name = EXCLUDED.display_name, role = EXCLUDED.role, is_designer = EXCLUDED.is_designer;

INSERT INTO public.user_roles (user_id, role_id)
SELECT 'c2c20000-0000-4000-8000-000000000007', r.id FROM public.roles r WHERE r.name = 'independent_designer'
ON CONFLICT (user_id, role_id) DO NOTHING;
INSERT INTO public.organization_members (organization_id, user_id, role, status, joined_at)
VALUES ('f0180000-0000-4000-8000-000000000001', 'c2c20000-0000-4000-8000-000000000007', 'admin', 'active', now())
ON CONFLICT (user_id, organization_id) DO UPDATE SET role = 'admin', status = 'active';

-- ── Client relationship and household (signer policy binds to these) ──────
INSERT INTO public.studio_contacts (id, organization_id, entity_kind, contact_kind, full_name, profile_id) VALUES
  ('c2c26000-0000-4000-8000-000000000001', 'f0180000-0000-4000-8000-000000000001', 'person', 'client',
   'RC2 Fictional Client', 'c2c20000-0000-4000-8000-000000000005'),
  ('c2c26000-0000-4000-8000-000000000002', 'f0180000-0000-4000-8000-000000000001', 'person', 'client',
   'RC2 Fictional Partner', 'c2c20000-0000-4000-8000-000000000006')
ON CONFLICT (id) DO UPDATE SET profile_id = EXCLUDED.profile_id, full_name = EXCLUDED.full_name;
INSERT INTO public.client_households (id, organization_id, designer_id, display_name, member_person_ids)
VALUES ('c2c27000-0000-4000-8000-000000000001', 'f0180000-0000-4000-8000-000000000001',
  'f0180000-0000-4000-8000-000000000002', 'RC2 Fictional Household',
  ARRAY['c2c26000-0000-4000-8000-000000000001', 'c2c26000-0000-4000-8000-000000000002']::uuid[])
ON CONFLICT (id) DO UPDATE SET member_person_ids = EXCLUDED.member_person_ids;
INSERT INTO public.designer_clients (id, designer_id, client_id, client_name, client_email, status, source, household_id)
VALUES ('c2c22000-0000-4000-8000-000000000001', 'f0180000-0000-4000-8000-000000000002',
  'c2c20000-0000-4000-8000-000000000005', 'RC2 Fictional Client', 'rc2-client@patina.test', 'active', 'direct',
  'c2c27000-0000-4000-8000-000000000001')
ON CONFLICT (id) DO UPDATE SET status = 'active', household_id = EXCLUDED.household_id,
  client_email = EXCLUDED.client_email;

-- ════════════════════════════════════════════════════════════════════════════
-- LOCAL-ONLY ACTIVATION (1 of 2): scope editions capability.
-- Shipped false (00868). Agreement composition and the countersign that
-- mints the edition both read it, so it must be on before the job is built.
-- Never run against Strata; migrations stay inactive.
-- ════════════════════════════════════════════════════════════════════════════
DO $$ BEGIN
  IF current_database() <> 'postgres' OR inet_server_port() <> 5432 THEN
    RAISE EXCEPTION 'refusing activation outside the owned local database container';
  END IF;
END $$;
UPDATE public.server_capabilities SET enabled = true WHERE key = 'scope_editions';

-- ── A fresh job: draft -> send -> client signs -> designer countersigns ───
CREATE FUNCTION pg_temp.actor(u uuid) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('request.jwt.claim.sub', COALESCE(u::text, ''), true);
  PERFORM set_config('request.jwt.claims', CASE WHEN u IS NULL THEN '' ELSE
    jsonb_build_object('sub', u, 'role', 'authenticated')::text END, true);
END $$;
GRANT EXECUTE ON FUNCTION pg_temp.actor(uuid) TO authenticated;
CREATE TEMP TABLE rc2_origin (proposal_id uuid, phase_id uuid, result jsonb) ON COMMIT DROP;
GRANT ALL ON rc2_origin TO authenticated;

SELECT pg_temp.actor('f0180000-0000-4000-8000-000000000002');
DO $$
DECLARE p uuid := gen_random_uuid(); phase uuid;
BEGIN
  INSERT INTO public.proposals (id, designer_id, designer_client_id, client_id, title, total_amount, status, valid_until)
  VALUES (p, 'f0180000-0000-4000-8000-000000000002', 'c2c22000-0000-4000-8000-000000000001',
    'c2c20000-0000-4000-8000-000000000005', 'RC2 Fictional Consumer Journey', 0, 'draft', now() + interval '30 days');
  INSERT INTO public.proposal_phases (proposal_id, name, phase_key, duration_days, lane, fee_cents, sort_order)
  VALUES (p, 'Design', 'design-development', 5, 'main', 0, 0) RETURNING id INTO phase;
  PERFORM public.upsert_design_services_draft(p, jsonb_build_object('scope', 'Fictional interior design services',
    'deliverables', jsonb_build_array('Selections'), 'exclusions', '[]'::jsonb, 'billingCeilingCents', 100000,
    'retainerAmountCents', 0, 'retainerActivationPolicy', 'immediate', 'billingCadence', 'monthly',
    'currency', 'USD', 'terms', 'Signed actual hours', 'currentRateVersion', 1),
    jsonb_build_array(jsonb_build_object('version', 1, 'roleName', 'Designer', 'hourlyRateCents', 12000,
      'sortOrder', 0, 'effectiveAt', now() - interval '1 day')));
  PERFORM public.materialize_standard_parts(p);
  PERFORM public.upsert_agreement_parts(p,
    COALESCE((SELECT jsonb_agg(jsonb_build_object('kind', kind, 'variant', variant, 'partKey', part_key, 'title', title,
      'payload', payload, 'required', required, 'clientVisible', client_visible) ORDER BY position)
      FROM public.proposal_agreement_parts WHERE proposal_id = p), '[]'::jsonb)
    || jsonb_build_array(
      jsonb_build_object('kind', 'scope_package', 'partKey', 'scope.living', 'title', 'Living room', 'payload',
        jsonb_build_object('packageKey', 'pkg.living', 'label', 'Living room', 'inclusion', 'included',
          'responsibilities', jsonb_build_object('design', 'studio', 'purchasing', 'client', 'payer', 'client',
            'fabrication_contract', 'gc', 'installation', 'gc'),
          'serviceBindings', jsonb_build_object('design', jsonb_build_array(phase)))),
      jsonb_build_object('kind', 'acceptance_signer_policy', 'partKey', 'scope.signers', 'title', 'Signers',
        'payload', jsonb_build_object('policyRevision', 1, 'signers', jsonb_build_array(
          jsonb_build_object('slot', 'client', 'required', true, 'profileId', 'c2c20000-0000-4000-8000-000000000005'),
          jsonb_build_object('slot', 'partner', 'required', true, 'profileId', 'c2c20000-0000-4000-8000-000000000006'))))),
    'rc2 consumer journey fixture');
  INSERT INTO rc2_origin (proposal_id, phase_id) VALUES (p, phase);
END $$;

SET LOCAL ROLE authenticated;
DO $$
DECLARE p uuid := (SELECT proposal_id FROM rc2_origin); snapshot jsonb;
BEGIN
  snapshot := public.get_commercial_document_send_snapshot(p);
  PERFORM public.send_commercial_document(p, snapshot->>'documentFingerprint', NULL, now() + interval '30 days');
  PERFORM pg_temp.actor('c2c20000-0000-4000-8000-000000000005');
  PERFORM public.sign_design_services_agreement(p, 'RC2 Fictional Client');
  PERFORM pg_temp.actor('f0180000-0000-4000-8000-000000000002');
  UPDATE rc2_origin SET result = public.countersign_design_services_agreement(p, 'F01 Fictional Designer');
END $$;
RESET ROLE;

DO $$
DECLARE project uuid := (SELECT (result->>'projectId')::uuid FROM rc2_origin);
BEGIN
  IF project IS NULL OR (SELECT count(*) FROM public.project_scope_edition_signers s
      JOIN public.project_scope_editions e ON e.id = s.edition_id
      WHERE e.project_id = project AND e.status = 'active' AND s.required) <> 2 THEN
    RAISE EXCEPTION 'RC2 fixture: expected an active scope edition with two required signers on %', project;
  END IF;
  IF (SELECT client_id FROM public.projects WHERE id = project) IS DISTINCT FROM 'c2c20000-0000-4000-8000-000000000005'::uuid THEN
    RAISE EXCEPTION 'RC2 fixture: project % is not addressed to the RC2 client', project;
  END IF;
END $$;

-- Evidence manifest, a citable drawing issue and the delivered service:
-- inserted directly as service_acceptance_body.psql and service_completion_test.sql do.
SET LOCAL session_replication_role = replica;
INSERT INTO public.evidence_manifests (id, project_id, package_id, purpose, members, manifest_hash, request_hash,
  idempotency_key, created_by)
SELECT gen_random_uuid(), (result->>'projectId')::uuid, NULL, 'service_acceptance', '[]',
  encode(extensions.digest('rc2-manifest-' || (result->>'projectId'), 'sha256'), 'hex'),
  encode(extensions.digest('rc2-request-' || (result->>'projectId'), 'sha256'), 'hex'),
  'rc2-sa-1', 'f0180000-0000-4000-8000-000000000002'
FROM rc2_origin;
INSERT INTO public.plan_issues (project_id, issue_number, name, idempotency_key, request_hash, set_checksum,
  sheet_count, created_by)
SELECT (result->>'projectId')::uuid, 1, 'RC2 fictional drawing set', 'rc2-issue-1', repeat('e', 64), repeat('f', 64),
  1, 'f0180000-0000-4000-8000-000000000002'
FROM rc2_origin;
UPDATE public.project_phases SET status = 'completed', completed_at = COALESCE(completed_at, now())
WHERE project_id = (SELECT (result->>'projectId')::uuid FROM rc2_origin) AND status <> 'completed';
SET LOCAL session_replication_role = origin;

-- ════════════════════════════════════════════════════════════════════════════
-- LOCAL-ONLY ACTIVATION (2 of 2): EXECUTE grants the shipped migrations
-- withhold while the capability is inactive (rc2-consumer-walk.md, verbatim
-- set). Refuses anything but the owned local database container.
-- ════════════════════════════════════════════════════════════════════════════
DO $$ BEGIN
  IF current_database() <> 'postgres' OR inet_server_port() <> 5432 THEN
    RAISE EXCEPTION 'refusing grants outside the owned local database container on port 5432';
  END IF;
END $$;
GRANT EXECUTE ON FUNCTION public.create_service_acceptance_request(uuid,uuid,uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.respond_service_acceptance(uuid,text,jsonb,text,text,text,integer,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_service_acceptance_paper_intake(uuid,uuid,uuid,date,text,text,jsonb,text,integer,text,text,integer,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.review_service_acceptance_paper_intake(uuid,text,text,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.replace_service_acceptance_signer(uuid,uuid,uuid,uuid,integer,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.withdraw_service_acceptance_request(uuid,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.stamp_service_acceptance_paper_hash(uuid,text,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_studio_service(uuid,uuid,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_service_acceptance_condition(uuid,uuid,text,jsonb,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_studio_service_completion(uuid,text) TO authenticated;

SELECT json_build_object('rc2_job', (result->>'projectId'), 'proposal', proposal_id) AS rc2_fixture FROM rc2_origin;
COMMIT;
