-- RC-7 lane e2 (A20–A23): FICTIONAL, local-only jobs for the service
-- acceptance, paper, completion and care journeys of
-- rc7-e2-consumer-journey.journey.ts. It first applies
-- consumer-journey-fixture.sql (same target guard, F01 studio, RC2 actors, a
-- FRESH job A for the RC2 client), then, inside one transaction that re-checks
-- the owned cluster:
--
--   * LOCAL-ONLY ACTIVATION (3 of 3): the one C4 grant the base fixture does
--     not give (present_service_acceptance_offline, 00899), as
--     supabase/tests/round8/service_acceptance_activation_plan_test.sql lists.
--   * A third household member for the RC2 household (card -03 linked to the
--     fictional profile c2c20000-...-08 rc7-third@patina.test), so a signer can
--     be replaced through the UI with a person who can answer online.
--   * Job A (client-buy: pkg.living design=studio, purchasing=client,
--     installation=gc): its design phase is put back in progress (an included
--     obligation still open), plus one client-bought FF&E line and one
--     client-furnishing external fulfilment in pkg.living (both informational).
--   * Job P (paper): a client whose two required signers are household cards
--     with NO account (c2c26000-...-04/-05). It can only be presented on paper.
--   * Job F (full service): pkg.home design/purchasing/fabrication/installation
--     = studio, bound to a Design and a following Installation phase (both in progress),
--     one studio line in pkg.home (delivered, not installed), and pkg.cabinetry
--     EXCLUDED (gc) with one line in it.
--   * Job D (design only): pkg.design design=studio, purchasing/installation =
--     client, bound to a Design phase, then an unbound Final walkthrough phase
--     (both in progress); no lines, so the project can close; a project thread
--     for a later care question.
--   * Job F also carries an agreed fee not yet collected (5,000.00).
--   Each of P, F, D carries one issued drawing set behind the uploaded object
--   evidence_path_1 and a natively minted manifest 'rc7-sa-1'.
--
-- Applied only by rc7-e2-consumer-journey.journey.ts, with the owned identity
-- run-consumer-journey.mjs proved from Docker:
--   psql -X -v ON_ERROR_STOP=1 -v owned_port=... -v owned_server_addr=... -v owned_system_id=...
--     -v evidence_path_1/2=... -v evidence_sha_1/2=... <owned db url> -f rc7-e2-fixture.sql
-- Nothing here writes a request, response, paper intake, completion or
-- outbound row: the journeys produce those (UI or RPC as the real actor).
--
-- Fictional actors (password123):
-- third        c2c20000-0000-4000-8000-000000000008 rc7-third@patina.test        card c2c26000-...-03
-- paper client c2c20000-0000-4000-8000-000000000009 rc7-paper-client@patina.test cards -04/-05 (no account)
-- full client  c2c20000-0000-4000-8000-00000000000a rc7-full-client@patina.test
-- design client c2c20000-0000-4000-8000-00000000000b rc7-design-client@patina.test
\set ON_ERROR_STOP on
\ir consumer-journey-fixture.sql

BEGIN;
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '120s';
SELECT set_config('rc2.owned_system_id', :'owned_system_id', true),
       set_config('rc2.owned_server_addr', :'owned_server_addr', true),
       set_config('rc7.evidence_path', :'evidence_path_1', true),
       set_config('rc7.evidence_sha', :'evidence_sha_1', true) \gset
CREATE OR REPLACE FUNCTION pg_temp.require_owned_cluster(what text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF (SELECT system_identifier::text FROM pg_control_system()) IS DISTINCT FROM current_setting('rc2.owned_system_id')
     OR host(inet_server_addr()) IS DISTINCT FROM current_setting('rc2.owned_server_addr') THEN
    RAISE EXCEPTION 'refusing % outside the owned local database container', what;
  END IF;
END $$;
SELECT pg_temp.require_owned_cluster('the rc7-e2 fixture');

-- ════════════════════════════════════════════════════════════════════════════
-- LOCAL-ONLY ACTIVATION (3 of 3): the offline presentation grant (00899).
-- ════════════════════════════════════════════════════════════════════════════
GRANT EXECUTE ON FUNCTION public.present_service_acceptance_offline(uuid,text,text,text) TO authenticated;

-- ── Actors ─────────────────────────────────────────────────────────────────
INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change
)
SELECT '00000000-0000-0000-0000-000000000000', id, 'authenticated', 'authenticated',
       email, extensions.crypt('password123', extensions.gen_salt('bf')), now(),
       '{"provider":"email","providers":["email"]}'::jsonb,
       jsonb_build_object('full_name', name, 'role', 'homeowner'), now(), now(), '', '', '', ''
FROM (VALUES
  ('c2c20000-0000-4000-8000-000000000008'::uuid, 'rc7-third@patina.test', 'RC7 Fictional Third'),
  ('c2c20000-0000-4000-8000-000000000009'::uuid, 'rc7-paper-client@patina.test', 'RC7 Fictional Paper Client'),
  ('c2c20000-0000-4000-8000-00000000000a'::uuid, 'rc7-full-client@patina.test', 'RC7 Fictional Full Client'),
  ('c2c20000-0000-4000-8000-00000000000b'::uuid, 'rc7-design-client@patina.test', 'RC7 Fictional Design Client')
) AS actors(id, email, name)
ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email, encrypted_password = EXCLUDED.encrypted_password,
  email_confirmed_at = EXCLUDED.email_confirmed_at;
INSERT INTO auth.identities (id, user_id, provider_id, identity_data, provider, created_at, updated_at)
SELECT id, id, id::text, jsonb_build_object('sub', id, 'email', email), 'email', now(), now()
FROM auth.users WHERE id IN ('c2c20000-0000-4000-8000-000000000008', 'c2c20000-0000-4000-8000-000000000009',
  'c2c20000-0000-4000-8000-00000000000a', 'c2c20000-0000-4000-8000-00000000000b')
ON CONFLICT (provider_id, provider) DO UPDATE SET identity_data = EXCLUDED.identity_data;
INSERT INTO public.profiles (id, email, full_name, display_name, role, is_designer)
SELECT id, email, raw_user_meta_data->>'full_name', raw_user_meta_data->>'full_name', 'homeowner', false
FROM auth.users WHERE id IN ('c2c20000-0000-4000-8000-000000000008', 'c2c20000-0000-4000-8000-000000000009',
  'c2c20000-0000-4000-8000-00000000000a', 'c2c20000-0000-4000-8000-00000000000b')
ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email, full_name = EXCLUDED.full_name,
  display_name = EXCLUDED.display_name, role = EXCLUDED.role, is_designer = EXCLUDED.is_designer;

-- ── Cards, households, client relationships ───────────────────────────────
INSERT INTO public.studio_contacts (id, organization_id, entity_kind, contact_kind, full_name, profile_id) VALUES
  ('c2c26000-0000-4000-8000-000000000003', 'f0180000-0000-4000-8000-000000000001', 'person', 'client',
   'RC7 Fictional Third', 'c2c20000-0000-4000-8000-000000000008'),
  ('c2c26000-0000-4000-8000-000000000004', 'f0180000-0000-4000-8000-000000000001', 'person', 'client',
   'RC7 Paper Signer One', NULL),
  ('c2c26000-0000-4000-8000-000000000005', 'f0180000-0000-4000-8000-000000000001', 'person', 'client',
   'RC7 Paper Signer Two', NULL)
ON CONFLICT (id) DO UPDATE SET profile_id = EXCLUDED.profile_id, full_name = EXCLUDED.full_name;
UPDATE public.client_households SET member_person_ids = ARRAY['c2c26000-0000-4000-8000-000000000001',
  'c2c26000-0000-4000-8000-000000000002', 'c2c26000-0000-4000-8000-000000000003']::uuid[]
WHERE id = 'c2c27000-0000-4000-8000-000000000001';
INSERT INTO public.client_households (id, organization_id, designer_id, display_name, member_person_ids)
VALUES ('c2c27000-0000-4000-8000-000000000002', 'f0180000-0000-4000-8000-000000000001',
  'f0180000-0000-4000-8000-000000000002', 'RC7 Fictional Paper Household',
  ARRAY['c2c26000-0000-4000-8000-000000000004', 'c2c26000-0000-4000-8000-000000000005']::uuid[])
ON CONFLICT (id) DO UPDATE SET member_person_ids = EXCLUDED.member_person_ids;
INSERT INTO public.designer_clients (id, designer_id, client_id, client_name, client_email, status, source, household_id)
VALUES
  ('c2c22000-0000-4000-8000-000000000002', 'f0180000-0000-4000-8000-000000000002',
   'c2c20000-0000-4000-8000-000000000009', 'RC7 Fictional Paper Client', 'rc7-paper-client@patina.test', 'active', 'direct',
   'c2c27000-0000-4000-8000-000000000002'),
  ('c2c22000-0000-4000-8000-000000000003', 'f0180000-0000-4000-8000-000000000002',
   'c2c20000-0000-4000-8000-00000000000a', 'RC7 Fictional Full Client', 'rc7-full-client@patina.test', 'active', 'direct', NULL),
  ('c2c22000-0000-4000-8000-000000000004', 'f0180000-0000-4000-8000-000000000002',
   'c2c20000-0000-4000-8000-00000000000b', 'RC7 Fictional Design Client', 'rc7-design-client@patina.test', 'active', 'direct', NULL)
ON CONFLICT (id) DO UPDATE SET status = 'active', household_id = EXCLUDED.household_id, client_email = EXCLUDED.client_email;

-- ── Composition: draft -> send -> client signs -> designer countersigns ────
-- packages: scope_package payloads; "$design" / "$install" in a serviceBindings
-- array stand for the proposal's Design / Installation phase ids.
CREATE TEMP TABLE rc7_jobs (tag text PRIMARY KEY, proposal_id uuid, project_id uuid) ON COMMIT DROP;
GRANT ALL ON rc7_jobs TO authenticated;
CREATE FUNCTION pg_temp.rc7_compose(tag text, client uuid, relationship uuid, job_title text, packages jsonb, signers jsonb,
  second_phase text)
RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE
  designer uuid := 'f0180000-0000-4000-8000-000000000002';
  p uuid := gen_random_uuid(); design_phase uuid; install_phase uuid; parts jsonb; snapshot jsonb; result jsonb;
BEGIN
  PERFORM pg_temp.actor(designer);
  INSERT INTO public.proposals (id, designer_id, designer_client_id, client_id, title, total_amount, status, valid_until)
  VALUES (p, designer, relationship, client, job_title, 0, 'draft', now() + interval '30 days');
  INSERT INTO public.proposal_phases (proposal_id, name, phase_key, duration_days, lane, fee_cents, sort_order)
  VALUES (p, 'Design', 'design-development', 5, 'main', 0, 0) RETURNING id INTO design_phase;
  -- Every agreed phase counts (00898): the full-service job adds Installation
  -- (bound to its package), the design-only job a Final walkthrough (unbound).
  IF second_phase IS NOT NULL THEN
    INSERT INTO public.proposal_phases (proposal_id, name, phase_key, duration_days, lane, fee_cents, sort_order,
      follows_phase_id)
    VALUES (p, CASE second_phase WHEN 'installation' THEN 'Installation' ELSE 'Final walkthrough' END, second_phase,
      3, 'main', 0, 1, design_phase) RETURNING id INTO install_phase;
  END IF;
  PERFORM public.upsert_design_services_draft(p, jsonb_build_object('scope', 'Fictional interior design services',
    'deliverables', jsonb_build_array('Selections'), 'exclusions', '[]'::jsonb, 'billingCeilingCents', 100000,
    'retainerAmountCents', 0, 'retainerActivationPolicy', 'immediate', 'billingCadence', 'monthly',
    'currency', 'USD', 'terms', 'Signed actual hours', 'currentRateVersion', 1),
    jsonb_build_array(jsonb_build_object('version', 1, 'roleName', 'Designer', 'hourlyRateCents', 12000,
      'sortOrder', 0, 'effectiveAt', now() - interval '1 day')));
  PERFORM public.materialize_standard_parts(p);
  parts := replace(replace(packages::text, '"$design"', to_jsonb(design_phase::text)::text),
    '"$install"', COALESCE(to_jsonb(install_phase::text)::text, 'null'))::jsonb;
  PERFORM public.upsert_agreement_parts(p,
    COALESCE((SELECT jsonb_agg(jsonb_build_object('kind', kind, 'variant', variant, 'partKey', part_key, 'title', title,
      'payload', payload, 'required', required, 'clientVisible', client_visible) ORDER BY position)
      FROM public.proposal_agreement_parts WHERE proposal_id = p), '[]'::jsonb)
    || parts || jsonb_build_array(jsonb_build_object('kind', 'acceptance_signer_policy', 'partKey', 'scope.signers',
      'title', 'Signers', 'payload', jsonb_build_object('policyRevision', 1, 'signers', signers))),
    'rc7 e2 fixture');
  SET LOCAL ROLE authenticated;
  snapshot := public.get_commercial_document_send_snapshot(p);
  PERFORM public.send_commercial_document(p, snapshot->>'documentFingerprint', NULL, now() + interval '30 days');
  PERFORM pg_temp.actor(client);
  PERFORM public.sign_design_services_agreement(p, 'RC7 Fictional Client');
  PERFORM pg_temp.actor(designer);
  result := public.countersign_design_services_agreement(p, 'F01 Fictional Designer');
  RESET ROLE;
  IF (result->>'projectId') IS NULL THEN RAISE EXCEPTION 'rc7 fixture: % composed no project', tag; END IF;
  INSERT INTO rc7_jobs VALUES (tag, p, (result->>'projectId')::uuid);
  RETURN (result->>'projectId')::uuid;
END $$;

SELECT pg_temp.rc7_compose('paper', 'c2c20000-0000-4000-8000-000000000009', 'c2c22000-0000-4000-8000-000000000002',
  'RC7 Fictional Paper Job', jsonb_build_array(jsonb_build_object('kind', 'scope_package', 'partKey', 'scope.living',
    'title', 'Living room', 'payload', jsonb_build_object('packageKey', 'pkg.living', 'label', 'Living room',
      'inclusion', 'included', 'responsibilities', jsonb_build_object('design', 'studio', 'purchasing', 'client',
        'payer', 'client', 'fabrication_contract', 'gc', 'installation', 'gc'),
      'serviceBindings', jsonb_build_object('design', jsonb_build_array('$design'))))),
  jsonb_build_array(
    jsonb_build_object('slot', 'client', 'required', true, 'householdPersonId', 'c2c26000-0000-4000-8000-000000000004'),
    jsonb_build_object('slot', 'partner', 'required', true, 'householdPersonId', 'c2c26000-0000-4000-8000-000000000005')),
  NULL);

SELECT pg_temp.rc7_compose('full', 'c2c20000-0000-4000-8000-00000000000a', 'c2c22000-0000-4000-8000-000000000003',
  'RC7 Fictional Full Service Job', jsonb_build_array(
    jsonb_build_object('kind', 'scope_package', 'partKey', 'scope.home', 'title', 'Whole home', 'payload',
      jsonb_build_object('packageKey', 'pkg.home', 'label', 'Whole home', 'inclusion', 'included',
        'responsibilities', jsonb_build_object('design', 'studio', 'purchasing', 'studio', 'payer', 'client',
          'fabrication_contract', 'studio', 'installation', 'studio'),
        'serviceBindings', jsonb_build_object('design', jsonb_build_array('$design'),
          'installation', jsonb_build_array('$install')))),
    jsonb_build_object('kind', 'scope_package', 'partKey', 'scope.cabinetry', 'title', 'Cabinetry', 'payload',
      jsonb_build_object('packageKey', 'pkg.cabinetry', 'label', 'Cabinetry', 'inclusion', 'excluded',
        'responsibilities', jsonb_build_object('design', 'none', 'purchasing', 'client', 'payer', 'client',
          'fabrication_contract', 'gc', 'installation', 'gc')))),
  jsonb_build_array(jsonb_build_object('slot', 'client', 'required', true,
    'profileId', 'c2c20000-0000-4000-8000-00000000000a')), 'installation');

SELECT pg_temp.rc7_compose('design', 'c2c20000-0000-4000-8000-00000000000b', 'c2c22000-0000-4000-8000-000000000004',
  'RC7 Fictional Design Only Job', jsonb_build_array(
    jsonb_build_object('kind', 'scope_package', 'partKey', 'scope.design', 'title', 'Design only', 'payload',
      jsonb_build_object('packageKey', 'pkg.design', 'label', 'Design only', 'inclusion', 'included',
        'responsibilities', jsonb_build_object('design', 'studio', 'purchasing', 'client', 'payer', 'client',
          'fabrication_contract', 'client', 'installation', 'client'),
        'serviceBindings', jsonb_build_object('design', jsonb_build_array('$design'))))),
  jsonb_build_array(jsonb_build_object('slot', 'client', 'required', true,
    'profileId', 'c2c20000-0000-4000-8000-00000000000b')), 'final_walkthrough');

INSERT INTO rc7_jobs (tag, project_id)
SELECT 'a', id FROM public.projects WHERE client_id = 'c2c20000-0000-4000-8000-000000000005'
ORDER BY created_at DESC LIMIT 1;

-- ── Delivered state, evidence and lines (inserted as the C6 suites do) ─────
CREATE TEMP TABLE rc7_evidence (project_id uuid, issue_id uuid, set_checksum text) ON COMMIT DROP;
SET LOCAL session_replication_role = replica;
DO $$
DECLARE
  designer uuid := 'f0180000-0000-4000-8000-000000000002';
  path1 text := current_setting('rc7.evidence_path'); sha1 text := current_setting('rc7.evidence_sha');
  j record; d uuid; s uuid; pr uuid; b uuid; i uuid; set1 text;
  job_a uuid := (SELECT project_id FROM rc7_jobs WHERE tag = 'a');
  edition_a uuid; thread uuid;
BEGIN
  -- Paper job: its single bound phase is delivered. Full and design-only:
  -- Design is in progress and its successor pending (advance_project_phase
  -- starts the successor; the designer completes both in the leg).
  UPDATE public.project_phases SET status = 'completed', completed_at = COALESCE(completed_at, now())
  WHERE project_id = (SELECT project_id FROM rc7_jobs WHERE tag = 'paper');
  UPDATE public.project_phases SET status = CASE WHEN follows_phase_id IS NULL THEN 'in_progress' ELSE 'pending' END,
    completed_at = NULL
  WHERE project_id IN (SELECT project_id FROM rc7_jobs WHERE tag IN ('full', 'design'));
  -- Job A: the agreed design phase is open again (an included obligation).
  UPDATE public.project_phases SET status = 'in_progress', completed_at = NULL WHERE project_id = job_a;

  FOR j IN SELECT * FROM rc7_jobs WHERE tag IN ('paper', 'full', 'design') LOOP
    d := gen_random_uuid(); s := gen_random_uuid(); pr := gen_random_uuid(); b := gen_random_uuid(); i := gen_random_uuid();
    set1 := encode(extensions.digest('rc7-set-1:' || j.project_id || ':' || sha1, 'sha256'), 'hex');
    INSERT INTO public.project_documents (id, project_id, title, storage_path, client_visible, uploaded_by)
    VALUES (d, j.project_id, 'RC7 fictional plan', path1, false, designer);
    INSERT INTO public.plan_sheets (id, project_id, sheet_number, title, state, current_print_number, current_print_id, created_by)
    VALUES (s, j.project_id, 'A-101', 'Plan', 'shared', 1, pr, designer);
    INSERT INTO public.plan_print_batches (id, project_id, idempotency_key, request_hash, item_count, created_by)
    VALUES (b, j.project_id, 'rc7-batch-1', encode(extensions.digest('rc7-batch-' || j.project_id, 'sha256'), 'hex'), 1, designer);
    INSERT INTO public.plan_prints (id, sheet_id, batch_id, print_number, rev_letter, project_document_id, sha256, source, created_by)
    VALUES (pr, s, b, 1, 'A', d, sha1, 'upload', designer);
    INSERT INTO public.plan_issues (id, project_id, issue_number, name, idempotency_key, request_hash, set_checksum,
      sheet_count, issued_at, created_by)
    VALUES (i, j.project_id, 1, 'RC7 fictional drawing set', 'rc7-issue-1', repeat('c', 64), set1, 1, now(), designer);
    INSERT INTO public.plan_issue_prints (issue_id, sheet_id, print_id, sheet_number, sheet_title, rev_letter, sha256)
    VALUES (i, s, pr, 'A-101', 'Plan', 'A', sha1);
    INSERT INTO rc7_evidence VALUES (j.project_id, i, set1);
  END LOOP;

  -- Lines: id = selection thread, as service_completion_test.sql seeds them.
  INSERT INTO public.project_ffe_items (id, project_id, name, selection_thread_id, status, scope_package_key,
    external_fulfilment_id, design_disposition)
  SELECT x.id, x.project_id, x.name, x.id, x.status, x.pkg, NULL, 'selected' FROM (VALUES
    (gen_random_uuid(), (SELECT project_id FROM rc7_jobs WHERE tag = 'full'), 'RC7 studio sofa', 'delivered', 'pkg.home'),
    (gen_random_uuid(), (SELECT project_id FROM rc7_jobs WHERE tag = 'full'), 'RC7 kitchen run', 'ordered', 'pkg.cabinetry'),
    (gen_random_uuid(), job_a, 'RC7 client-bought chair', 'delivered', 'pkg.living')
  ) AS x(id, project_id, name, status, pkg);
  -- Each line is its thread's primary, so the real install RPC's thread-consistency trigger holds.
  INSERT INTO public.project_ffe_selection_threads (id, project_id, primary_ffe_item_id, created_by)
  SELECT f.id, f.project_id, f.id, designer FROM public.project_ffe_items f
  WHERE f.name IN ('RC7 studio sofa', 'RC7 kitchen run', 'RC7 client-bought chair')
    AND f.project_id IN (SELECT project_id FROM rc7_jobs);

  -- Job A: a client furnishing outside the studio's service, still in progress.
  SELECT id INTO edition_a FROM public.project_scope_editions WHERE project_id = job_a AND status = 'active';
  INSERT INTO public.project_external_fulfilments (id, project_id, scope_edition_id, package_key, units, kind,
    buyer_party_kind, payer_party_kind, contracting_party_kind, status, created_by, client_request_id, request_hash)
  VALUES (gen_random_uuid(), job_a, edition_a, 'pkg.living', ARRAY['u1'], 'client_furnishing', 'client', 'client',
    'none', 'received', designer, 'rc7-ful-' || job_a, repeat('0', 64));

  -- Job F: an agreed fee not yet collected (the financial hold on closure).
  UPDATE public.projects SET total_amount_cents = 500000 WHERE id = (SELECT project_id FROM rc7_jobs WHERE tag = 'full');

  -- Job D: the project thread a later care question arrives on.
  INSERT INTO public.comms_threads (id, kind, project_id, title, created_by)
  VALUES (gen_random_uuid(), 'project', (SELECT project_id FROM rc7_jobs WHERE tag = 'design'), 'RC7 fictional care',
    designer) RETURNING id INTO thread;
  INSERT INTO public.comms_thread_participants (thread_id, profile_id, role) VALUES
    (thread, designer, 'designer'), (thread, 'c2c20000-0000-4000-8000-00000000000b', 'client');
END $$;
SET LOCAL session_replication_role = origin;

-- Native C1 mint, as the composing designer.
SELECT pg_temp.actor('f0180000-0000-4000-8000-000000000002');
DO $$
DECLARE e record;
BEGIN
  FOR e IN SELECT * FROM rc7_evidence LOOP
    PERFORM public.create_evidence_manifest(e.project_id, NULL, 'service_acceptance',
      jsonb_build_array(jsonb_build_object('kind', 'plan_issue', 'id', e.issue_id, 'sha256', e.set_checksum,
        'version', 1)), 'rc7-sa-1');
  END LOOP;
END $$;
SELECT pg_temp.actor(NULL);

SELECT json_build_object('rc7_jobs', (SELECT json_object_agg(tag, project_id) FROM rc7_jobs)) AS rc7_fixture;
COMMIT;
