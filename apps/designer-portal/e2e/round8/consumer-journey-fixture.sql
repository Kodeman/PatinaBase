-- RC-2 consumer journey (SQ-2329, repaired SQ-2337): FICTIONAL local-only
-- service-acceptance job. Builds on f01-fixture.sql (F01 studio + designer,
-- applied below, after the target guard) and follows
-- supabase/tests/round8/service_acceptance_body.psql's origin path: a
-- design-services agreement drafted, sent, signed by the client and
-- countersigned by the designer mints the job's active scope edition, whose
-- signer policy names two REQUIRED signers (client + household partner).
--
-- Applied only by run-consumer-journey.mjs (through consumer-journey.journey.ts)
-- against the owned stack it started. The owned identity is read from Docker
-- (the container the Supabase CLI labelled with the owned project), never
-- derived from the URL under test:
--   psql -X -v ON_ERROR_STOP=1 -v owned_port=<db host port> \
--     -v owned_server_addr=<db container address> -v owned_system_id=<pg_control_system id> \
--     -v evidence_path_1=<object> -v evidence_sha_1=<sha256> \
--     -v evidence_path_2=<object> -v evidence_sha_2=<sha256> <owned db url> -f consumer-journey-fixture.sql
--
-- TARGET GUARD (SQ-2334 F1): before ANY write, including the F01 include, it
-- refuses a non-loopback host, the shared stack's ports (54321/54322), a port
-- other than owned_port, and a server whose address or cluster system
-- identifier differs from the owned container's. The shared container also
-- listens on 5432 inside Docker, so the container port proves nothing.
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
-- Evidence (SQ-2334 F3): two issued drawing sets on the job, each behind real
-- project-documents objects the runner uploaded through the Storage API
-- (evidence_path_1/2, checked here to exist):
--   issue 1 "RC2 fictional drawing set"          A-101 (file 1)      -> manifest 'rc2-sa-1'
--   issue 2 "RC2 fictional drawing set, revised"  A-101 + A-201 (2)  -> manifest 'rc2-sa-2'
-- Both manifests are minted natively (create_evidence_manifest as the
-- designer). Request 1 cites manifest 1; the resend cites manifest 2.
--
-- Nothing here writes to_address, request lifecycle, responses or completions:
-- those are produced only by the journey (UI -> RPC -> V22 send).
\set ON_ERROR_STOP on
\if :{?owned_port}
\else
\echo REFUSED: pass -v owned_port, owned_server_addr and owned_system_id from the owned container
DO $$ BEGIN RAISE EXCEPTION 'consumer-journey fixture refused: owned_port not given'; END $$;
\quit
\endif
\if :{?owned_server_addr}
\else
DO $$ BEGIN RAISE EXCEPTION 'consumer-journey fixture refused: owned_server_addr not given'; END $$;
\quit
\endif
\if :{?owned_system_id}
\else
DO $$ BEGIN RAISE EXCEPTION 'consumer-journey fixture refused: owned_system_id not given'; END $$;
\quit
\endif
-- Read-only probes only until the guard passes.
SELECT CASE
  WHEN :'HOST' NOT IN ('127.0.0.1', 'localhost', '::1') THEN 'host ' || :'HOST' || ' is not loopback'
  WHEN :'PORT' IN ('54321', '54322') THEN 'port ' || :'PORT' || ' is the shared Supabase stack'
  WHEN :'owned_port' IN ('54321', '54322') THEN 'owned_port ' || :'owned_port' || ' is the shared Supabase stack'
  WHEN :'PORT' <> :'owned_port' THEN 'port ' || :'PORT' || ' is not the owned port ' || :'owned_port'
  WHEN host(inet_server_addr()) IS DISTINCT FROM :'owned_server_addr'
    THEN 'server address ' || COALESCE(host(inet_server_addr()), 'unknown') || ' is not the owned container'
  WHEN (SELECT system_identifier::text FROM pg_control_system()) IS DISTINCT FROM :'owned_system_id'
    THEN 'cluster system identifier is not the owned container''s'
  ELSE '' END AS rc2_refusal \gset
SELECT :'rc2_refusal' = '' AS rc2_owned \gset
\if :rc2_owned
\else
\echo REFUSED: :rc2_refusal
DO $$ BEGIN RAISE EXCEPTION 'consumer-journey fixture refused: not the owned local stack'; END $$;
\quit
\endif
SELECT :{?evidence_path_1} AND :{?evidence_path_2} AND :{?evidence_sha_1} AND :{?evidence_sha_2} AS rc2_evidence_given \gset
\if :rc2_evidence_given
\else
DO $$ BEGIN RAISE EXCEPTION 'consumer-journey fixture refused: evidence_path_1/2 and evidence_sha_1/2 not given'; END $$;
\quit
\endif

\ir f01-fixture.sql

BEGIN;
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '60s';
-- The activation blocks below re-check the owned cluster inside this transaction.
SELECT set_config('rc2.owned_system_id', :'owned_system_id', true),
       set_config('rc2.owned_server_addr', :'owned_server_addr', true) \gset
CREATE FUNCTION pg_temp.require_owned_cluster(what text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF (SELECT system_identifier::text FROM pg_control_system()) IS DISTINCT FROM current_setting('rc2.owned_system_id')
     OR host(inet_server_addr()) IS DISTINCT FROM current_setting('rc2.owned_server_addr') THEN
    RAISE EXCEPTION 'refusing % outside the owned local database container', what;
  END IF;
END $$;

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
-- Never run against Strata or the shared stack; migrations stay inactive.
-- ════════════════════════════════════════════════════════════════════════════
SELECT pg_temp.require_owned_cluster('the scope_editions activation');
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

-- ── Issued drawing evidence behind real uploaded files ─────────────────────
-- Plan rows inserted as service_acceptance_client_evidence_test.sql does; the
-- files are real objects the runner uploaded, never synthesized here.
SELECT set_config('rc2.evidence_path_1', :'evidence_path_1', true), set_config('rc2.evidence_path_2', :'evidence_path_2', true),
       set_config('rc2.evidence_sha_1', :'evidence_sha_1', true), set_config('rc2.evidence_sha_2', :'evidence_sha_2', true) \gset
CREATE TEMP TABLE rc2_evidence (issue_number integer, issue_id uuid, set_checksum text) ON COMMIT DROP;
SET LOCAL session_replication_role = replica;
DO $$
DECLARE
  project uuid := (SELECT (result->>'projectId')::uuid FROM rc2_origin);
  designer uuid := 'f0180000-0000-4000-8000-000000000002';
  path1 text := current_setting('rc2.evidence_path_1'); path2 text := current_setting('rc2.evidence_path_2');
  sha1 text := current_setting('rc2.evidence_sha_1'); sha2 text := current_setting('rc2.evidence_sha_2');
  d1 uuid := gen_random_uuid(); d2 uuid := gen_random_uuid(); s1 uuid := gen_random_uuid(); s2 uuid := gen_random_uuid();
  p1 uuid := gen_random_uuid(); p2 uuid := gen_random_uuid(); b uuid := gen_random_uuid();
  i1 uuid := gen_random_uuid(); i2 uuid := gen_random_uuid();
  set1 text; set2 text;
BEGIN
  IF (SELECT count(*) FROM storage.objects WHERE bucket_id = 'project-documents' AND name IN (path1, path2)) <> 2 THEN
    RAISE EXCEPTION 'RC2 fixture: evidence objects % and % were not uploaded to project-documents', path1, path2;
  END IF;
  set1 := encode(extensions.digest('rc2-set-1:' || sha1, 'sha256'), 'hex');
  set2 := encode(extensions.digest('rc2-set-2:' || sha1 || ':' || sha2, 'sha256'), 'hex');
  INSERT INTO public.project_documents (id, project_id, title, storage_path, client_visible, uploaded_by) VALUES
    (d1, project, 'RC2 fictional living room plan', path1, false, designer),
    (d2, project, 'RC2 fictional living room elevations', path2, false, designer);
  INSERT INTO public.plan_sheets (id, project_id, sheet_number, title, state, current_print_number, current_print_id, created_by) VALUES
    (s1, project, 'A-101', 'Living room plan', 'shared', 1, p1, designer),
    (s2, project, 'A-201', 'Living room elevations', 'shared', 1, p2, designer);
  INSERT INTO public.plan_print_batches (id, project_id, idempotency_key, request_hash, item_count, created_by)
  VALUES (b, project, 'rc2-batch-1', encode(extensions.digest('rc2-batch-' || project, 'sha256'), 'hex'), 2, designer);
  INSERT INTO public.plan_prints (id, sheet_id, batch_id, print_number, rev_letter, project_document_id, sha256, source, created_by) VALUES
    (p1, s1, b, 1, 'A', d1, sha1, 'upload', designer),
    (p2, s2, b, 1, 'A', d2, sha2, 'upload', designer);
  INSERT INTO public.plan_issues (id, project_id, issue_number, name, idempotency_key, request_hash, set_checksum,
    sheet_count, issued_at, created_by) VALUES
    (i1, project, 1, 'RC2 fictional drawing set', 'rc2-issue-1', repeat('e', 64), set1, 1, now(), designer),
    (i2, project, 2, 'RC2 fictional drawing set, revised', 'rc2-issue-2', repeat('d', 64), set2, 2, now(), designer);
  INSERT INTO public.plan_issue_prints (issue_id, sheet_id, print_id, sheet_number, sheet_title, rev_letter, sha256) VALUES
    (i1, s1, p1, 'A-101', 'Living room plan', 'A', sha1),
    (i2, s1, p1, 'A-101', 'Living room plan', 'A', sha1),
    (i2, s2, p2, 'A-201', 'Living room elevations', 'A', sha2);
  INSERT INTO rc2_evidence VALUES (1, i1, set1), (2, i2, set2);
END $$;
-- The delivered service, inserted directly as service_completion_test.sql does.
UPDATE public.project_phases SET status = 'completed', completed_at = COALESCE(completed_at, now())
WHERE project_id = (SELECT (result->>'projectId')::uuid FROM rc2_origin) AND status <> 'completed';
SET LOCAL session_replication_role = origin;

-- Native C1 mint, as the composing designer: one service_acceptance manifest per issue.
SELECT pg_temp.actor('f0180000-0000-4000-8000-000000000002');
DO $$
DECLARE project uuid := (SELECT (result->>'projectId')::uuid FROM rc2_origin); e record;
BEGIN
  FOR e IN SELECT * FROM rc2_evidence ORDER BY issue_number LOOP
    PERFORM public.create_evidence_manifest(project, NULL, 'service_acceptance',
      jsonb_build_array(jsonb_build_object('kind', 'plan_issue', 'id', e.issue_id, 'sha256', e.set_checksum,
        'version', e.issue_number)), 'rc2-sa-' || e.issue_number);
  END LOOP;
END $$;
SELECT pg_temp.actor(NULL);

-- ════════════════════════════════════════════════════════════════════════════
-- LOCAL-ONLY ACTIVATION (2 of 2): EXECUTE grants the shipped migrations
-- withhold while the capability is inactive (rc2-consumer-walk.md, verbatim
-- set). Refuses anything but the owned local database container.
-- ════════════════════════════════════════════════════════════════════════════
SELECT pg_temp.require_owned_cluster('the C4/C6 activation grants');
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

SELECT json_build_object('rc2_job', (result->>'projectId'), 'proposal', proposal_id,
  'manifests', (SELECT json_object_agg(m.idempotency_key, m.id) FROM public.evidence_manifests m
    WHERE m.project_id = (result->>'projectId')::uuid AND m.purpose = 'service_acceptance')) AS rc2_fixture FROM rc2_origin;
COMMIT;
