\set ON_ERROR_STOP on
BEGIN;
SET LOCAL search_path = public;

INSERT INTO organizations (id, name, slug, type) VALUES
  ('fb000000-0000-4000-8000-000000000001','R3 Studio A','r3-studio-a','design_studio'),
  ('fb000000-0000-4000-8000-000000000002','R3 Studio B','r3-studio-b','design_studio');

INSERT INTO auth.users (id, email, aud, role, instance_id)
VALUES ('fb000000-0000-4000-8000-0000000000a1','r3a@example.com','authenticated','authenticated','00000000-0000-0000-0000-000000000000'),
       ('fb000000-0000-4000-8000-0000000000a2','r3b@example.com','authenticated','authenticated','00000000-0000-0000-0000-000000000000'),
       ('fb000000-0000-4000-8000-0000000000a3','r3aadmin@example.com','authenticated','authenticated','00000000-0000-0000-0000-000000000000'),
       ('fb000000-0000-4000-8000-0000000000a4','r3amember@example.com','authenticated','authenticated','00000000-0000-0000-0000-000000000000');

INSERT INTO profiles (id, email, full_name) VALUES
  ('fb000000-0000-4000-8000-0000000000a1','r3a@example.com','A Owner'),
  ('fb000000-0000-4000-8000-0000000000a2','r3b@example.com','B Owner'),
  ('fb000000-0000-4000-8000-0000000000a3','r3aadmin@example.com','A Admin'),
  ('fb000000-0000-4000-8000-0000000000a4','r3amember@example.com','A Member')
ON CONFLICT (id) DO NOTHING;

INSERT INTO organization_members (organization_id, user_id, role, status) VALUES
  ('fb000000-0000-4000-8000-000000000001','fb000000-0000-4000-8000-0000000000a1','owner','active'),
  ('fb000000-0000-4000-8000-000000000001','fb000000-0000-4000-8000-0000000000a3','admin','active'),
  ('fb000000-0000-4000-8000-000000000001','fb000000-0000-4000-8000-0000000000a4','member','active'),
  ('fb000000-0000-4000-8000-000000000002','fb000000-0000-4000-8000-0000000000a2','owner','active');

INSERT INTO studio_contacts (id, organization_id, entity_kind, contact_kind, company_name, created_by) VALUES
  ('fb000000-0000-4000-8000-0000000000c1','fb000000-0000-4000-8000-000000000001','company','trade','R3 Firm A','fb000000-0000-4000-8000-0000000000a1'),
  ('fb000000-0000-4000-8000-0000000000c2','fb000000-0000-4000-8000-000000000002','company','trade','R3 Firm B','fb000000-0000-4000-8000-0000000000a2');
INSERT INTO studio_contacts (id, organization_id, entity_kind, contact_kind, full_name, created_by) VALUES
  ('fb000000-0000-4000-8000-0000000000c3','fb000000-0000-4000-8000-000000000001','person','trade','R3 Person A','fb000000-0000-4000-8000-0000000000a1');

INSERT INTO studio_compliance_documents
  (id, organization_id, holder_type, holder_id, doc_type, expires_on, blocks, source, inbound, verified_by, verified_at)
VALUES ('fb000000-0000-4000-8000-0000000000d1','fb000000-0000-4000-8000-000000000001','company',
        'fb000000-0000-4000-8000-0000000000c1','coi_gl', CURRENT_DATE + 200,
        ARRAY['site_access']::text[], 'studio', false,
        'fb000000-0000-4000-8000-0000000000a1', now());

SET LOCAL role = authenticated;
SELECT set_config('request.jwt.claims', json_build_object('sub','fb000000-0000-4000-8000-0000000000a1','role','authenticated')::text, true);

\echo '--- 1. mint by the firm own studio owner'
SELECT token ~ '^[0-9a-f]{64}$' AS raw_token_once, expires_at FROM public.mint_paperwork_link('fb000000-0000-4000-8000-0000000000c1', now() + interval '10 days');

\echo '--- 2. a member of ANOTHER studio may not mint on this firm'
SELECT set_config('request.jwt.claims', json_build_object('sub','fb000000-0000-4000-8000-0000000000a2','role','authenticated')::text, true);
DO $$
BEGIN
  PERFORM public.mint_paperwork_link('fb000000-0000-4000-8000-0000000000c1', now() + interval '10 days');
  RAISE EXCEPTION 'FAIL: cross-studio mint succeeded';
EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'PASS: cross-studio mint refused (%)', SQLERRM;
END $$;

\echo '--- 3. a PERSON card may not be minted a door'
SELECT set_config('request.jwt.claims', json_build_object('sub','fb000000-0000-4000-8000-0000000000a1','role','authenticated')::text, true);
DO $$
BEGIN
  PERFORM public.mint_paperwork_link('fb000000-0000-4000-8000-0000000000c3', now() + interval '10 days');
  RAISE EXCEPTION 'FAIL: person card minted a paperwork door';
EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'PASS: person card refused (%)', SQLERRM;
END $$;

\echo '--- 4. a firm with no engagement and NO named date is refused'
DO $$
BEGIN
  PERFORM public.mint_paperwork_link('fb000000-0000-4000-8000-0000000000c1', NULL);
  RAISE EXCEPTION 'FAIL: mint with no window succeeded';
EXCEPTION WHEN check_violation THEN RAISE NOTICE 'PASS: no-window mint refused (%)', SQLERRM;
END $$;

\echo '--- 5. a PAST named date is refused too'
DO $$
BEGIN
  PERFORM public.mint_paperwork_link('fb000000-0000-4000-8000-0000000000c1', now() - interval '1 day');
  RAISE EXCEPTION 'FAIL: past-dated mint succeeded';
EXCEPTION WHEN check_violation THEN RAISE NOTICE 'PASS: past-dated mint refused';
END $$;

\echo '--- 6. plain MEMBER of the firm studio may mint'
SELECT set_config('request.jwt.claims', json_build_object('sub','fb000000-0000-4000-8000-0000000000a4','role','authenticated')::text, true);
SELECT count(*) AS plain_member_minted FROM public.mint_paperwork_link('fb000000-0000-4000-8000-0000000000c1', now() + interval '9 days');

\echo '--- 7. R-AF: only one active token per firm'
RESET role;
SELECT count(*) FILTER (WHERE status='active') AS active, count(*) AS total
FROM paperwork_link_tokens WHERE company_id='fb000000-0000-4000-8000-0000000000c1';
ROLLBACK;
